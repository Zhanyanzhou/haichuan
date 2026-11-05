import { useContext, useEffect, useLayoutEffect, useState, type RefObject } from "react";
import { currentSessionEpoch, isCurrentSessionEpoch } from "@/services/sessionEpoch";
import { useAuthStore } from "@/store/authStore";
import { RESPONSIVE_UPLOADS_IMAGE_WIDTHS, type PublicImageSourceFacts } from "@/utils/responsiveUploadsImage";
import { unwrapResponse } from "@/utils/unwrap";
import { resolveImageDeliveryGeometry, type ImageDeliveryFit } from "../config/imageDeliveryGeometry";
import { trustedDisplaySize } from "../fields/trustedMediaSize";
import { PageEditorMediaScaleContext, useEditorCanvasActive } from "../workspace/editorCanvasActivity";
import { isStaffManagedMediaPreviewUrl, resolveManagedTemplateMediaPreviewUrl } from "./managedMediaPreview";

type PreviewWidth = typeof RESPONSIVE_UPLOADS_IMAGE_WIDTHS[number];
type MediaFactsResponse = NonNullable<Parameters<typeof trustedDisplaySize>[0]> & { url?: string };
type FactsResult = PublicImageSourceFacts | null;

const factsBySource = new Map<string, FactsResult>();
const pendingFacts = new Map<string, Promise<FactsResult>>();

function readSourceFacts(key: string, source: string, epoch: number): Promise<FactsResult> {
  if (factsBySource.has(key)) return Promise.resolve(factsBySource.get(key) ?? null);
  const pending = pendingFacts.get(key);
  if (pending) return pending;
  const request = import("@/services/api").then(async ({ uploadApi }) => {
    if (!isCurrentSessionEpoch("admin", epoch)) return null;
    const data = unwrapResponse<MediaFactsResponse>(await uploadApi.getPageMediaByUrl(source));
    const dimensions = data?.url === source ? trustedDisplaySize(data) : null;
    return dimensions ? { ...dimensions, animated: data.animated } : null;
  }).then((facts) => {
    if (isCurrentSessionEpoch("admin", epoch)) {
      if (factsBySource.size >= 128) {
        const oldest = factsBySource.keys().next().value;
        if (oldest) factsBySource.delete(oldest);
      }
      factsBySource.set(key, facts);
    }
    return facts;
  }).catch(() => null).finally(() => pendingFacts.delete(key));
  pendingFacts.set(key, request);
  return request;
}

export function usePageEditorMediaVariant(
  source: string | undefined,
  hostFetch: boolean,
  element: RefObject<HTMLElement>,
  fit: ImageDeliveryFit,
  authorScale = 1,
): { width?: PreviewWidth; defer?: boolean } {
  const canvasScale = useContext(PageEditorMediaScaleContext);
  const active = useEditorCanvasActive();
  const epoch = useAuthStore(() => currentSessionEpoch("admin"));
  const path = source?.trim().split(/[?#]/, 1)[0] ?? "";
  const key = hostFetch && canvasScale !== null && isStaffManagedMediaPreviewUrl(resolveManagedTemplateMediaPreviewUrl(path))
    && /^\/uploads\/page-assets\/.*\.(?:jpe?g|png|webp)$/i.test(path)
    ? `${epoch}|${path}`
    : "";
  const [loaded, setLoaded] = useState<{ key: string; facts: FactsResult }>();
  const facts = loaded?.key === key ? loaded.facts : factsBySource.get(key);
  const [selection, setSelection] = useState<{ key: string; width?: PreviewWidth }>();

  useEffect(() => {
    if (!key || !active || facts !== undefined) return;
    let cancelled = false;
    void readSourceFacts(key, path, epoch).then((result) => {
      if (!cancelled && isCurrentSessionEpoch("admin", epoch)) setLoaded({ key, facts: result });
    });
    return () => { cancelled = true; };
  }, [active, epoch, facts, key, path]);

  useLayoutEffect(() => {
    if (!key || !active || !facts || facts.animated || canvasScale === null) return;
    const node = element.current;
    const owner = node?.ownerDocument.defaultView;
    if (!node || !owner) return;
    const choose = (width?: PreviewWidth) => {
      // 缩回画布时复用已下载的清晰图；只在更高像素需求出现时升档。
      setSelection((previous) => previous?.key === key && (
        previous.width === undefined || (width !== undefined && previous.width >= width)
      ) ? previous : { key, width });
    };
    let measured = false;
    const measure = () => {
      const frameWidth = node.offsetWidth * canvasScale;
      const frameHeight = node.offsetHeight * canvasScale;
      if (!(frameWidth > 0) || !(frameHeight > 0)) return;
      measured = true;
      const dpr = owner.devicePixelRatio || 1;
      const geometry = resolveImageDeliveryGeometry({
        sourceWidth: facts.displayWidth,
        sourceHeight: facts.displayHeight,
        frameWidth,
        frameHeight,
        objectFit: fit === "fill" ? "cover" : fit,
        authorScale,
        devicePixelRatio: dpr,
      });
      const required = geometry?.requiredSourceWidth;
      // 拉伸时同时满足横纵像素需求。需要原尺寸或超过最高档时保留原图。
      const tier = required && required < facts.displayWidth
        ? RESPONSIVE_UPLOADS_IMAGE_WIDTHS.find((width) => width >= required && width < facts.displayWidth)
        : undefined;
      choose(tier);
    };
    measure();
    const observer = typeof owner.ResizeObserver === "function" ? new owner.ResizeObserver(measure) : null;
    observer?.observe(node);
    owner.addEventListener("resize", measure);
    const fallback = measured ? undefined : owner.setTimeout(() => {
      if (!measured) choose();
    }, 250);
    return () => {
      observer?.disconnect();
      owner.removeEventListener("resize", measure);
      if (fallback !== undefined) owner.clearTimeout(fallback);
    };
  }, [active, authorScale, canvasScale, element, facts, fit, key]);

  if (!key) return {};
  if (!active || facts === undefined) return { defer: true };
  if (!facts || facts.animated) return {};
  return selection?.key === key ? { width: selection.width } : { defer: true };
}
