import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CHECKPOINT_MIGRATION_COUNT,
  EXPECTED_TRIGGER_COUNT,
  EXPECTED_MIGRATION_COUNT,
  MEDIA_AUTHORIZATION_MIGRATION,
  MIGRATION_PRIVILEGES,
  MYSQL_IMAGE,
  PREFLIGHT_SQL,
  PROFILE_MIGRATION,
  QUOTATION_EXPANSION_MIGRATION,
  QUOTATION_INVARIANTS_MIGRATION,
  TRADE_MIGRATION,
  assertAllGuardsBeforePersistentDdl,
  assertGuardBeforePersistentDdl,
  discoverMigrations,
  firstPersistentDdl,
} from './database-upgrade-rehearsal.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = path.resolve(scriptDirectory, '..', 'prisma', 'migrations');
const rehearsalSource = fs.readFileSync(path.join(scriptDirectory, 'database-upgrade-rehearsal.mjs'), 'utf8');
const baseCompose = fs.readFileSync(path.resolve(scriptDirectory, '..', '..', 'docker-compose.yml'), 'utf8');

test('migration inventory is the expected complete ordered set', () => {
  const migrations = discoverMigrations(migrationsDirectory);
  assert.equal(migrations.length, EXPECTED_MIGRATION_COUNT);
  assert.equal(CHECKPOINT_MIGRATION_COUNT, 51);
  assert.equal(migrations.at(-5), TRADE_MIGRATION);
  assert.equal(migrations.at(-4), PROFILE_MIGRATION);
  assert.equal(migrations.at(-3), QUOTATION_EXPANSION_MIGRATION);
  assert.equal(migrations.at(-2), QUOTATION_INVARIANTS_MIGRATION);
  assert.equal(migrations.at(-1), MEDIA_AUTHORIZATION_MIGRATION);
});

test('rehearsal pins the controlled MySQL image and migrates without root or SUPER', () => {
  assert.match(MYSQL_IMAGE, /^mysql:8\.0@sha256:[a-f0-9]{64}$/);
  assert.ok(baseCompose.includes(`image: ${MYSQL_IMAGE}`));
  assert.deepEqual(MIGRATION_PRIVILEGES, [
    'SELECT',
    'INSERT',
    'UPDATE',
    'CREATE',
    'ALTER',
    'DROP',
    'INDEX',
    'REFERENCES',
    'CREATE TEMPORARY TABLES',
    'TRIGGER',
  ]);
  assert.ok(!MIGRATION_PRIVILEGES.includes('DELETE'));
  assert.ok(!MIGRATION_PRIVILEGES.includes('SUPER'));
  assert.match(rehearsalSource, /--log-bin-trust-function-creators=ON/);
  assert.match(rehearsalSource, /buildDatabaseUrl\(migrationUser, migrationPassword/);
  assert.doesNotMatch(rehearsalSource, /buildDatabaseUrl\(['"]root['"]/);
  assert.match(rehearsalSource, /SELECT CURRENT_USER\(\)/);
  assert.match(rehearsalSource, /privilege_type = 'SUPER'/);
});

test('rehearsal verifies current trigger definers and the locked-account lifecycle', () => {
  const triggerCount = discoverMigrations(migrationsDirectory)
    .map((migration) => fs.readFileSync(path.join(migrationsDirectory, migration, 'migration.sql'), 'utf8'))
    .reduce((count, sql) => count + (sql.match(/^CREATE TRIGGER\b/gm)?.length ?? 0), 0);
  assert.equal(triggerCount, EXPECTED_TRIGGER_COUNT);
  assert.match(rehearsalSource, /FROM information_schema\.triggers/);
  assert.match(rehearsalSource, /ALTER USER .* ACCOUNT LOCK/);
  assert.match(rehearsalSource, /trigger-enforced-after-account-lock/);
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
