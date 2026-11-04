const CATALOG_IMAGE_SWIPE_COMMIT_PX = 40;

/** 手机宽度，或没有悬停的触控设备（含横屏手机）。 */
export const CATALOG_IMAGE_SWIPE_MEDIA =
  "(max-width: 767px), ((hover: none) and (pointer: coarse))";

export function catalogImageSwipeEnabled(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia(CATALOG_IMAGE_SWIPE_MEDIA).matches
  );
}

/**
 * 左滑到下一张，右滑到上一张。
 * 位移不够，或垂直分量不小于水平分量时返回 0，把这次手势留给页面滚动。
 */
export function catalogImageSwipeDelta(dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dx) < CATALOG_IMAGE_SWIPE_COMMIT_PX) return 0;
  if (Math.abs(dx) <= Math.abs(dy)) return 0;
  return dx < 0 ? 1 : -1;
}

export function nextCatalogImageIndex(index: number, count: number, delta: -1 | 1): number {
  if (count < 2) return index;
  return (index + delta + count) % count;
}
