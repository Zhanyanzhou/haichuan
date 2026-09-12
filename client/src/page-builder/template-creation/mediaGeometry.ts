import type { TemplateRecipe } from "../template-definition/generated/templateDefinition.generated";
import type { Rect } from "./layoutGeometry";

type Media = TemplateRecipe["media"][number];
type MediaArrangement = NonNullable<TemplateRecipe["rules"]["mediaArrangement"]>;

/** 在设计像素中排布实际外框；保持用户比例，不把填充方式当成外框拉伸。 */
export function fitMedia(area: Rect, media: Media): Rect {
  const width = media.freeRatio ? area.width : Math.min(area.width, area.height * media.aspectRatio);
  const height = media.freeRatio ? area.height : width / media.aspectRatio;
  return { x: area.x + (area.width - width) / 2, y: area.y + (area.height - height) / 2, width, height };
}

function grid(area: Rect, media: Media[], columns: number, gap: number): Rect[] {
  const rows = Math.ceil(media.length / columns);
  const width = (area.width - gap * (columns - 1)) / columns;
  const height = (area.height - gap * (rows - 1)) / rows;
  if (width <= 0 || height <= 0) return [];
  const frames = media.map((item) => fitMedia({ x: 0, y: 0, width, height }, item));
  const rowHeights = Array.from({ length: rows }, (_, row) => Math.max(...frames.slice(row * columns, (row + 1) * columns).map((frame) => frame.height)));
  const totalHeight = rowHeights.reduce((sum, value) => sum + value, gap * (rows - 1));
  let y = area.y + (area.height - totalHeight) / 2;
  for (let row = 0; row < rows; row += 1) {
    const items = frames.slice(row * columns, (row + 1) * columns);
    // 最后一行按实际图片居中；比例收缩后的空白不再叠加到图片间距中。
    let x = area.x + (area.width - items.reduce((sum, frame) => sum + frame.width, gap * (items.length - 1))) / 2;
    for (const frame of items) {
      frame.x = x;
      frame.y = y + (rowHeights[row] - frame.height) / 2;
      x += frame.width + gap;
    }
    y += rowHeights[row] + gap;
  }
  return frames;
}

function score(frames: Rect[]): number {
  if (!frames.length) return -Infinity;
  const areas = frames.map((frame) => frame.width * frame.height);
  // 同时考虑总展示面积和最小图片，避免混合比例时牺牲其中一张。
  return areas.reduce((sum, area) => sum + area, 0) + Math.min(...areas) * frames.length;
}

function equalMedia(area: Rect, media: Media[], gap: number): Rect[] {
  let best: Rect[] = [];
  for (let columns = 1; columns <= media.length; columns += 1) {
    const candidate = grid(area, media, columns, gap);
    if (score(candidate) > score(best)) best = candidate;
  }
  return best;
}

export function arrangeMedia(area: Rect, media: Media[], gap: number, arrangement: MediaArrangement = "auto"): Rect[] {
  if (!media.length) return [];
  const heroIndex = media.findIndex((item) => item.role === "heroImage");
  if (heroIndex < 0 || !media.some((item) => item.role === "secondaryImage")) {
    return arrangement === "auto" ? equalMedia(area, media, gap) : grid(area, media, arrangement === "row" ? media.length : 1, gap);
  }
  const companions = media.filter((_, index) => index !== heroIndex);
  let best: Rect[] = [];
  for (const horizontal of arrangement === "auto" ? [true, false] : [arrangement === "row"]) {
    const extent = (horizontal ? area.width : area.height) - gap;
    if (extent <= 0) continue;
    const heroBox = { ...area, ...(horizontal ? { width: extent * 2 / 3 } : { height: extent * 2 / 3 }) };
    const companionBox = horizontal
      ? { ...area, x: area.x + heroBox.width + gap, width: extent / 3 }
      : { ...area, y: area.y + heroBox.height + gap, height: extent / 3 };
    const hero = fitMedia(heroBox, media[heroIndex]);
    // 固定主副方向时，副图沿侧栏排列；单图比例只影响各自外框，不触发构图翻转。
    const otherFrames = arrangement === "auto" ? equalMedia(companionBox, companions, gap)
      : grid(companionBox, companions, horizontal ? 1 : companions.length, gap);
    if (otherFrames.length !== companions.length) continue;
    for (const frame of otherFrames) {
      // 主次由最终可见面积保证，而非只给主图分一个更大的空区域。
      const scale = Math.min(1, Math.sqrt(hero.width * hero.height / (frame.width * frame.height * 2.25)));
      frame.x += frame.width * (1 - scale) / 2;
      frame.y += frame.height * (1 - scale) / 2;
      frame.width *= scale;
      frame.height *= scale;
    }
    let index = 0;
    const candidate = media.map((_, mediaIndex) => mediaIndex === heroIndex ? hero : otherFrames[index++]);
    if (score(candidate) > score(best)) best = candidate;
  }
  return best;
}
