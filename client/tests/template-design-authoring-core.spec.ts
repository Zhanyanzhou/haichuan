import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { useTemplateEditorSession } from "../src/page-builder/template-editor/templateEditorSession";
import {
  addConfiguredTemplateRegion,
  createBasicContentSkeletonDefinition,
  createNewDynamicTemplateDraft,
} from "../src/page-builder/template-editor/dynamicTemplateDraftRepository";
import {
  addDynamicTemplateNode,
  createTemplateInspectorBatchPlan,
  executeDynamicTemplateDefinitionCommand,
  createDynamicTemplateResponsivePlan,
  setDynamicTemplateNodeStructureLocked,
} from "../src/page-builder/template-definition";
import {
  getTemplateResponsiveCopyChanges,
  resolveTemplateInspectorDesignFields,
  TEMPLATE_INSPECTOR_DESIGN_FIELDS,
} from "../src/page-builder/template-editor/templateInspectorCapabilities";
import {
  getDynamicTemplatePageFieldDescriptors,
  groupDynamicTemplatePageFields,
} from "../src/page-builder/dynamic-template-instance/pageFieldDescriptors";
import { getContentTemplateDefaultRect } from "../src/page-builder/generated/contentTemplates.generated";
import {
  parseFiniteCanvasPadding,
  resolveFiniteCanvasScale,
} from "../src/page-builder/template-editor/templateViewportMath";

const pageFieldDescriptorSource = readFileSync(
  resolve("src/page-builder/dynamic-template-instance/pageFieldDescriptors.ts"),
  "utf8",
);

test.afterEach(() => {
  useTemplateEditorSession.getState().close();
});

test("画布适配、手动缩放与直接拉伸不会把非有限数传给渲染样式", () => {
  expect(parseFiniteCanvasPadding("12.5px")).toBe(12.5);
  expect(parseFiniteCanvasPadding("auto")).toBe(0);
  expect(parseFiniteCanvasPadding("")).toBe(0);

  expect(resolveFiniteCanvasScale(0.57)).toBe(0.57);
  expect(resolveFiniteCanvasScale(Number.NaN)).toBe(1);
  expect(resolveFiniteCanvasScale(Number.POSITIVE_INFINITY)).toBe(1);
  expect(resolveFiniteCanvasScale(Number.NEGATIVE_INFINITY)).toBe(1);
  expect(resolveFiniteCanvasScale(0)).toBe(1);
  expect(resolveFiniteCanvasScale(Number.NaN, 0.42)).toBe(0.42);
  expect(resolveFiniteCanvasScale(Number.NaN, Number.NaN)).toBe(1);
});

test("R2 required 与 hideable 分别来自合同", () => {
  const draft = createNewDynamicTemplateDraft("隐藏合同");
  const region = addDynamicTemplateNode(draft.definition, draft.definition.rootNodeId, "Container");
  const image = addDynamicTemplateNode(region.definition, region.nodeId, "ImageSlot");
  for (const required of [false, true]) for (const hideable of [false, true]) {
    Object.assign(image.definition.slots[image.slotId!], { required, hideable });
    expect(getDynamicTemplatePageFieldDescriptors(image.definition)[0]).toMatchObject({ required, hideable });
  }
});

test("R3 复制预览只披露必要的响应式覆盖和图片适配写入", () => {
  const draft = createNewDynamicTemplateDraft("复制预览");
  const region = addDynamicTemplateNode(draft.definition, draft.definition.rootNodeId, "Container");
  const image = addDynamicTemplateNode(region.definition, region.nodeId, "ImageSlot");
  const secondImage = addDynamicTemplateNode(image.definition, region.nodeId, "ImageSlot");
  const d = secondImage.definition;
  Object.assign(d.nodes[region.nodeId].responsive.desktop, { display: "grid", columns: [3, 1] });
  Object.assign(d.nodes[region.nodeId].responsive.mobile, { display: "flex", direction: "column" });
  Object.assign(d.slots[image.slotId!].desktopRules, { objectFit: "cover", objectPosition: "right top" });
  d.slots[image.slotId!].mobileRules.objectFit = "contain";
  const arrangementChanges = getTemplateResponsiveCopyChanges(
    d,
    region.nodeId,
    "desktop",
    "mobile",
    ["arrangement-display"],
  );
  expect(arrangementChanges.map((field) => field.field)).toEqual(["显示状态"]);
  expect(getTemplateResponsiveCopyChanges(
    d,
    image.nodeId,
    "desktop",
    "mobile",
    ["image-display"],
  ).map((field) => field.field)).toEqual(["图片适配"]);
  for (const [nodeId, group] of [[region.nodeId, "arrangement-display"], [image.nodeId, "image-display"]] as const) {
    const plan = createDynamicTemplateResponsivePlan(d, nodeId, "desktop", "mobile", [group]);
    const result = executeDynamicTemplateDefinitionCommand(d, { type: "copy-responsive-groups", label: "复制", nodeId, sourceDevice: "desktop", targetDevice: "mobile", groups: [group], reviewedPlan: plan });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    const expected = structuredClone(d);
    for (const change of plan.changes) {
      const [scope, key] = change.field.split(".");
      const values = scope === "responsive" ? expected.nodes[nodeId].responsive.mobile : expected.slots[expected.nodes[nodeId].slotId!].mobileRules;
      if (change.after === undefined) delete (values as any)[key];
      else (values as any)[key] = structuredClone(change.after);
    }
    expect(result.definition).toEqual(expected);
    const stale = structuredClone(d);
    stale.nodes[nodeId].responsive.mobile.display = "none";
    if (group === "image-display") stale.slots[image.slotId!].mobileRules.objectFit = "fill";
    expect(executeDynamicTemplateDefinitionCommand(stale, { type: "copy-responsive-groups", label: "陈旧复制", nodeId, sourceDevice: "desktop", targetDevice: "mobile", groups: [group], reviewedPlan: plan })).toMatchObject({ ok: false, changed: false, code: "STALE_COPY_PLAN" });
  }
});

test("R5 block 容器拒绝命令写入无效 alignItems", () => {
  const draft = createNewDynamicTemplateDraft("适用性");
  const region = addDynamicTemplateNode(draft.definition, draft.definition.rootNodeId, "Container");
  region.definition.nodes[region.nodeId].responsive.desktop.display = "block";
  const result = executeDynamicTemplateDefinitionCommand(region.definition, { type: "update-definition", label: "修改对齐", update: (next) => { next.nodes[region.nodeId].responsive.desktop.alignItems = "end"; } });
  expect(result).toMatchObject({ ok: false, changed: false, code: "FIELD_NOT_APPLICABLE" });
});

test("R6 错 templateId 保存基线零写入", () => {
  const draft = createNewDynamicTemplateDraft("基线身份");
  const region = addDynamicTemplateNode(draft.definition, draft.definition.rootNodeId, "Container");
  const baseline = structuredClone(region.definition);
  baseline.templateId = "different-template";
  const result = executeDynamicTemplateDefinitionCommand(region.definition, { type: "restore-responsive-groups", label: "恢复保存值", nodeId: region.nodeId, device: "desktop", groups: ["spacing"], baselineDefinition: baseline });
  expect(result).toMatchObject({ ok: false, changed: false, code: "BASELINE_TEMPLATE_MISMATCH" });
});

test("R8 页面字段三个声明与页面显隐能力相互独立", () => {
  const draft = createNewDynamicTemplateDraft("独立字段声明");
  const region = addDynamicTemplateNode(draft.definition, draft.definition.rootNodeId, "Container");
  const field = addDynamicTemplateNode(region.definition, region.nodeId, "TextSlot");
  const slot = field.definition.slots[field.slotId!];
  for (const required of [false, true]) for (const editable of [false, true]) for (const hideable of [false, true]) {
    Object.assign(slot, { required, editable, hideable });
    expect(getDynamicTemplatePageFieldDescriptors(field.definition)[0]).toMatchObject({ required, editable, hideable });
  }
  Object.assign(slot, { required: false, editable: false, hideable: true });
  const descriptor = getDynamicTemplatePageFieldDescriptors(field.definition)[0];
  expect(descriptor.hideable && !descriptor.required).toBe(true);
});

test("R9 页面字段 descriptor 保持 Definition 树序且无 V1 或任务排序副本", () => {
  const draft = createNewDynamicTemplateDraft("同源页面字段");
  let definition = draft.definition;
  const region = addDynamicTemplateNode(definition, definition.rootNodeId, "Container"); definition = region.definition;
  const button = addDynamicTemplateNode(definition, region.nodeId, "ButtonSlot"); definition = button.definition;
  const nested = addDynamicTemplateNode(definition, region.nodeId, "Grid"); definition = nested.definition;
  const text = addDynamicTemplateNode(definition, nested.nodeId, "TextSlot"); definition = text.definition;
  const image = addDynamicTemplateNode(definition, region.nodeId, "ImageSlot"); definition = image.definition;
  const richText = addDynamicTemplateNode(definition, region.nodeId, "RichTextSlot"); definition = richText.definition;
  const expectedFields = [
    { result: button, label: "先行动", controlKind: "link", required: true, editable: true, hideable: false, validation: { allowedProtocols: ["page"] } },
    { result: text, label: "再正文", controlKind: "text", required: false, editable: false, hideable: true, validation: { minLength: 2, maxLength: 80 } },
    { result: image, label: "后图片", controlKind: "image", required: false, editable: true, hideable: true, validation: { recommendedWidth: 1600, recommendedHeight: 1200 } },
    { result: richText, label: "末富文本", controlKind: "text", required: false, editable: true, hideable: false, validation: { maxLength: 400 } },
  ];
  for (const [index, expected] of expectedFields.entries()) {
    Object.assign(definition.slots[expected.result.slotId!], {
      label: expected.label,
      required: expected.required,
      editable: expected.editable,
      hideable: expected.hideable,
      validation: expected.validation,
    });
    if (expected.editable) definition.nodes[expected.result.nodeId].instanceEditPolicy = {
      ...definition.nodes[expected.result.nodeId].instanceEditPolicy!,
      zIndex: index % 2 === 0,
    };
  }
  const descriptors = getDynamicTemplatePageFieldDescriptors(definition);
  const expectedOrder = expectedFields.map(({ result }) => result.slotId!);
  expect(descriptors.map((field) => field.slotId)).toEqual(expectedOrder);
  expect(groupDynamicTemplatePageFields(descriptors, image.slotId).primary.map((field) => field.slotId))
    .toEqual(expectedOrder);
  expect(descriptors).toHaveLength(4);
  descriptors.forEach((descriptor, index) => {
    const expected = expectedFields[index];
    expect(descriptor).toMatchObject({
      nodeId: expected.result.nodeId,
      slotId: expected.result.slotId,
      label: expected.label,
      controlKind: expected.controlKind,
      required: expected.required,
      editable: expected.editable,
      hideable: expected.hideable,
      validation: expected.validation,
    });
    expect(descriptor.effectiveDesignOverrideCapabilities === null).toBe(!expected.editable);
  });
  expect(pageFieldDescriptorSource).not.toContain("V1_CORE_SLOT_TYPES");
  expect(pageFieldDescriptorSource).not.toContain("relatedTasks");
  expect(pageFieldDescriptorSource).not.toContain("taskRank");
});

test("真正空模板只包含根节点，不注入预设骨架或内容", () => {
  const draft = createNewDynamicTemplateDraft("真正空模板");

  expect(Object.keys(draft.definition.nodes)).toEqual([
    draft.definition.rootNodeId,
  ]);
  expect(draft.definition.nodes[draft.definition.rootNodeId].childIds).toEqual([]);
  expect(draft.definition.slots).toEqual({});
  expect(draft.definition.defaultContent).toEqual({});
  expect(draft.definition.previewContent).toEqual({});
});

test("主动双图文骨架保留根画布尺寸、图片采用 4:3，并可一次撤销", () => {
  const draft = createNewDynamicTemplateDraft("主动骨架验收");
  useTemplateEditorSession.getState().open(draft, { isNew: true });

  const result = useTemplateEditorSession.getState().executeCommand({
    type: "transform-definition",
    label: "使用 4:3 双图文骨架",
    transform: createBasicContentSkeletonDefinition,
  });
  const applied = useTemplateEditorSession.getState();

  expect(result).toMatchObject({ ok: true, changed: true });
  expect(applied.historyPast).toHaveLength(1);
  const definition = applied.draft!.definition;
  expect(Object.keys(definition.slots)).toHaveLength(4);
  expect(definition.nodes[definition.rootNodeId].responsive.desktop.height).toEqual({ mode: "auto" });
  const [regionId] = definition.nodes[definition.rootNodeId].childIds;
  const [compositionId] = definition.nodes[regionId].childIds;
  const [imageGroupId, textGroupId] = definition.nodes[compositionId].childIds;
  expect(definition.nodes[regionId].name).toBe("内容区域 1");
  expect(definition.nodes[compositionId]).toMatchObject({ name: "双图文布局", type: "Row" });
  expect(definition.nodes[compositionId].responsive.mobile.direction).toBe("column");
  expect(definition.nodes[imageGroupId]).toMatchObject({ name: "图片组", type: "Column" });
  expect(definition.nodes[imageGroupId].responsive.desktop.direction).toBe("row");
  expect(definition.nodes[imageGroupId].responsive.mobile.direction).toBe("column");
  expect(definition.nodes[textGroupId]).toMatchObject({ name: "文字组", type: "Column" });
  expect(definition.nodes[imageGroupId].childIds).toHaveLength(2);
  for (const imageNodeId of definition.nodes[imageGroupId].childIds) {
    const imageSlot = definition.slots[definition.nodes[imageNodeId].slotId!];
    expect(imageSlot.desktopRules.aspectRatio).toBe("4:3");
    expect(imageSlot.mobileRules.aspectRatio).toBe("4:3");
  }
  expect(definition.nodes[textGroupId].childIds).toHaveLength(2);
  expect(applied.draft!.definition.defaultContent).toEqual({});
  expect(applied.draft!.definition.previewContent).toEqual({});

  applied.undo();
  const restored = useTemplateEditorSession.getState().draft!.definition;
  expect(restored.nodes[restored.rootNodeId].childIds).toEqual([]);
  expect(restored.slots).toEqual({});
});

test("所有新增区域入口共用标准间距和留白", () => {
  const draft = createNewDynamicTemplateDraft("区域默认值验收");
  const added = addConfiguredTemplateRegion(draft.definition);
  const node = added.definition.nodes[added.nodeId];

  expect(node.responsive.desktop.gap).toEqual({ value: 24, unit: "px" });
  expect(node.responsive.desktop.padding).toEqual({
    top: { value: 32, unit: "px" },
    right: { value: 32, unit: "px" },
    bottom: { value: 32, unit: "px" },
    left: { value: 32, unit: "px" },
  });
  expect(node.responsive.mobile.gap).toEqual({ value: 24, unit: "px" });
  expect(node.responsive.mobile.padding).toEqual({
    top: { value: 16, unit: "px" },
    right: { value: 16, unit: "px" },
    bottom: { value: 16, unit: "px" },
    left: { value: 16, unit: "px" },
  });
});

test("A-L1 单对象属性矩阵只暴露当前布局与媒体条件适用字段", () => {
  let definition = createNewDynamicTemplateDraft("属性矩阵").definition;
  const container = addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
  definition = container.definition;
  const stack = addDynamicTemplateNode(definition, container.nodeId, "Stack");
  definition = stack.definition;
  const image = addDynamicTemplateNode(definition, stack.nodeId, "ImageSlot");
  definition = image.definition;
  const slotId = definition.nodes[image.nodeId].slotId!;
  definition.nodes[container.nodeId].responsive.desktop.display = "flex";
  definition.nodes[container.nodeId].responsive.desktop.columns = [2, 1];
  definition.nodes[stack.nodeId].responsive.desktop.layoutMode = "flow";
  definition.slots[slotId].desktopRules.objectFit = "contain";
  definition.slots[slotId].desktopRules.objectPosition = "left top";

  const fields = (nodeId: string) => resolveTemplateInspectorDesignFields({
    definition, device: "desktop", targetId: nodeId,
  }).fields.map((field) => field.field);
  expect(fields(container.nodeId)).not.toContain("responsive.columns");
  expect(fields(image.nodeId)).not.toContain("responsive.placement");
  expect(fields(image.nodeId)).not.toContain("slotRules.objectPosition");

  definition.nodes[container.nodeId].responsive.desktop.display = "grid";
  definition.nodes[stack.nodeId].responsive.desktop.layoutMode = "free";
  definition.nodes[stack.nodeId].responsive.desktop.height = { mode: "fixed", value: { value: 480, unit: "px" } };
  definition.nodes[image.nodeId].responsive.desktop.placement = { x: 0, y: 0, width: 1, height: 1, zIndex: 0 };
  definition.slots[slotId].desktopRules.objectFit = "cover";
  expect(fields(container.nodeId)).toContain("responsive.columns");
  expect(fields(image.nodeId)).toContain("responsive.placement");
  expect(fields(image.nodeId)).toContain("slotRules.objectPosition");

  const locked = setDynamicTemplateNodeStructureLocked(definition, stack.nodeId, true);
  const lockedField = resolveTemplateInspectorDesignFields({ definition: locked, device: "desktop", targetId: image.nodeId })
    .fields.find((field) => field.field === "slotRules.objectPosition");
  expect(lockedField?.disabledReason).toContain("已锁定");
});

test("A-L2 分组跨设备复制只改白名单字段并作为一步历史撤销", () => {
  let definition = createNewDynamicTemplateDraft("分组复制").definition;
  const region = addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
  definition = region.definition;
  const image = addDynamicTemplateNode(definition, region.nodeId, "ImageSlot");
  definition = image.definition;
  const slotId = definition.nodes[image.nodeId].slotId!;
  definition.nodes[image.nodeId].responsive.desktop.width = { value: 72, unit: "%" };
  definition.nodes[image.nodeId].responsive.mobile.width = { value: 91, unit: "%" };
  definition.nodes[region.nodeId].responsive.desktop.display = "flex";
  definition.nodes[region.nodeId].responsive.desktop.direction = "row";
  definition.nodes[region.nodeId].responsive.desktop.columns = [3, 1];
  definition.nodes[region.nodeId].responsive.mobile.display = "flex";
  definition.nodes[region.nodeId].responsive.mobile.direction = "column";
  definition.nodes[region.nodeId].responsive.mobile.columns = [5, 1];
  definition.slots[slotId].desktopRules.objectFit = "cover";
  definition.slots[slotId].desktopRules.objectPosition = "right top";
  definition.slots[slotId].mobileRules.objectFit = "contain";
  definition.slots[slotId].mobileRules.objectPosition = "left bottom";
  definition.defaultContent[definition.slots[slotId].key] = "身份外内容";
  definition.slots[slotId].validation.allowedProtocols = ["https"];
  const before = structuredClone(definition);
  useTemplateEditorSession.getState().open({ format: "dynamic", sourceType: "local", localDraftId: definition.templateId, versionNote: "", definition });

  const result = useTemplateEditorSession.getState().executeCommand({
    type: "copy-responsive-groups",
    label: "复制图片显示",
    nodeId: image.nodeId,
    sourceDevice: "desktop",
    targetDevice: "mobile",
    groups: ["image-display"],
  });
  const applied = useTemplateEditorSession.getState();
  expect(result).toMatchObject({ ok: true, changed: true });
  expect(applied.historyPast).toHaveLength(1);
  expect(applied.draft!.definition.nodes[image.nodeId].responsive.mobile.width).toEqual({ value: 91, unit: "%" });
  expect(applied.draft!.definition.slots[slotId].mobileRules).toMatchObject({ objectFit: "cover", objectPosition: "right top" });
  expect(applied.draft!.definition.defaultContent).toEqual(before.defaultContent);
  expect(applied.draft!.definition.slots[slotId].validation).toEqual(before.slots[slotId].validation);
  const field = getDynamicTemplatePageFieldDescriptors(applied.draft!.definition)[0];
  expect(field).toMatchObject({ nodeId: image.nodeId, slotId, stableKey: definition.slots[slotId].key, label: definition.slots[slotId].label });
  applied.undo();
  expect(useTemplateEditorSession.getState().draft!.definition).toEqual(before);
  const dormant = useTemplateEditorSession.getState().executeCommand({
    type: "copy-responsive-groups", label: "复制排列", nodeId: region.nodeId,
    sourceDevice: "desktop", targetDevice: "mobile", groups: ["arrangement-display"],
  });
  expect(dormant).toMatchObject({ ok: true, changed: true });
  expect(useTemplateEditorSession.getState().draft!.definition.nodes[region.nodeId].responsive.mobile.columns).toEqual([5, 1]);
});

test("A-L3 保存基线缺失零写入，存在时局部恢复，系统默认保持独立", () => {
  let current = createNewDynamicTemplateDraft("恢复边界").definition;
  const region = addDynamicTemplateNode(current, current.rootNodeId, "Container");
  current = region.definition;
  current.nodes[region.nodeId].responsive.desktop.gap = { value: 72, unit: "px" };
  const baseline = structuredClone(current);
  baseline.nodes[region.nodeId].responsive.desktop.gap = { value: 24, unit: "px" };
  const missing = structuredClone(baseline);
  delete missing.nodes[region.nodeId];

  const refused = executeDynamicTemplateDefinitionCommand(current, {
    type: "restore-responsive-groups", label: "恢复保存值", nodeId: region.nodeId,
    device: "desktop", groups: ["spacing"], baselineDefinition: missing,
  });
  expect(refused).toMatchObject({ ok: false, changed: false, code: "NODE_NOT_FOUND" });

  const restored = executeDynamicTemplateDefinitionCommand(current, {
    type: "restore-responsive-groups", label: "恢复保存值", nodeId: region.nodeId,
    device: "desktop", groups: ["spacing"], baselineDefinition: baseline,
  });
  expect(restored.ok && restored.definition.nodes[region.nodeId].responsive.desktop.gap).toEqual({ value: 24, unit: "px" });
  const reset = executeDynamicTemplateDefinitionCommand(current, {
    type: "reset-responsive-groups", label: "恢复系统默认", nodeId: region.nodeId,
    device: "desktop", groups: ["spacing"],
  });
  expect(reset.ok && reset.definition.nodes[region.nodeId].responsive.desktop.gap).not.toEqual({ value: 24, unit: "px" });
  const descriptors = getDynamicTemplatePageFieldDescriptors(current);
  expect(descriptors).toEqual([]);
});

test.describe("TD-3A-R10 成对合同角色响应式复制", () => {
  const targetRoleData = (
    definition: ReturnType<typeof createNewDynamicTemplateDraft>["definition"],
    nodeId: string,
  ) => (definition.nodes[nodeId].props.contentTemplateLayoutData as any).nodes;

  test("desktopImage 到 mobileImage 的计划与执行只写目标角色 mobile viewport", () => {
    let definition = createNewDynamicTemplateDraft("成对角色复制红灯").definition;
    const region = addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
    definition = region.definition;
    const hero = addDynamicTemplateNode(definition, region.nodeId, "HeroTemplate");
    definition = hero.definition;
    const sourceRect = { x: 0.05, y: 0.1, width: 0.9, height: 0.7 };
    const targetBefore = { x: 0.15, y: 0.2, width: 0.7, height: 0.6 };
    definition.nodes[hero.nodeId].props.contentTemplateLayoutData = { version: 2, nodes: {
      desktopImage: { rectByViewport: { desktop: sourceRect } },
      mobileImage: { rectByViewport: { mobile: targetBefore } },
    } };
    const before = structuredClone(definition);
    const plan = createDynamicTemplateResponsivePlan(
      definition,
      hero.nodeId,
      "desktop",
      "mobile",
      ["contract-composition-media"],
      { sourceRoleId: "desktopImage", targetRoleId: "mobileImage" },
    );

    expect(plan).toMatchObject({ sourceRoleId: "desktopImage", targetRoleId: "mobileImage" });
    expect(plan.changes.find((change) => change.field === "role.rect")).toMatchObject({
      before: targetBefore,
      after: sourceRect,
    });
    expect(plan.changes).toHaveLength(1);

    const result = executeDynamicTemplateDefinitionCommand(definition, {
      type: "copy-responsive-groups",
      label: "复制桌面配对角色到移动端",
      nodeId: hero.nodeId,
      sourceDevice: "desktop",
      targetDevice: "mobile",
      groups: ["contract-composition-media"],
      sourceRoleId: "desktopImage",
      targetRoleId: "mobileImage",
      reviewedPlan: plan,
    });
    expect(result).toMatchObject({ ok: true, changed: true, code: "APPLIED" });
    if (!result.ok) throw new Error(result.message);
    const expected = structuredClone(before);
    targetRoleData(expected, hero.nodeId).mobileImage.rectByViewport.mobile = sourceRect;
    expect(result.definition).toEqual(expected);
    expect(targetRoleData(result.definition, hero.nodeId).desktopImage).toEqual(
      targetRoleData(before, hero.nodeId).desktopImage,
    );
    expect(targetRoleData(result.definition, hero.nodeId).desktopImage.rectByViewport.mobile).toBeUndefined();
    expect(targetRoleData(result.definition, hero.nodeId).mobileImage.rectByViewport.desktop).toBeUndefined();
    expect(result.definition.defaultContent).toEqual(before.defaultContent);
    expect(Object.keys(result.definition.nodes)).toEqual(Object.keys(before.nodes));
    expect(Object.keys(result.definition.slots)).toEqual(Object.keys(before.slots));
  });

  test("mobileImage 到 desktopImage 的反向计划与执行只写目标角色 desktop viewport", () => {
    let definition = createNewDynamicTemplateDraft("成对角色反向复制").definition;
    const region = addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
    definition = region.definition;
    const hero = addDynamicTemplateNode(definition, region.nodeId, "HeroTemplate");
    definition = hero.definition;
    const sourceRect = { x: 0.11, y: 0.12, width: 0.71, height: 0.72 };
    const targetBefore = { x: 0.21, y: 0.22, width: 0.61, height: 0.62 };
    definition.nodes[hero.nodeId].props.contentTemplateLayoutData = { version: 2, nodes: {
      desktopImage: { rectByViewport: { desktop: targetBefore } },
      mobileImage: { rectByViewport: { mobile: sourceRect } },
    } };
    const before = structuredClone(definition);
    const plan = createDynamicTemplateResponsivePlan(
      definition,
      hero.nodeId,
      "mobile",
      "desktop",
      ["contract-composition-media"],
      { sourceRoleId: "mobileImage", targetRoleId: "desktopImage" },
    );
    expect(plan).toMatchObject({ sourceRoleId: "mobileImage", targetRoleId: "desktopImage" });
    expect(plan.changes).toEqual([expect.objectContaining({
      field: "role.rect",
      before: targetBefore,
      after: sourceRect,
    })]);

    const result = executeDynamicTemplateDefinitionCommand(definition, {
      type: "copy-responsive-groups",
      label: "复制移动配对角色到桌面端",
      nodeId: hero.nodeId,
      sourceDevice: "mobile",
      targetDevice: "desktop",
      groups: ["contract-composition-media"],
      sourceRoleId: "mobileImage",
      targetRoleId: "desktopImage",
      reviewedPlan: plan,
    });
    expect(result).toMatchObject({ ok: true, changed: true });
    if (!result.ok) throw new Error(result.message);
    const expected = structuredClone(before);
    targetRoleData(expected, hero.nodeId).desktopImage.rectByViewport.desktop = sourceRect;
    expect(result.definition).toEqual(expected);
    expect(targetRoleData(result.definition, hero.nodeId).mobileImage).toEqual(
      targetRoleData(before, hero.nodeId).mobileImage,
    );
    expect(targetRoleData(result.definition, hero.nodeId).desktopImage.rectByViewport.mobile).toBeUndefined();
    expect(targetRoleData(result.definition, hero.nodeId).mobileImage.rectByViewport.desktop).toBeUndefined();
  });

  test("缺失或设备不适用角色零差异，reviewed mapping 变化精确 stale", () => {
    let definition = createNewDynamicTemplateDraft("成对角色失败路径").definition;
    const region = addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
    definition = region.definition;
    const hero = addDynamicTemplateNode(definition, region.nodeId, "HeroTemplate");
    definition = hero.definition;
    const before = structuredClone(definition);
    const missingTargetPlan = createDynamicTemplateResponsivePlan(
      definition, hero.nodeId, "desktop", "mobile", ["contract-composition-media"],
      { sourceRoleId: "desktopImage", targetRoleId: "missingRole" },
    );
    expect(missingTargetPlan.changes).toEqual([]);
    expect(missingTargetPlan.reason).toContain("目标角色“missingRole”");
    const missingResult = executeDynamicTemplateDefinitionCommand(definition, {
      type: "copy-responsive-groups",
      label: "缺失目标角色复制",
      nodeId: hero.nodeId,
      sourceDevice: "desktop",
      targetDevice: "mobile",
      groups: ["contract-composition-media"],
      sourceRoleId: "desktopImage",
      targetRoleId: "missingRole",
      reviewedPlan: missingTargetPlan,
    });
    expect(missingResult).toMatchObject({ ok: true, changed: false, code: "NO_CHANGE" });
    expect(missingResult.ok && missingResult.definition).toEqual(before);
    expect(definition).toEqual(before);

    const invalidSourcePlan = createDynamicTemplateResponsivePlan(
      definition, hero.nodeId, "mobile", "desktop", ["contract-composition-media"],
      { sourceRoleId: "desktopImage", targetRoleId: "desktopImage" },
    );
    expect(invalidSourcePlan.changes).toEqual([]);
    expect(invalidSourcePlan.reason).toContain("源角色“desktopImage”在移动端不适用");

    const reviewed = createDynamicTemplateResponsivePlan(
      definition, hero.nodeId, "desktop", "mobile", ["contract-composition-media"],
      { sourceRoleId: "desktopImage", targetRoleId: "mobileImage" },
    );
    const stale = executeDynamicTemplateDefinitionCommand(definition, {
      type: "copy-responsive-groups",
      label: "陈旧角色映射",
      nodeId: hero.nodeId,
      sourceDevice: "desktop",
      targetDevice: "mobile",
      groups: ["contract-composition-media"],
      sourceRoleId: "desktopImage",
      targetRoleId: "copy",
      reviewedPlan: reviewed,
    });
    expect(stale).toMatchObject({ ok: false, changed: false, code: "STALE_COPY_PLAN" });
    expect(stale.definition).toBe(definition);
    expect(definition).toEqual(before);

    const incompleteCommand = {
      type: "copy-responsive-groups",
      label: "不完整角色映射",
      nodeId: hero.nodeId,
      sourceDevice: "desktop",
      targetDevice: "mobile",
      groups: ["contract-composition-media"],
      sourceRoleId: "desktopImage",
    } as unknown as Parameters<typeof executeDynamicTemplateDefinitionCommand>[1];
    const incomplete = executeDynamicTemplateDefinitionCommand(definition, incompleteCommand);
    expect(incomplete).toMatchObject({ ok: false, changed: false, code: "INCOMPLETE_ROLE_MAPPING" });
    expect(incomplete.definition).toBe(definition);
  });

  test("目标同身份非法错误被另一非法值替换时拒绝且不写 history", () => {
    let definition = createNewDynamicTemplateDraft("同身份非法值替换").definition;
    const region = addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
    definition = region.definition;
    definition.nodes[region.nodeId].responsive.desktop.width = { value: -2, unit: "px" };
    definition.nodes[region.nodeId].responsive.mobile.width = { value: -1, unit: "px" };
    useTemplateEditorSession.getState().open({
      format: "dynamic",
      sourceType: "local",
      localDraftId: definition.templateId,
      versionNote: "",
      definition,
    });
    const beforeState = useTemplateEditorSession.getState();
    const beforeDefinition = beforeState.draft!.definition;
    const beforeSnapshot = structuredClone(beforeDefinition);
    const historyBefore = beforeState.historyPast.length;
    const plan = createDynamicTemplateResponsivePlan(
      beforeDefinition,
      region.nodeId,
      "desktop",
      "mobile",
      ["size-position"],
    );
    expect(plan.changes.find((change) => change.field === "responsive.width")).toMatchObject({
      before: { value: -1, unit: "px" },
      after: { value: -2, unit: "px" },
    });

    const result = useTemplateEditorSession.getState().executeCommand({
      type: "copy-responsive-groups",
      label: "复制非法宽度",
      nodeId: region.nodeId,
      sourceDevice: "desktop",
      targetDevice: "mobile",
      groups: ["size-position"],
      reviewedPlan: plan,
    });
    expect(result).toMatchObject({ ok: false, changed: false, code: "INVALID_OPERATION_RESULT" });
    expect(result.definition).toBe(beforeDefinition);
    expect(useTemplateEditorSession.getState().draft!.definition).toEqual(beforeSnapshot);
    expect(useTemplateEditorSession.getState().historyPast).toHaveLength(historyBefore);
  });

  test("未触碰节点的旧错误不阻断合法复制", () => {
    let definition = createNewDynamicTemplateDraft("保留无关旧错误").definition;
    const region = addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
    definition = region.definition;
    const unrelated = addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
    definition = unrelated.definition;
    definition.nodes[region.nodeId].responsive.desktop.width = { value: 80, unit: "%" };
    definition.nodes[region.nodeId].responsive.mobile.width = { value: 60, unit: "%" };
    definition.nodes[unrelated.nodeId].responsive.desktop.width = { value: -1, unit: "px" };
    const before = structuredClone(definition);
    const plan = createDynamicTemplateResponsivePlan(
      definition,
      region.nodeId,
      "desktop",
      "mobile",
      ["size-position"],
    );

    const result = executeDynamicTemplateDefinitionCommand(definition, {
      type: "copy-responsive-groups",
      label: "复制合法宽度并保留无关旧错误",
      nodeId: region.nodeId,
      sourceDevice: "desktop",
      targetDevice: "mobile",
      groups: ["size-position"],
      reviewedPlan: plan,
    });
    expect(result).toMatchObject({ ok: true, changed: true });
    expect(result.ok && result.definition.nodes[region.nodeId].responsive.mobile.width).toEqual({ value: 80, unit: "%" });
    expect(result.ok && result.definition.nodes[unrelated.nodeId]).toEqual(before.nodes[unrelated.nodeId]);
    expect(definition).toEqual(before);
  });

});

test.describe("TD-3B1 批量属性能力与原子命令", () => {
  const addTwoSlots = (firstType: "ImageSlot" | "TextSlot" = "ImageSlot", secondType: "ImageSlot" | "TextSlot" = "ImageSlot") => {
    let definition = createNewDynamicTemplateDraft("批量属性").definition;
    const region = addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
    definition = region.definition;
    const first = addDynamicTemplateNode(definition, region.nodeId, firstType);
    definition = first.definition;
    const second = addDynamicTemplateNode(definition, region.nodeId, secondType);
    definition = second.definition;
    return { definition, regionId: region.nodeId, first, second };
  };

  const target = (targetId: string, roleId?: string) => ({
    targetId,
    ...(roleId !== undefined ? { roleId } : {}),
  });

  const addImageBatch = (count = 3) => {
    let definition = createNewDynamicTemplateDraft("批量晚失败").definition;
    const region = addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
    definition = region.definition;
    const nodeIds: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const added = addDynamicTemplateNode(definition, region.nodeId, "ImageSlot");
      definition = added.definition;
      nodeIds.push(added.nodeId);
    }
    return { definition, nodeIds, targets: nodeIds.map((nodeId) => target(nodeId)) };
  };

  test("共同字段复用动态 resolver，并保留选择顺序、primary 与字段排除原因", () => {
    const setup = addTwoSlots();
    const { definition } = setup;
    const firstId = setup.first.nodeId;
    const secondId = setup.second.nodeId;
    definition.slots[definition.nodes[firstId].slotId!].desktopRules.objectFit = "cover";
    definition.slots[definition.nodes[secondId].slotId!].desktopRules.objectFit = "contain";
    const plan = createTemplateInspectorBatchPlan({
      definition,
      device: "desktop",
      targets: [target(secondId), target(firstId), target(secondId)],
      primaryTarget: target(firstId),
    });

    expect(plan.targets).toEqual([target(secondId), target(firstId)]);
    expect(plan.primaryTarget).toEqual(target(firstId));
    expect(plan.targetPlans.every((candidate) => candidate.resolved)).toBe(true);
    expect(plan.commonFields.map((field) => field.field)).toContain("slotRules.objectFit");
    expect(plan.commonFields.map((field) => field.field)).not.toContain("slotRules.objectPosition");
    expect(plan.commonFields.map((field) => field.field)).not.toContain("node.name");
    expect(plan.commonFields.map((field) => field.field)).not.toContain("slot.label");
    expect(plan.fields.find((field) => field.field === "slotRules.objectPosition")).toMatchObject({
      applicableToAll: false,
      value: null,
      exclusions: [{ code: "FIELD_NOT_APPLICABLE", target: target(secondId) }],
    });
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.targetPlans)).toBe(true);

    const heterogeneous = addTwoSlots("ImageSlot", "TextSlot");
    const heterogeneousPlan = createTemplateInspectorBatchPlan({
      definition: heterogeneous.definition,
      device: "desktop",
      targets: [target(heterogeneous.first.nodeId), target(heterogeneous.second.nodeId)],
    });
    expect(heterogeneousPlan.commonFields.map((field) => field.field)).not.toContain("slotRules.objectFit");
    expect(heterogeneousPlan.commonFields.map((field) => field.field)).not.toContain("slotRules.fontSize");
    expect(heterogeneousPlan.commonFields.every((field) => field.field.startsWith("responsive."))).toBe(true);
  });

  test("值协议区分 same(undefined) 与 mixed，并按确定性深相等比较对象和数组", () => {
    const setup = addTwoSlots();
    const { definition } = setup;
    const targets = [target(setup.first.nodeId), target(setup.second.nodeId)];
    let plan = createTemplateInspectorBatchPlan({ definition, device: "desktop", targets });
    expect(plan.commonFields.find((field) => field.field === "responsive.maxWidth")?.value).toEqual({
      kind: "same",
      value: undefined,
    });

    definition.nodes[setup.first.nodeId].responsive.desktop.width = { value: 72, unit: "%" };
    const sameWidth = { unit: "%" as const, value: 72 };
    definition.nodes[setup.second.nodeId].responsive.desktop.width = sameWidth;
    const firstPadding = {
      top: { value: 1, unit: "rem" as const }, right: { value: 2, unit: "rem" as const },
      bottom: { value: 3, unit: "rem" as const }, left: { value: 4, unit: "rem" as const },
    };
    const secondPadding = {
      left: { unit: "rem" as const, value: 4 }, bottom: { unit: "rem" as const, value: 3 },
      right: { unit: "rem" as const, value: 2 }, top: { unit: "rem" as const, value: 1 },
    };
    definition.nodes[setup.first.nodeId].responsive.desktop.padding = firstPadding;
    definition.nodes[setup.second.nodeId].responsive.desktop.padding = secondPadding;
    plan = createTemplateInspectorBatchPlan({ definition, device: "desktop", targets });
    expect(plan.commonFields.find((field) => field.field === "responsive.width")?.value).toEqual({
      kind: "same", value: { value: 72, unit: "%" },
    });
    expect(plan.commonFields.find((field) => field.field === "responsive.padding")?.value).toEqual({
      kind: "same", value: firstPadding,
    });

    definition.nodes[setup.second.nodeId].responsive.desktop.width = { value: 73, unit: "%" };
    definition.nodes[setup.second.nodeId].responsive.desktop.padding!.left.value = 5;
    plan = createTemplateInspectorBatchPlan({ definition, device: "desktop", targets });
    expect(plan.commonFields.find((field) => field.field === "responsive.width")?.value).toEqual({ kind: "mixed" });
    expect(plan.commonFields.find((field) => field.field === "responsive.padding")?.value).toEqual({ kind: "mixed" });

    let gridDefinition = createNewDynamicTemplateDraft("网格深值").definition;
    const firstGrid = addDynamicTemplateNode(gridDefinition, gridDefinition.rootNodeId, "Container");
    gridDefinition = firstGrid.definition;
    const secondGrid = addDynamicTemplateNode(gridDefinition, gridDefinition.rootNodeId, "Container");
    gridDefinition = secondGrid.definition;
    for (const nodeId of [firstGrid.nodeId, secondGrid.nodeId]) {
      Object.assign(gridDefinition.nodes[nodeId].responsive.desktop, { display: "grid", columns: [2, 1] });
    }
    const gridTargets = [target(firstGrid.nodeId), target(secondGrid.nodeId)];
    expect(createTemplateInspectorBatchPlan({ definition: gridDefinition, device: "desktop", targets: gridTargets })
      .commonFields.find((field) => field.field === "responsive.columns")?.value).toEqual({ kind: "same", value: [2, 1] });
    gridDefinition.nodes[secondGrid.nodeId].responsive.desktop.columns = [1, 2];
    expect(createTemplateInspectorBatchPlan({ definition: gridDefinition, device: "desktop", targets: gridTargets })
      .commonFields.find((field) => field.field === "responsive.columns")?.value).toEqual({ kind: "mixed" });
  });

  test("根、缺失、上级锁、设备角色和字段条件都提供可定位 reason，且不修改允许子集", () => {
    const setup = addTwoSlots();
    const { definition } = setup;
    const rootAndMissing = createTemplateInspectorBatchPlan({
      definition,
      device: "desktop",
      targets: [target(definition.rootNodeId), target("missing-node")],
    });
    expect(rootAndMissing.targetPlans.map((candidate) => candidate.exclusions[0]?.code)).toEqual([
      "ROOT_TARGET_NOT_BATCH_EDITABLE",
      "TARGET_NOT_FOUND",
    ]);
    expect(rootAndMissing.targetPlans[1].exclusions[0]?.target).toEqual(target("missing-node"));

    const locked = setDynamicTemplateNodeStructureLocked(definition, setup.regionId, true);
    const lockedPlan = createTemplateInspectorBatchPlan({
      definition: locked,
      device: "desktop",
      targets: [target(setup.first.nodeId)],
    });
    expect(lockedPlan.targetPlans[0]).toMatchObject({
      editable: false,
      lockOwnerId: setup.regionId,
      exclusions: [{ code: "TARGET_LOCKED", lockOwnerId: setup.regionId }],
    });

    let roleDefinition = createNewDynamicTemplateDraft("角色设备").definition;
    const roleRegion = addDynamicTemplateNode(roleDefinition, roleDefinition.rootNodeId, "Container");
    roleDefinition = roleRegion.definition;
    const hero = addDynamicTemplateNode(roleDefinition, roleRegion.nodeId, "HeroTemplate");
    roleDefinition = hero.definition;
    const rolePlan = createTemplateInspectorBatchPlan({
      definition: roleDefinition,
      device: "mobile",
      targets: [target(hero.nodeId, "desktopImage")],
    });
    expect(rolePlan.targetPlans[0]).toMatchObject({
      resolved: false,
      exclusions: [{ code: "ROLE_NOT_APPLICABLE", target: target(hero.nodeId, "desktopImage") }],
    });

    const firstSlot = definition.slots[definition.nodes[setup.first.nodeId].slotId!];
    const secondSlot = definition.slots[definition.nodes[setup.second.nodeId].slotId!];
    firstSlot.desktopRules.objectFit = "cover";
    secondSlot.desktopRules.objectFit = "contain";
    const conditionalPlan = createTemplateInspectorBatchPlan({
      definition,
      device: "desktop",
      targets: [target(setup.first.nodeId), target(setup.second.nodeId)],
    });
    const before = structuredClone(definition);
    const refused = executeDynamicTemplateDefinitionCommand(definition, {
      type: "batch-update-design-field",
      label: "批量修改焦点",
      device: "desktop",
      targets: conditionalPlan.targets,
      primaryTarget: conditionalPlan.primaryTarget,
      field: "slotRules.objectPosition",
      value: "right top",
      reviewedPlan: conditionalPlan,
    });
    expect(refused).toMatchObject({ ok: false, changed: false, code: "BATCH_FIELD_EXCLUDED" });
    expect(refused.definition).toBe(definition);
    expect(definition).toEqual(before);
  });

  test("reviewed plan 在值、目标、锁、条件、设备、role 或选择变化后明确 stale 且零写入", () => {
    const setup = addTwoSlots();
    const { definition } = setup;
    const targets = [target(setup.first.nodeId), target(setup.second.nodeId)];
    const plan = createTemplateInspectorBatchPlan({ definition, device: "desktop", targets });
    const executeStale = (
      current: typeof definition,
      overrides: Partial<Extract<Parameters<typeof executeDynamicTemplateDefinitionCommand>[1], { type: "batch-update-design-field" }>> = {},
    ) => {
      const result = executeDynamicTemplateDefinitionCommand(current, {
        type: "batch-update-design-field",
        label: "陈旧批量宽度",
        device: "desktop",
        targets,
        primaryTarget: plan.primaryTarget,
        field: "responsive.width",
        value: { value: 80, unit: "%" },
        reviewedPlan: plan,
        ...overrides,
      });
      expect(result).toMatchObject({ ok: false, changed: false, code: "STALE_BATCH_PLAN" });
      expect(result.definition).toBe(current);
      return result;
    };

    const valueChanged = structuredClone(definition);
    valueChanged.nodes[setup.first.nodeId].responsive.desktop.width = { value: 71, unit: "%" };
    executeStale(valueChanged);

    const deleted = structuredClone(definition);
    const deletedSlotId = deleted.nodes[setup.second.nodeId].slotId!;
    deleted.nodes[setup.regionId].childIds = deleted.nodes[setup.regionId].childIds.filter((nodeId) => nodeId !== setup.second.nodeId);
    delete deleted.nodes[setup.second.nodeId];
    delete deleted.slots[deletedSlotId];
    executeStale(deleted);

    executeStale(setDynamicTemplateNodeStructureLocked(definition, setup.regionId, true));

    const coverDefinition = structuredClone(definition);
    for (const nodeId of [setup.first.nodeId, setup.second.nodeId]) {
      coverDefinition.slots[coverDefinition.nodes[nodeId].slotId!].desktopRules.objectFit = "cover";
    }
    const coverPlan = createTemplateInspectorBatchPlan({ definition: coverDefinition, device: "desktop", targets });
    const containChanged = structuredClone(coverDefinition);
    containChanged.slots[containChanged.nodes[setup.second.nodeId].slotId!].desktopRules.objectFit = "contain";
    const conditionalResult = executeDynamicTemplateDefinitionCommand(containChanged, {
      type: "batch-update-design-field",
      label: "陈旧批量焦点",
      device: "desktop",
      targets,
      primaryTarget: coverPlan.primaryTarget,
      field: "slotRules.objectPosition",
      value: "center center",
      reviewedPlan: coverPlan,
    });
    expect(conditionalResult).toMatchObject({ ok: false, changed: false, code: "STALE_BATCH_PLAN" });
    expect(conditionalResult.definition).toBe(containChanged);

    executeStale(definition, { device: "mobile" });
    executeStale(definition, { targets: [target(setup.first.nodeId, "unknown-role"), target(setup.second.nodeId)] });
    executeStale(definition, { targets: [...targets].reverse() });
    executeStale(definition, { targets: [targets[0]] });
  });

  test("末目标 descriptor 晚失败时精确 COMMAND_FAILED，返回原引用且无部分写", () => {
    const setup = addImageBatch();
    const { definition, targets } = setup;
    const snapshot = structuredClone(definition);
    const plan = createTemplateInspectorBatchPlan({ definition, device: "desktop", targets });
    const descriptor = TEMPLATE_INSPECTOR_DESIGN_FIELDS.find((field) => field.field === "responsive.width");
    if (!descriptor) throw new Error("缺少 responsive.width descriptor");
    const originalApplyValue = descriptor.applyValue;
    let applyCount = 0;
    descriptor.applyValue = (...args) => {
      applyCount += 1;
      if (applyCount === 3) throw new Error("第三个目标 descriptor 晚失败");
      originalApplyValue(...args);
    };
    try {
      const result = executeDynamicTemplateDefinitionCommand(definition, {
        type: "batch-update-design-field",
        label: "批量宽度晚失败",
        device: "desktop",
        targets,
        field: "responsive.width",
        value: { value: 86, unit: "%" },
        reviewedPlan: plan,
      });
      expect(applyCount).toBe(3);
      expect(result).toMatchObject({
        ok: false,
        changed: false,
        code: "COMMAND_FAILED",
        message: "第三个目标 descriptor 晚失败",
      });
      expect(result.definition).toBe(definition);
      expect(definition).toEqual(snapshot);
    } finally {
      descriptor.applyValue = originalApplyValue;
    }
  });

  test("三个目标 apply 完成后由最终 validator 精确 INVALID_OPERATION_RESULT 且回原定义", () => {
    const setup = addImageBatch();
    const { definition, targets } = setup;
    const snapshot = structuredClone(definition);
    const plan = createTemplateInspectorBatchPlan({ definition, device: "desktop", targets });
    const descriptor = TEMPLATE_INSPECTOR_DESIGN_FIELDS.find((field) => field.field === "responsive.width");
    if (!descriptor) throw new Error("缺少 responsive.width descriptor");
    const originalApplyValue = descriptor.applyValue;
    let applyCount = 0;
    descriptor.applyValue = (...args) => {
      applyCount += 1;
      originalApplyValue(...args);
    };
    try {
      const result = executeDynamicTemplateDefinitionCommand(definition, {
        type: "batch-update-design-field",
        label: "批量非法宽度",
        device: "desktop",
        targets,
        field: "responsive.width",
        value: { value: -1, unit: "px" },
        reviewedPlan: plan,
      });
      expect(applyCount).toBe(3);
      expect(result).toMatchObject({
        ok: false,
        changed: false,
        code: "INVALID_OPERATION_RESULT",
      });
      expect(result.definition).toBe(definition);
      expect(definition).toEqual(snapshot);
    } finally {
      descriptor.applyValue = originalApplyValue;
    }
  });

  test("零共同字段计划实际执行时精确拒绝且不写允许子集", () => {
    const definition = createNewDynamicTemplateDraft("零共同字段").definition;
    const snapshot = structuredClone(definition);
    const targets = [target(definition.rootNodeId), target("missing-target")];
    const plan = createTemplateInspectorBatchPlan({ definition, device: "desktop", targets });
    expect(plan.commonFields).toEqual([]);
    expect(plan.fields).toEqual([]);
    const result = executeDynamicTemplateDefinitionCommand(definition, {
      type: "batch-update-design-field",
      label: "零共同字段提交",
      device: "desktop",
      targets,
      field: "responsive.width",
      value: { value: 80, unit: "%" },
      reviewedPlan: plan,
    });
    expect(result).toMatchObject({ ok: false, changed: false, code: "BATCH_FIELD_NOT_FOUND" });
    expect(result.definition).toBe(definition);
    expect(definition).toEqual(snapshot);
  });

  test("仅 templateId 或 primaryTarget 变化也精确 STALE_BATCH_PLAN 且零写入", () => {
    const setup = addTwoSlots();
    const targets = [target(setup.first.nodeId), target(setup.second.nodeId)];
    const plan = createTemplateInspectorBatchPlan({
      definition: setup.definition,
      device: "desktop",
      targets,
      primaryTarget: targets[0],
    });
    const templateChanged = structuredClone(setup.definition);
    templateChanged.templateId = "changed-template-id";
    const templateSnapshot = structuredClone(templateChanged);
    const templateResult = executeDynamicTemplateDefinitionCommand(templateChanged, {
      type: "batch-update-design-field",
      label: "模板身份陈旧",
      device: "desktop",
      targets,
      primaryTarget: targets[0],
      field: "responsive.width",
      value: { value: 80, unit: "%" },
      reviewedPlan: plan,
    });
    expect(templateResult).toMatchObject({ ok: false, changed: false, code: "STALE_BATCH_PLAN" });
    expect(templateResult.definition).toBe(templateChanged);
    expect(templateChanged).toEqual(templateSnapshot);

    const primarySnapshot = structuredClone(setup.definition);
    const primaryResult = executeDynamicTemplateDefinitionCommand(setup.definition, {
      type: "batch-update-design-field",
      label: "主目标陈旧",
      device: "desktop",
      targets,
      primaryTarget: targets[1],
      field: "responsive.width",
      value: { value: 80, unit: "%" },
      reviewedPlan: plan,
    });
    expect(primaryResult).toMatchObject({ ok: false, changed: false, code: "STALE_BATCH_PLAN" });
    expect(primaryResult.definition).toBe(setup.definition);
    expect(setup.definition).toEqual(primarySnapshot);
  });

  test("合法 3 目标一次原子写入、同值 no-change、失败回原定义，并由现有 session 一步撤销", () => {
    let definition = createNewDynamicTemplateDraft("三目标原子写").definition;
    const region = addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
    definition = region.definition;
    const nodeIds: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const added = addDynamicTemplateNode(definition, region.nodeId, "ImageSlot");
      definition = added.definition;
      nodeIds.push(added.nodeId);
    }
    const targets = nodeIds.map((nodeId) => target(nodeId));
    const plan = createTemplateInspectorBatchPlan({ definition, device: "desktop", targets, primaryTarget: targets[1] });
    const pageFieldsBefore = getDynamicTemplatePageFieldDescriptors(definition);
    const declarationsBefore = Object.values(definition.slots).map((slot) => ({
      slotId: slot.slotId,
      stableKey: slot.key,
      label: slot.label,
      required: slot.required,
      editable: slot.editable,
      hideable: slot.hideable,
      validation: structuredClone(slot.validation),
    }));
    const identityBefore = Object.values(definition.nodes).map((node) => ({
      nodeId: node.nodeId,
      slotId: node.slotId,
      childIds: [...node.childIds],
    }));
    const defaultContentBefore = structuredClone(definition.defaultContent);
    const result = executeDynamicTemplateDefinitionCommand(definition, {
      type: "batch-update-design-field",
      label: "批量设置宽度",
      device: "desktop",
      targets,
      primaryTarget: targets[1],
      field: "responsive.width",
      value: { value: 84, unit: "%" },
      reviewedPlan: plan,
    });
    expect(result).toMatchObject({ ok: true, changed: true, code: "APPLIED" });
    if (!result.ok) throw new Error(result.message);
    for (const nodeId of nodeIds) {
      expect(result.definition.nodes[nodeId].responsive.desktop.width).toEqual({ value: 84, unit: "%" });
    }
    expect(Object.values(result.definition.nodes).map((node) => ({ nodeId: node.nodeId, slotId: node.slotId, childIds: node.childIds }))).toEqual(identityBefore);
    expect(Object.values(result.definition.slots).map((slot) => ({
      slotId: slot.slotId,
      stableKey: slot.key,
      label: slot.label,
      required: slot.required,
      editable: slot.editable,
      hideable: slot.hideable,
      validation: slot.validation,
    }))).toEqual(declarationsBefore);
    expect(result.definition.defaultContent).toEqual(defaultContentBefore);
    expect(getDynamicTemplatePageFieldDescriptors(result.definition)).toEqual(pageFieldsBefore);

    const noChangePlan = createTemplateInspectorBatchPlan({
      definition: result.definition,
      device: "desktop",
      targets,
      primaryTarget: targets[1],
    });
    const noChange = executeDynamicTemplateDefinitionCommand(result.definition, {
      type: "batch-update-design-field",
      label: "重复批量宽度",
      device: "desktop",
      targets,
      primaryTarget: targets[1],
      field: "responsive.width",
      value: { unit: "%", value: 84 },
      reviewedPlan: noChangePlan,
    });
    expect(noChange).toMatchObject({ ok: true, changed: false, code: "NO_CHANGE" });

    for (const invalidValue of [{ value: -1, unit: "px" }, () => "不可克隆"] as const) {
      const failed = executeDynamicTemplateDefinitionCommand(definition, {
        type: "batch-update-design-field",
        label: "非法批量宽度",
        device: "desktop",
        targets,
        primaryTarget: targets[1],
        field: "responsive.width",
        value: invalidValue,
        reviewedPlan: plan,
      });
      expect(failed).toMatchObject({ ok: false, changed: false });
      expect(["INVALID_OPERATION_RESULT", "COMMAND_FAILED"]).toContain(failed.code);
      expect(failed.definition).toBe(definition);
    }
    const cancelled = executeDynamicTemplateDefinitionCommand(definition, undefined as never);
    expect(cancelled).toMatchObject({ ok: false, changed: false, code: "INVALID_COMMAND", definition });
    const emptyPlan = createTemplateInspectorBatchPlan({ definition, device: "desktop", targets: [] });
    const emptySelection = executeDynamicTemplateDefinitionCommand(definition, {
      type: "batch-update-design-field",
      label: "空选择批量宽度",
      device: "desktop",
      targets: [],
      field: "responsive.width",
      value: { value: 84, unit: "%" },
      reviewedPlan: emptyPlan,
    });
    expect(emptySelection).toMatchObject({ ok: false, changed: false, code: "EMPTY_BATCH_SELECTION", definition });

    useTemplateEditorSession.getState().open({
      format: "dynamic",
      sourceType: "local",
      localDraftId: definition.templateId,
      versionNote: "",
      definition,
    });
    const sessionResult = useTemplateEditorSession.getState().executeCommand({
      type: "batch-update-design-field",
      label: "批量设置宽度",
      device: "desktop",
      targets,
      primaryTarget: targets[1],
      field: "responsive.width",
      value: { value: 84, unit: "%" },
      reviewedPlan: plan,
    });
    expect(sessionResult).toMatchObject({ ok: true, changed: true });
    expect(useTemplateEditorSession.getState().historyPast).toHaveLength(1);
    useTemplateEditorSession.getState().undo();
    expect(useTemplateEditorSession.getState().draft!.definition).toEqual(definition);
    expect(useTemplateEditorSession.getState().historyPast).toHaveLength(0);
  });
});
