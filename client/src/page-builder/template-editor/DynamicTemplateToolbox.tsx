import { App as AntdApp } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import {
  addDynamicTemplateNode,
  DYNAMIC_TEMPLATE_CONTENT_NODE_TYPES,
  DYNAMIC_TEMPLATE_STRUCTURE_NODE_TYPES,
  getDynamicTemplateNodeRegistryEntry,
  type DynamicTemplateNodeType,
} from "../template-definition";
import { findDynamicTemplateInsertionParentId } from "./dynamicTemplateEditorUtils";
import { useTemplateEditorSession } from "./templateEditorSession";

function NodeToolGroup({
  title,
  types,
  onAdd,
  canAdd,
}: {
  title: string;
  types: readonly DynamicTemplateNodeType[];
  onAdd: (type: DynamicTemplateNodeType) => void;
  canAdd: (type: DynamicTemplateNodeType) => boolean;
}) {
  return (
    <section>
      <h3>{title}</h3>
      <div className="template-editor__node-tools">
        {types.map((type) => {
          const entry = getDynamicTemplateNodeRegistryEntry(type);
          const enabled = canAdd(type);
          return (
            <button
              key={type}
              type="button"
              disabled={!enabled}
              aria-label={`${entry.label} ${entry.kind === "slot" ? "内容槽位" : "结构节点"}`}
              title={enabled ? `添加${entry.label}` : `当前位置不能添加${entry.label}`}
              onClick={() => onAdd(type)}
            >
              <span aria-hidden="true">{entry.kind === "slot" ? "◇" : "▦"}</span>
              <strong>{entry.label}</strong>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function DynamicTemplateNodePalette() {
  const { message } = AntdApp.useApp();
  const draft = useTemplateEditorSession((state) => state.draft);
  const selectedNodeId = useTemplateEditorSession((state) => state.selectedObjectId);
  const setDynamicDefinition = useTemplateEditorSession((state) => state.setDynamicDefinition);
  const selectObject = useTemplateEditorSession((state) => state.selectObject);
  if (!draft) return null;

  const addNode = (type: DynamicTemplateNodeType) => {
    const parentId = findDynamicTemplateInsertionParentId(
      draft.definition,
      selectedNodeId,
      type,
    );
    if (!parentId) {
      message.warning("当前选中位置不能容纳该节点，请先选择合适的结构容器");
      return;
    }
    try {
      const result = addDynamicTemplateNode(draft.definition, parentId, type);
      setDynamicDefinition(result.definition);
      selectObject(result.nodeId);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "节点添加失败");
    }
  };
  const canAddNode = (type: DynamicTemplateNodeType) => Boolean(
    findDynamicTemplateInsertionParentId(draft.definition, selectedNodeId, type),
  );
  const contentGroups: Array<{ title: string; types: DynamicTemplateNodeType[] }> = [
    { title: "媒体", types: DYNAMIC_TEMPLATE_CONTENT_NODE_TYPES.filter((type) => ["ImageSlot", "Video", "Carousel", "Hotspot", "BeforeAfter"].includes(type)) },
    { title: "文字", types: DYNAMIC_TEMPLATE_CONTENT_NODE_TYPES.filter((type) => ["HeadingSlot", "TextSlot", "RichTextSlot", "BadgeSlot", "IconSlot"].includes(type)) },
    { title: "行动", types: DYNAMIC_TEMPLATE_CONTENT_NODE_TYPES.filter((type) => ["ButtonSlot", "LinkSlot", "Appointment"].includes(type)) },
    { title: "业务组件", types: DYNAMIC_TEMPLATE_CONTENT_NODE_TYPES.filter((type) => !["ImageSlot", "Video", "Carousel", "Hotspot", "BeforeAfter", "HeadingSlot", "TextSlot", "RichTextSlot", "BadgeSlot", "IconSlot", "ButtonSlot", "LinkSlot", "Appointment"].includes(type)) },
  ];

  return (
    <div className="template-editor__dynamic-node-palette" aria-label="模板结构工具">
      <details>
        <summary><PlusOutlined /> 添加模板节点</summary>
        <div className="template-editor__node-palette-content">
          <NodeToolGroup
            title="结构与布局"
            types={DYNAMIC_TEMPLATE_STRUCTURE_NODE_TYPES.filter((type) => type !== "Section")}
            onAdd={addNode}
            canAdd={canAddNode}
          />
          {contentGroups.map((group) => (
            <NodeToolGroup key={group.title} title={group.title} types={group.types} onAdd={addNode} canAdd={canAddNode} />
          ))}
        </div>
      </details>
    </div>
  );
}
