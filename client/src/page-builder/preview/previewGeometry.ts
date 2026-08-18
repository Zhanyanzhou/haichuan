/**
 * previewGeometry.ts — 预览几何共享模块(2026-08-18 P0-B)。
 *
 * 从契约布局(合同 mediaRatio/detailRatio)与预览 zones 坐标推导真实比例的
 * 预览 frame 高度,让模板库缩略图"横版出横框、竖版出竖框",
 * 与画布/公开页同一比例来源。逻辑自原 ContentTemplateSkeletonCanvas
 * (已删除)下沉,供缩略图/总览等复用。
 */
import type {
  ContentTemplatePreviewViewport,
  ContentTemplatePreviewZone,
} from "../generated/contentTemplates.generated";
import {
  getContentTemplateLayout,
  type ContentTemplateLayout,
} from "../layout/contentTemplateLayouts";

/** 契约比例串("3 / 2")→ 数值(1.5);非法或缺失返回 undefined */
export function parseRatio(value?: string): number | undefined {
  if (!value) return undefined;
  const [w, h] = value.split("/").map((part) => Number(part.trim()));
  return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0
    ? w / h
    : undefined;
}

/** zone 角色 → 该设备下的契约比例串;非媒体类角色无契约比例 */
export function ratioForZone(
  zone: ContentTemplatePreviewZone,
  device: "desktop" | "mobile",
  layout: ContentTemplateLayout,
): string | undefined {
  const d = layout[device];
  if (zone.role === "media" || zone.role === "mainMedia") return d.mediaRatio;
  if (zone.role === "detailMedia") return d.detailRatio;
  return undefined;
}

/** 取预览里承载主媒体/细节媒体的代表 zone(优先主媒体) */
export function primaryMediaZone(
  viewport: ContentTemplatePreviewViewport,
): ContentTemplatePreviewZone | undefined {
  return (
    viewport.zones.find((z) => z.role === "media" || z.role === "mainMedia") ??
    viewport.zones.find((z) => z.role === "detailMedia")
  );
}

/**
 * 以媒体 zone 的契约比例反推整个预览 frame 的高度:
 * 媒体区宽 = span × frameWidth / 12(12 列网格),
 * 媒体区高 = 宽 / ratio,frame 高 = 媒体区高 × rows / rowSpan。
 * 无契约比例的模板返回 undefined(退回行数推导)。
 */
export function frameHeightByMediaRatio(
  frameWidth: number,
  rows: number,
  zone: ContentTemplatePreviewZone,
  device: "desktop" | "mobile",
  layout: ContentTemplateLayout,
): number | undefined {
  const ratio = parseRatio(ratioForZone(zone, device, layout));
  if (!ratio) return undefined;
  return (zone.span * frameWidth * rows) / (12 * ratio * zone.rowSpan);
}

/** 模块类型 → 契约布局(未注册返回 undefined) */
export function layoutFor(moduleType: string) {
  return getContentTemplateLayout(moduleType);
}
