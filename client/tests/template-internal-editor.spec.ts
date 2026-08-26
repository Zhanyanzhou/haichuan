import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

const appMode = process.env.PLAYWRIGHT_APP_MODE === "mock" ? "mock" : "development";

const fixtureSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900">
    <rect width="1600" height="900" fill="#d8d6d0"/>
    <circle cx="1120" cy="360" r="230" fill="#f7f5ef"/>
  </svg>
`;

const fixtureHtml = `<!doctype html>
  <html lang="zh-CN">
    <head>
      <meta charset="utf-8" />
      <style>
        * { box-sizing: border-box; }
        body { margin: 0; background: #e8ebec; }
        .template-internal-fixture { min-height: 100vh; }
        .template-internal-fixture .homepage-editor__toolbar {
          position: relative;
          z-index: 5;
          width: 100%;
        }
        .template-internal-fixture__inspector {
          position: fixed;
          z-index: 4;
          top: 76px;
          left: 16px;
          width: 350px;
          max-height: calc(100vh - 92px);
          overflow: auto;
          padding: 16px;
          border: 1px solid #d9dddd;
          background: #f8f9f9;
        }
        .template-internal-fixture__inspector output,
        .template-internal-fixture__inspector pre {
          display: block;
          margin-top: 8px;
          overflow-wrap: anywhere;
          white-space: pre-wrap;
          font-size: 10px;
        }
        .template-internal-fixture__canvas {
          min-width: 0;
          margin-left: 382px;
          padding: 20px;
        }
        .template-internal-fixture__canvas iframe {
          min-height: 920px !important;
        }
      </style>
    </head>
    <body>
      <div id="root"></div>
      <script type="module">
        import RefreshRuntime from "/@react-refresh";
        RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {};
        window.$RefreshSig$ = () => (type) => type;
        window.__vite_plugin_react_preamble_installed__ = true;
      </script>
      <script type="module" src="/tests/fixtures/template-internal-editor.tsx"></script>
    </body>
  </html>`;

function json(data: unknown) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ code: 200, data, message: "success" }),
  };
}

function isForbiddenEditorWrite(method: string, url: string) {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method) &&
    /\/page-modules\/document(?:\/publish|\/draft)?$/.test(new URL(url).pathname);
}

function makeEmptyDraft() {
  return {
    id: 9601,
    pageKey: "home",
    puckData: { content: [], zones: {}, root: { props: {} } },
    metadata: {},
    editorVersion: "0.22.4",
    status: "DRAFT",
    version: 0,
    publishedAt: null,
    publishedBy: null,
    updatedAt: "2026-08-23T00:00:00.000Z",
  };
}

function makeHeroDraft() {
  const draft = makeEmptyDraft();
  return {
    ...draft,
    id: 9602,
    puckData: {
      ...draft.puckData,
      content: [
        {
          type: "首屏主视觉",
          props: {
            id: "template-editor-history-hero",
            desktopImage: "/svg/template-hero.svg",
            mobileImage: "/svg/template-hero.svg",
            eyebrow: "",
            title: "",
            subtitle: "",
            actionText: "",
            targetType: "none",
          },
        },
      ],
    },
  };
}

function makeLegacyHeroOverrideDraft() {
  const draft = makeHeroDraft();
  const props = draft.puckData.content[0].props as Record<string, any>;
  props.__contentTemplate = { key: "hero", version: 2 };
  props.__instanceOverrides = {
    version: 2,
    nodes: {
      title: {
        rectByViewport: {
          desktop: { x: 0.12, y: 0.5, width: 0.6, height: 0.12 },
          mobile: { x: 0.2, y: 0.62, width: 0.6, height: 0.12 },
        },
      },
      mobileImage: {
        rectByViewport: {
          mobile: { x: 0, y: 0, width: 0.94, height: 1 },
        },
      },
    },
  };
  return draft;
}

function makeSinglePosterDraft({ emptyCopy = false }: { emptyCopy?: boolean } = {}) {
  const draft = makeEmptyDraft();
  return {
    ...draft,
    id: 9604,
    pageKey: "products",
    puckData: {
      ...draft.puckData,
      content: [
        {
          type: "单图海报",
          props: {
            id: emptyCopy
              ? "template-editor-single-poster-empty-copy"
              : "template-editor-single-poster-copy",
            desktopImage: "/svg/template-hero.svg",
            mobileImage: "/svg/template-hero.svg",
            number: emptyCopy ? "" : "01",
            label: emptyCopy ? "" : "EDITORIAL",
            title: emptyCopy ? "" : "单图文布局标题",
            subtitle: emptyCopy ? "" : "验证完整编辑器中的文案区域拖动。",
            actionText: "",
            targetType: "none",
          },
        },
      ],
    },
  };
}

function makeFullBleedDraft() {
  const draft = makeEmptyDraft();
  return {
    ...draft,
    id: 9605,
    pageKey: "products",
    puckData: {
      ...draft.puckData,
      content: [
        {
          type: "全屏出血图",
          props: {
            id: "template-editor-full-bleed-copy",
            image: "/svg/template-hero.svg",
            mobileImage: "/svg/template-hero.svg",
            eyebrow: "EDITORIAL",
            title: "通栏图下方说明",
            subtitle: "验证真实编辑器中的说明带首次微调。",
            buttonText: "",
            targetType: "none",
            altText: "通栏珠宝图片",
          },
        },
      ],
    },
  };
}

function makeDoublePosterDraft() {
  const draft = makeEmptyDraft();
  return {
    ...draft,
    id: 9606,
    pageKey: "products",
    puckData: {
      ...draft.puckData,
      content: [
        {
          type: "双图海报",
          props: {
            id: "template-editor-double-poster-copy",
            number: "02",
            label: "EDITORIAL",
            title: "双图海报说明",
            description: "验证主图、说明与细节图固定骨架中的首次微调。",
            mainImage: "/svg/template-hero.svg",
            detailImage: "/svg/template-hero.svg",
            actionText: "",
            targetType: "none",
            mainAltText: "双图海报主图",
            detailAltText: "双图海报细节图",
          },
        },
      ],
    },
  };
}

function makeLimitedEventDraft() {
  const draft = makeEmptyDraft();
  return {
    ...draft,
    id: 9607,
    pageKey: "products",
    puckData: {
      ...draft.puckData,
      content: [
        {
          type: "限时活动",
          props: {
            id: "template-editor-limited-event-copy",
            eventImage: "/svg/template-hero.svg",
            eyebrow: "CAMPAIGN",
            title: "限时活动说明",
            body: "验证活动视觉、倒计时与说明区域中的首次微调。",
            targetDate: "2030-12-31T23:59:59.000Z",
            benefits: [{ value: "预约优先" }],
            buttonText: "",
            linkUrl: "",
            bgColor: "#FFFFFF",
          },
        },
      ],
    },
  };
}

function makeHeroMovementDraft() {
  const draft = makeEmptyDraft();
  return {
    ...draft,
    id: 9608,
    pageKey: "products",
    puckData: {
      ...draft.puckData,
      content: [
        {
          type: "首屏主视觉",
          props: {
            id: "template-editor-hero-movement",
            desktopImage: "/svg/template-hero.svg",
            mobileImage: "/svg/template-hero.svg",
            altText: "首屏珠宝主视觉",
            eyebrow: "THE HOUSE",
            title: "首屏叙事标题",
            subtitle: "验证桌面安全区与移动堆叠阅读顺序。",
            actionText: "探索作品",
            targetType: "page",
            linkUrl: "/products",
          },
        },
      ],
    },
  };
}

function makeTextBannerMovementDraft() {
  const draft = makeEmptyDraft();
  return {
    ...draft,
    id: 9609,
    pageKey: "products",
    puckData: {
      ...draft.puckData,
      content: [
        {
          type: "文字横幅",
          props: {
            id: "template-editor-text-banner-movement",
            eyebrow: "EDITORIAL",
            title: "留白中的章节声明",
            body: "验证纯文字模板只使用受控对齐和留白预设。",
            buttonText: "了解更多",
            targetType: "page",
            linkUrl: "/about",
            template: "center",
            spacing: "normal",
          },
        },
      ],
    },
  };
}

function makeBookingMovementDraft() {
  const draft = makeEmptyDraft();
  return {
    ...draft,
    id: 9610,
    pageKey: "products",
    puckData: {
      ...draft.puckData,
      content: [
        {
          type: "预约入口",
          props: {
            id: "template-editor-booking-movement",
            title: "预约鉴赏",
            subtitle: "由珠宝顾问安排一对一服务。",
            buttonText: "立即预约",
            targetType: "page",
            linkUrl: "/contact",
          },
        },
      ],
    },
  };
}

function makeCraftDetailsDraft() {
  const draft = makeEmptyDraft();
  return {
    ...draft,
    id: 9603,
    puckData: {
      ...draft.puckData,
      content: [
        {
          type: "工艺细节",
          props: {
            id: "template-editor-craft-details",
            eyebrow: "CRAFT STUDY",
            title: "工艺细节闭环标题",
            body: "仅使用已核验的材质与制作说明。",
            leadImage: "/svg/template-hero.svg",
            leadAltText: "珠宝工艺主图",
            detailImageOne: "/svg/template-hero.svg",
            detailOneAltText: "珠宝材质细节一",
            detailImageTwo: "/svg/template-hero.svg",
            detailTwoAltText: "珠宝材质细节二",
            leadImageRatio: "3:2",
            detailOneRatio: "1:1",
            detailTwoRatio: "1:1",
            leadFocusX: 50,
            leadFocusY: 50,
            detailOneFocusX: 50,
            detailOneFocusY: 50,
            detailTwoFocusX: 50,
            detailTwoFocusY: 50,
            bgColor: "#FFFFFF",
          },
        },
      ],
    },
  };
}

async function authenticateAdmin(page: Page) {
  await page.goto("/admin/login");
  await page.evaluate(() => {
    const user = {
      id: 1,
      username: "template-editor-ui-test",
      realName: "装修 UI 测试管理员",
      role: "SUPER_ADMIN",
    };
    localStorage.setItem("token", "template-editor-ui-test-token");
    localStorage.setItem(
      "jewelry-auth",
      JSON.stringify({
        state: {
          token: "template-editor-ui-test-token",
          user,
          isLoggedIn: true,
        },
        version: 0,
      }),
    );
  });
}

async function mockEditorApis(
  page: Page,
  draft: Record<string, any> = makeEmptyDraft(),
  forbiddenWrites: string[] = [],
) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = request.url();
    const pathname = new URL(url).pathname;
    if (isForbiddenEditorWrite(request.method(), url)) {
      forbiddenWrites.push(`${request.method()} ${pathname}`);
      return route.fulfill({ status: 409, contentType: "application/json", body: "{}" });
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
    return route.fulfill(json({}));
  });
}

async function expectFullShellFirstNodeNudgeStable({
  page,
  draft,
  contractKey,
  nodeId = "copy",
  forbiddenWrites,
}: {
  page: Page;
  draft: Record<string, any>;
  contractKey: string;
  nodeId?: string;
  forbiddenWrites: string[];
}) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await authenticateAdmin(page);
  await mockEditorApis(page, draft, forbiddenWrites);
  await page.goto("/admin/editor/products");
  await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();

  const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
  const root = canvas.locator(`[data-content-template-contract="${contractKey}"]`).first();
  const node = root.locator(`[data-hc-keyboard-node="${nodeId}"]:visible`).first();
  await expect(node).toBeVisible();
  await node.click();
  await root.locator(`[data-hc-node-hud][data-node-id="${nodeId}"]`)
    .getByRole("button", { name: "调整对象区域" }).click();
  await expect(root).toHaveAttribute("data-visual-editor-mode", "adjust-layout");

  const before = await node.boundingBox();
  if (!before) throw new Error(`${contractKey}.${nodeId} 没有键盘微调前尺寸`);
  const instanceStyle = root.locator("style[data-hc-instance-overrides]");
  const readInstanceStyle = async () =>
    (await instanceStyle.count()) > 0
      ? (await instanceStyle.textContent()) ?? ""
      : "";
  const initialStyle = await readInstanceStyle();
  const undo = page.getByRole("button", { name: "撤销" });
  await expect(undo).toBeDisabled();

  await node.press("ArrowRight");
  await expect.poll(readInstanceStyle).not.toBe(initialStyle);
  expect(await readInstanceStyle()).toContain("aspect-ratio:");
  const after = await node.boundingBox();
  if (!after) throw new Error(`${contractKey}.${nodeId} 键盘微调后没有尺寸`);
  const geometryEvidence = JSON.stringify({ contractKey, nodeId, before, after });
  expect(after.x - before.x, geometryEvidence).toBeGreaterThan(1);
  expect(after.x - before.x, geometryEvidence).toBeLessThanOrEqual(24);
  expect(Math.abs(after.y - before.y), geometryEvidence).toBeLessThanOrEqual(3);
  expect(Math.abs(after.width - before.width), geometryEvidence).toBeLessThanOrEqual(3);
  expect(Math.abs(after.height - before.height), geometryEvidence).toBeLessThanOrEqual(3);

  await expect(undo).toBeEnabled();
  await undo.click();
  await expect.poll(readInstanceStyle).toBe(initialStyle);
}

async function expectManagedFlowNodes({
  page,
  draft,
  contractKey,
  viewport,
  nodeIds,
  forbiddenWrites,
}: {
  page: Page;
  draft: Record<string, any>;
  contractKey: string;
  viewport: "desktop" | "mobile";
  nodeIds: string[];
  forbiddenWrites: string[];
}) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await authenticateAdmin(page);
  await mockEditorApis(page, draft, forbiddenWrites);
  await page.goto("/admin/editor/products");
  await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();

  const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
  if (viewport === "mobile") {
    await page.getByRole("button", { name: /移动端布局/ }).click();
    await expect.poll(() => canvas.locator("html").evaluate(() => window.innerWidth))
      .toBeLessThanOrEqual(480);
  }
  const root = canvas.locator(`[data-content-template-contract="${contractKey}"]`).first();
  const inspector = page.getByRole("region", { name: "属性面板" });
  const objectPicker = inspector.getByRole("combobox", { name: "选择编辑对象" });
  const copyToOther = inspector.getByRole("button", {
    name: `复制到${viewport === "desktop" ? "移动端" : "桌面端"}`,
  });
  const instanceStyle = root.locator("style[data-hc-instance-overrides]");
  const readInstanceStyle = async () =>
    (await instanceStyle.count()) > 0
      ? (await instanceStyle.textContent()) ?? ""
      : "";
  const initialStyle = await readInstanceStyle();

  for (const nodeId of nodeIds) {
    await objectPicker.selectOption(nodeId);
    await inspector.getByRole("tab", { name: "模板编辑" }).click();
    await expect(inspector.getByText(/位置由(?:移动端堆叠|模板流式布局控制)/)).toBeVisible();
    await expect(inspector.getByRole("group", { name: /快速定位/ })).toHaveCount(0);
    await expect(copyToOther).toBeDisabled();
    await expect(root.locator(`[data-hc-node-hud][data-node-id="${nodeId}"]`)).toHaveCount(0);
  }

  await expect.poll(readInstanceStyle).toBe(initialStyle);
  await expect(page.getByRole("button", { name: "撤销" })).toBeDisabled();
}

async function expectManagedFlowLegacyRecovery({
  page,
  draft,
  contractKey,
  viewport,
  nodeId,
  nodeSelector,
  resetLabel,
  forbiddenWrites,
}: {
  page: Page;
  draft: Record<string, any>;
  contractKey: string;
  viewport: "desktop" | "mobile";
  nodeId: string;
  nodeSelector: string;
  resetLabel: string;
  forbiddenWrites: string[];
}) {
  draft.puckData.content[0].props.__instanceOverrides = {
    version: 2,
    nodes: {
      [nodeId]: {
        rectByViewport: {
          desktop: { x: 0.08, y: 0.56, width: 0.48, height: 0.18 },
          mobile: { x: 0.06, y: 0.38, width: 0.88, height: 0.2 },
        },
        zIndexByViewport: { desktop: 3, mobile: 4 },
      },
    },
  };
  await page.setViewportSize({ width: 1600, height: 1000 });
  await authenticateAdmin(page);
  await mockEditorApis(page, draft, forbiddenWrites);
  await page.goto("/admin/editor/products");
  await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();

  const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
  if (viewport === "mobile") {
    await page.getByRole("button", { name: /移动端布局/ }).click();
    await expect.poll(() => canvas.locator("html").evaluate(() => window.innerWidth))
      .toBeLessThanOrEqual(480);
  }
  const root = canvas.locator(`[data-content-template-contract="${contractKey}"]`).first();
  const visualNode = root.locator(nodeSelector).first();
  await expect(visualNode).toBeVisible();
  const instanceStyle = root.locator("style[data-hc-instance-overrides]");
  const styleText = (await instanceStyle.count()) > 0
    ? (await instanceStyle.textContent()) ?? ""
    : "";
  const activeMediaCondition = viewport === "mobile"
    ? "(max-width:767px)"
    : "(min-width:768px)";
  const activeNodeRule = styleText.split("@media ").slice(1).some((mediaRule) =>
    mediaRule.startsWith(activeMediaCondition) &&
    mediaRule.includes(`"${nodeId}"`) &&
    (mediaRule.includes("position:absolute!important") || mediaRule.includes("z-index:")),
  );
  expect(activeNodeRule, JSON.stringify({ contractKey, nodeId, viewport, styleText })).toBe(false);
  const beforeReset = await visualNode.boundingBox();
  if (!beforeReset) throw new Error(`${contractKey}.${nodeId} 恢复前没有可见几何`);
  const inspector = page.getByRole("region", { name: "属性面板" });
  await inspector.getByRole("combobox", { name: "选择编辑对象" }).selectOption(nodeId);
  await inspector.getByRole("tab", { name: "模板编辑" }).click();
  const reset = inspector.getByRole("button", { name: resetLabel });
  const undo = page.getByRole("button", { name: "撤销" });
  const redo = page.getByRole("button", { name: "重做" });
  await expect(reset).toBeVisible();
  await expect(undo).toBeDisabled();
  await reset.click();
  await expect(reset).toHaveCount(0);
  await expect(undo).toBeEnabled();
  const afterReset = await visualNode.boundingBox();
  if (!afterReset) throw new Error(`${contractKey}.${nodeId} 恢复后没有可见几何`);
  const geometryEvidence = JSON.stringify({ contractKey, nodeId, viewport, beforeReset, afterReset });
  expect(Math.abs(afterReset.x - beforeReset.x), geometryEvidence).toBeLessThanOrEqual(32);
  expect(Math.abs(afterReset.y - beforeReset.y), geometryEvidence).toBeLessThanOrEqual(32);
  expect(Math.abs(afterReset.width - beforeReset.width), geometryEvidence).toBeLessThanOrEqual(32);
  expect(Math.abs(afterReset.height - beforeReset.height), geometryEvidence).toBeLessThanOrEqual(32);
  await undo.click();
  await expect(reset).toBeVisible();
  await expect(redo).toBeEnabled();
  await redo.click();
  await expect(reset).toHaveCount(0);
}

async function openComponentFixture(page: Page) {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.route(/\/__template-internal-editor(?:\?.*)?$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: fixtureHtml,
    }),
  );
  await page.route("**/svg/template-hero.svg", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: fixtureSvg,
    }),
  );
  await page.goto("/__template-internal-editor");
  await expect(page.getByRole("note")).toContainText("不调用保存、发布或后端接口");
  await expect(page.locator("iframe")).toHaveCount(1);
  await page.getByRole("button", { name: /桌面端布局/ }).click();
  await expect(page.getByTestId("viewport-state")).toHaveText("desktop");
  await expect.poll(async () =>
    page.frameLocator("iframe").locator("html").evaluate(() => window.innerWidth),
  ).toBeGreaterThan(767);
}

async function readFixtureData(page: Page) {
  return JSON.parse((await page.getByTestId("fixture-data-state").textContent()) || "null") as {
    content: Array<{ type: string; props: Record<string, any> }>;
  };
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

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  const screenshotPath = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path: screenshotPath, animations: "disabled" });
  await testInfo.attach(name, { path: screenshotPath, contentType: "image/png" });
}

type PuckPerformanceWarning = {
  kind: "setData" | "set";
  text: string;
  location: { url: string; lineNumber: number; columnNumber: number };
};

function observePuckPerformanceWarnings(page: Page) {
  const warnings: PuckPerformanceWarning[] = [];
  page.on("console", (message) => {
    if (message.type() !== "warning") return;
    const text = message.text();
    if (!text.includes("expensive") || (!text.includes("`setData`") && !text.includes("`set`"))) {
      return;
    }
    warnings.push({
      kind: text.includes("`setData`") ? "setData" : "set",
      text,
      location: message.location(),
    });
  });

  return {
    drain() {
      const snapshot = warnings.splice(0, warnings.length);
      return snapshot;
    },
  };
}

function observeAntdStaticContextWarnings(page: Page) {
  const warnings: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    if (text.includes("Static function can not consume context")) warnings.push(text);
  });
  return warnings;
}

async function attachPuckWarningEvidence(
  testInfo: TestInfo,
  name: string,
  phases: Record<string, PuckPerformanceWarning[]>,
) {
  const summary = Object.fromEntries(
    Object.entries(phases).map(([phase, warnings]) => [
      phase,
      {
        setData: warnings.filter((warning) => warning.kind === "setData").length,
        set: warnings.filter((warning) => warning.kind === "set").length,
        warnings,
      },
    ]),
  );
  console.info(`[puck-performance] ${name} ${JSON.stringify(summary)}`);
  await testInfo.attach(`${name}.json`, {
    body: JSON.stringify(summary, null, 2),
    contentType: "application/json",
  });
  return summary;
}

function heroOverrides(data: Awaited<ReturnType<typeof readFixtureData>>) {
  return data.content.find((block) => block.props.id === "template-internal-hero")
    ?.props.__instanceOverrides as Record<string, any> | undefined;
}

async function expectInside(
  outer: { x: number; y: number; width: number; height: number },
  inner: { x: number; y: number; width: number; height: number },
) {
  expect(inner.x).toBeGreaterThanOrEqual(outer.x - 1);
  expect(inner.y).toBeGreaterThanOrEqual(outer.y - 1);
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width + 1);
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height + 1);
}

test.describe("模板内部编辑器（真实产品组件集成；不含后端持久化）", () => {
  let forbiddenWrites: string[];

  test.beforeEach(async ({ page }) => {
    forbiddenWrites = [];
    page.on("request", (request) => {
      if (isForbiddenEditorWrite(request.method(), request.url())) {
        forbiddenWrites.push(`${request.method()} ${new URL(request.url()).pathname}`);
      }
    });
    await openComponentFixture(page);
  });

  test.afterEach(() => {
    expect(forbiddenWrites).toEqual([]);
  });

  test("图片与文字可直接选择，图片构图可拖动，属性区随对象切换", async ({ page }, testInfo) => {
    const canvas = page.frameLocator("iframe");
    const media = canvas
      .locator('[data-content-role-desktop="desktopImage"]:visible')
      .first();
    const image = media.locator("img");
    const mediaBox = await image.boundingBox();
    if (!mediaBox) throw new Error("主图没有可操作尺寸");

    await image.click({
      position: { x: mediaBox.width * 0.82, y: mediaBox.height * 0.2 },
    });
    await expect(page.getByTestId("selected-visual-state")).toHaveText(
      "template-internal-hero:desktopImage:media",
    );
    const root = canvas.locator('[data-content-template-module="首屏主视觉"]').first();
    const hud = root.locator(
      '[data-hc-node-hud][data-node-id="desktopImage"][data-node-kind="media"]',
    );
    await expect(hud).toBeVisible();
    await expect(hud).toHaveAttribute("data-can-adjust-layout", "true");
    await expect(hud).toHaveAttribute("data-can-adjust-focus", "true");
    await expect(hud).toHaveAttribute("data-can-adjust-fit", "true");
    await expect(hud).toHaveAttribute("data-can-adjust-zoom", "true");
    await expect(hud.getByRole("button", { name: "调整对象区域" })).toBeVisible();
    await expect(hud.getByRole("button", { name: "调整图片构图" })).toBeVisible();
    await page.getByRole("tab", { name: "模板编辑" }).click();
    await hud.getByRole("button", { name: "调整图片构图" }).click();
    await expect(root).toHaveAttribute("data-hc-media-focus-enabled", "true");
    // 模板设计模式会隐藏真实图片并展示可操作槽位；拖动目标应绑定槽位，
    // 同时等待 Puck 重挂后的合同布局变量恢复非零尺寸。
    const mediaSlot = canvas
      .locator('[data-content-role-desktop="desktopImage"]')
      .first();
    await expect.poll(async () => (await mediaSlot.boundingBox())?.height ?? 0)
      .toBeGreaterThan(0);
    const dragBox = await mediaSlot.boundingBox();
    if (!dragBox) throw new Error("主图槽位在构图模式下没有尺寸");
    await page.mouse.move(dragBox.x + dragBox.width * 0.75, dragBox.y + dragBox.height * 0.25);
    await page.mouse.down();
    await page.mouse.move(
      dragBox.x + dragBox.width * 0.75 + 70,
      dragBox.y + dragBox.height * 0.25 + 30,
      { steps: 8 },
    );
    await page.mouse.up();

    await expect.poll(async () =>
      heroOverrides(await readFixtureData(page))?.nodes?.desktopImage?.mediaView
        ?.focusByViewport?.desktop,
    ).not.toEqual(undefined);

    await page.getByRole("tab", { name: "内容编辑" }).click();
    const title = canvas.locator('[data-hc-keyboard-node="title"]:visible').first();
    await title.click();
    await expect(page.getByTestId("selected-visual-state")).toHaveText(
      "template-internal-hero:title:text",
    );
    await expect(page.getByRole("button", { name: "调整图片构图" })).toHaveCount(0);
    await expect(root.locator('[data-hc-node-hud][data-node-id="title"]')
      .getByRole("button", { name: "调整对象区域" })).toBeVisible();
    await attachScreenshot(page, testInfo, "template-object-selection-and-media-focus");
  });

  test("拖动受模块边界约束，吸附辅助线在拖动中可观测且松手清理", async ({ page }) => {
    const canvas = page.frameLocator("iframe");
    const root = canvas.locator('[data-content-template-module="首屏主视觉"]').first();
    const title = canvas.locator('[data-hc-keyboard-node="title"]:visible').first();

    await title.click();
    await root.locator('[data-hc-node-hud][data-node-id="title"]')
      .getByRole("button", { name: "调整对象区域" }).click();

    const rootBox = await root.boundingBox();
    const titleBox = await title.boundingBox();
    if (!rootBox || !titleBox) throw new Error("标题或模块没有布局尺寸");
    await page.mouse.move(titleBox.x + titleBox.width / 2, titleBox.y + titleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(rootBox.x + 2, rootBox.y + 2, {
      steps: 12,
    });

    await expect(root).toHaveAttribute("data-hc-snap-active", "true");
    await expect.poll(async () => root.locator("[data-hc-snap-guide]").count()).toBeGreaterThan(0);
    const guides = await root.locator("[data-hc-snap-guide]").evaluateAll((nodes) =>
      nodes.map((node) => ({
        axis: node.getAttribute("data-axis"),
        kind: node.getAttribute("data-snap-kind"),
      })),
    );
    expect(guides.every((guide) => guide.axis === "x" || guide.axis === "y")).toBe(true);
    expect(
      guides.every((guide) =>
        ["frame-edge", "frame-center", "node-edge", "node-center"].includes(
          guide.kind || "",
        ),
      ),
    ).toBe(true);
    await page.mouse.up();
    await expect(root).not.toHaveAttribute("data-hc-snap-active", "true");
    await expect(root.locator("[data-hc-snap-guide]")).toHaveCount(0);

    const movedBox = await title.boundingBox();
    if (!movedBox) throw new Error("拖动后的标题没有布局尺寸");
    await expectInside(rootBox, movedBox);
    await expect.poll(async () =>
      heroOverrides(await readFixtureData(page))?.nodes?.title?.rectByViewport
        ?.desktop,
    ).not.toEqual(undefined);
  });

  test("8 个方向把手分别改变对应边、写入 store 且不越出模块", async ({ page }, testInfo) => {
    const warningProbe = observePuckPerformanceWarnings(page);
    const canvas = page.frameLocator("iframe");
    const root = canvas.locator('[data-content-template-module="首屏主视觉"]').first();
    const title = canvas.locator('[data-hc-keyboard-node="title"]:visible').first();
    await expect.poll(async () => root.evaluate((element) =>
      element.style.getPropertyValue("--hc-node-title-desktop-width"),
    )).not.toBe("");
    const rootBox = await root.boundingBox();
    if (!rootBox) throw new Error("模块没有布局尺寸");
    const undo = page.getByRole("button", { name: "撤销" });
    const edgeTolerancePx = 4;
    const directions = {
      n: { dx: 0, dy: -24, name: "调整对象大小：上边" },
      ne: { dx: 24, dy: -24, name: "调整对象大小：右上角" },
      e: { dx: 24, dy: 0, name: "调整对象大小：右边" },
      se: { dx: 24, dy: 24, name: "调整对象大小：右下角" },
      s: { dx: 0, dy: 24, name: "调整对象大小：下边" },
      sw: { dx: -24, dy: 24, name: "调整对象大小：左下角" },
      w: { dx: -24, dy: 0, name: "调整对象大小：左边" },
      nw: { dx: -24, dy: -24, name: "调整对象大小：左上角" },
    } as const;

    for (const [direction, movement] of Object.entries(directions)) {
      await title.click();
      await root.locator('[data-hc-node-hud][data-node-id="title"]')
        .getByRole("button", { name: "调整对象区域" }).click();
      const handles = root.locator('button[data-hc-resize-handle][data-node-id="title"]');
      await expect(handles).toHaveCount(8);
      const handle = root.locator(
        `button[data-hc-resize-handle][data-node-id="title"][data-resize-direction="${direction}"]`,
      );
      await expect(handle).toHaveCount(1);
      await expect(handle).toHaveAccessibleName(movement.name);
      const hitTarget = await handle.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const topElement = document.elementFromPoint(
          box.x + box.width / 2,
          box.y + box.height / 2,
        );
        return {
          matches: topElement === element,
          tagName: topElement?.tagName,
          nodeId: topElement?.getAttribute("data-node-id"),
          resizeDirection: topElement?.getAttribute("data-resize-direction"),
          hudMode: topElement?.getAttribute("data-hc-hud-mode"),
        };
      });
      expect(
        hitTarget.matches,
        `${direction} 把手被其他元素遮挡：${JSON.stringify(hitTarget)}`,
      ).toBe(true);

      const before = await title.boundingBox();
      const handleBox = await handle.boundingBox();
      const storeBefore = heroOverrides(await readFixtureData(page))?.nodes?.title
        ?.rectByViewport?.desktop;
      if (!before || !handleBox) throw new Error(`${direction} 缺少缩放前尺寸`);
      await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        handleBox.x + handleBox.width / 2 + movement.dx,
        handleBox.y + handleBox.height / 2 + movement.dy,
        { steps: 8 },
      );
      await page.mouse.up();
      await expect.poll(async () => JSON.stringify(
        heroOverrides(await readFixtureData(page))?.nodes?.title?.rectByViewport
          ?.desktop,
      )).not.toBe(JSON.stringify(storeBefore));
      await expect(root).not.toHaveAttribute("data-hc-gesture-phase");

      const after = await title.boundingBox();
      if (!after) throw new Error(`${direction} 缺少缩放后尺寸`);
      await expectInside(rootBox, after);
      const beforeRight = before.x + before.width;
      const afterRight = after.x + after.width;
      const beforeBottom = before.y + before.height;
      const afterBottom = after.y + after.height;
      if (direction.includes("e")) {
        expect(afterRight).toBeGreaterThan(beforeRight + 1);
        expect(Math.abs(after.x - before.x)).toBeLessThan(edgeTolerancePx);
      } else if (direction.includes("w")) {
        expect(after.x).toBeLessThan(before.x - 1);
        expect(Math.abs(afterRight - beforeRight)).toBeLessThan(edgeTolerancePx);
      } else {
        expect(Math.abs(after.x - before.x), `${direction} 不应改变横向位置`).toBeLessThan(edgeTolerancePx);
        expect(
          Math.abs(after.width - before.width),
          `${direction} 不应改变宽度（before=${JSON.stringify(before)} after=${JSON.stringify(after)}）`,
        ).toBeLessThan(edgeTolerancePx);
      }
      if (direction.includes("s")) {
        expect(afterBottom).toBeGreaterThan(beforeBottom + 1);
        expect(Math.abs(after.y - before.y)).toBeLessThan(edgeTolerancePx);
      } else if (direction.includes("n")) {
        expect(after.y).toBeLessThan(before.y - 1);
        expect(Math.abs(afterBottom - beforeBottom)).toBeLessThan(edgeTolerancePx);
      } else {
        expect(Math.abs(after.y - before.y), `${direction} 不应改变纵向位置`).toBeLessThan(edgeTolerancePx);
        expect(Math.abs(after.height - before.height), `${direction} 不应改变高度`).toBeLessThan(edgeTolerancePx);
      }
      if (direction === "nw") {
        await attachScreenshot(page, testInfo, "template-eight-direction-resize");
      }

      await expect(undo).toBeEnabled();
      await undo.click();
      await expect.poll(async () => JSON.stringify(
        heroOverrides(await readFixtureData(page))?.nodes?.title?.rectByViewport
          ?.desktop,
      )).toBe(JSON.stringify(storeBefore));
      if (direction !== "nw") {
        await page.reload();
        await expect(page.getByRole("note")).toContainText("不调用保存、发布或后端接口");
        await expect(page.locator("iframe")).toHaveCount(1);
        await page.getByRole("button", { name: /桌面端布局/ }).click();
        await expect(page.getByTestId("viewport-state")).toHaveText("desktop");
        await expect.poll(async () => root.evaluate((element) =>
          element.style.getPropertyValue("--hc-node-title-desktop-width"),
        )).not.toBe("");
      }
    }
    await attachPuckWarningEvidence(testInfo, "eight-resize-handles", {
      resizeAndUndo: warningProbe.drain(),
    });
  });

  test("文字框可从左右边调宽，8 个把手保持在模块边界内", async ({ page }) => {
    const canvas = page.frameLocator("iframe");
    const root = canvas.locator('[data-content-template-module="首屏主视觉"]').first();
    const title = canvas.locator('[data-hc-keyboard-node="title"]:visible').first();
    await title.click();
    await root
      .locator('[data-hc-node-hud][data-node-id="title"]')
      .getByRole("button", { name: "调整对象区域" })
      .click();

    const before = await title.boundingBox();
    const east = root.locator(
      'button[data-hc-resize-handle][data-node-id="title"][data-resize-direction="e"]',
    );
    const eastBox = await east.boundingBox();
    const rootBox = await root.boundingBox();
    if (!before || !eastBox || !rootBox) throw new Error("文字框或右边缩放把手没有尺寸");
    await east.hover();
    await page.mouse.down();
    await page.mouse.move(eastBox.x + eastBox.width / 2 + 90, eastBox.y + eastBox.height / 2, {
      steps: 10,
    });
    await page.mouse.up();

    const after = await title.boundingBox();
    if (!after) throw new Error("文字框调宽后没有尺寸");
    expect(after.width).toBeGreaterThan(before.width + 2);
    expect(Math.abs(after.height - before.height)).toBeLessThan(3);
    await expectInside(rootBox, after);
  });

  test("Esc 与 pointercancel 取消本地预览并保持历史不变", async ({ page }) => {
    const canvas = page.frameLocator("iframe");
    const root = canvas.locator('[data-content-template-module="首屏主视觉"]').first();
    const title = canvas.locator('[data-hc-keyboard-node="title"]:visible').first();
    await title.click();
    const hud = root.locator('[data-hc-node-hud][data-node-id="title"]');
    await hud.getByRole("button", { name: "调整对象区域" }).click();
    const initialBox = await title.boundingBox();
    if (!initialBox) throw new Error("标题没有初始尺寸");
    const undo = page.getByRole("button", { name: "撤销" });
    const undoDisabledBefore = await undo.isDisabled();

    await page.mouse.move(initialBox.x + initialBox.width / 2, initialBox.y + initialBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(initialBox.x + initialBox.width / 2 + 80, initialBox.y + initialBox.height / 2 + 30, {
      steps: 10,
    });
    await expect(root).toHaveAttribute("data-hc-gesture-phase", "update");
    expect(heroOverrides(await readFixtureData(page))).toBeUndefined();
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(root).toHaveAttribute("data-hc-gesture-phase", "cancel");
    const afterEscape = await title.boundingBox();
    expect(afterEscape).toEqual(initialBox);
    expect(heroOverrides(await readFixtureData(page))).toBeUndefined();
    expect(await undo.isDisabled()).toBe(undoDisabledBefore);

    await hud.getByRole("button", { name: "调整对象区域" }).click();
    await page.mouse.move(initialBox.x + initialBox.width / 2, initialBox.y + initialBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(initialBox.x + initialBox.width / 2 - 60, initialBox.y + initialBox.height / 2, {
      steps: 8,
    });
    await expect(root).toHaveAttribute("data-hc-gesture-phase", "update");
    await root.dispatchEvent("pointercancel", { pointerId: 1 });
    await page.mouse.up();
    await expect(root).toHaveAttribute("data-hc-gesture-phase", "cancel");
    const afterPointerCancel = await title.boundingBox();
    expect(afterPointerCancel).toEqual(initialBox);
    expect(heroOverrides(await readFixtureData(page))).toBeUndefined();
    expect(await undo.isDisabled()).toBe(undoDisabledBefore);
  });

  test("Hero 标题只写入 Desktop 布局，Mobile 保持合同托管", async ({ page }) => {
    const canvas = page.frameLocator("iframe");
    const title = canvas.locator('[data-hc-keyboard-node="title"]:visible').first();
    await title.click();
    const root = canvas.locator('[data-content-template-module="首屏主视觉"]').first();
    await root.locator('[data-hc-node-hud][data-node-id="title"]')
      .getByRole("button", { name: "调整对象区域" }).click();
    await title.press("ArrowRight");

    const desktopRect = heroOverrides(await readFixtureData(page))?.nodes?.title
      ?.rectByViewport?.desktop;
    expect(desktopRect).toBeTruthy();

    await page.getByRole("button", { name: /移动端布局/ }).click();
    await expect(page.getByTestId("viewport-state")).toHaveText("mobile");
    await expect.poll(async () =>
      canvas.locator("html").evaluate(() => window.innerWidth),
    ).toBeLessThanOrEqual(480);
    const inheritedMobile = heroOverrides(await readFixtureData(page));
    expect(inheritedMobile?.nodes?.title?.rectByViewport?.mobile).toBeUndefined();
    await title.click();
    await expect(root.locator('[data-hc-node-hud][data-node-id="title"]')).toHaveCount(0);
    const beforeManagedKey = heroOverrides(await readFixtureData(page));
    await title.press("ArrowDown");
    const afterMobile = heroOverrides(await readFixtureData(page));
    expect(afterMobile).toEqual(beforeManagedKey);
    expect(afterMobile?.nodes?.title?.rectByViewport?.desktop).toEqual(desktopRect);
    expect(afterMobile?.nodes?.title?.rectByViewport?.mobile).toBeUndefined();

    await page.getByRole("button", { name: /桌面端布局/ }).click();
    await expect(page.getByTestId("viewport-state")).toHaveText("desktop");
    expect(
      heroOverrides(await readFixtureData(page))?.nodes?.title?.rectByViewport
        ?.desktop,
    ).toEqual(desktopRect);
  });

  test("顶部撤销、重做、复制、删除与预览均操作当前 Puck 画布", async ({ page }) => {
    const antdContextWarnings = observeAntdStaticContextWarnings(page);
    const canvas = page.frameLocator("iframe");
    await canvas.getByRole("button", { name: "选择“首屏主视觉”模块" }).click();
    await expect(page.getByTestId("selected-module-state")).toHaveText(
      "template-internal-hero",
    );

    const duplicate = page.getByRole("button", { name: "复制当前模块" });
    const remove = page.getByRole("button", { name: "删除当前模块" });
    const undo = page.getByRole("button", { name: "撤销" });
    const redo = page.getByRole("button", { name: "重做" });
    await expect(duplicate).toBeEnabled();
    await expect(remove).toBeEnabled();

    await duplicate.click();
    await expect.poll(async () => (await readFixtureData(page)).content.length).toBe(3);
    await expect(undo).toBeEnabled();

    await remove.click();
    const dialog = page.getByRole("dialog").filter({ hasText: "删除“" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "删除模块" }).click();
    await expect.poll(async () => (await readFixtureData(page)).content.length).toBe(2);

    await undo.click();
    await expect.poll(async () => (await readFixtureData(page)).content.length).toBe(3);
    await expect(redo).toBeEnabled();
    await redo.click();
    await expect.poll(async () => (await readFixtureData(page)).content.length).toBe(2);

    await page.getByRole("button", { name: "预览当前画布" }).click();
    expect(antdContextWarnings).toEqual([]);
    await expect(page.getByTestId("preview-state")).toHaveText("preview");
    await expect(page.getByRole("button", { name: "退出当前画布预览" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("preview-state")).toHaveText("edit");
  });
});

test.describe("完整后台壳（确定性 UI / 自有 API 网络夹具）", () => {
  test.skip(
    appMode === "mock",
    "该层在 development 模式用 page.route 替换自有 API；Mock 启动模式另有显式标识测试",
  );

  test("工艺细节从模板库真实拖入画布并暴露四个可编辑槽位；本用例不证明保存或发布持久化", async ({ page }, testInfo) => {
    const warningProbe = observePuckPerformanceWarnings(page);
    const forbiddenWrites: string[] = [];
    await page.setViewportSize({ width: 1600, height: 1000 });
    await authenticateAdmin(page);
    await mockEditorApis(page, makeEmptyDraft(), forbiddenWrites);
    await page.goto("/admin/editor/home");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
    const loadWarnings = warningProbe.drain();
    expect(loadWarnings, "初始载入不得重复执行 Puck 全树更新").toEqual([]);

    const card = page.getByRole("button", {
      name: "工艺细节：点击添加到页面末尾，也可拖到画布指定位置",
    });
    const canvasDocument = page.locator(".homepage-editor__canvas-document");
    await expect(card).toBeVisible();
    await card.scrollIntoViewIfNeeded();
    await expect(card).toBeInViewport();
    await expect(canvasDocument).toBeVisible();
    const cardBox = await card.boundingBox();
    const canvasBox = await canvasDocument.boundingBox();
    if (!cardBox || !canvasBox) throw new Error("模块卡或画布没有布局尺寸");

    await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + 120, {
      steps: 14,
    });
    await expect(page.getByText("在此插入")).toBeVisible();
    await page.mouse.up();

    await expect(page.getByText("已插入“工艺细节”，可在右侧继续编辑")).toBeVisible();
    await expect(page.locator(".homepage-editor__layer-item")).toHaveCount(1);
    const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    const craftRoot = canvas.locator('[data-content-template-contract="craftDetails"]');
    await expect(craftRoot).toBeVisible();
    for (const role of ["leadImage", "copy", "detailImageOne", "detailImageTwo"]) {
      await expect(craftRoot.locator(`[data-content-role="${role}"]`)).toBeVisible();
    }
    await attachScreenshot(page, testInfo, "craft-details-library-insert-desktop");
    const topOperations = page.getByRole("toolbar", { name: "画布编辑操作" });
    await expect(topOperations.getByRole("button", { name: "撤销" })).toBeEnabled();
    await expect(
      topOperations.getByRole("button", { name: "复制当前模块" }),
    ).toBeEnabled();
    await expect(
      topOperations.getByRole("button", { name: "删除当前模块" }),
    ).toBeEnabled();
    const insertWarnings = warningProbe.drain();
    expect(insertWarnings).toEqual([]);

    const undo = topOperations.getByRole("button", { name: "撤销" });
    await expect(undo).toBeEnabled();
    // Puck 0.22.4 在 250ms 内合并历史记录；等待其落盘后再测试往返，
    // 避免测试自身在 debounce 完成前触发 Undo 并截断刚生成的 Redo。
    await page.waitForTimeout(300);
    await undo.click();
    await expect(page.locator(".homepage-editor__layer-item")).toHaveCount(0);
    const undoWarnings = warningProbe.drain();
    const redo = topOperations.getByRole("button", { name: "重做" });
    await expect(redo).toBeEnabled();
    await redo.click();
    await expect(page.locator(".homepage-editor__layer-item")).toHaveCount(1);
    const redoWarnings = warningProbe.drain();
    await attachPuckWarningEvidence(testInfo, "template-insert", {
      load: loadWarnings,
      insert: insertWarnings,
      undo: undoWarnings,
      redo: redoWarnings,
    });
    expect(forbiddenWrites).toEqual([]);
  });

  test("模板库支持拖拽定位、点击与键盘追加，且一次拖拽不会重复插入", async ({
    page,
  }) => {
    const forbiddenWrites: string[] = [];
    await page.setViewportSize({ width: 1600, height: 1000 });
    await authenticateAdmin(page);
    await mockEditorApis(page, makeEmptyDraft(), forbiddenWrites);
    await page.goto("/admin/editor/home");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();

    const card = page.getByRole("button", {
      name: "单图文：点击添加到页面末尾，也可拖到画布指定位置",
    });
    const canvasDocument = page.locator(".homepage-editor__canvas-document");
    const layers = page.locator(".homepage-editor__layer-item");
    await card.scrollIntoViewIfNeeded();
    const cardBox = await card.boundingBox();
    const canvasBox = await canvasDocument.boundingBox();
    if (!cardBox || !canvasBox) throw new Error("模块卡或画布没有布局尺寸");

    await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + 120, {
      steps: 14,
    });
    await page.mouse.up();
    await expect(layers, "拖拽释放只能插入一个模块").toHaveCount(1);

    await card.click();
    await expect(layers, "点击应追加一个模块").toHaveCount(2);

    await card.focus();
    await card.press("Enter");
    await expect(layers, "键盘 Enter 应追加一个模块").toHaveCount(3);
    await expect(card.locator(".homepage-editor__template-usage")).toHaveText(
      "已添加 3 / 5",
    );
    expect(forbiddenWrites).toEqual([]);
  });

  test("一次连续内部拖动只产生一条可撤销历史；本用例不证明服务端持久化", async ({
    page,
  }, testInfo) => {
    const warningProbe = observePuckPerformanceWarnings(page);
    const forbiddenWrites: string[] = [];
    await page.setViewportSize({ width: 1600, height: 1000 });
    await authenticateAdmin(page);
    await mockEditorApis(page, makeHeroDraft(), forbiddenWrites);
    await page.goto("/admin/editor/home");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
    const loadWarnings = warningProbe.drain();
    expect(loadWarnings, "初始载入不得重复执行 Puck 全树更新").toEqual([]);

    const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    const title = canvas.locator('[data-hc-keyboard-node="title"]:visible').first();
    await expect(title).toBeVisible();
    await title.click();
    const root = canvas.locator('[data-content-template-module="首屏主视觉"]').first();
    await root.locator('[data-hc-node-hud][data-node-id="title"]')
      .getByRole("button", { name: "调整对象区域" }).click();
    const selectWarnings = warningProbe.drain();
    const instanceStyle = canvas
      .locator('[data-content-template-module="首屏主视觉"]')
      .locator("style[data-hc-instance-overrides]");
    const readInstanceStyle = async () =>
      (await instanceStyle.count()) > 0
        ? (await instanceStyle.textContent()) ?? ""
        : "";
    const initialInstanceStyle = await readInstanceStyle();
    const initialBox = await title.boundingBox();
    if (!initialBox) throw new Error("真实编辑器标题没有初始布局尺寸");
    await page.keyboard.down("Alt");
    await page.mouse.move(
      initialBox.x + initialBox.width / 2,
      initialBox.y + initialBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      initialBox.x + initialBox.width / 2 + 90,
      initialBox.y + initialBox.height / 2 - 28,
      { steps: 16 },
    );
    await page.mouse.up();
    await page.keyboard.up("Alt");

    const movedBox = await title.boundingBox();
    if (!movedBox) throw new Error("真实编辑器标题拖动后没有布局尺寸");
    expect(Math.abs(movedBox.x - initialBox.x) + Math.abs(movedBox.y - initialBox.y)).toBeGreaterThan(2);
    const movedInstanceStyle = await readInstanceStyle();
    expect(movedInstanceStyle).not.toBe(initialInstanceStyle);
    const dragWarnings = warningProbe.drain();

    const undo = page.getByRole("button", { name: "撤销" });
    const redo = page.getByRole("button", { name: "重做" });
    await expect(undo).toBeEnabled();
    await undo.click();
    await expect.poll(readInstanceStyle).toBe(initialInstanceStyle);
    const undoWarnings = warningProbe.drain();

    await expect(redo).toBeEnabled();
    await redo.click();
    await expect.poll(readInstanceStyle).toBe(movedInstanceStyle);
    const redoWarnings = warningProbe.drain();
    await attachPuckWarningEvidence(testInfo, "continuous-object-drag", {
      load: loadWarnings,
      select: selectWarnings,
      drag: dragWarnings,
      undo: undoWarnings,
      redo: redoWarnings,
    });
    await attachScreenshot(page, testInfo, "template-shell-single-history-step");
    expect(forbiddenWrites).toEqual([]);
  });

  test("Hero 移动主图可由鼠标选择并用键盘调整焦点，Undo/Redo 精确往返", async ({
    page,
  }) => {
    const forbiddenWrites: string[] = [];
    const draft = makeHeroDraft();
    Object.assign(draft.puckData.content[0].props, {
      eyebrow: "HCPUCK 移动端眉题",
      title: "HCPUCK 移动端主标题",
      subtitle: "HCPUCK 移动端正文",
      __contentTemplate: { key: "hero", version: 5 },
      __instanceOverrides: {
        version: 2,
        frame: {
          aspectRatioByViewport: { mobile: 0.8 },
        },
        nodes: {
          mobileImage: {
            rectByViewport: {
              mobile: { x: 0, y: 0, width: 1, height: 1 },
            },
          },
        },
      },
    });
    await page.setViewportSize({ width: 1600, height: 1000 });
    await authenticateAdmin(page);
    await page.route("**/svg/template-hero.svg", (route) =>
      route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        body: fixtureSvg,
      }),
    );
    await mockEditorApis(page, draft, forbiddenWrites);
    await page.goto("/admin/editor/home");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
    await page.getByRole("button", { name: /移动端布局/ }).click();

    const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    await expect.poll(() => canvas.locator("html").evaluate(() => window.innerWidth))
      .toBeLessThanOrEqual(480);
    const root = canvas.locator('[data-content-template-contract="hero"]').first();
    const mobileImage = root.locator(
      '[data-hc-keyboard-node="mobileImage"][data-content-role-mobile="mobileImage"]:visible',
    ).first();
    await expect(mobileImage).toBeVisible();
    await expect.poll(() => mobileImage.locator("img").evaluate((image) =>
      (image as HTMLImageElement).naturalWidth,
    )).toBeGreaterThan(0);

    const title = root.locator('[data-hc-keyboard-node="title"]:visible').first();
    const subtitle = root.locator('[data-hc-keyboard-node="subtitle"]:visible').first();
    await title.click();
    await expect(root).toHaveAttribute("data-visual-selected-node", "title");

    const mediaBox = await mobileImage.boundingBox();
    if (!mediaBox) throw new Error("移动端 Hero 主图没有可点击尺寸");
    const mediaHit = await mobileImage.evaluate((media) => {
      const bounds = media.getBoundingClientRect();
      const target = document.elementFromPoint(
        bounds.left + bounds.width * 0.84,
        bounds.top + bounds.height * 0.72,
      );
      return {
        insideMedia: Boolean(target && media.contains(target)),
        field: target instanceof HTMLElement ? target.closest<HTMLElement>("[data-editor-field]")
          ?.dataset.editorField : undefined,
      };
    });
    expect(mediaHit).toEqual({
      insideMedia: true,
      field: "desktopImage mobileImage",
    });
    await page.mouse.click(
      mediaBox.x + mediaBox.width * 0.84,
      mediaBox.y + mediaBox.height * 0.72,
    );
    await expect(root).toHaveAttribute("data-visual-selected-node", "mobileImage");

    await subtitle.click();
    await expect(root).toHaveAttribute("data-visual-selected-node", "subtitle");

    const inspector = page.getByRole("region", { name: "属性面板" });
    await inspector.getByRole("combobox", { name: "选择编辑对象" })
      .selectOption("mobileImage");
    await expect(root).toHaveAttribute("data-visual-selected-node", "mobileImage");
    await inspector.getByRole("tab", { name: "模板编辑" }).click();
    await mobileImage.focus();
    await mobileImage.press("Enter");
    await expect(root).toHaveAttribute("data-visual-editor-mode", "adjust-media");
    await expect(root).toHaveAttribute("data-hc-media-focus-enabled", "true");

    const instanceStyle = root.locator("style[data-hc-instance-overrides]");
    const readInstanceStyle = async () =>
      (await instanceStyle.count()) > 0
        ? (await instanceStyle.textContent()) ?? ""
        : "";
    const initialStyle = await readInstanceStyle();
    await mobileImage.press("ArrowRight");
    await expect.poll(readInstanceStyle).not.toBe(initialStyle);
    const movedStyle = await readInstanceStyle();
    expect(movedStyle).toContain("object-position:51% 50%!important");

    const undo = page.getByRole("button", { name: "撤销" });
    const redo = page.getByRole("button", { name: "重做" });
    await expect(undo).toBeEnabled();
    await undo.click();
    await expect.poll(readInstanceStyle).toBe(initialStyle);
    await expect(redo).toBeEnabled();
    await redo.click();
    await expect.poll(readInstanceStyle).toBe(movedStyle);
    expect(forbiddenWrites).toEqual([]);
  });

  test("旧 version=2 Hero 文档保留合法覆盖并在移动端忽略非法标题位置", async ({
    page,
  }) => {
    const forbiddenWrites: string[] = [];
    await page.setViewportSize({ width: 1600, height: 1000 });
    await authenticateAdmin(page);
    await mockEditorApis(page, makeLegacyHeroOverrideDraft(), forbiddenWrites);
    await page.goto("/admin/editor/home");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();

    const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    const root = canvas.locator('[data-content-template-contract="hero"]').first();
    const instanceStyle = root.locator("style[data-hc-instance-overrides]");
    const readInstanceStyle = async () => (await instanceStyle.textContent()) ?? "";
    await expect.poll(readInstanceStyle).toContain("--hc-node-title-desktop-left");
    await expect.poll(readInstanceStyle).not.toContain("--hc-node-title-mobile-left");
    await expect.poll(readInstanceStyle).toContain("--hc-node-mobileImage-mobile-width,94%");

    await page.getByRole("button", { name: /移动端布局/ }).click();
    await expect.poll(() => canvas.locator("html").evaluate(() => window.innerWidth))
      .toBeLessThanOrEqual(480);
    await expect(root.locator('[data-hc-keyboard-node="mobileImage"]:visible')).toBeVisible();
    await expect(root.locator('[data-hc-node-hud][data-node-id="title"]')).toHaveCount(0);
    expect(forbiddenWrites).toEqual([]);
  });

  test("singlePoster.copy 桌面端指针拖动提交一条可撤销历史", async ({
    page,
  }) => {
    const forbiddenWrites: string[] = [];
    await page.setViewportSize({ width: 1600, height: 1000 });
    await authenticateAdmin(page);
    await mockEditorApis(page, makeSinglePosterDraft(), forbiddenWrites);
    await page.goto("/admin/editor/products");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();

    const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    const root = canvas.locator('[data-content-template-contract="singlePoster"]').first();
    const copy = root.locator('[data-hc-keyboard-node="copy"]:visible').first();
    await expect(copy).toBeVisible();
    await copy.click();
    await root.locator('[data-hc-node-hud][data-node-id="copy"]')
      .getByRole("button", { name: "调整对象区域" }).click();
    await expect(root).toHaveAttribute("data-visual-editor-mode", "adjust-layout");

    const instanceStyle = root.locator("style[data-hc-instance-overrides]");
    const readInstanceStyle = async () =>
      (await instanceStyle.count()) > 0
        ? (await instanceStyle.textContent()) ?? ""
        : "";
    const initialStyle = await readInstanceStyle();
    const initialBox = await copy.boundingBox();
    if (!initialBox) throw new Error("singlePoster.copy 没有可拖动尺寸");

    const undo = page.getByRole("button", { name: "撤销" });
    const redo = page.getByRole("button", { name: "重做" });
    await expect(undo).toBeDisabled();
    await page.keyboard.down("Alt");
    await page.mouse.move(
      initialBox.x + initialBox.width / 2,
      initialBox.y + initialBox.height / 2,
    );
    await page.mouse.down();
    await expect(root).toHaveAttribute("data-hc-gesture-phase", "begin");
    await page.mouse.move(
      initialBox.x + initialBox.width / 2 + 60,
      initialBox.y + initialBox.height / 2 + 30,
      { steps: 12 },
    );
    await page.mouse.up();
    await page.keyboard.up("Alt");

    await expect.poll(readInstanceStyle).not.toBe(initialStyle);
    const movedStyle = await readInstanceStyle();
    expect(movedStyle).toContain("copy");
    await expect(undo).toBeEnabled();
    await undo.click();
    await expect.poll(readInstanceStyle).toBe(initialStyle);
    await expect(undo).toBeDisabled();
    await expect(redo).toBeEnabled();
    await redo.click();
    await expect.poll(readInstanceStyle).toBe(movedStyle);
    await expect(root).not.toHaveAttribute("data-hc-gesture-phase");
    expect(forbiddenWrites).toEqual([]);
  });

  test("singlePoster.copy 首次键盘微调不改变纵向位置或对象尺寸", async ({ page }) => {
    const forbiddenWrites: string[] = [];
    await page.setViewportSize({ width: 1600, height: 1000 });
    await authenticateAdmin(page);
    await mockEditorApis(page, makeSinglePosterDraft(), forbiddenWrites);
    await page.goto("/admin/editor/products");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();

    const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    const root = canvas.locator('[data-content-template-contract="singlePoster"]').first();
    const copy = root.locator('[data-hc-keyboard-node="copy"]:visible').first();
    await copy.click();
    await root.locator('[data-hc-node-hud][data-node-id="copy"]')
      .getByRole("button", { name: "调整对象区域" }).click();
    await expect(root).toHaveAttribute("data-visual-editor-mode", "adjust-layout");

    const before = await copy.boundingBox();
    if (!before) throw new Error("singlePoster.copy 没有键盘微调前尺寸");
    const instanceStyle = root.locator("style[data-hc-instance-overrides]");
    const readInstanceStyle = async () =>
      (await instanceStyle.count()) > 0
        ? (await instanceStyle.textContent()) ?? ""
        : "";
    const initialStyle = await readInstanceStyle();
    const undo = page.getByRole("button", { name: "撤销" });
    await expect(undo).toBeDisabled();

    await copy.press("ArrowRight");
    await expect.poll(readInstanceStyle).not.toBe(initialStyle);
    const after = await copy.boundingBox();
    if (!after) throw new Error("singlePoster.copy 键盘微调后没有尺寸");
    const geometryEvidence = JSON.stringify({ before, after });
    expect(after.x - before.x, geometryEvidence).toBeGreaterThan(1);
    expect(after.x - before.x, geometryEvidence).toBeLessThanOrEqual(24);
    expect(Math.abs(after.y - before.y), geometryEvidence).toBeLessThanOrEqual(3);
    expect(Math.abs(after.width - before.width), geometryEvidence).toBeLessThanOrEqual(3);
    expect(Math.abs(after.height - before.height), geometryEvidence).toBeLessThanOrEqual(3);

    await expect(undo).toBeEnabled();
    await undo.click();
    await expect.poll(readInstanceStyle).toBe(initialStyle);
    expect(forbiddenWrites).toEqual([]);
  });

  test("singlePoster.copy 移动端堆叠模式拒绝自由定位并保持当前视觉几何", async ({ page }) => {
    const forbiddenWrites: string[] = [];
    await page.setViewportSize({ width: 1600, height: 1000 });
    await authenticateAdmin(page);
    await mockEditorApis(page, makeSinglePosterDraft(), forbiddenWrites);
    await page.goto("/admin/editor/products");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();

    const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    const root = canvas.locator('[data-content-template-contract="singlePoster"]').first();
    const copy = root.locator('[data-hc-keyboard-node="copy"]:visible').first();
    await page.getByRole("button", { name: /移动端布局/ }).click();
    await expect.poll(() => canvas.locator("html").evaluate(() => window.innerWidth))
      .toBeLessThanOrEqual(480);
    await copy.click();
    const hud = root.locator('[data-hc-node-hud][data-node-id="copy"]');
    await expect(hud).toHaveCount(0);

    const before = await copy.boundingBox();
    if (!before) throw new Error("移动端 singlePoster.copy 没有键盘微调前尺寸");
    const instanceStyle = root.locator("style[data-hc-instance-overrides]");
    const readInstanceStyle = async () =>
      (await instanceStyle.count()) > 0
        ? (await instanceStyle.textContent()) ?? ""
        : "";
    const initialStyle = await readInstanceStyle();
    const undo = page.getByRole("button", { name: "撤销" });
    await expect(undo).toBeDisabled();

    await copy.press("ArrowRight");
    await expect.poll(readInstanceStyle).toBe(initialStyle);
    const after = await copy.boundingBox();
    if (!after) throw new Error("移动端 singlePoster.copy 键盘微调后没有尺寸");
    const geometryEvidence = JSON.stringify({ before, after });
    expect(Math.abs(after.x - before.x), geometryEvidence).toBeLessThanOrEqual(1);
    expect(Math.abs(after.y - before.y), geometryEvidence).toBeLessThanOrEqual(3);
    expect(Math.abs(after.width - before.width), geometryEvidence).toBeLessThanOrEqual(3);
    expect(Math.abs(after.height - before.height), geometryEvidence).toBeLessThanOrEqual(3);

    await expect(undo).toBeDisabled();
    expect(forbiddenWrites).toEqual([]);
  });

  test("singlePoster.copy 移动端堆叠模式可撤销恢复旧覆盖且保留桌面位置", async ({ page }) => {
    const forbiddenWrites: string[] = [];
    const draft = makeSinglePosterDraft();
    draft.puckData.content[0].props.__instanceOverrides = {
      version: 2,
      nodes: {
        copy: {
          rectByViewport: {
            desktop: { x: 0.12, y: 0.58, width: 0.28, height: 0.2 },
            mobile: { x: 0.1, y: 0.16, width: 0.8, height: 0.24 },
          },
          zIndexByViewport: { mobile: 4 },
        },
      },
    };
    await page.setViewportSize({ width: 1600, height: 1000 });
    await authenticateAdmin(page);
    await mockEditorApis(page, draft, forbiddenWrites);
    await page.goto("/admin/editor/products");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();

    const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    const root = canvas.locator('[data-content-template-contract="singlePoster"]').first();
    const copy = root.locator('[data-hc-keyboard-node="copy"]:visible').first();
    const instanceStyle = root.locator("style[data-hc-instance-overrides]");
    const readInstanceStyle = async () => (await instanceStyle.textContent()) ?? "";
    const safeDesktopOnlyStyle = await readInstanceStyle();
    expect(safeDesktopOnlyStyle).toContain("min-width:768px");
    expect(safeDesktopOnlyStyle).not.toContain("max-width:767px");

    await page.getByRole("button", { name: /移动端布局/ }).click();
    await expect.poll(() => canvas.locator("html").evaluate(() => window.innerWidth))
      .toBeLessThanOrEqual(480);
    await expect.poll(readInstanceStyle).toBe(safeDesktopOnlyStyle);
    await copy.click();
    const hud = root.locator('[data-hc-node-hud][data-node-id="copy"]');
    await expect(hud).toHaveCount(0);
    const inspector = page.getByRole("region", { name: "属性面板" });
    await inspector.getByRole("tab", { name: "模板编辑" }).click();
    await expect(inspector.getByText("位置由移动端堆叠模板控制")).toBeVisible();
    await expect(inspector.getByRole("group", { name: /快速定位/ })).toHaveCount(0);
    await expect(inspector.getByRole("button", { name: "复制到桌面端" })).toBeDisabled();
    const undo = page.getByRole("button", { name: "撤销" });
    const reset = inspector.getByRole("button", { name: "恢复移动端堆叠" });
    await expect(reset).toBeVisible();
    await expect(undo).toBeDisabled();
    await reset.click();
    await expect(reset).toHaveCount(0);
    await expect.poll(readInstanceStyle).toBe(safeDesktopOnlyStyle);
    await expect(undo).toBeEnabled();
    await undo.click();
    await expect(reset).toBeVisible();
    await expect.poll(readInstanceStyle).toBe(safeDesktopOnlyStyle);
    expect(forbiddenWrites).toEqual([]);
  });

  test("singlePoster.copy 空文案仍可用真实指针拖动和撤销", async ({ page }) => {
    const forbiddenWrites: string[] = [];
    await page.setViewportSize({ width: 1600, height: 1000 });
    await authenticateAdmin(page);
    await mockEditorApis(page, makeSinglePosterDraft({ emptyCopy: true }), forbiddenWrites);
    await page.goto("/admin/editor/products");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();

    const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    const root = canvas.locator('[data-content-template-contract="singlePoster"]').first();
    const inspector = page.getByRole("region", { name: "属性面板" });
    await inspector.getByRole("combobox", { name: "选择编辑对象" }).selectOption("copy");
    await inspector.getByRole("tab", { name: "模板编辑" }).click();
    const copy = root.locator('[data-hc-keyboard-node="copy"]:visible').first();
    await expect(copy).toBeVisible();
    await root.locator('[data-hc-node-hud][data-node-id="copy"]')
      .getByRole("button", { name: "调整对象区域" }).click();

    const instanceStyle = root.locator("style[data-hc-instance-overrides]");
    const readInstanceStyle = async () =>
      (await instanceStyle.count()) > 0
        ? (await instanceStyle.textContent()) ?? ""
        : "";
    const initialStyle = await readInstanceStyle();
    const initialBox = await copy.boundingBox();
    if (!initialBox || initialBox.height <= 0) {
      throw new Error("空文案 copy 没有稳定的可拖动占位尺寸");
    }
    const undo = page.getByRole("button", { name: "撤销" });
    const redo = page.getByRole("button", { name: "重做" });
    await expect(undo).toBeDisabled();
    await page.keyboard.down("Alt");
    await page.mouse.move(
      initialBox.x + initialBox.width / 2,
      initialBox.y + initialBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      initialBox.x + initialBox.width / 2 + 36,
      initialBox.y + initialBox.height / 2 - 18,
      { steps: 10 },
    );
    await page.mouse.up();
    await page.keyboard.up("Alt");

    await expect.poll(readInstanceStyle).not.toBe(initialStyle);
    const movedStyle = await readInstanceStyle();
    expect(movedStyle).toContain("copy");
    await undo.click();
    await expect.poll(readInstanceStyle).toBe(initialStyle);
    await expect(undo).toBeDisabled();
    await redo.click();
    await expect.poll(readInstanceStyle).toBe(movedStyle);
    expect(forbiddenWrites).toEqual([]);
  });

  test("fullBleed.copy 流式说明带在桌面和移动端拒绝自由定位", async ({ page }) => {
    const forbiddenWrites: string[] = [];
    await page.setViewportSize({ width: 1600, height: 1000 });
    await authenticateAdmin(page);
    await mockEditorApis(page, makeFullBleedDraft(), forbiddenWrites);
    await page.goto("/admin/editor/products");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();

    const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    const root = canvas.locator('[data-content-template-contract="fullBleed"]').first();
    const copy = root.locator('[data-hc-keyboard-node="copy"]:visible').first();
    await expect(copy).toBeVisible();
    await copy.click();
    await expect(root.locator('[data-hc-node-hud][data-node-id="copy"]')).toHaveCount(0);
    const inspector = page.getByRole("region", { name: "属性面板" });
    await inspector.getByRole("tab", { name: "模板编辑" }).click();
    await expect(inspector.getByText("位置由模板流式布局控制")).toBeVisible();
    await expect(inspector.getByRole("group", { name: /快速定位/ })).toHaveCount(0);
    await expect(inspector.getByRole("group", { name: /图层顺序/ })).toHaveCount(0);

    const before = await copy.boundingBox();
    if (!before) throw new Error("fullBleed.copy 没有桌面端键盘操作前尺寸");
    const instanceStyle = root.locator("style[data-hc-instance-overrides]");
    const readInstanceStyle = async () =>
      (await instanceStyle.count()) > 0
        ? (await instanceStyle.textContent()) ?? ""
        : "";
    const initialStyle = await readInstanceStyle();
    const undo = page.getByRole("button", { name: "撤销" });
    await expect(undo).toBeDisabled();

    await copy.press("ArrowRight");
    await expect.poll(readInstanceStyle).toBe(initialStyle);
    const after = await copy.boundingBox();
    if (!after) throw new Error("fullBleed.copy 桌面端键盘操作后没有尺寸");
    const geometryEvidence = JSON.stringify({ before, after });
    expect(Math.abs(after.x - before.x), geometryEvidence).toBeLessThanOrEqual(1);
    expect(Math.abs(after.y - before.y), geometryEvidence).toBeLessThanOrEqual(3);
    expect(Math.abs(after.width - before.width), geometryEvidence).toBeLessThanOrEqual(3);
    expect(Math.abs(after.height - before.height), geometryEvidence).toBeLessThanOrEqual(3);
    await expect(undo).toBeDisabled();

    await page.getByRole("button", { name: /移动端布局/ }).click();
    await expect.poll(() => canvas.locator("html").evaluate(() => window.innerWidth))
      .toBeLessThanOrEqual(480);
    await copy.click();
    await expect(root.locator('[data-hc-node-hud][data-node-id="copy"]')).toHaveCount(0);
    const mobileBefore = await copy.boundingBox();
    if (!mobileBefore) throw new Error("fullBleed.copy 没有移动端键盘操作前尺寸");
    await copy.press("ArrowRight");
    await expect.poll(readInstanceStyle).toBe(initialStyle);
    const mobileAfter = await copy.boundingBox();
    if (!mobileAfter) throw new Error("fullBleed.copy 移动端键盘操作后没有尺寸");
    const mobileGeometryEvidence = JSON.stringify({ before: mobileBefore, after: mobileAfter });
    expect(Math.abs(mobileAfter.x - mobileBefore.x), mobileGeometryEvidence).toBeLessThanOrEqual(1);
    expect(Math.abs(mobileAfter.y - mobileBefore.y), mobileGeometryEvidence).toBeLessThanOrEqual(3);
    expect(Math.abs(mobileAfter.width - mobileBefore.width), mobileGeometryEvidence).toBeLessThanOrEqual(3);
    expect(Math.abs(mobileAfter.height - mobileBefore.height), mobileGeometryEvidence).toBeLessThanOrEqual(3);
    await expect(undo).toBeDisabled();
    expect(forbiddenWrites).toEqual([]);
  });

  test("fullBleed.copy 旧双端位置覆盖可逐端撤销恢复", async ({ page }) => {
    const forbiddenWrites: string[] = [];
    const draft = makeFullBleedDraft();
    draft.puckData.content[0].props.__instanceOverrides = {
      version: 2,
      nodes: {
        copy: {
          rectByViewport: {
            desktop: { x: 0.08, y: 0.56, width: 0.68, height: 0.22 },
            mobile: { x: 0.08, y: 0.58, width: 0.84, height: 0.24 },
          },
          zIndexByViewport: { desktop: 3, mobile: 4 },
        },
      },
    };
    await page.setViewportSize({ width: 1600, height: 1000 });
    await authenticateAdmin(page);
    await mockEditorApis(page, draft, forbiddenWrites);
    await page.goto("/admin/editor/products");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();

    const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    const root = canvas.locator('[data-content-template-contract="fullBleed"]').first();
    const copy = root.locator('[data-hc-keyboard-node="copy"]:visible').first();
    const instanceStyle = root.locator("style[data-hc-instance-overrides]");
    const readInstanceStyle = async () =>
      (await instanceStyle.count()) > 0
        ? (await instanceStyle.textContent()) ?? ""
        : "";
    await expect.poll(readInstanceStyle).toBe("");

    await copy.click();
    const inspector = page.getByRole("region", { name: "属性面板" });
    await inspector.getByRole("tab", { name: "模板编辑" }).click();
    await expect(inspector.getByText("位置由模板流式布局控制")).toBeVisible();
    const undo = page.getByRole("button", { name: "撤销" });
    const redo = page.getByRole("button", { name: "重做" });
    const desktopReset = inspector.getByRole("button", { name: "恢复桌面端模板布局" });
    await expect(desktopReset).toBeVisible();
    await expect(undo).toBeDisabled();
    await desktopReset.click();
    await expect(desktopReset).toHaveCount(0);
    await expect(undo).toBeEnabled();
    await undo.click();
    await expect(desktopReset).toBeVisible();
    await expect(redo).toBeEnabled();
    await redo.click();
    await expect(desktopReset).toHaveCount(0);

    await page.getByRole("button", { name: /移动端布局/ }).click();
    await expect.poll(() => canvas.locator("html").evaluate(() => window.innerWidth))
      .toBeLessThanOrEqual(480);
    await copy.click();
    const mobileReset = inspector.getByRole("button", { name: "恢复移动端模板布局" });
    await expect(mobileReset).toBeVisible();
    await mobileReset.click();
    await expect(mobileReset).toHaveCount(0);
    await expect.poll(readInstanceStyle).toBe("");
    await expect(undo).toBeEnabled();
    await undo.click();
    await expect(mobileReset).toBeVisible();
    expect(forbiddenWrites).toEqual([]);
  });

  for (const scenario of [
    {
      contractKey: "hero",
      nodeId: "title",
      createDraft: makeHeroMovementDraft,
    },
    {
      contractKey: "limitedEvent",
      nodeId: "copy",
      createDraft: makeLimitedEventDraft,
    },
    {
      contractKey: "craftDetails",
      nodeId: "copy",
      createDraft: () => ({ ...makeCraftDetailsDraft(), pageKey: "products" }),
    },
  ]) {
    test(`${scenario.contractKey}.${scenario.nodeId} 首次键盘微调不改变纵向位置或对象尺寸`, async ({ page }) => {
      const forbiddenWrites: string[] = [];
      await expectFullShellFirstNodeNudgeStable({
        page,
        draft: scenario.createDraft(),
        contractKey: scenario.contractKey,
        nodeId: scenario.nodeId,
        forbiddenWrites,
      });
      expect(forbiddenWrites).toEqual([]);
    });
  }

  for (const scenario of [
    {
      contractKey: "hero",
      viewport: "mobile" as const,
      createDraft: makeHeroMovementDraft,
      nodeIds: ["eyebrow", "title", "subtitle", "actionText"],
    },
    {
      contractKey: "textBanner",
      viewport: "desktop" as const,
      createDraft: makeTextBannerMovementDraft,
      nodeIds: ["copy"],
    },
    {
      contractKey: "textBanner",
      viewport: "mobile" as const,
      createDraft: makeTextBannerMovementDraft,
      nodeIds: ["copy"],
    },
    {
      contractKey: "booking",
      viewport: "desktop" as const,
      createDraft: makeBookingMovementDraft,
      nodeIds: ["title", "subtitle", "buttonText"],
    },
    {
      contractKey: "booking",
      viewport: "mobile" as const,
      createDraft: makeBookingMovementDraft,
      nodeIds: ["title", "subtitle", "buttonText"],
    },
  ]) {
    test(`${scenario.contractKey} ${scenario.viewport} 固定阅读顺序拒绝自由定位`, async ({ page }) => {
      const forbiddenWrites: string[] = [];
      await expectManagedFlowNodes({
        page,
        draft: scenario.createDraft(),
        contractKey: scenario.contractKey,
        viewport: scenario.viewport,
        nodeIds: scenario.nodeIds,
        forbiddenWrites,
      });
      expect(forbiddenWrites).toEqual([]);
    });
  }

  for (const scenario of [
    {
      name: "hero.actionText 移动端堆叠",
      contractKey: "hero",
      viewport: "mobile" as const,
      createDraft: makeHeroMovementDraft,
      nodeId: "actionText",
      nodeSelector: '[data-editor-field~="actionText"]',
      resetLabel: "恢复移动端堆叠",
    },
    {
      name: "textBanner.copy 桌面端",
      contractKey: "textBanner",
      viewport: "desktop" as const,
      createDraft: makeTextBannerMovementDraft,
      nodeId: "copy",
      nodeSelector: '[data-content-role="copy"]',
      resetLabel: "恢复桌面端模板布局",
    },
    {
      name: "textBanner.copy 移动端",
      contractKey: "textBanner",
      viewport: "mobile" as const,
      createDraft: makeTextBannerMovementDraft,
      nodeId: "copy",
      nodeSelector: '[data-content-role="copy"]',
      resetLabel: "恢复移动端模板布局",
    },
    {
      name: "booking.buttonText 桌面端",
      contractKey: "booking",
      viewport: "desktop" as const,
      createDraft: makeBookingMovementDraft,
      nodeId: "buttonText",
      nodeSelector: '[data-editor-field~="buttonText"]',
      resetLabel: "恢复桌面端模板布局",
    },
    {
      name: "booking.buttonText 移动端",
      contractKey: "booking",
      viewport: "mobile" as const,
      createDraft: makeBookingMovementDraft,
      nodeId: "buttonText",
      nodeSelector: '[data-editor-field~="buttonText"]',
      resetLabel: "恢复移动端模板布局",
    },
  ]) {
    test(`${scenario.name}旧位置覆盖可撤销恢复`, async ({ page }) => {
      const forbiddenWrites: string[] = [];
      await expectManagedFlowLegacyRecovery({
        page,
        draft: scenario.createDraft(),
        contractKey: scenario.contractKey,
        viewport: scenario.viewport,
        nodeId: scenario.nodeId,
        nodeSelector: scenario.nodeSelector,
        resetLabel: scenario.resetLabel,
        forbiddenWrites,
      });
      expect(forbiddenWrites).toEqual([]);
    });
  }

  test("doublePoster.copy 不可拆分骨架在桌面和移动端拒绝自由定位", async ({ page }) => {
    const forbiddenWrites: string[] = [];
    await page.setViewportSize({ width: 1600, height: 1000 });
    await authenticateAdmin(page);
    await mockEditorApis(page, makeDoublePosterDraft(), forbiddenWrites);
    await page.goto("/admin/editor/products");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();

    const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    const root = canvas.locator('[data-content-template-contract="doublePoster"]').first();
    const copy = root.locator('[data-hc-keyboard-node="copy"]:visible').first();
    const instanceStyle = root.locator("style[data-hc-instance-overrides]");
    const readInstanceStyle = async () =>
      (await instanceStyle.count()) > 0
        ? (await instanceStyle.textContent()) ?? ""
        : "";
    const initialStyle = await readInstanceStyle();
    const undo = page.getByRole("button", { name: "撤销" });

    await copy.click();
    await expect(root.locator('[data-hc-node-hud][data-node-id="copy"]')).toHaveCount(0);
    const inspector = page.getByRole("region", { name: "属性面板" });
    await inspector.getByRole("tab", { name: "模板编辑" }).click();
    await expect(inspector.getByText("位置由模板流式布局控制")).toBeVisible();
    await expect(inspector.getByRole("group", { name: /快速定位/ })).toHaveCount(0);
    await expect(inspector.getByRole("group", { name: /图层顺序/ })).toHaveCount(0);
    const desktopBefore = await copy.boundingBox();
    if (!desktopBefore) throw new Error("doublePoster.copy 没有桌面端操作前尺寸");
    await copy.press("ArrowRight");
    await expect.poll(readInstanceStyle).toBe(initialStyle);
    const desktopAfter = await copy.boundingBox();
    if (!desktopAfter) throw new Error("doublePoster.copy 没有桌面端操作后尺寸");
    expect(desktopAfter).toEqual(desktopBefore);
    await expect(undo).toBeDisabled();

    await page.getByRole("button", { name: /移动端布局/ }).click();
    await expect.poll(() => canvas.locator("html").evaluate(() => window.innerWidth))
      .toBeLessThanOrEqual(480);
    await copy.click();
    await expect(root.locator('[data-hc-node-hud][data-node-id="copy"]')).toHaveCount(0);
    const mobileBefore = await copy.boundingBox();
    if (!mobileBefore) throw new Error("doublePoster.copy 没有移动端操作前尺寸");
    await copy.press("ArrowRight");
    await expect.poll(readInstanceStyle).toBe(initialStyle);
    const mobileAfter = await copy.boundingBox();
    if (!mobileAfter) throw new Error("doublePoster.copy 没有移动端操作后尺寸");
    expect(mobileAfter).toEqual(mobileBefore);
    await expect(undo).toBeDisabled();
    expect(forbiddenWrites).toEqual([]);
  });

  for (const recoveryViewport of ["desktop", "mobile"] as const) {
    test(`doublePoster.copy 专用属性面板可撤销恢复${recoveryViewport === "mobile" ? "移动端" : "桌面端"}旧位置覆盖`, async ({ page }) => {
      const forbiddenWrites: string[] = [];
      const draft = makeDoublePosterDraft();
      draft.puckData.content[0].props.__instanceOverrides = {
        version: 2,
        nodes: {
          copy: {
            rectByViewport: {
              desktop: { x: 0.62, y: 0.48, width: 0.32, height: 0.24 },
              mobile: { x: 0.06, y: 0.38, width: 0.88, height: 0.24 },
            },
            zIndexByViewport: { desktop: 3, mobile: 4 },
          },
        },
      };
      await page.setViewportSize({ width: 1600, height: 1000 });
      await authenticateAdmin(page);
      await mockEditorApis(page, draft, forbiddenWrites);
      await page.goto("/admin/editor/products");
      await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();

      const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
      if (recoveryViewport === "mobile") {
        await page.getByRole("button", { name: /移动端布局/ }).click();
        await expect.poll(() => canvas.locator("html").evaluate(() => window.innerWidth))
          .toBeLessThanOrEqual(480);
      }
      const inspector = page.getByRole("region", { name: "属性面板" });
      await inspector.getByRole("combobox", { name: "选择编辑对象" }).selectOption("copy");
      await inspector.getByRole("tab", { name: "模板编辑" }).click();
      const reset = inspector.getByRole("button", {
        name: `恢复${recoveryViewport === "mobile" ? "移动端" : "桌面端"}模板布局`,
      });
      const undo = page.getByRole("button", { name: "撤销" });
      await expect(reset).toBeVisible();
      await expect(inspector.getByRole("group", { name: /图层顺序/ })).toHaveCount(0);
      await expect(undo).toBeDisabled();
      await reset.click();
      await expect(reset).toHaveCount(0);
      await expect(undo).toBeEnabled();
      await undo.click();
      await expect(reset).toBeVisible();
      expect(forbiddenWrites).toEqual([]);
    });
  }

  test("limitedEvent.copy 移动端堆叠模式拒绝自由定位", async ({ page }) => {
    const forbiddenWrites: string[] = [];
    await page.setViewportSize({ width: 1600, height: 1000 });
    await authenticateAdmin(page);
    await mockEditorApis(page, makeLimitedEventDraft(), forbiddenWrites);
    await page.goto("/admin/editor/products");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();

    const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    const root = canvas.locator('[data-content-template-contract="limitedEvent"]').first();
    const copy = root.locator('[data-hc-keyboard-node="copy"]:visible').first();
    await page.getByRole("button", { name: /移动端布局/ }).click();
    await expect.poll(() => canvas.locator("html").evaluate(() => window.innerWidth))
      .toBeLessThanOrEqual(480);
    await copy.click();
    await expect(root.locator('[data-hc-node-hud][data-node-id="copy"]')).toHaveCount(0);
    const inspector = page.getByRole("region", { name: "属性面板" });
    await inspector.getByRole("tab", { name: "模板编辑" }).click();
    await expect(inspector.getByText("位置由移动端堆叠模板控制")).toBeVisible();
    await expect(inspector.getByRole("group", { name: /快速定位/ })).toHaveCount(0);
    const instanceStyle = root.locator("style[data-hc-instance-overrides]");
    const readInstanceStyle = async () =>
      (await instanceStyle.count()) > 0
        ? (await instanceStyle.textContent()) ?? ""
        : "";
    const initialStyle = await readInstanceStyle();
    const before = await copy.boundingBox();
    if (!before) throw new Error("limitedEvent.copy 没有移动端操作前尺寸");
    await copy.press("ArrowRight");
    await expect.poll(readInstanceStyle).toBe(initialStyle);
    const after = await copy.boundingBox();
    if (!after) throw new Error("limitedEvent.copy 没有移动端操作后尺寸");
    expect(after).toEqual(before);
    await expect(page.getByRole("button", { name: "撤销" })).toBeDisabled();
    expect(forbiddenWrites).toEqual([]);
  });

  test("另存到我的模板只提交双端布局，不提交图片、文字或业务内容", async ({ page }, testInfo) => {
    const warningProbe = observePuckPerformanceWarnings(page);
    const antdContextWarnings = observeAntdStaticContextWarnings(page);
    const maximumDepthErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" && message.text().includes("Maximum update depth exceeded")) {
        maximumDepthErrors.push(message.text());
      }
    });
    const forbiddenWrites: string[] = [];
    let createdBody: Record<string, any> | undefined;
    let createdTemplate: Record<string, any> | undefined;
    await page.setViewportSize({ width: 1600, height: 1000 });
    await authenticateAdmin(page);
    await mockEditorApis(page, makeHeroDraft(), forbiddenWrites);
    await page.route("**/api/page-modules/personal-content-templates", async (route) => {
      const request = route.request();
      if (request.method() === "GET") return route.fulfill(json(createdTemplate ? [createdTemplate] : []));
      if (request.method() !== "POST") return route.fallback();
      createdBody = request.postDataJSON();
      createdTemplate = {
        id: 701,
        ownerId: 1,
        name: createdBody?.name,
        moduleType: createdBody?.moduleType,
        contractKey: "hero",
        contractVersion: 3,
        layoutData: createdBody?.layoutData,
        contentDefaults: null,
        createdAt: "2026-08-24T00:00:00.000Z",
        updatedAt: "2026-08-24T00:00:00.000Z",
      };
      return route.fulfill(json(createdTemplate));
    });
    await page.goto("/admin/editor/home");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
    const loadWarnings = warningProbe.drain();
    expect(loadWarnings, "初始载入不得重复执行 Puck 全树更新").toEqual([]);

    const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    const heroRoot = canvas.locator('[data-content-template-contract="hero"]');
    const heroInstanceStyle = heroRoot.locator("style[data-hc-instance-overrides]");
    await canvas.locator('[data-hc-keyboard-node="desktopImage"]:visible').first().click();
    const inspector = page.getByRole("region", { name: "属性面板" });
    await inspector.getByRole("tab", { name: "模板编辑" }).click();
    await inspector.getByRole("group", { name: "对象圆角" })
      .getByRole("button", { name: "柔和" }).click();
    await expect.poll(() => heroInstanceStyle.textContent()).toContain("border-radius:8px!important");
    await inspector.getByRole("group", { name: "对象阴影" })
      .getByRole("button", { name: "悬浮" }).click();
    await expect.poll(() => heroInstanceStyle.textContent()).toContain("box-shadow:0 16px 36px rgba(24,26,27,.16)!important");
    await inspector.getByRole("combobox", { name: "选择编辑对象" }).selectOption("");
    await inspector.getByRole("group", { name: "模板配色" })
      .getByRole("button", { name: "柔灰" }).click();
    await expect.poll(() => heroInstanceStyle.textContent()).toContain("--hc-instance-background:#F7F8F8");
    await inspector.getByRole("button", { name: "另存到模板库" }).click();

    const dialog = page.getByRole("dialog", { name: "另存到模板库" });
    await expect(dialog).toContainText("默认仅保存桌面端与移动端布局");
    await expect(dialog.getByRole("checkbox", { name: /同时保存当前默认内容/ })).not.toBeChecked();
    await expect(dialog.locator('[data-content-template-preview="hero"]')).toHaveCount(2);
    await dialog.getByLabel("模板名称").fill("首屏构图 A");
    await dialog.getByRole("button", { name: "保存模板" }).click();
    await expect(page.getByText("「首屏构图 A」已保存到我的模板")).toBeVisible();
    const savedTemplate = page.getByRole("button", { name: "首屏构图 A：点击添加" });
    await expect(savedTemplate).toBeVisible();
    await expect(savedTemplate.locator('[data-content-template-preview="hero"]')).toHaveCount(1);
    await page.getByRole("toolbar", { name: "画布编辑操作" })
      .getByRole("button", { name: "删除当前模块" })
      .click();
    await page.getByRole("dialog").filter({ hasText: "删除“" }).getByRole("button", { name: "删除模块" }).click();
    await expect(canvas.locator('[data-content-template-contract="hero"]')).toHaveCount(0);
    const deleteWarnings = warningProbe.drain();
    await savedTemplate.click();
    const reappliedHero = canvas.locator('[data-content-template-contract="hero"]');
    await expect(reappliedHero).toHaveCount(1);
    const reappliedStyle = reappliedHero.locator("style[data-hc-instance-overrides]");
    await expect.poll(() => reappliedStyle.textContent()).toContain("--hc-instance-background:#F7F8F8");
    await expect.poll(() => reappliedStyle.textContent()).toContain("border-radius:8px!important");
    await expect.poll(() => reappliedStyle.textContent()).toContain("box-shadow:0 16px 36px rgba(24,26,27,.16)!important");
    const applyWarnings = warningProbe.drain();
    expect(applyWarnings).toEqual([]);
    await attachPuckWarningEvidence(testInfo, "personal-template-apply", {
      load: loadWarnings,
      delete: deleteWarnings,
      apply: applyWarnings,
    });

    expect(createdBody).toMatchObject({
      name: "首屏构图 A",
      moduleType: "首屏主视觉",
      layoutData: {
        version: 2,
        frame: { colorPreset: "mist" },
        nodes: {
          desktopImage: {
            appearance: { radiusPreset: "soft", shadowPreset: "lifted" },
          },
        },
      },
    });
    expect(Object.keys(createdBody ?? {}).sort()).toEqual(["layoutData", "moduleType", "name"]);
    const serializedLayout = JSON.stringify(createdBody?.layoutData ?? {});
    for (const forbidden of ["/svg/", "targetType", "linkUrl", "productId"]) {
      expect(serializedLayout).not.toContain(forbidden);
    }
    expect(antdContextWarnings).toEqual([]);
    expect(maximumDepthErrors, "个人模板保存与应用不得触发 React 更新循环").toEqual([]);
    expect(forbiddenWrites).toEqual([]);
  });

  test("显式勾选后保存并恢复合同白名单默认内容", async ({ page }) => {
    const forbiddenWrites: string[] = [];
    const draft = makeHeroDraft();
    draft.puckData.content[0].props.eyebrow = "COLLECTION";
    draft.puckData.content[0].props.title = "可复用默认标题";
    draft.puckData.content[0].props.subtitle = "只保存展示内容，不复制业务事实";
    draft.puckData.content[0].props.actionText = "查看系列";
    draft.puckData.content[0].props.linkUrl = "/catalog";

    let createdBody: Record<string, any> | undefined;
    let createdTemplate: Record<string, any> | undefined;
    await page.setViewportSize({ width: 1600, height: 1000 });
    await authenticateAdmin(page);
    await mockEditorApis(page, draft, forbiddenWrites);
    await page.route("**/api/page-modules/personal-content-templates", async (route) => {
      const request = route.request();
      if (request.method() === "GET") return route.fulfill(json(createdTemplate ? [createdTemplate] : []));
      if (request.method() !== "POST") return route.fallback();
      createdBody = request.postDataJSON();
      createdTemplate = {
        id: 702,
        ownerId: 1,
        name: createdBody?.name,
        moduleType: createdBody?.moduleType,
        contractKey: "hero",
        contractVersion: 3,
        layoutData: createdBody?.layoutData,
        contentDefaults: createdBody?.contentDefaults ?? null,
        createdAt: "2026-08-25T00:00:00.000Z",
        updatedAt: "2026-08-25T00:00:00.000Z",
      };
      return route.fulfill(json(createdTemplate));
    });

    await page.goto("/admin/editor/home");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
    const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    await canvas.locator('[data-hc-keyboard-node="desktopImage"]:visible').first().click();
    const inspector = page.getByRole("region", { name: "属性面板" });
    await inspector.getByRole("tab", { name: "模板编辑" }).click();
    await inspector.getByRole("button", { name: "另存到模板库" }).click();

    const dialog = page.getByRole("dialog", { name: "另存到模板库" });
    await dialog.getByLabel("模板名称").fill("含默认内容的首屏");
    await dialog.getByRole("checkbox", { name: /同时保存当前默认内容/ }).check();
    await dialog.getByRole("button", { name: "保存模板" }).click();
    await expect(page.getByText("「含默认内容的首屏」已保存布局和默认内容")).toBeVisible();
    expect(createdBody?.contentDefaults).toMatchObject({
      desktopImage: "/svg/template-hero.svg",
      eyebrow: "COLLECTION",
      title: "可复用默认标题",
      subtitle: "只保存展示内容，不复制业务事实",
      actionText: "查看系列",
      linkUrl: "/catalog",
    });
    expect(createdBody?.contentDefaults).not.toHaveProperty("id");
    expect(createdBody?.contentDefaults).not.toHaveProperty("__instanceOverrides");

    const savedTemplate = page.getByRole("button", { name: "含默认内容的首屏：点击添加" });
    await expect(savedTemplate).toContainText("含默认内容");
    await page.getByRole("toolbar", { name: "画布编辑操作" })
      .getByRole("button", { name: "删除当前模块" })
      .click();
    await page.getByRole("dialog").filter({ hasText: "删除“" })
      .getByRole("button", { name: "删除模块" }).click();
    await expect(canvas.locator('[data-content-template-contract="hero"]')).toHaveCount(0);
    await savedTemplate.click();
    await expect(canvas.getByText("可复用默认标题")).toBeVisible();
    await expect(canvas.getByText("只保存展示内容，不复制业务事实")).toBeVisible();
    expect(forbiddenWrites).toEqual([]);
  });

  test("首帧不重复整树更新，线上版与草稿的后续切换各只同步一次", async ({ page }, testInfo) => {
    const warningProbe = observePuckPerformanceWarnings(page);
    const published = makeHeroDraft();
    published.puckData.content[0].props.title = "线上版本标题";
    published.status = "PUBLISHED";
    published.version = 3;
    published.publishedAt = "2026-08-25T00:00:00.000Z";
    const draft = structuredClone(published);
    draft.puckData.content[0].props.title = "未发布草稿标题";
    draft.status = "DRAFT";
    draft.updatedAt = "2026-08-25T00:00:01.000Z";

    await page.setViewportSize({ width: 1600, height: 1000 });
    await authenticateAdmin(page);
    await page.route("**/api/**", async (route) => {
      const url = route.request().url();
      if (url.includes("/page-modules/document/validate")) {
        return route.fulfill(json({ valid: true, errors: [] }));
      }
      if (url.includes("/page-modules/document/revisions")) {
        return route.fulfill(json([]));
      }
      if (url.includes("/page-modules/document/published")) {
        return route.fulfill(json(published));
      }
      if (url.includes("/page-modules/document/admin")) {
        return route.fulfill(json(draft));
      }
      if (url.includes("/page-modules/personal-content-templates")) {
        return route.fulfill(json([]));
      }
      return route.fulfill(json({}));
    });

    await page.goto("/admin/editor/home");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
    const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    await expect(canvas.getByText("未发布草稿标题")).toBeVisible();
    const loadWarnings = warningProbe.drain();
    expect(loadWarnings, "首帧不得因 Puck 归一化差异重复整树更新").toEqual([]);

    await page.getByRole("button", { name: "更多编辑操作" }).click();
    await page.getByRole("menuitem", { name: "查看线上版本" }).click();
    await expect(canvas.getByText("线上版本标题")).toBeVisible();
    const publishedWarnings = warningProbe.drain();
    expect(publishedWarnings.map((warning) => warning.kind)).toEqual(["setData"]);

    await page.getByRole("button", { name: "更多编辑操作" }).click();
    await page.getByRole("menuitem", { name: "继续编辑草稿" }).click();
    await expect(canvas.getByText("未发布草稿标题")).toBeVisible();
    const draftWarnings = warningProbe.drain();
    expect(draftWarnings.map((warning) => warning.kind)).toEqual(["setData"]);
    await attachPuckWarningEvidence(testInfo, "external-document-switch", {
      load: loadWarnings,
      published: publishedWarnings,
      draft: draftWarnings,
    });
  });

  test("账号模板读取失败时保留明确状态并可重试恢复", async ({ page }) => {
    const forbiddenWrites: string[] = [];
    const maximumDepthErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" && message.text().includes("Maximum update depth exceeded")) {
        maximumDepthErrors.push(message.text());
      }
    });
    let shouldFail = true;
    let requestCount = 0;
    await page.setViewportSize({ width: 1600, height: 1000 });
    await authenticateAdmin(page);
    await mockEditorApis(page, makeHeroDraft(), forbiddenWrites);
    await page.route("**/api/page-modules/personal-content-templates", async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      requestCount += 1;
      return shouldFail
        ? route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ message: "数据库错误: P2022" }),
          })
        : route.fulfill(json([]));
    });

    await page.goto("/admin/editor/home");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
    const personalGroup = page.getByRole("heading", { name: "我的模板" }).locator("..");
    const error = personalGroup.getByRole("alert");
    await expect(error).toContainText("账号模板暂时不可用");
    await expect(page.getByText("数据库错误: P2022", { exact: true })).toHaveCount(0);
    await expect(
      page.getByText("服务器繁忙，请稍后再试", { exact: true }),
    ).toHaveCount(0);
    await expect(page.locator(".homepage-editor__template-card-main").first()).toBeVisible();

    shouldFail = false;
    await error.getByRole("button", { name: "重新加载账号模板" }).click();
    await expect(error).toHaveCount(0);
    expect(requestCount).toBeGreaterThanOrEqual(2);
    expect(maximumDepthErrors, "账号模板失败恢复不得触发 React 更新循环").toEqual([]);
    expect(forbiddenWrites).toEqual([]);
  });

  test("工艺细节模板编辑双端布局、保存草稿、刷新、发布并由公开 Renderer 回显", async ({ page }, testInfo) => {
    test.slow();
    const warningProbe = observePuckPerformanceWarnings(page);
    const initial = makeCraftDetailsDraft();
    let saved: Record<string, any> = structuredClone(initial);
    let published: Record<string, any> | null = null;
    await page.setViewportSize({ width: 1600, height: 1000 });
    await authenticateAdmin(page);
    await page.route("**/svg/template-hero.svg", (route) =>
      route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        body: fixtureSvg,
      }),
    );
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const url = request.url();
      if (url.includes("/page-modules/document/validate")) {
        return route.fulfill(json({ valid: true, errors: [] }));
      }
      if (url.includes("/page-modules/document/revisions")) {
        return route.fulfill(json([]));
      }
      if (url.includes("/page-modules/document/published")) {
        return route.fulfill(json(published));
      }
      if (url.includes("/page-modules/document/publish")) {
        saved = {
          ...saved,
          status: "PUBLISHED",
          publishedAt: "2026-08-25T00:00:00.000Z",
          version: Number(saved.version ?? 0) + 1,
        };
        published = structuredClone(saved);
        return route.fulfill(json(saved));
      }
      if (url.includes("/page-modules/document/admin")) {
        return route.fulfill(json(saved));
      }
      if (url.includes("/page-modules/document") && request.method() === "PUT") {
        const body = request.postDataJSON() as Record<string, any>;
        saved = {
          ...saved,
          puckData: body.puckData ?? saved.puckData,
          metadata: body.metadata ?? saved.metadata,
          updatedAt: "2026-08-25T00:00:01.000Z",
        };
        return route.fulfill(json(saved));
      }
      if (url.includes("/page-modules/personal-content-templates")) {
        return route.fulfill(json([]));
      }
      return route.fulfill(json({}));
    });

    await page.goto("/admin/editor/home");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
    const loadWarnings = warningProbe.drain();
    expect(loadWarnings, "初始载入不得重复执行 Puck 全树更新").toEqual([]);
    const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    const craftRoot = canvas.locator('[data-content-template-contract="craftDetails"]');
    const leadImage = canvas.locator('[data-hc-keyboard-node="leadImage"]:visible').first();
    const loadedLeadImage = leadImage.locator("img");
    await expect(loadedLeadImage).toBeVisible();
    await expect.poll(() => loadedLeadImage.evaluate((image: HTMLImageElement) =>
      image.complete && image.naturalWidth > 0,
    )).toBe(true);
    await expect(loadedLeadImage).toHaveCSS("opacity", "1");
    await leadImage.click({ force: true });
    const inspector = page.getByRole("region", { name: "属性面板" });
    await inspector.getByRole("tab", { name: "模板编辑" }).click();

    const leadHud = craftRoot.locator(
      '[data-hc-node-hud][data-node-id="leadImage"][data-node-kind="media"]',
    );
    await leadHud.getByRole("button", { name: "调整图片构图" }).click();
    await expect(craftRoot).toHaveAttribute("data-hc-media-focus-enabled", "true");
    const leadImageSlot = craftRoot.locator('[data-content-role="leadImage"]');
    await expect.poll(async () => (await leadImageSlot.boundingBox())?.height ?? 0)
      .toBeGreaterThan(0);
    const leadImageBox = await leadImageSlot.boundingBox();
    if (!leadImageBox) throw new Error("工艺主图槽位在构图模式下没有尺寸");
    const instanceStyle = craftRoot.locator("style[data-hc-instance-overrides]");
    const readInstanceStyle = async () =>
      (await instanceStyle.count()) > 0
        ? (await instanceStyle.textContent()) ?? ""
        : "";
    const initialInstanceStyle = await readInstanceStyle();
    await page.mouse.move(
      leadImageBox.x + leadImageBox.width * 0.7,
      leadImageBox.y + leadImageBox.height * 0.35,
    );
    await page.mouse.down();
    await page.mouse.move(
      leadImageBox.x + leadImageBox.width * 0.7 + 64,
      leadImageBox.y + leadImageBox.height * 0.35 + 24,
      { steps: 12 },
    );
    await page.mouse.up();
    await expect.poll(readInstanceStyle).not.toBe(initialInstanceStyle);
    const focusedInstanceStyle = await readInstanceStyle();
    await expect(craftRoot).not.toHaveAttribute("data-hc-gesture-phase");

    // 一次连续构图拖动只提交一条历史；撤销/重做必须精确往返。
    const undo = page.getByRole("button", { name: "撤销" });
    const redo = page.getByRole("button", { name: "重做" });
    await expect(undo).toBeEnabled();
    await undo.evaluate((button: HTMLButtonElement) => button.click());
    await expect.poll(readInstanceStyle).toBe(initialInstanceStyle);
    await expect(redo).toBeEnabled();
    await redo.evaluate((button: HTMLButtonElement) => button.click());
    await expect.poll(readInstanceStyle).toBe(focusedInstanceStyle);

    await expect(craftRoot).toHaveAttribute("data-visual-selected-node", "leadImage");
    await inspector.getByRole("tab", { name: "模板编辑" }).click();
    await inspector.getByRole("button", { name: "精确位置与尺寸" }).click();
    const desktopX = inspector.getByRole("slider", { name: "横向位置（桌面端）" });
    await setRangeValue(desktopX, 31);
    await page.getByRole("button", { name: /移动端布局/ }).click();
    await expect(craftRoot).toHaveAttribute("data-visual-selected-node", "leadImage");
    const mobileY = inspector.getByRole("slider", { name: "纵向位置（移动端）" });
    await setRangeValue(mobileY, 7);

    const objectRadius = inspector.getByRole("group", { name: "对象圆角" });
    const objectShadow = inspector.getByRole("group", { name: "对象阴影" });
    await objectRadius.getByRole("button", { name: "柔和" }).click();
    await expect.poll(readInstanceStyle).toContain("border-radius:8px!important");
    await objectShadow.getByRole("button", { name: "悬浮" }).click();
    await expect.poll(readInstanceStyle).toContain("box-shadow:0 16px 36px rgba(24,26,27,.16)!important");

    const objectSelector = inspector.getByRole("combobox", { name: "选择编辑对象" });
    await objectSelector.selectOption("");
    await expect(objectSelector).toHaveValue("");
    const surfaceColor = inspector.getByRole("group", { name: "模板配色" });
    const surfacePadding = inspector.getByRole("group", { name: "模块留白" });
    const surfaceRadius = inspector.getByRole("group", { name: "模块圆角" });
    const surfaceShadow = inspector.getByRole("group", { name: "模块阴影" });
    await surfaceColor.getByRole("button", { name: "柔灰" }).click();
    await expect.poll(readInstanceStyle).toContain("--hc-instance-background:#F7F8F8");
    await surfacePadding.getByRole("button", { name: "舒展" }).click();
    await expect.poll(readInstanceStyle).toContain("padding-block:clamp(88px,10vw,144px)!important");
    await surfaceRadius.getByRole("button", { name: "圆润" }).click();
    await expect.poll(readInstanceStyle).toContain("border-radius:16px!important");
    await surfaceShadow.getByRole("button", { name: "悬浮" }).click();
    await expect.poll(readInstanceStyle).toContain("box-shadow:0 20px 48px rgba(24,26,27,.14)!important");
    await attachScreenshot(page, testInfo, "craft-details-editor-mobile-layout");
    const propertyWarnings = warningProbe.drain();

    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    await expect(page.getByText("页面草稿已保存")).toBeVisible();
    const saveWarnings = warningProbe.drain();
    expect(saved.puckData.content[0].props.__instanceOverrides.nodes.leadImage.rectByViewport.desktop.x)
      .toBeCloseTo(0.31, 2);
    expect(saved.puckData.content[0].props.__instanceOverrides.nodes.leadImage.rectByViewport.mobile.y)
      .toBeCloseTo(0.07, 2);
    expect(saved.puckData.content[0].props.__instanceOverrides.nodes.leadImage.mediaView.focusByViewport.desktop)
      .toBeTruthy();
    expect(saved.puckData.content[0].props.__instanceOverrides.nodes.leadImage.appearance)
      .toEqual({ radiusPreset: "soft", shadowPreset: "lifted" });
    expect(saved.puckData.content[0].props.__instanceOverrides.frame).toMatchObject({
      colorPreset: "mist",
      paddingPreset: "spacious",
      radiusPreset: "rounded",
      shadowPreset: "lifted",
    });

    await page.reload();
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
    const reloadWarnings = warningProbe.drain();
    const reloadedCanvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    await reloadedCanvas.locator('[data-hc-keyboard-node="leadImage"]:visible').first().click();
    const reloadedInspector = page.getByRole("region", { name: "属性面板" });
    await reloadedInspector.getByRole("tab", { name: "模板编辑" }).click();
    await reloadedInspector.getByRole("button", { name: "精确位置与尺寸" }).click();
    await expect(
      reloadedInspector.getByRole("slider", { name: "横向位置（桌面端）" }),
    ).toHaveValue("31");
    await page.getByRole("button", { name: /移动端布局/ }).click();
    await reloadedCanvas.locator('[data-hc-keyboard-node="leadImage"]:visible').first().click();
    await expect(
      reloadedInspector.getByRole("slider", { name: "纵向位置（移动端）" }),
    ).toHaveValue("7");

    const publish = page.getByRole("button", { name: "发布到前台网站" });
    await expect(publish).toBeEnabled();
    await publish.click();
    const publishDialog = page.getByRole("dialog", { name: "确认发布首页？" });
    await publishDialog.getByRole("button", { name: "确认发布" }).click();
    await expect(page.getByText("店铺首页已发布")).toBeVisible();
    const publishWarnings = warningProbe.drain();
    expect(published?.puckData.content[0].props.__instanceOverrides.nodes.leadImage.rectByViewport.desktop.x)
      .toBeCloseTo(0.31, 2);
    expect(published?.puckData.content[0].props.__instanceOverrides.nodes.leadImage.rectByViewport.mobile.y)
      .toBeCloseTo(0.07, 2);

    await page.goto("/");
    const publicCraftDetails = page.locator('[data-content-template-contract="craftDetails"]');
    await expect(publicCraftDetails).toBeVisible();
    await expect(page.getByText("工艺细节闭环标题")).toBeVisible();
    await expect.poll(async () =>
      publicCraftDetails.locator("style[data-hc-instance-overrides]").textContent()
    ).toContain("--hc-node-leadImage-desktop-left");
    await expect.poll(async () =>
      publicCraftDetails.locator("style[data-hc-instance-overrides]").textContent()
    ).toContain("--hc-node-leadImage-mobile-top");
    const publicInstanceStyle = publicCraftDetails.locator("style[data-hc-instance-overrides]");
    await expect.poll(() => publicInstanceStyle.textContent()).toContain("--hc-instance-background:#F7F8F8");
    await expect.poll(() => publicInstanceStyle.textContent()).toContain("padding-block:clamp(88px,10vw,144px)!important");
    await expect.poll(() => publicInstanceStyle.textContent()).toContain("border-radius:8px!important");
    await expect.poll(() => publicInstanceStyle.textContent()).toContain("box-shadow:0 16px 36px rgba(24,26,27,.16)!important");
    await attachPuckWarningEvidence(testInfo, "property-save-publish", {
      load: loadWarnings,
      property: propertyWarnings,
      save: saveWarnings,
      reload: reloadWarnings,
      publish: publishWarnings,
    });
  });
});
