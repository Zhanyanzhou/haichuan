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
import { useVisualEditorSession } from "../visual-editor/visualEditorSession";
import { applySharedTemplateDesignPatch } from "../visual-editor/sharedTemplateDesign";

export interface InspectorModuleEditor {
  moduleType: string;
  props: PuckProps;
  device: "desktop" | "mobile";
  /** 是否存在未保存的本模块修改（相对基线浅比较） */
  dirty: boolean;
  /** 写入 props 补丁（即时同步画布） */
  update: (patch: PuckProps) => void;
  /** 基于最新模块状态生成补丁，避免连续控件用旧闭包覆盖前一项设计。 */
  updateFromCurrent: (factory: (props: PuckProps) => PuckProps) => void;
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
  const panelMode = useVisualEditorSession((state) => state.panelMode);
  const setHistoryTransactionPending = useEditorHistoryTransaction(
    (state) => state.setPending,
  );
  const historyTransactionRef = useRef(0);
  const latestDataRef = useRef(appData);

  useEffect(() => {
    latestDataRef.current = appData;
  }, [appData]);

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
  // 保存模型为顶栏显式保存；面板只维护当前 Puck 历史，不建立第二套保存状态。
  // 撤销用于回到本次选择前的设计基线，跨会话恢复由草稿与发布版本承接。
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
    const latestData = latestDataRef.current;
    const latestContent = latestData.content as typeof content;
    const latestIndex = latestContent.findIndex((item) => item.props?.id === props.id);
    if (latestIndex < 0) return;
    if (panelMode === "design") {
      const nextData = {
        ...latestData,
        content: applySharedTemplateDesignPatch(latestContent, moduleType, patch) as typeof latestData.content,
      };
      latestDataRef.current = nextData;
      dispatch({
        type: "setData",
        data: nextData,
      });
      return;
    }
    const nextItem = {
      ...latestContent[latestIndex],
      props: { ...latestContent[latestIndex].props, ...patch },
    };
    const nextContent = [...latestContent];
    nextContent[latestIndex] = nextItem;
    latestDataRef.current = { ...latestData, content: nextContent as typeof latestData.content };
    dispatch({
      type: "replace",
      destinationIndex: latestIndex,
      destinationZone: ROOT_ZONE,
      data: nextItem,
    });
  };

  const updateFromCurrent: InspectorModuleEditor["updateFromCurrent"] = (factory) => {
    if (historyTransactionPending) return;
    const latestData = latestDataRef.current;
    const latestContent = latestData.content as typeof content;
    const latestIndex = latestContent.findIndex((item) => item.props?.id === props.id);
    if (latestIndex < 0) return;
    const patch = factory(latestContent[latestIndex].props);
    if (panelMode === "design") {
      const nextData = {
        ...latestData,
        content: applySharedTemplateDesignPatch(latestContent, moduleType, patch) as typeof latestData.content,
      };
      latestDataRef.current = nextData;
      dispatch({
        type: "setData",
        data: nextData,
      });
      return;
    }
    const nextContent = [...latestContent];
    nextContent[latestIndex] = {
      ...latestContent[latestIndex],
      props: { ...latestContent[latestIndex].props, ...patch },
    };
    latestDataRef.current = { ...latestData, content: nextContent as typeof latestData.content };
    dispatch({
      type: "replace",
      destinationIndex: latestIndex,
      destinationZone: ROOT_ZONE,
      data: nextContent[latestIndex],
    });
  };

  const updateHistoryTransaction: InspectorModuleEditor["updateHistoryTransaction"] = (
    patchOrFactory,
  ) => {
    if (index < 0 || historyTransactionPending) return;
    const before = getPuck();
    const beforeData = latestDataRef.current;
    const beforeIndex = beforeData.content.findIndex(
      (item) => item.props?.id === props.id,
    );
    if (beforeIndex < 0) return;
    const beforeItem = beforeData.content[beforeIndex];
    const patch = typeof patchOrFactory === "function"
      ? patchOrFactory(beforeItem.props)
      : patchOrFactory;
    const afterContent = panelMode === "design"
      ? applySharedTemplateDesignPatch(
          beforeData.content as typeof content,
          moduleType,
          patch,
        )
      : [...beforeData.content];
    if (panelMode !== "design") {
      afterContent[beforeIndex] = {
        ...beforeItem,
        props: { ...beforeItem.props, ...patch },
      };
    }
    const transactionId = historyTransactionRef.current + 1;
    historyTransactionRef.current = transactionId;
    setHistoryTransactionPending(true);

    // 覆盖 Puck 尚未触发的 250ms 防抖记录：先让当前完整状态成为 before。
    dispatch({ type: "setData", data: beforeData, recordHistory: true });
    // reset 立即反映到画布；after 由下方 setHistories 原子追加。
    const afterData = {
      ...beforeData,
      content: afterContent as typeof beforeData.content,
    };
    dispatch({
      type: "setData",
      data: afterData,
      recordHistory: false,
    });
    latestDataRef.current = afterData;

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
      const beforeEntry = beforeRecorded ? [] : [{
        state: { ...before.appState, data: beforeData },
      }];
      // 历史事务封口可能晚于用户切换模块或设备；保留此刻 UI，
      // 只把本事务的最终内容写入 after，避免属性面板跳回旧选中项。
      const afterState = {
        ...latest.appState,
        data: { ...latest.appState.data, content: afterContent },
      };
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
    updateFromCurrent,
    updateHistoryTransaction,
    historyTransactionPending,
    revert,
    close,
  };
}
