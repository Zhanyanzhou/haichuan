import assert from "node:assert/strict";
import test from "node:test";
import {
  createPublishedRevisionTargetAuditConfig,
  evaluatePublishedRevisionApplyGrants,
  evaluatePublishedRevisionReadOnlyGrants,
  planPublishedRevisionBackfill,
  runPublishedRevisionBackfill,
  runPublishedRevisionTargetAudit,
} from "./page-published-revision-backfill";
import type { PrismaService } from "../common/prisma/prisma.service";

function createDatabase() {
  const updates: unknown[] = [];
  const documents = [
    {
      id: 1,
      pageKey: "home",
      publishedRevisionId: null,
      revisions: [{ id: 39, documentId: 1, version: 39 }],
    },
    {
      id: 2,
      pageKey: "contact",
      publishedRevisionId: null,
      revisions: [],
    },
  ];
  const tx = {
    pageDocumentRevision: {
      findFirst: async () => ({ id: 39, documentId: 1, version: 39 }),
    },
    pageDocument: {
      updateMany: async (args: unknown) => {
        updates.push(args);
        return { count: 1 };
      },
    },
  };
  return {
    updates,
    database: {
      pageDocument: { findMany: async () => structuredClone(documents) },
      $transaction: async <T>(callback: (client: typeof tx) => Promise<T>) => callback(tx),
    },
  };
}

test("publishedRevisionId 回填 dry-run 只报告旧逻辑的最新 published revision", async () => {
  const { database, updates } = createDatabase();
  const report = await runPublishedRevisionBackfill(
    database as unknown as Pick<PrismaService, "pageDocument" | "$transaction">,
    false,
  );

  assert.equal(report.mode, "dry-run");
  assert.equal(report.candidateCount, 1);
  assert.equal(report.appliedCount, 0);
  assert.deepEqual(report.documents, [{
    pageDocumentId: 1,
    pageKey: "home",
    selectedRevisionId: 39,
    selectedRevisionVersion: 39,
  }]);
  assert.deepEqual(updates, []);
});

test("publishedRevisionId 回填 apply 仅在同文档 revision 仍有效且指针仍为空时写入", async () => {
  const { database, updates } = createDatabase();
  const report = await runPublishedRevisionBackfill(
    database as unknown as Pick<PrismaService, "pageDocument" | "$transaction">,
    true,
  );

  assert.equal(report.mode, "apply");
  assert.equal(report.appliedCount, 1);
  assert.equal(report.skippedConflictCount, 0);
  assert.equal(updates.length, 1);
});

test("回填规划拒绝跨 PageDocument 的 revision", async () => {
  const { database } = createDatabase();
  database.pageDocument.findMany = async () => [{
    id: 1,
    pageKey: "home",
    publishedRevisionId: null,
    revisions: [{ id: 88, documentId: 2, version: 7 }],
  }];

  await assert.rejects(
    () => planPublishedRevisionBackfill(
      database as unknown as Pick<PrismaService, "pageDocument" | "$transaction">,
    ),
    /BACKFILL_CROSS_DOCUMENT/,
  );
});

const passingMigrationIntegrity = async () => ({
  code: "migration-history-integrity",
  ok: true,
  summary: "测试 migration 历史一致",
  facts: {
    repositoryMigrationCount: 49,
    appliedMigrationCount: 49,
    issueCodes: [],
    affectedMigrations: [],
  },
});

function targetEnvironment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    PAGE_PUBLISHED_REVISION_AUDIT_READ_ONLY_AUTHORIZED: "1",
    PAGE_PUBLISHED_REVISION_ENVIRONMENT_ID: "staging-a",
    PAGE_PUBLISHED_REVISION_EXPECTED_DATABASE: "jewelry_staging",
    PAGE_PUBLISHED_REVISION_APPROVAL_REFERENCE: "approval-test-1",
    DATABASE_URL: "mysql://readonly:test@db.example.invalid:3306/jewelry_staging",
    ...overrides,
  };
}

function createTargetAuditDatabase(
  pointerColumnPresent: boolean,
  grant = "GRANT SELECT ON `jewelry_staging`.* TO `readonly`@`%`",
) {
  const base = createDatabase();
  const queries: string[] = [];
  return {
    updates: base.updates,
    queries,
    database: {
      ...base.database,
      async $queryRawUnsafe<T>(query: string): Promise<T> {
        queries.push(query);
        if (query.includes("SELECT DATABASE()")) {
          return [{ databaseName: "jewelry_staging" }] as T;
        }
        if (query.includes("SHOW GRANTS")) {
          return [{ grant }] as T;
        }
        if (query.includes("information_schema.tables")) {
          return [
            { tableName: "_prisma_migrations" },
            { tableName: "page_documents" },
            { tableName: "page_document_revisions" },
          ] as T;
        }
        if (query.includes("information_schema.columns")) {
          return (pointerColumnPresent ? [{ columnName: "published_revision_id" }] : []) as T;
        }
        if (query.includes("publishedPointerCount")) {
          return [{
            publishedPointerCount: 0,
            danglingPointerCount: 0,
            crossDocumentPointerCount: 0,
          }] as T;
        }
        throw new Error(`UNEXPECTED_QUERY:${query}`);
      },
    },
  };
}

test("目标审计在连接数据库前要求只读授权、环境身份和数据库名一致", () => {
  assert.throws(
    () => createPublishedRevisionTargetAuditConfig([], targetEnvironment({
      PAGE_PUBLISHED_REVISION_AUDIT_READ_ONLY_AUTHORIZED: "0",
    })),
    /READ_ONLY_AUTHORIZATION_REQUIRED/,
  );
  assert.throws(
    () => createPublishedRevisionTargetAuditConfig([], targetEnvironment({
      PAGE_PUBLISHED_REVISION_EXPECTED_DATABASE: "other_database",
    })),
    /DATABASE_NAME_MISMATCH/,
  );

  const config = createPublishedRevisionTargetAuditConfig([], targetEnvironment());
  assert.equal(config.environmentId, "staging-a");
  assert.equal(config.expectedDatabase, "jewelry_staging");
  assert.equal(config.apply, false);
  assert.match(config.approvalReferenceHash, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(config.approvalReferenceHash, /approval-test-1/);
});

test("目标审计只接受 USAGE、SELECT 和 SHOW VIEW 权限", () => {
  assert.equal(evaluatePublishedRevisionReadOnlyGrants([
    "GRANT USAGE ON *.* TO `readonly`@`%`",
    "GRANT SELECT, SHOW VIEW ON `jewelry_staging`.* TO `readonly`@`%`",
  ], "jewelry_staging").ok, true);
  assert.deepEqual(evaluatePublishedRevisionReadOnlyGrants([
    "GRANT SELECT, UPDATE ON `jewelry_staging`.* TO `operator`@`%`",
  ], "jewelry_staging"), {
    ok: false,
    rejected: ["WRITE_OR_ADMIN_PRIVILEGE"],
  });
  assert.deepEqual(evaluatePublishedRevisionReadOnlyGrants([
    "GRANT SELECT ON `another_database`.* TO `readonly`@`%`",
  ], "jewelry_staging"), {
    ok: false,
    rejected: ["CROSS_DATABASE_SCOPE"],
  });
  assert.equal(evaluatePublishedRevisionApplyGrants([
    "GRANT SELECT, UPDATE ON `jewelry_staging`.`page_documents` TO `operator`@`%`",
  ], "jewelry_staging").ok, true);
  assert.deepEqual(evaluatePublishedRevisionApplyGrants([
    "GRANT SELECT ON `jewelry_staging`.* TO `operator`@`%`",
  ], "jewelry_staging"), {
    ok: false,
    rejected: ["MISSING_UPDATE_PRIVILEGE"],
  });
});

test("目标审计在指针 migration 前仍输出 ledger 边界且不查询页面内容", async () => {
  const { database, queries, updates } = createTargetAuditDatabase(false);
  const report = await runPublishedRevisionTargetAudit(
    database as any,
    createPublishedRevisionTargetAuditConfig([], targetEnvironment()),
    async () => ({
      code: "migration-history-integrity",
      ok: false,
      summary: "存在待执行 migration",
      facts: {
        issueCodes: ["PENDING_MIGRATION"],
        affectedMigrations: ["20260830130000_add_page_document_published_revision_pointer"],
      },
    }),
  );

  assert.equal(report.access.grantsVerifiedReadOnly, true);
  assert.equal(report.schema.pointerColumnPresent, false);
  assert.equal(report.backfill.mode, "unavailable");
  assert.deepEqual(report.blockers, [
    "MIGRATION_INTEGRITY_NOT_READY",
    "POINTER_MIGRATION_REQUIRED",
  ]);
  assert.equal(report.readyForApply, false);
  assert.deepEqual(updates, []);
  assert.equal(queries.some((query) => /puckData|metadata/i.test(query)), false);
});

test("目标审计在 migration 完整后以只读账号输出 backfill dry-run 与指针不变量", async () => {
  const { database, updates } = createTargetAuditDatabase(true);
  const report = await runPublishedRevisionTargetAudit(
    database as any,
    createPublishedRevisionTargetAuditConfig([], targetEnvironment()),
    passingMigrationIntegrity,
  );

  assert.equal(report.migrationIntegrity.ok, true);
  assert.equal(report.backfill.mode, "dry-run");
  assert.equal(report.backfill.candidateCount, 1);
  assert.deepEqual(report.pointerIntegrity.before, {
    publishedPointerCount: 0,
    danglingPointerCount: 0,
    crossDocumentPointerCount: 0,
  });
  assert.equal(report.readyForApply, true);
  assert.deepEqual(updates, []);
});

test("apply 除原双重门禁外还要求目标身份和 migration 完整性", async () => {
  assert.throws(
    () => createPublishedRevisionTargetAuditConfig(["--apply"], targetEnvironment()),
    /BACKFILL_APPLY_AUTHORIZATION_REQUIRED/,
  );
  const { database, updates } = createTargetAuditDatabase(
    true,
    "GRANT SELECT, UPDATE ON `jewelry_staging`.* TO `operator`@`%`",
  );
  const config = createPublishedRevisionTargetAuditConfig(["--apply"], targetEnvironment({
    PAGE_PUBLISHED_REVISION_BACKFILL_APPLY: "1",
  }));
  await assert.rejects(
    () => runPublishedRevisionTargetAudit(
      database as any,
      config,
      async () => ({
        code: "migration-history-integrity",
        ok: false,
        summary: "存在待执行 migration",
      }),
    ),
    /MIGRATION_INTEGRITY_REQUIRED/,
  );
  assert.deepEqual(updates, []);
});
