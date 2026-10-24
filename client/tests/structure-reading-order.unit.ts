import { expect, test } from "@playwright/test";

import {
  createBlankDynamicTemplateDefinition,
  createDynamicTemplateNode,
  createDynamicTemplateSlotDefinition,
} from "../src/page-builder/template-definition/nodeRegistry";
import { orderStructureChildIds } from "../src/page-builder/template-editor/structureReadingOrder";
import type { TemplateDefinitionV2 } from "../src/page-builder/template-definition/generated/templateDefinition.generated";

function attach(definition: TemplateDefinitionV2, parentId: string, node: ReturnType<typeof createDynamicTemplateNode>) {
  definition.nodes[node.nodeId] = node;
  definition.nodes[parentId].childIds.push(node.nodeId);
  return node.nodeId;
}

function slotNode(
  definition: TemplateDefinitionV2,
  parentId: string,
  type: "image" | "heading" | "text" | "link" | "button",
  name: string,
) {
  const slot = createDynamicTemplateSlotDefinition(type, name, name);
  definition.slots[slot.slotId] = slot;
  const node = createDynamicTemplateNode(
    type === "image" ? "ImageSlot" : type === "heading" ? "HeadingSlot" : type === "button" ? "ButtonSlot" : type === "link" ? "LinkSlot" : "TextSlot",
    name,
    slot.slotId,
  );
  return { nodeId: attach(definition, parentId, node), slot };
}

test("副图组排在文字后面，主图仍在最前", () => {
  const definition = createBlankDynamicTemplateDefinition("左右图文");
  const grid = createDynamicTemplateNode("Grid", "栅格列");
  const gridId = attach(definition, definition.rootNodeId, grid);
  const hero = slotNode(definition, gridId, "image", "主图");
  const details = createDynamicTemplateNode("Row", "副图组");
  const detailsId = attach(definition, gridId, details);
  slotNode(definition, detailsId, "image", "图面 1");
  slotNode(definition, detailsId, "image", "图面 2");
  const copy = createDynamicTemplateNode("Column", "文字列");
  const copyId = attach(definition, gridId, copy);
  const title = slotNode(definition, copyId, "heading", "标题");
  const description = slotNode(definition, copyId, "text", "描述");
  const link = slotNode(definition, copyId, "link", "次级链接");

  expect(orderStructureChildIds(definition, gridId, definition.nodes[gridId].childIds)).toEqual([
    hero.nodeId,
    copyId,
    detailsId,
  ]);
  expect(orderStructureChildIds(definition, copyId, definition.nodes[copyId].childIds)).toEqual([
    title.nodeId,
    description.nodeId,
    link.nodeId,
  ]);
});

test("文字组内部固定为标题、副标题、描述、按钮", () => {
  const definition = createBlankDynamicTemplateDefinition("文字");
  const group = createDynamicTemplateNode("Column", "内容区域");
  const groupId = attach(definition, definition.rootNodeId, group);
  const button = slotNode(definition, groupId, "button", "按钮");
  const subtitle = slotNode(definition, groupId, "heading", "副标题");
  const title = slotNode(definition, groupId, "heading", "主标题");
  const description = slotNode(definition, groupId, "text", "描述");

  expect(orderStructureChildIds(definition, groupId, definition.nodes[groupId].childIds).map((nodeId) => (
    definition.nodes[nodeId].name
  ))).toEqual(["主标题", "副标题", "描述", "按钮"]);
  expect(definition.nodes[groupId].childIds).toEqual([button.nodeId, subtitle.nodeId, title.nodeId, description.nodeId]);
});

test("上文下图保持文字在前，自由叠放按位置排列", () => {
  const stacked = createBlankDynamicTemplateDefinition("上文下图");
  const column = createDynamicTemplateNode("Column", "内容");
  const columnId = attach(stacked, stacked.rootNodeId, column);
  const title = slotNode(stacked, columnId, "heading", "主标题");
  const image = slotNode(stacked, columnId, "image", "主图");
  expect(orderStructureChildIds(stacked, columnId, stacked.nodes[columnId].childIds)).toEqual([
    title.nodeId,
    image.nodeId,
  ]);

  const free = createBlankDynamicTemplateDefinition("自由");
  const stage = createDynamicTemplateNode("Stack", "布局结构");
  stage.responsive.desktop.layoutMode = "free";
  const stageId = attach(free, free.rootNodeId, stage);
  const lower = slotNode(free, stageId, "heading", "主标题");
  const upperLeft = slotNode(free, stageId, "image", "自定义图片 2");
  const upperRight = slotNode(free, stageId, "image", "自定义图片 1");
  free.nodes[lower.nodeId].responsive.desktop.placement = { x: 0.1, y: 0.6, width: 0.8, height: 0.2, zIndex: 1 };
  free.nodes[upperLeft.nodeId].responsive.desktop.placement = { x: 0.5, y: 0.1, width: 0.3, height: 0.4, zIndex: 1 };
  free.nodes[upperRight.nodeId].responsive.desktop.placement = { x: 0.1, y: 0.1, width: 0.3, height: 0.4, zIndex: 1 };
  expect(orderStructureChildIds(free, stageId, free.nodes[stageId].childIds)).toEqual([
    upperRight.nodeId,
    upperLeft.nodeId,
    lower.nodeId,
  ]);
});
