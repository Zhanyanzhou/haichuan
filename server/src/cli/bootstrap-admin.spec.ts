import assert from "node:assert/strict";
import test from "node:test";
import {
  bootstrapFirstAdmin,
  createBootstrapAdminTargetConfig,
  FirstAdminBootstrapError,
  serializeBootstrapAdminFailure,
  validateFirstAdminInput,
  type BootstrapDatabase,
} from "./bootstrap-admin";

type FakeOptions = {
  activeSuperAdminIds?: number[];
  existingUsernameId?: number;
  connectedDatabase?: string;
};

function createFakeDatabase(options: FakeOptions = {}) {
  const createdUsers: any[] = [];
  const operationLogs: any[] = [];
  const rawQueries: string[] = [];
  const database: BootstrapDatabase = {
    async $queryRawUnsafe<T>(query: string) {
      rawQueries.push(query);
      return [{ databaseName: options.connectedDatabase ?? "jewelry_production" }] as T;
    },
    async $transaction(action) {
      return action({
        async $queryRaw() {
          return (options.activeSuperAdminIds ?? []).map((id) => ({ id })) as any;
        },
        user: {
          async findUnique() {
            return options.existingUsernameId
              ? { id: options.existingUsernameId }
              : null;
          },
          async create(args: any) {
            createdUsers.push(args);
            return { id: 41, role: "SUPER_ADMIN", status: "ACTIVE" } as any;
          },
        },
        operationLog: {
          async create(args: any) {
            operationLogs.push(args);
            return { id: 1 };
          },
        },
      });
    },
  };
  return { database, createdUsers, operationLogs, rawQueries };
}

function productionTarget(overrides: NodeJS.ProcessEnv = {}) {
  return createBootstrapAdminTargetConfig({
    NODE_ENV: "production",
    DATABASE_URL: "mysql://bootstrap:secret@db:3306/jewelry_production",
    BOOTSTRAP_ADMIN_TARGET_CLASS: "production",
    BOOTSTRAP_ADMIN_ENVIRONMENT_ID: "production-cn-1",
    BOOTSTRAP_ADMIN_EXPECTED_DATABASE: "jewelry_production",
    BOOTSTRAP_ADMIN_APPROVAL_REFERENCE: "change-approval-20260913",
    ...overrides,
  });
}

async function expectBootstrapError(
  action: () => Promise<unknown>,
  expectedCode: string,
) {
  await assert.rejects(
    action,
    (error: unknown) =>
      error instanceof FirstAdminBootstrapError && error.code === expectedCode,
  );
}

test("首管理员输入保留用户名限制，但密码只校验 6-18 位长度", () => {
  assert.throws(
    () => validateFirstAdminInput({ username: "admin", password: "Strong!Pass123" }),
    (error: unknown) =>
      error instanceof FirstAdminBootstrapError
      && error.code === "bootstrap-username-invalid",
  );
  for (const password of ["aB3!xy", "x".repeat(18)]) {
    assert.deepEqual(
      validateFirstAdminInput({ username: "owner", password }),
      { username: "owner", password, realName: undefined },
    );
  }
  assert.deepEqual(
    validateFirstAdminInput({ username: "owner", password: "owner1owner1" }),
    { username: "owner", password: "owner1owner1", realName: undefined },
  );
  assert.throws(
    () => validateFirstAdminInput({ username: "owner", password: "12345" }),
    (error: unknown) =>
      error instanceof FirstAdminBootstrapError
      && error.code === "bootstrap-password-invalid",
  );
  assert.throws(
    () => validateFirstAdminInput({ username: "owner", password: "1".repeat(19) }),
    (error: unknown) =>
      error instanceof FirstAdminBootstrapError
      && error.code === "bootstrap-password-invalid",
  );
});

test("正确的生产绑定先核对当前数据库，再创建唯一超管和脱敏审计事实", async () => {
  const { database, createdUsers, operationLogs, rawQueries } = createFakeDatabase();
  const target = productionTarget();
  const result = await bootstrapFirstAdmin(
    database,
    {
      username: "owner.main",
      password: "123456789012",
      realName: "  系统负责人  ",
    },
    target,
    async () => "hashed-password",
  );

  assert.equal(result.created, true);
  assert.equal(result.userId, 41);
  assert.equal(result.role, "SUPER_ADMIN");
  assert.equal(result.status, "ACTIVE");
  assert.equal(result.targetClass, "production");
  assert.match(result.environmentIdSha256, /^[a-f0-9]{64}$/);
  assert.match(result.expectedDatabaseSha256, /^[a-f0-9]{64}$/);
  assert.match(result.approvalReferenceSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(rawQueries, ["SELECT DATABASE() AS databaseName"]);
  assert.equal(createdUsers.length, 1);
  assert.equal(createdUsers[0].data.username, "owner.main");
  assert.equal(createdUsers[0].data.password, "hashed-password");
  assert.equal(createdUsers[0].data.realName, "系统负责人");
  assert.equal(operationLogs.length, 1);
  assert.equal(operationLogs[0].data.userId, 41);
  assert.equal(operationLogs[0].data.action, "bootstrap");
  assert.match(operationLogs[0].data.detail, /environmentIdSha256/);
  assert.doesNotMatch(
    operationLogs[0].data.detail,
    /password|123456789012|change-approval-20260913|production-cn-1|jewelry_production/i,
  );
});

test("目标绑定缺失时在连接前失败关闭", () => {
  assert.throws(
    () => productionTarget({ BOOTSTRAP_ADMIN_ENVIRONMENT_ID: "" }),
    (error: unknown) => error instanceof FirstAdminBootstrapError
      && error.code === "BOOTSTRAP_ADMIN_ENVIRONMENT_ID_REQUIRED",
  );
});

test("连接串数据库名与预期库不匹配时失败关闭", () => {
  assert.throws(
    () => productionTarget({
      DATABASE_URL: "mysql://bootstrap:secret@db:3306/wrong_database",
    }),
    (error: unknown) => error instanceof FirstAdminBootstrapError
      && error.code === "BOOTSTRAP_ADMIN_DATABASE_NAME_MISMATCH",
  );
});

test("生产目标类别与运行环境不匹配时失败关闭", () => {
  assert.throws(
    () => productionTarget({ NODE_ENV: "test" }),
    (error: unknown) => error instanceof FirstAdminBootstrapError
      && error.code === "BOOTSTRAP_ADMIN_ENVIRONMENT_MISMATCH",
  );
});

test("审批引用非法时失败关闭", () => {
  assert.throws(
    () => productionTarget({ BOOTSTRAP_ADMIN_APPROVAL_REFERENCE: "x" }),
    (error: unknown) => error instanceof FirstAdminBootstrapError
      && error.code === "BOOTSTRAP_ADMIN_APPROVAL_REFERENCE_REQUIRED",
  );
});

test("连接到非预期数据库时在哈希密码和写入前失败关闭", async () => {
  const { database, createdUsers, operationLogs } = createFakeDatabase({
    connectedDatabase: "another_database",
  });
  let hashCalls = 0;
  await expectBootstrapError(
    () => bootstrapFirstAdmin(
      database,
      { username: "owner.main", password: "Safe!Launch2026" },
      productionTarget(),
      async () => {
        hashCalls += 1;
        return "hashed-password";
      },
    ),
    "BOOTSTRAP_ADMIN_CONNECTED_DATABASE_MISMATCH",
  );
  assert.equal(hashCalls, 0);
  assert.equal(createdUsers.length, 0);
  assert.equal(operationLogs.length, 0);
});

test("隔离 QA 只有显式 synthetic-test 标识和专属库名时可运行", () => {
  const target = createBootstrapAdminTargetConfig({
    NODE_ENV: "production",
    DATABASE_URL: "mysql://qa:synthetic@mysql:3306/haichuan_qa_test",
    BOOTSTRAP_ADMIN_TARGET_CLASS: "synthetic-test",
    BOOTSTRAP_ADMIN_ENVIRONMENT_ID: "synthetic-qa-run-1",
    BOOTSTRAP_ADMIN_EXPECTED_DATABASE: "haichuan_qa_test",
    BOOTSTRAP_ADMIN_APPROVAL_REFERENCE: "synthetic-test-run-1",
  });
  assert.equal(target.targetClass, "synthetic-test");
  assert.throws(
    () => createBootstrapAdminTargetConfig({
      NODE_ENV: "production",
      DATABASE_URL: "mysql://qa:synthetic@mysql:3306/jewelry_db",
      BOOTSTRAP_ADMIN_TARGET_CLASS: "synthetic-test",
      BOOTSTRAP_ADMIN_ENVIRONMENT_ID: "synthetic-qa-run-1",
      BOOTSTRAP_ADMIN_EXPECTED_DATABASE: "jewelry_db",
      BOOTSTRAP_ADMIN_APPROVAL_REFERENCE: "synthetic-test-run-1",
    }),
    (error: unknown) => error instanceof FirstAdminBootstrapError
      && error.code === "BOOTSTRAP_ADMIN_SYNTHETIC_TARGET_REQUIRED",
  );
});

test("未知底层错误的输出不泄露连接串、密码或审批引用", () => {
  const secret = "mysql://bootstrap:password@private-db:3306/jewelry_production";
  const serialized = JSON.stringify(serializeBootstrapAdminFailure(
    new Error(`${secret} change-approval-20260913`),
  ));
  assert.match(serialized, /bootstrap-execution-failed/);
  assert.doesNotMatch(serialized, /password|private-db|change-approval-20260913/);
});

test("已有启用超管时拒绝重复初始化且不发生写入", async () => {
  const { database, createdUsers, operationLogs } = createFakeDatabase({
    activeSuperAdminIds: [7],
  });
  await expectBootstrapError(
    () => bootstrapFirstAdmin(
      database,
      { username: "owner.main", password: "Safe!Launch2026" },
      productionTarget(),
      async () => "hashed-password",
    ),
    "bootstrap-active-super-admin-exists",
  );
  assert.equal(createdUsers.length, 0);
  assert.equal(operationLogs.length, 0);
});

test("目标用户名已存在时拒绝覆盖、提权或改密", async () => {
  const { database, createdUsers, operationLogs } = createFakeDatabase({
    existingUsernameId: 9,
  });
  await expectBootstrapError(
    () => bootstrapFirstAdmin(
      database,
      { username: "owner.main", password: "Safe!Launch2026" },
      productionTarget(),
      async () => "hashed-password",
    ),
    "bootstrap-username-conflict",
  );
  assert.equal(createdUsers.length, 0);
  assert.equal(operationLogs.length, 0);
});
