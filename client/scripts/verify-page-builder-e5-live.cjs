const { randomBytes } = require("node:crypto");
const path = require("node:path");
const bcrypt = require("../../server/node_modules/bcrypt");
const { PrismaClient } = require("../../server/node_modules/@prisma/client");
const { chromium } = require("@playwright/test");

const databaseUrl = process.env.DATABASE_URL ?? "";
const apiBaseUrl = process.env.AUDIT_API_BASE_URL ?? "http://127.0.0.1:3100/api";
const siteBaseUrl = process.env.AUDIT_SITE_BASE_URL ?? "http://127.0.0.1:5175";

if (!/^mysql:\/\/[^@]+@127\.0\.0\.1:3307\/haichuan_page_builder_(?:audit|maturity_)/.test(databaseUrl)) {
  throw new Error("仅允许对 127.0.0.1:3307 的页面构建器隔离审计数据库运行");
}
if (!/^http:\/\/127\.0\.0\.1:\d+\/api$/.test(apiBaseUrl)) {
  throw new Error("仅允许对本机隔离审计 API 运行");
}
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(siteBaseUrl)) {
  throw new Error("仅允许对本机隔离审计前端运行");
}

const prisma = new PrismaClient();

function unwrap(body) {
  return body && typeof body === "object" && "data" in body ? body.data : body;
}

async function login(username, password) {
  const response = await fetch(`${apiBaseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !unwrap(payload)?.accessToken) {
    throw new Error(`隔离管理员登录失败: ${response.status}`);
  }
  return unwrap(payload).accessToken;
}

async function expectCondition(condition, message) {
  if (!(await condition())) throw new Error(message);
}

async function main() {
  const suffix = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
  const password = `Aa9!${randomBytes(12).toString("hex")}`;
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      username: `e5_admin_${suffix}`,
      password: passwordHash,
      realName: "页面构建器 E5 隔离验收",
      role: "ADMIN",
      status: "ACTIVE",
    },
  });
  const accessToken = await login(user.username, password);
  const title = `真实浏览器成熟度复验-${suffix}`;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  const pageErrors = [];
  const failedApiResponses = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    if (new URL(response.url()).pathname.startsWith("/api/") && response.status() >= 400) {
      failedApiResponses.push(`${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });
  await page.addInitScript(({ token, authUser }) => {
    localStorage.setItem("token", token);
    localStorage.setItem("jewelry-auth", JSON.stringify({
      state: { token, user: authUser, isLoggedIn: true },
      version: 0,
    }));
  }, {
    token: accessToken,
    authUser: {
      id: user.id,
      username: user.username,
      role: user.role,
      realName: user.realName,
    },
  });

  try {
    await page.goto(`${siteBaseUrl}/admin/editor/products`, { waitUntil: "networkidle" });
    await page.locator(".homepage-editor__toolbar").waitFor({ state: "visible" });
    await expectCondition(
      async () => (await page.getByTestId("homepage-editor-mock-mode").count()) === 0,
      "真实前端错误进入 Mock 模式",
    );
    await page.locator(".homepage-editor__layer-select").first().click();
    const inspector = page.getByRole("region", { name: "属性面板" });
    await inspector.getByRole("tab", { name: "内容编辑" }).click();
    const titleInput = inspector
      .locator('[data-inspector-field="title"] input, [data-inspector-field="title"] textarea')
      .first();
    await titleInput.waitFor({ state: "visible" });
    await titleInput.fill(title);

    const saveResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/api/page-modules/document"
      && response.request().method() === "PUT",
    );
    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    if (!(await saveResponse).ok()) throw new Error("浏览器保存草稿未返回成功状态");
    await page.getByText("页面草稿已保存").waitFor({ state: "visible" });

    await page.reload({ waitUntil: "networkidle" });
    await page.locator(".homepage-editor__toolbar").waitFor({ state: "visible" });
    await page.locator(".homepage-editor__layer-select").first().click();
    const reloadedTitleInput = page
      .getByRole("region", { name: "属性面板" })
      .locator('[data-inspector-field="title"] input, [data-inspector-field="title"] textarea')
      .first();
    await expectCondition(
      async () => (await reloadedTitleInput.inputValue()) === title,
      "刷新后没有回显刚保存的标题",
    );

    const publishButton = page.getByRole("button", { name: "发布到前台网站", exact: true });
    await publishButton.waitFor({ state: "visible" });
    await expectCondition(async () => await publishButton.isEnabled(), "发布按钮仍不可用");
    await publishButton.click();
    const publishDialog = page.getByRole("dialog", { name: "确认发布珠宝作品？" });
    const publishResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/api/page-modules/document/publish"
      && response.request().method() === "PUT",
    );
    await publishDialog.getByRole("button", { name: "确认发布" }).click();
    if (!(await publishResponse).ok()) throw new Error("浏览器发布未返回成功状态");
    await page.getByText("珠宝作品已发布").waitFor({ state: "visible" });

    const routes = ["/", "/products", "/custom", "/about", "/catalog", "/contact"];
    const viewportResults = [];
    for (const viewport of [
      { name: "desktop", width: 1920, height: 1200 },
      { name: "mobile", width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      for (const route of routes) {
        const response = await page.goto(`${siteBaseUrl}${route}?e5=${suffix}`, {
          waitUntil: "networkidle",
        });
        if (!response?.ok()) throw new Error(`${viewport.name} ${route} 返回 ${response?.status()}`);
        const result = await page.evaluate(() => ({
          h1Count: document.querySelectorAll("main h1").length,
          horizontalOverflow:
            document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        }));
        if (result.h1Count !== 1) {
          throw new Error(`${viewport.name} ${route} 的 main h1 数量为 ${result.h1Count}`);
        }
        if (result.horizontalOverflow) throw new Error(`${viewport.name} ${route} 存在横向溢出`);
        if (route === "/products") {
          const heading = page.getByRole("heading", { name: title, level: 2 });
          await heading.waitFor({ state: "visible" });
          const shellResult = await page.evaluate(() => {
            const shell = document.querySelector(".site-shell");
            const footer = document.querySelector(".site-footer");
            return {
              background: shell ? getComputedStyle(shell).backgroundColor : "",
              footerReachesViewport: Boolean(
                footer && footer.getBoundingClientRect().bottom >= window.innerHeight - 1,
              ),
            };
          });
          if (shellResult.background !== "rgb(255, 255, 255)" || !shellResult.footerReachesViewport) {
            throw new Error(`${viewport.name} products 短页仍暴露底带或页脚未贴底`);
          }
          await page.screenshot({
            path: path.resolve(
              __dirname,
              `../../artifacts/page-builder-audit/20260825-goal/public-products-${viewport.name}-remediated.png`,
            ),
            fullPage: true,
          });
        }
        viewportResults.push(`${viewport.name}:${route}`);
      }
    }

    if (pageErrors.length) throw new Error(`页面异常: ${pageErrors.join(" | ")}`);
    if (failedApiResponses.length) {
      throw new Error(`API 失败响应: ${failedApiResponses.join(" | ")}`);
    }
    console.log(JSON.stringify({
      ok: true,
      database: new URL(databaseUrl).pathname.slice(1),
      api: apiBaseUrl,
      site: siteBaseUrl,
      checks: {
        browserSave: true,
        reloadPersistence: true,
        browserPublish: true,
        publicReadback: true,
        singlePrimaryHeading: true,
        shortPageBackgroundAndFooter: true,
        sixPagesTwoViewports: viewportResults.length,
        pageErrors: 0,
        failedApiResponses: 0,
      },
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
