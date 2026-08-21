import {
  createPageDocumentSeed,
  jewelryHomeTemplate,
} from "@/page-builder/templates/templates";
import type { DesignMode } from "@/page-builder/designSystem/masters";
import { createContentTemplateMarker } from "@/page-builder/generated/contentTemplates.generated";

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
    description: "品牌故事、工艺与价值表达",
    publicPath: "/about",
    mode: "brand",
    headerMode: "overlay-light",
  },
  {
    key: "products",
    label: "珠宝作品",
    description: "视觉页头 + 固定商品列表；商品资料来自商品管理",
    publicPath: "/products",
    mode: "brand",
    headerMode: "solid",
    dynamic: true,
    businessRegion: {
      title: "商品列表与筛选",
      description: "商品卡片、分类、排序和分页由商品管理与前台筛选系统驱动。",
      items: "商品卡片|分类筛选|排序|分页",
    },
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
      description: "参数筛选、对比、排序和商品结果由选款中心的业务逻辑驱动。",
      items: "条件筛选|商品结果|排序|快速查看",
    },
  },
  {
    key: "custom",
    label: "珠宝定制",
    description: "定制服务说明与案例内容",
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
  const heroIndex = visualBlocks.findIndex(
    (block: any) => block?.type === "首屏主视觉",
  );
  // 商品、选款和预约的核心任务必须在简短首屏后立即出现；没有首屏时直接置顶。
  const insertionIndex = heroIndex >= 0 ? heroIndex + 1 : 0;
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

/** 规范化已知旧视觉，并为既有草稿补齐固定业务区。 */
export function ensureEditorPageStructure(key: EditorPageKey, data: any) {
  const normalizedData = migrateLegacyAboutVisuals(key, data);
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
