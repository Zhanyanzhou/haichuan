import assert from "node:assert/strict";
import { test } from "@playwright/test";
import { createMediaSlots } from "../src/page-builder/template-creation/presets";
import { applyInheritedMediaRadius, refreshRecipeMediaHistory, restoreRecipeMediaStructure, selectRecipeMediaPreset, type RecipeMediaHistory } from "../src/page-builder/template-creation/mediaSelection";

test("媒体历史保留最新设置、继承、身份与结构撤销语义", () => {
const [hero, logo] = createMediaSlots(["heroImage", "logo"]);
logo.borderRadius = 27;
const initial: RecipeMediaHistory = { heroLogo: { media: [hero, logo], edited: { [logo.id]: true } } };
const before = structuredClone(initial);
const editedHero = { ...hero, aspectRatio: .75, fitMode: "contain" as const };
const history = refreshRecipeMediaHistory(initial, [editedHero], {});
const restored = selectRecipeMediaPreset([editedHero, ...history.heroLogo.media.filter((slot) => slot.id !== hero.id)], ["heroImage", "logo"], 0);
const styled = applyInheritedMediaRadius(restored, 0, history.heroLogo.edited);
assert.equal(styled[0].id, hero.id);
assert.equal(styled[0].aspectRatio, .75);
assert.equal(styled[0].fitMode, "contain");
assert.equal(styled[0].borderRadius, 0);
assert.equal(styled[1].id, logo.id);
assert.equal(styled[1].borderRadius, 27);
assert.deepEqual(initial, before, "history input must remain unchanged");

// 图片在另一个组合修改后又移出，再恢复任何旧组合也不能回到旧设置。
const explicitHero = { ...editedHero, borderRadius: 13 };
const latest = refreshRecipeMediaHistory(history, [explicitHero], { [hero.id]: true });
const absent = refreshRecipeMediaHistory(latest, [], {});
assert.equal(applyInheritedMediaRadius(absent.heroLogo.media, 32, absent.heroLogo.edited)[0].borderRadius, 13);
assert.equal(absent.heroLogo.media[0].aspectRatio, .75);
assert.equal(absent.heroLogo.media[1].borderRadius, 27);

// 普通继承、Logo 独立设置及圆形互不覆盖。
const circle = { ...hero, shape: "circle" as const, borderRadius: 13 };
assert.equal(applyInheritedMediaRadius([circle], 0, { [circle.id]: true })[0].shape, "circle");
assert.equal(applyInheritedMediaRadius([logo], 32, { [logo.id]: true })[0].borderRadius, 27);
assert.equal(applyInheritedMediaRadius([hero], 32, {})[0].borderRadius, 32);

// 从双图增加到三图，不能占用暂存主图的 id，污染其历史设置。
const two = selectRecipeMediaPreset([hero], ["custom", "custom"], 16);
const three = selectRecipeMediaPreset(two, ["custom", "custom", "custom"], 16, [hero.id]);
assert.equal(three.some((slot) => slot.id === hero.id), false);
assert.equal(new Set(three.map((slot) => slot.id)).size, 3);
assert.notEqual(selectRecipeMediaPreset([], ["custom"], 16, [hero.id])[0].id, hero.id);

// 撤回结构仅恢复成员和角色，不撤回此后对存量主图的比例、名称和圆角编辑。
const undo = restoreRecipeMediaStructure(initial.heroLogo, [{ ...explicitHero, name: "已改名称", role: "secondaryImage" }], { [hero.id]: true });
assert.equal(undo.media[0].role, "heroImage");
assert.equal(undo.media[0].name, "已改名称");
assert.equal(undo.media[0].aspectRatio, .75);
assert.equal(undo.media[0].borderRadius, 13);
assert.equal(undo.media[1].borderRadius, 27);
assert.equal(undo.edited[hero.id], true);
assert.equal(undo.edited[logo.id], true);
assert.deepEqual(initial, before);

// 临时用作背景时只改变显示用途，风格变更不能擦除原始外观。
const background = { ...explicitHero, role: "backgroundImage" as const };
const styledBackground = applyInheritedMediaRadius([background], 32, { [hero.id]: true });
assert.equal(styledBackground[0].borderRadius, 13);
assert.equal(applyInheritedMediaRadius([{ ...styledBackground[0], role: "heroImage" }], 0, { [hero.id]: true })[0].borderRadius, 13);
});
