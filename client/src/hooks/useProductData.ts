import { useState, useEffect, useMemo } from 'react';
import { productApi } from '@/services/api';
import { unwrapResponse } from '@/utils/unwrap';
import { type CatalogProduct } from '@/data/catalogData';

/** API enum → 中文材质 */
const matLabel = (mt: string) => (
  { GOLD_999: '足金999', GOLD_9999: '足金9999', AU750: '18K金', PT950: '铂金950',
    S925: '银', DIAMOND: '镶钻', JADE: '玉石', PEARL: '珍珠', COLOR_GEM: '彩宝', OTHER: '其他' } as Record<string, string>
)[mt] || mt;

/** 转换 API 产品 → CatalogProduct */
function mapApiProduct(p: any): CatalogProduct {
  return {
    id: p.id,
    sku: p.code || '',
    name: p.name || '',
    primaryCategoryId: String(p.categoryId || ''),
    secondaryCategoryId: '',
    material: matLabel(p.materialType),
    craft: '',
    weight: p.goldWeight ? `${p.goldWeight}g` : '',
    size: p.size || '',
    series: '',
    scene: '',
    images: (p.images || []).map((img: any) => img.url || ''),
  };
}

/**
 * 统一产品数据 Hook
 * — 调用真实 API 获取产品
 * — 与静态 catalogData 合并去重（API 优先，按 sku 去重）
 * — 返回 loading / error / products
 */
export function useProductData() {
  const [apiProducts, setApiProducts] = useState<CatalogProduct[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(false);
      try {
        const res = await productApi.getList({});
        const data = unwrapResponse<any>(res);
        const list: any[] = data?.list || data || [];
        const mapped = list.map(mapApiProduct);
        if (!cancelled) setApiProducts(mapped);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /** API 数据优先，不再回退到静态数据 */
  const products = useMemo(() => {
    if (loading) return [];
    if (error) return [];
    if (!apiProducts) return [];
    return apiProducts;
  }, [apiProducts, loading, error]);

  return { products, loading, error };
}
