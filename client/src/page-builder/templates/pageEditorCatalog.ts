import { isConsultationStarterTemplate } from "./consultationStarterCatalog";

/** 合同内的 hero 首屏测试样例，不是运营可添加的成品模板。 */
export const HERO_TEST_SAMPLE_TEMPLATE_ID = "tpl_hero";
export const HERO_TEST_SAMPLE_TAG = "hero-test-sample";
export const HERO_TEST_SAMPLE_SOURCE_PREFIX = "content-template:hero";

export function isHeroTestSampleTemplate(template: {
  templateId?: string | null;
  tags?: readonly string[] | null;
  sourceReference?: string | null;
}): boolean {
  if (template.templateId === HERO_TEST_SAMPLE_TEMPLATE_ID) return true;
  if (template.tags?.includes(HERO_TEST_SAMPLE_TAG)) return true;
  if (template.sourceReference?.startsWith(HERO_TEST_SAMPLE_SOURCE_PREFIX)) return true;
  return false;
}

export function isPageEditorLibraryTemplate(template: {
  templateId?: string | null;
  tags?: readonly string[] | null;
  sourceReference?: string | null;
}): boolean {
  return !isConsultationStarterTemplate(template) && !isHeroTestSampleTemplate(template);
}

/** 模板设计目录管理运营母模板；首屏测试样例不得作为普通项出现。 */
export function isTemplateDesignLibraryTemplate(template: {
  templateId?: string | null;
  tags?: readonly string[] | null;
  sourceReference?: string | null;
}): boolean {
  return !isHeroTestSampleTemplate(template);
}
