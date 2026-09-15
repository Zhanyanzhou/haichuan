#!/usr/bin/env node

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const serverDirectory = path.resolve(scriptDirectory, '..');
const repositoryDirectory = path.resolve(serverDirectory, '..');
const prismaDirectory = path.join(serverDirectory, 'prisma');
const migrationsDirectory = path.join(prismaDirectory, 'migrations');
const prismaCli = path.join(serverDirectory, 'node_modules', 'prisma', 'build', 'index.js');

export const MYSQL_IMAGE = 'mysql:8.0@sha256:7dcddc01f13bab2f15cde676d44d01f61fc9f99fe7785e86196dfc07d358ae2b';
export const EXPECTED_MIGRATION_COUNT = 58;
export const CHECKPOINT_MIGRATION_COUNT = 51;
export const MIGRATION_PRIVILEGES = Object.freeze([
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
export const TRADE_MIGRATION = '20260906160000_close_trade_maturity_invariants';
export const PROFILE_MIGRATION = '20260911220000_add_customer_profile_security';
export const QUOTATION_EXPANSION_MIGRATION = '20260913120000_expand_quotation_conversion_contract';
export const QUOTATION_INVARIANTS_MIGRATION = '20260913121000_enforce_quotation_conversion_invariants';
export const MEDIA_AUTHORIZATION_MIGRATION = '20260913122000_add_media_authorization_inheritance';
export const CUSTOMER_SMS_RATE_LIMIT_MIGRATION = '20260915002000_add_customer_sms_rate_limits';
export const PRODUCT_IMAGE_URL_INDEX_MIGRATION = '20260915113500_add_product_image_url_index';
export const EXPECTED_TRIGGER_COUNT = 14;

export const PREFLIGHT_SQL = `
SELECT 'blank_customer_email' AS issue
WHERE EXISTS (
  SELECT 1 FROM customers WHERE email IS NOT NULL AND TRIM(email) = ''
)
UNION ALL
SELECT 'duplicate_normalized_customer_email'
WHERE EXISTS (
  SELECT 1 FROM customers WHERE email IS NOT NULL
  GROUP BY LOWER(TRIM(email)) HAVING COUNT(*) > 1
)
UNION ALL
SELECT 'blank_product_sku'
WHERE EXISTS (
  SELECT 1 FROM product_skus WHERE TRIM(sku_code) = ''
)
UNION ALL
SELECT 'duplicate_normalized_product_sku'
WHERE EXISTS (
  SELECT 1 FROM product_skus
  GROUP BY LOWER(TRIM(sku_code)) HAVING COUNT(*) > 1
)
UNION ALL
SELECT 'missing_product_sku_unique_index'
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'product_skus'
    AND index_name = 'product_skus_sku_code_key'
    AND non_unique = 0
  GROUP BY table_name, index_name, non_unique
  HAVING GROUP_CONCAT(column_name ORDER BY seq_in_index SEPARATOR ',') = 'sku_code'
)
UNION ALL
SELECT 'invalid_payment_plan_source'
WHERE EXISTS (
  SELECT 1 FROM payment_plans
  WHERE quotation_version_id IS NULL AND order_id IS NULL
)
UNION ALL
SELECT 'duplicate_payment_plan_quotation'
WHERE EXISTS (
  SELECT 1 FROM payment_plans WHERE quotation_version_id IS NOT NULL
  GROUP BY quotation_version_id HAVING COUNT(*) > 1
)
UNION ALL
SELECT 'duplicate_payment_plan_order'
WHERE EXISTS (
  SELECT 1 FROM payment_plans WHERE order_id IS NOT NULL
  GROUP BY order_id HAVING COUNT(*) > 1
)
UNION ALL
SELECT 'invalid_payment_plan_amount'
WHERE EXISTS (
  SELECT 1 FROM payment_plans WHERE total_amount <= 0
);
`;

export function discoverMigrations(directory = migrationsDirectory) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function assertGuardBeforePersistentDdl(sql, lastGuardMarker, firstPersistentMarker) {
  const guardPosition = sql.indexOf(lastGuardMarker);
  const ddlPosition = sql.indexOf(firstPersistentMarker);
  assert.notEqual(guardPosition, -1, `Missing guard marker: ${lastGuardMarker}`);
  assert.notEqual(ddlPosition, -1, `Missing persistent DDL marker: ${firstPersistentMarker}`);
  assert.ok(guardPosition < ddlPosition, `${lastGuardMarker} must precede ${firstPersistentMarker}`);
}

export function firstPersistentDdl(sql) {
  const statements = sql
    .replace(/^\s*--.*$/gm, '')
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
  return statements.find((statement) =>
    /^(?:ALTER\s+TABLE|CREATE\s+(?:UNIQUE\s+)?INDEX|CREATE\s+TABLE|DROP\s+TABLE|RENAME\s+TABLE|TRUNCATE\s+TABLE)\b/i.test(statement),
  );
}

export function assertAllGuardsBeforePersistentDdl(sql) {
  const ddl = firstPersistentDdl(sql);
  assert.ok(ddl, 'Migration has no persistent DDL');
  const ddlPosition = sql.indexOf(ddl);
  const guardPositions = [...sql.matchAll(/_guard_[a-z0-9_]+/gi)].map((match) => match.index);
  assert.ok(guardPositions.length > 0, 'Migration has no data guards');
  assert.ok(
    guardPositions.every((position) => position < ddlPosition),
    'Every data-guard statement must precede the first persistent DDL',
  );
}

class RehearsalError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'RehearsalError';
    this.details = details;
  }
}

class PreflightError extends RehearsalError {
  constructor(issues) {
    super(`Preflight rejected the database: ${issues.join(', ')}`, { issues });
    this.name = 'PreflightError';
    this.issues = issues;
  }
}

function sanitize(text, secrets) {
  let sanitized = String(text ?? '');
  for (const secret of secrets) {
    if (secret) sanitized = sanitized.split(secret).join('[redacted-test-secret]');
  }
  return sanitized;
}

function run(program, args, options = {}) {
  const result = spawnSync(program, args, {
    cwd: options.cwd ?? repositoryDirectory,
    env: options.env ?? process.env,
    encoding: options.encoding ?? 'utf8',
    input: options.input,
    maxBuffer: 128 * 1024 * 1024,
    windowsHide: true,
  });

  if (result.error) throw result.error;
  if (!options.allowFailure && result.status !== 0) {
    const secrets = options.secrets ?? [];
    throw new RehearsalError(`Command failed with exit code ${result.status}`, {
      stdout: sanitize(result.stdout, secrets).trim(),
      stderr: sanitize(result.stderr, secrets).trim(),
    });
  }
  return result;
}

async function reservePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

function validateDatabaseName(databaseName, prefix) {
  assert.match(databaseName, /^[a-z0-9_]+$/);
  assert.ok(databaseName.startsWith(prefix), `Refusing database outside rehearsal prefix: ${databaseName}`);
}

function parseRows(output) {
  const trimmed = String(output).trim();
  if (!trimmed) return [];
  return trimmed.split(/\r?\n/).map((line) => line.split('\t'));
}

function buildDatabaseUrl(username, password, port, databaseName) {
  return `mysql://${encodeURIComponent(username)}:${encodeURIComponent(password)}@127.0.0.1:${port}/${databaseName}`;
}

function prepareMigrationStage(tempDirectory, migrationNames, count) {
  const stageDirectory = path.join(tempDirectory, `prisma-${count}`);
  const stageMigrations = path.join(stageDirectory, 'migrations');
  fs.mkdirSync(stageMigrations, { recursive: true });
  fs.copyFileSync(path.join(prismaDirectory, 'schema.prisma'), path.join(stageDirectory, 'schema.prisma'));
  fs.writeFileSync(path.join(stageDirectory, 'package.json'), '{"private":true,"type":"module"}\n');
  fs.writeFileSync(path.join(stageDirectory, '.env'), '# Intentionally empty rehearsal environment.\n');
  fs.copyFileSync(
    path.join(migrationsDirectory, 'migration_lock.toml'),
    path.join(stageMigrations, 'migration_lock.toml'),
  );
  for (const migrationName of migrationNames.slice(0, count)) {
    const targetMigrationDirectory = path.join(stageMigrations, migrationName);
    fs.mkdirSync(targetMigrationDirectory);
    fs.copyFileSync(
      path.join(migrationsDirectory, migrationName, 'migration.sql'),
      path.join(targetMigrationDirectory, 'migration.sql'),
    );
  }
  return path.join(stageDirectory, 'schema.prisma');
}

function removeTree(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory() && !entry.isSymbolicLink()) removeTree(entryPath);
    else fs.unlinkSync(entryPath);
  }
  fs.rmdirSync(directory);
}

function verifyStaticMigrationGuards() {
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
}

export async function main() {
  const migrationNames = discoverMigrations();
  assert.equal(migrationNames.length, EXPECTED_MIGRATION_COUNT, 'Unexpected migration inventory size');
  assert.equal(migrationNames[51], TRADE_MIGRATION);
  assert.equal(migrationNames[52], PROFILE_MIGRATION);
  assert.equal(migrationNames[53], QUOTATION_EXPANSION_MIGRATION);
  assert.equal(migrationNames[54], QUOTATION_INVARIANTS_MIGRATION);
  assert.equal(migrationNames[55], MEDIA_AUTHORIZATION_MIGRATION);
  assert.equal(migrationNames[56], CUSTOMER_SMS_RATE_LIMIT_MIGRATION);
  assert.equal(migrationNames[57], PRODUCT_IMAGE_URL_INDEX_MIGRATION);
  assert.ok(fs.existsSync(prismaCli), 'Run npm install in server before this rehearsal');
  verifyStaticMigrationGuards();

  const runId = `${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`.slice(-12);
  const resourcePrefix = `hc_upgrade_${runId}`;
  const containerName = `hc-db-upgrade-rehearsal-${runId}`;
  const tempDirectory = path.resolve(repositoryDirectory, '.codex-tmp', `db-upgrade-rehearsal-${runId}`);
  const expectedTempParent = path.resolve(repositoryDirectory, '.codex-tmp');
  assert.ok(tempDirectory.startsWith(`${expectedTempParent}${path.sep}`));
  fs.mkdirSync(tempDirectory, { recursive: true });

  const rootPassword = `test-root-${crypto.randomBytes(18).toString('hex')}`;
  const migrationPassword = `test-migration-${crypto.randomBytes(18).toString('hex')}`;
  const migrationUser = `hc_migrator_${runId}`;
  assert.match(migrationUser, /^[a-z0-9_]{1,32}$/);
  const port = await reservePort();
  const report = {
    mysqlImage: MYSQL_IMAGE,
    migrationCount: migrationNames.length,
    checkpointMigrationCount: CHECKPOINT_MIGRATION_COUNT,
    scope: {
      appliesTo: [
        'local Docker MySQL 8 at the repository-controlled digest',
        `synthetic existing database produced by the current first ${CHECKPOINT_MIGRATION_COUNT} migrations`,
        `current ${CHECKPOINT_MIGRATION_COUNT}-to-${EXPECTED_MIGRATION_COUNT} forward upgrade`,
        'ordinary non-root migration account with the recorded schema-scoped privileges',
      ],
      doesNotProve: [
        'production data volume or migration duration',
        'lock-wait and concurrent-write behavior',
        'MySQL 5.7 or MariaDB compatibility',
        'every historical checkpoint from migration 0 through 50',
        'production rollback duration',
      ],
    },
    migrationAccount: {
      identity: `${migrationUser}@%`,
      connectionRole: 'non-root',
      schemaPrivileges: [...MIGRATION_PRIVILEGES].sort(),
      globalSuper: false,
    },
    resources: { containerName, databasePrefix: resourcePrefix },
    scenarios: [],
  };
  let containerCreated = false;
  const progress = (stage) => process.stderr.write(`[db-upgrade-rehearsal] ${stage}${os.EOL}`);

  const secrets = [rootPassword, migrationPassword];
  const docker = (args, options = {}) => run('docker', args, { ...options, secrets });

  const mysqlAs = (username, password, databaseName, sql, options = {}) => {
    if (databaseName) validateDatabaseName(databaseName, resourcePrefix);
    const args = ['exec', '-i', '-e', `MYSQL_PWD=${password}`, containerName, 'mysql', `-u${username}`];
    if (options.batch !== false) args.push('--batch', '--raw', '--skip-column-names');
    if (databaseName) args.push(databaseName);
    return docker(args, { input: sql, allowFailure: options.allowFailure });
  };

  const mysql = (databaseName, sql, options = {}) =>
    mysqlAs('root', rootPassword, databaseName, sql, options);

  const migrationMysql = (databaseName, sql, options = {}) =>
    mysqlAs(migrationUser, migrationPassword, databaseName, sql, options);

  const createDatabase = (databaseName) => {
    validateDatabaseName(databaseName, resourcePrefix);
    mysql(null, `CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    mysql(null, `GRANT ${MIGRATION_PRIVILEGES.join(', ')} ON \`${databaseName}\`.* TO \`${migrationUser}\`@'%';`);
  };

  const replaceDatabaseFromDump = (databaseName, dump) => {
    validateDatabaseName(databaseName, resourcePrefix);
    mysql(null, `DROP DATABASE IF EXISTS \`${databaseName}\`; CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    mysql(databaseName, dump, { batch: false });
  };

  const dumpDatabase = (databaseName, { ignoreLedger = false } = {}) => {
    validateDatabaseName(databaseName, resourcePrefix);
    const args = [
      'exec', '-e', `MYSQL_PWD=${rootPassword}`, containerName,
      'mysqldump', '-uroot', '--single-transaction', '--routines', '--triggers', '--events',
      '--set-gtid-purged=OFF', '--no-tablespaces', '--skip-comments',
    ];
    if (ignoreLedger) args.push(`--ignore-table=${databaseName}._prisma_migrations`);
    args.push(databaseName);
    const result = docker(args);
    return result.stdout;
  };

  const runPrisma = (
    databaseName,
    schemaPath,
    commandArgs,
    { allowFailure = false, appendSchema = true } = {},
  ) => {
    validateDatabaseName(databaseName, resourcePrefix);
    const databaseUrl = buildDatabaseUrl(migrationUser, migrationPassword, port, databaseName);
    const args = appendSchema ? [...commandArgs, `--schema=${schemaPath}`] : commandArgs;
    const isolatedEnvironment = {
      DATABASE_URL: databaseUrl,
      PATH: process.env.PATH,
      Path: process.env.Path,
      SystemRoot: process.env.SystemRoot,
      SYSTEMROOT: process.env.SYSTEMROOT,
      TEMP: process.env.TEMP,
      TMP: process.env.TMP,
      PRISMA_HIDE_UPDATE_MESSAGE: '1',
      NO_COLOR: '1',
    };
    return run(process.execPath, [prismaCli, ...args], {
      cwd: path.dirname(schemaPath),
      env: Object.fromEntries(Object.entries(isolatedEnvironment).filter(([, value]) => value !== undefined)),
      allowFailure,
      secrets: [...secrets, databaseUrl],
    });
  };

  const deploy = (databaseName, schemaPath, options) =>
    runPrisma(databaseName, schemaPath, ['migrate', 'deploy'], options);

  const validateLedger = (databaseName, expectedCount) => {
    const rows = parseRows(mysql(databaseName, `
      SELECT migration_name, checksum,
        IF(finished_at IS NULL, 'NULL', 'DONE'),
        IF(rolled_back_at IS NULL, 'NULL', 'ROLLED_BACK'),
        applied_steps_count
      FROM _prisma_migrations
      ORDER BY migration_name;
    `).stdout);
    assert.equal(rows.length, expectedCount, `Unexpected ledger row count in ${databaseName}`);
    for (let index = 0; index < rows.length; index += 1) {
      const [name, checksum, finished, rolledBack, appliedSteps] = rows[index];
      assert.equal(name, migrationNames[index], `Migration ledger order/name mismatch at ${index + 1}`);
      const migrationSql = fs.readFileSync(path.join(migrationsDirectory, name, 'migration.sql'));
      assert.equal(checksum, sha256(migrationSql), `Migration checksum mismatch: ${name}`);
      assert.equal(finished, 'DONE', `Unfinished migration in healthy ledger: ${name}`);
      assert.equal(rolledBack, 'NULL', `Rolled-back migration in healthy ledger: ${name}`);
      assert.equal(appliedSteps, '1', `Unexpected applied step count: ${name}`);
    }
  };

  const preflight = (databaseName, expectedCount) => {
    validateLedger(databaseName, expectedCount);
    const issues = parseRows(mysql(databaseName, PREFLIGHT_SQL).stdout).map(([issue]) => issue);
    if (issues.length > 0) throw new PreflightError(issues);
  };

  const expectPreflightIssues = (databaseName, expectedCount, expectedIssues) => {
    try {
      preflight(databaseName, expectedCount);
      assert.fail(`Expected preflight rejection: ${expectedIssues.join(', ')}`);
    } catch (error) {
      assert.ok(error instanceof PreflightError, `Unexpected preflight error: ${error.message}`);
      for (const issue of expectedIssues) assert.ok(error.issues.includes(issue), `Missing issue ${issue}`);
      return error.issues;
    }
  };

  const schemaFingerprint = (databaseName) => {
    const catalog = mysql(databaseName, `
      SELECT 'COLUMN', table_name, column_name, column_type, is_nullable,
        COALESCE(column_default, '<NULL>'), extra
      FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name <> '_prisma_migrations'
      UNION ALL
      SELECT 'INDEX', table_name, index_name, CAST(non_unique AS CHAR),
        CAST(seq_in_index AS CHAR), column_name, COALESCE(collation, '<NULL>')
      FROM information_schema.statistics
      WHERE table_schema = DATABASE() AND table_name <> '_prisma_migrations'
      UNION ALL
      SELECT 'CONSTRAINT', table_name, constraint_name, constraint_type, '', '', ''
      FROM information_schema.table_constraints
      WHERE table_schema = DATABASE() AND table_name <> '_prisma_migrations'
      UNION ALL
      SELECT 'CHECK', constraint_name, check_clause, '', '', '', ''
      FROM information_schema.check_constraints
      WHERE constraint_schema = DATABASE()
      ORDER BY 1, 2, 3, 4, 5, 6, 7;
    `).stdout;
    return sha256(catalog);
  };

  const assertNativeGuardFailure = (databaseName, expectedMigration, expectedGuardMarker, backup, schemaPath) => {
    const schemaBefore = schemaFingerprint(databaseName);
    const businessBefore = sha256(dumpDatabase(databaseName, { ignoreLedger: true }));
    const deployResult = deploy(databaseName, schemaPath, { allowFailure: true });
    assert.notEqual(deployResult.status, 0, `Expected ${expectedMigration} to fail`);
    assert.equal(schemaFingerprint(databaseName), schemaBefore, 'Persistent schema changed before the guard failure');
    assert.equal(
      sha256(dumpDatabase(databaseName, { ignoreLedger: true })),
      businessBefore,
      'Business data changed before the guard failure',
    );
    const failed = parseRows(mysql(databaseName, `
      SELECT migration_name, checksum, IF(finished_at IS NULL, 'NULL', 'DONE'),
        applied_steps_count, IF(LOCATE('${expectedGuardMarker}', logs) > 0, 'GUARD_FOUND', 'GUARD_MISSING')
      FROM _prisma_migrations
      WHERE finished_at IS NULL AND rolled_back_at IS NULL;
    `).stdout);
    const expectedChecksum = sha256(
      fs.readFileSync(path.join(migrationsDirectory, expectedMigration, 'migration.sql')),
    );
    assert.deepEqual(failed, [[expectedMigration, expectedChecksum, 'NULL', '0', 'GUARD_FOUND']]);

    replaceDatabaseFromDump(databaseName, backup);
    assert.equal(sha256(dumpDatabase(databaseName)), sha256(backup), 'Restore did not reproduce the pre-upgrade backup');
  };

  const cloneDatabase = (databaseName, dump) => {
    createDatabase(databaseName);
    mysql(databaseName, dump, { batch: false });
  };

  try {
    progress('starting isolated MySQL 8 container at the controlled digest');
    const createResult = docker([
      'run', '--detach', '--rm', '--name', containerName,
      '-e', `MYSQL_ROOT_PASSWORD=${rootPassword}`,
      '-p', `127.0.0.1:${port}:3306`,
      '--tmpfs', '/var/lib/mysql:rw,nosuid,nodev',
      MYSQL_IMAGE,
      '--server-id=1',
      '--log-bin=mysql-bin',
      '--log-bin-trust-function-creators=ON',
    ]);
    containerCreated = createResult.status === 0;

    const readyDeadline = Date.now() + 120_000;
    let consecutiveReadyChecks = 0;
    while (Date.now() < readyDeadline) {
      const probe = docker(
        ['exec', '-e', `MYSQL_PWD=${rootPassword}`, containerName, 'mysql', '-uroot', '--batch', '--skip-column-names', '-e', 'SELECT 1'],
        { allowFailure: true },
      );
      consecutiveReadyChecks = probe.status === 0 ? consecutiveReadyChecks + 1 : 0;
      if (consecutiveReadyChecks >= 3) break;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    assert.equal(consecutiveReadyChecks, 3, 'Isolated MySQL 8 container did not become stably ready');
    const dataMount = docker([
      'inspect', '--format', '{{index .HostConfig.Tmpfs "/var/lib/mysql"}}|{{range .Mounts}}{{println .Destination .Type .Name}}{{end}}', containerName,
    ]).stdout;
    assert.match(dataMount, /^rw,nosuid,nodev\|/m, 'MySQL data directory is not isolated on tmpfs');
    assert.doesNotMatch(dataMount, /\/var\/lib\/mysql volume\b/m, 'MySQL data directory uses a persistent volume');
    const [[mysqlVersion, logBin, logBinTrustFunctionCreators]] = parseRows(mysql(null, `
      SELECT VERSION(), @@GLOBAL.log_bin, @@GLOBAL.log_bin_trust_function_creators;
    `).stdout);
    assert.match(mysqlVersion, /^8\.0\./, 'Controlled image did not start MySQL 8.0');
    assert.equal(logBin, '1', 'Rehearsal must exercise trigger creation with binary logging enabled');
    assert.equal(
      logBinTrustFunctionCreators,
      '1',
      'Ordinary migration account requires the approved trigger-creator policy when binary logging is enabled',
    );
    report.mysqlRuntime = {
      version: mysqlVersion,
      logBin: 'ON',
      logBinTrustFunctionCreators: 'ON',
    };
    mysql(null, `CREATE USER \`${migrationUser}\`@'%' IDENTIFIED BY '${migrationPassword}';`);
    progress('isolated MySQL 8 container and ordinary migration account are ready');

    const stage51 = prepareMigrationStage(tempDirectory, migrationNames, CHECKPOINT_MIGRATION_COUNT);
    const stage52 = prepareMigrationStage(tempDirectory, migrationNames, 52);
    const stage53 = prepareMigrationStage(tempDirectory, migrationNames, 53);
    const stage56 = prepareMigrationStage(tempDirectory, migrationNames, EXPECTED_MIGRATION_COUNT);
    const base51 = `${resourcePrefix}_base51`;
    createDatabase(base51);
    const connectedIdentity = migrationMysql(base51, 'SELECT CURRENT_USER();').stdout.trim();
    assert.equal(connectedIdentity, `${migrationUser}@%`, 'Prisma migration identity is not the ordinary migration account');
    const grantee = `'${migrationUser}'@'%'`;
    const escapedGrantee = grantee.replaceAll("'", "''");
    const grantedPrivileges = parseRows(mysql(null, `
      SELECT privilege_type
      FROM information_schema.schema_privileges
      WHERE grantee = '${escapedGrantee}'
        AND table_schema = '${base51}'
      ORDER BY privilege_type;
    `).stdout).map(([privilege]) => privilege);
    assert.deepEqual(grantedPrivileges, [...MIGRATION_PRIVILEGES].sort());
    const [[globalSuperCount]] = parseRows(mysql(null, `
      SELECT COUNT(*)
      FROM information_schema.user_privileges
      WHERE grantee = '${escapedGrantee}' AND privilege_type = 'SUPER';
    `).stdout);
    assert.equal(globalSuperCount, '0', 'Ordinary migration account must not receive SUPER');
    progress('building 51-migration existing-database checkpoint');
    deploy(base51, stage51);
    validateLedger(base51, 51);
    mysql(base51, `
      INSERT INTO categories (name, slug, updated_at)
      VALUES ('Rehearsal Category', 'rehearsal-category', CURRENT_TIMESTAMP(3));
      SET @category_id = LAST_INSERT_ID();
      INSERT INTO products (code, name, category_id, updated_at)
      VALUES ('REHEARSAL-PRODUCT-001', 'Rehearsal Product', @category_id, CURRENT_TIMESTAMP(3));
      SET @product_id = LAST_INSERT_ID();
      INSERT INTO product_skus (product_id, sku_code, price)
      VALUES (@product_id, 'REHEARSAL-SKU-001', 95.00);
      SET @sku_id = LAST_INSERT_ID();
      INSERT INTO customers (phone, name, email, updated_at)
      VALUES ('13900000001', 'Rehearsal Customer', 'customer@example.test', CURRENT_TIMESTAMP(3));
      SET @customer_id = LAST_INSERT_ID();
      INSERT INTO orders (
        order_no, customer_name, customer_phone, customer_email, address,
        total_amount, discount_amount, adjustment_amount, final_amount,
        customer_id, updated_at
      ) VALUES (
        'REHEARSAL-ORDER-001', 'Rehearsal Customer', '13900000001',
        'customer@example.test', 'Rehearsal Address', 100.00, 10.00, 5.00, 95.00,
        @customer_id, CURRENT_TIMESTAMP(3)
      );
      SET @order_id = LAST_INSERT_ID();
      INSERT INTO order_items (order_id, sku_id, product_id, quantity, unit_price, subtotal)
      VALUES (@order_id, @sku_id, @product_id, 1, 95.00, 95.00);
      SET @order_item_id = LAST_INSERT_ID();
      INSERT INTO warehouses (name, type)
      VALUES ('Rehearsal Warehouse', 'STORE');
      SET @warehouse_id = LAST_INSERT_ID();
      INSERT INTO inventories (sku_id, warehouse_id, quantity, updated_at)
      VALUES (@sku_id, @warehouse_id, 1, CURRENT_TIMESTAMP(3));
      SET @inventory_id = LAST_INSERT_ID();
      INSERT INTO inventory_reservations (
        order_id, inventory_id, sku_id, quantity, expires_at, consumed_at
      ) VALUES (
        @order_id, @inventory_id, @sku_id, 1,
        DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL 1 DAY), CURRENT_TIMESTAMP(3)
      );
      SET @reservation_id = LAST_INSERT_ID();
      INSERT INTO fulfillments (fulfillment_no, order_id, updated_at)
      VALUES ('REHEARSAL-FULFILLMENT-001', @order_id, CURRENT_TIMESTAMP(3));
      SET @fulfillment_id = LAST_INSERT_ID();
      INSERT INTO payments (
        order_id, payment_no, amount, method, status, gateway_trade_no
      ) VALUES (
        @order_id, 'REHEARSAL-PAYMENT-001', 95.00, 'bank_transfer', 'PAID',
        'REHEARSAL-GATEWAY-TRADE-001'
      );
      SET @payment_id = LAST_INSERT_ID();
      INSERT INTO after_sales_cases (
        case_no, order_id, order_item_id, customer_id, type, reason, updated_at
      ) VALUES (
        'REHEARSAL-AFTER-SALES-001', @order_id, @order_item_id, @customer_id,
        'REFUND', 'Rehearsal reason', CURRENT_TIMESTAMP(3)
      );
      SET @after_sales_id = LAST_INSERT_ID();
      INSERT INTO refunds (
        order_id, payment_id, refund_no, amount, status, gateway_refund_no,
        after_sales_case_id
      ) VALUES (
        @order_id, @payment_id, 'REHEARSAL-REFUND-001', 10.00, 'COMPLETED',
        'REHEARSAL-GATEWAY-REFUND-001', @after_sales_id
      );
      INSERT INTO quotations (
        quote_no, customer_id, customer_name, customer_phone, customer_email,
        total_amount, discount_amount, final_amount, updated_at
      ) VALUES (
        'REHEARSAL-QUOTE-001', @customer_id, 'Rehearsal Customer', '13900000001',
        'customer@example.test', 100.00, 5.00, 95.00, CURRENT_TIMESTAMP(3)
      );
      SET @quotation_id = LAST_INSERT_ID();
      INSERT INTO quotation_versions (
        quotation_id, version, channel, subtotal_amount, discount_amount,
        fee_amount, total_amount, content_hash
      ) VALUES (
        @quotation_id, 1, 'CUSTOM', 100.00, 5.00, 0.00, 95.00, REPEAT('b', 64)
      );
      SET @quotation_version_id = LAST_INSERT_ID();
      INSERT INTO payment_plans (order_id, total_amount, updated_at)
      VALUES (@order_id, 95.00, CURRENT_TIMESTAMP(3));
      SET @order_plan_id = LAST_INSERT_ID();
      INSERT INTO payment_plan_installments (
        payment_plan_id, sequence, label, amount, payment_id
      ) VALUES (@order_plan_id, 1, 'Paid in full', 95.00, @payment_id);
      INSERT INTO payment_plans (quotation_version_id, total_amount, updated_at)
      VALUES (@quotation_version_id, 95.00, CURRENT_TIMESTAMP(3));
      INSERT INTO customer_refresh_sessions (
        customer_id, token_hash, family_id, expires_at
      ) VALUES (
        @customer_id, REPEAT('a', 64), '00000000-0000-0000-0000-000000000001',
        DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL 1 DAY)
      );
    `);
    preflight(base51, 51);
    const base51Dump = dumpDatabase(base51);

    const healthy = `${resourcePrefix}_healthy`;
    progress(`running healthy ${CHECKPOINT_MIGRATION_COUNT}-to-${EXPECTED_MIGRATION_COUNT} upgrade and restore`);
    cloneDatabase(healthy, base51Dump);
    const healthyBackup = dumpDatabase(healthy);
    preflight(healthy, 51);
    deploy(healthy, stage56);
    validateLedger(healthy, EXPECTED_MIGRATION_COUNT);
    const triggerDefiners = parseRows(mysql(healthy, `
      SELECT trigger_name, definer
      FROM information_schema.triggers
      WHERE trigger_schema = DATABASE()
      ORDER BY trigger_name;
    `).stdout);
    assert.equal(triggerDefiners.length, EXPECTED_TRIGGER_COUNT, 'Current migration bundle trigger count changed');
    assert.ok(
      triggerDefiners.every(([, definer]) => definer === `${migrationUser}@%`),
      'Every current trigger must retain the ordinary migration account as definer',
    );
    report.migrationAccount.createdTriggerCount = triggerDefiners.length;
    report.migrationAccount.triggerDefinerIdentity = `${migrationUser}@%`;
    const status = runPrisma(healthy, stage56, ['migrate', 'status']);
    assert.match(status.stdout, /Database schema is up to date!/);
    const diff = runPrisma(
      healthy,
      stage56,
      ['migrate', 'diff', '--from-url', buildDatabaseUrl(migrationUser, migrationPassword, port, healthy), '--to-schema-datamodel', stage56, '--exit-code'],
      { allowFailure: true, appendSchema: false },
    );
    if (diff.status !== 0) {
      throw new RehearsalError('Prisma schema drift after the current migration bundle', {
        migrationCount: report.migrationCount,
        mysqlImage: report.mysqlImage,
        mysqlRuntime: report.mysqlRuntime,
        migrationAccount: report.migrationAccount,
        drift: sanitize(diff.stdout + diff.stderr, secrets).trim(),
      });
    }

    const uniqueIndexes = new Map(parseRows(mysql(healthy, `
      SELECT table_name, index_name, CAST(non_unique AS CHAR),
        GROUP_CONCAT(column_name ORDER BY seq_in_index SEPARATOR ',')
      FROM information_schema.statistics
      WHERE table_schema = DATABASE() AND index_name IN (
        'customers_email_key',
        'product_skus_sku_code_key',
        'payment_plans_quotation_version_id_key',
        'payment_plans_order_id_key',
        'payment_plan_installments_payment_id_key',
        'fulfillments_order_id_warehouse_id_key'
      )
      GROUP BY table_name, index_name, non_unique
      ORDER BY table_name, index_name;
    `).stdout).map(([table, name, nonUnique, columns]) => [`${table}.${name}`, { nonUnique, columns }]));
    const expectedUniqueIndexes = new Map([
      ['customers.customers_email_key', { nonUnique: '0', columns: 'email' }],
      ['product_skus.product_skus_sku_code_key', { nonUnique: '0', columns: 'sku_code' }],
      ['payment_plans.payment_plans_quotation_version_id_key', { nonUnique: '0', columns: 'quotation_version_id' }],
      ['payment_plans.payment_plans_order_id_key', { nonUnique: '0', columns: 'order_id' }],
      ['payment_plan_installments.payment_plan_installments_payment_id_key', { nonUnique: '0', columns: 'payment_id' }],
      ['fulfillments.fulfillments_order_id_warehouse_id_key', { nonUnique: '0', columns: 'order_id,warehouse_id' }],
    ]);
    assert.deepEqual(uniqueIndexes, expectedUniqueIndexes);

    const foreignKeys = new Map(parseRows(mysql(healthy, `
      SELECT k.table_name, k.constraint_name,
        GROUP_CONCAT(k.column_name ORDER BY k.ordinal_position SEPARATOR ','),
        MAX(k.referenced_table_name),
        GROUP_CONCAT(k.referenced_column_name ORDER BY k.ordinal_position SEPARATOR ','),
        r.update_rule, r.delete_rule
      FROM information_schema.key_column_usage AS k
      JOIN information_schema.referential_constraints AS r
        ON r.constraint_schema = k.constraint_schema
       AND r.constraint_name = k.constraint_name
       AND r.table_name = k.table_name
      WHERE k.constraint_schema = DATABASE() AND k.constraint_name IN (
        'payment_plans_quotation_version_id_fkey',
        'payment_plans_order_id_fkey',
        'payment_plan_installments_payment_id_fkey',
        'fulfillments_warehouse_id_fkey',
        'after_sales_cases_order_item_id_fkey',
        'refunds_after_sales_case_id_fkey'
      )
      GROUP BY k.table_name, k.constraint_name, r.update_rule, r.delete_rule
      ORDER BY k.table_name, k.constraint_name;
    `).stdout).map(([table, name, columns, referencedTable, referencedColumns, updateRule, deleteRule]) => [
      `${table}.${name}`,
      { columns, referencedTable, referencedColumns, updateRule, deleteRule },
    ]));
    const expectedForeignKeys = new Map([
      ['after_sales_cases.after_sales_cases_order_item_id_fkey', {
        columns: 'order_item_id', referencedTable: 'order_items', referencedColumns: 'id',
        updateRule: 'CASCADE', deleteRule: 'SET NULL',
      }],
      ['fulfillments.fulfillments_warehouse_id_fkey', {
        columns: 'warehouse_id', referencedTable: 'warehouses', referencedColumns: 'id',
        updateRule: 'CASCADE', deleteRule: 'RESTRICT',
      }],
      ['payment_plan_installments.payment_plan_installments_payment_id_fkey', {
        columns: 'payment_id', referencedTable: 'payments', referencedColumns: 'id',
        updateRule: 'CASCADE', deleteRule: 'RESTRICT',
      }],
      ['payment_plans.payment_plans_order_id_fkey', {
        columns: 'order_id', referencedTable: 'orders', referencedColumns: 'id',
        updateRule: 'RESTRICT', deleteRule: 'RESTRICT',
      }],
      ['payment_plans.payment_plans_quotation_version_id_fkey', {
        columns: 'quotation_version_id', referencedTable: 'quotation_versions', referencedColumns: 'id',
        updateRule: 'RESTRICT', deleteRule: 'RESTRICT',
      }],
      ['refunds.refunds_after_sales_case_id_fkey', {
        columns: 'after_sales_case_id', referencedTable: 'after_sales_cases', referencedColumns: 'id',
        updateRule: 'CASCADE', deleteRule: 'SET NULL',
      }],
    ]);
    assert.deepEqual(foreignKeys, expectedForeignKeys);

    const normalizeCheck = (value) => value
      .toLowerCase()
      .replace(/_utf8mb4/g, '')
      .replace(/\\'/g, "'")
      .replace(/[`()]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const checks = new Map(parseRows(mysql(healthy, `
      SELECT constraint_name, check_clause
      FROM information_schema.check_constraints
      WHERE constraint_schema = DATABASE() AND constraint_name IN (
        'warehouses_default_key_check',
        'orders_amount_formula_check',
        'fulfillment_items_quantity_check',
        'payment_plans_source_check',
        'payment_plans_total_amount_check',
        'payment_plan_installments_amount_check',
        'payment_plan_installments_sequence_check'
      );
    `).stdout).map(([name, clause]) => [name, normalizeCheck(clause)]));
    const expectedCheckFragments = new Map([
      ['warehouses_default_key_check', "is_default = true and default_key = 'primary' or is_default = false and default_key is null"],
      ['orders_amount_formula_check', 'fee_amount >= 0 and final_amount = total_amount - discount_amount + adjustment_amount + shipping_amount + insurance_amount + tax_amount + fee_amount'],
      ['fulfillment_items_quantity_check', 'quantity > 0'],
      ['payment_plans_source_check', 'quotation_version_id is not null or order_id is not null'],
      ['payment_plans_total_amount_check', 'total_amount > 0'],
      ['payment_plan_installments_amount_check', 'amount > 0'],
      ['payment_plan_installments_sequence_check', 'sequence > 0'],
    ]);
    assert.deepEqual(checks, expectedCheckFragments);

    const preserved = parseRows(mysql(healthy, `
      SELECT COUNT(*),
        SUM(shipping_address_snapshot IS NOT NULL),
        SUM(pricing_snapshot IS NOT NULL)
      FROM orders WHERE order_no = 'REHEARSAL-ORDER-001';
      SELECT COUNT(*), SUM(auth_version = 1)
      FROM customers WHERE phone = '13900000001';
      SELECT COUNT(*), SUM(auth_version = 1)
      FROM customer_refresh_sessions WHERE family_id = '00000000-0000-0000-0000-000000000001';
      SELECT COUNT(*), SUM(is_default = true), SUM(default_key = 'PRIMARY')
      FROM warehouses WHERE name = 'Rehearsal Warehouse';
      SELECT COUNT(*), SUM(f.warehouse_id = i.warehouse_id)
      FROM fulfillments AS f
      JOIN inventories AS i ON i.id = (
        SELECT inventory_id FROM inventory_reservations WHERE order_id = f.order_id LIMIT 1
      )
      WHERE f.fulfillment_no = 'REHEARSAL-FULFILLMENT-001';
      SELECT COUNT(*), SUM(fi.quantity = 1)
      FROM fulfillment_items AS fi
      JOIN fulfillments AS f ON f.id = fi.fulfillment_id
      JOIN order_items AS oi ON oi.id = fi.order_item_id
      JOIN inventory_reservations AS ir ON ir.id = fi.inventory_reservation_id
      WHERE f.fulfillment_no = 'REHEARSAL-FULFILLMENT-001'
        AND oi.order_id = f.order_id AND ir.order_id = f.order_id;
      SELECT COUNT(*), SUM(current_version = 1), SUM(channel = 'CUSTOM')
      FROM quotations WHERE quote_no = 'REHEARSAL-QUOTE-001';
      SELECT COUNT(*), SUM(gateway_trade_no = 'REHEARSAL-GATEWAY-TRADE-001')
      FROM payments WHERE payment_no = 'REHEARSAL-PAYMENT-001';
      SELECT COUNT(*), SUM(r.gateway_refund_no = 'REHEARSAL-GATEWAY-REFUND-001'),
        SUM(a.case_no = 'REHEARSAL-AFTER-SALES-001')
      FROM refunds AS r
      JOIN after_sales_cases AS a ON a.id = r.after_sales_case_id
      WHERE r.refund_no = 'REHEARSAL-REFUND-001' AND a.order_id = r.order_id;
      SELECT COUNT(*),
        SUM(order_id IS NOT NULL AND quotation_version_id IS NULL),
        SUM(order_id IS NULL AND quotation_version_id IS NOT NULL)
      FROM payment_plans;
      SELECT COUNT(*), SUM(i.payment_id = p.id), SUM(i.amount = 95.00)
      FROM payment_plan_installments AS i
      JOIN payments AS p ON p.id = i.payment_id
      WHERE p.payment_no = 'REHEARSAL-PAYMENT-001';
    `).stdout);
    assert.deepEqual(preserved, [
      ['1', '1', '1'],
      ['1', '1'],
      ['1', '1'],
      ['1', '1', '1'],
      ['1', '1'],
      ['1', '1'],
      ['1', '1', '1'],
      ['1', '1'],
      ['1', '1', '1'],
      ['2', '1', '1'],
      ['1', '1', '1'],
    ]);

    const expectSqlFailure = (sql, label) => {
      const result = mysql(healthy, sql, { allowFailure: true });
      assert.notEqual(result.status, 0, `${label} unexpectedly succeeded`);
    };
    expectSqlFailure(
      `INSERT INTO customers (phone, email, updated_at) VALUES ('13900000002', 'CUSTOMER@example.test', CURRENT_TIMESTAMP(3));`,
      'normalized duplicate customer email',
    );
    expectSqlFailure(
      `INSERT INTO product_skus (product_id, sku_code) SELECT product_id, 'rehearsal-sku-001' FROM product_skus LIMIT 1;`,
      'duplicate SKU',
    );
    expectSqlFailure(
      `INSERT INTO payment_plans (quotation_version_id, order_id, total_amount, updated_at) VALUES (NULL, NULL, 10, CURRENT_TIMESTAMP(3));`,
      'payment plan source check',
    );
    expectSqlFailure(
      `INSERT INTO payment_plans (order_id, total_amount, updated_at) VALUES (999999999, 10, CURRENT_TIMESTAMP(3));`,
      'payment plan foreign key',
    );
    const restored = `${resourcePrefix}_restored`;
    cloneDatabase(restored, healthyBackup);
    assert.equal(sha256(dumpDatabase(restored)), sha256(healthyBackup), 'Backup restore dump mismatch');
    validateLedger(restored, 51);
    report.scenarios.push({
      name: 'healthy-existing-database-upgrade',
      result: 'passed',
      evidence: [
        `${CHECKPOINT_MIGRATION_COUNT}-to-${EXPECTED_MIGRATION_COUNT}`,
        `${EXPECTED_MIGRATION_COUNT}-ledger-checksums`,
        'ordinary-migration-account',
        'prisma-no-drift',
        'data-preserved',
        'backup-restored',
      ],
    });

    const invalidPlan = `${resourcePrefix}_invalid_plan`;
    progress('running invalid payment-plan failure and restore');
    cloneDatabase(invalidPlan, base51Dump);
    mysql(invalidPlan, `
      INSERT INTO payment_plans (quotation_version_id, order_id, total_amount, updated_at)
      VALUES (NULL, NULL, 20.00, CURRENT_TIMESTAMP(3));
    `);
    const invalidPlanBackup = dumpDatabase(invalidPlan);
    const planSchemaBeforePreflight = schemaFingerprint(invalidPlan);
    const planDumpBeforePreflight = sha256(invalidPlanBackup);
    const planIssues = expectPreflightIssues(invalidPlan, 51, ['invalid_payment_plan_source']);
    assert.equal(schemaFingerprint(invalidPlan), planSchemaBeforePreflight);
    assert.equal(sha256(dumpDatabase(invalidPlan)), planDumpBeforePreflight);
    assertNativeGuardFailure(
      invalidPlan,
      TRADE_MIGRATION,
      '_guard_invalid_payment_plan_source',
      invalidPlanBackup,
      stage53,
    );
    validateLedger(invalidPlan, 51);
    report.scenarios.push({
      name: 'invalid-payment-plan-source', result: 'passed', issues: planIssues,
      evidence: ['preflight-read-only', 'native-guard-before-persistent-ddl', 'failed-ledger-observed', 'backup-restored'],
    });

    const base52 = `${resourcePrefix}_base52`;
    progress('building 52-migration customer-profile checkpoint');
    cloneDatabase(base52, base51Dump);
    deploy(base52, stage52);
    validateLedger(base52, 52);
    const base52Dump = dumpDatabase(base52);

    for (const scenario of [
      {
        suffix: 'blank_email',
        sql: `INSERT INTO customers (phone, email, updated_at) VALUES ('13900000003', '   ', CURRENT_TIMESTAMP(3));`,
        issue: 'blank_customer_email',
      },
      {
        suffix: 'duplicate_email',
        sql: `
          INSERT INTO customers (phone, email, updated_at) VALUES
            ('13900000004', 'Alice@Example.test', CURRENT_TIMESTAMP(3)),
            ('13900000005', ' alice@example.test ', CURRENT_TIMESTAMP(3));
        `,
        issue: 'duplicate_normalized_customer_email',
      },
    ]) {
      progress(`running ${scenario.suffix.replaceAll('_', '-')} failure and restore`);
      const databaseName = `${resourcePrefix}_${scenario.suffix}`;
      cloneDatabase(databaseName, base52Dump);
      mysql(databaseName, scenario.sql);
      const backup = dumpDatabase(databaseName);
      const before = schemaFingerprint(databaseName);
      const issues = expectPreflightIssues(databaseName, 52, [scenario.issue]);
      assert.equal(schemaFingerprint(databaseName), before);
      assertNativeGuardFailure(
        databaseName,
        PROFILE_MIGRATION,
        scenario.suffix === 'blank_email'
          ? '_guard_blank_customer_email'
          : '_guard_duplicate_customer_email',
        backup,
        stage53,
      );
      validateLedger(databaseName, 52);
      report.scenarios.push({
        name: scenario.suffix.replaceAll('_', '-'), result: 'passed', issues,
        evidence: ['preflight-read-only', 'native-guard-before-persistent-ddl', 'failed-ledger-observed', 'backup-restored'],
      });
    }

    const duplicateSku = `${resourcePrefix}_duplicate_sku`;
    progress('running duplicate SKU/index-drift preflight');
    cloneDatabase(duplicateSku, base51Dump);
    mysql(duplicateSku, `
      DROP INDEX product_skus_sku_code_key ON product_skus;
      INSERT INTO product_skus (product_id, sku_code, price)
      SELECT product_id, ' rehearsal-sku-001 ', price FROM product_skus LIMIT 1;
    `);
    const skuSchemaBefore = schemaFingerprint(duplicateSku);
    const skuDataBefore = sha256(dumpDatabase(duplicateSku));
    const skuIssues = expectPreflightIssues(duplicateSku, 51, [
      'duplicate_normalized_product_sku',
      'missing_product_sku_unique_index',
    ]);
    assert.equal(schemaFingerprint(duplicateSku), skuSchemaBefore);
    assert.equal(sha256(dumpDatabase(duplicateSku)), skuDataBefore);
    report.scenarios.push({
      name: 'duplicate-sku-and-index-drift', result: 'passed', issues: skuIssues,
      evidence: ['preflight-read-only', 'deploy-not-invoked', 'schema-and-data-unchanged'],
      applicability: 'The historical migrations do not recreate a manually removed SKU index; the rehearsal preflight is required.',
    });

    const wrongSkuIndex = `${resourcePrefix}_wrong_sku_index`;
    progress('running wrong-column SKU unique-index preflight');
    cloneDatabase(wrongSkuIndex, base51Dump);
    mysql(wrongSkuIndex, `
      DROP INDEX product_skus_sku_code_key ON product_skus;
      CREATE UNIQUE INDEX product_skus_sku_code_key ON product_skus(product_id, sku_code);
    `);
    const wrongIndexSchemaBefore = schemaFingerprint(wrongSkuIndex);
    const wrongIndexDataBefore = sha256(dumpDatabase(wrongSkuIndex));
    const wrongIndexIssues = expectPreflightIssues(wrongSkuIndex, 51, [
      'missing_product_sku_unique_index',
    ]);
    assert.equal(schemaFingerprint(wrongSkuIndex), wrongIndexSchemaBefore);
    assert.equal(sha256(dumpDatabase(wrongSkuIndex)), wrongIndexDataBefore);
    report.scenarios.push({
      name: 'wrong-column-sku-unique-index', result: 'passed', issues: wrongIndexIssues,
      evidence: ['exact-index-columns-rejected', 'deploy-not-invoked', 'schema-and-data-unchanged'],
    });

    const tamperedLedger = `${resourcePrefix}_tampered_ledger`;
    progress('running migration-ledger checksum preflight');
    cloneDatabase(tamperedLedger, base51Dump);
    mysql(tamperedLedger, `
      UPDATE _prisma_migrations SET checksum = REPEAT('0', 64)
      WHERE migration_name = '${migrationNames[0]}';
    `);
    const ledgerSchemaBefore = schemaFingerprint(tamperedLedger);
    const ledgerDumpBefore = sha256(dumpDatabase(tamperedLedger));
    assert.throws(() => preflight(tamperedLedger, 51), /checksum mismatch/i);
    assert.equal(schemaFingerprint(tamperedLedger), ledgerSchemaBefore);
    assert.equal(sha256(dumpDatabase(tamperedLedger)), ledgerDumpBefore);
    report.scenarios.push({
      name: 'migration-ledger-checksum-tamper', result: 'passed',
      evidence: ['checksum-rejected', 'deploy-not-invoked', 'schema-and-data-unchanged'],
    });

    mysql(null, `
      REVOKE INSERT, UPDATE, CREATE, ALTER, DROP, INDEX, REFERENCES, CREATE TEMPORARY TABLES
        ON \`${healthy}\`.* FROM \`${migrationUser}\`@'%';
      ALTER USER \`${migrationUser}\`@'%' ACCOUNT LOCK;
    `);
    const lockedLogin = migrationMysql(healthy, 'SELECT 1;', { allowFailure: true });
    assert.notEqual(lockedLogin.status, 0, 'Locked migration account unexpectedly accepted a new connection');
    const triggerAfterLock = mysql(healthy, `
      UPDATE orders
      SET confirmed_at = CURRENT_TIMESTAMP(3)
      WHERE order_no = 'REHEARSAL-ORDER-001';
    `, { allowFailure: true });
    assert.notEqual(triggerAfterLock.status, 0, 'Trigger enforcement failed after locking the definer account');
    assert.match(triggerAfterLock.stderr, /order customer confirmation facts must be paired/);
    const retainedPrivileges = parseRows(mysql(null, `
      SELECT privilege_type
      FROM information_schema.schema_privileges
      WHERE grantee = '${escapedGrantee}'
        AND table_schema = '${healthy}'
      ORDER BY privilege_type;
    `).stdout).map(([privilege]) => privilege);
    assert.deepEqual(retainedPrivileges, ['SELECT', 'TRIGGER']);
    report.scenarios.push({
      name: 'ordinary-migration-account-and-trigger-definer-lifecycle',
      result: 'passed',
      triggerCount: triggerDefiners.length,
      evidence: [
        'non-root-migrate-deploy',
        'schema-scoped-minimum-grants',
        'no-super',
        'binary-log-trigger-policy',
        'locked-definer-retained',
        'trigger-enforced-after-account-lock',
      ],
    });

    report.result = 'passed';
  } finally {
    assert.ok(containerName.startsWith('hc-db-upgrade-rehearsal-'));
    const cleanupErrors = [];
    const inspectBeforeCleanup = docker(['inspect', containerName], { allowFailure: true });
    if (containerCreated && inspectBeforeCleanup.status === 0) {
      const removal = docker(['rm', '--force', '--volumes', containerName], { allowFailure: true });
      if (removal.status !== 0) cleanupErrors.push('Failed to remove the isolated MySQL rehearsal container');
    } else if (!containerCreated && inspectBeforeCleanup.status === 0) {
      cleanupErrors.push('Container-name collision detected; the pre-existing container was not removed');
    }
    if (containerCreated && docker(['inspect', containerName], { allowFailure: true }).status === 0) {
      cleanupErrors.push('Isolated MySQL rehearsal container still exists after cleanup');
    }
    const resolvedTemp = path.resolve(tempDirectory);
    assert.ok(resolvedTemp.startsWith(`${expectedTempParent}${path.sep}`));
    assert.ok(path.basename(resolvedTemp).startsWith('db-upgrade-rehearsal-'));
    try {
      removeTree(resolvedTemp);
      if (fs.existsSync(resolvedTemp)) cleanupErrors.push('Rehearsal temp directory still exists after cleanup');
    } catch (error) {
      cleanupErrors.push(`Failed to remove rehearsal temp directory: ${error.message}`);
    }
    if (cleanupErrors.length > 0) throw new RehearsalError('Rehearsal cleanup failed', { cleanupErrors });
    report.cleanup = { containerRemoved: true, tempDirectoryRemoved: true, mysqlDataMount: 'tmpfs' };
  }
  progress('all scenarios passed and isolated resources were removed');
  process.stdout.write(`${JSON.stringify(report, null, 2)}${os.EOL}`);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((error) => {
    const payload = {
      result: 'failed',
      error: error.message,
      details: error.details ?? undefined,
    };
    console.error(JSON.stringify(payload, null, 2));
    if (error.stack) console.error(error.stack);
    process.exitCode = 1;
  });
}
