import {
  jewelryHomeTemplate,
  pageTemplates,
} from "@/page-builder/templates/templates";
import type { DesignMode } from "@/page-builder/designSystem/masters";

export const EDITOR_PAGE_KEYS = [
  "home",
  "about",
  "products",
  "catalog",
  "custom",
  "contact",
] as const;

export type EditorPageKey = (typeof EDITOR_PAGE_KEYS)[number];

export type EditorPageDefinition = {
  key: EditorPageKey;
  label: string;
  description: string;
  publicPath: string;
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
  },
  {
    key: "about",
    label: "关于海川",
    description: "品牌故事、工艺与价值表达",
    publicPath: "/about",
    mode: "brand",
  },
  {
    key: "products",
    label: "珠宝作品",
    description: "视觉页头 + 固定商品列表；商品资料来自商品管理",
    publicPath: "/products",
    mode: "brand",
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
  },
  {
    key: "contact",
    label: "预约咨询",
    description: "视觉页头 + 固定预约表单与联系信息",
    publicPath: "/contact",
    mode: "brand",
    dynamic: true,
    businessRegion: {
      title: "预约表单与联系信息",
      description:
        "预约提交、服务时间和门店联系方式由咨询服务与店铺资料统一管理。",
      items: "预约表单|联系信息|服务时间|隐私同意",
    },
  },
];

const templateIndexByPage: Record<EditorPageKey, number> = {
  home: 0,
  about: 0,
  products: 1,
  catalog: 1,
  custom: 2,
  contact: 3,
};

const pageCopy: Record<
  EditorPageKey,
  { title: string; subtitle: string; posterTitle: string; ctaTitle: string }
> = {
  home: {
    title: "海川珠宝",
    subtitle: "传承东方美学，匠心铸造经典",
    posterTitle: "品牌故事",
    ctaTitle: "预约鉴赏",
  },
  about: {
    title: "关于海川",
    subtitle: "在东方审美与当代工艺之间，守护每一份珍贵",
    posterTitle: "海川的匠心",
    ctaTitle: "走进海川",
  },
  products: {
    title: "珠宝作品",
    subtitle: "从经典系列到当季新作，发现心仪臻品",
    posterTitle: "本季精选",
    ctaTitle: "预约专属选购",
  },
  catalog: {
    title: "选款中心",
    subtitle: "按风格、材质与场景，快速找到合适作品",
    posterTitle: "从心挑选",
    ctaTitle: "获取选款建议",
  },
  custom: {
    title: "珠宝定制",
    subtitle: "以专属设计，记录独一无二的重要时刻",
    posterTitle: "定制之旅",
    ctaTitle: "预约定制咨询",
  },
  contact: {
    title: "预约咨询",
    subtitle: "一对一珠宝顾问，为您安排专属服务",
    posterTitle: "专属服务",
    ctaTitle: "联系我们",
  },
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

/** 为尚未保存的页面提供可立即编辑、且彼此可区分的初始画布。 */
export function createEditorPageDefault(key: EditorPageKey) {
  const source =
    pageTemplates[templateIndexByPage[key]]?.puckData ??
    jewelryHomeTemplate.puckData;
  const data = JSON.parse(JSON.stringify(source));
  const copy = pageCopy[key];
  const page = getEditorPage(key);
  const editableContent = (data.content ?? []).map((block: any) => {
    if (block.type === "首屏主视觉")
      return {
        ...block,
        props: { ...block.props, title: copy.title, subtitle: copy.subtitle },
      };
    if (block.type === "单图海报")
      return { ...block, props: { ...block.props, title: copy.posterTitle } };
    if (block.type === "文字横幅")
      return { ...block, props: { ...block.props, title: copy.ctaTitle } };
    return block;
  });
  // 动态业务页的基础框架遵循真实前台顺序：视觉页头 → 固定业务区。
  data.content = page.businessRegion
    ? [
        editableContent.find((block: any) => block.type === "首屏主视觉") ??
          editableContent[0],
        {
          type: "业务功能区",
          props: {
            id: `${key}-business-region`,
            pageKey: key,
            ...page.businessRegion,
            locked: true,
          },
        },
      ].filter(Boolean)
    : editableContent;
  return data;
}

/** 为既有草稿补齐固定业务区，不改写已编辑的视觉内容。 */
export function ensureEditorPageStructure(key: EditorPageKey, data: any) {
  const page = getEditorPage(key);
  if (!page.businessRegion) return data;
  const content = Array.isArray(data?.content) ? data.content : [];
  const existingBusinessRegion = content.find(
    (block: any) => block.type === "业务功能区",
  );

  // 已有业务功能区：原样保留全部内容，绝不裁剪用户已保存的装修模块。
  if (existingBusinessRegion) return data;

  // 旧草稿迁移：仅在缺少业务功能区时，在首屏主视觉之后补入固定业务区，其余内容全部保留。
  const heroIndex = content.findIndex(
    (block: any) => block.type === "首屏主视觉",
  );
  const businessRegionBlock = {
    type: "业务功能区",
    props: {
      id: `${key}-business-region`,
      pageKey: key,
      ...page.businessRegion,
      locked: true,
    },
  };
  const nextContent = [...content];
  if (heroIndex >= 0) {
    nextContent.splice(heroIndex + 1, 0, businessRegionBlock);
  } else {
    nextContent.unshift(businessRegionBlock);
  }
  return { ...data, content: nextContent };
}
