import assert from "node:assert/strict";
import { test } from "@playwright/test";
import { changeRecipePurpose, createRecommendedRecipe, RADIUS_VALUES, styleFor } from "../src/page-builder/template-creation/presets";

test("用途切换保留明确媒体编辑并正确继承最终风格", () => {
// 用途换推荐图片时，保留的整体风格仍是新图片的继承来源。
for (const radius of ["none", "extraLarge"] as const) {
  const original = createRecommendedRecipe("productPromotion");
  original.style = { ...styleFor("premium"), radius };
  original.rules.mediaArrangement = "column";
  const before = structuredClone(original);
  const next = changeRecipePurpose(original, "newProduct", { style: true, canvas: true, layout: true, content: true });
  assert.equal(next.style.radius, radius);
  assert.equal(next.media.find((slot) => slot.role === "heroImage")?.borderRadius, RADIUS_VALUES[radius]);
  assert.equal(next.media.find((slot) => slot.role === "logo")?.borderRadius, 0);
  assert.deepEqual(next.canvas, original.canvas);
  assert.deepEqual(next.layout, original.layout);
  assert.deepEqual(next.content, original.content);
  assert.deepEqual(next.rules, original.rules);
  assert.deepEqual(original, before);
}

// 已修改图片段不因用途或新风格推荐被重建，明确指定的圆角仍被保留。
const edited = createRecommendedRecipe("newProduct");
edited.style = styleFor("premium");
edited.media[0] = { ...edited.media[0], borderRadius: 27, aspectRatio: .75, fitMode: "contain" };
edited.media[1] = { ...edited.media[1], borderRadius: 13 };
const editedBefore = structuredClone(edited);
const kept = changeRecipePurpose(edited, "event", { media: true });
assert.deepEqual(kept.media, edited.media);
assert.equal(kept.style.radius, "medium");
assert.deepEqual(edited, editedBefore);

// 没有显式保留风格时采用目标推荐；背景不套用普通图片圆角。
const source = createRecommendedRecipe("productPromotion");
source.style = styleFor("premium");
const recommended = changeRecipePurpose(source, "newProduct", {});
assert.equal(recommended.style.radius, "medium");
assert.equal(recommended.media.find((slot) => slot.role === "heroImage")?.borderRadius, 16);
const background = changeRecipePurpose(source, "event", { style: true });
assert.equal(background.media[0].role, "backgroundImage");
assert.equal(background.media[0].borderRadius, 0);
assert.deepEqual(changeRecipePurpose(source, "general", { style: true }).media, []);
});
