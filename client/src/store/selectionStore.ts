import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface SelectionState {
  selectedIds: Set<number>;
  toggle: (id: number) => "added" | "removed" | "limit";
  removeMany: (ids: number[]) => void;
  isSelected: (id: number) => boolean;
  count: () => number;
  clear: () => void;
}

export const MAX_SELECTION_ITEMS = 20;

export const useSelectionStore = create<SelectionState>()(
  persist(
    (set, get) => ({
      selectedIds: new Set<number>(),
      toggle: (id: number) => {
        let result: "added" | "removed" | "limit" = "removed";
        set((state) => {
          const next = new Set(state.selectedIds);
          if (next.has(id)) {
            next.delete(id);
          } else if (next.size >= MAX_SELECTION_ITEMS) {
            result = "limit";
            return state;
          } else {
            next.add(id);
            result = "added";
          }
          return { selectedIds: next };
        });
        return result;
      },
      removeMany: (ids: number[]) => {
        if (!ids.length) return;
        set((state) => {
          const next = new Set(state.selectedIds);
          ids.forEach((id) => next.delete(id));
          return { selectedIds: next };
        });
      },
      isSelected: (id: number) => get().selectedIds.has(id),
      count: () => get().selectedIds.size,
      clear: () => set({ selectedIds: new Set() }),
    }),
    {
      name: "hc_selection_tray",
      storage: createJSONStorage(() => localStorage),
      // Set 不能直接 JSON 序列化：仅持久化选中 id 数组
      partialize: (state) => ({ selectedIds: Array.from(state.selectedIds) }),
      // 水合时把数组还原为 Set
      merge: (persistedState, currentState) => {
        const p = persistedState as { selectedIds?: unknown } | undefined;
        const ids = Array.isArray(p?.selectedIds)
          ? (p.selectedIds as number[])
          : [];
        return { ...currentState, selectedIds: new Set(ids.slice(0, MAX_SELECTION_ITEMS)) };
      },
    },
  ),
);
