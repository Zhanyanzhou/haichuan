import { create } from 'zustand';

interface AppState {
  sidebarCollapsed: boolean;
  goldPrice: number | null;
  goldPriceChange: number | null;
  toggleSidebar: () => void;
  setGoldPrice: (price: number, change: number | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  sidebarCollapsed: false,
  goldPrice: null,
  goldPriceChange: null,

  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  setGoldPrice: (price: number, change: number | null) =>
    set({ goldPrice: price, goldPriceChange: change }),
}));
