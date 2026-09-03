import { useEffect, useState } from "react";
import {
  duplicateDynamicTemplateNode,
  DynamicTemplateRenderer,
  formatTemplateRatio,
  removeDynamicTemplateNode,
  resolveTemplateDesignFrame,
  setTemplateDesignHeightMode,
  setTemplateDesignWidth,
  setDynamicTemplateNodeHidden,
} from "../template-definition";
import type { TemplateDefinitionV2 } from "../template-definition";
import {
  getContentTemplateContract,
  sanitizeContentTemplateLayoutData,
} from "../generated/contentTemplates.generated";
import {
  getContentTemplateModuleTypeForSlotType,
} from "../template-definition/validateTemplateDefinition";
import {
  CANVAS_VISUAL_EDIT_MESSAGE,
  useVisualEditorSession,
  type CanvasVisualEditMessage,
  type VisualNodeKind,
} from "../visual-editor/visualEditorSession";
import { useTemplateEditorSession } from "./templateEditorSession";
import TemplateViewportFrame, {
  type TemplateDirectResizeValue,
} from "./TemplateViewportFrame";
import {
  createTemplatePreviewContentBySlotId,
  createTemplatePreviewScenarioContentBySlotId,
  resolveTemplatePreviewViewport,
} from "./templatePreviewModel";

function createEditingContent(
  definition: TemplateDefinitionV2,
): Record<string, unknown> {
  return createTemplatePreviewContentBySlotId(definition);
}

function visualKindFromContractKind(kind: string): VisualNodeKind {
  if (kind === "media" || kind === "video") return "media";
  if (kind === "text") return "text";
  if (kind === "action") return "action";
  if (kind === "product") return "product";
  return "structured";
}

export default function DynamicTemplateCanvas() {
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
  const setDynamicDefinition = useTemplateEditorSession((state) => state.setDynamicDefinition);
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
      if (node.props.contentTemplateDesignProps?.structureLocked === true) return;

      const sanitized = detail.overrides === undefined
        ? undefined
        : sanitizeContentTemplateLayoutData(detail.moduleType, detail.overrides);
      if (detail.overrides !== undefined && !sanitized) return;
      const next = structuredClone(currentDraft.definition);
      if (sanitized) next.nodes[nodeId].props.contentTemplateLayoutData = sanitized;
      else delete next.nodes[nodeId].props.contentTemplateLayoutData;
      state.setDynamicDefinition(next);
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
    const object = contract?.editorCapabilities.editableObjects.find(
      (candidate) => candidate.roleId === selectedContractRole.roleId
        || candidate.nodeIds?.includes(selectedContractRole.roleId),
    );
    if (!object) return;
    useVisualEditorSession.getState().selectNode({
      blockId: `template-editor:${sessionId}:${selectedContractRole.nodeId}`,
      moduleType,
      nodeId: selectedContractRole.roleId,
      kind: visualKindFromContractKind(object.kind),
      canAdjustLayout: object.capabilities.includes("layout"),
      canAdjustMedia: object.capabilities.some((capability) =>
        capability === "focus" || capability === "fit" || capability === "zoom"),
    });
  }, [dynamicDraft, selectedContractRole, sessionId]);
  if (!dynamicDraft) return null;
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

  const commitPlacement = (
    nodeId: string,
    targetDevice: "desktop" | "mobile",
    placement: NonNullable<TemplateDefinitionV2["nodes"][string]["responsive"]["desktop"]["placement"]>,
  ) => {
    const currentDraft = useTemplateEditorSession.getState().draft;
    const node = currentDraft?.definition.nodes[nodeId];
    if (!currentDraft || !node) return;
    if (node.props.contentTemplateDesignProps?.structureLocked === true) return;
    const next = structuredClone(currentDraft.definition);
    next.nodes[nodeId].responsive[targetDevice].placement = placement;
    setDynamicDefinition(next);
  };
  const handleNodeAction = (
    nodeId: string,
    action: "duplicate" | "hide" | "delete" | "forward" | "backward"
      | "align-horizontal" | "align-vertical" | "copy-responsive",
  ) => {
    const currentDraft = useTemplateEditorSession.getState().draft;
    if (!currentDraft) return;
    const node = currentDraft.definition.nodes[nodeId];
    if (node?.props.contentTemplateDesignProps?.structureLocked === true) return;
    const slot = node?.slotId ? currentDraft.definition.slots[node.slotId] : undefined;
    if ((action === "hide" || action === "delete") && slot?.required) return;
    if (action === "duplicate") {
      const result = duplicateDynamicTemplateNode(currentDraft.definition, nodeId);
      setDynamicDefinition(result.definition);
      selectObject(result.nodeId);
      return;
    }
    if (action === "delete") {
      if (!window.confirm("删除当前节点及其子节点？可使用撤销恢复。")) return;
      setDynamicDefinition(removeDynamicTemplateNode(currentDraft.definition, nodeId));
      selectObject(currentDraft.definition.rootNodeId);
      return;
    }
    if (action === "hide") {
      setDynamicDefinition(setDynamicTemplateNodeHidden(currentDraft.definition, nodeId, true));
      selectObject(currentDraft.definition.rootNodeId);
      return;
    }
    const placement = currentDraft.definition.nodes[nodeId]?.responsive[device].placement;
    if (!placement) return;
    const next = structuredClone(currentDraft.definition);
    if (action === "align-horizontal" || action === "align-vertical") {
      next.nodes[nodeId].responsive[device].placement = {
        ...placement,
        x: action === "align-horizontal"
          ? Math.max(0, Math.min(1 - placement.width, (1 - placement.width) / 2))
          : placement.x,
        y: action === "align-vertical"
          ? Math.max(0, Math.min(1 - placement.height, (1 - placement.height) / 2))
          : placement.y,
      };
      setDynamicDefinition(next);
      return;
    }
    if (action === "copy-responsive") {
      const targetDevice = device === "desktop" ? "mobile" : "desktop";
      const parent = Object.values(next.nodes).find((candidate) => candidate.childIds.includes(nodeId));
      if (!parent || parent.type !== "Stack" || parent.responsive[device].layoutMode !== "free") return;
      const sourceParentRules = parent.responsive[device];
      const targetParentRules = parent.responsive[targetDevice];
      targetParentRules.layoutMode = "free";
      targetParentRules.display = "block";
      if (targetParentRules.height.mode === "auto") {
        targetParentRules.height = structuredClone(sourceParentRules.height);
      }
      parent.childIds.forEach((childId) => {
        const sourcePlacement = next.nodes[childId]?.responsive[device].placement;
        if (sourcePlacement) {
          next.nodes[childId].responsive[targetDevice].placement = { ...sourcePlacement };
        }
      });
      setDynamicDefinition(next);
      return;
    }
    next.nodes[nodeId].responsive[device].placement = {
      ...placement,
      zIndex: Math.max(-10, Math.min(10, placement.zIndex + (action === "forward" ? 1 : -1))),
    };
    setDynamicDefinition(next);
  };
  const updateCanvasWidth = (width: number) => {
    const currentDraft = useTemplateEditorSession.getState().draft;
    if (!currentDraft) return;
    setDynamicDefinition(setTemplateDesignWidth(currentDraft.definition, device, width));
  };
  const updateCanvasHeight = (height: number) => {
    const currentDraft = useTemplateEditorSession.getState().draft;
    if (!currentDraft) return;
    setDynamicDefinition(setTemplateDesignHeightMode(currentDraft.definition, device, "fixed", height));
  };
  const updateCanvasHeightMode = (mode: "fixed" | "aspect-ratio" | "auto") => {
    const currentDraft = useTemplateEditorSession.getState().draft;
    if (!currentDraft) return;
    setDynamicDefinition(setTemplateDesignHeightMode(currentDraft.definition, device, mode));
  };
  const updateCanvasRatio = (ratio: { width: number; height: number }) => {
    const currentDraft = useTemplateEditorSession.getState().draft;
    if (!currentDraft) return;
    setDynamicDefinition(setTemplateDesignHeightMode(currentDraft.definition, device, "aspect-ratio", ratio));
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
    setDynamicDefinition(next);
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
    if (changed) setDynamicDefinition(next);
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
        resizable={!previewMode}
        title={`${dynamicDraft.definition.name}${device === "desktop" ? "桌面" : "移动"}模板隔离画布`}
        onWidthChange={updateCanvasWidth}
        onHeightChange={updateCanvasHeight}
        onHeightModeChange={updateCanvasHeightMode}
        onRatioChange={updateCanvasRatio}
        canRestore={canRestoreCanvasSize}
        deviceLabel={device === "desktop" ? "桌面端" : "移动端"}
        onRestore={restoreCanvasSize}
        onDirectResizePreview={setDirectResizePreview}
        onDirectResizeCancel={() => setDirectResizePreview(null)}
        onDirectResizeCommit={commitDirectResize}
        hasSelection={!previewMode && Boolean(selectedNodeId)}
        onSelectNode={previewMode ? undefined : selectObject}
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
            templateEditorSessionId={previewMode ? undefined : sessionId ?? undefined}
            selectedNodeId={selectedNodeId}
            selectedContractRole={selectedContractRole}
            onSelectNode={previewMode ? undefined : selectObject}
            onSelectContractRole={previewMode ? undefined : selectContractRole}
            onTemplatePlacementCommit={previewMode ? undefined : commitPlacement}
            onNodeAction={previewMode ? undefined : handleNodeAction}
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
