const assert = require("node:assert/strict");
const test = require("node:test");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { validateTarget, assertCompleteTap, assertLocalDependencies, buildTestEnvironment, redactMysqlUrls } = require("./run-real-mysql-tests.cjs");

const isolated = {
  REAL_MYSQL_TEST_ISOLATED: "1",
  REAL_MYSQL_TEST_DATABASE_URL: "mysql://test:disposable@127.0.0.1:3307/haichuan_ci_real_tests",
};

const entrySource = readFileSync(path.resolve(__dirname, "run-real-mysql-tests.cjs"), "utf8");
const registeredTestFiles = entrySource.match(/const testFiles = \[([\s\S]*?)\n\];/)?.[1]
  .match(/^\s*"src\/.+\.spec\.ts",?$/gm) ?? [];

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
  assert.ok(registeredTestFiles.length > 0, "真实 MySQL 入口必须登记至少一个测试文件");
  const registeredCount = registeredTestFiles.length;
  const passing = `# tests ${registeredCount}\n# pass ${registeredCount}\n# fail 0\n# skipped 0\n`;
  assert.doesNotThrow(() => assertCompleteTap(passing));
  for (const incomplete of [
    "",
    passing.replace("# skipped 0", "# skipped 1"),
    passing.replace(`# pass ${registeredCount}`, `# pass ${registeredCount - 1}`),
    passing.replace("# fail 0", "# fail 1"),
  ]) {
    assert.throws(() => assertCompleteTap(incomplete), /INCOMPLETE_TEST_RUN/);
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
  assert.match(workflow, /test "\$applied_migrations" = "56"/);
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
  for (const key of ["NODE_OPTIONS", "NODE_PATH", "PAYMENT_API_KEY", "SMTP_PASSWORD", "OPENAI_API_KEY"]) assert.equal(env[key], undefined);
  assert.equal(env.REAL_MYSQL_TEST_ISOLATED, "1");
});

test("真实 MySQL 日志在输出前移除连接 URL", () => {
  const output = `datasource ${isolated.REAL_MYSQL_TEST_DATABASE_URL}\nerror "MYSQL://user:password@localhost/test"`;
  const redacted = redactMysqlUrls(output);
  assert.doesNotMatch(redacted, /disposable|password|haichuan_ci_real_tests/);
  assert.equal(redacted, 'datasource mysql://[REDACTED]\nerror "mysql://[REDACTED]"');
});
