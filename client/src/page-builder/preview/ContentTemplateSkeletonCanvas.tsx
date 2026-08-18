import type { CSSProperties } from "react";
import {
  getContentTemplatePreview,
  type ContentTemplatePreviewViewport,
  type ContentTemplatePreviewZone,
} from "../generated/contentTemplates.generated";
import {
  getContentTemplateLayout,
  type ContentTemplateLayout,
  type ContentTemplateRole,
} from "../layout/contentTemplateLayouts";
import "./contentTemplateSkeletonCanvas.css";

type SkeletonStyle = CSSProperties & Record<`--hc-skeleton-${string}`, string | number>;

const ROLE_COPY: Record<ContentTemplateRole, { label: string; title: string; body?: string }> = {
  media: { label: "主影像", title: "主画面" },
  mainMedia: { label: "主影像", title: "主画面" },
  detailMedia: { label: "细节影像", title: "细节画面" },
  card: { label: "信息卡", title: "卡片标题", body: "辅助说明" },
  copy: { label: "内容", title: "章节标题", body: "一行结构说明文字" },
  action: { label: "行动", title: "查看详情" },
  marker: { label: "识别", title: "" },
  timeline: { label: "流程", title: "01 — 05" },
  list: { label: "信息", title: "要点列表" },
  quote: { label: "引语", title: "“主引语位置”", body: "署名 / 补充信息" },
  form: { label: "预约", title: "预约信息" },
};

const WIDTH_BY_CONTRACT = {
  full: "1440px",
  wide: "1280px",
  editorial: "1040px",
  standard: "900px",
} as const;

function parseRatio(value?: string) {
  if (!value) return undefined;
  const [width, height] = value.split("/").map((part) => Number(part.trim()));
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
    ? width / height
    : undefined;
}

function ratioForZone(
  zone: ContentTemplatePreviewZone,
  viewport: "desktop" | "mobile",
  layout: ContentTemplateLayout,
) {
  const device = layout[viewport];
  if (zone.role === "media" || zone.role === "mainMedia") return device.mediaRatio;
  if (zone.role === "detailMedia") return device.detailRatio;
  return undefined;
}

function gridStyle(
  viewport: ContentTemplatePreviewViewport,
  device: "desktop" | "mobile",
  layout: ContentTemplateLayout,
): SkeletonStyle {
  const primaryZone = viewport.zones.find((zone) => zone.role === "media" || zone.role === "mainMedia");
  const ratio = primaryZone && parseRatio(ratioForZone(primaryZone, device, layout));
  const rows = viewport.rows ?? 8;
  const frameRatio = ratio && primaryZone
    ? (12 * ratio * primaryZone.rowSpan) / (primaryZone.span * rows)
    : undefined;

  return {
    "--hc-skeleton-rows": rows,
    ...(frameRatio ? { aspectRatio: frameRatio } : {}),
  };
}

function markerTitle(kind: ContentTemplatePreviewZone["kind"]) {
  switch (kind) {
    case "play": return "▶";
    case "pagination": return "01 / 03";
    case "handle": return "前  |  后";
    case "hotspot": return "+";
    case "countdown": return "02 : 18";
    default: return "•";
  }
}

function Zone({
  zone,
  viewport,
  layout,
}: {
  zone: ContentTemplatePreviewZone;
  viewport: "desktop" | "mobile";
  layout: ContentTemplateLayout;
}) {
  const copy = ROLE_COPY[zone.role];
  const className = [
    "hc-template-skeleton__zone",
    `hc-template-skeleton__zone--${zone.role}`,
    zone.overlay ? "is-overlay" : "",
    zone.kind ? `is-${zone.kind}` : "",
  ].filter(Boolean).join(" ");
  const ratio = ratioForZone(zone, viewport, layout);
  const style: SkeletonStyle = {
    gridColumn: `${zone.column} / span ${zone.span}`,
    gridRow: `${zone.row} / span ${zone.rowSpan}`,
    "--hc-skeleton-zone-width": `${(zone.span / 12) * 100}%`,
    "--hc-skeleton-zone-offset": `${((zone.column - 1) / 12) * 100}%`,
    ...(ratio ? { "--hc-skeleton-zone-ratio": ratio } : {}),
  };

  if (zone.role === "marker") {
    return <div className={className} style={style} data-skeleton-role={zone.role} data-skeleton-kind={zone.kind ?? "marker"}>
      <span className="hc-template-skeleton__marker-symbol" aria-hidden="true">{markerTitle(zone.kind)}</span>
      <span className="hc-template-skeleton__visually-hidden">{zone.kind ?? copy.label}</span>
    </div>;
  }

  if (zone.role === "timeline") {
    return <div className={className} style={style} data-skeleton-role={zone.role} data-skeleton-kind={zone.kind ?? "timeline"}>
      <span className="hc-template-skeleton__label">{copy.label}</span>
      <ol className="hc-template-skeleton__steps" aria-label="五步内容流程">
        {["01", "02", "03", "04", "05"].map((step) => <li key={step}>{step}<i /></li>)}
      </ol>
    </div>;
  }

  if (zone.role === "list") {
    return <div className={className} style={style} data-skeleton-role={zone.role}>
      <span className="hc-template-skeleton__label">{copy.label}</span>
      <span className="hc-template-skeleton__list-lines" aria-hidden="true"><i /><i /><i /></span>
    </div>;
  }

  return <div className={className} style={style} data-skeleton-role={zone.role}>
    {["media", "mainMedia", "detailMedia", "card"].includes(zone.role) ? <span className="hc-template-skeleton__frame" aria-hidden="true" /> : null}
    <span className="hc-template-skeleton__label">{copy.label}</span>
    <strong>{copy.title}</strong>
    {copy.body ? <span className="hc-template-skeleton__body">{copy.body}</span> : null}
  </div>;
}

function TemplateFrame({
  device,
  viewport,
  layout,
}: {
  device: "desktop" | "mobile";
  viewport: ContentTemplatePreviewViewport;
  layout: ContentTemplateLayout;
}) {
  const hasPrimaryMedia = viewport.zones.some((zone) => zone.role === "media" || zone.role === "mainMedia");
  return <div className={`hc-template-skeleton__${device}`} style={gridStyle(viewport, device, layout)} data-skeleton-device={device} data-skeleton-order={viewport.order.join(",")} data-skeleton-height-mode={layout.heightModeByViewport[device]} data-skeleton-has-primary-media={hasPrimaryMedia}>
    {viewport.zones.map((zone, index) => <Zone key={`${zone.role}-${zone.kind ?? "plain"}-${zone.column}-${zone.row}-${index}`} zone={zone} viewport={device} layout={layout} />)}
  </div>;
}

/**
 * 画布内 planned 模板的中性完整根构图。
 * 坐标、阅读顺序与视觉层级只读取现有合同预览声明；不承载真实业务数据或公共 Renderer 行为。
 */
export default function ContentTemplateSkeletonCanvas({ moduleType }: { moduleType: string }) {
  const layout = getContentTemplateLayout(moduleType);
  const preview = getContentTemplatePreview(moduleType);
  if (!layout?.isSkeleton || !preview) return null;

  const style: SkeletonStyle = {
    "--hc-skeleton-max-width": WIDTH_BY_CONTRACT[layout.width],
  };

  return <section
    className={`hc-template-skeleton hc-template-skeleton--${preview.visualRole} hc-template-skeleton--desktop-${preview.desktop.tone} hc-template-skeleton--mobile-${preview.mobile.tone} hc-template-skeleton--desktop-height-${layout.heightModeByViewport.desktop} hc-template-skeleton--mobile-height-${layout.heightModeByViewport.mobile}`}
    style={style}
    data-content-template-skeleton={preview.key}
    data-skeleton-complete="true"
    data-desktop-order={preview.desktop.order.join(",")}
    data-mobile-order={preview.mobile.order.join(",")}
  >
    <TemplateFrame device="desktop" viewport={preview.desktop} layout={layout} />
    <TemplateFrame device="mobile" viewport={preview.mobile} layout={layout} />
  </section>;
}
