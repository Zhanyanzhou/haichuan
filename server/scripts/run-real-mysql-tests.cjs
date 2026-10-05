const { spawn, spawnSync } = require("node:child_process");
const { cpSync, mkdtempSync, realpathSync, rmSync } = require("node:fs");
const { createRequire } = require("node:module");
const { createServer } = require("node:net");
const { randomBytes } = require("node:crypto");
const { tmpdir } = require("node:os");
const path = require("node:path");

const DEFAULT_TEST_FILE_TIMEOUT_MS = 120_000;
const REQUIRED_MIGRATION_SESSION_COLLATION = "utf8mb4_unicode_ci";
const REQUIRED_MIGRATION_DATABASE_COLLATION = "utf8mb4_unicode_ci";
const REQUIRED_MIGRATION_SERVER_CHARACTER_SET = "utf8mb4";
const REQUIRED_MIGRATION_SERVER_COLLATION = "utf8mb4_unicode_ci";

const serverRoot = path.resolve(__dirname, "..");
const sharedTestFiles = [
  "src/common/notifications/reliable-notifications.mysql.spec.ts",
  "src/modules/auth/admin-auth-session.mysql.spec.ts",
  "src/modules/cart/cart.mysql.spec.ts",
  "src/modules/customers/customers.admin-staff-authorization.mysql.spec.ts",
  "src/modules/customers/customers.identity-isolation.mysql.spec.ts",
  "src/modules/customers/customers.sms-security.mysql.spec.ts",
  "src/modules/leads/leads.workflow.mysql.spec.ts",
  "src/modules/ai-classify/ai-classify.staff-authorization.mysql.spec.ts",
  "src/modules/gold-price/gold-price.staff-authorization.mysql.spec.ts",
  "src/modules/marketing/marketing.staff-authorization.mysql.spec.ts",
  "src/modules/analytics/analytics.staff-authorization.mysql.spec.ts",
  "src/modules/page-modules/dynamic-template-page-instance.real.spec.ts",
  "src/modules/page-modules/dynamic-templates.staff-authorization.mysql.spec.ts",
  "src/modules/page-modules/page-modules.staff-authorization.mysql.spec.ts",
  "src/modules/page-modules/media-publication.real.mysql.spec.ts",
  "src/modules/reviews/reviews.staff-authorization.mysql.spec.ts",
  "src/modules/settings/settings.staff-authorization.mysql.spec.ts",
  "src/modules/statistics/statistics.staff-authorization.mysql.spec.ts",
  "src/modules/users/users.staff-authorization.mysql.spec.ts",
  "src/modules/partner-applications/partner-applications.staff-authorization.mysql.spec.ts",
  "src/modules/products/products.staff-authorization.mysql.spec.ts",
  "src/modules/shipping-templates/shipping-templates.staff-authorization.mysql.spec.ts",
  "src/modules/after-sales/after-sales.staff-authorization.mysql.spec.ts",
  "src/modules/refunds/refunds.staff-authorization.mysql.spec.ts",
  "src/modules/inventory/inventory.staff-authorization.mysql.spec.ts",
  "src/modules/quotations/quotations.staff-authorization.mysql.spec.ts",
  "src/modules/payment-proofs/payment-proofs.mysql.spec.ts",
  "src/modules/orders/trade.real-db-concurrency.spec.ts",
  "src/modules/leads/leads.privacy-disposition.mysql.spec.ts",
  "src/modules/selection-inquiry/selection-inquiry.mysql.spec.ts",
  "src/modules/upload/media-immutability.mysql.spec.ts",
  "src/modules/upload/media-staff-authorization.mysql.spec.ts",
];
const isolatedTestSuites = [
  {
    name: "consultation-journey",
    file: "src/modules/leads/consultation-journey.real-http.mysql.spec.ts",
    timeoutMs: 300_000,
    environment: ({ runId }) => ({
      CONSULTATION_REAL_MYSQL_TEST: "1",
      CONSULTATION_RUN_ID: runId,
      JWT_SECRET: `consultation-${runId}-local-isolated-secret`,
      RELEASE_PROFILE: "lead-generation",
      CUSTOMER_COMMERCE_ENABLED: "false",
      CUSTOMER_QUOTATION_ORDERING_ENABLED: "false",
      PAYMENT_GATEWAY_TRANSACTIONS_ENABLED: "false",
      PAYMENT_GATEWAY_REFUNDS_ENABLED: "false",
      NOTIFICATION_DELIVERY_ENABLED: "false",
    }),
  },
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
    name: "customer-payment-commerce",
    file: "src/modules/payments/customer-payment.real-http.mysql.spec.ts",
    timeoutMs: 300_000,
    environment: ({ databaseUrl, port, runId }) => ({
      CUSTOMER_PAYMENT_REAL_MYSQL_TEST: "1",
      CUSTOMER_PAYMENT_REAL_MYSQL_URL: databaseUrl,
      CUSTOMER_PAYMENT_RUN_ID: runId,
      CUSTOMER_PAYMENT_API_PORT: String(port),
      JWT_SECRET: `customer-payment-${runId}-isolated-secret`,
      RELEASE_PROFILE: "commerce",
      CUSTOMER_COMMERCE_ENABLED: "true",
      PAYMENT_PROVIDER_MODE: "simulator",
      PAYMENT_GATEWAY_TRANSACTIONS_ENABLED: "true",
      PAYMENT_GATEWAY_REFUNDS_ENABLED: "true",
      NOTIFICATION_DELIVERY_ENABLED: "false",
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

function assertMigrationSessionCollation(actual) {
  if (actual !== REQUIRED_MIGRATION_SESSION_COLLATION) {
    throw new Error("REAL_MYSQL_MIGRATION_SESSION_COLLATION_REQUIRED");
  }
}

function assertMigrationDatabaseCollation(actual) {
  if (actual !== REQUIRED_MIGRATION_DATABASE_COLLATION) {
    throw new Error("REAL_MYSQL_MIGRATION_DATABASE_COLLATION_REQUIRED");
  }
}

function assertMigrationServerDefaults(characterSet, collation) {
  if (
    characterSet !== REQUIRED_MIGRATION_SERVER_CHARACTER_SET
    || collation !== REQUIRED_MIGRATION_SERVER_COLLATION
  ) {
    throw new Error("REAL_MYSQL_MIGRATION_SERVER_DEFAULTS_REQUIRED");
  }
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
    exitWithParent = false,
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
    const childArgs = exitWithParent
      ? ["--require", path.join(__dirname, "exit-with-parent.cjs"), ...args]
      : args;
    const childEnv = exitWithParent
      ? { ...(env ?? process.env), HAICHUAN_EXIT_WITH_PARENT_OWNER: "1" }
      : env;
    const child = spawn(process.execPath, childArgs, {
      cwd,
      env: childEnv,
      detached: process.platform !== "win32",
      stdio: exitWithParent ? ["ignore", "pipe", "pipe", "ipc"] : ["ignore", "pipe", "pipe"],
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
  const runTests = async (file, index, childEnv = env, timeoutMs = DEFAULT_TEST_FILE_TIMEOUT_MS) => {
    const startedAt = Date.now();
    let lastStage = "process-started";
    console.log(`REAL_MYSQL_FILE_START: ${index}/${testFiles.length} ${file}; timeout_ms=${timeoutMs}`);
    try {
      const result = await runOwnedChild([
        "--test", "--test-concurrency=1", "--test-reporter=tap", "-r", tsNodeRegister,
        ...absoluteTestFiles([file]),
      ], {
        cwd: runRoot,
        env: childEnv,
        timeoutMs,
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
      const [session] = await prisma.$queryRawUnsafe(
        "SELECT @@SESSION.collation_connection AS collation_connection, @@collation_database AS collation_database, @@GLOBAL.character_set_server AS character_set_server, @@GLOBAL.collation_server AS collation_server",
      );
      assertMigrationSessionCollation(session?.collation_connection);
      assertMigrationDatabaseCollation(session?.collation_database);
      assertMigrationServerDefaults(session?.character_set_server, session?.collation_server);
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
      }, suite.timeoutMs);
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
  assertMigrationSessionCollation,
  assertMigrationDatabaseCollation,
  assertMigrationServerDefaults,
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
  REQUIRED_MIGRATION_SESSION_COLLATION,
  REQUIRED_MIGRATION_DATABASE_COLLATION,
  REQUIRED_MIGRATION_SERVER_CHARACTER_SET,
  REQUIRED_MIGRATION_SERVER_COLLATION,
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
