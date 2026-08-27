/** 页面模块 — 组件化页面构建器数据模型 */

export interface PageModuleItem {
  [key: string]: unknown;
  id?: string | number;
  name?: string;
  title?: string;
  subtitle?: string;
  body?: string;
  content?: string;
  description?: string;
  desc?: string;
  meta?: string;
  icon?: string;
  number?: string;
  en?: string;
  image?: string;
  imageUrl?: string;
  mobileUrl?: string;
  url?: string;
  alt?: string;
  altText?: string;
  link?: unknown;
  linkUrl?: string;
  targetType?: string;
  productCode?: string;
  productId?: string | number;
  count?: string | number;
  focusX?: number;
  focusY?: number;
}

export interface PageModuleProductItem {
  [key: string]: unknown;
  id?: string | number;
  name?: string;
  image?: string;
  price?: string | number;
  link?: string;
  __empty?: boolean;
}

export interface PageModuleContent {
  [key: string]: unknown;
  desktopImage?: string;
  mobileImage?: string;
  video?: string;
  title?: string;
  subtitle?: string;
  description?: string;
  body?: string;
  eyebrow?: string;
  number?: string;
  label?: string;
  actionText?: string;
  buttonText?: string;
  linkUrl?: string;
  altText?: string;
  image?: string;
  imageAlt?: string;
  targetType?: string;
  productCode?: string;
  productId?: string | number;
  productIds?: number[];
  productCodes?: string[];
  products?: PageModuleProductItem[];
  product?: PageModuleProductItem;
  categories?: PageModuleItem[];
  cards?: PageModuleItem[];
  images?: PageModuleItem[];
  items?: PageModuleItem[];
  certificates?: PageModuleItem[];
  steps?: PageModuleItem[];
  testimonials?: PageModuleItem[];
  benefits?: Array<string | { value?: string }>;
  layout?: string;
  templateType?: string;
  imageRatio?: string;
  aspectRatio?: string;
  autoPlay?: boolean;
  interval?: number;
  showDots?: boolean;
  showArrows?: boolean;
  showPrice?: boolean;
  showButton?: boolean;
  displayMode?: string;
  actionStyle?: string;
  mobileColumns?: number;
  titleSize?: string;
  primaryText?: string;
  secondaryText?: string;
  secondaryLink?: string;
  backgroundImage?: string;
  eventImage?: string;
  targetDate?: string;
  summary?: string;
  beforeImage?: string;
  afterImage?: string;
  beforeLabel?: string;
  afterLabel?: string;
  beforeAltText?: string;
  afterAltText?: string;
  mainAltText?: string;
  detailAltText?: string;
  mainImageRatio?: string;
  detailImageRatio?: string;
  leadImage?: string;
  leadAltText?: string;
  detailImageOne?: string;
  detailOneAltText?: string;
  detailImageTwo?: string;
  detailTwoAltText?: string;
  leadImageRatio?: string;
  detailOneRatio?: string;
  detailTwoRatio?: string;
  bgImage?: string;
  videoUrl?: string;
  posterUrl?: string;
  loop?: boolean;
  muted?: boolean;
  showControls?: boolean;
  // doublePoster 专用
  mainImage?: string;
  detailImage?: string;
}

export interface PageModuleLayout {
  [key: string]: unknown;
  template: string;       // "leftTextRightImage" | "rightTextLeftImage" | "stacked" | ...
  alignment?: string;     // "center" | "left" — 首屏等舞台模板的文字位置受控档
  desktopColumns?: string; // "8-4" | "6-6" | "4-8"
  textPosition?: string;  // "left" | "right" | "overlay"
  desktopRatio?: string;
  mobileRatio?: string;
  split?: string;
  maxHeight?: number;
  videoWidth?: string;
}

export interface PageModuleStyle {
  [key: string]: unknown;
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
  desktopFocusX?: number;
  desktopFocusY?: number;
  mobileFocusX?: number;
  mobileFocusY?: number;
  leadFocusX?: number;
  leadFocusY?: number;
  beforeFocusX?: number;
  beforeFocusY?: number;
  afterFocusX?: number;
  afterFocusY?: number;
  gap?: number;
  overlayPreset?: string;
  detailOneFocusX?: number;
  detailOneFocusY?: number;
  detailTwoFocusX?: number;
  detailTwoFocusY?: number;
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

export type RenderablePageModule = Pick<
  PageModule,
  "content" | "layoutConfig" | "styleConfig"
>;
