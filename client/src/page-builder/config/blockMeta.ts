/**
 * 区块库展示元数据。
 *
 * 当前只保留首屏模板作为模板库重建期间的测试入口。
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
    badge: "测试模板",
    description: "模板库重建期间保留的首屏测试入口。",
    tags: ["首屏", "测试"],
    recommended: true,
    master: CONTENT_TEMPLATE_CONTRACTS.hero.master,
    mode: "brand",
  },
};

export function getCategoryComponents(): Record<string, { defaultExpanded: boolean; components: string[] }> {
  return {
    品牌展示: {
      defaultExpanded: true,
      components: ["首屏主视觉"],
    },
  };
}
