import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

const MAX_METADATA_BYTES = 2048;
const METADATA_FIELDS_BY_EVENT: Record<string, string[]> = {
  filter: ["filterType", "value"],
  add_to_cart: ["quantity"],
  begin_checkout: ["itemCount", "amount"],
  order_created: ["orderId", "amount"],
  submit_selection: ["count"],
  cta_click: ["label"],
};

function sanitizeMetadata(
  eventName: string,
  metadata: Record<string, unknown> | undefined,
) {
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

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async track(event: {
    eventName: string;
    pagePath?: string;
    productId?: number;
    searchTerm?: string;
    source?: string;
    deviceType?: string;
    sessionId?: string;
    metadata?: Record<string, unknown>;
  }) {
    const safeMeta = sanitizeMetadata(event.eventName, event.metadata);
    if (safeMeta && Buffer.byteLength(JSON.stringify(safeMeta)) > MAX_METADATA_BYTES) {
      return;
    }

    // fire-and-forget: 不阻塞调用方
    this.prisma.analyticsEvent
      .create({
        data: {
          eventName: event.eventName,
          pagePath: event.pagePath || null,
          productId: event.productId || null,
          searchTerm: event.searchTerm || null,
          source: event.source || null,
          deviceType: event.deviceType || null,
          sessionId: event.sessionId || null,
          customerId: null,
          metadata: safeMeta as any,
          occurredAt: new Date(),
        },
      })
      .catch(() => {
        /* 采集失败静默 */
      });
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
    const where: any = {};
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
}
