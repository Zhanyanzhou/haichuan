import type { DynamicTemplatePlacement, TemplateDefinitionV2 } from "../template-definition/generated/templateDefinition.generated";
import { resolveTemplateNodeRules, setTemplateNodeRule, type TemplateBreakpoint } from "../template-definition/responsive";

const GAP = 0.02;
const EPSILON = 0.000001;
const DEVICES = { desktop: "桌面", tablet: "平板", mobile: "手机" } as const;
type Box = Pick<DynamicTemplatePlacement, "x" | "y" | "width" | "height">;

function fits(box: Box, occupied: Box[]) {
  return box.x >= 0 && box.y >= 0 && box.width > 0 && box.height > 0
    && box.x + box.width <= 1 + EPSILON && box.y + box.height <= 1 + EPSILON
    && occupied.every((other) => box.x + box.width + GAP <= other.x + EPSILON
      || other.x + other.width + GAP <= box.x + EPSILON
      || box.y + box.height + GAP <= other.y + EPSILON
      || other.y + other.height + GAP <= box.y + EPSILON);
}

function findSpace(size: Box, occupied: Box[], anchor?: Box): Box | null {
  const after = anchor ? { ...size, x: anchor.x, y: anchor.y + anchor.height + GAP } : null;
  if (after && fits(after, occupied)) return after;
  // 从已有边缘寻找空位，尺寸保持不变，不逐像素搜索或重排原有对象。
  const coordinates = (axis: "x" | "y", extent: "width" | "height") => [...new Set([
    0, ...occupied.flatMap((box) => [box[axis], box[axis] + box[extent] + GAP, box[axis] - size[extent] - GAP]),
  ])].filter((value) => value >= 0 && value + size[extent] <= 1 + EPSILON).sort((a, b) => a - b);
  for (const y of coordinates("y", "height")) for (const x of coordinates("x", "width")) {
    const box = { ...size, x, y };
    if (fits(box, occupied)) return box;
  }
  return null;
}

/** 仅准备尚未提交的新节点；失败由调用方放弃整个候选，旧草稿和历史不变。 */
export function placeInsertedTemplateNode(definition: TemplateDefinitionV2, parentId: string, nodeId: string) {
  if (Number(definition.schemaVersion) < 3) return;
  const parent = definition.nodes[parentId];
  const node = definition.nodes[nodeId];
  if (!parent || !node) return;
  const slot = node.slotId ? definition.slots[node.slotId] : undefined;
  const text = slot && ["heading", "text", "richText", "badge", "button", "link"].includes(slot.type);
  const index = parent.childIds.indexOf(nodeId);
  for (const device of Object.keys(DEVICES) as TemplateBreakpoint[]) {
    if (parent.type !== "Stack" || resolveTemplateNodeRules(definition, parentId, device).layoutMode !== "free") continue;
    const placement = resolveTemplateNodeRules(definition, nodeId, device).placement;
    if (!placement) continue;
    const occupied = new Map<string, Box>();
    for (const siblingId of parent.childIds) {
      if (siblingId === nodeId) continue;
      const sibling = definition.nodes[siblingId];
      const rules = resolveTemplateNodeRules(definition, siblingId, device);
      const box = rules.placement;
      const siblingSlot = sibling.slotId ? definition.slots[sibling.slotId] : undefined;
      // 全幅背景本就承载前景叠加；普通图片与隐藏对象仍保留所占空间。
      const background = siblingSlot?.type === "image" && (siblingSlot.semanticRole === "backgroundImage"
        || (box && !rules.anchor && box.zIndex === 0 && box.x <= EPSILON && box.y <= EPSILON && box.width >= 1 && box.height >= 1));
      if (background) continue;
      if (!box || rules.anchor) {
        throw new Error(`${DEVICES[device]}布局的“${sibling.name}”使用锚定或其他独立定位，无法确认空位。请先调整该对象的定位，或选择其他区域添加。`);
      }
      occupied.set(siblingId, box);
    }
    const size = { ...placement, height: text ? Math.min(placement.height, .12) : placement.height };
    const boxes = [...occupied.values()];
    // 继承设备沿用已找到的位置；只有确实与独立布局冲突时才建立覆盖。
    const location = device !== "desktop" && fits(size, boxes) ? size
      : findSpace(size, boxes, occupied.get(parent.childIds[index - 1]));
    if (!location) throw new Error(`${DEVICES[device]}布局的“${parent.name}”没有足够空位。请扩大该区域、调整现有内容，或选择其他区域添加。`);
    if (location.x !== placement.x || location.y !== placement.y || location.height !== placement.height) {
      setTemplateNodeRule(definition, nodeId, device, "placement", { ...placement, ...location });
    }
  }
}
