/**
 * 自动生成，禁止手改。
 * 来源：contracts/page-builder/template-definition.schema.json
 * SHA-256：04f1ad7fa3efdc38e8d6d740bf3671357343f67fee104b8e233087b2955255a0
 */

export const DYNAMIC_TEMPLATE_SCHEMA_VERSION = 1;
/** 统一模板产品模型版本；JSON Schema 自身仍独立按 schemaVersion 演进。 */
export const TEMPLATE_DEFINITION_MODEL_VERSION = 2 as const;
export const DYNAMIC_TEMPLATE_SCHEMA_HASH = "04f1ad7fa3efdc38e8d6d740bf3671357343f67fee104b8e233087b2955255a0";
export const DYNAMIC_TEMPLATE_NODE_TYPES = [
  "Section",
  "Container",
  "Grid",
  "Row",
  "Column",
  "Stack",
  "Spacer",
  "Divider",
  "ImageSlot",
  "HeadingSlot",
  "TextSlot",
  "RichTextSlot",
  "ButtonSlot",
  "LinkSlot",
  "BadgeSlot",
  "IconSlot",
  "ProductSlot",
  "CollectionSlot",
  "Video",
  "Carousel",
  "Hotspot",
  "BeforeAfter",
  "Appointment",
  "ProductCard",
  "ProductCollection",
  "CategoryCollection",
  "HeroTemplate",
  "FullBleedTemplate",
  "SinglePosterTemplate",
  "DoublePosterTemplate",
  "TextBannerTemplate",
  "JourneyTemplate",
  "GalleryTemplate",
  "LookbookTemplate",
  "SceneShoppingTemplate",
  "BrandPointsTemplate",
  "ServicePromisesTemplate",
  "CertificatesTemplate",
  "StoreInfoTemplate",
  "TestimonialsTemplate",
  "LimitedEventTemplate",
  "CraftDetailsTemplate"
] as const;
export const DYNAMIC_TEMPLATE_SLOT_TYPES = [
  "image",
  "heading",
  "text",
  "richText",
  "button",
  "link",
  "badge",
  "icon",
  "product",
  "collection",
  "video",
  "carousel",
  "hotspot",
  "beforeAfter",
  "appointment",
  "productCard",
  "productCollection",
  "categoryCollection",
  "heroTemplate",
  "fullBleedTemplate",
  "singlePosterTemplate",
  "doublePosterTemplate",
  "textBannerTemplate",
  "journeyTemplate",
  "galleryTemplate",
  "lookbookTemplate",
  "sceneShoppingTemplate",
  "brandPointsTemplate",
  "servicePromisesTemplate",
  "certificatesTemplate",
  "storeInfoTemplate",
  "testimonialsTemplate",
  "limitedEventTemplate",
  "craftDetailsTemplate"
] as const;
export const DYNAMIC_TEMPLATE_NODE_REGISTRY = {
  "Section": {
    "label": "页面区段",
    "kind": "structure",
    "rootOnly": true,
    "allowedParents": [],
    "canHaveChildren": true
  },
  "Container": {
    "label": "内容容器",
    "kind": "structure",
    "rootOnly": false,
    "allowedParents": [
      "Section",
      "Column",
      "Stack",
      "Grid"
    ],
    "canHaveChildren": true
  },
  "Grid": {
    "label": "网格",
    "kind": "structure",
    "rootOnly": false,
    "allowedParents": [
      "Section",
      "Container",
      "Column",
      "Stack"
    ],
    "canHaveChildren": true
  },
  "Row": {
    "label": "横向行",
    "kind": "structure",
    "rootOnly": false,
    "allowedParents": [
      "Section",
      "Container",
      "Column",
      "Stack"
    ],
    "canHaveChildren": true
  },
  "Column": {
    "label": "纵向列",
    "kind": "structure",
    "rootOnly": false,
    "allowedParents": [
      "Row",
      "Grid"
    ],
    "canHaveChildren": true
  },
  "Stack": {
    "label": "堆叠容器",
    "kind": "structure",
    "rootOnly": false,
    "allowedParents": [
      "Section",
      "Container",
      "Column",
      "Grid"
    ],
    "canHaveChildren": true
  },
  "Spacer": {
    "label": "留白间距",
    "kind": "structure",
    "rootOnly": false,
    "allowedParents": [
      "Container",
      "Grid",
      "Row",
      "Column",
      "Stack"
    ],
    "canHaveChildren": false
  },
  "Divider": {
    "label": "分隔线",
    "kind": "structure",
    "rootOnly": false,
    "allowedParents": [
      "Container",
      "Grid",
      "Row",
      "Column",
      "Stack"
    ],
    "canHaveChildren": false
  },
  "ImageSlot": {
    "label": "图片槽位",
    "kind": "slot",
    "slotType": "image",
    "rootOnly": false,
    "allowedParents": [
      "Container",
      "Grid",
      "Row",
      "Column",
      "Stack"
    ],
    "canHaveChildren": false
  },
  "HeadingSlot": {
    "label": "标题槽位",
    "kind": "slot",
    "slotType": "heading",
    "rootOnly": false,
    "allowedParents": [
      "Container",
      "Grid",
      "Row",
      "Column",
      "Stack"
    ],
    "canHaveChildren": false
  },
  "TextSlot": {
    "label": "文字槽位",
    "kind": "slot",
    "slotType": "text",
    "rootOnly": false,
    "allowedParents": [
      "Container",
      "Grid",
      "Row",
      "Column",
      "Stack"
    ],
    "canHaveChildren": false
  },
  "RichTextSlot": {
    "label": "富文本槽位",
    "kind": "slot",
    "slotType": "richText",
    "rootOnly": false,
    "allowedParents": [
      "Container",
      "Grid",
      "Row",
      "Column",
      "Stack"
    ],
    "canHaveChildren": false
  },
  "ButtonSlot": {
    "label": "按钮槽位",
    "kind": "slot",
    "slotType": "button",
    "rootOnly": false,
    "allowedParents": [
      "Container",
      "Grid",
      "Row",
      "Column",
      "Stack"
    ],
    "canHaveChildren": false
  },
  "LinkSlot": {
    "label": "链接槽位",
    "kind": "slot",
    "slotType": "link",
    "rootOnly": false,
    "allowedParents": [
      "Container",
      "Grid",
      "Row",
      "Column",
      "Stack"
    ],
    "canHaveChildren": false
  },
  "BadgeSlot": {
    "label": "徽标槽位",
    "kind": "slot",
    "slotType": "badge",
    "rootOnly": false,
    "allowedParents": [
      "Container",
      "Grid",
      "Row",
      "Column",
      "Stack"
    ],
    "canHaveChildren": false
  },
  "IconSlot": {
    "label": "图标槽位",
    "kind": "slot",
    "slotType": "icon",
    "rootOnly": false,
    "allowedParents": [
      "Container",
      "Grid",
      "Row",
      "Column",
      "Stack"
    ],
    "canHaveChildren": false
  },
  "ProductSlot": {
    "label": "商品槽位",
    "kind": "slot",
    "slotType": "product",
    "rootOnly": false,
    "allowedParents": [
      "Container",
      "Grid",
      "Row",
      "Column",
      "Stack"
    ],
    "canHaveChildren": false
  },
  "CollectionSlot": {
    "label": "集合槽位",
    "kind": "slot",
    "slotType": "collection",
    "rootOnly": false,
    "allowedParents": [
      "Container",
      "Grid",
      "Row",
      "Column",
      "Stack"
    ],
    "canHaveChildren": false
  },
  "Video": {
    "label": "视频组件",
    "kind": "slot",
    "slotType": "video",
    "rootOnly": false,
    "allowedParents": [
      "Container",
      "Grid",
      "Row",
      "Column",
      "Stack"
    ],
    "canHaveChildren": false
  },
  "Carousel": {
    "label": "轮播组件",
    "kind": "slot",
    "slotType": "carousel",
    "rootOnly": false,
    "allowedParents": [
      "Container",
      "Grid",
      "Row",
      "Column",
      "Stack"
    ],
    "canHaveChildren": false
  },
  "Hotspot": {
    "label": "热区组件",
    "kind": "slot",
    "slotType": "hotspot",
    "rootOnly": false,
    "allowedParents": [
      "Container",
      "Grid",
      "Row",
      "Column",
      "Stack"
    ],
    "canHaveChildren": false
  },
  "BeforeAfter": {
    "label": "前后对比组件",
    "kind": "slot",
    "slotType": "beforeAfter",
    "rootOnly": false,
    "allowedParents": [
      "Container",
      "Grid",
      "Row",
      "Column",
      "Stack"
    ],
    "canHaveChildren": false
  },
  "Appointment": {
    "label": "预约入口组件",
    "kind": "slot",
    "slotType": "appointment",
    "rootOnly": false,
    "allowedParents": [
      "Container",
      "Grid",
      "Row",
      "Column",
      "Stack"
    ],
    "canHaveChildren": false
  },
  "ProductCard": {
    "label": "单品展示组件",
    "kind": "slot",
    "slotType": "productCard",
    "rootOnly": false,
    "allowedParents": [
      "Container",
      "Grid",
      "Row",
      "Column",
      "Stack"
    ],
    "canHaveChildren": false
  },
  "ProductCollection": {
    "label": "商品集合组件",
    "kind": "slot",
    "slotType": "productCollection",
    "rootOnly": false,
    "allowedParents": [
      "Container",
      "Grid",
      "Row",
      "Column",
      "Stack"
    ],
    "canHaveChildren": false
  },
  "CategoryCollection": {
    "label": "分类集合组件",
    "kind": "slot",
    "slotType": "categoryCollection",
    "rootOnly": false,
    "allowedParents": [
      "Container",
      "Grid",
      "Row",
      "Column",
      "Stack"
    ],
    "canHaveChildren": false
  },
  "HeroTemplate": {
    "label": "首屏主视觉组件",
    "kind": "slot",
    "slotType": "heroTemplate",
    "rootOnly": false,
    "allowedParents": [
      "Container",
      "Grid",
      "Row",
      "Column",
      "Stack"
    ],
    "canHaveChildren": false
  },
  "FullBleedTemplate": {
    "label": "全屏出血图组件",
    "kind": "slot",
    "slotType": "fullBleedTemplate",
    "rootOnly": false,
    "allowedParents": [
      "Container",
      "Grid",
      "Row",
      "Column",
      "Stack"
    ],
    "canHaveChildren": false
  },
  "SinglePosterTemplate": {
    "label": "单图海报组件",
    "kind": "slot",
    "slotType": "singlePosterTemplate",
    "rootOnly": false,
    "allowedParents": [
      "Container",
      "Grid",
      "Row",
      "Column",
      "Stack"
    ],
    "canHaveChildren": false
  },
  "DoublePosterTemplate": {
    "label": "双图海报组件",
    "kind": "slot",
    "slotType": "doublePosterTemplate",
    "rootOnly": false,
    "allowedParents": [
      "Container",
      "Grid",
      "Row",
      "Column",
      "Stack"
    ],
    "canHaveChildren": false
  },
  "TextBannerTemplate": {
    "label": "文字横幅组件",
    "kind": "slot",
    "slotType": "textBannerTemplate",
    "rootOnly": false,
    "allowedParents": [
      "Container",
      "Grid",
      "Row",
      "Column",
      "Stack"
    ],
    "canHaveChildren": false
  },
  "JourneyTemplate": {
    "label": "定制流程组件",
    "kind": "slot",
    "slotType": "journeyTemplate",
    "rootOnly": false,
    "allowedParents": [
      "Container",
      "Grid",
      "Row",
      "Column",
      "Stack"
    ],
    "canHaveChildren": false
  },
  "GalleryTemplate": {
    "label": "作品画廊组件",
    "kind": "slot",
    "slotType": "galleryTemplate",
    "rootOnly": false,
    "allowedParents": [
      "Container",
      "Grid",
      "Row",
      "Column",
      "Stack"
    ],
    "canHaveChildren": false
  },
  "LookbookTemplate": {
    "label": "佩戴灵感组件",
    "kind": "slot",
    "slotType": "lookbookTemplate",
    "rootOnly": false,
    "allowedParents": [
      "Container",
      "Grid",
      "Row",
      "Column",
      "Stack"
    ],
    "canHaveChildren": false
  },
  "SceneShoppingTemplate": {
    "label": "场景选购组件",
    "kind": "slot",
    "slotType": "sceneShoppingTemplate",
    "rootOnly": false,
    "allowedParents": [
      "Container",
      "Grid",
      "Row",
      "Column",
      "Stack"
    ],
    "canHaveChildren": false
  },
  "BrandPointsTemplate": {
    "label": "品牌要点组件",
    "kind": "slot",
    "slotType": "brandPointsTemplate",
    "rootOnly": false,
    "allowedParents": [
      "Container",
      "Grid",
      "Row",
      "Column",
      "Stack"
    ],
    "canHaveChildren": false
  },
  "ServicePromisesTemplate": {
    "label": "服务承诺组件",
    "kind": "slot",
    "slotType": "servicePromisesTemplate",
    "rootOnly": false,
    "allowedParents": [
      "Container",
      "Grid",
      "Row",
      "Column",
      "Stack"
    ],
    "canHaveChildren": false
  },
  "CertificatesTemplate": {
    "label": "资质证书组件",
    "kind": "slot",
    "slotType": "certificatesTemplate",
    "rootOnly": false,
    "allowedParents": [
      "Container",
      "Grid",
      "Row",
      "Column",
      "Stack"
    ],
    "canHaveChildren": false
  },
  "StoreInfoTemplate": {
    "label": "门店信息组件",
    "kind": "slot",
    "slotType": "storeInfoTemplate",
    "rootOnly": false,
    "allowedParents": [
      "Container",
      "Grid",
      "Row",
      "Column",
      "Stack"
    ],
    "canHaveChildren": false
  },
  "TestimonialsTemplate": {
    "label": "评价实拍组件",
    "kind": "slot",
    "slotType": "testimonialsTemplate",
    "rootOnly": false,
    "allowedParents": [
      "Container",
      "Grid",
      "Row",
      "Column",
      "Stack"
    ],
    "canHaveChildren": false
  },
  "LimitedEventTemplate": {
    "label": "限时活动组件",
    "kind": "slot",
    "slotType": "limitedEventTemplate",
    "rootOnly": false,
    "allowedParents": [
      "Container",
      "Grid",
      "Row",
      "Column",
      "Stack"
    ],
    "canHaveChildren": false
  },
  "CraftDetailsTemplate": {
    "label": "工艺细节组件",
    "kind": "slot",
    "slotType": "craftDetailsTemplate",
    "rootOnly": false,
    "allowedParents": [
      "Container",
      "Grid",
      "Row",
      "Column",
      "Stack"
    ],
    "canHaveChildren": false
  }
} as const;
export const DYNAMIC_TEMPLATE_METADATA_FIELDS = [
  "category",
  "purpose",
  "layoutType",
  "slotSummary",
  "recommendedFor",
  "desktopRatio",
  "mobileRatio",
  "previewDesktopWidth",
  "previewMobileWidth",
  "mobileBreakpoint",
  "minViewportWidth",
  "maxViewportWidth",
  "defaultBackgroundToken",
  "visualRole",
  "headerCompatibility",
  "tags"
] as const;
export const DYNAMIC_TEMPLATE_METADATA_INTEGER_BOUNDS = {
  "previewDesktopWidth": {
    "minimum": 768,
    "maximum": 2560
  },
  "previewMobileWidth": {
    "minimum": 280,
    "maximum": 767
  },
  "mobileBreakpoint": {
    "minimum": 480,
    "maximum": 1024
  },
  "minViewportWidth": {
    "minimum": 280,
    "maximum": 3840
  },
  "maxViewportWidth": {
    "minimum": 280,
    "maximum": 3840
  }
} as const;

export type DynamicTemplateNodeType = typeof DYNAMIC_TEMPLATE_NODE_TYPES[number];
export type DynamicTemplateSlotType = typeof DYNAMIC_TEMPLATE_SLOT_TYPES[number];
export type DynamicTemplateDevice = "desktop" | "mobile";
export type DynamicTemplateLengthUnit = "px" | "%" | "rem" | "vw" | "vh";
export type DynamicTemplateDisplay = "block" | "flex" | "grid" | "none";
export type DynamicTemplateHeightMode = "auto" | "min-height" | "aspect-ratio" | "fixed" | "viewport";
export type DynamicTemplateLayoutMode = "flow" | "free";

export interface DynamicTemplateLength {
  value: number;
  unit: DynamicTemplateLengthUnit;
}

export type DynamicTemplateSize = "auto" | "fill" | "fit" | DynamicTemplateLength;

export interface DynamicTemplateBoxSpacing {
  top: DynamicTemplateLength;
  right: DynamicTemplateLength;
  bottom: DynamicTemplateLength;
  left: DynamicTemplateLength;
}

export interface DynamicTemplateHeightRule {
  mode: DynamicTemplateHeightMode;
  value?: DynamicTemplateLength;
  ratio?: { width: number; height: number };
}

export interface DynamicTemplatePlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

export interface DynamicTemplateResponsiveRules {
  display: DynamicTemplateDisplay;
  direction?: "row" | "column";
  order: number;
  width: DynamicTemplateSize;
  height: DynamicTemplateHeightRule;
  maxWidth?: DynamicTemplateLength;
  minHeight?: DynamicTemplateLength;
  gap?: DynamicTemplateLength;
  padding?: DynamicTemplateBoxSpacing;
  margin?: DynamicTemplateBoxSpacing;
  alignItems?: "start" | "center" | "end" | "stretch";
  justifyContent?: "start" | "center" | "end" | "space-between" | "space-around";
  columns?: number[];
  backgroundToken?: string;
  borderToken?: string;
  radius?: DynamicTemplateLength;
  overflow?: "visible" | "hidden" | "clip";
  layoutMode?: DynamicTemplateLayoutMode;
  placement?: DynamicTemplatePlacement;
}

export interface DynamicTemplateNodeProps {
  semanticTag?: "section" | "div" | "header" | "article" | "aside" | "nav";
  dividerStyle?: "solid" | "dashed" | "dotted";
  spacerSize?: DynamicTemplateLength;
  contentTemplateLayoutData?: Record<string, unknown>;
  contentTemplateDesignProps?: Record<string, string | number | boolean>;
}

export interface DynamicTemplateInstanceEditPolicy {
  position: boolean;
  size: boolean;
  zIndex: boolean;
  imageFit?: boolean;
  imageFocus?: boolean;
  typography?: boolean;
  spacing?: boolean;
  minWidthPercent: number;
  maxWidthPercent: number;
  maxOffsetPercent: number;
  minFontSizePx?: number;
  maxFontSizePx?: number;
  maxSpacingPx?: number;
}

export interface DynamicTemplateNode {
  nodeId: string;
  type: DynamicTemplateNodeType;
  name: string;
  slotId?: string;
  childIds: string[];
  props: DynamicTemplateNodeProps;
  instanceEditPolicy?: DynamicTemplateInstanceEditPolicy;
  responsive: Record<DynamicTemplateDevice, DynamicTemplateResponsiveRules>;
  hidden: boolean;
}

export interface DynamicTemplateSlotValidation {
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  recommendedWidth?: number;
  recommendedHeight?: number;
  allowedProtocols?: Array<"https" | "page" | "product" | "category" | "none">;
}

export interface DynamicTemplateSlotRules {
  aspectRatio?: string;
  objectFit?: "cover" | "contain" | "fill";
  objectPosition?: string;
  fontRole?: "display" | "heading" | "body" | "caption" | "action";
  fontSize?: DynamicTemplateLength;
  fontWeight?: number;
  lineHeight?: number;
  textAlign?: "left" | "center" | "right";
  maxLines?: number;
  overflow?: "clip" | "ellipsis" | "wrap";
}

export interface DynamicTemplateSlotDefinition {
  slotId: string;
  key: string;
  type: DynamicTemplateSlotType;
  label: string;
  required: boolean;
  editable: boolean;
  hideable: boolean;
  /** 页面实例显式清空时的公开渲染策略；未声明按 hide。 */
  emptyPolicy?: "hide" | "use-default";
  validation: DynamicTemplateSlotValidation;
  desktopRules: DynamicTemplateSlotRules;
  mobileRules: DynamicTemplateSlotRules;
}

export interface DynamicTemplateMetadata {
  category: string;
  purpose: string;
  layoutType: string;
  slotSummary: string;
  recommendedFor: string[];
  desktopRatio: string;
  mobileRatio: string;
  previewDesktopWidth?: number;
  previewMobileWidth?: number;
  mobileBreakpoint?: number;
  minViewportWidth?: number;
  maxViewportWidth?: number;
  defaultBackgroundToken?: string;
  visualRole?: "primary-stage" | "feature-stage" | "support-stage";
  headerCompatibility?: Array<"solid" | "overlay-light">;
  tags: string[];
}

/** 统一母模板的正式产品合同。 */
export interface TemplateDefinitionV2 {
  schemaVersion: typeof DYNAMIC_TEMPLATE_SCHEMA_VERSION;
  templateId: string;
  name: string;
  description?: string;
  metadata: DynamicTemplateMetadata;
  rootNodeId: string;
  nodes: Record<string, DynamicTemplateNode>;
  slots: Record<string, DynamicTemplateSlotDefinition>;
  defaultContent: Record<string, unknown>;
  /** 仅用于模板画布、缩略图和异常场景预览，不参与页面或公开渲染。 */
  previewContent?: Record<string, unknown>;
}

export interface TemplateInstanceLayoutOverride {
  offsetXPercent?: number;
  offsetYPercent?: number;
  widthPercent?: number;
  zIndex?: number;
  objectFit?: "cover" | "contain" | "fill";
  imageScalePercent?: number;
  focusXPercent?: number;
  focusYPercent?: number;
  fontSizePx?: number;
  textAlign?: "left" | "center" | "right";
  marginTopPx?: number;
  marginBottomPx?: number;
}

export type TemplateInstanceLayoutOverridesByNodeId = Record<
  string,
  Partial<Record<DynamicTemplateDevice, TemplateInstanceLayoutOverride>>
>;

/** 页面文档持久化的统一实例合同，不复制母模板节点树。 */
export interface TemplateInstanceV2 {
  instanceId: string;
  templateId: string;
  templateVersion: number;
  contentBySlotId: Record<string, unknown>;
  layoutOverridesByNodeId: TemplateInstanceLayoutOverridesByNodeId;
  hiddenSlotIds: string[];
  isVisible: boolean;
}

export interface DynamicTemplateNodeRegistryEntry {
  label: string;
  kind: "structure" | "slot";
  rootOnly: boolean;
  allowedParents: readonly DynamicTemplateNodeType[];
  canHaveChildren: boolean;
  slotType?: DynamicTemplateSlotType;
}

export function isDynamicTemplateNodeType(value: unknown): value is DynamicTemplateNodeType {
  return typeof value === "string" && (DYNAMIC_TEMPLATE_NODE_TYPES as readonly string[]).includes(value);
}

export function isDynamicTemplateSlotType(value: unknown): value is DynamicTemplateSlotType {
  return typeof value === "string" && (DYNAMIC_TEMPLATE_SLOT_TYPES as readonly string[]).includes(value);
}

export function getDynamicTemplateNodeRegistryEntry(
  type: DynamicTemplateNodeType,
): DynamicTemplateNodeRegistryEntry {
  return DYNAMIC_TEMPLATE_NODE_REGISTRY[type] as DynamicTemplateNodeRegistryEntry;
}
