// 公开咨询隐私同意 —— 静态契约测试
// 运行：node scripts/verify-inquiry-privacy-consent.mjs
// 该脚本不连接数据库、不创建任何真实咨询记录。

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readSrc = (rel) => readFile(path.join(root, rel), "utf8");
const [inquiryDto, inquiryService, selectionDto, selectionController, selectionService, schema, migration, contact, selectionTray] = await Promise.all([
  readSrc("server/src/modules/inquiries/dto/create-inquiry.dto.ts"),
  readSrc("server/src/modules/inquiries/inquiries.service.ts"),
  readSrc("server/src/modules/selection-inquiry/dto/create-selection-inquiry.dto.ts"),
  readSrc("server/src/modules/selection-inquiry/selection-inquiry.controller.ts"),
  readSrc("server/src/modules/selection-inquiry/selection-inquiry.service.ts"),
  readSrc("server/prisma/schema.prisma"),
  readSrc("server/prisma/migrations/20260816110000_add_inquiry_privacy_consent_audit/migration.sql"),
  readSrc("client/src/pages/public/Contact/index.tsx"),
  readSrc("client/src/pages/public/Catalog/SelectionTray.tsx"),
]);

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
  ["两条写入均由服务端盖版本与时间", () => {
    for (const source of [inquiryService, selectionService]) {
      assert.match(source, /privacyConsentVersion:\s*PRIVACY_CONSENT_VERSION/);
      assert.match(
        source,
        /privacyConsentedAt(?::\s*new Date\(\)|\s*=\s*new Date\(\)[\s\S]*?privacyConsentedAt,)/,
      );
    }
  }],
  ["两张表与迁移包含审计字段，迁移不倒填历史记录", () => {
    assert.equal((schema.match(/privacy_consent_version/g) || []).length >= 2, true);
    assert.match(migration, /ALTER TABLE `inquiries`/);
    assert.match(migration, /ALTER TABLE `selection_inquiries`/);
    assert.doesNotMatch(migration, /UPDATE\s+`?(inquiries|selection_inquiries)`?/i);
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
