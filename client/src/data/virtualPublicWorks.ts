import type { CatalogProduct } from "@/data/catalogData";
import type { Product } from "@/types";
import { productPlaceholder } from "@/utils/placeholder";

/**
 * 正式作品尚未上架时，用来先看选款版式的演示款。
 * 不是在售作品，不代表库存、价格、证书或工艺承诺。
 */
export const VIRTUAL_PUBLIC_WORK_NOTICE =
  "以下为演示款式，只用于查看选款版式。它们不是在售作品，也不代表库存、价格或证书。";

type VirtualWork = {
  id: number;
  code: string;
  name: string;
  categoryName: string;
  material: CatalogProduct["material"];
  materialType: Product["materialType"];
  craft: string;
};

const VIRTUAL_WORKS: VirtualWork[] = [
  { id: 910001, code: "HC-DEMO-001", name: "素面平安扣", categoryName: "吊坠", material: "足金999", materialType: "GOLD_999", craft: "抛光" },
  { id: 910002, code: "HC-DEMO-002", name: "光圈戒指", categoryName: "戒指", material: "足金999", materialType: "GOLD_999", craft: "抛光" },
  { id: 910003, code: "HC-DEMO-003", name: "素圈手镯", categoryName: "手镯", material: "足金9999", materialType: "GOLD_9999", craft: "古法金" },
  { id: 910004, code: "HC-DEMO-004", name: "细链耳坠", categoryName: "耳饰", material: "18K金", materialType: "AU750", craft: "抛光" },
  { id: 910005, code: "HC-DEMO-005", name: "葫芦吊坠", categoryName: "吊坠", material: "足金999", materialType: "GOLD_999", craft: "3D硬金" },
  { id: 910006, code: "HC-DEMO-006", name: "珍珠耳钉", categoryName: "耳饰", material: "珍珠", materialType: "PEARL", craft: "镶嵌" },
];

export const VIRTUAL_CATALOG_PRODUCTS: CatalogProduct[] = VIRTUAL_WORKS.map((work) => ({
  id: work.id,
  code: work.code,
  sku: work.code,
  name: work.name,
  shortDescription: "演示款式",
  primaryCategoryId: "",
  secondaryCategoryId: "",
  material: work.material,
  craft: work.craft,
  weight: "",
  size: "",
  series: "",
  scene: "DISPLAY_ONLY",
  images: [productPlaceholder(work.id, work.name)],
  categoryName: work.categoryName,
  salesMode: "DISPLAY_ONLY",
  isAvailableForPurchase: false,
}));

export type VirtualCatalogCriteria = {
  keyword: string;
  categoryNames: string[];
  categorySelected: boolean;
  materials: string[];
  crafts: string[];
  weights: string[];
  sizes: string[];
  sort: "recommended" | "newest" | "sku";
  page: number;
  pageSize: number;
};

/** 正式目录为空时，在浏览器里筛选和分页演示款，不再把筛选请求当成“没有作品”。 */
export function selectVirtualCatalog(criteria: VirtualCatalogCriteria): {
  matches: CatalogProduct[];
  pageItems: CatalogProduct[];
  total: number;
} {
  const keyword = criteria.keyword.trim().toLowerCase();
  const matches = VIRTUAL_CATALOG_PRODUCTS.filter((product) => {
    if (criteria.categorySelected && !criteria.categoryNames.includes(product.categoryName?.trim() || "")) {
      return false;
    }
    if (criteria.materials.length > 0 && !criteria.materials.includes(product.material)) return false;
    if (criteria.crafts.length > 0 && !criteria.crafts.includes(product.craft)) return false;
    if (criteria.weights.length > 0 && !criteria.weights.includes(product.weight)) return false;
    if (criteria.sizes.length > 0 && !criteria.sizes.includes(product.size)) return false;
    if (!keyword) return true;
    return [product.name, product.code, product.sku, product.categoryName, product.material, product.craft]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(keyword);
  });
  const ordered = criteria.sort === "sku"
    ? [...matches].sort((left, right) => (left.code ?? "").localeCompare(right.code ?? "", "zh-CN"))
    : criteria.sort === "newest"
      ? [...matches].sort((left, right) => right.id - left.id)
      : matches;
  const pageSize = Math.max(1, criteria.pageSize);
  const start = (Math.max(1, criteria.page) - 1) * pageSize;
  return {
    matches: ordered,
    pageItems: ordered.slice(start, start + pageSize),
    total: ordered.length,
  };
}

export function findVirtualPublicProduct(reference: string | undefined): Product | null {
  const key = reference?.trim();
  if (!key) return null;
  const work = VIRTUAL_WORKS.find((item) => item.code === key || String(item.id) === key);
  if (!work) return null;
  const image = {
    id: work.id,
    productId: work.id,
    url: productPlaceholder(work.id, work.name),
    mediaUrl: productPlaceholder(work.id, work.name),
    type: "FRONT" as const,
    sortOrder: 1,
    isVideo: false,
  };
  return {
    id: work.id,
    code: work.code,
    name: work.name,
    description: "这是一枚演示款式，用来查看作品页的图文位置。材质、工艺与是否可做，以顾问实际沟通为准。",
    shortDescription: "演示款式",
    categoryId: 0,
    category: {
      id: 0,
      name: work.categoryName,
      slug: "virtual",
      level: 1,
      sortOrder: 0,
    },
    materialType: work.materialType,
    craftTechnique: [work.craft],
    status: "PUBLISHED",
    salesMode: "DISPLAY_ONLY",
    isAvailableForPurchase: false,
    isHot: false,
    isNew: false,
    isRecommended: false,
    isLimited: false,
    isCustom: false,
    viewCount: 0,
    salesCount: 0,
    images: [image],
    primaryImage: image,
    listingImage: image,
    skus: [],
    createdAt: "2026-10-19",
  };
}
