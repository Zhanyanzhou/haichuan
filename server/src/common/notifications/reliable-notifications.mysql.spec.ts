import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { AddressInfo } from "node:net";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { PrismaClient } from "@prisma/client";
import { OutboxService } from "../outbox/outbox.service";
import { RolesGuard } from "../guards/roles.guard";
import { JwtAuthGuard } from "../../modules/auth/jwt-auth.guard";
import { ReliableNotificationIntentService } from "./reliable-notification-intent.service";
import { ReliableNotificationDeliveryWorker } from "./reliable-notification-delivery.worker";
import { ReliableNotificationOperationsController } from "./reliable-notification-operations.controller";
import { ReliableNotificationOperationsService } from "./reliable-notification-operations.service";
import { NotificationDeliveryPolicyService } from "./notification-delivery-policy.service";

const { validateTarget } = require("../../../scripts/run-real-mysql-tests.cjs");
const databaseUrl = process.env.REAL_MYSQL_TEST_DATABASE_URL;

test(
  "真实 MySQL：通知意图原子去重、并发领取、幂等发送、退避与终止",
  { skip: databaseUrl ? false : "需要显式提供一次性 REAL_MYSQL_TEST_DATABASE_URL" },
  async () => {
    assert.equal(databaseUrl, validateTarget(process.env));
    const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    const customer = await prisma.customer.create({
      data: {
        phone: `18${String(Date.now()).slice(-9)}`,
        name: `通知隔离客户-${suffix}`,
        email: `notification-${suffix}@example.invalid`,
      },
    });
    const admin = await prisma.user.create({
      data: {
        username: `notif_admin_${suffix}`,
        password: "isolated-test-hash",
        role: "ADMIN",
      },
    });
    const orderData = (sequence: number) => ({
      orderNo: `NTF${suffix}${sequence}`.slice(0, 30),
      customerId: customer.id,
      customerName: customer.name || "隔离客户",
      customerPhone: customer.phone,
      customerEmail: customer.email,
      address: "隔离测试地址",
      totalAmount: 10,
      finalAmount: 10,
      shippingAddressSnapshot: {
        version: 1,
        recipientName: "隔离客户",
        recipientPhone: customer.phone,
        detail: "隔离测试地址",
      },
      pricingSnapshot: {
        version: 1,
        currency: "CNY",
        itemSubtotalCents: 1000,
        discountCents: 0,
        shippingCents: 0,
        insuranceCents: 0,
        taxCents: 0,
        adjustmentCents: 0,
        finalCents: 1000,
      },
    });
    const orders = await Promise.all([
      prisma.order.create({ data: orderData(1) }),
      prisma.order.create({ data: orderData(2) }),
      prisma.order.create({ data: orderData(3) }),
      prisma.order.create({ data: orderData(4) }),
    ]);
    const policy = new NotificationDeliveryPolicyService();
    const service = new ReliableNotificationIntentService(new OutboxService(), policy);

    try {
      await prisma.$transaction((tx) => service.enqueueOrderCreated(tx, {
        id: orders[0].id,
        orderNo: orders[0].orderNo,
        customerId: customer.id,
        customerEmail: customer.email,
        finalAmount: orders[0].finalAmount,
      }));
      const successfulEvent = await prisma.outboxEvent.findUniqueOrThrow({
        where: { deduplicationKey: `order.created:${orders[0].id}` },
      });
      const successfulNotificationId = Number(
        (successfulEvent.payload as Record<string, unknown>).notificationId,
      );
      assert.equal(
        await prisma.notificationDelivery.count({
          where: { notificationId: successfulNotificationId },
        }),
        2,
      );

      const beforeRace = await prisma.notification.count({
        where: { customerId: customer.id },
      });
      const racingIntent = () => prisma.$transaction((tx) =>
        service.enqueueOrderCreated(tx, {
          id: orders[1].id,
          orderNo: orders[1].orderNo,
          customerId: customer.id,
          customerEmail: customer.email,
          finalAmount: orders[1].finalAmount,
        })
      );
      const race = await Promise.allSettled([racingIntent(), racingIntent()]);
      assert.equal(race.filter((result) => result.status === "fulfilled").length, 1);
      assert.equal(race.filter((result) => result.status === "rejected").length, 1);
      assert.equal(
        await prisma.outboxEvent.count({
          where: { deduplicationKey: `order.created:${orders[1].id}` },
        }),
        1,
      );
      assert.equal(
        await prisma.notification.count({ where: { customerId: customer.id } }),
        beforeRace + 1,
      );
      const racingEvent = await prisma.outboxEvent.findUniqueOrThrow({
        where: { deduplicationKey: `order.created:${orders[1].id}` },
      });
      const racingNotificationId = Number(
        (racingEvent.payload as Record<string, unknown>).notificationId,
      );
      await prisma.outboxEvent.delete({ where: { id: racingEvent.id } });
      await prisma.notificationDelivery.deleteMany({
        where: { notificationId: racingNotificationId },
      });
      await prisma.notification.delete({ where: { id: racingNotificationId } });

      let successSends = 0;
      const idempotencyKeys: string[] = [];
      const successMailer = {
        getSiteBaseUrl: () => "http://127.0.0.1",
        renderShell: (html: string) => html,
        send: async (_message: unknown, options: { idempotencyKey?: string }) => {
          successSends += 1;
          idempotencyKeys.push(options.idempotencyKey || "");
          return { delivered: true };
        },
      };
      const enabledConfig = { get: () => "true" };
      const workers = [
        new ReliableNotificationDeliveryWorker(prisma as never, enabledConfig as never, successMailer as never, policy),
        new ReliableNotificationDeliveryWorker(prisma as never, enabledConfig as never, successMailer as never, policy),
      ];
      const processed = await Promise.all(workers.map((worker) => worker.drainOnce(1)));
      assert.deepEqual(processed.sort(), [0, 1]);
      assert.equal(successSends, 1);
      assert.deepEqual(idempotencyKeys, [`notification:event:${successfulEvent.id}`]);
      assert.equal(
        (await prisma.outboxEvent.findUniqueOrThrow({ where: { id: successfulEvent.id } })).status,
        "PROCESSED",
      );
      const sentDelivery = await prisma.notificationDelivery.findUniqueOrThrow({
        where: {
          notificationId_channel: {
            notificationId: successfulNotificationId,
            channel: "EMAIL",
          },
        },
      });
      assert.equal(sentDelivery.status, "SENT");
      assert.equal(sentDelivery.attempts, 1);
      await Promise.all(workers.map((worker) => worker.drainOnce(1)));
      assert.equal(successSends, 1);

      await prisma.$transaction((tx) => service.enqueueLeadReply(tx, {
        leadId: customer.id,
        activityId: customer.id,
        customerId: customer.id,
        occurredAt: new Date(),
      }));
      const consultationEvent = await prisma.outboxEvent.findUniqueOrThrow({
        where: { deduplicationKey: `lead.reply.in-app:${customer.id}` },
      });
      const consultationNotificationId = Number(
        (consultationEvent.payload as Record<string, unknown>).notificationId,
      );
      const consultationEmail = await prisma.notificationDelivery.findUniqueOrThrow({
        where: {
          notificationId_channel: {
            notificationId: consultationNotificationId,
            channel: "EMAIL",
          },
        },
      });
      assert.equal(consultationEmail.status, "PENDING");
      assert.ok(consultationEmail.destinationHash);
      await workers[0].drainOnce(1);
      assert.equal(successSends, 2);
      assert.equal(
        (await prisma.notificationDelivery.findUniqueOrThrow({
          where: {
            notificationId_channel: {
              notificationId: consultationNotificationId,
              channel: "EMAIL",
            },
          },
        })).status,
        "SENT",
      );

      await prisma.$transaction((tx) => service.enqueueOrderCreated(tx, {
        id: orders[2].id,
        orderNo: orders[2].orderNo,
        customerId: customer.id,
        customerEmail: customer.email,
        finalAmount: orders[2].finalAmount,
      }));
      const failingEvent = await prisma.outboxEvent.findUniqueOrThrow({
        where: { deduplicationKey: `order.created:${orders[2].id}` },
      });
      const failingWorker = new ReliableNotificationDeliveryWorker(
        prisma as never,
        enabledConfig as never,
        {
          getSiteBaseUrl: () => "http://127.0.0.1",
          renderShell: (html: string) => html,
          send: async () => ({ delivered: false, reason: "send_failed" }),
        } as never,
        policy,
      );
      await failingWorker.drainOnce(1);
      let failedAttempt = await prisma.outboxEvent.findUniqueOrThrow({
        where: { id: failingEvent.id },
      });
      assert.equal(failedAttempt.status, "PENDING");
      assert.equal(failedAttempt.attempts, 1);
      assert.equal(failedAttempt.lastErrorCode, "SMTP_SEND_FAILED");
      assert.ok(failedAttempt.availableAt.getTime() - Date.now() >= 50_000);
      assert.ok(failedAttempt.availableAt.getTime() - Date.now() <= 70_000);

      for (let attempt = 2; attempt <= 5; attempt += 1) {
        await prisma.outboxEvent.update({
          where: { id: failingEvent.id },
          data: { availableAt: new Date(0) },
        });
        await failingWorker.drainOnce(1);
      }
      failedAttempt = await prisma.outboxEvent.findUniqueOrThrow({
        where: { id: failingEvent.id },
      });
      assert.equal(failedAttempt.status, "FAILED");
      assert.equal(failedAttempt.attempts, 5);
      assert.equal(failedAttempt.lastErrorCode, "SMTP_SEND_FAILED");
      const failedNotificationId = Number(
        (failedAttempt.payload as Record<string, unknown>).notificationId,
      );
      const failedDelivery = await prisma.notificationDelivery.findUniqueOrThrow({
        where: {
          notificationId_channel: {
            notificationId: failedNotificationId,
            channel: "EMAIL",
          },
        },
      });
      assert.equal(failedDelivery.status, "FAILED");
      assert.equal(failedDelivery.attempts, 5);
      assert.equal(failedDelivery.nextAttemptAt, null);

      const operations = new ReliableNotificationOperationsService(prisma as never);
      const originalJwtCanActivate = JwtAuthGuard.prototype.canActivate;
      JwtAuthGuard.prototype.canActivate = function (context) {
        context.switchToHttp().getRequest().user = {
          id: admin.id,
          role: "ADMIN",
        };
        return true;
      };
      @Module({
        controllers: [ReliableNotificationOperationsController],
        providers: [
          { provide: ReliableNotificationOperationsService, useValue: operations },
          { provide: RolesGuard, useValue: { canActivate: () => true } },
        ],
      })
      class NotificationOperationsTestModule {}

      const operationsApp = await NestFactory.create(NotificationOperationsTestModule, {
        abortOnError: false,
        logger: ["error"],
      });
      operationsApp.setGlobalPrefix("api");
      await operationsApp.listen(0, "127.0.0.1");
      const operationsPort = (
        operationsApp.getHttpServer().address() as AddressInfo
      ).port;
      try {
        const failuresResponse = await fetch(
          `http://127.0.0.1:${operationsPort}/api/notification-operations/failures`,
        );
        assert.equal(failuresResponse.status, 200);
        const failuresBody = await failuresResponse.json() as {
          list: Array<Record<string, unknown>>;
        };
        const failureSummary = failuresBody.list.find(
          (row) => row.id === failingEvent.id,
        );
        assert.equal(failureSummary?.retryable, true);
        assert.equal("payload" in (failureSummary || {}), false);

        const retryResponse = await fetch(
          `http://127.0.0.1:${operationsPort}/api/notification-operations/failures/${failingEvent.id}/retry`,
          { method: "POST" },
        );
        assert.equal(retryResponse.status, 201);
        assert.deepEqual(await retryResponse.json(), {
          eventId: failingEvent.id,
          notificationId: failedNotificationId,
          status: "PENDING",
        });
      } finally {
        await operationsApp.close();
        JwtAuthGuard.prototype.canActivate = originalJwtCanActivate;
      }
      const retried = await prisma.outboxEvent.findUniqueOrThrow({
        where: { id: failingEvent.id },
      });
      assert.equal(retried.status, "PENDING");
      assert.equal(
        Number((retried.payload as Record<string, any>).manualRetry?.requestedBy),
        admin.id,
      );
      const recoveryWorker = new ReliableNotificationDeliveryWorker(
        prisma as never,
        enabledConfig as never,
        successMailer as never,
        policy,
      );
      await recoveryWorker.drainOnce(1);
      assert.equal(
        (await prisma.outboxEvent.findUniqueOrThrow({ where: { id: failingEvent.id } })).status,
        "PROCESSED",
      );
      assert.equal(
        (await prisma.notificationDelivery.findUniqueOrThrow({
          where: {
            notificationId_channel: {
              notificationId: failedNotificationId,
              channel: "EMAIL",
            },
          },
        })).status,
        "SENT",
      );
      const retryAudits = await prisma.operationLog.findMany({
        where: {
          userId: admin.id,
          targetId: failingEvent.id,
          module: "notifications",
        },
        orderBy: { id: "asc" },
        select: { action: true, detail: true },
      });
      assert.deepEqual(
        retryAudits.map(({ action }) => action),
        ["NOTIFICATION_RETRY_REQUESTED", "NOTIFICATION_RETRY_SUCCEEDED"],
      );
      assert.match(retryAudits[1].detail || "", /"result":"SUCCEEDED"/);

      await prisma.notificationPreference.create({
        data: {
          customerId: customer.id,
          channel: "EMAIL",
          topic: "SERVICE_ORDER_CREATED",
          enabled: false,
        },
      });
      await prisma.$transaction((tx) => service.enqueueOrderCreated(tx, {
        id: orders[3].id,
        orderNo: orders[3].orderNo,
        customerId: customer.id,
        customerEmail: customer.email,
        finalAmount: orders[3].finalAmount,
      }));
      const suppressedEvent = await prisma.outboxEvent.findUniqueOrThrow({
        where: { deduplicationKey: `order.created:${orders[3].id}` },
      });
      const suppressedNotificationId = Number(
        (suppressedEvent.payload as Record<string, unknown>).notificationId,
      );
      const suppressedDelivery = await prisma.notificationDelivery.findUniqueOrThrow({
        where: {
          notificationId_channel: {
            notificationId: suppressedNotificationId,
            channel: "EMAIL",
          },
        },
      });
      assert.equal(suppressedDelivery.status, "SUPPRESSED");
      assert.equal(suppressedDelivery.destinationHash, null);
      assert.equal(
        suppressedDelivery.lastErrorCode,
        "NOTIFICATION_PREFERENCE_DISABLED",
      );
      const sendsBeforeSuppressedDrain = successSends;
      await workers[0].drainOnce(1);
      assert.equal(successSends, sendsBeforeSuppressedDrain);
      assert.equal(
        (await prisma.outboxEvent.findUniqueOrThrow({ where: { id: suppressedEvent.id } })).status,
        "PROCESSED",
      );
    } finally {
      const notifications = await prisma.notification.findMany({
        where: { customerId: customer.id },
        select: { id: true },
      });
      const notificationIds = notifications.map(({ id }) => id);
      await prisma.outboxEvent.deleteMany({
        where: {
          OR: [
            { deduplicationKey: { startsWith: "order.created:" }, aggregateId: { in: notificationIds.map(String) } },
            { aggregateType: "Notification", aggregateId: { in: notificationIds.map(String) } },
          ],
        },
      });
      await prisma.notificationDelivery.deleteMany({
        where: { notificationId: { in: notificationIds } },
      });
      await prisma.notification.deleteMany({ where: { id: { in: notificationIds } } });
      await prisma.order.deleteMany({ where: { id: { in: orders.map(({ id }) => id) } } });
      await prisma.operationLog.deleteMany({ where: { userId: admin.id } });
      await prisma.user.delete({ where: { id: admin.id } });
      await prisma.customer.delete({ where: { id: customer.id } });
      await prisma.$disconnect();
    }
  },
);
