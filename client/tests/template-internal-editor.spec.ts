import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { installAdminSession } from "./fixtures/session-auth";
import {
  CONTENT_TEMPLATE_EDITOR_ACCEPTANCE_MATRIX,
  getContentTemplateContract,
  getContentTemplatePageRule,
} from "../src/page-builder/generated/contentTemplates.generated";
import { RESPONSIVE_CANVAS } from "../src/page-builder/config/blockContracts";
import { TEMPLATE_CONTRACT_ROLE_LABELS } from "../src/page-builder/runtime/contentTemplateRolePresentation";
import {
  addDynamicTemplateNode,
  compileDynamicTemplateRenderPlan,
  createBlankDynamicTemplateDefinition,
  DYNAMIC_TEMPLATE_METADATA_LIST_LIMITS,
  DYNAMIC_TEMPLATE_METADATA_TEXT_MAX_LENGTH,
  DYNAMIC_TEMPLATE_SLOT_RULE_MAX_LINES,
  duplicateDynamicTemplateNode,
  getDynamicTemplateStructureLockViolation,
  moveDynamicTemplateNode,
  removeDynamicTemplateNode,
  reorderDynamicTemplateNode,
  setDynamicTemplateNodeStructureLocked,
  updateDynamicTemplateNodeRules,
  validateDynamicTemplateDefinition,
} from "../src/page-builder/template-definition";
import { parseCommaSeparatedValues } from "../src/page-builder/template-editor/dynamicTemplateEditorUtils";
import { useTemplateEditorSession } from "../src/page-builder/template-editor/templateEditorSession";

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
  pageWrites?: Array<{
    method: string;
    pathname: string;
    body: Record<string, any>;
  }>,
) {
  let currentDraft = structuredClone(draft);
  let writeRevision = 0;
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
    if (isForbiddenEditorWrite(request.method(), url) && pageWrites) {
      const body = (request.postDataJSON() ?? {}) as Record<string, any>;
      pageWrites.push({ method: request.method(), pathname, body });
      writeRevision += 1;
      const updatedAt = `2026-09-01T00:${String(writeRevision).padStart(2, "0")}:00.000Z`;
      if (pathname.endsWith("/publish")) {
        currentDraft = {
          ...currentDraft,
          status: "PUBLISHED",
          version: Math.max(1, Number(currentDraft.version) + 1),
          publishedAt: updatedAt,
          publishedBy: 1,
          updatedAt,
        };
      } else {
        currentDraft = {
          ...currentDraft,
          puckData: structuredClone(body.puckData ?? currentDraft.puckData),
          metadata: structuredClone(body.metadata ?? currentDraft.metadata ?? {}),
          editorVersion: body.editorVersion ?? currentDraft.editorVersion,
          status: "DRAFT",
          updatedAt,
        };
      }
      return route.fulfill(json(currentDraft));
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
      return route.fulfill(json(currentDraft));
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

async function breakResponsiveImage(image: Locator, source: string) {
  await image.evaluate((node, nextSource) => {
    node.closest("picture")?.querySelectorAll("source").forEach((candidate) => {
      candidate.srcset = nextSource;
    });
    (node as HTMLImageElement).src = nextSource;
  }, source);
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

  test("24 个模板的画布可编辑对象都有运营名称，不回退到内部 ID", () => {
    const missingLabels = CONTENT_TEMPLATE_EDITOR_ACCEPTANCE_MATRIX.flatMap((entry) => {
      const contract = getContentTemplateContract(entry.moduleType);
      if (!contract) return [`${entry.templateKey}:missing-contract`];
      return contract.editorCapabilities.editableObjects.flatMap((object) =>
        (object.nodeIds ?? [object.roleId])
          .filter((nodeId) => !TEMPLATE_CONTRACT_ROLE_LABELS[nodeId] && !TEMPLATE_CONTRACT_ROLE_LABELS[object.roleId])
          .map((nodeId) => `${entry.templateKey}:${nodeId}`),
      );
    });

    expect(missingLabels).toEqual([]);
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
    await expect(media).toHaveAttribute("aria-label", "编辑画布对象：桌面主图");
    await expect(hud).toHaveAttribute("aria-label", "调整画布对象：桌面主图");
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
    await expect(root).toHaveAttribute("data-visual-editor-mode", "adjust-layout");
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
    const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    await inspector.getByRole("textbox", { name: "模板名称" }).fill("Mock 本机测试模板");
    const editScope = inspector.getByRole("region", { name: "当前修改范围" });
    await expect(editScope).toContainText("保存到：当前浏览器的本机模板草稿");
    await expect(editScope).toContainText("已有页面：保持原版本");

    const save = page.getByRole("button", { name: "保存本机测试草稿", exact: true });
    await expect(save).toBeEnabled();
    await expect(save).toHaveAttribute("title", /不写入服务端模板/);
    await expect(page.getByRole("button", { name: /发布模板新版本/ })).toBeDisabled();
    await save.click();
    const dialog = page.getByRole("dialog", { name: "保存本机测试草稿" });
    await expect(dialog).toContainText("只写入当前浏览器本机存储，不创建服务端模板");
    await dialog.getByRole("button", { name: "更新本机测试草稿" }).click();
    await expect(page.getByText("已保存为本机测试草稿；未写入服务端模板")).toBeVisible();
    await expect(save).toBeDisabled();
    await expect(save).toHaveAttribute("title", "当前模板没有未保存修改");
    const savedStatus = page.getByRole("status", { name: "模板状态：本机测试草稿已保存" });
    await expect(savedStatus).toContainText("本机草稿已保存");
    await expect(savedStatus).toContainText("发布不可用");
    const publish = page.getByRole("button", { name: /发布模板新版本/ });
    await expect(publish).toContainText("不可发布");
    const disabledActionStyles = await page.locator(".template-editor__toolbar").evaluate((toolbar) => {
      const saveButton = toolbar.querySelector<HTMLButtonElement>(".homepage-editor__toolbar-secondary-actions button");
      const publishButton = toolbar.querySelector<HTMLButtonElement>(".homepage-editor__toolbar-publish");
      const status = toolbar.querySelector<HTMLElement>(".homepage-editor__workspace-status");
      if (!saveButton || !publishButton || !status) throw new Error("模板工具栏缺少状态、保存或发布按钮");
      const publishStyle = getComputedStyle(publishButton);
      const statusStyle = getComputedStyle(status);
      return {
        publishBackground: publishStyle.backgroundColor,
        publishColor: publishStyle.color,
        statusBackground: statusStyle.backgroundColor,
        statusColor: statusStyle.color,
      };
    });
    expect(disabledActionStyles.publishBackground).toBe(disabledActionStyles.statusBackground);
    expect(disabledActionStyles.publishColor).toBe(disabledActionStyles.statusColor);
    expect(disabledActionStyles.publishBackground).not.toBe("rgb(95, 101, 104)");
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
    archiveFailures?: number;
    includeEditableCatalog?: boolean;
    unifiedCatalogUnavailable?: boolean;
    catalogResponseDelays?: number[];
    draftSaveResponseDelays?: number[];
    getSystemCompatibility?: () => Array<Record<string, any>>;
    getPersonalCompatibility?: () => PersonalTemplateFixture[];
  } = {},
) {
  const records: Array<Record<string, any>> = [];
  const versionsByTemplateId = new Map<string, Array<Record<string, any>>>();
  const writes: Array<{ method: string; pathname: string; body: Record<string, any> }> = [];
  const catalogRequestsStarted: number[] = [];
  const catalogResponseCompletions: number[] = [];
  const draftSaveRequestsStarted: number[] = [];
  const draftSaveResponseCompletions: number[] = [];
  let catalogRequestIndex = 0;
  let draftSaveRequestIndex = 0;
  let remainingPublishFailures = options.publishFailures ?? 0;
  let remainingArchiveFailures = options.archiveFailures ?? 0;
  let nextId = 800;
  const now = () => "2026-08-28T10:00:00.000Z";
  const syncDeleteCapability = (record: Record<string, any>) => {
    const deleteBlockers: Array<{ code: string; message: string }> = [];
    if (record.status !== "ARCHIVED") {
      deleteBlockers.push({ code: "NOT_IN_TRASH", message: "请先将模板移入回收站，再永久删除。" });
    }
    if (record.sourceType !== "CUSTOM") {
      deleteBlockers.push({
        code: "SYSTEM_TEMPLATE",
        message: "SYSTEM 模板属于共享治理资产，只能保留在回收站或恢复。",
      });
    }
    if (record.publishedVersion > 0) {
      deleteBlockers.push({
        code: "HAS_PUBLISHED_VERSION",
        message: "模板已生成正式版本，必须保留历史页面；只能留在回收站或恢复。",
      });
    }
    record.canDelete = deleteBlockers.length === 0;
    record.deleteBlockers = deleteBlockers;
  };
  const createResource = (
    definition: Record<string, any>,
    versionNote = "",
    sourceReference: string | null = null,
  ) => {
    const sourceType = sourceReference && LEGACY_SYSTEM_SOURCE_REFERENCES.has(sourceReference) ? "SYSTEM" : "CUSTOM";
    const resource = {
    id: nextId++,
    templateId: String(definition.templateId),
    ownerId: sourceReference && LEGACY_SYSTEM_SOURCE_REFERENCES.has(sourceReference) ? null : 1,
    sourceType,
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
    };
    syncDeleteCapability(resource);
    return resource;
  };
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
      const requestIndex = catalogRequestIndex;
      catalogRequestIndex += 1;
      catalogRequestsStarted.push(requestIndex);
      const payload = {
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
      };
      const delay = options.catalogResponseDelays?.[requestIndex] ?? 0;
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      catalogResponseCompletions.push(requestIndex);
      return route.fulfill(json(payload));
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
    if (method === "POST" && parts[1] === "archive") {
      if (remainingArchiveFailures > 0) {
        remainingArchiveFailures -= 1;
        return route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
      }
      writes.push({ method, pathname, body: {} });
      record.status = "ARCHIVED";
      record.archivedAt = now();
      syncDeleteCapability(record);
      return route.fulfill(json(structuredClone(record)));
    }
    if (method === "POST" && parts[1] === "restore") {
      writes.push({ method, pathname, body: {} });
      record.status = "ACTIVE";
      record.archivedAt = null;
      syncDeleteCapability(record);
      return route.fulfill(json(structuredClone(record)));
    }
    if (method === "PATCH" && parts[1] === "draft") {
      if (options.failWrites) {
        return route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
      }
      const body = request.postDataJSON() as Record<string, any>;
      const requestIndex = draftSaveRequestIndex;
      draftSaveRequestIndex += 1;
      draftSaveRequestsStarted.push(requestIndex);
      if (body.expectedRevision !== record.draft.revision) {
        return route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ message: "revision conflict" }),
        });
      }
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
      const responsePayload = structuredClone(record);
      const delay = options.draftSaveResponseDelays?.[requestIndex] ?? 0;
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      draftSaveResponseCompletions.push(requestIndex);
      return route.fulfill(json(responsePayload));
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
      syncDeleteCapability(record);
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
      definition.defaultContent = {};
      definition.previewContent = {};
      Object.values(definition.slots as Record<string, Record<string, unknown>>).forEach((slot) => {
        if (slot.emptyPolicy === "use-default") slot.emptyPolicy = "hide";
      });
      const copied = createResource(definition, String(body.versionNote ?? ""), templateId);
      records.unshift(copied);
      versionsByTemplateId.set(copied.templateId, []);
      return route.fulfill(json(structuredClone(copied)));
    }
    if (method === "DELETE" && parts.length === 1) {
      writes.push({ method, pathname, body: {} });
      if (record.status !== "ARCHIVED" || !record.canDelete) {
        return route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ code: "DYNAMIC_TEMPLATE_DELETE_BLOCKED", message: record.deleteBlockers[0]?.message }),
        });
      }
      records.splice(records.indexOf(record), 1);
      versionsByTemplateId.delete(templateId);
      return route.fulfill(json({ templateId, deleted: true }));
    }
    return route.fulfill(json({}));
  });
  return {
    records,
    versionsByTemplateId,
    writes,
    catalogRequestsStarted,
    catalogResponseCompletions,
    draftSaveRequestsStarted,
    draftSaveResponseCompletions,
  };
}

async function openWorkspaceShell(
  page: Page,
  options: {
    role?: "SUPER_ADMIN" | "ADMIN" | "EDITOR";
    draft?: Record<string, any>;
    personalTemplates?: PersonalTemplateFixture[];
    failTemplateWrites?: boolean;
    publishFailures?: number;
    archiveFailures?: number;
    unifiedCatalogUnavailable?: boolean;
    catalogResponseDelays?: number[];
    draftSaveResponseDelays?: number[];
    viewport?: { width: number; height: number };
    allowPageWrites?: boolean;
  } = {},
) {
  const forbiddenPageWrites: string[] = [];
  const pageWrites: Array<{
    method: string;
    pathname: string;
    body: Record<string, any>;
  }> = [];
  await page.setViewportSize(options.viewport ?? { width: 1600, height: 1000 });
  await installAdminSession(page, {
    username: `template-workspace-${options.role ?? "admin"}`,
    realName: "模板工作空间验收",
    role: options.role ?? "SUPER_ADMIN",
  });
  await mockEditorApis(
    page,
    options.draft ?? makeHeroDraft(),
    forbiddenPageWrites,
    options.allowPageWrites ? pageWrites : undefined,
  );
  const personal = await mockPersonalTemplates(
    page,
    options.personalTemplates,
    { failWrites: options.failTemplateWrites },
  );
  const system = await mockSystemTemplates(page);
  const dynamic = await mockDynamicTemplates(page, {
    failWrites: options.failTemplateWrites,
    publishFailures: options.publishFailures,
    archiveFailures: options.archiveFailures,
    unifiedCatalogUnavailable: options.unifiedCatalogUnavailable,
    catalogResponseDelays: options.catalogResponseDelays,
    draftSaveResponseDelays: options.draftSaveResponseDelays,
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
  await expect(page.locator(".homepage-editor__toolbar")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("complementary", { name: "模板组件库" }))
    .toBeVisible({ timeout: 15_000 });
  return { forbiddenPageWrites, pageWrites, ...personal, dynamic, system };
}

async function openTemplateFromCatalog(page: Page, name: string) {
  await page.getByRole("button", { name: "模板设计" }).click();
  await expect(page.getByRole("complementary", { name: "模板组件库" }))
    .toContainText("模板目录");
  const cardControl = page.getByRole("button", { name: new RegExp(`(?:打开|正在编辑)${name}模板`) });
  // 目录卡包含真实 Renderer iframe。直接激活卡片控制面，避免鼠标命中由
  // iframe 异步重排产生的瞬时覆盖层；这里仍走产品 onClick，不绕过状态逻辑。
  await cardControl.evaluate((element) => (element as HTMLElement).click());
  await expect.poll(async () => {
    if (await cardControl.getAttribute("aria-pressed") === "true") return "opened";
    const notice = await page.locator(".ant-message-notice-content").last().textContent().catch(() => null);
    return notice ? `notice:${notice}` : "pending";
  }, { timeout: 15_000 }).toBe("opened");
  await expect(page.locator(".template-editor__toolbar")).toBeVisible();
  await expect(page.locator(".template-editor__viewport-frame")).toBeVisible();
}

async function openTemplateMoreMenu(page: Page) {
  await page.locator(".template-editor__toolbar")
    .getByRole("button", { name: "更多模板操作" })
    .click();
}

async function openTemplateSizeControls(page: Page) {
  const trigger = page.getByRole("button", { name: /^模板尺寸：/ });
  if (await trigger.getAttribute("aria-expanded") !== "true") await trigger.click();
  const controls = page.getByRole("group", { name: "模板整体尺寸" });
  await expect(controls).toBeVisible();
  return { trigger, controls };
}

async function openTemplateViewTools(page: Page) {
  const trigger = page.getByRole("button", { name: /^视图辅助/ });
  if (await trigger.getAttribute("aria-expanded") !== "true") await trigger.click();
  const controls = page.getByRole("group", { name: "画布视图辅助" });
  await expect(controls).toBeVisible();
  return { trigger, controls };
}

async function openTemplateStructureAddPanel(page: Page) {
  const structure = page.getByRole("complementary", { name: "模板结构" });
  const trigger = structure.getByRole("button", { name: /^添加模板结构到/ });
  if (await trigger.getAttribute("aria-expanded") !== "true") await trigger.click();
  const panel = page.getByRole("dialog", { name: "添加模板结构" });
  await expect(panel).toBeVisible();
  return { structure, trigger, panel };
}

async function openTemplateInspectorPanel(page: Page, panel: "基本" | "布局" | "规则") {
  const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
  const panelId = { 基本: "definition", 布局: "layout", 规则: "rules" }[panel];
  await expect(inspector).toHaveAttribute("data-template-inspector-view", "stacked");
  await expect(inspector.locator(`[data-template-inspector-section="${panelId}"]`)).toBeVisible();
  return inspector;
}

async function openTemplateInspectorDisclosure(inspector: Locator, label: string) {
  const trigger = inspector.getByRole("button", { name: new RegExp(`^${label}`) });
  if (await trigger.getAttribute("aria-expanded") !== "true") await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  return trigger;
}

async function openTemplateBasicInfo(page: Page) {
  return openTemplateInspectorPanel(page, "基本");
}

async function fillTemplateName(page: Page, name: string) {
  const inspector = await openTemplateBasicInfo(page);
  await inspector.getByRole("textbox", { name: "模板名称", exact: true }).fill(name);
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

async function readDynamicTemplateRenderSignature(root: Locator) {
  await expect(root).toBeVisible();
  await expect(root.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 10_000 });
  await root.evaluate(async (element) => {
    const styleLinks = [...element.ownerDocument.querySelectorAll<HTMLLinkElement>(
      'link[rel="stylesheet"]',
    )];
    await Promise.all(styleLinks.map((link) => link.sheet
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          const finish = () => resolve();
          link.addEventListener("load", finish, { once: true });
          link.addEventListener("error", finish, { once: true });
          element.ownerDocument.defaultView?.setTimeout(finish, 5_000);
        })));
    await element.ownerDocument.fonts?.ready;
    const ownerWindow = element.ownerDocument.defaultView;
    if (!ownerWindow) return;
    await new Promise<void>((resolve) => {
      ownerWindow.requestAnimationFrame(() => ownerWindow.requestAnimationFrame(() => resolve()));
    });
  });
  return root.evaluate((element) => {
    const root = element as HTMLElement;
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
        gap: styles.gap,
        margin: styles.margin,
        padding: styles.padding,
        minHeight: styles.minHeight,
      };
    };
    const content = root.cloneNode(true) as HTMLElement;
    content.querySelectorAll("style, script, [data-hc-editor-overlay], [role='status']")
      .forEach((node) => node.remove());
    return {
      templateId: root.dataset.dynamicTemplateId,
      schemaVersion: root.dataset.dynamicTemplateSchemaVersion,
      device: root.dataset.dynamicTemplateDevice,
      root: {
        rect: readRelativeRect(root),
        styles: readVisualStyles(root),
        clientHeight: root.clientHeight,
        scrollHeight: root.scrollHeight,
        overflow: getComputedStyle(root).overflow,
      },
      nodes: [...root.querySelectorAll<HTMLElement>("[data-template-node-id]")].map((node) => ({
        nodeId: node.dataset.templateNodeId,
        type: node.dataset.templateNodeType,
        slotId: node.dataset.templateSlotId,
        parentNodeId: node.parentElement
          ?.closest<HTMLElement>("[data-template-node-id]")
          ?.dataset.templateNodeId,
        rect: readRelativeRect(node),
        styles: readVisualStyles(node),
      })),
      contentRoles: [...root.querySelectorAll<HTMLElement>("[data-content-role]")].map((node) => ({
        role: node.dataset.contentRole,
        parentRole: node.parentElement
          ?.closest<HTMLElement>("[data-content-role]")
          ?.dataset.contentRole,
        parentNodeId: node.closest<HTMLElement>("[data-template-node-id]")
          ?.dataset.templateNodeId,
        tagName: node.tagName,
        rect: readRelativeRect(node),
        styles: readVisualStyles(node),
      })),
      contractFrames: [...root.querySelectorAll<HTMLElement>("[data-content-template-renderer='real']")]
        .map((frame) => {
          const styles = getComputedStyle(frame);
          return {
            contract: frame.dataset.contentTemplateContract,
            rect: readRelativeRect(frame),
            styles: {
              boxSizing: styles.boxSizing,
              margin: styles.margin,
              minHeight: styles.minHeight,
              padding: styles.padding,
              width: styles.width,
            },
          };
        }),
      instanceCss: [...root.querySelectorAll<HTMLStyleElement>("style[data-hc-instance-overrides]")]
        .map((style) => (style.textContent ?? "").replace(
          /\[data-hc-instance="[^"]+"\]/g,
          '[data-hc-instance="scope"]',
        )),
      visibleNodeCount: [...root.querySelectorAll<HTMLElement>(
        "[data-template-node-id], [data-content-role]",
      )].filter((node) => node.getClientRects().length > 0).length,
      imageCount: root.querySelectorAll("img").length,
      actionCount: root.querySelectorAll("a,button").length,
      text: (content.textContent ?? "").replace(/\s+/g, " ").trim(),
    };
  });
}

type DynamicTemplateRenderSignature = Awaited<ReturnType<typeof readDynamicTemplateRenderSignature>>;

function expectDynamicTemplateRenderSignaturesEqual(
  actual: DynamicTemplateRenderSignature,
  expected: DynamicTemplateRenderSignature,
  label: string,
) {
  expect(actual.instanceCss, `${label} 合同实例样式来源不一致`)
    .toEqual(expected.instanceCss);
  const withoutGeometry = (signature: DynamicTemplateRenderSignature) => ({
    ...signature,
    root: {
      styles: signature.root.styles,
      overflow: signature.root.overflow,
    },
    nodes: signature.nodes.map(({ rect: _rect, ...node }) => node),
    contentRoles: signature.contentRoles.map(({ rect: _rect, ...role }) => role),
    contractFrames: signature.contractFrames.map(({ rect: _rect, ...frame }) => frame),
  });
  expect(withoutGeometry(actual), `${label} DOM、层级、顺序或视觉规则不一致`)
    .toEqual(withoutGeometry(expected));
  const expectRectsEqual = (
    actualRects: Array<{ x: number; y: number; width: number; height: number }>,
    expectedRects: Array<{ x: number; y: number; width: number; height: number }>,
    scope: string,
    heightTolerance: number,
  ) => {
    expect(actualRects, `${label} ${scope}几何节点数量不一致`).toHaveLength(expectedRects.length);
    for (let index = 0; index < expectedRects.length; index += 1) {
    for (const key of ["x", "y", "width", "height"] as const) {
      expect(
        Math.abs(actualRects[index]![key] - expectedRects[index]![key]),
          `${label} ${scope}第 ${index + 1} 个节点 ${key} 几何漂移：画布 ${JSON.stringify(actualRects[index])}，目录 ${JSON.stringify(expectedRects[index])}`,
        ).toBeLessThanOrEqual(key === "height" ? heightTolerance : 1);
      }
    }
  };
  // 目录以只读方式运行设计画布同一模式；编辑装饰为绝对层，不得改变几何。
  expectRectsEqual([actual.root.rect], [expected.root.rect], "根容器", 1);
  expectRectsEqual(
    actual.nodes.map((node) => node.rect),
    expected.nodes.map((node) => node.rect),
    "模板节点",
    1,
  );
  expectRectsEqual(
    actual.contentRoles.map((role) => role.rect),
    expected.contentRoles.map((role) => role.rect),
    "内容角色",
    1,
  );
  expect(
    Math.abs(actual.root.clientHeight - expected.root.clientHeight),
    `${label} 根容器可见高度漂移`,
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(actual.root.scrollHeight - expected.root.scrollHeight),
    `${label} 根容器自然高度漂移`,
  ).toBeLessThanOrEqual(1);
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
    await expect(pageCatalogCard.locator('[data-preview-status="ready"]')).toHaveCount(1);
    const pageCardAppearance = await pageCatalogCard.evaluate((card) => {
      const preview = card.querySelector<HTMLElement>(".homepage-editor__template-preview-wrap");
      if (!preview) throw new Error("模板卡缺少统一预览框");
      const cardRect = card.getBoundingClientRect();
      const previewRect = preview.getBoundingClientRect();
      const cardStyles = getComputedStyle(card);
      const previewStyles = getComputedStyle(preview);
      const artboard = card.querySelector<HTMLElement>("[data-preview-natural-height]");
      const frame = card.querySelector<HTMLIFrameElement>("iframe");
      const renderer = frame?.contentDocument?.querySelector<HTMLElement>("[data-dynamic-template-id]");
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
        naturalHeight: artboard?.dataset.previewNaturalHeight,
        rendererClientHeight: renderer?.clientHeight,
        rendererScrollHeight: renderer?.scrollHeight,
        slotBoxCount: card.querySelectorAll("[data-slot-kind]").length,
      };
    });
    await expect(templateEntry).not.toHaveAttribute("aria-disabled", "true");
    await expect(pageCatalogCard.locator(
      ".homepage-editor__template-slot-summary, .homepage-editor__template-description, .homepage-editor__template-add",
    )).toHaveCount(0);
    await expect(pageCatalogCard.locator(".homepage-editor__template-name")).toHaveText("首屏");
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
    expect(designCatalogLayout).toMatchObject({
      toolsOffset: pageCatalogLayout.toolsOffset,
      headingOffset: pageCatalogLayout.headingOffset,
      headingHeight: pageCatalogLayout.headingHeight,
      categoryOffset: pageCatalogLayout.categoryOffset,
    });
    expect(designCatalogLayout.toolsHeight).toBeGreaterThan(pageCatalogLayout.toolsHeight);
    expect(designCatalogLayout.scrollOffset).toBeGreaterThan(pageCatalogLayout.scrollOffset);
    await expect(page.getByRole("button", { name: "正在编辑首屏模板" })
      .locator("xpath=ancestor::*[@data-template-catalog-card='shared']")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "正在编辑首屏模板" })
      .locator("xpath=ancestor::*[@data-template-identity='source:legacy_system_hero']"))
      .toHaveCount(1);
    const designCatalogCard = page.getByRole("button", { name: "正在编辑首屏模板" })
      .locator("xpath=ancestor::*[@data-template-catalog-card='shared']");
    await expect(designCatalogCard.locator('[data-preview-status="ready"]')).toHaveCount(1);
    const designCardAppearance = await designCatalogCard.evaluate((card) => {
      const preview = card.querySelector<HTMLElement>(".homepage-editor__template-preview-wrap");
      if (!preview) throw new Error("模板卡缺少统一预览框");
      const cardRect = card.getBoundingClientRect();
      const previewRect = preview.getBoundingClientRect();
      const cardStyles = getComputedStyle(card);
      const previewStyles = getComputedStyle(preview);
      const artboard = card.querySelector<HTMLElement>("[data-preview-natural-height]");
      const frame = card.querySelector<HTMLIFrameElement>("iframe");
      const renderer = frame?.contentDocument?.querySelector<HTMLElement>("[data-dynamic-template-id]");
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
        naturalHeight: artboard?.dataset.previewNaturalHeight,
        rendererClientHeight: renderer?.clientHeight,
        rendererScrollHeight: renderer?.scrollHeight,
        slotBoxCount: card.querySelectorAll("[data-slot-kind]").length,
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

  test("页面装修可重复添加当前可用版本，模板设计仍只能从顶部进入", async ({ page }) => {
    const { dynamic, forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeEmptyDraft(),
    });

    await openTemplateFromCatalog(page, "首屏");
    const firstSave = page.getByRole("button", { name: "保存模板", exact: true });
    await expect(firstSave).toBeEnabled();
    await expect(firstSave).toHaveAttribute("title", /首次保存后建立可管理的模板草稿/);
    await firstSave.click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();
    await expect(firstSave).toBeDisabled();
    await expect(firstSave).toHaveAttribute("title", "当前模板没有未保存修改");

    const designControl = page.getByRole("button", { name: "正在编辑首屏模板" });
    const designCard = designControl.locator("xpath=ancestor::*[@data-template-catalog-card='shared']");
    await expect(designCard).toHaveAttribute("data-template-identity", "source:legacy_system_hero");
    await expect(designCard.locator(".homepage-editor__template-add")).toHaveCount(0);
    await expect(designCard.getByRole("button", { name: "更多模板操作：首屏" })).toBeVisible();
    await expect(designControl).toHaveAttribute("draggable", "false");
    await expect(designCard).not.toContainText("草稿 · 发布后可用于页面");
    await expect(designCard).not.toContainText("可编辑 · 首屏");
    await expect(page.frameLocator(".template-editor__viewport-frame").locator(".hc-hero__reveal").first())
      .toHaveCSS("animation-name", "none");
    await page.getByRole("button", { name: /移动端模板布局/ }).click();

    await page.getByRole("button", { name: "页面装修" }).click();
    const pageControl = page.getByRole("button", {
      name: "首屏：点击添加到页面末尾，也可拖到画布指定位置",
    });
    const pageCard = pageControl.locator("xpath=ancestor::*[@data-template-catalog-card='shared']");
    await expect(pageControl).not.toHaveAttribute("aria-disabled", "true");
    await expect(pageControl).toHaveAttribute("draggable", "true");
    await expect(pageCard.locator(".homepage-editor__template-badge")).toHaveCount(0);
    await expect(pageCard).not.toContainText("模板设计中有未发布修改，页面继续使用当前可用版本");
    await expect(pageCard).toHaveAttribute("data-template-identity", "source:legacy_system_hero");
    await expect(pageCard).not.toContainText("草稿 · 发布后可用于页面");
    await expect(pageCard).not.toContainText("可编辑 · 首屏");
    await pageCard.scrollIntoViewIfNeeded();
    await pageCard.hover();
    const pageCardFrame = pageCard.frameLocator("iframe[data-template-catalog-viewport]");
    await expect(pageCard.locator('iframe[data-template-catalog-viewport="desktop"]')).toHaveCount(1);
    await expect(pageCardFrame.locator('[data-content-template="hero"]')).toHaveCount(1);
    await expect(pageCardFrame.locator("[data-dynamic-template-id]")).toHaveCount(1);
    await expect(pageCardFrame.locator(".hc-hero__reveal").first()).toHaveCSS("animation-name", "none");
    const cardTop = await pageCard.evaluate((element) => element.getBoundingClientRect().top);
    await pageCard.hover();
    await page.waitForTimeout(200);
    expect(await pageCard.evaluate((element) => element.getBoundingClientRect().top)).toBeCloseTo(cardTop, 1);
    await page.getByRole("button", { name: /移动端布局/ }).click();
    await expect(pageCard.locator('iframe[data-template-catalog-viewport="mobile"]')).toHaveCount(1);
    await expect(pageCardFrame.locator('[data-content-template="hero"]')).toHaveCount(1);

    const pagePreview = pageCard.locator('[data-content-template-preview="hero"]');
    const previewBeforeInsert = await pagePreview.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, height: rect.height };
    });
    await pageControl.click();
    await pageControl.click();
    await page.waitForTimeout(250);
    const previewAfterInsert = await pagePreview.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, height: rect.height };
    });
    expect(previewAfterInsert.top).toBeCloseTo(previewBeforeInsert.top, 1);
    expect(previewAfterInsert.height).toBeCloseTo(previewBeforeInsert.height, 1);
    await expect(page.locator(".homepage-editor__layer-item")).toHaveCount(2);
    await expect(page.getByRole("group", { name: "店铺装修工作模式切换" }))
      .toHaveAttribute("data-active-mode", "page");
    await expect(page.locator(".template-editor__toolbar")).toHaveCount(0);

    await page.getByRole("button", { name: "模板设计", exact: true }).click();
    await expect(page.locator(".template-editor__toolbar")).toBeVisible();
    const persistedDesignControl = page.getByRole("button", { name: "正在编辑首屏模板" });
    await expect(persistedDesignControl).toBeVisible();
    await page.getByRole("button", { name: "发布模板新版本" }).click();
    await expect(page.getByRole("dialog", { name: /确认发布模板/ })).toHaveCount(0);
    await expect(page.getByText("模板 v1 已发布；现有页面仍保持原版本")).toBeVisible();
    expect(dynamic.writes.filter((write) => (
      write.method === "POST" && write.pathname === "/api/page-modules/dynamic-templates"
    ))).toHaveLength(1);
    expect(dynamic.versionsByTemplateId.get(dynamic.records[0].templateId)).toHaveLength(1);

    await page.getByRole("button", { name: "页面装修" }).click();
    const publishedControl = page.getByRole("button", { name: "添加首屏版本1" });
    await expect(publishedControl).toHaveAttribute("draggable", "true");
    await publishedControl.click();
    await publishedControl.click();
    await expect(page.locator(".homepage-editor__layer-item")).toHaveCount(4);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("新建模板从草稿到发布自动同步页面目录，并始终锁定已发布版本", async ({ page }) => {
    const { dynamic, forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeEmptyDraft(),
    });

    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建空白模板" }).click();
    await fillTemplateName(page, "自动同步规则");
    await page.getByRole("button", { name: "标题槽位 内容槽位" }).click();
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();

    const templateId = dynamic.records[0].templateId as string;
    expect(dynamic.versionsByTemplateId.get(templateId)).toHaveLength(0);

    await page.getByRole("button", { name: "页面装修" }).click();
    await expect(page.getByText("自动同步规则", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("group", { name: "店铺装修工作模式切换" }))
      .toHaveAttribute("data-active-mode", "page");
    await expect(page.locator(".template-editor__toolbar")).toHaveCount(0);

    await openTemplateFromCatalog(page, "自动同步规则");
    await page.getByRole("button", { name: "发布模板新版本" }).click();
    await expect(page.getByText("模板 v1 已发布；现有页面仍保持原版本")).toBeVisible();
    const publishedDesignCard = page.getByRole("button", { name: "正在编辑自动同步规则模板" })
      .locator("xpath=ancestor::*[@data-template-catalog-card='shared']");
    await expect(publishedDesignCard.locator(".homepage-editor__template-badge")).toHaveCount(0);
    await expect(publishedDesignCard).not.toContainText("草稿 · 已发布 v1");
    expect(dynamic.versionsByTemplateId.get(templateId)).toHaveLength(1);

    await page.getByRole("button", { name: "页面装修" }).click();
    const publishedControl = page.getByRole("button", { name: "添加自动同步规则版本1" });
    await expect(publishedControl).toHaveAttribute("draggable", "true");
    await publishedControl.click();
    await publishedControl.click();
    await expect(page.locator(".homepage-editor__layer-item")).toHaveCount(2);
    await expect(page.getByRole("group", { name: "店铺装修工作模式切换" }))
      .toHaveAttribute("data-active-mode", "page");
    await expect(page.locator(".template-editor__toolbar")).toHaveCount(0);

    await openTemplateFromCatalog(page, "自动同步规则");
    await page.getByRole("treeitem", { name: /自动同步规则 模板/ }).click();
    await openTemplateInspectorPanel(page, "规则");
    await page.getByLabel("版本说明").fill("下一版草稿，不能影响页面 v1");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();

    await page.getByRole("button", { name: "页面装修" }).click();
    const publishedWithDraft = page.getByRole("button", { name: "添加自动同步规则版本1" });
    const publishedCard = publishedWithDraft.locator("xpath=ancestor::*[@data-template-catalog-card='shared']");
    await expect(publishedCard.locator(".homepage-editor__template-badge")).toHaveCount(0);
    await expect(publishedCard).not.toContainText("有未发布修改");
    await publishedWithDraft.click();
    await expect(page.locator(".homepage-editor__layer-item")).toHaveCount(3);
    expect(dynamic.versionsByTemplateId.get(templateId)).toHaveLength(1);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("模板保存响应迟到时保留保存期间的新修改，并用最新 revision 继续保存", async ({ page }) => {
    const draftSaveResponseDelays = [4_000];
    const { dynamic, forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeEmptyDraft(),
      draftSaveResponseDelays,
    });

    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建空白模板" }).click();
    await fillTemplateName(page, "保存基线模板");
    await page.getByRole("button", { name: "标题槽位 内容槽位" }).click();
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();

    await page.getByRole("treeitem", { name: /保存基线模板 模板/ }).click();
    await fillTemplateName(page, "正在保存的版本");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect.poll(() => dynamic.draftSaveRequestsStarted).toEqual([0]);
    await page.getByRole("textbox", { name: "模板名称", exact: true }).fill("保存期间的新修改");
    expect(dynamic.draftSaveResponseCompletions).toEqual([]);

    await expect(page.getByText("模板草稿已保存；你还有新的未保存修改")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "模板名称", exact: true }))
      .toHaveValue("保存期间的新修改");
    await expect(page.getByLabel("模板状态：有未保存修改")).toBeVisible();
    expect(dynamic.draftSaveResponseCompletions).toEqual([0]);

    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();
    await expect(page.getByLabel("模板状态：模板草稿已保存")).toBeVisible();
    const draftWrites = dynamic.writes.filter((write) => write.method === "PATCH");
    expect(draftWrites.map((write) => write.body.expectedRevision)).toEqual([1, 2]);
    expect(draftWrites.map((write) => write.body.definition.name)).toEqual([
      "正在保存的版本",
      "保存期间的新修改",
    ]);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("模板目录并发刷新只接受最后一次结果，不被迟到的旧草稿响应覆盖", async ({ page }) => {
    const catalogResponseDelays: number[] = [];
    const { dynamic, forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeEmptyDraft(),
      catalogResponseDelays,
    });

    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建空白模板" }).click();
    await fillTemplateName(page, "目录乱序保护");
    await page.getByRole("button", { name: "标题槽位 内容槽位" }).click();
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();
    await page.getByRole("button", { name: "页面装修" }).click();
    await expect(page.getByText("目录乱序保护", { exact: true })).toHaveCount(0);

    await expect.poll(() => (
      dynamic.catalogResponseCompletions.length === dynamic.catalogRequestsStarted.length
    )).toBe(true);
    const requestsBeforeStale = dynamic.catalogRequestsStarted.length;
    const staleRequestIndex = requestsBeforeStale;
    catalogResponseDelays[staleRequestIndex] = 1_500;
    await page.evaluate(() => window.dispatchEvent(new Event("haichuan:dynamic-template-server-changed")));
    await expect.poll(() => dynamic.catalogRequestsStarted.length).toBeGreaterThan(requestsBeforeStale);

    const record = dynamic.records[0];
    const checksum = `published-${record.templateId}-v1`;
    record.publishedVersion = 1;
    record.visibility = "STAFF";
    record.draft.baseVersion = 1;
    record.draft.definitionChecksum = checksum;
    dynamic.versionsByTemplateId.set(record.templateId, [{
      id: 9_901,
      dynamicTemplateId: record.id,
      version: 1,
      schemaVersion: record.draft.definition.schemaVersion,
      definition: structuredClone(record.draft.definition),
      definitionChecksum: checksum,
      versionNote: null,
      publishedAt: "2026-08-28T10:00:00.000Z",
    }]);
    const requestsBeforeFresh = dynamic.catalogRequestsStarted.length;
    await page.evaluate(() => window.dispatchEvent(new Event("haichuan:dynamic-template-server-changed")));

    await expect.poll(() => dynamic.catalogRequestsStarted.length).toBeGreaterThan(requestsBeforeFresh);
    const freshRequestIndexes = dynamic.catalogRequestsStarted.slice(requestsBeforeFresh);
    await expect.poll(() => freshRequestIndexes.every((requestIndex) => (
      dynamic.catalogResponseCompletions.includes(requestIndex)
    ))).toBe(true);
    const publishedControl = page.getByRole("button", { name: "添加目录乱序保护版本1" });
    await expect(publishedControl).toBeVisible();
    await expect.poll(() => dynamic.catalogResponseCompletions.includes(staleRequestIndex)).toBe(true);
    await expect(publishedControl).toBeVisible();
    await expect(page.getByText("目录乱序保护", { exact: true })).toBeVisible();
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("24 个系统模板存在未发布设计草稿时仍统一支持页面重复添加", async ({ page }, testInfo) => {
    testInfo.setTimeout(90_000);
    const { dynamic, forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeEmptyDraft(),
    });

    await openTemplateFromCatalog(page, "首屏");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();

    const seed = dynamic.records[0];
    for (const [index, entry] of CONTENT_TEMPLATE_EDITOR_ACCEPTANCE_MATRIX.entries()) {
      if (entry.templateKey === "hero") continue;
      const contract = getContentTemplateContract(entry.moduleType)!;
      const record = structuredClone(seed);
      const templateId = `tpl_matrix_${entry.templateKey}`;
      record.id = 9_000 + index;
      record.templateId = templateId;
      record.name = contract.displayName;
      record.sourceReference = `legacy_system_${entry.templateKey}`;
      record.draft.id = 90_000 + index;
      record.draft.definition = {
        ...record.draft.definition,
        templateId,
        name: contract.displayName,
        sourceReference: record.sourceReference,
      };
      record.draft.definitionChecksum = `draft-${templateId}-r1`;
      dynamic.records.push(record);
    }

    await page.getByRole("button", { name: "页面装修" }).click();
    await page.evaluate(() => window.dispatchEvent(new Event("haichuan:dynamic-template-server-changed")));

    const pageLibrary = page.getByRole("complementary", { name: "模板组件库" });
    const cards = pageLibrary.locator('[data-template-catalog-card="shared"]');
    await expect(cards).toHaveCount(CONTENT_TEMPLATE_EDITOR_ACCEPTANCE_MATRIX.length);
    const controls = cards.locator(".homepage-editor__template-card-main");
    await expect(controls).toHaveCount(CONTENT_TEMPLATE_EDITOR_ACCEPTANCE_MATRIX.length);

    for (let index = 0; index < CONTENT_TEMPLATE_EDITOR_ACCEPTANCE_MATRIX.length; index += 1) {
      const control = controls.nth(index);
      await expect(control).not.toHaveAttribute("aria-disabled", "true");
      await expect(control).toHaveAttribute("draggable", "true");
      await control.click();
    }

    await expect(page.locator(".homepage-editor__layer-item"))
      .toHaveCount(CONTENT_TEMPLATE_EDITOR_ACCEPTANCE_MATRIX.length);
    await expect(page.getByRole("group", { name: "店铺装修工作模式切换" }))
      .toHaveAttribute("data-active-mode", "page");
    await expect(page.locator(".template-editor__toolbar")).toHaveCount(0);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("统一母模板移入回收站后从普通目录隐藏且只能在回收站恢复", async ({ page }) => {
    const { dynamic, forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeEmptyDraft(),
    });

    await openTemplateFromCatalog(page, "首屏");
    const templateLibrary = page.getByRole("complementary", { name: "模板组件库" });
    const initialMoreButton = templateLibrary.getByRole("button", { name: "更多模板操作：首屏" });
    const initialCard = page.getByRole("button", { name: "正在编辑首屏模板" })
      .locator("xpath=ancestor::*[@data-template-catalog-card='shared']");
    await expect(initialMoreButton).toHaveCSS("width", "32px");
    await expect(initialMoreButton).toHaveCSS("height", "32px");
    await expect(initialCard.locator(".homepage-editor__template-design-actions")).toHaveCount(0);
    await expect(initialCard).not.toContainText("首次保存后可移入回收站");
    await initialMoreButton.click();
    const initialArchiveGuidance = page.getByRole("menuitem", {
      name: "首次保存后可移入回收站",
    });
    await expect(initialArchiveGuidance).toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();
    await page.getByRole("button", { name: "发布模板新版本" }).click();
    await expect(page.getByText("模板 v1 已发布；现有页面仍保持原版本")).toBeVisible();

    await templateLibrary.getByRole("button", { name: "更多模板操作：首屏" }).click();
    await page.getByRole("menuitem", { name: "移入回收站" }).click();
    const archiveDialog = page.getByRole("dialog", { name: "将模板“首屏”移入回收站？" });
    await expect(archiveDialog).toContainText("模板将从组件库隐藏");
    await expect(archiveDialog).toContainText("已有页面和已发布版本保持不变");
    await archiveDialog.getByRole("button", { name: "移入回收站" }).click();
    await expect(page.getByText("模板“首屏”已移入回收站")).toBeVisible();

    const archived = dynamic.records[0];
    await expect(templateLibrary.getByRole("button", { name: /首屏模板/ })).toHaveCount(0);
    await templateLibrary.getByRole("button", { name: "打开模板回收站" }).click();
    await expect(templateLibrary.getByRole("heading", { name: "模板回收站" })).toBeVisible();
    const archivedControl = page.getByRole("button", { name: "回收站模板“首屏”，恢复后才能设计" });
    await expect(archivedControl).toHaveAttribute("aria-disabled", "true");
    await templateLibrary.getByRole("button", { name: "更多模板操作：首屏" }).click();
    await expect(page.getByRole("menuitem", { name: "恢复模板" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "永久删除不可用" }))
      .toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("Escape");
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

    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "打开模板回收站" }).click();
    await page.getByRole("button", { name: "更多模板操作：首屏" }).click();
    await page.getByRole("menuitem", { name: "恢复模板" }).click();
    const restoreDialog = page.getByRole("dialog", { name: "恢复模板“首屏”？" });
    await expect(restoreDialog).toContainText("已有页面实例不会被修改");
    await restoreDialog.getByRole("button", { name: "恢复模板" }).click();
    await expect(page.getByText("模板“首屏”已恢复")).toBeVisible();
    await expect(page.getByRole("button", { name: "回收站模板“首屏”，恢复后才能设计" }))
      .toHaveCount(0);
    await page.getByRole("button", { name: "返回模板库" }).click();
    await expect(page.getByRole("button", { name: "正在编辑首屏模板" })).toBeVisible();

    await page.getByRole("button", { name: "页面装修" }).click();
    await expect(page.getByRole("button", { name: "添加首屏版本1" })).toBeVisible();
    expect(dynamic.versionsByTemplateId.get(archived.templateId)).toHaveLength(1);
    expect(dynamic.writes.filter((write) => /\/(?:archive|restore)$/.test(write.pathname)))
      .toHaveLength(2);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("CUSTOM 草稿必须先移入回收站，才能在回收站永久删除", async ({ page }) => {
    const { dynamic, forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeEmptyDraft(),
    });
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建空白模板" }).click();
    await fillTemplateName(page, "待删除试验草稿");
    await page.getByRole("button", { name: "标题槽位 内容槽位" }).click();
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();
    expect(dynamic.records).toHaveLength(1);

    const templateLibrary = page.getByRole("complementary", { name: "模板组件库" });
    const templateMoreButton = templateLibrary.getByRole("button", {
      name: "更多模板操作：待删除试验草稿",
    });
    await expect(templateMoreButton).toBeVisible();
    await openTemplateInspectorPanel(page, "基本");
    await page.getByRole("textbox", { name: "节点名称" }).fill("尚未保存的标题槽位名称");
    await templateMoreButton.click();
    await page.getByRole("menuitem", { name: "移入回收站" }).click();
    await expect(page.getByText("请先保存草稿或放弃未保存修改，再将当前模板移入回收站。"))
      .toBeVisible();
    await expect(page.getByRole("dialog", { name: /移入回收站/ })).toHaveCount(0);
    expect(dynamic.writes.filter((write) => write.method === "DELETE")).toEqual([]);

    await openTemplateMoreMenu(page);
    await page.getByRole("menuitem", { name: "放弃未保存修改" }).click();
    const discardDialog = page.getByRole("dialog", {
      name: "放弃“待删除试验草稿”的未保存修改？",
    });
    await discardDialog.getByRole("button", { name: "放弃未保存修改" }).click();

    await templateMoreButton.click();
    await page.getByRole("menuitem", { name: "移入回收站" }).click();
    const trashDialog = page.getByRole("dialog", { name: "将模板“待删除试验草稿”移入回收站？" });
    await trashDialog.getByRole("button", { name: "移入回收站" }).click();
    await expect(page.getByText("模板“待删除试验草稿”已移入回收站")).toBeVisible();
    expect(dynamic.records[0].status).toBe("ARCHIVED");
    expect(dynamic.writes.filter((write) => write.method === "DELETE")).toEqual([]);
    await expect(templateLibrary.getByRole("button", { name: /待删除试验草稿模板/ })).toHaveCount(0);

    await templateLibrary.getByRole("button", { name: "打开模板回收站" }).click();
    await templateLibrary.getByRole("button", { name: "更多模板操作：待删除试验草稿" }).click();
    await page.getByRole("menuitem", { name: "永久删除模板" }).click();
    const deleteDialog = page.getByRole("dialog", { name: "永久删除模板“待删除试验草稿”？" });
    await expect(deleteDialog).toContainText("永久删除后无法恢复");
    await expect(deleteDialog).toContainText("没有版本历史且未被页面引用");
    await deleteDialog.getByRole("button", { name: "永久删除模板" }).click();

    await expect(page.getByText("模板“待删除试验草稿”已永久删除")).toBeVisible();
    expect(dynamic.records).toHaveLength(0);
    expect(dynamic.writes.at(-1)).toMatchObject({
      method: "DELETE",
      pathname: expect.stringMatching(/\/api\/page-modules\/dynamic-templates\/tpl_/),
    });
    await expect(page.getByRole("button", { name: "回收站模板“待删除试验草稿”，恢复后才能设计" }))
      .toHaveCount(0);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("移入回收站失败时保留当前设计会话与可用状态", async ({ page }) => {
    const { dynamic, forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeEmptyDraft(),
      archiveFailures: 1,
    });

    await openTemplateFromCatalog(page, "首屏");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();

    await page.getByRole("button", { name: "更多模板操作：首屏" }).click();
    await page.getByRole("menuitem", { name: "移入回收站" }).click();
    const archiveDialog = page.getByRole("dialog", { name: "将模板“首屏”移入回收站？" });
    await archiveDialog.getByRole("button", { name: "移入回收站" }).click();

    await expect(page.getByText("移入回收站失败，当前模板仍保留")).toBeVisible();
    await expect(archiveDialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: "保存模板", exact: true })).toBeVisible();
    expect(dynamic.records[0].status).toBe("ACTIVE");
    expect(dynamic.writes.filter((write) => write.pathname.endsWith("/archive"))).toEqual([]);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("首屏预览素材失效时目录与设计画布保持同一浅色空态", async ({ page }) => {
    const { forbiddenPageWrites } = await openWorkspaceShell(page, { role: "SUPER_ADMIN" });

    await page.getByRole("button", { name: "模板设计" }).click();
    const catalogCard = page.getByRole("button", { name: "正在编辑首屏模板" })
      .locator("xpath=ancestor::*[@data-template-catalog-card='shared']");
    const catalogHero = catalogCard
      .frameLocator('iframe[data-template-catalog-viewport="desktop"]')
      .locator('[data-content-template="hero"]');
    const catalogImage = catalogHero.locator("img");
    const catalogPlaceholder = catalogHero.locator(
      '[data-asset-placeholder-status="waiting-final-asset"]',
    );
    await expect.poll(async () => (
      await catalogImage.count() + await catalogPlaceholder.count()
    )).toBeGreaterThan(0);
    if (await catalogImage.count() > 0) {
      await breakResponsiveImage(catalogImage, "/__missing-template-preview.svg");
    }
    await expect(catalogPlaceholder).toBeVisible();
    await expect.poll(() => catalogHero.evaluate((node) => getComputedStyle(node).backgroundColor))
      .toBe("rgb(247, 248, 248)");

    const frame = page.frameLocator(".template-editor__viewport-frame");
    const canvasHero = frame.locator('[data-content-template="hero"]');
    const canvasImage = canvasHero.locator("img");
    const canvasPlaceholder = canvasHero.locator(
      '[data-asset-placeholder-status="waiting-final-asset"]',
    );
    await expect.poll(async () => (
      await canvasImage.count() + await canvasPlaceholder.count()
    )).toBeGreaterThan(0);
    if (await canvasImage.count() > 0) {
      await breakResponsiveImage(canvasImage, "/__missing-template-preview.svg");
    }
    await expect(canvasPlaceholder).toBeVisible();
    await expect(canvasHero.locator(".hc-phase1-hero__copy-shade")).toHaveCount(0);
    await expect(canvasHero.locator('.hc-phase1-hero__copy[data-tone="dark"]')).toBeVisible();
    await expect.poll(() => canvasHero.evaluate((node) => getComputedStyle(node).backgroundColor))
      .toBe("rgb(247, 248, 248)");

    await page.getByRole("button", { name: /移动端模板布局/ }).click();
    const mobileCatalogHero = catalogCard
      .frameLocator('iframe[data-template-catalog-viewport="mobile"]')
      .locator('[data-content-template="hero"]');
    const mobileCatalogImage = mobileCatalogHero.locator("img");
    const mobileCatalogPlaceholder = mobileCatalogHero.locator(
      '[data-asset-placeholder-status="waiting-final-asset"]',
    );
    await expect.poll(async () => (
      await mobileCatalogImage.count() + await mobileCatalogPlaceholder.count()
    )).toBeGreaterThan(0);
    if (await mobileCatalogImage.count() > 0) {
      await breakResponsiveImage(mobileCatalogImage, "/__missing-template-preview-mobile.svg");
    }
    await expect(mobileCatalogPlaceholder).toBeVisible();
    const mobileCanvasHero = frame.locator('[data-content-template="hero"]');
    const mobileCanvasImage = mobileCanvasHero.locator("img");
    const mobileCanvasPlaceholder = mobileCanvasHero.locator(
      '[data-asset-placeholder-status="waiting-final-asset"]',
    );
    await expect.poll(async () => (
      await mobileCanvasImage.count() + await mobileCanvasPlaceholder.count()
    )).toBeGreaterThan(0);
    if (await mobileCanvasImage.count() > 0) {
      await breakResponsiveImage(mobileCanvasImage, "/__missing-template-preview-mobile.svg");
    }
    await expect(mobileCanvasPlaceholder).toBeVisible();
    await expect(mobileCanvasHero.locator(".hc-phase1-hero__copy-shade")).toHaveCount(0);
    await expect(mobileCanvasHero.locator('.hc-phase1-hero__copy[data-tone="dark"]')).toBeVisible();
    await expect.poll(() => mobileCanvasHero.evaluate((node) => getComputedStyle(node).backgroundColor))
      .toBe("rgb(247, 248, 248)");
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("统一目录不可用时失败关闭且不读取旧目录", async ({ page }) => {
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
      .toHaveCount(0);
    await expect(library.getByText("模板目录暂时无法读取", { exact: false })).toBeVisible();
    await expect(library.getByRole("button", { name: "重新读取" })).toBeVisible();
    expect(catalogReads.some((path) => path.endsWith("/dynamic-templates/catalog"))).toBe(true);
    expect(catalogReads.some((path) => path.endsWith("/dynamic-templates/mine"))).toBe(false);
    expect(catalogReads.some((path) => path.endsWith("/dynamic-templates/published"))).toBe(false);
    expect(catalogReads.some((path) => path.endsWith("/personal-content-templates"))).toBe(false);
    expect(catalogReads.some((path) => path.endsWith("/system-content-templates"))).toBe(false);
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

    await page.evaluate(() => {
      const observed: string[] = [];
      (window as any).__templateCanvasSizeSamples = observed;
      let remainingFrames = 120;
      const sample = () => {
        document.querySelectorAll<HTMLElement>('[aria-label^="画布尺寸 "]')
          .forEach((element) => observed.push(element.getAttribute("aria-label") ?? ""));
        remainingFrames -= 1;
        if (remainingFrames > 0) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });

    await pageTabs.getByRole("button", { name: "模板设计" }).click();
    await expect(page.getByRole("region", { name: /模板(?:设计)?画布/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "正在编辑首屏模板" })).toBeVisible();
    await expect(page.getByRole("region", { name: "空模板画布" })).toHaveCount(0);
    const templateGeometry = await readSharedToolbarGeometry(page);
    const templateTabs = page.getByRole("group", { name: "店铺装修工作模式切换" });
    await expect(templateTabs).toHaveAttribute("data-active-mode", "template");
    await expect(templateTabs.getByRole("button")).toHaveText("返回页面装修");
    await expect(templateTabs.getByRole("button")).toHaveCount(1);
    const initialSave = page.getByRole("button", { name: "保存模板", exact: true });
    await expect(initialSave).toBeEnabled();
    await expect(initialSave).toHaveAttribute("title", /首次保存后建立可管理的模板草稿/);
    const initialSaveStatus = page.getByRole("status", { name: "模板状态：尚未建立模板草稿" });
    await expect(initialSaveStatus).toContainText("首次保存后可管理");
    const initialPublish = page.getByRole("button", {
      name: "发布模板新版本（将先保存当前模板草稿）",
    });
    await expect(initialPublish).toBeEnabled();
    await expect(initialPublish).toHaveAttribute("title", /先保存当前模板草稿.*现有页面仍保持原版本/);
    await expect(page.locator('.template-editor__canvas-view-readout[aria-label^="画布尺寸 1920 × 1200，缩放 "]')).toBeVisible();
    const canvasSizeSamples = await page.evaluate(() => [
      ...new Set((window as any).__templateCanvasSizeSamples as string[]),
    ]);
    expect(canvasSizeSamples.some((label) => label.startsWith("画布尺寸 1920 × 240，"))).toBe(false);
    await expect.poll(() => unifiedCatalogReads.length).toBeGreaterThan(0);
    expect(legacyCurrentTemplateReads).toEqual([]);
    expectSharedToolbarGeometryEqual(pageGeometry, templateGeometry);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("选择模板对象后持续显示对象、设备、保存目标和页面影响", async ({ page }) => {
    await openWorkspaceShell(page, { role: "SUPER_ADMIN" });
    await page.getByRole("button", { name: "模板设计" }).click();

    const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    const editScope = inspector.getByRole("region", { name: "当前修改范围" });
    await expect(inspector).toContainText("当前对象 · 模板容器");
    await expect(inspector.locator(".template-editor__inspector-breadcrumb")).toHaveText("母模板草稿");
    await expect(editScope).toContainText("保存到：服务端模板草稿");
    await expect(editScope).toContainText("已有页面：保持原版本");
    await expect(editScope).toContainText("不会自动改动已有页面");

    const structure = page.getByRole("complementary", { name: "模板结构" });
    await structure.getByRole("treeitem", { name: /主视觉图片 图片槽位 必填/ }).click();
    await expect(inspector).toContainText("当前对象 · 图片槽位");
    await expect(inspector.locator(".homepage-editor__inspector-title")).toHaveText("桌面主图");
    await expect(inspector).toContainText("桌面端");
    await expect(editScope).toContainText("实际图片、文字、链接和商品仍在页面装修配置");

    await page.locator(".template-editor__toolbar").getByRole("button", { name: /移动端模板布局/ }).click();
    await expect(inspector.locator(".homepage-editor__inspector-title")).toHaveText("移动端主图");
    await expect(inspector).toContainText("移动端");
    await expect(editScope).toContainText("已有页面：保持原版本");
  });

  test("两种模式复用面板折叠控件且分别恢复各自工作区状态", async ({ page }) => {
    await page.addInitScript(() => {
      if (window !== window.top) return;
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
    await expect.poll(() => page.evaluate(() => ({
      structure: sessionStorage.getItem("template-editor-structure-collapsed"),
      inspector: sessionStorage.getItem("template-editor-inspector-collapsed"),
    }))).toEqual({ structure: "1", inspector: "1" });
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
    await expect.poll(() => page.evaluate(() => ({
      structure: sessionStorage.getItem("template-editor-structure-collapsed"),
      inspector: sessionStorage.getItem("template-editor-inspector-collapsed"),
    }))).toEqual({ structure: "1", inspector: "1" });
    await expect(templateWorkspace.locator(".template-editor__right-workspace"))
      .toHaveClass(/is-inspector-collapsed/);
    await expect(templateWorkspace.getByRole("button", { name: "展开模板结构面板" }))
      .toHaveAttribute("data-workspace-panel-collapse", "shared");
    await expect(templateWorkspace.getByRole("button", { name: "展开模板属性面板" }))
      .toHaveAttribute("data-workspace-panel-collapse", "shared");
  });

  for (const viewport of [
    { width: 1280, height: 900, library: 80, structure: 220, inspector: 360 },
    { width: 1366, height: 768, library: 80, structure: 220, inspector: 360 },
    { width: 1440, height: 900, library: 220, structure: 232, inspector: 360 },
    { width: 1600, height: 900, library: 252, structure: 240, inspector: 360 },
    { width: 1920, height: 1200, library: 252, structure: 240, inspector: 360 },
  ]) {
    test(`${viewport.width}px 模板设计结构栏使用独立清晰宽度`, async ({ page }) => {
      await openWorkspaceShell(page, {
        role: "SUPER_ADMIN",
        viewport: { width: viewport.width, height: viewport.height },
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
      const structurePanel = page.getByRole("complementary", { name: "模板结构" });
      const addStructureTrigger = structurePanel.getByRole("button", { name: /^添加模板结构到/ });
      await expect(addStructureTrigger).toBeVisible();
      await expect(addStructureTrigger).toBeInViewport();
      const bottomGap = await Promise.all([
        structurePanel.boundingBox(),
        addStructureTrigger.boundingBox(),
      ]).then(([panelBox, triggerBox]) => {
        if (!panelBox || !triggerBox) return Number.POSITIVE_INFINITY;
        return panelBox.y + panelBox.height - triggerBox.y - triggerBox.height;
      });
      expect(bottomGap).toBeGreaterThanOrEqual(0);
      expect(bottomGap).toBeLessThanOrEqual(13);
      const canvasControls = page.locator(".template-editor__canvas-controls--editable");
      const canvasControlMetrics = await canvasControls.evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }));
      expect(canvasControlMetrics.scrollWidth).toBeLessThanOrEqual(canvasControlMetrics.clientWidth + 1);
      await expect(canvasControls.getByRole("button", { name: /^模板尺寸：/ })).toBeInViewport();
      await expect(canvasControls.getByRole("button", { name: /^视图辅助/ })).toBeInViewport();

      if (viewport.width === 1366) {
        const toolbarActions = page.locator(".template-editor__toolbar .homepage-editor__toolbar-actions");
        await expect(toolbarActions).toBeVisible();
        const toolbarMetrics = await toolbarActions.evaluate((element) => ({
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
        }));
        expect(toolbarMetrics.scrollWidth).toBeLessThanOrEqual(toolbarMetrics.clientWidth + 1);
        for (const name of ["预览模板", "保存模板", "更多模板操作", /发布模板新版本/]) {
          await expect(toolbarActions.getByRole("button", { name })).toBeInViewport();
        }
      }

      if (viewport.width <= 1366) {
        await page.getByRole("button", { name: "展开模板组件库" }).click();
      }
      const catalogCard = page.locator(
        '[data-unified-template-library="design"] [data-template-catalog-card="shared"][data-template-identity="source:legacy_system_hero"]',
      );
      await expect(catalogCard.locator('[data-preview-status="ready"]')).toHaveCount(1);
      await expect(catalogCard.locator(".homepage-editor__template-name")).toHaveText("首屏");
      await expect(catalogCard.locator(
        ".homepage-editor__template-slot-summary, .homepage-editor__template-description, .homepage-editor__template-add",
      )).toHaveCount(0);
    });
  }

  test("模板结构定稿状态保持五层层级、固定入口与可恢复弹层焦点", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      viewport: { width: 1920, height: 948 },
    });
    const pageStructureWidth = await page
      .locator(".homepage-editor__page-workspace .homepage-editor__structure-workspace")
      .evaluate((element) => element.getBoundingClientRect().width);
    expect(pageStructureWidth).toBe(188);

    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建空白模板" }).click();
    const structure = page.getByRole("complementary", { name: "模板结构" });
    await expect(structure.locator(".template-editor__template-summary")).toContainText("未命名模板");
    await expect(structure.getByRole("region", { name: "模板结构问题" }))
      .toContainText("2 项待处理");
    await expect(structure.getByText("区", { exact: true })).toHaveCount(0);

    const { trigger, panel } = await openTemplateStructureAddPanel(page);
    await expect(trigger).toHaveText("添加结构");
    await expect.poll(async () => (await panel.boundingBox())?.width ?? 0)
      .toBeGreaterThanOrEqual(359);
    await expect.poll(async () => (await panel.boundingBox())?.width ?? Number.POSITIVE_INFINITY)
      .toBeLessThanOrEqual(361);
    const groupLabels = ["区域", "常用内容", "布局", "高级内容", "组合模块"];
    const groupTops = await Promise.all(groupLabels.map(async (label) => {
      const box = await panel.getByText(label, { exact: true }).boundingBox();
      return box?.y ?? Number.POSITIVE_INFINITY;
    }));
    expect(groupTops).toEqual([...groupTops].sort((left, right) => left - right));
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(trigger).toBeFocused();

    const { panel: reopenedPanel } = await openTemplateStructureAddPanel(page);
    await reopenedPanel.getByRole("button", { name: "添加区域（新增内容区域）" }).click();
    await expect(trigger).toHaveAccessibleName("添加模板结构到内容区域 1");
    await trigger.click();
    const region = structure.getByRole("treeitem", { name: /^内容区域 1/ });
    await expect(region).toBeVisible();
    await expect(structure.locator(".template-editor__region-empty")).toHaveText("暂无内容");
    await structure.getByRole("button", { name: "内容区域 1收起" }).click();
    await expect(structure.locator(".template-editor__region-empty")).toBeHidden();
    await structure.getByRole("button", { name: "内容区域 1展开" }).click();
    await expect(structure.locator(".template-editor__region-empty")).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

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

    const readFourRegionGeometry = async (rootSelector: string) =>
      page.locator(rootSelector).evaluate((root) => {
        const shell = root.matches(".homepage-editor__body")
          ? root
          : root.querySelector<HTMLElement>(":scope > .homepage-editor__body");
        const library = shell?.querySelector<HTMLElement>(":scope > .homepage-editor__library");
        const structure = shell?.querySelector<HTMLElement>(":scope > .homepage-editor__structure-workspace");
        const stage = shell?.querySelector<HTMLElement>(":scope > .homepage-editor__stage");
        const inspector = shell?.querySelector<HTMLElement>(":scope > .homepage-editor__right-workspace");
        const canvas = stage?.querySelector<HTMLElement>(".homepage-editor__canvas-scroll");
        if (!library || !structure || !stage || !canvas || !inspector) {
          throw new Error("四区稳定骨架未完整渲染");
        }
        const rect = (element: HTMLElement) => {
          const value = element.getBoundingClientRect();
          return {
            left: Math.round(value.left * 10) / 10,
            right: Math.round(value.right * 10) / 10,
            width: Math.round(value.width * 10) / 10,
          };
        };
        return {
          library: rect(library),
          structure: rect(structure),
          canvas: rect(canvas),
          inspector: rect(inspector),
        };
      });

    const expectStableFourRegionGeometry = (
      regions: Awaited<ReturnType<typeof readFourRegionGeometry>>,
    ) => {
      const evidence = JSON.stringify(regions);
      expect(regions.library.left, evidence).toBeLessThan(regions.structure.left);
      expect(regions.structure.left, evidence).toBeLessThan(regions.canvas.left);
      expect(regions.canvas.left, evidence).toBeLessThan(regions.inspector.left);
      expect(Math.abs(regions.library.right - regions.structure.left), evidence).toBeLessThanOrEqual(1);
      expect(Math.abs(regions.structure.right - regions.canvas.left), evidence).toBeLessThanOrEqual(1);
      expect(Math.abs(regions.canvas.right - regions.inspector.left), evidence).toBeLessThanOrEqual(1);
      expect(regions.canvas.width, evidence).toBeGreaterThan(regions.library.width);
      expect(regions.canvas.width, evidence).toBeGreaterThan(regions.structure.width);
    };

    const pageDocument = page.locator(
      ".homepage-editor__page-workspace .homepage-editor__canvas-document",
    );
    await expect(pageDocument).toBeVisible();
    const pageGeometry = await readCanvasGeometry(
      ".homepage-editor__page-workspace",
      ".homepage-editor__canvas-document",
    );
    const pageRegions = await readFourRegionGeometry(".homepage-editor__page-workspace");
    expectStableFourRegionGeometry(pageRegions);

    await page.getByRole("button", { name: "模板设计" }).click();
    const templateDocument = page.locator(
      ".template-editor__body .template-editor__canvas-document",
    );
    await expect(templateDocument).toBeVisible();
    await expect(
      page.locator(".template-editor__body").getByLabel(/画布尺寸 1920 × \d+/),
    ).toBeVisible();
    const templateGeometry = await readCanvasGeometry(
      ".template-editor__body",
      ".template-editor__canvas-document",
    );
    const templateRegions = await readFourRegionGeometry(".template-editor__body");
    expectStableFourRegionGeometry(templateRegions);

    expect(templateGeometry.controls.right).toBe(pageGeometry.controls.right);
    expect(templateGeometry.controls.left).toBeLessThan(pageGeometry.controls.left);
    expect(templateGeometry.controls.width).toBeGreaterThan(pageGeometry.controls.width);
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

  test("顾客分享母模板白色边界随内容收口，并可拖动边界调整当前设备整体比例", async ({ page }) => {
    await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      viewport: { width: 1920, height: 948 },
    });
    await openTemplateFromCatalog(page, "顾客分享");

    const templateWorkspace = page.locator(".template-editor__body");
    const frameElement = templateWorkspace.locator(".template-editor__viewport-frame");
    const { trigger: sizeTrigger, controls: sizeControls } = await openTemplateSizeControls(page);
    const widthInput = sizeControls.getByRole("spinbutton", { name: "设计宽度" });
    const heightMode = sizeControls.getByRole("combobox", { name: "模板高度模式" });

    await expect(widthInput).toHaveValue("1920");
    await expect(templateWorkspace.getByText("模板边界", { exact: true })).toBeVisible();

    await heightMode.selectOption("fixed");
    const heightInput = sizeControls.getByRole("spinbutton", { name: "模板固定高度" });
    await heightInput.fill("640");
    await heightInput.press("Enter");
    await expect(heightMode).toHaveValue("fixed");
    await expect(heightInput).toHaveValue("640");
    await expect(frameElement).toHaveCSS("height", "640px");
    await expect(templateWorkspace.getByLabel(/画布尺寸 1920 × 640/)).toBeVisible();

    await widthInput.fill("1280");
    await widthInput.press("Enter");
    await expect(widthInput).toHaveValue("1280");
    await expect(heightInput).toHaveValue("640");
    await expect(frameElement).toHaveCSS("width", "1280px");
    await expect(templateWorkspace.getByLabel(/画布尺寸 1280 × 640/)).toBeVisible();

    // 固定高度模式下拖动底边只调整高度，不应悄悄改成固定比例。
    const fixedBottomHandle = templateWorkspace.getByRole("button", { name: /拖动调整模板高度与整体比例/ });
    await fixedBottomHandle.focus();
    await fixedBottomHandle.press("ArrowDown");
    await expect(heightMode).toHaveValue("fixed");
    await expect(heightInput).toHaveValue("650");
    await page.getByRole("button", { name: "撤销", exact: true }).click();
    await openTemplateSizeControls(page);
    await expect(heightInput).toHaveValue("640");

    await heightMode.selectOption("auto");
    await expect(heightMode).toHaveValue("auto");
    await expect(sizeControls.getByRole("spinbutton", { name: "模板固定高度" })).toHaveCount(0);
    await expect(sizeTrigger).toContainText("随内容");

    const cornerHandle = templateWorkspace.getByRole("button", { name: /拖动调整模板整体比例/ });
    const initialFrameBox = await frameElement.boundingBox();
    const cornerHandleBox = await cornerHandle.boundingBox();
    const initialNaturalHeight = Number.parseFloat(await frameElement.evaluate((element) => element.style.height));
    expect(initialFrameBox).toBeTruthy();
    expect(cornerHandleBox).toBeTruthy();
    const displayedScale = initialFrameBox!.width / 1280;
    const horizontalDrag = 72;
    const verticalDrag = 48;
    await page.mouse.move(
      cornerHandleBox!.x + cornerHandleBox!.width / 2,
      cornerHandleBox!.y + cornerHandleBox!.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      cornerHandleBox!.x + cornerHandleBox!.width / 2 + horizontalDrag,
      cornerHandleBox!.y + cornerHandleBox!.height / 2 + verticalDrag,
      { steps: 6 },
    );
    await expect(templateWorkspace.locator(".template-editor__canvas-direct-resize-readout")).toBeVisible();
    await page.mouse.up();

    await openTemplateSizeControls(page);
    const resizedWidth = Number(await widthInput.inputValue());
    const resizedHeight = Number.parseFloat(await frameElement.evaluate((element) => element.style.height));
    const expectedSnappedWidth = Math.round((1280 + horizontalDrag / displayedScale) / 10) * 10;
    const expectedSnappedHeight = Math.round((initialNaturalHeight + verticalDrag / displayedScale) / 10) * 10;
    expect(Math.abs(resizedWidth - expectedSnappedWidth)).toBeLessThanOrEqual(2);
    expect(Math.abs(resizedHeight - expectedSnappedHeight)).toBeLessThanOrEqual(2);
    await expect(heightMode).toHaveValue("aspect-ratio");
    await expect(sizeTrigger).not.toContainText("随内容");
    await expect(templateWorkspace.locator(".template-editor__canvas-direct-resize-readout")).toHaveCount(0);

    // 一次拖动只能形成一个历史记录；撤销必须同时恢复宽度与高度模式。
    await page.getByRole("button", { name: "撤销", exact: true }).click();
    await openTemplateSizeControls(page);
    await expect(widthInput).toHaveValue("1280");
    await expect(heightMode).toHaveValue("auto");

    // 边界手柄保留键盘等价操作，底边方向键会从随内容切换为整体固定比例。
    const bottomHandle = templateWorkspace.getByRole("button", { name: /拖动调整模板高度与整体比例/ });
    const keyboardStartHeight = Number.parseFloat(await frameElement.evaluate((element) => element.style.height));
    await bottomHandle.focus();
    await bottomHandle.press("ArrowDown");
    await expect(heightMode).toHaveValue("aspect-ratio");
    await expect(widthInput).toHaveValue("1280");
    await expect.poll(async () => Number.parseFloat(await frameElement.evaluate((element) => element.style.height)))
      .toBeCloseTo(keyboardStartHeight + 10, 0);

    // 桌面与移动模板比例独立；移动端边界调整不得反写桌面尺寸。
    await page.getByRole("button", { name: /移动端模板布局/ }).click();
    await openTemplateSizeControls(page);
    await expect(widthInput).toHaveValue("390");
    const mobileRightHandle = templateWorkspace.getByRole("button", { name: /拖动调整模板宽度/ });
    await mobileRightHandle.focus();
    await mobileRightHandle.press("ArrowRight");
    await expect(widthInput).toHaveValue("400");
    await page.getByRole("button", { name: /桌面端模板布局/ }).click();
    await openTemplateSizeControls(page);
    await expect(widthInput).toHaveValue("1280");

    // 常用比例直接进入受约束模式；在固定比例下改宽度会联动高度，比例保持不变。
    await openTemplateSizeControls(page);
    const ratioPreset = sizeControls.getByRole("combobox", { name: "常用模板比例" });
    await ratioPreset.selectOption("16:9");
    await expect(heightMode).toHaveValue("aspect-ratio");
    await expect(sizeTrigger).toContainText("桌面端 · 1280 · 16:9");
    await expect(templateWorkspace.getByRole("status", { name: "" }).filter({ hasText: "内容越界" }))
      .toContainText(/纵向 \d+px/);
    const ratioStartHeight = Number.parseFloat(await frameElement.evaluate((element) => element.style.height));
    const desktopRightHandle = templateWorkspace.getByRole("button", { name: /拖动调整模板宽度/ });
    await desktopRightHandle.focus();
    await desktopRightHandle.press("ArrowRight");
    await expect(widthInput).toHaveValue("1290");
    await expect.poll(async () => Number.parseFloat(await frameElement.evaluate((element) => element.style.height)))
      .toBeCloseTo(ratioStartHeight * 1290 / 1280, 0);
    await expect(sizeTrigger).toContainText("桌面端 · 1290 · 16:9");

    // 恢复只作用于当前设备并进入同一撤销栈，不覆盖移动端刚才的独立宽度。
    await openTemplateSizeControls(page);
    const restoreSize = sizeControls.getByRole("button", { name: "恢复已保存尺寸" });
    await expect(restoreSize).toBeEnabled();
    await restoreSize.click();
    await expect(widthInput).toHaveValue("1920");
    await expect(heightMode).toHaveValue("auto");
    await expect(restoreSize).toBeDisabled();
    await page.getByRole("button", { name: /移动端模板布局/ }).click();
    await openTemplateSizeControls(page);
    await expect(widthInput).toHaveValue("400");
    await page.getByRole("button", { name: /桌面端模板布局/ }).click();
    await page.getByRole("button", { name: "撤销", exact: true }).click();
    await openTemplateSizeControls(page);
    await expect(widthInput).toHaveValue("1290");
    await expect(heightMode).toHaveValue("aspect-ratio");
  });

  test("模板画布支持精确缩放、视图辅助、平移、选中定位和越界定位", async ({ page }) => {
    await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      viewport: { width: 1920, height: 948 },
    });
    await openTemplateFromCatalog(page, "顾客分享");

    const workspace = page.locator(".template-editor__body");
    const stage = workspace.locator(".template-editor__canvas-scroll");
    const board = workspace.locator(".template-editor__canvas-board");
    const zoomInput = workspace.getByRole("spinbutton", { name: "画布缩放百分比" });

    await zoomInput.fill("125");
    await zoomInput.press("Enter");
    await expect(zoomInput).toHaveValue("125");
    await expect.poll(async () => Number.parseFloat(await board.evaluate((element) => element.style.width)))
      .toBeCloseTo(2400, 0);

    const { controls: sizeControls } = await openTemplateSizeControls(page);
    const widthInput = sizeControls.getByRole("spinbutton", { name: "设计宽度" });
    const widthPreset = sizeControls.getByRole("combobox", { name: "常用模板宽度" });
    await widthPreset.selectOption("1440");
    await expect(widthInput).toHaveValue("1440");
    await widthPreset.selectOption("1920");
    await expect(widthInput).toHaveValue("1920");
    await zoomInput.fill("125");
    await zoomInput.press("Enter");

    const { trigger: viewToolsTrigger, controls: viewTools } = await openTemplateViewTools(page);
    const gridToggle = viewTools.getByRole("button", { name: "网格", exact: true });
    const centerToggle = viewTools.getByRole("button", { name: "中心线", exact: true });
    const safeAreaToggle = viewTools.getByRole("button", { name: "安全区", exact: true });
    const snapToggle = viewTools.getByRole("button", { name: "吸附 10px", exact: true });
    await gridToggle.click();
    await centerToggle.click();
    await safeAreaToggle.click();
    await expect(gridToggle).toHaveAttribute("aria-pressed", "true");
    await expect(centerToggle).toHaveAttribute("aria-pressed", "true");
    await expect(safeAreaToggle).toHaveAttribute("aria-pressed", "true");
    await expect(snapToggle).toHaveAttribute("aria-pressed", "true");
    await expect(workspace.locator(".template-editor__canvas-grid")).toBeVisible();
    await expect(workspace.locator(".template-editor__canvas-center-guides")).toBeVisible();
    await expect(workspace.locator(".template-editor__canvas-safe-area")).toContainText("安全区 5%");

    const panToggle = viewTools.getByRole("button", { name: "手形平移", exact: true });
    await panToggle.click();
    await expect(panToggle).toHaveAttribute("aria-pressed", "true");
    await expect(stage).toHaveAttribute("aria-label", /模板画布平移区域/);
    await stage.evaluate((element) => {
      element.scrollLeft = 160;
      element.scrollTop = 120;
    });
    const keyboardPanStart = await stage.evaluate((element) => element.scrollLeft);
    await stage.focus();
    await stage.press("ArrowRight");
    await expect.poll(async () => stage.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(keyboardPanStart);

    const stageBox = await stage.boundingBox();
    expect(stageBox).toBeTruthy();
    const pointerPanStart = await stage.evaluate((element) => element.scrollLeft);
    await page.mouse.move(stageBox!.x + stageBox!.width / 2, stageBox!.y + stageBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(stageBox!.x + stageBox!.width / 2 - 80, stageBox!.y + stageBox!.height / 2, { steps: 4 });
    await page.mouse.up();
    await expect.poll(async () => stage.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(pointerPanStart + 50);
    await openTemplateViewTools(page);
    await panToggle.click();

    const frame = workspace.frameLocator(".template-editor__viewport-frame");
    const templateNodes = frame.locator("[data-template-node-id]");
    await expect(templateNodes.first()).toBeVisible();
    await templateNodes.first().click({ force: true });
    await page.getByRole("complementary", { name: "模板结构" })
      .locator(".homepage-editor__panel-header")
      .click();
    await expect(viewTools).toBeHidden();
    await expect(viewToolsTrigger).toHaveAttribute("aria-expanded", "false");
    await openTemplateViewTools(page);
    const locateSelection = viewTools.getByRole("button", { name: "定位选中", exact: true });
    const fitSelection = viewTools.getByRole("button", { name: "适应选中", exact: true });
    await expect(locateSelection).toBeEnabled();
    await expect(fitSelection).toBeEnabled();
    await zoomInput.fill("200");
    await zoomInput.press("Enter");
    await stage.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
      element.scrollTop = element.scrollHeight;
    });
    const farScroll = await stage.evaluate((element) => ({
      left: element.scrollLeft,
      top: element.scrollTop,
    }));
    await locateSelection.click();
    await expect.poll(async () => stage.evaluate((element) => ({
      left: element.scrollLeft,
      top: element.scrollTop,
    }))).not.toEqual(farScroll);
    await fitSelection.click();
    await expect.poll(async () => Number(await zoomInput.inputValue())).toBeLessThan(200);

    await openTemplateSizeControls(page);
    const heightMode = sizeControls.getByRole("combobox", { name: "模板高度模式" });
    await heightMode.selectOption("fixed");
    const heightInput = sizeControls.getByRole("spinbutton", { name: "模板固定高度" });
    await heightInput.fill("2000");
    await heightInput.press("Enter");
    await workspace.getByRole("button", { name: "适应画布", exact: true }).click();
    await expect.poll(async () => {
      const [stageSize, boardSize] = await Promise.all([
        stage.evaluate((element) => element.clientHeight),
        board.evaluate((element) => element.getBoundingClientRect().height),
      ]);
      return boardSize <= stageSize - 40;
    }).toBe(true);
    await heightInput.fill("240");
    await heightInput.press("Enter");
    // 用节点自身真实尺寸制造越界，避免把诊断测试绑在某个模板的文案或素材高度上。
    await templateNodes.last().evaluate((element) => {
      (element as HTMLElement).style.minHeight = "1200px";
    });
    const overflowWarning = workspace.getByRole("button", { name: /内容越界.*定位/ });
    await expect(overflowWarning).toBeEnabled();
    await overflowWarning.click();
    await expect(frame.locator('[data-template-selected="true"]')).toBeVisible();

    // 网格、中心线、平移和缩放仅属于视图状态，不应生成模板历史记录。
    await expect(page.getByRole("button", { name: "撤销", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "撤销", exact: true }).click();
    await openTemplateSizeControls(page);
    await expect(heightInput).not.toHaveValue("240");
    await openTemplateViewTools(page);
    await expect(gridToggle).toHaveAttribute("aria-pressed", "true");
    await expect(centerToggle).toHaveAttribute("aria-pressed", "true");
  });

  test("选中节点可在画布中直接居中，并复制构图到另一设备", async ({ page }) => {
    await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      viewport: { width: 1920, height: 948 },
    });
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建空白模板" }).click();

    const workspace = page.locator(".template-editor__body");
    const { panel: addPanel } = await openTemplateStructureAddPanel(page);
    await addPanel.getByRole("button", { name: "添加区域（新增内容区域）" }).click();
    await addPanel.getByText("布局", { exact: true }).click();
    await addPanel.getByRole("button", { name: "堆叠容器 结构节点" }).click();
    await addPanel.getByRole("button", { name: "图片槽位 内容槽位" }).click();
    await addPanel.getByRole("button", { name: "标题槽位 内容槽位" }).click();
    await workspace.getByRole("treeitem", { name: /堆叠容器/ }).click();
    await openTemplateInspectorPanel(page, "布局");
    await workspace.getByRole("button", { name: "自由叠放", exact: true }).click();
    await workspace.getByRole("treeitem", { name: /图片槽位/ }).click();
    const frame = workspace.frameLocator(".template-editor__viewport-frame");
    const toolbar = workspace.getByRole("toolbar", { name: /快捷操作/ });
    const selectedImage = frame.locator('[data-template-node-type="ImageSlot"][data-template-selected="true"]');
    await expect(toolbar).toBeVisible();

    await toolbar.getByRole("button", { name: "在父容器中水平居中" }).click();
    await toolbar.getByRole("button", { name: "在父容器中垂直居中" }).click();
    const centeredDesktopPlacement = await selectedImage.evaluate((node: HTMLElement) => {
      return {
        left: node.style.left,
        top: node.style.top,
        width: node.style.width,
        height: node.style.height,
      };
    });
    expect(Number.parseFloat(centeredDesktopPlacement.left)
      + Number.parseFloat(centeredDesktopPlacement.width) / 2).toBeCloseTo(50, 3);
    expect(Number.parseFloat(centeredDesktopPlacement.top)
      + Number.parseFloat(centeredDesktopPlacement.height) / 2).toBeCloseTo(50, 3);

    await toolbar.getByRole("button", { name: "复制当前自由布局到移动端" }).click();
    await page.getByRole("button", { name: /移动端模板布局/ }).click();
    const mobileToolbar = workspace.getByRole("toolbar", { name: /快捷操作/ });
    await expect(mobileToolbar).toBeVisible();
    const mobilePlacement = await selectedImage.evaluate((node: HTMLElement) => {
      return {
        left: node.style.left,
        top: node.style.top,
        width: node.style.width,
        height: node.style.height,
      };
    });
    expect(mobilePlacement).toEqual(centeredDesktopPlacement);

    // 三个动作分别进入撤销栈；撤销复制后，桌面端刚完成的居中构图仍保留。
    await page.getByRole("button", { name: "撤销", exact: true }).click();
    await page.getByRole("button", { name: /桌面端模板布局/ }).click();
    const desktopPlacementAfterUndo = await selectedImage.evaluate((node: HTMLElement) => {
      return { left: node.style.left, top: node.style.top };
    });
    expect(desktopPlacementAfterUndo).toEqual({
      left: centeredDesktopPlacement.left,
      top: centeredDesktopPlacement.top,
    });
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

    const templateSummary = page.getByRole("treeitem", { name: /首屏 模板/ });
    await templateSummary.focus();
    await expect(templateSummary).toBeFocused();
    const canvasFrame = page.locator(".template-editor__viewport-frame");
    await canvasFrame.focus();
    await expect(canvasFrame).toBeFocused();
    await openTemplateBasicInfo(page);
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

  test("切换母模板时要求显式保存后再打开目标模板", async ({ page }) => {
    const { forbiddenPageWrites, writes, dynamic } = await openWorkspaceShell(page);
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "正在编辑首屏模板" }).click();
    await fillTemplateName(page, "尚未保存的首屏构图");

    await page.getByRole("button", { name: "打开通栏图模板" }).click();
    const transitionDialog = page.getByRole("dialog", { name: "切换模板？" });
    await expect(transitionDialog).toContainText("模板“尚未保存的首屏构图”还有未保存修改");
    await expect(transitionDialog).toContainText("已发布模板和页面草稿不会受到影响");
    await expect(transitionDialog.getByRole("button", { name: "放弃修改并切换" })).toBeVisible();
    await expect(transitionDialog.getByRole("button", { name: "继续编辑模板" })).toBeFocused();
    await transitionDialog.getByRole("button", { name: "保存草稿并切换" }).click();
    await openTemplateBasicInfo(page);
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

  test("放弃未保存模板修改后返回页面装修且不写入草稿", async ({ page }) => {
    const { dynamic, forbiddenPageWrites, writes } = await openWorkspaceShell(page);
    await openTemplateFromCatalog(page, "首屏");
    await fillTemplateName(page, "本次放弃的模板修改");

    await page.getByRole("button", { name: "页面装修" }).click();
    const transitionDialog = page.getByRole("dialog", { name: "返回页面装修？" });
    await transitionDialog.getByRole("button", { name: "放弃修改并返回" }).click();

    await expect(page.locator(".homepage-editor__page-workspace .homepage-editor__structure-workspace"))
      .toBeVisible();
    expect(dynamic.writes).toEqual([]);
    expect(writes).toEqual([]);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("已有母模板直接进入统一编辑器，覆盖后发布到同一页面装修目录", async ({ page }) => {
    const { forbiddenPageWrites, dynamic } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
    });
    await openTemplateFromCatalog(page, "首屏");
    await expect(page.getByRole("region", { name: /首屏模板设计画布/ })).toBeVisible();
    await expect(page.getByRole("treeitem", { name: /首屏 模板/ })).toBeVisible();
    await expect(page.getByText(/转换为新版|固定模板|动态模板/)).toHaveCount(0);
    await fillTemplateName(page, "品牌首屏母模板");
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
    await expect(publishedTemplateCard).toHaveAttribute("draggable", "true");
    const publishedTemplateContainer = publishedTemplateCard
      .locator("xpath=ancestor::*[@data-template-identity='source:legacy_system_hero']");
    await expect(publishedTemplateContainer).toHaveCount(1);
    await expect(publishedTemplateContainer.locator(".homepage-editor__template-badge")).toHaveCount(0);
    await expect(publishedTemplateContainer).not.toContainText("有未发布修改");
    await expect(templateLibrary.getByRole("heading", { name: "品牌展示", exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "已发布模板", exact: true })).toHaveCount(0);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("只有通用槽位的过时系统草稿不遮住系统基线，打开后形成可确认的修复草稿", async ({ page }) => {
    const { dynamic, forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
    });
    await openTemplateFromCatalog(page, "首屏");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "模板设计", exact: true }).click();
    await expect(page.getByLabel("模板状态：模板草稿已保存")).toBeVisible();
    await expect(page.getByText(/服务端草稿缺少当前系统模板组件/)).toHaveCount(0);

    const persisted = dynamic.records[0];
    const blankDefinition = createBlankDynamicTemplateDefinition(persisted.name);
    blankDefinition.templateId = persisted.templateId;
    blankDefinition.metadata = structuredClone(persisted.draft.definition.metadata);
    const firstRegion = addDynamicTemplateNode(
      blankDefinition,
      blankDefinition.rootNodeId,
      "Container",
    );
    firstRegion.definition.nodes[firstRegion.nodeId].name = "响应式区域";
    const imageSlot = addDynamicTemplateNode(
      firstRegion.definition,
      firstRegion.nodeId,
      "ImageSlot",
    );
    imageSlot.definition.nodes[imageSlot.nodeId].name = "图片槽位";
    imageSlot.definition.slots[imageSlot.slotId!].label = "图片槽位";
    const secondRegion = addDynamicTemplateNode(
      imageSlot.definition,
      imageSlot.definition.rootNodeId,
      "Container",
    );
    secondRegion.definition.nodes[secondRegion.nodeId].name = "内容区域 2";
    const brokenDefinition = secondRegion.definition;
    brokenDefinition.metadata.slotSummary = "1 个已映射槽位";
    persisted.draft.definition = brokenDefinition;
    persisted.slotSummary = "1 个已映射槽位";
    await page.evaluate(() => window.dispatchEvent(new Event("haichuan:dynamic-template-server-changed")));
    await page.reload();
    await page.getByRole("button", { name: "模板设计", exact: true }).click();

    const library = page.locator('[data-unified-template-library="design"]');
    const card = library.locator('[data-template-identity="source:legacy_system_hero"]');
    await expect(card).toHaveCount(1);
    await expect(card.locator('[data-preview-status="ready"]')).toHaveCount(1);
    await expect(card.locator('[data-slot-label="图片"]')).toHaveCount(1);

    await expect(page.getByText("服务端草稿缺少当前系统模板组件，已载入系统基线供修复；原草稿尚未覆盖，确认后再保存"))
      .toBeVisible();
    await expect(page.getByRole("button", { name: "保存模板", exact: true })).toBeEnabled();
    await expect(page.getByRole("treeitem", { name: /主视觉图片 图片槽位 必填/ })).toBeVisible();
    await expect(page.locator('.template-editor__canvas-view-readout[aria-label^="画布尺寸 1920 × 1200，缩放 "]')).toBeVisible();
    await expect(page.getByText("PUBLISH_REQUIRES_SLOT")).toHaveCount(0);
    expect(dynamic.writes).toHaveLength(1);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("模板设计发布后由页面装修同一目录直接插入精确版本", async ({ page }) => {
    const { dynamic, forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeEmptyDraft(),
    });
    await openTemplateFromCatalog(page, "首屏");
    await fillTemplateName(page, "目录互通首屏");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();

    await page.getByRole("button", { name: "发布模板新版本" }).click();
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
    await expect(page.getByRole("group", { name: "店铺装修工作模式切换" }))
      .toHaveAttribute("data-active-mode", "page");
    await expect(page.locator(".template-editor__toolbar")).toHaveCount(0);
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
    const visibilityNotice = page.locator(".ant-message-notice-content").filter({ hasText: "已隐藏「首屏」" });
    await expect(visibilityNotice).toBeVisible();
    await expect(visibilityNotice).toHaveCSS("pointer-events", "none");
    await page.getByRole("button", { name: /移动端布局/ }).click();

    await openTemplateFromCatalog(page, "首屏");
    await expect(page.getByRole("region", { name: /模板设计画布/ })).toBeVisible();
    await expect(page.getByRole("treeitem", { name: /首屏 模板/ })).toBeVisible();
    await expect(pageLayer).toBeHidden();

    const name = (await openTemplateBasicInfo(page)).getByRole("textbox", { name: "模板名称", exact: true });
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

  test("账号母模板直接进入统一编辑器，覆盖只写统一模板草稿", async ({ page }, testInfo) => {
    const personal = personalTemplateFixture();
    const { writes, dynamic, forbiddenPageWrites } = await openWorkspaceShell(page, {
      personalTemplates: [personal],
    });
    await openTemplateFromCatalog(page, personal.name);
    const name = (await openTemplateBasicInfo(page)).getByRole("textbox", { name: "模板名称", exact: true });
    await name.fill("我的品牌首屏｜调整版");

    await page.getByRole("button", { name: "页面装修" }).click();
    const transitionDialog = page.getByRole("dialog", { name: "返回页面装修？" });
    await expect(transitionDialog).toContainText("模板“我的品牌首屏｜调整版”还有未保存修改");
    await expect(transitionDialog.getByRole("button", { name: "放弃修改并返回" })).toBeVisible();
    await expect(transitionDialog.getByRole("button", { name: "继续编辑模板" })).toBeFocused();
    await page.setViewportSize({ width: 1440, height: 900 });
    await attachScreenshot(page, testInfo, "template-unsaved-transition-desktop");

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(transitionDialog).toBeInViewport();
    await expect(transitionDialog.getByRole("button", { name: "保存草稿并返回" })).toBeVisible();
    const footerMetrics = await transitionDialog
      .locator(".template-editor__transition-footer")
      .evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        children: Array.from(element.children).map((child) => ({
          clientWidth: (child as HTMLElement).clientWidth,
          scrollWidth: (child as HTMLElement).scrollWidth,
        })),
      }));
    expect(footerMetrics, JSON.stringify(footerMetrics)).toMatchObject({
      scrollWidth: footerMetrics.clientWidth,
    });
    await attachScreenshot(page, testInfo, "template-unsaved-transition-narrow");

    await page.setViewportSize({ width: 1280, height: 720 });
    await transitionDialog.getByRole("button", { name: "继续编辑模板" }).click();
    await expect(transitionDialog).toHaveCount(0);
    await expect(name).toHaveValue("我的品牌首屏｜调整版");
    expect(dynamic.writes).toEqual([]);

    await page.getByRole("button", { name: "页面装修" }).click();
    await page.getByRole("dialog", { name: "返回页面装修？" })
      .getByRole("button", { name: "保存草稿并返回" }).click();
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

    await expect(page.getByText("修改已更新，尚未保存页面草稿", { exact: true })).toBeVisible();
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
    await expect(page.getByText("修改已更新，尚未保存页面草稿", { exact: true })).toHaveCount(0);
    await upgrade.click();
    const confirm = page.getByRole("dialog", { name: "升级“首屏”页面实例？" });
    await expect(confirm).toContainText("不会自动发布");
    await confirm.getByRole("button", { name: "升级当前页面草稿" }).click();

    await expect(page.getByText("修改已更新，尚未保存页面草稿", { exact: true })).toBeVisible();
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
    await fillTemplateName(page, "失败仍保留的模板");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板保存失败，修改仍在", { exact: true })).toBeVisible();
    const failedSaveStatus = page.getByRole("status", {
      name: "模板状态：保存失败，修改仍在，可以重试",
    });
    await expect(failedSaveStatus).toHaveAttribute("data-mode", "error");
    await expect(failedSaveStatus).toContainText("保存失败");
    await expect(failedSaveStatus).toContainText("修改仍在 · 可重试");
    const retrySave = page.getByRole("button", { name: "重试保存模板草稿" });
    await expect(retrySave).toBeEnabled();
    await expect(retrySave).toHaveAttribute("title", /失败不会丢失修改/);
    await expect(page.getByRole("textbox", { name: "模板名称", exact: true })).toHaveValue("失败仍保留的模板");
    await page.getByRole("button", { name: "页面装修" }).click();
    const transitionDialog = page.getByRole("dialog", { name: "返回页面装修？" });
    await transitionDialog.getByRole("button", { name: "保存草稿并返回" }).click();
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

  test("母模板保存冲突时保留当前工作，并将本地修改安全另存为新模板", async ({ page }) => {
    const { dynamic, forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
    });
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建空白模板" }).click();
    await fillTemplateName(page, "冲突来源模板");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();

    const sourceTemplate = dynamic.records[0];
    const sourceName = sourceTemplate.name;
    const sourceTemplateId = sourceTemplate.templateId;

    let historicalDefinition = createBlankDynamicTemplateDefinition(sourceName);
    historicalDefinition.templateId = sourceTemplateId;
    const historicalRegion = addDynamicTemplateNode(
      historicalDefinition,
      historicalDefinition.rootNodeId,
      "Container",
    );
    historicalDefinition = historicalRegion.definition;
    const historicalHeading = addDynamicTemplateNode(
      historicalDefinition,
      historicalRegion.nodeId,
      "HeadingSlot",
    );
    historicalDefinition = historicalHeading.definition;
    const historicalSlotId = historicalHeading.slotId!;
    historicalDefinition.defaultContent[historicalSlotId] = "来源模板保留的历史默认标题";
    historicalDefinition.previewContent ??= {};
    historicalDefinition.previewContent[historicalSlotId] = "来源模板保留的历史预览标题";
    historicalDefinition.slots[historicalSlotId].emptyPolicy = "use-default";
    sourceTemplate.draft.definition = structuredClone(historicalDefinition);
    sourceTemplate.draft.definitionChecksum = "historical-content-fixture";

    await page.reload();
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible({ timeout: 15_000 });
    await openTemplateFromCatalog(page, sourceName);

    const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    const compatibilityAlert = inspector.getByText("当前草稿包含历史默认内容或兼容规则", { exact: true });
    await expect(compatibilityAlert).toBeVisible();
    await inspector.getByRole("button", { name: "从当前草稿移除历史内容" }).click();
    await expect(compatibilityAlert).toHaveCount(0);
    await page.getByRole("button", { name: "撤销", exact: true }).click();
    await expect(compatibilityAlert).toBeVisible();
    await inspector.getByRole("button", { name: "从当前草稿移除历史内容" }).click();
    await expect(compatibilityAlert).toHaveCount(0);
    await inspector.getByRole("textbox", { name: "模板说明" }).fill("只在冲突副本中保留的构图说明");
    sourceTemplate.draft.revision += 1;
    await page.getByRole("button", { name: "保存模板", exact: true }).click();

    const conflictStatus = page.getByRole("status", {
      name: "模板状态：保存冲突，修改仍在，请另存为新模板",
    });
    await expect(conflictStatus).toHaveAttribute("data-mode", "conflict");
    await expect(conflictStatus).toContainText("保存冲突");
    await expect(conflictStatus).toContainText("修改仍在 · 请另存副本");
    await expect(inspector.getByRole("textbox", { name: "模板说明" }))
      .toHaveValue("只在冲突副本中保留的构图说明");
    await expect(compatibilityAlert).toHaveCount(0);
    await expect(page.getByRole("button", {
      name: /发布模板新版本（当前模板存在保存冲突，请先将修改另存为新模板）/,
    })).toBeDisabled();

    await inspector.getByRole("textbox", { name: "模板说明" }).fill("冲突后继续编辑也必须保留的构图说明");
    await expect(conflictStatus).toBeVisible();
    await expect(inspector.getByRole("textbox", { name: "模板说明" }))
      .toHaveValue("冲突后继续编辑也必须保留的构图说明");

    const preserveCopy = page.getByRole("button", { name: "另存当前冲突修改为新模板" });
    await expect(preserveCopy).toBeEnabled();
    await expect(preserveCopy).toHaveAttribute("title", /完整保留当前工作/);
    await preserveCopy.click();
    const saveDialog = page.getByRole("dialog", { name: "另存为模板" });
    await expect(saveDialog.getByText("副本不会包含历史默认内容或兼容规则", { exact: true })).toHaveCount(0);
    await saveDialog.getByRole("textbox", { name: "新模板名称" }).fill("冲突修改保留副本");
    await saveDialog.getByRole("button", { name: "另存为模板" }).click();

    await expect(page.getByText("“冲突修改保留副本”副本已保存为新的账号模板")).toBeVisible();
    const copied = dynamic.records.find((record) => record.name === "冲突修改保留副本");
    expect(copied?.templateId).not.toBe(sourceTemplateId);
    expect(copied?.sourceReference).toBe(sourceTemplateId);
    expect(copied?.draft.definition.description).toBe("冲突后继续编辑也必须保留的构图说明");
    expect(copied?.draft.definition.defaultContent).toEqual({});
    expect(copied?.draft.definition.previewContent).toEqual({});
    expect(copied?.draft.definition.slots[historicalSlotId].emptyPolicy).toBe("hide");
    expect(sourceTemplate.name).toBe(sourceName);
    expect(sourceTemplate.draft.definition.defaultContent[historicalSlotId])
      .toBe("来源模板保留的历史默认标题");
    expect(sourceTemplate.draft.definition.previewContent[historicalSlotId])
      .toBe("来源模板保留的历史预览标题");
    expect(dynamic.writes).toHaveLength(2);
    expect(dynamic.writes[1]).toMatchObject({
      method: "POST",
      pathname: "/api/page-modules/dynamic-templates",
    });
    expect(forbiddenPageWrites).toEqual([]);
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
    const { trigger: addTrigger, panel: addPanel } = await openTemplateStructureAddPanel(page);
    await expect(addPanel).toContainText("添加到");
    await expect(addPanel).toContainText("新内容区域");
    await expect(addPanel).toContainText("添加内容时会自动创建内容区域 1");
    await addTrigger.click();
    await expect(addPanel).toBeHidden();
    await expect(page.getByText("Slot 必须", { exact: false })).toHaveCount(0);

    await page.getByRole("textbox", { name: "模板名称" }).fill("品牌首屏｜左文右图动态版");
    await openTemplateInspectorPanel(page, "布局");
    await expect(page.getByRole("button", { name: "默认背景：白色" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "布局方式：自然" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("背景令牌", { exact: true })).toHaveCount(0);
    await expect(page.getByText("边框令牌", { exact: true })).toHaveCount(0);
    await openTemplateInspectorPanel(page, "规则");
    await page.getByLabel("版本说明").fill("建立首屏容器、网格与标题槽位");
    const { controls: sizeControls } = await openTemplateSizeControls(page);
    const designWidth = sizeControls.getByRole("spinbutton", { name: "设计宽度" });
    await expect(designWidth).toHaveValue("1920");
    await designWidth.fill("1280");
    await designWidth.press("Enter");
    await expect(page.getByLabel(/画布尺寸 1280 × \d+/)).toBeVisible();
    const { panel: regionCreationPanel } = await openTemplateStructureAddPanel(page);
    await regionCreationPanel.getByRole("button", { name: "添加区域（新增内容区域）" }).click();
    await expect(addTrigger).toHaveAccessibleName("添加模板结构到内容区域 1");
    await expect(regionCreationPanel).toContainText("添加到：");
    await openTemplateInspectorPanel(page, "基本");
    await page.getByRole("textbox", { name: "节点名称" }).fill("首屏内容容器");
    await expect(addTrigger).toHaveAccessibleName("添加模板结构到首屏内容容器");
    const templateStructure = page.getByRole("complementary", { name: "模板结构" });
    await templateStructure.getByRole("treeitem", { name: /品牌首屏｜左文右图动态版 模板/ }).click();
    const { panel: rootAddPanel } = await openTemplateStructureAddPanel(page);
    await rootAddPanel.getByRole("button", { name: "图片槽位 内容槽位" }).click();
    await expect(page.getByText("已自动建立“内容区域 02”，并将槽位放入该区域。", { exact: true }))
      .toBeVisible();
    await expect(templateStructure.getByRole("treeitem", { name: /内容区域 2/ })).toBeVisible();
    await addTrigger.click();
    await templateStructure.getByRole("treeitem", { name: /首屏内容容器/ }).click();
    const { panel: regionAddPanel } = await openTemplateStructureAddPanel(page);
    await regionAddPanel.getByText("布局", { exact: true }).click();
    await expect(regionAddPanel.getByText("排列方式", { exact: true })).toBeVisible();
    await regionAddPanel.getByRole("button", { name: "网格 结构节点" }).click();
    await regionAddPanel.getByRole("button", { name: "标题槽位 内容槽位" }).click();
    await openTemplateInspectorPanel(page, "基本");
    await page.getByRole("textbox", { name: "节点名称" }).fill("首屏主标题");
    await openTemplateInspectorPanel(page, "布局");
    await page.getByRole("button", { name: "文字层级：展示" }).click();
    await page.getByLabel("最大行数").fill("2");
    await openTemplateInspectorPanel(page, "基本");
    await expect(page.getByText(/实际内容.*页面装修中配置/)).toBeVisible();

    const dynamicCanvas = page.frameLocator(".template-editor__viewport-frame");
    const headingOnCanvas = dynamicCanvas.locator('.template-editor__dynamic-canvas-renderer [data-template-node-type="HeadingSlot"]');
    await expect(dynamicCanvas.locator(".hc-dynamic-template")).toHaveAttribute(
      "data-dynamic-template-editor-surface",
      "template-definition",
    );
    await expect(headingOnCanvas).toHaveAttribute("role", "group");
    await expect(headingOnCanvas).toContainText("典藏新作");
    const inlineHeading = headingOnCanvas.locator('[data-template-inline-editor="true"]');
    await expect(inlineHeading).toHaveCount(0);
    const headingNodeId = await headingOnCanvas.getAttribute("data-template-node-id");
    expect(headingNodeId).toMatch(/^node_/);

    const headingTreeItem = page.getByRole("treeitem", { name: /首屏主标题/ });
    await expect(headingTreeItem).toBeVisible();
    await expect(page.getByRole("treeitem", { name: /首屏内容容器/ })).toBeVisible();
    await expect(page.getByRole("treeitem", { name: /网格/ })).toBeVisible();

    await expect(page.locator(".template-editor__canvas-edit-bar")).toHaveCount(0);
    await page.getByRole("button", { name: "预览模板" }).click();
    await expect(page.getByLabel("模板画布编辑状态")).toContainText("只读预览");
    const previewInspector = page.getByLabel("模板预览说明");
    await expect(previewInspector).toContainText("预览期间不可编辑");
    await expect(previewInspector.getByRole("textbox")).toHaveCount(0);
    await page.getByRole("combobox", { name: "预览内容场景" }).selectOption("long-text");
    await expect(headingOnCanvas).toContainText("这是用于验证超长标题");
    await expect(headingOnCanvas).toHaveCSS("outline-style", "none");
    await page.getByRole("button", { name: "退出模板预览" }).click();
    await expect(headingOnCanvas).toContainText("典藏新作");

    await page.locator(".template-editor__toolbar").getByRole("button", { name: /移动端模板布局/ }).click();
    await expect(page.locator(".template-editor__canvas-edit-bar")).toHaveCount(0);
    await expect(page.locator(".template-editor__toolbar").getByRole("button", { name: /移动端模板布局/ }))
      .toHaveAttribute("aria-pressed", "true");
    await headingTreeItem.click();
    await expect(page.locator(".template-editor__toolbar").getByRole("button", { name: /移动端模板布局/ }))
      .toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("complementary", { name: "模板属性", exact: true }))
      .toContainText("移动端");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();
    expect(dynamic.writes[0]).toMatchObject({ method: "POST", pathname: "/api/page-modules/dynamic-templates" });
    expect(dynamic.writes[0].body.versionNote).toBe("建立首屏容器、网格与标题槽位");
    expect(dynamic.writes[0].body.definition.metadata.previewDesktopWidth).toBe(1280);
    expect(dynamic.writes[0].body.definition.nodes[headingNodeId!]?.type).toBe("HeadingSlot");
    const storedNodes = dynamic.writes[0].body.definition.nodes as Record<string, { type: string; name: string; childIds: string[]; slotId?: string }>;
    const containerEntry = Object.entries(storedNodes).find(([, node]) => node.name === "首屏内容容器");
    const gridEntry = Object.entries(storedNodes).find(([, node]) => node.type === "Grid");
    expect(containerEntry?.[1].childIds).toContain(gridEntry?.[0]);
    expect(gridEntry?.[1].childIds).toContain(headingNodeId);
    const headingSlotId = storedNodes[headingNodeId!]?.slotId;
    expect(headingSlotId).toBeTruthy();
    expect(dynamic.writes[0].body.definition.previewContent).toEqual({});
    expect(dynamic.writes[0].body.definition.defaultContent).toEqual({});
    expect(dynamic.writes[0].body.definition.slots[headingSlotId!].desktopRules).toMatchObject({
      fontRole: "display",
      maxLines: 2,
    });
    expect(forbiddenPageWrites).toEqual([]);

    await page.getByRole("button", { name: "发布模板新版本" }).click();
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

    await page.getByRole("treeitem", { name: /品牌首屏｜左文右图动态版 模板/ }).click();
    await openTemplateInspectorPanel(page, "规则");
    await page.getByLabel("版本说明").fill("发布后的下一版草稿");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    const postPublishSave = dynamic.writes.find((write) => write.method === "PATCH");
    expect(postPublishSave?.body.expectedRevision).toBe(2);
    expect(forbiddenPageWrites).toEqual([]);

    await page.getByRole("button", { name: "页面装修" }).click();
    await expect(pageLayer).toBeVisible();
    await openTemplateFromCatalog(page, "品牌首屏｜左文右图动态版");
    await expect(page.frameLocator(".template-editor__viewport-frame").locator(`.template-editor__dynamic-canvas-renderer [data-template-node-id="${headingNodeId}"]`)).toContainText("典藏新作");
    await expect(page.getByRole("treeitem", { name: /首屏主标题/ })).toBeVisible();
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("1920 × 240 图文模板从原子槽位发布到页面实例并保持结构锁定", async ({ page }, testInfo) => {
    testInfo.setTimeout(90_000);
    await page.addInitScript(() => {
      window.localStorage.removeItem("haichuan.dynamic-template-drafts.v1");
    });
    const {
      dynamic,
      pageWrites,
      forbiddenPageWrites,
    } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeEmptyDraft(),
      allowPageWrites: true,
    });

    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建空白模板" }).click();

    const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    await inspector.getByRole("textbox", { name: "模板名称", exact: true }).fill("1920×240 图文横幅");

    const { trigger: sizeTrigger, controls: sizeControls } = await openTemplateSizeControls(page);
    await expect(sizeControls.getByRole("spinbutton", { name: "设计宽度" })).toHaveValue("1920");
    await sizeControls.getByRole("combobox", { name: "模板高度模式" }).selectOption("fixed");
    await sizeControls.getByRole("spinbutton", { name: "模板固定高度" }).fill("240");
    await sizeControls.getByRole("spinbutton", { name: "模板固定高度" }).press("Enter");
    await expect(sizeTrigger).toContainText("桌面端 · 1920 × 240");
    await expect(page.locator("iframe.template-editor__viewport-frame")).toHaveCSS("height", "240px");
    await expect(page.frameLocator("iframe.template-editor__viewport-frame")
      .locator('[data-template-node-type="Section"]'))
      .toHaveCSS("height", "240px");

    await openTemplateInspectorPanel(page, "布局");
    await inspector.getByRole("button", { name: "布局方式：网格" }).click();
    await inspector.getByText("自定义列宽", { exact: true }).click();
    await inspector.getByRole("textbox", { name: "自定义列宽比例" }).fill("3，2");
    await inspector.getByRole("textbox", { name: "自定义列宽比例" }).press("Tab");
    await openTemplateInspectorDisclosure(inspector, "外观与边界");
    await inspector.getByRole("button", { name: "超出边界时：隐藏" }).click();

    const structure = page.getByRole("complementary", { name: "模板结构" });
    await expect(structure).toContainText("这里决定模板由哪些区域、容器和内容槽位组成；层级决定归属，顺序决定布局顺序。");

    const { panel: addPanel } = await openTemplateStructureAddPanel(page);
    await addPanel.getByRole("button", { name: "添加区域（新增内容区域）" }).click();
    await openTemplateInspectorPanel(page, "基本");
    await inspector.getByRole("textbox", { name: "节点名称" }).fill("图片区");
    await openTemplateInspectorPanel(page, "布局");
    await inspector.getByRole("button", { name: "布局方式：弹性" }).click();
    await openTemplateInspectorDisclosure(inspector, "精细排列与尺寸");
    await inspector.getByRole("button", { name: "交叉方向对齐：拉伸" }).click();
    await openTemplateInspectorDisclosure(inspector, "外观与边界");
    await inspector.getByRole("button", { name: "超出边界时：隐藏" }).click();
    const { panel: imageAddPanel } = await openTemplateStructureAddPanel(page);
    await imageAddPanel.getByRole("button", { name: "图片槽位 内容槽位" }).click();
    await inspector.getByRole("button", { name: "宽度策略：自定" }).click();
    await inspector.getByRole("spinbutton", { name: "自定义宽度" }).fill("60");
    await openTemplateInspectorDisclosure(inspector, "精细排列与尺寸");
    await inspector.getByRole("button", { name: "交叉方向对齐：靠后" }).click();
    await expect(page.frameLocator("iframe.template-editor__viewport-frame")
      .locator('[data-template-node-type="ImageSlot"]'))
      .toHaveCSS("align-self", "end");
    await inspector.getByRole("button", { name: "图片比例：自适应" }).click();
    await openTemplateInspectorPanel(page, "规则");
    await expect(inspector.getByRole("switch", { name: "页面可编辑内容" })).toBeChecked();
    await expect(inspector.getByRole("switch", { name: "允许调整位置" })).not.toBeChecked();
    await expect(inspector.getByRole("switch", { name: "允许调整尺寸" })).not.toBeChecked();

    const { panel: textRegionAddPanel } = await openTemplateStructureAddPanel(page);
    await textRegionAddPanel.getByRole("button", { name: /添加区域/ }).click();
    await openTemplateInspectorPanel(page, "基本");
    await inspector.getByRole("textbox", { name: "节点名称" }).fill("文字区");
    await openTemplateInspectorPanel(page, "布局");
    await inspector.getByRole("button", { name: "布局方式：弹性" }).click();
    await inspector.getByRole("button", { name: "排列方向：纵向" }).click();
    await openTemplateInspectorDisclosure(inspector, "精细排列与尺寸");
    await inspector.getByRole("button", { name: "主要方向对齐：居中" }).click();
    const gapField = inspector.locator(".homepage-editor__inspector-field")
      .filter({ has: page.locator("label", { hasText: "间距" }) }).first();
    await gapField.getByRole("spinbutton").fill("24");
    const paddingField = inspector.locator(".homepage-editor__inspector-field")
      .filter({ has: page.locator("label", { hasText: "统一内边距" }) }).first();
    await paddingField.getByRole("spinbutton").fill("16");

    const { panel: titleAddPanel } = await openTemplateStructureAddPanel(page);
    await titleAddPanel.getByRole("button", { name: "标题槽位 内容槽位" }).click();
    await openTemplateInspectorPanel(page, "布局");
    await inspector.getByRole("button", { name: "文字层级：展示" }).click();
    await inspector.getByRole("spinbutton", { name: "最大行数" }).fill("2");
    await openTemplateInspectorPanel(page, "规则");
    await expect(inspector.getByRole("switch", { name: "允许调整位置" })).not.toBeChecked();
    await expect(inspector.getByRole("switch", { name: "允许调整尺寸" })).not.toBeChecked();

    const { panel: descriptionAddPanel } = await openTemplateStructureAddPanel(page);
    await descriptionAddPanel.getByRole("button", { name: "描述槽位 内容槽位" }).click();
    await openTemplateInspectorPanel(page, "布局");
    await inspector.getByRole("button", { name: "文字层级：正文" }).click();
    await inspector.getByRole("spinbutton", { name: "最大行数" }).fill("3");
    const { panel: buttonAddPanel } = await openTemplateStructureAddPanel(page);
    await buttonAddPanel.getByRole("button", { name: "按钮槽位 内容槽位" }).click();

    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();
    expect(dynamic.writes).toHaveLength(1);
    const savedDefinition = dynamic.writes[0].body.definition as Record<string, any>;
    const savedRoot = savedDefinition.nodes[savedDefinition.rootNodeId];
    expect(savedDefinition.metadata.previewDesktopWidth).toBe(1920);
    expect(savedDefinition.metadata.desktopRatio).toBe("8:1");
    expect(savedRoot.responsive.desktop).toMatchObject({
      width: "fill",
      height: { mode: "fixed", value: { value: 240, unit: "px" } },
    });
    expect(savedDefinition.defaultContent).toEqual({});
    expect(savedDefinition.previewContent).toEqual({});
    const slotsByKey = Object.fromEntries(
      Object.values(savedDefinition.slots as Record<string, any>).map((slot: any) => [slot.key, slot]),
    );
    expect(Object.keys(slotsByKey)).toEqual(expect.arrayContaining(["image", "heading", "description", "button"]));
    for (const slotNode of Object.values(savedDefinition.nodes as Record<string, any>)
      .filter((node: any) => node.slotId)) {
      expect(slotNode.instanceEditPolicy?.position ?? false).toBe(false);
      expect(slotNode.instanceEditPolicy?.size ?? false).toBe(false);
    }

    await page.reload();
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible({ timeout: 15_000 });
    await openTemplateFromCatalog(page, "1920×240 图文横幅");
    await openTemplateSizeControls(page);
    await expect(sizeControls.getByRole("spinbutton", { name: "设计宽度" })).toHaveValue("1920");
    await expect(sizeControls.getByRole("spinbutton", { name: "模板固定高度" })).toHaveValue("240");

    await page.getByRole("button", { name: "预览模板" }).click();
    const previewScenario = page.getByRole("combobox", { name: "预览内容场景" });
    await expect(previewScenario).toHaveValue("default");
    await previewScenario.selectOption("long-text");
    const templateCanvas = page.frameLocator("iframe.template-editor__viewport-frame")
      .locator(".template-editor__dynamic-canvas-renderer");
    await expect(templateCanvas)
      .toHaveAttribute("data-preview-scenario", "long-text");
    await previewScenario.selectOption("missing-image");
    await expect(templateCanvas)
      .toHaveAttribute("data-preview-scenario", "missing-image");
    await expect(templateCanvas.getByText("典藏新作", { exact: true })).toBeVisible();
    await expect(templateCanvas.getByText("图片待填写", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "发布模板新版本" }).click();
    await expect(page.getByText("模板 v1 已发布；现有页面仍保持原版本")).toBeVisible();
    const templateId = dynamic.records[0].templateId as string;
    expect(dynamic.versionsByTemplateId.get(templateId)).toHaveLength(1);

    await page.getByRole("button", { name: "页面装修" }).click();
    const addPublished = page.getByRole("button", { name: "添加1920×240 图文横幅版本1" });
    await expect(addPublished).toBeVisible();
    await addPublished.click();
    await expect(page.locator(".homepage-editor__layer-item")).toHaveCount(1);

    const instanceInspector = page.getByRole("region", { name: "模板实例属性" });
    await expect(instanceInspector).toContainText(`固定版本 ${templateId} v1`);
    await instanceInspector.getByRole("textbox", { name: "标题槽位" }).fill("周年典藏系列");
    await instanceInspector.getByRole("textbox", { name: "描述槽位" }).fill("以克制留白呈现珠宝工艺与佩戴光泽。");
    await instanceInspector.getByRole("textbox", { name: "按钮槽位文案" }).fill("查看系列");
    await instanceInspector.getByRole("group", { name: "按钮槽位跳转" })
      .getByRole("button", { name: "页面" }).click();
    await instanceInspector.getByRole("combobox", { name: "站内页面" }).fill("/products");

    await expect(instanceInspector.getByText(/其他模板内容/)).toHaveCount(0);
    const imageField = instanceInspector.locator(`[data-slot-id="${slotsByKey.image.slotId}"]`);
    await imageField.getByRole("button", { name: /粘贴图片链接/ }).click();
    const imageUrlInput = imageField.getByPlaceholder("输入图片 URL；清空后确认 = 删除图片");
    await imageUrlInput.fill("/svg/template-hero.svg");
    await imageUrlInput.press("Enter");

    await instanceInspector.getByRole("group", { name: "页面实例属性范围" })
      .getByRole("button", { name: "标题槽位", exact: true }).click();
    await expect(instanceInspector.getByText("水平偏移", { exact: true })).toHaveCount(0);
    await expect(instanceInspector.getByText("垂直偏移", { exact: true })).toHaveCount(0);
    await expect(instanceInspector.getByText("区域宽度", { exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    await expect(page.getByText("页面草稿已保存", { exact: true }).last()).toBeVisible();
    await page.getByRole("button", { name: "发布到前台网站" }).click();
    await expect(page.getByText("店铺首页已发布，前台页面将立即读取最新版本")).toBeVisible();

    const savedPage = pageWrites.filter((write) => (
      write.method === "PUT" && write.pathname === "/api/page-modules/document"
    )).at(-1);
    const publishedPage = pageWrites.find((write) => write.pathname.endsWith("/publish"));
    expect(savedPage).toBeTruthy();
    expect(publishedPage).toBeTruthy();
    const instance = savedPage!.body.puckData.content[0];
    expect(instance.type).toBe("动态模板实例");
    expect(instance.props).toMatchObject({
      templateId,
      templateVersion: 1,
      layoutOverridesByNodeId: {},
      hiddenSlotIds: [],
      isVisible: true,
    });
    expect(instance.props.nodes).toBeUndefined();
    expect(instance.props.slots).toBeUndefined();
    expect(instance.props.contentBySlotId).toMatchObject({
      [slotsByKey.image.slotId]: { src: "/svg/template-hero.svg" },
      [slotsByKey.heading.slotId]: "周年典藏系列",
      [slotsByKey.description.slotId]: "以克制留白呈现珠宝工艺与佩戴光泽。",
      [slotsByKey.button.slotId]: {
        label: "查看系列",
        targetType: "page",
        pagePath: "/products",
      },
    });
    expect(JSON.stringify(instance.props.contentBySlotId)).not.toContain("示例");
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("V2 母模板复用布局控件，但不暴露页面真实媒体编辑", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem("haichuan.dynamic-template-drafts.v1");
    });
    const { dynamic, forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeTemplateWorkspaceLayerDraft(),
    });
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建空白模板" }).click();

    const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    await expect(inspector.getByRole("region", { name: "模板属性功能区" })).toBeVisible();
    await expect(inspector.getByRole("tab")).toHaveCount(0);
    await expect(inspector.locator("[data-template-inspector-section]")).toHaveCount(3);
    await expect(inspector.getByRole("group", { name: "模板信息" })).toBeVisible();
    await expect(inspector.getByRole("group", { name: "模板尺寸" })).toBeVisible();
    await expect(inspector.getByRole("group", { name: "发布设置" })).toBeVisible();
    await expect(inspector.locator(".template-editor__inspector-context")).toHaveCount(0);
    await expect(inspector.locator("details, summary")).toHaveCount(0);
    await expect(inspector.getByText("模板基本信息", { exact: true })).toBeVisible();
    await expect(inspector.getByText("templateId", { exact: true })).toHaveCount(0);
    await expect(inspector.getByText("尺寸与响应式", { exact: true })).toBeVisible();
    await expect(inspector.getByText("桌面端和移动端分别设置，预览与公开展示保持一致", { exact: true })).toBeVisible();
    await expect(inspector.getByText(/Runtime|Canvas/)).toHaveCount(0);
    await expect(inspector.locator(".template-editor__publish-settings-section")).toBeVisible();
    await expect(inspector.getByText("发布检查", { exact: true })).toBeVisible();
    const recommendedPages = inspector.getByRole("combobox", { name: "推荐页面" });
    await recommendedPages.click();
    await recommendedPages.fill("关于海川");
    await recommendedPages.press("Enter");
    await page.keyboard.press("Escape");
    await expect(recommendedPages.locator("xpath=../../..")).toContainText("关于海川");
    const sizeTrigger = page.getByRole("button", { name: /^模板尺寸：桌面端/ });
    await expect(sizeTrigger).toContainText("1920 × 随内容");
    await expect(sizeTrigger).toHaveAttribute("aria-expanded", "false");
    const { controls: sizeControls } = await openTemplateSizeControls(page);
    await expect(sizeControls.getByRole("spinbutton", { name: "设计宽度" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sizeTrigger).toBeFocused();
    await expect(sizeControls).toBeHidden();
    const { panel: addPanel } = await openTemplateStructureAddPanel(page);
    await addPanel.getByRole("button", { name: "添加区域（新增内容区域）" }).click();
    await addPanel.getByRole("button", { name: "图片槽位 内容槽位" }).click();

    const structure = page.getByRole("complementary", { name: "模板结构" });
    const slotOperations = structure.getByRole("button", { name: "图片槽位节点操作" });
    await slotOperations.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("menuitem", { name: "重命名槽位" }).click();
    const structureName = structure.getByRole("textbox", { name: "结构名称" });
    await structureName.fill("新".repeat(110));
    await expect(structureName).toHaveValue("新".repeat(100));
    await structureName.fill("主视觉图片槽位");
    await structureName.press("Enter");
    await expect(structure.getByRole("treeitem", { name: /主视觉图片槽位/ })).toBeVisible();

    await expect(inspector.getByRole("tab")).toHaveCount(0);
    await expect(inspector.getByRole("group", { name: "槽位职责" })).toBeVisible();
    await expect(inspector.getByRole("group", { name: "显示样式" })).toBeVisible();
    await expect(inspector.getByRole("group", { name: "页面可编辑" })).toBeVisible();
    await expect(inspector.locator("[data-media-field]")).toHaveCount(0);
    await expect(inspector.getByText(/nodeId|slotId|slot key|内部对象标识|页面实例|模板合同|节点树/)).toHaveCount(0);
    await expect(inspector.getByRole("textbox", { name: "槽位名称" })).toBeVisible();
    await expect(inspector.getByText(/实际内容.*页面装修中配置/)).toBeVisible();
    await expect(inspector.getByText("系统预设 · 不可修改", { exact: true })).toHaveCount(0);
    await expect(inspector.getByText(/nodeId|slotId|slot key|内部对象标识|页面实例|模板合同|节点树/)).toHaveCount(0);
    await expect(inspector.getByRole("switch", { name: "锁定位置、尺寸和层级" })).toBeVisible();
    await expect(inspector.getByRole("switch", { name: "页面可编辑内容" })).toBeVisible();
    await expect(inspector.getByRole("spinbutton", { name: "建议图片宽" })).toBeVisible();
    await expect(inspector.getByRole("spinbutton", { name: "最大字数" })).toHaveCount(0);
    await expect(inspector.getByRole("textbox", { name: "内容字段标识" })).toHaveCount(0);
    await expect(inspector.getByText("空内容处理", { exact: true })).toBeVisible();
    await expect(inspector.locator('[data-workspace-field-control="switch"]').first())
      .toHaveAttribute("data-workspace-field-shared", "true");
    await expect(inspector.locator('[data-image-focus-field]'))
      .toHaveAttribute("data-workspace-field-control", "image-focus");
    const imageSlot = page.frameLocator(".template-editor__viewport-frame")
      .locator('[data-template-node-type="ImageSlot"]');
    await expect(inspector.getByRole("button", { name: "图片比例：16:9" }))
      .toHaveAttribute("aria-pressed", "true");
    await expect(imageSlot).toHaveCSS("aspect-ratio", "16 / 9");
    const viewportFrame = page.locator(".template-editor__viewport-frame");
    const wideImageBox = await imageSlot.boundingBox();
    const wideFrameHeight = await viewportFrame.evaluate((frame) => frame.getBoundingClientRect().height);
    await inspector.getByRole("button", { name: "图片比例：1:1" }).click();
    await expect(imageSlot).toHaveCSS("aspect-ratio", "1 / 1");
    const squareImageBox = await imageSlot.boundingBox();
    const squareFrameHeight = await viewportFrame.evaluate((frame) => frame.getBoundingClientRect().height);
    expect(wideImageBox).not.toBeNull();
    expect(squareImageBox).not.toBeNull();
    expect(squareImageBox!.height).toBeGreaterThan(wideImageBox!.height);
    expect(squareFrameHeight).toBeGreaterThan(wideFrameHeight);
    await page.getByRole("button", { name: "撤销", exact: true }).click();
    await expect(imageSlot).toHaveCSS("aspect-ratio", "16 / 9");
    await expect.poll(() => viewportFrame.evaluate((frame) => frame.getBoundingClientRect().height))
      .toBeLessThan(squareFrameHeight);
    await inspector.getByRole("group", { name: "画面焦点 · 桌面端常用位置" })
      .getByRole("button", { name: "左上", exact: true })
      .click();
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    const definition = dynamic.writes.at(-1)?.body.definition;
    const imageNode = Object.values(definition.nodes as Record<string, { type: string; slotId?: string }>)
      .find((node) => node.type === "ImageSlot");
    expect(imageNode?.slotId).toBeTruthy();
    expect(definition.slots[imageNode!.slotId!].desktopRules.objectPosition).toBe("left top");
    expect(definition.defaultContent).toEqual({});
    expect(definition.previewContent).toEqual({});
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("模板工作区只生成占位预览，真实内容层始终保持为空", async ({ page }) => {
    const { dynamic, forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeTemplateWorkspaceLayerDraft(),
    });
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建空白模板" }).click();
    const { panel: addPanel } = await openTemplateStructureAddPanel(page);
    await addPanel.getByRole("button", { name: "添加区域（新增内容区域）" }).click();
    await addPanel.getByRole("button", { name: "描述槽位 内容槽位" }).click();
    const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    await openTemplateInspectorPanel(page, "规则");
    await expect(inspector.getByRole("spinbutton", { name: "最大字数" })).toBeVisible();
    await expect(inspector.getByRole("spinbutton", { name: "建议图片宽" })).toHaveCount(0);
    await expect(inspector.getByRole("textbox", { name: "内容字段标识" })).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "预览示例" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /设为新实例默认|将全部样例设为默认/ })).toHaveCount(0);
    await openTemplateInspectorPanel(page, "基本");
    await expect(page.getByText(/实际内容.*页面装修中配置/)).toBeVisible();
    const canvas = page.frameLocator(".template-editor__viewport-frame");
    await expect(canvas.locator('[data-template-node-type="TextSlot"]'))
      .toHaveAttribute("data-template-node-label", "描述槽位");
    await expect(canvas.locator('[data-template-node-type="TextSlot"]'))
      .toContainText("以克制线条呈现珠宝的光泽、比例与细节。");
    await expect(canvas.locator('[data-template-inline-editor="true"]')).toHaveCount(0);
    const objectToolbar = page.locator(".template-editor__body")
      .getByRole("toolbar", { name: /描述槽位快捷操作/ });
    await expect(objectToolbar).toBeVisible();
    await expect(objectToolbar.getByRole("button", { name: "复制节点" })).toBeVisible();
    await expect(objectToolbar.getByRole("button", { name: "隐藏节点" })).toBeVisible();
    await expect(objectToolbar.getByRole("button", { name: "删除节点" })).toBeVisible();
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    const firstDefinition = dynamic.writes.at(-1)?.body.definition;
    const textSlotId = Object.values(firstDefinition.nodes as Record<string, { type: string; slotId?: string }>)
      .find((node) => node.type === "TextSlot")?.slotId;
    expect(textSlotId).toBeTruthy();
    expect(firstDefinition.previewContent).toEqual({});
    expect(firstDefinition.defaultContent).toEqual({});
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("空白母模板可一次建立主图加双图构图并用一次撤销完整移除", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem("haichuan.dynamic-template-drafts.v1");
    });
    const { forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeTemplateWorkspaceLayerDraft(),
    });
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建空白模板" }).click();

    const structure = page.getByRole("complementary", { name: "模板结构" });
    const health = structure.getByRole("region", { name: "模板结构问题" });
    const undo = page.getByRole("button", { name: "撤销", exact: true });
    const redo = page.getByRole("button", { name: "重做", exact: true });
    await expect(health).toContainText("2 项待处理");
    await expect(health.getByRole("button", { name: "定位" })).toHaveCount(2);
    await expect(undo).toBeDisabled();

    const frame = page.frameLocator(".template-editor__viewport-frame");
    const emptyState = frame.getByRole("status");
    await expect(emptyState).toContainText("从一个清晰构图开始");
    await expect(emptyState).toContainText("主图 + 双图");

    const { panel: addPanel } = await openTemplateStructureAddPanel(page);
    await addPanel.getByText("组合模块", { exact: true }).click();
    const compositionButton = addPanel.getByRole("button", { name: "建立主图加双图布局" });
    await expect(compositionButton).toContainText("建立完整模板骨架");
    await compositionButton.click();
    await expect(page.getByText("已建立“三图主次叙事”模板骨架并补全构图信息：桌面均为 4:3，手机主图 4:3、双图 1:1 并排。"))
      .toBeVisible();
    await expect(health).toHaveCount(0);
    await expect(structure.locator(".template-editor__template-summary")).toContainText("结构完整");
    await expect(emptyState).toHaveCount(0);
    await expect(structure.getByRole("treeitem", { name: /三图展示区域 01/ })).toBeVisible();
    await expect(structure.getByRole("treeitem", { name: /主图 \+ 双图布局/ })).toBeVisible();
    await expect(structure.getByRole("treeitem", { name: /主图 图片槽位 必填/ })).toBeVisible();
    await expect(structure.getByRole("treeitem", { name: /双图区域/ })).toBeVisible();
    await expect(structure.getByRole("treeitem", { name: /细节图 01 图片槽位 必填/ })).toBeVisible();
    await expect(structure.getByRole("treeitem", { name: /细节图 02 图片槽位 必填/ })).toBeVisible();

    const grid = frame.locator('[data-template-node-label="主图 + 双图布局"]');
    const mainImage = frame.locator('[data-template-node-label="主图"]');
    const detailColumn = frame.locator('[data-template-node-label="双图区域"]');
    const detailOne = frame.locator('[data-template-node-label="细节图 01"]');
    const detailTwo = frame.locator('[data-template-node-label="细节图 02"]');
    await expect(grid).toHaveCSS("display", "grid");
    const desktopMainBox = await mainImage.boundingBox();
    const desktopDetailsBox = await detailColumn.boundingBox();
    const desktopDetailOneBox = await detailOne.boundingBox();
    const desktopDetailTwoBox = await detailTwo.boundingBox();
    expect(desktopMainBox).not.toBeNull();
    expect(desktopDetailsBox).not.toBeNull();
    expect(desktopDetailOneBox).not.toBeNull();
    expect(desktopDetailTwoBox).not.toBeNull();
    expect(desktopMainBox!.width / desktopDetailsBox!.width).toBeGreaterThan(1.9);
    expect(desktopMainBox!.x).toBeLessThan(desktopDetailsBox!.x);
    expect(desktopDetailOneBox!.y).toBeLessThan(desktopDetailTwoBox!.y);

    const slotInspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    await structure.getByRole("treeitem", { name: /主图 图片槽位 必填/ }).click();
    await expect(slotInspector.getByRole("button", { name: "图片比例：4:3" }))
      .toHaveAttribute("aria-pressed", "true");
    await expect(slotInspector.getByRole("group", { name: "图片比例自定义数值" })).toHaveCount(0);
    const requiredLayoutHide = slotInspector.getByRole("button", {
      name: "布局方式：隐藏（必填槽位不能隐藏）",
    });
    await expect(requiredLayoutHide).toBeDisabled();
    await expect(requiredLayoutHide).toHaveAttribute("title", "必填槽位不能隐藏");
    await expect(slotInspector.getByText(
      "必填槽位必须在桌面端和移动端保持显示；如需隐藏，先在“页面可编辑”中取消必填。",
      { exact: true },
    )).toBeVisible();
    await expect(slotInspector.getByRole("switch", { name: "页面必须填写" })).toBeChecked();
    const pageEditableSwitch = slotInspector.getByRole("switch", { name: "页面可编辑内容" });
    await expect(pageEditableSwitch).toBeChecked();
    await expect(pageEditableSwitch).toBeDisabled();
    await expect(slotInspector.getByText(
      "必填槽位必须允许页面填写；取消必填后才可关闭。",
      { exact: true },
    )).toBeVisible();
    const pageHideSwitch = slotInspector.getByRole("switch", { name: "页面可隐藏" });
    await expect(pageHideSwitch).not.toBeChecked();
    await expect(pageHideSwitch).toBeDisabled();
    await expect(slotInspector.getByText(
      "必填槽位不能在页面装修中隐藏；取消必填后才可开启。",
      { exact: true },
    )).toBeVisible();
    await expect(slotInspector.getByText("页面发布前必须填写", { exact: true })).toBeVisible();
    await expect(slotInspector.getByRole("spinbutton", { name: "建议图片宽" })).toHaveValue("2400");
    await expect(slotInspector.getByRole("spinbutton", { name: "建议图片高" })).toHaveValue("1800");
    const requiredHideAction = structure.getByRole("button", { name: "主图隐藏（必填槽位不可用）" });
    await expect(requiredHideAction).toBeDisabled();
    await expect(requiredHideAction).toHaveAttribute("title", "必填槽位不能隐藏");
    await structure.getByRole("button", { name: "主图节点操作" }).click();
    await expect(page.getByRole("menuitem", { name: "隐藏（必填槽位不可用）" })).toBeDisabled();
    await expect(page.getByRole("menuitem", { name: "删除槽位（必填槽位不可用）" })).toBeDisabled();
    await page.keyboard.press("Escape");
    const mainCanvasToolbar = page.locator(".template-editor__body")
      .getByRole("toolbar", { name: "主图快捷操作" });
    const canvasHideAction = mainCanvasToolbar.getByRole("button", { name: "隐藏节点（必填槽位不可用）" });
    const canvasDeleteAction = mainCanvasToolbar.getByRole("button", { name: "删除节点（必填槽位不可用）" });
    await expect(canvasHideAction).toBeDisabled();
    await expect(canvasHideAction).toHaveAttribute("title", "必填槽位不能隐藏");
    await expect(canvasDeleteAction).toBeDisabled();
    await expect(canvasDeleteAction).toHaveAttribute("title", "必填槽位不能删除");

    await page.getByRole("button", { name: /移动端模板布局/ }).click();
    await expect(slotInspector.getByRole("button", { name: "图片比例：4:3" }))
      .toHaveAttribute("aria-pressed", "true");
    await expect(grid).toHaveCSS("display", "flex");
    await expect(grid).toHaveCSS("flex-direction", "column");
    await expect(detailColumn).toHaveCSS("display", "grid");
    const mobileMainBox = await mainImage.boundingBox();
    const mobileDetailOneBox = await detailOne.boundingBox();
    const mobileDetailTwoBox = await detailTwo.boundingBox();
    expect(mobileMainBox).not.toBeNull();
    expect(mobileDetailOneBox).not.toBeNull();
    expect(mobileDetailTwoBox).not.toBeNull();
    expect(mobileMainBox!.width / mobileDetailOneBox!.width).toBeGreaterThan(1.9);
    expect(mobileMainBox!.y).toBeLessThan(mobileDetailOneBox!.y);
    expect(Math.abs(mobileDetailOneBox!.y - mobileDetailTwoBox!.y)).toBeLessThanOrEqual(1);
    expect(mobileDetailOneBox!.x).toBeLessThan(mobileDetailTwoBox!.x);
    await structure.getByRole("treeitem", { name: /细节图 01 图片槽位 必填/ }).click();
    await expect(slotInspector.getByRole("button", { name: "图片比例：1:1" }))
      .toHaveAttribute("aria-pressed", "true");
    await expect(slotInspector.getByRole("spinbutton", { name: "建议图片宽" })).toHaveValue("1600");
    await expect(slotInspector.getByRole("spinbutton", { name: "建议图片高" })).toHaveValue("1600");

    await structure.getByRole("treeitem", { name: /三图主次叙事 模板/ }).click();
    const basicInfo = await openTemplateBasicInfo(page);
    await expect(basicInfo.getByRole("textbox", { name: "模板名称", exact: true }))
      .toHaveValue("三图主次叙事");
    await expect(basicInfo.getByRole("textbox", { name: "分类", exact: true }))
      .toHaveValue("品牌展示");
    await expect(basicInfo.getByRole("textbox", { name: "用途", exact: true }))
      .toHaveValue("主视觉与细节并置");
    await expect(basicInfo.getByRole("textbox", { name: "构图类型", exact: true }))
      .toHaveValue("一大两小响应式构图");
    await expect(basicInfo.getByRole("textbox", { name: "模板说明", exact: true }))
      .toHaveValue("桌面端以主次分栏呈现三张 4:3 图片；移动端主图 4:3，双图 1:1 并排。");
    await expect(basicInfo.getByRole("button", { name: "页面视觉职责：重点区" }))
      .toHaveAttribute("aria-pressed", "true");

    await expect(undo).toBeEnabled();
    await undo.click();
    await expect(health).toContainText("2 项待处理");
    await expect(emptyState).toBeVisible();
    await expect(frame.locator('[data-template-node-label="主图 + 双图布局"]')).toHaveCount(0);
    await expect((await openTemplateBasicInfo(page)).getByRole("textbox", { name: "模板名称", exact: true }))
      .toHaveValue("未命名模板");
    await expect(undo).toBeDisabled();
    await expect(redo).toBeEnabled();
    await redo.click();
    await expect(health).toHaveCount(0);
    await expect(structure.locator(".template-editor__template-summary")).toContainText("结构完整");
    await expect(frame.locator('[data-template-node-label="主图 + 双图布局"]')).toBeVisible();
    await expect((await openTemplateBasicInfo(page)).getByRole("textbox", { name: "模板名称", exact: true }))
      .toHaveValue("三图主次叙事");

    await page.getByRole("button", { name: /桌面端模板布局/ }).click();
    await structure.getByRole("treeitem", { name: /主图 \+ 双图布局/ }).click();
    const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    const leftWidePreset = inspector.getByRole("button", { name: "列宽比例：左侧更宽 2:1" });
    await expect(leftWidePreset).toHaveAttribute("aria-pressed", "true");
    const gridColumnsGroup = inspector.getByRole("group", { name: "常用列宽比例" });
    const widthStrategyGroup = inspector.getByRole("group", { name: "宽度策略" });
    await expect(gridColumnsGroup).toBeVisible();
    const gridColumnsBox = await gridColumnsGroup.boundingBox();
    const widthStrategyBox = await widthStrategyGroup.boundingBox();
    expect(gridColumnsBox).not.toBeNull();
    expect(widthStrategyBox).not.toBeNull();
    expect(gridColumnsBox!.y).toBeLessThan(widthStrategyBox!.y);
    const preciseDisclosure = inspector.getByRole("button", { name: /^精细排列与尺寸 · 已设置 1 项/ });
    const appearanceDisclosure = inspector.getByRole("button", { name: "外观与边界", exact: true });
    await expect(preciseDisclosure).toHaveAttribute("aria-expanded", "false");
    await expect(appearanceDisclosure).toHaveAttribute("aria-expanded", "false");
    await expect(inspector.getByRole("group", { name: "交叉方向对齐" })).toBeHidden();
    await preciseDisclosure.click();
    await expect(inspector.getByRole("button", { name: "交叉方向对齐：居中" }))
      .toHaveAttribute("aria-pressed", "true");
    await appearanceDisclosure.click();
    await expect(inspector.getByRole("button", { name: "背景样式：透明" }))
      .toHaveAttribute("aria-pressed", "true");
    await inspector.getByText("自定义列宽", { exact: true }).click();
    const customColumns = inspector.getByRole("textbox", { name: "自定义列宽比例" });
    await customColumns.fill("1，1");
    await customColumns.blur();
    await expect(inspector.getByRole("button", { name: "列宽比例：均分双列 1:1" }))
      .toHaveAttribute("aria-pressed", "true");
    const equalMainBox = await mainImage.boundingBox();
    const equalDetailsBox = await detailColumn.boundingBox();
    expect(equalMainBox).not.toBeNull();
    expect(equalDetailsBox).not.toBeNull();
    expect(Math.abs(equalMainBox!.width / equalDetailsBox!.width - 1)).toBeLessThan(0.05);
    await customColumns.fill("2，0");
    await customColumns.blur();
    await expect(inspector.getByRole("alert")).toHaveText("请输入 1–12 个正数，例如 2，1。");
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("主图加双图快捷构图保留已填写的模板资料", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem("haichuan.dynamic-template-drafts.v1");
    });
    const { forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeTemplateWorkspaceLayerDraft(),
    });
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建空白模板" }).click();

    const basicInfo = await openTemplateBasicInfo(page);
    await basicInfo.getByRole("textbox", { name: "模板名称", exact: true }).fill("自定义三图模板");
    await basicInfo.getByRole("textbox", { name: "分类", exact: true }).fill("自定义分类");
    await basicInfo.getByRole("textbox", { name: "用途", exact: true }).fill("自定义用途");
    await basicInfo.getByRole("textbox", { name: "构图类型", exact: true }).fill("自定义构图");
    await basicInfo.getByRole("textbox", { name: "模板说明", exact: true }).fill("保留这段自定义说明");
    await basicInfo.getByRole("button", { name: "页面视觉职责：主舞台" }).click();

    const structure = page.getByRole("complementary", { name: "模板结构" });
    const { panel: addPanel } = await openTemplateStructureAddPanel(page);
    await addPanel.getByText("组合模块", { exact: true }).click();
    await addPanel.getByRole("button", { name: "建立主图加双图布局" }).click();
    await expect(page.getByText("已建立“自定义三图模板”模板骨架并补全构图信息：桌面均为 4:3，手机主图 4:3、双图 1:1 并排。"))
      .toBeVisible();
    await structure.getByRole("treeitem", { name: /自定义三图模板 模板/ }).click();
    const updatedBasicInfo = await openTemplateBasicInfo(page);
    await expect(updatedBasicInfo.getByRole("textbox", { name: "模板名称", exact: true }))
      .toHaveValue("自定义三图模板");
    await expect(updatedBasicInfo.getByRole("textbox", { name: "分类", exact: true }))
      .toHaveValue("自定义分类");
    await expect(updatedBasicInfo.getByRole("textbox", { name: "用途", exact: true }))
      .toHaveValue("自定义用途");
    await expect(updatedBasicInfo.getByRole("textbox", { name: "构图类型", exact: true }))
      .toHaveValue("自定义构图");
    await expect(updatedBasicInfo.getByRole("textbox", { name: "模板说明", exact: true }))
      .toHaveValue("保留这段自定义说明");
    await expect(updatedBasicInfo.getByRole("button", { name: "页面视觉职责：主舞台" }))
      .toHaveAttribute("aria-pressed", "true");
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("隐藏的必填槽位可从结构问题中直接恢复", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem("haichuan.dynamic-template-drafts.v1");
    });
    const { forbiddenPageWrites } = await openWorkspaceShell(page, {
      draft: makeTemplateWorkspaceLayerDraft(),
    });
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建空白模板" }).click();
    const structure = page.getByRole("complementary", { name: "模板结构" });
    const { panel: addPanel } = await openTemplateStructureAddPanel(page);
    await addPanel.getByText("组合模块", { exact: true }).click();
    await addPanel.getByRole("button", { name: "建立主图加双图布局" }).click();
    await structure.getByRole("treeitem", { name: /主图 图片槽位 必填/ }).click();

    const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    const requiredSwitch = inspector.getByRole("switch", { name: "页面必须填写" });
    await requiredSwitch.click();
    await structure.getByRole("button", { name: "主图隐藏" }).click();
    await requiredSwitch.click();

    const health = structure.getByRole("region", { name: "模板结构问题" });
    await expect(health).toContainText("1 项待处理");
    const issue = health.getByRole("listitem").filter({ hasText: "必填槽位“主图”已隐藏" });
    await expect(issue.getByRole("button", { name: "修复" })).toBeVisible();
    await issue.getByRole("button", { name: "修复" }).click();

    await expect(health).toHaveCount(0);
    await expect(structure.locator(".template-editor__template-summary")).toContainText("结构完整");
    await expect(structure.getByRole("treeitem", { name: /主图 图片槽位 必填/ }))
      .not.toHaveAccessibleName(/已隐藏/);
    await expect(page.getByText("必填槽位已恢复显示。", { exact: true })).toBeVisible();
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("按设备隐藏的必填槽位可从结构问题中恢复到对应设备", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem("haichuan.dynamic-template-drafts.v1");
    });
    const { forbiddenPageWrites } = await openWorkspaceShell(page, {
      draft: makeTemplateWorkspaceLayerDraft(),
    });
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建空白模板" }).click();
    const structure = page.getByRole("complementary", { name: "模板结构" });
    const { panel: addPanel } = await openTemplateStructureAddPanel(page);
    await addPanel.getByText("组合模块", { exact: true }).click();
    await addPanel.getByRole("button", { name: "建立主图加双图布局" }).click();
    await structure.getByRole("treeitem", { name: /主图 图片槽位 必填/ }).click();

    const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    const requiredSwitch = inspector.getByRole("switch", { name: "页面必须填写" });
    await requiredSwitch.click();
    const pageEditableSwitch = inspector.getByRole("switch", { name: "页面可编辑内容" });
    await expect(pageEditableSwitch).toBeEnabled();
    await pageEditableSwitch.click();
    await expect(pageEditableSwitch).not.toBeChecked();
    const pageHideSwitch = inspector.getByRole("switch", { name: "页面可隐藏" });
    await expect(pageHideSwitch).toBeEnabled();
    await pageHideSwitch.click();
    await expect(pageHideSwitch).toBeChecked();
    await inspector.getByRole("button", { name: "布局方式：隐藏" }).click();
    await requiredSwitch.click();
    await expect(pageEditableSwitch).toBeChecked();
    await expect(pageEditableSwitch).toBeDisabled();
    await expect(pageHideSwitch).not.toBeChecked();
    await expect(pageHideSwitch).toBeDisabled();

    const health = structure.getByRole("region", { name: "模板结构问题" });
    await expect(health).toContainText("1 项待处理");
    const issue = health.getByRole("listitem").filter({
      hasText: "必填槽位“主图”在桌面端布局中已隐藏",
    });
    await issue.getByRole("button", { name: "修复" }).click();

    await expect(health).toHaveCount(0);
    await expect(structure.locator(".template-editor__template-summary")).toContainText("结构完整");
    await expect(inspector.getByRole("button", { name: "布局方式：自然" }))
      .toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("必填槽位已恢复为桌面端显示。", { exact: true })).toBeVisible();
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("成熟母模板的画布槽位可直接拖拽并写回当前模板定义", async ({ page }) => {
    const { dynamic, forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeTemplateWorkspaceLayerDraft(),
    });
    await openTemplateFromCatalog(page, "双图文");

    const structure = page.getByRole("complementary", { name: "模板结构" });
    await expect(structure.getByRole("treeitem", { name: /双图文 模板/ })).toBeVisible();
    await expect(structure.getByRole("treeitem", { name: /主海报/ })).toBeVisible();
    await expect(structure.getByRole("treeitem", { name: /细节图/ })).toBeVisible();
    await expect(structure.getByRole("treeitem", { name: /标题与描述文字/ })).toBeVisible();
    await expect(structure.getByRole("treeitem", { name: /行动入口/ })).toBeVisible();
    const addTrigger = structure.getByRole("button", { name: /^添加模板结构到/ });
    await expect(addTrigger).toBeVisible();
    const { panel: addPanel } = await openTemplateStructureAddPanel(page);
    await expect(addPanel.getByRole("button", { name: "添加区域（新增内容区域）" })).toBeVisible();
    await expect(addPanel.getByRole("button", { name: "图片槽位 内容槽位" })).toBeVisible();
    await expect(addPanel.getByText("布局", { exact: true })).toBeVisible();
    await addTrigger.click();
    await expect(structure).toContainText("系统必填内容受保护 · 可新增区域和槽位");

    const canvas = page.frameLocator(".template-editor__viewport-frame");
    const contractFrame = canvas.locator('[data-content-template-contract="doublePoster"]').first();
    await expect(contractFrame).toBeVisible();
    const mainImage = contractFrame.locator('[data-content-role="mainImage"]:visible').first();
    const readMainImageRect = () => mainImage.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const frame = element.closest<HTMLElement>("[data-content-template-contract]")!
        .getBoundingClientRect();
      return { x: rect.left - frame.left, y: rect.top - frame.top, width: rect.width, height: rect.height };
    });
    const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    const matureTreeNode = structure.getByRole("treeitem", { name: /^响应式区域/ });
    await matureTreeNode.click();
    const lockSwitch = inspector.getByRole("switch", { name: "锁定位置、尺寸和层级" });
    await lockSwitch.click();
    await expect(lockSwitch).toHaveAttribute("aria-checked", "true");

    await page.getByRole("treeitem", { name: /主海报/ }).click();
    const overlayRoot = page.locator('[data-template-editor-overlay-root="template-definition"]');
    const selectionBox = overlayRoot.locator('[data-overlay-selection-for$=":mainImage"]');
    await expect(overlayRoot).toHaveCount(1);
    await expect(selectionBox).toHaveCount(1);
    await expect(selectionBox).toBeVisible();
    await expect(selectionBox.locator(".template-editor__editable-overlay-move, .template-editor__editable-overlay-resize"))
      .toHaveCount(0);
    await expect(contractFrame.locator([
      "[data-hc-editor-overlay]",
      "[data-hc-keyboard-node]",
      "[data-editor-block-id]",
      "[data-visual-selected-node]",
      "[data-visual-editor-mode]",
      "style[data-hc-visual-selection]",
    ].join(","))).toHaveCount(0);

    const lockedBefore = await readMainImageRect();
    const lockedPageBox = await mainImage.boundingBox();
    if (!lockedPageBox) throw new Error("双图文主海报槽位没有可验证尺寸");
    await page.mouse.move(lockedPageBox.x + lockedPageBox.width / 2, lockedPageBox.y + lockedPageBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(lockedPageBox.x + lockedPageBox.width / 2 + 36, lockedPageBox.y + lockedPageBox.height / 2 + 18, { steps: 4 });
    await page.mouse.up();
    const lockedAfter = await readMainImageRect();
    expect(lockedAfter.x).toBeCloseTo(lockedBefore.x, 1);
    expect(lockedAfter.y).toBeCloseTo(lockedBefore.y, 1);

    await matureTreeNode.click();
    await lockSwitch.click();
    await expect(lockSwitch).toHaveAttribute("aria-checked", "false");
    await page.getByRole("treeitem", { name: /主海报/ }).click();
    await expect(selectionBox).toBeVisible();
    const moveControl = selectionBox.locator(".template-editor__editable-overlay-move");
    await expect(moveControl).toBeVisible();
    await moveControl.focus();
    const before = await readMainImageRect();
    await moveControl.press("Shift+ArrowRight");
    await expect.poll(async () => (await readMainImageRect()).x)
      .toBeGreaterThan(before.x + 1);

    const resizeHandle = selectionBox
      .locator('.template-editor__editable-overlay-resize[data-resize-direction="e"]');
    await resizeHandle.focus();
    const widthBeforeResize = (await readMainImageRect()).width;
    await resizeHandle.press("Shift+ArrowRight");
    await expect.poll(async () => (await readMainImageRect()).width)
      .toBeGreaterThan(widthBeforeResize + 1);

    await expect(canvas.locator('[data-template-node-type="DoublePosterTemplate"]'))
      .not.toHaveAttribute("data-template-selected-contract-role", /.*/);
    await expect(page.getByRole("treeitem", { name: /主海报/ })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("complementary", { name: "模板属性", exact: true }))
      .toContainText("主海报");
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();
    const savedDefinition = dynamic.writes.at(-1)?.body.definition as Record<string, any>;
    const matureNode = Object.values(savedDefinition.nodes as Record<string, any>)
      .find((candidate: any) => candidate.type === "DoublePosterTemplate");
    const savedMainRect = matureNode?.props?.contentTemplateLayoutData?.nodes?.mainImage?.rectByViewport?.desktop;
    expect(savedMainRect)
      .toMatchObject({
        x: expect.any(Number),
        y: expect.any(Number),
        width: expect.any(Number),
        height: expect.any(Number),
      });
    expect(savedDefinition.defaultContent).toEqual({});
    expect(savedDefinition.previewContent).toEqual({});
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("单品展示连续调整商品区域后保持位置并写回同一模板定义", async ({ page }) => {
    const { dynamic, forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeTemplateWorkspaceLayerDraft(),
    });
    await page.getByRole("button", { name: "模板设计" }).click();
    await expect(page.locator(".template-editor__toolbar")).toBeVisible();
    const productCardControl = page.getByRole("complementary", { name: "模板组件库" })
      .locator('[data-template-identity="source:legacy_system_featuredProduct"] .homepage-editor__template-card-main');
    await expect(productCardControl).toBeVisible();
    await expect(productCardControl.locator(".homepage-editor__template-preview-wrap"))
      .toHaveCSS("pointer-events", "none");
    await productCardControl.click();
    await expect(productCardControl).toHaveAttribute("aria-pressed", "true");

    const structure = page.getByRole("complementary", { name: "模板结构" });
    const roleGroup = structure.getByRole("group", { name: /单品展示区内容槽位/ });
    await expect(roleGroup.getByRole("treeitem", { name: /商品/ })).toBeVisible();
    await expect(roleGroup.getByRole("treeitem", { name: /标题与描述文字/ })).toBeVisible();
    await expect(roleGroup.getByRole("treeitem", { name: /列表内容/ })).toBeVisible();
    await expect(roleGroup.getByRole("treeitem", { name: /行动入口/ })).toBeVisible();

    const canvas = page.frameLocator(".template-editor__viewport-frame");
    const contractFrame = canvas.locator('[data-content-template-contract="featuredProduct"]').first();
    const product = contractFrame.locator('[data-hc-keyboard-node="product"]:visible').first();
    await expect(product).toBeVisible();
    await roleGroup.getByRole("treeitem", { name: /商品/ }).click();
    await expect(contractFrame).toHaveAttribute("data-visual-selected-node", "product");
    await expect(contractFrame).toHaveAttribute("data-visual-editor-mode", "adjust-layout");

    const dragProductBy = async (deltaX: number, deltaY: number) => {
      const before = await product.boundingBox();
      if (!before) throw new Error("单品展示商品区域没有可拖拽尺寸");
      await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        before.x + before.width / 2 + deltaX,
        before.y + before.height / 2 + deltaY,
        { steps: 8 },
      );
      await expect(contractFrame).toHaveAttribute("data-hc-gesture-phase", "update");
      await page.mouse.up();
      await expect.poll(async () =>
        (await contractFrame.getAttribute("data-hc-gesture-phase")) ?? "idle",
      ).toBe("idle");
      await expect.poll(async () => (await product.boundingBox())?.x ?? 0)
        .toBeGreaterThan(before.x + 8);
      return before;
    };

    const firstStart = await dragProductBy(36, 16);
    const afterFirst = await product.boundingBox();
    if (!afterFirst) throw new Error("单品展示商品区域在第一次调整后丢失");
    expect(afterFirst.x).toBeGreaterThan(firstStart.x + 8);

    await dragProductBy(28, 12);
    const afterSecond = await product.boundingBox();
    if (!afterSecond) throw new Error("单品展示商品区域在第二次调整后丢失");
    expect(afterSecond.x).toBeGreaterThan(afterFirst.x + 8);
    const readOffsetParentPosition = (target: Locator) => target.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const parentRect = (element as HTMLElement).offsetParent?.getBoundingClientRect();
      if (!parentRect || parentRect.width <= 0 || parentRect.height <= 0) return null;
      return {
        x: (rect.x - parentRect.x) / parentRect.width,
        y: (rect.y - parentRect.y) / parentRect.height,
      };
    });
    const editorPosition = await readOffsetParentPosition(product);
    if (!editorPosition) throw new Error("单品展示商品区域缺少有效定位容器");

    await page.getByRole("button", { name: "预览模板" }).click();
    await expect(page.getByRole("button", { name: "退出模板预览" })).toBeVisible();
    const previewProduct = contractFrame.locator('[data-content-role="product"]:visible').first();
    const previewBox = await previewProduct.boundingBox();
    if (!previewBox) throw new Error("单品展示商品区域在预览中丢失");
    const previewPosition = await readOffsetParentPosition(previewProduct);
    if (!previewPosition) throw new Error("单品展示预览商品区域缺少有效定位容器");
    expect(Math.abs(previewPosition.x - editorPosition.x)).toBeLessThanOrEqual(0.002);
    expect(Math.abs(previewPosition.y - editorPosition.y)).toBeLessThanOrEqual(0.002);
    await page.getByRole("button", { name: "退出模板预览" }).click();

    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();
    const savedDefinition = dynamic.writes.at(-1)?.body.definition as Record<string, any>;
    const productCardNode = Object.values(savedDefinition.nodes as Record<string, any>)
      .find((candidate: any) => candidate.type === "ProductCard");
    const savedProductRect = productCardNode?.props?.contentTemplateLayoutData
      ?.nodes?.product?.rectByViewport?.desktop;
    expect(savedProductRect).toMatchObject({
        x: expect.any(Number),
        y: expect.any(Number),
        width: expect.any(Number),
        height: expect.any(Number),
      });
    expect(savedDefinition.defaultContent).toEqual({});
    expect(savedDefinition.previewContent).toEqual({});

    await page.reload();
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "模板设计" }).click();
    const reopenedCard = page.getByRole("complementary", { name: "模板组件库" })
      .locator('[data-template-identity="source:legacy_system_featuredProduct"] .homepage-editor__template-card-main');
    await expect(reopenedCard).toBeVisible();
    if (await reopenedCard.getAttribute("aria-pressed") !== "true") await reopenedCard.click();
    await expect(reopenedCard).toHaveAttribute("aria-pressed", "true");
    const reopenedFrame = page.frameLocator(".template-editor__viewport-frame")
      .locator('[data-content-template-contract="featuredProduct"]').first();
    const reopenedProduct = reopenedFrame.locator('[data-content-role="product"]:visible').first();
    await expect(reopenedProduct).toBeVisible();
    const reopenedPosition = await readOffsetParentPosition(reopenedProduct);
    if (!reopenedPosition || !savedProductRect) throw new Error("单品展示保存重开后缺少商品区域几何");
    expect(Math.abs(reopenedPosition.x - savedProductRect.x)).toBeLessThanOrEqual(0.002);
    expect(Math.abs(reopenedPosition.y - savedProductRect.y)).toBeLessThanOrEqual(0.002);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("模板结构区显示真实布局层级并支持移入移出容器", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem("haichuan.dynamic-template-drafts.v1");
    });
    const { forbiddenPageWrites } = await openWorkspaceShell(page, {
      draft: makeTemplateWorkspaceLayerDraft(),
      viewport: { width: 1912, height: 897 },
    });
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建空白模板" }).click();
    const structure = page.getByRole("complementary", { name: "模板结构" });
    const health = structure.getByRole("region", { name: "模板结构问题" });
    await expect(health).toContainText("2 项待处理");
    await expect(health).toContainText("模板尚未创建内容区域");
    await expect(health).toContainText("模板尚未添加内容槽位");
    await health.getByRole("listitem").filter({ hasText: "模板尚未创建内容区域" })
      .getByRole("button", { name: "修复" }).click();
    await expect(structure.getByRole("treeitem", { name: /内容区域 1/ })).toBeVisible();
    await expect(structure.locator(".template-editor__region-empty")).toHaveText("暂无内容");
    await health.getByRole("listitem").filter({ hasText: "模板尚未添加内容槽位" })
      .getByRole("button", { name: "修复" }).click();
    await expect(structure.getByRole("treeitem", { name: /图片槽位.*可选/ })).toBeVisible();
    const collapseRegion = structure.getByRole("button", { name: "内容区域 1收起" });
    await collapseRegion.click();
    await expect(structure.getByRole("treeitem", { name: /图片槽位.*可选/ })).toBeHidden();
    await structure.getByRole("button", { name: "内容区域 1展开" }).click();
    await expect(structure.getByRole("treeitem", { name: /图片槽位.*可选/ })).toBeVisible();

    const { panel: addPanel } = await openTemplateStructureAddPanel(page);
    await addPanel.getByText("布局", { exact: true }).click();
    await addPanel.getByRole("button", { name: "横向行 结构节点" }).click();
    await addPanel.getByRole("button", { name: "描述槽位 内容槽位" }).click();

    const layout = structure.getByRole("treeitem", { name: /横向行 布局容器/ });
    const nestedSlot = structure.getByRole("treeitem", { name: /描述槽位 .* 可选/ });
    await expect(layout).toBeVisible();
    await expect(layout).toHaveAttribute("aria-level", "3");
    await expect(nestedSlot).toHaveAttribute("aria-level", "4");

    await structure.getByRole("button", { name: "描述槽位节点操作" }).click();
    await page.getByRole("menuitem", { name: "移出当前容器" }).click();
    await expect(nestedSlot).toHaveAttribute("aria-level", "3");
    await expect(health).toContainText("1 项待处理");
    await expect(health.getByRole("button", { name: "定位" }).first()).toBeVisible();
    const horizontalOverflow = await structure.locator(".template-editor__structure-scroll")
      .evaluate((element) => Math.max(0, element.scrollWidth - element.clientWidth));
    expect(horizontalOverflow).toBeLessThanOrEqual(1);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("F0-01 authoring 结构锁由命令层统一执行且不进入公开 Render Plan", () => {
    let definition = createBlankDynamicTemplateDefinition("锁定操作层验收");
    const primaryRegion = addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
    definition = primaryRegion.definition;
    const firstSlot = addDynamicTemplateNode(definition, primaryRegion.nodeId, "TextSlot");
    definition = firstSlot.definition;
    const secondSlot = addDynamicTemplateNode(definition, primaryRegion.nodeId, "HeadingSlot");
    definition = secondSlot.definition;
    const secondaryRegion = addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
    definition = secondaryRegion.definition;

    const legalDefinition = updateDynamicTemplateNodeRules(
      definition,
      firstSlot.nodeId,
      "desktop",
      (rules) => { rules.order = 1; },
    );
    expect(legalDefinition.nodes[firstSlot.nodeId].responsive.desktop.order).toBe(1);
    definition = setDynamicTemplateNodeStructureLocked(
      legalDefinition,
      firstSlot.nodeId,
      true,
    );
    expect(definition.nodes[firstSlot.nodeId].authoring).toEqual({ structureLocked: true });
    expect(validateDynamicTemplateDefinition(definition).valid).toBe(true);

    const legacyLockField = structuredClone(legalDefinition);
    legacyLockField.nodes[firstSlot.nodeId].props.contentTemplateDesignProps = {
      structureLocked: true,
    };
    expect(validateDynamicTemplateDefinition(legacyLockField).issues.some(
      (issue) => issue.code === "UNEXPECTED_CONTENT_TEMPLATE_DESIGN_PROPS",
    )).toBe(true);

    expect(() => updateDynamicTemplateNodeRules(
      definition,
      firstSlot.nodeId,
      "desktop",
      (rules) => { rules.order = 2; },
    )).toThrow(/已锁定/);
    expect(() => moveDynamicTemplateNode(
      definition,
      firstSlot.nodeId,
      secondaryRegion.nodeId,
    )).toThrow(/已锁定/);
    expect(() => reorderDynamicTemplateNode(
      definition,
      secondSlot.nodeId,
      0,
    )).toThrow(/已锁定/);
    expect(() => removeDynamicTemplateNode(definition, primaryRegion.nodeId)).toThrow(/已锁定/);
    expect(() => duplicateDynamicTemplateNode(definition, firstSlot.nodeId)).toThrow(/已锁定/);

    const directLayoutMutation = structuredClone(definition);
    directLayoutMutation.nodes[firstSlot.nodeId].responsive.desktop.order = 9;
    expect(getDynamicTemplateStructureLockViolation(definition, directLayoutMutation))
      .toContain("位置或尺寸");

    const session = useTemplateEditorSession.getState();
    session.open({
      format: "dynamic",
      sourceType: "local",
      localDraftId: definition.templateId,
      versionNote: "",
      definition,
    }, { isNew: true });
    try {
      useTemplateEditorSession.getState().setDynamicDefinition(directLayoutMutation);
      expect(useTemplateEditorSession.getState().draft?.definition.nodes[firstSlot.nodeId]
        .responsive.desktop.order).toBe(1);
    } finally {
      useTemplateEditorSession.getState().close();
    }

    const combinedUnlockAndLayoutMutation = structuredClone(definition);
    delete combinedUnlockAndLayoutMutation.nodes[firstSlot.nodeId].authoring;
    combinedUnlockAndLayoutMutation.nodes[firstSlot.nodeId].responsive.desktop.order = 8;
    expect(getDynamicTemplateStructureLockViolation(definition, combinedUnlockAndLayoutMutation))
      .toContain("必须作为独立操作");

    const combinedLayoutMutationAndLock = structuredClone(legalDefinition);
    combinedLayoutMutationAndLock.nodes[firstSlot.nodeId].responsive.desktop.order = 8;
    combinedLayoutMutationAndLock.nodes[firstSlot.nodeId].authoring = { structureLocked: true };
    expect(getDynamicTemplateStructureLockViolation(legalDefinition, combinedLayoutMutationAndLock))
      .toContain("必须作为独立操作");

    const unlockedDefinition = setDynamicTemplateNodeStructureLocked(
      definition,
      firstSlot.nodeId,
      false,
    );
    expect(getDynamicTemplateStructureLockViolation(definition, unlockedDefinition)).toBeNull();
    expect(unlockedDefinition.nodes[firstSlot.nodeId].authoring).toBeUndefined();
    expect(updateDynamicTemplateNodeRules(
      unlockedDefinition,
      firstSlot.nodeId,
      "desktop",
      (rules) => { rules.order = 2; },
    ).nodes[firstSlot.nodeId].responsive.desktop.order).toBe(2);

    const lockedRegionDefinition = setDynamicTemplateNodeStructureLocked(
      unlockedDefinition,
      primaryRegion.nodeId,
      true,
    );
    expect(() => addDynamicTemplateNode(
      lockedRegionDefinition,
      primaryRegion.nodeId,
      "ImageSlot",
    )).toThrow(/不能改变子节点结构/);
    expect(() => updateDynamicTemplateNodeRules(
      lockedRegionDefinition,
      firstSlot.nodeId,
      "desktop",
      (rules) => { rules.order = 4; },
    )).toThrow(/已锁定/);
    expect(() => duplicateDynamicTemplateNode(
      lockedRegionDefinition,
      firstSlot.nodeId,
    )).toThrow(/已锁定/);
    expect(() => moveDynamicTemplateNode(
      lockedRegionDefinition,
      firstSlot.nodeId,
      secondaryRegion.nodeId,
    )).toThrow(/已锁定/);

    for (const surface of [
      { name: "目录与模板画布", showEmptySlots: true },
      { name: "页面画布、预览与公开 Renderer", showEmptySlots: false },
    ]) {
      for (const device of ["desktop", "mobile"] as const) {
        const unlockedPlan = compileDynamicTemplateRenderPlan(unlockedDefinition, {
          device,
          showEmptySlots: surface.showEmptySlots,
        });
        const lockedPlan = compileDynamicTemplateRenderPlan(lockedRegionDefinition, {
          device,
          showEmptySlots: surface.showEmptySlots,
        });
        expect(unlockedPlan.ok, `${surface.name} ${device} 未锁定定义应可编译`).toBe(true);
        expect(lockedPlan.ok, `${surface.name} ${device} 锁定定义应可编译`).toBe(true);
        if (unlockedPlan.ok && lockedPlan.ok) {
          expect(lockedPlan.plan, `${surface.name} ${device} 结构指纹不得消费 authoring`)
            .toEqual(unlockedPlan.plan);
        }
      }
    }
  });

  test("F0-01 删除与历史导航会修复失效选区", () => {
    let definition = createBlankDynamicTemplateDefinition("选区修复验收");
    const region = addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
    definition = region.definition;
    const slot = addDynamicTemplateNode(definition, region.nodeId, "TextSlot");
    definition = slot.definition;
    const session = useTemplateEditorSession.getState();

    session.open({
      format: "dynamic",
      sourceType: "local",
      localDraftId: definition.templateId,
      versionNote: "",
      definition,
    }, { isNew: true });
    try {
      useTemplateEditorSession.getState().selectObject(slot.nodeId);
      useTemplateEditorSession.getState().setDynamicDefinition(
        removeDynamicTemplateNode(definition, slot.nodeId),
      );
      expect(useTemplateEditorSession.getState().selectedObjectId).toBe(definition.rootNodeId);

      useTemplateEditorSession.getState().undo();
      expect(useTemplateEditorSession.getState().draft?.definition.nodes[slot.nodeId]).toBeTruthy();
      expect(useTemplateEditorSession.getState().selectedObjectId).toBe(definition.rootNodeId);

      useTemplateEditorSession.getState().selectObject(slot.nodeId);
      useTemplateEditorSession.getState().redo();
      expect(useTemplateEditorSession.getState().draft?.definition.nodes[slot.nodeId]).toBeUndefined();
      expect(useTemplateEditorSession.getState().selectedObjectId).toBe(definition.rootNodeId);
    } finally {
      useTemplateEditorSession.getState().close();
    }
  });

  test("F0-01 Inspector 结构锁和 Schema 输入可撤销、保存并在刷新后回显", async ({ page }) => {
    test.slow();
    await page.addInitScript(() => {
      window.localStorage.removeItem("haichuan.dynamic-template-drafts.v1");
    });
    const { dynamic, forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeTemplateWorkspaceLayerDraft(),
    });
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建空白模板" }).click();

    const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    const layoutType = inspector.getByRole("textbox", { name: "构图类型" });
    await layoutType.fill("构".repeat(DYNAMIC_TEMPLATE_METADATA_TEXT_MAX_LENGTH.layoutType + 1));
    await expect(layoutType).toHaveValue("构".repeat(DYNAMIC_TEMPLATE_METADATA_TEXT_MAX_LENGTH.layoutType));

    const rawTags = Array.from(
      { length: DYNAMIC_TEMPLATE_METADATA_LIST_LIMITS.tags.maxItems + 1 },
      (_, index) => `标签${String(index).padStart(2, "0")}${"长".repeat(40)}`,
    );
    const tags = inspector.getByRole("textbox", { name: "标签" });
    await tags.fill(rawTags.join("，"));
    await tags.press("Tab");
    const expectedTags = rawTags
      .slice(0, DYNAMIC_TEMPLATE_METADATA_LIST_LIMITS.tags.maxItems)
      .map((tag) => tag.slice(0, DYNAMIC_TEMPLATE_METADATA_LIST_LIMITS.tags.maxItemLength));
    await expect(tags).toHaveValue(expectedTags.join("，"));
    expect(parseCommaSeparatedValues(
      rawTags.join("，"),
      DYNAMIC_TEMPLATE_METADATA_LIST_LIMITS.tags,
    )).toEqual(expectedTags);

    const { panel: addPanel } = await openTemplateStructureAddPanel(page);
    await addPanel.getByRole("button", { name: "添加区域（新增内容区域）" }).click();
    await addPanel.getByRole("button", { name: "描述槽位 内容槽位" }).click();
    await addPanel.getByRole("button", { name: "标题槽位 内容槽位" }).click();
    await inspector.getByRole("textbox", { name: "节点名称" }).fill("边界标题槽位");

    const maxLines = inspector.getByRole("spinbutton", { name: "最大行数" });
    await maxLines.fill(String(DYNAMIC_TEMPLATE_SLOT_RULE_MAX_LINES + 1));
    await expect(maxLines).toHaveValue(String(DYNAMIC_TEMPLATE_SLOT_RULE_MAX_LINES));
    await maxLines.fill(String(DYNAMIC_TEMPLATE_SLOT_RULE_MAX_LINES));
    await expect(maxLines).toHaveValue(String(DYNAMIC_TEMPLATE_SLOT_RULE_MAX_LINES));

    const lockSwitch = inspector.getByRole("switch", { name: "锁定位置、尺寸和层级" });
    await lockSwitch.click();
    await expect(lockSwitch).toHaveAttribute("aria-checked", "true");
    await expect(inspector.getByRole("textbox", { name: "节点名称" })).toHaveAttribute("readonly", "");
    await expect(inspector.getByRole("spinbutton", { name: "最大行数" })).toHaveCount(0);

    await page.getByRole("button", { name: "撤销", exact: true }).click();
    await expect(lockSwitch).toHaveAttribute("aria-checked", "false");
    await expect(inspector.getByRole("textbox", { name: "节点名称" })).not.toHaveAttribute("readonly", "");
    await page.getByRole("button", { name: "重做", exact: true }).click();
    await expect(lockSwitch).toHaveAttribute("aria-checked", "true");

    const structureActions = page.getByRole("button", { name: "边界标题槽位节点操作" });
    await structureActions.click();
    await expect(page.getByRole("menuitem", { name: "上移" }).last()).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByRole("menuitem", { name: /删除槽位/ }).last()).toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("Escape");
    const templateFrame = page.frameLocator(".template-editor__viewport-frame");
    await expect(templateFrame.getByRole("toolbar", { name: /边界标题槽位快捷操作/ })).toHaveCount(0);
    await expect(page.locator(".template-editor__body")
      .getByRole("toolbar", { name: /边界标题槽位快捷操作/ })).toHaveCount(0);

    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();
    const savedDefinition = dynamic.writes.at(-1)?.body.definition;
    expect(savedDefinition.metadata.layoutType).toHaveLength(DYNAMIC_TEMPLATE_METADATA_TEXT_MAX_LENGTH.layoutType);
    expect(savedDefinition.metadata.tags).toEqual(expectedTags);
    const savedHeading = Object.values(savedDefinition.nodes as Record<string, {
      name: string;
      slotId?: string;
      authoring?: { structureLocked?: boolean };
      props: { contentTemplateDesignProps?: Record<string, unknown> };
    }>).find((node) => node.name === "边界标题槽位");
    expect(savedHeading?.slotId).toBeTruthy();
    expect(savedHeading?.authoring).toEqual({ structureLocked: true });
    expect(savedHeading?.props.contentTemplateDesignProps?.structureLocked).toBeUndefined();
    expect(savedDefinition.slots[savedHeading!.slotId!].desktopRules.maxLines)
      .toBe(DYNAMIC_TEMPLATE_SLOT_RULE_MAX_LINES);
    const savedValidation = validateDynamicTemplateDefinition(savedDefinition);
    expect(savedValidation.issues.filter((issue) => issue.level === "error")).toEqual([]);

    await page.reload();
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible({ timeout: 15_000 });
    await openTemplateFromCatalog(page, savedDefinition.name);

    const reloadedInspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    await page.getByRole("treeitem", { name: new RegExp(`${savedDefinition.name} 模板`) }).click();
    await openTemplateInspectorPanel(page, "基本");
    await expect(reloadedInspector.getByRole("textbox", { name: "构图类型" }))
      .toHaveValue("构".repeat(DYNAMIC_TEMPLATE_METADATA_TEXT_MAX_LENGTH.layoutType));
    await openTemplateInspectorPanel(page, "规则");
    await expect(reloadedInspector.getByRole("textbox", { name: "标签" }))
      .toHaveValue(expectedTags.join("，"));

    await page.getByRole("treeitem", { name: /边界标题槽位.*已锁定/ }).click();
    const reloadedLockSwitch = reloadedInspector.getByRole("switch", { name: "锁定位置、尺寸和层级" });
    await expect(reloadedLockSwitch).toHaveAttribute("aria-checked", "true");
    await reloadedLockSwitch.click();
    await expect(reloadedLockSwitch).toHaveAttribute("aria-checked", "false");
    await page.getByRole("button", { name: "撤销", exact: true }).click();
    await expect(reloadedLockSwitch).toHaveAttribute("aria-checked", "true");
    await page.getByRole("button", { name: "重做", exact: true }).click();
    await expect(reloadedLockSwitch).toHaveAttribute("aria-checked", "false");
    await openTemplateInspectorPanel(page, "布局");
    const reloadedMaxLines = reloadedInspector.getByRole("spinbutton", { name: "最大行数" });
    await expect(reloadedMaxLines)
      .toHaveValue(String(DYNAMIC_TEMPLATE_SLOT_RULE_MAX_LINES));
    const changedMaxLines = DYNAMIC_TEMPLATE_SLOT_RULE_MAX_LINES - 1;
    await reloadedMaxLines.fill(String(changedMaxLines));

    const writesBeforeCombinedSave = dynamic.writes.length;
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect.poll(() => dynamic.writes.length).toBe(writesBeforeCombinedSave + 1);
    const combinedSavedDefinition = dynamic.writes.at(-1)?.body.definition;
    const combinedSavedHeading = Object.values(combinedSavedDefinition.nodes as Record<string, {
      name: string;
      slotId?: string;
      authoring?: { structureLocked?: boolean };
    }>).find((node) => node.name === "边界标题槽位");
    expect(combinedSavedHeading?.authoring).toBeUndefined();
    expect(combinedSavedDefinition.slots[combinedSavedHeading!.slotId!].desktopRules.maxLines)
      .toBe(changedMaxLines);

    await page.reload();
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible({ timeout: 15_000 });
    await openTemplateFromCatalog(page, savedDefinition.name);
    const combinedReloadedInspector = page.getByRole("complementary", {
      name: "模板属性",
      exact: true,
    });
    await page.getByRole("treeitem", { name: /边界标题槽位/ }).click();
    await expect(combinedReloadedInspector.getByRole("switch", {
      name: "锁定位置、尺寸和层级",
    })).toHaveAttribute("aria-checked", "false");
    await openTemplateInspectorPanel(page, "布局");
    await expect(combinedReloadedInspector.getByRole("spinbutton", { name: "最大行数" }))
      .toHaveValue(String(changedMaxLines));
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
    await fillTemplateName(page, "结构操作验收模板");

    const { trigger: addTrigger, panel: addPanel } = await openTemplateStructureAddPanel(page);
    await addPanel.getByRole("button", { name: "添加区域（新增内容区域）" }).click();
    await page.getByRole("textbox", { name: "节点名称" }).fill("运营内容容器");
    await addPanel.getByRole("button", { name: "描述槽位 内容槽位" }).click();
    await addTrigger.click();
    await openTemplateInspectorPanel(page, "基本");
    await page.getByRole("textbox", { name: "节点名称" }).fill("第一段正文");
    await expect(page.getByText(/实际内容.*页面装修中配置/)).toBeVisible();
    await openTemplateInspectorPanel(page, "规则");
    await page.getByRole("switch", { name: "允许调整位置" }).click();
    await page.getByRole("switch", { name: "允许调整尺寸" }).click();
    await page.getByRole("switch", { name: "允许调整层级" }).click();
    await page.getByRole("switch", { name: "允许调整间距" }).click();
    await page.getByRole("switch", { name: "允许调整文字样式" }).click();
    await page.getByRole("spinbutton", { name: /最大位置偏移/ }).fill("20");
    await page.getByRole("spinbutton", { name: "最小宽度" }).fill("40");
    await page.getByRole("spinbutton", { name: "最大宽度" }).last().fill("160");
    await page.getByRole("spinbutton", { name: "最小字号" }).fill("14");
    await page.getByRole("spinbutton", { name: "最大字号" }).fill("64");
    await page.getByRole("spinbutton", { name: "最大上下间距" }).fill("80");

    await page.getByRole("treeitem", { name: /运营内容容器/ }).click();
    const { trigger: reopenedAddTrigger, panel: reopenedAddPanel } = await openTemplateStructureAddPanel(page);
    await reopenedAddPanel.getByRole("button", { name: "标题槽位 内容槽位" }).click();
    await reopenedAddTrigger.click();
    await openTemplateInspectorPanel(page, "基本");
    await page.getByRole("textbox", { name: "节点名称" }).fill("第二段标题");

    await page.getByRole("treeitem", { name: /第一段正文/ }).click();
    const originalActions = page.getByRole("button", { name: "第一段正文节点操作" });
    await page.getByRole("treeitem", { name: /第一段正文/ }).dragTo(
      page.getByRole("treeitem", { name: /第二段标题/ }),
      { sourcePosition: { x: 36, y: 16 }, targetPosition: { x: 36, y: 30 } },
    );
    await originalActions.click();
    await page.getByRole("menuitem", { name: "复制" }).click();

    const copiedTreeItem = page.getByRole("treeitem", { name: /第一段正文 副本/ });
    await expect(copiedTreeItem).toBeVisible();
    const copiedActions = page.getByRole("button", { name: "第一段正文 副本节点操作" });
    const canvasTextSlots = page.frameLocator(".template-editor__viewport-frame")
      .locator('.template-editor__dynamic-canvas-renderer [data-template-node-type="TextSlot"]');
    await expect(canvasTextSlots).toHaveCount(2);

    await copiedActions.click();
    await page.getByRole("menuitem", { name: "隐藏" }).last().click();
    await expect(page.getByRole("treeitem", { name: /第一段正文 副本.*已隐藏/ })).toBeVisible();
    await expect(canvasTextSlots).toHaveCount(1);
    await copiedActions.click();
    await page.getByRole("menuitem", { name: "显示" }).last().click();
    await expect(canvasTextSlots).toHaveCount(2);

    await copiedActions.click();
    await page.getByRole("menuitem", { name: "锁定槽位" }).last().click();
    await expect(page.getByRole("treeitem", { name: /第一段正文 副本.*已锁定/ }))
      .toHaveAttribute("draggable", "false");
    await copiedActions.click();
    await page.getByRole("menuitem", { name: "解除锁定" }).last().click();

    await copiedActions.click();
    await page.getByRole("menuitem", { name: "删除" }).last().click();
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
    expect(storedDefinition.previewContent).toEqual({});
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("独立模板发布失败保留草稿，再次显式发布只产生一个版本", async ({ page }) => {
    const { forbiddenPageWrites, dynamic } = await openWorkspaceShell(page, {
      draft: makeTemplateWorkspaceLayerDraft(),
      publishFailures: 1,
    });
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建空白模板" }).click();
    await fillTemplateName(page, "幂等发布重试模板");
    await page.getByRole("button", { name: "标题槽位 内容槽位" }).click();
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();

    await page.getByRole("button", { name: "发布模板新版本" }).click();
    await expect(page.locator(".ant-message-error")).toBeVisible();
    const failedPublishStatus = page.getByRole("status", {
      name: "模板状态：发布失败，草稿仍在，可以重试",
    });
    await expect(failedPublishStatus).toHaveAttribute("data-mode", "error");
    await expect(failedPublishStatus).toContainText("发布失败");
    await expect(failedPublishStatus).toContainText("草稿仍在 · 可重试");
    expect(dynamic.versionsByTemplateId.get(dynamic.records[0].templateId)).toHaveLength(0);

    const retryPublish = page.getByRole("button", { name: "重试发布模板新版本（当前草稿仍保留）" });
    await expect(retryPublish).toBeEnabled();
    await expect(retryPublish).toHaveAttribute("title", /失败不会丢失模板草稿/);
    await retryPublish.click();
    await expect(page.getByText("模板 v1 已发布；现有页面仍保持原版本")).toBeVisible();
    const publishedStatus = page.getByRole("status", {
      name: "模板状态：已发布新版本，已有页面保持原版本",
    });
    await expect(publishedStatus).toContainText("已发布新版本");
    await expect(publishedStatus).toContainText("已有页面保持原版本");
    expect(dynamic.versionsByTemplateId.get(dynamic.records[0].templateId)).toHaveLength(1);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("复杂节点在模板设计中只保留布局样式，不暴露页面内容与业务功能", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem("haichuan.dynamic-template-drafts.v1");
    });
    const { forbiddenPageWrites, dynamic } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeTemplateWorkspaceLayerDraft(),
    });
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建空白模板" }).click();
    const { panel: addPanel } = await openTemplateStructureAddPanel(page);
    await addPanel.getByRole("button", { name: "添加区域（新增内容区域）" }).click();
    await addPanel.getByText("高级内容", { exact: true }).click();
    await addPanel.getByRole("button", { name: "轮播组件 内容槽位" }).click();

    const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    await openTemplateInspectorPanel(page, "布局");
    const complexFields = inspector.locator('[data-complex-content-type="carousel"]');
    await expect(complexFields).toHaveAttribute("data-complex-content-scope", "template");
    await expect(complexFields).toContainText("这里只定义组件的布局与样式");
    await expect(complexFields).not.toContainText("图片素材");
    await expect(complexFields).not.toContainText("模板专属功能");
    await expect(complexFields.getByRole("group", { name: "切换间隔" })).toHaveCount(0);
    await expect(complexFields.getByRole("switch", { name: "自动播放" })).toHaveCount(0);

    const { panel: businessAddPanel } = await openTemplateStructureAddPanel(page);
    await businessAddPanel.getByRole("button", { name: "添加区域（新增内容区域）" }).click();
    await businessAddPanel.getByRole("button", { name: "商品集合组件 内容槽位" }).click();
    const businessFields = inspector.locator('[data-complex-content-type="productCollection"]');
    await expect(businessFields).toHaveAttribute("data-complex-content-scope", "template");
    await expect(businessFields.getByText("选择商品", { exact: true })).toHaveCount(0);
    await expect(businessFields.getByRole("textbox", { name: "标题" })).toHaveCount(0);
    await expect(businessFields).toContainText("这里只定义组件的布局与样式");
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
      defaultContent: Record<string, unknown>;
      previewContent: Record<string, unknown>;
    };
    const carouselNode = Object.values(storedDefinition.nodes).find((node) => node.type === "Carousel");
    const productCollectionNode = Object.values(storedDefinition.nodes).find((node) => node.type === "ProductCollection");
    expect(carouselNode?.slotId).toBeTruthy();
    expect(productCollectionNode?.slotId).toBeTruthy();
    expect(storedDefinition.previewContent).toEqual({});
    expect(productCollectionNode?.props.contentTemplateDesignProps).toMatchObject({ layout: "grid-2" });
    expect(storedDefinition.defaultContent).toEqual({});
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
    await page.getByRole("button", { name: "更多模板操作", exact: true }).click();
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

  test("成熟母模板结构区显示完整度并受控增删合同内容", async ({ page }) => {
    const { forbiddenPageWrites } = await openWorkspaceShell(page, { role: "SUPER_ADMIN" });
    const contract = getContentTemplateContract("首屏主视觉")!;
    await openTemplateFromCatalog(page, contract.displayName);
    const canvas = page.frameLocator(".template-editor__viewport-frame");
    const contractFrame = canvas.locator('[data-content-template-module="首屏主视觉"]');
    await expect(contractFrame).toHaveClass(/hc-contract-frame--editor/);
    await expect(contractFrame).toHaveAttribute("data-visual-panel-mode", "design");
    await expect(contractFrame.locator('[data-hc-template-slot-box][data-node-id="desktopImage"]'))
      .toContainText("桌面主图");
    await expect(contractFrame.locator('[data-hc-template-slot-box][data-node-id="title"]'))
      .toContainText("标题");
    await page.getByRole("button", { name: "预览模板" }).click();
    await expect(contractFrame).toHaveClass(/hc-contract-frame--public/);
    await expect(contractFrame.locator("[data-hc-template-slot-box]")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(contractFrame).toHaveClass(/hc-contract-frame--editor/);
    await expect(page.getByRole("treeitem", { name: /首屏 模板/ })).toBeVisible();
    await expect(page.getByText("内容容器", { exact: true })).toHaveCount(0);
    const structure = page.getByRole("complementary", { name: "模板结构" });
    await expect(structure.getByRole("region", { name: "模板结构问题" })).toHaveCount(0);
    await expect(structure.locator(".template-editor__template-summary")).toContainText("结构完整");
    const { trigger: addTrigger, panel: addPanel } = await openTemplateStructureAddPanel(page);
    await expect(addPanel.getByRole("button", { name: "添加区域（新增内容区域）" })).toBeVisible();
    await expect(addPanel.getByRole("button", { name: "图片槽位 内容槽位" })).toBeVisible();
    await addTrigger.click();
    const roleGroup = structure.getByRole("group", { name: /响应式区域内容槽位/ });
    const roleItems = roleGroup.getByRole("treeitem");
    await expect(roleItems).toHaveCount(3);
    await expect(roleItems.first()).toHaveAccessibleName(/主视觉图片 图片槽位 必填/);
    await expect(structure.getByRole("button", { name: "主视觉图片移出模板" })).toHaveCount(0);
    await expect(roleGroup.getByRole("button", { name: "选择桌面端槽位" })).toBeVisible();
    const mobileSlot = roleGroup.getByRole("button", { name: "选择移动端槽位" });
    await expect(mobileSlot).toBeVisible();

    // 结构树只负责选择当前模板对象，不能替用户重新定位整个画布工作区。
    const canvasScroll = page.locator(".template-editor__canvas-scroll");
    const zoomInput = page.locator(".template-editor__body")
      .getByRole("spinbutton", { name: "画布缩放百分比" });
    await zoomInput.fill("100");
    await zoomInput.press("Enter");
    const structureSelectionScroll = await canvasScroll.evaluate(async (element) => {
      const maxTop = Math.max(0, element.scrollHeight - element.clientHeight);
      element.scrollTop = maxTop;
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      return { top: element.scrollTop, maxTop };
    });
    expect(structureSelectionScroll.maxTop).toBeGreaterThan(0);
    await roleItems.first().click();
    // 旧行为使用 smooth scrollIntoView；等待已知平滑滚动窗口后再判断最终位置。
    await page.waitForTimeout(500);
    await expect.poll(() => canvasScroll.evaluate((element) => element.scrollTop))
      .toBe(structureSelectionScroll.top);

    await expect(roleGroup.getByRole("button", { name: "选择桌面端槽位" }))
      .toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: /移动端模板布局/ }).click();
    await expect(mobileSlot).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".template-editor__template-summary")).toContainText("移动端");
    const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    await expect(inspector.getByText("对象职责", { exact: true })).toBeVisible();
    await expect(inspector.getByText("系统预设 · 不可修改", { exact: true })).toBeVisible();
    await expect(inspector).toContainText("页面装修只显示以下设置，且不会改变母模板结构");
    await expect(inspector.getByRole("switch", { name: "页面可编辑内容" })).toHaveCount(0);
    await expect(inspector.locator(".homepage-editor__inspector-title")).toContainText("移动");
    const actionItem = roleGroup.getByRole("treeitem", { name: /行动入口 行动入口 可选/ });
    const actionSource = contractFrame.locator('[data-content-role="action"]:visible').first();
    await actionSource.click();
    await expect(actionItem).toHaveAttribute("aria-selected", "true");
    const actionOverlay = contractFrame.locator(
      '[data-hc-template-slot-box][data-node-id="action"]',
    );
    await expect(actionOverlay).toHaveCount(1);
    await structure.getByRole("button", { name: "行动入口移出模板" }).click();
    await expect(actionItem).toContainText("已移出");
    await expect(contractFrame.locator('[data-content-role="action"]:visible')).toHaveCount(0);
    await structure.getByRole("button", { name: "行动入口恢复到模板" }).click();
    await expect(actionItem).toContainText("可选");
    await expect(contractFrame.locator('[data-content-role="action"]:visible').first()).toBeVisible();
    await actionSource.evaluate((element) => element.remove());
    await expect(actionOverlay).toHaveCount(0);
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("复合母模板在设计画布显示合同图片与文字槽位", async ({ page }) => {
    const { forbiddenPageWrites } = await openWorkspaceShell(page, { role: "SUPER_ADMIN" });
    const contract = getContentTemplateContract("改款对比")!;
    await openTemplateFromCatalog(page, contract.displayName);
    const contractFrame = page.frameLocator(".template-editor__viewport-frame")
      .locator('[data-content-template-module="改款对比"]');
    await expect(contractFrame).toHaveClass(/hc-contract-frame--editor/);
    await expect(contractFrame).toHaveAttribute("data-visual-panel-mode", "design");
    await expect(contractFrame.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 10_000 });
    await expect(contractFrame.locator('[data-content-role="before"]'))
      .toHaveAttribute("data-hc-template-slot-kind", "media");
    await expect(contractFrame.locator('[data-hc-template-slot-box][data-node-id="before"]'))
      .toContainText("改造前");
    await expect(contractFrame.locator('[data-hc-template-slot-box][data-node-id="copy"]'))
      .toContainText("文案");
    expect(forbiddenPageWrites).toEqual([]);
  });

  test("模板目录优先渲染可视卡片，滚动后再生成远端预览", async ({ page }) => {
    const { forbiddenPageWrites } = await openWorkspaceShell(page, { role: "SUPER_ADMIN" });
    await page.getByRole("button", { name: "模板设计", exact: true }).click();
    const templateLibrary = page.locator('[data-unified-template-library="design"]');
    const cards = templateLibrary.locator('[data-template-catalog-card="shared"]');
    await expect.poll(() => cards.count()).toBeGreaterThan(10);
    const total = await cards.count();
    await expect.poll(() => templateLibrary.locator("iframe[data-template-catalog-viewport]").count())
      .toBeGreaterThan(0);
    const initiallyMounted = await templateLibrary.locator("iframe[data-template-catalog-viewport]").count();
    expect(initiallyMounted).toBeLessThan(total);

    const lastCard = cards.last();
    await expect(lastCard.locator('[data-preview-status="deferred"]')).toHaveCount(1);
    await lastCard.scrollIntoViewIfNeeded();
    await expect(lastCard.locator("iframe[data-template-catalog-viewport]"))
      .toHaveCount(1);
    await expect(lastCard.locator('[data-preview-status="ready"]')).toHaveCount(1);
    expect(forbiddenPageWrites).toEqual([]);
  });

  for (const previewCase of [
    {
      key: "hero",
      name: "首屏",
      moduleType: "首屏主视觉",
      expectedSlotKinds: ["media", "title", "description", "button"],
      expectedSlotLabels: ["图片", "标题", "描述", "按钮"],
    },
    {
      key: "wearingInspiration",
      name: "佩戴展示",
      moduleType: "佩戴灵感",
      expectedSlotKinds: ["media", "text", "button", "product"],
      expectedSlotLabels: ["图片", "文字", "按钮", "商品"],
    },
    {
      key: "video",
      name: "视频",
      moduleType: "视频区块",
      expectedSlotKinds: ["media", "text", "button"],
      expectedSlotLabels: ["视频", "文字", "按钮"],
    },
  ] as const) {
    test(`${previewCase.name}目录缩略图与设计画布共享中性示例内容和双端构图`, async ({ page }, testInfo) => {
      const { forbiddenPageWrites } = await openWorkspaceShell(page, { role: "SUPER_ADMIN" });
      await page.getByRole("button", { name: "模板设计", exact: true }).click();
      const templateLibrary = page.locator('[data-unified-template-library="design"]');
      const card = templateLibrary.locator(
        `[data-template-catalog-card="shared"][data-template-identity="source:legacy_system_${previewCase.key}"]`,
      );
      const control = card.locator(".homepage-editor__template-card-main");
      await expect(card).toHaveCount(1);
      await card.scrollIntoViewIfNeeded();
      await expect(card.locator('iframe[data-template-catalog-viewport="desktop"]')).toHaveCount(1);
      const catalogPreview = card.locator("[data-template-catalog-preview-shell]");
      await expect(catalogPreview).toHaveAttribute("data-preview-status", "ready");
      await expect(card.locator("[data-template-catalog-dimension]")).toHaveCount(0);
      await expect(card.locator(
        ".homepage-editor__template-slot-summary, .homepage-editor__template-description, .homepage-editor__template-add",
      )).toHaveCount(0);
      await expect(card.locator(".homepage-editor__template-name")).toHaveText(previewCase.name);
      const catalogSlotOverlay = card.locator('[data-template-editor-overlay-root="catalog"]');
      await expect(catalogSlotOverlay).toHaveCSS("pointer-events", "none");
      const selectedBeforeHover = await control.getAttribute("aria-pressed") === "true";
      await expect(catalogSlotOverlay).toHaveCSS(
        "visibility",
        selectedBeforeHover ? "visible" : "hidden",
      );
      if (!selectedBeforeHover) {
        await card.hover();
        await expect(catalogSlotOverlay).toHaveCSS("visibility", "visible");
      }
      await expect(card.locator(".template-editor__editable-overlay-box").first()).toBeVisible();
      const catalogSlotKinds = await card.locator(".template-editor__editable-overlay-box")
        .evaluateAll((slots) => [...new Set(slots.map((slot) => slot.getAttribute("data-editable-target-kind")))]);
      const catalogSlotLabels = await card.locator(".template-editor__editable-overlay-label")
        .evaluateAll((labels) => [...new Set(labels.map((label) => label.textContent?.trim()))]);
      expect(catalogSlotKinds).toEqual(expect.arrayContaining(previewCase.expectedSlotKinds));
      expect(catalogSlotLabels).toEqual(expect.arrayContaining(previewCase.expectedSlotLabels));
      const catalogSlotLabel = card.locator(".template-editor__editable-overlay-label").first();
      if (await catalogSlotLabel.count()) await expect(catalogSlotLabel).toHaveCSS("font-size", "12px");
      const readOverlappingLabels = () => card.locator(".template-editor__editable-overlay-label")
        .evaluateAll((labels) => labels.flatMap((label, index) => {
          const bounds = label.getBoundingClientRect();
          return labels.slice(index + 1).flatMap((candidate) => {
            const candidateBounds = candidate.getBoundingClientRect();
            const overlaps = bounds.left < candidateBounds.right
              && bounds.right > candidateBounds.left
              && bounds.top < candidateBounds.bottom
              && bounds.bottom > candidateBounds.top;
            return overlaps
              ? [`${label.textContent?.trim()} / ${candidate.textContent?.trim()}`]
              : [];
          });
        }));
      const overlappingLabels = await readOverlappingLabels();
      expect(overlappingLabels, `${previewCase.key} 目录槽位标签不得互相遮挡`).toEqual([]);
      if (previewCase.key === "hero") {
        await templateLibrary.getByRole("button", { name: "单列查看" }).click();
        await expect(card.locator('[data-preview-status="ready"]')).toHaveCount(1);
        expect(
          await readOverlappingLabels(),
          `${previewCase.key} 单列目录槽位标签不得互相遮挡`,
        ).toEqual([]);
        await templateLibrary.getByRole("button", { name: "双列查看" }).click();
        await expect(card.locator('[data-preview-status="ready"]')).toHaveCount(1);
        const more = card.getByRole("button", { name: /更多模板操作/ });
        await page.mouse.move(1, 1);
        await expect(more).toHaveCSS("opacity", "0");
        await expect(more).toHaveCSS("pointer-events", "none");
        await card.hover();
        await expect(more).toHaveCSS("pointer-events", "auto");
        await more.focus();
        await expect(more).not.toHaveCSS("opacity", "0");
      }
      const catalogFrame = card.frameLocator("iframe[data-template-catalog-viewport]");
      const catalogRoot = catalogFrame.locator("[data-dynamic-template-id]");
      const desktopCatalogSignature = await readDynamicTemplateRenderSignature(catalogRoot);
      await expect(catalogFrame.locator('[data-content-template-renderer="real"]')).toHaveCount(1);
      const catalogContractFrame = catalogFrame.locator(
        `[data-content-template-module="${previewCase.moduleType}"]`,
      );
      await expect(catalogContractFrame).toBeVisible();
      const catalogImageSources = await catalogFrame.locator("body").evaluate((body) => {
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
      expect(catalogImageSources.length).toBeGreaterThan(0);
      expect(catalogImageSources.some((source) => source.startsWith("data:image/svg+xml"))).toBe(true);
      expect(catalogImageSources.some((source) =>
        /\.(?:avif|jpe?g|png|webp)(?:[?#]|$)/i.test(source),
      )).toBe(false);

      if (await control.getAttribute("aria-pressed") !== "true") await control.click();
      await page.mouse.move(1, 1);
      await expect(catalogSlotOverlay).toHaveCSS("visibility", "visible");
      const canvasFrame = page.frameLocator(".template-editor__viewport-frame");
      const canvasRoot = canvasFrame.locator("[data-dynamic-template-id]");
      const desktopCanvasSignature = await readDynamicTemplateRenderSignature(canvasRoot);
      expectDynamicTemplateRenderSignaturesEqual(
        desktopCanvasSignature,
        desktopCatalogSignature,
        `${previewCase.key}.desktop`,
      );

      const contractFrame = canvasFrame.locator(`[data-content-template-module="${previewCase.moduleType}"]`);
      await expect(contractFrame).toHaveClass(/hc-contract-frame--editor/);
      await expect(contractFrame.locator("[data-hc-template-slot-box], [data-hc-editor-overlay]"))
        .toHaveCount(0);
      const sharedOverlay = page.locator('[data-template-editor-overlay-root="template-definition"]');
      await expect(sharedOverlay).toHaveCount(1);
      await expect(sharedOverlay.locator(".template-editor__editable-overlay-box").first())
        .toBeVisible();
      if (previewCase.key === "hero") {
        const copy = contractFrame.locator('[data-content-role="copy"]');
        await expect(catalogContractFrame.locator('[data-content-role="copy"]')).toContainText("光，沿线而生");
        await expect(copy).toContainText("光，沿线而生");
        await expect(copy).not.toHaveCSS("color", "rgba(0, 0, 0, 0)");
        await expect(contractFrame.locator('[data-content-role-desktop="desktopImage"]'))
          .toHaveCSS("opacity", "1");
      } else if (previewCase.key === "wearingInspiration") {
        await expect(catalogContractFrame.locator(".hc-lookbook__product-link")).toHaveCount(2);
        await expect(contractFrame.locator('[data-content-role="relatedProducts"]')).toBeVisible();
        await expect(contractFrame.locator(".hc-lookbook__product-link")).toHaveCount(2);
        await expect(contractFrame.locator('[data-content-role="wearingImage"]')).toHaveCSS("opacity", "1");
      } else {
        await expect(catalogContractFrame.locator('[data-editor-field="posterUrl"]'))
          .toHaveAttribute("src", /^data:image\/svg\+xml/i);
        await expect(contractFrame.locator('[data-editor-field="posterUrl"]'))
          .toHaveAttribute("src", /^data:image\/svg\+xml/i);
        await expect(contractFrame.locator('[data-content-role="copy"]'))
          .toContainText("一根金属线的旅程");
      }
      await page.screenshot({
        path: testInfo.outputPath(`${previewCase.key}-catalog-canvas-desktop.png`),
        animations: "disabled",
      });

      await page.getByRole("button", { name: /移动端模板布局/ }).click();
      await expect(card.locator('iframe[data-template-catalog-viewport="mobile"]')).toHaveCount(1);
      await expect(catalogPreview).toHaveAttribute("data-preview-status", "ready");
      await expect(card.locator("[data-template-catalog-dimension]")).toHaveCount(0);
      await expect(card.locator("[data-preview-viewport]"))
        .toHaveAttribute("data-preview-viewport", "mobile");
      await expect(canvasRoot).toHaveAttribute("data-dynamic-template-device", "mobile");
      const mobileCatalogSignature = await readDynamicTemplateRenderSignature(catalogRoot);
      const mobileCanvasSignature = await readDynamicTemplateRenderSignature(canvasRoot);
      expectDynamicTemplateRenderSignaturesEqual(
        mobileCanvasSignature,
        mobileCatalogSignature,
        `${previewCase.key}.mobile`,
      );
      await page.screenshot({
        path: testInfo.outputPath(`${previewCase.key}-catalog-canvas-mobile.png`),
        animations: "disabled",
      });
      expect(forbiddenPageWrites).toEqual([]);
    });
  }

  test("24 个活跃母模板目录与设计画布逐一保持双端 DOM、层级与归一化几何同源", async ({ page }, testInfo) => {
    testInfo.setTimeout(180_000);
    const runtimeErrors: string[] = [];
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    const { forbiddenPageWrites } = await openWorkspaceShell(page, { role: "SUPER_ADMIN" });
    await page.getByRole("button", { name: "模板设计", exact: true }).click();
    const templateLibrary = page.locator('[data-unified-template-library="design"]');

    for (const viewport of ["desktop", "mobile"] as const) {
      await page.getByRole("button", {
        name: viewport === "desktop" ? /桌面端模板布局/ : /移动端模板布局/,
      }).click();
      for (const entry of CONTENT_TEMPLATE_EDITOR_ACCEPTANCE_MATRIX) {
        const card = templateLibrary.locator(
          `[data-template-catalog-card="shared"][data-template-identity="source:legacy_system_${entry.templateKey}"]`,
        );
        await expect(card, `${entry.templateKey} 应只有一张设计目录卡`).toHaveCount(1);
        await card.scrollIntoViewIfNeeded();
        await expect(card.locator(`iframe[data-template-catalog-viewport="${viewport}"]`))
          .toHaveCount(1);
        const catalogFrame = card.frameLocator(
          `iframe[data-template-catalog-viewport="${viewport}"]`,
        );
        const catalogRoot = catalogFrame.locator("[data-dynamic-template-id]");
        await expect(catalogFrame.locator('[data-content-template-renderer="real"]')).toHaveCount(1);
        const catalogImageSources = await catalogFrame.locator("img").evaluateAll((images) =>
          images.map((image) => image.getAttribute("src") ?? ""),
        );
        expect(
          catalogImageSources.every((source) =>
            !/\.(?:avif|jpe?g|png|webp)(?:[?#]|$)/i.test(source),
          ),
          `${entry.templateKey}.${viewport} 模板预览不得加载真实摄影栅格图：${JSON.stringify(catalogImageSources)}`,
        ).toBe(true);
        const catalogTemplateId = await catalogRoot.getAttribute("data-dynamic-template-id");
        const control = card.locator(".homepage-editor__template-card-main");
        if (await control.getAttribute("aria-pressed") !== "true") await control.click();
        const canvasRoot = page.frameLocator(".template-editor__viewport-frame")
          .locator("[data-dynamic-template-id]");
        await expect(canvasRoot).toHaveAttribute("data-dynamic-template-device", viewport);
        if (!catalogTemplateId) throw new Error(`${entry.templateKey} 目录缺少稳定模板身份`);
        await expect(canvasRoot).toHaveAttribute("data-dynamic-template-id", catalogTemplateId);
        const [catalogSignature, canvasSignature] = await Promise.all([
          readDynamicTemplateRenderSignature(catalogRoot),
          readDynamicTemplateRenderSignature(canvasRoot),
        ]);
        expectDynamicTemplateRenderSignaturesEqual(
          canvasSignature,
          catalogSignature,
          `${entry.templateKey}.${viewport}`,
        );
      }
    }
    expect(runtimeErrors).toEqual([]);
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
          previewMediaUrls.every((url) =>
            !/\.(?:avif|jpe?g|png|webp)(?:[?#]|$)/i.test(url),
          ),
          `${contract.displayName} ${viewport} 模板预览不得加载真实摄影栅格图`,
        ).toBe(true);
        await frameElement.screenshot({
          path: testInfo.outputPath(`${entry.templateKey}-${viewport}.png`),
          animations: "disabled",
        });
        await page.getByRole("button", { name: "退出模板预览" }).click();
      }

      const qaName = `${contract.displayName}｜24模板QA`;
      await fillTemplateName(page, qaName);
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
      await expect(page.locator("span", { hasText: /^页面草稿已保存$/ }).last()).toBeVisible();
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
        await expect(page.locator("span", { hasText: /^页面草稿已保存$/ }).last()).toBeVisible();
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

  test("模板属性使用连续功能区并只提供对象适用的尺寸控件", async ({ page }, testInfo) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem("haichuan.dynamic-template-drafts.v1");
    });
    const { dynamic, forbiddenPageWrites } = await openWorkspaceShell(page, {
      role: "SUPER_ADMIN",
      draft: makeTemplateWorkspaceLayerDraft(),
    });
    await page.getByRole("button", { name: "模板设计" }).click();
    await page.getByRole("button", { name: "新建空白模板" }).click();

    const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    await inspector.getByRole("textbox", { name: "模板名称", exact: true }).fill("数值属性测试模板");
    const structure = page.getByRole("complementary", { name: "模板结构" });
    const { trigger: addTrigger, panel: addPanel } = await openTemplateStructureAddPanel(page);
    await addPanel.getByRole("button", { name: "图片槽位 内容槽位" }).click();
    await addTrigger.click();
    const measurement = inspector.getByLabel("当前画布数值");
    await expect(measurement).toContainText("横向位置 X");
    await expect(measurement).toContainText("纵向位置 Y");
    await expect(measurement).toContainText("实际宽度 W");
    await expect(measurement).toContainText("实际高度 H");
    await expect(measurement.locator("strong")).toHaveCount(4);
    await expect(measurement.locator("strong").nth(2)).toHaveText(/^\d+(?:\.\d)? px$/);
    await inspector.screenshot({
      path: testInfo.outputPath("template-inspector-default-values.png"),
      animations: "disabled",
    });
    await expect(inspector.getByRole("tab")).toHaveCount(0);
    await expect(inspector.locator("[data-template-inspector-section]")).toHaveCount(3);
    await expect(inspector.getByRole("group", { name: "槽位职责" })).toBeVisible();
    await expect(inspector.getByRole("group", { name: "显示样式" })).toBeVisible();
    await expect(inspector.getByRole("group", { name: "页面可编辑" })).toBeVisible();
    await expect(inspector.locator(".template-editor__inspector-context")).toHaveCount(0);
    const inspectorScroll = inspector.locator(".homepage-editor__inspector-scroll");
    await expect.poll(() => inspectorScroll.evaluate((element) => element.scrollHeight > element.clientHeight))
      .toBe(true);
    await inspectorScroll.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect(inspector.locator(".template-editor__validation-section")).toBeInViewport();
    await inspectorScroll.evaluate((element) => { element.scrollTop = 0; });
    await expect(measurement).toBeInViewport();
    await expect(inspector.getByText("显示状态", { exact: true })).toBeVisible();
    await expect(inspector.getByRole("button", { name: "布局方式：弹性" })).toHaveCount(0);
    await expect(inspector.getByRole("button", { name: "布局方式：网格" })).toHaveCount(0);
    await expect(inspector.getByRole("spinbutton", { name: "子项间距" })).toHaveCount(0);

    await inspector.getByRole("button", { name: "宽度策略：自定" }).click();
    await inspector.getByRole("spinbutton", { name: "自定义宽度" }).fill("60");
    await expect.poll(async () => {
      const text = await measurement.locator("small").nth(2).textContent();
      return Number.parseFloat(text ?? "0");
    }).toBeGreaterThan(59);
    await expect.poll(async () => {
      const text = await measurement.locator("small").nth(2).textContent();
      return Number.parseFloat(text ?? "100");
    }).toBeLessThan(61);

    await openTemplateInspectorDisclosure(inspector, "精细排列与尺寸");
    await inspector.getByRole("spinbutton", { name: "统一内边距" }).fill("12");
    await inspector.getByRole("button", { name: "分别设置内边距" }).click();
    await inspector.getByRole("spinbutton", { name: "内边距左" }).fill("24");
    await expect(page.frameLocator("iframe.template-editor__viewport-frame")
      .locator('[data-template-node-type="ImageSlot"]'))
      .toHaveCSS("padding-left", "24px");
    await expect(inspector.getByRole("spinbutton", { name: "统一内边距" })).toHaveValue("");

    await page.locator(".template-editor__toolbar").getByRole("button", { name: /移动端模板布局/ }).click();
    await expect.poll(async () => {
      const text = await measurement.locator("small").nth(2).textContent();
      return Number.parseFloat(text ?? "0");
    }).toBeGreaterThan(99);
    await expect(inspector.getByRole("spinbutton", { name: "统一内边距" })).toHaveValue("");
    await page.locator(".template-editor__toolbar").getByRole("button", { name: /桌面端模板布局/ }).click();
    await expect.poll(async () => {
      const text = await measurement.locator("small").nth(2).textContent();
      return Number.parseFloat(text ?? "100");
    }).toBeLessThan(61);
    await expect(page.frameLocator("iframe.template-editor__viewport-frame")
      .locator('[data-template-node-type="ImageSlot"]'))
      .toHaveCSS("padding-left", "24px");
    await expect(page.getByRole("button", { name: "撤销", exact: true })).toBeEnabled();
    await inspector.locator(".homepage-editor__inspector-scroll").evaluate((element) => {
      element.scrollTop = 0;
    });
    await inspector.screenshot({
      path: testInfo.outputPath("template-inspector-numeric-controls.png"),
      animations: "disabled",
    });

    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();
    const savedImageSlot = Object.values(dynamic.writes.at(-1)?.body.definition.nodes ?? {})
      .find((candidate: any) => candidate.type === "ImageSlot") as any;
    expect(savedImageSlot.responsive.desktop.width).toEqual({ value: 60, unit: "%" });
    expect(savedImageSlot.responsive.desktop.padding).toEqual({
      top: { value: 12, unit: "px" },
      right: { value: 12, unit: "px" },
      bottom: { value: 12, unit: "px" },
      left: { value: 24, unit: "px" },
    });

    await page.reload();
    await openTemplateFromCatalog(page, "数值属性测试模板");
    const restoredStructure = page.getByRole("complementary", { name: "模板结构" });
    await restoredStructure.getByRole("treeitem", { name: /图片槽位/ }).click();
    const restoredInspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    await expect(restoredInspector.getByRole("spinbutton", { name: "自定义宽度" })).toHaveValue("60");
    await openTemplateInspectorDisclosure(restoredInspector, "精细排列与尺寸");
    await restoredInspector.getByRole("button", { name: "分别设置内边距" }).click();
    await expect(restoredInspector.getByRole("spinbutton", { name: "内边距左" })).toHaveValue("24");
    expect(forbiddenPageWrites).toEqual([]);
  });
});
