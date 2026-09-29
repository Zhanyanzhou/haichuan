import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { LeadsService } from "../leads/leads.service";
import { SelectionInquiryService } from "./selection-inquiry.service";
import { PRIVACY_CONSENT_CONTENT_HASH } from "../../common/privacy/privacy-consent";

const testDatabaseUrl = process.env.REAL_MYSQL_TEST_DATABASE_URL?.trim();

function assertIsolatedMysqlUrl(rawUrl: string) {
  const parsed = new URL(rawUrl);
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (
    !["mysql:", "mysqls:"].includes(parsed.protocol) ||
    !databaseName ||
    !/(^|[_-])(test|tests|e2e|isolated|ci)([_-]|$)/i.test(databaseName)
  ) {
    throw new Error(
      "REAL_MYSQL_TEST_DATABASE_URL 必须指向名称含 test/e2e/isolated/ci 的专用 MySQL 数据库",
    );
  }
}

test(
  "真实 MySQL：同键并发和作品状态变化复用原子结果，异指纹冲突且不同键独立",
  { skip: !testDatabaseUrl ? "需要显式提供一次性 REAL_MYSQL_TEST_DATABASE_URL" : false },
  async () => {
    assertIsolatedMysqlUrl(testDatabaseUrl as string);
    const prisma = new PrismaClient({
      datasources: { db: { url: testDatabaseUrl } },
    });
    const suffix = randomUUID().replace(/-/g, "").slice(0, 12);
    const phone = `18${String(Date.now()).slice(-9)}`;
    let categoryId: number | null = null;
    let productId: number | null = null;

    try {
      const category = await prisma.category.create({
        data: {
          name: `选款并发测试分类-${suffix}`,
          slug: `selection-idem-test-${suffix}`,
        },
      });
      categoryId = category.id;
      const product = await prisma.product.create({
        data: {
          code: `SELECTION-IDEM-${suffix}`,
          name: `选款并发测试作品-${suffix}`,
          categoryId: category.id,
        },
      });
      productId = product.id;
      let productVisible = true;
      let visibilityCalls = 0;
      const service = new SelectionInquiryService(
        prisma as never,
        {
          resolveVisibleProductSnapshots: async (ids: number[]) => {
            visibilityCalls += 1;
            if (!productVisible) return new Map();
            return new Map(ids.map((id) => [id, {
              id,
              code: product.code,
              name: product.name,
              mediaUrl: null,
            }]));
          },
        } as never,
        {} as LeadsService,
      );
      const submission = {
        customerName: "选款并发测试客户",
        phone,
        email: `selection-${suffix}@example.invalid`,
        message: "真实 MySQL 同键并发提交",
        items: [{ productId: product.id, productSkuSnapshot: "隔离测试规格" }],
        privacyConsent: true,
        privacyConsentVersion: "privacy-v2",
        privacyConsentContentHash: PRIVACY_CONSENT_CONTENT_HASH,
        idempotencyKey: `selection-idem-same-${suffix}`,
      };

      const [first, replayed] = await Promise.all([
        service.create(submission),
        service.create(submission),
      ]);
      assert.equal(replayed.id, first.id);

      const sameKeyInquiryCount = await prisma.selectionInquiry.count({
        where: { phone },
      });
      assert.equal(sameKeyInquiryCount, 1);
      const lead = await prisma.lead.findUniqueOrThrow({
        where: { selectionInquiryId: first.id },
      });
      assert.equal(
        await prisma.lead.count({ where: { selectionInquiryId: first.id } }),
        1,
      );
      assert.equal(
        await prisma.leadActivity.count({
          where: { leadId: lead.id, type: "CREATED" },
        }),
        1,
      );
      assert.equal(
        await prisma.consentRecord.count({
          where: { source: `selection-inquiry:${first.id}` },
        }),
        1,
      );

      productVisible = false;
      const visibilityCallsBeforeReplay = visibilityCalls;
      const recoveredAfterUnavailable = await service.create(submission);
      assert.deepEqual(recoveredAfterUnavailable, first);
      assert.equal(
        visibilityCalls,
        visibilityCallsBeforeReplay,
        "已落库的同键同指纹恢复不得被作品后续状态阻断",
      );
      await assert.rejects(
        service.create({ ...submission, message: "同键的不同提交内容" }),
        ConflictException,
      );
      assert.equal(
        visibilityCalls,
        visibilityCallsBeforeReplay,
        "同键异指纹应在当前作品可见性查询前返回 409",
      );

      productVisible = true;
      const second = await service.create({
        ...submission,
        idempotencyKey: `selection-idem-second-${suffix}`,
      });
      const third = await service.create({
        ...submission,
        idempotencyKey: `selection-idem-third-${suffix}`,
      });
      assert.equal(new Set([first.id, second.id, third.id]).size, 3);
      assert.equal(await prisma.selectionInquiry.count({ where: { phone } }), 3);
      assert.equal(
        await prisma.lead.count({
          where: { selectionInquiry: { phone } },
        }),
        3,
      );
    } finally {
      const inquiries = await prisma.selectionInquiry.findMany({
        where: { phone },
        select: { id: true },
      });
      const inquiryIds = inquiries.map((inquiry) => inquiry.id);
      const leads = inquiryIds.length > 0
        ? await prisma.lead.findMany({
          where: { selectionInquiryId: { in: inquiryIds } },
          select: { id: true },
        })
        : [];
      if (leads.length > 0) {
        await prisma.lead.deleteMany({
          where: { id: { in: leads.map((lead) => lead.id) } },
        });
      }
      if (inquiryIds.length > 0) {
        await prisma.consentRecord.deleteMany({
          where: {
            source: { in: inquiryIds.map((id) => `selection-inquiry:${id}`) },
          },
        });
        await prisma.selectionInquiry.deleteMany({ where: { id: { in: inquiryIds } } });
      }
      if (productId) await prisma.product.deleteMany({ where: { id: productId } });
      if (categoryId) await prisma.category.deleteMany({ where: { id: categoryId } });
      await prisma.$disconnect();
    }
  },
);

test(
  "真实 MySQL：选款咨询幂等赢家读取等待客户锁并在注销后失败关闭",
  { skip: !testDatabaseUrl ? "需要显式提供一次性 REAL_MYSQL_TEST_DATABASE_URL" : false },
  async () => {
    assertIsolatedMysqlUrl(testDatabaseUrl as string);
    const prisma = new PrismaClient({
      datasources: { db: { url: testDatabaseUrl } },
    });
    const control = new PrismaClient({
      datasources: { db: { url: testDatabaseUrl } },
    });
    const suffix = randomUUID().replace(/-/g, "").slice(0, 12);
    const phone = `17${String(Date.now()).slice(-9)}`;
    let categoryId: number | null = null;
    let productId: number | null = null;
    let customerId: number | null = null;
    let selectionInquiryId: number | null = null;

    try {
      const category = await prisma.category.create({
        data: {
          name: `选款注销竞态分类-${suffix}`,
          slug: `selection-close-test-${suffix}`,
        },
      });
      categoryId = category.id;
      const product = await prisma.product.create({
        data: {
          code: `SELECTION-CLOSE-${suffix}`,
          name: `选款注销竞态作品-${suffix}`,
          categoryId: category.id,
        },
      });
      productId = product.id;
      const customer = await prisma.customer.create({
        data: {
          phone,
          name: "选款注销竞态客户",
        },
      });
      customerId = customer.id;
      const principal = {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        authVersion: customer.authVersion,
        accountType: customer.accountType,
        partnerStatus: customer.partnerStatus,
      };
      const service = new SelectionInquiryService(
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
        {} as LeadsService,
      );
      const submission = {
        customer: principal,
        message: "真实 MySQL 注销竞态选款提交",
        items: [{ productId: product.id }],
        privacyConsent: true,
        privacyConsentVersion: "privacy-v2",
        privacyConsentContentHash: PRIVACY_CONSENT_CONTENT_HASH,
        idempotencyKey: `selection-close-${suffix}`,
      };
      const first = await service.create(submission);
      selectionInquiryId = first.id;

      type Outcome =
        | { status: "fulfilled"; value: Awaited<ReturnType<typeof service.create>> }
        | { status: "rejected"; reason: unknown };
      let settled = false;
      const pendingOutcomes: Array<Promise<Outcome>> = [];
      await control.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM customers WHERE id = ${customer.id} FOR UPDATE`;
        pendingOutcomes.push(service.create(submission).then(
          (value) => {
            settled = true;
            return { status: "fulfilled", value } as const;
          },
          (reason: unknown) => {
            settled = true;
            return { status: "rejected", reason } as const;
          },
        ));
        await new Promise((resolve) => setTimeout(resolve, 100));
        assert.equal(settled, false, "客户行锁释放前幂等赢家读取必须保持等待");
        await tx.customer.update({
          where: { id: customer.id },
          data: { status: "DISABLED", authVersion: { increment: 1 } },
        });
      });
      assert.equal(pendingOutcomes.length, 1);
      const outcome = await pendingOutcomes[0];
      assert.equal(outcome.status, "rejected");
      if (outcome.status === "rejected") {
        assert.ok(outcome.reason instanceof UnauthorizedException);
      }
      assert.equal(
        await prisma.selectionInquiry.count({ where: { customerId: customer.id } }),
        1,
      );
      assert.equal(
        await prisma.consentRecord.count({
          where: { source: `selection-inquiry:${first.id}` },
        }),
        1,
      );
    } finally {
      if (selectionInquiryId) {
        await prisma.lead.deleteMany({ where: { selectionInquiryId } });
        await prisma.consentRecord.deleteMany({
          where: { source: `selection-inquiry:${selectionInquiryId}` },
        });
        await prisma.selectionInquiry.deleteMany({
          where: { id: selectionInquiryId },
        });
      }
      if (customerId) {
        await prisma.customer.deleteMany({ where: { id: customerId } });
      }
      if (productId) await prisma.product.deleteMany({ where: { id: productId } });
      if (categoryId) await prisma.category.deleteMany({ where: { id: categoryId } });
      await Promise.all([prisma.$disconnect(), control.$disconnect()]);
    }
  },
);

test(
  "真实 MySQL：合作资格暂停与新选款提交按客户锁串行并使用最新资格",
  { skip: !testDatabaseUrl ? "需要显式提供一次性 REAL_MYSQL_TEST_DATABASE_URL" : false },
  async () => {
    assertIsolatedMysqlUrl(testDatabaseUrl as string);
    const prisma = new PrismaClient({
      datasources: { db: { url: testDatabaseUrl } },
    });
    const control = new PrismaClient({
      datasources: { db: { url: testDatabaseUrl } },
    });
    const suffix = randomUUID().replace(/-/g, "").slice(0, 12);
    const phone = `16${String(Date.now()).slice(-9)}`;
    let customerId: number | null = null;

    try {
      const customer = await prisma.customer.create({
        data: {
          phone,
          name: "合作资格竞态客户",
          accountType: "PARTNER",
          partnerStatus: "APPROVED",
        },
      });
      customerId = customer.id;
      const principal = {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        authVersion: customer.authVersion,
        accountType: customer.accountType,
        partnerStatus: customer.partnerStatus,
      };
      let visibilityStatus: string | null | undefined;
      const service = new SelectionInquiryService(
        prisma as never,
        {
          resolveVisibleProductSnapshots: async (
            ids: number[],
            access: { partnerStatus?: string | null } | undefined,
          ) => {
            visibilityStatus = access?.partnerStatus;
            return access?.partnerStatus === "APPROVED"
              ? new Map(ids.map((id) => [id, {
                  name: `合作作品-${id}`,
                  mediaUrl: null,
                }]))
              : new Map();
          },
        } as never,
        {} as LeadsService,
      );
      const submission = {
        customer: principal,
        message: "合作资格变化期间的新选款提交",
        items: [{ productId: 900001 }],
        privacyConsent: true,
        privacyConsentVersion: "privacy-v2",
        privacyConsentContentHash: PRIVACY_CONSENT_CONTENT_HASH,
        idempotencyKey: `selection-partner-race-${suffix}`,
      };

      let settled = false;
      let pending: Promise<unknown> | undefined;
      await control.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM customers WHERE id = ${customer.id} FOR UPDATE`;
        pending = service.create(submission).then(
          (value) => {
            settled = true;
            return value;
          },
          (error: unknown) => {
            settled = true;
            throw error;
          },
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
        assert.equal(settled, false, "合作资格行锁释放前新提交必须保持等待");
        await tx.customer.update({
          where: { id: customer.id },
          data: { partnerStatus: "SUSPENDED" },
        });
      });

      await assert.rejects(
        pending as Promise<unknown>,
        (error: unknown) => error instanceof BadRequestException,
      );
      assert.equal(visibilityStatus, "SUSPENDED");
      assert.equal(
        await prisma.selectionInquiry.count({ where: { customerId: customer.id } }),
        0,
      );
    } finally {
      if (customerId) {
        await prisma.customer.deleteMany({ where: { id: customerId } });
      }
      await Promise.all([prisma.$disconnect(), control.$disconnect()]);
    }
  },
);
