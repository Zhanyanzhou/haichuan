import type { TemplateRecipe } from "../template-definition/generated/templateDefinition.generated";

export type Rect = { x: number; y: number; width: number; height: number };
const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });
/** 归一化设计空间；界面结构缩略图与生成器共同使用，避免两种布局解释。 */
export function layoutRegions(layout: TemplateRecipe["layout"], canvas?: { width: number; height: number; margin: number; gap: number }): { media: Rect; content: Rect } {
  if (canvas) {
    const x = canvas.margin / canvas.width;
    const y = canvas.margin / canvas.height;
    const w = 1 - 2 * x;
    const h = 1 - 2 * y;
    const gx = canvas.gap / canvas.width;
    const gy = canvas.gap / canvas.height;
    if (layout === "fullImageOverlay") return { media: rect(0, 0, 1, 1), content: rect(x, y + h * .5, w, h * .5) };
    if (layout === "centerSubject" || layout === "headerSubjectFooter") {
      return { media: rect(x + (layout === "centerSubject" ? w * .15 : 0), y + h * .18, layout === "centerSubject" ? w * .7 : w, h * .46), content: rect(x, y + h * .7, w, h * .3) };
    }
    if (layout === "free") return { media: rect(x, y, w * .65, h * .55), content: rect(x + w * .2, y + h * .6, w * .8, h * .4) };
    if (layout === "leftImageRightContent" || layout === "leftContentRightImage" || layout === "splitColumns") {
      const half = (w - gx) / 2;
      const left = rect(x, y, half, h);
      const right = rect(x + half + gx, y, half, h);
      return layout === "leftContentRightImage" ? { media: right, content: left } : { media: left, content: right };
    }
    const mediaHeight = (h - gy) * .56;
    const contentHeight = h - gy - mediaHeight;
    return layout === "topContentBottomImage"
      ? { content: rect(x, y, w, contentHeight), media: rect(x, y + contentHeight + gy, w, mediaHeight) }
      : { media: rect(x, y, w, mediaHeight), content: rect(x, y + mediaHeight + gy, w, contentHeight) };
  }
  switch (layout) {
    case "topContentBottomImage": return { media: rect(.06, .45, .88, .49), content: rect(.06, .06, .88, .33) };
    case "leftImageRightContent": return { media: rect(.05, .06, .44, .88), content: rect(.54, .1, .41, .8) };
    case "leftContentRightImage": return { media: rect(.51, .06, .44, .88), content: rect(.05, .1, .41, .8) };
    case "fullImageOverlay": return { media: rect(0, 0, 1, 1), content: rect(.08, .53, .84, .39) };
    case "centerSubject": return { media: rect(.2, .18, .6, .5), content: rect(.12, .72, .76, .23) };
    case "headerSubjectFooter": return { media: rect(.08, .23, .84, .47), content: rect(.08, .76, .84, .19) };
    case "splitColumns": return { media: rect(.05, .08, .42, .84), content: rect(.53, .08, .42, .84) };
    case "cards": return { media: rect(.06, .1, .88, .47), content: rect(.06, .62, .88, .3) };
    case "free": return { media: rect(.08, .1, .52, .56), content: rect(.32, .7, .6, .25) };
    default: return { media: rect(.06, .06, .88, .51), content: rect(.06, .63, .88, .31) };
  }
}
export function subdivide(area: Rect, count: number, horizontal: boolean, gap = .018): Rect[] {
  if (!count) return [];
  const safeGap = Math.min(gap, (horizontal ? area.width : area.height) / (count * 3));
  const extent = ((horizontal ? area.width : area.height) - safeGap * (count - 1)) / count;
  return Array.from({ length: count }, (_, index) => horizontal
    ? rect(area.x + index * (extent + safeGap), area.y, extent, area.height)
    : rect(area.x, area.y + index * (extent + safeGap), area.width, extent));
}
