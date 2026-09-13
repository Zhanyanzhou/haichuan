import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { getContentTemplateContract } from "../src/page-builder/generated/contentTemplates.generated";
import {
  addDynamicTemplateLayoutGroup,
  addDynamicTemplateNode,
  compileDynamicTemplateRenderPlan,
  createBlankDynamicTemplateDefinition,
  getDynamicTemplateGroupDisabledReason,
  getDynamicTemplateInsertionLandings,
  getDynamicTemplateMoveLandings,
  getDynamicTemplateRegionInsertionLandings,
  groupDynamicTemplateNodes,
  moveDynamicTemplateNode,
  moveDynamicTemplateNodeToLanding,
  removeDynamicTemplateNode,
  reorderDynamicTemplateNode,
  resolveDynamicTemplateMoveLanding,
  resolveDynamicTemplateMoveShortcutLanding,
  resolveEditableTargets,
  setDynamicTemplateNodeStructureLocked,
  ungroupDynamicTemplateNode,
  type DynamicTemplateRenderPlan,
  type DynamicTemplateRenderPlanNode,
  type EditableTargetDescriptor,
  type TemplateDefinitionV2,
} from "../src/page-builder/template-definition";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const clientRoot = resolve(testDirectory, "..");
const fixtureHtml = `<!doctype html>
  <html lang="zh-CN">
    <head><meta charset="utf-8" /></head>
    <body>
      <div id="root"></div>
      <script type="module">
        import RefreshRuntime from "/@react-refresh";
        RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {};
        window.$RefreshSig$ = () => (type) => type;
        window.__vite_plugin_react_preamble_installed__ = true;
      </script>
      <script type="module" src="/tests/fixtures/editable-targets.tsx"></script>
    </body>
  </html>`;

test.describe("TD-2 模板结构 typed operations", () => {
  test("布局分组与解除分组保持节点和槽位身份", () => {
    let definition = createBlankDynamicTemplateDefinition("布局分组身份测试");
    const region = addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
    definition = region.definition;
    const heading = addDynamicTemplateNode(definition, region.nodeId, "HeadingSlot");
    definition = heading.definition;
    const text = addDynamicTemplateNode(definition, region.nodeId, "TextSlot");
    definition = text.definition;
    const originalNodeIds = [heading.nodeId, text.nodeId];
    const originalSlotIds = originalNodeIds.map((nodeId) => definition.nodes[nodeId].slotId);

    const grouped = groupDynamicTemplateNodes(definition, originalNodeIds, "horizontal");
    expect(grouped.definition.nodes[grouped.nodeId].type).toBe("Row");
    expect(grouped.definition.nodes[grouped.nodeId].childIds).toEqual(originalNodeIds);
    expect(originalNodeIds.map((nodeId) => grouped.definition.nodes[nodeId].slotId)).toEqual(originalSlotIds);

    const ungrouped = ungroupDynamicTemplateNode(grouped.definition, grouped.nodeId);
    expect(ungrouped.nodes[region.nodeId].childIds).toEqual(originalNodeIds);
    expect(ungrouped.nodes[grouped.nodeId]).toBeUndefined();
    expect(originalNodeIds.map((nodeId) => ungrouped.nodes[nodeId].slotId)).toEqual(originalSlotIds);
  });

  test("Row 下纵向与空白组使用 Column，其他父级继续使用 Stack", () => {
    let definition = createBlankDynamicTemplateDefinition("布局组父级适配测试");
    const region = addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
    definition = region.definition;

    const regularVertical = addDynamicTemplateLayoutGroup(definition, region.nodeId, "vertical");
    definition = regularVertical.definition;
    expect(definition.nodes[regularVertical.nodeId].type).toBe("Stack");

    const row = addDynamicTemplateNode(definition, region.nodeId, "Row");
    definition = row.definition;
    const rowVertical = addDynamicTemplateLayoutGroup(definition, row.nodeId, "vertical");
    definition = rowVertical.definition;
    const rowEmpty = addDynamicTemplateLayoutGroup(definition, row.nodeId, "empty");
    definition = rowEmpty.definition;
    expect(definition.nodes[rowVertical.nodeId].type).toBe("Column");
    expect(definition.nodes[rowEmpty.nodeId].type).toBe("Column");

    const first = addDynamicTemplateNode(definition, row.nodeId, "Spacer");
    definition = first.definition;
    const second = addDynamicTemplateNode(definition, row.nodeId, "Divider");
    definition = second.definition;
    const grouped = groupDynamicTemplateNodes(definition, [first.nodeId, second.nodeId], "vertical");
    expect(grouped.definition.nodes[grouped.nodeId].type).toBe("Column");
    expect(grouped.definition.nodes[grouped.nodeId].childIds).toEqual([first.nodeId, second.nodeId]);
  });

  test("结构落点统一修正同父级向后移动并拒绝循环与锁定目标", () => {
    let definition = createBlankDynamicTemplateDefinition("结构落点测试");
    const firstRegion = addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
    definition = firstRegion.definition;
    const secondRegion = addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
    definition = secondRegion.definition;
    const first = addDynamicTemplateNode(definition, firstRegion.nodeId, "HeadingSlot");
    definition = first.definition;
    const second = addDynamicTemplateNode(definition, firstRegion.nodeId, "TextSlot");
    definition = second.definition;
    const third = addDynamicTemplateNode(definition, firstRegion.nodeId, "ButtonSlot");
    definition = third.definition;

    const afterThird = getDynamicTemplateMoveLandings(definition, first.nodeId).find((landing) => (
      landing.targetNodeId === third.nodeId && landing.placement === "after"
    ));
    expect(afterThird?.disabledReason).toBeNull();
    definition = moveDynamicTemplateNodeToLanding(definition, first.nodeId, afterThird!);
    expect(definition.nodes[firstRegion.nodeId].childIds).toEqual([second.nodeId, third.nodeId, first.nodeId]);

    const nested = addDynamicTemplateNode(definition, firstRegion.nodeId, "Stack");
    definition = nested.definition;
    const cycleLanding = getDynamicTemplateMoveLandings(definition, firstRegion.nodeId)
      .find((landing) => landing.parentId === nested.nodeId && landing.placement === "inside");
    expect(cycleLanding?.disabledReason).toContain("自身或后代");

    definition = setDynamicTemplateNodeStructureLocked(definition, secondRegion.nodeId, true);
    const lockedLandings = getDynamicTemplateMoveLandings(definition, first.nodeId)
      .filter((landing) => landing.parentId === secondRegion.nodeId);
    expect(lockedLandings.length).toBeGreaterThan(0);
    expect(lockedLandings.every((landing) => landing.disabledReason?.includes("已锁定"))).toBe(true);
  });

  test("移动落点在枚举阶段拒绝锁定源和会改变锁定兄弟顺序的目标", () => {
    let definition = createBlankDynamicTemplateDefinition("移动锁定边界测试");
    const region = addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
    definition = region.definition;
    const moving = addDynamicTemplateNode(definition, region.nodeId, "HeadingSlot");
    definition = moving.definition;
    const lockedSibling = addDynamicTemplateNode(definition, region.nodeId, "TextSlot");
    definition = lockedSibling.definition;

    definition = setDynamicTemplateNodeStructureLocked(definition, moving.nodeId, true);
    const sourceLockedLanding = getDynamicTemplateMoveLandings(definition, moving.nodeId)
      .find((landing) => landing.parentId === region.nodeId && landing.placement === "inside");
    expect(sourceLockedLanding?.disabledReason).toContain("已锁定");
    expect(() => moveDynamicTemplateNodeToLanding(definition, moving.nodeId, sourceLockedLanding!))
      .toThrow(/已锁定/);

    definition = setDynamicTemplateNodeStructureLocked(definition, moving.nodeId, false);
    definition = setDynamicTemplateNodeStructureLocked(definition, lockedSibling.nodeId, true);
    const siblingShiftLanding = getDynamicTemplateMoveLandings(definition, moving.nodeId)
      .find((landing) => landing.parentId === region.nodeId && landing.placement === "inside");
    expect(siblingShiftLanding?.disabledReason).toContain("已锁定");
    expect(() => moveDynamicTemplateNodeToLanding(definition, moving.nodeId, siblingShiftLanding!))
      .toThrow(/已锁定/);
  });

  test("真实 no-op、循环和非法分组在 typed operation 边界被拒绝", () => {
    let definition = createBlankDynamicTemplateDefinition("结构非法操作测试");
    const region = addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
    definition = region.definition;
    const first = addDynamicTemplateNode(definition, region.nodeId, "HeadingSlot");
    definition = first.definition;
    const second = addDynamicTemplateNode(definition, region.nodeId, "TextSlot");
    definition = second.definition;
    const nested = addDynamicTemplateNode(definition, region.nodeId, "Stack");
    definition = nested.definition;

    const landings = getDynamicTemplateMoveLandings(definition, first.nodeId);
    const noOpLanding = landings.find((landing) => (
      landing.targetNodeId === second.nodeId && landing.placement === "before"
    ));
    expect(noOpLanding?.disabledReason).toBe("对象已在该位置");
    expect(() => moveDynamicTemplateNodeToLanding(definition, first.nodeId, noOpLanding!))
      .toThrow(/已在该位置/);

    const menuLanding = resolveDynamicTemplateMoveLanding(definition, first.nodeId, {
      landingId: `${region.nodeId}:${second.nodeId}:after`,
    });
    const dragLanding = resolveDynamicTemplateMoveLanding(definition, first.nodeId, {
      targetNodeId: second.nodeId,
      placement: "after",
    });
    expect(menuLanding).toEqual(dragLanding);

    const cycleLanding = getDynamicTemplateMoveLandings(definition, region.nodeId)
      .find((landing) => landing.parentId === nested.nodeId && landing.placement === "inside");
    expect(cycleLanding?.disabledReason).toContain("自身或后代");

    definition = setDynamicTemplateNodeStructureLocked(definition, second.nodeId, true);
    expect(getDynamicTemplateGroupDisabledReason(definition, [first.nodeId, second.nodeId], "horizontal"))
      .toContain("已锁定");
    expect(() => groupDynamicTemplateNodes(definition, [first.nodeId, second.nodeId], "horizontal"))
      .toThrow(/已锁定/);

    definition = setDynamicTemplateNodeStructureLocked(definition, second.nodeId, false);
    const grouped = groupDynamicTemplateNodes(definition, [first.nodeId, second.nodeId], "horizontal");
    const lockedGroup = setDynamicTemplateNodeStructureLocked(grouped.definition, grouped.nodeId, true);
    expect(() => ungroupDynamicTemplateNode(lockedGroup, grouped.nodeId)).toThrow(/已锁定/);
  });

  test("添加、菜单与拖拽只消费 operations 的结构落点真源", () => {
    const toolboxSource = readFileSync(
      resolve(clientRoot, "src/page-builder/template-editor/DynamicTemplateToolbox.tsx"),
      "utf8",
    );
    const structureSource = readFileSync(
      resolve(clientRoot, "src/page-builder/template-editor/DynamicTemplateStructurePanel.tsx"),
      "utf8",
    );
    expect(toolboxSource).toContain("getDynamicTemplateInsertionLandings");
    expect(toolboxSource).not.toContain("getDynamicTemplateAllowedInsertionParentIds");
    expect(toolboxSource).not.toContain("findDynamicTemplateInsertionParentId");
    expect(toolboxSource).not.toContain("resolveInsertionIndex");
    expect(toolboxSource).not.toMatch(/type:\s*"(?:Stack|Row|Grid)"/);
    expect(structureSource.match(/resolveDynamicTemplateMoveLanding/g)?.length).toBeGreaterThanOrEqual(3);
    expect(structureSource).toContain("resolveDynamicTemplateMoveShortcutLanding");
    expect(structureSource).not.toContain("reorderDynamicTemplateNode");
  });

  test("快捷、移动到与拖拽对同一锁定落点保持行为一致", () => {
    let definition = createBlankDynamicTemplateDefinition("落点消费行为一致性测试");
    const region = addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
    definition = region.definition;
    const first = addDynamicTemplateNode(definition, region.nodeId, "HeadingSlot");
    definition = first.definition;
    const locked = addDynamicTemplateNode(definition, region.nodeId, "TextSlot");
    definition = locked.definition;
    definition = setDynamicTemplateNodeStructureLocked(definition, locked.nodeId, true);

    const shortcutLanding = resolveDynamicTemplateMoveShortcutLanding(definition, first.nodeId, "down");
    const moveToLanding = resolveDynamicTemplateMoveLanding(definition, first.nodeId, {
      landingId: `${region.nodeId}:${locked.nodeId}:after`,
    });
    const dragLanding = resolveDynamicTemplateMoveLanding(definition, first.nodeId, {
      targetNodeId: locked.nodeId,
      placement: "after",
    });
    expect(shortcutLanding).toEqual(moveToLanding);
    expect(moveToLanding).toEqual(dragLanding);
    expect(shortcutLanding?.disabledReason).toContain("已锁定");
    for (const landing of [shortcutLanding, moveToLanding, dragLanding]) {
      const snapshot = structuredClone(definition);
      expect(() => moveDynamicTemplateNodeToLanding(definition, first.nodeId, landing!))
        .toThrow(/已锁定/);
      expect(definition).toEqual(snapshot);
    }

    const unlocked = setDynamicTemplateNodeStructureLocked(definition, locked.nodeId, false);
    const enabledLandings = [
      resolveDynamicTemplateMoveShortcutLanding(unlocked, first.nodeId, "down"),
      resolveDynamicTemplateMoveLanding(unlocked, first.nodeId, {
        landingId: `${region.nodeId}:${locked.nodeId}:after`,
      }),
      resolveDynamicTemplateMoveLanding(unlocked, first.nodeId, {
        targetNodeId: locked.nodeId,
        placement: "after",
      }),
    ];
    expect(enabledLandings.every((landing) => landing?.disabledReason === null)).toBe(true);
    const movedOrders = enabledLandings.map((landing) => (
      moveDynamicTemplateNodeToLanding(unlocked, first.nodeId, landing!)
        .nodes[region.nodeId].childIds
    ));
    expect(movedOrders).toEqual([
      [locked.nodeId, first.nodeId],
      [locked.nodeId, first.nodeId],
      [locked.nodeId, first.nodeId],
    ]);
  });

  test("上下移、缩进和反缩进只转换为标准结构落点", () => {
    let definition = createBlankDynamicTemplateDefinition("快捷落点映射测试");
    const region = addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
    definition = region.definition;
    const first = addDynamicTemplateNode(definition, region.nodeId, "Stack");
    definition = first.definition;
    const second = addDynamicTemplateNode(definition, region.nodeId, "Row");
    definition = second.definition;
    const child = addDynamicTemplateNode(definition, first.nodeId, "Row");
    definition = child.definition;

    expect(resolveDynamicTemplateMoveShortcutLanding(definition, second.nodeId, "up"))
      .toMatchObject({ targetNodeId: first.nodeId, placement: "before", disabledReason: null });
    expect(resolveDynamicTemplateMoveShortcutLanding(definition, first.nodeId, "down"))
      .toMatchObject({ targetNodeId: second.nodeId, placement: "after", disabledReason: null });
    expect(resolveDynamicTemplateMoveShortcutLanding(definition, second.nodeId, "indent"))
      .toMatchObject({ targetNodeId: first.nodeId, placement: "inside", disabledReason: null });
    expect(resolveDynamicTemplateMoveShortcutLanding(definition, child.nodeId, "outdent"))
      .toMatchObject({ targetNodeId: first.nodeId, placement: "after", disabledReason: null });
  });

  test("陈旧移动落点被拒绝，有效落点按当前顺序重新解析 index", () => {
    let definition = createBlankDynamicTemplateDefinition("陈旧移动落点测试");
    const sourceRegion = addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
    definition = sourceRegion.definition;
    const otherRegion = addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
    definition = otherRegion.definition;
    const moving = addDynamicTemplateNode(definition, sourceRegion.nodeId, "HeadingSlot");
    definition = moving.definition;
    const anchor = addDynamicTemplateNode(definition, sourceRegion.nodeId, "TextSlot");
    definition = anchor.definition;
    const tail = addDynamicTemplateNode(definition, sourceRegion.nodeId, "ButtonSlot");
    definition = tail.definition;
    const staleLanding = getDynamicTemplateMoveLandings(definition, moving.nodeId).find((landing) => (
      landing.targetNodeId === anchor.nodeId && landing.placement === "after"
    ))!;

    const deletedTarget = removeDynamicTemplateNode(definition, anchor.nodeId);
    const deletedSnapshot = structuredClone(deletedTarget);
    expect(() => moveDynamicTemplateNodeToLanding(deletedTarget, moving.nodeId, staleLanding))
      .toThrow(/失效/);
    expect(deletedTarget).toEqual(deletedSnapshot);

    const movedTarget = moveDynamicTemplateNode(definition, anchor.nodeId, otherRegion.nodeId);
    const movedSnapshot = structuredClone(movedTarget);
    expect(() => moveDynamicTemplateNodeToLanding(movedTarget, moving.nodeId, staleLanding))
      .toThrow(/失效/);
    expect(movedTarget).toEqual(movedSnapshot);

    const lockedTarget = setDynamicTemplateNodeStructureLocked(definition, anchor.nodeId, true);
    const lockedSnapshot = structuredClone(lockedTarget);
    expect(() => moveDynamicTemplateNodeToLanding(lockedTarget, moving.nodeId, staleLanding))
      .toThrow(/已锁定/);
    expect(lockedTarget).toEqual(lockedSnapshot);

    const reordered = reorderDynamicTemplateNode(definition, anchor.nodeId, 2);
    const moved = moveDynamicTemplateNodeToLanding(reordered, moving.nodeId, staleLanding);
    expect(moved.nodes[sourceRegion.nodeId].childIds).toEqual([tail.nodeId, anchor.nodeId, moving.nodeId]);
  });

  test("根级区域落点把深层锚点归一到直接区域且保持唯一值", () => {
    let definition = createBlankDynamicTemplateDefinition("根级区域落点测试");
    const region = addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
    definition = region.definition;
    const stack = addDynamicTemplateNode(definition, region.nodeId, "Stack");
    definition = stack.definition;
    const grid = addDynamicTemplateNode(definition, stack.nodeId, "Grid");
    definition = grid.definition;
    const slot = addDynamicTemplateNode(definition, grid.nodeId, "TextSlot");
    definition = slot.definition;

    const rootLandings = getDynamicTemplateRegionInsertionLandings(definition, definition.rootNodeId);
    expect(rootLandings.map((landing) => landing.placement)).toEqual(["end"]);
    const nestedLandings = getDynamicTemplateRegionInsertionLandings(definition, slot.nodeId);
    expect(nestedLandings.map((landing) => landing.placement)).toEqual(["before", "after", "end"]);
    expect(new Set(nestedLandings.map((landing) => landing.landingId)).size).toBe(3);
    expect(nestedLandings.every((landing) => landing.parentId === definition.rootNodeId)).toBe(true);
    expect(getDynamicTemplateInsertionLandings(definition, "Container", slot.nodeId)
      .some((landing) => landing.parentId === stack.nodeId || landing.parentId === grid.nodeId)).toBe(true);
  });

  test("插入落点允许锁定节点外的同级新增，并保持锁定节点自身与子树", () => {
    let definition = createBlankDynamicTemplateDefinition("插入锁定兄弟测试");
    const region = addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
    definition = region.definition;
    const first = addDynamicTemplateNode(definition, region.nodeId, "HeadingSlot");
    definition = first.definition;
    const locked = addDynamicTemplateNode(definition, region.nodeId, "TextSlot");
    definition = locked.definition;
    definition = setDynamicTemplateNodeStructureLocked(definition, locked.nodeId, true);

    const landings = getDynamicTemplateInsertionLandings(definition, "ImageSlot", locked.nodeId);
    const beforeLocked = landings.find((landing) => landing.placement === "before");
    const end = landings.find((landing) => landing.placement === "end");
    expect(beforeLocked?.index).toBe(1);
    expect(beforeLocked?.disabledReason).toBeNull();
    expect(end?.disabledReason).toBeNull();
    expect(definition.nodes[locked.nodeId].authoring?.structureLocked).toBe(true);
    expect(definition.nodes[region.nodeId].childIds).toEqual([first.nodeId, locked.nodeId]);
  });
});

function createProjectionDefinition() {
  let definition = createBlankDynamicTemplateDefinition("身份投影测试");
  const container = addDynamicTemplateNode(
    definition,
    definition.rootNodeId,
    "Container",
  );
  definition = container.definition;
  const hero = addDynamicTemplateNode(definition, container.nodeId, "HeroTemplate");
  definition = hero.definition;
  const heading = addDynamicTemplateNode(definition, container.nodeId, "HeadingSlot");
  definition = heading.definition;
  return { definition, container, hero, heading };
}

function compile(
  definition: TemplateDefinitionV2,
  device: "desktop" | "mobile" = "desktop",
) {
  const result = compileDynamicTemplateRenderPlan(definition, {
    device,
    showEmptySlots: true,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("测试模板未生成 Render Plan");
  return result.plan;
}

function collectOwnKeys(value: unknown, keys = new Set<string>()) {
  if (!value || typeof value !== "object") return keys;
  if (Array.isArray(value)) {
    value.forEach((item) => collectOwnKeys(item, keys));
    return keys;
  }
  Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
    keys.add(key);
    collectOwnKeys(child, keys);
  });
  return keys;
}

function findPlanNode(
  plan: DynamicTemplateRenderPlan,
  nodeId: string,
): DynamicTemplateRenderPlanNode {
  const pending = [plan.root];
  while (pending.length > 0) {
    const node = pending.pop()!;
    if (node.nodeId === nodeId) return node;
    pending.push(...node.children);
  }
  throw new Error(`Render Plan 中缺少节点 ${nodeId}`);
}

test("公开 RenderPlan 对图片只认非空 src，并按 emptyPolicy 收起或回退", () => {
  let definition = createBlankDynamicTemplateDefinition("图片空值语义");
  const region = addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
  definition = region.definition;
  const image = addDynamicTemplateNode(definition, region.nodeId, "ImageSlot");
  definition = image.definition;
  const slotId = image.slotId!;
  const defaultImage = { src: "https://example.com/default.jpg", alt: "模板默认图" };
  const hiddenResult = compileDynamicTemplateRenderPlan(definition, {
    device: "desktop",
    contentBySlotId: { [slotId]: { src: "", alt: "旧数据保留说明" } },
    showEmptySlots: false,
  });
  expect(hiddenResult.ok).toBe(true);
  if (!hiddenResult.ok) throw new Error("图片空值模板未生成 Render Plan");
  expect(findPlanNode(hiddenResult.plan, image.nodeId).hidden).toBe(true);

  // use-default 只属于可保留默认内容的历史 schema v1；schema v2 新模板禁止
  // 持久化试排内容，因此先按真实兼容入口降级夹具，再验证旧数据回退。
  definition.schemaVersion = 1;
  delete definition.metadata.previewTabletWidth;
  for (const node of Object.values(definition.nodes)) {
    node.responsive.mobile = structuredClone(node.responsive.desktop);
  }
  definition.defaultContent[slotId] = defaultImage;
  definition.slots[slotId].emptyPolicy = "use-default";
  const fallbackResult = compileDynamicTemplateRenderPlan(definition, {
    device: "desktop",
    contentBySlotId: { [slotId]: { src: "", alt: "旧数据保留说明" } },
    showEmptySlots: false,
  });
  expect(fallbackResult.ok).toBe(true);
  if (!fallbackResult.ok) throw new Error("图片默认值模板未生成 Render Plan");
  expect(findPlanNode(fallbackResult.plan, image.nodeId)).toMatchObject({
    hidden: false,
    content: defaultImage,
  });
});

function expectDescriptorShape(target: EditableTargetDescriptor) {
  const allowedKeys = new Set([
    "targetId",
    "source",
    "ownerNodeId",
    "parentTargetId",
    "slotId",
    "contractRoleId",
    "kind",
    "label",
    "capabilities",
    "locator",
  ]);
  expect(Object.keys(target).sort()).toEqual(expect.arrayContaining([
    "capabilities",
    "kind",
    "label",
    "locator",
    "ownerNodeId",
    "source",
    "targetId",
  ]));
  expect(Object.keys(target).every((key) => allowedKeys.has(key))).toBe(true);
  expect(Object.keys(target.locator).sort()).toEqual(["attributes", "value"]);
}

test.describe("F0-03A 可编辑目标身份投影", () => {
  test("只投影稳定身份、能力与 DOM locator，并保持顺序、父子关系和稳定 ID", () => {
    const { definition, container, hero, heading } = createProjectionDefinition();
    const resolverCalls: string[] = [];
    const resolveContract = (moduleType: string) => {
      resolverCalls.push(moduleType);
      return getContentTemplateContract(moduleType);
    };
    const desktopTargets = resolveEditableTargets(
      definition,
      compile(definition, "desktop"),
      resolveContract,
    );
    const mobileTargets = resolveEditableTargets(
      definition,
      compile(definition, "mobile"),
      getContentTemplateContract,
    );

    expect(resolverCalls).toEqual(["首屏主视觉"]);
    expect(desktopTargets.map((target) => target.targetId)).toEqual(
      mobileTargets.map((target) => target.targetId),
    );
    expect(new Set(desktopTargets.map((target) => target.targetId)).size)
      .toBe(desktopTargets.length);
    desktopTargets.forEach(expectDescriptorShape);

    const definitionTargets = desktopTargets.filter(
      (target) => target.source === "definition-node",
    );
    expect(definitionTargets.map((target) => target.targetId)).toEqual([
      `node:${definition.rootNodeId}`,
      `node:${container.nodeId}`,
      `node:${hero.nodeId}`,
      `node:${heading.nodeId}`,
    ]);
    expect(definitionTargets.find((target) => target.ownerNodeId === container.nodeId))
      .toMatchObject({
        parentTargetId: `node:${definition.rootNodeId}`,
        ownerNodeId: container.nodeId,
      });
    expect(definitionTargets.find((target) => target.ownerNodeId === hero.nodeId))
      .toMatchObject({
        parentTargetId: `node:${container.nodeId}`,
        ownerNodeId: hero.nodeId,
        slotId: hero.slotId,
      });

    const roleTargets = desktopTargets.filter(
      (target) => target.source === "builtin-contract-role",
    );
    expect(roleTargets.length).toBeGreaterThan(0);
    for (const target of roleTargets) {
      expect(target.targetId).toBe(`role:${hero.nodeId}:${target.contractRoleId}`);
      expect(target).toMatchObject({
        ownerNodeId: hero.nodeId,
        parentTargetId: `node:${hero.nodeId}`,
        slotId: hero.slotId,
      });
    }

    const forbiddenKeys = [
      "rect",
      "scale",
      "device",
      "selection",
      "dirty",
      "history",
      "session",
    ];
    const projectedKeys = collectOwnKeys(desktopTargets);
    forbiddenKeys.forEach((key) => expect(projectedKeys.has(key)).toBe(false));
  });

  test("无显式合同不产生角色目标，失配 Render Plan 安全返回空", () => {
    const { definition } = createProjectionDefinition();
    const plan = compile(definition);
    const withoutResolver = resolveEditableTargets(definition, plan);
    const missingContract = resolveEditableTargets(definition, plan, () => undefined);

    expect(withoutResolver.some((target) => target.source === "builtin-contract-role"))
      .toBe(false);
    expect(missingContract.some((target) => target.source === "builtin-contract-role"))
      .toBe(false);

    const wrongTemplatePlan = structuredClone(plan);
    wrongTemplatePlan.templateId = "tpl_other";
    expect(resolveEditableTargets(definition, wrongTemplatePlan, getContentTemplateContract))
      .toEqual([]);

    const staleNamePlan = structuredClone(plan);
    staleNamePlan.root.name = "过期节点名称";
    expect(resolveEditableTargets(definition, staleNamePlan, getContentTemplateContract))
      .toEqual([]);
  });

  test("内嵌 slot 快照的身份、能力、规则或有无状态失配时返回空", () => {
    const { definition, container, hero } = createProjectionDefinition();
    const plan = compile(definition);
    const expectSlotMismatch = (
      mutate: (node: DynamicTemplateRenderPlanNode, stalePlan: DynamicTemplateRenderPlan) => void,
    ) => {
      const stalePlan = structuredClone(plan);
      mutate(findPlanNode(stalePlan, hero.nodeId), stalePlan);
      expect(resolveEditableTargets(definition, stalePlan, getContentTemplateContract))
        .toEqual([]);
    };

    expect(resolveEditableTargets(definition, plan, getContentTemplateContract).length)
      .toBeGreaterThan(0);

    expectSlotMismatch((node) => { node.slot!.slotId = "slot_stale"; });
    expectSlotMismatch((node) => { node.slot!.type = "heading"; });
    expectSlotMismatch((node) => { node.slot!.editable = !node.slot!.editable; });
    expectSlotMismatch((node) => { node.slot!.hideable = !node.slot!.hideable; });
    expectSlotMismatch((node) => { node.slot!.required = !node.slot!.required; });
    expectSlotMismatch((node) => { node.slot!.desktopRules.aspectRatio = "1:1"; });
    expectSlotMismatch((node) => { delete node.slot; });
    expectSlotMismatch((node, stalePlan) => {
      findPlanNode(stalePlan, container.nodeId).slot = structuredClone(node.slot!);
    });

    const missingDefinitionSlot = structuredClone(definition);
    const missingPlanSlot = structuredClone(plan);
    delete missingDefinitionSlot.slots[hero.slotId!];
    delete findPlanNode(missingPlanSlot, hero.nodeId).slot;
    expect(resolveEditableTargets(
      missingDefinitionSlot,
      missingPlanSlot,
      getContentTemplateContract,
    )).toEqual([]);

    const runtimeContentPlan = structuredClone(plan);
    findPlanNode(runtimeContentPlan, hero.nodeId).content = {
      title: "运行时内容不属于身份快照",
    };
    expect(resolveEditableTargets(
      definition,
      runtimeContentPlan,
      getContentTemplateContract,
    ).length).toBeGreaterThan(0);
  });

  test("structureLocked 保留选择、内容与焦点能力，并移除自身及后代的结构写 capability", () => {
    const { definition, container, hero, heading } = createProjectionDefinition();
    const lockedDefinition = setDynamicTemplateNodeStructureLocked(
      definition,
      container.nodeId,
      true,
    );
    const targets = resolveEditableTargets(
      lockedDefinition,
      compile(lockedDefinition),
      getContentTemplateContract,
    );
    const protectedOwnerIds = new Set([container.nodeId, hero.nodeId, heading.nodeId]);
    const protectedTargets = targets.filter((target) => protectedOwnerIds.has(target.ownerNodeId));

    const structuralCapabilities = new Set([
      "structure",
      "layout",
      "layer",
      "visibility",
      "ratio",
      "size",
      "position",
      "fit",
      "zoom",
      "typography",
    ]);
    expect(protectedTargets.length).toBeGreaterThan(2);
    protectedTargets.forEach((target) => {
      expect(target.capabilities).toContain("select");
      expect(target.capabilities.some((capability) => structuralCapabilities.has(capability)))
        .toBe(false);
    });
    expect(protectedTargets.some((target) => target.capabilities.includes("content")))
      .toBe(true);
    expect(protectedTargets.some((target) => target.capabilities.includes("focus")))
      .toBe(true);
    expect(targets.find((target) => target.ownerNodeId === definition.rootNodeId)?.capabilities)
      .toContain("structure");
  });

  test("投影模块不读取 DOM、猜测 CSS 或维护目标注册表", () => {
    const source = readFileSync(
      resolve(clientRoot, "src/page-builder/template-definition/editableTargets.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/\b(?:document|window)\b/);
    expect(source).not.toMatch(/querySelector|closest\(|matches\(|getComputedStyle|getBoundingClientRect/);
    expect(source).not.toContain("new Map");
    expect(source).not.toContain("getContentTemplateContract(");
  });

  test("只有模板定义编辑面消费身份投影，页面实例只保留整块 surface 标记", async ({ page }) => {
    await page.route("**/editable-targets.html", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html", body: fixtureHtml });
    });
    await page.goto("/editable-targets.html");

    const templateEditor = page.getByTestId("template-definition");
    await expect(templateEditor.locator(".hc-dynamic-template"))
      .toHaveAttribute("data-dynamic-template-editor-surface", "template-definition");
    await expect(templateEditor.locator("[data-template-node-label]"))
      .not.toHaveCount(0);
    await expect(templateEditor.getByRole("group")).not.toHaveCount(0);
    const templateEmptyRegion = templateEditor.locator('[data-template-empty-structure="true"]');
    await expect(templateEmptyRegion).toHaveCount(1);
    expect((await templateEmptyRegion.boundingBox())!.height).toBeGreaterThanOrEqual(120);

    const hostOverlayEditor = page.getByTestId("host-overlay-definition");
    await expect(hostOverlayEditor.locator(".hc-dynamic-template"))
      .toHaveAttribute("data-dynamic-template-editor-surface", "template-definition");
    await expect(hostOverlayEditor.locator("[data-template-node-label], [data-template-selected], [data-template-selected-contract-role]"))
      .toHaveCount(0);
    await expect(hostOverlayEditor.getByRole("group")).toHaveCount(0);
    await expect(hostOverlayEditor.locator('[data-editor-block-id*="session-should-not-leak"]'))
      .toHaveCount(0);
    await expect(hostOverlayEditor.locator('[data-template-empty-structure="true"]')).toHaveCount(1);

    const pageEditor = page.getByTestId("page-instance");
    await expect(pageEditor.locator(".hc-dynamic-template"))
      .toHaveAttribute("data-dynamic-template-editor-surface", "page-instance");
    await expect(pageEditor.locator("[data-template-node-label]"))
      .toHaveCount(0);
    await expect(pageEditor.locator("[data-template-selected-contract-role]"))
      .toHaveCount(0);
    await expect(pageEditor.getByRole("group")).toHaveCount(0);
    await expect(pageEditor.locator('[data-editor-block-id*="session-should-not-leak"]'))
      .toHaveCount(0);
    await expect(pageEditor.locator('[data-template-empty-structure]')).toHaveCount(0);

    const ordinaryEditor = page.getByTestId("ordinary-editor");
    await expect(ordinaryEditor.locator(".hc-dynamic-template"))
      .not.toHaveAttribute("data-dynamic-template-editor-surface", /.*/);
    await expect(ordinaryEditor.locator("[data-template-node-label]"))
      .toHaveCount(0);
    await expect(ordinaryEditor.getByRole("group")).toHaveCount(0);
    await expect(ordinaryEditor.locator('[data-template-empty-structure]')).toHaveCount(0);

    for (const testId of ["public", "preview", "thumbnail"]) {
      const surface = page.getByTestId(testId);
      await expect(surface.locator(".hc-dynamic-template"))
        .not.toHaveAttribute("data-dynamic-template-editor-surface", /.*/);
      await expect(surface.locator("[data-template-node-label]"))
        .toHaveCount(0);
      await expect(surface.locator("[data-template-selected-contract-role]"))
        .toHaveCount(0);
      await expect(surface.getByRole("group")).toHaveCount(0);
      await expect(surface.locator('[data-editor-block-id*="session-should-not-leak"]'))
        .toHaveCount(0);
      await expect(surface.locator('[data-template-empty-structure]')).toHaveCount(0);
    }

    const rendererSource = readFileSync(
      resolve(clientRoot, "src/page-builder/template-definition/DynamicTemplateRenderer.tsx"),
      "utf8",
    );
    expect(rendererSource).toMatch(
      /const allowsNodeInteraction = mode === "editor"[\s\S]*interactionOwner !== "host-overlay"/,
    );
    expect(rendererSource).toMatch(
      /const editableTargets = allowsNodeInteraction\s*\? resolveEditableTargets/,
    );
  });

  test("模板目录模型复用统一投影，不保留平行角色或 locator 推导", () => {
    const source = readFileSync(
      resolve(clientRoot, "src/page-builder/template-editor/templatePreviewModel.ts"),
      "utf8",
    );
    expect(source).toContain("resolveEditableTargets(");
    expect(source).toContain("locator: target.locator");
    expect(source).not.toMatch(/function getCatalogSlotKind|function getCatalogContractObjectKind/);
    expect(source).not.toMatch(/function getCatalogSlotLabels|function getCatalogContractObjectLabels/);
  });
});
