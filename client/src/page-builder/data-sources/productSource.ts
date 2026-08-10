/**
 * productSource.ts — Puck ExternalField 商品数据源
 * 封装 productApi 为标准 ExternalField 接口
 * 确保 Puck 只保存 productId 引用，不保存完整商品对象
 */

import { productApi } from "@/services/api";
import type { Product } from "@/types";
import { getListingImage } from "@/utils/productImage";
import { unwrapResponse } from "@/utils/unwrap";

/** 商品搜索项（ExternalField 的选项行） */
export interface ProductRow {
  id: number;
  code: string;
  name: string;
  price: number;
  priceLabel: string;
  image: string;
  category: string;
}

function formatPrice(value: unknown) {
  const price = Number(value || 0);
  return price > 0 ? `¥${price.toLocaleString("zh-CN")}` : "询价";
}

function toProductRow(product: Product): ProductRow {
  return {
    id: product.id,
    code: product.code || "",
    name: product.name || "",
    price: Number(product.price) || 0,
    priceLabel: formatPrice(product.price),
    image: getListingImage(product),
    category: product.category?.name || "",
  };
}

function normalizeProductList(data: any): Product[] {
  return data?.list || data?.items || data || [];
}

/** Puck ExternalField 兼容的 fetchList 函数 */
export async function fetchProductList({
  query,
  ids,
}: {
  query: string;
  ids?: number[] | string;
}): Promise<ProductRow[]> {
  const normalizedIds = Array.isArray(ids) ? ids.join(",") : ids;
  const res = await productApi.getList({
    keyword: query,
    ids: normalizedIds,
    pageSize: normalizedIds ? String(normalizedIds).split(",").length : 20,
  });
  const data = unwrapResponse<any>(res);
  const list = normalizeProductList(data).map(toProductRow);
  if (!normalizedIds) return list;

  const order = String(normalizedIds)
    .split(",")
    .map((id) => Number(id.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);
  const byId = new Map(list.map((product) => [product.id, product]));
  return order
    .map((id) => byId.get(id))
    .filter((product): product is ProductRow => Boolean(product));
}

export async function fetchProductsByIds(ids: number[]): Promise<ProductRow[]> {
  if (ids.length === 0) return [];
  return fetchProductList({ query: "", ids });
}

/** mapRow：搜索结果列显示 */
export function mapProductRow(row: ProductRow) {
  return {
    商品: row.name,
    货号: row.code || "-",
    分类: row.category || "-",
    价格: row.priceLabel,
  };
}

/** mapProp：只保存 productId */
export function mapProductProp(row: ProductRow): number {
  return row.id;
}
