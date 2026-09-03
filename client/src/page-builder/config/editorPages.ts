import {
  createPageDocumentSeed,
  jewelryHomeTemplate,
} from "@/page-builder/templates/templates";
import type { DesignMode } from "@/page-builder/designSystem/masters";
import {
  CONTENT_TEMPLATE_PAGE_PATHS,
  createContentTemplateMarker,
  getContentTemplateCompletion,
  getContentTemplateContract,
  getContentTemplateMediaReferences,
  getContentTemplatePageRule,
  isContentTemplateAllowedForPage,
} from "@/page-builder/generated/contentTemplates.generated";
import {
  DYNAMIC_TEMPLATE_BLOCK_TYPE,
  DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY,
  dynamicTemplateVersionKey,
  readResolvedDynamicTemplateDefinitions,
} from "@/page-builder/dynamic-template-instance";
import type { PuckBlock, PuckDocument } from "@/page-builder/types";

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
  /** 首屏导航对比语境：深色 Hero 使用白字，其余浅色首屏使用深色字。 */
  headerMode: PageHeaderMode;
  /** 页面视觉模式:Brand=奢侈品牌体验 / Commerce=高端电商体验(选款中心)。 */
  mode: DesignMode;
  /** 动态业务页仍由业务数据驱动，装修器只编辑其视觉框架。 */
  dynamic?: boolean;
  businessRegion?: { title: string; description: string; items: string };
  /** 未取得可公开 PageDocument 时的真实安全短页；不得复用编辑器 seed。 */
  publicFallback?: {
    eyebrow: string;
    title: string;
    description: string;
    primaryAction: { label: string; href: string };
    secondaryAction?: { label: string; href: string };
  };
};

export const editorPages: EditorPageDefinition[] = [
  {
    key: "home",
    label: "店铺首页",
    description: "品牌首屏与首页内容",
    publicPath: CONTENT_TEMPLATE_PAGE_PATHS.home,
    mode: "brand",
    headerMode: "overlay-light",
    publicFallback: {
      eyebrow: "HAICHUAN JEWELRY",
      title: "首页正在准备",
      description: "首页内容正在整理。您可以先进入选款中心浏览当前公开款式，或了解珠宝定制服务。",
      primaryAction: { label: "进入选款中心", href: "/catalog" },
      secondaryAction: { label: "了解珠宝定制", href: "/custom" },
    },
  },
  {
    key: "about",
    label: "关于海川",
    description: "品牌精神、审美、工艺与可核验背景",
    publicPath: CONTENT_TEMPLATE_PAGE_PATHS.about,
    mode: "brand",
    headerMode: "overlay-light",
    publicFallback: {
      eyebrow: "ABOUT HAICHUAN",
      title: "关于海川",
      description:
        "品牌、作品与工艺资料正在核验。您可以先浏览当前公开款式，或预约珠宝顾问了解更多。",
      primaryAction: { label: "进入选款中心", href: "/catalog" },
      secondaryAction: { label: "预约珠宝顾问", href: "/contact" },
    },
  },
  {
    key: "products",
    label: "珠宝作品",
    description: "编辑式作品展陈；具体找款工具集中在选款中心",
    publicPath: CONTENT_TEMPLATE_PAGE_PATHS.products,
    mode: "brand",
    headerMode: "overlay-light",
    publicFallback: {
      eyebrow: "CURATED EXHIBITION",
      title: "珠宝作品正在策展",
      description:
        "我们正在完成作品资料与材质工艺内容的审核。您可以先浏览当前已公开款式，或预约珠宝顾问获得协助。",
      primaryAction: { label: "进入选款中心", href: "/catalog" },
      secondaryAction: { label: "预约珠宝顾问", href: "/contact" },
    },
  },
  {
    key: "catalog",
    label: "选款中心",
    description: "视觉页头 + 固定选款工具；筛选数据来自商品配置",
    publicPath: CONTENT_TEMPLATE_PAGE_PATHS.catalog,
    mode: "commerce",
    headerMode: "overlay-light",
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
    publicPath: CONTENT_TEMPLATE_PAGE_PATHS.custom,
    mode: "brand",
    headerMode: "overlay-light",
    publicFallback: {
      eyebrow: "BESPOKE SERVICE",
      title: "珠宝定制",
      description:
        "定制内容正在整理。您可以先提交咨询需求，由珠宝顾问了解您的佩戴场景与偏好。",
      primaryAction: { label: "提交定制咨询", href: "/contact?type=custom" },
      secondaryAction: { label: "浏览公开款式", href: "/catalog" },
    },
  },
  {
    key: "contact",
    label: "预约咨询",
    description: "视觉页头 + 固定预约表单与联系信息",
    publicPath: CONTENT_TEMPLATE_PAGE_PATHS.contact,
    mode: "brand",
    headerMode: "overlay-light",
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

/**
 * 公开端只硬拦模板身份或合同版本错误。内容完善度由服务端作为发布提示返回，
 * 已发布快照中的空字段交给各模板现有的安全省略与失败态处理。
 */
export function isContentTemplateBlockPublicReady(block: {
  type?: string;
  props?: Record<string, unknown>;
} | undefined) {
  if (!block) return false;
  if (block.type === DYNAMIC_TEMPLATE_BLOCK_TYPE) return true;
  const completion = getContentTemplateCompletion(block.type || "", block.props);
  return Boolean(
    completion
    && completion.publish.complete,
  );
}

/** 判断区块是否至少具备一项会在前台形成可见输出的合同内容。 */
export function isContentTemplateBlockPublicRenderable(block: {
  type?: string;
  props?: Record<string, unknown>;
} | undefined) {
  if (!block || !isContentTemplateBlockPublicReady(block)) return false;
  if (block.type === DYNAMIC_TEMPLATE_BLOCK_TYPE) return true;
  const contract = getContentTemplateContract(block.type || "");
  if (!contract) return false;
  const props = block.props ?? {};
  const hasMedia = getContentTemplateMediaReferences(
    block.type || "",
    props,
    "props",
  ).length > 0;
  const hasRequiredText = contract.contentBudget.requiredText.some((field) => {
    const value = props[field];
    return typeof value === "string" && value.trim().length > 0;
  });
  const hasCollectionContent = contract.roles.some((role) => {
    const value = props[role.id];
    return Boolean(role.quantity && Array.isArray(value) && value.length > 0);
  });
  const hasNoRequiredContent =
    contract.media.every((slot) => !slot.required)
    && contract.contentBudget.requiredText.length === 0
    && contract.roles.every((role) => !role.quantity?.min);
  return hasMedia || hasRequiredText || hasCollectionContent || hasNoRequiredContent;
}

/** 覆盖式白色导航只有在首个可见品牌模块满足机器合同要求时启用。 */
export function resolvePageHeaderMode(
  key: EditorPageKey,
  data: ({
    content?: Array<{ type?: string; props?: Record<string, unknown> }>;
    [DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY]?: unknown;
  }) | null | undefined,
): PageHeaderMode {
  const page = getEditorPage(key);
  const rule = getContentTemplatePageRule(key);
  if (page.headerMode !== "overlay-light" || !rule?.headerMode.overlayRequiresFirstTemplate) {
    return "solid";
  }
  const firstVisible = data?.content?.find(
    (block) => block?.props?.isVisible !== false && block?.type !== "业务功能区",
  );
  if (firstVisible?.type === DYNAMIC_TEMPLATE_BLOCK_TYPE) {
    const templateId = typeof firstVisible.props?.templateId === "string"
      ? firstVisible.props.templateId
      : "";
    const templateVersion = Number(firstVisible.props?.templateVersion);
    const resolved = readResolvedDynamicTemplateDefinitions(
      data?.[DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY],
    )[dynamicTemplateVersionKey(templateId, templateVersion)];
    return resolved?.definition.metadata.headerCompatibility?.includes("overlay-light")
      ? "overlay-light"
      : rule.headerMode.fallback;
  }
  const contract = getContentTemplateContract(firstVisible?.type || "");
  return contract?.key === rule.headerMode.overlayRequiresFirstTemplate
    && isContentTemplateBlockPublicRenderable(firstVisible)
    ? "overlay-light"
    : rule.headerMode.fallback;
}

/** 为尚未保存的页面提供可立即编辑、且彼此可区分的中性初始结构。 */
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

  data.content = placeBusinessRegion(data.content ?? [], {
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
  content: PuckBlock[],
  businessRegionBlock: PuckBlock,
) {
  const contentWithoutBusinessRegion = content.filter(
    (block) => block?.type !== "业务功能区",
  );
  const firstVisibleBrandIndex = contentWithoutBusinessRegion.findIndex(
    (block) =>
      block?.props?.isVisible !== false && (
        Boolean(getContentTemplateContract(block?.type || ""))
        || block?.type === DYNAMIC_TEMPLATE_BLOCK_TYPE
      ),
  );
  // 隐藏备选块和网站设置不参与公开顺序；固定业务区只跟随首个真正可见的品牌模块。
  const insertionIndex = firstVisibleBrandIndex >= 0 ? firstVisibleBrandIndex + 1 : 0;
  const nextContent = [...contentWithoutBusinessRegion];
  nextContent.splice(insertionIndex, 0, businessRegionBlock);
  return nextContent;
}

/**
 * 已发布的旧「关于海川」曾使用大面积金黄色山水与室内图。
 * 仅迁移这两个已知资源地址；新上传或重新发布的视觉不会被改写。
 */
function migrateLegacyAboutVisuals<T extends PuckDocument>(key: EditorPageKey, data: T): T {
  if (key !== "about" || !Array.isArray(data?.content)) return data;

  let changed = false;
  const content = data.content.map((block) => {
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

  return (changed ? { ...data, content } : data) as T;
}

/**
 * 旧发布文档可能包含当前页面能力矩阵已禁止的模块。
 * 读取时过滤副本，不回写或升级原始草稿/发布快照。
 */
function normalizePageCapabilities<T extends PuckDocument>(key: EditorPageKey, data: T): T {
  if (!data || typeof data !== "object") return data;
  const rule = getContentTemplatePageRule(key);
  if (!rule) return data;

  const isAllowed = (
    block: PuckBlock,
    allowBusinessRegion: boolean,
    allowTemplate: boolean,
  ) => block?.type === "业务功能区"
    ? allowBusinessRegion && rule.businessRegionCount === 1
    : allowTemplate && (
      block?.type === DYNAMIC_TEMPLATE_BLOCK_TYPE
      || isContentTemplateAllowedForPage(key, block?.type || "")
    );
  let changed = false;
  const filterBlocks = (
    blocks: unknown,
    allowBusinessRegion: boolean,
    allowTemplate = true,
  ) => {
    if (!Array.isArray(blocks)) return blocks;
    const filtered = blocks.filter((block): block is PuckBlock =>
      Boolean(block && typeof block === "object" && !Array.isArray(block)) &&
      isAllowed(block, allowBusinessRegion, allowTemplate));
    if (filtered.length !== blocks.length) changed = true;
    return filtered;
  };

  const content = filterBlocks(data.content, true);
  const zones = data.zones && typeof data.zones === "object"
    ? Object.fromEntries(
        Object.entries(data.zones).map(([zone, blocks]) => [
          zone,
          filterBlocks(
            blocks,
            false,
            rule.contentPlacement !== "root-only",
          ),
        ]),
      )
    : data.zones;
  if (!changed) return data;
  return { ...data, content, ...(data.zones ? { zones } : {}) } as T;
}

/** 规范化已知旧视觉，并为既有草稿补齐固定业务区。 */
export function ensureEditorPageStructure<T extends PuckDocument>(key: EditorPageKey, data: T): T {
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
    (block) => block.type === "业务功能区",
  );

  const businessRegionBlock = {
    type: "业务功能区",
    props: {
      ...(existingBusinessRegion?.props ?? {}),
      id: `${key}-business-region`,
      pageKey: key,
      ...page.businessRegion,
      locked: true,
    },
  };
  return {
    ...normalizedData,
    content: placeBusinessRegion(content, businessRegionBlock),
  } as T;
}
