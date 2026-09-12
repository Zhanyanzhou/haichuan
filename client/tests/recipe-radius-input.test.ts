import assert from "node:assert/strict";
import { test } from "@playwright/test";
import { createMediaSlots, createRecommendedRecipe } from "../src/page-builder/template-creation/presets";
import { hasInvalidRecipeRadiusInputs, parseRecipeRadiusInput } from "../src/page-builder/template-creation/recipeRadiusInput";

test("圆角解析保留错误边界，不把空值、小数或越界值变成合法数值", () => {
  for (const raw of ["201", "", " ", "1.5", "1.0", "-1", "2e1", "NaN", "Infinity", "200px"]) {
    assert.equal(parseRecipeRadiusInput(raw), null, raw);
  }
  for (const raw of ["0", "1", "24", "200", "024"]) assert.equal(parseRecipeRadiusInput(raw), Number(raw));
});

test("所有仍适用的图片按稳定身份校验，切换顺序不会丢失错误", () => {
  const recipe = createRecommendedRecipe("general");
  recipe.media = createMediaSlots(["heroImage", "secondaryImage"]);
  const radiusInputs = { [recipe.media[0].id]: "201", [recipe.media[1].id]: "24" };
  assert.equal(hasInvalidRecipeRadiusInputs(recipe, radiusInputs), true);
  recipe.media.reverse();
  assert.equal(hasInvalidRecipeRadiusInputs(recipe, radiusInputs), true);
  assert.equal(radiusInputs[recipe.media[1].id], "201");
  assert.equal(hasInvalidRecipeRadiusInputs(recipe, { ...radiusInputs, [recipe.media[1].id]: "200" }), false);
});

test("背景和圆形暂不校验圆角，切回普通图片仍能恢复原错误", () => {
  const recipe = createRecommendedRecipe("general");
  recipe.media = createMediaSlots(["custom"]);
  const slot = recipe.media[0];
  const radiusInputs = { [slot.id]: "" };
  assert.equal(hasInvalidRecipeRadiusInputs(recipe, radiusInputs), true);
  slot.shape = "circle";
  assert.equal(hasInvalidRecipeRadiusInputs(recipe, radiusInputs), false);
  slot.shape = "rectangle";
  slot.role = "backgroundImage";
  assert.equal(hasInvalidRecipeRadiusInputs(recipe, radiusInputs), false);
  slot.role = "custom";
  assert.equal(hasInvalidRecipeRadiusInputs(recipe, radiusInputs), true);
  assert.equal(radiusInputs[slot.id], "");
  recipe.media = [];
  assert.equal(hasInvalidRecipeRadiusInputs(recipe, radiusInputs), false);
});
