import type { ThemeConfig } from "antd";

/**
 * Ant Design 管理后台主题
 * 详细数值与使用边界见 docs/UI_GUIDE.md「附录 A · 管理后台排版、密度与无障碍」。
 */
export const ADMIN_COLORS = {
  brandGold: "#B8944E",
  action: "#6F5733",
  actionHover: "#5F492A",
  actionActive: "#4F3C22",
  onAction: "#FFFFFF",
  ink: "#191918",
  textStrong: "#4C4945",
  text: "#5F5B55",
  muted: "#76716A",
  success: "#3E6E4F",
  successBg: "#F0F5F1",
  successBorder: "#B7C8BB",
  warning: "#8A5A1F",
  warningBg: "#FBF4E9",
  warningBorder: "#D8C3A4",
  error: "#9A4A45",
  errorBg: "#FAF0EF",
  errorBorder: "#D8BBB8",
  info: "#3D668A",
  infoBg: "#EEF3F7",
  infoBorder: "#B7C6D1",
  neutralBg: "#F5F4F1",
  neutralBorder: "#D9D3C8",
} as const;

export const ADMIN_BRAND_GOLD = ADMIN_COLORS.brandGold;
export const ADMIN_ACTION_COLOR = ADMIN_COLORS.action;

const antdTheme: ThemeConfig = {
  token: {
    // 品牌金只作装饰；交互主色需保证白字对比度。
    colorPrimary: ADMIN_ACTION_COLOR,
    colorPrimaryBg: "#F1ECE4",
    colorPrimaryBgHover: "#E8DFD2",
    colorPrimaryBorder: ADMIN_ACTION_COLOR,
    colorPrimaryHover: ADMIN_COLORS.actionHover,
    colorPrimaryActive: ADMIN_COLORS.actionActive,

    // 语义色 — 低饱和
    colorSuccess: ADMIN_COLORS.success,
    colorSuccessBg: ADMIN_COLORS.successBg,
    colorSuccessBorder: ADMIN_COLORS.successBorder,
    colorWarning: ADMIN_COLORS.warning,
    colorWarningBg: ADMIN_COLORS.warningBg,
    colorWarningBorder: ADMIN_COLORS.warningBorder,
    colorError: ADMIN_COLORS.error,
    colorErrorBg: ADMIN_COLORS.errorBg,
    colorErrorBorder: ADMIN_COLORS.errorBorder,
    colorInfo: ADMIN_COLORS.info,
    colorInfoBg: ADMIN_COLORS.infoBg,
    colorInfoBorder: ADMIN_COLORS.infoBorder,

    // 文字色 — 深炭灰体系
    colorText: ADMIN_COLORS.ink,
    colorTextSecondary: ADMIN_COLORS.textStrong,
    colorTextTertiary: ADMIN_COLORS.text,
    colorTextQuaternary: ADMIN_COLORS.muted,

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

    // 海川项目令牌：常用控件比 Ant Design 32px 默认值略舒展。
    controlHeight: 36,
    controlHeightLG: 40,
    controlHeightSM: 32,

    // 字体
    fontFamily: `"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", Arial, sans-serif`,

    // 阴影 — 默认无阴影
    boxShadow: "none",
    boxShadowSecondary: "none",

    // 行高
    lineHeight: 1.5714285714285714,
    lineWidthBold: 2,
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
      headerColor: ADMIN_COLORS.text,
      rowHoverBg: "#FAFAF8",
      cellFontSize: 14,
      cellFontSizeMD: 14,
      cellFontSizeSM: 14,
      cellPaddingBlock: 12,
      cellPaddingBlockMD: 12,
      cellPaddingBlockSM: 8,
      cellPaddingInline: 16,
      cellPaddingInlineMD: 12,
      cellPaddingInlineSM: 8,
    },
    Menu: {
      itemBg: "transparent",
      itemColor: ADMIN_COLORS.textStrong,
      itemSelectedBg: "transparent",
      itemSelectedColor: ADMIN_COLORS.ink,
      itemHeight: 40,
      borderRadius: 4,
    },
    Tag: {
      borderRadiusSM: 3,
    },
  },
};

export default antdTheme;
