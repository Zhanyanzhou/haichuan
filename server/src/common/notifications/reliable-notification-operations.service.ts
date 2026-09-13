import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SERVICE_NOTIFICATION_EVENT_TYPE } from "./notification-delivery.constants";

const SAFE_MANUAL_RETRY_ERROR_CODES = new Set([
  "SMTP_SEND_FAILED",
  "SMTP_NOT_CONFIGURED",
  "NOTIFICATION_DELIVERY_DISABLED",
]);

function asPositiveInteger(value: unknown): number | null {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function boundedPositiveInteger(value: unknown, fallback: number, maximum: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0
    ? Math.min(parsed, maximum)
    : fallback;
}

function asRecord(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export interface NotificationFailureQuery {
  page?: number | string;
  pageSize?: number | string;
}

@Injectable()
export class ReliableNotificationOperationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listFailures(query: NotificationFailureQuery = {}) {
    const page = boundedPositiveInteger(query.page, 1, 1_000_000);
    const pageSize = boundedPositiveInteger(query.pageSize, 20, 100);
    const where = {
      eventType: SERVICE_NOTIFICATION_EVENT_TYPE,
      status: "FAILED" as const,
    };
    const [events, total] = await this.prisma.$transaction([
      this.prisma.outboxEvent.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          payload: true,
          attempts: true,
          lastErrorCode: true,
          occurredAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.outboxEvent.count({ where }),
    ]);
    const notificationIds = events
      .map((event) => asPositiveInteger(asRecord(event.payload).notificationId))
      .filter((id): id is number => id !== null);
    const notifications = await this.prisma.notification.findMany({
      where: { id: { in: notificationIds } },
      select: {
        id: true,
        type: true,
        status: true,
        customer: { select: { status: true } },
        deliveries: {
          where: { channel: "EMAIL" },
          select: { status: true, lastErrorCode: true },
        },
      },
    });
    const byId = new Map(notifications.map((item) => [item.id, item]));

    return {
      list: events.map((event) => {
        const notificationId = asPositiveInteger(asRecord(event.payload).notificationId);
        const notification = notificationId ? byId.get(notificationId) : undefined;
        const delivery = notification?.deliveries[0];
        const retryable = Boolean(
          notification
          && ["AVAILABLE", "READ"].includes(notification.status)
          && notification.customer.status === "ACTIVE"
          && delivery?.status === "FAILED"
          && delivery.lastErrorCode === event.lastErrorCode
          && event.lastErrorCode
          && SAFE_MANUAL_RETRY_ERROR_CODES.has(event.lastErrorCode),
        );
        return {
          id: event.id,
          notificationId,
          notificationType: notification?.type ?? "UNKNOWN",
          notificationStatus: notification?.status ?? "UNAVAILABLE",
          deliveryStatus: delivery?.status ?? "UNAVAILABLE",
          attempts: event.attempts,
          lastErrorCode: event.lastErrorCode,
          retryable,
          occurredAt: event.occurredAt,
          updatedAt: event.updatedAt,
        };
      }),
      total,
      page,
      pageSize,
    };
  }

  async retryFailure(eventId: number, actorId?: number) {
    if (!actorId || !Number.isInteger(actorId) || actorId <= 0) {
      throw new ForbiddenException("缺少有效的后台操作人");
    }
    return this.prisma.$transaction(async (tx) => {
      const event = await tx.outboxEvent.findUnique({
        where: { id: eventId },
        select: {
          id: true,
          eventType: true,
          payload: true,
          status: true,
          lastErrorCode: true,
        },
      });
      if (!event || event.eventType !== SERVICE_NOTIFICATION_EVENT_TYPE) {
        throw new NotFoundException("通知失败记录不存在");
      }
      if (event.status !== "FAILED") {
        throw new ConflictException("该通知已被处理或正在处理");
      }
      if (!event.lastErrorCode || !SAFE_MANUAL_RETRY_ERROR_CODES.has(event.lastErrorCode)) {
        throw new ConflictException("该失败结果不能安全重投，请先人工核对投递结果");
      }
      const payload = asRecord(event.payload);
      const notificationId = asPositiveInteger(payload.notificationId);
      if (!notificationId) {
        throw new ConflictException("通知失败记录缺少有效关联对象");
      }
      const notification = await tx.notification.findFirst({
        where: {
          id: notificationId,
          status: { in: ["AVAILABLE", "READ"] },
          customer: { status: "ACTIVE" },
        },
        select: {
          deliveries: {
            where: { channel: "EMAIL" },
            select: { id: true, status: true, lastErrorCode: true },
          },
        },
      });
      const delivery = notification?.deliveries[0];
      if (
        !delivery
        || delivery.status !== "FAILED"
        || delivery.lastErrorCode !== event.lastErrorCode
      ) {
        throw new ConflictException("通知当前状态已变化，请刷新后再处理");
      }

      const requestedAt = new Date();
      const claimed = await tx.outboxEvent.updateMany({
        where: {
          id: event.id,
          status: "FAILED",
          lastErrorCode: event.lastErrorCode,
        },
        data: {
          status: "PENDING",
          availableAt: requestedAt,
          processedAt: null,
          lockedAt: null,
          lockedBy: null,
          payload: {
            ...payload,
            manualRetry: {
              requestedBy: actorId,
              requestedAt: requestedAt.toISOString(),
            },
          } as Prisma.InputJsonValue,
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException("该通知已被其他操作人处理");
      }
      await tx.operationLog.create({
        data: {
          userId: actorId,
          action: "NOTIFICATION_RETRY_REQUESTED",
          module: "notifications",
          targetId: event.id,
          detail: JSON.stringify({
            schemaVersion: 1,
            eventId: event.id,
            notificationId,
            result: "PENDING",
            previousErrorCode: event.lastErrorCode,
          }),
        },
      });
      return { eventId: event.id, notificationId, status: "PENDING" };
    });
  }
}
