// 公开咨询隐私同意 —— 静态契约测试
// 运行：node scripts/verify-inquiry-privacy-consent.mjs
// 该脚本不连接数据库、不创建任何真实咨询记录。

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readSrc = (rel) => readFile(path.join(root, rel), "utf8");
const [
  inquiryDto,
  inquiryService,
  selectionDto,
  selectionController,
  selectionService,
  schema,
  auditMigration,
  hashMigration,
  contact,
  selectionTray,
  inquiryClient,
  selectionClient,
  serverConsent,
  clientConsent,
  privacyPage,
  legalEntity,
] = await Promise.all([
  readSrc("server/src/modules/inquiries/dto/create-inquiry.dto.ts"),
  readSrc("server/src/modules/inquiries/inquiries.service.ts"),
  readSrc("server/src/modules/selection-inquiry/dto/create-selection-inquiry.dto.ts"),
  readSrc("server/src/modules/selection-inquiry/selection-inquiry.controller.ts"),
  readSrc("server/src/modules/selection-inquiry/selection-inquiry.service.ts"),
  readSrc("server/prisma/schema.prisma"),
  readSrc("server/prisma/migrations/20260816110000_add_inquiry_privacy_consent_audit/migration.sql"),
  readSrc("server/prisma/migrations/20260923120000_add_service_privacy_consent_hashes/migration.sql"),
  readSrc("client/src/pages/public/Contact/index.tsx"),
  readSrc("client/src/pages/public/Catalog/SelectionTray.tsx"),
  readSrc("client/src/services/clients/inquiriesClient.ts"),
  readSrc("client/src/services/clients/selectionInquiryClient.ts"),
  readSrc("server/src/common/privacy/privacy-consent.ts"),
  readSrc("client/src/config/privacyConsent.ts"),
  readSrc("client/src/pages/public/Privacy/index.tsx"),
  readSrc("client/src/config/legalEntity.ts"),
]);

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
  );
};

const source = (value) => value.replace(/\r\n/g, "\n");
const legalEntityName = /export const LEGAL_ENTITY\s*=\s*\{[\s\S]*?\bname:\s*"([^"]{1,200})"/.exec(legalEntity)?.[1];
assert.ok(legalEntityName, "经营主体名称必须可从单一事实源读取");
const title = "隐私说明 | 海川珠宝";
const description = "海川珠宝隐私说明：收集的信息类型、用途、保存原则与您的查询、更正、删除权利。";
const projection = {
  key: "privacy",
  path: "/privacy",
  alternateKey: "legal:privacy",
  title,
  description,
  renderedBodyHtml: `<main data-public-seo-projection="true"><h1>${title}</h1><p>${description}</p></main>`,
};
const expectedContentHash = createHash("sha256")
  .update(JSON.stringify(canonicalize({
    version: "public-legal-source-v1",
    legalEntity: source(legalEntity),
    page: source(privacyPage),
    projection,
  })))
  .digest("hex");
const readConsentHash = (value) =>
  /PRIVACY_CONSENT_CONTENT_HASH\s*=\s*[\r\n\s]*"([a-f0-9]{64})"/.exec(value)?.[1];
const readConsentVersion = (value) =>
  /PRIVACY_CONSENT_VERSION\s*=\s*"([^"]{1,50})"/.exec(value)?.[1];

const checks = [
  ["普通咨询 DTO 要求精确 true，且避免 Boolean 隐式转换", () => {
    assert.match(inquiryDto, /privacyConsent!:\s*unknown/);
    assert.match(inquiryDto, /@IsDefined/);
    assert.match(inquiryDto, /@Equals\(true/);
  }],
  ["选款咨询使用 DTO 而非行内未校验 body", () => {
    assert.match(selectionController, /@Body\(\)\s+body:\s*CreateSelectionInquiryDto/);
    assert.match(selectionDto, /privacyConsent!:\s*unknown/);
    assert.match(selectionDto, /@Equals\(true/);
  }],
  ["两条服务均保留精确 true 的终线守卫", () => {
    assert.match(inquiryService, /data\.privacyConsent\s*!==\s*true/);
    assert.match(selectionService, /data\.privacyConsent\s*!==\s*true/);
  }],
  ["前后端提交并核对同一份当前隐私正文哈希", () => {
    assert.equal(readConsentHash(serverConsent), expectedContentHash);
    assert.equal(readConsentHash(clientConsent), expectedContentHash);
    assert.equal(readConsentVersion(serverConsent), "privacy-v2");
    assert.equal(readConsentVersion(clientConsent), readConsentVersion(serverConsent));
    for (const dto of [inquiryDto, selectionDto]) {
      assert.match(dto, /privacyConsentVersion!:\s*string/);
      assert.match(dto, /privacyConsentContentHash!:\s*string/);
      assert.match(dto, /\^\[a-f0-9\]\{64\}\$/);
    }
    for (const service of [inquiryService, selectionService]) {
      assert.match(
        service,
        /data\.privacyConsentContentHash\s*!==\s*PRIVACY_CONSENT_CONTENT_HASH/,
      );
    }
    assert.match(inquiryClient, /privacyConsentVersion:\s*PRIVACY_CONSENT_VERSION/);
    assert.match(inquiryClient, /privacyConsentContentHash:\s*PRIVACY_CONSENT_CONTENT_HASH/);
    assert.match(selectionClient, /privacyConsentVersion:\s*PRIVACY_CONSENT_VERSION/);
    assert.match(selectionClient, /privacyConsentContentHash:\s*PRIVACY_CONSENT_CONTENT_HASH/);
  }],
  ["两条写入均由服务端盖版本与时间", () => {
    for (const source of [inquiryService, selectionService]) {
      assert.match(source, /privacyConsentVersion:\s*PRIVACY_CONSENT_VERSION/);
      assert.match(source, /privacyConsentHash:\s*PRIVACY_CONSENT_CONTENT_HASH/);
      assert.match(source, /policyContentHash:\s*PRIVACY_CONSENT_CONTENT_HASH/);
      assert.match(
        source,
        /privacyConsentedAt(?::\s*new Date\(\)|\s*=\s*new Date\(\)[\s\S]*?privacyConsentedAt,)/,
      );
    }
  }],
  ["两张表与迁移包含审计字段，迁移不倒填历史记录", () => {
    assert.equal((schema.match(/privacy_consent_version/g) || []).length >= 2, true);
    assert.equal((schema.match(/privacy_consent_hash/g) || []).length, 2);
    assert.equal((schema.match(/policy_content_hash/g) || []).length, 1);
    assert.match(auditMigration, /ALTER TABLE `inquiries`/);
    assert.match(auditMigration, /ALTER TABLE `selection_inquiries`/);
    assert.match(hashMigration, /ALTER TABLE `inquiries`/);
    assert.match(hashMigration, /ALTER TABLE `selection_inquiries`/);
    assert.match(hashMigration, /ALTER TABLE `consent_records`/);
    assert.doesNotMatch(auditMigration, /UPDATE\s+`?(inquiries|selection_inquiries)`?/i);
    assert.doesNotMatch(hashMigration, /UPDATE\s+`?(inquiries|selection_inquiries|consent_records)`?/i);
  }],
  ["两个公开表单都实际传递勾选值", () => {
    assert.match(contact, /privacyConsent:\s*form\.privacyConsent/);
    assert.match(selectionTray, /privacyConsent:\s*form\.privacyConsent/);
  }],
];

let failed = 0;
for (const [name, run] of checks) {
  try {
    run();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${error.message}`);
  }
}
if (failed) process.exit(1);
console.log(`\n${checks.length} 项通过；该测试未连接数据库，也未提交任何表单。`);
