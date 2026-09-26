import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DynamicTemplatesService } from "./dynamic-templates.service";

type Query = { sql?: string; values?: unknown[] };

function createAuthorizationHarness(options: {
  currentRole?: "SUPER_ADMIN" | "ADMIN" | "EDITOR";
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
        const requiresSuperAdmin = sql.includes("role = 'SUPER_ADMIN'");
        return options.staffActive === false || (requiresSuperAdmin && currentRole !== "SUPER_ADMIN")
          ? []
          : [{ id: 7, role: currentRole }];
      }
      if (sql.includes("FROM admin_refresh_sessions")) {
        calls.push(`session:${sql.includes("FOR UPDATE") ? "write" : "read"}`);
        return options.sessionActive === false ? [] : [{ id: 71 }];
      }
      throw new Error(`unexpected authorization query: ${sql}`);
    },
    dynamicTemplate: {
      findMany: async (args: any) => {
        calls.push(args.where?.visibility === "STAFF" ? "published" : "editable");
        return [];
      },
    },
    dynamicTemplateVersion: {
      findMany: async () => {
        calls.push("versions");
        return [];
      },
    },
  };
  prisma.$transaction = async (callback: (transaction: any) => Promise<unknown>) => (
    callback(prisma)
  );
  return {
    calls,
    service: new DynamicTemplatesService(prisma as PrismaService),
  };
}

const actor = {
  id: 7,
  role: "SUPER_ADMIN" as const,
  sessionFamilyId: "00000000-0000-4000-8000-000000000007",
};

test("母模板员工读取按 users -> refresh family -> domain 固定顺序复核", async () => {
  const harness = createAuthorizationHarness({ currentRole: "EDITOR" });

  assert.deepEqual(await harness.service.listPublished(actor), []);
  assert.deepEqual(harness.calls, ["staff:read", "session:read", "published"]);
});

test("目录使用数据库当前角色，旧 SUPER_ADMIN 快照降权后不读取私有草稿", async () => {
  const harness = createAuthorizationHarness({ currentRole: "ADMIN" });

  assert.deepEqual(await harness.service.listCatalog(actor), { items: [] });
  assert.deepEqual(harness.calls, ["staff:read", "session:read", "published"]);
});

test("SUPER_ADMIN 私有草稿读取在数据库降权后失败关闭且不触碰领域数据", async () => {
  const harness = createAuthorizationHarness({ currentRole: "ADMIN" });

  await assert.rejects(() => harness.service.listMine(actor), ForbiddenException);
  assert.deepEqual(harness.calls, ["staff:read"]);
});

test("母模板读取在 refresh family 已撤销时失败关闭且不触碰领域数据", async () => {
  const harness = createAuthorizationHarness({ sessionActive: false });

  await assert.rejects(() => harness.service.listPublished(actor), ForbiddenException);
  assert.deepEqual(harness.calls, ["staff:read", "session:read"]);
});

test("母模板写入先以 FOR UPDATE 锁定当前角色与会话，再进入定义校验", async () => {
  const harness = createAuthorizationHarness();

  await assert.rejects(
    () => harness.service.create(actor, { definition: {} }),
    BadRequestException,
  );
  assert.deepEqual(harness.calls, ["staff:write", "session:write"]);
});

test("母模板写入在 refresh family 已撤销时失败关闭", async () => {
  const harness = createAuthorizationHarness({ sessionActive: false });

  await assert.rejects(
    () => harness.service.create(actor, { definition: {} }),
    ForbiddenException,
  );
  assert.deepEqual(harness.calls, ["staff:write", "session:write"]);
});
