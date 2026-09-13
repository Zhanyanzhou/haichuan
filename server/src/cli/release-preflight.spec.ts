import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import { RELEASE_RUNTIME_GATE_KEYS } from "../common/release/release-profile";
import {
  createContentTemplatePublicationAttestation,
  CONTENT_TEMPLATE_PUBLICATION_METADATA_KEY,
} from "../modules/page-modules/content-template-contract";
import {
  createReleasePreflightTargetConfig,
  evaluateMigrationIntegrity,
  parseReleasePreflightProfile,
  parseReleaseProfile,
  RELEASE_PAGE_KEYS,
  runReleasePreflight,
  runReleasePreflightTargetAudit,
  type ReleasePreflightDatabase,
} from "./release-preflight";

const passingMigrationIntegrityCheck = async () => ({
  code: "migration-history-integrity",
  ok: true,
  summary: "测试 migration 历史一致",
  facts: { repositoryMigrationCount: 1, appliedMigrationCount: 1 },
});

type FakeOptions = {
  activeSuperAdminCount?: number;
  placeholderAdminIdentityCount?: number;
  demoProductCount?: number;
  governedPublicProductCount?: number;
  directPurchaseProductCount?: number;
  settings?: Record<string, unknown> | null;
  missingPageKey?: string;
  missingPointerPageKey?: string;
  danglingPointerPageKey?: string;
  stalePageKey?: string;
};

function currentMetadata(): Prisma.JsonObject {
  return {
    [CONTENT_TEMPLATE_PUBLICATION_METADATA_KEY]:
      createContentTemplatePublicationAttestation() as unknown as Prisma.JsonObject,
  };
}

function createFakeDatabase(options: FakeOptions = {}): ReleasePreflightDatabase {
  const pages = RELEASE_PAGE_KEYS
    .filter((pageKey) => pageKey !== options.missingPageKey)
    .map((pageKey, index) => ({
      id: index + 1,
      pageKey,
      publishedRevisionId: pageKey === options.missingPointerPageKey
        ? null
        : 101 + index,
    }));
  const settings = options.settings === undefined
    ? {
        siteName: "海川珠宝",
        brandPresentationMode: "text-only",
        brandReviewReference: "BRAND-TEST-001",
        contactPhone: "test-present",
        contactEmail: "test@example.invalid",
        contactAddress: "test-present",
        businessHours: "test-present",
        seoTitle: "海川珠宝测试站",
        seoDescription: "仅用于发布准备度测试的正式站点描述。",
        canonicalBaseUrl: "https://example.invalid",
        legalEntityReviewReference: "LEGAL-TEST-001",
        privacyPolicyReviewReference: "PRIVACY-TEST-001",
        seoReviewReference: "SEO-TEST-001",
        defaultLocale: "zh-CN",
        publishedLocales: ["zh-CN"],
      }
    : options.settings;

  return {
    user: {
      async count(args: any) {
        return args.where?.role === "SUPER_ADMIN"
          ? options.activeSuperAdminCount ?? 1
          : options.placeholderAdminIdentityCount ?? 0;
      },
    },
    product: {
      async count(args: any) {
        if (args.where?.code?.in) return options.demoProductCount ?? 0;
        if (args.where?.salesMode === "DIRECT_PURCHASE") {
          return options.directPurchaseProductCount ?? 0;
        }
        return options.governedPublicProductCount ?? 1;
      },
    },
    siteSetting: {
      async findUnique() {
        return settings === null ? null : { value: settings as Prisma.JsonObject };
      },
    },
    pageDocument: {
      async findMany() {
        return pages;
      },
    },
    pageDocumentRevision: {
      async findFirst(args: any) {
        const page = pages.find(
          (candidate) => candidate.id === args.where.documentId &&
            candidate.publishedRevisionId === args.where.id,
        );
        if (!page || page.pageKey === options.danglingPointerPageKey) return null;
        return {
          id: page.publishedRevisionId,
          version: 3,
          puckData: { content: [{ type: "测试区块", props: {} }] },
          metadata: page.pageKey === options.stalePageKey ? {} : currentMetadata(),
        } as any;
      },
    },
  };
}

test("线索型发布门禁在超管、店铺资料、页面、作品和非交易边界全部满足时通过", async () => {
  const result = await runReleasePreflight(
    createFakeDatabase(),
    async () => ({ valid: true, errors: [], issues: [] }),
    passingMigrationIntegrityCheck,
    "lead-generation",
    { configuredClientPublicSiteOrigin: "https://example.invalid" },
  );

  assert.equal(result.technicalReady, true);
  assert.equal(result.releaseProfile, "lead-generation");
  assert.equal(result.checks.filter((check) => !check.ok).length, 0);
  assert.equal(
    result.checks.filter((check) => check.code.startsWith("page-")).length,
    RELEASE_PAGE_KEYS.length,
  );
  assert.ok(result.manualChecksRequired.length > 0);
});

test("预期客户端公开域名配置缺失或与 SiteSettings 不一致时阻断且不冒充制品证据", async () => {
  const missing = await runReleasePreflight(
    createFakeDatabase(),
    async () => ({ valid: true, errors: [], issues: [] }),
    passingMigrationIntegrityCheck,
    "lead-generation",
    { requireConfiguredClientPublicSiteOrigin: true },
  );
  const mismatched = await runReleasePreflight(
    createFakeDatabase(),
    async () => ({ valid: true, errors: [], issues: [] }),
    passingMigrationIntegrityCheck,
    "lead-generation",
    {
      requireConfiguredClientPublicSiteOrigin: true,
      configuredClientPublicSiteOrigin: "https://www.example.invalid",
    },
  );
  const matched = await runReleasePreflight(
    createFakeDatabase(),
    async () => ({ valid: true, errors: [], issues: [] }),
    passingMigrationIntegrityCheck,
    "lead-generation",
    {
      requireConfiguredClientPublicSiteOrigin: true,
      configuredClientPublicSiteOrigin: "https://example.invalid",
    },
  );
  const pathBearingOrigin = await runReleasePreflight(
    createFakeDatabase(),
    async () => ({ valid: true, errors: [], issues: [] }),
    passingMigrationIntegrityCheck,
    "lead-generation",
    {
      requireConfiguredClientPublicSiteOrigin: true,
      configuredClientPublicSiteOrigin: "https://example.invalid/store",
    },
  );

  for (const result of [missing, mismatched, pathBearingOrigin]) {
    assert.ok(result.checks.some(
      (check) => check.code === "site-settings-canonical-origin-configuration" && !check.ok,
    ));
    assert.equal(result.technicalReady, false);
  }
  const configurationCheck = matched.checks.find(
    (check) => check.code === "site-settings-canonical-origin-configuration",
  );
  assert.equal(configurationCheck?.ok, true);
  assert.equal(configurationCheck?.facts?.evidenceType, "runner-configuration");
  assert.equal(configurationCheck?.facts?.artifactVerified, false);
  assert.match(configurationCheck?.summary || "", /配置一致/);
  assert.doesNotMatch(configurationCheck?.summary || "", /构建来源|制品一致/);
  assert.ok(matched.manualChecksRequired.some((item) => /客户端制品/.test(item)));
  assert.equal(matched.technicalReady, true);
});

test("发布前门禁同时报告缺失资料、正式商品、Demo 商品与失效发布签认", async () => {
  const result = await runReleasePreflight(
    createFakeDatabase({
      activeSuperAdminCount: 0,
      demoProductCount: 2,
      governedPublicProductCount: 0,
      directPurchaseProductCount: 1,
      settings: { siteName: "海川珠宝" },
      stalePageKey: "home",
      missingPageKey: "custom",
    }),
    async () => ({ valid: true, errors: [], issues: [] }),
    passingMigrationIntegrityCheck,
    "lead-generation",
  );

  assert.equal(result.technicalReady, false);
  const failedCodes = result.checks
    .filter((check) => !check.ok)
    .map((check) => check.code);
  assert.ok(failedCodes.includes("active-super-admin-present"));
  assert.ok(failedCodes.includes("demo-products-absent"));
  assert.ok(failedCodes.includes("governed-public-catalog-present"));
  assert.ok(failedCodes.includes("lead-generation-assortment-commerce-free"));
  assert.ok(failedCodes.includes("site-settings-required-fields"));
  assert.ok(failedCodes.includes("site-settings-publication-readiness"));
  const requiredSettingsCheck = result.checks.find(
    (check) => check.code === "site-settings-required-fields",
  );
  assert.ok(Array.isArray(requiredSettingsCheck?.facts?.missingFields));
  assert.ok((requiredSettingsCheck?.facts?.missingFields as string[]).includes(
    "contactPhone",
  ));
  assert.ok(failedCodes.includes("page-home-published-current"));
  assert.ok(failedCodes.includes("page-custom-published-current"));
});

test("交易型发布档位要求运行门禁和已知代码闭环，不能只凭直购商品误判 ready", async () => {
  const blocked = await runReleasePreflight(
    createFakeDatabase({ directPurchaseProductCount: 0 }),
    async () => ({ valid: true, errors: [], issues: [] }),
    passingMigrationIntegrityCheck,
    "commerce",
  );
  const ready = await runReleasePreflight(
    createFakeDatabase({ directPurchaseProductCount: 1 }),
    async () => ({ valid: true, errors: [], issues: [] }),
    passingMigrationIntegrityCheck,
    "commerce",
    {
      configuredClientPublicSiteOrigin: "https://example.invalid",
      releaseRuntimeEnvironment: {
        CUSTOMER_COMMERCE_ENABLED: "true",
        CUSTOMER_QUOTATION_ORDERING_ENABLED: "true",
        PAYMENT_GATEWAY_TRANSACTIONS_ENABLED: "true",
        PAYMENT_GATEWAY_REFUNDS_ENABLED: "true",
      },
    },
  );

  assert.equal(blocked.technicalReady, false);
  assert.ok(blocked.checks.some(
    (check) => check.code === "direct-purchase-assortment-present" && !check.ok,
  ));
  assert.ok(blocked.checks.some(
    (check) => check.code === "release-profile-customer-commerce-gate" && !check.ok,
  ));
  assert.ok(blocked.checks.some(
    (check) => check.code === "release-profile-payment-gateway-transactions-gate" && !check.ok,
  ));
  assert.ok(blocked.checks.some(
    (check) => check.code === "release-profile-payment-gateway-refunds-gate" && !check.ok,
  ));
  assert.equal(ready.technicalReady, false);
  assert.equal(ready.releaseProfile, "commerce");
  assert.ok(ready.checks.some(
    (check) => check.code === "release-profile-customer-commerce-gate" && check.ok,
  ));
  assert.ok(ready.checks.some(
    (check) => check.code === "commerce-payment-refund-reconciliation-code" && check.ok,
  ));
  assert.ok(ready.checks.some(
    (check) => check.code === "commerce-frontend-payment-visibility-contract" && !check.ok,
  ));
  assert.ok(ready.checks.some(
    (check) => check.code === "commerce-three-quotation-channels" && !check.ok,
  ));
  assert.ok(ready.checks.some(
    (check) => check.code === "commerce-customer-self-confirmation-entry" && !check.ok,
  ));
  assert.ok(ready.checks.some(
    (check) => check.code === "commerce-transactional-quotation-conversion-entry" && !check.ok,
  ));
  assert.ok(ready.checks.some(
    (check) => check.code === "commerce-inventory-and-price-snapshots" && !check.ok,
  ));
});

test("runtime 默认安全选择线索型，但发布候选要求显式且受支持的档位", () => {
  assert.equal(parseReleaseProfile(), "lead-generation");
  assert.equal(parseReleaseProfile("commerce"), "commerce");
  assert.throws(() => parseReleaseProfile("hybrid"), /unsupported release profile/);
  assert.equal(parseReleasePreflightProfile({ RELEASE_PROFILE: "commerce" }), "commerce");
  assert.throws(
    () => parseReleasePreflightProfile({}),
    /RELEASE_PREFLIGHT_RELEASE_PROFILE_REQUIRED/,
  );
  assert.throws(
    () => parseReleasePreflightProfile({ RELEASE_PROFILE: "Commerce" }),
    /RELEASE_PREFLIGHT_RELEASE_PROFILE_UNSUPPORTED/,
  );
});

test("lead-generation 携带任一交易危险开关时阻断，且运行态仍保持关闭", async () => {
  const result = await runReleasePreflight(
    createFakeDatabase(),
    async () => ({ valid: true, errors: [], issues: [] }),
    passingMigrationIntegrityCheck,
    "lead-generation",
    {
      configuredClientPublicSiteOrigin: "https://example.invalid",
      releaseRuntimeEnvironment: {
        CUSTOMER_COMMERCE_ENABLED: "true",
        CUSTOMER_QUOTATION_ORDERING_ENABLED: "true",
        PAYMENT_GATEWAY_TRANSACTIONS_ENABLED: "TRUE",
        PAYMENT_GATEWAY_REFUNDS_ENABLED: " true ",
      },
    },
  );

  assert.equal(result.technicalReady, false);
  const runtimeChecks = result.checks.filter((check) =>
    check.code.startsWith("release-profile-") && check.code.endsWith("-gate")
  );
  assert.equal(runtimeChecks.length, RELEASE_RUNTIME_GATE_KEYS.length);
  assert.deepEqual(
    runtimeChecks.map((check) => check.code).sort(),
    RELEASE_RUNTIME_GATE_KEYS.map((capability) => `release-profile-${capability}-gate`).sort(),
  );
  assert.ok(runtimeChecks.every((check) => !check.ok));
  assert.ok(runtimeChecks.every((check) => check.facts?.configuredEnabled === true));
  assert.ok(runtimeChecks.every((check) => check.facts?.effectiveEnabled === false));
});

test("正式预检在连接前要求只读授权、环境身份、数据库名和审批引用", () => {
  const baseEnvironment = {
    DATABASE_URL: "mysql://readonly:secret@db:3306/jewelry_staging",
    RELEASE_PREFLIGHT_ENVIRONMENT_ID: "staging-cn",
    RELEASE_PREFLIGHT_EXPECTED_DATABASE: "jewelry_staging",
    RELEASE_PREFLIGHT_APPROVAL_REFERENCE: "approval-20260831",
  };
  assert.throws(
    () => createReleasePreflightTargetConfig(baseEnvironment),
    /RELEASE_PREFLIGHT_READ_ONLY_AUTHORIZATION_REQUIRED/,
  );
  assert.throws(
    () => createReleasePreflightTargetConfig({
      ...baseEnvironment,
      RELEASE_PREFLIGHT_READ_ONLY_AUTHORIZED: "1",
      DATABASE_URL: "mysql://readonly:secret@db:3306/wrong_database",
    }),
    /RELEASE_PREFLIGHT_DATABASE_NAME_MISMATCH/,
  );

  const config = createReleasePreflightTargetConfig({
    ...baseEnvironment,
    RELEASE_PREFLIGHT_READ_ONLY_AUTHORIZED: "1",
  });
  assert.equal(config.environmentId, "staging-cn");
  assert.equal(config.expectedDatabase, "jewelry_staging");
  assert.equal(config.approvalReferenceHash.length, 64);
  assert.doesNotMatch(JSON.stringify(config), /approval-20260831/);
});

test("正式预检先验证只读账号和数据库范围，再执行内容门禁", async () => {
  const database = createFakeDatabase() as ReleasePreflightDatabase & {
    $queryRawUnsafe<T>(query: string): Promise<T>;
  };
  const rawQueries: string[] = [];
  database.$queryRawUnsafe = async <T>(query: string) => {
    rawQueries.push(query);
    if (query.includes("SELECT DATABASE()")) {
      return [{ databaseName: "jewelry_staging" }] as T;
    }
    if (query.includes("SHOW GRANTS")) {
      return [{ grant: "GRANT USAGE ON *.* TO `readonly`@`%`" }, {
        grant: "GRANT SELECT, SHOW VIEW ON `jewelry_staging`.* TO `readonly`@`%`",
      }] as T;
    }
    throw new Error(`unexpected raw query: ${query}`);
  };

  const result = await runReleasePreflightTargetAudit(
    database,
    async () => ({ valid: true, errors: [], issues: [] }),
    passingMigrationIntegrityCheck,
    {
      environmentId: "staging-cn",
      expectedDatabase: "jewelry_staging",
      approvalReferenceHash: "a".repeat(64),
    },
    "lead-generation",
    { configuredClientPublicSiteOrigin: "https://example.invalid" },
  );

  assert.equal(result.technicalReady, true);
  assert.equal(result.environmentId, "staging-cn");
  assert.equal(result.databaseName, "jewelry_staging");
  assert.deepEqual(result.access, {
    mode: "READ_ONLY",
    grantsVerifiedReadOnly: true,
    grantsVerifiedLeastPrivilege: true,
    databaseScopeVerified: true,
  });
  assert.match(result.evidenceBoundary, /runner 配置预检/);
  assert.match(result.evidenceBoundary, /档位选择不代表业务范围批准/);
  assert.match(result.evidenceBoundary, /不读取或验证客户端制品构建参数/);
  assert.deepEqual(result.candidateBoundary, {
    releaseProfileExplicitlySelected: true,
    businessScopeApprovalVerified: false,
    productionEnvironmentVerified: false,
  });
  assert.deepEqual(rawQueries, [
    "SELECT DATABASE() AS databaseName",
    "SHOW GRANTS FOR CURRENT_USER()",
  ]);
});

test("正式预检拒绝跨数据库只读授权且不进入业务查询", async () => {
  const database = createFakeDatabase() as ReleasePreflightDatabase & {
    $queryRawUnsafe<T>(query: string): Promise<T>;
  };
  let businessReadCount = 0;
  database.user.count = async () => {
    businessReadCount += 1;
    return 1;
  };
  database.$queryRawUnsafe = async <T>(query: string) => {
    if (query.includes("SELECT DATABASE()")) {
      return [{ databaseName: "jewelry_staging" }] as T;
    }
    if (query.includes("SHOW GRANTS")) {
      return [{
        grant: "GRANT SELECT ON `another_database`.* TO `readonly`@`%`",
      }] as T;
    }
    throw new Error(`unexpected raw query: ${query}`);
  };

  await assert.rejects(
    () => runReleasePreflightTargetAudit(
      database,
      async () => ({ valid: true, errors: [], issues: [] }),
      passingMigrationIntegrityCheck,
      {
        environmentId: "staging-cn",
        expectedDatabase: "jewelry_staging",
        approvalReferenceHash: "a".repeat(64),
      },
      "lead-generation",
    ),
    /RELEASE_PREFLIGHT_DATABASE_ACCOUNT_NOT_READ_ONLY:CROSS_DATABASE_SCOPE/,
  );
  assert.equal(businessReadCount, 0);
});

test("B4 闭环完成前开启合作申请写能力会阻断发布", async () => {
  const result = await runReleasePreflight(
    createFakeDatabase(),
    async () => ({ valid: true, errors: [], issues: [] }),
    passingMigrationIntegrityCheck,
    "lead-generation",
    { partnerApplicationsWriteEnabled: true },
  );

  assert.equal(result.technicalReady, false);
  assert.deepEqual(
    result.checks.find(
      (check) => check.code === "partner-applications-write-disabled-until-b4",
    ),
    {
      code: "partner-applications-write-disabled-until-b4",
      ok: false,
      summary: "合作申请写能力已开启，但协议、资质与审计闭环尚未完成",
      facts: {
        capability: "partner-applications-write",
        requiredClosure: "B4",
      },
    },
  );
});

test("发布前门禁把当前服务端重新验证失败视为阻断", async () => {
  const result = await runReleasePreflight(
    createFakeDatabase(),
    async (pageKey) => pageKey === "products"
      ? {
          valid: false,
          errors: ["测试错误，不应出现在门禁输出"],
          issues: [{ code: "page-validation-test", severity: "error" }],
        }
      : { valid: true, errors: [], issues: [] },
    passingMigrationIntegrityCheck,
    "lead-generation",
  );

  assert.equal(result.technicalReady, false);
  const productsCheck = result.checks.find(
    (check) => check.code === "page-products-published-current",
  );
  assert.equal(productsCheck?.ok, false);
  assert.deepEqual(productsCheck?.facts, {
    revisionId: 103,
    version: 3,
    errorCount: 1,
    issueCodes: ["page-validation-test"],
  });
  assert.doesNotMatch(JSON.stringify(result), /测试错误，不应出现在门禁输出/);
});

test("发布前门禁与 Public 一致，只验证 publishedRevisionId 指向的同页面快照", async () => {
  const database = createFakeDatabase();
  const originalFindFirst = database.pageDocumentRevision.findFirst;
  const revisionQueries: unknown[] = [];
  database.pageDocumentRevision.findFirst = async (args: unknown) => {
    revisionQueries.push(structuredClone(args));
    return originalFindFirst(args);
  };

  const result = await runReleasePreflight(
    database,
    async () => ({ valid: true, errors: [], issues: [] }),
    passingMigrationIntegrityCheck,
    "lead-generation",
    { configuredClientPublicSiteOrigin: "https://example.invalid" },
  );

  assert.equal(result.technicalReady, true);
  assert.equal(revisionQueries.length, RELEASE_PAGE_KEYS.length);
  assert.deepEqual(revisionQueries[0], {
    where: { id: 101, documentId: 1, status: "published" },
    select: { id: true, version: true, puckData: true, metadata: true },
  });
  assert.equal(
    revisionQueries.some((query: any) => query.orderBy),
    false,
  );
  assert.deepEqual(
    result.checks.find((check) => check.code === "page-home-published-current")?.facts,
    { revisionId: 101, version: 3, errorCount: 0, issueCodes: [] },
  );
});

test("发布前门禁失败关闭空指针与跨页面或悬空指针", async () => {
  const validatedPageKeys: string[] = [];
  const result = await runReleasePreflight(
    createFakeDatabase({
      missingPointerPageKey: "home",
      danglingPointerPageKey: "about",
    }),
    async (pageKey) => {
      validatedPageKeys.push(pageKey);
      return { valid: true, errors: [], issues: [] };
    },
    passingMigrationIntegrityCheck,
    "lead-generation",
  );

  assert.equal(result.technicalReady, false);
  assert.equal(
    result.checks.find((check) => check.code === "page-home-published-current")?.summary,
    "home 缺少线上版本指针",
  );
  assert.deepEqual(
    result.checks.find((check) => check.code === "page-about-published-current"),
    {
      code: "page-about-published-current",
      ok: false,
      summary: "about 线上版本指针无效",
      facts: { publishedRevisionId: 102 },
    },
  );
  assert.equal(validatedPageKeys.includes("home"), false);
  assert.equal(validatedPageKeys.includes("about"), false);
});

const legacyMigrationName = "20260824115000_add_product_publication_quality";
const repositorySha = "8d8c49582be821a458404abeabb2c1f9bd0039149d82d34154a228c9f17f5c3a";
const ledgerSha = "7afed2a64fb53d0064cf60c3bf8415f82bbe9261e4f98a2201804d1cd21d21de";
const migrationPolicy = {
  schemaVersion: 1,
  exceptions: [{
    migrationName: legacyMigrationName,
    repositorySha256: repositorySha,
    appliedLedgerSha256: ledgerSha,
    schemaContract: {
      table: "products",
      columns: [{
        name: "publication_quality_status",
        columnType: "enum('quarantined','ready')",
        nullable: false,
        default: "QUARANTINED",
      }],
      index: {
        name: "products_publication_quality_idx",
        columns: ["status", "visibility", "publication_quality_status"],
      },
    },
  }],
};

test("migration 门禁只在哈希对和结构签认同时匹配时接受遗留例外", () => {
  const result = evaluateMigrationIntegrity({
    repositoryMigrations: new Map([[legacyMigrationName, repositorySha]]),
    ledgerRows: [{
      migrationName: legacyMigrationName,
      checksum: ledgerSha,
      finishedAt: new Date("2026-08-24T14:27:47.598Z"),
    }],
    policy: migrationPolicy,
    exceptionSchemaMatches: new Map([[legacyMigrationName, true]]),
  });

  assert.equal(result.ok, true);
  assert.equal(result.facts?.acceptedExceptionCount, 1);
});

test("migration 门禁拒绝未知校验和漂移", () => {
  const result = evaluateMigrationIntegrity({
    repositoryMigrations: new Map([[legacyMigrationName, repositorySha]]),
    ledgerRows: [{
      migrationName: legacyMigrationName,
      checksum: "a".repeat(64),
      finishedAt: new Date("2026-08-24T14:27:47.598Z"),
    }],
    policy: migrationPolicy,
    exceptionSchemaMatches: new Map(),
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.facts?.issueCodes, ["UNKNOWN_CHECKSUM_MISMATCH"]);
});

test("migration 门禁拒绝签认结构不匹配和待执行 migration", () => {
  const pendingName = "20260825215500_add_release_foundation_schema";
  const result = evaluateMigrationIntegrity({
    repositoryMigrations: new Map([
      [legacyMigrationName, repositorySha],
      [pendingName, "b".repeat(64)],
    ]),
    ledgerRows: [{
      migrationName: legacyMigrationName,
      checksum: ledgerSha,
      finishedAt: new Date("2026-08-24T14:27:47.598Z"),
    }],
    policy: migrationPolicy,
    exceptionSchemaMatches: new Map([[legacyMigrationName, false]]),
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.facts?.issueCodes, [
    "ATTESTED_SCHEMA_MISMATCH",
    "PENDING_MIGRATION",
  ]);
  assert.deepEqual(result.facts?.affectedMigrations, [
    legacyMigrationName,
    pendingName,
  ]);
});
