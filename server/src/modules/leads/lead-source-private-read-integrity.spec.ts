import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { InquiriesController } from "../inquiries/inquiries.controller";
import { InquiriesService } from "../inquiries/inquiries.service";
import { SelectionInquiryController } from "../selection-inquiry/selection-inquiry.controller";
import { SelectionInquiryService } from "../selection-inquiry/selection-inquiry.service";

const FAMILY_ID = "00000000-0000-4000-8000-000000000001";
const ACTOR = { id: 7, sessionFamilyId: FAMILY_ID };

function revokedSessionPrisma(domainName: string) {
  const operations: string[] = [];
  const prisma = {
    $queryRaw: async (query: { sql?: string }) => {
      const operation = query.sql?.includes("admin_refresh_sessions")
        ? "session-lock"
        : "actor-lock";
      operations.push(operation);
      return operation === "actor-lock" ? [{ id: 7 }] : [];
    },
    inquiry: {
      findMany: async () => {
        operations.push(domainName);
        return [];
      },
      count: async () => 0,
    },
    selectionInquiry: {
      findMany: async () => {
        operations.push(domainName);
        return [];
      },
      count: async () => 0,
      findUnique: async () => {
        operations.push(domainName);
        return null;
      },
    },
    $transaction: async (callback: (transaction: unknown) => unknown) =>
      callback(prisma),
  };
  return { prisma, operations };
}

test("旧 Inquiry 私有列表在会话族吊销后、领域读取前失败关闭", async () => {
  const harness = revokedSessionPrisma("inquiry-list");
  const service = new InquiriesService(
    harness.prisma as never,
    {} as never,
    {} as never,
  );

  await assert.rejects(service.findAll({}, ACTOR), ForbiddenException);

  assert.deepEqual(harness.operations, ["actor-lock", "session-lock"]);
});

test("旧 SelectionInquiry 私有列表与详情在会话族吊销后、领域读取前失败关闭", async () => {
  const listHarness = revokedSessionPrisma("selection-list");
  const listService = new SelectionInquiryService(
    listHarness.prisma as never,
    {} as never,
    {} as never,
  );
  await assert.rejects(listService.findAll({}, ACTOR), ForbiddenException);
  assert.deepEqual(listHarness.operations, ["actor-lock", "session-lock"]);

  const detailHarness = revokedSessionPrisma("selection-detail");
  const detailService = new SelectionInquiryService(
    detailHarness.prisma as never,
    {} as never,
    {} as never,
  );
  await assert.rejects(detailService.findOne(18, ACTOR), ForbiddenException);
  assert.deepEqual(detailHarness.operations, ["actor-lock", "session-lock"]);
});

test("旧来源读取控制器透传员工会话族并禁止私有响应缓存", async () => {
  const inquiryCalls: unknown[][] = [];
  const inquiryController = new InquiriesController({
    findAll: async (...args: unknown[]) => inquiryCalls.push(args),
  } as never);
  const selectionCalls: Array<{ method: string; args: unknown[] }> = [];
  const selectionController = new SelectionInquiryController({
    findAll: async (...args: unknown[]) =>
      selectionCalls.push({ method: "findAll", args }),
    findOne: async (...args: unknown[]) =>
      selectionCalls.push({ method: "findOne", args }),
  } as never);
  const headers = new Map<string, string>();
  const response = {
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
    },
  } as never;

  await inquiryController.findAll({ page: 2, pageSize: 20 }, ACTOR, response);
  await selectionController.findAll({ page: 1, pageSize: 10 }, ACTOR, response);
  await selectionController.findOne(18, ACTOR, response);

  assert.deepEqual(inquiryCalls, [[{ page: 2, pageSize: 20 }, ACTOR]]);
  assert.deepEqual(selectionCalls, [
    {
      method: "findAll",
      args: [{ status: undefined, keyword: undefined, page: 1, pageSize: 10 }, ACTOR],
    },
    { method: "findOne", args: [18, ACTOR] },
  ]);
  assert.equal(headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(headers.get("vary"), "Cookie, Authorization");
});
