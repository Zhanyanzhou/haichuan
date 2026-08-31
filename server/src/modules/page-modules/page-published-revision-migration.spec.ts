import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migrationPath = resolve(
  process.cwd(),
  "prisma/migrations/20260830130000_add_page_document_published_revision_pointer/migration.sql",
);
const schemaPath = resolve(process.cwd(), "prisma/schema.prisma");

test("publishedRevisionId migration 只增加 nullable 指针、索引与外键，不隐式回填页面", () => {
  const sql = readFileSync(migrationPath, "utf8");
  assert.match(sql, /ADD COLUMN `published_revision_id` INTEGER NULL/);
  assert.match(sql, /CREATE INDEX `page_documents_published_revision_id_idx`/);
  assert.match(sql, /REFERENCES `page_document_revisions`\(`id`\)/);
  assert.match(sql, /ON DELETE SET NULL/);
  assert.doesNotMatch(sql, /\b(?:UPDATE|INSERT|DELETE)\s+(?:`?page_documents`?|`?page_document_revisions`?)/i);
});

test("Prisma PageDocument 公开指针关系与 revision 历史关系使用不同 relation 名称", () => {
  const schema = readFileSync(schemaPath, "utf8");
  assert.match(schema, /publishedRevisionId\s+Int\?\s+@map\("published_revision_id"\)/);
  assert.match(schema, /publishedRevision\s+PageDocumentRevision\?\s+@relation\("PagePublishedRevision"/);
  assert.match(schema, /revisions\s+PageDocumentRevision\[\]\s+@relation\("PageDocumentRevisions"\)/);
  assert.match(schema, /@@index\(\[publishedRevisionId\]\)/);
});
