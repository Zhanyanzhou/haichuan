/**
 * 已保存首屏测试区块的展示名称。
 * 新页面不再从这里插入区块，只从模板组件库添加。
 */
import type { DesignMode, MasterId } from "../designSystem/masters";
import type { ContentTemplateCommercialPurpose } from "../generated/contentTemplates.generated";
import {
  CONTENT_TEMPLATE_CONTRACTS,
  CONTENT_TEMPLATE_REGISTRY,
} from "../generated/contentTemplates.generated";

export type ContentTemplateImplementationStatus =
  (typeof CONTENT_TEMPLATE_REGISTRY)[number]["implementationStatus"];

const CONTENT_TEMPLATE_STATUS_BY_MODULE_TYPE = new Map<
  string,
  ContentTemplateImplementationStatus
>(
  CONTENT_TEMPLATE_REGISTRY.map(
    (template) => [template.moduleType, template.implementationStatus] as const,
  ),
);

export function getContentTemplateImplementationStatus(
  moduleType: string,
): ContentTemplateImplementationStatus | undefined {
  return CONTENT_TEMPLATE_STATUS_BY_MODULE_TYPE.get(moduleType);
}

export function isContentTemplateInsertable(moduleType: string): boolean {
  return getContentTemplateImplementationStatus(moduleType) === "active";
}

export type BlockCategory = ContentTemplateCommercialPurpose;

export const BLOCK_CATEGORIES: BlockCategory[] = ["品牌展示"];

export const BLOCK_PREVIEW_KIND: Record<string, string> = {
  首屏主视觉: "hero",
};

export interface BlockMeta {
  name: string;
  category: BlockCategory;
  order: number;
  type: string;
  scenes?: BlockCategory[];
  previewImage?: string;
  description: string;
  tags: string[];
  badge?: string;
  recommended?: boolean;
  master: MasterId;
  mode: DesignMode;
}

export const BLOCK_META: Record<string, BlockMeta> = {
  首屏主视觉: {
    name: "首屏",
    category: CONTENT_TEMPLATE_CONTRACTS.hero.commercialPurpose,
    order: 1,
    type: "主视觉",
    badge: "历史区块",
    description: "早期页面里保存下来的首屏。新的画面从模板组件库添加。",
    tags: ["首屏", "测试"],
    recommended: true,
    master: CONTENT_TEMPLATE_CONTRACTS.hero.master,
    mode: "brand",
  },
};
