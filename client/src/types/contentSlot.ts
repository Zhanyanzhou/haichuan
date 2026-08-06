/** 内容插槽 — 可视化编辑最小数据模型 */
export interface ContentSlot {
  id: number;
  slotKey: string;       // HOME_SIG_POSTER
  pageKey: string;       // "home"
  sectionKey: string;    // "signaturePoster"
  contentType: 'image' | 'video' | 'text' | 'link';
  desktopAsset?: string;
  mobileAsset?: string;
  title?: string;
  subtitle?: string;
  linkUrl?: string;
  altText?: string;
  sortOrder: number;
  isVisible: boolean;
  status: 'DRAFT' | 'PUBLISHED';
  updatedBy?: number;
  createdAt: string;
  updatedAt: string;
}

/** API 返回的已发布插槽映射 { slotKey: ContentSlot } */
export type PublishedSlots = Record<string, ContentSlot>;
