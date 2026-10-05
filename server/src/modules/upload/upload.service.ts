import { Injectable, BadRequestException, ConflictException, NotFoundException, OnModuleInit } from '@nestjs/common';
import { basename, dirname, join, relative, resolve, sep, extname, isAbsolute } from 'path';
import { constants as fsConstants, existsSync, mkdirSync } from 'fs';
import { copyFile, readFile, readdir, rename, stat, unlink, writeFile } from 'fs/promises';
import { createHash, randomUUID } from 'crypto';
import dayjs from 'dayjs';
import { Prisma, type MediaAsset, type MediaAssetAuthorization, type MediaAssetStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { validateImageContent } from '../../common/media/image-content-validation';
import { resolveMediaStorageRoots } from './media-storage-paths';
import { MediaAuthorizationService } from './media-authorization.service';
import { evaluateMediaPublicEligibility, MediaPublicEligibility } from './media-public-eligibility';
import { normalizedCropToPixels, type NormalizedCropRect } from './crop-geometry';
import {
  assertSafeDesignFile,
  readVerifiedDesignMediaAsset,
  resolveDesignMediaPath,
  type DesignMediaAssetDescriptor,
} from './design-file-media';
import {
  isResponsivePublicImageWidth,
  resizePublicImageBuffer,
} from './responsive-public-media';
import type { CustomerPrincipal, StaffPrincipal } from '../../common/security/authenticated-principal';
import { lockAuthorizedStaffForPayment } from '../../common/security/staff-payment-authorization';
import { lockActiveCustomerForRead } from '../customers/customer-write-gate';
import {
  lockAuthorizedMediaStaff,
  normalizeMediaStaffActor,
  type MediaStaffAccess,
  type MediaStaffActorInput,
} from './media-staff-authorization';
const sharp = require('sharp');

const CHECKSUM_MISMATCH_QUARANTINE_REASON = 'CHECKSUM_MISMATCH';
const RESPONSIVE_PUBLIC_MEDIA_CACHE_TTL_MS = 5 * 60_000;
const RESPONSIVE_PUBLIC_MEDIA_CACHE_MAX_ENTRIES = 64;

export type PageMediaType = 'image' | 'video';

export type PageMediaItem = {
  id: number;
  url: string;
  name: string;
  type: PageMediaType;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  createdAt: Date;
  status: MediaAssetStatus;
  available: boolean;
  integrityCheckedAt?: Date;
  quarantineReason?: string;
  previewUrl: string;
  publicUrl: string | null;
  authorization: {
    reviewStatus: MediaAssetAuthorization['reviewStatus'];
    revocationStatus: MediaAssetAuthorization['revocationStatus'];
    revision: number;
    publicUseEpoch: number;
    sourceType: MediaAssetAuthorization['sourceType'];
    validUntil?: Date;
  } | null;
  publicEligibility: MediaPublicEligibility;
};

export type StoredPageMedia = PageMediaItem & {
  filename: string;
  format?: string;
  deduplicated: boolean;
};

@Injectable()
export class UploadService implements OnModuleInit {
  private readonly storageRoots = resolveMediaStorageRoots();
  private readonly uploadDir = this.storageRoots.publicRoot;
  private readonly archivedPageMediaRoot = this.storageRoots.archiveRoot;
  private readonly paymentProofRoot = this.storageRoots.paymentProofRoot;
  private readonly allowedTypes = new Map([
    ['image/jpeg', { format: 'jpeg', extension: '.jpg' }],
    ['image/png', { format: 'png', extension: '.png' }],
    ['image/webp', { format: 'webp', extension: '.webp' }],
    ['image/gif', { format: 'gif', extension: '.gif' }],
  ]);
  private readonly maxSize = 10 * 1024 * 1024; // 10MB
  private readonly maxVideoSize = 100 * 1024 * 1024;
  private readonly responsivePublicMediaCache = new Map<
    string,
    { expiresAt: number; value: { buffer: Buffer; mimeType: string } }
  >();
  private readonly responsivePublicMediaInFlight = new Map<
    string,
    Promise<{ buffer: Buffer; mimeType: string }>
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaAuthorizationService: MediaAuthorizationService,
  ) {
    if (!existsSync(this.uploadDir)) {
      mkdirSync(this.uploadDir, { recursive: true });
    }
    // Create subdirectories by date
    const dateDir = this.getDateDir();
    if (!existsSync(dateDir)) {
      mkdirSync(dateDir, { recursive: true });
    }
  }

  private getDateDir(): string {
    return join(this.uploadDir, dayjs().format('YYYY/MM/DD'));
  }

  async uploadFile(file: Express.Multer.File, actor?: MediaStaffActorInput): Promise<StoredPageMedia> {
    if (!file) throw new BadRequestException('未选择文件');

    const expectedType = this.allowedTypes.get(file.mimetype);
    if (!expectedType) {
      throw new BadRequestException(`不支持的文件类型: ${file.mimetype}`);
    }

    if (file.size > this.maxSize) {
      throw new BadRequestException(`文件大小不能超过 10MB`);
    }

    this.assertSafeOriginalName(file.originalname, expectedType.extension, ['.jpg', '.jpeg', '.png', '.webp', '.gif']);

    const metadata = await validateImageContent(file.buffer, expectedType.format);

    return this.registerPublicPageMedia({
      file,
      actor,
      extension: expectedType.extension,
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
    });
  }

  async onModuleInit() {
    const assets = await this.prisma.mediaAsset.findMany({
      where: {
        storageKey: { startsWith: 'page-assets/' },
        accessLevel: 'PUBLIC',
        status: { in: ['PENDING', 'READY', 'ARCHIVED', 'QUARANTINED'] },
      },
      orderBy: { id: 'asc' },
    });
    for (const asset of assets) {
      try {
        await this.withStorageKeyLock(asset.storageKey, async (transaction) => {
          const current = await transaction.mediaAsset.findUnique({ where: { id: asset.id } });
          if (current) await this.reconcilePageAsset(transaction, current);
        });
      } catch (error) {
        // 数据库提交不确定时先撤下公开副本；即使数据库持续不可用也不继续暴露。
        await this.hidePublicAsset(asset.storageKey, asset.checksumSha256);
        throw error;
      }
    }

    // 静态目录不能表达授权状态。启动时隔离没有数据库登记的页面素材孤儿，
    // 防止上传在登记前异常或人工放入文件后绕过媒体资产状态机。
    const pageAssetRoot = this.resolveWithinRoot(this.uploadDir, 'page-assets');
    if (pageAssetRoot && existsSync(pageAssetRoot)) {
      for (const entry of await readdir(pageAssetRoot, { withFileTypes: true })) {
        if (!entry.isFile()) continue;
        const storageKey = `page-assets/${entry.name}`;
        try {
          await this.withStorageKeyLock(storageKey, async (transaction) => {
            let asset = await transaction.mediaAsset.findUnique({ where: { storageKey } });
            if (asset?.accessLevel === 'PUBLIC') {
              asset = await this.reconcilePageAsset(transaction, asset);
            }
            if (!asset || asset.accessLevel !== 'PUBLIC' || asset.status !== 'READY') {
              await this.hidePublicAsset(storageKey, asset?.checksumSha256);
            }
          });
        } catch (error) {
          // 即使锁事务提交失败，也不能让未经确认的扫描项继续留在公开根。
          await this.hidePublicAsset(storageKey);
          throw error;
        }
      }
    }
  }

  async uploadMultiple(files: Express.Multer.File[], actor?: MediaStaffActorInput): Promise<StoredPageMedia[]> {
    if (!files || files.length === 0) throw new BadRequestException('未选择文件');
    const results: StoredPageMedia[] = [];
    for (const file of files) {
      const result = await this.uploadFile(file, actor);
      results.push(result);
    }
    return results;
  }

  async getPaymentProofForStaff(
    paymentId: number,
    principal: Pick<StaffPrincipal, 'id'>,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      await lockAuthorizedStaffForPayment(transaction, principal, 'PAYMENT_QUERY');
      const payment = await transaction.payment.findUnique({
        where: { id: paymentId },
        select: { proofUrl: true },
      });
      if (!payment?.proofUrl) throw new NotFoundException('付款凭证不存在');
      return this.readPaymentProof(payment.proofUrl);
    });
  }

  async getPaymentProofForCustomer(
    principal: Pick<CustomerPrincipal, 'id' | 'authVersion'>,
    orderId: number,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      await lockActiveCustomerForRead(transaction, principal);
      const payment = await transaction.payment.findFirst({
        where: {
          orderId,
          order: { customerId: principal.id },
          proofUrl: { not: null },
        },
        orderBy: { createdAt: 'desc' },
        select: { proofUrl: true },
      });
      if (!payment?.proofUrl) throw new NotFoundException('付款凭证不存在');
      return this.readPaymentProof(payment.proofUrl);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  /** 仅被已完成权限校验的接口调用；凭证只存于私有目录 private-media/payment-proofs。 */
  private async readPaymentProof(proofReference: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const filePath = this.resolveWithinRoot(this.paymentProofRoot, proofReference);
    if (!filePath || !existsSync(filePath)) throw new NotFoundException('付款凭证不存在');

    const extension = extname(filePath).toLowerCase();
    const mimeType = new Map([
      ['.jpg', 'image/jpeg'],
      ['.jpeg', 'image/jpeg'],
      ['.png', 'image/png'],
      ['.webp', 'image/webp'],
      ['.gif', 'image/gif'],
    ]).get(extension);
    if (!mimeType) throw new NotFoundException('付款凭证不存在');

    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) throw new NotFoundException('付款凭证不存在');
      return { buffer: await readFile(filePath), mimeType };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new NotFoundException('付款凭证不存在');
    }
  }

  async registerStoredVideo(file: Express.Multer.File, actor?: MediaStaffActorInput): Promise<StoredPageMedia> {
    if (!file) throw new BadRequestException('未选择视频文件');
    if (!['video/mp4', 'video/webm'].includes(file.mimetype)) {
      throw new BadRequestException('仅支持 MP4 或 WebM 视频');
    }
    if (file.size > this.maxVideoSize) {
      throw new BadRequestException('视频大小不能超过 100MB');
    }
    const extension = file.mimetype === 'video/mp4' ? '.mp4' : '.webm';
    this.assertSafeOriginalName(file.originalname, extension, ['.mp4', '.webm']);
    const validContainer = file.mimetype === 'video/mp4'
      ? this.isStructurallyValidMp4(file.buffer)
      : this.isStructurallyValidWebm(file.buffer);
    if (!validContainer) {
      throw new BadRequestException(`文件内容不是有效的 ${file.mimetype === 'video/mp4' ? 'MP4' : 'WebM'} 视频`);
    }
    return this.registerPublicPageMedia({
      file,
      actor,
      extension,
    });
  }

  /**
   * 合作 3D 文件只进入私有卷，并登记完整 MediaAsset 字节摘要。
   * 它不生成 /uploads URL，也不复用页面素材的公网授权语义。
   */
  async uploadPrivateDesignFile(file: Express.Multer.File, uploadedBy?: number) {
    const { normalizedName, extension } = assertSafeDesignFile(file);
    const storageKey = `design-assets/${dayjs().format('YYYY/MM/DD')}/${randomUUID()}${extension}`;
    const absolutePath = resolveDesignMediaPath(storageKey);
    if (!absolutePath) throw new BadRequestException('3D 文件存储路径无效');
    const directory = dirname(absolutePath);
    if (!existsSync(directory)) mkdirSync(directory, { recursive: true });
    const checksumSha256 = createHash('sha256').update(file.buffer).digest('hex');
    await writeFile(absolutePath, file.buffer);
    try {
      const mediaAsset = await this.prisma.mediaAsset.create({
        data: {
          storageKey,
          originalName: normalizedName,
          mimeType: 'application/octet-stream',
          byteSize: file.buffer.length,
          checksumSha256,
          accessLevel: 'PRIVATE',
          status: 'READY',
          lifecycleRevision: 1,
          integrityCheckedAt: new Date(),
          uploadedBy,
        },
      });
      return {
        mediaAssetId: mediaAsset.id,
        originalName: mediaAsset.originalName,
        byteSize: mediaAsset.byteSize,
        checksumSha256: mediaAsset.checksumSha256,
      };
    } catch (error) {
      await unlink(absolutePath).catch(() => undefined);
      throw error;
    }
  }

  readVerifiedDesignFile(
    asset: DesignMediaAssetDescriptor,
    expectedChecksum?: string,
  ) {
    return readVerifiedDesignMediaAsset(asset, expectedChecksum);
  }

  /** 只清理本次上传、尚未被任何 3D 版本引用的私有文件。 */
  async discardUnattachedDesignFile(mediaAssetId: number, uploadedBy: number) {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: {
        id: mediaAssetId,
        uploadedBy,
        accessLevel: 'PRIVATE',
        storageKey: { startsWith: 'design-assets/' },
        designFileVersions: { none: {} },
        productImages: { none: {} },
      },
      select: { id: true, storageKey: true },
    });
    if (!asset) return false;
    const filePath = resolveDesignMediaPath(asset.storageKey);
    const removed = await this.prisma.mediaAsset.deleteMany({
      where: {
        id: asset.id,
        uploadedBy,
        designFileVersions: { none: {} },
        productImages: { none: {} },
      },
    });
    if (removed.count === 1 && filePath) {
      await unlink(filePath).catch(() => undefined);
    }
    return removed.count === 1;
  }

  /**
   * 回收本次裁图生成但未挂载的商品派生资产。
   * 保留媒体授权及不可变事件，仅归档资产并移除私有文件；媒体资产行锁与商品挂载共用。
   */
  async archiveUnattachedProductDerivative(mediaAssetId: number, uploadedBy: number) {
    const asset = await this.prisma.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<Array<{ id: number }>>(
        Prisma.sql`SELECT id FROM media_assets WHERE id = ${mediaAssetId} FOR UPDATE`,
      );
      if (locked.length === 0) return null;
      const candidate = await transaction.mediaAsset.findFirst({
        where: {
          id: mediaAssetId,
          uploadedBy,
          accessLevel: 'PUBLIC',
          status: 'READY',
          storageKey: { startsWith: 'product-assets/derived/' },
          productImages: { none: {} },
        },
        select: { id: true, storageKey: true },
      });
      if (!candidate) return null;
      const archived = await transaction.mediaAsset.updateMany({
        where: {
          id: candidate.id,
          uploadedBy,
          status: 'READY',
          productImages: { none: {} },
        },
        data: {
          status: 'ARCHIVED',
          lifecycleRevision: { increment: 1 },
        },
      });
      return archived.count === 1 ? candidate : null;
    });
    if (!asset) return false;

    const filePath = this.resolveWithinRoot(
      this.storageRoots.productMediaRoot,
      asset.storageKey,
    );
    if (filePath) await unlink(filePath).catch(() => undefined);
    return true;
  }

  async listPageMedia(options: {
    page: number;
    pageSize: number;
    type?: PageMediaType;
    includeArchived?: boolean;
    status?: 'READY' | 'ARCHIVED' | 'QUARANTINED';
    keyword?: string;
  }, actor?: MediaStaffActorInput): Promise<{ list: PageMediaItem[]; total: number; page: number; pageSize: number }> {
    const mimeFilter = options.type === 'image'
      ? { startsWith: 'image/' }
      : options.type === 'video'
        ? { startsWith: 'video/' }
        : undefined;
    const where: Prisma.MediaAssetWhereInput = {
      accessLevel: 'PUBLIC',
      storageKey: { startsWith: 'page-assets/' },
      ...(options.status
        ? { status: options.status }
        : options.includeArchived
          ? { status: { in: ['READY', 'ARCHIVED', 'QUARANTINED'] } }
          : { status: 'READY' }),
      ...(mimeFilter ? { mimeType: mimeFilter } : {}),
      ...(options.keyword ? { originalName: { contains: options.keyword } } : {}),
    };
    const read = async (client: Prisma.TransactionClient | PrismaService) => Promise.all([
      client.mediaAsset.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (options.page - 1) * options.pageSize,
        take: options.pageSize,
        include: { authorization: true },
      }),
      client.mediaAsset.count({ where }),
    ]);
    const [rows, total] = actor
      ? await this.prisma.$transaction(async (transaction) => {
          await lockAuthorizedMediaStaff(transaction, actor, 'LIBRARY', 'read');
          return read(transaction);
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
      : await read(this.prisma);
    return {
      list: rows.map((row) => this.toPageMediaItem(row, row.authorization)),
      total,
      page: options.page,
      pageSize: options.pageSize,
    };
  }

  async archivePageMedia(id: number, actor?: MediaStaffActorInput): Promise<PageMediaItem> {
    const initial = actor
      ? await this.prisma.$transaction(async (transaction) => {
          await lockAuthorizedMediaStaff(transaction, actor, 'REVIEW', 'read');
          return this.findPageMedia(id, transaction);
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
      : await this.findPageMedia(id, this.prisma);
    try {
      return await this.withStorageKeyLock(initial.storageKey, async (transaction) => {
        let asset = await this.findPageMedia(id, transaction);
        asset = await this.reconcilePageAsset(transaction, asset);
        if (asset.status === 'QUARANTINED') return this.toPageMediaItem(asset);
        if (asset.status === 'ARCHIVED') return this.toPageMediaItem(asset);
        if (asset.status !== 'READY') throw new ConflictException('素材当前状态不可归档');

        const activePath = this.resolveWithinRoot(this.uploadDir, asset.storageKey);
        const archivedPath = this.resolveWithinRoot(this.archivedPageMediaRoot, asset.storageKey);
        const hasStoredFile = Boolean(
          (activePath && existsSync(activePath)) || (archivedPath && existsSync(archivedPath)),
        );
        if (hasStoredFile) {
          await this.moveStoredAsset(this.uploadDir, this.archivedPageMediaRoot, asset.storageKey);
        }
        const updated = await this.updateMediaAssetLifecycle(transaction, id, {
          status: 'ARCHIVED',
          lifecycleRevision: { increment: 1 },
          quarantineReason: null,
        });
        return this.toPageMediaItem(updated);
      }, actor, 'REVIEW').then((item) => {
        if (item.status === 'QUARANTINED') {
          throw new ConflictException('素材完整性校验失败，已隔离');
        }
        return item;
      });
    } catch (error) {
      await this.reconcileAfterFailedTransition(initial.storageKey);
      throw error;
    }
  }

  async restorePageMedia(id: number, actor?: MediaStaffActorInput): Promise<PageMediaItem> {
    const initial = actor
      ? await this.prisma.$transaction(async (transaction) => {
          await lockAuthorizedMediaStaff(transaction, actor, 'REVIEW', 'read');
          return this.findPageMedia(id, transaction);
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
      : await this.findPageMedia(id, this.prisma);
    try {
      return await this.withStorageKeyLock(initial.storageKey, async (transaction) => {
        let asset = await this.findPageMedia(id, transaction);
        asset = await this.reconcilePageAsset(transaction, asset);
        if (asset.status === 'QUARANTINED') return this.toPageMediaItem(asset);
        if (asset.status === 'READY') return this.toPageMediaItem(asset);
        if (asset.status !== 'ARCHIVED') throw new ConflictException('素材当前状态不可恢复');

        const archivedPath = this.resolveWithinRoot(this.archivedPageMediaRoot, asset.storageKey);
        if (!archivedPath || !existsSync(archivedPath)) {
          throw new NotFoundException('素材文件不存在，请重新加载后处理');
        }
        if (await this.fileChecksum(archivedPath) !== asset.checksumSha256) {
          asset = await this.quarantinePageAsset(transaction, asset);
          return this.toPageMediaItem(asset);
        }
        await this.moveStoredAsset(this.archivedPageMediaRoot, this.uploadDir, asset.storageKey);
        const updated = await this.updateMediaAssetLifecycle(transaction, id, {
          status: 'READY',
          lifecycleRevision: { increment: 1 },
          integrityCheckedAt: new Date(),
          quarantineReason: null,
        });
        return this.toPageMediaItem(updated);
      }, actor, 'REVIEW').then((item) => {
        if (item.status === 'QUARANTINED') {
          throw new ConflictException('素材完整性校验失败，已隔离');
        }
        return item;
      });
    } catch (error) {
      // 无论数据库是否可用，先把可能已经移出的文件撤回私有根；公开失败必须 fail-closed。
      await this.hidePublicAsset(initial.storageKey, initial.checksumSha256);
      await this.reconcileAfterFailedTransition(initial.storageKey);
      throw error;
    }
  }

  private async registerPublicPageMedia(input: {
    file: Express.Multer.File;
    actor?: MediaStaffActorInput;
    extension: string;
    width?: number;
    height?: number;
    format?: string;
  }): Promise<StoredPageMedia> {
    const uploadedBy = input.actor === undefined
      ? undefined
      : normalizeMediaStaffActor(input.actor).id;
    const checksum = createHash('sha256').update(input.file.buffer).digest('hex');
    const storageKey = `page-assets/${checksum}${input.extension}`;
    const target = this.resolveWithinRoot(this.uploadDir, storageKey);
    if (!target) throw new BadRequestException('素材存储路径无效');
    const stagingPath = this.resolveWithinRoot(
      this.archivedPageMediaRoot,
      `staging/${randomUUID()}-${basename(storageKey)}`,
    );
    if (!stagingPath) throw new BadRequestException('素材暂存路径无效');
    mkdirSync(dirname(stagingPath), { recursive: true });

    let deduplicated = false;
    const prepared = await this.withStorageKeyLock(storageKey, async (transaction) => {
      let existing = await transaction.mediaAsset.findUnique({ where: { storageKey } });
      deduplicated = Boolean(existing);
      if (existing) existing = await this.reconcilePageAsset(transaction, existing);
      if (existing && existing.accessLevel !== 'PUBLIC') {
        throw new ConflictException('素材存储键与受限文件冲突');
      }
      if (existing?.status === 'QUARANTINED') return existing;
      if (existing?.status === 'ARCHIVED') {
        throw new ConflictException('相同素材已归档，请在媒体库中显式恢复');
      }
      if (existing && !['PENDING', 'READY'].includes(existing.status)) {
        throw new ConflictException('相同素材当前不可上传，请稍后重试');
      }
      if (existing) {
        await this.mediaAuthorizationService.ensureUploadAuthorization(transaction, existing.id, uploadedBy);
        return existing;
      }
      const created = await transaction.mediaAsset.create({
        data: {
          storageKey,
          originalName: input.file.originalname,
          mimeType: input.file.mimetype,
          byteSize: input.file.size,
          checksumSha256: checksum,
          width: input.width,
          height: input.height,
          accessLevel: 'PUBLIC',
          status: 'PENDING',
          uploadedBy,
        },
      });
      await this.mediaAuthorizationService.ensureUploadAuthorization(transaction, created.id, uploadedBy);
      return created;
    }, input.actor, 'LIBRARY');

    if (prepared.status === 'QUARANTINED') {
      throw new ConflictException('相同素材完整性校验失败，已隔离');
    }

    if (prepared.status === 'READY') {
      return {
        ...this.toPageMediaItem(prepared),
        filename: basename(storageKey),
        format: input.format,
        deduplicated,
      };
    }

    try {
      await writeFile(stagingPath, input.file.buffer, { flag: 'wx' });
      const asset = await this.withStorageKeyLock(storageKey, async (transaction) => {
        let current = await transaction.mediaAsset.findUnique({ where: { storageKey } });
        if (!current) throw new ConflictException('素材登记丢失，请重新上传');
        current = await this.reconcilePageAsset(transaction, current);
        if (current.status === 'QUARANTINED') return current;
        if (current.status === 'ARCHIVED') {
          throw new ConflictException('相同素材已归档，请在媒体库中显式恢复');
        }
        if (current.status === 'PENDING') {
          if (existsSync(target)) {
            if (await this.fileChecksum(target) !== checksum) {
              await this.hidePublicAsset(storageKey, checksum);
              current = await this.quarantinePageAsset(transaction, current);
              return current;
            }
          } else {
            await this.moveAbsoluteFile(stagingPath, target);
          }
          current = await this.updateMediaAssetLifecycle(transaction, current.id, {
            status: 'READY',
            lifecycleRevision: { increment: 1 },
            integrityCheckedAt: new Date(),
            quarantineReason: null,
          });
        }
        return current;
      }, input.actor, 'LIBRARY');

      if (asset.status === 'QUARANTINED') {
        throw new ConflictException('素材完整性校验失败，已隔离');
      }

      return {
        ...this.toPageMediaItem(asset),
        filename: basename(storageKey),
        format: input.format,
        deduplicated,
      };
    } catch (error) {
      await this.hidePublicAsset(storageKey, checksum);
      await this.reconcileAfterFailedTransition(storageKey);
      throw error;
    } finally {
      await unlink(stagingPath).catch(() => undefined);
    }
  }

  private async findPageMedia(
    id: number,
    client: Pick<PrismaService, 'mediaAsset'> | Prisma.TransactionClient,
  ): Promise<MediaAsset> {
    if (!Number.isInteger(id) || id <= 0) throw new BadRequestException('素材编号无效');
    const asset = await client.mediaAsset.findFirst({
      where: { id, accessLevel: 'PUBLIC', storageKey: { startsWith: 'page-assets/' } },
    });
    if (!asset) throw new NotFoundException('素材不存在');
    return asset;
  }

  async getPageMediaContent(
    id: number,
    requirePublicAuthorization: boolean,
    actor?: MediaStaffActorInput,
  ) {
    const findInitial = (client: Prisma.TransactionClient | PrismaService) => client.mediaAsset.findFirst({
      where: { id, storageKey: { startsWith: 'page-assets/' } },
    });
    const initial = actor !== undefined
      ? await this.prisma.$transaction(async (transaction) => {
          await lockAuthorizedMediaStaff(transaction, actor, 'LIBRARY', 'read');
          return findInitial(transaction);
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
      : await findInitial(this.prisma);
    if (!initial) throw new NotFoundException('素材不存在');
    return this.readPageMediaContent(initial.id, initial.storageKey, requirePublicAuthorization, actor);
  }

  async getPageMediaContentByStorageKey(
    storageKey: string,
    requirePublicAuthorization: boolean,
    actor?: MediaStaffActorInput,
  ) {
    const segments = storageKey.split('/');
    if (
      !storageKey.startsWith('page-assets/')
      || segments.length < 2
      || segments.some((segment) => !segment || segment === '.' || segment === '..')
      || storageKey.includes('\\')
      || /[\u0000-\u001f\u007f]/u.test(storageKey)
    ) {
      throw new NotFoundException('素材不存在');
    }
    const findInitial = (client: Prisma.TransactionClient | PrismaService) =>
      client.mediaAsset.findUnique({ where: { storageKey } });
    const initial = actor !== undefined
      ? await this.prisma.$transaction(async (transaction) => {
          await lockAuthorizedMediaStaff(transaction, actor, 'LIBRARY', 'read');
          return findInitial(transaction);
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
      : await findInitial(this.prisma);
    if (!initial || initial.accessLevel !== 'PUBLIC') throw new NotFoundException('素材不存在');
    return this.readPageMediaContent(initial.id, initial.storageKey, requirePublicAuthorization, actor);
  }

  /** 历史商品媒体必须经商品媒体控制器读取，禁止匿名静态路径返回同一原文件。 */
  async isLegacyProductMediaStorageKey(storageKey: string): Promise<boolean> {
    const productImage = await this.prisma.productImage.findFirst({
      where: { url: `/uploads/${storageKey}` },
      select: { id: true },
    });
    return productImage !== null;
  }

  /**
   * 为公开页面图片生成固定宽度 WebP。受控 page-assets 仍先经过授权与完整性校验；
   * 历史 uploads 图片只允许从公开根内读取，原文件不修改，转码失败则返回原图。
   */
  async getResponsivePublicImage(
    storageKey: string,
    width: number,
    requirePublicAuthorization: boolean,
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    if (!isResponsivePublicImageWidth(width)) throw new NotFoundException('素材不存在');
    const source = requirePublicAuthorization
      ? await this.getPageMediaContentByStorageKey(storageKey, true)
      : await this.readLegacyPublicImage(storageKey);
    const cacheKey = `${storageKey}:w${width}:${source.fingerprint}`;
    const cached = this.responsivePublicMediaCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    if (cached) this.responsivePublicMediaCache.delete(cacheKey);

    const existing = this.responsivePublicMediaInFlight.get(cacheKey);
    if (existing) return existing;

    const pending = resizePublicImageBuffer(source.buffer, width, source.mimeType);
    this.responsivePublicMediaInFlight.set(cacheKey, pending);

    try {
      const value = await pending;
      if (this.responsivePublicMediaCache.size >= RESPONSIVE_PUBLIC_MEDIA_CACHE_MAX_ENTRIES) {
        const oldestKey = this.responsivePublicMediaCache.keys().next().value;
        if (oldestKey) this.responsivePublicMediaCache.delete(oldestKey);
      }
      this.responsivePublicMediaCache.set(cacheKey, {
        expiresAt: Date.now() + RESPONSIVE_PUBLIC_MEDIA_CACHE_TTL_MS,
        value,
      });
      return value;
    } finally {
      if (this.responsivePublicMediaInFlight.get(cacheKey) === pending) {
        this.responsivePublicMediaInFlight.delete(cacheKey);
      }
    }
  }

  private async readLegacyPublicImage(storageKey: string): Promise<{
    buffer: Buffer;
    mimeType: string;
    fingerprint: string;
  }> {
    const path = this.resolveWithinRoot(this.uploadDir, storageKey);
    if (!path || !existsSync(path)) throw new NotFoundException('素材不存在');
    const extension = extname(storageKey).toLowerCase();
    const mimeType = extension === '.png'
      ? 'image/png'
      : extension === '.webp'
        ? 'image/webp'
        : 'image/jpeg';
    const [buffer, fileStat] = await Promise.all([readFile(path), stat(path)]);
    return {
      buffer,
      mimeType,
      fingerprint: `${fileStat.size}:${fileStat.mtimeMs}`,
    };
  }

  private async readPageMediaContent(
    id: number,
    storageKey: string,
    requirePublicAuthorization: boolean,
    actor?: MediaStaffActorInput,
  ) {
    const result = await this.withStorageKeyLock(storageKey, async (transaction) => {
      const found = await transaction.mediaAsset.findFirst({
        where: { id, storageKey, accessLevel: 'PUBLIC' },
        include: { authorization: true },
      });
      if (!found) return { kind: 'NOT_FOUND' as const };
      const asset = await this.reconcilePageAsset(transaction, found);
      if (asset.status === 'QUARANTINED') return { kind: 'QUARANTINED' as const };
      const eligibility = evaluateMediaPublicEligibility({
        assetStatus: asset.status,
        accessLevel: asset.accessLevel,
        authorization: found.authorization,
      });
      if (requirePublicAuthorization && !eligibility.eligible) {
        return { kind: 'NOT_PUBLIC' as const };
      }
      if (asset.status !== 'READY') return { kind: 'NOT_READY' as const };
      const path = this.resolveWithinRoot(this.uploadDir, asset.storageKey);
      if (!path || !existsSync(path)) return { kind: 'MISSING' as const };
      const buffer = await readFile(path);
      if (createHash('sha256').update(buffer).digest('hex') !== asset.checksumSha256) {
        await this.quarantinePageAsset(transaction, asset);
        return { kind: 'QUARANTINED' as const };
      }
      return {
        kind: 'CONTENT' as const,
        buffer,
        mimeType: asset.mimeType,
        fingerprint: asset.checksumSha256,
      };
    }, actor, 'LIBRARY');
    if (result.kind === 'CONTENT') {
      return {
        buffer: result.buffer,
        mimeType: result.mimeType,
        fingerprint: result.fingerprint,
      };
    }
    if (result.kind === 'QUARANTINED') throw new ConflictException('素材完整性校验失败，已隔离');
    if (result.kind === 'NOT_PUBLIC') throw new NotFoundException('素材当前不可公开访问');
    if (result.kind === 'MISSING') throw new NotFoundException('素材文件不存在');
    if (result.kind === 'NOT_READY') throw new NotFoundException('素材当前不可读取');
    throw new NotFoundException('素材不存在');
  }

  private toPageMediaItem(asset: MediaAsset, authorization?: MediaAssetAuthorization | null): PageMediaItem {
    const activePath = this.resolveWithinRoot(this.uploadDir, asset.storageKey);
    const available = asset.status === 'READY'
      ? Boolean(activePath && existsSync(activePath))
      : false;
    const publicEligibility = evaluateMediaPublicEligibility({
      assetStatus: asset.status,
      accessLevel: asset.accessLevel,
      authorization,
    });
    return {
      id: asset.id,
      url: `/uploads/${asset.storageKey}`,
      name: asset.originalName || basename(asset.storageKey),
      type: asset.mimeType.startsWith('video/') ? 'video' : 'image',
      mimeType: asset.mimeType,
      size: asset.byteSize,
      width: asset.width ?? undefined,
      height: asset.height ?? undefined,
      createdAt: asset.createdAt,
      status: asset.status,
      available,
      integrityCheckedAt: asset.integrityCheckedAt ?? undefined,
      quarantineReason: asset.quarantineReason ?? undefined,
      previewUrl: `/api/upload/media/${asset.id}/preview`,
      publicUrl: publicEligibility.eligible ? `/api/upload/public-media/${asset.id}` : null,
      authorization: authorization ? {
        reviewStatus: authorization.reviewStatus,
        revocationStatus: authorization.revocationStatus,
        revision: authorization.revision,
        publicUseEpoch: authorization.publicUseEpoch,
        sourceType: authorization.sourceType,
        validUntil: authorization.validUntil ?? undefined,
      } : null,
      publicEligibility,
    };
  }

  private assertSafeOriginalName(originalName: string, expectedExtension: string, allowedExtensions: readonly string[]) {
    const normalized = originalName.normalize('NFC');
    const extension = extname(normalized).toLowerCase();
    if (
      !normalized ||
      normalized.length > 255 ||
      basename(normalized) !== normalized ||
      normalized.includes('..') ||
      /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(normalized)
    ) {
      throw new BadRequestException('文件名包含不安全字符');
    }
    if (!allowedExtensions.includes(extension) || (expectedExtension === '.jpg' ? !['.jpg', '.jpeg'].includes(extension) : extension !== expectedExtension)) {
      throw new BadRequestException('文件扩展名与声明类型不一致');
    }
  }

  private isStructurallyValidMp4(buffer: Buffer) {
    if (buffer.length < 32) return false;
    const requiredBoxes = new Set(['ftyp', 'moov', 'mdat']);
    let offset = 0;
    while (offset + 8 <= buffer.length) {
      let headerSize = 8;
      let boxSize = buffer.readUInt32BE(offset);
      const boxType = buffer.toString('ascii', offset + 4, offset + 8);
      if (boxSize === 1) {
        if (offset + 16 > buffer.length) return false;
        const extendedSize = buffer.readBigUInt64BE(offset + 8);
        if (extendedSize > BigInt(Number.MAX_SAFE_INTEGER)) return false;
        boxSize = Number(extendedSize);
        headerSize = 16;
      } else if (boxSize === 0) {
        boxSize = buffer.length - offset;
      }
      if (boxSize <= headerSize || offset + boxSize > buffer.length) return false;
      requiredBoxes.delete(boxType);
      offset += boxSize;
    }
    return offset === buffer.length && requiredBoxes.size === 0;
  }

  private isStructurallyValidWebm(buffer: Buffer) {
    if (buffer.length < 24 || !buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) {
      return false;
    }
    const includesElement = (signature: readonly number[]) => buffer.indexOf(Buffer.from(signature)) >= 0;
    return includesElement([0x18, 0x53, 0x80, 0x67]) &&
      includesElement([0x16, 0x54, 0xae, 0x6b]) &&
      includesElement([0x1f, 0x43, 0xb6, 0x75]);
  }

  private async withStorageKeyLock<T>(
    storageKey: string,
    action: (transaction: Prisma.TransactionClient) => Promise<T>,
    actor?: MediaStaffActorInput,
    access: MediaStaffAccess = 'LIBRARY',
  ): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (transaction) => {
          // 所有员工锁必须先于素材行锁，保持跨模块一致的 users -> session -> domain 顺序。
          if (actor !== undefined) {
            await lockAuthorizedMediaStaff(transaction, actor, access, 'write');
          }
          // 锁定 storage_key 唯一索引上的现有记录或缺失键间隙。锁随事务提交释放，
          // 因而上传、归档、恢复跨实例串行，不存在“先解锁、后提交”的可见性窗口。
          await transaction.$queryRaw<Array<{ id: number }>>`
            SELECT id FROM media_assets WHERE storage_key = ${storageKey} FOR UPDATE
          `;
          return action(transaction);
        }, { maxWait: 10_000, timeout: 30_000 });
      } catch (error) {
        if (attempt < 2 && this.isPrismaWriteConflict(error)) continue;
        throw error;
      }
    }
    throw new ConflictException('素材正在被其他操作处理，请稍后重试');
  }

  private isPrismaWriteConflict(error: unknown) {
    return error instanceof Error && 'code' in error &&
      ['P2002', 'P2034'].includes(String((error as { code?: unknown }).code));
  }

  /**
   * lifecycleRevision 是商品发布质量 hash 的组成部分。资产生命周期变更与引用商品
   * 退出 READY 必须处于同一数据库事务，避免新 revision 配上旧质量快照。
   */
  private async updateMediaAssetLifecycle(
    transaction: Prisma.TransactionClient,
    assetId: number,
    data: Prisma.MediaAssetUpdateInput,
  ): Promise<MediaAsset> {
    const updated = await transaction.mediaAsset.update({
      where: { id: assetId },
      data,
    });
    await transaction.product.updateMany({
      where: {
        publicationQualityStatus: 'READY',
        images: { some: { mediaAssetId: assetId } },
      },
      data: {
        publicationQualityStatus: 'QUARANTINED',
        publicationQualityHash: null,
        publicationQualityCheckedAt: null,
      },
    });
    return updated;
  }

  private async reconcileAfterFailedTransition(storageKey: string) {
    await this.withStorageKeyLock(storageKey, async (transaction) => {
      const asset = await transaction.mediaAsset.findUnique({ where: { storageKey } });
      if (asset?.accessLevel === 'PUBLIC' && asset.storageKey.startsWith('page-assets/')) {
        await this.reconcilePageAsset(transaction, asset);
      }
    }).catch(() => undefined);
  }

  /**
   * 文件系统与 MySQL 无法组成单一原子提交。每次启动和状态变更都校验内容并修复：
   * 任何内容错配先撤下公开副本并进入 QUARANTINED；缺失文件才安全降为 ARCHIVED。
   */
  private async reconcilePageAsset(
    transaction: Prisma.TransactionClient,
    asset: MediaAsset,
  ): Promise<MediaAsset> {
    const activePath = this.resolveWithinRoot(this.uploadDir, asset.storageKey);
    const archivedPath = this.resolveWithinRoot(this.archivedPageMediaRoot, asset.storageKey);
    if (!activePath || !archivedPath) throw new BadRequestException('素材存储路径无效');
    const activeExists = existsSync(activePath);
    const archivedExists = existsSync(archivedPath);

    if (asset.status === 'QUARANTINED') {
      if (activeExists) await this.hidePublicAsset(asset.storageKey, asset.checksumSha256);
      return asset;
    }

    if (asset.status === 'ARCHIVED') {
      if (activeExists) {
        if (await this.fileChecksum(activePath) !== asset.checksumSha256) {
          return this.quarantinePageAsset(transaction, asset);
        }
        await this.hidePublicAsset(asset.storageKey, asset.checksumSha256);
        if (!archivedExists) {
          return transaction.mediaAsset.update({
            where: { id: asset.id },
            data: { integrityCheckedAt: new Date(), quarantineReason: null },
          });
        }
      }
      if (archivedExists) {
        if (await this.fileChecksum(archivedPath) !== asset.checksumSha256) {
          return this.quarantinePageAsset(transaction, asset);
        }
        return transaction.mediaAsset.update({
          where: { id: asset.id },
          data: { integrityCheckedAt: new Date(), quarantineReason: null },
        });
      }
      return asset;
    }

    if (asset.status === 'READY') {
      if (activeExists) {
        if (await this.fileChecksum(activePath) !== asset.checksumSha256) {
          return this.quarantinePageAsset(transaction, asset);
        }
        return transaction.mediaAsset.update({
          where: { id: asset.id },
          data: { integrityCheckedAt: new Date(), quarantineReason: null },
        });
      }
      if (archivedExists) {
        if (await this.fileChecksum(archivedPath) !== asset.checksumSha256) {
          return this.quarantinePageAsset(transaction, asset);
        }
        return this.updateMediaAssetLifecycle(transaction, asset.id, {
          status: 'ARCHIVED',
          lifecycleRevision: { increment: 1 },
          integrityCheckedAt: new Date(),
          quarantineReason: null,
        });
      }
      return this.updateMediaAssetLifecycle(transaction, asset.id, {
        status: 'ARCHIVED',
        lifecycleRevision: { increment: 1 },
        quarantineReason: null,
      });
    }

    if (asset.status === 'PENDING') {
      if (activeExists) {
        if (await this.fileChecksum(activePath) === asset.checksumSha256) {
          return this.updateMediaAssetLifecycle(transaction, asset.id, {
            status: 'READY',
            lifecycleRevision: { increment: 1 },
            integrityCheckedAt: new Date(),
            quarantineReason: null,
          });
        }
        return this.quarantinePageAsset(transaction, asset);
      }
      if (archivedExists) {
        if (await this.fileChecksum(archivedPath) !== asset.checksumSha256) {
          return this.quarantinePageAsset(transaction, asset);
        }
        await this.moveStoredAsset(this.archivedPageMediaRoot, this.uploadDir, asset.storageKey);
        return this.updateMediaAssetLifecycle(transaction, asset.id, {
          status: 'READY',
          lifecycleRevision: { increment: 1 },
          integrityCheckedAt: new Date(),
          quarantineReason: null,
        });
      }
    }
    return asset;
  }

  private async quarantinePageAsset(
    transaction: Prisma.TransactionClient,
    asset: MediaAsset,
  ): Promise<MediaAsset> {
    await this.hidePublicAsset(asset.storageKey, asset.checksumSha256);
    return this.updateMediaAssetLifecycle(transaction, asset.id, {
      status: 'QUARANTINED',
      lifecycleRevision: { increment: 1 },
      integrityCheckedAt: new Date(),
      quarantineReason: CHECKSUM_MISMATCH_QUARANTINE_REASON,
    });
  }

  /** 把公开副本撤回私有归档；内容错配时保留到 quarantine 供人工取证，绝不继续公开。 */
  private async hidePublicAsset(storageKey: string, expectedChecksum?: string | null) {
    const source = this.resolveWithinRoot(this.uploadDir, storageKey);
    if (!source || !existsSync(source)) return;
    const actualChecksum = await this.fileChecksum(source);
    if (expectedChecksum && actualChecksum === expectedChecksum) {
      const archived = this.resolveWithinRoot(this.archivedPageMediaRoot, storageKey);
      if (!archived) throw new BadRequestException('素材归档路径无效');
      if (!existsSync(archived) || await this.fileChecksum(archived) === actualChecksum) {
        await this.moveAbsoluteFile(source, archived);
        return;
      }
      // 私有归档键已被不同内容占用时，公开副本仍优先撤下到独立隔离路径。
    }
    const quarantine = this.resolveWithinRoot(
      this.archivedPageMediaRoot,
      `quarantine/${randomUUID()}-${basename(storageKey)}.invalid`,
    );
    if (!quarantine) throw new BadRequestException('素材隔离路径无效');
    await this.moveAbsoluteFile(source, quarantine);
  }

  private async moveStoredAsset(fromRoot: string, toRoot: string, storageKey: string) {
    const source = this.resolveWithinRoot(fromRoot, storageKey);
    const target = this.resolveWithinRoot(toRoot, storageKey);
    if (!source || !target) throw new BadRequestException('素材存储路径无效');
    if (!existsSync(source)) {
      if (existsSync(target)) return;
      throw new NotFoundException('素材文件不存在，请重新加载后处理');
    }
    await this.moveAbsoluteFile(source, target);
  }

  private async moveAbsoluteFile(source: string, target: string) {
    mkdirSync(dirname(target), { recursive: true });
    if (existsSync(target)) {
      await this.assertSameStoredFile(source, target);
      await unlink(source);
      return;
    }
    try {
      await rename(source, target);
    } catch (error) {
      if (this.isFsError(error, 'EXDEV')) {
        await this.copyAcrossDevices(source, target);
        return;
      }
      if (!this.isFsError(error, 'EEXIST') || !existsSync(target)) throw error;
      await this.assertSameStoredFile(source, target);
      await unlink(source);
    }
  }

  private async copyAcrossDevices(source: string, target: string) {
    if (existsSync(target)) {
      await this.assertSameStoredFile(source, target);
      await unlink(source);
      return;
    }
    const temporaryTarget = `${target}.${randomUUID()}.tmp`;
    try {
      await copyFile(source, temporaryTarget, fsConstants.COPYFILE_EXCL);
      await this.assertSameStoredFile(source, temporaryTarget);
      await rename(temporaryTarget, target);
      await unlink(source);
    } finally {
      await unlink(temporaryTarget).catch(() => undefined);
    }
  }

  private async assertSameStoredFile(left: string, right: string) {
    const [leftChecksum, rightChecksum] = await Promise.all([
      this.fileChecksum(left),
      this.fileChecksum(right),
    ]);
    if (leftChecksum !== rightChecksum) throw new ConflictException('素材归档文件冲突');
  }

  private async fileChecksum(path: string) {
    return createHash('sha256').update(await readFile(path)).digest('hex');
  }

  private isFsError(error: unknown, code: string): error is NodeJS.ErrnoException {
    return error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === code;
  }

  async uploadProductImages(
    files: Express.Multer.File[],
    imageTypes: string[],
  ): Promise<{ url: string; type: string }[]> {
    if (!files || files.length === 0) throw new BadRequestException('未选择图片');
    const results: { url: string; type: string }[] = [];
    for (let i = 0; i < files.length; i++) {
      const result = await this.uploadFile(files[i]);
      results.push({ url: result.url, type: imageTypes[i] || 'FRONT' });
    }
    return results;
  }

  /**
   * 上传产品图片到受控私有目录（server/private-media/products），不写入公开 uploads。
   * 受控产品库要求：新上传产品图片直接进入私有存储，仅通过鉴权媒体端点访问。
   * 返回 storageKey（相对私有根的安全键）与图片元数据，供 ProductImage 持久化。
   */
  async uploadPrivateImage(file: Express.Multer.File, actor?: MediaStaffActorInput): Promise<{
    mediaAssetId: number;
    storageKey: string;
    width?: number;
    height?: number;
    mimeType: string;
    fileSize: number;
  }> {
    if (!file) throw new BadRequestException('未选择文件');
    const expectedType = this.allowedTypes.get(file.mimetype);
    if (!expectedType) throw new BadRequestException(`不支持的文件类型: ${file.mimetype}`);
    if (file.size > this.maxSize) throw new BadRequestException('文件大小不能超过 10MB');

    this.assertSafeOriginalName(file.originalname, expectedType.extension, ['.jpg', '.jpeg', '.png', '.webp', '.gif']);

    const metadata = await validateImageContent(file.buffer, expectedType.format);
    const uploadedBy = actor === undefined ? undefined : normalizeMediaStaffActor(actor).id;

    const privateRoot = resolve(
      process.env.PRODUCT_MEDIA_ROOT || join(process.cwd(), 'private-media', 'products'),
    );
    const dateSeg = `product-assets/${dayjs().format('YYYY/MM/DD')}`;
    const dir = join(privateRoot, dateSeg);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const filename = `${randomUUID()}${expectedType.extension}`;
    const absolutePath = join(dir, filename);
    await writeFile(absolutePath, file.buffer);

    // storageKey 仅保存相对私有根的安全键，禁止包含绝对路径或 ../
    const storageKey = join(dateSeg, filename).replace(/\\/g, '/');
    try {
      const mediaAsset = await this.prisma.$transaction(async (transaction) => {
        if (actor !== undefined) {
          await lockAuthorizedMediaStaff(transaction, actor, 'LIBRARY', 'write');
        }
        const created = await transaction.mediaAsset.create({
          data: {
            storageKey,
            originalName: file.originalname.normalize('NFC'),
            mimeType: file.mimetype,
            byteSize: file.size,
            checksumSha256: createHash('sha256').update(file.buffer).digest('hex'),
            width: metadata.width,
            height: metadata.height,
            accessLevel: 'PUBLIC',
            status: 'READY',
            lifecycleRevision: 1,
            integrityCheckedAt: new Date(),
            uploadedBy,
          },
        });
        await this.mediaAuthorizationService.ensureUploadAuthorization(transaction, created.id, uploadedBy);
        return created;
      });
      return {
        mediaAssetId: mediaAsset.id,
        storageKey,
        width: metadata.width,
        height: metadata.height,
        mimeType: file.mimetype,
        fileSize: file.size,
      };
    } catch (error) {
      // 该文件由本次请求新建；登记失败时删除孤儿，不触碰任何既有素材。
      await unlink(absolutePath).catch(() => undefined);
      throw error;
    }
  }

  /** 批量上传产品图片到受控私有目录 */
  async uploadPrivateProductImages(
    files: Express.Multer.File[],
    imageTypes: string[],
    actor?: MediaStaffActorInput,
  ): Promise<
    {
      mediaAssetId: number;
      storageKey: string;
      type: string;
      width?: number;
      height?: number;
      mimeType: string;
      fileSize: number;
    }[]
  > {
    if (!files || files.length === 0) throw new BadRequestException('未选择图片');
    const results: Array<{
      mediaAssetId: number;
      storageKey: string;
      type: string;
      width?: number;
      height?: number;
      mimeType: string;
      fileSize: number;
    }> = [];
    for (let i = 0; i < files.length; i++) {
      const result = await this.uploadPrivateImage(files[i], actor);
      results.push({ ...result, type: imageTypes[i] || 'FRONT' });
    }
    return results;
  }

  /**
   * 把仍留在 /uploads/YYYY/MM/DD/ 的旧图片复制登记为 page-assets。
   * 不删除原文件，不改写页面草稿，也不批准公网使用。
   */
  async adoptDatedPublicUpload(
    sourceUrl: string,
    actor?: MediaStaffActorInput,
  ): Promise<StoredPageMedia> {
    const storageKey = this.parseDatedUploadStorageKey(sourceUrl);
    const physical = this.resolveWithinRoot(this.uploadDir, storageKey);
    if (!physical || !existsSync(physical)) {
      throw new NotFoundException('找不到这张历史上传图片，不能登记');
    }
    const buffer = await readFile(physical);
    if (buffer.length > this.maxSize) {
      throw new BadRequestException('文件大小不能超过 10MB');
    }
    const sourceExtension = extname(storageKey).toLowerCase();
    const mimeType = ({
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
    } as Record<string, string>)[sourceExtension];
    const expectedType = mimeType ? this.allowedTypes.get(mimeType) : undefined;
    if (!mimeType || !expectedType) {
      throw new BadRequestException('仅支持 JPEG、PNG、WebP 或 GIF 图片');
    }
    const metadata = await validateImageContent(buffer, expectedType.format);
    return this.registerPublicPageMedia({
      file: {
        buffer,
        size: buffer.length,
        mimetype: mimeType,
        originalname: basename(storageKey),
      } as Express.Multer.File,
      actor,
      extension: expectedType.extension,
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
    });
  }

  private parseDatedUploadStorageKey(sourceUrl: string): string {
    const match = sourceUrl.trim().match(/^\/uploads\/(\d{4}\/\d{2}\/\d{2}\/[^/?#]+)(?:[?#].*)?$/);
    if (!match) throw new BadRequestException('只能登记 YYYY/MM/DD 路径上的本站旧图片');
    let storageKey: string;
    try {
      storageKey = decodeURIComponent(match[1]);
    } catch {
      throw new BadRequestException('素材地址无效');
    }
    const segments = storageKey.split('/');
    if (
      segments.length !== 4
      || !/^\d{4}$/.test(segments[0] ?? '')
      || !/^\d{2}$/.test(segments[1] ?? '')
      || !/^\d{2}$/.test(segments[2] ?? '')
      || !segments[3]
      || segments[3] === '.'
      || segments[3] === '..'
      || storageKey.includes('\\')
      || /[\u0000-\u001f\u007f]/u.test(storageKey)
    ) {
      throw new BadRequestException('素材地址无效');
    }
    return storageKey;
  }

  /**
   * 按运营选定的矩形裁切页面素材，登记为新的 page-assets 图片。
   * 只缩小、不二次 cover 裁切，避免覆盖用户刚确认的构图。
   */
  async cropPublicPageMedia(
    sourceUrl: string,
    crop: NormalizedCropRect,
    actor?: MediaStaffActorInput,
  ): Promise<StoredPageMedia> {
    const storageKey = this.parsePageAssetStorageKey(sourceUrl);
    const source = await this.getPageMediaContentByStorageKey(storageKey, false, actor);
    if (!source.mimeType.startsWith('image/')) {
      throw new BadRequestException('只能裁切图片');
    }
    const metadata = await sharp(source.buffer).metadata();
    const pixels = normalizedCropToPixels(crop, metadata.width ?? 0, metadata.height ?? 0);
    if (!pixels) {
      throw new BadRequestException('裁切区域无效');
    }
    let cropped: Buffer;
    try {
      cropped = await sharp(source.buffer)
        .extract({
          left: pixels.left,
          top: pixels.top,
          width: pixels.width,
          height: pixels.height,
        })
        .resize({
          width: 1920,
          height: 1920,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 88 })
        .toBuffer();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '未知错误';
      throw new BadRequestException(`图片裁切失败: ${message}`);
    }
    const croppedMeta = await sharp(cropped).metadata();
    return this.registerPublicPageMedia({
      file: {
        buffer: cropped,
        originalname: 'catalog-cover.jpg',
        mimetype: 'image/jpeg',
        size: cropped.length,
      } as Express.Multer.File,
      actor,
      extension: '.jpg',
      width: croppedMeta.width,
      height: croppedMeta.height,
      format: 'jpeg',
    });
  }

  private parsePageAssetStorageKey(value: string): string {
    if (typeof value !== 'string') {
      throw new BadRequestException('请选择素材库中的图片再裁切');
    }
    const path = value.trim().split(/[?#]/, 1)[0];
    let decoded = path;
    try {
      decoded = decodeURIComponent(path);
    } catch {
      throw new BadRequestException('请选择素材库中的图片再裁切');
    }
    if (
      decoded !== path
      || !path.startsWith('/uploads/page-assets/')
      || path.includes('\\')
      || /[\u0000-\u001f\u007f]/.test(path)
    ) {
      throw new BadRequestException('请选择素材库中的图片再裁切');
    }
    const storageKey = path.slice('/uploads/'.length);
    const segments = storageKey.split('/');
    if (
      segments.length < 2
      || segments.some((segment) => !segment || segment === '.' || segment === '..')
    ) {
      throw new BadRequestException('请选择素材库中的图片再裁切');
    }
    return storageKey;
  }

  /**
   * 裁切并保存图片（用于生成 LISTING 图）
   * @param sourcePath 原始文件路径（相对于 uploads 目录）
   * @param crop 裁切区域（像素坐标）
   * @param outputSize 输出正方形边长（默认 1200px）
   * @param format 输出格式（默认 webp）
   */
  async cropImage(
    sourcePath: string,
    crop: { left: number; top: number; width: number; height: number },
    outputSize: number = 1200,
    format: 'webp' | 'jpeg' = 'webp',
  ): Promise<{ url: string }> {
    const uploadRoot = resolve(this.uploadDir);
    const fullSourcePath = resolve(uploadRoot, sourcePath);
    if (fullSourcePath !== uploadRoot && !fullSourcePath.startsWith(`${uploadRoot}${sep}`)) {
      throw new BadRequestException('图片路径无效');
    }
    if (!existsSync(fullSourcePath)) {
      throw new BadRequestException('原始图片不存在');
    }

    // 派生图存入 products/derived/ 子目录
    const derivedDir = join(this.uploadDir, 'products', 'derived');
    if (!existsSync(derivedDir)) {
      mkdirSync(derivedDir, { recursive: true });
    }

    const filename = `${randomUUID()}.${format === 'webp' ? 'webp' : 'jpg'}`;
    const outputPath = join(derivedDir, filename);

    try {
      const pipeline = sharp(fullSourcePath)
        .extract({ left: Math.round(crop.left), top: Math.round(crop.top), width: Math.round(crop.width), height: Math.round(crop.height) })
        .resize(outputSize, outputSize, { fit: 'cover' });

      if (format === 'webp') {
        await pipeline.webp({ quality: 85 }).toFile(outputPath);
      } else {
        await pipeline.jpeg({ quality: 90 }).toFile(outputPath);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "未知错误";
      throw new BadRequestException(`图片裁切失败: ${message}`);
    }

    const relativePath = join('products', 'derived', filename).replace(/\\/g, '/');
    return { url: `/uploads/${relativePath}` };
  }

  /**
   * 裁切私有存储的产品图片（生成 LISTING 图等派生图）。
   * 源图与派生图都写入受控私有目录，不进入公开 uploads。
   * @param storageKey 源图相对私有根的安全键
   */
  async cropPrivateImage(
    storageKey: string,
    crop: { left: number; top: number; width: number; height: number },
    outputSize = 1200,
    format: 'webp' | 'jpeg' = 'webp',
    actor?: MediaStaffActorInput,
  ): Promise<{
    mediaAssetId: number;
    storageKey: string;
    width: number;
    height: number;
    mimeType: string;
    fileSize: number;
  }> {
    const privateRoot = resolve(
      process.env.PRODUCT_MEDIA_ROOT || join(process.cwd(), 'private-media', 'products'),
    );
    const uploadedBy = actor === undefined ? undefined : normalizeMediaStaffActor(actor).id;
    const fullSource = this.resolveWithinRoot(privateRoot, storageKey);
    if (!fullSource || !existsSync(fullSource)) {
      throw new BadRequestException('原始图片不存在');
    }

    const dateSeg = dayjs().format('YYYY/MM/DD');
    const derivedDir = join(privateRoot, 'product-assets', 'derived', dateSeg);
    if (!existsSync(derivedDir)) mkdirSync(derivedDir, { recursive: true });
    const filename = `${randomUUID()}.${format === 'webp' ? 'webp' : 'jpg'}`;
    const outputPath = join(derivedDir, filename);

    try {
      const pipeline = sharp(fullSource)
        .extract({
          left: Math.round(crop.left),
          top: Math.round(crop.top),
          width: Math.round(crop.width),
          height: Math.round(crop.height),
        })
        .resize(outputSize, outputSize, { fit: 'cover' });
      if (format === 'webp') {
        await pipeline.webp({ quality: 85 }).toFile(outputPath);
      } else {
        await pipeline.jpeg({ quality: 90 }).toFile(outputPath);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "未知错误";
      throw new BadRequestException(`图片裁切失败: ${message}`);
    }

    const outStat = await stat(outputPath);
    const outKey = join('product-assets', 'derived', dateSeg, filename).replace(/\\/g, '/');
    const mimeType = format === 'webp' ? 'image/webp' : 'image/jpeg';
    try {
      const outputBuffer = await readFile(outputPath);
      const asset = await this.prisma.$transaction(async (transaction) => {
        if (actor !== undefined) {
          await lockAuthorizedMediaStaff(transaction, actor, 'LIBRARY', 'write');
        }
        const created = await transaction.mediaAsset.create({
          data: {
            storageKey: outKey,
            originalName: filename,
            mimeType,
            byteSize: outStat.size,
            checksumSha256: createHash('sha256').update(outputBuffer).digest('hex'),
            width: outputSize,
            height: outputSize,
            accessLevel: 'PUBLIC',
            status: 'READY',
            lifecycleRevision: 1,
            integrityCheckedAt: new Date(),
            uploadedBy,
          },
        });
        await this.mediaAuthorizationService.ensureUploadAuthorization(transaction, created.id, uploadedBy);
        return created;
      });
      return {
        mediaAssetId: asset.id,
        storageKey: outKey,
        width: outputSize,
        height: outputSize,
        mimeType,
        fileSize: outStat.size,
      };
    } catch (error) {
      await unlink(outputPath).catch(() => undefined);
      throw error;
    }
  }

  /** 解析相对根目录的路径，严格防止 ../ 路径穿越 */
  private resolveWithinRoot(root: string, requestedPath: string): string | null {
    const normalized = requestedPath.replace(/\\/g, '/');
    const target = resolve(root, normalized);
    const rel = relative(root, target);
    if (isAbsolute(rel) || rel.startsWith('..') || rel === '..' || rel.startsWith(`..${sep}`) || rel.startsWith('../')) {
      return null;
    }
    return target;
  }
}
