import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migrationPath = join(
  process.cwd(),
  'prisma/migrations/20260920200000_add_payment_proof_assets/migration.sql',
);

test('D62 在建表前失败关闭历史归属与唯一性冲突，并确定性回填付款凭证资产', () => {
  const sql = readFileSync(migrationPath, 'utf8');
  const createTableAt = sql.indexOf('CREATE TABLE `payment_proof_assets`');
  assert.ok(createTableAt > 0);
  for (const guard of [
    '_guard_payment_proof_invalid_owner',
    '_guard_payment_proof_key_conflict',
  ]) {
    const guardAt = sql.indexOf(guard);
    assert.ok(guardAt > 0 && guardAt < createTableAt, `${guard} 必须先于持久 DDL`);
  }
  assert.match(sql, /UNIQUE INDEX `payment_proof_assets_storage_key_key` \(`storage_key`\)/);
  assert.match(sql, /UNIQUE INDEX `payment_proof_assets_submission_key_hash_key` \(`submission_key_hash`\)/);
  assert.match(sql, /INDEX `payment_proof_assets_order_id_idx` \(`order_id`\)/);
  assert.doesNotMatch(sql, /UNIQUE INDEX `payment_proof_assets_order_id/);
  assert.match(sql, /CHECK \(\(`status` = 'UPLOADED'.*`status` = 'ATTACHED'.*`status` = 'DELETING'/s);
  assert.match(sql, /CONSTRAINT `payment_proof_assets_submission_check`[\s\S]*`submission_key_hash` IS NOT NULL/);
  assert.match(sql, /`status` = 'ATTACHED'[\s\S]*`file_size` > 0/);
  assert.match(sql, /FOREIGN KEY \(`payment_id`\) REFERENCES `payments`\(`id`\) ON DELETE RESTRICT/);
  assert.match(sql, /INSERT INTO `payment_proof_assets` \([\s\S]*`file_size`[\s\S]*SELECT[\s\S]*10485760[\s\S]*GROUP BY `storage_key`, `order_id`/);
  assert.match(sql, /CREATE TABLE `payment_proof_gc_state`/);
  assert.match(sql, /MAX\(`payment_id`\)/);
  assert.match(sql, /CREATE TRIGGER `payment_proof_assets_controlled_update`/);
  assert.match(sql, /NEW\.`submission_key_hash` <=> OLD\.`submission_key_hash`/);
  assert.match(sql, /payment proof asset transition is not allowed/);
});
