/**
 * useInspectorModuleEditor.ts — Schema 面板统一的状态接线。
 *
 * 收编 useSelectedModuleEditor + InspectorPanel 的 baselineProps 基线语义：
 * - 选中模块时记录该模块的 props 快照（撤销基线）
 * - 保存周期结束后刷新基线（避免全局保存后「撤销」回退到更早内容）
 * 提供 props 读取、patch 写入、设备档、dirty 判断、撤销与整页草稿保存。
 */
import { useEffect, useMemo, useRef } from "react";
import { useHomepagePuck } from "../../pages/admin/HomepageConfig/editor-store";
import {
  cloneModuleProps,
  getInspectorDevice,
} from "../../pages/admin/HomepageConfig/editor-utils";

export interface InspectorModuleEditor {
  moduleType: string;
  props: Record<string, any>;
  device: "desktop" | "mobile";
  /** 是否存在未保存的本模块修改（相对基线浅比较） */
  dirty: boolean;
  /** 写入 props 补丁（即时同步画布） */
  update: (patch: Record<string, any>) => void;
  /** 撤销本模块自面板打开/上次撤销以来的修改 */
  revert: () => void;
  /** 关闭面板 */
  close: () => void;
}

export function useInspectorModuleEditor(): InspectorModuleEditor | null {
  const dispatch = useHomepagePuck((state) => state.dispatch);
  const appData = useHomepagePuck((state) => state.appState.data);
  const selectedItem = useHomepagePuck((state) => state.selectedItem);
  const currentViewport = useHomepagePuck(
    (state) => state.appState.ui.viewports.current,
  );

  const props = (selectedItem?.props || {}) as Record<string, any>;
  const moduleType = selectedItem?.type || "";
  const selectedKey = props.id || moduleType;
  const content = appData.content as Array<{
    type: string;
    props: Record<string, any>;
  }>;
  const index = useMemo(
    () => content.findIndex((item) => item.props?.id === props.id),
    [content, props.id],
  );

  // 基线 = 面板打开（或上次撤销后重新记录）时的 props 快照。
  // 保存模型为「顶栏保存 + 2 秒静默自动保存」，无面板级 saving 信号；
  // 撤销在自动保存防抖窗口内最有价值，历史修改由发布版本兜底。
  const baselineRef = useRef<Map<string, Record<string, any>>>(new Map());

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

  const update = (patch: Record<string, any>) => {
    if (index < 0) return;
    const next = [...content];
    next[index] = { ...next[index], props: { ...next[index].props, ...patch } };
    dispatch({ type: "setData", data: { ...appData, content: next } });
  };

  const revert = () => {
    const baseline = baselineRef.current.get(selectedKey);
    if (!baseline || index < 0) return;
    const next = [...content];
    next[index] = { ...next[index], props: cloneModuleProps(baseline) };
    dispatch({ type: "setData", data: { ...appData, content: next } });
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
    revert,
    close,
  };
}
