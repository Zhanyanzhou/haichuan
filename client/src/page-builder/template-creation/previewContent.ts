import type { TemplateDefinitionV2 } from "../template-definition/generated/templateDefinition.generated";
import { CONTENTS } from "./presets";

/** 系统样例只供创建预览与初始空间估算，不属于配方或模板的正式内容。 */
export function getTemplateRecipeSampleText(role: string, name: string, maxLength?: number): string {
  const sample = role === "customText" ? name : CONTENTS.find(([key]) => key === role)?.[2] ?? name;
  return maxLength === undefined ? sample : sample.slice(0, maxLength);
}

/** 通过 Renderer 的临时实例参数显示样例；不修改 definition 或写入 previewContent。 */
export function createTemplateRecipePreviewContent(definition: TemplateDefinitionV2): Record<string, unknown> {
  const content: Record<string, unknown> = {};
  for (const slot of Object.values(definition.slots)) {
    if (Object.prototype.hasOwnProperty.call(definition.defaultContent, slot.slotId)
      || !slot.semanticRole || slot.type === "image") continue;
    const sample = getTemplateRecipeSampleText(slot.semanticRole, slot.label, slot.validation.maxLength);
    content[slot.slotId] = slot.type === "button" ? { label: sample, targetType: "none" } : sample;
  }
  return content;
}
