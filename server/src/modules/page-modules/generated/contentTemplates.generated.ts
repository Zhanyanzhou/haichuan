/**
 * 自动生成，禁止手改。
 * 来源：contracts/page-builder/content-templates.contract.json
 * SHA-256：699440107c872072f98980b3ee328bfd75b2c7ad35feae15d1775dbaa2a1d0ff
 */

export const CONTENT_TEMPLATE_REGISTRY_VERSION = 18;
export const CONTENT_TEMPLATE_CONTRACT_SCHEMA_VERSION = 9;
export const CONTENT_TEMPLATE_CONTRACT_VERSION = 7;
export const CONTENT_TEMPLATE_PUBLICATION_GATE_VERSION = 3;
export const CONTENT_TEMPLATE_PUBLICATION_METADATA_KEY = "_contentPublication";
export const CONTENT_TEMPLATE_EDITOR_POLICY = {
  "allowSemanticOverlap": true,
  "bounds": "module-frame",
  "contentFieldsRemainInstanceScoped": true,
  "designScope": "template-definition",
  "designSurface": "template-workspace",
  "externalLinkProtocol": "https-only",
  "fixedObjects": true,
  "linkTargetTypes": [
    "none",
    "product",
    "category",
    "page",
    "external"
  ],
  "pageInstanceScope": "page-instance",
  "pageLayerPanel": "module-only",
  "sizeCompatibilityPolicy": {
    "axes": [
      "width",
      "height"
    ],
    "materializationSource": "mature-renderer-role-root",
    "scope": "node-viewport-axis",
    "state": "preserve-until-resize",
    "version": 1
  },
  "templateStructurePanel": "select-only",
  "version": 3,
  "viewportGeometry": "independent"
} as const;
export const CONTENT_TEMPLATE_SIZE_COMPATIBILITY_STATE = CONTENT_TEMPLATE_EDITOR_POLICY.sizeCompatibilityPolicy.state;
export const CONTENT_TEMPLATE_EDITOR_ACCEPTANCE_MATRIX = [
  {
    "designScope": "template-definition",
    "fixedObjects": true,
    "moduleType": "首屏主视觉",
    "objects": [
      {
        "capabilities": [
          "content",
          "layout",
          "layer",
          "ratio",
          "fit",
          "zoom",
          "focus"
        ],
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": true,
          "allowFocus": true,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": true,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 1,
            "width": 1
          },
          "minSize": {
            "height": 0.1,
            "width": 0.12
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "desktopImage",
          "altText"
        ],
        "kind": "media",
        "nodeIds": [
          "desktopImage"
        ],
        "roleId": "desktopImage",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 1,
              "width": 1,
              "x": 0,
              "y": 0
            },
            "frameAspectRatio": 1.777778
          },
          "mobile": {
            "applicable": false,
            "defaultRect": null,
            "frameAspectRatio": 0.8
          }
        }
      },
      {
        "capabilities": [
          "content",
          "layout",
          "layer",
          "ratio",
          "fit",
          "zoom",
          "focus"
        ],
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": true,
          "allowFocus": true,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": true,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 1,
            "width": 1
          },
          "minSize": {
            "height": 0.1,
            "width": 0.12
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "mobileImage",
          "altText"
        ],
        "kind": "media",
        "nodeIds": [
          "mobileImage"
        ],
        "roleId": "mobileImage",
        "viewports": {
          "desktop": {
            "applicable": false,
            "defaultRect": null,
            "frameAspectRatio": 1.777778
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 1,
              "width": 1,
              "x": 0,
              "y": 0
            },
            "frameAspectRatio": 0.8
          }
        }
      },
      {
        "capabilities": [
          "content",
          "layout",
          "layer",
          "visibility",
          "typography"
        ],
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": false,
          "allowFocus": false,
          "allowHide": true,
          "allowTypography": true,
          "allowZoom": false,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 0.7,
            "width": 0.92
          },
          "minSize": {
            "height": 0.03,
            "width": 0.08
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
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
        "roleId": "copy",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.0875,
              "width": 0.333333,
              "x": 0.333333,
              "y": 0.4
            },
            "frameAspectRatio": 1.777778
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.055,
              "width": 0.48,
              "x": 0.12,
              "y": 0.54
            },
            "frameAspectRatio": 0.8
          }
        }
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
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": false,
          "allowFocus": false,
          "allowHide": true,
          "allowTypography": true,
          "allowZoom": false,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 0.28,
            "width": 0.72
          },
          "minSize": {
            "height": 0.04,
            "width": 0.08
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "actionText",
          "targetType",
          "productCode",
          "productId",
          "linkUrl",
          "categorySlug"
        ],
        "kind": "action",
        "nodeIds": [
          "action",
          "actionText"
        ],
        "roleId": "action",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.0875,
              "width": 0.25,
              "x": 0.333333,
              "y": 0.8
            },
            "frameAspectRatio": 1.777778
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.07,
              "width": 0.36,
              "x": 0.12,
              "y": 0.865
            },
            "frameAspectRatio": 0.8
          }
        }
      }
    ],
    "templateKey": "hero",
    "version": 6
  },
  {
    "designScope": "template-definition",
    "fixedObjects": true,
    "moduleType": "全屏出血图",
    "objects": [
      {
        "capabilities": [
          "content",
          "layout",
          "layer",
          "ratio",
          "fit",
          "zoom",
          "focus"
        ],
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": true,
          "allowFocus": true,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": true,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 1,
            "width": 1
          },
          "minSize": {
            "height": 0.1,
            "width": 0.12
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "image",
          "altText"
        ],
        "kind": "media",
        "nodeIds": [
          "image"
        ],
        "roleId": "image",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.5,
              "width": 1,
              "x": 0,
              "y": 0
            },
            "frameAspectRatio": 1.75
          },
          "mobile": {
            "applicable": false,
            "defaultRect": null,
            "frameAspectRatio": 0.4
          }
        }
      },
      {
        "capabilities": [
          "content",
          "layout",
          "layer",
          "ratio",
          "fit",
          "zoom",
          "focus"
        ],
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": true,
          "allowFocus": true,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": true,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 1,
            "width": 1
          },
          "minSize": {
            "height": 0.1,
            "width": 0.12
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "mobileImage",
          "altText"
        ],
        "kind": "media",
        "nodeIds": [
          "mobileImage"
        ],
        "roleId": "mobileImage",
        "viewports": {
          "desktop": {
            "applicable": false,
            "defaultRect": null,
            "frameAspectRatio": 1.75
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.5,
              "width": 1,
              "x": 0,
              "y": 0
            },
            "frameAspectRatio": 0.4
          }
        }
      },
      {
        "capabilities": [
          "content",
          "visibility",
          "typography",
          "layout",
          "layer"
        ],
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": false,
          "allowFocus": false,
          "allowHide": true,
          "allowTypography": true,
          "allowZoom": false,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 0.7,
            "width": 0.92
          },
          "minSize": {
            "height": 0.03,
            "width": 0.08
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "eyebrow",
          "title",
          "subtitle"
        ],
        "kind": "text",
        "nodeIds": [
          "copy"
        ],
        "roleId": "copy",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.25,
              "width": 0.666667,
              "x": 0.04,
              "y": 0.5
            },
            "frameAspectRatio": 1.75
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.25,
              "width": 0.9,
              "x": 0.05,
              "y": 0.5
            },
            "frameAspectRatio": 0.4
          }
        }
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
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": false,
          "allowFocus": false,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": false,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 0.28,
            "width": 0.72
          },
          "minSize": {
            "height": 0.04,
            "width": 0.08
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "buttonText",
          "targetType",
          "productCode",
          "productId",
          "linkUrl",
          "categorySlug"
        ],
        "kind": "action",
        "nodeIds": [
          "action",
          "buttonText"
        ],
        "roleId": "action",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.125,
              "width": 0.25,
              "x": 0.71,
              "y": 0.75
            },
            "frameAspectRatio": 1.75
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.125,
              "width": 0.416667,
              "x": 0.05,
              "y": 0.75
            },
            "frameAspectRatio": 0.4
          }
        }
      }
    ],
    "templateKey": "fullBleed",
    "version": 6
  },
  {
    "designScope": "template-definition",
    "fixedObjects": true,
    "moduleType": "视频区块",
    "objects": [
      {
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
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": true,
          "allowFocus": true,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": true,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 1,
            "width": 1
          },
          "minSize": {
            "height": 0.1,
            "width": 0.12
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "videoUrl",
          "posterUrl",
          "videoDescription",
          "videoWidth",
          "autoPlay",
          "loop",
          "muted",
          "showControls"
        ],
        "kind": "video",
        "nodeIds": [
          "coverImage"
        ],
        "roleId": "coverImage",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.875,
              "width": 1,
              "x": 0,
              "y": 0
            },
            "frameAspectRatio": 1.555556
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.5,
              "width": 1,
              "x": 0,
              "y": 0
            },
            "frameAspectRatio": 0.4
          }
        }
      },
      {
        "capabilities": [
          "content",
          "layout",
          "layer",
          "visibility",
          "typography"
        ],
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": false,
          "allowFocus": false,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": false,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 0.7,
            "width": 0.92
          },
          "minSize": {
            "height": 0.03,
            "width": 0.08
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "title",
          "subtitle"
        ],
        "kind": "text",
        "nodeIds": [
          "copy"
        ],
        "roleId": "copy",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.125,
              "width": 0.416667,
              "x": 0.083333,
              "y": 0.5
            },
            "frameAspectRatio": 1.555556
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.25,
              "width": 0.9,
              "x": 0.05,
              "y": 0.5
            },
            "frameAspectRatio": 0.4
          }
        }
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
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": false,
          "allowFocus": false,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": false,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 0.28,
            "width": 0.72
          },
          "minSize": {
            "height": 0.04,
            "width": 0.08
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "actionText",
          "targetType",
          "productCode",
          "productId",
          "linkUrl",
          "categorySlug"
        ],
        "kind": "action",
        "nodeIds": [
          "action",
          "actionText"
        ],
        "roleId": "action",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.125,
              "width": 0.25,
              "x": 0.083333,
              "y": 0.75
            },
            "frameAspectRatio": 1.555556
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.125,
              "width": 0.416667,
              "x": 0.05,
              "y": 0.75
            },
            "frameAspectRatio": 0.4
          }
        }
      }
    ],
    "templateKey": "video",
    "version": 6
  },
  {
    "designScope": "template-definition",
    "fixedObjects": true,
    "moduleType": "轮播图",
    "objects": [
      {
        "capabilities": [
          "content",
          "items",
          "link",
          "playback",
          "layout",
          "layer",
          "ratio",
          "fit",
          "zoom",
          "focus"
        ],
        "collectionWholeObjectOnly": true,
        "constraints": {
          "allowAspectRatio": true,
          "allowFocus": true,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": true,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 1,
            "width": 1
          },
          "minSize": {
            "height": 0.1,
            "width": 0.12
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "images",
          "autoPlay",
          "showDots",
          "showArrows",
          "interval"
        ],
        "kind": "collection",
        "nodeIds": [
          "frames"
        ],
        "roleId": "frames",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.75,
              "width": 1,
              "x": 0,
              "y": 0
            },
            "frameAspectRatio": 2.625
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.5,
              "width": 1,
              "x": 0,
              "y": 0
            },
            "frameAspectRatio": 0.4
          }
        }
      }
    ],
    "templateKey": "carousel",
    "version": 4
  },
  {
    "designScope": "template-definition",
    "fixedObjects": true,
    "moduleType": "单图海报",
    "objects": [
      {
        "capabilities": [
          "content",
          "layout",
          "layer",
          "ratio",
          "fit",
          "zoom",
          "focus"
        ],
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": true,
          "allowFocus": true,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": true,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 1,
            "width": 1
          },
          "minSize": {
            "height": 0.1,
            "width": 0.12
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "desktopImage",
          "altText"
        ],
        "kind": "media",
        "nodeIds": [
          "desktopImage"
        ],
        "roleId": "desktopImage",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 1,
              "width": 0.75,
              "x": 0.25,
              "y": 0
            },
            "frameAspectRatio": 1.066667
          },
          "mobile": {
            "applicable": false,
            "defaultRect": null,
            "frameAspectRatio": 0.5
          }
        }
      },
      {
        "capabilities": [
          "content",
          "layout",
          "layer",
          "ratio",
          "fit",
          "zoom",
          "focus"
        ],
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": true,
          "allowFocus": true,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": true,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 1,
            "width": 1
          },
          "minSize": {
            "height": 0.1,
            "width": 0.12
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "mobileImage",
          "altText"
        ],
        "kind": "media",
        "nodeIds": [
          "mobileImage"
        ],
        "roleId": "mobileImage",
        "viewports": {
          "desktop": {
            "applicable": false,
            "defaultRect": null,
            "frameAspectRatio": 1.066667
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.625,
              "width": 1,
              "x": 0,
              "y": 0
            },
            "frameAspectRatio": 0.5
          }
        }
      },
      {
        "capabilities": [
          "content",
          "layout",
          "layer",
          "visibility",
          "typography"
        ],
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": false,
          "allowFocus": false,
          "allowHide": true,
          "allowTypography": true,
          "allowZoom": false,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 0.7,
            "width": 0.92
          },
          "minSize": {
            "height": 0.03,
            "width": 0.08
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "title",
          "subtitle",
          "number",
          "label"
        ],
        "kind": "text",
        "nodeIds": [
          "copy"
        ],
        "roleId": "copy",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.0875,
              "width": 0.208333,
              "x": 0.04,
              "y": 0.475
            },
            "frameAspectRatio": 1.066667
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.25,
              "width": 0.833333,
              "x": 0.083333,
              "y": 0.625
            },
            "frameAspectRatio": 0.5
          }
        }
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
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": false,
          "allowFocus": false,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": false,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 0.28,
            "width": 0.72
          },
          "minSize": {
            "height": 0.04,
            "width": 0.08
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "actionText",
          "targetType",
          "productCode",
          "productId",
          "linkUrl",
          "categorySlug"
        ],
        "kind": "action",
        "nodeIds": [
          "action",
          "actionText"
        ],
        "roleId": "action",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.075,
              "width": 0.166667,
              "x": 0.04,
              "y": 0.85
            },
            "frameAspectRatio": 1.066667
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.125,
              "width": 0.416667,
              "x": 0.25,
              "y": 0.875
            },
            "frameAspectRatio": 0.5
          }
        }
      }
    ],
    "templateKey": "singlePoster",
    "version": 6
  },
  {
    "designScope": "template-definition",
    "fixedObjects": true,
    "moduleType": "双图海报",
    "objects": [
      {
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
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": true,
          "allowFocus": true,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": true,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 1,
            "width": 1
          },
          "minSize": {
            "height": 0.1,
            "width": 0.12
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "mainImage",
          "mainAltText"
        ],
        "kind": "media",
        "nodeIds": [
          "mainImage"
        ],
        "roleId": "mainImage",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.666667,
              "width": 0.666667,
              "x": 0,
              "y": 0
            },
            "frameAspectRatio": 1.5
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.4,
              "width": 1,
              "x": 0,
              "y": 0
            },
            "frameAspectRatio": 0.6
          }
        }
      },
      {
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
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": true,
          "allowFocus": true,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": true,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 1,
            "width": 1
          },
          "minSize": {
            "height": 0.1,
            "width": 0.12
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "detailImage",
          "detailAltText"
        ],
        "kind": "media",
        "nodeIds": [
          "detailImage"
        ],
        "roleId": "detailImage",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.625,
              "width": 0.333333,
              "x": 0.666667,
              "y": 0.125
            },
            "frameAspectRatio": 1.5
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.5,
              "width": 0.666667,
              "x": 0.333333,
              "y": 0.4
            },
            "frameAspectRatio": 0.6
          }
        }
      },
      {
        "capabilities": [
          "content",
          "visibility",
          "typography",
          "layout",
          "layer"
        ],
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": false,
          "allowFocus": false,
          "allowHide": true,
          "allowTypography": true,
          "allowZoom": false,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 0.7,
            "width": 0.92
          },
          "minSize": {
            "height": 0.03,
            "width": 0.08
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "title",
          "description",
          "number",
          "label"
        ],
        "kind": "text",
        "nodeIds": [
          "copy"
        ],
        "roleId": "copy",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.25,
              "width": 0.333333,
              "x": 0.626667,
              "y": 0.5
            },
            "frameAspectRatio": 1.5
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.25,
              "width": 0.9,
              "x": 0.05,
              "y": 0.375
            },
            "frameAspectRatio": 0.6
          }
        }
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
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": false,
          "allowFocus": false,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": false,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 0.28,
            "width": 0.72
          },
          "minSize": {
            "height": 0.04,
            "width": 0.08
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "actionText",
          "targetType",
          "productCode",
          "productId",
          "linkUrl",
          "categorySlug"
        ],
        "kind": "action",
        "nodeIds": [
          "action",
          "actionText"
        ],
        "roleId": "action",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.125,
              "width": 0.25,
              "x": 0.666667,
              "y": 0.825
            },
            "frameAspectRatio": 1.5
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.125,
              "width": 0.416667,
              "x": 0.05,
              "y": 0.835
            },
            "frameAspectRatio": 0.6
          }
        }
      }
    ],
    "templateKey": "doublePoster",
    "version": 6
  },
  {
    "designScope": "template-definition",
    "fixedObjects": true,
    "moduleType": "文字横幅",
    "objects": [
      {
        "capabilities": [
          "content",
          "layout",
          "layer"
        ],
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": false,
          "allowFocus": false,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": false,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 1,
            "width": 1
          },
          "minSize": {
            "height": 0.1,
            "width": 0.12
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "bgImage"
        ],
        "kind": "media",
        "nodeIds": [
          "bgImage"
        ],
        "roleId": "bgImage",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 1,
              "width": 1,
              "x": 0,
              "y": 0
            },
            "frameAspectRatio": 2.285714
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 1,
              "width": 1,
              "x": 0,
              "y": 0
            },
            "frameAspectRatio": 0.8
          }
        }
      },
      {
        "capabilities": [
          "content",
          "visibility",
          "typography",
          "layout",
          "layer"
        ],
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": false,
          "allowFocus": false,
          "allowHide": true,
          "allowTypography": true,
          "allowZoom": false,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 0.7,
            "width": 0.92
          },
          "minSize": {
            "height": 0.03,
            "width": 0.08
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "eyebrow",
          "title",
          "body"
        ],
        "kind": "text",
        "nodeIds": [
          "copy"
        ],
        "roleId": "copy",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.0875,
              "width": 0.333333,
              "x": 0.333333,
              "y": 0.325
            },
            "frameAspectRatio": 2.285714
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.375,
              "width": 0.9,
              "x": 0.05,
              "y": 0.125
            },
            "frameAspectRatio": 0.8
          }
        }
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
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": false,
          "allowFocus": false,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": false,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 0.28,
            "width": 0.72
          },
          "minSize": {
            "height": 0.04,
            "width": 0.08
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "buttonText",
          "targetType",
          "productCode",
          "productId",
          "linkUrl",
          "categorySlug"
        ],
        "kind": "action",
        "nodeIds": [
          "action",
          "buttonText"
        ],
        "roleId": "action",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.0875,
              "width": 0.333333,
              "x": 0.333333,
              "y": 0.8
            },
            "frameAspectRatio": 2.285714
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.125,
              "width": 0.416667,
              "x": 0.05,
              "y": 0.625
            },
            "frameAspectRatio": 0.8
          }
        }
      }
    ],
    "templateKey": "textBanner",
    "version": 6
  },
  {
    "designScope": "template-definition",
    "fixedObjects": true,
    "moduleType": "定制流程",
    "objects": [
      {
        "capabilities": [
          "content",
          "items",
          "layout",
          "layer"
        ],
        "collectionWholeObjectOnly": true,
        "constraints": {
          "allowAspectRatio": false,
          "allowFocus": false,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": false,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 1,
            "width": 1
          },
          "minSize": {
            "height": 0.1,
            "width": 0.12
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "steps"
        ],
        "kind": "collection",
        "nodeIds": [
          "steps"
        ],
        "roleId": "steps",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.375,
              "width": 1,
              "x": 0,
              "y": 0.375
            },
            "frameAspectRatio": 1.6
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.625,
              "width": 1,
              "x": 0,
              "y": 0.25
            },
            "frameAspectRatio": 0.8
          }
        }
      },
      {
        "capabilities": [
          "content",
          "layout",
          "layer",
          "visibility",
          "typography"
        ],
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": false,
          "allowFocus": false,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": false,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 0.7,
            "width": 0.92
          },
          "minSize": {
            "height": 0.03,
            "width": 0.08
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "title",
          "subtitle"
        ],
        "kind": "text",
        "nodeIds": [
          "copy"
        ],
        "roleId": "copy",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.25,
              "width": 0.416667,
              "x": 0.04,
              "y": 0.05
            },
            "frameAspectRatio": 1.6
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.25,
              "width": 0.9,
              "x": 0.05,
              "y": 0.04
            },
            "frameAspectRatio": 0.8
          }
        }
      }
    ],
    "templateKey": "journey",
    "version": 4
  },
  {
    "designScope": "template-definition",
    "fixedObjects": true,
    "moduleType": "改款对比",
    "objects": [
      {
        "capabilities": [
          "content",
          "layout",
          "layer",
          "ratio",
          "fit",
          "zoom"
        ],
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": true,
          "allowFocus": false,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": true,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 1,
            "width": 1
          },
          "minSize": {
            "height": 0.1,
            "width": 0.12
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "beforeImage",
          "beforeLabel",
          "beforeAltText"
        ],
        "kind": "media",
        "nodeIds": [
          "before"
        ],
        "roleId": "before",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 1,
              "width": 0.5,
              "x": 0,
              "y": 0
            },
            "frameAspectRatio": 1.6
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 1,
              "width": 1,
              "x": 0,
              "y": 0
            },
            "frameAspectRatio": 0.8
          }
        }
      },
      {
        "capabilities": [
          "content",
          "layout",
          "layer",
          "ratio",
          "fit",
          "zoom"
        ],
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": true,
          "allowFocus": false,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": true,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 1,
            "width": 1
          },
          "minSize": {
            "height": 0.1,
            "width": 0.12
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "afterImage",
          "afterLabel",
          "afterAltText"
        ],
        "kind": "media",
        "nodeIds": [
          "after"
        ],
        "roleId": "after",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 1,
              "width": 0.5,
              "x": 0.5,
              "y": 0
            },
            "frameAspectRatio": 1.6
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 1,
              "width": 1,
              "x": 0,
              "y": 0
            },
            "frameAspectRatio": 0.8
          }
        }
      },
      {
        "capabilities": [
          "content",
          "layout",
          "layer",
          "visibility",
          "typography"
        ],
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": false,
          "allowFocus": false,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": false,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 0.7,
            "width": 0.92
          },
          "minSize": {
            "height": 0.03,
            "width": 0.08
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "title",
          "subtitle"
        ],
        "kind": "text",
        "nodeIds": [
          "copy"
        ],
        "roleId": "copy",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.125,
              "width": 0.92,
              "x": 0.04,
              "y": 0.05
            },
            "frameAspectRatio": 1.6
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.125,
              "width": 0.9,
              "x": 0.05,
              "y": 0.04
            },
            "frameAspectRatio": 0.8
          }
        }
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
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": false,
          "allowFocus": false,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": false,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 0.28,
            "width": 0.72
          },
          "minSize": {
            "height": 0.04,
            "width": 0.08
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "actionText",
          "targetType",
          "productCode",
          "productId",
          "linkUrl",
          "categorySlug"
        ],
        "kind": "action",
        "nodeIds": [
          "action",
          "actionText"
        ],
        "roleId": "action",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.08,
              "width": 0.24,
              "x": 0.38,
              "y": 0.86
            },
            "frameAspectRatio": 1.6
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.08,
              "width": 0.6,
              "x": 0.2,
              "y": 0.88
            },
            "frameAspectRatio": 0.8
          }
        }
      }
    ],
    "templateKey": "comparison",
    "version": 6
  },
  {
    "designScope": "template-definition",
    "fixedObjects": true,
    "moduleType": "单品焦点推荐",
    "objects": [
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
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": true,
          "allowFocus": false,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": false,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 1,
            "width": 1
          },
          "minSize": {
            "height": 0.1,
            "width": 0.12
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "productCode"
        ],
        "kind": "product",
        "nodeIds": [
          "product"
        ],
        "roleId": "product",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.625,
              "width": 0.666667,
              "x": 0.166667,
              "y": 0
            },
            "frameAspectRatio": 0.75
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.5,
              "width": 1,
              "x": 0,
              "y": 0
            },
            "frameAspectRatio": 0.4
          }
        }
      },
      {
        "capabilities": [
          "content",
          "layout",
          "layer",
          "visibility",
          "typography"
        ],
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": false,
          "allowFocus": false,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": false,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 0.7,
            "width": 0.92
          },
          "minSize": {
            "height": 0.03,
            "width": 0.08
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "eyebrow",
          "title",
          "summary"
        ],
        "kind": "text",
        "nodeIds": [
          "copy"
        ],
        "roleId": "copy",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.125,
              "width": 0.666667,
              "x": 0.166667,
              "y": 0.625
            },
            "frameAspectRatio": 0.75
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.125,
              "width": 0.9,
              "x": 0.05,
              "y": 0.5
            },
            "frameAspectRatio": 0.4
          }
        }
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
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": false,
          "allowFocus": false,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": false,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 0.28,
            "width": 0.72
          },
          "minSize": {
            "height": 0.04,
            "width": 0.08
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "primaryText",
          "secondaryText",
          "secondaryTargetType",
          "secondaryProductCode",
          "secondaryProductId",
          "secondaryLinkUrl",
          "secondaryCategorySlug"
        ],
        "kind": "action",
        "nodeIds": [
          "action",
          "primaryText",
          "secondaryText"
        ],
        "roleId": "action",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.125,
              "width": 0.5,
              "x": 0.25,
              "y": 0.825
            },
            "frameAspectRatio": 0.75
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.125,
              "width": 0.416667,
              "x": 0.05,
              "y": 0.75
            },
            "frameAspectRatio": 0.4
          }
        }
      },
      {
        "capabilities": [
          "content",
          "layout",
          "layer"
        ],
        "collectionWholeObjectOnly": true,
        "constraints": {
          "allowAspectRatio": false,
          "allowFocus": false,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": false,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 1,
            "width": 1
          },
          "minSize": {
            "height": 0.1,
            "width": 0.12
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "showPrice"
        ],
        "kind": "collection",
        "nodeIds": [
          "list"
        ],
        "roleId": "list",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.125,
              "width": 0.5,
              "x": 0.25,
              "y": 0.75
            },
            "frameAspectRatio": 0.75
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.125,
              "width": 1,
              "x": 0,
              "y": 0.625
            },
            "frameAspectRatio": 0.4
          }
        }
      }
    ],
    "templateKey": "featuredProduct",
    "version": 5
  },
  {
    "designScope": "template-definition",
    "fixedObjects": true,
    "moduleType": "产品展示行",
    "objects": [
      {
        "capabilities": [
          "content",
          "reference",
          "layout",
          "layer",
          "ratio",
          "fit"
        ],
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": true,
          "allowFocus": false,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": false,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 1,
            "width": 1
          },
          "minSize": {
            "height": 0.1,
            "width": 0.12
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "productCodes"
        ],
        "kind": "product",
        "nodeIds": [
          "productCards"
        ],
        "roleId": "productCards",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.5,
              "width": 0.333333,
              "x": 0,
              "y": 0.25
            },
            "frameAspectRatio": 1.6
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.25,
              "width": 1,
              "x": 0,
              "y": 0.125
            },
            "frameAspectRatio": 0.8
          }
        }
      },
      {
        "capabilities": [
          "content",
          "layout",
          "layer",
          "visibility",
          "typography"
        ],
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": false,
          "allowFocus": false,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": false,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 0.7,
            "width": 0.92
          },
          "minSize": {
            "height": 0.03,
            "width": 0.08
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "title",
          "subtitle"
        ],
        "kind": "text",
        "nodeIds": [
          "copy"
        ],
        "roleId": "copy",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.125,
              "width": 0.416667,
              "x": 0.04,
              "y": 0.05
            },
            "frameAspectRatio": 1.6
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.125,
              "width": 0.9,
              "x": 0.05,
              "y": 0.04
            },
            "frameAspectRatio": 0.8
          }
        }
      }
    ],
    "templateKey": "productRow",
    "version": 4
  },
  {
    "designScope": "template-definition",
    "fixedObjects": true,
    "moduleType": "作品画廊",
    "objects": [
      {
        "capabilities": [
          "content",
          "items",
          "link",
          "layout",
          "layer",
          "ratio",
          "fit",
          "zoom"
        ],
        "collectionWholeObjectOnly": true,
        "constraints": {
          "allowAspectRatio": true,
          "allowFocus": false,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": true,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 1,
            "width": 1
          },
          "minSize": {
            "height": 0.1,
            "width": 0.12
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "items"
        ],
        "kind": "collection",
        "nodeIds": [
          "works"
        ],
        "roleId": "works",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.4,
              "width": 0.583333,
              "x": 0,
              "y": 0.2
            },
            "frameAspectRatio": 1.6
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.3,
              "width": 1,
              "x": 0,
              "y": 0.1
            },
            "frameAspectRatio": 0.8
          }
        }
      },
      {
        "capabilities": [
          "content",
          "layout",
          "layer",
          "visibility",
          "typography"
        ],
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": false,
          "allowFocus": false,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": false,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 0.7,
            "width": 0.92
          },
          "minSize": {
            "height": 0.03,
            "width": 0.08
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "title",
          "subtitle"
        ],
        "kind": "text",
        "nodeIds": [
          "copy"
        ],
        "roleId": "copy",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.1,
              "width": 0.416667,
              "x": 0.04,
              "y": 0.05
            },
            "frameAspectRatio": 1.6
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.1,
              "width": 0.9,
              "x": 0.05,
              "y": 0.04
            },
            "frameAspectRatio": 0.8
          }
        }
      }
    ],
    "templateKey": "gallery",
    "version": 4
  },
  {
    "designScope": "template-definition",
    "fixedObjects": true,
    "moduleType": "佩戴灵感",
    "objects": [
      {
        "capabilities": [
          "content",
          "layout",
          "layer",
          "ratio",
          "fit",
          "zoom",
          "focus"
        ],
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": true,
          "allowFocus": true,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": true,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 1,
            "width": 1
          },
          "minSize": {
            "height": 0.1,
            "width": 0.12
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "image",
          "altText"
        ],
        "kind": "media",
        "nodeIds": [
          "wearingImage"
        ],
        "roleId": "wearingImage",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.8,
              "width": 0.583333,
              "x": 0,
              "y": 0
            },
            "frameAspectRatio": 1.097143
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.5,
              "width": 1,
              "x": 0,
              "y": 0
            },
            "frameAspectRatio": 0.4
          }
        }
      },
      {
        "capabilities": [
          "content",
          "layout",
          "layer",
          "visibility",
          "typography"
        ],
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": false,
          "allowFocus": false,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": false,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 0.7,
            "width": 0.92
          },
          "minSize": {
            "height": 0.03,
            "width": 0.08
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "title",
          "subtitle"
        ],
        "kind": "text",
        "nodeIds": [
          "copy"
        ],
        "roleId": "copy",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.2,
              "width": 0.416667,
              "x": 0.543333,
              "y": 0.05
            },
            "frameAspectRatio": 1.097143
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.125,
              "width": 0.9,
              "x": 0.05,
              "y": 0.5
            },
            "frameAspectRatio": 0.4
          }
        }
      },
      {
        "capabilities": [
          "content",
          "reference",
          "layout",
          "layer"
        ],
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": false,
          "allowFocus": false,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": false,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 1,
            "width": 1
          },
          "minSize": {
            "height": 0.1,
            "width": 0.12
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "productCodes"
        ],
        "kind": "product",
        "nodeIds": [
          "relatedProducts"
        ],
        "roleId": "relatedProducts",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.6,
              "width": 0.416667,
              "x": 0.583333,
              "y": 0.2
            },
            "frameAspectRatio": 1.097143
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.25,
              "width": 0.666667,
              "x": 0.333333,
              "y": 0.625
            },
            "frameAspectRatio": 0.4
          }
        }
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
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": false,
          "allowFocus": false,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": false,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 0.28,
            "width": 0.72
          },
          "minSize": {
            "height": 0.04,
            "width": 0.08
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "actionText",
          "targetType",
          "productCode",
          "productId",
          "linkUrl",
          "categorySlug"
        ],
        "kind": "action",
        "nodeIds": [
          "action",
          "actionText"
        ],
        "roleId": "action",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.1,
              "width": 0.25,
              "x": 0.583333,
              "y": 0.85
            },
            "frameAspectRatio": 1.097143
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.125,
              "width": 0.416667,
              "x": 0.05,
              "y": 0.835
            },
            "frameAspectRatio": 0.4
          }
        }
      }
    ],
    "templateKey": "wearingInspiration",
    "version": 5
  },
  {
    "designScope": "template-definition",
    "fixedObjects": true,
    "moduleType": "分类卡片",
    "objects": [
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
        "collectionWholeObjectOnly": true,
        "constraints": {
          "allowAspectRatio": true,
          "allowFocus": false,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": false,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 1,
            "width": 1
          },
          "minSize": {
            "height": 0.1,
            "width": 0.12
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "categorySlugs",
          "categories"
        ],
        "kind": "collection",
        "nodeIds": [
          "categories"
        ],
        "roleId": "categories",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.5,
              "width": 0.333333,
              "x": 0,
              "y": 0.25
            },
            "frameAspectRatio": 1.6
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.25,
              "width": 1,
              "x": 0,
              "y": 0.125
            },
            "frameAspectRatio": 0.8
          }
        }
      },
      {
        "capabilities": [
          "content",
          "layout",
          "layer",
          "visibility",
          "typography"
        ],
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": false,
          "allowFocus": false,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": false,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 0.7,
            "width": 0.92
          },
          "minSize": {
            "height": 0.03,
            "width": 0.08
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "title",
          "subtitle"
        ],
        "kind": "text",
        "nodeIds": [
          "copy"
        ],
        "roleId": "copy",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.125,
              "width": 0.333333,
              "x": 0.04,
              "y": 0.05
            },
            "frameAspectRatio": 1.6
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.125,
              "width": 0.9,
              "x": 0.05,
              "y": 0.04
            },
            "frameAspectRatio": 0.8
          }
        }
      }
    ],
    "templateKey": "categoryCards",
    "version": 4
  },
  {
    "designScope": "template-definition",
    "fixedObjects": true,
    "moduleType": "按场景选购",
    "objects": [
      {
        "capabilities": [
          "content",
          "items",
          "link",
          "layout",
          "layer",
          "ratio",
          "fit"
        ],
        "collectionWholeObjectOnly": true,
        "constraints": {
          "allowAspectRatio": true,
          "allowFocus": false,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": false,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 1,
            "width": 1
          },
          "minSize": {
            "height": 0.1,
            "width": 0.12
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "categories"
        ],
        "kind": "collection",
        "nodeIds": [
          "scenes"
        ],
        "roleId": "scenes",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.375,
              "width": 0.25,
              "x": 0,
              "y": 0.25
            },
            "frameAspectRatio": 1.6
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.125,
              "width": 1,
              "x": 0,
              "y": 0.125
            },
            "frameAspectRatio": 0.8
          }
        }
      },
      {
        "capabilities": [
          "content",
          "layout",
          "layer",
          "visibility",
          "typography"
        ],
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": false,
          "allowFocus": false,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": false,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 0.7,
            "width": 0.92
          },
          "minSize": {
            "height": 0.03,
            "width": 0.08
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "title",
          "subtitle"
        ],
        "kind": "text",
        "nodeIds": [
          "copy"
        ],
        "roleId": "copy",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.125,
              "width": 0.92,
              "x": 0.04,
              "y": 0.05
            },
            "frameAspectRatio": 1.6
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.125,
              "width": 0.9,
              "x": 0.05,
              "y": 0.04
            },
            "frameAspectRatio": 0.8
          }
        }
      }
    ],
    "templateKey": "sceneShopping",
    "version": 4
  },
  {
    "designScope": "template-definition",
    "fixedObjects": true,
    "moduleType": "热区图",
    "objects": [
      {
        "capabilities": [
          "content",
          "layout",
          "layer",
          "ratio",
          "fit",
          "zoom",
          "focus"
        ],
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": true,
          "allowFocus": true,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": true,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 1,
            "width": 1
          },
          "minSize": {
            "height": 0.1,
            "width": 0.12
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "image",
          "mobileImage",
          "altText"
        ],
        "kind": "media",
        "nodeIds": [
          "sceneImage"
        ],
        "roleId": "sceneImage",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.75,
              "width": 1,
              "x": 0,
              "y": 0
            },
            "frameAspectRatio": 1.333333
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.75,
              "width": 1,
              "x": 0,
              "y": 0
            },
            "frameAspectRatio": 0.6
          }
        }
      },
      {
        "capabilities": [
          "content",
          "items",
          "link",
          "layout",
          "layer"
        ],
        "collectionWholeObjectOnly": true,
        "constraints": {
          "allowAspectRatio": false,
          "allowFocus": false,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": false,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 1,
            "width": 1
          },
          "minSize": {
            "height": 0.1,
            "width": 0.12
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "hotspots",
          "mobileHotspots"
        ],
        "kind": "collection",
        "nodeIds": [
          "hotspots"
        ],
        "roleId": "hotspots",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.125,
              "width": 0.083333,
              "x": 0.166667,
              "y": 0.25
            },
            "frameAspectRatio": 1.333333
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.125,
              "width": 0.083333,
              "x": 0.166667,
              "y": 0.125
            },
            "frameAspectRatio": 0.6
          }
        }
      }
    ],
    "templateKey": "hotspot",
    "version": 4
  },
  {
    "designScope": "template-definition",
    "fixedObjects": true,
    "moduleType": "卡片网格",
    "objects": [
      {
        "capabilities": [
          "content",
          "items",
          "layout",
          "layer"
        ],
        "collectionWholeObjectOnly": true,
        "constraints": {
          "allowAspectRatio": false,
          "allowFocus": false,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": false,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 1,
            "width": 1
          },
          "minSize": {
            "height": 0.1,
            "width": 0.12
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "cards"
        ],
        "kind": "collection",
        "nodeIds": [
          "points"
        ],
        "roleId": "points",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.375,
              "width": 0.333333,
              "x": 0,
              "y": 0.25
            },
            "frameAspectRatio": 1.6
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.25,
              "width": 1,
              "x": 0,
              "y": 0.125
            },
            "frameAspectRatio": 0.8
          }
        }
      },
      {
        "capabilities": [
          "content",
          "layout",
          "layer",
          "visibility",
          "typography"
        ],
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": false,
          "allowFocus": false,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": false,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 0.7,
            "width": 0.92
          },
          "minSize": {
            "height": 0.03,
            "width": 0.08
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "title",
          "subtitle"
        ],
        "kind": "text",
        "nodeIds": [
          "copy"
        ],
        "roleId": "copy",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.125,
              "width": 0.666667,
              "x": 0.166667,
              "y": 0.05
            },
            "frameAspectRatio": 1.6
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.125,
              "width": 0.9,
              "x": 0.05,
              "y": 0.04
            },
            "frameAspectRatio": 0.8
          }
        }
      }
    ],
    "templateKey": "brandPoints",
    "version": 4
  },
  {
    "designScope": "template-definition",
    "fixedObjects": true,
    "moduleType": "服务承诺",
    "objects": [
      {
        "capabilities": [
          "content",
          "items",
          "layout",
          "layer"
        ],
        "collectionWholeObjectOnly": true,
        "constraints": {
          "allowAspectRatio": false,
          "allowFocus": false,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": false,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 1,
            "width": 1
          },
          "minSize": {
            "height": 0.1,
            "width": 0.12
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "cards"
        ],
        "kind": "collection",
        "nodeIds": [
          "promises"
        ],
        "roleId": "promises",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.375,
              "width": 0.25,
              "x": 0,
              "y": 0.25
            },
            "frameAspectRatio": 1.6
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.125,
              "width": 1,
              "x": 0,
              "y": 0.125
            },
            "frameAspectRatio": 0.8
          }
        }
      },
      {
        "capabilities": [
          "content",
          "layout",
          "layer",
          "visibility",
          "typography"
        ],
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": false,
          "allowFocus": false,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": false,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 0.7,
            "width": 0.92
          },
          "minSize": {
            "height": 0.03,
            "width": 0.08
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "title",
          "subtitle"
        ],
        "kind": "text",
        "nodeIds": [
          "copy"
        ],
        "roleId": "copy",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.125,
              "width": 0.416667,
              "x": 0.04,
              "y": 0.05
            },
            "frameAspectRatio": 1.6
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.125,
              "width": 0.9,
              "x": 0.05,
              "y": 0.04
            },
            "frameAspectRatio": 0.8
          }
        }
      }
    ],
    "templateKey": "servicePromises",
    "version": 4
  },
  {
    "designScope": "template-definition",
    "fixedObjects": true,
    "moduleType": "资质证书",
    "objects": [
      {
        "capabilities": [
          "content",
          "items",
          "layout",
          "layer",
          "ratio",
          "fit"
        ],
        "collectionWholeObjectOnly": true,
        "constraints": {
          "allowAspectRatio": true,
          "allowFocus": false,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": false,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 1,
            "width": 1
          },
          "minSize": {
            "height": 0.1,
            "width": 0.12
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "certificates"
        ],
        "kind": "collection",
        "nodeIds": [
          "certificates"
        ],
        "roleId": "certificates",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.375,
              "width": 0.333333,
              "x": 0,
              "y": 0.25
            },
            "frameAspectRatio": 1.6
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.25,
              "width": 1,
              "x": 0,
              "y": 0.125
            },
            "frameAspectRatio": 0.8
          }
        }
      },
      {
        "capabilities": [
          "content",
          "layout",
          "layer",
          "visibility",
          "typography"
        ],
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": false,
          "allowFocus": false,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": false,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 0.7,
            "width": 0.92
          },
          "minSize": {
            "height": 0.03,
            "width": 0.08
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "title",
          "subtitle"
        ],
        "kind": "text",
        "nodeIds": [
          "copy"
        ],
        "roleId": "copy",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.125,
              "width": 0.333333,
              "x": 0.04,
              "y": 0.05
            },
            "frameAspectRatio": 1.6
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.125,
              "width": 0.9,
              "x": 0.05,
              "y": 0.04
            },
            "frameAspectRatio": 0.8
          }
        }
      }
    ],
    "templateKey": "certificates",
    "version": 4
  },
  {
    "designScope": "template-definition",
    "fixedObjects": true,
    "moduleType": "门店信息",
    "objects": [
      {
        "capabilities": [
          "content",
          "layout",
          "layer",
          "ratio",
          "fit",
          "zoom"
        ],
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": true,
          "allowFocus": false,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": true,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 1,
            "width": 1
          },
          "minSize": {
            "height": 0.1,
            "width": 0.12
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "image"
        ],
        "kind": "media",
        "nodeIds": [
          "store"
        ],
        "roleId": "store",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.75,
              "width": 0.583333,
              "x": 0,
              "y": 0
            },
            "frameAspectRatio": 1.928573
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.5,
              "width": 1,
              "x": 0,
              "y": 0
            },
            "frameAspectRatio": 0.75
          }
        }
      }
    ],
    "templateKey": "storeInfo",
    "version": 5
  },
  {
    "designScope": "template-definition",
    "fixedObjects": true,
    "moduleType": "真实评价与实拍",
    "objects": [
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
        "collectionWholeObjectOnly": true,
        "constraints": {
          "allowAspectRatio": true,
          "allowFocus": false,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": true,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 1,
            "width": 1
          },
          "minSize": {
            "height": 0.1,
            "width": 0.12
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "testimonials"
        ],
        "kind": "collection",
        "nodeIds": [
          "authorizedPhoto",
          "mainQuote",
          "attribution"
        ],
        "roleId": "authorizedPhoto",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.75,
              "width": 0.416667,
              "x": 0,
              "y": 0.125
            },
            "frameAspectRatio": 1.44
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.5,
              "width": 1,
              "x": 0,
              "y": 0
            },
            "frameAspectRatio": 0.4
          }
        }
      }
    ],
    "templateKey": "testimonials",
    "version": 4
  },
  {
    "designScope": "template-definition",
    "fixedObjects": true,
    "moduleType": "预约入口",
    "objects": [
      {
        "capabilities": [
          "content",
          "layout",
          "layer",
          "fit",
          "zoom",
          "focus"
        ],
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": false,
          "allowFocus": true,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": true,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 1,
            "width": 1
          },
          "minSize": {
            "height": 0.1,
            "width": 0.12
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "backgroundImage",
          "altText"
        ],
        "kind": "media",
        "nodeIds": [
          "bgImage"
        ],
        "roleId": "bgImage",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 1,
              "width": 1,
              "x": 0,
              "y": 0
            },
            "frameAspectRatio": 2.285714
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 1,
              "width": 1,
              "x": 0,
              "y": 0
            },
            "frameAspectRatio": 0.8
          }
        }
      },
      {
        "capabilities": [
          "content",
          "visibility",
          "typography",
          "layout",
          "layer"
        ],
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": false,
          "allowFocus": false,
          "allowHide": true,
          "allowTypography": true,
          "allowZoom": false,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 0.7,
            "width": 0.92
          },
          "minSize": {
            "height": 0.03,
            "width": 0.08
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
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
        "roleId": "copy",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.375,
              "width": 0.5,
              "x": 0.083333,
              "y": 0.125
            },
            "frameAspectRatio": 2.285714
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.375,
              "width": 0.9,
              "x": 0.05,
              "y": 0.04
            },
            "frameAspectRatio": 0.8
          }
        }
      },
      {
        "capabilities": [
          "content",
          "link",
          "visibility",
          "typography",
          "layout",
          "layer"
        ],
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": false,
          "allowFocus": false,
          "allowHide": false,
          "allowTypography": true,
          "allowZoom": false,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 0.28,
            "width": 0.72
          },
          "minSize": {
            "height": 0.04,
            "width": 0.08
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "buttonText",
          "targetType",
          "productCode",
          "productId",
          "linkUrl",
          "categorySlug"
        ],
        "kind": "action",
        "nodeIds": [
          "primaryAction",
          "buttonText"
        ],
        "roleId": "primaryAction",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.125,
              "width": 0.25,
              "x": 0.666667,
              "y": 0.25
            },
            "frameAspectRatio": 2.285714
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.125,
              "width": 0.666667,
              "x": 0.05,
              "y": 0.5
            },
            "frameAspectRatio": 0.8
          }
        }
      }
    ],
    "templateKey": "booking",
    "version": 7
  },
  {
    "designScope": "template-definition",
    "fixedObjects": true,
    "moduleType": "限时活动",
    "objects": [
      {
        "capabilities": [
          "content",
          "layout",
          "layer",
          "ratio",
          "fit",
          "zoom"
        ],
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": true,
          "allowFocus": false,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": true,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 1,
            "width": 1
          },
          "minSize": {
            "height": 0.1,
            "width": 0.12
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "eventImage"
        ],
        "kind": "media",
        "nodeIds": [
          "event"
        ],
        "roleId": "event",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.875,
              "width": 1,
              "x": 0,
              "y": 0
            },
            "frameAspectRatio": 1.555556
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.5,
              "width": 1,
              "x": 0,
              "y": 0
            },
            "frameAspectRatio": 0.4
          }
        }
      },
      {
        "capabilities": [
          "content",
          "items",
          "layout",
          "layer"
        ],
        "collectionWholeObjectOnly": true,
        "constraints": {
          "allowAspectRatio": false,
          "allowFocus": false,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": false,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 1,
            "width": 1
          },
          "minSize": {
            "height": 0.1,
            "width": 0.12
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "targetDate",
          "benefits"
        ],
        "kind": "collection",
        "nodeIds": [
          "time"
        ],
        "roleId": "time",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.125,
              "width": 0.25,
              "x": 0.083333,
              "y": 0.125
            },
            "frameAspectRatio": 1.555556
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.125,
              "width": 0.333333,
              "x": 0,
              "y": 0.5
            },
            "frameAspectRatio": 0.4
          }
        }
      },
      {
        "capabilities": [
          "content",
          "layout",
          "layer",
          "visibility",
          "typography"
        ],
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": false,
          "allowFocus": false,
          "allowHide": true,
          "allowTypography": true,
          "allowZoom": false,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 0.7,
            "width": 0.92
          },
          "minSize": {
            "height": 0.03,
            "width": 0.08
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "eyebrow",
          "title",
          "body"
        ],
        "kind": "text",
        "nodeIds": [
          "copy"
        ],
        "roleId": "copy",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.25,
              "width": 0.5,
              "x": 0.083333,
              "y": 0.375
            },
            "frameAspectRatio": 1.555556
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.125,
              "width": 0.9,
              "x": 0.05,
              "y": 0.625
            },
            "frameAspectRatio": 0.4
          }
        }
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
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": false,
          "allowFocus": false,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": false,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 0.28,
            "width": 0.72
          },
          "minSize": {
            "height": 0.04,
            "width": 0.08
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "buttonText",
          "targetType",
          "productCode",
          "productId",
          "linkUrl",
          "categorySlug"
        ],
        "kind": "action",
        "nodeIds": [
          "action",
          "buttonText"
        ],
        "roleId": "action",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.125,
              "width": 0.25,
              "x": 0.083333,
              "y": 0.75
            },
            "frameAspectRatio": 1.555556
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.125,
              "width": 0.416667,
              "x": 0.05,
              "y": 0.835
            },
            "frameAspectRatio": 0.4
          }
        }
      }
    ],
    "templateKey": "limitedEvent",
    "version": 6
  },
  {
    "designScope": "template-definition",
    "fixedObjects": true,
    "moduleType": "工艺细节",
    "objects": [
      {
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
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": true,
          "allowFocus": true,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": true,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 1,
            "width": 1
          },
          "minSize": {
            "height": 0.1,
            "width": 0.12
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "leadImage",
          "leadAltText"
        ],
        "kind": "media",
        "nodeIds": [
          "leadImage"
        ],
        "roleId": "leadImage",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.522222,
              "width": 0.626667,
              "x": 0.333333,
              "y": 0.04
            },
            "frameAspectRatio": 1.25
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.55,
              "width": 1,
              "x": 0,
              "y": 0
            },
            "frameAspectRatio": 0.44
          }
        }
      },
      {
        "capabilities": [
          "content",
          "layout",
          "layer",
          "visibility",
          "typography"
        ],
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": false,
          "allowFocus": false,
          "allowHide": true,
          "allowTypography": true,
          "allowZoom": false,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 0.7,
            "width": 0.92
          },
          "minSize": {
            "height": 0.03,
            "width": 0.08
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "eyebrow",
          "title",
          "body"
        ],
        "kind": "text",
        "nodeIds": [
          "copy"
        ],
        "roleId": "copy",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.28,
              "width": 0.25,
              "x": 0.04,
              "y": 0.12
            },
            "frameAspectRatio": 1.25
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.18,
              "width": 0.9,
              "x": 0.05,
              "y": 0.58
            },
            "frameAspectRatio": 0.44
          }
        }
      },
      {
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
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": true,
          "allowFocus": true,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": true,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 1,
            "width": 1
          },
          "minSize": {
            "height": 0.1,
            "width": 0.12
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "detailImageOne",
          "detailOneAltText"
        ],
        "kind": "media",
        "nodeIds": [
          "detailImageOne"
        ],
        "roleId": "detailImageOne",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.366667,
              "width": 0.293333,
              "x": 0.333333,
              "y": 0.61
            },
            "frameAspectRatio": 1.25
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.187,
              "width": 0.425,
              "x": 0.05,
              "y": 0.78
            },
            "frameAspectRatio": 0.44
          }
        }
      },
      {
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
        "collectionWholeObjectOnly": false,
        "constraints": {
          "allowAspectRatio": true,
          "allowFocus": true,
          "allowHide": false,
          "allowTypography": false,
          "allowZoom": true,
          "allowedResize": [
            "n",
            "ne",
            "e",
            "se",
            "s",
            "sw",
            "w",
            "nw"
          ],
          "layerRange": {
            "max": 20,
            "min": 0
          },
          "maxSize": {
            "height": 1,
            "width": 1
          },
          "minSize": {
            "height": 0.1,
            "width": 0.12
          },
          "movementAxes": [
            "x",
            "y"
          ],
          "safeAreaRequired": false
        },
        "contentFieldKeys": [
          "detailImageTwo",
          "detailTwoAltText"
        ],
        "kind": "media",
        "nodeIds": [
          "detailImageTwo"
        ],
        "roleId": "detailImageTwo",
        "viewports": {
          "desktop": {
            "applicable": true,
            "defaultRect": {
              "height": 0.366667,
              "width": 0.293333,
              "x": 0.666667,
              "y": 0.61
            },
            "frameAspectRatio": 1.25
          },
          "mobile": {
            "applicable": true,
            "defaultRect": {
              "height": 0.187,
              "width": 0.425,
              "x": 0.525,
              "y": 0.78
            },
            "frameAspectRatio": 0.44
          }
        }
      }
    ],
    "templateKey": "craftDetails",
    "version": 2
  }
] as const;

export type ContentTemplatePublicationAttestation = {
  gateVersion: number;
  contractSchemaVersion: number;
  registryVersion: number;
};

export function createContentTemplatePublicationAttestation(): ContentTemplatePublicationAttestation {
  return {
    gateVersion: CONTENT_TEMPLATE_PUBLICATION_GATE_VERSION,
    contractSchemaVersion: CONTENT_TEMPLATE_CONTRACT_SCHEMA_VERSION,
    registryVersion: CONTENT_TEMPLATE_REGISTRY_VERSION,
  };
}

export function hasCurrentContentTemplatePublicationAttestation(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
  const attestation = (metadata as Record<string, unknown>)[CONTENT_TEMPLATE_PUBLICATION_METADATA_KEY];
  if (!attestation || typeof attestation !== "object" || Array.isArray(attestation)) return false;
  return (attestation as Record<string, unknown>).gateVersion
    === CONTENT_TEMPLATE_PUBLICATION_GATE_VERSION;
}

export function withoutContentTemplatePublicationAttestation(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  return Object.fromEntries(
    Object.entries(metadata as Record<string, unknown>).filter(
      ([key]) => key !== CONTENT_TEMPLATE_PUBLICATION_METADATA_KEY,
    ),
  );
}

export type RegisteredContentTemplateKey = "hero" | "fullBleed" | "video" | "carousel" | "singlePoster" | "doublePoster" | "textBanner" | "journey" | "comparison" | "featuredProduct" | "productRow" | "gallery" | "wearingInspiration" | "categoryCards" | "sceneShopping" | "hotspot" | "brandPoints" | "servicePromises" | "certificates" | "storeInfo" | "testimonials" | "booking" | "limitedEvent" | "craftDetails";
export type ContentTemplateKey = RegisteredContentTemplateKey;
export type ContentTemplateMaster = "asymmetric-gallery" | "booking-epilogue" | "brand-points" | "category-navigation" | "cinematic-hero" | "cinematic-video" | "comparison-stage" | "editorial-journey" | "editorial-split" | "editorial-story" | "editorial-text" | "event-stage" | "hotspot-stage" | "immersive-image" | "product-focus" | "product-grid" | "scene-navigation" | "sequence-stage" | "service-policy" | "store-visit" | "testimonial-proof" | "trust-gallery" | "wearing-story";
export type ContentTemplateAssetClass = "product" | "editorial" | "craft" | "service";
export type ContentTemplateCommercialPurpose =
  | "品牌展示" | "商品销售" | "活动转化" | "内容传播" | "信任建立";

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

export type ContentTemplatePageMetadataField = "seoTitle" | "seoDescription" | "ogImage" | "contentOwner";
export type ContentTemplatePublicPageMetadataField = Exclude<ContentTemplatePageMetadataField, "contentOwner">;

export type ContentTemplatePageMetadataContract = {
  recommendedForPublication: readonly ContentTemplatePageMetadataField[];
  publicFields: readonly ContentTemplatePublicPageMetadataField[];
  limits: Readonly<Record<ContentTemplatePageMetadataField, number>>;
  mediaRights: {
    maxItems: number;
    fieldLimits: Readonly<Record<"assetUrl" | "source" | "authorizationId", number>>;
  };
};

export const CONTENT_TEMPLATE_PAGE_METADATA = {
  "limits": {
    "contentOwner": 80,
    "ogImage": 2048,
    "seoDescription": 160,
    "seoTitle": 60
  },
  "mediaRights": {
    "fieldLimits": {
      "assetUrl": 2048,
      "authorizationId": 120,
      "source": 120
    },
    "maxItems": 120
  },
  "publicFields": [
    "seoTitle",
    "seoDescription",
    "ogImage"
  ],
  "recommendedForPublication": [
    "seoTitle",
    "seoDescription",
    "ogImage",
    "contentOwner"
  ]
} as const satisfies ContentTemplatePageMetadataContract;

export type ContentTemplatePageRule = {
  pageKey: string;
  publicPath: string;
  pageRole: string;
  contentPlacement: "root-only";
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
      "carousel",
      "singlePoster",
      "doublePoster",
      "textBanner",
      "journey",
      "comparison",
      "featuredProduct",
      "productRow",
      "gallery",
      "wearingInspiration",
      "categoryCards",
      "sceneShopping",
      "hotspot",
      "brandPoints",
      "servicePromises",
      "certificates",
      "storeInfo",
      "testimonials",
      "booking",
      "limitedEvent",
      "craftDetails"
    ],
    "businessRegionCount": 0,
    "contentPlacement": "root-only",
    "headerMode": {
      "configured": "overlay-light",
      "fallback": "solid",
      "overlayRequiresFirstTemplate": "hero"
    },
    "pageKey": "about",
    "pageRole": "brand-story",
    "publicPath": "/about"
  },
  "catalog": {
    "allowedTemplateKeys": [
      "hero",
      "fullBleed",
      "video",
      "carousel",
      "singlePoster",
      "doublePoster",
      "textBanner",
      "journey",
      "comparison",
      "featuredProduct",
      "productRow",
      "gallery",
      "wearingInspiration",
      "categoryCards",
      "sceneShopping",
      "hotspot",
      "brandPoints",
      "servicePromises",
      "certificates",
      "storeInfo",
      "testimonials",
      "booking",
      "limitedEvent",
      "craftDetails"
    ],
    "businessRegionCount": 1,
    "businessRegionPosition": "after-first-brand-block",
    "contentPlacement": "root-only",
    "headerMode": {
      "configured": "overlay-light",
      "fallback": "solid",
      "overlayRequiresFirstTemplate": "hero"
    },
    "pageKey": "catalog",
    "pageRole": "selection-tool",
    "publicPath": "/catalog"
  },
  "contact": {
    "allowedTemplateKeys": [
      "hero",
      "fullBleed",
      "video",
      "carousel",
      "singlePoster",
      "doublePoster",
      "textBanner",
      "journey",
      "comparison",
      "featuredProduct",
      "productRow",
      "gallery",
      "wearingInspiration",
      "categoryCards",
      "sceneShopping",
      "hotspot",
      "brandPoints",
      "servicePromises",
      "certificates",
      "storeInfo",
      "testimonials",
      "booking",
      "limitedEvent",
      "craftDetails"
    ],
    "businessRegionCount": 1,
    "businessRegionPosition": "after-first-brand-block",
    "contentPlacement": "root-only",
    "headerMode": {
      "configured": "overlay-light",
      "fallback": "solid",
      "overlayRequiresFirstTemplate": "hero"
    },
    "pageKey": "contact",
    "pageRole": "conversion-support",
    "publicPath": "/contact"
  },
  "custom": {
    "allowedTemplateKeys": [
      "hero",
      "fullBleed",
      "video",
      "carousel",
      "singlePoster",
      "doublePoster",
      "textBanner",
      "journey",
      "comparison",
      "featuredProduct",
      "productRow",
      "gallery",
      "wearingInspiration",
      "categoryCards",
      "sceneShopping",
      "hotspot",
      "brandPoints",
      "servicePromises",
      "certificates",
      "storeInfo",
      "testimonials",
      "booking",
      "limitedEvent",
      "craftDetails"
    ],
    "businessRegionCount": 0,
    "contentPlacement": "root-only",
    "headerMode": {
      "configured": "overlay-light",
      "fallback": "solid",
      "overlayRequiresFirstTemplate": "hero"
    },
    "pageKey": "custom",
    "pageRole": "brand-service",
    "publicPath": "/custom"
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
      "comparison",
      "featuredProduct",
      "productRow",
      "gallery",
      "wearingInspiration",
      "categoryCards",
      "sceneShopping",
      "hotspot",
      "brandPoints",
      "servicePromises",
      "certificates",
      "storeInfo",
      "testimonials",
      "booking",
      "limitedEvent",
      "craftDetails"
    ],
    "businessRegionCount": 0,
    "contentPlacement": "root-only",
    "headerMode": {
      "configured": "overlay-light",
      "fallback": "solid",
      "overlayRequiresFirstTemplate": "hero"
    },
    "pageKey": "home",
    "pageRole": "brand-home",
    "publicPath": "/"
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
      "journey",
      "comparison",
      "featuredProduct",
      "productRow",
      "gallery",
      "wearingInspiration",
      "categoryCards",
      "sceneShopping",
      "hotspot",
      "brandPoints",
      "servicePromises",
      "certificates",
      "storeInfo",
      "testimonials",
      "booking",
      "limitedEvent",
      "craftDetails"
    ],
    "businessRegionCount": 0,
    "contentPlacement": "root-only",
    "headerMode": {
      "configured": "overlay-light",
      "fallback": "solid",
      "overlayRequiresFirstTemplate": "hero"
    },
    "pageKey": "products",
    "pageRole": "brand-showcase",
    "publicPath": "/products"
  }
} as const satisfies Record<string, ContentTemplatePageRule>;

export const CONTENT_TEMPLATE_PAGE_PATHS = {
  "about": "/about",
  "catalog": "/catalog",
  "contact": "/contact",
  "custom": "/custom",
  "home": "/",
  "products": "/products"
} as const;
export type ContentTemplatePagePath =
  (typeof CONTENT_TEMPLATE_PAGE_PATHS)[keyof typeof CONTENT_TEMPLATE_PAGE_PATHS];

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

export type ContentTemplateResizeDirection = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

export type ContentTemplateEditableConstraints = {
  minSize: { width: number; height: number };
  maxSize: { width: number; height: number };
  movementAxes: readonly ("x" | "y")[];
  allowedResize: readonly ContentTemplateResizeDirection[];
  layerRange: { min: number; max: number };
  allowHide: boolean;
  allowAspectRatio: boolean;
  allowFocus: boolean;
  allowZoom: boolean;
  allowTypography: boolean;
  safeAreaRequired: boolean;
};

export type ContentTemplateEditableObject = {
  roleId: string;
  nodeIds?: readonly string[];
  kind: ContentTemplateEditableObjectKind;
  contentFieldKeys: readonly string[];
  mediaFieldKeys?: readonly string[];
  altFieldKey?: string;
  altPolicy?: "required" | "derived" | "decorative" | "not-applicable";
  collectionFieldKeys?: readonly string[];
  collectionMediaPolicies?: readonly {
    collectionFieldKey: string;
    mediaFieldKeys: readonly string[];
    altPolicy: "required" | "derived" | "decorative" | "not-applicable";
    altFieldKey?: string;
    derivedAltFieldKey?: string;
  }[];
  collectionLinkPolicies?: readonly {
    collectionFieldKey: string;
    required: boolean;
  }[];
  referenceFieldKey?: string;
  fieldScopes?: Readonly<Record<string, ContentTemplateResponsiveScope>>;
  capabilities: readonly ContentTemplateEditableCapability[];
  capabilityViewports?: Partial<Record<ContentTemplateEditableCapability, readonly ("desktop" | "mobile")[]>>;
  responsive: Partial<Record<ContentTemplateEditableCapability, ContentTemplateResponsiveScope>>;
  constraints: ContentTemplateEditableConstraints;
};

export type ContentTemplateDefaultGeometryZone = {
  nodeId: string;
  roleId: string;
  role: ContentTemplateSkeletonRole;
  rect: ContentTemplateVisualRect;
  overlay?: boolean;
  kind?: "play" | "pagination" | "steps-5" | "handle" | "hotspot" | "countdown";
};

export type ContentTemplateDefaultGeometryViewport = {
  tone: "light" | "dark";
  rows: number;
  frameAspectRatio: number;
  safeArea: ContentTemplateVisualRect;
  zones: readonly ContentTemplateDefaultGeometryZone[];
};

export type ContentTemplateContract = {
  key: ContentTemplateKey;
  moduleType: string;
  displayName: string;
  commercialPurpose: ContentTemplateCommercialPurpose;
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
  defaultGeometryByViewport: Record<"desktop" | "mobile", ContentTemplateDefaultGeometryViewport>;
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

export type ContentTemplateSizeCompatibilityAxis = typeof CONTENT_TEMPLATE_SIZE_COMPATIBILITY_STATE;

export type ContentTemplateSizeCompatibility = {
  width?: ContentTemplateSizeCompatibilityAxis;
  height?: ContentTemplateSizeCompatibilityAxis;
};

export type ContentTemplateInstanceOverridesV2 = {
  version: 2;
  frame?: {
    aspectRatio?: number;
    aspectRatioByViewport?: Partial<Record<"desktop" | "mobile", number>>;
    heightPreset?: string;
    compositionPreset?: string;
    colorPreset?: string;
    paddingPreset?: "compact" | "standard" | "spacious";
    radiusPreset?: "square" | "soft" | "rounded";
    shadowPreset?: "none" | "soft" | "lifted";
    customColors?: {
      background?: string;
      text?: string;
      accent?: string;
    };
  };
  nodes?: Record<string, {
    enabled?: boolean;
    rectByViewport?: Partial<Record<"desktop" | "mobile", ContentTemplateVisualRect>>;
    sizeCompatibilityByViewport?: Partial<Record<"desktop" | "mobile", ContentTemplateSizeCompatibility>>;
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
    appearance?: {
      radiusPreset?: "square" | "soft" | "rounded";
      shadowPreset?: "none" | "soft" | "lifted";
    };
  }>;
};

export type ContentTemplateInstanceOverrides =
  | ContentTemplateInstanceOverridesV1
  | ContentTemplateInstanceOverridesV2;

export type ContentTemplateDefaultContentValue =
  | string
  | number
  | boolean
  | null
  | readonly ContentTemplateDefaultContentValue[]
  | { readonly [key: string]: ContentTemplateDefaultContentValue };

export type ContentTemplateDefaultContent = Readonly<
  Record<string, ContentTemplateDefaultContentValue>
>;

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
  commercialPurpose: ContentTemplateCommercialPurpose;
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
  content: {
    complete: boolean;
    missing: string[];
    missingCollectionAltText: Array<{
      roleId: string;
      collectionFieldKey: string;
      altFieldKey: string;
      altPolicy: "required" | "derived";
      index: number;
    }>;
  };
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

export type ContentTemplateMediaRight = {
  assetUrl: string;
  source: string;
  authorizationId: string;
};

export type ContentTemplateMediaReference = {
  url: string;
  path: string;
  field: string;
  blockId?: string;
  moduleType?: string;
  index?: number;
};

export type ContentTemplateLinkTargetReference = {
  path: string;
  field: string;
  required: boolean;
  targetTypeFieldKey: string;
  productCodeFieldKey: string;
  productIdFieldKey: string;
  categorySlugFieldKey: string;
  linkUrlFieldKey: string;
  legacyLinkFieldKey?: string;
  actionTextFieldKey?: string;
  targetType: unknown;
  productCode: unknown;
  productId: unknown;
  categorySlug: unknown;
  linkUrl: unknown;
  legacyLink?: unknown;
  actionText?: unknown;
  blockId?: string;
  moduleType: string;
  index?: number;
};

export const CONTENT_TEMPLATE_REGISTRY = [
  {
    "category": "视觉展示",
    "commercialPurpose": "品牌展示",
    "displayName": "首屏",
    "implementationStatus": "active",
    "key": "hero",
    "moduleType": "首屏主视觉"
  },
  {
    "category": "视觉展示",
    "commercialPurpose": "品牌展示",
    "displayName": "通栏图",
    "implementationStatus": "active",
    "key": "fullBleed",
    "moduleType": "全屏出血图"
  },
  {
    "category": "视觉展示",
    "commercialPurpose": "品牌展示",
    "displayName": "视频",
    "implementationStatus": "active",
    "key": "video",
    "moduleType": "视频区块"
  },
  {
    "category": "视觉展示",
    "commercialPurpose": "品牌展示",
    "displayName": "轮播",
    "implementationStatus": "active",
    "key": "carousel",
    "moduleType": "轮播图"
  },
  {
    "category": "图文内容",
    "commercialPurpose": "内容传播",
    "displayName": "单图文",
    "implementationStatus": "active",
    "key": "singlePoster",
    "moduleType": "单图海报"
  },
  {
    "category": "图文内容",
    "commercialPurpose": "内容传播",
    "displayName": "双图文",
    "implementationStatus": "active",
    "key": "doublePoster",
    "moduleType": "双图海报"
  },
  {
    "category": "图文内容",
    "commercialPurpose": "内容传播",
    "displayName": "纯文字",
    "implementationStatus": "active",
    "key": "textBanner",
    "moduleType": "文字横幅"
  },
  {
    "category": "图文内容",
    "commercialPurpose": "内容传播",
    "displayName": "内容流程",
    "implementationStatus": "active",
    "key": "journey",
    "moduleType": "定制流程"
  },
  {
    "category": "图文内容",
    "commercialPurpose": "信任建立",
    "displayName": "前后对比",
    "implementationStatus": "active",
    "key": "comparison",
    "moduleType": "改款对比"
  },
  {
    "category": "商品展示",
    "commercialPurpose": "商品销售",
    "displayName": "单品展示",
    "implementationStatus": "active",
    "key": "featuredProduct",
    "moduleType": "单品焦点推荐"
  },
  {
    "category": "商品展示",
    "commercialPurpose": "商品销售",
    "displayName": "商品列表",
    "implementationStatus": "active",
    "key": "productRow",
    "moduleType": "产品展示行"
  },
  {
    "category": "商品展示",
    "commercialPurpose": "商品销售",
    "displayName": "作品画廊",
    "implementationStatus": "active",
    "key": "gallery",
    "moduleType": "作品画廊"
  },
  {
    "category": "商品展示",
    "commercialPurpose": "商品销售",
    "displayName": "佩戴展示",
    "implementationStatus": "active",
    "key": "wearingInspiration",
    "moduleType": "佩戴灵感"
  },
  {
    "category": "导航入口",
    "commercialPurpose": "商品销售",
    "displayName": "品类入口",
    "implementationStatus": "active",
    "key": "categoryCards",
    "moduleType": "分类卡片"
  },
  {
    "category": "导航入口",
    "commercialPurpose": "商品销售",
    "displayName": "场景入口",
    "implementationStatus": "active",
    "key": "sceneShopping",
    "moduleType": "按场景选购"
  },
  {
    "category": "导航入口",
    "commercialPurpose": "商品销售",
    "displayName": "图片热区",
    "implementationStatus": "active",
    "key": "hotspot",
    "moduleType": "热区图"
  },
  {
    "category": "服务信息",
    "commercialPurpose": "信任建立",
    "displayName": "品牌要点",
    "implementationStatus": "active",
    "key": "brandPoints",
    "moduleType": "卡片网格"
  },
  {
    "category": "服务信息",
    "commercialPurpose": "信任建立",
    "displayName": "服务承诺",
    "implementationStatus": "active",
    "key": "servicePromises",
    "moduleType": "服务承诺"
  },
  {
    "category": "服务信息",
    "commercialPurpose": "信任建立",
    "displayName": "证书展示",
    "implementationStatus": "active",
    "key": "certificates",
    "moduleType": "资质证书"
  },
  {
    "category": "服务信息",
    "commercialPurpose": "信任建立",
    "displayName": "门店信息",
    "implementationStatus": "active",
    "key": "storeInfo",
    "moduleType": "门店信息"
  },
  {
    "category": "服务信息",
    "commercialPurpose": "信任建立",
    "displayName": "顾客分享",
    "implementationStatus": "active",
    "key": "testimonials",
    "moduleType": "真实评价与实拍"
  },
  {
    "category": "服务信息",
    "commercialPurpose": "活动转化",
    "displayName": "预约入口",
    "implementationStatus": "active",
    "key": "booking",
    "moduleType": "预约入口"
  },
  {
    "category": "活动内容",
    "commercialPurpose": "活动转化",
    "displayName": "限时活动",
    "implementationStatus": "active",
    "key": "limitedEvent",
    "moduleType": "限时活动"
  },
  {
    "category": "图文内容",
    "commercialPurpose": "信任建立",
    "displayName": "工艺细节",
    "implementationStatus": "active",
    "key": "craftDetails",
    "moduleType": "工艺细节"
  }
] as const;

/** 所有真实 Renderer 的完整 schema v5 合同；implementationStatus 不再决定可否渲染。 */
export const CONTENT_TEMPLATE_CONTRACTS = {
  "booking": {
    "allowedControls": [],
    "commercialPurpose": "活动转化",
    "contentBudget": {
      "limits": {
        "altText": 80,
        "buttonText": 12,
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
    "defaultGeometryByViewport": {
      "desktop": {
        "frameAspectRatio": 2.285714,
        "rows": 8,
        "safeArea": {
          "height": 0.9,
          "width": 0.92,
          "x": 0.04,
          "y": 0.05
        },
        "tone": "light",
        "zones": [
          {
            "nodeId": "bgImage",
            "overlay": true,
            "rect": {
              "height": 1,
              "width": 1,
              "x": 0,
              "y": 0
            },
            "role": "media",
            "roleId": "bgImage"
          },
          {
            "nodeId": "copy",
            "rect": {
              "height": 0.375,
              "width": 0.5,
              "x": 0.083333,
              "y": 0.125
            },
            "role": "copy",
            "roleId": "copy"
          },
          {
            "nodeId": "primaryAction",
            "rect": {
              "height": 0.125,
              "width": 0.25,
              "x": 0.666667,
              "y": 0.25
            },
            "role": "action",
            "roleId": "primaryAction"
          },
          {
            "nodeId": "secondaryContact",
            "rect": {
              "height": 0.125,
              "width": 0.25,
              "x": 0.666667,
              "y": 0.5
            },
            "role": "marker",
            "roleId": "secondaryContact"
          }
        ]
      },
      "mobile": {
        "frameAspectRatio": 0.8,
        "rows": 8,
        "safeArea": {
          "height": 0.92,
          "width": 0.9,
          "x": 0.05,
          "y": 0.04
        },
        "tone": "light",
        "zones": [
          {
            "nodeId": "bgImage",
            "overlay": true,
            "rect": {
              "height": 1,
              "width": 1,
              "x": 0,
              "y": 0
            },
            "role": "media",
            "roleId": "bgImage"
          },
          {
            "nodeId": "copy",
            "rect": {
              "height": 0.375,
              "width": 0.9,
              "x": 0.05,
              "y": 0.04
            },
            "role": "copy",
            "roleId": "copy"
          },
          {
            "nodeId": "primaryAction",
            "rect": {
              "height": 0.125,
              "width": 0.666667,
              "x": 0.05,
              "y": 0.5
            },
            "role": "action",
            "roleId": "primaryAction"
          },
          {
            "nodeId": "secondaryContact",
            "rect": {
              "height": 0.125,
              "width": 0.666667,
              "x": 0.05,
              "y": 0.75
            },
            "role": "marker",
            "roleId": "secondaryContact"
          }
        ]
      }
    },
    "displayName": "预约入口",
    "editorCapabilities": {
      "editableObjects": [
        {
          "altFieldKey": "altText",
          "altPolicy": "required",
          "capabilities": [
            "content",
            "layout",
            "layer",
            "fit",
            "zoom",
            "focus"
          ],
          "constraints": {
            "allowAspectRatio": false,
            "allowFocus": true,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": true,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 1,
              "width": 1
            },
            "minSize": {
              "height": 0.1,
              "width": 0.12
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
          "contentFieldKeys": [
            "backgroundImage",
            "altText"
          ],
          "kind": "media",
          "mediaFieldKeys": [
            "backgroundImage"
          ],
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
            "visibility",
            "typography",
            "layout",
            "layer"
          ],
          "constraints": {
            "allowAspectRatio": false,
            "allowFocus": false,
            "allowHide": true,
            "allowTypography": true,
            "allowZoom": false,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 0.7,
              "width": 0.92
            },
            "minSize": {
              "height": 0.03,
              "width": 0.08
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
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
            "visibility",
            "typography",
            "layout",
            "layer"
          ],
          "constraints": {
            "allowAspectRatio": false,
            "allowFocus": false,
            "allowHide": false,
            "allowTypography": true,
            "allowZoom": false,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 0.28,
              "width": 0.72
            },
            "minSize": {
              "height": 0.04,
              "width": 0.08
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
          "contentFieldKeys": [
            "buttonText",
            "targetType",
            "productCode",
            "productId",
            "linkUrl",
            "categorySlug"
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
          "4 / 5",
          "16/9",
          "4/3",
          "1/1",
          "3/4",
          "9/16"
        ],
        "frameRatioRange": {
          "max": 4,
          "min": 0.25,
          "step": 0.01
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
            "requiresSafeBand": false,
            "roleId": "title",
            "sizePresets": [
              "small",
              "standard",
              "large"
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
            "requiresSafeBand": false,
            "roleId": "subtitle",
            "sizePresets": [
              "small",
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
            "requiresSafeBand": false,
            "roleId": "buttonText",
            "sizePresets": [
              "small",
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
              "mineral",
              "ivory"
            ],
            "maxLines": 6,
            "placementPresets": [],
            "requiresSafeBand": false,
            "roleId": "copy",
            "widthPresets": []
          },
          {
            "align": [
              "left",
              "center",
              "right"
            ],
            "colorTokens": [
              "ink",
              "mineral",
              "ivory"
            ],
            "maxLines": 6,
            "placementPresets": [],
            "requiresSafeBand": false,
            "roleId": "primaryAction",
            "widthPresets": []
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
            "column": 1,
            "overlay": true,
            "role": "media",
            "roleId": "bgImage",
            "row": 1,
            "rowSpan": 8,
            "span": 12
          },
          {
            "column": 1.999996,
            "role": "copy",
            "roleId": "copy",
            "row": 2,
            "rowSpan": 3,
            "span": 6
          },
          {
            "column": 9.000004,
            "role": "action",
            "roleId": "primaryAction",
            "row": 3,
            "rowSpan": 1,
            "span": 3
          },
          {
            "column": 9.000004,
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
            "overlay": true,
            "role": "media",
            "roleId": "bgImage",
            "row": 1,
            "rowSpan": 8,
            "span": 12
          },
          {
            "column": 1.6,
            "role": "copy",
            "roleId": "copy",
            "row": 1.32,
            "rowSpan": 3,
            "span": 10.8
          },
          {
            "column": 1.6,
            "role": "action",
            "roleId": "primaryAction",
            "row": 5,
            "rowSpan": 1,
            "span": 8.000004
          },
          {
            "column": 1.6,
            "role": "marker",
            "roleId": "secondaryContact",
            "row": 7,
            "rowSpan": 1,
            "span": 8.000004
          }
        ]
      },
      "purpose": "页面尾章的预约主行动与统一联系电话",
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
        "semantic": "site-settings-secondary-contact"
      }
    ],
    "spacingPolicy": [
      "normal"
    ],
    "supportsLinkTarget": true,
    "version": 7,
    "visualRole": "support-stage",
    "visualWeight": "support-stage",
    "width": "standard"
  },
  "brandPoints": {
    "allowedControls": [],
    "commercialPurpose": "信任建立",
    "contentBudget": {
      "limits": {},
      "maxCtas": 0,
      "requiredText": []
    },
    "copyPlacementByViewport": {
      "desktop": "stacked",
      "mobile": "stacked"
    },
    "defaultGeometryByViewport": {
      "desktop": {
        "frameAspectRatio": 1.6,
        "rows": 8,
        "safeArea": {
          "height": 0.9,
          "width": 0.92,
          "x": 0.04,
          "y": 0.05
        },
        "tone": "light",
        "zones": [
          {
            "nodeId": "copy",
            "rect": {
              "height": 0.125,
              "width": 0.666667,
              "x": 0.166667,
              "y": 0.05
            },
            "role": "copy",
            "roleId": "copy"
          },
          {
            "nodeId": "points",
            "rect": {
              "height": 0.375,
              "width": 0.333333,
              "x": 0,
              "y": 0.25
            },
            "role": "card",
            "roleId": "points"
          },
          {
            "nodeId": "points",
            "rect": {
              "height": 0.375,
              "width": 0.333333,
              "x": 0.333333,
              "y": 0.25
            },
            "role": "card",
            "roleId": "points"
          },
          {
            "nodeId": "points",
            "rect": {
              "height": 0.375,
              "width": 0.333333,
              "x": 0.666667,
              "y": 0.25
            },
            "role": "card",
            "roleId": "points"
          }
        ]
      },
      "mobile": {
        "frameAspectRatio": 0.8,
        "rows": 8,
        "safeArea": {
          "height": 0.92,
          "width": 0.9,
          "x": 0.05,
          "y": 0.04
        },
        "tone": "light",
        "zones": [
          {
            "nodeId": "copy",
            "rect": {
              "height": 0.125,
              "width": 0.9,
              "x": 0.05,
              "y": 0.04
            },
            "role": "copy",
            "roleId": "copy"
          },
          {
            "nodeId": "points",
            "rect": {
              "height": 0.25,
              "width": 1,
              "x": 0,
              "y": 0.125
            },
            "role": "card",
            "roleId": "points"
          },
          {
            "nodeId": "points",
            "rect": {
              "height": 0.25,
              "width": 1,
              "x": 0,
              "y": 0.375
            },
            "role": "card",
            "roleId": "points"
          },
          {
            "nodeId": "points",
            "rect": {
              "height": 0.25,
              "width": 1,
              "x": 0,
              "y": 0.625
            },
            "role": "card",
            "roleId": "points"
          }
        ]
      }
    },
    "displayName": "品牌要点",
    "editorCapabilities": {
      "editableObjects": [
        {
          "capabilities": [
            "content",
            "items",
            "layout",
            "layer"
          ],
          "collectionFieldKeys": [
            "cards"
          ],
          "constraints": {
            "allowAspectRatio": false,
            "allowFocus": false,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": false,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 1,
              "width": 1
            },
            "minSize": {
              "height": 0.1,
              "width": 0.12
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
          "contentFieldKeys": [
            "cards"
          ],
          "kind": "collection",
          "responsive": {
            "content": "shared",
            "items": "shared",
            "layer": "viewport-specific",
            "layout": "viewport-specific"
          },
          "roleId": "points"
        },
        {
          "capabilities": [
            "content",
            "layout",
            "layer",
            "visibility",
            "typography"
          ],
          "constraints": {
            "allowAspectRatio": false,
            "allowFocus": false,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": false,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 0.7,
              "width": 0.92
            },
            "minSize": {
              "height": 0.03,
              "width": 0.08
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
          "contentFieldKeys": [
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
        ],
        "frameRatioPresets": [
          "16/9",
          "4/3",
          "1/1",
          "3/4",
          "9/16"
        ],
        "frameRatioRange": {
          "max": 4,
          "min": 0.25,
          "step": 0.01
        },
        "slots": [
          {
            "roleId": "points"
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
              "mineral",
              "ivory"
            ],
            "maxLines": 6,
            "placementPresets": [],
            "requiresSafeBand": false,
            "roleId": "copy",
            "widthPresets": []
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
            "column": 3.000004,
            "role": "copy",
            "roleId": "copy",
            "row": 1.4,
            "rowSpan": 1,
            "span": 8.000004
          },
          {
            "column": 1,
            "role": "card",
            "roleId": "points",
            "row": 3,
            "rowSpan": 3,
            "span": 3.999996
          },
          {
            "column": 4.999996,
            "role": "card",
            "roleId": "points",
            "row": 3,
            "rowSpan": 3,
            "span": 3.999996
          },
          {
            "column": 9.000004,
            "role": "card",
            "roleId": "points",
            "row": 3,
            "rowSpan": 3,
            "span": 3.999996
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
            "column": 1.6,
            "role": "copy",
            "roleId": "copy",
            "row": 1.32,
            "rowSpan": 1,
            "span": 10.8
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
    "version": 4,
    "visualRole": "support-stage",
    "visualWeight": "support-stage",
    "width": "standard"
  },
  "carousel": {
    "allowedControls": [],
    "commercialPurpose": "品牌展示",
    "contentBudget": {
      "limits": {},
      "maxCtas": 0,
      "requiredText": []
    },
    "copyPlacementByViewport": {
      "desktop": "overlay",
      "mobile": "stacked"
    },
    "defaultGeometryByViewport": {
      "desktop": {
        "frameAspectRatio": 2.625,
        "rows": 8,
        "safeArea": {
          "height": 0.9,
          "width": 0.92,
          "x": 0.04,
          "y": 0.05
        },
        "tone": "light",
        "zones": [
          {
            "nodeId": "frames",
            "rect": {
              "height": 0.75,
              "width": 1,
              "x": 0,
              "y": 0
            },
            "role": "media",
            "roleId": "frames"
          },
          {
            "nodeId": "copy",
            "overlay": true,
            "rect": {
              "height": 0.125,
              "width": 0.416667,
              "x": 0.083333,
              "y": 0.375
            },
            "role": "copy",
            "roleId": "copy"
          },
          {
            "kind": "pagination",
            "nodeId": "pagination",
            "overlay": true,
            "rect": {
              "height": 0.125,
              "width": 0.25,
              "x": 0.666667,
              "y": 0.625
            },
            "role": "marker",
            "roleId": "pagination"
          }
        ]
      },
      "mobile": {
        "frameAspectRatio": 0.4,
        "rows": 8,
        "safeArea": {
          "height": 0.92,
          "width": 0.9,
          "x": 0.05,
          "y": 0.04
        },
        "tone": "light",
        "zones": [
          {
            "nodeId": "frames",
            "rect": {
              "height": 0.5,
              "width": 1,
              "x": 0,
              "y": 0
            },
            "role": "media",
            "roleId": "frames"
          },
          {
            "nodeId": "copy",
            "rect": {
              "height": 0.25,
              "width": 1,
              "x": 0,
              "y": 0.5
            },
            "role": "copy",
            "roleId": "copy"
          },
          {
            "kind": "pagination",
            "nodeId": "pagination",
            "rect": {
              "height": 0.125,
              "width": 0.333333,
              "x": 0,
              "y": 0.75
            },
            "role": "marker",
            "roleId": "pagination"
          }
        ]
      }
    },
    "displayName": "轮播",
    "editorCapabilities": {
      "editableObjects": [
        {
          "capabilities": [
            "content",
            "items",
            "link",
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
          "collectionLinkPolicies": [
            {
              "collectionFieldKey": "images",
              "required": false
            }
          ],
          "collectionMediaPolicies": [
            {
              "altFieldKey": "alt",
              "altPolicy": "required",
              "collectionFieldKey": "images",
              "mediaFieldKeys": [
                "url",
                "mobileUrl"
              ]
            }
          ],
          "constraints": {
            "allowAspectRatio": true,
            "allowFocus": true,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": true,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 1,
              "width": 1
            },
            "minSize": {
              "height": 0.1,
              "width": 0.12
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
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
            "link": "shared",
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
        "frameRatioPresets": [
          "16/9",
          "4/3",
          "1/1",
          "3/4",
          "9/16"
        ],
        "frameRatioRange": {
          "max": 4,
          "min": 0.25,
          "step": 0.01
        },
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
        ],
        "textRoles": []
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
            "column": 1.999996,
            "overlay": true,
            "role": "copy",
            "roleId": "copy",
            "row": 4,
            "rowSpan": 1,
            "span": 5.000004
          },
          {
            "column": 9.000004,
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
            "span": 3.999996
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
    "version": 4,
    "visualRole": "feature-stage",
    "visualWeight": "feature-stage",
    "width": "full"
  },
  "categoryCards": {
    "allowedControls": [],
    "commercialPurpose": "商品销售",
    "contentBudget": {
      "limits": {},
      "maxCtas": 0,
      "requiredText": []
    },
    "copyPlacementByViewport": {
      "desktop": "stacked",
      "mobile": "stacked"
    },
    "defaultGeometryByViewport": {
      "desktop": {
        "frameAspectRatio": 1.6,
        "rows": 8,
        "safeArea": {
          "height": 0.9,
          "width": 0.92,
          "x": 0.04,
          "y": 0.05
        },
        "tone": "light",
        "zones": [
          {
            "nodeId": "copy",
            "rect": {
              "height": 0.125,
              "width": 0.333333,
              "x": 0.04,
              "y": 0.05
            },
            "role": "copy",
            "roleId": "copy"
          },
          {
            "nodeId": "categories",
            "rect": {
              "height": 0.5,
              "width": 0.333333,
              "x": 0,
              "y": 0.25
            },
            "role": "card",
            "roleId": "categories"
          },
          {
            "nodeId": "categories",
            "rect": {
              "height": 0.5,
              "width": 0.333333,
              "x": 0.333333,
              "y": 0.25
            },
            "role": "card",
            "roleId": "categories"
          },
          {
            "nodeId": "categories",
            "rect": {
              "height": 0.5,
              "width": 0.333333,
              "x": 0.666667,
              "y": 0.25
            },
            "role": "card",
            "roleId": "categories"
          }
        ]
      },
      "mobile": {
        "frameAspectRatio": 0.8,
        "rows": 8,
        "safeArea": {
          "height": 0.92,
          "width": 0.9,
          "x": 0.05,
          "y": 0.04
        },
        "tone": "light",
        "zones": [
          {
            "nodeId": "copy",
            "rect": {
              "height": 0.125,
              "width": 0.9,
              "x": 0.05,
              "y": 0.04
            },
            "role": "copy",
            "roleId": "copy"
          },
          {
            "nodeId": "categories",
            "rect": {
              "height": 0.25,
              "width": 1,
              "x": 0,
              "y": 0.125
            },
            "role": "card",
            "roleId": "categories"
          },
          {
            "nodeId": "categories",
            "rect": {
              "height": 0.25,
              "width": 1,
              "x": 0,
              "y": 0.375
            },
            "role": "card",
            "roleId": "categories"
          },
          {
            "nodeId": "categories",
            "rect": {
              "height": 0.25,
              "width": 1,
              "x": 0,
              "y": 0.625
            },
            "role": "card",
            "roleId": "categories"
          }
        ]
      }
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
          "collectionMediaPolicies": [
            {
              "altPolicy": "derived",
              "collectionFieldKey": "categories",
              "derivedAltFieldKey": "name",
              "mediaFieldKeys": [
                "image"
              ]
            }
          ],
          "constraints": {
            "allowAspectRatio": true,
            "allowFocus": false,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": false,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 1,
              "width": 1
            },
            "minSize": {
              "height": 0.1,
              "width": 0.12
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
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
            "content",
            "layout",
            "layer",
            "visibility",
            "typography"
          ],
          "constraints": {
            "allowAspectRatio": false,
            "allowFocus": false,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": false,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 0.7,
              "width": 0.92
            },
            "minSize": {
              "height": 0.03,
              "width": 0.08
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
          "contentFieldKeys": [
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
        }
      ],
      "layoutOverrides": {
        "compositionPresets": [
          "grid-2",
          "grid-3",
          "grid-4"
        ],
        "frameRatioPresets": [
          "16/9",
          "4/3",
          "1/1",
          "3/4",
          "9/16"
        ],
        "frameRatioRange": {
          "max": 4,
          "min": 0.25,
          "step": 0.01
        },
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
              "mineral",
              "ivory"
            ],
            "maxLines": 6,
            "placementPresets": [],
            "requiresSafeBand": false,
            "roleId": "copy",
            "widthPresets": []
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
            "column": 1.48,
            "role": "copy",
            "roleId": "copy",
            "row": 1.4,
            "rowSpan": 1,
            "span": 3.999996
          },
          {
            "column": 1,
            "role": "card",
            "roleId": "categories",
            "row": 3,
            "rowSpan": 4,
            "span": 3.999996
          },
          {
            "column": 4.999996,
            "role": "card",
            "roleId": "categories",
            "row": 3,
            "rowSpan": 4,
            "span": 3.999996
          },
          {
            "column": 9.000004,
            "role": "card",
            "roleId": "categories",
            "row": 3,
            "rowSpan": 4,
            "span": 3.999996
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
            "column": 1.6,
            "role": "copy",
            "roleId": "copy",
            "row": 1.32,
            "rowSpan": 1,
            "span": 10.8
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
    "version": 4,
    "visualRole": "support-stage",
    "visualWeight": "support-stage",
    "width": "full"
  },
  "certificates": {
    "allowedControls": [],
    "commercialPurpose": "信任建立",
    "contentBudget": {
      "limits": {},
      "maxCtas": 0,
      "requiredText": []
    },
    "copyPlacementByViewport": {
      "desktop": "stacked",
      "mobile": "stacked"
    },
    "defaultGeometryByViewport": {
      "desktop": {
        "frameAspectRatio": 1.6,
        "rows": 8,
        "safeArea": {
          "height": 0.9,
          "width": 0.92,
          "x": 0.04,
          "y": 0.05
        },
        "tone": "light",
        "zones": [
          {
            "nodeId": "copy",
            "rect": {
              "height": 0.125,
              "width": 0.333333,
              "x": 0.04,
              "y": 0.05
            },
            "role": "copy",
            "roleId": "copy"
          },
          {
            "nodeId": "certificates",
            "rect": {
              "height": 0.375,
              "width": 0.333333,
              "x": 0,
              "y": 0.25
            },
            "role": "card",
            "roleId": "certificates"
          },
          {
            "nodeId": "certificates",
            "rect": {
              "height": 0.375,
              "width": 0.333333,
              "x": 0.333333,
              "y": 0.25
            },
            "role": "card",
            "roleId": "certificates"
          },
          {
            "nodeId": "certificates",
            "rect": {
              "height": 0.375,
              "width": 0.333333,
              "x": 0.666667,
              "y": 0.25
            },
            "role": "card",
            "roleId": "certificates"
          }
        ]
      },
      "mobile": {
        "frameAspectRatio": 0.8,
        "rows": 8,
        "safeArea": {
          "height": 0.92,
          "width": 0.9,
          "x": 0.05,
          "y": 0.04
        },
        "tone": "light",
        "zones": [
          {
            "nodeId": "copy",
            "rect": {
              "height": 0.125,
              "width": 0.9,
              "x": 0.05,
              "y": 0.04
            },
            "role": "copy",
            "roleId": "copy"
          },
          {
            "nodeId": "certificates",
            "rect": {
              "height": 0.25,
              "width": 1,
              "x": 0,
              "y": 0.125
            },
            "role": "card",
            "roleId": "certificates"
          },
          {
            "nodeId": "certificates",
            "rect": {
              "height": 0.25,
              "width": 1,
              "x": 0,
              "y": 0.375
            },
            "role": "card",
            "roleId": "certificates"
          },
          {
            "nodeId": "certificates",
            "rect": {
              "height": 0.25,
              "width": 1,
              "x": 0,
              "y": 0.625
            },
            "role": "card",
            "roleId": "certificates"
          }
        ]
      }
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
          "collectionMediaPolicies": [
            {
              "altPolicy": "derived",
              "collectionFieldKey": "certificates",
              "derivedAltFieldKey": "name",
              "mediaFieldKeys": [
                "imageUrl"
              ]
            }
          ],
          "constraints": {
            "allowAspectRatio": true,
            "allowFocus": false,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": false,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 1,
              "width": 1
            },
            "minSize": {
              "height": 0.1,
              "width": 0.12
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
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
            "content",
            "layout",
            "layer",
            "visibility",
            "typography"
          ],
          "constraints": {
            "allowAspectRatio": false,
            "allowFocus": false,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": false,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 0.7,
              "width": 0.92
            },
            "minSize": {
              "height": 0.03,
              "width": 0.08
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
          "contentFieldKeys": [
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
        }
      ],
      "layoutOverrides": {
        "compositionPresets": [
          "grid-2",
          "grid-3"
        ],
        "frameRatioPresets": [
          "16/9",
          "4/3",
          "1/1",
          "3/4",
          "9/16"
        ],
        "frameRatioRange": {
          "max": 4,
          "min": 0.25,
          "step": 0.01
        },
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
              "mineral",
              "ivory"
            ],
            "maxLines": 6,
            "placementPresets": [],
            "requiresSafeBand": false,
            "roleId": "copy",
            "widthPresets": []
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
            "column": 1.48,
            "role": "copy",
            "roleId": "copy",
            "row": 1.4,
            "rowSpan": 1,
            "span": 3.999996
          },
          {
            "column": 1,
            "role": "card",
            "roleId": "certificates",
            "row": 3,
            "rowSpan": 3,
            "span": 3.999996
          },
          {
            "column": 4.999996,
            "role": "card",
            "roleId": "certificates",
            "row": 3,
            "rowSpan": 3,
            "span": 3.999996
          },
          {
            "column": 9.000004,
            "role": "card",
            "roleId": "certificates",
            "row": 3,
            "rowSpan": 3,
            "span": 3.999996
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
            "column": 1.6,
            "role": "copy",
            "roleId": "copy",
            "row": 1.32,
            "rowSpan": 1,
            "span": 10.8
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
    "version": 4,
    "visualRole": "support-stage",
    "visualWeight": "support-stage",
    "width": "wide"
  },
  "comparison": {
    "allowedControls": [],
    "commercialPurpose": "信任建立",
    "contentBudget": {
      "limits": {},
      "maxCtas": 1,
      "requiredText": []
    },
    "copyPlacementByViewport": {
      "desktop": "stacked",
      "mobile": "stacked"
    },
    "defaultGeometryByViewport": {
      "desktop": {
        "frameAspectRatio": 1.6,
        "rows": 8,
        "safeArea": {
          "height": 0.9,
          "width": 0.92,
          "x": 0.04,
          "y": 0.05
        },
        "tone": "light",
        "zones": [
          {
            "nodeId": "copy",
            "rect": {
              "height": 0.125,
              "width": 0.92,
              "x": 0.04,
              "y": 0.05
            },
            "role": "copy",
            "roleId": "copy"
          },
          {
            "nodeId": "before",
            "rect": {
              "height": 1,
              "width": 0.5,
              "x": 0,
              "y": 0
            },
            "role": "mainMedia",
            "roleId": "before"
          },
          {
            "nodeId": "after",
            "rect": {
              "height": 1,
              "width": 0.5,
              "x": 0.5,
              "y": 0
            },
            "role": "detailMedia",
            "roleId": "after"
          },
          {
            "kind": "handle",
            "nodeId": "comparisonHandle",
            "overlay": true,
            "rect": {
              "height": 0.25,
              "width": 0.166667,
              "x": 0.416667,
              "y": 0.375
            },
            "role": "marker",
            "roleId": "comparisonHandle"
          },
          {
            "nodeId": "action",
            "overlay": true,
            "rect": {
              "height": 0.08,
              "width": 0.24,
              "x": 0.38,
              "y": 0.86
            },
            "role": "action",
            "roleId": "action"
          }
        ]
      },
      "mobile": {
        "frameAspectRatio": 0.8,
        "rows": 8,
        "safeArea": {
          "height": 0.92,
          "width": 0.9,
          "x": 0.05,
          "y": 0.04
        },
        "tone": "light",
        "zones": [
          {
            "nodeId": "copy",
            "rect": {
              "height": 0.125,
              "width": 0.9,
              "x": 0.05,
              "y": 0.04
            },
            "role": "copy",
            "roleId": "copy"
          },
          {
            "nodeId": "before",
            "rect": {
              "height": 1,
              "width": 1,
              "x": 0,
              "y": 0
            },
            "role": "mainMedia",
            "roleId": "before"
          },
          {
            "nodeId": "after",
            "rect": {
              "height": 1,
              "width": 1,
              "x": 0,
              "y": 0
            },
            "role": "detailMedia",
            "roleId": "after"
          },
          {
            "kind": "handle",
            "nodeId": "comparisonHandle",
            "overlay": true,
            "rect": {
              "height": 0.25,
              "width": 0.166667,
              "x": 0.416667,
              "y": 0.375
            },
            "role": "marker",
            "roleId": "comparisonHandle"
          },
          {
            "nodeId": "action",
            "overlay": true,
            "rect": {
              "height": 0.08,
              "width": 0.6,
              "x": 0.2,
              "y": 0.88
            },
            "role": "action",
            "roleId": "action"
          }
        ]
      }
    },
    "displayName": "前后对比",
    "editorCapabilities": {
      "editableObjects": [
        {
          "altFieldKey": "beforeAltText",
          "altPolicy": "required",
          "capabilities": [
            "content",
            "layout",
            "layer",
            "ratio",
            "fit",
            "zoom"
          ],
          "constraints": {
            "allowAspectRatio": true,
            "allowFocus": false,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": true,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 1,
              "width": 1
            },
            "minSize": {
              "height": 0.1,
              "width": 0.12
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
          "contentFieldKeys": [
            "beforeImage",
            "beforeLabel",
            "beforeAltText"
          ],
          "kind": "media",
          "mediaFieldKeys": [
            "beforeImage"
          ],
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
          "altPolicy": "required",
          "capabilities": [
            "content",
            "layout",
            "layer",
            "ratio",
            "fit",
            "zoom"
          ],
          "constraints": {
            "allowAspectRatio": true,
            "allowFocus": false,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": true,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 1,
              "width": 1
            },
            "minSize": {
              "height": 0.1,
              "width": 0.12
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
          "contentFieldKeys": [
            "afterImage",
            "afterLabel",
            "afterAltText"
          ],
          "kind": "media",
          "mediaFieldKeys": [
            "afterImage"
          ],
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
            "content",
            "layout",
            "layer",
            "visibility",
            "typography"
          ],
          "constraints": {
            "allowAspectRatio": false,
            "allowFocus": false,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": false,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 0.7,
              "width": 0.92
            },
            "minSize": {
              "height": 0.03,
              "width": 0.08
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
          "contentFieldKeys": [
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
            "link",
            "layout",
            "layer",
            "visibility",
            "typography"
          ],
          "constraints": {
            "allowAspectRatio": false,
            "allowFocus": false,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": false,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 0.28,
              "width": 0.72
            },
            "minSize": {
              "height": 0.04,
              "width": 0.08
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
          "contentFieldKeys": [
            "actionText",
            "targetType",
            "productCode",
            "productId",
            "linkUrl",
            "categorySlug"
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
        "frameRatioPresets": [
          "16/9",
          "4/3",
          "1/1",
          "3/4",
          "9/16"
        ],
        "frameRatioRange": {
          "max": 4,
          "min": 0.25,
          "step": 0.01
        },
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
              "mineral",
              "ivory"
            ],
            "maxLines": 6,
            "placementPresets": [],
            "requiresSafeBand": false,
            "roleId": "copy",
            "widthPresets": []
          },
          {
            "align": [
              "left",
              "center",
              "right"
            ],
            "colorTokens": [
              "ink",
              "mineral",
              "ivory"
            ],
            "maxLines": 6,
            "placementPresets": [],
            "requiresSafeBand": false,
            "roleId": "action",
            "widthPresets": []
          },
          {
            "align": [
              "left",
              "center",
              "right"
            ],
            "colorTokens": [
              "ink",
              "mineral",
              "ivory"
            ],
            "maxLines": 6,
            "placementPresets": [],
            "requiresSafeBand": false,
            "roleId": "actionText",
            "widthPresets": []
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
        "comparisonHandle",
        "action"
      ],
      "mobile": [
        "copy",
        "before",
        "after",
        "comparisonHandle",
        "action"
      ]
    },
    "presets": [],
    "preview": {
      "desktop": {
        "order": [
          "copy",
          "before",
          "after",
          "comparisonHandle",
          "action"
        ],
        "tone": "light",
        "zones": [
          {
            "column": 1.48,
            "role": "copy",
            "roleId": "copy",
            "row": 1.4,
            "rowSpan": 1,
            "span": 11.04
          },
          {
            "column": 1,
            "role": "mainMedia",
            "roleId": "before",
            "row": 1,
            "rowSpan": 8,
            "span": 6
          },
          {
            "column": 7,
            "role": "detailMedia",
            "roleId": "after",
            "row": 1,
            "rowSpan": 8,
            "span": 6
          },
          {
            "column": 6.000004,
            "kind": "handle",
            "overlay": true,
            "role": "marker",
            "roleId": "comparisonHandle",
            "row": 4,
            "rowSpan": 2,
            "span": 2.000004
          },
          {
            "column": 5.56,
            "overlay": true,
            "role": "action",
            "roleId": "action",
            "row": 7.88,
            "rowSpan": 0.64,
            "span": 2.88
          }
        ]
      },
      "mobile": {
        "order": [
          "copy",
          "before",
          "after",
          "comparisonHandle",
          "action"
        ],
        "tone": "light",
        "zones": [
          {
            "column": 1.6,
            "role": "copy",
            "roleId": "copy",
            "row": 1.32,
            "rowSpan": 1,
            "span": 10.8
          },
          {
            "column": 1,
            "role": "mainMedia",
            "roleId": "before",
            "row": 1,
            "rowSpan": 8,
            "span": 12
          },
          {
            "column": 1,
            "role": "detailMedia",
            "roleId": "after",
            "row": 1,
            "rowSpan": 8,
            "span": 12
          },
          {
            "column": 6.000004,
            "kind": "handle",
            "overlay": true,
            "role": "marker",
            "roleId": "comparisonHandle",
            "row": 4,
            "rowSpan": 2,
            "span": 2.000004
          },
          {
            "column": 3.4,
            "overlay": true,
            "role": "action",
            "roleId": "action",
            "row": 8.04,
            "rowSpan": 0.64,
            "span": 7.2
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
    "version": 6,
    "visualRole": "feature-stage",
    "visualWeight": "feature-stage",
    "width": "wide"
  },
  "craftDetails": {
    "allowedControls": [],
    "commercialPurpose": "信任建立",
    "contentBudget": {
      "limits": {
        "body": 90,
        "detailOneAltText": 80,
        "detailTwoAltText": 80,
        "eyebrow": 18,
        "leadAltText": 80,
        "title": 24
      },
      "maxCtas": 0,
      "requiredText": [
        "title"
      ]
    },
    "copyPlacementByViewport": {
      "desktop": "split",
      "mobile": "stacked"
    },
    "defaultGeometryByViewport": {
      "desktop": {
        "frameAspectRatio": 1.25,
        "rows": 12,
        "safeArea": {
          "height": 0.9,
          "width": 0.92,
          "x": 0.04,
          "y": 0.05
        },
        "tone": "light",
        "zones": [
          {
            "nodeId": "leadImage",
            "rect": {
              "height": 0.522222,
              "width": 0.626667,
              "x": 0.333333,
              "y": 0.04
            },
            "role": "mainMedia",
            "roleId": "leadImage"
          },
          {
            "nodeId": "copy",
            "rect": {
              "height": 0.28,
              "width": 0.25,
              "x": 0.04,
              "y": 0.12
            },
            "role": "copy",
            "roleId": "copy"
          },
          {
            "nodeId": "detailImageOne",
            "rect": {
              "height": 0.366667,
              "width": 0.293333,
              "x": 0.333333,
              "y": 0.61
            },
            "role": "detailMedia",
            "roleId": "detailImageOne"
          },
          {
            "nodeId": "detailImageTwo",
            "rect": {
              "height": 0.366667,
              "width": 0.293333,
              "x": 0.666667,
              "y": 0.61
            },
            "role": "detailMedia",
            "roleId": "detailImageTwo"
          }
        ]
      },
      "mobile": {
        "frameAspectRatio": 0.44,
        "rows": 12,
        "safeArea": {
          "height": 0.92,
          "width": 0.9,
          "x": 0.05,
          "y": 0.04
        },
        "tone": "light",
        "zones": [
          {
            "nodeId": "leadImage",
            "rect": {
              "height": 0.55,
              "width": 1,
              "x": 0,
              "y": 0
            },
            "role": "mainMedia",
            "roleId": "leadImage"
          },
          {
            "nodeId": "copy",
            "rect": {
              "height": 0.18,
              "width": 0.9,
              "x": 0.05,
              "y": 0.58
            },
            "role": "copy",
            "roleId": "copy"
          },
          {
            "nodeId": "detailImageOne",
            "rect": {
              "height": 0.187,
              "width": 0.425,
              "x": 0.05,
              "y": 0.78
            },
            "role": "detailMedia",
            "roleId": "detailImageOne"
          },
          {
            "nodeId": "detailImageTwo",
            "rect": {
              "height": 0.187,
              "width": 0.425,
              "x": 0.525,
              "y": 0.78
            },
            "role": "detailMedia",
            "roleId": "detailImageTwo"
          }
        ]
      }
    },
    "displayName": "工艺细节",
    "editorCapabilities": {
      "editableObjects": [
        {
          "altFieldKey": "leadAltText",
          "altPolicy": "required",
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
          "constraints": {
            "allowAspectRatio": true,
            "allowFocus": true,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": true,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 1,
              "width": 1
            },
            "minSize": {
              "height": 0.1,
              "width": 0.12
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
          "contentFieldKeys": [
            "leadImage",
            "leadAltText"
          ],
          "kind": "media",
          "mediaFieldKeys": [
            "leadImage"
          ],
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
          "roleId": "leadImage"
        },
        {
          "capabilities": [
            "content",
            "layout",
            "layer",
            "visibility",
            "typography"
          ],
          "constraints": {
            "allowAspectRatio": false,
            "allowFocus": false,
            "allowHide": true,
            "allowTypography": true,
            "allowZoom": false,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 0.7,
              "width": 0.92
            },
            "minSize": {
              "height": 0.03,
              "width": 0.08
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
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
          "altFieldKey": "detailOneAltText",
          "altPolicy": "required",
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
          "constraints": {
            "allowAspectRatio": true,
            "allowFocus": true,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": true,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 1,
              "width": 1
            },
            "minSize": {
              "height": 0.1,
              "width": 0.12
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
          "contentFieldKeys": [
            "detailImageOne",
            "detailOneAltText"
          ],
          "kind": "media",
          "mediaFieldKeys": [
            "detailImageOne"
          ],
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
          "roleId": "detailImageOne"
        },
        {
          "altFieldKey": "detailTwoAltText",
          "altPolicy": "required",
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
          "constraints": {
            "allowAspectRatio": true,
            "allowFocus": true,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": true,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 1,
              "width": 1
            },
            "minSize": {
              "height": 0.1,
              "width": 0.12
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
          "contentFieldKeys": [
            "detailImageTwo",
            "detailTwoAltText"
          ],
          "kind": "media",
          "mediaFieldKeys": [
            "detailImageTwo"
          ],
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
          "roleId": "detailImageTwo"
        }
      ],
      "layoutOverrides": {
        "compositionPresets": [
          "lead-detail"
        ],
        "frameRatioPresets": [
          "16/9",
          "4/3",
          "1/1",
          "3/4",
          "9/16"
        ],
        "frameRatioRange": {
          "max": 4,
          "min": 0.25,
          "step": 0.01
        },
        "slots": [
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
              "3 / 2",
              "4 / 5",
              "1 / 1"
            ],
            "roleId": "leadImage",
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
              "start",
              "center"
            ],
            "ratioPresets": [
              "1 / 1",
              "4 / 5"
            ],
            "roleId": "detailImageOne",
            "sizePresets": [
              "small",
              "standard"
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
              "1 / 1",
              "4 / 5"
            ],
            "roleId": "detailImageTwo",
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
              "mineral"
            ],
            "maxLines": 6,
            "placementPresets": [
              "left",
              "center"
            ],
            "requiresSafeBand": false,
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
    "key": "craftDetails",
    "master": "editorial-story",
    "media": [
      {
        "desktopRatio": "3 / 2",
        "key": "leadImage",
        "mobileRatio": "4 / 5",
        "required": true
      },
      {
        "desktopRatio": "1 / 1",
        "key": "detailImageOne",
        "mobileRatio": "1 / 1",
        "required": true
      },
      {
        "desktopRatio": "1 / 1",
        "key": "detailImageTwo",
        "mobileRatio": "1 / 1",
        "required": true
      }
    ],
    "moduleType": "工艺细节",
    "order": {
      "desktop": [
        "leadImage",
        "copy",
        "detailImageOne",
        "detailImageTwo"
      ],
      "mobile": [
        "leadImage",
        "copy",
        "detailImageOne",
        "detailImageTwo"
      ]
    },
    "presets": [],
    "preview": {
      "desktop": {
        "order": [
          "leadImage",
          "copy",
          "detailImageOne",
          "detailImageTwo"
        ],
        "rows": 12,
        "tone": "light",
        "zones": [
          {
            "column": 4.999996,
            "role": "mainMedia",
            "roleId": "leadImage",
            "row": 1.48,
            "rowSpan": 6.266664,
            "span": 7.520004
          },
          {
            "column": 1.48,
            "role": "copy",
            "roleId": "copy",
            "row": 2.44,
            "rowSpan": 3.36,
            "span": 3
          },
          {
            "column": 4.999996,
            "role": "detailMedia",
            "roleId": "detailImageOne",
            "row": 8.32,
            "rowSpan": 4.400004,
            "span": 3.519996
          },
          {
            "column": 9.000004,
            "role": "detailMedia",
            "roleId": "detailImageTwo",
            "row": 8.32,
            "rowSpan": 4.400004,
            "span": 3.519996
          }
        ]
      },
      "mobile": {
        "order": [
          "leadImage",
          "copy",
          "detailImageOne",
          "detailImageTwo"
        ],
        "rows": 12,
        "tone": "light",
        "zones": [
          {
            "column": 1,
            "role": "mainMedia",
            "roleId": "leadImage",
            "row": 1,
            "rowSpan": 6.6,
            "span": 12
          },
          {
            "column": 1.6,
            "role": "copy",
            "roleId": "copy",
            "row": 7.96,
            "rowSpan": 2.16,
            "span": 10.8
          },
          {
            "column": 1.6,
            "role": "detailMedia",
            "roleId": "detailImageOne",
            "row": 10.36,
            "rowSpan": 2.244,
            "span": 5.1
          },
          {
            "column": 7.3,
            "role": "detailMedia",
            "roleId": "detailImageTwo",
            "row": 10.36,
            "rowSpan": 2.244,
            "span": 5.1
          }
        ]
      },
      "purpose": "一张主图建立工艺焦点，两张细节图补充材质观察",
      "visualRole": "support-stage"
    },
    "roles": [
      {
        "allowedRatioPresetsByViewport": {
          "desktop": [
            "3 / 2",
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
          "desktop": "3 / 2",
          "mobile": "4 / 5"
        },
        "id": "leadImage",
        "kind": "media",
        "required": true,
        "role": "mainMedia"
      },
      {
        "id": "copy",
        "kind": "text",
        "previewRoles": [
          "copy",
          "eyebrow",
          "title"
        ],
        "required": false,
        "role": "copy"
      },
      {
        "allowedRatioPresetsByViewport": {
          "desktop": [
            "1 / 1",
            "4 / 5"
          ],
          "mobile": [
            "1 / 1",
            "4 / 5"
          ]
        },
        "assetClass": "editorial",
        "defaultRatioByViewport": {
          "desktop": "1 / 1",
          "mobile": "1 / 1"
        },
        "id": "detailImageOne",
        "kind": "media",
        "required": true,
        "role": "detailMedia",
        "semantic": "craft-detail-one"
      },
      {
        "allowedRatioPresetsByViewport": {
          "desktop": [
            "1 / 1",
            "4 / 5"
          ],
          "mobile": [
            "1 / 1",
            "4 / 5"
          ]
        },
        "assetClass": "editorial",
        "defaultRatioByViewport": {
          "desktop": "1 / 1",
          "mobile": "1 / 1"
        },
        "id": "detailImageTwo",
        "kind": "media",
        "required": true,
        "role": "detailMedia",
        "semantic": "craft-detail-two"
      }
    ],
    "spacingPolicy": [
      "normal"
    ],
    "supportsLinkTarget": false,
    "version": 2,
    "visualRole": "support-stage",
    "visualWeight": "support-stage",
    "width": "wide"
  },
  "doublePoster": {
    "allowedControls": [],
    "commercialPurpose": "内容传播",
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
    "defaultGeometryByViewport": {
      "desktop": {
        "frameAspectRatio": 1.5,
        "rows": 8,
        "safeArea": {
          "height": 0.9,
          "width": 0.92,
          "x": 0.04,
          "y": 0.05
        },
        "tone": "light",
        "zones": [
          {
            "nodeId": "mainImage",
            "rect": {
              "height": 0.666667,
              "width": 0.666667,
              "x": 0,
              "y": 0
            },
            "role": "mainMedia",
            "roleId": "mainImage"
          },
          {
            "nodeId": "detailImage",
            "rect": {
              "height": 0.625,
              "width": 0.333333,
              "x": 0.666667,
              "y": 0.125
            },
            "role": "detailMedia",
            "roleId": "detailImage"
          },
          {
            "nodeId": "copy",
            "rect": {
              "height": 0.25,
              "width": 0.333333,
              "x": 0.626667,
              "y": 0.5
            },
            "role": "copy",
            "roleId": "copy"
          },
          {
            "nodeId": "action",
            "rect": {
              "height": 0.125,
              "width": 0.25,
              "x": 0.666667,
              "y": 0.825
            },
            "role": "action",
            "roleId": "action"
          }
        ]
      },
      "mobile": {
        "frameAspectRatio": 0.6,
        "rows": 8,
        "safeArea": {
          "height": 0.92,
          "width": 0.9,
          "x": 0.05,
          "y": 0.04
        },
        "tone": "light",
        "zones": [
          {
            "nodeId": "mainImage",
            "rect": {
              "height": 0.4,
              "width": 1,
              "x": 0,
              "y": 0
            },
            "role": "mainMedia",
            "roleId": "mainImage"
          },
          {
            "nodeId": "copy",
            "rect": {
              "height": 0.25,
              "width": 0.9,
              "x": 0.05,
              "y": 0.375
            },
            "role": "copy",
            "roleId": "copy"
          },
          {
            "nodeId": "detailImage",
            "rect": {
              "height": 0.5,
              "width": 0.666667,
              "x": 0.333333,
              "y": 0.4
            },
            "role": "detailMedia",
            "roleId": "detailImage"
          },
          {
            "nodeId": "action",
            "rect": {
              "height": 0.125,
              "width": 0.416667,
              "x": 0.05,
              "y": 0.835
            },
            "role": "action",
            "roleId": "action"
          }
        ]
      }
    },
    "displayName": "双图文",
    "editorCapabilities": {
      "editableObjects": [
        {
          "altFieldKey": "mainAltText",
          "altPolicy": "required",
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
          "constraints": {
            "allowAspectRatio": true,
            "allowFocus": true,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": true,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 1,
              "width": 1
            },
            "minSize": {
              "height": 0.1,
              "width": 0.12
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
          "contentFieldKeys": [
            "mainImage",
            "mainAltText"
          ],
          "kind": "media",
          "mediaFieldKeys": [
            "mainImage"
          ],
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
          "altPolicy": "required",
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
          "constraints": {
            "allowAspectRatio": true,
            "allowFocus": true,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": true,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 1,
              "width": 1
            },
            "minSize": {
              "height": 0.1,
              "width": 0.12
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
          "contentFieldKeys": [
            "detailImage",
            "detailAltText"
          ],
          "kind": "media",
          "mediaFieldKeys": [
            "detailImage"
          ],
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
            "visibility",
            "typography",
            "layout",
            "layer"
          ],
          "constraints": {
            "allowAspectRatio": false,
            "allowFocus": false,
            "allowHide": true,
            "allowTypography": true,
            "allowZoom": false,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 0.7,
              "width": 0.92
            },
            "minSize": {
              "height": 0.03,
              "width": 0.08
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
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
            "link",
            "layout",
            "layer",
            "visibility",
            "typography"
          ],
          "constraints": {
            "allowAspectRatio": false,
            "allowFocus": false,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": false,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 0.28,
              "width": 0.72
            },
            "minSize": {
              "height": 0.04,
              "width": 0.08
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
          "contentFieldKeys": [
            "actionText",
            "targetType",
            "productCode",
            "productId",
            "linkUrl",
            "categorySlug"
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
        "compositionPresets": [
          "balanced",
          "main-led",
          "detail-led"
        ],
        "frameRatioPresets": [
          "16/9",
          "4/3",
          "1/1",
          "3/4",
          "9/16"
        ],
        "frameRatioRange": {
          "max": 4,
          "min": 0.25,
          "step": 0.01
        },
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
            "requiresSafeBand": false,
            "roleId": "copy",
            "sizePresets": [
              "small",
              "standard",
              "large"
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
              "mineral",
              "ivory"
            ],
            "maxLines": 6,
            "placementPresets": [],
            "requiresSafeBand": false,
            "roleId": "action",
            "widthPresets": []
          },
          {
            "align": [
              "left",
              "center",
              "right"
            ],
            "colorTokens": [
              "ink",
              "mineral",
              "ivory"
            ],
            "maxLines": 6,
            "placementPresets": [],
            "requiresSafeBand": false,
            "roleId": "actionText",
            "widthPresets": []
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
            "rowSpan": 5.333336,
            "span": 8.000004
          },
          {
            "column": 9.000004,
            "role": "detailMedia",
            "roleId": "detailImage",
            "row": 2,
            "rowSpan": 5,
            "span": 3.999996
          },
          {
            "column": 8.520004,
            "role": "copy",
            "roleId": "copy",
            "row": 5,
            "rowSpan": 2,
            "span": 3.999996
          },
          {
            "column": 9.000004,
            "role": "action",
            "roleId": "action",
            "row": 7.6,
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
            "rowSpan": 3.2,
            "span": 12
          },
          {
            "column": 1.6,
            "role": "copy",
            "roleId": "copy",
            "row": 4,
            "rowSpan": 2,
            "span": 10.8
          },
          {
            "column": 4.999996,
            "role": "detailMedia",
            "roleId": "detailImage",
            "row": 4.2,
            "rowSpan": 4,
            "span": 8.000004
          },
          {
            "column": 1.6,
            "role": "action",
            "roleId": "action",
            "row": 7.68,
            "rowSpan": 1,
            "span": 5.000004
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
    "version": 6,
    "visualRole": "feature-stage",
    "visualWeight": "feature-stage",
    "width": "wide"
  },
  "featuredProduct": {
    "allowedControls": [],
    "commercialPurpose": "商品销售",
    "contentBudget": {
      "limits": {},
      "maxCtas": 1,
      "requiredText": []
    },
    "copyPlacementByViewport": {
      "desktop": "stacked",
      "mobile": "stacked"
    },
    "defaultGeometryByViewport": {
      "desktop": {
        "frameAspectRatio": 0.75,
        "rows": 8,
        "safeArea": {
          "height": 0.9,
          "width": 0.92,
          "x": 0.04,
          "y": 0.05
        },
        "tone": "light",
        "zones": [
          {
            "nodeId": "product",
            "rect": {
              "height": 0.625,
              "width": 0.666667,
              "x": 0.166667,
              "y": 0
            },
            "role": "media",
            "roleId": "product"
          },
          {
            "nodeId": "copy",
            "rect": {
              "height": 0.125,
              "width": 0.666667,
              "x": 0.166667,
              "y": 0.625
            },
            "role": "copy",
            "roleId": "copy"
          },
          {
            "nodeId": "list",
            "rect": {
              "height": 0.125,
              "width": 0.5,
              "x": 0.25,
              "y": 0.75
            },
            "role": "list",
            "roleId": "list"
          },
          {
            "nodeId": "action",
            "rect": {
              "height": 0.125,
              "width": 0.5,
              "x": 0.25,
              "y": 0.825
            },
            "role": "action",
            "roleId": "action"
          }
        ]
      },
      "mobile": {
        "frameAspectRatio": 0.4,
        "rows": 8,
        "safeArea": {
          "height": 0.92,
          "width": 0.9,
          "x": 0.05,
          "y": 0.04
        },
        "tone": "light",
        "zones": [
          {
            "nodeId": "product",
            "rect": {
              "height": 0.5,
              "width": 1,
              "x": 0,
              "y": 0
            },
            "role": "media",
            "roleId": "product"
          },
          {
            "nodeId": "copy",
            "rect": {
              "height": 0.125,
              "width": 0.9,
              "x": 0.05,
              "y": 0.5
            },
            "role": "copy",
            "roleId": "copy"
          },
          {
            "nodeId": "list",
            "rect": {
              "height": 0.125,
              "width": 1,
              "x": 0,
              "y": 0.625
            },
            "role": "list",
            "roleId": "list"
          },
          {
            "nodeId": "action",
            "rect": {
              "height": 0.125,
              "width": 0.416667,
              "x": 0.05,
              "y": 0.75
            },
            "role": "action",
            "roleId": "action"
          }
        ]
      }
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
          "constraints": {
            "allowAspectRatio": true,
            "allowFocus": false,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": false,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 1,
              "width": 1
            },
            "minSize": {
              "height": 0.1,
              "width": 0.12
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
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
            "content",
            "layout",
            "layer",
            "visibility",
            "typography"
          ],
          "constraints": {
            "allowAspectRatio": false,
            "allowFocus": false,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": false,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 0.7,
              "width": 0.92
            },
            "minSize": {
              "height": 0.03,
              "width": 0.08
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
          "contentFieldKeys": [
            "eyebrow",
            "title",
            "summary"
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
            "link",
            "layout",
            "layer",
            "visibility",
            "typography"
          ],
          "constraints": {
            "allowAspectRatio": false,
            "allowFocus": false,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": false,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 0.28,
              "width": 0.72
            },
            "minSize": {
              "height": 0.04,
              "width": 0.08
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
          "contentFieldKeys": [
            "primaryText",
            "secondaryText",
            "secondaryTargetType",
            "secondaryProductCode",
            "secondaryProductId",
            "secondaryLinkUrl",
            "secondaryCategorySlug"
          ],
          "kind": "action",
          "nodeIds": [
            "action",
            "primaryText",
            "secondaryText"
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
        },
        {
          "capabilities": [
            "content",
            "layout",
            "layer"
          ],
          "constraints": {
            "allowAspectRatio": false,
            "allowFocus": false,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": false,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 1,
              "width": 1
            },
            "minSize": {
              "height": 0.1,
              "width": 0.12
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
          "contentFieldKeys": [
            "showPrice"
          ],
          "kind": "collection",
          "responsive": {
            "content": "shared",
            "layer": "viewport-specific",
            "layout": "viewport-specific"
          },
          "roleId": "list"
        }
      ],
      "layoutOverrides": {
        "compositionPresets": [
          "image-left",
          "image-right"
        ],
        "frameRatioPresets": [
          "16/9",
          "4/3",
          "1/1",
          "3/4",
          "9/16"
        ],
        "frameRatioRange": {
          "max": 4,
          "min": 0.25,
          "step": 0.01
        },
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
          },
          {
            "roleId": "list"
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
              "mineral",
              "ivory"
            ],
            "maxLines": 6,
            "placementPresets": [],
            "requiresSafeBand": false,
            "roleId": "copy",
            "widthPresets": []
          },
          {
            "align": [
              "left",
              "center",
              "right"
            ],
            "colorTokens": [
              "ink",
              "mineral",
              "ivory"
            ],
            "maxLines": 6,
            "placementPresets": [],
            "requiresSafeBand": false,
            "roleId": "action",
            "widthPresets": []
          },
          {
            "align": [
              "left",
              "center",
              "right"
            ],
            "colorTokens": [
              "ink",
              "mineral",
              "ivory"
            ],
            "maxLines": 6,
            "placementPresets": [],
            "requiresSafeBand": false,
            "roleId": "primaryText",
            "widthPresets": []
          },
          {
            "align": [
              "left",
              "center",
              "right"
            ],
            "colorTokens": [
              "ink",
              "mineral",
              "ivory"
            ],
            "maxLines": 6,
            "placementPresets": [],
            "requiresSafeBand": false,
            "roleId": "secondaryText",
            "widthPresets": []
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
            "column": 3.000004,
            "role": "media",
            "roleId": "product",
            "row": 1,
            "rowSpan": 5,
            "span": 8.000004
          },
          {
            "column": 3.000004,
            "role": "copy",
            "roleId": "copy",
            "row": 6,
            "rowSpan": 1,
            "span": 8.000004
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
            "row": 7.6,
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
            "column": 1.6,
            "role": "copy",
            "roleId": "copy",
            "row": 5,
            "rowSpan": 1,
            "span": 10.8
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
            "column": 1.6,
            "role": "action",
            "roleId": "action",
            "row": 7,
            "rowSpan": 1,
            "span": 5.000004
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
    "version": 5,
    "visualRole": "feature-stage",
    "visualWeight": "feature-stage",
    "width": "wide"
  },
  "fullBleed": {
    "allowedControls": [],
    "commercialPurpose": "品牌展示",
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
    "defaultGeometryByViewport": {
      "desktop": {
        "frameAspectRatio": 1.75,
        "rows": 8,
        "safeArea": {
          "height": 0.9,
          "width": 0.92,
          "x": 0.04,
          "y": 0.05
        },
        "tone": "light",
        "zones": [
          {
            "nodeId": "image",
            "rect": {
              "height": 0.5,
              "width": 1,
              "x": 0,
              "y": 0
            },
            "role": "media",
            "roleId": "image"
          },
          {
            "nodeId": "copy",
            "rect": {
              "height": 0.25,
              "width": 0.666667,
              "x": 0.04,
              "y": 0.5
            },
            "role": "copy",
            "roleId": "copy"
          },
          {
            "nodeId": "action",
            "rect": {
              "height": 0.125,
              "width": 0.25,
              "x": 0.71,
              "y": 0.75
            },
            "role": "action",
            "roleId": "action"
          }
        ]
      },
      "mobile": {
        "frameAspectRatio": 0.4,
        "rows": 8,
        "safeArea": {
          "height": 0.92,
          "width": 0.9,
          "x": 0.05,
          "y": 0.04
        },
        "tone": "light",
        "zones": [
          {
            "nodeId": "mobileImage",
            "rect": {
              "height": 0.5,
              "width": 1,
              "x": 0,
              "y": 0
            },
            "role": "media",
            "roleId": "mobileImage"
          },
          {
            "nodeId": "copy",
            "rect": {
              "height": 0.25,
              "width": 0.9,
              "x": 0.05,
              "y": 0.5
            },
            "role": "copy",
            "roleId": "copy"
          },
          {
            "nodeId": "action",
            "rect": {
              "height": 0.125,
              "width": 0.416667,
              "x": 0.05,
              "y": 0.75
            },
            "role": "action",
            "roleId": "action"
          }
        ]
      }
    },
    "displayName": "通栏图",
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
          "constraints": {
            "allowAspectRatio": true,
            "allowFocus": true,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": true,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 1,
              "width": 1
            },
            "minSize": {
              "height": 0.1,
              "width": 0.12
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
          "contentFieldKeys": [
            "image",
            "altText"
          ],
          "fieldScopes": {
            "altText": "shared",
            "image": "viewport-specific"
          },
          "kind": "media",
          "mediaFieldKeys": [
            "image"
          ],
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
          "constraints": {
            "allowAspectRatio": true,
            "allowFocus": true,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": true,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 1,
              "width": 1
            },
            "minSize": {
              "height": 0.1,
              "width": 0.12
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
          "contentFieldKeys": [
            "mobileImage",
            "altText"
          ],
          "fieldScopes": {
            "altText": "shared",
            "mobileImage": "viewport-specific"
          },
          "kind": "media",
          "mediaFieldKeys": [
            "mobileImage"
          ],
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
            "visibility",
            "typography",
            "layout",
            "layer"
          ],
          "constraints": {
            "allowAspectRatio": false,
            "allowFocus": false,
            "allowHide": true,
            "allowTypography": true,
            "allowZoom": false,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 0.7,
              "width": 0.92
            },
            "minSize": {
              "height": 0.03,
              "width": 0.08
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
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
            "link",
            "layout",
            "layer",
            "visibility",
            "typography"
          ],
          "constraints": {
            "allowAspectRatio": false,
            "allowFocus": false,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": false,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 0.28,
              "width": 0.72
            },
            "minSize": {
              "height": 0.04,
              "width": 0.08
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
          "contentFieldKeys": [
            "buttonText",
            "targetType",
            "productCode",
            "productId",
            "linkUrl",
            "categorySlug"
          ],
          "kind": "action",
          "nodeIds": [
            "action",
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
          "roleId": "action"
        }
      ],
      "layoutOverrides": {
        "framePresets": [
          "standard",
          "immersive"
        ],
        "frameRatioPresets": [
          "16/9",
          "4/3",
          "1/1",
          "3/4",
          "9/16"
        ],
        "frameRatioRange": {
          "max": 4,
          "min": 0.25,
          "step": 0.01
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
            "requiresSafeBand": false,
            "roleId": "copy",
            "sizePresets": [
              "small",
              "standard",
              "large"
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
              "mineral",
              "ivory"
            ],
            "maxLines": 6,
            "placementPresets": [],
            "requiresSafeBand": false,
            "roleId": "action",
            "widthPresets": []
          },
          {
            "align": [
              "left",
              "center",
              "right"
            ],
            "colorTokens": [
              "ink",
              "mineral",
              "ivory"
            ],
            "maxLines": 6,
            "placementPresets": [],
            "requiresSafeBand": false,
            "roleId": "buttonText",
            "widthPresets": []
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
            "column": 1.48,
            "role": "copy",
            "roleId": "copy",
            "row": 5,
            "rowSpan": 2,
            "span": 8.000004
          },
          {
            "column": 9.52,
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
            "column": 1.6,
            "role": "copy",
            "roleId": "copy",
            "row": 5,
            "rowSpan": 2,
            "span": 10.8
          },
          {
            "column": 1.6,
            "role": "action",
            "roleId": "action",
            "row": 7,
            "rowSpan": 1,
            "span": 5.000004
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
        "fallbackRoleId": "mobileImage",
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
    "version": 6,
    "visualRole": "support-stage",
    "visualWeight": "support-stage",
    "width": "full"
  },
  "gallery": {
    "allowedControls": [],
    "commercialPurpose": "商品销售",
    "contentBudget": {
      "limits": {},
      "maxCtas": 0,
      "requiredText": []
    },
    "copyPlacementByViewport": {
      "desktop": "stacked",
      "mobile": "stacked"
    },
    "defaultGeometryByViewport": {
      "desktop": {
        "frameAspectRatio": 1.6,
        "rows": 10,
        "safeArea": {
          "height": 0.9,
          "width": 0.92,
          "x": 0.04,
          "y": 0.05
        },
        "tone": "light",
        "zones": [
          {
            "nodeId": "copy",
            "rect": {
              "height": 0.1,
              "width": 0.416667,
              "x": 0.04,
              "y": 0.05
            },
            "role": "copy",
            "roleId": "copy"
          },
          {
            "nodeId": "works",
            "rect": {
              "height": 0.4,
              "width": 0.583333,
              "x": 0,
              "y": 0.2
            },
            "role": "mainMedia",
            "roleId": "works"
          },
          {
            "nodeId": "works",
            "rect": {
              "height": 0.2,
              "width": 0.416667,
              "x": 0.583333,
              "y": 0.2
            },
            "role": "detailMedia",
            "roleId": "works"
          },
          {
            "nodeId": "works",
            "rect": {
              "height": 0.2,
              "width": 0.416667,
              "x": 0.583333,
              "y": 0.4
            },
            "role": "media",
            "roleId": "works"
          },
          {
            "nodeId": "works",
            "rect": {
              "height": 0.2,
              "width": 1,
              "x": 0,
              "y": 0.7
            },
            "role": "media",
            "roleId": "works"
          }
        ]
      },
      "mobile": {
        "frameAspectRatio": 0.8,
        "rows": 10,
        "safeArea": {
          "height": 0.92,
          "width": 0.9,
          "x": 0.05,
          "y": 0.04
        },
        "tone": "light",
        "zones": [
          {
            "nodeId": "copy",
            "rect": {
              "height": 0.1,
              "width": 0.9,
              "x": 0.05,
              "y": 0.04
            },
            "role": "copy",
            "roleId": "copy"
          },
          {
            "nodeId": "works",
            "rect": {
              "height": 0.3,
              "width": 1,
              "x": 0,
              "y": 0.1
            },
            "role": "mainMedia",
            "roleId": "works"
          },
          {
            "nodeId": "works",
            "rect": {
              "height": 0.2,
              "width": 1,
              "x": 0,
              "y": 0.4
            },
            "role": "detailMedia",
            "roleId": "works"
          },
          {
            "nodeId": "works",
            "rect": {
              "height": 0.2,
              "width": 1,
              "x": 0,
              "y": 0.6
            },
            "role": "media",
            "roleId": "works"
          },
          {
            "nodeId": "works",
            "rect": {
              "height": 0.2,
              "width": 1,
              "x": 0,
              "y": 0.8
            },
            "role": "media",
            "roleId": "works"
          }
        ]
      }
    },
    "displayName": "作品画廊",
    "editorCapabilities": {
      "editableObjects": [
        {
          "capabilities": [
            "content",
            "items",
            "link",
            "layout",
            "layer",
            "ratio",
            "fit",
            "zoom"
          ],
          "collectionFieldKeys": [
            "items"
          ],
          "collectionLinkPolicies": [
            {
              "collectionFieldKey": "items",
              "required": false
            }
          ],
          "collectionMediaPolicies": [
            {
              "altFieldKey": "altText",
              "altPolicy": "required",
              "collectionFieldKey": "items",
              "mediaFieldKeys": [
                "image"
              ]
            }
          ],
          "constraints": {
            "allowAspectRatio": true,
            "allowFocus": false,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": true,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 1,
              "width": 1
            },
            "minSize": {
              "height": 0.1,
              "width": 0.12
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
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
            "link": "shared",
            "ratio": "shared",
            "zoom": "shared"
          },
          "roleId": "works"
        },
        {
          "capabilities": [
            "content",
            "layout",
            "layer",
            "visibility",
            "typography"
          ],
          "constraints": {
            "allowAspectRatio": false,
            "allowFocus": false,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": false,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 0.7,
              "width": 0.92
            },
            "minSize": {
              "height": 0.03,
              "width": 0.08
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
          "contentFieldKeys": [
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
        }
      ],
      "layoutOverrides": {
        "compositionPresets": [
          "editorial",
          "balanced"
        ],
        "frameRatioPresets": [
          "16/9",
          "4/3",
          "1/1",
          "3/4",
          "9/16"
        ],
        "frameRatioRange": {
          "max": 4,
          "min": 0.25,
          "step": 0.01
        },
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
              "mineral",
              "ivory"
            ],
            "maxLines": 6,
            "placementPresets": [],
            "requiresSafeBand": false,
            "roleId": "copy",
            "widthPresets": []
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
            "column": 1.48,
            "role": "copy",
            "roleId": "copy",
            "row": 1.5,
            "rowSpan": 1,
            "span": 5.000004
          },
          {
            "column": 1,
            "role": "mainMedia",
            "roleId": "works",
            "row": 3,
            "rowSpan": 4,
            "span": 6.999996
          },
          {
            "column": 7.999996,
            "role": "detailMedia",
            "roleId": "works",
            "row": 3,
            "rowSpan": 2,
            "span": 5.000004
          },
          {
            "column": 7.999996,
            "role": "media",
            "roleId": "works",
            "row": 5,
            "rowSpan": 2,
            "span": 5.000004
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
            "column": 1.6,
            "role": "copy",
            "roleId": "copy",
            "row": 1.4,
            "rowSpan": 1,
            "span": 10.8
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
    "version": 4,
    "visualRole": "feature-stage",
    "visualWeight": "feature-stage",
    "width": "full"
  },
  "hero": {
    "allowedControls": [
      "alignment"
    ],
    "commercialPurpose": "品牌展示",
    "contentBudget": {
      "limits": {
        "actionText": 12,
        "altText": 80,
        "eyebrow": 60,
        "subtitle": 48,
        "title": 24
      },
      "maxCtas": 1,
      "requiredText": [
        "title"
      ]
    },
    "copyPlacementByViewport": {
      "desktop": "overlay",
      "mobile": "stacked"
    },
    "defaultGeometryByViewport": {
      "desktop": {
        "frameAspectRatio": 1.777778,
        "rows": 8,
        "safeArea": {
          "height": 0.92,
          "width": 0.93,
          "x": 0.035,
          "y": 0.04
        },
        "tone": "light",
        "zones": [
          {
            "nodeId": "desktopImage",
            "rect": {
              "height": 1,
              "width": 1,
              "x": 0,
              "y": 0
            },
            "role": "media",
            "roleId": "desktopImage"
          },
          {
            "nodeId": "eyebrow",
            "overlay": true,
            "rect": {
              "height": 0.0875,
              "width": 0.333333,
              "x": 0.333333,
              "y": 0.4
            },
            "role": "eyebrow",
            "roleId": "copy"
          },
          {
            "nodeId": "title",
            "overlay": true,
            "rect": {
              "height": 0.1625,
              "width": 0.5,
              "x": 0.25,
              "y": 0.5
            },
            "role": "title",
            "roleId": "copy"
          },
          {
            "nodeId": "subtitle",
            "overlay": true,
            "rect": {
              "height": 0.0875,
              "width": 0.416667,
              "x": 0.291667,
              "y": 0.675
            },
            "role": "subtitle",
            "roleId": "copy"
          },
          {
            "nodeId": "action",
            "overlay": true,
            "rect": {
              "height": 0.0875,
              "width": 0.25,
              "x": 0.333333,
              "y": 0.8
            },
            "role": "action",
            "roleId": "action"
          }
        ]
      },
      "mobile": {
        "frameAspectRatio": 0.8,
        "rows": 8,
        "safeArea": {
          "height": 0.92,
          "width": 0.9,
          "x": 0.05,
          "y": 0.04
        },
        "tone": "light",
        "zones": [
          {
            "nodeId": "mobileImage",
            "rect": {
              "height": 1,
              "width": 1,
              "x": 0,
              "y": 0
            },
            "role": "media",
            "roleId": "mobileImage"
          },
          {
            "nodeId": "eyebrow",
            "rect": {
              "height": 0.055,
              "width": 0.48,
              "x": 0.12,
              "y": 0.54
            },
            "role": "eyebrow",
            "roleId": "copy"
          },
          {
            "nodeId": "title",
            "rect": {
              "height": 0.13,
              "width": 0.68,
              "x": 0.16,
              "y": 0.61
            },
            "role": "title",
            "roleId": "copy"
          },
          {
            "nodeId": "subtitle",
            "rect": {
              "height": 0.09,
              "width": 0.7,
              "x": 0.12,
              "y": 0.755
            },
            "role": "subtitle",
            "roleId": "copy"
          },
          {
            "nodeId": "action",
            "rect": {
              "height": 0.07,
              "width": 0.36,
              "x": 0.12,
              "y": 0.865
            },
            "role": "action",
            "roleId": "action"
          }
        ]
      }
    },
    "displayName": "首屏",
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
          "constraints": {
            "allowAspectRatio": true,
            "allowFocus": true,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": true,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 1,
              "width": 1
            },
            "minSize": {
              "height": 0.1,
              "width": 0.12
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
          "contentFieldKeys": [
            "desktopImage",
            "altText"
          ],
          "fieldScopes": {
            "altText": "shared",
            "desktopImage": "viewport-specific"
          },
          "kind": "media",
          "mediaFieldKeys": [
            "desktopImage"
          ],
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
          "constraints": {
            "allowAspectRatio": true,
            "allowFocus": true,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": true,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 1,
              "width": 1
            },
            "minSize": {
              "height": 0.1,
              "width": 0.12
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
          "contentFieldKeys": [
            "mobileImage",
            "altText"
          ],
          "fieldScopes": {
            "altText": "shared",
            "mobileImage": "viewport-specific"
          },
          "kind": "media",
          "mediaFieldKeys": [
            "mobileImage"
          ],
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
          "constraints": {
            "allowAspectRatio": false,
            "allowFocus": false,
            "allowHide": true,
            "allowTypography": true,
            "allowZoom": false,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 0.7,
              "width": 0.92
            },
            "minSize": {
              "height": 0.03,
              "width": 0.08
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
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
          "constraints": {
            "allowAspectRatio": false,
            "allowFocus": false,
            "allowHide": true,
            "allowTypography": true,
            "allowZoom": false,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 0.28,
              "width": 0.72
            },
            "minSize": {
              "height": 0.04,
              "width": 0.08
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
          "contentFieldKeys": [
            "actionText",
            "targetType",
            "productCode",
            "productId",
            "linkUrl",
            "categorySlug"
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
          "4 / 5",
          "16/9",
          "4/3",
          "1/1",
          "3/4",
          "9/16"
        ],
        "frameRatioRange": {
          "max": 4,
          "min": 0.25,
          "step": 0.01
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
            "requiresSafeBand": false,
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
            "requiresSafeBand": false,
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
            "requiresSafeBand": false,
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
            "requiresSafeBand": false,
            "roleId": "actionText",
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
              "mineral",
              "ivory"
            ],
            "maxLines": 6,
            "placementPresets": [],
            "requiresSafeBand": false,
            "roleId": "copy",
            "widthPresets": []
          },
          {
            "align": [
              "left",
              "center",
              "right"
            ],
            "colorTokens": [
              "ink",
              "mineral",
              "ivory"
            ],
            "maxLines": 6,
            "placementPresets": [],
            "requiresSafeBand": false,
            "roleId": "action",
            "widthPresets": []
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
        "required": true
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
            "column": 4.999996,
            "overlay": true,
            "role": "eyebrow",
            "roleId": "copy",
            "row": 4.2,
            "rowSpan": 0.7,
            "span": 3.999996
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
            "column": 4.500004,
            "overlay": true,
            "role": "subtitle",
            "roleId": "copy",
            "row": 6.4,
            "rowSpan": 0.7,
            "span": 5.000004
          },
          {
            "column": 4.999996,
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
            "rowSpan": 8,
            "span": 12
          },
          {
            "column": 2.44,
            "role": "eyebrow",
            "roleId": "copy",
            "row": 5.32,
            "rowSpan": 0.44,
            "span": 5.76
          },
          {
            "column": 2.92,
            "role": "title",
            "roleId": "copy",
            "row": 5.88,
            "rowSpan": 1.04,
            "span": 8.16
          },
          {
            "column": 2.44,
            "role": "subtitle",
            "roleId": "copy",
            "row": 7.04,
            "rowSpan": 0.72,
            "span": 8.4
          },
          {
            "column": 2.44,
            "role": "action",
            "roleId": "action",
            "row": 7.92,
            "rowSpan": 0.56,
            "span": 4.32
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
        "fallbackRoleId": "mobileImage",
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
        "required": true,
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
    "version": 6,
    "visualRole": "primary-stage",
    "visualWeight": "primary-stage",
    "width": "full"
  },
  "hotspot": {
    "allowedControls": [],
    "commercialPurpose": "商品销售",
    "contentBudget": {
      "limits": {
        "altText": 80
      },
      "maxCtas": 0,
      "requiredText": []
    },
    "copyPlacementByViewport": {
      "desktop": "stacked",
      "mobile": "stacked"
    },
    "defaultGeometryByViewport": {
      "desktop": {
        "frameAspectRatio": 1.333333,
        "rows": 8,
        "safeArea": {
          "height": 0.9,
          "width": 0.92,
          "x": 0.04,
          "y": 0.05
        },
        "tone": "light",
        "zones": [
          {
            "nodeId": "sceneImage",
            "rect": {
              "height": 0.75,
              "width": 1,
              "x": 0,
              "y": 0
            },
            "role": "media",
            "roleId": "sceneImage"
          },
          {
            "kind": "hotspot",
            "nodeId": "hotspots",
            "overlay": true,
            "rect": {
              "height": 0.125,
              "width": 0.083333,
              "x": 0.166667,
              "y": 0.25
            },
            "role": "marker",
            "roleId": "hotspots"
          },
          {
            "kind": "hotspot",
            "nodeId": "hotspots",
            "overlay": true,
            "rect": {
              "height": 0.125,
              "width": 0.083333,
              "x": 0.5,
              "y": 0.375
            },
            "role": "marker",
            "roleId": "hotspots"
          },
          {
            "kind": "hotspot",
            "nodeId": "hotspots",
            "overlay": true,
            "rect": {
              "height": 0.125,
              "width": 0.083333,
              "x": 0.75,
              "y": 0.125
            },
            "role": "marker",
            "roleId": "hotspots"
          },
          {
            "nodeId": "copy",
            "rect": {
              "height": 0.125,
              "width": 0.416667,
              "x": 0.083333,
              "y": 0.75
            },
            "role": "copy",
            "roleId": "copy"
          }
        ]
      },
      "mobile": {
        "frameAspectRatio": 0.6,
        "rows": 8,
        "safeArea": {
          "height": 0.92,
          "width": 0.9,
          "x": 0.05,
          "y": 0.04
        },
        "tone": "light",
        "zones": [
          {
            "nodeId": "sceneImage",
            "rect": {
              "height": 0.75,
              "width": 1,
              "x": 0,
              "y": 0
            },
            "role": "media",
            "roleId": "sceneImage"
          },
          {
            "kind": "hotspot",
            "nodeId": "hotspots",
            "overlay": true,
            "rect": {
              "height": 0.125,
              "width": 0.083333,
              "x": 0.166667,
              "y": 0.125
            },
            "role": "marker",
            "roleId": "hotspots"
          },
          {
            "kind": "hotspot",
            "nodeId": "hotspots",
            "overlay": true,
            "rect": {
              "height": 0.125,
              "width": 0.083333,
              "x": 0.583333,
              "y": 0.375
            },
            "role": "marker",
            "roleId": "hotspots"
          },
          {
            "kind": "hotspot",
            "nodeId": "hotspots",
            "overlay": true,
            "rect": {
              "height": 0.125,
              "width": 0.083333,
              "x": 0.416667,
              "y": 0.5
            },
            "role": "marker",
            "roleId": "hotspots"
          },
          {
            "nodeId": "copy",
            "rect": {
              "height": 0.125,
              "width": 1,
              "x": 0,
              "y": 0.75
            },
            "role": "copy",
            "roleId": "copy"
          }
        ]
      }
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
          "constraints": {
            "allowAspectRatio": true,
            "allowFocus": true,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": true,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 1,
              "width": 1
            },
            "minSize": {
              "height": 0.1,
              "width": 0.12
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
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
          "mediaFieldKeys": [
            "image",
            "mobileImage"
          ],
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
            "link",
            "layout",
            "layer"
          ],
          "collectionFieldKeys": [
            "hotspots",
            "mobileHotspots"
          ],
          "collectionLinkPolicies": [
            {
              "collectionFieldKey": "hotspots",
              "required": true
            },
            {
              "collectionFieldKey": "mobileHotspots",
              "required": true
            }
          ],
          "constraints": {
            "allowAspectRatio": false,
            "allowFocus": false,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": false,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 1,
              "width": 1
            },
            "minSize": {
              "height": 0.1,
              "width": 0.12
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
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
            "layer": "viewport-specific",
            "layout": "viewport-specific",
            "link": "shared"
          },
          "roleId": "hotspots"
        }
      ],
      "layoutOverrides": {
        "frameRatioPresets": [
          "16/9",
          "4/3",
          "1/1",
          "3/4",
          "9/16"
        ],
        "frameRatioRange": {
          "max": 4,
          "min": 0.25,
          "step": 0.01
        },
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
          },
          {
            "roleId": "hotspots"
          }
        ],
        "textRoles": []
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
            "column": 3.000004,
            "kind": "hotspot",
            "overlay": true,
            "role": "marker",
            "roleId": "hotspots",
            "row": 3,
            "rowSpan": 1,
            "span": 0.999996
          },
          {
            "column": 7,
            "kind": "hotspot",
            "overlay": true,
            "role": "marker",
            "roleId": "hotspots",
            "row": 4,
            "rowSpan": 1,
            "span": 0.999996
          },
          {
            "column": 10,
            "kind": "hotspot",
            "overlay": true,
            "role": "marker",
            "roleId": "hotspots",
            "row": 2,
            "rowSpan": 1,
            "span": 0.999996
          },
          {
            "column": 1.999996,
            "role": "copy",
            "roleId": "copy",
            "row": 7,
            "rowSpan": 1,
            "span": 5.000004
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
            "column": 3.000004,
            "kind": "hotspot",
            "overlay": true,
            "role": "marker",
            "roleId": "hotspots",
            "row": 2,
            "rowSpan": 1,
            "span": 0.999996
          },
          {
            "column": 7.999996,
            "kind": "hotspot",
            "overlay": true,
            "role": "marker",
            "roleId": "hotspots",
            "row": 4,
            "rowSpan": 1,
            "span": 0.999996
          },
          {
            "column": 6.000004,
            "kind": "hotspot",
            "overlay": true,
            "role": "marker",
            "roleId": "hotspots",
            "row": 5,
            "rowSpan": 1,
            "span": 0.999996
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
    "version": 4,
    "visualRole": "feature-stage",
    "visualWeight": "feature-stage",
    "width": "full"
  },
  "journey": {
    "allowedControls": [],
    "commercialPurpose": "内容传播",
    "contentBudget": {
      "limits": {},
      "maxCtas": 0,
      "requiredText": []
    },
    "copyPlacementByViewport": {
      "desktop": "stacked",
      "mobile": "stacked"
    },
    "defaultGeometryByViewport": {
      "desktop": {
        "frameAspectRatio": 1.6,
        "rows": 8,
        "safeArea": {
          "height": 0.9,
          "width": 0.92,
          "x": 0.04,
          "y": 0.05
        },
        "tone": "light",
        "zones": [
          {
            "nodeId": "copy",
            "rect": {
              "height": 0.25,
              "width": 0.416667,
              "x": 0.04,
              "y": 0.05
            },
            "role": "copy",
            "roleId": "copy"
          },
          {
            "kind": "steps-5",
            "nodeId": "steps",
            "rect": {
              "height": 0.375,
              "width": 1,
              "x": 0,
              "y": 0.375
            },
            "role": "timeline",
            "roleId": "steps"
          }
        ]
      },
      "mobile": {
        "frameAspectRatio": 0.8,
        "rows": 8,
        "safeArea": {
          "height": 0.92,
          "width": 0.9,
          "x": 0.05,
          "y": 0.04
        },
        "tone": "light",
        "zones": [
          {
            "nodeId": "copy",
            "rect": {
              "height": 0.25,
              "width": 0.9,
              "x": 0.05,
              "y": 0.04
            },
            "role": "copy",
            "roleId": "copy"
          },
          {
            "kind": "steps-5",
            "nodeId": "steps",
            "rect": {
              "height": 0.625,
              "width": 1,
              "x": 0,
              "y": 0.25
            },
            "role": "timeline",
            "roleId": "steps"
          }
        ]
      }
    },
    "displayName": "内容流程",
    "editorCapabilities": {
      "editableObjects": [
        {
          "capabilities": [
            "content",
            "items",
            "layout",
            "layer"
          ],
          "collectionFieldKeys": [
            "steps"
          ],
          "collectionMediaPolicies": [
            {
              "altPolicy": "derived",
              "collectionFieldKey": "steps",
              "derivedAltFieldKey": "name",
              "mediaFieldKeys": [
                "image"
              ]
            }
          ],
          "constraints": {
            "allowAspectRatio": false,
            "allowFocus": false,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": false,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 1,
              "width": 1
            },
            "minSize": {
              "height": 0.1,
              "width": 0.12
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
          "contentFieldKeys": [
            "steps"
          ],
          "kind": "collection",
          "responsive": {
            "content": "shared",
            "items": "shared",
            "layer": "viewport-specific",
            "layout": "viewport-specific"
          },
          "roleId": "steps"
        },
        {
          "capabilities": [
            "content",
            "layout",
            "layer",
            "visibility",
            "typography"
          ],
          "constraints": {
            "allowAspectRatio": false,
            "allowFocus": false,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": false,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 0.7,
              "width": 0.92
            },
            "minSize": {
              "height": 0.03,
              "width": 0.08
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
          "contentFieldKeys": [
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
        }
      ],
      "layoutOverrides": {
        "framePresets": [
          "standard",
          "spacious"
        ],
        "frameRatioPresets": [
          "16/9",
          "4/3",
          "1/1",
          "3/4",
          "9/16"
        ],
        "frameRatioRange": {
          "max": 4,
          "min": 0.25,
          "step": 0.01
        },
        "slots": [
          {
            "roleId": "steps"
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
              "mineral",
              "ivory"
            ],
            "maxLines": 6,
            "placementPresets": [],
            "requiresSafeBand": false,
            "roleId": "copy",
            "widthPresets": []
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
            "column": 1.48,
            "role": "copy",
            "roleId": "copy",
            "row": 1.4,
            "rowSpan": 2,
            "span": 5.000004
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
            "column": 1.6,
            "role": "copy",
            "roleId": "copy",
            "row": 1.32,
            "rowSpan": 2,
            "span": 10.8
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
    "version": 4,
    "visualRole": "support-stage",
    "visualWeight": "support-stage",
    "width": "wide"
  },
  "limitedEvent": {
    "allowedControls": [],
    "commercialPurpose": "活动转化",
    "contentBudget": {
      "limits": {},
      "maxCtas": 1,
      "requiredText": []
    },
    "copyPlacementByViewport": {
      "desktop": "overlay",
      "mobile": "stacked"
    },
    "defaultGeometryByViewport": {
      "desktop": {
        "frameAspectRatio": 1.555556,
        "rows": 8,
        "safeArea": {
          "height": 0.9,
          "width": 0.92,
          "x": 0.04,
          "y": 0.05
        },
        "tone": "dark",
        "zones": [
          {
            "nodeId": "event",
            "rect": {
              "height": 0.875,
              "width": 1,
              "x": 0,
              "y": 0
            },
            "role": "media",
            "roleId": "event"
          },
          {
            "kind": "countdown",
            "nodeId": "time",
            "overlay": true,
            "rect": {
              "height": 0.125,
              "width": 0.25,
              "x": 0.083333,
              "y": 0.125
            },
            "role": "marker",
            "roleId": "time"
          },
          {
            "nodeId": "copy",
            "overlay": true,
            "rect": {
              "height": 0.25,
              "width": 0.5,
              "x": 0.083333,
              "y": 0.375
            },
            "role": "copy",
            "roleId": "copy"
          },
          {
            "nodeId": "action",
            "overlay": true,
            "rect": {
              "height": 0.125,
              "width": 0.25,
              "x": 0.083333,
              "y": 0.75
            },
            "role": "action",
            "roleId": "action"
          }
        ]
      },
      "mobile": {
        "frameAspectRatio": 0.4,
        "rows": 8,
        "safeArea": {
          "height": 0.92,
          "width": 0.9,
          "x": 0.05,
          "y": 0.04
        },
        "tone": "light",
        "zones": [
          {
            "nodeId": "event",
            "rect": {
              "height": 0.5,
              "width": 1,
              "x": 0,
              "y": 0
            },
            "role": "media",
            "roleId": "event"
          },
          {
            "kind": "countdown",
            "nodeId": "time",
            "rect": {
              "height": 0.125,
              "width": 0.333333,
              "x": 0,
              "y": 0.5
            },
            "role": "marker",
            "roleId": "time"
          },
          {
            "nodeId": "copy",
            "rect": {
              "height": 0.125,
              "width": 0.9,
              "x": 0.05,
              "y": 0.625
            },
            "role": "copy",
            "roleId": "copy"
          },
          {
            "nodeId": "action",
            "rect": {
              "height": 0.125,
              "width": 0.416667,
              "x": 0.05,
              "y": 0.835
            },
            "role": "action",
            "roleId": "action"
          }
        ]
      }
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
          "constraints": {
            "allowAspectRatio": true,
            "allowFocus": false,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": true,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 1,
              "width": 1
            },
            "minSize": {
              "height": 0.1,
              "width": 0.12
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
          "contentFieldKeys": [
            "eventImage"
          ],
          "kind": "media",
          "mediaFieldKeys": [
            "eventImage"
          ],
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
            "items",
            "layout",
            "layer"
          ],
          "collectionFieldKeys": [
            "benefits"
          ],
          "constraints": {
            "allowAspectRatio": false,
            "allowFocus": false,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": false,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 1,
              "width": 1
            },
            "minSize": {
              "height": 0.1,
              "width": 0.12
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
          "contentFieldKeys": [
            "targetDate",
            "benefits"
          ],
          "kind": "collection",
          "responsive": {
            "content": "shared",
            "items": "shared",
            "layer": "viewport-specific",
            "layout": "viewport-specific"
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
          "constraints": {
            "allowAspectRatio": false,
            "allowFocus": false,
            "allowHide": true,
            "allowTypography": true,
            "allowZoom": false,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 0.7,
              "width": 0.92
            },
            "minSize": {
              "height": 0.03,
              "width": 0.08
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
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
            "link",
            "layout",
            "layer",
            "visibility",
            "typography"
          ],
          "constraints": {
            "allowAspectRatio": false,
            "allowFocus": false,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": false,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 0.28,
              "width": 0.72
            },
            "minSize": {
              "height": 0.04,
              "width": 0.08
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
          "contentFieldKeys": [
            "buttonText",
            "targetType",
            "productCode",
            "productId",
            "linkUrl",
            "categorySlug"
          ],
          "kind": "action",
          "nodeIds": [
            "action",
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
          "roleId": "action"
        }
      ],
      "layoutOverrides": {
        "framePresets": [
          "standard",
          "immersive"
        ],
        "frameRatioPresets": [
          "16/9",
          "4/3",
          "1/1",
          "3/4",
          "9/16"
        ],
        "frameRatioRange": {
          "max": 4,
          "min": 0.25,
          "step": 0.01
        },
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
          },
          {
            "roleId": "time"
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
            "requiresSafeBand": false,
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
          },
          {
            "align": [
              "left",
              "center",
              "right"
            ],
            "colorTokens": [
              "ink",
              "mineral",
              "ivory"
            ],
            "maxLines": 6,
            "placementPresets": [],
            "requiresSafeBand": false,
            "roleId": "action",
            "widthPresets": []
          },
          {
            "align": [
              "left",
              "center",
              "right"
            ],
            "colorTokens": [
              "ink",
              "mineral",
              "ivory"
            ],
            "maxLines": 6,
            "placementPresets": [],
            "requiresSafeBand": false,
            "roleId": "buttonText",
            "widthPresets": []
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
            "column": 1.999996,
            "kind": "countdown",
            "overlay": true,
            "role": "marker",
            "roleId": "time",
            "row": 2,
            "rowSpan": 1,
            "span": 3
          },
          {
            "column": 1.999996,
            "overlay": true,
            "role": "copy",
            "roleId": "copy",
            "row": 4,
            "rowSpan": 2,
            "span": 6
          },
          {
            "column": 1.999996,
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
            "span": 3.999996
          },
          {
            "column": 1.6,
            "role": "copy",
            "roleId": "copy",
            "row": 6,
            "rowSpan": 1,
            "span": 10.8
          },
          {
            "column": 1.6,
            "role": "action",
            "roleId": "action",
            "row": 7.68,
            "rowSpan": 1,
            "span": 5.000004
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
    "version": 6,
    "visualRole": "feature-stage",
    "visualWeight": "feature-stage",
    "width": "full"
  },
  "productRow": {
    "allowedControls": [],
    "commercialPurpose": "商品销售",
    "contentBudget": {
      "limits": {},
      "maxCtas": 0,
      "requiredText": []
    },
    "copyPlacementByViewport": {
      "desktop": "stacked",
      "mobile": "stacked"
    },
    "defaultGeometryByViewport": {
      "desktop": {
        "frameAspectRatio": 1.6,
        "rows": 8,
        "safeArea": {
          "height": 0.9,
          "width": 0.92,
          "x": 0.04,
          "y": 0.05
        },
        "tone": "light",
        "zones": [
          {
            "nodeId": "copy",
            "rect": {
              "height": 0.125,
              "width": 0.416667,
              "x": 0.04,
              "y": 0.05
            },
            "role": "copy",
            "roleId": "copy"
          },
          {
            "nodeId": "productCards",
            "rect": {
              "height": 0.5,
              "width": 0.333333,
              "x": 0,
              "y": 0.25
            },
            "role": "card",
            "roleId": "productCards"
          },
          {
            "nodeId": "productCards",
            "rect": {
              "height": 0.5,
              "width": 0.333333,
              "x": 0.333333,
              "y": 0.25
            },
            "role": "card",
            "roleId": "productCards"
          },
          {
            "nodeId": "productCards",
            "rect": {
              "height": 0.5,
              "width": 0.333333,
              "x": 0.666667,
              "y": 0.25
            },
            "role": "card",
            "roleId": "productCards"
          }
        ]
      },
      "mobile": {
        "frameAspectRatio": 0.8,
        "rows": 8,
        "safeArea": {
          "height": 0.92,
          "width": 0.9,
          "x": 0.05,
          "y": 0.04
        },
        "tone": "light",
        "zones": [
          {
            "nodeId": "copy",
            "rect": {
              "height": 0.125,
              "width": 0.9,
              "x": 0.05,
              "y": 0.04
            },
            "role": "copy",
            "roleId": "copy"
          },
          {
            "nodeId": "productCards",
            "rect": {
              "height": 0.25,
              "width": 1,
              "x": 0,
              "y": 0.125
            },
            "role": "card",
            "roleId": "productCards"
          },
          {
            "nodeId": "productCards",
            "rect": {
              "height": 0.25,
              "width": 1,
              "x": 0,
              "y": 0.375
            },
            "role": "card",
            "roleId": "productCards"
          },
          {
            "nodeId": "productCards",
            "rect": {
              "height": 0.25,
              "width": 1,
              "x": 0,
              "y": 0.625
            },
            "role": "card",
            "roleId": "productCards"
          }
        ]
      }
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
          "constraints": {
            "allowAspectRatio": true,
            "allowFocus": false,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": false,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 1,
              "width": 1
            },
            "minSize": {
              "height": 0.1,
              "width": 0.12
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
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
            "content",
            "layout",
            "layer",
            "visibility",
            "typography"
          ],
          "constraints": {
            "allowAspectRatio": false,
            "allowFocus": false,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": false,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 0.7,
              "width": 0.92
            },
            "minSize": {
              "height": 0.03,
              "width": 0.08
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
          "contentFieldKeys": [
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
        }
      ],
      "layoutOverrides": {
        "compositionPresets": [
          "grid-2",
          "grid-3",
          "grid-4"
        ],
        "frameRatioPresets": [
          "16/9",
          "4/3",
          "1/1",
          "3/4",
          "9/16"
        ],
        "frameRatioRange": {
          "max": 4,
          "min": 0.25,
          "step": 0.01
        },
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
              "mineral",
              "ivory"
            ],
            "maxLines": 6,
            "placementPresets": [],
            "requiresSafeBand": false,
            "roleId": "copy",
            "widthPresets": []
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
            "column": 1.48,
            "role": "copy",
            "roleId": "copy",
            "row": 1.4,
            "rowSpan": 1,
            "span": 5.000004
          },
          {
            "column": 1,
            "role": "card",
            "roleId": "productCards",
            "row": 3,
            "rowSpan": 4,
            "span": 3.999996
          },
          {
            "column": 4.999996,
            "role": "card",
            "roleId": "productCards",
            "row": 3,
            "rowSpan": 4,
            "span": 3.999996
          },
          {
            "column": 9.000004,
            "role": "card",
            "roleId": "productCards",
            "row": 3,
            "rowSpan": 4,
            "span": 3.999996
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
            "column": 1.6,
            "role": "copy",
            "roleId": "copy",
            "row": 1.32,
            "rowSpan": 1,
            "span": 10.8
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
    "version": 4,
    "visualRole": "feature-stage",
    "visualWeight": "feature-stage",
    "width": "full"
  },
  "sceneShopping": {
    "allowedControls": [],
    "commercialPurpose": "商品销售",
    "contentBudget": {
      "limits": {},
      "maxCtas": 0,
      "requiredText": []
    },
    "copyPlacementByViewport": {
      "desktop": "stacked",
      "mobile": "stacked"
    },
    "defaultGeometryByViewport": {
      "desktop": {
        "frameAspectRatio": 1.6,
        "rows": 8,
        "safeArea": {
          "height": 0.9,
          "width": 0.92,
          "x": 0.04,
          "y": 0.05
        },
        "tone": "light",
        "zones": [
          {
            "nodeId": "copy",
            "rect": {
              "height": 0.125,
              "width": 0.92,
              "x": 0.04,
              "y": 0.05
            },
            "role": "copy",
            "roleId": "copy"
          },
          {
            "nodeId": "scenes",
            "rect": {
              "height": 0.375,
              "width": 0.25,
              "x": 0,
              "y": 0.25
            },
            "role": "card",
            "roleId": "scenes"
          },
          {
            "nodeId": "scenes",
            "rect": {
              "height": 0.375,
              "width": 0.25,
              "x": 0.25,
              "y": 0.25
            },
            "role": "card",
            "roleId": "scenes"
          },
          {
            "nodeId": "scenes",
            "rect": {
              "height": 0.375,
              "width": 0.25,
              "x": 0.5,
              "y": 0.25
            },
            "role": "card",
            "roleId": "scenes"
          },
          {
            "nodeId": "scenes",
            "rect": {
              "height": 0.375,
              "width": 0.25,
              "x": 0.75,
              "y": 0.25
            },
            "role": "card",
            "roleId": "scenes"
          }
        ]
      },
      "mobile": {
        "frameAspectRatio": 0.8,
        "rows": 8,
        "safeArea": {
          "height": 0.92,
          "width": 0.9,
          "x": 0.05,
          "y": 0.04
        },
        "tone": "light",
        "zones": [
          {
            "nodeId": "copy",
            "rect": {
              "height": 0.125,
              "width": 0.9,
              "x": 0.05,
              "y": 0.04
            },
            "role": "copy",
            "roleId": "copy"
          },
          {
            "nodeId": "scenes",
            "rect": {
              "height": 0.125,
              "width": 1,
              "x": 0,
              "y": 0.125
            },
            "role": "card",
            "roleId": "scenes"
          },
          {
            "nodeId": "scenes",
            "rect": {
              "height": 0.125,
              "width": 1,
              "x": 0,
              "y": 0.25
            },
            "role": "card",
            "roleId": "scenes"
          },
          {
            "nodeId": "scenes",
            "rect": {
              "height": 0.125,
              "width": 1,
              "x": 0,
              "y": 0.375
            },
            "role": "card",
            "roleId": "scenes"
          },
          {
            "nodeId": "scenes",
            "rect": {
              "height": 0.125,
              "width": 1,
              "x": 0,
              "y": 0.5
            },
            "role": "card",
            "roleId": "scenes"
          }
        ]
      }
    },
    "displayName": "场景入口",
    "editorCapabilities": {
      "editableObjects": [
        {
          "capabilities": [
            "content",
            "items",
            "link",
            "layout",
            "layer",
            "ratio",
            "fit"
          ],
          "collectionFieldKeys": [
            "categories"
          ],
          "collectionLinkPolicies": [
            {
              "collectionFieldKey": "categories",
              "required": true
            }
          ],
          "collectionMediaPolicies": [
            {
              "altFieldKey": "altText",
              "altPolicy": "required",
              "collectionFieldKey": "categories",
              "mediaFieldKeys": [
                "image"
              ]
            }
          ],
          "constraints": {
            "allowAspectRatio": true,
            "allowFocus": false,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": false,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 1,
              "width": 1
            },
            "minSize": {
              "height": 0.1,
              "width": 0.12
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
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
            "link": "shared",
            "ratio": "shared"
          },
          "roleId": "scenes"
        },
        {
          "capabilities": [
            "content",
            "layout",
            "layer",
            "visibility",
            "typography"
          ],
          "constraints": {
            "allowAspectRatio": false,
            "allowFocus": false,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": false,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 0.7,
              "width": 0.92
            },
            "minSize": {
              "height": 0.03,
              "width": 0.08
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
          "contentFieldKeys": [
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
        }
      ],
      "layoutOverrides": {
        "compositionPresets": [
          "grid-2",
          "grid-3",
          "grid-4"
        ],
        "frameRatioPresets": [
          "16/9",
          "4/3",
          "1/1",
          "3/4",
          "9/16"
        ],
        "frameRatioRange": {
          "max": 4,
          "min": 0.25,
          "step": 0.01
        },
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
              "mineral",
              "ivory"
            ],
            "maxLines": 6,
            "placementPresets": [],
            "requiresSafeBand": false,
            "roleId": "copy",
            "widthPresets": []
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
            "column": 1.48,
            "role": "copy",
            "roleId": "copy",
            "row": 1.4,
            "rowSpan": 1,
            "span": 11.04
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
            "column": 1.6,
            "role": "copy",
            "roleId": "copy",
            "row": 1.32,
            "rowSpan": 1,
            "span": 10.8
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
    "version": 4,
    "visualRole": "support-stage",
    "visualWeight": "support-stage",
    "width": "wide"
  },
  "servicePromises": {
    "allowedControls": [],
    "commercialPurpose": "信任建立",
    "contentBudget": {
      "limits": {},
      "maxCtas": 0,
      "requiredText": []
    },
    "copyPlacementByViewport": {
      "desktop": "stacked",
      "mobile": "stacked"
    },
    "defaultGeometryByViewport": {
      "desktop": {
        "frameAspectRatio": 1.6,
        "rows": 8,
        "safeArea": {
          "height": 0.9,
          "width": 0.92,
          "x": 0.04,
          "y": 0.05
        },
        "tone": "light",
        "zones": [
          {
            "nodeId": "copy",
            "rect": {
              "height": 0.125,
              "width": 0.416667,
              "x": 0.04,
              "y": 0.05
            },
            "role": "copy",
            "roleId": "copy"
          },
          {
            "nodeId": "promises",
            "rect": {
              "height": 0.375,
              "width": 0.25,
              "x": 0,
              "y": 0.25
            },
            "role": "list",
            "roleId": "promises"
          },
          {
            "nodeId": "promises",
            "rect": {
              "height": 0.375,
              "width": 0.25,
              "x": 0.25,
              "y": 0.25
            },
            "role": "list",
            "roleId": "promises"
          },
          {
            "nodeId": "promises",
            "rect": {
              "height": 0.375,
              "width": 0.25,
              "x": 0.5,
              "y": 0.25
            },
            "role": "list",
            "roleId": "promises"
          },
          {
            "nodeId": "promises",
            "rect": {
              "height": 0.375,
              "width": 0.25,
              "x": 0.75,
              "y": 0.25
            },
            "role": "list",
            "roleId": "promises"
          }
        ]
      },
      "mobile": {
        "frameAspectRatio": 0.8,
        "rows": 8,
        "safeArea": {
          "height": 0.92,
          "width": 0.9,
          "x": 0.05,
          "y": 0.04
        },
        "tone": "light",
        "zones": [
          {
            "nodeId": "copy",
            "rect": {
              "height": 0.125,
              "width": 0.9,
              "x": 0.05,
              "y": 0.04
            },
            "role": "copy",
            "roleId": "copy"
          },
          {
            "nodeId": "promises",
            "rect": {
              "height": 0.125,
              "width": 1,
              "x": 0,
              "y": 0.125
            },
            "role": "list",
            "roleId": "promises"
          },
          {
            "nodeId": "promises",
            "rect": {
              "height": 0.125,
              "width": 1,
              "x": 0,
              "y": 0.25
            },
            "role": "list",
            "roleId": "promises"
          },
          {
            "nodeId": "promises",
            "rect": {
              "height": 0.125,
              "width": 1,
              "x": 0,
              "y": 0.375
            },
            "role": "list",
            "roleId": "promises"
          },
          {
            "nodeId": "promises",
            "rect": {
              "height": 0.125,
              "width": 1,
              "x": 0,
              "y": 0.5
            },
            "role": "list",
            "roleId": "promises"
          }
        ]
      }
    },
    "displayName": "服务承诺",
    "editorCapabilities": {
      "editableObjects": [
        {
          "capabilities": [
            "content",
            "items",
            "layout",
            "layer"
          ],
          "collectionFieldKeys": [
            "cards"
          ],
          "constraints": {
            "allowAspectRatio": false,
            "allowFocus": false,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": false,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 1,
              "width": 1
            },
            "minSize": {
              "height": 0.1,
              "width": 0.12
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
          "contentFieldKeys": [
            "cards"
          ],
          "kind": "collection",
          "responsive": {
            "content": "shared",
            "items": "shared",
            "layer": "viewport-specific",
            "layout": "viewport-specific"
          },
          "roleId": "promises"
        },
        {
          "capabilities": [
            "content",
            "layout",
            "layer",
            "visibility",
            "typography"
          ],
          "constraints": {
            "allowAspectRatio": false,
            "allowFocus": false,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": false,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 0.7,
              "width": 0.92
            },
            "minSize": {
              "height": 0.03,
              "width": 0.08
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
          "contentFieldKeys": [
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
        ],
        "frameRatioPresets": [
          "16/9",
          "4/3",
          "1/1",
          "3/4",
          "9/16"
        ],
        "frameRatioRange": {
          "max": 4,
          "min": 0.25,
          "step": 0.01
        },
        "slots": [
          {
            "roleId": "promises"
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
              "mineral",
              "ivory"
            ],
            "maxLines": 6,
            "placementPresets": [],
            "requiresSafeBand": false,
            "roleId": "copy",
            "widthPresets": []
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
            "column": 1.48,
            "role": "copy",
            "roleId": "copy",
            "row": 1.4,
            "rowSpan": 1,
            "span": 5.000004
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
            "column": 1.6,
            "role": "copy",
            "roleId": "copy",
            "row": 1.32,
            "rowSpan": 1,
            "span": 10.8
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
    "version": 4,
    "visualRole": "support-stage",
    "visualWeight": "support-stage",
    "width": "full"
  },
  "singlePoster": {
    "allowedControls": [
      "template"
    ],
    "commercialPurpose": "内容传播",
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
    "defaultGeometryByViewport": {
      "desktop": {
        "frameAspectRatio": 1.066667,
        "rows": 8,
        "safeArea": {
          "height": 0.9,
          "width": 0.92,
          "x": 0.04,
          "y": 0.05
        },
        "tone": "light",
        "zones": [
          {
            "nodeId": "desktopImage",
            "rect": {
              "height": 1,
              "width": 0.75,
              "x": 0.25,
              "y": 0
            },
            "role": "media",
            "roleId": "desktopImage"
          },
          {
            "nodeId": "copy",
            "rect": {
              "height": 0.0875,
              "width": 0.208333,
              "x": 0.04,
              "y": 0.475
            },
            "role": "eyebrow",
            "roleId": "copy"
          },
          {
            "nodeId": "copy",
            "rect": {
              "height": 0.2,
              "width": 0.208333,
              "x": 0.04,
              "y": 0.5625
            },
            "role": "title",
            "roleId": "copy"
          },
          {
            "nodeId": "copy",
            "rect": {
              "height": 0.0875,
              "width": 0.208333,
              "x": 0.04,
              "y": 0.7625
            },
            "role": "subtitle",
            "roleId": "copy"
          },
          {
            "nodeId": "action",
            "rect": {
              "height": 0.075,
              "width": 0.166667,
              "x": 0.04,
              "y": 0.85
            },
            "role": "action",
            "roleId": "action"
          }
        ]
      },
      "mobile": {
        "frameAspectRatio": 0.5,
        "rows": 8,
        "safeArea": {
          "height": 0.92,
          "width": 0.9,
          "x": 0.05,
          "y": 0.04
        },
        "tone": "light",
        "zones": [
          {
            "nodeId": "mobileImage",
            "rect": {
              "height": 0.625,
              "width": 1,
              "x": 0,
              "y": 0
            },
            "role": "media",
            "roleId": "mobileImage"
          },
          {
            "nodeId": "copy",
            "rect": {
              "height": 0.25,
              "width": 0.833333,
              "x": 0.083333,
              "y": 0.625
            },
            "role": "copy",
            "roleId": "copy"
          },
          {
            "nodeId": "action",
            "rect": {
              "height": 0.125,
              "width": 0.416667,
              "x": 0.25,
              "y": 0.875
            },
            "role": "action",
            "roleId": "action"
          }
        ]
      }
    },
    "displayName": "单图文",
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
          "constraints": {
            "allowAspectRatio": true,
            "allowFocus": true,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": true,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 1,
              "width": 1
            },
            "minSize": {
              "height": 0.1,
              "width": 0.12
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
          "contentFieldKeys": [
            "desktopImage",
            "altText"
          ],
          "fieldScopes": {
            "altText": "shared",
            "desktopImage": "viewport-specific"
          },
          "kind": "media",
          "mediaFieldKeys": [
            "desktopImage"
          ],
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
          "constraints": {
            "allowAspectRatio": true,
            "allowFocus": true,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": true,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 1,
              "width": 1
            },
            "minSize": {
              "height": 0.1,
              "width": 0.12
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
          "contentFieldKeys": [
            "mobileImage",
            "altText"
          ],
          "fieldScopes": {
            "altText": "shared",
            "mobileImage": "viewport-specific"
          },
          "kind": "media",
          "mediaFieldKeys": [
            "mobileImage"
          ],
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
          "constraints": {
            "allowAspectRatio": false,
            "allowFocus": false,
            "allowHide": true,
            "allowTypography": true,
            "allowZoom": false,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 0.7,
              "width": 0.92
            },
            "minSize": {
              "height": 0.03,
              "width": 0.08
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
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
            "link",
            "layout",
            "layer",
            "visibility",
            "typography"
          ],
          "constraints": {
            "allowAspectRatio": false,
            "allowFocus": false,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": false,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 0.28,
              "width": 0.72
            },
            "minSize": {
              "height": 0.04,
              "width": 0.08
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
          "contentFieldKeys": [
            "actionText",
            "targetType",
            "productCode",
            "productId",
            "linkUrl",
            "categorySlug"
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
          "tall"
        ],
        "frameRatioPresets": [
          "16/9",
          "4/3",
          "1/1",
          "3/4",
          "9/16"
        ],
        "frameRatioRange": {
          "max": 4,
          "min": 0.25,
          "step": 0.01
        },
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
            "requiresSafeBand": false,
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
          },
          {
            "align": [
              "left",
              "center",
              "right"
            ],
            "colorTokens": [
              "ink",
              "mineral",
              "ivory"
            ],
            "maxLines": 6,
            "placementPresets": [],
            "requiresSafeBand": false,
            "roleId": "action",
            "widthPresets": []
          },
          {
            "align": [
              "left",
              "center",
              "right"
            ],
            "colorTokens": [
              "ink",
              "mineral",
              "ivory"
            ],
            "maxLines": 6,
            "placementPresets": [],
            "requiresSafeBand": false,
            "roleId": "actionText",
            "widthPresets": []
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
            "column": 1.48,
            "role": "eyebrow",
            "roleId": "copy",
            "row": 4.8,
            "rowSpan": 0.7,
            "span": 2.499996
          },
          {
            "column": 1.48,
            "role": "title",
            "roleId": "copy",
            "row": 5.5,
            "rowSpan": 1.6,
            "span": 2.499996
          },
          {
            "column": 1.48,
            "role": "subtitle",
            "roleId": "copy",
            "row": 7.1,
            "rowSpan": 0.7,
            "span": 2.499996
          },
          {
            "column": 1.48,
            "role": "action",
            "roleId": "action",
            "row": 7.8,
            "rowSpan": 0.6,
            "span": 2.000004
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
            "column": 1.999996,
            "role": "copy",
            "roleId": "copy",
            "row": 6,
            "rowSpan": 2,
            "span": 9.999996
          },
          {
            "column": 4,
            "role": "action",
            "roleId": "action",
            "row": 8,
            "rowSpan": 1,
            "span": 5.000004
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
        "fallbackRoleId": "mobileImage",
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
    "version": 6,
    "visualRole": "feature-stage",
    "visualWeight": "feature-stage",
    "width": "standard"
  },
  "storeInfo": {
    "allowedControls": [],
    "commercialPurpose": "信任建立",
    "contentBudget": {
      "limits": {},
      "maxCtas": 1,
      "requiredText": []
    },
    "copyPlacementByViewport": {
      "desktop": "stacked",
      "mobile": "stacked"
    },
    "defaultGeometryByViewport": {
      "desktop": {
        "frameAspectRatio": 1.928573,
        "rows": 8,
        "safeArea": {
          "height": 0.9,
          "width": 0.92,
          "x": 0.04,
          "y": 0.05
        },
        "tone": "light",
        "zones": [
          {
            "nodeId": "store",
            "rect": {
              "height": 0.75,
              "width": 0.583333,
              "x": 0,
              "y": 0
            },
            "role": "media",
            "roleId": "store"
          },
          {
            "nodeId": "copy",
            "rect": {
              "height": 0.125,
              "width": 0.333333,
              "x": 0.626667,
              "y": 0.05
            },
            "role": "copy",
            "roleId": "copy"
          },
          {
            "nodeId": "details",
            "rect": {
              "height": 0.25,
              "width": 0.333333,
              "x": 0.666667,
              "y": 0.25
            },
            "role": "list",
            "roleId": "details"
          },
          {
            "nodeId": "action",
            "rect": {
              "height": 0.125,
              "width": 0.25,
              "x": 0.666667,
              "y": 0.625
            },
            "role": "action",
            "roleId": "action"
          }
        ]
      },
      "mobile": {
        "frameAspectRatio": 0.75,
        "rows": 8,
        "safeArea": {
          "height": 0.92,
          "width": 0.9,
          "x": 0.05,
          "y": 0.04
        },
        "tone": "light",
        "zones": [
          {
            "nodeId": "store",
            "rect": {
              "height": 0.5,
              "width": 1,
              "x": 0,
              "y": 0
            },
            "role": "media",
            "roleId": "store"
          },
          {
            "nodeId": "copy",
            "rect": {
              "height": 0.125,
              "width": 0.9,
              "x": 0.05,
              "y": 0.5
            },
            "role": "copy",
            "roleId": "copy"
          },
          {
            "nodeId": "details",
            "rect": {
              "height": 0.125,
              "width": 1,
              "x": 0,
              "y": 0.625
            },
            "role": "list",
            "roleId": "details"
          },
          {
            "nodeId": "action",
            "rect": {
              "height": 0.125,
              "width": 0.416667,
              "x": 0.05,
              "y": 0.75
            },
            "role": "action",
            "roleId": "action"
          }
        ]
      }
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
          "constraints": {
            "allowAspectRatio": true,
            "allowFocus": false,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": true,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 1,
              "width": 1
            },
            "minSize": {
              "height": 0.1,
              "width": 0.12
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
          "contentFieldKeys": [
            "image"
          ],
          "kind": "media",
          "mediaFieldKeys": [
            "image"
          ],
          "responsive": {
            "content": "shared",
            "fit": "shared",
            "layer": "viewport-specific",
            "layout": "viewport-specific",
            "ratio": "shared",
            "zoom": "shared"
          },
          "roleId": "store"
        }
      ],
      "layoutOverrides": {
        "compositionPresets": [
          "image-left",
          "image-right"
        ],
        "frameRatioPresets": [
          "16/9",
          "4/3",
          "1/1",
          "3/4",
          "9/16"
        ],
        "frameRatioRange": {
          "max": 4,
          "min": 0.25,
          "step": 0.01
        },
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
        ],
        "textRoles": []
      },
      "primaryTask": "media"
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
            "span": 6.999996
          },
          {
            "column": 8.520004,
            "role": "copy",
            "roleId": "copy",
            "row": 1.4,
            "rowSpan": 1,
            "span": 3.999996
          },
          {
            "column": 9.000004,
            "role": "list",
            "roleId": "details",
            "row": 3,
            "rowSpan": 2,
            "span": 3.999996
          },
          {
            "column": 9.000004,
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
            "column": 1.6,
            "role": "copy",
            "roleId": "copy",
            "row": 5,
            "rowSpan": 1,
            "span": 10.8
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
            "column": 1.6,
            "role": "action",
            "roleId": "action",
            "row": 7,
            "rowSpan": 1,
            "span": 5.000004
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
    "version": 5,
    "visualRole": "feature-stage",
    "visualWeight": "feature-stage",
    "width": "full"
  },
  "testimonials": {
    "allowedControls": [],
    "commercialPurpose": "信任建立",
    "contentBudget": {
      "limits": {},
      "maxCtas": 0,
      "requiredText": []
    },
    "copyPlacementByViewport": {
      "desktop": "stacked",
      "mobile": "stacked"
    },
    "defaultGeometryByViewport": {
      "desktop": {
        "frameAspectRatio": 1.44,
        "rows": 8,
        "safeArea": {
          "height": 0.9,
          "width": 0.92,
          "x": 0.04,
          "y": 0.05
        },
        "tone": "light",
        "zones": [
          {
            "nodeId": "authorizedPhoto",
            "rect": {
              "height": 0.75,
              "width": 0.416667,
              "x": 0,
              "y": 0.125
            },
            "role": "media",
            "roleId": "authorizedPhoto"
          },
          {
            "nodeId": "mainQuote",
            "rect": {
              "height": 0.375,
              "width": 0.5,
              "x": 0.5,
              "y": 0.25
            },
            "role": "quote",
            "roleId": "mainQuote"
          },
          {
            "nodeId": "attribution",
            "rect": {
              "height": 0.125,
              "width": 0.333333,
              "x": 0.5,
              "y": 0.625
            },
            "role": "quote",
            "roleId": "attribution"
          }
        ]
      },
      "mobile": {
        "frameAspectRatio": 0.4,
        "rows": 8,
        "safeArea": {
          "height": 0.92,
          "width": 0.9,
          "x": 0.05,
          "y": 0.04
        },
        "tone": "light",
        "zones": [
          {
            "nodeId": "authorizedPhoto",
            "rect": {
              "height": 0.5,
              "width": 1,
              "x": 0,
              "y": 0
            },
            "role": "media",
            "roleId": "authorizedPhoto"
          },
          {
            "nodeId": "mainQuote",
            "rect": {
              "height": 0.25,
              "width": 1,
              "x": 0,
              "y": 0.5
            },
            "role": "quote",
            "roleId": "mainQuote"
          },
          {
            "nodeId": "attribution",
            "rect": {
              "height": 0.125,
              "width": 0.666667,
              "x": 0,
              "y": 0.75
            },
            "role": "quote",
            "roleId": "attribution"
          }
        ]
      }
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
          "collectionMediaPolicies": [
            {
              "altPolicy": "derived",
              "collectionFieldKey": "testimonials",
              "derivedAltFieldKey": "name",
              "mediaFieldKeys": [
                "image"
              ]
            }
          ],
          "constraints": {
            "allowAspectRatio": true,
            "allowFocus": false,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": true,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 1,
              "width": 1
            },
            "minSize": {
              "height": 0.1,
              "width": 0.12
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
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
        "frameRatioPresets": [
          "16/9",
          "4/3",
          "1/1",
          "3/4",
          "9/16"
        ],
        "frameRatioRange": {
          "max": 4,
          "min": 0.25,
          "step": 0.01
        },
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
          },
          {
            "roleId": "mainQuote"
          },
          {
            "roleId": "attribution"
          }
        ],
        "textRoles": []
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
            "span": 5.000004
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
            "span": 3.999996
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
            "span": 8.000004
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
    "version": 4,
    "visualRole": "support-stage",
    "visualWeight": "support-stage",
    "width": "wide"
  },
  "textBanner": {
    "allowedControls": [
      "template",
      "spacing"
    ],
    "commercialPurpose": "内容传播",
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
    "defaultGeometryByViewport": {
      "desktop": {
        "frameAspectRatio": 2.285714,
        "rows": 8,
        "safeArea": {
          "height": 0.9,
          "width": 0.92,
          "x": 0.04,
          "y": 0.05
        },
        "tone": "light",
        "zones": [
          {
            "nodeId": "bgImage",
            "overlay": true,
            "rect": {
              "height": 1,
              "width": 1,
              "x": 0,
              "y": 0
            },
            "role": "media",
            "roleId": "bgImage"
          },
          {
            "nodeId": "copy",
            "rect": {
              "height": 0.0875,
              "width": 0.333333,
              "x": 0.333333,
              "y": 0.325
            },
            "role": "eyebrow",
            "roleId": "copy"
          },
          {
            "nodeId": "copy",
            "rect": {
              "height": 0.25,
              "width": 0.666667,
              "x": 0.166667,
              "y": 0.4125
            },
            "role": "title",
            "roleId": "copy"
          },
          {
            "nodeId": "copy",
            "rect": {
              "height": 0.0875,
              "width": 0.5,
              "x": 0.25,
              "y": 0.6625
            },
            "role": "subtitle",
            "roleId": "copy"
          },
          {
            "nodeId": "action",
            "rect": {
              "height": 0.0875,
              "width": 0.333333,
              "x": 0.333333,
              "y": 0.8
            },
            "role": "action",
            "roleId": "action"
          }
        ]
      },
      "mobile": {
        "frameAspectRatio": 0.8,
        "rows": 8,
        "safeArea": {
          "height": 0.92,
          "width": 0.9,
          "x": 0.05,
          "y": 0.04
        },
        "tone": "light",
        "zones": [
          {
            "nodeId": "bgImage",
            "overlay": true,
            "rect": {
              "height": 1,
              "width": 1,
              "x": 0,
              "y": 0
            },
            "role": "media",
            "roleId": "bgImage"
          },
          {
            "nodeId": "copy",
            "rect": {
              "height": 0.375,
              "width": 0.9,
              "x": 0.05,
              "y": 0.125
            },
            "role": "copy",
            "roleId": "copy"
          },
          {
            "nodeId": "action",
            "rect": {
              "height": 0.125,
              "width": 0.416667,
              "x": 0.05,
              "y": 0.625
            },
            "role": "action",
            "roleId": "action"
          }
        ]
      }
    },
    "displayName": "纯文字",
    "editorCapabilities": {
      "editableObjects": [
        {
          "altPolicy": "decorative",
          "capabilities": [
            "content",
            "layout",
            "layer"
          ],
          "constraints": {
            "allowAspectRatio": false,
            "allowFocus": false,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": false,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 1,
              "width": 1
            },
            "minSize": {
              "height": 0.1,
              "width": 0.12
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
          "contentFieldKeys": [
            "bgImage"
          ],
          "kind": "media",
          "mediaFieldKeys": [
            "bgImage"
          ],
          "responsive": {
            "content": "shared",
            "layer": "viewport-specific",
            "layout": "viewport-specific"
          },
          "roleId": "bgImage"
        },
        {
          "capabilities": [
            "content",
            "visibility",
            "typography",
            "layout",
            "layer"
          ],
          "constraints": {
            "allowAspectRatio": false,
            "allowFocus": false,
            "allowHide": true,
            "allowTypography": true,
            "allowZoom": false,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 0.7,
              "width": 0.92
            },
            "minSize": {
              "height": 0.03,
              "width": 0.08
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
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
            "link",
            "layout",
            "layer",
            "visibility",
            "typography"
          ],
          "constraints": {
            "allowAspectRatio": false,
            "allowFocus": false,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": false,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 0.28,
              "width": 0.72
            },
            "minSize": {
              "height": 0.04,
              "width": 0.08
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
          "contentFieldKeys": [
            "buttonText",
            "targetType",
            "productCode",
            "productId",
            "linkUrl",
            "categorySlug"
          ],
          "kind": "action",
          "nodeIds": [
            "action",
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
          "roleId": "action"
        }
      ],
      "layoutOverrides": {
        "framePresets": [
          "compact",
          "standard",
          "spacious"
        ],
        "frameRatioPresets": [
          "16/9",
          "4/3",
          "1/1",
          "3/4",
          "9/16"
        ],
        "frameRatioRange": {
          "max": 4,
          "min": 0.25,
          "step": 0.01
        },
        "slots": [
          {
            "roleId": "bgImage"
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
            "requiresSafeBand": false,
            "roleId": "copy",
            "sizePresets": [
              "small",
              "standard",
              "large"
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
              "mineral",
              "ivory"
            ],
            "maxLines": 6,
            "placementPresets": [],
            "requiresSafeBand": false,
            "roleId": "action",
            "widthPresets": []
          },
          {
            "align": [
              "left",
              "center",
              "right"
            ],
            "colorTokens": [
              "ink",
              "mineral",
              "ivory"
            ],
            "maxLines": 6,
            "placementPresets": [],
            "requiresSafeBand": false,
            "roleId": "buttonText",
            "widthPresets": []
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
            "column": 1,
            "overlay": true,
            "role": "media",
            "roleId": "bgImage",
            "row": 1,
            "rowSpan": 8,
            "span": 12
          },
          {
            "column": 4.999996,
            "role": "eyebrow",
            "roleId": "copy",
            "row": 3.6,
            "rowSpan": 0.7,
            "span": 3.999996
          },
          {
            "column": 3.000004,
            "role": "title",
            "roleId": "copy",
            "row": 4.3,
            "rowSpan": 2,
            "span": 8.000004
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
            "column": 4.999996,
            "role": "action",
            "roleId": "action",
            "row": 7.4,
            "rowSpan": 0.7,
            "span": 3.999996
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
            "overlay": true,
            "role": "media",
            "roleId": "bgImage",
            "row": 1,
            "rowSpan": 8,
            "span": 12
          },
          {
            "column": 1.6,
            "role": "copy",
            "roleId": "copy",
            "row": 2,
            "rowSpan": 3,
            "span": 10.8
          },
          {
            "column": 1.6,
            "role": "action",
            "roleId": "action",
            "row": 6,
            "rowSpan": 1,
            "span": 5.000004
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
    "version": 6,
    "visualRole": "support-stage",
    "visualWeight": "support-stage",
    "width": "editorial"
  },
  "video": {
    "allowedControls": [
      "videoWidth"
    ],
    "commercialPurpose": "品牌展示",
    "contentBudget": {
      "limits": {
        "videoDescription": 120
      },
      "maxCtas": 1,
      "requiredText": []
    },
    "copyPlacementByViewport": {
      "desktop": "overlay",
      "mobile": "stacked"
    },
    "defaultGeometryByViewport": {
      "desktop": {
        "frameAspectRatio": 1.555556,
        "rows": 8,
        "safeArea": {
          "height": 0.9,
          "width": 0.92,
          "x": 0.04,
          "y": 0.05
        },
        "tone": "dark",
        "zones": [
          {
            "nodeId": "coverImage",
            "rect": {
              "height": 0.875,
              "width": 1,
              "x": 0,
              "y": 0
            },
            "role": "media",
            "roleId": "coverImage"
          },
          {
            "kind": "play",
            "nodeId": "playControl",
            "overlay": true,
            "rect": {
              "height": 0.125,
              "width": 0.166667,
              "x": 0.416667,
              "y": 0.25
            },
            "role": "marker",
            "roleId": "playControl"
          },
          {
            "nodeId": "copy",
            "overlay": true,
            "rect": {
              "height": 0.125,
              "width": 0.416667,
              "x": 0.083333,
              "y": 0.5
            },
            "role": "copy",
            "roleId": "copy"
          },
          {
            "nodeId": "action",
            "overlay": true,
            "rect": {
              "height": 0.125,
              "width": 0.25,
              "x": 0.083333,
              "y": 0.75
            },
            "role": "action",
            "roleId": "action"
          }
        ]
      },
      "mobile": {
        "frameAspectRatio": 0.4,
        "rows": 8,
        "safeArea": {
          "height": 0.92,
          "width": 0.9,
          "x": 0.05,
          "y": 0.04
        },
        "tone": "light",
        "zones": [
          {
            "nodeId": "coverImage",
            "rect": {
              "height": 0.5,
              "width": 1,
              "x": 0,
              "y": 0
            },
            "role": "media",
            "roleId": "coverImage"
          },
          {
            "kind": "play",
            "nodeId": "playControl",
            "overlay": true,
            "rect": {
              "height": 0.125,
              "width": 0.166667,
              "x": 0.416667,
              "y": 0.125
            },
            "role": "marker",
            "roleId": "playControl"
          },
          {
            "nodeId": "copy",
            "rect": {
              "height": 0.25,
              "width": 0.9,
              "x": 0.05,
              "y": 0.5
            },
            "role": "copy",
            "roleId": "copy"
          },
          {
            "nodeId": "action",
            "rect": {
              "height": 0.125,
              "width": 0.416667,
              "x": 0.05,
              "y": 0.75
            },
            "role": "action",
            "roleId": "action"
          }
        ]
      }
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
          "constraints": {
            "allowAspectRatio": true,
            "allowFocus": true,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": true,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 1,
              "width": 1
            },
            "minSize": {
              "height": 0.1,
              "width": 0.12
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
          "contentFieldKeys": [
            "videoUrl",
            "posterUrl",
            "videoDescription",
            "videoWidth",
            "autoPlay",
            "loop",
            "muted",
            "showControls"
          ],
          "kind": "video",
          "mediaFieldKeys": [
            "videoUrl",
            "posterUrl"
          ],
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
            "content",
            "layout",
            "layer",
            "visibility",
            "typography"
          ],
          "constraints": {
            "allowAspectRatio": false,
            "allowFocus": false,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": false,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 0.7,
              "width": 0.92
            },
            "minSize": {
              "height": 0.03,
              "width": 0.08
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
          "contentFieldKeys": [
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
            "link",
            "layout",
            "layer",
            "visibility",
            "typography"
          ],
          "constraints": {
            "allowAspectRatio": false,
            "allowFocus": false,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": false,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 0.28,
              "width": 0.72
            },
            "minSize": {
              "height": 0.04,
              "width": 0.08
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
          "contentFieldKeys": [
            "actionText",
            "targetType",
            "productCode",
            "productId",
            "linkUrl",
            "categorySlug"
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
          "standard",
          "wide"
        ],
        "frameRatioPresets": [
          "16/9",
          "4/3",
          "1/1",
          "3/4",
          "9/16"
        ],
        "frameRatioRange": {
          "max": 4,
          "min": 0.25,
          "step": 0.01
        },
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
              "mineral",
              "ivory"
            ],
            "maxLines": 6,
            "placementPresets": [],
            "requiresSafeBand": false,
            "roleId": "copy",
            "widthPresets": []
          },
          {
            "align": [
              "left",
              "center",
              "right"
            ],
            "colorTokens": [
              "ink",
              "mineral",
              "ivory"
            ],
            "maxLines": 6,
            "placementPresets": [],
            "requiresSafeBand": false,
            "roleId": "action",
            "widthPresets": []
          },
          {
            "align": [
              "left",
              "center",
              "right"
            ],
            "colorTokens": [
              "ink",
              "mineral",
              "ivory"
            ],
            "maxLines": 6,
            "placementPresets": [],
            "requiresSafeBand": false,
            "roleId": "actionText",
            "widthPresets": []
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
            "column": 6.000004,
            "kind": "play",
            "overlay": true,
            "role": "marker",
            "roleId": "playControl",
            "row": 3,
            "rowSpan": 1,
            "span": 2.000004
          },
          {
            "column": 1.999996,
            "overlay": true,
            "role": "copy",
            "roleId": "copy",
            "row": 5,
            "rowSpan": 1,
            "span": 5.000004
          },
          {
            "column": 1.999996,
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
            "column": 6.000004,
            "kind": "play",
            "overlay": true,
            "role": "marker",
            "roleId": "playControl",
            "row": 2,
            "rowSpan": 1,
            "span": 2.000004
          },
          {
            "column": 1.6,
            "role": "copy",
            "roleId": "copy",
            "row": 5,
            "rowSpan": 2,
            "span": 10.8
          },
          {
            "column": 1.6,
            "role": "action",
            "roleId": "action",
            "row": 7,
            "rowSpan": 1,
            "span": 5.000004
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
        "parentRole": "copy",
        "required": false,
        "role": "action"
      }
    ],
    "spacingPolicy": [
      "normal"
    ],
    "supportsLinkTarget": true,
    "version": 6,
    "visualRole": "feature-stage",
    "visualWeight": "feature-stage",
    "width": "full"
  },
  "wearingInspiration": {
    "allowedControls": [],
    "commercialPurpose": "商品销售",
    "contentBudget": {
      "limits": {},
      "maxCtas": 1,
      "requiredText": []
    },
    "copyPlacementByViewport": {
      "desktop": "stacked",
      "mobile": "stacked"
    },
    "defaultGeometryByViewport": {
      "desktop": {
        "frameAspectRatio": 1.097143,
        "rows": 10,
        "safeArea": {
          "height": 0.9,
          "width": 0.92,
          "x": 0.04,
          "y": 0.05
        },
        "tone": "light",
        "zones": [
          {
            "nodeId": "wearingImage",
            "rect": {
              "height": 0.8,
              "width": 0.583333,
              "x": 0,
              "y": 0
            },
            "role": "mainMedia",
            "roleId": "wearingImage"
          },
          {
            "nodeId": "copy",
            "rect": {
              "height": 0.2,
              "width": 0.416667,
              "x": 0.543333,
              "y": 0.05
            },
            "role": "copy",
            "roleId": "copy"
          },
          {
            "nodeId": "relatedProducts",
            "rect": {
              "height": 0.6,
              "width": 0.416667,
              "x": 0.583333,
              "y": 0.2
            },
            "role": "detailMedia",
            "roleId": "relatedProducts"
          },
          {
            "nodeId": "action",
            "rect": {
              "height": 0.1,
              "width": 0.25,
              "x": 0.583333,
              "y": 0.85
            },
            "role": "action",
            "roleId": "action"
          }
        ]
      },
      "mobile": {
        "frameAspectRatio": 0.4,
        "rows": 8,
        "safeArea": {
          "height": 0.92,
          "width": 0.9,
          "x": 0.05,
          "y": 0.04
        },
        "tone": "light",
        "zones": [
          {
            "nodeId": "wearingImage",
            "rect": {
              "height": 0.5,
              "width": 1,
              "x": 0,
              "y": 0
            },
            "role": "mainMedia",
            "roleId": "wearingImage"
          },
          {
            "nodeId": "copy",
            "rect": {
              "height": 0.125,
              "width": 0.9,
              "x": 0.05,
              "y": 0.5
            },
            "role": "copy",
            "roleId": "copy"
          },
          {
            "nodeId": "relatedProducts",
            "rect": {
              "height": 0.25,
              "width": 0.666667,
              "x": 0.333333,
              "y": 0.625
            },
            "role": "detailMedia",
            "roleId": "relatedProducts"
          },
          {
            "nodeId": "action",
            "rect": {
              "height": 0.125,
              "width": 0.416667,
              "x": 0.05,
              "y": 0.835
            },
            "role": "action",
            "roleId": "action"
          }
        ]
      }
    },
    "displayName": "佩戴展示",
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
          "constraints": {
            "allowAspectRatio": true,
            "allowFocus": true,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": true,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 1,
              "width": 1
            },
            "minSize": {
              "height": 0.1,
              "width": 0.12
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
          "contentFieldKeys": [
            "image",
            "altText"
          ],
          "kind": "media",
          "mediaFieldKeys": [
            "image"
          ],
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
            "content",
            "layout",
            "layer",
            "visibility",
            "typography"
          ],
          "constraints": {
            "allowAspectRatio": false,
            "allowFocus": false,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": false,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 0.7,
              "width": 0.92
            },
            "minSize": {
              "height": 0.03,
              "width": 0.08
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
          "contentFieldKeys": [
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
            "reference",
            "layout",
            "layer"
          ],
          "constraints": {
            "allowAspectRatio": false,
            "allowFocus": false,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": false,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 1,
              "width": 1
            },
            "minSize": {
              "height": 0.1,
              "width": 0.12
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
          "contentFieldKeys": [
            "productCodes"
          ],
          "kind": "product",
          "referenceFieldKey": "productCodes",
          "responsive": {
            "content": "shared",
            "layer": "viewport-specific",
            "layout": "viewport-specific",
            "reference": "shared"
          },
          "roleId": "relatedProducts"
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
          "constraints": {
            "allowAspectRatio": false,
            "allowFocus": false,
            "allowHide": false,
            "allowTypography": false,
            "allowZoom": false,
            "allowedResize": [
              "n",
              "ne",
              "e",
              "se",
              "s",
              "sw",
              "w",
              "nw"
            ],
            "layerRange": {
              "max": 20,
              "min": 0
            },
            "maxSize": {
              "height": 0.28,
              "width": 0.72
            },
            "minSize": {
              "height": 0.04,
              "width": 0.08
            },
            "movementAxes": [
              "x",
              "y"
            ],
            "safeAreaRequired": false
          },
          "contentFieldKeys": [
            "actionText",
            "targetType",
            "productCode",
            "productId",
            "linkUrl",
            "categorySlug"
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
        "frameRatioPresets": [
          "16/9",
          "4/3",
          "1/1",
          "3/4",
          "9/16"
        ],
        "frameRatioRange": {
          "max": 4,
          "min": 0.25,
          "step": 0.01
        },
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
          },
          {
            "roleId": "relatedProducts"
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
              "mineral",
              "ivory"
            ],
            "maxLines": 6,
            "placementPresets": [],
            "requiresSafeBand": false,
            "roleId": "copy",
            "widthPresets": []
          },
          {
            "align": [
              "left",
              "center",
              "right"
            ],
            "colorTokens": [
              "ink",
              "mineral",
              "ivory"
            ],
            "maxLines": 6,
            "placementPresets": [],
            "requiresSafeBand": false,
            "roleId": "action",
            "widthPresets": []
          },
          {
            "align": [
              "left",
              "center",
              "right"
            ],
            "colorTokens": [
              "ink",
              "mineral",
              "ivory"
            ],
            "maxLines": 6,
            "placementPresets": [],
            "requiresSafeBand": false,
            "roleId": "actionText",
            "widthPresets": []
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
            "span": 6.999996
          },
          {
            "column": 7.519996,
            "role": "copy",
            "roleId": "copy",
            "row": 1.5,
            "rowSpan": 2,
            "span": 5.000004
          },
          {
            "column": 7.999996,
            "role": "detailMedia",
            "roleId": "relatedProducts",
            "row": 3,
            "rowSpan": 6,
            "span": 5.000004
          },
          {
            "column": 7.999996,
            "role": "action",
            "roleId": "action",
            "row": 9.5,
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
            "column": 1.6,
            "role": "copy",
            "roleId": "copy",
            "row": 5,
            "rowSpan": 1,
            "span": 10.8
          },
          {
            "column": 4.999996,
            "role": "detailMedia",
            "roleId": "relatedProducts",
            "row": 6,
            "rowSpan": 2,
            "span": 8.000004
          },
          {
            "column": 1.6,
            "role": "action",
            "roleId": "action",
            "row": 7.68,
            "rowSpan": 1,
            "span": 5.000004
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
    "version": 5,
    "visualRole": "feature-stage",
    "visualWeight": "feature-stage",
    "width": "wide"
  }
} as const satisfies Record<ContentTemplateKey, ContentTemplateContract>;

/** 全部活跃模板的中性结构预览；不承担业务、发布或 Inspector 完整合同。 */
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
          "column": 1,
          "overlay": true,
          "role": "media",
          "row": 1,
          "rowSpan": 8,
          "span": 12
        },
        {
          "column": 1.999996,
          "role": "copy",
          "row": 2,
          "rowSpan": 3,
          "span": 6
        },
        {
          "column": 9.000004,
          "role": "action",
          "row": 3,
          "rowSpan": 1,
          "span": 3
        },
        {
          "column": 9.000004,
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
          "column": 3.000004,
          "role": "copy",
          "row": 1.4,
          "rowSpan": 1,
          "span": 8.000004
        },
        {
          "column": 1,
          "role": "card",
          "row": 3,
          "rowSpan": 3,
          "span": 3.999996
        },
        {
          "column": 4.999996,
          "role": "card",
          "row": 3,
          "rowSpan": 3,
          "span": 3.999996
        },
        {
          "column": 9.000004,
          "role": "card",
          "row": 3,
          "rowSpan": 3,
          "span": 3.999996
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
          "column": 1.999996,
          "overlay": true,
          "role": "copy",
          "row": 4,
          "rowSpan": 1,
          "span": 5.000004
        },
        {
          "column": 9.000004,
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
          "column": 1.48,
          "role": "copy",
          "row": 1.4,
          "rowSpan": 1,
          "span": 3.999996
        },
        {
          "column": 1,
          "role": "card",
          "row": 3,
          "rowSpan": 4,
          "span": 3.999996
        },
        {
          "column": 4.999996,
          "role": "card",
          "row": 3,
          "rowSpan": 4,
          "span": 3.999996
        },
        {
          "column": 9.000004,
          "role": "card",
          "row": 3,
          "rowSpan": 4,
          "span": 3.999996
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
          "column": 1.48,
          "role": "copy",
          "row": 1.4,
          "rowSpan": 1,
          "span": 3.999996
        },
        {
          "column": 1,
          "role": "card",
          "row": 3,
          "rowSpan": 3,
          "span": 3.999996
        },
        {
          "column": 4.999996,
          "role": "card",
          "row": 3,
          "rowSpan": 3,
          "span": 3.999996
        },
        {
          "column": 9.000004,
          "role": "card",
          "row": 3,
          "rowSpan": 3,
          "span": 3.999996
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
        "marker",
        "action"
      ],
      "mobile": [
        "copy",
        "mainMedia",
        "detailMedia",
        "marker",
        "action"
      ]
    },
    "preview": {
      "desktopZones": [
        {
          "column": 1.48,
          "role": "copy",
          "row": 1.4,
          "rowSpan": 1,
          "span": 11.04
        },
        {
          "column": 1,
          "role": "mainMedia",
          "row": 1,
          "rowSpan": 8,
          "span": 6
        },
        {
          "column": 7,
          "role": "detailMedia",
          "row": 1,
          "rowSpan": 8,
          "span": 6
        },
        {
          "column": 6.000004,
          "kind": "handle",
          "overlay": true,
          "role": "marker",
          "row": 4,
          "rowSpan": 2,
          "span": 2.000004
        },
        {
          "column": 5.56,
          "overlay": true,
          "role": "action",
          "row": 7.88,
          "rowSpan": 0.64,
          "span": 2.88
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
      },
      {
        "key": "action",
        "role": "action"
      }
    ],
    "visualRole": "feature-stage",
    "width": "wide"
  },
  "craftDetails": {
    "category": "图文内容",
    "displayName": "工艺细节",
    "flow": "flow",
    "heightModeByViewport": {
      "desktop": "content",
      "mobile": "content"
    },
    "key": "craftDetails",
    "moduleType": "工艺细节",
    "order": {
      "desktop": [
        "mainMedia",
        "copy",
        "detailMedia",
        "detailMedia"
      ],
      "mobile": [
        "mainMedia",
        "copy",
        "detailMedia",
        "detailMedia"
      ]
    },
    "preview": {
      "desktopZones": [
        {
          "column": 4.999996,
          "role": "mainMedia",
          "row": 1.48,
          "rowSpan": 6.266664,
          "span": 7.520004
        },
        {
          "column": 1.48,
          "role": "copy",
          "row": 2.44,
          "rowSpan": 3.36,
          "span": 3
        },
        {
          "column": 4.999996,
          "role": "detailMedia",
          "row": 8,
          "rowSpan": 1,
          "span": 3.519996
        },
        {
          "column": 9.000004,
          "role": "detailMedia",
          "row": 8,
          "rowSpan": 1,
          "span": 3.519996
        }
      ],
      "tone": "light"
    },
    "slots": [
      {
        "desktopRatio": "3 / 2",
        "key": "leadImage",
        "mobileRatio": "4 / 5",
        "role": "mainMedia"
      },
      {
        "key": "copy",
        "role": "copy"
      },
      {
        "desktopRatio": "1 / 1",
        "key": "detailImageOne",
        "mobileRatio": "1 / 1",
        "role": "detailMedia"
      },
      {
        "desktopRatio": "1 / 1",
        "key": "detailImageTwo",
        "mobileRatio": "1 / 1",
        "role": "detailMedia"
      }
    ],
    "visualRole": "support-stage",
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
          "rowSpan": 5.333336,
          "span": 8.000004
        },
        {
          "column": 9.000004,
          "role": "detailMedia",
          "row": 2,
          "rowSpan": 5,
          "span": 3.999996
        },
        {
          "column": 8.520004,
          "role": "copy",
          "row": 5,
          "rowSpan": 2,
          "span": 3.999996
        },
        {
          "column": 9.000004,
          "role": "action",
          "row": 7.6,
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
          "column": 3.000004,
          "role": "media",
          "row": 1,
          "rowSpan": 5,
          "span": 8.000004
        },
        {
          "column": 3.000004,
          "role": "copy",
          "row": 6,
          "rowSpan": 1,
          "span": 8.000004
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
          "row": 7.6,
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
          "column": 1.48,
          "role": "copy",
          "row": 5,
          "rowSpan": 2,
          "span": 8.000004
        },
        {
          "column": 9.52,
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
          "column": 1.48,
          "role": "copy",
          "row": 1.5,
          "rowSpan": 1,
          "span": 5.000004
        },
        {
          "column": 1,
          "role": "mainMedia",
          "row": 3,
          "rowSpan": 4,
          "span": 6.999996
        },
        {
          "column": 7.999996,
          "role": "detailMedia",
          "row": 3,
          "rowSpan": 2,
          "span": 5.000004
        },
        {
          "column": 7.999996,
          "role": "media",
          "row": 5,
          "rowSpan": 2,
          "span": 5.000004
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
          "column": 4.999996,
          "overlay": true,
          "role": "eyebrow",
          "row": 4.2,
          "rowSpan": 0.7,
          "span": 3.999996
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
          "column": 4.500004,
          "overlay": true,
          "role": "subtitle",
          "row": 6.4,
          "rowSpan": 0.7,
          "span": 5.000004
        },
        {
          "column": 4.999996,
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
          "column": 3.000004,
          "kind": "hotspot",
          "overlay": true,
          "role": "marker",
          "row": 3,
          "rowSpan": 1,
          "span": 0.999996
        },
        {
          "column": 7,
          "kind": "hotspot",
          "overlay": true,
          "role": "marker",
          "row": 4,
          "rowSpan": 1,
          "span": 0.999996
        },
        {
          "column": 10,
          "kind": "hotspot",
          "overlay": true,
          "role": "marker",
          "row": 2,
          "rowSpan": 1,
          "span": 0.999996
        },
        {
          "column": 1.999996,
          "role": "copy",
          "row": 7,
          "rowSpan": 1,
          "span": 5.000004
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
          "column": 1.48,
          "role": "copy",
          "row": 1.4,
          "rowSpan": 2,
          "span": 5.000004
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
          "column": 1.999996,
          "kind": "countdown",
          "overlay": true,
          "role": "marker",
          "row": 2,
          "rowSpan": 1,
          "span": 3
        },
        {
          "column": 1.999996,
          "overlay": true,
          "role": "copy",
          "row": 4,
          "rowSpan": 2,
          "span": 6
        },
        {
          "column": 1.999996,
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
          "column": 1.48,
          "role": "copy",
          "row": 1.4,
          "rowSpan": 1,
          "span": 5.000004
        },
        {
          "column": 1,
          "role": "card",
          "row": 3,
          "rowSpan": 4,
          "span": 3.999996
        },
        {
          "column": 4.999996,
          "role": "card",
          "row": 3,
          "rowSpan": 4,
          "span": 3.999996
        },
        {
          "column": 9.000004,
          "role": "card",
          "row": 3,
          "rowSpan": 4,
          "span": 3.999996
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
          "column": 1.48,
          "role": "copy",
          "row": 1.4,
          "rowSpan": 1,
          "span": 11.04
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
          "column": 1.48,
          "role": "copy",
          "row": 1.4,
          "rowSpan": 1,
          "span": 5.000004
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
          "column": 1.48,
          "role": "eyebrow",
          "row": 4.8,
          "rowSpan": 0.7,
          "span": 2.499996
        },
        {
          "column": 1.48,
          "role": "title",
          "row": 5.5,
          "rowSpan": 1.6,
          "span": 2.499996
        },
        {
          "column": 1.48,
          "role": "subtitle",
          "row": 7.1,
          "rowSpan": 0.7,
          "span": 2.499996
        },
        {
          "column": 1.48,
          "role": "action",
          "row": 7.8,
          "rowSpan": 0.6,
          "span": 2.000004
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
          "span": 6.999996
        },
        {
          "column": 8.520004,
          "role": "copy",
          "row": 1.4,
          "rowSpan": 1,
          "span": 3.999996
        },
        {
          "column": 9.000004,
          "role": "list",
          "row": 3,
          "rowSpan": 2,
          "span": 3.999996
        },
        {
          "column": 9.000004,
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
          "span": 5.000004
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
          "span": 3.999996
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
          "column": 1,
          "overlay": true,
          "role": "media",
          "row": 1,
          "rowSpan": 8,
          "span": 12
        },
        {
          "column": 4.999996,
          "role": "eyebrow",
          "row": 3.6,
          "rowSpan": 0.7,
          "span": 3.999996
        },
        {
          "column": 3.000004,
          "role": "title",
          "row": 4.3,
          "rowSpan": 2,
          "span": 8.000004
        },
        {
          "column": 4,
          "role": "subtitle",
          "row": 6.3,
          "rowSpan": 0.7,
          "span": 6
        },
        {
          "column": 4.999996,
          "role": "action",
          "row": 7.4,
          "rowSpan": 0.7,
          "span": 3.999996
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
          "column": 6.000004,
          "kind": "play",
          "overlay": true,
          "role": "marker",
          "row": 3,
          "rowSpan": 1,
          "span": 2.000004
        },
        {
          "column": 1.999996,
          "overlay": true,
          "role": "copy",
          "row": 5,
          "rowSpan": 1,
          "span": 5.000004
        },
        {
          "column": 1.999996,
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
          "span": 6.999996
        },
        {
          "column": 7.519996,
          "role": "copy",
          "row": 1.5,
          "rowSpan": 2,
          "span": 5.000004
        },
        {
          "column": 7.999996,
          "role": "detailMedia",
          "row": 3,
          "rowSpan": 6,
          "span": 5.000004
        },
        {
          "column": 7.999996,
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

/** 所有活跃模板的中性结构预览源；缩略图与总览不得另建坐标台账。 */
export const CONTENT_TEMPLATE_PREVIEWS = {
  "booking": {
    "commercialPurpose": "活动转化",
    "desktop": {
      "order": [
        "copy",
        "action",
        "marker"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 1,
          "overlay": true,
          "role": "media",
          "row": 1,
          "rowSpan": 8,
          "span": 12
        },
        {
          "column": 1.999996,
          "role": "copy",
          "row": 2,
          "rowSpan": 3,
          "span": 6
        },
        {
          "column": 9.000004,
          "role": "action",
          "row": 3,
          "rowSpan": 1,
          "span": 3
        },
        {
          "column": 9.000004,
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
          "overlay": true,
          "role": "media",
          "row": 1,
          "rowSpan": 8,
          "span": 12
        },
        {
          "column": 1.6,
          "role": "copy",
          "row": 1.32,
          "rowSpan": 3,
          "span": 10.8
        },
        {
          "column": 1.6,
          "role": "action",
          "row": 5,
          "rowSpan": 1,
          "span": 8.000004
        },
        {
          "column": 1.6,
          "role": "marker",
          "row": 7,
          "rowSpan": 1,
          "span": 8.000004
        }
      ]
    },
    "moduleType": "预约入口",
    "purpose": "页面尾章的预约主行动与统一联系电话",
    "visualRole": "feature-stage"
  },
  "brandPoints": {
    "commercialPurpose": "信任建立",
    "desktop": {
      "order": [
        "copy",
        "card"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 3.000004,
          "role": "copy",
          "row": 1.4,
          "rowSpan": 1,
          "span": 8.000004
        },
        {
          "column": 1,
          "role": "card",
          "row": 3,
          "rowSpan": 3,
          "span": 3.999996
        },
        {
          "column": 4.999996,
          "role": "card",
          "row": 3,
          "rowSpan": 3,
          "span": 3.999996
        },
        {
          "column": 9.000004,
          "role": "card",
          "row": 3,
          "rowSpan": 3,
          "span": 3.999996
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
          "column": 1.6,
          "role": "copy",
          "row": 1.32,
          "rowSpan": 1,
          "span": 10.8
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
    "commercialPurpose": "品牌展示",
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
          "column": 1.999996,
          "overlay": true,
          "role": "copy",
          "row": 4,
          "rowSpan": 1,
          "span": 5.000004
        },
        {
          "column": 9.000004,
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
          "span": 3.999996
        }
      ]
    },
    "moduleType": "轮播图",
    "purpose": "多帧主视觉与分页切换",
    "visualRole": "feature-stage"
  },
  "categoryCards": {
    "commercialPurpose": "商品销售",
    "desktop": {
      "order": [
        "copy",
        "card"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 1.48,
          "role": "copy",
          "row": 1.4,
          "rowSpan": 1,
          "span": 3.999996
        },
        {
          "column": 1,
          "role": "card",
          "row": 3,
          "rowSpan": 4,
          "span": 3.999996
        },
        {
          "column": 4.999996,
          "role": "card",
          "row": 3,
          "rowSpan": 4,
          "span": 3.999996
        },
        {
          "column": 9.000004,
          "role": "card",
          "row": 3,
          "rowSpan": 4,
          "span": 3.999996
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
          "column": 1.6,
          "role": "copy",
          "row": 1.32,
          "rowSpan": 1,
          "span": 10.8
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
    "commercialPurpose": "信任建立",
    "desktop": {
      "order": [
        "copy",
        "card"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 1.48,
          "role": "copy",
          "row": 1.4,
          "rowSpan": 1,
          "span": 3.999996
        },
        {
          "column": 1,
          "role": "card",
          "row": 3,
          "rowSpan": 3,
          "span": 3.999996
        },
        {
          "column": 4.999996,
          "role": "card",
          "row": 3,
          "rowSpan": 3,
          "span": 3.999996
        },
        {
          "column": 9.000004,
          "role": "card",
          "row": 3,
          "rowSpan": 3,
          "span": 3.999996
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
          "column": 1.6,
          "role": "copy",
          "row": 1.32,
          "rowSpan": 1,
          "span": 10.8
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
    "commercialPurpose": "信任建立",
    "desktop": {
      "order": [
        "copy",
        "mainMedia",
        "detailMedia",
        "marker",
        "action"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 1.48,
          "role": "copy",
          "row": 1.4,
          "rowSpan": 1,
          "span": 11.04
        },
        {
          "column": 1,
          "role": "mainMedia",
          "row": 1,
          "rowSpan": 8,
          "span": 6
        },
        {
          "column": 7,
          "role": "detailMedia",
          "row": 1,
          "rowSpan": 8,
          "span": 6
        },
        {
          "column": 6.000004,
          "kind": "handle",
          "overlay": true,
          "role": "marker",
          "row": 4,
          "rowSpan": 2,
          "span": 2.000004
        },
        {
          "column": 5.56,
          "overlay": true,
          "role": "action",
          "row": 7.88,
          "rowSpan": 0.64,
          "span": 2.88
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
        "marker",
        "action"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 1.6,
          "role": "copy",
          "row": 1.32,
          "rowSpan": 1,
          "span": 10.8
        },
        {
          "column": 1,
          "role": "mainMedia",
          "row": 1,
          "rowSpan": 8,
          "span": 12
        },
        {
          "column": 1,
          "role": "detailMedia",
          "row": 1,
          "rowSpan": 8,
          "span": 12
        },
        {
          "column": 6.000004,
          "kind": "handle",
          "overlay": true,
          "role": "marker",
          "row": 4,
          "rowSpan": 2,
          "span": 2.000004
        },
        {
          "column": 3.4,
          "overlay": true,
          "role": "action",
          "row": 8.04,
          "rowSpan": 0.64,
          "span": 7.2
        }
      ]
    },
    "moduleType": "改款对比",
    "purpose": "同尺寸前后画面与分割手柄",
    "visualRole": "feature-stage"
  },
  "craftDetails": {
    "commercialPurpose": "信任建立",
    "desktop": {
      "order": [
        "mainMedia",
        "copy",
        "detailMedia",
        "detailMedia"
      ],
      "rows": 12,
      "tone": "light",
      "zones": [
        {
          "column": 4.999996,
          "role": "mainMedia",
          "row": 1.48,
          "rowSpan": 6.266664,
          "span": 7.520004
        },
        {
          "column": 1.48,
          "role": "copy",
          "row": 2.44,
          "rowSpan": 3.36,
          "span": 3
        },
        {
          "column": 4.999996,
          "role": "detailMedia",
          "row": 8.32,
          "rowSpan": 4.400004,
          "span": 3.519996
        },
        {
          "column": 9.000004,
          "role": "detailMedia",
          "row": 8.32,
          "rowSpan": 4.400004,
          "span": 3.519996
        }
      ]
    },
    "displayName": "工艺细节",
    "key": "craftDetails",
    "mobile": {
      "order": [
        "mainMedia",
        "copy",
        "detailMedia",
        "detailMedia"
      ],
      "rows": 12,
      "tone": "light",
      "zones": [
        {
          "column": 1,
          "role": "mainMedia",
          "row": 1,
          "rowSpan": 6.6,
          "span": 12
        },
        {
          "column": 1.6,
          "role": "copy",
          "row": 7.96,
          "rowSpan": 2.16,
          "span": 10.8
        },
        {
          "column": 1.6,
          "role": "detailMedia",
          "row": 10.36,
          "rowSpan": 2.244,
          "span": 5.1
        },
        {
          "column": 7.3,
          "role": "detailMedia",
          "row": 10.36,
          "rowSpan": 2.244,
          "span": 5.1
        }
      ]
    },
    "moduleType": "工艺细节",
    "purpose": "一张主图建立工艺焦点，两张细节图补充材质观察",
    "visualRole": "support-stage"
  },
  "doublePoster": {
    "commercialPurpose": "内容传播",
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
          "rowSpan": 5.333336,
          "span": 8.000004
        },
        {
          "column": 9.000004,
          "role": "detailMedia",
          "row": 2,
          "rowSpan": 5,
          "span": 3.999996
        },
        {
          "column": 8.520004,
          "role": "copy",
          "row": 5,
          "rowSpan": 2,
          "span": 3.999996
        },
        {
          "column": 9.000004,
          "role": "action",
          "row": 7.6,
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
          "rowSpan": 3.2,
          "span": 12
        },
        {
          "column": 1.6,
          "role": "copy",
          "row": 4,
          "rowSpan": 2,
          "span": 10.8
        },
        {
          "column": 4.999996,
          "role": "detailMedia",
          "row": 4.2,
          "rowSpan": 4,
          "span": 8.000004
        },
        {
          "column": 1.6,
          "role": "action",
          "row": 7.68,
          "rowSpan": 1,
          "span": 5.000004
        }
      ]
    },
    "moduleType": "双图海报",
    "purpose": "主图、细节图与说明的章节节奏",
    "visualRole": "feature-stage"
  },
  "featuredProduct": {
    "commercialPurpose": "商品销售",
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
          "column": 3.000004,
          "role": "media",
          "row": 1,
          "rowSpan": 5,
          "span": 8.000004
        },
        {
          "column": 3.000004,
          "role": "copy",
          "row": 6,
          "rowSpan": 1,
          "span": 8.000004
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
          "row": 7.6,
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
          "column": 1.6,
          "role": "copy",
          "row": 5,
          "rowSpan": 1,
          "span": 10.8
        },
        {
          "column": 1,
          "role": "list",
          "row": 6,
          "rowSpan": 1,
          "span": 12
        },
        {
          "column": 1.6,
          "role": "action",
          "row": 7,
          "rowSpan": 1,
          "span": 5.000004
        }
      ]
    },
    "moduleType": "单品焦点推荐",
    "purpose": "单件主推商品与关键信息",
    "visualRole": "feature-stage"
  },
  "fullBleed": {
    "commercialPurpose": "品牌展示",
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
          "column": 1.48,
          "role": "copy",
          "row": 5,
          "rowSpan": 2,
          "span": 8.000004
        },
        {
          "column": 9.52,
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
          "column": 1.6,
          "role": "copy",
          "row": 5,
          "rowSpan": 2,
          "span": 10.8
        },
        {
          "column": 1.6,
          "role": "action",
          "row": 7,
          "rowSpan": 1,
          "span": 5.000004
        }
      ]
    },
    "moduleType": "全屏出血图",
    "purpose": "低于首屏的通栏章节影像",
    "visualRole": "support-stage"
  },
  "gallery": {
    "commercialPurpose": "商品销售",
    "desktop": {
      "order": [
        "copy",
        "media"
      ],
      "rows": 10,
      "tone": "light",
      "zones": [
        {
          "column": 1.48,
          "role": "copy",
          "row": 1.5,
          "rowSpan": 1,
          "span": 5.000004
        },
        {
          "column": 1,
          "role": "mainMedia",
          "row": 3,
          "rowSpan": 4,
          "span": 6.999996
        },
        {
          "column": 7.999996,
          "role": "detailMedia",
          "row": 3,
          "rowSpan": 2,
          "span": 5.000004
        },
        {
          "column": 7.999996,
          "role": "media",
          "row": 5,
          "rowSpan": 2,
          "span": 5.000004
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
          "column": 1.6,
          "role": "copy",
          "row": 1.4,
          "rowSpan": 1,
          "span": 10.8
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
    "commercialPurpose": "品牌展示",
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
          "column": 4.999996,
          "overlay": true,
          "role": "eyebrow",
          "row": 4.2,
          "rowSpan": 0.7,
          "span": 3.999996
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
          "column": 4.500004,
          "overlay": true,
          "role": "subtitle",
          "row": 6.4,
          "rowSpan": 0.7,
          "span": 5.000004
        },
        {
          "column": 4.999996,
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
          "rowSpan": 8,
          "span": 12
        },
        {
          "column": 2.44,
          "role": "eyebrow",
          "row": 5.32,
          "rowSpan": 0.44,
          "span": 5.76
        },
        {
          "column": 2.92,
          "role": "title",
          "row": 5.88,
          "rowSpan": 1.04,
          "span": 8.16
        },
        {
          "column": 2.44,
          "role": "subtitle",
          "row": 7.04,
          "rowSpan": 0.72,
          "span": 8.4
        },
        {
          "column": 2.44,
          "role": "action",
          "row": 7.92,
          "rowSpan": 0.56,
          "span": 4.32
        }
      ]
    },
    "moduleType": "首屏主视觉",
    "purpose": "品牌首屏与最高视觉权重舞台",
    "visualRole": "primary-stage"
  },
  "hotspot": {
    "commercialPurpose": "商品销售",
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
          "column": 3.000004,
          "kind": "hotspot",
          "overlay": true,
          "role": "marker",
          "row": 3,
          "rowSpan": 1,
          "span": 0.999996
        },
        {
          "column": 7,
          "kind": "hotspot",
          "overlay": true,
          "role": "marker",
          "row": 4,
          "rowSpan": 1,
          "span": 0.999996
        },
        {
          "column": 10,
          "kind": "hotspot",
          "overlay": true,
          "role": "marker",
          "row": 2,
          "rowSpan": 1,
          "span": 0.999996
        },
        {
          "column": 1.999996,
          "role": "copy",
          "row": 7,
          "rowSpan": 1,
          "span": 5.000004
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
          "column": 3.000004,
          "kind": "hotspot",
          "overlay": true,
          "role": "marker",
          "row": 2,
          "rowSpan": 1,
          "span": 0.999996
        },
        {
          "column": 7.999996,
          "kind": "hotspot",
          "overlay": true,
          "role": "marker",
          "row": 4,
          "rowSpan": 1,
          "span": 0.999996
        },
        {
          "column": 6.000004,
          "kind": "hotspot",
          "overlay": true,
          "role": "marker",
          "row": 5,
          "rowSpan": 1,
          "span": 0.999996
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
    "commercialPurpose": "内容传播",
    "desktop": {
      "order": [
        "copy",
        "timeline"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 1.48,
          "role": "copy",
          "row": 1.4,
          "rowSpan": 2,
          "span": 5.000004
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
          "column": 1.6,
          "role": "copy",
          "row": 1.32,
          "rowSpan": 2,
          "span": 10.8
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
    "commercialPurpose": "活动转化",
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
          "column": 1.999996,
          "kind": "countdown",
          "overlay": true,
          "role": "marker",
          "row": 2,
          "rowSpan": 1,
          "span": 3
        },
        {
          "column": 1.999996,
          "overlay": true,
          "role": "copy",
          "row": 4,
          "rowSpan": 2,
          "span": 6
        },
        {
          "column": 1.999996,
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
          "span": 3.999996
        },
        {
          "column": 1.6,
          "role": "copy",
          "row": 6,
          "rowSpan": 1,
          "span": 10.8
        },
        {
          "column": 1.6,
          "role": "action",
          "row": 7.68,
          "rowSpan": 1,
          "span": 5.000004
        }
      ]
    },
    "moduleType": "限时活动",
    "purpose": "活动影像、时间状态、权益文字与行动",
    "visualRole": "feature-stage"
  },
  "productRow": {
    "commercialPurpose": "商品销售",
    "desktop": {
      "order": [
        "copy",
        "card"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 1.48,
          "role": "copy",
          "row": 1.4,
          "rowSpan": 1,
          "span": 5.000004
        },
        {
          "column": 1,
          "role": "card",
          "row": 3,
          "rowSpan": 4,
          "span": 3.999996
        },
        {
          "column": 4.999996,
          "role": "card",
          "row": 3,
          "rowSpan": 4,
          "span": 3.999996
        },
        {
          "column": 9.000004,
          "role": "card",
          "row": 3,
          "rowSpan": 4,
          "span": 3.999996
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
          "column": 1.6,
          "role": "copy",
          "row": 1.32,
          "rowSpan": 1,
          "span": 10.8
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
    "commercialPurpose": "商品销售",
    "desktop": {
      "order": [
        "copy",
        "card"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 1.48,
          "role": "copy",
          "row": 1.4,
          "rowSpan": 1,
          "span": 11.04
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
          "column": 1.6,
          "role": "copy",
          "row": 1.32,
          "rowSpan": 1,
          "span": 10.8
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
    "commercialPurpose": "信任建立",
    "desktop": {
      "order": [
        "copy",
        "list"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 1.48,
          "role": "copy",
          "row": 1.4,
          "rowSpan": 1,
          "span": 5.000004
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
          "column": 1.6,
          "role": "copy",
          "row": 1.32,
          "rowSpan": 1,
          "span": 10.8
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
    "commercialPurpose": "内容传播",
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
          "column": 1.48,
          "role": "eyebrow",
          "row": 4.8,
          "rowSpan": 0.7,
          "span": 2.499996
        },
        {
          "column": 1.48,
          "role": "title",
          "row": 5.5,
          "rowSpan": 1.6,
          "span": 2.499996
        },
        {
          "column": 1.48,
          "role": "subtitle",
          "row": 7.1,
          "rowSpan": 0.7,
          "span": 2.499996
        },
        {
          "column": 1.48,
          "role": "action",
          "row": 7.8,
          "rowSpan": 0.6,
          "span": 2.000004
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
          "column": 1.999996,
          "role": "copy",
          "row": 6,
          "rowSpan": 2,
          "span": 9.999996
        },
        {
          "column": 4,
          "role": "action",
          "row": 8,
          "rowSpan": 1,
          "span": 5.000004
        }
      ]
    },
    "moduleType": "单图海报",
    "purpose": "单一主图与编辑式章节叙事",
    "visualRole": "feature-stage"
  },
  "storeInfo": {
    "commercialPurpose": "信任建立",
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
          "span": 6.999996
        },
        {
          "column": 8.520004,
          "role": "copy",
          "row": 1.4,
          "rowSpan": 1,
          "span": 3.999996
        },
        {
          "column": 9.000004,
          "role": "list",
          "row": 3,
          "rowSpan": 2,
          "span": 3.999996
        },
        {
          "column": 9.000004,
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
          "column": 1.6,
          "role": "copy",
          "row": 5,
          "rowSpan": 1,
          "span": 10.8
        },
        {
          "column": 1,
          "role": "list",
          "row": 6,
          "rowSpan": 1,
          "span": 12
        },
        {
          "column": 1.6,
          "role": "action",
          "row": 7,
          "rowSpan": 1,
          "span": 5.000004
        }
      ]
    },
    "moduleType": "门店信息",
    "purpose": "门店影像、地址服务与到店行动",
    "visualRole": "feature-stage"
  },
  "testimonials": {
    "commercialPurpose": "信任建立",
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
          "span": 5.000004
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
          "span": 3.999996
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
          "span": 8.000004
        }
      ]
    },
    "moduleType": "真实评价与实拍",
    "purpose": "授权实拍图片与主引语关系",
    "visualRole": "support-stage"
  },
  "textBanner": {
    "commercialPurpose": "内容传播",
    "desktop": {
      "order": [
        "copy",
        "action"
      ],
      "tone": "light",
      "zones": [
        {
          "column": 1,
          "overlay": true,
          "role": "media",
          "row": 1,
          "rowSpan": 8,
          "span": 12
        },
        {
          "column": 4.999996,
          "role": "eyebrow",
          "row": 3.6,
          "rowSpan": 0.7,
          "span": 3.999996
        },
        {
          "column": 3.000004,
          "role": "title",
          "row": 4.3,
          "rowSpan": 2,
          "span": 8.000004
        },
        {
          "column": 4,
          "role": "subtitle",
          "row": 6.3,
          "rowSpan": 0.7,
          "span": 6
        },
        {
          "column": 4.999996,
          "role": "action",
          "row": 7.4,
          "rowSpan": 0.7,
          "span": 3.999996
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
          "overlay": true,
          "role": "media",
          "row": 1,
          "rowSpan": 8,
          "span": 12
        },
        {
          "column": 1.6,
          "role": "copy",
          "row": 2,
          "rowSpan": 3,
          "span": 10.8
        },
        {
          "column": 1.6,
          "role": "action",
          "row": 6,
          "rowSpan": 1,
          "span": 5.000004
        }
      ]
    },
    "moduleType": "文字横幅",
    "purpose": "纯文字章节与单一行动位",
    "visualRole": "support-stage"
  },
  "video": {
    "commercialPurpose": "品牌展示",
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
          "column": 6.000004,
          "kind": "play",
          "overlay": true,
          "role": "marker",
          "row": 3,
          "rowSpan": 1,
          "span": 2.000004
        },
        {
          "column": 1.999996,
          "overlay": true,
          "role": "copy",
          "row": 5,
          "rowSpan": 1,
          "span": 5.000004
        },
        {
          "column": 1.999996,
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
          "column": 6.000004,
          "kind": "play",
          "overlay": true,
          "role": "marker",
          "row": 2,
          "rowSpan": 1,
          "span": 2.000004
        },
        {
          "column": 1.6,
          "role": "copy",
          "row": 5,
          "rowSpan": 2,
          "span": 10.8
        },
        {
          "column": 1.6,
          "role": "action",
          "row": 7,
          "rowSpan": 1,
          "span": 5.000004
        }
      ]
    },
    "moduleType": "视频区块",
    "purpose": "封面舞台与播放入口",
    "visualRole": "feature-stage"
  },
  "wearingInspiration": {
    "commercialPurpose": "商品销售",
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
          "span": 6.999996
        },
        {
          "column": 7.519996,
          "role": "copy",
          "row": 1.5,
          "rowSpan": 2,
          "span": 5.000004
        },
        {
          "column": 7.999996,
          "role": "detailMedia",
          "row": 3,
          "rowSpan": 6,
          "span": 5.000004
        },
        {
          "column": 7.999996,
          "role": "action",
          "row": 9.5,
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
          "column": 1.6,
          "role": "copy",
          "row": 5,
          "rowSpan": 1,
          "span": 10.8
        },
        {
          "column": 4.999996,
          "role": "detailMedia",
          "row": 6,
          "rowSpan": 2,
          "span": 8.000004
        },
        {
          "column": 1.6,
          "role": "action",
          "row": 7.68,
          "rowSpan": 1,
          "span": 5.000004
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

export function getContentTemplateDefaultGeometry(
  moduleType: string,
  viewport: "desktop" | "mobile",
) {
  return getContentTemplateContract(moduleType)?.defaultGeometryByViewport[viewport];
}

export function getContentTemplateDefaultRect(
  moduleType: string,
  nodeId: string,
  viewport: "desktop" | "mobile",
): ContentTemplateVisualRect | undefined {
  const geometry = getContentTemplateDefaultGeometry(moduleType, viewport);
  const contract = getContentTemplateContract(moduleType);
  const editableObject = findContentTemplateEditableObject(contract, nodeId);
  const directMatches = geometry?.zones.filter((zone) => zone.nodeId === nodeId) ?? [];
  const roleMatches = geometry?.zones.filter(
    (zone) => zone.roleId === editableObject?.roleId,
  ) ?? [];
  const matches = directMatches.length > 0 ? directMatches : roleMatches;
  if (matches.length === 0) return undefined;
  const left = Math.min(...matches.map((zone) => zone.rect.x));
  const top = Math.min(...matches.map((zone) => zone.rect.y));
  const right = Math.max(...matches.map((zone) => zone.rect.x + zone.rect.width));
  const bottom = Math.max(...matches.map((zone) => zone.rect.y + zone.rect.height));
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

const PERSONAL_TEMPLATE_COLOR_TOKENS = new Set([
  "#181A1B", "#5F6568", "#DDE1E2", "#F7F8F8", "#FFFFFF",
]);
const SURFACE_COLOR_PRESETS = new Set(["canvas", "mist", "inkSurface"]);
const SURFACE_PADDING_PRESETS = new Set(["compact", "standard", "spacious"]);
const SURFACE_RADIUS_PRESETS = new Set(["square", "soft", "rounded"]);
const SURFACE_SHADOW_PRESETS = new Set(["none", "soft", "lifted"]);
const INVALID_DEFAULT_CONTENT = Symbol("invalid-default-content");
const DEFAULT_CONTENT_MAX_DEPTH = 6;
const DEFAULT_CONTENT_MAX_OBJECT_KEYS = 32;
const DEFAULT_CONTENT_MAX_STRING_LENGTH = 4096;
const DEFAULT_CONTENT_MAX_SERIALIZED_LENGTH = 128 * 1024;

function isSafeDefaultContentUrl(fieldKey: string, value: string) {
  const normalized = value.trim();
  if (!normalized) return true;
  const assetField = /(?:image|poster|videoUrl)$/i.test(fieldKey);
  const linkField = /(?:linkUrl|mapUrl|link|url)$/i.test(fieldKey);
  if (!assetField && !linkField) return true;
  if (normalized.startsWith("/") && !normalized.startsWith("//")) return true;
  const lower = normalized.toLowerCase();
  return lower.startsWith("https://") || lower.startsWith("http://");
}

function sanitizeDefaultContentValue(
  value: unknown,
  fieldKey: string,
  options: { depth: number; maxStringLength: number; maxItems: number },
): ContentTemplateDefaultContentValue | typeof INVALID_DEFAULT_CONTENT {
  if (value === null) return null;
  if (typeof value === "string") {
    if (value.length > options.maxStringLength || !isSafeDefaultContentUrl(fieldKey, value)) {
      return INVALID_DEFAULT_CONTENT;
    }
    return value;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : INVALID_DEFAULT_CONTENT;
  if (typeof value === "boolean") return value;
  if (options.depth >= DEFAULT_CONTENT_MAX_DEPTH) return INVALID_DEFAULT_CONTENT;
  if (Array.isArray(value)) {
    if (value.length > options.maxItems) return INVALID_DEFAULT_CONTENT;
    const result: ContentTemplateDefaultContentValue[] = [];
    for (const item of value) {
      const sanitized = sanitizeDefaultContentValue(item, fieldKey, {
        ...options,
        depth: options.depth + 1,
        maxStringLength: DEFAULT_CONTENT_MAX_STRING_LENGTH,
      });
      if (sanitized === INVALID_DEFAULT_CONTENT) return INVALID_DEFAULT_CONTENT;
      result.push(sanitized);
    }
    return result;
  }
  if (!isRecord(value)) return INVALID_DEFAULT_CONTENT;
  const entries = Object.entries(value);
  if (entries.length > DEFAULT_CONTENT_MAX_OBJECT_KEYS) return INVALID_DEFAULT_CONTENT;
  const result: Record<string, ContentTemplateDefaultContentValue> = {};
  for (const [key, child] of entries) {
    if (
      !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(key) ||
      key === "constructor" || key === "prototype" || key === "__proto__"
    ) {
      return INVALID_DEFAULT_CONTENT;
    }
    const sanitized = sanitizeDefaultContentValue(child, key, {
      ...options,
      depth: options.depth + 1,
      maxStringLength: DEFAULT_CONTENT_MAX_STRING_LENGTH,
    });
    if (sanitized === INVALID_DEFAULT_CONTENT) return INVALID_DEFAULT_CONTENT;
    result[key] = sanitized;
  }
  return result;
}

/**
 * 账号私有模板默认内容的合同白名单入口。
 * 这里只处理 JSON 形状、数量、长度与 URL 协议；资源和商品是否属于当前账号，
 * 必须由写入服务结合 ownerId 与数据库再次校验。
 */
export function sanitizeContentTemplateDefaultContent(
  moduleType: string,
  rawContent: unknown,
): ContentTemplateDefaultContent | undefined {
  const contract = getContentTemplateContract(moduleType);
  if (!contract || !isRecord(rawContent)) return undefined;
  const editableObjects = contract.editorCapabilities.editableObjects;
  const allowedFields = new Set(editableObjects.flatMap((object) => object.contentFieldKeys));
  const result: Record<string, ContentTemplateDefaultContentValue> = {};
  for (const fieldKey of allowedFields) {
    if (!Object.prototype.hasOwnProperty.call(rawContent, fieldKey)) continue;
    const editableObject = editableObjects.find((object) => object.contentFieldKeys.includes(fieldKey));
    const reference = contract.editorCapabilities.referenceFields?.find(
      (candidate) => candidate.key === fieldKey || candidate.legacyKey === fieldKey,
    );
    const quantity = editableObject
      ? contract.roles.find((role) => role.id === editableObject.roleId)?.quantity
      : undefined;
    const sanitized = sanitizeDefaultContentValue(rawContent[fieldKey], fieldKey, {
      depth: 0,
      maxStringLength: contract.contentBudget.limits[fieldKey] ?? DEFAULT_CONTENT_MAX_STRING_LENGTH,
      maxItems: reference?.max ?? quantity?.max ?? 24,
    });
    if (sanitized !== INVALID_DEFAULT_CONTENT) result[fieldKey] = sanitized;
  }
  if (JSON.stringify(result).length > DEFAULT_CONTENT_MAX_SERIALIZED_LENGTH) return undefined;
  return result;
}

export function extractContentTemplateDefaultContent(
  moduleType: string,
  props: unknown,
) {
  return sanitizeContentTemplateDefaultContent(moduleType, props);
}

function sanitizePersonalTemplateRect(
  raw: unknown,
  constraints: ContentTemplateEditableConstraints,
  safeArea: ContentTemplateVisualRect,
  rawCompatibility?: unknown,
) {
  if (!isRecord(raw)) return undefined;
  if (
    typeof raw.x !== "number" || !Number.isFinite(raw.x)
    || typeof raw.y !== "number" || !Number.isFinite(raw.y)
    || typeof raw.width !== "number" || !Number.isFinite(raw.width)
    || typeof raw.height !== "number" || !Number.isFinite(raw.height)
  ) return undefined;
  const { x, y, width, height } = raw;
  if (width <= 0 || height <= 0) return undefined;
  const compatibility = isRecord(rawCompatibility) ? rawCompatibility : {};
  const preserveWidth = compatibility.width === CONTENT_TEMPLATE_SIZE_COMPATIBILITY_STATE
    && (width < constraints.minSize.width || width > constraints.maxSize.width);
  const preserveHeight = compatibility.height === CONTENT_TEMPLATE_SIZE_COMPATIBILITY_STATE
    && (height < constraints.minSize.height || height > constraints.maxSize.height);
  if (!preserveWidth && (width < constraints.minSize.width || width > constraints.maxSize.width)) {
    return undefined;
  }
  if (!preserveHeight && (height < constraints.minSize.height || height > constraints.maxSize.height)) {
    return undefined;
  }
  const bounds = constraints.safeAreaRequired
    ? safeArea
    : { x: 0, y: 0, width: 1, height: 1 };
  if (
    x < bounds.x || y < bounds.y
    || width > bounds.width || height > bounds.height
    || x + width > bounds.x + bounds.width + 0.0001
    || y + height > bounds.y + bounds.height + 0.0001
  ) {
    return undefined;
  }
  const normalizedCompatibility: ContentTemplateSizeCompatibility = {};
  if (preserveWidth && (width < constraints.minSize.width || width > constraints.maxSize.width)) {
    normalizedCompatibility.width = CONTENT_TEMPLATE_SIZE_COMPATIBILITY_STATE;
  }
  if (preserveHeight && (height < constraints.minSize.height || height > constraints.maxSize.height)) {
    normalizedCompatibility.height = CONTENT_TEMPLATE_SIZE_COMPATIBILITY_STATE;
  }
  return {
    rect: { x, y, width, height },
    compatibility: Object.keys(normalizedCompatibility).length
      ? normalizedCompatibility
      : undefined,
  };
}

/**
 * 账号私有模板的唯一白名单清洗入口。返回值只含布局与受控视觉属性，
 * 不会复制图片、文案、链接、商品、门店或其他业务事实。
 */
export function sanitizeContentTemplateLayoutData(
  moduleType: string,
  rawLayoutData: unknown,
): ContentTemplateInstanceOverridesV2 | undefined {
  const contract = getContentTemplateContract(moduleType);
  if (!contract || !isRecord(rawLayoutData) || rawLayoutData.version !== 2) return undefined;
  const result: ContentTemplateInstanceOverridesV2 = { version: 2 };
  const rawFrame = isRecord(rawLayoutData.frame) ? rawLayoutData.frame : {};
  const frame: NonNullable<ContentTemplateInstanceOverridesV2["frame"]> = {};
  const layoutCapabilities = contract.editorCapabilities.layoutOverrides ?? {};
  if (typeof rawFrame.heightPreset === "string" && layoutCapabilities.framePresets?.includes(rawFrame.heightPreset)) {
    frame.heightPreset = rawFrame.heightPreset;
  }
  if (typeof rawFrame.compositionPreset === "string" && layoutCapabilities.compositionPresets?.includes(rawFrame.compositionPreset)) {
    frame.compositionPreset = rawFrame.compositionPreset;
  }
  if (typeof rawFrame.colorPreset === "string" && SURFACE_COLOR_PRESETS.has(rawFrame.colorPreset)) {
    frame.colorPreset = rawFrame.colorPreset;
  }
  if (contract.flow === "flow") {
    if (typeof rawFrame.paddingPreset === "string" && SURFACE_PADDING_PRESETS.has(rawFrame.paddingPreset)) {
      frame.paddingPreset = rawFrame.paddingPreset as NonNullable<typeof frame.paddingPreset>;
    }
    if (typeof rawFrame.radiusPreset === "string" && SURFACE_RADIUS_PRESETS.has(rawFrame.radiusPreset)) {
      frame.radiusPreset = rawFrame.radiusPreset as NonNullable<typeof frame.radiusPreset>;
    }
    if (typeof rawFrame.shadowPreset === "string" && SURFACE_SHADOW_PRESETS.has(rawFrame.shadowPreset)) {
      frame.shadowPreset = rawFrame.shadowPreset as NonNullable<typeof frame.shadowPreset>;
    }
  }
  const rawRatios = isRecord(rawFrame.aspectRatioByViewport) ? rawFrame.aspectRatioByViewport : {};
  const ratioRange = layoutCapabilities.frameRatioRange ?? { min: 0.25, max: 4, step: 0.01 };
  const aspectRatioByViewport: Partial<Record<"desktop" | "mobile", number>> = {};
  for (const viewport of ["desktop", "mobile"] as const) {
    const ratio = Number(rawRatios[viewport]);
    if (Number.isFinite(ratio) && ratio >= ratioRange.min && ratio <= ratioRange.max) {
      aspectRatioByViewport[viewport] = ratio;
    }
  }
  if (Object.keys(aspectRatioByViewport).length) frame.aspectRatioByViewport = aspectRatioByViewport;
  if (Object.keys(frame).length) result.frame = frame;

  const rawNodes = isRecord(rawLayoutData.nodes) ? rawLayoutData.nodes : {};
  const nodes: NonNullable<ContentTemplateInstanceOverridesV2["nodes"]> = {};
  for (const editableObject of contract.editorCapabilities.editableObjects) {
    for (const nodeId of editableObject.nodeIds ?? [editableObject.roleId]) {
      const rawNode = rawNodes[nodeId];
      if (!isRecord(rawNode)) continue;
      const node: NonNullable<ContentTemplateInstanceOverridesV2["nodes"]>[string] = {};
      const constraints = editableObject.constraints;
      const supportsOnViewport = (
        capability: ContentTemplateEditableCapability,
        viewport: "desktop" | "mobile",
      ) => {
        if (!contentTemplateObjectHasCapability(editableObject, capability)) return false;
        const allowedViewports = editableObject.capabilityViewports?.[capability];
        return !allowedViewports || allowedViewports.includes(viewport);
      };
      if (constraints.allowHide && typeof rawNode.enabled === "boolean") node.enabled = rawNode.enabled;
      if (contentTemplateObjectHasCapability(editableObject, "layout") && isRecord(rawNode.rectByViewport)) {
        const rectByViewport: Partial<Record<"desktop" | "mobile", ContentTemplateVisualRect>> = {};
        const sizeCompatibilityByViewport: Partial<Record<"desktop" | "mobile", ContentTemplateSizeCompatibility>> = {};
        const rawCompatibilityByViewport = isRecord(rawNode.sizeCompatibilityByViewport)
          ? rawNode.sizeCompatibilityByViewport
          : {};
        for (const viewport of ["desktop", "mobile"] as const) {
          if (!supportsOnViewport("layout", viewport)) continue;
          const safeArea = contract.defaultGeometryByViewport[viewport].safeArea;
          const sanitizedRect = sanitizePersonalTemplateRect(
            rawNode.rectByViewport[viewport],
            constraints,
            safeArea,
            rawCompatibilityByViewport[viewport],
          );
          if (!sanitizedRect) continue;
          rectByViewport[viewport] = sanitizedRect.rect;
          if (sanitizedRect.compatibility) {
            sizeCompatibilityByViewport[viewport] = sanitizedRect.compatibility;
          }
        }
        if (Object.keys(rectByViewport).length) node.rectByViewport = rectByViewport;
        if (Object.keys(sizeCompatibilityByViewport).length) {
          node.sizeCompatibilityByViewport = sizeCompatibilityByViewport;
        }
      }
      if (contentTemplateObjectHasCapability(editableObject, "layer") && isRecord(rawNode.zIndexByViewport)) {
        const zIndexByViewport: Partial<Record<"desktop" | "mobile", number>> = {};
        for (const viewport of ["desktop", "mobile"] as const) {
          if (!supportsOnViewport("layer", viewport)) continue;
          const zIndex = Number(rawNode.zIndexByViewport[viewport]);
          if (Number.isInteger(zIndex) && zIndex >= constraints.layerRange.min && zIndex <= constraints.layerRange.max) {
            zIndexByViewport[viewport] = zIndex;
          }
        }
        if (Object.keys(zIndexByViewport).length) node.zIndexByViewport = zIndexByViewport;
      }
      const ratio = Number(rawNode.ratio);
      if (constraints.allowAspectRatio && Number.isFinite(ratio) && ratio >= 0.25 && ratio <= 4) node.ratio = ratio;
      const slot = layoutCapabilities.slots?.find((candidate) => candidate.roleId === nodeId);
      if (slot?.sizePresets?.includes(String(rawNode.sizePreset))) node.sizePreset = String(rawNode.sizePreset);
      if (slot?.positionPresets?.includes(String(rawNode.positionPreset))) node.positionPreset = String(rawNode.positionPreset);
      if (isRecord(rawNode.mediaView) && slot) {
        const mediaView: NonNullable<typeof node.mediaView> = {};
        if (slot.fit?.includes(rawNode.mediaView.fit as "cover" | "contain")) mediaView.fit = rawNode.mediaView.fit as "cover" | "contain";
        const zoom = Number(rawNode.mediaView.zoom);
        if (constraints.allowZoom && slot.zoom && Number.isFinite(zoom) && zoom >= slot.zoom.min && zoom <= slot.zoom.max) mediaView.zoom = zoom;
        if (constraints.allowFocus && slot.focusByViewport && isRecord(rawNode.mediaView.focusByViewport)) {
          const focusByViewport: Partial<Record<"desktop" | "mobile", { x: number; y: number }>> = {};
          for (const viewport of ["desktop", "mobile"] as const) {
            const rawFocus = rawNode.mediaView.focusByViewport[viewport];
            if (!isRecord(rawFocus)) continue;
            const x = Number(rawFocus.x);
            const y = Number(rawFocus.y);
            if (Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 100 && y >= 0 && y <= 100) focusByViewport[viewport] = { x, y };
          }
          if (Object.keys(focusByViewport).length) mediaView.focusByViewport = focusByViewport;
        }
        if (Object.keys(mediaView).length) node.mediaView = mediaView;
      }
      if (constraints.allowTypography && isRecord(rawNode.typography)) {
        const textRole = layoutCapabilities.textRoles?.find((candidate) => candidate.roleId === nodeId);
        const typography: NonNullable<typeof node.typography> = {};
        if (["xs", "sm", "md", "lg", "xl"].includes(String(rawNode.typography.sizeLevel))) typography.sizeLevel = rawNode.typography.sizeLevel as NonNullable<typeof typography.sizeLevel>;
        if (textRole?.align?.includes(rawNode.typography.align as "left" | "center" | "right")) typography.align = rawNode.typography.align as "left" | "center" | "right";
        if (typeof rawNode.typography.color === "string" && PERSONAL_TEMPLATE_COLOR_TOKENS.has(rawNode.typography.color.toUpperCase())) typography.color = rawNode.typography.color.toUpperCase();
        const maxLines = Number(rawNode.typography.maxLines);
        if (Number.isInteger(maxLines) && maxLines >= 1 && maxLines <= (textRole?.maxLines ?? 6)) typography.maxLines = maxLines;
        if (["none", "light", "dark"].includes(String(rawNode.typography.safeBand))) typography.safeBand = rawNode.typography.safeBand as "none" | "light" | "dark";
        if (Object.keys(typography).length) node.typography = typography;
      }
      if (["media", "video", "product", "collection"].includes(editableObject.kind) && isRecord(rawNode.appearance)) {
        const appearance: NonNullable<typeof node.appearance> = {};
        if (typeof rawNode.appearance.radiusPreset === "string" && SURFACE_RADIUS_PRESETS.has(rawNode.appearance.radiusPreset)) {
          appearance.radiusPreset = rawNode.appearance.radiusPreset as NonNullable<typeof appearance.radiusPreset>;
        }
        if (typeof rawNode.appearance.shadowPreset === "string" && SURFACE_SHADOW_PRESETS.has(rawNode.appearance.shadowPreset)) {
          appearance.shadowPreset = rawNode.appearance.shadowPreset as NonNullable<typeof appearance.shadowPreset>;
        }
        if (Object.keys(appearance).length) node.appearance = appearance;
      }
      if (Object.keys(node).length) nodes[nodeId] = node;
    }
  }
  if (Object.keys(nodes).length) result.nodes = nodes;
  return result;
}

export function extractContentTemplateLayoutData(
  moduleType: string,
  props: unknown,
) {
  if (!isRecord(props)) return undefined;
  return sanitizeContentTemplateLayoutData(
    moduleType,
    props.__instanceOverrides ?? { version: 2 },
  );
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

const CONTENT_TEMPLATE_PAGE_PATH_SET = new Set<string>(
  Object.values(CONTENT_TEMPLATE_PAGE_PATHS),
);

/**
 * 页面型 CTA 只允许跳转到 PageDocument 正式公开路由。
 * 查询参数用于携带筛选或上下文；片段和尾斜杠没有稳定合同，因此拒绝。
 */
export function normalizeContentTemplatePageTarget(value: unknown): string | undefined {
  if (
    typeof value !== "string"
    || !value.startsWith("/")
    || value.startsWith("//")
    || value.includes("#")
  ) {
    return undefined;
  }

  let parsed: URL;
  try {
    parsed = new URL(value, "https://haichuan.invalid");
  } catch {
    return undefined;
  }

  if (!CONTENT_TEMPLATE_PAGE_PATH_SET.has(parsed.pathname)) return undefined;
  return parsed.pathname + parsed.search;
}

export function isContentTemplatePageTarget(value: unknown): value is string {
  return normalizeContentTemplatePageTarget(value) !== undefined;
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
  visitedRoleIds: ReadonlySet<string> = new Set(),
): unknown {
  if (visitedRoleIds.has(roleId)) return undefined;
  const nextVisitedRoleIds = new Set(visitedRoleIds);
  nextVisitedRoleIds.add(roleId);

  const directValue = values[roleId];
  if (hasNonEmptyText(directValue)) return directValue;

  let compatibilityValue: unknown;
  switch (moduleType + ":" + roleId) {
    case "视频区块:coverImage":
      compatibilityValue = values.posterUrl;
      break;
    case "改款对比:before":
      compatibilityValue = values.beforeImage;
      break;
    case "改款对比:after":
      compatibilityValue = values.afterImage;
      break;
    case "佩戴灵感:wearingImage":
    case "热区图:sceneImage":
    case "门店信息:store":
      compatibilityValue = values.image;
      break;
    case "预约入口:bgImage":
      compatibilityValue = values.backgroundImage;
      break;
    case "限时活动:event":
      compatibilityValue = values.eventImage;
      break;
    case "真实评价与实拍:authorizedPhoto": {
      const testimonials = values.testimonials;
      const first = Array.isArray(testimonials) ? testimonials[0] : undefined;
      compatibilityValue = isRecord(first) ? first.image : undefined;
      break;
    }
  }
  if (hasNonEmptyText(compatibilityValue)) return compatibilityValue;

  const fallbackRoleId = getContentTemplateContract(moduleType)?.roles.find(
    (role) => role.id === roleId,
  )?.fallbackRoleId;
  return fallbackRoleId
    ? getCompatibilityRoleValue(moduleType, fallbackRoleId, values, nextVisitedRoleIds)
    : directValue;
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

/**
 * 从机器合同声明的媒体字段提取单个可见区块所引用的素材。
 * 不按属性名猜测，也不递归扫描任意字符串，避免把 alt、链接或业务字段误当素材。
 */
export function getContentTemplateMediaReferences(
  moduleType: string,
  props: unknown,
  basePath = "props",
): ContentTemplateMediaReference[] {
  const contract = getContentTemplateContract(moduleType);
  if (!contract || !isRecord(props) || props.isVisible === false) return [];
  const blockId = hasNonEmptyText(props.id) ? props.id.trim() : undefined;
  const references: ContentTemplateMediaReference[] = [];
  const append = (value: unknown, field: string, path: string, index?: number) => {
    if (!hasNonEmptyText(value)) return;
    references.push({
      url: value.trim(),
      path,
      field,
      ...(blockId ? { blockId } : {}),
      moduleType,
      ...(index === undefined ? {} : { index }),
    });
  };

  for (const object of contract.editorCapabilities.editableObjects) {
    for (const field of object.mediaFieldKeys ?? []) {
      append(props[field], field, basePath + "." + field);
    }
    for (const policy of object.collectionMediaPolicies ?? []) {
      const collection = props[policy.collectionFieldKey];
      if (!Array.isArray(collection)) continue;
      collection.forEach((item, index) => {
        if (!isRecord(item)) return;
        for (const field of policy.mediaFieldKeys) {
          append(
            item[field],
            field,
            basePath + "." + policy.collectionFieldKey + "[" + index + "]." + field,
            index,
          );
        }
      });
    }
  }

  const seen = new Set<string>();
  return references.filter((reference) => {
    const key = reference.path + "\u0000" + reference.url;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * 从机器合同提取公开 Renderer 会消费的行动目标。
 * 顶层行动字段由 action editableObject 派生；集合条目只处理显式声明的
 * collectionLinkPolicies，避免按属性名递归猜测业务去向。
 */
export function getContentTemplateLinkTargetReferences(
  moduleType: string,
  props: unknown,
  basePath = "props",
): ContentTemplateLinkTargetReference[] {
  const contract = getContentTemplateContract(moduleType);
  if (!contract || !isRecord(props) || props.isVisible === false) return [];
  const blockId = hasNonEmptyText(props.id) ? props.id.trim() : undefined;
  const references: ContentTemplateLinkTargetReference[] = [];
  const append = (
    values: Record<string, unknown>,
    path: string,
    field: string,
    required: boolean,
    prefix = "",
    actionTextFieldKey?: string,
    legacyLinkFieldKey?: string,
    index?: number,
  ) => {
    const targetTypeFieldKey = prefix ? prefix + "TargetType" : "targetType";
    const productCodeFieldKey = prefix ? prefix + "ProductCode" : "productCode";
    const productIdFieldKey = prefix ? prefix + "ProductId" : "productId";
    const categorySlugFieldKey = prefix ? prefix + "CategorySlug" : "categorySlug";
    const linkUrlFieldKey = prefix ? prefix + "LinkUrl" : "linkUrl";
    references.push({
      path,
      field,
      required,
      targetTypeFieldKey,
      productCodeFieldKey,
      productIdFieldKey,
      categorySlugFieldKey,
      linkUrlFieldKey,
      ...(legacyLinkFieldKey ? { legacyLinkFieldKey } : {}),
      ...(actionTextFieldKey ? { actionTextFieldKey } : {}),
      targetType: values[targetTypeFieldKey],
      productCode: values[productCodeFieldKey],
      productId: values[productIdFieldKey],
      categorySlug: values[categorySlugFieldKey],
      linkUrl: values[linkUrlFieldKey],
      ...(legacyLinkFieldKey ? { legacyLink: values[legacyLinkFieldKey] } : {}),
      ...(actionTextFieldKey ? { actionText: values[actionTextFieldKey] } : {}),
      ...(blockId ? { blockId } : {}),
      moduleType,
      ...(index === undefined ? {} : { index }),
    });
  };

  for (const object of contract.editorCapabilities.editableObjects) {
    if (object.kind === "action") {
      const targetTypeFieldKey = object.contentFieldKeys.find(
        (field) => field === "targetType" || field.endsWith("TargetType"),
      );
      if (targetTypeFieldKey) {
        const prefix = targetTypeFieldKey === "targetType"
          ? ""
          : targetTypeFieldKey.slice(0, -"TargetType".length);
        const actionTextFieldKey = prefix
          ? prefix + "Text"
          : object.contentFieldKeys.find(
              (field) => field === "actionText" || field === "buttonText",
            );
        if (actionTextFieldKey) {
          append(
            props,
            basePath,
            actionTextFieldKey,
            hasNonEmptyText(props[actionTextFieldKey]),
            prefix,
            actionTextFieldKey,
          );
        }
      }
    }
    for (const policy of object.collectionLinkPolicies ?? []) {
      const collection = props[policy.collectionFieldKey];
      if (!Array.isArray(collection)) continue;
      collection.forEach((item, index) => {
        append(
          isRecord(item) ? item : {},
          basePath + "." + policy.collectionFieldKey + "[" + index + "]",
          policy.collectionFieldKey,
          policy.required,
          "",
          undefined,
          "link",
          index,
        );
      });
    }
  }

  return references;
}

/** 当前 PageDocument 会进入公开页面的唯一素材 URL 集合（含 ogImage）。 */
export function getPageDocumentMediaReferences(
  puckData: unknown,
  metadata?: unknown,
  pageKey?: string,
): ContentTemplateMediaReference[] {
  const references: ContentTemplateMediaReference[] = [];
  if (isRecord(metadata) && hasNonEmptyText(metadata.ogImage)) {
    references.push({
      url: metadata.ogImage.trim(),
      path: "metadata.ogImage",
      field: "ogImage",
    });
  }
  if (isRecord(puckData)) {
    const collectBlocks = (blocks: unknown, basePath: string) => {
      if (!Array.isArray(blocks)) return;
      blocks.forEach((block, index) => {
        if (!isRecord(block) || typeof block.type !== "string") return;
        references.push(
          ...getContentTemplateMediaReferences(
            block.type,
            block.props,
            basePath + "[" + index + "].props",
          ),
        );
      });
    };
    collectBlocks(puckData.content, "content");
    const pageRule = pageKey ? getContentTemplatePageRule(pageKey) : undefined;
    if (pageRule?.contentPlacement !== "root-only" && isRecord(puckData.zones)) {
      for (const [zoneKey, blocks] of Object.entries(puckData.zones)) {
        collectBlocks(blocks, "zones." + zoneKey);
      }
    }
  }

  const seenUrls = new Set<string>();
  return references.filter((reference) => {
    if (seenUrls.has(reference.url)) return false;
    seenUrls.add(reference.url);
    return true;
  });
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
  const issue = (
    message: string,
    path = basePath,
    field?: string,
    severity: ContentTemplateIssue["severity"] =
      isRecord(overrides) && (overrides as Record<string, unknown>).version === 2
        ? "error"
        : "warning",
  ): ContentTemplateIssue => ({
    code: "page-validation",
    severity,
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
      const sizeCompatibilityByViewport = isRecord(rawNode.sizeCompatibilityByViewport)
        ? rawNode.sizeCompatibilityByViewport
        : {};
      if (rawNode.sizeCompatibilityByViewport !== undefined && !isRecord(rawNode.sizeCompatibilityByViewport)) {
        issues.push(issue("节点尺寸兼容状态格式无效。", path + ".sizeCompatibilityByViewport", nodeId));
      }
      for (const [viewport, rawCompatibility] of Object.entries(sizeCompatibilityByViewport)) {
        const compatibilityPath = path + ".sizeCompatibilityByViewport." + viewport;
        if (!["desktop", "mobile"].includes(viewport) || !isRecord(rawCompatibility)) {
          issues.push(issue("节点设备尺寸兼容状态格式无效。", compatibilityPath, nodeId));
          continue;
        }
        for (const [axis, value] of Object.entries(rawCompatibility)) {
          if (!["width", "height"].includes(axis) || value !== CONTENT_TEMPLATE_SIZE_COMPATIBILITY_STATE) {
            issues.push(issue("节点尺寸兼容状态只允许 preserve-until-resize 的宽高轴。", compatibilityPath + "." + axis, nodeId));
          }
        }
        const viewportRects = isRecord(rawNode.rectByViewport) ? rawNode.rectByViewport : {};
        if (!isRecord(viewportRects[viewport])) {
          issues.push(issue("节点尺寸兼容状态必须与同设备矩形同时存在。", compatibilityPath, nodeId));
        }
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
            const { x, y, width, height } = rawRect;
            if (
              typeof x !== "number" || !Number.isFinite(x)
              || typeof y !== "number" || !Number.isFinite(y)
              || typeof width !== "number" || !Number.isFinite(width)
              || typeof height !== "number" || !Number.isFinite(height)
              || x < 0 || y < 0 || width <= 0 || height <= 0
              || x + width > 1.0001 || y + height > 1.0001
            ) {
              issues.push(issue("节点必须完整位于画面 0–1 的归一化范围内。", rectPath, nodeId));
            } else {
              const constraints = editableObject.constraints;
              const safeArea = input.contract.defaultGeometryByViewport[viewport as "desktop" | "mobile"].safeArea;
              const bounds = constraints.safeAreaRequired ? safeArea : { x: 0, y: 0, width: 1, height: 1 };
              const rawCompatibility = isRecord(sizeCompatibilityByViewport[viewport])
                ? sizeCompatibilityByViewport[viewport]
                : {};
              const preserveWidth = rawCompatibility.width === CONTENT_TEMPLATE_SIZE_COMPATIBILITY_STATE;
              const preserveHeight = rawCompatibility.height === CONTENT_TEMPLATE_SIZE_COMPATIBILITY_STATE;
              if (preserveWidth && width >= constraints.minSize.width && width <= constraints.maxSize.width) {
                issues.push(issue("宽度已满足当前约束，不应保留尺寸兼容状态。", path + ".sizeCompatibilityByViewport." + viewport + ".width", nodeId));
              }
              if (preserveHeight && height >= constraints.minSize.height && height <= constraints.maxSize.height) {
                issues.push(issue("高度已满足当前约束，不应保留尺寸兼容状态。", path + ".sizeCompatibilityByViewport." + viewport + ".height", nodeId));
              }
              if (
                (!preserveWidth && (width < constraints.minSize.width || width > constraints.maxSize.width)) ||
                (!preserveHeight && (height < constraints.minSize.height || height > constraints.maxSize.height)) ||
                x < bounds.x || y < bounds.y || x + width > bounds.x + bounds.width + 0.0001 || y + height > bounds.y + bounds.height + 0.0001
              ) {
                issues.push(issue("节点位置、尺寸或兼容状态超出允许范围。", rectPath, nodeId));
              }
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
            issues.push(issue("安全文字带值无效。", path + ".typography.safeBand", nodeId, "error"));
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
        issues.push(issue("已启用的文字角色必须填写内容。", contentPath, nodeId, "error"));
      }
      if (roleVisible && roleHasVisualOverride && textCapability?.requiresSafeBand) {
        const typography = isRecord(rawNode.typography) ? rawNode.typography : {};
        if (typography.safeBand !== "light" && typography.safeBand !== "dark") {
          issues.push(issue(
            "图片叠字需选择浅色或深色安全文字带后才能发布。",
            path + ".typography.safeBand",
            nodeId,
            "error",
          ));
        }
      }
    }
    for (const editableObject of input.contract.editorCapabilities.editableObjects) {
      const role = input.contract.roles.find((candidate) => candidate.id === editableObject.roleId);
      if (!role?.required) continue;
      for (const nodeId of editableObject.nodeIds ?? [editableObject.roleId]) {
        const rawNode = nodes[nodeId];
        if (isRecord(rawNode) && rawNode.enabled === false) {
          issues.push(issue(
            "必需对象不能隐藏。",
            basePath + ".nodes." + nodeId + ".enabled",
            nodeId,
            "error",
          ));
        }
      }
    }
    for (const viewport of ["desktop", "mobile"] as const) {
      const explicitRects = Object.entries(nodes).flatMap(([nodeId, rawNode]) => {
        if (!isRecord(rawNode) || rawNode.enabled === false || !isRecord(rawNode.rectByViewport)) return [];
        const rawRect = rawNode.rectByViewport[viewport];
        if (!isRecord(rawRect)) return [];
        const { x, y, width, height } = rawRect;
        if (
          typeof x !== "number" || !Number.isFinite(x)
          || typeof y !== "number" || !Number.isFinite(y)
          || typeof width !== "number" || !Number.isFinite(width)
          || typeof height !== "number" || !Number.isFinite(height)
          || width <= 0 || height <= 0
        ) return [];
        const rect = { x, y, width, height };
        const editableObject = findContentTemplateEditableObject(input.contract, nodeId);
        if (!editableObject) return [];
        const zByViewport = isRecord(rawNode.zIndexByViewport) ? rawNode.zIndexByViewport : {};
        return [{
          nodeId,
          rect,
          zIndex: Number.isInteger(Number(zByViewport[viewport])) ? Number(zByViewport[viewport]) : 2,
          editableObject,
        }];
      });
      for (let index = 0; index < explicitRects.length; index += 1) {
        for (let otherIndex = index + 1; otherIndex < explicitRects.length; otherIndex += 1) {
          const left = explicitRects[index];
          const right = explicitRects[otherIndex];
          if (left.editableObject === right.editableObject) continue;
          const intersectionWidth = Math.min(left.rect.x + left.rect.width, right.rect.x + right.rect.width) - Math.max(left.rect.x, right.rect.x);
          const intersectionHeight = Math.min(left.rect.y + left.rect.height, right.rect.y + right.rect.height) - Math.max(left.rect.y, right.rect.y);
          if (intersectionWidth <= 0 || intersectionHeight <= 0) continue;
          const action = left.editableObject.kind === "action"
            ? left
            : right.editableObject.kind === "action"
              ? right
              : undefined;
          const cover = action === left ? right : left;
          const actionHasContent = action?.editableObject.contentFieldKeys.some((fieldKey) => {
            const value = input.props[fieldKey];
            return typeof value === "string" && value.trim().length > 0;
          });
          const fullyCovered = Boolean(action && actionHasContent && cover.zIndex > action.zIndex &&
            cover.rect.x <= action.rect.x && cover.rect.y <= action.rect.y &&
            cover.rect.x + cover.rect.width >= action.rect.x + action.rect.width &&
            cover.rect.y + cover.rect.height >= action.rect.y + action.rect.height);
          issues.push(issue(
            fullyCovered
              ? "行动对象被更高层对象完全遮挡，无法形成有效交互区域。"
              : "对象存在自定义重叠；请在真实画布检查裁切、文字拥挤与可读性。",
            basePath + ".nodes." + (action?.nodeId ?? left.nodeId) + ".rectByViewport." + viewport,
            action?.nodeId ?? left.nodeId,
            fullyCovered ? "error" : "warning",
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
      issues.push(issue("图片叠字需选择浅色或深色安全文字带后才能发布。", path + ".safeBand", roleId, "error"));
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
        code: "content-template-legacy",
        severity: "warning",
        message: "历史实例未携带版本印记；已按当前合同保留合法覆盖并安全回退不合法部分。",
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
    if (markerVersion < contract.version && markerVersion >= 1) {
      return [{
        ...base,
        code: "content-template-legacy",
        severity: "info",
        message: "历史模板已自动采用当前默认构图；合法实例覆盖继续保留，不合法部分使用安全回退。",
      }, ...overrideIssues];
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
  const isRequiredContentHidden = (fieldKey: string) => {
    const editableObjects = contract.editorCapabilities.editableObjects.filter((object) =>
      object.contentFieldKeys.includes(fieldKey),
    );
    if (editableObjects.length === 0) return false;
    const overrides = isRecord(values.__instanceOverrides)
      ? values.__instanceOverrides
      : {};
    return editableObjects.every((object) => {
      if (!object.capabilities.includes("visibility") || !object.constraints.allowHide) {
        return false;
      }
      const leafNodeIds = (object.nodeIds ?? []).filter((nodeId) => nodeId !== object.roleId);
      const overrideNodeIds = leafNodeIds.includes(fieldKey)
        ? [fieldKey]
        : leafNodeIds.length > 0
          ? leafNodeIds
          : [object.roleId];
      if (overrides.version === 2) {
        const nodes = isRecord(overrides.nodes) ? overrides.nodes : {};
        return overrideNodeIds.every((nodeId) => {
          const node = isRecord(nodes[nodeId]) ? nodes[nodeId] : {};
          return node.enabled === false;
        });
      }
      const textRoles = isRecord(overrides.textRoles) ? overrides.textRoles : {};
      return overrideNodeIds.every((nodeId) => {
        const textRole = isRecord(textRoles[nodeId]) ? textRoles[nodeId] : {};
        return textRole.enabled === false;
      });
    });
  };
  const missingMedia = contract.media
    .filter((slot) =>
      slot.required &&
      !hasNonEmptyText(getCompatibilityRoleValue(moduleType, slot.key, values)))
    .map((slot) => slot.key);
  const missingRequiredAltText = contract.editorCapabilities.editableObjects.flatMap((object) => {
    if (object.altPolicy !== "required" || !object.altFieldKey) return [];
    const mediaValue = getCompatibilityRoleValue(moduleType, object.roleId, values);
    return hasNonEmptyText(mediaValue) && !hasNonEmptyText(values[object.altFieldKey])
      ? [object.altFieldKey]
      : [];
  });
  const missingText = [...new Set([
    ...contract.contentBudget.requiredText.filter((key) =>
      !hasNonEmptyText(values[key]) && !isRequiredContentHidden(key),
    ),
    ...missingRequiredAltText,
  ])];
  const missingCollectionAltText = contract.editorCapabilities.editableObjects.flatMap((object) =>
    (object.collectionMediaPolicies ?? []).flatMap((policy) => {
      const altPolicy = policy.altPolicy;
      if (altPolicy !== "required" && altPolicy !== "derived") return [];
      const collection = values[policy.collectionFieldKey];
      if (!Array.isArray(collection)) return [];
      const altFieldKey = altPolicy === "required"
        ? policy.altFieldKey
        : policy.derivedAltFieldKey;
      if (!altFieldKey) return [];
      return collection.flatMap((item, index) => {
        if (!isRecord(item)) return [];
        const hasMedia = policy.mediaFieldKeys.some((field) => hasNonEmptyText(item[field]));
        return hasMedia && !hasNonEmptyText(item[altFieldKey])
          ? [{
              roleId: object.roleId,
              collectionFieldKey: policy.collectionFieldKey,
              altFieldKey,
              altPolicy,
              index,
            }]
          : [];
      });
    }),
  );
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
    content: {
      complete: missingText.length === 0 && missingCollectionAltText.length === 0,
      missing: missingText,
      missingCollectionAltText,
    },
    collections: { complete: invalidCollections.length === 0, invalid: invalidCollections },
    attestations: { complete: missingAttestations.length === 0, missing: missingAttestations },
    publish: {
      complete: !issues.some((issue) => issue.severity === "error"),
      issues,
    },
  };
}
