/**
 * LayerRail.tsx — 编辑器右侧的页面图层栏。
 * 2026-08-16 升级：同类型模块自动序号（品牌故事 1/2）；Shift/Ctrl 多选批量删除与移动。
 * 固定业务区不可删除/调整；点选定位、拖拽排序保持原有行为。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { message, Modal } from "antd";
import {
  HolderOutlined,
  LockOutlined,
} from "@ant-design/icons";
import { ROOT_ZONE, focusCanvasBlock, useHomepagePuck } from "../editor-store";
import { getModuleDisplayName } from "../editor-utils";

export default function LayerRail({
  onSaveAsTemplate,
  navigationPreviewOpen,
  onToggleNavigationPreview,
  scrollSpyIndex,
  publishIssues,
}: {
  onSaveAsTemplate: (type: string, props: Record<string, any>) => void;
  navigationPreviewOpen: boolean;
  onToggleNavigationPreview: () => void;
  scrollSpyIndex: number | null;
  publishIssues: Array<{
    blockId?: string;
    message: string;
    severity: "error" | "warning" | "info";
  }>;
}) {
  const appData = useHomepagePuck((state) => state.appState.data);
  const dispatch = useHomepagePuck((state) => state.dispatch);
  const selectedItem = useHomepagePuck((state) => state.selectedItem);
  const selectedId = selectedItem?.props?.id;
  const content = appData.content as Array<{
    type: string;
    props: Record<string, any>;
  }>;
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  /** 多选下标集合（仅未锁定模块） */
  const [multiIndices, setMultiIndices] = useState<number[]>([]);
  /** Shift 范围选择的锚点 */
  const anchorRef = useRef<number | null>(null);

  /* 同类型序号：类型出现 ≥2 次时显示 "名称 i/n" */
  const numberedNames = useMemo(() => {
    const totals = new Map<string, number>();
    content.forEach((item) => totals.set(item.type, (totals.get(item.type) || 0) + 1));
    const seen = new Map<string, number>();
    return content.map((item) => {
      const ordinal = (seen.get(item.type) || 0) + 1;
      seen.set(item.type, ordinal);
      const base = getModuleDisplayName(item.type, item.props);
      return (totals.get(item.type) || 0) > 1 ? `${base} ${ordinal}/${totals.get(item.type)}` : base;
    });
  }, [content]);

  const layerScrollRef = useRef<HTMLDivElement>(null);

  // 画布滚动时，让图层列表自动滚动到当前可见模块（仅滚动，不改选中态）。
  useEffect(() => {
    if (scrollSpyIndex === null) return;
    layerScrollRef.current
      ?.querySelector<HTMLElement>(`[data-layer-index="${scrollSpyIndex}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [scrollSpyIndex]);

  const multiActive = multiIndices.length >= 2;
  const publishErrorIssues = publishIssues.filter(
    (issue) => issue.severity === "error",
  );

  const selectLayer = (index: number) => {
    const targetId = content[index]?.props?.id;
    if (targetId !== selectedId) {
      dispatch({
        type: "setUi",
        ui: { itemSelector: { index, zone: ROOT_ZONE } },
      });
    }
    focusCanvasBlock(targetId);
  };

  // 发布检查清单的逃生门：素材未到位时隐藏模块而非删除。
  // 隐藏的模块保留画布排序，服务端校验自动跳过（isVisible === false），
  // 隐藏触发的重新校验会让对应条目从清单中消失。
  const hideBlockFromIssue = (index: number) => {
    const target = content[index];
    if (!target || target.props?.locked) return;
    const nextContent = content.map((item, i) =>
      i === index ? { ...item, props: { ...item.props, isVisible: false } } : item,
    );
    dispatch({
      type: "setData",
      data: { ...appData, content: nextContent },
      recordHistory: true,
    });
    message.success(
      `已暂时隐藏「${numberedNames[index]}」，排序保留；素材补齐后在属性面板恢复显示`,
    );
  };

  const handleLayerClick = (index: number, event: React.MouseEvent) => {
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      event.preventDefault();
      const locked = Boolean(content[index]?.props?.locked);
      setMultiIndices((prev) => {
        let next: number[];
        if (event.shiftKey && anchorRef.current !== null) {
          const [from, to] =
            anchorRef.current <= index ? [anchorRef.current, index] : [index, anchorRef.current];
          next = Array.from({ length: to - from + 1 }, (_, i) => from + i);
        } else {
          next = prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index];
        }
        if (locked) next = next.filter((i) => !content[i]?.props?.locked);
        anchorRef.current = index;
        if (next.length === 0) {
          anchorRef.current = null;
          return [];
        }
        return [...new Set(next)].sort((a, b) => a - b);
      });
      return;
    }
    if (multiActive) {
      setMultiIndices([]);
      anchorRef.current = null;
    }
    anchorRef.current = index;
    selectLayer(index);
  };

  /* 整组上移/下移：保持组内相对顺序，跳过锁定模块与边界 */
  const batchMove = (direction: -1 | 1) => {
    const picked = [...multiIndices].sort((a, b) => (direction === -1 ? a - b : b - a));
    const next = [...content];
    let moved = false;
    for (const index of picked) {
      const target = index + direction;
      if (target < 0 || target >= next.length) continue;
      if (next[index].props?.locked || next[target].props?.locked) continue;
      [next[index], next[target]] = [next[target], next[index]];
      moved = true;
    }
    if (moved) {
      dispatch({
        type: "setData",
        data: { ...appData, content: next },
        recordHistory: true,
      });
      setMultiIndices((prev) => prev.map((i) => i + direction));
    }
  };

  const batchDelete = () => {
    const deletable = multiIndices.filter((i) => !content[i]?.props?.locked);
    if (deletable.length === 0) {
      message.info("所选模块均为固定业务区，不能删除");
      return;
    }
    Modal.confirm({
      title: `删除 ${deletable.length} 个模块？`,
      content: "删除后可从模块库重新添加；尚未发布的修改可通过版本记录恢复。",
      okText: "删除模块",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: () => {
        const removeSet = new Set(deletable);
        const nextContent = content.filter((_, index) => !removeSet.has(index));
        dispatch({
          type: "setData",
          data: { ...appData, content: nextContent },
          recordHistory: true,
        });
        dispatch({ type: "setUi", ui: { itemSelector: null } });
        setMultiIndices([]);
        anchorRef.current = null;
      },
    });
  };

  const reorderLayer = (from: number, to: number) => {
    if (
      from === to ||
      from < 0 ||
      to < 0 ||
      from >= content.length ||
      to >= content.length
    )
      return;
    if (content[from]?.props?.locked || content[to]?.props?.locked) {
      message.info("固定业务区不能调整顺序");
      return;
    }
    const nextContent = [...content];
    const [moved] = nextContent.splice(from, 1);
    nextContent.splice(to, 0, moved);
    dispatch({
      type: "setData",
      data: { ...appData, content: nextContent },
      recordHistory: true,
    });
    selectLayer(to);
  };

  return (
    <section className="homepage-editor__layer-rail">
      <div className="homepage-editor__layer-scroll" ref={layerScrollRef}>
        <div className="homepage-editor__layer-frame homepage-editor__layer-global">
          <button
            type="button"
            onClick={onToggleNavigationPreview}
            aria-pressed={navigationPreviewOpen}
            aria-label="预览页面导航"
          >
            <span>页面导航</span>
            <LockOutlined
              className="homepage-editor__layer-system-state"
              title="固定区域"
              aria-label="固定区域"
            />
          </button>
        </div>
        {publishErrorIssues.length > 0 && (
          <section
            className="homepage-editor__publish-issues"
            aria-label="发布检查问题"
            role="alert"
          >
            <strong>发布检查 · {publishErrorIssues.length} 项待处理</strong>
            <p className="homepage-editor__publish-issues-hint">
              点击条目定位到模块；素材未到位的模块可暂时隐藏，排序保留，随时恢复。
            </p>
            <div>
              {publishErrorIssues.map((issue, index) => {
                const blockIndex = issue.blockId
                  ? content.findIndex((block) => block.props?.id === issue.blockId)
                  : -1;
                const canLocate = blockIndex >= 0;
                const canHide =
                  canLocate && !content[blockIndex]?.props?.locked;
                return (
                  <div
                    key={`${issue.blockId ?? "page"}-${issue.message}-${index}`}
                    className="homepage-editor__publish-issue-item"
                  >
                    {canLocate ? (
                      <button
                        type="button"
                        onClick={() => selectLayer(blockIndex)}
                        title="定位到对应模块"
                      >
                        {issue.message}
                      </button>
                    ) : (
                      <p>{issue.message}</p>
                    )}
                    {canHide && (
                      <button
                        type="button"
                        className="homepage-editor__publish-issue-hide"
                        onClick={() => hideBlockFromIssue(blockIndex)}
                        title="隐藏后不参与发布，排序保留；素材补齐后在属性面板恢复显示"
                      >
                        暂时隐藏
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
        {multiActive && (
          <div className="homepage-editor__layer-batch">
            <span>已选 {multiIndices.length} 项</span>
            <button type="button" onClick={() => batchMove(-1)}>上移</button>
            <button type="button" onClick={() => batchMove(1)}>下移</button>
            <button type="button" className="is-danger" onClick={batchDelete}>
              删除
            </button>
            <button
              type="button"
              onClick={() => {
                setMultiIndices([]);
                anchorRef.current = null;
              }}
            >
              取消
            </button>
          </div>
        )}
        {content.map((item, index) => {
          const active = item.props?.id === selectedId;
          const inView = scrollSpyIndex === index;
          const multiSelected = multiIndices.includes(index);
          return (
            <div
              key={item.props?.id ?? `${item.type}-${index}`}
              data-layer-index={index}
              className={`homepage-editor__layer-item${active ? " is-active" : ""}${inView ? " is-in-view" : ""}${multiSelected ? " is-multi-selected" : ""}${draggingIndex === index ? " is-dragging" : ""}${dropIndex === index ? " is-drop-target" : ""}`}
              draggable={!item.props?.locked}
              onDragStart={(event) => {
                if (item.props?.locked) return;
                event.dataTransfer.effectAllowed = "move";
                setDraggingIndex(index);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDropIndex(index);
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (draggingIndex !== null) reorderLayer(draggingIndex, index);
                setDraggingIndex(null);
                setDropIndex(null);
              }}
              onDragEnd={() => {
                setDraggingIndex(null);
                setDropIndex(null);
              }}
            >
              <button
                type="button"
                className="homepage-editor__layer-select"
                onClick={(event) => handleLayerClick(index, event)}
                aria-current={inView ? "location" : undefined}
              >
                <span className="homepage-editor__layer-name">
                  {numberedNames[index]}
                </span>
                <HolderOutlined
                  className="homepage-editor__layer-grip"
                  title="拖动调整顺序"
                  aria-label="拖动调整顺序"
                />
              </button>
            </div>
          );
        })}
        {appData.content.length === 0 && (
          <div className="homepage-editor__layer-empty">
            从左侧添加模块后，这里会显示页面结构。
          </div>
        )}
      </div>
    </section>
  );
}
