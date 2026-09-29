import { HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { ApiError } from '../../common/errors/api-error';
import { IdempotencyService } from '../../common/idempotency/idempotency-key';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { SessionMetadata } from '../../common/security/refresh-session.service';
import type { CustomerPrincipal } from '../../common/security/authenticated-principal';
import { Prisma } from '@prisma/client';
import { lockActiveCustomerForRead } from './customer-write-gate';

const sharp = require('sharp');

const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const AVATAR_MAX_PIXELS = 25_000_000;
const AVATAR_OUTPUT_SIZE = 512;
const SUPPORTED_AVATAR_TYPES = new Map([
  ['image/jpeg', 'jpeg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

type PendingAvatarRemoval = {
  customerId: number;
  storageKey: string;
  queuedAt: string;
};

type AvatarCustomer = Pick<CustomerPrincipal, 'id' | 'authVersion'>;

function optionalHash(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? createHash('sha256').update(normalized).digest('hex') : null;
}

@Injectable()
export class CustomerAvatarService implements OnModuleInit {
  private readonly logger = new Logger(CustomerAvatarService.name);
  private readonly root = resolve(process.cwd(), 'private-media', 'customer-avatars');

  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.retryPendingRemovals();
  }

  async replace(
    principal: AvatarCustomer,
    file: Express.Multer.File,
    idempotencyKey: string,
    metadata: SessionMetadata = {},
  ) {
    const customerId = principal.id;
    if (!file) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'AVATAR_FILE_REQUIRED', '请选择头像图片');
    }
    if (!Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'AVATAR_CONTENT_INVALID', '图片内容无效');
    }
    if (Math.max(file.size, file.buffer.length) > AVATAR_MAX_BYTES) {
      throw new ApiError(HttpStatus.PAYLOAD_TOO_LARGE, 'AVATAR_FILE_TOO_LARGE', '头像图片不能超过 5MB');
    }
    const declaredFormat = SUPPORTED_AVATAR_TYPES.get(file.mimetype);
    if (!declaredFormat) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'AVATAR_TYPE_INVALID', '头像仅支持 JPG、PNG 或 WebP 格式');
    }

    let imageMetadata: { format?: string; width?: number; height?: number };
    try {
      imageMetadata = await sharp(file.buffer, {
        failOn: 'warning',
        limitInputPixels: AVATAR_MAX_PIXELS,
      }).metadata();
    } catch {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'AVATAR_CONTENT_INVALID', '图片内容无效或尺寸过大');
    }
    if (
      imageMetadata.format !== declaredFormat
      || !imageMetadata.width
      || !imageMetadata.height
      || imageMetadata.width * imageMetadata.height > AVATAR_MAX_PIXELS
    ) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'AVATAR_CONTENT_INVALID', '图片内容与声明格式不一致或尺寸过大');
    }

    let output: Buffer;
    try {
      output = await sharp(file.buffer, {
        failOn: 'warning',
        limitInputPixels: AVATAR_MAX_PIXELS,
      })
        .rotate()
        .resize(AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE, { fit: 'cover', position: 'centre' })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'AVATAR_CONTENT_INVALID', '头像处理失败，请更换图片后重试');
    }

    const directory = join(this.root, String(customerId));
    const storageKey = this.replaceStorageKey(customerId, idempotencyKey);
    const outputPath = this.resolveStorageKey(storageKey);
    if (!outputPath) {
      throw new ApiError(HttpStatus.INTERNAL_SERVER_ERROR, 'AVATAR_STORAGE_ERROR', '头像保存失败，请稍后重试');
    }
    const previous = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { avatarStorageKey: true, status: true, authVersion: true },
    });
    if (!previous) {
      throw new ApiError(HttpStatus.NOT_FOUND, 'CUSTOMER_NOT_FOUND', '客户不存在');
    }
    if (previous.status !== 'ACTIVE' || previous.authVersion !== principal.authVersion) {
      throw this.avatarAuthenticationChanged();
    }
    if (previous.avatarStorageKey === storageKey) {
      await this.assertReplayContent(outputPath, output);
      return { avatarUrl: '/api/customers/me/avatar', updatedAt: new Date() };
    }
    const previousOwnedStorageKey = previous.avatarStorageKey
      && this.resolveStorageKey(previous.avatarStorageKey, customerId)
      ? previous.avatarStorageKey
      : null;
    let previousRemovalPrepared = false;
    let newRemovalPrepared = false;
    try {
      if (previousOwnedStorageKey && previousOwnedStorageKey !== storageKey) {
        previousRemovalPrepared = await this.prepareRemoval(previousOwnedStorageKey, customerId);
      }
      newRemovalPrepared = await this.prepareRemoval(storageKey);
      await mkdir(directory, { recursive: true });
      try {
        await writeFile(outputPath, output, { flag: 'wx' });
      } catch (error) {
        if (!isExistingFileError(error)) throw error;
        await this.assertReplayContent(outputPath, output);
      }
    } catch (error) {
      if (previousRemovalPrepared && previousOwnedStorageKey) {
        await this.cancelPreparedRemoval(previousOwnedStorageKey);
      }
      // 同一幂等键的并发请求可能正在使用该文件；失败路径保留删除标记，
      // 由后续同键重试接管，或在进程启动恢复时按数据库当前引用安全清理。
      if (!newRemovalPrepared || !(error instanceof ApiError)) {
        await this.cancelPreparedRemoval(storageKey);
      }
      if (error instanceof ApiError) throw error;
      throw new ApiError(HttpStatus.INTERNAL_SERVER_ERROR, 'AVATAR_STORAGE_ERROR', '头像保存失败，请稍后重试');
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        const current = await this.lockActiveCustomer(tx, principal);
        if (current.avatarStorageKey !== previous.avatarStorageKey) {
          throw this.avatarStateChanged();
        }
        const claimed = await tx.customer.updateMany({
          where: {
            id: customerId,
            status: 'ACTIVE',
            authVersion: principal.authVersion,
            avatarStorageKey: previous.avatarStorageKey,
          },
          data: { avatarStorageKey: storageKey },
        });
        if (claimed.count !== 1) {
          throw this.avatarStateChanged();
        }
        await tx.customerSecurityEvent.create({
          data: {
            customerId,
            eventType: 'AVATAR_REPLACED',
            ipHash: optionalHash(metadata.ip),
            userAgentHash: optionalHash(metadata.userAgent),
          },
        });
      });
    } catch (error) {
      if (previousRemovalPrepared && previousOwnedStorageKey) {
        await this.cancelPreparedRemoval(previousOwnedStorageKey);
      }
      if (await this.isCurrentReplay(principal, storageKey, outputPath, output)) {
        await this.cancelPreparedRemoval(storageKey);
        if (previousOwnedStorageKey && previousOwnedStorageKey !== storageKey) {
          await this.completePreparedRemoval(previousOwnedStorageKey);
        }
        return { avatarUrl: '/api/customers/me/avatar', updatedAt: new Date() };
      }
      // 不能立即删除确定性文件：同一幂等键的另一请求可能已取得或正在等待客户行锁。
      // 删除标记会在后续重试或启动恢复时根据数据库引用完成清理。
      throw error;
    }
    await this.cancelPreparedRemoval(storageKey);
    if (previousOwnedStorageKey && previousOwnedStorageKey !== storageKey) {
      await this.completePreparedRemoval(previousOwnedStorageKey);
    }
    return { avatarUrl: '/api/customers/me/avatar', updatedAt: new Date() };
  }

  async replaceStatus(principal: AvatarCustomer, idempotencyKey: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: principal.id },
      select: { avatarStorageKey: true, status: true, authVersion: true },
    });
    if (!customer) {
      throw new ApiError(HttpStatus.NOT_FOUND, 'CUSTOMER_NOT_FOUND', '客户不存在');
    }
    if (customer.status !== 'ACTIVE' || customer.authVersion !== principal.authVersion) {
      throw this.avatarAuthenticationChanged();
    }
    const expectedStorageKey = this.replaceStorageKey(principal.id, idempotencyKey);
    if (customer.avatarStorageKey !== expectedStorageKey) {
      return { status: 'NOT_CURRENT' as const };
    }
    const filePath = this.resolveStorageKey(expectedStorageKey, principal.id);
    if (!filePath) {
      throw new ApiError(HttpStatus.INTERNAL_SERVER_ERROR, 'AVATAR_STORAGE_ERROR', '头像状态核验失败');
    }
    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) throw new Error('not a file');
    } catch {
      throw new ApiError(HttpStatus.INTERNAL_SERVER_ERROR, 'AVATAR_STORAGE_ERROR', '头像状态核验失败');
    }
    return { status: 'CURRENT' as const };
  }

  async delete(principal: AvatarCustomer, metadata: SessionMetadata) {
    const customerId = principal.id;
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { avatarStorageKey: true, status: true, authVersion: true },
    });
    if (!customer) {
      throw new ApiError(HttpStatus.NOT_FOUND, 'CUSTOMER_NOT_FOUND', '客户不存在');
    }
    if (customer.status !== 'ACTIVE' || customer.authVersion !== principal.authVersion) {
      throw this.avatarAuthenticationChanged();
    }
    if (!customer.avatarStorageKey) {
      return { avatarUrl: null, updatedAt: new Date() };
    }

    // 数据库若意外引用到其他客户的 key，只清除本客户引用，绝不排队或删除他人文件。
    const ownedStorageKey = this.resolveStorageKey(customer.avatarStorageKey, customerId)
      ? customer.avatarStorageKey
      : null;
    const removalPrepared = ownedStorageKey
      ? await this.prepareRemoval(ownedStorageKey, customerId)
      : false;
    const now = new Date();
    try {
      await this.prisma.$transaction(async (tx) => {
        const current = await this.lockActiveCustomer(tx, principal);
        if (current.avatarStorageKey !== customer.avatarStorageKey) {
          throw this.avatarStateChanged();
        }
        const claimed = await tx.customer.updateMany({
          where: {
            id: customerId,
            status: 'ACTIVE',
            authVersion: principal.authVersion,
            avatarStorageKey: customer.avatarStorageKey,
          },
          data: { avatarStorageKey: null },
        });
        if (claimed.count !== 1) {
          throw this.avatarStateChanged();
        }
        await tx.customerSecurityEvent.create({
          data: {
            customerId,
            eventType: 'AVATAR_REMOVED',
            ipHash: optionalHash(metadata.ip),
            userAgentHash: optionalHash(metadata.userAgent),
          },
        });
      });
    } catch (error) {
      if (removalPrepared && ownedStorageKey) {
        await this.cancelPreparedRemoval(ownedStorageKey);
      }
      throw error;
    }
    if (removalPrepared && ownedStorageKey) {
      await this.completePreparedRemoval(ownedStorageKey);
    }
    return { avatarUrl: null, updatedAt: now };
  }

  async read(principal: AvatarCustomer): Promise<Buffer> {
    return this.prisma.$transaction(async (transaction) => {
      await lockActiveCustomerForRead(transaction, principal);
      const customer = await transaction.customer.findUnique({
        where: { id: principal.id },
        select: { avatarStorageKey: true },
      });
      const filePath = customer?.avatarStorageKey
        ? this.resolveStorageKey(customer.avatarStorageKey, principal.id)
        : null;
      if (!filePath || !existsSync(filePath)) {
        throw new ApiError(HttpStatus.NOT_FOUND, 'AVATAR_NOT_FOUND', '头像不存在');
      }
      try {
        const fileStat = await stat(filePath);
        if (!fileStat.isFile()) throw new Error('not a file');
        return await readFile(filePath);
      } catch {
        throw new ApiError(HttpStatus.NOT_FOUND, 'AVATAR_NOT_FOUND', '头像不存在');
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async remove(
    storageKey: string | null | undefined,
    expectedCustomerId?: number,
  ): Promise<void> {
    if (!storageKey) return;
    const prepared = await this.prepareRemoval(storageKey, expectedCustomerId);
    if (!prepared) return;
    await this.completePreparedRemoval(storageKey);
  }

  /** 在数据库或文件引用切换前持久化删除意图，供崩溃恢复按当前引用状态判定。 */
  async prepareRemoval(
    storageKey: string | null | undefined,
    expectedCustomerId?: number,
  ): Promise<boolean> {
    if (!storageKey) return false;
    const customerId = this.storageKeyCustomerId(storageKey);
    if (
      customerId === null
      || (expectedCustomerId !== undefined && customerId !== expectedCustomerId)
      || !this.resolveStorageKey(storageKey, customerId)
    ) {
      this.logger.error('头像删除引用格式无效，无法定位文件');
      return false;
    }
    await this.queueRemoval({
      customerId,
      storageKey,
      queuedAt: new Date().toISOString(),
    }, this.removalMarkerId(storageKey));
    return true;
  }

  /** 完成已持久化的删除意图；当前仍被数据库引用时只取消任务，绝不删文件。 */
  async completePreparedRemoval(storageKey: string | null | undefined): Promise<void> {
    if (!storageKey) return;
    const customerId = this.storageKeyCustomerId(storageKey);
    if (customerId === null) return;
    const markerId = this.removalMarkerId(storageKey);
    try {
      await this.processPreparedRemoval({ customerId, storageKey, queuedAt: '' }, markerId);
    } catch {
      this.logger.warn(`头像删除未完成，已保留持久化重试任务（任务 ${markerId}）`);
    }
  }

  async cancelPreparedRemoval(storageKey: string | null | undefined): Promise<void> {
    if (!storageKey) return;
    const markerId = this.removalMarkerId(storageKey);
    await this.clearRemovalMarker(markerId).catch(() => {
      this.logger.warn(`头像删除任务取消失败，将在启动恢复时重新核对（任务 ${markerId}）`);
    });
  }

  /** 启动时按 Customer 当前引用重试删除；仍被引用的文件只取消任务，不会误删。 */
  async retryPendingRemovals(): Promise<void> {
    let markerNames: string[];
    try {
      markerNames = await readdir(this.pendingRemovalRoot);
    } catch (error) {
      if (isMissingFileError(error)) return;
      this.logger.error('无法读取头像删除重试队列');
      return;
    }
    for (const markerName of markerNames) {
      if (!/^[a-f0-9]{64}\.json$/.test(markerName)) continue;
      const markerPath = join(this.pendingRemovalRoot, markerName);
      const markerId = markerName.slice(0, -5);
      try {
        const parsed = JSON.parse(await readFile(markerPath, 'utf8')) as Partial<PendingAvatarRemoval>;
        if (!Number.isInteger(parsed.customerId) || typeof parsed.storageKey !== 'string') {
          throw new Error('invalid marker');
        }
        const customerId = this.storageKeyCustomerId(parsed.storageKey);
        if (
          customerId !== parsed.customerId
          || !this.resolveStorageKey(parsed.storageKey, customerId)
          || this.removalMarkerId(parsed.storageKey) !== markerId
        ) {
          throw new Error('invalid storage key');
        }
        await this.processPreparedRemoval(parsed as PendingAvatarRemoval, markerId);
        this.logger.log(`头像删除重试完成（任务 ${markerId}）`);
      } catch {
        // 保留任务供下次启动继续处理；任务 ID 可用于定位，但不把 storageKey 写入日志。
        this.logger.warn(`头像删除重试未完成（任务 ${markerId}）`);
      }
    }
  }

  private get pendingRemovalRoot(): string {
    return join(this.root, '.pending-delete');
  }

  private async lockActiveCustomer(
    tx: Prisma.TransactionClient,
    principal: AvatarCustomer,
  ): Promise<{ avatarStorageKey: string | null }> {
    const customerId = principal.id;
    const locked = await tx.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`SELECT id FROM customers WHERE id = ${customerId} FOR UPDATE`,
    );
    if (locked.length !== 1) {
      throw new ApiError(HttpStatus.NOT_FOUND, 'CUSTOMER_NOT_FOUND', '客户不存在');
    }
    const customer = await tx.customer.findUnique({
      where: { id: customerId },
      select: { status: true, avatarStorageKey: true, authVersion: true },
    });
    if (
      !customer
      || customer.status !== 'ACTIVE'
      || customer.authVersion !== principal.authVersion
    ) {
      throw this.avatarAuthenticationChanged();
    }
    return { avatarStorageKey: customer.avatarStorageKey };
  }

  private avatarStateChanged() {
    return new ApiError(
      HttpStatus.CONFLICT,
      'AVATAR_UPDATE_CONFLICT',
      '账户或头像状态已发生变化，请重新登录后再试',
    );
  }

  private avatarAuthenticationChanged() {
    return new ApiError(
      HttpStatus.UNAUTHORIZED,
      'CUSTOMER_AUTH_CHANGED',
      '登录状态已发生变化，请重新登录后再试',
    );
  }

  private replaceStorageKey(customerId: number, idempotencyKey: string): string {
    const digest = this.idempotency.scopedHash(`customer-avatar-${customerId}`, idempotencyKey);
    const uuid = digest.slice(0, 32).split('');
    uuid[12] = '5';
    uuid[16] = ['8', '9', 'a', 'b'][Number.parseInt(uuid[16], 16) % 4];
    return `${customerId}/${uuid.slice(0, 8).join('')}-${uuid.slice(8, 12).join('')}-${uuid.slice(12, 16).join('')}-${uuid.slice(16, 20).join('')}-${uuid.slice(20).join('')}.webp`;
  }

  private async assertReplayContent(outputPath: string, output: Buffer): Promise<void> {
    try {
      const existing = await readFile(outputPath);
      if (existing.equals(output)) return;
    } catch {
      throw new ApiError(HttpStatus.INTERNAL_SERVER_ERROR, 'AVATAR_STORAGE_ERROR', '头像保存状态异常，请稍后重试');
    }
    throw new ApiError(
      HttpStatus.CONFLICT,
      'AVATAR_IDEMPOTENCY_KEY_REUSED',
      '本次上传凭据已用于不同图片，请重新选择后再试',
    );
  }

  private async isCurrentReplay(
    principal: AvatarCustomer,
    storageKey: string,
    outputPath: string,
    output: Buffer,
  ): Promise<boolean> {
    try {
      const current = await this.prisma.customer.findUnique({
        where: { id: principal.id },
        select: { avatarStorageKey: true, status: true, authVersion: true },
      });
      if (
        current?.status !== 'ACTIVE'
        || current.authVersion !== principal.authVersion
        || current.avatarStorageKey !== storageKey
      ) {
        return false;
      }
      const existing = await readFile(outputPath);
      return existing.equals(output);
    } catch {
      return false;
    }
  }

  private removalMarkerId(storageKey: string): string {
    return createHash('sha256').update(storageKey).digest('hex');
  }

  private async queueRemoval(removal: PendingAvatarRemoval, markerId: string): Promise<void> {
    await mkdir(this.pendingRemovalRoot, { recursive: true });
    await writeFile(
      join(this.pendingRemovalRoot, `${markerId}.json`),
      JSON.stringify(removal),
      { encoding: 'utf8', mode: 0o600 },
    );
  }

  private async processPreparedRemoval(removal: PendingAvatarRemoval, markerId: string): Promise<void> {
    const current = await this.prisma.customer.findUnique({
      where: { id: removal.customerId },
      select: { avatarStorageKey: true },
    });
    if (current?.avatarStorageKey === removal.storageKey) {
      await this.clearRemovalMarker(markerId);
      return;
    }
    const filePath = this.resolveStorageKey(removal.storageKey, removal.customerId);
    if (!filePath) throw new Error('invalid storage key');
    try {
      await unlink(filePath);
    } catch (error) {
      if (!isMissingFileError(error)) throw error;
    }
    await this.clearRemovalMarker(markerId);
  }

  private async clearRemovalMarker(markerId: string): Promise<void> {
    await unlink(join(this.pendingRemovalRoot, `${markerId}.json`)).catch((error) => {
      if (!isMissingFileError(error)) throw error;
    });
  }

  private resolveStorageKey(storageKey: string, expectedCustomerId?: number): string | null {
    const normalized = storageKey.replace(/\\/g, '/');
    const match = /^(\d+)\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/i.exec(normalized);
    if (!match || (expectedCustomerId !== undefined && Number(match[1]) !== expectedCustomerId)) {
      return null;
    }
    const target = resolve(this.root, normalized);
    const rel = relative(this.root, target);
    if (
      !rel
      || rel === '..'
      || rel.startsWith(`..${sep}`)
      || rel.startsWith('../')
      || rel.includes(`..${sep}`)
    ) {
      return null;
    }
    return target;
  }

  private storageKeyCustomerId(storageKey: string): number | null {
    const match = /^(\d+)\//.exec(storageKey.replace(/\\/g, '/'));
    if (!match) return null;
    const customerId = Number(match[1]);
    return Number.isSafeInteger(customerId) && customerId > 0 ? customerId : null;
  }
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error
    && 'code' in error
    && error.code === 'ENOENT';
}

function isExistingFileError(error: unknown): boolean {
  return error instanceof Error
    && 'code' in error
    && error.code === 'EEXIST';
}
