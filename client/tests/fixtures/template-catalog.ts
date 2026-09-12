import {
  CONTENT_TEMPLATE_REGISTRY,
  getContentTemplateContract,
  sanitizeContentTemplateLayoutData,
} from "../../src/page-builder/generated/contentTemplates.generated";
import { createBlankDynamicTemplateDefinition } from "../../src/page-builder/template-definition/nodeRegistry";

export const PAGE_TEMPLATE_FIXTURE_ID = "tpl_page_test_primary";
export const PAGE_TEMPLATE_FIXTURE_NAME = "首屏";
export const PAGE_TEMPLATE_FIXTURE_VERSION = 1;

/**
 * 统一模板目录的确定性系统母模板夹具。
 *
 * 旧测试曾用空对象兜底所有未关注接口；统一目录上线后，200 空对象会被视为
 * 一次成功读取，进而把模板库错误地测试成空目录。这里让相关编辑器测试共同
 * 返回与活动机器目录一致的兼容来源，不在各 spec 内复制第二份目录事实。
 */
export function systemTemplateCatalogItems(options: { activeVersion?: number } = {}) {
  const activeVersion = options.activeVersion ?? 0;
  return CONTENT_TEMPLATE_REGISTRY.map((entry) => {
    const contract = getContentTemplateContract(entry.moduleType);
    const layoutData = sanitizeContentTemplateLayoutData(entry.moduleType, { version: 2 });
    if (!contract || !layoutData) {
      throw new Error(`系统母模板合同无效：${entry.moduleType}`);
    }
    return {
      kind: "system-compatibility" as const,
      template: {
        contractKey: contract.key,
        moduleType: entry.moduleType,
        displayName: contract.displayName,
        contractVersion: contract.version,
        activeVersion,
        layoutData,
        source: activeVersion > 0 ? "database" as const : "code" as const,
        changeNote: null,
        updatedAt: activeVersion > 0 ? "2026-09-10T00:00:00.000Z" : null,
      },
    };
  });
}

export function systemTemplateCatalog(options: { activeVersion?: number } = {}) {
  return { source: "test-contract", items: systemTemplateCatalogItems(options) };
}

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
