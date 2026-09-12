import assert from "node:assert/strict";
import { test } from "@playwright/test";
import { registerPendingCommittedInput, unregisterPendingCommittedInput, focusFirstInvalidNumberField } from "../src/page-builder/inspector/controls/NumberField";
import { createRecommendedRecipe } from "../src/page-builder/template-creation/presets";
import { generateTemplateFromRecipe } from "../src/page-builder/template-creation/generateTemplateFromRecipe";
import { useTemplateEditorSession } from "../src/page-builder/template-editor/templateEditorSession";

test("非法内联文字阻止切换，修正后只提交一次，取消会释放守卫", () => {
const definition = generateTemplateFromRecipe(createRecommendedRecipe("productPromotion"));
const title = Object.values(definition.slots).find((slot) => slot.semanticRole === "title")!;
const original = structuredClone(definition);
const session = useTemplateEditorSession;
session.getState().open({ format: "dynamic", sourceType: "local", localDraftId: definition.templateId, versionNote: "", definition });
let value = "字".repeat(81);
let focused = 0;
let committed = 0;
const attributes = new Map<string, string>();
const textarea = { getAttribute: (key: string) => attributes.get(key) ?? null, focus: () => { focused += 1; }, scrollIntoView: () => undefined } as unknown as HTMLTextAreaElement;
Object.defineProperty(globalThis, "document", { configurable: true, value: { querySelectorAll: (selector: string) => {
  assert.ok(selector.includes('[data-committed-text-input="true"]'));
  return [textarea];
} } });
registerPendingCommittedInput(textarea, () => {
  const result = session.getState().executeCommand({ type: "update-definition", label: "修改槽位默认文字", update: (next) => { next.defaultContent[title.slotId] = value; } });
  if (result.ok) { attributes.delete("aria-invalid"); committed += Number(result.changed); }
  else attributes.set("aria-invalid", "true");
  return result.ok;
});
assert.equal(focusFirstInvalidNumberField(), true);
assert.equal(value.length, 81);
assert.deepEqual(session.getState().draft!.definition, original);
assert.equal(session.getState().historyPast.length, 0);
session.getState().setDevice("mobile");
assert.equal(session.getState().device, "desktop");
assert.equal(session.getState().setBreakpoint("tablet"), false);
assert.equal(session.getState().setPreviewWidth(390), false);
assert.ok(focused >= 3);
assert.equal(committed, 0);

value = "修正后的标题";
session.getState().setDevice("mobile");
assert.equal(session.getState().device, "mobile");
assert.equal(session.getState().draft!.definition.defaultContent[title.slotId], value);
assert.equal(session.getState().historyPast.length, 1);
assert.equal(focusFirstInvalidNumberField(), false);
assert.equal(committed, 1);

// 取消/卸载解除注册：无效临时值不再阻止离开，也不提交进草稿。
value = "字".repeat(81);
unregisterPendingCommittedInput(textarea);
attributes.delete("aria-invalid");
session.getState().setDevice("desktop");
assert.equal(session.getState().device, "desktop");
assert.equal(session.getState().draft!.definition.defaultContent[title.slotId], "修正后的标题");
assert.equal(session.getState().historyPast.length, 1);
Reflect.deleteProperty(globalThis, "document");
});
