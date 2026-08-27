/**
 * useInspectorModuleEditor.ts — Schema 面板统一的状态接线。
 *
 * 收编 useSelectedModuleEditor + InspectorPanel 的 baselineProps 基线语义：
 * - 选中模块时记录该模块的 props 快照（撤销基线）
 * - 保存周期结束后刷新基线（避免全局保存后「撤销」回退到更早内容）
 * 提供 props 读取、patch 写入、设备档、dirty 判断、撤销与整页草稿保存。
 */
import { useEffect, useMemo, useRef } from "react";
import { useGetPuck } from "@puckeditor/core";
import {
  ROOT_ZONE,
  useEditorHistoryTransaction,
  useHomepagePuck,
} from "../../pages/admin/HomepageConfig/editor-store";
import {
  cloneModuleProps,
  getInspectorDevice,
} from "../../pages/admin/HomepageConfig/editor-utils";
import type { PuckProps } from "../types";

export interface InspectorModuleEditor {
  moduleType: string;
  props: PuckProps;
  device: "desktop" | "mobile";
  /** 是否存在未保存的本模块修改（相对基线浅比较） */
  dirty: boolean;
  /** 写入 props 补丁（即时同步画布） */
  update: (patch: PuckProps) => void;
  /** 将一次恢复操作写成明确的 before/after 历史事务。 */
  updateHistoryTransaction: (
    patch: PuckProps | ((props: PuckProps) => PuckProps),
  ) => void;
  /** 恢复事务闭合期间为 true，供恢复按钮阻止重复提交。 */
  historyTransactionPending: boolean;
  /** 撤销本模块自面板打开/上次撤销以来的修改 */
  revert: () => void;
  /** 关闭面板 */
  close: () => void;
}

export function useInspectorModuleEditor(): InspectorModuleEditor | null {
  const getPuck = useGetPuck();
  const dispatch = useHomepagePuck((state) => state.dispatch);
  const appData = useHomepagePuck((state) => state.appState.data);
  const selectedItem = useHomepagePuck((state) => state.selectedItem);
  const currentViewport = useHomepagePuck(
    (state) => state.appState.ui.viewports.current,
  );
  const historyTransactionPending = useEditorHistoryTransaction(
    (state) => state.pending,
  );
  const setHistoryTransactionPending = useEditorHistoryTransaction(
    (state) => state.setPending,
  );
  const historyTransactionRef = useRef(0);

  const props = (selectedItem?.props || {}) as PuckProps;
  const moduleType = selectedItem?.type || "";
  const selectedKey = typeof props.id === "string" ? props.id : moduleType;
  const content = appData.content as Array<{
    type: string;
    props: PuckProps & { id: string };
  }>;
  const index = useMemo(
    () => content.findIndex((item) => item.props?.id === props.id),
    [content, props.id],
  );

  // 基线 = 面板打开（或上次撤销后重新记录）时的 props 快照。
  // 保存模型为「顶栏保存 + 2 秒静默自动保存」，无面板级 saving 信号；
  // 撤销在自动保存防抖窗口内最有价值，历史修改由发布版本兜底。
  const baselineRef = useRef<Map<string, PuckProps>>(new Map());

  useEffect(() => {
    if (!selectedItem || !selectedKey) return;
    // 重新选中同一模块时不重置基线，保证撤销目标稳定；
    // 撤销后由 revert() 显式刷新基线。
    if (!baselineRef.current.has(selectedKey)) {
      baselineRef.current.set(selectedKey, cloneModuleProps(props));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItem, selectedKey]);

  if (!selectedItem) return null;

  const update = (patch: PuckProps) => {
    if (index < 0 || historyTransactionPending) return;
    const nextItem = {
      ...content[index],
      props: { ...content[index].props, ...patch },
    };
    dispatch({
      type: "replace",
      destinationIndex: index,
      destinationZone: ROOT_ZONE,
      data: nextItem,
    });
  };

  const updateHistoryTransaction: InspectorModuleEditor["updateHistoryTransaction"] = (
    patchOrFactory,
  ) => {
    if (index < 0 || historyTransactionPending) return;
    const before = getPuck();
    const beforeData = before.appState.data;
    const beforeIndex = beforeData.content.findIndex(
      (item) => item.props?.id === props.id,
    );
    if (beforeIndex < 0) return;
    const beforeItem = beforeData.content[beforeIndex];
    const patch = typeof patchOrFactory === "function"
      ? patchOrFactory(beforeItem.props)
      : patchOrFactory;
    const afterContent = [...beforeData.content];
    afterContent[beforeIndex] = {
      ...beforeItem,
      props: { ...beforeItem.props, ...patch },
    };
    const afterState = {
      ...before.appState,
      data: { ...beforeData, content: afterContent },
    };
    const transactionId = historyTransactionRef.current + 1;
    historyTransactionRef.current = transactionId;
    setHistoryTransactionPending(true);

    // 覆盖 Puck 尚未触发的 250ms 防抖记录：先让当前完整状态成为 before。
    dispatch({
      type: "replace",
      destinationIndex: beforeIndex,
      destinationZone: ROOT_ZONE,
      data: beforeItem,
      recordHistory: true,
    });
    // reset 立即反映到画布；after 由下方 setHistories 原子追加。
    dispatch({
      type: "replace",
      destinationIndex: beforeIndex,
      destinationZone: ROOT_ZONE,
      data: afterContent[beforeIndex],
      recordHistory: false,
    });

    const finishTransaction = (attempt = 0) => {
      if (historyTransactionRef.current !== transactionId) return;
      const latest = getPuck();
      const currentHistory = latest.history.histories[latest.history.index];
      const currentHistoryData = (currentHistory?.state as { data?: unknown } | undefined)?.data;
      const beforeRecorded = JSON.stringify(currentHistoryData) === JSON.stringify(beforeData);
      if (!beforeRecorded && attempt < 8) {
        window.setTimeout(() => finishTransaction(attempt + 1), 25);
        return;
      }
      const historyPrefix = latest.history.histories.slice(0, latest.history.index + 1);
      const beforeEntry = beforeRecorded ? [] : [{ state: before.appState }];
      latest.history.setHistories([
        ...historyPrefix,
        ...beforeEntry,
        { state: afterState },
      ]);
      setHistoryTransactionPending(false);
    };
    window.setTimeout(() => finishTransaction(), 260);
  };

  const revert = () => {
    const baseline = baselineRef.current.get(selectedKey);
    if (!baseline || index < 0) return;
    dispatch({
      type: "replace",
      destinationIndex: index,
      destinationZone: ROOT_ZONE,
      data: {
        ...content[index],
        props: {
          ...cloneModuleProps(baseline),
          id: content[index].props.id,
        },
      },
    });
  };

  const close = () =>
    dispatch({ type: "setUi", ui: { itemSelector: null } });

  const baseline = baselineRef.current.get(selectedKey);
  const dirty = Boolean(
    baseline && JSON.stringify(baseline) !== JSON.stringify(props),
  );

  return {
    moduleType,
    props,
    device: getInspectorDevice(currentViewport),
    dirty,
    update,
    updateHistoryTransaction,
    historyTransactionPending,
    revert,
    close,
  };
}
