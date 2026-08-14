import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface SelectionState {
  selectedIds: Set<number>;
  toggle: (id: number) => void;
  isSelected: (id: number) => boolean;
  count: () => number;
  clear: () => void;
}

export const useSelectionStore = create<SelectionState>()(
  persist(
    (set, get) => ({
      selectedIds: new Set<number>(),
      toggle: (id: number) => {
        set((state) => {
          const next = new Set(state.selectedIds);
          if (next.has(id)) next.delete(id);
          else next.add(id);
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
        return { ...currentState, selectedIds: new Set(ids) };
      },
    },
  ),
);
