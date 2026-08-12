// ===== User =====
export interface User {
  id: number;
  username: string;
  realName?: string;
  phone?: string;
  email?: string;
  avatar?: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'EDITOR' | 'CUSTOMER_SERVICE' | 'WAREHOUSE';
  status: 'ACTIVE' | 'DISABLED';
  lastLoginAt?: string;
  createdAt: string;
}

// ===== Auth =====
export interface LoginParams {
  username: string;
  password: string;
}

export interface LoginResult {
  accessToken: string;
  user: User;
}

// ===== Category =====
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

// ===== Product =====
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
  priceMin?: number;
  priceMax?: number;
  weight?: number;
  size?: string;
  salesMode?: 'DISPLAY_ONLY' | 'SELECTION' | 'APPOINTMENT' | 'DIRECT_PURCHASE' | 'CUSTOM_INQUIRY';
  sortOrder?: number;
  gemInfo?: GemInfo;
  craftTechnique?: string[];
  status: ProductStatus;
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

export type MaterialType = 'GOLD_999' | 'GOLD_9999' | 'AU750' | 'PT950' | 'S925' | 'DIAMOND' | 'JADE' | 'PEARL' | 'COLOR_GEM' | 'OTHER';
export type ProductStatus = 'DRAFT' | 'PUBLISHED' | 'OFFLINE' | 'ARCHIVED';

export interface GemInfo {
  type?: string;
  carat?: number;
  clarity?: string;
  color?: string;
  cut?: string;
  quantity?: number;
}

export interface ProductImage {
  id: number;
  productId: number;
  url: string;
  type: 'FRONT' | 'SIDE' | 'TOP' | 'DETAIL' | 'WEARING';
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
  stock: number;
  safetyStock: number;
  isActive: boolean;
}

export interface Certificate {
  id: number;
  productId: number;
  certType: 'NATIONAL' | 'PROVINCIAL' | 'GIA' | 'OTHER';
  certNumber: string;
  certImage?: string;
  expireDate?: string;
}

export interface ProductTag {
  id: number;
  productId: number;
  tagName: string;
}

// ===== Order =====
export interface Order {
  id: number;
  orderNo: string;
  customerName: string;
  customerPhone: string;
  address: string;
  totalAmount: number;
  discountAmount: number;
  finalAmount: number;
  status: OrderStatus;
  logisticsCompany?: string;
  logisticsNo?: string;
  items: OrderItem[];
  createdAt: string;
}

export type OrderStatus = 'PENDING_PAYMENT' | 'PENDING_SHIP' | 'SHIPPED' | 'COMPLETED' | 'CANCELLED';

export interface OrderItem {
  id: number;
  productId: number;
  skuId: number;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  product?: Product;
}

// ===== Cart =====
export interface CartItem {
  id: number;
  productId: number;
  skuId: number;
  quantity: number;
  product?: Product;
}

// ===== Pagination =====
export interface PaginatedResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiResponse<T> {
  code: number;
  data: T;
  message: string;
  timestamp: string;
}

// ===== Gold Price =====
export interface GoldPrice {
  id: number;
  price: number;
  source: 'AUTO' | 'MANUAL';
  recordDate: string;
  createdAt: string;
}

// ===== Inventory =====
export interface Inventory {
  id: number;
  skuId: number;
  warehouseId: number;
  quantity: number;
  safetyStock: number;
  warehouse?: Warehouse;
}

export interface Warehouse {
  id: number;
  name: string;
  type: 'SHOWROOM' | 'FACTORY' | 'STORE';
  address?: string;
}

// ===== CartItemData (统一购物车数据) =====
export interface CartItemData {
  id: number;
  productId: number;
  skuId: number;
  skuCode?: string;
  quantity: number;
  unitPrice?: number;
  product?: Product;
  productName?: string;
  productImage?: string;
  material?: string;
  size?: string;
  goldWeight?: number;
}

// ===== Inquiry (咨询/留言) =====
export interface Inquiry {
  id: number;
  productId?: number;
  productName?: string;
  customerName: string;
  customerPhone: string;
  content: string;
  status: 'PENDING' | 'REPLIED' | 'CLOSED';
  assignedTo?: number;
  reply?: string;
  createdAt: string;
}

// ===== Notification =====
export interface Notification {
  id: number;
  userId: number;
  title: string;
  content: string;
  type: 'SYSTEM' | 'ORDER' | 'INVENTORY' | 'PROMOTION';
  isRead: boolean;
  createdAt: string;
}

// ===== Homepage Config Block =====
export interface HomepageBlock {
  id: number;
  type: 'hero' | 'categories' | 'story' | 'products' | 'craft' | 'contact';
  title: string;
  subtitle: string;
  content: string;
  imageUrl: string;
  videoUrl: string;
  linkUrl: string;
  linkText: string;
  isEnabled: boolean;
  sortOrder: number;
  settings: Record<string, unknown>;
}

// ===== Product Filter Params =====
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

// ===== Order Filter Params =====
export interface OrderFilterParams {
  page?: number;
  pageSize?: number;
  status?: string;
  keyword?: string;
  startDate?: string;
  endDate?: string;
}

