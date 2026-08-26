export interface Category {
  id: number;
  name: string;
  slug: string;
  level: number;
  parentId?: number;
  icon?: string;
  coverImage?: string;
  sortOrder: number;
  isActive?: boolean;
  _count?: { children: number; products: number };
  children?: Category[];
}

/** 新增/编辑分类时的输入字段。 */
export interface CategoryInput {
  name?: string;
  slug?: string;
  parentId?: number | null;
  sortOrder?: number;
  isActive?: boolean;
  icon?: string;
  coverImage?: string;
  level?: number;
}

/** 批量排序的单条项（仅同级 sortOrder 调整）。 */
export interface CategorySortItem {
  id: number;
  sortOrder: number;
}

export interface Product {
  id: number;
  code: string;
  name: string;
  description?: string;
  shortDescription?: string;
  categoryId: number;
  category?: Category;
  materialType: MaterialType;
  goldWeight?: number;
  craftFee?: number;
  price?: number;
  /** @deprecated 价格区间已废弃,展示价统一用 price(=活跃 SKU 最低价) */
  priceMin?: number;
  priceMax?: number;
  weight?: number;
  size?: string;
  salesMode?: SalesMode;
  inventoryPolicy?: InventoryPolicy;
  /** 服务端按实时库存聚合得出的购买可用性，不暴露具体库存数量。 */
  isAvailableForPurchase?: boolean;
  sortOrder?: number;
  gemInfo?: GemInfo;
  craftTechnique?: string[];
  detailContent?: ProductDetailBlock[];
  status: ProductStatus;
  visibility?: "PUBLIC" | "MEMBER" | "PARTNER" | "INTERNAL";
  purchaseRegion?: "MAINLAND" | "CROSS_BORDER";
  publishMode?: "IMMEDIATE" | "SCHEDULED" | "WAREHOUSE";
  scheduledPublishAt?: string | null;
  scheduledPublishError?: string | null;
  fulfillmentType?: "IN_STOCK" | "PREORDER" | "CUSTOM";
  dispatchTime?:
    | "SAME_DAY"
    | "WITHIN_24_HOURS"
    | "WITHIN_48_HOURS"
    | "OVER_48_HOURS"
    | "CUSTOM";
  shippingTemplateId?: number | null;
  deliveryMethods?: string[];
  requiresInsuredShipping?: boolean;
  requiresSignature?: boolean;
  includesCertificate?: boolean;
  packageType?: string;
  customLeadTime?: string;
  isHot: boolean;
  isNew: boolean;
  isRecommended: boolean;
  isLimited: boolean;
  isCustom: boolean;
  multiDiscount?: boolean;
  viewCount: number;
  salesCount: number;
  images: ProductImage[];
  primaryImage?: ProductImage | null;
  listingImage?: ProductImage | null;
  primaryImageId?: number | null;
  listingImageId?: number | null;
  skus?: ProductSKU[];
  certificates?: Certificate[];
  tags?: ProductTag[];
  createdAt: string;
}

export type MaterialType =
  | "GOLD_999"
  | "GOLD_9999"
  | "AU750"
  | "PT950"
  | "S925"
  | "DIAMOND"
  | "JADE"
  | "PEARL"
  | "COLOR_GEM"
  | "OTHER";

export type ProductStatus = "DRAFT" | "PUBLISHED" | "OFFLINE" | "ARCHIVED";

export type SalesMode =
  | "DISPLAY_ONLY"
  | "SELECTION"
  | "APPOINTMENT"
  | "DIRECT_PURCHASE"
  | "CUSTOM_INQUIRY";

export type InventoryPolicy = "STANDARD" | "SINGLE_UNIT";

export interface GemInfo {
  type?: string;
  carat?: number;
  clarity?: string;
  color?: string;
  cut?: string;
  quantity?: number;
}

export interface ProductDetailBlock {
  type: "TEXT" | "IMAGE";
  text?: string;
  imageId?: number;
  alt?: string;
}

export interface ShippingTemplate {
  id: number;
  name: string;
  carrier?: string;
  feeMode: "FREE" | "FIXED" | "CONDITIONAL";
  baseFee: number;
  remoteSurcharge: number;
  freeShippingThreshold?: number | null;
  excludedRegions?: string[];
  insured: boolean;
  signatureRequired: boolean;
  isDefault: boolean;
  isActive: boolean;
}

export interface ProductImage {
  id: number;
  productId: number;
  url: string;
  storageKey?: string | null;
  type: "FRONT" | "SIDE" | "TOP" | "DETAIL" | "WEARING";
  sortOrder: number;
  isVideo: boolean;
  sourceImageId?: number | null;
  cropData?: { x: number; y: number; width: number; height: number } | null;
  width?: number | null;
  height?: number | null;
  mimeType?: string | null;
  fileSize?: number | null;
}

export interface ProductSKU {
  id: number;
  productId: number;
  skuCode: string;
  material: MaterialType;
  size?: string;
  goldWeight?: number;
  price: number;
  /** 仅旧 Mock 商品数据可能携带；真实库存以 Inventory 接口为准。 */
  stock?: number;
  safetyStock?: number;
  isActive: boolean;
}

export interface Certificate {
  id: number;
  productId: number;
  certType: "NATIONAL" | "PROVINCIAL" | "GIA" | "OTHER";
  certNumber: string;
  certImage?: string;
  expireDate?: string;
}

export interface ProductTag {
  id: number;
  productId: number;
  tagId?: number;
  tagName: string;
}

export interface ProductFilterParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  categoryId?: number;
  materialType?: string;
  status?: string;
  isHot?: string;
  isNew?: string;
  sortBy?: string;
  sortOrder?: string;
  priceMin?: number;
  priceMax?: number;
}
