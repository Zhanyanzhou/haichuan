import { expect, test, type Page, type Route } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { DynamicTemplatePageFieldDescriptor } from "../../src/page-builder/dynamic-template-instance/pageFieldDescriptors";
import type { TemplateDefinitionV2 } from "../../src/page-builder/template-definition";
import type {
  DynamicTemplateResource,
  PublishedDynamicTemplateResource,
} from "../../src/services/clients/dynamicTemplateClient";
import { installAdminSession } from "./session-auth";
import { systemTemplateCatalogItems } from "./template-catalog";

// 主路由确定性 UI 共用夹具。所有 /api 请求均被截获，模板与页面只保存在测试进程内。
// 默认仍拒绝页面写入；黄金闭环必须显式开启 pageLifecycle，不能冒充真实持久化证据。

export const NOW = "2026-09-09T10:00:00.000Z";
export const CHECKSUM = "c".repeat(64);
export const MAX_CANVAS_VIEWPORT_MULTIPLIER = 4;
export const NEW_TEMPLATE_NAME = "未命名模板";
export const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
export const homepageConfigSource = readFileSync(resolve("src/pages/admin/HomepageConfig/index.tsx"), "utf8");

export type CapturedWrite = {
  body: unknown;
  method: string;
  path: string;
};

export type NewTemplateMockServer = {
  pageDocument: ReturnType<typeof pageDraft>;
  publishedPage: ReturnType<typeof pageDraft> | null;
  failNextSaveWith: number | null;
  persisted: DynamicTemplateResource | null;
  published: PublishedDynamicTemplateResource | null;
  saveResults: Array<{
    checksum: string;
    revision: number;
    templateId: string;
  }>;
  writes: CapturedWrite[];
};

export type TemplateSessionSnapshot = {
  canvasZoom: number | null;
  definition: TemplateDefinitionV2 | null;
  device: "desktop" | "mobile";
  dirty: boolean;
  historyFuture: unknown[];
  historyPast: unknown[];
  inspectorTask: "design" | "page-scope";
  inspectorView: "context" | "page-fields";
  pageFields: DynamicTemplatePageFieldDescriptor[];
  previewMode: boolean;
  previewScenario: string;
  productionReviewFacts: {
    desktop: boolean;
    mobile: boolean;
    pageScope: boolean;
    stressPreview: Record<string, boolean>;
  };
  remote: Record<string, unknown> | null;
  saveStatus: string;
  selectedObjectId: string | null;
  semanticGeneration: number;
  sessionId: string | null;
};

export type CanvasReadout = {
  height: number;
  label: string;
  width: number;
  zoomPercent: number;
};

export function json(data: unknown, status = 200) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify({
      code: status,
      data,
      message: status < 400 ? "success" : "failure",
    }),
  };
}

export function pageDraft() {
  return {
    id: 9901,
    pageKey: "home",
    puckData: { content: [] as Array<{ type: string; props: Record<string, unknown> }>, zones: {}, root: { props: {} } },
    metadata: {},
    editorVersion: "0.22.4",
    status: "DRAFT",
    reviewStatus: "DRAFT",
    contentHash: "a".repeat(64),
    version: 0,
    publishedAt: null,
    publishedBy: null,
    updatedAt: NOW,
  };
}

export function makeResource(
  definition: TemplateDefinitionV2,
  revision: number,
  publishedVersion = 0,
): DynamicTemplateResource {
  return {
    id: 9801,
    templateId: definition.templateId,
    ownerId: 1,
    sourceType: "CUSTOM",
    visibility: publishedVersion > 0 ? "STAFF" : "PRIVATE",
    status: "ACTIVE",
    name: definition.name,
    category: definition.metadata.category,
    purpose: definition.metadata.purpose,
    layoutType: definition.metadata.layoutType,
    description: definition.description ?? null,
    slotSummary: definition.metadata.slotSummary,
    recommendedFor: [...definition.metadata.recommendedFor],
    tags: [...definition.metadata.tags],
    definitionSchemaVersion: definition.schemaVersion,
    publishedVersion,
    sourceReference: null,
    archivedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    canDelete: true,
    deleteBlockers: [],
    draft: {
      id: 9802,
      baseVersion: publishedVersion || null,
      revision,
      definition: structuredClone(definition),
      definitionChecksum: CHECKSUM,
      versionNote: null,
      updatedAt: NOW,
    },
  };
}

export function makePublished(
  resource: DynamicTemplateResource,
  definition: TemplateDefinitionV2,
): PublishedDynamicTemplateResource {
  return {
    templateId: resource.templateId,
    sourceReference: null,
    name: definition.name,
    category: definition.metadata.category,
    purpose: definition.metadata.purpose,
    layoutType: definition.metadata.layoutType,
    description: definition.description ?? null,
    slotSummary: definition.metadata.slotSummary,
    recommendedFor: [...definition.metadata.recommendedFor],
    tags: [...definition.metadata.tags],
    version: 1,
    schemaVersion: definition.schemaVersion,
    definition: structuredClone(definition),
    definitionChecksum: CHECKSUM,
    versionNote: null,
    publishedAt: NOW,
  };
}

export async function installNewTemplateServer(
  page: Page,
  options: { failNextSaveWith?: number; pageLifecycle?: boolean } = {},
) {
  const server: NewTemplateMockServer = {
    pageDocument: pageDraft(),
    publishedPage: null,
    failNextSaveWith: options.failNextSaveWith ?? null,
    persisted: null,
    published: null,
    saveResults: [],
    writes: [],
  };

  const recordWrite = (route: Route, path: string) => {
    const request = route.request();
    const write = {
      body: request.postDataJSON(),
      method: request.method(),
      path,
    };
    server.writes.push(write);
    return write;
  };

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const method = request.method();
    const path = new URL(request.url()).pathname;

    if (path === "/api/auth/profile") return route.fallback();
    if (path === "/api/page-modules/dynamic-templates/catalog" && method === "GET") {
      const items = [
        ...systemTemplateCatalogItems(),
        ...(server.persisted
          ? [{ kind: "editable" as const, template: server.persisted }]
          : []),
        ...(server.published
          ? [{ kind: "published" as const, template: server.published }]
          : []),
      ];
      return route.fulfill(json({ source: "unified", items }));
    }

    if (path === "/api/page-modules/dynamic-templates" && method === "POST") {
      const write = recordWrite(route, path);
      if (server.failNextSaveWith) {
        const status = server.failNextSaveWith;
        server.failNextSaveWith = null;
        return route.fulfill(json(null, status));
      }
      const body = write.body as { definition: TemplateDefinitionV2 };
      server.persisted = makeResource(body.definition, 1);
      server.saveResults.push({
        checksum: server.persisted.draft!.definitionChecksum,
        revision: server.persisted.draft!.revision,
        templateId: server.persisted.templateId,
      });
      return route.fulfill(json(server.persisted));
    }

    const draftMatch = path.match(/^\/api\/page-modules\/dynamic-templates\/([^/]+)\/draft$/);
    if (draftMatch && method === "GET") {
      const templateId = decodeURIComponent(draftMatch[1]);
      return route.fulfill(json(
        server.persisted?.templateId === templateId ? server.persisted : null,
      ));
    }
    if (draftMatch && method === "PATCH") {
      const write = recordWrite(route, path);
      if (server.failNextSaveWith) {
        const status = server.failNextSaveWith;
        server.failNextSaveWith = null;
        return route.fulfill(json(null, status));
      }
      const body = write.body as {
        definition: TemplateDefinitionV2;
        expectedRevision: number;
      };
      if (!server.persisted?.draft || body.expectedRevision !== server.persisted.draft.revision) {
        return route.fulfill(json(null, 409));
      }
      server.persisted = makeResource(body.definition, body.expectedRevision + 1);
      server.saveResults.push({
        checksum: server.persisted.draft!.definitionChecksum,
        revision: server.persisted.draft!.revision,
        templateId: server.persisted.templateId,
      });
      return route.fulfill(json(server.persisted));
    }

    const publishMatch = path.match(/^\/api\/page-modules\/dynamic-templates\/([^/]+)\/publish$/);
    if (publishMatch && method === "POST") {
      const write = recordWrite(route, path);
      if (!server.persisted?.draft) return route.fulfill(json(null, 409));
      const body = write.body as {
        expectedChecksum: string;
        expectedRevision: number;
        targetVersion: number;
      };
      if (body.expectedRevision !== server.persisted.draft.revision
        || body.expectedChecksum !== server.persisted.draft.definitionChecksum
        || body.targetVersion !== server.persisted.publishedVersion + 1) {
        return route.fulfill(json(null, 409));
      }
      const definition = server.persisted.draft.definition;
      server.published = makePublished(server.persisted, definition);
      server.persisted = makeResource(definition, body.expectedRevision + 1, body.targetVersion);
      return route.fulfill(json({
        templateId: definition.templateId,
        version: body.targetVersion,
        published: {
          id: 9803,
          dynamicTemplateId: server.persisted.id,
          version: body.targetVersion,
          schemaVersion: definition.schemaVersion,
          definition: structuredClone(definition),
          definitionChecksum: body.expectedChecksum,
          versionNote: null,
          publishedAt: NOW,
        },
        draft: server.persisted.draft,
        outcome: "published",
      }));
    }

    const versionsMatch = path.match(/^\/api\/page-modules\/dynamic-templates\/([^/]+)\/versions$/);
    if (versionsMatch && method === "GET") {
      return route.fulfill(json({
        items: server.published ? [{
          id: 9803,
          dynamicTemplateId: server.persisted?.id ?? 9801,
          version: 1,
          schemaVersion: server.published.schemaVersion,
          definitionChecksum: server.published.definitionChecksum,
          versionNote: null,
          publishedAt: NOW,
        }] : [],
        nextBeforeVersion: null,
      }));
    }

    const publishedVersionMatch = path.match(
      /^\/api\/page-modules\/dynamic-templates\/published\/([^/]+)\/versions\/(\d+)$/,
    );
    if (publishedVersionMatch && method === "GET") {
      if (!server.published) return route.fulfill(json(null));
      return route.fulfill(json({
        id: 9803,
        dynamicTemplateId: server.persisted?.id ?? 9801,
        templateId: server.published.templateId,
        version: server.published.version,
        schemaVersion: server.published.schemaVersion,
        definition: server.published.definition,
        definitionChecksum: server.published.definitionChecksum,
        versionNote: server.published.versionNote,
        publishedAt: server.published.publishedAt,
      }));
    }

    if (path.endsWith("/page-modules/document/validate")) {
      return route.fulfill(json({ valid: true, errors: [], issues: [] }));
    }
    if (path.includes("/page-modules/document/revisions")) return route.fulfill(json([]));
    if (path.includes("/page-modules/document/published")) return route.fulfill(json(server.publishedPage));
    if (path.includes("/page-modules/document/admin")) return route.fulfill(json(server.pageDocument));
    if (options.pageLifecycle && path === "/api/page-modules/document/review/submit" && method === "POST") {
      recordWrite(route, path);
      server.pageDocument = {
        ...server.pageDocument,
        reviewStatus: "IN_REVIEW",
      };
      return route.fulfill(json(server.pageDocument));
    }
    if (options.pageLifecycle && path === "/api/page-modules/document/review" && method === "PUT") {
      const { body } = recordWrite(route, path);
      const action = (body as { action?: string }).action;
      server.pageDocument = {
        ...server.pageDocument,
        reviewStatus: action === "APPROVE" ? "APPROVED" : "CHANGES_REQUESTED",
      };
      return route.fulfill(json(server.pageDocument));
    }
    if (options.pageLifecycle && path === "/api/page-modules/document" && method === "PUT") {
      const { body } = recordWrite(route, path);
      server.pageDocument = { ...server.pageDocument, ...(body as object), version: server.pageDocument.version + 1 };
      if (server.published) {
        Object.assign(server.pageDocument.puckData, { resolvedDynamicTemplates: {
          [`${server.published.templateId}@${server.published.version}`]: {
            templateId: server.published.templateId, version: server.published.version,
            schemaVersion: server.published.schemaVersion, definitionChecksum: server.published.definitionChecksum,
            definition: structuredClone(server.published.definition),
          },
        } });
      }
      return route.fulfill(json(server.pageDocument));
    }
    if (options.pageLifecycle && path === "/api/page-modules/document/publish" && method === "PUT") {
      const { body } = recordWrite(route, path);
      server.publishedPage = {
        ...server.pageDocument,
        ...(body as object),
        status: "PUBLISHED",
        reviewStatus: "PUBLISHED",
      };
      return route.fulfill(json(server.publishedPage));
    }

    if (WRITE_METHODS.has(method)) {
      recordWrite(route, path);
      return route.fulfill(json(null, 409));
    }
    return route.fulfill(json({}));
  });

  await installAdminSession(page, {
    username: "td-ui-2a",
    realName: "TD-UI-2A 新建流程验收",
  });
  return server;
}

export async function readSession(page: Page) {
  return page.evaluate<TemplateSessionSnapshot>(async () => {
    const sessionPath = "/src/page-builder/template-editor/templateEditorSession.ts";
    const descriptorPath = "/src/page-builder/dynamic-template-instance/pageFieldDescriptors.ts";
    const [{ useTemplateEditorSession }, { getDynamicTemplatePageFieldDescriptors }] = await Promise.all([
      import(/* @vite-ignore */ sessionPath),
      import(/* @vite-ignore */ descriptorPath),
    ]);
    const state = useTemplateEditorSession.getState();
    const definition = state.draft ? structuredClone(state.draft.definition) : null;
    return {
      canvasZoom: state.canvasZoom,
      definition,
      device: state.device,
      dirty: state.dirty,
      historyFuture: structuredClone(state.historyFuture),
      historyPast: structuredClone(state.historyPast),
      inspectorTask: state.inspectorTask,
      inspectorView: state.inspectorView,
      pageFields: definition
        ? structuredClone(getDynamicTemplatePageFieldDescriptors(definition))
        : [],
      previewMode: state.previewMode,
      previewScenario: state.previewScenario,
      productionReviewFacts: structuredClone(state.productionReviewFacts),
      remote: state.draft?.remote ? structuredClone(state.draft.remote) : null,
      saveStatus: state.saveStatus,
      selectedObjectId: state.selectedObjectId,
      semanticGeneration: state.semanticGeneration,
      sessionId: state.sessionId,
    };
  });
}

export function stableAuthoringFacts(snapshot: TemplateSessionSnapshot) {
  return {
    definition: snapshot.definition,
    dirty: snapshot.dirty,
    historyFuture: snapshot.historyFuture,
    historyPast: snapshot.historyPast,
    remote: snapshot.remote,
    saveStatus: snapshot.saveStatus,
    semanticGeneration: snapshot.semanticGeneration,
    sessionId: snapshot.sessionId,
  };
}

export function guide(page: Page) {
  return page.getByRole("region", { name: "模板制作步骤", exact: true });
}

export async function productionStageAction(page: Page, label: string) {
  if (label === "交付信息") {
    await page.getByRole("button", { name: "更多模板操作", exact: true }).click();
    return page.getByRole("menuitem", { name: /模板资料与使用限制/ });
  }
  if (label === "页面开放范围") return page.getByRole("tab", { name: "页面开放范围", exact: true });
  if (label === "压力预览") return page.getByRole("button", { name: "预览模板", exact: true });
  if (label === "发布检查") return page.locator(".homepage-editor__toolbar").getByRole("button", { name: /^发布模板新版本/ });
  throw new Error("已删除制作任务链，请通过实际编辑入口操作：" + label);
}

export function firstRegionAction(page: Page) {
  return blankTemplateStart(page).getByRole("button", {
    name: "添加区域",
    exact: true,
  });
}

export function blankTemplateStart(page: Page) {
  return page.frameLocator('iframe[title$="模板隔离画布"]').getByRole("region", { name: "空白模板起步操作", exact: true });
}

export function structurePanel(page: Page) {
  return page.getByRole("complementary", { name: "模板结构", exact: true });
}

export async function openTemplateDesignWithoutDraft(page: Page) {
  await page.goto("/admin/editor/home");
  await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
  await page.getByRole("button", { name: "模板设计", exact: true }).click();
  await expect(page.getByRole("region", { name: "空模板画布", exact: true })).toBeVisible();
}

export async function createBlankTemplate(page: Page) {
  await openTemplateDesignWithoutDraft(page);
  // 旧空白模板兼容编辑夹具：仅在自有 Mock 页面装入 schema 2 草稿。
  // 新建产品入口的七步向导另由 recipe/new-template-flow 用例验证；
  // 后编辑测试不再把“新建必须空白”作为当前产品约束。
  await page.evaluate(async (name) => {
    const repoPath = "/src/page-builder/template-editor/dynamicTemplateDraftRepository.ts";
    const sessionPath = "/src/page-builder/template-editor/templateEditorSession.ts";
    const [{ createNewDynamicTemplateDraft }, { useTemplateEditorSession }] = await Promise.all([
      import(/* @vite-ignore */ repoPath), import(/* @vite-ignore */ sessionPath),
    ]);
    const draft = createNewDynamicTemplateDraft(name);
    if (draft.definition.schemaVersion !== 2) throw new Error("兼容夹具必须保持 schema 2");
    useTemplateEditorSession.getState().open(draft, { isNew: true });
  }, NEW_TEMPLATE_NAME);
  await expect(blankTemplateStart(page)).toBeVisible();
  const snapshot = await readSession(page);
  if (!snapshot.definition) throw new Error("兼容夹具缺少模板定义");
  return snapshot;
}

export async function waitForMeasurementCycles(page: Page, cycles = 2) {
  await page.evaluate(async (count) => {
    for (let index = 0; index < count; index += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
  }, cycles);
}

export async function readCanvasReadout(page: Page): Promise<CanvasReadout> {
  // 桌面与移动画布会同时保留各自的 live output；只读取用户当前可见设备。
  const readout = page.locator("output[aria-label^='画布尺寸 ']:visible");
  await expect(readout).toHaveCount(1);
  const label = await readout.getAttribute("aria-label");
  const match = label?.match(/^画布尺寸\s+(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)，缩放\s*(\d+(?:\.\d+)?)%$/);
  if (!label || !match) throw new Error(`无法读取画布尺寸：${label ?? "缺失"}`);
  return {
    height: Number(match[2]),
    label,
    width: Number(match[1]),
    zoomPercent: Number(match[3]),
  };
}

export async function expectHealthyStableCanvas(page: Page) {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("测试缺少视口尺寸");
  await waitForMeasurementCycles(page, 2);
  const first = await readCanvasReadout(page);
  for (const value of [first.width, first.height, first.zoomPercent]) {
    expect(Number.isFinite(value), `画布读数必须为有限数：${first.label}`).toBe(true);
    expect(value, `画布读数必须为正数：${first.label}`).toBeGreaterThan(0);
  }
  expect(first.width, `画布宽度应保持在可设计范围：${first.label}`).toBeLessThanOrEqual(2560);
  expect(
    first.height,
    `画布高度不得超过 ${MAX_CANVAS_VIEWPORT_MULTIPLIER} 个当前视口：${first.label}`,
  ).toBeLessThanOrEqual(viewport.height * MAX_CANVAS_VIEWPORT_MULTIPLIER);

  await waitForMeasurementCycles(page, 2);
  const second = await readCanvasReadout(page);
  expect(
    second.height,
    `连续测量后画布高度不得继续增长：${first.label} -> ${second.label}`,
  ).toBeLessThanOrEqual(first.height + 2);
  expect(second.width).toBe(first.width);
  return second;
}

export async function addFirstRegion(page: Page) {
  // 几何、后续制作链使用既有结构命令入口；空白画布唯一主 CTA 另有独立断言。
  await structurePanel(page).getByRole("button", { name: "添加区域", exact: true }).click();
  await expect(page.getByRole("tree", { name: "模板区域与槽位" })
    .getByRole("treeitem", { name: /内容区域 1/ })).toBeVisible();
}

export async function addTwoRegions(page: Page) {
  await addFirstRegion(page);
  await structurePanel(page).getByRole("button", { name: "添加区域", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "添加区域", exact: true });
  const insertion = dialog.getByLabel("区域插入位置");
  await expect(insertion).toBeVisible();
  await expect(insertion.locator("option")).toHaveText([
    "当前区域前",
    "当前区域后",
    "模板末尾",
  ]);
  await insertion.selectOption("after");
  await dialog.getByRole("button", { name: "确认添加区域", exact: true }).click();
  const tree = page.getByRole("tree", { name: "模板区域与槽位" });
  await expect(tree.getByRole("treeitem", { name: /内容区域 1/ })).toBeVisible();
  await expect(tree.getByRole("treeitem", { name: /内容区域 2/ })).toBeVisible();
}

export async function chooseAddTarget(page: Page, label: string) {
  const select = page.getByLabel("添加目标");
  const value = await select.locator("option").filter({ hasText: label }).getAttribute("value");
  if (!value) throw new Error(`缺少添加目标：${label}`);
  await select.selectOption(value);
}

export async function addContentGroupsAndSlots(page: Page) {
  await addTwoRegions(page);
  const tree = page.getByRole("tree", { name: "模板区域与槽位" });
  const structure = structurePanel(page);

  await tree.getByRole("treeitem", { name: /内容区域 1/ }).click();
  await structure.getByRole("button", { name: "添加槽位", exact: true }).click();
  await page.getByRole("button", { name: "添加左右排列布局分组", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByLabel("节点名称").first().fill("图片组");
  await page.getByLabel("节点名称").first().press("Tab");
  await structure.getByRole("button", { name: "添加槽位", exact: true }).click();
  await chooseAddTarget(page, "图片组");
  await page.getByRole("button", { name: "添加图片槽位", exact: true }).click();
  await page.keyboard.press("Escape");

  await tree.getByRole("treeitem", { name: /内容区域 2/ }).click();
  await structure.getByRole("button", { name: "添加槽位", exact: true }).click();
  await page.getByRole("button", { name: "添加上下排列布局分组", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByLabel("节点名称").first().fill("文字组");
  await page.getByLabel("节点名称").first().press("Tab");
  await structure.getByRole("button", { name: "添加槽位", exact: true }).click();
  await chooseAddTarget(page, "文字组");
  await page.getByRole("button", { name: "添加标题槽位", exact: true }).click();
  await page.getByRole("button", { name: "添加正文槽位", exact: true }).click();
  await page.getByRole("button", { name: "添加按钮槽位", exact: true }).click();
  await page.keyboard.press("Escape");

  for (const name of [
    "图片组 布局容器",
    "图片槽位",
    "文字组 布局容器",
    "标题槽位",
    "正文槽位",
    "按钮槽位",
  ]) {
    await expect(tree.getByRole("treeitem", { name: new RegExp(name) })).toBeVisible();
  }
}

export async function applyBasicSkeleton(page: Page) {
  // 历史后编辑测试夹具：已删除的骨架弹窗不再是产品入口。
  await page.evaluate(async () => {
    const repoPath = "/src/page-builder/template-editor/dynamicTemplateDraftRepository.ts";
    const sessionPath = "/src/page-builder/template-editor/templateEditorSession.ts";
    const [{ createBasicContentSkeletonDefinition }, { useTemplateEditorSession }] = await Promise.all([
      import(/* @vite-ignore */ repoPath), import(/* @vite-ignore */ sessionPath),
    ]);
    const state = useTemplateEditorSession.getState();
    const result = state.executeCommand({ type: "transform-definition", label: "装入历史骨架夹具", transform: createBasicContentSkeletonDefinition });
    if (!result.ok) throw new Error("历史骨架夹具无效");
  });
}

export async function fillTemplateName(page: Page, name: string) {
  const input = page.locator('[data-template-inspector-field="name"]')
    .getByRole("textbox", { name: "模板名称", exact: true });
  await expect(input).toHaveCount(1);
  await input.fill(name);
  await input.press("Tab");
  await expect(input).toHaveValue(name);
}

export async function fillTemplateIdentity(page: Page, name: string, purpose: string) {
  const identityEntry = await productionStageAction(page, "交付信息");
  await identityEntry.focus();
  await page.keyboard.press("Enter");
  await fillTemplateName(page, name);
  const purposeInput = page.locator('[data-template-inspector-field="metadata.purpose"]')
    .getByRole("textbox", { name: "用途", exact: true });
  await expect(purposeInput).toHaveCount(1);
  await purposeInput.fill(purpose);
  await purposeInput.press("Tab");
  await expect(purposeInput).toHaveValue(purpose);
  return page.getByRole("button", { name: "更多模板操作", exact: true });
}

export async function saveTemplate(page: Page) {
  await page.locator('.homepage-editor__toolbar [data-workspace-action="save"]').click();
}

export async function completeProductionReviews(page: Page) {
  await page.getByRole("button", { name: "预览模板", exact: true }).click();
  const scenario = page.getByLabel("压力预览场景", { exact: true });
  for (const value of ["short-text", "long-text", "optional-missing", "required-missing", "media-ratios"]) {
    await scenario.selectOption(value);
    await page.getByRole("button", { name: "确认当前压力预览场景已核对", exact: true }).click();
  }
  await page.getByRole("button", { name: "退出预览并继续编辑", exact: true }).click();
  await page.getByRole("tab", { name: "页面开放范围", exact: true }).click();
  await (await productionStageAction(page, "发布检查")).click();
  const review = page.getByRole("region", { name: "本次发布检查", exact: true });
  await review.getByText("预览与核对（可选）", { exact: true }).click();
  await review.getByRole("button", { name: "发布检查桌面端模板布局", exact: true }).click();
  await review.getByRole("button", { name: "确认已核对桌面端布局", exact: true }).click();
  await review.getByRole("button", { name: "发布检查移动端模板布局", exact: true }).click();
  await review.getByRole("button", { name: "确认已核对移动端布局", exact: true }).click();
  await review.getByRole("button", { name: "确认页面开放范围已核对", exact: true }).click();
  await review.getByRole("button", { name: "返回编辑", exact: true }).click();
}

export async function setSwitch(page: Page, name: string, checked: boolean) {
  const control = page.getByRole("switch", { name, exact: true });
  const current = await control.getAttribute("aria-checked") === "true";
  if (current !== checked) await control.click();
  await expect(control).toHaveAttribute("aria-checked", String(checked));
}
