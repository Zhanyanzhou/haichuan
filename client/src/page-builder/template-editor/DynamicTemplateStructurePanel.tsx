import {
  AppstoreOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
  BlockOutlined,
  CopyOutlined,
  CaretDownOutlined,
  CaretRightOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  FontSizeOutlined,
  HolderOutlined,
  LinkOutlined,
  LockOutlined,
  MoreOutlined,
  PictureOutlined,
  ShoppingOutlined,
  UnlockOutlined,
  VideoCameraOutlined,
} from "@ant-design/icons";
import { App as AntdApp, Button, Dropdown, type MenuProps } from "antd";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type Ref,
} from "react";
import {
  createDefaultDynamicTemplateResponsiveRules,
  duplicateDynamicTemplateNode,
  getDynamicTemplateGroupDisabledReason,
  getDynamicTemplateMoveLandings,
  getDynamicTemplateNodeRegistryEntry,
  getDynamicTemplateStructureLockOwnerId,
  getDynamicTemplateUngroupDisabledReason,
  groupDynamicTemplateNodes,
  isDynamicTemplateStructureLocked,
  isDynamicTemplateStructureProtected,
  moveDynamicTemplateNodeToLanding,
  removeDynamicTemplateNode,
  resolveDynamicTemplateMoveLanding,
  resolveDynamicTemplateMoveShortcutLanding,
  setDynamicTemplateNodeHidden,
  setDynamicTemplateNodeStructureLocked,
  ungroupDynamicTemplateNode,
  type DynamicTemplateLayoutGroupKind,
  type TemplateDefinitionV2,
} from "../template-definition";
import { resolveTemplateNodeRules, setTemplateNodeRule, type TemplateBreakpoint } from "../template-definition/responsive";
import { getContentTemplateContract } from "../generated/contentTemplates.generated";
import {
  getContentTemplateModuleTypeForSlotType,
} from "../template-definition/validateTemplateDefinition";
import { resolveVisualNode, setVisualOverridePath } from "../runtime/visualLayout";
import WorkspacePanelCollapseButton from "../workspace/WorkspacePanelCollapseButton";
import WorkspacePanelHeader from "../workspace/WorkspacePanelHeader";
import {
  findDynamicTemplateParentId,
  describeDynamicTemplateRemoval,
  getDynamicTemplateRegionDisplayName,
} from "./dynamicTemplateEditorUtils";
import { addConfiguredTemplateRegion } from "./dynamicTemplateDraftRepository";
import { DynamicTemplateNodePalette } from "./DynamicTemplateToolbox";
import {
  getTemplateContractRoleLabel,
  TEMPLATE_CONTRACT_KIND_LABELS,
} from "./contractRolePresentation";
import {
  buildTemplateStructureAudit,
  type TemplateStructureIssue,
} from "./templateStructureAudit";
import { useTemplateEditorSession } from "./templateEditorSession";
import {
  isSameTemplateEditorSelectionTarget,
  type TemplateEditorSelectionExclusion,
  type TemplateEditorSelectionTarget,
} from "./templateEditorSelection";
import { TEMPLATE_NODE_NAME_MAX_LENGTH } from "./templateEditorLimits";
import "./DynamicTemplateStructurePanel.css";

type ContractKind = keyof typeof TEMPLATE_CONTRACT_KIND_LABELS;
type StructureAction = "up" | "down" | "indent" | "outdent" | "duplicate" | "toggle" | "lock" | "delete";
type DropPlacement = "before" | "inside" | "after";
type DragMarker = { nodeId: string; placement: DropPlacement } | null;

const GROUP_MENU_KINDS = [
  { kind: "vertical", label: "上下布局组" },
  { kind: "horizontal", label: "左右布局组" },
  { kind: "columns", label: "分列布局组" },
] as const satisfies ReadonlyArray<{
  kind: Exclude<DynamicTemplateLayoutGroupKind, "empty">;
  label: string;
}>;

const STRUCTURE_COMMAND_FEEDBACK_KEY = "template-structure-command-feedback";

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
  selectionLabel: string;
  applicableDevices: readonly ("desktop" | "mobile")[];
  virtual: boolean;
  required: boolean;
  hideable: boolean;
  removed: boolean;
  hidden: boolean;
  visibilityReason?: string;
  locked: boolean;
  depth: number;
}

interface StructureLayout {
  entryType: "layout";
  key: string;
  nodeId: string;
  label: string;
  hidden: boolean;
  visibilityReason?: string;
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
  visibilityReason?: string;
  locked: boolean;
  entries: StructureEntry[];
  slots: StructureSlot[];
}

/** 结构状态与当前断点/祖先可见性保持一致；全局隐藏操作仍独立处理。 */
export function resolveStructureVisibility(definition: TemplateDefinitionV2, nodeId: string, breakpoint: TemplateBreakpoint) {
  let currentId: string | null = nodeId;
  const visited = new Set<string>();
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const node = definition.nodes[currentId];
    if (!node) break;
    const rules = resolveTemplateNodeRules(definition, currentId, breakpoint);
    if (node.hidden || rules.hidden || rules.display === "none") {
      return { hidden: true, visibilityReason: currentId !== nodeId ? "上级隐藏：" + node.name : node.hidden ? "全局隐藏" : "本端隐藏" };
    }
    currentId = findDynamicTemplateParentId(definition, currentId);
  }
  return { hidden: false, visibilityReason: undefined };
}

function getRegionTreeItemKey(region: Pick<StructureRegion, "nodeId">) {
  return `region:${region.nodeId}`;
}

function getEntryTreeItemKey(entry: Pick<StructureEntry, "key">) {
  return `entry:${entry.key}`;
}

function isStructureSlotApplicable(
  slot: StructureSlot,
  device?: "desktop" | "mobile",
) {
  return !device
    || slot.applicableDevices.length === 0
    || slot.applicableDevices.includes(device);
}

function getVisibleTreeItemKeys(
  regions: readonly StructureRegion[],
  device?: "desktop" | "mobile",
) {
  return regions.flatMap((region) => [
    getRegionTreeItemKey(region),
    ...region.entries
      .filter((entry) => entry.entryType === "layout" || isStructureSlotApplicable(entry, device))
      .map(getEntryTreeItemKey),
  ]);
}

function resolveRovingTreeItemKey(
  visibleTreeItemKeys: readonly string[],
  focusedTreeItemKey: string | null,
  selectedTreeItemKey: string | null,
) {
  if (focusedTreeItemKey && visibleTreeItemKeys.includes(focusedTreeItemKey)) {
    return focusedTreeItemKey;
  }
  if (selectedTreeItemKey && visibleTreeItemKeys.includes(selectedTreeItemKey)) {
    return selectedTreeItemKey;
  }
  return visibleTreeItemKeys[0] ?? null;
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
  if (/图片|图标/.test(label)) return "media";
  if (/按钮|链接|行动/.test(label)) return "action";
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
    const fallbackRole = role?.fallbackRoleId
      ? contract.roles.find((candidate) => candidate.id === role.fallbackRoleId)
      : undefined;
    const roleDevices = [...(role?.appliesTo ?? [])].sort().join(",");
    const fallbackDevices = [...(fallbackRole?.appliesTo ?? [])].sort().join(",");
    const pairedRoleId = role?.fallbackRoleId
      && objectByRoleId.has(role.fallbackRoleId)
      && roleDevices === fallbackDevices
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
      selectionLabel: baseLabel,
      applicableDevices: role?.appliesTo ?? [],
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
        selectionLabel: label,
        applicableDevices: [],
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

function getStructureEntrySelectionTarget(entry: StructureEntry): TemplateEditorSelectionTarget {
  return entry.entryType === "slot" && entry.roleId
    ? { targetId: entry.nodeId, roleId: entry.roleId }
    : { targetId: entry.nodeId };
}

export function buildTemplateStructureSelectionTargets(
  definition: TemplateDefinitionV2,
  device?: "desktop" | "mobile",
): TemplateEditorSelectionTarget[] {
  return buildStructureRegions(definition).flatMap((region) => [
    { targetId: region.nodeId },
    ...region.entries
      .filter((entry) => entry.entryType === "layout" || isStructureSlotApplicable(entry, device))
      .map(getStructureEntrySelectionTarget),
  ]);
}

export function resolveTemplateStructureSelectionCompatibility(
  definition: TemplateDefinitionV2,
  device: "desktop" | "mobile",
  target: TemplateEditorSelectionTarget,
) {
  if (target.roleId === undefined) return { compatible: true } as const;
  const node = definition.nodes[target.targetId];
  const slot = node?.slotId ? definition.slots[node.slotId] : undefined;
  const moduleType = slot ? getContentTemplateModuleTypeForSlotType(slot.type) : undefined;
  const contract = moduleType ? getContentTemplateContract(moduleType) : undefined;
  const role = contract?.roles.find((candidate) => candidate.id === target.roleId);
  const editable = contract?.editorCapabilities.editableObjects.some(
    (candidate) => candidate.roleId === target.roleId,
  );
  if (!role || !editable) {
    return { compatible: false, reason: `角色“${target.roleId}”不在当前模板的可编辑对象中，未加入多选。` } as const;
  }
  if (!role.appliesTo?.length || role.appliesTo.includes(device)) {
    return { compatible: true } as const;
  }
  const roleLabel = getTemplateContractRoleLabel(target.roleId, role.semantic);
  const appliesTo = role.appliesTo.map((candidate) => candidate === "desktop" ? "桌面端" : "移动端").join("、");
  const current = device === "desktop" ? "桌面端" : "移动端";
  return {
    compatible: false,
    reason: `“${roleLabel}”仅适用于${appliesTo}，当前${current}不能加入多选。`,
  } as const;
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
  panelRef,
  closeButtonRef,
  compactOverlay = false,
  modalOverlay = compactOverlay,
  publishIssueEditing = false,
  onOpenPublishReview,
  onPanelKeyDown,
  onCollapse,
}: {
  panelRef?: Ref<HTMLElement>;
  closeButtonRef?: Ref<HTMLButtonElement>;
  compactOverlay?: boolean;
  modalOverlay?: boolean;
  publishIssueEditing?: boolean;
  onOpenPublishReview?: () => void;
  onPanelKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
  onCollapse?: () => void;
}) {
  const { message, modal } = AntdApp.useApp();
  const draft = useTemplateEditorSession((state) => state.draft);
  const selectedNodeId = useTemplateEditorSession((state) => state.selectedObjectId);
  const selectedContractRole = useTemplateEditorSession((state) => state.selectedContractRole);
  const selectionSnapshot = useTemplateEditorSession((state) => state.selectionSnapshot);
  const device = useTemplateEditorSession((state) => state.device);
  const breakpoint = useTemplateEditorSession((state) => state.breakpoint);
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(() => new Set());
  const selectObject = useTemplateEditorSession((state) => state.selectObject);
  const selectContractRole = useTemplateEditorSession((state) => state.selectContractRole);
  const transitionSelection = useTemplateEditorSession((state) => state.transitionSelection);
  const setDynamicDefinition = useTemplateEditorSession((state) => state.setDynamicDefinition);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [openedMenuNodeId, setOpenedMenuNodeId] = useState<string | null>(null);
  const [dragMarker, setDragMarker] = useState<DragMarker>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const paletteToolsRef = useRef<HTMLDivElement>(null);
  const [focusedTreeItemKey, setFocusedTreeItemKey] = useState<string | null>(null);
  const [selectionExclusion, setSelectionExclusion] = useState<TemplateEditorSelectionExclusion | null>(null);
  const treeItemElements = useRef(new Map<string, HTMLDivElement>());
  const regions = useMemo(
    () => draft ? buildStructureRegions(draft.definition).map((region) => ({ ...region, ...resolveStructureVisibility(draft.definition, region.nodeId, breakpoint), entries: region.entries.map((entry) => ({ ...entry, ...resolveStructureVisibility(draft.definition, entry.nodeId, breakpoint), hidden: entry.hidden || resolveStructureVisibility(draft.definition, entry.nodeId, breakpoint).hidden })) })) : [],
    [draft, breakpoint],
  );
  const displayedRegions = useMemo(() => regions.map((region) => ({
    ...region,
    entries: collapsedNodeIds.has(region.nodeId) ? [] : region.entries.filter((entry) => {
      let parentId = draft ? findDynamicTemplateParentId(draft.definition, entry.nodeId) : null;
      while (parentId && draft) {
        if (collapsedNodeIds.has(parentId)) return false;
        parentId = findDynamicTemplateParentId(draft.definition, parentId);
      }
      return true;
    }),
  })), [regions, collapsedNodeIds, draft]);
  const toggleNodeExpanded = (nodeId: string) => setCollapsedNodeIds((current) => {
    const next = new Set(current);
    if (next.has(nodeId)) next.delete(nodeId); else next.add(nodeId);
    return next;
  });
  useEffect(() => { setCollapsedNodeIds(new Set()); }, [draft?.definition.templateId]);
  useEffect(() => { setOpenedMenuNodeId(null); }, [draft?.definition.templateId, selectedNodeId]);
  useEffect(() => {
    if (!draft || !selectedNodeId) return;
    setCollapsedNodeIds((current) => {
      const next = new Set(current);
      let parentId = findDynamicTemplateParentId(draft.definition, selectedNodeId);
      while (parentId) { next.delete(parentId); parentId = findDynamicTemplateParentId(draft.definition, parentId); }
      return next.size === current.size ? current : next;
    });
  }, [draft, selectedNodeId]);
  const visibleTreeItemKeys = useMemo(
    () => getVisibleTreeItemKeys(displayedRegions, device),
    [device, displayedRegions],
  );
  const visibleSelectionTargets = useMemo(
    () => displayedRegions.flatMap((region) => [{ targetId: region.nodeId }, ...region.entries.filter((entry) => entry.entryType === "layout" || isStructureSlotApplicable(entry, device)).map(getStructureEntrySelectionTarget)]),
    [device, displayedRegions],
  );
  const selectedTreeItemKey = useMemo(() => {
    for (const region of regions) {
      if (selectedNodeId === region.nodeId && !selectedContractRole) {
        return getRegionTreeItemKey(region);
      }
      for (const entry of region.entries) {
        if (entry.entryType === "layout") {
          if (selectedNodeId === entry.nodeId && !selectedContractRole) {
            return getEntryTreeItemKey(entry);
          }
          continue;
        }
        const selected = entry.roleId
          ? selectedContractRole?.nodeId === entry.nodeId
            && entry.responsiveOptions.some((option) => option.roleId === selectedContractRole.roleId)
          : selectedNodeId === entry.nodeId && !selectedContractRole;
        if (selected) return getEntryTreeItemKey(entry);
      }
    }
    return null;
  }, [regions, selectedContractRole, selectedNodeId]);
  useEffect(() => {
    if (!selectedTreeItemKey) return;
    const frame = requestAnimationFrame(() => treeItemElements.current.get(selectedTreeItemKey)?.scrollIntoView({ block: "nearest", inline: "nearest" }));
    return () => cancelAnimationFrame(frame);
  }, [selectedTreeItemKey, collapsedNodeIds]);
  const rovingTreeItemKey = resolveRovingTreeItemKey(
    visibleTreeItemKeys,
    focusedTreeItemKey,
    selectedTreeItemKey,
  );
  const structureAudit = useMemo(
    () => draft ? buildTemplateStructureAudit(draft.definition) : null,
    [draft],
  );
  useEffect(() => {
    setFocusedTreeItemKey((current) => resolveRovingTreeItemKey(
      visibleTreeItemKeys,
      current,
      selectedTreeItemKey,
    ));
  }, [selectedTreeItemKey, visibleTreeItemKeys]);
  useEffect(() => {
    setSelectionExclusion(null);
  }, [draft?.definition.templateId, device]);
  if (!draft) return null;

  const definition = draft.definition;
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
    ? structureAudit.issues
    : [];
  const selectTreeTarget = (
    target: TemplateEditorSelectionTarget,
    modifiers: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean } = {},
  ) => {
    const result = transitionSelection({
      target,
      visibleTargets: visibleSelectionTargets,
      ctrlKey: modifiers.ctrlKey,
      metaKey: modifiers.metaKey,
      shiftKey: modifiers.shiftKey,
      resolveCompatibility: (candidate) => (
        resolveTemplateStructureSelectionCompatibility(definition, device, candidate)
      ),
    });
    if (!result) return;
    if (result.ok) {
      setSelectionExclusion(null);
      return;
    }
    setSelectionExclusion(result.exclusions[0] ?? null);
  };
  const selectSlot = (
    slot: StructureSlot,
    modifiers: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean } = {},
  ) => {
    selectTreeTarget(getStructureEntrySelectionTarget(slot), modifiers);
  };
  const setTreeItemElement = (key: string, element: HTMLDivElement | null) => {
    if (element) treeItemElements.current.set(key, element);
    else treeItemElements.current.delete(key);
  };
  const handleTreeItemKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    treeItemKey: string,
    selectionTarget: TemplateEditorSelectionTarget,
  ) => {
    if (event.target !== event.currentTarget) return;
    if (
      !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey
      && (event.key === "ArrowLeft" || event.key === "ArrowRight")
      && event.currentTarget.hasAttribute("aria-expanded")
    ) {
      event.preventDefault();
      event.stopPropagation();
      setCollapsedNodeIds((current) => {
        const shouldCollapse = event.key === "ArrowLeft";
        if (current.has(selectionTarget.targetId) === shouldCollapse) return current;
        const next = new Set(current);
        if (shouldCollapse) next.add(selectionTarget.targetId);
        else next.delete(selectionTarget.targetId);
        return next;
      });
      setFocusedTreeItemKey(treeItemKey);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectTreeTarget(
        selectionTarget,
        event.key === "Enter" ? {} : event,
      );
      return;
    }
    const currentIndex = visibleTreeItemKeys.indexOf(treeItemKey);
    if (currentIndex < 0 || visibleTreeItemKeys.length === 0) return;
    let targetIndex: number;
    if (event.key === "ArrowDown") {
      targetIndex = Math.min(currentIndex + 1, visibleTreeItemKeys.length - 1);
    } else if (event.key === "ArrowUp") {
      targetIndex = Math.max(currentIndex - 1, 0);
    } else if (event.key === "Home") {
      targetIndex = 0;
    } else if (event.key === "End") {
      targetIndex = visibleTreeItemKeys.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    const targetKey = visibleTreeItemKeys[targetIndex];
    setFocusedTreeItemKey(targetKey);
    treeItemElements.current.get(targetKey)?.focus();
  };

  const isSelectionTargetSelected = (target: TemplateEditorSelectionTarget) => (
    selectionSnapshot.targets.some((candidate) => (
      isSameTemplateEditorSelectionTarget(candidate, target)
    ))
  );
  const selectionDataAttributes = (target: TemplateEditorSelectionTarget) => ({
    "data-selection-target-id": target.targetId,
    ...(target.roleId !== undefined ? { "data-selection-role-id": target.roleId } : {}),
    "data-selection-primary": isSameTemplateEditorSelectionTarget(
      selectionSnapshot.primaryTarget,
      target,
    ) ? "true" : undefined,
    "data-selection-anchor": isSameTemplateEditorSelectionTarget(
      selectionSnapshot.anchorTarget,
      target,
    ) ? "true" : undefined,
  });
  const selectionExclusionMessage = selectionExclusion?.code === "TARGET_LOCKED"
    ? (() => {
        const targetName = definition.nodes[selectionExclusion.target.targetId]?.name ?? selectionExclusion.target.targetId;
        const ownerName = selectionExclusion.lockOwnerId
          ? definition.nodes[selectionExclusion.lockOwnerId]?.name ?? selectionExclusion.lockOwnerId
          : null;
        return ownerName && selectionExclusion.lockOwnerId !== selectionExclusion.target.targetId
          ? `“${targetName}”位于已锁定的“${ownerName}”内，未加入多选。`
          : `“${targetName}”已锁定，未加入多选。`;
      })()
    : selectionExclusion?.reason ?? null;

  const showStructureCommandError = (content: string) => {
    message.open({
      key: STRUCTURE_COMMAND_FEEDBACK_KEY,
      type: "error",
      content,
      duration: 0,
    });
  };

  const applyStructureDefinition = (
    next: TemplateDefinitionV2,
    options: {
      onSuccess?: () => void;
      successMessage?: string;
    } = {},
  ) => {
    const result = setDynamicDefinition(next);
    if (!result.ok) {
      showStructureCommandError(result.code === "STRUCTURE_LOCKED"
        ? `${result.message} 请先解除提示中对象或其上级对象的结构锁定后重试。`
        : `${result.message} 请检查当前模板结构后重试。`);
      return false;
    }
    if (!result.changed) {
      message.destroy(STRUCTURE_COMMAND_FEEDBACK_KEY);
      return false;
    }
    options.onSuccess?.();
    if (options.successMessage) {
      message.open({
        key: STRUCTURE_COMMAND_FEEDBACK_KEY,
        type: "success",
        content: options.successMessage,
      });
    } else {
      message.destroy(STRUCTURE_COMMAND_FEEDBACK_KEY);
    }
    return true;
  };

  const executeStructureTransform = (
    label: string,
    transform: (current: TemplateDefinitionV2) => TemplateDefinitionV2,
    options: {
      onSuccess?: () => void;
      successMessage?: string;
    } = {},
  ) => {
    const result = useTemplateEditorSession.getState().executeCommand({
      type: "transform-definition",
      label,
      transform,
    });
    if (!result.ok) {
      showStructureCommandError(result.code === "STRUCTURE_LOCKED"
        ? `${result.message} 请先解除提示中对象或其上级对象的结构锁定后重试。`
        : `${result.message} 请检查当前模板结构后重试。`);
      return false;
    }
    if (!result.changed) return false;
    options.onSuccess?.();
    if (options.successMessage) {
      message.open({
        key: STRUCTURE_COMMAND_FEEDBACK_KEY,
        type: "success",
        content: options.successMessage,
      });
    } else {
      message.destroy(STRUCTURE_COMMAND_FEEDBACK_KEY);
    }
    return true;
  };

  const renameNode = (nodeId: string, name: string) => {
    const currentDraft = useTemplateEditorSession.getState().draft;
    if (!currentDraft || currentDraft.definition.nodes[nodeId]?.name === name) {
      setEditingNodeId(null);
      return;
    }
    const next = structuredClone(currentDraft.definition);
    next.nodes[nodeId].name = name.slice(0, TEMPLATE_NODE_NAME_MAX_LENGTH);
    applyStructureDefinition(next, { onSuccess: () => setEditingNodeId(null) });
  };

  const setContractRoleRemoved = (slot: StructureSlot, removed: boolean) => {
    if (!slot.virtual || !slot.roleIds.length) return;
    if (removed && (slot.required || !slot.hideable)) {
      showStructureCommandError(slot.required
        ? `“${slot.label}”是母模板合同必填内容，不能移出。请保留该内容，并在合同允许的范围内调整布局或样式。`
        : `“${slot.label}”的母模板合同不允许移出。请保留该内容，并在合同允许的范围内调整布局或样式。`);
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
    applyStructureDefinition(next, {
      onSuccess: () => selectSlot(slot),
      successMessage: removed ? `已将“${slot.label}”移出当前模板` : `已恢复“${slot.label}”`,
    });
  };

  const selectIssue = (issue: TemplateStructureIssue) => {
    if (issue.device) useTemplateEditorSession.getState().setBreakpoint(issue.device);
    const nodeId = issue.nodeId && definition.nodes[issue.nodeId]
      ? issue.nodeId
      : definition.rootNodeId;
    if (issue.roleId) selectContractRole(nodeId, issue.roleId);
    else selectObject(nodeId);
  };

  const repairIssue = (issue: TemplateStructureIssue) => {
    if (issue.repair === "add-slot") {
      // 复用添加入口的当前选择、合法落点和焦点恢复；打开流程不写入结构。
      paletteToolsRef.current?.querySelector<HTMLButtonElement>('button[aria-label="添加槽位"]')?.click();
      return;
    }
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
      applyStructureDefinition(next, {
        onSuccess: () => selectObject(issue.nodeId!),
        successMessage: "已允许页面填写必填槽位。",
      });
      return;
    }
    if (issue.repair === "disable-required-slot-page-hide" && issue.nodeId) {
      const target = currentDraft.definition.nodes[issue.nodeId];
      const slotId = target?.slotId;
      if (!slotId || !currentDraft.definition.slots[slotId]?.hideable) return;
      const next = structuredClone(currentDraft.definition);
      next.slots[slotId].hideable = false;
      applyStructureDefinition(next, {
        onSuccess: () => selectObject(issue.nodeId!),
        successMessage: "已关闭必填槽位的页面隐藏权限。",
      });
      return;
    }
    if (issue.repair === "restore-required-slot-device" && issue.nodeId && issue.device) {
      const target = currentDraft.definition.nodes[issue.nodeId];
      if (!target) return;
      const rules = resolveTemplateNodeRules(currentDraft.definition, issue.nodeId, issue.device);
      if (rules.display !== "none" && !rules.hidden) return;
      const next = structuredClone(currentDraft.definition);
      setTemplateNodeRule(next, issue.nodeId, issue.device, "hidden", false);
      if (rules.display === "none") {
        const upstream: TemplateBreakpoint[] = issue.device === "mobile" ? ["tablet", "desktop"] : issue.device === "tablet" ? ["desktop"] : [];
        const display = upstream.map((breakpoint) => resolveTemplateNodeRules(next, issue.nodeId!, breakpoint).display)
          .find((value) => value !== "none") ?? createDefaultDynamicTemplateResponsiveRules(target.type).display;
        setTemplateNodeRule(next, issue.nodeId, issue.device, "display", display);
      }
      applyStructureDefinition(next, {
        onSuccess: () => selectIssue(issue),
        successMessage: "已取消此来源的断点隐藏；请核对其余上级与子内容的显隐设置。",
      });
      return;
    }
    if (issue.repair === "restore-required-slot" && issue.nodeId) {
      const target = currentDraft.definition.nodes[issue.nodeId];
      if (!target?.hidden) return;
      applyStructureDefinition(
        setDynamicTemplateNodeHidden(currentDraft.definition, issue.nodeId, false),
        {
          onSuccess: () => selectObject(issue.nodeId!),
          successMessage: "已取消此来源的全局隐藏；各断点及其余上级的显隐设置保持不变。",
        },
      );
      return;
    }
    try {
      let next = currentDraft.definition;
      let parentId = next.nodes[next.rootNodeId]?.childIds.find((nodeId) => (
        getDynamicTemplateNodeRegistryEntry(next.nodes[nodeId].type).kind === "structure"
      ));
      if (!parentId) {
        const region = addConfiguredTemplateRegion(next);
        next = region.definition;
        parentId = region.nodeId;
      }
      if (issue.repair === "add-region") {
        applyStructureDefinition(next, { onSuccess: () => selectObject(parentId) });
        return;
      }
    } catch (error) {
      showStructureCommandError(`${error instanceof Error ? error.message : "结构修复失败"} 请检查当前模板结构后重试。`);
    }
  };

  const performDrop = (
    draggedNodeId: string,
    targetNodeId: string,
    placement: DropPlacement,
  ) => {
    setDragMarker(null);
    setDraggingNodeId(null);
    const currentDraft = useTemplateEditorSession.getState().draft;
    if (!currentDraft) return;
    const currentDefinition = currentDraft.definition;
    if (draggedNodeId === currentDefinition.rootNodeId || draggedNodeId === targetNodeId) return;
    try {
      const landing = resolveDynamicTemplateMoveLanding(currentDefinition, draggedNodeId, {
        targetNodeId,
        placement,
      });
      if (!landing) return;
      const nextDefinition = moveDynamicTemplateNodeToLanding(currentDefinition, draggedNodeId, landing);
      applyStructureDefinition(nextDefinition, { onSuccess: () => selectObject(draggedNodeId) });
    } catch (error) {
      showStructureCommandError(`${error instanceof Error ? error.message : "结构排序失败"} 请检查目标层级后重试。`);
    }
  };

  const canPreviewDrop = (targetNodeId: string, placement: DropPlacement) => {
    if (!draggingNodeId) return false;
    const currentDefinition = useTemplateEditorSession.getState().draft?.definition;
    if (!currentDefinition) return false;
    const landing = resolveDynamicTemplateMoveLanding(currentDefinition, draggingNodeId, {
      targetNodeId,
      placement,
    });
    return Boolean(landing && !landing.disabledReason);
  };

  const openMoveDialog = (nodeId: string) => {
    const current = useTemplateEditorSession.getState().draft?.definition;
    if (!current) return;
    const landings = getDynamicTemplateMoveLandings(current, nodeId)
      .filter((landing) => !landing.disabledReason);
    if (!landings.length) {
      showStructureCommandError("当前对象没有可用的移动目标。请先解除目标锁定或调整结构。");
      return;
    }
    let selectedLandingId = landings[0].landingId;
    modal.confirm({
      title: `移动“${current.nodes[nodeId].name}”到…`,
      content: (
        <label className="template-editor__move-field">
          <span>合法目标与落点</span>
          <select
            aria-label="移动目标与落点"
            defaultValue={selectedLandingId}
            onChange={(event) => { selectedLandingId = event.target.value; }}
          >
            {landings.map((landing) => (
              <option key={landing.landingId} value={landing.landingId}>{landing.pathLabel}</option>
            ))}
          </select>
        </label>
      ),
      okText: "确认移动",
      cancelText: "取消",
      onOk: () => {
        const landing = landings.find((candidate) => candidate.landingId === selectedLandingId);
        if (!landing) return;
        executeStructureTransform(
          "移动模板对象",
          (definition) => moveDynamicTemplateNodeToLanding(definition, nodeId, landing),
          { onSuccess: () => selectObject(nodeId) },
        );
      },
    });
  };

  const groupNode = (
    nodeId: string,
    kind: Exclude<DynamicTemplateLayoutGroupKind, "empty">,
    includeNext: boolean,
  ) => {
    const current = useTemplateEditorSession.getState().draft?.definition;
    if (!current) return;
    const parentId = findDynamicTemplateParentId(current, nodeId);
    if (!parentId) return;
    const siblings = current.nodes[parentId].childIds;
    const nodeIndex = siblings.indexOf(nodeId);
    const nodeIds = includeNext && siblings[nodeIndex + 1]
      ? [nodeId, siblings[nodeIndex + 1]]
      : [nodeId];
    let groupId = "";
    executeStructureTransform(`组合为${GROUP_MENU_KINDS.find((item) => item.kind === kind)?.label ?? "布局组"}`, (definition) => {
      const result = groupDynamicTemplateNodes(definition, nodeIds, kind);
      groupId = result.nodeId;
      return result.definition;
    }, { onSuccess: () => selectObject(groupId) });
  };

  const ungroupNode = (nodeId: string) => {
    const parentId = findDynamicTemplateParentId(definition, nodeId);
    executeStructureTransform(
      "解除布局分组",
      (current) => ungroupDynamicTemplateNode(current, nodeId),
      { onSuccess: () => selectObject(parentId) },
    );
  };

  const performAction = (action: StructureAction, nodeId: string) => {
    const currentDraft = useTemplateEditorSession.getState().draft;
    if (!currentDraft) return;
    const node = currentDraft.definition.nodes[nodeId];
    if (!node) return;
    const slot = node.slotId ? currentDraft.definition.slots[node.slotId] : undefined;
    if (action === "toggle" && !node.hidden && slot?.required) {
      showStructureCommandError(
        `“${slot.label}”是母模板必填槽位，不能隐藏。请保留该槽位，并调整允许的布局或样式。`,
      );
      return;
    }
    if (action === "delete" && slot?.required) {
      modal.confirm({
        title: `删除必填槽位“${slot.label}”？`,
        content: "该动作会先取消页面必填要求，再删除当前槽位；两步作为一次操作，可一次撤销恢复。",
        okText: "取消必填并删除",
        okButtonProps: { danger: true },
        cancelText: "继续保留",
        onOk: () => executeStructureTransform("取消必填并删除槽位", (definition) => {
          const next = structuredClone(definition);
          const currentSlotId = next.nodes[nodeId]?.slotId;
          if (!currentSlotId || !next.slots[currentSlotId]) return definition;
          next.slots[currentSlotId].required = false;
          return removeDynamicTemplateNode(next, nodeId);
        }, { onSuccess: () => selectObject(findDynamicTemplateParentId(currentDraft.definition, nodeId)) }),
      });
      return;
    }
    const apply = () => {
      try {
        if (action === "duplicate") {
          const result = duplicateDynamicTemplateNode(currentDraft.definition, nodeId);
          applyStructureDefinition(result.definition, { onSuccess: () => selectObject(result.nodeId) });
          return;
        }
        if (action === "toggle") {
          applyStructureDefinition(setDynamicTemplateNodeHidden(currentDraft.definition, nodeId, !node.hidden));
          return;
        }
        if (action === "lock") {
          applyStructureDefinition(setDynamicTemplateNodeStructureLocked(
            currentDraft.definition,
            nodeId,
            !isDynamicTemplateStructureLocked(node),
          ));
          return;
        }
        if (action === "delete") {
          applyStructureDefinition(removeDynamicTemplateNode(currentDraft.definition, nodeId), {
            onSuccess: () => selectObject(findDynamicTemplateParentId(currentDraft.definition, nodeId)),
          });
          return;
        }
        const landing = resolveDynamicTemplateMoveShortcutLanding(
          currentDraft.definition,
          nodeId,
          action,
        );
        if (!landing) return;
        applyStructureDefinition(
          moveDynamicTemplateNodeToLanding(currentDraft.definition, nodeId, landing),
          { onSuccess: () => selectObject(nodeId) },
        );
      } catch (error) {
        showStructureCommandError(`${error instanceof Error ? error.message : "结构操作失败"} 请检查当前层级和锁定状态后重试。`);
      }
    };
    if (action !== "delete") {
      apply();
      return;
    }
    modal.confirm({
      title: slot ? `删除“${node.name}”？` : `删除“${node.name}”及其内容？`,
      content: slot ? "该槽位将从当前草稿移除，可以撤销。已保存的模板版本保持原样。" : describeDynamicTemplateRemoval(currentDraft.definition, nodeId),
      okText: "删除节点",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: apply,
    });
  };

  // 落点校验会模拟移动整个模板，只在打开对应菜单时计算，避免每行渲染都重复克隆。
  const buildNodeMenu = (nodeId: string, region: boolean, layout: boolean): MenuProps => {
    const parentId = findDynamicTemplateParentId(definition, nodeId);
    const siblings = parentId ? definition.nodes[parentId]?.childIds ?? [] : [];
    const siblingIndex = siblings.indexOf(nodeId);
    const node = definition.nodes[nodeId];
    const slot = node.slotId ? definition.slots[node.slotId] : undefined;
    const selfLocked = isDynamicTemplateStructureLocked(node);
    const locked = isDynamicTemplateStructureProtected(definition, nodeId);
    const lockOwnerId = getDynamicTemplateStructureLockOwnerId(definition, nodeId);
    const parentLocked = Boolean(
      parentId && isDynamicTemplateStructureProtected(definition, parentId),
    );
    const shortcutLandings = {
      up: resolveDynamicTemplateMoveShortcutLanding(definition, nodeId, "up"),
      down: resolveDynamicTemplateMoveShortcutLanding(definition, nodeId, "down"),
      indent: resolveDynamicTemplateMoveShortcutLanding(definition, nodeId, "indent"),
      outdent: resolveDynamicTemplateMoveShortcutLanding(definition, nodeId, "outdent"),
    };
    const groupDisabledReasons = Object.fromEntries(GROUP_MENU_KINDS.map((item) => [
      item.kind,
      getDynamicTemplateGroupDisabledReason(definition, [nodeId], item.kind),
    ])) as Record<Exclude<DynamicTemplateLayoutGroupKind, "empty">, string | null>;
    const groupWithNextDisabledReasons = Object.fromEntries(GROUP_MENU_KINDS.map((item) => [
      item.kind,
      siblingIndex >= 0 && siblings[siblingIndex + 1]
        ? getDynamicTemplateGroupDisabledReason(definition, [nodeId, siblings[siblingIndex + 1]], item.kind)
        : "没有下一对象",
    ])) as Record<Exclude<DynamicTemplateLayoutGroupKind, "empty">, string | null>;
    const ungroupDisabledReason = layout
      ? getDynamicTemplateUngroupDisabledReason(definition, nodeId)
      : null;
    const protectedActionReason = locked
      ? selfLocked ? "当前对象已锁定" : "上级对象已锁定"
      : parentLocked ? "上级对象已锁定" : null;
    const disabledActionLabel = (label: string, reason: string | null | undefined) => (
      reason ? `${label}（不可用：${reason}）` : label
    );
    const requiredSlotVisible = Boolean(slot?.required && !node.hidden);
    const deleteLabel = region ? "删除区域" : layout ? "删除容器" : "删除槽位";
    return {
          items: [
            {
              key: "rename",
              label: region ? "重命名区域" : layout ? "重命名容器" : "重命名槽位",
              disabled: locked,
            },
            { key: "up", icon: <ArrowUpOutlined aria-hidden="true" />, label: "上移", disabled: !shortcutLandings.up || Boolean(shortcutLandings.up.disabledReason) },
            { key: "down", icon: <ArrowDownOutlined aria-hidden="true" />, label: "下移", disabled: !shortcutLandings.down || Boolean(shortcutLandings.down.disabledReason) },
            { key: "move", label: "移动到…", disabled: locked || parentLocked },
            ...(!slot ? [
              { key: "indent", label: "移入上一个容器", disabled: !shortcutLandings.indent || Boolean(shortcutLandings.indent.disabledReason) },
              { key: "outdent", label: "移出当前容器", disabled: !shortcutLandings.outdent || Boolean(shortcutLandings.outdent.disabledReason) },
            ] : []),
            ...(!region ? [{ key: "grouping", label: "排列与分组", children: [
            ...(!region ? GROUP_MENU_KINDS.map((item) => ({
              key: `group:${item.kind}`,
              label: disabledActionLabel(`组合为${item.label}`, protectedActionReason ?? groupDisabledReasons[item.kind]),
              title: protectedActionReason ?? groupDisabledReasons[item.kind] ?? undefined,
              disabled: locked || parentLocked || Boolean(groupDisabledReasons[item.kind]),
            })) : []),
            ...(!region && siblingIndex >= 0 && siblingIndex < siblings.length - 1 ? GROUP_MENU_KINDS.map((item) => ({
              key: `group-next:${item.kind}`,
              label: disabledActionLabel(`与下一对象组合为${item.label}`, protectedActionReason ?? groupWithNextDisabledReasons[item.kind]),
              title: protectedActionReason ?? groupWithNextDisabledReasons[item.kind] ?? undefined,
              disabled: locked || parentLocked || Boolean(groupWithNextDisabledReasons[item.kind]),
            })) : []),
            ...(layout ? [{
              key: "ungroup",
              label: disabledActionLabel("解除布局分组", protectedActionReason ?? ungroupDisabledReason),
              title: protectedActionReason ?? ungroupDisabledReason ?? undefined,
              disabled: locked || parentLocked || Boolean(ungroupDisabledReason),
            }] : []),
            ] }] : []),
            { key: "duplicate", icon: <CopyOutlined aria-hidden="true" />, label: region ? "复制区域" : layout ? "复制容器" : "复制槽位", disabled: locked || parentLocked },
            {
              key: "lock",
              icon: selfLocked ? <UnlockOutlined aria-hidden="true" /> : <LockOutlined aria-hidden="true" />,
              label: selfLocked
                ? "解除锁定"
                : locked
                  ? "已由上级锁定"
                  : region ? "锁定区域" : layout ? "锁定容器" : "锁定槽位",
              disabled: locked && !selfLocked,
            },
            ...(locked && !selfLocked && lockOwnerId ? [{
              key: "locate-lock-owner",
              label: "定位并选择上级",
            }] : []),
            {
              key: "toggle",
              icon: node.hidden ? <EyeOutlined aria-hidden="true" /> : <EyeInvisibleOutlined aria-hidden="true" />,
              label: node.hidden
                ? "取消全局隐藏（所有设备）"
                : requiredSlotVisible
                  ? "全局隐藏（必填槽位不可用）"
                  : node.childIds.length > 0 ? "全局隐藏（所有设备及子内容）" : "全局隐藏（所有设备）",
              title: node.hidden
                ? "取消此对象的全局隐藏；对象及子内容仍受上级和各断点显隐设置影响，不保证立即可见。"
                : "影响所有设备；隐藏容器时，其内部内容一起不可见。各断点显隐设置保持不变。",
              disabled: locked || requiredSlotVisible,
            },
            { type: "divider" },
            {
              key: "delete",
              icon: <DeleteOutlined aria-hidden="true" />,
              label: slot?.required ? `${deleteLabel}…` : deleteLabel,
              danger: true,
              disabled: locked || parentLocked,
            },
          ],
          onClick: ({ key, domEvent }) => {
            domEvent.stopPropagation();
            setOpenedMenuNodeId(null);
            if (key === "rename") {
              setEditingNodeId(nodeId);
              return;
            }
            if (key === "move") {
              openMoveDialog(nodeId);
              return;
            }
            if (key === "ungroup") {
              ungroupNode(nodeId);
              return;
            }
            if (key === "locate-lock-owner" && lockOwnerId) {
              selectObject(lockOwnerId);
              return;
            }
            if (key.startsWith("group:")) {
              groupNode(nodeId, key.slice("group:".length) as Exclude<DynamicTemplateLayoutGroupKind, "empty">, false);
              return;
            }
            if (key.startsWith("group-next:")) {
              groupNode(nodeId, key.slice("group-next:".length) as Exclude<DynamicTemplateLayoutGroupKind, "empty">, true);
              return;
            }
            if (key === "up" || key === "down" || key === "indent" || key === "outdent" || key === "duplicate" || key === "toggle" || key === "lock" || key === "delete") {
              performAction(key, nodeId);
            }
          },
    };
  };

  const nodeMenu = (nodeId: string, rawName: string, region: boolean, layout = false) => {
    const open = openedMenuNodeId === nodeId;
    return (
      <Dropdown
        trigger={["click"]}
        open={open}
        onOpenChange={(nextOpen) => setOpenedMenuNodeId((current) => nextOpen ? nodeId : current === nodeId ? null : current)}
        menu={open ? buildNodeMenu(nodeId, region, layout) : { items: [] }}
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
    <aside
      ref={panelRef}
      className="homepage-editor__structure-workspace template-editor__structure template-editor__structure--reference"
      aria-label="模板结构"
      role={modalOverlay ? "dialog" : undefined}
      aria-modal={modalOverlay ? "true" : undefined}
      tabIndex={modalOverlay ? -1 : undefined}
      data-compact-overlay={compactOverlay ? "structure" : undefined}
      data-compact-overlay-open={compactOverlay || undefined}
      onKeyDown={onPanelKeyDown}
    >
      <WorkspacePanelHeader
        icon={<BlockOutlined />}
        title="模板结构"
        actions={onCollapse || publishIssueEditing ? (
          <span className="template-editor__structure-header-actions">
            {publishIssueEditing ? (
              <Button
                size="small"
                type="link"
                aria-label="返回已过期发布检查"
                onClick={onOpenPublishReview}
              >返回过期检查</Button>
            ) : null}
            {onCollapse ? (
              <WorkspacePanelCollapseButton
                ref={closeButtonRef}
                action="collapse"
                panel="structure"
                panelLabel="模板结构面板"
                onClick={onCollapse}
              />
            ) : null}
          </span>
        ) : undefined}
      />
      <button
        type="button"
        className="template-editor__root-select"
        aria-label="模板整体"
        aria-pressed={selectedNodeId === definition.rootNodeId && !selectedContractRole}
        onClick={() => {
          selectObject(definition.rootNodeId);
          setSelectionExclusion(null);
        }}
      >
        <BlockOutlined aria-hidden="true" />
        <span>
          <strong>模板整体</strong>
          <span>名称、尺寸与样式</span>
        </span>
      </button>
      <div className="template-editor__structure-scroll">
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
                    {issue.repair ? <button type="button" onClick={() => repairIssue(issue)}>{issue.repair === "add-slot" ? "选择内容" : "修复"}</button> : null}
                  </li>
                ))}
              </ul>

            </div>
          </section>
        ) : null}

        {selectionExclusion && selectionExclusionMessage ? (
          <div
            className="template-editor__selection-exclusion"
            role="status"
            aria-label="多选目标已排除"
            data-selection-exclusion-code={selectionExclusion.code}
            data-selection-exclusion-target-id={selectionExclusion.target.targetId}
            data-selection-exclusion-role-id={selectionExclusion.target.roleId}
            data-selection-exclusion-reason={selectionExclusionMessage}
          >
            {selectionExclusionMessage}
          </div>
        ) : null}

        <ol className="template-editor__region-list" role="tree" aria-label="模板区域与槽位">
          {displayedRegions.map((region) => {
            const regionSelectionTarget = { targetId: region.nodeId };
            const regionSelected = isSelectionTargetSelected(regionSelectionTarget);
            const regionLabel = regions.length === 1 && region.contractBacked ? "内容区域" : region.label;
            const regionTreeItemKey = getRegionTreeItemKey(region);
            return (
              <li
                key={region.nodeId}
                role="none"
                className={`template-editor__region${region.hidden ? " is-hidden" : ""}${region.locked ? " is-locked" : ""}`}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragMarker(null);
                }}
              >
                <div
                  className={`template-editor__region-header${regionSelected ? " is-active" : ""}${dragMarker?.nodeId === region.nodeId ? ` is-drag-${dragMarker.placement}` : ""}`}
                >
                  <div
                    className="template-editor__region-select"
                    role="treeitem"
                    aria-level={2}
                    aria-expanded={!collapsedNodeIds.has(region.nodeId)}
                    aria-selected={regionSelected}
                    aria-label={`${regionLabel}${region.hidden ? " " + (region.visibilityReason ?? "已隐藏") : ""}${region.locked ? " 已锁定" : ""}`}
                    ref={(element) => setTreeItemElement(regionTreeItemKey, element)}
                    tabIndex={rovingTreeItemKey === regionTreeItemKey ? 0 : -1}
                    {...selectionDataAttributes(regionSelectionTarget)}
                    draggable={!region.contractBacked && !region.locked}
                    onClick={(event) => selectTreeTarget(regionSelectionTarget, event)}
                    onFocus={(event) => {
                      if (event.target === event.currentTarget) setFocusedTreeItemKey(regionTreeItemKey);
                    }}
                    onKeyDown={(event) => handleTreeItemKeyDown(event, regionTreeItemKey, regionSelectionTarget)}
                    onDragStart={(event) => {
                      if (region.contractBacked) return;
                      setDraggingNodeId(region.nodeId);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("application/x-haichuan-template-node", region.nodeId);
                      event.dataTransfer.setData("application/x-haichuan-template-region", region.nodeId);
                    }}
                    onDragOver={(event) => {
                      if (region.contractBacked || region.locked) return;
                      if (!event.dataTransfer.types.includes("application/x-haichuan-template-region")) return;
                      const rect = event.currentTarget.getBoundingClientRect();
                      const placement: DropPlacement = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
                      if (!canPreviewDrop(region.nodeId, placement)) return;
                      event.preventDefault();
                      setDragMarker({ nodeId: region.nodeId, placement });
                    }}
                    onDrop={(event) => {
                      if (region.contractBacked || region.locked) return;
                      event.preventDefault();
                      const draggedNodeId = event.dataTransfer.getData("application/x-haichuan-template-region");
                      if (draggedNodeId) performDrop(draggedNodeId, region.nodeId, dragMarker?.placement ?? "after");
                    }}
                    onDragEnd={() => { setDragMarker(null); setDraggingNodeId(null); }}
                  >
                    <span
                      className="template-editor__tree-toggle"
                      aria-hidden="true"
                      onClick={(event) => {
                        event.stopPropagation();
                        event.currentTarget.closest<HTMLElement>('[role="treeitem"]')?.focus();
                        toggleNodeExpanded(region.nodeId);
                      }}
                      onDoubleClick={(event) => event.stopPropagation()}
                    >
                      {collapsedNodeIds.has(region.nodeId) ? <CaretRightOutlined /> : <CaretDownOutlined />}
                    </span>
                    {region.contractBacked ? (
                      <strong>{regionLabel}</strong>
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
                    {!region.contractBacked ? nodeMenu(region.nodeId, region.rawName, true) : null}
                  </div>
                </div>
                <ul role="group" hidden={collapsedNodeIds.has(region.nodeId)} aria-label={`${regionLabel}内容槽位`}>
                  {region.entries.length ? region.entries.map((entry) => {
                    if (entry.entryType === "layout") {
                      const layoutSelectionTarget = getStructureEntrySelectionTarget(entry);
                      const layoutSelected = isSelectionTargetSelected(layoutSelectionTarget);
                      const layoutTreeItemKey = getEntryTreeItemKey(entry);
                      const layoutParentId = findDynamicTemplateParentId(definition, entry.nodeId);
                      const layoutParentLocked = Boolean(
                        layoutParentId
                        && isDynamicTemplateStructureProtected(definition, layoutParentId),
                      );
                      return (
                        <li
                          key={entry.key}
                          role="none"
                          className={`template-editor__layout-row${layoutSelected ? " is-active" : ""}${entry.hidden ? " is-hidden" : ""}${entry.locked ? " is-locked" : ""}${dragMarker?.nodeId === entry.nodeId ? ` is-drag-${dragMarker.placement}` : ""}`}
                        >
                          <div
                            className="template-editor__layout-select"
                            role="treeitem"
                            aria-level={3 + entry.depth}
                            aria-expanded={!collapsedNodeIds.has(entry.nodeId)}
                            aria-selected={layoutSelected}
                            aria-label={`${entry.label} 布局容器${entry.hidden ? " " + (entry.visibilityReason ?? "已隐藏") : ""}${entry.locked ? " 已锁定" : ""}`}
                            ref={(element) => setTreeItemElement(layoutTreeItemKey, element)}
                            tabIndex={rovingTreeItemKey === layoutTreeItemKey ? 0 : -1}
                            {...selectionDataAttributes(layoutSelectionTarget)}
                            style={{ paddingLeft: `calc(4px + ${entry.depth} * var(--template-structure-indent-step, 12px))` }}
                            draggable={!entry.locked && !layoutParentLocked}
                            onClick={(event) => selectTreeTarget(layoutSelectionTarget, event)}
                            onFocus={(event) => {
                              if (event.target === event.currentTarget) setFocusedTreeItemKey(layoutTreeItemKey);
                            }}
                            onKeyDown={(event) => handleTreeItemKeyDown(event, layoutTreeItemKey, layoutSelectionTarget)}
                            onDoubleClick={(event) => {
                              event.stopPropagation();
                              if (!entry.locked) setEditingNodeId(entry.nodeId);
                            }}
                            onDragStart={(event) => {
                              setDraggingNodeId(entry.nodeId);
                              event.dataTransfer.effectAllowed = "move";
                              event.dataTransfer.setData("application/x-haichuan-template-node", entry.nodeId);
                            }}
                            onDragOver={(event) => {
                              if (entry.locked || layoutParentLocked) return;
                              if (!event.dataTransfer.types.includes("application/x-haichuan-template-node")) return;
                              const rect = event.currentTarget.getBoundingClientRect();
                              const offset = (event.clientY - rect.top) / rect.height;
                              const placement: DropPlacement = offset < 0.28 ? "before" : offset > 0.72 ? "after" : "inside";
                              if (!canPreviewDrop(entry.nodeId, placement)) return;
                              event.preventDefault();
                              setDragMarker({ nodeId: entry.nodeId, placement });
                            }}
                            onDrop={(event) => {
                              if (entry.locked || layoutParentLocked) return;
                              event.preventDefault();
                              const draggedNodeId = event.dataTransfer.getData("application/x-haichuan-template-node");
                              if (draggedNodeId) performDrop(draggedNodeId, entry.nodeId, dragMarker?.placement ?? "inside");
                            }}
                            onDragEnd={() => { setDragMarker(null); setDraggingNodeId(null); }}
                          >
                            <span
                              className="template-editor__tree-toggle"
                              aria-hidden="true"
                              onClick={(event) => {
                                event.stopPropagation();
                                event.currentTarget.closest<HTMLElement>('[role="treeitem"]')?.focus();
                                toggleNodeExpanded(entry.nodeId);
                              }}
                              onDoubleClick={(event) => event.stopPropagation()}
                            >
                              {collapsedNodeIds.has(entry.nodeId) ? <CaretRightOutlined /> : <CaretDownOutlined />}
                            </span>
                            <HolderOutlined className="template-editor__drag-handle" aria-hidden="true" />
                            <BlockOutlined className="template-editor__layout-icon" aria-hidden="true" />
                            <InlineStructureName
                              value={entry.label}
                              editing={editingNodeId === entry.nodeId}
                              onBegin={() => { if (!entry.locked) setEditingNodeId(entry.nodeId); }}
                              onCommit={(value) => renameNode(entry.nodeId, value)}
                            />
                            <div className="template-editor__slot-actions">
                              {nodeMenu(entry.nodeId, entry.label, false, true)}
                            </div>
                          </div>
                        </li>
                      );
                    }
                    const slot = entry;
                    const slotTreeItemKey = getEntryTreeItemKey(slot);
                    const slotSelectionTarget = getStructureEntrySelectionTarget(slot);
                    const slotSelected = isSelectionTargetSelected(slotSelectionTarget);
                    const slotApplicable = slot.applicableDevices.length === 0
                      || slot.applicableDevices.includes(device);
                    const slotAccessibleLabel = slot.roleId && !slotApplicable
                      ? `${slot.selectionLabel}（仅${slot.applicableDevices.map((candidate) => candidate === "desktop" ? "桌面端" : "移动端").join("、")}）`
                      : `${slot.label} ${TEMPLATE_CONTRACT_KIND_LABELS[slot.kind]} ${slot.required ? "必填" : "可选"}${slot.virtual && slot.removed ? " 已移出模板" : slot.hidden ? " " + (slot.visibilityReason ?? "已隐藏") : ""}${slot.locked ? " 已锁定" : ""}`;
                    const parentId = findDynamicTemplateParentId(definition, slot.nodeId);
                    const canReorder = !slot.virtual
                      && Boolean(parentId)
                      && !slot.locked
                      && !isDynamicTemplateStructureProtected(definition, parentId!);
                    return (
                      <li
                        key={slot.key}
                        role="none"
                        className={`template-editor__slot-row${slotSelected ? " is-active" : ""}${slot.hidden || slot.removed ? " is-hidden" : ""}${slot.locked ? " is-locked" : ""}${dragMarker?.nodeId === slot.nodeId ? ` is-drag-${dragMarker.placement}` : ""}`}
                      >
                        <div
                          className="template-editor__slot-select"
                          role="treeitem"
                          aria-level={3 + slot.depth}
                          aria-selected={slotSelected}
                          aria-label={slotAccessibleLabel}
                          ref={(element) => setTreeItemElement(slotTreeItemKey, element)}
                          tabIndex={rovingTreeItemKey === slotTreeItemKey ? 0 : -1}
                          {...selectionDataAttributes(slotSelectionTarget)}
                          style={{ paddingLeft: `calc(4px + ${slot.depth} * var(--template-structure-indent-step, 12px))` }}
                          draggable={canReorder && !slot.locked}
                          onClick={(event) => selectSlot(slot, event)}
                          onFocus={(event) => {
                            if (event.target === event.currentTarget) setFocusedTreeItemKey(slotTreeItemKey);
                          }}
                          onKeyDown={(event) => handleTreeItemKeyDown(event, slotTreeItemKey, slotSelectionTarget)}
                          onDoubleClick={(event) => {
                            if (slot.virtual) return;
                            event.stopPropagation();
                            if (!slot.locked) setEditingNodeId(slot.nodeId);
                          }}
                          onDragStart={(event) => {
                            if (!canReorder) return;
                            setDraggingNodeId(slot.nodeId);
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("application/x-haichuan-template-node", slot.nodeId);
                          }}
                          onDragOver={(event) => {
                            if (!canReorder || !event.dataTransfer.types.includes("application/x-haichuan-template-node")) return;
                            const rect = event.currentTarget.getBoundingClientRect();
                            const placement: DropPlacement = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
                            if (!canPreviewDrop(slot.nodeId, placement)) return;
                            event.preventDefault();
                            setDragMarker({ nodeId: slot.nodeId, placement });
                          }}
                          onDrop={(event) => {
                            if (!canReorder) return;
                            event.preventDefault();
                            const draggedNodeId = event.dataTransfer.getData("application/x-haichuan-template-node");
                            if (draggedNodeId) performDrop(draggedNodeId, slot.nodeId, dragMarker?.placement ?? "after");
                          }}
                          onDragEnd={() => { setDragMarker(null); setDraggingNodeId(null); }}
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
                              <small>{slot.virtual && slot.removed ? "已移出" : slot.hidden ? slot.visibilityReason ?? "已隐藏" : slot.required ? "必填" : "可选"}</small>
                            </span>
                          )}
                        {!slot.virtual ? (
                          <div className="template-editor__slot-actions">
                            {nodeMenu(slot.nodeId, slot.label, false)}
                          </div>
                        ) : slot.hideable ? (
                          <div className="template-editor__slot-actions">
                            <button
                              type="button"
                              aria-label={`${slot.label}${slot.removed ? "恢复到模板" : "移出模板"}`}
                              title={slot.removed ? "恢复可选内容" : "移出可选内容（可撤销）"}
                              onClick={(event) => { event.stopPropagation(); setContractRoleRemoved(slot, !slot.removed); }}
                            >
                              {slot.removed ? <EyeOutlined /> : <DeleteOutlined />}
                            </button>
                          </div>
                        ) : slot.virtual ? (
                          <div className="template-editor__slot-actions">
                            <button
                              type="button"
                              aria-label={`${slot.label}不能移出模板`}
                              title={slot.required ? "母模板合同必填内容不能移出" : "母模板合同不允许移出"}
                              onClick={(event) => { event.stopPropagation(); setContractRoleRemoved(slot, true); }}
                            >
                              <LockOutlined />
                            </button>
                          </div>
                        ) : null}
                        </div>
                      </li>
                    );
                  }) : (
                    <li className="template-editor__region-empty" role="none">
                      <span>暂无内容</span>
                    </li>
                  )}
                </ul>
              </li>
            );
          })}
        </ol>
      </div>
      <div ref={paletteToolsRef}>
        <DynamicTemplateNodePalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      </div>
      <p className="template-editor__structure-note">拖动调整顺序 · 右侧设置属性</p>
    </aside>
  );
}
