import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const migrationPath = resolve(
  process.cwd(),
  'prisma/migrations/20260923170000_add_after_sales_idempotency/migration.sql',
);
const schemaPath = resolve(process.cwd(), 'prisma/schema.prisma');

test('售后幂等迁移只增加可空哈希和唯一索引，不改写历史工单', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  assert.match(sql, /ADD COLUMN `idempotency_key_hash` CHAR\(64\) NULL/);
  assert.match(sql, /ADD COLUMN `submission_fingerprint` CHAR\(64\) NULL/);
  assert.match(sql, /CREATE UNIQUE INDEX `after_sales_cases_idempotency_key_hash_key`/);
  assert.doesNotMatch(sql, /\b(?:UPDATE|DELETE|TRUNCATE|DROP)\b/i);
});

test('Prisma 售后模型与迁移字段保持一致', () => {
  const schema = readFileSync(schemaPath, 'utf8');

  assert.match(
    schema,
    /idempotencyKeyHash\s+String\?\s+@unique\s+@map\("idempotency_key_hash"\)\s+@db\.Char\(64\)/,
  );
  assert.match(
    schema,
    /submissionFingerprint\s+String\?\s+@map\("submission_fingerprint"\)\s+@db\.Char\(64\)/,
  );
});
