import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migrationPath = resolve(
  process.cwd(),
  "prisma/migrations/20260922120000_backfill_inquiry_reply_activities/migration.sql",
);
const schemaPath = resolve(process.cwd(), "prisma/schema.prisma");

test("历史普通咨询回复只回填到对应 INQUIRY Lead 的缺失 REPLY 活动", () => {
  const sql = readFileSync(migrationPath, "utf8");

  assert.match(sql, /INSERT INTO `lead_activities`/);
  assert.match(sql, /l\.`source_type` = 'INQUIRY'/);
  assert.match(sql, /l\.`inquiry_id` = i\.`id`/);
  assert.match(sql, /l\.`selection_inquiry_id` IS NULL/);
  assert.match(sql, /NULLIF\(TRIM\(i\.`reply`\), ''\) IS NOT NULL/);
  assert.match(
    sql,
    /NOT EXISTS \([\s\S]*existing_reply\.`lead_id` = l\.`id`[\s\S]*existing_reply\.`type` = 'REPLY'[\s\S]*\)/,
  );
  assert.doesNotMatch(sql, /FROM `selection_inquiries`/);
});

test("历史回复回填使用当前活动合同并可安全重跑", () => {
  const sql = readFileSync(migrationPath, "utf8");
  const schema = readFileSync(schemaPath, "utf8");

  assert.match(sql, /TRIM\(i\.`reply`\)/);
  assert.match(sql, /NULL,[\s\S]*SHA2\(CONCAT\('legacy-inquiry-reply:', i\.`id`\), 256\)/);
  assert.match(sql, /COALESCE\(i\.`replied_at`, i\.`updated_at`\)/);
  assert.match(
    sql,
    /ON DUPLICATE KEY UPDATE\s+`idempotency_key_hash` = VALUES\(`idempotency_key_hash`\)/,
  );
  assert.doesNotMatch(sql, /\b(?:ALTER|CREATE|DROP|DELETE|UPDATE)\s+(?:TABLE\s+)?`?(?:inquiries|leads|selection_inquiries)`?/i);

  assert.match(schema, /enum LeadActivityType \{[\s\S]*\bREPLY\b[\s\S]*\}/);
  assert.match(schema, /createdBy\s+Int\?\s+@map\("created_by"\)/);
  assert.match(schema, /idempotencyKeyHash\s+String\?\s+@unique\s+@map\("idempotency_key_hash"\)\s+@db\.Char\(64\)/);
  assert.match(schema, /createdAt\s+DateTime\s+@default\(now\(\)\)\s+@map\("created_at"\)/);
});
