import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const serverRoot = path.resolve(__dirname, '..', '..', '..');
const schema = fs.readFileSync(path.join(serverRoot, 'prisma', 'schema.prisma'), 'utf8');
const migration = fs.readFileSync(
  path.join(
    serverRoot,
    'prisma',
    'migrations',
    '20260923190000_add_customer_address_idempotency',
    'migration.sql',
  ),
  'utf8',
);

test('customer address schema stores only nullable idempotency and request hashes', () => {
  assert.match(
    schema,
    /creationIdempotencyKeyHash\s+String\?\s+@unique\s+@map\("creation_idempotency_key_hash"\)\s+@db\.Char\(64\)/,
  );
  assert.match(
    schema,
    /creationRequestHash\s+String\?\s+@map\("creation_request_hash"\)\s+@db\.Char\(64\)/,
  );
});

test('customer address idempotency migration is additive and has no historical backfill', () => {
  assert.match(migration, /ALTER TABLE `customer_addresses`/);
  assert.match(migration, /ADD COLUMN `creation_idempotency_key_hash` CHAR\(64\) NULL/);
  assert.match(migration, /ADD COLUMN `creation_request_hash` CHAR\(64\) NULL/);
  assert.match(migration, /CREATE UNIQUE INDEX `customer_addresses_creation_idempotency_key_hash_key`/);
  assert.doesNotMatch(migration, /\b(?:UPDATE|DELETE|TRUNCATE|DROP)\b/i);
});
