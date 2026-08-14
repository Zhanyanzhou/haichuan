import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 客户提交评价：三重资格校验（订单归属 + 已完成 + 含该商品），
   * 唯一约束 (orderId, productId) 兜底防重复提交。
   */
  async submit(
    customerId: number,
    data: { orderId: number; productId: number; rating: number; content: string; imageUrls?: string[] },
  ) {
    const order = await this.prisma.order.findFirst({
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
    // 晒单图：仅接受字符串 URL 列表（已在 DTO 限量 6 张），存 JSON 数组
    const images = Array.isArray(data.imageUrls)
      ? data.imageUrls.filter((u) => typeof u === 'string' && u.length > 0).slice(0, 6)
      : undefined;
    try {
      return await this.prisma.productReview.create({
        data: {
          productId: data.productId,
          customerId,
          orderId: data.orderId,
          rating: data.rating,
          content: data.content.trim(),
          ...(images && images.length > 0 ? { images } : {}),
          status: 'PENDING',
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
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
        images: Array.isArray((r as { images?: unknown }).images)
          ? ((r as { images: unknown[] }).images as string[])
          : [],
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
  async listMine(customerId: number) {
    const reviews = await this.prisma.productReview.findMany({
      where: { customerId },
      include: { product: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return reviews.map((r) => ({
      id: r.id,
      productId: r.product.id,
      productName: r.product.name,
      rating: r.rating,
      content: r.content,
      reply: r.reply,
      status: r.status,
      createdAt: r.createdAt,
    }));
  }

  /** 后台：按状态筛选的待审/全量列表 */
  async listAll(params: { status?: string; page?: number; pageSize?: number }) {
    const page = Math.max(Number(params.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(params.pageSize) || 20, 1), 100);
    const where: Prisma.ProductReviewWhereInput = {};
    if (params.status && params.status !== 'all') where.status = params.status;
    const [list, total] = await Promise.all([
      this.prisma.productReview.findMany({
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
      this.prisma.productReview.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  /** 审核（通过/驳回）+ 商家回复。驳回后不再展示，记录保留可追溯。 */
  async moderate(id: number, data: { status: 'APPROVED' | 'REJECTED'; reply?: string }) {
    const review = await this.prisma.productReview.findUnique({ where: { id } });
    if (!review) throw new NotFoundException('评价不存在');
    return this.prisma.productReview.update({
      where: { id },
      data: {
        status: data.status,
        reply: data.reply?.trim() || review.reply,
        repliedAt: data.reply?.trim() ? new Date() : review.repliedAt,
      },
    });
  }
}
