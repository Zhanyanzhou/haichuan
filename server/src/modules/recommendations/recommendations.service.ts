import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ProductAccessService } from '../products/product-access.service';
import { customerFacingProductWhere } from '../products/product-eligibility';
import type { CustomerPrincipal } from '../../common/security/authenticated-principal';

const RECOMMENDATION_PRODUCT_SELECT = {
  id: true,
  code: true,
  name: true,
  categoryId: true,
  shortDescription: true,
  materialType: true,
  goldWeight: true,
  craftFee: true,
  price: true,
  weight: true,
  size: true,
  status: true,
  salesMode: true,
  sortOrder: true,
  isHot: true,
  isNew: true,
  isRecommended: true,
  isLimited: true,
  isCustom: true,
  multiDiscount: true,
  visibility: true,
  viewCount: true,
  salesCount: true,
  category: { select: { id: true, name: true } },
  images: { orderBy: { sortOrder: 'asc' as const }, take: 3 },
  primaryImage: true,
  listingImage: true,
} satisfies Prisma.ProductSelect;

type RecommendationProduct = Prisma.ProductGetPayload<{
  select: typeof RECOMMENDATION_PRODUCT_SELECT;
}>;
type RecommendationImage = NonNullable<RecommendationProduct['primaryImage']>;

/**
 * 规则推荐系统（可解释、可调权重）
 *
 * 核心原则（任务书第六节）：
 * - 任何推荐结果先按当前访问者权限过滤（visibility）；
 * - 未登录不能获得推荐（接口强制客户登录）；
 * - 会员看不到 PARTNER / INTERNAL；合作商家看不到 INTERNAL；
 * - 排序使用带时间窗口的访问/转化行为（ProductAccessLog），不只看历史 viewCount。
 *
 * 排序公式（可解释）：
 * - 热门：score = 窗口加权行为分 + isHot×2 + isRecommended×1
 * - 猜你喜欢：基于客户近 30 天 DETAIL_VIEW 的分类，推荐同分类未浏览商品
 * - 相似：同分类×2 + 同材质×1 + 窗口行为分 + isRecommended×0.5
 */
@Injectable()
export class RecommendationsService {
  private readonly defaultLimit = 12;
  private readonly hotWindowDays = 14;

  constructor(
    private readonly prisma: PrismaService,
    private readonly productAccess: ProductAccessService,
  ) {}

  /** 热门商品 */
  async getHot(customer: CustomerPrincipal, limit = this.defaultLimit) {
    const candidates = await this.prisma.product.findMany({
      where: {
        ...customerFacingProductWhere(customer),
      },
      select: { id: true, isHot: true, isRecommended: true },
      take: 300,
    });
    if (candidates.length === 0) return [];
    const scores = await this.productAccess.getHotScores(
      candidates.map((c) => c.id),
      this.hotWindowDays,
    );
    const ranked = candidates
      .map((c) => ({
        id: c.id,
        score: (scores.get(c.id) || 0) + (c.isHot ? 2 : 0) + (c.isRecommended ? 1 : 0),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((r) => r.id);
    return this.loadAndSerialize(ranked, customer, 'home_recommendation');
  }

  /** 猜你喜欢：基于客户近期浏览分类推荐 */
  async getForYou(customer: CustomerPrincipal, limit = this.defaultLimit) {
    const recentLogs = await this.prisma.productAccessLog.findMany({
      where: {
        customerId: customer.id,
        eventType: 'DETAIL_VIEW',
        occurredAt: { gte: new Date(Date.now() - 30 * 86400000) },
      },
      select: { productId: true },
      take: 50,
      orderBy: { occurredAt: 'desc' },
    });
    const recentProductIds = [...new Set(recentLogs.map((l) => l.productId))];
    if (recentProductIds.length === 0) {
      // 无历史行为：回退到热门
      return this.getHot(customer, limit);
    }
    const recentProducts = await this.prisma.product.findMany({
      where: { id: { in: recentProductIds } },
      select: { categoryId: true },
    });
    const categoryIds = [...new Set(recentProducts.map((p) => p.categoryId))];
    const candidates = await this.prisma.product.findMany({
      where: {
        ...customerFacingProductWhere(customer),
        categoryId: { in: categoryIds },
        id: { notIn: recentProductIds },
      },
      select: { id: true, isRecommended: true },
      take: 200,
    });
    if (candidates.length === 0) return [];
    const scores = await this.productAccess.getHotScores(
      candidates.map((c) => c.id),
      this.hotWindowDays,
    );
    const ranked = candidates
      .map((c) => ({
        id: c.id,
        score: (scores.get(c.id) || 0) + (c.isRecommended ? 1 : 0),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((r) => r.id);
    return this.loadAndSerialize(ranked, customer, 'home_recommendation');
  }

  /** 相似商品：同分类 / 同材质 */
  async getSimilar(productId: number, customer: CustomerPrincipal, limit = this.defaultLimit) {
    const base = await this.prisma.product.findFirst({
      where: {
        id: productId,
        ...customerFacingProductWhere(customer),
      },
      select: { categoryId: true, materialType: true },
    });
    if (!base) return [];
    const candidates = await this.prisma.product.findMany({
      where: {
        ...customerFacingProductWhere(customer),
        id: { not: productId },
        OR: [{ categoryId: base.categoryId }, { materialType: base.materialType }],
      },
      select: { id: true, categoryId: true, materialType: true, isRecommended: true },
      take: 200,
    });
    if (candidates.length === 0) return [];
    const scores = await this.productAccess.getHotScores(
      candidates.map((c) => c.id),
      this.hotWindowDays,
    );
    const ranked = candidates
      .map((c) => ({
        id: c.id,
        score:
          (scores.get(c.id) || 0) +
          (c.categoryId === base.categoryId ? 2 : 0) +
          (c.materialType === base.materialType ? 1 : 0) +
          (c.isRecommended ? 0.5 : 0),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((r) => r.id);
    return this.loadAndSerialize(ranked, customer, 'similar_recommendation');
  }

  /** 按排序顺序加载商品并序列化为受控目录响应 */
  private async loadAndSerialize(
    orderedIds: number[],
    customer: CustomerPrincipal,
    source: string,
  ) {
    if (orderedIds.length === 0) return [];
    const products = await this.prisma.product.findMany({
      where: { id: { in: orderedIds }, ...customerFacingProductWhere(customer) },
      select: RECOMMENDATION_PRODUCT_SELECT,
    });
    const map = new Map(products.map((product) => [product.id, product]));
    const ordered = orderedIds
      .map((id) => map.get(id))
      .filter((product): product is RecommendationProduct => Boolean(product));
    // 记录推荐曝光审计（异步，不阻塞主流程；customerId 从令牌派生）
    for (const p of ordered) {
      this.productAccess
        .recordEvent(customer.id, p.id, 'RECOMMENDATION_IMPRESSION', source)
        .catch(() => {
          /* 审计失败不阻断推荐 */
        });
    }
    return ordered.map((p) => this.toCatalogProduct(p));
  }

  /** 受控目录序列化：图片只返回 mediaUrl，不返回 url/storageKey */
  private toCatalogProduct(product: RecommendationProduct) {
    const productId = product.id;
    const mapImage = (img: RecommendationImage | null) =>
      img
        ? {
            id: img.id,
            type: img.type,
            sortOrder: img.sortOrder,
            isVideo: img.isVideo,
            width: img.width ?? null,
            height: img.height ?? null,
            mediaUrl: `/products/catalog/${productId}/media/${img.id}`,
          }
        : null;
    return {
      ...product,
      images: (product.images || []).map(mapImage).filter(Boolean),
      primaryImage: product.primaryImage ? mapImage(product.primaryImage) : null,
      listingImage: product.listingImage ? mapImage(product.listingImage) : null,
    };
  }
}
