import { expect, test } from "@playwright/test";

import {
  addDynamicTemplateNode,
  adaptLegacyResponsiveUpdate,
  removeDynamicTemplateNode,
  setDynamicTemplateNodeStructureLocked,
  type TemplateDefinitionV2,
} from "../src/page-builder/template-definition";
import { resolveTemplateNodeRules, setTemplateNodeRule } from "../src/page-builder/template-definition/responsive";
import { registerPendingCommittedInput, unregisterPendingCommittedInput } from "../src/page-builder/inspector/controls/NumberField";
import { createNewDynamicTemplateDraft } from "../src/page-builder/template-editor/dynamicTemplateDraftRepository";
import {
  createTemplateEditorSelectionSnapshot,
  repairTemplateEditorSelectionSnapshot,
  resolveTemplateEditorSelectionIntent,
  transitionTemplateEditorSelection,
  type TemplateEditorSelectionSnapshot,
  type TemplateEditorSelectionTarget,
} from "../src/page-builder/template-editor/templateEditorSelection";
import { useTemplateEditorSession } from "../src/page-builder/template-editor/templateEditorSession";

function target(targetId: string, roleId?: string): TemplateEditorSelectionTarget {
  return { targetId, ...(roleId !== undefined ? { roleId } : {}) };
}

function snapshot(
  targets: TemplateEditorSelectionTarget[],
  primaryTarget: TemplateEditorSelectionTarget | null,
  anchorTarget: TemplateEditorSelectionTarget | null,
): TemplateEditorSelectionSnapshot {
  return { targets, primaryTarget, anchorTarget };
}

function createSelectionFixture() {
  let definition = createNewDynamicTemplateDraft("TD-3B2 选择核心").definition;
  const region = addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
  definition = region.definition;
  const first = addDynamicTemplateNode(definition, region.nodeId, "ImageSlot");
  definition = first.definition;
  const second = addDynamicTemplateNode(definition, region.nodeId, "TextSlot");
  definition = second.definition;
  const third = addDynamicTemplateNode(definition, region.nodeId, "ImageSlot");
  definition = third.definition;
  const hero = addDynamicTemplateNode(definition, region.nodeId, "HeroTemplate");
  definition = hero.definition;
  return {
    definition,
    regionId: region.nodeId,
    firstId: first.nodeId,
    secondId: second.nodeId,
    thirdId: third.nodeId,
    heroId: hero.nodeId,
  };
}

function nodeVisibleOrder(fixture: ReturnType<typeof createSelectionFixture>) {
  return [
    target(fixture.firstId),
    target(fixture.secondId),
    target(fixture.thirdId),
    target(fixture.heroId, "copy"),
    target(fixture.heroId, "action"),
  ];
}

test.afterEach(() => {
  const session = useTemplateEditorSession.getState();
  if (session.previewMode) session.setPreviewMode(false);
  session.close();
});

test.describe("画布交互事务与当前编辑层级", () => {
  function openFixture() {
    const fixture = createSelectionFixture();
    useTemplateEditorSession.getState().open({
      ...createNewDynamicTemplateDraft("事务基线"), definition: fixture.definition,
    });
    return fixture;
  }

  test("100 次累计预览不污染已提交草稿，确认只生成一条历史并可撤销重做", () => {
    const fixture = openFixture();
    const initial = useTemplateEditorSession.getState();
    const baseline = structuredClone(initial.draft);
    const token = initial.beginInteraction("调整宽度")!;
    for (let width = 1; width <= 100; width += 1) {
      expect(useTemplateEditorSession.getState().previewInteraction(token, {
        type: "update-definition", label: "调整宽度",
        update: (definition) => { definition.nodes[fixture.firstId].name = `宽度 ${width}`; },
      }).ok).toBe(true);
    }
    const preview = useTemplateEditorSession.getState();
    expect(preview.previewDocument?.nodes[fixture.firstId].name).toBe("宽度 100");
    expect(preview.draft).toEqual(baseline);
    expect(preview.historyPast).toHaveLength(0);
    expect(preview.dirty).toBe(false);
    expect(preview.semanticGeneration).toBe(initial.semanticGeneration);
    expect(preview.commitInteraction(token)).toMatchObject({ ok: true, changed: true });
    expect(useTemplateEditorSession.getState().historyPast).toHaveLength(1);
    expect(useTemplateEditorSession.getState().dirty).toBe(true);
    expect(useTemplateEditorSession.getState().previewDocument).toBeNull();
    useTemplateEditorSession.getState().undo();
    expect(useTemplateEditorSession.getState().draft).toEqual(baseline);
    expect(useTemplateEditorSession.getState().dirty).toBe(false);
    useTemplateEditorSession.getState().redo();
    expect(useTemplateEditorSession.getState().draft?.definition.nodes[fixture.firstId].name).toBe("宽度 100");
  });

  test("取消及零变化提交保持保存基线、dirty、redo 和历史", () => {
    openFixture();
    const initial = useTemplateEditorSession.getState();
    const baseline = structuredClone(initial.draft);
    const token = initial.beginInteraction("临时名称")!;
    initial.previewInteraction(token, { type: "update-definition", label: "临时名称", update: (definition) => { definition.name = "试验"; } });
    expect(initial.cancelInteraction(token)).toBe(true);
    expect(initial.commitInteraction(token)).toMatchObject({ ok: false, code: "STALE_INTERACTION" });
    const empty = initial.beginInteraction("只点未拖")!;
    expect(initial.commitInteraction(empty)).toMatchObject({ ok: true, changed: false });
    const final = useTemplateEditorSession.getState();
    expect(final.draft).toEqual(baseline);
    expect(final.historyPast).toHaveLength(0);
    expect(final.historyFuture).toHaveLength(0);
    expect(final.dirty).toBe(false);
  });

  test("命令抛错会原子取消预览，不留半个更新", () => {
    openFixture();
    const initial = useTemplateEditorSession.getState();
    const token = initial.beginInteraction("批量修改")!;
    const result = initial.previewInteraction(token, {
      type: "update-definition", label: "批量修改",
      update: (definition) => { definition.name = "不应留下"; throw new Error("字段非法"); },
    });
    expect(result.ok).toBe(false);
    const final = useTemplateEditorSession.getState();
    expect(final.draft).toEqual(initial.draft);
    expect(final.previewDocument).toBeNull();
    expect(final.activeInteraction).toBeNull();
    expect(final.historyPast).toHaveLength(0);
    expect(final.dirty).toBe(false);
  });

  test("新事务和新会话拒绝旧指针迟到提交，且不取消新事务", () => {
    openFixture();
    const store = useTemplateEditorSession.getState();
    const old = store.beginInteraction("旧操作")!;
    const fresh = store.beginInteraction("新操作")!;
    expect(store.previewInteraction(old, { type: "update-definition", label: "迟到", update: () => {} }))
      .toMatchObject({ ok: false, code: "STALE_INTERACTION" });
    expect(store.cancelInteraction(old)).toBe(false);
    expect(useTemplateEditorSession.getState().activeInteraction?.token).toBe(fresh);
    openFixture();
    expect(store.commitInteraction(fresh)).toMatchObject({ ok: false, code: "STALE_INTERACTION" });
    expect(useTemplateEditorSession.getState().historyPast).toHaveLength(0);
  });

  test("外部文档提交或断点切换取消手势；撤销键先取消预览", () => {
    openFixture();
    const store = useTemplateEditorSession.getState();
    const token = store.beginInteraction("拖动")!;
    store.setName("字段已确认");
    expect(store.commitInteraction(token).ok).toBe(false);
    expect(useTemplateEditorSession.getState().draft?.definition.name).toBe("字段已确认");
    const second = store.beginInteraction("再次拖动")!;
    store.setDevice("mobile");
    expect(store.commitInteraction(second).ok).toBe(false);
    store.beginInteraction("第三次拖动");
    store.undo();
    expect(useTemplateEditorSession.getState().draft?.definition.name).toBe("字段已确认");
    expect(useTemplateEditorSession.getState().activeInteraction).toBeNull();
    store.undo();
    expect(useTemplateEditorSession.getState().dirty).toBe(false);
  });

  test("结构直选同步父级，进入返回不写历史，Esc 先取消后返回", () => {
    const fixture = openFixture();
    const store = useTemplateEditorSession.getState();
    expect(store.enterEditingScope(fixture.regionId)).toBe(true);
    expect(useTemplateEditorSession.getState().editingScopeId).toBe(fixture.regionId);
    store.selectObject(fixture.firstId);
    expect(useTemplateEditorSession.getState().editingScopeId).toBe(fixture.regionId);
    expect(store.enterEditingScope(fixture.firstId)).toBe(false);
    store.beginInteraction("拖动");
    expect(store.leaveEditingScope()).toBe(true);
    expect(useTemplateEditorSession.getState().editingScopeId).toBe(fixture.regionId);
    expect(store.leaveEditingScope()).toBe(true);
    const final = useTemplateEditorSession.getState();
    expect(final.editingScopeId).toBe(fixture.definition.rootNodeId);
    expect(final.selectedObjectId).toBe(fixture.regionId);
    expect(final.historyPast).toHaveLength(0);
    expect(final.dirty).toBe(false);
  });

  test("框选原子过滤锁定目标，父子去重且不写草稿", () => {
    const fixture = openFixture();
    const draft = useTemplateEditorSession.getState().draft!;
    useTemplateEditorSession.getState().open({ ...draft, definition: setDynamicTemplateNodeStructureLocked(draft.definition, fixture.secondId, true) });
    const result = useTemplateEditorSession.getState().selectTargets([target(fixture.firstId), target(fixture.secondId), target(fixture.thirdId)]);
    expect(result?.snapshot.targets).toEqual([target(fixture.firstId), target(fixture.thirdId)]);
    expect(result?.exclusions).toEqual([expect.objectContaining({ code: "TARGET_LOCKED" })]);
    const nested = useTemplateEditorSession.getState().selectTargets([target(fixture.regionId), target(fixture.firstId)]);
    expect(nested?.snapshot.targets).toEqual([target(fixture.regionId)]);
    expect(useTemplateEditorSession.getState().dirty).toBe(false);
    expect(useTemplateEditorSession.getState().historyPast).toHaveLength(0);
  });

  test("提交拒绝新增非法值，原有未完成字段不阻止其他合法编辑", () => {
    const fixture = openFixture();
    const initial = useTemplateEditorSession.getState();
    const token = initial.beginInteraction("非法宽度")!;
    const invalid = initial.previewInteraction(token, {
      type: "update-definition", label: "非法宽度", update: (definition) => {
        definition.nodes[fixture.firstId].responsive.desktop.width = { value: Number.NaN, unit: "px" };
      },
    });
    expect(invalid).toMatchObject({ ok: false, code: "INVALID_OPERATION_RESULT" });
    expect(initial.commitInteraction(token)).toMatchObject({ ok: false, code: "STALE_INTERACTION" });
    expect(useTemplateEditorSession.getState().draft).toEqual(initial.draft);
    expect(useTemplateEditorSession.getState().historyPast).toHaveLength(0);
    const unfinished = structuredClone(initial.draft!);
    unfinished.definition.name = "";
    initial.open(unfinished);
    const accepted = initial.beginInteraction("修改节点名")!;
    initial.previewInteraction(accepted, {
      type: "update-definition", label: "修改节点名", update: (definition) => { definition.nodes[fixture.firstId].name = "作品主图"; },
    });
    expect(initial.commitInteraction(accepted)).toMatchObject({ ok: true, changed: true });
  });

  test("平板断点与连续宽度只改会话状态，旧模板不静默新增平板", () => {
    openFixture();
    const store = useTemplateEditorSession.getState();
    const draft = structuredClone(store.draft!);
    draft.definition.schemaVersion = 2;
    store.open(draft);
    expect(store.setBreakpoint("tablet")).toBe(true);
    expect(useTemplateEditorSession.getState().device).toBe("desktop");
    store.setPreviewWidth(600);
    expect(useTemplateEditorSession.getState()).toMatchObject({ previewWidth: 600, breakpoint: "mobile", device: "mobile", dirty: false });
    store.setPreviewWidth(900);
    expect(useTemplateEditorSession.getState()).toMatchObject({ previewWidth: 900, breakpoint: "tablet", device: "desktop" });
    store.setPreviewWidth(Number.NaN);
    expect(useTemplateEditorSession.getState().previewWidth).toBe(900);
    store.setBreakpoint("desktop");
    expect(useTemplateEditorSession.getState().previewWidth).toBeNull();
    expect(useTemplateEditorSession.getState().draft).toEqual(draft);
    expect(useTemplateEditorSession.getState().historyPast).toHaveLength(0);
    draft.definition.schemaVersion = 1;
    store.open(draft);
    expect(store.setBreakpoint("tablet")).toBe(false);
    expect(useTemplateEditorSession.getState().draft?.definition.schemaVersion).toBe(1);
  });

  test("预览可切设备与观察宽度而不写草稿历史；编辑态切换仍取消手势", () => {
    const fixture = openFixture();
    const store = useTemplateEditorSession.getState();
    const before = structuredClone(store.draft!);
    store.setPreviewMode(true);
    store.setDevice("mobile");
    expect(useTemplateEditorSession.getState()).toMatchObject({ previewMode: true, device: "mobile", breakpoint: "mobile" });
    expect(store.setBreakpoint("tablet")).toBe(true);
    expect(useTemplateEditorSession.getState()).toMatchObject({ previewMode: true, device: "desktop", breakpoint: "tablet" });
    expect(store.setPreviewWidth(390)).toBe(true);
    expect(useTemplateEditorSession.getState()).toMatchObject({ previewWidth: 390, breakpoint: "mobile" });
    const rejected = store.executeCommand({ type: "update-definition", label: "预览写入应拒绝", update: (definition) => { definition.nodes[fixture.firstId].name = "不能写入"; } });
    expect(rejected.ok).toBe(false);
    expect(useTemplateEditorSession.getState().draft).toEqual(before);
    expect(useTemplateEditorSession.getState().historyPast).toHaveLength(0);
    expect(useTemplateEditorSession.getState().dirty).toBe(false);
    store.setPreviewMode(false);
    const token = store.beginInteraction("尚未结束的画布调整")!;
    store.setDevice("desktop");
    expect(useTemplateEditorSession.getState()).toMatchObject({ device: "desktop", breakpoint: "desktop", previewWidth: null, activeInteraction: null });
    expect(store.commitInteraction(token).ok).toBe(false);
    expect(store.setBreakpoint("desktop")).toBe(true);
  });

  test("旧控件适配仅写改过的成员，继承值与显式同值来源保持不变", () => {
    const fixture = openFixture();
    const definition = structuredClone(fixture.definition);
    definition.schemaVersion = 2;
    const node = definition.nodes[fixture.firstId];
    node.responsive.mobile = {};
    node.responsive.tablet = {};
    setTemplateNodeRule(definition, node.nodeId, "desktop", "padding", {
      top: { value: 10, unit: "px" }, right: { value: 12, unit: "px" },
      bottom: { value: 14, unit: "px" }, left: { value: 16, unit: "px" },
    });
    setTemplateNodeRule(definition, node.nodeId, "mobile", "radius", node.responsive.desktop.radius ?? { value: 0, unit: "px" });
    const originalMobile = structuredClone(node.responsive.mobile);
    const unchanged = adaptLegacyResponsiveUpdate(definition, "mobile", () => {});
    expect(unchanged).toEqual(definition);
    const changed = adaptLegacyResponsiveUpdate(definition, "mobile", (projection) => {
      projection.nodes[node.nodeId].responsive.mobile.padding!.left = { value: 28, unit: "px" };
    });
    expect(changed.nodes[node.nodeId].responsive.mobile).toEqual({
      ...originalMobile, padding: { left: { value: 28, unit: "px" } },
    });
    expect(resolveTemplateNodeRules(changed, node.nodeId, "mobile").padding).toMatchObject({
      top: { value: 10 }, right: { value: 12 }, bottom: { value: 14 }, left: { value: 28 },
    });
    expect(definition.nodes[node.nodeId].responsive.mobile).toEqual(originalMobile);
  });

  test("v2 新增节点不复制其他端规则；网格转换预览一次确认并可整体撤销", () => {
    const draft = createNewDynamicTemplateDraft("布局转换");
    draft.definition.schemaVersion = 2;
    const group = addDynamicTemplateNode(draft.definition, draft.definition.rootNodeId, "Stack");
    const child = addDynamicTemplateNode(group.definition, group.nodeId, "ImageSlot");
    expect(child.definition.nodes[child.nodeId].responsive.mobile).toEqual({});
    expect(child.definition.slots[child.slotId!].mobileRules).toEqual({});
    const store = useTemplateEditorSession.getState();
    store.open({ ...draft, definition: child.definition });
    const token = store.beginInteraction("改为网格")!;
    const preview = store.previewInteraction(token, {
      type: "convert-layout", label: "改为网格", nodeId: group.nodeId,
      breakpoint: "tablet", layout: "grid", columns: [1, 1],
    });
    expect(preview.ok).toBe(true);
    expect(useTemplateEditorSession.getState().draft?.definition).toEqual(child.definition);
    expect(store.commitInteraction(token)).toMatchObject({ ok: true, changed: true });
    const updated = useTemplateEditorSession.getState().draft!.definition;
    expect(resolveTemplateNodeRules(updated, group.nodeId, "tablet")).toMatchObject({ display: "grid", columns: [1, 1] });
    expect(updated.nodes[group.nodeId].responsive.tablet).toEqual({ display: "grid", columns: [1, 1] });
    expect(updated.nodes[group.nodeId].responsive.desktop).toEqual(child.definition.nodes[group.nodeId].responsive.desktop);
    expect(useTemplateEditorSession.getState().historyPast).toHaveLength(1);
    store.undo();
    expect(useTemplateEditorSession.getState().draft?.definition).toEqual(child.definition);
  });

  test("自由转换需要真实几何和确定高度，失败不写局部定义", () => {
    const draft = createNewDynamicTemplateDraft("自由布局");
    draft.definition.schemaVersion = 2;
    const group = addDynamicTemplateNode(draft.definition, draft.definition.rootNodeId, "Stack");
    const child = addDynamicTemplateNode(group.definition, group.nodeId, "ImageSlot");
    const store = useTemplateEditorSession.getState();
    store.open({ ...draft, definition: child.definition });
    const base = { type: "convert-layout" as const, label: "自由排列", nodeId: group.nodeId, breakpoint: "desktop" as const, layout: "free" as const };
    expect(store.executeCommand(base)).toMatchObject({ ok: false, code: "LAYOUT_GEOMETRY_REQUIRED" });
    const placements = { [child.nodeId]: { x: 0.1, y: 0.2, width: 0.4, height: 0.3, zIndex: 0 } };
    expect(store.executeCommand({ ...base, placements })).toMatchObject({ ok: false, code: "LAYOUT_HEIGHT_REQUIRED" });
    expect(useTemplateEditorSession.getState().draft?.definition).toEqual(child.definition);
    expect(store.executeCommand({ ...base, placements, height: { mode: "fixed", value: { value: 600, unit: "px" } } }))
      .toMatchObject({ ok: true, changed: true });
    expect(useTemplateEditorSession.getState().historyPast).toHaveLength(1);
    expect(resolveTemplateNodeRules(useTemplateEditorSession.getState().draft!.definition, child.nodeId, "desktop").placement).toEqual(placements[child.nodeId]);
    expect(store.executeCommand({ type: "convert-layout", label: "移动端恢复排列", nodeId: group.nodeId, breakpoint: "mobile", layout: "vertical" }))
      .toMatchObject({ ok: true, changed: true });
    const mobileFlow = useTemplateEditorSession.getState().draft!.definition;
    expect(mobileFlow.nodes[child.nodeId].responsive.mobile.placement).toBeNull();
    expect(resolveTemplateNodeRules(mobileFlow, child.nodeId, "mobile").placement).toBeUndefined();
    expect(resolveTemplateNodeRules(mobileFlow, child.nodeId, "desktop").placement).toEqual(placements[child.nodeId]);
    store.undo();
    expect(resolveTemplateNodeRules(useTemplateEditorSession.getState().draft!.definition, child.nodeId, "mobile").placement).toEqual(placements[child.nodeId]);
  });

  test("普通字段命令拒绝 fit 父与 fill 子的不确定尺寸且保留原文档", () => {
    const fixture = openFixture();
    const store = useTemplateEditorSession.getState();
    const draft = structuredClone(store.draft!);
    draft.definition.schemaVersion = 2;
    store.open(draft);
    const result = store.executeCommand({
      type: "update-definition", label: "适应宽度",
      update: (definition) => { setTemplateNodeRule(definition, fixture.regionId, "desktop", "width", "fit"); },
    });
    expect(result).toMatchObject({ ok: false, code: "LAYOUT_RELATIONSHIP_CONFLICT" });
    expect(useTemplateEditorSession.getState().draft).toEqual(draft);
    expect(useTemplateEditorSession.getState().historyPast).toHaveLength(0);
  });

  test("字段启动不递归 flush，指针启动在字段确认之后捕获新基线", () => {
    openFixture();
    const store = useTemplateEditorSession.getState();
    const savedDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
    const input = { getAttribute: () => null } as unknown as HTMLInputElement;
    let commits = 0;
    registerPendingCommittedInput(input, () => { commits += 1; store.setName("已确认字段"); return true; });
    Object.defineProperty(globalThis, "document", { configurable: true, value: { querySelectorAll: () => [input] } });
    try {
      const field = store.beginInteraction("输入字号", { source: "field" });
      expect(field).not.toBeNull();
      expect(commits).toBe(0);
      store.cancelInteraction(field!);
      const pointer = store.beginInteraction("拖动宽度", { source: "pointer" });
      expect(pointer).not.toBeNull();
      expect(commits).toBe(1);
      expect(useTemplateEditorSession.getState().activeInteraction?.baselineDefinition.name).toBe("已确认字段");
      store.cancelInteraction(pointer!);
    } finally {
      unregisterPendingCommittedInput(input);
      if (savedDocument) Object.defineProperty(globalThis, "document", savedDocument);
      else Reflect.deleteProperty(globalThis, "document");
    }
  });

  test("保存响应只更新已提交内容基线，不把进行中的预览当作已保存", () => {
    openFixture();
    const store = useTemplateEditorSession.getState();
    store.setName("保存请求");
    const requested = structuredClone(useTemplateEditorSession.getState().draft!);
    const token = store.beginInteraction("保存期间继续编辑")!;
    store.previewInteraction(token, { type: "update-definition", label: "保存期间继续编辑", update: (definition) => { definition.name = "新内容"; } });
    expect(store.reconcileSaveResult({ sessionId: useTemplateEditorSession.getState().sessionId!, requestedDraft: requested, savedDraft: requested })).toBe("saved");
    expect(useTemplateEditorSession.getState().draft?.definition.name).toBe("保存请求");
    expect(useTemplateEditorSession.getState().previewDocument?.name).toBe("新内容");
    expect(useTemplateEditorSession.getState().dirty).toBe(false);
    expect(store.commitInteraction(token)).toMatchObject({ ok: true, changed: true });
    expect(useTemplateEditorSession.getState().dirty).toBe(true);
    store.undo();
    expect(useTemplateEditorSession.getState().draft?.definition.name).toBe("保存请求");
    expect(useTemplateEditorSession.getState().dirty).toBe(false);
  });
});

test.describe("TD-3B2 selection snapshot 纯核心", () => {
  test("Ctrl 与 Meta 归一为同一 toggle，Shift 组合为 additive-range", () => {
    expect(resolveTemplateEditorSelectionIntent({})).toBe("exclusive");
    expect(resolveTemplateEditorSelectionIntent({ ctrlKey: true })).toBe("toggle");
    expect(resolveTemplateEditorSelectionIntent({ metaKey: true })).toBe("toggle");
    expect(resolveTemplateEditorSelectionIntent({ shiftKey: true })).toBe("range");
    expect(resolveTemplateEditorSelectionIntent({ ctrlKey: true, shiftKey: true }))
      .toBe("additive-range");
    expect(resolveTemplateEditorSelectionIntent({ metaKey: true, shiftKey: true }))
      .toBe("additive-range");
  });

  test("exclusive 可查看根与锁定对象，且 primary/anchor 同步到稳定 identity", () => {
    const fixture = createSelectionFixture();
    const locked = setDynamicTemplateNodeStructureLocked(
      fixture.definition,
      fixture.regionId,
      true,
    );
    const rootTarget = target(locked.rootNodeId);
    const root = transitionTemplateEditorSelection({
      definition: locked,
      snapshot: createTemplateEditorSelectionSnapshot(),
      target: rootTarget,
      visibleTargets: [rootTarget],
    });
    expect(root).toMatchObject({ ok: true, changed: true, intent: "exclusive" });
    expect(root.snapshot).toEqual(snapshot([rootTarget], rootTarget, rootTarget));

    const lockedTarget = target(fixture.firstId);
    const viewLocked = transitionTemplateEditorSelection({
      definition: locked,
      snapshot: root.snapshot,
      target: lockedTarget,
      visibleTargets: [rootTarget, lockedTarget],
    });
    expect(viewLocked).toMatchObject({ ok: true, changed: true, exclusions: [] });
    expect(viewLocked.snapshot).toEqual(snapshot(
      [lockedTarget],
      lockedTarget,
      lockedTarget,
    ));
  });

  test("Ctrl/Meta 增加与移除保持可见顺序，并修复被移除的 primary/anchor", () => {
    const fixture = createSelectionFixture();
    const [first, second, third] = nodeVisibleOrder(fixture);
    const visibleTargets = [first, second, third];
    const exclusive = transitionTemplateEditorSelection({
      definition: fixture.definition,
      snapshot: createTemplateEditorSelectionSnapshot(),
      target: first,
      visibleTargets,
    });
    const ctrlAdd = transitionTemplateEditorSelection({
      definition: fixture.definition,
      snapshot: exclusive.snapshot,
      target: third,
      visibleTargets,
      ctrlKey: true,
    });
    const metaAdd = transitionTemplateEditorSelection({
      definition: fixture.definition,
      snapshot: exclusive.snapshot,
      target: third,
      visibleTargets,
      metaKey: true,
    });
    expect(metaAdd).toEqual(ctrlAdd);
    expect(ctrlAdd.snapshot).toEqual(snapshot([first, third], third, third));

    const addMiddle = transitionTemplateEditorSelection({
      definition: fixture.definition,
      snapshot: ctrlAdd.snapshot,
      target: second,
      visibleTargets,
      metaKey: true,
    });
    expect(addMiddle.snapshot).toEqual(snapshot(
      [first, second, third],
      second,
      second,
    ));
    const removeMiddle = transitionTemplateEditorSelection({
      definition: fixture.definition,
      snapshot: addMiddle.snapshot,
      target: second,
      visibleTargets,
      ctrlKey: true,
    });
    expect(removeMiddle.snapshot).toEqual(snapshot([first, third], third, third));
  });

  test("Shift 正反闭区间使用调用方可见顺序，anchor 缺失时明确退化为终点单选", () => {
    const fixture = createSelectionFixture();
    const [first, second, third, fourth] = nodeVisibleOrder(fixture);
    const visibleTargets = [first, second, third, fourth];
    const forward = transitionTemplateEditorSelection({
      definition: fixture.definition,
      snapshot: snapshot([second], second, second),
      target: fourth,
      visibleTargets,
      shiftKey: true,
    });
    expect(forward.rangeResolution).toBe("anchored");
    expect(forward.snapshot).toEqual(snapshot(
      [second, third, fourth],
      fourth,
      second,
    ));

    const reverse = transitionTemplateEditorSelection({
      definition: fixture.definition,
      snapshot: snapshot([fourth], fourth, fourth),
      target: second,
      visibleTargets,
      shiftKey: true,
    });
    expect(reverse.snapshot).toEqual(snapshot(
      [second, third, fourth],
      second,
      fourth,
    ));

    const additive = transitionTemplateEditorSelection({
      definition: fixture.definition,
      snapshot: snapshot([first, fourth], fourth, fourth),
      target: second,
      visibleTargets,
      metaKey: true,
      shiftKey: true,
    });
    expect(additive).toMatchObject({
      intent: "additive-range",
      rangeResolution: "anchored",
    });
    expect(additive.snapshot).toEqual(snapshot(
      [first, second, third, fourth],
      second,
      fourth,
    ));

    const missingAnchor = target("missing-anchor");
    const fallback = transitionTemplateEditorSelection({
      definition: fixture.definition,
      snapshot: snapshot([first], first, missingAnchor),
      target: third,
      visibleTargets,
      shiftKey: true,
    });
    expect(fallback.rangeResolution).toBe("anchor-missing-target-only");
    expect(fallback.snapshot).toEqual(snapshot([third], third, third));

    const invisibleEnd = transitionTemplateEditorSelection({
      definition: fixture.definition,
      snapshot: forward.snapshot,
      target: target(fixture.heroId, "action"),
      visibleTargets: [first, second, third],
      shiftKey: true,
    });
    expect(invisibleEnd).toMatchObject({
      ok: false,
      changed: false,
      exclusions: [{ code: "TARGET_NOT_VISIBLE" }],
    });
    expect(invisibleEnd.snapshot).toBe(forward.snapshot);

    const missingEndTarget = target("missing-end");
    const missingEnd = transitionTemplateEditorSelection({
      definition: fixture.definition,
      snapshot: forward.snapshot,
      target: missingEndTarget,
      visibleTargets: [...visibleTargets, missingEndTarget],
      shiftKey: true,
    });
    expect(missingEnd).toMatchObject({
      ok: false,
      changed: false,
      exclusions: [{ code: "TARGET_NOT_FOUND", target: missingEndTarget }],
    });
    expect(missingEnd.snapshot).toBe(forward.snapshot);
  });

  test("node 与同 owner 的多个 role 以 targetId+roleId 区分且仍按可见顺序排序", () => {
    const fixture = createSelectionFixture();
    const first = target(fixture.firstId);
    const copy = target(fixture.heroId, "copy");
    const action = target(fixture.heroId, "action");
    const visibleTargets = [first, copy, action];
    const firstSelection = transitionTemplateEditorSelection({
      definition: fixture.definition,
      snapshot: createTemplateEditorSelectionSnapshot(),
      target: first,
      visibleTargets,
    });
    const actionAdded = transitionTemplateEditorSelection({
      definition: fixture.definition,
      snapshot: firstSelection.snapshot,
      target: action,
      visibleTargets,
      ctrlKey: true,
    });
    const copyAdded = transitionTemplateEditorSelection({
      definition: fixture.definition,
      snapshot: actionAdded.snapshot,
      target: copy,
      visibleTargets,
      ctrlKey: true,
    });
    expect(copyAdded.snapshot).toEqual(snapshot(
      [first, copy, action],
      copy,
      copy,
    ));
  });

  test("根、祖先锁和调用方不兼容均返回 reason，并保持原 snapshot 引用零变化", () => {
    const fixture = createSelectionFixture();
    const rootTarget = target(fixture.definition.rootNodeId);
    const first = target(fixture.firstId);
    const second = target(fixture.secondId);
    const visibleTargets = [rootTarget, first, second];
    const rootSnapshot = snapshot([rootTarget], rootTarget, rootTarget);
    const rootRejected = transitionTemplateEditorSelection({
      definition: fixture.definition,
      snapshot: rootSnapshot,
      target: first,
      visibleTargets,
      ctrlKey: true,
    });
    expect(rootRejected.exclusions).toEqual([{
      code: "ROOT_TARGET_NOT_BATCH_EDITABLE",
      target: rootTarget,
      reason: "模板根节点只可单独查看，不能加入批量选择。",
    }]);
    expect(rootRejected.snapshot).toBe(rootSnapshot);

    const lockedDefinition = setDynamicTemplateNodeStructureLocked(
      fixture.definition,
      fixture.regionId,
      true,
    );
    const emptySnapshot = createTemplateEditorSelectionSnapshot();
    const lockedRejected = transitionTemplateEditorSelection({
      definition: lockedDefinition,
      snapshot: emptySnapshot,
      target: first,
      visibleTargets: [first],
      metaKey: true,
    });
    expect(lockedRejected.exclusions).toEqual([{
      code: "TARGET_LOCKED",
      target: first,
      lockOwnerId: fixture.regionId,
      reason: "目标的上级已锁定，不能加入批量选择。",
    }]);
    expect(lockedRejected.snapshot).toBe(emptySnapshot);

    const firstSnapshot = snapshot([first], first, first);
    const incompatibleRejected = transitionTemplateEditorSelection({
      definition: fixture.definition,
      snapshot: firstSnapshot,
      target: second,
      visibleTargets: [first, second],
      ctrlKey: true,
      resolveCompatibility: (candidate, context) => (
        candidate.targetId === fixture.secondId && context.mode === "batch"
          ? { compatible: false, reason: "文字槽位不适用于当前批量图片动作。" }
          : { compatible: true }
      ),
    });
    expect(incompatibleRejected.exclusions).toEqual([{
      code: "TARGET_INCOMPATIBLE",
      target: second,
      reason: "文字槽位不适用于当前批量图片动作。",
    }]);
    expect(incompatibleRejected.snapshot).toBe(firstSnapshot);
  });

  test("repair 删除失效目标并修复 primary/anchor，全部失效时只回退定义根", () => {
    const fixture = createSelectionFixture();
    const first = target(fixture.firstId);
    const copy = target(fixture.heroId, "copy");
    const third = target(fixture.thirdId);
    const original = snapshot([first, copy, third], third, first);
    const withoutThird = removeDynamicTemplateNode(fixture.definition, fixture.thirdId);
    const repaired = repairTemplateEditorSelectionSnapshot(withoutThird, original);
    expect(repaired).toEqual(snapshot([first, copy], copy, first));

    const withoutFirst = removeDynamicTemplateNode(withoutThird, fixture.firstId);
    const withoutHero = removeDynamicTemplateNode(withoutFirst, fixture.heroId);
    const fallback = repairTemplateEditorSelectionSnapshot(withoutHero, repaired);
    const rootTarget = target(withoutHero.rootNodeId);
    expect(fallback).toEqual(snapshot([rootTarget], rootTarget, rootTarget));

    const desktopImage = target(fixture.heroId, "desktopImage");
    const remapped = repairTemplateEditorSelectionSnapshot(
      fixture.definition,
      snapshot([desktopImage], desktopImage, desktopImage),
      {
        repairTarget: (candidate) => candidate.roleId === "desktopImage"
          ? target(candidate.targetId, "mobileImage")
          : candidate,
      },
    );
    const mobileImage = target(fixture.heroId, "mobileImage");
    expect(remapped).toEqual(snapshot([mobileImage], mobileImage, mobileImage));
  });
});

test.describe("TD-3B2 templateEditorSession 接线", () => {
  test("选择变化不进 history、不改 dirty、不执行 command，legacy 字段始终镜像 primary", () => {
    const fixture = createSelectionFixture();
    const draft = {
      ...createNewDynamicTemplateDraft("TD-3B2 Session"),
      definition: fixture.definition,
    };
    const session = useTemplateEditorSession.getState();
    session.open(draft);
    const initial = useTemplateEditorSession.getState();
    const historyBefore = initial.historyPast.length;
    const dirtyBefore = initial.dirty;
    const commandBefore = initial.lastCommandResult;
    const first = target(fixture.firstId);
    const copy = target(fixture.heroId, "copy");
    const visibleTargets = [first, copy];

    const exclusive = useTemplateEditorSession.getState().transitionSelection({
      target: first,
      visibleTargets,
    });
    expect(exclusive).toMatchObject({ ok: true, intent: "exclusive" });
    const added = useTemplateEditorSession.getState().transitionSelection({
      target: copy,
      visibleTargets,
      ctrlKey: true,
    });
    expect(added).toMatchObject({ ok: true, intent: "toggle" });
    const selected = useTemplateEditorSession.getState();
    expect(selected.selectionSnapshot).toEqual(snapshot([first, copy], copy, copy));
    expect(selected.selectedObjectId).toBe(fixture.heroId);
    expect(selected.selectedContractRole).toEqual({ nodeId: fixture.heroId, roleId: "copy" });
    expect(selected.historyPast).toHaveLength(historyBefore);
    expect(selected.dirty).toBe(dirtyBefore);
    expect(selected.lastCommandResult).toBe(commandBefore);
  });

  test("preview 保留完整 snapshot，切模板/新建重置为新根，关闭清空全部镜像", () => {
    const fixture = createSelectionFixture();
    const firstDraft = {
      ...createNewDynamicTemplateDraft("TD-3B2 Preview"),
      definition: fixture.definition,
    };
    const first = target(fixture.firstId);
    const second = target(fixture.secondId);
    useTemplateEditorSession.getState().open(firstDraft);
    useTemplateEditorSession.getState().transitionSelection({
      target: first,
      visibleTargets: [first, second],
    });
    useTemplateEditorSession.getState().transitionSelection({
      target: second,
      visibleTargets: [first, second],
      metaKey: true,
    });
    const beforePreview = useTemplateEditorSession.getState().selectionSnapshot;
    useTemplateEditorSession.getState().setPreviewMode(true);
    const blocked = useTemplateEditorSession.getState().transitionSelection({
      target: first,
      visibleTargets: [first, second],
    });
    expect(blocked).toBeNull();
    expect(useTemplateEditorSession.getState().selectionSnapshot).toBe(beforePreview);
    useTemplateEditorSession.getState().setPreviewMode(false);

    const nextDraft = createNewDynamicTemplateDraft("TD-3B2 Next");
    useTemplateEditorSession.getState().open(nextDraft, { isNew: true });
    const nextRoot = target(nextDraft.definition.rootNodeId);
    const reopened = useTemplateEditorSession.getState();
    expect(reopened.selectionSnapshot).toEqual(snapshot([nextRoot], nextRoot, nextRoot));
    expect(reopened.selectedObjectId).toBe(nextDraft.definition.rootNodeId);
    expect(reopened.selectedContractRole).toBeNull();

    reopened.close();
    const closed = useTemplateEditorSession.getState();
    expect(closed.selectionSnapshot).toEqual(snapshot([], null, null));
    expect(closed.selectedObjectId).toBeNull();
    expect(closed.selectedContractRole).toBeNull();
  });

  test("definition command 后 repair 删除失效 primary，保留其余目标并同步 legacy 镜像", () => {
    const fixture = createSelectionFixture();
    const draft = {
      ...createNewDynamicTemplateDraft("TD-3B2 Repair"),
      definition: fixture.definition,
    };
    const first = target(fixture.firstId);
    const second = target(fixture.secondId);
    useTemplateEditorSession.getState().open(draft);
    useTemplateEditorSession.getState().transitionSelection({
      target: first,
      visibleTargets: [first, second],
    });
    useTemplateEditorSession.getState().transitionSelection({
      target: second,
      visibleTargets: [first, second],
      ctrlKey: true,
    });
    const historyBefore = useTemplateEditorSession.getState().historyPast.length;
    const result = useTemplateEditorSession.getState().executeCommand({
      type: "transform-definition",
      label: "删除当前主目标",
      transform: (definition: TemplateDefinitionV2) => (
        removeDynamicTemplateNode(definition, fixture.secondId)
      ),
    });
    expect(result).toMatchObject({ ok: true, changed: true });
    const repaired = useTemplateEditorSession.getState();
    expect(repaired.selectionSnapshot).toEqual(snapshot([first], first, first));
    expect(repaired.selectedObjectId).toBe(fixture.firstId);
    expect(repaired.selectedContractRole).toBeNull();
    expect(repaired.historyPast).toHaveLength(historyBefore + 1);
  });

  test("唯一选中节点被删除时回退最近父级，undo/redo 恢复命令前后选择", () => {
    const fixture = createSelectionFixture();
    const draft = {
      ...createNewDynamicTemplateDraft("TD-3B2 历史选择"),
      definition: fixture.definition,
    };
    const child = target(fixture.secondId);
    const parent = target(fixture.regionId);
    useTemplateEditorSession.getState().open(draft);
    useTemplateEditorSession.getState().transitionSelection({
      target: child,
      visibleTargets: [child],
    });

    const result = useTemplateEditorSession.getState().executeCommand({
      type: "transform-definition",
      label: "删除唯一选中节点",
      transform: (definition: TemplateDefinitionV2) => (
        removeDynamicTemplateNode(definition, fixture.secondId)
      ),
    });
    expect(result).toMatchObject({ ok: true, changed: true });
    expect(useTemplateEditorSession.getState().selectionSnapshot)
      .toEqual(snapshot([parent], parent, parent));

    useTemplateEditorSession.getState().undo();
    expect(useTemplateEditorSession.getState().selectionSnapshot)
      .toEqual(snapshot([child], child, child));
    useTemplateEditorSession.getState().redo();
    expect(useTemplateEditorSession.getState().selectionSnapshot)
      .toEqual(snapshot([parent], parent, parent));
  });

  test("设备切换修复每个合同 role，并保持 primary 的 legacy 投影一致", () => {
    const fixture = createSelectionFixture();
    const draft = {
      ...createNewDynamicTemplateDraft("TD-3B2 Device"),
      definition: fixture.definition,
    };
    useTemplateEditorSession.getState().open(draft);
    useTemplateEditorSession.getState().selectContractRole(fixture.heroId, "desktopImage");
    useTemplateEditorSession.getState().setDevice("mobile");
    const mobileImage = target(fixture.heroId, "mobileImage");
    const switched = useTemplateEditorSession.getState();
    expect(switched.selectionSnapshot).toEqual(snapshot([mobileImage], mobileImage, mobileImage));
    expect(switched.selectedObjectId).toBe(fixture.heroId);
    expect(switched.selectedContractRole).toEqual({
      nodeId: fixture.heroId,
      roleId: "mobileImage",
    });
  });
});
