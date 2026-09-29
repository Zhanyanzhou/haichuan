import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { MailerService } from '../../common/mailer/mailer.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OperationalMetricsService } from '../../common/observability/operational-metrics.service';
import {
  PASSWORD_RESET_AGGREGATE_TYPE,
  PASSWORD_RESET_CLAIM_TIMEOUT_MS,
  PASSWORD_RESET_DELIVERY_DEADLINE_MS,
  PASSWORD_RESET_EVENT_TYPE,
  PASSWORD_RESET_MAX_ATTEMPTS,
  PASSWORD_RESET_SEND_STARTED,
  PASSWORD_RESET_TOKEN_PREPARED,
  PASSWORD_RESET_TOKEN_TTL_MS,
} from './password-reset-outbox';

type ClaimedPasswordResetEvent = {
  id: number;
  attempts: number;
  occurredAt: Date;
  payload: Prisma.JsonValue;
};

type PreparedToken = {
  tokenId: number;
  token: string;
};

type DeliveryDestination = {
  email: string;
  displayName: string;
};

function asRecord(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asCustomerId(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function asAuthVersion(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character);
}

@Injectable()
export class PasswordResetDeliveryWorker {
  private readonly logger = new Logger(PasswordResetDeliveryWorker.name);
  private readonly workerId = `password-reset-${randomUUID()}`;
  private draining = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    @Optional() private readonly metrics?: OperationalMetricsService,
  ) {
    this.metrics?.registerWorker('password_reset_delivery', true);
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async scheduledDrain() {
    if (this.draining) return;
    this.draining = true;
    this.metrics?.recordWorkerRunStarted('password_reset_delivery');
    try {
      await this.drainOnce();
      this.metrics?.recordWorkerRunCompleted('password_reset_delivery', 'success');
    } catch {
      this.metrics?.recordWorkerRunCompleted('password_reset_delivery', 'failure');
      this.logger.error('密码重置投递任务执行失败（客户与提供商信息已脱敏）');
    } finally {
      this.draining = false;
    }
  }

  async drainOnce(limit = 20): Promise<number> {
    const boundedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    let processed = 0;
    for (let index = 0; index < boundedLimit; index += 1) {
      const claimed = await this.claimNext();
      if (!claimed) break;
      if ('skipped' in claimed) {
        processed += 1;
        continue;
      }
      await this.processClaimed(claimed);
      processed += 1;
    }
    return processed;
  }

  private async claimNext(): Promise<ClaimedPasswordResetEvent | { skipped: true } | null> {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - PASSWORD_RESET_CLAIM_TIMEOUT_MS);
    const deliveryCutoff = new Date(now.getTime() - PASSWORD_RESET_DELIVERY_DEADLINE_MS);
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{
        id: number;
        attempts: number;
        occurredAt: Date;
        payload: Prisma.JsonValue;
        status: string;
        lastErrorCode: string | null;
      }>>(Prisma.sql`
        SELECT
          id,
          attempts,
          occurred_at AS occurredAt,
          payload,
          status,
          last_error_code AS lastErrorCode
        FROM outbox_events
        WHERE aggregate_type = ${PASSWORD_RESET_AGGREGATE_TYPE}
          AND event_type = ${PASSWORD_RESET_EVENT_TYPE}
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
        candidate.status === 'PROCESSING'
        && candidate.lastErrorCode === PASSWORD_RESET_SEND_STARTED
      ) {
        await tx.outboxEvent.updateMany({
          where: {
            id: candidate.id,
            status: 'PROCESSING',
            lockedAt: { lt: staleBefore },
            lastErrorCode: PASSWORD_RESET_SEND_STARTED,
          },
          data: {
            status: 'FAILED',
            processedAt: now,
            lockedAt: null,
            lockedBy: null,
            lastErrorCode: 'PASSWORD_RESET_DELIVERY_RESULT_UNKNOWN',
          },
        });
        return { skipped: true };
      }

      if (candidate.occurredAt < deliveryCutoff) {
        await tx.outboxEvent.updateMany({
          where: {
            id: candidate.id,
            status: candidate.status as 'PENDING' | 'PROCESSING',
          },
          data: {
            status: 'FAILED',
            processedAt: now,
            lockedAt: null,
            lockedBy: null,
            lastErrorCode: 'PASSWORD_RESET_DELIVERY_EXPIRED',
          },
        });
        return { skipped: true };
      }

      return tx.outboxEvent.update({
        where: { id: candidate.id },
        data: {
          status: 'PROCESSING',
          lockedAt: now,
          lockedBy: this.workerId,
          attempts: { increment: 1 },
          lastErrorCode: null,
        },
        select: { id: true, attempts: true, occurredAt: true, payload: true },
      });
    });
  }

  private async processClaimed(event: ClaimedPasswordResetEvent) {
    const payload = asRecord(event.payload);
    const customerId = asCustomerId(payload.customerId);
    const requestedAuthVersion = asAuthVersion(payload.requestedAuthVersion);
    if (payload.schemaVersion !== 1 || !customerId || !requestedAuthVersion) {
      await this.completeWithoutDelivery(event.id, 'PASSWORD_RESET_NO_ACCOUNT');
      return;
    }

    const prepared = await this.prepareToken(event.id, customerId, requestedAuthVersion);
    if (!prepared) return;
    const destination = await this.beginSend(
      event.id,
      customerId,
      requestedAuthVersion,
      prepared.tokenId,
    );
    if (!destination) return;

    const resetUrl = `${this.mailer.getSiteBaseUrl()}/customer/reset#token=${prepared.token}`;
    let result: { delivered: boolean; reason?: string };
    try {
      result = await this.mailer.send(
        {
          to: destination.email,
          subject: '密码重置 - 海川珠宝',
          html: this.mailer.renderShell(`
            <p>您好，${escapeHtml(destination.displayName)}：</p>
            <p>我们收到了重置您账户密码的请求。请点击下方按钮设置新密码（30 分钟内有效，且仅可使用一次）：</p>
            <p style="margin:24px 0;">
              <a href="${resetUrl}" style="display:inline-block;background:#d4af37;color:#1a1a1a;padding:12px 32px;border-radius:4px;text-decoration:none;font-weight:bold;">重置密码</a>
            </p>
            <p style="word-break:break-all;color:#888;font-size:12px;">若按钮无法点击，请复制此链接到浏览器打开：<br/>${resetUrl}</p>
          `),
        },
        { idempotencyKey: `password-reset:event:${event.id}` },
      );
    } catch {
      await this.finishUnknown(event.id);
      return;
    }

    if (result.delivered) {
      await this.complete(event.id);
      return;
    }
    if (result.reason === 'result_unknown') {
      await this.finishUnknown(event.id);
      return;
    }
    const errorCode = result.reason === 'not_configured'
      ? 'PASSWORD_RESET_SMTP_NOT_CONFIGURED'
      : 'PASSWORD_RESET_SMTP_SEND_FAILED';
    await this.retryKnownFailure(event, customerId, prepared.tokenId, errorCode);
  }

  private async prepareToken(
    eventId: number,
    customerId: number,
    requestedAuthVersion: number,
  ): Promise<PreparedToken | null> {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: number }>>(
        Prisma.sql`SELECT id FROM customers WHERE id = ${customerId} FOR UPDATE`,
      );
      const owner = await tx.outboxEvent.updateMany({
        where: { id: eventId, status: 'PROCESSING', lockedBy: this.workerId },
        data: { lockedAt: new Date() },
      });
      if (owner.count !== 1) return null;
      const customer = locked.length === 1
        ? await tx.customer.findUnique({
            where: { id: customerId },
            select: { email: true, status: true, authVersion: true },
          })
        : null;
      const newerRequest = await tx.outboxEvent.findFirst({
        where: {
          aggregateType: PASSWORD_RESET_AGGREGATE_TYPE,
          aggregateId: String(customerId),
          eventType: PASSWORD_RESET_EVENT_TYPE,
          id: { gt: eventId },
        },
        select: { id: true },
      });
      if (newerRequest) {
        await tx.outboxEvent.updateMany({
          where: { id: eventId, status: 'PROCESSING', lockedBy: this.workerId },
          data: {
            status: 'FAILED',
            processedAt: new Date(),
            lockedAt: null,
            lockedBy: null,
            lastErrorCode: 'PASSWORD_RESET_SUPERSEDED',
          },
        });
        return null;
      }
      if (
        !customer
        || customer.status !== 'ACTIVE'
        || !customer.email?.trim()
        || customer.authVersion !== requestedAuthVersion
      ) {
        await tx.outboxEvent.updateMany({
          where: { id: eventId, status: 'PROCESSING', lockedBy: this.workerId },
          data: {
            status: 'PROCESSED',
            processedAt: new Date(),
            lockedAt: null,
            lockedBy: null,
            lastErrorCode: 'PASSWORD_RESET_DESTINATION_UNAVAILABLE',
          },
        });
        return null;
      }

      const preparedAt = new Date();
      await tx.customerPasswordResetToken.updateMany({
        where: { customerId, usedAt: null },
        data: { usedAt: preparedAt },
      });
      const token = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const created = await tx.customerPasswordResetToken.create({
        data: {
          customerId,
          tokenHash,
          expiresAt: new Date(preparedAt.getTime() + PASSWORD_RESET_TOKEN_TTL_MS),
        },
        select: { id: true },
      });
      const marked = await tx.outboxEvent.updateMany({
        where: { id: eventId, status: 'PROCESSING', lockedBy: this.workerId },
        data: { lockedAt: preparedAt, lastErrorCode: PASSWORD_RESET_TOKEN_PREPARED },
      });
      if (marked.count !== 1) throw new Error('password reset event ownership lost');
      return { tokenId: created.id, token };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async beginSend(
    eventId: number,
    customerId: number,
    requestedAuthVersion: number,
    tokenId: number,
  ): Promise<DeliveryDestination | null> {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: number }>>(
        Prisma.sql`SELECT id FROM customers WHERE id = ${customerId} FOR UPDATE`,
      );
      const customer = locked.length === 1
        ? await tx.customer.findUnique({
            where: { id: customerId },
            select: { email: true, name: true, phone: true, status: true, authVersion: true },
          })
        : null;
      const now = new Date();
      const token = await tx.customerPasswordResetToken.findFirst({
        where: { id: tokenId, customerId, usedAt: null, expiresAt: { gte: now } },
        select: { id: true },
      });
      if (
        !customer
        || customer.status !== 'ACTIVE'
        || !customer.email?.trim()
        || customer.authVersion !== requestedAuthVersion
        || !token
      ) {
        await tx.customerPasswordResetToken.updateMany({
          where: { id: tokenId, customerId, usedAt: null },
          data: { usedAt: now },
        });
        await tx.outboxEvent.updateMany({
          where: { id: eventId, status: 'PROCESSING', lockedBy: this.workerId },
          data: {
            status: 'FAILED',
            processedAt: now,
            lockedAt: null,
            lockedBy: null,
            lastErrorCode: 'PASSWORD_RESET_STATE_CHANGED',
          },
        });
        return null;
      }
      const started = await tx.outboxEvent.updateMany({
        where: {
          id: eventId,
          status: 'PROCESSING',
          lockedBy: this.workerId,
          lastErrorCode: PASSWORD_RESET_TOKEN_PREPARED,
        },
        data: { lockedAt: now, lastErrorCode: PASSWORD_RESET_SEND_STARTED },
      });
      if (started.count !== 1) return null;
      return {
        email: customer.email.trim().toLowerCase(),
        displayName: customer.name || customer.phone,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async completeWithoutDelivery(eventId: number, errorCode: string) {
    await this.prisma.outboxEvent.updateMany({
      where: { id: eventId, status: 'PROCESSING', lockedBy: this.workerId },
      data: {
        status: 'PROCESSED',
        processedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        lastErrorCode: errorCode,
      },
    });
  }

  private async complete(eventId: number) {
    await this.prisma.outboxEvent.updateMany({
      where: {
        id: eventId,
        status: 'PROCESSING',
        lockedBy: this.workerId,
        lastErrorCode: PASSWORD_RESET_SEND_STARTED,
      },
      data: {
        status: 'PROCESSED',
        processedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        lastErrorCode: null,
      },
    });
  }

  private async finishUnknown(eventId: number) {
    await this.prisma.outboxEvent.updateMany({
      where: {
        id: eventId,
        status: 'PROCESSING',
        lockedBy: this.workerId,
        lastErrorCode: PASSWORD_RESET_SEND_STARTED,
      },
      data: {
        status: 'FAILED',
        processedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        lastErrorCode: 'PASSWORD_RESET_DELIVERY_RESULT_UNKNOWN',
      },
    });
  }

  private async retryKnownFailure(
    event: ClaimedPasswordResetEvent,
    customerId: number,
    tokenId: number,
    errorCode: string,
  ) {
    const now = new Date();
    const delayMinutes = Math.min(8, 2 ** Math.max(0, event.attempts - 1));
    const nextAttemptAt = new Date(now.getTime() + delayMinutes * 60_000);
    const deadline = new Date(event.occurredAt.getTime() + PASSWORD_RESET_DELIVERY_DEADLINE_MS);
    const exhausted = event.attempts >= PASSWORD_RESET_MAX_ATTEMPTS || nextAttemptAt >= deadline;
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: number }>>(
        Prisma.sql`SELECT id FROM customers WHERE id = ${customerId} FOR UPDATE`,
      );
      const released = await tx.outboxEvent.updateMany({
        where: {
          id: event.id,
          status: 'PROCESSING',
          lockedBy: this.workerId,
          lastErrorCode: PASSWORD_RESET_SEND_STARTED,
        },
        data: exhausted
          ? {
              status: 'FAILED',
              processedAt: now,
              lockedAt: null,
              lockedBy: null,
              lastErrorCode: errorCode,
            }
          : {
              status: 'PENDING',
              availableAt: nextAttemptAt,
              processedAt: null,
              lockedAt: null,
              lockedBy: null,
              lastErrorCode: errorCode,
            },
      });
      if (released.count !== 1) return;
      await tx.customerPasswordResetToken.updateMany({
        where: { id: tokenId, usedAt: null },
        data: { usedAt: now },
      });
    });
  }
}
