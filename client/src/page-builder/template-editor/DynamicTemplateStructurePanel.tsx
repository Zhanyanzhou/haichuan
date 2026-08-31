import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  BlockOutlined,
  CopyOutlined,
  DeleteOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  MoreOutlined,
} from "@ant-design/icons";
import { App as AntdApp, Dropdown } from "antd";
import { useState, type DragEvent, type KeyboardEvent } from "react";
import {
  duplicateDynamicTemplateNode,
  getDynamicTemplateNodeRegistryEntry,
  moveDynamicTemplateNode,
  removeDynamicTemplateNode,
  reorderDynamicTemplateNode,
  setDynamicTemplateNodeHidden,
  type TemplateDefinitionV2,
} from "../template-definition";
import WorkspaceTreeRow from "../workspace/WorkspaceTreeRow";
import WorkspacePanelHeader from "../workspace/WorkspacePanelHeader";
import WorkspacePanelCollapseButton from "../workspace/WorkspacePanelCollapseButton";
import { findDynamicTemplateParentId } from "./dynamicTemplateEditorUtils";
import { DynamicTemplateNodePalette } from "./DynamicTemplateToolbox";
import { useTemplateEditorSession } from "./templateEditorSession";
import { getContentTemplateContract } from "../generated/contentTemplates.generated";
import {
  isMatureContentTemplateSlotType,
  MATURE_CONTENT_TEMPLATE_MODULE_BY_SLOT_TYPE,
} from "../template-definition/validateTemplateDefinition";

function DynamicTreeNode({
  definition,
  nodeId,
  depth,
  selectedNodeId,
  selectedContractRole,
  collapsedNodeIds,
  onSelect,
  onSelectRole,
  onAction,
  onToggleCollapse,
  onDropNode,
}: {
  definition: TemplateDefinitionV2;
  nodeId: string;
  depth: number;
  selectedNodeId: string | null;
  selectedContractRole: { nodeId: string; roleId: string } | null;
  collapsedNodeIds: ReadonlySet<string>;
  onSelect: (nodeId: string) => void;
  onSelectRole: (nodeId: string, roleId: string) => void;
  onAction: (action: "up" | "down" | "duplicate" | "toggle" | "delete", nodeId: string) => void;
  onToggleCollapse: (nodeId: string) => void;
  onDropNode: (
    draggedNodeId: string,
    targetNodeId: string,
    placement: "before" | "inside" | "after",
  ) => void;
}) {
  const node = definition.nodes[nodeId];
  if (!node) return null;
  const entry = getDynamicTemplateNodeRegistryEntry(node.type);
  const selected = selectedNodeId === nodeId;
  const parentId = findDynamicTemplateParentId(definition, nodeId);
  const siblings = parentId ? definition.nodes[parentId]?.childIds ?? [] : [];
  const siblingIndex = siblings.indexOf(nodeId);
  const isRoot = nodeId === definition.rootNodeId;
  const hasChildren = node.childIds.length > 0;
  const collapsed = collapsedNodeIds.has(nodeId);
  const slot = node.slotId ? definition.slots[node.slotId] : undefined;
  const matureContract = slot && isMatureContentTemplateSlotType(slot.type)
    ? getContentTemplateContract(MATURE_CONTENT_TEMPLATE_MODULE_BY_SLOT_TYPE[slot.type])
    : undefined;

  const handleTreeKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!hasChildren) return;
    if (event.key === "ArrowRight" && collapsed) {
      event.preventDefault();
      onToggleCollapse(nodeId);
    }
    if (event.key === "ArrowLeft" && !collapsed) {
      event.preventDefault();
      onToggleCollapse(nodeId);
    }
  };

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const draggedNodeId = event.dataTransfer.getData("application/x-haichuan-template-node");
    if (!draggedNodeId || draggedNodeId === nodeId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const progress = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5;
    const placement = progress < 0.25 ? "before" : progress > 0.75 ? "after" : "inside";
    onDropNode(draggedNodeId, nodeId, placement);
  };

  return (
    <li role="none">
      <WorkspaceTreeRow
        rowClassName="template-editor__dynamic-tree-row"
        buttonClassName="template-editor__dynamic-tree-select"
        selected={selected}
        hidden={node.hidden}
        buttonProps={{
          role: "treeitem",
          "aria-selected": selected,
          "aria-level": depth + 1,
          "aria-expanded": hasChildren ? !collapsed : undefined,
          draggable: !isRoot,
          style: { paddingInlineStart: 10 + depth * 14 },
          onClick: (event) => {
            if ((event.target as HTMLElement).closest("[data-template-tree-toggle]")) {
              onToggleCollapse(nodeId);
              return;
            }
            onSelect(nodeId);
          },
          onDoubleClick: () => { if (hasChildren) onToggleCollapse(nodeId); },
          onKeyDown: handleTreeKeyDown,
          onDragStart: (event) => {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("application/x-haichuan-template-node", nodeId);
          },
          onDragOver: (event) => {
            if (event.dataTransfer.types.includes("application/x-haichuan-template-node")) {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }
          },
          onDrop: handleDrop,
        }}
        actions={selected && !isRoot ? (
          <Dropdown
            trigger={["click"]}
            menu={{
              items: [
                { key: "up", icon: <ArrowUpOutlined />, label: "上移", disabled: siblingIndex <= 0 },
                { key: "down", icon: <ArrowDownOutlined />, label: "下移", disabled: siblingIndex < 0 || siblingIndex >= siblings.length - 1 },
                { key: "duplicate", icon: <CopyOutlined />, label: "复制" },
                { key: "toggle", icon: node.hidden ? <EyeOutlined /> : <EyeInvisibleOutlined />, label: node.hidden ? "显示" : "隐藏" },
                { type: "divider" },
                { key: "delete", icon: <DeleteOutlined />, label: "删除", danger: true },
              ],
              onClick: ({ key }) => {
                if (key === "up" || key === "down" || key === "duplicate" || key === "toggle" || key === "delete") {
                  onAction(key, nodeId);
                }
              },
            }}
          >
            <button
              type="button"
              className="template-editor__dynamic-tree-menu"
              aria-label={`${node.name}节点操作`}
              onClick={(event) => event.stopPropagation()}
            >
              <MoreOutlined />
            </button>
          </Dropdown>
        ) : null}
      >
          <span data-template-tree-toggle aria-hidden="true">
            {hasChildren ? collapsed ? "▸" : "▾" : entry.kind === "slot" ? "◇" : depth === 0 ? "▦" : "└"}
          </span>
          <strong>{node.name}</strong>
          <small>{entry.label}{slot?.required ? " · 必填" : ""}{node.hidden ? " · 已隐藏" : ""}</small>
      </WorkspaceTreeRow>
      {hasChildren && !collapsed ? (
        <ul role="group">
          {node.childIds.map((childId) => (
            <DynamicTreeNode
              key={childId}
              definition={definition}
              nodeId={childId}
              depth={depth + 1}
              selectedNodeId={selectedNodeId}
              selectedContractRole={selectedContractRole}
              collapsedNodeIds={collapsedNodeIds}
              onSelect={onSelect}
              onSelectRole={onSelectRole}
              onAction={onAction}
              onToggleCollapse={onToggleCollapse}
              onDropNode={onDropNode}
            />
          ))}
        </ul>
      ) : null}
      {matureContract && !collapsed ? (
        <ul role="group" aria-label={`${node.name}内部图层`}>
          {matureContract.editorCapabilities.editableObjects.map((object) => {
            const role = matureContract.roles.find((candidate) => candidate.id === object.roleId);
            const roleSelected = selectedContractRole?.nodeId === nodeId
              && selectedContractRole.roleId === object.roleId;
            const kindLabel = {
              media: "图片",
              video: "视频",
              text: "文字",
              action: "行动",
              product: "商品",
              collection: "集合",
            }[object.kind];
            return (
              <li role="none" key={object.roleId}>
                <WorkspaceTreeRow
                  rowClassName="template-editor__dynamic-tree-row is-contract-role"
                  buttonClassName="template-editor__dynamic-tree-select"
                  selected={roleSelected}
                  buttonProps={{
                    role: "treeitem",
                    "aria-selected": roleSelected,
                    "aria-level": depth + 2,
                    style: { paddingInlineStart: 24 + depth * 14 },
                    onClick: () => onSelectRole(nodeId, object.roleId),
                  }}
                >
                  <span aria-hidden="true">◇</span>
                  <strong>{role?.semantic ?? object.roleId}</strong>
                  <small>{kindLabel}</small>
                </WorkspaceTreeRow>
              </li>
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}

export default function DynamicTemplateStructurePanel({
  onCollapse,
}: {
  onCollapse?: () => void;
}) {
  const { message, modal } = AntdApp.useApp();
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(() => new Set());
  const draft = useTemplateEditorSession((state) => state.draft);
  const selectedNodeId = useTemplateEditorSession((state) => state.selectedObjectId);
  const selectedContractRole = useTemplateEditorSession((state) => state.selectedContractRole);
  const selectObject = useTemplateEditorSession((state) => state.selectObject);
  const selectContractRole = useTemplateEditorSession((state) => state.selectContractRole);
  const setDynamicDefinition = useTemplateEditorSession((state) => state.setDynamicDefinition);
  if (!draft) return null;

  const toggleCollapse = (nodeId: string) => {
    setCollapsedNodeIds((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const performDrop = (
    draggedNodeId: string,
    targetNodeId: string,
    placement: "before" | "inside" | "after",
  ) => {
    const currentDraft = useTemplateEditorSession.getState().draft;
    if (!currentDraft) return;
    const definition = currentDraft.definition;
    if (draggedNodeId === definition.rootNodeId || draggedNodeId === targetNodeId) return;

    try {
      let nextDefinition: TemplateDefinitionV2;
      let expandedNodeId: string;
      if (placement === "inside") {
        nextDefinition = moveDynamicTemplateNode(definition, draggedNodeId, targetNodeId);
        expandedNodeId = targetNodeId;
      } else {
        const targetParentId = findDynamicTemplateParentId(definition, targetNodeId);
        if (!targetParentId) {
          message.warning("模板根节点前后不能放置其他节点。");
          return;
        }
        const targetSiblings = definition.nodes[targetParentId]?.childIds ?? [];
        const targetIndex = targetSiblings.indexOf(targetNodeId);
        const currentParentId = findDynamicTemplateParentId(definition, draggedNodeId);
        const currentIndex = currentParentId
          ? definition.nodes[currentParentId]?.childIds.indexOf(draggedNodeId) ?? -1
          : -1;
        let insertionIndex = targetIndex + (placement === "after" ? 1 : 0);
        if (currentParentId === targetParentId && currentIndex >= 0 && currentIndex < insertionIndex) {
          insertionIndex -= 1;
        }
        nextDefinition = moveDynamicTemplateNode(
          definition,
          draggedNodeId,
          targetParentId,
          insertionIndex,
        );
        expandedNodeId = targetParentId;
      }
      setDynamicDefinition(nextDefinition);
      selectObject(draggedNodeId);
      setCollapsedNodeIds((current) => {
        if (!current.has(expandedNodeId)) return current;
        const next = new Set(current);
        next.delete(expandedNodeId);
        return next;
      });
    } catch (error) {
      message.error(error instanceof Error ? error.message : "节点移动失败");
    }
  };

  const performAction = (
    action: "up" | "down" | "duplicate" | "toggle" | "delete",
    nodeId: string,
  ) => {
    const draft = useTemplateEditorSession.getState().draft;
    if (!draft) return;
    const node = draft.definition.nodes[nodeId];
    if (!node) return;
    const apply = () => {
      try {
        if (action === "duplicate") {
          const result = duplicateDynamicTemplateNode(draft.definition, nodeId);
          setDynamicDefinition(result.definition);
          selectObject(result.nodeId);
          return;
        }
        if (action === "toggle") {
          setDynamicDefinition(setDynamicTemplateNodeHidden(draft.definition, nodeId, !node.hidden));
          return;
        }
        if (action === "delete") {
          setDynamicDefinition(removeDynamicTemplateNode(draft.definition, nodeId));
          selectObject(findDynamicTemplateParentId(draft.definition, nodeId));
          return;
        }
        const parentId = findDynamicTemplateParentId(draft.definition, nodeId);
        if (!parentId) return;
        const siblings = draft.definition.nodes[parentId].childIds;
        const currentIndex = siblings.indexOf(nodeId);
        setDynamicDefinition(reorderDynamicTemplateNode(
          draft.definition,
          nodeId,
          action === "up" ? currentIndex - 1 : currentIndex + 1,
        ));
      } catch (error) {
        message.error(error instanceof Error ? error.message : "节点操作失败");
      }
    };
    if (action !== "delete") {
      apply();
      return;
    }
    modal.confirm({
      title: `删除“${node.name}”及其子节点？`,
      content: "该操作只修改当前未保存模板草稿，仍可使用模板撤销恢复。",
      okText: "删除节点",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: apply,
    });
  };

  return (
    <aside className="homepage-editor__structure-workspace template-editor__structure" aria-label="模板结构">
      <WorkspacePanelHeader
        icon={<BlockOutlined />}
        title="模板结构"
        actions={onCollapse ? (
          <WorkspacePanelCollapseButton
            action="collapse"
            panel="structure"
            panelLabel="模板结构面板"
            onClick={onCollapse}
          />
        ) : undefined}
      />
      <div className="template-editor__structure-scroll">
        <div className="template-editor__structure-section-label">
          <strong>模板图层</strong>
          <span>选择、排序和组织模板内部节点</span>
        </div>
        <div className="template-editor__structure-tree template-editor__dynamic-tree">
          <ul role="tree" aria-label="模板节点树">
            <DynamicTreeNode
              definition={draft.definition}
              nodeId={draft.definition.rootNodeId}
              depth={0}
              selectedNodeId={selectedNodeId}
              selectedContractRole={selectedContractRole}
              collapsedNodeIds={collapsedNodeIds}
              onSelect={selectObject}
              onSelectRole={selectContractRole}
              onAction={performAction}
              onToggleCollapse={toggleCollapse}
              onDropNode={performDrop}
            />
          </ul>
        </div>
        <DynamicTemplateNodePalette />
      </div>
      <p className="template-editor__structure-note">
        拖动图层可调整顺序或父子关系；精确内容和布局在画布或右侧模板属性中修改。
      </p>
    </aside>
  );
}
