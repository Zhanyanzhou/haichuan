import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { MediaAccessLevel, MediaAssetStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { basename, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { resolveMediaStorageRoots } from './media-storage-paths';

export const DESIGN_FILE_MAX_BYTES = 100 * 1024 * 1024;
export const DESIGN_FILE_EXTENSIONS = [
  '.3dm',
  '.3mf',
  '.obj',
  '.step',
  '.stl',
  '.stp',
] as const;

export type DesignMediaAssetDescriptor = {
  id: number;
  storageKey: string;
  originalName: string | null;
  mimeType: string;
  byteSize: number;
  checksumSha256: string;
  accessLevel: MediaAccessLevel;
  status: MediaAssetStatus;
};

export function assertSafeDesignFile(file: Express.Multer.File) {
  if (!file) throw new BadRequestException('未选择 3D 文件');
  if (file.size <= 0 || file.buffer.length !== file.size) {
    throw new BadRequestException('3D 文件内容为空或上传不完整');
  }
  if (file.size > DESIGN_FILE_MAX_BYTES) {
    throw new BadRequestException('3D 文件大小不能超过 100MB');
  }
  const normalized = file.originalname.normalize('NFC');
  const extension = extname(normalized).toLowerCase();
  if (
    !normalized ||
    normalized.length > 255 ||
    basename(normalized) !== normalized ||
    normalized.includes('/') ||
    normalized.includes('\\') ||
    normalized.includes('..') ||
    /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(normalized) ||
    !DESIGN_FILE_EXTENSIONS.includes(extension as (typeof DESIGN_FILE_EXTENSIONS)[number])
  ) {
    throw new BadRequestException('仅支持安全命名的 3DM、3MF、OBJ、STEP、STL 或 STP 文件');
  }
  return { normalizedName: normalized, extension };
}

export function resolveDesignMediaPath(storageKey: string) {
  const segments = storageKey.split('/');
  if (
    !storageKey.startsWith('design-assets/') ||
    segments.length < 2 ||
    segments.some((segment) => !segment || segment === '.' || segment === '..') ||
    storageKey.includes('\\') ||
    /[\u0000-\u001f\u007f]/u.test(storageKey)
  ) {
    return null;
  }
  const root = resolve(resolveMediaStorageRoots().privateMediaRoot, 'design-files');
  const candidate = resolve(root, ...segments);
  const fromRoot = relative(root, candidate);
  if (
    fromRoot === '' ||
    fromRoot === '..' ||
    fromRoot.startsWith(`..${sep}`) ||
    isAbsolute(fromRoot)
  ) {
    return null;
  }
  return candidate;
}

export async function readVerifiedDesignMediaAsset(
  asset: DesignMediaAssetDescriptor,
  expectedChecksum?: string,
) {
  if (
    asset.accessLevel !== 'PRIVATE' ||
    asset.status !== 'READY' ||
    !/^[a-f0-9]{64}$/.test(asset.checksumSha256)
  ) {
    throw new ConflictException('3D 文件媒体资产当前不可读取');
  }
  if (expectedChecksum && asset.checksumSha256 !== expectedChecksum) {
    throw new ConflictException('3D 文件版本与媒体资产校验摘要不一致');
  }
  const filePath = resolveDesignMediaPath(asset.storageKey);
  if (!filePath || !existsSync(filePath)) {
    throw new NotFoundException('3D 文件字节不存在');
  }
  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat?.isFile() || fileStat.size !== asset.byteSize || fileStat.size <= 0) {
    throw new ConflictException('3D 文件字节大小与媒体资产记录不一致');
  }
  const buffer = await readFile(filePath);
  const checksumSha256 = createHash('sha256').update(buffer).digest('hex');
  if (checksumSha256 !== asset.checksumSha256) {
    throw new ConflictException('3D 文件字节完整性校验失败');
  }
  return {
    buffer,
    mimeType: 'application/octet-stream',
    originalName: asset.originalName || `design-${asset.id}${extname(filePath)}`,
    checksumSha256,
    byteSize: buffer.length,
  };
}
