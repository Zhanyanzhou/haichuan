import type { Product } from "@/types";
import { salesModeLabels } from "./productManageModel";

export type BatchPriceMode = "fill-empty" | "overwrite";

export type BatchPriceUpdate = {
  productId: number;
  skuId: number;
  price: number;
};

export type BatchPricePlanRow = {
  key: string;
  productName: string;
  detail: string;
  updates: BatchPriceUpdate[];
};

function money(value: number) {
  return `¥${value.toFixed(2)}`;
}

function samePrice(current: unknown, next: number) {
  const value = Number(current);
  return Number.isFinite(value) && Math.abs(value - next) < 0.005;
}

function activeSkus(product: Product) {
  return (product.skus ?? []).filter(
    (sku) => sku.isActive !== false && Number.isInteger(Number(sku.id)),
  );
}

export function planBatchPrices(input: {
  products: Product[];
  price: number;
  mode: BatchPriceMode;
  canChangePublished: boolean;
}): BatchPricePlanRow[] {
  const nextPrice = Math.round(input.price * 100) / 100;
  return input.products.map((product) => {
    const base = {
      key: String(product.id),
      productName: product.name,
      updates: [] as BatchPriceUpdate[],
    };
    if (product.reviewStatus === "IN_REVIEW") {
      return { ...base, detail: "审核中的作品先完成审核，再改成交价" };
    }
    if (product.status === "ARCHIVED") {
      return { ...base, detail: "已在回收站，不改成交价" };
    }
    if (!input.canChangePublished && product.status !== "DRAFT") {
      return { ...base, detail: "已上架或已下架的作品需由管理员改成交价" };
    }
    if (product.salesMode !== "DIRECT_PURCHASE") {
      const label = product.salesMode
        ? salesModeLabels[product.salesMode] ?? "当前销售方式"
        : "当前销售方式";
      return { ...base, detail: `${label}不在这里改成交价` };
    }
    const skus = activeSkus(product);
    if (skus.length === 0) {
      return { ...base, detail: "没有有效规格，无法设置成交价" };
    }
    const targets = input.mode === "fill-empty"
      ? skus.filter((sku) => !(Number(sku.price) > 0))
      : skus;
    const updates = targets
      .filter((sku) => !samePrice(sku.price, nextPrice))
      .map((sku) => ({
        productId: product.id,
        skuId: sku.id,
        price: nextPrice,
      }));
    if (input.mode === "fill-empty" && targets.length === 0) {
      return { ...base, detail: `已标价的 ${skus.length} 个规格保持不变` };
    }
    if (updates.length === 0) {
      return { ...base, detail: "成交价已经是这个数" };
    }
    const kept = skus.length - updates.length;
    const detail = input.mode === "fill-empty"
      ? `${updates.length} 个未标价规格将改为 ${money(nextPrice)}${kept > 0 ? `，${kept} 个已标价规格保持不变` : ""}`
      : `${updates.length} 个规格将改为 ${money(nextPrice)}${kept > 0 ? `，${kept} 个规格已经是这个价格` : ""}`;
    return { ...base, detail, updates };
  });
}
