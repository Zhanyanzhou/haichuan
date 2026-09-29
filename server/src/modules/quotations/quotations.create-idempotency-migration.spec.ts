import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('报价创建幂等只增加可空哈希列与唯一索引且不保存原始键', () => {
  const schema = readFileSync(`${__dirname}/../../../prisma/schema.prisma`, 'utf8');
  const migration = readFileSync(
    `${__dirname}/../../../prisma/migrations/20260924210000_add_quotation_creation_idempotency/migration.sql`,
    'utf8',
  );

  assert.match(
    schema,
    /creationIdempotencyKeyHash\s+String\?\s+@unique\s+@map\("creation_idempotency_key_hash"\)\s+@db\.Char\(64\)/,
  );
  assert.match(
    schema,
    /creationRequestHash\s+String\?\s+@map\("creation_request_hash"\)\s+@db\.Char\(64\)/,
  );
  assert.match(migration, /ADD COLUMN `creation_idempotency_key_hash` CHAR\(64\) NULL/);
  assert.match(migration, /ADD COLUMN `creation_request_hash` CHAR\(64\) NULL/);
  assert.match(
    migration,
    /ADD UNIQUE INDEX `quotations_creation_idempotency_key_hash_key` \(`creation_idempotency_key_hash`\)/,
  );
  assert.doesNotMatch(migration, /DROP\s+(?:TABLE|COLUMN|INDEX)|NOT NULL|raw.*key/i);
});
