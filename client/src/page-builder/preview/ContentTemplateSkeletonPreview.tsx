import {
  getContentTemplatePreview,
  type ContentTemplatePreviewViewport,
  type ContentTemplatePreviewZone,
} from "../generated/contentTemplates.generated";

type Density = "thumbnail" | "overview";
type Metrics = { width: number; height: number; x: number; y: number; frameWidth: number; frameHeight: number; rows: number };

/** 预览专用色彩语言：白底、石墨、两级石灰、灰线与单一香槟金。 */
const PREVIEW_TOKENS = {
  canvas: "#FFFFFF",
  canvasSoft: "#FCFCFD",
  graphite: "#1E2024",
  stage: "#191C21",
  media: "#E5E8EC",
  mediaDark: "#535A64",
  line: "#D4D8DD",
  muted: "#737982",
  accent: "#B49768",
  inverse: "#F7F8F9",
} as const;

function metrics(viewport: "desktop" | "mobile", density: Density, rows: number): Metrics {
  const width = viewport === "mobile" ? 180 : density === "overview" ? 460 : 300;
  const x = 12;
  const y = 12;
  const frameWidth = width - x * 2;
  const frameHeight = Math.max(density === "overview" ? 210 : 148, rows * (density === "overview" ? 34 : 21) + (rows - 1) * 4);
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
  const box = rect(zone, frame); const ink = inverse ? PREVIEW_TOKENS.inverse : PREVIEW_TOKENS.graphite; const muted = inverse ? "rgba(247,248,249,.56)" : PREVIEW_TOKENS.muted; const w = Math.max(26, box.width - 8);
  return <g data-preview-role="copy"><rect x={box.x} y={box.y + 4} width={w * .28} height="3" rx="1.5" fill={PREVIEW_TOKENS.accent} /><rect x={box.x} y={box.y + 14} width={w} height="7" rx="2" fill={ink} /><rect x={box.x} y={box.y + 28} width={w * .82} height="3" rx="1.5" fill={muted} /><rect x={box.x} y={box.y + 37} width={w * .55} height="3" rx="1.5" fill={muted} /></g>;
}

function Media({ zone, frame, inverse }: { zone: ContentTemplatePreviewZone; frame: Metrics; inverse: boolean }) {
  const box = rect(zone, frame); const stroke = inverse ? "rgba(247,248,249,.32)" : PREVIEW_TOKENS.line;
  return <g data-preview-role={zone.role}><rect {...box} rx="1" fill={inverse ? PREVIEW_TOKENS.mediaDark : PREVIEW_TOKENS.media} /><rect x={box.x + 7} y={box.y + 7} width={Math.max(0, box.width - 14)} height={Math.max(0, box.height - 14)} rx="0" fill="none" stroke={stroke} />{zone.role === "card" ? <><rect x={box.x + 8} y={box.y + box.height - 23} width={Math.max(18, box.width * .62)} height="3" rx="1.5" fill={inverse ? PREVIEW_TOKENS.inverse : PREVIEW_TOKENS.graphite} /><rect x={box.x + 8} y={box.y + box.height - 14} width={Math.max(14, box.width * .38)} height="2" rx="1" fill={PREVIEW_TOKENS.accent} /></> : null}</g>;
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
  const box = rect(zone, frame); const count = timeline ? 5 : 3; const ink = inverse ? "rgba(247,248,249,.78)" : PREVIEW_TOKENS.graphite; const muted = inverse ? "rgba(247,248,249,.42)" : PREVIEW_TOKENS.line;
  return <g data-preview-role={timeline ? "timeline" : "list"}>{Array.from({ length: count }, (_, i) => { const y = box.y + 8 + i * Math.max(9, (box.height - 16) / count); return <g key={i}>{timeline ? <><circle cx={box.x + 6} cy={y} r="4" fill={i === 0 ? PREVIEW_TOKENS.accent : muted} /><text x={box.x + 15} y={y + 3} fill={i === 0 ? ink : muted} fontSize="7">{String(i + 1).padStart(2, "0")}</text></> : <rect x={box.x} y={y - 2} width="4" height="4" rx="2" fill={PREVIEW_TOKENS.accent} />}<rect x={box.x + (timeline ? 30 : 13)} y={y - 2} width={Math.max(12, box.width - (timeline ? 34 : 17))} height="4" rx="2" fill={i === 0 ? ink : muted} /></g>; })}</g>;
}

function Quote({ zone, frame, inverse }: { zone: ContentTemplatePreviewZone; frame: Metrics; inverse: boolean }) {
  const box = rect(zone, frame); const ink = inverse ? "rgba(247,248,249,.78)" : PREVIEW_TOKENS.graphite;
  return <g data-preview-role="quote"><text x={box.x} y={box.y + 20} fill={PREVIEW_TOKENS.accent} fontSize="24" fontFamily="serif">“</text><rect x={box.x + 17} y={box.y + 14} width={Math.max(20, box.width - 22)} height="4" rx="2" fill={ink} /><rect x={box.x + 4} y={box.y + 29} width={Math.max(18, box.width - 30)} height="4" rx="2" fill={inverse ? "rgba(247,248,249,.42)" : PREVIEW_TOKENS.line} /></g>;
}

function Zone({ zone, frame, inverse }: { zone: ContentTemplatePreviewZone; frame: Metrics; inverse: boolean }) {
  if (["media", "mainMedia", "detailMedia", "card"].includes(zone.role)) return <Media zone={zone} frame={frame} inverse={inverse} />;
  if (zone.role === "copy") return <Copy zone={zone} frame={frame} inverse={inverse} />;
  if (zone.role === "action") { const box = rect(zone, frame); return <g data-preview-role="action"><rect x={box.x} y={box.y + Math.min(12, box.height / 2)} width={Math.max(20, Math.min(70, box.width))} height="3" rx="1.5" fill={inverse ? PREVIEW_TOKENS.inverse : PREVIEW_TOKENS.graphite} /><rect x={box.x} y={box.y + Math.min(19, box.height / 2 + 7)} width={Math.max(20, Math.min(70, box.width))} height="1" fill={PREVIEW_TOKENS.accent} /></g>; }
  if (zone.role === "marker") return <Marker zone={zone} frame={frame} inverse={inverse} />;
  if (zone.role === "timeline") return <Lines zone={zone} frame={frame} inverse={inverse} timeline />;
  if (zone.role === "quote") return <Quote zone={zone} frame={frame} inverse={inverse} />;
  return <Lines zone={zone} frame={frame} inverse={inverse} />;
}

/** 模板库与总览共用合同结构坐标，不加载摄影、商品或任何外部图片。 */
export default function ContentTemplateSkeletonPreview({ moduleType, viewport = "desktop", density = "thumbnail" }: { moduleType: string; viewport?: "desktop" | "mobile"; density?: Density }) {
  const profile = getContentTemplatePreview(moduleType);
  if (!profile) return null;
  const current: ContentTemplatePreviewViewport = profile[viewport];
  const frame = metrics(viewport, density, current.rows ?? 8);
  const inverse = current.tone === "dark";
  return <svg className={`homepage-editor__template-preview-img homepage-editor__template-layout-preview is-${density} is-${viewport}`} viewBox={`0 0 ${frame.width} ${frame.height}`} role="img" aria-label={`${profile.displayName}的${viewport === "desktop" ? "桌面" : "手机"}结构预览：${profile.purpose}`} preserveAspectRatio="xMidYMid meet" data-content-template-preview={profile.key} data-preview-viewport={viewport} data-desktop-order={profile.desktop.order.join(",")} data-mobile-order={profile.mobile.order.join(",")}><rect width={frame.width} height={frame.height} fill={inverse ? PREVIEW_TOKENS.stage : PREVIEW_TOKENS.canvasSoft} /><rect x={frame.x - 4} y={frame.y - 4} width={frame.frameWidth + 8} height={frame.frameHeight + 8} rx="1" fill="none" stroke={inverse ? "rgba(247,248,249,.18)" : PREVIEW_TOKENS.line} />{current.zones.map((zone) => <Zone key={keyOf(zone)} zone={zone} frame={frame} inverse={inverse && Boolean(zone.overlay)} />)}</svg>;
}
