import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type SelectionOwner = "guest" | `customer:${number}`;

type PersistedSelectionState = {
  ownerKey?: SelectionOwner;
  selectedIds?: number[];
};

interface SelectionState {
  selectedIds: Set<number>;
  activeOwner: "unknown" | SelectionOwner;
  ready: boolean;
  pendingOwner: SelectionOwner | null;
  pendingSelectedIds: number[];
  activateOwner: (owner: SelectionOwner) => void;
  toggle: (id: number) => "added" | "removed" | "limit" | "unavailable";
  removeMany: (ids: number[]) => void;
  isSelected: (id: number) => boolean;
  count: () => number;
  clear: () => void;
}

export const MAX_SELECTION_ITEMS = 20;

export function customerSelectionOwner(customerId: number): SelectionOwner {
  if (!Number.isSafeInteger(customerId) || customerId <= 0) {
    throw new Error("客户选款作用域缺少有效客户 ID");
  }
  return `customer:${customerId}`;
}

function normalizeOwner(value: unknown): SelectionOwner | null {
  if (value === "guest") return value;
  if (typeof value !== "string" || !/^customer:[1-9]\d*$/.test(value)) {
    return null;
  }
  const customerId = Number(value.slice("customer:".length));
  return Number.isSafeInteger(customerId) ? `customer:${customerId}` : null;
}

function normalizeIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const ids = value.filter(
    (id): id is number => Number.isSafeInteger(id) && id > 0,
  );
  return Array.from(new Set(ids)).slice(0, MAX_SELECTION_ITEMS);
}

export const useSelectionStore = create<SelectionState>()(
  persist<SelectionState, [], [], PersistedSelectionState>(
    (set, get) => ({
      selectedIds: new Set<number>(),
      activeOwner: "unknown",
      ready: false,
      pendingOwner: null,
      pendingSelectedIds: [],
      activateOwner: (owner) => {
        set((state) => {
          const previousOwner = state.ready
            ? state.activeOwner
            : state.pendingOwner;
          const previousIds = state.ready
            ? Array.from(state.selectedIds)
            : state.pendingSelectedIds;
          const selectedIds = previousOwner === owner
            ? new Set(previousIds)
            : new Set<number>();
          const pendingSelectedIds = Array.from(selectedIds);
          return {
            activeOwner: owner,
            ready: true,
            selectedIds,
            pendingOwner: owner,
            pendingSelectedIds,
          };
        });
      },
      toggle: (id: number) => {
        if (!get().ready) return "unavailable";
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
          return {
            selectedIds: next,
            pendingSelectedIds: Array.from(next),
          };
        });
        return result;
      },
      removeMany: (ids: number[]) => {
        if (!ids.length || !get().ready) return;
        set((state) => {
          const next = new Set(state.selectedIds);
          ids.forEach((id) => next.delete(id));
          return {
            selectedIds: next,
            pendingSelectedIds: Array.from(next),
          };
        });
      },
      isSelected: (id: number) => get().ready && get().selectedIds.has(id),
      count: () => (get().ready ? get().selectedIds.size : 0),
      clear: () => set({
        selectedIds: new Set(),
        pendingSelectedIds: [],
      }),
    }),
    {
      name: "hc_selection_tray",
      version: 1,
      storage: createJSONStorage<PersistedSelectionState>(() => localStorage),
      // v0 没有账户归属，不能把历史选款静默认领给首个登录客户或访客。
      migrate: () => ({}),
      partialize: (state) => ({
        ownerKey: state.ready
          ? state.activeOwner as SelectionOwner
          : state.pendingOwner ?? undefined,
        selectedIds: state.ready
          ? Array.from(state.selectedIds)
          : state.pendingSelectedIds,
      }),
      // 水合阶段只保存待核对快照；认证身份未确定前不得暴露任何选款。
      merge: (persistedState, currentState) => {
        const persisted = persistedState as PersistedSelectionState | undefined;
        const pendingOwner = normalizeOwner(persisted?.ownerKey);
        return {
          ...currentState,
          activeOwner: "unknown",
          ready: false,
          selectedIds: new Set<number>(),
          pendingOwner,
          pendingSelectedIds: pendingOwner
            ? normalizeIds(persisted?.selectedIds)
            : [],
        };
      },
    },
  ),
);
