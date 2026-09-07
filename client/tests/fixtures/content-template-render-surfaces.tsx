import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { galleryPuckConfig } from "../../src/page-builder/adapters/gallery.puck";
import { videoPuckConfig } from "../../src/page-builder/adapters/video.puck";
import {
  createContentTemplateMarker,
} from "../../src/page-builder/generated/contentTemplates.generated";
import ContentTemplateRendererPreview from "../../src/page-builder/preview/ContentTemplateRendererPreview";
import ContentTemplateContractFrame from "../../src/page-builder/runtime/ContentTemplateContractFrame";
import PuckDocumentRenderer from "../../src/page-builder/runtime/PuckDocumentRenderer";
import {
  CONTENT_TEMPLATE_RENDER_SURFACE,
  ContentTemplateRenderSurfaceProvider,
} from "../../src/page-builder/runtime/ContentTemplateRenderSurface";
import "../../src/styles/globals.css";

const publicProps = {
  ...videoPuckConfig.defaultProps,
  id: "public-empty-video",
  videoUrl: "",
  posterUrl: "",
  __contentTemplate: createContentTemplateMarker("视频区块"),
};
const viewport = new URLSearchParams(window.location.search).get("viewport") === "mobile"
  ? "mobile"
  : "desktop";
const editorProps = {
  ...publicProps,
  id: "template-editor:empty-video",
};
const filledProps = {
  ...publicProps,
  id: "filled-video",
  videoUrl: "/media/contract-test.mp4",
  posterUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 9'%3E%3Crect width='16' height='9' fill='%23ececec'/%3E%3C/svg%3E",
  videoDescription: "视频封面测试",
  title: "品牌影片标题",
  subtitle: "品牌影片副标题",
  actionText: "了解更多",
  targetType: "page" as const,
  linkUrl: "/about",
};

createRoot(document.getElementById("root")!).render(
  <MemoryRouter>
    <main>
      <section aria-label="公开空视频">
        <PuckDocumentRenderer
          data={{ content: [{ type: "视频区块", props: publicProps }], root: { props: {} } }}
          mode="public"
        />
      </section>
      <section aria-label="页面预览空视频">
        <PuckDocumentRenderer
          data={{ content: [{ type: "视频区块", props: publicProps }], root: { props: {} } }}
          mode="preview"
        />
      </section>
      <section aria-label="编辑器空视频">
        <ContentTemplateContractFrame moduleType="视频区块" mode="editor" props={editorProps}>
          {videoPuckConfig.render(editorProps)}
        </ContentTemplateContractFrame>
      </section>
      <section aria-label="目录空视频">
        <ContentTemplateRendererPreview moduleType="视频区块" viewport={viewport} variant="renderer" />
      </section>
      <section aria-label="公开已填视频">
        <PuckDocumentRenderer
          data={{ content: [{ type: "视频区块", props: filledProps }], root: { props: {} } }}
          mode="public"
        />
      </section>
      <section aria-label="页面预览已填视频">
        <PuckDocumentRenderer
          data={{ content: [{ type: "视频区块", props: filledProps }], root: { props: {} } }}
          mode="preview"
        />
      </section>
      <section aria-label="编辑器已填视频">
        <ContentTemplateContractFrame moduleType="视频区块" mode="editor" props={filledProps}>
          {videoPuckConfig.render(filledProps)}
        </ContentTemplateContractFrame>
      </section>
      <section aria-label="目录已填视频">
        <ContentTemplateRenderSurfaceProvider surface={CONTENT_TEMPLATE_RENDER_SURFACE.CATALOG_PREVIEW}>
          {videoPuckConfig.render(filledProps)}
        </ContentTemplateRenderSurfaceProvider>
      </section>
      <section aria-label="编辑器空图库">
        {galleryPuckConfig.render(galleryPuckConfig.defaultProps)}
      </section>
    </main>
  </MemoryRouter>,
);
