import { expect, test, type Page, type Route } from "@playwright/test";

import { createBlankDynamicTemplateDefinition, type TemplateDefinitionV2 } from "../src/page-builder/template-definition";
import {
  setTemplateDesignHeightMode,
  setTemplateDesignWidth,
} from "../src/page-builder/template-definition/templateDimensions";
import { deriveTemplatePersistencePresentation } from "../src/page-builder/template-editor/templatePublishWorkflow";
import type { TemplateEditorDraft } from "../src/page-builder/template-editor/types";
import type {
  DynamicTemplateResource,
  PublishedDynamicTemplateResource,
} from "../src/services/clients/dynamicTemplateClient";
import { installAdminSession } from "./fixtures/session-auth";
import { productionStageAction } from "./fixtures/template-authoring-main-route";

const NOW = "2026-09-09T10:00:00.000Z";
const CREATED_CHECKSUM = "c".repeat(64);
const DRAFT_TEMPLATE_ID = "tpl_lifecycle_draft";
const PUBLISHED_TEMPLATE_ID = "tpl_lifecycle_published";
const DRAFT_TEMPLATE_NAME = "普通草稿模板";
const PUBLISHED_TEMPLATE_NAME = "已发布模板";
const PUBLISHED_NO_DRAFT_TEMPLATE_ID = "tpl_lifecycle_published_without_draft";
const PUBLISHED_NO_DRAFT_TEMPLATE_NAME = "缺少草稿的已发布模板";
const LEGACY_SOURCE_TEMPLATE_ID = "tpl_legacy_source_record";
const LEGACY_SOURCE_TEMPLATE_NAME = "历史 Repository 记录";
const LEGACY_SOURCE_REFERENCE = "legacy_system_hero";
const HERO_TEMPLATE_ID = "tpl_repository_hero_4_3";
const HERO_TEMPLATE_NAME = "首屏";
const CAMPAIGN_TEMPLATE_ID = "tpl_repository_campaign_wide";
const CAMPAIGN_TEMPLATE_NAME = "限时活动";
const NEW_TEMPLATE_NAME = "唯一入口新建模板";
const MAX_CANVAS_VIEWPORT_MULTIPLIER = 4;
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const SOURCE_LEVEL_WORDS = /内置模板|系统模板|系统必填内容|动态模板|个人模板|自定义模板/;

type CapturedWrite = {
  body: unknown;
  method: string;
  path: string;
  url: string;
};

type LifecycleServer = {
  allWrites: CapturedWrite[];
  catalogRequests: number;
  draftRequests: string[];
  published: PublishedDynamicTemplateResource[];
  records: DynamicTemplateResource[];
  writes: CapturedWrite[];
};

function json(data: unknown, status = 200) {
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

function pageDraft() {
  return {
    id: 9901,
    pageKey: "home",
    puckData: { content: [], zones: {}, root: { props: {} } },
    metadata: {},
    editorVersion: "0.22.4",
    status: "DRAFT",
    version: 0,
    publishedAt: null,
    publishedBy: null,
    updatedAt: NOW,
  };
}

function makeDefinition(templateId: string, name: string) {
  const definition = createBlankDynamicTemplateDefinition(name);
  definition.templateId = templateId;
  definition.name = name;
  return definition;
}

function makeSizedDefinition(
  templateId: string,
  name: string,
  options: { height: number; mode: "aspect-ratio" | "fixed"; width: number },
) {
  let definition = makeDefinition(templateId, name);
  definition = setTemplateDesignWidth(definition, "desktop", options.width);
  definition = setTemplateDesignHeightMode(
    definition,
    "desktop",
    options.mode,
    options.mode === "aspect-ratio"
      ? { width: options.width, height: options.height }
      : options.height,
  );
  return definition;
}

function makeResource(options: {
  canDelete?: boolean;
  checksum?: string;
  definition: TemplateDefinitionV2;
  deleteBlockers?: DynamicTemplateResource["deleteBlockers"];
  id: number;
  includeDraft?: boolean;
  publishedVersion?: number;
  revision?: number;
  sourceReference?: string | null;
  status?: "ACTIVE" | "ARCHIVED";
}): DynamicTemplateResource {
  const {
    canDelete = true,
    checksum = "a".repeat(64),
    definition,
    deleteBlockers = [],
    id,
    includeDraft = true,
    publishedVersion = 0,
    revision = 1,
    sourceReference = null,
    status = "ACTIVE",
  } = options;
  return {
    id,
    templateId: definition.templateId,
    ownerId: 1,
    sourceType: "CUSTOM",
    visibility: publishedVersion > 0 ? "STAFF" : "PRIVATE",
    status,
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
    sourceReference,
    archivedAt: status === "ARCHIVED" ? NOW : null,
    createdAt: NOW,
    updatedAt: NOW,
    canDelete,
    deleteBlockers,
    draft: includeDraft ? {
      id: id * 10,
      baseVersion: publishedVersion || null,
      revision,
      definition: structuredClone(definition),
      definitionChecksum: checksum,
      versionNote: null,
      updatedAt: NOW,
    } : null,
  };
}

function makePublished(
  resource: DynamicTemplateResource,
  checksum = resource.draft?.definitionChecksum ?? "b".repeat(64),
): PublishedDynamicTemplateResource {
  if (!resource.draft || resource.publishedVersion <= 0) {
    throw new Error("正式模板夹具必须包含草稿和正式版本号");
  }
  return {
    templateId: resource.templateId,
    sourceReference: resource.sourceReference,
    name: resource.name,
    category: resource.category,
    purpose: resource.purpose,
    layoutType: resource.layoutType,
    description: resource.description,
    slotSummary: resource.slotSummary,
    recommendedFor: [...resource.recommendedFor],
    tags: [...resource.tags],
    version: resource.publishedVersion,
    schemaVersion: resource.definitionSchemaVersion,
    definition: structuredClone(resource.draft.definition),
    definitionChecksum: checksum,
    versionNote: null,
    publishedAt: NOW,
  };
}

function readRequestBody(route: Route) {
  return route.request().postData() ? route.request().postDataJSON() as unknown : null;
}

function captureWrite(route: Route): CapturedWrite {
  const request = route.request();
  return {
    body: readRequestBody(route),
    method: request.method(),
    path: new URL(request.url()).pathname,
    url: request.url(),
  };
}

async function installLifecycleServer(
  page: Page,
  options: {
    archiveGate?: Promise<void>;
    deleteGate?: Promise<void>;
    deleteSucceeds?: boolean;
    createDraftFromPublishedGate?: Promise<void>;
    createDraftFromPublishedResult?: "success" | "conflict" | "malformed";
    includeStandardRecords?: boolean;
    includePublishedWithoutDraft?: boolean;
    legacySourceRecord?: boolean;
    operatorWorkflowRecords?: boolean;
    sharedSourceRecords?: boolean;
  } = {},
) {
  const records: DynamicTemplateResource[] = [];
  const published: PublishedDynamicTemplateResource[] = [];
  let nextId = 9400;

  if (options.includeStandardRecords) {
    const draft = makeResource({
      definition: makeDefinition(DRAFT_TEMPLATE_ID, DRAFT_TEMPLATE_NAME),
      id: 9101,
    });
    const publishedCurrent = makeResource({
      checksum: "b".repeat(64),
      definition: makeDefinition(PUBLISHED_TEMPLATE_ID, PUBLISHED_TEMPLATE_NAME),
      id: 9201,
      publishedVersion: 2,
      revision: 4,
    });
    records.push(draft, publishedCurrent);
    published.push(makePublished(publishedCurrent));
  }

  if (options.sharedSourceRecords) {
    records.push(
      makeResource({
        definition: makeDefinition("tpl_shared_source_a", "同来源记录 A"),
        id: 9301,
        sourceReference: DRAFT_TEMPLATE_ID,
      }),
      makeResource({
        definition: makeDefinition("tpl_shared_source_b", "同来源记录 B"),
        id: 9302,
        sourceReference: DRAFT_TEMPLATE_ID,
      }),
    );
  }

  if (options.operatorWorkflowRecords) {
    records.push(
      makeResource({
        definition: makeSizedDefinition(HERO_TEMPLATE_ID, HERO_TEMPLATE_NAME, {
          height: 900,
          mode: "aspect-ratio",
          width: 1200,
        }),
        id: 9311,
      }),
      makeResource({
        definition: makeSizedDefinition(CAMPAIGN_TEMPLATE_ID, CAMPAIGN_TEMPLATE_NAME, {
          height: 640,
          mode: "fixed",
          width: 1920,
        }),
        id: 9312,
      }),
    );
  }

  if (options.legacySourceRecord) {
    records.push(makeResource({
      definition: makeDefinition(LEGACY_SOURCE_TEMPLATE_ID, LEGACY_SOURCE_TEMPLATE_NAME),
      id: 9321,
      sourceReference: LEGACY_SOURCE_REFERENCE,
    }));
  }

  if (options.includePublishedWithoutDraft) {
    const publishedWithoutDraft = makeResource({
      checksum: "f".repeat(64),
      definition: makeDefinition(PUBLISHED_NO_DRAFT_TEMPLATE_ID, PUBLISHED_NO_DRAFT_TEMPLATE_NAME),
      id: 9351,
      publishedVersion: 3,
      revision: 6,
    });
    published.push(makePublished(publishedWithoutDraft));
    publishedWithoutDraft.draft = null;
    records.push(publishedWithoutDraft);
  }

  const server: LifecycleServer = {
    allWrites: [],
    catalogRequests: 0,
    draftRequests: [],
    published,
    records,
    writes: [],
  };

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const method = request.method();
    const path = new URL(request.url()).pathname;

    if (path === "/api/auth/profile") return route.fallback();
    if (path === "/api/page-modules/dynamic-templates/catalog" && method === "GET") {
      server.catalogRequests += 1;
      return route.fulfill(json({
        source: "unified",
        items: [
          ...server.published.map((template) => ({ kind: "published" as const, template })),
          ...server.records.map((template) => ({ kind: "editable" as const, template })),
        ],
      }));
    }
    if (path === "/api/page-modules/dynamic-templates/mine" && method === "GET") {
      return route.fulfill(json(structuredClone(server.records)));
    }
    if (path === "/api/page-modules/dynamic-templates/published" && method === "GET") {
      return route.fulfill(json(structuredClone(server.published)));
    }

    if (path === "/api/page-modules/dynamic-templates" && method === "POST") {
      const write = captureWrite(route);
      server.writes.push(write);
      server.allWrites.push(write);
      const body = write.body as {
        definition: TemplateDefinitionV2;
        sourceReference?: string;
        versionNote?: string;
      };
      if (body.sourceReference) return route.fulfill(json(null, 422));
      const resource = makeResource({
        checksum: CREATED_CHECKSUM,
        definition: body.definition,
        id: nextId,
      });
      resource.draft!.versionNote = body.versionNote ?? null;
      nextId += 1;
      server.records.unshift(resource);
      return route.fulfill(json(structuredClone(resource)));
    }

    const createDraftFromPublishedMatch = path.match(
      /^\/api\/page-modules\/dynamic-templates\/([^/]+)\/draft\/from-published$/,
    );
    if (createDraftFromPublishedMatch && method === "POST") {
      const write = captureWrite(route);
      server.writes.push(write);
      server.allWrites.push(write);
      await options.createDraftFromPublishedGate;
      if (options.createDraftFromPublishedResult === "conflict") {
        return route.fulfill(json(null, 409));
      }
      const templateId = decodeURIComponent(createDraftFromPublishedMatch[1]);
      const resource = server.records.find((item) => item.templateId === templateId);
      const publishedTemplate = server.published.find((item) => item.templateId === templateId);
      const body = write.body as {
        expectedVersion?: number;
        expectedChecksum?: string;
      } | null;
      if (
        !resource
        || resource.draft
        || !publishedTemplate
        || body?.expectedVersion !== publishedTemplate.version
        || body.expectedChecksum !== publishedTemplate.definitionChecksum
      ) return route.fulfill(json(null, 409));
      resource.draft = {
        id: resource.id * 10,
        baseVersion: publishedTemplate.version,
        revision: 1,
        definition: structuredClone(publishedTemplate.definition),
        definitionChecksum: publishedTemplate.definitionChecksum,
        versionNote: null,
        updatedAt: NOW,
      };
      const response = structuredClone(resource);
      if (options.createDraftFromPublishedResult === "malformed" && response.draft) {
        response.draft.definitionChecksum = "0".repeat(64);
      }
      return route.fulfill(json(response));
    }

    const draftMatch = path.match(/^\/api\/page-modules\/dynamic-templates\/([^/]+)\/draft$/);
    if (draftMatch && method === "GET") {
      const templateId = decodeURIComponent(draftMatch[1]);
      server.draftRequests.push(templateId);
      return route.fulfill(json(
        structuredClone(server.records.find((item) => item.templateId === templateId) ?? null),
      ));
    }

    const archiveMatch = path.match(/^\/api\/page-modules\/dynamic-templates\/([^/]+)\/archive$/);
    if (archiveMatch && method === "POST") {
      const write = captureWrite(route);
      server.writes.push(write);
      server.allWrites.push(write);
      await options.archiveGate;
      const templateId = decodeURIComponent(archiveMatch[1]);
      const resource = server.records.find((item) => item.templateId === templateId);
      const identity = write.body as {
        expectedRevision?: number;
        expectedChecksum?: string;
      } | null;
      if (!resource?.draft
        || resource.status !== "ACTIVE"
        || identity?.expectedRevision !== resource.draft.revision
        || identity.expectedChecksum !== resource.draft.definitionChecksum) {
        return route.fulfill(json(null, 409));
      }
      resource.status = "ARCHIVED";
      resource.archivedAt = NOW;
      resource.canDelete = false;
      return route.fulfill(json(structuredClone(resource)));
    }

    const restoreMatch = path.match(/^\/api\/page-modules\/dynamic-templates\/([^/]+)\/restore$/);
    if (restoreMatch && method === "POST") {
      const write = captureWrite(route);
      server.writes.push(write);
      server.allWrites.push(write);
      const templateId = decodeURIComponent(restoreMatch[1]);
      const resource = server.records.find((item) => item.templateId === templateId);
      if (!resource) return route.fulfill(json(null, 404));
      resource.status = "ACTIVE";
      resource.archivedAt = null;
      return route.fulfill(json(structuredClone(resource)));
    }

    const publishMatch = path.match(/^\/api\/page-modules\/dynamic-templates\/([^/]+)\/publish$/);
    if (publishMatch && method === "POST") {
      const write = captureWrite(route);
      server.writes.push(write);
      server.allWrites.push(write);
      const templateId = decodeURIComponent(publishMatch[1]);
      const resource = server.records.find((item) => item.templateId === templateId);
      if (!resource?.draft) return route.fulfill(json(null, 404));
      const body = write.body as {
        expectedChecksum: string;
        expectedRevision: number;
        targetVersion: number;
        versionNote?: string;
      };
      const publishedVersion = {
        id: nextId,
        dynamicTemplateId: resource.id,
        version: body.targetVersion,
        schemaVersion: resource.draft.definition.schemaVersion,
        definition: structuredClone(resource.draft.definition),
        definitionChecksum: body.expectedChecksum,
        versionNote: body.versionNote ?? null,
        publishedAt: NOW,
      };
      const catalogVersion: PublishedDynamicTemplateResource = {
        ...makePublished({ ...resource, publishedVersion: body.targetVersion }, body.expectedChecksum),
        versionNote: body.versionNote ?? null,
      };
      server.published = server.published.filter((item) => item.templateId !== templateId);
      server.published.push(catalogVersion);
      resource.publishedVersion = body.targetVersion;
      resource.visibility = "STAFF";
      resource.draft = {
        ...resource.draft,
        baseVersion: body.targetVersion,
        revision: body.expectedRevision + 1,
        definitionChecksum: body.expectedChecksum,
        versionNote: null,
      };
      nextId += 1;
      return route.fulfill(json({
        templateId,
        version: body.targetVersion,
        published: publishedVersion,
        draft: structuredClone(resource.draft),
        outcome: "published",
      }));
    }

    const versionsMatch = path.match(/^\/api\/page-modules\/dynamic-templates\/([^/]+)\/versions$/);
    if (versionsMatch && method === "GET") {
      const templateId = decodeURIComponent(versionsMatch[1]);
      const version = server.published.find((item) => item.templateId === templateId);
      return route.fulfill(json({
        items: version ? [{
          id: 9501,
          dynamicTemplateId: server.records.find((item) => item.templateId === templateId)?.id ?? 0,
          version: version.version,
          schemaVersion: version.schemaVersion,
          definitionChecksum: version.definitionChecksum,
          versionNote: version.versionNote,
          publishedAt: version.publishedAt,
        }] : [],
        nextBeforeVersion: null,
      }));
    }

    const publishedVersionMatch = path.match(
      /^\/api\/page-modules\/dynamic-templates\/published\/([^/]+)\/versions\/(\d+)$/,
    );
    if (publishedVersionMatch && method === "GET") {
      const templateId = decodeURIComponent(publishedVersionMatch[1]);
      const version = Number(publishedVersionMatch[2]);
      const publishedTemplate = server.published.find((item) => (
        item.templateId === templateId && item.version === version
      ));
      if (!publishedTemplate) return route.fulfill(json(null, 404));
      return route.fulfill(json({
        id: 9501,
        dynamicTemplateId: server.records.find((item) => item.templateId === templateId)?.id ?? 0,
        templateId,
        version,
        schemaVersion: publishedTemplate.schemaVersion,
        definition: structuredClone(publishedTemplate.definition),
        definitionChecksum: publishedTemplate.definitionChecksum,
        versionNote: publishedTemplate.versionNote,
        publishedAt: publishedTemplate.publishedAt,
      }));
    }

    const deleteMatch = path.match(/^\/api\/page-modules\/dynamic-templates\/([^/]+)$/);
    if (deleteMatch && method === "DELETE") {
      const write = captureWrite(route);
      server.writes.push(write);
      server.allWrites.push(write);
      await options.deleteGate;
      const templateId = decodeURIComponent(deleteMatch[1]);
      const index = server.records.findIndex((item) => item.templateId === templateId);
      const resource = index >= 0 ? server.records[index] : null;
      if (!options.deleteSucceeds || !resource || resource.status !== "ARCHIVED" || !resource.canDelete) {
        return route.fulfill(json(null, 409));
      }
      server.records.splice(index, 1);
      return route.fulfill(json({ deleted: true }));
    }

    if (path.endsWith("/page-modules/document/validate")) {
      return route.fulfill(json({ valid: true, errors: [], issues: [] }));
    }
    if (path.includes("/page-modules/document/revisions")) return route.fulfill(json([]));
    if (path.includes("/page-modules/document/published")) return route.fulfill(json(null));
    if (path.includes("/page-modules/document/admin")) return route.fulfill(json(pageDraft()));

    if (WRITE_METHODS.has(method)) {
      const write = captureWrite(route);
      server.allWrites.push(write);
      return route.fulfill(json(null, 409));
    }
    return route.fulfill(json({}));
  });

  await installAdminSession(page, {
    username: "td-lifecycle-ui-red1",
    realName: "模板生命周期验收",
    role: "SUPER_ADMIN",
  });
  return server;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function activeTemplateCard(page: Page, name: string, status: string) {
  const draftState = "(?:草稿已保存|草稿有修改|当前草稿，(?:已保存|有未保存修改))";
  const publishedState = status === "已发布" ? "，线上 v\\d+" : "";
  return page.getByRole("button", {
    name: new RegExp(`^(?:打开|正在编辑)${escapeRegExp(name)}(?:模板)?，${draftState}${publishedState}$`),
  });
}

function archivedTemplateCard(page: Page, name: string) {
  return page.getByRole("button", {
    name: new RegExp(`^回收站模板“${escapeRegExp(name)}”，恢复后才能设计，状态：已移入回收站`),
  });
}

function publishedWithoutDraftCard(page: Page) {
  return page.getByRole("button", {
    name: new RegExp(`^${PUBLISHED_NO_DRAFT_TEMPLATE_NAME}缺少编辑草稿`),
  });
}

async function confirmCreateDraftFromPublished(page: Page) {
  await publishedWithoutDraftCard(page).click();
  const dialog = page.getByRole("dialog", {
    name: new RegExp(`^从正式版本 v3 建立“${PUBLISHED_NO_DRAFT_TEMPLATE_NAME}”的编辑草稿`),
  });
  await expect(dialog).toContainText("在服务端创建一份可编辑草稿");
  await expect(dialog).toContainText("不会发布模板、升级页面实例或修改任何页面");
  await dialog.getByRole("button", { name: "建立并打开编辑草稿", exact: true }).click();
}

async function openDesignCatalog(page: Page) {
  await page.goto("/admin/editor/home", { waitUntil: "domcontentloaded" });
  const designMode = page.getByRole("button", { name: "模板设计", exact: true });
  await expect(designMode).toBeVisible({ timeout: 15_000 });
  await designMode.click();
  await expect(page.getByRole("complementary", { name: "模板组件库" })).toBeVisible();
}

async function openCardAction(page: Page, name: string, action: string) {
  await page.getByRole("button", { name: `更多模板操作：${name}`, exact: true }).click();
  const menuItem = menuItemByAction(page, action);
  await expect(menuItem).toBeVisible();
  return menuItem;
}

function menuItemByAction(page: Page, action: string) {
  return page.getByRole("menuitem", {
    name: new RegExp(`^(?:\\S+ )?${escapeRegExp(action)}$`),
  });
}

async function expectActiveLifecycleActions(page: Page, name: string) {
  await page.getByRole("button", { name: `更多模板操作：${name}`, exact: true }).click();
  for (const action of ["打开编辑", "移入回收站"]) {
    await expect(menuItemByAction(page, action)).toBeVisible();
  }
  await expect(menuItemByAction(page, "另存副本")).toHaveCount(0);
  await expect(menuItemByAction(page, "另存为模板")).toHaveCount(0);
  await page.keyboard.press("Escape");
}

async function readTemplateSession(page: Page) {
  return page.evaluate(async () => {
    const sessionPath = "/src/page-builder/template-editor/templateEditorSession.ts";
    const { useTemplateEditorSession } = await import(/* @vite-ignore */ sessionPath);
    const state = useTemplateEditorSession.getState();
    return {
      definition: state.draft ? structuredClone(state.draft.definition) : null,
      dirty: state.dirty,
      compatibilityRecovery: state.draft?.compatibilityRecovery
        ? structuredClone(state.draft.compatibilityRecovery)
        : null,
      remote: state.draft?.remote ? structuredClone(state.draft.remote) : null,
      requiresContractNormalization: state.draft?.requiresContractNormalization === true,
      sourceReference: state.draft?.sourceReference ?? null,
      sourceType: state.draft?.sourceType ?? null,
      versionNote: state.draft?.versionNote ?? null,
    };
  });
}

async function waitForMeasurementCycles(page: Page, cycles = 2) {
  await page.evaluate(async (count) => {
    for (let index = 0; index < count; index += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
  }, cycles);
}

async function readCanvasReadout(page: Page) {
  const readout = page.locator("output[aria-label^='画布尺寸 ']:visible");
  await expect(readout).toHaveCount(1);
  const label = await readout.getAttribute("aria-label");
  const match = label?.match(
    /^画布尺寸\s+(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)，缩放\s*(\d+(?:\.\d+)?)%$/,
  );
  if (!label || !match) throw new Error(`无法读取画布尺寸：${label ?? "缺失"}`);
  return {
    height: Number(match[2]),
    label,
    width: Number(match[1]),
    zoomPercent: Number(match[3]),
  };
}

async function expectStableCanvas(
  page: Page,
  expected: { height: number; width: number },
) {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("测试缺少视口尺寸");
  await page.getByRole("button", { name: "适应画布", exact: true }).click();
  await waitForMeasurementCycles(page);
  const first = await readCanvasReadout(page);
  expect(first.width).toBe(expected.width);
  expect(first.height).toBe(expected.height);
  for (const value of [first.width, first.height, first.zoomPercent]) {
    expect(Number.isFinite(value), `画布读数必须为有限数：${first.label}`).toBe(true);
    expect(value, `画布读数必须为正数：${first.label}`).toBeGreaterThan(0);
  }
  expect(first.width, first.label).toBeLessThanOrEqual(2560);
  expect(first.height, first.label).toBeLessThanOrEqual(
    viewport.height * MAX_CANVAS_VIEWPORT_MULTIPLIER,
  );
  expect(first.zoomPercent, `适应画布不得退化为 10%：${first.label}`).toBeGreaterThan(10);

  await waitForMeasurementCycles(page);
  const second = await readCanvasReadout(page);
  expect(second).toEqual(first);
  return second;
}

async function expectUnifiedTemplateWorkspace(
  page: Page,
  name: string,
  expectedHeightMode: "aspect-ratio" | "fixed",
) {
  const toolbar = page.locator("header.template-editor__toolbar");
  await expect(toolbar).toBeVisible();
  await expect(toolbar.getByRole("button", { name: /^桌面端模板布局/ })).toBeVisible();
  await expect(toolbar.getByRole("button", { name: /^移动端模板布局/ })).toBeVisible();
  await expect(toolbar.getByRole("button", { name: "预览模板", exact: true })).toBeVisible();
  await expect(toolbar.getByRole("button", { name: "保存模板", exact: true })).toBeVisible();
  await expect(toolbar.getByRole("button", { name: /^发布模板新版本/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "模板制作步骤", exact: true })).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "模板组件库", exact: true })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "模板结构", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: `${name}模板设计画布`, exact: true })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "模板属性", exact: true })).toBeVisible();

  await expect(page.getByRole("heading", { name: "模板整体尺寸与比例", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "高度方式", exact: true }))
    .toHaveValue(expectedHeightMode);
}

async function notifyCatalogChanged(page: Page) {
  await page.evaluate(async () => {
    const eventPath = "/src/page-builder/template-editor/templateCatalogEvents.ts";
    const { notifyDynamicTemplateCatalogChanged } = await import(/* @vite-ignore */ eventPath);
    notifyDynamicTemplateCatalogChanged();
  });
}

async function markCurrentTemplateDirty(page: Page) {
  await (await productionStageAction(page, "交付信息")).click();
  const nameInput = page.locator('[data-template-inspector-field="name"]')
    .getByRole("textbox", { name: "模板名称", exact: true });
  await expect(nameInput).toHaveCount(1);
  const currentName = await nameInput.inputValue();
  const dirtyName = `${currentName || "模板"} 未保存修改`;
  await nameInput.fill(dirtyName);
  await nameInput.press("Tab");
  await expect(nameInput).toHaveValue(dirtyName);
}

async function fillNewTemplateIdentity(page: Page) {
  const creator = page.getByRole("dialog", { name: "创建模板", exact: true });
  await creator.getByRole("button", { name: "通用模板", exact: true }).click();
  await creator.getByRole("button", { name: "下一步", exact: true }).click();
  await creator.getByRole("button", { name: /正方形 1:1/ }).click();
  await creator.getByRole("button", { name: "下一步", exact: true }).click();
  await creator.getByRole("button", { name: /上图下文/ }).click();
  await creator.getByRole("button", { name: "1 张主图", exact: true }).click();
  await creator.getByRole("button", { name: "前往确认（未配置项用推荐值）", exact: true }).click();
  await creator.getByRole("button", { name: "创建模板", exact: true }).click();
  await expect(creator).toBeHidden();
  await (await productionStageAction(page, "交付信息")).click();
  const name = page.locator('[data-template-inspector-field="name"]')
    .getByRole("textbox", { name: "模板名称", exact: true });
  await expect(name).toHaveCount(1);
  await name.fill(NEW_TEMPLATE_NAME);
  await name.press("Tab");
  const purpose = page.locator('[data-template-inspector-field="metadata.purpose"]')
    .getByRole("textbox", { name: "用途", exact: true });
  await expect(purpose).toHaveCount(1);
  await purpose.fill("验证 Repository 模板只能由新建模板入口建立");
  await purpose.press("Tab");
}

async function mutateCurrentTemplateDuringRequest(page: Page) {
  await page.evaluate(async () => {
    const sessionPath = "/src/page-builder/template-editor/templateEditorSession.ts";
    const { useTemplateEditorSession } = await import(/* @vite-ignore */ sessionPath);
    const session = useTemplateEditorSession.getState();
    if (!session.draft) throw new Error("生命周期并发测试没有活动模板会话");
    const definition = structuredClone(session.draft.definition);
    definition.name = `${definition.name} 请求期间修改`;
    session.setDynamicDefinition(definition);
  });
}

async function switchToNewDirtyTemplateDuringRequest(page: Page) {
  await page.evaluate(async () => {
    const sessionPath = "/src/page-builder/template-editor/templateEditorSession.ts";
    const repositoryPath = "/src/page-builder/template-editor/dynamicTemplateDraftRepository.ts";
    const { useTemplateEditorSession } = await import(/* @vite-ignore */ sessionPath);
    const { createNewDynamicTemplateDraft } = await import(/* @vite-ignore */ repositoryPath);
    const session = useTemplateEditorSession.getState();
    const draft = createNewDynamicTemplateDraft("请求期间切换的新模板");
    session.open(draft, { isNew: true });
    const latest = useTemplateEditorSession.getState();
    if (!latest.draft) throw new Error("未能建立请求期间的新模板会话");
    const definition = structuredClone(latest.draft.definition);
    definition.description = "请求期间继续编辑";
    latest.setDynamicDefinition(definition);
  });
}

function dynamicWrites(server: LifecycleServer, suffix: string) {
  return server.writes.filter((write) => write.path.endsWith(suffix));
}

test.describe("TD-LIFECYCLE-UI-RED1 模板生命周期同权（route-Mock Chromium）", () => {
  test("空目录明确区分首屏测试样例、已保存模板与已发布模板", async ({ page }) => {
    const server = await installLifecycleServer(page);
    await page.goto("/admin/editor/home", { waitUntil: "domcontentloaded" });

    const pageLibrary = page.getByRole("complementary", { name: "模板组件库" });
    await expect(pageLibrary).toContainText(
      "尚无可添加的已发布模板。请先由超级管理员在模板设计中保存并发布模板。",
    );
    await expect(pageLibrary.locator("[data-template-catalog-card]")).toHaveCount(0);

    await page.getByRole("button", { name: "模板设计", exact: true }).click();
    const designLibrary = page.getByRole("complementary", { name: "模板组件库" });
    await expect(designLibrary).toContainText("模板库中还没有已保存模板。");
    await expect(designLibrary.locator("[data-template-catalog-card]")).toHaveCount(0);
    await expect.poll(() => server.catalogRequests).toBeGreaterThan(0);
    expect(server.writes).toHaveLength(0);
    expect(server.allWrites).toHaveLength(0);
  });

  test("持久化展示状态区分新模板、服务端草稿、修改中、保存中与失败", () => {
    const definition = makeDefinition("tpl_persistence_projection", "持久化状态投影");
    const newDraft: TemplateEditorDraft = {
      format: "dynamic",
      sourceType: "local",
      localDraftId: definition.templateId,
      versionNote: "",
      definition,
    };
    const persistedDraft: TemplateEditorDraft = {
      ...newDraft,
      sourceType: "persisted",
      remote: {
        databaseId: 1,
        revision: 2,
        publishedVersion: 1,
        baseVersion: 1,
        draftDefinitionChecksum: "a".repeat(64),
        publishedDefinitionChecksum: "b".repeat(64),
        sourceType: "CUSTOM",
        status: "ACTIVE",
        canDelete: true,
        deleteBlockers: [],
      },
    };
    const project = (options: Partial<Parameters<typeof deriveTemplatePersistencePresentation>[0]>) => (
      deriveTemplatePersistencePresentation({
        draft: newDraft,
        localOnly: false,
        hasBaseline: true,
        dirty: false,
        saveStatus: "idle",
        ...options,
      })
    );

    expect(project({})).toMatchObject({
      state: "unpersisted",
      label: "尚未建立服务端草稿",
      saved: false,
    });
    expect(project({ draft: persistedDraft })).toMatchObject({
      state: "clean",
      label: "服务端草稿已保存",
      saved: true,
    });
    expect(project({ draft: persistedDraft, dirty: true })).toMatchObject({
      state: "dirty",
      label: "有未保存修改",
      saved: false,
    });
    expect(project({ draft: persistedDraft, saveStatus: "saving" })).toMatchObject({
      state: "saving",
      label: "正在保存",
      saved: false,
    });
    expect(project({ draft: persistedDraft, dirty: true, saveStatus: "error" })).toMatchObject({
      state: "failed",
      label: "保存未完成，输入仍保留",
      saved: false,
    });
  });

  test("Repository 草稿和已发布模板使用统一卡片状态与生命周期操作", async ({ page }) => {
    const server = await installLifecycleServer(page, { includeStandardRecords: true });
    await openDesignCatalog(page);

    const draftCard = activeTemplateCard(page, DRAFT_TEMPLATE_NAME, "草稿");
    const publishedCard = activeTemplateCard(page, PUBLISHED_TEMPLATE_NAME, "已发布");
    for (const card of [draftCard, publishedCard]) {
      await expect(card).toBeVisible();
      await expect(card).toBeEnabled();
    }
    await expect(publishedCard).toContainText("线上 v2");
    const library = page.getByRole("complementary", { name: "模板组件库" });
    await expect(library.locator('[data-template-identity^="source:"]')).toHaveCount(0);
    await expect(library.locator('[data-template-catalog-card]:not([data-template-identity^="template:"])'))
      .toHaveCount(0);
    await expect(library).not.toContainText(SOURCE_LEVEL_WORDS);

    for (const name of [DRAFT_TEMPLATE_NAME, PUBLISHED_TEMPLATE_NAME]) {
      await expectActiveLifecycleActions(page, name);
    }

    await publishedCard.click();
    const publishedSession = await readTemplateSession(page);
    expect(publishedSession).toMatchObject({
      sourceType: "persisted",
      dirty: false,
      remote: {
        revision: 4,
        publishedVersion: 2,
      },
    });
    expect(dynamicWrites(server, "/draft/from-published")).toHaveLength(0);
  });

  test("首屏与限时活动按同一 Repository 工作流交叉切换且画布各自稳定", async ({ page }) => {
    const server = await installLifecycleServer(page, { operatorWorkflowRecords: true });
    await page.setViewportSize({ width: 1600, height: 1000 });
    await openDesignCatalog(page);

    const checkpoints = [
      {
        expected: { height: 900, width: 1200 },
        heightMode: "aspect-ratio" as const,
        name: HERO_TEMPLATE_NAME,
        templateId: HERO_TEMPLATE_ID,
      },
      {
        expected: { height: 640, width: 1920 },
        heightMode: "fixed" as const,
        name: CAMPAIGN_TEMPLATE_NAME,
        templateId: CAMPAIGN_TEMPLATE_ID,
      },
      {
        expected: { height: 900, width: 1200 },
        heightMode: "aspect-ratio" as const,
        name: HERO_TEMPLATE_NAME,
        templateId: HERO_TEMPLATE_ID,
      },
    ];
    const canvasReadouts: string[] = [];

    for (const checkpoint of checkpoints) {
      await activeTemplateCard(page, checkpoint.name, "草稿").click();
      await expectUnifiedTemplateWorkspace(page, checkpoint.name, checkpoint.heightMode);
      const session = await readTemplateSession(page);
      expect(session).toMatchObject({
        compatibilityRecovery: null,
        definition: { templateId: checkpoint.templateId },
        dirty: false,
        remote: { sourceType: "CUSTOM" },
        requiresContractNormalization: false,
        sourceType: "persisted",
      });
      canvasReadouts.push((await expectStableCanvas(page, checkpoint.expected)).label);
    }

    expect(server.draftRequests).toEqual([
      HERO_TEMPLATE_ID,
      CAMPAIGN_TEMPLATE_ID,
      HERO_TEMPLATE_ID,
    ]);
    expect(canvasReadouts[0]).not.toBe(canvasReadouts[1]);
    expect(canvasReadouts[2]).toBe(canvasReadouts[0]);
    expect(server.writes).toHaveLength(0);
    expect(server.allWrites).toHaveLength(0);
  });

  test("版本历史只能载入当前 Repository 草稿，不创建新 templateId", async ({ page }) => {
    const server = await installLifecycleServer(page, { includeStandardRecords: true });
    await openDesignCatalog(page);
    await activeTemplateCard(page, PUBLISHED_TEMPLATE_NAME, "已发布").click();
    const before = await readTemplateSession(page);
    expect(before.definition?.templateId).toBe(PUBLISHED_TEMPLATE_ID);

    await page.getByRole("button", { name: "更多模板操作", exact: true }).click();
    await menuItemByAction(page, "版本历史").click();
    const history = page.getByRole("dialog", { name: "模板版本历史", exact: true });
    const version = history.getByRole("region", { name: "正式版本 2 预览", exact: true });
    await expect(version).toContainText("v2");
    await expect(history.getByRole("button", { name: "从此版本新建草稿", exact: true })).toHaveCount(0);
    await version.getByRole("button", { name: "载入当前草稿", exact: true }).click();
    const confirm = page.getByRole("dialog", { name: "将 v2 载入当前草稿？", exact: true });
    await confirm.getByRole("button", { name: "载入当前草稿", exact: true }).click();

    const after = await readTemplateSession(page);
    expect(after.definition?.templateId).toBe(PUBLISHED_TEMPLATE_ID);
    expect(after.sourceType).toBe("persisted");
    expect(after.dirty).toBe(true);
    expect(server.writes.filter((write) => (
      write.method === "POST" && write.path === "/api/page-modules/dynamic-templates"
    ))).toHaveLength(0);
    expect(dynamicWrites(server, "/save-as")).toHaveLength(0);
  });

  test("CUSTOM 历史来源记录不显示来源等级，也不提供另存副本或导入入口", async ({ page }) => {
    const server = await installLifecycleServer(page, { legacySourceRecord: true });
    await openDesignCatalog(page);
    const library = page.getByRole("complementary", { name: "模板组件库" });
    await expect(activeTemplateCard(page, LEGACY_SOURCE_TEMPLATE_NAME, "草稿")).toBeVisible();
    await expect(library).not.toContainText(SOURCE_LEVEL_WORDS);
    await activeTemplateCard(page, LEGACY_SOURCE_TEMPLATE_NAME, "草稿").click();
    expect((await readTemplateSession(page)).sourceReference).toBe(LEGACY_SOURCE_REFERENCE);
    await expect(page.getByRole("complementary", { name: "模板结构" }))
      .not.toContainText(SOURCE_LEVEL_WORDS);
    await page.getByRole("button", { name: "更多模板操作", exact: true }).click();
    await expect(menuItemByAction(page, "另存副本")).toHaveCount(0);
    await expect(menuItemByAction(page, "另存为模板")).toHaveCount(0);
    await expect(menuItemByAction(page, "导入模板文件")).toHaveCount(0);
    expect(server.writes).toHaveLength(0);
    expect(server.allWrites).toHaveLength(0);
  });

  test("服务端草稿的干净与修改中状态在顶部准确显示，编辑区不出现制作任务链", async ({ page }) => {
    await installLifecycleServer(page, { includeStandardRecords: true });
    await openDesignCatalog(page);
    await activeTemplateCard(page, DRAFT_TEMPLATE_NAME, "草稿").click();

    await expect(page.getByRole("status", {
      name: "模板状态：服务端草稿已保存",
      exact: true,
    })).toContainText("服务端草稿已保存");
    const productionGuide = page.getByRole("region", { name: "模板制作步骤", exact: true });
    await expect(productionGuide).toHaveCount(0);

    await markCurrentTemplateDirty(page);
    await expect(page.getByRole("status", {
      name: "模板状态：有未保存修改",
      exact: true,
    })).toContainText("有未保存修改");
    await expect(productionGuide).toHaveCount(0);
  });

  test("已物化模板归档只发送当前草稿版本与校验和，不混入兼容 seed", async ({ page }) => {
    const server = await installLifecycleServer(page, { includeStandardRecords: true });
    await openDesignCatalog(page);

    await (await openCardAction(page, DRAFT_TEMPLATE_NAME, "移入回收站")).click();
    const dialog = page.getByRole("dialog", {
      name: `将模板“${DRAFT_TEMPLATE_NAME}”移入回收站？`,
    });
    await dialog.getByRole("button", { name: "移入回收站", exact: true }).click();

    await expect.poll(() => dynamicWrites(server, "/archive").length).toBe(1);
    const write = dynamicWrites(server, "/archive")[0];
    expect(write).toMatchObject({
      method: "POST",
      path: `/api/page-modules/dynamic-templates/${DRAFT_TEMPLATE_ID}/archive`,
      body: {
        expectedRevision: 1,
        expectedChecksum: "a".repeat(64),
      },
    });
    expect(write.body).not.toHaveProperty("definition");
    expect(write.body).not.toHaveProperty("sourceReference");
    await page.getByRole("button", { name: "打开模板回收站", exact: true }).click();
    await expect(archivedTemplateCard(page, DRAFT_TEMPLATE_NAME)).toBeVisible();
  });

  test("归档请求期间出现后续编辑时保留当前会话，不用旧响应关闭新修改", async ({ page }) => {
    let releaseArchive!: () => void;
    const archiveGate = new Promise<void>((resolve) => { releaseArchive = resolve; });
    const server = await installLifecycleServer(page, {
      archiveGate,
      includeStandardRecords: true,
    });
    await openDesignCatalog(page);
    await activeTemplateCard(page, DRAFT_TEMPLATE_NAME, "草稿").click();

    await (await openCardAction(page, DRAFT_TEMPLATE_NAME, "移入回收站")).click();
    await page.getByRole("dialog", { name: `将模板“${DRAFT_TEMPLATE_NAME}”移入回收站？` })
      .getByRole("button", { name: "移入回收站", exact: true })
      .click();
    await expect.poll(() => dynamicWrites(server, "/archive").length).toBe(1);
    await mutateCurrentTemplateDuringRequest(page);
    releaseArchive();

    await expect(page.getByText(
      `模板“${DRAFT_TEMPLATE_NAME}”已移入回收站；当前会话有后续修改，未自动关闭`,
      { exact: true },
    )).toBeVisible();
    const session = await readTemplateSession(page);
    expect(session.definition?.templateId).toBe(DRAFT_TEMPLATE_ID);
    expect(session.dirty).toBe(true);
  });

  test("已发布记录缺少可编辑草稿时提供明确恢复动作，手动重读目录仍为零写入", async ({ page }) => {
    const server = await installLifecycleServer(page, { includePublishedWithoutDraft: true });
    await openDesignCatalog(page);

    const cardMain = publishedWithoutDraftCard(page);
    const card = cardMain.locator("..");
    await expect(card).toBeVisible();
    await expect(card).toContainText("草稿已保存 · 缺少可编辑草稿");
    await expect(card).toContainText("线上 v3");
    await expect(card).toContainText("从正式版本建立编辑草稿");
    await expect(card).toContainText("不会发布模板或修改页面");
    await expect(cardMain).not.toHaveAttribute("aria-disabled", "true");
    await expect(page.getByRole("complementary", { name: "模板组件库" }))
      .not.toContainText(SOURCE_LEVEL_WORDS);

    await expect(await openCardAction(
      page,
      PUBLISHED_NO_DRAFT_TEMPLATE_NAME,
      "从正式版本建立编辑草稿",
    )).toBeVisible();
    await page.keyboard.press("Escape");
    const requestsBefore = server.catalogRequests;
    await (await openCardAction(page, PUBLISHED_NO_DRAFT_TEMPLATE_NAME, "重新读取目录")).click();
    await expect.poll(() => server.catalogRequests).toBeGreaterThan(requestsBefore);
    expect(server.writes).toHaveLength(0);
    await expect(card).toBeVisible();
  });

  test("从目录中的精确正式版本建立编辑草稿并打开，且不发布模板、不写页面", async ({ page }) => {
    const server = await installLifecycleServer(page, { includePublishedWithoutDraft: true });
    await openDesignCatalog(page);
    const published = server.published.find((item) => item.templateId === PUBLISHED_NO_DRAFT_TEMPLATE_ID);
    if (!published) throw new Error("建立编辑草稿测试缺少正式版本");

    await confirmCreateDraftFromPublished(page);
    await expect.poll(() => dynamicWrites(server, "/draft/from-published").length).toBe(1);
    const write = dynamicWrites(server, "/draft/from-published")[0];
    expect(write).toMatchObject({
      method: "POST",
      path: `/api/page-modules/dynamic-templates/${PUBLISHED_NO_DRAFT_TEMPLATE_ID}/draft/from-published`,
      body: {
        expectedVersion: published.version,
        expectedChecksum: published.definitionChecksum,
      },
    });
    const session = await readTemplateSession(page);
    expect(session).toMatchObject({
      dirty: false,
      sourceType: "persisted",
      remote: {
        revision: 1,
        baseVersion: published.version,
        draftDefinitionChecksum: published.definitionChecksum,
        publishedDefinitionChecksum: published.definitionChecksum,
      },
    });
    expect(session.definition).toEqual(published.definition);
    await expect(activeTemplateCard(page, PUBLISHED_NO_DRAFT_TEMPLATE_NAME, "已发布")).toBeVisible();
    await expect(page.getByText(
      `已从正式版本 v${published.version} 建立编辑草稿；未发布模板，也未修改任何页面`,
      { exact: true },
    )).toBeVisible();
    expect(server.allWrites).toHaveLength(1);
    expect(server.allWrites.filter((item) => item.path.endsWith("/publish"))).toHaveLength(0);
    expect(server.allWrites.filter((item) => item.path.includes("/document/"))).toHaveLength(0);
  });

  test("正式版本发生 409 漂移时保留恢复卡和当前会话，并给出可重试原因", async ({ page }) => {
    const server = await installLifecycleServer(page, {
      createDraftFromPublishedResult: "conflict",
      includePublishedWithoutDraft: true,
    });
    await openDesignCatalog(page);

    await confirmCreateDraftFromPublished(page);
    const reason = "正式版本已变化，未建立编辑草稿；请重新读取目录后重试";
    await expect(page.getByText(reason, { exact: true }).first()).toBeVisible();
    const card = publishedWithoutDraftCard(page).locator("..");
    await expect(card).toContainText("重试建立编辑草稿");
    await expect(card).toContainText(reason);
    expect((await readTemplateSession(page)).definition).toBeNull();
    expect(dynamicWrites(server, "/draft/from-published")).toHaveLength(1);
    expect(server.allWrites.filter((item) => item.path.endsWith("/publish"))).toHaveLength(0);
    expect(server.allWrites.filter((item) => item.path.includes("/document/"))).toHaveLength(0);
  });

  test("建立草稿接口返回畸形身份时拒绝打开，卡片保留并可重试", async ({ page }) => {
    const server = await installLifecycleServer(page, {
      createDraftFromPublishedResult: "malformed",
      includePublishedWithoutDraft: true,
    });
    await openDesignCatalog(page);

    await confirmCreateDraftFromPublished(page);
    const reason = "服务端返回的编辑草稿不完整或身份不一致，当前会话未改变；请重新读取目录后重试";
    await expect(page.getByText(reason, { exact: true }).first()).toBeVisible();
    const card = publishedWithoutDraftCard(page).locator("..");
    await expect(card).toContainText("重试建立编辑草稿");
    await expect(card).toContainText(reason);
    expect((await readTemplateSession(page)).definition).toBeNull();
    expect(dynamicWrites(server, "/draft/from-published")).toHaveLength(1);
    expect(server.allWrites.filter((item) => item.path.endsWith("/publish"))).toHaveLength(0);
    expect(server.allWrites.filter((item) => item.path.includes("/document/"))).toHaveLength(0);
  });

  test("建立草稿请求中切换并继续编辑时只发一个请求，迟到响应不覆盖新会话", async ({ page }) => {
    let releaseCreation!: () => void;
    const creationGate = new Promise<void>((resolve) => { releaseCreation = resolve; });
    const server = await installLifecycleServer(page, {
      createDraftFromPublishedGate: creationGate,
      includePublishedWithoutDraft: true,
    });
    await openDesignCatalog(page);
    const catalogRequestsBefore = server.catalogRequests;

    const creation = confirmCreateDraftFromPublished(page);
    await expect.poll(() => dynamicWrites(server, "/draft/from-published").length).toBe(1);
    await expect(publishedWithoutDraftCard(page)).toHaveAttribute("aria-disabled", "true");
    await expect(publishedWithoutDraftCard(page).locator("..")).toContainText("正在建立编辑草稿");
    await switchToNewDirtyTemplateDuringRequest(page);
    releaseCreation();
    await creation;

    await expect(page.getByText(
      "编辑草稿已建立，但当前会话已有后续变化；未自动打开，请重新读取目录",
      { exact: true },
    ).first()).toBeVisible();
    const session = await readTemplateSession(page);
    expect(session.definition?.name).toBe("请求期间切换的新模板");
    expect(session.definition?.description).toBe("请求期间继续编辑");
    expect(session.dirty).toBe(true);
    expect(dynamicWrites(server, "/draft/from-published")).toHaveLength(1);
    expect(server.catalogRequests).toBe(catalogRequestsBefore);
    await expect(publishedWithoutDraftCard(page).locator("..")).toContainText("重新读取目录");
    expect(server.allWrites.filter((item) => item.path.endsWith("/publish"))).toHaveLength(0);
    expect(server.allWrites.filter((item) => item.path.includes("/document/"))).toHaveLength(0);
  });

  test("恢复沿用同一 Repository templateId，回到普通目录后恢复统一操作集合", async ({ page }) => {
    const server = await installLifecycleServer(page, { includeStandardRecords: true });
    await openDesignCatalog(page);
    await activeTemplateCard(page, DRAFT_TEMPLATE_NAME, "草稿").click();
    const resource = server.records.find((item) => item.templateId === DRAFT_TEMPLATE_ID);
    if (!resource) throw new Error("恢复测试缺少 Repository 模板");
    resource.status = "ARCHIVED";
    resource.archivedAt = NOW;
    resource.canDelete = false;
    resource.deleteBlockers = [{
      code: "HAS_REFERENCES",
      message: "模板已有发布版本或页面引用，需保留历史数据。",
    }];
    const requestsBefore = server.catalogRequests;
    await notifyCatalogChanged(page);
    await expect.poll(() => server.catalogRequests).toBeGreaterThan(requestsBefore);
    await page.getByRole("button", { name: "打开模板回收站", exact: true }).click();
    await expect(archivedTemplateCard(page, DRAFT_TEMPLATE_NAME)).toBeVisible();

    await (await openCardAction(page, DRAFT_TEMPLATE_NAME, "恢复模板")).click();
    const dialog = page.getByRole("dialog", { name: `恢复模板“${DRAFT_TEMPLATE_NAME}”？` });
    await dialog.getByRole("button", { name: "恢复模板", exact: true }).click();
    await expect.poll(() => dynamicWrites(server, "/restore").length).toBe(1);
    const write = dynamicWrites(server, "/restore")[0];
    expect(write.method).toBe("POST");
    expect(new URL(write.url).pathname).toBe(
      `/api/page-modules/dynamic-templates/${DRAFT_TEMPLATE_ID}/restore`,
    );
    expect(write.body).toBeNull();
    await expect.poll(() => server.catalogRequests).toBeGreaterThan(1);
    expect((await readTemplateSession(page)).definition?.templateId).toBe(DRAFT_TEMPLATE_ID);

    await page.getByRole("button", { name: /返回模板库$/ }).click();
    await expect(activeTemplateCard(page, DRAFT_TEMPLATE_NAME, "草稿")).toBeVisible();
    await expectActiveLifecycleActions(page, DRAFT_TEMPLATE_NAME);
  });

  test("永久删除请求期间出现后续编辑时保留当前会话，不用旧响应清空新修改", async ({ page }) => {
    let releaseDelete!: () => void;
    const deleteGate = new Promise<void>((resolve) => { releaseDelete = resolve; });
    const server = await installLifecycleServer(page, {
      deleteGate,
      deleteSucceeds: true,
      includeStandardRecords: true,
    });
    await openDesignCatalog(page);
    await activeTemplateCard(page, DRAFT_TEMPLATE_NAME, "草稿").click();
    const resource = server.records.find((item) => item.templateId === DRAFT_TEMPLATE_ID);
    if (!resource) throw new Error("永久删除并发测试缺少模板记录");
    resource.status = "ARCHIVED";
    resource.archivedAt = NOW;
    resource.canDelete = true;
    resource.deleteBlockers = [];
    await notifyCatalogChanged(page);
    await page.getByRole("button", { name: "打开模板回收站", exact: true }).click();

    await (await openCardAction(page, DRAFT_TEMPLATE_NAME, "永久删除模板")).click();
    await page.getByRole("dialog", { name: `永久删除模板“${DRAFT_TEMPLATE_NAME}”？` })
      .getByRole("button", { name: "永久删除模板", exact: true })
      .click();
    await expect.poll(() => server.writes.filter((write) => write.method === "DELETE").length).toBe(1);
    await mutateCurrentTemplateDuringRequest(page);
    releaseDelete();

    await expect(page.getByText(
      `模板“${DRAFT_TEMPLATE_NAME}”已永久删除；当前会话有后续修改，未自动关闭`,
      { exact: true },
    )).toBeVisible();
    const session = await readTemplateSession(page);
    expect(session.definition?.templateId).toBe(DRAFT_TEMPLATE_ID);
    expect(session.dirty).toBe(true);
  });

  test("只有新建模板入口触发 Repository create，且请求不携带兼容来源", async ({ page }) => {
    const server = await installLifecycleServer(page, { includeStandardRecords: true });
    await openDesignCatalog(page);
    const library = page.getByRole("complementary", { name: "模板组件库" });
    await library.getByRole("button", { name: "新建模板", exact: true }).click();
    await fillNewTemplateIdentity(page);
    const beforeSave = await readTemplateSession(page);
    if (!beforeSave.definition) throw new Error("新建模板入口没有建立内存草稿");

    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    await expect.poll(() => server.writes.filter((write) => (
      write.method === "POST" && write.path === "/api/page-modules/dynamic-templates"
    )).length).toBe(1);

    const createWrites = server.writes.filter((write) => (
      write.method === "POST" && write.path === "/api/page-modules/dynamic-templates"
    ));
    expect(createWrites).toHaveLength(1);
    expect(new URL(createWrites[0].url).pathname)
      .toBe("/api/page-modules/dynamic-templates");
    expect(createWrites[0].body).toMatchObject({
      definition: {
        templateId: beforeSave.definition.templateId,
        name: NEW_TEMPLATE_NAME,
      },
      versionNote: "",
    });
    expect(createWrites[0].body).not.toHaveProperty("sourceReference");
    expect(dynamicWrites(server, "/save-as")).toHaveLength(0);
    expect(server.allWrites).toEqual(createWrites);
    await expect(activeTemplateCard(page, NEW_TEMPLATE_NAME, "草稿")).toBeVisible();
  });

  test("历史同来源 Repository 记录按 templateId 区分当前会话", async ({ page }) => {
    await installLifecycleServer(page, { sharedSourceRecords: true });
    await openDesignCatalog(page);

    await activeTemplateCard(page, "同来源记录 A", "草稿").click();
    await expect(page.getByRole("button", {
      name: "正在编辑同来源记录 A模板，当前草稿，已保存",
      exact: true,
    })).toBeVisible();
    await expect(page.getByRole("button", {
      name: "打开同来源记录 B模板，草稿已保存",
      exact: true,
    })).toBeVisible();
    await expect(page.getByRole("button", { name: /^正在编辑同来源记录 B/ })).toHaveCount(0);
  });

  test("物理删除阻断使用通用数据安全原因且不会发出 DELETE", async ({ page }) => {
    const blockedReason = "模板已有发布版本或页面引用，需保留历史数据。";
    const server = await installLifecycleServer(page, { includeStandardRecords: true });
    await openDesignCatalog(page);
    const resource = server.records.find((item) => item.templateId === PUBLISHED_TEMPLATE_ID);
    if (!resource) throw new Error("删除阻断测试缺少 Repository 模板");
    resource.status = "ARCHIVED";
    resource.archivedAt = NOW;
    resource.canDelete = false;
    resource.deleteBlockers = [{ code: "HAS_REFERENCES", message: blockedReason }];
    const requestsBefore = server.catalogRequests;
    await notifyCatalogChanged(page);
    await expect.poll(() => server.catalogRequests).toBeGreaterThan(requestsBefore);
    await page.getByRole("button", { name: "打开模板回收站", exact: true }).click();
    await page.getByRole("button", {
      name: `更多模板操作：${PUBLISHED_TEMPLATE_NAME}`,
      exact: true,
    }).click();

    const unavailable = menuItemByAction(page, "永久删除不可用");
    await expect(unavailable).toBeVisible();
    await expect(unavailable).toHaveAttribute("aria-disabled", "true");
    await expect(unavailable.getByTitle(blockedReason)).toBeVisible();
    await expect(unavailable).not.toContainText(SOURCE_LEVEL_WORDS);
    await expect(page.getByRole("complementary", { name: "模板组件库" }))
      .not.toContainText(SOURCE_LEVEL_WORDS);
    expect(server.writes.filter((write) => write.method === "DELETE")).toHaveLength(0);
  });
});
