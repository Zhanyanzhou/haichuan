import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ProductAccessService } from '../products/product-access.service';
import {
  customerFacingProductWhere,
  type CustomerProductAccess,
} from '../products/product-eligibility';
import type { CustomerPrincipal } from '../../common/security/authenticated-principal';
import { lockActiveCustomerForRead } from '../customers/customer-write-gate';

const RECOMMENDATION_PRODUCT_SELECT = {
  id: true,
  code: true,
  name: true,
  shortDescription: true,
  materialType: true,
  goldWeight: true,
  price: true,
  weight: true,
  size: true,
  salesMode: true,
  isHot: true,
  isNew: true,
  isRecommended: true,
  isLimited: true,
  isCustom: true,
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
    const products = await this.withLockedCustomerAccess(
      customer,
      async (transaction, lockedAccess) => {
        const candidates = await transaction.product.findMany({
          where: customerFacingProductWhere(lockedAccess),
          select: { id: true, isHot: true, isRecommended: true },
          take: 300,
        });
        if (candidates.length === 0) return [];
        const scores = await this.productAccess.getHotScores(
          candidates.map((c) => c.id),
          this.hotWindowDays,
          transaction,
        );
        const ranked = candidates
          .map((c) => ({
            id: c.id,
            score: (scores.get(c.id) || 0) + (c.isHot ? 2 : 0) + (c.isRecommended ? 1 : 0),
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, limit)
          .map((r) => r.id);
        return this.loadAndSerialize(ranked, lockedAccess, transaction);
      },
    );
    this.recordImpressions(customer, products, 'home_recommendation');
    return products;
  }

  /** 猜你喜欢：基于客户近期浏览分类推荐 */
  async getForYou(customer: CustomerPrincipal, limit = this.defaultLimit) {
    const recentProductIds = [
      ...new Set(await this.productAccess.getRecentViewedProductIds(customer, 30, 50)),
    ];
    if (recentProductIds.length === 0) {
      // 无历史行为：回退到热门
      return this.getHot(customer, limit);
    }
    const products = await this.withLockedCustomerAccess(
      customer,
      async (transaction, lockedAccess) => {
        const recentProducts = await transaction.product.findMany({
          where: { id: { in: recentProductIds } },
          select: { categoryId: true },
        });
        const categoryIds = [...new Set(recentProducts.map((p) => p.categoryId))];
        const candidates = await transaction.product.findMany({
          where: {
            ...customerFacingProductWhere(lockedAccess),
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
          transaction,
        );
        const ranked = candidates
          .map((c) => ({
            id: c.id,
            score: (scores.get(c.id) || 0) + (c.isRecommended ? 1 : 0),
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, limit)
          .map((r) => r.id);
        return this.loadAndSerialize(ranked, lockedAccess, transaction);
      },
    );
    this.recordImpressions(customer, products, 'home_recommendation');
    return products;
  }

  /** 相似商品：同分类 / 同材质 */
  async getSimilar(productId: number, customer: CustomerPrincipal, limit = this.defaultLimit) {
    const products = await this.withLockedCustomerAccess(
      customer,
      async (transaction, lockedAccess) => {
        const base = await transaction.product.findFirst({
          where: {
            id: productId,
            ...customerFacingProductWhere(lockedAccess),
          },
          select: { categoryId: true, materialType: true },
        });
        if (!base) return [];
        const candidates = await transaction.product.findMany({
          where: {
            ...customerFacingProductWhere(lockedAccess),
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
          transaction,
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
        return this.loadAndSerialize(ranked, lockedAccess, transaction);
      },
    );
    this.recordImpressions(customer, products, 'similar_recommendation');
    return products;
  }

  private withLockedCustomerAccess<T>(
    customer: CustomerPrincipal,
    work: (
      transaction: Prisma.TransactionClient,
      lockedAccess: CustomerProductAccess,
    ) => Promise<T>,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const lockedAccess = await lockActiveCustomerForRead(transaction, customer);
      return work(transaction, lockedAccess);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  /** 按排序顺序加载商品并序列化为受控目录响应 */
  private async loadAndSerialize(
    orderedIds: number[],
    access: CustomerProductAccess,
    client: Pick<Prisma.TransactionClient, 'product'>,
  ) {
    if (orderedIds.length === 0) return [];
    const products = await client.product.findMany({
      where: { id: { in: orderedIds }, ...customerFacingProductWhere(access) },
      select: RECOMMENDATION_PRODUCT_SELECT,
    });
    const map = new Map(products.map((product) => [product.id, product]));
    const ordered = orderedIds
      .map((id) => map.get(id))
      .filter((product): product is RecommendationProduct => Boolean(product));
    return ordered.map((p) => this.toCatalogProduct(p));
  }

  private recordImpressions(
    customer: CustomerPrincipal,
    products: Array<Record<string, unknown>>,
    source: string,
  ) {
    // 记录推荐曝光行为（异步且仅在服务端开关与客户分析同意均有效时写入）。
    for (const product of products) {
      const productId = Number(product.id);
      if (!Number.isSafeInteger(productId)) continue;
      this.productAccess
        .recordEvent(customer, productId, 'RECOMMENDATION_IMPRESSION', source)
        .catch(() => {
          /* 行为采集失败不阻断推荐 */
        });
    }
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
      id: product.id,
      code: product.code,
      name: product.name,
      shortDescription: product.shortDescription,
      materialType: product.materialType,
      goldWeight: product.goldWeight,
      price:
        product.salesMode === 'DIRECT_PURCHASE' && Number(product.price) > 0
          ? product.price
          : null,
      weight: product.weight,
      size: product.size,
      salesMode: product.salesMode,
      isHot: product.isHot,
      isNew: product.isNew,
      isRecommended: product.isRecommended,
      isLimited: product.isLimited,
      isCustom: product.isCustom,
      category: product.category,
      images: (product.images || []).map(mapImage).filter(Boolean),
      primaryImage: product.primaryImage ? mapImage(product.primaryImage) : null,
      listingImage: product.listingImage ? mapImage(product.listingImage) : null,
    };
  }
}
