import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createHash, randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { opendir, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import dayjs from 'dayjs';
import { Prisma, type PaymentProofAsset } from '@prisma/client';
import { IdempotencyService } from '../../common/idempotency/idempotency-key';
import { validateImageContent } from '../../common/media/image-content-validation';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { resolveMediaStorageRoots } from '../upload/media-storage-paths';
import { resolveCustomerPaymentProof } from './payment-proof-storage';
import {
  MAX_PAYMENT_PROOF_DB_GC_BATCH,
  MAX_PAYMENT_PROOF_LEGACY_DELETE_BATCH,
  MAX_PAYMENT_PROOF_LEGACY_SCAN_BATCH,
  MAX_UNATTACHED_PAYMENT_PROOFS_PER_CUSTOMER,
} from './payment-proof-policy';
import type { CustomerPrincipal } from '../../common/security/authenticated-principal';
import { lockActiveCustomerForWrite } from '../customers/customer-write-gate';

const PAYMENT_PROOF_ORPHAN_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PAYMENT_PROOF_SIZE = 10 * 1024 * 1024;
const ALLOWED_PAYMENT_PROOF_TYPES = new Map([
  ['image/jpeg', { format: 'jpeg', extension: '.jpg' }],
  ['image/png', { format: 'png', extension: '.png' }],
  ['image/webp', { format: 'webp', extension: '.webp' }],
  ['image/gif', { format: 'gif', extension: '.gif' }],
]);

type StoredSubmission = Pick<
  PaymentProofAsset,
  | 'id'
  | 'storageKey'
  | 'customerId'
  | 'submissionOrderId'
  | 'submissionKeyHash'
  | 'fileChecksumSha256'
  | 'fileSize'
  | 'mimeType'
  | 'status'
>;

@Injectable()
export class PaymentProofsService implements OnModuleInit {
  private readonly logger = new Logger(PaymentProofsService.name);
  private readonly paymentProofRoot = resolveMediaStorageRoots().paymentProofRoot;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async onModuleInit() {
    await this.cleanupOrphanedPaymentProofs();
  }

  private async prepareSubmission(
    principal: Pick<CustomerPrincipal, 'id' | 'authVersion'>,
    orderId: number,
    file: Express.Multer.File,
    rawIdempotencyKey: string,
  ): Promise<StoredSubmission> {
    const customerId = principal.id;
    if (!file) throw new BadRequestException('未选择文件');
    const expected = ALLOWED_PAYMENT_PROOF_TYPES.get(file.mimetype);
    if (!expected) throw new BadRequestException(`不支持的文件类型: ${file.mimetype}`);
    if (file.buffer.length === 0 || file.size !== file.buffer.length) {
      throw new BadRequestException('文件内容为空或大小不一致');
    }
    if (file.size > MAX_PAYMENT_PROOF_SIZE) {
      throw new BadRequestException('文件大小不能超过 10MB');
    }
    await validateImageContent(file.buffer, expected.format);

    const fileChecksumSha256 = createHash('sha256').update(file.buffer).digest('hex');
    const submissionKeyHash = this.idempotency.scopedHash(
      `payment-proof.customer.${customerId}`,
      rawIdempotencyKey,
    );
    const dateSegment = dayjs().format('YYYY/MM/DD');
    const directory = join(this.paymentProofRoot, String(customerId), dateSegment);
    if (!existsSync(directory)) mkdirSync(directory, { recursive: true });

    let createdAbsolutePath: string | null = null;
    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockActiveCustomerForWrite(tx, principal);
        const existing = await tx.paymentProofAsset.findUnique({
          where: { submissionKeyHash },
          select: {
            id: true,
            storageKey: true,
            customerId: true,
            submissionOrderId: true,
            submissionKeyHash: true,
            fileChecksumSha256: true,
            fileSize: true,
            mimeType: true,
            status: true,
          },
        });
        if (existing) {
          if (
            existing.customerId !== customerId
            || existing.submissionOrderId !== orderId
            || existing.fileChecksumSha256 !== fileChecksumSha256
            || existing.fileSize !== file.size
            || existing.mimeType !== file.mimetype
          ) {
            throw new ConflictException('该 Idempotency-Key 已用于不同的付款凭证请求');
          }
          if (existing.status === 'DELETING') {
            throw new ConflictException('该付款凭证正在清理，请稍后重新提交');
          }
          return existing;
        }

        const unattachedCount = await tx.paymentProofAsset.count({
          where: { customerId, status: 'UPLOADED', orderId: null },
        });
        if (unattachedCount >= MAX_UNATTACHED_PAYMENT_PROOFS_PER_CUSTOMER) {
          throw new HttpException(
            `未完成关联的付款凭证已达 ${MAX_UNATTACHED_PAYMENT_PROOFS_PER_CUSTOMER} 个，请等待失败记录清理后重试`,
            429,
          );
        }

        const filename = `${randomUUID()}${expected.extension}`;
        const storageKey = join(String(customerId), dateSegment, filename).replace(/\\/g, '/');
        createdAbsolutePath = join(directory, filename);
        await writeFile(createdAbsolutePath, file.buffer);
        return tx.paymentProofAsset.create({
          data: {
            storageKey,
            customerId,
            submissionOrderId: orderId,
            submissionKeyHash,
            fileChecksumSha256,
            fileSize: file.size,
            mimeType: file.mimetype,
            fileReadyAt: new Date(),
            status: 'UPLOADED',
          },
          select: {
            id: true,
            storageKey: true,
            customerId: true,
            submissionOrderId: true,
            submissionKeyHash: true,
            fileChecksumSha256: true,
            fileSize: true,
            mimeType: true,
            status: true,
          },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (createdAbsolutePath) {
        try {
          const persisted = await this.prisma.paymentProofAsset.findUnique({
            where: { submissionKeyHash },
            select: { id: true },
          });
          if (!persisted) await unlink(createdAbsolutePath).catch(() => undefined);
        } catch {
          // 事务结果不确定时保留文件；有界 legacy 扫描会在确认无记录后回收。
        }
      }
      throw error;
    }
  }

  async uploadAndSubmit(
    principal: Pick<CustomerPrincipal, 'id' | 'authVersion'>,
    orderId: number,
    file: Express.Multer.File,
    idempotencyKey: string,
  ) {
    const customerId = principal.id;
    const submission = await this.prepareSubmission(principal, orderId, file, idempotencyKey);
    try {
      return await this.ordersService.submitOfflinePaymentProof(
        principal,
        orderId,
        submission.id,
        submission.storageKey,
        { type: 'CUSTOMER', id: customerId },
      );
    } catch (error) {
      await this.discardUploaded(
        submission.id,
        customerId,
        submission.storageKey,
      ).catch(() => undefined);
      throw error;
    }
  }

  private async discardUploaded(
    assetId: number,
    customerId: number,
    storageKey: string,
  ): Promise<boolean> {
    const deletingAt = new Date();
    const claimed = await this.prisma.paymentProofAsset.updateMany({
      where: { id: assetId, customerId, storageKey, status: 'UPLOADED', orderId: null },
      data: { status: 'DELETING', deletingAt },
    });
    if (claimed.count !== 1) return false;
    return this.finalizeDeleting({
      id: assetId,
      customerId,
      storageKey,
      status: 'DELETING',
    });
  }

  private async finalizeDeleting(
    asset: Pick<PaymentProofAsset, 'id' | 'customerId' | 'storageKey' | 'status'>,
  ): Promise<boolean> {
    if (asset.status !== 'DELETING') return false;
    const resolved = resolveCustomerPaymentProof(
      asset.customerId,
      asset.storageKey,
      this.paymentProofRoot,
    );
    if (!resolved) return false;
    try {
      await unlink(resolved.absolutePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return false;
    }
    const deleted = await this.prisma.paymentProofAsset.deleteMany({
      where: { id: asset.id, status: 'DELETING', orderId: null },
    });
    return deleted.count === 1;
  }

  private async *walkPaymentProofFiles(
    directory = this.paymentProofRoot,
    segments: string[] = [],
  ): AsyncGenerator<{ customerId: number; storageKey: string }> {
    let handle;
    try {
      handle = await opendir(directory);
    } catch {
      return;
    }
    for await (const entry of handle) {
      if (entry.isSymbolicLink()) continue;
      const nextSegments = [...segments, entry.name];
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory() && nextSegments.length < 5) {
        yield* this.walkPaymentProofFiles(absolutePath, nextSegments);
        continue;
      }
      if (!entry.isFile() || nextSegments.length !== 5) continue;
      const customerId = Number(nextSegments[0]);
      const storageKey = nextSegments.join('/');
      if (
        !Number.isInteger(customerId)
        || !resolveCustomerPaymentProof(customerId, storageKey, this.paymentProofRoot)
      ) continue;
      yield { customerId, storageKey };
    }
  }

  private storageKeyOlderThan(storageKey: string, cutoff: Date): boolean {
    const [, year, month, day] = storageKey.split('/');
    const timestamp = Date.UTC(Number(year), Number(month) - 1, Number(day));
    return Number.isFinite(timestamp) && timestamp <= cutoff.getTime();
  }

  /**
   * 旧双写入口已下线；D62 会回填全部已引用文件。持久 offset 让每轮只检查固定数量，
   * 确认未登记且超过宽限期的文件先进入 DELETING，失败项由后续轮次重试。
   */
  private async purgeLegacyUntrackedFiles(now: Date): Promise<number> {
    const state = await this.prisma.paymentProofGcState.upsert({
      where: { id: 1 },
      create: { id: 1, scanOffset: 0 },
      update: {},
      select: { scanOffset: true },
    });
    const cutoff = new Date(now.getTime() - PAYMENT_PROOF_ORPHAN_GRACE_MS);
    let skipped = 0;
    let examined = 0;
    let deleted = 0;
    let reachedEnd = true;
    for await (const file of this.walkPaymentProofFiles()) {
      if (skipped < state.scanOffset) {
        skipped += 1;
        continue;
      }
      if (examined >= MAX_PAYMENT_PROOF_LEGACY_SCAN_BATCH) {
        reachedEnd = false;
        break;
      }
      examined += 1;
      if (!this.storageKeyOlderThan(file.storageKey, cutoff)) continue;
      try {
        const existing = await this.prisma.paymentProofAsset.findUnique({
          where: { storageKey: file.storageKey },
          select: { id: true },
        });
        if (existing || deleted >= MAX_PAYMENT_PROOF_LEGACY_DELETE_BATCH) continue;
        const customer = await this.prisma.customer.findUnique({
          where: { id: file.customerId },
          select: { id: true },
        });
        if (!customer) {
          const resolved = resolveCustomerPaymentProof(
            file.customerId,
            file.storageKey,
            this.paymentProofRoot,
          );
          if (resolved) await unlink(resolved.absolutePath).catch(() => undefined);
          deleted += 1;
          continue;
        }
        const created = await this.prisma.paymentProofAsset.createMany({
          data: [{
            storageKey: file.storageKey,
            customerId: file.customerId,
            fileReadyAt: now,
            status: 'DELETING',
            deletingAt: now,
          }],
          skipDuplicates: true,
        });
        if (created.count !== 1) continue;
        const asset = await this.prisma.paymentProofAsset.findUnique({
          where: { storageKey: file.storageKey },
          select: { id: true, customerId: true, storageKey: true, status: true },
        });
        if (asset && await this.finalizeDeleting(asset)) deleted += 1;
      } catch {
        this.logger.warn('单个旧付款凭证处理失败，已跳过并保留供后续轮次重试');
      }
    }
    await this.prisma.paymentProofGcState.update({
      where: { id: 1 },
      data: { scanOffset: reachedEnd ? 0 : state.scanOffset + examined },
    });
    return deleted;
  }

  /** GC 只从持久化状态 CAS 到 DELETING，再处理文件；不以 mtime 充当锁。 */
  async purgeOrphans(now = new Date()): Promise<number> {
    let removed = await this.purgeLegacyUntrackedFiles(now);

    const interrupted = await this.prisma.paymentProofAsset.findMany({
      where: { status: 'DELETING', orderId: null },
      orderBy: { id: 'asc' },
      take: MAX_PAYMENT_PROOF_DB_GC_BATCH,
      select: { id: true, customerId: true, storageKey: true, status: true },
    });
    for (const asset of interrupted) {
      try {
        if (await this.finalizeDeleting(asset)) removed += 1;
      } catch {
        this.logger.warn('单个 DELETING 付款凭证清理失败，已保留供下轮重试');
      }
    }

    const cutoff = new Date(now.getTime() - PAYMENT_PROOF_ORPHAN_GRACE_MS);
    const candidates = await this.prisma.paymentProofAsset.findMany({
      where: { status: 'UPLOADED', orderId: null, createdAt: { lte: cutoff } },
      orderBy: { id: 'asc' },
      take: MAX_PAYMENT_PROOF_DB_GC_BATCH,
      select: { id: true, customerId: true, storageKey: true, status: true },
    });
    for (const asset of candidates) {
      try {
        const claimed = await this.prisma.paymentProofAsset.updateMany({
          where: { id: asset.id, status: 'UPLOADED', orderId: null },
          data: { status: 'DELETING', deletingAt: now },
        });
        if (claimed.count !== 1) continue;
        if (await this.finalizeDeleting({ ...asset, status: 'DELETING' })) removed += 1;
      } catch {
        this.logger.warn('单个 UPLOADED 付款凭证清理失败，已保留供下轮重试');
      }
    }
    return removed;
  }

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async cleanupOrphanedPaymentProofs() {
    try {
      const removed = await this.purgeOrphans();
      if (removed > 0) this.logger.log(`已回收 ${removed} 个未关联付款凭证`);
    } catch {
      this.logger.error('付款凭证孤儿回收失败，文件已保留并等待下次重试');
    }
  }
}
