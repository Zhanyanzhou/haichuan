/** 咨询起步模板只用于空页播种与模板设计，不进入页面装修添加目录。 */
export const CONSULTATION_STARTER_TAG = "consultation-starter";
export const CONSULTATION_STARTER_SOURCE_PREFIX = "consultation-starter:";
export const CONSULTATION_STARTER_TEMPLATE_ID_PREFIX = "hc_consult_";

export function isConsultationStarterTemplate(template: {
  templateId?: string | null;
  tags?: readonly string[] | null;
  sourceReference?: string | null;
}): boolean {
  if (template.tags?.includes(CONSULTATION_STARTER_TAG)) return true;
  if (template.sourceReference?.startsWith(CONSULTATION_STARTER_SOURCE_PREFIX)) return true;
  if (template.templateId?.startsWith(CONSULTATION_STARTER_TEMPLATE_ID_PREFIX)) return true;
  return false;
}
