import type { TemplateDefinitionV2 } from "../template-definition/generated/templateDefinition.generated";
import { setTemplateDesignWidth } from "../template-definition/templateDimensions";

/** 逻辑设计宽度属于模板，不改变观察宽度、初始配方或内部对象。 */
export function setTemplateLogicalDesignWidth(definition: TemplateDefinitionV2, width: number): TemplateDefinitionV2 {
  if (!definition.metadata.canvasSize) throw new Error("当前模板没有独立设计画布，请继续使用现有尺寸规则。");
  if (!Number.isInteger(width) || width < 1 || width > 4096) throw new Error("设计宽度须为 1–4096 px 的整数。");
  return setTemplateDesignWidth(definition, "desktop", width);
}
