import { useEffect, useMemo, useRef, useState } from "react";
import DynamicTemplateRenderer from "../template-definition/DynamicTemplateRenderer";
import type { TemplateDefinitionV2 } from "../template-definition/generated/templateDefinition.generated";
import { createTemplateRecipePreviewContent } from "./previewContent";
/** 所有方案视图都按同一设计像素渲染，容器只决定显示缩放。 */
export default function TemplateRecipePreview({ definition, device = "desktop", compact = false, highlightedNodeId }: { definition: TemplateDefinitionV2; device?: "desktop" | "mobile"; compact?: boolean; highlightedNodeId?: string }) {
  const previewContent = useMemo(() => createTemplateRecipePreviewContent(definition), [definition]);
  const host = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [availableSize, setAvailableSize] = useState({ width: 280, height: 360 });
  const [viewportWidth, setViewportWidth] = useState(278);
  const [naturalHeight, setNaturalHeight] = useState(390);
  const canvas = definition.metadata.canvasSize!;
  const width = device === "mobile" ? 390 : canvas.width;
  const previewWidth = Math.min(availableSize.width, device === "mobile" ? width : availableSize.height * canvas.aspectRatio);
  const scale = viewportWidth / width;
  useEffect(() => {
    content.current?.querySelectorAll<HTMLElement>("[data-template-node-id]").forEach((element) => {
      element.toggleAttribute("data-recipe-highlight", element.dataset.templateNodeId === highlightedNodeId);
    });
  }, [definition, highlightedNodeId]);
  useEffect(() => {
    const viewport = host.current;
    const stage = viewport?.parentElement;
    if (!viewport || !stage) return;
    let animationFrameId = 0;
    let nextViewportWidth: number | null = null;
    let nextAvailable: { width: number; height: number } | null = null;
    const commit = () => {
      animationFrameId = 0;
      if (nextViewportWidth !== null) {
        setViewportWidth(nextViewportWidth);
        nextViewportWidth = null;
      }
      if (nextAvailable) {
        setAvailableSize(nextAvailable);
        nextAvailable = null;
      }
    };
    const observer = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.target === viewport) nextViewportWidth = entry.contentRect.width;
        else nextAvailable = { width: entry.contentRect.width, height: entry.contentRect.height };
      });
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      animationFrameId = requestAnimationFrame(commit);
    });
    observer.observe(stage);
    observer.observe(viewport);
    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      observer.disconnect();
    };
  }, []);
  useEffect(() => {
    const element = content.current;
    if (!element) return;
    let animationFrameId = 0;
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.max(1, entry.contentRect.height);
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      animationFrameId = requestAnimationFrame(() => {
        animationFrameId = 0;
        setNaturalHeight(next);
      });
    });
    observer.observe(element);
    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      observer.disconnect();
    };
  }, []);
  return <div ref={host} className={`template-recipe__preview${compact ? " template-recipe__preview--option" : ""}${device === "mobile" ? " template-recipe__preview--mobile" : ""}`} aria-label={compact ? undefined : "生成方案预览"} data-preview-device={device} data-canvas-width={canvas.width} data-canvas-height={canvas.height} style={{ width: previewWidth, ...(device === "mobile" ? { height: Math.min(availableSize.height, naturalHeight * scale) } : { aspectRatio: canvas.aspectRatio }) }}>
    <div style={{ height: device === "mobile" ? naturalHeight * scale : "100%" }}>
      <div ref={content} className="template-recipe__preview-render" style={{ width, height: device === "mobile" ? "auto" : canvas.height, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        <DynamicTemplateRenderer definition={definition} contentBySlotId={previewContent} device={device} breakpoint={device} mode="preview" showEmptySlots />
      </div>
    </div>
  </div>;
}
