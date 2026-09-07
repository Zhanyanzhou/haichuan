import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { ProductQuery } from "@/hooks/useProductData";
export interface URLParams {
  category: string;
  subcategory: string;
  query: string;
  materials: string[];
  crafts: string[];
  weights: string[];
  sizes: string[];
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
  | "sort"
  | "page";

type URLParamValue = string | string[];
type UpdateOptions = { replace?: boolean };

const SORT_VALUES = new Set(["recommended", "newest", "sku"]);

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
  return {
    category: query.get("category")?.trim() || "",
    subcategory: query.get("subcategory")?.trim() || "",
    query: query.get("query")?.trim() || "",
    materials: csvValues(query.get("material")),
    crafts: csvValues(query.get("craft")),
    weights: csvValues(query.get("weight")),
    sizes: csvValues(query.get("size")),
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

export function catalogSort(sort: string): NonNullable<ProductQuery["sortBy"]> {
  if (sort === "newest") return "updated_desc";
  if (sort === "sku") return "code_asc";
  return "sortOrder";
}
