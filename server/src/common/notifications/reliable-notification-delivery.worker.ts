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
} from "./notification-delivery.constants";

const ORDER_EVENT_TYPE = "notification.delivery.requested";
const SEND_STARTED = "SEND_STARTED";
const MAX_ATTEMPTS = 5;
const CLAIM_TIMEOUT_MS = 5 * 60 * 1000;

type ClaimedEvent = {
  id: number;
  attempts: number;
  eventType: string;
  payload: Prisma.JsonValue;
};

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
      await this.processClaimed(event);
      processed += 1;
    }
    return processed;
  }

  private async claimNext(): Promise<ClaimedEvent | null> {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - CLAIM_TIMEOUT_MS);
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{
        id: number;
        eventType: string;
        status: string;
        lastErrorCode: string | null;
      }>>(Prisma.sql`
        SELECT
          id,
          event_type AS eventType,
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
        await tx.outboxEvent.updateMany({
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
        this.logger.warn(
          `通知投递事件 ${candidate.id} 发送结果未知，已停止自动重发`,
        );
        return null;
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
    const orderId = asPositiveInteger(payload.orderId);
    if (!notificationId || !orderId) {
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
      await this.complete(event.id);
      return;
    }
    if (emailDelivery.status === "SENDING") {
      // SMTP 接受与本地 SENT 落账之间崩溃时结果不可知。SMTP 没有可靠幂等键，
      // 因此保守停止自动重发，交由人工核对，避免重复发送付款通知。
      await this.fail(event, "DELIVERY_RESULT_UNKNOWN", true, emailDelivery.id);
      return;
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, customerId: true, customerEmail: true },
    });
    const destination = order?.customerEmail?.trim().toLowerCase() || null;
    if (
      !order
      || order.customerId !== notification.customerId
      || !destination
      || emailDelivery.destinationHash !== emailHash(destination)
    ) {
      await this.suppress(event.id, emailDelivery.id, "DESTINATION_UNAVAILABLE");
      return;
    }

    if (!await this.claimDeliveryForSend(event.id, emailDelivery.id)) {
      await this.complete(event.id);
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
      await this.complete(event.id);
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
      { requireNotificationDeliveryEnabled: true },
    );
    if (result.delivered) {
      await this.completeSentDelivery(event.id, emailDelivery.id);
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
    if (
      !stillSendable
      || stillSendable.leadId !== leadId
      || stillSendable.type !== "REPLY"
      || stillSendable.lead.privacyDisposedAt
      || !stillSendable.content
      || !stillSendable.lead.inquiry?.customerEmail
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
      const accountHint = inquiry.customerId
        ? `<p>如需继续沟通，可<a href="${escapeHtml(this.mailer.getSiteBaseUrl())}/customer">登录客户中心</a>查看详情。</p>`
        : "<p>如需继续沟通，请使用您提交咨询时填写的常用联系方式。</p>";
      result = await this.mailer.send(
        {
          to: destination,
          subject: "您的咨询已回复 - 海川珠宝",
          html: this.mailer.renderShell(`
            <p>您好，${escapeHtml(inquiry.customerName)}：</p>
            <p>您的咨询已有顾问回复：</p>
            <div style="background:#f9f7f4;padding:16px;border-radius:6px;margin:16px 0;white-space:pre-wrap;">${escapeHtml(activity.content)}</div>
            ${accountHint}
          `),
        },
        { requireNotificationDeliveryEnabled: true },
      );
    } catch {
      await this.fail(event, "SMTP_SEND_FAILED", false);
      return;
    }
    if (result.delivered) {
      await this.complete(event.id);
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

  private async suppress(eventId: number, deliveryId: number, errorCode: string) {
    await this.prisma.$transaction(async (tx) => {
      const owner = await tx.outboxEvent.updateMany({
        where: { id: eventId, status: "PROCESSING", lockedBy: this.workerId },
        data: { lockedAt: new Date() },
      });
      if (owner.count !== 1) return;
      await tx.notificationDelivery.updateMany({
        where: {
          id: deliveryId,
          status: { in: ["PENDING", "FAILED"] },
        },
        data: {
          status: "SUPPRESSED",
          failedAt: new Date(),
          nextAttemptAt: null,
          lastErrorCode: errorCode,
        },
      });
      await tx.outboxEvent.updateMany({
        where: { id: eventId, status: "PROCESSING", lockedBy: this.workerId },
        data: {
          status: "PROCESSED",
          processedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
          lastErrorCode: null,
        },
      });
    });
  }

  private async completeSentDelivery(eventId: number, deliveryId: number) {
    await this.prisma.$transaction(async (tx) => {
      const owner = await tx.outboxEvent.updateMany({
        where: { id: eventId, status: "PROCESSING", lockedBy: this.workerId },
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
      await tx.outboxEvent.updateMany({
        where: { id: eventId, status: "PROCESSING", lockedBy: this.workerId },
        data: {
          status: "PROCESSED",
          processedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
          lastErrorCode: null,
        },
      });
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
      await tx.outboxEvent.updateMany({
        where: { id: event.id, status: "PROCESSING", lockedBy: this.workerId },
        data: {
          status: !deliveryCanRetry ? "PROCESSED" : exhausted ? "FAILED" : "PENDING",
          availableAt: !deliveryCanRetry ? new Date() : nextAttemptAt ?? new Date(),
          processedAt: !deliveryCanRetry ? new Date() : null,
          lockedAt: null,
          lockedBy: null,
          lastErrorCode: !deliveryCanRetry ? null : errorCode,
        },
      });
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
}
