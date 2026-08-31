import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migrationPath = resolve(
  process.cwd(),
  "prisma/migrations/20260828200000_add_dynamic_template_versioning/migration.sql",
);
const fixedMarkerMigrationPath = resolve(
  process.cwd(),
  "prisma/migrations/20260829120000_add_fixed_template_versioning/migration.sql",
);
const personalRevisionMigrationPath = resolve(
  process.cwd(),
  "prisma/migrations/20260830110000_add_personal_content_template_revision/migration.sql",
);
const activationMigrationPath = resolve(
  process.cwd(),
  "prisma/migrations/20260830111000_add_dynamic_template_activations/migration.sql",
);
const schemaPath = resolve(process.cwd(), "prisma/schema.prisma");

function loadMigration(): string {
  return readFileSync(migrationPath, "utf8");
}

test("动态模板候选 migration 仅创建三张隔离新表", () => {
  const sql = loadMigration();
  const createdTables = [...sql.matchAll(/CREATE TABLE `([^`]+)`/g)].map((match) => match[1]);

  assert.deepEqual(createdTables, [
    "dynamic_templates",
    "dynamic_template_drafts",
    "dynamic_template_versions",
  ]);
  assert.doesNotMatch(sql, /\b(?:DROP TABLE|TRUNCATE TABLE|DELETE FROM|INSERT INTO|UPDATE\s+`)\b/i);
});

test("动态模板 migration 不修改旧表且外键只指向用户和新模板表", () => {
  const sql = loadMigration();
  const alteredTables = [...sql.matchAll(/ALTER TABLE `([^`]+)`/g)].map((match) => match[1]);
  const referencedTables = [...sql.matchAll(/REFERENCES `([^`]+)`/g)].map((match) => match[1]);

  assert.deepEqual(alteredTables, [
    "dynamic_templates",
    "dynamic_template_drafts",
    "dynamic_template_versions",
  ]);
  assert.deepEqual(new Set(referencedTables), new Set(["users", "dynamic_templates"]));
  assert.doesNotMatch(sql, /`(?:personal_content_templates|page_documents|page_document_revisions)`/i);
});

test("被否决的固定模板候选 migration 只保留无操作审计标记", () => {
  const sql = readFileSync(fixedMarkerMigrationPath, "utf8");
  assert.doesNotMatch(
    sql,
    /\b(?:CREATE|ALTER|DROP|TRUNCATE|DELETE|INSERT|UPDATE)\s+(?:TABLE\s+|INTO\s+|FROM\s+)?`?/i,
  );
  assert.doesNotMatch(sql, /system_content_template_(?:states|versions)/i);
});

test("个人模板 revision migration 只增加缺失列，不夹带固定模板或数据写入", () => {
  const sql = readFileSync(personalRevisionMigrationPath, "utf8");
  const alteredTables = [...sql.matchAll(/ALTER TABLE `([^`]+)`/g)].map((match) => match[1]);
  assert.deepEqual(alteredTables, ["personal_content_templates"]);
  assert.match(sql, /ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 1/i);
  assert.match(sql, /information_schema`.`COLUMNS/i);
  assert.match(sql, /@personal_template_revision_exists = 0/i);
  assert.match(sql, /PREPARE personal_template_revision_migration/i);
  assert.doesNotMatch(sql, /system_content_template_/i);
  assert.doesNotMatch(sql, /\b(?:DROP|TRUNCATE)\b|\bDELETE\s+FROM\b|\bINSERT\s+INTO\b|\bUPDATE\s+`/i);
});

test("激活 migration 只新增不可变审计幂等表，不回填或修改页面表", () => {
  const sql = readFileSync(activationMigrationPath, "utf8");
  const createdTables = [...sql.matchAll(/CREATE TABLE `([^`]+)`/g)].map((match) => match[1]);
  assert.deepEqual(createdTables, ["dynamic_template_activations"]);
  const createBody = sql.match(/CREATE TABLE `dynamic_template_activations` \(([\s\S]*?)\n\)/)?.[1] ?? "";
  const columns = [...createBody.matchAll(/^\s*`([^`]+)`\s+/gm)].map((match) => match[1]);
  assert.deepEqual(columns, [
    "id",
    "dynamic_template_id",
    "from_version",
    "to_version",
    "expected_draft_revision",
    "draft_checksum",
    "impact_hash",
    "idempotency_key_hash",
    "request_hash",
    "affected_document_count",
    "affected_draft_instance_count",
    "affected_published_instance_count",
    "affected_scheme_count",
    "affected_scheme_instance_count",
    "created_page_revision_count",
    "result_summary",
    "activated_by_id",
    "activated_at",
  ]);
  assert.match(sql, /UNIQUE INDEX `dynamic_template_activations_idempotency_key_hash_key`/);
  assert.match(sql, /UNIQUE INDEX `dynamic_template_activations_dynamic_template_id_to_version_key`/);
  assert.match(sql, /INDEX `dynamic_template_activations_template_activated_idx`/);
  const referencedTables = [...sql.matchAll(/REFERENCES `([^`]+)`/g)].map((match) => match[1]);
  assert.deepEqual(new Set(referencedTables), new Set(["users", "dynamic_templates"]));
  assert.doesNotMatch(sql, /ALTER TABLE `(?:page_documents|page_document_revisions|page_schemes)`/i);
  assert.doesNotMatch(sql, /\b(?:DROP|TRUNCATE)\b|\bDELETE\s+FROM\b|\bINSERT\s+INTO\b|\bUPDATE\s+`/i);
});

test("Prisma Schema 只保留统一动态模板版本与激活事实来源", () => {
  const schema = readFileSync(schemaPath, "utf8");
  assert.doesNotMatch(schema, /model SystemContentTemplate(?:State|Version)/);
  assert.doesNotMatch(schema, /system_content_template_(?:states|versions)/);
  assert.match(schema, /model DynamicTemplateActivation \{/);
  assert.match(schema, /activations\s+DynamicTemplateActivation\[\]/);
  assert.match(schema, /activatedDynamicTemplates\s+DynamicTemplateActivation\[\]/);
  assert.match(schema, /@@map\("dynamic_template_activations"\)/);
});
