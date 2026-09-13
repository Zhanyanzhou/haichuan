import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import { Prisma } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { MailerService } from "../mailer/mailer.service";
import {
  LEAD_PRIVACY_DISPOSITION_ERROR_CODE,
  LEAD_REPLY_NOTIFICATION_EVENT_TYPE,
  SERVICE_NOTIFICATION_EVENT_TYPE,
} from "./notification-delivery.constants";
import { NotificationDeliveryPolicyService } from "./notification-delivery-policy.service";

const ORDER_EVENT_TYPE = SERVICE_NOTIFICATION_EVENT_TYPE;
const SEND_STARTED = "SEND_STARTED";
const MAX_ATTEMPTS = 5;
const CLAIM_TIMEOUT_MS = 5 * 60 * 1000;

type ClaimedEvent = {
  id: number;
  attempts: number;
  eventType: string;
  payload: Prisma.JsonValue;
};

type ClaimSkipped = { skipped: true };

type ManualRetryAuditContext =
  | { kind: "lead"; requestedBy: number; leadId: number }
  | { kind: "notification"; requestedBy: number; notificationId: number };

function asPositiveInteger(value: unknown): number | null {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function emailHash(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

@Injectable()
export class ReliableNotificationDeliveryWorker {
  private readonly logger = new Logger(ReliableNotificationDeliveryWorker.name);
  private readonly workerId = `notification-${randomUUID()}`;
  private draining = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mailer: MailerService,
    private readonly deliveryPolicy: NotificationDeliveryPolicyService,
  ) {}

  isEnabled() {
    return this.config.get<string>("NOTIFICATION_DELIVERY_ENABLED")
      ?.trim()
      .toLowerCase() === "true";
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async scheduledDrain() {
    if (!this.isEnabled() || this.draining) return;
    this.draining = true;
    try {
      await this.drainOnce();
    } finally {
      this.draining = false;
    }
  }

  async drainOnce(limit = 20): Promise<number> {
    if (!this.isEnabled()) return 0;
    let processed = 0;
    const boundedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    for (let index = 0; index < boundedLimit; index += 1) {
      const event = await this.claimNext();
      if (!event) break;
      if ("skipped" in event) {
        processed += 1;
        continue;
      }
      await this.processClaimed(event);
      processed += 1;
    }
    return processed;
  }

  private async claimNext(): Promise<ClaimedEvent | ClaimSkipped | null> {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - CLAIM_TIMEOUT_MS);
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{
        id: number;
        attempts: number;
        eventType: string;
        payload: Prisma.JsonValue;
        status: string;
        lastErrorCode: string | null;
      }>>(Prisma.sql`
        SELECT
          id,
          attempts,
          event_type AS eventType,
          payload,
          status,
          last_error_code AS lastErrorCode
        FROM outbox_events
        WHERE event_type IN (${ORDER_EVENT_TYPE}, ${LEAD_REPLY_NOTIFICATION_EVENT_TYPE})
          AND available_at <= ${now}
          AND (
            status = 'PENDING'
            OR (status = 'PROCESSING' AND locked_at < ${staleBefore})
          )
        ORDER BY available_at ASC, id ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `);
      const candidate = rows[0];
      if (!candidate) return null;
      if (
        candidate.eventType === LEAD_REPLY_NOTIFICATION_EVENT_TYPE
        && candidate.status === "PROCESSING"
        && candidate.lastErrorCode === SEND_STARTED
      ) {
        const failed = await tx.outboxEvent.updateMany({
          where: {
            id: candidate.id,
            status: "PROCESSING",
            lockedAt: { lt: staleBefore },
            lastErrorCode: SEND_STARTED,
          },
          data: {
            status: "FAILED",
            lockedAt: null,
            lockedBy: null,
            lastErrorCode: "DELIVERY_RESULT_UNKNOWN",
          },
        });
        if (failed.count === 1) {
          await this.writeManualRetryOutcome(
            tx,
            candidate,
            "TERMINATED",
            "DELIVERY_RESULT_UNKNOWN",
          );
        }
        this.logger.warn(
          `通知投递事件 ${candidate.id} 发送结果未知，已停止自动重发`,
        );
        return { skipped: true };
      }
      const event = await tx.outboxEvent.update({
        where: { id: candidate.id },
        data: {
          status: "PROCESSING",
          lockedAt: now,
          lockedBy: this.workerId,
          attempts: { increment: 1 },
          lastErrorCode: null,
        },
        select: { id: true, attempts: true, eventType: true, payload: true },
      });
      return event;
    });
  }

  private async processClaimed(event: ClaimedEvent) {
    if (event.eventType === LEAD_REPLY_NOTIFICATION_EVENT_TYPE) {
      await this.processLeadReply(event);
      return;
    }
    if (event.eventType !== ORDER_EVENT_TYPE) {
      await this.fail(event, "UNSUPPORTED_EVENT_TYPE", true);
      return;
    }
    const payload = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
      ? event.payload as Record<string, unknown>
      : {};
    const notificationId = asPositiveInteger(payload.notificationId);
    if (!notificationId) {
      await this.fail(event, "INVALID_EVENT_PAYLOAD", true);
      return;
    }

    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      include: { deliveries: true },
    });
    if (!notification) {
      await this.fail(event, "NOTIFICATION_NOT_FOUND", true);
      return;
    }
    const emailDelivery = notification.deliveries.find(
      (delivery) => delivery.channel === "EMAIL",
    );
    if (!emailDelivery || ["SENT", "DELIVERED", "CANCELLED", "SUPPRESSED"].includes(emailDelivery.status)) {
      await this.completeClaimed(event);
      return;
    }
    if (emailDelivery.status === "SENDING") {
      // SMTP 接受与本地 SENT 落账之间崩溃时结果不可知。SMTP 没有可靠幂等键，
      // 因此保守停止自动重发，交由人工核对，避免重复发送付款通知。
      await this.fail(event, "DELIVERY_RESULT_UNKNOWN", true, emailDelivery.id);
      return;
    }

    if (!await this.claimDeliveryForSend(event.id, emailDelivery.id)) {
      await this.completeClaimed(event);
      return;
    }

    // 注销或归档可能在领取 Outbox 后发生；发送前再次读取当前状态以缩小竞态窗口。
    // 外部 SMTP 调用无法撤回已在途请求，因此成功/失败回写也必须使用条件更新，
    // 绝不能把注销事务写入的 CANCELLED 状态覆盖回 SENT 或 FAILED。
    const stillSendable = await this.prisma.notificationDelivery.findFirst({
      where: {
        id: emailDelivery.id,
        status: "SENDING",
        notification: {
          status: { in: ["AVAILABLE", "READ"] },
          customer: { status: "ACTIVE" },
        },
      },
      select: { id: true },
    });
    if (!stillSendable) {
      await this.completeClaimed(event);
      return;
    }

    let destination: string | null = null;
    if (notification.type === "SERVICE_CONSULTATION_REPLIED") {
      const customer = await this.prisma.customer.findUnique({
        where: { id: notification.customerId },
        select: { email: true, status: true },
      });
      destination = customer?.status === "ACTIVE"
        ? customer.email?.trim().toLowerCase() || null
        : null;
    } else {
      const orderId = asPositiveInteger(payload.orderId);
      if (!orderId) {
        await this.fail(event, "INVALID_EVENT_PAYLOAD", true, emailDelivery.id);
        return;
      }
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: { customerId: true, customerEmail: true },
      });
      destination = order?.customerId === notification.customerId
        ? order.customerEmail?.trim().toLowerCase() || null
        : null;
    }
    if (!destination || emailDelivery.destinationHash !== emailHash(destination)) {
      await this.suppress(event, emailDelivery.id, "DESTINATION_UNAVAILABLE");
      return;
    }

    const policy = await this.deliveryPolicy.evaluate(this.prisma, {
      customerId: notification.customerId,
      channel: "EMAIL",
      topic: notification.type,
    });
    if (!policy.allowed) {
      await this.suppress(event, emailDelivery.id, policy.reason);
      return;
    }

    const actionUrl = notification.actionUrl?.startsWith("/")
      ? `${this.mailer.getSiteBaseUrl()}${notification.actionUrl}`
      : null;
    const result = await this.mailer.send(
      {
        to: destination,
        subject: notification.title,
        html: this.mailer.renderShell(`
          <p>${escapeHtml(notification.body)}</p>
          ${actionUrl ? `<p><a href="${escapeHtml(actionUrl)}">查看客户中心</a></p>` : ""}
        `),
      },
      {
        requireNotificationDeliveryEnabled: true,
        idempotencyKey: `notification:event:${event.id}`,
      },
    );
    if (result.delivered) {
      await this.completeSentDelivery(event, emailDelivery.id);
      return;
    }

    if (result.reason === "result_unknown") {
      await this.fail(event, "DELIVERY_RESULT_UNKNOWN", true, emailDelivery.id);
      return;
    }
    const reason = result.reason === "not_configured"
      ? "SMTP_NOT_CONFIGURED"
      : result.reason === "delivery_disabled"
        ? "NOTIFICATION_DELIVERY_DISABLED"
        : "SMTP_SEND_FAILED";
    await this.fail(event, reason, false, emailDelivery.id);
  }

  private async processLeadReply(event: ClaimedEvent) {
    const payload = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
      ? event.payload as Record<string, unknown>
      : {};
    const leadId = asPositiveInteger(payload.leadId);
    const activityId = asPositiveInteger(payload.activityId);
    if (!leadId || !activityId) {
      await this.fail(event, "INVALID_EVENT_PAYLOAD", true);
      return;
    }

    const activity = await this.prisma.leadActivity.findUnique({
      where: { id: activityId },
      include: { lead: { include: { inquiry: true } } },
    });
    const inquiry = activity?.lead.inquiry;
    const destination = inquiry?.customerEmail?.trim().toLowerCase() || null;
    if (
      !activity
      || activity.leadId !== leadId
      || activity.type !== "REPLY"
      || activity.lead.sourceType !== "INQUIRY"
      || activity.lead.privacyDisposedAt
      || !activity.content
      || !inquiry
      || !destination
    ) {
      await this.fail(event, "DESTINATION_UNAVAILABLE", true);
      return;
    }

    const sendStarted = await this.prisma.outboxEvent.updateMany({
      where: { id: event.id, status: "PROCESSING", lockedBy: this.workerId },
      data: { lockedAt: new Date(), lastErrorCode: SEND_STARTED },
    });
    if (sendStarted.count !== 1) return;

    // 匿名化/注销可能发生在领取事件之后；SMTP 调用前重新读取处置状态和正文。
    // 外部发送无法撤回，因此匿名化事务也会以 CAS 终止该 Outbox，缩小竞态窗口。
    const stillSendable = await this.prisma.leadActivity.findUnique({
      where: { id: activityId },
      include: { lead: { include: { inquiry: true } } },
    });
    const currentInquiry = stillSendable?.lead.inquiry;
    const currentDestination = currentInquiry?.customerEmail
      ?.trim()
      .toLowerCase() || null;
    if (
      !stillSendable
      || stillSendable.leadId !== leadId
      || stillSendable.type !== "REPLY"
      || stillSendable.lead.privacyDisposedAt
      || !stillSendable.content
      || !currentInquiry
      || !currentDestination
    ) {
      await this.fail(
        event,
        stillSendable?.lead.privacyDisposedAt
          ? LEAD_PRIVACY_DISPOSITION_ERROR_CODE
          : "DESTINATION_UNAVAILABLE",
        true,
      );
      return;
    }

    let result: Awaited<ReturnType<MailerService["send"]>>;
    try {
      const accountHint = currentInquiry.customerId
        ? `<p>如需继续沟通，可<a href="${escapeHtml(this.mailer.getSiteBaseUrl())}/customer">登录客户中心</a>查看详情。</p>`
        : "<p>如需继续沟通，请使用您提交咨询时填写的常用联系方式。</p>";
      result = await this.mailer.send(
        {
          to: currentDestination,
          subject: "您的咨询已回复 - 海川珠宝",
          html: this.mailer.renderShell(`
            <p>您好，${escapeHtml(currentInquiry.customerName)}：</p>
            <p>您的咨询已有顾问回复：</p>
            <div style="background:#f9f7f4;padding:16px;border-radius:6px;margin:16px 0;white-space:pre-wrap;">${escapeHtml(stillSendable.content)}</div>
            ${accountHint}
          `),
        },
        {
          requireNotificationDeliveryEnabled: true,
          idempotencyKey: `notification:event:${event.id}`,
        },
      );
    } catch {
      await this.fail(event, "SMTP_SEND_FAILED", false);
      return;
    }
    if (result.delivered) {
      await this.completeClaimed(event);
      return;
    }
    if (result.reason === "result_unknown") {
      await this.fail(event, "DELIVERY_RESULT_UNKNOWN", true);
      return;
    }
    const reason = result.reason === "not_configured"
      ? "SMTP_NOT_CONFIGURED"
      : result.reason === "delivery_disabled"
        ? "NOTIFICATION_DELIVERY_DISABLED"
        : "SMTP_SEND_FAILED";
    await this.fail(event, reason, false);
  }

  private async claimDeliveryForSend(eventId: number, deliveryId: number) {
    return this.prisma.$transaction(async (tx) => {
      const owner = await tx.outboxEvent.updateMany({
        where: { id: eventId, status: "PROCESSING", lockedBy: this.workerId },
        data: { lockedAt: new Date() },
      });
      if (owner.count !== 1) return false;
      const delivery = await tx.notificationDelivery.updateMany({
        where: {
          id: deliveryId,
          status: { in: ["PENDING", "FAILED"] },
          notification: {
            status: { in: ["AVAILABLE", "READ"] },
            customer: { status: "ACTIVE" },
          },
        },
        data: {
          status: "SENDING",
          attempts: { increment: 1 },
          nextAttemptAt: null,
          provider: "smtp",
          lastErrorCode: null,
        },
      });
      return delivery.count === 1;
    });
  }

  private async suppress(event: ClaimedEvent, deliveryId: number, errorCode: string) {
    await this.prisma.$transaction(async (tx) => {
      const owner = await tx.outboxEvent.updateMany({
        where: { id: event.id, status: "PROCESSING", lockedBy: this.workerId },
        data: { lockedAt: new Date() },
      });
      if (owner.count !== 1) return;
      await tx.notificationDelivery.updateMany({
        where: {
          id: deliveryId,
          status: { in: ["PENDING", "FAILED", "SENDING"] },
        },
        data: {
          status: "SUPPRESSED",
          failedAt: new Date(),
          nextAttemptAt: null,
          lastErrorCode: errorCode,
        },
      });
      const completed = await tx.outboxEvent.updateMany({
        where: { id: event.id, status: "PROCESSING", lockedBy: this.workerId },
        data: {
          status: "PROCESSED",
          processedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
          lastErrorCode: null,
        },
      });
      if (completed.count === 1) {
        await this.writeManualRetryOutcome(tx, event, "TERMINATED", errorCode);
      }
    });
  }

  private async completeSentDelivery(event: ClaimedEvent, deliveryId: number) {
    await this.prisma.$transaction(async (tx) => {
      const owner = await tx.outboxEvent.updateMany({
        where: { id: event.id, status: "PROCESSING", lockedBy: this.workerId },
        data: { lockedAt: new Date() },
      });
      if (owner.count !== 1) return;
      await tx.notificationDelivery.updateMany({
        where: { id: deliveryId, status: "SENDING" },
        data: {
          // SMTP 接受不等于最终送达；没有回执时只能记 SENT。
          status: "SENT",
          sentAt: new Date(),
          failedAt: null,
          nextAttemptAt: null,
          lastErrorCode: null,
        },
      });
      const completed = await tx.outboxEvent.updateMany({
        where: { id: event.id, status: "PROCESSING", lockedBy: this.workerId },
        data: {
          status: "PROCESSED",
          processedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
          lastErrorCode: null,
        },
      });
      if (completed.count === 1) {
        await this.writeManualRetryOutcome(tx, event, "SUCCEEDED");
      }
    });
  }

  private async complete(eventId: number) {
    await this.prisma.outboxEvent.updateMany({
      where: { id: eventId, status: "PROCESSING", lockedBy: this.workerId },
      data: {
        status: "PROCESSED",
        processedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        lastErrorCode: null,
      },
    });
  }

  private async completeClaimed(event: ClaimedEvent) {
    if (!this.manualRetryAuditContext(event)) {
      await this.complete(event.id);
      return;
    }
    await this.prisma.$transaction(async (tx) => {
      const completed = await tx.outboxEvent.updateMany({
        where: { id: event.id, status: "PROCESSING", lockedBy: this.workerId },
        data: {
          status: "PROCESSED",
          processedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
          lastErrorCode: null,
        },
      });
      if (completed.count === 1) {
        await this.writeManualRetryOutcome(tx, event, "SUCCEEDED");
      }
    });
  }

  private async fail(
    event: ClaimedEvent,
    errorCode: string,
    terminal: boolean,
    deliveryId?: number,
  ) {
    const exhausted = terminal || event.attempts >= MAX_ATTEMPTS;
    const delayMinutes = Math.min(60, 2 ** Math.max(0, event.attempts - 1));
    const nextAttemptAt = exhausted
      ? null
      : new Date(Date.now() + delayMinutes * 60 * 1000);
    await this.prisma.$transaction(async (tx) => {
      const owner = await tx.outboxEvent.updateMany({
        where: { id: event.id, status: "PROCESSING", lockedBy: this.workerId },
        data: { lockedAt: new Date() },
      });
      if (owner.count !== 1) return;
      let deliveryCanRetry = true;
      if (deliveryId) {
        const deliveryUpdate = await tx.notificationDelivery.updateMany({
          where: { id: deliveryId, status: "SENDING" },
          data: {
            status: "FAILED",
            failedAt: new Date(),
            nextAttemptAt,
            lastErrorCode: errorCode,
          },
        });
        deliveryCanRetry = deliveryUpdate.count === 1;
      }
      const finalStatus = !deliveryCanRetry ? "PROCESSED" : exhausted ? "FAILED" : "PENDING";
      const updated = await tx.outboxEvent.updateMany({
        where: { id: event.id, status: "PROCESSING", lockedBy: this.workerId },
        data: {
          status: finalStatus,
          availableAt: !deliveryCanRetry ? new Date() : nextAttemptAt ?? new Date(),
          processedAt: !deliveryCanRetry ? new Date() : null,
          lockedAt: null,
          lockedBy: null,
          lastErrorCode: !deliveryCanRetry ? null : errorCode,
        },
      });
      if (updated.count === 1 && exhausted) {
        await this.writeManualRetryOutcome(
          tx,
          event,
          "TERMINATED",
          errorCode,
        );
      }
    });
    if (exhausted) {
      // 死信告警：重试耗尽的通知进入 FAILED 终态，ERROR 级供值班监控直接告警；
      // 事件 id/类型/错误码足够人工排查，不记录收件人或渠道原始响应
      this.logger.error(
        `通知投递死信：事件 ${event.id}（${event.eventType}）重试耗尽，最终错误 ${errorCode}，需人工核实投递`,
      );
    } else {
      this.logger.warn(
        `通知投递事件 ${event.id} 处理失败（第 ${event.attempts} 次）：${errorCode}，${delayMinutes} 分钟后重试`,
      );
    }
  }

  private manualRetryAuditContext(event: ClaimedEvent): ManualRetryAuditContext | null {
    if (
      !event.payload
      || typeof event.payload !== "object"
      || Array.isArray(event.payload)
    ) {
      return null;
    }
    const payload = event.payload as Record<string, unknown>;
    const manualRetry = payload.manualRetry;
    if (!manualRetry || typeof manualRetry !== "object" || Array.isArray(manualRetry)) {
      return null;
    }
    const retry = manualRetry as Record<string, unknown>;
    const requestedBy = asPositiveInteger(retry.requestedBy);
    if (!requestedBy) return null;
    if (event.eventType === LEAD_REPLY_NOTIFICATION_EVENT_TYPE) {
      const leadId = asPositiveInteger(payload.leadId);
      return leadId ? { kind: "lead", leadId, requestedBy } : null;
    }
    if (event.eventType === SERVICE_NOTIFICATION_EVENT_TYPE) {
      const notificationId = asPositiveInteger(payload.notificationId);
      return notificationId
        ? { kind: "notification", notificationId, requestedBy }
        : null;
    }
    return null;
  }

  private async writeManualRetryOutcome(
    tx: Prisma.TransactionClient,
    event: ClaimedEvent,
    outcome: "SUCCEEDED" | "TERMINATED",
    errorCode?: string,
  ) {
    const context = this.manualRetryAuditContext(event);
    if (!context) return;
    const succeeded = outcome === "SUCCEEDED";
    if (context.kind === "notification") {
      await tx.operationLog.create({
        data: {
          userId: context.requestedBy,
          action: succeeded
            ? "NOTIFICATION_RETRY_SUCCEEDED"
            : "NOTIFICATION_RETRY_TERMINATED",
          module: "notifications",
          targetId: event.id,
          detail: JSON.stringify({
            schemaVersion: 1,
            eventId: event.id,
            notificationId: context.notificationId,
            result: outcome,
            ...(errorCode ? { errorCode } : {}),
          }),
        },
      });
      return;
    }
    await tx.leadActivity.create({
      data: {
        leadId: context.leadId,
        type: "NOTE",
        content: succeeded
          ? `回复通知人工重投已成功（事件 #${event.id}）`
          : `回复通知人工重投已终止（事件 #${event.id}，错误码：${errorCode ?? "UNKNOWN"}）`,
        createdBy: context.requestedBy,
        metadata: {
          action: succeeded
            ? "LEAD_REPLY_NOTIFICATION_RETRY_SUCCEEDED"
            : "LEAD_REPLY_NOTIFICATION_RETRY_TERMINATED",
          eventId: event.id,
          ...(errorCode ? { errorCode } : {}),
        },
      },
    });
  }
}
