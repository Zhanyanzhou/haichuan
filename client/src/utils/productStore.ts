/** 产品本地存储 — localStorage 实现完整 CRUD */
import { imageStore } from './imageStore';

const STORAGE_KEY = 'haichuan_products';

export interface StoredProduct {
  id: string;
  code: string;
  name: string;
  category: string;
  materialType: string;
  goldWeight: number;
  price: number;
  craftFee: number;
  status: string;
  description: string;
  coverImageId: string;    // 关联图片 ID
  isHot: boolean;
  isNew: boolean;
  createdAt: string;
  updatedAt: string;
}

function readAll(): StoredProduct[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}

function writeAll(list: StoredProduct[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export const productStore = {
  getAll: (): StoredProduct[] => readAll(),

  getById: (id: string): StoredProduct | undefined =>
    readAll().find((p) => p.id === id),

  create: (data: Omit<StoredProduct, 'id' | 'createdAt' | 'updatedAt'>): StoredProduct => {
    const list = readAll();
    const product: StoredProduct = {
      ...data,
      id: Date.now().toString(36),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    list.unshift(product);
    writeAll(list);
    return product;
  },

  update: (id: string, data: Partial<StoredProduct>) => {
    const list = readAll();
    const idx = list.findIndex((p) => p.id === id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...data, updatedAt: new Date().toISOString() };
      writeAll(list);
    }
  },

  delete: (id: string) => {
    writeAll(readAll().filter((p) => p.id !== id));
  },

  /** 获取封面图 URL */
  getCoverUrl: (product: StoredProduct): string | undefined => {
    return product.coverImageId ? imageStore.getUrl(product.coverImageId) : undefined;
  },
};
