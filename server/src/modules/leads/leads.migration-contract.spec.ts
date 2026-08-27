import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const originalMigration = readFileSync(
  join(
    process.cwd(),
    "prisma/migrations/20260827120000_add_unified_lead_pipeline/migration.sql",
  ),
  "utf8",
);
const appendOnlyMigration = readFileSync(
  join(
    process.cwd(),
    "prisma/migrations/20260827180000_add_lead_closure_reason_and_reopened_activity/migration.sql",
  ),
  "utf8",
);

test("统一线索历史 migration 保持原始边界，关闭审计能力只由后续 migration 追加", () => {
  assert.doesNotMatch(originalMigration, /closure_reason/i);
  assert.doesNotMatch(originalMigration, /REOPENED/);

  assert.match(
    appendOnlyMigration,
    /ALTER TABLE `leads`[\s\S]*ADD COLUMN `closure_reason` TEXT NULL/i,
  );
  assert.match(
    appendOnlyMigration,
    /ALTER TABLE `lead_activities`[\s\S]*'REOPENED'/i,
  );
  assert.match(
    appendOnlyMigration,
    /WHERE `l`\.`status` IN \('COMPLETED', 'INVALID'\)[\s\S]*`closure_reason` IS NULL/i,
  );
  assert.doesNotMatch(
    appendOnlyMigration,
    /\b(?:DROP TABLE|TRUNCATE TABLE|DELETE FROM)\b/i,
  );
});
