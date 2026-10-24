import assert from "node:assert/strict";
import { test } from "@playwright/test";
import { createContentSlot, createRecommendedRecipe } from "../src/page-builder/template-creation/presets";
import { generateTemplateFromRecipe } from "../src/page-builder/template-creation/generateTemplateFromRecipe";
import { createTemplatePreviewContentBySlotId } from "../src/page-builder/template-editor/templatePreviewModel";
import { createTemplateStressPreviewContentBySlotId, TEMPLATE_STRESS_PREVIEW_SCENARIOS } from "../src/page-builder/template-editor/templateStressPreviewEngine";

test("压力预览隔离默认值、显式清空、试排覆盖与旧版兼容", () => {
const definition = generateTemplateFromRecipe(createRecommendedRecipe("collection-story"));
const original = structuredClone(definition);
const slots = Object.values(definition.slots);
const image = slots.find((slot) => slot.type === "image")!;
const text = slots.find((slot) => slot.type === "text" || slot.type === "heading")!;
const short = createTemplateStressPreviewContentBySlotId(definition, "short-text");
assert.ok((short[image.slotId] as { src: string }).src);
assert.ok(short[text.slotId]);
assert.deepEqual(createTemplatePreviewContentBySlotId(definition), {});
assert.deepEqual(definition, original);

const configured = structuredClone(definition);
configured.defaultContent[image.slotId] = { src: "", alt: "" };
configured.defaultContent[text.slotId] = "";
assert.deepEqual(createTemplateStressPreviewContentBySlotId(configured, "short-text")[image.slotId], { src: "", alt: "" });
assert.equal(createTemplateStressPreviewContentBySlotId(configured, "short-text")[text.slotId], "");
configured.defaultContent[text.slotId] = "正式说明";
assert.equal(createTemplateStressPreviewContentBySlotId(configured, "short-text")[text.slotId], "正式说明");
configured.defaultContent[text.slotId] = null;
assert.equal(createTemplateStressPreviewContentBySlotId(configured, "short-text")[text.slotId], null);

const session = { [text.slotId]: "本次试排", [image.slotId]: "", unknown: "忽略" };
const sessionBefore = structuredClone(session);
const trial = createTemplateStressPreviewContentBySlotId(definition, "short-text", session);
assert.equal(trial[text.slotId], "本次试排");
assert.equal(trial[image.slotId], "");
assert.equal(Object.hasOwn(trial, "unknown"), false);
for (const scenario of TEMPLATE_STRESS_PREVIEW_SCENARIOS) {
  createTemplateStressPreviewContentBySlotId(definition, scenario, session);
}
assert.deepEqual(definition, original);
assert.deepEqual(session, sessionBefore);
assert.equal(createTemplateStressPreviewContentBySlotId(definition, "optional-missing")[text.slotId], "");
assert.ok((createTemplateStressPreviewContentBySlotId(definition, "long-text")[text.slotId] as string).length > (short[text.slotId] as string).length);
assert.ok((createTemplateStressPreviewContentBySlotId(definition, "media-ratios")[image.slotId] as { src: string }).src);

const legacy = { ...definition, schemaVersion: 2 as const };
assert.deepEqual(createTemplateStressPreviewContentBySlotId(legacy, "short-text"), createTemplatePreviewContentBySlotId(legacy));
const withRequired = structuredClone(definition);
withRequired.slots[text.slotId].required = true;
assert.equal(createTemplateStressPreviewContentBySlotId(withRequired, "required-missing")[text.slotId], "");
assert.ok(createTemplateStressPreviewContentBySlotId(withRequired, "optional-missing")[text.slotId]);
// 按钮资格只给主行动角色（不变量 F）：用页面首屏取得一个 ButtonSlot，
// 再追加的第二个 cta 会降级为 LinkSlot，但主行动仍是按钮。
// 两个 cta 必须给不同的槽位标识：createContentSlot 默认拿角色当 id，同名会被方案校验判为重复。
const actionRecipe = createRecommendedRecipe("page-hero");
actionRecipe.content.push(createContentSlot("cta", "cta_secondary"));
const actionDefinition = generateTemplateFromRecipe(actionRecipe);
const actionSlot = Object.values(actionDefinition.slots).find((slot) => slot.type === "button")!;
const action = createTemplateStressPreviewContentBySlotId(actionDefinition, "short-text")[actionSlot.slotId] as { label: string; targetType: string };
assert.ok(action.label);
assert.equal(action.targetType, "none");
});
