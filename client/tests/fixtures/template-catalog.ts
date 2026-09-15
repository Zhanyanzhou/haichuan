import { createBlankDynamicTemplateDefinition } from "../../src/page-builder/template-definition/nodeRegistry";

export const PAGE_TEMPLATE_FIXTURE_ID = "tpl_page_test_primary";
export const PAGE_TEMPLATE_FIXTURE_NAME = "首屏";
export const PAGE_TEMPLATE_FIXTURE_VERSION = 1;

/** 页面装修只消费已发布动态模板；该夹具用于不关注模板制作过程的页面行为测试。 */
export function publishedPageTemplateCatalog() {
  const definition = createBlankDynamicTemplateDefinition(PAGE_TEMPLATE_FIXTURE_NAME);
  definition.templateId = PAGE_TEMPLATE_FIXTURE_ID;
  definition.metadata.category = "页面内容";
  definition.metadata.purpose = "页面插入与草稿保护回归";
  return {
    source: "test-contract",
    items: [{
      kind: "published" as const,
      template: {
        templateId: PAGE_TEMPLATE_FIXTURE_ID,
        sourceReference: null,
        name: PAGE_TEMPLATE_FIXTURE_NAME,
        category: definition.metadata.category,
        purpose: definition.metadata.purpose,
        layoutType: definition.metadata.layoutType,
        description: definition.description,
        slotSummary: definition.metadata.slotSummary,
        recommendedFor: definition.metadata.recommendedFor,
        tags: definition.metadata.tags,
        version: PAGE_TEMPLATE_FIXTURE_VERSION,
        schemaVersion: definition.schemaVersion,
        definition,
        definitionChecksum: "a".repeat(64),
        versionNote: null,
        publishedAt: "2026-09-12T00:00:00.000Z",
      },
    }],
  };
}
