/**
 * 自动生成，禁止手改。
 * 来源：contracts/page-builder/content-templates.contract.json
 * SHA-256：96eb3520457242c6edf5552cc74f1a55079cdd974e913cbf8acb8638cd42362c
 */

export const CONTENT_TEMPLATE_REGISTRY_VERSION = 3;
export const CONTENT_TEMPLATE_CONTRACT_VERSION = 2;

export type RegisteredContentTemplateKey = "hero" | "fullBleed" | "video" | "carousel" | "singlePoster" | "doublePoster" | "textBanner" | "journey" | "comparison" | "featuredProduct" | "productRow" | "gallery" | "wearingInspiration" | "categoryCards" | "sceneShopping" | "hotspot" | "brandPoints" | "servicePromises" | "certificates" | "storeInfo" | "testimonials" | "booking" | "limitedEvent";
export type ContentTemplateKey = RegisteredContentTemplateKey;
export type ContentTemplateMaster = "asymmetric-gallery" | "booking-epilogue" | "brand-points" | "category-navigation" | "cinematic-hero" | "cinematic-video" | "comparison-stage" | "editorial-journey" | "editorial-split" | "editorial-story" | "editorial-text" | "event-stage" | "hotspot-stage" | "immersive-image" | "product-focus" | "product-grid" | "scene-navigation" | "sequence-stage" | "service-policy" | "store-visit" | "testimonial-proof" | "trust-gallery" | "wearing-story";
export type ContentTemplateAssetClass = "product" | "editorial" | "craft" | "service";

export type ContentTemplateAssetPolicy = {
  classes: readonly ContentTemplateAssetClass[];
  placeholder: {
    status: "waiting-final-asset";
    label: string;
    badge: string;
    publishable: false;
  };
  minimumWidthByViewport: Record<
    "desktop" | "mobile",
    Record<"full" | "wide" | "standard" | "editorial", number>
  >;
};

export const CONTENT_TEMPLATE_ASSET_POLICY = {
  "classes": [
    "product",
    "editorial",
    "craft",
    "service"
  ],
  "minimumWidthByViewport": {
    "desktop": {
      "editorial": 1600,
      "full": 3360,
      "standard": 1600,
      "wide": 2400
    },
    "mobile": {
      "editorial": 1500,
      "full": 1500,
      "standard": 1500,
      "wide": 1500
    }
  },
  "placeholder": {
    "badge": "内部占位",
    "label": "等待最终素材",
    "publishable": false,
    "status": "waiting-final-asset"
  }
} as const satisfies ContentTemplateAssetPolicy;

export type ContentTemplatePageRule = {
  pageKey: string;
  pageRole: string;
  allowedTemplateKeys: readonly ContentTemplateKey[];
  businessRegionCount: 0 | 1;
  businessRegionPosition?: "after-first-brand-block";
  headerMode: {
    configured: "overlay-light" | "solid";
    overlayRequiresFirstTemplate?: "hero";
    fallback: "solid";
  };
};

export const CONTENT_TEMPLATE_PAGE_RULES = {
  "about": {
    "allowedTemplateKeys": [
      "hero",
      "fullBleed",
      "video",
      "singlePoster",
      "doublePoster",
      "textBanner",
      "journey",
      "brandPoints",
      "servicePromises",
      "certificates",
      "storeInfo",
      "booking"
    ],
    "businessRegionCount": 0,
    "headerMode": {
      "configured": "overlay-light",
      "fallback": "solid",
      "overlayRequiresFirstTemplate": "hero"
    },
    "pageKey": "about",
    "pageRole": "brand-story"
  },
  "catalog": {
    "allowedTemplateKeys": [
      "fullBleed",
      "singlePoster",
      "textBanner",
      "booking"
    ],
    "businessRegionCount": 1,
    "businessRegionPosition": "after-first-brand-block",
    "headerMode": {
      "configured": "solid",
      "fallback": "solid"
    },
    "pageKey": "catalog",
    "pageRole": "selection-tool"
  },
  "contact": {
    "allowedTemplateKeys": [
      "hero",
      "fullBleed",
      "singlePoster",
      "textBanner",
      "storeInfo"
    ],
    "businessRegionCount": 1,
    "businessRegionPosition": "after-first-brand-block",
    "headerMode": {
      "configured": "solid",
      "fallback": "solid",
      "overlayRequiresFirstTemplate": "hero"
    },
    "pageKey": "contact",
    "pageRole": "conversion-support"
  },
  "custom": {
    "allowedTemplateKeys": [
      "hero",
      "fullBleed",
      "video",
      "singlePoster",
      "doublePoster",
      "textBanner",
      "journey",
      "comparison",
      "gallery",
      "hotspot",
      "brandPoints",
      "servicePromises",
      "testimonials",
      "certificates",
      "booking"
    ],
    "businessRegionCount": 0,
    "headerMode": {
      "configured": "overlay-light",
      "fallback": "solid",
      "overlayRequiresFirstTemplate": "hero"
    },
    "pageKey": "custom",
    "pageRole": "brand-service"
  },
  "home": {
    "allowedTemplateKeys": [
      "hero",
      "fullBleed",
      "video",
      "carousel",
      "singlePoster",
      "doublePoster",
      "textBanner",
      "journey",
      "featuredProduct",
      "productRow",
      "gallery",
      "wearingInspiration",
      "categoryCards",
      "sceneShopping",
      "brandPoints",
      "booking",
      "limitedEvent"
    ],
    "businessRegionCount": 0,
    "headerMode": {
      "configured": "overlay-light",
      "fallback": "solid",
      "overlayRequiresFirstTemplate": "hero"
    },
    "pageKey": "home",
    "pageRole": "brand-home"
  },
  "products": {
    "allowedTemplateKeys": [
      "hero",
      "fullBleed",
      "video",
      "carousel",
      "singlePoster",
      "doublePoster",
      "textBanner",
      "featuredProduct",
      "productRow",
      "gallery",
      "wearingInspiration",
      "categoryCards",
      "sceneShopping",
      "hotspot",
      "booking",
      "limitedEvent"
    ],
    "businessRegionCount": 0,
    "headerMode": {
      "configured": "solid",
      "fallback": "solid",
      "overlayRequiresFirstTemplate": "hero"
    },
    "pageKey": "products",
    "pageRole": "brand-showcase"
  }
} as const satisfies Record<string, ContentTemplatePageRule>;

export type MediaSlot = {
  key: string;
  required: boolean;
  desktopRatio?: string;
  mobileRatio?: string;
};

export type ContentTemplateEditableObjectKind =
  | "media" | "video" | "text" | "action" | "product" | "collection";

export type ContentTemplateEditableCapability =
  | "content" | "layout" | "layer" | "visibility" | "ratio"
  | "size" | "position" | "fit" | "zoom" | "focus"
  | "typography" | "link" | "items" | "reference" | "playback";

export type ContentTemplateResponsiveScope = "shared" | "viewport-specific";

export type ContentTemplateEditableObject = {
  roleId: string;
  nodeIds?: readonly string[];
  kind: ContentTemplateEditableObjectKind;
  contentFieldKeys: readonly string[];
  altFieldKey?: string;
  altPolicy?: "required" | "derived" | "decorative" | "not-applicable";
  collectionFieldKeys?: readonly string[];
  referenceFieldKey?: string;
  fieldScopes?: Readonly<Record<string, ContentTemplateResponsiveScope>>;
  capabilities: readonly ContentTemplateEditableCapability[];
  responsive: Partial<Record<ContentTemplateEditableCapability, ContentTemplateResponsiveScope>>;
};

export type ContentTemplateContract = {
  key: ContentTemplateKey;
  moduleType: string;
  displayName: string;
  version: number;
  master: ContentTemplateMaster;
  visualRole: "primary-stage" | "feature-stage" | "support-stage";
  visualWeight: "primary-stage" | "feature-stage" | "support-stage";
  heightModeByViewport: Record<"desktop" | "mobile", "viewport" | "ratio" | "content">;
  width: "full" | "standard" | "wide" | "editorial";
  flow: "bleed" | "flow";
  copyPlacementByViewport: Record<"desktop" | "mobile", "overlay" | "stacked" | "split">;
  spacingPolicy: readonly ("compact" | "normal" | "spacious" | "grand")[];
  media: readonly MediaSlot[];
  roles: readonly {
    id: string;
    role: ContentTemplateSkeletonRole;
    kind: string;
    required: boolean;
    assetClass?: ContentTemplateAssetClass;
    semantic?: string;
    previewRoles?: readonly ContentTemplateSkeletonRole[];
    appliesTo?: readonly ("desktop" | "mobile")[];
    fallbackRoleId?: string;
    parentRole?: string;
    positioning?: string;
    proof?: string;
    relation?: string;
    emphasis?: string;
    quantity?: { default: number; min: number; max: number };
    publicationAttestation?: { fieldKey: string; label: string };
    defaultRatioByViewport?: Partial<Record<"desktop" | "mobile", string>>;
    allowedRatioPresetsByViewport?: Partial<Record<"desktop" | "mobile", readonly string[]>>;
  }[];
  order: Record<"desktop" | "mobile", readonly string[]>;
  preview: {
    purpose: string;
    visualRole: "primary-stage" | "feature-stage" | "support-stage";
    desktop: ContentTemplateRootPreviewViewport;
    mobile: ContentTemplateRootPreviewViewport;
  };
  presets: readonly string[];
  presetValues?: unknown;
  contentBudget: {
    limits: Readonly<Record<string, number>>;
    requiredText: readonly string[];
    maxCtas: number;
  };
  allowedControls: readonly string[];
  supportsLinkTarget: boolean;
  editorCapabilities: {
    primaryTask: "media" | "product" | "category" | "structured" | "text" | "action";
    editableObjects: readonly ContentTemplateEditableObject[];
    referenceFields?: readonly {
      kind: "product" | "category";
      key: string;
      legacyKey?: string;
      min: number;
      max: number;
    }[];
    layoutOverrides?: {
      framePresets?: readonly string[];
      frameRatioPresets?: readonly string[];
      frameRatioRange?: { min: number; max: number; step: number };
      compositionPresets?: readonly string[];
      slots?: readonly {
        roleId: string;
        fieldKey?: string;
        ratioPresets?: readonly string[];
        sizePresets?: readonly string[];
        positionPresets?: readonly string[];
        fit?: readonly ("cover" | "contain")[];
        zoom?: { min: number; max: number; step: number };
        focusByViewport?: boolean;
      }[];
      textRoles?: readonly {
        roleId: string;
        placementPresets?: readonly string[];
        widthPresets?: readonly string[];
        sizePresets?: readonly string[];
        align?: readonly ("left" | "center" | "right")[];
        colorTokens?: readonly string[];
        requiresSafeBand?: boolean;
        maxLines?: number;
      }[];
    };
  };
  desktopCopyRatio?: number;
  desktopMediaRatio?: number;
};

export type ContentTemplateMarker = {
  key: ContentTemplateKey;
  version: number;
};

export type ContentTemplateInstanceOverridesV1 = {
  version: 1;
  layout?: {
    framePreset?: string;
    compositionPreset?: string;
  };
  slots?: Record<string, {
    ratioPreset?: string;
    sizePreset?: string;
    positionPreset?: string;
    fit?: "cover" | "contain";
    zoom?: number;
    focusByViewport?: Partial<Record<"desktop" | "mobile", { x: number; y: number }>>;
  }>;
  textRoles?: Record<string, {
    enabled?: boolean;
    placementPreset?: string;
    widthPreset?: string;
    sizePreset?: string;
    align?: "left" | "center" | "right";
    colorToken?: string;
    safeBand?: "light" | "dark";
  }>;
};

export type ContentTemplateVisualRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ContentTemplateInstanceOverridesV2 = {
  version: 2;
  frame?: {
    aspectRatio?: number;
    aspectRatioByViewport?: Partial<Record<"desktop" | "mobile", number>>;
    heightPreset?: string;
    compositionPreset?: string;
    colorPreset?: string;
    customColors?: {
      background?: string;
      text?: string;
      accent?: string;
    };
  };
  nodes?: Record<string, {
    enabled?: boolean;
    rectByViewport?: Partial<Record<"desktop" | "mobile", ContentTemplateVisualRect>>;
    zIndexByViewport?: Partial<Record<"desktop" | "mobile", number>>;
    ratio?: number;
    sizePreset?: string;
    positionPreset?: string;
    mediaView?: {
      fit?: "cover" | "contain";
      zoom?: number;
      focusByViewport?: Partial<Record<"desktop" | "mobile", { x: number; y: number }>>;
    };
    typography?: {
      sizeLevel?: "xs" | "sm" | "md" | "lg" | "xl";
      align?: "left" | "center" | "right";
      color?: string;
      maxLines?: number;
      safeBand?: "none" | "light" | "dark";
      lineHeight?: number;
      letterSpacing?: number;
    };
  }>;
};

export type ContentTemplateInstanceOverrides =
  | ContentTemplateInstanceOverridesV1
  | ContentTemplateInstanceOverridesV2;

export type ContentTemplateSkeletonRole =
  | "media" | "mainMedia" | "detailMedia" | "copy" | "action" | "marker"
  | "timeline" | "list" | "card" | "quote" | "form"
  | "eyebrow" | "title" | "subtitle";

export type ContentTemplateSkeletonZone = {
  role: ContentTemplateSkeletonRole;
  column: number;
  span: number;
  row: number;
  rowSpan: number;
  overlay?: boolean;
  kind?: "play" | "pagination" | "steps-5" | "handle" | "hotspot" | "countdown";
};

export type ContentTemplateRootPreviewViewport = {
  tone: "light" | "dark";
  rows?: number;
  order: readonly string[];
  zones: readonly (ContentTemplateSkeletonZone & { roleId: string })[];
};

export type ContentTemplateSkeleton = {
  key: RegisteredContentTemplateKey;
  moduleType: string;
  displayName: string;
  category: string;
  visualRole: "primary-stage" | "feature-stage" | "support-stage";
  heightModeByViewport: Record<"desktop" | "mobile", "viewport" | "ratio" | "content">;
  width: "full" | "standard" | "wide" | "editorial";
  flow: "bleed" | "flow";
  slots: readonly { key: string; role: ContentTemplateSkeletonRole; desktopRatio?: string; mobileRatio?: string }[];
  order: Record<"desktop" | "mobile", readonly ContentTemplateSkeletonRole[]>;
  preview: { tone: "light" | "dark"; desktopZones: readonly ContentTemplateSkeletonZone[] };
};

export type ContentTemplatePreviewZone = ContentTemplateSkeletonZone & {
  kind?: "play" | "pagination" | "steps-5" | "handle" | "hotspot" | "countdown";
};

export type ContentTemplatePreviewViewport = {
  tone: "light" | "dark";
  rows?: number;
  order: readonly ContentTemplateSkeletonRole[];
  zones: readonly ContentTemplatePreviewZone[];
};

export type ContentTemplatePreview = {
  key: RegisteredContentTemplateKey;
  moduleType: string;
  displayName: string;
  purpose: string;
  visualRole: "primary-stage" | "feature-stage" | "support-stage";
  desktop: ContentTemplatePreviewViewport;
  mobile: ContentTemplatePreviewViewport;
};

export type ContentTemplateIssueSeverity = "error" | "warning" | "info";

export type ContentTemplateIssue = {
  code:
    | "content-template-legacy"
    | "content-template-marker-invalid"
    | "content-template-key-mismatch"
    | "content-template-version-unsupported"
    | "page-validation"
    | `page-validation-${string}`;
  severity: ContentTemplateIssueSeverity;
  layer: "contract" | "page";
  blockId?: string;
  moduleType?: string;
  field?: string;
  index?: number;
  path: string;
  message: string;
};

export type ContentTemplateCompletion = {
  material: { complete: boolean; missing: string[] };
  content: { complete: boolean; missing: string[] };
  collections: {
    complete: boolean;
    invalid: Array<{
      roleId: string;
      fieldKey: string;
      count: number;
      min: number;
      max: number;
    }>;
  };
  attestations: {
    complete: boolean;
    missing: Array<{
      roleId: string;
      collectionFieldKey: string;
      attestationFieldKey: string;
      label: string;
      index: number;
    }>;
  };
  publish: { complete: boolean; issues: ContentTemplateIssue[] };
};

export const CONTENT_TEMPLATE_REGISTRY = [
  {
    "category": "视觉展示",
    "displayName": "首屏",
    "implementationStatus": "active",
    "key": "hero",
    "moduleType": "首屏主视觉"
  },
  {
    "category": "视觉展示",
    "displayName": "通栏图",
    "implementationStatus": "active",
    "key": "fullBleed",
    "moduleType": "全屏出血图"
  },
  {
    "category": "视觉展示",
    "displayName": "视频",
    "implementationStatus": "active",
    "key": "video",
    "moduleType": "视频区块"
  },
  {
    "category": "视觉展示",
    "displayName": "轮播",
    "implementationStatus": "active",
    "key": "carousel",
    "moduleType": "轮播图"
  },
  {
    "category": "图文内容",
    "displayName": "单图文",
    "implementationStatus": "active",
    "key": "singlePoster",
    "moduleType": "单图海报"
  },
  {
    "category": "图文内容",
    "displayName": "双图文",
    "implementationStatus": "active",
    "key": "doublePoster",
    "moduleType": "双图海报"
  },
  {
    "category": "图文内容",
    "displayName": "纯文字",
    "implementationStatus": "active",
    "key": "textBanner",
    "moduleType": "文字横幅"
  },
  {
    "category": "图文内容",
    "displayName": "内容流程",
    "implementationStatus": "active",
    "key": "journey",
    "moduleType": "定制流程"
  },
  {
    "category": "图文内容",
    "displayName": "前后对比",
    "implementationStatus": "active",
    "key": "comparison",
    "moduleType": "改款对比"
  },
  {
    "category": "商品展示",
    "displayName": "单品展示",
    "implementationStatus": "active",
    "key": "featuredProduct",
    "moduleType": "单品焦点推荐"
  },
  {
    "category": "商品展示",
    "displayName": "商品列表",
    "implementationStatus": "active",
    "key": "productRow",
    "moduleType": "产品展示行"
  },
  {
    "category": "商品展示",
    "displayName": "作品画廊",
    "implementationStatus": "active",
    "key": "gallery",
    "moduleType": "作品画廊"
  },
  {
    "category": "商品展示",
    "displayName": "佩戴展示",
    "implementationStatus": "active",
    "key": "wearingInspiration",
    "moduleType": "佩戴灵感"
  },
  {
    "category": "导航入口",
    "displayName": "品类入口",
    "implementationStatus": "active",
    "key": "categoryCards",
    "moduleType": "分类卡片"
  },
  {
    "category": "导航入口",
    "displayName": "场景入口",
    "implementationStatus": "active",
    "key": "sceneShopping",
    "moduleType": "按场景选购"
  },
  {
    "category": "导航入口",
    "displayName": "图片热区",
    "implementationStatus": "active",
    "key": "hotspot",
    "moduleType": "热区图"
  },
  {
    "category": "服务信息",
    "displayName": "品牌要点",
    "implementationStatus": "active",
    "key": "brandPoints",
    "moduleType": "卡片网格"
  },
  {
    "category": "服务信息",
    "displayName": "服务承诺",
    "implementationStatus": "active",
    "key": "servicePromises",
    "moduleType": "服务承诺"
  },
  {
    "category": "服务信息",
    "displayName": "证书展示",
    "implementationStatus": "active",
    "key": "certificates",
    "moduleType": "资质证书"
  },
  {
    "category": "服务信息",
    "displayName": "门店信息",
    "implementationStatus": "active",
    "key": "storeInfo",
    "moduleType": "门店信息"
  },
  {
    "category": "服务信息",
    "displayName": "顾客分享",
    "implementationStatus": "active",
    "key": "testimonials",
    "moduleType": "真实评价与实拍"
  },
  {
    "category": "服务信息",
    "displayName": "预约入口",
    "implementationStatus": "active",
    "key": "booking",
    "moduleType": "预约入口"
  },
  {
    "category": "活动内容",
    "displayName": "限时活动",
    "implementationStatus": "active",
    "key": "limitedEvent",
    "moduleType": "限时活动"
  }
] as const;

/** 23 个真实 Renderer 的完整 schema v3 合同；implementationStatus 不再决定可否渲染。 */
export const CONTENT_TEMPLATE_CONTRACTS = {
  "booking": {
    "allowedControls": [],
    "contentBudget": {
      "limits": {
        "altText": 80,
        "buttonText": 12,
        "phone": 24,
        "subtitle": 90,
        "title": 32
      },
      "maxCtas": 1,
      "requiredText": [
        "title",
        "buttonText"
      ]
    },
    "copyPlacementByViewport": {
      "desktop": "stacked",
      "mobile": "stacked"
    },
    "displayName": "预约入口",
    "editorCapabilities": {
      "editableObjects": [
        {
          "altFieldKey": "altText",
          "capabilities": [
            "content",
            "layout",
            "layer",
            "fit",
            "zoom",
            "focus"
          ],
          "contentFieldKeys": [
            "backgroundImage",
            "altText"
          ],
          "kind": "media",
          "responsive": {
            "content": "shared",
            "fit": "shared",
            "focus": "viewport-specific",
            "layer": "viewport-specific",
            "layout": "viewport-specific",
            "zoom": "shared"
          },
          "roleId": "bgImage"
        },
        {
          "capabilities": [
            "content",
            "layout",
            "layer",
            "visibility",
            "typography"
          ],
          "contentFieldKeys": [
            "title",
            "subtitle"
          ],
          "kind": "text",
          "nodeIds": [
            "copy",
            "title",
            "subtitle"
          ],
          "responsive": {
            "content": "shared",
            "layer": "viewport-specific",
            "layout": "viewport-specific",
            "typography": "shared",
            "visibility": "shared"
          },
          "roleId": "copy"
        },
        {
          "capabilities": [
            "content",
            "link",
            "layout",
            "layer",
            "visibility",
            "typography"
          ],
          "contentFieldKeys": [
            "buttonText",
            "targetType",
            "productId",
            "linkUrl"
          ],
          "kind": "action",
          "nodeIds": [
            "primaryAction",
            "buttonText"
          ],
          "responsive": {
            "content": "shared",
            "layer": "viewport-specific",
            "layout": "viewport-specific",
            "link": "shared",
            "typography": "shared",
            "visibility": "shared"
          },
          "roleId": "primaryAction"
        },
        {
          "capabilities": [
            "content"
          ],
          "contentFieldKeys": [
            "phone"
          ],
          "kind": "action",
          "responsive": {
            "content": "shared"
          },
          "roleId": "secondaryContact"
        }
      ],
      "layoutOverrides": {
        "framePresets": [
          "compact",
          "standard",
          "spacious"
        ],
        "frameRatioPresets": [
          "21 / 6",
          "16 / 9",
          "3 / 2",
          "4 / 5"
        ],
        "frameRatioRange": {
          "max": 3.5,
          "min": 0.8,
          "step": 0.05
        },
        "slots": [
          {
            "fieldKey": "backgroundImage",
            "fit": [
              "cover",
              "contain"
            ],
            "focusByViewport": true,
            "roleId": "bgImage",
            "zoom": {
              "max": 1.4,
              "min": 1,
              "step": 0.05
            }
          }
        ],
        "textRoles": [
          {
            "align": [
              "left",
              "center"
            ],
            "colorTokens": [
              "ink",
              "ivory"
            ],
            "maxLines": 2,
            "placementPresets": [
              "left",
              "center"
            ],
            "requiresSafeBand": true,
            "roleId": "title",
            "sizePresets": [
              "small",
              "standard",
              "large"
            ],
            "widthPresets": [
              "narrow",
              "standard"
            ]
          },
          {
            "align": [
              "left",
              "center"
            ],
            "colorTokens": [
              "ink",
              "ivory"
            ],
            "maxLines": 3,
            "placementPresets": [
              "left",
              "center"
            ],
            "requiresSafeBand": true,
            "roleId": "subtitle",
            "sizePresets": [
              "small",
              "standard"
            ],
            "widthPresets": [
              "narrow",
              "standard"
            ]
          },
          {
            "align": [
              "left",
              "center"
            ],
            "colorTokens": [
              "ink",
              "ivory"
            ],
            "maxLines": 1,
            "placementPresets": [
              "left",
              "center"
            ],
            "requiresSafeBand": true,
            "roleId": "buttonText",
            "sizePresets": [
              "small",
              "standard"
            ],
            "widthPresets": [
              "narrow",
              "standard"
            ]
          }
        ]
      },
      "primaryTask": "action"
    },
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content"
    },
    "key": "booking",
    "master": "booking-epilogue",
    "media": [
      {
        "desktopRatio": "21 / 6",
        "key": "bgImage",
        "mobileRatio": "4 / 5",
        "required": false
      }
    ],
    "moduleType": "预约入口",
    "order": {
      "desktop": [
        "bgImage",
        "copy",
        "primaryAction",
        "secondaryContact"
      ],
      "mobile": [
        "bgImage",
        "copy",
        "primaryAction",
        "secondaryContact"
      ]
    },
    "presets": [
      "locationData"
    ],
    "preview": {
      "desktop": {
        "order": [
          "copy",
          "primaryAction",
          "secondaryContact"
        ],
        "tone": "light",
        "zones": [
          {
            "column": 2,
            "role": "copy",
            "roleId": "copy",
            "row": 2,
            "rowSpan": 3,
            "span": 6
          },
          {
            "column": 9,
            "role": "action",
            "roleId": "primaryAction",
            "row": 3,
            "rowSpan": 1,
            "span": 3
          },
          {
            "column": 9,
            "role": "marker",
            "roleId": "secondaryContact",
            "row": 5,
            "rowSpan": 1,
            "span": 3
          }
        ]
      },
      "mobile": {
        "order": [
          "copy",
          "primaryAction",
          "secondaryContact"
        ],
        "tone": "light",
        "zones": [
          {
            "column": 1,
            "role": "copy",
            "roleId": "copy",
            "row": 1,
            "rowSpan": 3,
            "span": 12
          },
          {
            "column": 1,
            "role": "action",
            "roleId": "primaryAction",
            "row": 5,
            "rowSpan": 1,
            "span": 8
          },
          {
            "column": 1,
            "role": "marker",
            "roleId": "secondaryContact",
            "row": 7,
            "rowSpan": 1,
            "span": 8
          }
        ]
      },
      "purpose": "页面尾章的预约主行动与次级联系方式",
      "visualRole": "feature-stage"
    },
    "roles": [
      {
        "allowedRatioPresetsByViewport": {},
        "defaultRatioByViewport": {},
        "emphasis": "primary",
        "id": "primaryAction",
        "kind": "action",
        "required": true,
        "role": "action",
        "semantic": "primary-booking-action"
      },
      {
        "allowedRatioPresetsByViewport": {
          "desktop": [
            "21 / 6"
          ],
          "mobile": [
            "4 / 5"
          ]
        },
        "assetClass": "service",
        "defaultRatioByViewport": {
          "desktop": "21 / 6",
          "mobile": "4 / 5"
        },
        "id": "bgImage",
        "kind": "media",
        "positioning": "background",
        "required": false,
        "role": "media",
        "semantic": "atmosphere-background"
      },
      {
        "id": "copy",
        "kind": "text",
        "required": false,
        "role": "copy"
      },
      {
        "emphasis": "secondary",
        "id": "secondaryContact",
        "kind": "contact",
        "required": false,
        "role": "marker",
        "semantic": "optional-secondary-contact"
      }
    ],
    "spacingPolicy": [
      "normal"
    ],
    "supportsLinkTarget": true,
    "version": 2,
    "visualRole": "support-stage",
    "visualWeight": "support-stage",
    "width": "standard"
  },
  "brandPoints": {
    "allowedControls": [],
    "contentBudget": {
      "limits": {},
      "maxCtas": 0,
      "requiredText": []
    },
    "copyPlacementByViewport": {
      "desktop": "stacked",
      "mobile": "stacked"
    },
    "displayName": "品牌要点",
    "editorCapabilities": {
      "editableObjects": [
        {
          "capabilities": [
            "content",
            "items"
          ],
          "collectionFieldKeys": [
            "cards"
          ],
          "contentFieldKeys": [
            "cards"
          ],
          "kind": "collection",
          "responsive": {
            "content": "shared",
            "items": "shared"
          },
          "roleId": "points"
        },
        {
          "capabilities": [
            "content"
          ],
          "contentFieldKeys": [
            "title",
            "subtitle"
          ],
          "kind": "text",
          "responsive": {
            "content": "shared"
          },
          "roleId": "copy"
        }
      ],
      "layoutOverrides": {
        "compositionPresets": [
          "grid-2",
          "grid-3",
          "grid-4"
        ],
        "framePresets": [
          "compact",
          "standard",
          "spacious"
        ]
      },
      "primaryTask": "structured"
    },
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content"
    },
    "key": "brandPoints",
    "master": "brand-points",
    "media": [],
    "moduleType": "卡片网格",
    "order": {
      "desktop": [
        "copy",
        "points"
      ],
      "mobile": [
        "copy",
        "points"
      ]
    },
    "presets": [],
    "preview": {
      "desktop": {
        "order": [
          "copy",
          "points"
        ],
        "tone": "light",
        "zones": [
          {
            "column": 3,
            "role": "copy",
            "roleId": "copy",
            "row": 1,
            "rowSpan": 1,
            "span": 8
          },
          {
            "column": 1,
            "role": "card",
            "roleId": "points",
            "row": 3,
            "rowSpan": 3,
            "span": 4
          },
          {
            "column": 5,
            "role": "card",
            "roleId": "points",
            "row": 3,
            "rowSpan": 3,
            "span": 4
          },
          {
            "column": 9,
            "role": "card",
            "roleId": "points",
            "row": 3,
            "rowSpan": 3,
            "span": 4
          }
        ]
      },
      "mobile": {
        "order": [
          "copy",
          "points"
        ],
        "tone": "light",
        "zones": [
          {
            "column": 1,
            "role": "copy",
            "roleId": "copy",
            "row": 1,
            "rowSpan": 1,
            "span": 12
          },
          {
            "column": 1,
            "role": "card",
            "roleId": "points",
            "row": 2,
            "rowSpan": 2,
            "span": 12
          },
          {
            "column": 1,
            "role": "card",
            "roleId": "points",
            "row": 4,
            "rowSpan": 2,
            "span": 12
          },
          {
            "column": 1,
            "role": "card",
            "roleId": "points",
            "row": 6,
            "rowSpan": 2,
            "span": 12
          }
        ]
      },
      "purpose": "三个品牌能力要点",
      "visualRole": "support-stage"
    },
    "roles": [
      {
        "allowedRatioPresetsByViewport": {},
        "defaultRatioByViewport": {},
        "id": "points",
        "kind": "collection",
        "quantity": {
          "default": 3,
          "max": 4,
          "min": 3
        },
        "required": false,
        "role": "card"
      },
      {
        "id": "copy",
        "kind": "text",
        "required": false,
        "role": "copy"
      }
    ],
    "spacingPolicy": [
      "normal"
    ],
    "supportsLinkTarget": true,
    "version": 2,
    "visualRole": "support-stage",
    "visualWeight": "support-stage",
    "width": "standard"
  },
  "carousel": {
    "allowedControls": [],
    "contentBudget": {
      "limits": {},
      "maxCtas": 0,
      "requiredText": []
    },
    "copyPlacementByViewport": {
      "desktop": "overlay",
      "mobile": "stacked"
    },
    "displayName": "轮播",
    "editorCapabilities": {
      "editableObjects": [
        {
          "capabilities": [
            "content",
            "items",
            "playback",
            "layout",
            "layer",
            "ratio",
            "fit",
            "zoom",
            "focus"
          ],
          "collectionFieldKeys": [
            "images"
          ],
          "contentFieldKeys": [
            "images",
            "autoPlay",
            "showDots",
            "showArrows",
            "interval"
          ],
          "kind": "collection",
          "responsive": {
            "content": "shared",
            "fit": "shared",
            "focus": "viewport-specific",
            "items": "shared",
            "layer": "viewport-specific",
            "layout": "viewport-specific",
            "playback": "shared",
            "ratio": "shared",
            "zoom": "shared"
          },
          "roleId": "frames"
        }
      ],
      "layoutOverrides": {
        "framePresets": [
          "standard",
          "wide"
        ],
        "slots": [
          {
            "fieldKey": "images",
            "fit": [
              "cover"
            ],
            "focusByViewport": true,
            "ratioPresets": [
              "16 / 9",
              "3 / 2",
              "4 / 5"
            ],
            "roleId": "frames",
            "zoom": {
              "max": 1.4,
              "min": 1,
              "step": 0.05
            }
          }
        ]
      },
      "primaryTask": "media"
    },
    "flow": "bleed",
    "heightModeByViewport": {
      "desktop": "ratio",
      "mobile": "ratio"
    },
    "key": "carousel",
    "master": "sequence-stage",
    "media": [
      {
        "desktopRatio": "21 / 6",
        "key": "frames",
        "mobileRatio": "4 / 5",
        "required": false
      }
    ],
    "moduleType": "轮播图",
    "order": {
      "desktop": [
        "frames",
        "copy",
        "pagination"
      ],
      "mobile": [
        "frames",
        "copy",
        "pagination"
      ]
    },
    "presets": [],
    "preview": {
      "desktop": {
        "order": [
          "frames",
          "copy",
          "pagination"
        ],
        "tone": "light",
        "zones": [
          {
            "column": 1,
            "role": "media",
            "roleId": "frames",
            "row": 1,
            "rowSpan": 6,
            "span": 12
          },
          {
            "column": 2,
            "overlay": true,
            "role": "copy",
            "roleId": "copy",
            "row": 4,
            "rowSpan": 1,
            "span": 5
          },
          {
            "column": 9,
            "kind": "pagination",
            "overlay": true,
            "role": "marker",
            "roleId": "pagination",
            "row": 6,
            "rowSpan": 1,
            "span": 3
          }
        ]
      },
      "mobile": {
        "order": [
          "frames",
          "copy",
          "pagination"
        ],
        "tone": "light",
        "zones": [
          {
            "column": 1,
            "role": "media",
            "roleId": "frames",
            "row": 1,
            "rowSpan": 4,
            "span": 12
          },
          {
            "column": 1,
            "role": "copy",
            "roleId": "copy",
            "row": 5,
            "rowSpan": 2,
            "span": 12
          },
          {
            "column": 1,
            "kind": "pagination",
            "role": "marker",
            "roleId": "pagination",
            "row": 7,
            "rowSpan": 1,
            "span": 4
          }
        ]
      },
      "purpose": "多帧主视觉与分页切换",
      "visualRole": "feature-stage"
    },
    "roles": [
      {
        "allowedRatioPresetsByViewport": {
          "desktop": [
            "21 / 6"
          ],
          "mobile": [
            "4 / 5"
          ]
        },
        "assetClass": "editorial",
        "defaultRatioByViewport": {
          "desktop": "21 / 6",
          "mobile": "4 / 5"
        },
        "id": "frames",
        "kind": "media",
        "quantity": {
          "default": 3,
          "max": 5,
          "min": 2
        },
        "required": false,
        "role": "media"
      },
      {
        "id": "copy",
        "kind": "text",
        "required": false,
        "role": "copy"
      },
      {
        "id": "pagination",
        "kind": "marker",
        "required": false,
        "role": "marker",
        "semantic": "pagination-control"
      }
    ],
    "spacingPolicy": [
      "normal"
    ],
    "supportsLinkTarget": true,
    "version": 2,
    "visualRole": "feature-stage",
    "visualWeight": "feature-stage",
    "width": "full"
  },
  "categoryCards": {
    "allowedControls": [],
    "contentBudget": {
      "limits": {},
      "maxCtas": 0,
      "requiredText": []
    },
    "copyPlacementByViewport": {
      "desktop": "stacked",
      "mobile": "stacked"
    },
    "displayName": "品类入口",
    "editorCapabilities": {
      "editableObjects": [
        {
          "capabilities": [
            "content",
            "items",
            "reference",
            "layout",
            "layer",
            "ratio",
            "fit"
          ],
          "collectionFieldKeys": [
            "categories"
          ],
          "contentFieldKeys": [
            "categorySlugs",
            "categories"
          ],
          "kind": "collection",
          "referenceFieldKey": "categorySlugs",
          "responsive": {
            "content": "shared",
            "fit": "shared",
            "items": "shared",
            "layer": "viewport-specific",
            "layout": "viewport-specific",
            "ratio": "shared",
            "reference": "shared"
          },
          "roleId": "categories"
        },
        {
          "capabilities": [
            "content"
          ],
          "contentFieldKeys": [
            "title",
            "subtitle"
          ],
          "kind": "text",
          "responsive": {
            "content": "shared"
          },
          "roleId": "copy"
        }
      ],
      "layoutOverrides": {
        "compositionPresets": [
          "grid-2",
          "grid-3",
          "grid-4"
        ],
        "slots": [
          {
            "fieldKey": "categories",
            "fit": [
              "cover"
            ],
            "ratioPresets": [
              "1 / 1",
              "4 / 5"
            ],
            "roleId": "categories"
          }
        ]
      },
      "primaryTask": "category",
      "referenceFields": [
        {
          "key": "categorySlugs",
          "kind": "category",
          "legacyKey": "categories",
          "max": 4,
          "min": 2
        }
      ]
    },
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content"
    },
    "key": "categoryCards",
    "master": "category-navigation",
    "media": [],
    "moduleType": "分类卡片",
    "order": {
      "desktop": [
        "copy",
        "categories"
      ],
      "mobile": [
        "copy",
        "categories"
      ]
    },
    "presets": [],
    "preview": {
      "desktop": {
        "order": [
          "copy",
          "categories"
        ],
        "tone": "light",
        "zones": [
          {
            "column": 1,
            "role": "copy",
            "roleId": "copy",
            "row": 1,
            "rowSpan": 1,
            "span": 4
          },
          {
            "column": 1,
            "role": "card",
            "roleId": "categories",
            "row": 3,
            "rowSpan": 4,
            "span": 4
          },
          {
            "column": 5,
            "role": "card",
            "roleId": "categories",
            "row": 3,
            "rowSpan": 4,
            "span": 4
          },
          {
            "column": 9,
            "role": "card",
            "roleId": "categories",
            "row": 3,
            "rowSpan": 4,
            "span": 4
          }
        ]
      },
      "mobile": {
        "order": [
          "copy",
          "categories"
        ],
        "tone": "light",
        "zones": [
          {
            "column": 1,
            "role": "copy",
            "roleId": "copy",
            "row": 1,
            "rowSpan": 1,
            "span": 12
          },
          {
            "column": 1,
            "role": "card",
            "roleId": "categories",
            "row": 2,
            "rowSpan": 2,
            "span": 12
          },
          {
            "column": 1,
            "role": "card",
            "roleId": "categories",
            "row": 4,
            "rowSpan": 2,
            "span": 12
          },
          {
            "column": 1,
            "role": "card",
            "roleId": "categories",
            "row": 6,
            "rowSpan": 2,
            "span": 12
          }
        ]
      },
      "purpose": "三张品类入口卡",
      "visualRole": "support-stage"
    },
    "roles": [
      {
        "allowedRatioPresetsByViewport": {
          "desktop": [
            "1 / 1",
            "4 / 5"
          ],
          "mobile": [
            "4 / 5",
            "1 / 1"
          ]
        },
        "assetClass": "editorial",
        "defaultRatioByViewport": {
          "desktop": "1 / 1",
          "mobile": "4 / 5"
        },
        "id": "categories",
        "kind": "collection",
        "quantity": {
          "default": 3,
          "max": 4,
          "min": 2
        },
        "required": false,
        "role": "card"
      },
      {
        "id": "copy",
        "kind": "text",
        "required": false,
        "role": "copy"
      }
    ],
    "spacingPolicy": [
      "normal"
    ],
    "supportsLinkTarget": true,
    "version": 2,
    "visualRole": "support-stage",
    "visualWeight": "support-stage",
    "width": "full"
  },
  "certificates": {
    "allowedControls": [],
    "contentBudget": {
      "limits": {},
      "maxCtas": 0,
      "requiredText": []
    },
    "copyPlacementByViewport": {
      "desktop": "stacked",
      "mobile": "stacked"
    },
    "displayName": "证书展示",
    "editorCapabilities": {
      "editableObjects": [
        {
          "capabilities": [
            "content",
            "items",
            "layout",
            "layer",
            "ratio",
            "fit"
          ],
          "collectionFieldKeys": [
            "certificates"
          ],
          "contentFieldKeys": [
            "certificates"
          ],
          "kind": "collection",
          "responsive": {
            "content": "shared",
            "fit": "shared",
            "items": "shared",
            "layer": "viewport-specific",
            "layout": "viewport-specific",
            "ratio": "shared"
          },
          "roleId": "certificates"
        },
        {
          "capabilities": [
            "content"
          ],
          "contentFieldKeys": [
            "title",
            "subtitle"
          ],
          "kind": "text",
          "responsive": {
            "content": "shared"
          },
          "roleId": "copy"
        }
      ],
      "layoutOverrides": {
        "compositionPresets": [
          "grid-2",
          "grid-3"
        ],
        "slots": [
          {
            "fieldKey": "certificates",
            "fit": [
              "contain",
              "cover"
            ],
            "ratioPresets": [
              "3 / 2",
              "4 / 5"
            ],
            "roleId": "certificates"
          }
        ]
      },
      "primaryTask": "media"
    },
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content"
    },
    "key": "certificates",
    "master": "trust-gallery",
    "media": [],
    "moduleType": "资质证书",
    "order": {
      "desktop": [
        "copy",
        "certificates"
      ],
      "mobile": [
        "copy",
        "certificates"
      ]
    },
    "presets": [],
    "preview": {
      "desktop": {
        "order": [
          "copy",
          "certificates"
        ],
        "tone": "light",
        "zones": [
          {
            "column": 1,
            "role": "copy",
            "roleId": "copy",
            "row": 1,
            "rowSpan": 1,
            "span": 4
          },
          {
            "column": 1,
            "role": "card",
            "roleId": "certificates",
            "row": 3,
            "rowSpan": 3,
            "span": 4
          },
          {
            "column": 5,
            "role": "card",
            "roleId": "certificates",
            "row": 3,
            "rowSpan": 3,
            "span": 4
          },
          {
            "column": 9,
            "role": "card",
            "roleId": "certificates",
            "row": 3,
            "rowSpan": 3,
            "span": 4
          }
        ]
      },
      "mobile": {
        "order": [
          "copy",
          "certificates"
        ],
        "tone": "light",
        "zones": [
          {
            "column": 1,
            "role": "copy",
            "roleId": "copy",
            "row": 1,
            "rowSpan": 1,
            "span": 12
          },
          {
            "column": 1,
            "role": "card",
            "roleId": "certificates",
            "row": 2,
            "rowSpan": 2,
            "span": 12
          },
          {
            "column": 1,
            "role": "card",
            "roleId": "certificates",
            "row": 4,
            "rowSpan": 2,
            "span": 12
          },
          {
            "column": 1,
            "role": "card",
            "roleId": "certificates",
            "row": 6,
            "rowSpan": 2,
            "span": 12
          }
        ]
      },
      "purpose": "三张横向资质证书",
      "visualRole": "support-stage"
    },
    "roles": [
      {
        "allowedRatioPresetsByViewport": {
          "desktop": [
            "3 / 2",
            "16 / 9"
          ],
          "mobile": [
            "3 / 2",
            "16 / 9"
          ]
        },
        "assetClass": "service",
        "defaultRatioByViewport": {
          "desktop": "3 / 2",
          "mobile": "3 / 2"
        },
        "id": "certificates",
        "kind": "collection",
        "publicationAttestation": {
          "fieldKey": "verificationConfirmed",
          "label": "已核验证书原件与展示信息一致"
        },
        "quantity": {
          "default": 3,
          "max": 6,
          "min": 2
        },
        "required": false,
        "role": "card"
      },
      {
        "id": "copy",
        "kind": "text",
        "required": false,
        "role": "copy"
      }
    ],
    "spacingPolicy": [
      "normal"
    ],
    "supportsLinkTarget": true,
    "version": 2,
    "visualRole": "support-stage",
    "visualWeight": "support-stage",
    "width": "wide"
  },
  "comparison": {
    "allowedControls": [],
    "contentBudget": {
      "limits": {},
      "maxCtas": 0,
      "requiredText": []
    },
    "copyPlacementByViewport": {
      "desktop": "stacked",
      "mobile": "stacked"
    },
    "displayName": "前后对比",
    "editorCapabilities": {
      "editableObjects": [
        {
          "altFieldKey": "beforeAltText",
          "capabilities": [
            "content",
            "layout",
            "layer",
            "ratio",
            "fit",
            "zoom"
          ],
          "contentFieldKeys": [
            "beforeImage",
            "beforeLabel",
            "beforeAltText"
          ],
          "kind": "media",
          "responsive": {
            "content": "shared",
            "fit": "shared",
            "layer": "viewport-specific",
            "layout": "viewport-specific",
            "ratio": "shared",
            "zoom": "shared"
          },
          "roleId": "before"
        },
        {
          "altFieldKey": "afterAltText",
          "capabilities": [
            "content",
            "layout",
            "layer",
            "ratio",
            "fit",
            "zoom"
          ],
          "contentFieldKeys": [
            "afterImage",
            "afterLabel",
            "afterAltText"
          ],
          "kind": "media",
          "responsive": {
            "content": "shared",
            "fit": "shared",
            "layer": "viewport-specific",
            "layout": "viewport-specific",
            "ratio": "shared",
            "zoom": "shared"
          },
          "roleId": "after"
        },
        {
          "capabilities": [
            "content"
          ],
          "contentFieldKeys": [
            "title",
            "subtitle"
          ],
          "kind": "text",
          "responsive": {
            "content": "shared"
          },
          "roleId": "copy"
        },
        {
          "capabilities": [
            "content",
            "link"
          ],
          "contentFieldKeys": [
            "actionText",
            "targetType",
            "productId",
            "linkUrl"
          ],
          "kind": "action",
          "nodeIds": [
            "action",
            "actionText"
          ],
          "responsive": {
            "content": "shared",
            "link": "shared"
          },
          "roleId": "action"
        }
      ],
      "layoutOverrides": {
        "slots": [
          {
            "fieldKey": "beforeImage",
            "fit": [
              "cover"
            ],
            "ratioPresets": [
              "4 / 5",
              "1 / 1"
            ],
            "roleId": "before",
            "zoom": {
              "max": 1.4,
              "min": 1,
              "step": 0.05
            }
          },
          {
            "fieldKey": "afterImage",
            "fit": [
              "cover"
            ],
            "ratioPresets": [
              "4 / 5",
              "1 / 1"
            ],
            "roleId": "after",
            "zoom": {
              "max": 1.4,
              "min": 1,
              "step": 0.05
            }
          }
        ]
      },
      "primaryTask": "media"
    },
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "ratio",
      "mobile": "content"
    },
    "key": "comparison",
    "master": "comparison-stage",
    "media": [
      {
        "desktopRatio": "4 / 5",
        "key": "before",
        "mobileRatio": "4 / 5",
        "required": false
      },
      {
        "desktopRatio": "4 / 5",
        "key": "after",
        "mobileRatio": "4 / 5",
        "required": false
      }
    ],
    "moduleType": "改款对比",
    "order": {
      "desktop": [
        "copy",
        "before",
        "after",
        "comparisonHandle"
      ],
      "mobile": [
        "copy",
        "before",
        "after",
        "comparisonHandle"
      ]
    },
    "presets": [],
    "preview": {
      "desktop": {
        "order": [
          "copy",
          "before",
          "after",
          "comparisonHandle"
        ],
        "tone": "light",
        "zones": [
          {
            "column": 1,
            "role": "copy",
            "roleId": "copy",
            "row": 1,
            "rowSpan": 1,
            "span": 12
          },
          {
            "column": 1,
            "role": "mainMedia",
            "roleId": "before",
            "row": 3,
            "rowSpan": 4,
            "span": 6
          },
          {
            "column": 7,
            "role": "detailMedia",
            "roleId": "after",
            "row": 3,
            "rowSpan": 4,
            "span": 6
          },
          {
            "column": 6,
            "kind": "handle",
            "overlay": true,
            "role": "marker",
            "roleId": "comparisonHandle",
            "row": 4,
            "rowSpan": 2,
            "span": 2
          }
        ]
      },
      "mobile": {
        "order": [
          "copy",
          "before",
          "after",
          "comparisonHandle"
        ],
        "tone": "light",
        "zones": [
          {
            "column": 1,
            "role": "copy",
            "roleId": "copy",
            "row": 1,
            "rowSpan": 1,
            "span": 12
          },
          {
            "column": 1,
            "role": "mainMedia",
            "roleId": "before",
            "row": 2,
            "rowSpan": 3,
            "span": 12
          },
          {
            "column": 1,
            "role": "detailMedia",
            "roleId": "after",
            "row": 5,
            "rowSpan": 3,
            "span": 12
          },
          {
            "column": 6,
            "kind": "handle",
            "overlay": true,
            "role": "marker",
            "roleId": "comparisonHandle",
            "row": 4,
            "rowSpan": 2,
            "span": 2
          }
        ]
      },
      "purpose": "同尺寸前后画面与分割手柄",
      "visualRole": "feature-stage"
    },
    "roles": [
      {
        "allowedRatioPresetsByViewport": {
          "desktop": [
            "4 / 5",
            "3 / 2"
          ],
          "mobile": [
            "4 / 5",
            "3 / 2"
          ]
        },
        "assetClass": "craft",
        "defaultRatioByViewport": {
          "desktop": "4 / 5",
          "mobile": "4 / 5"
        },
        "id": "before",
        "kind": "media",
        "required": false,
        "role": "mainMedia"
      },
      {
        "allowedRatioPresetsByViewport": {
          "desktop": [
            "4 / 5",
            "3 / 2"
          ],
          "mobile": [
            "4 / 5",
            "3 / 2"
          ]
        },
        "assetClass": "craft",
        "defaultRatioByViewport": {
          "desktop": "4 / 5",
          "mobile": "4 / 5"
        },
        "id": "after",
        "kind": "media",
        "required": false,
        "role": "detailMedia"
      },
      {
        "id": "copy",
        "kind": "text",
        "required": false,
        "role": "copy"
      },
      {
        "id": "comparisonHandle",
        "kind": "marker",
        "required": false,
        "role": "marker",
        "semantic": "comparison-handle"
      }
    ],
    "spacingPolicy": [
      "normal"
    ],
    "supportsLinkTarget": true,
    "version": 2,
    "visualRole": "feature-stage",
    "visualWeight": "feature-stage",
    "width": "wide"
  },
  "doublePoster": {
    "allowedControls": [],
    "contentBudget": {
      "limits": {
        "actionText": 12,
        "description": 100,
        "detailAltText": 80,
        "label": 16,
        "mainAltText": 80,
        "number": 4,
        "title": 24
      },
      "maxCtas": 1,
      "requiredText": []
    },
    "copyPlacementByViewport": {
      "desktop": "split",
      "mobile": "stacked"
    },
    "displayName": "双图文",
    "editorCapabilities": {
      "editableObjects": [
        {
          "altFieldKey": "mainAltText",
          "capabilities": [
            "content",
            "layout",
            "layer",
            "ratio",
            "size",
            "position",
            "fit",
            "zoom",
            "focus"
          ],
          "contentFieldKeys": [
            "mainImage",
            "mainAltText"
          ],
          "kind": "media",
          "responsive": {
            "content": "shared",
            "fit": "shared",
            "focus": "viewport-specific",
            "layer": "viewport-specific",
            "layout": "viewport-specific",
            "position": "shared",
            "ratio": "shared",
            "size": "shared",
            "zoom": "shared"
          },
          "roleId": "mainImage"
        },
        {
          "altFieldKey": "detailAltText",
          "capabilities": [
            "content",
            "layout",
            "layer",
            "ratio",
            "size",
            "position",
            "fit",
            "zoom",
            "focus"
          ],
          "contentFieldKeys": [
            "detailImage",
            "detailAltText"
          ],
          "kind": "media",
          "responsive": {
            "content": "shared",
            "fit": "shared",
            "focus": "viewport-specific",
            "layer": "viewport-specific",
            "layout": "viewport-specific",
            "position": "shared",
            "ratio": "shared",
            "size": "shared",
            "zoom": "shared"
          },
          "roleId": "detailImage"
        },
        {
          "capabilities": [
            "content",
            "layout",
            "layer",
            "visibility",
            "typography"
          ],
          "contentFieldKeys": [
            "title",
            "description",
            "number",
            "label"
          ],
          "kind": "text",
          "responsive": {
            "content": "shared",
            "layer": "viewport-specific",
            "layout": "viewport-specific",
            "typography": "shared",
            "visibility": "shared"
          },
          "roleId": "copy"
        },
        {
          "capabilities": [
            "content",
            "link"
          ],
          "contentFieldKeys": [
            "actionText",
            "targetType",
            "productId",
            "linkUrl"
          ],
          "kind": "action",
          "nodeIds": [
            "action",
            "actionText"
          ],
          "responsive": {
            "content": "shared",
            "link": "shared"
          },
          "roleId": "action"
        }
      ],
      "layoutOverrides": {
        "compositionPresets": [
          "balanced",
          "main-led",
          "detail-led"
        ],
        "slots": [
          {
            "fit": [
              "cover",
              "contain"
            ],
            "focusByViewport": true,
            "positionPresets": [
              "start",
              "center"
            ],
            "ratioPresets": [
              "3 / 2",
              "4 / 5",
              "1 / 1"
            ],
            "roleId": "mainImage",
            "sizePresets": [
              "standard",
              "large"
            ],
            "zoom": {
              "max": 1.5,
              "min": 1,
              "step": 0.05
            }
          },
          {
            "fit": [
              "cover",
              "contain"
            ],
            "focusByViewport": true,
            "positionPresets": [
              "center",
              "end"
            ],
            "ratioPresets": [
              "4 / 5",
              "3 / 4",
              "1 / 1"
            ],
            "roleId": "detailImage",
            "sizePresets": [
              "small",
              "standard"
            ],
            "zoom": {
              "max": 1.5,
              "min": 1,
              "step": 0.05
            }
          }
        ],
        "textRoles": [
          {
            "align": [
              "left",
              "center"
            ],
            "colorTokens": [
              "ink",
              "mineral",
              "ivory"
            ],
            "maxLines": 6,
            "roleId": "copy",
            "sizePresets": [
              "small",
              "standard",
              "large"
            ]
          }
        ]
      },
      "primaryTask": "media"
    },
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content"
    },
    "key": "doublePoster",
    "master": "editorial-story",
    "media": [
      {
        "desktopRatio": "3 / 2",
        "key": "mainImage",
        "mobileRatio": "3 / 2",
        "required": true
      },
      {
        "desktopRatio": "4 / 5",
        "key": "detailImage",
        "mobileRatio": "4 / 5",
        "required": true
      }
    ],
    "moduleType": "双图海报",
    "order": {
      "desktop": [
        "mainImage",
        "detailImage",
        "copy",
        "action"
      ],
      "mobile": [
        "mainImage",
        "copy",
        "detailImage",
        "action"
      ]
    },
    "presets": [],
    "preview": {
      "desktop": {
        "order": [
          "mainImage",
          "detailImage",
          "copy",
          "action"
        ],
        "tone": "light",
        "zones": [
          {
            "column": 1,
            "role": "mainMedia",
            "roleId": "mainImage",
            "row": 1,
            "rowSpan": 6,
            "span": 8
          },
          {
            "column": 9,
            "role": "detailMedia",
            "roleId": "detailImage",
            "row": 2,
            "rowSpan": 3,
            "span": 4
          },
          {
            "column": 9,
            "role": "copy",
            "roleId": "copy",
            "row": 5,
            "rowSpan": 2,
            "span": 4
          },
          {
            "column": 9,
            "role": "action",
            "roleId": "action",
            "row": 8,
            "rowSpan": 1,
            "span": 3
          }
        ]
      },
      "mobile": {
        "order": [
          "mainImage",
          "copy",
          "detailImage",
          "action"
        ],
        "tone": "light",
        "zones": [
          {
            "column": 1,
            "role": "mainMedia",
            "roleId": "mainImage",
            "row": 1,
            "rowSpan": 3,
            "span": 12
          },
          {
            "column": 1,
            "role": "copy",
            "roleId": "copy",
            "row": 4,
            "rowSpan": 2,
            "span": 12
          },
          {
            "column": 5,
            "role": "detailMedia",
            "roleId": "detailImage",
            "row": 6,
            "rowSpan": 2,
            "span": 8
          },
          {
            "column": 1,
            "role": "action",
            "roleId": "action",
            "row": 8,
            "rowSpan": 1,
            "span": 5
          }
        ]
      },
      "purpose": "主图、细节图与说明的章节节奏",
      "visualRole": "feature-stage"
    },
    "roles": [
      {
        "allowedRatioPresetsByViewport": {
          "desktop": [
            "3 / 2",
            "16 / 9"
          ],
          "mobile": [
            "3 / 2",
            "16 / 9"
          ]
        },
        "assetClass": "editorial",
        "defaultRatioByViewport": {
          "desktop": "3 / 2",
          "mobile": "3 / 2"
        },
        "id": "mainImage",
        "kind": "media",
        "required": true,
        "role": "mainMedia"
      },
      {
        "allowedRatioPresetsByViewport": {
          "desktop": [
            "4 / 5",
            "1 / 1"
          ],
          "mobile": [
            "4 / 5",
            "1 / 1"
          ]
        },
        "assetClass": "editorial",
        "defaultRatioByViewport": {
          "desktop": "4 / 5",
          "mobile": "4 / 5"
        },
        "id": "detailImage",
        "kind": "media",
        "required": true,
        "role": "detailMedia"
      },
      {
        "id": "copy",
        "kind": "text",
        "required": false,
        "role": "copy"
      },
      {
        "id": "action",
        "kind": "action",
        "required": false,
        "role": "action"
      }
    ],
    "spacingPolicy": [
      "normal"
    ],
    "supportsLinkTarget": true,
    "version": 2,
    "visualRole": "feature-stage",
    "visualWeight": "feature-stage",
    "width": "wide"
  },
  "featuredProduct": {
    "allowedControls": [],
    "contentBudget": {
      "limits": {},
      "maxCtas": 1,
      "requiredText": []
    },
    "copyPlacementByViewport": {
      "desktop": "stacked",
      "mobile": "stacked"
    },
    "displayName": "单品展示",
    "editorCapabilities": {
      "editableObjects": [
        {
          "capabilities": [
            "content",
            "reference",
            "layout",
            "layer",
            "ratio",
            "size",
            "fit"
          ],
          "contentFieldKeys": [
            "productCode"
          ],
          "kind": "product",
          "referenceFieldKey": "productCode",
          "responsive": {
            "content": "shared",
            "fit": "shared",
            "layer": "viewport-specific",
            "layout": "viewport-specific",
            "ratio": "shared",
            "reference": "shared",
            "size": "shared"
          },
          "roleId": "product"
        },
        {
          "capabilities": [
            "content"
          ],
          "contentFieldKeys": [
            "eyebrow",
            "title",
            "summary"
          ],
          "kind": "text",
          "responsive": {
            "content": "shared"
          },
          "roleId": "copy"
        },
        {
          "capabilities": [
            "content",
            "link"
          ],
          "contentFieldKeys": [
            "primaryText",
            "secondaryText",
            "secondaryTargetType",
            "secondaryProductId",
            "secondaryLinkUrl"
          ],
          "kind": "action",
          "nodeIds": [
            "action",
            "primaryText",
            "secondaryText"
          ],
          "responsive": {
            "content": "shared",
            "link": "shared"
          },
          "roleId": "action"
        },
        {
          "capabilities": [
            "content"
          ],
          "contentFieldKeys": [
            "showPrice"
          ],
          "kind": "collection",
          "responsive": {
            "content": "shared"
          },
          "roleId": "list"
        }
      ],
      "layoutOverrides": {
        "compositionPresets": [
          "image-left",
          "image-right"
        ],
        "slots": [
          {
            "fieldKey": "productCode",
            "fit": [
              "cover",
              "contain"
            ],
            "ratioPresets": [
              "4 / 5",
              "1 / 1"
            ],
            "roleId": "product",
            "sizePresets": [
              "standard",
              "large"
            ]
          }
        ]
      },
      "primaryTask": "product",
      "referenceFields": [
        {
          "key": "productCode",
          "kind": "product",
          "legacyKey": "productId",
          "max": 1,
          "min": 1
        }
      ]
    },
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content"
    },
    "key": "featuredProduct",
    "master": "product-focus",
    "media": [
      {
        "desktopRatio": "4 / 5",
        "key": "product",
        "mobileRatio": "4 / 5",
        "required": false
      }
    ],
    "moduleType": "单品焦点推荐",
    "order": {
      "desktop": [
        "product",
        "copy",
        "list",
        "action"
      ],
      "mobile": [
        "product",
        "copy",
        "list",
        "action"
      ]
    },
    "presets": [],
    "preview": {
      "desktop": {
        "order": [
          "product",
          "copy",
          "list",
          "action"
        ],
        "tone": "light",
        "zones": [
          {
            "column": 3,
            "role": "media",
            "roleId": "product",
            "row": 1,
            "rowSpan": 5,
            "span": 8
          },
          {
            "column": 3,
            "role": "copy",
            "roleId": "copy",
            "row": 6,
            "rowSpan": 1,
            "span": 8
          },
          {
            "column": 4,
            "role": "list",
            "roleId": "list",
            "row": 7,
            "rowSpan": 1,
            "span": 6
          },
          {
            "column": 4,
            "role": "action",
            "roleId": "action",
            "row": 8,
            "rowSpan": 1,
            "span": 6
          }
        ]
      },
      "mobile": {
        "order": [
          "product",
          "copy",
          "list",
          "action"
        ],
        "tone": "light",
        "zones": [
          {
            "column": 1,
            "role": "media",
            "roleId": "product",
            "row": 1,
            "rowSpan": 4,
            "span": 12
          },
          {
            "column": 1,
            "role": "copy",
            "roleId": "copy",
            "row": 5,
            "rowSpan": 1,
            "span": 12
          },
          {
            "column": 1,
            "role": "list",
            "roleId": "list",
            "row": 6,
            "rowSpan": 1,
            "span": 12
          },
          {
            "column": 1,
            "role": "action",
            "roleId": "action",
            "row": 7,
            "rowSpan": 1,
            "span": 5
          }
        ]
      },
      "purpose": "单件主推商品与关键信息",
      "visualRole": "feature-stage"
    },
    "roles": [
      {
        "allowedRatioPresetsByViewport": {
          "desktop": [
            "4 / 5",
            "1 / 1"
          ],
          "mobile": [
            "4 / 5",
            "1 / 1"
          ]
        },
        "assetClass": "product",
        "defaultRatioByViewport": {
          "desktop": "4 / 5",
          "mobile": "4 / 5"
        },
        "id": "product",
        "kind": "media",
        "required": false,
        "role": "media"
      },
      {
        "id": "copy",
        "kind": "text",
        "required": false,
        "role": "copy"
      },
      {
        "id": "list",
        "kind": "collection",
        "required": false,
        "role": "list"
      },
      {
        "id": "action",
        "kind": "action",
        "required": false,
        "role": "action"
      }
    ],
    "spacingPolicy": [
      "normal"
    ],
    "supportsLinkTarget": true,
    "version": 2,
    "visualRole": "feature-stage",
    "visualWeight": "feature-stage",
    "width": "wide"
  },
  "fullBleed": {
    "allowedControls": [],
    "contentBudget": {
      "limits": {
        "altText": 80,
        "buttonText": 12,
        "eyebrow": 60,
        "subtitle": 48,
        "title": 24
      },
      "maxCtas": 1,
      "requiredText": []
    },
    "copyPlacementByViewport": {
      "desktop": "stacked",
      "mobile": "stacked"
    },
    "displayName": "通栏图",
    "editorCapabilities": {
      "editableObjects": [
        {
          "altFieldKey": "altText",
          "capabilities": [
            "content",
            "layout",
            "layer",
            "ratio",
            "fit",
            "zoom",
            "focus"
          ],
          "contentFieldKeys": [
            "image",
            "altText"
          ],
          "fieldScopes": {
            "altText": "shared",
            "image": "viewport-specific"
          },
          "kind": "media",
          "responsive": {
            "content": "shared",
            "fit": "shared",
            "focus": "viewport-specific",
            "layer": "viewport-specific",
            "layout": "viewport-specific",
            "ratio": "shared",
            "zoom": "shared"
          },
          "roleId": "image"
        },
        {
          "altFieldKey": "altText",
          "capabilities": [
            "content",
            "layout",
            "layer",
            "ratio",
            "fit",
            "zoom",
            "focus"
          ],
          "contentFieldKeys": [
            "mobileImage",
            "altText"
          ],
          "fieldScopes": {
            "altText": "shared",
            "mobileImage": "viewport-specific"
          },
          "kind": "media",
          "responsive": {
            "content": "shared",
            "fit": "shared",
            "focus": "viewport-specific",
            "layer": "viewport-specific",
            "layout": "viewport-specific",
            "ratio": "shared",
            "zoom": "shared"
          },
          "roleId": "mobileImage"
        },
        {
          "capabilities": [
            "content",
            "layout",
            "layer",
            "visibility",
            "typography"
          ],
          "contentFieldKeys": [
            "eyebrow",
            "title",
            "subtitle"
          ],
          "kind": "text",
          "responsive": {
            "content": "shared",
            "layer": "viewport-specific",
            "layout": "viewport-specific",
            "typography": "shared",
            "visibility": "shared"
          },
          "roleId": "copy"
        },
        {
          "capabilities": [
            "content",
            "link"
          ],
          "contentFieldKeys": [
            "buttonText",
            "targetType",
            "productId",
            "linkUrl"
          ],
          "kind": "action",
          "nodeIds": [
            "action",
            "buttonText"
          ],
          "responsive": {
            "content": "shared",
            "link": "shared"
          },
          "roleId": "action"
        }
      ],
      "layoutOverrides": {
        "framePresets": [
          "standard",
          "immersive"
        ],
        "slots": [
          {
            "fit": [
              "cover",
              "contain"
            ],
            "focusByViewport": true,
            "ratioPresets": [
              "16 / 9",
              "3 / 2"
            ],
            "roleId": "image",
            "zoom": {
              "max": 1.5,
              "min": 1,
              "step": 0.05
            }
          },
          {
            "fit": [
              "cover",
              "contain"
            ],
            "focusByViewport": true,
            "ratioPresets": [
              "4 / 5",
              "3 / 4"
            ],
            "roleId": "mobileImage",
            "zoom": {
              "max": 1.5,
              "min": 1,
              "step": 0.05
            }
          }
        ],
        "textRoles": [
          {
            "align": [
              "left",
              "center"
            ],
            "colorTokens": [
              "ink",
              "ivory"
            ],
            "maxLines": 4,
            "placementPresets": [
              "overlay",
              "below"
            ],
            "requiresSafeBand": true,
            "roleId": "copy",
            "sizePresets": [
              "small",
              "standard",
              "large"
            ],
            "widthPresets": [
              "narrow",
              "standard"
            ]
          }
        ]
      },
      "primaryTask": "media"
    },
    "flow": "bleed",
    "heightModeByViewport": {
      "desktop": "ratio",
      "mobile": "ratio"
    },
    "key": "fullBleed",
    "master": "immersive-image",
    "media": [
      {
        "desktopRatio": "21 / 6",
        "key": "image",
        "required": true
      },
      {
        "key": "mobileImage",
        "mobileRatio": "4 / 5",
        "required": false
      }
    ],
    "moduleType": "全屏出血图",
    "order": {
      "desktop": [
        "image",
        "copy",
        "action"
      ],
      "mobile": [
        "mobileImage",
        "copy",
        "action"
      ]
    },
    "presets": [],
    "preview": {
      "desktop": {
        "order": [
          "image",
          "copy",
          "action"
        ],
        "tone": "light",
        "zones": [
          {
            "column": 1,
            "role": "media",
            "roleId": "image",
            "row": 1,
            "rowSpan": 4,
            "span": 12
          },
          {
            "column": 1,
            "role": "copy",
            "roleId": "copy",
            "row": 5,
            "rowSpan": 2,
            "span": 8
          },
          {
            "column": 10,
            "role": "action",
            "roleId": "action",
            "row": 7,
            "rowSpan": 1,
            "span": 3
          }
        ]
      },
      "mobile": {
        "order": [
          "mobileImage",
          "copy",
          "action"
        ],
        "tone": "light",
        "zones": [
          {
            "column": 1,
            "role": "media",
            "roleId": "mobileImage",
            "row": 1,
            "rowSpan": 4,
            "span": 12
          },
          {
            "column": 1,
            "role": "copy",
            "roleId": "copy",
            "row": 5,
            "rowSpan": 2,
            "span": 12
          },
          {
            "column": 1,
            "role": "action",
            "roleId": "action",
            "row": 7,
            "rowSpan": 1,
            "span": 5
          }
        ]
      },
      "purpose": "低于首屏的通栏章节影像",
      "visualRole": "support-stage"
    },
    "roles": [
      {
        "allowedRatioPresetsByViewport": {
          "desktop": [
            "21 / 6"
          ]
        },
        "appliesTo": [
          "desktop"
        ],
        "assetClass": "editorial",
        "defaultRatioByViewport": {
          "desktop": "21 / 6"
        },
        "id": "image",
        "kind": "media",
        "required": true,
        "role": "media"
      },
      {
        "allowedRatioPresetsByViewport": {
          "mobile": [
            "4 / 5"
          ]
        },
        "appliesTo": [
          "mobile"
        ],
        "assetClass": "editorial",
        "defaultRatioByViewport": {
          "mobile": "4 / 5"
        },
        "fallbackRoleId": "image",
        "id": "mobileImage",
        "kind": "media",
        "required": false,
        "role": "media"
      },
      {
        "id": "copy",
        "kind": "text",
        "required": false,
        "role": "copy"
      },
      {
        "id": "action",
        "kind": "action",
        "required": false,
        "role": "action"
      }
    ],
    "spacingPolicy": [
      "normal"
    ],
    "supportsLinkTarget": true,
    "version": 2,
    "visualRole": "support-stage",
    "visualWeight": "support-stage",
    "width": "full"
  },
  "gallery": {
    "allowedControls": [],
    "contentBudget": {
      "limits": {},
      "maxCtas": 0,
      "requiredText": []
    },
    "copyPlacementByViewport": {
      "desktop": "stacked",
      "mobile": "stacked"
    },
    "displayName": "作品画廊",
    "editorCapabilities": {
      "editableObjects": [
        {
          "capabilities": [
            "content",
            "items",
            "layout",
            "layer",
            "ratio",
            "fit",
            "zoom"
          ],
          "collectionFieldKeys": [
            "items"
          ],
          "contentFieldKeys": [
            "items"
          ],
          "kind": "collection",
          "responsive": {
            "content": "shared",
            "fit": "shared",
            "items": "shared",
            "layer": "viewport-specific",
            "layout": "viewport-specific",
            "ratio": "shared",
            "zoom": "shared"
          },
          "roleId": "works"
        },
        {
          "capabilities": [
            "content"
          ],
          "contentFieldKeys": [
            "title",
            "subtitle"
          ],
          "kind": "text",
          "responsive": {
            "content": "shared"
          },
          "roleId": "copy"
        }
      ],
      "layoutOverrides": {
        "compositionPresets": [
          "editorial",
          "balanced"
        ],
        "slots": [
          {
            "fieldKey": "items",
            "fit": [
              "cover"
            ],
            "ratioPresets": [
              "4 / 5",
              "1 / 1",
              "3 / 2"
            ],
            "roleId": "works",
            "zoom": {
              "max": 1.4,
              "min": 1,
              "step": 0.05
            }
          }
        ]
      },
      "primaryTask": "media"
    },
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content"
    },
    "key": "gallery",
    "master": "asymmetric-gallery",
    "media": [],
    "moduleType": "作品画廊",
    "order": {
      "desktop": [
        "copy",
        "works"
      ],
      "mobile": [
        "copy",
        "works"
      ]
    },
    "presets": [],
    "preview": {
      "desktop": {
        "order": [
          "copy",
          "works"
        ],
        "rows": 10,
        "tone": "light",
        "zones": [
          {
            "column": 1,
            "role": "copy",
            "roleId": "copy",
            "row": 1,
            "rowSpan": 1,
            "span": 5
          },
          {
            "column": 1,
            "role": "mainMedia",
            "roleId": "works",
            "row": 3,
            "rowSpan": 4,
            "span": 7
          },
          {
            "column": 8,
            "role": "detailMedia",
            "roleId": "works",
            "row": 3,
            "rowSpan": 2,
            "span": 5
          },
          {
            "column": 8,
            "role": "media",
            "roleId": "works",
            "row": 5,
            "rowSpan": 2,
            "span": 5
          },
          {
            "column": 1,
            "role": "media",
            "roleId": "works",
            "row": 8,
            "rowSpan": 2,
            "span": 12
          }
        ]
      },
      "mobile": {
        "order": [
          "copy",
          "works"
        ],
        "rows": 10,
        "tone": "light",
        "zones": [
          {
            "column": 1,
            "role": "copy",
            "roleId": "copy",
            "row": 1,
            "rowSpan": 1,
            "span": 12
          },
          {
            "column": 1,
            "role": "mainMedia",
            "roleId": "works",
            "row": 2,
            "rowSpan": 3,
            "span": 12
          },
          {
            "column": 1,
            "role": "detailMedia",
            "roleId": "works",
            "row": 5,
            "rowSpan": 2,
            "span": 12
          },
          {
            "column": 1,
            "role": "media",
            "roleId": "works",
            "row": 7,
            "rowSpan": 2,
            "span": 12
          },
          {
            "column": 1,
            "role": "media",
            "roleId": "works",
            "row": 9,
            "rowSpan": 2,
            "span": 12
          }
        ]
      },
      "purpose": "大图→双图→大图的作品节奏",
      "visualRole": "feature-stage"
    },
    "roles": [
      {
        "allowedRatioPresetsByViewport": {
          "desktop": [
            "4 / 5",
            "1 / 1",
            "3 / 2"
          ],
          "mobile": [
            "4 / 5",
            "1 / 1",
            "3 / 2"
          ]
        },
        "assetClass": "product",
        "defaultRatioByViewport": {
          "desktop": "4 / 5",
          "mobile": "4 / 5"
        },
        "id": "works",
        "kind": "collection",
        "previewRoles": [
          "media",
          "mainMedia",
          "detailMedia"
        ],
        "quantity": {
          "default": 5,
          "max": 7,
          "min": 3
        },
        "required": false,
        "role": "media",
        "semantic": "gallery-media-collection"
      },
      {
        "id": "copy",
        "kind": "text",
        "required": false,
        "role": "copy"
      }
    ],
    "spacingPolicy": [
      "normal"
    ],
    "supportsLinkTarget": true,
    "version": 2,
    "visualRole": "feature-stage",
    "visualWeight": "feature-stage",
    "width": "full"
  },
  "hero": {
    "allowedControls": [
      "alignment"
    ],
    "contentBudget": {
      "limits": {
        "actionText": 12,
        "altText": 80,
        "eyebrow": 60,
        "subtitle": 48,
        "title": 24
      },
      "maxCtas": 1,
      "requiredText": []
    },
    "copyPlacementByViewport": {
      "desktop": "overlay",
      "mobile": "stacked"
    },
    "displayName": "首屏",
    "editorCapabilities": {
      "editableObjects": [
        {
          "altFieldKey": "altText",
          "capabilities": [
            "content",
            "layout",
            "layer",
            "ratio",
            "fit",
            "zoom",
            "focus"
          ],
          "contentFieldKeys": [
            "desktopImage",
            "altText"
          ],
          "fieldScopes": {
            "altText": "shared",
            "desktopImage": "viewport-specific"
          },
          "kind": "media",
          "responsive": {
            "content": "shared",
            "fit": "shared",
            "focus": "viewport-specific",
            "layer": "viewport-specific",
            "layout": "viewport-specific",
            "ratio": "shared",
            "zoom": "shared"
          },
          "roleId": "desktopImage"
        },
        {
          "altFieldKey": "altText",
          "capabilities": [
            "content",
            "layout",
            "layer",
            "ratio",
            "fit",
            "zoom",
            "focus"
          ],
          "contentFieldKeys": [
            "mobileImage",
            "altText"
          ],
          "fieldScopes": {
            "altText": "shared",
            "mobileImage": "viewport-specific"
          },
          "kind": "media",
          "responsive": {
            "content": "shared",
            "fit": "shared",
            "focus": "viewport-specific",
            "layer": "viewport-specific",
            "layout": "viewport-specific",
            "ratio": "shared",
            "zoom": "shared"
          },
          "roleId": "mobileImage"
        },
        {
          "capabilities": [
            "content",
            "layout",
            "layer",
            "visibility",
            "typography"
          ],
          "contentFieldKeys": [
            "eyebrow",
            "title",
            "subtitle"
          ],
          "kind": "text",
          "nodeIds": [
            "copy",
            "eyebrow",
            "title",
            "subtitle"
          ],
          "responsive": {
            "content": "shared",
            "layer": "viewport-specific",
            "layout": "viewport-specific",
            "typography": "shared",
            "visibility": "shared"
          },
          "roleId": "copy"
        },
        {
          "capabilities": [
            "content",
            "link",
            "layout",
            "layer",
            "visibility",
            "typography"
          ],
          "contentFieldKeys": [
            "actionText",
            "targetType",
            "productId",
            "linkUrl"
          ],
          "kind": "action",
          "nodeIds": [
            "action",
            "actionText"
          ],
          "responsive": {
            "content": "shared",
            "layer": "viewport-specific",
            "layout": "viewport-specific",
            "link": "shared",
            "typography": "shared",
            "visibility": "shared"
          },
          "roleId": "action"
        }
      ],
      "layoutOverrides": {
        "framePresets": [
          "compact",
          "standard",
          "immersive"
        ],
        "frameRatioPresets": [
          "21 / 9",
          "16 / 9",
          "3 / 2",
          "4 / 5"
        ],
        "frameRatioRange": {
          "max": 2.4,
          "min": 0.8,
          "step": 0.05
        },
        "slots": [
          {
            "fit": [
              "cover",
              "contain"
            ],
            "focusByViewport": true,
            "ratioPresets": [
              "16 / 9",
              "3 / 2"
            ],
            "roleId": "desktopImage",
            "zoom": {
              "max": 2.5,
              "min": 1,
              "step": 0.05
            }
          },
          {
            "fit": [
              "cover",
              "contain"
            ],
            "focusByViewport": true,
            "ratioPresets": [
              "4 / 5",
              "3 / 4"
            ],
            "roleId": "mobileImage",
            "zoom": {
              "max": 2.5,
              "min": 1,
              "step": 0.05
            }
          }
        ],
        "textRoles": [
          {
            "align": [
              "left",
              "center",
              "right"
            ],
            "colorTokens": [
              "ink",
              "ivory"
            ],
            "maxLines": 2,
            "placementPresets": [
              "left",
              "center",
              "right"
            ],
            "requiresSafeBand": true,
            "roleId": "eyebrow",
            "sizePresets": [
              "small",
              "standard"
            ],
            "widthPresets": [
              "narrow",
              "standard"
            ]
          },
          {
            "align": [
              "left",
              "center",
              "right"
            ],
            "colorTokens": [
              "ink",
              "ivory"
            ],
            "maxLines": 3,
            "placementPresets": [
              "left",
              "center",
              "right"
            ],
            "requiresSafeBand": true,
            "roleId": "title",
            "sizePresets": [
              "small",
              "standard",
              "large"
            ],
            "widthPresets": [
              "narrow",
              "standard",
              "wide"
            ]
          },
          {
            "align": [
              "left",
              "center",
              "right"
            ],
            "colorTokens": [
              "ink",
              "ivory"
            ],
            "maxLines": 4,
            "placementPresets": [
              "left",
              "center",
              "right"
            ],
            "requiresSafeBand": true,
            "roleId": "subtitle",
            "sizePresets": [
              "small",
              "standard",
              "large"
            ],
            "widthPresets": [
              "narrow",
              "standard",
              "wide"
            ]
          },
          {
            "align": [
              "left",
              "center",
              "right"
            ],
            "colorTokens": [
              "ink",
              "ivory"
            ],
            "maxLines": 1,
            "placementPresets": [
              "left",
              "center",
              "right"
            ],
            "requiresSafeBand": true,
            "roleId": "actionText",
            "sizePresets": [
              "small",
              "standard"
            ],
            "widthPresets": [
              "narrow",
              "standard"
            ]
          }
        ]
      },
      "primaryTask": "media"
    },
    "flow": "bleed",
    "heightModeByViewport": {
      "desktop": "viewport",
      "mobile": "content"
    },
    "key": "hero",
    "master": "cinematic-hero",
    "media": [
      {
        "desktopRatio": "16 / 9",
        "key": "desktopImage",
        "required": true
      },
      {
        "key": "mobileImage",
        "mobileRatio": "4 / 5",
        "required": false
      }
    ],
    "moduleType": "首屏主视觉",
    "order": {
      "desktop": [
        "desktopImage",
        "copy",
        "action"
      ],
      "mobile": [
        "mobileImage",
        "copy",
        "action"
      ]
    },
    "presets": [],
    "preview": {
      "desktop": {
        "order": [
          "desktopImage",
          "copy",
          "action"
        ],
        "tone": "light",
        "zones": [
          {
            "column": 1,
            "role": "media",
            "roleId": "desktopImage",
            "row": 1,
            "rowSpan": 8,
            "span": 12
          },
          {
            "column": 5,
            "overlay": true,
            "role": "eyebrow",
            "roleId": "copy",
            "row": 4.2,
            "rowSpan": 0.7,
            "span": 4
          },
          {
            "column": 4,
            "overlay": true,
            "role": "title",
            "roleId": "copy",
            "row": 5,
            "rowSpan": 1.3,
            "span": 6
          },
          {
            "column": 4.5,
            "overlay": true,
            "role": "subtitle",
            "roleId": "copy",
            "row": 6.4,
            "rowSpan": 0.7,
            "span": 5
          },
          {
            "column": 5,
            "overlay": true,
            "role": "action",
            "roleId": "action",
            "row": 7.4,
            "rowSpan": 0.7,
            "span": 3
          }
        ]
      },
      "mobile": {
        "order": [
          "mobileImage",
          "copy",
          "action"
        ],
        "tone": "light",
        "zones": [
          {
            "column": 1,
            "role": "media",
            "roleId": "mobileImage",
            "row": 1,
            "rowSpan": 4,
            "span": 12
          },
          {
            "column": 1,
            "role": "copy",
            "roleId": "copy",
            "row": 5,
            "rowSpan": 2,
            "span": 12
          },
          {
            "column": 1,
            "role": "action",
            "roleId": "action",
            "row": 7,
            "rowSpan": 1,
            "span": 5
          }
        ]
      },
      "purpose": "品牌首屏与最高视觉权重舞台",
      "visualRole": "primary-stage"
    },
    "roles": [
      {
        "allowedRatioPresetsByViewport": {
          "desktop": [
            "16 / 9"
          ]
        },
        "appliesTo": [
          "desktop"
        ],
        "assetClass": "editorial",
        "defaultRatioByViewport": {
          "desktop": "16 / 9"
        },
        "id": "desktopImage",
        "kind": "media",
        "required": true,
        "role": "media"
      },
      {
        "allowedRatioPresetsByViewport": {
          "mobile": [
            "4 / 5"
          ]
        },
        "appliesTo": [
          "mobile"
        ],
        "assetClass": "editorial",
        "defaultRatioByViewport": {
          "mobile": "4 / 5"
        },
        "fallbackRoleId": "desktopImage",
        "id": "mobileImage",
        "kind": "media",
        "required": false,
        "role": "media"
      },
      {
        "id": "copy",
        "kind": "text",
        "previewRoles": [
          "copy",
          "eyebrow",
          "title",
          "subtitle"
        ],
        "required": false,
        "role": "copy"
      },
      {
        "id": "action",
        "kind": "action",
        "required": false,
        "role": "action"
      }
    ],
    "spacingPolicy": [
      "normal"
    ],
    "supportsLinkTarget": true,
    "version": 2,
    "visualRole": "primary-stage",
    "visualWeight": "primary-stage",
    "width": "full"
  },
  "hotspot": {
    "allowedControls": [],
    "contentBudget": {
      "limits": {
        "altText": 80
      },
      "maxCtas": 0,
      "requiredText": [
        "altText"
      ]
    },
    "copyPlacementByViewport": {
      "desktop": "stacked",
      "mobile": "stacked"
    },
    "displayName": "图片热区",
    "editorCapabilities": {
      "editableObjects": [
        {
          "altFieldKey": "altText",
          "altPolicy": "required",
          "capabilities": [
            "content",
            "layout",
            "layer",
            "ratio",
            "fit",
            "zoom",
            "focus"
          ],
          "contentFieldKeys": [
            "image",
            "mobileImage",
            "altText"
          ],
          "fieldScopes": {
            "altText": "shared",
            "image": "viewport-specific",
            "mobileImage": "viewport-specific"
          },
          "kind": "media",
          "responsive": {
            "content": "shared",
            "fit": "shared",
            "focus": "viewport-specific",
            "layer": "viewport-specific",
            "layout": "viewport-specific",
            "ratio": "shared",
            "zoom": "shared"
          },
          "roleId": "sceneImage"
        },
        {
          "capabilities": [
            "content",
            "items",
            "link"
          ],
          "collectionFieldKeys": [
            "hotspots",
            "mobileHotspots"
          ],
          "contentFieldKeys": [
            "hotspots",
            "mobileHotspots"
          ],
          "fieldScopes": {
            "hotspots": "viewport-specific",
            "mobileHotspots": "viewport-specific"
          },
          "kind": "collection",
          "responsive": {
            "content": "shared",
            "items": "viewport-specific",
            "link": "shared"
          },
          "roleId": "hotspots"
        }
      ],
      "layoutOverrides": {
        "slots": [
          {
            "fieldKey": "image",
            "fit": [
              "cover",
              "contain"
            ],
            "focusByViewport": true,
            "ratioPresets": [
              "16 / 9",
              "3 / 2",
              "4 / 5"
            ],
            "roleId": "sceneImage",
            "zoom": {
              "max": 1.4,
              "min": 1,
              "step": 0.05
            }
          }
        ]
      },
      "primaryTask": "media"
    },
    "flow": "bleed",
    "heightModeByViewport": {
      "desktop": "ratio",
      "mobile": "ratio"
    },
    "key": "hotspot",
    "master": "hotspot-stage",
    "media": [
      {
        "desktopRatio": "16 / 9",
        "key": "sceneImage",
        "mobileRatio": "4 / 5",
        "required": true
      }
    ],
    "moduleType": "热区图",
    "order": {
      "desktop": [
        "sceneImage",
        "hotspots",
        "copy"
      ],
      "mobile": [
        "sceneImage",
        "hotspots",
        "copy"
      ]
    },
    "presets": [
      "hotspotEditor"
    ],
    "preview": {
      "desktop": {
        "order": [
          "sceneImage",
          "hotspots",
          "copy"
        ],
        "tone": "light",
        "zones": [
          {
            "column": 1,
            "role": "media",
            "roleId": "sceneImage",
            "row": 1,
            "rowSpan": 6,
            "span": 12
          },
          {
            "column": 3,
            "kind": "hotspot",
            "overlay": true,
            "role": "marker",
            "roleId": "hotspots",
            "row": 3,
            "rowSpan": 1,
            "span": 1
          },
          {
            "column": 7,
            "kind": "hotspot",
            "overlay": true,
            "role": "marker",
            "roleId": "hotspots",
            "row": 4,
            "rowSpan": 1,
            "span": 1
          },
          {
            "column": 10,
            "kind": "hotspot",
            "overlay": true,
            "role": "marker",
            "roleId": "hotspots",
            "row": 2,
            "rowSpan": 1,
            "span": 1
          },
          {
            "column": 2,
            "role": "copy",
            "roleId": "copy",
            "row": 7,
            "rowSpan": 1,
            "span": 5
          }
        ]
      },
      "mobile": {
        "order": [
          "sceneImage",
          "hotspots",
          "copy"
        ],
        "tone": "light",
        "zones": [
          {
            "column": 1,
            "role": "media",
            "roleId": "sceneImage",
            "row": 1,
            "rowSpan": 6,
            "span": 12
          },
          {
            "column": 3,
            "kind": "hotspot",
            "overlay": true,
            "role": "marker",
            "roleId": "hotspots",
            "row": 2,
            "rowSpan": 1,
            "span": 1
          },
          {
            "column": 8,
            "kind": "hotspot",
            "overlay": true,
            "role": "marker",
            "roleId": "hotspots",
            "row": 4,
            "rowSpan": 1,
            "span": 1
          },
          {
            "column": 6,
            "kind": "hotspot",
            "overlay": true,
            "role": "marker",
            "roleId": "hotspots",
            "row": 5,
            "rowSpan": 1,
            "span": 1
          },
          {
            "column": 1,
            "role": "copy",
            "roleId": "copy",
            "row": 7,
            "rowSpan": 1,
            "span": 12
          }
        ]
      },
      "purpose": "底图内热点与导览说明",
      "visualRole": "feature-stage"
    },
    "roles": [
      {
        "allowedRatioPresetsByViewport": {
          "desktop": [
            "16 / 9"
          ],
          "mobile": [
            "4 / 5"
          ]
        },
        "assetClass": "product",
        "defaultRatioByViewport": {
          "desktop": "16 / 9",
          "mobile": "4 / 5"
        },
        "id": "sceneImage",
        "kind": "media",
        "required": true,
        "role": "media"
      },
      {
        "allowedRatioPresetsByViewport": {
          "desktop": [
            "21 / 6"
          ],
          "mobile": [
            "4 / 5"
          ]
        },
        "defaultRatioByViewport": {
          "desktop": "21 / 6",
          "mobile": "4 / 5"
        },
        "id": "hotspots",
        "kind": "marker",
        "parentRole": "sceneImage",
        "positioning": "relative-to-media",
        "quantity": {
          "default": 3,
          "max": 6,
          "min": 1
        },
        "required": true,
        "role": "marker"
      },
      {
        "id": "copy",
        "kind": "text",
        "required": false,
        "role": "copy"
      }
    ],
    "spacingPolicy": [
      "normal"
    ],
    "supportsLinkTarget": true,
    "version": 2,
    "visualRole": "feature-stage",
    "visualWeight": "feature-stage",
    "width": "full"
  },
  "journey": {
    "allowedControls": [],
    "contentBudget": {
      "limits": {},
      "maxCtas": 0,
      "requiredText": []
    },
    "copyPlacementByViewport": {
      "desktop": "stacked",
      "mobile": "stacked"
    },
    "displayName": "内容流程",
    "editorCapabilities": {
      "editableObjects": [
        {
          "capabilities": [
            "content",
            "items"
          ],
          "collectionFieldKeys": [
            "steps"
          ],
          "contentFieldKeys": [
            "steps"
          ],
          "kind": "collection",
          "responsive": {
            "content": "shared",
            "items": "shared"
          },
          "roleId": "steps"
        },
        {
          "capabilities": [
            "content"
          ],
          "contentFieldKeys": [
            "title",
            "subtitle"
          ],
          "kind": "text",
          "responsive": {
            "content": "shared"
          },
          "roleId": "copy"
        }
      ],
      "layoutOverrides": {
        "framePresets": [
          "standard",
          "spacious"
        ]
      },
      "primaryTask": "structured"
    },
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content"
    },
    "key": "journey",
    "master": "editorial-journey",
    "media": [],
    "moduleType": "定制流程",
    "order": {
      "desktop": [
        "copy",
        "steps"
      ],
      "mobile": [
        "copy",
        "steps"
      ]
    },
    "presets": [],
    "preview": {
      "desktop": {
        "order": [
          "copy",
          "steps"
        ],
        "tone": "light",
        "zones": [
          {
            "column": 1,
            "role": "copy",
            "roleId": "copy",
            "row": 1,
            "rowSpan": 2,
            "span": 5
          },
          {
            "column": 1,
            "kind": "steps-5",
            "role": "timeline",
            "roleId": "steps",
            "row": 4,
            "rowSpan": 3,
            "span": 12
          }
        ]
      },
      "mobile": {
        "order": [
          "copy",
          "steps"
        ],
        "tone": "light",
        "zones": [
          {
            "column": 1,
            "role": "copy",
            "roleId": "copy",
            "row": 1,
            "rowSpan": 2,
            "span": 12
          },
          {
            "column": 1,
            "kind": "steps-5",
            "role": "timeline",
            "roleId": "steps",
            "row": 3,
            "rowSpan": 5,
            "span": 12
          }
        ]
      },
      "purpose": "01–05 编号叙事流程",
      "visualRole": "support-stage"
    },
    "roles": [
      {
        "allowedRatioPresetsByViewport": {
          "desktop": [
            "1 / 1"
          ],
          "mobile": [
            "1 / 1"
          ]
        },
        "assetClass": "craft",
        "defaultRatioByViewport": {
          "desktop": "1 / 1",
          "mobile": "1 / 1"
        },
        "id": "steps",
        "kind": "collection",
        "quantity": {
          "default": 5,
          "max": 5,
          "min": 3
        },
        "required": false,
        "role": "timeline"
      },
      {
        "id": "copy",
        "kind": "text",
        "required": false,
        "role": "copy"
      }
    ],
    "spacingPolicy": [
      "normal"
    ],
    "supportsLinkTarget": true,
    "version": 2,
    "visualRole": "support-stage",
    "visualWeight": "support-stage",
    "width": "wide"
  },
  "limitedEvent": {
    "allowedControls": [],
    "contentBudget": {
      "limits": {},
      "maxCtas": 1,
      "requiredText": []
    },
    "copyPlacementByViewport": {
      "desktop": "overlay",
      "mobile": "stacked"
    },
    "displayName": "限时活动",
    "editorCapabilities": {
      "editableObjects": [
        {
          "altPolicy": "derived",
          "capabilities": [
            "content",
            "layout",
            "layer",
            "ratio",
            "fit",
            "zoom"
          ],
          "contentFieldKeys": [
            "eventImage"
          ],
          "kind": "media",
          "responsive": {
            "content": "shared",
            "fit": "shared",
            "layer": "viewport-specific",
            "layout": "viewport-specific",
            "ratio": "shared",
            "zoom": "shared"
          },
          "roleId": "event"
        },
        {
          "capabilities": [
            "content",
            "items"
          ],
          "collectionFieldKeys": [
            "benefits"
          ],
          "contentFieldKeys": [
            "targetDate",
            "benefits"
          ],
          "kind": "collection",
          "responsive": {
            "content": "shared",
            "items": "shared"
          },
          "roleId": "time"
        },
        {
          "capabilities": [
            "content",
            "layout",
            "layer",
            "visibility",
            "typography"
          ],
          "contentFieldKeys": [
            "eyebrow",
            "title",
            "body"
          ],
          "kind": "text",
          "responsive": {
            "content": "shared",
            "layer": "viewport-specific",
            "layout": "viewport-specific",
            "typography": "shared",
            "visibility": "shared"
          },
          "roleId": "copy"
        },
        {
          "capabilities": [
            "content",
            "link"
          ],
          "contentFieldKeys": [
            "buttonText",
            "targetType",
            "productId",
            "linkUrl"
          ],
          "kind": "action",
          "nodeIds": [
            "action",
            "buttonText"
          ],
          "responsive": {
            "content": "shared",
            "link": "shared"
          },
          "roleId": "action"
        }
      ],
      "layoutOverrides": {
        "framePresets": [
          "standard",
          "immersive"
        ],
        "slots": [
          {
            "fieldKey": "eventImage",
            "fit": [
              "cover",
              "contain"
            ],
            "ratioPresets": [
              "16 / 9",
              "3 / 2",
              "4 / 5"
            ],
            "roleId": "event",
            "zoom": {
              "max": 1.4,
              "min": 1,
              "step": 0.05
            }
          }
        ],
        "textRoles": [
          {
            "align": [
              "left",
              "center"
            ],
            "colorTokens": [
              "ink",
              "ivory"
            ],
            "maxLines": 5,
            "placementPresets": [
              "overlay",
              "below"
            ],
            "requiresSafeBand": true,
            "roleId": "copy",
            "sizePresets": [
              "small",
              "standard",
              "large"
            ],
            "widthPresets": [
              "narrow",
              "standard"
            ]
          }
        ]
      },
      "primaryTask": "media"
    },
    "flow": "bleed",
    "heightModeByViewport": {
      "desktop": "ratio",
      "mobile": "content"
    },
    "key": "limitedEvent",
    "master": "event-stage",
    "media": [
      {
        "desktopRatio": "16 / 9",
        "key": "event",
        "mobileRatio": "4 / 5",
        "required": false
      }
    ],
    "moduleType": "限时活动",
    "order": {
      "desktop": [
        "event",
        "time",
        "copy",
        "action"
      ],
      "mobile": [
        "event",
        "time",
        "copy",
        "action"
      ]
    },
    "presets": [],
    "preview": {
      "desktop": {
        "order": [
          "event",
          "time",
          "copy",
          "action"
        ],
        "tone": "dark",
        "zones": [
          {
            "column": 1,
            "role": "media",
            "roleId": "event",
            "row": 1,
            "rowSpan": 7,
            "span": 12
          },
          {
            "column": 2,
            "kind": "countdown",
            "overlay": true,
            "role": "marker",
            "roleId": "time",
            "row": 2,
            "rowSpan": 1,
            "span": 3
          },
          {
            "column": 2,
            "overlay": true,
            "role": "copy",
            "roleId": "copy",
            "row": 4,
            "rowSpan": 2,
            "span": 6
          },
          {
            "column": 2,
            "overlay": true,
            "role": "action",
            "roleId": "action",
            "row": 7,
            "rowSpan": 1,
            "span": 3
          }
        ]
      },
      "mobile": {
        "order": [
          "event",
          "time",
          "copy",
          "action"
        ],
        "tone": "light",
        "zones": [
          {
            "column": 1,
            "role": "media",
            "roleId": "event",
            "row": 1,
            "rowSpan": 4,
            "span": 12
          },
          {
            "column": 1,
            "kind": "countdown",
            "role": "marker",
            "roleId": "time",
            "row": 5,
            "rowSpan": 1,
            "span": 4
          },
          {
            "column": 1,
            "role": "copy",
            "roleId": "copy",
            "row": 6,
            "rowSpan": 1,
            "span": 12
          },
          {
            "column": 1,
            "role": "action",
            "roleId": "action",
            "row": 8,
            "rowSpan": 1,
            "span": 5
          }
        ]
      },
      "purpose": "活动影像、时间状态、权益文字与行动",
      "visualRole": "feature-stage"
    },
    "roles": [
      {
        "allowedRatioPresetsByViewport": {
          "desktop": [
            "16 / 9"
          ],
          "mobile": [
            "4 / 5"
          ]
        },
        "assetClass": "editorial",
        "defaultRatioByViewport": {
          "desktop": "16 / 9",
          "mobile": "4 / 5"
        },
        "id": "event",
        "kind": "media",
        "required": false,
        "role": "media"
      },
      {
        "allowedRatioPresetsByViewport": {},
        "defaultRatioByViewport": {},
        "id": "time",
        "kind": "marker",
        "required": false,
        "role": "marker"
      },
      {
        "id": "copy",
        "kind": "text",
        "required": false,
        "role": "copy"
      },
      {
        "id": "action",
        "kind": "action",
        "required": false,
        "role": "action"
      }
    ],
    "spacingPolicy": [
      "normal"
    ],
    "supportsLinkTarget": true,
    "version": 2,
    "visualRole": "feature-stage",
    "visualWeight": "feature-stage",
    "width": "full"
  },
  "productRow": {
    "allowedControls": [],
    "contentBudget": {
      "limits": {},
      "maxCtas": 0,
      "requiredText": []
    },
    "copyPlacementByViewport": {
      "desktop": "stacked",
      "mobile": "stacked"
    },
    "displayName": "商品列表",
    "editorCapabilities": {
      "editableObjects": [
        {
          "capabilities": [
            "content",
            "reference",
            "layout",
            "layer",
            "ratio",
            "fit"
          ],
          "contentFieldKeys": [
            "productCodes"
          ],
          "kind": "product",
          "referenceFieldKey": "productCodes",
          "responsive": {
            "content": "shared",
            "fit": "shared",
            "layer": "viewport-specific",
            "layout": "viewport-specific",
            "ratio": "shared",
            "reference": "shared"
          },
          "roleId": "productCards"
        },
        {
          "capabilities": [
            "content"
          ],
          "contentFieldKeys": [
            "title",
            "subtitle"
          ],
          "kind": "text",
          "responsive": {
            "content": "shared"
          },
          "roleId": "copy"
        }
      ],
      "layoutOverrides": {
        "compositionPresets": [
          "grid-2",
          "grid-3",
          "grid-4"
        ],
        "slots": [
          {
            "fieldKey": "productCodes",
            "fit": [
              "cover",
              "contain"
            ],
            "ratioPresets": [
              "4 / 5",
              "1 / 1",
              "3 / 4"
            ],
            "roleId": "productCards"
          }
        ]
      },
      "primaryTask": "product",
      "referenceFields": [
        {
          "key": "productCodes",
          "kind": "product",
          "legacyKey": "productIds",
          "max": 8,
          "min": 2
        }
      ]
    },
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content"
    },
    "key": "productRow",
    "master": "product-grid",
    "media": [],
    "moduleType": "产品展示行",
    "order": {
      "desktop": [
        "copy",
        "productCards"
      ],
      "mobile": [
        "copy",
        "productCards"
      ]
    },
    "presetValues": {
      "columns": {
        "allowedByViewport": {
          "desktop": [
            2,
            3,
            4
          ],
          "mobile": [
            1,
            2
          ]
        },
        "defaultByViewport": {
          "desktop": 3,
          "mobile": 2
        }
      }
    },
    "presets": [
      "columnPreset",
      "ordering",
      "productSelection"
    ],
    "preview": {
      "desktop": {
        "order": [
          "copy",
          "productCards"
        ],
        "tone": "light",
        "zones": [
          {
            "column": 1,
            "role": "copy",
            "roleId": "copy",
            "row": 1,
            "rowSpan": 1,
            "span": 5
          },
          {
            "column": 1,
            "role": "card",
            "roleId": "productCards",
            "row": 3,
            "rowSpan": 4,
            "span": 4
          },
          {
            "column": 5,
            "role": "card",
            "roleId": "productCards",
            "row": 3,
            "rowSpan": 4,
            "span": 4
          },
          {
            "column": 9,
            "role": "card",
            "roleId": "productCards",
            "row": 3,
            "rowSpan": 4,
            "span": 4
          }
        ]
      },
      "mobile": {
        "order": [
          "copy",
          "productCards"
        ],
        "tone": "light",
        "zones": [
          {
            "column": 1,
            "role": "copy",
            "roleId": "copy",
            "row": 1,
            "rowSpan": 1,
            "span": 12
          },
          {
            "column": 1,
            "role": "card",
            "roleId": "productCards",
            "row": 2,
            "rowSpan": 2,
            "span": 12
          },
          {
            "column": 1,
            "role": "card",
            "roleId": "productCards",
            "row": 4,
            "rowSpan": 2,
            "span": 12
          },
          {
            "column": 1,
            "role": "card",
            "roleId": "productCards",
            "row": 6,
            "rowSpan": 2,
            "span": 12
          }
        ]
      },
      "purpose": "默认三列商品浏览与标题",
      "visualRole": "support-stage"
    },
    "roles": [
      {
        "allowedRatioPresetsByViewport": {
          "desktop": [
            "4 / 5",
            "1 / 1"
          ],
          "mobile": [
            "4 / 5",
            "1 / 1"
          ]
        },
        "assetClass": "product",
        "defaultRatioByViewport": {
          "desktop": "4 / 5",
          "mobile": "4 / 5"
        },
        "id": "productCards",
        "kind": "business",
        "quantity": {
          "default": 3,
          "max": 8,
          "min": 2
        },
        "required": true,
        "role": "card"
      },
      {
        "id": "copy",
        "kind": "text",
        "required": false,
        "role": "copy"
      }
    ],
    "spacingPolicy": [
      "normal"
    ],
    "supportsLinkTarget": true,
    "version": 2,
    "visualRole": "feature-stage",
    "visualWeight": "feature-stage",
    "width": "full"
  },
  "sceneShopping": {
    "allowedControls": [],
    "contentBudget": {
      "limits": {},
      "maxCtas": 0,
      "requiredText": []
    },
    "copyPlacementByViewport": {
      "desktop": "stacked",
      "mobile": "stacked"
    },
    "displayName": "场景入口",
    "editorCapabilities": {
      "editableObjects": [
        {
          "capabilities": [
            "content",
            "items",
            "layout",
            "layer",
            "ratio",
            "fit"
          ],
          "collectionFieldKeys": [
            "categories"
          ],
          "contentFieldKeys": [
            "categories"
          ],
          "kind": "collection",
          "responsive": {
            "content": "shared",
            "fit": "shared",
            "items": "shared",
            "layer": "viewport-specific",
            "layout": "viewport-specific",
            "ratio": "shared"
          },
          "roleId": "scenes"
        },
        {
          "capabilities": [
            "content"
          ],
          "contentFieldKeys": [
            "title",
            "subtitle"
          ],
          "kind": "text",
          "responsive": {
            "content": "shared"
          },
          "roleId": "copy"
        }
      ],
      "layoutOverrides": {
        "compositionPresets": [
          "grid-2",
          "grid-3",
          "grid-4"
        ],
        "slots": [
          {
            "fieldKey": "categories",
            "fit": [
              "cover"
            ],
            "ratioPresets": [
              "4 / 5",
              "1 / 1"
            ],
            "roleId": "scenes"
          }
        ]
      },
      "primaryTask": "structured"
    },
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content"
    },
    "key": "sceneShopping",
    "master": "scene-navigation",
    "media": [],
    "moduleType": "按场景选购",
    "order": {
      "desktop": [
        "copy",
        "scenes"
      ],
      "mobile": [
        "copy",
        "scenes"
      ]
    },
    "presets": [],
    "preview": {
      "desktop": {
        "order": [
          "copy",
          "scenes"
        ],
        "tone": "light",
        "zones": [
          {
            "column": 1,
            "role": "copy",
            "roleId": "copy",
            "row": 1,
            "rowSpan": 1,
            "span": 12
          },
          {
            "column": 1,
            "role": "card",
            "roleId": "scenes",
            "row": 3,
            "rowSpan": 3,
            "span": 3
          },
          {
            "column": 4,
            "role": "card",
            "roleId": "scenes",
            "row": 3,
            "rowSpan": 3,
            "span": 3
          },
          {
            "column": 7,
            "role": "card",
            "roleId": "scenes",
            "row": 3,
            "rowSpan": 3,
            "span": 3
          },
          {
            "column": 10,
            "role": "card",
            "roleId": "scenes",
            "row": 3,
            "rowSpan": 3,
            "span": 3
          }
        ]
      },
      "mobile": {
        "order": [
          "copy",
          "scenes"
        ],
        "tone": "light",
        "zones": [
          {
            "column": 1,
            "role": "copy",
            "roleId": "copy",
            "row": 1,
            "rowSpan": 1,
            "span": 12
          },
          {
            "column": 1,
            "role": "card",
            "roleId": "scenes",
            "row": 2,
            "rowSpan": 1,
            "span": 12
          },
          {
            "column": 1,
            "role": "card",
            "roleId": "scenes",
            "row": 3,
            "rowSpan": 1,
            "span": 12
          },
          {
            "column": 1,
            "role": "card",
            "roleId": "scenes",
            "row": 4,
            "rowSpan": 1,
            "span": 12
          },
          {
            "column": 1,
            "role": "card",
            "roleId": "scenes",
            "row": 5,
            "rowSpan": 1,
            "span": 12
          }
        ]
      },
      "purpose": "四个选购场景入口",
      "visualRole": "support-stage"
    },
    "roles": [
      {
        "allowedRatioPresetsByViewport": {
          "desktop": [
            "4 / 5",
            "1 / 1"
          ],
          "mobile": [
            "4 / 5",
            "1 / 1"
          ]
        },
        "assetClass": "editorial",
        "defaultRatioByViewport": {
          "desktop": "4 / 5",
          "mobile": "4 / 5"
        },
        "id": "scenes",
        "kind": "collection",
        "quantity": {
          "default": 3,
          "max": 4,
          "min": 2
        },
        "required": false,
        "role": "card"
      },
      {
        "id": "copy",
        "kind": "text",
        "required": false,
        "role": "copy"
      }
    ],
    "spacingPolicy": [
      "normal"
    ],
    "supportsLinkTarget": true,
    "version": 2,
    "visualRole": "support-stage",
    "visualWeight": "support-stage",
    "width": "wide"
  },
  "servicePromises": {
    "allowedControls": [],
    "contentBudget": {
      "limits": {},
      "maxCtas": 0,
      "requiredText": []
    },
    "copyPlacementByViewport": {
      "desktop": "stacked",
      "mobile": "stacked"
    },
    "displayName": "服务承诺",
    "editorCapabilities": {
      "editableObjects": [
        {
          "capabilities": [
            "content",
            "items"
          ],
          "collectionFieldKeys": [
            "cards"
          ],
          "contentFieldKeys": [
            "cards"
          ],
          "kind": "collection",
          "responsive": {
            "content": "shared",
            "items": "shared"
          },
          "roleId": "promises"
        },
        {
          "capabilities": [
            "content"
          ],
          "contentFieldKeys": [
            "title",
            "subtitle"
          ],
          "kind": "text",
          "responsive": {
            "content": "shared"
          },
          "roleId": "copy"
        }
      ],
      "layoutOverrides": {
        "compositionPresets": [
          "grid-2",
          "grid-4"
        ],
        "framePresets": [
          "compact",
          "standard"
        ]
      },
      "primaryTask": "structured"
    },
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content"
    },
    "key": "servicePromises",
    "master": "service-policy",
    "media": [],
    "moduleType": "服务承诺",
    "order": {
      "desktop": [
        "copy",
        "promises"
      ],
      "mobile": [
        "copy",
        "promises"
      ]
    },
    "presets": [],
    "preview": {
      "desktop": {
        "order": [
          "copy",
          "promises"
        ],
        "tone": "light",
        "zones": [
          {
            "column": 1,
            "role": "copy",
            "roleId": "copy",
            "row": 1,
            "rowSpan": 1,
            "span": 5
          },
          {
            "column": 1,
            "role": "list",
            "roleId": "promises",
            "row": 3,
            "rowSpan": 3,
            "span": 3
          },
          {
            "column": 4,
            "role": "list",
            "roleId": "promises",
            "row": 3,
            "rowSpan": 3,
            "span": 3
          },
          {
            "column": 7,
            "role": "list",
            "roleId": "promises",
            "row": 3,
            "rowSpan": 3,
            "span": 3
          },
          {
            "column": 10,
            "role": "list",
            "roleId": "promises",
            "row": 3,
            "rowSpan": 3,
            "span": 3
          }
        ]
      },
      "mobile": {
        "order": [
          "copy",
          "promises"
        ],
        "tone": "light",
        "zones": [
          {
            "column": 1,
            "role": "copy",
            "roleId": "copy",
            "row": 1,
            "rowSpan": 1,
            "span": 12
          },
          {
            "column": 1,
            "role": "list",
            "roleId": "promises",
            "row": 2,
            "rowSpan": 1,
            "span": 12
          },
          {
            "column": 1,
            "role": "list",
            "roleId": "promises",
            "row": 3,
            "rowSpan": 1,
            "span": 12
          },
          {
            "column": 1,
            "role": "list",
            "roleId": "promises",
            "row": 4,
            "rowSpan": 1,
            "span": 12
          },
          {
            "column": 1,
            "role": "list",
            "roleId": "promises",
            "row": 5,
            "rowSpan": 1,
            "span": 12
          }
        ]
      },
      "purpose": "四项服务承诺清单",
      "visualRole": "support-stage"
    },
    "roles": [
      {
        "allowedRatioPresetsByViewport": {},
        "defaultRatioByViewport": {},
        "id": "promises",
        "kind": "collection",
        "quantity": {
          "default": 4,
          "max": 4,
          "min": 3
        },
        "required": false,
        "role": "list"
      },
      {
        "id": "copy",
        "kind": "text",
        "required": false,
        "role": "copy"
      }
    ],
    "spacingPolicy": [
      "normal"
    ],
    "supportsLinkTarget": true,
    "version": 2,
    "visualRole": "support-stage",
    "visualWeight": "support-stage",
    "width": "full"
  },
  "singlePoster": {
    "allowedControls": [
      "template"
    ],
    "contentBudget": {
      "limits": {
        "actionText": 12,
        "altText": 80,
        "label": 16,
        "number": 4,
        "subtitle": 48,
        "title": 24
      },
      "maxCtas": 1,
      "requiredText": []
    },
    "copyPlacementByViewport": {
      "desktop": "split",
      "mobile": "stacked"
    },
    "displayName": "单图文",
    "editorCapabilities": {
      "editableObjects": [
        {
          "altFieldKey": "altText",
          "capabilities": [
            "content",
            "layout",
            "layer",
            "ratio",
            "fit",
            "zoom",
            "focus"
          ],
          "contentFieldKeys": [
            "desktopImage",
            "altText"
          ],
          "fieldScopes": {
            "altText": "shared",
            "desktopImage": "viewport-specific"
          },
          "kind": "media",
          "responsive": {
            "content": "shared",
            "fit": "shared",
            "focus": "viewport-specific",
            "layer": "viewport-specific",
            "layout": "viewport-specific",
            "ratio": "shared",
            "zoom": "shared"
          },
          "roleId": "desktopImage"
        },
        {
          "altFieldKey": "altText",
          "capabilities": [
            "content",
            "layout",
            "layer",
            "ratio",
            "fit",
            "zoom",
            "focus"
          ],
          "contentFieldKeys": [
            "mobileImage",
            "altText"
          ],
          "fieldScopes": {
            "altText": "shared",
            "mobileImage": "viewport-specific"
          },
          "kind": "media",
          "responsive": {
            "content": "shared",
            "fit": "shared",
            "focus": "viewport-specific",
            "layer": "viewport-specific",
            "layout": "viewport-specific",
            "ratio": "shared",
            "zoom": "shared"
          },
          "roleId": "mobileImage"
        },
        {
          "capabilities": [
            "content",
            "layout",
            "layer",
            "visibility",
            "typography"
          ],
          "contentFieldKeys": [
            "title",
            "subtitle",
            "number",
            "label"
          ],
          "kind": "text",
          "responsive": {
            "content": "shared",
            "layer": "viewport-specific",
            "layout": "viewport-specific",
            "typography": "shared",
            "visibility": "shared"
          },
          "roleId": "copy"
        },
        {
          "capabilities": [
            "content",
            "link"
          ],
          "contentFieldKeys": [
            "actionText",
            "targetType",
            "productId",
            "linkUrl"
          ],
          "kind": "action",
          "nodeIds": [
            "action",
            "actionText"
          ],
          "responsive": {
            "content": "shared",
            "link": "shared"
          },
          "roleId": "action"
        }
      ],
      "layoutOverrides": {
        "framePresets": [
          "compact",
          "standard",
          "tall"
        ],
        "slots": [
          {
            "fit": [
              "cover",
              "contain"
            ],
            "focusByViewport": true,
            "ratioPresets": [
              "4 / 5",
              "3 / 4",
              "1 / 1"
            ],
            "roleId": "desktopImage",
            "zoom": {
              "max": 1.6,
              "min": 1,
              "step": 0.05
            }
          },
          {
            "fit": [
              "cover",
              "contain"
            ],
            "focusByViewport": true,
            "ratioPresets": [
              "4 / 5",
              "3 / 4"
            ],
            "roleId": "mobileImage",
            "zoom": {
              "max": 1.6,
              "min": 1,
              "step": 0.05
            }
          }
        ],
        "textRoles": [
          {
            "align": [
              "left",
              "center",
              "right"
            ],
            "colorTokens": [
              "ink",
              "ivory"
            ],
            "maxLines": 4,
            "placementPresets": [
              "left",
              "center",
              "right"
            ],
            "requiresSafeBand": true,
            "roleId": "copy",
            "sizePresets": [
              "small",
              "standard",
              "large"
            ],
            "widthPresets": [
              "narrow",
              "standard"
            ]
          }
        ]
      },
      "primaryTask": "media"
    },
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content"
    },
    "key": "singlePoster",
    "master": "editorial-split",
    "media": [
      {
        "desktopRatio": "4 / 5",
        "key": "desktopImage",
        "required": true
      },
      {
        "key": "mobileImage",
        "mobileRatio": "4 / 5",
        "required": false
      }
    ],
    "moduleType": "单图海报",
    "order": {
      "desktop": [
        "desktopImage",
        "copy",
        "action"
      ],
      "mobile": [
        "mobileImage",
        "copy",
        "action"
      ]
    },
    "presets": [],
    "preview": {
      "desktop": {
        "order": [
          "desktopImage",
          "copy",
          "action"
        ],
        "tone": "light",
        "zones": [
          {
            "column": 4,
            "role": "media",
            "roleId": "desktopImage",
            "row": 1,
            "rowSpan": 8,
            "span": 9
          },
          {
            "column": 1,
            "role": "eyebrow",
            "roleId": "copy",
            "row": 4.8,
            "rowSpan": 0.7,
            "span": 2.5
          },
          {
            "column": 1,
            "role": "title",
            "roleId": "copy",
            "row": 5.5,
            "rowSpan": 1.6,
            "span": 2.5
          },
          {
            "column": 1,
            "role": "subtitle",
            "roleId": "copy",
            "row": 7.1,
            "rowSpan": 0.7,
            "span": 2.5
          },
          {
            "column": 1,
            "role": "action",
            "roleId": "action",
            "row": 7.8,
            "rowSpan": 0.6,
            "span": 2
          }
        ]
      },
      "mobile": {
        "order": [
          "mobileImage",
          "copy",
          "action"
        ],
        "tone": "light",
        "zones": [
          {
            "column": 1,
            "role": "media",
            "roleId": "mobileImage",
            "row": 1,
            "rowSpan": 5,
            "span": 12
          },
          {
            "column": 2,
            "overlay": true,
            "role": "copy",
            "roleId": "copy",
            "row": 2,
            "rowSpan": 2,
            "span": 10
          },
          {
            "column": 4,
            "overlay": true,
            "role": "action",
            "roleId": "action",
            "row": 4,
            "rowSpan": 1,
            "span": 5
          }
        ]
      },
      "purpose": "单一主图与编辑式章节叙事",
      "visualRole": "feature-stage"
    },
    "roles": [
      {
        "allowedRatioPresetsByViewport": {
          "desktop": [
            "4 / 5",
            "1 / 1",
            "3 / 2"
          ]
        },
        "appliesTo": [
          "desktop"
        ],
        "assetClass": "editorial",
        "defaultRatioByViewport": {
          "desktop": "4 / 5"
        },
        "id": "desktopImage",
        "kind": "media",
        "required": true,
        "role": "media"
      },
      {
        "allowedRatioPresetsByViewport": {
          "mobile": [
            "4 / 5",
            "1 / 1",
            "3 / 2"
          ]
        },
        "appliesTo": [
          "mobile"
        ],
        "assetClass": "editorial",
        "defaultRatioByViewport": {
          "mobile": "4 / 5"
        },
        "fallbackRoleId": "desktopImage",
        "id": "mobileImage",
        "kind": "media",
        "required": false,
        "role": "media"
      },
      {
        "id": "copy",
        "kind": "text",
        "previewRoles": [
          "copy",
          "eyebrow",
          "title",
          "subtitle"
        ],
        "required": false,
        "role": "copy"
      },
      {
        "id": "action",
        "kind": "action",
        "required": false,
        "role": "action"
      }
    ],
    "spacingPolicy": [
      "normal"
    ],
    "supportsLinkTarget": true,
    "version": 2,
    "visualRole": "feature-stage",
    "visualWeight": "feature-stage",
    "width": "standard"
  },
  "storeInfo": {
    "allowedControls": [],
    "contentBudget": {
      "limits": {},
      "maxCtas": 1,
      "requiredText": []
    },
    "copyPlacementByViewport": {
      "desktop": "stacked",
      "mobile": "stacked"
    },
    "displayName": "门店信息",
    "editorCapabilities": {
      "editableObjects": [
        {
          "altPolicy": "derived",
          "capabilities": [
            "content",
            "layout",
            "layer",
            "ratio",
            "fit",
            "zoom"
          ],
          "contentFieldKeys": [
            "image"
          ],
          "kind": "media",
          "responsive": {
            "content": "shared",
            "fit": "shared",
            "layer": "viewport-specific",
            "layout": "viewport-specific",
            "ratio": "shared",
            "zoom": "shared"
          },
          "roleId": "store"
        },
        {
          "capabilities": [
            "content"
          ],
          "contentFieldKeys": [
            "useSiteSettings",
            "storeName",
            "address",
            "hours",
            "phone"
          ],
          "fieldScopes": {
            "address": "shared",
            "hours": "shared",
            "phone": "shared",
            "storeName": "shared",
            "useSiteSettings": "shared"
          },
          "kind": "collection",
          "responsive": {
            "content": "shared"
          },
          "roleId": "details"
        },
        {
          "capabilities": [
            "content"
          ],
          "contentFieldKeys": [
            "storeName"
          ],
          "kind": "text",
          "responsive": {
            "content": "shared"
          },
          "roleId": "copy"
        },
        {
          "capabilities": [
            "content",
            "link"
          ],
          "contentFieldKeys": [
            "mapUrl",
            "phone"
          ],
          "kind": "action",
          "responsive": {
            "content": "shared",
            "link": "shared"
          },
          "roleId": "action"
        }
      ],
      "layoutOverrides": {
        "compositionPresets": [
          "image-left",
          "image-right"
        ],
        "slots": [
          {
            "fieldKey": "image",
            "fit": [
              "cover",
              "contain"
            ],
            "ratioPresets": [
              "3 / 2",
              "4 / 5"
            ],
            "roleId": "store",
            "zoom": {
              "max": 1.4,
              "min": 1,
              "step": 0.05
            }
          }
        ]
      },
      "primaryTask": "structured"
    },
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content"
    },
    "key": "storeInfo",
    "master": "store-visit",
    "media": [
      {
        "desktopRatio": "3 / 2",
        "key": "store",
        "mobileRatio": "3 / 2",
        "required": false
      }
    ],
    "moduleType": "门店信息",
    "order": {
      "desktop": [
        "store",
        "copy",
        "details",
        "action"
      ],
      "mobile": [
        "store",
        "copy",
        "details",
        "action"
      ]
    },
    "presets": [],
    "preview": {
      "desktop": {
        "order": [
          "store",
          "copy",
          "details",
          "action"
        ],
        "tone": "light",
        "zones": [
          {
            "column": 1,
            "role": "media",
            "roleId": "store",
            "row": 1,
            "rowSpan": 6,
            "span": 7
          },
          {
            "column": 9,
            "role": "copy",
            "roleId": "copy",
            "row": 1,
            "rowSpan": 1,
            "span": 4
          },
          {
            "column": 9,
            "role": "list",
            "roleId": "details",
            "row": 3,
            "rowSpan": 2,
            "span": 4
          },
          {
            "column": 9,
            "role": "action",
            "roleId": "action",
            "row": 6,
            "rowSpan": 1,
            "span": 3
          }
        ]
      },
      "mobile": {
        "order": [
          "store",
          "copy",
          "details",
          "action"
        ],
        "tone": "light",
        "zones": [
          {
            "column": 1,
            "role": "media",
            "roleId": "store",
            "row": 1,
            "rowSpan": 4,
            "span": 12
          },
          {
            "column": 1,
            "role": "copy",
            "roleId": "copy",
            "row": 5,
            "rowSpan": 1,
            "span": 12
          },
          {
            "column": 1,
            "role": "list",
            "roleId": "details",
            "row": 6,
            "rowSpan": 1,
            "span": 12
          },
          {
            "column": 1,
            "role": "action",
            "roleId": "action",
            "row": 7,
            "rowSpan": 1,
            "span": 5
          }
        ]
      },
      "purpose": "门店影像、地址服务与到店行动",
      "visualRole": "feature-stage"
    },
    "roles": [
      {
        "allowedRatioPresetsByViewport": {
          "desktop": [
            "3 / 2",
            "16 / 9"
          ],
          "mobile": [
            "3 / 2",
            "4 / 5"
          ]
        },
        "assetClass": "service",
        "defaultRatioByViewport": {
          "desktop": "3 / 2",
          "mobile": "3 / 2"
        },
        "id": "store",
        "kind": "media",
        "required": false,
        "role": "media"
      },
      {
        "allowedRatioPresetsByViewport": {},
        "defaultRatioByViewport": {},
        "id": "details",
        "kind": "collection",
        "required": false,
        "role": "list"
      },
      {
        "id": "copy",
        "kind": "text",
        "required": false,
        "role": "copy"
      },
      {
        "id": "action",
        "kind": "action",
        "required": false,
        "role": "action"
      }
    ],
    "spacingPolicy": [
      "normal"
    ],
    "supportsLinkTarget": true,
    "version": 2,
    "visualRole": "feature-stage",
    "visualWeight": "feature-stage",
    "width": "full"
  },
  "testimonials": {
    "allowedControls": [],
    "contentBudget": {
      "limits": {},
      "maxCtas": 0,
      "requiredText": []
    },
    "copyPlacementByViewport": {
      "desktop": "stacked",
      "mobile": "stacked"
    },
    "displayName": "顾客分享",
    "editorCapabilities": {
      "editableObjects": [
        {
          "capabilities": [
            "content",
            "items",
            "layout",
            "layer",
            "ratio",
            "fit",
            "zoom"
          ],
          "collectionFieldKeys": [
            "testimonials"
          ],
          "contentFieldKeys": [
            "testimonials"
          ],
          "kind": "collection",
          "nodeIds": [
            "authorizedPhoto",
            "mainQuote",
            "attribution"
          ],
          "responsive": {
            "content": "shared",
            "fit": "shared",
            "items": "shared",
            "layer": "viewport-specific",
            "layout": "viewport-specific",
            "ratio": "shared",
            "zoom": "shared"
          },
          "roleId": "authorizedPhoto"
        }
      ],
      "layoutOverrides": {
        "compositionPresets": [
          "editorial",
          "balanced"
        ],
        "slots": [
          {
            "fieldKey": "testimonials",
            "fit": [
              "cover"
            ],
            "ratioPresets": [
              "4 / 5",
              "1 / 1"
            ],
            "roleId": "authorizedPhoto",
            "zoom": {
              "max": 1.4,
              "min": 1,
              "step": 0.05
            }
          }
        ]
      },
      "primaryTask": "structured"
    },
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content"
    },
    "key": "testimonials",
    "master": "testimonial-proof",
    "media": [
      {
        "desktopRatio": "4 / 5",
        "key": "authorizedPhoto",
        "mobileRatio": "4 / 5",
        "required": true
      }
    ],
    "moduleType": "真实评价与实拍",
    "order": {
      "desktop": [
        "authorizedPhoto",
        "mainQuote",
        "attribution"
      ],
      "mobile": [
        "authorizedPhoto",
        "mainQuote",
        "attribution"
      ]
    },
    "presets": [],
    "preview": {
      "desktop": {
        "order": [
          "authorizedPhoto",
          "mainQuote",
          "attribution"
        ],
        "tone": "light",
        "zones": [
          {
            "column": 1,
            "role": "media",
            "roleId": "authorizedPhoto",
            "row": 2,
            "rowSpan": 6,
            "span": 5
          },
          {
            "column": 7,
            "role": "quote",
            "roleId": "mainQuote",
            "row": 3,
            "rowSpan": 3,
            "span": 6
          },
          {
            "column": 7,
            "role": "quote",
            "roleId": "attribution",
            "row": 6,
            "rowSpan": 1,
            "span": 4
          }
        ]
      },
      "mobile": {
        "order": [
          "authorizedPhoto",
          "mainQuote",
          "attribution"
        ],
        "tone": "light",
        "zones": [
          {
            "column": 1,
            "role": "media",
            "roleId": "authorizedPhoto",
            "row": 1,
            "rowSpan": 4,
            "span": 12
          },
          {
            "column": 1,
            "role": "quote",
            "roleId": "mainQuote",
            "row": 5,
            "rowSpan": 2,
            "span": 12
          },
          {
            "column": 1,
            "role": "quote",
            "roleId": "attribution",
            "row": 7,
            "rowSpan": 1,
            "span": 8
          }
        ]
      },
      "purpose": "授权实拍图片与主引语关系",
      "visualRole": "support-stage"
    },
    "roles": [
      {
        "allowedRatioPresetsByViewport": {
          "desktop": [
            "4 / 5",
            "1 / 1",
            "3 / 2"
          ],
          "mobile": [
            "4 / 5",
            "1 / 1",
            "3 / 2"
          ]
        },
        "assetClass": "service",
        "defaultRatioByViewport": {
          "desktop": "4 / 5",
          "mobile": "4 / 5"
        },
        "id": "authorizedPhoto",
        "kind": "media",
        "proof": "authorized-customer-photo",
        "publicationAttestation": {
          "fieldKey": "authorizationConfirmed",
          "label": "已取得顾客公开展示的书面授权"
        },
        "quantity": {
          "default": 1,
          "max": 3,
          "min": 1
        },
        "required": true,
        "role": "media",
        "semantic": "authorized-customer-photo"
      },
      {
        "id": "mainQuote",
        "kind": "text",
        "relation": "pairs-with:authorizedPhoto",
        "required": true,
        "role": "quote",
        "semantic": "primary-quote"
      },
      {
        "id": "attribution",
        "kind": "text",
        "relation": "attribution-for:mainQuote",
        "required": false,
        "role": "quote",
        "semantic": "quote-attribution"
      }
    ],
    "spacingPolicy": [
      "normal"
    ],
    "supportsLinkTarget": true,
    "version": 2,
    "visualRole": "support-stage",
    "visualWeight": "support-stage",
    "width": "wide"
  },
  "textBanner": {
    "allowedControls": [
      "template",
      "spacing"
    ],
    "contentBudget": {
      "limits": {
        "body": 180,
        "buttonText": 12,
        "eyebrow": 16,
        "title": 32
      },
      "maxCtas": 1,
      "requiredText": []
    },
    "copyPlacementByViewport": {
      "desktop": "stacked",
      "mobile": "stacked"
    },
    "displayName": "纯文字",
    "editorCapabilities": {
      "editableObjects": [
        {
          "altPolicy": "decorative",
          "capabilities": [
            "content"
          ],
          "contentFieldKeys": [
            "bgImage"
          ],
          "kind": "media",
          "responsive": {
            "content": "shared"
          },
          "roleId": "bgImage"
        },
        {
          "capabilities": [
            "content",
            "layout",
            "layer",
            "visibility",
            "typography"
          ],
          "contentFieldKeys": [
            "eyebrow",
            "title",
            "body"
          ],
          "kind": "text",
          "responsive": {
            "content": "shared",
            "layer": "viewport-specific",
            "layout": "viewport-specific",
            "typography": "shared",
            "visibility": "shared"
          },
          "roleId": "copy"
        },
        {
          "capabilities": [
            "content",
            "link"
          ],
          "contentFieldKeys": [
            "buttonText",
            "targetType",
            "productId",
            "linkUrl"
          ],
          "kind": "action",
          "nodeIds": [
            "action",
            "buttonText"
          ],
          "responsive": {
            "content": "shared",
            "link": "shared"
          },
          "roleId": "action"
        }
      ],
      "layoutOverrides": {
        "framePresets": [
          "compact",
          "standard",
          "spacious"
        ],
        "textRoles": [
          {
            "align": [
              "left",
              "center"
            ],
            "colorTokens": [
              "ink",
              "mineral",
              "ivory"
            ],
            "maxLines": 6,
            "placementPresets": [
              "left",
              "center"
            ],
            "roleId": "copy",
            "sizePresets": [
              "small",
              "standard",
              "large"
            ],
            "widthPresets": [
              "narrow",
              "standard",
              "wide"
            ]
          }
        ]
      },
      "primaryTask": "text"
    },
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content"
    },
    "key": "textBanner",
    "master": "editorial-text",
    "media": [
      {
        "desktopRatio": "21 / 6",
        "key": "bgImage",
        "required": false
      }
    ],
    "moduleType": "文字横幅",
    "order": {
      "desktop": [
        "bgImage",
        "copy",
        "action"
      ],
      "mobile": [
        "bgImage",
        "copy",
        "action"
      ]
    },
    "presets": [],
    "preview": {
      "desktop": {
        "order": [
          "copy",
          "action"
        ],
        "tone": "light",
        "zones": [
          {
            "column": 5,
            "role": "eyebrow",
            "roleId": "copy",
            "row": 3.6,
            "rowSpan": 0.7,
            "span": 4
          },
          {
            "column": 3,
            "role": "title",
            "roleId": "copy",
            "row": 4.3,
            "rowSpan": 2,
            "span": 8
          },
          {
            "column": 4,
            "role": "subtitle",
            "roleId": "copy",
            "row": 6.3,
            "rowSpan": 0.7,
            "span": 6
          },
          {
            "column": 5,
            "role": "action",
            "roleId": "action",
            "row": 7.4,
            "rowSpan": 0.7,
            "span": 4
          }
        ]
      },
      "mobile": {
        "order": [
          "copy",
          "action"
        ],
        "tone": "light",
        "zones": [
          {
            "column": 1,
            "role": "copy",
            "roleId": "copy",
            "row": 2,
            "rowSpan": 3,
            "span": 12
          },
          {
            "column": 1,
            "role": "action",
            "roleId": "action",
            "row": 6,
            "rowSpan": 1,
            "span": 5
          }
        ]
      },
      "purpose": "纯文字章节与单一行动位",
      "visualRole": "support-stage"
    },
    "roles": [
      {
        "allowedRatioPresetsByViewport": {
          "desktop": [
            "21 / 6"
          ]
        },
        "assetClass": "editorial",
        "defaultRatioByViewport": {
          "desktop": "21 / 6"
        },
        "id": "bgImage",
        "kind": "media",
        "positioning": "background",
        "required": false,
        "role": "media"
      },
      {
        "id": "copy",
        "kind": "text",
        "previewRoles": [
          "copy",
          "eyebrow",
          "title",
          "subtitle"
        ],
        "required": false,
        "role": "copy"
      },
      {
        "id": "action",
        "kind": "action",
        "required": false,
        "role": "action"
      }
    ],
    "spacingPolicy": [
      "normal",
      "spacious",
      "grand"
    ],
    "supportsLinkTarget": true,
    "version": 2,
    "visualRole": "support-stage",
    "visualWeight": "support-stage",
    "width": "editorial"
  },
  "video": {
    "allowedControls": [
      "videoWidth"
    ],
    "contentBudget": {
      "limits": {},
      "maxCtas": 1,
      "requiredText": []
    },
    "copyPlacementByViewport": {
      "desktop": "overlay",
      "mobile": "stacked"
    },
    "displayName": "视频",
    "editorCapabilities": {
      "editableObjects": [
        {
          "altPolicy": "not-applicable",
          "capabilities": [
            "content",
            "playback",
            "layout",
            "layer",
            "ratio",
            "fit",
            "zoom",
            "focus"
          ],
          "contentFieldKeys": [
            "videoUrl",
            "posterUrl",
            "videoWidth",
            "autoPlay",
            "loop",
            "muted",
            "showControls"
          ],
          "kind": "video",
          "responsive": {
            "content": "shared",
            "fit": "shared",
            "focus": "viewport-specific",
            "layer": "viewport-specific",
            "layout": "viewport-specific",
            "playback": "shared",
            "ratio": "shared",
            "zoom": "shared"
          },
          "roleId": "coverImage"
        },
        {
          "capabilities": [
            "content"
          ],
          "contentFieldKeys": [
            "title",
            "subtitle"
          ],
          "kind": "text",
          "responsive": {
            "content": "shared"
          },
          "roleId": "copy"
        },
        {
          "capabilities": [
            "content",
            "link"
          ],
          "contentFieldKeys": [
            "actionText",
            "targetType",
            "productId",
            "linkUrl"
          ],
          "kind": "action",
          "nodeIds": [
            "action",
            "actionText"
          ],
          "responsive": {
            "content": "shared",
            "link": "shared"
          },
          "roleId": "action"
        }
      ],
      "layoutOverrides": {
        "framePresets": [
          "standard",
          "wide"
        ],
        "slots": [
          {
            "fieldKey": "posterUrl",
            "fit": [
              "cover",
              "contain"
            ],
            "focusByViewport": true,
            "ratioPresets": [
              "16 / 9",
              "3 / 2"
            ],
            "roleId": "coverImage",
            "zoom": {
              "max": 1.4,
              "min": 1,
              "step": 0.05
            }
          }
        ]
      },
      "primaryTask": "media"
    },
    "flow": "bleed",
    "heightModeByViewport": {
      "desktop": "ratio",
      "mobile": "ratio"
    },
    "key": "video",
    "master": "cinematic-video",
    "media": [
      {
        "desktopRatio": "16 / 9",
        "key": "coverImage",
        "mobileRatio": "4 / 5",
        "required": false
      }
    ],
    "moduleType": "视频区块",
    "order": {
      "desktop": [
        "coverImage",
        "playControl",
        "copy",
        "action"
      ],
      "mobile": [
        "coverImage",
        "playControl",
        "copy",
        "action"
      ]
    },
    "presets": [
      "aspectRatio",
      "playbackControl"
    ],
    "preview": {
      "desktop": {
        "order": [
          "coverImage",
          "playControl",
          "copy",
          "action"
        ],
        "tone": "dark",
        "zones": [
          {
            "column": 1,
            "role": "media",
            "roleId": "coverImage",
            "row": 1,
            "rowSpan": 7,
            "span": 12
          },
          {
            "column": 6,
            "kind": "play",
            "overlay": true,
            "role": "marker",
            "roleId": "playControl",
            "row": 3,
            "rowSpan": 1,
            "span": 2
          },
          {
            "column": 2,
            "overlay": true,
            "role": "copy",
            "roleId": "copy",
            "row": 5,
            "rowSpan": 1,
            "span": 5
          },
          {
            "column": 2,
            "overlay": true,
            "role": "action",
            "roleId": "action",
            "row": 7,
            "rowSpan": 1,
            "span": 3
          }
        ]
      },
      "mobile": {
        "order": [
          "coverImage",
          "playControl",
          "copy",
          "action"
        ],
        "tone": "light",
        "zones": [
          {
            "column": 1,
            "role": "media",
            "roleId": "coverImage",
            "row": 1,
            "rowSpan": 4,
            "span": 12
          },
          {
            "column": 6,
            "kind": "play",
            "overlay": true,
            "role": "marker",
            "roleId": "playControl",
            "row": 2,
            "rowSpan": 1,
            "span": 2
          },
          {
            "column": 1,
            "role": "copy",
            "roleId": "copy",
            "row": 5,
            "rowSpan": 2,
            "span": 12
          },
          {
            "column": 1,
            "role": "action",
            "roleId": "action",
            "row": 7,
            "rowSpan": 1,
            "span": 5
          }
        ]
      },
      "purpose": "封面舞台与播放入口",
      "visualRole": "feature-stage"
    },
    "roles": [
      {
        "allowedRatioPresetsByViewport": {
          "desktop": [
            "16 / 9",
            "21 / 6"
          ],
          "mobile": [
            "4 / 5",
            "16 / 9",
            "9 / 16"
          ]
        },
        "assetClass": "editorial",
        "defaultRatioByViewport": {
          "desktop": "16 / 9",
          "mobile": "4 / 5"
        },
        "id": "coverImage",
        "kind": "media",
        "required": false,
        "role": "media"
      },
      {
        "id": "playControl",
        "kind": "marker",
        "required": false,
        "role": "marker",
        "semantic": "play-control"
      },
      {
        "id": "copy",
        "kind": "text",
        "required": false,
        "role": "copy"
      },
      {
        "id": "action",
        "kind": "action",
        "required": false,
        "role": "action"
      }
    ],
    "spacingPolicy": [
      "normal"
    ],
    "supportsLinkTarget": true,
    "version": 2,
    "visualRole": "feature-stage",
    "visualWeight": "feature-stage",
    "width": "full"
  },
  "wearingInspiration": {
    "allowedControls": [],
    "contentBudget": {
      "limits": {},
      "maxCtas": 1,
      "requiredText": []
    },
    "copyPlacementByViewport": {
      "desktop": "stacked",
      "mobile": "stacked"
    },
    "displayName": "佩戴展示",
    "editorCapabilities": {
      "editableObjects": [
        {
          "altFieldKey": "altText",
          "capabilities": [
            "content",
            "layout",
            "layer",
            "ratio",
            "fit",
            "zoom",
            "focus"
          ],
          "contentFieldKeys": [
            "image",
            "altText"
          ],
          "kind": "media",
          "responsive": {
            "content": "shared",
            "fit": "shared",
            "focus": "viewport-specific",
            "layer": "viewport-specific",
            "layout": "viewport-specific",
            "ratio": "shared",
            "zoom": "shared"
          },
          "roleId": "wearingImage"
        },
        {
          "capabilities": [
            "content"
          ],
          "contentFieldKeys": [
            "title",
            "subtitle"
          ],
          "kind": "text",
          "responsive": {
            "content": "shared"
          },
          "roleId": "copy"
        },
        {
          "capabilities": [
            "content",
            "reference"
          ],
          "contentFieldKeys": [
            "productCodes"
          ],
          "kind": "product",
          "referenceFieldKey": "productCodes",
          "responsive": {
            "content": "shared",
            "reference": "shared"
          },
          "roleId": "relatedProducts"
        },
        {
          "capabilities": [
            "content",
            "link"
          ],
          "contentFieldKeys": [
            "actionText",
            "targetType",
            "productId",
            "linkUrl"
          ],
          "kind": "action",
          "nodeIds": [
            "action",
            "actionText"
          ],
          "responsive": {
            "content": "shared",
            "link": "shared"
          },
          "roleId": "action"
        }
      ],
      "layoutOverrides": {
        "slots": [
          {
            "fieldKey": "image",
            "fit": [
              "cover",
              "contain"
            ],
            "focusByViewport": true,
            "ratioPresets": [
              "4 / 5",
              "3 / 4"
            ],
            "roleId": "wearingImage",
            "zoom": {
              "max": 1.5,
              "min": 1,
              "step": 0.05
            }
          }
        ]
      },
      "primaryTask": "product",
      "referenceFields": [
        {
          "key": "productCodes",
          "kind": "product",
          "legacyKey": "productIds",
          "max": 4,
          "min": 1
        }
      ]
    },
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content"
    },
    "key": "wearingInspiration",
    "master": "wearing-story",
    "media": [
      {
        "desktopRatio": "4 / 5",
        "key": "wearingImage",
        "mobileRatio": "4 / 5",
        "required": false
      }
    ],
    "moduleType": "佩戴灵感",
    "order": {
      "desktop": [
        "wearingImage",
        "copy",
        "relatedProducts",
        "action"
      ],
      "mobile": [
        "wearingImage",
        "copy",
        "relatedProducts",
        "action"
      ]
    },
    "presets": [],
    "preview": {
      "desktop": {
        "order": [
          "wearingImage",
          "copy",
          "relatedProducts",
          "action"
        ],
        "rows": 10,
        "tone": "light",
        "zones": [
          {
            "column": 1,
            "role": "mainMedia",
            "roleId": "wearingImage",
            "row": 1,
            "rowSpan": 8,
            "span": 7
          },
          {
            "column": 8,
            "role": "copy",
            "roleId": "copy",
            "row": 1,
            "rowSpan": 2,
            "span": 5
          },
          {
            "column": 8,
            "role": "detailMedia",
            "roleId": "relatedProducts",
            "row": 3,
            "rowSpan": 6,
            "span": 5
          },
          {
            "column": 8,
            "role": "action",
            "roleId": "action",
            "row": 10,
            "rowSpan": 1,
            "span": 3
          }
        ]
      },
      "mobile": {
        "order": [
          "wearingImage",
          "copy",
          "relatedProducts",
          "action"
        ],
        "tone": "light",
        "zones": [
          {
            "column": 1,
            "role": "mainMedia",
            "roleId": "wearingImage",
            "row": 1,
            "rowSpan": 4,
            "span": 12
          },
          {
            "column": 1,
            "role": "copy",
            "roleId": "copy",
            "row": 5,
            "rowSpan": 1,
            "span": 12
          },
          {
            "column": 5,
            "role": "detailMedia",
            "roleId": "relatedProducts",
            "row": 6,
            "rowSpan": 2,
            "span": 8
          },
          {
            "column": 1,
            "role": "action",
            "roleId": "action",
            "row": 8,
            "rowSpan": 1,
            "span": 5
          }
        ]
      },
      "purpose": "佩戴主画面、说明与细节补充",
      "visualRole": "feature-stage"
    },
    "roles": [
      {
        "allowedRatioPresetsByViewport": {
          "desktop": [
            "4 / 5",
            "3 / 2"
          ],
          "mobile": [
            "4 / 5",
            "3 / 2"
          ]
        },
        "assetClass": "editorial",
        "defaultRatioByViewport": {
          "desktop": "4 / 5",
          "mobile": "4 / 5"
        },
        "id": "wearingImage",
        "kind": "media",
        "required": false,
        "role": "mainMedia",
        "semantic": "wearing-primary-image"
      },
      {
        "id": "copy",
        "kind": "text",
        "required": false,
        "role": "copy"
      },
      {
        "id": "relatedProducts",
        "kind": "business",
        "required": false,
        "role": "detailMedia",
        "semantic": "related-product-collection"
      },
      {
        "id": "action",
        "kind": "action",
        "required": false,
        "role": "action"
      }
    ],
    "spacingPolicy": [
      "normal"
    ],
    "supportsLinkTarget": true,
    "version": 2,
    "visualRole": "feature-stage",
    "visualWeight": "feature-stage",
    "width": "wide"
  }
} as const satisfies Record<ContentTemplateKey, ContentTemplateContract>;

/** 全部 23 个模板的中性结构预览；不承担业务、发布或 Inspector 完整合同。 */
export const CONTENT_TEMPLATE_SKELETONS = {
  "booking": {
    "category": "服务信息",
    "displayName": "预约入口",
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content"
    },
    "key": "booking",
    "moduleType": "预约入口",
    "order": {
      "desktop": [
        "media",
        "copy",
        "action",
        "marker"
      ],
      "mobile": [
        "media",
        "copy",
        "action",
        "marker"
      ]
    },
    "preview": {
      "desktopZones": [
        {
          "column": 2,
          "role": "copy",
          "row": 2,
          "rowSpan": 3,
          "span": 6
        },
        {
          "column": 9,
          "role": "action",
          "row": 3,
          "rowSpan": 1,
          "span": 3
        },
        {
          "column": 9,
          "role": "marker",
          "row": 5,
          "rowSpan": 1,
          "span": 3
        }
      ],
      "tone": "light"
    },
    "slots": [
      {
        "key": "primaryAction",
        "role": "action"
      },
      {
        "desktopRatio": "21 / 6",
        "key": "bgImage",
        "mobileRatio": "4 / 5",
        "role": "media"
      },
      {
        "key": "copy",
        "role": "copy"
      },
      {
        "key": "secondaryContact",
        "role": "marker"
      }
    ],
    "visualRole": "support-stage",
    "width": "standard"
  },
  "brandPoints": {
    "category": "服务信息",
    "displayName": "品牌要点",
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content"
    },
    "key": "brandPoints",
    "moduleType": "卡片网格",
    "order": {
      "desktop": [
        "copy",
        "card"
      ],
      "mobile": [
        "copy",
        "card"
      ]
    },
    "preview": {
      "desktopZones": [
        {
          "column": 3,
          "role": "copy",
          "row": 1,
          "rowSpan": 1,
          "span": 8
        },
        {
          "column": 1,
          "role": "card",
          "row": 3,
          "rowSpan": 3,
          "span": 4
        },
        {
          "column": 5,
          "role": "card",
          "row": 3,
          "rowSpan": 3,
          "span": 4
        },
        {
          "column": 9,
          "role": "card",
          "row": 3,
          "rowSpan": 3,
          "span": 4
        }
      ],
      "tone": "light"
    },
    "slots": [
      {
        "key": "points",
        "role": "card"
      },
      {
        "key": "copy",
        "role": "copy"
      }
    ],
    "visualRole": "support-stage",
    "width": "standard"
  },
  "carousel": {
    "category": "视觉展示",
    "displayName": "轮播",
    "flow": "bleed",
    "heightModeByViewport": {
      "desktop": "ratio",
      "mobile": "ratio"
    },
    "key": "carousel",
    "moduleType": "轮播图",
    "order": {
      "desktop": [
        "media",
        "copy",
        "marker"
      ],
      "mobile": [
        "media",
        "copy",
        "marker"
      ]
    },
    "preview": {
      "desktopZones": [
        {
          "column": 1,
          "role": "media",
          "row": 1,
          "rowSpan": 6,
          "span": 12
        },
        {
          "column": 2,
          "overlay": true,
          "role": "copy",
          "row": 4,
          "rowSpan": 1,
          "span": 5
        },
        {
          "column": 9,
          "kind": "pagination",
          "overlay": true,
          "role": "marker",
          "row": 6,
          "rowSpan": 1,
          "span": 3
        }
      ],
      "tone": "light"
    },
    "slots": [
      {
        "desktopRatio": "21 / 6",
        "key": "frames",
        "mobileRatio": "4 / 5",
        "role": "media"
      },
      {
        "key": "copy",
        "role": "copy"
      },
      {
        "key": "pagination",
        "role": "marker"
      }
    ],
    "visualRole": "feature-stage",
    "width": "full"
  },
  "categoryCards": {
    "category": "导航入口",
    "displayName": "品类入口",
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content"
    },
    "key": "categoryCards",
    "moduleType": "分类卡片",
    "order": {
      "desktop": [
        "copy",
        "card"
      ],
      "mobile": [
        "copy",
        "card"
      ]
    },
    "preview": {
      "desktopZones": [
        {
          "column": 1,
          "role": "copy",
          "row": 1,
          "rowSpan": 1,
          "span": 4
        },
        {
          "column": 1,
          "role": "card",
          "row": 3,
          "rowSpan": 4,
          "span": 4
        },
        {
          "column": 5,
          "role": "card",
          "row": 3,
          "rowSpan": 4,
          "span": 4
        },
        {
          "column": 9,
          "role": "card",
          "row": 3,
          "rowSpan": 4,
          "span": 4
        }
      ],
      "tone": "light"
    },
    "slots": [
      {
        "desktopRatio": "1 / 1",
        "key": "categories",
        "mobileRatio": "4 / 5",
        "role": "card"
      },
      {
        "key": "copy",
        "role": "copy"
      }
    ],
    "visualRole": "support-stage",
    "width": "full"
  },
  "certificates": {
    "category": "服务信息",
    "displayName": "证书展示",
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content"
    },
    "key": "certificates",
    "moduleType": "资质证书",
    "order": {
      "desktop": [
        "copy",
        "card"
      ],
      "mobile": [
        "copy",
        "card"
      ]
    },
    "preview": {
      "desktopZones": [
        {
          "column": 1,
          "role": "copy",
          "row": 1,
          "rowSpan": 1,
          "span": 4
        },
        {
          "column": 1,
          "role": "card",
          "row": 3,
          "rowSpan": 3,
          "span": 4
        },
        {
          "column": 5,
          "role": "card",
          "row": 3,
          "rowSpan": 3,
          "span": 4
        },
        {
          "column": 9,
          "role": "card",
          "row": 3,
          "rowSpan": 3,
          "span": 4
        }
      ],
      "tone": "light"
    },
    "slots": [
      {
        "desktopRatio": "3 / 2",
        "key": "certificates",
        "mobileRatio": "3 / 2",
        "role": "card"
      },
      {
        "key": "copy",
        "role": "copy"
      }
    ],
    "visualRole": "support-stage",
    "width": "wide"
  },
  "comparison": {
    "category": "图文内容",
    "displayName": "前后对比",
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "ratio",
      "mobile": "content"
    },
    "key": "comparison",
    "moduleType": "改款对比",
    "order": {
      "desktop": [
        "copy",
        "mainMedia",
        "detailMedia",
        "marker"
      ],
      "mobile": [
        "copy",
        "mainMedia",
        "detailMedia",
        "marker"
      ]
    },
    "preview": {
      "desktopZones": [
        {
          "column": 1,
          "role": "copy",
          "row": 1,
          "rowSpan": 1,
          "span": 12
        },
        {
          "column": 1,
          "role": "mainMedia",
          "row": 3,
          "rowSpan": 4,
          "span": 6
        },
        {
          "column": 7,
          "role": "detailMedia",
          "row": 3,
          "rowSpan": 4,
          "span": 6
        },
        {
          "column": 6,
          "kind": "handle",
          "overlay": true,
          "role": "marker",
          "row": 4,
          "rowSpan": 2,
          "span": 2
        }
      ],
      "tone": "light"
    },
    "slots": [
      {
        "desktopRatio": "4 / 5",
        "key": "before",
        "mobileRatio": "4 / 5",
        "role": "mainMedia"
      },
      {
        "desktopRatio": "4 / 5",
        "key": "after",
        "mobileRatio": "4 / 5",
        "role": "detailMedia"
      },
      {
        "key": "copy",
        "role": "copy"
      },
      {
        "key": "comparisonHandle",
        "role": "marker"
      }
    ],
    "visualRole": "feature-stage",
    "width": "wide"
  },
  "doublePoster": {
    "category": "图文内容",
    "displayName": "双图文",
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content"
    },
    "key": "doublePoster",
    "moduleType": "双图海报",
    "order": {
      "desktop": [
        "mainMedia",
        "detailMedia",
        "copy",
        "action"
      ],
      "mobile": [
        "mainMedia",
        "copy",
        "detailMedia",
        "action"
      ]
    },
    "preview": {
      "desktopZones": [
        {
          "column": 1,
          "role": "mainMedia",
          "row": 1,
          "rowSpan": 6,
          "span": 8
        },
        {
          "column": 9,
          "role": "detailMedia",
          "row": 2,
          "rowSpan": 3,
          "span": 4
        },
        {
          "column": 9,
          "role": "copy",
          "row": 5,
          "rowSpan": 2,
          "span": 4
        },
        {
          "column": 9,
          "role": "action",
          "row": 8,
          "rowSpan": 1,
          "span": 3
        }
      ],
      "tone": "light"
    },
    "slots": [
      {
        "desktopRatio": "3 / 2",
        "key": "mainImage",
        "mobileRatio": "3 / 2",
        "role": "mainMedia"
      },
      {
        "desktopRatio": "4 / 5",
        "key": "detailImage",
        "mobileRatio": "4 / 5",
        "role": "detailMedia"
      },
      {
        "key": "copy",
        "role": "copy"
      },
      {
        "key": "action",
        "role": "action"
      }
    ],
    "visualRole": "feature-stage",
    "width": "wide"
  },
  "featuredProduct": {
    "category": "商品展示",
    "displayName": "单品展示",
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content"
    },
    "key": "featuredProduct",
    "moduleType": "单品焦点推荐",
    "order": {
      "desktop": [
        "media",
        "copy",
        "list",
        "action"
      ],
      "mobile": [
        "media",
        "copy",
        "list",
        "action"
      ]
    },
    "preview": {
      "desktopZones": [
        {
          "column": 3,
          "role": "media",
          "row": 1,
          "rowSpan": 5,
          "span": 8
        },
        {
          "column": 3,
          "role": "copy",
          "row": 6,
          "rowSpan": 1,
          "span": 8
        },
        {
          "column": 4,
          "role": "list",
          "row": 7,
          "rowSpan": 1,
          "span": 6
        },
        {
          "column": 4,
          "role": "action",
          "row": 8,
          "rowSpan": 1,
          "span": 6
        }
      ],
      "tone": "light"
    },
    "slots": [
      {
        "desktopRatio": "4 / 5",
        "key": "product",
        "mobileRatio": "4 / 5",
        "role": "media"
      },
      {
        "key": "copy",
        "role": "copy"
      },
      {
        "key": "list",
        "role": "list"
      },
      {
        "key": "action",
        "role": "action"
      }
    ],
    "visualRole": "feature-stage",
    "width": "wide"
  },
  "fullBleed": {
    "category": "视觉展示",
    "displayName": "通栏图",
    "flow": "bleed",
    "heightModeByViewport": {
      "desktop": "ratio",
      "mobile": "ratio"
    },
    "key": "fullBleed",
    "moduleType": "全屏出血图",
    "order": {
      "desktop": [
        "media",
        "copy",
        "action"
      ],
      "mobile": [
        "media",
        "copy",
        "action"
      ]
    },
    "preview": {
      "desktopZones": [
        {
          "column": 1,
          "role": "media",
          "row": 1,
          "rowSpan": 4,
          "span": 12
        },
        {
          "column": 1,
          "role": "copy",
          "row": 5,
          "rowSpan": 2,
          "span": 8
        },
        {
          "column": 10,
          "role": "action",
          "row": 7,
          "rowSpan": 1,
          "span": 3
        }
      ],
      "tone": "light"
    },
    "slots": [
      {
        "desktopRatio": "21 / 6",
        "key": "image",
        "role": "media"
      },
      {
        "key": "mobileImage",
        "mobileRatio": "4 / 5",
        "role": "media"
      },
      {
        "key": "copy",
        "role": "copy"
      },
      {
        "key": "action",
        "role": "action"
      }
    ],
    "visualRole": "support-stage",
    "width": "full"
  },
  "gallery": {
    "category": "商品展示",
    "displayName": "作品画廊",
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content"
    },
    "key": "gallery",
    "moduleType": "作品画廊",
    "order": {
      "desktop": [
        "copy",
        "media"
      ],
      "mobile": [
        "copy",
        "media"
      ]
    },
    "preview": {
      "desktopZones": [
        {
          "column": 1,
          "role": "copy",
          "row": 1,
          "rowSpan": 1,
          "span": 5
        },
        {
          "column": 1,
          "role": "mainMedia",
          "row": 3,
          "rowSpan": 4,
          "span": 7
        },
        {
          "column": 8,
          "role": "detailMedia",
          "row": 3,
          "rowSpan": 2,
          "span": 5
        },
        {
          "column": 8,
          "role": "media",
          "row": 5,
          "rowSpan": 2,
          "span": 5
        },
        {
          "column": 1,
          "role": "media",
          "row": 8,
          "rowSpan": 1,
          "span": 12
        }
      ],
      "tone": "light"
    },
    "slots": [
      {
        "desktopRatio": "4 / 5",
        "key": "works",
        "mobileRatio": "4 / 5",
        "role": "media"
      },
      {
        "key": "copy",
        "role": "copy"
      }
    ],
    "visualRole": "feature-stage",
    "width": "full"
  },
  "hero": {
    "category": "视觉展示",
    "displayName": "首屏",
    "flow": "bleed",
    "heightModeByViewport": {
      "desktop": "viewport",
      "mobile": "content"
    },
    "key": "hero",
    "moduleType": "首屏主视觉",
    "order": {
      "desktop": [
        "media",
        "copy",
        "action"
      ],
      "mobile": [
        "media",
        "copy",
        "action"
      ]
    },
    "preview": {
      "desktopZones": [
        {
          "column": 1,
          "role": "media",
          "row": 1,
          "rowSpan": 8,
          "span": 12
        },
        {
          "column": 5,
          "overlay": true,
          "role": "eyebrow",
          "row": 4.2,
          "rowSpan": 0.7,
          "span": 4
        },
        {
          "column": 4,
          "overlay": true,
          "role": "title",
          "row": 5,
          "rowSpan": 1.3,
          "span": 6
        },
        {
          "column": 4.5,
          "overlay": true,
          "role": "subtitle",
          "row": 6.4,
          "rowSpan": 0.7,
          "span": 5
        },
        {
          "column": 5,
          "overlay": true,
          "role": "action",
          "row": 7.4,
          "rowSpan": 0.7,
          "span": 3
        }
      ],
      "tone": "light"
    },
    "slots": [
      {
        "desktopRatio": "16 / 9",
        "key": "desktopImage",
        "role": "media"
      },
      {
        "key": "mobileImage",
        "mobileRatio": "4 / 5",
        "role": "media"
      },
      {
        "key": "copy",
        "role": "copy"
      },
      {
        "key": "action",
        "role": "action"
      }
    ],
    "visualRole": "primary-stage",
    "width": "full"
  },
  "hotspot": {
    "category": "导航入口",
    "displayName": "图片热区",
    "flow": "bleed",
    "heightModeByViewport": {
      "desktop": "ratio",
      "mobile": "ratio"
    },
    "key": "hotspot",
    "moduleType": "热区图",
    "order": {
      "desktop": [
        "media",
        "marker",
        "copy"
      ],
      "mobile": [
        "media",
        "marker",
        "copy"
      ]
    },
    "preview": {
      "desktopZones": [
        {
          "column": 1,
          "role": "media",
          "row": 1,
          "rowSpan": 6,
          "span": 12
        },
        {
          "column": 3,
          "kind": "hotspot",
          "overlay": true,
          "role": "marker",
          "row": 3,
          "rowSpan": 1,
          "span": 1
        },
        {
          "column": 7,
          "kind": "hotspot",
          "overlay": true,
          "role": "marker",
          "row": 4,
          "rowSpan": 1,
          "span": 1
        },
        {
          "column": 10,
          "kind": "hotspot",
          "overlay": true,
          "role": "marker",
          "row": 2,
          "rowSpan": 1,
          "span": 1
        },
        {
          "column": 2,
          "role": "copy",
          "row": 7,
          "rowSpan": 1,
          "span": 5
        }
      ],
      "tone": "light"
    },
    "slots": [
      {
        "desktopRatio": "16 / 9",
        "key": "sceneImage",
        "mobileRatio": "4 / 5",
        "role": "media"
      },
      {
        "desktopRatio": "21 / 6",
        "key": "hotspots",
        "mobileRatio": "4 / 5",
        "role": "marker"
      },
      {
        "key": "copy",
        "role": "copy"
      }
    ],
    "visualRole": "feature-stage",
    "width": "full"
  },
  "journey": {
    "category": "图文内容",
    "displayName": "内容流程",
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content"
    },
    "key": "journey",
    "moduleType": "定制流程",
    "order": {
      "desktop": [
        "copy",
        "timeline"
      ],
      "mobile": [
        "copy",
        "timeline"
      ]
    },
    "preview": {
      "desktopZones": [
        {
          "column": 1,
          "role": "copy",
          "row": 1,
          "rowSpan": 2,
          "span": 5
        },
        {
          "column": 1,
          "kind": "steps-5",
          "role": "timeline",
          "row": 4,
          "rowSpan": 3,
          "span": 12
        }
      ],
      "tone": "light"
    },
    "slots": [
      {
        "desktopRatio": "1 / 1",
        "key": "steps",
        "mobileRatio": "1 / 1",
        "role": "timeline"
      },
      {
        "key": "copy",
        "role": "copy"
      }
    ],
    "visualRole": "support-stage",
    "width": "wide"
  },
  "limitedEvent": {
    "category": "活动内容",
    "displayName": "限时活动",
    "flow": "bleed",
    "heightModeByViewport": {
      "desktop": "ratio",
      "mobile": "content"
    },
    "key": "limitedEvent",
    "moduleType": "限时活动",
    "order": {
      "desktop": [
        "media",
        "marker",
        "copy",
        "action"
      ],
      "mobile": [
        "media",
        "marker",
        "copy",
        "action"
      ]
    },
    "preview": {
      "desktopZones": [
        {
          "column": 1,
          "role": "media",
          "row": 1,
          "rowSpan": 7,
          "span": 12
        },
        {
          "column": 2,
          "kind": "countdown",
          "overlay": true,
          "role": "marker",
          "row": 2,
          "rowSpan": 1,
          "span": 3
        },
        {
          "column": 2,
          "overlay": true,
          "role": "copy",
          "row": 4,
          "rowSpan": 2,
          "span": 6
        },
        {
          "column": 2,
          "overlay": true,
          "role": "action",
          "row": 7,
          "rowSpan": 1,
          "span": 3
        }
      ],
      "tone": "dark"
    },
    "slots": [
      {
        "desktopRatio": "16 / 9",
        "key": "event",
        "mobileRatio": "4 / 5",
        "role": "media"
      },
      {
        "key": "time",
        "role": "marker"
      },
      {
        "key": "copy",
        "role": "copy"
      },
      {
        "key": "action",
        "role": "action"
      }
    ],
    "visualRole": "feature-stage",
    "width": "full"
  },
  "productRow": {
    "category": "商品展示",
    "displayName": "商品列表",
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content"
    },
    "key": "productRow",
    "moduleType": "产品展示行",
    "order": {
      "desktop": [
        "copy",
        "card"
      ],
      "mobile": [
        "copy",
        "card"
      ]
    },
    "preview": {
      "desktopZones": [
        {
          "column": 1,
          "role": "copy",
          "row": 1,
          "rowSpan": 1,
          "span": 5
        },
        {
          "column": 1,
          "role": "card",
          "row": 3,
          "rowSpan": 4,
          "span": 4
        },
        {
          "column": 5,
          "role": "card",
          "row": 3,
          "rowSpan": 4,
          "span": 4
        },
        {
          "column": 9,
          "role": "card",
          "row": 3,
          "rowSpan": 4,
          "span": 4
        }
      ],
      "tone": "light"
    },
    "slots": [
      {
        "desktopRatio": "4 / 5",
        "key": "productCards",
        "mobileRatio": "4 / 5",
        "role": "card"
      },
      {
        "key": "copy",
        "role": "copy"
      }
    ],
    "visualRole": "feature-stage",
    "width": "full"
  },
  "sceneShopping": {
    "category": "导航入口",
    "displayName": "场景入口",
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content"
    },
    "key": "sceneShopping",
    "moduleType": "按场景选购",
    "order": {
      "desktop": [
        "copy",
        "card"
      ],
      "mobile": [
        "copy",
        "card"
      ]
    },
    "preview": {
      "desktopZones": [
        {
          "column": 1,
          "role": "copy",
          "row": 1,
          "rowSpan": 1,
          "span": 12
        },
        {
          "column": 1,
          "role": "card",
          "row": 3,
          "rowSpan": 3,
          "span": 3
        },
        {
          "column": 4,
          "role": "card",
          "row": 3,
          "rowSpan": 3,
          "span": 3
        },
        {
          "column": 7,
          "role": "card",
          "row": 3,
          "rowSpan": 3,
          "span": 3
        },
        {
          "column": 10,
          "role": "card",
          "row": 3,
          "rowSpan": 3,
          "span": 3
        }
      ],
      "tone": "light"
    },
    "slots": [
      {
        "desktopRatio": "4 / 5",
        "key": "scenes",
        "mobileRatio": "4 / 5",
        "role": "card"
      },
      {
        "key": "copy",
        "role": "copy"
      }
    ],
    "visualRole": "support-stage",
    "width": "wide"
  },
  "servicePromises": {
    "category": "服务信息",
    "displayName": "服务承诺",
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content"
    },
    "key": "servicePromises",
    "moduleType": "服务承诺",
    "order": {
      "desktop": [
        "copy",
        "list"
      ],
      "mobile": [
        "copy",
        "list"
      ]
    },
    "preview": {
      "desktopZones": [
        {
          "column": 1,
          "role": "copy",
          "row": 1,
          "rowSpan": 1,
          "span": 5
        },
        {
          "column": 1,
          "role": "list",
          "row": 3,
          "rowSpan": 3,
          "span": 3
        },
        {
          "column": 4,
          "role": "list",
          "row": 3,
          "rowSpan": 3,
          "span": 3
        },
        {
          "column": 7,
          "role": "list",
          "row": 3,
          "rowSpan": 3,
          "span": 3
        },
        {
          "column": 10,
          "role": "list",
          "row": 3,
          "rowSpan": 3,
          "span": 3
        }
      ],
      "tone": "light"
    },
    "slots": [
      {
        "key": "promises",
        "role": "list"
      },
      {
        "key": "copy",
        "role": "copy"
      }
    ],
    "visualRole": "support-stage",
    "width": "full"
  },
  "singlePoster": {
    "category": "图文内容",
    "displayName": "单图文",
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content"
    },
    "key": "singlePoster",
    "moduleType": "单图海报",
    "order": {
      "desktop": [
        "media",
        "copy",
        "action"
      ],
      "mobile": [
        "media",
        "copy",
        "action"
      ]
    },
    "preview": {
      "desktopZones": [
        {
          "column": 4,
          "role": "media",
          "row": 1,
          "rowSpan": 8,
          "span": 9
        },
        {
          "column": 1,
          "role": "eyebrow",
          "row": 4.8,
          "rowSpan": 0.7,
          "span": 2.5
        },
        {
          "column": 1,
          "role": "title",
          "row": 5.5,
          "rowSpan": 1.6,
          "span": 2.5
        },
        {
          "column": 1,
          "role": "subtitle",
          "row": 7.1,
          "rowSpan": 0.7,
          "span": 2.5
        },
        {
          "column": 1,
          "role": "action",
          "row": 7.8,
          "rowSpan": 0.6,
          "span": 2
        }
      ],
      "tone": "light"
    },
    "slots": [
      {
        "desktopRatio": "4 / 5",
        "key": "desktopImage",
        "role": "media"
      },
      {
        "key": "mobileImage",
        "mobileRatio": "4 / 5",
        "role": "media"
      },
      {
        "key": "copy",
        "role": "copy"
      },
      {
        "key": "action",
        "role": "action"
      }
    ],
    "visualRole": "feature-stage",
    "width": "standard"
  },
  "storeInfo": {
    "category": "服务信息",
    "displayName": "门店信息",
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content"
    },
    "key": "storeInfo",
    "moduleType": "门店信息",
    "order": {
      "desktop": [
        "media",
        "copy",
        "list",
        "action"
      ],
      "mobile": [
        "media",
        "copy",
        "list",
        "action"
      ]
    },
    "preview": {
      "desktopZones": [
        {
          "column": 1,
          "role": "media",
          "row": 1,
          "rowSpan": 6,
          "span": 7
        },
        {
          "column": 9,
          "role": "copy",
          "row": 1,
          "rowSpan": 1,
          "span": 4
        },
        {
          "column": 9,
          "role": "list",
          "row": 3,
          "rowSpan": 2,
          "span": 4
        },
        {
          "column": 9,
          "role": "action",
          "row": 6,
          "rowSpan": 1,
          "span": 3
        }
      ],
      "tone": "light"
    },
    "slots": [
      {
        "desktopRatio": "3 / 2",
        "key": "store",
        "mobileRatio": "3 / 2",
        "role": "media"
      },
      {
        "key": "details",
        "role": "list"
      },
      {
        "key": "copy",
        "role": "copy"
      },
      {
        "key": "action",
        "role": "action"
      }
    ],
    "visualRole": "feature-stage",
    "width": "full"
  },
  "testimonials": {
    "category": "服务信息",
    "displayName": "顾客分享",
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content"
    },
    "key": "testimonials",
    "moduleType": "真实评价与实拍",
    "order": {
      "desktop": [
        "media",
        "quote",
        "quote"
      ],
      "mobile": [
        "media",
        "quote",
        "quote"
      ]
    },
    "preview": {
      "desktopZones": [
        {
          "column": 1,
          "role": "media",
          "row": 2,
          "rowSpan": 6,
          "span": 5
        },
        {
          "column": 7,
          "role": "quote",
          "row": 3,
          "rowSpan": 3,
          "span": 6
        },
        {
          "column": 7,
          "role": "quote",
          "row": 6,
          "rowSpan": 1,
          "span": 4
        }
      ],
      "tone": "light"
    },
    "slots": [
      {
        "desktopRatio": "4 / 5",
        "key": "authorizedPhoto",
        "mobileRatio": "4 / 5",
        "role": "media"
      },
      {
        "key": "mainQuote",
        "role": "quote"
      },
      {
        "key": "attribution",
        "role": "quote"
      }
    ],
    "visualRole": "support-stage",
    "width": "wide"
  },
  "textBanner": {
    "category": "图文内容",
    "displayName": "纯文字",
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content"
    },
    "key": "textBanner",
    "moduleType": "文字横幅",
    "order": {
      "desktop": [
        "media",
        "copy",
        "action"
      ],
      "mobile": [
        "media",
        "copy",
        "action"
      ]
    },
    "preview": {
      "desktopZones": [
        {
          "column": 5,
          "role": "eyebrow",
          "row": 3.6,
          "rowSpan": 0.7,
          "span": 4
        },
        {
          "column": 3,
          "role": "title",
          "row": 4.3,
          "rowSpan": 2,
          "span": 8
        },
        {
          "column": 4,
          "role": "subtitle",
          "row": 6.3,
          "rowSpan": 0.7,
          "span": 6
        },
        {
          "column": 5,
          "role": "action",
          "row": 7.4,
          "rowSpan": 0.7,
          "span": 4
        }
      ],
      "tone": "light"
    },
    "slots": [
      {
        "desktopRatio": "21 / 6",
        "key": "bgImage",
        "role": "media"
      },
      {
        "key": "copy",
        "role": "copy"
      },
      {
        "key": "action",
        "role": "action"
      }
    ],
    "visualRole": "support-stage",
    "width": "editorial"
  },
  "video": {
    "category": "视觉展示",
    "displayName": "视频",
    "flow": "bleed",
    "heightModeByViewport": {
      "desktop": "ratio",
      "mobile": "ratio"
    },
    "key": "video",
    "moduleType": "视频区块",
    "order": {
      "desktop": [
        "media",
        "marker",
        "copy",
        "action"
      ],
      "mobile": [
        "media",
        "marker",
        "copy",
        "action"
      ]
    },
    "preview": {
      "desktopZones": [
        {
          "column": 1,
          "role": "media",
          "row": 1,
          "rowSpan": 7,
          "span": 12
        },
        {
          "column": 6,
          "kind": "play",
          "overlay": true,
          "role": "marker",
          "row": 3,
          "rowSpan": 1,
          "span": 2
        },
        {
          "column": 2,
          "overlay": true,
          "role": "copy",
          "row": 5,
          "rowSpan": 1,
          "span": 5
        },
        {
          "column": 2,
          "overlay": true,
          "role": "action",
          "row": 7,
          "rowSpan": 1,
          "span": 3
        }
      ],
      "tone": "dark"
    },
    "slots": [
      {
        "desktopRatio": "16 / 9",
        "key": "coverImage",
        "mobileRatio": "4 / 5",
        "role": "media"
      },
      {
        "key": "playControl",
        "role": "marker"
      },
      {
        "key": "copy",
        "role": "copy"
      },
      {
        "key": "action",
        "role": "action"
      }
    ],
    "visualRole": "feature-stage",
    "width": "full"
  },
  "wearingInspiration": {
    "category": "商品展示",
    "displayName": "佩戴展示",
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content"
    },
    "key": "wearingInspiration",
    "moduleType": "佩戴灵感",
    "order": {
      "desktop": [
        "mainMedia",
        "copy",
        "detailMedia",
        "action"
      ],
      "mobile": [
        "mainMedia",
        "copy",
        "detailMedia",
        "action"
      ]
    },
    "preview": {
      "desktopZones": [
        {
          "column": 1,
          "role": "mainMedia",
          "row": 1,
          "rowSpan": 8,
          "span": 7
        },
        {
          "column": 8,
          "role": "copy",
          "row": 1,
          "rowSpan": 2,
          "span": 5
        },
        {
          "column": 8,
          "role": "detailMedia",
          "row": 3,
          "rowSpan": 6,
          "span": 5
        },
        {
          "column": 8,
          "role": "action",
          "row": 8,
          "rowSpan": 1,
          "span": 3
        }
      ],
      "tone": "light"
    },
    "slots": [
      {
        "desktopRatio": "4 / 5",
        "key": "wearingImage",
        "mobileRatio": "4 / 5",
        "role": "mainMedia"
      },
      {
        "key": "copy",
        "role": "copy"
      },
      {
        "key": "relatedProducts",
        "role": "detailMedia"
      },
      {
        "key": "action",
        "role": "action"
      }
    ],
    "visualRole": "feature-stage",
    "width": "wide"
  }
} as const satisfies Record<string, ContentTemplateSkeleton>;

/** 所有 23 个模板的中性结构预览源；缩略图与总览不得另建坐标台账。 */
export const CONTENT_TEMPLATE_PREVIEWS = {
  "booking": {
    "desktop": {
      "order": [
        "copy",
        "action",
        "marker"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 2,
          "role": "copy",
          "row": 2,
          "rowSpan": 3,
          "span": 6
        },
        {
          "column": 9,
          "role": "action",
          "row": 3,
          "rowSpan": 1,
          "span": 3
        },
        {
          "column": 9,
          "role": "marker",
          "row": 5,
          "rowSpan": 1,
          "span": 3
        }
      ]
    },
    "displayName": "预约入口",
    "key": "booking",
    "mobile": {
      "order": [
        "copy",
        "action",
        "marker"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 1,
          "role": "copy",
          "row": 1,
          "rowSpan": 3,
          "span": 12
        },
        {
          "column": 1,
          "role": "action",
          "row": 5,
          "rowSpan": 1,
          "span": 8
        },
        {
          "column": 1,
          "role": "marker",
          "row": 7,
          "rowSpan": 1,
          "span": 8
        }
      ]
    },
    "moduleType": "预约入口",
    "purpose": "页面尾章的预约主行动与次级联系方式",
    "visualRole": "feature-stage"
  },
  "brandPoints": {
    "desktop": {
      "order": [
        "copy",
        "card"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 3,
          "role": "copy",
          "row": 1,
          "rowSpan": 1,
          "span": 8
        },
        {
          "column": 1,
          "role": "card",
          "row": 3,
          "rowSpan": 3,
          "span": 4
        },
        {
          "column": 5,
          "role": "card",
          "row": 3,
          "rowSpan": 3,
          "span": 4
        },
        {
          "column": 9,
          "role": "card",
          "row": 3,
          "rowSpan": 3,
          "span": 4
        }
      ]
    },
    "displayName": "品牌要点",
    "key": "brandPoints",
    "mobile": {
      "order": [
        "copy",
        "card"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 1,
          "role": "copy",
          "row": 1,
          "rowSpan": 1,
          "span": 12
        },
        {
          "column": 1,
          "role": "card",
          "row": 2,
          "rowSpan": 2,
          "span": 12
        },
        {
          "column": 1,
          "role": "card",
          "row": 4,
          "rowSpan": 2,
          "span": 12
        },
        {
          "column": 1,
          "role": "card",
          "row": 6,
          "rowSpan": 2,
          "span": 12
        }
      ]
    },
    "moduleType": "卡片网格",
    "purpose": "三个品牌能力要点",
    "visualRole": "support-stage"
  },
  "carousel": {
    "desktop": {
      "order": [
        "media",
        "copy",
        "marker"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 1,
          "role": "media",
          "row": 1,
          "rowSpan": 6,
          "span": 12
        },
        {
          "column": 2,
          "overlay": true,
          "role": "copy",
          "row": 4,
          "rowSpan": 1,
          "span": 5
        },
        {
          "column": 9,
          "kind": "pagination",
          "overlay": true,
          "role": "marker",
          "row": 6,
          "rowSpan": 1,
          "span": 3
        }
      ]
    },
    "displayName": "轮播",
    "key": "carousel",
    "mobile": {
      "order": [
        "media",
        "copy",
        "marker"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 1,
          "role": "media",
          "row": 1,
          "rowSpan": 4,
          "span": 12
        },
        {
          "column": 1,
          "role": "copy",
          "row": 5,
          "rowSpan": 2,
          "span": 12
        },
        {
          "column": 1,
          "kind": "pagination",
          "role": "marker",
          "row": 7,
          "rowSpan": 1,
          "span": 4
        }
      ]
    },
    "moduleType": "轮播图",
    "purpose": "多帧主视觉与分页切换",
    "visualRole": "feature-stage"
  },
  "categoryCards": {
    "desktop": {
      "order": [
        "copy",
        "card"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 1,
          "role": "copy",
          "row": 1,
          "rowSpan": 1,
          "span": 4
        },
        {
          "column": 1,
          "role": "card",
          "row": 3,
          "rowSpan": 4,
          "span": 4
        },
        {
          "column": 5,
          "role": "card",
          "row": 3,
          "rowSpan": 4,
          "span": 4
        },
        {
          "column": 9,
          "role": "card",
          "row": 3,
          "rowSpan": 4,
          "span": 4
        }
      ]
    },
    "displayName": "品类入口",
    "key": "categoryCards",
    "mobile": {
      "order": [
        "copy",
        "card"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 1,
          "role": "copy",
          "row": 1,
          "rowSpan": 1,
          "span": 12
        },
        {
          "column": 1,
          "role": "card",
          "row": 2,
          "rowSpan": 2,
          "span": 12
        },
        {
          "column": 1,
          "role": "card",
          "row": 4,
          "rowSpan": 2,
          "span": 12
        },
        {
          "column": 1,
          "role": "card",
          "row": 6,
          "rowSpan": 2,
          "span": 12
        }
      ]
    },
    "moduleType": "分类卡片",
    "purpose": "三张品类入口卡",
    "visualRole": "support-stage"
  },
  "certificates": {
    "desktop": {
      "order": [
        "copy",
        "card"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 1,
          "role": "copy",
          "row": 1,
          "rowSpan": 1,
          "span": 4
        },
        {
          "column": 1,
          "role": "card",
          "row": 3,
          "rowSpan": 3,
          "span": 4
        },
        {
          "column": 5,
          "role": "card",
          "row": 3,
          "rowSpan": 3,
          "span": 4
        },
        {
          "column": 9,
          "role": "card",
          "row": 3,
          "rowSpan": 3,
          "span": 4
        }
      ]
    },
    "displayName": "证书展示",
    "key": "certificates",
    "mobile": {
      "order": [
        "copy",
        "card"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 1,
          "role": "copy",
          "row": 1,
          "rowSpan": 1,
          "span": 12
        },
        {
          "column": 1,
          "role": "card",
          "row": 2,
          "rowSpan": 2,
          "span": 12
        },
        {
          "column": 1,
          "role": "card",
          "row": 4,
          "rowSpan": 2,
          "span": 12
        },
        {
          "column": 1,
          "role": "card",
          "row": 6,
          "rowSpan": 2,
          "span": 12
        }
      ]
    },
    "moduleType": "资质证书",
    "purpose": "三张横向资质证书",
    "visualRole": "support-stage"
  },
  "comparison": {
    "desktop": {
      "order": [
        "copy",
        "mainMedia",
        "detailMedia",
        "marker"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 1,
          "role": "copy",
          "row": 1,
          "rowSpan": 1,
          "span": 12
        },
        {
          "column": 1,
          "role": "mainMedia",
          "row": 3,
          "rowSpan": 4,
          "span": 6
        },
        {
          "column": 7,
          "role": "detailMedia",
          "row": 3,
          "rowSpan": 4,
          "span": 6
        },
        {
          "column": 6,
          "kind": "handle",
          "overlay": true,
          "role": "marker",
          "row": 4,
          "rowSpan": 2,
          "span": 2
        }
      ]
    },
    "displayName": "前后对比",
    "key": "comparison",
    "mobile": {
      "order": [
        "copy",
        "mainMedia",
        "detailMedia",
        "marker"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 1,
          "role": "copy",
          "row": 1,
          "rowSpan": 1,
          "span": 12
        },
        {
          "column": 1,
          "role": "mainMedia",
          "row": 2,
          "rowSpan": 3,
          "span": 12
        },
        {
          "column": 1,
          "role": "detailMedia",
          "row": 5,
          "rowSpan": 3,
          "span": 12
        },
        {
          "column": 6,
          "kind": "handle",
          "overlay": true,
          "role": "marker",
          "row": 4,
          "rowSpan": 2,
          "span": 2
        }
      ]
    },
    "moduleType": "改款对比",
    "purpose": "同尺寸前后画面与分割手柄",
    "visualRole": "feature-stage"
  },
  "doublePoster": {
    "desktop": {
      "order": [
        "mainMedia",
        "detailMedia",
        "copy",
        "action"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 1,
          "role": "mainMedia",
          "row": 1,
          "rowSpan": 6,
          "span": 8
        },
        {
          "column": 9,
          "role": "detailMedia",
          "row": 2,
          "rowSpan": 3,
          "span": 4
        },
        {
          "column": 9,
          "role": "copy",
          "row": 5,
          "rowSpan": 2,
          "span": 4
        },
        {
          "column": 9,
          "role": "action",
          "row": 8,
          "rowSpan": 1,
          "span": 3
        }
      ]
    },
    "displayName": "双图文",
    "key": "doublePoster",
    "mobile": {
      "order": [
        "mainMedia",
        "copy",
        "detailMedia",
        "action"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 1,
          "role": "mainMedia",
          "row": 1,
          "rowSpan": 3,
          "span": 12
        },
        {
          "column": 1,
          "role": "copy",
          "row": 4,
          "rowSpan": 2,
          "span": 12
        },
        {
          "column": 5,
          "role": "detailMedia",
          "row": 6,
          "rowSpan": 2,
          "span": 8
        },
        {
          "column": 1,
          "role": "action",
          "row": 8,
          "rowSpan": 1,
          "span": 5
        }
      ]
    },
    "moduleType": "双图海报",
    "purpose": "主图、细节图与说明的章节节奏",
    "visualRole": "feature-stage"
  },
  "featuredProduct": {
    "desktop": {
      "order": [
        "media",
        "copy",
        "list",
        "action"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 3,
          "role": "media",
          "row": 1,
          "rowSpan": 5,
          "span": 8
        },
        {
          "column": 3,
          "role": "copy",
          "row": 6,
          "rowSpan": 1,
          "span": 8
        },
        {
          "column": 4,
          "role": "list",
          "row": 7,
          "rowSpan": 1,
          "span": 6
        },
        {
          "column": 4,
          "role": "action",
          "row": 8,
          "rowSpan": 1,
          "span": 6
        }
      ]
    },
    "displayName": "单品展示",
    "key": "featuredProduct",
    "mobile": {
      "order": [
        "media",
        "copy",
        "list",
        "action"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 1,
          "role": "media",
          "row": 1,
          "rowSpan": 4,
          "span": 12
        },
        {
          "column": 1,
          "role": "copy",
          "row": 5,
          "rowSpan": 1,
          "span": 12
        },
        {
          "column": 1,
          "role": "list",
          "row": 6,
          "rowSpan": 1,
          "span": 12
        },
        {
          "column": 1,
          "role": "action",
          "row": 7,
          "rowSpan": 1,
          "span": 5
        }
      ]
    },
    "moduleType": "单品焦点推荐",
    "purpose": "单件主推商品与关键信息",
    "visualRole": "feature-stage"
  },
  "fullBleed": {
    "desktop": {
      "order": [
        "media",
        "copy",
        "action"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 1,
          "role": "media",
          "row": 1,
          "rowSpan": 4,
          "span": 12
        },
        {
          "column": 1,
          "role": "copy",
          "row": 5,
          "rowSpan": 2,
          "span": 8
        },
        {
          "column": 10,
          "role": "action",
          "row": 7,
          "rowSpan": 1,
          "span": 3
        }
      ]
    },
    "displayName": "通栏图",
    "key": "fullBleed",
    "mobile": {
      "order": [
        "media",
        "copy",
        "action"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 1,
          "role": "media",
          "row": 1,
          "rowSpan": 4,
          "span": 12
        },
        {
          "column": 1,
          "role": "copy",
          "row": 5,
          "rowSpan": 2,
          "span": 12
        },
        {
          "column": 1,
          "role": "action",
          "row": 7,
          "rowSpan": 1,
          "span": 5
        }
      ]
    },
    "moduleType": "全屏出血图",
    "purpose": "低于首屏的通栏章节影像",
    "visualRole": "support-stage"
  },
  "gallery": {
    "desktop": {
      "order": [
        "copy",
        "media"
      ],
      "rows": 10,
      "tone": "light",
      "zones": [
        {
          "column": 1,
          "role": "copy",
          "row": 1,
          "rowSpan": 1,
          "span": 5
        },
        {
          "column": 1,
          "role": "mainMedia",
          "row": 3,
          "rowSpan": 4,
          "span": 7
        },
        {
          "column": 8,
          "role": "detailMedia",
          "row": 3,
          "rowSpan": 2,
          "span": 5
        },
        {
          "column": 8,
          "role": "media",
          "row": 5,
          "rowSpan": 2,
          "span": 5
        },
        {
          "column": 1,
          "role": "media",
          "row": 8,
          "rowSpan": 2,
          "span": 12
        }
      ]
    },
    "displayName": "作品画廊",
    "key": "gallery",
    "mobile": {
      "order": [
        "copy",
        "media"
      ],
      "rows": 10,
      "tone": "light",
      "zones": [
        {
          "column": 1,
          "role": "copy",
          "row": 1,
          "rowSpan": 1,
          "span": 12
        },
        {
          "column": 1,
          "role": "mainMedia",
          "row": 2,
          "rowSpan": 3,
          "span": 12
        },
        {
          "column": 1,
          "role": "detailMedia",
          "row": 5,
          "rowSpan": 2,
          "span": 12
        },
        {
          "column": 1,
          "role": "media",
          "row": 7,
          "rowSpan": 2,
          "span": 12
        },
        {
          "column": 1,
          "role": "media",
          "row": 9,
          "rowSpan": 2,
          "span": 12
        }
      ]
    },
    "moduleType": "作品画廊",
    "purpose": "大图→双图→大图的作品节奏",
    "visualRole": "feature-stage"
  },
  "hero": {
    "desktop": {
      "order": [
        "media",
        "copy",
        "action"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 1,
          "role": "media",
          "row": 1,
          "rowSpan": 8,
          "span": 12
        },
        {
          "column": 5,
          "overlay": true,
          "role": "eyebrow",
          "row": 4.2,
          "rowSpan": 0.7,
          "span": 4
        },
        {
          "column": 4,
          "overlay": true,
          "role": "title",
          "row": 5,
          "rowSpan": 1.3,
          "span": 6
        },
        {
          "column": 4.5,
          "overlay": true,
          "role": "subtitle",
          "row": 6.4,
          "rowSpan": 0.7,
          "span": 5
        },
        {
          "column": 5,
          "overlay": true,
          "role": "action",
          "row": 7.4,
          "rowSpan": 0.7,
          "span": 3
        }
      ]
    },
    "displayName": "首屏",
    "key": "hero",
    "mobile": {
      "order": [
        "media",
        "copy",
        "action"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 1,
          "role": "media",
          "row": 1,
          "rowSpan": 4,
          "span": 12
        },
        {
          "column": 1,
          "role": "copy",
          "row": 5,
          "rowSpan": 2,
          "span": 12
        },
        {
          "column": 1,
          "role": "action",
          "row": 7,
          "rowSpan": 1,
          "span": 5
        }
      ]
    },
    "moduleType": "首屏主视觉",
    "purpose": "品牌首屏与最高视觉权重舞台",
    "visualRole": "primary-stage"
  },
  "hotspot": {
    "desktop": {
      "order": [
        "media",
        "marker",
        "copy"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 1,
          "role": "media",
          "row": 1,
          "rowSpan": 6,
          "span": 12
        },
        {
          "column": 3,
          "kind": "hotspot",
          "overlay": true,
          "role": "marker",
          "row": 3,
          "rowSpan": 1,
          "span": 1
        },
        {
          "column": 7,
          "kind": "hotspot",
          "overlay": true,
          "role": "marker",
          "row": 4,
          "rowSpan": 1,
          "span": 1
        },
        {
          "column": 10,
          "kind": "hotspot",
          "overlay": true,
          "role": "marker",
          "row": 2,
          "rowSpan": 1,
          "span": 1
        },
        {
          "column": 2,
          "role": "copy",
          "row": 7,
          "rowSpan": 1,
          "span": 5
        }
      ]
    },
    "displayName": "图片热区",
    "key": "hotspot",
    "mobile": {
      "order": [
        "media",
        "marker",
        "copy"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 1,
          "role": "media",
          "row": 1,
          "rowSpan": 6,
          "span": 12
        },
        {
          "column": 3,
          "kind": "hotspot",
          "overlay": true,
          "role": "marker",
          "row": 2,
          "rowSpan": 1,
          "span": 1
        },
        {
          "column": 8,
          "kind": "hotspot",
          "overlay": true,
          "role": "marker",
          "row": 4,
          "rowSpan": 1,
          "span": 1
        },
        {
          "column": 6,
          "kind": "hotspot",
          "overlay": true,
          "role": "marker",
          "row": 5,
          "rowSpan": 1,
          "span": 1
        },
        {
          "column": 1,
          "role": "copy",
          "row": 7,
          "rowSpan": 1,
          "span": 12
        }
      ]
    },
    "moduleType": "热区图",
    "purpose": "底图内热点与导览说明",
    "visualRole": "feature-stage"
  },
  "journey": {
    "desktop": {
      "order": [
        "copy",
        "timeline"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 1,
          "role": "copy",
          "row": 1,
          "rowSpan": 2,
          "span": 5
        },
        {
          "column": 1,
          "kind": "steps-5",
          "role": "timeline",
          "row": 4,
          "rowSpan": 3,
          "span": 12
        }
      ]
    },
    "displayName": "内容流程",
    "key": "journey",
    "mobile": {
      "order": [
        "copy",
        "timeline"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 1,
          "role": "copy",
          "row": 1,
          "rowSpan": 2,
          "span": 12
        },
        {
          "column": 1,
          "kind": "steps-5",
          "role": "timeline",
          "row": 3,
          "rowSpan": 5,
          "span": 12
        }
      ]
    },
    "moduleType": "定制流程",
    "purpose": "01–05 编号叙事流程",
    "visualRole": "support-stage"
  },
  "limitedEvent": {
    "desktop": {
      "order": [
        "media",
        "marker",
        "copy",
        "action"
      ],
      "tone": "dark",
      "zones": [
        {
          "column": 1,
          "role": "media",
          "row": 1,
          "rowSpan": 7,
          "span": 12
        },
        {
          "column": 2,
          "kind": "countdown",
          "overlay": true,
          "role": "marker",
          "row": 2,
          "rowSpan": 1,
          "span": 3
        },
        {
          "column": 2,
          "overlay": true,
          "role": "copy",
          "row": 4,
          "rowSpan": 2,
          "span": 6
        },
        {
          "column": 2,
          "overlay": true,
          "role": "action",
          "row": 7,
          "rowSpan": 1,
          "span": 3
        }
      ]
    },
    "displayName": "限时活动",
    "key": "limitedEvent",
    "mobile": {
      "order": [
        "media",
        "marker",
        "copy",
        "action"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 1,
          "role": "media",
          "row": 1,
          "rowSpan": 4,
          "span": 12
        },
        {
          "column": 1,
          "kind": "countdown",
          "role": "marker",
          "row": 5,
          "rowSpan": 1,
          "span": 4
        },
        {
          "column": 1,
          "role": "copy",
          "row": 6,
          "rowSpan": 1,
          "span": 12
        },
        {
          "column": 1,
          "role": "action",
          "row": 8,
          "rowSpan": 1,
          "span": 5
        }
      ]
    },
    "moduleType": "限时活动",
    "purpose": "活动影像、时间状态、权益文字与行动",
    "visualRole": "feature-stage"
  },
  "productRow": {
    "desktop": {
      "order": [
        "copy",
        "card"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 1,
          "role": "copy",
          "row": 1,
          "rowSpan": 1,
          "span": 5
        },
        {
          "column": 1,
          "role": "card",
          "row": 3,
          "rowSpan": 4,
          "span": 4
        },
        {
          "column": 5,
          "role": "card",
          "row": 3,
          "rowSpan": 4,
          "span": 4
        },
        {
          "column": 9,
          "role": "card",
          "row": 3,
          "rowSpan": 4,
          "span": 4
        }
      ]
    },
    "displayName": "商品列表",
    "key": "productRow",
    "mobile": {
      "order": [
        "copy",
        "card"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 1,
          "role": "copy",
          "row": 1,
          "rowSpan": 1,
          "span": 12
        },
        {
          "column": 1,
          "role": "card",
          "row": 2,
          "rowSpan": 2,
          "span": 12
        },
        {
          "column": 1,
          "role": "card",
          "row": 4,
          "rowSpan": 2,
          "span": 12
        },
        {
          "column": 1,
          "role": "card",
          "row": 6,
          "rowSpan": 2,
          "span": 12
        }
      ]
    },
    "moduleType": "产品展示行",
    "purpose": "默认三列商品浏览与标题",
    "visualRole": "support-stage"
  },
  "sceneShopping": {
    "desktop": {
      "order": [
        "copy",
        "card"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 1,
          "role": "copy",
          "row": 1,
          "rowSpan": 1,
          "span": 12
        },
        {
          "column": 1,
          "role": "card",
          "row": 3,
          "rowSpan": 3,
          "span": 3
        },
        {
          "column": 4,
          "role": "card",
          "row": 3,
          "rowSpan": 3,
          "span": 3
        },
        {
          "column": 7,
          "role": "card",
          "row": 3,
          "rowSpan": 3,
          "span": 3
        },
        {
          "column": 10,
          "role": "card",
          "row": 3,
          "rowSpan": 3,
          "span": 3
        }
      ]
    },
    "displayName": "场景入口",
    "key": "sceneShopping",
    "mobile": {
      "order": [
        "copy",
        "card"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 1,
          "role": "copy",
          "row": 1,
          "rowSpan": 1,
          "span": 12
        },
        {
          "column": 1,
          "role": "card",
          "row": 2,
          "rowSpan": 1,
          "span": 12
        },
        {
          "column": 1,
          "role": "card",
          "row": 3,
          "rowSpan": 1,
          "span": 12
        },
        {
          "column": 1,
          "role": "card",
          "row": 4,
          "rowSpan": 1,
          "span": 12
        },
        {
          "column": 1,
          "role": "card",
          "row": 5,
          "rowSpan": 1,
          "span": 12
        }
      ]
    },
    "moduleType": "按场景选购",
    "purpose": "四个选购场景入口",
    "visualRole": "support-stage"
  },
  "servicePromises": {
    "desktop": {
      "order": [
        "copy",
        "list"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 1,
          "role": "copy",
          "row": 1,
          "rowSpan": 1,
          "span": 5
        },
        {
          "column": 1,
          "role": "list",
          "row": 3,
          "rowSpan": 3,
          "span": 3
        },
        {
          "column": 4,
          "role": "list",
          "row": 3,
          "rowSpan": 3,
          "span": 3
        },
        {
          "column": 7,
          "role": "list",
          "row": 3,
          "rowSpan": 3,
          "span": 3
        },
        {
          "column": 10,
          "role": "list",
          "row": 3,
          "rowSpan": 3,
          "span": 3
        }
      ]
    },
    "displayName": "服务承诺",
    "key": "servicePromises",
    "mobile": {
      "order": [
        "copy",
        "list"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 1,
          "role": "copy",
          "row": 1,
          "rowSpan": 1,
          "span": 12
        },
        {
          "column": 1,
          "role": "list",
          "row": 2,
          "rowSpan": 1,
          "span": 12
        },
        {
          "column": 1,
          "role": "list",
          "row": 3,
          "rowSpan": 1,
          "span": 12
        },
        {
          "column": 1,
          "role": "list",
          "row": 4,
          "rowSpan": 1,
          "span": 12
        },
        {
          "column": 1,
          "role": "list",
          "row": 5,
          "rowSpan": 1,
          "span": 12
        }
      ]
    },
    "moduleType": "服务承诺",
    "purpose": "四项服务承诺清单",
    "visualRole": "support-stage"
  },
  "singlePoster": {
    "desktop": {
      "order": [
        "media",
        "copy",
        "action"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 4,
          "role": "media",
          "row": 1,
          "rowSpan": 8,
          "span": 9
        },
        {
          "column": 1,
          "role": "eyebrow",
          "row": 4.8,
          "rowSpan": 0.7,
          "span": 2.5
        },
        {
          "column": 1,
          "role": "title",
          "row": 5.5,
          "rowSpan": 1.6,
          "span": 2.5
        },
        {
          "column": 1,
          "role": "subtitle",
          "row": 7.1,
          "rowSpan": 0.7,
          "span": 2.5
        },
        {
          "column": 1,
          "role": "action",
          "row": 7.8,
          "rowSpan": 0.6,
          "span": 2
        }
      ]
    },
    "displayName": "单图文",
    "key": "singlePoster",
    "mobile": {
      "order": [
        "media",
        "copy",
        "action"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 1,
          "role": "media",
          "row": 1,
          "rowSpan": 5,
          "span": 12
        },
        {
          "column": 2,
          "overlay": true,
          "role": "copy",
          "row": 2,
          "rowSpan": 2,
          "span": 10
        },
        {
          "column": 4,
          "overlay": true,
          "role": "action",
          "row": 4,
          "rowSpan": 1,
          "span": 5
        }
      ]
    },
    "moduleType": "单图海报",
    "purpose": "单一主图与编辑式章节叙事",
    "visualRole": "feature-stage"
  },
  "storeInfo": {
    "desktop": {
      "order": [
        "media",
        "copy",
        "list",
        "action"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 1,
          "role": "media",
          "row": 1,
          "rowSpan": 6,
          "span": 7
        },
        {
          "column": 9,
          "role": "copy",
          "row": 1,
          "rowSpan": 1,
          "span": 4
        },
        {
          "column": 9,
          "role": "list",
          "row": 3,
          "rowSpan": 2,
          "span": 4
        },
        {
          "column": 9,
          "role": "action",
          "row": 6,
          "rowSpan": 1,
          "span": 3
        }
      ]
    },
    "displayName": "门店信息",
    "key": "storeInfo",
    "mobile": {
      "order": [
        "media",
        "copy",
        "list",
        "action"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 1,
          "role": "media",
          "row": 1,
          "rowSpan": 4,
          "span": 12
        },
        {
          "column": 1,
          "role": "copy",
          "row": 5,
          "rowSpan": 1,
          "span": 12
        },
        {
          "column": 1,
          "role": "list",
          "row": 6,
          "rowSpan": 1,
          "span": 12
        },
        {
          "column": 1,
          "role": "action",
          "row": 7,
          "rowSpan": 1,
          "span": 5
        }
      ]
    },
    "moduleType": "门店信息",
    "purpose": "门店影像、地址服务与到店行动",
    "visualRole": "feature-stage"
  },
  "testimonials": {
    "desktop": {
      "order": [
        "media",
        "quote",
        "quote"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 1,
          "role": "media",
          "row": 2,
          "rowSpan": 6,
          "span": 5
        },
        {
          "column": 7,
          "role": "quote",
          "row": 3,
          "rowSpan": 3,
          "span": 6
        },
        {
          "column": 7,
          "role": "quote",
          "row": 6,
          "rowSpan": 1,
          "span": 4
        }
      ]
    },
    "displayName": "顾客分享",
    "key": "testimonials",
    "mobile": {
      "order": [
        "media",
        "quote",
        "quote"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 1,
          "role": "media",
          "row": 1,
          "rowSpan": 4,
          "span": 12
        },
        {
          "column": 1,
          "role": "quote",
          "row": 5,
          "rowSpan": 2,
          "span": 12
        },
        {
          "column": 1,
          "role": "quote",
          "row": 7,
          "rowSpan": 1,
          "span": 8
        }
      ]
    },
    "moduleType": "真实评价与实拍",
    "purpose": "授权实拍图片与主引语关系",
    "visualRole": "support-stage"
  },
  "textBanner": {
    "desktop": {
      "order": [
        "copy",
        "action"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 5,
          "role": "eyebrow",
          "row": 3.6,
          "rowSpan": 0.7,
          "span": 4
        },
        {
          "column": 3,
          "role": "title",
          "row": 4.3,
          "rowSpan": 2,
          "span": 8
        },
        {
          "column": 4,
          "role": "subtitle",
          "row": 6.3,
          "rowSpan": 0.7,
          "span": 6
        },
        {
          "column": 5,
          "role": "action",
          "row": 7.4,
          "rowSpan": 0.7,
          "span": 4
        }
      ]
    },
    "displayName": "纯文字",
    "key": "textBanner",
    "mobile": {
      "order": [
        "copy",
        "action"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 1,
          "role": "copy",
          "row": 2,
          "rowSpan": 3,
          "span": 12
        },
        {
          "column": 1,
          "role": "action",
          "row": 6,
          "rowSpan": 1,
          "span": 5
        }
      ]
    },
    "moduleType": "文字横幅",
    "purpose": "纯文字章节与单一行动位",
    "visualRole": "support-stage"
  },
  "video": {
    "desktop": {
      "order": [
        "media",
        "marker",
        "copy",
        "action"
      ],
      "tone": "dark",
      "zones": [
        {
          "column": 1,
          "role": "media",
          "row": 1,
          "rowSpan": 7,
          "span": 12
        },
        {
          "column": 6,
          "kind": "play",
          "overlay": true,
          "role": "marker",
          "row": 3,
          "rowSpan": 1,
          "span": 2
        },
        {
          "column": 2,
          "overlay": true,
          "role": "copy",
          "row": 5,
          "rowSpan": 1,
          "span": 5
        },
        {
          "column": 2,
          "overlay": true,
          "role": "action",
          "row": 7,
          "rowSpan": 1,
          "span": 3
        }
      ]
    },
    "displayName": "视频",
    "key": "video",
    "mobile": {
      "order": [
        "media",
        "marker",
        "copy",
        "action"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 1,
          "role": "media",
          "row": 1,
          "rowSpan": 4,
          "span": 12
        },
        {
          "column": 6,
          "kind": "play",
          "overlay": true,
          "role": "marker",
          "row": 2,
          "rowSpan": 1,
          "span": 2
        },
        {
          "column": 1,
          "role": "copy",
          "row": 5,
          "rowSpan": 2,
          "span": 12
        },
        {
          "column": 1,
          "role": "action",
          "row": 7,
          "rowSpan": 1,
          "span": 5
        }
      ]
    },
    "moduleType": "视频区块",
    "purpose": "封面舞台与播放入口",
    "visualRole": "feature-stage"
  },
  "wearingInspiration": {
    "desktop": {
      "order": [
        "mainMedia",
        "copy",
        "detailMedia",
        "action"
      ],
      "rows": 10,
      "tone": "light",
      "zones": [
        {
          "column": 1,
          "role": "mainMedia",
          "row": 1,
          "rowSpan": 8,
          "span": 7
        },
        {
          "column": 8,
          "role": "copy",
          "row": 1,
          "rowSpan": 2,
          "span": 5
        },
        {
          "column": 8,
          "role": "detailMedia",
          "row": 3,
          "rowSpan": 6,
          "span": 5
        },
        {
          "column": 8,
          "role": "action",
          "row": 10,
          "rowSpan": 1,
          "span": 3
        }
      ]
    },
    "displayName": "佩戴展示",
    "key": "wearingInspiration",
    "mobile": {
      "order": [
        "mainMedia",
        "copy",
        "detailMedia",
        "action"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 1,
          "role": "mainMedia",
          "row": 1,
          "rowSpan": 4,
          "span": 12
        },
        {
          "column": 1,
          "role": "copy",
          "row": 5,
          "rowSpan": 1,
          "span": 12
        },
        {
          "column": 5,
          "role": "detailMedia",
          "row": 6,
          "rowSpan": 2,
          "span": 8
        },
        {
          "column": 1,
          "role": "action",
          "row": 8,
          "rowSpan": 1,
          "span": 5
        }
      ]
    },
    "moduleType": "佩戴灵感",
    "purpose": "佩戴主画面、说明与细节补充",
    "visualRole": "feature-stage"
  }
} as const satisfies Record<RegisteredContentTemplateKey, ContentTemplatePreview>;

export const CONTENT_TEMPLATE_PREVIEW_BY_MODULE_TYPE = Object.fromEntries(
  Object.values(CONTENT_TEMPLATE_PREVIEWS).map((preview) => [preview.moduleType, preview]),
) as Record<string, ContentTemplatePreview | undefined>;

export function getContentTemplatePreview(moduleType: string) {
  return CONTENT_TEMPLATE_PREVIEW_BY_MODULE_TYPE[moduleType];
}

export const CONTENT_TEMPLATE_SKELETON_BY_MODULE_TYPE = Object.fromEntries(
  Object.values(CONTENT_TEMPLATE_SKELETONS).map((skeleton) => [skeleton.moduleType, skeleton]),
) as Record<string, ContentTemplateSkeleton | undefined>;

export function getContentTemplateSkeleton(moduleType: string) {
  return CONTENT_TEMPLATE_SKELETON_BY_MODULE_TYPE[moduleType];
}

export const CONTENT_TEMPLATE_BY_MODULE_TYPE = Object.fromEntries(
  Object.values(CONTENT_TEMPLATE_CONTRACTS).map((contract) => [contract.moduleType, contract]),
) as Record<string, ContentTemplateContract | undefined>;

export function getContentTemplateContract(moduleType: string) {
  return CONTENT_TEMPLATE_BY_MODULE_TYPE[moduleType];
}

export function findContentTemplateEditableObject(
  contract: ContentTemplateContract | undefined,
  nodeId: string,
): ContentTemplateEditableObject | undefined {
  if (!contract || !nodeId) return undefined;
  return contract.editorCapabilities.editableObjects.find((object) =>
    (object.nodeIds ?? [object.roleId]).includes(nodeId),
  );
}

export function getContentTemplateEditableObject(
  moduleType: string,
  nodeId: string,
): ContentTemplateEditableObject | undefined {
  return findContentTemplateEditableObject(getContentTemplateContract(moduleType), nodeId);
}

export function getContentTemplateEditableFieldKeys(
  moduleType: string,
  nodeId: string,
): readonly string[] {
  return getContentTemplateEditableObject(moduleType, nodeId)?.contentFieldKeys ?? [];
}

export function contentTemplateObjectHasCapability(
  object: ContentTemplateEditableObject | undefined,
  capability: ContentTemplateEditableCapability,
) {
  return Boolean(object?.capabilities.includes(capability));
}

export function getContentTemplatePageRule(pageKey: string) {
  return (CONTENT_TEMPLATE_PAGE_RULES as Record<string, ContentTemplatePageRule | undefined>)[pageKey];
}

export function isContentTemplateAllowedForPage(pageKey: string, moduleType: string) {
  const rule = getContentTemplatePageRule(pageKey);
  const contract = getContentTemplateContract(moduleType);
  return Boolean(
    rule
      && contract
      && (rule.allowedTemplateKeys as readonly ContentTemplateKey[]).includes(contract.key),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function getCompatibilityRoleValue(
  moduleType: string,
  roleId: string,
  values: Record<string, unknown>,
): unknown {
  const directValue = values[roleId];
  if (hasNonEmptyText(directValue)) return directValue;

  switch (moduleType + ":" + roleId) {
    case "视频区块:coverImage":
      return values.posterUrl;
    case "改款对比:before":
      return values.beforeImage;
    case "改款对比:after":
      return values.afterImage;
    case "佩戴灵感:wearingImage":
    case "热区图:sceneImage":
    case "门店信息:store":
      return values.image;
    case "限时活动:event":
      return values.eventImage;
    case "真实评价与实拍:authorizedPhoto": {
      const testimonials = values.testimonials;
      const first = Array.isArray(testimonials) ? testimonials[0] : undefined;
      return isRecord(first) ? first.image : undefined;
    }
    default:
      return directValue;
  }
}

function getQuantifiedCollectionValue(
  contract: ContentTemplateContract,
  roleId: string,
  values: Record<string, unknown>,
): { fieldKey: string; value: unknown[] } | undefined {
  const editableObject = contract.editorCapabilities.editableObjects.find(
    (object) => object.roleId === roleId,
  );
  if (!editableObject) return undefined;
  const reference = contract.editorCapabilities.referenceFields?.find(
    (item) => item.key === editableObject.referenceFieldKey,
  );
  const candidateKeys = [
    editableObject.referenceFieldKey,
    reference?.legacyKey,
    ...(editableObject.collectionFieldKeys ?? []),
  ].filter((key, index, keys): key is string => Boolean(key) && keys.indexOf(key) === index);
  const populatedKey = candidateKeys.find(
    (key) => Array.isArray(values[key]) && (values[key] as unknown[]).length > 0,
  );
  const arrayKey = populatedKey ?? candidateKeys.find((key) => Array.isArray(values[key]));
  return arrayKey ? { fieldKey: arrayKey, value: values[arrayKey] as unknown[] } : undefined;
}

export function createContentTemplateMarker(
  moduleType: string,
): ContentTemplateMarker | undefined {
  const contract = getContentTemplateContract(moduleType);
  return contract ? { key: contract.key, version: contract.version } : undefined;
}

function getInstanceOverrideIssues(input: {
  contract: ContentTemplateContract;
  props: Record<string, unknown>;
  blockId?: string;
  moduleType: string;
  basePath?: string;
}): ContentTemplateIssue[] {
  const overrides = input.props.__instanceOverrides;
  if (overrides === undefined) return [];
  const basePath = input.basePath ?? "props.__instanceOverrides";
  const issue = (message: string, path = basePath, field?: string): ContentTemplateIssue => ({
    code: "page-validation",
    severity: "error",
    layer: "contract",
    blockId: input.blockId,
    moduleType: input.moduleType,
    field,
    path,
    message,
  });
  if (!isRecord(overrides)) {
    return [issue("实例覆盖格式或版本无效，无法安全应用。")];
  }
  if (overrides.version === 2) {
    const issues: ContentTemplateIssue[] = [];
    const finiteInRange = (value: unknown, min: number, max: number) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) && numeric >= min && numeric <= max;
    };
    const brandInstanceColors = new Set([
      "#181A1B", "#5F6568", "#DDE1E2", "#F7F8F8", "#FFFFFF",
      "#222222", "#66645F", "#E4E3DF", "#F8F7F4", "#FCFCFB",
    ]);
    const isSafeColor = (value: unknown) =>
      typeof value === "string" && brandInstanceColors.has(value.toUpperCase());
    const frame = isRecord(overrides.frame) ? overrides.frame : undefined;
    const frameCapabilities = input.contract.editorCapabilities.layoutOverrides ?? {};
    const frameRatioRange = frameCapabilities.frameRatioRange;
    const ratioMin = frameRatioRange?.min ?? 0.25;
    const ratioMax = frameRatioRange?.max ?? 4;
    if (frame?.aspectRatio !== undefined && (!frameRatioRange || !finiteInRange(frame.aspectRatio, ratioMin, ratioMax))) {
      issues.push(issue("当前模板未开放整体比例，或比例超出 " + ratioMin + "–" + ratioMax + " 的安全范围。", basePath + ".frame.aspectRatio", "aspectRatio"));
    }
    if (frame?.aspectRatioByViewport !== undefined) {
      if (!isRecord(frame.aspectRatioByViewport)) {
        issues.push(issue("响应式画面比例格式无效。", basePath + ".frame.aspectRatioByViewport", "aspectRatioByViewport"));
      } else {
        for (const [viewport, ratio] of Object.entries(frame.aspectRatioByViewport)) {
          const ratioPath = basePath + ".frame.aspectRatioByViewport." + viewport;
          if (!frameRatioRange || !["desktop", "mobile"].includes(viewport) || !finiteInRange(ratio, ratioMin, ratioMax)) {
            issues.push(issue("当前模板的设备画面比例必须位于 " + ratioMin + "–" + ratioMax + " 的允许范围。", ratioPath, "aspectRatioByViewport"));
          }
        }
      }
    }
    if (frame?.heightPreset !== undefined && !frameCapabilities.framePresets?.includes(String(frame.heightPreset))) {
      issues.push(issue("当前模板不允许该整体高度预设。", basePath + ".frame.heightPreset", "heightPreset"));
    }
    if (frame?.compositionPreset !== undefined && !frameCapabilities.compositionPresets?.includes(String(frame.compositionPreset))) {
      issues.push(issue("当前模板不允许该构图预设。", basePath + ".frame.compositionPreset", "compositionPreset"));
    }
    if (frame?.customColors !== undefined) {
      if (!isRecord(frame.customColors)) {
        issues.push(issue("实例配色格式无效。", basePath + ".frame.customColors", "customColors"));
      } else {
        for (const colorKey of ["background", "text", "accent"] as const) {
          const color = frame.customColors[colorKey];
          if (color !== undefined && !isSafeColor(color)) {
            issues.push(issue("实例颜色只允许使用受控品牌色板。", basePath + ".frame.customColors." + colorKey, colorKey));
          }
        }
      }
    }
    const nodes = isRecord(overrides.nodes) ? overrides.nodes : {};
    for (const [nodeId, rawNode] of Object.entries(nodes)) {
      const path = basePath + ".nodes." + nodeId;
      if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(nodeId) || !isRecord(rawNode)) {
        issues.push(issue("可视化节点标识或格式无效。", path, nodeId));
        continue;
      }
      const slotCapability = frameCapabilities.slots?.find((slot) => slot.roleId === nodeId);
      const textCapability = frameCapabilities.textRoles?.find((role) => role.roleId === nodeId);
      const editableObject = findContentTemplateEditableObject(input.contract, nodeId);
      if (!editableObject || (!slotCapability && !textCapability)) {
        issues.push(issue("当前模板未声明该可视化节点的实例编辑能力。", path, nodeId));
        continue;
      }
      const hasCapability = (capability: ContentTemplateEditableCapability) =>
        editableObject.capabilities.includes(capability);
      if (rawNode.enabled !== undefined && !hasCapability("visibility")) {
        issues.push(issue("当前节点不允许启用或隐藏。", path + ".enabled", nodeId));
      }
      if (rawNode.ratio !== undefined && !finiteInRange(rawNode.ratio, 0.25, 4)) {
        issues.push(issue("节点比例必须位于 0.25–4 的安全范围。", path + ".ratio", nodeId));
      }
      if (rawNode.ratio !== undefined && (!slotCapability || !hasCapability("ratio"))) {
        issues.push(issue("当前节点不允许图片槽位比例覆盖。", path + ".ratio", nodeId));
      }
      if (rawNode.ratio !== undefined && slotCapability?.ratioPresets?.length) {
        const numericRatio = Number(rawNode.ratio);
        const allowedRatios = slotCapability.ratioPresets.map((preset) => {
          const [width, height] = String(preset).split("/").map(Number);
          return width / height;
        });
        if (!allowedRatios.some((allowedRatio) => Math.abs(allowedRatio - numericRatio) < 0.001)) {
          issues.push(issue("当前模板不允许该图片槽位比例。", path + ".ratio", nodeId));
        }
      }
      if (rawNode.sizePreset !== undefined && (!slotCapability?.sizePresets?.includes(String(rawNode.sizePreset)) || !hasCapability("size"))) {
        issues.push(issue("当前节点不允许该尺寸预设。", path + ".sizePreset", nodeId));
      }
      if (rawNode.positionPreset !== undefined && (!slotCapability?.positionPresets?.includes(String(rawNode.positionPreset)) || !hasCapability("position"))) {
        issues.push(issue("当前节点不允许该位置预设。", path + ".positionPreset", nodeId));
      }
      if (rawNode.rectByViewport !== undefined) {
        if (!hasCapability("layout")) {
          issues.push(issue("当前节点不允许响应式位置覆盖。", path + ".rectByViewport", nodeId));
        }
        if (!isRecord(rawNode.rectByViewport)) {
          issues.push(issue("节点响应式位置格式无效。", path + ".rectByViewport", nodeId));
        } else {
          for (const [viewport, rawRect] of Object.entries(rawNode.rectByViewport)) {
            const rectPath = path + ".rectByViewport." + viewport;
            if (!["desktop", "mobile"].includes(viewport) || !isRecord(rawRect)) {
              issues.push(issue("节点设备位置格式无效。", rectPath, nodeId));
              continue;
            }
            const x = Number(rawRect.x);
            const y = Number(rawRect.y);
            const width = Number(rawRect.width);
            const height = Number(rawRect.height);
            if (![x, y, width, height].every((value) => Number.isFinite(value)) || x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1.0001 || y + height > 1.0001) {
              issues.push(issue("节点必须完整位于画面 0–1 的归一化范围内。", rectPath, nodeId));
            }
          }
        }
      }
      if (rawNode.zIndexByViewport !== undefined) {
        if (!hasCapability("layer")) {
          issues.push(issue("当前节点不允许响应式层级覆盖。", path + ".zIndexByViewport", nodeId));
        }
        if (!isRecord(rawNode.zIndexByViewport)) {
          issues.push(issue("节点响应式层级格式无效。", path + ".zIndexByViewport", nodeId));
        } else {
          for (const [viewport, rawZIndex] of Object.entries(rawNode.zIndexByViewport)) {
            const zIndexPath = path + ".zIndexByViewport." + viewport;
            const zIndex = Number(rawZIndex);
            if (
              !["desktop", "mobile"].includes(viewport) ||
              !Number.isInteger(zIndex) ||
              zIndex < 0 ||
              zIndex > 20
            ) {
              issues.push(issue("节点层级必须是 0–20 的整数。", zIndexPath, nodeId));
            }
          }
        }
      }
      if (rawNode.mediaView !== undefined) {
        if (!slotCapability || !["fit", "zoom", "focus"].some((capability) => hasCapability(capability as ContentTemplateEditableCapability))) {
          issues.push(issue("当前节点不允许图片观看窗覆盖。", path + ".mediaView", nodeId));
        } else if (!isRecord(rawNode.mediaView)) {
          issues.push(issue("图片观看窗格式无效。", path + ".mediaView", nodeId));
        } else {
          const mediaView = rawNode.mediaView;
          if (mediaView.fit !== undefined && (!hasCapability("fit") || !slotCapability.fit?.some((fit) => fit === String(mediaView.fit)))) {
            issues.push(issue("图片适配方式无效。", path + ".mediaView.fit", nodeId));
          }
          if (
            mediaView.zoom !== undefined &&
            (!hasCapability("zoom") || !slotCapability.zoom || !finiteInRange(mediaView.zoom, slotCapability.zoom.min, slotCapability.zoom.max))
          ) {
            issues.push(issue("图片缩放超出当前模板槽位允许范围。", path + ".mediaView.zoom", nodeId));
          }
          const focusByViewport = mediaView.focusByViewport;
          if (focusByViewport !== undefined) {
            if (!isRecord(focusByViewport)) {
              issues.push(issue("图片焦点格式无效。", path + ".mediaView.focusByViewport", nodeId));
            } else {
              for (const [viewport, rawFocus] of Object.entries(focusByViewport)) {
                const focusPath = path + ".mediaView.focusByViewport." + viewport;
                if (!hasCapability("focus") || !slotCapability.focusByViewport || !["desktop", "mobile"].includes(viewport) || !isRecord(rawFocus) || !finiteInRange(rawFocus.x, 0, 100) || !finiteInRange(rawFocus.y, 0, 100)) {
                  issues.push(issue("图片焦点必须位于 0–100 的归一化范围。", focusPath, nodeId));
                }
              }
            }
          }
        }
      }
      if (rawNode.typography !== undefined) {
        if (!textCapability || !hasCapability("typography")) {
          issues.push(issue("当前节点不允许文字排版覆盖。", path + ".typography", nodeId));
        } else if (!isRecord(rawNode.typography)) {
          issues.push(issue("文字布局格式无效。", path + ".typography", nodeId));
        } else {
          const typography = rawNode.typography;
          const sizeLevelToPreset: Record<string, string> = { xs: "small", sm: "small", md: "standard", lg: "large", xl: "large" };
          if (
            typography.sizeLevel !== undefined &&
            !textCapability.sizePresets?.includes(sizeLevelToPreset[String(typography.sizeLevel)])
          ) {
            issues.push(issue("字号级别无效。", path + ".typography.sizeLevel", nodeId));
          }
          if (typography.align !== undefined && !textCapability.align?.some((align) => align === String(typography.align))) {
            issues.push(issue("文字对齐方式无效。", path + ".typography.align", nodeId));
          }
          const tokenColors: Record<string, string[]> = {
            ink: ["#181A1B", "#222222"],
            mineral: ["#5F6568", "#66645F"],
            ivory: ["#FFFFFF", "#F7F8F8", "#FCFCFB", "#F8F7F4"],
          };
          const allowedColors = (textCapability.colorTokens ?? []).flatMap((token) => tokenColors[token] ?? []);
          if (
            typography.color !== undefined &&
            (!isSafeColor(typography.color) || !allowedColors.some((color) => color.toLowerCase() === String(typography.color).toLowerCase()))
          ) {
            issues.push(issue("当前模板不允许该文字颜色。", path + ".typography.color", nodeId));
          }
          if (
            typography.maxLines !== undefined &&
            (!Number.isInteger(Number(typography.maxLines)) || !finiteInRange(typography.maxLines, 1, textCapability.maxLines ?? 12))
          ) {
            issues.push(issue("文字最大行数超出当前角色允许范围。", path + ".typography.maxLines", nodeId));
          }
          if (typography.safeBand !== undefined && !["none", "light", "dark"].includes(String(typography.safeBand))) {
            issues.push(issue("安全文字带值无效。", path + ".typography.safeBand", nodeId));
          }
          if (
            typography.lineHeight !== undefined &&
            !finiteInRange(typography.lineHeight, 1, 2.5)
          ) {
            issues.push(issue("文字行距必须位于 1–2.5 的安全范围。", path + ".typography.lineHeight", nodeId));
          }
          if (
            typography.letterSpacing !== undefined &&
            !finiteInRange(typography.letterSpacing, -0.05, 0.5)
          ) {
            issues.push(issue("文字字间距必须位于 -0.05–0.5em 的安全范围。", path + ".typography.letterSpacing", nodeId));
          }
        }
      }
      const nodeContentFieldKeys = editableObject.contentFieldKeys.includes(nodeId)
        ? [nodeId]
        : editableObject.contentFieldKeys;
      const roleHasContent = nodeContentFieldKeys.some((fieldKey) => {
        const textValue = input.props[fieldKey];
        return typeof textValue === "string" && textValue.trim().length > 0;
      });
      const roleVisible = rawNode.enabled === true || (rawNode.enabled !== false && roleHasContent);
      const roleHasVisualOverride = rawNode.enabled !== undefined || rawNode.rectByViewport !== undefined || rawNode.typography !== undefined;
      if (rawNode.enabled === true && textCapability && !roleHasContent) {
        const contentFieldKey = nodeContentFieldKeys[0] ?? nodeId;
        const contentPath = basePath.endsWith(".__instanceOverrides")
          ? basePath.slice(0, -".__instanceOverrides".length) + "." + contentFieldKey
          : "props." + contentFieldKey;
        issues.push(issue("已启用的文字角色必须填写内容。", contentPath, nodeId));
      }
      if (roleVisible && roleHasVisualOverride && textCapability?.requiresSafeBand) {
        const typography = isRecord(rawNode.typography) ? rawNode.typography : {};
        if (typography.safeBand !== "light" && typography.safeBand !== "dark") {
          issues.push(issue(
            "图片叠字需选择浅色或深色安全文字带后才能发布。",
            path + ".typography.safeBand",
            nodeId,
          ));
        }
      }
    }
    return issues;
  }
  if (overrides.version !== 1) {
    return [issue("实例覆盖格式或版本无效，无法安全应用。")];
  }
  const capabilities = input.contract.editorCapabilities.layoutOverrides ?? {};
  const issues: ContentTemplateIssue[] = [];
  const layout = isRecord(overrides.layout) ? overrides.layout : undefined;
  if (layout) {
    const framePreset = layout.framePreset;
    if (framePreset !== undefined && !capabilities.framePresets?.includes(String(framePreset))) {
      issues.push(issue("当前模板不允许该整体画面预设。", basePath + ".layout.framePreset", "framePreset"));
    }
    const compositionPreset = layout.compositionPreset;
    if (compositionPreset !== undefined && !capabilities.compositionPresets?.includes(String(compositionPreset))) {
      issues.push(issue("当前模板不允许该构图预设。", basePath + ".layout.compositionPreset", "compositionPreset"));
    }
  }
  const slots = isRecord(overrides.slots) ? overrides.slots : {};
  for (const [roleId, value] of Object.entries(slots)) {
    const capability = capabilities.slots?.find((slot) => slot.roleId === roleId);
    const path = basePath + ".slots." + roleId;
    if (!capability || !isRecord(value)) {
      issues.push(issue("当前模板不允许该图片槽位覆盖。", path, roleId));
      continue;
    }
    const checks: Array<[unknown, readonly string[] | undefined, string, string]> = [
      [value.ratioPreset, capability.ratioPresets, "ratioPreset", "图片槽位比例"],
      [value.sizePreset, capability.sizePresets, "sizePreset", "图片槽位尺寸"],
      [value.positionPreset, capability.positionPresets, "positionPreset", "图片槽位位置"],
      [value.fit, capability.fit, "fit", "图片适配方式"],
    ];
    for (const [selected, allowed, key, label] of checks) {
      if (selected !== undefined && !allowed?.includes(String(selected))) {
        issues.push(issue("当前模板不允许该" + label + "。", path + "." + key, roleId));
      }
    }
    if (value.zoom !== undefined) {
      const zoom = Number(value.zoom);
      if (!capability.zoom || !Number.isFinite(zoom) || zoom < capability.zoom.min || zoom > capability.zoom.max) {
        issues.push(issue("图片缩放超出当前模板允许范围。", path + ".zoom", roleId));
      }
    }
    if (value.focusByViewport !== undefined) {
      if (!capability.focusByViewport || !isRecord(value.focusByViewport)) {
        issues.push(issue("当前模板不允许该设备焦点覆盖。", path + ".focusByViewport", roleId));
      } else {
        for (const [viewport, focus] of Object.entries(value.focusByViewport)) {
          if (!["desktop", "mobile"].includes(viewport) || !isRecord(focus)) {
            issues.push(issue("设备焦点格式无效。", path + ".focusByViewport." + viewport, roleId));
            continue;
          }
          const x = Number(focus.x);
          const y = Number(focus.y);
          if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 100 || y < 0 || y > 100) {
            issues.push(issue("设备焦点必须位于 0–100 的归一化范围。", path + ".focusByViewport." + viewport, roleId));
          }
        }
      }
    }
  }
  const textRoles = isRecord(overrides.textRoles) ? overrides.textRoles : {};
  for (const [roleId, value] of Object.entries(textRoles)) {
    const capability = capabilities.textRoles?.find((role) => role.roleId === roleId) ??
      (input.contract.key === "hero" && roleId === "copy"
        ? {
            roleId: "copy",
            placementPresets: ["overlay"],
            widthPresets: ["narrow", "standard", "wide"],
            sizePresets: ["small", "standard", "large"],
            align: ["left", "center", "right"],
            colorTokens: ["ink", "ivory"],
            requiresSafeBand: true,
            maxLines: 4,
          }
        : undefined);
    const path = basePath + ".textRoles." + roleId;
    if (!capability || !isRecord(value)) {
      issues.push(issue("当前模板不允许该文字角色覆盖。", path, roleId));
      continue;
    }
    const checks: Array<[unknown, readonly string[] | undefined, string, string]> = [
      [value.placementPreset, capability.placementPresets, "placementPreset", "文字位置"],
      [value.widthPreset, capability.widthPresets, "widthPreset", "文字宽度"],
      [value.sizePreset, capability.sizePresets, "sizePreset", "字号级别"],
      [value.align, capability.align, "align", "文字对齐"],
      [value.colorToken, capability.colorTokens, "colorToken", "文字颜色"],
    ];
    for (const [selected, allowed, key, label] of checks) {
      if (selected !== undefined && !allowed?.includes(String(selected))) {
        issues.push(issue("当前模板不允许该" + label + "。", path + "." + key, roleId));
      }
    }
    if (value.enabled === true && capability.requiresSafeBand && value.safeBand !== "light" && value.safeBand !== "dark") {
      issues.push(issue("图片叠字需选择浅色或深色安全文字带后才能发布。", path + ".safeBand", roleId));
    }
  }
  return issues;
}

export function getContentTemplateIssues(input: {
  moduleType?: unknown;
  props?: unknown;
  blockId?: unknown;
  path?: string;
}): ContentTemplateIssue[] {
  const moduleType = typeof input.moduleType === "string" ? input.moduleType : "";
  const contract = getContentTemplateContract(moduleType);
  if (!contract) return [];

  const props = isRecord(input.props) ? input.props : {};
  const blockId = typeof input.blockId === "string" && input.blockId.trim()
    ? input.blockId
    : typeof props.id === "string" && props.id.trim()
      ? props.id
      : undefined;
  const path = input.path || "props.__contentTemplate";
  const marker = props.__contentTemplate;
  const base = { layer: "contract" as const, blockId, moduleType, path };
  const overrideIssues = getInstanceOverrideIssues({
    contract,
    props,
    blockId,
    moduleType,
    basePath: path.endsWith(".__contentTemplate")
      ? path.slice(0, -".__contentTemplate".length) + ".__instanceOverrides"
      : "props.__instanceOverrides",
  });

  if (marker === undefined) {
    if (props.__instanceOverrides !== undefined) {
      return [{
        ...base,
        code: "content-template-marker-invalid",
        severity: "error",
        message: "实例覆盖缺少当前内容模板版本印记，不能按旧合同猜测渲染。",
      }, ...overrideIssues];
    }
    return [{
      ...base,
      code: "content-template-legacy",
      severity: "info",
      message: "历史区块未携带内容模板版本印记，按 legacy-0 兼容读取；普通保存不会自动升级。",
    }, ...overrideIssues];
  }
  if (!isRecord(marker)) {
    return [{
      ...base,
      code: "content-template-marker-invalid",
      severity: "error",
      message: "内容模板版本印记格式无效，无法确定兼容合同。",
    }];
  }
  const markerKey = marker.key;
  const markerVersion = marker.version;
  if (typeof markerKey !== "string" || !Number.isInteger(markerVersion) || typeof markerVersion !== "number" || markerVersion <= 0) {
    return [{
      ...base,
      code: "content-template-marker-invalid",
      severity: "error",
      message: "内容模板版本印记格式无效，无法确定兼容合同。",
    }];
  }
  if (markerKey !== contract.key) {
    return [{
      ...base,
      code: "content-template-key-mismatch",
      severity: "error",
      message: "区块类型与内容模板版本印记不匹配，无法使用当前模板合同渲染。",
    }];
  }
  if (markerVersion !== contract.version) {
    if (markerVersion === 1 && contract.version === 2 && props.__instanceOverrides === undefined) {
      return [{
        ...base,
        code: "content-template-legacy",
        severity: "info",
        message: "内容模板版本 1 按原构图兼容读取；普通保存不会自动升级到实例覆盖合同。",
      }];
    }
    return [{
      ...base,
      code: "content-template-version-unsupported",
      severity: "error",
      message: "内容模板版本暂不受支持，无法猜测为当前版本。",
    }];
  }
  return overrideIssues;
}

export function getContentTemplateCompletion(
  moduleType: string,
  props: unknown,
): ContentTemplateCompletion | undefined {
  const contract = getContentTemplateContract(moduleType);
  if (!contract) return undefined;
  const values = isRecord(props) ? props : {};
  const missingMedia = contract.media
    .filter((slot) =>
      slot.required &&
      !hasNonEmptyText(getCompatibilityRoleValue(moduleType, slot.key, values)))
    .map((slot) => slot.key);
  const missingText = contract.contentBudget.requiredText
    .filter((key) => !hasNonEmptyText(values[key]));
  const invalidCollections = contract.roles.flatMap((role) => {
    if (!role.quantity) return [];
    const collection = getQuantifiedCollectionValue(contract, role.id, values);
    const count = collection?.value.length ?? 0;
    return count < role.quantity.min || count > role.quantity.max
      ? [{
          roleId: role.id,
          fieldKey: collection?.fieldKey ?? role.id,
          count,
          min: role.quantity.min,
          max: role.quantity.max,
        }]
      : [];
  });
  const missingAttestations = contract.roles.flatMap((role) => {
    const attestation = role.publicationAttestation;
    if (!attestation) return [];
    const collection = getQuantifiedCollectionValue(contract, role.id, values);
    if (!collection) return [];
    return collection.value.flatMap((item, index) =>
      !isRecord(item) || item[attestation.fieldKey] !== true
        ? [{
            roleId: role.id,
            collectionFieldKey: collection.fieldKey,
            attestationFieldKey: attestation.fieldKey,
            label: attestation.label,
            index,
          }]
        : [],
    );
  });
  const issues = getContentTemplateIssues({ moduleType, props: values });
  return {
    material: { complete: missingMedia.length === 0, missing: missingMedia },
    content: { complete: missingText.length === 0, missing: missingText },
    collections: { complete: invalidCollections.length === 0, invalid: invalidCollections },
    attestations: { complete: missingAttestations.length === 0, missing: missingAttestations },
    publish: {
      complete: !issues.some((issue) => issue.severity === "error"),
      issues,
    },
  };
}
