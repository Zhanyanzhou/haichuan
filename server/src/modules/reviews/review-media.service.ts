import { ConflictException, HttpStatus, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { ApiError } from '../../common/errors/api-error';
import { IdempotencyService } from '../../common/idempotency/idempotency-key';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { CustomerPrincipal } from '../../common/security/authenticated-principal';
import { Prisma } from '@prisma/client';
import {
  lockActiveCustomerForRead,
  lockActiveCustomerForWrite,
} from '../customers/customer-write-gate';
import {
  isSafeLegacyReviewImageUrl,
  parseReviewImageReference,
  REVIEW_IMAGE_REFERENCE_PREFIX,
  reviewImages,
} from './review-media-reference';
import {
  lockAuthorizedReviewStaff,
  type ReviewStaffActor,
} from './review-staff-authorization';

const sharp = require('sharp');

const REVIEW_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const REVIEW_IMAGE_MAX_PIXELS = 40_000_000;
const REVIEW_IMAGE_MAX_EDGE = 1800;
const SUPPORTED_IMAGE_TYPES = new Map([
  ['image/jpeg', 'jpeg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

type ReviewMediaCustomer = Pick<CustomerPrincipal, 'id' | 'authVersion'>;

function isMissingFile(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === 'ENOENT');
}

@Injectable()
export class ReviewMediaService implements OnModuleInit {
  private readonly logger = new Logger(ReviewMediaService.name);
  private readonly root = resolve(
    process.env.REVIEW_MEDIA_ROOT || join(process.cwd(), 'private-media', 'review-images'),
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.cleanupUnreferencedUploads();
    } catch (error) {
      this.logger.warn(`晒单图孤儿文件清理未完成：${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  async upload(
    principal: ReviewMediaCustomer,
    file: Express.Multer.File,
    idempotencyKey: string,
  ) {
    await this.assertActiveCustomer(principal);
    if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'REVIEW_IMAGE_REQUIRED', '请选择晒单图片');
    }
    if (Math.max(file.size || 0, file.buffer.length) > REVIEW_IMAGE_MAX_BYTES) {
      throw new ApiError(HttpStatus.PAYLOAD_TOO_LARGE, 'REVIEW_IMAGE_TOO_LARGE', '晒单图片不能超过 10MB');
    }
    const declaredFormat = SUPPORTED_IMAGE_TYPES.get(file.mimetype);
    if (!declaredFormat) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'REVIEW_IMAGE_TYPE_INVALID', '晒单图仅支持 JPG、PNG 或 WebP 格式');
    }

    let metadata: { format?: string; width?: number; height?: number };
    try {
      metadata = await sharp(file.buffer, {
        failOn: 'warning',
        limitInputPixels: REVIEW_IMAGE_MAX_PIXELS,
      }).metadata();
    } catch {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'REVIEW_IMAGE_CONTENT_INVALID', '晒单图片内容无效或尺寸过大');
    }
    if (
      metadata.format !== declaredFormat
      || !metadata.width
      || !metadata.height
      || metadata.width * metadata.height > REVIEW_IMAGE_MAX_PIXELS
    ) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'REVIEW_IMAGE_CONTENT_INVALID', '晒单图片内容与声明格式不一致或尺寸过大');
    }

    let output: Buffer;
    try {
      output = await sharp(file.buffer, {
        failOn: 'warning',
        limitInputPixels: REVIEW_IMAGE_MAX_PIXELS,
      })
        .rotate()
        .resize(REVIEW_IMAGE_MAX_EDGE, REVIEW_IMAGE_MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'REVIEW_IMAGE_CONTENT_INVALID', '晒单图片处理失败，请更换图片后重试');
    }

    const reference = this.referenceFor(principal.id, idempotencyKey);
    const path = this.pathForReference(reference, principal.id);
    if (!path) {
      throw new ApiError(HttpStatus.INTERNAL_SERVER_ERROR, 'REVIEW_IMAGE_STORAGE_ERROR', '晒单图片保存失败');
    }
    await this.prisma.$transaction(async (tx) => {
      // 与评价提交、账户注销及孤儿清理共用 customers 行锁。否则多实例启动清理
      // 可能在另一实例完成文件校验后、评价入库前删除同一图片。
      await lockActiveCustomerForWrite(tx, principal);
      await mkdir(join(this.root, String(principal.id)), { recursive: true });
      try {
        await writeFile(path, output, { flag: 'wx' });
      } catch (error) {
        if (!error || typeof error !== 'object' || (error as { code?: string }).code !== 'EEXIST') {
          throw new ApiError(HttpStatus.INTERNAL_SERVER_ERROR, 'REVIEW_IMAGE_STORAGE_ERROR', '晒单图片保存失败');
        }
        const existing = await readFile(path);
        if (!existing.equals(output)) {
          throw new ConflictException({
            code: 'REVIEW_IMAGE_IDEMPOTENCY_KEY_REUSED',
            message: '该上传凭据已用于另一张晒单图，请重新选择图片',
          });
        }
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { reference };
  }

  async uploadStatus(principal: ReviewMediaCustomer, idempotencyKey: string) {
    await this.assertActiveCustomer(principal);
    const reference = this.referenceFor(principal.id, idempotencyKey);
    const path = this.pathForReference(reference, principal.id);
    if (!path) return { status: 'MISSING' as const };
    try {
      const file = await stat(path);
      return file.isFile()
        ? { status: 'AVAILABLE' as const, reference }
        : { status: 'MISSING' as const };
    } catch (error) {
      if (isMissingFile(error)) return { status: 'MISSING' as const };
      throw new ApiError(HttpStatus.INTERNAL_SERVER_ERROR, 'REVIEW_IMAGE_STORAGE_ERROR', '晒单图片状态核验失败');
    }
  }

  async assertOwnedReferences(customerId: number, references: string[]): Promise<void> {
    if (references.length > 6) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'REVIEW_IMAGE_LIMIT', '晒单图最多 6 张');
    }
    if (new Set(references).size !== references.length) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'REVIEW_IMAGE_DUPLICATED', '晒单图不能重复');
    }
    for (const reference of references) {
      const path = this.pathForReference(reference, customerId);
      if (!path) {
        throw new ApiError(HttpStatus.BAD_REQUEST, 'REVIEW_IMAGE_REFERENCE_INVALID', '晒单图凭据无效');
      }
      try {
        const file = await stat(path);
        if (!file.isFile()) throw new Error('not a file');
      } catch {
        throw new ApiError(HttpStatus.BAD_REQUEST, 'REVIEW_IMAGE_NOT_FOUND', '晒单图不存在或已失效');
      }
    }
  }

  projectPublic(reviewId: number, images: unknown): string[] {
    return reviewImages(images).flatMap((reference, index) => {
      if (parseReviewImageReference(reference)) return [`/reviews/media/public/${reviewId}/${index}`];
      return isSafeLegacyReviewImageUrl(reference) ? [reference] : [];
    });
  }

  projectStaff(reviewId: number, images: unknown): string[] {
    return reviewImages(images).flatMap((reference, index) => {
      if (parseReviewImageReference(reference)) return [`/reviews/${reviewId}/media/${index}`];
      return isSafeLegacyReviewImageUrl(reference) ? [reference] : [];
    });
  }

  async readPublic(reviewId: number, index: number): Promise<Buffer> {
    const review = await this.prisma.productReview.findFirst({
      where: { id: reviewId, status: 'APPROVED' },
      select: { images: true },
    });
    if (!review) throw new NotFoundException('评价图片不存在');
    return this.readIndexedPrivateImage(review.images, index);
  }

  async readForStaff(
    actor: ReviewStaffActor,
    reviewId: number,
    index: number,
  ): Promise<Buffer> {
    return this.prisma.$transaction(async (transaction) => {
      await lockAuthorizedReviewStaff(transaction, actor, 'READ', 'read');
      const review = await transaction.productReview.findUnique({
        where: { id: reviewId },
        select: { images: true },
      });
      if (!review) throw new NotFoundException('评价图片不存在');
      return this.readIndexedPrivateImage(review.images, index);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async readForCustomer(
    principal: ReviewMediaCustomer,
    reviewId: number,
    index: number,
  ): Promise<Buffer> {
    return this.prisma.$transaction(async (transaction) => {
      await lockActiveCustomerForRead(transaction, principal);
      const review = await transaction.productReview.findFirst({
        where: { id: reviewId, customerId: principal.id },
        select: { images: true },
      });
      if (!review) throw new NotFoundException('评价图片不存在');
      return this.readIndexedPrivateImage(review.images, index, principal.id);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async readIndexedPrivateImage(
    images: unknown,
    index: number,
    expectedCustomerId?: number,
  ): Promise<Buffer> {
    const references = reviewImages(images);
    const reference = Number.isInteger(index) && index >= 0 ? references[index] : undefined;
    const path = reference ? this.pathForReference(reference, expectedCustomerId) : null;
    if (!path) throw new NotFoundException('评价图片不存在');
    try {
      return await readFile(path);
    } catch {
      throw new NotFoundException('评价图片不存在');
    }
  }

  private referenceFor(customerId: number, idempotencyKey: string): string {
    const hash = this.idempotency.scopedHash(`review-image:${customerId}`, idempotencyKey);
    return `${REVIEW_IMAGE_REFERENCE_PREFIX}${customerId}:${hash}`;
  }

  private pathForReference(reference: string, expectedCustomerId?: number): string | null {
    const parsed = parseReviewImageReference(reference, expectedCustomerId);
    if (!parsed) return null;
    const candidate = resolve(this.root, String(parsed.customerId), `${parsed.hash}.webp`);
    const rootPrefix = `${this.root}${sep}`;
    return candidate.startsWith(rootPrefix) ? candidate : null;
  }

  private async assertActiveCustomer(principal: ReviewMediaCustomer): Promise<void> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: principal.id },
      select: { status: true, authVersion: true },
    });
    if (!customer || customer.status !== 'ACTIVE' || customer.authVersion !== principal.authVersion) {
      throw new ApiError(HttpStatus.UNAUTHORIZED, 'CUSTOMER_SESSION_INVALID', '客户会话已失效，请重新登录');
    }
  }

  private async cleanupUnreferencedUploads(): Promise<void> {
    let customerDirectories: string[];
    try {
      customerDirectories = await readdir(this.root);
    } catch (error) {
      if (isMissingFile(error)) return;
      throw error;
    }
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const customerDirectory of customerDirectories) {
      if (!/^\d+$/.test(customerDirectory)) continue;
      const customerId = Number(customerDirectory);
      if (!Number.isSafeInteger(customerId) || customerId <= 0) continue;
      await this.prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<Array<{ id: number }>>(
          Prisma.sql`SELECT id FROM customers WHERE id = ${customerId} FOR UPDATE`,
        );
        if (locked.length !== 1) return;
        const reviews = await tx.productReview.findMany({
          where: { customerId },
          select: { images: true },
        });
        const referenced = new Set<string>();
        for (const review of reviews) {
          for (const reference of reviewImages(review.images)) {
            const path = this.pathForReference(reference, customerId);
            if (path) referenced.add(path);
          }
        }
        const directory = join(this.root, customerDirectory);
        for (const name of await readdir(directory)) {
          if (!/^[a-f0-9]{64}\.webp$/.test(name)) continue;
          const path = join(directory, name);
          if (referenced.has(path)) continue;
          const file = await stat(path);
          if (file.mtimeMs < cutoff) await unlink(path);
        }
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    }
  }
}
