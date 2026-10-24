/**
 * D.38 / D.40：把“必填”拆成可预测承诺。
 * Schema 1 保留已发布固定文案的历史兼容；Schema 3 公开面只认页面自己的值，
 * 因此 required + editable:false 是规则冲突。
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

/** 历史 Schema 的锁定字段能否用已发布模板默认内容满足公开；Schema 3 一律不能。 */
export function hasLegalFixedPublicContent(
  slotType: string,
  semanticRole: string | undefined,
  value: unknown,
  schemaVersion = 1,
): boolean {
  if (schemaVersion >= 3) return false;
  if (isCommercialSemanticRole(semanticRole)) return false;
  if (slotType === "image" || slotType === "product" || slotType === "collection" || slotType === "heroTemplate") {
    return false;
  }
  return hasMeaningfulFixedText(value);
}

export function publicationPromise(
  slot: { required: boolean; editable: boolean },
  schemaVersion = 1,
): PublicationPromise {
  if (!slot.required) return "suggested";
  return slot.editable || schemaVersion >= 3 ? "page-authored" : "fixed-source";
}

export function publicationPromiseLabel(
  slot: { required: boolean; editable: boolean },
  schemaVersion = 1,
): string {
  const promise = publicationPromise(slot, schemaVersion);
  if (promise === "suggested") return "建议填写";
  if (promise === "page-authored") return slot.editable ? "必须由页面填写" : "规则冲突";
  return "固定展示";
}
