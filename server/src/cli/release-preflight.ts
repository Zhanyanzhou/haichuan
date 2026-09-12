import type { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { PrismaService } from "../common/prisma/prisma.service";
import {
  hasCurrentContentTemplatePublicationAttestation,
} from "../modules/page-modules/content-template-contract";
import { PageModulesService } from "../modules/page-modules/page-modules.service";
import {
  evaluateSitePublicationReadiness,
  normalizeHttpsBaseUrl,
} from "../modules/settings/site-publication-readiness";
import {
  COMMERCE_CODE_READINESS,
  COMMERCE_RELEASE_PROFILE,
  evaluateReleaseRuntimeGates,
  isPartnerApplicationsWriteEnabled,
  parseReleaseProfile,
  type ReleaseRuntimeGateEnvironment,
  type ReleaseProfile,
} from "../common/release/release-profile";
import {
  parseTargetDatabaseIdentity,
  verifyTargetDatabaseAccess,
  type TargetDatabaseAuditDatabase,
  type TargetDatabaseIdentity,
} from "./target-database-audit";

export {
  COMMERCE_RELEASE_PROFILE,
  DEFAULT_RELEASE_PROFILE,
  parseReleaseProfile,
  type ReleaseProfile,
} from "../common/release/release-profile";

export const RELEASE_PAGE_KEYS = [
  "home",
  "about",
  "products",
  "catalog",
  "custom",
  "contact",
] as const;

const DEMO_PRODUCT_CODES = [
  "HC-ZD-001",
  "HC-JZ-001",
  "HC-SZ-001",
  "HC-ES-001",
  "HC-ZD-002",
] as const;

type PageDocumentRow = {
  id: number;
  pageKey: string;
  publishedRevisionId: number | null;
};
type PublishedRevisionRow = {
  id: number;
  version: number;
  puckData: Prisma.JsonValue;
  metadata: Prisma.JsonValue;
};

export type ReleasePreflightDatabase = {
  user: {
    count(args: unknown): Promise<number>;
  };
  product: {
    count(args: unknown): Promise<number>;
  };
  siteSetting: {
    findUnique(args: unknown): Promise<{ value: Prisma.JsonValue } | null>;
  };
  pageDocument: {
    findMany(args: unknown): Promise<PageDocumentRow[]>;
  };
  pageDocumentRevision: {
    findFirst(args: unknown): Promise<PublishedRevisionRow | null>;
  };
};

export type PageValidationResult = {
  valid: boolean;
  errors?: string[];
  issues?: Array<{ code?: string; severity?: string }>;
};

export type ReleasePreflightCheck = {
  code: string;
  ok: boolean;
  summary: string;
  facts?: Record<string, unknown>;
};

export type ReleasePreflightOptions = {
  partnerApplicationsWriteEnabled?: boolean;
  configuredClientPublicSiteOrigin?: string;
  requireConfiguredClientPublicSiteOrigin?: boolean;
  releaseRuntimeEnvironment?: ReleaseRuntimeGateEnvironment;
};

export interface ReleasePreflightTargetConfig extends TargetDatabaseIdentity {}

export function createReleasePreflightTargetConfig(
  environment: NodeJS.ProcessEnv,
): ReleasePreflightTargetConfig {
  if (environment.RELEASE_PREFLIGHT_READ_ONLY_AUTHORIZED !== "1") {
    throw new Error("RELEASE_PREFLIGHT_READ_ONLY_AUTHORIZATION_REQUIRED");
  }
  return parseTargetDatabaseIdentity({
    environmentId: environment.RELEASE_PREFLIGHT_ENVIRONMENT_ID,
    expectedDatabase: environment.RELEASE_PREFLIGHT_EXPECTED_DATABASE,
    approvalReference: environment.RELEASE_PREFLIGHT_APPROVAL_REFERENCE,
    databaseUrl: environment.DATABASE_URL,
    errorPrefix: "RELEASE_PREFLIGHT",
  });
}

/** 发布候选必须显式选择档位；runtime 的安全默认不能替代业务范围批准。 */
export function parseReleasePreflightProfile(
  environment: NodeJS.ProcessEnv,
): ReleaseProfile {
  const value = environment.RELEASE_PROFILE?.trim();
  if (!value) {
    throw new Error("RELEASE_PREFLIGHT_RELEASE_PROFILE_REQUIRED");
  }
  try {
    return parseReleaseProfile(value);
  } catch {
    throw new Error("RELEASE_PREFLIGHT_RELEASE_PROFILE_UNSUPPORTED");
  }
}

type MigrationLedgerRow = {
  migrationName: string;
  checksum: string;
  finishedAt: Date | null;
};

type MigrationIntegrityColumnContract = {
  name: string;
  columnType: string;
  nullable: boolean;
  default: string | null;
};

type MigrationIntegrityException = {
  migrationName: string;
  repositorySha256: string;
  appliedLedgerSha256: string;
  schemaContract: {
    table: string;
    columns: MigrationIntegrityColumnContract[];
    index: { name: string; columns: string[] };
  };
};

type MigrationIntegrityPolicy = {
  schemaVersion: number;
  exceptions: MigrationIntegrityException[];
};

type MigrationIntegrityDatabase = {
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
};

type MigrationColumnRow = {
  columnName: string;
  columnType: string;
  isNullable: "YES" | "NO";
  columnDefault: unknown;
};

type MigrationIndexRow = {
  columnName: string;
};

const KNOWN_LEGACY_MIGRATION_EXCEPTION = {
  migrationName: "20260824115000_add_product_publication_quality",
  repositorySha256: "8d8c49582be821a458404abeabb2c1f9bd0039149d82d34154a228c9f17f5c3a",
  appliedLedgerSha256: "7afed2a64fb53d0064cf60c3bf8415f82bbe9261e4f98a2201804d1cd21d21de",
} as const;

export type MigrationIntegrityEvaluation = {
  repositoryMigrations: Map<string, string>;
  ledgerRows: MigrationLedgerRow[];
  policy: MigrationIntegrityPolicy;
  exceptionSchemaMatches: Map<string, boolean>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function uniqueIssueCodes(result: PageValidationResult) {
  return [...new Set(
    (result.issues ?? [])
      .map((issue) => issue.code)
      .filter((code): code is string => Boolean(code)),
  )].sort();
}

function sha256(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

function readMigrationIntegrityPolicy(prismaRoot: string) {
  const policy = JSON.parse(
    readFileSync(join(prismaRoot, "migration-integrity-exceptions.json"), "utf8"),
  ) as MigrationIntegrityPolicy;
  if (policy.schemaVersion !== 1 || !Array.isArray(policy.exceptions)) {
    throw new Error("MIGRATION_POLICY_INVALID");
  }
  const [exception] = policy.exceptions;
  if (
    policy.exceptions.length !== 1 ||
    exception.migrationName !== KNOWN_LEGACY_MIGRATION_EXCEPTION.migrationName ||
    exception.repositorySha256 !== KNOWN_LEGACY_MIGRATION_EXCEPTION.repositorySha256 ||
    exception.appliedLedgerSha256 !== KNOWN_LEGACY_MIGRATION_EXCEPTION.appliedLedgerSha256
  ) {
    throw new Error("MIGRATION_POLICY_UNKNOWN_LEGACY_EXCEPTION");
  }
  return policy;
}

function readRepositoryMigrationChecksums(prismaRoot: string) {
  const migrationsRoot = join(prismaRoot, "migrations");
  return new Map(
    readdirSync(migrationsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const filePath = join(migrationsRoot, entry.name, "migration.sql");
        if (!existsSync(filePath)) throw new Error("MIGRATION_SQL_MISSING");
        return [entry.name, sha256(readFileSync(filePath))] as const;
      })
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function normalizedDefault(value: unknown) {
  return value === null || value === undefined ? null : String(value);
}

async function matchesExceptionSchema(
  database: MigrationIntegrityDatabase,
  exception: MigrationIntegrityException,
) {
  const columns = await database.$queryRawUnsafe<MigrationColumnRow[]>(
    `SELECT COLUMN_NAME AS columnName,
            LOWER(COLUMN_TYPE) AS columnType,
            IS_NULLABLE AS isNullable,
            COLUMN_DEFAULT AS columnDefault
       FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ?`,
    exception.schemaContract.table,
  );
  const columnsByName = new Map(columns.map((column) => [column.columnName, column]));
  const columnsMatch = exception.schemaContract.columns.every((expected) => {
    const actual = columnsByName.get(expected.name);
    return Boolean(
      actual &&
      actual.columnType.toLowerCase() === expected.columnType.toLowerCase() &&
      (actual.isNullable === "YES") === expected.nullable &&
      normalizedDefault(actual.columnDefault) === expected.default,
    );
  });

  const indexColumns = await database.$queryRawUnsafe<MigrationIndexRow[]>(
    `SELECT COLUMN_NAME AS columnName
       FROM information_schema.statistics
      WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?
      ORDER BY SEQ_IN_INDEX`,
    exception.schemaContract.table,
    exception.schemaContract.index.name,
  );
  return columnsMatch &&
    indexColumns.map((column) => column.columnName).join("\0") ===
      exception.schemaContract.index.columns.join("\0");
}

export function evaluateMigrationIntegrity({
  repositoryMigrations,
  ledgerRows,
  policy,
  exceptionSchemaMatches,
}: MigrationIntegrityEvaluation): ReleasePreflightCheck {
  const issueCodes = new Set<string>();
  const affectedMigrations = new Set<string>();
  const successfulRows = new Map<string, MigrationLedgerRow>();
  let acceptedExceptionCount = 0;

  for (const row of ledgerRows) {
    if (!row.finishedAt) {
      issueCodes.add("INCOMPLETE_MIGRATION");
      affectedMigrations.add(row.migrationName);
      continue;
    }
    if (successfulRows.has(row.migrationName)) {
      issueCodes.add("DUPLICATE_ACTIVE_MIGRATION");
      affectedMigrations.add(row.migrationName);
      continue;
    }
    successfulRows.set(row.migrationName, row);
  }

  for (const [migrationName, repositorySha256] of repositoryMigrations) {
    const ledger = successfulRows.get(migrationName);
    if (!ledger) {
      issueCodes.add("PENDING_MIGRATION");
      affectedMigrations.add(migrationName);
      continue;
    }
    if (ledger.checksum === repositorySha256) continue;

    const exception = policy.exceptions.find(
      (candidate) => candidate.migrationName === migrationName &&
        candidate.repositorySha256 === repositorySha256 &&
        candidate.appliedLedgerSha256 === ledger.checksum,
    );
    if (!exception) {
      issueCodes.add("UNKNOWN_CHECKSUM_MISMATCH");
      affectedMigrations.add(migrationName);
      continue;
    }
    if (!exceptionSchemaMatches.get(migrationName)) {
      issueCodes.add("ATTESTED_SCHEMA_MISMATCH");
      affectedMigrations.add(migrationName);
      continue;
    }
    acceptedExceptionCount += 1;
  }

  for (const migrationName of successfulRows.keys()) {
    if (!repositoryMigrations.has(migrationName)) {
      issueCodes.add("LEDGER_MIGRATION_FILE_MISSING");
      affectedMigrations.add(migrationName);
    }
  }

  const ok = issueCodes.size === 0;
  return {
    code: "migration-history-integrity",
    ok,
    summary: ok
      ? "数据库 migration 历史、镜像文件与已签认遗留例外一致"
      : "数据库 migration 历史完整性检查未通过",
    facts: {
      repositoryMigrationCount: repositoryMigrations.size,
      appliedMigrationCount: successfulRows.size,
      acceptedExceptionCount,
      issueCodes: [...issueCodes].sort(),
      affectedMigrations: [...affectedMigrations].sort(),
    },
  };
}

export async function checkMigrationIntegrity(
  database: MigrationIntegrityDatabase,
  prismaRoot = resolve(process.cwd(), "prisma"),
): Promise<ReleasePreflightCheck> {
  try {
    const repositoryMigrations = readRepositoryMigrationChecksums(prismaRoot);
    const policy = readMigrationIntegrityPolicy(prismaRoot);
    const ledgerRows = await database.$queryRawUnsafe<MigrationLedgerRow[]>(
      `SELECT migration_name AS migrationName,
              checksum,
              finished_at AS finishedAt
         FROM _prisma_migrations
        WHERE rolled_back_at IS NULL
        ORDER BY migration_name, started_at`,
    );
    const exceptionSchemaMatches = new Map<string, boolean>();
    for (const exception of policy.exceptions) {
      const repositorySha256 = repositoryMigrations.get(exception.migrationName);
      const ledger = ledgerRows.find(
        (row) => row.migrationName === exception.migrationName && row.finishedAt,
      );
      if (
        repositorySha256 === exception.repositorySha256 &&
        ledger?.checksum === exception.appliedLedgerSha256
      ) {
        exceptionSchemaMatches.set(
          exception.migrationName,
          await matchesExceptionSchema(database, exception),
        );
      }
    }
    return evaluateMigrationIntegrity({
      repositoryMigrations,
      ledgerRows,
      policy,
      exceptionSchemaMatches,
    });
  } catch {
    return {
      code: "migration-history-integrity",
      ok: false,
      summary: "数据库 migration 历史完整性检查无法完成",
      facts: { issueCodes: ["MIGRATION_INTEGRITY_CHECK_FAILED"] },
    };
  }
}

export async function runReleasePreflight(
  database: ReleasePreflightDatabase,
  validatePage: (
    pageKey: string,
    puckData: Prisma.JsonValue,
    metadata: Prisma.JsonValue,
  ) => Promise<PageValidationResult>,
  migrationIntegrityCheck: () => Promise<ReleasePreflightCheck>,
  releaseProfile: ReleaseProfile,
  options: ReleasePreflightOptions = {},
) {
  const checks: ReleasePreflightCheck[] = [];
  const releaseRuntimeGates = evaluateReleaseRuntimeGates(
    releaseProfile,
    options.releaseRuntimeEnvironment ?? {},
  );
  for (const gate of releaseRuntimeGates) {
    checks.push({
      code: `release-profile-${gate.capability}-gate`,
      ok: gate.ready,
      summary: gate.ready
        ? gate.requiredEnabled
          ? `${gate.capability} 已按 commerce 档位显式开启`
          : `${gate.capability} 已按 lead-generation 档位保持关闭`
        : gate.requiredEnabled
          ? `${gate.capability} 未按 commerce 档位显式开启`
          : `${gate.capability} 在 lead-generation 档位仍被显式开启`,
      facts: {
        environmentVariable: gate.environmentVariable,
        configuredEnabled: gate.configuredEnabled,
        effectiveEnabled: gate.effectiveEnabled,
        requiredEnabled: gate.requiredEnabled,
      },
    });
  }
  if (releaseProfile === COMMERCE_RELEASE_PROFILE) {
    for (const capability of COMMERCE_CODE_READINESS) {
      checks.push({
        code: `commerce-${capability.capability}`,
        ok: capability.ready,
        summary: capability.summary,
        facts: {
          evidenceLevel: "repository-code-contract",
          implementationState: capability.ready
            ? "code-ready-target-evidence-required"
            : "blocked",
          productionEvidenceVerified: false,
        },
      });
    }
  }
  const partnerApplicationsWriteEnabled =
    options.partnerApplicationsWriteEnabled ??
    isPartnerApplicationsWriteEnabled();
  checks.push({
    code: "partner-applications-write-disabled-until-b4",
    ok: !partnerApplicationsWriteEnabled,
    summary: partnerApplicationsWriteEnabled
      ? "合作申请写能力已开启，但协议、资质与审计闭环尚未完成"
      : "合作申请写能力保持安全关闭",
    facts: {
      capability: "partner-applications-write",
      requiredClosure: "B4",
    },
  });
  try {
    checks.push(await migrationIntegrityCheck());
  } catch {
    checks.push({
      code: "migration-history-integrity",
      ok: false,
      summary: "数据库 migration 历史完整性检查无法完成",
      facts: { issueCodes: ["MIGRATION_INTEGRITY_CHECK_FAILED"] },
    });
  }
  const activeSuperAdminCount = await database.user.count({
    where: { role: "SUPER_ADMIN", status: "ACTIVE" },
  });
  checks.push({
    code: "active-super-admin-present",
    ok: activeSuperAdminCount > 0,
    summary: activeSuperAdminCount > 0
      ? "至少存在一个启用中的超级管理员"
      : "缺少启用中的超级管理员",
    facts: { count: activeSuperAdminCount },
  });

  const placeholderAdminIdentityCount = await database.user.count({
    where: {
      OR: [
        { phone: "13800000000" },
        { email: "admin@jewelryhub.com" },
      ],
    },
  });
  checks.push({
    code: "placeholder-admin-identity-absent",
    ok: placeholderAdminIdentityCount === 0,
    summary: placeholderAdminIdentityCount === 0
      ? "未发现已知占位管理员联系方式"
      : "发现已知占位管理员联系方式",
    facts: { count: placeholderAdminIdentityCount },
  });

  const demoProductCount = await database.product.count({
    where: { code: { in: [...DEMO_PRODUCT_CODES] } },
  });
  checks.push({
    code: "demo-products-absent",
    ok: demoProductCount === 0,
    summary: demoProductCount === 0
      ? "未发现已知 Demo 商品"
      : "发现已知 Demo 商品，候选环境不得放行",
    facts: { count: demoProductCount },
  });

  const governedPublicProductWhere = {
    deletedAt: null,
    status: "PUBLISHED",
    visibility: "PUBLIC",
    publicationQualityStatus: "READY",
  } as const;
  const governedPublicProductCount = await database.product.count({
    where: governedPublicProductWhere,
  });
  checks.push({
    code: "governed-public-catalog-present",
    ok: governedPublicProductCount > 0,
    summary: governedPublicProductCount > 0
      ? "至少存在一件通过发布质量门禁的公开商品"
      : "公开目录没有通过发布质量门禁的正式商品",
    facts: { count: governedPublicProductCount },
  });

  const directPurchaseProductCount = await database.product.count({
    where: {
      ...governedPublicProductWhere,
      salesMode: "DIRECT_PURCHASE",
    },
  });
  checks.push(releaseProfile === COMMERCE_RELEASE_PROFILE
    ? {
        code: "direct-purchase-assortment-present",
        ok: directPurchaseProductCount > 0,
        summary: directPurchaseProductCount > 0
          ? "至少存在一件通过发布质量门禁的直购商品"
          : "交易型发布没有可用于真实成交闭环的正式直购商品",
        facts: { count: directPurchaseProductCount },
      }
    : {
        code: "lead-generation-assortment-commerce-free",
        ok: directPurchaseProductCount === 0,
        summary: directPurchaseProductCount === 0
          ? "线索型发布没有公开直购商品"
          : "线索型发布仍包含公开直购商品",
        facts: { count: directPurchaseProductCount },
      });

  const storedSettings = await database.siteSetting.findUnique({
    where: { key: "site" },
    select: { value: true },
  });
  checks.push({
    code: "site-settings-persisted",
    ok: Boolean(storedSettings),
    summary: storedSettings
      ? "店铺资料已持久化"
      : "店铺资料仅处于默认回退态，尚未持久化",
  });

  const settings = isRecord(storedSettings?.value) ? storedSettings.value : {};
  const siteReadiness = evaluateSitePublicationReadiness(settings, {
    persisted: Boolean(storedSettings),
    requireLaunchDetails: true,
  });
  const contactBlockers = siteReadiness.blockers.filter(
    (blocker) => blocker.area === "contact",
  );
  checks.push({
    code: "site-settings-required-fields",
    ok: contactBlockers.length === 0,
    summary: contactBlockers.length === 0
      ? "四项公开联系资料均已填写"
      : "店铺资料缺少正式上线必需字段",
    facts: {
      missingFields: contactBlockers.map((blocker) =>
        blocker.field.replace(/^siteSettings\./, "")
      ),
      blockerCodes: contactBlockers.map((blocker) => blocker.code),
      blockerFields: contactBlockers.map((blocker) => blocker.field),
    },
  });
  const settingsOrigin = normalizeHttpsBaseUrl(settings.canonicalBaseUrl);
  const configuredClientOrigin = normalizeHttpsBaseUrl(
    options.configuredClientPublicSiteOrigin,
  );
  const requireConfiguredClientOrigin =
    options.requireConfiguredClientPublicSiteOrigin !== false;
  checks.push({
    code: "site-settings-canonical-origin-configuration",
    ok: !requireConfiguredClientOrigin
      || Boolean(
        settingsOrigin
        && configuredClientOrigin
        && settingsOrigin === configuredClientOrigin
      ),
    summary: !requireConfiguredClientOrigin
      ? "当前调用未启用预期客户端公开域名配置核验"
      : settingsOrigin
          && configuredClientOrigin
          && settingsOrigin === configuredClientOrigin
        ? "SiteSettings 正式域名与预期客户端公开域名配置一致"
        : "SiteSettings 正式域名与预期客户端公开域名配置缺失或不一致",
    facts: {
      evidenceType: "runner-configuration",
      artifactVerified: false,
      enforced: requireConfiguredClientOrigin,
      settingsOriginConfigured: Boolean(settingsOrigin),
      clientOriginConfigured: Boolean(configuredClientOrigin),
      originsMatch: Boolean(
        settingsOrigin
        && configuredClientOrigin
        && settingsOrigin === configuredClientOrigin
      ),
    },
  });
  checks.push({
    code: "site-settings-publication-readiness",
    ok: siteReadiness.ready,
    summary: siteReadiness.ready
      ? "品牌、联系、法律、SEO 与语言配置已满足公开站点准备度"
      : "公开站点配置准备度未通过",
    facts: {
      schemaVersion: siteReadiness.schemaVersion,
      status: siteReadiness.status,
      areas: siteReadiness.areas,
      blockerCodes: siteReadiness.blockers.map((blocker) => blocker.code),
      blockerFields: siteReadiness.blockers.map((blocker) => blocker.field),
    },
  });

  const documents = await database.pageDocument.findMany({
    where: { pageKey: { in: [...RELEASE_PAGE_KEYS] } },
    select: { id: true, pageKey: true, publishedRevisionId: true },
  });
  const documentsByKey = new Map(documents.map((document) => [document.pageKey, document]));

  for (const pageKey of RELEASE_PAGE_KEYS) {
    const document = documentsByKey.get(pageKey);
    if (!document) {
      checks.push({
        code: `page-${pageKey}-published-current`,
        ok: false,
        summary: `${pageKey} 缺少页面文档`,
      });
      continue;
    }

    if (!document.publishedRevisionId) {
      checks.push({
        code: `page-${pageKey}-published-current`,
        ok: false,
        summary: `${pageKey} 缺少线上版本指针`,
      });
      continue;
    }

    const revision = await database.pageDocumentRevision.findFirst({
      where: {
        id: document.publishedRevisionId,
        documentId: document.id,
        status: "published",
      },
      select: { id: true, version: true, puckData: true, metadata: true },
    });
    if (!revision) {
      checks.push({
        code: `page-${pageKey}-published-current`,
        ok: false,
        summary: `${pageKey} 线上版本指针无效`,
        facts: { publishedRevisionId: document.publishedRevisionId },
      });
      continue;
    }

    if (!hasCurrentContentTemplatePublicationAttestation(revision.metadata)) {
      checks.push({
        code: `page-${pageKey}-published-current`,
        ok: false,
        summary: `${pageKey} 指针 revision 未通过当前合同签认`,
        facts: { revisionId: revision.id, version: revision.version },
      });
      continue;
    }

    try {
      const validation = await validatePage(
        pageKey,
        revision.puckData,
        revision.metadata,
      );
      checks.push({
        code: `page-${pageKey}-published-current`,
        ok: validation.valid,
        summary: validation.valid
          ? `${pageKey} 指针 revision 通过当前服务端验证`
          : `${pageKey} 指针 revision 重新验证失败`,
        facts: {
          revisionId: revision.id,
          version: revision.version,
          errorCount: validation.errors?.length ?? 0,
          issueCodes: uniqueIssueCodes(validation),
        },
      });
    } catch {
      checks.push({
        code: `page-${pageKey}-published-current`,
        ok: false,
        summary: `${pageKey} 指针 revision 无法完成重新验证`,
        facts: { revisionId: revision.id, version: revision.version },
      });
    }
  }

  return {
    releaseProfile,
    technicalReady: checks.every((check) => check.ok),
    checks,
    manualChecksRequired: [
      "公开联系方式与营业信息真实性签认",
      "品牌文案、法务文案与运营主体签认",
      "公开媒体商用权利与最终视觉签认",
      "已验证客户端制品中的 VITE_PUBLIC_SITE_ORIGIN 与正式域名一致",
      releaseProfile === COMMERCE_RELEASE_PROFILE
        ? "首发商品组合、SKU、库存、价格、配送范围与媒体权利签认"
        : "首发作品组合、展示模式、作品事实与媒体权利签认",
      "正式域名、TLS、监控、异地备份与目标环境证据",
    ],
  };
}

export async function runReleasePreflightTargetAudit(
  database: ReleasePreflightDatabase & TargetDatabaseAuditDatabase,
  validatePage: (
    pageKey: string,
    puckData: Prisma.JsonValue,
    metadata: Prisma.JsonValue,
  ) => Promise<PageValidationResult>,
  migrationIntegrityCheck: () => Promise<ReleasePreflightCheck>,
  config: ReleasePreflightTargetConfig,
  releaseProfile: ReleaseProfile,
  options: ReleasePreflightOptions = {},
) {
  const access = await verifyTargetDatabaseAccess(
    database,
    config,
    "read-only",
    "RELEASE_PREFLIGHT",
  );
  const preflight = await runReleasePreflight(
    database,
    validatePage,
    migrationIntegrityCheck,
    releaseProfile,
    options,
  );
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    environmentId: config.environmentId,
    databaseName: config.expectedDatabase,
    approvalReferenceHash: config.approvalReferenceHash,
    access,
    ...preflight,
    candidateBoundary: {
      releaseProfileExplicitlySelected: true,
      businessScopeApprovalVerified: false,
      productionEnvironmentVerified: false,
    },
    evidenceBoundary:
      "只读账号的目标身份、migration、正式内容、publishedRevisionId 快照及 runner 配置预检；档位选择不代表业务范围批准，不读取或验证客户端制品构建参数，也不执行 migration、回填、部署、页面发布或流量切换",
  };
}

function safeReleasePreflightErrorCode(error: unknown): string {
  if (!(error instanceof Error)) return "RELEASE_PREFLIGHT_EXECUTION_FAILED";
  return /^RELEASE_PREFLIGHT_[A-Z0-9_]+(?::[A-Z0-9_,.-]+)?$/.test(error.message)
    ? error.message
    : "RELEASE_PREFLIGHT_EXECUTION_FAILED";
}

async function main() {
  const config = createReleasePreflightTargetConfig(process.env);
  const releaseProfile = parseReleasePreflightProfile(process.env);
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const pageModules = new PageModulesService(prisma);
    const result = await runReleasePreflightTargetAudit(
      prisma as unknown as ReleasePreflightDatabase & TargetDatabaseAuditDatabase,
      (pageKey, puckData, metadata) =>
        pageModules.validatePageDocument(pageKey, puckData, metadata),
      () => checkMigrationIntegrity(prisma as unknown as MigrationIntegrityDatabase),
      config,
      releaseProfile,
      {
        configuredClientPublicSiteOrigin: process.env.VITE_PUBLIC_SITE_ORIGIN,
        requireConfiguredClientPublicSiteOrigin: true,
        releaseRuntimeEnvironment: process.env,
      },
    );
    console.log(JSON.stringify(result, null, 2));
    if (!result.technicalReady) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(JSON.stringify({
      technicalReady: false,
      code: safeReleasePreflightErrorCode(error),
      message: "发布前检查执行失败；未输出底层异常、连接信息或业务数据",
    }));
    process.exitCode = 2;
  });
}
