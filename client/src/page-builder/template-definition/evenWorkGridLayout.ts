/**
 * 作品陈列在固定横画布里按张数回流。
 * 双数不超过 4 张时排成一行；6 张及以上排成两行，每行张数是总数的一半（6 张就是上三下三）。
 * 卡片像素比例保持 4:5，放不进画布时缩小后居中，不把画布拉高。
 */

export const EVEN_WORK_GRID_TAG = "even-work-grid";

const PAD_X = 0.04;
const PAD_Y = 0.045;
const GAP_X = 0.016;
const GAP_Y = 0.024;
const CAPTION_HEIGHT = 0.058;
const CAPTION_GAP = 0.012;
/** 2:1 画布上，归一化高 / 宽 = 2.5 时，像素宽高比才是 4:5。 */
const IMAGE_HEIGHT_PER_WIDTH = 2.5;

export interface EvenWorkBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EvenWorkFrame {
  image: EvenWorkBox;
  caption: EvenWorkBox;
}

export interface EvenWorkGridShape {
  columns: number;
  rows: number;
}

interface EvenWorkPlacement extends EvenWorkBox {
  zIndex: number;
}

interface EvenWorkNode {
  nodeId: string;
  type: string;
  slotId?: string;
  childIds: string[];
  responsive: {
    desktop: {
      layoutMode?: string;
      placement?: EvenWorkPlacement;
    };
    mobile?: {
      placement?: unknown;
    };
  };
}

interface EvenWorkSlot {
  type: string;
  semanticRole?: string;
  key: string;
}

export interface EvenWorkDefinition {
  metadata: {
    sectionRole?: string;
    tags: string[];
    slotSummary: string;
  };
  nodes: Record<string, EvenWorkNode>;
  slots: Record<string, EvenWorkSlot>;
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function box(x: number, y: number, width: number, height: number): EvenWorkBox {
  return { x: round(x), y: round(y), width: round(width), height: round(height) };
}

export function usesEvenWorkGrid(definition: { metadata: { sectionRole?: string; tags?: string[] } }): boolean {
  return definition.metadata.sectionRole === "creation-grid"
    && (definition.metadata.tags ?? []).includes(EVEN_WORK_GRID_TAG);
}

/** 4 张及以下的双数排成一行；更长的双数拆成两行。奇数只作编辑中途的落点，末行居中，不作为默认。 */
export function evenWorkGridShape(count: number): EvenWorkGridShape {
  const safeCount = Math.max(0, Math.floor(count));
  if (safeCount <= 1) return { columns: 1, rows: 1 };
  if (safeCount % 2 === 0 && safeCount <= 4) return { columns: safeCount, rows: 1 };
  if (safeCount % 2 === 0) return { columns: safeCount / 2, rows: 2 };
  if (safeCount <= 3) return { columns: safeCount, rows: 1 };
  return { columns: Math.ceil(safeCount / 2), rows: 2 };
}

export function arrangeEvenWorkFrames(count: number): EvenWorkFrame[] {
  const safeCount = Math.max(0, Math.floor(count));
  const { columns, rows } = evenWorkGridShape(safeCount);
  const availableWidth = 1 - PAD_X * 2;
  const availableHeight = 1 - PAD_Y * 2;
  let imageWidth = (availableWidth - GAP_X * (columns - 1)) / columns;
  let imageHeight = imageWidth * IMAGE_HEIGHT_PER_WIDTH;
  const captionBlock = CAPTION_GAP + CAPTION_HEIGHT;
  let totalHeight = rows * (imageHeight + captionBlock) + (rows - 1) * GAP_Y;
  if (totalHeight > availableHeight) {
    const imageBudget = availableHeight - rows * captionBlock - (rows - 1) * GAP_Y;
    imageHeight = imageBudget / rows;
    imageWidth = imageHeight / IMAGE_HEIGHT_PER_WIDTH;
    totalHeight = rows * (imageHeight + captionBlock) + (rows - 1) * GAP_Y;
  }
  const originY = (1 - totalHeight) / 2;
  const frames: EvenWorkFrame[] = [];
  for (let index = 0; index < safeCount; index += 1) {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const itemsInRow = Math.min(columns, safeCount - row * columns);
    const rowWidth = itemsInRow * imageWidth + (itemsInRow - 1) * GAP_X;
    const originX = (1 - rowWidth) / 2;
    const x = originX + column * (imageWidth + GAP_X);
    const y = originY + row * (imageHeight + captionBlock + GAP_Y);
    frames.push({
      image: box(x, y, imageWidth, imageHeight),
      caption: box(x, y + imageHeight + CAPTION_GAP, imageWidth, CAPTION_HEIGHT),
    });
  }
  return frames;
}

function isWorkImage(slot: EvenWorkSlot | undefined): boolean {
  return slot?.type === "image" && slot.semanticRole !== "backgroundImage";
}

function isWorkCaption(slot: EvenWorkSlot | undefined): boolean {
  return Boolean(slot && (slot.semanticRole === "productName" || slot.key.startsWith("caption")));
}

export function findEvenWorkLayoutId(definition: EvenWorkDefinition): string | null {
  for (const node of Object.values(definition.nodes)) {
    if (node.type === "Stack" && node.responsive.desktop.layoutMode === "free") return node.nodeId;
  }
  return null;
}

/** 按当前图片张数重写桌面自由坐标。手机不写绝对位置，继续走两列配对。 */
export function reflowEvenWorkGrid(definition: EvenWorkDefinition): boolean {
  if (!usesEvenWorkGrid(definition)) return false;
  const layoutId = findEvenWorkLayoutId(definition);
  if (!layoutId) return false;
  const layout = definition.nodes[layoutId];
  const images: string[] = [];
  const captions: string[] = [];
  const rest: string[] = [];
  for (const childId of layout.childIds) {
    const child = definition.nodes[childId];
    const slot = child?.slotId ? definition.slots[child.slotId] : undefined;
    if (isWorkImage(slot)) images.push(childId);
    else if (isWorkCaption(slot)) captions.push(childId);
    else if (child) rest.push(childId);
  }
  if (images.length < 2) return false;
  const frames = arrangeEvenWorkFrames(images.length);
  const usedCaptions = captions.slice(0, images.length);
  layout.childIds = [...rest, ...images, ...usedCaptions, ...captions.slice(images.length)];
  images.forEach((nodeId, index) => {
    const node = definition.nodes[nodeId];
    const frame = frames[index].image;
    node.responsive.desktop.placement = {
      ...(node.responsive.desktop.placement ?? { x: 0, y: 0, width: frame.width, height: frame.height, zIndex: 1 }),
      ...frame,
      zIndex: node.responsive.desktop.placement?.zIndex ?? 1,
    };
    if (node.responsive.mobile?.placement) delete node.responsive.mobile.placement;
  });
  usedCaptions.forEach((nodeId, index) => {
    const node = definition.nodes[nodeId];
    const frame = frames[index].caption;
    node.responsive.desktop.placement = {
      ...(node.responsive.desktop.placement ?? { x: 0, y: 0, width: frame.width, height: frame.height, zIndex: 2 }),
      ...frame,
      zIndex: node.responsive.desktop.placement?.zIndex ?? 2,
    };
    if (node.responsive.mobile?.placement) delete node.responsive.mobile.placement;
  });
  definition.metadata.slotSummary = `${images.length} 个图片槽位，${captions.length} 个文字槽位`;
  return true;
}
