import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import {
  createContentTemplatePublicationAttestation,
  CONTENT_TEMPLATE_PUBLICATION_METADATA_KEY,
} from "../modules/page-modules/content-template-contract";
import {
  evaluateMigrationIntegrity,
  parseReleaseProfile,
  RELEASE_PAGE_KEYS,
  runReleasePreflight,
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
    .map((pageKey, index) => ({ id: index + 1, pageKey }));
  const settings = options.settings === undefined
    ? {
        siteName: "海川珠宝",
        contactPhone: "test-present",
        contactEmail: "test@example.invalid",
        contactAddress: "test-present",
        businessHours: "test-present",
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
        const page = pages.find((candidate) => candidate.id === args.where.documentId);
        if (!page) return null;
        return {
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
  assert.ok(failedCodes.includes("page-home-published-current"));
  assert.ok(failedCodes.includes("page-custom-published-current"));
});

test("交易型发布档位继续要求正式直购商品，不被线索型规则削弱", async () => {
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
  );

  assert.equal(blocked.technicalReady, false);
  assert.ok(blocked.checks.some(
    (check) => check.code === "direct-purchase-assortment-present" && !check.ok,
  ));
  assert.equal(ready.technicalReady, true);
  assert.equal(ready.releaseProfile, "commerce");
});

test("发布档位默认安全选择线索型并拒绝未知值", () => {
  assert.equal(parseReleaseProfile(), "lead-generation");
  assert.equal(parseReleaseProfile("commerce"), "commerce");
  assert.throws(() => parseReleaseProfile("hybrid"), /unsupported release profile/);
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
  );

  assert.equal(result.technicalReady, false);
  const productsCheck = result.checks.find(
    (check) => check.code === "page-products-published-current",
  );
  assert.equal(productsCheck?.ok, false);
  assert.deepEqual(productsCheck?.facts, {
    version: 3,
    errorCount: 1,
    issueCodes: ["page-validation-test"],
  });
  assert.doesNotMatch(JSON.stringify(result), /测试错误，不应出现在门禁输出/);
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
