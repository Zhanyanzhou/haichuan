import { expect, test, type Locator, type Page } from "@playwright/test";

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

async function mockEditorApis(page: Page, draft = makeHeroDraft()) {
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
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
  await page.goto("/admin/login");
  await page.evaluate(() => {
    const user = {
      id: 1,
      username: "inspector-context-ui-test",
      realName: "属性面板 UI 测试管理员",
      role: "SUPER_ADMIN",
    };
    localStorage.setItem("token", "inspector-context-ui-test-token");
    localStorage.setItem(
      "jewelry-auth",
      JSON.stringify({
        state: {
          token: "inspector-context-ui-test-token",
          user,
          isLoggedIn: true,
        },
        version: 0,
      }),
    );
  });
}

async function openHeroInspector(
  page: Page,
  viewport: { width: number; height: number } = { width: 1600, height: 1000 },
) {
  await page.setViewportSize(viewport);
  await mockEditorApis(page);
  await authenticateAdmin(page);
  await page.goto("/admin/editor/home");
  await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();

  const inspector = page.getByRole("region", { name: "属性面板" });
  if (!(await inspector.isVisible())) {
    await page
      .locator(".homepage-editor__layer-item .homepage-editor__layer-select")
      .first()
      .click();
  }
  await expect(inspector).toBeVisible();
  await expect(inspector).toHaveAttribute("data-module-type", "首屏主视觉");
  return inspector;
}

async function selectObject(inspector: Locator, value: string, label: string) {
  const select = inspector.getByRole("combobox", { name: "选择编辑对象" });
  await select.selectOption(value);
  await expect(select.locator("option:checked")).toHaveText(label);
}

async function setRangeValue(range: Locator, value: number) {
  const current = Number(await range.inputValue());
  const key = value >= current ? "ArrowRight" : "ArrowLeft";
  await range.focus();
  for (let step = 0; step < Math.abs(value - current); step += 1) {
    await range.press(key);
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

  test("属性面板删除确认使用当前 AntD context，不产生静态 API 警告", async ({
    page,
  }) => {
    const antdContextWarnings: string[] = [];
    page.on("console", (message) => {
      if (message.text().includes("Static function can not consume context")) {
        antdContextWarnings.push(message.text());
      }
    });
    const inspector = await openHeroInspector(page);

    await inspector.getByRole("button", { name: "更多模块操作" }).click();
    await page.getByRole("menuitem", { name: "删除模块" }).click();
    const dialog = page.getByRole("dialog").filter({ hasText: "删除“" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "删除模块" }).click();
    await expect(page.locator(".homepage-editor__layer-item")).toHaveCount(0);
    expect(antdContextWarnings).toEqual([]);
  });

  test("图层栏直接显示隐藏并删除模块，仍保持轻量页面导航", async ({ page }) => {
    await openHeroInspector(page);
    const layer = page.locator(".homepage-editor__layer-item").first();
    await expect(layer).toHaveAttribute("data-layer-visible", "true");

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

  test("media / text / action 内容字段严格过滤，返回模块级恢复完整内容", async ({
    page,
  }) => {
    const inspector = await openHeroInspector(page);

    await selectObject(inspector, "desktopImage", "桌面主图");
    await expect(field(inspector, "desktopImage")).toHaveCount(1);
    await expect(field(inspector, "altText")).toHaveCount(1);
    await expect(field(inspector, "title")).toHaveCount(0);
    await expect(field(inspector, "actionText")).toHaveCount(0);
    await expect(field(inspector, "targetType")).toHaveCount(0);
    await expect(inspector.locator('[data-property-level="content"]')).toHaveCount(1);

    await selectObject(inspector, "title", "标题");
    await expect(field(inspector, "title")).toHaveCount(1);
    await expect(field(inspector, "desktopImage")).toHaveCount(0);
    await expect(field(inspector, "altText")).toHaveCount(0);
    await expect(field(inspector, "actionText")).toHaveCount(0);
    await expect(field(inspector, "targetType")).toHaveCount(0);
    await expect(inspector.locator('[data-property-level="content"]')).toHaveCount(1);

    await selectObject(inspector, "actionText", "行动文字");
    await expect(field(inspector, "actionText")).toHaveCount(1);
    await expect(field(inspector, "targetType")).toHaveCount(1);
    await expect(field(inspector, "title")).toHaveCount(0);
    await expect(field(inspector, "desktopImage")).toHaveCount(0);
    await expect(field(inspector, "altText")).toHaveCount(0);
    await expect(inspector.locator('[data-property-level="interaction"]')).toHaveCount(1);

    await inspector
      .getByRole("combobox", { name: "选择编辑对象" })
      .selectOption("");
    await expect(field(inspector, "title")).toHaveCount(1);
    await expect(field(inspector, "actionText")).toHaveCount(1);
    await expect(field(inspector, "targetType")).toHaveCount(1);
    await expect(field(inspector, "desktopImage")).toHaveCount(1);
    await expect(field(inspector, "altText")).toHaveCount(1);
  });

  for (const viewport of [
    { name: "桌面", width: 1600, height: 1000 },
    { name: "移动窄屏", width: 390, height: 844 },
  ]) {
    test(`${viewport.name}页面目标即时拒绝未登记路径并接受页面查询参数`, async ({ page }) => {
      const inspector = await openHeroInspector(page, viewport);
      await selectObject(inspector, "actionText", "行动文字");

      const pageTarget = inspector.locator('input[list^="link-target-pages-"]');
      await expect(pageTarget).toBeVisible();
      await pageTarget.fill("/not-a-route");
      await expect(pageTarget).toHaveAttribute("aria-invalid", "true");
      await expect(inspector.getByRole("alert")).toContainText(
        "该路径不是可发布的公开页面",
      );

      await pageTarget.fill("/catalog?category=12");
      await expect(pageTarget).toHaveAttribute("aria-invalid", "false");
      await expect(inspector.getByRole("alert")).toHaveCount(0);
    });
  }

  test("product 对象只显示商品选择字段，不回退模块级内容", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await mockEditorApis(page, makeFeaturedProductDraft());
    await authenticateAdmin(page);
    await page.goto("/admin/editor/home");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();

    const inspector = page.getByRole("region", { name: "属性面板" });
    if (!(await inspector.isVisible())) {
      await page
        .locator(".homepage-editor__layer-item .homepage-editor__layer-select")
        .first()
        .click();
    }
    await expect(inspector).toHaveAttribute("data-module-type", "单品焦点推荐");
    const productNode = page
      .frameLocator(".homepage-editor__canvas-scale iframe")
      .locator('[data-content-role="product"]:visible')
      .first();
    await expect(productNode).toBeVisible();
    await productNode.click();
    await expect(
      inspector.getByRole("combobox", { name: "选择编辑对象" }),
    ).toHaveValue("product");
    await expect(field(inspector, "productCode")).toHaveCount(1);
    await expect(field(inspector, "title")).toHaveCount(0);
    await expect(field(inspector, "primaryText")).toHaveCount(0);
    await expect(field(inspector, "secondaryText")).toHaveCount(0);
  });

  test("media / text / action 设计区只显示当前对象的真实控制", async ({ page }) => {
    const inspector = await openHeroInspector(page);
    const designTab = inspector.getByRole("tab", { name: "模板编辑" });

    for (const object of [
      { value: "desktopImage", label: "桌面主图" },
      { value: "title", label: "标题" },
      { value: "actionText", label: "行动文字" },
    ]) {
      await inspector.getByRole("tab", { name: "内容编辑" }).click();
      await selectObject(inspector, object.value, object.label);
      await designTab.click();
      const groups = inspector.locator("fieldset.homepage-editor__instance-group");
      await expect(groups).toHaveCount(object.value === "desktopImage" ? 2 : 1);
      await expect(groups.locator("[data-visual-geometry-node]")).toHaveAttribute(
        "data-visual-geometry-node",
        object.value,
      );
      await expect(inspector.locator(`[data-property-level="${object.value === "desktopImage" ? "layout" : "style"}"]`)).toHaveCount(1);
      if (object.value === "desktopImage") {
        await expect(inspector.locator('[data-object-appearance="desktopImage"]')).toBeVisible();
        await expect(inspector.getByRole("group", { name: "对象圆角" })).toBeVisible();
        await expect(inspector.getByRole("group", { name: "对象阴影" })).toBeVisible();
        await expect(inspector.locator('[data-property-level="style"]')).toHaveCount(1);
      }
    }
  });

  test("图层面板保持模块级，模板内部对象在属性面板可视切换", async ({ page }) => {
    const maximumDepthErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" && message.text().includes("Maximum update depth exceeded")) {
        maximumDepthErrors.push(message.text());
      }
    });
    const inspector = await openHeroInspector(page, { width: 1440, height: 900 });

    await expect(page.locator(".homepage-editor__layer-children")).toHaveCount(0);
    const objectPicker = inspector.getByRole("listbox", {
      name: "属性面板对象列表",
    });
    await expect(objectPicker).toBeVisible();

    const desktopImage = objectPicker.getByRole("option", {
      name: "选择桌面主图",
    });
    await desktopImage.click();
    await expect(desktopImage).toHaveAttribute("aria-selected", "true");
    await expect(
      inspector.getByRole("region", { name: "当前编辑对象" }),
    ).toHaveAttribute("data-selected-node-id", "desktopImage");
    await page.waitForTimeout(250);
    expect(
      maximumDepthErrors,
      "选择图片对象不得触发 React 更新循环",
    ).toEqual([]);
    maximumDepthErrors.length = 0;
    await inspector.screenshot({
      path: "test-results/inspector-object-picker.png",
    });

    const wholeTemplate = objectPicker.getByRole("option", {
      name: /选择.*整个模板/,
    });
    await wholeTemplate.click();
    await expect(wholeTemplate).toHaveAttribute("aria-selected", "true");
    await expect(
      inspector.getByRole("region", { name: "当前编辑对象" }),
    ).toHaveAttribute("data-selected-node-id", "module");
    await page.waitForTimeout(250);
    expect(
      maximumDepthErrors,
      "对象选择不得触发 React 更新循环",
    ).toEqual([]);
  });

  test("Desktop / Mobile 使用独立默认与覆盖，并可按设备重置", async ({ page }) => {
    const inspector = await openHeroInspector(page);
    await selectObject(inspector, "title", "标题");
    await inspector.getByRole("tab", { name: "模板编辑" }).click();
    await inspector.getByRole("button", { name: "精确位置与尺寸" }).click();

    const desktopX = inspector.getByRole("slider", {
      name: "横向位置（桌面端）",
    });
    await expect(desktopX).toHaveValue("18");
    await setRangeValue(desktopX, 22);
    const desktopLayer = inspector.getByRole("group", {
      name: "图层顺序（桌面端）",
    });
    await expect(desktopLayer).toContainText("当前层级 4");
    await desktopLayer.getByRole("button", { name: "上移一层" }).click();
    await expect(desktopLayer).toContainText("当前层级 5");

    await page.getByRole("button", { name: /移动端布局/ }).click();
    const mobileGeometry = inspector.locator(
      '[data-visual-geometry-node="title"][data-visual-geometry-viewport="mobile"]',
    );
    await expect(mobileGeometry).toBeVisible();
    const mobileX = inspector.getByRole("slider", {
      name: "横向位置（移动端）",
    });
    await expect(mobileX).toHaveValue("16");
    await expect(inspector.locator('[data-device-state="mobile-default"]')).toBeVisible();
    const mobileLayer = inspector.getByRole("group", {
      name: "图层顺序（移动端）",
    });
    await expect(mobileLayer).toContainText("当前层级 2");

    await setRangeValue(mobileX, 27);
    await mobileLayer.getByRole("button", { name: "上移一层" }).click();
    await expect(mobileLayer).toContainText("当前层级 3");
    await expect(inspector.locator('[data-device-state="mobile-independent"]')).toBeVisible();
    await page.getByRole("button", { name: /桌面端布局/ }).click();
    await expect(desktopX).toHaveValue("22");
    await expect(desktopLayer).toContainText("当前层级 5");
    await page.getByRole("button", { name: /移动端布局/ }).click();
    await expect(mobileX).toHaveValue("27");
    await expect(mobileLayer).toContainText("当前层级 3");

    await inspector.getByRole("button", { name: "恢复移动端默认位置" }).click();
    await expect(mobileX).toHaveValue("16");
    await inspector.getByRole("button", { name: "恢复主标题设计默认" }).click();
    await expect(
      inspector.getByRole("slider", { name: "横向位置（移动端）" }),
    ).toHaveValue("16");
  });

  test("键盘可切换内容/设计并进入对象选择，焦点可见", async ({ page }) => {
    const inspector = await openHeroInspector(page);
    const contentTab = inspector.getByRole("tab", { name: "内容编辑" });
    const designTab = inspector.getByRole("tab", { name: "模板编辑" });

    await contentTab.focus();
    await expect(contentTab).toBeFocused();
    await page.keyboard.press("End");
    await expect(designTab).toBeFocused();
    await expect(designTab).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Home");
    await expect(contentTab).toBeFocused();
    await expect(contentTab).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowRight");
    await expect(designTab).toBeFocused();
    await expect(designTab).toHaveAttribute("aria-selected", "true");

    const objectSelect = inspector.getByRole("combobox", { name: "选择编辑对象" });
    await objectSelect.focus();
    await expect(objectSelect).toBeFocused();
    await expect
      .poll(() =>
        objectSelect.evaluate((element) => getComputedStyle(element).outlineWidth),
      )
      .toBe("2px");
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowDown");
    await expect(objectSelect).toHaveValue("desktopImage");
    await expect(objectSelect.locator("option:checked")).toHaveText("桌面主图");
  });

  for (const viewport of [
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
      await expect(inspector.locator(".homepage-editor__properties-actions")).toHaveCount(0);

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
