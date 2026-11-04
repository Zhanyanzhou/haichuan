/**
 * 固定比例根的手机画布：把桌面比例的两个数字对调，再在这块画布里重排同级图片。
 * 16:9 对 9:16，1:2 对 2:1，4:5 对 5:4，1:1 对调后仍是 1:1。
 * 根随内容时，主舞台或模板声明的比例同样对换。作者已经给手机写了比例或高度时，不再覆盖。
 */

const READABLE_MIN = 2 / 3;
const READABLE_MAX = 16 / 9;

export interface PairedCanvasRatio {
  width: number;
  height: number;
}

/** 创建器与属性区共用的标准双端画幅；读旧定义时不按此表改写。 */
export const STANDARD_TEMPLATE_CANVAS_PAIRS = [
  { desktop: { width: 2, height: 1 }, mobile: { width: 1, height: 2 } },
  { desktop: { width: 16, height: 9 }, mobile: { width: 9, height: 16 } },
  { desktop: { width: 3, height: 2 }, mobile: { width: 2, height: 3 } },
  { desktop: { width: 4, height: 3 }, mobile: { width: 3, height: 4 } },
  { desktop: { width: 1, height: 1 }, mobile: { width: 1, height: 1 } },
  { desktop: { width: 4, height: 5 }, mobile: { width: 5, height: 4 } },
] as const;

export interface PeerImageSplit {
  columns: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  /** 格子比例落在 2:3 到 16:9 之外较远时，编辑器标出溢出，不把画布拉高。 */
  overflow: boolean;
}

/** 作品卡保持 4:5。格子比这个更矮时标溢出，不把卡片压扁或拉高画布。 */
export function workCardOverflowsCell(cellWidth: number, cellHeight: number): boolean {
  if (!(cellWidth > 0) || !(cellHeight > 0)) return false;
  return cellWidth * (5 / 4) > cellHeight + 1;
}

/** 对调比例的两个数字。1:2 变成 2:1，方图对调后仍是 1:1。 */
export function swapCanvasRatio(ratio: PairedCanvasRatio): PairedCanvasRatio {
  if (!(ratio.width > 0) || !(ratio.height > 0)) return { width: 1, height: 1 };
  return { width: ratio.height, height: ratio.width };
}

/**
 * 在固定手机画布的图片区里，为同级图片选择行数和列数。
 * 只接受正好铺满的行列，避免奇数张留下空格。
 * 优先让单格宽高比落在 2:3 到 16:9。
 * 窄于 2:3 的列不如略宽于 16:9 的横行，因此三张图排成三行，不排成三列窄缝。
 * 距离相同时，列数更少的一种优先。
 */
export function choosePeerImageSplit(
  count: number,
  innerWidth: number,
  innerHeight: number,
  gap = 12,
): PeerImageSplit {
  const safeCount = Math.max(1, Math.floor(count));
  let best: PeerImageSplit | null = null;
  for (let columns = 1; columns <= safeCount; columns += 1) {
    if (safeCount % columns !== 0) continue;
    const rows = safeCount / columns;
    const cellWidth = (innerWidth - gap * (columns - 1)) / columns;
    const cellHeight = (innerHeight - gap * (rows - 1)) / rows;
    if (!(cellWidth > 0) || !(cellHeight > 0)) continue;
    const aspect = cellWidth / cellHeight;
    const distance = aspect < READABLE_MIN
      ? READABLE_MIN - aspect
      : aspect > READABLE_MAX
        ? aspect - READABLE_MAX
        : 0;
    // 三行横图的短边大约 186。再矮的格子标溢出，不把画布拉高。
    const shortSide = Math.min(cellWidth, cellHeight);
    const candidate: PeerImageSplit = {
      columns,
      rows,
      cellWidth,
      cellHeight,
      overflow: distance > 0.35 || shortSide < 180,
    };
    if (!best || prefersPeerSplit(candidate, best)) best = candidate;
  }
  if (best) return best;
  return {
    columns: 1,
    rows: safeCount,
    cellWidth: Math.max(innerWidth, 1),
    cellHeight: Math.max(innerHeight / safeCount, 1),
    overflow: true,
  };
}

function bestOverflowDistance(split: PeerImageSplit): number {
  const aspect = split.cellWidth / split.cellHeight;
  if (aspect < READABLE_MIN) return READABLE_MIN - aspect;
  if (aspect > READABLE_MAX) return aspect - READABLE_MAX;
  return 0;
}

/** 先避开窄缝，再靠近可读范围，最后减少列数。 */
function prefersPeerSplit(candidate: PeerImageSplit, best: PeerImageSplit): boolean {
  const candidateNarrow = candidate.cellWidth / candidate.cellHeight < READABLE_MIN;
  const bestNarrow = best.cellWidth / best.cellHeight < READABLE_MIN;
  if (candidateNarrow !== bestNarrow) return !candidateNarrow;
  const candidateDistance = bestOverflowDistance(candidate);
  const bestDistance = bestOverflowDistance(best);
  if (candidateDistance < bestDistance - 1e-6) return true;
  return Math.abs(candidateDistance - bestDistance) <= 1e-6 && candidate.columns < best.columns;
}

/** 390 宽的对换画布里，去掉页边和可选标题带之后的图片区。 */
export function pairedCanvasContentBox(
  ratio: PairedCanvasRatio,
  options: { reserveText?: boolean; viewportWidth?: number } = {},
): { canvasHeight: number; innerWidth: number; innerHeight: number } {
  const viewportWidth = options.viewportWidth ?? 390;
  const canvasHeight = viewportWidth * ratio.height / ratio.width;
  const innerWidth = viewportWidth - 40;
  const innerHeight = canvasHeight - 48 - (options.reserveText ? 64 : 0);
  return {
    canvasHeight,
    innerWidth,
    innerHeight: Math.max(1, innerHeight),
  };
}
