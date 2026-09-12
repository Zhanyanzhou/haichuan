import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { LeadsService } from "../leads/leads.service";
import { SelectionInquiryService } from "./selection-inquiry.service";

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
  "真实 MySQL：同键并发选款咨询复用一套原子结果，不同键保持独立",
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
      const service = new SelectionInquiryService(
        prisma as never,
        {
          resolveVisibleProductSnapshots: async (ids: number[]) =>
            new Map(ids.map((id) => [id, {
              id,
              code: product.code,
              name: product.name,
              mediaUrl: null,
            }])),
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
