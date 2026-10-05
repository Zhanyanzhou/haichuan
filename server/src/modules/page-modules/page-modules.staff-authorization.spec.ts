import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { HEADERS_METADATA } from "@nestjs/common/constants";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PageModulesController } from "./page-modules.controller";
import { PageModulesService } from "./page-modules.service";

type Query = { sql?: string; values?: unknown[] };

const actor = {
  id: 7,
  role: "SUPER_ADMIN" as const,
  sessionFamilyId: "00000000-0000-4000-8000-000000000007",
};

function createAuthorizationHarness(options: {
  currentRole?: "SUPER_ADMIN" | "ADMIN" | "EDITOR" | "WAREHOUSE";
  staffActive?: boolean;
  sessionActive?: boolean;
} = {}) {
  const calls: string[] = [];
  const currentRole = options.currentRole ?? "SUPER_ADMIN";
  const prisma: any = {
    $queryRaw: async (query: Query) => {
      const sql = query.sql ?? "";
      if (sql.includes("FROM users")) {
        calls.push(`staff:${sql.includes("FOR UPDATE") ? "write" : "read"}`);
        const allowed = query.values?.includes(currentRole) ?? false;
        return options.staffActive === false || !allowed ? [] : [{ id: actor.id }];
      }
      if (sql.includes("FROM admin_refresh_sessions")) {
        calls.push(`session:${sql.includes("FOR UPDATE") ? "write" : "read"}`);
        return options.sessionActive === false ? [] : [{ id: 71 }];
      }
      calls.push("document-lock");
      return [{ id: 17 }];
    },
    pageDocument: {
      findUnique: async () => {
        calls.push("document-read");
        return null;
      },
    },
  };
  prisma.$transaction = async (callback: (transaction: any) => Promise<unknown>) => (
    callback(prisma)
  );
  return {
    calls,
    service: new PageModulesService(prisma as PrismaService),
  };
}

test("PageDocument 私有读取按 users -> refresh family -> domain 固定顺序复核", async () => {
  const harness = createAuthorizationHarness({ currentRole: "EDITOR" });

  assert.equal(await harness.service.getLocalizedPageDocument("home", "zh-CN", actor), null);
  assert.deepEqual(harness.calls, ["staff:read", "session:read", "document-read"]);
});

test("PageDocument 私有读取在 refresh family 已撤销时失败关闭且不读取正文", async () => {
  const harness = createAuthorizationHarness({ sessionActive: false });

  await assert.rejects(
    () => harness.service.getLocalizedPageDocument("home", "zh-CN", actor),
    ForbiddenException,
  );
  assert.deepEqual(harness.calls, ["staff:read", "session:read"]);
});

test("页面草稿写入在员工降为无权角色时于领域读取前失败关闭", async () => {
  const harness = createAuthorizationHarness({ currentRole: "WAREHOUSE" });

  await assert.rejects(
    () => harness.service.saveLocalizedPageDocument(
      "home",
      "zh-CN",
      { content: [], root: { props: {} }, zones: {} },
      {},
      "puck-v1",
      undefined,
      actor,
    ),
    ForbiddenException,
  );
  assert.deepEqual(harness.calls, ["staff:write"]);
});

test("页面发布只认数据库当前管理员角色，旧 SUPER_ADMIN 降为 EDITOR 后零领域读取", async () => {
  const harness = createAuthorizationHarness({ currentRole: "EDITOR" });

  await assert.rejects(
    () => harness.service.publishLocalizedPageDocument(
      "home",
      "zh-CN",
      actor,
      "2026-09-24T00:00:00.000Z",
      "a".repeat(64),
    ),
    ForbiddenException,
  );
  assert.deepEqual(harness.calls, ["staff:write"]);
});

test("PageDocument 控制器把完整员工 principal 传给私有读取与保存", async () => {
  const calls: unknown[][] = [];
  const controller = new PageModulesController({
    getLocalizedPageDocument: (...args: unknown[]) => {
      calls.push(args);
      return null;
    },
    saveLocalizedPageDocument: (...args: unknown[]) => {
      calls.push(args);
      return null;
    },
  } as unknown as PageModulesService);
  const request = { user: actor } as any;

  await controller.getAdminDocument("home", undefined, request);
  await controller.saveDocument({
    pageKey: "home",
    locale: "zh-CN",
    puckData: { content: [], root: { props: {} }, zones: {} },
  }, request);

  assert.equal(calls[0]?.[2], actor);
  assert.equal(calls[1]?.[6], actor);
});

test("PageDocument 员工 GET 禁止共享缓存并按身份区分", () => {
  for (const method of [
    "getPublishedAdminDocument",
    "getAdminDocument",
    "getDocumentRevisions",
    "getDocumentRevision",
  ] as const) {
    const headers = Reflect.getMetadata(
      HEADERS_METADATA,
      PageModulesController.prototype[method],
    ) as Array<{ name: string; value: string }>;
    assert.ok(headers.some(
      (header) => header.name === "Cache-Control"
        && header.value === "private, no-store, max-age=0",
    ));
    assert.ok(headers.some(
      (header) => header.name === "Vary"
        && header.value === "Cookie, Authorization",
    ));
  }
});
