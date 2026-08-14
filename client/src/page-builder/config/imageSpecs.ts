/**
 * 图片尺寸规范 — 各模块类型的推荐图片尺寸（奢侈品级超高清）
 *
 * 桌面端按 4K / 2K 出图，移动端按 iPhone 3x 出图，商品图可放大看细节。
 * 注意：大像素原图需配套后端按需缩放（srcset / 多尺寸），避免移动端直接加载 4K 拖慢。
 */
export const IMAGE_SPECS = {
  hero: {
    desktop: {
      width: 3840,
      height: 2160,
      ratio: "16:9",
      label: "桌面端主视觉（建议 3840×2160，16:9，4K）",
    },
    mobile: {
      width: 1170,
      height: 2532,
      ratio: "9:16",
      label: "移动端主视觉（建议 1170×2532，9:16，iPhone 3x）",
    },
  },
  singlePoster: {
    image: {
      width: 2400,
      height: 1600,
      ratio: "3:2",
      label: "单海报（建议 2400×1600，3:2）",
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
      width: 1920,
      height: 1440,
      ratio: "4:3",
      label: "主海报（建议 1920×1440，4:3）",
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
      width: 3840,
      height: 1600,
      ratio: "2.4:1",
      label: "通栏桌面图（建议 3840×1600，2.4:1，4K）",
    },
    mobile: {
      width: 1500,
      height: 1800,
      ratio: "5:6",
      label: "通栏移动图（建议 1500×1800，5:6）",
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
      width: 3840,
      height: 800,
      ratio: "4.8:1",
      label: "横幅背景图（建议 3840×800，4.8:1）",
    },
  },
  productRow: {
    image: {
      width: 2000,
      height: 2000,
      ratio: "1:1",
      label: "产品图（建议 2000×2000，1:1，可放大看细节）",
    },
  },
  featuredProduct: {
    image: {
      width: 1600,
      height: 2133,
      ratio: "3:4",
      label: "主推单品图（建议 1600×2133，3:4）",
    },
  },
  lookbook: {
    image: {
      width: 2400,
      height: 1800,
      ratio: "4:3",
      label: "佩戴场景图（建议 2400×1800，4:3）",
    },
  },
  categoryCards: {
    image: {
      width: 1600,
      height: 2133,
      ratio: "3:4",
      label: "分类导航图（建议 1600×2133，3:4）",
    },
  },
  carousel: {
    image: {
      width: 3840,
      height: 1800,
      ratio: "2.13:1",
      label: "轮播图（建议 3840×1800，2.13:1，4K）",
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
