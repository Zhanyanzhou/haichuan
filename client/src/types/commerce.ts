import type { Product } from "./catalog";

export interface CartItem {
  id: number;
  productId: number;
  skuId: number;
  quantity: number;
  product?: Product;
}

export interface GoldPrice {
  id: number;
  price: number;
  source: "AUTO" | "MANUAL";
  recordDate: string;
  createdAt: string;
}

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
  type: "SHOWROOM" | "FACTORY" | "STORE";
  address?: string;
}

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
