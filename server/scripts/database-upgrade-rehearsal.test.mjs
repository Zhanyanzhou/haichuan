import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  EXPECTED_MIGRATION_COUNT,
  PREFLIGHT_SQL,
  PROFILE_MIGRATION,
  TRADE_MIGRATION,
  assertAllGuardsBeforePersistentDdl,
  assertGuardBeforePersistentDdl,
  discoverMigrations,
  firstPersistentDdl,
} from './database-upgrade-rehearsal.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = path.resolve(scriptDirectory, '..', 'prisma', 'migrations');

test('migration inventory is the expected complete ordered set', () => {
  const migrations = discoverMigrations(migrationsDirectory);
  assert.equal(migrations.length, EXPECTED_MIGRATION_COUNT);
  assert.equal(migrations.at(-2), TRADE_MIGRATION);
  assert.equal(migrations.at(-1), PROFILE_MIGRATION);
});

test('all data guards precede the first persistent DDL in guarded migrations', () => {
  const tradeSql = fs.readFileSync(path.join(migrationsDirectory, TRADE_MIGRATION, 'migration.sql'), 'utf8');
  const profileSql = fs.readFileSync(path.join(migrationsDirectory, PROFILE_MIGRATION, 'migration.sql'), 'utf8');

  assertGuardBeforePersistentDdl(
    tradeSql,
    'DROP TEMPORARY TABLE `_guard_installment_payment_orphan`;',
    'CREATE UNIQUE INDEX `payments_gateway_trade_no_key`',
  );
  assertGuardBeforePersistentDdl(
    profileSql,
    'DROP TEMPORARY TABLE `_guard_duplicate_customer_email`;',
    'ALTER TABLE `customers`',
  );
  assert.match(firstPersistentDdl(tradeSql), /^CREATE UNIQUE INDEX `payments_gateway_trade_no_key`/);
  assert.match(firstPersistentDdl(profileSql), /^ALTER TABLE `customers`/);
  assertAllGuardsBeforePersistentDdl(tradeSql);
  assertAllGuardsBeforePersistentDdl(profileSql);
});

test('preflight remains read-only and covers requested legacy hazards', () => {
  assert.doesNotMatch(PREFLIGHT_SQL, /\b(?:ALTER|CREATE|DROP|DELETE|UPDATE|INSERT)\b/i);
  for (const issue of [
    'blank_customer_email',
    'duplicate_normalized_customer_email',
    'duplicate_normalized_product_sku',
    'missing_product_sku_unique_index',
    'invalid_payment_plan_source',
  ]) {
    assert.match(PREFLIGHT_SQL, new RegExp(issue));
  }
});
