import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { installAdminSession } from "./fixtures/session-auth";
import {
  CONTENT_TEMPLATE_EDITOR_ACCEPTANCE_MATRIX,
  getContentTemplateContract,
  getContentTemplatePageRule,
} from "../src/page-builder/generated/contentTemplates.generated";
import { RESPONSIVE_CANVAS } from "../src/page-builder/config/blockContracts";

const ALL_TEMPLATE_EDITOR_PAGE_GROUPS = (() => {
  const assigned = new Set<string>();
  const groups = (["products", "custom", "about"] as const).map((pageKey) => {
    const allowed = new Set(getContentTemplatePageRule(pageKey)?.allowedTemplateKeys ?? []);
    const entries = CONTENT_TEMPLATE_EDITOR_ACCEPTANCE_MATRIX.filter((entry) =>
      allowed.has(entry.templateKey) && !assigned.has(entry.templateKey));
    entries.forEach((entry) => assigned.add(entry.templateKey));
    return { pageKey, entries };
  }).filter((group) => group.entries.length > 0);
  if (assigned.size !== CONTENT_TEMPLATE_EDITOR_ACCEPTANCE_MATRIX.length) {
    throw new Error(`属性面板验收页面未覆盖全部模板：${assigned.size}/${CONTENT_TEMPLATE_EDITOR_ACCEPTANCE_MATRIX.length}`);
  }
  return groups;
})();

const CONTENT_GROUP_ORDER_BY_PRIMARY: Record<string, readonly string[]> = {
  media: ["media", "content", "product", "link", "feature"],
  product: ["product", "media", "content", "link", "feature"],
  category: ["product", "media", "content", "link", "feature"],
  structured: ["feature", "content", "media", "link", "product"],
  text: ["content", "media", "link", "feature", "product"],
  action: ["link", "content", "media", "feature", "product"],
};

function getRenderedInspectorFieldKey(objectKind: string, fieldKey: string) {
  if (objectKind !== "action") return fieldKey;
  if (["productCode", "productId", "categorySlug", "linkUrl"].includes(fieldKey)) {
    return "targetType";
  }
  if ([
    "secondaryProductCode",
    "secondaryProductId",
    "secondaryCategorySlug",
    "secondaryLinkUrl",
  ].includes(fieldKey)) {
    return "secondaryLinkTarget";
  }
  if (fieldKey === "secondaryTargetType") return "secondaryLinkTarget";
  return fieldKey;
}

function getSemanticContentGroup(group: string | null) {
  if (group === "mainImage" || group === "detailImage") return "media";
  if (group === "copy") return "content";
  if (group === "action") return "link";
  return group;
}

type ContentTemplateEditorAcceptanceEntry =
  (typeof CONTENT_TEMPLATE_EDITOR_ACCEPTANCE_MATRIX)[number];

async function expectContinuousContentInspector({
  inspector,
  entry,
  viewport,
}: {
  inspector: Locator;
  entry: ContentTemplateEditorAcceptanceEntry;
  viewport: "desktop" | "mobile";
}) {
  await expect(
    inspector.getByRole("combobox", { name: "选择编辑对象" }),
    `${entry.templateKey} 内容模式不应再显示对象下拉`,
  ).toHaveCount(0);
  await expect(inspector.getByRole("region", { name: "当前编辑对象" })).toContainText("全部内容");

  const applicableObjects = entry.objects.filter((object) =>
    object.viewports[viewport].applicable,
  );
  const renderedFieldKeys = await inspector.locator("[data-inspector-field]").evaluateAll((fields) =>
    fields.map((field) => field.getAttribute("data-inspector-field")).filter(Boolean),
  );
  const duplicateFieldKeys = renderedFieldKeys.filter((fieldKey, index) =>
    fieldKey && renderedFieldKeys.indexOf(fieldKey) !== index,
  );
  expect(duplicateFieldKeys, `${entry.templateKey}.${viewport} 出现重复内容控件`).toEqual([]);
  for (const object of applicableObjects) {
    const objectFieldKeys = object.contentFieldKeys.map((fieldKey) =>
      getRenderedInspectorFieldKey(object.kind, fieldKey),
    );
    expect(
      objectFieldKeys.some((fieldKey) => renderedFieldKeys.includes(fieldKey)),
      `${entry.templateKey}.${viewport}.${object.roleId} 没有连续显示合同映射的内容控件`,
    ).toBe(true);
  }

  const primaryTask = getContentTemplateContract(entry.moduleType)!.editorCapabilities.primaryTask;
  const expectedGroupOrder = CONTENT_GROUP_ORDER_BY_PRIMARY[primaryTask];
  if (!expectedGroupOrder) {
    throw new Error(`${entry.templateKey} 缺少 primaryTask=${primaryTask} 的任务顺序`);
  }
  const semanticGroups = (await inspector.locator(".homepage-editor__task-group").evaluateAll((groups) =>
    groups.map((group) => group.getAttribute("data-task-group")),
  )).map(getSemanticContentGroup).filter((group): group is string => Boolean(group));
  const distinctSemanticGroups = semanticGroups.filter((group, index) =>
    semanticGroups.indexOf(group) === index,
  );
  expect(
    distinctSemanticGroups,
    `${entry.templateKey}.${viewport} 内容任务顺序与 primaryTask=${primaryTask} 不一致`,
  ).toEqual(expectedGroupOrder.filter((group) => distinctSemanticGroups.includes(group)));

  if (entry.templateKey === "doublePoster") {
    for (const fieldKey of [
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
    ]) {
      await expect(inspector.locator(`[data-inspector-field="${fieldKey}"]`)).toHaveCount(1);
    }
  }
}

const LEGACY_SYSTEM_SOURCE_REFERENCES = new Set(
  CONTENT_TEMPLATE_EDITOR_ACCEPTANCE_MATRIX.map((entry) => `legacy_system_${entry.templateKey}`),
);

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

function makeAllTemplateEditorDraft(
  entries = CONTENT_TEMPLATE_EDITOR_ACCEPTANCE_MATRIX,
  pageKey = "products",
) {
  const broadProps = {
    eyebrow: "EDITOR MATRIX",
    title: "全模板属性面板验收",
    subtitle: "桌面与移动端使用同一合同驱动",
    body: "仅用于确定性编辑器验收。",
    actionText: "",
    buttonText: "",
    primaryText: "",
    secondaryText: "",
    targetType: "none",
    secondaryTargetType: "none",
    linkUrl: "",
    secondaryLinkUrl: "",
    productId: 0,
    secondaryProductId: 0,
    productCode: "",
    secondaryProductCode: "",
    categorySlug: "",
    secondaryCategorySlug: "",
    desktopImage: "/svg/template-hero.svg",
    mobileImage: "/svg/template-hero.svg",
    image: "/svg/template-hero.svg",
    mainImage: "/svg/template-hero.svg",
    detailImage: "/svg/template-hero.svg",
    leadImage: "/svg/template-hero.svg",
    detailImageOne: "/svg/template-hero.svg",
    detailImageTwo: "/svg/template-hero.svg",
    beforeImage: "/svg/template-hero.svg",
    afterImage: "/svg/template-hero.svg",
    backgroundImage: "/svg/template-hero.svg",
    bgImage: "/svg/template-hero.svg",
    eventImage: "/svg/template-hero.svg",
    posterUrl: "/svg/template-hero.svg",
    videoUrl: "",
    altText: "全模板验收替代文字",
    imageAlt: "全模板验收替代文字",
    mainAltText: "全模板验收主图替代文字",
    detailAltText: "全模板验收细节图替代文字",
    leadAltText: "全模板验收主图替代文字",
    detailOneAltText: "全模板验收细节一替代文字",
    detailTwoAltText: "全模板验收细节二替代文字",
    beforeAltText: "全模板验收改款前替代文字",
    afterAltText: "全模板验收改款后替代文字",
    items: [],
    images: [],
    cards: [],
    categories: [],
    steps: [],
    certificates: [],
    testimonials: [],
    hotspots: [],
    productIds: [],
    productCodes: [],
    categorySlugs: [],
    benefits: [],
    targetDate: "2099-12-31T23:59:59.000Z",
    autoPlay: false,
    loop: false,
    muted: true,
    showControls: true,
    isVisible: true,
  };
  return {
    ...makeEmptyDraft(),
    id: 9610,
    pageKey,
    puckData: {
      content: entries.map((entry) => ({
        type: entry.moduleType,
        props: {
          ...broadProps,
          id: `all-template-editor-${entry.templateKey}`,
        },
      })),
      zones: {},
      root: { props: {} },
    },
  };
}

async function authenticateAdmin(page: Page) {
  await installAdminSession(page, {
    username: "template-editor-ui-test",
    realName: "装修 UI 测试管理员",
  });
}

async function mockEditorApis(
  page: Page,
  draft: Record<string, any> = makeEmptyDraft(),
  forbiddenWrites: string[] = [],
) {
  await page.route("**/svg/template-hero.svg*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: fixtureSvg,
    }),
  );
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = request.url();
    const pathname = new URL(url).pathname;
    if (pathname === "/api/auth/profile") return route.fallback();
    if (pathname === "/api/page-modules/dynamic-templates/catalog") {
      return route.fulfill(json({ items: [] }));
    }
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

  await pressWorkspaceHistory(page, "undo");
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
  const instanceStyle = root.locator("style[data-hc-instance-overrides]");
  const readInstanceStyle = async () =>
    (await instanceStyle.count()) > 0
      ? (await instanceStyle.textContent()) ?? ""
      : "";
  const initialStyle = await readInstanceStyle();

  for (const nodeId of nodeIds) {
    const node = root.locator(`[data-hc-keyboard-node="${nodeId}"]:visible`).first();
    await expect(node, `${contractKey}.${nodeId} 缺少可选择的画布对象`).toBeVisible();
    await node.click();
    await expect(root).toHaveAttribute("data-visual-selected-node", nodeId);
    const editType = page.getByRole("tablist", { name: "编辑类型" });
    await editType.getByRole("tab", { name: "构图调整" }).click();
    await expect(inspector.getByText(/位置由(?:移动端堆叠|模板流式布局控制)/)).toHaveCount(0);
    await expect(inspector.getByRole("group", { name: /快速定位/ })).toBeVisible();
    await expect(root.locator(`[data-hc-node-hud][data-node-id="${nodeId}"]`)).toBeVisible();
  }

  await expect.poll(readInstanceStyle).toBe(initialStyle);
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
  expect(activeNodeRule, JSON.stringify({ contractKey, nodeId, viewport, styleText })).toBe(true);
  const beforeReset = await visualNode.boundingBox();
  if (!beforeReset) throw new Error(`${contractKey}.${nodeId} 恢复前没有可见几何`);
  const inspector = page.getByRole("region", { name: "属性面板" });
  await visualNode.click();
  await expect(root).toHaveAttribute("data-visual-selected-node", nodeId);
  await page.getByRole("button", { name: "模板设计" }).click();
  const reset = inspector.getByRole("button", { name: /恢复.+设计默认/ }).first();
  await expect(reset).toBeEnabled();
  await reset.click();
  await expect(reset).toBeDisabled();
  const afterReset = await visualNode.boundingBox();
  if (!afterReset) throw new Error(`${contractKey}.${nodeId} 恢复后没有可见几何`);
  const geometryEvidence = JSON.stringify({ contractKey, nodeId, viewport, beforeReset, afterReset });
  expect(
    Math.abs(afterReset.x - beforeReset.x) +
      Math.abs(afterReset.y - beforeReset.y) +
      Math.abs(afterReset.width - beforeReset.width) +
      Math.abs(afterReset.height - beforeReset.height),
    geometryEvidence,
  ).toBeGreaterThan(2);
  await pressWorkspaceHistory(page, "undo");
  await expect(reset).toBeEnabled();
  await pressWorkspaceHistory(page, "redo");
  await expect(reset).toBeDisabled();
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
  await page.getByRole("tablist", { name: "编辑类型" })
    .getByRole("tab", { name: "构图调整" })
    .click();
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

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  const screenshotPath = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path: screenshotPath, animations: "disabled" });
  await testInfo.attach(name, { path: screenshotPath, contentType: "image/png" });
}

async function pressWorkspaceHistory(page: Page, direction: "undo" | "redo") {
  await expect(page.getByRole("button", { name: direction === "undo" ? "撤销" : "重做" })).toBeEnabled();
  await page.getByRole("button", { name: /^(页面装修|模板设计)$/ }).first().focus();
  await page.keyboard.press(direction === "undo" ? "Control+z" : "Control+Shift+z");
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
    const editType = page.getByRole("tablist", { name: "编辑类型" });
    await editType.getByRole("tab", { name: "构图调整" }).click();
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

    await editType.getByRole("tab", { name: "内容编辑" }).click();
    const title = canvas.locator('[data-hc-keyboard-node="title"]:visible').first();
    await title.click();
    await expect(page.getByTestId("selected-visual-state")).toHaveText(
      "template-internal-hero:title:text",
    );
    await expect(page.getByRole("button", { name: "调整图片构图" })).toHaveCount(0);
    await expect(root.locator('[data-hc-node-hud][data-node-id="title"]')).toHaveCount(0);
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
    // 本用例依次执行 8 组真实手势、Store 提交、撤销，并在前 7 组后重载
    // iframe。并行套件下会合理超过默认 30 秒，因此显式归类为长矩阵用例。
    test.slow();
    const warningProbe = observePuckPerformanceWarnings(page);
    const canvas = page.frameLocator("iframe");
    const root = canvas.locator('[data-content-template-module="首屏主视觉"]').first();
    const title = canvas.locator('[data-hc-keyboard-node="title"]:visible').first();
    await expect.poll(async () => root.evaluate((element) =>
      element.style.getPropertyValue("--hc-node-title-desktop-width"),
    )).not.toBe("");
    const rootBox = await root.boundingBox();
    if (!rootBox) throw new Error("模块没有布局尺寸");
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

      await pressWorkspaceHistory(page, "undo");
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
        await page.getByRole("tablist", { name: "编辑类型" })
          .getByRole("tab", { name: "构图调整" })
          .click();
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
    await page.mouse.move(initialBox.x + initialBox.width / 2, initialBox.y + initialBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(initialBox.x + initialBox.width / 2 + 80, initialBox.y + initialBox.height / 2 + 30, {
      steps: 10,
    });
    await expect(root).toHaveAttribute("data-hc-gesture-phase", "update");
    // 拖动中的几何只存在于 iframe 本地预览，不能提前污染 Puck 历史基线。
    expect(heroOverrides(await readFixtureData(page))).toBeUndefined();
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(root).toHaveAttribute("data-hc-gesture-phase", "cancel");
    const afterEscape = await title.boundingBox();
    expect(afterEscape).toEqual(initialBox);
    expect(heroOverrides(await readFixtureData(page))).toBeUndefined();

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
  });

  test("Hero 标题桌面与移动布局独立写入且互不覆盖", async ({ page }) => {
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
    await root.locator('[data-hc-selection-box][data-node-id="title"]').click();
    await title.focus();
    await expect(root.locator('[data-hc-node-hud][data-node-id="title"]')).toBeVisible();
    await title.press("ArrowDown");
    const afterMobile = heroOverrides(await readFixtureData(page));
    expect(afterMobile?.nodes?.title?.rectByViewport?.desktop).toEqual(desktopRect);
    expect(afterMobile?.nodes?.title?.rectByViewport?.mobile).toBeTruthy();

    await page.getByRole("button", { name: /桌面端布局/ }).click();
    await expect(page.getByTestId("viewport-state")).toHaveText("desktop");
    expect(
      heroOverrides(await readFixtureData(page))?.nodes?.title?.rectByViewport
        ?.desktop,
    ).toEqual(desktopRect);
  });

  test("键盘撤销、重做与顶部预览只操作当前 Puck 画布", async ({ page }) => {
    const antdContextWarnings = observeAntdStaticContextWarnings(page);
    const canvas = page.frameLocator("iframe");
    await canvas.getByRole("button", { name: "选择“首屏主视觉”模块" }).click();
    await expect(page.getByTestId("selected-module-state")).toHaveText(
      "template-internal-hero",
    );

    const title = canvas.locator('[data-hc-keyboard-node="title"]:visible').first();
    const root = canvas.locator('[data-content-template-module="首屏主视觉"]').first();
    await title.click();
    await root.locator('[data-hc-node-hud][data-node-id="title"]')
      .getByRole("button", { name: "调整对象区域" }).click();
    await title.press("ArrowRight");
    await pressWorkspaceHistory(page, "undo");
    await pressWorkspaceHistory(page, "redo");

    await page.getByRole("button", { name: "预览当前画布" }).click();
    expect(antdContextWarnings).toEqual([]);
    await expect(page.getByTestId("preview-state")).toHaveText("preview");
    await expect(page.getByRole("button", { name: "退出当前画布预览" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("preview-state")).toHaveText("edit");
  });
});

test.describe("Mock 模板保存边界", () => {
  test.skip(appMode !== "mock", "仅在 Vite mock 模式验证本机草稿语义");

  test("保存入口预先说明本机边界且不发起服务端模板写入", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem("haichuan.dynamic-template-drafts.v1");
    });
    const serverWrites: string[] = [];
    page.on("request", (request) => {
      const pathname = new URL(request.url()).pathname;
      if (pathname.includes("/page-modules/dynamic-templates") && request.method() !== "GET") {
        serverWrites.push(`${request.method()} ${pathname}`);
      }
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await installAdminSession(page, {
      username: "mock-template-local-only",
      realName: "Mock 本机草稿验收",
      role: "SUPER_ADMIN",
    });
    await page.goto("/admin/editor/home");
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建空白模板" }).click();
    await page.getByRole("textbox", { name: "模板名称" }).fill("Mock 本机测试模板");

    const save = page.getByRole("button", { name: "保存本机测试草稿", exact: true });
    await expect(save).toHaveAttribute("title", /不写入服务端模板/);
    await expect(page.getByRole("button", { name: /发布模板新版本/ })).toBeDisabled();
    await save.click();
    const dialog = page.getByRole("dialog", { name: "保存本机测试草稿" });
    await expect(dialog).toContainText("只写入当前浏览器本机存储，不创建服务端模板");
    await dialog.getByRole("button", { name: "更新本机测试草稿" }).click();
    await expect(page.getByText("已保存为本机测试草稿；未写入服务端模板")).toBeVisible();
    const storedDraftCount = await page.evaluate(() => {
      const stored = JSON.parse(window.localStorage.getItem("haichuan.dynamic-template-drafts.v1") ?? "null");
      return Array.isArray(stored?.drafts) ? stored.drafts.length : 0;
    });
    expect(storedDraftCount).toBe(1);
    expect(serverWrites).toEqual([]);
  });
});

type PersonalTemplateFixture = {
  id: number;
  name: string;
  moduleType: string;
  contractKey: string;
  contractVersion: number;
  revision: number;
  layoutData: Record<string, unknown>;
  contentDefaults: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

function makeTemplateWorkspaceLayerDraft() {
  const draft = makeHeroDraft();
  return {
    ...draft,
    puckData: {
      ...draft.puckData,
      content: [
        draft.puckData.content[0],
        ...Array.from({ length: 14 }, (_, index) => ({
          type: "文字横幅",
          props: {
            id: `template-workspace-layer-${index}`,
            title: `模板工作空间图层 ${index + 1}`,
            buttonText: "",
            targetType: "none",
          },
        })),
      ],
    },
  };
}

function personalTemplateFixture(
  overrides: Partial<PersonalTemplateFixture> = {},
): PersonalTemplateFixture {
  const contract = getContentTemplateContract("首屏主视觉");
  return {
    id: 71,
    name: "我的品牌首屏",
    moduleType: "首屏主视觉",
    contractKey: contract?.key ?? "hero",
    contractVersion: contract?.version ?? 1,
    revision: 1,
    layoutData: { version: 2 },
    contentDefaults: null,
    createdAt: "2026-08-28T08:00:00.000Z",
    updatedAt: "2026-08-28T08:00:00.000Z",
    ...overrides,
  };
}

async function mockPersonalTemplates(
  page: Page,
  initial: PersonalTemplateFixture[] = [],
  options: { failWrites?: boolean } = {},
) {
  const records = initial.map((record) => structuredClone(record));
  const writes: Array<{ method: string; pathname: string; body: Record<string, any> }> = [];
  await page.route(/\/api\/page-modules\/personal-content-templates(?:\/\d+)?(?:\?.*)?$/, async (route) => {
    const request = route.request();
    const method = request.method();
    const pathname = new URL(request.url()).pathname;
    if (method === "GET") return route.fulfill(json(records));
    const body = request.postDataJSON() as Record<string, any>;
    writes.push({ method, pathname, body });
    if (options.failWrites) {
      return route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ code: 500, message: "fixture write failure" }),
      });
    }
    if (method === "POST") {
      const contract = getContentTemplateContract(String(body.moduleType));
      const now = "2026-08-28T09:00:00.000Z";
      const created = personalTemplateFixture({
        id: Math.max(100, ...records.map((record) => record.id)) + 1,
        name: String(body.name),
        moduleType: String(body.moduleType),
        contractKey: contract?.key ?? String(body.moduleType),
        contractVersion: contract?.version ?? 1,
        layoutData: body.layoutData,
        contentDefaults: body.contentDefaults ?? null,
        createdAt: now,
        updatedAt: now,
      });
      records.unshift(created);
      return route.fulfill(json(created));
    }
    if (method === "PATCH") {
      const id = Number(pathname.split("/").at(-1));
      const index = records.findIndex((record) => record.id === id);
      if (index < 0) return route.fulfill({ status: 404, body: "{}" });
      if (body.expectedRevision !== records[index].revision) {
        return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ message: "revision conflict" }) });
      }
      const changes = { ...body };
      delete changes.expectedRevision;
      records[index] = {
        ...records[index],
        ...changes,
        revision: records[index].revision + 1,
        contentDefaults: changes.layoutData !== undefined ? null : records[index].contentDefaults,
        updatedAt: "2026-08-28T09:05:00.000Z",
      };
      return route.fulfill(json(records[index]));
    }
    return route.fulfill(json({}));
  });
  return { records, writes };
}

async function mockSystemTemplates(page: Page) {
  const versions = new Map<string, Array<Record<string, any>>>();
  const activeVersions = new Map<string, number>();
  const writes: Array<{ method: string; pathname: string; body: Record<string, any> }> = [];
  const currentForModule = (moduleType: string) => {
    const contract = getContentTemplateContract(moduleType)!;
    const activeVersion = activeVersions.get(contract.key) ?? 0;
    const version = (versions.get(contract.key) ?? []).find((item) => item.version === activeVersion);
    return {
      contractKey: contract.key,
      moduleType,
      displayName: contract.displayName,
      contractVersion: version?.contractVersion ?? contract.version,
      activeVersion,
      layoutData: structuredClone(version?.layoutData ?? { version: 2 }),
      source: activeVersion > 0 ? "database" : "code",
      changeNote: version?.changeNote ?? null,
      updatedAt: version?.createdAt ?? null,
    };
  };
  const moduleByContractKey = (contractKey: string) => (
    CONTENT_TEMPLATE_EDITOR_ACCEPTANCE_MATRIX.find((entry) => entry.templateKey === contractKey)?.moduleType
  );
  await page.route(/\/api\/page-modules\/system-content-templates(?:\/.*)?$/, async (route) => {
    const request = route.request();
    const method = request.method();
    const pathname = new URL(request.url()).pathname;
    const base = "/api/page-modules/system-content-templates";
    const parts = pathname.slice(base.length).split("/").filter(Boolean).map(decodeURIComponent);
    if (method === "GET" && parts.length === 0) {
      return route.fulfill(json(CONTENT_TEMPLATE_EDITOR_ACCEPTANCE_MATRIX.map((entry) => currentForModule(entry.moduleType))));
    }
    const contractKey = parts[0];
    const moduleType = moduleByContractKey(contractKey);
    if (!moduleType) return route.fulfill({ status: 404, body: "{}" });
    if (method === "GET" && parts[1] === "history") {
      const current = activeVersions.get(contractKey) ?? 0;
      const history = (versions.get(contractKey) ?? []).slice().reverse().map((version) => ({
        ...structuredClone(version),
        active: version.version === current,
        source: "database",
      }));
      const contract = getContentTemplateContract(moduleType)!;
      history.push({
        version: 0,
        contractKey,
        moduleType,
        contractVersion: contract.version,
        layoutData: { version: 2 },
        changeNote: "代码机器合同基线",
        createdById: null,
        createdAt: null,
        active: current === 0,
        source: "code",
      });
      return route.fulfill(json(history));
    }
    if (method === "GET" && parts.length === 1) return route.fulfill(json(currentForModule(moduleType)));
    const body = request.postDataJSON() as Record<string, any>;
    writes.push({ method, pathname, body });
    if (method === "POST" && parts[1] === "versions") {
      const current = activeVersions.get(contractKey) ?? 0;
      if (body.expectedActiveVersion !== current) return route.fulfill({ status: 409, body: "{}" });
      const list = versions.get(contractKey) ?? [];
      const version = Math.max(0, ...list.map((item) => item.version)) + 1;
      const contract = getContentTemplateContract(moduleType)!;
      list.push({
        version,
        contractKey,
        moduleType,
        contractVersion: contract.version,
        layoutData: structuredClone(body.layoutData),
        changeNote: body.changeNote ?? null,
        createdById: 1,
        createdAt: "2026-08-29T10:00:00.000Z",
      });
      versions.set(contractKey, list);
      activeVersions.set(contractKey, version);
      return route.fulfill(json(currentForModule(moduleType)));
    }
    if (method === "POST" && parts[1] === "rollback") {
      const current = activeVersions.get(contractKey) ?? 0;
      if (body.expectedActiveVersion !== current) return route.fulfill({ status: 409, body: "{}" });
      activeVersions.set(contractKey, Number(body.targetVersion));
      return route.fulfill(json(currentForModule(moduleType)));
    }
    return route.fulfill({ status: 405, body: "{}" });
  });
  return { versions, activeVersions, writes };
}

async function mockDynamicTemplates(
  page: Page,
  options: {
    failWrites?: boolean;
    publishFailures?: number;
    includeEditableCatalog?: boolean;
    unifiedCatalogUnavailable?: boolean;
    getSystemCompatibility?: () => Array<Record<string, any>>;
    getPersonalCompatibility?: () => PersonalTemplateFixture[];
  } = {},
) {
  const records: Array<Record<string, any>> = [];
  const versionsByTemplateId = new Map<string, Array<Record<string, any>>>();
  const writes: Array<{ method: string; pathname: string; body: Record<string, any> }> = [];
  let remainingPublishFailures = options.publishFailures ?? 0;
  let nextId = 800;
  const now = () => "2026-08-28T10:00:00.000Z";
  const createResource = (
    definition: Record<string, any>,
    versionNote = "",
    sourceReference: string | null = null,
  ) => ({
    id: nextId++,
    templateId: String(definition.templateId),
    ownerId: sourceReference && LEGACY_SYSTEM_SOURCE_REFERENCES.has(sourceReference) ? null : 1,
    sourceType: sourceReference && LEGACY_SYSTEM_SOURCE_REFERENCES.has(sourceReference) ? "SYSTEM" : "CUSTOM",
    visibility: "PRIVATE",
    status: "ACTIVE",
    name: String(definition.name),
    category: String(definition.metadata.category),
    purpose: String(definition.metadata.purpose),
    layoutType: String(definition.metadata.layoutType),
    description: definition.description ?? null,
    slotSummary: String(definition.metadata.slotSummary),
    recommendedFor: structuredClone(definition.metadata.recommendedFor ?? []),
    tags: structuredClone(definition.metadata.tags ?? []),
    definitionSchemaVersion: Number(definition.schemaVersion),
    publishedVersion: 0,
    sourceReference,
    archivedAt: null,
    createdAt: now(),
    updatedAt: now(),
    draft: {
      id: nextId * 10,
      baseVersion: null,
      revision: 1,
      definition: structuredClone(definition),
      definitionChecksum: `draft-${definition.templateId}-r1`,
      versionNote: versionNote || null,
      updatedAt: now(),
    },
  });
  const listPublished = () => records.flatMap((record) => {
    const versions = versionsByTemplateId.get(record.templateId) ?? [];
    const latest = versions.at(-1);
    if (!latest || record.status !== "ACTIVE" || record.visibility !== "STAFF") return [];
    return [{
      templateId: record.templateId,
      name: record.name,
      category: record.category,
      purpose: record.purpose,
      layoutType: record.layoutType,
      description: record.description,
      slotSummary: record.slotSummary,
      recommendedFor: record.recommendedFor,
      tags: record.tags,
      sourceReference: record.sourceReference,
      version: latest.version,
      schemaVersion: latest.schemaVersion,
      definition: structuredClone(latest.definition),
      definitionChecksum: latest.definitionChecksum,
      versionNote: latest.versionNote,
      publishedAt: latest.publishedAt,
    }];
  });

  await page.route(/\/api\/page-modules\/dynamic-templates(?:\/.*)?$/, async (route) => {
    const request = route.request();
    const method = request.method();
    const pathname = new URL(request.url()).pathname;
    const base = "/api/page-modules/dynamic-templates";
    const suffix = pathname.slice(base.length);
    if (method === "GET" && suffix === "/catalog") {
      if (options.unifiedCatalogUnavailable) {
        return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
      }
      return route.fulfill(json({
        items: [
          ...listPublished().map((template) => ({ kind: "published", template })),
          ...(options.includeEditableCatalog === false
            ? []
            : records.map((template) => ({ kind: "editable", template: structuredClone(template) }))),
          ...(options.getSystemCompatibility?.() ?? []).map((template) => ({
            kind: "system-compatibility",
            template: structuredClone(template),
          })),
          ...(options.getPersonalCompatibility?.() ?? []).map((template) => ({
            kind: "personal-compatibility",
            template: structuredClone(template),
          })),
        ],
      }));
    }
    if (method === "GET" && suffix === "/published") {
      return route.fulfill(json(listPublished()));
    }
    if (method === "GET" && suffix === "/mine") {
      return route.fulfill(json(structuredClone(records)));
    }
    const parts = suffix.split("/").filter(Boolean).map(decodeURIComponent);
    if (method === "POST" && parts.length === 0) {
      if (options.failWrites) {
        return route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
      }
      const body = request.postDataJSON() as Record<string, any>;
      writes.push({ method, pathname, body });
      const resource = createResource(
        body.definition,
        String(body.versionNote ?? ""),
        typeof body.sourceReference === "string" ? body.sourceReference : null,
      );
      records.unshift(resource);
      versionsByTemplateId.set(resource.templateId, []);
      return route.fulfill(json(structuredClone(resource)));
    }
    const templateId = parts[0];
    const record = records.find((candidate) => candidate.templateId === templateId);
    if (!record) return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
    if (method === "PATCH" && parts[1] === "draft") {
      if (options.failWrites) {
        return route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
      }
      const body = request.postDataJSON() as Record<string, any>;
      writes.push({ method, pathname, body });
      record.name = String(body.definition.name);
      record.category = String(body.definition.metadata.category);
      record.purpose = String(body.definition.metadata.purpose);
      record.layoutType = String(body.definition.metadata.layoutType);
      record.description = body.definition.description ?? null;
      record.slotSummary = String(body.definition.metadata.slotSummary);
      record.recommendedFor = structuredClone(body.definition.metadata.recommendedFor ?? []);
      record.tags = structuredClone(body.definition.metadata.tags ?? []);
      record.draft = {
        ...record.draft,
        revision: record.draft.revision + 1,
        definition: structuredClone(body.definition),
        definitionChecksum: `draft-${templateId}-r${record.draft.revision + 1}`,
        versionNote: body.versionNote ?? null,
        updatedAt: now(),
      };
      return route.fulfill(json(structuredClone(record)));
    }
    if (method === "POST" && parts[1] === "publish") {
      const body = request.postDataJSON() as Record<string, any>;
      writes.push({ method, pathname, body });
      if (remainingPublishFailures > 0) {
        remainingPublishFailures -= 1;
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ code: 503, message: "fixture template publish failure" }),
        });
      }
      const list = versionsByTemplateId.get(templateId) ?? [];
      const version = list.length + 1;
      const published = {
        id: nextId++,
        dynamicTemplateId: record.id,
        version,
        schemaVersion: record.draft.definition.schemaVersion,
        definition: structuredClone(record.draft.definition),
        definitionChecksum: `published-${templateId}-v${version}`,
        versionNote: body.versionNote ?? record.draft.versionNote ?? null,
        publishedAt: now(),
      };
      list.push(published);
      versionsByTemplateId.set(templateId, list);
      record.publishedVersion = version;
      record.visibility = "STAFF";
      record.draft = {
        ...record.draft,
        baseVersion: version,
        revision: record.draft.revision + 1,
        definitionChecksum: published.definitionChecksum,
      };
      return route.fulfill(json({
        templateId,
        version,
        published: structuredClone(published),
        draft: structuredClone(record.draft),
      }));
    }
    if (method === "GET" && parts[1] === "versions") {
      return route.fulfill(json(structuredClone(versionsByTemplateId.get(templateId) ?? [])));
    }
    if (method === "POST" && parts[1] === "save-as") {
      if (options.failWrites) {
        return route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
      }
      const body = request.postDataJSON() as Record<string, any>;
      writes.push({ method, pathname, body });
      const definition = structuredClone(record.draft.definition);
      definition.templateId = `tpl_copy_${nextId}`;
      definition.name = String(body.name);
      const copied = createResource(definition, String(body.versionNote ?? ""), templateId);
      records.unshift(copied);
      versionsByTemplateId.set(copied.templateId, []);
      return route.fulfill(json(structuredClone(copied)));
    }
    return route.fulfill(json({}));
  });
  return { records, versionsByTemplateId, writes };
}

async function openWorkspaceShell(
  page: Page,
  options: {
    role?: "SUPER_ADMIN" | "ADMIN" | "EDITOR";
    draft?: Record<string, any>;
    personalTemplates?: PersonalTemplateFixture[];
    failTemplateWrites?: boolean;
    publishFailures?: number;
    unifiedCatalogUnavailable?: boolean;
    viewport?: { width: number; height: number };
  } = {},
) {
  const forbiddenPageWrites: string[] = [];
  await page.setViewportSize(options.viewport ?? { width: 1600, height: 1000 });
  await installAdminSession(page, {
    username: `template-workspace-${options.role ?? "admin"}`,
    realName: "模板工作空间验收",
    role: options.role ?? "SUPER_ADMIN",
  });
  await mockEditorApis(page, options.draft ?? makeHeroDraft(), forbiddenPageWrites);
  const personal = await mockPersonalTemplates(
    page,
    options.personalTemplates,
    { failWrites: options.failTemplateWrites },
  );
  const system = await mockSystemTemplates(page);
  const dynamic = await mockDynamicTemplates(page, {
    failWrites: options.failTemplateWrites,
    publishFailures: options.publishFailures,
    unifiedCatalogUnavailable: options.unifiedCatalogUnavailable,
    includeEditableCatalog: options.role === undefined || options.role === "SUPER_ADMIN",
    getSystemCompatibility: () => CONTENT_TEMPLATE_EDITOR_ACCEPTANCE_MATRIX.map((entry) => {
      const contract = getContentTemplateContract(entry.moduleType)!;
      const activeVersion = system.activeVersions.get(contract.key) ?? 0;
      const version = (system.versions.get(contract.key) ?? []).find((item) => item.version === activeVersion);
      return {
        contractKey: contract.key,
        moduleType: entry.moduleType,
        displayName: contract.displayName,
        contractVersion: version?.contractVersion ?? contract.version,
        activeVersion,
        layoutData: structuredClone(version?.layoutData ?? { version: 2 }),
        source: activeVersion > 0 ? "database" : "code",
        changeNote: version?.changeNote ?? null,
        updatedAt: version?.createdAt ?? null,
      };
    }),
    getPersonalCompatibility: () => personal.records,
  });
  await page.goto("/admin/editor/home");
  await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
  await expect(page.getByRole("complementary", { name: "模板组件库" })).toBeVisible();
  return { forbiddenPageWrites, ...personal, dynamic, system };
}

async function openTemplateFromCatalog(page: Page, name: string) {
  await page.getByRole("button", { name: "模板设计" }).click();
  await expect(page.getByRole("complementary", { name: "模板组件库" }))
    .toContainText("模板目录");
  await page.getByRole("button", { name: new RegExp(`(?:打开|正在编辑)${name}模板`) }).click();
  await expect(page.locator(".template-editor__toolbar")).toBeVisible();
  await expect(page.locator(".template-editor__viewport-frame")).toBeVisible();
}

async function openTemplateMoreMenu(page: Page) {
  await page.locator(".template-editor__toolbar")
    .getByRole("button", { name: "更多模板操作" })
    .click();
}

const SHARED_TOOLBAR_SELECTORS = {
  device: ".homepage-editor__viewport-switcher",
  workspace: ".template-editor__workspace-context",
  history: ".homepage-editor__toolbar-history",
  preview: ".homepage-editor__toolbar-preview",
  save: ".homepage-editor__toolbar-secondary-actions .ant-btn",
  more: ".homepage-editor__toolbar-more",
  publish: ".homepage-editor__toolbar-publish",
} as const;

async function readSharedToolbarGeometry(page: Page) {
  const toolbar = page.locator(".admin-header__editor-slot .homepage-editor__toolbar:visible");
  await expect(toolbar).toHaveCount(1);
  const geometry = {} as Record<keyof typeof SHARED_TOOLBAR_SELECTORS, {
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  for (const [key, selector] of Object.entries(SHARED_TOOLBAR_SELECTORS) as Array<
    [keyof typeof SHARED_TOOLBAR_SELECTORS, string]
  >) {
    const box = await toolbar.locator(selector).boundingBox();
    if (!box) throw new Error(`共享顶部控件 ${key} 没有可测量尺寸`);
    geometry[key] = box;
  }
  return geometry;
}

function expectSharedToolbarGeometryEqual(
  pageMode: Awaited<ReturnType<typeof readSharedToolbarGeometry>>,
  templateMode: Awaited<ReturnType<typeof readSharedToolbarGeometry>>,
) {
  for (const key of Object.keys(SHARED_TOOLBAR_SELECTORS) as Array<
    keyof typeof SHARED_TOOLBAR_SELECTORS
  >) {
    for (const axis of ["x", "y", "width", "height"] as const) {
      expect(
        Math.abs(pageMode[key][axis] - templateMode[key][axis]),
        `${key}.${axis} 在页面装修与模板设计之间发生偏移`,
      ).toBeLessThanOrEqual(1);
    }
  }
}

async function readTemplateCatalogLayout(library: Locator) {
  return library.evaluate((root) => {
    const tools = root.querySelector<HTMLElement>(".homepage-editor__library-tools");
    const scroll = root.querySelector<HTMLElement>(".unified-template-library__scroll");
    if (!tools || !scroll) throw new Error("模板目录缺少统一工具或滚动布局");
    const catalogHeading = scroll.querySelector<HTMLElement>(".homepage-editor__template-catalog-heading");
    const firstCategory = scroll.querySelector<HTMLElement>(
      ".homepage-editor__template-group:not(.homepage-editor__template-catalog-heading)",
    );
    if (!catalogHeading || !firstCategory) throw new Error("模板目录缺少统一标题或分类布局");
    const rootRect = root.getBoundingClientRect();
    const toolsRect = tools.getBoundingClientRect();
    const scrollRect = scroll.getBoundingClientRect();
    const headingRect = catalogHeading.getBoundingClientRect();
    const categoryRect = firstCategory.getBoundingClientRect();
    const round = (value: number) => Math.round(value * 10) / 10;
    return {
      toolsOffset: round(toolsRect.top - rootRect.top),
      toolsHeight: round(toolsRect.height),
      scrollOffset: round(scrollRect.top - rootRect.top),
      headingOffset: round(headingRect.top - scrollRect.top),
      headingHeight: round(headingRect.height),
      categoryOffset: round(categoryRect.top - scrollRect.top),
    };
  });
}

async function readTemplateCatalogRenderSignature(card: Locator) {
  return card.evaluate((element) => {
    const root = element.querySelector<HTMLElement>("[data-dynamic-template-id]");
    if (!root) throw new Error("统一模板卡没有使用 V2 Renderer");
    const rootRect = root.getBoundingClientRect();
    const round = (value: number) => Math.round(value * 10) / 10;
    const readRelativeRect = (node: HTMLElement) => {
      const rect = node.getBoundingClientRect();
      return {
        x: round(rect.left - rootRect.left),
        y: round(rect.top - rootRect.top),
        width: round(rect.width),
        height: round(rect.height),
      };
    };
    const readVisualStyles = (node: HTMLElement) => {
      const styles = getComputedStyle(node);
      return {
        display: styles.display,
        position: styles.position,
        flexDirection: styles.flexDirection,
        gridTemplateColumns: styles.gridTemplateColumns,
        backgroundColor: styles.backgroundColor,
        color: styles.color,
        fontSize: styles.fontSize,
        textAlign: styles.textAlign,
        objectFit: styles.objectFit,
      };
    };
    const content = root.cloneNode(true) as HTMLElement;
    content.querySelectorAll("style, script").forEach((node) => node.remove());
    return {
      templateId: root.dataset.dynamicTemplateId,
      schemaVersion: root.dataset.dynamicTemplateSchemaVersion,
      device: root.dataset.dynamicTemplateDevice,
      mode: root.dataset.dynamicTemplateMode,
      root: {
        rect: readRelativeRect(root),
        styles: readVisualStyles(root),
      },
      nodes: [...root.querySelectorAll<HTMLElement>("[data-template-node-id]")].map((node) => ({
        id: node.dataset.templateNodeId,
        type: node.dataset.templateNodeType,
        style: node.getAttribute("style") ?? "",
        rect: readRelativeRect(node),
        styles: readVisualStyles(node),
      })),
      contentRoles: [...root.querySelectorAll<HTMLElement>("[data-content-role]")].map((node) => ({
        role: node.dataset.contentRole,
        rect: readRelativeRect(node),
        styles: readVisualStyles(node),
      })),
      text: (content.textContent ?? "").replace(/\s+/g, " ").trim(),
    };
  });
}

test.describe("独立模板工作空间（阶段 1）", () => {
  test.skip(
    appMode === "mock",
    "该层在 development 模式拦截自有 API，Mock 启动模式不用于证明接口方法语义",
  );

  test("页面装修模板卡只添加实例，超级管理员从独立入口进入模板设计", async ({ page }) => {
    const unifiedCatalogReads: string[] = [];
    const legacyCatalogReads: string[] = [];
    page.on("request", (request) => {
      const pathname = new URL(request.url()).pathname;
      if (request.method() !== "GET") return;
      if (pathname.endsWith("/page-modules/dynamic-templates/catalog")) {
        unifiedCatalogReads.push(pathname);
      }
      if (
        pathname.endsWith("/page-modules/dynamic-templates/mine")
        || pathname.endsWith("/page-modules/dynamic-templates/published")
        || pathname.endsWith("/page-modules/personal-content-templates")
        || pathname.endsWith("/page-modules/system-content-templates")
      ) {
        legacyCatalogReads.push(pathname);
      }
    });
    const { forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeEmptyDraft(),
    });
    await expect(page.getByText("基于此模板创建", { exact: true })).toHaveCount(0);

    const pageWorkspace = page.locator(".homepage-editor__page-workspace");
    const pageTemplateLibrary = page.getByRole("complementary", { name: "模板组件库" });
    await expect(pageTemplateLibrary).toHaveAttribute("data-unified-template-library", "page");
    await expect(pageTemplateLibrary.locator('[data-workspace-panel-header="shared"]')).toHaveCount(1);
    await pageTemplateLibrary.getByRole("button", { name: "单列查看" }).click();
    await expect(pageTemplateLibrary.getByRole("button", { name: "单列查看" }))
      .toHaveAttribute("aria-pressed", "true");
    await expect(pageTemplateLibrary.getByRole("heading", { name: "模板目录", exact: true })).toBeVisible();
    await expect(pageTemplateLibrary.getByRole("button", { name: "新建空白模板" })).toHaveCount(0);
    const pageCatalogLayout = await readTemplateCatalogLayout(pageTemplateLibrary);
    await expect(page.getByRole("complementary", { name: "图层面板" })
      .locator('[data-workspace-panel-header="shared"]')).toHaveCount(1);
    const templateEntry = page.getByRole("button", {
      name: "首屏：点击添加到页面末尾，也可拖到画布指定位置",
    });
    await expect(templateEntry.locator("xpath=ancestor::*[@data-template-catalog-card='shared']")).toHaveCount(1);
    await expect(templateEntry.locator("xpath=ancestor::*[@data-template-identity='source:legacy_system_hero']"))
      .toHaveCount(1);
    await expect(templateEntry.locator("xpath=ancestor::*[@data-template-catalog-card='shared']")
      .locator('[data-preview-art-direction="neutral-template-preview-v1"]'))
      .toHaveCount(1);
    const pageCatalogCard = templateEntry.locator("xpath=ancestor::*[@data-template-catalog-card='shared']");
    const pageCardAppearance = await pageCatalogCard.evaluate((card) => {
      const preview = card.querySelector<HTMLElement>(".homepage-editor__template-preview-wrap");
      if (!preview) throw new Error("模板卡缺少统一预览框");
      const cardRect = card.getBoundingClientRect();
      const previewRect = preview.getBoundingClientRect();
      const cardStyles = getComputedStyle(card);
      const previewStyles = getComputedStyle(preview);
      const round = (value: number) => Math.round(value * 10) / 10;
      return {
        cardWidth: round(cardRect.width),
        cardHeight: round(cardRect.height),
        cardRadius: cardStyles.borderRadius,
        cardPaddingBottom: cardStyles.paddingBottom,
        previewWidth: round(previewRect.width),
        previewHeight: round(previewRect.height),
        previewAspectRatio: previewStyles.aspectRatio,
        previewBackground: previewStyles.backgroundColor,
      };
    });
    await expect(templateEntry).not.toHaveAttribute("aria-disabled", "true");
    await expect(templateEntry).toContainText("点击添加 · 可拖拽");
    await templateEntry.click();
    const pageLayer = pageWorkspace.locator(".homepage-editor__layer-item").first();
    await expect(pageLayer).toBeVisible();
    await expect(pageLayer.getByRole("button", { name: /复制首屏/ })).toHaveCount(0);
    await expect(pageWorkspace).toBeVisible();
    await expect(page.getByText("正在编辑独立模板")).toHaveCount(0);
    await expect.poll(() => unifiedCatalogReads.length).toBeGreaterThan(0);
    const pageModeCatalogReadCount = unifiedCatalogReads.length;
    expect(legacyCatalogReads).toEqual([]);

    await openTemplateFromCatalog(page, "首屏");

    await expect(pageWorkspace).toBeHidden();
    const designTemplateLibrary = page.getByRole("complementary", { name: "模板组件库" });
    await expect(designTemplateLibrary).toHaveAttribute("data-unified-template-library", "design");
    await expect(designTemplateLibrary.getByRole("button", { name: "单列查看" }))
      .toHaveAttribute("aria-pressed", "true");
    await expect(designTemplateLibrary.getByRole("heading", { name: "模板目录", exact: true })).toBeVisible();
    await expect(designTemplateLibrary.getByRole("button", { name: "新建空白模板" })).toBeVisible();
    const designCatalogLayout = await readTemplateCatalogLayout(designTemplateLibrary);
    expect(designCatalogLayout).toEqual(pageCatalogLayout);
    await expect(page.getByRole("button", { name: "正在编辑首屏模板" })
      .locator("xpath=ancestor::*[@data-template-catalog-card='shared']")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "正在编辑首屏模板" })
      .locator("xpath=ancestor::*[@data-template-identity='source:legacy_system_hero']"))
      .toHaveCount(1);
    const designCatalogCard = page.getByRole("button", { name: "正在编辑首屏模板" })
      .locator("xpath=ancestor::*[@data-template-catalog-card='shared']");
    const designCardAppearance = await designCatalogCard.evaluate((card) => {
      const preview = card.querySelector<HTMLElement>(".homepage-editor__template-preview-wrap");
      if (!preview) throw new Error("模板卡缺少统一预览框");
      const cardRect = card.getBoundingClientRect();
      const previewRect = preview.getBoundingClientRect();
      const cardStyles = getComputedStyle(card);
      const previewStyles = getComputedStyle(preview);
      const round = (value: number) => Math.round(value * 10) / 10;
      return {
        cardWidth: round(cardRect.width),
        cardHeight: round(cardRect.height),
        cardRadius: cardStyles.borderRadius,
        cardPaddingBottom: cardStyles.paddingBottom,
        previewWidth: round(previewRect.width),
        previewHeight: round(previewRect.height),
        previewAspectRatio: previewStyles.aspectRatio,
        previewBackground: previewStyles.backgroundColor,
      };
    });
    expect(designCardAppearance).toEqual(pageCardAppearance);
    await expect(page.getByRole("region", { name: /模板(?:设计)?画布/ })).toBeVisible();
    const templateStructure = page.getByRole("complementary", { name: "模板结构" });
    await expect(templateStructure).toBeVisible();
    await expect(templateStructure.locator('[data-workspace-panel-header="shared"]')).toHaveCount(1);
    await expect.poll(() => unifiedCatalogReads.length).toBeGreaterThan(pageModeCatalogReadCount);
    expect(legacyCatalogReads).toEqual([]);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("系统母模板保存为统一草稿后，两种模式呈现同一 V2 定义且页面不再回退旧 Renderer", async ({ page }) => {
    const { forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeEmptyDraft(),
    });

    await openTemplateFromCatalog(page, "首屏");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();

    const designControl = page.getByRole("button", { name: "正在编辑首屏模板" });
    const designCard = designControl.locator("xpath=ancestor::*[@data-template-catalog-card='shared']");
    await expect(designCard).toHaveAttribute("data-template-identity", "source:legacy_system_hero");
    await expect(designCard).not.toContainText("草稿 · 发布后可用于页面");
    await expect(designCard).not.toContainText("可编辑 · 首屏");
    const desktopDesignSignature = await readTemplateCatalogRenderSignature(designCard);
    await page.getByRole("button", { name: /移动端模板布局/ }).click();
    const mobileDesignSignature = await readTemplateCatalogRenderSignature(designCard);

    await page.getByRole("button", { name: "页面装修" }).click();
    const pageControl = page.getByRole("button", {
      name: "首屏模板草稿尚未发布，暂时不能添加到页面",
    });
    const pageCard = pageControl.locator("xpath=ancestor::*[@data-template-catalog-card='shared']");
    await expect(pageControl).toHaveAttribute("aria-disabled", "true");
    await expect(pageCard).toHaveAttribute("data-template-identity", "source:legacy_system_hero");
    await expect(pageCard).not.toContainText("草稿 · 发布后可用于页面");
    await expect(pageCard).not.toContainText("可编辑 · 首屏");
    await expect(page.getByRole("button", {
      name: "首屏：点击添加到页面末尾，也可拖到画布指定位置",
    })).toHaveCount(0);

    const desktopPageSignature = await readTemplateCatalogRenderSignature(pageCard);
    expect(desktopPageSignature).toEqual(desktopDesignSignature);
    await page.getByRole("button", { name: /移动端布局/ }).click();
    const mobilePageSignature = await readTemplateCatalogRenderSignature(pageCard);
    expect(mobilePageSignature).toEqual(mobileDesignSignature);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("统一母模板归档后退出页面目录但保留设计端归档入口", async ({ page }) => {
    const { dynamic, forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeEmptyDraft(),
    });

    await openTemplateFromCatalog(page, "首屏");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();
    await page.getByRole("button", { name: "发布模板新版本" }).click();
    await page.getByRole("dialog", { name: "确认发布模板 v1" })
      .getByRole("button", { name: "确认发布模板" })
      .click();
    await expect(page.getByText("模板 v1 已发布；现有页面仍保持原版本")).toBeVisible();

    const archived = dynamic.records[0];
    archived.status = "ARCHIVED";
    archived.archivedAt = "2026-08-31T10:00:00.000Z";
    await page.evaluate(() => window.dispatchEvent(new Event("haichuan:dynamic-template-server-changed")));

    const designCard = page.getByRole("button", { name: "正在编辑首屏模板" })
      .locator("xpath=ancestor::*[@data-template-catalog-card='shared']");
    await expect(designCard).toContainText("已归档");
    expect(dynamic.versionsByTemplateId.get(archived.templateId)).toHaveLength(1);

    await page.getByRole("button", { name: "页面装修" }).click();
    const pageLibrary = page.getByRole("complementary", { name: "模板组件库" });
    await expect(pageLibrary.locator('[data-template-identity="source:legacy_system_hero"]')).toHaveCount(0);
    await expect(page.getByRole("button", {
      name: "首屏：点击添加到页面末尾，也可拖到画布指定位置",
    })).toHaveCount(0);
    await expect(page.getByRole("button", {
      name: "首屏模板草稿尚未发布，暂时不能添加到页面",
    })).toHaveCount(0);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("首屏预览素材失效时目录与设计画布保持同一浅色空态", async ({ page }) => {
    const { forbiddenPageWrites } = await openWorkspaceShell(page, { role: "SUPER_ADMIN" });

    await page.getByRole("button", { name: "模板设计" }).click();
    const catalogCard = page.getByRole("button", { name: "正在编辑首屏模板" })
      .locator("xpath=ancestor::*[@data-template-catalog-card='shared']");
    const catalogHero = catalogCard.locator('[data-content-template="hero"]');
    await catalogHero.locator("img").evaluate((image) => {
      (image as HTMLImageElement).src = "/__missing-template-preview.svg";
    });
    await expect(catalogHero.locator('[data-asset-placeholder-status="waiting-final-asset"]'))
      .toBeVisible();
    await expect.poll(() => catalogHero.evaluate((node) => getComputedStyle(node).backgroundColor))
      .toBe("rgb(247, 248, 248)");

    const frame = page.frameLocator(".template-editor__viewport-frame");
    const canvasHero = frame.locator('[data-content-template="hero"]');
    const canvasImage = canvasHero.locator("img");
    if (await canvasImage.count() > 0) {
      await canvasImage.evaluate((image) => {
        (image as HTMLImageElement).src = "/__missing-template-preview.svg";
      });
    }
    await expect(canvasHero.locator('[data-asset-placeholder-status="waiting-final-asset"]'))
      .toBeVisible();
    await expect(canvasHero.locator(".hc-phase1-hero__copy-shade")).toHaveCount(0);
    await expect(canvasHero.locator('.hc-phase1-hero__copy[data-tone="dark"]')).toBeVisible();
    await expect.poll(() => canvasHero.evaluate((node) => getComputedStyle(node).backgroundColor))
      .toBe("rgb(247, 248, 248)");

    await page.getByRole("button", { name: /移动端模板布局/ }).click();
    const mobileCatalogHero = catalogCard.locator('[data-content-template="hero"]');
    const mobileCatalogImage = mobileCatalogHero.locator("img");
    if (await mobileCatalogImage.count() > 0) {
      await mobileCatalogImage.evaluate((image) => {
        (image as HTMLImageElement).src = "/__missing-template-preview-mobile.svg";
      });
    }
    await expect(mobileCatalogHero.locator('[data-asset-placeholder-status="waiting-final-asset"]'))
      .toBeVisible();
    const mobileCanvasHero = frame.locator('[data-content-template="hero"]');
    await expect(mobileCanvasHero.locator('[data-asset-placeholder-status="waiting-final-asset"]'))
      .toBeVisible();
    await expect(mobileCanvasHero.locator(".hc-phase1-hero__copy-shade")).toHaveCount(0);
    await expect(mobileCanvasHero.locator('.hc-phase1-hero__copy[data-tone="dark"]')).toBeVisible();
    await expect.poll(() => mobileCanvasHero.evaluate((node) => getComputedStyle(node).backgroundColor))
      .toBe("rgb(247, 248, 248)");
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("统一目录路由尚未注册时从真实兼容接口恢复全部系统母模板", async ({ page }) => {
    const catalogReads: string[] = [];
    page.on("request", (request) => {
      if (request.method() !== "GET") return;
      const pathname = new URL(request.url()).pathname;
      if (
        pathname.endsWith("/page-modules/dynamic-templates/catalog")
        || pathname.endsWith("/page-modules/dynamic-templates/mine")
        || pathname.endsWith("/page-modules/dynamic-templates/published")
        || pathname.endsWith("/page-modules/personal-content-templates")
        || pathname.endsWith("/page-modules/system-content-templates")
      ) catalogReads.push(pathname);
    });

    await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      unifiedCatalogUnavailable: true,
    });
    await page.getByRole("button", { name: "模板设计" }).click();

    const library = page.getByRole("complementary", { name: "模板组件库" });
    await expect(library.locator(".unified-template-library__card"))
      .toHaveCount(CONTENT_TEMPLATE_EDITOR_ACCEPTANCE_MATRIX.length);
    await expect(library.getByText("模板目录暂时无法读取", { exact: false })).toHaveCount(0);
    await expect(library.getByRole("button", { name: /(?:打开|正在编辑)首屏模板/ })).toBeVisible();
    expect(catalogReads.some((path) => path.endsWith("/dynamic-templates/catalog"))).toBe(true);
    expect(catalogReads.some((path) => path.endsWith("/dynamic-templates/mine"))).toBe(true);
    expect(catalogReads.some((path) => path.endsWith("/dynamic-templates/published"))).toBe(true);
    expect(catalogReads.some((path) => path.endsWith("/personal-content-templates"))).toBe(true);
    expect(catalogReads.some((path) => path.endsWith("/system-content-templates"))).toBe(true);
  });

  test("进入模板设计默认打开首屏，并复用相同顶部控件几何与状态规范", async ({ page }) => {
    const unifiedCatalogReads: string[] = [];
    const legacyCurrentTemplateReads: string[] = [];
    page.on("request", (request) => {
      const pathname = new URL(request.url()).pathname;
      if (request.method() === "GET" && pathname.endsWith("/dynamic-templates/catalog")) {
        unifiedCatalogReads.push(pathname);
      }
      if (request.method() === "GET" && pathname.endsWith("/system-content-templates/hero")) {
        legacyCurrentTemplateReads.push(pathname);
      }
    });
    const { forbiddenPageWrites } = await openWorkspaceShell(page, { role: "SUPER_ADMIN" });
    const pageGeometry = await readSharedToolbarGeometry(page);
    const pageTabs = page.getByRole("group", { name: "店铺装修工作模式切换" });
    await expect(pageTabs).toHaveAttribute("data-active-mode", "page");
    await expect(pageTabs.getByRole("button")).toHaveText("进入模板设计");
    await expect(pageTabs.getByRole("button")).toHaveCount(1);

    await pageTabs.getByRole("button", { name: "模板设计" }).click();
    await expect(page.getByRole("region", { name: /模板(?:设计)?画布/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "正在编辑首屏模板" })).toBeVisible();
    await expect(page.getByRole("region", { name: "空模板画布" })).toHaveCount(0);
    const templateGeometry = await readSharedToolbarGeometry(page);
    const templateTabs = page.getByRole("group", { name: "店铺装修工作模式切换" });
    await expect(templateTabs).toHaveAttribute("data-active-mode", "template");
    await expect(templateTabs.getByRole("button")).toHaveText("返回页面装修");
    await expect(templateTabs.getByRole("button")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "保存模板", exact: true })).toBeEnabled();
    await expect.poll(() => unifiedCatalogReads.length).toBeGreaterThan(0);
    expect(legacyCurrentTemplateReads).toEqual([]);
    expectSharedToolbarGeometryEqual(pageGeometry, templateGeometry);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("两种模式复用面板折叠控件且分别恢复各自工作区状态", async ({ page }) => {
    await page.addInitScript(() => {
      sessionStorage.removeItem("template-editor-structure-collapsed");
      sessionStorage.removeItem("template-editor-inspector-collapsed");
    });
    await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      viewport: { width: 1600, height: 900 },
    });

    const pageWorkspace = page.locator(".homepage-editor__page-workspace");
    const pageStructureCollapse = pageWorkspace.getByRole("button", { name: "收起图层面板" });
    const pageInspectorCollapse = pageWorkspace.getByRole("button", { name: "收起属性面板" });
    await expect(pageStructureCollapse).toHaveAttribute("data-workspace-panel-collapse", "shared");
    await expect(pageInspectorCollapse).toHaveAttribute("data-workspace-panel-collapse", "shared");
    await pageStructureCollapse.click();
    await pageInspectorCollapse.click();
    await expect(pageWorkspace.locator(".homepage-editor__structure-workspace")).toHaveClass(/is-collapsed/);
    await expect(pageWorkspace.locator(".homepage-editor__right-workspace")).toHaveClass(/is-inspector-collapsed/);

    await page.getByRole("button", { name: "模板设计" }).click();
    const templateWorkspace = page.locator(".template-editor__body");
    await expect(page.getByRole("region", { name: /模板(?:设计)?画布/ })).toBeVisible();
    const templateStructureCollapse = templateWorkspace.getByRole("button", { name: "收起模板结构面板" });
    const templateInspectorCollapse = templateWorkspace.getByRole("button", { name: "收起模板属性面板" });
    await expect(templateStructureCollapse).toHaveAttribute("data-workspace-panel-collapse", "shared");
    await expect(templateInspectorCollapse).toHaveAttribute("data-workspace-panel-collapse", "shared");
    await templateStructureCollapse.click();
    await templateInspectorCollapse.click();
    await expect.poll(() => templateWorkspace.evaluate((element) => {
      const styles = getComputedStyle(element);
      return [
        styles.getPropertyValue("--editor-structure-dock-width").trim(),
        styles.getPropertyValue("--editor-inspector-dock-width").trim(),
      ];
    })).toEqual(["40px", "40px"]);

    await page.setViewportSize({ width: 1024, height: 900 });
    await expect.poll(() => templateWorkspace.evaluate((element) => {
      const styles = getComputedStyle(element);
      return [
        styles.getPropertyValue("--editor-structure-width").trim(),
        styles.getPropertyValue("--editor-inspector-width").trim(),
      ];
    })).toEqual(["40px", "40px"]);

    await page.getByRole("button", { name: "页面装修" }).click();
    await expect(pageWorkspace.locator(".homepage-editor__structure-workspace")).toHaveClass(/is-collapsed/);
    await expect(pageWorkspace.locator(".homepage-editor__right-workspace")).toHaveClass(/is-inspector-collapsed/);

    await page.getByRole("button", { name: "模板设计" }).click();
    await expect(templateWorkspace.getByRole("button", { name: "展开模板结构面板" }))
      .toHaveAttribute("data-workspace-panel-collapse", "shared");
    await expect(templateWorkspace.getByRole("button", { name: "展开模板属性面板" }))
      .toHaveAttribute("data-workspace-panel-collapse", "shared");
  });

  for (const viewport of [
    { width: 1280, library: 80, structure: 140, inspector: 440 },
    { width: 1440, library: 236, structure: 144, inspector: 440 },
    { width: 1600, library: 272, structure: 168, inspector: 440 },
    { width: 1920, library: 272, structure: 168, inspector: 440 },
  ]) {
    test(`${viewport.width}px 桌面模板工作区与页面装修共用外壳尺寸`, async ({ page }) => {
      await openWorkspaceShell(page, {
        role: "SUPER_ADMIN",
        viewport: { width: viewport.width, height: 900 },
      });
      await page.getByRole("button", { name: "模板设计" }).click();
      await expect(page.getByRole("region", { name: /模板(?:设计)?画布/ })).toBeVisible();
      const metrics = await page.locator(".template-editor__body").evaluate((element) => {
        const styles = getComputedStyle(element);
        const read = (name: string) => Number.parseFloat(styles.getPropertyValue(name));
        return {
          innerWidth: window.innerWidth,
          bodyWidth: element.getBoundingClientRect().width,
          library: read("--editor-library-dock-width"),
          structure: read("--editor-structure-dock-width"),
          inspector: read("--editor-inspector-dock-width"),
        };
      });
      expect(metrics.innerWidth).toBe(viewport.width);
      expect(metrics.library).toBe(viewport.library);
      expect(metrics.structure).toBe(viewport.structure);
      expect(metrics.inspector).toBe(viewport.inspector);
      expect(metrics.bodyWidth - metrics.library - metrics.structure - metrics.inspector).toBeGreaterThanOrEqual(560);
    });
  }

  test("1920px 两种模式复用横向画布外壳，模板编辑层控制条独立占位", async ({ page }) => {
    await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      viewport: { width: 1920, height: 948 },
    });

    const readCanvasGeometry = async (rootSelector: string, documentSelector: string) =>
      page.locator(rootSelector).evaluate((root, selector) => {
        const controls = root.querySelector<HTMLElement>(".homepage-editor__canvas-controls");
        const scroll = root.querySelector<HTMLElement>(".homepage-editor__canvas-scroll");
        const document = root.querySelector<HTMLElement>(selector);
        if (!controls || !scroll || !document) throw new Error("画布外壳未完整渲染");
        const round = (value: number) => Math.round(value * 10) / 10;
        const rect = (element: HTMLElement) => {
          const value = element.getBoundingClientRect();
          return {
            left: round(value.left),
            top: round(value.top),
            right: round(value.right),
            width: round(value.width),
          };
        };
        return {
          controls: rect(controls),
          scroll: rect(scroll),
          document: rect(document),
        };
      }, documentSelector);

    const pageDocument = page.locator(
      ".homepage-editor__page-workspace .homepage-editor__canvas-document",
    );
    await expect(pageDocument).toBeVisible();
    const pageGeometry = await readCanvasGeometry(
      ".homepage-editor__page-workspace",
      ".homepage-editor__canvas-document",
    );

    await page.getByRole("button", { name: "模板设计" }).click();
    const templateDocument = page.locator(
      ".template-editor__body .template-editor__canvas-document",
    );
    await expect(templateDocument).toBeVisible();
    await expect(
      page.locator(".template-editor__body").getByLabel(/画布尺寸 1920 × 1200/),
    ).toBeVisible();
    const templateGeometry = await readCanvasGeometry(
      ".template-editor__body",
      ".template-editor__canvas-document",
    );

    expect(templateGeometry.controls).toMatchObject({
      left: pageGeometry.controls.left,
      right: pageGeometry.controls.right,
      width: pageGeometry.controls.width,
    });
    expect(templateGeometry.scroll).toMatchObject({
      left: pageGeometry.scroll.left,
      right: pageGeometry.scroll.right,
      width: pageGeometry.scroll.width,
    });
    expect(templateGeometry.document).toMatchObject({
      left: pageGeometry.document.left,
      right: pageGeometry.document.right,
      width: pageGeometry.document.width,
    });
    const controlsOffset = templateGeometry.controls.top - pageGeometry.controls.top;
    const scrollOffset = templateGeometry.scroll.top - pageGeometry.scroll.top;
    const documentOffset = templateGeometry.document.top - pageGeometry.document.top;
    expect(controlsOffset).toBe(0);
    expect(scrollOffset).toBe(controlsOffset);
    expect(documentOffset).toBe(controlsOffset);
    await expect(page.frameLocator(".template-editor__viewport-frame")
      .locator(".template-editor__dynamic-canvas-renderer"))
      .toBeVisible();
  });

  test("键盘可从模式切换按钮到达模板搜索、目录卡片、结构树、画布和属性", async ({ page }) => {
    await openWorkspaceShell(page, { role: "SUPER_ADMIN" });
    const modeSwitch = page.getByRole("button", { name: "模板设计" });
    await modeSwitch.focus();
    await expect(modeSwitch).toBeFocused();
    await modeSwitch.press("Enter");
    await expect(page.getByRole("region", { name: /模板(?:设计)?画布/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "页面装修" })).toBeVisible();

    const search = page.getByRole("textbox", { name: "搜索模板" });
    await search.focus();
    await expect(search).toBeFocused();
    const card = page.getByRole("button", { name: "正在编辑首屏模板" });
    await card.focus();
    await expect(card).toBeFocused();
    await card.press("Enter");

    const rootTreeItem = page.getByRole("treeitem", { name: /模板根节点/ });
    await rootTreeItem.focus();
    await expect(rootTreeItem).toBeFocused();
    const canvasFrame = page.locator(".template-editor__viewport-frame");
    await canvasFrame.focus();
    await expect(canvasFrame).toBeFocused();
    const nameField = page.getByRole("textbox", { name: "模板名称", exact: true });
    await nameField.focus();
    await expect(nameField).toBeFocused();
  });

  test("同一四区外壳默认打开首屏母模板，并原样恢复页面状态", async ({ page }) => {
    const { forbiddenPageWrites } = await openWorkspaceShell(page, {
      draft: makeTemplateWorkspaceLayerDraft(),
    });
    const pageWorkspace = page.locator(".homepage-editor__page-workspace");
    const layers = pageWorkspace.locator(".homepage-editor__layer-item");
    await layers.first().getByRole("button", { name: "隐藏首屏" }).click();
    await page.getByRole("button", { name: /移动端布局/ }).click();

    await page.getByRole("button", { name: "模板设计" }).click();
    await expect(page.getByRole("region", { name: /模板(?:设计)?画布/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "正在编辑首屏模板" })).toBeVisible();
    const templateCatalog = page.getByRole("complementary", { name: "模板组件库" });
    await expect(templateCatalog).toContainText("模板目录");
    await expect(templateCatalog).not.toContainText("系统基线");
    for (const purpose of ["品牌展示", "商品销售", "活动转化", "内容传播", "信任建立"]) {
      await expect(templateCatalog.getByRole("heading", { name: purpose, exact: true })).toHaveCount(0);
    }
    await expect(templateCatalog.getByRole("heading", { name: /系统模板|个人模板|动态模板/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "保存模板", exact: true })).toBeEnabled();
    await expect(pageWorkspace).toBeHidden();
    await expect(page.getByRole("region", { name: /模板(?:设计)?画布/ })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "模板结构" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "模板属性工作区" })).toBeVisible();
    await expect(page.locator(".template-editor__viewport-frame")).toHaveAttribute("title", /桌面模板隔离画布/);

    await page.getByRole("button", { name: "页面装修" }).click();
    await expect(pageWorkspace).toBeVisible();
    await expect(layers.first()).toHaveAttribute("data-layer-visible", "false");
    await expect(page.getByRole("button", { name: /移动端布局/ })).toHaveAttribute("aria-pressed", "true");
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("切换母模板时自动保存并直接打开目标模板", async ({ page }) => {
    const { forbiddenPageWrites, writes, dynamic } = await openWorkspaceShell(page);
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "正在编辑首屏模板" }).click();
    await page.getByRole("textbox", { name: "模板名称", exact: true }).fill("尚未保存的首屏构图");

    await page.getByRole("button", { name: "打开通栏图模板" }).click();
    await expect(page.getByRole("dialog", { name: "保存当前修改？" })).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "模板名称", exact: true })).toHaveValue("通栏图");
    expect(dynamic.writes).toHaveLength(1);
    expect(dynamic.writes[0].body.definition.name).toBe("尚未保存的首屏构图");
    expect(writes).toEqual([]);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("打开已有母模板但未编辑时可直接返回页面装修", async ({ page }) => {
    const { forbiddenPageWrites, writes } = await openWorkspaceShell(page);
    await openTemplateFromCatalog(page, "通栏图");

    await page.getByRole("button", { name: "页面装修" }).click();

    await expect(page.getByRole("dialog", { name: "切换到页面装修？" })).toHaveCount(0);
    await expect(page.locator(".homepage-editor__page-workspace .homepage-editor__structure-workspace"))
      .toBeVisible();
    expect(writes).toEqual([]);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("已有母模板直接进入统一编辑器，覆盖后发布到同一页面装修目录", async ({ page }) => {
    const { forbiddenPageWrites, dynamic } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
    });
    await openTemplateFromCatalog(page, "首屏");
    await expect(page.getByRole("region", { name: /首屏模板设计画布/ })).toBeVisible();
    await expect(page.getByRole("treeitem", { name: /页面区段/ })).toBeVisible();
    await expect(page.getByText(/转换为新版|固定模板|动态模板/)).toHaveCount(0);
    await page.getByRole("textbox", { name: "模板名称", exact: true }).fill("品牌首屏母模板");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "保存模板" })).toHaveCount(0);
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();
    const templateLibrary = page.getByRole("complementary", { name: "模板组件库" });
    const unifiedSourceCard = templateLibrary.locator('[data-template-identity="source:legacy_system_hero"]');
    await expect(unifiedSourceCard).toHaveCount(1);
    await expect(unifiedSourceCard).not.toContainText("草稿 · 发布后可用于页面");
    await expect(page.getByRole("button", { name: "打开首屏模板" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "正在编辑品牌首屏母模板模板" })).toBeVisible();
    const definition = dynamic.writes[0].body.definition as Record<string, any>;
    const matureNode = Object.values(definition.nodes).find((node: any) => node.type === "HeroTemplate") as any;
    expect(matureNode).toBeTruthy();
    expect(dynamic.writes[0].body.definition.name).toBe("品牌首屏母模板");
    expect(dynamic.writes[0].body.sourceReference).toBe("legacy_system_hero");

    const persisted = dynamic.records[0];
    expect(persisted).toMatchObject({
      ownerId: null,
      sourceType: "SYSTEM",
      sourceReference: "legacy_system_hero",
    });
    persisted.publishedVersion = 1;
    persisted.visibility = "STAFF";
    dynamic.versionsByTemplateId.set(persisted.templateId, [{
      id: 9001,
      dynamicTemplateId: persisted.id,
      version: 1,
      schemaVersion: persisted.draft.definition.schemaVersion,
      definition: structuredClone(persisted.draft.definition),
      definitionChecksum: `published-${persisted.templateId}-v1`,
      versionNote: null,
      publishedAt: "2026-08-29T10:00:00.000Z",
    }]);
    await page.evaluate(() => window.dispatchEvent(new Event("haichuan:dynamic-template-server-changed")));
    await page.getByRole("button", { name: "页面装修" }).click();
    await expect(page.getByRole("button", {
      name: "首屏：点击添加到页面末尾，也可拖到画布指定位置",
    })).toHaveCount(0);
    const publishedTemplateCard = page.getByRole("button", { name: "添加品牌首屏母模板版本1" });
    await expect(publishedTemplateCard).toBeVisible();
    await expect(publishedTemplateCard.locator("xpath=ancestor::*[@data-template-identity='source:legacy_system_hero']"))
      .toHaveCount(1);
    await expect(templateLibrary.getByRole("heading", { name: "品牌展示", exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "已发布模板", exact: true })).toHaveCount(0);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("模板设计发布后由页面装修同一目录直接插入精确版本", async ({ page }) => {
    const { dynamic, forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeEmptyDraft(),
    });
    await openTemplateFromCatalog(page, "首屏");
    await page.getByRole("textbox", { name: "模板名称", exact: true }).fill("目录互通首屏");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();

    await page.getByRole("button", { name: "发布模板新版本" }).click();
    await page.getByRole("dialog", { name: "确认发布模板 v1" })
      .getByRole("button", { name: "确认发布模板" })
      .click();
    await expect(page.getByText("模板 v1 已发布；现有页面仍保持原版本")).toBeVisible();

    const persisted = dynamic.records[0];
    expect(persisted.sourceReference).toBe("legacy_system_hero");
    await page.getByRole("button", { name: "页面装修" }).click();
    const pageLibrary = page.getByRole("complementary", { name: "模板组件库" });
    const card = pageLibrary.getByRole("button", { name: "添加目录互通首屏版本1" });
    await expect(card).toBeVisible();
    await expect(card.locator("xpath=ancestor::*[@data-template-identity='source:legacy_system_hero']"))
      .toHaveCount(1);
    await card.click();
    await expect(page.getByText("已添加“目录互通首屏”v1，可在右侧填写页面内容")).toBeVisible();
    await expect(page.getByRole("region", { name: "模板实例属性" })).toContainText("目录互通首屏");
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("超级管理员编辑统一母模板时保持独立撤销与页面会话隔离", async ({ page }) => {
    const { writes, dynamic, forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeTemplateWorkspaceLayerDraft(),
    });
    const pageLayer = page.locator(".homepage-editor__page-workspace .homepage-editor__structure-workspace");
    const layers = page.locator(".homepage-editor__page-workspace .homepage-editor__layer-item");
    await layers.first().getByRole("button", { name: "隐藏首屏" }).click();
    await page.getByRole("button", { name: /移动端布局/ }).click();

    await openTemplateFromCatalog(page, "首屏");
    await expect(page.getByRole("region", { name: /模板设计画布/ })).toBeVisible();
    await expect(page.getByRole("treeitem", { name: /页面区段/ })).toBeVisible();
    await expect(pageLayer).toBeHidden();

    const name = page.getByRole("textbox", { name: "模板名称", exact: true });
    const originalName = await name.inputValue();
    await name.fill("品牌首屏｜全宽主视觉");
    await pressWorkspaceHistory(page, "undo");
    await expect(name).toHaveValue(originalName);
    await pressWorkspaceHistory(page, "redo");
    await expect(name).toHaveValue("品牌首屏｜全宽主视觉");

    await page.locator(".template-editor__toolbar").getByRole("button", { name: /移动端模板布局/ }).click();
    await expect(page.locator(".template-editor__viewport-frame")).toHaveAttribute("title", /移动模板隔离画布/);
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();
    expect(writes).toEqual([]);
    expect(dynamic.writes).toHaveLength(1);
    expect(dynamic.writes[0]).toMatchObject({
      method: "POST",
      pathname: "/api/page-modules/dynamic-templates",
      body: { sourceReference: "legacy_system_hero" },
    });
    expect(dynamic.writes[0].body.definition.name).toBe("品牌首屏｜全宽主视觉");
    expect(JSON.stringify(dynamic.writes[0].body)).not.toContain("PageDocument");

    await page.getByRole("button", { name: "页面装修" }).click();
    await expect(pageLayer).toBeVisible();
    await expect(layers.first()).toHaveAttribute("data-layer-visible", "false");
    await expect(page.getByRole("button", { name: /移动端布局/ })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("dialog", { name: "切换到页面装修？" })).toHaveCount(0);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("账号母模板直接进入统一编辑器，覆盖只写统一模板草稿", async ({ page }) => {
    const personal = personalTemplateFixture();
    const { writes, dynamic, forbiddenPageWrites } = await openWorkspaceShell(page, {
      personalTemplates: [personal],
    });
    await openTemplateFromCatalog(page, personal.name);
    const name = page.getByRole("textbox", { name: "模板名称", exact: true });
    await name.fill("我的品牌首屏｜调整版");

    await page.getByRole("button", { name: "页面装修" }).click();
    await expect(page.getByRole("dialog", { name: "切换到页面装修？" })).toHaveCount(0);
    await expect(page.locator(".homepage-editor__page-workspace .homepage-editor__structure-workspace")).toBeVisible();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();
    expect(writes).toEqual([]);
    expect(dynamic.writes).toHaveLength(1);
    expect(dynamic.writes[0]).toMatchObject({
      method: "POST",
      pathname: "/api/page-modules/dynamic-templates",
      body: { sourceReference: `legacy_personal_${personal.id}` },
    });
    expect((dynamic.writes[0].body.definition as Record<string, any>).name).toBe("我的品牌首屏｜调整版");
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("打开页面时个人模板只自动升级当前草稿布局并标记未保存，不写页面接口", async ({ page }) => {
    const draft = makeHeroDraft();
    (draft.puckData.content[0].props as Record<string, any>).__templateOrigin = {
      kind: "personal",
      templateId: 71,
      revision: 1,
    };
    draft.puckData.content[0].props.title = "必须保留的真实页面标题";
    const latest = personalTemplateFixture({
      revision: 2,
      layoutData: {
        version: 2,
        frame: { aspectRatioByViewport: { desktop: 0.5 } },
      },
    });
    const { forbiddenPageWrites } = await openWorkspaceShell(page, {
      draft,
      personalTemplates: [latest],
    });

    await expect(page.getByText("修改已更新，尚未保存本地草稿", { exact: true })).toBeVisible();
    await expect(page.getByText(/已将 1 个历史模板实例布局升级到最新版本/)).toBeVisible();
    await expect(
      page.frameLocator(".homepage-editor__canvas-scale iframe")
        .getByText("必须保留的真实页面标题"),
    ).toBeVisible();
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("系统母模板新版只显示提示，运营确认后才升级页面草稿且不自动发布", async ({ page }) => {
    const draft = makeHeroDraft();
    (draft.puckData.content[0].props as Record<string, any>).__templateOrigin = {
      kind: "system",
      contractKey: "hero",
      version: 1,
    };
    draft.puckData.content[0].props.title = "系统升级仍保留的页面标题";
    const { system, forbiddenPageWrites } = await openWorkspaceShell(page, { draft });
    const contract = getContentTemplateContract("首屏主视觉")!;
    system.versions.set("hero", [{
      version: 2,
      contractKey: "hero",
      moduleType: "首屏主视觉",
      contractVersion: contract.version,
      layoutData: {
        version: 2,
        frame: { aspectRatioByViewport: { desktop: 0.5 } },
      },
      changeNote: "新版构图",
      createdById: 1,
      createdAt: "2026-08-29T10:00:00.000Z",
    }]);
    system.activeVersions.set("hero", 2);
    await page.evaluate(() => window.dispatchEvent(new Event("haichuan:system-template-changed")));

    const upgrade = page.getByRole("button", { name: /升级页面中的首屏模板/ });
    await expect(upgrade).toBeVisible();
    await expect(page.getByText("修改已更新，尚未保存本地草稿", { exact: true })).toHaveCount(0);
    await upgrade.click();
    const confirm = page.getByRole("dialog", { name: "升级“首屏”页面实例？" });
    await expect(confirm).toContainText("不会自动发布");
    await confirm.getByRole("button", { name: "升级当前页面草稿" }).click();

    await expect(page.getByText("修改已更新，尚未保存本地草稿", { exact: true })).toBeVisible();
    await expect(
      page.frameLocator(".homepage-editor__canvas-scale iframe")
        .getByText("系统升级仍保留的页面标题"),
    ).toBeVisible();
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("母模板保存失败保留脏草稿，EDITOR 只能使用模板且看不到设计入口", async ({ page }) => {
    const failed = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      failTemplateWrites: true,
    });
    await openTemplateFromCatalog(page, "首屏");
    await page.getByRole("textbox", { name: "模板名称" }).fill("失败仍保留的模板");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板保存失败，修改仍在", { exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "模板名称", exact: true })).toHaveValue("失败仍保留的模板");
    await page.getByRole("button", { name: "页面装修" }).click();
    await expect(page.getByRole("dialog", { name: "切换到页面装修？" })).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "模板名称", exact: true })).toHaveValue("失败仍保留的模板");
    expect(failed.writes).toEqual([]);
    expect(failed.dynamic.writes).toEqual([]);
    expect(failed.forbiddenPageWrites).toEqual([]);

    await page.unrouteAll({ behavior: "wait" });
    const editor = await openWorkspaceShell(page, {
      role: "EDITOR",
      personalTemplates: [personalTemplateFixture()],
    });
    await expect(page.getByRole("button", { name: /^编辑.+模板；/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "编辑模板" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "重命名模板" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "复制模板" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "删除模板" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "模板设计" })).toBeDisabled();
    expect(editor.writes).toEqual([]);
    expect(editor.forbiddenPageWrites).toEqual([]);
  });

  test("ADMIN 可装修和发布页面，但不能进入或写入模板设计工作区", async ({ page }) => {
    const admin = await openWorkspaceShell(page, {
      role: "ADMIN",
      personalTemplates: [personalTemplateFixture()],
    });
    await expect(page.getByRole("button", { name: "模板设计" })).toBeDisabled();
    await expect(page.getByRole("group", { name: "店铺装修工作模式切换" }))
      .toHaveAttribute("data-active-mode", "page");
    await expect(page.getByRole("button", { name: "页面装修" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "新建空白模板" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^打开.+模板$/ })).toHaveCount(0);
    expect(admin.writes).toEqual([]);
    expect(admin.dynamic.writes).toEqual([]);
    expect(admin.system.writes).toEqual([]);
    expect(admin.forbiddenPageWrites).toEqual([]);
  });

  test("超级管理员新建统一模板，编辑稳定节点树、保存草稿并独立发布新版本", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem("haichuan.dynamic-template-drafts.v1");
    });
    const { forbiddenPageWrites, dynamic } = await openWorkspaceShell(page, {
      draft: makeTemplateWorkspaceLayerDraft(),
    });
    const pageLayer = page.locator(".homepage-editor__page-workspace .homepage-editor__structure-workspace");
    await expect(pageLayer).toBeVisible();
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建空白模板" }).click();

    await expect(page.getByRole("complementary", { name: "模板组件库" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "模板结构" })).toBeVisible();
    await expect(page.getByRole("region", { name: /模板设计画布/ })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "模板属性", exact: true })).toBeVisible();
    await expect(pageLayer).toBeHidden();

    await page.getByRole("textbox", { name: "模板名称" }).fill("品牌首屏｜左文右图动态版");
    await expect(page.getByLabel("默认背景")).toHaveValue("surface");
    await page.getByRole("tab", { name: "布局" }).click();
    await expect(page.getByLabel("布局方式")).toHaveValue("block");
    await expect(page.getByText("背景令牌", { exact: true })).toHaveCount(0);
    await expect(page.getByText("边框令牌", { exact: true })).toHaveCount(0);
    await page.getByRole("tab", { name: "内容" }).click();
    await page.getByRole("tab", { name: "高级" }).click();
    await expect(page.getByLabel("桌面预览宽度")).toHaveValue("1920");
    await page.getByLabel("桌面预览宽度").fill("1280");
    await page.getByLabel("版本说明").fill("建立首屏容器、网格与标题槽位");
    await expect(page.getByLabel(/画布尺寸 1280 × 800/)).toContainText("1280 × 800");
    await page.getByText("添加模板节点", { exact: true }).click();
    await page.getByRole("button", { name: "内容容器 结构节点" }).click();
    await page.getByRole("tab", { name: "高级" }).click();
    await page.getByRole("textbox", { name: "节点名称" }).fill("首屏内容容器");
    await page.getByRole("button", { name: "网格 结构节点" }).click();
    await page.getByRole("button", { name: "标题槽位 内容槽位" }).click();
    await page.getByRole("tab", { name: "高级" }).click();
    await page.getByRole("textbox", { name: "节点名称" }).fill("首屏主标题");
    await page.getByRole("tab", { name: "布局" }).click();
    await page.getByLabel("文字层级").selectOption("display");
    await page.getByLabel("最大行数").fill("2");
    await page.getByRole("tab", { name: "内容" }).click();
    await page.getByRole("textbox", { name: "预览示例" }).fill("东方之形，自有光华");

    const dynamicCanvas = page.frameLocator(".template-editor__viewport-frame");
    const headingOnCanvas = dynamicCanvas.locator('.template-editor__dynamic-canvas-renderer [data-template-node-type="HeadingSlot"]');
    await expect(dynamicCanvas.locator(".hc-dynamic-template")).toHaveAttribute(
      "data-dynamic-template-editor-surface",
      "template-definition",
    );
    await expect(headingOnCanvas).toHaveAttribute("role", "group");
    await expect(headingOnCanvas).toContainText("东方之形，自有光华");
    const inlineHeading = headingOnCanvas.locator('[data-template-inline-editor="true"]');
    await expect(inlineHeading).toHaveAttribute("role", "textbox");
    await inlineHeading.fill("画布直接编辑模板标题");
    await inlineHeading.press("Control+Enter");
    await expect(page.getByRole("textbox", { name: "预览示例" })).toHaveValue("画布直接编辑模板标题");
    const headingNodeId = await headingOnCanvas.getAttribute("data-template-node-id");
    expect(headingNodeId).toMatch(/^node_/);

    const headingTreeItem = page.getByRole("treeitem", { name: /首屏主标题/ });
    const containerTreeItem = page.getByRole("treeitem", { name: /首屏内容容器/ });
    await headingTreeItem.dragTo(containerTreeItem, {
      sourcePosition: { x: 24, y: 12 },
      targetPosition: { x: 80, y: 18 },
    });
    await expect(headingTreeItem).toBeVisible();

    await expect(page.locator(".template-editor__canvas-edit-bar")).toHaveCount(0);
    await page.getByRole("button", { name: "预览模板" }).click();
    await expect(page.getByLabel("模板画布编辑状态")).toContainText("只读预览");
    await page.getByRole("combobox", { name: "预览内容场景" }).selectOption("long-text");
    await expect(headingOnCanvas).toContainText("这是用于验证超长标题");
    await expect(headingOnCanvas).toHaveCSS("outline-style", "none");
    await page.getByRole("button", { name: "退出模板预览" }).click();
    await expect(headingOnCanvas).toContainText("画布直接编辑模板标题");

    await page.locator(".template-editor__toolbar").getByRole("button", { name: /移动端模板布局/ }).click();
    await expect(page.locator(".template-editor__canvas-edit-bar")).toHaveCount(0);
    await expect(page.locator(".template-editor__toolbar").getByRole("button", { name: /移动端模板布局/ }))
      .toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();
    expect(dynamic.writes[0]).toMatchObject({ method: "POST", pathname: "/api/page-modules/dynamic-templates" });
    expect(dynamic.writes[0].body.versionNote).toBe("建立首屏容器、网格与标题槽位");
    expect(dynamic.writes[0].body.definition.metadata.previewDesktopWidth).toBe(1280);
    expect(dynamic.writes[0].body.definition.nodes[headingNodeId!]?.type).toBe("HeadingSlot");
    const storedNodes = dynamic.writes[0].body.definition.nodes as Record<string, { type: string; name: string; childIds: string[]; slotId?: string }>;
    const containerEntry = Object.entries(storedNodes).find(([, node]) => node.name === "首屏内容容器");
    const gridEntry = Object.entries(storedNodes).find(([, node]) => node.type === "Grid");
    expect(containerEntry?.[1].childIds).toContain(headingNodeId);
    const headingSlotId = storedNodes[headingNodeId!]?.slotId;
    expect(headingSlotId).toBeTruthy();
    expect(dynamic.writes[0].body.definition.previewContent[headingSlotId!]).toBe("画布直接编辑模板标题");
    expect(dynamic.writes[0].body.definition.defaultContent).not.toHaveProperty(headingSlotId!);
    expect(dynamic.writes[0].body.definition.slots[headingSlotId!].desktopRules).toMatchObject({
      fontRole: "display",
      maxLines: 2,
    });
    expect(gridEntry?.[1].childIds).not.toContain(headingNodeId);
    expect(forbiddenPageWrites).toEqual([]);

    await page.getByRole("button", { name: "发布模板新版本" }).click();
    const publishDialog = page.getByRole("dialog", { name: "确认发布模板 v1" });
    await expect(publishDialog).toContainText("只创建不可变的模板新版本");
    await expect(publishDialog).toContainText("已有页面实例会继续锁定当前模板版本");
    await publishDialog.getByRole("button", { name: "确认发布模板" }).click();
    await expect(page.getByText("模板 v1 已发布；现有页面仍保持原版本")).toBeVisible();
    const publishWrite = dynamic.writes.find((write) => /\/publish$/.test(write.pathname));
    expect(publishWrite).toMatchObject({
      method: "POST",
      pathname: expect.stringMatching(/\/publish$/),
      body: {
      expectedRevision: 1,
      versionNote: "建立首屏容器、网格与标题槽位",
      },
    });
    expect(dynamic.versionsByTemplateId.get(dynamic.records[0].templateId)).toHaveLength(1);

    await page.getByRole("treeitem", { name: /页面区段/ }).click();
    await page.getByRole("tab", { name: "高级" }).click();
    await page.getByLabel("版本说明").fill("发布后的下一版草稿");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    const postPublishSave = dynamic.writes.find((write) => write.method === "PATCH");
    expect(postPublishSave?.body.expectedRevision).toBe(2);
    expect(forbiddenPageWrites).toEqual([]);

    await page.getByRole("button", { name: "页面装修" }).click();
    await expect(pageLayer).toBeVisible();
    await openTemplateFromCatalog(page, "品牌首屏｜左文右图动态版");
    await expect(page.frameLocator(".template-editor__viewport-frame").locator(`.template-editor__dynamic-canvas-renderer [data-template-node-id="${headingNodeId}"]`)).toContainText("画布直接编辑模板标题");
    await expect(page.getByRole("treeitem", { name: /首屏主标题/ })).toBeVisible();
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("V2 母模板与页面实例复用同一媒体、焦点、数字、开关和恢复控件外壳", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem("haichuan.dynamic-template-drafts.v1");
    });
    const { forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeTemplateWorkspaceLayerDraft(),
    });
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建空白模板" }).click();

    const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    await page.getByRole("tab", { name: "高级" }).click();
    const desktopWidth = inspector.getByRole("spinbutton", { name: "桌面预览宽度" });
    await expect(desktopWidth.locator("xpath=../..")).toHaveAttribute("data-workspace-field-control", "number");
    await page.getByText("添加模板节点", { exact: true }).click();
    await page.getByRole("button", { name: "内容容器 结构节点" }).click();
    await page.getByRole("button", { name: "图片槽位 内容槽位" }).click();

    const mediaPicker = inspector.locator('[data-media-field="dynamic-slot-default-content"]');
    await expect(mediaPicker).toHaveAttribute("data-workspace-field-control", "media-picker");
    await mediaPicker.getByRole("button", { name: "或粘贴图片链接" }).click();
    await mediaPicker.getByPlaceholder("输入图片 URL；清空后确认 = 删除图片").fill(
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Crect width='400' height='300' fill='%23ddd'/%3E%3C/svg%3E",
    );
    await mediaPicker.getByRole("button", { name: /^确\s*认$/ }).click();
    await page.getByRole("tab", { name: "高级" }).click();
    await expect(inspector.locator('[data-workspace-field-control="switch"]').first())
      .toHaveAttribute("data-workspace-field-shared", "true");
    await page.getByRole("tab", { name: "布局" }).click();
    await expect(inspector.locator('[data-image-focus-field]'))
      .toHaveAttribute("data-workspace-field-control", "image-focus");
    await inspector.getByRole("group", { name: "画面焦点 · 桌面端常用位置" })
      .getByRole("button", { name: "左上", exact: true })
      .click();
    await expect(page.frameLocator(".template-editor__viewport-frame")
      .locator('[data-template-node-type="ImageSlot"] img'))
      .toHaveCSS("object-position", "0% 0%");
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("预览样例只有显式操作后才成为新页面实例默认内容", async ({ page }) => {
    const { dynamic, forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeTemplateWorkspaceLayerDraft(),
    });
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建空白模板" }).click();
    await page.getByText("添加模板节点", { exact: true }).click();
    await page.getByRole("button", { name: "内容容器 结构节点" }).click();
    await page.getByRole("button", { name: "文字槽位 内容槽位" }).click();
    await page.getByRole("textbox", { name: "预览示例" }).fill("仅用于目录与画布的样例");
    const canvas = page.frameLocator(".template-editor__viewport-frame");
    const objectToolbar = canvas.getByRole("toolbar", { name: /文字槽位快捷操作/ });
    await expect(objectToolbar).toBeVisible();
    await expect(objectToolbar.getByRole("button", { name: "复制节点" })).toBeVisible();
    await expect(objectToolbar.getByRole("button", { name: "隐藏节点" })).toBeVisible();
    await expect(objectToolbar.getByRole("button", { name: "删除节点" })).toBeVisible();
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    const firstDefinition = dynamic.writes.at(-1)?.body.definition;
    const textSlotId = Object.values(firstDefinition.nodes as Record<string, { type: string; slotId?: string }>)
      .find((node) => node.type === "TextSlot")?.slotId;
    expect(textSlotId).toBeTruthy();
    expect(firstDefinition.previewContent[textSlotId!]).toBe("仅用于目录与画布的样例");
    expect(firstDefinition.defaultContent).not.toHaveProperty(textSlotId!);

    await page.getByRole("button", { name: "设为新实例默认" }).click();
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    expect(dynamic.writes.at(-1)?.body.definition.defaultContent[textSlotId!]).toBe("仅用于目录与画布的样例");
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("统一模板结构树在真实工作区支持复制、显隐、排序、删除和独立撤销", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem("haichuan.dynamic-template-drafts.v1");
    });
    const { forbiddenPageWrites, dynamic } = await openWorkspaceShell(page, {
      draft: makeTemplateWorkspaceLayerDraft(),
    });
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建空白模板" }).click();
    await page.getByRole("textbox", { name: "模板名称" }).fill("结构操作验收模板");

    await page.getByText("添加模板节点", { exact: true }).click();
    await page.getByRole("button", { name: "内容容器 结构节点" }).click();
    await page.getByRole("tab", { name: "高级" }).click();
    await page.getByRole("textbox", { name: "节点名称" }).fill("运营内容容器");
    await page.getByRole("button", { name: "文字槽位 内容槽位" }).click();
    await page.getByRole("tab", { name: "高级" }).click();
    await page.getByRole("textbox", { name: "节点名称" }).fill("第一段正文");
    await page.getByRole("tab", { name: "内容" }).click();
    await page.getByRole("textbox", { name: "预览示例" }).fill("第一段内容");
    await page.getByRole("tab", { name: "高级" }).click();
    await page.getByRole("switch", { name: "允许调整位置" }).click();
    await page.getByRole("switch", { name: "允许调整尺寸" }).click();
    await page.getByRole("switch", { name: "允许调整层级" }).click();
    await page.getByRole("switch", { name: "允许调整间距" }).click();
    await page.getByRole("switch", { name: "允许调整文字样式" }).click();
    await page.getByRole("spinbutton", { name: /最大位置偏移/ }).fill("20");
    await page.getByRole("spinbutton", { name: "最小宽度" }).fill("40");
    await page.getByRole("spinbutton", { name: "最大宽度" }).fill("160");
    await page.getByRole("spinbutton", { name: "最小字号" }).fill("14");
    await page.getByRole("spinbutton", { name: "最大字号" }).fill("64");
    await page.getByRole("spinbutton", { name: "最大上下间距" }).fill("80");

    await page.getByRole("treeitem", { name: /运营内容容器/ }).click();
    await page.getByRole("button", { name: "标题槽位 内容槽位" }).click();
    await page.getByRole("tab", { name: "高级" }).click();
    await page.getByRole("textbox", { name: "节点名称" }).fill("第二段标题");

    await page.getByRole("treeitem", { name: /第一段正文/ }).click();
    const originalActions = page.getByRole("button", { name: "第一段正文节点操作" });
    await originalActions.click();
    await page.getByRole("menuitem", { name: "下移" }).click();
    await originalActions.click();
    await page.getByRole("menuitem", { name: "复制" }).click();

    const copiedTreeItem = page.getByRole("treeitem", { name: /第一段正文 副本/ });
    await expect(copiedTreeItem).toBeVisible();
    const copiedActions = page.getByRole("button", { name: "第一段正文 副本节点操作" });
    const canvasTextSlots = page.frameLocator(".template-editor__viewport-frame")
      .locator('.template-editor__dynamic-canvas-renderer [data-template-node-type="TextSlot"]');
    await expect(canvasTextSlots).toHaveCount(2);

    await copiedActions.click();
    await page.getByRole("menuitem", { name: "隐藏" }).click();
    await expect(page.getByRole("treeitem", { name: /第一段正文 副本.*已隐藏/ })).toBeVisible();
    await expect(canvasTextSlots).toHaveCount(1);
    await copiedActions.click();
    await page.getByRole("menuitem", { name: "显示" }).click();
    await expect(canvasTextSlots).toHaveCount(2);

    await copiedActions.click();
    await page.getByRole("menuitem", { name: "删除" }).click();
    const deleteDialog = page.getByRole("dialog", { name: /删除“第一段正文 副本”及其子节点/ });
    await deleteDialog.getByRole("button", { name: "删除节点" }).click();
    await expect(copiedTreeItem).toHaveCount(0);
    await pressWorkspaceHistory(page, "undo");
    await expect(copiedTreeItem).toBeVisible();
    await pressWorkspaceHistory(page, "redo");
    await expect(copiedTreeItem).toHaveCount(0);
    await pressWorkspaceHistory(page, "undo");
    await expect(copiedTreeItem).toBeVisible();

    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();

    const storedDefinition = dynamic.writes[0].body.definition as {
      nodes: Record<string, {
        name: string;
        childIds: string[];
        slotId?: string;
        instanceEditPolicy?: Record<string, unknown>;
      }>;
      previewContent: Record<string, unknown>;
    };
    const storedContainer = Object.values(storedDefinition.nodes)
      .find((node) => node.name === "运营内容容器");
    expect(storedContainer).toBeTruthy();
    const storedChildNames = storedContainer!.childIds.map((nodeId) => storedDefinition.nodes[nodeId].name);
    expect(storedChildNames).toEqual(["第二段标题", "第一段正文", "第一段正文 副本"]);
    expect(new Set(storedContainer!.childIds).size).toBe(storedContainer!.childIds.length);
    const copiedNode = Object.values(storedDefinition.nodes)
      .find((node) => node.name === "第一段正文 副本");
    const originalNode = Object.values(storedDefinition.nodes)
      .find((node) => node.name === "第一段正文");
    expect(copiedNode?.slotId).toBeTruthy();
    expect(copiedNode?.slotId).not.toBe(originalNode?.slotId);
    expect(originalNode?.instanceEditPolicy).toMatchObject({
      position: true,
      size: true,
      zIndex: true,
      typography: true,
      spacing: true,
      maxOffsetPercent: 20,
      minWidthPercent: 40,
      maxWidthPercent: 160,
      minFontSizePx: 14,
      maxFontSizePx: 64,
      maxSpacingPx: 80,
    });
    expect(copiedNode?.instanceEditPolicy).toEqual(originalNode?.instanceEditPolicy);
    expect(storedDefinition.previewContent[copiedNode!.slotId!]).toBe("第一段内容");
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("独立模板发布失败保留草稿，再次显式发布只产生一个版本", async ({ page }) => {
    const { forbiddenPageWrites, dynamic } = await openWorkspaceShell(page, {
      draft: makeTemplateWorkspaceLayerDraft(),
      publishFailures: 1,
    });
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建空白模板" }).click();
    await page.getByRole("textbox", { name: "模板名称" }).fill("幂等发布重试模板");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();

    await page.getByRole("button", { name: "发布模板新版本" }).click();
    const confirmation = page.getByRole("dialog", { name: "确认发布模板 v1" });
    const confirmButton = confirmation.getByRole("button", { name: "确认发布模板" });
    await confirmButton.click();
    await expect(page.locator(".ant-message-error")).toBeVisible();
    expect(dynamic.versionsByTemplateId.get(dynamic.records[0].templateId)).toHaveLength(0);

    await page.getByRole("button", { name: "发布模板新版本" }).click();
    await page.getByRole("dialog", { name: "确认发布模板 v1" })
      .getByRole("button", { name: "确认发布模板" })
      .click();
    await expect(page.getByText("模板 v1 已发布；现有页面仍保持原版本")).toBeVisible();
    expect(dynamic.versionsByTemplateId.get(dynamic.records[0].templateId)).toHaveLength(1);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("复杂节点复用页面装修字段控件，但只写模板草稿会话", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem("haichuan.dynamic-template-drafts.v1");
    });
    const { forbiddenPageWrites, dynamic } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeTemplateWorkspaceLayerDraft(),
    });
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建空白模板" }).click();
    await page.getByText("添加模板节点", { exact: true }).click();
    await page.getByRole("button", { name: "内容容器 结构节点" }).click();
    await page.getByRole("button", { name: "轮播组件 内容槽位" }).click();

    const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    const complexFields = inspector.locator('[data-complex-content-type="carousel"]');
    await expect(complexFields).toHaveAttribute("data-complex-content-scope", "template");
    await expect(complexFields).toContainText("图片素材");
    await expect(complexFields).toContainText("模板专属功能");
    await expect(complexFields).toContainText("布局与样式锁定在母模板节点，页面实例不能覆盖");
    await complexFields.getByRole("group", { name: "切换间隔" })
      .getByRole("button", { name: "6 秒" })
      .click();

    await page.getByRole("button", { name: "内容容器 结构节点" }).click();
    await page.getByRole("button", { name: "商品集合组件 内容槽位" }).click();
    const businessFields = inspector.locator('[data-complex-content-type="productCollection"]');
    await expect(businessFields).toHaveAttribute("data-complex-content-scope", "template");
    await expect(businessFields.getByText("选择商品", { exact: true })).toHaveCount(0);
    await expect(businessFields).toContainText("布局与样式锁定在母模板节点，页面实例不能覆盖");
    await businessFields.getByRole("group", { name: "电脑端列数" })
      .getByRole("button", { name: "2 列" })
      .click();

    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();
    expect(dynamic.writes).toHaveLength(1);
    const storedDefinition = dynamic.writes[0].body.definition as {
      nodes: Record<string, {
        type: string;
        slotId?: string;
        props: { contentTemplateDesignProps?: Record<string, string | number | boolean> };
      }>;
      defaultContent: Record<string, Record<string, unknown>>;
      previewContent: Record<string, Record<string, unknown>>;
    };
    const carouselNode = Object.values(storedDefinition.nodes).find((node) => node.type === "Carousel");
    const productCollectionNode = Object.values(storedDefinition.nodes).find((node) => node.type === "ProductCollection");
    expect(carouselNode?.slotId).toBeTruthy();
    expect(productCollectionNode?.slotId).toBeTruthy();
    expect(storedDefinition.previewContent[carouselNode!.slotId!]).toMatchObject({ interval: "6000" });
    expect(storedDefinition.previewContent).not.toHaveProperty(productCollectionNode!.slotId!);
    expect(productCollectionNode?.props.contentTemplateDesignProps).toMatchObject({ layout: "grid-2" });
    expect(storedDefinition.defaultContent).not.toHaveProperty(carouselNode!.slotId!);
    expect(storedDefinition.defaultContent).not.toHaveProperty(productCollectionNode!.slotId!);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("同一母模板可选择覆盖或另存，另存创建新身份且不改写来源模板", async ({ page }) => {
    const { forbiddenPageWrites, dynamic } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeTemplateWorkspaceLayerDraft(),
    });
    await openTemplateFromCatalog(page, "首屏");
    await expect(page.getByRole("complementary", { name: "模板结构" })).toBeVisible();
    await expect(page.getByText(/转换为新版|固定模板|动态模板/)).toHaveCount(0);
    await page.getByRole("button", { name: "更多模板操作" }).click();
    await page.getByRole("menuitem", { name: "另存为模板" }).click();
    const saveDialog = page.getByRole("dialog", { name: "另存为模板" });
    await saveDialog.getByRole("textbox", { name: "新模板名称" }).fill("首屏特别版");
    await saveDialog.getByRole("button", { name: "另存为模板" }).click();
    await expect(page.getByText("“首屏特别版”副本已保存为新的账号模板")).toBeVisible();
    expect(dynamic.writes).toHaveLength(1);
    expect(dynamic.writes[0]).toMatchObject({ method: "POST", pathname: "/api/page-modules/dynamic-templates" });
    expect(dynamic.writes[0].body.sourceReference).toMatch(/^tpl_/);
    expect(dynamic.writes[0].body.definition.templateId).toMatch(/^tpl_/);
    expect(dynamic.writes[0].body.definition.name).toBe("首屏特别版");
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("双图文页面点击只保持模板级完整属性面板", async ({ page }) => {
    const forbiddenWrites: string[] = [];
    const entry = CONTENT_TEMPLATE_EDITOR_ACCEPTANCE_MATRIX.find((item) =>
      item.templateKey === "doublePoster",
    );
    if (!entry) throw new Error("缺少 doublePoster 属性面板验收矩阵");
    const draft = makeDoublePosterDraft();
    draft.puckData.content[0].props.targetType = "page";
    draft.puckData.content[0].props.linkUrl = "/products";
    await page.setViewportSize({ width: 1600, height: 1000 });
    await authenticateAdmin(page);
    await mockEditorApis(page, draft, forbiddenWrites);
    await page.goto("/admin/editor/products");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();

    const inspector = page.getByRole("region", { name: "属性面板" });
    await expectContinuousContentInspector({ inspector, entry, viewport: "desktop" });
    const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    const root = canvas.locator('[data-content-template-contract="doublePoster"]').first();
    const mainImageField = inspector.locator('[data-inspector-field="mainImage"]');
    const detailImageField = inspector.locator('[data-inspector-field="detailImage"]');
    await page.evaluate(() => {
      const probeWindow = window as Window & { __inspectorFileInputClicks?: number };
      probeWindow.__inspectorFileInputClicks = 0;
      document.addEventListener("click", (event) => {
        if (event.target instanceof HTMLInputElement && event.target.type === "file") {
          probeWindow.__inspectorFileInputClicks = (probeWindow.__inspectorFileInputClicks ?? 0) + 1;
        }
      }, true);
    });

    await root.locator('[data-content-role="mainImage"]:visible').first().click();
    await expect(inspector.locator(".is-visual-selected")).toHaveCount(0);
    await expect(mainImageField.locator("[data-media-field]")).not.toBeFocused();
    await expect(mainImageField.getByText("拖入图片，或点击选择文件")).toHaveCount(0);
    await expect(mainImageField.locator(".homepage-editor__instance-overrides.is-content-media"))
      .toHaveCount(1);
    await expect(inspector.locator(".homepage-editor__instance-overrides.is-content-media"))
      .toHaveCount(2);

    await root.locator('[data-content-role="detailImage"]:visible').first().click();
    await expect(inspector.locator(".is-visual-selected")).toHaveCount(0);
    await expect(detailImageField.locator("[data-media-field]")).not.toBeFocused();
    await expect(detailImageField.getByText("拖入图片，或点击选择文件")).toHaveCount(0);
    await expect(detailImageField.locator(".homepage-editor__instance-overrides.is-content-media"))
      .toHaveCount(1);
    await expect(mainImageField.locator(".homepage-editor__instance-overrides.is-content-media"))
      .toHaveCount(1);
    await expect(mainImageField).toHaveCount(1);
    await page.evaluate(() => new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
    }));
    expect(await page.evaluate(() => (
      window as Window & { __inspectorFileInputClicks?: number }
    ).__inspectorFileInputClicks ?? 0)).toBe(0);

    const titleField = inspector.locator('[data-inspector-field="title"]');
    await root.locator('[data-content-role="copy"] h2').click();
    await expect(inspector.locator(".is-visual-selected")).toHaveCount(0);
    await titleField.locator("input").fill("连续展开后的双图标题");
    await expect(root.locator('[data-content-role="copy"] h2')).toHaveText("连续展开后的双图标题");

    const actionTextField = inspector.locator('[data-inspector-field="actionText"]');
    await actionTextField.locator("input").fill("查看系列");
    const action = root.locator('[data-content-role="action"]:visible').first();
    await expect(action).toBeVisible();
    await action.click();
    await expect(inspector.locator(".is-visual-selected")).toHaveCount(0);
    await expectContinuousContentInspector({ inspector, entry, viewport: "desktop" });
    expect(forbiddenWrites).toEqual([]);
  });

  test("成熟母模板把合同 editableObjects 展开为可选择的虚拟图层", async ({ page }) => {
    const { forbiddenPageWrites } = await openWorkspaceShell(page, { role: "SUPER_ADMIN" });
    const contract = getContentTemplateContract("首屏主视觉")!;
    await openTemplateFromCatalog(page, contract.displayName);
    const roleGroup = page.getByRole("group", { name: /内部图层/ });
    const roleItems = roleGroup.getByRole("treeitem");
    await expect(roleItems).toHaveCount(contract.editorCapabilities.editableObjects.length);
    await roleItems.first().click();
    await expect(page.getByText("组件内部对象", { exact: true })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "模板属性", exact: true })
      .getByText(contract.editorCapabilities.editableObjects[0].roleId, { exact: true }).last()).toBeVisible();
    expect(forbiddenPageWrites).toEqual([]);
  });

  for (const entry of CONTENT_TEMPLATE_EDITOR_ACCEPTANCE_MATRIX) {
    const contract = getContentTemplateContract(entry.moduleType)!;
    test(`24 活跃母模板统一闭环：${contract.displayName}编辑、覆盖保存与双端预览`, async ({ page }, testInfo) => {
      testInfo.setTimeout(90_000);
      const { forbiddenPageWrites, dynamic } = await openWorkspaceShell(page, {
        role: "SUPER_ADMIN",
      });
      await openTemplateFromCatalog(page, contract.displayName);

      const frameElement = page.locator(".template-editor__viewport-frame");
      const frame = page.frameLocator(".template-editor__viewport-frame");
      for (const viewport of ["desktop", "mobile"] as const) {
        await page.getByRole("button", {
          name: viewport === "desktop" ? /桌面端模板布局/ : /移动端模板布局/,
        }).click();
        await page.getByRole("button", { name: "预览模板" }).click();
        await expect(page.getByRole("button", { name: "退出模板预览" })).toBeVisible();
        await expect(frame.locator("body")).toBeVisible();
        await expect.poll(() => frame.locator("html").evaluate((html) => ({
          clientWidth: html.clientWidth,
          scrollWidth: html.scrollWidth,
          scrollHeight: html.scrollHeight,
        }))).toMatchObject({
          clientWidth: RESPONSIVE_CANVAS[viewport].width,
          scrollWidth: RESPONSIVE_CANVAS[viewport].width,
        });
        await expect.poll(() => frame.locator("html").evaluate((html) => html.scrollHeight))
          .toBeGreaterThan(20);
        const previewMediaUrls = await frame.locator("body").evaluate((body) => {
          const urls: string[] = [];
          for (const node of body.querySelectorAll<HTMLElement>("*")) {
            if (node instanceof HTMLImageElement && node.currentSrc) urls.push(node.currentSrc);
            const background = getComputedStyle(node).backgroundImage;
            for (const match of background.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
              if (match[1]) urls.push(match[1]);
            }
          }
          return urls;
        });
        expect(
          previewMediaUrls.every((url) => !/\.(?:avif|jpe?g|png|webp)(?:[?#]|$)/i.test(url)),
          `${contract.displayName} ${viewport} 模板预览不得加载真实摄影栅格图`,
        ).toBe(true);
        await frameElement.screenshot({
          path: testInfo.outputPath(`${entry.templateKey}-${viewport}.png`),
          animations: "disabled",
        });
        await page.getByRole("button", { name: "退出模板预览" }).click();
      }

      const qaName = `${contract.displayName}｜24模板QA`;
      await page.getByRole("textbox", { name: "模板名称", exact: true }).fill(qaName);
      await expect(page.getByRole("textbox", { name: "模板名称", exact: true })).toHaveValue(qaName);
      await page.getByRole("button", { name: "保存模板", exact: true }).click();
      await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();

      expect(dynamic.writes).toHaveLength(1);
      expect(dynamic.writes[0]).toMatchObject({
        method: "POST",
        pathname: "/api/page-modules/dynamic-templates",
      });
      expect(dynamic.writes[0].body).toMatchObject({
        sourceReference: `legacy_system_${entry.templateKey}`,
      });
      expect(dynamic.writes[0].body.definition).toMatchObject({ name: qaName });
      expect(dynamic.writes[0].body.definition.templateId).toMatch(/^tpl_/);
      expect(forbiddenPageWrites).toEqual([]);
    });
  }

  for (const matrixPageGroup of ALL_TEMPLATE_EDITOR_PAGE_GROUPS) {
    test(`页面内容模式保存闭环：${matrixPageGroup.pageKey} 页逐一编辑适用模板并双端预览`, async ({ page }, testInfo) => {
      testInfo.setTimeout(180_000);
      const forbiddenWrites: string[] = [];
      let saved = makeAllTemplateEditorDraft(matrixPageGroup.entries, matrixPageGroup.pageKey);
      await page.setViewportSize({ width: 1600, height: 1000 });
      await authenticateAdmin(page);
      await mockEditorApis(page, saved, forbiddenWrites);
      await page.route(/\/api\/page-modules\/document\/admin(?:\?.*)?$/, (route) =>
        route.fulfill(json(saved)),
      );
      await page.route(/\/api\/page-modules\/document(?:\?.*)?$/, async (route) => {
        if (route.request().method() !== "PUT") return route.fallback();
        const body = route.request().postDataJSON() as Record<string, any>;
        saved = {
          ...saved,
          puckData: structuredClone(body.puckData),
          metadata: structuredClone(body.metadata),
          updatedAt: "2026-08-30T06:00:00.000Z",
        };
        return route.fulfill(json(saved));
      });

      await page.goto(`/admin/editor/${matrixPageGroup.pageKey}`);
      await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
      const inspector = page.getByRole("region", { name: "属性面板" });
      const edited: Array<{
        entry: typeof matrixPageGroup.entries[number];
        roleId: string;
        fieldKey: string;
        kind: "text" | "switch" | "visibility";
        value: string | boolean;
      }> = [];

      for (const [index, entry] of matrixPageGroup.entries.entries()) {
        const sourceBlock = saved.puckData.content.find((candidate: Record<string, any>) =>
          candidate.props?.id === `all-template-editor-${entry.templateKey}`,
        );
        expect(sourceBlock, `${entry.templateKey} 缺少页面实例夹具`).toBeTruthy();
        await page
          .locator(`.homepage-editor__layer-item[data-layer-id="all-template-editor-${entry.templateKey}"]`)
          .locator(".homepage-editor__layer-select")
          .click();
        await expect(inspector).toHaveAttribute("data-module-type", entry.moduleType);
        await expectContinuousContentInspector({
          inspector,
          entry,
          viewport: "desktop",
        });

        let selected: {
          roleId: string;
          fieldKey: string;
          kind: "text" | "switch" | "visibility";
          control: Locator;
        } | undefined;
        for (const object of entry.objects) {
          for (const fieldKey of object.contentFieldKeys) {
            if (typeof sourceBlock!.props?.[fieldKey] !== "string") continue;
            const control = inspector
              .locator(`[data-inspector-field="${fieldKey}"]`)
              .locator(
                'input[type="text"]:not([readonly]):not([disabled]):visible, '
                + 'input[type="url"]:not([readonly]):not([disabled]):visible, '
                + 'input:not([type]):not([readonly]):not([disabled]):visible, '
                + 'textarea:not([readonly]):not([disabled]):visible',
              )
              .first();
            if (await control.count()) {
              selected = { roleId: object.roleId, fieldKey, kind: "text", control };
              break;
            }
          }
          if (!selected) {
            for (const fieldKey of object.contentFieldKeys) {
              if (typeof sourceBlock!.props?.[fieldKey] !== "boolean") continue;
              const control = inspector.locator(
                `[data-inspector-field="${fieldKey}"] [role="switch"]:not([aria-disabled="true"]):visible`,
              ).first();
              if (await control.count()) {
                selected = { roleId: object.roleId, fieldKey, kind: "switch", control };
                break;
              }
            }
          }
          if (selected) break;
        }
        if (!selected) {
          const visibility = page
            .locator(`.homepage-editor__layer-item[data-layer-id="all-template-editor-${entry.templateKey}"]`)
            .getByRole("button", {
              name: `隐藏${getContentTemplateContract(entry.moduleType)!.displayName}`,
            });
          if (await visibility.count()) {
            selected = {
              roleId: "",
              fieldKey: "isVisible",
              kind: "visibility",
              control: visibility,
            };
          }
        }
        expect(selected, `${entry.templateKey} 没有可编辑内容字段或实例显隐入口`).toBeTruthy();
        const value = selected!.kind === "text"
          ? `验收${index + 1}`
          : selected!.kind === "switch"
            ? (await selected!.control.getAttribute("aria-checked")) !== "true"
            : false;
        if (selected!.kind === "text") {
          await selected!.control.fill(String(value));
          await expect(selected!.control).toHaveValue(String(value));
        } else if (selected!.kind === "switch") {
          await selected!.control.click();
          await expect(selected!.control).toHaveAttribute("aria-checked", String(value));
        } else {
          await selected!.control.click();
          await expect(page
            .locator(`.homepage-editor__layer-item[data-layer-id="all-template-editor-${entry.templateKey}"]`))
            .toHaveAttribute("data-layer-visible", "false");
        }
        edited.push({
          entry,
          roleId: selected!.roleId,
          fieldKey: selected!.fieldKey,
          kind: selected!.kind,
          value,
        });
      }

      await page.getByRole("button", { name: /移动端布局/ }).click();
      for (const entry of matrixPageGroup.entries) {
        const sourceBlock = saved.puckData.content.find((candidate: Record<string, any>) =>
          candidate.props?.id === `all-template-editor-${entry.templateKey}`,
        );
        expect(sourceBlock, `${entry.templateKey} 缺少移动端页面实例夹具`).toBeTruthy();
        await page
          .locator(`.homepage-editor__layer-item[data-layer-id="all-template-editor-${entry.templateKey}"]`)
          .locator(".homepage-editor__layer-select")
          .click();
        await expect(inspector).toHaveAttribute("data-module-type", entry.moduleType);
        await expectContinuousContentInspector({
          inspector,
          entry,
          viewport: "mobile",
        });
      }
      await page.getByRole("button", { name: /桌面端布局/ }).click();

      await page.getByRole("button", { name: "保存当前装修草稿" }).click();
      await expect(page.getByText("页面草稿已保存")).toBeVisible();
      expect(forbiddenWrites).toEqual([]);
      for (const item of edited) {
        const block = saved.puckData.content.find((candidate: Record<string, any>) =>
          candidate.props?.id === `all-template-editor-${item.entry.templateKey}`,
        );
        expect(block?.props?.[item.fieldKey], `${item.entry.templateKey}.${item.fieldKey} 未进入保存负载`)
          .toBe(item.value);
      }

      await page.reload();
      await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
      const restoredVisibilityItems: typeof edited = [];
      for (const item of edited) {
        const layer = page
          .locator(`.homepage-editor__layer-item[data-layer-id="all-template-editor-${item.entry.templateKey}"]`)
        await layer.locator(".homepage-editor__layer-select").click();
        if (item.kind === "visibility") {
          await expect(layer, `${item.entry.templateKey}.isVisible 刷新后未回显`)
            .toHaveAttribute("data-layer-visible", "false");
          const displayName = getContentTemplateContract(item.entry.moduleType)!.displayName;
          await layer.getByRole("button", { name: `显示${displayName}` }).click();
          await expect(layer).toHaveAttribute("data-layer-visible", "true");
          item.value = true;
          restoredVisibilityItems.push(item);
          continue;
        }
        const replayed = item.kind === "text"
          ? inspector
            .locator(`[data-inspector-field="${item.fieldKey}"]`)
            .locator(
              'input[type="text"]:visible, '
              + 'input[type="url"]:visible, '
              + 'input:not([type]):visible, '
              + 'textarea:visible',
            )
            .first()
          : inspector.locator(
            `[data-inspector-field="${item.fieldKey}"] [role="switch"]:visible`,
          ).first();
        if (item.kind === "text") {
          await expect(replayed, `${item.entry.templateKey}.${item.fieldKey} 刷新后未回显`)
            .toHaveValue(String(item.value));
        } else {
          await expect(replayed, `${item.entry.templateKey}.${item.fieldKey} 刷新后未回显`)
            .toHaveAttribute("aria-checked", String(item.value));
        }
      }

      if (restoredVisibilityItems.length > 0) {
        await page.getByRole("button", { name: "保存当前装修草稿" }).click();
        await expect(page.getByText("页面草稿已保存")).toBeVisible();
        for (const item of restoredVisibilityItems) {
          const block = saved.puckData.content.find((candidate: Record<string, any>) =>
            candidate.props?.id === `all-template-editor-${item.entry.templateKey}`,
          );
          expect(block?.props?.isVisible, `${item.entry.templateKey}.isVisible 恢复显示未保存`).toBe(true);
        }
        await page.reload();
        await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
      }

      for (const viewport of ["desktop", "mobile"] as const) {
        await page.getByRole("button", {
          name: viewport === "desktop" ? /桌面端布局/ : /移动端布局/,
        }).click();
        await page.getByRole("button", { name: "预览当前画布" }).click();
        const frameElement = page.locator(".homepage-editor__canvas-scale iframe");
        const frame = page.frameLocator(".homepage-editor__canvas-scale iframe");
        for (const item of edited) {
          await expect(frame.locator(
            `[data-content-template-contract="${item.entry.templateKey}"]`,
          )).toBeVisible();
        }
        await expect.poll(() => frame.locator("html").evaluate((html) =>
          html.scrollWidth <= html.clientWidth,
        )).toBe(true);
        await frameElement.screenshot({
          path: testInfo.outputPath(`${matrixPageGroup.pageKey}-${viewport}.png`),
          animations: "disabled",
        });
        await page.getByRole("button", { name: "退出当前画布预览" }).click();
      }
      expect(forbiddenWrites).toEqual([]);
    });
  }
});
