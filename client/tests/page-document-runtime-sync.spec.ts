import { expect, test, type Page } from "@playwright/test";
import { installAdminSession as installMockAdminSession } from "./fixtures/session-auth";
import { createContentTemplateMarker } from "../src/page-builder/generated/contentTemplates.generated";
import { systemTemplateCatalog } from "./fixtures/template-catalog";

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
  await page.route("**/api/settings/public**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: apiResponse({ siteName: "海川珠宝" }),
    }),
  );
}

async function installControllableEventSource(page: Page) {
  await page.addInitScript(() => {
    const sources: Array<{
      onmessage: ((event: { data: string }) => void) | null;
      closed: boolean;
    }> = [];
    class TestEventSource {
      onmessage: ((event: { data: string }) => void) | null = null;
      onerror: (() => void) | null = null;
      closed = false;

      constructor(_url: string) {
        sources.push(this);
      }

      close() {
        this.closed = true;
      }
    }

    (window as any).EventSource = TestEventSource;
    (window as any).__emitPagePublish = (payload: unknown) => {
      const data = JSON.stringify(payload);
      sources
        .filter((source) => !source.closed)
        .forEach((source) => source.onmessage?.({ data }));
    };
    (window as any).__getPagePublishStreamStats = () => ({
      created: sources.length,
      active: sources.filter((source) => !source.closed).length,
      closed: sources.filter((source) => source.closed).length,
    });
  });
}

async function installAdminSession(page: Page) {
  await installMockAdminSession(page, {
    username: "page-sync-audit",
    realName: "页面同步测试管理员",
  });
}

async function mockEmptyEditorApis(page: Page) {
  await page.route("**/api/**", (route) => {
    const url = route.request().url();
    if (url.includes("/auth/profile")) return route.fallback();
    if (url.includes("/page-modules/dynamic-templates/catalog")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: apiResponse(systemTemplateCatalog()),
      });
    }
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

  test("模板组件库在六个装修页面展示全部固定模板并允许跨页面添加", async ({ page }) => {
    await installAdminSession(page);
    await mockEmptyEditorApis(page);
    await page.route("**/api/page-modules/document/admin?*", (route) => {
      const pageKey = new URL(route.request().url()).searchParams.get("pageKey") || "home";
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: apiResponse({
          ...publishedTextDocument(pageKey, `${pageKey} 通用模板验收`, 1),
          status: "DRAFT",
        }),
      });
    });
    await page.setViewportSize({ width: 1440, height: 900 });

    for (const pageKey of ["home", "about", "products", "catalog", "custom", "contact"]) {
      await page.goto(`/admin/editor/${pageKey}`);
      await expect(page.getByRole("complementary", { name: "模板组件库" })).toBeVisible();
      await expect(page.locator(".homepage-editor__template-card-activate")).toHaveCount(24);
    }

    await page.goto("/admin/editor/catalog");
    await page.getByRole("button", {
      name: "前后对比：点击添加到页面末尾，也可拖到画布指定位置",
    }).click();
    await expect(page.getByText("已插入“前后对比”，可在右侧继续编辑")).toBeVisible();
  });

  test("每个公开路由只读取一次当前 PageDocument 快照", async ({ page }) => {
    await mockPublicShell(page);
    await installControllableEventSource(page);
    const requestCounts = new Map<string, number>();
    let lastRequestAt = Date.now();
    await page.route("**/api/page-modules/document/published?*", (route) => {
      const pageKey = new URL(route.request().url()).searchParams.get("pageKey") || "unknown";
      requestCounts.set(pageKey, (requestCounts.get(pageKey) || 0) + 1);
      lastRequestAt = Date.now();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: apiResponse(null),
      });
    });

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "首页正在准备", level: 1 })).toBeVisible();
    await expect.poll(() => Date.now() - lastRequestAt).toBeGreaterThanOrEqual(100);
    expect(requestCounts.get("home")).toBe(1);

    await page.goto("/custom");
    await expect(page.getByRole("heading", { name: "珠宝定制", level: 1 })).toBeVisible();
    await expect.poll(() => Date.now() - lastRequestAt).toBeGreaterThanOrEqual(100);
    expect(requestCounts.get("custom")).toBe(1);
  });

  test("完整公开壳层共享同一份 SiteSettings 快照", async ({ page }) => {
    let settingsReads = 0;
    await page.route("**/api/settings/public**", (route) => {
      settingsReads += 1;
      const firstSnapshot = settingsReads === 1;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: apiResponse({
          siteName: firstSnapshot ? "旧快照站点" : "新快照站点",
          storeName: firstSnapshot ? "旧快照门店" : "新快照门店",
          contactAddress: firstSnapshot ? "旧快照地址" : "新快照地址",
          businessHours: "10:00–18:00",
          contactPhone: firstSnapshot ? "400-111-1111" : "400-222-2222",
          storeMapUrl: firstSnapshot
            ? "https://maps.example.com/old"
            : "https://maps.example.com/new",
        }),
      });
    });
    await page.route("**/svg/site-settings-store.svg", (route) => route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800"><rect width="1200" height="800" fill="#ecebe7"/></svg>',
    }));
    await page.route("**/api/page-modules/document/published?*", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: apiResponse({
          pageKey: "about",
          puckData: {
            content: [
              {
                type: "文字横幅",
                props: {
                  id: "shared-settings-intro",
                  title: "共享设置快照",
                  buttonText: "",
                  linkUrl: "",
                  targetType: "none",
                  __contentTemplate: createContentTemplateMarker("文字横幅"),
                },
              },
              {
                type: "门店信息",
                props: {
                  id: "shared-settings-store",
                  image: "/svg/site-settings-store.svg",
                  __contentTemplate: createContentTemplateMarker("门店信息"),
                },
              },
              {
                type: "预约入口",
                props: {
                  id: "shared-settings-booking",
                  title: "预约到访",
                  buttonText: "联系我们",
                  targetType: "page",
                  linkUrl: "/contact",
                  __contentTemplate: createContentTemplateMarker("预约入口"),
                },
              },
            ],
            root: { props: {} },
          },
          metadata: {},
          status: "PUBLISHED",
          version: 1,
        }),
      });
    });

    await page.goto("/about");
    await expect(page.getByRole("heading", { name: "共享设置快照" })).toBeVisible();
    await expect(page).toHaveTitle("关于海川 | 旧快照站点");
    const storeInfo = page.locator('[data-content-template-contract="storeInfo"]');
    const booking = page.locator('[data-content-template-contract="booking"]');
    await expect(storeInfo).toContainText("旧快照门店");
    await expect(storeInfo).toContainText("旧快照地址");
    await expect(booking).toContainText("400-111-1111");
    expect(settingsReads).toBe(1);

    await booking.getByRole("link", { name: "联系我们" }).click();
    await expect(page).toHaveURL(/\/contact$/);
    const contactPage = page.locator(".contact-page");
    await expect(contactPage).toContainText("400-111-1111");
    await expect(contactPage).not.toContainText("400-222-2222");
    expect(settingsReads).toBe(1);
  });

  test("首页发布事件同时刷新正文与 PageDocument SEO", async ({ page }) => {
    await mockPublicShell(page);
    await installControllableEventSource(page);
    let published = publishedTextDocument("home", "首页旧版本", 1);
    published.metadata = {
      seoTitle: "首页旧 SEO",
      seoDescription: "首页旧描述",
    };
    await page.route("**/api/page-modules/document/published?*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: apiResponse(published),
      }),
    );

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "首页旧版本" })).toBeVisible();
    await expect(page).toHaveTitle("首页旧 SEO");

    published = publishedTextDocument("home", "首页新版本", 2);
    published.metadata = {
      seoTitle: "首页新 SEO",
      seoDescription: "首页新描述",
    };
    await page.evaluate(() => {
      (window as any).__emitPagePublish({
        type: "page-document-published",
        pageKey: "home",
        version: 2,
      });
    });

    await expect(page.getByRole("heading", { name: "首页新版本" })).toBeVisible();
    await expect(page).toHaveTitle("首页新 SEO");
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      "首页新描述",
    );
  });

  test("非首页标签页重新可见时补拉正文与 PageDocument SEO", async ({ page }) => {
    await mockPublicShell(page);
    await page.addInitScript(() => {
      let visibilityState: DocumentVisibilityState = "visible";
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => visibilityState,
      });
      (window as any).__setVisibilityState = (next: DocumentVisibilityState) => {
        visibilityState = next;
        document.dispatchEvent(new Event("visibilitychange"));
      };
    });
    let published = publishedTextDocument("custom", "定制旧版本", 3);
    published.metadata = {
      seoTitle: "定制旧 SEO",
      seoDescription: "定制旧描述",
    };
    await page.route("**/api/page-modules/document/published?*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: apiResponse(published),
      }),
    );

    await page.goto("/custom");
    await expect(page.getByRole("heading", { name: "定制旧版本" })).toBeVisible();
    await expect(page).toHaveTitle("定制旧 SEO");

    published = publishedTextDocument("custom", "定制新版本", 4);
    published.metadata = {
      seoTitle: "定制新 SEO",
      seoDescription: "定制新描述",
    };
    await page.evaluate(() => {
      (window as any).__setVisibilityState("hidden");
      (window as any).__setVisibilityState("visible");
    });

    await expect(page.getByRole("heading", { name: "定制新版本" })).toBeVisible();
    await expect(page).toHaveTitle("定制新 SEO");
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      "定制新描述",
    );
  });

  test("后台标签页释放发布事件流，重新可见时重连并补拉当前版本", async ({ page }) => {
    await mockPublicShell(page);
    await page.addInitScript(() => {
      let visibilityState: DocumentVisibilityState = "visible";
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => visibilityState,
      });
      (window as any).__setVisibilityState = (next: DocumentVisibilityState) => {
        visibilityState = next;
        document.dispatchEvent(new Event("visibilitychange"));
      };
    });
    await installControllableEventSource(page);

    let version = 1;
    await page.route("**/api/page-modules/document/published?*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: apiResponse(publishedTextDocument(
          "custom",
          version === 1 ? "可见标签版本" : "重新可见后的版本",
          version,
        )),
      }),
    );

    await page.goto("/custom");
    await expect(page.getByRole("heading", { name: "可见标签版本" })).toBeVisible();
    await expect.poll(() => page.evaluate(() =>
      (window as any).__getPagePublishStreamStats().active,
    )).toBe(1);
    const initialStats = await page.evaluate(() =>
      (window as any).__getPagePublishStreamStats(),
    );
    expect(initialStats.created).toBeGreaterThan(0);
    expect(initialStats.closed).toBe(initialStats.created - 1);

    await page.evaluate(() => (window as any).__setVisibilityState("hidden"));
    await expect.poll(() => page.evaluate(() =>
      (window as any).__getPagePublishStreamStats(),
    )).toEqual({
      created: initialStats.created,
      active: 0,
      closed: initialStats.created,
    });

    version = 2;
    await page.evaluate(() => (window as any).__setVisibilityState("visible"));
    await expect(page.getByRole("heading", { name: "重新可见后的版本" })).toBeVisible();
    await expect.poll(() => page.evaluate(() =>
      (window as any).__getPagePublishStreamStats(),
    )).toEqual({
      created: initialStats.created + 1,
      active: 1,
      closed: initialStats.created,
    });
  });

  test("公开页读取失败后重试会同步恢复正文与索引状态", async ({ page }) => {
    await mockPublicShell(page);
    let shouldFail = true;
    const published = publishedTextDocument("custom", "重试后的定制内容", 8);
    published.metadata = {
      seoTitle: "已恢复的定制 SEO",
      seoDescription: "公开快照恢复后应重新允许索引。",
    };
    await page.route("**/api/page-modules/document/published?*", (route) => {
      if (shouldFail) {
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: apiResponse(null),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: apiResponse(published),
      });
    });

    await page.goto("/custom");
    await expect(page.getByRole("heading", { name: "珠宝定制", level: 1 })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");

    shouldFail = false;
    await page.getByRole("button", { name: "重新载入内容" }).click();

    await expect(page.getByRole("heading", { name: "重试后的定制内容" })).toBeVisible();
    await expect(page).toHaveTitle("已恢复的定制 SEO");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "index, follow");
  });

  test("未发布的纯品牌页只显示安全短页，不回退到第二套硬编码品牌内容", async ({ page }) => {
    await mockPublicShell(page);
    await page.route("**/api/page-modules/document/published?*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: apiResponse(null),
      }),
    );

    await page.setViewportSize({ width: 390, height: 844 });
    for (const expectation of [
      {
        path: "/custom",
        heading: "珠宝定制",
        action: "提交定制咨询",
        absentLegacyCopy: "常见问题",
      },
      {
        path: "/about",
        heading: "关于海川",
        action: "进入选款中心",
        absentLegacyCopy: "从作品开始，认识海川。",
      },
    ]) {
      await page.goto(expectation.path);
      const fallback = page.locator('[data-production-fallback="safe-status"]');
      await expect(fallback).toHaveAttribute("data-page-document-state", "unpublished");
      await expect(page.getByRole("heading", { name: expectation.heading, level: 1 })).toBeVisible();
      await expect(page.getByRole("link", { name: expectation.action })).toBeVisible();
      await expect(page.getByText(expectation.absentLegacyCopy, { exact: true })).toHaveCount(0);
      await expect(page.locator("[data-content-template-module]")).toHaveCount(0);
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))
        .toBe(true);
    }
  });

  test("非首页装修页消费已发布 PageDocument SEO，而不是继续使用路由硬编码", async ({ page }) => {
    await mockPublicShell(page);
    const published = publishedTextDocument("custom", "已发布定制内容", 12);
    published.metadata = {
      seoTitle: "已发布定制 SEO 标题",
      seoDescription: "该描述来自定制页已发布 PageDocument metadata。",
      ogImage: "/images/custom-share.jpg",
    };
    await page.route("**/api/page-modules/document/published?*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: apiResponse(published),
      }),
    );

    await page.goto("/custom");
    await expect(page.getByRole("heading", { name: "已发布定制内容" })).toBeVisible();
    await expect(page).toHaveTitle("已发布定制 SEO 标题");
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      "该描述来自定制页已发布 PageDocument metadata。",
    );
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      "content",
      /\/images\/custom-share\.jpg$/,
    );
    await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute(
      "content",
      /\/images\/custom-share\.jpg$/,
    );
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      "content",
      "summary_large_image",
    );
  });

  test("发布接口失败或返回无效文档时不公开渲染编辑器种子", async ({ page }) => {
    await mockPublicShell(page);
    let responseMode: "error" | "invalid" | "draft" | "wrong-page" = "error";
    await page.route("**/api/page-modules/document/published?*", (route) =>
      responseMode === "error"
        ? route.fulfill({
            status: 503,
            contentType: "application/json",
            body: apiResponse({ message: "service unavailable" }),
          })
        : responseMode === "invalid"
          ? route.fulfill({
              status: 200,
              contentType: "application/json",
              body: apiResponse({
                pageKey: "custom",
                puckData: { content: "invalid" },
              }),
            })
          : route.fulfill({
              status: 200,
              contentType: "application/json",
              body: apiResponse({
                ...publishedTextDocument(
                  responseMode === "wrong-page" ? "about" : "custom",
                  "不应公开的内容",
                  3,
                ),
                status: responseMode === "draft" ? "DRAFT" : "PUBLISHED",
              }),
            }),
    );

    await page.goto("/custom");
    await expect(page.getByRole("heading", { name: "珠宝定制", level: 1 })).toBeVisible();
    await expect(page.locator("[data-content-template-module]")).toHaveCount(0);

    responseMode = "invalid";
    await page.reload();
    await expect(page.getByRole("heading", { name: "珠宝定制", level: 1 })).toBeVisible();
    await expect(page.locator("[data-content-template-module]")).toHaveCount(0);

    for (const mode of ["draft", "wrong-page"] as const) {
      responseMode = mode;
      await page.reload();
      await expect(page.getByRole("heading", { name: "珠宝定制", level: 1 })).toBeVisible();
      await expect(page.getByRole("heading", { name: "不应公开的内容" })).toHaveCount(0);
      await expect(page.locator("[data-content-template-module]")).toHaveCount(0);
    }
  });

  test("已展示有效发布快照后刷新失败，继续保留最后一次有效公开结果", async ({ page }) => {
    await mockPublicShell(page);
    await installControllableEventSource(page);
    let failRefresh = false;
    await page.route("**/api/page-modules/document/published?*", (route) =>
      failRefresh
        ? route.fulfill({
            status: 503,
            contentType: "application/json",
            body: apiResponse({ message: "service unavailable" }),
          })
        : route.fulfill({
            status: 200,
            contentType: "application/json",
            body: apiResponse(publishedTextDocument("custom", "最后一次有效版本", 1)),
          }),
    );

    await page.goto("/custom");
    await expect(page.getByRole("heading", { name: "最后一次有效版本" })).toBeVisible();

    failRefresh = true;
    await page.evaluate(() => {
      (window as any).__emitPagePublish({
        type: "page-document-published",
        pageKey: "custom",
        version: 2,
      });
    });

    await expect(page.getByRole("heading", { name: "最后一次有效版本" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "珠宝定制", level: 1 })).toHaveCount(1);
    await expect(page.locator("main h1")).toHaveCount(1);
  });

  test("服务端明确撤销旧快照发布资格后清除内存版本并进入安全短页", async ({ page }) => {
    await mockPublicShell(page);
    await installControllableEventSource(page);
    let requiresRevalidation = false;
    await page.route("**/api/page-modules/document/published?*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: apiResponse(
          requiresRevalidation
            ? {
                pageKey: "custom",
                status: "INVALID",
                invalidReason: "publication-revalidation-required",
                version: 1,
              }
            : publishedTextDocument("custom", "旧的已展示版本", 1),
        ),
      }),
    );

    await page.goto("/custom");
    await expect(page.getByRole("heading", { name: "旧的已展示版本" })).toBeVisible();

    requiresRevalidation = true;
    await page.evaluate(() => {
      (window as any).__emitPagePublish({
        type: "page-document-published",
        pageKey: "custom",
        version: 2,
      });
    });

    await expect(page.getByRole("heading", { name: "旧的已展示版本" })).toHaveCount(0);
    await expect(page.locator('[data-page-document-state="invalid"]')).toBeVisible();
    await expect(page.getByRole("heading", { name: "珠宝定制", level: 1 })).toBeVisible();
  });

  test("首页从未发布时不公开渲染代码种子，并显示可继续浏览的安全短页", async ({ page }) => {
    await mockPublicShell(page);
    const productRequests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith("/api/products/public")) {
        productRequests.push(request.url());
      }
    });
    await page.route("**/api/page-modules/document/published?*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: apiResponse(null),
      }),
    );

    await page.goto("/");
    await expect(page.locator('[data-page-document-state="unpublished"]')).toBeVisible();
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(
      page.locator('[data-page-document-state="unpublished"]'),
    ).toHaveAttribute("data-production-fallback", "safe-status");
    await expect(page.getByRole("heading", { name: "首页正在准备", level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "进入选款中心" })).toHaveAttribute("href", "/catalog");
    await expect(page.getByRole("link", { name: "了解珠宝定制" })).toHaveAttribute("href", "/custom");
    await expect(page.getByRole("button", { name: "重新载入内容" })).toHaveCount(0);
    await expect(page.locator(".vca-home")).toHaveCount(0);
    await expect(page.locator("[data-content-template-module]")).toHaveCount(0);
    await expect(page.getByText("本季精选", { exact: true })).toHaveCount(0);
    await expect(page.getByText(/按克重与工艺核价/)).toHaveCount(0);
    await expect(page.locator(".vca-home").getByText(/世家|传承|新闻|工艺/)).toHaveCount(0);
    await expect(page.locator('[data-page-header-mode="solid"]')).toBeVisible();
    expect(productRequests).toEqual([]);
  });

  test("首页旧发布版本需要重新审核时显示内容待完善状态且不提供无效重试", async ({ page }) => {
    await mockPublicShell(page);
    await page.route("**/api/page-modules/document/published?*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: apiResponse({
          pageKey: "home",
          status: "INVALID",
          invalidReason: "publication-revalidation-required",
          version: 38,
        }),
      }),
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.locator('[data-page-document-state="invalid"]')).toBeVisible();
    await expect(page.getByRole("heading", { name: "首页正在完善", level: 1 })).toBeVisible();
    await expect(page.getByText("首页现有内容需要重新审核后才能公开。", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "重新载入内容" })).toHaveCount(0);
    await expect(page.locator("[data-content-template-module]")).toHaveCount(0);
  });

  test("首页读取失败时显示重试状态，恢复后切换为未发布安全短页", async ({ page }) => {
    await mockPublicShell(page);
    let shouldFail = true;
    let requestCount = 0;
    await page.route("**/api/page-modules/document/published?*", (route) => {
      requestCount += 1;
      return shouldFail
        ? route.fulfill({
            status: 503,
            contentType: "application/json",
            body: apiResponse({ message: "service unavailable" }),
          })
        : route.fulfill({
            status: 200,
            contentType: "application/json",
            body: apiResponse(null),
          });
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "首页暂不可用", level: 1 })).toBeVisible();
    await expect(
      page.getByRole("alert").filter({ hasText: "服务器繁忙，请稍后再试" }),
    ).toHaveCount(0);
    await expect(page.getByRole("link", { name: "进入选款中心" })).toHaveAttribute("href", "/catalog");
    const retry = page.getByRole("button", { name: "重新载入内容" });
    await expect(retry).toBeVisible();

    shouldFail = false;
    await retry.click();
    await expect(page.getByRole("heading", { name: "首页正在准备", level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: "重新载入内容" })).toHaveCount(0);
    expect(requestCount).toBeGreaterThanOrEqual(2);
  });

  test("定制页在桌面与手机共用公共主内容区", async ({ page }) => {
    await mockPublicShell(page);
    await page.route("**/api/page-modules/document/published?*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: apiResponse(null),
      }),
    );

    for (const viewport of [
      { width: 1920, height: 1200 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/custom");
      await expect(page.getByRole("main")).toHaveCount(1);
      await expect(page.locator("#main-content")).toHaveCount(1);
      await expect(
        page.getByRole("heading", { name: "珠宝定制", level: 1 }),
      ).toHaveCount(1);
    }
  });

  test("首页主视觉媒体失败时保留覆盖式 Header 的深色安全承托", async ({ page }) => {
    await mockPublicShell(page);
    await page.route("**/missing-brand-hero.jpg", (route) =>
      route.fulfill({ status: 404, body: "missing" }),
    );
    await page.route("**/api/page-modules/document/published?*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: apiResponse({
          id: 7100,
          pageKey: "home",
          status: "PUBLISHED",
          version: 1,
          puckData: {
            content: [
              {
                type: "首屏主视觉",
                props: {
                  id: "failed-hero",
                  title: "海川珠宝",
                  altText: "海川珠宝主视觉",
                  desktopImage: "/missing-brand-hero.jpg",
                  mobileImage: "/missing-brand-hero.jpg",
                  actionText: "",
                  linkUrl: "",
                  targetType: "none",
                },
              },
              {
                type: "单图海报",
                props: {
                  id: "failed-poster",
                  title: "叙事海报",
                  altText: "海川珠宝叙事海报",
                  desktopImage: "/missing-brand-hero.jpg",
                  mobileImage: "/missing-brand-hero.jpg",
                  actionText: "",
                  linkUrl: "",
                  targetType: "none",
                },
              },
            ],
            root: { props: {} },
          },
        }),
      }),
    );

    await page.goto("/");
    const failureSurface = page.getByText("主视觉图片暂不可用");
    await expect(failureSurface).toBeVisible();
    await expect(failureSurface).toHaveCSS("background-color", "rgb(24, 26, 27)");
    await expect(page.getByText("海报图片暂不可用")).toBeVisible();
    await expect(page.locator(".hc-hero__image, .homepage-single-poster__image")).toHaveCount(0);
    await expect(page.getByRole("banner")).toHaveClass(/is-transparent/);
  });

  test("首页媒体 naturalWidth 为零时统一进入中性失败态", async ({ page }) => {
    await mockPublicShell(page);
    const pixel =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    await page.route("**/api/page-modules/document/published?*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: apiResponse({
          id: 7101,
          pageKey: "home",
          status: "PUBLISHED",
          version: 1,
          puckData: {
            content: [
              {
                type: "首屏主视觉",
                props: {
                  id: "zero-width-hero",
                  title: "海川珠宝",
                  altText: "海川珠宝主视觉",
                  desktopImage: pixel,
                  mobileImage: pixel,
                  actionText: "",
                  linkUrl: "",
                  targetType: "none",
                },
              },
              {
                type: "单图海报",
                props: {
                  id: "zero-width-poster",
                  title: "叙事海报",
                  altText: "海川珠宝叙事海报",
                  desktopImage: pixel,
                  mobileImage: pixel,
                  actionText: "",
                  linkUrl: "",
                  targetType: "none",
                },
              },
              {
                type: "全屏出血图",
                props: {
                  id: "zero-width-full-bleed",
                  image: pixel,
                  mobileImage: pixel,
                  altText: "通栏叙事图片",
                  buttonText: "",
                  linkUrl: "",
                  targetType: "none",
                },
              },
            ],
            root: { props: {} },
          },
        }),
      }),
    );

    await page.goto("/");
    const media = page.locator(
      ".hc-hero__image, .homepage-single-poster__image, .hc-full-bleed__image",
    );
    await expect(media).toHaveCount(3);
    await media.evaluateAll((images) => {
      images.forEach((image) => {
        Object.defineProperty(image, "naturalWidth", {
          configurable: true,
          value: 0,
        });
        Object.defineProperty(image, "naturalHeight", {
          configurable: true,
          value: 0,
        });
        image.dispatchEvent(new Event("load"));
      });
    });
    await expect(page.getByText("主视觉图片暂不可用")).toBeVisible();
    await expect(page.getByText("海报图片暂不可用")).toBeVisible();
    await expect(page.getByRole("img", { name: "通栏叙事图片" })).toBeVisible();
    await expect(
      page.locator(
        ".hc-hero__image, .homepage-single-poster__image, .hc-full-bleed__image",
      ),
    ).toHaveCount(0);
  });

  test("后台新页面只载入中性结构，不自动写入未确认内容或素材", async ({ page }) => {
    await installAdminSession(page);
    await mockEmptyEditorApis(page);
    await page.setViewportSize({ width: 1920, height: 1200 });
    await page.goto("/admin/editor/custom");

    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
    const canvas = page.frameLocator("iframe");
    const modules = canvas.locator("[data-content-template-module]");
    await expect(modules).toHaveCount(8);
    await expect.poll(() => modules.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-content-template-module")),
    )).toEqual([
      "全屏出血图",
      "单图海报",
      "单图海报",
      "全屏出血图",
      "单图海报",
      "单图海报",
      "全屏出血图",
      "文字横幅",
    ]);
    await expect(canvas.getByRole("heading", { name: "一只手镯，从构想到成形" })).toHaveCount(0);
    await expect(canvas.getByRole("heading", { name: "以成品完成确认" })).toHaveCount(0);
    await expect(canvas.locator('[src*="custom-process-v4-editorial"]')).toHaveCount(0);
    await expect(
      page.locator(".homepage-editor__layer-name").filter({ hasText: "通栏图" }).first(),
    ).toBeVisible();
    await expect(
      page.locator(".homepage-editor__layer-name").filter({ hasText: "单图文" }).first(),
    ).toBeVisible();
    await expect(
      page.locator(".homepage-editor__layer-name").filter({ hasText: "纯文字" }),
    ).toBeVisible();
    await expect(
      page.locator(
        ".homepage-editor__layer-mobile-hint, .homepage-editor__layer-issue-hint, .homepage-editor__layer-validation",
      ),
    ).toHaveCount(0);
  });

  test("套用推荐结构后切换双端并保存仍保持整页替换结果", async ({ page }) => {
    let warningPhase = "load";
    const wholeTreeWarnings: string[] = [];
    page.on("console", (message) => {
      if (
        message.type() === "warning" &&
        message.text().includes("`setData`") &&
        message.text().includes("expensive")
      ) {
        wholeTreeWarnings.push(warningPhase);
      }
    });
    await installAdminSession(page);
    const publishedDocument = publishedTextDocument("about", "线上关于页", 1);
    let draftDocument = {
      ...publishedTextDocument("about", "旧版关于草稿", 2),
      id: 8802,
      status: "DRAFT",
      publishedAt: null,
      updatedAt: "2026-08-21T00:00:02.000Z",
    };
    let savedPuckData: any = null;

    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const url = request.url();
      if (url.includes("/auth/profile")) return route.fallback();
      if (url.includes("/page-modules/document/validate")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: apiResponse({ valid: false, errors: ["等待最终素材"], issues: [] }),
        });
      }
      if (url.includes("/page-modules/document/published")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: apiResponse(publishedDocument),
        });
      }
      if (url.includes("/page-modules/document/admin")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: apiResponse(draftDocument),
        });
      }
      if (
        url.endsWith("/api/page-modules/document") &&
        request.method() === "PUT"
      ) {
        const payload = request.postDataJSON();
        savedPuckData = payload.puckData;
        draftDocument = {
          ...draftDocument,
          puckData: savedPuckData,
          updatedAt: "2026-08-21T00:00:03.000Z",
        };
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: apiResponse(draftDocument),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: apiResponse([]),
      });
    });

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/admin/editor/about");
    const canvas = page.frameLocator("iframe");
    const canvasModules = canvas.locator("[data-content-template-module]");
    await expect(
      canvas.getByRole("heading", { name: "旧版关于草稿", exact: true }),
    ).toBeVisible();
    wholeTreeWarnings.length = 0;
    warningPhase = "replace";

    await page.getByRole("button", { name: "更多编辑操作" }).click();
    await page.getByRole("menuitem", { name: /套用推荐结构/ }).click();
    await page.getByRole("button", { name: "套用并替换画布" }).click();
    await expect(canvasModules).toHaveCount(6);
    await expect(
      canvas.getByRole("heading", { name: "旧版关于草稿", exact: true }),
    ).toHaveCount(0);

    warningPhase = "undo";
    await expect(page.getByRole("button", { name: "撤销" })).toBeEnabled();
    await page.getByRole("button", { name: "模板设计" }).focus();
    await page.keyboard.press("Control+z");
    await expect(
      canvas.getByRole("heading", { name: "旧版关于草稿", exact: true }),
    ).toBeVisible();
    warningPhase = "redo";
    await expect(page.getByRole("button", { name: "重做" })).toBeEnabled();
    await page.getByRole("button", { name: "模板设计" }).focus();
    await page.keyboard.press("Control+Shift+z");
    await expect(canvasModules).toHaveCount(6);
    await expect(
      canvas.getByRole("heading", { name: "旧版关于草稿", exact: true }),
    ).toHaveCount(0);

    // 等待发布资格异步回写触发父层重渲染；整页替换不能因此回退到旧 data prop。
    await page.waitForTimeout(1_200);
    warningPhase = "viewport";
    await page.getByRole("button", { name: /移动端布局/ }).click();
    await expect(canvasModules).toHaveCount(6);
    await expect(
      canvas.getByRole("heading", { name: "旧版关于草稿", exact: true }),
    ).toHaveCount(0);

    warningPhase = "save";
    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    await expect(page.getByText("页面草稿已保存", { exact: true })).toBeVisible();
    expect(
      wholeTreeWarnings,
      "整页替换只允许一次必要 setData，设备切换、撤销重做与保存不得重复整树更新",
    ).toEqual(["replace"]);
    await expect
      .poll(() => savedPuckData?.content?.map((block: any) => block.type))
      .toEqual([
        "首屏主视觉",
        "单图海报",
        "双图海报",
        "文字横幅",
        "全屏出血图",
        "预约入口",
      ]);

    await page.reload();
    await expect(canvasModules).toHaveCount(6);
    await expect(
      canvas.getByRole("heading", { name: "旧版关于草稿", exact: true }),
    ).toHaveCount(0);
  });

  test("选中首页画布模板后操作组贴在对应模板右下侧并可移动删除", async ({ page }, testInfo) => {
    const puckWarnings: Array<"setData" | "set"> = [];
    const antdContextWarnings: string[] = [];
    const maximumDepthErrors: string[] = [];
    page.on("console", (message) => {
      if (message.text().includes("Static function can not consume context")) {
        antdContextWarnings.push(message.text());
      }
      if (message.type() === "error" && message.text().includes("Maximum update depth exceeded")) {
        maximumDepthErrors.push(message.text());
      }
      if (message.type() !== "warning" || !message.text().includes("expensive")) return;
      if (message.text().includes("`setData`")) puckWarnings.push("setData");
      else if (message.text().includes("`set`")) puckWarnings.push("set");
    });
    const drainWarnings = () => puckWarnings.splice(0, puckWarnings.length);
    await installAdminSession(page);
    await mockEmptyEditorApis(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/admin/editor/home");

    const canvas = page.frameLocator("iframe");
    const canvasModules = canvas.locator("[data-puck-component]");
    const layerItems = page.locator(".homepage-editor__layer-item");
    const layerNames = page.locator(".homepage-editor__layer-name");
    const dock = page.locator(".homepage-editor__canvas-selection-dock");

    await expect.poll(() => layerItems.count()).toBeGreaterThan(2);
    const initialModuleCount = await layerItems.count();
    await expect(canvasModules).toHaveCount(initialModuleCount);
    await expect(page.locator(".homepage-editor__layer-selection-actions")).toHaveCount(0);
    await expect(
      page.locator(
        ".homepage-editor__layer-mobile-hint, .homepage-editor__layer-issue-hint, .homepage-editor__layer-validation",
      ),
    ).toHaveCount(0);
    expect(
      await layerItems.evaluateAll((items) =>
        items.every((item) => {
          const name = item.querySelector<HTMLElement>(
            ".homepage-editor__layer-name",
          );
          const grip = item.querySelector<HTMLElement>(
            ".homepage-editor__layer-grip",
          );
          if (!name || !grip || !name.textContent?.trim()) return false;
          const nameBox = name.getBoundingClientRect();
          const gripBox = grip.getBoundingClientRect();
          return nameBox.width >= 60 && nameBox.right <= gripBox.left + 1;
        }),
      ),
    ).toBe(true);
    await layerItems.nth(1).locator(".homepage-editor__layer-select").click();
    await expect(layerItems.nth(1)).toHaveClass(/is-active/);
    await expect(dock).toBeVisible();
    const loadWarnings = drainWarnings();
    const namesBeforeLayerReorder = await layerNames.allTextContents();
    await layerItems.nth(1).dragTo(layerItems.nth(2));
    await expect.poll(() => layerNames.allTextContents()).toEqual([
      namesBeforeLayerReorder[0],
      namesBeforeLayerReorder[2],
      namesBeforeLayerReorder[1],
      ...namesBeforeLayerReorder.slice(3),
    ]);
    const layerReorderWarnings = drainWarnings();
    await layerItems.nth(1).locator(".homepage-editor__layer-select").click();
    await expect(page.getByRole("button", { name: "上移当前模块" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "下移当前模块" })).toBeEnabled();

    const assertDockAtBottomRight = async (moduleIndex: number) => {
      await expect(dock).toBeVisible();
      await expect
        .poll(async () => {
          const moduleBox = await canvasModules.nth(moduleIndex).boundingBox();
          const dockBox = await dock.boundingBox();
          if (!moduleBox || !dockBox) return Number.POSITIVE_INFINITY;
          return Math.max(
            Math.abs(dockBox.x - (moduleBox.x + moduleBox.width)),
            Math.abs(
              dockBox.y + dockBox.height - (moduleBox.y + moduleBox.height),
            ),
          );
        })
        .toBeLessThanOrEqual(5);
      for (const buttonName of [
        "上移当前模块",
        "下移当前模块",
        "删除当前模块",
      ]) {
        await expect(dock.getByRole("button", { name: buttonName })).toBeInViewport({
          ratio: 0.98,
        });
      }
    };

    await assertDockAtBottomRight(1);
    const namesBeforeMove = await layerNames.allTextContents();

    await dock.getByRole("button", { name: "上移当前模块" }).click();
    await expect.poll(() => layerNames.allTextContents()).toEqual([
      namesBeforeMove[1],
      namesBeforeMove[0],
      ...namesBeforeMove.slice(2),
    ]);
    await expect(layerItems.nth(0)).toHaveClass(/is-active/);
    const moveWarnings = drainWarnings();

    await dock.getByRole("button", { name: "删除当前模块" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "删除模块" }).click();
    await expect(layerItems).toHaveCount(initialModuleCount - 1);
    await expect(canvasModules).toHaveCount(initialModuleCount - 1);
    const deleteWarnings = drainWarnings();
    const warningEvidence = {
      load: loadWarnings,
      layerReorder: layerReorderWarnings,
      move: moveWarnings,
      delete: deleteWarnings,
    };
    console.info(`[puck-performance] canvas-dock ${JSON.stringify(warningEvidence)}`);
    await testInfo.attach("canvas-dock-warnings.json", {
      body: JSON.stringify(warningEvidence, null, 2),
      contentType: "application/json",
    });
    expect(antdContextWarnings).toEqual([]);
    expect(maximumDepthErrors, "模板库真实 Renderer 不得在首帧测量时形成 React 更新循环").toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBe(0);
  });

  test("选中模块操作组在桌面切换手机后仍贴边且位于视口内", async ({ page }) => {
    const maximumDepthErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" && message.text().includes("Maximum update depth exceeded")) {
        maximumDepthErrors.push(message.text());
      }
    });
    await installAdminSession(page);
    await mockEmptyEditorApis(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1920, height: 1200 });
    await page.goto("/admin/editor/home");

    const canvas = page.frameLocator("iframe");
    const canvasModules = canvas.locator("[data-puck-component]");
    const selectedModule = canvasModules.nth(1);
    const selectedLayer = page
      .locator(".homepage-editor__layer-item")
      .nth(1)
      .locator(".homepage-editor__layer-select");
    const dock = page.locator(".homepage-editor__canvas-selection-dock");
    await expect.poll(() => canvasModules.count()).toBeGreaterThan(2);
    await selectedLayer.click();
    await expect(page.locator(".homepage-editor__layer-item").nth(1)).toHaveClass(
      /is-active/,
    );
    await expect(dock).toBeVisible();

    const readDockGeometry = async (viewport: { width: number; height: number }) => {
        const moduleBox = await selectedModule.boundingBox();
        const dockBox = await dock.boundingBox();
        if (!moduleBox || !dockBox) return null;
        return {
          xError: Math.round(
            Math.abs(dockBox.x - (moduleBox.x + moduleBox.width)) * 100,
          ) / 100,
          yError: Math.round(
            Math.abs(
              dockBox.y + dockBox.height - (moduleBox.y + moduleBox.height),
            ) * 100,
          ) / 100,
          dockInViewport:
            dockBox.x >= 0 &&
            dockBox.y >= 0 &&
            dockBox.x + dockBox.width <= viewport.width &&
            dockBox.y + dockBox.height <= viewport.height,
          horizontalOverflow: await page.evaluate(
            () =>
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
          ),
        };
      };
    const assertDockGeometry = async (viewport: { width: number; height: number }) => {
      await expect
        .poll(
          async () =>
            (await readDockGeometry(viewport))?.xError ?? Number.POSITIVE_INFINITY,
        )
        .toBeLessThanOrEqual(3);
      await expect
        .poll(
          async () =>
            (await readDockGeometry(viewport))?.yError ?? Number.POSITIVE_INFINITY,
        )
        .toBeLessThanOrEqual(3);
      await expect
        .poll(
          async () =>
            (await readDockGeometry(viewport))?.dockInViewport ?? false,
        )
        .toBe(true);
      await expect
        .poll(
          async () =>
            (await readDockGeometry(viewport))?.horizontalOverflow ??
            Number.POSITIVE_INFINITY,
        )
        .toBe(0);
    };

    await page.getByRole("button", { name: "100%" }).click();
    await assertDockGeometry({ width: 1920, height: 1200 });
    await page.setViewportSize({ width: 390, height: 844 });
    await assertDockGeometry({ width: 390, height: 844 });
    expect(maximumDepthErrors, "设备切换不得触发 React 更新循环").toEqual([]);
  });

  test("新版首页新建画布保留六段中性结构，空草稿预览不显示种子", async ({ page }) => {
    await installAdminSession(page);
    await mockEmptyEditorApis(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/admin/editor/home");

    const canvas = page.frameLocator("iframe");
    const canvasModules = canvas.locator("[data-content-template-module]");
    await expect(canvasModules).toHaveCount(6);
    await expect
      .poll(() =>
        canvasModules.evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute("data-content-template-module")),
        ),
      )
      .toEqual([
        "首屏主视觉",
        "文字横幅",
        "全屏出血图",
        "双图海报",
        "单图海报",
        "文字横幅",
      ]);
    await expect(canvas.locator('[data-content-template-module="产品展示行"]')).toHaveCount(0);
    await expect(canvas.locator('[data-content-template-module="分类卡片"]')).toHaveCount(0);

    const heroPlaceholder = canvas.locator(
      '[data-content-template-module="首屏主视觉"] [data-asset-slot-id="desktopImage|mobileImage"]',
    );
    await expect(heroPlaceholder).toBeVisible();
    await expect(heroPlaceholder).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(heroPlaceholder).toHaveAttribute("data-asset-publishable", "false");
    const placeholderGeometry = await heroPlaceholder.evaluate((node) => {
      const illustration = node.querySelector<SVGElement>('[data-asset-placeholder-illustration="slot-fill"]');
      const slotBox = node.getBoundingClientRect();
      const illustrationBox = illustration?.getBoundingClientRect();
      return {
        widthRatio: illustrationBox ? illustrationBox.width / slotBox.width : 0,
        heightRatio: illustrationBox ? illustrationBox.height / slotBox.height : 0,
      };
    });
    expect(placeholderGeometry.widthRatio, "占位插画应跟随图片槽宽度扩展").toBeGreaterThan(0.9);
    expect(placeholderGeometry.heightRatio, "占位插画应占据图片槽的主要高度").toBeGreaterThan(0.55);
    await expect(
      canvas.getByRole("banner"),
      "浅中性首屏占位上方应使用实色导航，避免浅色图标失去对比度",
    ).not.toHaveClass(/is-transparent/);

    await page.goto("/preview/home");
    const emptyPreview = page.locator('[data-page-document-state="preview-empty"]');
    await expect(emptyPreview).toBeVisible();
    await expect(emptyPreview.getByRole("heading", { name: "尚无已保存草稿" })).toBeVisible();
    await expect(page.locator("[data-content-template-module]")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "海川珠宝", exact: true })).toHaveCount(0);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex, nofollow",
    );
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      )
      .toBe(true);
  });

  test("草稿预览读取失败时不伪装成推荐结构，并可重试恢复真实草稿", async ({ page }) => {
    await installAdminSession(page);
    await mockPublicShell(page);
    await page.setViewportSize({ width: 1920, height: 1200 });
    let failDraftRead = true;
    let draftReads = 0;
    const previewDraft = {
      ...publishedTextDocument("home", "重试后恢复的真实草稿", 7),
      status: "DRAFT",
      publishedAt: null,
    };
    previewDraft.puckData.content[0].props.buttonText = "不应保留的次要行动";
    previewDraft.puckData.content[0].props.linkUrl = "/about";
    previewDraft.puckData.content[0].props.targetType = "page";

    await page.route("**/api/page-modules/document/admin**", async (route) => {
      draftReads += 1;
      if (failDraftRead) {
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            code: 503,
            message: "PrismaClientKnownRequestError P2022 at page_modules.preview",
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: apiResponse(previewDraft),
      });
    });

    await page.goto("/preview/home");
    const previewError = page.getByRole("alert", { name: "草稿预览暂时无法载入" });
    await expect(previewError).toBeVisible();
    await expect(page.locator("[data-content-template-module]")).toHaveCount(0);
    await expect(
      page.getByText("PrismaClientKnownRequestError P2022 at page_modules.preview", {
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByText("服务器繁忙，请稍后再试", { exact: true }),
    ).toHaveCount(0);

    failDraftRead = false;
    await previewError.getByRole("button", { name: "重新载入草稿预览" }).click();
    await expect(page.getByRole("heading", { name: "重试后恢复的真实草稿" })).toBeVisible();
    const homeDocument = page.locator(".hc-public-document");
    await expect(homeDocument).toHaveAttribute("data-home-surface", "true");
    await expect(homeDocument.locator(".hc-home-text-banner")).toHaveCount(1);
    await expect(homeDocument.locator('[data-content-role="action"]')).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      )
      .toBe(true);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(homeDocument).toHaveAttribute("data-home-surface", "true");
    await expect(homeDocument.locator(".hc-home-text-banner")).toHaveCount(1);
    await expect(homeDocument.locator('[data-content-role="action"]')).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      )
      .toBe(true);
    await expect(previewError).toHaveCount(0);
    expect(draftReads).toBeGreaterThanOrEqual(2);
  });

  test("草稿预览与编辑器共用旧类型迁移并保留统一模板目录内容", async ({ page }) => {
    await installAdminSession(page);
    await mockPublicShell(page);
    await page.route("**/api/page-modules/document/admin**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: apiResponse({
          id: 8821,
          pageKey: "about",
          status: "DRAFT",
          puckData: {
            content: [
              {
                type: "图文混排",
                props: {
                  id: "legacy-about-story",
                  template: "textLeftImageRight",
                  title: "旧草稿迁移后可见",
                  body: "这段内容来自已保存草稿。",
                  image: "",
                  buttonText: "",
                  linkUrl: "",
                },
              },
              {
                type: "产品展示行",
                props: {
                  id: "legacy-about-disallowed-products",
                  title: "关于页不允许的商品模块",
                  products: [],
                },
              },
            ],
            root: { props: {} },
          },
        }),
      }),
    );

    await page.goto("/preview/about");
    const main = page.locator("main");
    await expect(main.locator('[data-content-template-module="单图海报"]')).toHaveCount(1);
    await expect(main.getByRole("heading", { name: "旧草稿迁移后可见" })).toBeVisible();
    await expect(main.locator('[data-content-template-module="图文混排"]')).toHaveCount(0);
    await expect(main.locator('[data-content-template-module="产品展示行"]')).toHaveCount(1);
  });

  test("珠宝作品新建画布保留六段中性结构且不出现找款工具", async ({ page }) => {
    await installAdminSession(page);
    await mockEmptyEditorApis(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/admin/editor/products");

    const canvas = page.frameLocator("iframe");
    const canvasModules = canvas.locator("[data-content-template-module]");
    await expect(canvasModules).toHaveCount(6);
    await expect
      .poll(() =>
        canvasModules.evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute("data-content-template-module")),
        ),
      )
      .toEqual([
        "首屏主视觉",
        "全屏出血图",
        "单品焦点推荐",
        "双图海报",
        "作品画廊",
        "文字横幅",
      ]);
    await expect(canvas.locator('[data-content-template-module="业务功能区"]')).toHaveCount(0);
    await expect(canvas.locator('[data-content-template-module="产品展示行"]')).toHaveCount(0);
    await expect(canvas.locator('[data-content-template-module="分类卡片"]')).toHaveCount(0);
    await expect(
      canvas.locator(
        '[data-content-template-module="单品焦点推荐"] [data-asset-slot-id="product"]',
      ),
    ).toHaveAttribute("data-asset-publishable", "false");
    await expect(
      canvas.locator(
        '[data-content-template-module="作品画廊"] [data-asset-slot-id="works"]',
      ),
    ).toContainText("等待最终素材 · 内部占位");

    await page.goto("/preview/products");
    const main = page.locator('main[data-page-document-state="preview-empty"]');
    await expect(main).toHaveAttribute("data-page-document-state", "preview-empty");
    await expect(main.getByRole("heading", { name: "尚无已保存草稿" })).toBeVisible();
    await expect(main.locator("[data-content-template-module]")).toHaveCount(0);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex, nofollow",
    );
    await expect(main.getByRole("textbox")).toHaveCount(0);
    await expect(main.getByRole("combobox")).toHaveCount(0);
    await expect(main.getByText(/共\s*\d+\s*件作品/)).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      )
      .toBe(true);
  });

  test("定制与关于页面没有已保存草稿时不回退品牌叙事种子", async ({ page }) => {
    await installAdminSession(page);
    await mockEmptyEditorApis(page);
    await page.setViewportSize({ width: 1440, height: 900 });

    for (const pageKey of ["custom", "about"]) {
      await page.goto(`/preview/${pageKey}`);
      const main = page.locator('main[data-page-document-state="preview-empty"]');
      await expect(main).toHaveAttribute("data-page-document-state", "preview-empty");
      await expect(main.getByRole("heading", { name: "尚无已保存草稿" })).toBeVisible();
      await expect(main.locator("[data-content-template-module]")).toHaveCount(0);
      await expect(main.locator('[src*="custom-process-v4-editorial"]')).toHaveCount(0);
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))
        .toBe(true);
    }
  });

  test("珠宝作品取得有效发布文档后替换旧筛选商品墙", async ({ page }) => {
    await mockPublicShell(page);
    await page.route("**/api/page-modules/document/published?*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: apiResponse(
          publishedTextDocument("products", "已发布作品展陈", 4),
        ),
      }),
    );

    await page.goto("/products");
    const main = page.locator("main");
    await expect(
      main.getByRole("heading", { name: "已发布作品展陈", level: 2 }),
    ).toBeVisible();
    await expect(
      main.getByRole("heading", { name: "珠宝作品", level: 1 }),
    ).toHaveCount(1);
    await expect(main.locator("h1")).toHaveCount(1);
    await expect(main.getByRole("textbox")).toHaveCount(0);
    await expect(main.getByRole("combobox")).toHaveCount(0);
    await expect(main.getByText(/共\s*\d+\s*件作品/)).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "预约私人珠宝顾问", exact: true }),
    ).toBeVisible();
    await expect.poll(() => page.evaluate(() => {
      const shell = document.querySelector<HTMLElement>(".site-shell");
      const mainElement = document.querySelector<HTMLElement>(".site-main");
      const footer = document.querySelector<HTMLElement>(".site-footer");
      return {
        shellBackground: shell ? getComputedStyle(shell).backgroundColor : "",
        mainFlexGrow: mainElement ? getComputedStyle(mainElement).flexGrow : "",
        footerReachesViewport: Boolean(
          footer && footer.getBoundingClientRect().bottom >= window.innerHeight - 1,
        ),
      };
    })).toEqual({
      shellBackground: "rgb(255, 255, 255)",
      mainFlexGrow: "1",
      footerReachesViewport: true,
    });
  });

  test("珠宝作品 PageDocument 读取中在桌面与手机显示明确加载态", async ({ page }) => {
    await mockPublicShell(page);
    let releaseResponse = () => {};
    let responseBarrier: Promise<void> = Promise.resolve();
    await page.route("**/api/page-modules/document/published?*", async (route) => {
      await responseBarrier;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: apiResponse(null),
      });
    });

    for (const viewport of [
      { name: "desktop", width: 1440, height: 900 },
      { name: "mobile", width: 390, height: 844 },
    ]) {
      responseBarrier = new Promise<void>((resolve) => {
        releaseResponse = resolve;
      });
      await page.setViewportSize(viewport);
      await page.goto(`/products?loadingViewport=${viewport.name}`);
      await expect(page.locator('main [data-page-document-state="loading"]')).toContainText(
        "正在载入珠宝作品",
      );
      releaseResponse();
      await expect(page.getByRole("heading", { name: "珠宝作品正在策展", level: 1 })).toBeVisible();
    }
  });

  test("珠宝作品未发布、空文档与请求失败时统一使用安全策展短页", async ({ page }) => {
    await mockPublicShell(page);
    let responseState: "unpublished" | "invalid" | "filtered" | "error" = "unpublished";
    const productRequests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith("/api/products/public")) {
        productRequests.push(request.url());
      }
    });
    await page.route("**/api/page-modules/document/published?*", (route) => {
      if (responseState === "error") {
        return route.fulfill({ status: 503, body: "" });
      }
      const responseData = responseState === "unpublished"
        ? null
        : responseState === "filtered"
          ? {
              ...publishedTextDocument("products", "不应展示的旧商品墙", 10),
              puckData: {
                content: [{
                  type: "产品展示行",
                  props: { id: "legacy-products-grid", title: "不应展示的旧商品墙", productIds: [] },
                }],
              },
            }
          : {
              pageKey: "products",
              puckData: { content: [] },
              status: "PUBLISHED",
            };
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: apiResponse(responseData),
      });
    });

    for (const viewport of [
      { name: "desktop", width: 1440, height: 900 },
      { name: "mobile", width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      for (const state of ["unpublished", "invalid", "filtered", "error"] as const) {
        responseState = state;
        await page.goto(`/products?viewport=${viewport.name}&documentState=${state}`);
        const main = page.locator("main");
        const documentState = state === "filtered" ? "invalid" : state;
        await expect(main.locator(`[data-page-document-state="${documentState}"]`)).toBeVisible();
        await expect(page).toHaveTitle("珠宝作品 | 海川珠宝");
        await expect(page.locator('meta[name="description"]')).toHaveAttribute(
          "content",
          "我们正在完成作品资料与材质工艺内容的审核。您可以先浏览当前已公开款式，或预约珠宝顾问获得协助。",
        );
        await expect(main.getByRole("heading", { name: "珠宝作品正在策展", level: 1 })).toHaveCount(1);
        await expect(main.getByRole("link", { name: "进入选款中心" })).toHaveAttribute("href", "/catalog");
        await expect(main.getByRole("link", { name: "预约珠宝顾问" })).toHaveAttribute("href", "/contact");
        await expect(
          page.getByRole("link", { name: "预约私人珠宝顾问", exact: true }),
          `${viewport.name}/${state} 策展短页不得重复页脚预约入口`,
        ).toHaveCount(0);
        await expect(main.getByText("内容暂不可用，请稍后再试。")).toHaveCount(0);
        await expect(main.getByRole("textbox")).toHaveCount(0);
        await expect(main.getByRole("combobox")).toHaveCount(0);
        await expect(main.getByText("不应展示的旧商品墙", { exact: true })).toHaveCount(0);
        await expect(main.getByRole("button", { name: "重新载入内容" })).toHaveCount(
          state === "error" ? 1 : 0,
        );
        await expect.poll(() => page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
        )).toBe(true);
      }
    }
    expect(productRequests).toEqual([]);
  });

  test("珠宝作品策展短页支持键盘访问两个下一步，失败后可重新载入", async ({ page }) => {
    await mockPublicShell(page);
    let failPageDocument = true;
    let pageDocumentRequests = 0;
    await page.route("**/api/page-modules/document/published?*", (route) => {
      pageDocumentRequests += 1;
      return failPageDocument
        ? route.fulfill({ status: 503, body: "" })
        : route.fulfill({
            status: 200,
            contentType: "application/json",
            body: apiResponse(null),
          });
    });

    await page.goto("/products?recovery=error");
    const main = page.locator("main");
    const primaryAction = main.getByRole("link", { name: "进入选款中心" });
    const secondaryAction = main.getByRole("link", { name: "预约珠宝顾问" });
    const retry = main.getByRole("button", { name: "重新载入内容" });

    await expect(retry).toBeVisible();
    failPageDocument = false;
    await retry.click();
    await expect(main.locator('[data-page-document-state="unpublished"]')).toBeVisible();
    await expect(retry).toHaveCount(0);
    expect(pageDocumentRequests).toBeGreaterThanOrEqual(2);

    await main.focus();
    await page.keyboard.press("Tab");
    await expect(primaryAction).toBeFocused();
    await expect.poll(() => primaryAction.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
    await expect.poll(() => primaryAction.evaluate((element) => getComputedStyle(element).outlineWidth)).toBe("2px");
    await page.keyboard.press("Tab");
    await expect(secondaryAction).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(primaryAction).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/catalog$/);

    await page.goto("/products?recovery=routes");
    const recoveredSecondaryAction = page.getByRole("main").getByRole("link", { name: "预约珠宝顾问" });
    await recoveredSecondaryAction.focus();
    await expect(recoveredSecondaryAction).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/contact$/);
  });

  test("关于页公开运行时按统一目录保留商品展示行", async ({ page }) => {
    await mockPublicShell(page);
    const aboutDocument = publishedTextDocument("about", "关于海川的编辑叙事", 8);
    aboutDocument.puckData.content.unshift({
      type: "产品展示行",
      props: {
        id: "legacy-about-product-row",
        title: "不应公开展示的商品墙",
        productIds: [],
      },
    });
    await page.route("**/api/page-modules/document/published?*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: apiResponse(aboutDocument),
      }),
    );

    await page.goto("/about");
    const main = page.locator("main");
    await expect(main.getByRole("heading", { name: "关于海川的编辑叙事", level: 2 })).toBeVisible();
    await expect(main.locator('[data-content-template-module="产品展示行"]')).toHaveCount(1);
  });

  test("公开运行时只消费根 content，不把旧 zones 隐藏内容突然公开", async ({ page }) => {
    await mockPublicShell(page);
    const aboutDocument = publishedTextDocument("about", "根内容仍然公开", 8);
    (aboutDocument.puckData as any).zones = {
      legacy: [{
        type: "文字横幅",
        props: {
          id: "legacy-unreachable-zone-banner",
          title: "旧 zones 中从未公开的内容",
          body: "位置没有确定顺序，因此不能自动迁入根内容。",
        },
      }],
    };
    await page.route("**/api/page-modules/document/published?*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: apiResponse(aboutDocument),
      }),
    );

    await page.goto("/about");
    const main = page.locator("main");
    await expect(main.getByRole("heading", { name: "根内容仍然公开", level: 2 })).toBeVisible();
    await expect(main.getByText("旧 zones 中从未公开的内容", { exact: true })).toHaveCount(0);
  });

  test("选款中心读取旧发布快照时安全兼容商品展示模块并保留固定业务区", async ({ page }) => {
    await mockPublicShell(page);
    const legacyCatalogDocument = publishedTextDocument("catalog", "选款中心说明", 9);
    legacyCatalogDocument.puckData.content = [
      {
        type: "产品展示行",
        props: {
          id: "legacy-catalog-products",
          title: "旧精选商品",
          productIds: [],
        },
      },
      {
        type: "业务功能区",
        props: {
          id: "catalog-business-region",
          pageKey: "catalog",
          title: "选款工具与商品结果",
          items: "关键词/货号搜索|条件筛选|排序与结果|快速查看|选款清单|提交询价",
          locked: true,
        },
      },
    ];
    await page.route("**/api/page-modules/document/published?*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: apiResponse(legacyCatalogDocument),
      }),
    );

    await page.goto("/catalog");
    const catalogTitle = page.getByRole("heading", { name: "选款中心", level: 1 });
    await expect(catalogTitle).toBeVisible();
    await expect(catalogTitle).toHaveClass(/sr-only/);
    await expect(page.locator('[data-content-template-module="产品展示行"]')).toHaveCount(1);
    await expect(page.getByText("旧精选商品", { exact: true })).toHaveCount(0);
    await expect(page.locator(".catalog-page")).toBeVisible();
  });

  test("选款中心装修区未完善时不否决已发布版本并保留固定选款业务", async ({ page }) => {
    await mockPublicShell(page);
    const invalidCatalogDocument = publishedTextDocument("catalog", "选款中心说明", 11);
    invalidCatalogDocument.puckData.content = [{
      type: "预约入口",
      props: {
        id: "catalog-invalid-appointment",
        title: "",
        buttonText: "",
        linkUrl: "/contact",
        targetType: "page",
      },
    }, {
      type: "业务功能区",
      props: {
        id: "catalog-business-region",
        pageKey: "catalog",
        title: "选款工具与商品结果",
        items: "关键词/货号搜索|条件筛选|排序与结果|快速查看|选款清单|提交询价",
        locked: true,
      },
    }];
    await page.route("**/api/page-modules/document/published?*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: apiResponse(invalidCatalogDocument),
      }),
    );

    await page.goto("/catalog?invalidDecoration=1");
    const main = page.getByRole("main");
    await expect(main.locator('[data-page-document-state="invalid"]')).toHaveCount(0);
    await expect(main.locator(".catalog-page")).toBeVisible();
    await expect(main.getByRole("heading", { name: "选款中心", level: 1 })).toBeVisible();
    await expect(main.locator("[data-content-template-module]")).toHaveCount(1);
    await expect(page.locator('[data-page-header-mode="solid"]')).toBeVisible();
  });

  test("六个装修页面共用完整统一模板目录并保留各自固定业务区", async ({ page }) => {
    await installAdminSession(page);
    await mockEmptyEditorApis(page);
    await page.setViewportSize({ width: 1440, height: 1000 });

    const templateName = (name: string) =>
      page.locator(".homepage-editor__template-name").filter({ hasText: new RegExp(`^${name}$`) });

    await page.goto("/admin/editor/custom");
    await expect(page.locator(".homepage-editor__template-card-activate")).toHaveCount(24);
    await expect(templateName("内容流程")).toBeVisible();
    await expect(templateName("商品列表")).toBeVisible();
    await expect(templateName("限时活动")).toBeVisible();

    await page.goto("/admin/editor/products");
    await expect(page.locator(".homepage-editor__template-card-activate")).toHaveCount(24);
    await expect(templateName("商品列表")).toBeVisible();
    await expect(page.getByText("商品列表与筛选", { exact: true })).toHaveCount(0);

    await page.goto("/admin/editor/catalog");
    await expect(page.locator(".homepage-editor__template-card-activate")).toHaveCount(24);
    await expect(templateName("纯文字")).toBeVisible();
    await expect(templateName("首屏")).toBeVisible();
    await expect(templateName("品类入口")).toBeVisible();
    await expect(templateName("商品列表")).toBeVisible();
    await expect
      .poll(() => page.locator(".homepage-editor__layer-name").allTextContents())
      .toEqual(["纯文字", "业务功能区", "预约入口"]);
    const catalogCanvas = page.frameLocator("iframe");
    await expect(catalogCanvas.locator(".catalog-page.is-editor-preview")).toBeVisible();
    await expect(
      catalogCanvas.getByRole("heading", { name: "选款中心", level: 1 }),
    ).toBeVisible();
    await expect(
      catalogCanvas.getByRole("search").getByRole("combobox", { name: "关键词或货号" }),
    ).toBeVisible();
    await expect(catalogCanvas.getByText("PRIVATE APPOINTMENT", { exact: true })).toBeVisible();
    await expect(
      catalogCanvas.getByRole("link", { name: "预约私人珠宝顾问", exact: true }),
    ).toBeVisible();
    await expect(catalogCanvas.locator("[data-business-preview-step]")).toHaveCount(0);
    await expect(catalogCanvas.locator("[data-business-preview-state]")).toHaveCount(0);
    await expect(catalogCanvas.getByText("黄金珠宝作品与选款服务", { exact: true })).toHaveCount(0);
    await expect
      .poll(() =>
        catalogCanvas.locator(".homepage-editor__storefront-frame").evaluate((element) => {
          const footer = element.querySelector(".site-footer");
          const frameRect = element.getBoundingClientRect();
          const footerRect = footer?.getBoundingClientRect();
          return {
            frameHeight: Math.round(frameRect.height),
            footerGap: footerRect ? Math.round(frameRect.bottom - footerRect.bottom) : -1,
          };
        }),
      )
      .toMatchObject({ footerGap: 0 });
    expect(
      await catalogCanvas
        .locator(".homepage-editor__storefront-frame")
        .evaluate((element) => Math.round(element.getBoundingClientRect().height)),
    ).toBeLessThan(10_000);

    await page.goto("/admin/editor/contact");
    const contactCanvas = page.frameLocator("iframe");
    const contactPreview = contactCanvas.locator(".contact-page.is-editor-preview");
    await expect(contactPreview).toBeVisible();
    await expect(contactCanvas.locator(".contact-form")).toBeVisible();
    await expect(contactPreview).toHaveCSS("pointer-events", "none");
    await expect(contactCanvas.locator("[data-business-preview-step]")).toHaveCount(0);
  });

  test("编辑不同内容时顶栏主操作固定在右侧锚点", async ({ page }) => {
    await installAdminSession(page);
    await mockEmptyEditorApis(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/admin/editor/custom");

    const toolbar = page.locator(".homepage-editor__toolbar");
    const actions = page.locator(".homepage-editor__toolbar-actions");
    await expect(toolbar).toBeVisible();
    await expect(actions).toBeVisible();

    const readAnchor = async () => {
      const toolbarBox = await toolbar.boundingBox();
      const actionsBox = await actions.boundingBox();
      if (!toolbarBox || !actionsBox) throw new Error("无法测量编辑器顶栏主操作区");
      return {
        top: actionsBox.y,
        rightOffset: toolbarBox.x + toolbarBox.width - actionsBox.x - actionsBox.width,
      };
    };

    const initialAnchor = await readAnchor();
    const layerItems = page.locator(".homepage-editor__layer-item");
    await expect(layerItems).toHaveCount(8);

    for (const index of [0, 3, 7]) {
      await layerItems.nth(index).click();
      await expect.poll(readAnchor).toEqual(initialAnchor);
    }

    const editableText = page
      .getByRole("region", { name: "属性面板" })
      .getByRole("textbox", { name: "标题", exact: true });
    await expect(editableText).toBeVisible();
    await editableText.fill(`${await editableText.inputValue()} · 调整`);
    await expect(
      page.locator('.homepage-editor__draft-status[data-mode="dirty"]'),
    ).toContainText("有未保存修改");
    await expect(page.locator(".homepage-editor__properties-actions")).toBeVisible();
    await expect.poll(readAnchor).toEqual(initialAnchor);

    for (const viewport of [
      { width: 1440, height: 1000, rightOffset: 10 },
      { width: 1024, height: 900, rightOffset: 10 },
      { width: 768, height: 900, rightOffset: 10 },
      { width: 390, height: 844, rightOffset: 6 },
    ]) {
      await page.setViewportSize(viewport);
      await expect
        .poll(() =>
          page.evaluate(() => {
            const toolbar = document
              .querySelector(".homepage-editor__toolbar")!
              .getBoundingClientRect();
            const actions = document
              .querySelector(".homepage-editor__toolbar-actions")!
              .getBoundingClientRect();
            const switcher = document
              .querySelector(".homepage-editor__viewport-switcher")!
              .getBoundingClientRect();
            const globalActions = document
              .querySelector(".admin-header--editor .admin-header__right")!
              .getBoundingClientRect();
            const overlaps = (left: DOMRect, right: DOMRect) =>
              !(
                left.x >= right.right ||
                left.right <= right.x ||
                left.y >= right.bottom ||
                left.bottom <= right.y
              );
            return {
              rightOffset: toolbar.right - actions.right,
              overlapsSwitcher: overlaps(actions, switcher),
              overlapsGlobalActions: overlaps(actions, globalActions),
              horizontalOverflow:
                document.documentElement.scrollWidth >
                document.documentElement.clientWidth,
            };
          }),
        )
        .toEqual({
          rightOffset: viewport.rightOffset,
          overlapsSwitcher: false,
          overlapsGlobalActions: false,
          horizontalOverflow: false,
        });
    }
  });

  test("画布与设备切换器在桌面和平板共用工作区中心线", async ({ page }) => {
    await installAdminSession(page);
    await mockEmptyEditorApis(page);
    await page.setViewportSize({ width: 1912, height: 948 });
    await page.goto("/admin/editor/custom");

    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();

    const sideWidths = await page.evaluate(() => {
      const width = (selector: string) => {
        const box = document.querySelector(selector)?.getBoundingClientRect();
        if (!box) throw new Error(`无法测量 ${selector}`);
        return box.width;
      };
      return {
        left:
          width(".homepage-editor__library") +
          width(".homepage-editor__structure-workspace"),
        right: width(".homepage-editor__right-workspace"),
      };
    });
    expect(sideWidths.left).toBe(sideWidths.right);

    const readAlignment = () =>
      page.evaluate(() => {
        const rect = (selector: string) => {
          const box = document.querySelector(selector)?.getBoundingClientRect();
          if (!box) throw new Error(`无法测量 ${selector}`);
          return box;
        };
        const stage = rect(".homepage-editor__stage");
        const canvasScroll = rect(".homepage-editor__canvas-scroll");
        const canvas = rect(".homepage-editor__canvas-document");
        const switcher = rect(".homepage-editor__viewport-switcher");
        const scroll = document.querySelector(
          ".homepage-editor__canvas-scroll",
        );
        if (!scroll) throw new Error("无法测量画布滚动区");
        const canvasCenter = canvasScroll.x + canvasScroll.width / 2;
        const switcherCenter = stage.x + stage.width / 2;
        const round = (value: number) => Math.round(value * 100) / 100;

        return {
          canvasOffset: round(canvas.x + canvas.width / 2 - canvasCenter),
          switcherOffset: round(switcher.x + switcher.width / 2 - switcherCenter),
          scrollbarGutter: getComputedStyle(scroll).scrollbarGutter,
          horizontalOverflow:
            document.documentElement.scrollWidth >
            document.documentElement.clientWidth,
        };
      });

    for (const viewport of [
      { width: 768, height: 900 },
      { width: 1024, height: 900 },
      { width: 1440, height: 1000 },
      { width: 1912, height: 948 },
    ]) {
      await page.setViewportSize(viewport);
      await expect.poll(readAlignment).toEqual({
        canvasOffset: 0,
        switcherOffset: 0,
        scrollbarGutter: "stable both-edges",
        horizontalOverflow: false,
      });
    }
  });

  test("一级导航沿用全后台宽度、高度和右上收纳键且不挤压四栏舞台", async ({ page }) => {
    await installAdminSession(page);
    await mockEmptyEditorApis(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/admin/editor/custom");

    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "展开一级导航" }),
    ).toBeVisible();
    await expect(page.locator(".admin-editor-navigation-scrim")).toHaveCount(0);

    const toggleAppearance = (name: string) =>
      page.getByRole("button", { name }).evaluate((button) => {
        const style = getComputedStyle(button);
        return {
          width: Math.round(button.getBoundingClientRect().width),
          height: Math.round(button.getBoundingClientRect().height),
          border: style.borderTop,
          borderRadius: style.borderRadius,
          background: style.backgroundColor,
          boxShadow: style.boxShadow,
          iconCount: button.querySelectorAll(".anticon").length,
          text: button.textContent?.trim() ?? "",
        };
      });
    const toggleY = (name: string) =>
      page
        .getByRole("button", { name })
        .evaluate((button) => Math.round(button.getBoundingClientRect().y));
    const standardToggle = await toggleAppearance("展开一级导航");
    expect(standardToggle).toMatchObject({
      width: 28,
      height: 32,
      borderRadius: "4px",
      iconCount: 1,
      text: "",
    });
    expect(standardToggle.border).not.toContain("transparent");
    expect(standardToggle.boxShadow).not.toBe("none");
    expect(await toggleY("展开一级导航")).toBe(66);
    for (const name of [
      "收起模板组件库",
      "收起图层面板",
      "收起属性面板",
    ]) {
      expect(await toggleAppearance(name)).toEqual(standardToggle);
      expect(await toggleY(name)).toBe(66);
    }
    const geometry = async () =>
      page.evaluate(() => {
        const rect = (selector: string) => {
          const box = document.querySelector(selector)?.getBoundingClientRect();
          if (!box) throw new Error(`无法测量 ${selector}`);
          return {
            x: Math.round(box.x),
            y: Math.round(box.y),
            width: Math.round(box.width),
            height: Math.round(box.height),
            right: Math.round(box.right),
          };
        };
        const horizontalRect = (selector: string) => {
          const box = document.querySelector(selector)?.getBoundingClientRect();
          if (!box) throw new Error(`无法测量 ${selector}`);
          return {
            x: Math.round(box.x),
            width: Math.round(box.width),
            right: Math.round(box.right),
          };
        };
        return {
          navigation: rect(".admin-sidebar"),
          stage: rect(".homepage-editor__stage"),
          controls: rect(".homepage-editor__canvas-controls"),
          canvas: horizontalRect(".homepage-editor__canvas-document"),
          library: rect(".homepage-editor__library"),
          structure: rect(".homepage-editor__structure-workspace"),
          inspector: rect(".homepage-editor__right-workspace"),
          horizontalOverflow:
            document.documentElement.scrollWidth >
            document.documentElement.clientWidth,
        };
      });

    // 等待画布 ResizeObserver 完成首次适配，再把稳定几何作为导航交互基线。
    await page.waitForTimeout(250);
    const initial = await geometry();
    expect(initial.navigation).toMatchObject({ x: 0, width: 0, right: 0 });
    expect(initial.library.x).toBe(0);
    expect(initial.library.width).toBe(236);
    expect(initial.structure.x).toBe(initial.library.right);
    expect(initial.structure.width).toBe(144);
    expect(initial.horizontalOverflow).toBe(false);
    const initialWorkspace = {
      stage: initial.stage,
      controls: initial.controls,
      library: initial.library,
      structure: initial.structure,
      inspector: initial.inspector,
      horizontalOverflow: false,
    };

    await page.getByRole("button", { name: "展开一级导航" }).click();
    await expect(page.locator(".admin-sidebar")).toHaveCSS("width", "160px");
    await expect(
      page.getByRole("button", { name: "收起一级导航" }),
    ).toBeVisible();
    // 展开后按钮会横向移动，指针离开时阴影仍有 150ms 退场过渡；等待稳定态再比较。
    await expect.poll(() => toggleAppearance("收起一级导航")).toEqual(standardToggle);
    expect(await toggleY("收起一级导航")).toBe(66);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const header = document
            .querySelector(".admin-header")!
            .getBoundingClientRect();
          const body = document
            .querySelector(".admin-body")!
            .getBoundingClientRect();
          const handle = document
            .querySelector(".admin-sidebar__collapse-handle")!
            .getBoundingClientRect();
          return {
            headerHeight: Math.round(header.height),
            handleX: Math.round(handle.x),
            handleWidth: Math.round(handle.width),
            handleHeight: Math.round(handle.height),
            handleTopOffset: Math.round(handle.y - body.y),
          };
        }),
      )
      .toEqual({
        headerHeight: 60,
        handleX: 128,
        handleWidth: 28,
        handleHeight: 32,
        handleTopOffset: 6,
      });
    await expect(page.getByRole("button", { name: "展开图层面板" })).toBeHidden();
    await expect
      .poll(geometry)
      .toMatchObject({
        navigation: { x: 0, width: 160, right: 160 },
        stage: initial.stage,
        controls: initial.controls,
        library: { x: 160, width: 236, right: 396 },
        structure: { x: 396, width: 0 },
        inspector: initial.inspector,
        horizontalOverflow: false,
      });
    await expect(page.locator(".admin-editor-navigation-scrim")).toHaveCount(0);

    await page.getByRole("button", { name: "收起一级导航" }).click();
    await expect(page.locator(".admin-sidebar")).toHaveCSS("width", "0px");
    await expect(page.getByRole("button", { name: "展开一级导航" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "收起图层面板" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "展开图层面板" }),
    ).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const handle = document
            .querySelector(".admin-sidebar__collapse-handle")!
            .getBoundingClientRect();
          return {
            x: Math.round(handle.x),
            y: Math.round(handle.y),
            width: Math.round(handle.width),
            height: Math.round(handle.height),
          };
        }),
      )
      .toEqual({ x: 8, y: 66, width: 28, height: 32 });
    await expect
      .poll(geometry)
      .toMatchObject({
        ...initialWorkspace,
      });

    await page.getByRole("button", { name: "收起模板组件库" }).click();
    await expect(page.getByRole("button", { name: "展开模板组件库" })).toBeVisible();
    await page.mouse.move(720, 500);
    expect(await toggleAppearance("展开模板组件库")).toEqual(standardToggle);
    expect(await toggleY("展开模板组件库")).toBe(66);
    await expect.poll(async () => {
      const current = await geometry();
      return {
        libraryNarrower: current.library.width < initial.library.width,
        structureMovedTowardEdge: current.structure.x < initial.structure.x,
        structureWidth: current.structure.width,
        stage: current.stage,
        controls: current.controls,
        inspector: current.inspector,
        horizontalOverflow: current.horizontalOverflow,
      };
    }).toEqual({
      libraryNarrower: true,
      structureMovedTowardEdge: true,
      structureWidth: initial.structure.width,
      stage: initial.stage,
      controls: initial.controls,
      inspector: initial.inspector,
      horizontalOverflow: false,
    });

    await page.getByRole("button", { name: "展开模板组件库" }).click();
    await expect(page.getByRole("button", { name: "收起模板组件库" })).toBeVisible();
    await expect(page.locator(".homepage-editor__library")).toHaveCSS("width", "236px");
    await expect.poll(geometry).toMatchObject(initialWorkspace);

    await page.getByRole("button", { name: "收起属性面板" }).click();
    await expect(page.getByRole("button", { name: "展开属性面板" })).toBeVisible();
    await page.mouse.move(720, 500);
    expect(await toggleAppearance("展开属性面板")).toEqual(standardToggle);
    expect(await toggleY("展开属性面板")).toBe(66);
    await expect(page.locator(".homepage-editor__right-workspace")).toHaveCSS(
      "width",
      "40px",
    );
    await expect.poll(geometry).toMatchObject({
      stage: initial.stage,
      library: initial.library,
      structure: initial.structure,
    });

    await page.getByRole("button", { name: "展开属性面板" }).click();
    await expect(page.getByRole("button", { name: "收起属性面板" })).toBeVisible();
    await expect.poll(() => page.locator(".homepage-editor__right-workspace").evaluate(
      (element) => Math.round(element.getBoundingClientRect().width),
    )).toBe(initial.inspector.width);
    await expect.poll(geometry).toMatchObject(initialWorkspace);

    await page.getByRole("button", { name: "展开一级导航" }).click();
    await expect(page.locator(".admin-sidebar")).toHaveCSS("width", "160px");
    await expect(page.getByRole("button", { name: "收起一级导航" })).toBeVisible();
    await expect(page.getByRole("button", { name: "展开图层面板" })).toBeHidden();

    await page.keyboard.press("Escape");
    await expect(page.locator(".admin-sidebar")).toHaveCSS("width", "0px");
    await expect(
      page.getByRole("button", { name: "展开一级导航" }),
    ).toBeFocused();
    await expect.poll(geometry).toMatchObject(initialWorkspace);

    await page.setViewportSize({ width: 1912, height: 948 });
    // 等待 ResizeObserver 完成宽屏适配，再比较导航交互前后的画布几何。
    await page.waitForTimeout(250);
    const wideScreenCollapsed = await geometry();
    await page.getByRole("button", { name: "展开一级导航" }).click();
    await expect(page.locator(".admin-sidebar")).toHaveCSS("width", "160px");
    await expect.poll(geometry).toMatchObject({
      stage: wideScreenCollapsed.stage,
      controls: wideScreenCollapsed.controls,
      inspector: wideScreenCollapsed.inspector,
      horizontalOverflow: false,
    });

    await page.goto("/admin/products");
    await expect(page.getByRole("button", { name: "收起一级导航" })).toBeVisible();
    expect(await toggleAppearance("收起一级导航")).toEqual(standardToggle);
    await page.getByRole("button", { name: "收起一级导航" }).click();
    await expect(page.locator(".admin-sidebar")).toHaveCSS("width", "0px");
    await expect(page.getByRole("button", { name: "展开一级导航" })).toBeVisible();
    expect(await toggleAppearance("展开一级导航")).toEqual(standardToggle);
  });

  test("页面实例属性面板收起后保留模块内容上下文和内容滚动位置", async ({ page }) => {
    await installAdminSession(page);
    await mockEmptyEditorApis(page);
    await page.setViewportSize({ width: 1440, height: 720 });
    await page.goto("/admin/editor/custom");

    const scroll = page.locator(".homepage-editor__inspector-scroll");
    const inspector = page.getByRole("region", { name: "属性面板" });
    await expect(page.getByRole("button", { name: "退出当前模块编辑" })).toHaveCount(0);
    await expect(inspector.getByRole("tab", { name: "内容编辑" })).toHaveCount(0);
    await expect(inspector.getByRole("tab", { name: "模板编辑" })).toHaveCount(0);
    await expect(inspector.getByRole("combobox", { name: "选择编辑对象" })).toHaveCount(0);
    await expect(inspector).toHaveAttribute("data-panel-mode", "content");
    await expect(page.locator(".homepage-editor__layer-item").first()).toHaveClass(
      /is-active/,
    );
    await expect(page.getByRole("button", { name: "收起属性面板" })).toBeVisible();
    const imageNode = page
      .frameLocator(".homepage-editor__canvas-scale iframe")
      .locator('[data-content-role-desktop="image"]:visible')
      .first();
    await expect(imageNode).toBeVisible();
    await imageNode.click();
    const objectContext = inspector.getByRole("region", { name: "当前编辑对象" });
    await expect(objectContext).toHaveAttribute("data-edit-scope", "module");
    await expect(objectContext).toHaveAttribute("data-selected-node-id", "module");

    await scroll.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      element.dispatchEvent(new Event("scroll"));
    });
    await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    const contentScrollTop = await scroll.evaluate((element) => element.scrollTop);

    await page.getByRole("button", { name: "收起属性面板" }).click();
    await expect(page.getByRole("button", { name: "展开属性面板" })).toBeVisible();
    await page.getByRole("button", { name: "展开属性面板" }).click();
    await expect(inspector).toBeVisible();
    await expect(objectContext).toHaveAttribute("data-edit-scope", "module");
    await expect(objectContext).toHaveAttribute("data-selected-node-id", "module");
    await expect
      .poll(() =>
        scroll.evaluate(
          (element, requestedScrollTop) =>
            Math.abs(
              element.scrollTop -
                Math.min(
                  requestedScrollTop,
                  element.scrollHeight - element.clientHeight,
                ),
            ) < 1,
          contentScrollTop,
        ),
      )
      .toBe(true);
    await expect(inspector.locator(".homepage-editor__properties-actions")).toBeVisible();
  });

  test("全部展开的内容属性面板在 1280 与 1600 桌面视口保持紧凑且不截断", async ({ page }) => {
    await installAdminSession(page);
    await mockEmptyEditorApis(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/admin/editor/home");

    const inspector = page.getByRole("region", { name: "属性面板" });
    await expect(inspector).toHaveAttribute("data-panel-mode", "content");
    await expect(inspector.getByRole("combobox", { name: "选择编辑对象" })).toHaveCount(0);
    await expect(inspector.locator('[data-inspector-field="desktopImage"]')).toBeVisible();
    await expect(inspector.locator('[data-inspector-field="mobileImage"]')).toHaveCount(0);
    await expect(inspector.locator('[data-inspector-field="title"]')).toBeVisible();
    await expect(inspector.locator('[data-inspector-field="subtitle"]')).toBeVisible();
    await expect(inspector.locator('[data-inspector-field="actionText"]')).toBeVisible();
    await expect(inspector.getByRole("textbox", { name: "图片替代文字" })).toBeVisible();
    await expect(inspector.getByRole("tab", { name: "模板编辑" })).toHaveCount(0);
    await expect(inspector.getByRole("group", { name: "桌面主图比例" })).toHaveCount(0);

    const readInspectorGeometry = () => page.evaluate(() => {
      const inspector = document.querySelector<HTMLElement>(".homepage-editor__inspector");
      if (!inspector) throw new Error("未找到属性面板");
      const inspectorRect = inspector.getBoundingClientRect();
      const withinInspector = (selector: string) =>
        [...inspector.querySelectorAll<HTMLElement>(selector)].every((element) => {
          const rect = element.getBoundingClientRect();
          return rect.left >= inspectorRect.left - 0.5 && rect.right <= inspectorRect.right + 0.5;
        });
      const footer = inspector.querySelector<HTMLElement>(".homepage-editor__properties-actions");
      const scroll = inspector.querySelector<HTMLElement>(".homepage-editor__inspector-scroll");
      return {
        documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        inspectorOverflow: inspector.scrollWidth > inspector.clientWidth,
        headerContained: withinInspector(".homepage-editor__inspector-header > *"),
        contextContained: withinInspector(".homepage-editor__object-context > *"),
        actionContained: withinInspector(".homepage-editor__visual-toolbar button"),
        scrollContained: Boolean(scroll && (() => {
          const rect = scroll.getBoundingClientRect();
          return rect.height > 0
            && rect.top >= inspectorRect.top - 0.5
            && rect.bottom <= inspectorRect.bottom + 0.5;
        })()),
        footerHeight: footer ? Math.round(footer.getBoundingClientRect().height) : 0,
        footerVisible: Boolean(footer && footer.getBoundingClientRect().bottom <= window.innerHeight + 0.5),
      };
    });

    for (const viewport of [
      { width: 1280, height: 720 },
      { width: 1600, height: 1000 },
    ]) {
      await page.setViewportSize(viewport);
      await expect.poll(readInspectorGeometry).toMatchObject({
        documentOverflow: false,
        inspectorOverflow: false,
        headerContained: true,
        contextContained: true,
        actionContained: true,
        scrollContained: true,
        footerVisible: true,
      });
      expect((await readInspectorGeometry()).footerHeight).toBeGreaterThan(0);
      await page.screenshot({
        path: `test-results/inspector-information-architecture-${viewport.width}x${viewport.height}.png`,
        fullPage: false,
      });
    }

    await page.getByRole("button", { name: /移动端布局/ }).click();
    await expect(inspector.locator('[data-inspector-field="desktopImage"]')).toHaveCount(0);
    await expect(inspector.locator('[data-inspector-field="mobileImage"]')).toBeVisible();
    await expect(inspector.getByRole("textbox", { name: "图片替代文字" })).toBeVisible();
    await expect(inspector.locator(".homepage-editor__properties-actions")).toBeVisible();
  });

  test("窄桌面保持左侧图层、中间画布和右侧属性面板的停靠方向", async ({ page }) => {
    await installAdminSession(page);
    await mockEmptyEditorApis(page);
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto("/admin/editor/custom");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();

    const readGeometry = () =>
      page.evaluate(() => {
        const rect = (selector: string) => {
          const box = document.querySelector(selector)?.getBoundingClientRect();
          if (!box) throw new Error(`无法测量 ${selector}`);
          return {
            x: Math.round(box.x),
            width: Math.round(box.width),
            right: Math.round(box.right),
          };
        };
        return {
          stage: rect(".homepage-editor__stage"),
          structure: rect(".homepage-editor__structure-workspace"),
          inspector: rect(".homepage-editor__right-workspace"),
          horizontalOverflow:
            document.documentElement.scrollWidth >
            document.documentElement.clientWidth,
        };
      });

    const initial = await readGeometry();
    await expect(page.getByRole("region", { name: "属性面板" })).toBeVisible();
    await expect(page.locator(".homepage-editor__structure-workspace")).toHaveClass(/is-collapsed/);
    await page.getByRole("button", { name: "展开图层面板" }).click();
    await expect(page.locator(".homepage-editor__layer-item").first()).toHaveClass(/is-active/);
    expect((await readGeometry()).stage).toEqual(initial.stage);
    const inspecting = await readGeometry();
    expect(inspecting.stage).toEqual(initial.stage);
    expect(inspecting.structure.x).toBeLessThan(inspecting.stage.width / 2);
    expect(inspecting.inspector.right).toBe(1024);
    expect(inspecting.inspector.x).toBeGreaterThanOrEqual(inspecting.stage.width / 2);
    expect(inspecting.horizontalOverflow).toBe(false);

    await page.getByRole("button", { name: "收起属性面板" }).click();
    const collapsedInspector = await readGeometry();
    expect(collapsedInspector.stage).toEqual(initial.stage);
    expect(collapsedInspector.inspector.right).toBe(1024);
    expect(collapsedInspector.horizontalOverflow).toBe(false);
  });

  test("未发布的动态预约页保留固定业务标题和表单，不公开渲染编辑器种子", async ({ page }) => {
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
    await expect(page.locator("[data-content-template-module]")).toHaveCount(0);
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
