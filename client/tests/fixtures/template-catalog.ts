import {
  CONTENT_TEMPLATE_REGISTRY,
  getContentTemplateContract,
  sanitizeContentTemplateLayoutData,
} from "../../src/page-builder/generated/contentTemplates.generated";

/**
 * 统一模板目录的确定性系统母模板夹具。
 *
 * 旧测试曾用空对象兜底所有未关注接口；统一目录上线后，200 空对象会被视为
 * 一次成功读取，进而把模板库错误地测试成空目录。这里让相关编辑器测试共同
 * 返回与机器合同一致的 24 个兼容来源，不在各 spec 内复制第二份目录事实。
 */
export function systemTemplateCatalogItems() {
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
        activeVersion: 0,
        layoutData,
        source: "code" as const,
        changeNote: null,
        updatedAt: null,
      },
    };
  });
}

export function systemTemplateCatalog() {
  return { source: "test-contract", items: systemTemplateCatalogItems() };
}
