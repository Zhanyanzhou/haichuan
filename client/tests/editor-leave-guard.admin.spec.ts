import { expect, test, type Page } from "@playwright/test";
import { installAdminSession } from "./fixtures/session-auth";
import { systemTemplateCatalog } from "./fixtures/template-catalog";

/**
 * 店铺装修编辑器 —— 未保存内容保护（D1）回归测试
 *
 * 覆盖 P1 修复：编辑器有未保存修改时，点击后台侧边栏其他菜单（SPA 路由跳转）
 * 不再静默丢失，而是只提供「保存并离开 / 继续编辑」；
 * 保存草稿后脏状态清空，刷新后内容正确回显。
 *
 * 运行方式（测试通过当前 Cookie 会话接口夹具建立确定性管理员身份）：
 *   npx playwright test editor-leave-guard --project=admin-chromium
 *
 * 说明：
 * - 通过 page.route 注入确定性草稿数据（与非 mock 模式一致，参考 core-template-homepage.spec.ts）；
 *   mock 模式下客户端会绕过 HTTP 拦截，故跳过。
 * - 管理员点击系统模板卡会直接进入模板编辑，因此这里按当前产品交互拖入页面；
 *   本文件只验证脏状态与离开保护，不重复断言拖拽细节。
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

async function mockEditorApis(page: Page, { failSaves = false } = {}) {
  let saved: ReturnType<typeof makeDraft> = makeDraft();
  await page.route(`${API_PREFIX}*`, async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes("/auth/profile")) return route.fallback();

    if (url.includes("/page-modules/dynamic-templates/catalog")) {
      return route.fulfill(json(systemTemplateCatalog()));
    }

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
      if (failSaves) {
        return route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ code: 500, data: null, message: "save failed" }),
        });
      }
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
  const expandLibrary = page.getByRole("button", { name: "展开模板组件库" });
  if (await expandLibrary.isVisible()) await expandLibrary.click();
  const card = page.getByRole("button", {
    name: "首屏：点击添加到页面末尾，也可拖到画布指定位置",
  });
  const canvas = page.locator(".homepage-editor__canvas-document");
  await expect(card).toBeVisible();
  await card.scrollIntoViewIfNeeded();
  const cardBox = await card.boundingBox();
  const canvasBox = await canvas.boundingBox();
  if (!cardBox || !canvasBox) throw new Error("模板卡片或页面画布没有可用尺寸");
  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + 120, { steps: 14 });
  await page.mouse.up();
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

    const guard = page.getByRole("dialog", { name: "保存后离开？" });
    await expect(guard).toBeVisible();
    // 确认出现时，URL 仍停留在编辑器
    await expect(page).toHaveURL(/\/admin\/editor\/home/);

    // 「继续编辑」→ 取消离开，留在原页
    await page.getByRole("button", { name: "继续编辑" }).click();
    await expect(guard).toBeHidden();
    await expect(page).toHaveURL(/\/admin\/editor\/home/);
  });

  test("选择「保存并离开」后保存草稿并完成跳转", async ({ page }) => {
    await page.goto("/admin/editor/home");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
    await addModuleToCanvas(page);

    await leaveViaPrimaryNavigation(page);
    const guard = page.getByRole("dialog", { name: "保存后离开？" });
    await expect(guard).toBeVisible();
    await expect(guard.getByRole("button", { name: "直接离开（放弃修改）" })).toHaveCount(0);

    await guard.getByRole("button", { name: "保存并离开" }).click();
    await expect(page).toHaveURL(/\/admin\/dashboard/);
  });

  test("保存失败时保留未保存画布并停留在当前页面", async ({ page }) => {
    await page.unroute(`${API_PREFIX}*`);
    await mockEditorApis(page, { failSaves: true });
    await page.goto("/admin/editor/home");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
    await addModuleToCanvas(page);

    await leaveViaPrimaryNavigation(page);
    const guard = page.getByRole("dialog", { name: "保存后离开？" });
    await guard.getByRole("button", { name: "保存并离开" }).click();

    await expect(page).toHaveURL(/\/admin\/editor\/home/);
    await expect(page.getByText("修改未保存，已留在当前页面")).toBeVisible();
    await expect(page.locator(".homepage-editor__draft-status")).toContainText("有未保存修改");
    await expect(
      page
        .frameLocator(".homepage-editor__canvas-scale iframe")
        .locator('[data-content-template-module="首屏主视觉"]'),
    ).toHaveCount(1);
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
