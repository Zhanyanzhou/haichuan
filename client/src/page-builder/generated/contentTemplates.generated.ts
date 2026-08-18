/**
 * 自动生成，禁止手改。
 * 来源：contracts/page-builder/content-templates.contract.json
 * SHA-256：3c6fa91e6a81bf5dc173857fedf79ee1ea2bae51cc350def9c149d944571c234
 */

export const CONTENT_TEMPLATE_REGISTRY_VERSION = 2;
export const CONTENT_TEMPLATE_CONTRACT_VERSION = 1;

export type RegisteredContentTemplateKey = "hero" | "fullBleed" | "video" | "carousel" | "singlePoster" | "doublePoster" | "textBanner" | "journey" | "comparison" | "featuredProduct" | "productRow" | "gallery" | "wearingInspiration" | "categoryCards" | "sceneShopping" | "hotspot" | "brandPoints" | "servicePromises" | "certificates" | "storeInfo" | "testimonials" | "booking" | "limitedEvent";
export type ContentTemplateKey = RegisteredContentTemplateKey;
export type ContentTemplateMaster = "asymmetric-gallery" | "booking-epilogue" | "brand-points" | "category-navigation" | "cinematic-hero" | "cinematic-video" | "comparison-stage" | "editorial-journey" | "editorial-split" | "editorial-story" | "editorial-text" | "event-stage" | "hotspot-stage" | "immersive-image" | "product-focus" | "product-grid" | "scene-navigation" | "sequence-stage" | "service-policy" | "store-visit" | "testimonial-proof" | "trust-gallery" | "wearing-story";

export type MediaSlot = {
  key: string;
  required: boolean;
  desktopRatio?: string;
  tabletRatio?: string;
  mobileRatio?: string;
};

export type ContentTemplateContract = {
  key: ContentTemplateKey;
  moduleType: string;
  displayName: string;
  version: number;
  master: ContentTemplateMaster;
  visualRole: "primary-stage" | "feature-stage" | "support-stage";
  visualWeight: "primary-stage" | "feature-stage" | "support-stage";
  heightModeByViewport: Record<"desktop" | "tablet" | "mobile", "viewport" | "ratio" | "content">;
  width: "full" | "standard" | "wide" | "editorial";
  flow: "bleed" | "flow";
  copyPlacementByViewport: Record<"desktop" | "tablet" | "mobile", "overlay" | "stacked" | "split">;
  spacingPolicy: readonly ("compact" | "normal" | "spacious")[];
  media: readonly MediaSlot[];
  roles: readonly {
    id: string;
    role: ContentTemplateSkeletonRole;
    kind: string;
    required: boolean;
    semantic?: string;
    previewRoles?: readonly ContentTemplateSkeletonRole[];
    appliesTo?: readonly ("desktop" | "tablet" | "mobile")[];
    fallbackRoleId?: string;
    parentRole?: string;
    positioning?: string;
    proof?: string;
    relation?: string;
    emphasis?: string;
    quantity?: { default: number; min: number; max: number };
    defaultRatioByViewport?: Partial<Record<"desktop" | "tablet" | "mobile", string>>;
    allowedRatioPresetsByViewport?: Partial<Record<"desktop" | "tablet" | "mobile", readonly string[]>>;
  }[];
  order: Record<"desktop" | "tablet" | "mobile", readonly string[]>;
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
  desktopCopyRatio?: number;
  desktopMediaRatio?: number;
  tabletCopyRatio?: number;
  tabletMediaRatio?: number;
};

export type ContentTemplateMarker = {
  key: ContentTemplateKey;
  version: number;
};

export type ContentTemplateSkeletonRole =
  | "media" | "mainMedia" | "detailMedia" | "copy" | "action" | "marker"
  | "timeline" | "list" | "card" | "quote" | "form";

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
  heightModeByViewport: Record<"desktop" | "tablet" | "mobile", "viewport" | "ratio" | "content">;
  width: "full" | "standard" | "wide" | "editorial";
  flow: "bleed" | "flow";
  slots: readonly { key: string; role: ContentTemplateSkeletonRole; desktopRatio?: string; tabletRatio?: string; mobileRatio?: string }[];
  order: Record<"desktop" | "tablet" | "mobile", readonly ContentTemplateSkeletonRole[]>;
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
    | "page-validation";
  severity: ContentTemplateIssueSeverity;
  layer: "contract" | "page";
  blockId?: string;
  moduleType?: string;
  path: string;
  message: string;
};

export type ContentTemplateCompletion = {
  material: { complete: boolean; missing: string[] };
  content: { complete: boolean; missing: string[] };
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
    "implementationStatus": "planned",
    "key": "video",
    "moduleType": "视频区块"
  },
  {
    "category": "视觉展示",
    "displayName": "轮播",
    "implementationStatus": "planned",
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
    "implementationStatus": "planned",
    "key": "journey",
    "moduleType": "定制流程"
  },
  {
    "category": "图文内容",
    "displayName": "前后对比",
    "implementationStatus": "planned",
    "key": "comparison",
    "moduleType": "改款对比"
  },
  {
    "category": "商品展示",
    "displayName": "单品展示",
    "implementationStatus": "planned",
    "key": "featuredProduct",
    "moduleType": "单品焦点推荐"
  },
  {
    "category": "商品展示",
    "displayName": "商品列表",
    "implementationStatus": "planned",
    "key": "productRow",
    "moduleType": "产品展示行"
  },
  {
    "category": "商品展示",
    "displayName": "作品画廊",
    "implementationStatus": "planned",
    "key": "gallery",
    "moduleType": "作品画廊"
  },
  {
    "category": "商品展示",
    "displayName": "佩戴展示",
    "implementationStatus": "planned",
    "key": "wearingInspiration",
    "moduleType": "佩戴灵感"
  },
  {
    "category": "导航入口",
    "displayName": "品类入口",
    "implementationStatus": "planned",
    "key": "categoryCards",
    "moduleType": "分类卡片"
  },
  {
    "category": "导航入口",
    "displayName": "场景入口",
    "implementationStatus": "planned",
    "key": "sceneShopping",
    "moduleType": "按场景选购"
  },
  {
    "category": "导航入口",
    "displayName": "图片热区",
    "implementationStatus": "planned",
    "key": "hotspot",
    "moduleType": "热区图"
  },
  {
    "category": "服务信息",
    "displayName": "品牌要点",
    "implementationStatus": "planned",
    "key": "brandPoints",
    "moduleType": "卡片网格"
  },
  {
    "category": "服务信息",
    "displayName": "服务承诺",
    "implementationStatus": "planned",
    "key": "servicePromises",
    "moduleType": "服务承诺"
  },
  {
    "category": "服务信息",
    "displayName": "证书展示",
    "implementationStatus": "planned",
    "key": "certificates",
    "moduleType": "资质证书"
  },
  {
    "category": "服务信息",
    "displayName": "门店信息",
    "implementationStatus": "planned",
    "key": "storeInfo",
    "moduleType": "门店信息"
  },
  {
    "category": "服务信息",
    "displayName": "顾客分享",
    "implementationStatus": "planned",
    "key": "testimonials",
    "moduleType": "真实评价与实拍"
  },
  {
    "category": "服务信息",
    "displayName": "预约入口",
    "implementationStatus": "planned",
    "key": "booking",
    "moduleType": "预约入口"
  },
  {
    "category": "活动内容",
    "displayName": "限时活动",
    "implementationStatus": "planned",
    "key": "limitedEvent",
    "moduleType": "限时活动"
  }
] as const;

/** 23 个真实 Renderer 的完整 schema v2 合同；implementationStatus 不再决定可否渲染。 */
export const CONTENT_TEMPLATE_CONTRACTS = {
  "booking": {
    "allowedControls": [],
    "contentBudget": {
      "limits": {},
      "maxCtas": 1,
      "requiredText": []
    },
    "copyPlacementByViewport": {
      "desktop": "stacked",
      "mobile": "stacked",
      "tablet": "stacked"
    },
    "displayName": "预约入口",
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content",
      "tablet": "content"
    },
    "key": "booking",
    "master": "booking-epilogue",
    "media": [],
    "moduleType": "预约入口",
    "order": {
      "desktop": [
        "copy",
        "primaryAction",
        "secondaryContact"
      ],
      "mobile": [
        "copy",
        "primaryAction",
        "secondaryContact"
      ],
      "tablet": [
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
    "version": 1,
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
      "mobile": "stacked",
      "tablet": "stacked"
    },
    "displayName": "品牌要点",
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content",
      "tablet": "content"
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
      ],
      "tablet": [
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
    "version": 1,
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
      "mobile": "stacked",
      "tablet": "overlay"
    },
    "displayName": "轮播",
    "flow": "bleed",
    "heightModeByViewport": {
      "desktop": "ratio",
      "mobile": "ratio",
      "tablet": "ratio"
    },
    "key": "carousel",
    "master": "sequence-stage",
    "media": [
      {
        "desktopRatio": "21 / 6",
        "key": "frames",
        "mobileRatio": "3 / 4",
        "required": false,
        "tabletRatio": "21 / 6"
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
      ],
      "tablet": [
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
            "3 / 4"
          ],
          "tablet": [
            "21 / 6"
          ]
        },
        "defaultRatioByViewport": {
          "desktop": "21 / 6",
          "mobile": "3 / 4",
          "tablet": "21 / 6"
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
    "version": 1,
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
      "mobile": "stacked",
      "tablet": "stacked"
    },
    "displayName": "品类入口",
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content",
      "tablet": "content"
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
      ],
      "tablet": [
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
            "1 / 1"
          ],
          "mobile": [
            "4 / 5"
          ],
          "tablet": [
            "1 / 1"
          ]
        },
        "defaultRatioByViewport": {
          "desktop": "1 / 1",
          "mobile": "4 / 5",
          "tablet": "1 / 1"
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
    "version": 1,
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
      "mobile": "stacked",
      "tablet": "stacked"
    },
    "displayName": "证书展示",
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content",
      "tablet": "content"
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
      ],
      "tablet": [
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
            "3 / 2"
          ],
          "mobile": [
            "3 / 2"
          ],
          "tablet": [
            "3 / 2"
          ]
        },
        "defaultRatioByViewport": {
          "desktop": "3 / 2",
          "mobile": "3 / 2",
          "tablet": "3 / 2"
        },
        "id": "certificates",
        "kind": "collection",
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
    "version": 1,
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
      "mobile": "stacked",
      "tablet": "stacked"
    },
    "displayName": "前后对比",
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "ratio",
      "mobile": "content",
      "tablet": "ratio"
    },
    "key": "comparison",
    "master": "comparison-stage",
    "media": [
      {
        "desktopRatio": "4 / 5",
        "key": "before",
        "mobileRatio": "4 / 5",
        "required": false,
        "tabletRatio": "4 / 5"
      },
      {
        "desktopRatio": "4 / 5",
        "key": "after",
        "mobileRatio": "4 / 5",
        "required": false,
        "tabletRatio": "4 / 5"
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
      ],
      "tablet": [
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
            "4 / 5"
          ],
          "mobile": [
            "4 / 5"
          ],
          "tablet": [
            "4 / 5"
          ]
        },
        "defaultRatioByViewport": {
          "desktop": "4 / 5",
          "mobile": "4 / 5",
          "tablet": "4 / 5"
        },
        "id": "before",
        "kind": "media",
        "required": false,
        "role": "mainMedia"
      },
      {
        "allowedRatioPresetsByViewport": {
          "desktop": [
            "4 / 5"
          ],
          "mobile": [
            "4 / 5"
          ],
          "tablet": [
            "4 / 5"
          ]
        },
        "defaultRatioByViewport": {
          "desktop": "4 / 5",
          "mobile": "4 / 5",
          "tablet": "4 / 5"
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
    "version": 1,
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
      "mobile": "stacked",
      "tablet": "split"
    },
    "displayName": "双图文",
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content",
      "tablet": "content"
    },
    "key": "doublePoster",
    "master": "editorial-story",
    "media": [
      {
        "desktopRatio": "3 / 2",
        "key": "mainImage",
        "mobileRatio": "3 / 2",
        "required": true,
        "tabletRatio": "3 / 2"
      },
      {
        "desktopRatio": "4 / 5",
        "key": "detailImage",
        "mobileRatio": "4 / 5",
        "required": true,
        "tabletRatio": "4 / 5"
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
      ],
      "tablet": [
        "mainImage",
        "detailImage",
        "copy",
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
            "3 / 2"
          ],
          "mobile": [
            "3 / 2"
          ],
          "tablet": [
            "3 / 2"
          ]
        },
        "defaultRatioByViewport": {
          "desktop": "3 / 2",
          "mobile": "3 / 2",
          "tablet": "3 / 2"
        },
        "id": "mainImage",
        "kind": "media",
        "required": true,
        "role": "mainMedia"
      },
      {
        "allowedRatioPresetsByViewport": {
          "desktop": [
            "4 / 5"
          ],
          "mobile": [
            "4 / 5"
          ],
          "tablet": [
            "4 / 5"
          ]
        },
        "defaultRatioByViewport": {
          "desktop": "4 / 5",
          "mobile": "4 / 5",
          "tablet": "4 / 5"
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
    "version": 1,
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
      "mobile": "stacked",
      "tablet": "stacked"
    },
    "displayName": "单品展示",
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content",
      "tablet": "content"
    },
    "key": "featuredProduct",
    "master": "product-focus",
    "media": [
      {
        "desktopRatio": "4 / 5",
        "key": "product",
        "mobileRatio": "4 / 5",
        "required": false,
        "tabletRatio": "4 / 5"
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
      ],
      "tablet": [
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
            "column": 1,
            "role": "media",
            "roleId": "product",
            "row": 1,
            "rowSpan": 7,
            "span": 7
          },
          {
            "column": 9,
            "role": "copy",
            "roleId": "copy",
            "row": 2,
            "rowSpan": 2,
            "span": 4
          },
          {
            "column": 9,
            "role": "list",
            "roleId": "list",
            "row": 5,
            "rowSpan": 1,
            "span": 3
          },
          {
            "column": 9,
            "role": "action",
            "roleId": "action",
            "row": 7,
            "rowSpan": 1,
            "span": 2
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
            "4 / 5"
          ],
          "mobile": [
            "4 / 5"
          ],
          "tablet": [
            "4 / 5"
          ]
        },
        "defaultRatioByViewport": {
          "desktop": "4 / 5",
          "mobile": "4 / 5",
          "tablet": "4 / 5"
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
    "version": 1,
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
        "subtitle": 48,
        "title": 24
      },
      "maxCtas": 1,
      "requiredText": []
    },
    "copyPlacementByViewport": {
      "desktop": "stacked",
      "mobile": "stacked",
      "tablet": "stacked"
    },
    "displayName": "通栏图",
    "flow": "bleed",
    "heightModeByViewport": {
      "desktop": "ratio",
      "mobile": "ratio",
      "tablet": "ratio"
    },
    "key": "fullBleed",
    "master": "immersive-image",
    "media": [
      {
        "desktopRatio": "21 / 6",
        "key": "image",
        "required": true,
        "tabletRatio": "16 / 7"
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
      ],
      "tablet": [
        "image",
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
          ],
          "tablet": [
            "16 / 7"
          ]
        },
        "appliesTo": [
          "desktop",
          "tablet"
        ],
        "defaultRatioByViewport": {
          "desktop": "21 / 6",
          "tablet": "16 / 7"
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
    "version": 1,
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
      "mobile": "stacked",
      "tablet": "stacked"
    },
    "displayName": "作品画廊",
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content",
      "tablet": "content"
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
      ],
      "tablet": [
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
            "4 / 5"
          ],
          "mobile": [
            "4 / 5"
          ],
          "tablet": [
            "4 / 5"
          ]
        },
        "defaultRatioByViewport": {
          "desktop": "4 / 5",
          "mobile": "4 / 5",
          "tablet": "4 / 5"
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
    "version": 1,
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
        "subtitle": 48,
        "title": 24
      },
      "maxCtas": 1,
      "requiredText": []
    },
    "copyPlacementByViewport": {
      "desktop": "overlay",
      "mobile": "stacked",
      "tablet": "stacked"
    },
    "displayName": "首屏",
    "flow": "bleed",
    "heightModeByViewport": {
      "desktop": "viewport",
      "mobile": "content",
      "tablet": "content"
    },
    "key": "hero",
    "master": "cinematic-hero",
    "media": [
      {
        "desktopRatio": "16 / 7",
        "key": "desktopImage",
        "required": true,
        "tabletRatio": "16 / 7"
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
      ],
      "tablet": [
        "desktopImage",
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
        "tone": "dark",
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
            "16 / 7"
          ],
          "tablet": [
            "16 / 7"
          ]
        },
        "appliesTo": [
          "desktop",
          "tablet"
        ],
        "defaultRatioByViewport": {
          "desktop": "16 / 7",
          "tablet": "16 / 7"
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
    "version": 1,
    "visualRole": "primary-stage",
    "visualWeight": "primary-stage",
    "width": "full"
  },
  "hotspot": {
    "allowedControls": [],
    "contentBudget": {
      "limits": {},
      "maxCtas": 0,
      "requiredText": []
    },
    "copyPlacementByViewport": {
      "desktop": "stacked",
      "mobile": "stacked",
      "tablet": "stacked"
    },
    "displayName": "图片热区",
    "flow": "bleed",
    "heightModeByViewport": {
      "desktop": "ratio",
      "mobile": "ratio",
      "tablet": "ratio"
    },
    "key": "hotspot",
    "master": "hotspot-stage",
    "media": [
      {
        "desktopRatio": "16 / 9",
        "key": "sceneImage",
        "mobileRatio": "3 / 4",
        "required": true,
        "tabletRatio": "16 / 9"
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
      ],
      "tablet": [
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
            "3 / 4"
          ],
          "tablet": [
            "16 / 9"
          ]
        },
        "defaultRatioByViewport": {
          "desktop": "16 / 9",
          "mobile": "3 / 4",
          "tablet": "16 / 9"
        },
        "id": "sceneImage",
        "kind": "media",
        "required": true,
        "role": "media"
      },
      {
        "allowedRatioPresetsByViewport": {},
        "defaultRatioByViewport": {},
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
    "version": 1,
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
      "mobile": "stacked",
      "tablet": "stacked"
    },
    "displayName": "内容流程",
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content",
      "tablet": "content"
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
      ],
      "tablet": [
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
        "allowedRatioPresetsByViewport": {},
        "defaultRatioByViewport": {},
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
    "version": 1,
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
      "mobile": "stacked",
      "tablet": "overlay"
    },
    "displayName": "限时活动",
    "flow": "bleed",
    "heightModeByViewport": {
      "desktop": "ratio",
      "mobile": "content",
      "tablet": "ratio"
    },
    "key": "limitedEvent",
    "master": "event-stage",
    "media": [
      {
        "desktopRatio": "16 / 7",
        "key": "event",
        "mobileRatio": "4 / 5",
        "required": false,
        "tabletRatio": "16 / 7"
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
      ],
      "tablet": [
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
            "16 / 7"
          ],
          "mobile": [
            "4 / 5"
          ],
          "tablet": [
            "16 / 7"
          ]
        },
        "defaultRatioByViewport": {
          "desktop": "16 / 7",
          "mobile": "4 / 5",
          "tablet": "16 / 7"
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
    "version": 1,
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
      "mobile": "stacked",
      "tablet": "stacked"
    },
    "displayName": "商品列表",
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content",
      "tablet": "content"
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
      ],
      "tablet": [
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
          ],
          "tablet": [
            2,
            3
          ]
        },
        "defaultByViewport": {
          "desktop": 3,
          "mobile": 2,
          "tablet": 2
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
            "3 / 4"
          ],
          "mobile": [
            "3 / 4"
          ],
          "tablet": [
            "3 / 4"
          ]
        },
        "defaultRatioByViewport": {
          "desktop": "3 / 4",
          "mobile": "3 / 4",
          "tablet": "3 / 4"
        },
        "id": "productCards",
        "kind": "business",
        "quantity": {
          "default": 3,
          "max": 4,
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
    "version": 1,
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
      "mobile": "stacked",
      "tablet": "stacked"
    },
    "displayName": "场景入口",
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content",
      "tablet": "content"
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
      ],
      "tablet": [
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
            "4 / 5"
          ],
          "mobile": [
            "4 / 5"
          ],
          "tablet": [
            "4 / 5"
          ]
        },
        "defaultRatioByViewport": {
          "desktop": "4 / 5",
          "mobile": "4 / 5",
          "tablet": "4 / 5"
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
    "version": 1,
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
      "mobile": "stacked",
      "tablet": "stacked"
    },
    "displayName": "服务承诺",
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content",
      "tablet": "content"
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
      ],
      "tablet": [
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
    "version": 1,
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
      "mobile": "stacked",
      "tablet": "split"
    },
    "displayName": "单图文",
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content",
      "tablet": "content"
    },
    "key": "singlePoster",
    "master": "editorial-split",
    "media": [
      {
        "desktopRatio": "4 / 5",
        "key": "desktopImage",
        "required": true,
        "tabletRatio": "4 / 5"
      },
      {
        "key": "mobileImage",
        "mobileRatio": "3 / 4",
        "required": false
      }
    ],
    "moduleType": "单图海报",
    "order": {
      "desktop": [
        "copy",
        "action",
        "desktopImage"
      ],
      "mobile": [
        "mobileImage",
        "copy",
        "action"
      ],
      "tablet": [
        "copy",
        "action",
        "desktopImage"
      ]
    },
    "presets": [],
    "preview": {
      "desktop": {
        "order": [
          "copy",
          "action",
          "desktopImage"
        ],
        "tone": "light",
        "zones": [
          {
            "column": 1,
            "role": "copy",
            "roleId": "copy",
            "row": 3,
            "rowSpan": 3,
            "span": 4
          },
          {
            "column": 1,
            "role": "action",
            "roleId": "action",
            "row": 7,
            "rowSpan": 1,
            "span": 3
          },
          {
            "column": 6,
            "role": "media",
            "roleId": "desktopImage",
            "row": 1,
            "rowSpan": 8,
            "span": 7
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
      "purpose": "单一主图与编辑式章节叙事",
      "visualRole": "feature-stage"
    },
    "roles": [
      {
        "allowedRatioPresetsByViewport": {
          "desktop": [
            "4 / 5"
          ],
          "tablet": [
            "4 / 5"
          ]
        },
        "appliesTo": [
          "desktop",
          "tablet"
        ],
        "defaultRatioByViewport": {
          "desktop": "4 / 5",
          "tablet": "4 / 5"
        },
        "id": "desktopImage",
        "kind": "media",
        "required": true,
        "role": "media"
      },
      {
        "allowedRatioPresetsByViewport": {
          "mobile": [
            "3 / 4"
          ]
        },
        "appliesTo": [
          "mobile"
        ],
        "defaultRatioByViewport": {
          "mobile": "3 / 4"
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
    "version": 1,
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
      "mobile": "stacked",
      "tablet": "stacked"
    },
    "displayName": "门店信息",
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content",
      "tablet": "content"
    },
    "key": "storeInfo",
    "master": "store-visit",
    "media": [
      {
        "desktopRatio": "3 / 2",
        "key": "store",
        "mobileRatio": "4 / 5",
        "required": false,
        "tabletRatio": "3 / 2"
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
      ],
      "tablet": [
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
            "3 / 2"
          ],
          "mobile": [
            "4 / 5"
          ],
          "tablet": [
            "3 / 2"
          ]
        },
        "defaultRatioByViewport": {
          "desktop": "3 / 2",
          "mobile": "4 / 5",
          "tablet": "3 / 2"
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
    "version": 1,
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
      "mobile": "stacked",
      "tablet": "stacked"
    },
    "displayName": "顾客分享",
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content",
      "tablet": "content"
    },
    "key": "testimonials",
    "master": "testimonial-proof",
    "media": [
      {
        "desktopRatio": "4 / 5",
        "key": "authorizedPhoto",
        "mobileRatio": "4 / 5",
        "required": true,
        "tabletRatio": "4 / 5"
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
      ],
      "tablet": [
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
            "4 / 5"
          ],
          "mobile": [
            "4 / 5"
          ],
          "tablet": [
            "4 / 5"
          ]
        },
        "defaultRatioByViewport": {
          "desktop": "4 / 5",
          "mobile": "4 / 5",
          "tablet": "4 / 5"
        },
        "id": "authorizedPhoto",
        "kind": "media",
        "proof": "authorized-customer-photo",
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
    "version": 1,
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
      "mobile": "stacked",
      "tablet": "stacked"
    },
    "displayName": "纯文字",
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content",
      "tablet": "content"
    },
    "key": "textBanner",
    "master": "editorial-text",
    "media": [
      {
        "desktopRatio": "21 / 6",
        "key": "bgImage",
        "required": false,
        "tabletRatio": "21 / 6"
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
      ],
      "tablet": [
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
            "column": 3,
            "role": "copy",
            "roleId": "copy",
            "row": 3,
            "rowSpan": 3,
            "span": 8
          },
          {
            "column": 5,
            "role": "action",
            "roleId": "action",
            "row": 7,
            "rowSpan": 1,
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
          ],
          "tablet": [
            "21 / 6"
          ]
        },
        "appliesTo": [
          "desktop",
          "tablet"
        ],
        "defaultRatioByViewport": {
          "desktop": "21 / 6",
          "tablet": "21 / 6"
        },
        "id": "bgImage",
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
      "normal",
      "spacious"
    ],
    "supportsLinkTarget": true,
    "version": 1,
    "visualRole": "support-stage",
    "visualWeight": "support-stage",
    "width": "editorial"
  },
  "video": {
    "allowedControls": [],
    "contentBudget": {
      "limits": {},
      "maxCtas": 1,
      "requiredText": []
    },
    "copyPlacementByViewport": {
      "desktop": "overlay",
      "mobile": "stacked",
      "tablet": "overlay"
    },
    "displayName": "视频",
    "flow": "bleed",
    "heightModeByViewport": {
      "desktop": "ratio",
      "mobile": "ratio",
      "tablet": "ratio"
    },
    "key": "video",
    "master": "cinematic-video",
    "media": [
      {
        "desktopRatio": "16 / 9",
        "key": "coverImage",
        "mobileRatio": "4 / 5",
        "required": true,
        "tabletRatio": "16 / 9"
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
      ],
      "tablet": [
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
            "16 / 7",
            "3 / 4"
          ],
          "mobile": [
            "4 / 5",
            "3 / 4"
          ],
          "tablet": [
            "16 / 9",
            "16 / 7"
          ]
        },
        "defaultRatioByViewport": {
          "desktop": "16 / 9",
          "mobile": "4 / 5",
          "tablet": "16 / 9"
        },
        "id": "coverImage",
        "kind": "media",
        "required": true,
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
    "version": 1,
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
      "mobile": "stacked",
      "tablet": "stacked"
    },
    "displayName": "佩戴展示",
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content",
      "tablet": "content"
    },
    "key": "wearingInspiration",
    "master": "wearing-story",
    "media": [
      {
        "desktopRatio": "4 / 5",
        "key": "wearingImage",
        "mobileRatio": "3 / 4",
        "required": false,
        "tabletRatio": "4 / 5"
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
      ],
      "tablet": [
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
        "tone": "light",
        "zones": [
          {
            "column": 1,
            "role": "mainMedia",
            "roleId": "wearingImage",
            "row": 1,
            "rowSpan": 7,
            "span": 7
          },
          {
            "column": 9,
            "role": "copy",
            "roleId": "copy",
            "row": 2,
            "rowSpan": 2,
            "span": 4
          },
          {
            "column": 10,
            "role": "detailMedia",
            "roleId": "relatedProducts",
            "row": 5,
            "rowSpan": 2,
            "span": 3
          },
          {
            "column": 9,
            "role": "action",
            "roleId": "action",
            "row": 7,
            "rowSpan": 1,
            "span": 2
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
            "4 / 5"
          ],
          "mobile": [
            "3 / 4"
          ],
          "tablet": [
            "4 / 5"
          ]
        },
        "defaultRatioByViewport": {
          "desktop": "4 / 5",
          "mobile": "3 / 4",
          "tablet": "4 / 5"
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
    "version": 1,
    "visualRole": "feature-stage",
    "visualWeight": "feature-stage",
    "width": "wide"
  }
} as const satisfies Record<ContentTemplateKey, ContentTemplateContract>;

/** 仅表达 planned 模板的可见基础框架；不承担业务、发布或 Inspector 完整合同。 */
export const CONTENT_TEMPLATE_SKELETONS = {
  "booking": {
    "category": "服务信息",
    "displayName": "预约入口",
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content",
      "tablet": "content"
    },
    "key": "booking",
    "moduleType": "预约入口",
    "order": {
      "desktop": [
        "copy",
        "action",
        "marker"
      ],
      "mobile": [
        "copy",
        "action",
        "marker"
      ],
      "tablet": [
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
      "mobile": "content",
      "tablet": "content"
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
      ],
      "tablet": [
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
      "mobile": "ratio",
      "tablet": "ratio"
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
      ],
      "tablet": [
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
        "mobileRatio": "3 / 4",
        "role": "media",
        "tabletRatio": "21 / 6"
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
      "mobile": "content",
      "tablet": "content"
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
      ],
      "tablet": [
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
        "role": "card",
        "tabletRatio": "1 / 1"
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
      "mobile": "content",
      "tablet": "content"
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
      ],
      "tablet": [
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
        "role": "card",
        "tabletRatio": "3 / 2"
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
      "mobile": "content",
      "tablet": "ratio"
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
      ],
      "tablet": [
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
        "role": "mainMedia",
        "tabletRatio": "4 / 5"
      },
      {
        "desktopRatio": "4 / 5",
        "key": "after",
        "mobileRatio": "4 / 5",
        "role": "detailMedia",
        "tabletRatio": "4 / 5"
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
  "featuredProduct": {
    "category": "商品展示",
    "displayName": "单品展示",
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content",
      "tablet": "content"
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
      ],
      "tablet": [
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
          "rowSpan": 7,
          "span": 7
        },
        {
          "column": 9,
          "role": "copy",
          "row": 2,
          "rowSpan": 2,
          "span": 4
        },
        {
          "column": 9,
          "role": "list",
          "row": 5,
          "rowSpan": 1,
          "span": 3
        },
        {
          "column": 9,
          "role": "action",
          "row": 7,
          "rowSpan": 1,
          "span": 2
        }
      ],
      "tone": "light"
    },
    "slots": [
      {
        "desktopRatio": "4 / 5",
        "key": "product",
        "mobileRatio": "4 / 5",
        "role": "media",
        "tabletRatio": "4 / 5"
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
  "gallery": {
    "category": "商品展示",
    "displayName": "作品画廊",
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content",
      "tablet": "content"
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
      ],
      "tablet": [
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
        "role": "media",
        "tabletRatio": "4 / 5"
      },
      {
        "key": "copy",
        "role": "copy"
      }
    ],
    "visualRole": "feature-stage",
    "width": "full"
  },
  "hotspot": {
    "category": "导航入口",
    "displayName": "图片热区",
    "flow": "bleed",
    "heightModeByViewport": {
      "desktop": "ratio",
      "mobile": "ratio",
      "tablet": "ratio"
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
      ],
      "tablet": [
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
        "mobileRatio": "3 / 4",
        "role": "media",
        "tabletRatio": "16 / 9"
      },
      {
        "key": "hotspots",
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
      "mobile": "content",
      "tablet": "content"
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
      ],
      "tablet": [
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
        "key": "steps",
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
      "mobile": "content",
      "tablet": "ratio"
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
      ],
      "tablet": [
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
        "desktopRatio": "16 / 7",
        "key": "event",
        "mobileRatio": "4 / 5",
        "role": "media",
        "tabletRatio": "16 / 7"
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
      "mobile": "content",
      "tablet": "content"
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
      ],
      "tablet": [
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
        "desktopRatio": "3 / 4",
        "key": "productCards",
        "mobileRatio": "3 / 4",
        "role": "card",
        "tabletRatio": "3 / 4"
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
      "mobile": "content",
      "tablet": "content"
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
      ],
      "tablet": [
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
        "role": "card",
        "tabletRatio": "4 / 5"
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
      "mobile": "content",
      "tablet": "content"
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
      ],
      "tablet": [
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
  "storeInfo": {
    "category": "服务信息",
    "displayName": "门店信息",
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content",
      "tablet": "content"
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
      ],
      "tablet": [
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
        "mobileRatio": "4 / 5",
        "role": "media",
        "tabletRatio": "3 / 2"
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
      "mobile": "content",
      "tablet": "content"
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
      ],
      "tablet": [
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
        "role": "media",
        "tabletRatio": "4 / 5"
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
  "video": {
    "category": "视觉展示",
    "displayName": "视频",
    "flow": "bleed",
    "heightModeByViewport": {
      "desktop": "ratio",
      "mobile": "ratio",
      "tablet": "ratio"
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
      ],
      "tablet": [
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
        "role": "media",
        "tabletRatio": "16 / 9"
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
      "mobile": "content",
      "tablet": "content"
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
      ],
      "tablet": [
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
          "rowSpan": 7,
          "span": 7
        },
        {
          "column": 9,
          "role": "copy",
          "row": 2,
          "rowSpan": 2,
          "span": 4
        },
        {
          "column": 10,
          "role": "detailMedia",
          "row": 5,
          "rowSpan": 2,
          "span": 3
        },
        {
          "column": 9,
          "role": "action",
          "row": 7,
          "rowSpan": 1,
          "span": 2
        }
      ],
      "tone": "light"
    },
    "slots": [
      {
        "desktopRatio": "4 / 5",
        "key": "wearingImage",
        "mobileRatio": "3 / 4",
        "role": "mainMedia",
        "tabletRatio": "4 / 5"
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
          "column": 1,
          "role": "media",
          "row": 1,
          "rowSpan": 7,
          "span": 7
        },
        {
          "column": 9,
          "role": "copy",
          "row": 2,
          "rowSpan": 2,
          "span": 4
        },
        {
          "column": 9,
          "role": "list",
          "row": 5,
          "rowSpan": 1,
          "span": 3
        },
        {
          "column": 9,
          "role": "action",
          "row": 7,
          "rowSpan": 1,
          "span": 2
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
      "tone": "dark",
      "zones": [
        {
          "column": 1,
          "role": "media",
          "row": 1,
          "rowSpan": 8,
          "span": 12
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
        "copy",
        "action",
        "media"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 1,
          "role": "copy",
          "row": 3,
          "rowSpan": 3,
          "span": 4
        },
        {
          "column": 1,
          "role": "action",
          "row": 7,
          "rowSpan": 1,
          "span": 3
        },
        {
          "column": 6,
          "role": "media",
          "row": 1,
          "rowSpan": 8,
          "span": 7
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
          "column": 3,
          "role": "copy",
          "row": 3,
          "rowSpan": 3,
          "span": 8
        },
        {
          "column": 5,
          "role": "action",
          "row": 7,
          "rowSpan": 1,
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
      "tone": "light",
      "zones": [
        {
          "column": 1,
          "role": "mainMedia",
          "row": 1,
          "rowSpan": 7,
          "span": 7
        },
        {
          "column": 9,
          "role": "copy",
          "row": 2,
          "rowSpan": 2,
          "span": 4
        },
        {
          "column": 10,
          "role": "detailMedia",
          "row": 5,
          "rowSpan": 2,
          "span": 3
        },
        {
          "column": 9,
          "role": "action",
          "row": 7,
          "rowSpan": 1,
          "span": 2
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

export function createContentTemplateMarker(
  moduleType: string,
): ContentTemplateMarker | undefined {
  const contract = getContentTemplateContract(moduleType);
  return contract ? { key: contract.key, version: contract.version } : undefined;
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

  if (marker === undefined) {
    return [{
      ...base,
      code: "content-template-legacy",
      severity: "info",
      message: "历史区块未携带内容模板版本印记，按 legacy-0 兼容读取；普通保存不会自动升级。",
    }];
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
    return [{
      ...base,
      code: "content-template-version-unsupported",
      severity: "error",
      message: "内容模板版本暂不受支持，无法猜测为当前版本。",
    }];
  }
  return [];
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
  const issues = getContentTemplateIssues({ moduleType, props: values });
  return {
    material: { complete: missingMedia.length === 0, missing: missingMedia },
    content: { complete: missingText.length === 0, missing: missingText },
    publish: {
      complete: !issues.some((issue) => issue.severity === "error"),
      issues,
    },
  };
}
