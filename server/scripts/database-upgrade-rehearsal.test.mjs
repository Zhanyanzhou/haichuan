import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  AFTER_SALES_IDEMPOTENCY_MIGRATION,
  AUDITED_MEDIA_SELF_REVIEW_MIGRATION,
  CHECKOUT_IDEMPOTENCY_MIGRATION,
  CHECKPOINT_MIGRATION_COUNT,
  CUSTOMER_ADDRESS_IDEMPOTENCY_MIGRATION,
  CUSTOMER_SMS_RATE_LIMIT_MIGRATION,
  CUSTOMER_GATEWAY_OPERATION_MIGRATION,
  DYNAMIC_TEMPLATE_CATALOG_COVER_MIGRATION,
  EXPECTED_MIGRATION_TAIL,
  EXPECTED_TRIGGER_COUNT,
  EXPECTED_MIGRATION_COUNT,
  INQUIRY_REPLY_BACKFILL_MIGRATION,
  LEAD_RETENTION_DISPOSITION_IDEMPOTENCY_MIGRATION,
  MEDIA_AUTHORIZATION_MIGRATION,
  MIGRATION_CONNECTION_COLLATION,
  MIGRATION_PRIVILEGES,
  MYSQL_INIT_CONNECT_SQL,
  MYSQL_IMAGE,
  PAYMENT_PROOF_ASSET_MIGRATION,
  PREFLIGHT_SQL,
  PROFILE_MIGRATION,
  PRODUCT_IMAGE_URL_INDEX_MIGRATION,
  PRODUCT_QUALITY_V3_QUARANTINE_MIGRATION,
  QUOTATION_CREATION_IDEMPOTENCY_MIGRATION,
  SERVICE_PRIVACY_CONSENT_HASH_MIGRATION,
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
  assert.equal(EXPECTED_MIGRATION_COUNT, CHECKPOINT_MIGRATION_COUNT + EXPECTED_MIGRATION_TAIL.length);
  assert.deepEqual(migrations.slice(CHECKPOINT_MIGRATION_COUNT), EXPECTED_MIGRATION_TAIL);
  assert.deepEqual(EXPECTED_MIGRATION_TAIL, [
    TRADE_MIGRATION,
    PROFILE_MIGRATION,
    QUOTATION_EXPANSION_MIGRATION,
    QUOTATION_INVARIANTS_MIGRATION,
    MEDIA_AUTHORIZATION_MIGRATION,
    CUSTOMER_SMS_RATE_LIMIT_MIGRATION,
    PRODUCT_IMAGE_URL_INDEX_MIGRATION,
    AUDITED_MEDIA_SELF_REVIEW_MIGRATION,
    DYNAMIC_TEMPLATE_CATALOG_COVER_MIGRATION,
    CHECKOUT_IDEMPOTENCY_MIGRATION,
    PAYMENT_PROOF_ASSET_MIGRATION,
    CUSTOMER_GATEWAY_OPERATION_MIGRATION,
    INQUIRY_REPLY_BACKFILL_MIGRATION,
    PRODUCT_QUALITY_V3_QUARANTINE_MIGRATION,
    SERVICE_PRIVACY_CONSENT_HASH_MIGRATION,
    AFTER_SALES_IDEMPOTENCY_MIGRATION,
    CUSTOMER_ADDRESS_IDEMPOTENCY_MIGRATION,
    QUOTATION_CREATION_IDEMPOTENCY_MIGRATION,
    LEAD_RETENTION_DISPOSITION_IDEMPOTENCY_MIGRATION,
  ]);
});

test('lead retention disposition recovery migration is additive and stores no raw operation credential', () => {
  const sql = fs.readFileSync(
    path.join(migrationsDirectory, LEAD_RETENTION_DISPOSITION_IDEMPOTENCY_MIGRATION, 'migration.sql'),
    'utf8',
  );
  assert.match(sql, /CREATE TABLE `lead_retention_disposition_runs`/);
  assert.match(sql, /`idempotency_key_hash` CHAR\(64\) NOT NULL/);
  assert.match(sql, /UNIQUE INDEX `lead_retention_runs_idempotency_key_hash_key`/);
  assert.match(sql, /UNIQUE INDEX `lead_retention_runs_operation_log_id_key`/);
  assert.match(
    sql,
    /FOREIGN KEY \(`actor_id`\) REFERENCES `users`\(`id`\)\s+ON DELETE RESTRICT ON UPDATE RESTRICT/,
  );
  assert.doesNotMatch(sql, /`idempotency_key`\s/);
  assert.doesNotMatch(sql, /(?:^|;)\s*(?:UPDATE|DELETE|TRUNCATE|DROP)\b/i);
});

test('quotation creation idempotency migration is additive and preserves historical quotations', () => {
  const sql = fs.readFileSync(
    path.join(migrationsDirectory, QUOTATION_CREATION_IDEMPOTENCY_MIGRATION, 'migration.sql'),
    'utf8',
  );
  assert.match(sql, /ADD COLUMN `creation_idempotency_key_hash` CHAR\(64\) NULL/);
  assert.match(sql, /ADD COLUMN `creation_request_hash` CHAR\(64\) NULL/);
  assert.match(sql, /ADD UNIQUE INDEX `quotations_creation_idempotency_key_hash_key`/);
  assert.doesNotMatch(sql, /\b(?:UPDATE|DELETE|TRUNCATE|DROP)\b/i);
});

test('customer address idempotency migration is additive and preserves historical addresses', () => {
  const sql = fs.readFileSync(
    path.join(migrationsDirectory, CUSTOMER_ADDRESS_IDEMPOTENCY_MIGRATION, 'migration.sql'),
    'utf8',
  );
  assert.match(sql, /ADD COLUMN `creation_idempotency_key_hash` CHAR\(64\) NULL/);
  assert.match(sql, /ADD COLUMN `creation_request_hash` CHAR\(64\) NULL/);
  assert.match(sql, /CREATE UNIQUE INDEX `customer_addresses_creation_idempotency_key_hash_key`/);
  assert.doesNotMatch(sql, /\b(?:UPDATE|DELETE|TRUNCATE|DROP)\b/i);
});

test('after-sales idempotency migration is additive and preserves historical cases', () => {
  const sql = fs.readFileSync(
    path.join(migrationsDirectory, AFTER_SALES_IDEMPOTENCY_MIGRATION, 'migration.sql'),
    'utf8',
  );
  assert.match(sql, /ADD COLUMN `idempotency_key_hash` CHAR\(64\) NULL/);
  assert.match(sql, /ADD COLUMN `submission_fingerprint` CHAR\(64\) NULL/);
  assert.match(sql, /CREATE UNIQUE INDEX `after_sales_cases_idempotency_key_hash_key`/);
  assert.doesNotMatch(sql, /\b(?:UPDATE|DELETE|TRUNCATE|DROP)\b/i);
});

test('service privacy consent hash migration is additive and does not invent historical grants', () => {
  const sql = fs.readFileSync(
    path.join(migrationsDirectory, SERVICE_PRIVACY_CONSENT_HASH_MIGRATION, 'migration.sql'),
    'utf8',
  );
  assert.match(sql, /ALTER TABLE `inquiries`[\s\S]*`privacy_consent_hash` CHAR\(64\) NULL/);
  assert.match(sql, /ALTER TABLE `selection_inquiries`[\s\S]*`privacy_consent_hash` CHAR\(64\) NULL/);
  assert.match(sql, /ALTER TABLE `consent_records`[\s\S]*`policy_content_hash` CHAR\(64\) NULL/);
  assert.doesNotMatch(sql, /\bUPDATE\b/i);
});

test('customer gateway operation migration pins the logout linearization lease', () => {
  const sql = fs.readFileSync(
    path.join(migrationsDirectory, CUSTOMER_GATEWAY_OPERATION_MIGRATION, 'migration.sql'),
    'utf8',
  );
  assert.match(sql, /CREATE TABLE `customer_gateway_operations`/);
  assert.match(sql, /INDEX `customer_gateway_operations_customer_expiry_idx` \(`customer_id`, `expires_at`\)/);
  assert.match(sql, /INDEX `customer_gateway_operations_order_expiry_idx` \(`customer_id`, `order_id`, `expires_at`\)/);
  assert.match(sql, /`auth_version` INTEGER NOT NULL/);
  assert.match(sql, /`order_id` INTEGER NOT NULL/);
  assert.match(sql, /`expires_at` DATETIME\(3\) NOT NULL/);
  assert.match(
    sql,
    /FOREIGN KEY \(`customer_id`\) REFERENCES `customers`\(`id`\) ON DELETE CASCADE ON UPDATE RESTRICT/,
  );
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
  assert.equal(MIGRATION_CONNECTION_COLLATION, 'utf8mb4_unicode_ci');
  assert.equal(MYSQL_INIT_CONNECT_SQL, 'SET collation_connection = utf8mb4_unicode_ci');
  assert.match(rehearsalSource, /--init-connect=\$\{MYSQL_INIT_CONNECT_SQL\}/);
  assert.match(rehearsalSource, /@@SESSION\.collation_connection, @@GLOBAL\.init_connect/);
  assert.match(rehearsalSource, /Ordinary migration sessions must align CAST expressions/);
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

test('normalized CHECK expectations use the same lowercase representation as runtime clauses', () => {
  assert.match(rehearsalSource, /payment_proof_assets_state_check'[\s\S]*status = 'uploaded'/);
  assert.match(rehearsalSource, /payment_proof_assets_submission_check'[\s\S]*status = 'deleting'/);
  assert.doesNotMatch(rehearsalSource, /payment_proof_assets_(?:state|submission)_check'[\s\S]*status = '(?:UPLOADED|ATTACHED|DELETING)'/);
});

test('all data guards precede the first persistent DDL in guarded migrations', () => {
  const tradeSql = fs.readFileSync(path.join(migrationsDirectory, TRADE_MIGRATION, 'migration.sql'), 'utf8');
  const profileSql = fs.readFileSync(path.join(migrationsDirectory, PROFILE_MIGRATION, 'migration.sql'), 'utf8');
  const paymentProofSql = fs.readFileSync(
    path.join(migrationsDirectory, PAYMENT_PROOF_ASSET_MIGRATION, 'migration.sql'),
    'utf8',
  );

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
  assertGuardBeforePersistentDdl(
    paymentProofSql,
    'DROP TEMPORARY TABLE `_guard_payment_proof_invalid_owner`;',
    'CREATE TABLE `payment_proof_assets`',
  );
  assertGuardBeforePersistentDdl(
    paymentProofSql,
    'DROP TEMPORARY TABLE `_guard_payment_proof_key_conflict`;',
    'CREATE TABLE `payment_proof_assets`',
  );
  assert.match(firstPersistentDdl(tradeSql), /^CREATE UNIQUE INDEX `payments_gateway_trade_no_key`/);
  assert.match(firstPersistentDdl(profileSql), /^ALTER TABLE `customers`/);
  assert.match(firstPersistentDdl(paymentProofSql), /^CREATE TABLE `payment_proof_assets`/);
  assert.match(paymentProofSql, /CONSTRAINT `payment_proof_assets_state_check`[\s\S]*?CHECK \(/);
  assert.match(paymentProofSql, /CONSTRAINT `payment_proof_assets_submission_check`[\s\S]*?CHECK \(/);
  assert.match(paymentProofSql, /`status` = 'ATTACHED'[\s\S]*`file_size` > 0/);
  assert.match(paymentProofSql, /INSERT INTO `payment_proof_assets` \([\s\S]*`file_size`[\s\S]*10485760/);
  assert.match(paymentProofSql, /UNIQUE INDEX `payment_proof_assets_submission_key_hash_key`/);
  assert.match(paymentProofSql, /CREATE TRIGGER `payment_proof_assets_controlled_update`/);
  assertAllGuardsBeforePersistentDdl(tradeSql);
  assertAllGuardsBeforePersistentDdl(profileSql);
  assertAllGuardsBeforePersistentDdl(paymentProofSql);
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
