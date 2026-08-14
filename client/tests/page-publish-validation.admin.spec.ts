import { expect, test, type Page } from "@playwright/test";

/**
 * 店铺装修 —— 发布前校验与边界约束（D3）回归测试
 *
 * 覆盖：发布预检（前端调用后端 /document/validate，单一校验源）的边界反馈。
 *   - 超长文本 / 过多组件 / 必填缺失 → 弹出可定位的问题列表
 *   - 合法数据 → 预检通过并完成发布
 *
 * 运行方式（需已登录 admin 会话快照，非 mock 模式）：
 *   $env:PLAYWRIGHT_ADMIN_STORAGE_STATE="tests/.auth/admin.json"
 *   npx playwright test page-publish-validation --project=admin-chromium
 *
 * 说明：本套件不依赖画布拖拽——通过 mock 直接控制 validate 与 admin 文档返回，
 * 因此比 editor-leave-guard 更稳健。校验规则本身在后端 collectPuckDataErrors，
 * 前端预检调用同一接口，规则天然一致。
 */
const useMock = process.env.VITE_USE_MOCK === "true";

const API_PREFIX = "**/api/page-modules/document";

/** 一个结构合法的草稿（单个首屏主视觉），保证编辑器可正常加载 */
function validDraft() {
  return {
    id: 9201,
    pageKey: "home",
    puckData: {
      content: [
        {
          type: "首屏主视觉",
          props: {
            id: "d3-hero",
            desktopImage: "/svg/template-hero.svg",
            mobileImage: "/svg/template-hero.svg",
            title: "海川典藏",
            subtitle: "HAICHUAN JEWELRY / 2026",
            actionText: "探索本季作品",
            targetType: "page",
            linkUrl: "/products",
            productId: 0,
            altText: "海川典藏系列主视觉",
            alignment: "left",
            desktopFocusX: 50,
            desktopFocusY: 50,
            mobileFocusX: 50,
            mobileFocusY: 50,
          },
        },
      ],
      zones: {},
      root: { props: {} },
    },
    metadata: {},
    editorVersion: "0.22.4",
    status: "DRAFT",
    version: 0,
    publishedAt: null,
    publishedBy: null,
    updatedAt: "2026-08-14T00:00:00.000Z",
  };
}

async function mockEditorApis(page: Page, opts: { valid: boolean; errors?: string[] }) {
  const draft = validDraft();
  await page.route(`${API_PREFIX}*`, async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/validate")) {
      return route.fulfill(json({ valid: opts.valid, errors: opts.errors ?? [] }));
    }
    if (url.includes("/revisions")) {
      return route.fulfill(json([]));
    }
    if (url.includes("/publish")) {
      // 发布接口（PUT）：返回已发布快照
      return route.fulfill(
        json({ ...draft, status: "PUBLISHED", version: 1, updatedAt: "2026-08-14T00:00:02.000Z" }),
      );
    }
    if (method === "PUT") {
      // 保存草稿
      return route.fulfill(json({ ...draft, updatedAt: "2026-08-14T00:00:01.000Z" }));
    }
    if (url.includes("/admin")) {
      return route.fulfill(json(draft));
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

test.describe("店铺装修 —— 发布前校验与边界约束（D3）", () => {
  test.skip(useMock, "发布预检闭环依赖 HTTP 拦截夹具，mock 模式下由手动验收覆盖");

  test("超长文本 / 过多组件 / SEO 超限等校验失败时，弹出可定位的问题列表", async ({ page }) => {
    await mockEditorApis(page, {
      valid: false,
      errors: [
        "第 1 个区块「首屏展示」：title 文本过长（150/100 字）",
        "页面可见模块过多（62/60），请精简后再发布",
        "页面设置：seoTitle 过长（200/120 字）",
      ],
    });

    await page.goto("/admin/editor/home");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();

    // 点击发布 → 先走发布预检（validate），失败时直接弹问题列表
    await page.locator(".homepage-editor__toolbar-publish").click();

    const errorDialog = page.getByRole("dialog").filter({ hasText: "发布前需修复" });
    await expect(errorDialog).toBeVisible();
    await expect(errorDialog).toContainText("发布前需修复 3 个问题");
    // 三类规则（文本长度 / 组件总数 / SEO）的错误都应展示
    await expect(errorDialog).toContainText("title 文本过长");
    await expect(errorDialog).toContainText("可见模块过多");
    await expect(errorDialog).toContainText("seoTitle 过长");
    // 区块级错误应提供「定位此模块」入口，便于跳到对应组件
    await expect(errorDialog.getByRole("button", { name: "定位此模块" })).toBeVisible();
  });

  test("合法数据通过预检并完成发布", async ({ page }) => {
    await mockEditorApis(page, { valid: true });

    await page.goto("/admin/editor/home");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();

    // 发布 → 预检通过 → 弹「确认发布」→ 确认
    await page.locator(".homepage-editor__toolbar-publish").click();
    const confirmDialog = page.getByRole("dialog").filter({ hasText: "确认发布首页" });
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "确认发布" }).click();

    // 发布成功提示
    await expect(page.getByText("店铺首页已发布")).toBeVisible({ timeout: 8000 });
  });
});
