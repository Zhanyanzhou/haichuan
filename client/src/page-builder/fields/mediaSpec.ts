export interface MediaSpec {
  /** 上传推荐像素。竖图换框后可能是短边 × 长边，不能拿来当 CSS 显示宽。 */
  width: number;
  height: number;
  ratio: string;
  label: string;
  /**
   * 模板设计画布上的槽位宽。桌面画布宽 1440。
   * 与 width 分开：1440×810 换成 9:16 后，上传推荐是 810×1440，设计基准仍是 1440。
   */
  designCanvasWidth?: number;
}

/** 槽位建议宽高转为上传规格；缺任一尺寸时不显示比例检查。 */
export function mediaSpecFromRecommendation(
  width?: number,
  height?: number,
  aspectRatio?: string,
  label = "建议尺寸",
): MediaSpec | undefined {
  if (!width || !height || width <= 0 || height <= 0) return undefined;
  return {
    width,
    height,
    ratio: aspectRatio ? aspectRatio.replace(":", " / ") : `${width} / ${height}`,
    label,
    designCanvasWidth: width,
  };
}

function parseFrameRatio(ratio: string | undefined): { width: number; height: number } | null {
  if (!ratio) return null;
  const match = ratio.replace(/\s+/g, "").match(/^(\d+(?:\.\d+)?)[:/](\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!(width > 0) || !(height > 0)) return null;
  return { width, height };
}

/**
 * 上传规格跟着当前画框走。比例检查读的是宽和高，只改比例文字不会改变判定。
 * 画框换成竖图时，沿用原来的长边重算短边，例如 1440×810 的 16:9 变成 810×1440 的 9:16。
 * 不写回模板上的建议宽高。designCanvasWidth 仍记换算前的槽位宽。
 */
export function mediaSpecMatchingFrame(
  width: number | undefined,
  height: number | undefined,
  frameRatio: string | undefined,
  label = "建议尺寸",
): MediaSpec | undefined {
  const parts = parseFrameRatio(frameRatio);
  if (!parts) return mediaSpecFromRecommendation(width, height, frameRatio, label);
  const target = parts.width / parts.height;
  const ratio = `${parts.width} / ${parts.height}`;
  const stored = mediaSpecFromRecommendation(width, height, frameRatio, label);
  if (stored && Math.abs(stored.width / stored.height - target) / target <= 0.02) {
    return { ...stored, ratio };
  }
  const longSide = stored ? Math.max(stored.width, stored.height) : 1920;
  const shortSide = Math.max(1, Math.round(longSide * Math.min(target, 1 / target)));
  const portrait = target < 1;
  return {
    width: portrait ? shortSide : longSide,
    height: portrait ? longSide : shortSide,
    ratio,
    label,
    ...(stored?.designCanvasWidth ? { designCanvasWidth: stored.designCanvasWidth } : {}),
  };
}
