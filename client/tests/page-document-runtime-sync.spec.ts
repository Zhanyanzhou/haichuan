import { expect, test, type Page } from "@playwright/test";

const useMock = process.env.VITE_USE_MOCK === "true";

function apiResponse(data: unknown) {
  return JSON.stringify({ code: 200, data, message: "success" });
}

function publishedTextDocument(pageKey: string, title: string, version: number) {
  return {
    id: 7000 + version,
    pageKey,
    puckData: {
      content: [
        {
          type: "文字横幅",
          props: {
            id: `${pageKey}-live-copy`,
            eyebrow: "PAGE DOCUMENT",
            title,
            body: "该内容来自与后台画布一致的 PageDocument。",
            buttonText: "",
            linkUrl: "",
            targetType: "none",
            productId: 0,
            template: "center",
            bgColor: "#FFFFFF",
            textColor: "#181A1B",
            spacing: "comfortable",
          },
        },
      ],
      root: { props: {} },
    },
    metadata: {},
    status: "PUBLISHED",
    version,
    publishedAt: `2026-08-21T00:00:0${version}.000Z`,
    updatedAt: `2026-08-21T00:00:0${version}.000Z`,
  };
}

async function mockPublicShell(page: Page) {
  await page.route("**/api/settings/public", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: apiResponse({ siteName: "海川珠宝" }),
    }),
  );
}

async function installControllableEventSource(page: Page) {
  await page.addInitScript(() => {
    const sources: Array<{ onmessage: ((event: { data: string }) => void) | null }> = [];
    class TestEventSource {
      onmessage: ((event: { data: string }) => void) | null = null;
      onerror: (() => void) | null = null;

      constructor(_url: string) {
        sources.push(this);
      }

      close() {}
    }

    (window as any).EventSource = TestEventSource;
    (window as any).__emitPagePublish = (payload: unknown) => {
      const data = JSON.stringify(payload);
      sources.forEach((source) => source.onmessage?.({ data }));
    };
  });
}

async function installAdminSession(page: Page) {
  await page.addInitScript(() => {
    const user = { id: 1, username: "page-sync-audit", role: "SUPER_ADMIN" };
    localStorage.setItem("token", "page-sync-audit-token");
    localStorage.setItem("jewelry-auth", JSON.stringify({
      state: { token: "page-sync-audit-token", user, isLoggedIn: true },
      version: 0,
    }));
  });
}

async function mockEmptyEditorApis(page: Page) {
  await page.route("**/api/**", (route) => {
    const url = route.request().url();
    if (url.includes("/page-modules/document/validate")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: apiResponse({ valid: true, errors: [], issues: [] }),
      });
    }
    if (
      url.includes("/page-modules/document/published") ||
      url.includes("/page-modules/document/admin")
    ) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: apiResponse(null),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: apiResponse([]),
    });
  });
}

test.describe("PageDocument 前台与画布单一运行时", () => {
  test.skip(useMock, "本套件用 HTTP 与 EventSource 夹具验证运行时切换，VITE mock 会绕过这些边界");

  test("未发布的纯品牌页使用与编辑器相同的页面种子，而不是静态 JSX 兜底", async ({ page }) => {
    await mockPublicShell(page);
    await page.route("**/api/page-modules/document/published?*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: apiResponse(null),
      }),
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/custom");

    await expect(page.getByRole("heading", { name: "珠宝定制", level: 1 })).toBeVisible();
    await expect(page.locator('[data-content-template-module="首屏主视觉"]')).toHaveCount(1);
    await expect(page.locator("[data-content-template-module]")).toHaveCount(6);
    await expect(page.getByText("常见问题", { exact: true })).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))
      .toBe(true);
  });

  test("后台新页面画布直接载入同一份页面种子", async ({ page }) => {
    await installAdminSession(page);
    await mockEmptyEditorApis(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/admin/editor/custom");

    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
    const canvas = page.frameLocator("iframe");
    await expect(canvas.locator("[data-content-template-module]")).toHaveCount(6);
    await expect(page.getByRole("button", { name: /首屏 服务端校验通过/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /内容流程 服务端校验通过/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /预约入口 服务端校验通过/ })).toBeVisible();
  });

  test("动态预约页的空素材种子保留固定业务标题和表单", async ({ page }) => {
    await mockPublicShell(page);
    await page.route("**/api/page-modules/document/published?*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: apiResponse(null),
      }),
    );

    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto("/contact");

    await expect(page.getByRole("heading", { name: "预约咨询", level: 1 })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "提交咨询需求", level: 1 })).toHaveCount(1);
    await expect(page.getByRole("textbox", { name: /^姓名/ })).toBeVisible();
    await expect(page.locator('[data-content-template-module="首屏主视觉"]')).toHaveCount(1);
  });

  test("收到当前页面的发布事件后重新读取发布快照并更新前台", async ({ page }) => {
    await mockPublicShell(page);
    await installControllableEventSource(page);
    let version = 1;
    await page.route("**/api/page-modules/document/published?*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: apiResponse(
          publishedTextDocument(
            "custom",
            version === 1 ? "发布前版本" : "发布后实时版本",
            version,
          ),
        ),
      }),
    );

    await page.goto("/custom");
    await expect(page.getByRole("heading", { name: "发布前版本" })).toBeVisible();

    version = 2;
    await page.evaluate(() => {
      (window as any).__emitPagePublish({
        type: "page-document-published",
        pageKey: "custom",
        version: 2,
      });
    });

    await expect(page.getByRole("heading", { name: "发布后实时版本" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "发布前版本" })).toHaveCount(0);
  });
});
