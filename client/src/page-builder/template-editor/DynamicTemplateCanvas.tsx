import { useEffect, useMemo, useRef, useState } from "react";
import { App as AntdApp, Button } from "antd";
import { focusFirstInvalidNumberField } from "../inspector/controls/NumberField";
import {
  compileDynamicTemplateRenderPlan,
  canNestDynamicTemplateNode,
  getDynamicTemplateNodeRegistryEntry,
  resolveDynamicTemplateMoveLanding,
  moveDynamicTemplateNodeToLanding,
  duplicateDynamicTemplateNode,
  DynamicTemplateRenderer,
  editableTargetToVisualKind,
  formatTemplateRatio,
  getExplicitContractRolePresentation,
  getDynamicTemplateStructureLockOwnerId,
  removeDynamicTemplateNode,
  resolveEditableTargets,
  resolveTemplateDesignFrame,
  setTemplateDesignHeightMode,
  setTemplateDesignWidth,
  setDynamicTemplateNodeHidden,
} from "../template-definition";
import type { TemplateDefinitionV2, DynamicTemplateDefinitionCommand } from "../template-definition";
import { resolveTemplateDefinitionForBreakpoint, resolveTemplateNodeRules, resolveTemplateSlotRules, setTemplateNodeRule, setTemplateSlotRule } from "../template-definition/responsive";
import { objectPositionToPercent, percentToExactObjectPosition } from "../template-definition/imagePosition";
import {
  findContentTemplateEditableObject,
  getContentTemplateContract,
  getContentTemplateDefaultRect,
  sanitizeContentTemplateLayoutData,
} from "../generated/contentTemplates.generated";
import type {
  ContentTemplateSizeCompatibility,
  ContentTemplateVisualRect,
} from "../generated/contentTemplates.generated";
import {
  getContentTemplateModuleTypeForSlotType,
} from "../template-definition/validateTemplateDefinition";
import { setVisualOverridePath } from "../runtime/visualLayout";
import {
  CANVAS_VISUAL_EDIT_MESSAGE,
  useVisualEditorSession,
  type CanvasVisualEditMessage,
} from "../visual-editor/visualEditorSession";
import { useTemplateEditorSession } from "./templateEditorSession";
import type { TemplateEditorSelectionExclusion } from "./templateEditorSelection";
import { isCanvasTargetInScope } from "./templateCanvasInteraction";
import {
  resolveTemplateStructureSelectionCompatibility,
} from "./DynamicTemplateStructurePanel";
import TemplateViewportFrame, {
  type TemplateDirectResizeValue,
} from "./TemplateViewportFrame";
import type {
  OverlayPlacementGesture,
  OverlayTargetDescriptor,
  OverlayPropertyControl,
} from "./EditableTargetOverlay";
import {
  moveFreePlacement,
  resizeFreePlacement,
} from "../template-definition/freePlacementGeometry";
import {
  alignNormalizedRect,
  applyBoundedNormalizedRectGesture,
  clampGeometryValue,
  sourceDeltaToNormalized,
} from "./editableTargetGeometry";
import {
  createTemplatePreviewContentBySlotId,
  resolveTemplatePreviewViewport,
} from "./templatePreviewModel";
import { createTemplateStressPreviewContentBySlotId } from "./templateStressPreviewEngine";
import {
  getTemplateTrialContentForSession,
  useTemplateTrialContentSession,
} from "./templateTrialContentSession";
import { describeDynamicTemplateRemoval, findDynamicTemplateParentId } from "./dynamicTemplateEditorUtils";
import {
  addConfiguredTemplateRegion,
} from "./dynamicTemplateDraftRepository";
import CanvasInsertButton from "./CanvasInsertButton";
import TemplateBreakpointComparison from "./TemplateBreakpointComparison";
import { getTemplateLayoutPresentation } from "./templateLayoutPresentation";

type ContentTemplateLayoutNodeState = {
  rectByViewport?: Partial<Record<"desktop" | "mobile", ContentTemplateVisualRect>>;
  sizeCompatibilityByViewport?: Partial<Record<"desktop" | "mobile", ContentTemplateSizeCompatibility>>;
};

function compatibilityForMaterializedRect(
  rect: ContentTemplateVisualRect,
  constraints: { minSize: { width: number; height: number }; maxSize: { width: number; height: number } },
) {
  const compatibility: ContentTemplateSizeCompatibility = {};
  if (rect.width < constraints.minSize.width || rect.width > constraints.maxSize.width) {
    compatibility.width = "preserve-until-resize";
  }
  if (rect.height < constraints.minSize.height || rect.height > constraints.maxSize.height) {
    compatibility.height = "preserve-until-resize";
  }
  return compatibility;
}

function createEditingContent(
  definition: TemplateDefinitionV2,
): Record<string, unknown> {
  return createTemplatePreviewContentBySlotId(definition);
}

export default function DynamicTemplateCanvas() {
  const { modal } = AntdApp.useApp();
  const draft = useTemplateEditorSession((state) => state.draft);
  const previewDocument = useTemplateEditorSession((state) => state.previewDocument);
  const editingScopeId = useTemplateEditorSession((state) => state.editingScopeId);
  const enterEditingScope = useTemplateEditorSession((state) => state.enterEditingScope);
  const leaveEditingScope = useTemplateEditorSession((state) => state.leaveEditingScope);
  const selectTargets = useTemplateEditorSession((state) => state.selectTargets);
  const baseline = useTemplateEditorSession((state) => state.baseline);
  const device = useTemplateEditorSession((state) => state.device);
  const breakpoint = useTemplateEditorSession((state) => state.breakpoint);
  const previewWidth = useTemplateEditorSession((state) => state.previewWidth);
  const setPreviewWidth = useTemplateEditorSession((state) => state.setPreviewWidth);
  const previewMode = useTemplateEditorSession((state) => state.previewMode);
  const previewScenario = useTemplateEditorSession((state) => state.previewScenario);
  const selectedNodeId = useTemplateEditorSession((state) => state.selectedObjectId);
  const selectedContractRole = useTemplateEditorSession((state) => state.selectedContractRole);
  const transitionSelection = useTemplateEditorSession((state) => state.transitionSelection);
  const sessionId = useTemplateEditorSession((state) => state.sessionId);
  const selectObject = useTemplateEditorSession((state) => state.selectObject);
  const selectContractRole = useTemplateEditorSession((state) => state.selectContractRole);
  const executeCommand = useTemplateEditorSession((state) => state.executeCommand);
  const trialSessionId = useTemplateTrialContentSession((state) => state.sessionId);
  const trialContentBySlotId = useTemplateTrialContentSession((state) => state.contentBySlotId);
  const visualSelection = useVisualEditorSession((state) =>
    state.workspace === "template" ? state.selection : null,
  );
  const dynamicDraft = useMemo(() => draft && previewDocument ? { ...draft, definition: previewDocument } : draft, [draft, previewDocument]);
  const placementTokenRef = useRef<string | null>(null);
  const widthPreviewStartRef = useRef<{ width: number | null } | null>(null);
  const [directResizePreview, setDirectResizePreview] = useState<TemplateDirectResizeValue | null>(null);
  const [selectionExclusion, setSelectionExclusion] = useState<TemplateEditorSelectionExclusion | null>(null);
  const [flowDropLabel, setFlowDropLabel] = useState<string | null>(null);
  const [canvasNotice, setCanvasNotice] = useState<string | null>(null);
  const [inlineText, setInlineText] = useState<{ nodeId: string; value: string } | null>(null);
  const [comparison, setComparison] = useState(false);
  const [spacingEditing, setSpacingEditing] = useState(false);
  const stageRef = useRef<HTMLElement>(null);

  useEffect(() => { setSpacingEditing(false); }, [selectedNodeId, selectedContractRole, editingScopeId, breakpoint, previewMode, comparison, sessionId]);

  useEffect(() => {
    setDirectResizePreview(null);
    setSelectionExclusion(null);
    setInlineText(null);
  }, [device, previewMode, sessionId]);

  useEffect(() => {
    const handleTemplateVisualEdit = (event: MessageEvent<CanvasVisualEditMessage>) => {
      if (event.origin && event.origin !== window.location.origin) return;
      const detail = event.data;
      const state = useTemplateEditorSession.getState();
      if (
        detail?.type !== CANVAS_VISUAL_EDIT_MESSAGE
        || detail.workspace !== "template"
        || !state.sessionId
        || detail.templateSessionId !== state.sessionId
        || detail.cancelled
        || detail.transient
      ) return;
      const blockPrefix = `template-editor:${state.sessionId}:`;
      if (!detail.blockId.startsWith(blockPrefix)) return;
      const nodeId = detail.blockId.slice(blockPrefix.length);
      const currentDraft = state.draft;
      const node = currentDraft?.definition.nodes[nodeId];
      const slot = node?.slotId ? currentDraft?.definition.slots[node.slotId] : undefined;
      const contract = getContentTemplateContract(detail.moduleType);
      if (!currentDraft || !node || !slot || !contract) return;
      const sanitized = detail.overrides === undefined
        ? undefined
        : sanitizeContentTemplateLayoutData(detail.moduleType, detail.overrides);
      if (detail.overrides !== undefined && !sanitized) return;
      state.executeCommand({
        type: "update-definition",
        label: "更新画布对象构图",
        update: (next) => {
          if (sanitized) next.nodes[nodeId].props.contentTemplateLayoutData = sanitized;
          else delete next.nodes[nodeId].props.contentTemplateLayoutData;
        },
      });
    };
    window.addEventListener("message", handleTemplateVisualEdit);
    return () => window.removeEventListener("message", handleTemplateVisualEdit);
  }, []);

  // 画布内角色选择必须同步到模板会话，右侧属性面板才能显示同一槽位。
  useEffect(() => {
    if (!sessionId || !visualSelection) return;
    const prefix = `template-editor:${sessionId}:`;
    if (!visualSelection.blockId.startsWith(prefix)) return;
    const nodeId = visualSelection.blockId.slice(prefix.length);
    const current = useTemplateEditorSession.getState();
    if (!current.draft?.definition.nodes[nodeId]) return;
    if (
      current.selectedContractRole?.nodeId === nodeId
      && current.selectedContractRole.roleId === visualSelection.nodeId
    ) return;
    current.selectContractRole(nodeId, visualSelection.nodeId);
  }, [sessionId, visualSelection]);

  // 从结构面板选择虚拟槽位时，同时激活画布的可拖拽选区。
  useEffect(() => {
    if (!dynamicDraft || !sessionId || !selectedContractRole) return;
    const node = dynamicDraft.definition.nodes[selectedContractRole.nodeId];
    const slot = node?.slotId ? dynamicDraft.definition.slots[node.slotId] : undefined;
    if (!slot) return;
    // 所有合同槽位都从模板定义校验器解析模块，避免复杂组件与成熟模板能力分叉。
    const moduleType = getContentTemplateModuleTypeForSlotType(slot.type);
    if (!moduleType) return;
    const contract = getContentTemplateContract(moduleType);
    const presentation = getExplicitContractRolePresentation(
      contract,
      selectedContractRole.roleId,
    );
    if (!presentation) return;
    const object = presentation.object;
    useVisualEditorSession.getState().selectNode({
      blockId: `template-editor:${sessionId}:${selectedContractRole.nodeId}`,
      moduleType,
      nodeId: selectedContractRole.roleId,
      kind: editableTargetToVisualKind(presentation.kind),
      canAdjustLayout: object.capabilities.includes("layout"),
      canAdjustMedia: object.capabilities.some((capability) =>
        capability === "focus" || capability === "fit" || capability === "zoom"),
    });
  }, [dynamicDraft, selectedContractRole, sessionId]);
  if (!dynamicDraft) return null;
  const scopeId = editingScopeId ?? dynamicDraft.definition.rootNodeId;
  const scopeAncestors: string[] = [];
  for (let current: string | null = scopeId; current && !scopeAncestors.includes(current); current = findDynamicTemplateParentId(dynamicDraft.definition, current)) scopeAncestors.unshift(current);
  const canvasLocked = getDynamicTemplateStructureLockOwnerId(dynamicDraft.definition, dynamicDraft.definition.rootNodeId) !== null;
  const rootNode = dynamicDraft.definition.nodes[dynamicDraft.definition.rootNodeId];
  const isEmptyTemplate = !rootNode || rootNode.childIds.length === 0;
  const { sourceWidth, fallbackHeight, heightMode, ratioLabel } = resolveTemplatePreviewViewport(
    resolveTemplateDefinitionForBreakpoint(dynamicDraft.definition, breakpoint),
    device,
  );
  const displayWidth = previewWidth ?? (breakpoint === "tablet" ? 834 : sourceWidth);
  const displayHeightMode = directResizePreview?.heightMode ?? heightMode;
  const displayFallbackHeight = directResizePreview?.height
    ?? (heightMode === "aspect-ratio"
      ? fallbackHeight * displayWidth / sourceWidth
      : fallbackHeight);
  const displayRatioLabel = displayHeightMode === "auto"
    ? "auto"
    : formatTemplateRatio(displayWidth, displayFallbackHeight);
  const sessionTrialContent = getTemplateTrialContentForSession({
    sessionId: trialSessionId,
    contentBySlotId: trialContentBySlotId,
  }, sessionId);
  const previewContent = previewMode
    ? createTemplateStressPreviewContentBySlotId(
      dynamicDraft.definition,
      previewScenario,
      sessionTrialContent,
    )
    : createEditingContent(dynamicDraft.definition);
  if (inlineText) {
    const inlineNode = dynamicDraft.definition.nodes[inlineText.nodeId];
    const inlineSlot = inlineNode?.slotId ? dynamicDraft.definition.slots[inlineNode.slotId] : undefined;
    if (inlineSlot) previewContent[inlineSlot.slotId] = inlineSlot.type === "button" || inlineSlot.type === "link"
      ? { ...(typeof previewContent[inlineSlot.slotId] === "object" ? previewContent[inlineSlot.slotId] as Record<string, unknown> : {}), label: inlineText.value }
      : inlineText.value;
  }
  const editableTargets: OverlayTargetDescriptor[] = (() => {
    if (previewMode) return [];
    const projected = resolveTemplateDefinitionForBreakpoint(dynamicDraft.definition, breakpoint);
    const compiled = compileDynamicTemplateRenderPlan(projected, {
      device,
      contentBySlotId: previewContent,
      showEmptySlots: true,
    });
    if (!compiled.ok) return [];
    return resolveEditableTargets(
      projected,
      compiled.plan,
      getContentTemplateContract,
    ).filter((target) => {
      if (target.source !== "builtin-contract-role" || !target.contractRoleId) return true;
      const node = dynamicDraft.definition.nodes[target.ownerNodeId];
      const slot = node?.slotId ? dynamicDraft.definition.slots[node.slotId] : undefined;
      const moduleType = slot ? getContentTemplateModuleTypeForSlotType(slot.type) : undefined;
      const contract = moduleType ? getContentTemplateContract(moduleType) : undefined;
      return contract?.defaultGeometryByViewport[device].zones.some((zone) =>
        zone.nodeId === target.contractRoleId || zone.roleId === target.contractRoleId,
      ) ?? true;
    }).map((target) => {
      if (target.source !== "builtin-contract-role" || !target.contractRoleId) return target;
      const node = dynamicDraft.definition.nodes[target.ownerNodeId];
      const slot = node?.slotId ? dynamicDraft.definition.slots[node.slotId] : undefined;
      const moduleType = slot ? getContentTemplateModuleTypeForSlotType(slot.type) : undefined;
      const layoutNode = (node?.props.contentTemplateLayoutData as {
        nodes?: Record<string, ContentTemplateLayoutNodeState>;
      } | undefined)?.nodes?.[target.contractRoleId];
      return {
        ...target,
        persistedLayoutRect: layoutNode?.rectByViewport?.[device],
        fallbackLayoutRect: getContentTemplateDefaultRect(
          moduleType ?? "",
          target.contractRoleId,
          device,
        ),
      };
    }).map((target) => ({
      ...target,
      coordinateSpace: Number(dynamicDraft.definition.schemaVersion) >= 2 ? "content-box" as const : undefined,
      movementMode: target.source === "definition-node" && !resolveTemplateNodeRules(dynamicDraft.definition, target.ownerNodeId, breakpoint).placement
        && !resolveTemplateNodeRules(dynamicDraft.definition, target.ownerNodeId, breakpoint).anchor ? "flow" as const : "free" as const,
      imageEditable: Number(dynamicDraft.definition.schemaVersion) >= 2 && dynamicDraft.definition.slots[dynamicDraft.definition.nodes[target.ownerNodeId]?.slotId ?? ""]?.type === "image",
      imageContentEditLabel: Number(dynamicDraft.definition.schemaVersion) >= 3 ? "设置默认图片" : "预览图片试排",
      imageHasContent: (() => {
        const value = previewContent[dynamicDraft.definition.nodes[target.ownerNodeId]?.slotId ?? ""];
        return typeof value === "string" ? Boolean(value.trim())
          : Boolean(value && typeof value === "object" && "src" in value && typeof value.src === "string" && value.src.trim());
      })(),
      textEditable: Number(dynamicDraft.definition.schemaVersion) >= 2 && ["heading", "text", "richText", "button", "link"].includes(dynamicDraft.definition.slots[dynamicDraft.definition.nodes[target.ownerNodeId]?.slotId ?? ""]?.type ?? ""),
      textEditLabel: Number(dynamicDraft.definition.schemaVersion) >= 3 ? "编辑默认文字" : "预览文字试排",
      parentLayoutAxis: (() => {
        const parentId = findDynamicTemplateParentId(dynamicDraft.definition, target.ownerNodeId);
        const rules = parentId ? resolveTemplateNodeRules(dynamicDraft.definition, parentId, breakpoint) : null;
        return rules?.direction === "row" || rules?.display === "grid" ? "x" as const : "y" as const;
      })(),
      locked: Boolean(getDynamicTemplateStructureLockOwnerId(dynamicDraft.definition, target.ownerNodeId)),
      resizeHandles: Number(dynamicDraft.definition.schemaVersion) >= 2 && target.source === "definition-node"
        && !resolveTemplateNodeRules(dynamicDraft.definition, target.ownerNodeId, breakpoint).anchor
        && !resolveTemplateNodeRules(dynamicDraft.definition, target.ownerNodeId, breakpoint).placement
        ? ["e", "s", "se"] as const : undefined,
      resizeContextLabel: `${breakpoint === "desktop" ? "Desktop 主值" : breakpoint === "tablet" ? "Tablet 覆盖" : "Mobile 覆盖"}`,
      parentTargetId: target.source === "builtin-contract-role"
        ? `node:${target.ownerNodeId}`
        : `node:${findDynamicTemplateParentId(dynamicDraft.definition, target.ownerNodeId) ?? ""}`,
    }));
  })();
  const selectedOverlayTargetId = selectedContractRole
    ? `role:${selectedContractRole.nodeId}:${selectedContractRole.roleId}`
    : selectedNodeId
      ? `node:${selectedNodeId}`
      : null;
  const freePlacementTargetIds = new Set(editableTargets.flatMap((target) => {
    if (target.locked || target.source !== "definition-node" || !target.capabilities?.includes("structure")) return [];
    const rules = resolveTemplateNodeRules(dynamicDraft.definition, target.ownerNodeId, breakpoint);
    return rules.placement || rules.anchor
      ? [target.targetId]
      : [];
  }));
  const contractLayoutTargetIds = new Set(editableTargets.flatMap((target) =>
    !target.locked && target.source === "builtin-contract-role" && target.capabilities?.includes("layout")
      ? [target.targetId]
      : [],
  ));
  const overlayPlacementTargetIds = new Set([
    ...freePlacementTargetIds,
    ...contractLayoutTargetIds,
  ]);
  const flowTargetIds = new Set(editableTargets.filter((target) => !target.locked && target.source === "definition-node"
    && target.ownerNodeId !== dynamicDraft.definition.rootNodeId && target.capabilities?.includes("structure")).map((target) => target.targetId));
  const allManipulableTargetIds = new Set([...overlayPlacementTargetIds, ...flowTargetIds]);
  const selectedRules = selectedNodeId ? resolveTemplateNodeRules(dynamicDraft.definition, selectedNodeId, breakpoint) : null;
  const propertyControls: OverlayPropertyControl[] = [];
  if (selectedNodeId && !selectedContractRole && selectedRules && !getDynamicTemplateStructureLockOwnerId(dynamicDraft.definition, selectedNodeId)) {
    const selected = dynamicDraft.definition.nodes[selectedNodeId];
    if (getDynamicTemplateNodeRegistryEntry(selected.type).canHaveChildren && selectedRules.layoutMode !== "free" && ["flex", "grid"].includes(selectedRules.display)
      && (!selectedRules.gap || selectedRules.gap.unit === "px")) propertyControls.push({ key: "gap", label: "间距", value: selectedRules.gap?.value ?? 0, axis: selectedRules.direction === "row" ? "x" : "y" });
    for (const side of ["top", "right", "bottom", "left"] as const) {
      const value = selectedRules.padding?.[side];
      if (!value || value.unit === "px") propertyControls.push({ key: `padding.${side}`, label: ({ top: "上内边距", right: "右内边距", bottom: "下内边距", left: "左内边距" })[side], value: value?.value ?? 0, axis: side === "top" || side === "bottom" ? "y" : "x" });
    }
    const selectedSlot = selected.slotId ? dynamicDraft.definition.slots[selected.slotId] : undefined;
    if (selectedSlot?.type === "image") {
      const imageRules = resolveTemplateSlotRules(dynamicDraft.definition, selectedSlot.slotId, breakpoint);
      if ((imageRules.objectFit ?? "cover") === "cover") {
        const focus = objectPositionToPercent(imageRules.objectPosition);
        propertyControls.push({ key: "imageFocus.x", label: "图片横向焦点", value: focus.x, axis: "x", max: 100 }, { key: "imageFocus.y", label: "图片纵向焦点", value: focus.y, axis: "y", max: 100 });
      }
    }
  }
  const commitPlacement = (
    nodeId: string,
    targetDevice: "desktop" | "mobile",
    placement: NonNullable<TemplateDefinitionV2["nodes"][string]["responsive"]["desktop"]["placement"]>,
    phase: "preview" | "commit" = "commit",
  ) => {
    const currentDraft = useTemplateEditorSession.getState().draft;
    const node = currentDraft?.definition.nodes[nodeId];
    if (!currentDraft || !node) return;
    applyPlacementCommand({
      type: "update-definition",
      label: "更新自由布局位置",
      update: (next) => {
        setTemplateNodeRule(next, nodeId, targetDevice === device ? breakpoint : targetDevice, "placement", placement);
      },
    }, phase);
  };
  const applyPlacementCommand = (command: DynamicTemplateDefinitionCommand, phase: "preview" | "commit") => {
    const state = useTemplateEditorSession.getState();
    if (phase === "preview") {
      const token = placementTokenRef.current;
      if (token) state.previewInteraction(token, command);
    } else executeCommand(command);
  };
  const commitOverlayPlacementGesture = (gesture: OverlayPlacementGesture, phase: "preview" | "commit" = "commit") => {
    const sourceState = useTemplateEditorSession.getState();
    const sourceDefinition = sourceState.draft?.definition;
    const sourceRules = sourceDefinition && sourceDefinition.nodes[gesture.target.ownerNodeId]
      ? resolveTemplateNodeRules(sourceDefinition, gesture.target.ownerNodeId, breakpoint) : null;
    if (sourceDefinition && sourceRules && gesture.target.source === "definition-node" && !sourceRules.placement && !sourceRules.anchor && gesture.operation === "move") {
      const drop = gesture.dropTarget;
      const hovered = drop ? sourceDefinition.nodes[drop.nodeId] : null;
      const parentId = hovered ? findDynamicTemplateParentId(sourceDefinition, hovered.nodeId) : null;
      const parentRules = parentId ? resolveTemplateNodeRules(sourceDefinition, parentId, breakpoint) : null;
      const canEnter = hovered && getDynamicTemplateNodeRegistryEntry(hovered.type).canHaveChildren && drop && drop.x > .2 && drop.x < .8 && drop.y > .2 && drop.y < .8;
      const landing = hovered && drop ? resolveDynamicTemplateMoveLanding(sourceDefinition, gesture.target.ownerNodeId, {
        targetNodeId: hovered.nodeId,
        placement: canEnter ? "inside" : (parentRules?.direction === "row" ? drop.x : drop.y) < .5 ? "before" : "after",
      }) : null;
      const blocked = !landing ? "当前位置没有可用落点" : landing.disabledReason;
      setFlowDropLabel(blocked ?? `${landing!.parentId === findDynamicTemplateParentId(sourceDefinition, gesture.target.ownerNodeId) ? "重排" : "跨容器移动"}：${landing!.pathLabel}`);
      if (phase === "preview" && placementTokenRef.current) {
        const result = sourceState.previewInteraction(placementTokenRef.current, {
          type: "transform-definition", label: "预览移动画布对象",
          transform: (next) => landing && !blocked ? moveDynamicTemplateNodeToLanding(next, gesture.target.ownerNodeId, landing) : next,
        });
        if (!result.ok) setFlowDropLabel(result.message);
      }
      if (phase === "commit") {
        if (landing && !blocked) {
          const token = placementTokenRef.current;
          const command: DynamicTemplateDefinitionCommand = { type: "transform-definition", label: "移动画布对象", transform: (next) => moveDynamicTemplateNodeToLanding(next, gesture.target.ownerNodeId, landing) };
          if (token) { sourceState.previewInteraction(token, command); sourceState.commitInteraction(token); }
          else sourceState.executeCommand(command);
        } else if (placementTokenRef.current) sourceState.cancelInteraction(placementTokenRef.current);
        placementTokenRef.current = null;
        setFlowDropLabel(null);
      }
      return;
    }
    if (phase === "commit" && placementTokenRef.current) {
      useTemplateEditorSession.getState().commitInteraction(placementTokenRef.current);
      placementTokenRef.current = null;
      return;
    }
    const currentDraft = useTemplateEditorSession.getState().draft;
    const nodeId = gesture.target.ownerNodeId;
    const node = currentDraft?.definition.nodes[nodeId];
    if (
      currentDraft
      && node
      && gesture.target.source === "builtin-contract-role"
      && gesture.target.contractRoleId
      && gesture.target.capabilities?.includes("layout")
    ) {
      const slot = node.slotId ? currentDraft.definition.slots[node.slotId] : undefined;
      const moduleType = slot ? getContentTemplateModuleTypeForSlotType(slot.type) : undefined;
      const contract = moduleType ? getContentTemplateContract(moduleType) : undefined;
      const roleId = gesture.target.contractRoleId;
      const defaultRect = getContentTemplateDefaultRect(moduleType ?? "", roleId, device);
      if (!moduleType || !defaultRect) return;
      const editableObject = findContentTemplateEditableObject(contract, roleId);
      if (!editableObject) return;
      const constraints = editableObject.constraints;
      const bounds = constraints.safeAreaRequired
        ? contract!.defaultGeometryByViewport[device].safeArea
        : { x: 0, y: 0, width: 1, height: 1 };
      const layoutNode = (node.props.contentTemplateLayoutData as {
        nodes?: Record<string, ContentTemplateLayoutNodeState>;
      } | undefined)?.nodes?.[roleId];
      const explicitRect = layoutNode?.rectByViewport?.[device];
      const currentRect = explicitRect ?? gesture.sourceRect ?? defaultRect;
      const nextRect = applyBoundedNormalizedRectGesture({
        rect: currentRect,
        operation: gesture.operation,
        direction: gesture.direction,
        delta: sourceDeltaToNormalized(
          gesture.deltaSourceX,
          gesture.deltaSourceY,
          gesture.parentSourceWidth,
          gesture.parentSourceHeight,
        ),
        constraints,
        bounds,
      });
      let nextLayoutData = setVisualOverridePath(
        node.props.contentTemplateLayoutData,
        ["nodes", roleId, "rectByViewport", device],
        nextRect,
      );
      const currentCompatibility = explicitRect
        ? { ...(layoutNode?.sizeCompatibilityByViewport?.[device] ?? {}) }
        : compatibilityForMaterializedRect(currentRect, constraints);
      if (gesture.operation === "resize") {
        if (gesture.direction?.includes("w") || gesture.direction?.includes("e")) {
          delete currentCompatibility.width;
        }
        if (gesture.direction?.includes("n") || gesture.direction?.includes("s")) {
          delete currentCompatibility.height;
        }
      }
      nextLayoutData = setVisualOverridePath(
        nextLayoutData,
        ["nodes", roleId, "sizeCompatibilityByViewport", device],
        Object.keys(currentCompatibility).length ? currentCompatibility : undefined,
      );
      const sanitized = sanitizeContentTemplateLayoutData(moduleType, nextLayoutData);
      if (!sanitized) return;
      applyPlacementCommand({
        type: "update-definition",
        label: "更新合同对象位置",
        update: (next) => {
          next.nodes[nodeId].props.contentTemplateLayoutData = sanitized;
        },
      }, phase);
      return;
    }
    const geometryRules = node && currentDraft ? resolveTemplateNodeRules(currentDraft.definition, nodeId, breakpoint) : undefined;
    if (currentDraft && node && geometryRules?.anchor && gesture.target.source === "definition-node") {
      const anchor = geometryRules.anchor;
      const factorX = anchor.horizontal === "left" ? 0 : anchor.horizontal === "center" ? .5 : 1;
      const factorY = anchor.vertical === "top" ? 0 : anchor.vertical === "center" ? .5 : 1;
      const initialWidth = gesture.sourceRect.width * gesture.parentSourceWidth;
      const initialHeight = gesture.sourceRect.height * gesture.parentSourceHeight;
      const horizontal = Boolean(gesture.direction?.match(/[ew]/));
      const vertical = Boolean(gesture.direction?.match(/[ns]/));
      const width = Math.max(1, initialWidth + (horizontal ? gesture.deltaSourceX * (gesture.direction?.includes("w") ? -1 : 1) : 0));
      const height = Math.max(1, initialHeight + (vertical ? gesture.deltaSourceY * (gesture.direction?.includes("n") ? -1 : 1) : 0));
      const dx = gesture.operation === "move" ? gesture.deltaSourceX : (width - initialWidth) * (gesture.direction?.includes("w") ? factorX - 1 : factorX);
      const dy = gesture.operation === "move" ? gesture.deltaSourceY : (height - initialHeight) * (gesture.direction?.includes("n") ? factorY - 1 : factorY);
      applyPlacementCommand({ type: "update-definition", label: gesture.operation === "move" ? "移动锚定对象" : "调整锚定对象尺寸", update: (next) => {
        setTemplateNodeRule(next, nodeId, breakpoint, "anchor", {
          ...anchor,
          offsetX: { ...anchor.offsetX, value: anchor.offsetX.value + dx * (anchor.offsetX.unit === "%" ? 100 / gesture.parentSourceWidth : 1) },
          offsetY: { ...anchor.offsetY, value: anchor.offsetY.value + dy * (anchor.offsetY.unit === "%" ? 100 / gesture.parentSourceHeight : 1) },
        });
        if (gesture.operation === "resize") {
          if (horizontal) setTemplateNodeRule(next, nodeId, breakpoint, "width", { value: width, unit: "px" });
          if (vertical) setTemplateNodeRule(next, nodeId, breakpoint, "height", { mode: "fixed", value: { value: height, unit: "px" } });
          if (geometryRules.placement) setTemplateNodeRule(next, nodeId, breakpoint, "placement", { ...geometryRules.placement, width: width / gesture.parentSourceWidth, height: height / gesture.parentSourceHeight });
        }
      } }, phase);
      return;
    }
    const placement = geometryRules?.placement;
    if (!currentDraft || !node || !placement || !gesture.target.capabilities?.includes("structure")) {
      if (currentDraft && node && gesture.operation === "resize" && gesture.target.source === "definition-node") {
        applyPlacementCommand({ type: "update-definition", label: "调整对象尺寸", update: (next) => {
          if (gesture.direction?.includes("e") || gesture.direction?.includes("w")) {
            const width = Math.max(1, gesture.sourceRect.width * gesture.parentSourceWidth + gesture.deltaSourceX * (gesture.direction.includes("w") ? -1 : 1));
            setTemplateNodeRule(next, nodeId, breakpoint, "width", { value: width, unit: "px" });
          }
          if (gesture.direction?.includes("n") || gesture.direction?.includes("s")) {
            const height = Math.max(1, gesture.sourceRect.height * gesture.parentSourceHeight + gesture.deltaSourceY * (gesture.direction.includes("n") ? -1 : 1));
            setTemplateNodeRule(next, nodeId, breakpoint, "height", { mode: "fixed", value: { value: height, unit: "px" } });
          }
        } }, phase);
      }
      return;
    }
    const parent = Object.values(currentDraft.definition.nodes)
      .find((candidate) => candidate.childIds.includes(nodeId));
    const siblings = parent?.childIds
      .filter((childId) => childId !== nodeId)
      .flatMap((childId) => {
        const siblingPlacement = resolveTemplateNodeRules(currentDraft.definition, childId, breakpoint).placement;
        return siblingPlacement ? [siblingPlacement] : [];
      }) ?? [];
    const delta = sourceDeltaToNormalized(
      gesture.deltaSourceX,
      gesture.deltaSourceY,
      gesture.parentSourceWidth,
      gesture.parentSourceHeight,
    );
    const nextPlacement = gesture.operation === "resize" && gesture.direction
      ? resizeFreePlacement(placement, gesture.direction, delta.x, delta.y, siblings)
      : moveFreePlacement(placement, delta.x, delta.y, siblings);
    commitPlacement(nodeId, device, nextPlacement, phase);
  };
  const selectOverlayTarget = (
    target: OverlayTargetDescriptor,
    modifiers?: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean },
  ) => {
    const selectionTarget = target.source === "builtin-contract-role" && target.contractRoleId
      ? { targetId: target.ownerNodeId, roleId: target.contractRoleId }
      : { targetId: target.ownerNodeId };
    const result = transitionSelection({
      target: selectionTarget,
      visibleTargets: editableTargets.filter((candidate) => isCanvasTargetInScope(candidate, scopeId)).map((candidate) => ({
        targetId: candidate.ownerNodeId,
        ...(candidate.contractRoleId ? { roleId: candidate.contractRoleId } : {}),
      })),
      ctrlKey: modifiers?.ctrlKey,
      metaKey: modifiers?.metaKey,
      shiftKey: modifiers?.shiftKey,
      resolveCompatibility: (candidate) => resolveTemplateStructureSelectionCompatibility(
        dynamicDraft.definition,
        device,
        candidate,
      ),
    });
    if (!result) return;
    setSelectionExclusion(result.ok ? null : result.exclusions[0] ?? null);
  };
  const handleNodeAction = (
    nodeId: string,
    action: "duplicate" | "hide" | "delete" | "forward" | "backward"
      | "align-horizontal" | "align-vertical" | "copy-responsive",
  ) => {
    const currentDraft = useTemplateEditorSession.getState().draft;
    if (!currentDraft) return;
    const node = currentDraft.definition.nodes[nodeId];
    if (!node) return;
    const slot = node?.slotId ? currentDraft.definition.slots[node.slotId] : undefined;
    if ((action === "hide" || action === "delete") && slot?.required) return;
    if (action === "duplicate") {
      let duplicatedNodeId: string | null = null;
      const result = executeCommand({
        type: "transform-definition",
        label: "复制节点",
        transform: (current) => {
          const duplicated = duplicateDynamicTemplateNode(current, nodeId);
          duplicatedNodeId = duplicated.nodeId;
          return duplicated.definition;
        },
      });
      if (result.ok && duplicatedNodeId) selectObject(duplicatedNodeId);
      return;
    }
    if (action === "delete") {
      modal.confirm({
        title: `删除“${node.name}”及其子节点？`,
        content: describeDynamicTemplateRemoval(currentDraft.definition, nodeId),
        okText: "删除节点",
        cancelText: "取消",
        okButtonProps: { danger: true },
        autoFocusButton: "cancel",
        onOk: () => {
          const result = executeCommand({
            type: "transform-definition",
            label: "删除节点",
            transform: (current) => removeDynamicTemplateNode(current, nodeId),
          });
          if (result.ok) selectObject(currentDraft.definition.rootNodeId);
        },
      });
      return;
    }
    if (action === "hide") {
      const result = executeCommand({
        type: "transform-definition",
        label: "隐藏节点",
        transform: (current) => {
          if (Number(current.schemaVersion) < 2) return setDynamicTemplateNodeHidden(current, nodeId, true);
          const next = structuredClone(current);
          setTemplateNodeRule(next, nodeId, breakpoint, "hidden", true);
          return next;
        },
      });
      if (result.ok && Number(currentDraft.definition.schemaVersion) < 2) selectObject(currentDraft.definition.rootNodeId);
      return;
    }
    if (Number(currentDraft.definition.schemaVersion) >= 2 && (action === "forward" || action === "backward")) {
      const parentId = findDynamicTemplateParentId(currentDraft.definition, nodeId);
      if (!parentId) return;
      const result = executeCommand({ type: "update-definition", label: action === "forward" ? "对象上移一层（所有断点）" : "对象下移一层（所有断点）", update: (next) => {
        const siblings = next.nodes[parentId].childIds;
        const from = siblings.indexOf(nodeId);
        const to = from + (action === "forward" ? 1 : -1);
        if (from < 0 || to < 0 || to >= siblings.length) return;
        [siblings[from], siblings[to]] = [siblings[to], siblings[from]];
      } });
      if (!result.ok) setCanvasNotice(result.message);
      return;
    }
    const placement = resolveTemplateNodeRules(currentDraft.definition, nodeId, breakpoint).placement;
    if (!placement) return;
    if (action === "align-horizontal" || action === "align-vertical") {
      executeCommand({
        type: "update-definition",
        label: action === "align-horizontal" ? "水平居中节点" : "垂直居中节点",
        update: (next) => {
          setTemplateNodeRule(next, nodeId, breakpoint, "placement", alignNormalizedRect(
            placement,
            action === "align-horizontal" ? "horizontal" : "vertical",
          ));
        },
      });
      return;
    }
    if (action === "copy-responsive") {
      const targetDevice = device === "desktop" ? "mobile" : "desktop";
      const parent = Object.values(currentDraft.definition.nodes).find((candidate) => candidate.childIds.includes(nodeId));
      if (!parent || parent.type !== "Stack" || resolveTemplateNodeRules(currentDraft.definition, parent.nodeId, breakpoint).layoutMode !== "free") return;
      executeCommand({
        type: "update-definition",
        label: "复制自由布局到另一画布",
        update: (next) => {
          const nextParent = next.nodes[parent.nodeId];
          const sourceParentRules = resolveTemplateNodeRules(next, parent.nodeId, breakpoint);
          const targetParentRules = resolveTemplateNodeRules(next, parent.nodeId, targetDevice);
          setTemplateNodeRule(next, parent.nodeId, targetDevice, "layoutMode", "free");
          setTemplateNodeRule(next, parent.nodeId, targetDevice, "display", "block");
          if (targetParentRules.height.mode === "auto") {
            setTemplateNodeRule(next, parent.nodeId, targetDevice, "height", sourceParentRules.height);
          }
          nextParent.childIds.forEach((childId) => {
            const sourcePlacement = resolveTemplateNodeRules(next, childId, breakpoint).placement;
            if (sourcePlacement) {
              setTemplateNodeRule(next, childId, targetDevice, "placement", sourcePlacement);
            }
          });
        },
      });
      return;
    }
    executeCommand({
      type: "update-definition",
      label: action === "forward" ? "节点上移一层" : "节点下移一层",
      update: (next) => {
        setTemplateNodeRule(next, nodeId, breakpoint, "placement", {
          ...placement,
          zIndex: clampGeometryValue(placement.zIndex + (action === "forward" ? 1 : -1), -10, 10),
        });
      },
    });
  };
  const updateCanvasWidth = (width: number) => {
    const currentDraft = useTemplateEditorSession.getState().draft;
    if (!currentDraft || getDynamicTemplateStructureLockOwnerId(currentDraft.definition, currentDraft.definition.rootNodeId)) return;
    executeCommand({ type: "transform-definition", label: "更新模板宽度", transform: (current) => setTemplateDesignWidth(current, device, width) });
  };
  const updateCanvasHeight = (height: number) => {
    const currentDraft = useTemplateEditorSession.getState().draft;
    if (!currentDraft || getDynamicTemplateStructureLockOwnerId(currentDraft.definition, currentDraft.definition.rootNodeId)) return;
    executeCommand({ type: "transform-definition", label: "更新模板高度", transform: (current) => setTemplateDesignHeightMode(current, device, "fixed", height) });
  };
  const updateCanvasHeightMode = (mode: "fixed" | "aspect-ratio" | "auto") => {
    const currentDraft = useTemplateEditorSession.getState().draft;
    if (!currentDraft || getDynamicTemplateStructureLockOwnerId(currentDraft.definition, currentDraft.definition.rootNodeId)) return;
    executeCommand({ type: "transform-definition", label: "更新模板高度模式", transform: (current) => setTemplateDesignHeightMode(current, device, mode) });
  };
  const updateCanvasRatio = (ratio: { width: number; height: number }) => {
    const currentDraft = useTemplateEditorSession.getState().draft;
    if (!currentDraft || getDynamicTemplateStructureLockOwnerId(currentDraft.definition, currentDraft.definition.rootNodeId)) return;
    executeCommand({ type: "transform-definition", label: "更新模板比例", transform: (current) => setTemplateDesignHeightMode(current, device, "aspect-ratio", ratio) });
  };
  const baselineFrame = baseline
    ? resolveTemplateDesignFrame(baseline.definition, device)
    : null;
  const canRestoreCanvasSize = Boolean(baselineFrame && (
    baselineFrame.sourceWidth !== sourceWidth
    || baselineFrame.heightMode !== heightMode
    || baselineFrame.ratioLabel !== ratioLabel
    || Math.abs(baselineFrame.fallbackHeight - fallbackHeight) >= 1
  ));
  const restoreCanvasSize = () => {
    const currentDraft = useTemplateEditorSession.getState().draft;
    const currentBaseline = useTemplateEditorSession.getState().baseline;
    if (!currentDraft || !currentBaseline) return;
    const savedFrame = resolveTemplateDesignFrame(currentBaseline.definition, device);
    let next = setTemplateDesignWidth(currentDraft.definition, device, savedFrame.sourceWidth);
    if (savedFrame.heightMode === "fixed") {
      next = setTemplateDesignHeightMode(next, device, "fixed", savedFrame.fallbackHeight);
    } else if (savedFrame.heightMode === "aspect-ratio") {
      const savedRatio = savedFrame.rootRules.height.mode === "aspect-ratio"
        ? savedFrame.rootRules.height.ratio
        : undefined;
      next = setTemplateDesignHeightMode(
        next,
        device,
        "aspect-ratio",
        savedRatio ?? { width: savedFrame.sourceWidth, height: savedFrame.fallbackHeight },
      );
    } else {
      next = setTemplateDesignHeightMode(next, device, "auto");
    }
    executeCommand({ type: "replace-definition", label: "恢复已保存模板尺寸", definition: next });
  };
  const commitDirectResize = (resize: TemplateDirectResizeValue) => {
    const currentDraft = useTemplateEditorSession.getState().draft;
    if (!currentDraft) {
      setDirectResizePreview(null);
      return;
    }
    const currentFrame = resolveTemplatePreviewViewport(currentDraft.definition, device);
    let next = currentDraft.definition;
    let changed = false;
    if (Math.round(resize.width) !== Math.round(currentFrame.sourceWidth)) {
      next = setTemplateDesignWidth(next, device, resize.width);
      changed = true;
    }
    if (resize.heightMode === "fixed") {
      if (
        currentFrame.heightMode !== "fixed"
        || Math.abs(currentFrame.fallbackHeight - resize.height) >= 1
      ) {
        next = setTemplateDesignHeightMode(next, device, "fixed", resize.height);
        changed = true;
      }
    } else if (resize.heightMode === "aspect-ratio") {
      const nextRatio = formatTemplateRatio(resize.width, resize.height);
      const keepsExistingRatio = resize.ratioLocked && currentFrame.heightMode === "aspect-ratio";
      if (!keepsExistingRatio && (
        currentFrame.heightMode !== "aspect-ratio" || currentFrame.ratioLabel !== nextRatio
      )) {
        next = setTemplateDesignHeightMode(next, device, "aspect-ratio", {
          width: resize.width,
          height: resize.height,
        });
        changed = true;
      }
    } else if (currentFrame.heightMode !== "auto") {
      next = setTemplateDesignHeightMode(next, device, "auto");
      changed = true;
    }
    setDirectResizePreview(null);
    if (changed) executeCommand({ type: "replace-definition", label: "调整模板画布尺寸", definition: next });
  };

  const addFirstRegion = () => {
    let createdNodeId: string | null = null;
    const result = executeCommand({
      type: "transform-definition",
      label: "添加内容区域",
      transform: (current) => {
        const added = addConfiguredTemplateRegion(current);
        createdNodeId = added.nodeId;
        return added.definition;
      },
    });
    if (result.ok && result.changed && createdNodeId) selectObject(createdNodeId);
  };

  const scopeRules = resolveTemplateNodeRules(dynamicDraft.definition, scopeId, breakpoint);
  const layoutLabel = getTemplateLayoutPresentation(scopeRules).label;
  const comparisonAction = Number(dynamicDraft.definition.schemaVersion) >= 2 && !previewMode ? <button type="button" aria-pressed={comparison} onClick={() => {
    if (focusFirstInvalidNumberField()) return;
    if (useTemplateEditorSession.getState().activeInteraction) { setCanvasNotice("请先确认或取消当前操作，再切换并排预览。"); return; }
    setComparison(!comparison);
  }}>{comparison ? "返回单画布编辑" : "多设备并排预览"}</button> : null;
  const insertButtons = (entries: readonly (readonly ["Container" | "Row" | "Stack" | "Grid" | "ImageSlot" | "HeadingSlot" | "TextSlot" | "ButtonSlot", string])[]) => entries.map(([type, label]) => {
    const allowed = canNestDynamicTemplateNode(dynamicDraft.definition.nodes[scopeId].type, type) && !getDynamicTemplateStructureLockOwnerId(dynamicDraft.definition, scopeId);
    return <CanvasInsertButton key={type} type={type} label={label} parentId={scopeId} disabled={!allowed} onNotice={setCanvasNotice} />;
  });
  const navigation = (!previewMode ? <nav className="template-editor__scope-breadcrumb" aria-label="画布编辑层级">
        {scopeAncestors.map((id, index) => <span key={id}>
          {index ? <span aria-hidden="true"> / </span> : null}
          <Button size="small" type="text" aria-current={id === scopeId ? "location" : undefined}
            aria-label={id === dynamicDraft.definition.rootNodeId ? `选择模板目标 ${dynamicDraft.definition.nodes[id]?.name ?? "模板"}` : undefined}
            onClick={() => { enterEditingScope(id); selectObject(id); }}>{dynamicDraft.definition.nodes[id]?.name ?? "模板"}</Button>
        </span>)}
        <span role="status">{layoutLabel} · {breakpoint === "desktop" ? "桌面端" : breakpoint === "tablet" ? "平板端" : "手机端"}</span>
        {selectedNodeId && selectedNodeId !== scopeId && getDynamicTemplateNodeRegistryEntry(dynamicDraft.definition.nodes[selectedNodeId].type).canHaveChildren ? <Button size="small" disabled={Boolean(getDynamicTemplateStructureLockOwnerId(dynamicDraft.definition, selectedNodeId))} onClick={() => enterEditingScope(selectedNodeId)}>进入选中容器</Button> : null}
        <details className="template-editor__canvas-add"><summary>＋ 添加内容</summary><div>
          <strong>添加到：{dynamicDraft.definition.nodes[scopeId]?.name}</strong>
          {scopeId === dynamicDraft.definition.rootNodeId ? <p>请先在画布或结构树选择内容区域；也可从下方添加布局区域。</p> : null}
          {insertButtons([["ImageSlot", "图片槽位"], ["HeadingSlot", "标题槽位"], ["TextSlot", "正文槽位"], ["ButtonSlot", "按钮槽位"]])}
          <details className="template-editor__canvas-add-layout"><summary>布局区域与分组</summary><div>
            {insertButtons([["Container", "区域"], ["Row", "左右排列布局分组"], ["Stack", "上下排列布局分组"], ["Grid", "网格布局分组"]])}
          </div></details>
        </div></details>
      </nav> : null);
  return (
    <section ref={stageRef} className="homepage-editor__stage template-editor__stage" aria-label={`${dynamicDraft.definition.name}模板设计画布`}
      onKeyDown={(event) => {
        if (previewMode || event.defaultPrevented) return;
        const target = event.target as HTMLElement;
        if (target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], .ant-popover')) return;
        if (event.key === "Escape") {
          if (leaveEditingScope()) { event.preventDefault(); event.stopPropagation(); }
        } else if (event.key === "Enter" && target.closest('[data-overlay-hit-for]')) {
          if (enterEditingScope()) { event.preventDefault(); event.stopPropagation(); }
        }
      }}>
      {/* 预览可以导航离开 srcDoc；返回编辑时重建隔离视图，文档/选择/缩放仍由共享会话保留。 */}
      {comparison && !previewMode ? <><div className="template-editor__canvas-header">{navigation}{comparisonAction}</div><TemplateBreakpointComparison definition={dynamicDraft.definition} contentBySlotId={previewContent} selectedNodeId={selectedNodeId} onFocus={(nextBreakpoint, nodeId) => {
        const state = useTemplateEditorSession.getState();
        if (state.setBreakpoint(nextBreakpoint)) { if (nodeId) state.selectObject(nodeId); setComparison(false); }
      }} /></> : <TemplateViewportFrame
        navigation={navigation}
        viewActions={comparisonAction}
        key={previewMode ? "preview" : "editor"}
        sourceWidth={displayWidth}
        fallbackHeight={displayFallbackHeight}
        autoHeight={displayHeightMode === "auto"}
        heightMode={displayHeightMode}
        ratioLabel={directResizePreview ? displayRatioLabel : ratioLabel}
        minWidth={dynamicDraft.definition.metadata.canvasSize ? 1 : 280}
        maxWidth={dynamicDraft.definition.metadata.canvasSize ? 4096 : 2560}
        minimumFitScale={dynamicDraft.definition.metadata.canvasSize ? 0.0001 : undefined}
        resizable={!previewMode && !canvasLocked}
        title={`${dynamicDraft.definition.name}模板隔离画布`}
        onWidthChange={setPreviewWidth}
        onHeightChange={Number(dynamicDraft.definition.schemaVersion) >= 2 ? undefined : updateCanvasHeight}
        onHeightModeChange={Number(dynamicDraft.definition.schemaVersion) >= 2 ? undefined : updateCanvasHeightMode}
        onRatioChange={Number(dynamicDraft.definition.schemaVersion) >= 2 ? undefined : updateCanvasRatio}
        canRestore={Number(dynamicDraft.definition.schemaVersion) >= 2 ? false : canRestoreCanvasSize}
        device={device}
        onRestore={Number(dynamicDraft.definition.schemaVersion) >= 2 ? undefined : restoreCanvasSize}
        viewportWidthOnly
        onDirectResizePreview={(value) => {
          widthPreviewStartRef.current ??= { width: previewWidth };
          setPreviewWidth(value.width);
        }}
        onDirectResizeCancel={() => {
          if (widthPreviewStartRef.current) setPreviewWidth(widthPreviewStartRef.current.width);
          widthPreviewStartRef.current = null;
        }}
        onDirectResizeCommit={(value) => { setPreviewWidth(value.width); widthPreviewStartRef.current = null; }}
        hasSelection={!previewMode && Boolean(selectedNodeId)}
        onSelectNode={previewMode ? undefined : selectObject}
        overlayTargets={previewMode ? undefined : editableTargets}
        selectedOverlayTargetId={selectedOverlayTargetId}
        movableOverlayTargetIds={allManipulableTargetIds}
        resizeOverlayTargetIds={allManipulableTargetIds}
        onOverlayTargetSelect={previewMode ? undefined : selectOverlayTarget}
        onOverlayPlacementGesture={previewMode ? undefined : commitOverlayPlacementGesture}
        onOverlayPlacementGestureBegin={() => { placementTokenRef.current = useTemplateEditorSession.getState().beginInteraction("调整画布对象"); }}
        onOverlayPlacementGesturePreview={(gesture) => commitOverlayPlacementGesture(gesture, "preview")}
        onOverlayPlacementGestureCancel={() => {
          if (placementTokenRef.current) useTemplateEditorSession.getState().cancelInteraction(placementTokenRef.current);
          placementTokenRef.current = null;
          setFlowDropLabel(null);
        }}
        propertyControls={propertyControls}
        spacingEditing={spacingEditing}
        onSpacingEditingChange={(editing) => {
          if (focusFirstInvalidNumberField()) return;
          if (useTemplateEditorSession.getState().activeInteraction) {
            setCanvasNotice("请先完成或取消当前拖动，再切换间距调整。");
            return;
          }
          setSpacingEditing(editing);
        }}
        onPropertyPreview={(key, value) => applyPlacementCommand({ type: "update-definition", label: "调整画布间距", update: (next) => {
          if (!selectedNodeId) return;
          if (key.startsWith("imageFocus.")) {
            const slotId = next.nodes[selectedNodeId].slotId;
            if (!slotId) return;
            const focus = objectPositionToPercent(resolveTemplateSlotRules(next, slotId, breakpoint).objectPosition);
            setTemplateSlotRule(next, slotId, breakpoint, "objectPosition", percentToExactObjectPosition({ ...focus, [key.endsWith(".x") ? "x" : "y"]: value }));
          } else setTemplateNodeRule(next, selectedNodeId, breakpoint, key, { value, unit: "px" });
        } }, "preview")}
        onPropertyCommit={() => { if (placementTokenRef.current) useTemplateEditorSession.getState().commitInteraction(placementTokenRef.current); placementTokenRef.current = null; }}
        flowDropLabel={flowDropLabel}
        editingScopeId={scopeId}
        onOverlayEnterTarget={(target) => {
          if (enterEditingScope(target.ownerNodeId)) return;
          const node = dynamicDraft.definition.nodes[target.ownerNodeId];
          const slot = node?.slotId ? dynamicDraft.definition.slots[node.slotId] : undefined;
          if (getDynamicTemplateStructureLockOwnerId(dynamicDraft.definition, target.ownerNodeId)) return;
          if (slot && Number(dynamicDraft.definition.schemaVersion) < 3 && ["heading", "text", "richText", "button", "link", "image"].includes(slot.type)) {
            selectObject(node.nodeId);
            window.dispatchEvent(new CustomEvent("template-editor:open-trial-content", { detail: { nodeId: node.nodeId, slotId: slot.slotId } }));
            return;
          }
          if (slot && ["heading", "text", "richText", "button", "link"].includes(slot.type)) {
            const trial = Number(dynamicDraft.definition.schemaVersion) >= 3
              ? dynamicDraft.definition.defaultContent[slot.slotId]
              : sessionTrialContent[slot.slotId];
            const fallback = previewContent[slot.slotId];
            const value = typeof trial === "string" ? trial : typeof fallback === "string" ? fallback
              : trial && typeof trial === "object" && "label" in trial ? String(trial.label ?? "")
                : fallback && typeof fallback === "object" && "label" in fallback ? String(fallback.label ?? "") : "";
            setInlineText({ nodeId: node.nodeId, value });
          } else if (slot?.type === "image") {
            selectObject(node.nodeId);
            window.dispatchEvent(new CustomEvent("template-editor:open-default-content", { detail: { nodeId: node.nodeId, slotId: slot.slotId } }));
          }
        }}
        inlineTextEditor={inlineText && selectedNodeId === inlineText.nodeId ? {
          value: inlineText.value,
          label: Number(dynamicDraft.definition.schemaVersion) >= 3 ? "画布默认文字（保存到模板）" : undefined,
          onChange: (value) => setInlineText({ ...inlineText, value }),
          onCancel: () => { setInlineText(null); setCanvasNotice(null); },
          onCommit: () => {
            const currentState = useTemplateEditorSession.getState();
            const currentDraft = currentState.draft;
            if (!currentDraft || currentState.sessionId !== sessionId || currentDraft.definition.templateId !== dynamicDraft.definition.templateId) {
              setInlineText(null);
              return true;
            }
            const node = currentDraft.definition.nodes[inlineText.nodeId];
            const slot = node?.slotId ? currentDraft.definition.slots[node.slotId] : undefined;
            if (slot && getDynamicTemplateStructureLockOwnerId(currentDraft.definition, node.nodeId)) {
              setCanvasNotice("此槽位已锁定，默认内容未改变。");
              return false;
            }
            if (slot && sessionId) {
              if (Number(currentDraft.definition.schemaVersion) >= 3) {
                const result = executeCommand({ type: "update-definition", label: "修改槽位默认文字", update: (next) => {
                  const previous = next.defaultContent[slot.slotId];
                  next.defaultContent[slot.slotId] = slot.type === "button" || slot.type === "link"
                    ? { ...(previous && typeof previous === "object" ? previous : {}), label: inlineText.value }
                    : inlineText.value;
                } });
                if (!result.ok) { setCanvasNotice(result.message); return false; }
                useTemplateTrialContentSession.getState().clearSlotContent(sessionId, slot.slotId);
              } else {
                const previous = sessionTrialContent[slot.slotId];
                useTemplateTrialContentSession.getState().setSlotContent(sessionId, slot.slotId,
                  slot.type === "button" || slot.type === "link" ? { ...(previous && typeof previous === "object" ? previous : {}), label: inlineText.value } : inlineText.value);
              }
            }
            setInlineText(null);
            setCanvasNotice(null);
            return true;
          },
        } : null}
        onOverlaySelectTargets={isEmptyTemplate ? undefined : (targets, additive) => {
          const result = selectTargets(targets.map((target) => ({ targetId: target.ownerNodeId, ...(target.contractRoleId ? { roleId: target.contractRoleId } : {}) })), { additive });
          setSelectionExclusion(result?.ok ? null : result?.exclusions[0] ?? null);
        }}
        onOverlaySelectBackground={() => selectTargets([])}
      >
        <div
          className="template-editor__canvas-renderer template-editor__dynamic-canvas-renderer"
          data-canvas-focus-breakpoint={breakpoint}
          data-preview-mode={previewMode || undefined}
          data-preview-scenario={previewMode ? previewScenario : undefined}
          style={{ width: displayWidth }}
          onClick={previewMode ? undefined : (event) => {
            if (event.target === event.currentTarget) {
              selectObject(dynamicDraft.definition.rootNodeId);
            }
          }}
        >
          <DynamicTemplateRenderer
            definition={dynamicDraft.definition}
            breakpoint={breakpoint}
            device={device}
            contentBySlotId={previewContent}
            mode={previewMode ? "preview" : "editor"}
            showEmptySlots={!previewMode}
            editorSurface={previewMode ? undefined : "template-definition"}
            interactionOwner={previewMode ? undefined : "host-overlay"}
            templateEditorSessionId={previewMode ? undefined : sessionId ?? undefined}
            selectedNodeId={selectedNodeId}
            selectedContractRole={selectedContractRole}
            onSelectNode={previewMode ? undefined : selectObject}
            onSelectContractRole={previewMode ? undefined : selectContractRole}
            onTemplatePlacementCommit={previewMode ? undefined : commitPlacement}
            onNodeAction={previewMode || selectedNodeId === dynamicDraft.definition.rootNodeId
              ? undefined
              : handleNodeAction}
          />
          {!previewMode && isEmptyTemplate ? (
            <div className="template-editor__canvas-empty-state" role="region" aria-label="空白模板起步操作">
              <strong>当前模板暂无内容</strong>
              <p>添加区域继续编辑，或撤销刚才的删除。</p>
              <div className="template-editor__canvas-empty-actions">
                <Button type="primary" onClick={addFirstRegion}>添加区域</Button>
              </div>
            </div>
          ) : null}
        </div>
      </TemplateViewportFrame>}
      {selectionExclusion ? (
        <span
          className="template-editor__selection-exclusion"
          role="status"
          aria-label="多选目标已排除"
          data-selection-exclusion-code={selectionExclusion.code}
          data-selection-exclusion-target-id={selectionExclusion.target.targetId}
          data-selection-exclusion-role-id={selectionExclusion.target.roleId}
          data-selection-exclusion-reason={selectionExclusion.reason}
        >
          {selectionExclusion.reason}
        </span>
      ) : null}
      {canvasNotice ? <span role="status">{canvasNotice}</span> : null}
    </section>
  );
}
