/**
 * D.38：把“必填”拆成三种可预测承诺。
 * 建议填写不阻断；公开时必须有内容可以由页面填写或已发布的固定文案满足；
 * 必须由页面填写时，模板默认文案不能代替。
 * 价格、原价、折扣、优惠不是固定文案，必须绑定业务对象后才可能公开。
 */

export const COMMERCIAL_SEMANTIC_ROLES = ["price", "originalPrice", "discount", "offer"] as const;

export const BRAND_NARRATIVE_PAGE_KEYS = ["home", "products", "about", "custom", "contact"] as const;

export type PublicationPromise = "suggested" | "page-authored" | "fixed-source";

const COMMERCIAL_ROLE_SET = new Set<string>(COMMERCIAL_SEMANTIC_ROLES);

export function isCommercialSemanticRole(role: string | undefined): boolean {
  return Boolean(role && COMMERCIAL_ROLE_SET.has(role));
}

export function isBrandNarrativePage(pageKey: string | undefined): boolean {
  return Boolean(pageKey && (BRAND_NARRATIVE_PAGE_KEYS as readonly string[]).includes(pageKey));
}

function hasMeaningfulFixedText(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasMeaningfulFixedText);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(hasMeaningfulFixedText);
  }
  return false;
}

/** 锁定字段能否用已发布模板默认内容满足“公开时必须有内容”。图片和经营数字不能。 */
export function hasLegalFixedPublicContent(
  slotType: string,
  semanticRole: string | undefined,
  value: unknown,
): boolean {
  if (isCommercialSemanticRole(semanticRole)) return false;
  if (slotType === "image" || slotType === "product" || slotType === "collection" || slotType === "heroTemplate") {
    return false;
  }
  return hasMeaningfulFixedText(value);
}

export function publicationPromise(slot: { required: boolean; editable: boolean }): PublicationPromise {
  if (!slot.required) return "suggested";
  return slot.editable ? "page-authored" : "fixed-source";
}

export function publicationPromiseLabel(slot: { required: boolean; editable: boolean }): string {
  const promise = publicationPromise(slot);
  if (promise === "suggested") return "建议填写";
  if (promise === "page-authored") return "必须由页面填写";
  return "固定展示";
}
