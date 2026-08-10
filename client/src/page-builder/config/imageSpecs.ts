/**
 * 图片尺寸规范 — 各模块类型的推荐图片尺寸
 * 在页面构建器画布中显示，帮助运营上传正确比例的图片
 */
export const IMAGE_SPECS = {
  hero: {
    desktop: {
      width: 1920,
      height: 1080,
      ratio: "16:9",
      label: "桌面端主视觉（建议 1920×1080，16:9）",
    },
    mobile: {
      width: 750,
      height: 1334,
      ratio: "9:16",
      label: "移动端主视觉（建议 750×1334，9:16）",
    },
  },
  singlePoster: {
    image: {
      width: 1200,
      height: 800,
      ratio: "3:2",
      label: "单海报（建议 1200×800，3:2）",
    },
  },
  doublePoster: {
    main: {
      width: 960,
      height: 720,
      ratio: "4:3",
      label: "主海报（建议 960×720，4:3）",
    },
    detail: {
      width: 640,
      height: 800,
      ratio: "4:5",
      label: "细节海报（建议 640×800，4:5）",
    },
  },
  imageText: {
    image: {
      width: 800,
      height: 600,
      ratio: "4:3",
      label: "图文配图（建议 800×600，4:3）",
    },
  },
  fullBleed: {
    desktop: {
      width: 1920,
      height: 800,
      ratio: "2.4:1",
      label: "通栏桌面图（建议 1920×800，2.4:1）",
    },
    mobile: {
      width: 750,
      height: 900,
      ratio: "5:6",
      label: "通栏移动图（建议 750×900，5:6）",
    },
  },
  splitPanel: {
    image: {
      width: 600,
      height: 800,
      ratio: "3:4",
      label: "分栏配图（建议 600×800，3:4）",
    },
  },
  cardGrid: {
    image: {
      width: 600,
      height: 600,
      ratio: "1:1",
      label: "卡片图（建议 600×600，1:1）",
    },
  },
  hotspot: {
    desktop: {
      width: 1920,
      height: 1080,
      ratio: "16:9",
      label: "热区桌面图（建议 1920×1080，16:9）",
    },
    mobile: {
      width: 750,
      height: 1000,
      ratio: "3:4",
      label: "热区移动图（建议 750×1000，3:4）",
    },
  },
  textBanner: {
    bgImage: {
      width: 1920,
      height: 400,
      ratio: "4.8:1",
      label: "横幅背景图（建议 1920×400，4.8:1）",
    },
  },
  productRow: {
    image: {
      width: 600,
      height: 600,
      ratio: "1:1",
      label: "产品图（建议 600×600，1:1）",
    },
  },
  categoryCards: {
    image: {
      width: 600,
      height: 600,
      ratio: "1:1",
      label: "分类图（建议 600×600，1:1）",
    },
  },
  carousel: {
    image: {
      width: 1920,
      height: 900,
      ratio: "2.13:1",
      label: "轮播图（建议 1920×900，2.13:1）",
    },
  },
  video: {
    poster: {
      width: 1920,
      height: 1080,
      ratio: "16:9",
      label: "视频封面（建议 1920×1080，16:9）",
    },
  },
} as const;
