/**
 * productSource.ts — Puck ExternalField 商品数据源
 * 封装 productApi 为标准 ExternalField 接口
 * 确保新 Puck 文档只保存 Product.code，旧 productId 仅兼容读取；不保存完整商品对象。
 */

import {
  productApi,
  type ProductReferenceResult,
} from "@/services/api";
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
  status: string;
  visibility: string;
  eligible: boolean;
  reason: ProductReferenceResult["reason"];
  legacyId?: number;
}

import { formatPrice } from "@/utils/format";

const PAGE_CACHE_TTL = 15_000;
const REFERENCE_CACHE_TTL = 10_000;
const productPageCache = new Map<string, { at: number; value: { rows: ProductRow[]; total: number; page: number; pageSize: number } }>();
const productReferenceCache = new Map<string, { at: number; value: ProductReferenceResult }>();

function trimCache<T>(cache: Map<string, T>, max: number) {
  while (cache.size > max) cache.delete(cache.keys().next().value as string);
}

function toProductRow(product: Product): ProductRow {
  const listingImage = getListingImage(product);
  const hasListingImage = Boolean(
    listingImage && listingImage !== "/images/products/placeholder.svg",
  );
  return {
    id: product.id,
    code: product.code || "",
    name: product.name || "",
    price: Number(product.price) || 0,
    priceLabel: formatPrice(product.price, "询价"),
    image: listingImage,
    category: product.category?.name || "",
    status: product.status || "",
    visibility: product.visibility || "",
    eligible:
      product.status === "PUBLISHED" && product.visibility === "PUBLIC" && hasListingImage,
    reason:
      product.status !== "PUBLISHED"
        ? product.status === "OFFLINE"
          ? "OFFLINE"
          : product.status === "ARCHIVED"
            ? "ARCHIVED"
            : "DRAFT"
        : product.visibility !== "PUBLIC"
          ? "NON_PUBLIC"
          : hasListingImage
            ? "AVAILABLE"
            : "MISSING_IMAGE",
  };
}

function normalizeProductList(data: any): Product[] {
  return data?.list || data?.items || data || [];
}

/** Puck ExternalField 兼容的 fetchList 函数 */
export async function fetchProductList({
  query,
  ids,
  codes,
  page,
  pageSize,
  categoryId,
  status,
  visibility,
  signal,
}: {
  query: string;
  ids?: number[] | string;
  codes?: string[] | string;
  page?: number;
  pageSize?: number;
  categoryId?: number;
  status?: string;
  visibility?: string;
  signal?: AbortSignal;
}): Promise<ProductRow[]> {
  const normalizedIds = Array.isArray(ids) ? ids.join(",") : ids;
  const normalizedCodes = Array.isArray(codes) ? codes.join(",") : codes;
  const res = await productApi.getList({
    keyword: query,
    ids: normalizedIds,
    codes: normalizedCodes,
    page: page ?? 1,
    categoryId,
    status,
    visibility,
    pageSize: normalizedIds || normalizedCodes
      ? String(normalizedIds || normalizedCodes).split(",").length
      : (pageSize ?? 20),
  }, signal);
  const data = unwrapResponse<any>(res);
  const list = normalizeProductList(data).map(toProductRow);
  if (!normalizedIds && !normalizedCodes) return list;

  if (normalizedCodes) {
    const order = String(normalizedCodes)
      .split(",")
      .map((code) => code.trim())
      .filter(Boolean);
    const byCode = new Map(list.map((product) => [product.code, product]));
    return order
      .map((code) => byCode.get(code))
      .filter((product): product is ProductRow => Boolean(product));
  }

  const order = String(normalizedIds)
    .split(",")
    .map((id) => Number(id.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);
  const byId = new Map(list.map((product) => [product.id, product]));
  return order
    .map((id) => byId.get(id))
    .filter((product): product is ProductRow => Boolean(product));
}

export async function fetchProductPage(input: {
  query: string;
  page: number;
  pageSize: number;
  categoryId?: number;
  status?: string;
  visibility?: string;
  signal?: AbortSignal;
}): Promise<{ rows: ProductRow[]; total: number; page: number; pageSize: number }> {
  const cacheKey = JSON.stringify({
    query: input.query,
    page: input.page,
    pageSize: input.pageSize,
    categoryId: input.categoryId,
    status: input.status,
    visibility: input.visibility,
  });
  const cached = productPageCache.get(cacheKey);
  if (cached && Date.now() - cached.at < PAGE_CACHE_TTL) return cached.value;
  const response = await productApi.getList({
    keyword: input.query,
    page: input.page,
    pageSize: input.pageSize,
    categoryId: input.categoryId,
    status: input.status,
    visibility: input.visibility,
    sortBy: "updated_desc",
  }, input.signal);
  const data = unwrapResponse<any>(response);
  const value = {
    rows: normalizeProductList(data).map(toProductRow),
    total: Number(data?.total) || 0,
    page: Number(data?.page) || input.page,
    pageSize: Number(data?.pageSize) || input.pageSize,
  };
  productPageCache.set(cacheKey, { at: Date.now(), value });
  trimCache(productPageCache, 50);
  return value;
}

export async function fetchProductsByIds(ids: number[]): Promise<ProductRow[]> {
  if (ids.length === 0) return [];
  return fetchProductList({ query: "", ids });
}

function referenceToRow(reference: ProductReferenceResult): ProductRow {
  return {
    id: Number(reference.id || reference.legacyId || 0),
    legacyId: reference.legacyId,
    code: reference.code || "",
    name: reference.name || "引用的商品",
    price: Number(reference.price) || 0,
    priceLabel: reference.price == null ? "询价" : formatPrice(reference.price, "询价"),
    image: reference.thumbnail || "",
    category: reference.category?.name || "",
    status: reference.status || "",
    visibility: reference.visibility || "",
    eligible: reference.eligible,
    reason: reference.reason,
  };
}

export async function resolveProductReferences(
  input: { codes?: string[]; legacyIds?: number[] },
  signal?: AbortSignal,
): Promise<ProductRow[]> {
  if (!(input.codes?.length || input.legacyIds?.length)) return [];
  const references: Array<{ key: string; code?: string; legacyId?: number }> = [
    ...(input.codes ?? []).map((code) => ({ key: `code:${code}`, code })),
    ...(input.legacyIds ?? []).map((legacyId) => ({ key: `id:${legacyId}`, legacyId })),
  ];
  const resolved = new Map<string, ProductReferenceResult>();
  const missingCodes: string[] = [];
  const missingIds: number[] = [];
  for (const reference of references) {
    const cached = productReferenceCache.get(reference.key);
    if (cached && Date.now() - cached.at < REFERENCE_CACHE_TTL) {
      resolved.set(reference.key, cached.value);
    } else if (reference.code) missingCodes.push(reference.code);
    else if (reference.legacyId) missingIds.push(reference.legacyId);
  }
  if (missingCodes.length || missingIds.length) {
    const response = await productApi.resolveReferences(
      { codes: missingCodes.length ? missingCodes : undefined, legacyIds: missingIds.length ? missingIds : undefined },
      signal,
    );
    const data = unwrapResponse<ProductReferenceResult[]>(response);
    for (const item of Array.isArray(data) ? data : []) {
      const key = item.code && missingCodes.includes(item.code)
        ? `code:${item.code}`
        : `id:${item.legacyId}`;
      productReferenceCache.set(key, { at: Date.now(), value: item });
      resolved.set(key, item);
    }
    trimCache(productReferenceCache, 200);
  }
  return references
    .map((reference) => resolved.get(reference.key))
    .filter((item): item is ProductReferenceResult => Boolean(item))
    .map(referenceToRow);
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

/** 新编辑只保存稳定 Product.code；旧 numeric id 由兼容字段独立读取。 */
export function mapProductProp(row: ProductRow): string {
  return row.code;
}
