import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import {
  createContentTemplateMarker,
  getContentTemplateContract,
  getContentTemplatePreview,
} from "../generated/contentTemplates.generated";
import { puckConfig } from "../config/puckConfig";
import { getTemplatePreviewContent } from "./templatePreviewContent";
import ContentTemplateSkeletonPreview from "./ContentTemplateSkeletonPreview";
import {
  CONTENT_TEMPLATE_RENDER_SURFACE,
  ContentTemplateRenderSurfaceProvider,
} from "../runtime/ContentTemplateRenderSurface";

type PreviewViewport = "desktop" | "mobile";

type ContentTemplateRendererPreviewProps = {
  moduleType: string;
  viewport?: PreviewViewport;
  layoutData?: Record<string, unknown>;
  variant?: "structure" | "renderer";
};

function sanitizePreviewDefaults(value: unknown): unknown {
  if (typeof value === "string") {
    return /^https?:\/\//i.test(value) ? "" : value;
  }
  if (Array.isArray(value)) return value.map(sanitizePreviewDefaults);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, sanitizePreviewDefaults(nested)]),
    );
  }
  return value;
}

/**
 * 结构缩略图与真实 Renderer 均消费同一机器合同。
 * 调用方必须显式选择需要的证据层级；默认结构模式只用于轻量模板卡片。
 */
export default function ContentTemplateRendererPreview({
  moduleType,
  viewport = "desktop",
  layoutData,
  variant = "structure",
}: ContentTemplateRendererPreviewProps) {
  if (variant === "structure") {
    return (
      <ContentTemplateSkeletonPreview
        moduleType={moduleType}
        viewport={viewport}
        layoutData={layoutData}
      />
    );
  }
  return (
    <ContentTemplateRealRendererPreview
      moduleType={moduleType}
      viewport={viewport}
      layoutData={layoutData}
    />
  );
}

function ContentTemplateRealRendererPreview({
  moduleType,
  viewport = "desktop",
  layoutData,
}: ContentTemplateRendererPreviewProps) {
  const profile = getContentTemplatePreview(moduleType);
  const contract = getContentTemplateContract(moduleType);
  const component = (
    puckConfig.components as unknown as Record<
      string,
      {
        render?: (props: Record<string, unknown>) => ReactNode;
        defaultProps?: Record<string, unknown>;
      }
    >
  )[moduleType];
  const frameRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<HTMLDivElement>(null);
  const sourceWidth = viewport === "mobile" ? 390 : 1200;
  const sourceHeight = viewport === "mobile" ? 844 : 900;
  const fallbackRatio = contract?.defaultGeometryByViewport[viewport].frameAspectRatio ?? 1.6;
  const fallbackScale = viewport === "mobile" ? 6 / 13 : 1 / 4;

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const renderer = rendererRef.current;
    const ownerWindow = frame?.ownerDocument.defaultView;
    if (!frame || !renderer || !ownerWindow) return;
    let measureTimer = 0;
    let lastObservedWidth = -1;
    let lastObservedRendererHeight = -1;
    let disposed = false;

    const measure = () => {
      const width = frame.clientWidth;
      const naturalHeight = renderer.scrollHeight;
      if (width <= 0 || naturalHeight <= 0) return;
      lastObservedRendererHeight = naturalHeight;
      const scale = width / sourceWidth;
      const height = naturalHeight * scale;
      // 直接在 layout effect 中同步落位，避免首帧先按桌面兜底比例放大，
      // 下一任务再缩回卡片宽度所造成的预览闪动。这里不触发 React 状态更新，
      // 因而几十张真实 Renderer 同时挂载时也不会形成 nested update。
      frame.style.height = `${height}px`;
      frame.style.aspectRatio = "auto";
      renderer.style.transform = `scale(${scale})`;
    };

    const scheduleMeasure = () => {
      if (disposed) return;
      ownerWindow.clearTimeout(measureTimer);
      // 每个预览单独进入浏览器任务，避免几十个预览在同一 layout/rAF
      // 提交中同步刷新 React 状态并触发 nested update 上限。
      measureTimer = ownerWindow.setTimeout(() => {
        measureTimer = 0;
        measure();
      }, 0);
    };

    lastObservedWidth = frame.clientWidth;
    // 首次测量必须在浏览器绘制前完成；后续异步素材、字体和容器变化再分散到任务中。
    measure();
    const resizeObserver = new ownerWindow.ResizeObserver(() => {
      const width = frame.clientWidth;
      // frame 高度由本组件回写；只响应真实宽度变化，避免高度观察反馈环。
      if (Math.abs(width - lastObservedWidth) < 0.5) return;
      lastObservedWidth = width;
      scheduleMeasure();
    });
    resizeObserver.observe(frame);
    const rendererResizeObserver = new ownerWindow.ResizeObserver(() => {
      const naturalHeight = renderer.scrollHeight;
      if (Math.abs(naturalHeight - lastObservedRendererHeight) < 0.5) return;
      lastObservedRendererHeight = naturalHeight;
      scheduleMeasure();
    });
    // 字体替换、图片解码和响应式重排不一定产生 DOM mutation；直接观察真实
    // Renderer 的尺寸，才能在内容收缩时同步去掉缩略图底部多余空间。
    rendererResizeObserver.observe(renderer);

    // 异步商品、图片和字体仍可能改变真实 Renderer 高度；它们通过内容/加载事件补测。
    const mutationObserver = new ownerWindow.MutationObserver(scheduleMeasure);
    mutationObserver.observe(renderer, {
      characterData: true,
      childList: true,
      subtree: true,
    });
    renderer.addEventListener("load", scheduleMeasure, true);
    void frame.ownerDocument.fonts?.ready.then(scheduleMeasure);

    return () => {
      disposed = true;
      ownerWindow.clearTimeout(measureTimer);
      resizeObserver.disconnect();
      rendererResizeObserver.disconnect();
      mutationObserver.disconnect();
      renderer.removeEventListener("load", scheduleMeasure, true);
    };
  }, [fallbackRatio, layoutData, moduleType, sourceWidth]);

  if (!profile || !contract || typeof component?.render !== "function") return null;

  const props = {
    ...(sanitizePreviewDefaults(component.defaultProps ?? {}) as Record<string, unknown>),
    ...getTemplatePreviewContent(contract.key),
    id: `template-library-preview-${contract.key}`,
    __contentTemplate: createContentTemplateMarker(moduleType),
    ...(layoutData ? { __instanceOverrides: layoutData } : {}),
  };
  return (
    <div
      ref={frameRef}
      className={`homepage-editor__template-preview-img is-renderer is-${viewport}`}
      role="img"
      aria-label={`${profile.displayName}的${viewport === "desktop" ? "桌面" : "手机"}真实构图预览：${profile.purpose}`}
      data-content-template-preview={contract.key}
      data-preview-only="true"
      data-preview-art-direction="neutral-template-preview-v1"
      data-preview-viewport={viewport}
      data-desktop-order={contract.order.desktop.join(",")}
      data-mobile-order={contract.order.mobile.join(",")}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: String(fallbackRatio),
        overflow: "hidden",
        background: "#F4F5F5",
        pointerEvents: "none",
      }}
    >
      <div
        ref={rendererRef}
        aria-hidden="true"
        {...({ inert: "" } as Record<string, string>)}
        style={{
          width: sourceWidth,
          "--homepage-editor-viewport-height": `${sourceHeight}px`,
          transform: `scale(${fallbackScale})`,
          transformOrigin: "top left",
        } as CSSProperties & Record<"--homepage-editor-viewport-height", string>}
      >
        <ContentTemplateRenderSurfaceProvider
          surface={CONTENT_TEMPLATE_RENDER_SURFACE.CATALOG_PREVIEW}
        >
          <style>{".hc-contract-frame *{animation:none!important;transition:none!important}"}</style>
          {component.render(props)}
        </ContentTemplateRenderSurfaceProvider>
      </div>
    </div>
  );
}
