/** 首屏测试模板使用的最小页面模块数据模型。 */
export interface PageModuleContent {
  [key: string]: unknown;
  desktopImage?: string;
  mobileImage?: string;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  actionText?: string;
  altText?: string;
  targetType?: string;
  productCode?: string;
  productId?: string | number;
  categorySlug?: string;
  linkUrl?: string;
}

export interface PageModuleLayout {
  [key: string]: unknown;
  template?: string;
  alignment?: string;
}

export interface PageModuleStyle {
  [key: string]: unknown;
  focusX?: number;
  focusY?: number;
  desktopFocusX?: number;
  desktopFocusY?: number;
  mobileFocusX?: number;
  mobileFocusY?: number;
}

export interface PageModule {
  id: number;
  pageKey: string;
  moduleType: string;
  sortOrder: number;
  isVisible: boolean;
  status: "DRAFT" | "PUBLISHED";
  content: PageModuleContent;
  layoutConfig: PageModuleLayout;
  styleConfig: PageModuleStyle;
  updatedBy?: number;
  createdAt: string;
  updatedAt: string;
}

export type RenderablePageModule = Pick<
  PageModule,
  "content" | "layoutConfig" | "styleConfig"
>;
