import assert from "node:assert/strict";
import { test } from "@playwright/test";
import { generateTemplateFromRecipe } from "../src/page-builder/template-creation/generateTemplateFromRecipe";
import { createMediaSlots, createRecommendedRecipe } from "../src/page-builder/template-creation/presets";
import { getRecipeLayoutDiagramRegions } from "../src/page-builder/template-creation/RecipeLayoutDiagram";

test("布局示意图保持嵌套几何、文本空态、背景和确定性", () => {
const recipe = createRecommendedRecipe("brand");
recipe.canvas = { width: 1200, height: 900, aspectRatio: 4 / 3 };
recipe.layout = "topImageBottomContent";
recipe.media = createMediaSlots(["custom", "custom", "logo"]);
recipe.rules.mediaArrangement = "row";
const plain = generateTemplateFromRecipe(recipe, { templateId: "diagram_test" });
const card = generateTemplateFromRecipe({ ...recipe, layout: "cards" }, { templateId: "diagram_test" });
const before = structuredClone(card);
const plainRegions = getRecipeLayoutDiagramRegions(plain);
const cardRegions = getRecipeLayoutDiagramRegions(card);
assert.ok(card.nodes.diagram_test_card.childIds.includes("diagram_test_card_layout"));
assert.equal(cardRegions.filter((region) => region.kind === "image").length, 2);
assert.equal(cardRegions.filter((region) => region.kind === "logo").length, 1);
assert.equal(cardRegions.filter((region) => region.kind === "card").length, 1);
assert.equal(cardRegions.filter((region) => region.kind === "content").length, 1);
// 包装卡片前后占用相同设计空间；嵌套归一化坐标不能被误当成根画布坐标。
for (const original of plainRegions) {
  const nested = cardRegions.find((region) => region.nodeId === original.nodeId);
  assert.ok(nested, original.nodeId);
  for (const axis of ["x", "y", "width", "height"] as const) {
    assert.ok(Math.abs(nested[axis] - original[axis]) < .000001, `${original.nodeId}.${axis}`);
  }
}
assert.deepEqual(card, before, "提取几何不修改生成定义");
assert.deepEqual(getRecipeLayoutDiagramRegions(card), cardRegions, "相同定义输出确定");

const textOnly = generateTemplateFromRecipe({ ...recipe, media: [] }, { templateId: "diagram_text" });
const textRegions = getRecipeLayoutDiagramRegions(textOnly);
assert.equal(textRegions.length, 1);
assert.equal(textRegions[0].kind, "content");
assert.equal(textRegions[0].contentCount, recipe.content.length);
const placement = textOnly.nodes.diagram_text_content.responsive.desktop.placement!;
assert.equal(textRegions[0].x, placement.x * 1200);
assert.equal(textRegions[0].y, placement.y * 900);
assert.equal(textRegions[0].width, placement.width * 1200);
assert.equal(textRegions[0].height, placement.height * 900);
assert.ok(textRegions[0].width > 0 && textRegions[0].height > 0);

const background = generateTemplateFromRecipe({ ...recipe, media: createMediaSlots(["backgroundImage", "logo"]) });
const backgroundRegion = getRecipeLayoutDiagramRegions(background).find((region) => region.kind === "background")!;
assert.deepEqual({ x: backgroundRegion.x, y: backgroundRegion.y, width: backgroundRegion.width, height: backgroundRegion.height }, { x: 0, y: 0, width: 1200, height: 900 });
});
