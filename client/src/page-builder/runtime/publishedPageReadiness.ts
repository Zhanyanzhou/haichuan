import {
  ensureEditorPageStructure,
  getEditorPage,
  isContentTemplateBlockPublicReady,
  isContentTemplateBlockPublicRenderable,
  isEditorPageKey,
  type EditorPageKey,
} from "@/page-builder/config/editorPages";

type PublicPuckBlock = {
  type?: string;
  props?: Record<string, unknown>;
};

type PublicPuckData = {
  content?: PublicPuckBlock[];
  [key: string]: unknown;
};

export type PublishedPageReadiness = {
  data: PublicPuckData;
  ready: boolean;
};

/**
 * 纯品牌页至少需要一个真正会输出内容的品牌区块。
 * 空商品行可以保留在动态业务页的旧快照中，但不能单独把作品展陈判为可公开。
 */
export function isRenderablePublishedBrandBlock(block: PublicPuckBlock) {
  if (!block?.type || block.props?.isVisible === false || block.type === "业务功能区") {
    return false;
  }
  if (block.type !== "产品展示行") return true;

  const productIds = Array.isArray(block.props?.productIds)
    ? block.props.productIds
    : [];
  const productCodes = Array.isArray(block.props?.productCodes)
    ? block.props.productCodes
    : [];
  return productIds.length > 0 || productCodes.length > 0;
}

/**
 * 对发布快照的只读副本应用页面能力矩阵，并复用内容模板合同判断必填语义是否可公开。
 * 不升级、不回写旧文档，也不建立独立于生成合同的第二套发布规则。
 */
export function getPublishedPageReadiness(
  pageKey: string | undefined,
  sourceData: PublicPuckData | null | undefined,
): PublishedPageReadiness | null {
  if (!pageKey || !sourceData || !isEditorPageKey(pageKey)) return null;

  const key: EditorPageKey = pageKey;
  const data = ensureEditorPageStructure(key, sourceData) as PublicPuckData;
  const visibleBlocks = Array.isArray(data.content)
    ? data.content.filter((block) => block?.props?.isVisible !== false)
    : [];
  const brandBlocks = visibleBlocks
    .filter(isRenderablePublishedBrandBlock)
    .filter((block) => isContentTemplateBlockPublicRenderable(block));
  const invalidBlocks = visibleBlocks
    .filter((block) => block?.type !== "业务功能区")
    .filter((block) => !isContentTemplateBlockPublicReady(block));
  const hasBusinessRegion = visibleBlocks.some((block) => block?.type === "业务功能区");
  const hasRenderablePageContent = getEditorPage(key).dynamic
    ? hasBusinessRegion || brandBlocks.length > 0
    : brandBlocks.length > 0;

  return {
    data,
    ready: hasRenderablePageContent && invalidBlocks.length === 0,
  };
}
