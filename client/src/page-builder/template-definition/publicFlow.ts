import { isSafeTemplateMediaUrl } from "./validateTemplateDefinition";

/**
 * 公开页上还会占住一条流式高度的节点。
 * 空的文字、按钮和只剩内边距的容器不算：手机深色画布上它们会在满幅图下面露出一条黑带。
 * 编辑器仍渲染这些空位，方便选中和补内容。
 */
export interface PublicFlowNode {
  hidden?: boolean;
  type: string;
  slot?: { type?: string };
  content?: unknown;
  rules?: {
    backgroundColor?: string;
    backgroundToken?: string;
    backgroundImage?: string;
  };
  children?: readonly PublicFlowNode[];
}

const TEXT_SLOTS = new Set(["heading", "text", "richText", "badge", "icon"]);
const ACTION_SLOTS = new Set(["button", "link"]);

function textContent(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function imageSource(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const source = (value as { src?: unknown }).src;
  return typeof source === "string" ? source.trim() : "";
}

function actionLabel(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const label = (value as { label?: unknown }).label;
  return typeof label === "string" ? label.trim() : "";
}

function hasOwnPaint(node: PublicFlowNode): boolean {
  const rules = node.rules;
  if (!rules) return false;
  if (rules.backgroundToken) return true;
  if (rules.backgroundColor && /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(rules.backgroundColor)) return true;
  return Boolean(rules.backgroundImage && isSafeTemplateMediaUrl(rules.backgroundImage));
}

export function publicFlowNodeIsVisible(node: PublicFlowNode): boolean {
  if (node.hidden) return false;
  if (node.type === "Spacer" || node.type === "Divider") return true;
  if (hasOwnPaint(node)) return true;
  const slotType = node.slot?.type;
  if (slotType === "image") return Boolean(imageSource(node.content));
  if (slotType && TEXT_SLOTS.has(slotType)) return Boolean(textContent(node.content));
  if (slotType && ACTION_SLOTS.has(slotType)) return Boolean(actionLabel(node.content));
  // 商品和集合在公开页由业务区渲染，槽位本身不占高度。
  if (slotType === "product" || slotType === "collection") return false;
  if (slotType) return true;
  return (node.children ?? []).some(publicFlowNodeIsVisible);
}
