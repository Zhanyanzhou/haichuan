import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { AiClassifyService } from "./ai-classify.service";

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

async function assertPendingWhileLocked(operation: Promise<unknown>, message: string) {
  const state = await Promise.race([
    operation.then(
      () => "settled" as const,
      () => "settled" as const,
    ),
    new Promise<"pending">((resolve) => setTimeout(() => resolve("pending"), 150)),
  ]);
  assert.equal(state, "pending", message);
}

test(
  "真实 MySQL：AI 分类后台读写等待员工与会话锁并使用提交后的当前授权",
  {
    skip: !testDatabaseUrl
      ? "需要显式提供一次性 REAL_MYSQL_TEST_DATABASE_URL"
      : false,
  },
  async () => {
    assertIsolatedMysqlUrl(testDatabaseUrl as string);
    const prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
    const suffix = randomUUID().replace(/-/g, "").slice(0, 12);
    let userId: number | null = null;
    let refreshSessionId: number | null = null;

    try {
      const user = await prisma.user.create({
        data: {
          username: `ai_auth_${suffix}`,
          password: "isolated-test-only",
          realName: "AI 分类授权隔离测试员工",
          role: "ADMIN",
          status: "ACTIVE",
        },
      });
      userId = user.id;
      const sessionFamilyId = randomUUID();
      const refreshSession = await prisma.adminRefreshSession.create({
        data: {
          userId: user.id,
          tokenHash: `${randomUUID().replace(/-/g, "")}${randomUUID().replace(/-/g, "")}`,
          familyId: sessionFamilyId,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
      refreshSessionId = refreshSession.id;
      const actor = { id: user.id, sessionFamilyId };
      const service = new AiClassifyService(prisma as never, {} as never);

      let staleRead: ReturnType<typeof service.getRecords> | undefined;
      await prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw(
          Prisma.sql`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`,
        );
        staleRead = service.getRecords({}, actor);
        await assertPendingWhileLocked(
          staleRead,
          "AI 分类后台读取必须等待员工行锁，不能越过并发降权",
        );
        await transaction.user.update({
          where: { id: user.id },
          data: { role: "CUSTOMER_SERVICE" },
        });
      });
      assert.ok(staleRead);
      await assert.rejects(staleRead, ForbiddenException);

      await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
      const recordsBefore = await prisma.aIClassifyRecord.count();
      let staleWrite: ReturnType<typeof service.confirmClassification> | undefined;
      await prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw(
          Prisma.sql`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`,
        );
        await transaction.$queryRaw(
          Prisma.sql`SELECT id FROM admin_refresh_sessions WHERE id = ${refreshSession.id} FOR UPDATE`,
        );
        staleWrite = service.confirmClassification(
          999_991,
          { status: "rejected" },
          actor,
        );
        await assertPendingWhileLocked(
          staleWrite,
          "AI 分类后台写入必须等待会话族行锁，不能越过并发登出",
        );
        await transaction.adminRefreshSession.update({
          where: { id: refreshSession.id },
          data: { revokedAt: new Date() },
        });
      });
      assert.ok(staleWrite);
      await assert.rejects(staleWrite, ForbiddenException);
      assert.equal(await prisma.aIClassifyRecord.count(), recordsBefore);
    } finally {
      if (refreshSessionId !== null) {
        await prisma.adminRefreshSession.deleteMany({ where: { id: refreshSessionId } });
      }
      if (userId !== null) await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.$disconnect();
    }
  },
);
