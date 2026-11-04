import type { PageMediaItem } from "./pageMediaLibrary";

type SizeCarrier = {
  width?: number | null;
  height?: number | null;
  displayWidth?: number | null;
  displayHeight?: number | null;
  metadataStatus?: "measured" | "unknown" | null;
  animated?: boolean;
  mediaRevision?: string;
};

function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * 只有可信、已测量、按显示方向归一化的尺寸才能判断清晰度。
 * unknown 即使带着旧 width/height 或旧 displayWidth 也不采信。
 * 状态缺省时，只接受成对的 displayWidth/displayHeight，不用数据库宽高冒充。
 * metadataStatus 为 measured 时，display 字段可以回落到同一次测量写入的 width/height。
 */
export function trustedDisplaySize(
  source: SizeCarrier | null | undefined,
): { displayWidth: number; displayHeight: number } | null {
  if (!source || source.metadataStatus === "unknown") return null;
  if (source.metadataStatus === "measured") {
    const displayWidth = source.displayWidth ?? source.width;
    const displayHeight = source.displayHeight ?? source.height;
    if (!positive(displayWidth) || !positive(displayHeight)) return null;
    return { displayWidth, displayHeight };
  }
  if (!positive(source.displayWidth) || !positive(source.displayHeight)) return null;
  return { displayWidth: source.displayWidth, displayHeight: source.displayHeight };
}

/** 素材库和上传结果写入本地缓存时使用。不可信尺寸不记成已测量事实。 */
export function cachedImageFactFields(asset: SizeCarrier): Pick<
  PageMediaItem,
  "displayWidth" | "displayHeight" | "animated" | "metadataStatus" | "mediaRevision"
> {
  const trusted = trustedDisplaySize(asset);
  if (!trusted) {
    return asset.metadataStatus === "unknown" ? { metadataStatus: "unknown" } : {};
  }
  return {
    displayWidth: trusted.displayWidth,
    displayHeight: trusted.displayHeight,
    animated: asset.animated,
    metadataStatus: "measured",
    mediaRevision: asset.mediaRevision,
  };
}
