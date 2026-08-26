type PublicProductReference = {
  id: string | number;
  code?: string | null;
};

export type PublicProductInquiryType =
  | "appointment"
  | "product"
  | "purchase-support"
  | "custom";

/** URL 中的作品引用只允许复用数据库货号上限，不把任意长文本带入查询链。 */
export function normalizePublicProductReference(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const reference = value.trim();
  const hasControlCharacter = Array.from(reference).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
  if (
    reference.length === 0
    || reference.length > 50
    || hasControlCharacter
  ) {
    return null;
  }
  return reference;
}

function publicProductReference(product: PublicProductReference): string {
  const code = normalizePublicProductReference(product.code);
  return code || String(product.id);
}

/** 新公开链接优先使用稳定货号；旧数据缺少货号时保留数字 ID 兼容。 */
export function publicProductPath(product: PublicProductReference): string {
  return `/products/${encodeURIComponent(publicProductReference(product))}`;
}

/** 详情咨询只传稳定引用和白名单来源类型，不把名称、价格等可伪造快照放入 URL。 */
export function publicProductInquiryPath(
  product: PublicProductReference,
  type: PublicProductInquiryType,
): string {
  const params = new URLSearchParams({
    type,
    productRef: publicProductReference(product),
  });
  const pathname = type === "custom" ? "/custom" : "/contact";
  return `${pathname}?${params.toString()}`;
}
