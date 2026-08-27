import { Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PUBLIC_ANALYTICS_CONSENT_VERSION } from "./dto/track-event.dto";
import { getConfiguredAnalyticsDataset } from "./analytics-dataset";

const MAX_METADATA_BYTES = 2048;
const METADATA_FIELDS_BY_EVENT: Record<string, string[]> = {
  filter: ["filterType", "value"],
  view_item_list: ["itemCount", "listId"],
  add_to_cart: ["quantity"],
  remove_from_cart: ["quantity"],
  view_cart: ["itemCount", "amount"],
  begin_checkout: ["itemCount", "amount"],
  add_payment_info: ["orderId", "amount", "paymentMethod"],
  order_created: ["orderId", "amount"],
  purchase: ["orderId", "amount"],
  refund: ["refundId", "orderId", "amount"],
  submit_selection: ["count"],
  cta_click: ["label"],
};

function sanitizeMetadata(
  eventName: string,
  metadata: Record<string, unknown> | undefined,
): Prisma.InputJsonObject | undefined {
  if (!metadata) return undefined;
  const allowedFields = METADATA_FIELDS_BY_EVENT[eventName] || [];
  const sanitized: Record<string, string | number> = {};

  for (const field of allowedFields) {
    const value = metadata[field];
    if (typeof value === "string") sanitized[field] = value.slice(0, 100);
    if (typeof value === "number" && Number.isFinite(value)) sanitized[field] = value;
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function retentionDays(): number {
  const parsed = Number(process.env.ANALYTICS_RETENTION_DAYS || 90);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 365 ? parsed : 90;
}

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async track(event: {
    consentGranted: true;
    consentVersion: string;
    eventName: string;
    pagePath?: string;
    productId?: number;
    searchTerm?: string;
    source?: string;
    deviceType?: string;
    sessionId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<boolean> {
    // 双重安全门禁：未显式开启服务端接收，或请求没有当前同意声明，均不写数据库。
    if (process.env.ANALYTICS_INGESTION_ENABLED !== "true") return false;
    if (
      event.consentGranted !== true ||
      event.consentVersion !== PUBLIC_ANALYTICS_CONSENT_VERSION
    ) {
      return false;
    }
    const dataset = getConfiguredAnalyticsDataset();
    if (!dataset) return false;
    const safeMeta = sanitizeMetadata(event.eventName, event.metadata);
    if (safeMeta && Buffer.byteLength(JSON.stringify(safeMeta)) > MAX_METADATA_BYTES) {
      return false;
    }

    // fire-and-forget: 不阻塞调用方
    this.prisma.analyticsEvent
      .create({
        data: {
          eventName: event.eventName,
          dataset,
          pagePath: event.pagePath || null,
          productId: event.productId || null,
          searchTerm: event.searchTerm || null,
          source: event.source || null,
          deviceType: event.deviceType || null,
          sessionId: event.sessionId || null,
          customerId: null,
          metadata: safeMeta,
          occurredAt: new Date(),
          retentionExpiresAt: new Date(Date.now() + retentionDays() * 86_400_000),
        },
      })
      .catch(() => {
        /* 采集失败静默 */
      });
    return true;
  }

  async getEvents(params: {
    eventName?: string;
    page?: number;
    pageSize?: number;
    hours?: number;
  }) {
    const { eventName, page = 1, pageSize = 50, hours = 24 } = params;
    const _p = +page,
      _ps = +pageSize;
    const where: Prisma.AnalyticsEventWhereInput = {};
    const dataset = getConfiguredAnalyticsDataset();
    if (!dataset) return { list: [], total: 0, page: _p, pageSize: _ps };
    where.dataset = dataset;
    if (eventName) where.eventName = eventName;
    if (hours > 0) {
      where.occurredAt = { gte: new Date(Date.now() - hours * 3600000) };
    }

    const [list, total] = await Promise.all([
      this.prisma.analyticsEvent.findMany({
        where,
        orderBy: { occurredAt: "desc" },
        skip: (_p - 1) * _ps,
        take: _ps,
      }),
      this.prisma.analyticsEvent.count({ where }),
    ]);

    return { list, total, page: _p, pageSize: _ps };
  }

  @Cron("0 0 3 * * *")
  async purgeExpiredEvents(): Promise<number> {
    if (process.env.ANALYTICS_RETENTION_ENABLED !== "true") return 0;
    const dataset = getConfiguredAnalyticsDataset();
    if (!dataset) return 0;
    const result = await this.prisma.analyticsEvent.deleteMany({
      where: {
        dataset,
        retentionExpiresAt: { lte: new Date() },
      },
    });
    return result.count;
  }
}
