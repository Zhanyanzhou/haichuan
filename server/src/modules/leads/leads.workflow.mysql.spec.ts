import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { AddressInfo } from "node:net";
import { Module, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { PrismaClient } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { RolesGuard } from "../../common/guards/roles.guard";
import { OutboxService } from "../../common/outbox/outbox.service";
import { ReliableNotificationIntentService } from "../../common/notifications/reliable-notification-intent.service";
import { ReliableNotificationDeliveryWorker } from "../../common/notifications/reliable-notification-delivery.worker";
import { NotificationDeliveryPolicyService } from "../../common/notifications/notification-delivery-policy.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { JwtStrategy } from "../auth/jwt.strategy";
import { InquiriesService } from "../inquiries/inquiries.service";
import { SelectionInquiryService } from "../selection-inquiry/selection-inquiry.service";
import { LeadsController } from "./leads.controller";
import { LeadsService } from "./leads.service";

const testDatabaseUrl = process.env.REAL_MYSQL_TEST_DATABASE_URL?.trim();

function assertIsolatedMysqlUrl(rawUrl: string) {
  const parsed = new URL(rawUrl);
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (
    !["mysql:", "mysqls:"].includes(parsed.protocol)
    || !databaseName
    || !/(^|[_-])(test|tests|e2e|isolated|ci)([_-]|$)/i.test(databaseName)
  ) {
    throw new Error(
      "REAL_MYSQL_TEST_DATABASE_URL 必须指向名称含 test/e2e/isolated/ci 的专用 MySQL 数据库",
    );
  }
}

test(
  "真实 MySQL：咨询幂等、领取 CAS、状态/跟进/回复、失败重试与审计连续",
  { skip: !testDatabaseUrl ? "需要显式提供一次性 REAL_MYSQL_TEST_DATABASE_URL" : false },
  async () => {
    assertIsolatedMysqlUrl(testDatabaseUrl as string);
    const prisma = new PrismaClient({
      datasources: { db: { url: testDatabaseUrl } },
    });
    const suffix = randomUUID().replace(/-/g, "").slice(0, 12);
    const phone = `19${String(Date.now()).slice(-9)}`;
    const usernames = [`lead_cs_${suffix}`, `lead_admin_${suffix}`, `lead_warehouse_${suffix}`];
    const idempotencyKey = `lead-real-submit-${suffix}`;
    const retryDeduplicationKey = `lead-real-retry-${suffix}`;
    let customerId: number | null = null;
    let leadId: number | null = null;
    let inquiryId: number | null = null;
    let selectionInquiryId: number | null = null;
    let selectionLeadId: number | null = null;
    let productId: number | null = null;
    let categoryId: number | null = null;
    let notificationIds: number[] = [];
    let closeApp: (() => Promise<void>) | null = null;

    try {
      const [customerService, admin, warehouse] = await Promise.all([
        prisma.user.create({
          data: {
            username: usernames[0],
            password: "isolated-test-only",
            realName: "隔离测试客服",
            role: "CUSTOMER_SERVICE",
          },
        }),
        prisma.user.create({
          data: {
            username: usernames[1],
            password: "isolated-test-only",
            realName: "隔离测试管理员",
            role: "ADMIN",
          },
        }),
        prisma.user.create({
          data: {
            username: usernames[2],
            password: "isolated-test-only",
            realName: "隔离测试仓库员工",
            role: "WAREHOUSE",
          },
        }),
      ]);
      const customer = await prisma.customer.create({
        data: {
          phone,
          name: "隔离测试客户",
          email: `lead-${suffix}@example.invalid`,
        },
      });
      customerId = customer.id;

      const outbox = new OutboxService();
      const deliveryPolicy = new NotificationDeliveryPolicyService();
      const reliableNotifications = new ReliableNotificationIntentService(outbox, deliveryPolicy);
      const leadsService = new LeadsService(
        prisma as never,
        outbox,
        reliableNotifications,
      );
      const inquiriesService = new InquiriesService(
        prisma as never,
        {} as never,
        leadsService,
      );
      const category = await prisma.category.create({
        data: {
          name: `隔离测试分类-${suffix}`,
          slug: `lead-test-category-${suffix}`,
        },
      });
      categoryId = category.id;
      const product = await prisma.product.create({
        data: {
          code: `LEAD-TEST-${suffix}`,
          name: `隔离测试作品-${suffix}`,
          categoryId: category.id,
        },
      });
      productId = product.id;
      const selectionInquiryService = new SelectionInquiryService(
        prisma as never,
        {
          resolveVisibleProductSnapshots: async (ids: number[]) => new Map(
            ids.map((id) => [id, {
              id,
              code: product.code,
              name: product.name,
              mediaUrl: null,
            }]),
          ),
        } as never,
        leadsService,
      );
      const submission = {
        customerName: customer.name as string,
        customerPhone: customer.phone,
        customerEmail: customer.email as string,
        message: "真实隔离库咨询旅程",
        consultationType: "预约鉴赏",
        preferredContact: "电子邮件",
        privacyConsent: true,
        idempotencyKey,
        customer: {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
        },
      };

      const [firstSubmission, replayedSubmission] = await Promise.all([
        inquiriesService.create(submission as never),
        inquiriesService.create(submission as never),
      ]);
      assert.equal(replayedSubmission.id, firstSubmission.id);
      inquiryId = firstSubmission.id;

      const lead = await prisma.lead.findUniqueOrThrow({
        where: { inquiryId },
      });
      leadId = lead.id;
      assert.equal(await prisma.inquiry.count({ where: { id: inquiryId } }), 1);
      assert.equal(await prisma.lead.count({ where: { inquiryId } }), 1);
      const persistedInquiry = await prisma.inquiry.findUniqueOrThrow({
        where: { id: inquiryId },
      });
      assert.equal(persistedInquiry.customerEmail, customer.email);
      assert.equal(persistedInquiry.preferredContact, "电子邮件");
      assert.equal(lead.email, customer.email);
      assert.equal(
        await prisma.consentRecord.count({ where: { source: `inquiry:${inquiryId}` } }),
        1,
      );
      assert.equal(
        await prisma.leadActivity.count({ where: { leadId, type: "CREATED" } }),
        1,
      );

      const selectionSubmission = {
        customerName: customer.name as string,
        phone: customer.phone,
        email: customer.email as string,
        message: "真实隔离库选款咨询旅程",
        items: [{ productId: product.id, productSkuSnapshot: "隔离测试规格" }],
        privacyConsent: true,
        idempotencyKey: `lead-real-selection-${suffix}`,
        customer: {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
        },
      };
      const [firstSelection, replayedSelection] = await Promise.all([
        selectionInquiryService.create(selectionSubmission as never),
        selectionInquiryService.create(selectionSubmission as never),
      ]);
      assert.equal(replayedSelection.id, firstSelection.id);
      selectionInquiryId = firstSelection.id;
      const selectionLead = await prisma.lead.findUniqueOrThrow({
        where: { selectionInquiryId },
      });
      selectionLeadId = selectionLead.id;
      assert.equal(
        await prisma.selectionInquiry.count({ where: { id: selectionInquiryId } }),
        1,
      );
      assert.equal(
        await prisma.lead.count({ where: { selectionInquiryId } }),
        1,
      );
      assert.equal(
        await prisma.consentRecord.count({
          where: { source: `selection-inquiry:${selectionInquiryId}` },
        }),
        1,
      );

      const jwtSecret = `lead-workflow-${suffix}-${randomUUID()}`;
      @Module({
        imports: [
          PassportModule.register({ defaultStrategy: "jwt" }),
          JwtModule.register({ secret: jwtSecret }),
        ],
        controllers: [LeadsController],
        providers: [
          { provide: PrismaService, useValue: prisma },
          {
            provide: ConfigService,
            useValue: {
              get: (name: string) => name === "JWT_SECRET" ? jwtSecret : "test",
            },
          },
          { provide: LeadsService, useValue: leadsService },
          JwtStrategy,
          JwtAuthGuard,
          RolesGuard,
        ],
      })
      class LeadWorkflowTestModule {}
      const app = await NestFactory.create(LeadWorkflowTestModule, {
        abortOnError: false,
        logger: ["error"],
      });
      app.setGlobalPrefix("api");
      app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
      await app.listen(0, "127.0.0.1");
      closeApp = () => app.close();
      const port = (app.getHttpServer().address() as AddressInfo).port;
      const jwt = new JwtService({ secret: jwtSecret });
      const accessToken = (userId: number) => jwt.sign({
        sub: userId,
        type: "admin",
        tokenUse: "access",
      });
      const callLeadApi = async (userId: number, path: string, init: RequestInit = {}) => {
        const headers = new Headers(init.headers);
        headers.set("Authorization", `Bearer ${accessToken(userId)}`);
        if (init.body) headers.set("Content-Type", "application/json");
        const response = await fetch(
          `http://127.0.0.1:${port}/api/leads${path}`,
          { ...init, headers },
        );
        const body = await response.json().catch(() => null);
        return { response, body };
      };
      const claims = await Promise.all([
        callLeadApi(customerService.id, `/inquiry/${leadId}/claim`, { method: "POST" }),
        callLeadApi(admin.id, `/inquiry/${leadId}/claim`, { method: "POST" }),
      ]);
      assert.deepEqual(
        claims.map(({ response }) => response.status).sort(),
        [201, 409],
      );
      const claimed = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
      const actorId = claimed.assignedTo as number;
      assert.ok([customerService.id, admin.id].includes(actorId));
      assert.equal(
        await prisma.leadActivity.count({
          where: {
            leadId,
            type: "ASSIGNED",
          },
        }),
        1,
      );

      const detail = await callLeadApi(actorId, `/inquiry/${leadId}`);
      assert.equal(detail.response.status, 200);
      assert.equal(detail.body.id, leadId);
      assert.equal(detail.body.email, customer.email);
      assert.equal(detail.body.preferredContact, "电子邮件");

      await leadsService.updateLead("inquiry", leadId, { status: "CONTACTED" }, actorId);
      const followUpWrite = await callLeadApi(actorId, `/inquiry/${leadId}/follow-up`, {
        method: "POST",
        body: JSON.stringify({
          content: "已电话确认客户需求",
          contactMethod: "phone",
          nextFollowUpAt: "2026-09-20T03:00:00.000Z",
        }),
      });
      assert.equal(followUpWrite.response.status, 201);
      const followUpDetail = await callLeadApi(actorId, `/inquiry/${leadId}`);
      assert.equal(followUpDetail.response.status, 200);
      assert.equal(followUpDetail.body.nextFollowUpAt, "2026-09-20T03:00:00.000Z");
      assert.equal(followUpDetail.body.followUps[0].type, "FOLLOW_UP");
      assert.equal(followUpDetail.body.followUps[0].contactMethod, "phone");
      assert.equal(
        followUpDetail.body.followUps[0].nextFollowUpAt,
        "2026-09-20T03:00:00.000Z",
      );
      const beforeReply = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
      const reply = await leadsService.replyToLead(
        "inquiry",
        leadId,
        {
          reply: "已为您安排后续鉴赏服务。",
          expectedUpdatedAt: beforeReply.updatedAt.toISOString(),
        },
        `lead-real-reply-${suffix}`,
        actorId,
      );
      const replayedReply = await leadsService.replyToLead(
        "inquiry",
        leadId,
        {
          reply: "已为您安排后续鉴赏服务。",
          expectedUpdatedAt: beforeReply.updatedAt.toISOString(),
        },
        `lead-real-reply-${suffix}`,
        actorId,
      );
      assert.deepEqual(replayedReply, reply);

      const replyActivity = await prisma.leadActivity.findFirstOrThrow({
        where: { leadId, type: "REPLY" },
        orderBy: { id: "desc" },
      });
      const failedEvent = await prisma.outboxEvent.create({
        data: {
          aggregateType: "Lead",
          aggregateId: String(leadId),
          eventType: "lead.reply.notification.requested",
          payload: { leadId, activityId: replyActivity.id },
          deduplicationKey: retryDeduplicationKey,
          status: "FAILED",
          attempts: 5,
          lastErrorCode: "SMTP_SEND_FAILED",
        },
      });
      const forbiddenRetry = await callLeadApi(
        warehouse.id,
        `/notification-failures/${failedEvent.id}/retry`,
        { method: "POST" },
      );
      assert.equal(forbiddenRetry.response.status, 403);
      const concurrentRetries = await Promise.all([
        callLeadApi(actorId, `/notification-failures/${failedEvent.id}/retry`, { method: "POST" }),
        callLeadApi(actorId, `/notification-failures/${failedEvent.id}/retry`, { method: "POST" }),
      ]);
      assert.deepEqual(
        concurrentRetries.map(({ response }) => response.status).sort(),
        [201, 409],
      );
      const retried = await prisma.outboxEvent.findUniqueOrThrow({
        where: { id: failedEvent.id },
      });
      assert.equal(retried.status, "PENDING");
      assert.equal(retried.lastErrorCode, null);
      assert.equal(
        (retried.payload as Record<string, any>).manualRetry.requestedBy,
        actorId,
      );

      let externalSends = 0;
      const notificationWorker = new ReliableNotificationDeliveryWorker(
        prisma as never,
        { get: () => "true" } as never,
        {
          getSiteBaseUrl: () => "http://127.0.0.1",
          renderShell: (html: string) => html,
          send: async () => {
            externalSends += 1;
            return { delivered: true };
          },
        } as never,
        deliveryPolicy,
      );
      await notificationWorker.drainOnce(10);
      assert.equal(externalSends, 1);
      assert.equal(
        (await prisma.outboxEvent.findUniqueOrThrow({ where: { id: failedEvent.id } })).status,
        "PROCESSED",
      );
      const retryOutcomeAudits = await prisma.leadActivity.findMany({
        where: { leadId, createdBy: actorId, type: "NOTE" },
        select: { metadata: true },
      });
      assert.equal(
        retryOutcomeAudits.filter((entry) =>
          (entry.metadata as Record<string, unknown> | null)?.action
            === "LEAD_REPLY_NOTIFICATION_RETRY_SUCCEEDED"
        ).length,
        1,
      );

      await leadsService.updateLead(
        "inquiry",
        leadId,
        {
          status: "FOLLOWING",
          nextFollowUpAt: "2026-09-21T03:00:00.000Z",
        },
        actorId,
      );
      await leadsService.updateLead(
        "inquiry",
        leadId,
        { status: "COMPLETED", closureReason: "本次咨询服务已完成" },
        actorId,
      );

      const finalLead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
      assert.equal(finalLead.status, "COMPLETED");
      assert.equal(finalLead.closureReason, "本次咨询服务已完成");
      const activities = await prisma.leadActivity.findMany({
        where: { leadId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      for (const expectedType of [
        "CREATED",
        "ASSIGNED",
        "STATUS_CHANGED",
        "FOLLOW_UP",
        "REPLY",
        "NOTE",
      ] as const) {
        assert.ok(activities.some((activity) => activity.type === expectedType));
      }
      assert.ok(
        activities
          .filter((activity) => activity.type !== "CREATED")
          .every((activity) => activity.createdBy === actorId),
      );
      assert.ok(activities.some((activity) => {
        const metadata = activity.metadata as Record<string, unknown> | null;
        return metadata?.action === "LEAD_REPLY_NOTIFICATION_RETRY_REQUESTED";
      }));
      notificationIds = (await prisma.notification.findMany({
        where: { customerId: customer.id },
        select: { id: true },
      })).map((notification) => notification.id);
      assert.equal(notificationIds.length, 1);
      assert.equal(
        await prisma.notificationDelivery.count({
          where: { notificationId: { in: notificationIds }, channel: "IN_APP" },
        }),
        1,
      );
    } finally {
      if (closeApp) await closeApp();
      if (customerId) {
        notificationIds = (await prisma.notification.findMany({
          where: { customerId },
          select: { id: true },
        })).map((notification) => notification.id);
      }
      if (leadId) {
        await prisma.outboxEvent.deleteMany({
          where: {
            OR: [
              { aggregateType: "Lead", aggregateId: String(leadId) },
              { deduplicationKey: { contains: suffix } },
            ],
          },
        });
      }
      if (notificationIds.length > 0) {
        await prisma.outboxEvent.deleteMany({
          where: {
            aggregateType: "Notification",
            aggregateId: { in: notificationIds.map(String) },
          },
        });
        await prisma.notificationDelivery.deleteMany({
          where: { notificationId: { in: notificationIds } },
        });
        await prisma.notification.deleteMany({ where: { id: { in: notificationIds } } });
      }
      if (leadId && inquiryId) {
        await prisma.leadFollowUp.deleteMany({
          where: { leadType: "inquiry", leadId: inquiryId },
        });
        await prisma.lead.deleteMany({ where: { id: leadId } });
      }
      if (selectionLeadId && selectionInquiryId) {
        await prisma.leadFollowUp.deleteMany({
          where: { leadType: "selection", leadId: selectionInquiryId },
        });
        await prisma.lead.deleteMany({ where: { id: selectionLeadId } });
      }
      if (inquiryId) {
        await prisma.consentRecord.deleteMany({
          where: { source: `inquiry:${inquiryId}` },
        });
        await prisma.inquiry.deleteMany({ where: { id: inquiryId } });
      }
      if (selectionInquiryId) {
        await prisma.consentRecord.deleteMany({
          where: { source: `selection-inquiry:${selectionInquiryId}` },
        });
        await prisma.selectionInquiry.deleteMany({ where: { id: selectionInquiryId } });
      }
      if (customerId) {
        await prisma.customer.deleteMany({ where: { id: customerId } });
      }
      if (productId) await prisma.product.deleteMany({ where: { id: productId } });
      if (categoryId) await prisma.category.deleteMany({ where: { id: categoryId } });
      await prisma.user.deleteMany({ where: { username: { in: usernames } } });
      await prisma.$disconnect();
    }
  },
);
