import assert from "node:assert/strict";
import { test } from "@playwright/test";
import { changeRecipeSectionRole, createRecommendedRecipe, RADIUS_VALUES, styleFor } from "../src/page-builder/template-creation/presets";

test("区块角色切换保留明确媒体编辑并正确继承最终风格", () => {
  // 角色换推荐图片时，保留的整体风格仍是新图片的继承来源。
  for (const radius of ["none", "extraLarge"] as const) {
    const original = createRecommendedRecipe("editorial-split");
    original.style = { ...styleFor("premium"), radius };
    original.rules.mediaArrangement = "column";
    const before = structuredClone(original);
    // 目标角色带一张主图和一个 Logo：主图套用最终风格圆角，Logo 保持直角。
    const next = changeRecipeSectionRole(original, "maison-fact", { style: true, canvas: true, layout: true, content: true });
    assert.equal(next.style.radius, radius);
    assert.equal(next.media.find((slot) => slot.role === "heroImage")?.borderRadius, RADIUS_VALUES[radius]);
    assert.equal(next.media.find((slot) => slot.role === "logo")?.borderRadius, 0);
    assert.deepEqual(next.canvas, original.canvas);
    assert.deepEqual(next.layout, original.layout);
    assert.deepEqual(next.content, original.content);
    assert.deepEqual(next.rules, original.rules);
    assert.deepEqual(original, before);
  }

  // 已修改图片段不因角色或新风格推荐被重建，明确指定的圆角仍被保留。
  const edited = createRecommendedRecipe("collection-story");
  edited.style = styleFor("premium");
  edited.media[0] = { ...edited.media[0], borderRadius: 27, aspectRatio: .75, fitMode: "contain" };
  edited.media[1] = { ...edited.media[1], borderRadius: 13 };
  const editedBefore = structuredClone(edited);
  const kept = changeRecipeSectionRole(edited, "service-invitation", { media: true });
  assert.deepEqual(kept.media, edited.media);
  assert.equal(kept.style.radius, "medium");
  assert.deepEqual(edited, editedBefore);

  // 没有显式保留风格时采用目标推荐；背景不套用普通图片圆角。
  const source = createRecommendedRecipe("maison-fact");
  source.style = styleFor("premium");
  const recommended = changeRecipeSectionRole(source, "collection-story", {});
  assert.equal(recommended.style.radius, "medium");
  assert.equal(recommended.media.find((slot) => slot.role === "heroImage")?.borderRadius, 16);
  const background = changeRecipeSectionRole(source, "page-hero", { style: true });
  assert.equal(background.media[0].role, "backgroundImage");
  assert.equal(background.media[0].borderRadius, 0);
  // 九个角色都自带图片推荐，没有任何角色的推荐是空图片；只带一张主图的角色也不会多出 Logo。
  const single = changeRecipeSectionRole(source, "editorial-media", { style: true });
  assert.deepEqual(single.media.map((slot) => slot.role), ["heroImage"]);
});
