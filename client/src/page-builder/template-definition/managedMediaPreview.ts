const MANAGED_PAGE_ASSET_PREFIX = "/uploads/page-assets/";

/**
 * 模板保存的始终是受治理的正式素材引用；后台编辑与预览改走
 * 需登录的预览端点，避免尚未完成公开授权的素材被误判为失效。
 * 公开 Renderer 不调用此转换，仍由 `/uploads/page-assets/*` 强制授权门禁。
 */
export function resolveManagedTemplateMediaPreviewUrl(value: string | undefined): string {
  if (!value?.startsWith(MANAGED_PAGE_ASSET_PREFIX)) return value ?? "";
  const path = value.split(/[?#]/, 1)[0];
  const storageKey = path.slice("/uploads/".length);
  const segments = storageKey.split("/");
  if (
    segments.length < 2
    || segments.some((segment) => !segment || segment === "." || segment === "..")
    || storageKey.includes("\\")
  ) return value;
  return `/api/upload/media/preview-by-storage-key?storageKey=${encodeURIComponent(storageKey)}`;
}
