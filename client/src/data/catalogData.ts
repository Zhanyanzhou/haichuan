/**
 * 选款中心 — 商品类型 + 筛选常量
 * （产品数据由 useProductData 从真实 API 获取，本文件不含产品数据；
 *   筛选选项的权威来源为后端 /attributes 属性字典，以下常量仅作兜底。）
 */
export interface CatalogProduct {
  id: number;
  sku: string;
  name: string;
  shortDescription?: string;
  primaryCategoryId: string;
  secondaryCategoryId: string;
  material: string;
  craft: string;
  weight: string;
  size: string;
  series: string;
  scene: string;
  images: string[];
  categoryName?: string;
  price?: number;
}

/* ═══════ 筛选选项（后端属性字典为空时的兜底） ═══════ */
export const MATERIALS = ['足金999', '足金9999', '18K金', '铂金950', '镶钻', '玉石', '珍珠'];
export const CRAFTS = ['古法金', '3D硬金', '花丝', '錾刻', '镂空', '镶嵌', '抛光', '拉丝', '喷砂'];
export const WEIGHT_RANGES = ['0—5克', '5—10克', '10—20克', '20—50克', '50克以上'];
