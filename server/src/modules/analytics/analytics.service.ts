import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

const MAX_METADATA_BYTES = 2048;

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
    customerId?: number;
    metadata?: Record<string, unknown>;
  }) {
    // 限制 metadata 大小
    let safeMeta = event.metadata || undefined;
    if (safeMeta) {
      const str = JSON.stringify(safeMeta);
      if (Buffer.byteLength(str) > MAX_METADATA_BYTES) {
        safeMeta = { _truncated: true };
      }
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
          customerId: event.customerId || null,
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
