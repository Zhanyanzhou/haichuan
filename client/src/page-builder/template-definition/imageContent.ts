import type { TemplateBreakpoint } from "./generated/templateDefinition.generated";
import { isSafeTemplateMediaUrl } from "./validateTemplateDefinition";

/** 手机优先自己的有效图片；未填或移除手机图时沿用桌面图，其他断点只读取桌面图。 */
export function resolveTemplateImageSource(value: unknown, breakpoint: TemplateBreakpoint = "desktop"): string {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const image = value as Record<string, unknown>;
  if (breakpoint === "mobile" && isSafeTemplateMediaUrl(image.mobileSrc)) return image.mobileSrc.trim();
  return typeof image.src === "string" ? image.src.trim() : "";
}

export function hasTemplateImageContent(value: unknown, breakpoint: TemplateBreakpoint): boolean {
  return Boolean(resolveTemplateImageSource(value, breakpoint));
}
