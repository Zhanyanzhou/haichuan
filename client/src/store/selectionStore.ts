import { create } from 'zustand';

interface SelectionState {
  selectedIds: Set<number>;
  toggle: (id: number) => void;
  isSelected: (id: number) => boolean;
  count: () => number;
  clear: () => void;
}

export const useSelectionStore = create<SelectionState>((set, get) => ({
  selectedIds: new Set<number>(),
  toggle: (id: number) => {
    set((state) => {
      const next = new Set(state.selectedIds);
      if (next.has(id)) next.delete(id); else next.add(id);
      return { selectedIds: next };
    });
  },
  isSelected: (id: number) => get().selectedIds.has(id),
  count: () => get().selectedIds.size,
  clear: () => set({ selectedIds: new Set() }),
}));
