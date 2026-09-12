import { useLayoutEffect } from "react";
import { useGetPuck } from "@puckeditor/core";
import type { PuckDocument, PuckProps } from "@/page-builder/types";
import { ROOT_ZONE, useHomepagePuck } from "../editor-store";

export interface PageModuleData {
  type: string;
  props: PuckProps & { id: string };
}

function createCopyId(prefix: string) {
  const suffix = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${suffix}`;
}

type HomepagePuckGetter = ReturnType<typeof useGetPuck>;
type PageModuleDocument = Omit<PuckDocument, "content"> & {
  content: PageModuleData[];
};
type SelectionTarget = "preserve" | { blockId: string } | null;
type PageModuleHistory = ReturnType<HomepagePuckGetter>["history"]["histories"];

let pendingStructureHistorySeal: {
  setHistories: ReturnType<HomepagePuckGetter>["history"]["setHistories"];
  histories: PageModuleHistory;
  data: PageModuleDocument;
  navigationIndex: number;
} | null = null;

function pageDataMatches(left: unknown, right: unknown) {
  if (left === right) return true;
  return JSON.stringify(left) === JSON.stringify(right);
}

function resolveSelection(
  beforeData: PageModuleDocument,
  nextData: PageModuleDocument,
  currentSelector: { index: number; zone?: string } | null,
  selection: SelectionTarget,
) {
  if (selection === null) return null;

  const selectedBlockId = selection === "preserve"
    ? currentSelector?.zone === ROOT_ZONE && typeof currentSelector.index === "number"
      ? beforeData.content[currentSelector.index]?.props.id
      : undefined
    : selection.blockId;
  if (!selectedBlockId) return currentSelector;

  const nextIndex = nextData.content.findIndex(
    (item) => item.props.id === selectedBlockId,
  );
  return nextIndex >= 0
    ? { index: nextIndex, zone: ROOT_ZONE }
    : null;
}

/** 清理用于取消 Puck 旧防抖记录而产生的、与同步事务重复的尾快照。 */
export function usePageModuleStructureHistoryGuard() {
  const getPuck = useGetPuck();
  const histories = useHomepagePuck((state) => state.history.histories);
  const historyIndex = useHomepagePuck((state) => state.history.index);
  const appData = useHomepagePuck((state) => state.appState.data);

  useLayoutEffect(() => {
    const seal = pendingStructureHistorySeal;
    const puck = getPuck();
    if (!seal || seal.setHistories !== puck.history.setHistories) return;

    if (puck.history.histories === seal.histories) {
      seal.navigationIndex = puck.history.index;
      return;
    }

    const expectedPrefix = seal.histories.slice(0, seal.navigationIndex + 1);
    const actualHistories = puck.history.histories;
    const tail = actualHistories[actualHistories.length - 1];
    const tailState = tail?.state as Record<string, unknown> | undefined;
    const prefixMatches = actualHistories.length === expectedPrefix.length + 1
      && expectedPrefix.every((entry, index) => actualHistories[index] === entry);
    const isDeferredDuplicate = prefixMatches
      && pageDataMatches(tailState?.data, seal.data);

    if (!isDeferredDuplicate) {
      pendingStructureHistorySeal = null;
      return;
    }

    const restoreIndex = seal.navigationIndex;
    pendingStructureHistorySeal = null;
    puck.history.setHistories(seal.histories);
    if (restoreIndex !== seal.histories.length - 1) {
      puck.history.setHistoryIndex(restoreIndex);
    }
  }, [appData, getPuck, histories, historyIndex]);
}

/**
 * 页面模块结构动作的同步历史封口。
 *
 * 先用 Puck 的公开 reducer 落地数据以重建内部索引，再把完整 before/after
 * 直接写入历史，因此快速连续操作仍各占一条记录，且新动作自然截断 redo 分支。
 * setData 的记录仅用于取消更早的待提交防抖；guard 会移除它的重复尾项。
 */
export function commitPageModuleStructureTransaction(
  getPuck: HomepagePuckGetter,
  update: (data: PageModuleDocument) => PageModuleDocument,
  selection: SelectionTarget = "preserve",
) {
  const puck = getPuck();
  const beforeState = puck.appState;
  const beforeData = beforeState.data as PageModuleDocument;
  const nextData = update(beforeData);
  if (nextData === beforeData) return false;

  const nextSelector = resolveSelection(
    beforeData,
    nextData,
    beforeState.ui.itemSelector,
    selection,
  );
  const beforeUi = {
    ...beforeState.ui,
    field: { ...beforeState.ui.field, focus: null },
  };
  const historyPrefix = puck.history.histories.slice(0, puck.history.index + 1);
  const currentEntry = historyPrefix[historyPrefix.length - 1];
  const currentEntryState = currentEntry?.state as Record<string, unknown> | undefined;

  if (currentEntry && pageDataMatches(currentEntryState?.data, beforeData)) {
    historyPrefix[historyPrefix.length - 1] = {
      ...currentEntry,
      state: {
        ...currentEntryState,
        ...beforeState,
        ui: beforeUi,
      },
    };
  } else {
    historyPrefix.push({ state: { ...beforeState, ui: beforeUi } });
  }

  puck.dispatch({
    type: "setData",
    data: nextData,
    recordHistory: true,
  });
  puck.dispatch({
    type: "setUi",
    ui: {
      itemSelector: nextSelector,
      field: { ...beforeUi.field, focus: null },
    },
    recordHistory: false,
  });
  const sealedHistories = [
    ...historyPrefix,
    { state: getPuck().appState },
  ];
  pendingStructureHistorySeal = {
    setHistories: puck.history.setHistories,
    histories: sealedHistories,
    data: nextData,
    navigationIndex: sealedHistories.length - 1,
  };
  puck.history.setHistories(sealedHistories);
  return true;
}

export function duplicatePageModule(
  getPuck: HomepagePuckGetter,
  sourceIndex: number,
) {
  const source = (getPuck().appState.data.content as PageModuleData[])[sourceIndex];
  if (!source) return sourceIndex;
  const duplicatedId = createCopyId("homepage-block");
  const duplicated = structuredClone(source);
  duplicated.props = {
    ...duplicated.props,
    id: duplicatedId,
    ...(typeof duplicated.props.instanceId === "string"
      ? { instanceId: createCopyId("instance") }
      : {}),
  };
  const destinationIndex = sourceIndex + 1;
  commitPageModuleStructureTransaction(
    getPuck,
    (data) => ({
      ...data,
      content: [
        ...data.content.slice(0, destinationIndex),
        duplicated,
        ...data.content.slice(destinationIndex),
      ],
    }),
    { blockId: duplicatedId },
  );
  return destinationIndex;
}

export function reorderPageModules(
  getPuck: HomepagePuckGetter,
  sourceIndex: number,
  destinationIndex: number,
) {
  const content = getPuck().appState.data.content as PageModuleData[];
  const movedBlockId = content[sourceIndex]?.props.id;
  if (!movedBlockId || sourceIndex === destinationIndex) return false;
  return commitPageModuleStructureTransaction(
    getPuck,
    (data) => {
      const nextContent = [...data.content];
      const [moved] = nextContent.splice(sourceIndex, 1);
      if (!moved) return data;
      nextContent.splice(destinationIndex, 0, moved);
      return { ...data, content: nextContent };
    },
    { blockId: movedBlockId },
  );
}

export function deletePageModules(
  getPuck: HomepagePuckGetter,
  indexes: number[],
) {
  const removeSet = new Set(indexes);
  if (removeSet.size === 0) return false;
  return commitPageModuleStructureTransaction(
    getPuck,
    (data) => ({
      ...data,
      content: data.content.filter((_, index) => !removeSet.has(index)),
    }),
  );
}
