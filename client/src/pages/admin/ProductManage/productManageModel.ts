import type { Product, ProductStatus } from "@/types";

export type ProductListItem = Product & {
  totalStock?: number;
  publishedAt?: string | null;
  completeness?: {
    score: number;
    isComplete: boolean;
    missingFields: string[];
  };
};

export const statusMeta: Record<
  ProductStatus,
  { label: string; color: string }
> = {
  DRAFT: { label: "草稿", color: "default" },
  PUBLISHED: { label: "已上架", color: "green" },
  OFFLINE: { label: "仓库中", color: "gold" },
  ARCHIVED: { label: "回收站", color: "default" },
};

export const statuses: ProductStatus[] = [
  "PUBLISHED",
  "OFFLINE",
  "DRAFT",
  "ARCHIVED",
];

export const salesModeLabels: Record<string, string> = {
  DISPLAY_ONLY: "仅展示",
  SELECTION: "选款咨询",
  APPOINTMENT: "预约到店",
  DIRECT_PURCHASE: "直接购买",
  CUSTOM_INQUIRY: "定制咨询",
};

export const completenessFieldLabels: Record<string, string> = {
  name: "商品标题",
  code: "货号",
  categoryId: "类目",
  primaryImage: "商品主图",
  salesMode: "销售方式",
  materialType: "主要材质",
  visibility: "可见范围",
  detailContent: "商品详情",
  derivedPrice: "SKU 派生最低价",
  activeSku: "有效且有价的 SKU",
  inventoryRecord: "SKU 库存记录",
  deliveryMethods: "提取方式",
  singleUnit: "一物一件 SKU 与库存约束",
};

export function formatProductDate(value?: string) {
  if (!value) return "—";
  return new Date(value)
    .toLocaleString("zh-CN", { hour12: false })
    .replace(/\//g, "-");
}
