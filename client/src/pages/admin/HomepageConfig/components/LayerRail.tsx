/**
 * LayerRail.tsx — 编辑器右侧的页面图层栏。
 * 支持点选定位、拖拽排序；锁定模块（固定业务区）不可调整。
 * 底部渲染页面节奏提示(软约束,不阻断发布)。
 * （自 index.tsx 平移，逻辑零变更）
 */
import { useState } from "react";
import { message, Modal } from "antd";
import { DragOutlined } from "@ant-design/icons";
import { ROOT_ZONE, focusCanvasBlock, useHomepagePuck } from "../editor-store";
import { getModuleDisplayName } from "../editor-utils";
import type { RhythmHint } from "@/page-builder/designSystem/rhythm";

export default function LayerRail({
  rhythmHints = [],
  onSaveAsTemplate,
  navigationPreviewOpen,
  onToggleNavigationPreview,
}: {
  rhythmHints?: RhythmHint[];
  onSaveAsTemplate: (type: string, props: Record<string, any>) => void;
  navigationPreviewOpen: boolean;
  onToggleNavigationPreview: () => void;
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

  const selectLayer = (index: number) => {
    dispatch({
      type: "setUi",
      ui: { itemSelector: { index, zone: ROOT_ZONE } },
    });
    focusCanvasBlock(content[index]?.props?.id);
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

  const removeLayer = (index: number) => {
    const item = content[index];
    if (item.props?.locked) {
      message.info("此模块已锁定，不能删除");
      return;
    }
    Modal.confirm({
      title: `删除“${getModuleDisplayName(item.type, item.props)}”？`,
      content: "删除后可从模块库重新添加；尚未发布的修改可通过版本记录恢复。",
      okText: "删除模块",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: () => {
        const nextContent = content.filter(
          (_, itemIndex) => itemIndex !== index,
        );
        dispatch({
          type: "setData",
          data: { ...appData, content: nextContent },
        });
        dispatch({ type: "setUi", ui: { itemSelector: null } });
      },
    });
  };

  const toggleLayerVisibility = (index: number) => {
    const nextContent = [...content];
    const item = nextContent[index];
    nextContent[index] = {
      ...item,
      props: { ...item.props, isVisible: item.props?.isVisible === false },
    };
    dispatch({ type: "setData", data: { ...appData, content: nextContent } });
    selectLayer(index);
  };

  return (
    <section className="homepage-editor__layer-rail" aria-label="页面图层">
      <div className="homepage-editor__layer-scroll">
        <div className="homepage-editor__layer-frame homepage-editor__layer-global">
          <button
            type="button"
            onClick={onToggleNavigationPreview}
            aria-pressed={navigationPreviewOpen}
          >
            <span>页面导航栏</span>
          </button>
        </div>
        {content.map((item, index) => {
          const active = item.props?.id === selectedId;
          return (
            <div
              key={item.props?.id ?? `${item.type}-${index}`}
              className={`homepage-editor__layer-item${active ? " is-active" : ""}${draggingIndex === index ? " is-dragging" : ""}${dropIndex === index ? " is-drop-target" : ""}`}
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
                onClick={() => selectLayer(index)}
              >
                <span>{getModuleDisplayName(item.type, item.props)}</span>
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
        {rhythmHints.length > 0 && (
          <div
            className="homepage-editor__layer-rhythm"
            aria-label="页面节奏提示"
            style={{
              margin: "12px 0 4px",
              padding: "10px 12px",
              border: "1px solid #E7DFCF",
              background: "#FCF9F2",
              fontSize: 11,
              lineHeight: 1.7,
              color: "#6F6250",
            }}
          >
            <p style={{ margin: "0 0 6px", color: "#9A792E", fontWeight: 500 }}>
              页面节奏提示
            </p>
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {rhythmHints.slice(0, 6).map((hint, hintIndex, list) => (
                <li
                  key={hint.message}
                  style={{
                    marginBottom: hintIndex === list.length - 1 ? 0 : 6,
                    color: hint.level === "warn" ? "#A24324" : undefined,
                  }}
                >
                  {hint.message}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
