import { cartApi, productApi } from "@/services/api";
import type { Product } from "@/types";
import { unwrapResponse } from "@/utils/unwrap";
import { publicProductPath } from "@/utils/publicProductPath";

export type ListingCartReference = {
  id: number;
  code?: string | null;
};

export type ListingCartResult =
  | { status: "added"; productId: number }
  | { status: "choose-specification"; path: string }
  | { status: "unavailable"; path: string };

/**
 * 列表上的加入购物车只接受一件可售、有公开价格的直接销售规格。
 * 多规格必须回到作品详情选择，不能替顾客猜规格。
 */
export async function addListingToCart(
  reference: ListingCartReference,
): Promise<ListingCartResult> {
  const path = publicProductPath(reference);
  const response = await productApi.getPublicById(reference.code || String(reference.id), {
    suppressGlobalError: true,
  });
  const detail = unwrapResponse<Product | null>(response);
  const skus = (detail?.skus ?? []).filter((item) => (
    item.isActive
    && item.isAvailableForPurchase === true
    && Number(item.price) > 0
  ));
  if (
    !detail
    || detail.salesMode !== "DIRECT_PURCHASE"
    || detail.isAvailableForPurchase !== true
    || skus.length === 0
  ) {
    return { status: "unavailable", path };
  }
  if (skus.length > 1) {
    return { status: "choose-specification", path };
  }
  await cartApi.add({
    productId: detail.id,
    skuId: skus[0].id,
    quantity: 1,
  });
  return { status: "added", productId: detail.id };
}
