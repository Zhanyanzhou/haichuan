import * as assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const releaseFoundationMigration = readFileSync(
  "prisma/migrations/20260825215500_add_release_foundation_schema/migration.sql",
  "utf8",
);
const productMediaMigration = readFileSync(
  "prisma/migrations/20260824230000_add_product_media_asset_compatibility/migration.sql",
  "utf8",
);
const productQualityMigration = readFileSync(
  "prisma/migrations/20260824115000_add_product_publication_quality/migration.sql",
  "utf8",
);
const pageController = readFileSync("src/modules/page-modules/page-modules.controller.ts", "utf8");
const formalMigrationChain = [
  productQualityMigration,
  productMediaMigration,
  releaseFoundationMigration,
].join("\n");

test("P0 Schema 覆盖共享合同且继续引用既有价格、库存和页面事实根", () => {
  for (const model of [
    "ProductTranslation", "CategoryTranslation", "MediaAsset", "MediaVariant",
    "AdminRefreshSession", "CustomerRefreshSession", "ConsentRecord",
    "Notification", "NotificationDelivery", "NotificationPreference", "OutboxEvent",
    "PageDocumentLocalization", "PartnerPriceApplication", "PartnerPriceAgreement",
    "CooperationDesignFileVersion", "QuotationVersion", "PaymentPlan",
    "LogisticsEvent", "SeoSnapshot",
  ]) {
    assert.match(schema, new RegExp(`model ${model} \\{`));
  }
  assert.match(schema, /ProductSKU[\s\S]*price\s+Decimal/);
  assert.match(schema, /model Inventory \{/);
  assert.match(schema, /document\s+PageDocument\s+@relation/);
  assert.match(schema, /mediaAssetId\s+Int\?\s+@map\("media_asset_id"\)/);
  assert.match(
    schema,
    /mediaAsset\s+MediaAsset\?\s+@relation\(fields: \[mediaAssetId\], references: \[id\], onDelete: SetNull\)/,
  );
});

test("正式发布基础 migration 保持前向且 zh-CN 回填可重复", () => {
  const backfillStatements = releaseFoundationMigration
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => {
      const insertIndex = statement.indexOf("INSERT INTO ");
      return insertIndex === -1 ? "" : statement.slice(insertIndex).trim();
    })
    .filter(Boolean);
  const expectedBackfills = [
    {
      target: "product_translations",
      source: "FROM `products` p",
      idempotency: "ON DUPLICATE KEY UPDATE `product_id` = VALUES(`product_id`)",
    },
    {
      target: "category_translations",
      source: "FROM `categories` c",
      idempotency: "ON DUPLICATE KEY UPDATE `category_id` = VALUES(`category_id`)",
    },
    {
      target: "page_document_localizations",
      source: "FROM `page_documents` d",
      idempotency: "ON DUPLICATE KEY UPDATE `document_id` = VALUES(`document_id`)",
    },
  ];

  assert.equal(backfillStatements.length, expectedBackfills.length);
  for (const expected of expectedBackfills) {
    const statement = backfillStatements.find((candidate) =>
      candidate.startsWith(`INSERT INTO \`${expected.target}\` (`),
    );
    assert.ok(statement, `缺少 ${expected.target} 正式回填`);
    assert.ok(statement.includes(expected.source), `${expected.target} 回填来源不正确`);
    assert.ok(statement.endsWith(expected.idempotency), `${expected.target} 回填必须保持幂等`);
  }

  for (const migration of [productMediaMigration, releaseFoundationMigration]) {
    assert.doesNotMatch(migration, /\b(?:DELETE FROM|DROP TABLE|TRUNCATE TABLE)\b/i);
  }
});

test("媒体资产兼容由正式前置 migration 提供且不在发布基础 migration 重复创建", () => {
  assert.match(productMediaMigration, /CREATE TABLE `media_assets` \(/);
  assert.match(
    productMediaMigration,
    /ALTER TABLE `product_images`\s+ADD COLUMN `media_asset_id` INTEGER NULL;/,
  );
  assert.match(
    productMediaMigration,
    /CONSTRAINT `product_images_media_asset_id_fkey`[\s\S]*REFERENCES `media_assets`\(`id`\)/,
  );
  assert.doesNotMatch(releaseFoundationMigration, /CREATE TABLE `media_assets` \(/);
});

test("正式 migration 的 MySQL 标识符不超过 64 字符", () => {
  const identifiers = [...formalMigrationChain.matchAll(/`([^`]+)`/g)]
    .map((match) => match[1]);
  const tooLong = [...new Set(identifiers.filter((identifier) => identifier.length > 64))];
  assert.deepEqual(tooLong, []);
});

test("商品发布质量迁移保持最小边界且不在共享大迁移重复执行", () => {
  assert.match(productQualityMigration, /ALTER TABLE `products`/);
  assert.match(productQualityMigration, /publication_quality_status/);
  assert.match(productQualityMigration, /DEFAULT 'QUARANTINED'/);
  assert.match(productQualityMigration, /products_publication_quality_idx/);
  assert.doesNotMatch(
    productQualityMigration,
    /\b(?:INSERT|UPDATE|DELETE|DROP|TRUNCATE|CREATE TABLE)\b/i,
  );
  assert.doesNotMatch(releaseFoundationMigration, /publication_quality_status/);
});

test("EDITOR 不能调用发布接口，发布只允许 ADMIN 与 SUPER_ADMIN", () => {
  assert.match(
    pageController,
    /@Roles\("SUPER_ADMIN", "ADMIN"\)\s+@Put\("document\/publish"\)/,
  );
});

test("后台完整发布快照保持登录与角色守卫，公开端不能读取内部元数据", () => {
  assert.match(
    pageController,
    /@UseGuards\(JwtAuthGuard, RolesGuard\)\s+@ApiBearerAuth\(\)\s+@Get\("document\/published\/admin"\)/,
  );
});
