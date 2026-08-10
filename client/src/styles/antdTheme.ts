import type { ThemeConfig } from "antd";

/**
 * Ant Design 主题 — 高端珠宝品牌后台
 * Quiet Luxury Editorial Minimalism
 * 品牌金 #A58B62 仅用于极少数强调场景
 */
const antdTheme: ThemeConfig = {
  token: {
    // 品牌色 — 香槟金，极其克制使用
    colorPrimary: "#A58B62",
    colorPrimaryBg: "#F1ECE4",
    colorPrimaryBgHover: "#E8DFD2",
    colorPrimaryBorder: "#A58B62",
    colorPrimaryHover: "#8D734E",
    colorPrimaryActive: "#7A603F",

    // 语义色 — 低饱和
    colorSuccess: "#5E8A6B",
    colorWarning: "#C08A45",
    colorError: "#B15F5A",
    colorInfo: "#5E7F9E",

    // 文字色 — 深炭灰体系
    colorText: "#191918",
    colorTextSecondary: "#4C4945",
    colorTextTertiary: "#77726C",
    colorTextQuaternary: "#9F9992",

    // 背景色
    colorBgContainer: "#FAF9F6",
    colorBgLayout: "#F5F3EF",

    // 边框 — 极浅
    colorBorder: "#E5E1DA",
    colorBorderSecondary: "#D9D3C8",

    // 圆角 — 极小
    borderRadius: 4,
    borderRadiusLG: 4,
    borderRadiusSM: 3,

    // 字号
    fontSize: 14,
    fontSizeHeading1: 26,
    fontSizeHeading2: 18,
    fontSizeHeading3: 16,
    fontSizeHeading4: 15,
    fontSizeHeading5: 14,

    // 字体
    fontFamily: `"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", Arial, sans-serif`,

    // 阴影 — 默认无阴影
    boxShadow: "none",
    boxShadowSecondary: "none",

    // 行高
    lineHeight: 1.6,
  },
  components: {
    Button: {
      borderRadius: 4,
      controlHeight: 36,
      fontWeight: 500,
    },
    Card: {
      borderRadiusLG: 4,
    },
    Table: {
      headerBg: "#F5F3EF",
      headerColor: "#77726C",
      rowHoverBg: "#FAFAF8",
    },
    Menu: {
      itemBg: "transparent",
      itemColor: "#4C4945",
      itemSelectedBg: "transparent",
      itemSelectedColor: "#191918",
      itemHeight: 40,
      borderRadius: 4,
    },
    Tag: {
      borderRadiusSM: 3,
    },
  },
};

export default antdTheme;
