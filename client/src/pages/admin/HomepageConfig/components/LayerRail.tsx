/**
 * LayerRail.tsx — 编辑器右侧的页面图层栏。
 * 2026-08-16 升级：同类型模块自动序号（品牌故事 1/2）；Shift/Ctrl 多选批量删除与移动。
 * 固定业务区不可删除/调整；点选定位、拖拽排序保持原有行为。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { message, Modal } from "antd";
import { DragOutlined } from "@ant-design/icons";
import { ROOT_ZONE, focusCanvasBlock, useHomepagePuck } from "../editor-store";
import { getModuleDisplayName } from "../editor-utils";

/** 需要区分桌面/移动端素材的模块：有桌面图却未配移动图时移动端会复用并可能裁切。 */
const MOBILE_IMAGE_TYPES = new Set([
  "首屏主视觉",
  "单图海报",
  "全屏出血图",
  "热区图",
]);

function needsMobileImage(item: {
  type: string;
  props: Record<string, any>;
}) {
  return (
    MOBILE_IMAGE_TYPES.has(item.type) &&
    Boolean(item.props?.desktopImage || item.props?.image) &&
    !item.props?.mobileImage
  );
}

export default function LayerRail({
  onSaveAsTemplate,
  navigationPreviewOpen,
  onToggleNavigationPreview,
  scrollSpyIndex,
}: {
  onSaveAsTemplate: (type: string, props: Record<string, any>) => void;
  navigationPreviewOpen: boolean;
  onToggleNavigationPreview: () => void;
  scrollSpyIndex: number | null;
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

  const selectLayer = (index: number) => {
    dispatch({
      type: "setUi",
      ui: { itemSelector: { index, zone: ROOT_ZONE } },
    });
    focusCanvasBlock(content[index]?.props?.id);
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
      dispatch({ type: "setData", data: { ...appData, content: next } });
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
        dispatch({ type: "setData", data: { ...appData, content: nextContent } });
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
    dispatch({ type: "setData", data: { ...appData, content: nextContent } });
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
          >
            <span>页面导航栏</span>
          </button>
        </div>
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
          const multiSelected = multiIndices.includes(index);
          return (
            <div
              key={item.props?.id ?? `${item.type}-${index}`}
              data-layer-index={index}
              className={`homepage-editor__layer-item${active ? " is-active" : ""}${multiSelected ? " is-multi-selected" : ""}${draggingIndex === index ? " is-dragging" : ""}${dropIndex === index ? " is-drop-target" : ""}`}
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
              >
                <span>{numberedNames[index]}</span>
                {needsMobileImage(item) && (
                  <span
                    className="homepage-editor__layer-mobile-hint"
                    title="未上传移动端图片，移动端将复用桌面图并可能裁切"
                  >
                    缺移动图
                  </span>
                )}
                <DragOutlined />
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
