import {
  getContentTemplatePreview,
  type ContentTemplatePreviewViewport,
  type ContentTemplatePreviewZone,
} from "../generated/contentTemplates.generated";
import {
  frameHeightByMediaRatio,
  layoutFor,
  primaryMediaZone,
} from "./previewGeometry";

type Density = "thumbnail" | "overview";
type Metrics = { width: number; height: number; x: number; y: number; frameWidth: number; frameHeight: number; rows: number };

/** 后台缩略图色彩：中性白、石墨文字、矿物灰与单一深色焦点。 */
const PREVIEW_TOKENS = {
  canvas: "#FFFFFF",
  canvasSoft: "#F4F5F5",
  graphite: "#181A1B",
  stage: "#111315",
  media: "#DDE1E2",
  mediaDark: "#5F6568",
  mediaDeep: "#6E7477",
  line: "#B8BEC1",
  lineSoft: "#DDE1E2",
  muted: "#6E7477",
  accent: "#181A1B",
  inverse: "#F7F8F8",
} as const;

function metrics(
  viewport: "desktop" | "mobile",
  density: Density,
  rows: number,
  ratioHeight?: number,
): Metrics {
  if (density === "thumbnail") {
    const width = viewport === "mobile" ? 180 : 300;
    const height = viewport === "mobile" ? 228 : 186;
    const inset = viewport === "mobile" ? 12 : 14;
    return {
      width,
      height,
      x: inset,
      y: inset,
      frameWidth: width - inset * 2,
      frameHeight: height - inset * 2,
      rows,
    };
  }
  const width = viewport === "mobile" ? 180 : density === "overview" ? 460 : 300;
  const x = 14;
  const y = 14;
  const frameWidth = width - x * 2;
  // 按契约媒体比例推导时,frame 高由比例决定(夹底防过扁);
  // 无媒体比例的模板退回行数推导。
  const rowHeight = density === "overview" ? 34 : 21;
  const gap = 4;
  const rowsHeight = rows * rowHeight + (rows - 1) * gap;
  const frameHeight = ratioHeight
    ? Math.max(density === "overview" ? 170 : 110, Math.round(ratioHeight))
    : Math.max(density === "overview" ? 210 : 148, rowsHeight);
  return { width, height: frameHeight + y * 2, x, y, frameWidth, frameHeight, rows };
}

function rect(zone: ContentTemplatePreviewZone, frame: Metrics) {
  const gap = 4;
  const column = (frame.frameWidth - gap * 11) / 12;
  const row = (frame.frameHeight - gap * (frame.rows - 1)) / frame.rows;
  return {
    x: frame.x + (zone.column - 1) * (column + gap),
    y: frame.y + (zone.row - 1) * (row + gap),
    width: zone.span * column + (zone.span - 1) * gap,
    height: zone.rowSpan * row + (zone.rowSpan - 1) * gap,
  };
}

function keyOf(zone: ContentTemplatePreviewZone) {
  return `${zone.role}-${zone.kind ?? "plain"}-${zone.column}-${zone.row}`;
}

function Copy({ zone, frame, inverse }: { zone: ContentTemplatePreviewZone; frame: Metrics; inverse: boolean }) {
  const box = rect(zone, frame); const ink = inverse ? PREVIEW_TOKENS.inverse : PREVIEW_TOKENS.graphite; const muted = inverse ? "rgba(247,248,248,.55)" : PREVIEW_TOKENS.muted; const w = Math.max(18, box.width - 4); const startY = box.y + Math.max(2, box.height * .12);
  return <g data-preview-role="copy"><rect x={box.x} y={startY} width={Math.max(11, w * .2)} height="2.5" rx="1.25" fill={PREVIEW_TOKENS.accent} /><rect x={box.x} y={startY + 8} width={w} height={Math.max(4, Math.min(7, box.height * .16))} rx="1.5" fill={ink} /><rect x={box.x} y={startY + 19} width={w * .72} height="3" rx="1.5" fill={muted} />{box.height > 42 ? <rect x={box.x} y={startY + 27} width={w * .46} height="3" rx="1.5" fill={muted} /> : null}</g>;
}

function Media({ zone, frame, inverse }: { zone: ContentTemplatePreviewZone; frame: Metrics; inverse: boolean }) {
  const box = rect(zone, frame); const isCard = zone.role === "card"; const mediaHeight = isCard ? Math.max(12, box.height * .68) : box.height; const motifX = box.x + box.width * .68; const motifY = box.y + mediaHeight * .44; const motifRadius = Math.max(6, Math.min(box.width, mediaHeight) * .22);
  return <g data-preview-role={zone.role}>{isCard ? <rect {...box} rx="2" fill={inverse ? PREVIEW_TOKENS.mediaDark : PREVIEW_TOKENS.canvas} stroke={inverse ? "rgba(255,255,255,.14)" : PREVIEW_TOKENS.lineSoft} /> : null}<rect x={box.x} y={box.y} width={box.width} height={mediaHeight} rx={isCard ? 2 : 1.5} fill={inverse ? PREVIEW_TOKENS.mediaDark : PREVIEW_TOKENS.media} /><path d={`M ${box.x} ${box.y + mediaHeight} L ${box.x + box.width} ${box.y} L ${box.x + box.width} ${box.y + mediaHeight} Z`} fill={inverse ? "rgba(95,101,104,.34)" : "rgba(110,116,119,.34)"} /><circle cx={motifX} cy={motifY} r={motifRadius} fill="none" stroke="rgba(255,255,255,.58)" strokeWidth="1.3" /><circle cx={motifX} cy={motifY} r={Math.max(3, motifRadius * .42)} fill={PREVIEW_TOKENS.accent} opacity=".88" />{isCard ? <><rect x={box.x + 5} y={box.y + mediaHeight + 7} width={Math.max(12, box.width * .56)} height="3.5" rx="1.5" fill={inverse ? PREVIEW_TOKENS.inverse : PREVIEW_TOKENS.graphite} /><rect x={box.x + 5} y={box.y + mediaHeight + 15} width={Math.max(9, box.width * .32)} height="2.5" rx="1.25" fill={PREVIEW_TOKENS.accent} /></> : null}</g>;
}

function Marker({ zone, frame, inverse }: { zone: ContentTemplatePreviewZone; frame: Metrics; inverse: boolean }) {
  const box = rect(zone, frame); const cx = box.x + box.width / 2; const cy = box.y + box.height / 2; const dark = inverse ? PREVIEW_TOKENS.inverse : PREVIEW_TOKENS.graphite; const light = inverse ? PREVIEW_TOKENS.mediaDark : PREVIEW_TOKENS.canvas;
  if (zone.kind === "pagination") return <g data-preview-role="pagination">{[0, 1, 2].map((i) => <rect key={i} x={box.x + i * 13} y={cy - 2} width={i === 0 ? 9 : 5} height="4" rx="2" fill={i === 0 ? PREVIEW_TOKENS.accent : dark} />)}</g>;
  if (zone.kind === "handle") return <g data-preview-role="comparison-handle"><rect x={cx - 1} y={box.y} width="2" height={box.height} fill={PREVIEW_TOKENS.accent} /><circle cx={cx} cy={cy} r="8" fill={dark} /><path d={`M ${cx - 3} ${cy} L ${cx - 1} ${cy - 3} L ${cx - 1} ${cy + 3} Z M ${cx + 3} ${cy} L ${cx + 1} ${cy - 3} L ${cx + 1} ${cy + 3} Z`} fill={light} /></g>;
  if (zone.kind === "hotspot") return <g data-preview-role="hotspot"><circle cx={cx} cy={cy} r="8" fill={dark} /><path d={`M ${cx - 3} ${cy} H ${cx + 3} M ${cx} ${cy - 3} V ${cy + 3}`} stroke={light} strokeWidth="1.5" /></g>;
  if (zone.kind === "countdown") return <g data-preview-role="countdown">{[0, 1, 2].map((i) => <rect key={i} x={box.x + i * Math.min(22, box.width / 3)} y={cy - 7} width="16" height="14" rx="1" fill="none" stroke={dark} />)}</g>;
  return <g data-preview-role={zone.kind === "play" ? "play" : "marker"}><circle cx={cx} cy={cy} r={Math.min(14, box.width / 3, box.height / 3)} fill={dark} />{zone.kind === "play" ? <path d={`M ${cx - 3} ${cy - 5} L ${cx + 6} ${cy} L ${cx - 3} ${cy + 5} Z`} fill={light} /> : <circle cx={cx} cy={cy} r="3" fill={light} />}</g>;
}

function Lines({ zone, frame, inverse, timeline = false }: { zone: ContentTemplatePreviewZone; frame: Metrics; inverse: boolean; timeline?: boolean }) {
  const box = rect(zone, frame); const count = timeline ? 5 : 3; const ink = inverse ? "rgba(247,248,248,.78)" : PREVIEW_TOKENS.graphite; const muted = inverse ? "rgba(247,248,248,.42)" : PREVIEW_TOKENS.line;
  return <g data-preview-role={timeline ? "timeline" : "list"}>{Array.from({ length: count }, (_, i) => { const y = box.y + 8 + i * Math.max(9, (box.height - 16) / count); return <g key={i}>{timeline ? <><circle cx={box.x + 6} cy={y} r="4" fill={i === 0 ? PREVIEW_TOKENS.accent : muted} /><text x={box.x + 15} y={y + 3} fill={i === 0 ? ink : muted} fontSize="7">{String(i + 1).padStart(2, "0")}</text></> : <rect x={box.x} y={y - 2} width="4" height="4" rx="2" fill={PREVIEW_TOKENS.accent} />}<rect x={box.x + (timeline ? 30 : 13)} y={y - 2} width={Math.max(12, box.width - (timeline ? 34 : 17))} height="4" rx="2" fill={i === 0 ? ink : muted} /></g>; })}</g>;
}

function Quote({ zone, frame, inverse }: { zone: ContentTemplatePreviewZone; frame: Metrics; inverse: boolean }) {
  const box = rect(zone, frame); const ink = inverse ? "rgba(247,248,248,.78)" : PREVIEW_TOKENS.graphite;
  return <g data-preview-role="quote"><text x={box.x} y={box.y + 20} fill={PREVIEW_TOKENS.accent} fontSize="24" fontFamily="serif">“</text><rect x={box.x + 17} y={box.y + 14} width={Math.max(20, box.width - 22)} height="4" rx="2" fill={ink} /><rect x={box.x + 4} y={box.y + 29} width={Math.max(18, box.width - 30)} height="4" rx="2" fill={inverse ? "rgba(247,248,248,.42)" : PREVIEW_TOKENS.line} /></g>;
}

function Eyebrow({ zone, frame }: { zone: ContentTemplatePreviewZone; frame: Metrics; inverse: boolean }) {
  const box = rect(zone, frame);
  return <g data-preview-role="eyebrow"><rect x={box.x} y={box.y + 2} width={Math.max(16, box.width * .55)} height="3" rx="1.5" fill={PREVIEW_TOKENS.accent} /></g>;
}

function TitleBlock({ zone, frame, inverse }: { zone: ContentTemplatePreviewZone; frame: Metrics; inverse: boolean }) {
  const box = rect(zone, frame); const ink = inverse ? PREVIEW_TOKENS.inverse : PREVIEW_TOKENS.graphite;
  const tall = box.height >= 22;
  return <g data-preview-role="title"><rect x={box.x} y={box.y + 2} width={Math.max(18, box.width * .92)} height={tall ? 7 : 5} rx="1.5" fill={ink} />{tall ? <rect x={box.x} y={box.y + 14} width={Math.max(14, box.width * .58)} height="5" rx="1.5" fill={ink} /> : null}</g>;
}

function Subtitle({ zone, frame, inverse }: { zone: ContentTemplatePreviewZone; frame: Metrics; inverse: boolean }) {
  const box = rect(zone, frame); const muted = inverse ? "rgba(247,248,248,.56)" : PREVIEW_TOKENS.muted;
  return <g data-preview-role="subtitle"><rect x={box.x} y={box.y + 1} width={Math.max(20, box.width * .82)} height="3" rx="1.5" fill={muted} /><rect x={box.x} y={box.y + 9} width={Math.max(14, box.width * .55)} height="3" rx="1.5" fill={muted} /></g>;
}

function Zone({ zone, frame, inverse }: { zone: ContentTemplatePreviewZone; frame: Metrics; inverse: boolean }) {
  if (["media", "mainMedia", "detailMedia", "card"].includes(zone.role)) return <Media zone={zone} frame={frame} inverse={inverse} />;
  if (zone.role === "eyebrow") return <Eyebrow zone={zone} frame={frame} inverse={inverse} />;
  if (zone.role === "title") return <TitleBlock zone={zone} frame={frame} inverse={inverse} />;
  if (zone.role === "subtitle") return <Subtitle zone={zone} frame={frame} inverse={inverse} />;
  if (zone.role === "copy") return <Copy zone={zone} frame={frame} inverse={inverse} />;
  if (zone.role === "action") { const box = rect(zone, frame); return <g data-preview-role="action"><rect x={box.x} y={box.y + Math.min(12, box.height / 2)} width={Math.max(20, Math.min(70, box.width))} height="3" rx="1.5" fill={inverse ? PREVIEW_TOKENS.inverse : PREVIEW_TOKENS.graphite} /><rect x={box.x} y={box.y + Math.min(19, box.height / 2 + 7)} width={Math.max(20, Math.min(70, box.width))} height="1" fill={PREVIEW_TOKENS.accent} /></g>; }
  if (zone.role === "marker") return <Marker zone={zone} frame={frame} inverse={inverse} />;
  if (zone.role === "timeline") return <Lines zone={zone} frame={frame} inverse={inverse} timeline />;
  if (zone.role === "quote") return <Quote zone={zone} frame={frame} inverse={inverse} />;
  return <Lines zone={zone} frame={frame} inverse={inverse} />;
}

/** 模板库与总览共用合同结构坐标，不加载摄影、商品或任何外部图片。
 * frame 高优先按主媒体区契约比例推导 —— 横版模板出横框、竖版出竖框。 */
export default function ContentTemplateSkeletonPreview({ moduleType, viewport = "desktop", density = "thumbnail" }: { moduleType: string; viewport?: "desktop" | "mobile"; density?: Density }) {
  const profile = getContentTemplatePreview(moduleType);
  if (!profile) return null;
  const current: ContentTemplatePreviewViewport = profile[viewport];
  const rows = current.rows ?? 8;
  const layout = layoutFor(moduleType);
  const mediaZone = layout ? primaryMediaZone(current) : undefined;
  const ratioHeight =
    density === "overview" && layout && mediaZone
      ? frameHeightByMediaRatio(
          (viewport === "mobile" ? 180 : density === "overview" ? 460 : 300) - 24,
          rows,
          mediaZone,
          viewport,
          layout,
        )
      : undefined;
  const frame = metrics(viewport, density, rows, ratioHeight);
  const inverse = current.tone === "dark";
  return <svg className={`homepage-editor__template-preview-img is-${density} is-${viewport}`} viewBox={`0 0 ${frame.width} ${frame.height}`} role="img" aria-label={`${profile.displayName}的${viewport === "desktop" ? "桌面" : "手机"}结构预览：${profile.purpose}`} preserveAspectRatio="xMidYMid meet" data-content-template-preview={profile.key} data-preview-viewport={viewport} data-desktop-order={profile.desktop.order.join(",")} data-mobile-order={profile.mobile.order.join(",")}><rect width={frame.width} height={frame.height} fill={PREVIEW_TOKENS.canvasSoft} /><rect x={frame.x - 5} y={frame.y - 5} width={frame.frameWidth + 10} height={frame.frameHeight + 10} rx="3" fill={inverse ? PREVIEW_TOKENS.stage : PREVIEW_TOKENS.canvas} stroke={inverse ? "rgba(247,248,248,.12)" : PREVIEW_TOKENS.line} /><rect x={frame.x - 1} y={frame.y - 1} width={frame.frameWidth + 2} height={frame.frameHeight + 2} rx="1.5" fill="none" stroke={inverse ? "rgba(247,248,248,.08)" : PREVIEW_TOKENS.lineSoft} />{current.zones.map((zone) => <Zone key={keyOf(zone)} zone={zone} frame={frame} inverse={inverse} />)}</svg>;
}
