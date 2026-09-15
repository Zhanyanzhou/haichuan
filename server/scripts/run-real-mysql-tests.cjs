const { spawn, spawnSync } = require("node:child_process");
const { cpSync, mkdtempSync, realpathSync, rmSync } = require("node:fs");
const { createRequire } = require("node:module");
const { createServer } = require("node:net");
const { randomBytes } = require("node:crypto");
const { tmpdir } = require("node:os");
const path = require("node:path");

const DEFAULT_TEST_FILE_TIMEOUT_MS = 120_000;

const serverRoot = path.resolve(__dirname, "..");
const sharedTestFiles = [
  "src/common/notifications/reliable-notifications.mysql.spec.ts",
  "src/modules/auth/admin-auth-session.mysql.spec.ts",
  "src/modules/customers/customers.identity-isolation.mysql.spec.ts",
  "src/modules/customers/customers.sms-security.mysql.spec.ts",
  "src/modules/leads/leads.workflow.mysql.spec.ts",
  "src/modules/page-modules/dynamic-template-page-instance.real.spec.ts",
  "src/modules/page-modules/media-publication.real.mysql.spec.ts",
  "src/modules/orders/trade.real-db-concurrency.spec.ts",
  "src/modules/leads/leads.privacy-disposition.mysql.spec.ts",
  "src/modules/selection-inquiry/selection-inquiry.mysql.spec.ts",
  "src/modules/upload/media-immutability.mysql.spec.ts",
];
const isolatedTestSuites = [
  {
    name: "order-operations",
    file: "src/modules/orders/order-operations.real-http.mysql.spec.ts",
    environment: ({ databaseUrl, port, runId }) => ({
      ORDER_OPS_REAL_MYSQL_TEST: "1",
      ORDER_OPS_REAL_MYSQL_URL: databaseUrl,
      ORDER_OPS_RUN_ID: runId,
      ORDER_OPS_API_PORT: String(port),
      JWT_SECRET: `order-ops-${runId}-local-isolated-secret`,
    }),
  },
  {
    name: "product-governance",
    file: "src/modules/products/products.governance-media.mysql.spec.ts",
    environment: ({ databaseUrl }) => ({
      PRODUCT_GOV_REAL_MYSQL_TEST: "1",
      PRODUCT_GOV_REAL_MYSQL_URL: databaseUrl,
    }),
  },
  {
    name: "media-session-revocation",
    file: "src/modules/products/media-session-revocation.real-http.mysql.spec.ts",
    environment: ({ databaseUrl, runId }) => ({
      MEDIA_SESSION_REAL_MYSQL_TEST: "1",
      MEDIA_SESSION_REAL_MYSQL_URL: databaseUrl,
      MEDIA_SESSION_RUN_ID: runId,
    }),
  },
  {
    name: "quotation-commerce",
    file: "src/modules/quotations/quotation-commerce.real-http.mysql.spec.ts",
    environment: ({ databaseUrl, port, runId }) => ({
      QUOTATION_REAL_MYSQL_TEST: "1",
      QUOTATION_REAL_MYSQL_URL: databaseUrl,
      QUOTATION_RUN_ID: runId,
      QUOTATION_API_PORT: String(port),
      JWT_SECRET: `quotation-${runId}-local-isolated-secret`,
      RELEASE_PROFILE: "commerce",
      CUSTOMER_QUOTATION_ORDERING_ENABLED: "true",
      CUSTOMER_COMMERCE_ENABLED: "false",
      PAYMENT_GATEWAY_TRANSACTIONS_ENABLED: "false",
      PAYMENT_GATEWAY_REFUNDS_ENABLED: "false",
    }),
  },
  {
    name: "media-http",
    file: "src/modules/upload/upload.real-http.mysql.spec.ts",
    environment: ({ databaseUrl, port, runId }) => ({
      MEDIA_REAL_MYSQL_TEST: "1",
      MEDIA_REAL_MYSQL_URL: databaseUrl,
      MEDIA_REAL_RUN_ID: runId,
      MEDIA_REAL_API_PORT: String(port),
    }),
  },
];
const testFiles = [...sharedTestFiles, ...isolatedTestSuites.map(({ file }) => file)];

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

function assertCompleteTap(output, minimumTests = testFiles.length) {
  const normalized = output.replaceAll("\r", "");
  const counts = Object.fromEntries(
    ["tests", "pass", "fail", "skipped"].map((field) => {
      const value = Number(new RegExp(`^# ${field} (\\d+)$`, "m").exec(normalized)?.[1]);
      if (!Number.isInteger(value)) throw new Error(`REAL_MYSQL_INCOMPLETE_TEST_RUN:${field}`);
      return [field, value];
    }),
  );
  if (
    counts.tests < minimumTests
    || counts.pass !== counts.tests
    || counts.fail !== 0
    || counts.skipped !== 0
  ) {
    throw new Error("REAL_MYSQL_INCOMPLETE_TEST_RUN:summary");
  }
}

function discoverRealMysqlTests(root = serverRoot) {
  const discovered = [];
  const visit = (directory) => {
    for (const entry of require("node:fs").readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && /(real|mysql).*\.spec\.ts$/i.test(entry.name)) {
        discovered.push(path.relative(root, absolute).replaceAll(path.sep, "/"));
      }
    }
  };
  visit(path.join(root, "src"));
  return discovered.sort();
}

function assertCompleteInventory(discovered = discoverRealMysqlTests()) {
  const registered = [...testFiles].sort();
  const missing = discovered.filter((file) => !registered.includes(file));
  const stale = registered.filter((file) => !discovered.includes(file));
  if (missing.length || stale.length) {
    throw new Error(`REAL_MYSQL_TEST_INVENTORY_DRIFT:missing=${missing.join(",")};stale=${stale.join(",")}`);
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
    TS_NODE_PROJECT: path.join(serverRoot, "tsconfig.json"),
    TS_NODE_CWD: serverRoot,
  };
}

function prepareRunRoot(root = serverRoot) {
  const runRoot = mkdtempSync(path.join(tmpdir(), "haichuan-real-mysql-"));
  cpSync(path.join(root, "prisma"), path.join(runRoot, "prisma"), {
    recursive: true,
    filter: (source) => path.basename(source) !== ".env",
  });
  return runRoot;
}

function allocateLocalPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function redactMysqlUrls(output) {
  return output.replace(/mysql:\/\/[^\s"'`<>]+/gi, "mysql://[REDACTED]");
}

function terminateOwnedChildTree(child, platform = process.platform) {
  if (!child.pid) return false;
  if (platform === "win32") {
    const result = spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      encoding: "utf8",
      windowsHide: true,
      stdio: "ignore",
    });
    return result.status === 0;
  }
  try {
    process.kill(-child.pid, "SIGKILL");
    return true;
  } catch {
    try {
      child.kill("SIGKILL");
      return child.killed;
    } catch {
      return false;
    }
  }
}

function runOwnedChild(args, options = {}) {
  const {
    cwd,
    env,
    timeoutMs = DEFAULT_TEST_FILE_TIMEOUT_MS,
    onLine = () => {},
    writeStdout = (chunk) => process.stdout.write(chunk),
    writeStderr = (chunk) => process.stderr.write(chunk),
    terminate = terminateOwnedChildTree,
  } = options;
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    let timedOut = false;
    let cleanupSucceeded = false;
    let settled = false;
    let stdout = "";
    let stdoutPending = "";
    let stderrPending = "";
    const child = spawn(process.execPath, args, {
      cwd,
      env,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const emit = (channel, chunk, flush = false) => {
      const pendingName = channel === "stdout" ? "stdoutPending" : "stderrPending";
      let pending = (pendingName === "stdoutPending" ? stdoutPending : stderrPending) + chunk;
      let newlineIndex;
      while ((newlineIndex = pending.indexOf("\n")) >= 0) {
        const rawLine = pending.slice(0, newlineIndex + 1);
        pending = pending.slice(newlineIndex + 1);
        const safeLine = redactMysqlUrls(rawLine);
        if (channel === "stdout") {
          stdout += safeLine;
          writeStdout(safeLine);
        } else {
          writeStderr(safeLine);
        }
        onLine(safeLine.trim());
      }
      if (flush && pending) {
        const safeLine = redactMysqlUrls(pending);
        if (channel === "stdout") {
          stdout += safeLine;
          writeStdout(safeLine);
        } else {
          writeStderr(safeLine);
        }
        onLine(safeLine.trim());
        pending = "";
      }
      if (pendingName === "stdoutPending") stdoutPending = pending;
      else stderrPending = pending;
    };
    child.stdout.on("data", (chunk) => emit("stdout", chunk.toString("utf8")));
    child.stderr.on("data", (chunk) => emit("stderr", chunk.toString("utf8")));
    const timer = setTimeout(() => {
      timedOut = true;
      cleanupSucceeded = terminate(child);
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      reject(error);
    });
    child.once("close", (status, signal) => {
      clearTimeout(timer);
      emit("stdout", "", true);
      emit("stderr", "", true);
      if (settled) return;
      settled = true;
      const durationMs = Date.now() - startedAt;
      if (timedOut) {
        const error = new Error("REAL_MYSQL_TEST_TIMEOUT");
        error.code = "REAL_MYSQL_TEST_TIMEOUT";
        error.durationMs = durationMs;
        error.cleanupSucceeded = cleanupSucceeded;
        error.status = status;
        error.signal = signal;
        reject(error);
        return;
      }
      resolve({ status, signal, stdout, durationMs });
    });
  });
}

async function main() {
  const databaseUrl = validateTarget(process.env);
  if (Number(process.versions.node.split(".")[0]) !== 22) throw new Error("REAL_MYSQL_NODE_22_REQUIRED");
  assertCompleteInventory();
  // 必须在加载 Prisma 之前拒绝跨工作区 junction，避免生成客户端从原目录加载 .env。
  assertLocalDependencies(serverRoot);
  const env = buildTestEnvironment(process.env, databaseUrl);
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, env);
  const runRoot = prepareRunRoot();
  const run = (args, childEnv = env) => {
    const result = spawnSync(process.execPath, args, {
      cwd: runRoot, env: childEnv, encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
    });
    process.stdout.write(redactMysqlUrls(result.stdout || ""));
    process.stderr.write(redactMysqlUrls(result.stderr || ""));
    if (result.error || result.status !== 0) throw new Error("REAL_MYSQL_COMMAND_FAILED");
    return result.stdout;
  };
  const prismaCli = require.resolve("prisma/build/index.js");
  const tsNodeRegister = require.resolve("ts-node/register");
  const prismaSchema = path.join(runRoot, "prisma", "schema.prisma");
  const absoluteTestFiles = (files) => files.map((file) => path.join(serverRoot, file));
  const runTests = async (file, index, childEnv = env) => {
    const startedAt = Date.now();
    let lastStage = "process-started";
    console.log(`REAL_MYSQL_FILE_START: ${index}/${testFiles.length} ${file}; timeout_ms=${DEFAULT_TEST_FILE_TIMEOUT_MS}`);
    try {
      const result = await runOwnedChild([
        "--test", "--test-concurrency=1", "--test-reporter=tap", "-r", tsNodeRegister,
        ...absoluteTestFiles([file]),
      ], {
        cwd: runRoot,
        env: childEnv,
        timeoutMs: DEFAULT_TEST_FILE_TIMEOUT_MS,
        onLine: (line) => {
          const stage = /REAL_MYSQL_STAGE\s+(.+?)(?:\s+elapsed_ms=\d+)?$/.exec(line)?.[1];
          if (stage) lastStage = stage;
        },
      });
      if (result.status !== 0) throw new Error("REAL_MYSQL_COMMAND_FAILED");
      assertCompleteTap(result.stdout, 1);
      console.log(`REAL_MYSQL_FILE_COMPLETE: ${index}/${testFiles.length} ${file}; status=PASS; elapsed_ms=${Date.now() - startedAt}`);
    } catch (error) {
      const elapsedMs = Date.now() - startedAt;
      if (error?.code === "REAL_MYSQL_TEST_TIMEOUT") {
        const cleanup = error.cleanupSucceeded ? "PASS" : "FAIL";
        console.error(`REAL_MYSQL_FILE_TIMEOUT: ${index}/${testFiles.length} ${file}; elapsed_ms=${elapsedMs}; last_stage=${lastStage}; child_cleanup=${cleanup}`);
        if (!error.cleanupSucceeded) console.error(`REAL_MYSQL_CHILD_CLEANUP_FAILED: ${file}`);
      } else {
        console.error(`REAL_MYSQL_FILE_FAILED: ${index}/${testFiles.length} ${file}; elapsed_ms=${elapsedMs}; last_stage=${lastStage}`);
      }
      throw error;
    }
  };
  const resetDatabase = () => run([
    prismaCli, "migrate", "reset", "--force", "--skip-seed", "--skip-generate", "--schema", prismaSchema,
  ]);

  try {
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

    run([prismaCli, "migrate", "deploy", "--schema", prismaSchema]);
    run([prismaCli, "migrate", "status", "--schema", prismaSchema]);
    let completedFiles = 0;
    for (const [index, file] of sharedTestFiles.entries()) {
      if (index > 0) resetDatabase();
      await runTests(file, completedFiles + 1);
      completedFiles += 1;
    }

    for (const suite of isolatedTestSuites) {
      resetDatabase();
      const port = await allocateLocalPort();
      const runId = randomBytes(5).toString("hex");
      await runTests(suite.file, completedFiles + 1, {
        ...env,
        ...suite.environment({ databaseUrl, port, runId }),
      });
      completedFiles += 1;
    }

    const persistencePrisma = new PrismaClient({ datasourceUrl: databaseUrl });
    try {
      const suffix = randomBytes(6).toString("hex");
      const created = await persistencePrisma.category.create({
        data: { name: `隔离验证-${suffix}`, slug: `real-mysql-probe-${suffix}` },
      });
      const stored = await persistencePrisma.category.findUnique({ where: { id: created.id } });
      if (stored?.slug !== created.slug) throw new Error("REAL_MYSQL_PERSISTENCE_READBACK_FAILED");
      await persistencePrisma.category.delete({ where: { id: created.id } });
      console.log("REAL_MYSQL_PERSISTENCE_PROBE_PASS: synthetic category saved, read back and removed");
    } finally {
      await persistencePrisma.$disconnect();
    }

    console.log(`REAL_MYSQL_GATE_PASS: ${testFiles.length} real test files, 0 skipped; migrated disposable database`);
  } finally {
    rmSync(runRoot, { recursive: true, force: true });
  }
}

module.exports = {
  validateTarget,
  assertCompleteTap,
  assertLocalDependencies,
  assertCompleteInventory,
  buildTestEnvironment,
  discoverRealMysqlTests,
  prepareRunRoot,
  redactMysqlUrls,
  runOwnedChild,
  terminateOwnedChildTree,
  DEFAULT_TEST_FILE_TIMEOUT_MS,
  testFiles,
  isolatedTestSuites,
};
if (require.main === module) {
  main().catch((error) => {
    // Prisma 的异常可能包含连接信息，只保留本入口定义的错误码。
    console.error(/^REAL_MYSQL_[A-Z_:]+$/.test(error.message) ? error.message : "REAL_MYSQL_GATE_FAILED");
    process.exitCode = 1;
  });
}
