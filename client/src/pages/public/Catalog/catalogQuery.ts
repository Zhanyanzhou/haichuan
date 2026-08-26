import { useCallback, useState } from "react";
import type { ProductQuery } from "@/hooks/useProductData";
interface URLParams {
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

function createURLParams(readLocation: boolean): URLParams {
  const u = readLocation ? new URL(window.location.href) : null;
  const rawPage = Number.parseInt(u?.searchParams.get("page") || "1", 10);
  return {
    category: u?.searchParams.get("category") || "",
    subcategory: u?.searchParams.get("subcategory") || "",
    query: u?.searchParams.get("query") || "",
    materials:
      u?.searchParams.get("material")?.split(",").filter(Boolean) || [],
    crafts: u?.searchParams.get("craft")?.split(",").filter(Boolean) || [],
    weights: u?.searchParams.get("weight")?.split(",").filter(Boolean) || [],
    sizes: u?.searchParams.get("size")?.split(",").filter(Boolean) || [],
    sort: u?.searchParams.get("sort") || "recommended",
    page: Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1,
  };
}

export function useURLParams(syncHistory = true) {
  const [p, setP] = useState<URLParams>(() => {
    return createURLParams(syncHistory);
  });

  const syncURL = useCallback((next: URLParams) => {
    if (!syncHistory) return;
    const u = new URL(window.location.href);
    const s = (k: string, v: string) =>
      v ? u.searchParams.set(k, v) : u.searchParams.delete(k);
    s("category", next.category);
    s("subcategory", next.subcategory);
    s("query", next.query);
    s("material", next.materials.join(","));
    s("craft", next.crafts.join(","));
    s("weight", next.weights.join(","));
    s("size", next.sizes.join(","));
    s("sort", next.sort !== "recommended" ? next.sort : "");
    s("page", next.page > 1 ? String(next.page) : "");
    window.history.replaceState(null, "", u.toString());
  }, [syncHistory]);

  const update = useCallback(
    (key: string, val: string | string[]) => {
      setP((prev) => {
        const next = { ...prev } as Record<string, unknown>;
        const stateKey =
          ({
            material: "materials",
            craft: "crafts",
            weight: "weights",
            size: "sizes",
          } as Record<string, string>)[key] || key;
        if (key === "category") {
          next.category = val;
          next.subcategory = "";
          next.page = 1;
        } else if (key === "page") {
          next.page = Number(val);
        } else if (Array.isArray(val)) {
          next[stateKey] = val;
          next.page = 1;
        } else {
          next[stateKey] = val;
          next.page = 1;
        }
        syncURL(next as unknown as URLParams);
        return next as unknown as URLParams;
      });
    },
    [syncURL],
  );

  return { params: p, update };
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
