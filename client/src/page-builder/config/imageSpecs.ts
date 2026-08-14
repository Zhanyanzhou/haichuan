/**
 * 图片尺寸规格目录 — 各模块上传素材的推荐尺寸(建议值,8% 容差内提示"尺寸合适",不阻断)。
 *
 * 定位(2026-08 模板体系重构后):
 * - 比例规则唯一来源是 designSystem/tokens 的 RATIOS 与 blockContracts 各模板契约;
 * - 本表只负责"给运营看的上传规格文案 + 编辑器尺寸检查数据源",数值已与契约对齐;
 * - imageText / splitPanel 条目为已退役模板的遗留规格,仅供旧数据编辑兜底,不再新增使用。
 *
 * 桌面端按 2K+ 出图,移动端按 3x 出图,商品图可放大看细节。
 * 注意:大像素原图需配套后端按需缩放(srcset / 多尺寸),避免移动端直接加载 4K 拖慢。
 */
export const IMAGE_SPECS = {
  hero: {
    desktop: {
      width: 3360,
      height: 1470,
      ratio: "16:7",
      label: "桌面端主视觉（建议 3360×1470，16:7，2K+）",
    },
    mobile: {
      width: 1500,
      height: 1875,
      ratio: "4:5",
      label: "移动端主视觉（建议 1500×1875，4:5）",
    },
  },
  singlePoster: {
    image: {
      width: 1600,
      height: 2000,
      ratio: "4:5",
      label: "海报主图（建议 1600×2000，4:5）",
    },
    mobile: {
      width: 1500,
      height: 2000,
      ratio: "3:4",
      label: "移动端单海报（建议 1500×2000，3:4）",
    },
  },
  doublePoster: {
    main: {
      width: 2400,
      height: 1600,
      ratio: "3:2",
      label: "主海报（建议 2400×1600，3:2）",
    },
    detail: {
      width: 1280,
      height: 1600,
      ratio: "4:5",
      label: "细节海报（建议 1280×1600，4:5）",
    },
  },
  imageText: {
    image: {
      width: 1600,
      height: 1200,
      ratio: "4:3",
      label: "图文配图（建议 1600×1200，4:3）",
    },
  },
  fullBleed: {
    desktop: {
      width: 3360,
      height: 960,
      ratio: "21:6",
      label: "通栏桌面图（建议 3360×960，21:6，超宽）",
    },
    mobile: {
      width: 1500,
      height: 1875,
      ratio: "4:5",
      label: "通栏移动图（建议 1500×1875，4:5）",
    },
  },
  splitPanel: {
    image: {
      width: 1200,
      height: 1600,
      ratio: "3:4",
      label: "分栏配图（建议 1200×1600，3:4）",
    },
  },
  cardGrid: {
    image: {
      width: 2000,
      height: 2000,
      ratio: "1:1",
      label: "卡片图（建议 2000×2000，1:1，可放大）",
    },
  },
  hotspot: {
    desktop: {
      width: 3840,
      height: 2160,
      ratio: "16:9",
      label: "热区桌面图（建议 3840×2160，16:9，4K）",
    },
    mobile: {
      width: 1170,
      height: 1560,
      ratio: "3:4",
      label: "热区移动图（建议 1170×1560，3:4）",
    },
  },
  textBanner: {
    bgImage: {
      width: 3360,
      height: 960,
      ratio: "21:6",
      label: "横幅背景图（建议 3360×960，21:6）",
    },
  },
  productRow: {
    image: {
      width: 2000,
      height: 2500,
      ratio: "4:5",
      label: "商品图（建议 2000×2500，4:5，统一比例）",
    },
  },
  featuredProduct: {
    image: {
      width: 1600,
      height: 2000,
      ratio: "4:5",
      label: "主推作品图（建议 1600×2000，4:5）",
    },
  },
  lookbook: {
    image: {
      width: 1600,
      height: 2000,
      ratio: "4:5",
      label: "佩戴大片（建议 1600×2000，4:5）",
    },
  },
  categoryCards: {
    image: {
      width: 1600,
      height: 2000,
      ratio: "4:5",
      label: "入口卡图（建议 1600×2000，4:5）",
    },
  },
  carousel: {
    image: {
      width: 3360,
      height: 960,
      ratio: "21:6",
      label: "电脑端宽幕轮播图（建议 3360×960，21:6）",
    },
    mobile: {
      width: 1500,
      height: 2000,
      ratio: "3:4",
      label: "手机端轮播图（建议 1500×2000，3:4）",
    },
  },
  gallery: {
    primary: {
      width: 1600,
      height: 2000,
      ratio: "4:5",
      label: "画廊主图（建议 1600×2000，4:5）",
    },
    secondary: {
      width: 2000,
      height: 2000,
      ratio: "1:1",
      label: "画廊辅图（建议 2000×2000，1:1）",
    },
  },
  storeInfo: {
    image: {
      width: 2400,
      height: 1600,
      ratio: "3:2",
      label: "门店空间图（建议 2400×1600，3:2）",
    },
  },
  video: {
    poster: {
      width: 3840,
      height: 2160,
      ratio: "16:9",
      label: "视频封面（建议 3840×2160，16:9，4K）",
    },
  },
} as const;
