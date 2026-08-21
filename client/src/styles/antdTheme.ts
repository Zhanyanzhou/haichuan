import type { ThemeConfig } from "antd";

/**
 * Ant Design 管理后台主题
 * 详细数值与使用边界见 docs/UI_GUIDE.md「附录 A · 管理后台排版、密度与无障碍」。
 */
export const ADMIN_COLORS = {
  canvas: "#FFFFFF",
  canvasSubtle: "#F4F5F5",
  action: "#181A1B",
  actionHover: "#101213",
  actionActive: "#000000",
  actionSoft: "#ECEEEF",
  onAction: "#F7F8F8",
  ink: "#181A1B",
  textStrong: "#181A1B",
  text: "#5F6568",
  muted: "#6E7477",
  line: "#DDE1E2",
  lineStrong: "#B8BEC1",
  success: "#356348",
  successBg: "#EFF5F1",
  successBorder: "#ACC4B4",
  warning: "#7A531A",
  warningBg: "#FBF4E8",
  warningBorder: "#D4BD96",
  error: "#8C3F3B",
  errorBg: "#FAF0EF",
  errorBorder: "#D7B6B4",
  info: "#335F7D",
  infoBg: "#EEF4F7",
  infoBorder: "#ADC3D0",
  neutralBg: "#F4F5F5",
  neutralBorder: "#DDE1E2",
} as const;

export const ADMIN_ACTION_COLOR = ADMIN_COLORS.action;

const antdTheme: ThemeConfig = {
  token: {
    // 全站共享中性底盘；后台主操作使用高对比近黑。
    colorPrimary: ADMIN_ACTION_COLOR,
    colorPrimaryBg: ADMIN_COLORS.actionSoft,
    colorPrimaryBgHover: "#DDE1E2",
    colorPrimaryBorder: ADMIN_ACTION_COLOR,
    colorPrimaryBorderHover: ADMIN_ACTION_COLOR,
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
    colorBgContainer: ADMIN_COLORS.canvas,
    colorBgLayout: ADMIN_COLORS.canvasSubtle,

    // 边框 — 极浅
    colorBorder: ADMIN_COLORS.lineStrong,
    colorBorderSecondary: ADMIN_COLORS.line,

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
      defaultShadow: "none",
      primaryShadow: "none",
      dangerShadow: "none",
    },
    Input: {
      activeBorderColor: ADMIN_COLORS.action,
      hoverBorderColor: ADMIN_COLORS.action,
      activeShadow: "0 0 0 2px rgba(24,26,27,0.10)",
    },
    Card: {
      borderRadiusLG: 4,
    },
    Table: {
      headerBg: ADMIN_COLORS.canvasSubtle,
      headerColor: ADMIN_COLORS.text,
      rowHoverBg: "#F7F8F8",
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
