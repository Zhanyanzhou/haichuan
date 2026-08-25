const { randomBytes } = require("node:crypto");
const bcrypt = require("bcrypt");
const { PrismaClient } = require("@prisma/client");

const databaseUrl = process.env.DATABASE_URL ?? "";
const baseUrl = process.env.AUDIT_API_BASE_URL ?? "http://127.0.0.1:3100/api";

if (!/^mysql:\/\/[^@]+@127\.0\.0\.1:3307\/haichuan_page_builder_(?:audit|maturity_)/.test(databaseUrl)) {
  throw new Error("仅允许对 127.0.0.1:3307 的页面构建器隔离审计数据库运行");
}
if (!/^http:\/\/127\.0\.0\.1:\d+\/api$/.test(baseUrl)) {
  throw new Error("仅允许对本机隔离审计 API 运行");
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
  const result = await request("/auth/login", {
    method: "POST",
    body: { username, password },
  });
  if (!result.data?.accessToken) throw new Error("登录响应缺少 accessToken");
  return result.data.accessToken;
}

async function main() {
  const suffix = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
  const password = `Aa9!${randomBytes(12).toString("hex")}`;
  const passwordHash = await bcrypt.hash(password, 10);
  const [ownerA, ownerB] = await Promise.all([
    prisma.user.create({
      data: {
        username: `pt_owner_a_${suffix}`,
        password: passwordHash,
        realName: "私有模板联调账号 A",
        role: "EDITOR",
        status: "ACTIVE",
      },
    }),
    prisma.user.create({
      data: {
        username: `pt_owner_b_${suffix}`,
        password: passwordHash,
        realName: "私有模板联调账号 B",
        role: "EDITOR",
        status: "ACTIVE",
      },
    }),
  ]);

  const [tokenA, tokenB] = await Promise.all([
    login(ownerA.username, password),
    login(ownerB.username, password),
  ]);
  const sharedName = `隔离模板-${suffix}`;
  const createBody = {
    name: sharedName,
    moduleType: "单图海报",
    layoutData: { version: 2 },
    contentDefaults: {
      title: "私有模板真实接口验收",
      subtitle: "只保留合同允许的展示内容",
      price: 999999,
      inventory: 8,
      customerName: "不得落库",
    },
  };

  const createdA = await request("/page-modules/personal-content-templates", {
    token: tokenA,
    method: "POST",
    body: createBody,
  });
  const createdB = await request("/page-modules/personal-content-templates", {
    token: tokenB,
    method: "POST",
    body: { ...createBody, contentDefaults: undefined },
  });
  if (!createdA.data?.id || !createdB.data?.id) throw new Error("创建响应缺少模板 ID");
  if (createdA.data.ownerId !== ownerA.id || createdB.data.ownerId !== ownerB.id) {
    throw new Error("创建响应的 ownerId 与登录账号不一致");
  }
  if (createdB.data.contentDefaults !== null) {
    throw new Error("省略 contentDefaults 时数据库值应为 null");
  }
  const serializedDefaults = JSON.stringify(createdA.data.contentDefaults ?? {});
  if (!serializedDefaults.includes("私有模板真实接口验收")) {
    throw new Error("合法默认文案未保存");
  }
  if (/999999|inventory|customerName|不得落库/.test(serializedDefaults)) {
    throw new Error("业务事实字段被错误保存到私有模板");
  }

  const listA = await request("/page-modules/personal-content-templates", { token: tokenA });
  const listB = await request("/page-modules/personal-content-templates", { token: tokenB });
  if (!listA.data.some((item) => item.id === createdA.data.id) || listA.data.some((item) => item.id === createdB.data.id)) {
    throw new Error("账号 A 的列表隔离失败");
  }
  if (!listB.data.some((item) => item.id === createdB.data.id) || listB.data.some((item) => item.id === createdA.data.id)) {
    throw new Error("账号 B 的列表隔离失败");
  }

  await request("/page-modules/personal-content-templates", {
    token: tokenA,
    method: "POST",
    body: createBody,
    expected: [409],
  });
  await request(`/page-modules/personal-content-templates/${createdA.data.id}`, {
    token: tokenB,
    method: "PATCH",
    body: { name: "越权修改" },
    expected: [404],
  });
  await request(`/page-modules/personal-content-templates/${createdA.data.id}`, {
    token: tokenB,
    method: "DELETE",
    expected: [404],
  });
  await request("/page-modules/personal-content-templates", {
    token: tokenA,
    method: "POST",
    body: {
      name: `失效引用-${suffix}`,
      moduleType: "单品焦点推荐",
      layoutData: { version: 2 },
      contentDefaults: { productCode: `MISSING-${suffix}`, title: "不得创建" },
    },
    expected: [400],
  });

  const updatedA = await request(`/page-modules/personal-content-templates/${createdA.data.id}`, {
    token: tokenA,
    method: "PATCH",
    body: { name: `${sharedName}-更新`, contentDefaults: null },
  });
  if (updatedA.data.name !== `${sharedName}-更新` || updatedA.data.contentDefaults !== null) {
    throw new Error("更新名称或显式清空 contentDefaults 失败");
  }

  const deletedA = await request(`/page-modules/personal-content-templates/${createdA.data.id}`, {
    token: tokenA,
    method: "DELETE",
  });
  const deletedB = await request(`/page-modules/personal-content-templates/${createdB.data.id}`, {
    token: tokenB,
    method: "DELETE",
  });
  if (deletedA.data?.deleted !== true || deletedB.data?.deleted !== true) {
    throw new Error("删除自己的私有模板失败");
  }
  const finalA = await request("/page-modules/personal-content-templates", { token: tokenA });
  const finalB = await request("/page-modules/personal-content-templates", { token: tokenB });
  if (finalA.data.some((item) => item.id === createdA.data.id) || finalB.data.some((item) => item.id === createdB.data.id)) {
    throw new Error("删除后列表仍返回目标模板");
  }

  console.log(JSON.stringify({
    ok: true,
    database: new URL(databaseUrl).pathname.slice(1),
    api: baseUrl,
    checks: {
      create: 2,
      sameNameAcrossOwners: true,
      duplicateNameConflict: true,
      listIsolation: true,
      crossOwnerUpdateAndDelete: true,
      invalidReferenceRejected: true,
      factFieldsFiltered: true,
      nullAndOmittedDefaults: true,
      ownerUpdateAndDelete: true,
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
