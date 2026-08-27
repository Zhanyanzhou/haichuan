import { expect, test, type Page } from "@playwright/test";
import { installAdminSession } from "./fixtures/session-auth";

/**
 * 店铺装修编辑器 —— 未保存内容保护（D1）回归测试
 *
 * 覆盖 P1 修复：编辑器有未保存修改时，点击后台侧边栏其他菜单（SPA 路由跳转）
 * 不再静默丢失，而是弹出「保存并离开 / 不保存离开 / 继续编辑」确认；
 * 保存草稿后脏状态清空，刷新后内容正确回显。
 *
 * 运行方式（测试通过当前 Cookie 会话接口夹具建立确定性管理员身份）：
 *   npx playwright test editor-leave-guard --project=admin-chromium
 *
 * 说明：
 * - 通过 page.route 注入确定性草稿数据（与非 mock 模式一致，参考 core-template-homepage.spec.ts）；
 *   mock 模式下客户端会绕过 HTTP 拦截，故跳过。
 * - 通过模板库当前可访问名称点击添加模块；拖拽细节由专门的编辑器测试覆盖，
 *   本文件只验证脏状态与离开保护，避免与无关的拖拽实现耦合。
 */
const useMock = process.env.VITE_USE_MOCK === "true";

const API_PREFIX = "**/api/**";

/** 一个最小可用 Puck 草稿：空内容，便于测试「新增模块」产生的脏状态 */
function makeDraft() {
  return {
    id: 9101,
    pageKey: "home",
    puckData: { content: [], zones: {}, root: { props: {} } },
    metadata: {},
    editorVersion: "0.22.4",
    status: "DRAFT",
    version: 0,
    publishedAt: null,
    publishedBy: null,
    updatedAt: "2026-08-14T00:00:00.000Z",
  };
}

async function mockEditorApis(page: Page) {
  let saved: ReturnType<typeof makeDraft> = makeDraft();
  await page.route(`${API_PREFIX}*`, async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes("/auth/profile")) return route.fallback();

    if (url.includes("/validate")) {
      return route.fulfill(json({ valid: true, errors: [] }));
    }
    if (url.includes("/revisions")) {
      return route.fulfill(json([]));
    }
    if (url.includes("/published")) {
      return route.fulfill(json(null));
    }
    // 本文件不验证发布动作；若未来新增发布场景，须提供独立、可断言的响应夹具。
    if (/\/publish(?:\?|$)/.test(url)) {
      return route.continue();
    }

    // PUT /document —— 保存草稿：回写 puckData，刷新 updatedAt
    if (method === "PUT") {
      const body = route.request().postDataJSON() as { puckData?: unknown; metadata?: unknown };
      saved = {
        ...saved,
        puckData: (body.puckData ?? saved.puckData) as any,
        metadata: (body.metadata ?? saved.metadata) as any,
        updatedAt: "2026-08-14T00:00:01.000Z",
      };
      return route.fulfill(json(saved));
    }

    // GET /document/admin —— 后台读取（含草稿）
    if (url.includes("/admin")) {
      return route.fulfill(json(saved));
    }

    return route.fulfill(json({}));
  });
}

function json(data: unknown) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ code: 200, data, message: "success" }),
  };
}

/** 从模块库添加一个模块，产生未保存修改。 */
async function addModuleToCanvas(page: Page) {
  const card = page.getByRole("button", {
    name: /首屏：点击添加到页面末尾，也可拖到画布指定位置/,
  });
  await expect(card).toBeVisible();
  await card.click();
  await expect(page.locator(".homepage-editor__layer-item")).toHaveCount(1);
}

async function leaveViaPrimaryNavigation(page: Page) {
  await page.getByRole("button", { name: "展开一级导航" }).click();
  const navigation = page.getByRole("navigation", { name: "后台导航" });
  await expect(navigation).toBeVisible();
  await navigation.getByRole("button", { name: /首页/ }).first().click();
}

test.describe("店铺装修 —— 未保存内容保护（D1）", () => {
  test.skip(useMock, "编辑器闭环依赖 HTTP 拦截夹具，mock 模式下由手动验收覆盖");

  test.beforeEach(async ({ page }) => {
    await installAdminSession(page);
    await mockEditorApis(page);
  });

  test("有未保存修改时，点击侧栏菜单离开会弹确认并可留在页面", async ({ page }) => {
    await page.goto("/admin/editor/home");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();

    await addModuleToCanvas(page);

    // 展开编辑器的一级导航并触发 SPA 路由跳转。
    await leaveViaPrimaryNavigation(page);

    const guard = page.getByRole("dialog", { name: "有未保存的修改" });
    await expect(guard).toBeVisible();
    // 确认出现时，URL 仍停留在编辑器
    await expect(page).toHaveURL(/\/admin\/editor\/home/);

    // 「继续编辑」→ 取消离开，留在原页
    await page.getByRole("button", { name: "继续编辑" }).click();
    await expect(guard).toBeHidden();
    await expect(page).toHaveURL(/\/admin\/editor\/home/);
  });

  test("选择「直接离开（放弃修改）」完成跳转，不阻塞正常离开", async ({ page }) => {
    await page.goto("/admin/editor/home");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
    await addModuleToCanvas(page);

    await leaveViaPrimaryNavigation(page);
    const guard = page.getByRole("dialog", { name: "有未保存的修改" });
    await expect(guard).toBeVisible();

    await page.getByRole("button", { name: "直接离开（放弃修改）" }).click();
    await expect(page).toHaveURL(/\/admin\/dashboard/);
  });

  test("保存草稿后脏状态清空，刷新后内容正确回显", async ({ page }) => {
    await page.goto("/admin/editor/home");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
    await addModuleToCanvas(page);

    // 工具栏「保存」入口
    const saveBtn = page.getByRole("button", { name: "保存当前装修草稿" });
    await saveBtn.click();
    await expect(page.getByText("页面草稿已保存")).toBeVisible({ timeout: 8000 });

    // 刷新后重新加载，校验已保存内容回显（admin 接口返回 saved）
    await page.reload();
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
    await expect(page.locator(".homepage-editor__layer-item")).toHaveCount(1, { timeout: 10000 });
  });
});
