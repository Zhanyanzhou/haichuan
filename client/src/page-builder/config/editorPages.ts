import {
  createPageDocumentSeed,
  jewelryHomeTemplate,
} from "@/page-builder/templates/templates";
import type { DesignMode } from "@/page-builder/designSystem/masters";
import {
  createContentTemplateMarker,
  getContentTemplateContract,
  getContentTemplatePageRule,
  isContentTemplateAllowedForPage,
} from "@/page-builder/generated/contentTemplates.generated";

export const EDITOR_PAGE_KEYS = [
  "home",
  "about",
  "products",
  "catalog",
  "custom",
  "contact",
] as const;

export type EditorPageKey = (typeof EDITOR_PAGE_KEYS)[number];

export type PageHeaderMode = "overlay-light" | "solid";

export type EditorPageDefinition = {
  key: EditorPageKey;
  label: string;
  description: string;
  publicPath: string;
  /** 首屏导航语境：只有具备深色首屏画面的品牌页使用白字覆盖模式。 */
  headerMode: PageHeaderMode;
  /** 页面视觉模式:Brand=奢侈品牌体验 / Commerce=高端电商体验(选款中心)。 */
  mode: DesignMode;
  /** 动态业务页仍由业务数据驱动，装修器只编辑其视觉框架。 */
  dynamic?: boolean;
  businessRegion?: { title: string; description: string; items: string };
};

export const editorPages: EditorPageDefinition[] = [
  {
    key: "home",
    label: "店铺首页",
    description: "品牌首屏与首页内容",
    publicPath: "/",
    mode: "brand",
    headerMode: "overlay-light",
  },
  {
    key: "about",
    label: "关于海川",
    description: "品牌精神、审美、工艺与可核验背景",
    publicPath: "/about",
    mode: "brand",
    headerMode: "overlay-light",
  },
  {
    key: "products",
    label: "珠宝作品",
    description: "编辑式作品展陈；具体找款工具集中在选款中心",
    publicPath: "/products",
    mode: "brand",
    headerMode: "solid",
  },
  {
    key: "catalog",
    label: "选款中心",
    description: "视觉页头 + 固定选款工具；筛选数据来自商品配置",
    publicPath: "/catalog",
    mode: "commerce",
    headerMode: "solid",
    dynamic: true,
    businessRegion: {
      title: "选款工具与商品结果",
      description: "搜索、筛选、排序、快速查看、选款清单与询价由选款中心的真实业务逻辑驱动。",
      items: "关键词/货号搜索|条件筛选|排序与结果|快速查看|选款清单|提交询价",
    },
  },
  {
    key: "custom",
    label: "珠宝定制",
    description: "统一的高级定制叙事；需求类型在咨询流程中处理",
    publicPath: "/custom",
    mode: "brand",
    headerMode: "overlay-light",
  },
  {
    key: "contact",
    label: "预约咨询",
    description: "视觉页头 + 固定预约表单与联系信息",
    publicPath: "/contact",
    mode: "brand",
    headerMode: "solid",
    dynamic: true,
    businessRegion: {
      title: "预约表单与联系信息",
      description:
        "预约提交、服务时间和门店联系方式由咨询服务与店铺资料统一管理。",
      items: "预约表单|联系信息|服务时间|隐私同意",
    },
  },
];

/** 每个页面的推荐结构模板 id（templates.ts 单一来源）。 */
const templateIdByPage: Record<EditorPageKey, string> = {
  home: "jewelry-home-v2",
  about: "jewelry-about-v1",
  products: "jewelry-products-v1",
  catalog: "jewelry-catalog-v1",
  custom: "jewelry-custom-v1",
  contact: "jewelry-contact-v1",
};

const LEGACY_ABOUT_VISUALS: Record<string, string> = {
  "/uploads/2026/08/12/021a4e7e-5533-4f69-b232-bda3827c55fc.png": "/images/镶嵌.png",
  "/uploads/2026/08/12/762c29cb-9b9c-4d5f-90ab-e7f9d77f12e5.png": "/images/设计.png",
};

export function isEditorPageKey(
  value: string | undefined,
): value is EditorPageKey {
  return Boolean(value && EDITOR_PAGE_KEYS.includes(value as EditorPageKey));
}

export function getEditorPage(key: EditorPageKey) {
  return editorPages.find((page) => page.key === key) ?? editorPages[0];
}

export function getEditorPageByPath(path: string) {
  return editorPages.find((page) => page.publicPath === path);
}

/** 覆盖式白色导航只有在首个可见品牌模块满足机器合同要求时启用。 */
export function resolvePageHeaderMode(
  key: EditorPageKey,
  data: { content?: Array<{ type?: string; props?: Record<string, unknown> }> } | null | undefined,
): PageHeaderMode {
  const page = getEditorPage(key);
  const rule = getContentTemplatePageRule(key);
  if (page.headerMode !== "overlay-light" || !rule?.headerMode.overlayRequiresFirstTemplate) {
    return "solid";
  }
  const firstVisible = data?.content?.find(
    (block) => block?.props?.isVisible !== false && block?.type !== "业务功能区",
  );
  const contract = getContentTemplateContract(firstVisible?.type || "");
  return contract?.key === rule.headerMode.overlayRequiresFirstTemplate
    ? "overlay-light"
    : rule.headerMode.fallback;
}

/** 为尚未保存的页面提供可立即编辑、且彼此可区分的初始画布（即该页面的推荐结构）。 */
export function createEditorPageDefault(key: EditorPageKey) {
  const data = createPageDocumentSeed(templateIdByPage[key]) ?? JSON.parse(
    JSON.stringify(jewelryHomeTemplate.puckData),
  );
  // 仅新建整页方案时写入印记；已有草稿、导入内容和历史 revision 保持 legacy-0，
  // 普通读取与保存均不会借此补写或升级。
  data.content = (data.content ?? []).map((block: { type?: string; props?: Record<string, unknown> }) => {
    const marker = createContentTemplateMarker(block.type || "");
    return marker
      ? { ...block, props: { ...(block.props ?? {}), __contentTemplate: marker } }
      : block;
  });
  const page = getEditorPage(key);
  if (!page.businessRegion) return data;

  data.content = placeBusinessRegion(key, data.content ?? [], {
    type: "业务功能区",
    props: {
      id: `${key}-business-region`,
      pageKey: key,
      ...page.businessRegion,
      locked: true,
    },
  });
  return data;
}

function placeBusinessRegion(
  key: EditorPageKey,
  content: any[],
  businessRegionBlock: any,
) {
  const visualBlocks = content.filter(
    (block: any) => block?.type !== "业务功能区",
  );
  // 动态业务区始终紧随第一个受控品牌框架；这与机器合同的
  // after-first-brand-block 位置语义一致，不把“必须是 Hero”写成第二套规则。
  const insertionIndex = visualBlocks.length > 0 ? 1 : 0;
  const nextContent = [...visualBlocks];
  nextContent.splice(insertionIndex, 0, businessRegionBlock);
  return nextContent;
}

/**
 * 已发布的旧「关于海川」曾使用大面积金黄色山水与室内图。
 * 仅迁移这两个已知资源地址；新上传或重新发布的视觉不会被改写。
 */
function migrateLegacyAboutVisuals(key: EditorPageKey, data: any) {
  if (key !== "about" || !Array.isArray(data?.content)) return data;

  let changed = false;
  const content = data.content.map((block: any) => {
    const desktopImage = block?.props?.desktopImage;
    const replacement = typeof desktopImage === "string"
      ? LEGACY_ABOUT_VISUALS[desktopImage]
      : undefined;
    if (!replacement) return block;

    changed = true;
    return {
      ...block,
      props: {
        ...block.props,
        desktopImage: replacement,
        mobileImage: replacement,
      },
    };
  });

  return changed ? { ...data, content } : data;
}

/**
 * 旧发布文档可能包含当前页面能力矩阵已禁止的模块。
 * 读取时过滤副本，不回写或升级原始草稿/发布快照。
 */
function normalizePageCapabilities(key: EditorPageKey, data: any) {
  if (!data || typeof data !== "object") return data;
  const rule = getContentTemplatePageRule(key);
  if (!rule) return data;

  const isAllowed = (block: any) => block?.type === "业务功能区"
    ? rule.businessRegionCount === 1
    : isContentTemplateAllowedForPage(key, block?.type || "");
  let changed = false;
  const filterBlocks = (blocks: unknown) => {
    if (!Array.isArray(blocks)) return blocks;
    const filtered = blocks.filter(isAllowed);
    if (filtered.length !== blocks.length) changed = true;
    return filtered;
  };

  const content = filterBlocks(data.content);
  const zones = data.zones && typeof data.zones === "object"
    ? Object.fromEntries(
        Object.entries(data.zones).map(([zone, blocks]) => [zone, filterBlocks(blocks)]),
      )
    : data.zones;
  if (!changed) return data;
  return { ...data, content, ...(data.zones ? { zones } : {}) };
}

/** 规范化已知旧视觉，并为既有草稿补齐固定业务区。 */
export function ensureEditorPageStructure(key: EditorPageKey, data: any) {
  const normalizedData = normalizePageCapabilities(
    key,
    migrateLegacyAboutVisuals(key, data),
  );
  const page = getEditorPage(key);
  if (!page.businessRegion) return normalizedData;
  const content = Array.isArray(normalizedData?.content)
    ? normalizedData.content
    : [];
  const existingBusinessRegion = content.find(
    (block: any) => block.type === "业务功能区",
  );

  const businessRegionBlock = {
    type: "业务功能区",
    props: {
      id: `${key}-business-region`,
      pageKey: key,
      ...page.businessRegion,
      ...(existingBusinessRegion?.props ?? {}),
      locked: true,
    },
  };
  return {
    ...normalizedData,
    content: placeBusinessRegion(key, content, businessRegionBlock),
  };
}
