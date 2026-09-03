import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { getContentTemplateContract } from "../src/page-builder/generated/contentTemplates.generated";
import {
  addDynamicTemplateNode,
  compileDynamicTemplateRenderPlan,
  createBlankDynamicTemplateDefinition,
  resolveEditableTargets,
  setDynamicTemplateNodeStructureLocked,
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

    const hostOverlayEditor = page.getByTestId("host-overlay-definition");
    await expect(hostOverlayEditor.locator(".hc-dynamic-template"))
      .toHaveAttribute("data-dynamic-template-editor-surface", "template-definition");
    await expect(hostOverlayEditor.locator("[data-template-node-label], [data-template-selected], [data-template-selected-contract-role]"))
      .toHaveCount(0);
    await expect(hostOverlayEditor.getByRole("group")).toHaveCount(0);
    await expect(hostOverlayEditor.locator('[data-editor-block-id*="session-should-not-leak"]'))
      .toHaveCount(0);

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

    const ordinaryEditor = page.getByTestId("ordinary-editor");
    await expect(ordinaryEditor.locator(".hc-dynamic-template"))
      .not.toHaveAttribute("data-dynamic-template-editor-surface", /.*/);
    await expect(ordinaryEditor.locator("[data-template-node-label]"))
      .toHaveCount(0);
    await expect(ordinaryEditor.getByRole("group")).toHaveCount(0);

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
