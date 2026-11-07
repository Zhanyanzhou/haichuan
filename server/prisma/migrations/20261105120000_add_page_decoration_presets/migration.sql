-- Immutable v1 snapshots from launchTemplateSet.ts (D.53).
-- Add three ownerless system templates without touching existing templates or pages.
START TRANSACTION;

-- page-hero (v1)
INSERT INTO `dynamic_templates`
  (`template_id`, `source_type`, `visibility`, `status`, `name`, `category`, `purpose`, `layout_type`,
   `description`, `slot_summary`, `recommended_for`, `tags`, `definition_schema_version`, `published_version`,
   `source_reference`, `updated_at`)
VALUES ('tpl_launch_page_hero', 'SYSTEM', 'STAFF', 'ACTIVE', '首页首屏', '首发母版', '页面首屏', '全幅图片 + 内容覆盖', '全幅主视觉承载页面级标题与主行动；手机把文字排进图片槽位下半。', '2 个图片槽位，3 个内容槽位', '["home"]', '["首发母版","页面首屏"]', 3, 1, 'launch-page-preset:v1', CURRENT_TIMESTAMP(3));

INSERT INTO `dynamic_template_versions`
  (`dynamic_template_id`, `version`, `schema_version`, `definition`, `definition_checksum`)
VALUES (LAST_INSERT_ID(), 1, 3,
'{
  "schemaVersion": 3,
  "templateId": "tpl_launch_page_hero",
  "name": "首页首屏",
  "description": "全幅主视觉承载页面级标题与主行动；手机把文字排进图片槽位下半。",
  "metadata": {
    "category": "首发母版",
    "purpose": "页面首屏",
    "layoutType": "全幅图片 + 内容覆盖",
    "slotSummary": "2 个图片槽位，3 个内容槽位",
    "recommendedFor": [
      "home"
    ],
    "desktopRatio": "16:9",
    "mobileRatio": "auto",
    "previewDesktopWidth": 1440,
    "previewMobileWidth": 390,
    "mobileBreakpoint": 767,
    "minViewportWidth": 320,
    "maxViewportWidth": 1920,
    "defaultBackgroundToken": "surface",
    "visualRole": "primary-stage",
    "headerCompatibility": [
      "solid",
      "overlay-light"
    ],
    "tags": [
      "首发母版",
      "页面首屏"
    ],
    "sectionRole": "page-hero",
    "geometryPolicy": "hero-media-frame"
  },
  "rootNodeId": "tpl_launch_page_hero_root",
  "nodes": {
    "tpl_launch_page_hero_node_background": {
      "nodeId": "tpl_launch_page_hero_node_background",
      "type": "ImageSlot",
      "name": "背景图",
      "slotId": "tpl_launch_page_hero_slot_heroBackground",
      "childIds": [],
      "props": {},
      "instanceEditPolicy": {
        "position": false,
        "size": false,
        "zIndex": false,
        "imageFit": true,
        "imageFocus": true,
        "typography": false,
        "spacing": false,
        "minWidthPercent": 25,
        "maxWidthPercent": 150,
        "maxOffsetPercent": 30,
        "minFontSizePx": 12,
        "maxFontSizePx": 96,
        "maxSpacingPx": 120
      },
      "responsive": {
        "desktop": {
          "display": "block",
          "order": 0,
          "width": "fill",
          "height": {
            "mode": "auto"
          },
          "placement": {
            "x": 0,
            "y": 0,
            "width": 1,
            "height": 1,
            "zIndex": 0
          },
          "radius": {
            "value": 0,
            "unit": "px"
          }
        },
        "mobile": {
          "placement": null,
          "width": "fill"
        }
      },
      "hidden": false
    },
    "tpl_launch_page_hero_node_logo": {
      "nodeId": "tpl_launch_page_hero_node_logo",
      "type": "ImageSlot",
      "name": "Logo",
      "slotId": "tpl_launch_page_hero_slot_logo",
      "childIds": [],
      "props": {},
      "instanceEditPolicy": {
        "position": false,
        "size": false,
        "zIndex": false,
        "imageFit": true,
        "imageFocus": true,
        "typography": false,
        "spacing": false,
        "minWidthPercent": 25,
        "maxWidthPercent": 150,
        "maxOffsetPercent": 30,
        "minFontSizePx": 12,
        "maxFontSizePx": 96,
        "maxSpacingPx": 120
      },
      "responsive": {
        "desktop": {
          "display": "block",
          "order": 0,
          "width": {
            "value": 132,
            "unit": "px"
          },
          "height": {
            "mode": "auto"
          },
          "minHeight": {
            "value": 44,
            "unit": "px"
          }
        },
        "mobile": {
          "width": {
            "value": 104,
            "unit": "px"
          },
          "minHeight": {
            "value": 0,
            "unit": "px"
          }
        }
      },
      "hidden": false
    },
    "tpl_launch_page_hero_node_title": {
      "nodeId": "tpl_launch_page_hero_node_title",
      "type": "HeadingSlot",
      "name": "页面主标题",
      "slotId": "tpl_launch_page_hero_slot_title",
      "childIds": [],
      "props": {},
      "instanceEditPolicy": {
        "position": false,
        "size": false,
        "zIndex": false,
        "imageFit": false,
        "imageFocus": false,
        "typography": false,
        "spacing": false,
        "minWidthPercent": 25,
        "maxWidthPercent": 150,
        "maxOffsetPercent": 30,
        "minFontSizePx": 12,
        "maxFontSizePx": 96,
        "maxSpacingPx": 120
      },
      "responsive": {
        "desktop": {
          "display": "block",
          "order": 0,
          "width": "fill",
          "height": {
            "mode": "auto"
          },
          "maxWidth": {
            "value": 1080,
            "unit": "px"
          }
        },
        "mobile": {}
      },
      "hidden": false
    },
    "tpl_launch_page_hero_node_subtitle": {
      "nodeId": "tpl_launch_page_hero_node_subtitle",
      "type": "TextSlot",
      "name": "副标题",
      "slotId": "tpl_launch_page_hero_slot_subtitle",
      "childIds": [],
      "props": {},
      "instanceEditPolicy": {
        "position": false,
        "size": false,
        "zIndex": false,
        "imageFit": false,
        "imageFocus": false,
        "typography": false,
        "spacing": false,
        "minWidthPercent": 25,
        "maxWidthPercent": 150,
        "maxOffsetPercent": 30,
        "minFontSizePx": 12,
        "maxFontSizePx": 96,
        "maxSpacingPx": 120
      },
      "responsive": {
        "desktop": {
          "display": "block",
          "order": 0,
          "width": "fill",
          "height": {
            "mode": "auto"
          },
          "maxWidth": {
            "value": 760,
            "unit": "px"
          }
        },
        "mobile": {}
      },
      "hidden": false
    },
    "tpl_launch_page_hero_node_action": {
      "nodeId": "tpl_launch_page_hero_node_action",
      "type": "ButtonSlot",
      "name": "主行动",
      "slotId": "tpl_launch_page_hero_slot_primaryAction",
      "childIds": [],
      "props": {},
      "instanceEditPolicy": {
        "position": false,
        "size": false,
        "zIndex": false,
        "imageFit": false,
        "imageFocus": false,
        "typography": false,
        "spacing": false,
        "minWidthPercent": 25,
        "maxWidthPercent": 150,
        "maxOffsetPercent": 30,
        "minFontSizePx": 12,
        "maxFontSizePx": 96,
        "maxSpacingPx": 120
      },
      "responsive": {
        "desktop": {
          "display": "block",
          "order": 0,
          "width": "fit",
          "height": {
            "mode": "auto"
          },
          "backgroundColor": "#F7F8F8",
          "radius": {
            "value": 0,
            "unit": "px"
          },
          "padding": {
            "top": {
              "value": 16,
              "unit": "px"
            },
            "right": {
              "value": 32,
              "unit": "px"
            },
            "bottom": {
              "value": 16,
              "unit": "px"
            },
            "left": {
              "value": 32,
              "unit": "px"
            }
          }
        },
        "mobile": {}
      },
      "hidden": false
    },
    "tpl_launch_page_hero_node_foreground": {
      "nodeId": "tpl_launch_page_hero_node_foreground",
      "type": "Container",
      "name": "前景",
      "childIds": [
        "tpl_launch_page_hero_node_logo",
        "tpl_launch_page_hero_node_title",
        "tpl_launch_page_hero_node_subtitle",
        "tpl_launch_page_hero_node_action"
      ],
      "props": {},
      "responsive": {
        "desktop": {
          "display": "flex",
          "order": 0,
          "width": "fill",
          "height": {
            "mode": "auto"
          },
          "direction": "column",
          "alignItems": "center",
          "justifyContent": "end",
          "gap": {
            "value": 16,
            "unit": "px"
          },
          "padding": {
            "top": {
              "value": 0,
              "unit": "px"
            },
            "right": {
              "value": 8,
              "unit": "%"
            },
            "bottom": {
              "value": 96,
              "unit": "px"
            },
            "left": {
              "value": 8,
              "unit": "%"
            }
          },
          "placement": {
            "x": 0,
            "y": 0.3,
            "width": 1,
            "height": 0.7,
            "zIndex": 2
          }
        },
        "mobile": {
          "placement": null,
          "justifyContent": "start",
          "gap": {
            "value": 16,
            "unit": "px"
          },
          "padding": {
            "top": {
              "value": 24,
              "unit": "px"
            },
            "right": {
              "value": 20,
              "unit": "px"
            },
            "bottom": {
              "value": 40,
              "unit": "px"
            },
            "left": {
              "value": 20,
              "unit": "px"
            }
          }
        }
      },
      "hidden": false
    },
    "tpl_launch_page_hero_node_stage": {
      "nodeId": "tpl_launch_page_hero_node_stage",
      "type": "Stack",
      "name": "主舞台",
      "childIds": [
        "tpl_launch_page_hero_node_background",
        "tpl_launch_page_hero_node_foreground"
      ],
      "props": {},
      "responsive": {
        "desktop": {
          "display": "flex",
          "direction": "column",
          "order": 0,
          "width": "fill",
          "height": {
            "mode": "aspect-ratio",
            "ratio": {
              "width": 16,
              "height": 9
            }
          },
          "layoutMode": "free",
          "minHeight": {
            "value": 560,
            "unit": "px"
          },
          "backgroundColor": "#111315",
          "padding": {
            "top": {
              "value": 0,
              "unit": "px"
            },
            "right": {
              "value": 0,
              "unit": "px"
            },
            "bottom": {
              "value": 0,
              "unit": "px"
            },
            "left": {
              "value": 0,
              "unit": "px"
            }
          }
        },
        "mobile": {
          "layoutMode": "flow",
          "height": {
            "mode": "auto"
          },
          "minHeight": {
            "value": 0,
            "unit": "px"
          },
          "padding": {
            "top": {
              "value": 0,
              "unit": "px"
            },
            "right": {
              "value": 0,
              "unit": "px"
            },
            "bottom": {
              "value": 0,
              "unit": "px"
            },
            "left": {
              "value": 0,
              "unit": "px"
            }
          }
        }
      },
      "hidden": false
    },
    "tpl_launch_page_hero_root": {
      "nodeId": "tpl_launch_page_hero_root",
      "type": "Section",
      "name": "页面首屏",
      "childIds": [
        "tpl_launch_page_hero_node_stage"
      ],
      "props": {},
      "responsive": {
        "desktop": {
          "display": "block",
          "order": 0,
          "width": "fill",
          "height": {
            "mode": "auto"
          },
          "layoutMode": "flow"
        },
        "mobile": {}
      },
      "hidden": false
    }
  },
  "slots": {
    "tpl_launch_page_hero_slot_heroBackground": {
      "slotId": "tpl_launch_page_hero_slot_heroBackground",
      "key": "heroBackground",
      "type": "image",
      "label": "背景图",
      "required": false,
      "editable": true,
      "hideable": true,
      "validation": {},
      "desktopRules": {
        "aspectRatio": "16:9",
        "objectFit": "cover",
        "objectPosition": "center center"
      },
      "mobileRules": {
        "aspectRatio": "9:16",
        "objectFit": "cover",
        "objectPosition": "center center"
      },
      "semanticRole": "backgroundImage",
      "emptyPolicy": "hide"
    },
    "tpl_launch_page_hero_slot_logo": {
      "slotId": "tpl_launch_page_hero_slot_logo",
      "key": "logo",
      "type": "image",
      "label": "Logo",
      "required": false,
      "editable": true,
      "hideable": true,
      "validation": {},
      "desktopRules": {
        "aspectRatio": "3:1",
        "objectFit": "contain",
        "objectPosition": "center center"
      },
      "mobileRules": {
        "aspectRatio": "3:1",
        "objectFit": "contain",
        "objectPosition": "center center"
      },
      "semanticRole": "logo",
      "emptyPolicy": "hide"
    },
    "tpl_launch_page_hero_slot_title": {
      "slotId": "tpl_launch_page_hero_slot_title",
      "key": "title",
      "type": "heading",
      "label": "页面主标题",
      "required": false,
      "editable": true,
      "hideable": true,
      "validation": {},
      "desktopRules": {
        "fontFamily": "serif",
        "fontRole": "display",
        "fontSize": {
          "value": 68,
          "unit": "px"
        },
        "fontWeight": 300,
        "lineHeight": 1.3,
        "textAlign": "center",
        "overflow": "wrap",
        "color": "#F7F8F8"
      },
      "mobileRules": {
        "fontSize": {
          "value": 40,
          "unit": "px"
        }
      },
      "emptyPolicy": "hide"
    },
    "tpl_launch_page_hero_slot_subtitle": {
      "slotId": "tpl_launch_page_hero_slot_subtitle",
      "key": "subtitle",
      "type": "text",
      "label": "副标题",
      "required": false,
      "editable": true,
      "hideable": true,
      "validation": {},
      "desktopRules": {
        "fontFamily": "system",
        "fontRole": "body",
        "fontSize": {
          "value": 20,
          "unit": "px"
        },
        "fontWeight": 400,
        "lineHeight": 1.4,
        "textAlign": "center",
        "overflow": "wrap",
        "color": "#F7F8F8",
        "maxLines": 3
      },
      "mobileRules": {
        "fontSize": {
          "value": 18,
          "unit": "px"
        }
      },
      "emptyPolicy": "hide"
    },
    "tpl_launch_page_hero_slot_primaryAction": {
      "slotId": "tpl_launch_page_hero_slot_primaryAction",
      "key": "primaryAction",
      "type": "button",
      "label": "主行动",
      "required": false,
      "editable": true,
      "hideable": true,
      "validation": {},
      "desktopRules": {
        "fontFamily": "system",
        "fontRole": "action",
        "fontSize": {
          "value": 16,
          "unit": "px"
        },
        "fontWeight": 400,
        "lineHeight": 1.75,
        "textAlign": "center",
        "overflow": "wrap",
        "color": "#181A1B"
      },
      "mobileRules": {
        "fontSize": {
          "value": 15,
          "unit": "px"
        }
      },
      "emptyPolicy": "hide"
    }
  },
  "defaultContent": {},
  "previewContent": {}
}',
  'd8a920f546c9045df1aa4623ca64061a9b9e1d6a4713a668e74d76ca1e954459');

-- creation-grid (v1)
INSERT INTO `dynamic_templates`
  (`template_id`, `source_type`, `visibility`, `status`, `name`, `category`, `purpose`, `layout_type`,
   `description`, `slot_summary`, `recommended_for`, `tags`, `definition_schema_version`, `published_version`,
   `source_reference`, `updated_at`)
VALUES ('tpl_launch_creation_grid', 'SYSTEM', 'STAFF', 'ACTIVE', '作品网格', '首发母版', '作品网格', '卡片式布局', '下接四格等宽作品；卡比例两端不变。桌面四列一行，手机两列两行。标题与说明默认不显示，可在模板属性中打开。', '4 个图片槽位，2 个内容槽位', '["home","products"]', '["首发母版","作品网格"]', 3, 1, 'launch-page-preset:v1', CURRENT_TIMESTAMP(3));

INSERT INTO `dynamic_template_versions`
  (`dynamic_template_id`, `version`, `schema_version`, `definition`, `definition_checksum`)
VALUES (LAST_INSERT_ID(), 1, 3,
'{
  "schemaVersion": 3,
  "templateId": "tpl_launch_creation_grid",
  "name": "作品网格",
  "description": "下接四格等宽作品；卡比例两端不变。桌面四列一行，手机两列两行。标题与说明默认不显示，可在模板属性中打开。",
  "metadata": {
    "category": "首发母版",
    "purpose": "作品网格",
    "layoutType": "卡片式布局",
    "slotSummary": "4 个图片槽位，2 个内容槽位",
    "recommendedFor": [
      "home",
      "products"
    ],
    "desktopRatio": "4:5",
    "mobileRatio": "auto",
    "previewDesktopWidth": 1440,
    "previewMobileWidth": 390,
    "mobileBreakpoint": 767,
    "minViewportWidth": 320,
    "maxViewportWidth": 1920,
    "defaultBackgroundToken": "surface",
    "visualRole": "feature-stage",
    "headerCompatibility": [
      "solid"
    ],
    "tags": [
      "首发母版",
      "作品网格"
    ],
    "sectionRole": "creation-grid",
    "geometryPolicy": "hero-media-frame"
  },
  "rootNodeId": "tpl_launch_creation_grid_root",
  "nodes": {
    "tpl_launch_creation_grid_node_title": {
      "nodeId": "tpl_launch_creation_grid_node_title",
      "type": "HeadingSlot",
      "name": "主标题",
      "slotId": "tpl_launch_creation_grid_slot_title",
      "childIds": [],
      "props": {},
      "instanceEditPolicy": {
        "position": false,
        "size": false,
        "zIndex": false,
        "imageFit": false,
        "imageFocus": false,
        "typography": false,
        "spacing": false,
        "minWidthPercent": 25,
        "maxWidthPercent": 150,
        "maxOffsetPercent": 30,
        "minFontSizePx": 12,
        "maxFontSizePx": 96,
        "maxSpacingPx": 120
      },
      "responsive": {
        "desktop": {
          "display": "block",
          "order": 0,
          "width": "fill",
          "height": {
            "mode": "auto"
          },
          "maxWidth": {
            "value": 900,
            "unit": "px"
          }
        },
        "mobile": {}
      },
      "hidden": false
    },
    "tpl_launch_creation_grid_node_description": {
      "nodeId": "tpl_launch_creation_grid_node_description",
      "type": "TextSlot",
      "name": "描述",
      "slotId": "tpl_launch_creation_grid_slot_description",
      "childIds": [],
      "props": {},
      "instanceEditPolicy": {
        "position": false,
        "size": false,
        "zIndex": false,
        "imageFit": false,
        "imageFocus": false,
        "typography": false,
        "spacing": false,
        "minWidthPercent": 25,
        "maxWidthPercent": 150,
        "maxOffsetPercent": 30,
        "minFontSizePx": 12,
        "maxFontSizePx": 96,
        "maxSpacingPx": 120
      },
      "responsive": {
        "desktop": {
          "display": "block",
          "order": 0,
          "width": "fill",
          "height": {
            "mode": "auto"
          },
          "maxWidth": {
            "value": 640,
            "unit": "px"
          }
        },
        "mobile": {}
      },
      "hidden": false
    },
    "tpl_launch_creation_grid_node_workA": {
      "nodeId": "tpl_launch_creation_grid_node_workA",
      "type": "ImageSlot",
      "name": "作品图 1",
      "slotId": "tpl_launch_creation_grid_slot_workA",
      "childIds": [],
      "props": {},
      "instanceEditPolicy": {
        "position": false,
        "size": false,
        "zIndex": false,
        "imageFit": true,
        "imageFocus": true,
        "typography": false,
        "spacing": false,
        "minWidthPercent": 25,
        "maxWidthPercent": 150,
        "maxOffsetPercent": 30,
        "minFontSizePx": 12,
        "maxFontSizePx": 96,
        "maxSpacingPx": 120
      },
      "responsive": {
        "desktop": {
          "display": "block",
          "order": 0,
          "width": "fill",
          "height": {
            "mode": "auto"
          }
        },
        "mobile": {}
      },
      "hidden": false
    },
    "tpl_launch_creation_grid_node_workB": {
      "nodeId": "tpl_launch_creation_grid_node_workB",
      "type": "ImageSlot",
      "name": "作品图 2",
      "slotId": "tpl_launch_creation_grid_slot_workB",
      "childIds": [],
      "props": {},
      "instanceEditPolicy": {
        "position": false,
        "size": false,
        "zIndex": false,
        "imageFit": true,
        "imageFocus": true,
        "typography": false,
        "spacing": false,
        "minWidthPercent": 25,
        "maxWidthPercent": 150,
        "maxOffsetPercent": 30,
        "minFontSizePx": 12,
        "maxFontSizePx": 96,
        "maxSpacingPx": 120
      },
      "responsive": {
        "desktop": {
          "display": "block",
          "order": 0,
          "width": "fill",
          "height": {
            "mode": "auto"
          }
        },
        "mobile": {}
      },
      "hidden": false
    },
    "tpl_launch_creation_grid_node_workC": {
      "nodeId": "tpl_launch_creation_grid_node_workC",
      "type": "ImageSlot",
      "name": "作品图 3",
      "slotId": "tpl_launch_creation_grid_slot_workC",
      "childIds": [],
      "props": {},
      "instanceEditPolicy": {
        "position": false,
        "size": false,
        "zIndex": false,
        "imageFit": true,
        "imageFocus": true,
        "typography": false,
        "spacing": false,
        "minWidthPercent": 25,
        "maxWidthPercent": 150,
        "maxOffsetPercent": 30,
        "minFontSizePx": 12,
        "maxFontSizePx": 96,
        "maxSpacingPx": 120
      },
      "responsive": {
        "desktop": {
          "display": "block",
          "order": 0,
          "width": "fill",
          "height": {
            "mode": "auto"
          }
        },
        "mobile": {}
      },
      "hidden": false
    },
    "tpl_launch_creation_grid_node_workD": {
      "nodeId": "tpl_launch_creation_grid_node_workD",
      "type": "ImageSlot",
      "name": "作品图 4",
      "slotId": "tpl_launch_creation_grid_slot_workD",
      "childIds": [],
      "props": {},
      "instanceEditPolicy": {
        "position": false,
        "size": false,
        "zIndex": false,
        "imageFit": true,
        "imageFocus": true,
        "typography": false,
        "spacing": false,
        "minWidthPercent": 25,
        "maxWidthPercent": 150,
        "maxOffsetPercent": 30,
        "minFontSizePx": 12,
        "maxFontSizePx": 96,
        "maxSpacingPx": 120
      },
      "responsive": {
        "desktop": {
          "display": "block",
          "order": 0,
          "width": "fill",
          "height": {
            "mode": "auto"
          }
        },
        "mobile": {}
      },
      "hidden": false
    },
    "tpl_launch_creation_grid_node_works": {
      "nodeId": "tpl_launch_creation_grid_node_works",
      "type": "Grid",
      "name": "作品卡组",
      "childIds": [
        "tpl_launch_creation_grid_node_workA",
        "tpl_launch_creation_grid_node_workB",
        "tpl_launch_creation_grid_node_workC",
        "tpl_launch_creation_grid_node_workD"
      ],
      "props": {},
      "responsive": {
        "desktop": {
          "display": "grid",
          "order": 0,
          "width": "fill",
          "height": {
            "mode": "auto"
          },
          "columns": [
            1,
            1,
            1,
            1
          ],
          "gap": {
            "value": 16,
            "unit": "px"
          }
        },
        "mobile": {
          "columns": [
            1,
            1
          ]
        }
      },
      "hidden": false
    },
    "tpl_launch_creation_grid_node_body": {
      "nodeId": "tpl_launch_creation_grid_node_body",
      "type": "Stack",
      "name": "区块主体",
      "childIds": [
        "tpl_launch_creation_grid_node_title",
        "tpl_launch_creation_grid_node_description",
        "tpl_launch_creation_grid_node_works"
      ],
      "props": {},
      "responsive": {
        "desktop": {
          "display": "flex",
          "direction": "column",
          "order": 0,
          "width": "fill",
          "height": {
            "mode": "auto"
          },
          "gap": {
            "value": 48,
            "unit": "px"
          },
          "padding": {
            "top": {
              "value": 48,
              "unit": "px"
            },
            "right": {
              "value": 8,
              "unit": "%"
            },
            "bottom": {
              "value": 48,
              "unit": "px"
            },
            "left": {
              "value": 8,
              "unit": "%"
            }
          }
        },
        "mobile": {
          "gap": {
            "value": 24,
            "unit": "px"
          },
          "padding": {
            "top": {
              "value": 32,
              "unit": "px"
            },
            "right": {
              "value": 20,
              "unit": "px"
            },
            "bottom": {
              "value": 32,
              "unit": "px"
            },
            "left": {
              "value": 20,
              "unit": "px"
            }
          }
        }
      },
      "hidden": false
    },
    "tpl_launch_creation_grid_root": {
      "nodeId": "tpl_launch_creation_grid_root",
      "type": "Section",
      "name": "作品网格",
      "childIds": [
        "tpl_launch_creation_grid_node_body"
      ],
      "props": {},
      "responsive": {
        "desktop": {
          "display": "block",
          "order": 0,
          "width": "fill",
          "height": {
            "mode": "auto"
          },
          "layoutMode": "flow"
        },
        "mobile": {}
      },
      "hidden": false
    }
  },
  "slots": {
    "tpl_launch_creation_grid_slot_title": {
      "slotId": "tpl_launch_creation_grid_slot_title",
      "key": "title",
      "type": "heading",
      "label": "主标题",
      "required": false,
      "editable": true,
      "hideable": true,
      "validation": {},
      "desktopRules": {
        "fontFamily": "serif",
        "fontRole": "heading",
        "fontSize": {
          "value": 40,
          "unit": "px"
        },
        "fontWeight": 400,
        "lineHeight": 1.35,
        "textAlign": "left",
        "overflow": "wrap",
        "color": "#181A1B"
      },
      "mobileRules": {
        "fontSize": {
          "value": 28,
          "unit": "px"
        }
      },
      "emptyPolicy": "hide"
    },
    "tpl_launch_creation_grid_slot_description": {
      "slotId": "tpl_launch_creation_grid_slot_description",
      "key": "description",
      "type": "text",
      "label": "描述",
      "required": false,
      "editable": true,
      "hideable": true,
      "validation": {},
      "desktopRules": {
        "fontFamily": "system",
        "fontRole": "body",
        "fontSize": {
          "value": 16,
          "unit": "px"
        },
        "fontWeight": 400,
        "lineHeight": 1.75,
        "textAlign": "left",
        "overflow": "wrap",
        "color": "#5F6568"
      },
      "mobileRules": {
        "fontSize": {
          "value": 15,
          "unit": "px"
        }
      },
      "emptyPolicy": "hide"
    },
    "tpl_launch_creation_grid_slot_workA": {
      "slotId": "tpl_launch_creation_grid_slot_workA",
      "key": "workA",
      "type": "image",
      "label": "作品图 1",
      "required": false,
      "editable": true,
      "hideable": true,
      "validation": {},
      "desktopRules": {
        "aspectRatio": "4:5",
        "objectFit": "cover",
        "objectPosition": "center center"
      },
      "mobileRules": {
        "aspectRatio": "4:5",
        "objectFit": "cover",
        "objectPosition": "center center"
      },
      "emptyPolicy": "hide"
    },
    "tpl_launch_creation_grid_slot_workB": {
      "slotId": "tpl_launch_creation_grid_slot_workB",
      "key": "workB",
      "type": "image",
      "label": "作品图 2",
      "required": false,
      "editable": true,
      "hideable": true,
      "validation": {},
      "desktopRules": {
        "aspectRatio": "4:5",
        "objectFit": "cover",
        "objectPosition": "center center"
      },
      "mobileRules": {
        "aspectRatio": "4:5",
        "objectFit": "cover",
        "objectPosition": "center center"
      },
      "emptyPolicy": "hide"
    },
    "tpl_launch_creation_grid_slot_workC": {
      "slotId": "tpl_launch_creation_grid_slot_workC",
      "key": "workC",
      "type": "image",
      "label": "作品图 3",
      "required": false,
      "editable": true,
      "hideable": true,
      "validation": {},
      "desktopRules": {
        "aspectRatio": "4:5",
        "objectFit": "cover",
        "objectPosition": "center center"
      },
      "mobileRules": {
        "aspectRatio": "4:5",
        "objectFit": "cover",
        "objectPosition": "center center"
      },
      "emptyPolicy": "hide"
    },
    "tpl_launch_creation_grid_slot_workD": {
      "slotId": "tpl_launch_creation_grid_slot_workD",
      "key": "workD",
      "type": "image",
      "label": "作品图 4",
      "required": false,
      "editable": true,
      "hideable": true,
      "validation": {},
      "desktopRules": {
        "aspectRatio": "4:5",
        "objectFit": "cover",
        "objectPosition": "center center"
      },
      "mobileRules": {
        "aspectRatio": "4:5",
        "objectFit": "cover",
        "objectPosition": "center center"
      },
      "emptyPolicy": "hide"
    }
  },
  "defaultContent": {},
  "previewContent": {}
}',
  '0064b1840d6e9a6943df9d41698517b15d0f1895fd094aacaa1f3484a0485763');

-- editorial-split (v1)
INSERT INTO `dynamic_templates`
  (`template_id`, `source_type`, `visibility`, `status`, `name`, `category`, `purpose`, `layout_type`,
   `description`, `slot_summary`, `recommended_for`, `tags`, `definition_schema_version`, `published_version`,
   `source_reference`, `updated_at`)
VALUES ('tpl_launch_editorial_split', 'SYSTEM', 'STAFF', 'ACTIVE', '左右图文', '首发母版', '左右图文', '左图右文', '一段说明配一张主图与两张 4:5 细节副图；手机图在上、文在下，副图组仍并排。', '3 个图片槽位，3 个内容槽位', '["home","products","custom","about","contact"]', '["首发母版","左右图文"]', 3, 1, 'launch-page-preset:v1', CURRENT_TIMESTAMP(3));

INSERT INTO `dynamic_template_versions`
  (`dynamic_template_id`, `version`, `schema_version`, `definition`, `definition_checksum`)
VALUES (LAST_INSERT_ID(), 1, 3,
'{
  "schemaVersion": 3,
  "templateId": "tpl_launch_editorial_split",
  "name": "左右图文",
  "description": "一段说明配一张主图与两张 4:5 细节副图；手机图在上、文在下，副图组仍并排。",
  "metadata": {
    "category": "首发母版",
    "purpose": "左右图文",
    "layoutType": "左图右文",
    "slotSummary": "3 个图片槽位，3 个内容槽位",
    "recommendedFor": [
      "home",
      "products",
      "custom",
      "about",
      "contact"
    ],
    "desktopRatio": "3:2",
    "mobileRatio": "auto",
    "previewDesktopWidth": 1440,
    "previewMobileWidth": 390,
    "mobileBreakpoint": 767,
    "minViewportWidth": 320,
    "maxViewportWidth": 1920,
    "defaultBackgroundToken": "surface",
    "visualRole": "feature-stage",
    "headerCompatibility": [
      "solid"
    ],
    "tags": [
      "首发母版",
      "左右图文"
    ],
    "sectionRole": "editorial-split",
    "geometryPolicy": "hero-media-frame",
    "pageSettings": {
      "mediaSide": {
        "targetNodeId": "tpl_launch_editorial_split_node_split",
        "authoredSide": "start"
      }
    }
  },
  "rootNodeId": "tpl_launch_editorial_split_root",
  "nodes": {
    "tpl_launch_editorial_split_node_hero": {
      "nodeId": "tpl_launch_editorial_split_node_hero",
      "type": "ImageSlot",
      "name": "主图",
      "slotId": "tpl_launch_editorial_split_slot_splitHero",
      "childIds": [],
      "props": {},
      "instanceEditPolicy": {
        "position": false,
        "size": false,
        "zIndex": false,
        "imageFit": true,
        "imageFocus": true,
        "typography": false,
        "spacing": false,
        "minWidthPercent": 25,
        "maxWidthPercent": 150,
        "maxOffsetPercent": 30,
        "minFontSizePx": 12,
        "maxFontSizePx": 96,
        "maxSpacingPx": 120
      },
      "responsive": {
        "desktop": {
          "display": "block",
          "order": 0,
          "width": "fill",
          "height": {
            "mode": "auto"
          }
        },
        "mobile": {}
      },
      "hidden": false
    },
    "tpl_launch_editorial_split_node_detailA": {
      "nodeId": "tpl_launch_editorial_split_node_detailA",
      "type": "ImageSlot",
      "name": "副图 1",
      "slotId": "tpl_launch_editorial_split_slot_splitDetailA",
      "childIds": [],
      "props": {},
      "instanceEditPolicy": {
        "position": false,
        "size": false,
        "zIndex": false,
        "imageFit": true,
        "imageFocus": true,
        "typography": false,
        "spacing": false,
        "minWidthPercent": 25,
        "maxWidthPercent": 150,
        "maxOffsetPercent": 30,
        "minFontSizePx": 12,
        "maxFontSizePx": 96,
        "maxSpacingPx": 120
      },
      "responsive": {
        "desktop": {
          "display": "block",
          "order": 0,
          "width": "fill",
          "height": {
            "mode": "auto"
          }
        },
        "mobile": {}
      },
      "hidden": false
    },
    "tpl_launch_editorial_split_node_detailB": {
      "nodeId": "tpl_launch_editorial_split_node_detailB",
      "type": "ImageSlot",
      "name": "副图 2",
      "slotId": "tpl_launch_editorial_split_slot_splitDetailB",
      "childIds": [],
      "props": {},
      "instanceEditPolicy": {
        "position": false,
        "size": false,
        "zIndex": false,
        "imageFit": true,
        "imageFocus": true,
        "typography": false,
        "spacing": false,
        "minWidthPercent": 25,
        "maxWidthPercent": 150,
        "maxOffsetPercent": 30,
        "minFontSizePx": 12,
        "maxFontSizePx": 96,
        "maxSpacingPx": 120
      },
      "responsive": {
        "desktop": {
          "display": "block",
          "order": 0,
          "width": "fill",
          "height": {
            "mode": "auto"
          }
        },
        "mobile": {}
      },
      "hidden": false
    },
    "tpl_launch_editorial_split_node_details": {
      "nodeId": "tpl_launch_editorial_split_node_details",
      "type": "Row",
      "name": "副图组",
      "childIds": [
        "tpl_launch_editorial_split_node_detailA",
        "tpl_launch_editorial_split_node_detailB"
      ],
      "props": {},
      "responsive": {
        "desktop": {
          "display": "flex",
          "direction": "row",
          "order": 0,
          "width": "fill",
          "height": {
            "mode": "auto"
          },
          "gap": {
            "value": 16,
            "unit": "px"
          }
        },
        "mobile": {}
      },
      "hidden": false
    },
    "tpl_launch_editorial_split_node_media": {
      "nodeId": "tpl_launch_editorial_split_node_media",
      "type": "Column",
      "name": "媒体列",
      "childIds": [
        "tpl_launch_editorial_split_node_hero",
        "tpl_launch_editorial_split_node_details"
      ],
      "props": {},
      "responsive": {
        "desktop": {
          "display": "flex",
          "direction": "column",
          "order": 0,
          "width": "fill",
          "height": {
            "mode": "auto"
          },
          "gap": {
            "value": 16,
            "unit": "px"
          }
        },
        "mobile": {}
      },
      "hidden": false
    },
    "tpl_launch_editorial_split_node_title": {
      "nodeId": "tpl_launch_editorial_split_node_title",
      "type": "HeadingSlot",
      "name": "主标题",
      "slotId": "tpl_launch_editorial_split_slot_title",
      "childIds": [],
      "props": {},
      "instanceEditPolicy": {
        "position": false,
        "size": false,
        "zIndex": false,
        "imageFit": false,
        "imageFocus": false,
        "typography": false,
        "spacing": false,
        "minWidthPercent": 25,
        "maxWidthPercent": 150,
        "maxOffsetPercent": 30,
        "minFontSizePx": 12,
        "maxFontSizePx": 96,
        "maxSpacingPx": 120
      },
      "responsive": {
        "desktop": {
          "display": "block",
          "order": 0,
          "width": "fill",
          "height": {
            "mode": "auto"
          }
        },
        "mobile": {}
      },
      "hidden": false
    },
    "tpl_launch_editorial_split_node_description": {
      "nodeId": "tpl_launch_editorial_split_node_description",
      "type": "TextSlot",
      "name": "描述",
      "slotId": "tpl_launch_editorial_split_slot_description",
      "childIds": [],
      "props": {},
      "instanceEditPolicy": {
        "position": false,
        "size": false,
        "zIndex": false,
        "imageFit": false,
        "imageFocus": false,
        "typography": false,
        "spacing": false,
        "minWidthPercent": 25,
        "maxWidthPercent": 150,
        "maxOffsetPercent": 30,
        "minFontSizePx": 12,
        "maxFontSizePx": 96,
        "maxSpacingPx": 120
      },
      "responsive": {
        "desktop": {
          "display": "block",
          "order": 0,
          "width": "fill",
          "height": {
            "mode": "auto"
          },
          "maxWidth": {
            "value": 640,
            "unit": "px"
          }
        },
        "mobile": {}
      },
      "hidden": false
    },
    "tpl_launch_editorial_split_node_link": {
      "nodeId": "tpl_launch_editorial_split_node_link",
      "type": "LinkSlot",
      "name": "次级链接",
      "slotId": "tpl_launch_editorial_split_slot_secondaryLink",
      "childIds": [],
      "props": {},
      "instanceEditPolicy": {
        "position": false,
        "size": false,
        "zIndex": false,
        "imageFit": false,
        "imageFocus": false,
        "typography": false,
        "spacing": false,
        "minWidthPercent": 25,
        "maxWidthPercent": 150,
        "maxOffsetPercent": 30,
        "minFontSizePx": 12,
        "maxFontSizePx": 96,
        "maxSpacingPx": 120
      },
      "responsive": {
        "desktop": {
          "display": "block",
          "order": 0,
          "width": "fit",
          "height": {
            "mode": "auto"
          }
        },
        "mobile": {}
      },
      "hidden": false
    },
    "tpl_launch_editorial_split_node_text": {
      "nodeId": "tpl_launch_editorial_split_node_text",
      "type": "Column",
      "name": "文字列",
      "childIds": [
        "tpl_launch_editorial_split_node_title",
        "tpl_launch_editorial_split_node_description",
        "tpl_launch_editorial_split_node_link"
      ],
      "props": {},
      "responsive": {
        "desktop": {
          "display": "flex",
          "direction": "column",
          "order": 0,
          "width": "fill",
          "height": {
            "mode": "auto"
          },
          "gap": {
            "value": 16,
            "unit": "px"
          }
        },
        "mobile": {}
      },
      "hidden": false
    },
    "tpl_launch_editorial_split_node_split": {
      "nodeId": "tpl_launch_editorial_split_node_split",
      "type": "Row",
      "name": "图文分栏",
      "childIds": [
        "tpl_launch_editorial_split_node_media",
        "tpl_launch_editorial_split_node_text"
      ],
      "props": {},
      "responsive": {
        "desktop": {
          "display": "flex",
          "direction": "row",
          "order": 0,
          "width": "fill",
          "height": {
            "mode": "auto"
          },
          "gap": {
            "value": 48,
            "unit": "px"
          },
          "alignItems": "start"
        },
        "mobile": {
          "direction": "column",
          "gap": {
            "value": 24,
            "unit": "px"
          }
        }
      },
      "hidden": false
    },
    "tpl_launch_editorial_split_node_body": {
      "nodeId": "tpl_launch_editorial_split_node_body",
      "type": "Stack",
      "name": "区块主体",
      "childIds": [
        "tpl_launch_editorial_split_node_split"
      ],
      "props": {},
      "responsive": {
        "desktop": {
          "display": "flex",
          "direction": "column",
          "order": 0,
          "width": "fill",
          "height": {
            "mode": "auto"
          },
          "gap": {
            "value": 48,
            "unit": "px"
          },
          "padding": {
            "top": {
              "value": 48,
              "unit": "px"
            },
            "right": {
              "value": 8,
              "unit": "%"
            },
            "bottom": {
              "value": 48,
              "unit": "px"
            },
            "left": {
              "value": 8,
              "unit": "%"
            }
          }
        },
        "mobile": {
          "gap": {
            "value": 24,
            "unit": "px"
          },
          "padding": {
            "top": {
              "value": 32,
              "unit": "px"
            },
            "right": {
              "value": 20,
              "unit": "px"
            },
            "bottom": {
              "value": 32,
              "unit": "px"
            },
            "left": {
              "value": 20,
              "unit": "px"
            }
          }
        }
      },
      "hidden": false
    },
    "tpl_launch_editorial_split_root": {
      "nodeId": "tpl_launch_editorial_split_root",
      "type": "Section",
      "name": "左右图文",
      "childIds": [
        "tpl_launch_editorial_split_node_body"
      ],
      "props": {},
      "responsive": {
        "desktop": {
          "display": "block",
          "order": 0,
          "width": "fill",
          "height": {
            "mode": "auto"
          },
          "layoutMode": "flow"
        },
        "mobile": {}
      },
      "hidden": false
    }
  },
  "slots": {
    "tpl_launch_editorial_split_slot_splitHero": {
      "slotId": "tpl_launch_editorial_split_slot_splitHero",
      "key": "splitHero",
      "type": "image",
      "label": "主图",
      "required": false,
      "editable": true,
      "hideable": true,
      "validation": {},
      "desktopRules": {
        "aspectRatio": "3:2",
        "objectFit": "cover",
        "objectPosition": "center center"
      },
      "mobileRules": {
        "aspectRatio": "4:5",
        "objectFit": "cover",
        "objectPosition": "center center"
      },
      "semanticRole": "heroImage",
      "emptyPolicy": "hide"
    },
    "tpl_launch_editorial_split_slot_splitDetailA": {
      "slotId": "tpl_launch_editorial_split_slot_splitDetailA",
      "key": "splitDetailA",
      "type": "image",
      "label": "副图 1",
      "required": false,
      "editable": true,
      "hideable": true,
      "validation": {},
      "desktopRules": {
        "aspectRatio": "4:5",
        "objectFit": "cover",
        "objectPosition": "center center"
      },
      "mobileRules": {
        "aspectRatio": "4:5",
        "objectFit": "cover",
        "objectPosition": "center center"
      },
      "semanticRole": "secondaryImage",
      "emptyPolicy": "hide"
    },
    "tpl_launch_editorial_split_slot_splitDetailB": {
      "slotId": "tpl_launch_editorial_split_slot_splitDetailB",
      "key": "splitDetailB",
      "type": "image",
      "label": "副图 2",
      "required": false,
      "editable": true,
      "hideable": true,
      "validation": {},
      "desktopRules": {
        "aspectRatio": "4:5",
        "objectFit": "cover",
        "objectPosition": "center center"
      },
      "mobileRules": {
        "aspectRatio": "4:5",
        "objectFit": "cover",
        "objectPosition": "center center"
      },
      "semanticRole": "secondaryImage",
      "emptyPolicy": "hide"
    },
    "tpl_launch_editorial_split_slot_title": {
      "slotId": "tpl_launch_editorial_split_slot_title",
      "key": "title",
      "type": "heading",
      "label": "主标题",
      "required": false,
      "editable": true,
      "hideable": true,
      "validation": {},
      "desktopRules": {
        "fontFamily": "serif",
        "fontRole": "heading",
        "fontSize": {
          "value": 40,
          "unit": "px"
        },
        "fontWeight": 400,
        "lineHeight": 1.35,
        "textAlign": "left",
        "overflow": "wrap",
        "color": "#181A1B"
      },
      "mobileRules": {
        "fontSize": {
          "value": 28,
          "unit": "px"
        }
      },
      "emptyPolicy": "hide"
    },
    "tpl_launch_editorial_split_slot_description": {
      "slotId": "tpl_launch_editorial_split_slot_description",
      "key": "description",
      "type": "text",
      "label": "描述",
      "required": false,
      "editable": true,
      "hideable": true,
      "validation": {},
      "desktopRules": {
        "fontFamily": "system",
        "fontRole": "body",
        "fontSize": {
          "value": 16,
          "unit": "px"
        },
        "fontWeight": 400,
        "lineHeight": 1.75,
        "textAlign": "left",
        "overflow": "wrap",
        "color": "#5F6568"
      },
      "mobileRules": {
        "fontSize": {
          "value": 15,
          "unit": "px"
        }
      },
      "emptyPolicy": "hide"
    },
    "tpl_launch_editorial_split_slot_secondaryLink": {
      "slotId": "tpl_launch_editorial_split_slot_secondaryLink",
      "key": "secondaryLink",
      "type": "link",
      "label": "次级链接",
      "required": false,
      "editable": true,
      "hideable": true,
      "validation": {},
      "desktopRules": {
        "fontFamily": "system",
        "fontRole": "body",
        "fontSize": {
          "value": 16,
          "unit": "px"
        },
        "fontWeight": 400,
        "lineHeight": 1.75,
        "textAlign": "left",
        "overflow": "wrap",
        "color": "#181A1B"
      },
      "mobileRules": {
        "fontSize": {
          "value": 15,
          "unit": "px"
        }
      },
      "emptyPolicy": "hide"
    }
  },
  "defaultContent": {},
  "previewContent": {}
}',
  'eba076b95592345f76ff4cd37fb1d23bd572043f72c5774be371df9dfc42d28d');

COMMIT;
