/**
 * 手机默认把文字排进主图槽位，不再在图片下面另起一条。
 * 一节只有一张主图时，旁边或后面的文字组收进这张图的框里。
 * 副图、作品网格和已经叠在图上的自由定位保持原位。
 */

const COPY_SLOT_TYPES = new Set(["heading", "text", "richText", "badge", "button", "link"]);

interface CopyFrameNode {
  hidden?: boolean;
  slot?: { type?: string; semanticRole?: string };
  rules: { layoutMode?: string; placement?: unknown; anchor?: unknown };
  children: readonly CopyFrameNode[];
}

export interface MobileCopyFrame<T> {
  kind: "frame";
  image: T;
  copy: T[];
  rest: T[];
}

export interface MobileCopyNodes<T> {
  kind: "nodes";
  nodes: T[];
}

function isTextSlot(node: CopyFrameNode): boolean {
  return Boolean(node.slot && COPY_SLOT_TYPES.has(node.slot.type ?? ""));
}

function isLogo(node: CopyFrameNode): boolean {
  return node.slot?.type === "image" && node.slot.semanticRole === "logo";
}

/** 文字组。可以带 Logo，不能再带主图或副图。 */
function isCopyBranch(node: CopyFrameNode): boolean {
  if (node.hidden || node.rules.placement || node.rules.anchor) return false;
  if (isLogo(node) || isTextSlot(node)) return isTextSlot(node) || false;
  if (node.slot || node.rules.layoutMode === "free") return false;
  const children = node.children.filter((child) => !child.hidden);
  if (children.length === 0 || !children.every((child) => isLogo(child) || isCopyBranch(child))) return false;
  return children.some((child) => isTextSlot(child) || (!child.slot && isCopyBranch(child)));
}

function isPrimaryImage(node: CopyFrameNode): boolean {
  if (node.hidden || node.slot?.type !== "image") return false;
  const role = node.slot.semanticRole;
  return role !== "logo" && role !== "secondaryImage";
}

function extractPrimary(node: CopyFrameNode): { image: CopyFrameNode; rest: CopyFrameNode[] } | undefined {
  if (isPrimaryImage(node)) return { image: node, rest: [] };
  if (node.hidden || node.slot || node.rules.layoutMode === "free" || node.rules.placement) return undefined;
  const children = node.children.filter((child) => !child.hidden);
  const images = children.filter(isPrimaryImage);
  if (images.length !== 1 || children.some(isCopyBranch)) return undefined;
  return { image: images[0], rest: children.filter((child) => child !== images[0]) };
}

export function segmentMobileCopyFrames<T extends CopyFrameNode>(
  children: readonly T[],
): Array<MobileCopyFrame<T> | MobileCopyNodes<T>> {
  const visible = children.filter((child) => !child.hidden);
  const media = visible.filter((child) => extractPrimary(child));
  if (media.length !== 1) return [{ kind: "nodes", nodes: visible }];
  const host = media[0];
  const extracted = extractPrimary(host);
  if (!extracted) return [{ kind: "nodes", nodes: visible }];
  const copy = visible.filter((child) => child !== host && isCopyBranch(child));
  if (copy.length === 0) return [{ kind: "nodes", nodes: visible }];
  const segments: Array<MobileCopyFrame<T> | MobileCopyNodes<T>> = [];
  const pending: T[] = [];
  const flush = () => {
    if (pending.length === 0) return;
    segments.push({ kind: "nodes", nodes: [...pending] });
    pending.length = 0;
  };
  for (const child of visible) {
    if (copy.includes(child)) continue;
    if (child === host) {
      flush();
      segments.push({
        kind: "frame",
        image: extracted.image as T,
        copy,
        rest: extracted.rest as T[],
      });
      continue;
    }
    pending.push(child);
  }
  flush();
  return segments;
}
