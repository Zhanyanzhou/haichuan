import { expect, test, type Page } from "@playwright/test";

/**
 * 店铺装修编辑器 —— 未保存内容保护（D1）回归测试
 *
 * 覆盖 P1 修复：编辑器有未保存修改时，点击后台侧边栏其他菜单（SPA 路由跳转）
 * 不再静默丢失，而是弹出「保存并离开 / 不保存离开 / 继续编辑」确认；
 * 保存草稿后脏状态清空，刷新后内容正确回显。
 *
 * 运行方式（需预先录制已登录的 admin 会话快照）：
 *   $env:PLAYWRIGHT_ADMIN_STORAGE_STATE="tests/.auth/admin.json"
 *   npx playwright test editor-leave-guard --project=admin-chromium
 *
 * 说明：
 * - 通过 page.route 注入确定性草稿数据（与非 mock 模式一致，参考 core-template-homepage.spec.ts）；
 *   mock 模式下客户端会绕过 HTTP 拦截，故跳过。
 * - 「添加模块」为自定义 pointer 拖拽（onPointerDown/Move/Up，非 HTML5 DnD），
 *   这里用 page.mouse 模拟指针事件；画布是 Puck iframe，落点坐标按其 boundingBox 计算。
 *   若 Puck 版本升级导致拖拽落点识别变化，需校准 addModuleViaDrag 的坐标/选择器。
 */
const useMock = process.env.VITE_USE_MOCK === "true";

const API_PREFIX = "**/api/page-modules/document";

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

    // 发布/版本等子路径透传，避免误拦
    if (url.includes("/publish") || url.includes("/revisions") || url.includes("/validate")) {
      if (url.includes("/validate")) {
        return route.fulfill(json({ valid: true, errors: [] }));
      }
      if (url.includes("/revisions")) {
        return route.fulfill(json([]));
      }
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

    return route.continue();
  });
}

function json(data: unknown) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ code: 200, data, message: "success" }),
  };
}

/** 从模块库拖拽一张卡片到画布，产生未保存修改 */
async function addModuleToCanvas(page: Page) {
  const card = page.locator('button[title^="拖拽"]').first();
  await expect(card).toBeVisible();

  // Puck 画布在 iframe 内；按其在主页面中的位置取落点
  const canvas = page
    .locator("iframe")
    .nth(1)
    .or(page.locator(".Puck-frame, .puck-frame, [data-puck-frame]").first());
  await expect(canvas).toBeVisible();
  const cardBox = await card.boundingBox();
  const canvasBox = await canvas.boundingBox();
  if (!cardBox || !canvasBox) throw new Error("无法定位模块卡或画布");

  const fromX = cardBox.x + cardBox.width / 2;
  const fromY = cardBox.y + cardBox.height / 2;
  const toX = canvasBox.x + canvasBox.width / 2;
  const toY = canvasBox.y + 80;

  await page.mouse.move(fromX, fromY);
  await page.mouse.down();
  // 分步移动以触发库卡片的 onPointerMove
  await page.mouse.move(toX, toY, { steps: 12 });
  await page.mouse.up();
}

test.describe("店铺装修 —— 未保存内容保护（D1）", () => {
  test.skip(useMock, "编辑器闭环依赖 HTTP 拦截夹具，mock 模式下由手动验收覆盖");

  test.beforeEach(async ({ page }) => {
    await mockEditorApis(page);
  });

  test("有未保存修改时，点击侧栏菜单离开会弹确认并可留在页面", async ({ page }) => {
    await page.goto("/admin/editor/home");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();

    await addModuleToCanvas(page);

    // 触发 SPA 路由跳转：点击侧栏「首页」域（directRoute = /admin/dashboard）
    const leaveTrigger = page
      .locator(".admin-sidebar__nav")
      .getByRole("button", { name: "首页" })
      .first();
    await leaveTrigger.click();

    const guard = page.getByRole("dialog", { name: "有未保存的修改" });
    await expect(guard).toBeVisible();
    // 确认出现时，URL 仍停留在编辑器
    await expect(page).toHaveURL(/\/admin\/editor\/home/);

    // 「继续编辑」→ 取消离开，留在原页
    await page.getByRole("button", { name: "继续编辑" }).click();
    await expect(guard).toBeHidden();
    await expect(page).toHaveURL(/\/admin\/editor\/home/);
  });

  test("选择「不保存离开」直接跳转，不阻塞正常离开", async ({ page }) => {
    await page.goto("/admin/editor/home");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
    await addModuleToCanvas(page);

    await page
      .locator(".admin-sidebar__nav")
      .getByRole("button", { name: "首页" })
      .first()
      .click();
    const guard = page.getByRole("dialog", { name: "有未保存的修改" });
    await expect(guard).toBeVisible();

    await page.getByRole("button", { name: "不保存离开" }).click();
    await expect(page).toHaveURL(/\/admin\/dashboard/);
  });

  test("保存草稿后脏状态清空，刷新后内容正确回显", async ({ page }) => {
    await page.goto("/admin/editor/home");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
    await addModuleToCanvas(page);

    // 工具栏「保存」入口
    const saveBtn = page
      .locator(".homepage-editor__toolbar-secondary-actions")
      .getByRole("button", { name: "保存" });
    await saveBtn.click();
    await expect(page.getByText("页面草稿已保存")).toBeVisible({ timeout: 8000 });

    // 刷新后重新加载，校验已保存内容回显（admin 接口返回 saved）
    await page.reload();
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
    await expect(page.locator(".homepage-editor__layer-item")).toHaveCount(1, { timeout: 10000 });
  });
});
