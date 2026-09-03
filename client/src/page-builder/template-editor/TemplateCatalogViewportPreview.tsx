import {
  Component,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  AUTO_ARTBOARD_MIN_HEIGHT,
  syncTemplateViewportStyles,
} from "./TemplateViewportFrame";
import type {
  TemplateCatalogSlotDescriptor,
  TemplateCatalogSlotKind,
} from "./templatePreviewModel";

interface TemplateCatalogSlotBox extends TemplateCatalogSlotDescriptor {
  key: string;
  left: number;
  top: number;
  width: number;
  height: number;
  showLabel: boolean;
  labelLeft: number;
  labelTop: number;
}

// 同屏目录卡片会并行建立 iframe 与同步样式；低性能设备上 1.2 秒不足以区分
// “渲染器缺失”和“仍在完成首帧”。保留有限等待，避免短暂拥塞被永久误报。
const PREVIEW_RENDER_TIMEOUT_MS = 3_000;

interface TemplateCatalogViewportPreviewProps {
  children?: ReactNode;
  fallbackHeight: number;
  heightMode: "fixed" | "aspect-ratio" | "auto";
  ratioLabel: string;
  slots: TemplateCatalogSlotDescriptor[];
  sourceWidth: number;
  templateKey: string;
  title: string;
  unavailable?: boolean;
  viewport: "desktop" | "mobile";
}

class TemplateCatalogPreviewErrorBoundary extends Component<{
  children: ReactNode;
  onError: () => void;
}, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    this.props.onError();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function normalizeContractSlotKind(
  value: string | undefined,
  semanticIdentity = "",
): TemplateCatalogSlotKind | undefined {
  if (value === "media") return "media";
  if (value === "text") {
    if (/(?:subtitle|summary|description|body)/i.test(semanticIdentity)) return "description";
    if (/(?:title|heading)/i.test(semanticIdentity)) return "title";
    return "text";
  }
  if (value === "action") return "button";
  if (value === "product") return "product";
  if (value === "collection" || value === "category") return "collection";
  if (value === "business") return "business";
  return undefined;
}

function contractSlotLabel(kind: TemplateCatalogSlotKind, currentLabel: string | undefined) {
  if (kind === "title") return "标题槽位";
  if (kind === "description") return "描述槽位";
  if (kind === "button") return "按钮槽位";
  if (kind === "product") return "商品槽位";
  if (kind === "collection") return "集合槽位";
  if (kind === "business") return "业务槽位";
  return currentLabel || (kind === "media" ? "图片槽位" : "文字槽位");
}

function getRenderedTextSlotKind(element: HTMLElement): "title" | "description" | "text" {
  const identity = `${element.dataset.editorField || ""} ${element.dataset.hcKeyboardNode || ""}`;
  if (/(?:eyebrow|badge|label|tag)/i.test(identity)) return "text";
  if (/(?:subtitle|summary|description|body)/i.test(identity) || element.tagName === "P") {
    return "description";
  }
  if (/(?:title|heading)/i.test(identity) || /^H[1-6]$/.test(element.tagName)) return "title";
  return "text";
}

function compactContractSlotLabel(kind: TemplateCatalogSlotKind, label: string) {
  if (kind === "media") return label.includes("视频") ? "视频" : "图片";
  if (kind === "title") return "标题";
  if (kind === "description") return "描述";
  if (kind === "button") return "按钮";
  if (kind === "product") return "商品";
  if (kind === "collection") return "集合";
  if (kind === "business") return "业务";
  return label.includes("标题") ? "标题" : label.includes("描述") ? "描述" : "文字";
}

function slotBoxesEqual(current: TemplateCatalogSlotBox[], next: TemplateCatalogSlotBox[]) {
  if (current.length !== next.length) return false;
  return current.every((box, index) => {
    const candidate = next[index];
    return Boolean(
      candidate
      && box.key === candidate.key
      && box.kind === candidate.kind
      && box.label === candidate.label
      && box.compactLabel === candidate.compactLabel
      && box.showLabel === candidate.showLabel
      && Math.abs(box.labelLeft - candidate.labelLeft) < 0.5
      && Math.abs(box.labelTop - candidate.labelTop) < 0.5
      && Math.abs(box.left - candidate.left) < 0.5
      && Math.abs(box.top - candidate.top) < 0.5
      && Math.abs(box.width - candidate.width) < 0.5
      && Math.abs(box.height - candidate.height) < 0.5
    );
  });
}

function placeSlotLabels(
  boxes: TemplateCatalogSlotBox[],
  viewportWidth: number,
  viewportHeight: number,
) {
  const occupied: Array<{ left: number; top: number; right: number; bottom: number }> = [];
  const labelHeight = 20;
  return boxes.map((box) => {
    if (!box.showLabel) return box;
    const labelWidth = Math.min(
      // 单列会显示完整“图片槽位”等文案；按完整标签预留空间，
      // 双列切换成短标签时只会更宽松，不会重新制造遮挡。
      Math.max(34, box.label.length * 12 + 12),
      Math.max(34, viewportWidth),
    );
    const left = Math.max(0, Math.min(box.left + 2, viewportWidth - labelWidth));
    const preferredTop = Math.max(0, Math.min(box.top + 2, viewportHeight - labelHeight));
    const candidates = [
      preferredTop,
      Math.max(0, Math.min(box.top - labelHeight - 2, viewportHeight - labelHeight)),
      Math.max(0, Math.min(box.top + box.height + 2, viewportHeight - labelHeight)),
      ...Array.from({ length: Math.max(1, Math.ceil(viewportHeight / labelHeight)) }, (_, index) => (
        Math.min(index * labelHeight, Math.max(0, viewportHeight - labelHeight))
      )),
    ];
    const top = candidates.find((candidateTop) => !occupied.some((current) => (
      left < current.right
      && left + labelWidth > current.left
      && candidateTop < current.bottom
      && candidateTop + labelHeight > current.top
    )));
    if (top === undefined) return { ...box, showLabel: false };
    occupied.push({ left, top, right: left + labelWidth, bottom: top + labelHeight });
    return { ...box, labelLeft: left, labelTop: top };
  });
}

export default function TemplateCatalogViewportPreview({
  children,
  fallbackHeight,
  heightMode,
  ratioLabel,
  slots,
  sourceWidth,
  templateKey,
  title,
  unavailable = false,
  viewport,
}: TemplateCatalogViewportPreviewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [contentElement, setContentElement] = useState<HTMLDivElement | null>(null);
  const portalStyleSyncDocumentRef = useRef<Document | null>(null);
  const styleSyncIdRef = useRef(0);
  const previewTimedOutRef = useRef(false);
  const initialNaturalHeight = heightMode === "auto"
    ? Math.max(AUTO_ARTBOARD_MIN_HEIGHT, fallbackHeight)
    : fallbackHeight;
  const [frameDocument, setFrameDocument] = useState<Document | null>(null);
  const [styleRevision, setStyleRevision] = useState(0);
  const [stylesReady, setStylesReady] = useState(false);
  const [renderFailed, setRenderFailed] = useState(false);
  const isUnavailable = unavailable || renderFailed;
  const [previewStatus, setPreviewStatus] = useState<"loading" | "ready" | "unavailable">(
    isUnavailable ? "unavailable" : "loading",
  );
  const [rendererReady, setRendererReady] = useState(false);
  const [slotBoxes, setSlotBoxes] = useState<TemplateCatalogSlotBox[]>([]);
  const [measurement, setMeasurement] = useState({
    naturalHeight: initialNaturalHeight,
    scale: viewport === "mobile" ? 0.25 : 0.1,
  });
  const slotDescriptorById = useMemo(
    () => new Map(slots.filter((slot) => !slot.roleId).map((slot) => [slot.slotId, slot])),
    [slots],
  );
  const roleDescriptorsByRoleId = useMemo(() => {
    const descriptors = new Map<string, TemplateCatalogSlotDescriptor[]>();
    slots.forEach((slot) => {
      if (!slot.roleId) return;
      descriptors.set(slot.roleId, [...(descriptors.get(slot.roleId) ?? []), slot]);
    });
    return descriptors;
  }, [slots]);

  const syncFrameStyles = useCallback((nextDocument: Document) => {
    const syncId = styleSyncIdRef.current + 1;
    styleSyncIdRef.current = syncId;
    setStylesReady(false);
    previewTimedOutRef.current = false;
    syncTemplateViewportStyles(nextDocument, () => setStyleRevision((value) => value + 1));
    const ownerWindow = nextDocument.defaultView;
    const styleLinks = Array.from(nextDocument.querySelectorAll<HTMLLinkElement>(
      'link[rel="stylesheet"]',
    ));
    const waitForStyleLinks = Promise.all(styleLinks.map((link) => link.sheet
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          const finish = () => resolve();
          link.addEventListener("load", finish, { once: true });
          link.addEventListener("error", finish, { once: true });
          ownerWindow?.requestAnimationFrame(() => {
            if (link.sheet) finish();
          });
          ownerWindow?.setTimeout(finish, 800);
        })));
    void waitForStyleLinks
      .then(() => nextDocument.fonts?.ready)
      .then(() => {
        if (
          styleSyncIdRef.current === syncId
          && frameRef.current?.contentDocument === nextDocument
        ) setStylesReady(true);
      });
  }, []);

  const connectFrame = useCallback(() => {
    const nextDocument = frameRef.current?.contentDocument ?? null;
    if (!nextDocument) return;
    setFrameDocument(nextDocument);
    syncFrameStyles(nextDocument);
  }, [syncFrameStyles]);

  useLayoutEffect(() => {
    styleSyncIdRef.current += 1;
    portalStyleSyncDocumentRef.current = null;
    setFrameDocument(null);
    setStylesReady(false);
    setMeasurement((current) => ({
      ...current,
      naturalHeight: initialNaturalHeight,
    }));
    setRenderFailed(false);
    setRendererReady(false);
    setSlotBoxes([]);
    setPreviewStatus(unavailable ? "unavailable" : "loading");
  }, [initialNaturalHeight, templateKey, unavailable, viewport]);

  useLayoutEffect(() => {
    if (!frameDocument || isUnavailable) return undefined;
    let animationFrameId: number | null = null;
    const observer = new MutationObserver(() => {
      if (animationFrameId !== null) return;
      animationFrameId = window.requestAnimationFrame(() => {
        animationFrameId = null;
        if (frameRef.current?.contentDocument === frameDocument) {
          syncFrameStyles(frameDocument);
        }
      });
    });
    observer.observe(document.head, { childList: true });
    return () => {
      observer.disconnect();
      if (animationFrameId !== null) window.cancelAnimationFrame(animationFrameId);
    };
  }, [frameDocument, isUnavailable, syncFrameStyles]);

  useLayoutEffect(() => {
    if (
      !frameDocument
      || isUnavailable
      || !contentElement
      || contentElement.ownerDocument !== frameDocument
      || portalStyleSyncDocumentRef.current === frameDocument
    ) return;
    // Renderer 内的 useInsertionEffect 可能在 portal 首次提交时才把共享样式
    // 注入父文档；此时重新同步一次，避免目录首帧按无样式内容误判为 240px。
    portalStyleSyncDocumentRef.current = frameDocument;
    syncFrameStyles(frameDocument);
  }, [contentElement, frameDocument, isUnavailable, syncFrameStyles]);

  useLayoutEffect(() => {
    if (!renderFailed) return;
    setRendererReady(false);
    setSlotBoxes([]);
    setPreviewStatus("unavailable");
  }, [renderFailed]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || isUnavailable) return undefined;
    let animationFrameId: number | null = null;
    const measureWidth = () => {
      const scale = host.clientWidth > 0 ? host.clientWidth / sourceWidth : 0;
      if (scale <= 0) return;
      setMeasurement((current) => Math.abs(current.scale - scale) < 0.0001
        ? current
        : { ...current, scale });
    };
    const scheduleWidthMeasurement = () => {
      if (animationFrameId !== null) return;
      animationFrameId = window.requestAnimationFrame(() => {
        animationFrameId = null;
        measureWidth();
      });
    };
    const observer = new ResizeObserver(scheduleWidthMeasurement);
    observer.observe(host);
    scheduleWidthMeasurement();
    return () => {
      observer.disconnect();
      if (animationFrameId !== null) window.cancelAnimationFrame(animationFrameId);
    };
  }, [isUnavailable, sourceWidth]);

  useLayoutEffect(() => {
    const content = contentElement;
    const ownerWindow = frameDocument?.defaultView;
    if (
      isUnavailable
      || !stylesReady
      || !frameDocument
      || !content
      || !ownerWindow
      || content.ownerDocument !== frameDocument
      || !content.isConnected
      || frameRef.current?.contentDocument !== frameDocument
    ) return undefined;
    let animationFrameId: number | null = null;
    let cancelled = false;
    let lastMeasurementReady = false;

    const hasRenderedPreviewRoot = () => Boolean(content.querySelector(
      "[data-dynamic-template-id], [data-content-template-renderer], [data-template-node-id]",
    ));

    const collectSlotBoxes = (contentBounds: DOMRect): TemplateCatalogSlotBox[] => {
      const candidates: Array<{
        element: HTMLElement;
        descriptor: TemplateCatalogSlotDescriptor;
        identity: string;
      }> = [];
      const matchedContractSlotIds = new Set<string>();

      content.querySelectorAll<HTMLElement>("[data-hc-template-slot-kind]").forEach((element, index) => {
        const semanticIdentity = `${element.dataset.hcKeyboardNode || ""} ${element.dataset.editorField || ""}`;
        const kind = normalizeContractSlotKind(element.dataset.hcTemplateSlotKind, semanticIdentity);
        if (!kind || element.getClientRects().length === 0) return;
        const textElements = kind === "text"
          ? Array.from(element.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6,p,[data-editor-field]"))
            .filter((textElement) => textElement.getClientRects().length > 0)
          : [];
        if (kind !== "text" || textElements.length === 0) {
          const label = contractSlotLabel(kind, element.dataset.hcTemplateSlotLabel);
          candidates.push({
            element,
            identity: `contract:${element.dataset.hcKeyboardNode || element.dataset.contentRole || index}`,
            descriptor: {
              slotId: element.dataset.hcKeyboardNode || element.dataset.contentRole || `contract-${index}`,
              kind,
              label,
              compactLabel: compactContractSlotLabel(kind, label),
            },
          });
        }
        textElements.forEach((textElement, textIndex) => {
            if (textElement.getClientRects().length === 0) return;
            const textKind = getRenderedTextSlotKind(textElement);
            const textLabel = contractSlotLabel(textKind, undefined);
            candidates.push({
              element: textElement,
              identity: `contract-text:${element.dataset.hcKeyboardNode || index}:${textIndex}`,
              descriptor: {
                slotId: `${element.dataset.hcKeyboardNode || index}:text:${textIndex}`,
                kind: textKind,
                label: textLabel,
                compactLabel: compactContractSlotLabel(textKind, textLabel),
              },
            });
          });
      });

      content.querySelectorAll<HTMLElement>(
        "[data-content-role],[data-content-role-desktop],[data-content-role-mobile],[data-editor-field]",
      ).forEach((element, index) => {
        if (element.getClientRects().length === 0) return;
        const bounds = element.getBoundingClientRect();
        if (bounds.width <= 0 || bounds.height <= 0) return;
        const roleIds = [
          element.dataset.contentRole,
          element.dataset.contentRoleDesktop,
          element.dataset.contentRoleMobile,
          ...(element.dataset.editorField?.split(/\s+/) ?? []),
        ].filter((roleId): roleId is string => Boolean(roleId));
        roleIds.forEach((roleId) => {
          roleDescriptorsByRoleId.get(roleId)?.forEach((descriptor) => {
            matchedContractSlotIds.add(descriptor.slotId);
            const textElements = descriptor.kind === "text"
              ? Array.from(element.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6,p,[data-editor-field]"))
                .filter((textElement) => textElement.getClientRects().length > 0)
              : [];
            if (descriptor.kind !== "text" || textElements.length === 0) {
              candidates.push({
                element,
                descriptor,
                identity: `role:${descriptor.slotId}:${roleId}:${index}`,
              });
            }
            textElements.forEach((textElement, textIndex) => {
                if (textElement.getClientRects().length === 0) return;
                const textKind = getRenderedTextSlotKind(textElement);
                const textLabel = contractSlotLabel(textKind, undefined);
                candidates.push({
                  element: textElement,
                  identity: `role-text:${descriptor.slotId}:${roleId}:${index}:${textIndex}`,
                  descriptor: {
                    slotId: descriptor.slotId,
                    kind: textKind,
                    label: textLabel,
                    compactLabel: compactContractSlotLabel(textKind, textLabel),
                  },
                });
              });
          });
        });
      });

      content.querySelectorAll<HTMLElement>("[data-template-slot-id]").forEach((element, index) => {
        const slotId = element.dataset.templateSlotId;
        const descriptor = slotId ? slotDescriptorById.get(slotId) : undefined;
        if (
          !slotId
          || !descriptor
          || element.getClientRects().length === 0
          || matchedContractSlotIds.has(slotId)
          || element.querySelector("[data-hc-template-slot-kind]")
        ) return;
        candidates.push({ element, descriptor, identity: `slot:${slotId}:${index}` });
      });

      const seen = new Set<string>();
      const boxes = candidates.flatMap(({ element, descriptor, identity }): TemplateCatalogSlotBox[] => {
        const bounds = element.getBoundingClientRect();
        const left = (bounds.left - contentBounds.left) * measurement.scale;
        const top = (bounds.top - contentBounds.top) * measurement.scale;
        const width = bounds.width * measurement.scale;
        const height = bounds.height * measurement.scale;
        // 目录缩放后，真实正文行高可能不足 1px；仍保留其真实矩形，
        // 否则标题可标注而描述槽位会被误判为不存在。
        if (width <= 0.25 || height <= 0.25) return [];
        const signature = [
          descriptor.kind,
          Math.round(left),
          Math.round(top),
          Math.round(width),
          Math.round(height),
        ].join(":");
        if (seen.has(signature)) return [];
        seen.add(signature);
        return [{
          ...descriptor,
          key: `${identity}:${signature}`,
          left,
          top,
          width,
          height,
          showLabel: width >= 32,
          labelLeft: left,
          labelTop: top,
        }];
      });
      return placeSlotLabels(
        boxes,
        sourceWidth * measurement.scale,
        Math.max(AUTO_ARTBOARD_MIN_HEIGHT, contentBounds.height) * measurement.scale,
      );
    };

    const commitMeasurements = () => {
      const contentBounds = content.getBoundingClientRect();
      const descendantBottom = Array.from(content.children).reduce((bottom, child) => (
        Math.max(bottom, child.getBoundingClientRect().bottom - contentBounds.top)
      ), 0);
      const measuredContentHeight = Math.max(
        AUTO_ARTBOARD_MIN_HEIGHT,
        Math.ceil(contentBounds.height),
        content.scrollHeight,
        Math.ceil(descendantBottom),
      );
      const naturalHeight = heightMode === "auto" ? measuredContentHeight : fallbackHeight;
      setMeasurement((current) => Math.abs(current.naturalHeight - naturalHeight) < 1
        ? current
        : { ...current, naturalHeight });
      const nextSlotBoxes = collectSlotBoxes(contentBounds);
      setSlotBoxes((current) => slotBoxesEqual(current, nextSlotBoxes) ? current : nextSlotBoxes);
      const nextRendererReady = hasRenderedPreviewRoot();
      setRendererReady(nextRendererReady);
      const genericSlotsReady = slots.length === 0 || nextSlotBoxes.length > 0;
      lastMeasurementReady = nextRendererReady && genericSlotsReady;
      if (lastMeasurementReady) previewTimedOutRef.current = false;
      setPreviewStatus(lastMeasurementReady
        ? "ready"
        : previewTimedOutRef.current
          ? "unavailable"
          : "loading");
    };

    const scheduleMeasurements = () => {
      if (animationFrameId !== null) return;
      animationFrameId = ownerWindow.requestAnimationFrame(() => {
        animationFrameId = null;
        commitMeasurements();
      });
    };

    const resizeObserver = new ownerWindow.ResizeObserver(scheduleMeasurements);
    resizeObserver.observe(content);
    const mutationObserver = new ownerWindow.MutationObserver(scheduleMeasurements);
    mutationObserver.observe(content, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "data-hc-template-slot-kind",
        "data-hc-template-slot-label",
        "data-template-slot-id",
        "style",
      ],
    });
    ownerWindow.addEventListener("resize", scheduleMeasurements);
    scheduleMeasurements();
    const timers = [0, 50, 200, 500, 1_200, 2_000]
      .map((delay) => ownerWindow.setTimeout(scheduleMeasurements, delay));
    const unavailableTimer = ownerWindow.setTimeout(() => {
      commitMeasurements();
      if (!lastMeasurementReady) {
        previewTimedOutRef.current = true;
        setPreviewStatus("unavailable");
      }
    }, PREVIEW_RENDER_TIMEOUT_MS);
    void frameDocument.fonts?.ready.then(() => {
      if (!cancelled) scheduleMeasurements();
    });
    return () => {
      cancelled = true;
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      ownerWindow.removeEventListener("resize", scheduleMeasurements);
      timers.forEach((timer) => ownerWindow.clearTimeout(timer));
      ownerWindow.clearTimeout(unavailableTimer);
      if (animationFrameId !== null) ownerWindow.cancelAnimationFrame(animationFrameId);
    };
  }, [
    children,
    contentElement,
    fallbackHeight,
    frameDocument,
    heightMode,
    measurement.scale,
    roleDescriptorsByRoleId,
    slotDescriptorById,
    slots.length,
    sourceWidth,
    styleRevision,
    stylesReady,
    isUnavailable,
  ]);

  const deviceLabel = viewport === "desktop" ? "桌面" : "移动";
  const scaledHeight = measurement.naturalHeight * measurement.scale;

  return (
    <div
      className={`template-editor__catalog-preview-shell is-${viewport}${isUnavailable || previewStatus === "unavailable" ? " is-unavailable" : ""}`}
      data-template-catalog-preview-shell
      data-preview-status={previewStatus}
      data-preview-renderer-ready={rendererReady ? "true" : "false"}
      data-preview-styles-ready={stylesReady ? "true" : "false"}
      data-preview-slot-box-count={slotBoxes.length}
    >
      <div
        ref={hostRef}
        className={`homepage-editor__template-preview-img template-editor__catalog-viewport-preview is-${viewport}`}
        data-content-template-preview={templateKey}
        data-preview-art-direction="neutral-template-preview-v1"
        data-preview-height-mode={heightMode}
        data-preview-natural-height={Math.round(measurement.naturalHeight)}
        data-preview-ratio={heightMode === "auto" ? "auto" : ratioLabel}
        data-preview-viewport={viewport}
        style={{
          height: isUnavailable ? undefined : scaledHeight,
          minHeight: previewStatus === "loading" ? 56 : undefined,
          overflow: "hidden",
          position: "relative",
          width: "100%",
        }}
      >
        {isUnavailable ? (
          <span className="template-editor__catalog-preview-state" role="status">预览不可用</span>
        ) : (
          <>
            <iframe
              key={`${templateKey}:${viewport}`}
              ref={frameRef}
              aria-hidden="true"
              className="template-editor__catalog-viewport-frame"
              data-template-catalog-viewport={viewport}
              srcDoc="<!doctype html><html><head></head><body><div id='template-viewport-root'></div></body></html>"
              tabIndex={-1}
              title={`${title}${deviceLabel}目录预览`}
              style={{
                border: 0,
                height: measurement.naturalHeight,
                left: 0,
                pointerEvents: "none",
                position: "absolute",
                top: 0,
                transform: `scale(${measurement.scale})`,
                transformOrigin: "top left",
                width: sourceWidth,
              }}
              onLoad={connectFrame}
            />
            <span className="template-editor__catalog-artboard-boundary" aria-hidden="true" />
            <div className="template-editor__catalog-slot-overlay" aria-hidden="true">
              {slotBoxes.map((slot) => (
                <span
                  key={slot.key}
                  className="template-editor__catalog-slot-box"
                  data-slot-kind={slot.kind}
                  data-slot-label={slot.compactLabel}
                  style={{
                    left: slot.left,
                    top: slot.top,
                    width: slot.width,
                    height: slot.height,
                  }}
                >
                </span>
              ))}
              {slotBoxes.filter((slot) => slot.showLabel).map((slot) => (
                <span
                  key={`${slot.key}:label`}
                  className="template-editor__catalog-slot-label"
                  data-slot-label-for={slot.compactLabel}
                  style={{ left: slot.labelLeft, top: slot.labelTop }}
                >
                  <span className="is-full">{slot.label}</span>
                  <span className="is-compact">{slot.compactLabel}</span>
                </span>
              ))}
            </div>
            {previewStatus !== "ready" ? (
              <span className="template-editor__catalog-preview-state" role="status">
                {previewStatus === "unavailable" ? "预览不可用" : "正在生成预览"}
              </span>
            ) : null}
          </>
        )}
        {frameDocument?.getElementById("template-viewport-root") && !isUnavailable
          ? createPortal(
              <TemplateCatalogPreviewErrorBoundary
                key={`${templateKey}:${viewport}`}
                onError={() => setRenderFailed(true)}
              >
                <div
                  ref={setContentElement}
                  className="template-editor__canvas-renderer template-editor__dynamic-canvas-renderer template-editor__catalog-canvas-renderer"
                  style={{
                    "--homepage-editor-viewport-height": `${fallbackHeight}px`,
                    width: sourceWidth,
                  } as CSSProperties}
                >
                  <style>{`
                    .template-editor__catalog-canvas-renderer [data-hc-editor-overlay],
                    .template-editor__catalog-canvas-renderer [data-template-selected="true"]::before {
                      display: none !important;
                    }
                    .template-editor__catalog-canvas-renderer [data-template-node-id] {
                      outline: 0 !important;
                    }
                    .template-editor__catalog-canvas-renderer :is(
                      [data-content-role],
                      [data-content-role-desktop],
                      [data-content-role-mobile],
                      [data-editor-field]
                    ) {
                      pointer-events: none !important;
                    }
                  `}</style>
                  {children}
                </div>
              </TemplateCatalogPreviewErrorBoundary>,
              frameDocument.getElementById("template-viewport-root")!,
            )
          : null}
      </div>
    </div>
  );
}
