const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const { validateTarget, assertCompleteTap, assertLocalDependencies, buildTestEnvironment, redactMysqlUrls } = require("./run-real-mysql-tests.cjs");

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
  const passing = "# tests 3\n# pass 3\n# fail 0\n# skipped 0\n";
  assert.doesNotThrow(() => assertCompleteTap(passing));
  for (const incomplete of ["", passing.replace("# skipped 0", "# skipped 1"), passing.replace("# pass 3", "# pass 2"), passing.replace("# fail 0", "# fail 1")]) {
    assert.throws(() => assertCompleteTap(incomplete), /INCOMPLETE_TEST_RUN/);
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
  for (const key of ["NODE_OPTIONS", "NODE_PATH", "PAYMENT_API_KEY", "SMTP_PASSWORD", "OPENAI_API_KEY"]) assert.equal(env[key], undefined);
  assert.equal(env.REAL_MYSQL_TEST_ISOLATED, "1");
});

test("真实 MySQL 日志在输出前移除连接 URL", () => {
  const output = `datasource ${isolated.REAL_MYSQL_TEST_DATABASE_URL}\nerror "MYSQL://user:password@localhost/test"`;
  const redacted = redactMysqlUrls(output);
  assert.doesNotMatch(redacted, /disposable|password|haichuan_ci_real_tests/);
  assert.equal(redacted, 'datasource mysql://[REDACTED]\nerror "mysql://[REDACTED]"');
});
