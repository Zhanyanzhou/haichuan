import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { IdempotencyService } from "../idempotency/idempotency-key";
import type { StaffPrincipal } from "../security/authenticated-principal";
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

type NotificationOperationsActor = Pick<StaffPrincipal, "id" | "sessionFamilyId">;

@Injectable()
export class ReliableNotificationOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
  ) {}

  private requireActor(
    actor: NotificationOperationsActor | undefined,
  ): NotificationOperationsActor {
    if (!actor || !Number.isInteger(actor.id) || actor.id <= 0) {
      throw new ForbiddenException("缺少有效的后台操作人");
    }
    return actor;
  }

  private async lockAuthorizedActor(
    tx: Prisma.TransactionClient,
    actor: NotificationOperationsActor,
    mode: "read" | "write",
  ) {
    const locked = mode === "write"
      ? await tx.$queryRaw<Array<{ id: number }>>(
          Prisma.sql`SELECT id FROM users WHERE id = ${actor.id} AND status = 'ACTIVE' AND role IN ('SUPER_ADMIN', 'ADMIN') FOR UPDATE`,
        )
      : await tx.$queryRaw<Array<{ id: number }>>(
          Prisma.sql`SELECT id FROM users WHERE id = ${actor.id} AND status = 'ACTIVE' AND role IN ('SUPER_ADMIN', 'ADMIN') FOR SHARE`,
        );
    if (locked.length !== 1) {
      throw new ForbiddenException("当前员工已停用或无权处理通知故障");
    }
    if (!actor.sessionFamilyId) return;
    const session = mode === "write"
      ? await tx.$queryRaw<Array<{ id: number }>>(
          Prisma.sql`SELECT id FROM admin_refresh_sessions WHERE user_id = ${actor.id} AND family_id = ${actor.sessionFamilyId} AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP LIMIT 1 FOR UPDATE`,
        )
      : await tx.$queryRaw<Array<{ id: number }>>(
          Prisma.sql`SELECT id FROM admin_refresh_sessions WHERE user_id = ${actor.id} AND family_id = ${actor.sessionFamilyId} AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP LIMIT 1 FOR SHARE`,
        );
    if (session.length !== 1) {
      throw new ForbiddenException("当前员工会话已失效，不能继续处理通知故障");
    }
  }

  private async findRetryReplay(
    tx: Prisma.TransactionClient,
    eventId: number,
    actorId: number,
    idempotencyKeyHash: string,
  ) {
    const auditRows = await tx.operationLog.findMany({
      where: {
        userId: actorId,
        action: "NOTIFICATION_RETRY_REQUESTED",
        module: "notifications",
        targetId: eventId,
      },
      orderBy: { id: "desc" },
      select: { detail: true },
    });
    const replayAudit = auditRows
      .map(({ detail }) => {
        if (!detail?.trim().startsWith("{")) return null;
        try {
          const parsed = JSON.parse(detail) as unknown;
          return parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : null;
        } catch {
          return null;
        }
      })
      .find((detail) => detail?.idempotencyKeyHash === idempotencyKeyHash);
    if (!replayAudit) return null;

    const event = await tx.outboxEvent.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        eventType: true,
        payload: true,
        status: true,
      },
    });
    const notificationId = event
      ? asPositiveInteger(asRecord(event.payload).notificationId)
      : null;
    if (
      !event
      || event.eventType !== SERVICE_NOTIFICATION_EVENT_TYPE
      || !notificationId
      || replayAudit.eventId !== event.id
      || replayAudit.notificationId !== notificationId
    ) {
      throw new ConflictException("原通知事件已变化，无法恢复重投结果");
    }
    return { eventId: event.id, notificationId, status: event.status };
  }

  async listFailures(
    query: NotificationFailureQuery = {},
    actorInput?: NotificationOperationsActor,
  ) {
    const actor = this.requireActor(actorInput);
    const page = boundedPositiveInteger(query.page, 1, 1_000_000);
    const pageSize = boundedPositiveInteger(query.pageSize, 20, 100);
    const where = {
      eventType: SERVICE_NOTIFICATION_EVENT_TYPE,
      status: "FAILED" as const,
    };
    return this.prisma.$transaction(async (tx) => {
      await this.lockAuthorizedActor(tx, actor, "read");
      const [events, total] = await Promise.all([
        tx.outboxEvent.findMany({
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
        tx.outboxEvent.count({ where }),
      ]);
      const notificationIds = events
        .map((event) => asPositiveInteger(asRecord(event.payload).notificationId))
        .filter((id): id is number => id !== null);
      const notifications = await tx.notification.findMany({
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
    });
  }

  async retryFailure(
    eventId: number,
    idempotencyKey: string,
    actorInput?: NotificationOperationsActor,
  ) {
    const actor = this.requireActor(actorInput);
    const idempotencyKeyHash = this.idempotency.scopedHash(
      `notification.retry:${actor.id}:${eventId}`,
      idempotencyKey,
    );
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lockAuthorizedActor(tx, actor, "write");
        const replay = await this.findRetryReplay(
          tx,
          eventId,
          actor.id,
          idempotencyKeyHash,
        );
        if (replay) return replay;

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
                requestedBy: actor.id,
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
            userId: actor.id,
            action: "NOTIFICATION_RETRY_REQUESTED",
            module: "notifications",
            targetId: event.id,
            detail: JSON.stringify({
              schemaVersion: 2,
              eventId: event.id,
              notificationId,
              result: "PENDING",
              previousErrorCode: event.lastErrorCode,
              idempotencyKeyHash,
            }),
          },
        });
        return { eventId: event.id, notificationId, status: "PENDING" };
      });
    } catch (error) {
      if (error instanceof ConflictException) {
        const replay = await this.prisma.$transaction(async (tx) => {
          await this.lockAuthorizedActor(tx, actor, "write");
          return this.findRetryReplay(
            tx,
            eventId,
            actor.id,
            idempotencyKeyHash,
          );
        });
        if (replay) return replay;
      }
      throw error;
    }
  }
}
