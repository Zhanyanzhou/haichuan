import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import { createBlankTemplate, applyBasicSkeleton, productionStageAction, completeProductionReviews as reviewTemplateForPublish } from "./fixtures/template-authoring-main-route";

import type { DynamicTemplatePageFieldDescriptor } from "../src/page-builder/dynamic-template-instance/pageFieldDescriptors";
import type { TemplateDefinitionV2 } from "../src/page-builder/template-definition";
import type {
  DynamicTemplateResource,
  DynamicTemplateVersionResource,
  PublishedDynamicTemplateResource,
} from "../src/services/clients/dynamicTemplateClient";
import { installAdminSession } from "./fixtures/session-auth";

const CHECKSUM = "a".repeat(64);
const DIFFERENT_CHECKSUM = "b".repeat(64);
const DYNAMIC_TEMPLATE_CATALOG_CHANGED_EVENT = "haichuan:dynamic-template-server-changed";
const NOW = "2026-09-09T08:00:00.000Z";

type DynamicWrite = { body: unknown; method: string; path: string };
type TemplateSessionSnapshot = {
  definition: TemplateDefinitionV2 | null;
  dirty: boolean;
  historyFuture: unknown[];
  historyPast: unknown[];
  nodeIds: string[];
  pageFields: DynamicTemplatePageFieldDescriptor[];
  remote: Record<string, unknown> | null;
  saveStatus: string;
  selectionSnapshot: {
    anchorTarget: { targetId: string; roleId?: string } | null;
    primaryTarget: { targetId: string; roleId?: string } | null;
    targets: Array<{ targetId: string; roleId?: string }>;
  } | null;
  semanticGeneration: number;
  sessionId: string | null;
  slotIds: string[];
  versionNote: string | null;
};
type IdentityRequest = {
  kind: "draft-read" | "draft-save" | "publish" | "published-version" | "version-list";
  method: string;
  path: string;
  templateId: string;
  version?: number;
};
type TemplateRequestEvent = {
  expectedRevision?: number;
  kind: "catalog" | "create" | IdentityRequest["kind"];
  method: string;
  nextRevision?: number;
  path: string;
  targetVersion?: number;
  templateId?: string;
  version?: number;
};
type MockTemplateServer = {
  catalogEntries: Array<Array<{ kind: "editable" | "published" | "system"; templateId: string; version: number }>>;
  catalogReads: number;
  createdTemplateId: string | null;
  dangerousWrites: DynamicWrite[];
  dynamicWrites: DynamicWrite[];
  holdNextCatalog: boolean;
  holdNextPublish: boolean;
  holdNextPublishedVersion: boolean;
  holdNextSave: boolean;
  identityRequests: IdentityRequest[];
  pageWrites: DynamicWrite[];
  published: PublishedDynamicTemplateResource | null;
  publishedVersions: PublishedDynamicTemplateResource[];
  publishTransport: "success" | "uncertain-success";
  releaseHeldCatalog: (() => void) | null;
  releaseHeldPublish: (() => void) | null;
  releaseHeldPublishedVersion: (() => void) | null;
  releaseHeldSave: (() => void) | null;
  requestEvents: TemplateRequestEvent[];
  resource: DynamicTemplateResource | null;
  saveFailures: number[];
  catalogFailures: number[];
  unexpectedRequests: Array<{ method: string; path: string; reason: string }>;
};

function matchesPersistedIdentity(
  expectedTemplateId: string | null | undefined,
  requestedTemplateId: string,
  expectedVersion?: number,
  requestedVersion?: number,
) {
  return Boolean(
    expectedTemplateId
    && requestedTemplateId === expectedTemplateId
    && (expectedVersion === undefined || requestedVersion === expectedVersion),
  );
}

function json(data: unknown, status = 200) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify({ code: status, data, message: status < 400 ? "success" : "failure" }),
  };
}

function pageDraft() {
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
    updatedAt: NOW,
  };
}

function makeResource(
  definition: TemplateDefinitionV2,
  revision: number,
  publishedVersion: number,
  versionNote: string | null,
  definitionChecksum = CHECKSUM,
): DynamicTemplateResource {
  return {
    id: 7001,
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
      id: 7101,
      baseVersion: publishedVersion || null,
      revision,
      definition: structuredClone(definition),
      definitionChecksum,
      versionNote,
      updatedAt: NOW,
    },
  };
}

function publishedFrom(
  resource: DynamicTemplateResource,
  definition: TemplateDefinitionV2,
  versionNote: string | null,
  version = 1,
  definitionChecksum = CHECKSUM,
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
    version,
    schemaVersion: definition.schemaVersion,
    definition: structuredClone(definition),
    definitionChecksum,
    versionNote,
    publishedAt: NOW,
  };
}

async function installTemplateServer(page: Page, options: { failPublish?: boolean } = {}) {
  const state: MockTemplateServer = {
    catalogEntries: [],
    catalogReads: 0,
    createdTemplateId: null,
    dangerousWrites: [],
    dynamicWrites: [],
    holdNextCatalog: false,
    holdNextPublish: false,
    holdNextPublishedVersion: false,
    holdNextSave: false,
    identityRequests: [],
    pageWrites: [],
    published: null,
    publishedVersions: [],
    publishTransport: "success",
    releaseHeldCatalog: null,
    releaseHeldPublish: null,
    releaseHeldPublishedVersion: null,
    releaseHeldSave: null,
    requestEvents: [],
    resource: null,
    saveFailures: [],
    catalogFailures: [],
    unexpectedRequests: [],
  };
  const recordWrite = (route: Route, path: string) => {
    const request = route.request();
    const write = { body: request.postDataJSON(), method: request.method(), path };
    if (path.includes("/page-modules/dynamic-templates")) state.dynamicWrites.push(write);
    else if (path.includes("/page-modules/document")) state.pageWrites.push(write);
    else state.dangerousWrites.push(write);
    return write;
  };

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const method = request.method();
    const path = new URL(request.url()).pathname;
    const rejectUnexpected = (reason: string) => {
      state.unexpectedRequests.push({ method, path, reason });
      return route.fulfill(json(null, 409));
    };
    if (path === "/api/auth/profile") return route.fallback();
    if (path === "/api/page-modules/dynamic-templates/catalog" && method === "GET") {
      state.catalogReads += 1;
      state.requestEvents.push({
        kind: "catalog",
        method,
        path,
        ...(state.resource ? { templateId: state.resource.templateId } : {}),
        ...(state.published ? { version: state.published.version } : {}),
      });
      const catalogFailure = state.catalogFailures.shift();
      if (catalogFailure) return route.fulfill(json(null, catalogFailure));
      const items = [
        ...(state.resource ? [{ kind: "editable" as const, template: state.resource }] : []),
        ...(state.published ? [{ kind: "published" as const, template: state.published }] : []),
      ];
      state.catalogEntries.push(items.flatMap((item) => (
        item.kind === "editable" || item.kind === "published"
          ? [{
              kind: item.kind,
              templateId: item.template.templateId,
              version: item.kind === "published" ? item.template.version : item.template.publishedVersion,
            }]
          : []
      )));
      if (state.holdNextCatalog) {
        state.holdNextCatalog = false;
        await new Promise<void>((resolve) => {
          state.releaseHeldCatalog = resolve;
        });
        state.releaseHeldCatalog = null;
      }
      return route.fulfill(json({ source: "unified", items }));
    }
    if (path === "/api/page-modules/dynamic-templates" && method === "POST") {
      const write = recordWrite(route, path);
      const body = write.body as { definition: TemplateDefinitionV2; versionNote?: string };
      if (state.resource || state.createdTemplateId) return rejectUnexpected("同一测试链不允许创建第二个模板");
      const saveFailure = state.saveFailures.shift();
      if (saveFailure) return route.fulfill(json(null, saveFailure));
      if (state.holdNextSave) {
        state.holdNextSave = false;
        await new Promise<void>((resolve) => {
          state.releaseHeldSave = resolve;
        });
        state.releaseHeldSave = null;
      }
      state.createdTemplateId = body.definition.templateId;
      state.requestEvents.push({ kind: "create", method, path, templateId: body.definition.templateId });
      state.resource = makeResource(body.definition, 1, 0, body.versionNote ?? null);
      return route.fulfill(json(state.resource));
    }
    const draftMatch = path.match(/^\/api\/page-modules\/dynamic-templates\/([^/]+)\/draft$/);
    if (draftMatch && method === "GET") {
      const templateId = decodeURIComponent(draftMatch[1]);
      if (!matchesPersistedIdentity(state.resource?.templateId, templateId)) return rejectUnexpected("草稿读取模板身份不匹配");
      state.identityRequests.push({ kind: "draft-read", method, path, templateId });
      state.requestEvents.push({ kind: "draft-read", method, path, templateId });
      return route.fulfill(json(state.resource));
    }
    if (draftMatch && method === "PATCH") {
      const templateId = decodeURIComponent(draftMatch[1]);
      if (!matchesPersistedIdentity(state.resource?.templateId, templateId)) return rejectUnexpected("草稿保存模板身份不匹配");
      const write = recordWrite(route, path);
      const body = write.body as { definition: TemplateDefinitionV2; expectedRevision: number; versionNote?: string };
      if (body.definition.templateId !== templateId) return rejectUnexpected("草稿请求体与路径模板身份不匹配");
      expect(body.expectedRevision).toBe(state.resource?.draft?.revision);
      const saveFailure = state.saveFailures.shift();
      if (saveFailure) return route.fulfill(json(null, saveFailure));
      if (state.holdNextSave) {
        state.holdNextSave = false;
        await new Promise<void>((resolve) => {
          state.releaseHeldSave = resolve;
        });
        state.releaseHeldSave = null;
      }
      state.identityRequests.push({ kind: "draft-save", method, path, templateId });
      state.requestEvents.push({
        expectedRevision: body.expectedRevision,
        kind: "draft-save",
        method,
        nextRevision: body.expectedRevision + 1,
        path,
        templateId,
      });
      const definitionChecksum = (state.resource?.publishedVersion ?? 0) > 0
        ? DIFFERENT_CHECKSUM
        : CHECKSUM;
      state.resource = makeResource(
        body.definition,
        body.expectedRevision + 1,
        state.resource?.publishedVersion ?? 0,
        body.versionNote ?? null,
        definitionChecksum,
      );
      return route.fulfill(json(state.resource));
    }
    const publishMatch = path.match(/^\/api\/page-modules\/dynamic-templates\/([^/]+)\/publish$/);
    if (publishMatch && method === "POST") {
      const templateId = decodeURIComponent(publishMatch[1]);
      if (!matchesPersistedIdentity(state.resource?.templateId, templateId)) return rejectUnexpected("发布模板身份不匹配");
      const write = recordWrite(route, path);
      const body = write.body as { expectedChecksum: string; expectedRevision: number; targetVersion: number; versionNote?: string };
      state.identityRequests.push({ kind: "publish", method, path, templateId });
      state.requestEvents.push({
        expectedRevision: body.expectedRevision,
        kind: "publish",
        method,
        path,
        targetVersion: body.targetVersion,
        templateId,
      });
      if (options.failPublish) return route.fulfill(json(null, 403));
      if (!state.resource?.draft) throw new Error("发布前缺少服务端草稿");
      if (state.holdNextPublish) {
        state.holdNextPublish = false;
        await new Promise<void>((resolve) => {
          state.releaseHeldPublish = resolve;
        });
        state.releaseHeldPublish = null;
      }
      const targetVersion = state.resource.publishedVersion + 1;
      expect(body).toMatchObject({
        expectedChecksum: state.resource.draft.definitionChecksum,
        expectedRevision: state.resource.draft.revision,
        targetVersion,
      });
      const definition = state.resource.draft.definition;
      const definitionChecksum = state.resource.draft.definitionChecksum;
      const publishedDraftRevision = state.resource.draft.revision + 1;
      state.published = publishedFrom(
        state.resource,
        definition,
        null,
        targetVersion,
        definitionChecksum,
      );
      state.publishedVersions = [
        state.published,
        ...state.publishedVersions.filter((version) => version.version !== targetVersion),
      ].sort((left, right) => right.version - left.version);
      state.resource = makeResource(
        definition,
        publishedDraftRevision,
        body.targetVersion,
        null,
        definitionChecksum,
      );
      const published: DynamicTemplateVersionResource = {
        id: 7200 + targetVersion,
        dynamicTemplateId: state.resource.id,
        version: targetVersion,
        schemaVersion: definition.schemaVersion,
        definition: structuredClone(definition),
        definitionChecksum,
        versionNote: null,
        publishedAt: NOW,
      };
      if (state.publishTransport === "uncertain-success") {
        state.publishTransport = "success";
        return route.abort("failed");
      }
      return route.fulfill(json({ templateId: definition.templateId, version: targetVersion, published, draft: state.resource.draft, outcome: "published" }));
    }
    const versionListMatch = path.match(/^\/api\/page-modules\/dynamic-templates\/([^/]+)\/versions$/);
    if (versionListMatch && method === "GET") {
      const templateId = decodeURIComponent(versionListMatch[1]);
      if (!matchesPersistedIdentity(state.resource?.templateId, templateId)) return rejectUnexpected("版本列表模板身份不匹配");
      const resource = state.resource;
      if (!resource) return rejectUnexpected("版本列表缺少服务端模板");
      state.identityRequests.push({ kind: "version-list", method, path, templateId });
      const publishedVersions = state.publishedVersions.length > 0
        ? state.publishedVersions
        : state.published ? [state.published] : [];
      const published = publishedVersions[0];
      state.requestEvents.push({
        kind: "version-list",
        method,
        path,
        templateId,
        ...(published ? { version: published.version } : {}),
      });
      return route.fulfill(json({
        items: publishedVersions.map((version) => ({
          id: 7200 + version.version,
          dynamicTemplateId: resource.id,
          version: version.version,
          schemaVersion: version.schemaVersion,
          definitionChecksum: version.definitionChecksum,
          versionNote: version.versionNote,
          publishedAt: version.publishedAt,
        })),
        nextBeforeVersion: null,
      }));
    }
    const versionMatch = path.match(/^\/api\/page-modules\/dynamic-templates\/published\/([^/]+)\/versions\/(\d+)$/);
    if (versionMatch && method === "GET") {
      const templateId = decodeURIComponent(versionMatch[1]);
      const version = Number(versionMatch[2]);
      if (state.resource && !matchesPersistedIdentity(state.resource.templateId, templateId)) {
        return rejectUnexpected("正式版本模板身份或版本不匹配");
      }
      const publishedVersions = state.publishedVersions.length > 0
        ? state.publishedVersions
        : state.published ? [state.published] : [];
      const published = publishedVersions.find((candidate) => candidate.version === version);
      if (!published || !matchesPersistedIdentity(published.templateId, templateId, version, version)) {
        return rejectUnexpected("正式版本模板身份或版本不匹配");
      }
      if (!state.resource) return route.fulfill(json(null));
      state.identityRequests.push({ kind: "published-version", method, path, templateId, version });
      state.requestEvents.push({ kind: "published-version", method, path, templateId, version });
      if (state.holdNextPublishedVersion) {
        state.holdNextPublishedVersion = false;
        await new Promise<void>((resolve) => {
          state.releaseHeldPublishedVersion = resolve;
        });
        state.releaseHeldPublishedVersion = null;
      }
      return route.fulfill(json({
        id: 7200 + version,
        dynamicTemplateId: state.resource.id,
        templateId: published.templateId,
        version: published.version,
        schemaVersion: published.schemaVersion,
        definition: published.definition,
        definitionChecksum: published.definitionChecksum,
        versionNote: published.versionNote,
        publishedAt: published.publishedAt,
      }));
    }
    if (path.endsWith("/page-modules/document/validate")) return route.fulfill(json({ valid: true, errors: [], issues: [] }));
    if (path.includes("/page-modules/document/revisions")) return route.fulfill(json([]));
    if (path.includes("/page-modules/document/published")) return route.fulfill(json(null));
    if (path.includes("/page-modules/document/admin")) return route.fulfill(json(pageDraft()));
    if (path.includes("/page-modules/dynamic-templates")) return rejectUnexpected("未归类的动态模板请求");
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      recordWrite(route, path);
      return route.fulfill(json(null, 409));
    }
    return route.fulfill(json({}));
  });
  await installAdminSession(page, { username: "td-6a", realName: "TD-6A 专用管理员" });
  return state;
}

async function readSessionSnapshot(page: Page) {
  return page.evaluate<TemplateSessionSnapshot>(async () => {
    const sessionPath = "/src/page-builder/template-editor/templateEditorSession.ts";
    const descriptorPath = "/src/page-builder/dynamic-template-instance/pageFieldDescriptors.ts";
    const [{ useTemplateEditorSession }, { getDynamicTemplatePageFieldDescriptors }] = await Promise.all([
      import(/* @vite-ignore */ sessionPath),
      import(/* @vite-ignore */ descriptorPath),
    ]);
    const state = useTemplateEditorSession.getState();
    const stateWithSelection = state as typeof state & {
      selectionSnapshot?: TemplateSessionSnapshot["selectionSnapshot"];
    };
    const definition = state.draft ? structuredClone(state.draft.definition) : null;
    return {
      definition,
      dirty: state.dirty,
      historyFuture: structuredClone(state.historyFuture),
      historyPast: structuredClone(state.historyPast),
      nodeIds: definition ? Object.keys(definition.nodes).sort() : [],
      pageFields: definition ? structuredClone(getDynamicTemplatePageFieldDescriptors(definition)) : [],
      remote: state.draft?.remote ? structuredClone(state.draft.remote) : null,
      saveStatus: state.saveStatus,
      selectionSnapshot: structuredClone(stateWithSelection.selectionSnapshot ?? null),
      semanticGeneration: state.semanticGeneration,
      sessionId: state.sessionId,
      slotIds: definition ? Object.keys(definition.slots).sort() : [],
      versionNote: state.draft?.versionNote ?? null,
    };
  });
}

function expectExactStructure(definition: TemplateDefinitionV2) {
  const root = definition.nodes[definition.rootNodeId];
  if (!root) throw new Error("定义缺少根节点");
  expect(root.childIds).toHaveLength(2);
  const [region1Id, region2Id] = root.childIds;
  const region1 = definition.nodes[region1Id];
  const region2 = definition.nodes[region2Id];
  if (!region1 || !region2) throw new Error("定义缺少两个直接区域");
  expect([region1.name, region2.name]).toEqual(["内容区域 1", "内容区域 2"]);
  expect(region1.childIds).toHaveLength(1);
  expect(region2.childIds).toHaveLength(1);

  const imageGroup = definition.nodes[region1.childIds[0]];
  const textGroup = definition.nodes[region2.childIds[0]];
  if (!imageGroup || !textGroup) throw new Error("区域缺少指定布局组");
  expect(imageGroup.name).toBe("图片组");
  expect(textGroup.name).toBe("文字组");
  expect(imageGroup.childIds).toHaveLength(1);
  expect(textGroup.childIds).toHaveLength(3);

  const slotNodeIds = [...imageGroup.childIds, ...textGroup.childIds];
  const slotIds = slotNodeIds.map((nodeId) => definition.nodes[nodeId]?.slotId);
  if (slotIds.some((slotId) => !slotId)) throw new Error("直接槽位节点缺少 slotId");
  expect(slotIds.map((slotId) => definition.slots[slotId!]?.type)).toEqual(["image", "heading", "text", "button"]);

  return {
    groupIds: [imageGroup.nodeId, textGroup.nodeId],
    nodeIds: Object.keys(definition.nodes).sort(),
    regionIds: [region1Id, region2Id],
    rootNodeId: definition.rootNodeId,
    slotIds: slotIds as string[],
    slotNodeIds,
  };
}

type ExpectedTreeSelection = {
  anchor?: boolean;
  primary?: boolean;
  targetId: string;
};

function expectedSelectionSnapshot(expected: ExpectedTreeSelection[]) {
  const anchor = expected.find((target) => target.anchor);
  const primary = expected.find((target) => target.primary);
  return {
    targets: expected.map(({ targetId }) => ({ targetId })),
    primaryTarget: primary ? { targetId: primary.targetId } : null,
    anchorTarget: anchor ? { targetId: anchor.targetId } : null,
  };
}

async function expectTreeSelection(
  tree: Locator,
  expected: ExpectedTreeSelection[],
) {
  const selected = tree.locator('[role="treeitem"][aria-selected="true"]');
  await expect(selected).toHaveCount(expected.length);
  expect(await selected.evaluateAll((elements) => elements.map((element) => ({
    targetId: element.getAttribute("data-selection-target-id") ?? "",
    primary: element.getAttribute("data-selection-primary") === "true",
    anchor: element.getAttribute("data-selection-anchor") === "true",
  })))).toEqual(expected.map((target) => ({
    targetId: target.targetId,
    primary: Boolean(target.primary),
    anchor: Boolean(target.anchor),
  })));
}

function expectSelectionOnlyChanged(
  current: TemplateSessionSnapshot,
  frozen: TemplateSessionSnapshot,
  expected: ExpectedTreeSelection[],
) {
  const { selectionSnapshot: currentSelection, ...currentFacts } = current;
  const { selectionSnapshot: _frozenSelection, ...frozenFacts } = frozen;
  expect(currentFacts, "选择不得改写 definition、dirty、history、revision 或其他会话事实")
    .toEqual(frozenFacts);
  expect(currentSelection).toEqual(expectedSelectionSnapshot(expected));
}

function expectSessionFactsUnchanged(
  current: TemplateSessionSnapshot,
  frozen: TemplateSessionSnapshot,
) {
  const { selectionSnapshot: _currentSelection, ...currentFacts } = current;
  const { selectionSnapshot: _frozenSelection, ...frozenFacts } = frozen;
  expect(currentFacts).toEqual(frozenFacts);
}

function readServerCounters(server: MockTemplateServer) {
  return {
    catalogReads: server.catalogReads,
    dangerousWrites: server.dangerousWrites.length,
    dynamicWrites: server.dynamicWrites.length,
    identityRequests: server.identityRequests.length,
    pageWrites: server.pageWrites.length,
    requestEvents: server.requestEvents.length,
    unexpectedRequests: server.unexpectedRequests.length,
  };
}

async function readRendererGeometry(
  page: Page,
  definition: TemplateDefinitionV2,
  device: "desktop" | "mobile",
) {
  const renderer = page.frameLocator("iframe.template-editor__viewport-frame")
    .locator(".template-editor__dynamic-canvas-renderer");
  await expect(renderer).toHaveAttribute("data-preview-mode", "true");
  const root = renderer.locator(
    `[data-dynamic-template-id="${definition.templateId}"]`,
  ).first();
  await expect(root).toBeVisible();
  await expect(root).toHaveAttribute("data-dynamic-template-device", device);
  await root.evaluate(async (element) => {
    await element.ownerDocument.fonts?.ready;
    const ownerWindow = element.ownerDocument.defaultView;
    if (!ownerWindow) return;
    await new Promise<void>((resolve) => {
      ownerWindow.requestAnimationFrame(() => ownerWindow.requestAnimationFrame(() => resolve()));
    });
  });
  return root.evaluate((element) => {
    const root = element as HTMLElement;
    const allNodes = [...root.querySelectorAll<HTMLElement>("[data-template-node-id]")];
    const rect = (node: HTMLElement) => {
      const box = node.getBoundingClientRect();
      return {
        height: Math.round(box.height * 10) / 10,
        width: Math.round(box.width * 10) / 10,
        x: Math.round(box.x * 10) / 10,
        y: Math.round(box.y * 10) / 10,
      };
    };
    return {
      documentOverflow: root.ownerDocument.documentElement.scrollWidth
        > root.ownerDocument.documentElement.clientWidth + 1,
      emptySlots: [...root.querySelectorAll<HTMLElement>(".hc-dynamic-template__empty-slot")]
        .map((node) => ({ rect: rect(node), text: node.textContent?.trim() ?? "" })),
      imageCount: root.querySelectorAll("img").length,
      nodes: allNodes.map((node) => {
        const styles = getComputedStyle(node);
        return {
          display: styles.display,
          flexDirection: styles.flexDirection,
          nodeId: node.dataset.templateNodeId ?? "",
          order: Number(styles.order),
          parentNodeId: node.parentElement?.closest<HTMLElement>("[data-template-node-id]")
            ?.dataset.templateNodeId ?? null,
          rect: rect(node),
        };
      }),
      root: {
        clientHeight: root.clientHeight,
        clientWidth: root.clientWidth,
        overflow: root.scrollWidth > root.clientWidth + 1,
        rect: rect(root),
        scrollHeight: root.scrollHeight,
      },
    };
  });
}

function expectRendererGeometry(
  geometry: Awaited<ReturnType<typeof readRendererGeometry>>,
  definition: TemplateDefinitionV2,
  device: "desktop" | "mobile",
  hiddenNodeIds: readonly string[] = [],
) {
  const identity = expectExactStructure(definition);
  const hiddenNodeIdSet = new Set(hiddenNodeIds);
  const expectedOrder = [
    identity.rootNodeId,
    identity.regionIds[0],
    identity.groupIds[0],
    identity.slotNodeIds[0],
    identity.regionIds[1],
    identity.groupIds[1],
    ...identity.slotNodeIds.slice(1),
  ].filter((nodeId) => !hiddenNodeIdSet.has(nodeId));
  expect(geometry.nodes.map((node) => node.nodeId), `${device} 必须按 Definition 深度优先顺序渲染真实节点`)
    .toEqual(expectedOrder);
  const expectedParents = new Map<string, string | null>([[identity.rootNodeId, null]]);
  for (const node of Object.values(definition.nodes)) {
    for (const childId of node.childIds) expectedParents.set(childId, node.nodeId);
  }
  const isCollapsedBranch = (nodeId: string): boolean => {
    const node = definition.nodes[nodeId];
    if (!node) return false;
    if (node.slotId) return hiddenNodeIdSet.has(nodeId);
    return node.childIds.length > 0 && node.childIds.every(isCollapsedBranch);
  };
  for (const node of geometry.nodes) {
    expect(node.parentNodeId, `${device}.${node.nodeId} 必须保持 Definition 父子关系`)
      .toBe(expectedParents.get(node.nodeId));
    expect(node.rect.width, `${device}.${node.nodeId} 宽度必须非零`).toBeGreaterThan(0);
    if (!isCollapsedBranch(node.nodeId)) {
      expect(node.rect.height, `${device}.${node.nodeId} 高度必须非零`).toBeGreaterThan(0);
    }
  }
  expect(geometry.root.rect.width, `${device} Renderer 根宽度必须非零`).toBeGreaterThan(0);
  expect(geometry.root.rect.height, `${device} Renderer 根高度必须非零`).toBeGreaterThan(0);
  expect(geometry.root.overflow, `${device} Renderer 根不得横向溢出`).toBe(false);
  expect(geometry.documentOverflow, `${device} iframe 文档不得横向溢出`).toBe(false);

  const byId = new Map(geometry.nodes.map((node) => [node.nodeId, node]));
  for (const parent of Object.values(definition.nodes)) {
    if (parent.childIds.length < 2) continue;
    const orderedChildren = parent.childIds
      .filter((childId) => !hiddenNodeIdSet.has(childId))
      .map((childId, index) => ({ childId, index, order: definition.nodes[childId].responsive[device].order }))
      .sort((left, right) => left.order - right.order || left.index - right.index)
      .map(({ childId }) => byId.get(childId)!);
    const rules = parent.responsive[device];
    const axis = rules.display === "flex" && rules.direction === "row" ? "x" : "y";
    for (let index = 1; index < orderedChildren.length; index += 1) {
      expect(
        orderedChildren[index].rect[axis],
        `${device}.${parent.nodeId} 子节点必须按当前 ${axis} 轴语义顺序排列`,
      ).toBeGreaterThanOrEqual(orderedChildren[index - 1].rect[axis] - 1);
    }
  }
}

function expectResponsiveRootGeometry(
  geometry: Awaited<ReturnType<typeof readRendererGeometry>>,
  definition: TemplateDefinitionV2,
  device: "desktop" | "mobile",
) {
  const identity = expectExactStructure(definition);
  const byId = new Map(geometry.nodes.map((node) => [node.nodeId, node]));
  const root = byId.get(identity.rootNodeId);
  const firstRegion = byId.get(identity.regionIds[0]);
  const secondRegion = byId.get(identity.regionIds[1]);
  if (!root || !firstRegion || !secondRegion) throw new Error(`${device} 缺少根级响应式几何节点`);
  expect(root.display, `${device} 根节点必须使用真实 flex 构图`).toBe("flex");
  expect(root.flexDirection, `${device} 根节点方向必须与当前端定义一致`)
    .toBe(device === "desktop" ? "row" : "column");
  if (device === "desktop") {
    expect(secondRegion.rect.x, "桌面端第二内容区域必须真实位于第一内容区域右侧")
      .toBeGreaterThan(firstRegion.rect.x + 1);
    expect(Math.abs(secondRegion.rect.y - firstRegion.rect.y), "桌面端两个内容区域必须位于同一视觉行")
      .toBeLessThanOrEqual(1);
  } else {
    expect(secondRegion.rect.y, "移动端第二内容区域必须真实位于第一内容区域下方")
      .toBeGreaterThan(firstRegion.rect.y + 1);
  }
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => (
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
  ))).toBe(true);
}

async function applyDeterministicTextScale200(page: Page, probe: Locator) {
  const baseline = await probe.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  const result = await page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>([
      ".template-editor__toolbar button",
      ".template-editor__body button",
      ".template-editor__body input",
      ".template-editor__body select",
      ".template-editor__body textarea",
      ".template-editor__body label",
      ".template-editor__body strong",
      ".template-editor__body small",
      ".template-editor__body p",
    ].join(",")));
    elements.forEach((element) => {
      element.dataset.td6OriginalInlineFontSize = element.style.fontSize;
      const current = Number.parseFloat(getComputedStyle(element).fontSize);
      if (Number.isFinite(current) && current > 0) element.style.fontSize = `${current * 2}px`;
    });
    document.documentElement.dataset.td6TextScale = "200";
    return { count: elements.length, dpr: window.devicePixelRatio };
  });
  expect(result.dpr, "200% 文本证据固定 DPR=1，不能用 deviceScaleFactor 冒充").toBe(1);
  expect(result.count).toBeGreaterThan(10);
  await expect.poll(() => probe.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)))
    .toBeCloseTo(baseline * 2, 4);
}

async function removeDeterministicTextScale200(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll<HTMLElement>("[data-td6-original-inline-font-size]").forEach((element) => {
      element.style.fontSize = element.dataset.td6OriginalInlineFontSize ?? "";
      delete element.dataset.td6OriginalInlineFontSize;
    });
    delete document.documentElement.dataset.td6TextScale;
  });
}

async function expectWorkspaceViewport(
  page: Page,
  server: MockTemplateServer,
  frozen: TemplateSessionSnapshot,
  viewport: { width: number; height: number },
) {
  const requestsBefore = readServerCounters(server);
  await page.setViewportSize(viewport);
  const compact = viewport.width < 1200;
  const body = page.locator(".template-editor__body");
  await expect(body).toHaveAttribute("data-template-workspace-compact", String(compact));
  await expect(page.getByRole("region", { name: /模板(?:设计)?画布/ })).toBeVisible();
  await expect(page.locator(
    ".template-editor__body > .template-editor__stage .template-editor__canvas-scroll",
  )).toHaveCount(1);
  if (compact) {
    for (const panel of [
      { dialog: "模板设计模板目录", label: "模板组件库", trigger: "展开模板组件库" },
      { dialog: "模板结构", label: "模板结构面板", trigger: "展开模板结构面板" },
      { dialog: "模板属性工作区", label: "模板属性面板", trigger: "展开模板属性面板" },
    ]) {
      const trigger = page.getByRole("button", { name: panel.trigger, exact: true });
      await trigger.focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: panel.dialog, exact: true });
      await expect(dialog, `${viewport.width}px 必须可恢复打开${panel.label}`).toBeVisible();
      await expect(dialog).toHaveAttribute("aria-modal", "true");
      await expect(dialog.getByRole("button", { name: `收起${panel.label}`, exact: true })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(trigger, `${viewport.width}px 关闭${panel.label}后焦点必须返回入口`).toBeFocused();
    }
  } else {
    await expect(page.getByRole("complementary", { name: "模板组件库", exact: true })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "模板结构", exact: true })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "模板属性", exact: true })).toBeVisible();
  }
  await expectNoHorizontalOverflow(page);
  expect(await readSessionSnapshot(page), `${viewport.width}×${viewport.height} 只允许改变工作区呈现`)
    .toEqual(frozen);
  expect(readServerCounters(server), `${viewport.width}×${viewport.height} 响应式检查不得触发请求`)
    .toEqual(requestsBefore);
}

async function setSwitch(page: Page, name: string, checked: boolean) {
  const control = page.getByRole("switch", { name, exact: true });
  const current = await control.getAttribute("aria-checked") === "true";
  if (current !== checked) await control.click();
  await expect(control).toHaveAttribute("aria-checked", String(checked));
}

async function openPageField(page: Page, treeItemName: RegExp, label: string) {
  const tree = page.getByRole("tree", { name: "模板区域与槽位" });
  await tree.getByRole("treeitem", { name: treeItemName }).click();
  await page.getByRole("tab", { name: "页面开放范围" }).click();
  await page.getByLabel("页面字段名称").fill(label);
  await page.getByLabel("页面字段名称").press("Tab");
  await expect(page.getByLabel("页面字段名称")).toHaveValue(label);
}

async function expectPageFieldSummary(
  page: Page,
  pageFields: Awaited<ReturnType<typeof readSessionSnapshot>>["pageFields"],
) {
  const expected = [
    {
      control: "image",
      controlLabel: "图片选择",
      editable: true,
      hideable: true,
      label: "工艺主图",
      limit: "建议 1600 × 1000 像素",
      overrideCopy: "页面设计覆盖：允许图片适配/图片焦点覆盖",
      policy: {
        position: false, size: false, zIndex: false, imageFit: true, imageFocus: true,
        typography: false, spacing: false, minWidthPercent: 25, maxWidthPercent: 150,
        maxOffsetPercent: 30, minFontSizePx: 12, maxFontSizePx: 96, maxSpacingPx: 120,
      },
      required: false,
      validation: { recommendedWidth: 1600, recommendedHeight: 1000 },
    },
    {
      control: "text",
      controlLabel: "文字输入",
      editable: true,
      hideable: false,
      label: "工艺标题",
      limit: "最小 2 字；最大 36 字",
      overrideCopy: "页面设计覆盖：允许文字样式覆盖；字号 12–96 像素",
      policy: {
        position: false, size: false, zIndex: false, imageFit: false, imageFocus: false,
        typography: true, spacing: false, minWidthPercent: 25, maxWidthPercent: 150,
        maxOffsetPercent: 30, minFontSizePx: 12, maxFontSizePx: 96, maxSpacingPx: 120,
      },
      required: true,
      validation: { minLength: 2, maxLength: 36 },
    },
    {
      control: "text",
      controlLabel: "文字输入",
      editable: true,
      hideable: true,
      label: "正文槽位",
      limit: "最小 0 字；最大 240 字",
      overrideCopy: "页面设计覆盖：允许间距覆盖；间距不超过 120 像素",
      policy: {
        position: false, size: false, zIndex: false, imageFit: false, imageFocus: false,
        typography: false, spacing: true, minWidthPercent: 25, maxWidthPercent: 150,
        maxOffsetPercent: 30, minFontSizePx: 12, maxFontSizePx: 96, maxSpacingPx: 120,
      },
      required: false,
      validation: { minLength: 0, maxLength: 240 },
    },
    {
      control: "link",
      controlLabel: "行动与链接",
      editable: true,
      hideable: true,
      label: "了解工艺",
      limit: "未设置额外限制",
      overrideCopy: "页面设计覆盖：允许位置覆盖；偏移不超过 30%",
      policy: {
        position: true, size: false, zIndex: false, imageFit: false, imageFocus: false,
        typography: false, spacing: false, minWidthPercent: 25, maxWidthPercent: 150,
        maxOffsetPercent: 30, minFontSizePx: 12, maxFontSizePx: 96, maxSpacingPx: 120,
      },
      required: false,
      validation: {},
    },
  ];
  expect(pageFields.map((field) => ({
    control: field.controlKind,
    editable: field.editable,
    hideable: field.hideable,
    label: field.label,
    policy: field.effectiveDesignOverrideCapabilities,
    required: field.required,
    validation: field.validation,
  }))).toEqual(expected.map(({ control, editable, hideable, label, policy, required, validation }) => ({
    control, editable, hideable, label, policy, required, validation,
  })));

  const tree = page.getByRole("tree", { name: "模板区域与槽位" });
  for (const scope of [
    { count: 1, offset: 0, region: /内容区域 1/ },
    { count: 3, offset: 1, region: /内容区域 2/ },
  ]) {
    await tree.getByRole("treeitem", { name: scope.region }).click();
    await page.getByRole("tab", { name: "页面开放范围" }).click();
    const fields = page.getByRole("region", { name: "当前结构页面字段" });
    const buttons = fields.getByRole("button");
    await expect(buttons).toHaveCount(scope.count);
    for (let localIndex = 0; localIndex < scope.count; localIndex += 1) {
      const index = scope.offset + localIndex;
      const item = expected[index];
      const field = buttons.nth(localIndex);
      await expect(field).toHaveAttribute("data-page-field-label", item.label);
      await expect(field).toHaveAttribute("data-page-field-control-kind", item.control);
      await expect(field).toHaveAttribute("data-page-field-required", String(item.required));
      await expect(field).toHaveAttribute("data-page-field-editable", String(item.editable));
      await expect(field).toHaveAttribute("data-page-field-hideable", String(item.hideable));
      const validationAttribute = await field.getAttribute("data-page-field-validation");
      const policyAttribute = await field.getAttribute("data-page-field-policy");
      expect(validationAttribute).not.toBeNull();
      expect(policyAttribute).not.toBeNull();
      expect(JSON.parse(validationAttribute!)).toEqual(item.validation);
      expect(JSON.parse(policyAttribute!)).toEqual(item.policy);
      await expect(field).toContainText(`${item.required ? "必填" : "可选"} · 可填写 · ${item.hideable ? "可隐藏" : "固定显示"}`);
      await expect(field).toContainText(`控件：${item.controlLabel}`);
      await expect(field).toContainText(`限制：${item.limit}`);
      await expect(field).toContainText(item.overrideCopy);
    }
  }
}

async function openBlankTemplate(page: Page) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await createBlankTemplate(page);
  await expect(page.getByRole("tree", { name: "模板区域与槽位" }).getByRole("treeitem")).toHaveCount(0);
  await (await productionStageAction(page, "交付信息")).click();
}

async function chooseAddTarget(page: Page, label: string) {
  const target = page.getByLabel("添加目标");
  const value = await target.locator("option").filter({ hasText: label }).getAttribute("value");
  if (!value) throw new Error(`缺少添加目标：${label}`);
  await target.selectOption(value);
}

async function addTwoRegionsAndGroups(page: Page) {
  const tools = page.getByRole("complementary", { name: "模板结构" });
  await tools.getByRole("button", { name: "添加区域", exact: true }).click();
  await tools.getByRole("button", { name: "添加区域", exact: true }).click();
  const regionDialog = page.getByRole("dialog", { name: "添加区域" });
  await regionDialog.getByLabel("区域插入位置").selectOption("after");
  await regionDialog.getByRole("button", { name: "确认添加区域" }).click();
  const tree = page.getByRole("tree", { name: "模板区域与槽位" });
  await expect(tree.getByRole("treeitem", { name: /内容区域 1/ })).toBeVisible();
  await expect(tree.getByRole("treeitem", { name: /内容区域 2/ })).toBeVisible();

  await tree.getByRole("treeitem", { name: /内容区域 1/ }).click();
  await tools.getByRole("button", { name: "添加槽位" }).click();
  await page.getByRole("button", { name: "添加左右排列布局分组" }).click();
  await page.keyboard.press("Escape");
  await page.getByLabel("节点名称").first().fill("图片组");
  await page.getByLabel("节点名称").first().press("Tab");
  await tools.getByRole("button", { name: "添加槽位" }).click();
  await chooseAddTarget(page, "图片组");
  await page.getByRole("button", { name: "添加图片槽位" }).click();
  await page.keyboard.press("Escape");

  await tree.getByRole("treeitem", { name: /内容区域 2/ }).click();
  await tools.getByRole("button", { name: "添加槽位" }).click();
  await page.getByRole("button", { name: "添加上下排列布局分组" }).click();
  await page.keyboard.press("Escape");
  await page.getByLabel("节点名称").first().fill("文字组");
  await page.getByLabel("节点名称").first().press("Tab");
  await tools.getByRole("button", { name: "添加槽位" }).click();
  await chooseAddTarget(page, "文字组");
  await page.getByRole("button", { name: "添加标题槽位" }).click();
  await page.getByRole("button", { name: "添加正文槽位" }).click();
  await page.getByRole("button", { name: "添加按钮槽位" }).click();
  await page.keyboard.press("Escape");
  for (const name of ["图片组 布局容器", "图片槽位", "文字组 布局容器", "标题槽位", "正文槽位", "按钮槽位"]) {
    await expect(tree.getByRole("treeitem", { name: new RegExp(name) })).toBeVisible();
  }
}

async function saveDraft(page: Page) {
  await page.getByRole("button", { name: "保存模板", exact: true }).click();
  await expect(page.getByText("模板草稿已保存，可继续设计或发布", { exact: true })).toBeVisible();
}

async function completeProductionReviews(page: Page) {
  await reviewTemplateForPublish(page);
}

test("历史 4:3 双图文夹具保持可编辑双端结构且零网络写", async ({ page }) => {
  const server = await installTemplateServer(page);
  await openBlankTemplate(page);
  await page.getByRole("textbox", { name: "模板名称", exact: true }).fill("4:3 双图文运营模板");
  await page.getByRole("textbox", { name: "模板名称", exact: true }).press("Tab");
  await (await productionStageAction(page, "交付信息")).click();
  await page.getByLabel("用途", { exact: true }).fill("用于 4:3 双图文运营内容");
  await page.getByLabel("用途", { exact: true }).press("Tab");
  await page.getByRole("button", { name: "预览模板", exact: true }).focus();
  await page.evaluate(async () => {
    const repoPath = "/src/page-builder/template-editor/dynamicTemplateDraftRepository.ts";
    const sessionPath = "/src/page-builder/template-editor/templateEditorSession.ts";
        const [{ createBasicContentSkeletonDefinition }, { useTemplateEditorSession }] = await Promise.all([
      import(/* @vite-ignore */ repoPath), import(/* @vite-ignore */ sessionPath),
    ]);
    const result = useTemplateEditorSession.getState().executeCommand({ type: "transform-definition", label: "装入历史 4:3 骨架夹具", transform: (source: TemplateDefinitionV2) => { const next = createBasicContentSkeletonDefinition(source); next.metadata.desktopRatio = "4:3"; next.nodes[next.rootNodeId].responsive.desktop.height = { mode: "aspect-ratio", ratio: { width: 4, height: 3 } }; return next; } });
    if (!result.ok) throw new Error(result.message);
  });
  await expect(page.getByRole("region", { name: "空白模板制作起点" })).toHaveCount(0);

  const session = await readSessionSnapshot(page);
  if (!session.definition) throw new Error("采用骨架后缺少 TemplateDefinitionV2");
  const definition = session.definition;
  const [regionId] = definition.nodes[definition.rootNodeId].childIds;
  const [compositionId] = definition.nodes[regionId].childIds;
  const [imageGroupId, textGroupId] = definition.nodes[compositionId].childIds;
  const imageNodeIds = definition.nodes[imageGroupId].childIds;
  expect(session.historyPast).toHaveLength(3); // 名称、用途与完整骨架各一条事务
  expect(definition.metadata.desktopRatio).toBe("4:3");
  expect(definition.nodes[definition.rootNodeId].responsive.desktop.height).toEqual({
    mode: "aspect-ratio",
    ratio: { width: 4, height: 3 },
  });
  expect(definition.nodes[compositionId].responsive.desktop.direction).toBe("row");
  expect(definition.nodes[compositionId].responsive.mobile.direction).toBe("column");
  expect(imageNodeIds).toHaveLength(2);
  expect(definition.nodes[textGroupId].childIds).toHaveLength(2);
  for (const imageNodeId of imageNodeIds) {
    const slotId = definition.nodes[imageNodeId].slotId!;
    expect(definition.slots[slotId].desktopRules.aspectRatio).toBe("4:3");
    expect(definition.slots[slotId].mobileRules.aspectRatio).toBe("4:3");
  }

  const tree = page.getByRole("tree", { name: "模板区域与槽位" });
  for (const label of ["内容区域 1", "双图文布局", "图片组", "图片槽位 1", "图片槽位 2", "文字组", "标题槽位", "正文槽位"]) {
    await expect(tree.getByRole("treeitem", { name: new RegExp(label) })).toBeVisible();
  }
  const renderer = page.frameLocator("iframe.template-editor__viewport-frame")
    .locator(`[data-dynamic-template-id="${definition.templateId}"]`);
  await expect(renderer.locator("img")).toHaveCount(2);
  const desktopRatio = await renderer.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width / rect.height;
  });
  expect(desktopRatio).toBeCloseTo(4 / 3, 1);

  await page.locator(".template-editor__toolbar").getByRole("button", { name: /移动端模板布局/ }).click();
  await expect(page.frameLocator("iframe.template-editor__viewport-frame")
    .locator(`[data-template-node-id="${compositionId}"]`)).toHaveCSS("flex-direction", "column");
  expect(server.dynamicWrites).toEqual([]);
  expect(server.pageWrites).toEqual([]);
});

test("结构选择默认在当前容器末尾新增，undo/redo 恢复命令前后选择", async ({ page }) => {
  const server = await installTemplateServer(page);
  await openBlankTemplate(page);
  await page.getByRole("textbox", { name: "模板名称", exact: true }).fill("插入与选择验收模板");
  await page.getByRole("textbox", { name: "模板名称", exact: true }).press("Tab");
  await (await productionStageAction(page, "交付信息")).click();
  await page.getByLabel("用途", { exact: true }).fill("验证高频选择与插入语义");
  await page.getByLabel("用途", { exact: true }).press("Tab");
  await page.getByRole("button", { name: "预览模板", exact: true }).focus();
  await applyBasicSkeleton(page);

  const beforeAdd = await readSessionSnapshot(page);
  if (!beforeAdd.definition) throw new Error("采用骨架后缺少定义");
  const definition = beforeAdd.definition;
  const [regionId] = definition.nodes[definition.rootNodeId].childIds;
  const [compositionId] = definition.nodes[regionId].childIds;
  const [imageGroupId, textGroupId] = definition.nodes[compositionId].childIds;
  const originalTextChildren = [...definition.nodes[textGroupId].childIds];
  const tree = page.getByRole("tree", { name: "模板区域与槽位" });
  const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
  const expectUnifiedSelection = async (targetId: string) => {
    const treeItem = tree.locator(`[role="treeitem"][data-selection-target-id="${targetId}"]`);
    await expect(treeItem).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(`.template-editor__editable-overlay-selection[data-overlay-selection-for="node:${targetId}"]`))
      .toBeVisible();
    await expect(inspector).toHaveAttribute("data-template-inspector-object-id", targetId);
    expect((await readSessionSnapshot(page)).selectionSnapshot?.primaryTarget).toEqual({ targetId });
  };

  const imageGroupItem = tree.locator(`[role="treeitem"][data-selection-target-id="${imageGroupId}"]`);
  await imageGroupItem.focus();
  await expect(imageGroupItem).toBeFocused();
  await imageGroupItem.press("Enter");
  await expectUnifiedSelection(imageGroupId);

  const textGroupItem = tree.locator(`[role="treeitem"][data-selection-target-id="${textGroupId}"]`);
  await textGroupItem.getByText("文字组", { exact: true }).click();
  await expectUnifiedSelection(textGroupId);

  const networkBeforeInsert = readServerCounters(server);
  await page.getByRole("complementary", { name: "模板结构", exact: true })
    .getByRole("button", { name: "添加槽位", exact: true })
    .click();
  const addDialog = page.getByRole("dialog", { name: "添加槽位", exact: true });
  await expect(addDialog).toContainText("当前选择：文字组");
  await expect(addDialog.getByLabel("添加目标")).toHaveValue(textGroupId);
  await expect(addDialog).toContainText("添加到：");
  await addDialog.getByRole("button", { name: "添加按钮槽位", exact: true }).click();
  await expect(page.getByText("按钮槽位已添加到“文字组”", { exact: true })).toBeVisible();

  const afterAdd = await readSessionSnapshot(page);
  if (!afterAdd.definition) throw new Error("新增按钮后缺少定义");
  const addedNodeId = afterAdd.definition.nodes[textGroupId].childIds
    .find((nodeId) => !originalTextChildren.includes(nodeId));
  if (!addedNodeId) throw new Error("按钮槽位未落入文字组");
  expect(afterAdd.definition.nodes[addedNodeId].type).toBe("ButtonSlot");
  await expectUnifiedSelection(addedNodeId);

  await page.getByRole("button", { name: "撤销", exact: true }).click();
  const afterUndo = await readSessionSnapshot(page);
  expect(afterUndo.definition?.nodes[addedNodeId]).toBeUndefined();
  await expectUnifiedSelection(textGroupId);

  await page.getByRole("button", { name: "重做", exact: true }).click();
  const afterRedo = await readSessionSnapshot(page);
  expect(afterRedo.definition?.nodes[addedNodeId]?.type).toBe("ButtonSlot");
  expect(afterRedo.definition?.nodes[textGroupId].childIds).toContain(addedNodeId);
  await expectUnifiedSelection(addedNodeId);
  expect(readServerCounters(server), "选择、新增与 undo/redo 只改内存草稿")
    .toEqual(networkBeforeInsert);
});

test("模板文本字段逐字编辑只提交一次历史，Escape 恢复且允许临时清空", async ({ page }) => {
  const server = await installTemplateServer(page);
  await openBlankTemplate(page);
  const input = page.getByLabel("模板名称", { exact: true }).first();
  const baseline = (await readSessionSnapshot(page)).definition!.name;

  await input.focus();
  await input.press("Control+A");
  await input.pressSequentially("不会提交的名称", { delay: 10 });
  expect((await readSessionSnapshot(page)).historyPast).toHaveLength(0);
  await input.press("Escape");
  await expect(input).toHaveValue(baseline);
  expect((await readSessionSnapshot(page)).historyPast).toHaveLength(0);

  await input.focus();
  await input.press("Control+A");
  await input.pressSequentially("一次提交的新名称", { delay: 10 });
  expect((await readSessionSnapshot(page)).historyPast).toHaveLength(0);
  await input.press("Enter");
  const committed = await readSessionSnapshot(page);
  expect(committed.definition!.name).toBe("一次提交的新名称");
  expect(committed.historyPast).toHaveLength(1);

  await input.focus();
  await input.press("Control+A");
  await input.press("Backspace");
  await expect(input).toHaveValue("");
  expect((await readSessionSnapshot(page)).definition!.name).toBe("一次提交的新名称");
  await input.press("Escape");
  await expect(input).toHaveValue("一次提交的新名称");
  expect((await readSessionSnapshot(page)).historyPast).toHaveLength(1);
  expect(server.dynamicWrites).toEqual([]);
});

test("TD-6A 同一个专用模板从真正空白制作到目录精确 v1", async ({ page }) => {
  test.setTimeout(150_000);
  const server = await installTemplateServer(page);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await openBlankTemplate(page);
  const blankSession = await readSessionSnapshot(page);
  if (!blankSession.definition) throw new Error("显式新建后缺少真正空白的 TemplateDefinitionV2");
  expect(Object.keys(blankSession.definition.nodes)).toEqual([blankSession.definition.rootNodeId]);
  expect(blankSession.definition.nodes[blankSession.definition.rootNodeId].childIds).toEqual([]);
  expect(blankSession.definition.slots).toEqual({});
  expect(blankSession.definition.defaultContent).toEqual({});
  expect(blankSession.definition.previewContent).toEqual({});
  expect(blankSession.historyPast).toEqual([]);
  expect(blankSession.historyFuture).toEqual([]);
  expect(blankSession.dirty).toBe(true);
  expect(server.createdTemplateId).toBeNull();
  expect(server.dynamicWrites).toEqual([]);
  expect(server.identityRequests).toEqual([]);
  expect(server.pageWrites).toEqual([]);
  expect(server.dangerousWrites).toEqual([]);
  expect(server.requestEvents.filter((event) => event.kind !== "catalog"), "真正空白阶段不得读取、保存或发布任何模板身份")
    .toEqual([]);
  await page.getByRole("textbox", { name: "模板名称", exact: true }).fill("TD-6A 工艺介绍专用模板");
  await page.getByRole("textbox", { name: "模板名称", exact: true }).press("Tab");
  await (await productionStageAction(page, "交付信息")).click();
  const purposeInput = page.locator('[data-template-inspector-field="metadata.purpose"]')
    .getByRole("textbox", { name: "用途", exact: true });
  await purposeInput.fill("工艺介绍与细节说明");
  await purposeInput.press("Tab");
  await addTwoRegionsAndGroups(page);

  const tree = page.getByRole("tree", { name: "模板区域与槽位" });
  const initialSession = await readSessionSnapshot(page);
  if (!initialSession.definition) throw new Error("空白制作后缺少内存定义");
  const initialIdentity = expectExactStructure(initialSession.definition);

  const rootTarget = page.getByRole("button", { name: "选择模板目标 模板根节点", exact: true });
  await rootTarget.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("tab", { name: "设计", exact: true }).click();
  await page.getByRole("button", { name: /桌面端模板布局/ }).click();
  await page.getByRole("button", { name: "预览左右排列", exact: true }).click();
  await page.getByRole("button", { name: "确认排列转换", exact: true }).click();
  await page.getByRole("button", { name: /移动端模板布局/ }).click();
  await page.getByRole("button", { name: "预览上下排列", exact: true }).click();
  await page.getByRole("button", { name: "确认排列转换", exact: true }).click();
  await tree.getByRole("treeitem", { name: "图片组 布局容器" }).click();
  await page.getByRole("button", { name: /桌面端模板布局/ }).click();
  await page.getByRole("button", { name: "预览左右排列", exact: true }).click();
  await page.getByRole("button", { name: "确认排列转换", exact: true }).click();
  await page.getByRole("button", { name: /移动端模板布局/ }).click();
  await page.getByRole("button", { name: "预览上下排列", exact: true }).click();
  await page.getByRole("button", { name: "确认排列转换", exact: true }).click();

  await openPageField(page, /图片槽位/, "工艺主图");
  const systemIdentity = page.getByText("系统身份 · 改名称不会改变身份", { exact: true });
  await expect(systemIdentity).toBeVisible();
  await systemIdentity.click();
  await expect(page.getByText("字段标识", { exact: true })).toBeVisible();
  await page.getByLabel("页面必须填写").uncheck();
  await expect(page.getByLabel("页面可填写内容")).toBeChecked();
  await page.getByLabel("页面可隐藏").check();
  await page.getByLabel("建议图片宽").fill("1600");
  await page.getByLabel("建议图片高").fill("1000");
  await page.getByLabel("可调整图片适配").check();

  await openPageField(page, /标题槽位/, "工艺标题");
  await page.getByLabel("页面可隐藏").uncheck();
  await page.getByLabel("页面必须填写").check();
  await page.getByLabel("页面可填写内容").check();
  await page.getByLabel("最小字数").fill("2");
  await page.getByLabel("最大字数").fill("36");
  await page.getByLabel("允许调整文字样式").check();

  await openPageField(page, /正文槽位/, "正文槽位");
  await page.getByLabel("页面必须填写").uncheck();
  await page.getByLabel("页面可填写内容").check();
  await page.getByLabel("页面可隐藏").check();
  await page.getByLabel("最小字数").fill("0");
  await page.getByLabel("最大字数").fill("240");
  await page.getByLabel("允许调整间距").check();

  await openPageField(page, /按钮槽位/, "了解工艺");
  await page.getByLabel("页面必须填写").uncheck();
  await page.getByLabel("页面可填写内容").check();
  await page.getByLabel("页面可隐藏").check();
  await page.getByLabel("允许调整位置").check();
  const authoredSession = await readSessionSnapshot(page);
  if (!authoredSession.definition) throw new Error("页面开放范围配置后缺少内存定义");
  const authoredIdentity = expectExactStructure(authoredSession.definition);
  expect(authoredIdentity).toEqual(initialIdentity);
  const [imageGroupId] = authoredIdentity.groupIds;
  expect(authoredSession.definition.nodes[authoredSession.definition.rootNodeId].responsive.desktop.direction)
    .toBe("row");
  expect(authoredSession.definition.nodes[authoredSession.definition.rootNodeId].responsive.mobile.direction)
    .toBe("column");
  expect(authoredSession.definition.nodes[imageGroupId].responsive.desktop.direction).toBe("row");
  expect(authoredSession.definition.nodes[imageGroupId].responsive.mobile.direction).toBe("column");
  await expectPageFieldSummary(page, authoredSession.pageFields);
  const pageFieldsByLabel = Object.fromEntries(authoredSession.pageFields.map((field) => [field.label, field]));
  expect(pageFieldsByLabel["工艺主图"].effectiveDesignOverrideCapabilities).toMatchObject({ imageFit: true });
  expect(pageFieldsByLabel["工艺标题"].effectiveDesignOverrideCapabilities).toMatchObject({ typography: true });
  expect(pageFieldsByLabel["正文槽位"].effectiveDesignOverrideCapabilities).toMatchObject({ spacing: true });
  expect(pageFieldsByLabel["了解工艺"].effectiveDesignOverrideCapabilities).toMatchObject({ position: true });
  const responsiveFrozen = await readSessionSnapshot(page);
  for (const viewport of [
    { width: 1600, height: 1000 },
    { width: 1200, height: 900 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ]) {
    await expectWorkspaceViewport(page, server, responsiveFrozen, viewport);
  }
  await page.setViewportSize({ width: 1600, height: 1000 });
  const textScaleNetwork = readServerCounters(server);
  const textScaleSession = await readSessionSnapshot(page);
  const saveAction = page.getByRole("button", { name: "保存模板", exact: true });
  await applyDeterministicTextScale200(page, saveAction);
  await expect(saveAction).toBeVisible();
  await expect(page.getByRole("complementary", { name: "模板结构", exact: true })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "模板属性", exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  const previewBeforeSave = page.getByRole("button", { name: "预览模板", exact: true });
  await previewBeforeSave.focus();
  await page.keyboard.press("Tab");
  await expect(saveAction, "200% 文本下主要保存动作仍须位于键盘顺序中").toBeFocused();
  expect(await readSessionSnapshot(page), "200% 文本检查不得改变模板会话").toEqual(textScaleSession);
  expect(readServerCounters(server), "200% 文本检查不得触发请求").toEqual(textScaleNetwork);
  await removeDeterministicTextScale200(page);
  await page.locator(".template-editor__toolbar").getByRole("button", { name: /桌面端模板布局/ }).click();

  const visibleTreeIds = [
    authoredIdentity.regionIds[0],
    authoredIdentity.groupIds[0],
    authoredIdentity.slotNodeIds[0],
    authoredIdentity.regionIds[1],
    authoredIdentity.groupIds[1],
    ...authoredIdentity.slotNodeIds.slice(1),
  ];
  const treeItem = (targetId: string) => tree.locator(
    `[role="treeitem"][data-selection-target-id="${targetId}"]`,
  );
  const selectionFacts = authoredSession;
  const selectionNetwork = readServerCounters(server);
  const imageSlot = authoredIdentity.slotNodeIds[0];
  const headingSlot = authoredIdentity.slotNodeIds[1];
  const textSlot = authoredIdentity.slotNodeIds[2];
  const buttonSlot = authoredIdentity.slotNodeIds[3];

  await treeItem(imageSlot).click();
  const imageOnly = [{ targetId: imageSlot, primary: true, anchor: true }];
  await expectTreeSelection(tree, imageOnly);
  expectSelectionOnlyChanged(await readSessionSnapshot(page), selectionFacts, imageOnly);

  await treeItem(headingSlot).click({ modifiers: ["Control"] });
  const controlAdded = [
    { targetId: imageSlot },
    { targetId: headingSlot, primary: true, anchor: true },
  ];
  await expectTreeSelection(tree, controlAdded);
  expectSelectionOnlyChanged(await readSessionSnapshot(page), selectionFacts, controlAdded);
  await treeItem(headingSlot).click({ modifiers: ["Control"] });
  await expectTreeSelection(tree, imageOnly);
  expectSelectionOnlyChanged(await readSessionSnapshot(page), selectionFacts, imageOnly);

  await treeItem(headingSlot).click({ modifiers: ["Meta"] });
  await expectTreeSelection(tree, controlAdded);
  await treeItem(headingSlot).click({ modifiers: ["Meta"] });
  await expectTreeSelection(tree, imageOnly);
  expectSelectionOnlyChanged(await readSessionSnapshot(page), selectionFacts, imageOnly);

  await treeItem(visibleTreeIds[0]).click();
  await treeItem(visibleTreeIds[visibleTreeIds.length - 1]).click({ modifiers: ["Shift"] });
  const forwardRange = visibleTreeIds.map((targetId, index) => ({
    targetId,
    ...(index === 0 ? { anchor: true } : {}),
    ...(index === visibleTreeIds.length - 1 ? { primary: true } : {}),
  }));
  await expectTreeSelection(tree, forwardRange);
  expectSelectionOnlyChanged(await readSessionSnapshot(page), selectionFacts, forwardRange);

  await treeItem(visibleTreeIds[visibleTreeIds.length - 1]).click();
  await treeItem(visibleTreeIds[0]).click({ modifiers: ["Shift"] });
  const reverseRange = visibleTreeIds.map((targetId, index) => ({
    targetId,
    ...(index === 0 ? { primary: true } : {}),
    ...(index === visibleTreeIds.length - 1 ? { anchor: true } : {}),
  }));
  await expectTreeSelection(tree, reverseRange);
  expectSelectionOnlyChanged(await readSessionSnapshot(page), selectionFacts, reverseRange);
  expect(readServerCounters(server), "所有选择路径必须保持零网络写与零额外请求")
    .toEqual(selectionNetwork);

  await treeItem(authoredIdentity.groupIds[0]).click();
  await treeItem(authoredIdentity.groupIds[1]).click({ modifiers: ["Control"] });
  const batchSelection = [
    { targetId: authoredIdentity.groupIds[0] },
    { targetId: authoredIdentity.groupIds[1], primary: true, anchor: true },
  ];
  await expectTreeSelection(tree, batchSelection);
  const beforeBatch = await readSessionSnapshot(page);
  expectSelectionOnlyChanged(beforeBatch, selectionFacts, batchSelection);
  const batchNetwork = readServerCounters(server);
  const batchInspector = page.getByRole("complementary", { name: "模板属性", exact: true })
    .getByRole("region", { name: "多选设计属性", exact: true });
  const commonWidth = batchInspector.getByRole("combobox", { name: "宽度方式", exact: true });
  await expect(commonWidth).toBeVisible();
  await commonWidth.selectOption("auto");
  const committedBatch = await readSessionSnapshot(page);
  expect(committedBatch.historyPast).toHaveLength(beforeBatch.historyPast.length + 1);
  expect(committedBatch.historyFuture).toHaveLength(0);
  expect(committedBatch.dirty).toBe(true);
  expect(committedBatch.selectionSnapshot).toEqual(expectedSelectionSnapshot(batchSelection));
  for (const targetId of authoredIdentity.groupIds) {
    expect(committedBatch.definition?.nodes[targetId].responsive.desktop.width).toBe("auto");
  }
  expect(readServerCounters(server), "共同字段原子提交只允许内存 history 写入")
    .toEqual(batchNetwork);

  await page.getByRole("button", { name: "撤销", exact: true }).click();
  const undoneBatch = await readSessionSnapshot(page);
  expect(undoneBatch.definition).toEqual(beforeBatch.definition);
  expect(undoneBatch.historyPast).toEqual(beforeBatch.historyPast);
  expect(undoneBatch.historyFuture).toHaveLength(1);
  expect(undoneBatch.dirty).toBe(beforeBatch.dirty);
  expect(undoneBatch.selectionSnapshot).toEqual(expectedSelectionSnapshot(batchSelection));
  await page.getByRole("button", { name: "重做", exact: true }).click();
  const redoneBatch = await readSessionSnapshot(page);
  expect(redoneBatch.definition).toEqual(committedBatch.definition);
  expect(redoneBatch.historyPast).toEqual(committedBatch.historyPast);
  expect(redoneBatch.historyFuture).toEqual(committedBatch.historyFuture);
  expect(redoneBatch.selectionSnapshot).toEqual(expectedSelectionSnapshot(batchSelection));
  expect(readServerCounters(server), "undo/redo 不得产生任何 API 写入")
    .toEqual(batchNetwork);

  const frozenPreviewState = await readSessionSnapshot(page);
  const statusBeforePreview = await page.locator(".template-editor__toolbar-state").getAttribute("aria-label");
  const undoBeforePreview = await page.getByRole("button", { name: "撤销", exact: true }).isEnabled();
  const previewRuns = [
    { device: "desktop" as const, viewport: { width: 1600, height: 1000 } },
    { device: "mobile" as const, viewport: { width: 390, height: 844 } },
  ];
  for (const run of previewRuns) {
    await page.setViewportSize(run.viewport);
    await page.locator(".template-editor__toolbar").getByRole("button", {
      name: run.device === "desktop" ? /桌面端模板布局/ : /移动端模板布局/,
    }).click();
    expectSessionFactsUnchanged(await readSessionSnapshot(page), frozenPreviewState);
    const requestsBeforeDevicePreview = readServerCounters(server);
    const previewTrigger = page.getByRole("button", { name: "预览模板", exact: true });
    await previewTrigger.focus();
    await page.keyboard.press("Enter");
    const scenario = page.getByLabel("压力预览场景", { exact: true });
    let shortHeight = 0;
    for (const value of ["short-text", "long-text", "optional-missing", "required-missing", "media-ratios"] as const) {
      await scenario.selectOption(value);
      await expect(scenario).toHaveValue(value);
      await expect(page.frameLocator("iframe.template-editor__viewport-frame")
        .locator(".template-editor__dynamic-canvas-renderer"))
        .toHaveAttribute("data-preview-scenario", value);
      const hidesRequired = value === "required-missing";
      const missingNodeIds = value === "optional-missing" || value === "required-missing"
        ? Object.values(redoneBatch.definition!.nodes)
          .filter((node) => node.slotId
            && redoneBatch.definition!.slots[node.slotId]?.required === hidesRequired)
          .map((node) => node.nodeId)
        : [];
      const geometry = await readRendererGeometry(page, redoneBatch.definition!, run.device);
      expectRendererGeometry(geometry, redoneBatch.definition!, run.device, missingNodeIds);
      expectResponsiveRootGeometry(geometry, redoneBatch.definition!, run.device);
      if (value === "short-text") shortHeight = geometry.root.scrollHeight;
      if (value === "long-text") {
        expect(geometry.root.scrollHeight, `${run.device} 长文不得出现失控高度`)
          .toBeLessThanOrEqual(shortHeight * 4 + 800);
      }
      if (value === "optional-missing" || value === "required-missing") {
        expect(geometry.emptySlots, `${run.device}.${value} 不得把“待填写”带入公共构图预览`)
          .toEqual([]);
        for (const nodeId of missingNodeIds) {
          expect(geometry.nodes.some((node) => node.nodeId === nodeId), `${run.device}.${value}.${nodeId} 应按公开页规则收起`)
            .toBe(false);
        }
        const summary = page.locator(`[data-template-stress-preview-summary="${value}"]`);
        await expect(summary).toHaveAttribute("data-template-empty-slot-policy", "public-collapse");
        await expect(summary).toContainText(missingNodeIds.length > 0 ? /已将|正在/ : "不适用");
      }
      if (value === "media-ratios") expect(geometry.imageCount).toBeGreaterThan(0);
      const confirmScenario = page.getByRole("button", {
        name: "确认当前压力预览场景已核对",
        exact: true,
      });
      if (await confirmScenario.count()) await confirmScenario.click();
      expectSessionFactsUnchanged(await readSessionSnapshot(page), frozenPreviewState);
      expect(readServerCounters(server), `${run.device}.${value} 不得请求或写入任何业务对象`)
        .toEqual(requestsBeforeDevicePreview);
      expect(pageErrors, `${run.device}.${value} 不得出现 pageerror`).toEqual([]);
      expect(consoleErrors, `${run.device}.${value} 不得出现非预期 console error`).toEqual([]);
    }
    const exitPreview = page.getByRole("button", { name: "退出预览并继续编辑", exact: true });
    await exitPreview.focus();
    await page.keyboard.press("Enter");
    await expect(previewTrigger, `${run.device} 退出预览后焦点必须回到预览入口`).toBeFocused();
    await expect(page.getByRole("region", { name: "模板制作步骤" })).toHaveCount(0);
    expect((await readSessionSnapshot(page)).definition).toEqual(frozenPreviewState.definition);
  }
  await page.setViewportSize({ width: 1600, height: 1000 });
  await treeItem(buttonSlot).click();
  await expectTreeSelection(tree, [{ targetId: buttonSlot, primary: true, anchor: true }]);
  await page.getByRole("tab", { name: "页面开放范围", exact: true }).click();
  await (await productionStageAction(page, "发布检查")).click();
  const manualReview = page.getByRole("region", { name: "本次发布检查", exact: true });
  await manualReview.getByText("预览与核对（可选）", { exact: true }).click();
  await manualReview.getByRole("button", { name: "发布检查桌面端模板布局", exact: true }).click();
  await manualReview.getByRole("button", { name: "确认已核对桌面端布局", exact: true }).click();
  await manualReview.getByRole("button", { name: "发布检查移动端模板布局", exact: true }).click();
  await manualReview.getByRole("button", { name: "确认已核对移动端布局", exact: true }).click();
  await manualReview.getByRole("button", { name: "确认页面开放范围已核对", exact: true }).click();
  await manualReview.getByRole("button", { name: "返回编辑", exact: true }).click();
  await page.locator(".template-editor__toolbar").getByRole("button", { name: /桌面端模板布局/ }).click();
  expectSessionFactsUnchanged(await readSessionSnapshot(page), frozenPreviewState);
  await expect(page.locator(".template-editor__toolbar-state")).toHaveAttribute("aria-label", statusBeforePreview ?? "");
  expect(await page.getByRole("button", { name: "撤销", exact: true }).isEnabled()).toBe(undoBeforePreview);

  await saveDraft(page);
  expect(server.resource?.draft?.definition.defaultContent).toEqual({});
  expect(server.resource?.draft?.definition.previewContent ?? {}).toEqual({});
  const savedDefinition = server.resource?.draft?.definition;
  if (!savedDefinition) throw new Error("保存后缺少确定性服务端定义");
  expect(savedDefinition).toEqual(frozenPreviewState.definition);
  expect(expectExactStructure(savedDefinition)).toEqual(initialIdentity);
  expect(server.createdTemplateId).toBe(savedDefinition.templateId);
  expect(server.dynamicWrites.map((write) => write.path)).toEqual(["/api/page-modules/dynamic-templates"]);
  const savedSession = await readSessionSnapshot(page);
  expect(savedSession.remote).toMatchObject({
    baseVersion: null,
    draftDefinitionChecksum: CHECKSUM,
    publishedDefinitionChecksum: null,
    publishedVersion: 0,
    revision: 1,
  });

  await page.getByRole("button", { name: "更多模板操作", exact: true }).click();
  await page.getByRole("menuitem", { name: "关闭模板会话" }).click();
  const draftReadsBeforeReload = server.identityRequests.filter((request) => request.kind === "draft-read").length;
  const catalogReadsBeforeReload = server.catalogReads;
  await page.reload();
  await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
  await page.getByRole("button", { name: "模板设计", exact: true }).click();
  await expect.poll(() => server.catalogReads).toBeGreaterThan(catalogReadsBeforeReload);
  await page.getByRole("button", { name: /打开TD-6A 工艺介绍专用模板/ }).click();
  const reopenDraftReads = server.identityRequests
    .filter((request) => request.kind === "draft-read")
    .slice(draftReadsBeforeReload);
  expect.soft(
    reopenDraftReads,
    "TD-6A RED：完整 page.reload 后从目录打开必须精确 GET 服务端草稿，不得只复用 catalog 内存对象",
  ).toEqual([{
    kind: "draft-read",
    method: "GET",
    path: `/api/page-modules/dynamic-templates/${savedDefinition.templateId}/draft`,
    templateId: savedDefinition.templateId,
  }]);
  const reopenedSession = await readSessionSnapshot(page);
  if (!reopenedSession.definition) throw new Error("重新打开模板后缺少定义");
  expect(reopenedSession.definition).toEqual(savedDefinition);
  expect(expectExactStructure(reopenedSession.definition)).toEqual(initialIdentity);
  expect(reopenedSession.remote).toEqual(savedSession.remote);
  expect(reopenedSession.versionNote).toBe("");

  await tree.getByRole("treeitem", { name: /工艺主图/ }).click();
  await expect(tree.locator('[role="treeitem"][aria-selected="true"]')).toHaveCount(1);
  await tree.getByRole("treeitem", { name: /了解工艺/ }).click();
  await expect(tree.locator('[role="treeitem"][aria-selected="true"]')).toHaveCount(1);
  await expect(tree.getByRole("treeitem", { name: /了解工艺/ })).toHaveAttribute("aria-selected", "true");
  await expectPageFieldSummary(page, reopenedSession.pageFields);
  await tree.getByRole("treeitem", { name: /工艺主图/ }).click();
  await page.getByRole("tab", { name: "设计", exact: true }).click();
  await expect(page.getByRole("tab", { name: "设计", exact: true })).toHaveAttribute("aria-selected", "true");
  const reopenedImageSelection = [{ targetId: imageSlot, primary: true, anchor: true }];
  expectSelectionOnlyChanged(await readSessionSnapshot(page), reopenedSession, reopenedImageSelection);

  const writesBeforeReview = server.dynamicWrites.length;
  const pendingPublishReviewTrigger = page.getByRole("button", { name: /^发布模板新版本/ });
  await pendingPublishReviewTrigger.focus();
  await page.keyboard.press("Enter");
  const blockedReview = page.getByRole("region", { name: "本次发布检查" });
  await expect(blockedReview).toContainText("确认已核对桌面端布局");
  await expect(blockedReview.getByRole("button", { name: "保存并发布模板", exact: true })).toBeEnabled();
  expect(server.dynamicWrites).toHaveLength(writesBeforeReview);
  await blockedReview.getByRole("button", { name: "返回编辑", exact: true }).click();

  await completeProductionReviews(page);
  const publishReviewTrigger = page.getByRole("button", { name: "发布模板新版本", exact: true });
  await publishReviewTrigger.click();
  const review = page.getByRole("region", { name: "本次发布检查" });
  await expect(review).toBeVisible();
  await expect(review, "发布检查打开后焦点必须进入当前检查区域").toBeFocused();
  await expect(review).toContainText("已有草稿，本次修改将在发布时保存");
  await expect(review).toContainText("目标版本v1");
  await expect(review).toContainText("版本说明未填写");
  expect(server.dynamicWrites).toHaveLength(writesBeforeReview);
  expect(server.pageWrites).toEqual([]);
  expect(server.dangerousWrites).toEqual([]);
  const confirmPublish = page.getByRole("button", { name: "保存并发布模板", exact: true });
  await confirmPublish.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "去页面装修使用" })).toBeVisible();
  expect(server.pageWrites).toEqual([]);
  expect(server.dangerousWrites).toEqual([]);
  expect(server.published).toMatchObject({ templateId: savedDefinition.templateId, version: 1, definitionChecksum: CHECKSUM, versionNote: null });
  expect(server.resource).toMatchObject({
    publishedVersion: 1,
    templateId: savedDefinition.templateId,
    draft: {
      baseVersion: 1,
      definition: savedDefinition,
      definitionChecksum: CHECKSUM,
      revision: 3,
      versionNote: null,
    },
  });
  const publishedSession = await readSessionSnapshot(page);
  expect(publishedSession.definition).toEqual(savedDefinition);
  expect(publishedSession.remote).toEqual({
    baseVersion: 1,
    canDelete: true,
    databaseId: 7001,
    deleteBlockers: [],
    draftDefinitionChecksum: CHECKSUM,
    publishedDefinitionChecksum: CHECKSUM,
    publishedVersion: 1,
    revision: 3,
    sourceType: "CUSTOM",
    status: "ACTIVE",
  });
  expect(publishedSession.versionNote).toBe("");
  expect(server.identityRequests.filter((request) => request.kind === "publish")).toEqual([{
    kind: "publish",
    method: "POST",
    path: `/api/page-modules/dynamic-templates/${savedDefinition.templateId}/publish`,
    templateId: savedDefinition.templateId,
  }]);
  expect(server.dynamicWrites.slice(writesBeforeReview).map((write) => ({ method: write.method, path: write.path }))).toEqual([
    { method: "PATCH", path: `/api/page-modules/dynamic-templates/${savedDefinition.templateId}/draft` },
    { method: "POST", path: `/api/page-modules/dynamic-templates/${savedDefinition.templateId}/publish` },
  ]);
  const reviewedSaveWrite = server.dynamicWrites[server.dynamicWrites.length - 2];
  expect(reviewedSaveWrite).toMatchObject({
    body: {
      definition: savedDefinition,
      expectedRevision: 1,
    },
    method: "PATCH",
    path: `/api/page-modules/dynamic-templates/${savedDefinition.templateId}/draft`,
  });
  expect((reviewedSaveWrite?.body as { versionNote?: string | null }).versionNote ?? null).toBeNull();
  const publishWrite = server.dynamicWrites[server.dynamicWrites.length - 1];
  expect(publishWrite).toEqual({
    body: {
      expectedChecksum: CHECKSUM,
      expectedRevision: 2,
      targetVersion: 1,
    },
    method: "POST",
    path: `/api/page-modules/dynamic-templates/${savedDefinition.templateId}/publish`,
  });
  const catalogCard = page.locator(`[data-template-catalog-card="shared"][data-template-identity="template:${savedDefinition.templateId}"][data-template-name="${savedDefinition.templateId}"]`);
  await expect(catalogCard).toHaveAttribute("data-template-name", savedDefinition.templateId);
  await expect(catalogCard).toContainText("TD-6A 工艺介绍专用模板");
  await expect(catalogCard).toContainText("当前草稿 · 已保存");
  await expect(catalogCard).toContainText("线上 v1");
  await expect(page.getByRole("button", {
    name: "正在编辑TD-6A 工艺介绍专用模板，当前草稿，已保存",
  })).toContainText("线上 v1");
  expect(server.catalogEntries[server.catalogEntries.length - 1]).toEqual([
    { kind: "editable", templateId: savedDefinition.templateId, version: 1 },
    { kind: "published", templateId: savedDefinition.templateId, version: 1 },
  ]);

  const requestCountBeforeVersionHistory = server.requestEvents.length;
  await page.getByRole("button", { name: "更多模板操作", exact: true }).click();
  await page.getByRole("menuitem", { name: "版本历史" }).click();
  const history = page.getByRole("dialog", { name: "模板版本历史" });
  const versionDetail = history.getByRole("region", { name: "正式版本 1 预览" });
  await expect(versionDetail.getByText("v1", { exact: true })).toBeVisible();
  await expect(versionDetail.getByText(CHECKSUM.slice(0, 16), { exact: true })).toBeVisible();
  expect(server.identityRequests.filter((request) => request.kind === "version-list")).toEqual([{
    kind: "version-list",
    method: "GET",
    path: `/api/page-modules/dynamic-templates/${savedDefinition.templateId}/versions`,
    templateId: savedDefinition.templateId,
  }]);
  const createEventIndex = server.requestEvents.findIndex((event) => event.kind === "create");
  expect(createEventIndex).toBeGreaterThanOrEqual(0);
  const beforeVersionIdentityChain = server.requestEvents
    .slice(createEventIndex, requestCountBeforeVersionHistory)
    .filter((event) => event.kind !== "catalog");
  expect.soft(
    beforeVersionIdentityChain,
    "完整重载后 create→draft GET→save→publish 必须保持唯一、完整、有序的身份链",
  ).toEqual([{
    kind: "create",
    method: "POST",
    path: "/api/page-modules/dynamic-templates",
    templateId: savedDefinition.templateId,
  }, {
    kind: "draft-read",
    method: "GET",
    path: `/api/page-modules/dynamic-templates/${savedDefinition.templateId}/draft`,
    templateId: savedDefinition.templateId,
  }, {
    expectedRevision: 1,
    kind: "draft-save",
    method: "PATCH",
    nextRevision: 2,
    path: `/api/page-modules/dynamic-templates/${savedDefinition.templateId}/draft`,
    templateId: savedDefinition.templateId,
  }, {
    expectedRevision: 2,
    kind: "publish",
    method: "POST",
    path: `/api/page-modules/dynamic-templates/${savedDefinition.templateId}/publish`,
    targetVersion: 1,
    templateId: savedDefinition.templateId,
  }]);
  expect(server.requestEvents.slice(createEventIndex, requestCountBeforeVersionHistory)
    .filter((event) => event.kind === "catalog").at(-1)).toEqual({
    kind: "catalog",
    method: "GET",
    path: "/api/page-modules/dynamic-templates/catalog",
    templateId: savedDefinition.templateId,
    version: 1,
  });
  expect(server.requestEvents.slice(requestCountBeforeVersionHistory)).toEqual([{
      kind: "version-list",
      method: "GET",
      path: `/api/page-modules/dynamic-templates/${savedDefinition.templateId}/versions`,
      templateId: savedDefinition.templateId,
      version: 1,
    }, {
      kind: "published-version",
      method: "GET",
      path: `/api/page-modules/dynamic-templates/published/${savedDefinition.templateId}/versions/1`,
      templateId: savedDefinition.templateId,
      version: 1,
    }]);
  expect(server.identityRequests.filter((item) => item.kind === "published-version")).toEqual([{
    kind: "published-version",
    method: "GET",
    path: `/api/page-modules/dynamic-templates/published/${savedDefinition.templateId}/versions/1`,
    templateId: savedDefinition.templateId,
    version: 1,
  }]);

  const immutableV1 = structuredClone(server.publishedVersions.find((version) => version.version === 1));
  if (!immutableV1) throw new Error("继续设计前缺少不可变 v1");
  await history.getByRole("button", { name: /关\s*闭/ }).click();
  await expect(history).toBeHidden();
  await page.getByRole("button", { name: "继续设计", exact: true }).click();
  await page.getByRole("button", { name: "更多模板操作", exact: true }).click();
  await page.getByRole("menuitem", { name: "关闭模板会话" }).click();
  const sameCatalogEntry = page.locator(
    `[data-template-catalog-card="shared"][data-template-identity="template:${savedDefinition.templateId}"]`
    + `[data-template-name="${savedDefinition.templateId}"]`,
  );
  await expect(sameCatalogEntry).toHaveCount(1);
  await expect(sameCatalogEntry).toContainText("草稿已保存");
  await expect(sameCatalogEntry).toContainText("线上 v1");
  await sameCatalogEntry.getByRole("button", { name: /打开TD-6A 工艺介绍专用模板/ }).click();
  const continuedV1 = await readSessionSnapshot(page);
  expect(continuedV1.definition).toEqual(savedDefinition);
  expect(continuedV1.remote).toMatchObject({
    baseVersion: 1,
    draftDefinitionChecksum: CHECKSUM,
    publishedDefinitionChecksum: CHECKSUM,
    publishedVersion: 1,
    revision: 3,
  });

  const v2Name = "TD-6A 工艺介绍专用模板 v2";
  await page.getByRole("textbox", { name: "模板名称", exact: true }).fill(v2Name);
  await page.getByRole("textbox", { name: "模板名称", exact: true }).press("Tab");
  const editedV2 = await readSessionSnapshot(page);
  if (!editedV2.definition) throw new Error("v2 修改后缺少模板定义");
  expect(editedV2.definition.templateId).toBe(savedDefinition.templateId);
  expect(editedV2.definition.name).toBe(v2Name);
  expect(editedV2.dirty).toBe(true);
  const writesBeforeV2Save = server.dynamicWrites.length;
  await saveDraft(page);
  expect(server.dynamicWrites.slice(writesBeforeV2Save)).toHaveLength(1);
  expect(server.dynamicWrites[writesBeforeV2Save]).toMatchObject({
    body: {
      definition: editedV2.definition,
      expectedRevision: 3,
    },
    method: "PATCH",
    path: `/api/page-modules/dynamic-templates/${savedDefinition.templateId}/draft`,
  });
  const savedV2 = await readSessionSnapshot(page);
  expect(savedV2.definition).toEqual(editedV2.definition);
  expect(savedV2.remote).toMatchObject({
    baseVersion: 1,
    draftDefinitionChecksum: DIFFERENT_CHECKSUM,
    publishedDefinitionChecksum: CHECKSUM,
    publishedVersion: 1,
    revision: 4,
  });
  await expect(sameCatalogEntry, "同一模板的 v2 草稿保存后必须明确显示未发布修改")
    .toContainText("当前草稿 · 已保存");
  await expect(sameCatalogEntry).toContainText("线上 v1");
  expect(server.publishedVersions.find((version) => version.version === 1))
    .toEqual(immutableV1);

  await completeProductionReviews(page);
  const writesBeforeV2Review = server.dynamicWrites.length;
  await page.getByRole("button", { name: "发布模板新版本", exact: true }).click();
  const v2Review = page.getByRole("region", { name: "本次发布检查" });
  await expect(v2Review).toContainText("已有草稿，本次修改将在发布时保存");
  await expect(v2Review).toContainText("目标版本v2");
  expect(server.dynamicWrites).toHaveLength(writesBeforeV2Review);
  expect(server.pageWrites).toEqual([]);
  await v2Review.getByRole("button", { name: /发布模板新版本|保存并发布模板/ }).click();
  await expect(v2Review).toContainText("模板 v2 已发布；目录已确认可用");
  const v2Writes = server.dynamicWrites.slice(writesBeforeV2Review);
  expect(v2Writes.map((write) => ({ method: write.method, path: write.path }))).toEqual([
    { method: "PATCH", path: `/api/page-modules/dynamic-templates/${savedDefinition.templateId}/draft` },
    { method: "POST", path: `/api/page-modules/dynamic-templates/${savedDefinition.templateId}/publish` },
  ]);
  expect(v2Writes[0]).toMatchObject({
    body: {
      definition: editedV2.definition,
      expectedRevision: 4,
    },
  });
  expect(v2Writes[1]).toEqual({
    body: {
      expectedChecksum: DIFFERENT_CHECKSUM,
      expectedRevision: 5,
      targetVersion: 2,
    },
    method: "POST",
    path: `/api/page-modules/dynamic-templates/${savedDefinition.templateId}/publish`,
  });
  expect(server.publishedVersions.map((version) => version.version)).toEqual([2, 1]);
  expect(server.publishedVersions.find((version) => version.version === 1))
    .toEqual(immutableV1);
  expect(server.publishedVersions.find((version) => version.version === 2)).toMatchObject({
    templateId: savedDefinition.templateId,
    version: 2,
    definition: editedV2.definition,
    definitionChecksum: DIFFERENT_CHECKSUM,
  });
  expect(server.resource).toMatchObject({
    templateId: savedDefinition.templateId,
    publishedVersion: 2,
    draft: {
      baseVersion: 2,
      revision: 6,
      definition: editedV2.definition,
      definitionChecksum: DIFFERENT_CHECKSUM,
    },
  });
  await expect(sameCatalogEntry).toHaveCount(1);
  await expect(sameCatalogEntry).toContainText(v2Name);
  await expect(sameCatalogEntry).toContainText("当前草稿 · 已保存");
  await expect(sameCatalogEntry).toContainText("线上 v2");
  expect(server.catalogEntries[server.catalogEntries.length - 1]).toEqual([
    { kind: "editable", templateId: savedDefinition.templateId, version: 2 },
    { kind: "published", templateId: savedDefinition.templateId, version: 2 },
  ]);
  expect(server.pageWrites, "模板 v1→v2 全链路不得产生 PageDocument 写入").toEqual([]);
  expect(server.dangerousWrites).toEqual([]);

  await page.getByRole("button", { name: "更多模板操作", exact: true }).click();
  await page.getByRole("menuitem", { name: "版本历史" }).click();
  const v2History = page.getByRole("dialog", { name: "模板版本历史" });
  await expect(v2History.getByRole("button", { name: /^v2 / })).toBeVisible();
  await expect(v2History.getByRole("button", { name: /^v1 / })).toBeVisible();
  await expect(v2History.getByRole("region", { name: "正式版本 2 预览" }))
    .toContainText(DIFFERENT_CHECKSUM.slice(0, 16));
  await v2History.getByRole("button", { name: /^v1 / }).click();
  await expect(v2History.getByRole("region", { name: "正式版本 1 预览" }))
    .toContainText(CHECKSUM.slice(0, 16));
  expect(server.publishedVersions.find((version) => version.version === 1))
    .toEqual(immutableV1);
  expect(server.unexpectedRequests).toEqual([]);
});

test("TD-6B 完整模板的取消、非法落点、结构锁定和发布阻断全部保持零网络写", async ({ page }) => {
  const server = await installTemplateServer(page);
  await openBlankTemplate(page);
  await page.getByRole("textbox", { name: "模板名称", exact: true }).fill("TD-6B 发布前边界专用模板");
  await page.getByRole("textbox", { name: "模板名称", exact: true }).press("Tab");
  await addTwoRegionsAndGroups(page);
  const structure = page.getByRole("complementary", { name: "模板结构", exact: true });
  const tree = page.getByRole("tree", { name: "模板区域与槽位" });

  const beforeCancel = await readSessionSnapshot(page);
  const cancelNetwork = readServerCounters(server);
  await structure.getByRole("button", { name: "添加区域", exact: true }).click();
  const regionDialog = page.getByRole("dialog", { name: "添加区域", exact: true });
  await expect(regionDialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(regionDialog).toBeHidden();
  expect(await readSessionSnapshot(page), "取消添加区域必须保持完整模板事实不变").toEqual(beforeCancel);
  expect(readServerCounters(server), "取消添加区域不得产生请求").toEqual(cancelNetwork);

  const rootTarget = page.getByRole("button", { name: "选择模板目标 模板根节点", exact: true });
  await rootTarget.focus();
  await page.keyboard.press("Enter");
  const beforeInvalid = await readSessionSnapshot(page);
  const invalidNetwork = readServerCounters(server);
  await structure.getByRole("button", { name: "添加槽位", exact: true }).click();
  const invalidPanel = page.getByRole("dialog", { name: "添加槽位", exact: true });
  await expect(invalidPanel.getByLabel("添加目标")).toHaveValue("");
  await expect(invalidPanel.getByRole("button", { name: "添加图片槽位", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(invalidPanel).toBeHidden();
  expect(await readSessionSnapshot(page), "非法根级槽位落点必须零 definition/history 变化").toEqual(beforeInvalid);
  expect(readServerCounters(server), "非法根级槽位落点不得产生请求").toEqual(invalidNetwork);

  await tree.getByRole("treeitem", { name: /内容区域 1/ }).click();
  await setSwitch(page, "锁定位置、尺寸和层级", true);
  const locked = await readSessionSnapshot(page);
  const lockedNetwork = readServerCounters(server);
  await structure.getByRole("button", { name: "添加槽位", exact: true }).click();
  const lockedPanel = page.getByRole("dialog", { name: "添加槽位", exact: true });
  const lockedOptions = lockedPanel.getByLabel("添加目标").getByRole("option");
  await expect(lockedOptions.filter({ hasText: /^内容区域 1（.*已锁定.*）$/ })).toHaveAttribute("disabled", "");
  await expect(lockedOptions.filter({ hasText: /^内容区域 1 \/ 图片组（.*已锁定.*）$/ }))
    .toHaveAttribute("disabled", "");
  await expect(lockedPanel.getByRole("button", { name: "添加图片槽位", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(lockedPanel).toBeHidden();
  expect(await readSessionSnapshot(page), "锁定目标必须拒绝结构写入并保持当前模板").toEqual(locked);
  expect(readServerCounters(server), "锁定目标拒绝路径不得产生请求").toEqual(lockedNetwork);

  // 结束锁定场景后显式解锁，才能继续编辑其子槽位的页面要求。
  await setSwitch(page, "锁定位置、尺寸和层级", false);
  await tree.getByRole("treeitem", { name: /标题槽位/ }).click();
  await page.getByRole("tab", { name: "页面开放范围", exact: true }).click();
  await expect(page.getByRole("switch", { name: "页面必须填写", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "设为必填、允许填写并关闭隐藏", exact: true }).click();
  await expect(page.getByRole("switch", { name: "页面可填写内容", exact: true })).toBeDisabled();
  await expect(page.getByRole("switch", { name: "页面可隐藏", exact: true })).toBeDisabled();
  // 开关保护已验证；装入草稿允许、发布不允许的必填节点隐藏状态，验证发布零写保护。
  await page.evaluate(async () => {
    const sessionPath = "/src/page-builder/template-editor/templateEditorSession.ts";
    const { useTemplateEditorSession } = await import(/* @vite-ignore */ sessionPath);
    const state = useTemplateEditorSession.getState();
    const definition = structuredClone(state.draft.definition);
    const node = Object.values(definition.nodes).find((item) => (item as { name: string }).name === "标题槽位") as { hidden: boolean };
    node.hidden = true;
    state.setDynamicDefinition(definition);
  });
  const blocked = await readSessionSnapshot(page);
  const blockedNetwork = readServerCounters(server);
  const publishTrigger = page.getByRole("button", { name: /发布模板新版本/ });
  await publishTrigger.focus();
  await page.keyboard.press("Enter");
  const review = page.getByRole("region", { name: "本次发布检查", exact: true });
  await expect(review).toBeVisible();
  await expect(review).toContainText("请完成下面的必要修改，再重新检查并发布。");
  await expect(review).toContainText(/必填槽位.*已隐藏/);
  expect(readServerCounters(server), "发布阻断只允许打开检查，不得保存或发布").toEqual(blockedNetwork);
  expect(await readSessionSnapshot(page), "发布阻断不得改写当前完整模板").toEqual(blocked);
  const returnEditing = review.getByRole("button", { name: "返回编辑", exact: true });
  await returnEditing.focus();
  await page.keyboard.press("Enter");
  await expect(review).toBeHidden();
  await expect(publishTrigger, "退出阻断检查后焦点必须返回发布入口").toBeFocused();
  expect(server.dynamicWrites).toEqual([]);
  expect(server.pageWrites).toEqual([]);
  expect(server.dangerousWrites).toEqual([]);
});

test("TD-6B 完整模板保存 500、迟到成功和 409 均保留当前输入与唯一身份", async ({ page }) => {
  test.setTimeout(90_000);
  const server = await installTemplateServer(page);
  await openBlankTemplate(page);
  await page.getByRole("textbox", { name: "模板名称", exact: true }).fill("TD-6B 保存边界专用模板");
  await page.getByRole("textbox", { name: "模板名称", exact: true }).press("Tab");
  await (await productionStageAction(page, "交付信息")).click();
  await page.getByLabel("用途", { exact: true }).fill("验证完整模板保存失败与重试边界");
  await page.getByLabel("用途", { exact: true }).press("Tab");
  await addTwoRegionsAndGroups(page);
  await saveDraft(page);
  const templateId = server.resource?.templateId;
  if (!templateId) throw new Error("保存边界缺少首次持久化模板身份");

  await page.getByRole("button", { name: "更多模板操作", exact: true }).click();
  await page.getByRole("menuitem", { name: /模板资料与使用限制/ }).click();
  const metadataName = page.getByRole("complementary", { name: "模板属性", exact: true })
    .getByRole("textbox", { name: "模板名称", exact: true });
  await metadataName.fill("TD-6B 等待重试的完整模板");
  await metadataName.press("Tab");
  const before500 = await readSessionSnapshot(page);
  server.saveFailures.push(500);
  await page.getByRole("button", { name: "保存模板", exact: true }).click();
  await expect.poll(async () => (await readSessionSnapshot(page)).saveStatus).toBe("error");
  const after500 = await readSessionSnapshot(page);
  expect(after500.definition).toEqual(before500.definition);
  expect(after500.historyPast).toEqual(before500.historyPast);
  expect(after500.dirty).toBe(true);
  expect(server.resource?.name).toBe("TD-6B 保存边界专用模板");

  server.holdNextSave = true;
  const writesBeforeLateSave = server.dynamicWrites.length;
  await page.getByRole("button", { name: "重试保存模板草稿", exact: true }).click();
  await expect.poll(() => server.releaseHeldSave).not.toBeNull();
  expect(server.dynamicWrites).toHaveLength(writesBeforeLateSave + 1);
  const requestedLateSave = server.dynamicWrites.at(-1);
  expect(requestedLateSave).toMatchObject({
    method: "PATCH",
    path: `/api/page-modules/dynamic-templates/${templateId}/draft`,
    body: {
      definition: before500.definition,
      expectedRevision: 1,
    },
  });

  await metadataName.fill("TD-6B 迟到保存后的新输入");
  await metadataName.press("Tab");
  const editedDuringSave = await readSessionSnapshot(page);
  expect(editedDuringSave.definition?.templateId).toBe(templateId);
  expect(editedDuringSave.definition?.name).toBe("TD-6B 迟到保存后的新输入");
  expect(editedDuringSave.dirty).toBe(true);
  const releaseLateSave = server.releaseHeldSave;
  if (!releaseLateSave) throw new Error("迟到保存请求未进入挂起状态");
  releaseLateSave();
  await expect.poll(() => server.resource?.draft?.revision).toBe(2);
  await expect.poll(async () => (await readSessionSnapshot(page)).remote?.revision).toBe(2);
  const afterLateSave = await readSessionSnapshot(page);
  expect(server.resource?.name).toBe("TD-6B 等待重试的完整模板");
  expect(afterLateSave.definition?.templateId).toBe(templateId);
  expect(afterLateSave.definition?.name).toBe("TD-6B 迟到保存后的新输入");
  expect(afterLateSave.dirty).toBe(true);
  expect(afterLateSave.historyPast).toEqual(editedDuringSave.historyPast);

  const before409 = await readSessionSnapshot(page);
  server.saveFailures.push(409);
  await page.getByRole("button", { name: "保存模板", exact: true }).click();
  await expect.poll(async () => (await readSessionSnapshot(page)).saveStatus).toBe("conflict");
  const after409 = await readSessionSnapshot(page);
  expect(after409.definition).toEqual(before409.definition);
  expect(after409.historyPast).toEqual(before409.historyPast);
  expect(after409.dirty).toBe(true);
  await expect(page.getByRole("status", {
    name: "模板状态：保存冲突，修改仍在，请重新打开同一模板处理冲突",
    exact: true,
  })).toContainText("保存冲突，输入仍保留");
  await expect(page.getByRole("button", { name: "另存当前冲突修改为新模板", exact: true })).toHaveCount(0);
  expect(server.dynamicWrites.map((write) => ({ method: write.method, path: write.path }))).toEqual([
    { method: "POST", path: "/api/page-modules/dynamic-templates" },
    { method: "PATCH", path: `/api/page-modules/dynamic-templates/${templateId}/draft` },
    { method: "PATCH", path: `/api/page-modules/dynamic-templates/${templateId}/draft` },
    { method: "PATCH", path: `/api/page-modules/dynamic-templates/${templateId}/draft` },
  ]);
  expect(server.createdTemplateId).toBe(templateId);
  expect(server.pageWrites).toEqual([]);
  expect(server.dangerousWrites).toEqual([]);
  expect(server.unexpectedRequests).toEqual([]);
});

test("TD-6B 迟到发布响应不确定时只核对一次，目录失败只重试读取", async ({ page }) => {
  test.setTimeout(90_000);
  const server = await installTemplateServer(page);
  await openBlankTemplate(page);
  await page.getByRole("textbox", { name: "模板名称", exact: true }).fill("TD-6B 发布核对专用模板");
  await page.getByRole("textbox", { name: "模板名称", exact: true }).press("Tab");
  await (await productionStageAction(page, "交付信息")).click();
  await page.getByLabel("用途", { exact: true }).fill("验证发布响应不确定时的核对与目录重试");
  await page.getByLabel("用途", { exact: true }).press("Tab");
  await addTwoRegionsAndGroups(page);
  await saveDraft(page);
  const templateId = server.resource?.templateId;
  if (!templateId) throw new Error("发布核对边界缺少持久化模板身份");

  await completeProductionReviews(page);
  await page.getByRole("button", { name: "发布模板新版本", exact: true }).click();
  const review = page.getByRole("region", { name: "本次发布检查", exact: true });
  await expect(review).toBeVisible();
  server.holdNextPublish = true;
  server.holdNextPublishedVersion = true;
  server.publishTransport = "uncertain-success";
  const confirm = review.getByRole("button", { name: "保存并发布模板", exact: true });
  await confirm.focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => server.releaseHeldPublish).not.toBeNull();
  await expect(review).toContainText("草稿已保存，正在严格发布 v1。");
  await expect(confirm, "发布请求挂起时确认入口必须从当前检查中移除").toHaveCount(0);
  await page.keyboard.press("Enter");
  expect(server.dynamicWrites.filter((write) => write.path.endsWith("/publish"))).toHaveLength(1);

  server.catalogFailures.push(500);
  const releasePublish = server.releaseHeldPublish;
  if (!releasePublish) throw new Error("迟到发布请求未进入挂起状态");
  releasePublish();
  await expect.poll(() => server.releaseHeldPublishedVersion).not.toBeNull();
  await expect(review).toContainText("响应不确定，正在核对正式版本 v1");
  expect(server.identityRequests.filter((request) => request.kind === "published-version")).toEqual([{
    kind: "published-version",
    method: "GET",
    path: `/api/page-modules/dynamic-templates/published/${templateId}/versions/1`,
    templateId,
    version: 1,
  }]);
  expect(server.dynamicWrites.filter((write) => write.path.endsWith("/publish"))).toHaveLength(1);

  const releaseVerification = server.releaseHeldPublishedVersion;
  if (!releaseVerification) throw new Error("发布结果核对请求未进入挂起状态");
  releaseVerification();
  await expect(review).toContainText("模板已发布，目录尚未同步。只能重试目录读取，不会重复发布。");
  const retryCatalog = review.getByRole("button", { name: "重试目录读取", exact: true });
  await expect(retryCatalog).toBeVisible();
  const publishWritesBeforeRetry = server.dynamicWrites.filter((write) => write.path.endsWith("/publish")).length;
  const catalogReadsBeforeRetry = server.catalogReads;
  await retryCatalog.focus();
  await page.keyboard.press("Enter");
  await expect(review).toContainText("模板 v1 已发布；目录已确认可用");
  await expect(review.getByRole("button", { name: "去页面装修使用", exact: true })).toBeVisible();
  expect(server.catalogReads).toBe(catalogReadsBeforeRetry + 1);
  expect(server.dynamicWrites.filter((write) => write.path.endsWith("/publish"))).toHaveLength(publishWritesBeforeRetry);
  expect(server.published).toMatchObject({ templateId, version: 1, definitionChecksum: CHECKSUM });
  expect(server.resource).toMatchObject({ templateId, publishedVersion: 1 });
  expect(server.pageWrites).toEqual([]);
  expect(server.dangerousWrites).toEqual([]);
  expect(server.unexpectedRequests).toEqual([]);
});

test("TD-6A 真实路由守卫拒绝错误模板或版本且服务端状态零变化", async ({ page }) => {
  const server = await installTemplateServer(page);
  await openBlankTemplate(page);
  const session = await readSessionSnapshot(page);
  if (!session.definition) throw new Error("身份负例缺少测试模板定义");
  server.createdTemplateId = session.definition.templateId;
  server.resource = makeResource(session.definition, 1, 1, null);
  server.published = publishedFrom(server.resource, session.definition, null);
  server.publishedVersions = [server.published];
  const templateId = session.definition.templateId;
  const wrongTemplateId = `wrong-${templateId}`;
  const before = structuredClone({
    dangerousWrites: server.dangerousWrites,
    dynamicWrites: server.dynamicWrites,
    identityRequests: server.identityRequests,
    pageWrites: server.pageWrites,
    published: server.published,
    publishedVersions: server.publishedVersions,
    requestEvents: server.requestEvents,
    resource: server.resource,
  });

  const statuses = await page.evaluate(async ({ expectedTemplateId, unexpectedTemplateId }) => {
    const responses = [];
    responses.push((await fetch(`/api/page-modules/dynamic-templates/${encodeURIComponent(unexpectedTemplateId)}/draft`)).status);
    responses.push((await fetch(`/api/page-modules/dynamic-templates/${encodeURIComponent(unexpectedTemplateId)}/publish`, {
        body: JSON.stringify({ expectedChecksum: "irrelevant", expectedRevision: 1, targetVersion: 1 }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })).status);
    responses.push((await fetch(`/api/page-modules/dynamic-templates/${encodeURIComponent(unexpectedTemplateId)}/versions`)).status);
    responses.push((await fetch(`/api/page-modules/dynamic-templates/published/${encodeURIComponent(expectedTemplateId)}/versions/99`)).status);
    return responses;
  }, { expectedTemplateId: templateId, unexpectedTemplateId: wrongTemplateId });

  expect(statuses).toEqual([409, 409, 409, 409]);
  expect(server.unexpectedRequests).toEqual([
    { method: "GET", path: `/api/page-modules/dynamic-templates/${wrongTemplateId}/draft`, reason: "草稿读取模板身份不匹配" },
    { method: "POST", path: `/api/page-modules/dynamic-templates/${wrongTemplateId}/publish`, reason: "发布模板身份不匹配" },
    { method: "GET", path: `/api/page-modules/dynamic-templates/${wrongTemplateId}/versions`, reason: "版本列表模板身份不匹配" },
    { method: "GET", path: `/api/page-modules/dynamic-templates/published/${templateId}/versions/99`, reason: "正式版本模板身份或版本不匹配" },
  ]);
  expect({
    dangerousWrites: server.dangerousWrites,
    dynamicWrites: server.dynamicWrites,
    identityRequests: server.identityRequests,
    pageWrites: server.pageWrites,
    published: server.published,
    publishedVersions: server.publishedVersions,
    requestEvents: server.requestEvents,
    resource: server.resource,
  }).toEqual(before);
});

test("TD-6A 保存成功但发布 403 时明确保留完整草稿且未发布", async ({ page }) => {
  const server = await installTemplateServer(page, { failPublish: true });
  await openBlankTemplate(page);
  await page.getByRole("textbox", { name: "模板名称", exact: true }).fill("TD-6A 发布失败恢复模板");
  await page.getByRole("textbox", { name: "模板名称", exact: true }).press("Tab");
  await (await productionStageAction(page, "交付信息")).click();
  await page.getByLabel("用途", { exact: true }).fill("验证发布失败后完整草稿恢复");
  await page.getByLabel("用途", { exact: true }).press("Tab");
  await addTwoRegionsAndGroups(page);
  await completeProductionReviews(page);
  const beforePublish = await readSessionSnapshot(page);
  if (!beforePublish.definition) throw new Error("发布失败用例缺少完整内存定义");
  const expectedIdentity = expectExactStructure(beforePublish.definition);

  const writesBeforeReview = server.dynamicWrites.length;
  await page.getByRole("button", { name: /发布模板新版本/ }).click();
  const review = page.getByRole("region", { name: "本次发布检查" });
  await expect(review).toBeVisible();
  expect(server.dynamicWrites).toHaveLength(writesBeforeReview);
  const writesBeforeConfirm = server.dynamicWrites.length;
  await page.getByRole("button", { name: "保存并发布模板" }).click();
  await expect(page.getByRole("button", { name: "重试发布" })).toBeVisible();
  await expect(review).toContainText("草稿已保存，模板未发布。当前输入与正式版本事实均未被覆盖。");
  await expect(review).not.toContainText(/响应不确定|正在核对|模板 v1 已发布/);
  await expect(page.getByRole("button", { name: "发布未完成，点击查看详情" })).toContainText("服务端草稿已保存");

  const templateId = server.resource?.templateId;
  if (!templateId) throw new Error("403 前的草稿保存没有返回模板身份");
  expect(server.createdTemplateId).toBe(templateId);
  expect(server.dynamicWrites.slice(writesBeforeConfirm).map((write) => ({ method: write.method, path: write.path }))).toEqual([
    { method: "POST", path: "/api/page-modules/dynamic-templates" },
    { method: "POST", path: `/api/page-modules/dynamic-templates/${templateId}/publish` },
  ]);
  expect(server.dynamicWrites).toHaveLength(2);
  expect(server.identityRequests.filter((request) => request.kind === "publish")).toEqual([{
    kind: "publish",
    method: "POST",
    path: `/api/page-modules/dynamic-templates/${templateId}/publish`,
    templateId,
  }]);
  expect(server.resource?.draft?.revision).toBe(1);
  expect(server.resource?.draft?.definitionChecksum).toBe(CHECKSUM);
  expect(server.resource?.draft?.definition).toEqual(beforePublish.definition);
  expect(server.resource?.publishedVersion).toBe(0);
  expect(server.published).toBeNull();
  expect(server.publishedVersions).toEqual([]);
  expect(server.pageWrites).toEqual([]);
  expect(server.dangerousWrites).toEqual([]);
  expect(server.unexpectedRequests).toEqual([]);

  await page.getByRole("button", { name: "返回编辑" }).click();
  const recovered = await readSessionSnapshot(page);
  if (!recovered.definition) throw new Error("发布失败返回编辑后缺少模板定义");
  expect(recovered.definition).toEqual(beforePublish.definition);
  expect(expectExactStructure(recovered.definition)).toEqual(expectedIdentity);
  expect(recovered.remote).toMatchObject({
    baseVersion: null,
    draftDefinitionChecksum: CHECKSUM,
    publishedDefinitionChecksum: null,
    publishedVersion: 0,
    revision: 1,
  });
  expect(recovered.saveStatus).toBe("success");
  const tree = page.getByRole("tree", { name: "模板区域与槽位" });
  for (const name of ["内容区域 1", "内容区域 2", "图片组", "图片槽位", "文字组", "标题槽位", "正文槽位", "按钮槽位"]) {
    await expect(tree.getByRole("treeitem", { name: new RegExp(name) })).toBeVisible();
  }
  await tree.getByRole("treeitem", { name: /图片槽位/ }).click();
  await tree.getByRole("treeitem", { name: /按钮槽位/ }).click();
  await expect(tree.locator('[role="treeitem"][aria-selected="true"]')).toHaveCount(1);
  await expect(tree.getByRole("treeitem", { name: /按钮槽位/ })).toHaveAttribute("aria-selected", "true");

  const persisted = structuredClone(server.resource);
  if (!persisted?.draft) throw new Error("目录载荷负例缺少已保存草稿");
  const designLibrary = page.locator('[data-unified-template-library="design"]');
  const card = designLibrary.locator(
    `[data-template-catalog-card="shared"][data-template-identity="template:${templateId}"][data-template-name="${templateId}"]`,
  );
  await expect(card).toContainText("TD-6A 发布失败恢复模板");
  const catalogReadsAfterSave = server.catalogReads;
  const dispatchChange = async (detail: unknown) => {
    await page.evaluate(({ detail: eventDetail, eventName }) => {
      window.dispatchEvent(new CustomEvent(eventName, { detail: eventDetail }));
    }, { detail, eventName: DYNAMIC_TEMPLATE_CATALOG_CHANGED_EVENT });
  };
  const verifiedPublished = publishedFrom(
    persisted,
    persisted.draft.definition,
    persisted.draft.versionNote,
  );
  const verifiedEditable = structuredClone(persisted);
  if (!verifiedEditable.draft) throw new Error("已核验目录负例缺少可编辑草稿");
  verifiedEditable.publishedVersion = verifiedPublished.version;
  verifiedEditable.visibility = "STAFF";
  verifiedEditable.draft.baseVersion = verifiedPublished.version;
  const collisionDefinition = structuredClone(persisted.draft.definition);
  const collisionTemplateId = `${templateId}-same-name`;
  collisionDefinition.templateId = collisionTemplateId;
  const collision = makeResource(collisionDefinition, 1, 0, null);
  if (!collision.draft) throw new Error("同名身份负例缺少可编辑草稿");
  const verifiedCatalogDetail = {
    kind: "verified-catalog",
    identity: {
      definitionChecksum: verifiedPublished.definitionChecksum,
      templateId,
      version: verifiedPublished.version,
    },
    catalog: {
      source: "unified",
      items: [
        { kind: "editable", template: verifiedEditable },
        { kind: "published", template: verifiedPublished },
        { kind: "editable", template: collision },
      ],
    },
  };
  await dispatchChange(verifiedCatalogDetail);
  expect(server.catalogReads, "已核验目录载荷必须直接应用且不再读取").toBe(catalogReadsAfterSave);
  await expect(card).toContainText("当前草稿 · 已保存");
  await expect(card).toContainText("线上 v1");
  await expect(page.locator(
    `[data-unified-template-library="page"] [data-template-name="${templateId}"]`,
  ), "非活跃页面目录不得消费事件载荷或改写本地状态").toHaveCount(0);
  const collisionCard = designLibrary.locator(
    `[data-template-catalog-card="shared"][data-template-identity="template:${collisionTemplateId}"][data-template-name="${collisionTemplateId}"]`,
  );
  await expect(card).toHaveCount(1);
  await expect(collisionCard).toHaveCount(1);
  await expect(card).toContainText(persisted.name);
  await expect(collisionCard).toContainText(persisted.name);

  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const malformedCatalogItems: unknown[][] = [
    [null],
    [{ kind: "published" }],
    [{ kind: "published", template: verifiedPublished }, null],
  ];
  for (const items of malformedCatalogItems) {
    const readsBeforeMalformed = server.catalogReads;
    server.holdNextCatalog = true;
    const fallbackResponse = page.waitForResponse((response) => (
      response.url().includes("/api/page-modules/dynamic-templates/catalog")
      && response.request().method() === "GET"
    ));
    await dispatchChange({
      ...verifiedCatalogDetail,
      catalog: { source: "unified", items },
    });
    await expect.poll(() => server.releaseHeldCatalog).not.toBeNull();
    expect(server.catalogReads, "每个坏 catalog 事件只能回退一次 GET").toBe(readsBeforeMalformed + 1);
    await expect(card).toContainText(persisted.name);
    await expect(collisionCard).toContainText(persisted.name);
    await dispatchChange(verifiedCatalogDetail);
    const releaseMalformedCatalog = server.releaseHeldCatalog as (() => void) | null;
    if (!releaseMalformedCatalog) throw new Error("坏 catalog 回退请求未进入挂起状态");
    releaseMalformedCatalog();
    await fallbackResponse;
    await expect(card).toContainText(persisted.name);
    await expect(collisionCard).toContainText(persisted.name);
  }
  expect(pageErrors, "坏 catalog 不得从 window 事件监听器抛错").toEqual([]);

  const renamedCollision = structuredClone(collision);
  if (!renamedCollision.draft) throw new Error("同名模板重命名负例缺少草稿");
  renamedCollision.name = "TD-6A 同名模板已重命名";
  renamedCollision.draft.definition.name = renamedCollision.name;
  renamedCollision.draft.revision += 1;
  await dispatchChange({
    kind: "editable-upsert",
    identity: {
      definitionChecksum: renamedCollision.draft.definitionChecksum,
      revision: renamedCollision.draft.revision,
      templateId: collisionTemplateId,
    },
    template: renamedCollision,
  });
  await expect(card).toHaveCount(1);
  await expect(collisionCard).toHaveCount(1);
  await expect(card).toContainText(persisted.name);
  await expect(collisionCard).toContainText("TD-6A 同名模板已重命名");
  const catalogReadsBeforeEditableFallbacks = server.catalogReads;

  const persistedDetail = {
    kind: "editable-upsert",
    identity: {
      definitionChecksum: persisted.draft.definitionChecksum,
      revision: persisted.draft.revision,
      templateId,
    },
    template: persisted,
  };

  await dispatchChange(persistedDetail);
  await dispatchChange(persistedDetail);
  expect(server.catalogReads, "同 revision、同 checksum 的重复载荷必须幂等").toBe(catalogReadsBeforeEditableFallbacks);
  await expect(card).toHaveCount(1);

  server.holdNextCatalog = true;
  await dispatchChange({
    ...persistedDetail,
    identity: { ...persistedDetail.identity, templateId: `wrong-${templateId}` },
  });
  await expect.poll(() => server.releaseHeldCatalog).not.toBeNull();
  expect(server.catalogReads, "活跃目录对坏身份只允许一次回退读取；非活跃目录不得重复请求").toBe(catalogReadsBeforeEditableFallbacks + 1);

  const newer = structuredClone(persisted);
  if (!newer.draft) throw new Error("较新目录载荷缺少可编辑草稿");
  newer.name = "TD-6A 目录载荷较新模板";
  newer.draft.revision += 1;
  const newerDetail = {
    kind: "editable-upsert",
    identity: {
      definitionChecksum: newer.draft.definitionChecksum,
      revision: newer.draft.revision,
      templateId,
    },
    template: newer,
  };
  await dispatchChange(newerDetail);
  await expect(card).toContainText("TD-6A 目录载荷较新模板");

  const staleResponse = page.waitForResponse((response) => (
    response.url().includes("/api/page-modules/dynamic-templates/catalog")
    && response.request().method() === "GET"
  ));
  const releaseStaleCatalog = server.releaseHeldCatalog as (() => void) | null;
  if (!releaseStaleCatalog) throw new Error("迟到目录请求未进入挂起状态");
  releaseStaleCatalog();
  await staleResponse;
  await expect(card).toContainText("TD-6A 目录载荷较新模板");
  expect(server.catalogReads, "迟到 GET 必须被新载荷递增的 requestId 失效").toBe(catalogReadsBeforeEditableFallbacks + 1);

  await dispatchChange(persistedDetail);
  await dispatchChange(newerDetail);
  expect(server.catalogReads, "低 revision 与重复的新 revision 均不得回退读取").toBe(catalogReadsBeforeEditableFallbacks + 1);
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("TD-6A 目录载荷较新模板");

  const conflicting = structuredClone(newer);
  if (!conflicting.draft) throw new Error("checksum 冲突负例缺少可编辑草稿");
  conflicting.draft.definitionChecksum = DIFFERENT_CHECKSUM;
  await dispatchChange({
    kind: "editable-upsert",
    identity: {
      definitionChecksum: DIFFERENT_CHECKSUM,
      revision: conflicting.draft.revision,
      templateId,
    },
    template: conflicting,
  });
  await expect.poll(() => server.catalogReads).toBe(catalogReadsBeforeEditableFallbacks + 2);

  await page.evaluate((eventName) => {
    window.dispatchEvent(new CustomEvent(eventName));
  }, DYNAMIC_TEMPLATE_CATALOG_CHANGED_EVENT);
  await expect.poll(() => server.catalogReads).toBe(catalogReadsBeforeEditableFallbacks + 3);
  expect(server.unexpectedRequests).toEqual([]);
});
