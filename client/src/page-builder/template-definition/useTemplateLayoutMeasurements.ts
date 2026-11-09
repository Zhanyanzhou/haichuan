import { useLayoutEffect, useState, type RefObject } from "react";
import type { TemplateDefinitionV2, TemplateInstanceLayoutOverridesByNodeId } from "./generated/templateDefinition.generated";
import type { CompileDynamicTemplateRenderPlanOptions, CompileDynamicTemplateRenderPlanResult } from "./renderPlan";
import type { ContentTemplateRenderMode } from "../runtime/ContentTemplateRenderSurface";
import type { PairedCanvasRatio } from "./pairedCanvas";
import { heroFrameExceedsViewport } from "./mobileWorkGrid";
import { splitCopyShouldStack } from "./templateDimensions";

interface TemplateLayoutMeasurementsOptions {
  rootRef: RefObject<HTMLDivElement>;
  definition: TemplateDefinitionV2;
  result: CompileDynamicTemplateRenderPlanResult;
  device: "desktop" | "mobile";
  mode: ContentTemplateRenderMode;
  contentBySlotId?: Record<string, unknown>;
  hiddenSlotIds?: readonly string[];
  layoutOverridesByNodeId?: TemplateInstanceLayoutOverridesByNodeId;
  pageSettings?: CompileDynamicTemplateRenderPlanOptions["pageSettings"];
  showEmptySlots?: boolean;
  imageCarriesCopy: boolean;
  explicitCanvasRatio?: PairedCanvasRatio | null;
  heroMediaFrame: boolean;
  sectionRole: TemplateDefinitionV2["metadata"]["sectionRole"];
}

function overflowObjectName(item: HTMLElement): string {
  return item.getAttribute("data-template-node-label")?.trim()
    || item.getAttribute("data-template-slot-id")?.trim()
    || item.getAttribute("data-template-node-id")?.trim()
    || "未命名对象";
}

/**
 * 只读取实际 DOM 几何并返回当前画面的布局修正与编辑提示。
 * 不写模板、页面内容或编辑历史；所有观察器跟随当前渲染实例清理。
 * 模板编译和构图策略仍由 Renderer 与已有几何函数决定。
 */
export function useTemplateLayoutMeasurements({
  rootRef, definition, result, device, mode, contentBySlotId, hiddenSlotIds,
  layoutOverridesByNodeId, pageSettings, showEmptySlots, imageCarriesCopy,
  explicitCanvasRatio, heroMediaFrame, sectionRole,
}: TemplateLayoutMeasurementsOptions) {
  const hasExplicitCanvasRatio = Boolean(explicitCanvasRatio);
  const canvasRatioWidth = explicitCanvasRatio?.width;
  const canvasRatioHeight = explicitCanvasRatio?.height;
  const renderTemplateId = result.ok ? result.plan.templateId : "";
  const [fixedCanvasOverflow, setFixedCanvasOverflow] = useState("");
  const [fixedCanvasSpill, setFixedCanvasSpill] = useState(0);
  useLayoutEffect(() => {
    const canvas = rootRef.current;
    const owner = canvas?.ownerDocument.defaultView;
    if (!canvas || !owner || !hasExplicitCanvasRatio) {
      setFixedCanvasOverflow("");
      setFixedCanvasSpill(0);
      return;
    }
    // 固定根仍按比例取高。溢出的正向内容在框外占位，避免被下一节覆盖。
    const frameRoot = canvas.firstElementChild;
    const reserveSpill = definition.metadata.geometryPolicy !== "hero-media-frame"
      && canvas.dataset.templateFixedCanvas === "true"
      && frameRoot instanceof owner.HTMLElement;
    if (!reserveSpill) setFixedCanvasSpill(0);
    if (mode !== "editor") {
      setFixedCanvasOverflow("");
      if (!reserveSpill) return;
    }
    const nodes = [...canvas.querySelectorAll<HTMLElement>("[data-template-node-id]")];
    const update = () => {
      if (reserveSpill) {
        const spill = frameRoot.scrollHeight - frameRoot.clientHeight;
        setFixedCanvasSpill(spill > 2 ? spill : 0);
      }
      if (mode !== "editor") return;
      const frame = canvas.getBoundingClientRect();
      const names: string[] = [];
      for (const node of nodes) {
        if (names.length >= 4) break;
        if (node.closest("[data-template-artwork-copy], .hc-dynamic-template__artwork-copy")) continue;
        const box = node.getBoundingClientRect();
        if (box.width < 1 || box.height < 1) continue;
        const past = box.left < frame.left - 1 || box.top < frame.top - 1
          || box.right > frame.right + 1 || box.bottom > frame.bottom + 1
          || (/Heading|Text|RichText|Badge/.test(node.dataset.templateNodeType ?? "")
            // 中文字形可能超出行盒 1～2px；这不等于少了一行，几何越框仍按上面的 1px 检查。
            && node.scrollHeight > node.clientHeight + 2);
        if (!past) continue;
        const name = definition.nodes[node.dataset.templateNodeId ?? ""]?.name ?? overflowObjectName(node);
        if (!names.includes(name)) names.push(name);
      }
      const deviceLabel = device === "mobile" ? "手机" : "桌面";
      const overflow = names.length > 0
        ? `${deviceLabel}固定画幅里，${names.join("、")}超出画框。请缩短文案或调整构图。`
        : "";
      setFixedCanvasOverflow((current) => current === overflow ? current : overflow);
    };
    update();
    const observer = new owner.ResizeObserver(update);
    observer.observe(canvas);
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [rootRef, definition, contentBySlotId, device, hasExplicitCanvasRatio, canvasRatioWidth, canvasRatioHeight,
    hiddenSlotIds, imageCarriesCopy, layoutOverridesByNodeId, mode, pageSettings, showEmptySlots]);
  const [largePhone, setLargePhone] = useState(false);
  const [heroCopyBelow, setHeroCopyBelow] = useState(false);
  const [heroFrameCapped, setHeroFrameCapped] = useState(false);
  const copySignature = Object.values(contentBySlotId ?? {})
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && "text" in item) return String(item.text ?? "");
      return "";
    })
    .join("\u0001");
  const inkSignature = Object.values(definition.slots)
    .map((slot) => `${slot.desktopRules?.color ?? ""}\u0001${slot.mobileRules?.color ?? ""}`)
    .join("\u0002");
  useLayoutEffect(() => {
    const host = rootRef.current;
    const owner = host?.ownerDocument.defaultView;
    if (!heroMediaFrame || !host || !owner) {
      setHeroCopyBelow(false);
      setHeroFrameCapped(false);
      return undefined;
    }
    const update = () => {
      const style = owner.getComputedStyle(host);
      // 装修 iframe 的高度随内容增长。几何计算和 CSS 都读画布声明的模拟视口。
      const height = Number.parseFloat(style.getPropertyValue("--homepage-editor-preview-height")) || owner.innerHeight;
      const short = height > 0 && height < 480;
      const header = Number.parseFloat(style.getPropertyValue("--site-header-height")) || 0;
      const capped = device === "mobile" && heroFrameExceedsViewport(host.clientWidth, height, header);
      let copyExceedsFrame = false;
      if (!short && !capped && !imageCarriesCopy) {
        const frame = host.querySelector("[data-template-mobile-copy-frame]");
        const ratio = frame?.querySelector("[data-template-hero-frame-ratio]");
        const copy = frame?.querySelector("[data-template-hero-frame-copy]");
        const rawRatio = ratio?.getAttribute("data-template-hero-frame-ratio") ?? "";
        const [ratioWidth, ratioHeight] = rawRatio.split("/").map((part) => Number(part.trim()));
        if (ratio instanceof owner.HTMLElement && copy instanceof owner.HTMLElement && ratioWidth > 0 && ratioHeight > 0) {
          // 首帧宽度还是 0 时不能把标题判成溢出，否则横图会把文案锁到图下。
          if (ratio.clientWidth > 0) {
            const intended = ratio.clientWidth * (ratioHeight / ratioWidth);
            copyExceedsFrame = copy.scrollHeight > intended + 8;
          }
        } else {
          const image = host.querySelector("[data-template-semantic-role='backgroundImage'], [data-template-semantic-role='heroImage']");
          const texts = [...host.querySelectorAll("[data-template-node-type='HeadingSlot'], [data-template-node-type='TextSlot'], [data-template-node-type='RichTextSlot'], [data-template-node-type='BadgeSlot']")]
            .filter((node): node is HTMLElement => node instanceof owner.HTMLElement && node.getAttribute("data-template-visual-collapse") !== "true");
          if (image instanceof owner.HTMLElement && texts.length > 0 && image.getBoundingClientRect().height > 0) {
            const top = Math.min(...texts.map((node) => node.getBoundingClientRect().top));
            const bottom = Math.max(...texts.map((node) => node.getBoundingClientRect().bottom));
            copyExceedsFrame = bottom - top + 64 > image.getBoundingClientRect().height;
          }
        }
      }
      setHeroCopyBelow(short || capped || copyExceedsFrame);
      setHeroFrameCapped(capped);
    };
    update();
    const observer = new owner.ResizeObserver(update);
    observer.observe(host);
    owner.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      owner.removeEventListener("resize", update);
    };
  }, [rootRef, copySignature, device, heroMediaFrame, imageCarriesCopy, result.ok]);
  useLayoutEffect(() => {
    const element = rootRef.current;
    if (!element || device !== "mobile") {
      setLargePhone(false);
      return undefined;
    }
    const update = () => {
      const width = element.clientWidth;
      setLargePhone(width >= 600 && width < 768);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [rootRef, device, result.ok, renderTemplateId]);
  const [narrowSplit, setNarrowSplit] = useState(false);
  const [copyOverflow, setCopyOverflow] = useState("");
  const [pairedImageCompressed, setPairedImageCompressed] = useState(false);
  const [textContrastNote, setTextContrastNote] = useState<"none" | "corrected" | "low" | "both">("none");
  useLayoutEffect(() => {
    const element = rootRef.current;
    if (!element || !result.ok) {
      setNarrowSplit(false);
      setCopyOverflow("");
      setPairedImageCompressed(false);
      setTextContrastNote("none");
      return undefined;
    }
    const update = () => {
      if (!element.isConnected) return;
      const fontSize = Number.parseFloat(getComputedStyle(element).fontSize) || 16;
      const rows = [...element.querySelectorAll<HTMLElement>("[data-template-split-row='true']")];
      // 同步量原构图，浏览器绘制前恢复堆叠样式。用堆叠后的满宽列做判定会来回跳动。
      const wasStacked = element.hasAttribute("data-template-narrow-split");
      if (wasStacked) element.removeAttribute("data-template-narrow-split");
      const stack = rows.some((row) => {
        const columns = Number(row.getAttribute("data-template-split-columns")) || 2;
        const gap = Number.parseFloat(getComputedStyle(row).columnGap) || 0;
        const text = row.querySelector<HTMLElement>("[data-template-node-type*='Text'], [data-template-node-type*='Heading']");
        const rowFont = Number.parseFloat(getComputedStyle(text ?? element).fontSize) || fontSize;
        return splitCopyShouldStack({
          sectionRole,
          containerWidth: row.clientWidth,
          fontSizePx: rowFont,
          columns,
          gapPx: gap,
          layoutMode: row.getAttribute("data-template-layout") ?? "flow",
          copyColumnWidth: text?.clientWidth,
        });
      });
      if (wasStacked) element.setAttribute("data-template-narrow-split", "true");
      setNarrowSplit((current) => current === stack ? current : stack);
      if (mode === "editor") {
        const corrected = Boolean(element.querySelector("[data-template-text-contrast='corrected']"));
        const low = Boolean(element.querySelector("[data-template-text-contrast='low']"));
        const nextContrast = corrected && low ? "both" as const : corrected ? "corrected" as const : low ? "low" as const : "none" as const;
        setTextContrastNote((current) => current === nextContrast ? current : nextContrast);
        const image = element.querySelector<HTMLElement>("[data-template-semantic-role='backgroundImage'], [data-template-semantic-role='heroImage']");
        const compressed = device === "mobile"
          && sectionRole === "page-hero"
          && Boolean(element.getAttribute("data-template-paired-canvas"))
          && element.clientHeight > 80
          && Boolean(image && image.clientHeight > 24 && image.clientHeight < element.clientHeight * 0.5);
        setPairedImageCompressed((current) => current === compressed ? current : compressed);
      } else {
        setTextContrastNote((current) => current === "none" ? current : "none");
        setPairedImageCompressed((current) => current ? false : current);
      }
      if (mode !== "editor" || stack) {
        setCopyOverflow((current) => current ? "" : current);
        return;
      }
      const rootBox = element.getBoundingClientRect();
      const names: string[] = [];
      for (const item of element.querySelectorAll<HTMLElement>("[data-template-slot-id]")) {
        if (names.length >= 4) break;
        if (item.closest("[data-template-artwork-copy], .hc-dynamic-template__artwork-copy")) continue;
        const box = item.getBoundingClientRect();
        const past = box.width > 1 && box.height > 1 && (
          box.right > rootBox.right + 8 || box.bottom > rootBox.bottom + 8
          || box.left < rootBox.left - 8 || box.top < rootBox.top - 8
        );
        const overflow = getComputedStyle(item).overflowY;
        const clipped = (overflow === "hidden" || overflow === "clip") && item.scrollHeight > item.clientHeight + 4;
        if (!past && !clipped) continue;
        const name = overflowObjectName(item);
        if (!names.includes(name)) names.push(name);
      }
      const deviceLabel = device === "mobile" ? "手机" : "桌面";
      const message = names.length > 0
        ? `${deviceLabel}画面上，${names.join("、")}超出画布。请缩短这些对象，或改排列后再看这一端。`
        : "";
      setCopyOverflow((current) => current === message ? current : message);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [rootRef, copySignature, device, inkSignature, mode, result.ok, sectionRole, renderTemplateId]);
  return { fixedCanvasOverflow, fixedCanvasSpill, largePhone, heroCopyBelow, heroFrameCapped, narrowSplit, copyOverflow, pairedImageCompressed, textContrastNote };
}
