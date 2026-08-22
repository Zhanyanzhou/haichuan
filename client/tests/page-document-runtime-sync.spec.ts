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

  test("未发布的纯品牌页保留代码兜底，不公开渲染编辑器种子", async ({ page }) => {
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
    await expect(page.locator("[data-content-template-module]")).toHaveCount(0);
    await expect(page.getByText("常见问题", { exact: true })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))
      .toBe(true);
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
    await expect(page.getByRole("heading", { name: "珠宝定制", level: 1 })).toHaveCount(0);
  });

  test("首页从未发布时使用代码兜底，并显式标记未发布状态", async ({ page }) => {
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
    await expect(page.locator(".vca-home")).toBeVisible();
    await expect(page.locator("[data-content-template-module]")).toHaveCount(0);
    await expect(page.getByText("本季精选", { exact: true })).toHaveCount(0);
    await expect(page.getByText(/按克重与工艺核价/)).toHaveCount(0);
    await expect(page.locator(".vca-home").getByText(/世家|传承|新闻|工艺/)).toHaveCount(0);
    await expect(page.locator('[data-page-header-mode="solid"]')).toBeVisible();
    expect(productRequests).toEqual([]);
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

  test("后台新页面画布直接载入同一份页面种子", async ({ page }) => {
    await installAdminSession(page);
    await mockEmptyEditorApis(page);
    await page.setViewportSize({ width: 1920, height: 1200 });
    await page.goto("/admin/editor/custom");

    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
    const canvas = page.frameLocator("iframe");
    await expect(canvas.locator("[data-content-template-module]")).toHaveCount(7);
    const heroPlaceholder = canvas
      .locator('[data-content-template-module="首屏主视觉"]')
      .locator('[data-asset-slot-id="desktopImage|mobileImage"]');
    await expect(heroPlaceholder).toBeVisible();
    await expect(heroPlaceholder).toHaveAttribute(
      "data-asset-placeholder-status",
      "waiting-final-asset",
    );
    await expect(heroPlaceholder).toHaveAttribute("data-asset-publishable", "false");
    await expect(heroPlaceholder).toHaveAttribute(
      "data-asset-focus-mode",
      "desktopImage:viewport-controlled|mobileImage:viewport-controlled",
    );
    await expect(heroPlaceholder).toHaveAttribute(
      "data-asset-safe-zone-desktop",
      "desktopImage:required|mobileImage:none",
    );
    await expect(heroPlaceholder).toContainText("等待最终素材 · 内部占位");
    await expect(
      page.locator(".homepage-editor__layer-name").filter({ hasText: "首屏" }),
    ).toBeVisible();
    await expect(
      page.locator(".homepage-editor__layer-name").filter({ hasText: "内容流程" }),
    ).toBeVisible();
    await expect(
      page.locator(".homepage-editor__layer-name").filter({ hasText: "预约入口" }),
    ).toBeVisible();
    await expect(
      page.locator(
        ".homepage-editor__layer-mobile-hint, .homepage-editor__layer-issue-hint, .homepage-editor__layer-validation",
      ),
    ).toHaveCount(0);
  });

  test("选中首页画布模板后操作组贴在对应模板右下侧并可移动删除", async ({ page }) => {
    await installAdminSession(page);
    await mockEmptyEditorApis(page);
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
    await expect(dock).toBeVisible();
    await expect(page.getByRole("button", { name: "上移当前模块" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "下移当前模块" })).toBeEnabled();

    const assertDockAtBottomRight = async (moduleIndex: number) => {
      await canvasModules.nth(moduleIndex).evaluate((module) =>
        module.scrollIntoView({ block: "end", inline: "nearest" }),
      );
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
        .toBeLessThanOrEqual(3);
      for (const buttonName of [
        "上移当前模块",
        "下移当前模块",
        "删除当前模块",
      ]) {
        await expect(page.getByRole("button", { name: buttonName })).toBeInViewport({
          ratio: 0.98,
        });
      }
    };

    await assertDockAtBottomRight(0);
    const namesBeforeMove = await layerNames.allTextContents();
    await canvasModules.nth(2).click({ position: { x: 20, y: 20 } });
    await expect(layerItems.nth(2)).toHaveClass(/is-active/);
    await assertDockAtBottomRight(2);

    await page.getByRole("button", { name: "上移当前模块" }).click();
    await expect.poll(() => layerNames.allTextContents()).toEqual([
      namesBeforeMove[0],
      namesBeforeMove[2],
      namesBeforeMove[1],
      ...namesBeforeMove.slice(3),
    ]);
    await expect(layerItems.nth(1)).toHaveClass(/is-active/);

    await page.getByRole("button", { name: "删除当前模块" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "删除模块" }).click();
    await expect(layerItems).toHaveCount(initialModuleCount - 1);
    await expect(canvasModules).toHaveCount(initialModuleCount - 1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBe(0);
  });

  test("选中模块操作组在桌面切换手机后仍贴边且位于视口内", async ({ page }) => {
    await installAdminSession(page);
    await mockEmptyEditorApis(page);
    await page.setViewportSize({ width: 1920, height: 1200 });
    await page.goto("/admin/editor/home");

    const canvas = page.frameLocator("iframe");
    const canvasModules = canvas.locator("[data-puck-component]");
    const selectedModule = canvasModules.nth(2);
    const dock = page.locator(".homepage-editor__canvas-selection-dock");
    await expect.poll(() => canvasModules.count()).toBeGreaterThan(2);
    await selectedModule.click({ position: { x: 20, y: 20 } });
    await expect(page.locator(".homepage-editor__layer-item").nth(2)).toHaveClass(
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
  });

  test("新版首页安全 fixture 在画布与预览中保持同一六段品牌结构", async ({ page }) => {
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
    await expect(heroPlaceholder).toHaveCSS("background-color", "rgb(24, 26, 27)");
    await expect(heroPlaceholder).toHaveAttribute("data-asset-publishable", "false");

    await page.goto("/preview/home");
    const previewModules = page.locator("[data-content-template-module]");
    await expect(previewModules).toHaveCount(6);
    await expect(page.locator('[data-page-header-mode="overlay-light"]')).toBeVisible();
    await expect(page.getByRole("banner")).toHaveClass(/is-transparent/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex, nofollow",
    );
    await expect(page.getByRole("heading", { name: "海川珠宝", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "珠宝作品", level: 2 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "珠宝定制", level: 2 })).toBeVisible();
    await expect(page.locator('[data-asset-publishable="false"]')).toHaveCount(5);
    await expect(page.locator('[data-content-template-module="产品展示行"]')).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      )
      .toBe(true);
    await page.screenshot({
      path: "test-results/batch3-home-fixture-desktop.png",
      fullPage: true,
    });

    for (const viewport of [
      { width: 1024, height: 900 },
      { width: 768, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await expect(previewModules).toHaveCount(6);
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
          ),
        )
        .toBe(true);
    }
    await expect(
      page.locator('[data-content-template-module="首屏主视觉"]'),
    ).toHaveAttribute("data-contract-order-mobile", "mobileImage,copy,action");
    await page.screenshot({
      path: "test-results/batch3-home-fixture-mobile.png",
      fullPage: true,
    });
  });

  test("珠宝作品安全 fixture 保持六段编辑展陈且不出现找款工具", async ({ page }) => {
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
    const main = page.locator("main");
    const previewModules = main.locator("[data-content-template-module]");
    await expect(previewModules).toHaveCount(6);
    await expect(page.locator('[data-page-header-mode="solid"]')).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex, nofollow",
    );
    await expect(page.getByRole("heading", { name: "珠宝作品", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "重点作品", level: 2 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "寻找具体款式", level: 2 })).toBeVisible();
    await expect(main.getByRole("textbox")).toHaveCount(0);
    await expect(main.getByRole("combobox")).toHaveCount(0);
    await expect(main.getByText(/共\s*\d+\s*件作品/)).toHaveCount(0);
    await expect(main.locator('[data-asset-publishable="false"]')).toHaveCount(6);
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      )
      .toBe(true);
    await page.screenshot({
      path: "test-results/batch4-products-fixture-desktop.png",
      fullPage: true,
    });

    for (const viewport of [
      { width: 1024, height: 900 },
      { width: 768, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await expect(previewModules).toHaveCount(6);
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
          ),
        )
        .toBe(true);
    }
    await expect(
      main.locator('[data-content-template-module="首屏主视觉"]'),
    ).toHaveAttribute("data-contract-order-mobile", "mobileImage,copy,action");
    await page.screenshot({
      path: "test-results/batch4-products-fixture-mobile.png",
      fullPage: true,
    });
  });

  test("定制与关于安全 fixture 使用品牌叙事结构并保持素材门禁", async ({ page }) => {
    await installAdminSession(page);
    await mockEmptyEditorApis(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 1000 });

    const cases = [
      {
        key: "custom",
        modules: ["首屏主视觉", "文字横幅", "双图海报", "单图海报", "定制流程", "作品画廊", "预约入口"],
        headings: ["珠宝定制", "定制理念", "灵感与设计", "材质与工艺", "定制过程"],
      },
      {
        key: "about",
        modules: ["首屏主视觉", "单图海报", "双图海报", "文字横幅", "全屏出血图", "预约入口"],
        headings: ["关于海川", "审美与价值", "工作室与工艺", "作品先于修饰", "真实背景"],
      },
    ];

    for (const fixture of cases) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`/preview/${fixture.key}`);
      const main = page.locator("main");
      const modules = main.locator("[data-content-template-module]");
      await expect(modules).toHaveCount(fixture.modules.length);
      await expect
        .poll(() => modules.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-content-template-module"))))
        .toEqual(fixture.modules);
      for (const heading of fixture.headings) {
        await expect(main.getByRole("heading", { name: heading, exact: true })).toBeVisible();
      }
      await expect(main.locator('[data-asset-publishable="false"]')).not.toHaveCount(0);
      await expect(main.locator('[data-content-template-module="产品展示行"]')).toHaveCount(0);
      await expect(main.locator('[data-content-template-module="分类卡片"]')).toHaveCount(0);
      await expect(page.locator('[data-page-header-mode="overlay-light"]')).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await page.screenshot({
        path: `test-results/batch5-${fixture.key}-fixture-desktop.png`,
        fullPage: true,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(modules).toHaveCount(fixture.modules.length);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await page.screenshot({
        path: `test-results/batch5-${fixture.key}-fixture-mobile.png`,
        fullPage: true,
      });
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
    await expect(main.getByRole("textbox")).toHaveCount(0);
    await expect(main.getByRole("combobox")).toHaveCount(0);
    await expect(main.getByText(/共\s*\d+\s*件作品/)).toHaveCount(0);
  });

  test("珠宝作品未发布、空文档与请求失败时统一使用品牌兜底", async ({ page }) => {
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

    for (const state of ["unpublished", "invalid", "filtered", "error"] as const) {
      responseState = state;
      await page.goto(`/products?documentState=${state}`);
      const main = page.locator("main");
      const documentState = state === "filtered" ? "published" : state;
      await expect(main.locator(`[data-page-document-state="${documentState}"]`)).toBeVisible();
      await expect(main.getByRole("heading", { name: "珠宝作品", level: 1 })).toHaveCount(1);
      await expect(main.getByRole("link", { name: "进入选款中心" })).toHaveAttribute("href", "/catalog");
      await expect(main.getByRole("textbox")).toHaveCount(0);
      await expect(main.getByRole("combobox")).toHaveCount(0);
      await expect(main.getByText("不应展示的旧商品墙", { exact: true })).toHaveCount(0);
    }
    expect(productRequests).toEqual([]);
  });

  test("关于页公开运行时过滤能力矩阵禁止的商品展示行", async ({ page }) => {
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
    await expect(main.locator('[data-content-template-module="产品展示行"]')).toHaveCount(0);
    await expect(main.getByText("不应公开展示的商品墙", { exact: true })).toHaveCount(0);
  });

  test("选款中心读取旧发布快照时隐藏已禁止的商品展示模块且保留固定业务区", async ({ page }) => {
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
    await expect(catalogTitle).not.toHaveClass(/sr-only/);
    await expect(page.getByText("旧精选商品", { exact: true })).toHaveCount(0);
    await expect(page.locator(".catalog-page")).toBeVisible();
  });

  test("页面角色矩阵只开放当前页面允许的内容模板", async ({ page }) => {
    await installAdminSession(page);
    await mockEmptyEditorApis(page);
    await page.setViewportSize({ width: 1440, height: 1000 });

    const templateName = (name: string) =>
      page.locator(".homepage-editor__template-name").filter({ hasText: new RegExp(`^${name}$`) });

    await page.goto("/admin/editor/custom");
    await expect(templateName("内容流程")).toBeVisible();
    await expect(templateName("前后对比")).toBeVisible();
    await expect(templateName("商品列表")).toHaveCount(0);
    await expect(templateName("限时活动")).toHaveCount(0);

    await page.goto("/admin/editor/products");
    await expect(templateName("单品展示")).toBeVisible();
    await expect(templateName("作品画廊")).toBeVisible();
    await expect(templateName("商品列表")).toHaveCount(0);
    await expect(templateName("品类入口")).toHaveCount(0);
    await expect(page.getByText("商品列表与筛选", { exact: true })).toHaveCount(0);

    await page.goto("/admin/editor/catalog");
    await expect(templateName("纯文字")).toBeVisible();
    await expect(templateName("单图文")).toBeVisible();
    await expect(templateName("首屏")).toHaveCount(0);
    await expect(templateName("品类入口")).toHaveCount(0);
    await expect(templateName("商品列表")).toHaveCount(0);
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
    await expect(layerItems).toHaveCount(7);

    for (const index of [0, 3, 6]) {
      await layerItems.nth(index).click();
      await expect.poll(readAnchor).toEqual(initialAnchor);
    }

    const editableText = page
      .locator('.homepage-editor__inspector input[type="text"]')
      .first();
    await expect(editableText).toBeVisible();
    await editableText.fill(`${await editableText.inputValue()} · 调整`);
    await expect(
      page.locator('.homepage-editor__draft-status[data-mode="dirty"]'),
    ).toContainText("有未保存修改");
    await expect(
      page.locator('.homepage-editor__properties-status[data-status="dirty"]'),
    ).toContainText("有未保存修改");
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
        const body = rect(".homepage-editor__body");
        const canvas = rect(".homepage-editor__canvas-document");
        const switcher = rect(".homepage-editor__viewport-switcher");
        const scroll = document.querySelector(
          ".homepage-editor__canvas-scroll",
        );
        if (!scroll) throw new Error("无法测量画布滚动区");
        const center = body.x + body.width / 2;
        const round = (value: number) => Math.round(value * 100) / 100;

        return {
          canvasOffset: round(canvas.x + canvas.width / 2 - center),
          switcherOffset: round(switcher.x + switcher.width / 2 - center),
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

  test("一级导航沿用全后台宽度、高度和右上收纳键且不移动画布", async ({ page }) => {
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
      "收起属性面板",
    ]) {
      expect(await toggleAppearance(name)).toEqual(standardToggle);
      expect(await toggleY(name)).toBe(66);
    }
    await expect(
      page.getByRole("button", { name: "收起图层面板" }),
    ).toHaveCount(0);

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

    const initial = await geometry();
    expect(initial.navigation).toMatchObject({ x: 0, width: 0, right: 0 });
    expect(initial.library.x).toBe(0);
    expect(initial.library.width).toBe(236);
    expect(initial.structure.x).toBe(initial.library.right);
    expect(initial.structure.width).toBe(144);
    expect(initial.horizontalOverflow).toBe(false);

    await page.getByRole("button", { name: "展开一级导航" }).click();
    await expect(page.locator(".admin-sidebar")).toHaveCSS("width", "160px");
    await expect(
      page.getByRole("button", { name: "收起一级导航" }),
    ).toBeVisible();
    expect(await toggleAppearance("收起一级导航")).toEqual(standardToggle);
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
        canvas: initial.canvas,
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
    ).toHaveCount(0);
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
        stage: initial.stage,
        controls: initial.controls,
        canvas: initial.canvas,
        library: initial.library,
        structure: initial.structure,
        inspector: initial.inspector,
        horizontalOverflow: false,
      });

    await page.getByRole("button", { name: "收起模板组件库" }).click();
    await expect(page.getByRole("button", { name: "展开模板组件库" })).toBeVisible();
    await page.mouse.move(720, 500);
    expect(await toggleAppearance("展开模板组件库")).toEqual(standardToggle);
    expect(await toggleY("展开模板组件库")).toBe(66);
    await expect(page.locator(".homepage-editor__library")).toHaveCSS("width", "80px");
    await expect.poll(geometry).toMatchObject({
      stage: initial.stage,
      controls: initial.controls,
      structure: initial.structure,
      inspector: initial.inspector,
    });

    await page.getByRole("button", { name: "展开模板组件库" }).click();
    await expect(page.getByRole("button", { name: "收起模板组件库" })).toBeVisible();
    await expect(page.locator(".homepage-editor__library")).toHaveCSS("width", "236px");
    await expect.poll(geometry).toMatchObject(initial);

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
      controls: initial.controls,
      library: initial.library,
      structure: initial.structure,
    });

    await page.getByRole("button", { name: "展开属性面板" }).click();
    await expect(page.getByRole("button", { name: "收起属性面板" })).toBeVisible();
    await expect(page.locator(".homepage-editor__right-workspace")).toHaveCSS(
      "width",
      "380px",
    );
    await expect.poll(geometry).toMatchObject(initial);

    await page.getByRole("button", { name: "展开一级导航" }).click();
    await expect(page.locator(".admin-sidebar")).toHaveCSS("width", "160px");
    await expect(page.getByRole("button", { name: "收起一级导航" })).toBeVisible();
    await expect(page.getByRole("button", { name: "展开图层面板" })).toBeHidden();

    await page.keyboard.press("Escape");
    await expect(page.locator(".admin-sidebar")).toHaveCSS("width", "0px");
    await expect(
      page.getByRole("button", { name: "展开一级导航" }),
    ).toBeFocused();
    await expect.poll(geometry).toMatchObject(initial);

    await page.setViewportSize({ width: 1912, height: 948 });
    // 等待 ResizeObserver 完成宽屏适配，再比较导航交互前后的画布几何。
    await page.waitForTimeout(250);
    const wideScreenCollapsed = await geometry();
    await page.getByRole("button", { name: "展开一级导航" }).click();
    await expect(page.locator(".admin-sidebar")).toHaveCSS("width", "160px");
    await expect.poll(geometry).toMatchObject({
      stage: wideScreenCollapsed.stage,
      controls: wideScreenCollapsed.controls,
      canvas: wideScreenCollapsed.canvas,
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

  test("属性面板区分退出与收起，并分别保留内容和设计滚动位置", async ({ page }) => {
    await installAdminSession(page);
    await mockEmptyEditorApis(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/admin/editor/custom");

    const scroll = page.locator(".homepage-editor__inspector-scroll");
    const contentTab = page.getByRole("tab", { name: "内容" });
    const designTab = page.getByRole("tab", { name: "设计" });
    await expect(page.getByRole("button", { name: "退出当前模块编辑" })).toBeVisible();
    await expect(page.locator(".homepage-editor__layer-item").first()).toHaveClass(
      /is-active/,
    );
    await expect(page.getByRole("button", { name: "收起属性面板" })).toBeVisible();
    await expect(designTab).toBeEnabled();

    await scroll.evaluate((element) => {
      element.scrollTop = 180;
      element.dispatchEvent(new Event("scroll"));
    });
    await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    const contentScrollTop = await scroll.evaluate((element) => element.scrollTop);

    await designTab.click();
    await expect(designTab).toHaveAttribute("aria-selected", "true");
    await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBe(0);

    await contentTab.click();
    await expect(contentTab).toHaveAttribute("aria-selected", "true");
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

    await page.getByRole("button", { name: "退出当前模块编辑" }).click();
    await expect(
      page.locator(".homepage-editor__properties-empty-state strong"),
    ).toHaveText("未选择模块");
    await expect(page.getByRole("button", { name: "编辑首个模块" })).toBeVisible();
    await expect(page.getByRole("button", { name: "收起属性面板" })).toBeVisible();

    await page.getByRole("button", { name: "编辑首个模块" }).click();
    await expect(page.getByRole("button", { name: "退出当前模块编辑" })).toBeVisible();
    await page.getByRole("button", { name: "收起属性面板" }).click();
    await expect(page.getByRole("button", { name: "展开属性面板" })).toBeVisible();
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
    await expect(page.getByRole("button", { name: "退出当前模块编辑" })).toBeVisible();
    await page.getByRole("button", { name: "展开图层面板" }).click();
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
