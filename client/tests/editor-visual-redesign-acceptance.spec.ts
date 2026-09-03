import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { installAdminSession } from "./fixtures/session-auth";
import { systemTemplateCatalog } from "./fixtures/template-catalog";

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
    videoDescription: "工匠在工作台前手工錾刻金饰",
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
  await installAdminSession(page, {
    username: "editor-redesign-qa",
    realName: "视觉编辑器 QA",
  });
}

async function mockEditorApis(page: Page, draft: EditorDraft, forbiddenWrites: string[]) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = request.url();
    const pathname = new URL(url).pathname;
    if (pathname === "/api/auth/profile") return route.fallback();
    if (pathname === "/api/page-modules/dynamic-templates/catalog") {
      return route.fulfill(json(systemTemplateCatalog()));
    }
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
    if (url.includes("/categories/admin/tree")) {
      return route.fulfill(json([{
        id: 21,
        slug: "qa-rings",
        name: "QA 戒指",
        isActive: true,
        coverImage: "/svg/redesign-hero.svg",
        hasPublicProduct: true,
        children: [],
      }]));
    }
    if (url.includes("/categories/admin/resolve-references")) {
      return route.fulfill(json([{
        id: 21,
        slug: "qa-rings",
        name: "QA 戒指",
        level: 1,
        coverImage: "/svg/redesign-hero.svg",
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
  await page.route("**/video/bad.mp4", (route) =>
    route.fulfill({ status: 200, contentType: "video/mp4", body: "not-a-video" }),
  );
}

async function openEditor(
  page: Page,
  options: {
    viewport?: { width: number; height: number };
    draft?: EditorDraft;
    forbiddenWrites: string[];
    selectInitialLayer?: boolean;
  },
) {
  await page.setViewportSize(options.viewport ?? { width: 1672, height: 941 });
  await mockEditorApis(page, options.draft ?? makeHeroDraft(), options.forbiddenWrites);
  await authenticateAdmin(page);
  await page.goto("/admin/editor/home");
  await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
  const frame = page.frameLocator(".homepage-editor__canvas-scale iframe");
  await expect(frame.locator("[data-content-template-module]").first()).toBeVisible();
  if (options.selectInitialLayer !== false) {
    const layerSelect = page.locator(".homepage-editor__layer-item .homepage-editor__layer-select").first();
    if (await layerSelect.isVisible()) {
      await layerSelect.click();
    } else {
      await frame.locator("[data-hc-keyboard-node]:visible").first().click();
    }
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

async function pressWorkspaceHistory(page: Page, direction: "undo" | "redo") {
  await page.getByRole("button", { name: /^(模板设计|页面装修)$/ }).first().focus();
  await page.keyboard.press(direction === "undo" ? "Control+z" : "Control+Shift+z");
}

async function expectInside(outer: Box, inner: Box) {
  expect(inner.x).toBeGreaterThanOrEqual(outer.x - 1);
  expect(inner.y).toBeGreaterThanOrEqual(outer.y - 1);
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width + 1);
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height + 1);
}

async function frameBoxes(page: Page) {
  const body = page.locator(".homepage-editor__body:visible").last();
  const selectors = [
    ".homepage-editor__library",
    ".homepage-editor__structure-workspace",
    ".homepage-editor__stage",
    ".homepage-editor__right-workspace",
  ];
  const boxes: Box[] = [];
  for (const selector of selectors) {
    const box = await body.locator(`:scope > ${selector}`).boundingBox();
    if (!box) throw new Error(`四框架缺少布局尺寸：${selector}`);
    boxes.push(box);
  }
  return boxes;
}

function expectBoxesStable(before: Box[], after: Box[]) {
  expect(after).toHaveLength(before.length);
  for (let index = 0; index < before.length; index += 1) {
    for (const key of ["x", "y", "width", "height"] as const) {
      expect(
        Math.abs(after[index][key] - before[index][key]),
        `四框几何变化：frame=${index} key=${key}`,
      ).toBeLessThanOrEqual(1);
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
  const objectSelect = inspector.getByRole("combobox", { name: "选择编辑对象" });
  if ((await objectSelect.count()) > 0) {
    await objectSelect.selectOption(value);
    await expect(objectSelect).toHaveValue(value);
    return;
  }

  const doublePosterLabels: Record<string, string> = {
    mainImage: "主图",
    detailImage: "细节图",
    copy: "文案",
    action: "行动入口",
  };
  const label = doublePosterLabels[value];
  if (!label) throw new Error(`当前 Inspector 不支持对象选择：${value}`);
  const objectButton = inspector.getByRole("button", { name: new RegExp(`^选择${label}`) });
  await objectButton.click();
  await expect(objectButton).toHaveAttribute("aria-pressed", "true");
}

async function setRangeValue(locator: Locator, value: number) {
  if (await locator.getAttribute("type") === "number") {
    await locator.fill(String(value));
    await expect(locator).toHaveValue(String(value));
    return;
  }
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

async function expectPageInstanceBoundary(
  page: Page,
  frame: ReturnType<Page["frameLocator"]>,
  inspector: Locator,
) {
  await expect(page.getByRole("tablist", { name: "编辑工作模式" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "内容编辑" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "模板编辑" })).toHaveCount(0);
  await expect(inspector.getByRole("combobox", { name: "选择编辑对象" })).toHaveCount(0);
  await expect(frame.locator("[data-hc-node-hud]")).toHaveCount(0);
  await expect(frame.locator("[data-hc-resize-handle]")).toHaveCount(0);
  await expect(frame.locator("[data-hc-layout-grid]")).toHaveCount(0);
  await expect(frame.locator("[data-hc-template-slot-box]")).toHaveCount(0);
  const summary = inspector.getByRole("region", { name: "当前编辑对象" });
  await expect(summary).toHaveAttribute("data-selected-node-id", "module");
  await expect(summary).toHaveAttribute("data-selected-kind", "module");
  const workspaceContext = page.getByRole("group", { name: "店铺装修工作模式切换" });
  await expect(workspaceContext).toHaveAttribute("data-active-mode", "page");
  await expect(workspaceContext.getByLabel("当前工作区：页面装修")).toBeVisible();
  await expect(workspaceContext.getByRole("button", { name: "模板设计", exact: true })).toBeVisible();
  await expect(workspaceContext.getByRole("button", { name: "页面装修", exact: true })).toHaveCount(0);
}

async function enterTemplateWorkspace(page: Page) {
  await page.getByRole("button", { name: "模板设计", exact: true }).click();
  const workspaceContext = page.getByRole("group", { name: "店铺装修工作模式切换" });
  await expect(workspaceContext).toHaveAttribute("data-active-mode", "template");
  await expect(workspaceContext.getByLabel("当前工作区：模板设计")).toBeVisible();
  await expect(workspaceContext.getByRole("button", { name: "页面装修", exact: true })).toBeVisible();
  await expect(workspaceContext.getByRole("button", { name: "模板设计", exact: true })).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "模板组件库" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "模板结构" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "模板属性工作区" })).toBeVisible();
  await expect(page.getByRole("region", { name: /模板设计画布/ })).toBeVisible();
  return {
    inspector: page.getByRole("complementary", { name: "模板属性", exact: true }),
    frame: page.frameLocator(".template-editor__viewport-frame"),
  };
}

test.describe("图 1 视觉编辑器验收（真实前端 + 确定性自有 API）", () => {
  test.skip(appMode === "mock", "本验收在 development 模式拦截自有 API；不证明真实保存或发布");

  test("1672x941 两种工作模式各自的四框顺序与边界不因页面内部点击或设备切换改变", async ({ page }, testInfo) => {
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
    const pageSelection = inspector.getByRole("region", { name: "当前编辑对象" });
    await expect(pageSelection).toHaveAttribute("data-selected-node-id", "module");
    await expect(pageSelection).toHaveAttribute("data-selected-kind", "module");
    await expect(inspector.getByRole("combobox", { name: "选择编辑对象" })).toHaveCount(0);
    expectBoxesStable(before, await frameBoxes(page));
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "正在编辑首屏模板" }).click();
    await expect(page.getByRole("button", { name: "正在编辑首屏模板" })).toBeVisible();
    const templateBefore = await frameBoxes(page);
    expect(templateBefore).toHaveLength(4);
    const templateRegion = page.getByRole("treeitem", { name: /首屏区/ });
    await templateRegion.click();
    await expect(templateRegion).toHaveAttribute("aria-selected", "true");
    expectBoxesStable(templateBefore, await frameBoxes(page));
    await attachViewport(page, testInfo, "source-aligned-1672x941");
    await page.locator(".template-editor__toolbar").getByRole("button", { name: /移动端/ }).click();
    expectBoxesStable(templateBefore, await frameBoxes(page));
    expect(forbiddenWrites).toEqual([]);
  });

  test("装修页复用顶部单一模式切换按钮、会话状态与动作区，并移除网站预览和账户入口", async ({ page }) => {
    const forbiddenWrites: string[] = [];
    await openEditor(page, {
      forbiddenWrites,
      viewport: { width: 1912, height: 955 },
      selectInitialLayer: false,
    });

    const toolbar = page.locator(".homepage-editor__toolbar");
    const pageModeSwitch = toolbar.getByRole("group", { name: "店铺装修工作模式切换" });
    await expect(pageModeSwitch).toHaveAttribute("data-active-mode", "page");
    await expect(pageModeSwitch.getByRole("button")).toHaveAccessibleName("模板设计");
    await expect(pageModeSwitch.getByRole("button")).toHaveText("进入模板设计");
    await expect(pageModeSwitch.getByRole("button")).toHaveCount(1);
    await expect(toolbar.locator(".homepage-editor__draft-status")).toBeVisible();
    const pageViewportBox = await toolbar.locator(".homepage-editor__viewport-switcher").boundingBox();
    if (!pageViewportBox) throw new Error("页面装修顶部工具栏缺少可比较尺寸");
    const editorHeader = page.locator(".admin-header--editor");
    await expect(editorHeader.getByRole("link", { name: /预览网站/ })).toHaveCount(0);
    await expect(editorHeader.getByRole("button", { name: /账户菜单/ })).toHaveCount(0);

    await expect(toolbar.getByRole("button", { name: "预览当前画布" })).toBeVisible();
    await expect(toolbar.getByRole("button", { name: "保存当前装修草稿" })).toBeVisible();
    await expect(toolbar.getByRole("button", { name: /更多编辑操作/ })).toBeVisible();
    await expect(toolbar.getByRole("button", { name: /发布到前台网站/ })).toBeVisible();

    await pageModeSwitch.getByRole("button", { name: "模板设计" }).click();
    const templateToolbar = page.locator(".template-editor__toolbar");
    const templateModeSwitch = templateToolbar.getByRole("group", { name: "店铺装修工作模式切换" });
    await expect(templateModeSwitch).toHaveAttribute("data-active-mode", "template");
    await expect(templateModeSwitch.getByRole("button")).toHaveAccessibleName("页面装修");
    await expect(templateModeSwitch.getByRole("button")).toHaveText("返回页面装修");
    await expect(templateModeSwitch.getByRole("button")).toHaveCount(1);
    await expect(templateToolbar.locator(".homepage-editor__workspace-status")).toBeVisible();
    const templateViewportBox = await templateToolbar.locator(".homepage-editor__viewport-switcher").boundingBox();
    if (!templateViewportBox) throw new Error("模板设计顶部工具栏缺少可比较尺寸");
    expect(templateViewportBox.x + templateViewportBox.width / 2)
      .toBeCloseTo(pageViewportBox.x + pageViewportBox.width / 2, 1);
    expect(forbiddenWrites).toEqual([]);
  });

  test("单一模板目录按合同商业目的排序，不依赖手写分类猜测", async ({ page }) => {
    const forbiddenWrites: string[] = [];
    await openEditor(page, { forbiddenWrites });
    const expectedPurposeOrder = [
      ["品牌展示", "首屏主视觉"],
      ["商品销售", "单品焦点推荐"],
      ["活动转化", "预约入口"],
      ["内容传播", "单图海报"],
      ["信任建立", "卡片网格"],
    ] as const;

    const catalog = page.getByRole("region", { name: "模板列表", exact: true });
    await expect(catalog).toBeVisible();
    await expect(page.getByRole("heading", { name: "模板目录", exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "品牌展示", exact: true })).toHaveCount(0);

    const positions: number[] = [];
    for (const [, moduleType] of expectedPurposeOrder) {
      const card = catalog.locator(`[data-template-name="${moduleType}"]`);
      await expect(card).toHaveCount(1);
      positions.push(await card.evaluate((node) => Array.from(node.parentElement?.children ?? []).indexOf(node)));
    }
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    expect(forbiddenWrites).toEqual([]);
  });

  test("所有固定模板均可通过拖放超过旧数量上限继续添加", async ({ page }) => {
    const forbiddenWrites: string[] = [];
    await openEditor(page, { forbiddenWrites, selectInitialLayer: false });
    const layers = page.locator(".homepage-editor__layer-item");
    const canvas = page.locator(".homepage-editor__canvas-document");

    const dragTemplateToCanvas = async (templateCard: Locator) => {
      await templateCard.scrollIntoViewIfNeeded();
      const [templateBox, canvasBox] = await Promise.all([
        templateCard.boundingBox(),
        canvas.boundingBox(),
      ]);
      if (!templateBox || !canvasBox) throw new Error("模板卡片或画布缺少拖放尺寸");
      await page.mouse.move(
        templateBox.x + templateBox.width / 2,
        templateBox.y + templateBox.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(
        canvasBox.x + canvasBox.width / 2,
        canvasBox.y + canvasBox.height / 2,
        { steps: 8 },
      );
      await expect(canvas).toHaveClass(/is-dragging/);
      await page.mouse.up();
    };

    const singlePosterCard = page.getByRole("button", {
      name: "单图文：点击添加到页面末尾，也可拖到画布指定位置",
    });
    for (let count = 1; count <= 6; count += 1) {
      await dragTemplateToCanvas(singlePosterCard);
      await expect(layers, `第 ${count} 次拖放后应继续追加模板`).toHaveCount(count + 1);
    }
    await expect(layers, "模板数量超过旧默认上限 5 后仍应继续追加").toHaveCount(7);
    await expect(singlePosterCard.locator(".homepage-editor__template-footer")).toHaveCount(0);
    await expect(singlePosterCard).not.toHaveAttribute("aria-disabled", "true");

    const heroCard = page.getByRole("button", {
      name: "首屏：点击添加到页面末尾，也可拖到画布指定位置",
    });
    await expect(heroCard.locator(".homepage-editor__template-footer")).toHaveCount(0);
    await dragTemplateToCanvas(heroCard);
    await expect(layers, "模板数量超过旧显式上限 1 后仍应继续追加").toHaveCount(8);
    await expect(heroCard.locator(".homepage-editor__template-footer")).toHaveCount(0);
    await expect(heroCard).not.toHaveAttribute("aria-disabled", "true");
    expect(forbiddenWrites).toEqual([]);
  });

  test("公开媒体替代文字在 Inspector 中与合同发布门禁一致标为必填", async ({ page }) => {
    const forbiddenWrites: string[] = [];
    const { inspector } = await openEditor(page, {
      draft: makeDoublePosterDraft(),
      forbiddenWrites,
    });

    await expect(
      inspector.getByRole("combobox", { name: "选择编辑对象" }),
    ).toHaveCount(0);
    for (const fieldKey of ["mainImage", "mainAltText", "detailImage", "detailAltText"] as const) {
      await expect(inspector.locator(`[data-inspector-field="${fieldKey}"]`)).toHaveCount(1);
    }
    for (const fieldKey of ["mainAltText", "detailAltText"] as const) {
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

    await expect(
      inspector.getByRole("combobox", { name: "选择编辑对象" }),
    ).toHaveCount(0);
    await expect(inspector.locator('[data-inspector-field="items"]')).toHaveCount(1);
    await expect(inspector.locator('[data-inspector-field="title"]')).toHaveCount(1);
    await expect(inspector.locator('[data-inspector-field="subtitle"]')).toHaveCount(1);
    const altField = inspector.locator(".homepage-editor__item-fields .homepage-editor__inspector-field")
      .filter({ hasText: "替代文字" });
    await expect(altField).toHaveCount(1);
    await expect(altField.locator("label")).toContainText("必填");
    expect(forbiddenWrites).toEqual([]);
  });

  test("页面实例持有真实内容，模板工作区只显示系统占位", async ({ page }, testInfo) => {
    const forbiddenWrites: string[] = [];
    const { frame, inspector } = await openEditor(page, {
      forbiddenWrites,
      viewport: { width: 1920, height: 1200 },
    });
    const root = frame.locator('[data-content-template-module="首屏主视觉"]').first();
    const image = root.locator('[data-content-role-desktop="desktopImage"] img').first();
    await image.click();
    await expectPageInstanceBoundary(page, frame, inspector);
    await expect(image).toBeVisible();
    await expect(image).toHaveCSS("opacity", "1");
    await attachViewport(page, testInfo, "page-instance-content-boundary-1920x1200");

    const workspace = await enterTemplateWorkspace(page);
    await expect(workspace.inspector.getByRole("tabpanel")).toBeVisible();
    await expect(workspace.inspector.locator("[data-media-field]")).toHaveCount(0);
    await expect(workspace.inspector.getByRole("button", { name: /设为新实例默认|将全部样例设为默认/ })).toHaveCount(0);
    await expect(workspace.frame.locator(".hc-dynamic-template"))
      .not.toHaveAttribute("data-dynamic-template-content-layer", /.+/);
    expect(forbiddenWrites).toEqual([]);
  });

  test("双图文页面实例不显示母模板辅助层，独立工作区只编辑当前母模板", async ({ page }, testInfo) => {
    const forbiddenWrites: string[] = [];
    const { frame, inspector } = await openEditor(page, {
      forbiddenWrites,
      draft: makeDoublePosterWithSiblingDraft(),
      viewport: { width: 1920, height: 1200 },
    });
    const selectedRoot = frame.locator('[data-content-template-module="双图海报"]').first();
    const siblingRoot = frame.locator('[data-content-template-module="首屏主视觉"]').first();
    await selectedRoot.locator('[data-hc-keyboard-node="mainImage"]:visible').click();
    await expectPageInstanceBoundary(page, frame, inspector);
    await expect(selectedRoot.locator("[data-hc-template-slot-box]")).toHaveCount(0);
    await expect(siblingRoot.locator("[data-hc-template-slot-box]")).toHaveCount(0);
    await expect(inspector.locator('[data-inspector-field="mainImage"]')).toHaveCount(1);
    await expect(inspector.locator('[data-inspector-field="detailImage"]')).toHaveCount(1);

    const workspace = await enterTemplateWorkspace(page);
    await expect(workspace.frame.locator(".template-editor__dynamic-canvas-renderer")).toHaveCount(1);
    await expect(workspace.frame.locator(".hc-dynamic-template")).toBeVisible();
    await expect(page.locator(".template-editor__structure-section-label")).toHaveCount(0);
    const templateTree = page.getByRole("tree", { name: "模板区域与槽位" });
    await expect(templateTree).toBeVisible();
    const templateSummary = page.locator(".template-editor__template-summary");
    await expect(templateSummary).toBeVisible();
    await expect(templateSummary).toHaveAttribute("aria-selected", "true");
    await expect(templateSummary).toHaveAccessibleName(/首屏 模板 1920 × 随内容/);
    await attachViewport(page, testInfo, "template-structure-layer-panel-1920x1200");
    expect(forbiddenWrites).toEqual([]);
  });

  test("页面实例不渲染母模板 HUD，独立模板工作区通过结构树选择节点", async ({ page }) => {
    const forbiddenWrites: string[] = [];
    const { frame, inspector } = await openEditor(page, { forbiddenWrites });
    await frame.locator('[data-hc-keyboard-node="title"]:visible').first().click();
    await expectPageInstanceBoundary(page, frame, inspector);

    const workspace = await enterTemplateWorkspace(page);
    const region = page.getByRole("treeitem", { name: /首屏区/ });
    await region.click();
    await expect(region).toHaveAttribute("aria-selected", "true");
    await expect(workspace.inspector.getByRole("tabpanel")).toBeVisible();
    await expect(workspace.inspector.getByRole("tab")).toHaveCount(3);
    expect(forbiddenWrites).toEqual([]);
  });

  test("页面实例不暴露母模板缩放手柄，独立模板工作区提供设备布局面板", async ({ page }, testInfo) => {
    const forbiddenWrites: string[] = [];
    const { frame, inspector } = await openEditor(page, { forbiddenWrites });
    await expectPageInstanceBoundary(page, frame, inspector);

    const workspace = await enterTemplateWorkspace(page);
    const region = page.getByRole("treeitem", { name: /首屏区/ });
    await region.click();
    await expect(workspace.inspector.getByRole("tabpanel")).toBeVisible();
    await expect(page.getByRole("button", { name: /桌面端模板布局/ })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: /移动端模板布局/ }).click();
    await expect(page.getByRole("button", { name: /移动端模板布局/ })).toHaveAttribute("aria-pressed", "true");
    await attachViewport(page, testInfo, "template-workspace-mobile-layout");
    expect(forbiddenWrites).toEqual([]);
  });

  test("母模板历史只记录独立模板会话，页面实例会话保持隔离", async ({ page }) => {
    const forbiddenWrites: string[] = [];
    const { frame, inspector } = await openEditor(page, { forbiddenWrites });
    await expectPageInstanceBoundary(page, frame, inspector);

    const workspace = await enterTemplateWorkspace(page);
    const nameInput = workspace.inspector.getByRole("textbox", { name: "模板名称" });
    const originalName = await nameInput.inputValue();
    await nameInput.fill(originalName + " QA");
    const undo = page.getByRole("button", { name: "撤销", exact: true });
    await expect(undo).toBeEnabled();
    await undo.click();
    await expect(nameInput).toHaveValue(originalName);
    await page.getByRole("button", { name: "页面装修", exact: true }).click();
    await expect(inspector).toBeVisible();
    await expect(frame.locator("[data-content-template-module]").first()).toBeVisible();
    expect(forbiddenWrites).toEqual([]);
  });

  test("页面画布不直接改写母模板媒体构图，模板工作区不提供真实媒体字段", async ({ page }) => {
    const forbiddenWrites: string[] = [];
    const { frame, inspector } = await openEditor(page, { forbiddenWrites });
    const root = frame.locator('[data-content-template-module="首屏主视觉"]').first();
    const image = root.locator('[data-content-role-desktop="desktopImage"] img:visible').first();
    const beforeStyle = await root.locator("style[data-hc-instance-overrides]").textContent();
    const box = await image.boundingBox();
    if (!box) throw new Error("图片缺少布局尺寸");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 24, { steps: 8 });
    await page.mouse.up();
    await expectPageInstanceBoundary(page, frame, inspector);
    await expect.poll(() => root.locator("style[data-hc-instance-overrides]").textContent()).toBe(beforeStyle);

    const workspace = await enterTemplateWorkspace(page);
    await page.getByRole("treeitem", { name: /首屏区/ }).click();
    await expect(workspace.inspector.locator("[data-media-field]")).toHaveCount(0);
    await expect(workspace.inspector.getByText(/当前节点只负责模板结构/)).toBeVisible();
    expect(forbiddenWrites).toEqual([]);
  });

  test("顶部单一模式按钮可由键盘往返页面装修与模板设计", async ({ page }, testInfo) => {
    const forbiddenWrites: string[] = [];
    const { frame, inspector } = await openEditor(page, { forbiddenWrites });
    await expectPageInstanceBoundary(page, frame, inspector);
    const enterTemplate = page.getByRole("button", { name: "模板设计", exact: true });
    await enterTemplate.focus();
    await expect(enterTemplate).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("region", { name: /模板设计画布/ })).toBeVisible();
    await attachViewport(page, testInfo, "top-mode-switch-template");

    const returnToPage = page.getByRole("button", { name: "页面装修", exact: true });
    await returnToPage.focus();
    await expect(returnToPage).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(inspector).toBeVisible();
    await expect(frame.locator("[data-content-template-module]").first()).toBeVisible();
    expect(forbiddenWrites).toEqual([]);
  });

  test("P0-2 页面画布只选模板整体，行动文案与站内目标仍可修改且其他内容完整显示", async ({ page }, testInfo) => {
    const forbiddenWrites: string[] = [];
    const { frame, inspector } = await openEditor(page, { forbiddenWrites });
    await frame.locator('[data-content-role="action"]:visible').first().click();
    const summary = inspector.getByRole("region", { name: "当前编辑对象" });
    await expect(summary).toHaveAttribute("data-selected-kind", "module");
    await expect(summary).toHaveAttribute("data-selected-node-id", "module");
    await expect(
      inspector.getByRole("combobox", { name: "选择编辑对象" }),
    ).toHaveCount(0);
    const actionInput = inspector.locator('[data-inspector-field="actionText"] input');
    await expect(inspector.locator('[data-inspector-field="actionText"]')).not.toHaveClass(/is-visual-selected/);
    await inspector.locator('[data-inspector-field="actionText"]').scrollIntoViewIfNeeded();
    await expect(inspector.locator('[data-inspector-field="actionText"]')).toBeInViewport();
    await actionInput.fill("查看 QA 新系列");
    await expect(actionInput).toHaveValue("查看 QA 新系列");
    await expect(frame.locator('[data-content-role="action"]:visible').first()).toContainText("查看 QA 新系列");
    await expect(inspector.locator('[data-inspector-field="title"]')).toHaveCount(1);
    await expect(inspector.locator('[data-inspector-field="subtitle"]')).toHaveCount(1);
    await expect(inspector.locator('[data-inspector-field="desktopImage"]')).toHaveCount(1);
    await expect(inspector.locator('[data-inspector-field="mobileImage"]')).toHaveCount(0);
    await expect(inspector.locator('[data-inspector-field="altText"]')).toHaveCount(1);

    const target = inspector.getByRole("group", { name: "点击后前往" });
    await target.getByRole("button", { name: "页面" }).click();
    const pageTarget = inspector.getByRole("combobox", { name: /站内页面/ });
    const pageTargetError = inspector.getByRole("alert").filter({
      hasText: "该路径不是可发布的公开页面",
    });
    await pageTarget.fill("https://outside.invalid/qa");
    await expect(pageTargetError).toHaveText(
      "该路径不是可发布的公开页面；商品详情请使用「商品」目标。",
    );
    await pageTarget.fill("/catalog?source=editor-qa");
    await expect(pageTarget).toHaveValue("/catalog?source=editor-qa");
    await expect(pageTargetError).toHaveCount(0);

    await target.getByRole("button", { name: "分类" }).click();
    await inspector.getByRole("button", { name: "选择分类 QA 戒指" }).click();
    await expect(inspector.getByRole("button", { name: "移除分类 QA 戒指" })).toBeVisible();

    await target.getByRole("button", { name: "外链" }).click();
    const externalTarget = inspector.getByRole("textbox", { name: /HTTPS 外部链接/ });
    const externalTargetError = inspector.getByRole("alert").filter({
      hasText: "外部链接必须是完整的 HTTPS 地址",
    });
    await externalTarget.fill("http://outside.invalid/qa");
    await expect(externalTargetError).toHaveText("外部链接必须是完整的 HTTPS 地址。");
    await externalTarget.fill("https://outside.invalid/qa");
    await expect(externalTargetError).toHaveCount(0);
    await attachViewport(page, testInfo, "p0-action-copy-and-target");
    expect(forbiddenWrites).toEqual([]);
  });

  test("页面实例与独立模板工作区分别保持移动端上下文", async ({ page }, testInfo) => {
    const forbiddenWrites: string[] = [];
    const { frame, inspector } = await openEditor(page, { forbiddenWrites });
    await page.getByRole("button", { name: /移动端布局/ }).click();
    await expect(page.getByRole("button", { name: /移动端布局/ })).toHaveAttribute("aria-pressed", "true");
    await expect(inspector.getByRole("region", { name: "当前编辑对象" })).toHaveAttribute("data-active-device", "mobile");
    await expectPageInstanceBoundary(page, frame, inspector);

    const workspace = await enterTemplateWorkspace(page);
    await page.getByRole("button", { name: /移动端模板布局/ }).click();
    await expect(page.getByRole("button", { name: /移动端模板布局/ })).toHaveAttribute("aria-pressed", "true");
    await expect(workspace.inspector.getByText("移动端布局", { exact: false })).toBeVisible();
    await attachViewport(page, testInfo, "template-mobile-context");
    expect(forbiddenWrites).toEqual([]);
  });

  test("页面实例只保留内容字段，母模板图形控件进入独立属性分区", async ({ page }, testInfo) => {
    const forbiddenWrites: string[] = [];
    const { frame, inspector } = await openEditor(page, { forbiddenWrites });
    await expectPageInstanceBoundary(page, frame, inspector);
    await expect(inspector.locator('[data-inspector-field="desktopImage"]')).toHaveCount(1);
    await expect(inspector.locator('[data-inspector-field="title"]')).toHaveCount(1);
    await expect(inspector.getByRole("group", { name: /对象圆角|对象阴影|快速定位/ })).toHaveCount(0);

    const workspace = await enterTemplateWorkspace(page);
    const structureTools = page.getByLabel("模板结构工具");
    await expect(structureTools.locator(".template-editor__node-palette-target"))
      .toContainText("快捷添加位置");
    await expect(structureTools).toContainText("更多内容类型");
    await expect(structureTools).toContainText("布局容器");
    await expect(structureTools).not.toContainText(/Slot|技术布局节点|兼容组件/);
    const clippedQuickSlotLabels = await structureTools
      .locator(".template-editor__node-tools--core strong")
      .evaluateAll((labels) => labels
        .filter((label) => label.scrollWidth > label.clientWidth + 1)
        .map((label) => label.textContent));
    expect(clippedQuickSlotLabels).toEqual([]);
    await attachViewport(page, testInfo, "template-structure-quick-add-target");
    await page.getByRole("treeitem", { name: /首屏区/ }).click();
    await expect(workspace.inspector.getByRole("tabpanel")).toBeVisible();
    await expect(workspace.inspector.getByRole("tab")).toHaveCount(3);
    await expect(workspace.inspector.getByRole("tab", { name: "结构" }))
      .toHaveAttribute("aria-selected", "true");
    const canvasControls = page.locator(".template-editor__canvas-controls--editable");
    const sizeTrigger = canvasControls.getByRole("button", { name: /^模板尺寸：/ });
    await expect(sizeTrigger).toContainText(/桌面端.*1920.*随内容/);
    await expect(canvasControls.getByRole("button", { name: /^视图辅助/ })).toBeVisible();
    const controlsOverflow = await canvasControls.evaluate(
      (element) => Math.max(0, element.scrollWidth - element.clientWidth),
    );
    expect(controlsOverflow).toBeLessThanOrEqual(1);
    await attachViewport(page, testInfo, "template-canvas-toolbar-compact");
    await sizeTrigger.click();
    await expect(page.getByRole("group", { name: "模板整体尺寸" })).toBeVisible();
    await attachViewport(page, testInfo, "template-canvas-size-settings");
    await page.keyboard.press("Escape");
    await workspace.inspector.getByRole("tab", { name: "布局样式" }).click();
    await expect(workspace.inspector.locator('[data-workspace-field-control]').first()).toBeVisible();
    await attachViewport(page, testInfo, "template-property-task-partitions");
    expect(forbiddenWrites).toEqual([]);
  });

  test("商品页面不混入母模板样式设计，单品模板从独立目录进入", async ({ page }) => {
    const forbiddenWrites: string[] = [];
    const { frame, inspector } = await openEditor(page, {
      forbiddenWrites,
      draft: makeProductDraft(),
    });
    await expectPageInstanceBoundary(page, frame, inspector);
    await expect(inspector.locator('[data-inspector-field="productCode"]')).toHaveCount(1);
    await expect(inspector.getByRole("group", { name: /模板配色|模块留白|模块圆角|模块阴影/ })).toHaveCount(0);

    await enterTemplateWorkspace(page);
    await page.getByRole("button", { name: "打开单品展示模板" }).click();
    await expect(page.getByRole("button", { name: "正在编辑单品展示模板" })).toBeVisible();
    const templateInspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    await expect(templateInspector.getByRole("tabpanel")).toBeVisible();
    expect(forbiddenWrites).toEqual([]);
  });

  test("商品画布点击保持模板整体属性，母模板结构只在独立工作区出现", async ({ page }) => {
    const forbiddenWrites: string[] = [];
    const { frame, inspector } = await openEditor(page, {
      forbiddenWrites,
      draft: makeProductDraft(),
    });
    await frame.locator('[data-content-role="product"]:visible').first().click();
    await expectPageInstanceBoundary(page, frame, inspector);
    for (const key of ["productCode", "title", "summary", "primaryText", "secondaryText"]) {
      await expect(inspector.locator('[data-inspector-field="' + key + '"]')).toHaveCount(1);
    }

    await enterTemplateWorkspace(page);
    await page.getByRole("button", { name: "打开单品展示模板" }).click();
    await expect(page.getByRole("tree", { name: "模板区域与槽位" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "模板属性", exact: true })).toBeVisible();
    expect(forbiddenWrites).toEqual([]);
  });

  const representativeTemplates = [
    {
      name: "DoublePoster",
      draft: makeDoublePosterDraft,
      allFields: [
        "mainImage",
        "mainAltText",
        "detailImage",
        "detailAltText",
        "title",
        "description",
        "number",
        "label",
        "actionText",
        "targetType",
      ],
    },
    {
      name: "Video",
      draft: makeVideoDraft,
      allFields: [
        "videoUrl",
        "posterUrl",
        "videoDescription",
        "title",
        "subtitle",
        "actionText",
        "targetType",
        "autoPlay",
        "loop",
        "muted",
        "showControls",
      ],
    },
    {
      name: "Product",
      draft: makeProductDraft,
      allFields: [
        "productCode",
        "eyebrow",
        "title",
        "summary",
        "primaryText",
        "secondaryText",
        "secondaryLinkTarget",
        "showPrice",
      ],
    },
    {
      name: "Collection",
      draft: makeCollectionDraft,
      allFields: ["items", "title", "subtitle"],
    },
  ] as const;

  for (const representative of representativeTemplates) {
    test(`代表固定模板内容全部展开：${representative.name}`, async ({ page }) => {
      const forbiddenWrites: string[] = [];
      const { inspector } = await openEditor(page, {
        forbiddenWrites,
        draft: representative.draft(),
      });
      await expect(
        inspector.getByRole("combobox", { name: "选择编辑对象" }),
      ).toHaveCount(0);
      await expect(inspector.getByRole("region", { name: "当前编辑对象" }))
        .toContainText("全部内容");
      for (const field of representative.allFields) {
        await expect(
          inspector.locator(`[data-inspector-field="${field}"]`),
          `${representative.name} 顶层字段 ${field} 应同时可见`,
        ).toHaveCount(1);
      }
      expect(forbiddenWrites).toEqual([]);
    });
  }

  test("视频来源失败可定位、保留原值并通过重试或清除恢复", async ({ page }) => {
    const forbiddenWrites: string[] = [];
    const draft = makeVideoDraft();
    draft.puckData.content[0].props.videoUrl = "/video/bad.mp4";
    const { frame, inspector } = await openEditor(page, { forbiddenWrites, draft });
    await expect(
      inspector.getByRole("combobox", { name: "选择编辑对象" }),
    ).toHaveCount(0);
    await expect(inspector.locator('[data-inspector-field="videoDescription"] textarea')).toHaveValue(
      "工匠在工作台前手工錾刻金饰",
    );
    await expect(frame.locator("video")).toHaveAttribute("aria-label", "工匠在工作台前手工錾刻金饰");
    const videoError = inspector.getByText(/无法读取该视频。地址已保留/);
    await expect(videoError).toBeVisible();
    await inspector.getByRole("button", { name: "重试" }).click();
    await expect(videoError).toContainText("地址已保留");

    const videoField = inspector.locator('[data-media-field="videoUrl"]');
    await videoField.getByRole("button", { name: "链接" }).click();
    const videoUrlInput = videoField.getByPlaceholder(/粘贴视频地址/);
    await videoUrlInput.fill("");
    await videoField.getByRole("button", { name: "确认" }).click();
    await expect(videoField.getByText("拖入视频或点击上传")).toBeVisible();
    await expect(videoError).toHaveCount(0);
    expect(forbiddenWrites).toEqual([]);
  });

  test("DoublePoster 页面内容与独立母模板历史互不混写", async ({ page }, testInfo) => {
    const forbiddenWrites: string[] = [];
    const { frame, inspector } = await openEditor(page, {
      forbiddenWrites,
      draft: makeDoublePosterDraft(),
    });
    await expectPageInstanceBoundary(page, frame, inspector);
    await expect(inspector.locator('[data-inspector-field="mainImage"]')).toHaveCount(1);
    await expect(inspector.locator('[data-inspector-field="detailImage"]')).toHaveCount(1);

    await enterTemplateWorkspace(page);
    await page.getByRole("button", { name: "打开双图文模板" }).click();
    const templateInspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    const versionNote = templateInspector.getByLabel("版本说明");
    const original = await versionNote.inputValue();
    await versionNote.fill("DoublePoster 独立历史 QA");
    const undo = page.getByRole("button", { name: "撤销", exact: true });
    await expect(undo).toBeEnabled();
    await undo.click();
    await expect(versionNote).toHaveValue(original);
    await attachViewport(page, testInfo, "double-poster-independent-history");
    expect(forbiddenWrites).toEqual([]);
  });

  test("母模板桌面与移动几何由独立工作区设备上下文分别呈现", async ({ page }) => {
    const forbiddenWrites: string[] = [];
    const { frame, inspector } = await openEditor(page, { forbiddenWrites });
    await expectPageInstanceBoundary(page, frame, inspector);

    const workspace = await enterTemplateWorkspace(page);
    await page.getByRole("treeitem", { name: /首屏区/ }).click();
    await expect(workspace.inspector.getByText("桌面端布局", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: /桌面端模板布局/ })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: /移动端模板布局/ }).click();
    await expect(workspace.inspector.getByText("移动端布局", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: /移动端模板布局/ })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: /桌面端模板布局/ }).click();
    await expect(workspace.inspector.getByText("桌面端布局", { exact: false })).toBeVisible();
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

    const footer = inspector.locator(".homepage-editor__properties-actions");
    const currentFields = scroll.locator("[data-inspector-field]:visible");
    const fieldCount = await currentFields.count();
    expect(fieldCount).toBeGreaterThan(1);
    const previousField = currentFields.nth(fieldCount - 2);
    const lastField = currentFields.nth(fieldCount - 1);
    await scroll.evaluate((element) => element.scrollTo({
      top: element.scrollHeight,
      behavior: "auto",
    }));
    await expect.poll(() => scroll.evaluate((element) =>
      Math.abs(element.scrollTop - Math.max(0, element.scrollHeight - element.clientHeight)),
    )).toBeLessThanOrEqual(1);
    const [previousFieldBox, lastFieldBox, footerBox] = await Promise.all([
      previousField.boundingBox(),
      lastField.boundingBox(),
      footer.boundingBox(),
    ]);
    if (!previousFieldBox || !lastFieldBox || !footerBox) {
      throw new Error("200% 重排后缺少末尾字段或属性底栏尺寸");
    }
    expect(lastFieldBox.y).toBeGreaterThanOrEqual(previousFieldBox.y);
    expect(lastFieldBox.y + lastFieldBox.height).toBeLessThanOrEqual(footerBox.y + 1);

    const focusableSelector = [
      "a[href]:visible",
      "button:not([disabled]):visible",
      "input:not([disabled]):not([type='hidden']):visible",
      "select:not([disabled]):visible",
      "textarea:not([disabled]):visible",
      "[tabindex]:not([tabindex='-1']):not([disabled]):visible",
    ].join(", ");
    const previousFieldLastControl = previousField.locator(focusableSelector).last();
    const lastFieldFirstControl = lastField.locator(focusableSelector).first();
    const lastFieldLastControl = lastField.locator(focusableSelector).last();
    await expect(previousFieldLastControl).toBeVisible();
    await expect(lastFieldFirstControl).toBeVisible();
    await previousFieldLastControl.focus();
    await page.keyboard.press("Tab");
    await expect(lastFieldFirstControl).toBeFocused();
    await lastFieldLastControl.focus();
    await page.keyboard.press("Tab");
    await expect.poll(() => scroll.evaluate((element) =>
      !element.contains(document.activeElement),
    )).toBe(true);
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.matches([
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled]):not([type='hidden'])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "iframe",
      "[tabindex]:not([tabindex='-1']):not([disabled])",
    ].join(", ")) ?? false)).toBe(true);

    await attachViewport(page, testInfo, "editor-css-zoom-200pct-836x471");
    expect(forbiddenWrites).toEqual([]);
  });
});
