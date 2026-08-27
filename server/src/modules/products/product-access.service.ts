import { Injectable, Logger } from '@nestjs/common';
import { Prisma, ProductAccessEventType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * 商品访问审计服务（服务端可信日志）
 *
 * 安全约束：
 * - customerId 必须由调用方从已验证的客户令牌派生，本服务不接受客户端提交的 customerId；
 * - DETAIL_VIEW 对同一 customer+product 在 30 分钟内只计一次有效浏览，并原子递增 Product.viewCount；
 * - metadata 严格限制大小，防止滥用。
 *
 * 推荐系统：getHotScores 提供带时间窗口、可解释权重的热度分数，作为"热门/猜你喜欢"排序依据。
 */
@Injectable()
export class ProductAccessService {
  private readonly logger = new Logger(ProductAccessService.name);
  // 30 分钟内同一客户+商品只计一次有效浏览
  private readonly DEDUPE_WINDOW_MS = 30 * 60 * 1000;
  // metadata JSON 序列化后最大字节数，防止滥用
  private readonly MAX_METADATA_BYTES = 4096;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 记录商品详情浏览（DETAIL_VIEW）。
   * 去重 + 原子递增 viewCount，事务保证不会出现"只写日志没更新计数"的半完成状态。
   */
  async recordDetailView(
    customerId: number,
    productId: number,
    source: string = 'product_detail',
  ): Promise<{ counted: boolean }> {
    const dedupeSince = new Date(Date.now() - this.DEDUPE_WINDOW_MS);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const recent = await tx.productAccessLog.findFirst({
          where: {
            customerId,
            productId,
            eventType: 'DETAIL_VIEW',
            occurredAt: { gte: dedupeSince },
          },
          select: { id: true },
        });
        if (recent) return { counted: false };
        await tx.productAccessLog.create({
          data: {
            customerId,
            productId,
            eventType: 'DETAIL_VIEW',
            source,
            occurredAt: new Date(),
          },
        });
        // 原子递增历史总浏览字段（仅有效浏览才计数）
        await tx.product.update({
          where: { id: productId },
          data: { viewCount: { increment: 1 } },
        });
        return { counted: true };
      });
    } catch (error: unknown) {
      // 审计日志失败不应阻断商品浏览主流程，仅记录错误
      this.logger.error(
        `recordDetailView 失败 customer=${customerId} product=${productId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { counted: false };
    }
  }

  /**
   * 记录通用访问事件（非详情浏览）。不去重、不影响 viewCount。
   * 用于 MEDIA_VIEW / ADD_TO_CART / INQUIRY_SUBMITTED / ORDER_COMPLETED / ADD_TO_SELECTION / RECOMMENDATION_IMPRESSION。
   */
  async recordEvent(
    customerId: number,
    productId: number,
    eventType: ProductAccessEventType,
    source?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      const safeMetadata = this.sanitizeMetadata(metadata);
      await this.prisma.productAccessLog.create({
        data: {
          customerId,
          productId,
          eventType,
          source: source ?? null,
          metadata: safeMetadata as Prisma.InputJsonValue | undefined,
          occurredAt: new Date(),
        },
      });
    } catch (error: unknown) {
      this.logger.error(
        `recordEvent 失败 customer=${customerId} product=${productId} event=${eventType}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * 批量查询窗口内热度分数（推荐系统"热门/猜你喜欢"排序依据）。
   * 权重可解释、可调整：转化行为（加购/下单/咨询）权重远高于曝光与浏览。
   */
  async getHotScores(
    productIds: number[],
    windowDays = 14,
  ): Promise<Map<number, number>> {
    if (!productIds || productIds.length === 0) return new Map();
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    try {
      const rows: Array<{ productId: number; score: number }> = await this.prisma.$queryRaw`
        SELECT product_id AS productId,
               SUM(CASE event_type
                 WHEN 'ORDER_COMPLETED' THEN 8
                 WHEN 'ADD_TO_CART' THEN 5
                 WHEN 'INQUIRY_SUBMITTED' THEN 4
                 WHEN 'ADD_TO_SELECTION' THEN 3
                 WHEN 'DETAIL_VIEW' THEN 1
                 WHEN 'MEDIA_VIEW' THEN 0.5
                 WHEN 'RECOMMENDATION_IMPRESSION' THEN 0.2
                 ELSE 0
               END) AS score
        FROM product_access_logs
        WHERE occurred_at >= ${since}
          AND product_id IN (${Prisma.join(productIds)})
        GROUP BY product_id
      `;
      const map = new Map<number, number>();
      for (const row of rows) map.set(Number(row.productId), Number(row.score));
      return map;
    } catch (error: unknown) {
      this.logger.error(
        `getHotScores 失败: ${error instanceof Error ? error.message : String(error)}`,
      );
      return new Map();
    }
  }

  private sanitizeMetadata(metadata?: Record<string, unknown>): Record<string, unknown> | null {
    if (!metadata) return null;
    try {
      const json = JSON.stringify(metadata);
      if (json.length > this.MAX_METADATA_BYTES) {
        return { truncated: true, originalSize: json.length };
      }
      return metadata;
    } catch {
      return null;
    }
  }
}
