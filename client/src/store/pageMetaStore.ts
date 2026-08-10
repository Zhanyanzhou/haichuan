/**
 * 页面级 SEO 元信息覆盖 Store
 *
 * 装修页面（Puck PageDocument）的 metadata 含 seoTitle / seoDescription / ogImage，
 * 前台 Home 加载已发布文档时写入本 store；PublicLayout 在站点级 SEO 之上叠加，
 * 页面级优先。页面卸载时 clear，回退到站点级（settingsApi）默认值。
 */
import { create } from 'zustand';

export interface PageMeta {
  /** 页面标题（覆盖站点 seoTitle） */
  title?: string;
  /** 页面描述（覆盖站点 seoDescription） */
  description?: string;
  /** 社交分享卡片图（og:image / twitter:image） */
  image?: string;
}

interface PageMetaState {
  meta: PageMeta;
  setMeta: (meta: PageMeta) => void;
  clear: () => void;
}

export const usePageMetaStore = create<PageMetaState>((set) => ({
  meta: {},
  setMeta: (meta) => set({ meta }),
  clear: () => set({ meta: {} }),
}));
