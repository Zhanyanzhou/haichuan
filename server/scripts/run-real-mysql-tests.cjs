const { spawnSync } = require("node:child_process");
const { existsSync, realpathSync } = require("node:fs");
const { createRequire } = require("node:module");
const path = require("node:path");

const serverRoot = path.resolve(__dirname, "..");
const testFiles = [
  "src/modules/page-modules/dynamic-template-page-instance.real.spec.ts",
  "src/modules/orders/trade.real-db-concurrency.spec.ts",
  "src/modules/leads/leads.privacy-disposition.mysql.spec.ts",
  "src/modules/upload/media-immutability.mysql.spec.ts",
];

function validateTarget(env) {
  if (env.REAL_MYSQL_TEST_ISOLATED !== "1") throw new Error("REAL_MYSQL_ISOLATION_REQUIRED");
  let target;
  try {
    target = new URL(env.REAL_MYSQL_TEST_DATABASE_URL);
  } catch {
    throw new Error("REAL_MYSQL_EXPLICIT_DATABASE_URL_REQUIRED");
  }
  if (
    target.protocol !== "mysql:"
    || !["127.0.0.1", "localhost"].includes(target.hostname)
    || target.pathname !== "/haichuan_ci_real_tests"
    || !target.username || !target.password
    || target.search || target.hash
  ) throw new Error("REAL_MYSQL_TARGET_NOT_DISPOSABLE_TEST_DATABASE");
  return target.href;
}

function assertCompleteTap(output) {
  for (const [field, expected] of [["tests", testFiles.length], ["pass", testFiles.length], ["fail", 0], ["skipped", 0]]) {
    if (!new RegExp(`^# ${field} ${expected}$`, "m").test(output.replaceAll("\r", ""))) {
      throw new Error(`REAL_MYSQL_INCOMPLETE_TEST_RUN:${field}`);
    }
  }
}

function assertLocalDependencies(root, resolveRealPath = realpathSync) {
  const realRoot = resolveRealPath(root);
  const expectedModules = path.join(realRoot, "node_modules");
  if (resolveRealPath(path.join(root, "node_modules")) !== expectedModules) {
    throw new Error("REAL_MYSQL_EXTERNAL_NODE_MODULES_FORBIDDEN");
  }
  const resolveFromServer = createRequire(path.join(root, "package.json"));
  for (const entry of ["@prisma/client", ".prisma/client/default", "prisma/build/index.js", "ts-node/register"]) {
    const resolved = resolveRealPath(resolveFromServer.resolve(entry));
    const relative = path.relative(expectedModules, resolved);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error("REAL_MYSQL_EXTERNAL_DEPENDENCY_FORBIDDEN");
    }
  }
}

function buildTestEnvironment(source, databaseUrl) {
  // 仅继承进程运行所需平台信息；禁用 NODE_OPTIONS、NODE_PATH 和所有业务集成配置。
  const platformKeys = new Set(["PATH", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "TMPDIR", "LANG", "LC_ALL", "TZ"]);
  const env = Object.fromEntries(Object.entries(source).filter(([key, value]) => platformKeys.has(key.toUpperCase()) && value !== undefined));
  return {
    ...env,
    CI: "true",
    CHECKPOINT_DISABLE: "1",
    PRISMA_HIDE_UPDATE_MESSAGE: "1",
    REAL_MYSQL_TEST_ISOLATED: "1",
    REAL_MYSQL_TEST_DATABASE_URL: databaseUrl,
    DATABASE_URL: databaseUrl,
    TRADE_REAL_DB_URL: databaseUrl,
    PRIVACY_TEST_DATABASE_URL: databaseUrl,
    DYNAMIC_TEMPLATE_REAL_DB_TEST: "1",
  };
}

function redactMysqlUrls(output) {
  return output.replace(/mysql:\/\/[^\s"'`<>]+/gi, "mysql://[REDACTED]");
}

async function main() {
  const databaseUrl = validateTarget(process.env);
  if (Number(process.versions.node.split(".")[0]) !== 22) throw new Error("REAL_MYSQL_NODE_22_REQUIRED");
  // Prisma CLI 会自动加载 .env；隔离工作副本不得带入真实环境文件。
  for (const file of [".env", "prisma/.env"]) {
    if (existsSync(path.join(serverRoot, file))) throw new Error("REAL_MYSQL_ENV_FILE_PRESENT");
  }
  // 必须在加载 Prisma 之前拒绝跨工作区 junction，避免生成客户端从原目录加载 .env。
  assertLocalDependencies(serverRoot);
  const env = buildTestEnvironment(process.env, databaseUrl);
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, env);
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    const tables = await prisma.$queryRaw`
      SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()
    `;
    if (tables.length !== 0) throw new Error("REAL_MYSQL_DATABASE_MUST_BE_EMPTY");
  } finally {
    await prisma.$disconnect();
  }
  const run = (args) => {
    const result = spawnSync(process.execPath, args, {
      cwd: serverRoot, env, encoding: "utf8", maxBuffer: 8 * 1024 * 1024,
    });
    process.stdout.write(redactMysqlUrls(result.stdout || ""));
    process.stderr.write(redactMysqlUrls(result.stderr || ""));
    if (result.error || result.status !== 0) throw new Error("REAL_MYSQL_COMMAND_FAILED");
    return result.stdout;
  };
  const prismaCli = require.resolve("prisma/build/index.js");
  run([prismaCli, "migrate", "deploy"]);
  run([prismaCli, "migrate", "status"]);
  const output = run([
    "--test", "--test-concurrency=1", "--test-reporter=tap", "-r", "ts-node/register", ...testFiles,
  ]);
  assertCompleteTap(output);
  console.log(`REAL_MYSQL_GATE_PASS: ${testFiles.length} real tests, 0 skipped; migrated disposable database`);
}

module.exports = { validateTarget, assertCompleteTap, assertLocalDependencies, buildTestEnvironment, redactMysqlUrls };
if (require.main === module) {
  main().catch((error) => {
    // Prisma 的异常可能包含连接信息，只保留本入口定义的错误码。
    console.error(/^REAL_MYSQL_[A-Z_:]+$/.test(error.message) ? error.message : "REAL_MYSQL_GATE_FAILED");
    process.exitCode = 1;
  });
}
