/**
 * LayerRail.tsx — 编辑器第二栏的页面结构导航。
 * 2026-08-16 升级：同类型模块自动序号（品牌故事 1/2）；Shift/Ctrl 多选批量删除与移动。
 * 固定业务区不可删除/调整；点选定位、拖拽排序保持原有行为。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { App as AntdApp } from "antd";
import { useGetPuck } from "@puckeditor/core";
import {
  DeleteOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  HolderOutlined,
  LockOutlined,
} from "@ant-design/icons";

const PAGE_MODULE_DELETE_RECOVERY_COPY =
  "确认后，当前编辑会话中可用顶部“撤销”恢复；刷新或离开编辑会话后，不能依靠撤销找回。发布历史只包含已发布快照；从未发布的模块内容无法从发布历史恢复。";
import { ROOT_ZONE, focusCanvasBlock, useHomepagePuck } from "../editor-store";
import { getModuleDisplayName } from "../editor-utils";
import type { PuckProps } from "@/page-builder/types";
import { getContentTemplateContract } from "@/page-builder/generated/contentTemplates.generated";
import { resolveVisualNode } from "@/page-builder/runtime/visualLayout";
import { getTemplateContractNodeLabel } from "@/page-builder/runtime/contentTemplateRolePresentation";
import { useVisualEditorSession } from "@/page-builder/visual-editor/visualEditorSession";
import WorkspaceTreeRow from "@/page-builder/workspace/WorkspaceTreeRow";
import {
  commitPageModuleStructureTransaction,
  deletePageModules,
  reorderPageModules,
  type PageModuleData,
} from "./pageModuleActions";

const INTERNAL_OBJECT_LABELS: Record<string, string> = {
  desktopImage: "桌面主图",
  mobileImage: "移动端主图",
  image: "主图",
  mainImage: "主海报",
  detailImage: "细节海报",
  copy: "文案",
  title: "标题",
  action: "行动入口",
  video: "视频",
  product: "商品作品",
  collection: "内容集合",
};

const LAYER_SUMMARY_KEYS = [
  "title",
  "heading",
  "eyebrow",
  "subtitle",
  "description",
  "text",
] as const;

function normalizeLayerSummary(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length > 28 ? `${normalized.slice(0, 28)}…` : normalized;
}

function getLayerContentSummary(props: PuckProps) {
  for (const key of LAYER_SUMMARY_KEYS) {
    const summary = normalizeLayerSummary(props[key]);
    if (summary) return summary;
  }
  const contentBySlotId = props.contentBySlotId;
  if (!contentBySlotId || typeof contentBySlotId !== "object" || Array.isArray(contentBySlotId)) {
    return null;
  }
  for (const value of Object.values(contentBySlotId)) {
    const directSummary = normalizeLayerSummary(value);
    if (directSummary) return directSummary;
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const record = value as Record<string, unknown>;
    for (const key of ["title", "label", "alt", "description"] as const) {
      const nestedSummary = normalizeLayerSummary(record[key]);
      if (nestedSummary) return nestedSummary;
    }
  }
  return null;
}

export default function LayerRail({
  navigationPreviewOpen,
  onToggleNavigationPreview,
  scrollSpyIndex,
  readOnly = false,
}: {
  navigationPreviewOpen: boolean;
  onToggleNavigationPreview: () => void;
  scrollSpyIndex: number | null;
  readOnly?: boolean;
}) {
  const { message, modal } = AntdApp.useApp();
  const getPuck = useGetPuck();
  const appData = useHomepagePuck((state) => state.appState.data);
  const dispatch = useHomepagePuck((state) => state.dispatch);
  const selectedItem = useHomepagePuck((state) => state.selectedItem);
  const selectedId = selectedItem?.props?.id;
  const currentViewport = useHomepagePuck((state) => state.appState.ui.viewports.current);
  const panelMode = useVisualEditorSession((state) => state.panelMode);
  const visualSelection = useVisualEditorSession((state) => state.selection);
  const selectVisualNode = useVisualEditorSession((state) => state.selectNode);
  const content = appData.content as PageModuleData[];
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
  const pageLayerScrollTopRef = useRef(0);
  const wasShowingInternalLayersRef = useRef(false);
  const selectedContract = selectedItem?.type
    ? getContentTemplateContract(selectedItem.type)
    : undefined;
  const showInternalLayers = panelMode === "design" && Boolean(
    selectedContract && selectedId,
  );
  const inspectorViewport = typeof currentViewport.width === "number" && currentViewport.width <= 767
    ? "mobile" as const
    : "desktop" as const;
  useEffect(() => {
    if (!showInternalLayers && wasShowingInternalLayersRef.current) {
      window.requestAnimationFrame(() => {
        if (layerScrollRef.current) {
          layerScrollRef.current.scrollTop = pageLayerScrollTopRef.current;
        }
      });
    }
    wasShowingInternalLayersRef.current = showInternalLayers;
  }, [showInternalLayers]);

  // 画布滚动时，让图层列表自动滚动到当前可见模块（仅滚动，不改选中态）。
  useEffect(() => {
    if (scrollSpyIndex === null) return;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    layerScrollRef.current
      ?.querySelector<HTMLElement>(`[data-layer-index="${scrollSpyIndex}"]`)
      ?.scrollIntoView({
        block: "nearest",
        behavior: reduceMotion ? "auto" : "smooth",
      });
  }, [scrollSpyIndex]);

  const multiActive = multiIndices.length >= 2;

  const selectLayer = (index: number) => {
    const targetId = content[index]?.props?.id;
    if (targetId !== selectedId) {
      dispatch({
        type: "setUi",
        ui: { itemSelector: { index, zone: ROOT_ZONE } },
      });
    }
    focusCanvasBlock(typeof targetId === "string" ? targetId : undefined);
  };

  const handleLayerClick = (index: number, event: React.MouseEvent) => {
    if (!readOnly && (event.shiftKey || event.ctrlKey || event.metaKey)) {
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
    if (readOnly) return;
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
      commitPageModuleStructureTransaction(
        getPuck,
        (data) => ({ ...data, content: next }),
      );
      setMultiIndices((prev) => prev.map((i) => i + direction));
    }
  };

  const batchDelete = () => {
    if (readOnly) return;
    const deletable = multiIndices.filter((i) => !content[i]?.props?.locked);
    if (deletable.length === 0) {
      message.info("所选模块均为固定业务区，不能删除");
      return;
    }
    modal.confirm({
      title: `删除 ${deletable.length} 个模块？`,
      content: PAGE_MODULE_DELETE_RECOVERY_COPY,
      okText: "删除模块",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: () => {
        deletePageModules(getPuck, deletable);
        setMultiIndices([]);
        anchorRef.current = null;
      },
    });
  };

  const reorderLayer = (from: number, to: number) => {
    if (readOnly) return;
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
    const movedBlockId = content[from]?.props?.id;
    reorderPageModules(getPuck, from, to);
    focusCanvasBlock(typeof movedBlockId === "string" ? movedBlockId : undefined);
  };

  const toggleLayerVisibility = (index: number) => {
    if (readOnly) return;
    const target = content[index];
    if (!target || target.props?.locked) return;
    const nextVisible = target.props?.isVisible === false;
    dispatch({
      type: "replace",
      destinationIndex: index,
      destinationZone: ROOT_ZONE,
      data: {
        ...target,
        props: {
          ...target.props,
          id: String(target.props.id),
          isVisible: nextVisible,
        },
      },
      recordHistory: true,
    });
    message.success(`${nextVisible ? "已显示" : "已隐藏"}「${numberedNames[index]}」`);
  };

  const deleteLayer = (index: number) => {
    if (readOnly) return;
    const target = content[index];
    if (!target || target.props?.locked) return;
    modal.confirm({
      title: `删除“${numberedNames[index]}”？`,
      content: PAGE_MODULE_DELETE_RECOVERY_COPY,
      okText: "删除模块",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: () => {
        deletePageModules(getPuck, [index]);
      },
    });
  };

  if (showInternalLayers && selectedContract && selectedItem && selectedId) {
    return (
      <section className="homepage-editor__layer-rail" aria-label="模板内部对象">
        <div className="homepage-editor__layer-scroll" ref={layerScrollRef}>
          <div className="homepage-editor__layer-frame homepage-editor__layer-global">
            <span>模板内部对象</span>
            <LockOutlined title="固定对象，仅可选择" aria-label="固定对象，仅可选择" />
          </div>
          {selectedContract.editorCapabilities.editableObjects.map((object) => {
            const nodeIds = object.nodeIds?.length ? object.nodeIds : [object.roleId];
            const selectedNodeId = visualSelection?.blockId === selectedId &&
              nodeIds.includes(visualSelection.nodeId)
              ? visualSelection.nodeId
              : nodeIds[0];
            const enabled = resolveVisualNode(
              selectedItem.props as PuckProps,
              selectedNodeId,
              inspectorViewport,
            ).enabled !== false;
            const active = visualSelection?.blockId === selectedId &&
              nodeIds.includes(visualSelection.nodeId);
            const kind = object.kind === "video"
              ? "media" as const
              : object.kind === "collection"
                ? "structured" as const
                : object.kind;
            return (
              <WorkspaceTreeRow
                key={object.roleId}
                rowClassName="homepage-editor__layer-item"
                selected={active}
                hidden={!enabled}
                rowProps={{
                  "data-template-object": object.roleId,
                  "data-layer-visible": enabled ? "true" : "false",
                }}
                buttonClassName="homepage-editor__layer-select"
                buttonProps={{
                  "aria-pressed": active,
                  onClick: () => selectVisualNode({
                    blockId: String(selectedId),
                    moduleType: selectedItem.type,
                    nodeId: selectedNodeId,
                    kind,
                  }),
                }}
              >
                <span className="homepage-editor__layer-name">
                  {INTERNAL_OBJECT_LABELS[object.roleId] ?? getTemplateContractNodeLabel(object.roleId)}
                </span>
                {!enabled ? <EyeInvisibleOutlined aria-label="当前隐藏" /> : null}
              </WorkspaceTreeRow>
            );
          })}
          <p className="homepage-editor__layer-empty">
            此处仅用于选择固定对象；移动、缩放和层级调整请在主画布或属性面板完成。
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="homepage-editor__layer-rail">
      <div
        className="homepage-editor__layer-scroll"
        ref={layerScrollRef}
        onScroll={(event) => {
          pageLayerScrollTopRef.current = event.currentTarget.scrollTop;
        }}
      >
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
        {multiActive && !readOnly && (
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
          const visible = item.props?.isVisible !== false;
          const contentSummary = getLayerContentSummary(item.props);
          return (
            <WorkspaceTreeRow
              key={typeof item.props?.id === "string" || typeof item.props?.id === "number"
                ? item.props.id
                : `${item.type}-${index}`}
              rowClassName={`homepage-editor__layer-item${inView ? " is-in-view" : ""}${multiSelected ? " is-multi-selected" : ""}${draggingIndex === index ? " is-dragging" : ""}${dropIndex === index ? " is-drop-target" : ""}`}
              selected={active}
              hidden={!visible}
              rowProps={{
                "data-layer-index": index,
                "data-layer-id": item.props?.id == null ? undefined : String(item.props.id),
                "data-layer-visible": visible ? "true" : "false",
                draggable: !readOnly && !item.props?.locked,
                onDragStart: (event) => {
                  if (readOnly || item.props?.locked) return;
                  event.dataTransfer.effectAllowed = "move";
                  setDraggingIndex(index);
                },
                onDragOver: (event) => {
                  if (readOnly) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDropIndex(index);
                },
                onDrop: (event) => {
                  if (readOnly) return;
                  event.preventDefault();
                  if (draggingIndex !== null) reorderLayer(draggingIndex, index);
                  setDraggingIndex(null);
                  setDropIndex(null);
                },
                onDragEnd: () => {
                  setDraggingIndex(null);
                  setDropIndex(null);
                },
              }}
              buttonClassName="homepage-editor__layer-select"
              buttonProps={{
                onClick: (event) => handleLayerClick(index, event),
                "aria-current": inView ? "location" : undefined,
                "aria-label": numberedNames[index],
              }}
              actions={!readOnly && !item.props?.locked ? (
                <div
                  className="homepage-editor__layer-actions"
                  role="group"
                  aria-label={`${numberedNames[index]}图层操作`}
                >
                  <button
                    type="button"
                    draggable={false}
                    onClick={() => toggleLayerVisibility(index)}
                    aria-label={`${visible ? "隐藏" : "显示"}${numberedNames[index]}`}
                    title={visible ? "隐藏模块" : "显示模块"}
                  >
                    {visible ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                  </button>
                  <button
                    type="button"
                    draggable={false}
                    className="is-danger"
                    onClick={() => deleteLayer(index)}
                    aria-label={`删除${numberedNames[index]}`}
                    title="删除模块"
                  >
                    <DeleteOutlined />
                  </button>
                </div>
              ) : null}
            >
              <span className="homepage-editor__layer-copy">
                <span className="homepage-editor__layer-name">
                  {numberedNames[index]}
                </span>
                {contentSummary ? (
                  <small className="homepage-editor__layer-summary" aria-hidden="true">
                    {contentSummary}
                  </small>
                ) : null}
              </span>
              <HolderOutlined
                className="homepage-editor__layer-grip"
                title="拖动调整顺序"
                aria-label="拖动调整顺序"
              />
            </WorkspaceTreeRow>
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
