import assert from "node:assert/strict";
import test from "node:test";
import {
  bootstrapFirstAdmin,
  FirstAdminBootstrapError,
  validateFirstAdminInput,
  type BootstrapDatabase,
} from "./bootstrap-admin";

type FakeOptions = {
  activeSuperAdminIds?: number[];
  existingUsernameId?: number;
};

function createFakeDatabase(options: FakeOptions = {}) {
  const createdUsers: any[] = [];
  const operationLogs: any[] = [];
  const database: BootstrapDatabase = {
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
  return { database, createdUsers, operationLogs };
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
  assert.deepEqual(
    validateFirstAdminInput({ username: "owner", password: "123456" }),
    { username: "owner", password: "123456", realName: undefined },
  );
  assert.deepEqual(
    validateFirstAdminInput({ username: "owner", password: "owner1" }),
    { username: "owner", password: "owner1", realName: undefined },
  );
  assert.throws(
    () => validateFirstAdminInput({ username: "owner", password: "12345" }),
    (error: unknown) =>
      error instanceof FirstAdminBootstrapError
      && error.code === "bootstrap-password-invalid",
  );
  assert.throws(
    () => validateFirstAdminInput({ username: "owner", password: "1234567890123456789" }),
    (error: unknown) =>
      error instanceof FirstAdminBootstrapError
      && error.code === "bootstrap-password-invalid",
  );
});

test("首次初始化在同一事务创建唯一超管和脱敏审计事实", async () => {
  const { database, createdUsers, operationLogs } = createFakeDatabase();
  const result = await bootstrapFirstAdmin(
    database,
    {
      username: "owner.main",
      password: "123456",
      realName: "  系统负责人  ",
    },
    async () => "hashed-password",
  );

  assert.deepEqual(result, {
    created: true,
    userId: 41,
    role: "SUPER_ADMIN",
    status: "ACTIVE",
  });
  assert.equal(createdUsers.length, 1);
  assert.equal(createdUsers[0].data.username, "owner.main");
  assert.equal(createdUsers[0].data.password, "hashed-password");
  assert.equal(createdUsers[0].data.realName, "系统负责人");
  assert.equal(operationLogs.length, 1);
  assert.equal(operationLogs[0].data.userId, 41);
  assert.equal(operationLogs[0].data.action, "bootstrap");
  assert.doesNotMatch(operationLogs[0].data.detail, /password|123456/i);
});

test("已有启用超管时拒绝重复初始化且不发生写入", async () => {
  const { database, createdUsers, operationLogs } = createFakeDatabase({
    activeSuperAdminIds: [7],
  });
  await expectBootstrapError(
    () => bootstrapFirstAdmin(
      database,
      { username: "owner.main", password: "Safe!Launch2026" },
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
      async () => "hashed-password",
    ),
    "bootstrap-username-conflict",
  );
  assert.equal(createdUsers.length, 0);
  assert.equal(operationLogs.length, 0);
});
