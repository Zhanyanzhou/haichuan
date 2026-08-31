import { Prisma } from "@prisma/client";
import { PrismaService } from "../common/prisma/prisma.service";
import {
  checkMigrationIntegrity,
  type ReleasePreflightCheck,
} from "./release-preflight";
import {
  evaluateTargetDatabaseGrants,
  parseTargetDatabaseIdentity,
  verifyTargetDatabaseAccess,
} from "./target-database-audit";

export interface PublishedRevisionBackfillRow {
  pageDocumentId: number;
  pageKey: string;
  selectedRevisionId: number;
  selectedRevisionVersion: number;
}

type PublishedRevisionBackfillDatabase = Pick<
  PrismaService,
  "pageDocument" | "$transaction"
>;

interface PublishedRevisionTargetAuditDatabase
  extends PublishedRevisionBackfillDatabase {
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
}

export interface PublishedRevisionTargetAuditConfig {
  environmentId: string;
  expectedDatabase: string;
  approvalReferenceHash: string;
  apply: boolean;
}

interface PointerIntegrityRow {
  publishedPointerCount: bigint | number;
  danglingPointerCount: bigint | number;
  crossDocumentPointerCount: bigint | number;
}

export function evaluatePublishedRevisionReadOnlyGrants(
  statements: readonly string[],
  expectedDatabase: string,
) {
  return evaluateTargetDatabaseGrants(statements, expectedDatabase, "read-only");
}

export function evaluatePublishedRevisionApplyGrants(
  statements: readonly string[],
  expectedDatabase: string,
) {
  return evaluateTargetDatabaseGrants(statements, expectedDatabase, "update");
}

export function createPublishedRevisionTargetAuditConfig(
  args: readonly string[],
  environment: NodeJS.ProcessEnv,
): PublishedRevisionTargetAuditConfig {
  const apply = args.includes("--apply");
  if (apply) {
    if (environment.PAGE_PUBLISHED_REVISION_BACKFILL_APPLY !== "1") {
      throw new Error("PAGE_PUBLISHED_REVISION_BACKFILL_APPLY_AUTHORIZATION_REQUIRED");
    }
  } else if (environment.PAGE_PUBLISHED_REVISION_AUDIT_READ_ONLY_AUTHORIZED !== "1") {
    throw new Error("PAGE_PUBLISHED_REVISION_AUDIT_READ_ONLY_AUTHORIZATION_REQUIRED");
  }

  const identity = parseTargetDatabaseIdentity({
    environmentId: environment.PAGE_PUBLISHED_REVISION_ENVIRONMENT_ID,
    expectedDatabase: environment.PAGE_PUBLISHED_REVISION_EXPECTED_DATABASE,
    approvalReference: environment.PAGE_PUBLISHED_REVISION_APPROVAL_REFERENCE,
    databaseUrl: environment.DATABASE_URL,
    errorPrefix: "PAGE_PUBLISHED_REVISION",
  });
  return {
    ...identity,
    apply,
  };
}

export async function planPublishedRevisionBackfill(
  database: PublishedRevisionBackfillDatabase,
): Promise<PublishedRevisionBackfillRow[]> {
  const documents = await database.pageDocument.findMany({
    where: { publishedRevisionId: null },
    select: {
      id: true,
      pageKey: true,
      publishedRevisionId: true,
      revisions: {
        where: { status: "published" },
        orderBy: { version: "desc" },
        take: 1,
        select: { id: true, documentId: true, version: true },
      },
    },
    orderBy: { id: "asc" },
  });

  return documents.flatMap((document) => {
    const revision = document.revisions[0];
    if (!revision) return [];
    if (revision.documentId !== document.id) {
      throw new Error(`PAGE_PUBLISHED_REVISION_BACKFILL_CROSS_DOCUMENT:${document.id}:${revision.id}`);
    }
    return [{
      pageDocumentId: document.id,
      pageKey: document.pageKey,
      selectedRevisionId: revision.id,
      selectedRevisionVersion: revision.version,
    }];
  });
}

export async function runPublishedRevisionBackfill(
  database: PublishedRevisionBackfillDatabase,
  apply: boolean,
) {
  const documents = await planPublishedRevisionBackfill(database);
  if (!apply) {
    return {
      mode: "dry-run" as const,
      candidateCount: documents.length,
      appliedCount: 0,
      skippedConflictCount: 0,
      documents,
    };
  }

  const result = await database.$transaction(async (tx) => {
    let appliedCount = 0;
    let skippedConflictCount = 0;
    for (const document of documents) {
      const revision = await tx.pageDocumentRevision.findFirst({
        where: {
          id: document.selectedRevisionId,
          documentId: document.pageDocumentId,
          status: "published",
        },
        select: { id: true, documentId: true, version: true },
      });
      if (!revision || revision.version !== document.selectedRevisionVersion) {
        skippedConflictCount += 1;
        continue;
      }
      const updated = await tx.pageDocument.updateMany({
        where: {
          id: document.pageDocumentId,
          publishedRevisionId: null,
        },
        data: { publishedRevisionId: document.selectedRevisionId },
      });
      if (updated.count === 1) appliedCount += 1;
      else skippedConflictCount += 1;
    }
    return { appliedCount, skippedConflictCount };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  return {
    mode: "apply" as const,
    candidateCount: documents.length,
    ...result,
    documents,
  };
}

async function collectPointerIntegrity(
  database: PublishedRevisionTargetAuditDatabase,
) {
  const rows = await database.$queryRawUnsafe<PointerIntegrityRow[]>(`
    SELECT COUNT(document.published_revision_id) AS publishedPointerCount,
           SUM(CASE
                 WHEN document.published_revision_id IS NOT NULL AND revision.id IS NULL
                 THEN 1 ELSE 0
               END) AS danglingPointerCount,
           SUM(CASE
                 WHEN revision.id IS NOT NULL AND revision.document_id <> document.id
                 THEN 1 ELSE 0
               END) AS crossDocumentPointerCount
      FROM page_documents document
      LEFT JOIN page_document_revisions revision
        ON revision.id = document.published_revision_id
  `);
  const row = rows[0];
  return {
    publishedPointerCount: Number(row?.publishedPointerCount ?? 0),
    danglingPointerCount: Number(row?.danglingPointerCount ?? 0),
    crossDocumentPointerCount: Number(row?.crossDocumentPointerCount ?? 0),
  };
}

export async function runPublishedRevisionTargetAudit(
  database: PublishedRevisionTargetAuditDatabase,
  config: PublishedRevisionTargetAuditConfig,
  migrationIntegrityCheck: () => Promise<ReleasePreflightCheck> = () =>
    checkMigrationIntegrity(database),
) {
  const access = await verifyTargetDatabaseAccess(
    database,
    config,
    config.apply ? "update" : "read-only",
    "PAGE_PUBLISHED_REVISION",
  );

  const tableRows = await database.$queryRawUnsafe<Array<{ tableName: string }>>(
    "SELECT table_name AS tableName FROM information_schema.tables WHERE table_schema = DATABASE()",
  );
  const tableNames = new Set(tableRows.map((row) => row.tableName));
  const missingTables = ["_prisma_migrations", "page_documents", "page_document_revisions"]
    .filter((table) => !tableNames.has(table));
  if (missingTables.length > 0) {
    throw new Error(`PAGE_PUBLISHED_REVISION_REQUIRED_TABLES_MISSING:${missingTables.join(",")}`);
  }

  const columnRows = await database.$queryRawUnsafe<Array<{ columnName: string }>>(
    `SELECT column_name AS columnName
       FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'page_documents'
        AND column_name = 'published_revision_id'`,
  );
  const pointerColumnPresent = columnRows.length === 1;
  const migrationIntegrity = await migrationIntegrityCheck();
  if (config.apply && !migrationIntegrity.ok) {
    throw new Error("PAGE_PUBLISHED_REVISION_MIGRATION_INTEGRITY_REQUIRED");
  }
  if (config.apply && !pointerColumnPresent) {
    throw new Error("PAGE_PUBLISHED_REVISION_POINTER_MIGRATION_REQUIRED");
  }

  const pointerIntegrityBefore = pointerColumnPresent
    ? await collectPointerIntegrity(database)
    : null;
  const invariantBlockers = pointerIntegrityBefore
    ? [
        ...(pointerIntegrityBefore.danglingPointerCount > 0
          ? ["DANGLING_PUBLISHED_REVISION_POINTER"]
          : []),
        ...(pointerIntegrityBefore.crossDocumentPointerCount > 0
          ? ["CROSS_DOCUMENT_PUBLISHED_REVISION_POINTER"]
          : []),
      ]
    : [];
  if (config.apply && invariantBlockers.length > 0) {
    throw new Error(
      `PAGE_PUBLISHED_REVISION_POINTER_INTEGRITY_REQUIRED:${invariantBlockers.join(",")}`,
    );
  }

  const backfill = pointerColumnPresent
    ? await runPublishedRevisionBackfill(database, config.apply)
    : {
        mode: "unavailable" as const,
        reason: "POINTER_MIGRATION_REQUIRED" as const,
        candidateCount: null,
        appliedCount: 0,
        skippedConflictCount: 0,
        documents: [],
      };
  const pointerIntegrityAfter = pointerColumnPresent
    ? await collectPointerIntegrity(database)
    : null;
  const blockers = [
    ...(!migrationIntegrity.ok ? ["MIGRATION_INTEGRITY_NOT_READY"] : []),
    ...(!pointerColumnPresent ? ["POINTER_MIGRATION_REQUIRED"] : []),
    ...invariantBlockers,
    ...(backfill.skippedConflictCount > 0 ? ["BACKFILL_CONFLICT"] : []),
  ];

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    environmentId: config.environmentId,
    databaseName: config.expectedDatabase,
    approvalReferenceHash: config.approvalReferenceHash,
    access,
    migrationIntegrity,
    schema: { pointerColumnPresent },
    pointerIntegrity: {
      before: pointerIntegrityBefore,
      after: pointerIntegrityAfter,
    },
    backfill,
    blockers,
    readyForApply: blockers.length === 0,
    evidenceBoundary: config.apply
      ? "显式授权的指针回填；不执行 migration、模板激活、部署、页面发布或公开流量切换"
      : "只读账号的目标身份、migration、指针聚合与 backfill dry-run；不执行 migration、写入、模板激活、部署或页面发布",
  };
}

function safeErrorCode(error: unknown): string {
  if (!(error instanceof Error)) return "PAGE_PUBLISHED_REVISION_AUDIT_FAILED";
  return /^PAGE_PUBLISHED_REVISION_[A-Z0-9_]+(?::[A-Z0-9_,.-]+)?$/.test(error.message)
    ? error.message
    : "PAGE_PUBLISHED_REVISION_AUDIT_FAILED";
}

async function main() {
  const config = createPublishedRevisionTargetAuditConfig(
    process.argv.slice(2),
    process.env,
  );
  const database = new PrismaService();
  await database.$connect();
  try {
    const report = await runPublishedRevisionTargetAudit(database, config);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.readyForApply || report.backfill.skippedConflictCount > 0) {
      process.exitCode = 2;
    }
  } finally {
    await database.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    process.stderr.write(`${safeErrorCode(error)}\n`);
    process.exitCode = 1;
  });
}
