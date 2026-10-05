import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { CustomerPrincipal } from '../../common/security/authenticated-principal';
import {
  lockActiveCustomerForRead,
  lockActiveCustomerForWrite,
} from '../customers/customer-write-gate';
import { projectCustomerReviewImages } from './review-media-reference';
import { ReviewMediaService } from './review-media.service';
import { reviewSubmissionFingerprint } from './review-submission-fingerprint';
import {
  lockAuthorizedReviewStaff,
  type ReviewStaffActor,
} from './review-staff-authorization';

type ReviewCustomer = Pick<CustomerPrincipal, 'id' | 'authVersion'>;

type ReviewSubmission = {
  orderId: number;
  productId: number;
  rating: number;
  content: string;
  imageUrls?: string[];
};

function normalizeReviewImages(imageUrls: string[] | undefined): string[] {
  return Array.isArray(imageUrls)
    ? imageUrls.filter((url) => typeof url === 'string' && url.length > 0)
    : [];
}

function sameReviewSubmission(
  existing: {
    customerId: number;
    rating: number;
    content: string;
    images: unknown;
  },
  customerId: number,
  data: ReviewSubmission,
  images: string[],
) {
  const existingImages = Array.isArray(existing.images)
    ? existing.images.filter((value): value is string => typeof value === 'string')
    : [];
  return existing.customerId === customerId
    && existing.rating === data.rating
    && existing.content === data.content.trim()
    && JSON.stringify(existingImages) === JSON.stringify(images);
}

/** 昵称脱敏：评价前台展示用（王** / 会员138****） */
function maskIdentity(customer: { name: string | null; phone: string }): string {
  if (customer.name && customer.name.length > 0) {
    return customer.name.length <= 1
      ? `${customer.name}**`
      : `${customer.name[0]}**`;
  }
  const phone = customer.phone || '';
  return `会员${phone.slice(0, 3)}****`;
}

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reviewMedia: ReviewMediaService,
  ) {}

  /**
   * 客户提交评价：三重资格校验（订单归属 + 已完成 + 含该商品），
   * 唯一约束 (orderId, productId) 兜底防重复提交。
   */
  async submit(
    principal: ReviewCustomer,
    data: ReviewSubmission,
  ) {
    const customerId = principal.id;
    const images = normalizeReviewImages(data.imageUrls);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockActiveCustomerForWrite(tx, principal);
        // 文件存在性校验必须位于客户锁内，与多实例孤儿清理共用同一串行点。
        await this.reviewMedia.assertOwnedReferences(customerId, images);
        const order = await tx.order.findFirst({
          where: { id: data.orderId, customerId },
          include: { items: { select: { productId: true } } },
        });
        if (!order) throw new NotFoundException('订单不存在');
        if (order.status !== 'COMPLETED') {
          throw new BadRequestException('订单完成后才能评价');
        }
        if (!order.items.some((item) => item.productId === data.productId)) {
          throw new BadRequestException('该商品不在订单内，无法评价');
        }
        return tx.productReview.create({
          data: {
            productId: data.productId,
            customerId,
            orderId: data.orderId,
            rating: data.rating,
            content: data.content.trim(),
            ...(images.length > 0 ? { images } : {}),
            status: 'PENDING',
          },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.productReview.findUnique({
          where: {
            orderId_productId: {
              orderId: data.orderId,
              productId: data.productId,
            },
          },
        });
        if (existing && sameReviewSubmission(existing, customerId, data, images)) {
          return existing;
        }
        throw new BadRequestException('该订单中的这件作品您已评价过');
      }
      throw error;
    }
  }

  /** 前台展示（公开）：仅 APPROVED，昵称脱敏，附平均分与总数 */
  async listForProduct(
    productId: number,
    params: { page?: number; pageSize?: number },
  ) {
    const page = Math.max(Number(params.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(params.pageSize) || 10, 1), 50);
    const where = { productId, status: 'APPROVED' };
    const [list, total, agg] = await Promise.all([
      this.prisma.productReview.findMany({
        where,
        include: { customer: { select: { name: true, phone: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.productReview.count({ where }),
      this.prisma.productReview.aggregate({
        where,
        _avg: { rating: true },
      }),
    ]);
    return {
      list: list.map((r) => ({
        id: r.id,
        rating: r.rating,
        content: r.content,
        images: this.reviewMedia.projectPublic(r.id, r.images),
        reply: r.reply,
        repliedAt: r.repliedAt,
        createdAt: r.createdAt,
        reviewer: maskIdentity(r.customer),
      })),
      total,
      page,
      pageSize,
      averageRating: agg._avg.rating ? Math.round(agg._avg.rating * 10) / 10 : null,
    };
  }

  /** 我的评价（客户中心）：含审核状态 */
  async listMine(principal: ReviewCustomer) {
    return this.prisma.$transaction(async (transaction) => {
      await lockActiveCustomerForRead(transaction, principal);
      const reviews = await transaction.productReview.findMany({
        where: { customerId: principal.id },
        include: { product: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      });
      return reviews.map((r) => ({
        id: r.id,
        productId: r.product.id,
        productName: r.product.name,
        rating: r.rating,
        content: r.content,
        orderId: r.orderId,
        images: projectCustomerReviewImages(r.id, principal.id, r.images),
        submissionFingerprint: reviewSubmissionFingerprint({
          orderId: r.orderId,
          productId: r.product.id,
          rating: r.rating,
          content: r.content,
          images: r.images,
        }),
        reply: r.reply,
        status: r.status,
        createdAt: r.createdAt,
      }));
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  /** 后台：按状态筛选的待审/全量列表 */
  async listAll(
    params: { status?: string; page?: number; pageSize?: number },
    actor: ReviewStaffActor,
  ) {
    const page = Math.max(Number(params.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(params.pageSize) || 20, 1), 100);
    const where: Prisma.ProductReviewWhereInput = {};
    if (params.status && params.status !== 'all') where.status = params.status;
    return this.prisma.$transaction(async (transaction) => {
      await lockAuthorizedReviewStaff(transaction, actor, 'READ', 'read');
      const [list, total] = await Promise.all([
        transaction.productReview.findMany({
          where,
          include: {
            product: { select: { id: true, name: true, code: true } },
            customer: { select: { id: true, name: true, phone: true } },
            order: { select: { id: true, orderNo: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        transaction.productReview.count({ where }),
      ]);
      return {
        list: list.map((review) => ({
          ...review,
          images: this.reviewMedia.projectStaff(review.id, review.images),
        })),
        total,
        page,
        pageSize,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  /** 审核（通过/驳回）+ 商家回复。驳回后不再展示，记录保留可追溯。 */
  async moderate(
    id: number,
    data: { status: 'APPROVED' | 'REJECTED'; reply?: string },
    actor: ReviewStaffActor,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      await lockAuthorizedReviewStaff(transaction, actor, 'MODERATE', 'write');
      const review = await transaction.productReview.findUnique({ where: { id } });
      if (!review) throw new NotFoundException('评价不存在');
      return transaction.productReview.update({
        where: { id },
        data: {
          status: data.status,
          reply: data.reply?.trim() || review.reply,
          repliedAt: data.reply?.trim() ? new Date() : review.repliedAt,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
