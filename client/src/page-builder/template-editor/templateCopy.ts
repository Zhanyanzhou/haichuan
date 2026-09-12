import { createDynamicTemplateStableId, normalizeTemplateDimensionContract, type TemplateDefinitionV2 } from "../template-definition";

/** 复制独立身份。Schema1 保留独立断点原文，通过可信来源请求保存，不隐式升级。 */
export function copyTemplateDefinition(source: TemplateDefinitionV2): TemplateDefinitionV2 {
  const next = structuredClone(source);
  next.templateId = createDynamicTemplateStableId("tpl");
  next.name = `${source.name.slice(0, 76)} 副本`;
  if (source.schemaVersion === 1) return next;
  next.schemaVersion = 3;
  next.previewContent = {};
  return normalizeTemplateDimensionContract(next);
}
