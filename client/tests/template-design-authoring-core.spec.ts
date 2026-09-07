import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  createTemplateDraftFromExisting,
  createTrulyBlankTemplateDraft,
  insertTemplateAuthoringNode,
  openTemplateAuthoringDraft,
  TEMPLATE_AUTHORING_INSERT_SOURCES,
} from "../src/pages/admin/TemplateDesignWorkspace/templateAuthoringAdapter";
import { useTemplateEditorSession } from "../src/page-builder/template-editor/templateEditorSession";

const workspaceRootSource = readFileSync(
  resolve("src/pages/admin/TemplateDesignWorkspace/index.tsx"),
  "utf8",
);
const capabilitySource = readFileSync(
  resolve("src/pages/admin/TemplateDesignWorkspace/TemplateCapabilityLibrary.tsx"),
  "utf8",
);
const canvasSource = readFileSync(
  resolve("src/pages/admin/TemplateDesignWorkspace/TemplateBlueprintCanvas.tsx"),
  "utf8",
);
const directorySource = readFileSync(
  resolve("src/pages/admin/TemplateDesignWorkspace/TemplateDesignDirectory.tsx"),
  "utf8",
);
const workspaceCss = readFileSync(
  resolve("src/pages/admin/TemplateDesignWorkspace/TemplateDesignWorkspace.css"),
  "utf8",
);

test.afterEach(() => {
  useTemplateEditorSession.getState().close();
});

test("真正空模板只包含根节点，不注入预设骨架或内容", () => {
  const draft = createTrulyBlankTemplateDraft("真正空模板");

  expect(Object.keys(draft.definition.nodes)).toEqual([
    draft.definition.rootNodeId,
  ]);
  expect(draft.definition.nodes[draft.definition.rootNodeId].childIds).toEqual([]);
  expect(draft.definition.slots).toEqual({});
  expect(draft.definition.defaultContent).toEqual({});
  expect(draft.definition.previewContent).toEqual({});
});

test("三个添加入口共用同一 typed command，并各自只产生一个 undo 事务", () => {
  for (const source of TEMPLATE_AUTHORING_INSERT_SOURCES) {
    const draft = createTrulyBlankTemplateDraft(`${source} 验收`);
    openTemplateAuthoringDraft(draft);

    const result = insertTemplateAuthoringNode({
      source,
      nodeType: "Container",
    });
    const state = useTemplateEditorSession.getState();

    expect(result).toMatchObject({ ok: true, changed: true });
    if (!result.ok) throw new Error(result.message);
    expect(state.selectedObjectId).toBe(result.nodeId);
    expect(state.historyPast).toHaveLength(1);

    state.undo();
    expect(
      useTemplateEditorSession.getState().draft?.definition.nodes[
        draft.definition.rootNodeId
      ].childIds,
    ).toEqual([]);
    useTemplateEditorSession.getState().close();
  }
});

test("空模板直接添加槽位时，区域和槽位保持同一原子事务", () => {
  const draft = createTrulyBlankTemplateDraft("空模板首内容");
  openTemplateAuthoringDraft(draft);

  const result = insertTemplateAuthoringNode({
    source: "empty-canvas",
    nodeType: "HeadingSlot",
  });
  const state = useTemplateEditorSession.getState();

  expect(result).toMatchObject({
    ok: true,
    changed: true,
    focusTarget: "inspector",
  });
  if (!result.ok) throw new Error(result.message);
  expect(result.autoCreatedRegionId).toBeTruthy();
  expect(state.selectedObjectId).toBe(result.nodeId);
  expect(state.historyPast).toHaveLength(1);

  state.undo();
  const restored = useTemplateEditorSession.getState().draft!.definition;
  expect(restored.nodes[restored.rootNodeId].childIds).toEqual([]);
  expect(restored.slots).toEqual({});
});

test("插入失败不写入部分草稿、不改变选择且不产生 history", () => {
  const draft = createTrulyBlankTemplateDraft("失败原子性");
  openTemplateAuthoringDraft(draft);
  const before = useTemplateEditorSession.getState();
  const beforeDefinition = structuredClone(before.draft!.definition);

  const result = insertTemplateAuthoringNode({
    source: "inline-region",
    nodeType: "TextSlot",
    parentNodeId: "missing-parent",
  });
  const after = useTemplateEditorSession.getState();

  expect(result).toMatchObject({ ok: false, changed: false });
  expect(after.draft?.definition).toEqual(beforeDefinition);
  expect(after.selectedObjectId).toBe(before.selectedObjectId);
  expect(after.historyPast).toHaveLength(0);
});

test("基于现有模板创建新身份并清除兼容内容", () => {
  const source = createTrulyBlankTemplateDraft("来源模板").definition;
  source.defaultContent = { title: "不得复制" };
  source.previewContent = { image: "不得复制" };

  const copy = createTemplateDraftFromExisting(source, "新模板");

  expect(copy.definition.templateId).not.toBe(source.templateId);
  expect(copy.sourceReference).toBe(source.templateId);
  expect(copy.definition.name).toBe("新模板");
  expect(copy.definition.defaultContent).toEqual({});
  expect(copy.definition.previewContent).toEqual({});
});

test("四区职责、三个入口和保存动作都接入同一权威边界", () => {
  for (const responsibility of [
    "sectionPatternSlotLibrary",
    "templateStructureTree",
    "templateBlueprintCanvas",
    "templateConstraintInspector",
  ]) {
    expect(workspaceRootSource).toContain(responsibility);
  }
  expect(capabilitySource).toContain('source: "capability-library"');
  expect(canvasSource).toContain('source: "empty-canvas"');
  expect(canvasSource).toContain('source: "inline-region"');
  expect(workspaceRootSource).toContain("insertTemplateAuthoringNode(request)");
  expect(workspaceRootSource).toContain("controller.persist({ overwriteCurrent: true })");
  expect(workspaceRootSource).toContain('setDevice("desktop")');
  expect(workspaceRootSource).toContain('setDevice("mobile")');
  expect(workspaceRootSource).not.toContain("localStorage");
});

test("模板目录提供搜索、状态筛选、打开草稿和两种创建入口", () => {
  expect(directorySource).toContain("dynamicTemplateApi.listCatalog");
  expect(directorySource).toContain("搜索模板名称");
  expect(directorySource).toContain("筛选模板状态");
  expect(directorySource).toContain("打开草稿");
  expect(directorySource).toContain("基于此模板创建");
  expect(directorySource).toContain("新建空白模板");
  expect(directorySource).toContain("该兼容来源需要先通过统一转换接口载入");
});

test("390×844 使用 canvas-first 互斥 tabs，桌面比例合同不被覆盖", () => {
  expect(workspaceRootSource).toContain('data-mobile-strategy="canvas-first-exclusive-tabs"');
  expect(workspaceRootSource).toContain('data-mobile-reference-viewport="390x844"');
  expect(workspaceRootSource).toContain('useState<FourZoneWorkspaceZone>("canvas")');
  expect(workspaceRootSource).toContain('event.key === "ArrowRight"');
  expect(workspaceRootSource).toContain('event.key === "ArrowLeft"');
  expect(workspaceRootSource).toContain("aria-controls=");
  expect(workspaceCss).toContain("@media (max-width: 1199px)");
  expect(workspaceCss).toContain('[data-compact-active-zone="canvas"]');
  expect(workspaceCss).toContain("@media (max-width: 600px)");
  expect(workspaceCss).toContain("min-height: 844px");
  expect(workspaceCss).not.toContain("grid-template-columns: 12");
});
