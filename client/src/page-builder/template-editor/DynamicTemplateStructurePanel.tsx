import {
  AppstoreOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
  BlockOutlined,
  CheckCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  DownOutlined,
  ExclamationCircleOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  FontSizeOutlined,
  HolderOutlined,
  LinkOutlined,
  LockOutlined,
  MoreOutlined,
  PictureOutlined,
  RightOutlined,
  ShoppingOutlined,
  UnlockOutlined,
  VideoCameraOutlined,
} from "@ant-design/icons";
import { App as AntdApp, Dropdown } from "antd";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import {
  addDynamicTemplateNode,
  canNestDynamicTemplateNode,
  duplicateDynamicTemplateNode,
  getDynamicTemplateNodeRegistryEntry,
  isDynamicTemplateStructureLocked,
  isDynamicTemplateStructureProtected,
  moveDynamicTemplateNode,
  removeDynamicTemplateNode,
  reorderDynamicTemplateNode,
  setDynamicTemplateNodeHidden,
  setDynamicTemplateNodeStructureLocked,
  type TemplateDefinitionV2,
} from "../template-definition";
import { getContentTemplateContract } from "../generated/contentTemplates.generated";
import {
  getContentTemplateModuleTypeForSlotType,
} from "../template-definition/validateTemplateDefinition";
import { resolveVisualNode, setVisualOverridePath } from "../runtime/visualLayout";
import WorkspacePanelCollapseButton from "../workspace/WorkspacePanelCollapseButton";
import WorkspacePanelHeader from "../workspace/WorkspacePanelHeader";
import {
  findDynamicTemplateParentId,
  getDynamicTemplateRegionDisplayName,
} from "./dynamicTemplateEditorUtils";
import { DynamicTemplateNodePalette } from "./DynamicTemplateToolbox";
import {
  getTemplateContractRoleLabel,
  TEMPLATE_CONTRACT_KIND_LABELS,
} from "./contractRolePresentation";
import { resolveTemplatePreviewViewport } from "./templatePreviewModel";
import {
  buildTemplateStructureAudit,
  type TemplateStructureIssue,
} from "./templateStructureAudit";
import { useTemplateEditorSession } from "./templateEditorSession";
import { TEMPLATE_NODE_NAME_MAX_LENGTH } from "./templateEditorLimits";
import "./DynamicTemplateStructurePanel.css";

type ContractKind = keyof typeof TEMPLATE_CONTRACT_KIND_LABELS;
type StructureAction = "up" | "down" | "indent" | "outdent" | "duplicate" | "toggle" | "lock" | "delete";
type DropPlacement = "before" | "inside" | "after";
type DragMarker = { nodeId: string; placement: DropPlacement } | null;

interface ResponsiveRoleOption {
  device: "desktop" | "mobile" | "all";
  roleId?: string;
}

interface StructureSlot {
  entryType: "slot";
  key: string;
  nodeId: string;
  roleId?: string;
  label: string;
  kind: ContractKind;
  responsiveOptions: ResponsiveRoleOption[];
  roleIds: string[];
  virtual: boolean;
  required: boolean;
  hideable: boolean;
  removed: boolean;
  hidden: boolean;
  locked: boolean;
  depth: number;
}

interface StructureLayout {
  entryType: "layout";
  key: string;
  nodeId: string;
  label: string;
  hidden: boolean;
  locked: boolean;
  depth: number;
}

type StructureEntry = StructureSlot | StructureLayout;

interface StructureRegion {
  nodeId: string;
  rawName: string;
  label: string;
  contractBacked: boolean;
  hidden: boolean;
  locked: boolean;
  entries: StructureEntry[];
  slots: StructureSlot[];
}

function ContractRoleIcon({ kind }: { kind: ContractKind }) {
  if (kind === "media") return <PictureOutlined />;
  if (kind === "video") return <VideoCameraOutlined />;
  if (kind === "text") return <FontSizeOutlined />;
  if (kind === "action") return <LinkOutlined />;
  if (kind === "product") return <ShoppingOutlined />;
  return <AppstoreOutlined />;
}

function getSlotContract(definition: TemplateDefinitionV2, nodeId: string) {
  const node = definition.nodes[nodeId];
  const slot = node?.slotId ? definition.slots[node.slotId] : undefined;
  const moduleType = slot
    ? getContentTemplateModuleTypeForSlotType(slot.type)
    : undefined;
  return moduleType ? getContentTemplateContract(moduleType) : undefined;
}

function collectSlotNodeIds(
  definition: TemplateDefinitionV2,
  nodeId: string,
  result: string[] = [],
) {
  const node = definition.nodes[nodeId];
  if (!node) return result;
  if (getDynamicTemplateNodeRegistryEntry(node.type).kind === "slot") {
    result.push(nodeId);
    return result;
  }
  node.childIds.forEach((childId) => collectSlotNodeIds(definition, childId, result));
  return result;
}

function getSimpleSlotKind(definition: TemplateDefinitionV2, nodeId: string): ContractKind {
  const node = definition.nodes[nodeId];
  const label = getDynamicTemplateNodeRegistryEntry(node.type).label;
  if (node.type === "Video") return "video";
  if (/图片|图标|轮播|海报|对比|热区/.test(label)) return "media";
  if (/按钮|链接|行动|预约/.test(label)) return "action";
  if (/商品/.test(label)) return "product";
  if (/文字|标题|文本|徽章/.test(label)) return "text";
  return "collection";
}

function semanticRoleLabel(roleIds: readonly string[], fallback: string) {
  if (roleIds.includes("desktopImage") && roleIds.includes("mobileImage")) return "主视觉图片";
  if (roleIds.includes("copy")) return "标题与描述文字";
  if (roleIds.includes("action")) return "行动入口";
  return fallback
    .replace(/^桌面端?/, "")
    .replace(/^移动端?/, "")
    .replace(/^全端/, "")
    .trim() || "内容槽位";
}

function buildContractSlots(
  definition: TemplateDefinitionV2,
  nodeId: string,
  depth = 0,
): StructureSlot[] {
  const contract = getSlotContract(definition, nodeId);
  if (!contract) return [];
  const objects = contract.editorCapabilities.editableObjects;
  const objectByRoleId = new Map(objects.map((object) => [object.roleId, object]));
  const visited = new Set<string>();

  return objects.flatMap((object): StructureSlot[] => {
    if (visited.has(object.roleId)) return [];
    const role = contract.roles.find((candidate) => candidate.id === object.roleId);
    const pairedRoleId = role?.fallbackRoleId && objectByRoleId.has(role.fallbackRoleId)
      ? role.fallbackRoleId
      : undefined;
    const pair = pairedRoleId ? objectByRoleId.get(pairedRoleId) : undefined;
    const roleIds = pair ? [object.roleId, pair.roleId] : [object.roleId];
    roleIds.forEach((roleId) => visited.add(roleId));
    const responsiveOptions = roleIds.flatMap((roleId): ResponsiveRoleOption[] => {
      const definitionRole = contract.roles.find((candidate) => candidate.id === roleId);
      const appliesTo = definitionRole?.appliesTo;
      if (!appliesTo?.length) return [{ device: "all", roleId }];
      return appliesTo.map((device) => ({ device, roleId }));
    });
    const baseLabel = getTemplateContractRoleLabel(object.roleId, role?.semantic);
    const required = roleIds.some((roleId) => (
      contract.roles.find((candidate) => candidate.id === roleId)?.required === true
    ));
    const hideable = !required && roleIds.every((roleId) => {
      const editableObject = objectByRoleId.get(roleId);
      return Boolean(
        editableObject?.capabilities.includes("visibility")
        && editableObject.constraints.allowHide,
      );
    });
    const removed = roleIds.every((roleId) => (
      resolveVisualNode({
        __instanceOverrides: definition.nodes[nodeId].props.contentTemplateLayoutData,
      }, roleId, "desktop").enabled === false
    ));
    return [{
      entryType: "slot",
      key: `${nodeId}:${roleIds.slice().sort().join("+")}`,
      nodeId,
      roleId: object.roleId,
      label: semanticRoleLabel(roleIds, baseLabel),
      kind: object.kind,
      responsiveOptions,
      roleIds,
      virtual: true,
      required,
      hideable,
      removed,
      hidden: definition.nodes[nodeId].hidden,
      locked: isDynamicTemplateStructureProtected(definition, nodeId),
      depth,
    }];
  });
}

function collectRegionEntries(
  definition: TemplateDefinitionV2,
  nodeId: string,
  depth: number,
  result: StructureEntry[],
  includeNode = true,
) {
  const node = definition.nodes[nodeId];
  if (!node) return result;
  const registry = getDynamicTemplateNodeRegistryEntry(node.type);
  if (registry.kind === "slot") {
    const contractSlots = buildContractSlots(definition, nodeId, depth);
    if (contractSlots.length) result.push(...contractSlots);
    else {
      const slot = node.slotId ? definition.slots[node.slotId] : undefined;
      const label = node.name === registry.label ? slot?.label ?? registry.label : node.name;
      result.push({
        entryType: "slot",
        key: nodeId,
        nodeId,
        label,
        kind: getSimpleSlotKind(definition, nodeId),
        responsiveOptions: [{ device: "desktop" }, { device: "mobile" }],
        roleIds: [],
        virtual: false,
        required: slot?.required ?? false,
        hideable: slot?.hideable ?? true,
        removed: node.hidden,
        hidden: node.hidden,
        locked: isDynamicTemplateStructureProtected(definition, nodeId),
        depth,
      });
    }
    return result;
  }
  if (includeNode) {
    result.push({
      entryType: "layout",
      key: nodeId,
      nodeId,
      label: node.name,
      hidden: node.hidden,
      locked: isDynamicTemplateStructureProtected(definition, nodeId),
      depth,
    });
  }
  const childDepth = includeNode ? depth + 1 : depth;
  node.childIds.forEach((childId) => collectRegionEntries(
    definition,
    childId,
    childDepth,
    result,
    true,
  ));
  return result;
}

function buildStructureRegions(definition: TemplateDefinitionV2): StructureRegion[] {
  const root = definition.nodes[definition.rootNodeId];
  if (!root) return [];
  return root.childIds.flatMap((nodeId): StructureRegion[] => {
    const node = definition.nodes[nodeId];
    if (!node) return [];
    const slotNodeIds = collectSlotNodeIds(definition, nodeId);
    const entries = collectRegionEntries(
      definition,
      nodeId,
      0,
      [],
      getDynamicTemplateNodeRegistryEntry(node.type).kind === "slot",
    );
    const slots = entries.filter((entry): entry is StructureSlot => entry.entryType === "slot");
    const contractLabel = slotNodeIds
      .map((slotNodeId) => getSlotContract(definition, slotNodeId)?.displayName)
      .find(Boolean);
    return [{
      nodeId,
      rawName: node.name,
      label: getDynamicTemplateRegionDisplayName(definition, nodeId, contractLabel),
      contractBacked: slotNodeIds.some((slotNodeId) => Boolean(getSlotContract(definition, slotNodeId))),
      hidden: node.hidden,
      locked: isDynamicTemplateStructureProtected(definition, nodeId),
      entries,
      slots,
    }];
  });
}

function getStructureIssueDisplayMessage(
  issue: TemplateStructureIssue,
  regions: readonly StructureRegion[],
) {
  if (issue.code === "EMPTY_STRUCTURE_NODE") {
    const region = regions.find((candidate) => candidate.nodeId === issue.nodeId);
    return `${region?.label ?? "内容区域"} 暂无内容`;
  }
  if (issue.code === "MISSING_REGION") return "模板尚未创建内容区域";
  if (issue.code === "MISSING_SLOT") return "模板尚未添加内容槽位";
  return issue.message.replace(/[。]$/, "");
}

function ResponsiveSlotControls({
  options,
  activeDevice,
  activeRoleId,
  onSelect,
}: {
  options: readonly ResponsiveRoleOption[];
  activeDevice: "desktop" | "mobile";
  activeRoleId?: string;
  onSelect: (option: ResponsiveRoleOption) => void;
}) {
  if (options.length === 1 && options[0].device === "all") {
    return null;
  }
  return (
    <div className="template-editor__slot-devices" role="group" aria-label="响应式版本">
      {options.map((option) => {
        const label = option.device === "desktop" ? "桌面" : option.device === "mobile" ? "移动" : "全端";
        const selected = option.roleId
          ? option.roleId === activeRoleId
          : option.device === activeDevice;
        return (
          <button
            key={`${option.device}:${option.roleId ?? "node"}`}
            type="button"
            className={`template-editor__slot-device${selected ? " is-current" : ""}`}
            aria-label={`选择${label}端槽位`}
            title={`${label}端槽位`}
            aria-pressed={selected}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(option);
            }}
          >
            <span aria-hidden="true">
              {option.device === "desktop" ? "D" : option.device === "mobile" ? "M" : "全"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function InlineStructureName({
  value,
  editing,
  onBegin,
  onCommit,
}: {
  value: string;
  editing: boolean;
  onBegin: () => void;
  onCommit: (value: string) => void;
}) {
  const [draftValue, setDraftValue] = useState(value);
  useEffect(() => {
    if (editing) setDraftValue(value);
  }, [editing, value]);
  if (!editing) {
    return <strong title={`${value}（双击重命名）`} onDoubleClick={(event) => { event.stopPropagation(); setDraftValue(value); onBegin(); }}>{value}</strong>;
  }
  const commit = () => onCommit(draftValue.trim() || value);
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") commit();
    if (event.key === "Escape") onCommit(value);
  };
  return (
    <input
      className="template-editor__structure-name-input"
      aria-label="结构名称"
      value={draftValue}
      maxLength={TEMPLATE_NODE_NAME_MAX_LENGTH}
      autoFocus
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setDraftValue(event.target.value)}
      onBlur={commit}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={handleKeyDown}
    />
  );
}

export default function DynamicTemplateStructurePanel({
  onCollapse,
}: {
  onCollapse?: () => void;
}) {
  const { message, modal } = AntdApp.useApp();
  const draft = useTemplateEditorSession((state) => state.draft);
  const selectedNodeId = useTemplateEditorSession((state) => state.selectedObjectId);
  const selectedContractRole = useTemplateEditorSession((state) => state.selectedContractRole);
  const device = useTemplateEditorSession((state) => state.device);
  const selectObject = useTemplateEditorSession((state) => state.selectObject);
  const selectContractRole = useTemplateEditorSession((state) => state.selectContractRole);
  const setDevice = useTemplateEditorSession((state) => state.setDevice);
  const setDynamicDefinition = useTemplateEditorSession((state) => state.setDynamicDefinition);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [dragMarker, setDragMarker] = useState<DragMarker>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [collapsedRegionIds, setCollapsedRegionIds] = useState<ReadonlySet<string>>(() => new Set());
  const [showAllIssues, setShowAllIssues] = useState(false);
  const regions = useMemo(
    () => draft ? buildStructureRegions(draft.definition) : [],
    [draft],
  );
  const structureAudit = useMemo(
    () => draft ? buildTemplateStructureAudit(draft.definition) : null,
    [draft],
  );
  if (!draft) return null;

  const definition = draft.definition;
  const { sourceWidth, fallbackHeight, heightMode } = resolveTemplatePreviewViewport(definition, device);
  const templateSizeLabel = heightMode === "auto"
    ? `${sourceWidth} × 随内容`
    : `${sourceWidth} × ${Math.round(fallbackHeight)}`;
  const isContractBackedTemplate = draft.sourceReference?.startsWith("legacy_") ?? false;
  const isSetupIncomplete = Boolean(
    structureAudit
    && structureAudit.errorCount > 0
    && structureAudit.issues.every((issue) => (
      issue.code === "MISSING_REGION"
      || issue.code === "MISSING_SLOT"
      || issue.code === "EMPTY_STRUCTURE_NODE"
    )),
  );
  const visibleStructureIssues = structureAudit
    ? showAllIssues ? structureAudit.issues : structureAudit.issues.slice(0, 2)
    : [];
  const toggleRegion = (nodeId: string) => {
    setCollapsedRegionIds((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };
  const selectSlot = (slot: StructureSlot, option?: ResponsiveRoleOption) => {
    const target = option
      ?? slot.responsiveOptions.find((candidate) => candidate.device === device)
      ?? slot.responsiveOptions.find((candidate) => candidate.device === "all")
      ?? slot.responsiveOptions[0];
    if (target.device !== "all" && target.device !== device) setDevice(target.device);
    const roleId = target.roleId ?? slot.roleId;
    if (roleId) selectContractRole(slot.nodeId, roleId);
    else selectObject(slot.nodeId);
  };

  const renameNode = (nodeId: string, name: string) => {
    const currentDraft = useTemplateEditorSession.getState().draft;
    setEditingNodeId(null);
    if (!currentDraft || currentDraft.definition.nodes[nodeId]?.name === name) return;
    const next = structuredClone(currentDraft.definition);
    next.nodes[nodeId].name = name.slice(0, TEMPLATE_NODE_NAME_MAX_LENGTH);
    setDynamicDefinition(next);
  };

  const setContractRoleRemoved = (slot: StructureSlot, removed: boolean) => {
    if (!slot.virtual || !slot.roleIds.length) return;
    if (removed && (slot.required || !slot.hideable)) {
      message.warning("必填内容和系统锁定内容不能移出模板。");
      return;
    }
    const currentDraft = useTemplateEditorSession.getState().draft;
    if (!currentDraft) return;
    const next = structuredClone(currentDraft.definition);
    const target = next.nodes[slot.nodeId];
    if (!target) return;
    let layoutData = target.props.contentTemplateLayoutData;
    for (const roleId of slot.roleIds) {
      layoutData = setVisualOverridePath(
        layoutData,
        ["nodes", roleId, "enabled"],
        removed ? false : undefined,
      );
    }
    if (layoutData) target.props.contentTemplateLayoutData = layoutData;
    else delete target.props.contentTemplateLayoutData;
    setDynamicDefinition(next);
    selectSlot(slot);
    message.success(removed ? `已将“${slot.label}”移出当前模板` : `已恢复“${slot.label}”`);
  };

  const selectIssue = (issue: TemplateStructureIssue) => {
    const nodeId = issue.nodeId && definition.nodes[issue.nodeId]
      ? issue.nodeId
      : definition.rootNodeId;
    if (issue.roleId) selectContractRole(nodeId, issue.roleId);
    else selectObject(nodeId);
  };

  const repairIssue = (issue: TemplateStructureIssue) => {
    if (issue.repair === "restore-required-role" && issue.nodeId && issue.roleId) {
      const slot = regions.flatMap((region) => region.slots).find((candidate) => (
        candidate.nodeId === issue.nodeId && candidate.roleIds.includes(issue.roleId!)
      ));
      if (slot) setContractRoleRemoved(slot, false);
      return;
    }
    const currentDraft = useTemplateEditorSession.getState().draft;
    if (!currentDraft) return;
    if (issue.repair === "enable-required-slot-page-edit" && issue.nodeId) {
      const target = currentDraft.definition.nodes[issue.nodeId];
      const slotId = target?.slotId;
      if (!slotId || currentDraft.definition.slots[slotId]?.editable) return;
      const next = structuredClone(currentDraft.definition);
      next.slots[slotId].editable = true;
      setDynamicDefinition(next);
      selectObject(issue.nodeId);
      message.success("已允许页面填写必填槽位。");
      return;
    }
    if (issue.repair === "disable-required-slot-page-hide" && issue.nodeId) {
      const target = currentDraft.definition.nodes[issue.nodeId];
      const slotId = target?.slotId;
      if (!slotId || !currentDraft.definition.slots[slotId]?.hideable) return;
      const next = structuredClone(currentDraft.definition);
      next.slots[slotId].hideable = false;
      setDynamicDefinition(next);
      selectObject(issue.nodeId);
      message.success("已关闭必填槽位的页面隐藏权限。");
      return;
    }
    if (issue.repair === "restore-required-slot-device" && issue.nodeId && issue.device) {
      const target = currentDraft.definition.nodes[issue.nodeId];
      if (!target || target.responsive[issue.device].display !== "none") return;
      const next = structuredClone(currentDraft.definition);
      next.nodes[issue.nodeId].responsive[issue.device].display = "block";
      setDynamicDefinition(next);
      setDevice(issue.device);
      selectObject(issue.nodeId);
      message.success(`必填槽位已恢复为${issue.device === "desktop" ? "桌面端" : "移动端"}显示。`);
      return;
    }
    if (issue.repair === "restore-required-slot" && issue.nodeId) {
      const target = currentDraft.definition.nodes[issue.nodeId];
      if (!target?.hidden) return;
      setDynamicDefinition(setDynamicTemplateNodeHidden(
        currentDraft.definition,
        issue.nodeId,
        false,
      ));
      selectObject(issue.nodeId);
      message.success("必填槽位已恢复显示。");
      return;
    }
    try {
      let next = currentDraft.definition;
      let parentId = next.nodes[next.rootNodeId]?.childIds.find((nodeId) => (
        getDynamicTemplateNodeRegistryEntry(next.nodes[nodeId].type).kind === "structure"
      ));
      if (!parentId) {
        const region = addDynamicTemplateNode(next, next.rootNodeId, "Container");
        next = structuredClone(region.definition);
        parentId = region.nodeId;
        next.nodes[parentId].name = "内容区域 01";
      }
      if (issue.repair === "add-region") {
        setDynamicDefinition(next);
        selectObject(parentId);
        return;
      }
      if (issue.repair === "add-slot") {
        const result = addDynamicTemplateNode(next, parentId, "ImageSlot");
        setDynamicDefinition(result.definition);
        selectObject(result.nodeId);
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : "结构修复失败");
    }
  };

  const performDrop = (
    draggedNodeId: string,
    targetNodeId: string,
    placement: DropPlacement,
  ) => {
    setDragMarker(null);
    const currentDraft = useTemplateEditorSession.getState().draft;
    if (!currentDraft) return;
    const currentDefinition = currentDraft.definition;
    if (draggedNodeId === currentDefinition.rootNodeId || draggedNodeId === targetNodeId) return;
    try {
      let nextDefinition: TemplateDefinitionV2;
      if (placement === "inside") {
        nextDefinition = moveDynamicTemplateNode(currentDefinition, draggedNodeId, targetNodeId);
      } else {
        const targetParentId = findDynamicTemplateParentId(currentDefinition, targetNodeId);
        const currentParentId = findDynamicTemplateParentId(currentDefinition, draggedNodeId);
        if (!targetParentId) return;
        const targetSiblings = currentDefinition.nodes[targetParentId]?.childIds ?? [];
        const targetIndex = targetSiblings.indexOf(targetNodeId);
        const currentIndex = currentParentId
          ? currentDefinition.nodes[currentParentId]?.childIds.indexOf(draggedNodeId) ?? -1
          : -1;
        let insertionIndex = targetIndex + (placement === "after" ? 1 : 0);
        if (currentParentId === targetParentId && currentIndex >= 0 && currentIndex < insertionIndex) insertionIndex -= 1;
        nextDefinition = moveDynamicTemplateNode(
          currentDefinition,
          draggedNodeId,
          targetParentId,
          insertionIndex,
        );
      }
      setDynamicDefinition(nextDefinition);
      selectObject(draggedNodeId);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "结构排序失败");
    }
  };

  const performAction = (action: StructureAction, nodeId: string) => {
    const currentDraft = useTemplateEditorSession.getState().draft;
    if (!currentDraft) return;
    const node = currentDraft.definition.nodes[nodeId];
    if (!node) return;
    const slot = node.slotId ? currentDraft.definition.slots[node.slotId] : undefined;
    if ((action === "delete" || (action === "toggle" && !node.hidden)) && slot?.required) {
      message.warning(`“${slot.label}”是必填槽位，不能${action === "delete" ? "删除" : "隐藏"}。`);
      return;
    }
    const apply = () => {
      try {
        if (action === "duplicate") {
          const result = duplicateDynamicTemplateNode(currentDraft.definition, nodeId);
          setDynamicDefinition(result.definition);
          selectObject(result.nodeId);
          return;
        }
        if (action === "toggle") {
          setDynamicDefinition(setDynamicTemplateNodeHidden(currentDraft.definition, nodeId, !node.hidden));
          return;
        }
        if (action === "lock") {
          setDynamicDefinition(setDynamicTemplateNodeStructureLocked(
            currentDraft.definition,
            nodeId,
            !isDynamicTemplateStructureLocked(node),
          ));
          return;
        }
        if (action === "delete") {
          setDynamicDefinition(removeDynamicTemplateNode(currentDraft.definition, nodeId));
          selectObject(findDynamicTemplateParentId(currentDraft.definition, nodeId));
          return;
        }
        const parentId = findDynamicTemplateParentId(currentDraft.definition, nodeId);
        if (!parentId) return;
        const siblings = currentDraft.definition.nodes[parentId].childIds;
        const currentIndex = siblings.indexOf(nodeId);
        if (action === "indent") {
          const previousSiblingId = siblings[currentIndex - 1];
          if (!previousSiblingId) return;
          setDynamicDefinition(moveDynamicTemplateNode(
            currentDraft.definition,
            nodeId,
            previousSiblingId,
          ));
          return;
        }
        if (action === "outdent") {
          const grandParentId = findDynamicTemplateParentId(currentDraft.definition, parentId);
          if (!grandParentId) return;
          const parentIndex = currentDraft.definition.nodes[grandParentId].childIds.indexOf(parentId);
          setDynamicDefinition(moveDynamicTemplateNode(
            currentDraft.definition,
            nodeId,
            grandParentId,
            parentIndex + 1,
          ));
          return;
        }
        setDynamicDefinition(reorderDynamicTemplateNode(
          currentDraft.definition,
          nodeId,
          action === "up" ? currentIndex - 1 : currentIndex + 1,
        ));
      } catch (error) {
        message.error(error instanceof Error ? error.message : "结构操作失败");
      }
    };
    if (action !== "delete") {
      apply();
      return;
    }
    modal.confirm({
      title: `删除“${node.name}”及其子节点？`,
      content: (() => {
        const countSlots = (targetId: string): number => {
          const target = currentDraft.definition.nodes[targetId];
          if (!target) return 0;
          return (target.slotId ? 1 : 0)
            + target.childIds.reduce((total, childId) => total + countSlots(childId), 0);
        };
        const affectedSlots = countSlots(nodeId);
        return affectedSlots > 0
          ? `将同时删除 ${affectedSlots} 个内容槽位。该操作只修改当前未保存草稿，可使用撤销完整恢复。`
          : "该操作只修改当前未保存模板草稿，仍可使用模板撤销恢复。";
      })(),
      okText: "删除节点",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: apply,
    });
  };

  const nodeMenu = (nodeId: string, rawName: string, region: boolean, layout = false) => {
    const parentId = findDynamicTemplateParentId(definition, nodeId);
    const siblings = parentId ? definition.nodes[parentId]?.childIds ?? [] : [];
    const siblingIndex = siblings.indexOf(nodeId);
    const node = definition.nodes[nodeId];
    const slot = node.slotId ? definition.slots[node.slotId] : undefined;
    const selfLocked = isDynamicTemplateStructureLocked(node);
    const locked = isDynamicTemplateStructureProtected(definition, nodeId);
    const parentLocked = Boolean(
      parentId && isDynamicTemplateStructureProtected(definition, parentId),
    );
    const previousSibling = siblingIndex > 0 ? definition.nodes[siblings[siblingIndex - 1]] : undefined;
    const grandParentId = parentId ? findDynamicTemplateParentId(definition, parentId) : null;
    const canIndent = Boolean(
      previousSibling
      && !isDynamicTemplateStructureProtected(definition, previousSibling.nodeId)
      && canNestDynamicTemplateNode(previousSibling.type, node.type),
    );
    const canOutdent = Boolean(
      grandParentId
      && !isDynamicTemplateStructureProtected(definition, grandParentId)
      && canNestDynamicTemplateNode(definition.nodes[grandParentId].type, node.type),
    );
    const requiredSlotVisible = Boolean(slot?.required && !node.hidden);
    const deleteLabel = region ? "删除区域" : layout ? "删除容器" : "删除槽位";
    return (
      <Dropdown
        trigger={["click"]}
        menu={{
          items: [
            {
              key: "rename",
              label: region ? "重命名区域" : layout ? "重命名容器" : "重命名槽位",
              disabled: locked,
            },
            { key: "up", icon: <ArrowUpOutlined />, label: "上移", disabled: locked || parentLocked || siblingIndex <= 0 },
            { key: "down", icon: <ArrowDownOutlined />, label: "下移", disabled: locked || parentLocked || siblingIndex < 0 || siblingIndex >= siblings.length - 1 },
            { key: "indent", label: "移入上一个容器", disabled: locked || parentLocked || !canIndent },
            { key: "outdent", label: "移出当前容器", disabled: locked || parentLocked || !canOutdent },
            { key: "duplicate", icon: <CopyOutlined />, label: region ? "复制区域" : layout ? "复制容器" : "复制槽位", disabled: locked || parentLocked },
            {
              key: "lock",
              icon: selfLocked ? <UnlockOutlined /> : <LockOutlined />,
              label: selfLocked
                ? "解除锁定"
                : locked
                  ? "已由上级锁定"
                  : region ? "锁定区域" : layout ? "锁定容器" : "锁定槽位",
              disabled: locked && !selfLocked,
            },
            {
              key: "toggle",
              icon: node.hidden ? <EyeOutlined /> : <EyeInvisibleOutlined />,
              label: node.hidden
                ? "显示"
                : requiredSlotVisible
                  ? "隐藏（必填槽位不可用）"
                  : "隐藏",
              disabled: locked || requiredSlotVisible,
            },
            { type: "divider" },
            {
              key: "delete",
              icon: <DeleteOutlined />,
              label: slot?.required ? `${deleteLabel}（必填槽位不可用）` : deleteLabel,
              danger: true,
              disabled: locked || parentLocked || slot?.required,
            },
          ],
          onClick: ({ key }) => {
            if (key === "rename") {
              setEditingNodeId(nodeId);
              return;
            }
            if (key === "up" || key === "down" || key === "indent" || key === "outdent" || key === "duplicate" || key === "toggle" || key === "lock" || key === "delete") {
              performAction(key, nodeId);
            }
          },
        }}
      >
        <button
          type="button"
          className="template-editor__structure-more"
          aria-label={`${rawName}${region ? "区域" : layout ? "容器" : "节点"}操作`}
          onClick={(event) => event.stopPropagation()}
        >
          <MoreOutlined />
        </button>
      </Dropdown>
    );
  };

  return (
    <aside className="homepage-editor__structure-workspace template-editor__structure template-editor__structure--reference" aria-label="模板结构">
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
      <p className="template-editor__structure-help">
        这里决定模板由哪些区域、容器和内容槽位组成；层级决定归属，顺序决定布局顺序。
      </p>
      <div className="template-editor__structure-scroll">
        <button
          type="button"
          className={`template-editor__template-summary${selectedNodeId === definition.rootNodeId ? " is-active" : ""}`}
          role="treeitem"
          aria-level={1}
          aria-selected={selectedNodeId === definition.rootNodeId}
          aria-label={`${definition.name} 模板 ${templateSizeLabel}`}
          onClick={() => selectObject(definition.rootNodeId)}
        >
          <span className="template-editor__template-summary-copy">
            <span className="template-editor__template-kicker">当前模板</span>
            <strong>{definition.name}</strong>
            <small className="template-editor__template-meta">
              <span>{device === "desktop" ? "桌面端" : "移动端"} · {templateSizeLabel}</span>
              {structureAudit?.issues.length === 0 ? (
                <span className="template-editor__template-complete">
                  <CheckCircleOutlined aria-hidden="true" /> 结构完整
                </span>
              ) : null}
            </small>
          </span>
          <LockOutlined title="模板根层固定" />
        </button>

        {structureAudit && structureAudit.issues.length > 0 ? (
          <section className={`template-editor__structure-health${isSetupIncomplete ? " is-incomplete" : structureAudit.errorCount > 0 ? " has-errors" : " has-warnings"}`} aria-label="模板结构问题">
            <div className="template-editor__structure-health-summary">
              <span className="template-editor__structure-health-icon" aria-hidden="true">
                <ExclamationCircleOutlined />
              </span>
              <strong>{structureAudit.issues.length} 项待处理</strong>
            </div>
            <div className="template-editor__structure-issues">
              <ul>
                {visibleStructureIssues.map((issue, index) => (
                  <li key={`${issue.code}:${issue.nodeId ?? "root"}:${issue.roleId ?? index}`} className={`is-${issue.level}`}>
                    <span title={issue.message}>{getStructureIssueDisplayMessage(issue, regions)}</span>
                    <button type="button" onClick={() => selectIssue(issue)}>定位</button>
                    {issue.repair ? <button type="button" onClick={() => repairIssue(issue)}>修复</button> : null}
                  </li>
                ))}
              </ul>
              {structureAudit.issues.length > 2 ? (
                <button
                  type="button"
                  className="template-editor__structure-issues-toggle"
                  aria-expanded={showAllIssues}
                  onClick={() => setShowAllIssues((current) => !current)}
                >
                  {showAllIssues ? "收起问题" : `查看全部 ${structureAudit.issues.length} 项`}
                </button>
              ) : null}
            </div>
          </section>
        ) : null}

        <ol className="template-editor__region-list" role="tree" aria-label="模板区域与槽位">
          {regions.map((region) => {
            const regionSelected = selectedNodeId === region.nodeId && !selectedContractRole;
            const regionCollapsed = collapsedRegionIds.has(region.nodeId);
            return (
              <li
                key={region.nodeId}
                className={`template-editor__region${region.hidden ? " is-hidden" : ""}${region.locked ? " is-locked" : ""}`}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragMarker(null);
                }}
              >
                <div
                  className={`template-editor__region-header${regionSelected ? " is-active" : ""}${dragMarker?.nodeId === region.nodeId ? ` is-drag-${dragMarker.placement}` : ""}`}
                >
                  <button
                    type="button"
                    className="template-editor__region-toggle"
                    aria-label={`${region.label}${regionCollapsed ? "展开" : "收起"}`}
                    aria-expanded={!regionCollapsed}
                    onClick={() => toggleRegion(region.nodeId)}
                  >
                    {regionCollapsed ? <RightOutlined /> : <DownOutlined />}
                  </button>
                  <button
                    type="button"
                    className="template-editor__region-select"
                    role="treeitem"
                    aria-level={2}
                    aria-selected={regionSelected}
                    aria-expanded={!regionCollapsed}
                    aria-label={`${region.label}${region.hidden ? " 已隐藏" : ""}${region.locked ? " 已锁定" : ""}`}
                    draggable={!region.contractBacked && !region.locked}
                    onClick={() => selectObject(region.nodeId)}
                    onDragStart={(event) => {
                      if (region.contractBacked) return;
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("application/x-haichuan-template-node", region.nodeId);
                      event.dataTransfer.setData("application/x-haichuan-template-region", region.nodeId);
                    }}
                    onDragOver={(event) => {
                      if (region.contractBacked || region.locked) return;
                      if (!event.dataTransfer.types.includes("application/x-haichuan-template-region")) return;
                      event.preventDefault();
                      const rect = event.currentTarget.getBoundingClientRect();
                      setDragMarker({ nodeId: region.nodeId, placement: event.clientY < rect.top + rect.height / 2 ? "before" : "after" });
                    }}
                    onDrop={(event) => {
                      if (region.contractBacked || region.locked) return;
                      event.preventDefault();
                      const draggedNodeId = event.dataTransfer.getData("application/x-haichuan-template-region");
                      if (draggedNodeId) performDrop(draggedNodeId, region.nodeId, dragMarker?.placement ?? "after");
                    }}
                    onDragEnd={() => setDragMarker(null)}
                  >
                    {region.contractBacked ? (
                      <strong>{region.label}</strong>
                    ) : (
                      <>
                        <HolderOutlined className="template-editor__drag-handle" aria-hidden="true" />
                        <InlineStructureName
                          value={region.label}
                          editing={editingNodeId === region.nodeId}
                          onBegin={() => { if (!region.locked) setEditingNodeId(region.nodeId); }}
                          onCommit={(value) => renameNode(region.nodeId, value)}
                        />
                      </>
                    )}
                  </button>
                  {!region.contractBacked ? nodeMenu(region.nodeId, region.rawName, true) : null}
                </div>
                <ul role="group" aria-label={`${region.label}内容槽位`} hidden={regionCollapsed}>
                  {region.entries.length ? region.entries.map((entry) => {
                    if (entry.entryType === "layout") {
                      const layoutSelected = selectedNodeId === entry.nodeId && !selectedContractRole;
                      const layoutParentId = findDynamicTemplateParentId(definition, entry.nodeId);
                      const layoutParentLocked = Boolean(
                        layoutParentId
                        && isDynamicTemplateStructureProtected(definition, layoutParentId),
                      );
                      return (
                        <li
                          key={entry.key}
                          className={`template-editor__layout-row${layoutSelected ? " is-active" : ""}${entry.hidden ? " is-hidden" : ""}${entry.locked ? " is-locked" : ""}${dragMarker?.nodeId === entry.nodeId ? ` is-drag-${dragMarker.placement}` : ""}`}
                        >
                          <button
                            type="button"
                            className="template-editor__layout-select"
                            role="treeitem"
                            aria-level={3 + entry.depth}
                            aria-selected={layoutSelected}
                            aria-label={`${entry.label} 布局容器${entry.hidden ? " 已隐藏" : ""}${entry.locked ? " 已锁定" : ""}`}
                            style={{ paddingLeft: 5 + entry.depth * 12 }}
                            draggable={!entry.locked && !layoutParentLocked}
                            onClick={() => selectObject(entry.nodeId)}
                            onDoubleClick={(event) => {
                              event.stopPropagation();
                              if (!entry.locked) setEditingNodeId(entry.nodeId);
                            }}
                            onDragStart={(event) => {
                              event.dataTransfer.effectAllowed = "move";
                              event.dataTransfer.setData("application/x-haichuan-template-node", entry.nodeId);
                            }}
                            onDragOver={(event) => {
                              if (entry.locked || layoutParentLocked) return;
                              if (!event.dataTransfer.types.includes("application/x-haichuan-template-node")) return;
                              event.preventDefault();
                              const rect = event.currentTarget.getBoundingClientRect();
                              const offset = (event.clientY - rect.top) / rect.height;
                              const placement: DropPlacement = offset < 0.28 ? "before" : offset > 0.72 ? "after" : "inside";
                              setDragMarker({ nodeId: entry.nodeId, placement });
                            }}
                            onDrop={(event) => {
                              if (entry.locked || layoutParentLocked) return;
                              event.preventDefault();
                              const draggedNodeId = event.dataTransfer.getData("application/x-haichuan-template-node");
                              if (draggedNodeId) performDrop(draggedNodeId, entry.nodeId, dragMarker?.placement ?? "inside");
                            }}
                            onDragEnd={() => setDragMarker(null)}
                          >
                            <HolderOutlined className="template-editor__drag-handle" aria-hidden="true" />
                            <BlockOutlined className="template-editor__layout-icon" aria-hidden="true" />
                            <InlineStructureName
                              value={entry.label}
                              editing={editingNodeId === entry.nodeId}
                              onBegin={() => { if (!entry.locked) setEditingNodeId(entry.nodeId); }}
                              onCommit={(value) => renameNode(entry.nodeId, value)}
                            />
                          </button>
                          {nodeMenu(entry.nodeId, entry.label, false, true)}
                        </li>
                      );
                    }
                    const slot = entry;
                    const slotSelected = slot.roleId
                      ? selectedContractRole?.nodeId === slot.nodeId
                        && slot.responsiveOptions.some((option) => option.roleId === selectedContractRole.roleId)
                      : selectedNodeId === slot.nodeId && !selectedContractRole;
                    const parentId = findDynamicTemplateParentId(definition, slot.nodeId);
                    const canReorder = !slot.virtual
                      && Boolean(parentId)
                      && !slot.locked
                      && !isDynamicTemplateStructureProtected(definition, parentId!);
                    return (
                      <li
                        key={slot.key}
                        className={`template-editor__slot-row${slotSelected ? " is-active" : ""}${slot.hidden || slot.removed ? " is-hidden" : ""}${slot.locked ? " is-locked" : ""}${dragMarker?.nodeId === slot.nodeId ? ` is-drag-${dragMarker.placement}` : ""}`}
                      >
                        <button
                          type="button"
                          className="template-editor__slot-select"
                          role="treeitem"
                          aria-level={3 + slot.depth}
                          aria-selected={slotSelected}
                          aria-label={`${slot.label} ${TEMPLATE_CONTRACT_KIND_LABELS[slot.kind]} ${slot.required ? "必填" : "可选"}${slot.virtual && slot.removed ? " 已移出模板" : slot.hidden ? " 已隐藏" : ""}${slot.locked ? " 已锁定" : ""}`}
                          style={{ paddingLeft: 4 + slot.depth * 12 }}
                          draggable={canReorder && !slot.locked}
                          onClick={() => selectSlot(slot)}
                          onDoubleClick={(event) => {
                            if (slot.virtual) return;
                            event.stopPropagation();
                            if (!slot.locked) setEditingNodeId(slot.nodeId);
                          }}
                          onDragStart={(event) => {
                            if (!canReorder) return;
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("application/x-haichuan-template-node", slot.nodeId);
                          }}
                          onDragOver={(event) => {
                            if (!canReorder || !event.dataTransfer.types.includes("application/x-haichuan-template-node")) return;
                            event.preventDefault();
                            const rect = event.currentTarget.getBoundingClientRect();
                            setDragMarker({ nodeId: slot.nodeId, placement: event.clientY < rect.top + rect.height / 2 ? "before" : "after" });
                          }}
                          onDrop={(event) => {
                            if (!canReorder) return;
                            event.preventDefault();
                            const draggedNodeId = event.dataTransfer.getData("application/x-haichuan-template-node");
                            if (draggedNodeId) performDrop(draggedNodeId, slot.nodeId, dragMarker?.placement ?? "after");
                          }}
                          onDragEnd={() => setDragMarker(null)}
                        >
                          <span className={`template-editor__contract-role-icon is-${slot.kind}`} aria-hidden="true">
                            <ContractRoleIcon kind={slot.kind} />
                          </span>
                          {editingNodeId === slot.nodeId && !slot.virtual ? (
                            <InlineStructureName
                              value={slot.label}
                              editing
                              onBegin={() => setEditingNodeId(slot.nodeId)}
                              onCommit={(value) => renameNode(slot.nodeId, value)}
                            />
                          ) : (
                            <span className="template-editor__slot-copy">
                              <strong title={slot.label}>{slot.label}</strong>
                              <small>{slot.virtual && slot.removed ? "已移出" : slot.hidden ? "已隐藏" : slot.required ? "必填" : "可选"}</small>
                            </span>
                          )}
                        </button>
                        <ResponsiveSlotControls
                          options={slot.responsiveOptions}
                          activeDevice={device}
                          activeRoleId={selectedContractRole?.nodeId === slot.nodeId ? selectedContractRole.roleId : undefined}
                          onSelect={(option) => selectSlot(slot, option)}
                        />
                        {!slot.virtual ? (
                          <div className="template-editor__slot-actions">
                            <button
                              type="button"
                              aria-label={`${slot.label}${slot.locked ? "解除锁定" : "锁定"}`}
                              title={slot.locked ? "解除槽位锁定" : "锁定槽位"}
                              onClick={() => performAction("lock", slot.nodeId)}
                            >
                              {slot.locked ? <UnlockOutlined /> : <LockOutlined />}
                            </button>
                            <button
                              type="button"
                              disabled={slot.required && !slot.hidden}
                              aria-label={`${slot.label}${slot.hidden ? "显示" : slot.required ? "隐藏（必填槽位不可用）" : "隐藏"}`}
                              title={slot.hidden ? "显示槽位" : slot.required ? "必填槽位不能隐藏" : "隐藏槽位"}
                              onClick={() => performAction("toggle", slot.nodeId)}
                            >
                              {slot.hidden ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                            </button>
                            {nodeMenu(slot.nodeId, slot.label, false)}
                          </div>
                        ) : slot.hideable ? (
                          <div className="template-editor__slot-actions">
                            <button
                              type="button"
                              aria-label={`${slot.label}${slot.removed ? "恢复到模板" : "移出模板"}`}
                              title={slot.removed ? "恢复可选内容" : "移出可选内容（可撤销）"}
                              onClick={() => setContractRoleRemoved(slot, !slot.removed)}
                            >
                              {slot.removed ? <EyeOutlined /> : <DeleteOutlined />}
                            </button>
                          </div>
                        ) : null}
                      </li>
                    );
                  }) : (
                    <li className="template-editor__region-empty">
                      <span>暂无内容</span>
                    </li>
                  )}
                </ul>
              </li>
            );
          })}
        </ol>
      </div>
      <DynamicTemplateNodePalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <p className="template-editor__structure-note">
        {isContractBackedTemplate
          ? "系统必填内容受保护 · 可新增区域和槽位"
          : "拖动调整顺序 · 右侧设置属性"}
      </p>
    </aside>
  );
}
