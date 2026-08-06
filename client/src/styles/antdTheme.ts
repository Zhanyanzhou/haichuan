import type { ThemeConfig } from 'antd';

/**
 * Ant Design 主题 — 管理后台低饱和古金视觉系统
 */
const antdTheme: ThemeConfig = {
  token: {
    // 品牌色 — 低饱和古金，克制使用
    colorPrimary: '#B69052',
    colorPrimaryBg: '#F3EFE7',
    colorPrimaryBgHover: '#E8DFD0',
    colorPrimaryBorder: '#B69052',
    colorPrimaryHover: '#9F7941',
    colorPrimaryActive: '#9F7941',

    // 语义色
    colorSuccess: '#5E8A6B',
    colorWarning: '#C08A45',
    colorError: '#B15F5A',
    colorInfo: '#5E7F9E',

    // 文字色 — 深炭灰体系
    colorText: '#252522',
    colorTextSecondary: '#66645F',
    colorTextTertiary: '#96928A',

    // 背景色 — 浅灰白体系
    colorBgContainer: '#FFFFFF',
    colorBgLayout: '#F7F7F5',

    // 边框 — 细腻浅灰
    colorBorder: '#E7E6E2',
    colorBorderSecondary: '#DCDAD4',

    // 圆角
    borderRadius: 8,
    borderRadiusLG: 10,
    borderRadiusSM: 6,

    // 字号
    fontSize: 14,
    fontSizeHeading1: 28,
    fontSizeHeading2: 22,
    fontSizeHeading3: 18,
    fontSizeHeading4: 16,
    fontSizeHeading5: 14,

    // 字体
    fontFamily: `"Noto Serif SC", "Source Han Serif CN", serif`,

    // 阴影 — 极轻
    boxShadow: '0 6px 20px rgba(40,36,30,0.035)',
    boxShadowSecondary: '0 2px 8px rgba(40,36,30,0.06)',
  },
  components: {
    Button: {
      borderRadius: 8,
      controlHeight: 38,
    },
    Card: {
      borderRadiusLG: 10,
    },
    Table: {
      headerBg: '#F7F6F3',
      headerColor: '#55524D',
      rowHoverBg: '#FAFAF8',
    },
    Menu: {
      itemBg: 'transparent',
      itemColor: '#55534E',
      itemSelectedBg: '#F3EFE7',
      itemSelectedColor: '#9F7941',
      itemHeight: 44,
      borderRadius: 8,
    },
  },
};

export default antdTheme;
