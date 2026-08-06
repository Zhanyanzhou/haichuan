import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CartItem, Product, GoldPrice } from '@/types';

interface ShopState {
  // 购物车
  cartItems: CartItem[];
  addToCart: (item: CartItem) => void;
  removeFromCart: (skuId: number) => void;
  updateQuantity: (skuId: number, quantity: number) => void;
  clearCart: () => void;
  cartCount: () => number;

  // 金价（实时缓存）
  goldPrice: GoldPrice | null;
  setGoldPrice: (price: GoldPrice) => void;

  // 筛选条件
  filters: {
    keyword: string;
    categoryId: number | null;
    materialType: string | null;
    priceMin: number | null;
    priceMax: number | null;
    sortBy: string;
    sortOrder: 'asc' | 'desc';
  };
  setFilter: (key: string, value: unknown) => void;
  resetFilters: () => void;

  // 搜索关键词
  searchKeyword: string;
  setSearchKeyword: (kw: string) => void;
}

const defaultFilters = {
  keyword: '',
  categoryId: null,
  materialType: null,
  priceMin: null,
  priceMax: null,
  sortBy: 'createdAt',
  sortOrder: 'desc' as const,
};

export const useShopStore = create<ShopState>()(
  persist(
    (set, get) => ({
      // 购物车
      cartItems: [],
      addToCart: (item) => {
        set((state) => {
          const existing = state.cartItems.find((i) => i.skuId === item.skuId);
          if (existing) {
            return {
              cartItems: state.cartItems.map((i) =>
                i.skuId === item.skuId
                  ? { ...i, quantity: i.quantity + item.quantity }
                  : i,
              ),
            };
          }
          return { cartItems: [...state.cartItems, item] };
        });
      },
      removeFromCart: (skuId) => {
        set((state) => ({
          cartItems: state.cartItems.filter((i) => i.skuId !== skuId),
        }));
      },
      updateQuantity: (skuId, quantity) => {
        if (quantity <= 0) {
          get().removeFromCart(skuId);
          return;
        }
        set((state) => ({
          cartItems: state.cartItems.map((i) =>
            i.skuId === skuId ? { ...i, quantity } : i,
          ),
        }));
      },
      clearCart: () => set({ cartItems: [] }),
      cartCount: () => get().cartItems.reduce((sum, i) => sum + i.quantity, 0),

      // 金价
      goldPrice: null,
      setGoldPrice: (price) => set({ goldPrice: price }),

      // 筛选
      filters: { ...defaultFilters },
      setFilter: (key, value) => {
        set((state) => ({
          filters: { ...state.filters, [key]: value },
        }));
      },
      resetFilters: () => set({ filters: { ...defaultFilters } }),

      // 搜索
      searchKeyword: '',
      setSearchKeyword: (kw) => set({ searchKeyword: kw }),
    }),
    {
      name: 'jewelry-shop',
      partialize: (state) => ({
        cartItems: state.cartItems,
        goldPrice: state.goldPrice,
      }),
    },
  ),
);
