import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  lstatSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { TextDecoder } from "node:util";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const prismaRoot = join(projectRoot, "server", "prisma");
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

function runGit(root, args, options = {}) {
  return execFileSync("git", args, {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}

function assertGitAuthority(root) {
  // 本门禁以 HEAD/index 为历史权威；源码归档或嵌套在其他仓库中时必须失败关闭。
  let gitRoot;
  try {
    gitRoot = runGit(root, ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  } catch {
    throw new Error("MIGRATION_GIT_REPOSITORY_REQUIRED");
  }
  if (resolve(gitRoot) !== resolve(root)) {
    throw new Error("MIGRATION_GIT_ROOT_MISMATCH");
  }
  try {
    runGit(root, ["rev-parse", "--verify", "HEAD^{commit}"], { encoding: "utf8" });
  } catch {
    throw new Error("MIGRATION_GIT_HEAD_REQUIRED");
  }
}

function canonicalLfBytes(bytes, migrationName, source) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`MIGRATION_SQL_UTF8_INVALID:${migrationName}:${source}`);
  }

  const withoutCrlf = text.replaceAll("\r\n", "");
  if (withoutCrlf.includes("\r")) {
    throw new Error(`MIGRATION_SQL_EOL_INVALID:${migrationName}:${source}`);
  }
  if (text.includes("\r\n") && withoutCrlf.includes("\n")) {
    throw new Error(`MIGRATION_SQL_EOL_MIXED:${migrationName}:${source}`);
  }
  return Buffer.from(text.replaceAll("\r\n", "\n"), "utf8");
}

function parseGitEntries(output, pattern, source) {
  const entries = new Map();
  for (const record of output.toString("utf8").split("\0").filter(Boolean)) {
    const match = pattern.exec(record);
    if (!match) throw new Error(`MIGRATION_GIT_${source}_ENTRY_INVALID`);
    const [, mode, objectType, objectId, stage, path] = match;
    if (!/^server\/prisma\/migrations\/[^/]+\/migration\.sql$/.test(path)) continue;
    if (stage && stage !== "0") {
      throw new Error(`MIGRATION_INDEX_UNMERGED:${path}`);
    }
    entries.set(path, { mode, objectType, objectId, path });
  }
  return entries;
}

function readHeadMigrationEntries(root) {
  const output = runGit(
    root,
    ["ls-tree", "-r", "-z", "HEAD", "--", "server/prisma/migrations"],
  );
  return parseGitEntries(
    output,
    /^(\d{6}) (\S+) ([a-f0-9]+)()\t(.+)$/,
    "HEAD",
  );
}

function readIndexMigrationEntries(root) {
  const output = runGit(
    root,
    ["ls-files", "--stage", "-z", "--", "server/prisma/migrations"],
  );
  return parseGitEntries(
    output,
    /^(\d{6}) ()([a-f0-9]+) (\d)\t(.+)$/,
    "INDEX",
  );
}

function readGitBlob(root, object, migrationName, source) {
  try {
    return runGit(root, ["show", object]);
  } catch {
    throw new Error(`MIGRATION_${source}_FILE_MISSING:${migrationName}`);
  }
}

function assertRegularWorkspaceFile(filePath, migrationName) {
  let stats;
  try {
    stats = lstatSync(filePath);
  } catch {
    throw new Error(`MIGRATION_SQL_MISSING:${migrationName}`);
  }
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`MIGRATION_WORKTREE_FILE_TYPE_INVALID:${migrationName}`);
  }
  return stats;
}

function assertWorktreeMode(headMode, stats, migrationName) {
  if (process.platform === "win32") return;
  const headExecutable = headMode === "100755";
  const worktreeExecutable = Boolean(stats.mode & 0o111);
  if (headExecutable !== worktreeExecutable) {
    throw new Error(`MIGRATION_WORKTREE_MODE_MISMATCH:${migrationName}`);
  }
}

function workspaceMigrationEntries(root) {
  const rootPath = join(root, "server", "prisma", "migrations");
  const entries = [];
  for (const entry of readdirSync(rootPath, { withFileTypes: true })) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    if (entry.isSymbolicLink()) {
      throw new Error(`MIGRATION_WORKTREE_DIRECTORY_TYPE_INVALID:${entry.name}`);
    }
    entries.push({
      migrationName: entry.name,
      relativePath: `server/prisma/migrations/${entry.name}/migration.sql`,
      filePath: join(rootPath, entry.name, "migration.sql"),
    });
  }
  return entries.sort((left, right) => left.migrationName.localeCompare(right.migrationName));
}

export function readRepositoryMigrations(root = projectRoot) {
  assertGitAuthority(root);
  const headEntries = readHeadMigrationEntries(root);
  const indexEntries = readIndexMigrationEntries(root);
  const workspaceEntries = workspaceMigrationEntries(root);
  const workspaceByPath = new Map(
    workspaceEntries.map((entry) => [entry.relativePath, entry]),
  );
  const migrations = [];

  for (const [relativePath, headEntry] of [...headEntries].sort()) {
    const migrationName = relativePath.split("/").at(-2);
    if (headEntry.objectType !== "blob" || !/^100(?:644|755)$/.test(headEntry.mode)) {
      throw new Error(`MIGRATION_HEAD_FILE_TYPE_INVALID:${migrationName}`);
    }
    if (headEntry.mode !== "100644") {
      throw new Error(`MIGRATION_HEAD_FILE_MODE_INVALID:${migrationName}:${headEntry.mode}`);
    }
    const indexEntry = indexEntries.get(relativePath);
    if (
      !indexEntry ||
      indexEntry.objectId !== headEntry.objectId ||
      indexEntry.mode !== headEntry.mode
    ) {
      throw new Error(`MIGRATION_INDEX_MISMATCH:${migrationName}`);
    }
    const entry = workspaceByPath.get(relativePath);
    if (!entry) {
      throw new Error(`MIGRATION_SQL_MISSING:${migrationName}`);
    }
    const worktreeStats = assertRegularWorkspaceFile(entry.filePath, migrationName);
    assertWorktreeMode(headEntry.mode, worktreeStats, migrationName);

    const headBytes = readGitBlob(root, `HEAD:${relativePath}`, migrationName, "HEAD");
    const canonicalHeadBytes = canonicalLfBytes(headBytes, migrationName, "HEAD");
    if (!headBytes.equals(canonicalHeadBytes)) {
      throw new Error(`MIGRATION_GIT_BLOB_EOL_INVALID:${migrationName}`);
    }

    const indexBytes = readGitBlob(root, `:${relativePath}`, migrationName, "INDEX");
    if (!indexBytes.equals(headBytes)) {
      throw new Error(`MIGRATION_INDEX_MISMATCH:${migrationName}`);
    }

    const workspaceBytes = canonicalLfBytes(
      readFileSync(entry.filePath),
      migrationName,
      "WORKTREE",
    );
    if (!workspaceBytes.equals(headBytes)) {
      throw new Error(`MIGRATION_WORKTREE_CONTENT_MISMATCH:${migrationName}`);
    }

    migrations.push({
      migrationName,
      filePath: entry.filePath,
      sha256: sha256(headBytes),
      source: "HEAD",
    });
  }

  const newPaths = new Set([
    ...[...indexEntries.keys()].filter((path) => !headEntries.has(path)),
    ...[...workspaceByPath.keys()].filter((path) => !headEntries.has(path)),
  ]);
  for (const relativePath of [...newPaths].sort()) {
    const migrationName = relativePath.split("/").at(-2);
    const indexEntry = indexEntries.get(relativePath);
    if (indexEntry && !/^100(?:644|755)$/.test(indexEntry.mode)) {
      throw new Error(`MIGRATION_INDEX_FILE_TYPE_INVALID:${migrationName}`);
    }
    if (indexEntry && indexEntry.mode !== "100644") {
      throw new Error(`MIGRATION_INDEX_FILE_MODE_INVALID:${migrationName}:${indexEntry.mode}`);
    }
    const entry = workspaceByPath.get(relativePath);
    if (!entry) throw new Error(`MIGRATION_SQL_MISSING:${migrationName}`);
    const worktreeStats = assertRegularWorkspaceFile(entry.filePath, migrationName);
    if (process.platform !== "win32" && Boolean(worktreeStats.mode & 0o111)) {
      throw new Error(`MIGRATION_WORKTREE_MODE_MISMATCH:${migrationName}`);
    }
    const canonicalBytes = canonicalLfBytes(
      readFileSync(entry.filePath),
      migrationName,
      "WORKTREE",
    );
    if (indexEntry) {
      const indexBytes = canonicalLfBytes(
        readGitBlob(root, `:${relativePath}`, migrationName, "INDEX"),
        migrationName,
        "INDEX",
      );
      if (!indexBytes.equals(canonicalBytes)) {
        throw new Error(`MIGRATION_NEW_INDEX_WORKTREE_MISMATCH:${migrationName}`);
      }
    }
    migrations.push({
      migrationName,
      filePath: entry.filePath,
      sha256: sha256(canonicalBytes),
      source: "WORKTREE_NEW",
    });
  }

  return migrations.sort((left, right) => left.migrationName.localeCompare(right.migrationName));
}

function readPolicy() {
  const policy = JSON.parse(readFileSync(policyPath, "utf8"));
  if (policy?.schemaVersion !== 1 || !Array.isArray(policy.exceptions)) {
    throw new Error("MIGRATION_POLICY_INVALID");
  }
  return policy;
}

// 只允许这两个已审计目录共享历史时间戳；替换其中任一目录或新增第三个目录都失败。
const knownDuplicateTimestampGroups = new Map([
  ["20260814120000", [
    "20260814120000_drop_dead_tables",
    "20260814120000_seed_attribute_dictionary",
  ]],
]);

export function assertUniqueTimestamps(migrations) {
  const namesByTimestamp = new Map();
  for (const migration of migrations) {
    const timestamp = migration.migrationName.slice(0, 14);
    const names = namesByTimestamp.get(timestamp) ?? [];
    names.push(migration.migrationName);
    namesByTimestamp.set(timestamp, names);
  }
  for (const [timestamp, expectedNames] of knownDuplicateTimestampGroups) {
    const actualNames = [...(namesByTimestamp.get(timestamp) ?? [])].sort();
    const expected = [...expectedNames].sort();
    if (actualNames.length !== expected.length || actualNames.some((name, index) => name !== expected[index])) {
      throw new Error(`MIGRATION_LEGACY_TIMESTAMP_GROUP_MISMATCH:${timestamp}:${actualNames.join(",")}`);
    }
  }
  for (const [timestamp, names] of namesByTimestamp) {
    if (names.length > 1 && !knownDuplicateTimestampGroups.has(timestamp)) {
      throw new Error(`MIGRATION_TIMESTAMP_DUPLICATED:${timestamp}:${names.join(",")}`);
    }
  }
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

function resolveCommit(root, revision) {
  try {
    return runGit(root, ["rev-parse", "--verify", `${revision}^{commit}`], {
      encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }
}

export function verifyGitRange(base, head, root = projectRoot) {
  if (!base || !head) throw new Error("MIGRATION_GIT_RANGE_REQUIRED");
  if (isZeroSha(base)) {
    throw new Error("MIGRATION_INITIAL_PUSH_BASE_REQUIRED");
  }
  assertGitAuthority(root);
  const baseCommit = resolveCommit(root, base);
  const headCommit = resolveCommit(root, head);
  if (!baseCommit || !headCommit) {
    throw new Error("MIGRATION_GIT_RANGE_UNAVAILABLE");
  }
  const currentHead = resolveCommit(root, "HEAD");
  if (headCommit !== currentHead) {
    throw new Error("MIGRATION_GIT_RANGE_HEAD_MISMATCH");
  }

  const output = runGit(
    root,
    [
      "diff",
      "--name-status",
      "--find-renames",
      baseCommit,
      headCommit,
      "--",
      "server/prisma/migrations",
    ],
    { encoding: "utf8" },
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
  assertUniqueTimestamps(migrations);
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

const isDirectExecution = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isDirectExecution) {
  try {
    main();
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      code: error instanceof Error ? error.message : "MIGRATION_INTEGRITY_FAILED",
    }));
    process.exitCode = 1;
  }
}
