import { expect, test, type Locator, type Page } from "@playwright/test";
import { installAdminSession } from "./fixtures/session-auth";

const appMode = process.env.PLAYWRIGHT_APP_MODE === "mock" ? "mock" : "development";

const fixtureSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900">
    <rect width="1600" height="900" fill="#d8d6d0"/>
    <circle cx="1120" cy="360" r="230" fill="#f7f5ef"/>
  </svg>
`;

function json(data: unknown) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ code: 200, data, message: "success" }),
  };
}

function makeHeroDraft() {
  return {
    id: 9701,
    pageKey: "home",
    puckData: {
      content: [
        {
          type: "首屏主视觉",
          props: {
            id: "inspector-context-hero",
            desktopImage: "/svg/inspector-context-hero.svg",
            mobileImage: "",
            altText: "首屏珠宝静物",
            eyebrow: "THE HOUSE OF HAICHUAN",
            title: "东方之形，自有光华",
            subtitle: "以东方美学，铸当代珠宝",
            actionText: "探索系列",
            targetType: "page",
            linkUrl: "/products",
            productId: 0,
            categoryId: 0,
            desktopFocusX: 50,
            desktopFocusY: 50,
            mobileFocusX: 50,
            mobileFocusY: 50,
            __instanceOverrides: {
              version: 2,
              nodes: {
                title: {
                  rectByViewport: {
                    desktop: { x: 0.18, y: 0.54, width: 0.5, height: 0.18 },
                  },
                  zIndexByViewport: { desktop: 4 },
                },
              },
            },
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
    updatedAt: "2026-08-23T00:00:00.000Z",
  };
}

function makeVideoDraft() {
  const draft = makeHeroDraft();
  return {
    ...draft,
    id: 9704,
    puckData: {
      content: [
        {
          type: "视频区块",
          props: {
            id: "inspector-context-video",
            videoUrl: "",
            posterUrl: "",
            videoDescription: "工匠在工作台前手工錾刻金饰",
            title: "视频工艺故事",
            subtitle: "确定性封面与播放设置",
            actionText: "",
            targetType: "none",
            linkUrl: "",
            productId: 0,
            autoPlay: false,
            loop: true,
            muted: true,
            showControls: true,
            aspectRatio: "16:9",
            maxHeight: 720,
            videoWidth: "standard",
            bgColor: "#FFFFFF",
            focusX: 50,
            focusY: 50,
          },
        },
      ],
      zones: {},
      root: { props: {} },
    },
  };
}

function makeFeaturedProductDraft() {
  return {
    ...makeHeroDraft(),
    id: 9702,
    puckData: {
      content: [
        {
          type: "单品焦点推荐",
          props: {
            id: "inspector-context-product",
            productCode: "HC-TEST-001",
            productId: 0,
            eyebrow: "SIGNATURE PIECE",
            title: "单品展示",
            summary: "用于验证商品对象过滤",
            primaryText: "查看作品",
            secondaryText: "预约鉴赏",
            secondaryTargetType: "none",
          },
        },
      ],
      zones: {},
      root: { props: {} },
    },
  };
}

function makeScrollableLayerDraft() {
  const draft = makeHeroDraft();
  const hero = draft.puckData.content[0];
  return {
    ...draft,
    id: 9703,
    puckData: {
      ...draft.puckData,
      content: [
        { ...hero, props: { ...hero.props, id: "inspector-layer-hero" } },
        ...Array.from({ length: 14 }, (_, index) => ({
          type: "文字横幅",
          props: {
            id: `inspector-layer-banner-${index}`,
            title: `图层恢复测试 ${index + 1}`,
            buttonText: "",
            targetType: "none",
          },
        })),
      ],
    },
  };
}

async function mockEditorApis(page: Page, draft = makeHeroDraft()) {
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    const pathname = new URL(url).pathname;
    if (url.includes("/auth/profile")) return route.fallback();
    if (pathname === "/api/upload/image" && route.request().method() === "POST") {
      return route.fulfill(json({ url: "/svg/inspector-context-uploaded.svg" }));
    }
    if (url.includes("/page-modules/document/validate")) {
      return route.fulfill(json({ valid: true, errors: [] }));
    }
    if (url.includes("/page-modules/document/revisions")) {
      return route.fulfill(json([]));
    }
    if (url.includes("/page-modules/document/published")) {
      return route.fulfill(json(null));
    }
    if (url.includes("/page-modules/document/admin")) {
      return route.fulfill(json(draft));
    }
    if (url.includes("/products/admin/resolve-references")) {
      return route.fulfill(json([{
        id: 1,
        code: "HC-TEST-001",
        name: "测试商品作品",
        thumbnail: "/svg/inspector-context-hero.svg",
        status: "PUBLISHED",
        visibility: "PUBLIC",
        eligible: true,
        reason: "AVAILABLE",
      }]));
    }
    return route.fulfill(json({}));
  });
  await page.route("**/svg/inspector-context-hero.svg", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: fixtureSvg,
    }),
  );
}

async function authenticateAdmin(page: Page) {
  await installAdminSession(page, {
    username: "inspector-context-ui-test",
    realName: "属性面板 UI 测试管理员",
  });
}

async function openHeroInspector(
  page: Page,
  viewport: { width: number; height: number } = { width: 1600, height: 1000 },
  draft = makeHeroDraft(),
) {
  await page.setViewportSize(viewport);
  await mockEditorApis(page, draft);
  await authenticateAdmin(page);
  await page.goto("/admin/editor/home");
  await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();

  const inspector = page.getByRole("region", { name: "属性面板" });
  if (!(await inspector.isVisible())) {
    const expandInspector = page.getByRole("button", { name: "展开属性面板" });
    if (await expandInspector.isVisible()) {
      await expandInspector.click();
    } else {
      const expandLayers = page.getByRole("button", { name: "展开图层面板" });
      if (await expandLayers.isVisible()) await expandLayers.click();
      await page.locator(".homepage-editor__layer-item .homepage-editor__layer-select").first().click();
      await page.getByRole("button", { name: "展开属性面板" }).click();
    }
  }
  await expect(inspector).toBeVisible();
  await expect(inspector).toHaveAttribute(
    "data-module-type",
    String(draft.puckData.content[0]?.type ?? ""),
  );
  return inspector;
}

function pageModuleHost(page: Page, blockId: string) {
  return page
    .frameLocator(".homepage-editor__canvas-scale iframe")
    .locator(`[data-puck-component="${blockId}"]`);
}

async function activatePageModuleHost(page: Page, blockId: string) {
  const host = pageModuleHost(page, blockId);
  if (await host.isVisible()) {
    try {
      await host.click({ trial: true, timeout: 1_000 });
      await host.click();
      return;
    } catch {
      // 固定导航等正式页面层遮挡画布命中时，改走同一模块的图层选择入口。
    }
  }
  const layerSelect = page
    .locator(`.homepage-editor__layer-item[data-layer-id="${blockId}"]`)
    .locator(".homepage-editor__layer-select");
  await expect(layerSelect).toBeVisible();
  await layerSelect.click();
}

async function selectObject(inspector: Locator, value: string, label: string) {
  const select = inspector.getByRole("combobox", { name: "选择编辑对象" });
  await select.selectOption(value);
  await expect(select.locator("option:checked")).toHaveText(label);
}

async function setRangeValue(range: Locator, value: number) {
  if (await range.getAttribute("type") === "number") {
    await range.fill(String(value));
    await expect(range).toHaveValue(String(value));
    return;
  }
  let current = Number(await range.inputValue());
  const direction = value >= current ? 1 : -1;
  const key = direction > 0 ? "ArrowRight" : "ArrowLeft";
  while (current !== value) {
    const next = current + direction;
    await range.press(key);
    await expect(range).toHaveValue(String(next));
    current = next;
  }
  await expect(range).toHaveValue(String(value));
}

function field(inspector: Locator, key: string) {
  return inspector.locator(`[data-inspector-field="${key}"]`);
}

test.describe("属性面板上下文（真实前端组件 + 拦截自有 API；仅 Mock UI 证据）", () => {
  test.skip(
    appMode === "mock",
    "该层在 development 模式拦截自有 API；不用于证明真实保存或发布",
  );

  test("模块级操作只保留在全局工具栏和图层栏，不在属性面板重复", async ({
    page,
  }) => {
    const inspector = await openHeroInspector(page);
    const firstLayer = page.locator(".homepage-editor__layer-item").first();
    await expect(firstLayer.locator(".homepage-editor__layer-summary"))
      .toHaveText("东方之形，自有光华");
    await expect(firstLayer.getByRole("button", { name: "首屏", exact: true })).toBeVisible();

    await expect(
      inspector.getByRole("button", { name: "更多模块操作" }),
    ).toHaveCount(0);
    const canvasDock = page.getByRole("toolbar", {
      name: "调整“首屏”模块",
    });
    await expect(canvasDock).toBeVisible();
    await expect(
      canvasDock.getByRole("button", { name: "删除当前模块" }),
    ).toBeVisible();
    await expect(
      page
        .locator(".homepage-editor__layer-item")
        .first()
        .getByRole("button", { name: "删除首屏" }),
    ).toBeVisible();
  });

  test("内容文字开关即时控制画布且重新显示不丢失原文", async ({ page }) => {
    const inspector = await openHeroInspector(page);
    const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    const text = canvas.getByText("东方之形，自有光华", { exact: true });
    const action = canvas.locator('[data-content-role="action"]');
    let visibility = inspector.getByRole("switch", { name: "显示内容文字" });
    const actionVisibility = inspector.getByRole("switch", { name: "显示行动按钮" });

    await expect(visibility).toBeChecked();
    await expect(actionVisibility).toBeChecked();
    await expect(text).toBeVisible();
    await expect(action).toBeVisible();
    await expect(action).toContainText("探索系列");

    await visibility.click();
    await expect(visibility).not.toBeChecked();
    await expect(text).toBeHidden();
    await expect(action).toBeVisible();
    await expect(page.getByText("修改已更新，尚未保存页面草稿", { exact: true }))
      .toBeVisible();

    await page.getByRole("button", { name: "撤销", exact: true }).click();
    await expect(text).toBeVisible();
    visibility = (await openHeroInspector(page)).getByRole("switch", { name: "显示内容文字" });
    await expect(visibility).toBeChecked();

    await visibility.click();
    await expect(visibility).not.toBeChecked();
    await expect(text).toBeHidden();

    await visibility.click();
    await expect(visibility).toBeChecked();
    await expect(text).toBeVisible();

    await actionVisibility.click();
    await expect(actionVisibility).not.toBeChecked();
    await expect(action).toBeHidden();
    await expect(text).toBeVisible();

    await actionVisibility.click();
    await expect(actionVisibility).toBeChecked();
    await expect(action).toBeVisible();
  });

  test("退出画布预览后恢复原选中模块与属性面板上下文", async ({ page }) => {
    const inspector = await openHeroInspector(page);
    await expect(inspector).toHaveAttribute("data-module-type", "首屏主视觉");

    await page.getByRole("button", { name: "预览当前画布" }).click();
    await expect(page.getByRole("button", { name: "退出当前画布预览" })).toBeVisible();
    await expect(inspector).toBeHidden();

    await page.getByRole("button", { name: "退出当前画布预览" }).click();
    await expect(inspector).toBeVisible();
    await expect(inspector).toHaveAttribute("data-module-type", "首屏主视觉");
    await expect(inspector.getByRole("switch", { name: "显示内容文字" })).toBeVisible();
  });

  test("图层栏直接显示隐藏并删除模块，仍保持轻量页面导航", async ({ page }) => {
    const inspector = await openHeroInspector(page);
    const pageNavigation = page.getByRole("button", { name: "预览页面导航" });
    const navigationLock = pageNavigation.getByLabel("固定区域");
    const [navigationBox, lockBox] = await Promise.all([
      pageNavigation.boundingBox(),
      navigationLock.boundingBox(),
    ]);
    if (!navigationBox || !lockBox) throw new Error("页面导航或固定区域图标未渲染");
    const lockRightInset = navigationBox.x + navigationBox.width - (lockBox.x + lockBox.width);
    expect(lockBox.x).toBeGreaterThan(navigationBox.x + navigationBox.width / 2);
    expect(lockRightInset).toBeGreaterThanOrEqual(8);
    expect(lockRightInset).toBeLessThanOrEqual(14);

    const layer = page.locator(".homepage-editor__layer-item").first();
    await expect(layer).toHaveAttribute("data-layer-visible", "true");
    const layerActions = layer.getByRole("group", { name: "首屏图层操作" });
    const [navigationBackground, layerBackground, actionBackground] = await Promise.all([
      pageNavigation.evaluate((element) => getComputedStyle(element).backgroundColor),
      layer.evaluate((element) => getComputedStyle(element).backgroundColor),
      layerActions.evaluate((element) => getComputedStyle(element).backgroundColor),
    ]);
    expect(navigationBackground).toBe(layerBackground);
    expect(actionBackground).toBe(layerBackground);
    await expect(layer.getByRole("button", { name: "复制首屏" })).toHaveCount(0);
    await expect(layerActions.getByRole("button"))
      .toHaveCount(2);

    await expect(
      inspector.getByRole("combobox", { name: "选择编辑对象" }),
    ).toHaveCount(0);
    await expect(page.frameLocator(".homepage-editor__canvas-scale iframe").locator("[data-hc-node-hud]"))
      .toHaveCount(0);

    await layer.getByRole("button", { name: "隐藏首屏" }).click();
    await expect(layer).toHaveAttribute("data-layer-visible", "false");
    await layer.getByRole("button", { name: "显示首屏" }).click();
    await expect(layer).toHaveAttribute("data-layer-visible", "true");

    await layer.getByRole("button", { name: "删除首屏" }).click();
    const dialog = page.getByRole("dialog").filter({ hasText: "删除“首屏”" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "删除模块" }).click();
    await expect(page.locator(".homepage-editor__layer-item")).toHaveCount(0);
  });

  test("页面画布点击只选中模板并保持完整属性面板稳定", async ({
    page,
  }) => {
    const inspector = await openHeroInspector(page);
    const allContentFields = [
      "desktopImage",
      "altText",
      "title",
      "subtitle",
      "eyebrow",
      "actionText",
      "targetType",
    ] as const;
    await expect(
      inspector.getByRole("combobox", { name: "选择编辑对象" }),
    ).toHaveCount(0);
    await expect(inspector.getByRole("region", { name: "当前编辑对象" }))
      .toContainText("全部内容");
    await expect(inspector.locator("[data-task-group]")).toHaveCount(3);
    expect(await inspector.locator("[data-task-group]").evaluateAll((groups) =>
      groups.map((group) => group.getAttribute("data-task-group")),
    )).toEqual(["media", "content", "link"]);
    for (const key of allContentFields) {
      await expect(field(inspector, key), `顶层字段 ${key} 应同时可见`).toHaveCount(1);
    }
    await expect(inspector.locator(".is-visual-selected")).toHaveCount(0);

    const scroll = inspector.locator('[data-inspector-scroll="main"]');
    await scroll.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
    const scrollTop = await scroll.evaluate((element) => Math.round(element.scrollTop));
    const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    const canvasTitle = canvas.locator('[data-editor-field~="title"]:visible').first();
    await expect(canvasTitle).toHaveCSS("animation-name", "none");
    const titleTop = await canvasTitle.evaluate((element) => element.getBoundingClientRect().top);
    await activatePageModuleHost(page, "inspector-context-hero");
    await expect.poll(() => canvasTitle.evaluate((element) => element.getBoundingClientRect().top))
      .toBeCloseTo(titleTop, 1);
    await expect(inspector.locator(".is-visual-selected")).toHaveCount(0);
    await expect(inspector.getByRole("region", { name: "当前编辑对象" }))
      .toContainText("全部内容");
    await expect.poll(() => scroll.evaluate((element) => Math.round(element.scrollTop)))
      .toBe(scrollTop);
    for (const key of allContentFields) {
      await expect(field(inspector, key), `点击标题后仍应保留 ${key}`).toHaveCount(1);
    }

    await activatePageModuleHost(page, "inspector-context-hero");
    await expect(inspector.locator(".is-visual-selected")).toHaveCount(0);
    await expect(inspector.getByRole("region", { name: "当前编辑对象" }))
      .toContainText("全部内容");
    await expect.poll(() => scroll.evaluate((element) => Math.round(element.scrollTop)))
      .toBe(scrollTop);
    await expect(canvas.locator("[data-hc-node-hud]")).toHaveCount(0);
    for (const key of allContentFields) {
      await expect(field(inspector, key), `点击主图后仍应保留 ${key}`).toHaveCount(1);
    }

    await page.getByRole("button", { name: /移动端.*布局/ }).click();
    await expect(field(inspector, "desktopImage")).toHaveCount(0);
    await expect(field(inspector, "mobileImage")).toHaveCount(1);
    for (const key of allContentFields.filter((fieldKey) => fieldKey !== "desktopImage")) {
      await expect(field(inspector, key), `移动端仍应保留当前适用字段 ${key}`).toHaveCount(1);
    }
  });

  test("页面画布点击可见模块时保持宿主画布纵向位置稳定", async ({ page }) => {
    await openHeroInspector(page, { width: 1600, height: 900 }, makeScrollableLayerDraft());
    const stage = page.locator(".homepage-editor__canvas-scroll");
    const target = pageModuleHost(page, "inspector-layer-banner-6");
    await expect(target).toHaveCount(1);
    await target.scrollIntoViewIfNeeded();
    await page.waitForTimeout(100);
    const before = await stage.evaluate((element) => ({
      scrollTop: element.scrollTop,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
    }));
    expect(before.scrollTop).toBeGreaterThan(0);

    await stage.evaluate((element) => {
      type CanvasSample = {
        scrollTop: number;
        canvasTop: number;
        frameTop: number;
        frameHeight: number;
        targetTop: number;
      };
      const observedWindow = window as typeof window & { __canvasScrollSamples?: CanvasSample[] };
      const samples: CanvasSample[] = [];
      observedWindow.__canvasScrollSamples = samples;
      const startedAt = performance.now();
      const sample = () => {
        const canvasDocument = document.querySelector<HTMLElement>(".homepage-editor__canvas-document");
        const frame = document.querySelector<HTMLIFrameElement>(".homepage-editor__preview-frame iframe");
        const targetBlock = frame?.contentDocument?.querySelector<HTMLElement>(
          '[data-editor-block-id="inspector-layer-banner-6"]',
        );
        const frameRect = frame?.getBoundingClientRect();
        const targetRect = targetBlock?.getBoundingClientRect();
        const scale = frame && frameRect
          ? frameRect.width / Math.max(1, frame.contentDocument?.documentElement.clientWidth ?? 1)
          : 1;
        samples.push({
          scrollTop: element.scrollTop,
          canvasTop: canvasDocument?.getBoundingClientRect().top ?? 0,
          frameTop: frameRect?.top ?? 0,
          frameHeight: frameRect?.height ?? 0,
          targetTop: frameRect && targetRect ? frameRect.top + targetRect.top * scale : 0,
        });
        if (performance.now() - startedAt < 800) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await target.click({ position: { x: 24, y: 24 } });
    await page.waitForTimeout(900);
    const after = await stage.evaluate((element) => ({
        scrollTop: element.scrollTop,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
    }));
    expect(after).toEqual(before);
    const samples = await page.evaluate(() => (
      window as typeof window & { __canvasScrollSamples?: Array<Record<string, number>> }
    ).__canvasScrollSamples ?? []);
    expect(samples.length).toBeGreaterThan(10);
    const first = samples[0];
    for (const sample of samples) {
      expect(sample.scrollTop).toBeCloseTo(first.scrollTop, 1);
      expect(sample.canvasTop).toBeCloseTo(first.canvasTop, 1);
      expect(sample.frameTop).toBeCloseTo(first.frameTop, 1);
      expect(sample.frameHeight).toBeCloseTo(first.frameHeight, 1);
      expect(sample.targetTop).toBeCloseTo(first.targetTop, 1);
    }
  });

  test("首屏图片预览、更换与素材库选择共用单一等比例任务区", async ({ page }, testInfo) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("haichuan.page-media", JSON.stringify([
        {
          url: "/svg/inspector-context-library.svg",
          type: "image",
          name: "首屏备选图.svg",
          createdAt: "2026-08-31T00:00:00.000Z",
        },
      ]));
    });
    await page.route("**/svg/inspector-context-library.svg", (route) =>
      route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        body: fixtureSvg.replace("#d8d6d0", "#bfc7c9"),
      }),
    );
    await page.route("**/svg/inspector-context-uploaded.svg", (route) =>
      route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        body: fixtureSvg.replace("#d8d6d0", "#c9c2ba"),
      }),
    );
    const inspector = await openHeroInspector(page, { width: 1912, height: 955 });
    const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    await page.evaluate(() => {
      const probeWindow = window as Window & { __inspectorFileInputClicks?: number };
      probeWindow.__inspectorFileInputClicks = 0;
      document.addEventListener("click", (event) => {
        if (event.target instanceof HTMLInputElement && event.target.type === "file") {
          probeWindow.__inspectorFileInputClicks = (probeWindow.__inspectorFileInputClicks ?? 0) + 1;
        }
      }, true);
    });
    await activatePageModuleHost(page, "inspector-context-hero");

    const mediaField = field(inspector, "desktopImage");
    const preview = mediaField.getByRole("button", { name: "点击更换当前图片" });
    const replace = mediaField.getByRole("button", { name: "更换图片" });
    const library = mediaField.getByRole("button", { name: "选择本页图片" });
    await expect(preview).toBeVisible();
    await expect(replace).toBeEnabled();
    await expect(library).toBeEnabled();
    await expect(inspector.locator(".is-visual-selected")).toHaveCount(0);
    await expect(mediaField.locator("[data-media-field]")).not.toBeFocused();
    await page.evaluate(() => new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
    }));
    expect(await page.evaluate(() => (
      window as Window & { __inspectorFileInputClicks?: number }
    ).__inspectorFileInputClicks ?? 0)).toBe(0);

    const previewBox = await mediaField.locator(".homepage-editor__media-preview-img").boundingBox();
    if (!previewBox) throw new Error("首屏图片预览没有布局尺寸");
    expect(previewBox.width / previewBox.height).toBeCloseTo(16 / 9, 1);
    const [replaceBox, libraryBox] = await Promise.all([
      replace.boundingBox(),
      library.boundingBox(),
    ]);
    if (!replaceBox || !libraryBox) throw new Error("图片任务按钮没有布局尺寸");
    expect(Math.abs(replaceBox.width - libraryBox.width)).toBeLessThanOrEqual(1);

    const previewChooser = page.waitForEvent("filechooser");
    await preview.click();
    await (await previewChooser).setFiles([]);
    const replaceChooser = page.waitForEvent("filechooser");
    await replace.click();
    await (await replaceChooser).setFiles({
      name: "首屏上传验证.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from(fixtureSvg),
    });
    await expect(mediaField.getByRole("img", { name: "预览" })).toHaveAttribute(
      "src",
      "/svg/inspector-context-uploaded.svg",
    );
    await expect(canvas.locator('[data-content-role-desktop="desktopImage"] img:visible').first())
      .toHaveAttribute("src", /inspector-context-uploaded\.svg/);
    await expect(mediaField.locator(".ant-upload-drag")).toHaveCount(0);

    await library.click();
    const picker = mediaField.getByRole("region", { name: "选择本页与当前浏览器图片" });
    await expect(picker).toBeVisible();
    await picker.getByRole("button", { name: "使用素材：首屏备选图.svg" }).click();
    await expect(mediaField.getByRole("img", { name: "预览" })).toHaveAttribute(
      "src",
      "/svg/inspector-context-library.svg",
    );
    await expect(canvas.locator('[data-content-role-desktop="desktopImage"] img:visible').first())
      .toHaveAttribute("src", /inspector-context-library\.svg/);

    const desktopShot = testInfo.outputPath("hero-media-inspector-1912x955.png");
    await inspector.screenshot({ path: desktopShot, animations: "disabled" });
    await testInfo.attach("hero-media-inspector-1912x955", {
      path: desktopShot,
      contentType: "image/png",
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await mediaField.scrollIntoViewIfNeeded();
    const [narrowPreviewBox, narrowReplaceBox, narrowLibraryBox] = await Promise.all([
      mediaField.locator(".homepage-editor__media-preview-img").boundingBox(),
      replace.boundingBox(),
      library.boundingBox(),
    ]);
    if (!narrowPreviewBox || !narrowReplaceBox || !narrowLibraryBox) {
      throw new Error("窄屏图片任务区没有完整布局尺寸");
    }
    expect(narrowPreviewBox.width / narrowPreviewBox.height).toBeCloseTo(16 / 9, 1);
    expect(Math.abs(narrowReplaceBox.width - narrowLibraryBox.width)).toBeLessThanOrEqual(1);
    const narrowShot = testInfo.outputPath("hero-media-inspector-390x844.png");
    await page.screenshot({ path: narrowShot, animations: "disabled" });
    await testInfo.attach("hero-media-inspector-390x844", {
      path: narrowShot,
      contentType: "image/png",
    });
  });

  test("视频画布点击只保持模块属性，上传只能从属性面板发起", async ({ page }) => {
    const inspector = await openHeroInspector(
      page,
      { width: 1912, height: 955 },
      makeVideoDraft(),
    );
    await page.evaluate(() => {
      const probeWindow = window as Window & { __inspectorFileInputClicks?: number };
      probeWindow.__inspectorFileInputClicks = 0;
      document.addEventListener("click", (event) => {
        if (event.target instanceof HTMLInputElement && event.target.type === "file") {
          probeWindow.__inspectorFileInputClicks = (probeWindow.__inspectorFileInputClicks ?? 0) + 1;
        }
      }, true);
    });

    await activatePageModuleHost(page, "inspector-context-video");

    const posterField = field(inspector, "posterUrl");
    await expect(inspector.locator(".is-visual-selected")).toHaveCount(0);
    await expect(posterField.locator("[data-media-field]")).not.toBeFocused();
    await page.evaluate(() => new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
    }));
    expect(await page.evaluate(() => (
      window as Window & { __inspectorFileInputClicks?: number }
    ).__inspectorFileInputClicks ?? 0)).toBe(0);

    const chooser = page.waitForEvent("filechooser");
    await posterField.getByRole("button", { name: "上传图片" }).click();
    await (await chooser).setFiles([]);
    expect(await page.evaluate(() => (
      window as Window & { __inspectorFileInputClicks?: number }
    ).__inspectorFileInputClicks ?? 0)).toBe(1);
  });

  for (const viewport of [
    { name: "桌面", width: 1600, height: 1000 },
    { name: "移动窄屏", width: 390, height: 844 },
  ]) {
    test(`${viewport.name}页面目标即时拒绝未登记路径并接受页面查询参数`, async ({ page }) => {
      const inspector = await openHeroInspector(page, viewport);
      await expect(
        inspector.getByRole("combobox", { name: "选择编辑对象" }),
      ).toHaveCount(0);

      const pageTarget = inspector.locator('input[list^="link-target-pages-"]');
      const pageTargetError = inspector.getByRole("alert").filter({
        hasText: "该路径不是可发布的公开页面",
      });
      await expect(pageTarget).toBeVisible();
      await pageTarget.fill("/not-a-route");
      await expect(pageTarget).toHaveAttribute("aria-invalid", "true");
      await expect(pageTargetError).toContainText(
        "该路径不是可发布的公开页面",
      );

      await pageTarget.fill("/catalog?category=12");
      await expect(pageTarget).toHaveAttribute("aria-invalid", "false");
      await expect(pageTargetError).toHaveCount(0);
    });
  }

  test("商品模板画布点击只保持模块级属性面板", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await mockEditorApis(page, makeFeaturedProductDraft());
    await authenticateAdmin(page);
    await page.goto("/admin/editor/home");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();

    const inspector = page.getByRole("region", { name: "属性面板" });
    if (!(await inspector.isVisible())) await page.getByRole("button", { name: "展开属性面板" }).click();
    await expect(inspector).toHaveAttribute("data-module-type", "单品焦点推荐");
    const productModule = pageModuleHost(page, "inspector-context-product");
    await expect(productModule).toBeVisible();
    await activatePageModuleHost(page, "inspector-context-product");
    await expect(
      inspector.getByRole("combobox", { name: "选择编辑对象" }),
    ).toHaveCount(0);
    await expect(inspector.locator(".is-visual-selected")).toHaveCount(0);
    await expect(inspector.getByRole("region", { name: "当前编辑对象" }))
      .toContainText("全部内容");
    for (const key of [
      "productCode",
      "eyebrow",
      "title",
      "summary",
      "primaryText",
      "secondaryText",
      "secondaryLinkTarget",
      "showPrice",
    ]) {
      await expect(field(inspector, key), `商品模板顶层字段 ${key} 应同时可见`).toHaveCount(1);
    }
  });

  test("页面属性面板只保留实例内容，不再提供模板结构设计入口", async ({ page }) => {
    const inspector = await openHeroInspector(page);
    await expect(
      page.getByRole("button", { name: "模板设计", exact: true }),
    ).toBeVisible();
    await expect(inspector.getByRole("region", { name: "当前编辑对象" })).toContainText("全部内容");
    await expect(inspector.getByRole("button", { name: "另存到模板库" })).toHaveCount(0);
    await expect(inspector.getByText("布局与比例", { exact: true })).toHaveCount(0);
    await expect(
      inspector.getByRole("combobox", { name: "选择编辑对象" }),
    ).toHaveCount(0);
    await expect(field(inspector, "desktopImage")).toHaveCount(1);
    await expect(field(inspector, "altText")).toHaveCount(1);
    await expect(inspector).toHaveAttribute("data-panel-mode", "content");
  });

  test("旧页面 Inspector 模板模式已移除，模板设计只从独立工作区进入", async ({ page }) => {
    const maximumDepthErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" && message.text().includes("Maximum update depth exceeded")) {
        maximumDepthErrors.push(message.text());
      }
    });
    const inspector = await openHeroInspector(page, { width: 1440, height: 1100 });

    await expect(page.getByRole("region", { name: "模板内部对象" })).toHaveCount(0);
    await expect(inspector.getByRole("region", { name: "当前编辑对象" })).toContainText("全部内容");
    await expect(inspector.getByRole("combobox", { name: "选择编辑对象" })).toHaveCount(0);
    await expect(inspector.locator(".homepage-editor__template-navigator")).toHaveCount(0);
    await expect(field(inspector, "desktopImage")).toHaveCount(1);
    await expect(field(inspector, "altText")).toHaveCount(1);

    await page.getByRole("button", { name: "模板设计", exact: true }).click();
    await expect(page.getByRole("complementary", { name: "模板组件库" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "模板结构" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "模板属性工作区" })).toBeVisible();
    await expect(page.getByRole("region", { name: /模板设计画布/ })).toBeVisible();
    expect(maximumDepthErrors, "进入独立模板工作区不得触发 React 更新循环").toEqual([]);
  });

  test("切换独立模板工作区后返回页面装修可恢复图层选择和滚动位置", async ({ page }) => {
    const inspector = await openHeroInspector(
      page,
      { width: 1440, height: 820 },
      makeScrollableLayerDraft(),
    );
    const scroll = page.locator(".homepage-editor__layer-scroll");
    const layers = page.locator(".homepage-editor__layer-item");
    await layers.first().locator(".homepage-editor__layer-select").click();
    await expect(inspector).toHaveAttribute("data-module-type", "首屏主视觉");
    await scroll.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await layers.nth(12).locator(".homepage-editor__layer-select").click({ modifiers: ["Control"] });
    await layers.nth(13).locator(".homepage-editor__layer-select").click({ modifiers: ["Control"] });
    await expect(page.locator(".homepage-editor__layer-item.is-multi-selected")).toHaveCount(2);
    await expect(layers.first()).toHaveClass(/is-active/);
    const beforeScroll = await scroll.evaluate((element) => element.scrollTop);
    expect(beforeScroll).toBeGreaterThan(0);

    await expect(page.getByRole("region", { name: "模板内部对象" })).toHaveCount(0);
    await page.getByRole("button", { name: "模板设计", exact: true }).click();
    await expect(page.getByRole("complementary", { name: "模板结构" })).toBeVisible();
    await page.getByRole("button", { name: "页面装修", exact: true }).click();
    await expect(page.getByRole("region", { name: "模板内部对象" })).toHaveCount(0);

    await expect(page.locator(".homepage-editor__layer-item.is-multi-selected")).toHaveCount(2);
    await expect(layers.first()).toHaveClass(/is-active/);
    await expect.poll(async () => scroll.evaluate((element) => element.scrollTop)).toBeCloseTo(beforeScroll, 0);
  });

  test("页面内不再开放母模板几何，独立模板工作区提供双端布局入口", async ({ page }) => {
    const inspector = await openHeroInspector(page);
    await expect(inspector.getByRole("combobox", { name: "选择编辑对象" })).toHaveCount(0);
    await expect(inspector.getByRole("spinbutton", { name: /横向位置/ })).toHaveCount(0);
    await expect(inspector.getByRole("group", { name: /图层顺序/ })).toHaveCount(0);
    await expect(field(inspector, "desktopImage")).toHaveCount(1);

    await page.getByRole("button", { name: "模板设计", exact: true }).click();
    await expect(page.getByRole("region", { name: /模板设计画布/ })).toBeVisible();
    const templateInspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    await expect(templateInspector.getByRole("region", { name: "模板属性功能区" })).toBeVisible();
    await expect(templateInspector.getByRole("group", { name: "模板尺寸", exact: true })).toBeVisible();
    await page.getByRole("complementary", { name: "模板结构" })
      .getByRole("treeitem", { name: /^响应式区域/ })
      .click();
    await expect(templateInspector.getByRole("group", { name: "布局样式", exact: true })).toBeVisible();
    const layoutChoices = templateInspector.getByRole("group", { name: "布局方式", exact: true });
    await expect(layoutChoices).toBeVisible();
    await expect(layoutChoices.locator('button[aria-pressed="true"]')).toHaveCount(1);
    await layoutChoices.getByRole("button", { name: "布局方式：自然" }).click();
    await expect(layoutChoices.getByRole("button", { name: "布局方式：自然" })).toHaveAttribute("aria-pressed", "true");
    await layoutChoices.getByRole("button", { name: "布局方式：弹性" }).click();
    await expect(layoutChoices.getByRole("button", { name: "布局方式：弹性" })).toHaveAttribute("aria-pressed", "true");
    await layoutChoices.getByRole("button", { name: "布局方式：自然" }).click();
    await page.getByRole("complementary", { name: "模板结构" })
      .getByRole("treeitem", { name: /^首屏 模板/ })
      .click();
    const backgroundChoices = templateInspector.getByRole("group", { name: "默认背景", exact: true });
    await backgroundChoices.getByRole("button", { name: "默认背景：柔灰" }).click();
    await expect(backgroundChoices.getByRole("button", { name: "默认背景：柔灰" })).toHaveAttribute("aria-pressed", "true");
    await backgroundChoices.getByRole("button", { name: "默认背景：白色" }).click();
    await page.getByRole("button", { name: /移动端模板布局/ }).click();
    await expect(page.getByRole("button", { name: /移动端模板布局/ })).toHaveAttribute("aria-pressed", "true");
    await expect(templateInspector.getByText("移动端", { exact: true })).toBeVisible();
  });

  test("页面内不再开放母模板对象控件，独立模板属性按任务分区", async ({ page }) => {
    const inspector = await openHeroInspector(page);
    await expect(inspector.getByRole("group", { name: "桌面主图比例" })).toHaveCount(0);
    await expect(inspector.getByRole("button", { name: "高级设置" })).toHaveCount(0);
    await expect(field(inspector, "desktopImage")).toHaveCount(1);
    await expect(field(inspector, "altText")).toHaveCount(1);

    await page.getByRole("button", { name: "模板设计", exact: true }).click();
    const templateInspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    await expect(templateInspector.getByRole("region", { name: "模板属性功能区" })).toBeVisible();
    await expect(templateInspector.getByRole("group", {
      name: /^(模板信息|模板尺寸|发布设置)$/,
    })).toHaveCount(3);
    await expect(templateInspector.locator("details, summary")).toHaveCount(0);
  });

  test("页面 Inspector 为单一实例内容面板，键盘从顶部模式按钮进入和退出模板工作区", async ({ page }) => {
    const inspector = await openHeroInspector(page);
    await expect(inspector.getByRole("region", { name: "当前编辑对象" })).toContainText("全部内容");
    await expect(inspector.getByRole("combobox", { name: "选择编辑对象" })).toHaveCount(0);
    await expect(field(inspector, "desktopImage")).toHaveCount(1);

    const pageWorkspaceContext = page.getByRole("group", { name: "店铺装修工作模式切换" });
    await expect(pageWorkspaceContext.getByLabel("当前工作区：页面装修")).toBeVisible();
    await expect(pageWorkspaceContext).not.toContainText("编辑当前页面");
    await expect(pageWorkspaceContext.getByRole("button", { name: "页面装修", exact: true }))
      .toHaveAttribute("aria-pressed", "true");
    const enterTemplate = page.getByRole("button", { name: "模板设计", exact: true });
    await enterTemplate.focus();
    await expect(enterTemplate).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("complementary", { name: "模板结构" })).toBeVisible();

    const templateWorkspaceContext = page.getByRole("group", { name: "店铺装修工作模式切换" });
    await expect(templateWorkspaceContext.getByLabel("当前工作区：模板设计")).toBeVisible();
    await expect(templateWorkspaceContext).not.toContainText("编辑全站母模板");
    await expect(templateWorkspaceContext.getByRole("button", { name: "模板设计", exact: true }))
      .toHaveAttribute("aria-pressed", "true");
    const returnToPage = page.getByRole("button", { name: "页面装修", exact: true });
    await returnToPage.focus();
    await expect(returnToPage).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(inspector).toBeVisible();
    await expect(field(inspector, "desktopImage")).toHaveCount(1);
    await expect(page.getByLabel("当前工作区：页面装修")).toBeVisible();
  });

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1280, height: 720 },
    { width: 1600, height: 1000 },
  ]) {
    test(`${viewport.width}x${viewport.height} 属性栏可滚动且无横向溢出`, async ({
      page,
    }) => {
      const inspector = await openHeroInspector(page, viewport);
      const scroll = inspector.locator('[data-inspector-scroll="main"]');
      const objectContext = inspector.getByRole("region", {
        name: "当前编辑对象",
      });
      await expect(inspector).toHaveAttribute(
        "data-inspector-root",
        "visual-properties",
      );
      await expect(
        inspector.getByRole("button", { name: "保存整页草稿" }),
      ).toHaveCount(0);
      await expect(inspector.locator(".homepage-editor__properties-actions")).toBeVisible();
      await expect(inspector.locator(".homepage-editor__properties-actions")).not.toContainText("手机端");
      await expect(inspector.locator(".homepage-editor__properties-actions")).not.toContainText("桌面端");
      await expect(
        inspector.getByRole("combobox", { name: "选择编辑对象" }),
      ).toHaveCount(0);
      await expect(objectContext).toContainText("全部内容");

      const inspectorBox = await inspector.boundingBox();
      const initialContextBox = await objectContext.boundingBox();
      if (!inspectorBox || !initialContextBox) {
        throw new Error("属性面板或对象摘要没有布局尺寸");
      }
      expect(inspectorBox.x).toBeGreaterThanOrEqual(0);
      expect(inspectorBox.x + inspectorBox.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(initialContextBox.x).toBeGreaterThanOrEqual(inspectorBox.x - 1);
      expect(initialContextBox.x + initialContextBox.width).toBeLessThanOrEqual(
        inspectorBox.x + inspectorBox.width + 1,
      );

      const before = await scroll.evaluate((element) => ({
        clientHeight: element.clientHeight,
        clientWidth: element.clientWidth,
        scrollHeight: element.scrollHeight,
        scrollWidth: element.scrollWidth,
      }));
      expect(before.scrollHeight).toBeGreaterThan(before.clientHeight);
      expect(before.scrollWidth).toBeLessThanOrEqual(before.clientWidth + 1);
      await scroll.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
      await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

      const finalContextBox = await objectContext.boundingBox();
      if (!finalContextBox) throw new Error("滚动后对象摘要没有布局尺寸");
      expect(Math.abs(finalContextBox.y - initialContextBox.y)).toBeLessThanOrEqual(1);
      expect(finalContextBox.x).toBeGreaterThanOrEqual(inspectorBox.x - 1);
      expect(finalContextBox.x + finalContextBox.width).toBeLessThanOrEqual(
        inspectorBox.x + inspectorBox.width + 1,
      );
    });
  }
});
