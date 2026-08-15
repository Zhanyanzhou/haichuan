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

  return {
    id: p.id,
    sku: p.code || "",
    name: p.name || "",
    shortDescription: p.shortDescription || "",
    primaryCategoryId: String(primaryCategory?.id || p.categoryId || ""),
    secondaryCategoryId: String(secondaryCategory?.id || p.categoryId || ""),
    material: getMaterialLabel(p.materialType),
    craft: Array.isArray(p.craftTechnique)
      ? p.craftTechnique.join("、")
      : p.craftTechnique || "",
    weight: p.goldWeight ? `${p.goldWeight}g` : p.weight ? `${p.weight}g` : "",
    size: p.size || "",
    series: "",
    scene: p.salesMode || "",
    images: (p.images || []).map((img: any) => img.mediaUrl || img.url || ""),
    categoryName: categoryById.get(p.categoryId)?.name || "",
    price: Number(p.price) || 0,
  };
}

/**
 * 统一产品数据 Hook
 * — 调用真实 API 获取产品和分类
 * — 返回 loading / error / products / categories
 *
 * 两种模式：
 * — 无参（全量兼容）：拉取 pageSize 上限全量列表，供选款中心/搜索页本地筛选；
 * — 传入 query（服务端查询）：keyword/ids/materialType/价格区间/排序/分页透传服务端，
 *   返回 total 供分页判断。商品量上千后应逐步将页面迁移到本模式。
 */
export interface ProductQuery {
  /** 关键词（服务端按名称/编码 contains 匹配） */
  keyword?: string;
  /** 精确 ID 集合，逗号分隔（分类树展开后代时使用） */
  ids?: string;
  /** 材质（服务端白名单校验，非法值静默忽略） */
  materialType?: string;
  /** 销售模式 */
  salesMode?: string;
  /** 价格区间（元，含边界） */
  minPrice?: number;
  maxPrice?: number;
  /** 排序：运营序 / 价格升降；缺省为最近更新 */
  sortBy?: "sortOrder" | "price_asc" | "price_desc";
  page?: number;
  pageSize?: number;
}

export function useProductData(query?: ProductQuery | null) {
  const [apiProducts, setApiProducts] = useState<CatalogProduct[] | null>(null);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<RealCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  // query 引用不稳定会导致无限重拉，按值序列化作为 effect 依赖
  const queryKey =
    query === null ? "__paused__" : query === undefined ? "" : JSON.stringify(query);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // null = 显式暂停（如等待分类树就绪后再发起带分类筛选的查询）
      if (query === null) {
        // 清空上一查询的结果，避免暂停态读到陈旧数据
        setApiProducts(null);
        setTotal(0);
        setLoading(false);
        setError(false);
        return;
      }
      setLoading(true);
      setError(false);
      try {
        // query 模式：过滤 undefined 后透传服务端；全量模式：拉 pageSize 上限
        const params: Record<string, unknown> = query
          ? Object.fromEntries(
              Object.entries({
                page: query.page ?? 1,
                pageSize: query.pageSize ?? 24,
                keyword: query.keyword?.trim() || undefined,
                ids: query.ids || undefined,
                materialType: query.materialType || undefined,
                salesMode: query.salesMode || undefined,
                minPrice: query.minPrice,
                maxPrice: query.maxPrice,
                sortBy: query.sortBy,
              }).filter(([, v]) => v !== undefined),
            )
          : { pageSize: 2000 };
        // 分类树与商品并行拉取：映射 primaryCategoryId/categoryName 需要
        const [prodRes, catRes] = await Promise.all([
          productApi.getPublicList(params),
          categoryApi.getTree(),
        ]);
        const data = unwrapResponse<any>(prodRes);
        const list: any[] = data?.list || data || [];

        // 构建分类映射: categoryId → name
        const categoryById = new Map<number, RealCategory>();
        const cats = unwrapResponse<any[]>(catRes) || [];
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
          setCategories(Array.isArray(cats) ? cats : []);
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
  }, [revision, queryKey]);

  // P1-35：带自动重连 + debounce 的 SSE（断线重连；消息风暴合并为一次重拉）
  useReconnectingEventSource(
    USE_MOCK ? null : publicProductStreamUrl,
    () => setRevision((value) => value + 1),
    { debounceMs: 500 },
  );

  const products = useMemo(() => {
    if (loading) return [];
    if (error) return [];
    if (!apiProducts) return [];
    return apiProducts;
  }, [apiProducts, loading, error]);

  const reload = () => setRevision((v) => v + 1);

  return { products, total, loading, error, categories, reload, revision };
}

/** 将分类 ID 展开为"自身 + 全部后代"的逗号分隔串（服务端 ids 精确匹配用） */
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
