/** 页面模块 — 组件化页面构建器数据模型 */

export interface PageModuleContent {
  desktopImage?: string;
  mobileImage?: string;
  video?: string;
  title?: string;
  subtitle?: string;
  description?: string;
  number?: string;
  label?: string;
  actionText?: string;
  linkUrl?: string;
  altText?: string;
  // doublePoster 专用
  mainImage?: string;
  detailImage?: string;
}

export interface PageModuleLayout {
  template: string;       // "leftTextRightImage" | "rightTextLeftImage" | "stacked" | ...
  alignment?: string;     // "center" | "left" — 首屏等舞台模板的文字位置受控档
  desktopColumns?: string; // "8-4" | "6-6" | "4-8"
  textPosition?: string;  // "left" | "right" | "overlay"
}

export interface PageModuleStyle {
  focusX?: number;
  focusY?: number;
  mainFocusX?: number;
  mainFocusY?: number;
  detailFocusX?: number;
  detailFocusY?: number;
  bgColor?: string;
  textColor?: string;
  spacing?: string;       // "compact" | "normal" | "spacious"
  textAlign?: string;
  animation?: string;     // "fadeUp" | "none"
}

export interface PageModule {
  id: number;
  pageKey: string;
  moduleType: string;
  sortOrder: number;
  isVisible: boolean;
  status: 'DRAFT' | 'PUBLISHED';
  content: PageModuleContent;
  layoutConfig: PageModuleLayout;
  styleConfig: PageModuleStyle;
  updatedBy?: number;
  createdAt: string;
  updatedAt: string;
}
