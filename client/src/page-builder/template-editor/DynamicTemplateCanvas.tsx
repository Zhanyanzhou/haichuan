import { useEffect, useState } from "react";
import { App as AntdApp } from "antd";
import {
  compileDynamicTemplateRenderPlan,
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
import type { TemplateDefinitionV2 } from "../template-definition";
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
import TemplateViewportFrame, {
  type TemplateDirectResizeValue,
} from "./TemplateViewportFrame";
import type {
  OverlayPlacementGesture,
  OverlayTargetDescriptor,
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
  createTemplatePreviewScenarioContentBySlotId,
  resolveTemplatePreviewViewport,
} from "./templatePreviewModel";
import { describeDynamicTemplateRemoval, findDynamicTemplateParentId } from "./dynamicTemplateEditorUtils";

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
  const baseline = useTemplateEditorSession((state) => state.baseline);
  const device = useTemplateEditorSession((state) => state.device);
  const previewMode = useTemplateEditorSession((state) => state.previewMode);
  const previewScenario = useTemplateEditorSession((state) => state.previewScenario);
  const selectedNodeId = useTemplateEditorSession((state) => state.selectedObjectId);
  const selectedContractRole = useTemplateEditorSession((state) => state.selectedContractRole);
  const sessionId = useTemplateEditorSession((state) => state.sessionId);
  const selectObject = useTemplateEditorSession((state) => state.selectObject);
  const selectContractRole = useTemplateEditorSession((state) => state.selectContractRole);
  const setPreviewScenario = useTemplateEditorSession((state) => state.setPreviewScenario);
  const executeCommand = useTemplateEditorSession((state) => state.executeCommand);
  const visualSelection = useVisualEditorSession((state) =>
    state.workspace === "template" ? state.selection : null,
  );
  const dynamicDraft = draft;
  const [directResizePreview, setDirectResizePreview] = useState<TemplateDirectResizeValue | null>(null);

  useEffect(() => {
    setDirectResizePreview(null);
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
  const canvasLocked = getDynamicTemplateStructureLockOwnerId(dynamicDraft.definition, dynamicDraft.definition.rootNodeId) !== null;
  const rootNode = dynamicDraft.definition.nodes[dynamicDraft.definition.rootNodeId];
  const isEmptyTemplate = !rootNode || rootNode.childIds.length === 0;
  const { sourceWidth, fallbackHeight, heightMode, ratioLabel } = resolveTemplatePreviewViewport(
    dynamicDraft.definition,
    device,
  );
  const displayWidth = directResizePreview?.width ?? sourceWidth;
  const displayHeightMode = directResizePreview?.heightMode ?? heightMode;
  const displayFallbackHeight = directResizePreview?.height
    ?? (directResizePreview && heightMode === "aspect-ratio"
      ? fallbackHeight * displayWidth / sourceWidth
      : fallbackHeight);
  const displayRatioLabel = displayHeightMode === "auto"
    ? "auto"
    : formatTemplateRatio(displayWidth, displayFallbackHeight);
  const previewContent = previewMode
    ? createTemplatePreviewScenarioContentBySlotId(dynamicDraft.definition, previewScenario)
    : createEditingContent(dynamicDraft.definition);
  const editableTargets: OverlayTargetDescriptor[] = (() => {
    if (previewMode) return [];
    const compiled = compileDynamicTemplateRenderPlan(dynamicDraft.definition, {
      device,
      contentBySlotId: previewContent,
      showEmptySlots: true,
    });
    if (!compiled.ok) return [];
    return resolveEditableTargets(
      dynamicDraft.definition,
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
      locked: Boolean(getDynamicTemplateStructureLockOwnerId(dynamicDraft.definition, target.ownerNodeId)),
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
    return dynamicDraft.definition.nodes[target.ownerNodeId]?.responsive[device].placement
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
  const disabledNodeActions = new Map(editableTargets.flatMap((target) => {
    const node = dynamicDraft.definition.nodes[target.ownerNodeId];
    const slot = node?.slotId ? dynamicDraft.definition.slots[node.slotId] : undefined;
    return target.source === "definition-node" && slot?.required
      ? [[target.targetId, new Set(["hide", "delete"] as const)] as const]
      : [];
  }));

  const commitPlacement = (
    nodeId: string,
    targetDevice: "desktop" | "mobile",
    placement: NonNullable<TemplateDefinitionV2["nodes"][string]["responsive"]["desktop"]["placement"]>,
  ) => {
    const currentDraft = useTemplateEditorSession.getState().draft;
    const node = currentDraft?.definition.nodes[nodeId];
    if (!currentDraft || !node) return;
    executeCommand({
      type: "update-definition",
      label: "更新自由布局位置",
      update: (next) => {
        next.nodes[nodeId].responsive[targetDevice].placement = placement;
      },
    });
  };
  const commitOverlayPlacementGesture = (gesture: OverlayPlacementGesture) => {
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
      executeCommand({
        type: "update-definition",
        label: "更新合同对象位置",
        update: (next) => {
          next.nodes[nodeId].props.contentTemplateLayoutData = sanitized;
        },
      });
      return;
    }
    const placement = node?.responsive[device].placement;
    if (!currentDraft || !node || !placement || !gesture.target.capabilities?.includes("structure")) {
      return;
    }
    const parent = Object.values(currentDraft.definition.nodes)
      .find((candidate) => candidate.childIds.includes(nodeId));
    const siblings = parent?.childIds
      .filter((childId) => childId !== nodeId)
      .flatMap((childId) => {
        const siblingPlacement = currentDraft.definition.nodes[childId]?.responsive[device].placement;
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
    commitPlacement(nodeId, device, nextPlacement);
  };
  const selectOverlayTarget = (target: OverlayTargetDescriptor) => {
    if (target.source === "builtin-contract-role" && target.contractRoleId) {
      selectContractRole(target.ownerNodeId, target.contractRoleId);
      return;
    }
    selectObject(target.ownerNodeId);
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
        transform: (current) => setDynamicTemplateNodeHidden(current, nodeId, true),
      });
      if (result.ok) selectObject(currentDraft.definition.rootNodeId);
      return;
    }
    const placement = currentDraft.definition.nodes[nodeId]?.responsive[device].placement;
    if (!placement) return;
    if (action === "align-horizontal" || action === "align-vertical") {
      executeCommand({
        type: "update-definition",
        label: action === "align-horizontal" ? "水平居中节点" : "垂直居中节点",
        update: (next) => {
          next.nodes[nodeId].responsive[device].placement = alignNormalizedRect(
            placement,
            action === "align-horizontal" ? "horizontal" : "vertical",
          );
        },
      });
      return;
    }
    if (action === "copy-responsive") {
      const targetDevice = device === "desktop" ? "mobile" : "desktop";
      const parent = Object.values(currentDraft.definition.nodes).find((candidate) => candidate.childIds.includes(nodeId));
      if (!parent || parent.type !== "Stack" || parent.responsive[device].layoutMode !== "free") return;
      executeCommand({
        type: "update-definition",
        label: "复制自由布局到另一画布",
        update: (next) => {
          const nextParent = next.nodes[parent.nodeId];
          const sourceParentRules = nextParent.responsive[device];
          const targetParentRules = nextParent.responsive[targetDevice];
          targetParentRules.layoutMode = "free";
          targetParentRules.display = "block";
          if (targetParentRules.height.mode === "auto") {
            targetParentRules.height = structuredClone(sourceParentRules.height);
          }
          nextParent.childIds.forEach((childId) => {
            const sourcePlacement = next.nodes[childId]?.responsive[device].placement;
            if (sourcePlacement) {
              next.nodes[childId].responsive[targetDevice].placement = { ...sourcePlacement };
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
        next.nodes[nodeId].responsive[device].placement = {
          ...placement,
          zIndex: clampGeometryValue(placement.zIndex + (action === "forward" ? 1 : -1), -10, 10),
        };
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

  return (
    <section className="homepage-editor__stage template-editor__stage" aria-label={`${dynamicDraft.definition.name}模板设计画布`}>
      {previewMode ? (
        <div className="template-editor__canvas-edit-bar" aria-label="模板画布编辑状态">
          <strong>只读预览</strong>
          <label>
            <span>内容场景</span>
            <select
              aria-label="预览内容场景"
              value={previewScenario}
              onChange={(event) => {
                const value = event.target.value;
                if (value === "default" || value === "empty" || value === "long-text" || value === "missing-image") {
                  setPreviewScenario(value);
                }
              }}
            >
              <option value="default">中性槽位预览</option>
              <option value="empty">全部空内容</option>
              <option value="long-text">超长文字</option>
              <option value="missing-image">缺失图片 / 商品</option>
            </select>
          </label>
        </div>
      ) : null}
      <TemplateViewportFrame
        sourceWidth={displayWidth}
        fallbackHeight={displayFallbackHeight}
        autoHeight={displayHeightMode === "auto"}
        heightMode={displayHeightMode}
        ratioLabel={directResizePreview ? displayRatioLabel : ratioLabel}
        minWidth={device === "desktop" ? 768 : 280}
        maxWidth={device === "desktop" ? 2560 : 767}
        resizable={!previewMode && !canvasLocked}
        title={`${dynamicDraft.definition.name}模板隔离画布`}
        onWidthChange={updateCanvasWidth}
        onHeightChange={updateCanvasHeight}
        onHeightModeChange={updateCanvasHeightMode}
        onRatioChange={updateCanvasRatio}
        canRestore={canRestoreCanvasSize}
        device={device}
        onRestore={restoreCanvasSize}
        onDirectResizePreview={setDirectResizePreview}
        onDirectResizeCancel={() => setDirectResizePreview(null)}
        onDirectResizeCommit={commitDirectResize}
        hasSelection={!previewMode && Boolean(selectedNodeId)}
        onSelectNode={previewMode ? undefined : selectObject}
        overlayTargets={previewMode ? undefined : editableTargets}
        selectedOverlayTargetId={selectedOverlayTargetId}
        movableOverlayTargetIds={overlayPlacementTargetIds}
        resizeOverlayTargetIds={overlayPlacementTargetIds}
        disabledOverlayNodeActions={disabledNodeActions}
        copyResponsiveDestinationLabel="另一画布"
        onOverlayTargetSelect={previewMode ? undefined : selectOverlayTarget}
        onOverlayNodeAction={undefined}
        onOverlayPlacementGesture={previewMode ? undefined : commitOverlayPlacementGesture}
      >
        <div
          className="template-editor__canvas-renderer template-editor__dynamic-canvas-renderer"
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
            device={device}
            contentBySlotId={previewContent}
            mode={previewMode ? "preview" : "editor"}
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
            <div className="template-editor__canvas-empty-state" role="status">
              <strong>从一个清晰构图开始</strong>
              <p>选择左侧“主图 + 双图”，或新增内容区域。</p>
            </div>
          ) : null}
        </div>
      </TemplateViewportFrame>
    </section>
  );
}
