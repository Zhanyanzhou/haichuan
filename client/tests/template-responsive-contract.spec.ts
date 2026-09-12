import { expect, test } from "@playwright/test";
import {
  createBlankDynamicTemplateDefinition,
  createDynamicTemplateNode,
  createDynamicTemplateSlotDefinition,
} from "../src/page-builder/template-definition/nodeRegistry";
import {
  getTemplateNodeRuleSource,
  resetTemplateNodeRule,
  resetTemplateSlotRule,
  resolveTemplateBreakpoint,
  resolveTemplateDefinitionForBreakpoint,
  resolveTemplateNodeRules,
  resolveTemplateSlotRules,
  setTemplateNodeRule,
  setTemplateSlotRule,
} from "../src/page-builder/template-definition/responsive";
import { getDynamicTemplateStructureLockViolation, validateDynamicTemplateDefinition, validateDynamicTemplatePublishDefinition } from "../src/page-builder/template-definition/validateTemplateDefinition";
import { compileDynamicTemplateRenderPlan } from "../src/page-builder/template-definition/renderPlan";
import { normalizeTemplateDimensionContract } from "../src/page-builder/template-definition/templateDimensions";
import type { TemplateDefinitionV2 } from "../src/page-builder/template-definition/generated/templateDefinition.generated";
import { addDynamicTemplateNode, DynamicTemplateOperationError, moveDynamicTemplateNode } from "../src/page-builder/template-definition/operations";

function fixture() {
  const definition = createBlankDynamicTemplateDefinition("响应式合同测试");
  const region = createDynamicTemplateNode("Container", "内容区域");
  const slot = createDynamicTemplateSlotDefinition("image", "作品图片", "artworkImage");
  const image = createDynamicTemplateNode("ImageSlot", "图片", slot.slotId);
  region.responsive.mobile = {};
  image.responsive.mobile = {};
  slot.mobileRules = {};
  definition.nodes[definition.rootNodeId].childIds = [region.nodeId];
  region.childIds = [image.nodeId];
  definition.nodes[region.nodeId] = region;
  definition.nodes[image.nodeId] = image;
  definition.slots[slot.slotId] = slot;
  return { definition, regionId: region.nodeId, imageId: image.nodeId, slotId: slot.slotId };
}

function legacyFixture(): TemplateDefinitionV2 {
  const { definition } = fixture();
  definition.schemaVersion = 1;
  delete definition.metadata.previewTabletWidth;
  definition.metadata.mobileBreakpoint = 900;
  for (const node of Object.values(definition.nodes)) node.responsive.mobile = structuredClone(node.responsive.desktop);
  for (const slot of Object.values(definition.slots)) slot.mobileRules = { aspectRatio: "4:5" };
  return definition;
}

test.describe("模板响应式合同：纯函数与客户端校验边界", () => {
  test("运行时传入旧节点类型时受控拒绝，不进入未登记 Registry", () => {
    const definition = createBlankDynamicTemplateDefinition("旧节点拒绝测试");
    expect(() => addDynamicTemplateNode(
      definition,
      definition.rootNodeId,
      "Carousel" as Parameters<typeof addDynamicTemplateNode>[2],
    )).toThrow(new DynamicTemplateOperationError(
      "UNKNOWN_NODE_TYPE",
      "节点类型未登记，无法添加到模板。",
    ));
  });

  test("新增和移动跨自由布局与流式布局时取消定位继承，普通流式节点保持稀疏覆盖", () => {
    const definition = createBlankDynamicTemplateDefinition("混合布局");
    const flow = createDynamicTemplateNode("Container", "流式区域");
    flow.responsive.mobile = {};
    definition.nodes[flow.nodeId] = flow;
    definition.nodes[definition.rootNodeId].childIds.push(flow.nodeId);
    const stage = createDynamicTemplateNode("Stack", "自由区域");
    stage.responsive.desktop.layoutMode = "free";
    stage.responsive.desktop.height = { mode: "fixed", value: { value: 600, unit: "px" } };
    stage.responsive.mobile = { layoutMode: "flow", height: { mode: "auto" } };
    definition.nodes[stage.nodeId] = stage;
    definition.nodes[definition.rootNodeId].childIds.push(stage.nodeId);
    const added = addDynamicTemplateNode(definition, stage.nodeId, "HeadingSlot");
    expect(resolveTemplateNodeRules(added.definition, added.nodeId, "desktop").placement).toBeDefined();
    expect(resolveTemplateNodeRules(added.definition, added.nodeId, "tablet").placement).toBeDefined();
    expect(added.definition.nodes[added.nodeId].responsive.mobile.placement).toBeNull();
    expect(validateDynamicTemplateDefinition(added.definition).valid).toBe(true);
    const flowed = moveDynamicTemplateNode(added.definition, added.nodeId, flow.nodeId);
    for (const device of ["desktop", "tablet", "mobile"] as const) expect(resolveTemplateNodeRules(flowed, added.nodeId, device).placement).toBeUndefined();
    const returned = moveDynamicTemplateNode(flowed, added.nodeId, stage.nodeId);
    expect(resolveTemplateNodeRules(returned, added.nodeId, "desktop").placement).toBeDefined();
    expect(resolveTemplateNodeRules(returned, added.nodeId, "mobile").placement).toBeUndefined();
    expect(validateDynamicTemplateDefinition(returned).valid).toBe(true);
    const plain = addDynamicTemplateNode(definition, flow.nodeId, "HeadingSlot");
    expect(plain.definition.nodes[plain.nodeId].responsive.tablet).toBeUndefined();
    expect(plain.definition.nodes[plain.nodeId].responsive.mobile).toEqual({});
  });
  test("锁定对象允许新增兄弟自然回流，但拒绝存续兄弟跨越其层序", () => {
    const { definition, regionId, imageId } = fixture();
    definition.nodes[imageId].authoring = { structureLocked: true };
    const sibling = createDynamicTemplateNode("Stack", "未锁定兄弟");
    definition.nodes[sibling.nodeId] = sibling;
    definition.nodes[regionId].childIds.push(sibling.nodeId);
    const next = structuredClone(definition);
    const added = createDynamicTemplateNode("Stack", "新兄弟");
    next.nodes[added.nodeId] = added;
    next.nodes[regionId].childIds.unshift(added.nodeId);
    expect(getDynamicTemplateStructureLockViolation(definition, next)).toBeNull();
    next.nodes[regionId].childIds = [sibling.nodeId, imageId, added.nodeId];
    expect(getDynamicTemplateStructureLockViolation(definition, next)).toContain("同级顺序");
  });
  test("新草稿只持有 Desktop 基值和空 Mobile 覆盖", () => {
    const definition = createBlankDynamicTemplateDefinition();
    expect(definition.schemaVersion).toBe(2);
    expect(definition.nodes[definition.rootNodeId].responsive.mobile).toEqual({});
    expect(definition.defaultContent).toEqual({});
    expect(validateDynamicTemplateDefinition(definition).valid).toBe(true);
  });

  test("v1 原有双端与自定义边界保持原样，不自动继承或迁移", () => {
    const definition = legacyFixture();
    const root = definition.nodes[definition.rootNodeId];
    root.responsive.desktop.width = { value: 80, unit: "%" };
    root.responsive.mobile.width = { value: 320, unit: "px" };
    const before = JSON.stringify(definition);
    expect(validateDynamicTemplateDefinition(definition).definition).toBe(definition);
    expect(resolveTemplateNodeRules(definition, root.nodeId, "mobile").width).toEqual({ value: 320, unit: "px" });
    expect(resolveTemplateBreakpoint(definition, 900)).toBe("mobile");
    expect(resolveTemplateBreakpoint(definition, 901)).toBe("desktop");
    expect(JSON.stringify(definition)).toBe(before);
    expect(() => setTemplateNodeRule(definition, root.nodeId, "tablet", "width", "fill")).toThrow("旧模板");
  });

  test("新断点在 767/768/1023/1024 精确切换", () => {
    const { definition } = fixture();
    expect([767, 768, 1023, 1024].map((width) => resolveTemplateBreakpoint(definition, width))).toEqual(["mobile", "tablet", "tablet", "desktop"]);
    expect(() => resolveTemplateBreakpoint(definition, Number.NaN)).toThrow();
  });

  test("Tablet 与 Mobile 按属性继承，四边间距不复制无关成员", () => {
    const { definition, regionId } = fixture();
    setTemplateNodeRule(definition, regionId, "desktop", "gap", { value: 24, unit: "px" });
    setTemplateNodeRule(definition, regionId, "tablet", "padding", { top: { value: 16, unit: "px" } });
    setTemplateNodeRule(definition, regionId, "mobile", "padding.bottom", { value: 8, unit: "px" });
    const effective = resolveTemplateNodeRules(definition, regionId, "mobile");
    expect(effective.padding).toEqual({ top: { value: 16, unit: "px" }, right: { value: 0, unit: "px" }, bottom: { value: 8, unit: "px" }, left: { value: 0, unit: "px" } });
    expect(effective.gap).toEqual({ value: 24, unit: "px" });
    expect(definition.nodes[regionId].responsive.mobile).toEqual({ padding: { bottom: { value: 8, unit: "px" } } });
    expect(getTemplateNodeRuleSource(definition, regionId, "mobile", "padding.top")).toBe("tablet");
    expect(getTemplateNodeRuleSource(definition, regionId, "mobile", "padding.bottom")).toBe("mobile");
    expect(validateDynamicTemplateDefinition(definition).valid).toBe(true);
  });

  test("显式等值覆盖保留意图，恢复继承后才跟随基础值", () => {
    const { definition, regionId } = fixture();
    setTemplateNodeRule(definition, regionId, "desktop", "gap", { value: 24, unit: "px" });
    setTemplateNodeRule(definition, regionId, "mobile", ["gap"], { value: 24, unit: "px" });
    setTemplateNodeRule(definition, regionId, "desktop", "gap", { value: 32, unit: "px" });
    expect(resolveTemplateNodeRules(definition, regionId, "mobile").gap?.value).toBe(24);
    resetTemplateNodeRule(definition, regionId, "mobile", "gap");
    expect(resolveTemplateNodeRules(definition, regionId, "mobile").gap?.value).toBe(32);
    expect(definition.nodes[regionId].responsive.mobile).toEqual({});
  });

  test("恢复本来就继承的字段不创建空对象或改变文档", () => {
    const { definition, regionId, slotId } = fixture();
    const before = JSON.stringify(definition);
    resetTemplateNodeRule(definition, regionId, "tablet", "gap");
    resetTemplateSlotRule(definition, slotId, "tablet", "fontSize");
    expect(JSON.stringify(definition)).toBe(before);
  });

  test("空分组首次直接设置内边距：Desktop补全四边，Mobile只保存被修改的一边", () => {
    const { definition, regionId } = fixture();
    setTemplateNodeRule(definition, regionId, "desktop", ["padding", "top"], { value: 24, unit: "px" });
    expect(definition.nodes[regionId].responsive.desktop.padding?.left).toEqual({ value: 0, unit: "px" });
    setTemplateNodeRule(definition, regionId, "mobile", ["margin", "bottom"], { value: 8, unit: "px" });
    setTemplateNodeRule(definition, regionId, "mobile", "gap", { value: 12, unit: "px" });
    expect(definition.nodes[regionId].responsive.mobile.margin).toEqual({ bottom: { value: 8, unit: "px" } });
    expect(validateDynamicTemplateDefinition(definition).valid).toBe(true);
  });

  test("断点隐藏与恢复保留原排列方式", () => {
    const { definition, regionId } = fixture();
    setTemplateNodeRule(definition, regionId, "desktop", "display", "grid");
    setTemplateNodeRule(definition, regionId, "desktop", "columns", [1, 1, 1]);
    setTemplateNodeRule(definition, regionId, "tablet", "hidden", true);
    setTemplateNodeRule(definition, regionId, "mobile", "hidden", false);
    const tablet = compileDynamicTemplateRenderPlan(definition, { device: "desktop", breakpoint: "tablet", showEmptySlots: true });
    const mobile = compileDynamicTemplateRenderPlan(definition, { device: "mobile", breakpoint: "mobile", showEmptySlots: true });
    expect(tablet.ok && tablet.plan.root.children[0].hidden).toBe(true);
    expect(mobile.ok && mobile.plan.root.children[0].hidden).toBe(false);
    expect(resolveTemplateNodeRules(definition, regionId, "mobile").display).toBe("grid");
    resetTemplateNodeRule(definition, regionId, "tablet", "hidden");
    expect(resolveTemplateNodeRules(definition, regionId, "tablet").display).toBe("grid");
  });

  test("图片精确焦点继承与恢复，v1 继续限制为旧预设", () => {
    const { definition, slotId } = fixture();
    setTemplateSlotRule(definition, slotId, "tablet", "objectPosition", "37.5% 80%");
    expect(resolveTemplateSlotRules(definition, slotId, "mobile").objectPosition).toBe("37.5% 80%");
    setTemplateSlotRule(definition, slotId, "mobile", "objectPosition", "10% 20%");
    resetTemplateSlotRule(definition, slotId, "mobile", "objectPosition");
    expect(resolveTemplateSlotRules(definition, slotId, "mobile").objectPosition).toBe("37.5% 80%");
    expect(validateDynamicTemplateDefinition(definition).valid).toBe(true);
    definition.slots[slotId].mobileRules.objectPosition = "101% 20%";
    expect(validateDynamicTemplateDefinition(definition).valid).toBe(false);
    const legacy = legacyFixture();
    Object.values(legacy.slots)[0].desktopRules.objectPosition = "37.5% 80%";
    expect(validateDynamicTemplateDefinition(legacy).valid).toBe(false);
  });

  test("稀疏覆盖非法值和未知字段由客户端合同拒绝", () => {
    const { definition, regionId } = fixture();
    definition.nodes[regionId].responsive.tablet = { width: { value: -2, unit: "px" } };
    expect(validateDynamicTemplateDefinition(definition).valid).toBe(false);
    (definition.nodes[regionId].responsive.tablet as Record<string, unknown>).position = "fixed";
    expect(validateDynamicTemplateDefinition(definition).issues.some((issue) => issue.path.endsWith("position"))).toBe(true);
    expect(() => setTemplateNodeRule(definition, regionId, "mobile", "__proto__.value", 1)).toThrow();
  });

  test("有明确最小高度的流式容器可以局部锚定；根或无高度父容器拒绝", () => {
    const { definition, regionId, imageId } = fixture();
    const anchor = { horizontal: "right", vertical: "bottom", offsetX: { value: -12, unit: "px" }, offsetY: { value: 0, unit: "%" } };
    setTemplateNodeRule(definition, imageId, "desktop", "anchor", anchor);
    expect(validateDynamicTemplateDefinition(definition).issues.some((issue) => issue.code === "ANCHOR_REQUIRES_SIZED_PARENT")).toBe(true);
    setTemplateNodeRule(definition, regionId, "desktop", "minHeight", { value: 320, unit: "px" });
    expect(validateDynamicTemplateDefinition(definition).valid).toBe(true);
    setTemplateNodeRule(definition, definition.rootNodeId, "desktop", "anchor", anchor);
    expect(validateDynamicTemplateDefinition(definition).valid).toBe(false);
  });

  test("Mobile可以明确脱离继承锚点，恢复继承则重新采用上游锚点", () => {
    const { definition, regionId, imageId } = fixture();
    setTemplateNodeRule(definition, regionId, "desktop", "minHeight", { value: 320, unit: "px" });
    const anchor = { horizontal: "left", vertical: "top", offsetX: { value: 0, unit: "px" }, offsetY: { value: 0, unit: "px" } };
    setTemplateNodeRule(definition, imageId, "desktop", "anchor", anchor);
    setTemplateNodeRule(definition, imageId, "desktop", "placement", { x: 0, y: 0, width: 0.5, height: 0.5, zIndex: 0 });
    setTemplateNodeRule(definition, imageId, "mobile", "anchor", null);
    setTemplateNodeRule(definition, imageId, "mobile", "placement", null);
    expect(resolveTemplateNodeRules(definition, imageId, "mobile").anchor).toBeUndefined();
    expect(resolveTemplateNodeRules(definition, imageId, "mobile").placement).toBeUndefined();
    expect(definition.nodes[imageId].responsive.mobile).toEqual({ anchor: null, placement: null });
    expect(validateDynamicTemplateDefinition(definition).valid).toBe(true);
    resetTemplateNodeRule(definition, imageId, "mobile", "anchor");
    expect(resolveTemplateNodeRules(definition, imageId, "mobile").anchor).toEqual(anchor);
  });

  test("v2 换行、最小宽度、最大高度和 fit/fill 高度有合同消费者", () => {
    const { definition, regionId } = fixture();
    setTemplateNodeRule(definition, regionId, "desktop", "display", "flex");
    setTemplateNodeRule(definition, regionId, "desktop", "wrap", "wrap");
    setTemplateNodeRule(definition, regionId, "tablet", "minWidth", { value: 100, unit: "px" });
    setTemplateNodeRule(definition, regionId, "mobile", "height", { mode: "fit" });
    setTemplateNodeRule(definition, regionId, "mobile", "maxHeight", { value: 400, unit: "px" });
    expect(validateDynamicTemplateDefinition(definition).valid).toBe(true);
    const result = compileDynamicTemplateRenderPlan(definition, { device: "mobile", breakpoint: "mobile", showEmptySlots: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.plan.root.children[0].rules).toMatchObject({ wrap: "wrap", minWidth: { value: 100, unit: "px" }, height: { mode: "fit" }, maxHeight: { value: 400, unit: "px" } });
  });

  test("投影与尺寸规范化不会改写稀疏文档，公开计划读取同一有效值", () => {
    const { definition, regionId } = fixture();
    setTemplateNodeRule(definition, regionId, "desktop", "display", "grid");
    setTemplateNodeRule(definition, regionId, "desktop", "columns", [1, 1, 1]);
    setTemplateNodeRule(definition, regionId, "tablet", "columns", [1, 1]);
    setTemplateNodeRule(definition, regionId, "mobile", "columns", [1]);
    const before = JSON.stringify(definition);
    const projected = resolveTemplateDefinitionForBreakpoint(definition, "tablet");
    expect(projected.nodes[regionId].responsive.mobile.columns).toEqual([1, 1]);
    const plan = compileDynamicTemplateRenderPlan(definition, { device: "desktop", breakpoint: "tablet", showEmptySlots: true });
    expect(plan.ok && plan.plan.root.children[0].rules.columns).toEqual([1, 1]);
    expect(JSON.stringify(normalizeTemplateDimensionContract(definition))).toBe(before);
    expect(JSON.stringify(definition)).toBe(before);
  });

  test("新定义拒绝试排内容和未知 schema，发布检查覆盖 Tablet 隐藏", () => {
    const { definition, imageId, slotId } = fixture();
    definition.slots[slotId].required = true;
    definition.slots[slotId].hideable = false;
    setTemplateNodeRule(definition, imageId, "tablet", "display", "none");
    expect(validateDynamicTemplatePublishDefinition(definition).issues.some((issue) => issue.path.includes("tablet.display"))).toBe(true);
    definition.defaultContent[slotId] = { src: "/trial-only.jpg" };
    expect(validateDynamicTemplateDefinition(definition).valid).toBe(false);
    expect(validateDynamicTemplateDefinition({ ...definition, defaultContent: {}, schemaVersion: 3 }).valid).toBe(true);
    expect(validateDynamicTemplateDefinition({ ...definition, defaultContent: {}, schemaVersion: 999 }).valid).toBe(false);
  });

  test("必填槽位被上级隐藏时客户端发布门禁定位同一上级和三端", () => {
    const tabletCase = fixture();
    tabletCase.definition.slots[tabletCase.slotId].required = true;
    tabletCase.definition.slots[tabletCase.slotId].hideable = false;
    setTemplateNodeRule(tabletCase.definition, tabletCase.regionId, "tablet", "hidden", true);
    const clientTablet = validateDynamicTemplatePublishDefinition(tabletCase.definition).issues
      .filter((issue) => issue.code === "PUBLISH_REQUIRED_SLOT_DEVICE_HIDDEN");
    expect(clientTablet.map((issue) => [issue.nodeId, issue.path])).toEqual([
      [tabletCase.regionId, `nodes.${tabletCase.regionId}.responsive.tablet.display`],
      [tabletCase.regionId, `nodes.${tabletCase.regionId}.responsive.mobile.display`],
    ]);

    const globalCase = fixture();
    globalCase.definition.slots[globalCase.slotId].required = true;
    globalCase.definition.slots[globalCase.slotId].hideable = false;
    globalCase.definition.nodes[globalCase.regionId].hidden = true;
    const issue = validateDynamicTemplatePublishDefinition(globalCase.definition).issues.find((candidate) => candidate.code === "PUBLISH_REQUIRED_SLOT_HIDDEN");
    expect(issue).toMatchObject({
      nodeId: globalCase.regionId,
      path: `nodes.${globalCase.regionId}.hidden`,
    });
    expect(issue?.message).toContain("因上级");
  });
});
