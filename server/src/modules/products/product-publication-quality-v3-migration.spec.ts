import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migrationPath = resolve(
  process.cwd(),
  "prisma/migrations/20260922150000_quarantine_legacy_product_quality_hashes/migration.sql",
);

test("publication quality v3 migration fails closed every legacy READY hash", () => {
  const sql = readFileSync(migrationPath, "utf8");

  assert.equal((sql.match(/\bUPDATE `products`/gi) ?? []).length, 1);
  assert.match(sql, /`publication_quality_status`\s*=\s*'QUARANTINED'/);
  assert.match(sql, /`publication_quality_hash`\s*=\s*NULL/);
  assert.match(sql, /`publication_quality_checked_at`\s*=\s*NULL/);
  assert.match(sql, /WHERE `publication_quality_status`\s*=\s*'READY'/);
  assert.doesNotMatch(sql, /\b(?:ALTER|CREATE|DROP|DELETE|INSERT)\b/i);
});
