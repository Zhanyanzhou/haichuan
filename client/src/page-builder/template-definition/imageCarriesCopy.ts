/**
 * 页面实例选择「图片已含标题」后，这一节只保留一处画面文字。
 * 标题仍留在 DOM 里供大纲和读屏；副标题和按钮不再画到画面上。
 */

export interface ArtworkCopySlot {
  type?: string;
  semanticRole?: string;
  key?: string;
}

export interface ArtworkCopyNode {
  type?: string;
  hidden?: boolean;
  slot?: ArtworkCopySlot;
  children: readonly ArtworkCopyNode[];
}

export type ArtworkCopyTreatment = "omit" | "clip";

export function isFinishedArtworkSubtitle(slot: ArtworkCopySlot | undefined): boolean {
  if (!slot) return false;
  if (slot.type !== "text" && slot.type !== "richText") return false;
  return slot.semanticRole === "subtitle" || slot.key === "subtitle";
}

/** 完成稿不绘制的槽位。标题改为视觉隐藏，不从 DOM 移除。 */
export function artworkCopyTreatment(slot: ArtworkCopySlot | undefined): ArtworkCopyTreatment | null {
  if (!slot?.type) return null;
  if (slot.type === "heading") return "clip";
  if (slot.type === "button") return "omit";
  if (isFinishedArtworkSubtitle(slot)) return "omit";
  return null;
}

/**
 * 只装着标题、副标题或按钮的叠层收成读屏文本。
 * 仍有正文、图片或其他槽位的容器保持原样。
 */
export function artworkNodeClips(node: ArtworkCopyNode): boolean {
  if (node.type === "Section" || node.type === "Spacer" || node.type === "Divider") return false;
  if (node.hidden) return false;
  const treatment = artworkCopyTreatment(node.slot);
  if (treatment === "clip") return true;
  if (treatment === "omit" || node.slot) return false;
  if (node.children.length === 0) return false;
  return node.children.every((child) => (
    child.hidden === true
    || artworkCopyTreatment(child.slot) === "omit"
    || artworkNodeClips(child)
  ));
}
