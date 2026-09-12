import { expect, test, type Page, type Route } from "@playwright/test";

import { installAdminSession } from "./fixtures/session-auth";
import { systemTemplateCatalogItems } from "./fixtures/template-catalog";
import { saveTemplate } from "./fixtures/template-authoring-main-route";

const NOW = "2026-09-09T09:00:00.000Z";
const TEMPLATE_A = "tpl_td6_exact_a";
const TEMPLATE_B = "tpl_td6_exact_b";
const CHECKSUM_A = "a".repeat(64);
const CHECKSUM_B = "b".repeat(64);
const CHECKSUM_FRESH = "c".repeat(64);

type TemplateDefinition = {
  schemaVersion: number;
  templateId: string;
  name: string;
  description: string;
  metadata: Record<string, unknown>;
  rootNodeId: string;
  nodes: Record<string, unknown>;
  slots: Record<string, unknown>;
  defaultContent: Record<string, unknown>;
  previewContent: Record<string, unknown>;
};

type DraftResource = {
  id: number;
  templateId: string;
  ownerId: number;
  sourceType: "CUSTOM";
  visibility: "PRIVATE";
  status: "ACTIVE";
  name: string;
  category: string;
  purpose: string;
  layoutType: string;
  description: string;
  slotSummary: string;
  recommendedFor: string[];
  tags: string[];
  definitionSchemaVersion: number;
  publishedVersion: number;
  sourceReference: string | null;
  archivedAt: null;
  createdAt: string;
  updatedAt: string;
  canDelete: boolean;
  deleteBlockers: unknown[];
  draft: {
    id: number;
    baseVersion: null;
    revision: number;
    definition: TemplateDefinition;
    definitionChecksum: string;
    versionNote: string;
    updatedAt: string;
  };
};

type SystemCompatibilityCatalogItem = ReturnType<typeof systemTemplateCatalogItems>[number];

type SessionSnapshot = {
  compatibilityRecovery: unknown;
  definition: TemplateDefinition | null;
  dirty: boolean;
  historyFuture: unknown[];
  historyPast: unknown[];
  permission: {
    isLoggedIn: boolean;
    role: string | null;
    status: string;
  };
  remote: Record<string, unknown> | null;
  saveStatus: string;
  selectionSnapshot: unknown;
  semanticGeneration: number;
  sessionId: string | null;
  versionNote: string | null;
  workspace: string;
};

type RequestFact = { method: string; path: string };
type DraftResponder = (route: Route) => Promise<void> | void;

type BoundaryServer = {
  catalogReads: number;
  dynamicWrites: RequestFact[];
  pageWrites: RequestFact[];
  requests: RequestFact[];
  resources: Map<string, DraftResource>;
  setDraftResponder: (templateId: string, responder: DraftResponder) => void;
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

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function makeDefinition(templateId: string, name: string, rootSuffix = "base"): TemplateDefinition {
  const rootNodeId = `node_${templateId}_${rootSuffix}`;
  const rules = {
    display: "block",
    order: 0,
    width: "fill",
    height: { mode: "auto" },
  };
  return {
    schemaVersion: 1,
    templateId,
    name,
    description: `${name} 确定性边界夹具`,
    metadata: {
      category: "测试模板",
      purpose: "草稿重开边界",
      layoutType: "空白结构",
      slotSummary: "暂无内容槽位",
      recommendedFor: ["home"],
      desktopRatio: "auto",
      mobileRatio: "auto",
      previewDesktopWidth: 1440,
      previewMobileWidth: 390,
      mobileBreakpoint: 767,
      minViewportWidth: 320,
      maxViewportWidth: 1920,
      defaultBackgroundToken: "surface",
      visualRole: "support-stage",
      headerCompatibility: ["solid"],
      tags: ["td6-exact-get"],
    },
    rootNodeId,
    nodes: {
      [rootNodeId]: {
        nodeId: rootNodeId,
        type: "Section",
        name: `${name}根节点`,
        childIds: [],
        props: {},
        responsive: {
          desktop: structuredClone(rules),
          mobile: structuredClone(rules),
        },
        hidden: false,
      },
    },
    slots: {},
    defaultContent: {},
    previewContent: {},
  };
}

function makeResource(
  templateId: string,
  name: string,
  checksum: string,
  id: number,
): DraftResource {
  const definition = makeDefinition(templateId, name);
  return {
    id,
    templateId,
    ownerId: 1,
    sourceType: "CUSTOM",
    visibility: "PRIVATE",
    status: "ACTIVE",
    name,
    category: String(definition.metadata.category),
    purpose: String(definition.metadata.purpose),
    layoutType: String(definition.metadata.layoutType),
    description: definition.description,
    slotSummary: String(definition.metadata.slotSummary),
    recommendedFor: ["home"],
    tags: ["td6-exact-get"],
    definitionSchemaVersion: 1,
    publishedVersion: 0,
    sourceReference: null,
    archivedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    canDelete: true,
    deleteBlockers: [],
    draft: {
      id: id + 100,
      baseVersion: null,
      revision: id,
      definition,
      definitionChecksum: checksum,
      versionNote: `${name} revision ${id}`,
      updatedAt: NOW,
    },
  };
}

function pageDraft() {
  return {
    id: 9801,
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

async function installBoundaryServer(
  page: Page,
  catalogResources?: DraftResource[],
  compatibilityItems: SystemCompatibilityCatalogItem[] = [],
): Promise<BoundaryServer> {
  const resources = new Map<string, DraftResource>(
    (catalogResources ?? [
      makeResource(TEMPLATE_A, "TD6 边界模板 A", CHECKSUM_A, 11),
      makeResource(TEMPLATE_B, "TD6 边界模板 B", CHECKSUM_B, 22),
    ]).map((resource) => [resource.templateId, resource]),
  );
  const responders = new Map<string, DraftResponder>();
  const state: BoundaryServer = {
    catalogReads: 0,
    dynamicWrites: [],
    pageWrites: [],
    requests: [],
    resources,
    setDraftResponder(templateId, responder) {
      responders.set(templateId, responder);
    },
  };

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const method = request.method();
    const path = new URL(request.url()).pathname;
    state.requests.push({ method, path });

    if (path === "/api/auth/profile") return route.fallback();
    if (path === "/api/page-modules/dynamic-templates/catalog" && method === "GET") {
      state.catalogReads += 1;
      return route.fulfill(json({
        source: "unified",
        items: [
          ...[...resources.values()].map((template) => ({
            kind: "editable" as const,
            template: structuredClone(template),
          })),
          ...compatibilityItems.map((item) => structuredClone(item)),
        ],
      }));
    }

    const draftMatch = path.match(/^\/api\/page-modules\/dynamic-templates\/([^/]+)\/draft$/);
    if (draftMatch && method === "GET") {
      const templateId = decodeURIComponent(draftMatch[1]);
      const responder = responders.get(templateId);
      if (responder) return responder(route);
      return route.fulfill(json(structuredClone(resources.get(templateId) ?? null)));
    }

    if (path.endsWith("/page-modules/document/validate")) {
      return route.fulfill(json({ valid: true, errors: [], issues: [] }));
    }
    if (path.includes("/page-modules/document/revisions")) {
      return route.fulfill(json({ items: [], nextBeforeVersion: null }));
    }
    if (path.includes("/page-modules/document/published")) {
      return route.fulfill(json(null));
    }
    if (path.includes("/page-modules/document/admin")) {
      return route.fulfill(json(pageDraft()));
    }

    if (path.includes("/page-modules/dynamic-templates") && method !== "GET") {
      state.dynamicWrites.push({ method, path });
      return route.fulfill(json(null, 409));
    }
    if (path.includes("/page-modules/document") && ["PUT", "PATCH", "DELETE"].includes(method)) {
      state.pageWrites.push({ method, path });
      return route.fulfill(json(null, 409));
    }
    return route.fulfill(json({}));
  });
  await installAdminSession(page, {
    username: "td6-exact-get",
    realName: "TD6 exact GET 管理员",
  });
  return state;
}

function draftReads(server: BoundaryServer, templateId?: string) {
  const suffix = templateId
    ? `/api/page-modules/dynamic-templates/${encodeURIComponent(templateId)}/draft`
    : null;
  return server.requests.filter((request) => (
    request.method === "GET"
    && request.path.match(/^\/api\/page-modules\/dynamic-templates\/[^/]+\/draft$/)
    && (!suffix || request.path === suffix)
  ));
}

function catalogCard(page: Page, templateId: string) {
  return page.locator(
    `[data-template-catalog-card="shared"][data-template-name="${templateId}"]`,
  );
}

function catalogPrimaryButton(
  page: Page,
  templateId: string,
  name: string,
  state: "open" | "editing",
) {
  const displayName = name.endsWith("模板") ? name : `${name}模板`;
  const escapedName = displayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return catalogCard(page, templateId).getByRole("button", {
    name: new RegExp(`^${state === "editing" ? "正在编辑" : "打开"}${escapedName}，`),
  });
}

async function enterTemplateCatalog(page: Page, server: BoundaryServer) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/admin/editor/home");
  await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
  await page.getByRole("button", { name: "模板设计", exact: true }).click();
  await expect.poll(() => server.catalogReads).toBeGreaterThan(0);
  await expect(catalogCard(page, TEMPLATE_A)).toBeVisible();
  await expect(catalogCard(page, TEMPLATE_B)).toBeVisible();
  expect(draftReads(server), "首次进入模板设计只能读取目录，不能自动打开历史草稿").toEqual([]);
}

async function openTemplate(page: Page, server: BoundaryServer, templateId: string, name: string) {
  const before = draftReads(server, templateId).length;
  await catalogPrimaryButton(page, templateId, name, "open").click();
  await expect.poll(() => draftReads(server, templateId).length).toBe(before + 1);
  await expect(page.locator(".template-editor__workspace-identity-subject")).toHaveText(name);
}

/** 只读观察 store；不调用 Controller，也不写 session 或浏览器存储制造结果。 */
async function readSessionSnapshot(page: Page) {
  return page.evaluate<SessionSnapshot>(async () => {
    const sessionPath = "/src/page-builder/template-editor/templateEditorSession.ts";
    const authPath = "/src/store/authStore.ts";
    const visualPath = "/src/page-builder/visual-editor/visualEditorSession.ts";
    const [{ useTemplateEditorSession }, { useAuthStore }, { useVisualEditorSession }] = await Promise.all([
      import(/* @vite-ignore */ sessionPath),
      import(/* @vite-ignore */ authPath),
      import(/* @vite-ignore */ visualPath),
    ]);
    const session = useTemplateEditorSession.getState();
    const auth = useAuthStore.getState();
    return {
      compatibilityRecovery: structuredClone(session.draft?.compatibilityRecovery ?? null),
      definition: session.draft ? structuredClone(session.draft.definition) : null,
      dirty: session.dirty,
      historyFuture: structuredClone(session.historyFuture),
      historyPast: structuredClone(session.historyPast),
      permission: {
        isLoggedIn: auth.isLoggedIn,
        role: auth.user?.role ?? null,
        status: auth.status,
      },
      remote: session.draft?.remote ? structuredClone(session.draft.remote) : null,
      saveStatus: session.saveStatus,
      selectionSnapshot: structuredClone(session.selectionSnapshot),
      semanticGeneration: session.semanticGeneration,
      sessionId: session.sessionId,
      versionNote: session.draft?.versionNote ?? null,
      workspace: useVisualEditorSession.getState().workspace,
    };
  });
}

function expectNoWrites(server: BoundaryServer) {
  expect(server.pageWrites, "草稿 GET 边界不得写 PageDocument").toEqual([]);
  expect(server.dynamicWrites, "草稿 GET 边界不得触发模板保存、发布或生命周期写入").toEqual([]);
}

async function expectCatalogStillOperable(page: Page) {
  await expect(catalogPrimaryButton(page, TEMPLATE_A, "TD6 边界模板 A", "editing")).toBeEnabled();
  await expect(catalogPrimaryButton(page, TEMPLATE_B, "TD6 边界模板 B", "open")).toBeEnabled();
  await expect(page.getByRole("button", { name: "新建模板", exact: true })).toBeEnabled();
}

const malformedCases: Array<{
  name: string;
  response: (resource: DraftResource) => unknown;
  message: RegExp;
}> = [
  {
    name: "null",
    response: () => null,
    message: /服务端模板草稿不存在，当前编辑会话未改变/,
  },
  {
    name: "外层模板身份不匹配",
    response: (resource) => ({ ...structuredClone(resource), templateId: TEMPLATE_A }),
    message: /模板草稿身份或内容无效，当前编辑会话未改变/,
  },
  {
    name: "definition 模板身份不匹配",
    response: (resource) => {
      const result = structuredClone(resource);
      result.draft.definition.templateId = TEMPLATE_A;
      return result;
    },
    message: /模板草稿身份或内容无效，当前编辑会话未改变/,
  },
  {
    name: "revision 非法",
    response: (resource) => {
      const result = structuredClone(resource);
      result.draft.revision = 0;
      return result;
    },
    message: /模板草稿身份或内容无效，当前编辑会话未改变/,
  },
  {
    name: "checksum 非法",
    response: (resource) => {
      const result = structuredClone(resource);
      result.draft.definitionChecksum = "INVALID";
      return result;
    },
    message: /模板草稿身份或内容无效，当前编辑会话未改变/,
  },
  {
    name: "DefinitionV2 非法",
    response: (resource) => {
      const result = structuredClone(resource);
      result.draft.definition.nodes = {};
      return result;
    },
    message: /模板草稿身份或内容无效，当前编辑会话未改变/,
  },
];

test.describe("TD6 exact draft GET：失败资源保持当前安全会话", () => {
  for (const scenario of malformedCases) {
    test(`拒绝 ${scenario.name}`, async ({ page }) => {
      const server = await installBoundaryServer(page);
      await enterTemplateCatalog(page, server);
      await openTemplate(page, server, TEMPLATE_A, "TD6 边界模板 A");
      const baseline = await readSessionSnapshot(page);
      const resourceB = server.resources.get(TEMPLATE_B);
      if (!resourceB) throw new Error("缺少模板 B 夹具");
      server.setDraftResponder(TEMPLATE_B, (route) => route.fulfill(json(scenario.response(resourceB))));

      await catalogPrimaryButton(page, TEMPLATE_B, "TD6 边界模板 B", "open").click();
      await expect(page.locator(".ant-message-notice-content").last()).toContainText(scenario.message);

      expect(draftReads(server, TEMPLATE_B)).toEqual([{
        method: "GET",
        path: `/api/page-modules/dynamic-templates/${TEMPLATE_B}/draft`,
      }]);
      expect(await readSessionSnapshot(page)).toEqual(baseline);
      await expect(catalogPrimaryButton(page, TEMPLATE_A, "TD6 边界模板 A", "editing")).toHaveAttribute("aria-pressed", "true");
      await expectCatalogStillOperable(page);
      expectNoWrites(server);
    });
  }

  for (const failure of [
    { name: "403", status: 403, message: /权限不足/ },
    { name: "409", status: 409, message: /数据已被其他操作更新/ },
  ]) {
    test(`拒绝 exact GET ${failure.name}`, async ({ page }) => {
      const server = await installBoundaryServer(page);
      await enterTemplateCatalog(page, server);
      await openTemplate(page, server, TEMPLATE_A, "TD6 边界模板 A");
      const baseline = await readSessionSnapshot(page);
      server.setDraftResponder(TEMPLATE_B, (route) => route.fulfill(json(null, failure.status)));

      await catalogPrimaryButton(page, TEMPLATE_B, "TD6 边界模板 B", "open").click();
      await expect(page.locator(".ant-message-notice-content").last()).toContainText(failure.message);

      expect(draftReads(server, TEMPLATE_B)).toEqual([{
        method: "GET",
        path: `/api/page-modules/dynamic-templates/${TEMPLATE_B}/draft`,
      }]);
      expect(await readSessionSnapshot(page)).toEqual(baseline);
      await expectCatalogStillOperable(page);
      expectNoWrites(server);
    });
  }

  test("网络失败不回退目录副本或旧自动恢复语义", async ({ page }) => {
    const server = await installBoundaryServer(page);
    await enterTemplateCatalog(page, server);
    await openTemplate(page, server, TEMPLATE_A, "TD6 边界模板 A");
    const baseline = await readSessionSnapshot(page);
    server.setDraftResponder(TEMPLATE_B, (route) => route.abort("failed"));

    await catalogPrimaryButton(page, TEMPLATE_B, "TD6 边界模板 B", "open").click();
    await expect(page.locator(".ant-message-notice-content").last()).toContainText(
      /读取模板草稿失败，当前编辑会话未改变/,
    );

    expect(draftReads(server, TEMPLATE_B)).toEqual([{
      method: "GET",
      path: `/api/page-modules/dynamic-templates/${TEMPLATE_B}/draft`,
    }]);
    expect(await readSessionSnapshot(page)).toEqual(baseline);
    await expectCatalogStillOperable(page);
    expectNoWrites(server);
  });
});

test.describe("TD6 exact draft GET：并发与离开边界", () => {
  test("快速双选 A 到 B 时迟到 A 不能覆盖 B", async ({ page }) => {
    const server = await installBoundaryServer(page);
    await enterTemplateCatalog(page, server);
    await openTemplate(page, server, TEMPLATE_A, "TD6 边界模板 A");
    const aGate = deferred();
    const aHandled = deferred();
    const resourceA = server.resources.get(TEMPLATE_A);
    if (!resourceA) throw new Error("缺少模板 A 夹具");
    server.setDraftResponder(TEMPLATE_A, async (route) => {
      await aGate.promise;
      await route.fulfill(json(structuredClone(resourceA)));
      aHandled.resolve();
    });

    const aReadsBeforeRace = draftReads(server, TEMPLATE_A).length;
    await catalogPrimaryButton(page, TEMPLATE_A, "TD6 边界模板 A", "editing").click();
    await expect.poll(() => draftReads(server, TEMPLATE_A).length).toBe(aReadsBeforeRace + 1);
    await catalogPrimaryButton(page, TEMPLATE_B, "TD6 边界模板 B", "open").click();
    await expect(page.locator(".template-editor__workspace-identity-subject")).toHaveText("TD6 边界模板 B");
    expect(draftReads(server, TEMPLATE_B)).toEqual([{
      method: "GET",
      path: `/api/page-modules/dynamic-templates/${TEMPLATE_B}/draft`,
    }]);
    const afterB = await readSessionSnapshot(page);
    expect(afterB.definition?.templateId).toBe(TEMPLATE_B);
    await expect(catalogPrimaryButton(page, TEMPLATE_B, "TD6 边界模板 B", "editing")).toHaveAttribute("aria-pressed", "true");

    aGate.resolve();
    await aHandled.promise;
    expect(await readSessionSnapshot(page)).toEqual(afterB);
    await expect(catalogPrimaryButton(page, TEMPLATE_B, "TD6 边界模板 B", "editing")).toHaveAttribute("aria-pressed", "true");
    expectNoWrites(server);
  });

  test("A 挂起时切回页面装修，迟到响应不重开模板或污染页面", async ({ page }) => {
    const server = await installBoundaryServer(page);
    await enterTemplateCatalog(page, server);
    await openTemplate(page, server, TEMPLATE_A, "TD6 边界模板 A");
    const baseline = await readSessionSnapshot(page);
    const gate = deferred();
    const handled = deferred();
    const resourceB = server.resources.get(TEMPLATE_B);
    if (!resourceB) throw new Error("缺少模板 B 夹具");
    server.setDraftResponder(TEMPLATE_B, async (route) => {
      await gate.promise;
      await route.fulfill(json(structuredClone(resourceB)));
      handled.resolve();
    });

    await catalogPrimaryButton(page, TEMPLATE_B, "TD6 边界模板 B", "open").click();
    await expect.poll(() => draftReads(server, TEMPLATE_B).length).toBe(1);
    await page.getByRole("button", { name: "页面装修", exact: true }).click();
    await expect(page.getByRole("group", { name: "店铺装修工作模式切换" })).toHaveAttribute("data-active-mode", "page");

    gate.resolve();
    await handled.promise;
    expect(await readSessionSnapshot(page)).toEqual({ ...baseline, workspace: "page" });
    await expect(page.locator(".template-editor__workspace")).toHaveCount(0);
    expectNoWrites(server);
  });

  test("A 挂起时关闭模板会话，迟到响应不能复活会话", async ({ page }) => {
    const server = await installBoundaryServer(page);
    await enterTemplateCatalog(page, server);
    await openTemplate(page, server, TEMPLATE_A, "TD6 边界模板 A");
    const gate = deferred();
    const handled = deferred();
    const resourceB = server.resources.get(TEMPLATE_B);
    if (!resourceB) throw new Error("缺少模板 B 夹具");
    server.setDraftResponder(TEMPLATE_B, async (route) => {
      await gate.promise;
      await route.fulfill(json(structuredClone(resourceB)));
      handled.resolve();
    });

    await catalogPrimaryButton(page, TEMPLATE_B, "TD6 边界模板 B", "open").click();
    await expect.poll(() => draftReads(server, TEMPLATE_B).length).toBe(1);
    await page.getByRole("button", { name: "更多模板操作", exact: true }).click();
    await page.getByRole("menuitem", { name: "关闭模板会话" }).click();
    const identitySubject = page.locator(".template-editor__workspace-identity-subject");
    await expect(identitySubject).toBeVisible();
    await expect(identitySubject).toHaveText("未选择模板");

    gate.resolve();
    await handled.promise;
    const closed = await readSessionSnapshot(page);
    expect(closed).toMatchObject({
      compatibilityRecovery: null,
      definition: null,
      dirty: false,
      historyFuture: [],
      historyPast: [],
      remote: null,
      sessionId: null,
      workspace: "template",
    });
    expectNoWrites(server);
  });
});

test("TD6 历史来源标记不触发恢复转换，exact GET 草稿原样打开且不产生 dirty 或写入", async ({ page }) => {
  const [systemCompatibility] = systemTemplateCatalogItems();
  if (!systemCompatibility) throw new Error("缺少系统兼容目录夹具");
  const catalogA = makeResource(TEMPLATE_A, "TD6 边界模板 A", CHECKSUM_A, 11);
  catalogA.sourceReference = `legacy_system_${systemCompatibility.template.contractKey}`;
  const catalogB = makeResource(TEMPLATE_B, "TD6 边界模板 B", CHECKSUM_B, 22);
  const server = await installBoundaryServer(
    page,
    [catalogA, catalogB],
    [systemCompatibility],
  );
  const exactA = structuredClone(catalogA);
  exactA.description = "仅来自 exact GET 的新鲜描述";
  exactA.category = "新鲜分类";
  exactA.purpose = "新鲜恢复用途";
  exactA.layoutType = "新鲜系统兼容布局";
  exactA.recommendedFor = ["collection"];
  exactA.tags = ["fresh-exact-get"];
  exactA.draft.revision = 31;
  exactA.draft.definitionChecksum = CHECKSUM_FRESH;
  exactA.draft.definition = makeDefinition(TEMPLATE_A, exactA.name, "exact_get_original");
  const exactJson = JSON.stringify(exactA);
  server.setDraftResponder(TEMPLATE_A, (route) => route.fulfill(json(exactA)));

  await enterTemplateCatalog(page, server);
  await openTemplate(page, server, TEMPLATE_A, "TD6 边界模板 A");
  const recovered = await readSessionSnapshot(page);

  expect(recovered.definition, "历史来源标记不能以系统 current 或资源外层元数据改写精确草稿")
    .toEqual(exactA.draft.definition);
  expect(JSON.stringify(recovered.definition)).toBe(JSON.stringify(exactA.draft.definition));
  expect(JSON.stringify(exactA)).toBe(exactJson);
  expect(exactA.sourceReference).toBe(catalogA.sourceReference);
  expect(recovered.definition).not.toEqual(catalogA.draft.definition);
  expect(recovered.compatibilityRecovery).toBeNull();
  expect(recovered.historyPast).toEqual([]);
  expect(recovered.historyFuture).toEqual([]);
  expect(recovered).toMatchObject({
    dirty: false,
    remote: {
      draftDefinitionChecksum: CHECKSUM_FRESH,
      revision: exactA.draft.revision,
    },
    workspace: "template",
  });
  expect(draftReads(server, TEMPLATE_A)).toEqual([{
    method: "GET",
    path: `/api/page-modules/dynamic-templates/${TEMPLATE_A}/draft`,
  }]);
  await expect(catalogPrimaryButton(page, TEMPLATE_A, "TD6 边界模板 A", "editing")).toHaveAttribute("aria-pressed", "true");
  expectNoWrites(server);
});

async function editTemplateName(page: Page, name: string) {
  const field = page.getByRole("textbox", { name: "模板名称", exact: true });
  if (!await field.isVisible()) await page.getByRole("button", { name: "打开模板设置", exact: true }).click();
  await field.fill(name);
  await field.press("Tab");
}

async function createUnsavedTemplate(page: Page) {
  await page.getByRole("button", { name: "顶部新建模板", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "创建模板", exact: true });
  await dialog.getByRole("button", { name: "商品促销", exact: true }).click();
  await dialog.getByRole("button", { name: "下一步", exact: true }).click();
  await dialog.getByRole("button", { name: /竖版 4:5/ }).click();
  await dialog.getByRole("button", { name: "下一步", exact: true }).click();
  await dialog.getByRole("button", { name: /上图下文/ }).click();
  await dialog.getByRole("button", { name: "下一步", exact: true }).click();
  await dialog.getByRole("button", { name: "前往确认（未配置项用推荐值）", exact: true }).click();
  await dialog.getByRole("button", { name: "创建模板", exact: true }).click();
  await expect(dialog).toBeHidden();
}

test.describe("普通保存响应恢复（自有 API Mock）", () => {
  for (const mode of ["create", "update", "newer-edit"] as const) {
    test(`${mode} 响应丢失后恢复保存身份并保留新编辑`, async ({ page }) => {
      const server = await installBoundaryServer(page);
      await enterTemplateCatalog(page, server);
      if (mode === "create") await createUnsavedTemplate(page);
      else await openTemplate(page, server, TEMPLATE_A, "TD6 边界模板 A");
      await editTemplateName(page, `响应恢复 ${mode}`);
      const before = await readSessionSnapshot(page);
      const templateId = before.definition!.templateId;
      const writes: Array<{ expectedRevision?: number }> = [];
      const gate = deferred();
      let verifying = false;
      await page.route("**/api/page-modules/dynamic-templates**", async (route) => {
        if (!["POST", "PATCH"].includes(route.request().method())) return route.fallback();
        const body = route.request().postDataJSON();
        writes.push(body);
        const stored = structuredClone(server.resources.get(templateId)
          ?? makeResource(templateId, body.definition.name, CHECKSUM_A, 77));
        stored.name = body.definition.name;
        stored.draft.definition = body.definition;
        stored.draft.versionNote = body.versionNote ?? "";
        stored.draft.revision = body.expectedRevision === undefined ? 1 : body.expectedRevision + 1;
        stored.draft.definitionChecksum = CHECKSUM_FRESH;
        server.resources.set(templateId, stored);
        if (writes.length === 1) {
          server.setDraftResponder(templateId, async (readRoute) => {
            verifying = true;
            if (mode === "newer-edit") await gate.promise;
            await readRoute.fulfill(json(stored));
          });
          return route.abort("failed");
        }
        return route.fulfill(json(stored));
      });
      await saveTemplate(page);
      await expect.poll(() => verifying).toBe(true);
      if (mode === "newer-edit") {
        await editTemplateName(page, "核验期间的新名称");
        gate.resolve();
      }
      await expect.poll(async () => (await readSessionSnapshot(page)).remote?.revision).toBe(mode === "create" ? 1 : 12);
      const recovered = await readSessionSnapshot(page);
      expect(recovered.dirty).toBe(mode === "newer-edit");
      if (mode === "newer-edit") expect(recovered.definition?.name).toBe("核验期间的新名称");
      expect(writes).toHaveLength(1);
      expect(draftReads(server, templateId)).toHaveLength(mode === "create" ? 1 : 2);
      await editTemplateName(page, `恢复后再编辑 ${mode}`);
      await saveTemplate(page);
      await expect.poll(() => writes.length).toBe(2);
      await expect.poll(async () => (await readSessionSnapshot(page)).saveStatus).toBe("success");
      expect(writes[1].expectedRevision).toBe(recovered.remote?.revision);
    });
  }

  for (const scenario of ["同名", "revision", "核验不匹配", "核验失败", "同ID内容冲突", "混合冲突核验失败"] as const) {
    test(`${scenario} 不误认保存成功且保留本地内容`, async ({ page }) => {
      const server = await installBoundaryServer(page);
      await enterTemplateCatalog(page, server);
      const newTemplate = ["同名", "同ID内容冲突", "混合冲突核验失败"].includes(scenario);
      if (newTemplate) await createUnsavedTemplate(page);
      else await openTemplate(page, server, TEMPLATE_A, "TD6 边界模板 A");
      await editTemplateName(page, "保留本地输入");
      const before = await readSessionSnapshot(page);
      const templateId = before.definition!.templateId;
      if (scenario === "同名") {
        server.setDraftResponder(templateId, (route) => route.fulfill(json(null, 404)));
      } else if (scenario === "同ID内容冲突") {
        const existing = makeResource(templateId, "同一身份已经保存的旧名称", CHECKSUM_A, 77);
        existing.draft.revision = 1;
        server.resources.set(templateId, existing);
      } else if (scenario === "混合冲突核验失败") {
        server.setDraftResponder(templateId, (route) => route.abort("failed"));
      }
      let writes = 0;
      await page.route("**/api/page-modules/dynamic-templates**", async (route) => {
        if (!["POST", "PATCH"].includes(route.request().method())) return route.fallback();
        writes += 1;
        if (scenario === "同名" && writes === 2) {
          const body = route.request().postDataJSON();
          const stored = makeResource(templateId, body.definition.name, CHECKSUM_FRESH, 77);
          stored.draft.definition = body.definition;
          stored.draft.versionNote = body.versionNote ?? "";
          stored.draft.revision = 1;
          server.resources.set(templateId, stored);
          return route.fulfill(json(stored));
        }
        if (scenario.startsWith("核验")) {
          server.setDraftResponder(TEMPLATE_A, (readRoute) => scenario === "核验失败"
            ? readRoute.abort("failed")
            : readRoute.fulfill(json({ ...server.resources.get(TEMPLATE_A), templateId: TEMPLATE_B })));
          return route.abort("failed");
        }
        return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({
          message: newTemplate ? "当前账号已存在同名模板，或模板 ID 已被使用" : "模板草稿已被其他会话更新，请刷新后重试",
        }) });
      });
      await saveTemplate(page);
      await expect.poll(async () => (await readSessionSnapshot(page)).saveStatus).toBe(
        ["revision", "同ID内容冲突", "混合冲突核验失败"].includes(scenario) ? "conflict" : "error",
      );
      const after = await readSessionSnapshot(page);
      expect(after.definition).toEqual(before.definition);
      expect(after.remote).toEqual(before.remote);
      expect(after.dirty).toBe(true);
      expect(writes).toBe(1);
      if (scenario === "同名") {
        await expect(page.locator(".ant-message-notice-content").last()).toContainText("修改模板名称后重新保存");
        await editTemplateName(page, "换一个模板名称");
        await expect.poll(async () => (await readSessionSnapshot(page)).definition?.name).toBe("换一个模板名称");
        await saveTemplate(page);
        await expect.poll(async () => (await readSessionSnapshot(page)).saveStatus).toBe("success");
        expect(writes).toBe(2);
        expect((await readSessionSnapshot(page)).dirty).toBe(false);
        expect(server.resources.get(templateId)?.draft.definition.name).toBe("换一个模板名称");
      } else if (newTemplate) {
        await expect(page.locator(".ant-message-notice-content").last()).not.toContainText("修改模板名称");
        await expect(page.locator(".ant-message-notice-content").last()).toContainText(
          scenario === "同ID内容冲突" ? "服务端模板身份或版本与本次保存不一致" : "暂时无法确认服务端保存结果",
        );
      }
    });
  }
});
