import { expect, test as base, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { addDynamicTemplateNode } from "../src/page-builder/template-definition";
import { createNewDynamicTemplateDraft } from "../src/page-builder/template-editor/dynamicTemplateDraftRepository";
import type { TemplateCatalogItemResource } from "../src/services/clients/dynamicTemplateClient";
import { installAdminSession } from "./fixtures/session-auth";
import { systemTemplateCatalog } from "./fixtures/template-catalog";
import {
  addTwoRegions, createBlankTemplate, installNewTemplateServer,
  readSession, structurePanel,
} from "./fixtures/template-authoring-main-route";

/**
 * TD-3C1：真实 HomepageConfig → TemplateWorkspace →
 * DynamicTemplateStructurePanel，只 Mock 自有 API，不证明真实持久化。
 *
 * 这些用例固定树的焦点合同：方向键与 Home/End 只移动焦点，Enter/Space
 * 才改变选择；所有键盘导航和选择都必须保持零写请求、零 history、零 dirty。
 */
const appMode = process.env.PLAYWRIGHT_APP_MODE === "mock" ? "mock" : "development";
const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const DEEP_TEMPLATE_CHECKSUM = "a".repeat(64);

base.describe("结构问题修复入口与全局显隐（自有 API Mock）", () => {
  base("缺槽位选择内容不写入，沿用当前区域并允许显式选择内容类型", async ({ page }) => {
    const server = await installNewTemplateServer(page);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await createBlankTemplate(page);
    await addTwoRegions(page);
    const before = await readSession(page);
    const definition = before.definition!;
    const [firstId, secondId] = definition.nodes[definition.rootNodeId].childIds;
    expect(before.selectedObjectId).toBe(secondId);
    const structure = structurePanel(page);
    await structure.getByRole("button", { name: "选择内容", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "添加槽位", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("添加目标", { exact: true })).toHaveValue(secondId);
    expect((await readSession(page)).definition).toEqual(definition);
    expect((await readSession(page)).historyPast).toEqual(before.historyPast);
    await page.keyboard.press("Escape");
    await expect(structure.getByRole("button", { name: "添加槽位", exact: true })).toBeFocused();
    await structure.getByRole("button", { name: /模板整体/ }).click();
    await structure.getByRole("button", { name: "选择内容", exact: true }).click();
    await expect(dialog.getByLabel("添加目标", { exact: true })).toHaveValue("");
    await dialog.getByLabel("添加目标", { exact: true }).selectOption(secondId);
    await dialog.getByRole("button", { name: "添加正文槽位", exact: true }).click();
    const after = await readSession(page);
    expect(after.definition!.nodes[firstId].childIds).toEqual([]);
    const children = after.definition!.nodes[secondId].childIds;
    expect(children).toHaveLength(1);
    expect(after.definition!.nodes[children[0]].type).toBe("TextSlot");
    expect(after.historyPast).toHaveLength(before.historyPast.length + 1);
    expect(server.writes).toEqual([]);
  });

  base("全局隐藏提前说明所有设备与子内容，取消时保留响应式规则", async ({ page }) => {
    const server = await installNewTemplateServer(page);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await createBlankTemplate(page);
    await addTwoRegions(page);
    const structure = structurePanel(page);
    await structure.getByRole("button", { name: "添加槽位", exact: true }).click();
    await page.getByRole("dialog", { name: "添加槽位", exact: true })
      .getByRole("button", { name: "添加正文槽位", exact: true }).click();
    await page.keyboard.press("Escape");
    const before = await readSession(page);
    const regionId = before.definition!.nodes[before.definition!.rootNodeId].childIds[1];
    const region = structure.getByRole("treeitem", { name: "内容区域 2", exact: true });
    await region.hover();
    const more = structure.getByRole("button", { name: "内容区域 2区域操作", exact: true });
    await more.click();
    const hide = page.getByRole("menuitem", { name: "全局隐藏（所有设备及子内容）", exact: true });
    await expect(hide).toHaveAttribute("title", /影响所有设备.*内部内容一起不可见/);
    await hide.click();
    expect((await readSession(page)).definition!.nodes[regionId].hidden).toBe(true);
    await structure.getByRole("treeitem", { name: /^内容区域 2/ }).hover();
    await more.click();
    const show = page.getByRole("menuitem", { name: "取消全局隐藏（所有设备）", exact: true });
    await expect(show).toHaveAttribute("title", /不保证立即可见/);
    await show.click();
    const after = await readSession(page);
    expect(after.definition!.nodes[regionId].hidden).toBe(false);
    expect(after.definition!.nodes[regionId].responsive).toEqual(before.definition!.nodes[regionId].responsive);
    expect(after.definition!.nodes[regionId].childIds).toEqual(before.definition!.nodes[regionId].childIds);
    expect(server.writes).toEqual([]);
  });

  base("平板隐藏问题定位真实上级，修复保留排列和手机独立隐藏", async ({ page }) => {
    const server = await installNewTemplateServer(page);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await createBlankTemplate(page);
    await addTwoRegions(page);
    const regionId = await page.evaluate(async () => {
      const api = await import(/* @vite-ignore */ "/src/page-builder/template-definition/index.ts");
      const { useTemplateEditorSession } = await import(
        /* @vite-ignore */ "/src/page-builder/template-editor/templateEditorSession.ts"
      );
      const state = useTemplateEditorSession.getState();
      const current = state.draft!.definition;
      const parentId = current.nodes[current.rootNodeId].childIds[1];
      const added = api.addDynamicTemplateNode(current, parentId, "TextSlot");
      const next = added.definition;
      next.slots[added.slotId!].required = true;
      next.slots[added.slotId!].hideable = false;
      next.nodes[parentId].responsive.desktop.display = "flex";
      next.nodes[parentId].responsive.tablet = { hidden: true, display: "none" };
      next.nodes[parentId].responsive.mobile.hidden = true;
      state.setDynamicDefinition(next);
      return parentId;
    });
    const before = await readSession(page);
    const issue = structurePanel(page).getByRole("listitem").filter({ hasText: /在平板不可见.*上级/ });
    await issue.getByRole("button", { name: "定位", exact: true }).click();
    const breakpoint = await page.evaluate(async () => {
      const { useTemplateEditorSession } = await import(
        /* @vite-ignore */ "/src/page-builder/template-editor/templateEditorSession.ts"
      );
      return useTemplateEditorSession.getState().breakpoint;
    });
    expect(breakpoint).toBe("tablet");
    expect((await readSession(page)).selectedObjectId).toBe(regionId);
    await issue.getByRole("button", { name: "修复", exact: true }).click();
    const after = await readSession(page);
    expect(after.definition!.nodes[regionId].responsive.tablet).toMatchObject({ hidden: false, display: "flex" });
    expect(after.definition!.nodes[regionId].responsive.mobile).toEqual(before.definition!.nodes[regionId].responsive.mobile);
    await expect(issue).toHaveCount(0);
    await expect(structurePanel(page).getByRole("listitem").filter({ hasText: /在手机不可见.*上级/ })).toHaveCount(1);
    expect(after.historyPast).toHaveLength(before.historyPast.length + 1);
    expect(server.writes).toEqual([]);
  });
});

type KeyboardFixtures = {
  requestMonitor: {
    armed: boolean;
    draftReads: string[];
    expectedDraftRead: string;
    validationRequests: number;
    unsafeRequests: string[];
  };
};

function json(data: unknown, status = 200, message = "success") {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify({ code: status, data, message }),
  };
}

function makePageDraft() {
  return {
    id: 9831,
    pageKey: "home",
    puckData: {
      content: [{
        type: "首屏主视觉",
        props: {
          id: "td3c-keyboard-hero",
          desktopImage: "",
          mobileImage: "",
          altText: "",
          eyebrow: "KEYBOARD CONTRACT",
          title: "结构树键盘验收",
          subtitle: "确定性 Mock 页面内容",
          actionText: "查看作品",
          targetType: "page",
          linkUrl: "/products",
        },
      }],
      zones: {},
      root: { props: {} },
    },
    metadata: {},
    editorVersion: "0.22.4",
    status: "DRAFT",
    version: 0,
    publishedAt: null,
    publishedBy: null,
    updatedAt: "2026-09-08T00:00:00.000Z",
  };
}

function makeDeepTemplateCatalogItem(): TemplateCatalogItemResource {
  let definition = createNewDynamicTemplateDraft("键盘深层树").definition;
  const region = addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
  definition = region.definition;
  definition.nodes[region.nodeId].name = "键盘深层区域";
  const stack = addDynamicTemplateNode(definition, region.nodeId, "Stack");
  definition = stack.definition;
  definition.nodes[stack.nodeId].name = "深层内容组";
  const image = addDynamicTemplateNode(definition, stack.nodeId, "ImageSlot");
  definition = image.definition;
  definition.nodes[image.nodeId].name = "深层主图";
  const text = addDynamicTemplateNode(definition, stack.nodeId, "TextSlot");
  definition = text.definition;
  definition.nodes[text.nodeId].name = "隐藏说明";
  definition.nodes[text.nodeId].hidden = true;
  const action = addDynamicTemplateNode(definition, region.nodeId, "ButtonSlot");
  definition = action.definition;
  definition.nodes[action.nodeId].name = "末尾行动";
  const now = "2026-09-08T00:00:00.000Z";
  return {
    kind: "editable",
    template: {
      id: 9832,
      templateId: definition.templateId,
      ownerId: 1,
      sourceType: "CUSTOM",
      visibility: "STAFF",
      status: "ACTIVE",
      name: definition.name,
      category: "测试",
      purpose: "结构树键盘与焦点",
      layoutType: "flow",
      description: "只用于确定性 Mock Chromium 键盘验收",
      slotSummary: "图片、隐藏文字、行动",
      recommendedFor: [],
      tags: ["td3c", "keyboard"],
      definitionSchemaVersion: definition.schemaVersion,
      publishedVersion: 0,
      sourceReference: null,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
      draft: {
        id: 9833,
        baseVersion: null,
        revision: 1,
        definition,
        definitionChecksum: DEEP_TEMPLATE_CHECKSUM,
        versionNote: null,
        updatedAt: now,
      },
    },
  };
}

async function installMockEditorApis(
  page: Page,
  requestMonitor: KeyboardFixtures["requestMonitor"],
) {
  const draft = makePageDraft();
  const deepTemplate = makeDeepTemplateCatalogItem();
  const deepTemplateId = deepTemplate.template.templateId;
  requestMonitor.expectedDraftRead = `GET /api/page-modules/dynamic-templates/${deepTemplateId}/draft`;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const method = request.method();
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/auth/profile") return route.fallback();
    if (requestMonitor.armed && unsafeMethods.has(method)) {
      requestMonitor.unsafeRequests.push(`${method} ${pathname}`);
    }
    // 页面装修首次加载会延迟调用纯校验端点；初始校验完成并挂载结构树后才开始监控，
    // 因而后续导航若意外再次触发该端点，仍会被上面的监听记录为违规请求。
    if (pathname.includes("/page-modules/document/validate")) {
      await route.fulfill(json({ valid: true, errors: [], issues: [] }));
      requestMonitor.validationRequests += 1;
      return;
    }
    if (unsafeMethods.has(method)) {
      return route.fulfill({ status: 409, contentType: "application/json", body: "{}" });
    }
    if (pathname === "/api/page-modules/dynamic-templates/catalog") {
      const catalog = systemTemplateCatalog();
      return route.fulfill(json({ ...catalog, items: [deepTemplate, ...catalog.items] }));
    }
    const draftMatch = pathname.match(/^\/api\/page-modules\/dynamic-templates\/([^/]+)\/draft$/);
    if (draftMatch && method === "GET") {
      const requestedTemplateId = decodeURIComponent(draftMatch[1]);
      requestMonitor.draftReads.push(`${method} ${pathname}`);
      if (requestedTemplateId === deepTemplateId) {
        return route.fulfill(json(structuredClone(deepTemplate.template)));
      }
      return route.fulfill(json(null, 404, "template draft not found"));
    }
    if (pathname.includes("/page-modules/document/revisions")) return route.fulfill(json([]));
    if (pathname.includes("/page-modules/document/published")) return route.fulfill(json(null));
    if (pathname.includes("/page-modules/document/admin")) return route.fulfill(json(draft));
    if (pathname.includes("/products/admin/resolve-references")) return route.fulfill(json([]));
    if (pathname.includes("/categories/admin/tree")) return route.fulfill(json([]));
    if (pathname.includes("/categories/admin/resolve-references")) return route.fulfill(json([]));
    if (pathname.includes("/page-modules/dynamic-templates")) {
      return route.fulfill(json(null, 404, "unexpected dynamic template request"));
    }
    return route.fulfill(json({}));
  });
  await installAdminSession(page, {
    username: "td3c-keyboard-qa",
    realName: "结构树键盘 QA",
  });
}

const test = base.extend<KeyboardFixtures>({
  requestMonitor: [async ({ page }, use, testInfo) => {
    const requestMonitor = {
      armed: false,
      draftReads: [] as string[],
      expectedDraftRead: "",
      validationRequests: 0,
      unsafeRequests: [] as string[],
    };
    await installMockEditorApis(page, requestMonitor);
    await use(requestMonitor);
    await testInfo.attach("structure-keyboard-unsafe-requests", {
      body: JSON.stringify(requestMonitor.unsafeRequests, null, 2),
      contentType: "application/json",
    });
    expect(requestMonitor.unsafeRequests, "结构树键盘导航与选择不得发送写请求").toEqual([]);
  }, { auto: true }],
});

async function openTemplateStructure(
  page: Page,
  requestMonitor: KeyboardFixtures["requestMonitor"],
  viewport = { width: 1600, height: 1000 },
) {
  await page.setViewportSize(viewport);
  await page.goto("/admin/editor/home");
  await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
  // development 页面首次加载必经 650ms 防抖校验；先等初始化收尾，避免把它计入键盘行为。
  await expect.poll(() => requestMonitor.validationRequests).toBeGreaterThanOrEqual(1);
  await page.getByRole("button", { name: "模板设计", exact: true }).click();
  await expect(page.getByRole("group", { name: "店铺装修工作模式切换" }))
    .toHaveAttribute("data-active-mode", "template");
  await expect(page.locator(".template-editor__toolbar")).toBeVisible();
  await expect(page.locator('.template-editor__toolbar [role="status"]'))
    .toHaveAttribute("aria-label", "模板状态：未选择模板");
  expect(requestMonitor.draftReads, "首次进入模板工作区只显示目录，不得自动读取历史模板草稿").toEqual([]);
  if (viewport.width < 1200) {
    const expandLibrary = page.getByRole("button", { name: "展开模板组件库" });
    await expect(expandLibrary).toBeVisible();
    await expandLibrary.focus();
    await page.keyboard.press("Enter");
    // 面板在下一帧接管焦点；先观察接管完成，避免 Enter 落在关闭入口。
    await expect(page.getByRole("button", { name: "收起模板组件库", exact: true })).toBeFocused();
  }
  const openTemplate = page.getByRole("button", { name: /^打开键盘深层树模板/ });
  await expect(openTemplate).toBeVisible();
  await openTemplate.focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => requestMonitor.draftReads).toEqual([
    requestMonitor.expectedDraftRead,
  ]);
  await expect(page.locator('.template-editor__toolbar [role="status"]'))
    .toHaveAttribute("aria-label", "模板状态：服务端草稿已保存");
  // 等待会话 owner 切换及面板焦点 effect 提交，再打开窄端结构面板。
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));

  if (viewport.width < 1200) {
    const expand = page.getByRole("button", { name: "展开模板结构面板" });
    await expect(expand).toBeVisible();
    await expand.focus();
    await page.keyboard.press("Enter");
  }

  const structure = viewport.width < 1200
    ? page.getByRole("dialog", { name: "模板结构", exact: true })
    : page.getByRole("complementary", { name: "模板结构", exact: true });
  const tree = structure.getByRole("tree", { name: "模板区域与槽位" });
  await expect(structure).toBeVisible();
  await expect(tree).toBeVisible();
  const items = tree.getByRole("treeitem");
  await expect(items.nth(3), "深层模板至少提供区域、容器与两个槽位").toBeVisible();
  requestMonitor.unsafeRequests.length = 0;
  requestMonitor.armed = true;
  return { structure, tree, items };
}

async function selectionSnapshot(page: Page) {
  return page.getByRole("tree", { name: "模板区域与槽位" })
    .getByRole("treeitem")
    .evaluateAll((items) => items.map((item) => item.getAttribute("aria-selected")));
}

async function editorStateSnapshot(page: Page) {
  return {
    status: await page.locator('.template-editor__toolbar [role="status"]').getAttribute("aria-label"),
    undoDisabled: await page.getByRole("button", { name: "撤销", exact: true }).isDisabled(),
    redoDisabled: await page.getByRole("button", { name: "重做", exact: true }).isDisabled(),
  };
}

test.describe("TD-3C1 模板结构树键盘合同（真实前端 + Mock API）", () => {
  test.skip(appMode === "mock", "本资产必须在 development app mode 下仅拦截自有 API");

  test("生产结构树暴露 tree/treeitem、层级和可选择语义", async ({ page, requestMonitor }) => {
    const { structure, items } = await openTemplateStructure(page, requestMonitor);
    const levels = await items.evaluateAll((nodes) => nodes.map((node) => Number(node.getAttribute("aria-level"))));
    expect(levels.every((level) => Number.isInteger(level) && level >= 2)).toBe(true);
    expect(Math.max(...levels), "至少包含区域、嵌套容器与槽位层级").toBeGreaterThanOrEqual(4);
    await expect(items.filter({ has: page.getByText("隐藏说明", { exact: true }) })).toHaveCount(1);
    expect(await items.evaluateAll((nodes) => nodes.every((node) => /^(true|false)$/.test(node.getAttribute("aria-selected") ?? ""))))
      .toBe(true);
    const workspace = page.locator(".template-editor__body");
    const complementaries = workspace.getByRole("complementary");
    await expect(complementaries).toHaveCount(3);
    expect(await complementaries.evaluateAll((nodes) => (
      nodes.map((node) => node.getAttribute("aria-label")).sort()
    ))).toEqual(["模板属性", "模板组件库", "模板结构"]);
    await expect(workspace.getByRole("region", { name: /模板设计画布/ })).toHaveCount(1);
    const accessibility = await new AxeBuilder({ page })
      .include(".template-editor__body")
      .withRules(["aria-required-children", "aria-required-parent", "landmark-complementary-is-top-level"])
      .analyze();
    expect(accessibility.violations, "完整模板工作区不得包含 required parent/children 或嵌套地标错误").toEqual([]);
    expect(await structure.locator(".template-editor__region-list li").evaluateAll((nodes) => nodes.every((node) => node.getAttribute("role") === "none")))
      .toBe(true);
  });

  test("树容器左右键收放保留焦点、选择和草稿，鼠标指示区共用相同状态", async ({ page, requestMonitor }, testInfo) => {
    const { tree } = await openTemplateStructure(page, requestMonitor);
    const region = tree.getByRole("treeitem", { name: "键盘深层区域", exact: true });
    const layout = tree.getByRole("treeitem", { name: /深层内容组 布局容器/ });
    const beforeState = await editorStateSnapshot(page);
    const beforeSelection = await selectionSnapshot(page);
    for (const container of [layout, region]) {
      await container.focus();
      const expandedCount = await tree.getByRole("treeitem").count();
      await page.keyboard.press("ArrowLeft");
      await expect(container).toHaveAttribute("aria-expanded", "false");
      await expect(container).toBeFocused();
      expect(await tree.getByRole("treeitem").count()).toBeLessThan(expandedCount);
      await page.keyboard.press("ArrowRight");
      await expect(container).toHaveAttribute("aria-expanded", "true");
      await expect(container).toBeFocused();
      await expect(tree.getByRole("treeitem")).toHaveCount(expandedCount);
      await container.locator(".template-editor__tree-toggle").click();
      await expect(container).toHaveAttribute("aria-expanded", "false");
      await expect(container).toBeFocused();
      await page.keyboard.press("ArrowRight");
      await expect(container).toHaveAttribute("aria-expanded", "true");
    }
    expect(await editorStateSnapshot(page)).toEqual(beforeState);
    expect(await selectionSnapshot(page)).toEqual(beforeSelection);
    await expect(tree.locator('button.template-editor__tree-toggle')).toHaveCount(0);
    await page.keyboard.press("Tab");
    const regionActions = tree.getByRole("button", { name: "键盘深层区域区域操作", exact: true });
    await expect(regionActions).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menuitem", { name: "重命名区域", exact: true })).toBeVisible();
    await regionActions.press("Enter");
    await expect(page.getByRole("menuitem", { name: "重命名区域", exact: true })).toBeHidden();
    await expect(regionActions).toBeFocused();
    await region.focus();
    await page.screenshot({ path: testInfo.outputPath("tree-row-actions-1600.png"), fullPage: false });
    const results = await new AxeBuilder({ page }).include('.template-editor__region-list')
      .withRules(["aria-required-children", "aria-required-parent"]).analyze();
    expect(results.violations).toEqual([]);
  });

  test("树内更多菜单复制后保留副本选择，撤销恢复结构而不被父行点击覆盖", async ({ page, requestMonitor }) => {
    const { tree } = await openTemplateStructure(page, requestMonitor);
    const layout = tree.getByRole("treeitem", { name: /深层内容组 布局容器/ });
    const sourceId = await layout.getAttribute("data-selection-target-id");
    const beforeCount = await tree.getByRole("treeitem").count();
    await layout.focus();
    await page.keyboard.press("Tab");
    await expect(layout.getByRole("button", { name: "深层内容组容器操作", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await page.getByRole("menuitem", { name: "复制容器", exact: true }).click();
    const selected = tree.getByRole("treeitem", { selected: true });
    await expect(selected).toHaveCount(1);
    await expect(selected).not.toHaveAttribute("data-selection-target-id", sourceId!);
    expect(await tree.getByRole("treeitem").count()).toBeGreaterThan(beforeCount);
    await page.getByRole("button", { name: "撤销", exact: true }).click();
    await expect(tree.getByRole("treeitem")).toHaveCount(beforeCount);
    await expect(page.getByRole("button", { name: "撤销", exact: true })).toBeDisabled();
  });

  test("窄端模板属性保持模态 dialog，内部属性区不产生嵌套地标错误", async ({ page, requestMonitor }) => {
    const { structure } = await openTemplateStructure(
      page,
      requestMonitor,
      { width: 1024, height: 768 },
    );
    await structure.getByRole("button", { name: "收起模板结构面板", exact: true }).click();
    const trigger = page.getByRole("button", { name: "展开模板属性面板", exact: true });
    await trigger.focus();
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("dialog", { name: "模板属性工作区", exact: true });
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(dialog.getByRole("complementary", { name: "模板属性", exact: true })).toBeVisible();
    const accessibility = await new AxeBuilder({ page })
      .include(".template-editor__right-workspace")
      .withRules(["landmark-complementary-is-top-level"])
      .analyze();
    expect(accessibility.violations, "窄端 dialog 内部属性区不得产生嵌套地标错误").toEqual([]);
  });

  test("初始仅一个 treeitem 可 Tab，其余使用 roving tabindex=-1", async ({ page, requestMonitor }) => {
    const { items } = await openTemplateStructure(page, requestMonitor);
    const tabIndexes = await items.evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).tabIndex));
    expect(tabIndexes.filter((value) => value === 0), "结构树必须只有一个 roving Tab 入口").toHaveLength(1);
    expect(tabIndexes.filter((value) => value === -1), "其余结构项必须退出页面 Tab 顺序")
      .toHaveLength(tabIndexes.length - 1);
  });

  test("模板整体入口可由键盘选择且不改变历史或草稿状态", async ({ page, requestMonitor }) => {
    const { structure, tree, items } = await openTemplateStructure(page, requestMonitor);
    const beforeState = await editorStateSnapshot(page);
    const root = structure.getByRole("button", { name: "模板整体", exact: true });
    await expect(root).toBeVisible();
    await expect(tree.getByRole("button", { name: "模板整体", exact: true })).toHaveCount(0);
    await items.nth(1).focus();
    await page.keyboard.press("Enter");
    await expect(root).toHaveAttribute("aria-pressed", "false");
    await root.focus();
    await page.keyboard.press("Enter");
    await expect(root).toHaveAttribute("aria-pressed", "true");
    await expect(root).toBeFocused();
    expect(await selectionSnapshot(page)).toEqual(Array(await items.count()).fill("false"));
    expect(await editorStateSnapshot(page)).toEqual(beforeState);
    await items.nth(2).focus();
    await page.keyboard.press("Space");
    await expect(root).toHaveAttribute("aria-pressed", "false");
    await root.focus();
    await page.keyboard.press("Space");
    await expect(root).toHaveAttribute("aria-pressed", "true");
    expect(await editorStateSnapshot(page)).toEqual(beforeState);
    expect(await items.evaluateAll((nodes) => nodes.filter((node) => (node as HTMLElement).tabIndex === 0).length))
      .toBe(1);
  });

  for (const viewportWidth of [1200, 1600]) {
    test(`${viewportWidth}px 窄结构栏仍以缩进区分父级布局和内部槽位`, async ({ page, requestMonitor }) => {
      const { structure, tree } = await openTemplateStructure(page, requestMonitor, { width: viewportWidth, height: 1000 });
      const bounds = await structure.boundingBox();
      expect(bounds?.width, "覆盖触发窄栏容器查询的实际结构面板").toBeLessThanOrEqual(176);
      const layout = tree.getByRole("treeitem", { name: /深层内容组 布局容器/ });
      const image = tree.getByRole("treeitem").filter({ has: page.getByText("深层主图", { exact: true }) });
      const layoutInset = await layout.evaluate((node) => parseFloat(getComputedStyle(node).paddingLeft));
      const imageInset = await image.evaluate((node) => parseFloat(getComputedStyle(node).paddingLeft));
      expect(imageInset - layoutInset, "槽位必须比父级布局更深，不能在窄栏统一为相同缩进").toBeGreaterThanOrEqual(8);
      await expect(image).toBeVisible();
    });
  }

  test("ArrowDown 只把焦点移到下一可见项，不改变选择、history 或 dirty", async ({ page, requestMonitor }) => {
    const { items } = await openTemplateStructure(page, requestMonitor);
    const beforeSelection = await selectionSnapshot(page);
    const beforeState = await editorStateSnapshot(page);
    await items.nth(0).focus();
    await page.keyboard.press("ArrowDown");
    expect(await selectionSnapshot(page)).toEqual(beforeSelection);
    expect(await editorStateSnapshot(page)).toEqual(beforeState);
    await expect(items.nth(1), "ArrowDown 应移动 DOM 焦点").toBeFocused();
  });

  test("ArrowUp 只把焦点移到上一可见项，不改变选择、history 或 dirty", async ({ page, requestMonitor }) => {
    const { items } = await openTemplateStructure(page, requestMonitor);
    const beforeSelection = await selectionSnapshot(page);
    const beforeState = await editorStateSnapshot(page);
    await items.nth(2).focus();
    await page.keyboard.press("ArrowUp");
    expect(await selectionSnapshot(page)).toEqual(beforeSelection);
    expect(await editorStateSnapshot(page)).toEqual(beforeState);
    await expect(items.nth(1), "ArrowUp 应移动 DOM 焦点").toBeFocused();
  });

  test("Home 把焦点移到首项，不激活选择", async ({ page, requestMonitor }) => {
    const { items } = await openTemplateStructure(page, requestMonitor);
    const beforeSelection = await selectionSnapshot(page);
    const beforeState = await editorStateSnapshot(page);
    await items.nth(2).focus();
    await page.keyboard.press("Home");
    expect(await selectionSnapshot(page)).toEqual(beforeSelection);
    expect(await editorStateSnapshot(page)).toEqual(beforeState);
    await expect(items.first(), "Home 应聚焦首个可见结构项").toBeFocused();
  });

  test("End 把焦点移到末项，不激活选择", async ({ page, requestMonitor }) => {
    const { items } = await openTemplateStructure(page, requestMonitor);
    const beforeSelection = await selectionSnapshot(page);
    const beforeState = await editorStateSnapshot(page);
    await items.nth(1).focus();
    await page.keyboard.press("End");
    expect(await selectionSnapshot(page)).toEqual(beforeSelection);
    expect(await editorStateSnapshot(page)).toEqual(beforeState);
    await expect(items.last(), "End 应聚焦末个可见结构项").toBeFocused();
  });

  test("Enter 与 Space 使用同一选择语义并保持零 history、零 dirty", async ({ page, requestMonitor }) => {
    const { items } = await openTemplateStructure(page, requestMonitor);
    const beforeState = await editorStateSnapshot(page);
    await items.nth(1).focus();
    await page.keyboard.press("Enter");
    await expect(items.nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(items.nth(1)).toBeFocused();
    expect(await editorStateSnapshot(page)).toEqual(beforeState);

    await items.nth(2).focus();
    await page.keyboard.press("Space");
    await expect(items.nth(2)).toHaveAttribute("aria-selected", "true");
    await expect(items.nth(1)).toHaveAttribute("aria-selected", "false");
    await expect(items.nth(2)).toBeFocused();
    expect(await editorStateSnapshot(page)).toEqual(beforeState);
  });

  test("嵌套分组操作禁用时直接说明不可用原因", async ({ page, requestMonitor }) => {
    const { structure, tree } = await openTemplateStructure(page, requestMonitor);
    const layout = tree.getByRole("treeitem", { name: /深层内容组 布局容器/ });
    const layoutId = await layout.getAttribute("data-selection-target-id");
    expect(layoutId).toBeTruthy();
    await page.evaluate(async (nodeId) => {
      const api = await import(/* @vite-ignore */ "/src/page-builder/template-definition/index.ts");
      const { useTemplateEditorSession } = await import(
        /* @vite-ignore */ "/src/page-builder/template-editor/templateEditorSession.ts"
      );
      const state = useTemplateEditorSession.getState();
      state.setDynamicDefinition(api.setDynamicTemplateNodeStructureLocked(
        state.draft!.definition,
        nodeId!,
        true,
      ));
    }, layoutId);
    const layoutRow = layout.locator("..");
    await layoutRow.hover();
    await layoutRow.locator(".template-editor__structure-more").click();
    await page.getByRole("menuitem", { name: /^排列与分组/ }).hover();
    const disabledGrouping = page.getByRole("menuitem", {
      name: /组合为上下布局组（不可用：当前对象已锁定）/,
    }).first();
    await expect(disabledGrouping).toBeVisible();
    await expect(disabledGrouping).toHaveAttribute("aria-disabled", "true");
    await expect(disabledGrouping).toHaveAttribute("title", "当前对象已锁定");
  });

  test("390x844 折叠结构面板由键盘打开后接管焦点", async ({ page, requestMonitor }) => {
    const { structure } = await openTemplateStructure(page, requestMonitor, { width: 390, height: 844 });
    const close = structure.getByRole("button", { name: "收起模板结构面板" });
    await expect(close).toBeVisible();
    await expect(close, "临时结构面板打开后焦点应进入关闭入口").toBeFocused();
  });

  test("390x844 面板重建后 Escape 关闭并把焦点退回唯一展开入口", async ({ page, requestMonitor }) => {
    const { items } = await openTemplateStructure(page, requestMonitor, { width: 390, height: 844 });
    await items.nth(1).focus();
    await page.keyboard.press("Escape");
    const expand = page.getByRole("button", { name: "展开模板结构面板" });
    await expect(expand).toBeVisible();
    await expect(expand, "隐藏旧 treeitem 不得保留焦点，焦点应回到展开入口").toBeFocused();
  });
});
