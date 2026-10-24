import { findVirtualPublicProduct } from "@/data/virtualPublicWorks";
import { productApi } from "@/services/clients/productClient";
import { requestStatus } from "@/services/httpClient";
import type { Product } from "@/types";
import { unwrapResponse } from "@/utils/unwrap";

export type PublicWorkResolution =
  | { kind: "published"; product: Product }
  | { kind: "virtual"; product: Product }
  | { kind: "missing" }
  | { kind: "error" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** 接口已经给出作品身份时，不再用演示款替换，即使货号碰巧相同。 */
function readPublishedProduct(value: unknown): Product | null {
  if (!isRecord(value)) return null;
  const id = value.id;
  if (!Number.isInteger(id) || (id as number) <= 0) return null;
  return value as unknown as Product;
}

function readCatalogTotal(value: unknown): number | null {
  if (!isRecord(value)) return null;
  if (typeof value.total === "number" && Number.isFinite(value.total)) return value.total;
  return Array.isArray(value.list) ? value.list.length : null;
}

/**
 * 先读公开作品。只有接口没有这件作品、且当前可见目录总数为 0 时，才回退到演示款。
 * 目录计数失败时不展示演示款，避免把正式目录的故障伪装成演示内容。
 */
export async function lookupPublicWork(reference: string): Promise<PublicWorkResolution> {
  try {
    const response = await productApi.getPublicById(reference, { suppressGlobalError: true });
    const published = readPublishedProduct(unwrapResponse<unknown>(response));
    if (published) return { kind: "published", product: published };
  } catch (error) {
    if (requestStatus(error) !== 404) return { kind: "error" };
  }

  const virtual = findVirtualPublicProduct(reference);
  if (!virtual) return { kind: "missing" };

  try {
    const response = await productApi.getPublicList({
      page: 1,
      pageSize: 1,
      sortBy: "sortOrder",
    });
    const total = readCatalogTotal(unwrapResponse<unknown>(response));
    if (total === 0) return { kind: "virtual", product: virtual };
    return { kind: "missing" };
  } catch {
    return { kind: "error" };
  }
}
