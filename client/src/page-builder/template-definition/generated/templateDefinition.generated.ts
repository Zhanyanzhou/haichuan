/**
 * 自动生成，禁止手改。
 * 来源：contracts/page-builder/template-definition.schema.json
 * SHA-256：7866f528ebea4b32659659dbbe765ec0d9ceb545f9776bf52f7496811d2813bd
 */

export const DYNAMIC_TEMPLATE_SCHEMA_VERSION = 3;
export const DYNAMIC_TEMPLATE_SUPPORTED_SCHEMA_VERSIONS = [
  1,
  2,
  3
] as const;
/** 统一模板产品模型版本；JSON Schema 自身仍独立按 schemaVersion 演进。 */
export const TEMPLATE_DEFINITION_MODEL_VERSION = 2 as const;
export const DYNAMIC_TEMPLATE_SCHEMA_HASH = "7866f528ebea4b32659659dbbe765ec0d9ceb545f9776bf52f7496811d2813bd";
export const TEMPLATE_RECIPE_SCHEMA = {
  "type": "object",
  "additionalProperties": false,
  "required": [
    "recipeVersion",
    "presetVersion",
    "purpose",
    "canvas",
    "layout",
    "media",
    "content",
    "style",
    "rules"
  ],
  "properties": {
    "recipeVersion": {
      "const": 1
    },
    "presetVersion": {
      "enum": [
        1,
        2
      ]
    },
    "purpose": {
      "enum": [
        "productPromotion",
        "newProduct",
        "event",
        "brand",
        "social",
        "news",
        "profile",
        "general",
        "custom"
      ]
    },
    "customPurpose": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100
    },
    "canvas": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "width",
        "height",
        "aspectRatio"
      ],
      "properties": {
        "width": {
          "type": "integer",
          "minimum": 1,
          "maximum": 4096
        },
        "height": {
          "type": "integer",
          "minimum": 1,
          "maximum": 4096
        },
        "aspectRatio": {
          "type": "number",
          "exclusiveMinimum": 0,
          "maximum": 4096
        }
      }
    },
    "layout": {
      "enum": [
        "topImageBottomContent",
        "topContentBottomImage",
        "leftImageRightContent",
        "leftContentRightImage",
        "fullImageOverlay",
        "centerSubject",
        "headerSubjectFooter",
        "splitColumns",
        "cards",
        "free"
      ]
    },
    "media": {
      "type": "array",
      "maxItems": 20,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "role",
          "name",
          "aspectRatio",
          "fitMode",
          "borderRadius",
          "replaceable",
          "allowCrop"
        ],
        "properties": {
          "id": {
            "type": "string",
            "pattern": "^[A-Za-z][A-Za-z0-9_-]{0,127}$"
          },
          "role": {
            "enum": [
              "heroImage",
              "logo",
              "backgroundImage",
              "secondaryImage",
              "custom"
            ]
          },
          "name": {
            "type": "string",
            "minLength": 1,
            "maxLength": 100
          },
          "aspectRatio": {
            "type": "number",
            "exclusiveMinimum": 0,
            "maximum": 4096
          },
          "fitMode": {
            "enum": [
              "cover",
              "contain",
              "fill"
            ]
          },
          "borderRadius": {
            "type": "number",
            "minimum": 0,
            "maximum": 256
          },
          "replaceable": {
            "type": "boolean"
          },
          "allowCrop": {
            "type": "boolean"
          },
          "defaultImage": {
            "type": "string",
            "maxLength": 2048
          },
          "shape": {
            "enum": [
              "rectangle",
              "circle"
            ]
          },
          "freeRatio": {
            "type": "boolean"
          }
        }
      }
    },
    "content": {
      "type": "array",
      "maxItems": 30,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "role",
          "name",
          "defaultContent",
          "maxLength",
          "editable"
        ],
        "properties": {
          "id": {
            "type": "string",
            "pattern": "^[A-Za-z][A-Za-z0-9_-]{0,127}$"
          },
          "role": {
            "enum": [
              "title",
              "subtitle",
              "description",
              "brandName",
              "tag",
              "date",
              "price",
              "originalPrice",
              "offer",
              "cta",
              "contact",
              "customText",
              "time",
              "location",
              "productName",
              "sellingPoint",
              "discount",
              "personName",
              "position",
              "biography",
              "socialInfo"
            ]
          },
          "name": {
            "type": "string",
            "minLength": 1,
            "maxLength": 100
          },
          "defaultContent": {
            "type": "string",
            "maxLength": 10000
          },
          "maxLength": {
            "type": "integer",
            "minimum": 1,
            "maximum": 10000
          },
          "editable": {
            "type": "boolean"
          }
        }
      }
    },
    "style": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "variant",
        "background",
        "primaryColor",
        "backgroundColor",
        "textColor",
        "radius",
        "spacing"
      ],
      "properties": {
        "variant": {
          "enum": [
            "minimal",
            "business",
            "premium",
            "vibrant",
            "tech",
            "warm",
            "custom",
            "ultraMinimal"
          ]
        },
        "background": {
          "enum": [
            "light",
            "dark",
            "brand",
            "custom",
            "softLight"
          ]
        },
        "primaryColor": {
          "type": "string",
          "pattern": "^#(?:[A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$"
        },
        "backgroundColor": {
          "type": "string",
          "pattern": "^#(?:[A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$"
        },
        "textColor": {
          "type": "string",
          "pattern": "^#(?:[A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$"
        },
        "radius": {
          "enum": [
            "none",
            "small",
            "medium",
            "large",
            "extraLarge"
          ]
        },
        "spacing": {
          "enum": [
            "compact",
            "standard",
            "relaxed",
            "extraRelaxed"
          ]
        },
        "margin": {
          "enum": [
            "compact",
            "standard",
            "relaxed"
          ]
        },
        "alignment": {
          "enum": [
            "left",
            "center",
            "right"
          ]
        },
        "secondaryTextColor": {
          "type": "string",
          "pattern": "^#(?:[A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$"
        }
      }
    },
    "rules": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "aspectLocked"
      ],
      "properties": {
        "aspectLocked": {
          "type": "boolean"
        },
        "mediaArrangement": {
          "description": "图片区排列方向；省略或 auto 保留历史自动排布，row/column 固定主轴，不随单张图片比例改变。",
          "enum": [
            "auto",
            "row",
            "column"
          ]
        }
      }
    }
  }
} as const;
export interface TemplateRecipe {
  recipeVersion: 1;
  presetVersion: 1 | 2;
  purpose: "productPromotion" | "newProduct" | "event" | "brand" | "social" | "news" | "profile" | "general" | "custom";
  customPurpose?: string;
  canvas: {
  width: number;
  height: number;
  aspectRatio: number;
};
  layout: "topImageBottomContent" | "topContentBottomImage" | "leftImageRightContent" | "leftContentRightImage" | "fullImageOverlay" | "centerSubject" | "headerSubjectFooter" | "splitColumns" | "cards" | "free";
  media: Array<{
  id: string;
  role: "heroImage" | "logo" | "backgroundImage" | "secondaryImage" | "custom";
  name: string;
  aspectRatio: number;
  fitMode: "cover" | "contain" | "fill";
  borderRadius: number;
  replaceable: boolean;
  allowCrop: boolean;
  defaultImage?: string;
  shape?: "rectangle" | "circle";
  freeRatio?: boolean;
}>;
  content: Array<{
  id: string;
  role: "title" | "subtitle" | "description" | "brandName" | "tag" | "date" | "price" | "originalPrice" | "offer" | "cta" | "contact" | "customText" | "time" | "location" | "productName" | "sellingPoint" | "discount" | "personName" | "position" | "biography" | "socialInfo";
  name: string;
  defaultContent: string;
  maxLength: number;
  editable: boolean;
}>;
  style: {
  variant: "minimal" | "business" | "premium" | "vibrant" | "tech" | "warm" | "custom" | "ultraMinimal";
  background: "light" | "dark" | "brand" | "custom" | "softLight";
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
  radius: "none" | "small" | "medium" | "large" | "extraLarge";
  spacing: "compact" | "standard" | "relaxed" | "extraRelaxed";
  margin?: "compact" | "standard" | "relaxed";
  alignment?: "left" | "center" | "right";
  secondaryTextColor?: string;
};
  rules: {
  aspectLocked: boolean;
  mediaArrangement?: "auto" | "row" | "column";
};
}
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
  "HeroTemplate"
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
  "heroTemplate"
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
  "canvasSize",
  "previewDesktopWidth",
  "previewMobileWidth",
  "previewTabletWidth",
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
  "previewTabletWidth": {
    "minimum": 768,
    "maximum": 1023
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
export type TemplateBreakpoint = "desktop" | "tablet" | "mobile";
export type DynamicTemplateLengthUnit = "px" | "%" | "rem" | "vw" | "vh";
export type DynamicTemplateDisplay = "block" | "flex" | "grid" | "none";
export type DynamicTemplateHeightMode = "auto" | "fit" | "fill" | "min-height" | "aspect-ratio" | "fixed" | "viewport";
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
  hidden?: boolean;
  direction?: "row" | "column";
  wrap?: "nowrap" | "wrap";
  order: number;
  width: DynamicTemplateSize;
  height: DynamicTemplateHeightRule;
  maxWidth?: DynamicTemplateLength;
  minWidth?: DynamicTemplateLength;
  minHeight?: DynamicTemplateLength;
  maxHeight?: DynamicTemplateLength;
  gap?: DynamicTemplateLength;
  padding?: DynamicTemplateBoxSpacing;
  margin?: DynamicTemplateBoxSpacing;
  alignItems?: "start" | "center" | "end" | "stretch";
  justifyContent?: "start" | "center" | "end" | "space-between" | "space-around";
  columns?: number[];
  backgroundToken?: string;
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundGradient?: { from: string; to: string; angle: number } | null;
  opacity?: number;
  borderToken?: string;
  radius?: DynamicTemplateLength;
  overflow?: "visible" | "hidden" | "clip";
  layoutMode?: DynamicTemplateLayoutMode;
  placement?: DynamicTemplatePlacement;
  anchor?: DynamicTemplateAnchor;
}

export interface DynamicTemplateAnchor {
  horizontal: "left" | "center" | "right";
  vertical: "top" | "center" | "bottom";
  offsetX: { value: number; unit: "px" | "%" };
  offsetY: { value: number; unit: "px" | "%" };
}

/** 长度、高度与锚点原子覆盖；间距和自由矩形按成员继承。 */
export type DynamicTemplateResponsiveOverride = Partial<Omit<
  DynamicTemplateResponsiveRules, "padding" | "margin" | "placement" | "anchor"
>> & {
  padding?: Partial<DynamicTemplateBoxSpacing>;
  margin?: Partial<DynamicTemplateBoxSpacing>;
  placement?: Partial<DynamicTemplatePlacement> | null;
  anchor?: DynamicTemplateAnchor | null;
};

export interface DynamicTemplateResponsiveMap {
  desktop: DynamicTemplateResponsiveRules;
  /** schema1 必须是完整规则，schema2 是有意修改的属性；读取必须经过 resolver。 */
  mobile: DynamicTemplateResponsiveOverride;
  tablet?: DynamicTemplateResponsiveOverride;
}

export interface DynamicTemplateNodeProps {
  semanticTag?: "section" | "div" | "header" | "article" | "aside" | "nav";
  dividerStyle?: "solid" | "dashed" | "dotted";
  spacerSize?: DynamicTemplateLength;
  contentTemplateLayoutData?: Record<string, unknown>;
  contentTemplateDesignProps?: Record<string, string | number | boolean>;
}

/** 仅供母模板作者工作流使用；页面实例和公开 Renderer 必须忽略。 */
export interface DynamicTemplateNodeAuthoring {
  structureLocked?: boolean;
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
  authoring?: DynamicTemplateNodeAuthoring;
  instanceEditPolicy?: DynamicTemplateInstanceEditPolicy;
  responsive: DynamicTemplateResponsiveMap;
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
  fontFamily?: "system" | "serif" | "sans";
  color?: string;
  letterSpacing?: number;
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
  semanticRole?: string;
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
  tabletRules?: DynamicTemplateSlotRules;
  mobileRules: DynamicTemplateSlotRules;
}

export interface DynamicTemplateCanvasSize {
  width: number;
  height: number;
  aspectRatio: number;
}

export interface DynamicTemplateMetadata {
  category: string;
  purpose: string;
  layoutType: string;
  slotSummary: string;
  recommendedFor: string[];
  desktopRatio: string;
  mobileRatio: string;
  canvasSize?: DynamicTemplateCanvasSize;
  previewDesktopWidth?: number;
  previewMobileWidth?: number;
  previewTabletWidth?: number;
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
  /** 创建来源快照；重新打开时不能用它覆盖人工精修后的节点树。 */
  templateRecipe?: TemplateRecipe;
  schemaVersion: typeof DYNAMIC_TEMPLATE_SUPPORTED_SCHEMA_VERSIONS[number];
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
