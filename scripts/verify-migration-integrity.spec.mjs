import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertUniqueTimestamps,
  verifyGitRange,
} from "./verify-migration-integrity.mjs";

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureMigrationNames = [
  "20260814120000_drop_dead_tables",
  "20260814120000_seed_attribute_dictionary",
  "20260824115000_add_product_publication_quality",
];

function git(root, args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function gitBlob(root, object) {
  return execFileSync("git", ["show", object], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function fixtureMigrationPath(root, migrationName) {
  return join(root, "server", "prisma", "migrations", migrationName, "migration.sql");
}

function createFixture(t, { initializeGit = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "migration-integrity-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, "server", "prisma", "migrations"), { recursive: true });
  copyFileSync(
    join(sourceRoot, "scripts", "verify-migration-integrity.mjs"),
    join(root, "scripts", "verify-migration-integrity.mjs"),
  );
  copyFileSync(
    join(sourceRoot, "server", "prisma", "migration-integrity-exceptions.json"),
    join(root, "server", "prisma", "migration-integrity-exceptions.json"),
  );
  writeFileSync(join(root, ".gitattributes"), "*.sql text eol=lf\n", "utf8");

  for (const migrationName of fixtureMigrationNames) {
    const destination = fixtureMigrationPath(root, migrationName);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(
      destination,
      gitBlob(
        sourceRoot,
        `HEAD:server/prisma/migrations/${migrationName}/migration.sql`,
      ),
    );
  }

  if (initializeGit) {
    git(root, ["init", "--quiet"]);
    git(root, ["config", "user.email", "migration-integrity@example.invalid"]);
    git(root, ["config", "user.name", "Migration Integrity Fixture"]);
    git(root, ["add", "."]);
    git(root, ["commit", "--quiet", "-m", "fixture baseline"]);
  }
  return root;
}

function spawnVerifier(root, args, extraEnvironment = {}) {
  return spawnSync(
    process.execPath,
    [join(root, "scripts", "verify-migration-integrity.mjs"), ...args],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, ...extraEnvironment },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}

function runVerifier(root, ...args) {
  return spawnVerifier(root, args);
}

function runVerifierWithEnvironment(root, extraEnvironment, ...args) {
  return spawnVerifier(root, args, extraEnvironment);
}

function runBundle(root) {
  const result = runVerifier(root, "--print-bundle-sha");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout.trim(), /^[a-f0-9]{64}$/);
  return result.stdout.trim();
}

function assertVerifierFailure(result, code) {
  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.ok(result.stderr.includes(code), result.stderr);
}

function crlf(bytes) {
  return Buffer.from(bytes.toString("utf8").replaceAll("\n", "\r\n"), "utf8");
}

const migration = (migrationName) => ({ migrationName });
const legacyPair = [
  migration("20260814120000_drop_dead_tables"),
  migration("20260814120000_seed_attribute_dictionary"),
];

test("allows only the exact two audited legacy directories", () => {
  assert.doesNotThrow(() => assertUniqueTimestamps([
    ...legacyPair,
    migration("20260815120000_new_migration"),
  ]));
});

test("rejects a third directory at the legacy timestamp", () => {
  assert.throws(
    () => assertUniqueTimestamps([...legacyPair, migration("20260814120000_third_directory")]),
    (error) => error?.message === "MIGRATION_LEGACY_TIMESTAMP_GROUP_MISMATCH:20260814120000:20260814120000_drop_dead_tables,20260814120000_seed_attribute_dictionary,20260814120000_third_directory",
  );
});

test("rejects replacing either audited legacy directory", () => {
  assert.throws(
    () => assertUniqueTimestamps([
      migration("20260814120000_drop_dead_tables"),
      migration("20260814120000_replacement"),
    ]),
    (error) => error?.message === "MIGRATION_LEGACY_TIMESTAMP_GROUP_MISMATCH:20260814120000:20260814120000_drop_dead_tables,20260814120000_replacement",
  );
});

test("rejects any new duplicate timestamp", () => {
  assert.throws(
    () => assertUniqueTimestamps([
      ...legacyPair,
      migration("20260906120000_first"),
      migration("20260906120000_second"),
    ]),
    (error) => error?.message === "MIGRATION_TIMESTAMP_DUPLICATED:20260906120000:20260906120000_first,20260906120000_second",
  );
});

test("fails closed for an all-zero initial-push base", () => {
  assert.throws(
    () => verifyGitRange("0".repeat(40), "a".repeat(40)),
    (error) => error?.message === "MIGRATION_INITIAL_PUSH_BASE_REQUIRED",
  );
});

test("tracked LF and CRLF worktrees produce the same Git-authoritative bundle", (t) => {
  const root = createFixture(t);
  const lfBundle = runBundle(root);

  for (const migrationName of fixtureMigrationNames) {
    const filePath = fixtureMigrationPath(root, migrationName);
    writeFileSync(filePath, crlf(readFileSync(filePath)));
  }

  assert.equal(runBundle(root), lfBundle);
});

test("rejects a real SQL change in a tracked migration", (t) => {
  const root = createFixture(t);
  const migrationName = "20260824115000_add_product_publication_quality";
  const filePath = fixtureMigrationPath(root, migrationName);
  writeFileSync(filePath, Buffer.concat([readFileSync(filePath), Buffer.from("\nSELECT 1;\n")]));

  assertVerifierFailure(
    runVerifier(root),
    `MIGRATION_WORKTREE_CONTENT_MISMATCH:${migrationName}`,
  );
});

test("rejects a non-newline whitespace change in a tracked migration", (t) => {
  const root = createFixture(t);
  const migrationName = "20260824115000_add_product_publication_quality";
  const filePath = fixtureMigrationPath(root, migrationName);
  writeFileSync(filePath, Buffer.concat([readFileSync(filePath), Buffer.from(" ")]));

  assertVerifierFailure(
    runVerifier(root),
    `MIGRATION_WORKTREE_CONTENT_MISMATCH:${migrationName}`,
  );
});

test("rejects a staged historical mutation even when worktree bytes match HEAD", (t) => {
  const root = createFixture(t);
  const migrationName = "20260814120000_drop_dead_tables";
  const relativePath = `server/prisma/migrations/${migrationName}/migration.sql`;
  const filePath = fixtureMigrationPath(root, migrationName);
  writeFileSync(filePath, Buffer.concat([readFileSync(filePath), Buffer.from("\nSELECT 1;\n")]));
  git(root, ["add", "--", relativePath]);
  writeFileSync(filePath, gitBlob(root, `HEAD:${relativePath}`));

  assertVerifierFailure(
    runVerifier(root),
    `MIGRATION_INDEX_MISMATCH:${migrationName}`,
  );
});

test("includes untracked and staged-new regular migrations with an LF-stable bundle", (t) => {
  const root = createFixture(t);
  const baselineBundle = runBundle(root);
  const migrationName = "20260906180000_fixture_forward_migration";
  const relativePath = `server/prisma/migrations/${migrationName}/migration.sql`;
  const filePath = fixtureMigrationPath(root, migrationName);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, "CREATE TABLE fixture (\n  id INT NOT NULL\n);\n", "utf8");

  const lfBundle = runBundle(root);
  assert.notEqual(lfBundle, baselineBundle);
  const result = runVerifier(root);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).migrationCount, fixtureMigrationNames.length + 1);

  git(root, ["add", "--", relativePath]);
  writeFileSync(filePath, crlf(readFileSync(filePath)));
  assert.equal(runBundle(root), lfBundle);
});

test("rejects mixed LF and CRLF in a new migration", (t) => {
  const root = createFixture(t);
  const migrationName = "20260906180100_mixed_eol";
  const filePath = fixtureMigrationPath(root, migrationName);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, "CREATE TABLE mixed (\r\n  id INT\n);\r\n", "utf8");

  assertVerifierFailure(
    runVerifier(root),
    `MIGRATION_SQL_EOL_MIXED:${migrationName}:WORKTREE`,
  );
});

test("rejects bare carriage returns in a new migration", (t) => {
  const root = createFixture(t);
  const migrationName = "20260906180200_invalid_eol";
  const filePath = fixtureMigrationPath(root, migrationName);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, "CREATE TABLE invalid (\r  id INT\r);\r", "utf8");

  assertVerifierFailure(
    runVerifier(root),
    `MIGRATION_SQL_EOL_INVALID:${migrationName}:WORKTREE`,
  );
});

test("fails closed outside the repository that owns the migration HEAD", (t) => {
  const root = createFixture(t, { initializeGit: false });

  assertVerifierFailure(runVerifier(root), "MIGRATION_GIT_REPOSITORY_REQUIRED");
});

test("binds the supplied range head to the repository current HEAD", (t) => {
  const root = createFixture(t);
  const oldHead = git(root, ["rev-parse", "HEAD"]).trim();
  const migrationName = "20260814120000_drop_dead_tables";
  const filePath = fixtureMigrationPath(root, migrationName);
  writeFileSync(filePath, Buffer.concat([readFileSync(filePath), Buffer.from("\nSELECT 1;\n")]));
  git(root, ["add", "--", `server/prisma/migrations/${migrationName}/migration.sql`]);
  git(root, ["commit", "--quiet", "-m", "tampered historical migration"]);

  assertVerifierFailure(
    runVerifierWithEnvironment(
      root,
      { MIGRATION_BASE_SHA: oldHead, MIGRATION_HEAD_SHA: oldHead },
      "--git-range",
    ),
    "MIGRATION_GIT_RANGE_HEAD_MISMATCH",
  );
});

test("fails closed when range verification is pointed at a nested repository path", (t) => {
  const root = createFixture(t);
  const head = git(root, ["rev-parse", "HEAD"]).trim();

  assert.throws(
    () => verifyGitRange(head, head, join(root, "scripts")),
    (error) => error?.message === "MIGRATION_GIT_ROOT_MISMATCH",
  );
});

test("rejects a tracked migration replaced by a same-content symlink", (t) => {
  const root = createFixture(t);
  const migrationName = "20260814120000_drop_dead_tables";
  const filePath = fixtureMigrationPath(root, migrationName);
  const targetPath = join(dirname(filePath), "same-content.sql");
  renameSync(filePath, targetPath);
  symlinkSync("same-content.sql", filePath, "file");

  assertVerifierFailure(
    runVerifier(root),
    `MIGRATION_WORKTREE_FILE_TYPE_INVALID:${migrationName}`,
  );
});

test("rejects an untracked new migration symlink", (t) => {
  const root = createFixture(t);
  const migrationName = "20260906180300_untracked_symlink";
  const filePath = fixtureMigrationPath(root, migrationName);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(join(dirname(filePath), "target.sql"), "SELECT 1;\n", "utf8");
  symlinkSync("target.sql", filePath, "file");

  assertVerifierFailure(
    runVerifier(root),
    `MIGRATION_WORKTREE_FILE_TYPE_INVALID:${migrationName}`,
  );
});

test("rejects a staged-new migration symlink", (t) => {
  const root = createFixture(t);
  const migrationName = "20260906180400_staged_symlink";
  const relativePath = `server/prisma/migrations/${migrationName}/migration.sql`;
  const filePath = fixtureMigrationPath(root, migrationName);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(join(dirname(filePath), "target.sql"), "SELECT 1;\n", "utf8");
  symlinkSync("target.sql", filePath, "file");
  git(root, ["add", "--", relativePath]);

  assertVerifierFailure(
    runVerifier(root),
    `MIGRATION_INDEX_FILE_TYPE_INVALID:${migrationName}`,
  );
});

test("rejects a staged-new migration deleted from the worktree", (t) => {
  const root = createFixture(t);
  const migrationName = "20260906180500_staged_then_deleted";
  const relativePath = `server/prisma/migrations/${migrationName}/migration.sql`;
  const filePath = fixtureMigrationPath(root, migrationName);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, "SELECT 1;\n", "utf8");
  git(root, ["add", "--", relativePath]);
  unlinkSync(filePath);

  assertVerifierFailure(
    runVerifier(root),
    `MIGRATION_SQL_MISSING:${migrationName}`,
  );
});

test("rejects invalid UTF-8 in a new migration", (t) => {
  const root = createFixture(t);
  const migrationName = "20260906180600_invalid_utf8";
  const filePath = fixtureMigrationPath(root, migrationName);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, Buffer.from([0xc3, 0x28]));

  assertVerifierFailure(
    runVerifier(root),
    `MIGRATION_SQL_UTF8_INVALID:${migrationName}:WORKTREE`,
  );
});

test("rejects a tracked migration deleted from the worktree", (t) => {
  const root = createFixture(t);
  const migrationName = "20260814120000_drop_dead_tables";
  unlinkSync(fixtureMigrationPath(root, migrationName));

  assertVerifierFailure(
    runVerifier(root),
    `MIGRATION_SQL_MISSING:${migrationName}`,
  );
});

test("rejects a tracked migration renamed in the worktree", (t) => {
  const root = createFixture(t);
  const migrationName = "20260814120000_drop_dead_tables";
  const filePath = fixtureMigrationPath(root, migrationName);
  renameSync(filePath, join(dirname(filePath), "renamed.sql"));

  assertVerifierFailure(
    runVerifier(root),
    `MIGRATION_SQL_MISSING:${migrationName}`,
  );
});

test("rejects staged-new index and worktree content drift", (t) => {
  const root = createFixture(t);
  const migrationName = "20260906180700_staged_content_drift";
  const relativePath = `server/prisma/migrations/${migrationName}/migration.sql`;
  const filePath = fixtureMigrationPath(root, migrationName);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, "SELECT 1;\n", "utf8");
  git(root, ["add", "--", relativePath]);
  writeFileSync(filePath, "SELECT 2;\n", "utf8");

  assertVerifierFailure(
    runVerifier(root),
    `MIGRATION_NEW_INDEX_WORKTREE_MISMATCH:${migrationName}`,
  );
});

test("accepts staged-new index LF and equivalent worktree CRLF", (t) => {
  const root = createFixture(t);
  const migrationName = "20260906180800_staged_crlf_equivalent";
  const relativePath = `server/prisma/migrations/${migrationName}/migration.sql`;
  const filePath = fixtureMigrationPath(root, migrationName);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, "CREATE TABLE staged_crlf (\n  id INT NOT NULL\n);\n", "utf8");
  git(root, ["add", "--", relativePath]);
  writeFileSync(filePath, crlf(readFileSync(filePath)));

  const result = runVerifier(root);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).migrationCount, fixtureMigrationNames.length + 1);
});

test("rejects staged-new migration mode 100755", (t) => {
  const root = createFixture(t);
  const migrationName = "20260906180900_staged_executable";
  const relativePath = `server/prisma/migrations/${migrationName}/migration.sql`;
  const filePath = fixtureMigrationPath(root, migrationName);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, "SELECT 1;\n", "utf8");
  git(root, ["add", "--", relativePath]);
  git(root, ["update-index", "--chmod=+x", "--", relativePath]);

  assertVerifierFailure(
    runVerifier(root),
    `MIGRATION_INDEX_FILE_MODE_INVALID:${migrationName}:100755`,
  );
});
