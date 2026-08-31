const { randomBytes } = require("node:crypto");
const bcrypt = require("bcrypt");
const { PrismaClient } = require("@prisma/client");

const databaseUrl = process.env.DATABASE_URL ?? "";
const baseUrl = process.env.AUDIT_API_BASE_URL ?? "http://127.0.0.1:3101/api";

let parsedDatabaseUrl;
try {
  parsedDatabaseUrl = new URL(databaseUrl);
} catch {
  throw new Error("DATABASE_URL 必须指向获批的一次性模板 QA 数据库");
}
if (
  parsedDatabaseUrl.protocol !== "mysql:" ||
  parsedDatabaseUrl.hostname !== "127.0.0.1" ||
  parsedDatabaseUrl.port !== "33307" ||
  parsedDatabaseUrl.pathname !== "/haichuan_template_qa"
) {
  throw new Error("仅允许对 127.0.0.1:33307/haichuan_template_qa 一次性数据库运行");
}
if (baseUrl !== "http://127.0.0.1:3101/api") {
  throw new Error("仅允许对 127.0.0.1:3101 的一次性联调 API 运行");
}
if (process.env.TEMPLATE_QA_DESTRUCTIVE_AUTHORIZED !== "1") {
  throw new Error("缺少一次性模板 QA 写入授权标记");
}

const prisma = new PrismaClient();

function unwrap(body) {
  return body && typeof body === "object" && "data" in body ? body.data : body;
}

async function request(path, { token, method = "GET", body, expected = [200, 201] } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!expected.includes(response.status)) {
    const message = payload?.message ?? payload?.error ?? "无响应正文";
    throw new Error(`${method} ${path} 返回 ${response.status}: ${String(message)}`);
  }
  return { status: response.status, data: unwrap(payload) };
}

async function login(username, password) {
  const response = await request("/auth/login", {
    method: "POST",
    body: { username, password },
  });
  if (!response.data?.accessToken) throw new Error("登录响应缺少 accessToken");
  return response.data.accessToken;
}

async function main() {
  const suffix = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
  const password = `Qa9!${randomBytes(12).toString("hex")}`;
  const passwordHash = await bcrypt.hash(password, 10);
  const users = await Promise.all([
    prisma.user.create({
      data: {
        username: `fixed_super_${suffix}`,
        password: passwordHash,
        realName: "固定模板联调超级管理员",
        role: "SUPER_ADMIN",
        status: "ACTIVE",
      },
    }),
    prisma.user.create({
      data: {
        username: `fixed_admin_${suffix}`,
        password: passwordHash,
        realName: "固定模板联调管理员",
        role: "ADMIN",
        status: "ACTIVE",
      },
    }),
    prisma.user.create({
      data: {
        username: `fixed_editor_${suffix}`,
        password: passwordHash,
        realName: "固定模板联调编辑者",
        role: "EDITOR",
        status: "ACTIVE",
      },
    }),
  ]);
  const [superToken, adminToken, editorToken] = await Promise.all(
    users.map((user) => login(user.username, password)),
  );

  const baseline = await request("/page-modules/system-content-templates/hero", {
    token: editorToken,
  });
  if (baseline.data?.activeVersion !== 0 || baseline.data?.source !== "code") {
    throw new Error("空库未返回系统模板代码基线 version 0");
  }

  const overwriteBody = {
    expectedActiveVersion: 0,
    layoutData: {
      version: 2,
      frame: { aspectRatioByViewport: { desktop: 0.5 } },
    },
    changeNote: "一次性 QA 真实接口覆盖",
  };
  await request("/page-modules/system-content-templates/hero/versions", {
    token: adminToken,
    method: "POST",
    body: overwriteBody,
    expected: [403],
  });
  const versionOne = await request("/page-modules/system-content-templates/hero/versions", {
    token: superToken,
    method: "POST",
    body: overwriteBody,
  });
  if (versionOne.data?.activeVersion !== 1 || versionOne.data?.source !== "database") {
    throw new Error("超级管理员覆盖后未激活不可变 version 1");
  }
  await request("/page-modules/system-content-templates/hero/versions", {
    token: superToken,
    method: "POST",
    body: overwriteBody,
    expected: [409],
  });

  const historyOne = await request("/page-modules/system-content-templates/hero/history", {
    token: adminToken,
  });
  if (!Array.isArray(historyOne.data) || !historyOne.data.some((item) => item.version === 1)) {
    throw new Error("系统模板历史缺少 version 1");
  }
  if (!historyOne.data.some((item) => item.version === 0 && item.source === "code")) {
    throw new Error("系统模板历史缺少代码基线 version 0");
  }

  const rolledBack = await request("/page-modules/system-content-templates/hero/rollback", {
    token: superToken,
    method: "POST",
    body: { expectedActiveVersion: 1, targetVersion: 0 },
  });
  if (rolledBack.data?.activeVersion !== 0 || rolledBack.data?.source !== "code") {
    throw new Error("系统模板未正确回滚到代码基线");
  }
  const versionTwo = await request("/page-modules/system-content-templates/hero/versions", {
    token: superToken,
    method: "POST",
    body: { ...overwriteBody, changeNote: "回滚后再次覆盖" },
  });
  if (versionTwo.data?.activeVersion !== 2) {
    throw new Error("回滚后覆盖错误地复用了历史版本号");
  }

  const personalName = `个人模板-${suffix}`;
  await request("/page-modules/personal-content-templates", {
    token: editorToken,
    method: "POST",
    body: { name: personalName, moduleType: "首屏主视觉", layoutData: { version: 2 } },
    expected: [403],
  });
  await request("/page-modules/personal-content-templates", {
    token: adminToken,
    method: "POST",
    body: {
      name: `${personalName}-真实内容拒绝`,
      moduleType: "首屏主视觉",
      layoutData: { version: 2 },
      contentDefaults: { title: "不得进入模板" },
    },
    expected: [400],
  });
  const personal = await request("/page-modules/personal-content-templates", {
    token: adminToken,
    method: "POST",
    body: { name: personalName, moduleType: "首屏主视觉", layoutData: { version: 2 } },
  });
  if (!personal.data?.id || personal.data?.revision !== 1 || personal.data?.contentDefaults !== null) {
    throw new Error("个人模板创建结果不符合 revision 1 与中性内容规则");
  }
  const personalUpdated = await request(
    `/page-modules/personal-content-templates/${personal.data.id}`,
    {
      token: adminToken,
      method: "PATCH",
      body: {
        expectedRevision: 1,
        layoutData: {
          version: 2,
          frame: { aspectRatioByViewport: { desktop: 0.5 } },
        },
      },
    },
  );
  if (personalUpdated.data?.revision !== 2 || personalUpdated.data?.contentDefaults !== null) {
    throw new Error("个人模板覆盖未增加 revision 或未保持中性内容");
  }
  await request(`/page-modules/personal-content-templates/${personal.data.id}`, {
    token: adminToken,
    method: "PATCH",
    body: { expectedRevision: 1, name: "过期写入不得覆盖" },
    expected: [409],
  });

  const persisted = await prisma.personalContentTemplate.findUnique({
    where: { id: personal.data.id },
  });
  const states = await prisma.systemContentTemplateState.findMany({
    include: { versions: { orderBy: { version: "asc" } } },
  });
  if (persisted?.revision !== 2) throw new Error("个人模板 revision 未真实落库");
  if (states[0]?.activeVersion !== 2 || states[0]?.versions.map((item) => item.version).join(",") !== "1,2") {
    throw new Error("系统模板激活指针或不可变版本历史未真实落库");
  }

  console.log(JSON.stringify({
    ok: true,
    database: "haichuan_template_qa",
    api: baseUrl,
    checks: {
      baselineVersionZero: true,
      staffRead: true,
      superAdminOnlyOverwrite: true,
      immutableVersionHistory: [1, 2],
      rollbackPointerOnly: true,
      systemConflict409: true,
      personalRevision: 2,
      personalConflict409: true,
      editorWriteDenied: true,
      realContentRejected: true,
      persistedRowsVerified: true,
    },
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
