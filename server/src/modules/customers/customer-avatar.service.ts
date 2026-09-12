import { HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { ApiError } from '../../common/errors/api-error';
import { PrismaService } from '../../common/prisma/prisma.service';

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

@Injectable()
export class CustomerAvatarService implements OnModuleInit {
  private readonly logger = new Logger(CustomerAvatarService.name);
  private readonly root = resolve(process.cwd(), 'private-media', 'customer-avatars');

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.retryPendingRemovals();
  }

  async replace(customerId: number, file: Express.Multer.File) {
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

    let metadata: { format?: string; width?: number; height?: number };
    try {
      metadata = await sharp(file.buffer, {
        failOn: 'warning',
        limitInputPixels: AVATAR_MAX_PIXELS,
      }).metadata();
    } catch {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'AVATAR_CONTENT_INVALID', '图片内容无效或尺寸过大');
    }
    if (
      metadata.format !== declaredFormat
      || !metadata.width
      || !metadata.height
      || metadata.width * metadata.height > AVATAR_MAX_PIXELS
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
    const storageKey = `${customerId}/${randomUUID()}.webp`;
    const outputPath = this.resolveStorageKey(storageKey);
    if (!outputPath) {
      throw new ApiError(HttpStatus.INTERNAL_SERVER_ERROR, 'AVATAR_STORAGE_ERROR', '头像保存失败，请稍后重试');
    }
    const previous = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { avatarStorageKey: true },
    });
    if (!previous) {
      throw new ApiError(HttpStatus.NOT_FOUND, 'CUSTOMER_NOT_FOUND', '客户不存在');
    }
    let previousRemovalPrepared = false;
    let newRemovalPrepared = false;
    try {
      if (previous.avatarStorageKey && previous.avatarStorageKey !== storageKey) {
        previousRemovalPrepared = await this.prepareRemoval(previous.avatarStorageKey);
      }
      newRemovalPrepared = await this.prepareRemoval(storageKey);
      await mkdir(directory, { recursive: true });
      await writeFile(outputPath, output, { flag: 'wx' });
    } catch {
      if (previousRemovalPrepared && previous.avatarStorageKey) {
        await this.cancelPreparedRemoval(previous.avatarStorageKey);
      }
      if (newRemovalPrepared) await this.completePreparedRemoval(storageKey);
      throw new ApiError(HttpStatus.INTERNAL_SERVER_ERROR, 'AVATAR_STORAGE_ERROR', '头像保存失败，请稍后重试');
    }

    try {
      const claimed = await this.prisma.customer.updateMany({
        where: { id: customerId, avatarStorageKey: previous.avatarStorageKey },
        data: { avatarStorageKey: storageKey },
      });
      if (claimed.count !== 1) {
        throw new ApiError(HttpStatus.CONFLICT, 'AVATAR_UPDATE_CONFLICT', '头像已发生变化，请重新选择后再试');
      }
    } catch (error) {
      await this.completePreparedRemoval(storageKey);
      if (previousRemovalPrepared && previous.avatarStorageKey) {
        await this.cancelPreparedRemoval(previous.avatarStorageKey);
      }
      throw error;
    }
    await this.cancelPreparedRemoval(storageKey);
    if (previous.avatarStorageKey && previous.avatarStorageKey !== storageKey) {
      await this.completePreparedRemoval(previous.avatarStorageKey);
    }
    return { avatarUrl: '/api/customers/me/avatar', updatedAt: new Date() };
  }

  async read(customerId: number): Promise<Buffer> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { avatarStorageKey: true },
    });
    const filePath = customer?.avatarStorageKey
      ? this.resolveStorageKey(customer.avatarStorageKey, customerId)
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
  }

  async remove(storageKey: string | null | undefined): Promise<void> {
    if (!storageKey) return;
    const prepared = await this.prepareRemoval(storageKey);
    if (!prepared) return;
    await this.completePreparedRemoval(storageKey);
  }

  /** 在数据库或文件引用切换前持久化删除意图，供崩溃恢复按当前引用状态判定。 */
  async prepareRemoval(storageKey: string | null | undefined): Promise<boolean> {
    if (!storageKey) return false;
    const customerId = this.storageKeyCustomerId(storageKey);
    if (customerId === null || !this.resolveStorageKey(storageKey, customerId)) {
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
