import { expect, test, type Page, type Route } from "@playwright/test";

import type { TemplateDefinitionV2 } from "../src/page-builder/template-definition";
import { installAdminSession } from "./fixtures/session-auth";
import { createBlankTemplate, applyBasicSkeleton, productionStageAction, completeProductionReviews as reviewTemplateForPublish } from "./fixtures/template-authoring-main-route";

const NOW = "2026-09-10T10:00:00.000Z";
const CHECKSUM = "d".repeat(64);

const observerDiagnostics = new WeakMap<Page, { errors: string[]; traces: unknown[] }>();
test.beforeEach(async ({ page }) => {
  const diagnostics = { errors: [] as string[], traces: [] as unknown[] };
  observerDiagnostics.set(page, diagnostics);
  page.on("pageerror", (error) => diagnostics.errors.push(error.message));
  await page.exposeFunction("__recordTemplateObserverTrace", (trace: unknown) => {
    diagnostics.traces.push(trace);
  });
  // 只监听原生错误，不包装 ResizeObserver，不改变浏览器交付时序。
  await page.addInitScript(() => {
    const errors: unknown[] = [];
    (window as unknown as { __templateObserverDiagnostic: unknown }).__templateObserverDiagnostic = { errors };
    window.addEventListener("error", (event) => {
      if (!event.message.includes("ResizeObserver loop")) return;
      const report = (window as unknown as {
        __recordTemplateObserverTrace: (trace: unknown) => Promise<void>;
      }).__recordTemplateObserverTrace;
      const trace = { pathname: location.pathname, message: event.message };
      errors.push(trace);
      void report(trace);
    });
  });
});
test.afterEach(async ({ page }, testInfo) => {
  const diagnostics = observerDiagnostics.get(page)!;
  // 最后一步允许公开链接导航；先保全已接收异常，再记录仍存活 frame 的只读快照。
  if (diagnostics.traces.length) await testInfo.attach("resize-observer-diagnostics-before-close", {
    body: JSON.stringify(diagnostics.traces, null, 2), contentType: "application/json",
  });
  const frames = page.frames();
  const snapshots = await Promise.allSettled(frames.map((frame) => new Promise<{ errors: unknown[] } | null>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("导航期间的 frame 诊断读取超过 1000ms，已保全主错误记录")), 1000);
    void frame.evaluate(async () => {
      // 让最后一个布局动作的原生通知完成两轮交付，再关闭本测试页面。
      await new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));
      return (window as unknown as {
        __templateObserverDiagnostic?: { errors: unknown[] };
      }).__templateObserverDiagnostic ?? null;
    }).then(resolve, reject).finally(() => clearTimeout(timeout));
  })));
  const frameDiagnostics = snapshots.map((result, index) => ({
    url: frames[index].url(),
    snapshot: result.status === "fulfilled" ? result.value : null,
    readFailure: result.status === "rejected" ? String(result.reason) : null,
  }));
  await testInfo.attach("resize-observer-frame-diagnostics", {
    body: JSON.stringify(frameDiagnostics, null, 2), contentType: "application/json",
  });
  if (!page.isClosed()) await page.close();
  if (diagnostics.traces.length) await testInfo.attach("resize-observer-diagnostics", {
    body: JSON.stringify(diagnostics.traces, null, 2), contentType: "application/json",
  });
  expect(diagnostics.errors, "试排完整链路不得产生浏览器 pageerror，包括 ResizeObserver 通知异常").toHaveLength(0);
  expect(diagnostics.traces, "原生 RO ErrorEvent 不保证带有 error，也必须直接检查记录").toHaveLength(0);
  expect(frameDiagnostics.flatMap((frame) => frame.snapshot?.errors ?? []), "各 iframe 本地错误缓存必须为空").toHaveLength(0);
});

type RecordedWrite = { method: string; path: string; body: Record<string, unknown> };
type MockState = {
  published: Record<string, any> | null;
  resource: Record<string, any> | null;
  writes: RecordedWrite[];
  unexpectedWrites: RecordedWrite[];
};

function json(data: unknown, status = 200) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify({ code: status, data, message: status < 400 ? "success" : "failure" }),
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

function makeResource(
  definition: TemplateDefinitionV2,
  revision: number,
  publishedVersion = 0,
) {
  return {
    id: 9902,
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
      id: 9903,
      baseVersion: publishedVersion || null,
      revision,
      definition: structuredClone(definition),
      definitionChecksum: CHECKSUM,
      versionNote: null,
      updatedAt: NOW,
    },
  };
}

async function installTrialContentServer(page: Page) {
  const state: MockState = { published: null, resource: null, writes: [], unexpectedWrites: [] };
  await page.route("**/api/**", async (route: Route) => {
    const request = route.request();
    const method = request.method();
    const path = new URL(request.url()).pathname;
    const body = request.postDataJSON?.() as Record<string, unknown> | null;
    if (path === "/api/auth/profile") return route.fallback();
    if (path === "/api/page-modules/dynamic-templates/catalog" && method === "GET") {
      return route.fulfill(json({
        source: "unified",
        items: [
          ...(state.resource ? [{ kind: "editable", template: state.resource }] : []),
          ...(state.published ? [{ kind: "published", template: state.published }] : []),
        ],
      }));
    }
    if (path === "/api/page-modules/dynamic-templates" && method === "POST") {
      const write = { method, path, body: body ?? {} };
      state.writes.push(write);
      const definition = write.body.definition as TemplateDefinitionV2;
      state.resource = makeResource(definition, 1);
      return route.fulfill(json(state.resource));
    }
    const draftMatch = path.match(/^\/api\/page-modules\/dynamic-templates\/([^/]+)\/draft$/);
    if (draftMatch && method === "GET") return route.fulfill(json(state.resource));
    if (draftMatch && method === "PATCH" && state.resource) {
      const write = { method, path, body: body ?? {} };
      state.writes.push(write);
      const definition = write.body.definition as TemplateDefinitionV2;
      state.resource = makeResource(definition, Number(state.resource.draft.revision) + 1, state.resource.publishedVersion);
      return route.fulfill(json(state.resource));
    }
    const publishMatch = path.match(/^\/api\/page-modules\/dynamic-templates\/([^/]+)\/publish$/);
    if (publishMatch && method === "POST" && state.resource) {
      const write = { method, path, body: body ?? {} };
      state.writes.push(write);
      const definition = structuredClone(state.resource.draft.definition) as TemplateDefinitionV2;
      const targetVersion = state.resource.publishedVersion + 1;
      state.published = {
        templateId: definition.templateId,
        sourceReference: null,
        name: definition.name,
        category: definition.metadata.category,
        purpose: definition.metadata.purpose,
        layoutType: definition.metadata.layoutType,
        description: definition.description ?? null,
        slotSummary: definition.metadata.slotSummary,
        recommendedFor: [...definition.metadata.recommendedFor],
        tags: [...definition.metadata.tags],
        version: targetVersion,
        schemaVersion: definition.schemaVersion,
        definition,
        definitionChecksum: CHECKSUM,
        versionNote: null,
        publishedAt: NOW,
      };
      state.resource = makeResource(definition, Number(state.resource.draft.revision) + 1, targetVersion);
      return route.fulfill(json({
        templateId: definition.templateId,
        version: targetVersion,
        outcome: "published",
        published: {
          id: 9904,
          dynamicTemplateId: state.resource.id,
          version: targetVersion,
          schemaVersion: definition.schemaVersion,
          definition,
          definitionChecksum: CHECKSUM,
          versionNote: null,
          publishedAt: NOW,
        },
        draft: state.resource.draft,
      }));
    }
    const versionListMatch = path.match(/^\/api\/page-modules\/dynamic-templates\/([^/]+)\/versions$/);
    if (versionListMatch && method === "GET") {
      return route.fulfill(json({
        items: state.resource?.publishedVersion ? [{
          id: 9904,
          dynamicTemplateId: state.resource.id,
          version: state.resource.publishedVersion,
          schemaVersion: state.resource.definitionSchemaVersion,
          definitionChecksum: CHECKSUM,
          versionNote: null,
          publishedAt: NOW,
        }] : [],
        nextBeforeVersion: null,
      }));
    }
    if (path.endsWith("/page-modules/document/validate")) {
      return route.fulfill(json({ valid: true, errors: [], issues: [] }));
    }
    if (path.includes("/page-modules/document/revisions")) return route.fulfill(json([]));
    if (path.includes("/page-modules/document/published")) return route.fulfill(json(null));
    if (path.includes("/page-modules/document/admin")) return route.fulfill(json(pageDraft()));
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      const write = { method, path, body: body ?? {} };
      state.unexpectedWrites.push(write);
      return route.fulfill(json(null, 409));
    }
    return route.fulfill(json({}));
  });
  await installAdminSession(page, { username: "trial-content", realName: "试排内容验收" });
  return state;
}

async function readEditorFacts(page: Page) {
  return page.evaluate(async () => {
    const sessionModule = "/src/page-builder/template-editor/templateEditorSession.ts";
    const trialModule = "/src/page-builder/template-editor/templateTrialContentSession.ts";
    const [{ useTemplateEditorSession }, { useTemplateTrialContentSession }] = await Promise.all([
      import(/* @vite-ignore */ sessionModule),
      import(/* @vite-ignore */ trialModule),
    ]);
    const session = useTemplateEditorSession.getState();
    const trial = useTemplateTrialContentSession.getState();
    return {
      definition: structuredClone(session.draft?.definition ?? null),
      dirty: session.dirty,
      historyPast: structuredClone(session.historyPast),
      historyFuture: structuredClone(session.historyFuture),
      remote: structuredClone(session.draft?.remote ?? null),
      sessionId: session.sessionId,
      trialSessionId: trial.sessionId,
      trialContentBySlotId: structuredClone(trial.contentBySlotId),
    };
  });
}

async function openBlankTemplate(page: Page) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await createBlankTemplate(page);
  await (await productionStageAction(page, "交付信息")).click();
  await page.getByRole("textbox", { name: "模板名称", exact: true }).fill("会话试排内容模板");
  await page.getByRole("textbox", { name: "模板名称", exact: true }).press("Tab");
  await (await productionStageAction(page, "交付信息")).click();
  await page.getByLabel("用途", { exact: true }).fill("检查图片与文案构图");
  await page.getByLabel("用途", { exact: true }).press("Tab");
  await page.getByRole("button", { name: "预览模板", exact: true }).focus();
  await applyBasicSkeleton(page);
}

async function addTextualTrialSlots(page: Page, textGroupId: string) {
  const tree = page.getByRole("tree", { name: "模板区域与槽位" });
  await tree.locator(`[role="treeitem"][data-selection-target-id="${textGroupId}"]`).click();
  await page.getByRole("complementary", { name: "模板结构", exact: true })
    .getByRole("button", { name: "添加槽位", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "添加槽位", exact: true });
  await dialog.getByRole("button", { name: "添加按钮槽位", exact: true }).click();
  await dialog.getByRole("button", { name: "添加富文本槽位", exact: true }).click();
  await dialog.getByRole("button", { name: "添加链接槽位", exact: true }).click();
  await page.keyboard.press("Escape");
}

async function selectNode(page: Page, nodeId: string) {
  const enterPreview = page.getByRole("button", { name: "预览模板", exact: true });
  if (await enterPreview.isVisible()) await enterPreview.click();
  const objects = page.getByRole("combobox", { name: "试排对象", exact: true });
  if (!await objects.isVisible()) await page.getByText("自定义试排内容", { exact: true }).click();
  await objects.selectOption(nodeId);
  await expect(page.getByRole("region", { name: "试排内容（仅本次编辑）" })).toBeVisible();
}

async function selectEditorNode(page: Page, nodeId: string) {
  await page.getByRole("tree", { name: "模板区域与槽位" })
    .locator(`[role="treeitem"][data-selection-target-id="${nodeId}"]`).click();
}

async function getFrameNodePageBox(page: Page, nodeId: string) {
  const frame = page.locator("iframe.template-editor__viewport-frame");
  const frameBox = await frame.boundingBox();
  const frameWidth = await frame.evaluate((element) => (element as HTMLIFrameElement).clientWidth);
  const nodeBox = await page.frameLocator("iframe.template-editor__viewport-frame")
    .locator(`[data-template-node-id="${nodeId}"]`)
    .evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
  if (!frameBox || frameWidth <= 0) return null;
  const scale = frameBox.width / frameWidth;
  return {
    x: frameBox.x + nodeBox.x * scale,
    y: frameBox.y + nodeBox.y * scale,
    width: nodeBox.width * scale,
    height: nodeBox.height * scale,
  };
}

async function completeProductionReviews(page: Page) {
  await reviewTemplateForPublish(page);
}

test("试排图片侧栏与画布按当前设备复用 4:3、适配和焦点且不进入模板历史", async ({ page }) => {
  test.setTimeout(90_000);
  const server = await installTrialContentServer(page);
  await openBlankTemplate(page);
  const initial = await readEditorFacts(page);
  if (!initial.definition) throw new Error("骨架建立后缺少模板定义");
  const imageNodes = Object.values(initial.definition.nodes).filter((node) => node.type === "ImageSlot");
  if (imageNodes.length !== 2) throw new Error("4:3 双图文骨架缺少两个图片槽位");

  await page.evaluate(async ({ firstNodeId, secondNodeId }) => {
    const modulePath = "/src/page-builder/template-editor/templateEditorSession.ts";
    const { useTemplateEditorSession } = await import(/* @vite-ignore */ modulePath);
    const result = useTemplateEditorSession.getState().executeCommand({
      type: "update-definition",
      label: "建立双端图片构图验收夹具",
      update: (next: TemplateDefinitionV2) => {
        const firstSlot = next.slots[next.nodes[firstNodeId].slotId!];
        const secondSlot = next.slots[next.nodes[secondNodeId].slotId!];
        Object.assign(firstSlot.desktopRules, { aspectRatio: "4:3", objectFit: "cover", objectPosition: "left top" });
        Object.assign(firstSlot.mobileRules, { aspectRatio: "4:3", objectFit: "contain", objectPosition: "center center" });
        Object.assign(secondSlot.desktopRules, { aspectRatio: "4:3", objectFit: "contain", objectPosition: "center center" });
        Object.assign(secondSlot.mobileRules, { aspectRatio: "4:3", objectFit: "cover", objectPosition: "right bottom" });
      },
    });
    if (!result.ok) throw new Error(result.message);
  }, { firstNodeId: imageNodes[0].nodeId, secondNodeId: imageNodes[1].nodeId });
  const beforeTrial = await readEditorFacts(page);

  const cases = [
    {
      node: imageNodes[0], width: 1600, height: 400,
      desktop: { fit: "cover", position: "0% 0%" },
      mobile: { fit: "contain", position: "50% 50%" },
    },
    {
      node: imageNodes[1], width: 400, height: 1600,
      desktop: { fit: "contain", position: "50% 50%" },
      mobile: { fit: "cover", position: "100% 100%" },
    },
  ] as const;
  const sources: string[] = [];

  for (const [index, entry] of cases.entries()) {
    await selectNode(page, entry.node.nodeId);
    const trial = page.getByRole("region", { name: "试排内容（仅本次编辑）" });
    await trial.locator('input[type="file"]').first().setInputFiles({
      name: `extreme-${index + 1}.svg`,
      mimeType: "image/svg+xml",
      buffer: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${entry.width}" height="${entry.height}"><rect width="100%" height="100%" fill="${index === 0 ? "#d9dde0" : "#899096"}"/></svg>`),
    });
    await expect(trial.locator(`[data-template-trial-image-target="desktop"]`))
      .toHaveText(`目标构图：桌面端 · 4 / 3 · ${entry.desktop.fit}`);
    const sidePreviewFrame = trial.locator(".homepage-editor__media-preview-img");
    const sidePreview = sidePreviewFrame.locator('img[alt="预览"]');
    await expect(sidePreviewFrame).toHaveCSS("aspect-ratio", "4 / 3");
    await expect(sidePreview).toHaveCSS("object-fit", entry.desktop.fit);
    await expect(sidePreview).toHaveCSS("object-position", entry.desktop.position);
    await expect(trial.getByRole("status", { name: "图片信息" }))
      .toContainText(`${entry.width} × ${entry.height}`);
    const canvasImage = page.frameLocator("iframe.template-editor__viewport-frame")
      .locator(`[data-template-node-id="${entry.node.nodeId}"] img`);
    await expect(canvasImage).toHaveCSS("object-fit", entry.desktop.fit);
    await expect(canvasImage).toHaveCSS("object-position", entry.desktop.position);
    sources.push((await canvasImage.getAttribute("src")) ?? "");
  }
  expect(sources[0]).not.toBe(sources[1]);

  await page.locator(".template-editor__toolbar").getByRole("button", { name: /平板端模板布局/ }).click();
  await selectNode(page, cases[0].node.nodeId);
  await expect(page.locator('[data-template-trial-image-target="tablet"]'))
    .toHaveText(`目标构图：平板端 · 4 / 3 · ${cases[0].desktop.fit}`);
  await page.locator(".template-editor__toolbar").getByRole("button", { name: /移动端模板布局/ }).click();
  for (const entry of cases) {
    await selectNode(page, entry.node.nodeId);
    const trial = page.getByRole("region", { name: "试排内容（仅本次编辑）" });
    await expect(trial.locator(`[data-template-trial-image-target="mobile"]`))
      .toHaveText(`目标构图：移动端 · 4 / 3 · ${entry.mobile.fit}`);
    const sidePreview = trial.locator('.homepage-editor__media-preview-img img[alt="预览"]');
    await expect(sidePreview).toHaveCSS("object-fit", entry.mobile.fit);
    await expect(sidePreview).toHaveCSS("object-position", entry.mobile.position);
    const canvasImage = page.frameLocator("iframe.template-editor__viewport-frame")
      .locator(`[data-template-node-id="${entry.node.nodeId}"] img`);
    await expect(canvasImage).toHaveCSS("object-fit", entry.mobile.fit);
    await expect(canvasImage).toHaveCSS("object-position", entry.mobile.position);
  }

  const afterTrial = await readEditorFacts(page);
  expect(afterTrial.definition).toEqual(beforeTrial.definition);
  expect(afterTrial.historyPast).toEqual(beforeTrial.historyPast);
  expect(afterTrial.historyFuture).toEqual(beforeTrial.historyFuture);
  expect(afterTrial.dirty).toBe(beforeTrial.dirty);
  expect(afterTrial.remote).toEqual(beforeTrial.remote);
  expect(server.writes).toEqual([]);
  expect(server.unexpectedWrites).toEqual([]);
});

test("模板试排内容只存在当前会话，并驱动画布与压力预览但不进入保存发布或公开 Renderer", async ({ page }) => {
  test.setTimeout(120_000);
  const server = await installTrialContentServer(page);
  await openBlankTemplate(page);
  let facts = await readEditorFacts(page);
  if (!facts.definition) throw new Error("骨架建立后缺少模板定义");
  const definition = facts.definition as TemplateDefinitionV2;
  const nodes = Object.values(definition.nodes);
  const imageNodes = nodes.filter((node) => node.type === "ImageSlot");
  const headingNode = nodes.find((node) => node.type === "HeadingSlot");
  const textNode = nodes.find((node) => node.type === "TextSlot");
  const textGroup = nodes.find((node) => node.name === "文字组");
  if (imageNodes.length !== 2 || !headingNode || !textNode || !textGroup) {
    throw new Error("4:3 双图文骨架缺少试排验收节点");
  }
  await addTextualTrialSlots(page, textGroup.nodeId);
  facts = await readEditorFacts(page);
  const extendedDefinition = facts.definition as TemplateDefinitionV2;
  const buttonNode = Object.values(extendedDefinition.nodes).find((node) => node.type === "ButtonSlot");
  const richTextNode = Object.values(extendedDefinition.nodes).find((node) => node.type === "RichTextSlot");
  const linkNode = Object.values(extendedDefinition.nodes).find((node) => node.type === "LinkSlot");
  if (!buttonNode || !richTextNode || !linkNode) throw new Error("补充试排槽位失败");
  await page.getByRole("button", { name: "保存模板", exact: true }).click();
  await expect(page.getByText("模板草稿已保存，可继续设计或发布", { exact: true }).last()).toBeVisible();
  if (!server.resource) throw new Error("Route-Mock 未记录试排前的模板基线");
  const beforeTrial = await readEditorFacts(page);

  const imageSources: string[] = [];
  await selectNode(page, headingNode.nodeId);
  const baseTrialHeading = await page.getByRole("region", { name: "试排内容（仅本次编辑）" })
    .getByLabel("试排标题").inputValue();
  for (const [index, imageNode] of imageNodes.entries()) {
    await selectNode(page, imageNode.nodeId);
    const trial = page.getByRole("region", { name: "试排内容（仅本次编辑）" });
    await expect(trial).toContainText("只检查构图，不保存到模板");
    await trial.locator('input[type="file"]').first().setInputFiles({
      name: `trial-${index + 1}.svg`,
      mimeType: "image/svg+xml",
      buffer: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="320" height="240" fill="${index === 0 ? "#d9dde0" : "#899096"}"/></svg>`),
    });
    await trial.getByLabel("试排图片说明").fill(`试排图片 ${index + 1}`);
    const image = page.frameLocator("iframe.template-editor__viewport-frame")
      .locator(`[data-template-node-id="${imageNode.nodeId}"] img`);
    await expect(image).toHaveAttribute("src", /^data:image\/svg\+xml;base64,/);
    imageSources.push((await image.getAttribute("src")) ?? "");
  }
  expect(imageSources[0]).not.toBe(imageSources[1]);

  for (const [nodeId, label, value] of [
    [headingNode.nodeId, "试排标题", "海风与珍珠的夏夜"],
    [textNode.nodeId, "试排正文", "两种材质在不同光线下保持清晰层次。"],
    [richTextNode.nodeId, "试排富文本", "近看金属收边，远看整体留白。"],
  ] as const) {
    await selectNode(page, nodeId);
    await page.getByRole("region", { name: "试排内容（仅本次编辑）" }).getByLabel(label).fill(value);
    await expect(page.frameLocator("iframe.template-editor__viewport-frame")
      .locator(`[data-template-node-id="${nodeId}"]`)).toContainText(value);
  }

  await selectNode(page, buttonNode.nodeId);
  let trial = page.getByRole("region", { name: "试排内容（仅本次编辑）" });
  await trial.getByLabel("试排按钮文案").fill("预约鉴赏");
  await trial.getByLabel("试排链接", { exact: true }).fill("/contact");
  const editorButton = page.frameLocator("iframe.template-editor__viewport-frame")
    .locator(`[data-template-node-id="${buttonNode.nodeId}"]`);
  await expect(editorButton).toContainText("预约鉴赏");
  await expect(editorButton).toHaveAttribute("href", "/contact");
  await expect(editorButton.locator("a")).toHaveCount(0);

  await selectNode(page, linkNode.nodeId);
  trial = page.getByRole("region", { name: "试排内容（仅本次编辑）" });
  await trial.getByLabel("试排链接文案").fill("查看系列");
  await trial.getByLabel("试排链接", { exact: true }).fill("https://example.com/collection");
  const editorLink = page.frameLocator("iframe.template-editor__viewport-frame")
    .locator(`[data-template-node-id="${linkNode.nodeId}"]`);
  await expect(editorLink).toContainText("查看系列");
  await expect(editorLink).toHaveAttribute("href", "https://example.com/collection");
  await expect(editorLink.locator("a")).toHaveCount(0);

  let contactNavigationCount = 0;
  let collectionNavigationCount = 0;
  await page.route("**/contact", (route) => {
    contactNavigationCount += 1;
    return route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><html><body><div id='template-viewport-root'></div><p>预约目标页</p></body></html>",
    });
  });
  await page.route("https://example.com/collection", (route) => {
    collectionNavigationCount += 1;
    return route.fulfill({ contentType: "text/html", body: "<!doctype html><p>系列目标页</p>" });
  });
  const desktopPreviewFrame = page.frameLocator("iframe.template-editor__viewport-frame");
  const desktopPreviewButton = desktopPreviewFrame.locator(`[data-template-node-id="${buttonNode.nodeId}"]`);
  const desktopPreviewButtonSize = await desktopPreviewButton.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  if (desktopPreviewButtonSize.width <= 4 || desktopPreviewButtonSize.height <= 0) {
    throw new Error("桌面预览未测得按钮视觉盒子");
  }
  await expect(desktopPreviewButton).toHaveCSS("pointer-events", "auto");
  await expect(desktopPreviewButton).toHaveAttribute("href", "/contact");
  await expect(desktopPreviewButton.locator("a")).toHaveCount(0);
  const desktopPreviewButtonBox = await getFrameNodePageBox(page, buttonNode.nodeId);
  if (!desktopPreviewButtonBox) throw new Error("桌面预览未换算出按钮宿主坐标");
  await page.mouse.click(
    desktopPreviewButtonBox.x + Math.min(2, desktopPreviewButtonBox.width / 2),
    desktopPreviewButtonBox.y + desktopPreviewButtonBox.height / 2,
  );
  await expect.poll(() => contactNavigationCount).toBe(1);
  await page.getByRole("button", { name: "退出预览并继续编辑", exact: true }).click();

  const afterTrial = await readEditorFacts(page);
  expect(afterTrial.definition).toEqual(beforeTrial.definition);
  expect(afterTrial.historyPast).toEqual(beforeTrial.historyPast);
  expect(afterTrial.historyFuture).toEqual(beforeTrial.historyFuture);
  expect(afterTrial.dirty).toBe(beforeTrial.dirty);
  expect(afterTrial.remote).toEqual(beforeTrial.remote);
  expect(afterTrial.trialSessionId).toBe(afterTrial.sessionId);
  expect(Object.keys(afterTrial.trialContentBySlotId)).toHaveLength(7);
  const browserStorage = await page.evaluate(() => JSON.stringify({
    local: Object.fromEntries(Object.entries(localStorage)),
    session: Object.fromEntries(Object.entries(sessionStorage)),
  }));
  expect(browserStorage).not.toContain("海风与珍珠的夏夜");
  expect(browserStorage).not.toContain("data:image/svg+xml");

  await page.locator(".template-editor__toolbar").getByRole("button", { name: /移动端模板布局/ }).click();
  await page.getByRole("button", { name: "预览模板", exact: true }).click();
  const mobileFrame = page.frameLocator("iframe.template-editor__viewport-frame");
  await expect(mobileFrame.locator(`[data-template-node-id="${headingNode.nodeId}"]`)).toContainText("海风与珍珠的夏夜");
  await expect(mobileFrame.locator(`[data-template-node-id="${imageNodes[1].nodeId}"] img`)).toHaveAttribute("src", imageSources[1]);

  await page.getByLabel("压力预览场景", { exact: true }).selectOption("short-text");
  await expect(page.frameLocator("iframe.template-editor__viewport-frame")
    .locator(`[data-template-node-id="${headingNode.nodeId}"]`)).toContainText("海风与珍珠的夏夜");
  await expect(page.frameLocator("iframe.template-editor__viewport-frame")
    .locator(`[data-template-node-id="${imageNodes[0].nodeId}"] img`)).toHaveAttribute("src", imageSources[0]);
  const mobilePreviewButton = page.frameLocator("iframe.template-editor__viewport-frame")
    .locator(`[data-template-node-id="${buttonNode.nodeId}"]`);
  const mobilePreviewLink = page.frameLocator("iframe.template-editor__viewport-frame")
    .locator(`[data-template-node-id="${linkNode.nodeId}"]`);
  await expect(mobilePreviewButton).toHaveAttribute("href", "/contact");
  await expect(mobilePreviewLink).toHaveAttribute("href", "https://example.com/collection");
  await mobilePreviewButton.focus();
  await expect(mobilePreviewButton).toBeFocused();
  await page.keyboard.press("Enter");
  await expect.poll(() => contactNavigationCount).toBe(2);
  await page.getByRole("button", { name: "退出预览并继续编辑", exact: true }).click();

  // 移动端固定 4:3 画板会裁剪下方文字组；回到文字组可见的桌面视口验证编辑态点击。
  await page.locator(".template-editor__toolbar").getByRole("button", { name: /桌面端模板布局/ }).click();
  const editorFrame = page.frameLocator("iframe.template-editor__viewport-frame");
  await expect(editorFrame.locator(`[data-template-node-id="${buttonNode.nodeId}"]`)).not.toHaveAttribute("href", /.+/);
  await expect(editorFrame.locator(`[data-template-node-id="${linkNode.nodeId}"]`)).not.toHaveAttribute("href", /.+/);
  await expect(editorFrame.locator(`[data-template-node-id="${buttonNode.nodeId}"] a`)).toHaveCount(0);
  await expect(editorFrame.locator(`[data-template-node-id="${linkNode.nodeId}"] a`)).toHaveCount(0);
  // 画布只命中当前层直接子对象；通过结构区与可见入口进入文字组，再验证链接点击不导航。
  await page.getByRole("tree", { name: "模板区域与槽位" })
    .locator(`[role="treeitem"][data-selection-target-id="${textGroup.nodeId}"]`).click();
  const enterGroup = page.getByRole("button", { name: "进入选中容器", exact: true });
  if (await enterGroup.isVisible()) await enterGroup.click();
  const editorLinkHit = page.locator(`[data-overlay-hit-for="node:${linkNode.nodeId}"]`);
  const editorLinkHitBox = await editorLinkHit.boundingBox();
  if (!editorLinkHitBox) throw new Error("编辑画布未测得链接选择命中盒子");
  const editorFrameUrl = page.frames().find((frame) => frame !== page.mainFrame())?.url();
  await page.mouse.click(editorLinkHitBox.x + 2, editorLinkHitBox.y + editorLinkHitBox.height / 2);
  await expect(page.getByRole("region", { name: "试排内容（仅本次编辑）" })).toHaveCount(0);
  expect(JSON.stringify((await readEditorFacts(page)).trialContentBySlotId)).toContain("查看系列");
  expect(page.frames().find((frame) => frame !== page.mainFrame())?.url()).toBe(editorFrameUrl);

  await selectEditorNode(page, headingNode.nodeId);
  const beforeStyle = await readEditorFacts(page);
  await page.getByRole("combobox", { name: "文字对齐", exact: true }).selectOption("center");
  expect((await readEditorFacts(page)).historyPast).toHaveLength(beforeStyle.historyPast.length + 1);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  expect((await readEditorFacts(page)).definition).toEqual(beforeStyle.definition);
  await expect(page.frameLocator("iframe.template-editor__viewport-frame")
    .locator(`[data-template-node-id="${headingNode.nodeId}"]`)).not.toContainText("海风与珍珠的夏夜");
  expect(JSON.stringify((await readEditorFacts(page)).trialContentBySlotId)).toContain("海风与珍珠的夏夜");
  await page.getByRole("button", { name: "重做", exact: true }).click();
  await expect(page.frameLocator("iframe.template-editor__viewport-frame")
    .locator(`[data-template-node-id="${headingNode.nodeId}"]`)).not.toContainText("海风与珍珠的夏夜");
  expect(JSON.stringify((await readEditorFacts(page)).trialContentBySlotId)).toContain("海风与珍珠的夏夜");

  await page.getByRole("button", { name: "保存模板", exact: true }).click();
  await expect(page.getByText("模板草稿已保存，可继续设计或发布", { exact: true }).last()).toBeVisible();
  if (!server.resource) throw new Error("Route-Mock 未记录保存后的模板");
  const savedDefinition = structuredClone(server.resource.draft.definition) as TemplateDefinitionV2;
  const serializedWrites = JSON.stringify(server.writes);
  for (const value of ["海风与珍珠的夏夜", "两种材质在不同光线下保持清晰层次", "预约鉴赏", "data:image/svg+xml"]) {
    expect(serializedWrites).not.toContain(value);
  }
  expect(savedDefinition.previewContent).toEqual({});
  expect(JSON.stringify(savedDefinition)).not.toContain("__trialLink");

  await page.reload();
  await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
  await page.getByRole("button", { name: "模板设计", exact: true }).click();
  await page.getByRole("button", { name: /打开会话试排内容模板/ }).click();
  await selectNode(page, headingNode.nodeId);
  // 重开后显示原有基础内容，但上次会话的试排值仍必须清空。
  await expect(page.getByRole("region", { name: "试排内容（仅本次编辑）" }).getByLabel("试排标题")).toHaveValue(baseTrialHeading);
  await expect(page.frameLocator("iframe.template-editor__viewport-frame")
    .locator(`[data-template-node-id="${headingNode.nodeId}"]`)).not.toContainText("海风与珍珠的夏夜");
  const reopened = await readEditorFacts(page);
  expect(reopened.definition).toEqual(savedDefinition);
  expect(reopened.trialContentBySlotId).toEqual({});

  await page.getByRole("button", { name: "退出预览并继续编辑", exact: true }).click();
  await completeProductionReviews(page);
  await page.getByRole("button", { name: "发布模板新版本", exact: true }).click();
  const review = page.getByRole("region", { name: "本次发布检查" });
  await review.getByRole("button", { name: "保存并发布模板", exact: true }).click();
  await expect(page.getByRole("button", { name: "去页面装修使用" })).toBeVisible();
  expect(JSON.stringify(server.writes)).not.toContain("海风与珍珠的夏夜");
  expect(JSON.stringify(server.writes)).not.toContain("data:image/svg+xml");
  expect(server.unexpectedWrites).toEqual([]);

  await page.evaluate(({ definition, key }) => {
    sessionStorage.setItem(key, JSON.stringify(definition));
  }, { definition: savedDefinition, key: "dynamic-template-toolbox-public-definition" });
  await page.route("**/template-trial-content-public.html", (route) => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><html><body><div id="root"></div>
      <script type="module">
        import RefreshRuntime from "/@react-refresh";
        RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {};
        window.$RefreshSig$ = () => (type) => type;
        window.__vite_plugin_react_preamble_installed__ = true;
      </script>
      <script type="module" src="/tests/fixtures/dynamic-template-toolbox-public.tsx"></script>
    </body></html>`,
  }));
  await page.goto("/template-trial-content-public.html");
  const publicRenderer = page.getByRole("main", { name: "复杂组件公开 Renderer", exact: true });
  await expect(publicRenderer).toBeVisible();
  await expect(publicRenderer).not.toContainText("海风与珍珠的夏夜");
  await expect(publicRenderer).not.toContainText("预约鉴赏");
  const publicImageSources = await publicRenderer.locator("img").evaluateAll((images) => (
    images.map((image) => image.getAttribute("src") ?? "")
  ));
  expect(publicImageSources).not.toContain(imageSources[0]);
  expect(publicImageSources).not.toContain(imageSources[1]);

  await page.evaluate(({ definition, contentBySlotId, key }) => {
    sessionStorage.setItem(key, JSON.stringify({ definition, contentBySlotId }));
  }, {
    definition: savedDefinition,
    contentBySlotId: {
      [buttonNode.slotId!]: { label: "预约鉴赏", targetType: "page", pagePath: "/contact" },
      [linkNode.slotId!]: { label: "查看系列", targetType: "external", url: "https://example.com/collection" },
    },
    key: "dynamic-template-action-public-payload",
  });
  await page.route("**/template-action-public.html", (route) => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><html><body><div id="root"></div>
      <script type="module">
        import RefreshRuntime from "/@react-refresh";
        RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {};
        window.$RefreshSig$ = () => (type) => type;
        window.__vite_plugin_react_preamble_installed__ = true;
      </script>
      <script type="module" src="/tests/fixtures/dynamic-template-action-public.tsx"></script>
    </body></html>`,
  }));
  await page.goto("/template-action-public.html");
  const actionRenderer = page.getByRole("main", { name: "行动槽位公开 Renderer" });
  await expect(actionRenderer).toBeVisible();
  for (const sectionName of ["桌面行动槽位", "移动行动槽位"]) {
    const section = page.getByRole("region", { name: sectionName });
    const button = section.locator(`[data-template-node-id="${buttonNode.nodeId}"]`);
    const link = section.locator(`[data-template-node-id="${linkNode.nodeId}"]`);
    await expect(button).toHaveAttribute("href", "/contact");
    await expect(link).toHaveAttribute("href", "https://example.com/collection");
    await expect(button.locator("a")).toHaveCount(0);
    await expect(link.locator("a")).toHaveCount(0);
  }

  const invalidLink = page.getByRole("region", { name: "无效行动槽位" })
    .locator(`[data-template-node-id="${linkNode.nodeId}"]`);
  await expect(invalidLink).not.toHaveAttribute("href", /.+/);
  await expect(invalidLink.locator("a")).toHaveCount(0);
  expect(await invalidLink.evaluate((element) => (element as HTMLElement).tabIndex)).toBe(-1);
  const beforeInvalidClick = collectionNavigationCount;
  await invalidLink.scrollIntoViewIfNeeded();
  const invalidBox = await invalidLink.boundingBox();
  if (!invalidBox) throw new Error("无效链接未测得视觉盒子");
  await page.mouse.click(invalidBox.x + 2, invalidBox.y + invalidBox.height / 2);
  expect(collectionNavigationCount).toBe(beforeInvalidClick);

  const publicDesktopButton = page.getByRole("region", { name: "桌面行动槽位" })
    .locator(`[data-template-node-id="${buttonNode.nodeId}"]`);
  await publicDesktopButton.scrollIntoViewIfNeeded();
  const publicDesktopButtonBox = await publicDesktopButton.boundingBox();
  if (!publicDesktopButtonBox) throw new Error("桌面公开 Renderer 未测得按钮视觉盒子");
  await page.mouse.click(
    publicDesktopButtonBox.x + 2,
    publicDesktopButtonBox.y + publicDesktopButtonBox.height / 2,
  );
  await expect.poll(() => contactNavigationCount).toBe(3);

  await page.goto("/template-action-public.html");
  const publicDesktopLink = page.getByRole("region", { name: "桌面行动槽位" })
    .locator(`[data-template-node-id="${linkNode.nodeId}"]`);
  await publicDesktopLink.scrollIntoViewIfNeeded();
  const publicDesktopLinkBox = await publicDesktopLink.boundingBox();
  if (!publicDesktopLinkBox) throw new Error("桌面公开 Renderer 未测得链接视觉盒子");
  await page.mouse.click(
    publicDesktopLinkBox.x + 2,
    publicDesktopLinkBox.y + publicDesktopLinkBox.height / 2,
  );
  await expect.poll(() => collectionNavigationCount).toBe(1);

  await page.goto("/template-action-public.html");
  const publicMobileButton = page.getByRole("region", { name: "移动行动槽位" })
    .locator(`[data-template-node-id="${buttonNode.nodeId}"]`);
  await publicMobileButton.scrollIntoViewIfNeeded();
  const publicMobileButtonBox = await publicMobileButton.boundingBox();
  if (!publicMobileButtonBox) throw new Error("移动公开 Renderer 未测得按钮视觉盒子");
  await page.mouse.click(
    publicMobileButtonBox.x + 2,
    publicMobileButtonBox.y + publicMobileButtonBox.height / 2,
  );
  await expect.poll(() => contactNavigationCount).toBe(4);

  await page.goto("/template-action-public.html");
  const publicMobileLink = page.getByRole("region", { name: "移动行动槽位" })
    .locator(`[data-template-node-id="${linkNode.nodeId}"]`);
  await publicMobileLink.focus();
  await expect(publicMobileLink).toBeFocused();
  await expect(publicMobileLink).toHaveCSS("outline-style", /^(auto|solid|dashed|dotted|double)$/);
  await page.keyboard.press("Enter");
  await expect.poll(() => collectionNavigationCount).toBe(2);
  await page.waitForURL("https://example.com/collection", { waitUntil: "domcontentloaded" });
});
