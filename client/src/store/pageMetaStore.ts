/**
 * 页面级 SEO 元信息覆盖 Store
 *
 * 装修页面（Puck PageDocument）的 metadata 含 seoTitle / seoDescription / ogImage，
 * PublicLayout 直接读取已发布文档并给予最高优先级；本 store 保留代码页面、
 * 商品详情、错误页等非 PageDocument SEO。页面卸载时 clear，回退到路由或站点默认值。
 */
import { create } from 'zustand';

export interface PageMeta {
  /** 页面标题（覆盖站点 seoTitle） */
  title?: string;
  /** 页面描述（覆盖站点 seoDescription） */
  description?: string;
  /** 社交分享卡片图（og:image / twitter:image） */
  image?: string;
  /** true 时输出 noindex,nofollow；错误页和受控预览使用。 */
  noIndex?: boolean;
  /** 未设置时使用当前路径；null 表示本页不得输出 canonical。 */
  canonicalPath?: string | null;
}

/** 只读取 PageDocument 正式声明的 SEO 字段，不把其他 metadata 混入公开页面。 */
export function getPageDocumentMeta(metadata: unknown): PageMeta {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  const value = metadata as Record<string, unknown>;
  const title = typeof value.seoTitle === "string" ? value.seoTitle.trim() : "";
  const description = typeof value.seoDescription === "string"
    ? value.seoDescription.trim()
    : "";
  const image = typeof value.ogImage === "string" ? value.ogImage.trim() : "";
  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(image ? { image } : {}),
  };
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
