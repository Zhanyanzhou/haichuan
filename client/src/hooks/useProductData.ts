import { useState, useEffect, useMemo } from 'react';
import { productApi, categoryApi, publicProductStreamUrl } from '@/services/api';
import { USE_MOCK } from '@/services/mockData';
import { unwrapResponse } from '@/utils/unwrap';
import { type CatalogProduct } from '@/data/catalogData';

/** API enum → 中文材质 */
const matLabel = (mt: string) => (
  { GOLD_999: '足金999', GOLD_9999: '足金9999', AU750: '18K金', PT950: '铂金950',
    S925: '银', DIAMOND: '镶钻', JADE: '玉石', PEARL: '珍珠', COLOR_GEM: '彩宝', OTHER: '其他' } as Record<string, string>
)[mt] || mt;

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
function mapApiProduct(p: any, categoryById: Map<number, RealCategory>): CatalogProduct {
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
    sku: p.code || '',
    name: p.name || '',
    primaryCategoryId: String(primaryCategory?.id || p.categoryId || ''),
    secondaryCategoryId: String(secondaryCategory?.id || p.categoryId || ''),
    material: matLabel(p.materialType),
    craft: Array.isArray(p.craftTechnique) ? p.craftTechnique.join('、') : (p.craftTechnique || ''),
    weight: p.goldWeight ? `${p.goldWeight}g` : (p.weight ? `${p.weight}g` : ''),
    size: p.size || '',
    series: '',
    scene: p.salesMode || '',
    images: (p.images || []).map((img: any) => img.url || ''),
    categoryName: categoryById.get(p.categoryId)?.name || '',
    price: Number(p.price) || 0,
  };
}

/**
 * 统一产品数据 Hook
 * — 调用真实 API 获取产品和分类
 * — 返回 loading / error / products / categories
 */
export function useProductData() {
  const [apiProducts, setApiProducts] = useState<CatalogProduct[] | null>(null);
  const [categories, setCategories] = useState<RealCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(false);
      try {
        const [prodRes, catRes] = await Promise.all([
          productApi.getPublicList({ pageSize: 2000 }),
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
          setCategories(Array.isArray(cats) ? cats : []);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [revision]);

  useEffect(() => {
    if (USE_MOCK) return;
    const stream = new EventSource(publicProductStreamUrl);
    stream.onmessage = () => setRevision((value) => value + 1);
    return () => stream.close();
  }, []);

  const products = useMemo(() => {
    if (loading) return [];
    if (error) return [];
    if (!apiProducts) return [];
    return apiProducts;
  }, [apiProducts, loading, error]);

  return { products, loading, error, categories };
}
