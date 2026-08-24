import { useState, useEffect, useMemo } from "react";
import {
  productApi,
  categoryApi,
  publicProductStreamUrl,
} from "@/services/api";
import { USE_MOCK } from "@/services/mockData";
import { unwrapResponse } from "@/utils/unwrap";
import { getMaterialLabel } from "@/utils/material";
import { type CatalogProduct } from "@/data/catalogData";
import { useReconnectingEventSource } from "./useReconnectingEventSource";

/** 真实分类节点 */
export interface RealCategory {
  id: number;
  name: string;
  slug: string;
  level: number;
  parentId: number | null;
  children?: RealCategory[];
}

/** 转换 API 产品 → CatalogProduct（使用真实 categoryId） */
function mapApiProduct(
  p: any,
  categoryById: Map<number, RealCategory>,
): CatalogProduct {
  const lineage: RealCategory[] = [];
  let current = categoryById.get(p.categoryId);
  while (current) {
    lineage.unshift(current);
    current = current.parentId ? categoryById.get(current.parentId) : undefined;
  }

  const primaryCategory = lineage[0];
  const secondaryCategory = lineage[1];
  const listingUrl =
    p.listingImage?.mediaUrl || p.listingImage?.url || "";
  const primaryUrl =
    p.primaryImage?.mediaUrl || p.primaryImage?.url || "";
  const orderedImages = [
    listingUrl,
    primaryUrl,
    ...(p.images || []).map((img: any) => img.mediaUrl || img.url || ""),
  ].filter(Boolean);

  return {
    id: p.id,
    sku: p.code || "",
    name: p.name || "",
    shortDescription: p.shortDescription || "",
    primaryCategoryId: String(primaryCategory?.id || p.categoryId || ""),
    secondaryCategoryId: String(secondaryCategory?.id || p.categoryId || ""),
    material: getMaterialLabel(p.materialType),
    craft: Array.isArray(p.craftTechnique)
      ? p.craftTechnique.filter((item: unknown) => typeof item === "string").join("、")
      : typeof p.craftTechnique === "string"
        ? p.craftTechnique
        : "",
    weight: p.goldWeight ? `${p.goldWeight}g` : p.weight ? `${p.weight}g` : "",
    size: p.size || "",
    series: "",
    scene: p.salesMode || "",
    // 目录卡片和快速预览都以运营指定的列表图为首图；其后保留主图与排序图片并去重。
    images: [...new Set<string>(orderedImages)],
    categoryName: categoryById.get(p.categoryId)?.name || p.category?.name || "",
    price: Number(p.price) || 0,
    salesMode: p.salesMode,
    inventoryPolicy: p.inventoryPolicy,
    isAvailableForPurchase:
      typeof p.isAvailableForPurchase === "boolean"
        ? p.isAvailableForPurchase
        : undefined,
  };
}

/**
 * 统一产品数据 Hook
 * — 调用真实 API 获取产品和分类
 * — 返回 loading / error / products / categories
 *
 * 只接受显式服务端查询；null 用于等待分类树等前置条件。
 * 禁止恢复无参全量模式，公开列表必须通过筛选与分页取数。
 */
export interface ProductQuery {
  /** 关键词（服务端按名称/编码 contains 匹配） */
  keyword?: string;
  /** 精确商品 ID 集合，逗号分隔。 */
  ids?: string;
  /** 分类 ID 集合；绝不能传入 ids（ids 是商品 ID）。 */
  categoryIds?: string;
  /** 精确货号；Catalog 的货号直达语义会忽略其他筛选。 */
  exactCode?: string;
  /** 材质（服务端白名单校验，非法值静默忽略） */
  materialType?: string;
  materialTypes?: string;
  /** 销售模式 */
  salesMode?: string;
  /** 价格区间（元，含边界） */
  minPrice?: number;
  maxPrice?: number;
  /** 属性值 ID 集合，逗号分隔（前台属性字典多选） */
  attributeValueIds?: string;
  craftTechniques?: string;
  sizes?: string;
  /** 半开重量区间 min:max，多段逗号分隔。 */
  weightRanges?: string;
  includeFacets?: "true";
  page?: number;
  pageSize?: number;
  sortBy?:
    | "sortOrder"
    | "price_asc"
    | "price_desc"
    | "updated_desc"
    | "code_asc";
}

interface ProductFacets {
  sizes: string[];
}

interface ProductDataOptions {
  /** 选款盘的定向补取复用主目录 SSE，不再建立第二条连接。 */
  subscribe?: boolean;
  /** 定向按商品 ID 补取无需再次请求分类树。 */
  loadCategories?: boolean;
  /** 复用外层目录的更新信号刷新定向选款，不再建立第二条 SSE。 */
  refreshKey?: string | number;
}

export function useProductCategories() {
  const [categories, setCategories] = useState<RealCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    void categoryApi
      .getTree()
      .then((response) => {
        const data = unwrapResponse<unknown>(response);
        if (!cancelled) {
          setCategories(Array.isArray(data) ? (data as RealCategory[]) : []);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [revision]);

  return {
    categories,
    loading,
    error,
    reload: () => setRevision((value) => value + 1),
  };
}

export function useProductData(
  query: ProductQuery | null,
  options: ProductDataOptions = {},
) {
  const [apiProducts, setApiProducts] = useState<CatalogProduct[] | null>(null);
  const [total, setTotal] = useState(0);
  const [facets, setFacets] = useState<ProductFacets>({ sizes: [] });
  const [categories, setCategories] = useState<RealCategory[]>([]);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [dataQueryKey, setDataQueryKey] = useState("");
  const subscribe = options.subscribe !== false;
  const loadCategories = options.loadCategories !== false;
  const refreshKey = options.refreshKey;
  // query 引用不稳定会导致无限重拉，按值序列化作为 effect 依赖
  const queryKey = query === null ? "__paused__" : JSON.stringify(query);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // null = 暂停商品请求；主目录仍可先取分类树，供 URL 分类展开后代。
      if (query === null) {
        setApiProducts(null);
        setTotal(0);
        setFacets({ sizes: [] });
        setError(false);
        setDataQueryKey("");
        if (!loadCategories) {
          setLoading(false);
          return;
        }
        setLoading(true);
        try {
          const catRes = await categoryApi.getTree();
          const cats = unwrapResponse<unknown>(catRes);
          if (!cancelled) {
            setCategories(Array.isArray(cats) ? (cats as RealCategory[]) : []);
            setCategoriesLoaded(true);
          }
        } catch {
          if (!cancelled) setError(true);
        } finally {
          if (!cancelled) setLoading(false);
        }
        return;
      }
      setLoading(true);
      setError(false);
      try {
        const params: Record<string, unknown> = Object.fromEntries(
          Object.entries({
            page: query.page ?? 1,
            pageSize: query.pageSize ?? 24,
            keyword: query.keyword?.trim() || undefined,
            exactCode: query.exactCode?.trim() || undefined,
            ids: query.ids || undefined,
            categoryIds: query.categoryIds || undefined,
            materialType: query.materialType || undefined,
            materialTypes: query.materialTypes || undefined,
            salesMode: query.salesMode || undefined,
            minPrice: query.minPrice,
            maxPrice: query.maxPrice,
            sortBy: query.sortBy,
            attributeValueIds: query.attributeValueIds || undefined,
            craftTechniques: query.craftTechniques || undefined,
            sizes: query.sizes || undefined,
            weightRanges: query.weightRanges || undefined,
            includeFacets: query.includeFacets,
          }).filter(([, value]) => value !== undefined),
        );
        const [prodRes, catRes] = await Promise.all([
          productApi.getPublicList(params),
          loadCategories ? categoryApi.getTree() : Promise.resolve(null),
        ]);
        const data = unwrapResponse<any>(prodRes);
        const list: any[] = data?.list || data || [];

        // 构建分类映射: categoryId → name
        const categoryById = new Map<number, RealCategory>();
        const catData = catRes ? unwrapResponse<unknown>(catRes) : [];
        const cats = Array.isArray(catData) ? (catData as RealCategory[]) : [];
        const walkCats = (nodes: any[]) => {
          for (const n of nodes) {
            if (n.id) categoryById.set(n.id, n);
            if (n.children) walkCats(n.children);
          }
        };
        walkCats(Array.isArray(cats) ? cats : []);

        const mapped = list.map((p: any) => mapApiProduct(p, categoryById));
        if (!cancelled) {
          setApiProducts(mapped);
          setTotal(typeof data?.total === "number" ? data.total : mapped.length);
          setFacets({
            sizes: Array.isArray(data?.facets?.sizes)
              ? data.facets.sizes.filter((size: unknown) => typeof size === "string")
              : [],
          });
          if (loadCategories) {
            setCategories(cats);
            setCategoriesLoaded(true);
          }
          setDataQueryKey(queryKey);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, queryKey, loadCategories, refreshKey]);

  // P1-35：带自动重连 + debounce 的 SSE（断线重连；消息风暴合并为一次重拉）
  useReconnectingEventSource(
    USE_MOCK || !subscribe ? null : publicProductStreamUrl,
    () => setRevision((value) => value + 1),
    { debounceMs: 500 },
  );

  const products = useMemo(() => {
    if (!apiProducts) return [];
    return apiProducts;
  }, [apiProducts]);

  const reload = () => setRevision((v) => v + 1);

  return {
    products,
    total,
    facets,
    loading,
    error,
    categories,
    categoriesLoaded,
    reload,
    revision,
    queryKey,
    dataQueryKey,
  };
}

/** 将分类 ID 展开为“自身 + 全部后代”的 categoryIds 参数。 */
export function expandCategoryIds(
  categories: RealCategory[],
  targetId: number | null,
): string {
  if (!targetId) return "";
  const ids: number[] = [];
  const collect = (nodes: RealCategory[]) => {
    for (const n of nodes) {
      if (n.id === targetId) {
        const walk = (node: RealCategory) => {
          ids.push(node.id);
          node.children?.forEach(walk);
        };
        walk(n);
        return true;
      }
      if (n.children && collect(n.children)) return true;
    }
    return false;
  };
  collect(categories);
  return ids.join(",");
}
