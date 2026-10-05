import { Injectable, Logger } from '@nestjs/common';
import { Prisma, ProductAccessEventType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { CustomerPrincipal } from '../../common/security/authenticated-principal';
import { PUBLIC_ANALYTICS_CONSENT_VERSION } from '../analytics/dto/track-event.dto';
import { lockActiveCustomerForWrite } from '../customers/customer-write-gate';

/**
 * 客户商品行为与受控媒体安全审计服务
 *
 * 安全约束：
 * - 必须传入守卫实时复核后的完整 CustomerPrincipal，并在写事务内再次复核 ACTIVE + authVersion；
 * - MEDIA_VIEW 仅作受控媒体安全审计，不进入推荐；其余行为只有分析/保留开关均开启、
 *   且客户存在当前版本的有效 ANALYTICS 同意后才写入；
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
    customer: CustomerPrincipal,
    productId: number,
    source: string = 'product_detail',
  ): Promise<{ counted: boolean }> {
    if (!this.analyticsBehaviorEnabled()) return { counted: false };
    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockActiveCustomerForWrite(tx, customer);
        const now = new Date();
        if (!(await this.hasCurrentAnalyticsConsent(tx, customer.id, now))) {
          return { counted: false };
        }
        const dedupeSince = new Date(now.getTime() - this.DEDUPE_WINDOW_MS);
        const recent = await tx.productAccessLog.findFirst({
          where: {
            customerId: customer.id,
            productId,
            eventType: 'DETAIL_VIEW',
            occurredAt: { gte: dedupeSince },
          },
          select: { id: true },
        });
        if (recent) return { counted: false };
        await tx.productAccessLog.create({
          data: {
            customerId: customer.id,
            productId,
            eventType: 'DETAIL_VIEW',
            source,
            occurredAt: now,
            metadata: this.consentBoundMetadata(),
          },
        });
        // 原子递增历史总浏览字段（仅有效浏览才计数）
        await tx.product.update({
          where: { id: productId },
          data: { viewCount: { increment: 1 } },
        });
        return { counted: true };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error: unknown) {
      // 行为采集失败不应阻断商品浏览主流程，但必须保持零写入或事务回滚。
      this.logger.error(
        `recordDetailView 失败 customer=${customer.id} product=${productId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { counted: false };
    }
  }

  /**
   * 记录通用访问事件（非详情浏览）。不去重、不影响 viewCount。
   * 用于 MEDIA_VIEW / ADD_TO_CART / INQUIRY_SUBMITTED / ORDER_COMPLETED / ADD_TO_SELECTION / RECOMMENDATION_IMPRESSION。
   */
  async recordEvent(
    customer: CustomerPrincipal,
    productId: number,
    eventType: ProductAccessEventType,
    source?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const isSecurityAudit = eventType === 'MEDIA_VIEW';
    if (!isSecurityAudit && !this.analyticsBehaviorEnabled()) return;
    try {
      await this.prisma.$transaction(async (tx) => {
        await lockActiveCustomerForWrite(tx, customer);
        const now = new Date();
        if (
          !isSecurityAudit
          && !(await this.hasCurrentAnalyticsConsent(tx, customer.id, now))
        ) return;
        await tx.productAccessLog.create({
          data: {
            customerId: customer.id,
            productId,
            eventType,
            source: source ?? null,
            metadata: isSecurityAudit
              ? this.securityAuditMetadata(metadata)
              : this.consentBoundMetadata(metadata),
            occurredAt: now,
          },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error: unknown) {
      this.logger.error(
        `recordEvent 失败 customer=${customer.id} product=${productId} event=${eventType}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * 客户行已由调用方以共享或排他锁复核后，在同一事务写入受控媒体安全审计。
   * 仅供需要把“资格复核、文件读取、审计写入”保持在一个授权窗口内的媒体路径使用。
   */
  async recordMediaViewWithinLockedCustomer(
    transaction: Pick<Prisma.TransactionClient, 'productAccessLog'>,
    customerId: number,
    productId: number,
    source = 'product_detail',
  ): Promise<void> {
    await transaction.productAccessLog.create({
      data: {
        customerId,
        productId,
        eventType: 'MEDIA_VIEW',
        source,
        metadata: this.securityAuditMetadata(),
        occurredAt: new Date(),
      },
    });
  }

  /**
   * 仅向当前仍同意分析的有效客户返回其本人、且带当前同意版本标记的浏览历史。
   * 推荐服务通过该入口读取，避免绕过行为数据的采集边界。
   */
  async getRecentViewedProductIds(
    customer: CustomerPrincipal,
    windowDays = 30,
    limit = 50,
  ): Promise<number[]> {
    if (!this.analyticsBehaviorEnabled()) return [];
    const safeWindowDays = Math.max(1, Math.min(365, Math.trunc(windowDays)));
    const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)));
    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockActiveCustomerForWrite(tx, customer);
        const now = new Date();
        if (!(await this.hasCurrentAnalyticsConsent(tx, customer.id, now))) return [];
        const since = new Date(now.getTime() - safeWindowDays * 24 * 60 * 60 * 1000);
        const rows = await tx.$queryRaw<Array<{ productId: number }>>(Prisma.sql`
          SELECT access_log.product_id AS productId
          FROM product_access_logs AS access_log
          WHERE access_log.customer_id = ${customer.id}
            AND access_log.event_type = 'DETAIL_VIEW'
            AND access_log.occurred_at >= ${since}
            AND JSON_UNQUOTE(JSON_EXTRACT(access_log.metadata, '$.analyticsConsentVersion')) = ${PUBLIC_ANALYTICS_CONSENT_VERSION}
          ORDER BY access_log.occurred_at DESC, access_log.id DESC
          LIMIT ${safeLimit}
        `);
        return rows.map((row) => Number(row.productId)).filter(Number.isSafeInteger);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error: unknown) {
      this.logger.error(
        `getRecentViewedProductIds 失败 customer=${customer.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  /**
   * 批量查询窗口内热度分数（推荐系统"热门/猜你喜欢"排序依据）。
   * 权重可解释、可调整：转化行为（加购/下单/咨询）权重远高于曝光与浏览。
   */
  async getHotScores(
    productIds: number[],
    windowDays = 14,
    client: Pick<Prisma.TransactionClient, '$queryRaw'> = this.prisma,
  ): Promise<Map<number, number>> {
    if (!this.analyticsBehaviorEnabled() || !productIds || productIds.length === 0) {
      return new Map();
    }
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    try {
      const rows = await client.$queryRaw<Array<{ productId: number; score: number }>>(Prisma.sql`
        SELECT access_log.product_id AS productId,
               SUM(CASE access_log.event_type
                 WHEN 'ORDER_COMPLETED' THEN 8
                 WHEN 'ADD_TO_CART' THEN 5
                 WHEN 'INQUIRY_SUBMITTED' THEN 4
                 WHEN 'ADD_TO_SELECTION' THEN 3
                 WHEN 'DETAIL_VIEW' THEN 1
                 WHEN 'MEDIA_VIEW' THEN 0.5
                 WHEN 'RECOMMENDATION_IMPRESSION' THEN 0.2
                 ELSE 0
               END) AS score
        FROM product_access_logs AS access_log
        INNER JOIN customers AS customer
          ON customer.id = access_log.customer_id AND customer.status = 'ACTIVE'
        WHERE access_log.occurred_at >= ${since}
          AND access_log.product_id IN (${Prisma.join(productIds)})
          AND JSON_UNQUOTE(JSON_EXTRACT(access_log.metadata, '$.analyticsConsentVersion')) = ${PUBLIC_ANALYTICS_CONSENT_VERSION}
        GROUP BY access_log.product_id
      `);
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

  private analyticsBehaviorEnabled(): boolean {
    return process.env.ANALYTICS_INGESTION_ENABLED === 'true'
      && process.env.ANALYTICS_RETENTION_ENABLED === 'true';
  }

  private async hasCurrentAnalyticsConsent(
    transaction: Pick<Prisma.TransactionClient, 'consentRecord'>,
    customerId: number,
    now: Date,
  ): Promise<boolean> {
    const consent = await transaction.consentRecord.findFirst({
      where: { customerId, purpose: 'ANALYTICS' },
      select: { decision: true, policyVersion: true, expiresAt: true },
      orderBy: [{ decidedAt: 'desc' }, { id: 'desc' }],
    });
    return consent?.decision === 'GRANTED'
      && consent.policyVersion === PUBLIC_ANALYTICS_CONSENT_VERSION
      && (!consent.expiresAt || consent.expiresAt.getTime() > now.getTime());
  }

  private consentBoundMetadata(
    metadata?: Record<string, unknown>,
  ): Prisma.InputJsonValue {
    return {
      ...(this.sanitizeMetadata(metadata) ?? {}),
      analyticsConsentVersion: PUBLIC_ANALYTICS_CONSENT_VERSION,
    };
  }

  private securityAuditMetadata(
    metadata?: Record<string, unknown>,
  ): Prisma.InputJsonValue {
    return {
      ...(this.sanitizeMetadata(metadata) ?? {}),
      processingPurpose: 'SECURITY_AUDIT',
    };
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
