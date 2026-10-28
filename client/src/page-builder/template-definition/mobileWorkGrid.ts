/**
 * 手机上把连续的作品卡收成两列。
 * 主图、标志、背景和工艺副图保持单列；叙事大图不因为旁边还有一张图就被并排。
 */

export interface MobileWorkNode {
  nodeId: string;
  type: string;
  hidden?: boolean;
  slot?: { type?: string; semanticRole?: string };
  children: readonly MobileWorkNode[];
  rules?: { layoutMode?: string };
}

const STRUCTURE_TYPES = new Set(["Container", "Stack", "Column", "Grid"]);

function isHeroMediaRole(role: string | undefined): boolean {
  return role === "backgroundImage" || role === "heroImage" || role === "logo";
}

function collectImages(node: MobileWorkNode, found: MobileWorkNode[]): void {
  if (node.hidden) return;
  if (node.slot?.type === "image") found.push(node);
  for (const child of node.children) collectImages(child, found);
}

/** 一张可并排的作品图，或只包着这一张作品图的卡片。 */
export function isMobileWorkUnit(node: MobileWorkNode, sectionRole?: string): boolean {
  if (node.hidden) return false;
  if (node.slot?.type === "image") {
    const role = node.slot.semanticRole;
    if (isHeroMediaRole(role)) return false;
    if (role === "secondaryImage") return sectionRole === "creation-grid";
    return true;
  }
  if (node.slot || node.rules?.layoutMode === "free" || !STRUCTURE_TYPES.has(node.type)) return false;
  const images: MobileWorkNode[] = [];
  collectImages(node, images);
  if (images.length !== 1) return false;
  return isMobileWorkUnit(images[0], sectionRole);
}

export function partitionMobileWorkUnits<T extends MobileWorkNode>(
  children: readonly T[],
  options: {
    device: "desktop" | "mobile";
    sectionRole?: string;
    layoutMode?: string;
    display?: string;
    columnCount?: number;
  },
): Array<{ kind: "node"; node: T } | { kind: "works"; nodes: T[] }> {
  const alreadyTwoColumns = options.display === "grid" && (options.columnCount ?? 0) >= 2;
  // 作者把手机写成单列时，不能再把卡片收成两列。
  const explicitSingleColumn = options.display === "grid" && options.columnCount === 1;
  const pairable = children.filter((child) => isMobileWorkUnit(child, options.sectionRole));
  const pairWorkCards = options.device === "mobile"
    && options.layoutMode !== "free"
    && !alreadyTwoColumns
    && !explicitSingleColumn
    && pairable.length >= 2
    && (options.sectionRole === "creation-grid" || pairable.length >= 3);
  const groups: Array<{ kind: "node"; node: T } | { kind: "works"; nodes: T[] }> = [];
  for (const child of children) {
    if (!pairWorkCards || !isMobileWorkUnit(child, options.sectionRole)) {
      groups.push({ kind: "node", node: child });
      continue;
    }
    const last = groups[groups.length - 1];
    if (last?.kind === "works") last.nodes.push(child);
    else groups.push({ kind: "works", nodes: [child] });
  }
  return groups;
}

const WORK_CAPTION_ROLES = new Set(["productName", "sellingPoint", "price", "originalPrice"]);

/**
 * 作品图后面紧跟的品名，按顺序收进对应的卡里。
 * 数量对不上就保持原位，避免把章节标题绑到某一张图上。
 */
export function attachMobileWorkCaptions<T extends MobileWorkNode>(
  groups: ReadonlyArray<{ kind: "node"; node: T } | { kind: "works"; nodes: T[] }>,
): Array<{ kind: "node"; node: T } | { kind: "works"; nodes: T[]; captions: T[] }> {
  const next: Array<{ kind: "node"; node: T } | { kind: "works"; nodes: T[]; captions: T[] }> = [];
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index];
    if (group.kind !== "works" || group.nodes.length < 2) {
      next.push(group.kind === "works" ? { ...group, captions: [] } : group);
      continue;
    }
    const captions: T[] = [];
    let cursor = index + 1;
    while (cursor < groups.length && captions.length < group.nodes.length) {
      const candidate = groups[cursor];
      if (candidate.kind !== "node" || !WORK_CAPTION_ROLES.has(candidate.node.slot?.semanticRole ?? "")) break;
      captions.push(candidate.node);
      cursor += 1;
    }
    if (captions.length === group.nodes.length) {
      next.push({ kind: "works", nodes: group.nodes, captions });
      index = cursor - 1;
    } else {
      next.push({ kind: "works", nodes: group.nodes, captions: [] });
    }
  }
  return next;
}

/**
 * 手机作品卡用 4:5。横图在手机上还没有竖向外框时，也用 4:5，不再留成一条扁图。
 * 背景图和 Logo 保持原外框；已经是竖图的叙事图不改。
 */
const LATER_FULL_BLEED_SECTIONS = new Set(["editorial-media", "video-story"]);

/**
 * 手机图片外框。作品卡、以及还没有竖向比例的图，统一 4:5。
 * 已经是竖图或正方形的保持原样。后面的通栏章节继续用自己的横幅。
 * 标志不改。没有写明比例时也不跟素材文件的横宽走，避免目录里的示意横图把整节压成一条。
 */
export function resolveMobileImageFrame(input: {
  device: "desktop" | "mobile";
  inWorkGrid: boolean;
  slotType?: string;
  semanticRole?: string;
  sectionRole?: string;
  ratio: number | undefined;
}): "4 / 5" | undefined {
  if (input.device !== "mobile" || input.slotType !== "image") return undefined;
  if (input.semanticRole === "logo") return undefined;
  if (input.inWorkGrid) return "4 / 5";
  if (input.ratio !== undefined && input.ratio <= 1) return undefined;
  if (input.semanticRole === "backgroundImage") {
    if (LATER_FULL_BLEED_SECTIONS.has(input.sectionRole ?? "")) return undefined;
    if (input.sectionRole === "page-hero" || input.ratio === undefined) return "4 / 5";
    return undefined;
  }
  return "4 / 5";
}
