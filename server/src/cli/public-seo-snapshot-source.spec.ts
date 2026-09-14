import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  CONTENT_TEMPLATE_PUBLICATION_METADATA_KEY,
  createContentTemplatePublicationAttestation,
} from "../modules/page-modules/generated/contentTemplates.generated";
import {
  createPageLocaleContentHash,
  withPageLocaleRevisionMetadata,
} from "../modules/page-modules/page-document-localization";
import { createPublicSeoExportConfig } from "./export-public-seo-snapshot";
import { verifyTargetDatabaseAccess } from "./target-database-audit";
import {
  createPublicSeoExportInput,
  PublicSeoSnapshotDatabase,
} from "./public-seo-snapshot-source";

const NOW = new Date("2026-09-13T08:00:00.000Z");
const PAGE_KEYS = ["home", "products", "catalog", "custom", "about", "contact"];
const LEGAL_SOURCE_HASHES = {
  privacy: "6".repeat(64),
  businessInfo: "7".repeat(64),
};

function canonicalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value as Record<string, unknown>).sort().map((key) => [
      key,
      canonicalize((value as Record<string, unknown>)[key]),
    ]),
  );
}

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function localization(documentId: number, pageKey: string, locale: "zh-CN" | "en") {
  const puckData = {
    content: [{ type: "首屏主视觉", props: { title: `${pageKey}-${locale}`, description: `published ${locale} content` } }],
    root: {},
    zones: {},
  };
  const publicMetadata = {
    seoTitle: `${pageKey} ${locale}`,
    seoDescription: `${pageKey} ${locale} published description`,
    ogImage: `/images/${pageKey}-${locale}.jpg`,
  };
  const contentHash = createPageLocaleContentHash(puckData, publicMetadata);
  const metadata = withPageLocaleRevisionMetadata({
    ...publicMetadata,
    [CONTENT_TEMPLATE_PUBLICATION_METADATA_KEY]: createContentTemplatePublicationAttestation(),
  }, locale, contentHash, {
    submittedBy: 10,
    submittedAt: new Date("2026-09-12T08:00:00.000Z"),
    reviewedBy: 20,
    reviewedAt: new Date("2026-09-12T09:00:00.000Z"),
  });
  const id = documentId * 10 + (locale === "en" ? 2 : 1);
  return {
    locale: locale === "en" ? "EN" : "ZH_CN",
    reviewStatus: "PUBLISHED",
    publishedRevisionId: id,
    publishedHash: contentHash,
    publishedAt: new Date("2026-09-12T10:00:00.000Z"),
    publishedRevision: {
      id,
      documentId,
      version: 1,
      puckData,
      metadata,
      status: "published",
      publishedAt: new Date("2026-09-12T10:00:00.000Z"),
      createdAt: new Date("2026-09-12T10:00:00.000Z"),
      mediaAssets: [],
    },
  };
}

function documents(includeEnglish = false) {
  return PAGE_KEYS.map((pageKey, index) => ({
    id: index + 1,
    pageKey,
    localizations: [
      localization(index + 1, pageKey, "zh-CN"),
      ...(includeEnglish && ["home", "products", "custom", "about"].includes(pageKey)
        ? [localization(index + 1, pageKey, "en")]
        : []),
    ],
  }));
}

function settings(includeEnglish = false) {
  return {
    key: "site",
    version: 7,
    updatedAt: new Date("2026-09-12T11:00:00.000Z"),
    value: {
      siteName: "Haichuan Jewelry",
      canonicalBaseUrl: "https://shop.example.invalid",
      seoReviewReference: "seo-approved-7",
      legalEntityReviewReference: `legal-approved-4|sha256:${LEGAL_SOURCE_HASHES.businessInfo}`,
      privacyPolicyReviewReference: `privacy-v2-approved|sha256:${LEGAL_SOURCE_HASHES.privacy}`,
      defaultLocale: "zh-CN",
      publishedLocales: includeEnglish ? ["zh-CN", "en"] : ["zh-CN"],
    },
  };
}

function database(options: { includeEnglish?: boolean; products?: any[]; secondSettings?: any } = {}) {
  const calls: string[] = [];
  let settingsRead = 0;
  return {
    calls,
    value: {
      siteSetting: {
        findUnique: async () => {
          calls.push("siteSetting.findUnique");
          settingsRead += 1;
          return structuredClone(settingsRead === 2 && options.secondSettings ? options.secondSettings : settings(options.includeEnglish));
        },
      },
      pageDocument: {
        findMany: async () => {
          calls.push("pageDocument.findMany");
          return structuredClone(documents(options.includeEnglish));
        },
      },
      product: {
        findMany: async () => {
          calls.push("product.findMany");
          return structuredClone(options.products ?? []);
        },
      },
    } as PublicSeoSnapshotDatabase,
  };
}

const config = {
  sourceStage: "production" as const,
  expectedOrigin: "https://shop.example.invalid",
  sourceEnvironmentId: "public-seo-production",
  expectedDatabase: "jewelry_production",
  databaseHostHash: "b".repeat(64),
  approvalReferenceHash: "a".repeat(64),
  releaseProfile: "lead-generation" as const,
  legalSourceHashes: LEGAL_SOURCE_HASHES,
  legalEntityName: "深圳市海川文化创意设计有限公司",
};
const validatePage = async () => ({ valid: true });

function qualityHash(product: any) {
  return hash({
    version: "p0-product-quality-v1",
    code: product.code,
    name: product.name,
    shortDescription: product.shortDescription,
    description: product.description,
    detailContent: product.detailContent,
    materialType: product.materialType,
    goldWeight: product.goldWeight == null ? null : String(product.goldWeight),
    weight: product.weight == null ? null : String(product.weight),
    salesMode: product.salesMode,
    inventoryPolicy: product.inventoryPolicy,
    primaryImageId: product.primaryImage?.id ?? null,
    listingImageId: product.listingImage?.id ?? null,
    imageIds: product.images.map((image: any) => image.id).sort((a: number, b: number) => a - b),
    skus: product.skus
      .filter((sku: any) => sku.isActive)
      .map((sku: any) => ({
        id: sku.id,
        price: String(sku.price),
        goldWeight: sku.goldWeight == null ? null : String(sku.goldWeight),
        inventoryRecords: sku.inventories.length,
      })),
  });
}

function product() {
  const value: any = {
    id: 91,
    code: "HC-RING-01",
    name: "海川素圈戒指",
    shortDescription: "经核验的公开商品简介",
    description: "内部质量门禁使用但不会进入 SEO 导出制品的完整商品说明",
    detailContent: { privateQualityInput: "not-public" },
    materialType: "GOLD_999",
    goldWeight: "8.20",
    weight: "8.20",
    salesMode: "DISPLAY_ONLY",
    inventoryPolicy: "STANDARD",
    status: "PUBLISHED",
    visibility: "PUBLIC",
    publicationQualityStatus: "READY",
    publicationQualityHash: "",
    publishedAt: new Date("2026-09-10T00:00:00.000Z"),
    updatedAt: new Date("2026-09-12T00:00:00.000Z"),
    deletedAt: null,
    category: { isActive: true, deletedAt: null },
    primaryImage: {
      id: 401,
      productId: 91,
      isVideo: false,
      storageKey: "private/path-must-not-leak.jpg",
      mediaAsset: {
        id: 801,
        status: "READY",
        accessLevel: "PUBLIC",
        authorization: {
          revision: 3,
          publicUseEpoch: 2,
          reviewStatus: "APPROVED",
          revocationStatus: "ACTIVE",
          publicWebUseAllowed: true,
          validFrom: new Date("2026-01-01T00:00:00.000Z"),
          validUntil: null,
        },
      },
    },
    listingImage: { id: 402 },
    images: [{ id: 401 }, { id: 402 }],
    skus: [{ id: 501, isActive: true, price: "9999", goldWeight: "8.20", inventories: [{ quantity: 1 }] }],
    translations: [],
  };
  value.publicationQualityHash = qualityHash(value);
  return value;
}

test("producer 只读取显式 locale 发布 revision，并生成六个中文页面", async () => {
  const fake = database();
  const result = await createPublicSeoExportInput(fake.value, config, validatePage, NOW);
  assert.equal(result.routes.length, 8);
  assert.deepEqual(result.routes.map((route) => route.path).sort(), [
    "/", "/about", "/business-info", "/catalog", "/contact", "/custom", "/privacy", "/products",
  ]);
  assert.equal(result.routes.filter((route) => route.kind === "legal").length, 2);
  assert.ok(result.routes.every((route) => route.contentHashBefore === route.contentHashAfter));
  assert.deepEqual(fake.calls, [
    "siteSetting.findUnique", "pageDocument.findMany", "product.findMany",
    "siteSetting.findUnique", "pageDocument.findMany", "product.findMany",
  ]);
});

test("静态 SEO 正文只使用已审核 SEO 字段，不收集隐藏或内部 Puck 文案", async () => {
  const fake = database();
  const rows = await fake.value.pageDocument.findMany({});
  rows[0].localizations[0].publishedRevision.puckData.content[0].props.internal = {
    name: "供应商内部备注不得公开",
  };
  rows[0].localizations[0].publishedRevision.puckData.content[0].props.subtitle = "网站内容正在完善。";
  rows[0].localizations[0].publishedRevision.puckData.content[0].props.__instanceOverrides = {
    nodes: { subtitle: { enabled: false } },
  };
  const localizationRow = rows[0].localizations[0];
  const publicMetadata = {
    seoTitle: "home zh-CN",
    seoDescription: "home zh-CN published description",
    ogImage: "/images/home-zh-CN.jpg",
  };
  const contentHash = createPageLocaleContentHash(localizationRow.publishedRevision.puckData, publicMetadata);
  localizationRow.publishedHash = contentHash;
  localizationRow.publishedRevision.metadata = withPageLocaleRevisionMetadata({
    ...publicMetadata,
    [CONTENT_TEMPLATE_PUBLICATION_METADATA_KEY]: createContentTemplatePublicationAttestation(),
  }, "zh-CN", contentHash, {
    submittedBy: 10,
    submittedAt: new Date("2026-09-12T08:00:00.000Z"),
    reviewedBy: 20,
    reviewedAt: new Date("2026-09-12T09:00:00.000Z"),
  });
  fake.value.pageDocument.findMany = async () => structuredClone(rows);
  const result = await createPublicSeoExportInput(fake.value, config, validatePage, NOW);
  const serialized = JSON.stringify(result.routes.find((route) => route.path === "/"));
  assert.doesNotMatch(serialized, /供应商内部备注不得公开|网站内容正在完善/);
});

test("只有完整且独立审核的四个英文页面才能进入快照", async () => {
  const result = await createPublicSeoExportInput(database({ includeEnglish: true }).value, config, validatePage, NOW);
  assert.equal(result.routes.filter((route) => route.locale === "en").length, 4);
  assert.ok(result.routes.some((route) => route.path === "/en/about"));

  const incomplete = database({ includeEnglish: true });
  const rows = await incomplete.value.pageDocument.findMany({});
  rows.find((entry) => entry.pageKey === "about").localizations = rows.find((entry) => entry.pageKey === "about").localizations.filter((entry: any) => entry.locale !== "EN");
  incomplete.value.pageDocument.findMany = async () => structuredClone(rows);
  await assert.rejects(() => createPublicSeoExportInput(incomplete.value, config, validatePage, NOW), /ENGLISH_PUBLISHED_PAGE_SET_INCOMPLETE/);
});

test("草稿、缺失审核、中文 fallback 与 hash 漂移均失败关闭", async () => {
  for (const mutate of [
    (row: any) => { row.reviewStatus = "DRAFT"; },
    (row: any) => { row.publishedRevision.metadata.__pageLocaleRevision.reviewedBy = null; },
    (row: any) => { row.publishedHash = "0".repeat(64); },
  ]) {
    const fake = database();
    const rows = await fake.value.pageDocument.findMany({});
    mutate(rows[0].localizations[0]);
    fake.value.pageDocument.findMany = async () => structuredClone(rows);
    await assert.rejects(() => createPublicSeoExportInput(fake.value, config, validatePage, NOW), /PUBLIC_SEO_EXPORT_PAGE_/);
  }
  const fallback = database();
  const rows = await fallback.value.pageDocument.findMany({});
  rows[0].localizations = [];
  fallback.value.pageDocument.findMany = async () => structuredClone(rows);
  await assert.rejects(() => createPublicSeoExportInput(fallback.value, config, validatePage, NOW), /NOT_PUBLISHED/);
});

test("商品投影重算质量 hash、要求公开主图授权且不泄漏内部字段", async () => {
  const value = product();
  value.skus.push({
    id: 502,
    isActive: false,
    price: "888888",
    goldWeight: "999.99",
    inventories: [{ quantity: 999 }],
  });
  const result = await createPublicSeoExportInput(database({ products: [value] }).value, config, validatePage, NOW);
  const route = result.routes.find((entry) => entry.kind === "product");
  assert.equal(route?.path, "/products/HC-RING-01");
  assert.equal(route?.shareImage, "https://shop.example.invalid/api/products/public/91/media/401");
  const serialized = JSON.stringify(route);
  assert.doesNotMatch(serialized, /privateQualityInput|storageKey|9999|inventor/i);

  value.publicationQualityHash = "0".repeat(64);
  await assert.rejects(() => createPublicSeoExportInput(database({ products: [value] }).value, config, validatePage, NOW), /QUALITY_HASH_DRIFT/);
});

test("当前页面校验器或商品分类不满足发布资格时失败关闭", async () => {
  await assert.rejects(
    () => createPublicSeoExportInput(database().value, config, async () => ({ valid: false }), NOW),
    /CURRENT_VALIDATION_FAILED/,
  );

  for (const mutate of [
    (value: any) => { value.category.isActive = false; },
    (value: any) => { value.category.deletedAt = new Date("2026-09-11T00:00:00.000Z"); },
    (value: any) => { value.category = null; },
  ]) {
    const value = product();
    mutate(value);
    await assert.rejects(
      () => createPublicSeoExportInput(database({ products: [value] }).value, config, validatePage, NOW),
      /CATEGORY_NOT_PUBLIC/,
    );
  }
});

test("英文商品无发布审核模型，存在翻译时拒绝导出", async () => {
  const value = product();
  value.translations = [{ locale: "EN" }];
  await assert.rejects(() => createPublicSeoExportInput(database({ products: [value] }).value, config, validatePage, NOW), /ENGLISH_REVIEW_EVIDENCE_UNAVAILABLE/);
});

test("不稳定货号、缺失主图、撤销授权和不完整 SEO 均失败关闭", async () => {
  const cases: Array<[RegExp, (value: any) => void]> = [
    [/PRODUCT_CODE_UNSTABLE/, (value) => { value.code = "12345"; value.publicationQualityHash = qualityHash(value); }],
    [/PRIMARY_IMAGE_INVALID/, (value) => { value.primaryImage = null; value.publicationQualityHash = qualityHash(value); }],
    [/PRIMARY_IMAGE_NOT_PUBLIC/, (value) => { value.primaryImage.mediaAsset.authorization.revocationStatus = "REVOKED"; }],
    [/SEO_INCOMPLETE/, (value) => { value.shortDescription = ""; value.publicationQualityHash = qualityHash(value); }],
  ];
  for (const [pattern, mutate] of cases) {
    const value = product();
    mutate(value);
    await assert.rejects(
      () => createPublicSeoExportInput(database({ products: [value] }).value, config, validatePage, NOW),
      pattern,
    );
  }
});

test("来源环境、origin、法律签认和两次读取漂移均阻断", async () => {
  await assert.rejects(
    () => createPublicSeoExportInput(database().value, { ...config, expectedOrigin: "https://other.example.invalid" }, validatePage, NOW),
    /SOURCE_ORIGIN_MISMATCH/,
  );
  const missingLegal = settings();
  missingLegal.value.privacyPolicyReviewReference = "";
  const first = database();
  first.value.siteSetting.findUnique = async () => structuredClone(missingLegal);
  await assert.rejects(() => createPublicSeoExportInput(first.value, config, validatePage, NOW), /PRIVACY_POLICY_REVIEW_REFERENCE_MISSING/);

  const staleLegal = settings();
  staleLegal.value.legalEntityReviewReference = `legal-approved-4|sha256:${"8".repeat(64)}`;
  const stale = database();
  stale.value.siteSetting.findUnique = async () => structuredClone(staleLegal);
  await assert.rejects(
    () => createPublicSeoExportInput(stale.value, config, validatePage, NOW),
    /LEGAL_ENTITY_SIGNOFF_HASH_MISMATCH/,
  );

  const drift = settings();
  drift.version += 1;
  await assert.rejects(
    () => createPublicSeoExportInput(database({ secondSettings: drift }).value, config, validatePage, NOW),
    /SOURCE_FACTS_DRIFT/,
  );
});

test("CLI 配置只接受显式只读授权、目标库身份与受保护配置", () => {
  const environment = {
    PUBLIC_SEO_EXPORT_READ_ONLY_AUTHORIZED: "1",
    PUBLIC_SEO_SOURCE_STAGE: "production",
    PUBLIC_SEO_SOURCE_ENVIRONMENT_ID: "public-seo-production",
    PUBLIC_SEO_EXPECTED_DATABASE: "jewelry_production",
    PUBLIC_SEO_EXPECTED_DATABASE_HOST: "db.example.invalid",
    PUBLIC_SEO_DATABASE_TRANSPORT_HOST: "db.example.invalid",
    PUBLIC_SEO_APPROVAL_REFERENCE: "release-approval-42",
    PUBLIC_SEO_EXPECTED_ORIGIN: "https://shop.example.invalid",
    PUBLIC_SEO_RELEASE_PROFILE: "lead-generation",
    DATABASE_URL: "mysql://readonly:secret@db.example.invalid:3306/jewelry_production",
  };
  const parsed = createPublicSeoExportConfig(environment);
  assert.equal(parsed.identity.expectedDatabase, "jewelry_production");
  assert.equal(parsed.source.sourceStage, "production");
  assert.equal("DATABASE_URL" in parsed, false);
  assert.equal(JSON.stringify(parsed).includes("secret"), false);
  assert.throws(
    () => createPublicSeoExportConfig({ ...environment, PUBLIC_SEO_EXPORT_READ_ONLY_AUTHORIZED: "0" }),
    /READ_ONLY_AUTHORIZATION_REQUIRED/,
  );
  assert.throws(
    () => createPublicSeoExportConfig({ ...environment, PUBLIC_SEO_SOURCE_STAGE: "preproduction" }),
    /SOURCE_STAGE_ENVIRONMENT_MISMATCH/,
  );
  assert.throws(
    () => createPublicSeoExportConfig({ ...environment, DATABASE_URL: "mysql:\/\/writer:secret@db.example.invalid:3306/other" }),
    /DATABASE_NAME_MISMATCH/,
  );
  assert.throws(
    () => createPublicSeoExportConfig({ ...environment, DATABASE_URL: "mysql:\/\/readonly:secret@clone.example.invalid:3306/jewelry_production" }),
    /DATABASE_TRANSPORT_HOST_MISMATCH/,
  );
  const tunneled = createPublicSeoExportConfig({
    ...environment,
    PUBLIC_SEO_EXPECTED_DATABASE_HOST: "mysql.internal",
    PUBLIC_SEO_DATABASE_TRANSPORT_HOST: "127.0.0.1",
    DATABASE_URL: "mysql://readonly:secret@127.0.0.1:43306/jewelry_production",
  });
  assert.equal(
    tunneled.source.databaseHostHash,
    createHash("sha256").update("mysql.internal").digest("hex"),
  );
});

test("producer 在读取发布事实前拒绝带写权限或跨库权限的数据库账号", async () => {
  const identity = createPublicSeoExportConfig({
    PUBLIC_SEO_EXPORT_READ_ONLY_AUTHORIZED: "1",
    PUBLIC_SEO_SOURCE_STAGE: "production",
    PUBLIC_SEO_SOURCE_ENVIRONMENT_ID: "public-seo-production",
    PUBLIC_SEO_EXPECTED_DATABASE: "jewelry_production",
    PUBLIC_SEO_EXPECTED_DATABASE_HOST: "db.example.invalid",
    PUBLIC_SEO_DATABASE_TRANSPORT_HOST: "db.example.invalid",
    PUBLIC_SEO_APPROVAL_REFERENCE: "release-approval-42",
    PUBLIC_SEO_EXPECTED_ORIGIN: "https://shop.example.invalid",
    PUBLIC_SEO_RELEASE_PROFILE: "lead-generation",
    DATABASE_URL: "mysql://readonly:secret@db.example.invalid:3306/jewelry_production",
  }).identity;
  const auditDatabase = (grant: string) => ({
    async $queryRawUnsafe<T>(query: string): Promise<T> {
      if (query.includes("SELECT DATABASE()")) return [{ databaseName: "jewelry_production" }] as T;
      return [{ grant }] as T;
    },
  });
  const accepted = await verifyTargetDatabaseAccess(
    auditDatabase("GRANT SELECT, SHOW VIEW ON `jewelry_production`.* TO `seo`@`%`"),
    identity,
    "read-only",
    "PUBLIC_SEO_EXPORT",
  );
  assert.equal(accepted.grantsVerifiedReadOnly, true);
  await assert.rejects(
    () => verifyTargetDatabaseAccess(
      auditDatabase("GRANT SELECT, UPDATE ON `jewelry_production`.* TO `seo`@`%`"),
      identity,
      "read-only",
      "PUBLIC_SEO_EXPORT",
    ),
    /DATABASE_ACCOUNT_NOT_READ_ONLY/,
  );
  await assert.rejects(
    () => verifyTargetDatabaseAccess(
      auditDatabase("GRANT SELECT ON `other_database`.* TO `seo`@`%`"),
      identity,
      "read-only",
      "PUBLIC_SEO_EXPORT",
    ),
    /CROSS_DATABASE_SCOPE/,
  );
});
