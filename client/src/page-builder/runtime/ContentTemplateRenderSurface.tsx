import { createContext, useContext, type ReactNode } from "react";

export const CONTENT_TEMPLATE_RENDER_SURFACE = {
  PUBLIC: "public",
  CATALOG_PREVIEW: "catalog-preview",
} as const;

export type ContentTemplateRenderSurface =
  typeof CONTENT_TEMPLATE_RENDER_SURFACE[keyof typeof CONTENT_TEMPLATE_RENDER_SURFACE];

/** 所有内容模板消费面共用的渲染模式；目录预览成员只由上方常量定义。 */
export type ContentTemplateRenderMode =
  | ContentTemplateRenderSurface
  | "editor"
  | "preview"
  | "thumbnail";

const ContentTemplateRenderSurfaceContext = createContext<ContentTemplateRenderSurface>(
  CONTENT_TEMPLATE_RENDER_SURFACE.PUBLIC,
);

export function ContentTemplateRenderSurfaceProvider({
  children,
  surface,
}: {
  children: ReactNode;
  surface: ContentTemplateRenderSurface;
}) {
  return (
    <ContentTemplateRenderSurfaceContext.Provider value={surface}>
      {children}
    </ContentTemplateRenderSurfaceContext.Provider>
  );
}

export function useContentTemplateRenderSurface() {
  return useContext(ContentTemplateRenderSurfaceContext);
}
