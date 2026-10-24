import { expect, test, type Page } from "@playwright/test";

// 首发七母模板合同（docs/page-builder/launch-template-set.md）结构骨架的可执行形式。
// MASTERS 是文档第 3 节骨架的机器副本，逐边对照 DYNAMIC_TEMPLATE_NODE_REGISTRY.allowedParents。
// 用途：文档 §6 说"Schema 哈希变了，本文的骨架就要重新验一遍"——这就是"重新验一遍"。
// 哈希失配时跑这个 spec，它会指出具体是哪一条父子边断了，而不只是"变了"。
// 改文档骨架必须同步改这里，反之亦然；两者是同一份合同的两个面。
//
// 边界：本 spec 只校验**父子边**。MASTERS 里的 role 自 2026-10-08 起与机器合同的 sectionRole
// 是同一套词汇，但下面"按钮槽位只落在 M1、M7 两棵树上"断言的仍是这七棵树自己的性质，
// 不是系统的准入规则——系统的按钮资格由 typographyScale.ts 的 allowsButtonSlot 表达，
// 两者目前恰好一致，改一处必须同时改另一处。也不要把它读成"七块母版已经做出来了"。
type Skeleton = { type: string; name: string; children?: Skeleton[] };

const MASTERS: Record<string, { role: string; root: Skeleton }> = {
  "page-hero": {
    role: "page-hero",
    root: {
      type: "Section", name: "页面首屏", children: [
        {
          type: "Stack", name: "主舞台", children: [
            { type: "ImageSlot", name: "背景图" },
            {
              type: "Container", name: "前景", children: [
                { type: "ImageSlot", name: "Logo" },
                { type: "HeadingSlot", name: "页面主标题" },
                { type: "TextSlot", name: "副标题" },
                { type: "ButtonSlot", name: "主行动" },
              ],
            },
          ],
        },
      ],
    },
  },
  "collection-story": {
    role: "collection-story",
    root: {
      type: "Section", name: "系列叙事", children: [
        {
          type: "Stack", name: "区块主体", children: [
            {
              type: "Row", name: "图文分栏", children: [
                {
                  type: "Column", name: "媒体列", children: [
                    { type: "ImageSlot", name: "主图" },
                    { type: "ImageSlot", name: "副图" },
                  ],
                },
                {
                  type: "Column", name: "文字列", children: [
                    { type: "HeadingSlot", name: "系列名" },
                    { type: "HeadingSlot", name: "主标题" },
                    { type: "TextSlot", name: "描述" },
                    { type: "LinkSlot", name: "次级链接" },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  },
  "editorial-split": {
    role: "editorial-split",
    root: {
      type: "Section", name: "左右图文", children: [
        {
          type: "Stack", name: "区块主体", children: [
            {
              type: "Row", name: "图文分栏", children: [
                {
                  type: "Column", name: "媒体列", children: [
                    { type: "ImageSlot", name: "主图" },
                    {
                      type: "Row", name: "副图组", children: [
                        { type: "ImageSlot", name: "副图 1" },
                        { type: "ImageSlot", name: "副图 2" },
                      ],
                    },
                  ],
                },
                {
                  type: "Column", name: "文字列", children: [
                    { type: "HeadingSlot", name: "主标题" },
                    { type: "TextSlot", name: "描述" },
                    { type: "LinkSlot", name: "次级链接" },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  },
  "craft-detail": {
    role: "craft-detail",
    root: {
      type: "Section", name: "工艺细节", children: [
        {
          type: "Stack", name: "区块主体", children: [
            {
              type: "Row", name: "图文分栏", children: [
                { type: "Column", name: "媒体列", children: [{ type: "ImageSlot", name: "主图" }] },
                {
                  type: "Column", name: "文字列", children: [
                    { type: "HeadingSlot", name: "步骤名" },
                    { type: "HeadingSlot", name: "主标题" },
                    { type: "RichTextSlot", name: "描述" },
                    { type: "LinkSlot", name: "次级链接" },
                  ],
                },
              ],
            },
            {
              type: "Grid", name: "副图条", children: [
                { type: "ImageSlot", name: "副图 1" },
                { type: "ImageSlot", name: "副图 2" },
              ],
            },
          ],
        },
      ],
    },
  },
  "creation-grid": {
    role: "creation-grid",
    root: {
      type: "Section", name: "作品网格", children: [
        {
          type: "Stack", name: "区块主体", children: [
            { type: "HeadingSlot", name: "主标题" },
            { type: "TextSlot", name: "描述" },
            {
              type: "Grid", name: "作品卡组", children: [
                { type: "ImageSlot", name: "作品图 1" },
                { type: "ImageSlot", name: "作品图 2" },
                { type: "ImageSlot", name: "作品图 3" },
              ],
            },
          ],
        },
      ],
    },
  },
  "maison-fact": {
    role: "maison-fact",
    root: {
      type: "Section", name: "品牌事实", children: [
        {
          type: "Stack", name: "区块主体", children: [
            { type: "ImageSlot", name: "主图" },
            { type: "HeadingSlot", name: "品牌名称" },
            { type: "HeadingSlot", name: "主标题" },
            {
              type: "Grid", name: "事实条目", children: [
                { type: "TextSlot", name: "事实 1" },
                { type: "TextSlot", name: "事实 2" },
                { type: "TextSlot", name: "事实 3" },
              ],
            },
            { type: "LinkSlot", name: "次级链接" },
            { type: "ImageSlot", name: "Logo" },
          ],
        },
      ],
    },
  },
  "service-invitation": {
    role: "service-invitation",
    root: {
      type: "Section", name: "服务邀请", children: [
        {
          type: "Stack", name: "区块主体", children: [
            { type: "ImageSlot", name: "主图" },
            { type: "HeadingSlot", name: "主标题" },
            {
              type: "Grid", name: "时间与地点", children: [
                { type: "TextSlot", name: "时间" },
                { type: "TextSlot", name: "地点" },
              ],
            },
            { type: "ButtonSlot", name: "主行动" },
            { type: "ImageSlot", name: "Logo" },
          ],
        },
      ],
    },
  },
};

// 主要行动只放在承担页面主焦点的两个角色上，其余角色只给次级链接（店铺装修合同第 4 节）。
const PRIMARY_ACTION_ROLES = ["page-hero", "service-invitation"];

async function openContractRuntime(page: Page) {
  await page.route("**/api/**", (route) => route.abort());
  await page.route("**/__launch-template-set", (route) => route.fulfill({
    contentType: "text/html; charset=utf-8",
    body: `<!doctype html><html><head><meta charset="utf-8"></head><body><script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
    </script></body></html>`,
  }));
  await page.goto("/__launch-template-set");
}

test("七母版骨架逐边通过机器注册表；按钮槽位只落在 M1、M7 两棵树上", async ({ page }) => {
  await openContractRuntime(page);
  const result = await page.evaluate(async (masters: Record<string, { role: string; root: unknown }>) => {
    const generated = await import(/* @vite-ignore */ "/src/page-builder/template-definition/generated/templateDefinition.generated.ts");
    const registry = await import(/* @vite-ignore */ "/src/page-builder/template-definition/nodeRegistry.ts");
    const knownTypes: string[] = [...generated.DYNAMIC_TEMPLATE_NODE_TYPES];
    const knownSlots: string[] = [...generated.DYNAMIC_TEMPLATE_SLOT_TYPES];
    const violations: string[] = [];
    const usedTypes = new Set<string>();
    const usedSlots = new Set<string>();
    const buttonRoles: string[] = [];
    const nodeCounts: Record<string, number> = {};

    type Node = { type: string; name: string; children?: Node[] };
    const walk = (node: Node, parent: string | null, path: string, role: string) => {
      if (!knownTypes.includes(node.type)) violations.push(`${path}: 未知节点类型 ${node.type}`);
      const entry = generated.getDynamicTemplateNodeRegistryEntry(node.type);
      if (parent === null) {
        if (!entry.rootOnly) violations.push(`${path}: ${node.type} 不是 rootOnly，不能当根`);
      } else if (!generated.getDynamicTemplateNodeRegistryEntry(parent).canHaveChildren) {
        violations.push(`${path}: 父节点 ${parent} 不允许有子节点`);
      } else if (!entry.allowedParents.includes(parent)) {
        violations.push(`${path}: ${parent} 不能直接包含 ${node.type}`);
      }
      if (knownSlots.includes(entry.slotType)) usedSlots.add(entry.slotType);
      usedTypes.add(node.type);
      nodeCounts[path] = (node.children ?? []).length;
      if (node.type === "ButtonSlot") buttonRoles.push(role);
      for (const child of node.children ?? []) walk(child, node.type, `${path} > ${child.name}`, role);
    };
    const rootIsSingle: Record<string, boolean> = {};
    for (const [key, master] of Object.entries(masters)) {
      rootIsSingle[key] = typeof master.root === "object" && master.root !== null;
      walk(master.root as Node, null, `${key} · ${(master.root as Node).name}`, master.role);
    }
    return { violations, usedTypes: [...usedTypes].sort(), usedSlots: [...usedSlots].sort(), buttonRoles, rootIsSingle, schemaHash: generated.DYNAMIC_TEMPLATE_SCHEMA_HASH, schemaVersion: generated.DYNAMIC_TEMPLATE_SCHEMA_VERSION };
  }, MASTERS);

  expect(result.violations).toEqual([]);
  expect(result.buttonRoles.sort()).toEqual(PRIMARY_ACTION_ROLES.slice().sort());
  expect(Object.values(result.rootIsSingle).every(Boolean)).toBe(true);
  expect(result.usedSlots.sort()).toEqual(["button", "heading", "image", "link", "richText", "text"].sort());
  console.log(JSON.stringify(result, null, 2));
});

test("每个母版的结构节点只用 Section/Stack/Container/Row/Column/Grid 六种", async ({ page }) => {
  await openContractRuntime(page);
  const offenders = await page.evaluate(async (masters: Record<string, { root: unknown }>) => {
    const generated = await import(/* @vite-ignore */ "/src/page-builder/template-definition/generated/templateDefinition.generated.ts");
    const slotTypes: string[] = [...generated.DYNAMIC_TEMPLATE_SLOT_TYPES];
    const found: string[] = [];
    type Node = { type: string; name: string; children?: Node[] };
    const walk = (node: Node, path: string) => {
      const entry = generated.getDynamicTemplateNodeRegistryEntry(node.type);
      const isSlot = typeof entry.slotType === "string" && slotTypes.includes(entry.slotType);
      if (!isSlot && !["Section", "Stack", "Container", "Row", "Column", "Grid"].includes(node.type)) found.push(`${path}: ${node.type}`);
      for (const child of node.children ?? []) walk(child, `${path} > ${child.name}`);
    };
    for (const [key, master] of Object.entries(masters)) walk(master.root as Node, key);
    return found;
  }, MASTERS);
  expect(offenders).toEqual([]);
});

// ── 上面三处校验的都是 MASTERS：那是文档第 3 节骨架的**手抄本**。 ───────────────
// 它只能证明文档自洽——真正的定义源（launchTemplateSet.ts）写歪了，上面照样是绿的。
// 下面这一条把定义源拉进来补齐这个缺口，三件事一次做完：
//   1. 从 LAUNCH_TEMPLATE_MASTERS 还原出与 MASTERS 同构的骨架，逐节点对照；
//   2. 同一套父子边遍历，这次跑在真实节点上；
//   3. 每块定义各自过一遍发布契约（validateDynamicTemplatePublishDefinition）。
// 文档 / 合同 spec / 实现源任何一处漂移，这里都会红——这正是文档第 6 节说的
// "Schema 哈希变了就重新验一遍"落到实现层的那一遍。

test("实现源与文档骨架逐节点一致，且七块定义各自通过发布契约", async ({ page }) => {
  await openContractRuntime(page);
  const report = await page.evaluate(async (documented: Record<string, { role: string; root: Skeleton }>) => {
    const launch = await import(/* @vite-ignore */ "/src/page-builder/template-creation/launchTemplateSet.ts");
    const generated = await import(/* @vite-ignore */ "/src/page-builder/template-definition/generated/templateDefinition.generated.ts");
    const validator = await import(/* @vite-ignore */ "/src/page-builder/template-definition/validateTemplateDefinition.ts");

    type Shape = { type: string; name: string; children?: Shape[] };
    type Slot = { key: string; label?: string; type: string; required: boolean; editable: boolean; hideable: boolean; emptyPolicy?: string; desktopRules?: { aspectRatio?: string }; mobileRules?: { aspectRatio?: string } };
    type Node = { nodeId: string; type: string; name: string; childIds: string[]; slotId?: string; hidden: boolean };
    type Definition = {
      name: string;
      schemaVersion: number;
      metadata: { sectionRole?: string };
      rootNodeId: string;
      nodes: Record<string, Node>;
      slots: Record<string, Slot>;
      defaultContent: Record<string, unknown>;
      previewContent?: Record<string, unknown>;
    };

    const edgeViolations: string[] = [];
    const nodeViolations: string[] = [];
    const slotViolations: string[] = [];
    const publishErrors: Record<string, string[]> = {};
    const shapes: Record<string, Shape> = {};
    const rootChildCounts: Record<string, number> = {};
    const metadata: Record<string, Record<string, unknown>> = {};
    const usedTypes = new Set<string>();

    // 骨架只从定义自身的 rootNodeId / childIds / nodes 还原，不借用实现里任何中间结构。
    const shapeOf = (definition: Definition, nodeId: string): Shape => {
      const node = definition.nodes[nodeId];
      if (!node) throw new Error(`${definition.name}：nodes 里没有节点 ${nodeId}`);
      const shape: Shape = { type: node.type, name: node.name };
      if (node.childIds.length > 0) shape.children = node.childIds.map((id) => shapeOf(definition, id));
      return shape;
    };

    for (const definition of launch.LAUNCH_TEMPLATE_MASTERS as Definition[]) {
      const role = definition.metadata.sectionRole ?? "(未标 sectionRole)";
      const root = definition.nodes[definition.rootNodeId];
      if (!root) throw new Error(`${definition.name}：根节点 ${definition.rootNodeId} 不在 nodes 里`);
      shapes[role] = shapeOf(definition, definition.rootNodeId);
      rootChildCounts[role] = root.childIds.length;
      metadata[role] = {
        sectionRole: definition.metadata.sectionRole,
        schemaVersion: definition.schemaVersion,
        slots: Object.keys(definition.slots).length,
        defaultContent: Object.keys(definition.defaultContent).length,
        previewContent: Object.keys(definition.previewContent ?? {}).length,
        ...(role === "page-hero" ? (() => {
          const background = Object.values(definition.slots).find((slot) => slot.key === "heroBackground");
          return {
            heroDesktopRatio: background?.desktopRules?.aspectRatio,
            heroMobileRatio: background?.mobileRules?.aspectRatio,
          };
        })() : {}),
      };

      const walk = (nodeId: string, parent: string | null, path: string) => {
        const node = definition.nodes[nodeId];
        const entry = generated.getDynamicTemplateNodeRegistryEntry(node.type);
        if (parent === null) {
          if (!entry.rootOnly) edgeViolations.push(`${path}：${node.type} 不是 rootOnly，不能当根`);
        } else if (!generated.getDynamicTemplateNodeRegistryEntry(parent).canHaveChildren) {
          edgeViolations.push(`${path}：父节点 ${parent} 不允许有子节点`);
        } else if (!entry.allowedParents.includes(parent)) {
          edgeViolations.push(`${path}：${parent} 不能直接包含 ${node.type}`);
        }
        if (node.hidden) nodeViolations.push(`${path}：母版节点不应默认隐藏`);
        if (node.slotId && !definition.slots[node.slotId]) nodeViolations.push(`${path}：槽位 ${node.slotId} 不在 slots 里`);
        usedTypes.add(node.type);
        for (const childId of node.childIds) walk(childId, node.type, `${path} > ${definition.nodes[childId].name}`);
      };
      walk(definition.rootNodeId, null, `${role} · ${root.name}`);

      // 不变量 I 与机器合同的交界：槽位一律可编辑、可隐藏、非必填，且公开清空策略是 hide。
      for (const slot of Object.values(definition.slots)) {
        const where = `${role} · ${slot.label ?? slot.key}`;
        if (!slot.editable || !slot.hideable || slot.required) {
          slotViolations.push(`${where}：editable=${slot.editable} hideable=${slot.hideable} required=${slot.required}`);
        }
        if (slot.emptyPolicy !== "hide") slotViolations.push(`${where}：emptyPolicy=${String(slot.emptyPolicy)}`);
        if (/price|stock|inventory|promo|countdown|discount/i.test(slot.key)) slotViolations.push(`${where}：出现价格/库存/促销语义`);
      }

      const verdict = validator.validateDynamicTemplatePublishDefinition(definition);
      publishErrors[role] = verdict.issues
        .filter((issue: { level: string }) => issue.level === "error")
        .map((issue: { code: string; path: string; message: string }) => `${issue.code} @ ${issue.path}：${issue.message}`);
      if (verdict.valid !== (publishErrors[role].length === 0)) {
        nodeViolations.push(`${role}：valid=${verdict.valid} 与错误条数 ${publishErrors[role].length} 不一致`);
      }
    }

    return {
      shapes,
      rootChildCounts,
      metadata,
      edgeViolations,
      nodeViolations,
      slotViolations,
      publishErrors,
      usedTypes: [...usedTypes].sort(),
      documentedRoles: Object.keys(documented).sort(),
    };
  }, MASTERS);

  // 1. 实现还原出来的骨架必须与文档手抄骨架逐节点相同。
  const documentedShapes: Record<string, Skeleton> = {};
  for (const [role, master] of Object.entries(MASTERS)) documentedShapes[role] = master.root;
  expect(report.shapes).toEqual(documentedShapes);
  expect(report.documentedRoles).toEqual(Object.keys(MASTERS).sort());

  // 2. 真实节点上的父子边、隐藏态、槽位映射与发布契约。
  expect(report.edgeViolations).toEqual([]);
  expect(report.nodeViolations).toEqual([]);
  expect(report.slotViolations).toEqual([]);
  expect(report.publishErrors).toEqual(
    Object.fromEntries(Object.keys(MASTERS).map((role) => [role, []])),
  );

  // 3. 不变量 A/B/D/I 在实现上的落点。
  expect(report.rootChildCounts).toEqual(
    Object.fromEntries(Object.keys(MASTERS).map((role) => [role, 1])),
  );
  for (const role of Object.keys(MASTERS)) {
    expect(report.metadata[role]).toMatchObject({ sectionRole: role, schemaVersion: 3, defaultContent: 0, previewContent: 0 });
  }
  expect(report.metadata["page-hero"]).toMatchObject({ heroDesktopRatio: "16:9", heroMobileRatio: "4:5" });
  expect(report.usedTypes).toEqual(
    ["ButtonSlot", "Column", "Container", "Grid", "HeadingSlot", "ImageSlot", "LinkSlot", "RichTextSlot", "Row", "Section", "Stack", "TextSlot"],
  );
  console.log(JSON.stringify(report.metadata, null, 2));
});
