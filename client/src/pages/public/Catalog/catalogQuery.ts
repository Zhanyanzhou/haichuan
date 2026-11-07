import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { ProductQuery } from "@/hooks/useProductData";
import { materialLabels } from "@/utils/material";

// 兼容紧凑款号及既有横杠编码，材质代码仍作为关键词。
const SKU_RE = /^(?:[A-Z]{2,8}\d{2,12}(?:-[A-Z0-9]{1,12})?|[A-Z]{2,8}-[A-Z]{2,8}-\d{3,12}(?:-[A-Z0-9]{1,12})?)$/i;
const MATERIAL_SEARCH_TERMS = new Set(
  [...Object.keys(materialLabels), ...Object.values(materialLabels)].map((value) => value.toUpperCase()),
);

export function getCatalogSearchQuery(value: string) {
  const keyword = value.normalize("NFKC").trim().slice(0, 100);
  const exactCode = SKU_RE.test(keyword) && !MATERIAL_SEARCH_TERMS.has(keyword.toUpperCase())
    ? keyword
    : undefined;
  return { keyword: keyword || undefined, exactCode };
}

export interface URLParams {
  category: string;
  subcategory: string;
  query: string;
  materials: string[];
  crafts: string[];
  weights: string[];
  sizes: string[];
  minPrice: string;
  maxPrice: string;
  sort: string;
  page: number;
}

export type URLParamKey =
  | "category"
  | "subcategory"
  | "query"
  | "material"
  | "craft"
  | "weight"
  | "size"
  | "minPrice"
  | "maxPrice"
  | "sort"
  | "page";

type URLParamValue = string | string[];
type UpdateOptions = { replace?: boolean };

const SORT_VALUES = new Set(["recommended", "newest", "sku", "price_asc", "price_desc"]);

function priceValue(value: string | null): string {
  const trimmed = value?.trim() || "";
  return /^\d+(?:\.\d{1,2})?$/.test(trimmed)
    && Number(trimmed) <= Number.MAX_SAFE_INTEGER / 100 ? String(Number(trimmed)) : "";
}

function csvValues(value: string | null): string[] {
  return Array.from(
    new Set(
      (value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function createURLParams(search: string): URLParams {
  const query = new URLSearchParams(search);
  const rawPage = Number.parseInt(query.get("page") || "1", 10);
  const rawSort = query.get("sort") || "recommended";
  const minPrice = priceValue(query.get("minPrice"));
  const maxPrice = priceValue(query.get("maxPrice"));
  const reversedPriceRange = minPrice !== "" && maxPrice !== "" && Number(minPrice) > Number(maxPrice);
  return {
    category: query.get("category")?.trim() || "",
    subcategory: query.get("subcategory")?.trim() || "",
    query: query.get("query")?.trim() || "",
    materials: csvValues(query.get("material")),
    crafts: csvValues(query.get("craft")),
    weights: csvValues(query.get("weight")),
    sizes: csvValues(query.get("size")),
    minPrice: reversedPriceRange ? "" : minPrice,
    maxPrice: reversedPriceRange ? "" : maxPrice,
    sort: SORT_VALUES.has(rawSort) ? rawSort : "recommended",
    page: Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1,
  };
}

function writeURLParams(currentSearch: string, next: URLParams): string {
  const query = new URLSearchParams(currentSearch);
  const set = (key: string, value: string) => {
    if (value) query.set(key, value);
    else query.delete(key);
  };
  set("category", next.category);
  set("subcategory", next.subcategory);
  set("query", next.query);
  set("material", next.materials.join(","));
  set("craft", next.crafts.join(","));
  set("weight", next.weights.join(","));
  set("size", next.sizes.join(","));
  set("minPrice", next.minPrice);
  set("maxPrice", next.maxPrice);
  set("sort", next.sort !== "recommended" ? next.sort : "");
  set("page", next.page > 1 ? String(next.page) : "");
  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

function applyUpdates(
  previous: URLParams,
  changes: Partial<Record<URLParamKey, URLParamValue>>,
): URLParams {
  const next = { ...previous };
  let resetPage = false;
  for (const [key, value] of Object.entries(changes) as Array<
    [URLParamKey, URLParamValue]
  >) {
    if (key === "category") {
      next.category = String(value);
      next.subcategory = "";
      next.sizes = [];
      resetPage = true;
    } else if (key === "subcategory") {
      next.subcategory = String(value);
      next.sizes = [];
      resetPage = true;
    } else if (key === "page") {
      const page = Number(value);
      next.page = Number.isInteger(page) && page > 0 ? page : 1;
    } else if (key === "material") {
      next.materials = Array.isArray(value) ? value : [];
      resetPage = true;
    } else if (key === "craft") {
      next.crafts = Array.isArray(value) ? value : [];
      resetPage = true;
    } else if (key === "weight") {
      next.weights = Array.isArray(value) ? value : [];
      resetPage = true;
    } else if (key === "size") {
      next.sizes = Array.isArray(value) ? value : [];
      resetPage = true;
    } else {
      next[key] = String(value);
      resetPage = true;
    }
  }
  if (resetPage && !("page" in changes)) next.page = 1;
  return next;
}

export function useURLParams(syncHistory = true) {
  const location = useLocation();
  const navigate = useNavigate();
  const [previewParams, setPreviewParams] = useState<URLParams>(() =>
    createURLParams(""),
  );
  const params = useMemo(
    () => (syncHistory ? createURLParams(location.search) : previewParams),
    [location.search, previewParams, syncHistory],
  );

  useEffect(() => {
    if (!syncHistory) return;
    const canonicalSearch = writeURLParams(location.search, params);
    if (canonicalSearch === location.search) return;
    navigate(
      {
        pathname: location.pathname,
        search: canonicalSearch,
        hash: location.hash,
      },
      { replace: true, state: location.state },
    );
  }, [location.hash, location.pathname, location.search, location.state, navigate, params, syncHistory]);

  const updateMany = useCallback(
    (
      changes: Partial<Record<URLParamKey, URLParamValue>>,
      options: UpdateOptions = {},
    ) => {
      const next = applyUpdates(params, changes);
      if (!syncHistory) {
        setPreviewParams(next);
        return;
      }
      navigate(
        {
          pathname: location.pathname,
          search: writeURLParams(location.search, next),
          hash: location.hash,
        },
        { replace: options.replace === true, state: location.state },
      );
    },
    [location.hash, location.pathname, location.search, location.state, navigate, params, syncHistory],
  );

  const update = useCallback(
    (key: URLParamKey, value: URLParamValue, options?: UpdateOptions) =>
      updateMany({ [key]: value }, options),
    [updateMany],
  );

  return { params, update, updateMany };
}

export function serializeWeightRanges(ranges: string[]): string | undefined {
  const serialized = ranges
    .map((range) => range.match(/\d+(?:\.\d+)?/g)?.map(Number) || [])
    .filter((bounds) => bounds.length > 0)
    .map((bounds) => `${bounds[0]}:${bounds[1] ?? ""}`);
  return serialized.length > 0 ? serialized.join(",") : undefined;
}

export function catalogSort(sort: string, hasKeyword = false): NonNullable<ProductQuery["sortBy"]> {
  if (sort === "newest") return "published_desc";
  if (sort === "price_asc" || sort === "price_desc") return sort;
  if (sort === "sku") return "code_asc";
  return hasKeyword ? "relevance" : "sortOrder";
}
