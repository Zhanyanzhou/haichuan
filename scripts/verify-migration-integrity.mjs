import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const prismaRoot = join(projectRoot, "server", "prisma");
const migrationsRoot = join(prismaRoot, "migrations");
const policyPath = join(prismaRoot, "migration-integrity-exceptions.json");
const sha256Pattern = /^[a-f0-9]{64}$/;
const knownLegacyException = {
  migrationName: "20260824115000_add_product_publication_quality",
  repositorySha256: "8d8c49582be821a458404abeabb2c1f9bd0039149d82d34154a228c9f17f5c3a",
  appliedLedgerSha256: "7afed2a64fb53d0064cf60c3bf8415f82bbe9261e4f98a2201804d1cd21d21de",
};

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function readRepositoryMigrations() {
  return readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const filePath = join(migrationsRoot, entry.name, "migration.sql");
      if (!existsSync(filePath)) {
        throw new Error(`MIGRATION_SQL_MISSING:${entry.name}`);
      }
      return {
        migrationName: entry.name,
        filePath,
        sha256: sha256(readFileSync(filePath)),
      };
    })
    .sort((left, right) => left.migrationName.localeCompare(right.migrationName));
}

function readPolicy() {
  const policy = JSON.parse(readFileSync(policyPath, "utf8"));
  if (policy?.schemaVersion !== 1 || !Array.isArray(policy.exceptions)) {
    throw new Error("MIGRATION_POLICY_INVALID");
  }
  return policy;
}

function assertPolicy(policy, migrations) {
  if (policy.exceptions.length !== 1) {
    throw new Error("MIGRATION_POLICY_MUST_HAVE_ONE_LEGACY_EXCEPTION");
  }
  const migrationsByName = new Map(
    migrations.map((migration) => [migration.migrationName, migration]),
  );
  const seen = new Set();

  for (const exception of policy.exceptions) {
    const name = exception?.migrationName;
    if (typeof name !== "string" || seen.has(name)) {
      throw new Error("MIGRATION_POLICY_DUPLICATE_OR_MISSING_NAME");
    }
    seen.add(name);
    if (
      exception.migrationName !== knownLegacyException.migrationName ||
      exception.repositorySha256 !== knownLegacyException.repositorySha256 ||
      exception.appliedLedgerSha256 !== knownLegacyException.appliedLedgerSha256
    ) {
      throw new Error("MIGRATION_POLICY_UNKNOWN_LEGACY_EXCEPTION");
    }

    const migration = migrationsByName.get(name);
    if (!migration) throw new Error(`MIGRATION_POLICY_FILE_MISSING:${name}`);
    if (!sha256Pattern.test(exception.repositorySha256 ?? "")) {
      throw new Error(`MIGRATION_POLICY_REPOSITORY_HASH_INVALID:${name}`);
    }
    if (!sha256Pattern.test(exception.appliedLedgerSha256 ?? "")) {
      throw new Error(`MIGRATION_POLICY_LEDGER_HASH_INVALID:${name}`);
    }
    if (migration.sha256 !== exception.repositorySha256) {
      throw new Error(`MIGRATION_POLICY_REPOSITORY_HASH_MISMATCH:${name}`);
    }
    if (
      !exception.schemaContract ||
      typeof exception.schemaContract.table !== "string" ||
      !Array.isArray(exception.schemaContract.columns) ||
      exception.schemaContract.columns.length === 0 ||
      typeof exception.schemaContract.index?.name !== "string" ||
      !Array.isArray(exception.schemaContract.index?.columns) ||
      exception.schemaContract.index.columns.length === 0
    ) {
      throw new Error(`MIGRATION_POLICY_SCHEMA_CONTRACT_INVALID:${name}`);
    }
  }
}

function migrationBundleSha256(migrations) {
  const hash = createHash("sha256");
  for (const migration of migrations) {
    hash.update(migration.migrationName);
    hash.update("\0");
    hash.update(migration.sha256);
    hash.update("\n");
  }
  return hash.digest("hex");
}

function isZeroSha(value) {
  return /^0+$/.test(value ?? "");
}

function commitExists(revision) {
  try {
    execFileSync("git", ["cat-file", "-e", `${revision}^{commit}`], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function verifyGitRange(base, head) {
  if (!base || !head) throw new Error("MIGRATION_GIT_RANGE_REQUIRED");
  if (isZeroSha(base)) {
    return { checked: false, reason: "INITIAL_PUSH_WITHOUT_BASE" };
  }
  if (!commitExists(base) || !commitExists(head)) {
    throw new Error("MIGRATION_GIT_RANGE_UNAVAILABLE");
  }

  const output = execFileSync(
    "git",
    [
      "diff",
      "--name-status",
      "--find-renames",
      base,
      head,
      "--",
      "server/prisma/migrations",
    ],
    { cwd: projectRoot, encoding: "utf8" },
  );
  const violations = [];

  for (const line of output.split(/\r?\n/).filter(Boolean)) {
    const [status, ...paths] = line.split("\t");
    const migrationPaths = paths.filter((path) => path.endsWith("/migration.sql"));
    if (migrationPaths.length === 0) continue;
    if (status === "A") continue;
    violations.push({ status, paths: migrationPaths });
  }

  if (violations.length > 0) {
    const details = violations
      .map((violation) => `${violation.status}:${violation.paths.join("->")}`)
      .join(",");
    throw new Error(`APPLIED_MIGRATION_MUTATION_FORBIDDEN:${details}`);
  }
  return { checked: true, changedMigrationSqlFiles: 0 };
}

function main() {
  const args = new Set(process.argv.slice(2));
  const migrations = readRepositoryMigrations();
  const policy = readPolicy();
  assertPolicy(policy, migrations);
  const bundleSha256 = migrationBundleSha256(migrations);

  if (args.has("--print-bundle-sha")) {
    process.stdout.write(`${bundleSha256}\n`);
    return;
  }

  const gitRange = args.has("--git-range")
    ? verifyGitRange(
        process.env.MIGRATION_BASE_SHA,
        process.env.MIGRATION_HEAD_SHA,
      )
    : { checked: false, reason: "NOT_REQUESTED" };

  console.log(JSON.stringify({
    ok: true,
    migrationCount: migrations.length,
    exceptionCount: policy.exceptions.length,
    bundleSha256,
    gitRange,
    policy: relative(projectRoot, policyPath).replaceAll("\\", "/"),
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    code: error instanceof Error ? error.message : "MIGRATION_INTEGRITY_FAILED",
  }));
  process.exitCode = 1;
}
