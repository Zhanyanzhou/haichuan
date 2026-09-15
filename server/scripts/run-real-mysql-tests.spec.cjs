const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const test = require("node:test");
const { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const {
  validateTarget,
  assertCompleteTap,
  assertLocalDependencies,
  assertCompleteInventory,
  buildTestEnvironment,
  discoverRealMysqlTests,
  prepareRunRoot,
  redactMysqlUrls,
  runOwnedChild,
  DEFAULT_TEST_FILE_TIMEOUT_MS,
  testFiles,
  isolatedTestSuites,
} = require("./run-real-mysql-tests.cjs");

const isolated = {
  REAL_MYSQL_TEST_ISOLATED: "1",
  REAL_MYSQL_TEST_DATABASE_URL: "mysql://test:disposable@127.0.0.1:3307/haichuan_ci_real_tests",
};

test("真实 MySQL 入口必须显式选择一次性本机测试库", () => {
  assert.equal(validateTarget(isolated), isolated.REAL_MYSQL_TEST_DATABASE_URL);
  assert.throws(() => validateTarget({}), /ISOLATION_REQUIRED/);
  assert.throws(() => validateTarget({ REAL_MYSQL_TEST_ISOLATED: "1" }), /DATABASE_URL_REQUIRED/);
  for (const url of [
    "mysql://test:disposable@production.example.com/haichuan_ci_real_tests",
    "mysql://test:disposable@mysql/haichuan_ci_real_tests",
    "mysql://test:disposable@127.0.0.1/jewelry_db",
    "mysql://test:disposable@127.0.0.1/haichuan_ci_real_tests?socket=/tmp/mysql.sock",
    "mysql://test@127.0.0.1/haichuan_ci_real_tests",
  ]) assert.throws(() => validateTarget({ ...isolated, REAL_MYSQL_TEST_DATABASE_URL: url }), /TARGET_NOT_DISPOSABLE/);
});

test("真实 MySQL 入口不接受跳过、不完整或失败的测试报告", () => {
  assert.ok(testFiles.length > 0, "真实 MySQL 入口必须登记至少一个测试文件");
  const registeredCount = testFiles.length;
  const passing = `# tests ${registeredCount}\n# pass ${registeredCount}\n# fail 0\n# skipped 0\n`;
  assert.doesNotThrow(() => assertCompleteTap(passing));
  assert.doesNotThrow(() => assertCompleteTap(
    `# tests ${registeredCount + 2}\n# pass ${registeredCount + 2}\n# fail 0\n# skipped 0\n`,
  ));
  for (const incomplete of [
    "",
    passing.replace("# skipped 0", "# skipped 1"),
    passing.replace(`# pass ${registeredCount}`, `# pass ${registeredCount - 1}`),
    passing.replace("# fail 0", "# fail 1"),
    `# tests ${registeredCount - 1}\n# pass ${registeredCount - 1}\n# fail 0\n# skipped 0\n`,
  ]) {
    assert.throws(() => assertCompleteTap(incomplete), /INCOMPLETE_TEST_RUN/);
  }
});

test("真实 MySQL 候选清单全部进入显式入口，新增候选不能静默遗漏", () => {
  const discovered = discoverRealMysqlTests();
  assert.ok(discovered.length > 0, "至少应发现一个真实 MySQL 候选");
  assert.deepEqual([...testFiles].sort(), discovered);
  assert.doesNotThrow(() => assertCompleteInventory(discovered));
  assert.throws(
    () => assertCompleteInventory([...discovered, "src/modules/example/new.mysql.spec.ts"]),
    /TEST_INVENTORY_DRIFT/,
  );
});

test("迁移运行目录只复制当前 Prisma 来源且排除环境文件", () => {
  const fakeRoot = mkdtempSync(path.join(tmpdir(), "haichuan-real-mysql-source-"));
  const prismaRoot = path.join(fakeRoot, "prisma");
  mkdirSync(prismaRoot);
  writeFileSync(path.join(prismaRoot, "schema.prisma"), "datasource db { provider = \"mysql\" url = env(\"DATABASE_URL\") }\n");
  writeFileSync(path.join(prismaRoot, ".env"), "DATABASE_URL=mysql://synthetic:test@invalid/test\n");
  const runRoot = prepareRunRoot(fakeRoot);
  try {
    assert.equal(existsSync(path.join(runRoot, "prisma", "schema.prisma")), true);
    assert.equal(existsSync(path.join(runRoot, "prisma", ".env")), false);
  } finally {
    rmSync(runRoot, { recursive: true, force: true });
    rmSync(fakeRoot, { recursive: true, force: true });
  }
});

test("CI 隔离 MySQL 显式启用 trigger trust 且迁移账号没有 SUPER", () => {
  const workflow = readFileSync(path.resolve(__dirname, "..", "..", ".github", "workflows", "quality.yml"), "utf8");
  assert.match(workflow, /mysql:8\.0@sha256:7dcddc01f13bab2f15cde676d44d01f61fc9f99fe7785e86196dfc07d358ae2b/);
  assert.match(workflow, /SET GLOBAL log_bin_trust_function_creators = ON/);
  assert.match(workflow, /SELECT @@GLOBAL\.log_bin, @@GLOBAL\.log_bin_trust_function_creators/);
  assert.match(workflow, /PRIVILEGE_TYPE = 'SUPER'/);
  assert.match(workflow, /test "\$policy" = \$'1\\t1\\t0'/);
  assert.match(workflow, /CREATE TRIGGER __hc_trigger_probe_before_insert/);
  assert.match(workflow, /test "\$trigger_probe" = "1"/);
  assert.match(workflow, /SELECT COUNT\(\*\) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL/);
  assert.match(workflow, /expected_migrations="\$\(find server\/prisma\/migrations .* -name migration\.sql/);
  assert.match(workflow, /test "\$expected_migrations" -gt 0/);
  assert.match(workflow, /test "\$applied_migrations" = "\$expected_migrations"/);
  assert.match(workflow, /name: 安装真实鉴权浏览器闭环依赖[\s\S]*?working-directory: client[\s\S]*?run: npm ci/);
  assert.match(workflow, /name: 安装真实鉴权 Chromium[\s\S]*?run: npx playwright install --with-deps chromium/);
});

test("完整 AppModule 真实套件使用各自的合成 JWT 密钥", () => {
  for (const name of ["order-operations", "quotation-commerce"]) {
    const suite = isolatedTestSuites.find((candidate) => candidate.name === name);
    assert.ok(suite, `缺少真实套件 ${name}`);
    const environment = suite.environment({
      databaseUrl: isolated.REAL_MYSQL_TEST_DATABASE_URL,
      port: 34567,
      runId: "abc123",
    });
    assert.match(environment.JWT_SECRET, new RegExp(`^${name === "order-operations" ? "order-ops" : "quotation"}-abc123-`));
  }
});

test("真实 MySQL 入口在加载 Prisma 前拒绝跨工作区 node_modules junction", () => {
  const copiedRoot = path.resolve("isolated-server");
  const originalModules = path.resolve("original-server", "node_modules");
  assert.throws(
    () => assertLocalDependencies(copiedRoot, (target) => target === copiedRoot ? copiedRoot : originalModules),
    /EXTERNAL_NODE_MODULES_FORBIDDEN/,
  );
  const actualRoot = path.resolve(__dirname, "..");
  assert.doesNotThrow(() => assertLocalDependencies(actualRoot));
  assert.throws(
    () => assertLocalDependencies(actualRoot, (target) => target.includes(`${path.sep}.prisma${path.sep}`) ? path.join(originalModules, ".prisma", "client", "default.js") : target),
    /EXTERNAL_DEPENDENCY_FORBIDDEN/,
  );
});

test("真实 MySQL 子进程只传递平台必需变量与显式测试库", () => {
  const env = buildTestEnvironment({
    Path: "platform-bin", SystemRoot: "platform-root", NODE_OPTIONS: "--require injected.js",
    NODE_PATH: "external-modules", DATABASE_URL: "mysql://real:secret@remote/jewelry_db",
    PAYMENT_API_KEY: "real-secret", SMTP_PASSWORD: "real-secret", OPENAI_API_KEY: "real-secret",
  }, isolated.REAL_MYSQL_TEST_DATABASE_URL);
  assert.equal(env.Path, "platform-bin");
  assert.equal(env.SystemRoot, "platform-root");
  assert.equal(env.DATABASE_URL, isolated.REAL_MYSQL_TEST_DATABASE_URL);
  assert.equal(env.TS_NODE_PROJECT, path.resolve(__dirname, "..", "tsconfig.json"));
  assert.equal(env.TS_NODE_CWD, path.resolve(__dirname, ".."));
  for (const key of ["NODE_OPTIONS", "NODE_PATH", "PAYMENT_API_KEY", "SMTP_PASSWORD", "OPENAI_API_KEY"]) assert.equal(env[key], undefined);
  assert.equal(env.REAL_MYSQL_TEST_ISOLATED, "1");
});

test("真实 MySQL 日志在输出前移除连接 URL", () => {
  const output = `datasource ${isolated.REAL_MYSQL_TEST_DATABASE_URL}\nerror "MYSQL://user:password@localhost/test"`;
  const redacted = redactMysqlUrls(output);
  assert.doesNotMatch(redacted, /disposable|password|haichuan_ci_real_tests/);
  assert.equal(redacted, 'datasource mysql://[REDACTED]\nerror "mysql://[REDACTED]"');
});

test("真实 MySQL 文件超时必须失败，且只终止入口创建的子进程树", async (t) => {
  assert.equal(DEFAULT_TEST_FILE_TIMEOUT_MS, 120_000);
  const sibling = spawn(process.execPath, ["-e", "setTimeout(() => process.exit(0), 500)"], {
    detached: false,
    stdio: "ignore",
    windowsHide: true,
  });
  t.after(() => {
    if (sibling.exitCode === null && sibling.signalCode === null) sibling.kill("SIGKILL");
  });

  const stages = [];
  await assert.rejects(
    runOwnedChild([
      "-e",
      "console.log('REAL_MYSQL_STAGE synthetic waiting elapsed_ms=0'); setInterval(() => {}, 1000)",
    ], {
      cwd: __dirname,
      env: process.env,
      timeoutMs: 100,
      onLine: (line) => stages.push(line),
      writeStdout: () => {},
      writeStderr: () => {},
    }),
    (error) => {
      assert.equal(error.code, "REAL_MYSQL_TEST_TIMEOUT");
      assert.equal(error.cleanupSucceeded, true);
      return true;
    },
  );
  assert.ok(stages.some((line) => line.includes("REAL_MYSQL_STAGE synthetic waiting")));

  const siblingResult = await new Promise((resolve, reject) => {
    sibling.once("error", reject);
    sibling.once("close", (status, signal) => resolve({ status, signal }));
  });
  assert.deepEqual(siblingResult, { status: 0, signal: null });
});
