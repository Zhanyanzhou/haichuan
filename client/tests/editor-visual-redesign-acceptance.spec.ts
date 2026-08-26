import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

/**
 * 图 1（1672x941）重设计的真实前端验收合同。
 *
 * 证据边界：页面和 Puck iframe 都是真实产品组件；仅自有 API 响应被确定性拦截。
 * 本文件不点击保存/发布，并显式断言没有草稿/发布写请求，因此不能作为真实持久化证明。
 */
const appMode = process.env.PLAYWRIGHT_APP_MODE === "mock" ? "mock" : "development";

const fixtureSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900">
    <rect width="1600" height="900" fill="#dbe1e5"/>
    <path d="M0 760 420 310l240 238 238-306 702 518Z" fill="#82909b"/>
  </svg>
`;

const fixtureAltSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900">
    <rect width="1600" height="900" fill="#f0e3d3"/>
    <circle cx="1220" cy="250" r="170" fill="#bc6c4f"/>
    <path d="M0 820 520 280l280 320 250-210 550 430Z" fill="#334b50"/>
  </svg>
`;

type EditorDraft = Record<string, any>;
type Box = { x: number; y: number; width: number; height: number };

function json(data: unknown) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ code: 200, data, message: "success" }),
  };
}

function makeHeroDraft() {
  return {
    id: 9801,
    pageKey: "home",
    puckData: {
      content: [
        {
          type: "首屏主视觉",
          props: {
            id: "redesign-hero",
            desktopImage: "/svg/redesign-hero.svg",
            mobileImage: "",
            altText: "设计验收雪山图",
            eyebrow: "01 / DESIGN & CRAFT",
            title: "设计与工艺",
            subtitle: "以克制的版式讲述珠宝工艺",
            actionText: "进入珠宝作品",
            targetType: "page",
            linkUrl: "/products",
            desktopFocusX: 50,
            desktopFocusY: 50,
            mobileFocusX: 50,
            mobileFocusY: 50,
            __instanceOverrides: {
              version: 2,
              nodes: {
                title: {
                  rectByViewport: {
                    desktop: { x: 0.2, y: 0.58, width: 0.48, height: 0.16 },
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

function makeProductDraft(): EditorDraft {
  const draft = makeHeroDraft();
  return {
    ...draft,
    id: 9802,
    puckData: {
      ...draft.puckData,
      content: [
        {
          type: "单品焦点推荐",
          props: {
            id: "redesign-product",
            productCode: "HC-QA-001",
            productId: 0,
            eyebrow: "SIGNATURE PIECE",
            title: "单品展示",
            summary: "确定性商品对象",
            primaryText: "查看作品",
            secondaryText: "预约鉴赏",
            secondaryTargetType: "none",
          },
        },
      ],
    },
  } as EditorDraft;
}

function makeMobileOverrideDraft(): EditorDraft {
  const draft = makeHeroDraft();
  const props = draft.puckData.content[0].props;
  return {
    ...draft,
    id: 9806,
    puckData: {
      ...draft.puckData,
      content: [{
        ...draft.puckData.content[0],
        props: {
          ...props,
          __instanceOverrides: {
            ...props.__instanceOverrides,
            nodes: {
              ...props.__instanceOverrides.nodes,
              mobileImage: {
                rectByViewport: {
                  mobile: { x: 0.08, y: 0.04, width: 0.84, height: 0.48 },
                },
              },
            },
          },
        },
      }],
    },
  };
}

function makeModuleDraft(id: number, type: string, props: Record<string, unknown>): EditorDraft {
  const draft = makeHeroDraft();
  return {
    ...draft,
    id,
    puckData: {
      ...draft.puckData,
      content: [{ type, props }],
    },
  };
}

function makeDoublePosterDraft() {
  return makeModuleDraft(9803, "双图海报", {
    id: "redesign-double-poster",
    mainImage: "/svg/redesign-hero.svg",
    detailImage: "/svg/redesign-hero-alt.svg",
    mainAltText: "主海报替代文字",
    detailAltText: "细节海报替代文字",
    title: "双图工艺叙事",
    description: "主图建立情绪，细节图说明工艺。",
    number: "02",
    label: "CRAFT",
    actionText: "查看工艺",
    targetType: "page",
    linkUrl: "/custom",
  });
}

function makeDoublePosterWithSiblingDraft() {
  const draft = makeDoublePosterDraft();
  const sibling = makeHeroDraft().puckData.content[0];
  return {
    ...draft,
    puckData: {
      ...draft.puckData,
      content: [
        ...draft.puckData.content,
        {
          ...sibling,
          props: {
            ...sibling.props,
            id: "redesign-hero-sibling",
          },
        },
      ],
    },
  };
}

function makeVideoDraft() {
  return makeModuleDraft(9804, "视频区块", {
    id: "redesign-video",
    videoUrl: "",
    posterUrl: "/svg/redesign-hero.svg",
    title: "视频工艺故事",
    subtitle: "确定性封面与播放设置",
    actionText: "观看影片",
    targetType: "page",
    linkUrl: "/about",
    autoPlay: false,
    loop: false,
    muted: true,
    showControls: true,
  });
}

function makeCollectionDraft() {
  return makeModuleDraft(9805, "作品画廊", {
    id: "redesign-gallery",
    title: "本季作品",
    subtitle: "确定性集合内容",
    items: [1, 2, 3].map((index) => ({
      image: index === 2 ? "/svg/redesign-hero-alt.svg" : "/svg/redesign-hero.svg",
      altText: `作品 ${index}`,
      caption: `FIG. 0${index}`,
      linkTarget: { targetType: "none" },
      focusX: 50,
      focusY: 50,
    })),
  });
}

async function authenticateAdmin(page: Page) {
  await page.goto("/admin/login");
  await page.evaluate(() => {
    const user = {
      id: 1,
      username: "editor-redesign-qa",
      realName: "视觉编辑器 QA",
      role: "SUPER_ADMIN",
    };
    localStorage.setItem("token", "editor-redesign-qa-token");
    localStorage.setItem(
      "jewelry-auth",
      JSON.stringify({ state: { token: "editor-redesign-qa-token", user, isLoggedIn: true }, version: 0 }),
    );
  });
}

async function mockEditorApis(page: Page, draft: EditorDraft, forbiddenWrites: string[]) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = request.url();
    const pathname = new URL(url).pathname;
    if (
      ["POST", "PUT", "PATCH", "DELETE"].includes(request.method()) &&
      /\/page-modules\/document(?:\/publish|\/draft)?$/.test(pathname)
    ) {
      forbiddenWrites.push(`${request.method()} ${pathname}`);
      return route.fulfill({ status: 409, contentType: "application/json", body: "{}" });
    }
    if (url.includes("/page-modules/document/validate")) {
      return route.fulfill(json({ valid: true, errors: [], issues: [] }));
    }
    if (url.includes("/page-modules/document/revisions")) return route.fulfill(json([]));
    if (url.includes("/page-modules/document/published")) return route.fulfill(json(null));
    if (url.includes("/page-modules/document/admin")) return route.fulfill(json(draft));
    if (url.includes("/products/admin/resolve-references")) {
      return route.fulfill(json([{
        id: 1,
        code: "HC-QA-001",
        name: "确定性商品作品",
        thumbnail: "/svg/redesign-hero.svg",
        status: "PUBLISHED",
        visibility: "PUBLIC",
        eligible: true,
        reason: "AVAILABLE",
      }]));
    }
    return route.fulfill(json({}));
  });
  await page.route("**/svg/redesign-hero.svg", (route) =>
    route.fulfill({ status: 200, contentType: "image/svg+xml", body: fixtureSvg }),
  );
  await page.route("**/svg/redesign-hero-alt.svg", (route) =>
    route.fulfill({ status: 200, contentType: "image/svg+xml", body: fixtureAltSvg }),
  );
}

async function openEditor(
  page: Page,
  options: {
    viewport?: { width: number; height: number };
    draft?: EditorDraft;
    forbiddenWrites: string[];
  },
) {
  await page.setViewportSize(options.viewport ?? { width: 1672, height: 941 });
  await mockEditorApis(page, options.draft ?? makeHeroDraft(), options.forbiddenWrites);
  await authenticateAdmin(page);
  await page.goto("/admin/editor/home");
  await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
  const frame = page.frameLocator(".homepage-editor__canvas-scale iframe");
  await expect(frame.locator("[data-content-template-module]").first()).toBeVisible();
  const layerSelect = page.locator(".homepage-editor__layer-item .homepage-editor__layer-select").first();
  if (await layerSelect.isVisible()) {
    await layerSelect.click();
  } else {
    await frame.locator("[data-hc-keyboard-node]:visible").first().click();
  }
  const inspector = page.locator('[data-inspector-root="visual-properties"]');
  await expect(inspector).toBeVisible();
  return { frame, inspector };
}

async function attachViewport(page: Page, testInfo: TestInfo, name: string) {
  const screenshotPath = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path: screenshotPath, animations: "disabled" });
  await testInfo.attach(name, {
    path: screenshotPath,
    contentType: "image/png",
  });
}

async function expectInside(outer: Box, inner: Box) {
  expect(inner.x).toBeGreaterThanOrEqual(outer.x - 1);
  expect(inner.y).toBeGreaterThanOrEqual(outer.y - 1);
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width + 1);
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height + 1);
}

async function frameBoxes(page: Page) {
  const selectors = [
    ".homepage-editor__library",
    ".homepage-editor__structure-workspace",
    ".homepage-editor__stage",
    ".homepage-editor__right-workspace",
  ];
  const boxes: Box[] = [];
  for (const selector of selectors) {
    const box = await page.locator(selector).boundingBox();
    if (!box) throw new Error(`四框架缺少布局尺寸：${selector}`);
    boxes.push(box);
  }
  return boxes;
}

function expectBoxesStable(before: Box[], after: Box[]) {
  expect(after).toHaveLength(before.length);
  for (let index = 0; index < before.length; index += 1) {
    for (const key of ["x", "y", "width", "height"] as const) {
      expect(Math.abs(after[index][key] - before[index][key])).toBeLessThanOrEqual(1);
    }
  }
}

function relativeBox(outer: Box, inner: Box): Box {
  return {
    x: inner.x - outer.x,
    y: inner.y - outer.y,
    width: inner.width,
    height: inner.height,
  };
}

function expectBoxNear(actual: Box, expected: Box, tolerance = 4) {
  for (const key of ["x", "y", "width", "height"] as const) {
    expect(Math.abs(actual[key] - expected[key])).toBeLessThanOrEqual(tolerance);
  }
}

async function selectObject(inspector: Locator, value: string) {
  await inspector.getByRole("combobox", { name: "选择编辑对象" }).selectOption(value);
  await expect(inspector.getByRole("combobox", { name: "选择编辑对象" })).toHaveValue(value);
}

async function setRangeValue(locator: Locator, value: number) {
  await locator.evaluate((element, nextValue) => {
    const input = element as HTMLInputElement;
    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    if (!nativeSetter) throw new Error("浏览器缺少 HTMLInputElement.value setter");
    nativeSetter.call(input, String(nextValue));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

test.describe("图 1 视觉编辑器验收（真实前端 + 确定性自有 API）", () => {
  test.skip(appMode === "mock", "本验收在 development 模式拦截自有 API；不证明真实保存或发布");

  test("1672x941 四框顺序与边界不因对象、HUD、页签或设备切换改变", async ({ page }, testInfo) => {
    const forbiddenWrites: string[] = [];
    const { frame, inspector } = await openEditor(page, { forbiddenWrites });
    const editorBody = page.locator(".homepage-editor__body");
    const domOrder = await editorBody.locator(":scope > *").evaluateAll((children) =>
      children.flatMap((element) => {
        if (element.classList.contains("homepage-editor__library")) return ["library"];
        if (element.classList.contains("homepage-editor__structure-workspace")) return ["layers"];
        if (element.classList.contains("homepage-editor__stage")) return ["canvas"];
        if (element.classList.contains("homepage-editor__right-workspace")) return ["inspector"];
        return [];
      }),
    );
    expect(domOrder).toEqual(["library", "layers", "canvas", "inspector"]);

    const before = await frameBoxes(page);
    const image = frame.locator('[data-content-role-desktop="desktopImage"] img:visible').first();
    await image.click();
    await expect(inspector.getByRole("region", { name: "当前编辑对象" })).toHaveAttribute(
      "data-selected-node-id",
      "desktopImage",
    );
    expectBoxesStable(before, await frameBoxes(page));
    await inspector.getByRole("tab", { name: "模板编辑" }).click();
    expectBoxesStable(before, await frameBoxes(page));
    const root = frame.locator('[data-content-template-module="首屏主视觉"]').first();
    const hud = root.locator('[data-hc-node-hud][data-node-id="desktopImage"][data-node-kind="media"]');
    await expect(hud).toBeVisible();
    await hud.getByRole("button", { name: "调整对象区域" }).click();
    expectBoxesStable(before, await frameBoxes(page));
    await attachViewport(page, testInfo, "source-aligned-1672x941");
    await page.getByRole("button", { name: /移动端布局/ }).click();
    expectBoxesStable(before, await frameBoxes(page));
    expect(forbiddenWrites).toEqual([]);
  });

  test("模板库按合同商业目的分组，不依赖手写分类猜测", async ({ page }) => {
    const forbiddenWrites: string[] = [];
    await openEditor(page, { forbiddenWrites });
    const expectedGroups = [
      ["品牌展示", "首屏主视觉"],
      ["商品销售", "单品焦点推荐"],
      ["活动转化", "预约入口"],
      ["内容传播", "单图海报"],
      ["信任建立", "卡片网格"],
    ] as const;

    for (const [purpose, moduleType] of expectedGroups) {
      const section = page.locator(`section[aria-labelledby="template-group-${purpose}"]`);
      await expect(section.getByRole("heading", { name: purpose, exact: true })).toBeVisible();
      await expect(section.locator(`[data-template-name="${moduleType}"]`)).toHaveCount(1);
    }
    expect(forbiddenWrites).toEqual([]);
  });

  test("公开媒体替代文字在 Inspector 中与合同发布门禁一致标为必填", async ({ page }) => {
    const forbiddenWrites: string[] = [];
    const { inspector } = await openEditor(page, {
      draft: makeDoublePosterDraft(),
      forbiddenWrites,
    });

    for (const [nodeId, fieldKey] of [
      ["mainImage", "mainAltText"],
      ["detailImage", "detailAltText"],
    ] as const) {
      await selectObject(inspector, nodeId);
      const field = inspector.locator(`[data-inspector-field="${fieldKey}"]`);
      await expect(field).toBeVisible();
      await expect(field.locator("label")).toContainText("必填");
    }
    expect(forbiddenWrites).toEqual([]);
  });

  test("集合媒体条目替代文字在 Inspector 中标为必填", async ({ page }) => {
    const forbiddenWrites: string[] = [];
    const { inspector } = await openEditor(page, {
      draft: makeCollectionDraft(),
      forbiddenWrites,
    });

    await selectObject(inspector, "works");
    const altField = inspector.locator(".homepage-editor__item-fields .homepage-editor__inspector-field")
      .filter({ hasText: "替代文字" });
    await expect(altField).toHaveCount(1);
    await expect(altField.locator("label")).toContainText("必填");
    expect(forbiddenWrites).toEqual([]);
  });

  test("内容编辑保留真实画面，模板编辑才显示图片与文字槽位", async ({ page }, testInfo) => {
    const forbiddenWrites: string[] = [];
    const { frame, inspector } = await openEditor(page, {
      forbiddenWrites,
      viewport: { width: 1920, height: 1200 },
    });
    const root = frame.locator('[data-content-template-module="首屏主视觉"]').first();
    const image = root.locator('[data-content-role-desktop="desktopImage"] img').first();

    await expect(root).toHaveAttribute("data-visual-panel-mode", "content");
    await expect(image).toBeVisible();
    await image.click();
    await expect(root).toHaveAttribute("data-visual-selected-node", "desktopImage");
    await expect(image).toBeVisible();
    await expect(image).toHaveCSS("visibility", "visible");
    await expect(image).toHaveCSS("opacity", "1");
    await attachViewport(page, testInfo, "content-mode-keeps-real-canvas-1920x1200");

    await inspector.getByRole("tab", { name: "模板编辑" }).click();
    await expect(root).toHaveAttribute("data-visual-panel-mode", "design");
    const mediaSlot = root.locator('[data-hc-template-slot-kind="media"][data-hc-keyboard-node="desktopImage"]');
    const titleSlot = root.locator('[data-hc-template-slot-kind="text"][data-hc-keyboard-node="title"]');
    await expect(mediaSlot).toHaveAttribute("data-hc-template-slot-label", "图片槽位");
    await expect(titleSlot).toHaveAttribute("data-hc-template-slot-label", "文字槽位");
    await expect(mediaSlot).toHaveCSS("background-color", "rgb(221, 225, 226)");
    await expect(mediaSlot).toHaveCSS("opacity", "1");
    const mediaSlotBox = await mediaSlot.boundingBox();
    expect(mediaSlotBox?.width ?? 0).toBeGreaterThan(500);
    expect(mediaSlotBox?.height ?? 0).toBeGreaterThan(300);
    await expect(image).toHaveCSS("visibility", "visible");
    await expect(image).toHaveCSS("opacity", "0");
    await expect(titleSlot).toHaveCSS("color", "rgba(0, 0, 0, 0)");
    await expect(titleSlot).toHaveCSS("outline-style", "dashed");
    await expect.poll(() => mediaSlot.evaluate((element) =>
      getComputedStyle(element, "::after").content,
    )).toContain("图片槽位");
    await expect.poll(() => titleSlot.evaluate((element) =>
      getComputedStyle(element, "::after").content,
    )).toContain("文字槽位");
    const mediaLabelBox = await mediaSlot.evaluate((element) => {
      const style = getComputedStyle(element, "::after");
      return {
        width: Number.parseFloat(style.width),
        height: Number.parseFloat(style.height),
        inset: [style.top, style.right, style.bottom, style.left],
        background: style.backgroundColor,
      };
    });
    expect(mediaLabelBox.width, JSON.stringify(mediaLabelBox)).toBeLessThan(240);
    expect(mediaLabelBox.height, JSON.stringify(mediaLabelBox)).toBeLessThan(100);
    const mediaSlotOverlay = root.locator('[data-hc-template-slot-box][data-node-id="desktopImage"]');
    const titleSlotOverlay = root.locator('[data-hc-template-slot-box][data-node-id="title"]');
    await expect(mediaSlotOverlay).toContainText("图片槽位");
    await expect(titleSlotOverlay).toContainText("文字槽位");
    await expect(mediaSlotOverlay).toHaveCSS("background-color", "rgb(221, 225, 226)");
    await page.evaluate(() => new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    ));
    await attachViewport(page, testInfo, "template-mode-shows-slots-1920x1200");

    await inspector.getByRole("tab", { name: "内容编辑" }).click();
    await expect(root).toHaveAttribute("data-visual-panel-mode", "content");
    await expect(image).toHaveCSS("visibility", "visible");
    await expect(image).toHaveCSS("opacity", "1");
    expect(forbiddenWrites).toEqual([]);
  });

  test("双图文的模板编辑辅助层只作用于当前模块", async ({ page }) => {
    const forbiddenWrites: string[] = [];
    const { frame, inspector } = await openEditor(page, {
      forbiddenWrites,
      draft: makeDoublePosterWithSiblingDraft(),
      viewport: { width: 1920, height: 1200 },
    });
    const selectedRoot = frame.locator('[data-content-template-module="双图海报"]').first();
    const siblingRoot = frame.locator('[data-content-template-module="首屏主视觉"]').first();
    const siblingImage = siblingRoot.locator('[data-content-role-desktop="desktopImage"] img').first();

    await selectedRoot.locator('[data-hc-keyboard-node="mainImage"]:visible').click();
    await inspector.getByRole("tab", { name: "模板编辑" }).click();

    await expect(selectedRoot).toHaveAttribute("data-visual-panel-mode", "design");
    await expect(selectedRoot.locator("[data-hc-template-slot-box]").first()).toBeVisible();
    await expect(siblingRoot).toHaveAttribute("data-visual-panel-mode", "content");
    await expect(siblingRoot.locator("[data-hc-template-slot-box]")).toHaveCount(0);
    await expect(siblingImage).toHaveCSS("opacity", "1");
    await expect(
      frame.locator('[data-content-template-module][data-visual-panel-mode="design"]'),
    ).toHaveCount(1);

    await selectedRoot
      .locator('[data-hc-node-hud][data-node-id="mainImage"]')
      .getByRole("button", { name: "调整对象区域" })
      .click();
    await expect(selectedRoot).toHaveAttribute("data-visual-editor-mode", "adjust-layout");
    await expect(selectedRoot.locator("[data-hc-layout-grid]")).toBeVisible();
    await expect(siblingRoot).toHaveAttribute("data-visual-editor-mode", "select");
    await expect(siblingRoot.locator("[data-hc-layout-grid]")).toHaveCount(0);
    expect(forbiddenWrites).toEqual([]);
  });

  test("HUD 键盘可达且 8 个方向手柄对当前 node 唯一命中", async ({ page }) => {
    const forbiddenWrites: string[] = [];
    const { frame } = await openEditor(page, { forbiddenWrites });
    const root = frame.locator('[data-content-template-module="首屏主视觉"]').first();
    const title = frame.locator('[data-hc-keyboard-node="title"]:visible').first();
    await title.focus();
    await title.click();
    await expect(title).toBeFocused();
    const hud = root.locator('[data-hc-node-hud][data-node-id="title"][data-node-kind="text"]');
    await expect(root.locator("[data-hc-node-hud]")).toHaveCount(1);
    const adjust = hud.getByRole("button", { name: "调整对象区域" });
    await adjust.focus();
    await expect(adjust).toBeFocused();
    await adjust.press("Enter");

    const handles = root.locator('button[data-hc-resize-handle][data-node-id="title"]');
    await expect(handles).toHaveCount(8);
    expect(
      await handles.evaluateAll((elements) =>
        elements.map((element) => element.getAttribute("data-resize-direction")).sort(),
      ),
    ).toEqual(["e", "n", "ne", "nw", "s", "se", "sw", "w"]);
    expect(
      await handles.evaluateAll((elements) =>
        elements.every((element) => {
          const box = element.getBoundingClientRect();
          return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === element;
        }),
      ),
    ).toBe(true);
    for (const direction of ["n", "ne", "e", "se", "s", "sw", "w", "nw"]) {
      await expect(
        root.locator(
          `button[data-hc-resize-handle][data-node-id="title"][data-resize-direction="${direction}"]`,
        ),
      ).toHaveCount(1);
    }
    expect(forbiddenWrites).toEqual([]);
  });

  test("移动、八向缩放均受模块边界约束，吸附可见且一次提交只需一次撤销", async ({ page }, testInfo) => {
    const forbiddenWrites: string[] = [];
    const { frame } = await openEditor(page, { forbiddenWrites });
    const root = frame.locator('[data-content-template-module="首屏主视觉"]').first();
    const title = frame.locator('[data-hc-keyboard-node="title"]:visible').first();
    await title.click();
    await root.locator('[data-hc-node-hud][data-node-id="title"]').getByRole("button", {
      name: "调整对象区域",
    }).click();
    await expect(root).toHaveAttribute("data-visual-editor-mode", "adjust-layout");
    await expect(root).toHaveAttribute("data-visual-panel-mode", "design");
    const layoutGrid = root.locator("[data-hc-layout-grid]");
    await expect(layoutGrid).toBeVisible();
    await expect(layoutGrid).toHaveCSS("background-size", /12/);
    await attachViewport(page, testInfo, "layout-grid-adjustment-1672x941");
    await expect(
      root.locator('button[data-hc-resize-handle][data-node-id="title"]'),
    ).toHaveCount(8);
    const selectionBox = root.locator('[data-hc-selection-box][data-node-id="title"]');
    const rootBox = await root.boundingBox();
    const initial = await selectionBox.boundingBox();
    if (!rootBox || !initial) throw new Error("模块或标题缺少布局尺寸");
    const initialRelative = relativeBox(rootBox, initial);
    const instanceStyle = root.locator("style[data-hc-instance-overrides]");
    const initialCss = await instanceStyle.textContent();

    const undo = page.getByRole("button", { name: "撤销" });
    await page.mouse.move(initial.x + initial.width / 2, initial.y + initial.height / 2);
    await page.mouse.down();
    await page.mouse.move(rootBox.x + 2, rootBox.y + 2, { steps: 12 });
    await expect(root).toHaveAttribute("data-hc-snap-active", "true");
    await expect(root.locator("[data-hc-snap-guide]").first()).toBeVisible();
    const geometryHint = root.locator("[data-hc-geometry-hint]");
    await expect(geometryHint).toBeVisible();
    await expect(geometryHint).toHaveAttribute("data-hc-gesture-state", "update");
    await expect(geometryHint).toContainText(/间距 L \d+ · T \d+ · R \d+ · B \d+/);
    await expect(geometryHint).toContainText(/\d+ × \d+/);
    await page.mouse.up();
    await expect.poll(() => instanceStyle.textContent()).not.toBe(initialCss);
    await expectInside(rootBox, (await selectionBox.boundingBox()) as Box);
    await undo.click();
    await expect.poll(() => instanceStyle.textContent()).toBe(initialCss);
    const restoredRoot = await root.boundingBox();
    const restoredTitle = await selectionBox.boundingBox();
    if (!restoredRoot || !restoredTitle) throw new Error("撤销后模块或标题缺少布局尺寸");
    expectBoxNear(relativeBox(restoredRoot, restoredTitle), initialRelative, 5);

    const deltas: Record<string, { x: number; y: number }> = {
      n: { x: 0, y: -24 }, ne: { x: 24, y: -24 }, e: { x: 24, y: 0 },
      se: { x: 24, y: 24 }, s: { x: 0, y: 24 }, sw: { x: -24, y: 24 },
      w: { x: -24, y: 0 }, nw: { x: -24, y: -24 },
    };
    for (const direction of Object.keys(deltas)) {
      const beforeRoot = await root.boundingBox();
      const before = await selectionBox.boundingBox();
      const handle = root.locator(
        `button[data-hc-resize-handle][data-node-id="title"][data-resize-direction="${direction}"]`,
      );
      const box = await handle.boundingBox();
      if (!beforeRoot || !before || !box) throw new Error(`方向 ${direction} 缺少尺寸`);
      const beforeRelative = relativeBox(beforeRoot, before);
      const beforeCss = await instanceStyle.textContent();
      await page.keyboard.down("Alt");
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        box.x + box.width / 2 + deltas[direction].x,
        box.y + box.height / 2 + deltas[direction].y,
        { steps: 6 },
      );
      await page.mouse.up();
      await page.keyboard.up("Alt");
      const after = await selectionBox.boundingBox();
      if (!after) throw new Error(`方向 ${direction} 缩放后缺少尺寸`);
      await expectInside(rootBox, after);
      expect(Math.abs(after.width - before.width) + Math.abs(after.height - before.height)).toBeGreaterThan(1);
      await undo.click();
      await expect.poll(() => instanceStyle.textContent()).toBe(beforeCss);
      const currentRoot = await root.boundingBox();
      const currentTitle = await selectionBox.boundingBox();
      if (!currentRoot || !currentTitle) throw new Error(`方向 ${direction} 撤销后缺少尺寸`);
      expectBoxNear(relativeBox(currentRoot, currentTitle), beforeRelative);
    }
    await root.getByRole("button", { name: "完成画布调整" }).click();
    await expect(layoutGrid).toHaveCount(0);
    expect(forbiddenWrites).toEqual([]);
  });

  test("Esc 与 pointercancel 取消不提交，正常 pointerup 只生成一条历史", async ({ page }) => {
    const forbiddenWrites: string[] = [];
    const { frame } = await openEditor(page, { forbiddenWrites });
    const root = frame.locator('[data-content-template-module="首屏主视觉"]').first();
    const title = frame.locator('[data-hc-keyboard-node="title"]:visible').first();
    await title.click();
    await root.locator('[data-hc-node-hud][data-node-id="title"]').getByRole("button", {
      name: "调整对象区域",
    }).click();
    const selectionBox = root.locator('[data-hc-selection-box][data-node-id="title"]');
    const initial = await selectionBox.boundingBox();
    const initialRoot = await root.boundingBox();
    if (!initial || !initialRoot) throw new Error("模块或标题缺少布局尺寸");
    const initialRelative = relativeBox(initialRoot, initial);
    const instanceStyle = root.locator("style[data-hc-instance-overrides]");
    const initialCss = await instanceStyle.textContent();
    const undo = page.getByRole("button", { name: "撤销" });
    const initiallyDisabled = await undo.isDisabled();

    const expectRestored = async () => {
      await expect.poll(() => instanceStyle.textContent()).toBe(initialCss);
      const currentRoot = await root.boundingBox();
      const current = await selectionBox.boundingBox();
      if (!currentRoot || !current) throw new Error("恢复后模块或标题缺少布局尺寸");
      expectBoxNear(relativeBox(currentRoot, current), initialRelative, 5);
    };

    const begin = async (dx: number) => {
      await title.focus();
      await page.mouse.move(initial.x + initial.width / 2, initial.y + initial.height / 2);
      await page.mouse.down();
      await page.mouse.move(initial.x + initial.width / 2 + dx, initial.y + initial.height / 2 + 18, { steps: 8 });
      await expect(root).toHaveAttribute("data-hc-gesture-phase", "update");
    };
    await begin(70);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(root).toHaveAttribute("data-hc-gesture-phase", "cancel");
    await expectRestored();
    expect(await undo.isDisabled()).toBe(initiallyDisabled);

    await root.locator('[data-hc-node-hud][data-node-id="title"]').getByRole("button", {
      name: "调整对象区域",
    }).click();
    await begin(-55);
    await root.dispatchEvent("pointercancel", { pointerId: 1 });
    await page.mouse.up();
    await expect(root).toHaveAttribute("data-hc-gesture-phase", "cancel");
    await expectRestored();
    expect(await undo.isDisabled()).toBe(initiallyDisabled);

    await root.locator('[data-hc-node-hud][data-node-id="title"]').getByRole("button", {
      name: "调整对象区域",
    }).click();
    await begin(62);
    await page.mouse.up();
    await expect.poll(() => instanceStyle.textContent()).not.toBe(initialCss);
    await expect(undo).toBeEnabled();
    await undo.click();
    await expectRestored();
    expect(await undo.isDisabled()).toBe(initiallyDisabled);
    expect(forbiddenWrites).toEqual([]);
  });

  test("media focus 只有显式进入构图模式后才写入", async ({ page }) => {
    const forbiddenWrites: string[] = [];
    const { frame } = await openEditor(page, { forbiddenWrites });
    const root = frame.locator('[data-content-template-module="首屏主视觉"]').first();
    const image = frame.locator('[data-content-role-desktop="desktopImage"] img:visible').first();
    await image.click();
    await expect(root).not.toHaveAttribute("data-hc-media-focus-enabled", "true");
    const style = root.locator("style[data-hc-instance-overrides]");
    const before = (await style.textContent()) ?? "";
    const box = await image.boundingBox();
    if (!box) throw new Error("图片缺少布局尺寸");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 24, { steps: 8 });
    await page.mouse.up();
    expect((await style.textContent()) ?? "").toBe(before);

    const hud = root.locator('[data-hc-node-hud][data-node-id="desktopImage"]');
    await hud.getByRole("button", { name: "调整图片构图" }).click();
    await expect(root).toHaveAttribute("data-hc-media-focus-enabled", "true");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 24, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => (await style.textContent()) ?? "").not.toBe(before);
    await hud.getByRole("button", { name: "完成画布调整" }).click();
    await expect(root).not.toHaveAttribute("data-hc-media-focus-enabled", "true");
    expect(forbiddenWrites).toEqual([]);
  });

  test("P0-1 内容与模板编辑双模式完成 ratio/fit/zoom/focus，移动端保持独立", async ({ page }, testInfo) => {
    const forbiddenWrites: string[] = [];
    const { frame, inspector } = await openEditor(page, { forbiddenWrites });
    const tablist = inspector.getByRole("tablist", { name: "属性面板一级导航" });
    const tabs = tablist.getByRole("tab");
    await expect(tabs).toHaveText(["内容编辑", "模板编辑"]);

    const contentTab = tablist.getByRole("tab", { name: "内容编辑" });
    await contentTab.focus();
    await contentTab.press("ArrowRight");
    await expect(tablist.getByRole("tab", { name: "模板编辑" })).toBeFocused();
    await expect(tablist.getByRole("tab", { name: "模板编辑" })).toHaveAttribute("aria-selected", "true");
    await tablist.getByRole("tab", { name: "模板编辑" }).press("Home");
    await expect(contentTab).toBeFocused();

    await selectObject(inspector, "desktopImage");
    const summary = inspector.getByRole("region", { name: "当前编辑对象" });
    await expect(summary).toHaveAttribute("data-selected-kind", "media");
    await expect(summary).toHaveAttribute("data-shared-design", "true");
    await contentTab.click();
    await expect(contentTab).toHaveAttribute("aria-selected", "true");
    await expect(summary).toHaveAttribute("data-selected-node-id", "desktopImage");

    const altField = inspector.locator('[data-inspector-field="altText"]');
    await altField.locator("input").fill("替换后的首屏图替代文字");
    const mediaField = inspector.locator('[data-inspector-field="desktopImage"]');
    await mediaField.getByRole("button", { name: "图片链接" }).click();
    const imageUrlInput = mediaField.getByPlaceholder("输入图片 URL；清空后确认 = 删除图片");
    await imageUrlInput.fill("/svg/redesign-hero-alt.svg");
    await imageUrlInput.press("Enter");
    await expect(frame.locator('[data-content-role-desktop="desktopImage"] img:visible').first()).toHaveAttribute(
      "src",
      /redesign-hero-alt\.svg/,
    );
    await expect(frame.locator('[data-content-role-desktop="desktopImage"] img:visible').first()).toHaveAttribute(
      "alt",
      "替换后的首屏图替代文字",
    );

    await tablist.getByRole("tab", { name: "模板编辑" }).click();
    const ratio = inspector.locator('[data-inspector-control="ratio"]');
    await ratio.getByRole("button", { name: "3 / 2" }).click();
    await expect(ratio.getByRole("button", { name: "3 / 2" })).toHaveAttribute("aria-pressed", "true");
    const fit = inspector.locator('[data-inspector-control="fit"]');
    await fit.getByRole("button", { name: "完整显示" }).click();
    await expect(fit.getByRole("button", { name: "完整显示" })).toHaveAttribute("aria-pressed", "true");
    const zoom = inspector.locator('[data-inspector-control="zoom"] input[type="range"]');
    await setRangeValue(zoom, 1.25);
    await expect(zoom).toHaveValue("1.25");
    const desktopFocus = inspector.getByRole("group", { name: "桌面主图画面焦点（桌面端）" });
    await desktopFocus.getByRole("button", { name: "焦点：右上" }).click();
    await expect(desktopFocus.getByRole("button", { name: "焦点：右上" })).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: /移动端布局/ }).click();
    // Puck 重建移动端画布时会回到模块级；用冻结的对象切换器恢复同一对象上下文。
    await selectObject(inspector, "mobileImage");
    await tablist.getByRole("tab", { name: "模板编辑" }).click();
    await expect(summary).toHaveAttribute("data-active-device", "mobile");
    await expect(summary).toHaveAttribute("data-mobile-state", "base");
    await expect(summary).toHaveAttribute("data-selected-node-id", "mobileImage");
    await expect(frame.locator('[data-content-role-mobile="mobileImage"] img:visible').first()).toHaveAttribute(
      "src",
      /redesign-hero-alt\.svg/,
    );
    await attachViewport(page, testInfo, "p0-media-mobile-inheritance");
    expect(forbiddenWrites).toEqual([]);
  });

  test("P0-2 行动文案与站内目标实际修改，且隐藏无关字段", async ({ page }, testInfo) => {
    const forbiddenWrites: string[] = [];
    const { frame, inspector } = await openEditor(page, { forbiddenWrites });
    await selectObject(inspector, "actionText");
    const summary = inspector.getByRole("region", { name: "当前编辑对象" });
    await expect(summary).toHaveAttribute("data-selected-kind", "action");
    await inspector.getByRole("tab", { name: "内容编辑" }).click();

    const actionInput = inspector.locator('[data-inspector-field="actionText"] input');
    await actionInput.fill("查看 QA 新系列");
    await expect(actionInput).toHaveValue("查看 QA 新系列");
    await expect(frame.locator('[data-content-role="action"]:visible').first()).toContainText("查看 QA 新系列");
    await expect(inspector.locator('[data-inspector-field="title"]')).toHaveCount(0);
    await expect(inspector.locator('[data-inspector-field="subtitle"]')).toHaveCount(0);
    await expect(inspector.locator('[data-inspector-field="desktopImage"]')).toHaveCount(0);
    await expect(inspector.locator('[data-inspector-field="altText"]')).toHaveCount(0);

    const target = inspector.getByRole("group", { name: "点击后前往" });
    await target.getByRole("button", { name: "页面" }).click();
    const pageTarget = inspector.getByRole("combobox", { name: /站内页面/ });
    await pageTarget.fill("https://outside.invalid/qa");
    await expect(inspector.getByRole("alert")).toHaveText(
      "该路径不是可发布的公开页面；商品详情请使用「商品」目标。",
    );
    await pageTarget.fill("/catalog?source=editor-qa");
    await expect(pageTarget).toHaveValue("/catalog?source=editor-qa");
    await expect(inspector.getByRole("alert")).toHaveCount(0);
    await attachViewport(page, testInfo, "p0-action-copy-and-target");
    expect(forbiddenWrites).toEqual([]);
  });

  test("P0-3 Mobile rect/z/focus 重置后 Undo/Redo 恢复同一对象事务", async ({ page }, testInfo) => {
    const forbiddenWrites: string[] = [];
    const { inspector } = await openEditor(page, {
      forbiddenWrites,
      draft: makeMobileOverrideDraft(),
    });
    await selectObject(inspector, "desktopImage");
    await inspector.getByRole("tab", { name: "模板编辑" }).click();
    const summary = inspector.getByRole("region", { name: "当前编辑对象" });
    await page.getByRole("button", { name: /移动端布局/ }).click();
    await selectObject(inspector, "mobileImage");
    await inspector.getByRole("tab", { name: "模板编辑" }).click();
    await expect(summary).toHaveAttribute("data-active-device", "mobile");
    await expect(summary).toHaveAttribute("data-mobile-state", "partial");

    const focus = inspector.getByRole("group", { name: "移动端主图画面焦点（移动端）" });
    await focus.getByRole("button", { name: "焦点：右下" }).click();
    const layer = inspector.getByRole("group", { name: "图层顺序（移动端）" });
    await layer.getByRole("button", { name: "上移一层" }).click();
    await inspector.getByRole("button", { name: "精确位置与尺寸" }).click();
    const mobileX = inspector.getByRole("slider", { name: "横向位置（移动端）" });
    const beforeX = Number(await mobileX.inputValue());
    await setRangeValue(mobileX, Math.min(beforeX + 3, Number(await mobileX.getAttribute("max"))));
    const changedX = await mobileX.inputValue();
    expect(changedX).not.toBe(String(beforeX));
    await expect(summary).toHaveAttribute("data-mobile-state", "independent");

    await inspector.getByRole("button", { name: "恢复移动端主图设计默认" }).click();
    await expect(summary).toHaveAttribute("data-mobile-state", "base");
    const undo = page.getByRole("button", { name: "撤销" });
    const redo = page.getByRole("button", { name: "重做" });
    await undo.click();
    // Puck history restore 会重建 iframe 并清除选择；恢复查看上下文后再核对真实数据。
    const restoreMobileContext = async () => {
      await page.locator(".homepage-editor__layer-item .homepage-editor__layer-select").first().click();
      await page.getByRole("button", { name: /移动端布局/ }).click();
      await selectObject(inspector, "mobileImage");
      await inspector.getByRole("tab", { name: "模板编辑" }).click();
    };
    await restoreMobileContext();
    await expect(inspector.getByRole("region", { name: "当前编辑对象" })).toHaveAttribute(
      "data-mobile-state",
      "independent",
    );
    await expect(inspector.getByRole("group", { name: "移动端主图画面焦点（移动端）" })
      .getByRole("button", { name: "焦点：右下" })).toHaveAttribute("aria-pressed", "true");
    await expect(inspector.getByRole("slider", { name: "横向位置（移动端）" })).toHaveValue(changedX);
    await redo.click();
    await restoreMobileContext();
    await expect(inspector.getByRole("region", { name: "当前编辑对象" })).toHaveAttribute(
      "data-mobile-state",
      "base",
    );
    await attachViewport(page, testInfo, "p0-mobile-reset-undo-redo");
    expect(forbiddenWrites).toEqual([]);
  });

  test("Inspector 对 media/text/action 使用不同图形控件且无重复画布工具或保存区", async ({ page }, testInfo) => {
    const forbiddenWrites: string[] = [];
    const { inspector } = await openEditor(page, { forbiddenWrites });
    await expect(inspector.locator(".homepage-editor__visual-toolbar")).toHaveCount(0);
    await expect(inspector.locator(".homepage-editor__properties-actions")).toHaveCount(0);

    await selectObject(inspector, "desktopImage");
    await inspector.getByRole("tab", { name: "模板编辑" }).click();
    const summary = inspector.getByRole("region", { name: "当前编辑对象" });
    await expect(summary).toHaveAttribute("data-selected-kind", "media");
    await expect(inspector.getByRole("group", { name: "桌面主图比例" })).toBeVisible();
    await expect(inspector.getByRole("group", { name: "填充方式" })).toBeVisible();
    const objectRadius = inspector.getByRole("group", { name: "对象圆角" });
    const objectShadow = inspector.getByRole("group", { name: "对象阴影" });
    await expect(objectRadius).toBeVisible();
    await expect(objectShadow).toBeVisible();
    await objectRadius.getByRole("button", { name: "柔和" }).click();
    const heroRoot = page.locator(".homepage-editor__canvas-scale iframe").contentFrame()
      .locator('[data-content-template-module="首屏主视觉"]').first();
    await expect.poll(() => heroRoot.locator("style[data-hc-instance-overrides]").textContent())
      .toContain("border-radius:8px!important");
    await objectShadow.getByRole("button", { name: "悬浮" }).click();
    await expect.poll(() => heroRoot.locator("style[data-hc-instance-overrides]").textContent())
      .toContain("box-shadow:0 16px 36px rgba(24,26,27,.16)!important");
    const focus = inspector.getByRole("group", { name: "桌面主图画面焦点（桌面端）" });
    await expect(focus.getByRole("button")).toHaveCount(9);
    await expect(inspector.getByRole("button", { name: "精确位置与尺寸" })).toHaveAttribute("aria-expanded", "false");

    await inspector.getByRole("tab", { name: "内容编辑" }).click();
    await selectObject(inspector, "title");
    await inspector.getByRole("tab", { name: "模板编辑" }).click();
    await expect(summary).toHaveAttribute("data-selected-kind", "text");
    await expect(inspector.getByRole("group", { name: "标题快速定位（桌面端）" }).getByRole("button")).toHaveCount(9);
    await expect(inspector.getByRole("group", { name: "填充方式" })).toHaveCount(0);
    await expect(inspector.getByRole("group", { name: "对象圆角" })).toHaveCount(0);

    await inspector.getByRole("tab", { name: "内容编辑" }).click();
    await selectObject(inspector, "actionText");
    await inspector.getByRole("tab", { name: "模板编辑" }).click();
    await expect(summary).toHaveAttribute("data-selected-kind", "action");
    await expect(inspector.getByRole("group", { name: "行动文字快速定位（桌面端）" }).getByRole("button")).toHaveCount(9);
    await expect(inspector.getByRole("group", { name: "填充方式" })).toHaveCount(0);
    await attachViewport(page, testInfo, "inspector-media-text-action-1672x941");
    expect(forbiddenWrites).toEqual([]);
  });

  test("流式模板提供受控配色、留白、圆角与阴影，并实时写入共享 Renderer", async ({ page }) => {
    const forbiddenWrites: string[] = [];
    const { frame, inspector } = await openEditor(page, {
      forbiddenWrites,
      draft: makeProductDraft(),
    });
    await inspector.getByRole("combobox", { name: "选择编辑对象" }).selectOption("");
    await expect(inspector.getByRole("combobox", { name: "选择编辑对象" })).toHaveValue("");
    await inspector.getByRole("tab", { name: "模板编辑" }).click();

    const color = inspector.getByRole("group", { name: "模板配色" });
    const padding = inspector.getByRole("group", { name: "模块留白" });
    const radius = inspector.getByRole("group", { name: "模块圆角" });
    const shadow = inspector.getByRole("group", { name: "模块阴影" });
    await expect(color).toBeVisible();
    await expect(padding).toBeVisible();
    await expect(radius).toBeVisible();
    await expect(shadow).toBeVisible();

    const root = frame.locator('[data-content-template-module="单品焦点推荐"]').first();
    const css = root.locator("style[data-hc-instance-overrides]");
    await color.getByRole("button", { name: "柔灰" }).click();
    await expect.poll(() => css.textContent()).toContain("--hc-instance-background:#F7F8F8");
    await padding.getByRole("button", { name: "舒展" }).click();
    await expect.poll(() => css.textContent()).toContain("padding-block:clamp(88px,10vw,144px)!important");
    await radius.getByRole("button", { name: "圆润" }).click();
    await expect.poll(() => css.textContent()).toContain("border-radius:16px!important");
    await shadow.getByRole("button", { name: "悬浮" }).click();
    await expect.poll(() => css.textContent()).toContain("box-shadow:0 20px 48px rgba(24,26,27,.14)!important");
    expect(forbiddenWrites).toEqual([]);
  });

  test("product 对象只显示商品与商品图形控制", async ({ page }) => {
    const forbiddenWrites: string[] = [];
    const { frame, inspector } = await openEditor(page, {
      forbiddenWrites,
      draft: makeProductDraft(),
    });
    await frame.locator('[data-content-role="product"]:visible').first().click();
    const summary = inspector.getByRole("region", { name: "当前编辑对象" });
    await expect(summary).toHaveAttribute("data-selected-node-id", "product");
    await expect(summary).toHaveAttribute("data-selected-kind", "product");
    await expect(inspector.locator('[data-inspector-field="productCode"]')).toHaveCount(1);
    await expect(inspector.locator('[data-inspector-field="title"]')).toHaveCount(0);
    await inspector.getByRole("tab", { name: "模板编辑" }).click();
    await expect(inspector.getByRole("group", { name: "商品主图比例" })).toBeVisible();
    await expect(inspector.getByRole("group", { name: "填充方式" })).toBeVisible();
    await expect(inspector.getByRole("group", { name: /快速定位|画面焦点/ })).toHaveCount(0);
    expect(forbiddenWrites).toEqual([]);
  });

  const representativeObjects = [
    {
      name: "DoublePoster 主图",
      draft: makeDoublePosterDraft,
      nodeId: "mainImage",
      kind: "media",
      visibleFields: ["mainImage", "mainAltText"],
      hiddenFields: ["title", "description", "actionText", "detailImage"],
    },
    {
      name: "Video 封面",
      draft: makeVideoDraft,
      nodeId: "coverImage",
      kind: "video",
      visibleFields: ["videoUrl", "posterUrl", "autoPlay"],
      hiddenFields: ["title", "subtitle", "actionText"],
    },
    {
      name: "Product 商品",
      draft: makeProductDraft,
      nodeId: "product",
      kind: "product",
      visibleFields: ["productCode"],
      hiddenFields: ["title", "summary", "primaryText"],
    },
    {
      name: "Collection 作品集合",
      draft: makeCollectionDraft,
      nodeId: "works",
      kind: "collection",
      visibleFields: ["items"],
      hiddenFields: ["title", "subtitle"],
    },
  ] as const;

  for (const representative of representativeObjects) {
    test(`代表模块对象过滤：${representative.name}`, async ({ page }) => {
      const forbiddenWrites: string[] = [];
      const { inspector } = await openEditor(page, {
        forbiddenWrites,
        draft: representative.draft(),
      });
      await selectObject(inspector, representative.nodeId);
      await inspector.getByRole("tab", { name: "内容编辑" }).click();
      const summary = inspector.getByRole("region", { name: "当前编辑对象" });
      await expect(summary).toHaveAttribute("data-selected-node-id", representative.nodeId);
      await expect(summary).toHaveAttribute("data-selected-kind", representative.kind);
      for (const field of representative.visibleFields) {
        await expect(inspector.locator(`[data-inspector-field="${field}"]`)).toHaveCount(1);
      }
      for (const field of representative.hiddenFields) {
        await expect(inspector.locator(`[data-inspector-field="${field}"]`)).toHaveCount(0);
      }
      expect(forbiddenWrites).toEqual([]);
    });
  }

  test("DoublePoster 主图设计恢复可被 Undo/Redo 完整往返", async ({ page }, testInfo) => {
    const puckWarnings: Array<"setData" | "set"> = [];
    page.on("console", (message) => {
      if (message.type() !== "warning" || !message.text().includes("expensive")) return;
      if (message.text().includes("`setData`")) puckWarnings.push("setData");
      else if (message.text().includes("`set`")) puckWarnings.push("set");
    });
    const drainWarnings = () => puckWarnings.splice(0, puckWarnings.length);
    const forbiddenWrites: string[] = [];
    const { inspector } = await openEditor(page, {
      forbiddenWrites,
      draft: makeDoublePosterDraft(),
    });
    const loadWarnings = drainWarnings();
    const restoreMainImageContext = async () => {
      await page.locator(".homepage-editor__layer-item .homepage-editor__layer-select").first().click();
      await selectObject(inspector, "mainImage");
      await expect(inspector.getByRole("region", { name: "当前编辑对象" })).toHaveAttribute(
        "data-selected-node-id",
        "mainImage",
      );
      await inspector.getByRole("tab", { name: "模板编辑" }).click();
      await expect(inspector.getByRole("tab", { name: "模板编辑" })).toHaveAttribute("aria-selected", "true");
    };
    await restoreMainImageContext();

    const ratio = inspector.locator('[data-inspector-control="ratio"]');
    const ratio169 = ratio.getByRole("button", { name: /16:9/ });
    await ratio169.click();
    const fit = inspector.locator('[data-inspector-control="fit"]');
    await fit.getByRole("button", { name: "完整显示" }).click();
    const focus = inspector.getByRole("group", { name: "主图画面焦点（桌面端）" });
    await focus.getByRole("button", { name: "焦点：右下" }).click();
    const zoom = inspector.locator('[data-inspector-control="zoom"] input[type="range"]');
    await setRangeValue(zoom, 1.2);
    await expect(ratio169).toHaveAttribute("aria-pressed", "true");
    await expect(fit.getByRole("button", { name: "完整显示" })).toHaveAttribute("aria-pressed", "true");
    await expect(focus.getByRole("button", { name: "焦点：右下" })).toHaveAttribute("aria-pressed", "true");
    await expect(zoom).toHaveValue("1.2");
    const propertyWarnings = drainWarnings();

    await inspector.getByRole("button", { name: "高级设置" }).click();
    await inspector.getByRole("button", { name: "恢复主图全部设计" }).click();
    await expect(ratio169).toHaveAttribute("aria-pressed", "false");
    const resetWarnings = drainWarnings();
    const undo = page.getByRole("button", { name: "撤销" });
    const redo = page.getByRole("button", { name: "重做" });
    await undo.click();
    await restoreMainImageContext();
    await expect(inspector.locator('[data-inspector-control="ratio"]')
      .getByRole("button", { name: /16:9/ })).toHaveAttribute("aria-pressed", "true");
    await expect(inspector.locator('[data-inspector-control="fit"]')
      .getByRole("button", { name: "完整显示" })).toHaveAttribute("aria-pressed", "true");
    await expect(inspector.getByRole("group", { name: "主图画面焦点（桌面端）" })
      .getByRole("button", { name: "焦点：右下" })).toHaveAttribute("aria-pressed", "true");
    await expect(inspector.locator('[data-inspector-control="zoom"] input[type="range"]')).toHaveValue("1.2");
    const undoWarnings = drainWarnings();
    await redo.click();
    await restoreMainImageContext();
    await expect(inspector.locator('[data-inspector-control="ratio"]')
      .getByRole("button", { name: /16:9/ })).toHaveAttribute("aria-pressed", "false");
    const redoWarnings = drainWarnings();
    const warningEvidence = {
      load: loadWarnings,
      property: propertyWarnings,
      reset: resetWarnings,
      undo: undoWarnings,
      redo: redoWarnings,
    };
    console.info(`[puck-performance] double-poster-history ${JSON.stringify(warningEvidence)}`);
    await testInfo.attach("double-poster-history-warnings.json", {
      body: JSON.stringify(warningEvidence, null, 2),
      contentType: "application/json",
    });
    await attachViewport(page, testInfo, "double-poster-reset-undo-redo");
    expect(forbiddenWrites).toEqual([]);
  });

  test("Desktop 自定义、Mobile 托管和对象重置可观测", async ({ page }) => {
    const forbiddenWrites: string[] = [];
    const { inspector } = await openEditor(page, { forbiddenWrites });
    await selectObject(inspector, "title");
    await inspector.getByRole("tab", { name: "模板编辑" }).click();
    await inspector.getByRole("button", { name: "精确位置与尺寸" }).click();
    const summary = inspector.getByRole("region", { name: "当前编辑对象" });
    await expect(summary).toHaveAttribute("data-desktop-state", "custom");
    await expect(summary).toHaveAttribute("data-mobile-state", "base");
    await page.getByRole("button", { name: /移动端布局/ }).click();
    await selectObject(inspector, "title");
    await inspector.getByRole("tab", { name: "模板编辑" }).click();
    await expect(summary).toHaveAttribute("data-active-device", "mobile");
    await expect(inspector.getByText("位置由移动端堆叠模板控制")).toBeVisible();
    await expect(inspector.getByRole("slider", { name: "横向位置（移动端）" })).toHaveCount(0);
    await expect(inspector.getByRole("group", { name: "图层顺序（移动端）" })).toHaveCount(0);
    await expect(summary).toHaveAttribute("data-mobile-state", "base");
    await page.getByRole("button", { name: /桌面端布局/ }).click();
    await selectObject(inspector, "title");
    await inspector.getByRole("tab", { name: "模板编辑" }).click();
    await expect(summary).toHaveAttribute("data-active-device", "desktop");
    await expect(summary).toHaveAttribute("data-desktop-state", "custom");
    await inspector.getByRole("button", { name: "恢复主标题设计默认" }).click();
    await expect(summary).toHaveAttribute("data-desktop-state", "base");
    await expect(summary).toHaveAttribute("data-mobile-state", "base");
    expect(forbiddenWrites).toEqual([]);
  });

  for (const viewport of [{ width: 1600, height: 1000 }, { width: 1280, height: 720 }]) {
    test(`${viewport.width}x${viewport.height} 无横向溢出`, async ({ page }, testInfo) => {
      const forbiddenWrites: string[] = [];
      const { inspector } = await openEditor(page, { viewport, forbiddenWrites });
      const scroll = inspector.locator('[data-inspector-scroll="main"]');
      const dimensions = await scroll.evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }));
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width + 1);
      await attachViewport(page, testInfo, `editor-${viewport.width}x${viewport.height}`);
      expect(forbiddenWrites).toEqual([]);
    });
  }

  test("320px Inspector 与 200% 等效重排无横向溢出", async ({ page }, testInfo) => {
    const forbiddenWrites: string[] = [];
    const { inspector } = await openEditor(page, {
      viewport: { width: 1600, height: 1000 },
      forbiddenWrites,
    });
    await page.locator(".homepage-editor__body").evaluate((element) =>
      (element as HTMLElement).style.setProperty("--editor-inspector-dock-width", "320px"),
    );
    await expect.poll(async () => Math.abs(((await inspector.boundingBox())?.width ?? 0) - 320)).toBeLessThanOrEqual(1);
    const scroll = inspector.locator('[data-inspector-scroll="main"]');
    expect(await scroll.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await attachViewport(page, testInfo, "inspector-320px");

    await page.setViewportSize({ width: 836, height: 471 });
    await page.locator("body").evaluate((element) => {
      (element as HTMLElement).style.zoom = "2";
    });
    await expect(inspector).toBeVisible();
    expect(await scroll.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(837);
    await attachViewport(page, testInfo, "editor-css-zoom-200pct-836x471");
    expect(forbiddenWrites).toEqual([]);
  });
});
