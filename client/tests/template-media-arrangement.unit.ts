import assert from "node:assert/strict";
import { test } from "@playwright/test";
import { arrangeMedia } from "../src/page-builder/template-creation/mediaGeometry";
import { createMediaSlots, createRecommendedRecipe } from "../src/page-builder/template-creation/presets";
import { generateTemplateFromRecipe } from "../src/page-builder/template-creation/generateTemplateFromRecipe";
import { validateTemplateRecipe } from "../src/page-builder/template-definition/validateTemplateDefinition";
import type { TemplateRecipe } from "../src/page-builder/template-definition/generated/templateDefinition.generated";

test("媒体排列保持方向、比例、主副层级、合同与旧配方兼容", () => {
const area = { x: 10, y: 20, width: 800, height: 600 };
const centerX = (rect: typeof area) => rect.x + rect.width / 2;
const centerY = (rect: typeof area) => rect.y + rect.height / 2;
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

// 同级方向由布局决定，混合图片比例只改变各自外框。
for (const ratios of [[1, 1, 1], [4, .25, 16 / 9], [.25, 4, .75]]) {
  const media = createMediaSlots(["custom", "custom", "custom"]).map((slot, index) => ({ ...slot, aspectRatio: ratios[index] }));
  const before = structuredClone(media);
  for (const direction of ["row", "column"] as const) {
    const frames = arrangeMedia(area, media, 16, direction);
    assert.equal(frames.length, 3);
    frames.forEach((frame, index) => {
      close(frame.width / frame.height, ratios[index]);
      assert.ok(frame.x >= area.x && frame.y >= area.y);
      assert.ok(frame.x + frame.width <= area.x + area.width + 1e-8);
      assert.ok(frame.y + frame.height <= area.y + area.height + 1e-8);
      if (index) {
        if (direction === "row") { close(centerY(frame), centerY(frames[0])); assert.ok(frame.x >= frames[index - 1].x + frames[index - 1].width + 15.999); }
        else { close(centerX(frame), centerX(frames[0])); assert.ok(frame.y >= frames[index - 1].y + frames[index - 1].height + 15.999); }
      }
    });
  }
  assert.deepEqual(media, before);
  assert.deepEqual(arrangeMedia(area, media, 16), arrangeMedia(area, media, 16, "auto"));
}

// 一主两副固定主副方向及侧栏方向，副图比例不应使构图翻转。
for (const ratios of [[1, 1, 1], [.25, 4, .75], [4, .25, 1]]) {
  const media = createMediaSlots(["heroImage", "secondaryImage", "secondaryImage"]).map((slot, index) => ({ ...slot, aspectRatio: ratios[index] }));
  const row = arrangeMedia(area, media, 16, "row");
  assert.ok(row[0].x + row[0].width <= row[1].x);
  assert.ok(row[0].x + row[0].width <= row[2].x);
  close(centerX(row[1]), centerX(row[2]));
  assert.ok(row[1].y + row[1].height < row[2].y);
  const column = arrangeMedia(area, media, 16, "column");
  assert.ok(column[0].y + column[0].height <= column[1].y);
  assert.ok(column[0].y + column[0].height <= column[2].y);
  close(centerY(column[1]), centerY(column[2]));
  assert.ok(column[1].x + column[1].width < column[2].x);
  for (const frames of [row, column]) {
    frames.forEach((frame, index) => close(frame.width / frame.height, ratios[index]));
    assert.ok(frames[0].width * frames[0].height >= frames[1].width * frames[1].height * 2.249);
  }
  assert.deepEqual(arrangeMedia(area, media, 16), arrangeMedia(area, media, 16, "auto"));
}
assert.deepEqual(arrangeMedia(area, [], 16, "row"), []);
assert.deepEqual(arrangeMedia({ ...area, width: 10 }, createMediaSlots(["custom", "custom"]), 16, "row"), []);

// 源合同接受新规则并拒绝未知值；历史配方保持默认自动排布。
const recipe = createRecommendedRecipe("productPromotion");
recipe.canvas = { width: 1200, height: 900, aspectRatio: 4 / 3 };
recipe.media = createMediaSlots(["custom", "custom"]);
recipe.content = [];
const original = structuredClone(recipe);
assert.equal(validateTemplateRecipe(recipe).valid, true);
assert.equal(validateTemplateRecipe({ ...recipe, rules: { ...recipe.rules, mediaArrangement: "diagonal" } }).valid, false);
for (const direction of ["row", "column"] as const) {
  const configured: TemplateRecipe = { ...recipe, rules: { ...recipe.rules, mediaArrangement: direction } };
  const definition = generateTemplateFromRecipe(configured);
  const placements = Object.values(definition.nodes).filter((node) => node.type === "ImageSlot").map((node) => node.responsive.desktop.placement!);
  assert.equal(placements.length, 2);
  if (direction === "row") { close(placements[0].y, placements[1].y); assert.ok(placements[0].x < placements[1].x); }
  else { close(placements[0].x, placements[1].x); assert.ok(placements[0].y < placements[1].y); }
  assert.equal(definition.templateRecipe!.rules.mediaArrangement, direction);
  assert.deepEqual(definition.metadata.canvasSize, recipe.canvas);
}
const implicit = generateTemplateFromRecipe(recipe);
const explicit = generateTemplateFromRecipe({ ...recipe, rules: { ...recipe.rules, mediaArrangement: "auto" } });
assert.deepEqual(implicit.nodes, explicit.nodes);
assert.deepEqual(implicit.slots, explicit.slots);
assert.deepEqual(recipe, original);
});
