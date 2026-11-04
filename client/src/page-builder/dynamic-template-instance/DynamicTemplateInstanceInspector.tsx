import { useRef, useState } from "react";
import { App as AntdApp, Button, Input, Select, Tag } from "antd";
import MediaPickerField, { mediaSpecFromRecommendation, mediaSpecMatchingFrame } from "../fields/MediaPickerField";
import { ratioLabelOf } from "../config/imageSpecs";
import ProductReferencesField from "../fields/ProductReferencesField";
import NumberField, { focusFirstInvalidNumberField } from "../inspector/controls/NumberField";
import RestoreDefaultButton from "../inspector/controls/RestoreDefaultButton";
import SegmentedField from "../inspector/controls/SegmentedField";
import SwitchField from "../inspector/controls/SwitchField";
import LinkTargetField from "../inspector/LinkTargetField";
import { useInspectorModuleEditor } from "../inspector/useInspectorModuleEditor";
import {
  type DynamicTemplateSlotDefinition,
  type TemplateInstanceLayoutOverride,
} from "../template-definition";
import { objectPositionToPercent } from "../template-definition/imagePosition";
import { describeEffectiveImageFrames } from "../template-definition/mobileWorkGrid";
import { resolveTemplateNodeRules } from "../template-definition/responsive";
import {
  formatExactTemplateRatio,
  getEffectiveTemplateRootRules,
  isContentHeightSplitSection,
  resolvePairedMobileCanvas,
} from "../template-definition/templateDimensions";
import { useVisualEditorSession, type VisualNodeKind } from "../visual-editor/visualEditorSession";
import { useResolvedDynamicTemplate } from "./registry";
import {
  DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY,
  dynamicTemplateVersionKey,
  getDynamicTemplateInstanceEditorBlockId,
  readResolvedDynamicTemplateDefinitions,
  type DynamicTemplateInstanceProps,
} from "./types";
import {
  countNonEditableSlotContent,
  stripNonEditableSlotContent,
} from "./unauthorizedSlotContent";
import DynamicTemplateUpgradePanel from "./DynamicTemplateUpgradePanel";
import { catalogCardName } from "../template-editor/catalogCardName";
import { usePublishedTemplateSectionRoles } from "../template-editor/publishedTemplateSectionRoles";
import {
  promoteInstanceOverridesToTemplateDraft,
  type PromoteDynamicTemplateInstanceRequest,
} from "./promoteToTemplate";
import ImageFocusField from "../inspector/controls/ImageFocusField";
import InspectorFooterBar from "../inspector/InspectorFooterBar";
import { resolvePublishIssueReviewAction } from "../inspector/publishReminderDialog";
import {
  getInspectorPublishIssues,
  type PublishValidationIssue,
  type PublishValidationStatus,
} from "../inspector/publishValidation";
import {
  getDynamicTemplatePageFieldDataAttributes,
  getDynamicTemplatePageFieldDescriptors,
  groupDynamicTemplatePageFields,
  type DynamicTemplatePageFieldDescriptor,
} from "./pageFieldDescriptors";
import { publicationPromiseLabel } from "./publicationPromise";
import { resolveDynamicTemplatePublicVisibility } from "./publicVisibility";

const { TextArea } = Input;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readPageImage(value: unknown) {
  if (typeof value === "string") return { src: value, alt: "", mobileSrc: "" };
  const record = asRecord(value);
  return {
    src: typeof record.src === "string" ? record.src : "",
    alt: typeof record.alt === "string" ? record.alt : "",
    mobileSrc: typeof record.mobileSrc === "string" ? record.mobileSrc : "",
  };
}

function readDeviceImagePresentation(
  slot: DynamicTemplateSlotDefinition,
  imageLayout: TemplateInstanceLayoutOverride | undefined,
  device: "desktop" | "mobile",
) {
  const slotRules = device === "desktop" ? slot.desktopRules : slot.mobileRules;
  const layout = imageLayout ?? {};
  const defaultFocus = objectPositionToPercent(slotRules.objectPosition);
  return {
    slotRules,
    imageLayout: layout,
    defaultFocus,
    objectFit: layout.objectFit ?? slotRules.objectFit ?? "cover",
    focus: {
      x: layout.focusXPercent ?? defaultFocus.x,
      y: layout.focusYPercent ?? defaultFocus.y,
    },
    hasOverride: layout.objectFit !== undefined
      || layout.imageScalePercent !== undefined
      || layout.focusXPercent !== undefined
      || layout.focusYPercent !== undefined,
  };
}

function writePageImage(image: { src: string; alt: string; mobileSrc: string }) {
  const mobileSrc = image.mobileSrc.trim();
  if (!image.src.trim() && !image.alt.trim() && !mobileSrc) return "";
  return {
    src: image.src,
    alt: image.alt,
    ...(mobileSrc ? { mobileSrc } : {}),
  };
}

function parseInspectorRatio(ratio: string | undefined): number | undefined {
  if (!ratio || !/^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/.test(ratio)) return undefined;
  const [width, height] = ratio.split(":").map(Number);
  if (!(width > 0) || !(height > 0)) return undefined;
  return width / height;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getImageAssetGuidance(
  slot: DynamicTemplateSlotDefinition,
  validation: DynamicTemplatePageFieldDescriptor["validation"],
  context: {
    sectionRole?: string;
    geometryPolicy?: "paired-canvas" | "hero-media-frame";
    device: "desktop" | "mobile";
    /** 手机整节对换后的画框。有值时，建议尺寸跟画布，不跟槽位上的桌面比例。 */
    effectiveMobileFrame?: string;
  },
) {
  const parts: string[] = [];
  const { recommendedWidth, recommendedHeight } = validation;
  const frames = describeEffectiveImageFrames({
    sectionRole: context.sectionRole,
    semanticRole: slot.semanticRole,
    geometryPolicy: context.geometryPolicy,
    desktopRatioLabel: slot.desktopRules.aspectRatio,
    mobileRatioLabel: slot.mobileRules.aspectRatio,
  });
  const heroSlot = context.sectionRole === "page-hero"
    && (slot.semanticRole === "backgroundImage" || slot.semanticRole === "heroImage");
  const swappedFrame = context.effectiveMobileFrame && context.effectiveMobileFrame !== "auto"
    ? context.effectiveMobileFrame
    : undefined;
  const portraitLabel = swappedFrame
    ?? (heroSlot && (frames.firstHero === "9:16" || frames.mobile === "9:16") ? "9:16" : undefined);
  if (portraitLabel && frames.desktop && frames.desktop !== portraitLabel) {
    const desktopSpec = mediaSpecFromRecommendation(
      recommendedWidth,
      recommendedHeight,
      frames.desktop,
      "桌面",
    );
    const mobileSpec = mediaSpecMatchingFrame(recommendedWidth, recommendedHeight, portraitLabel, "手机");
    if (context.device === "mobile") {
      if (mobileSpec) parts.push(`建议素材：${mobileSpec.width} × ${mobileSpec.height}（${portraitLabel}）`);
      if (frames.laterHero && portraitLabel === "9:16") parts.push(`后面的全幅画面 ${frames.laterHero}`);
      parts.push(portraitLabel === "9:16"
        ? frames.note
        : `手机整节按 ${portraitLabel} 显示，上传尺寸也按 ${portraitLabel}。`);
    } else if (desktopSpec) {
      parts.push(`建议素材：${desktopSpec.width} × ${desktopSpec.height}（${ratioLabelOf(desktopSpec)}）`);
      parts.push(`当前画框 ${frames.desktop}`);
    }
    return parts.join("。");
  }
  if (recommendedWidth && recommendedHeight) {
    parts.push(`建议素材：${recommendedWidth} × ${recommendedHeight} 像素`);
  } else if (recommendedWidth) {
    parts.push(`建议素材宽度：${recommendedWidth} 像素`);
  } else if (recommendedHeight) {
    parts.push(`建议素材高度：${recommendedHeight} 像素`);
  }
  const currentFrame = context.device === "mobile"
    ? (frames.firstHero ?? frames.mobile)
    : frames.desktop;
  if (currentFrame) parts.push(`当前画框 ${currentFrame}`);
  if (context.device === "mobile" && frames.laterHero) {
    parts.push(`后面的全幅画面 ${frames.laterHero}`);
  }
  parts.push(frames.note);
  return parts.join("。");
}

function visualKindForField(field: DynamicTemplatePageFieldDescriptor): VisualNodeKind {
  if (field.controlKind === "image") return "media";
  if (field.controlKind === "text") return "text";
  if (field.controlKind === "link") return "action";
  if (field.controlKind === "product") return "product";
  return "structured";
}


export default function DynamicTemplateInstanceInspector({
  hasUnsavedChanges,
  hasPersistedDraft,
  saving,
  publishIssues,
  validationStatus,
  onRetryValidation,
  onOpenPublishReview,
  canPromoteToTemplate = false,
  onPromoteToTemplate,
  pageKey,
}: {
  hasUnsavedChanges: boolean;
  hasPersistedDraft: boolean;
  saving: boolean;
  publishIssues: PublishValidationIssue[];
  validationStatus?: PublishValidationStatus;
  onRetryValidation?: () => void;
  onOpenPageSettings?: (field?: string) => void;
  onOpenPublishReview?: () => void;
  canPromoteToTemplate?: boolean;
  onPromoteToTemplate?: (request: PromoteDynamicTemplateInstanceRequest) => void | Promise<void>;
  pageKey?: string;
}) {
  const editor = useInspectorModuleEditor();
  const props = (editor?.props ?? {}) as DynamicTemplateInstanceProps;
  const catalogRoles = usePublishedTemplateSectionRoles((state) => state.rolesByTemplateId);
  const resolved = useResolvedDynamicTemplate(props.templateId ?? "", Number(props.templateVersion));
  const selection = useVisualEditorSession((state) => state.selection);
  const selectVisualNode = useVisualEditorSession((state) => state.selectNode);
  const clearVisualNode = useVisualEditorSession((state) => state.clearNode);
  const { modal } = AntdApp.useApp();
  const propertyScrollRef = useRef<HTMLDivElement>(null);
  const [promotingToTemplate, setPromotingToTemplate] = useState(false);
  if (!editor) return null;
  if (!resolved) {
    return (
      <section className="homepage-editor__properties" aria-label="模板实例属性">
        <div className="homepage-editor__properties-scroll">
          <div className="homepage-editor__properties-empty-state" role="alert">
            <strong>无法读取模板版本</strong>
            <span>{props.templateId} v{props.templateVersion}</span>
          </div>
        </div>
      </section>
    );
  }
  const definition = resolved.definition;
  const editorBlockId = getDynamicTemplateInstanceEditorBlockId(props);
  const pageFields = getDynamicTemplatePageFieldDescriptors(definition);
  const pageFieldBySlotId = new Map(pageFields.map((field) => [field.slotId, field]));
  const content = asRecord(props.contentBySlotId);
  const imageCarriesCopy = props.imageCarriesCopy === true;
  const hasImageSlot = Object.values(definition.slots).some((slot) => slot.type === "image");
  const headingMustBeFilled = Object.values(definition.slots).some(
    (slot) => slot.type === "heading" && slot.required,
  );
  const mediaSideDeclaration = definition.metadata.pageSettings?.mediaSide;
  const selectedMediaSide = props.pageSettings?.mediaSide ?? mediaSideDeclaration?.authoredSide ?? "start";
  // 与 renderPlan 的镜像条件一致：目标容器在桌面不是横排时，左右选择不会改变画面
  const mediaSideTargetRules = mediaSideDeclaration && definition.nodes[mediaSideDeclaration.targetNodeId]
    ? mediaSideDeclaration.targetNodeId === definition.rootNodeId
      ? getEffectiveTemplateRootRules(definition, "desktop")
      : resolveTemplateNodeRules(definition, mediaSideDeclaration.targetNodeId, "desktop")
    : undefined;
  const mediaSideEffective = mediaSideTargetRules?.display === "flex"
    && (mediaSideTargetRules.direction ?? "row") === "row";
  const hidden = Array.isArray(props.hiddenSlotIds)
    ? props.hiddenSlotIds.filter((value): value is string => typeof value === "string")
    : [];
  const selectedNode = selection?.blockId === editorBlockId
    ? definition.nodes[selection.nodeId]
    : undefined;
  const selectedSlot = selectedNode?.slotId
    ? definition.slots[selectedNode.slotId]
    : undefined;
  const selectedPageField = selectedSlot ? pageFieldBySlotId.get(selectedSlot.slotId) : undefined;
  const selectedPolicy = selectedPageField?.effectiveDesignOverrideCapabilities ?? null;
  const slotGroups = groupDynamicTemplatePageFields(pageFields, selectedNode?.slotId);
  const layoutOverrides = props.layoutOverridesByNodeId ?? {};
  const promotionPreview = promoteInstanceOverridesToTemplateDraft({
    sourceDefinition: definition,
    targetDefinition: definition,
    layoutOverridesByNodeId: props.layoutOverridesByNodeId,
  });
  const contentOverrideCount = Object.keys(content).length + hidden.length + (props.isVisible === false ? 1 : 0);
  const publicDecision = resolveDynamicTemplatePublicVisibility({
    definition,
    contentBySlotId: content,
    hiddenSlotIds: hidden,
    breakpoint: editor.device === "mobile" ? "mobile" : "desktop",
    pageKey,
  });
  const designOverrideCount = Object.values(layoutOverrides).reduce((total, devices) => (
    total + Object.values(devices ?? {}).reduce((deviceTotal, override) => (
      deviceTotal + Object.keys(override ?? {}).length
    ), 0)
  ), 0);
  const currentPublishIssues = getInspectorPublishIssues(
    publishIssues,
    editorBlockId,
    [props.instanceId],
  );
  const currentPublishErrorCount = currentPublishIssues.filter(
    (issue) => issue.severity === "error",
  ).length;
  // 页脚汇总整页阻断；对象状态必须区分当前实例与页面其他问题。
  const instancePublishErrorCount = currentPublishIssues.filter((issue) => (
    issue.severity === "error"
    && (issue.blockId === editorBlockId || issue.blockId === props.instanceId)
  )).length;
  const currentPublishWarningCount = currentPublishIssues.filter(
    (issue) => issue.severity === "warning",
  ).length;
  const publicVisibilityState = props.isVisible === false
    ? "hidden"
    : currentPublishErrorCount > 0
      ? "blocked"
      : publicDecision.visible
        ? "ready"
        : "empty";
  const nodeBySlotId = new Map(
    Object.values(definition.nodes).flatMap((candidate) => candidate.slotId ? [[candidate.slotId, candidate] as const] : []),
  );
  const instancePropertyNodes = Object.values(definition.nodes).filter((candidate) => {
    const candidateField = candidate.slotId ? pageFieldBySlotId.get(candidate.slotId) : undefined;
    return Boolean(candidateField?.editable);
  });
  const selectedPropertyNodeId = selectedNode
    && instancePropertyNodes.some((candidate) => candidate.nodeId === selectedNode.nodeId)
    ? selectedNode.nodeId
    : "";
  const selectedLayout = selectedNode
    ? layoutOverrides[selectedNode.nodeId]?.[editor.device] ?? {}
    : {};
  const selectedTextSlot = Boolean(
    selectedSlot && ["heading", "text", "richText", "badge"].includes(selectedSlot.type),
  );

  const selectInstancePropertyScope = (nodeId: string) => {
    if (focusFirstInvalidNumberField()) return;
    if (!nodeId) {
      clearVisualNode(editorBlockId);
      return;
    }
    const nextNode = definition.nodes[nodeId];
    const nextSlot = nextNode?.slotId ? definition.slots[nextNode.slotId] : undefined;
    const nextField = nextSlot ? pageFieldBySlotId.get(nextSlot.slotId) : undefined;
    if (!nextNode || !nextSlot?.editable || !nextField) return;
    const policy = nextField.effectiveDesignOverrideCapabilities;
    selectVisualNode({
      blockId: editorBlockId,
      moduleType: props.moduleName || definition.name,
      nodeId: nextNode.nodeId,
      kind: visualKindForField(nextField),
      canAdjustLayout: Boolean(policy && (policy.position || policy.size)),
      canAdjustMedia: Boolean(nextSlot.type === "image" && policy && (policy.imageFit || policy.imageFocus)),
    });
    const slotId = nextSlot.slotId;
    requestAnimationFrame(() => {
      propertyScrollRef.current
        ?.querySelector<HTMLElement>(`[data-slot-id="${CSS.escape(slotId)}"]`)
        ?.scrollIntoView({ block: "nearest" });
    });
  };

  const updateContent = (slotId: string, value: unknown) => {
    editor.updateFromCurrent((current) => ({
      contentBySlotId: {
        ...asRecord(current.contentBySlotId),
        [slotId]: value,
      },
    }));
  };
  const resetContent = (slotId: string) => {
    editor.updateFromCurrent((current) => {
      const next = { ...asRecord(current.contentBySlotId) };
      delete next[slotId];
      return { contentBySlotId: next };
    });
  };
  const stripLockedPageValues = () => {
    editor.updateFromCurrent((current) => ({
      contentBySlotId: stripNonEditableSlotContent(current.contentBySlotId, definition),
    }));
  };
  const lockedLeftoverCount = countNonEditableSlotContent(content, definition);
  const toggleHidden = (slotId: string, checked: boolean) => {
    editor.updateFromCurrent((current) => {
      const currentHidden = Array.isArray(current.hiddenSlotIds)
        ? current.hiddenSlotIds.filter((value): value is string => typeof value === "string")
        : [];
      return {
        hiddenSlotIds: checked
          ? [...new Set([...currentHidden, slotId])]
          : currentHidden.filter((value) => value !== slotId),
      };
    });
  };
  const updateMediaPresentation = (
    nodeId: string,
    device: "desktop" | "mobile",
    patch: Partial<TemplateInstanceLayoutOverride>,
  ) => {
    editor.updateFromCurrent((current) => {
      const currentOverrides = asRecord(current.layoutOverridesByNodeId);
      const currentNode = asRecord(currentOverrides[nodeId]);
      const currentDevice = asRecord(currentNode[device]);
      const nextDevice: Record<string, unknown> = { ...currentDevice };
      for (const key of ["objectFit", "imageScalePercent", "focusXPercent", "focusYPercent", "visuallyCollapsed"] as const) {
        if (Object.prototype.hasOwnProperty.call(patch, key)) nextDevice[key] = patch[key];
      }
      for (const [key, value] of Object.entries(nextDevice)) {
        if (value === undefined) delete nextDevice[key];
      }
      const nextOverrides = { ...currentOverrides };
      const nextNode = { ...currentNode };
      if (Object.keys(nextDevice).length > 0) nextNode[device] = nextDevice;
      else delete nextNode[device];
      if (Object.keys(nextNode).length > 0) nextOverrides[nodeId] = nextNode;
      else delete nextOverrides[nodeId];
      return { layoutOverridesByNodeId: nextOverrides };
    });
  };
  const updateSelectedPresentation = (patch: Partial<TemplateInstanceLayoutOverride>) => {
    if (!selectedNode || !selectedPolicy) return;
    const safePatch: Partial<TemplateInstanceLayoutOverride> = {};
    if (selectedPolicy.position && Object.prototype.hasOwnProperty.call(patch, "offsetXPercent")) {
      const next = patch.offsetXPercent === undefined
        ? undefined
        : clamp(patch.offsetXPercent, -selectedPolicy.maxOffsetPercent, selectedPolicy.maxOffsetPercent);
      safePatch.offsetXPercent = next === 0 ? undefined : next;
    }
    if (selectedPolicy.position && Object.prototype.hasOwnProperty.call(patch, "offsetYPercent")) {
      const next = patch.offsetYPercent === undefined
        ? undefined
        : clamp(patch.offsetYPercent, -selectedPolicy.maxOffsetPercent, selectedPolicy.maxOffsetPercent);
      safePatch.offsetYPercent = next === 0 ? undefined : next;
    }
    if (selectedPolicy.size && Object.prototype.hasOwnProperty.call(patch, "widthPercent")) {
      const next = patch.widthPercent === undefined
        ? undefined
        : clamp(patch.widthPercent, selectedPolicy.minWidthPercent, selectedPolicy.maxWidthPercent);
      safePatch.widthPercent = next === 100 ? undefined : next;
    }
    if (selectedPolicy.zIndex && Object.prototype.hasOwnProperty.call(patch, "zIndex")) {
      const next = patch.zIndex === undefined ? undefined : clamp(Math.round(patch.zIndex), -10, 10);
      safePatch.zIndex = next === 0 ? undefined : next;
    }
    if (selectedPolicy.typography && selectedTextSlot && Object.prototype.hasOwnProperty.call(patch, "fontSizePx")) {
      safePatch.fontSizePx = patch.fontSizePx === undefined
        ? undefined
        : clamp(patch.fontSizePx, selectedPolicy.minFontSizePx ?? 12, selectedPolicy.maxFontSizePx ?? 96);
    }
    if (selectedPolicy.typography && selectedTextSlot && Object.prototype.hasOwnProperty.call(patch, "textAlign")) {
      safePatch.textAlign = patch.textAlign;
    }
    if (selectedPolicy.spacing && selectedTextSlot && Object.prototype.hasOwnProperty.call(patch, "marginTopPx")) {
      const next = patch.marginTopPx === undefined
        ? undefined
        : clamp(patch.marginTopPx, 0, selectedPolicy.maxSpacingPx ?? 120);
      safePatch.marginTopPx = next === 0 ? undefined : next;
    }
    if (selectedPolicy.spacing && selectedTextSlot && Object.prototype.hasOwnProperty.call(patch, "marginBottomPx")) {
      const next = patch.marginBottomPx === undefined
        ? undefined
        : clamp(patch.marginBottomPx, 0, selectedPolicy.maxSpacingPx ?? 120);
      safePatch.marginBottomPx = next === 0 ? undefined : next;
    }
    if (Object.keys(safePatch).length === 0) return;
    editor.updateFromCurrent((current) => {
      const currentOverrides = asRecord(current.layoutOverridesByNodeId);
      const currentNode = asRecord(currentOverrides[selectedNode.nodeId]);
      const currentDevice = asRecord(currentNode[editor.device]);
      const nextDevice: Record<string, unknown> = { ...currentDevice };
      for (const [key, value] of Object.entries(safePatch)) {
        if (value === undefined) delete nextDevice[key];
        else nextDevice[key] = value;
      }
      const nextOverrides = { ...currentOverrides };
      const nextNode = { ...currentNode };
      if (Object.keys(nextDevice).length > 0) nextNode[editor.device] = nextDevice;
      else delete nextNode[editor.device];
      if (Object.keys(nextNode).length > 0) nextOverrides[selectedNode.nodeId] = nextNode;
      else delete nextOverrides[selectedNode.nodeId];
      return { layoutOverridesByNodeId: nextOverrides };
    });
  };
  const resetSelectedPresentation = () => {
    if (!selectedNode) return;
    editor.updateHistoryTransaction((current) => {
      const currentOverrides = asRecord(current.layoutOverridesByNodeId);
      const currentNode = asRecord(currentOverrides[selectedNode.nodeId]);
      const nextNode = { ...currentNode };
      delete nextNode[editor.device];
      const nextOverrides = { ...currentOverrides };
      if (Object.keys(nextNode).length > 0) nextOverrides[selectedNode.nodeId] = nextNode;
      else delete nextOverrides[selectedNode.nodeId];
      return { layoutOverridesByNodeId: nextOverrides };
    });
  };

  const promoteToTemplate = async () => {
    if (!canPromoteToTemplate || !onPromoteToTemplate || promotionPreview.promoted.length === 0) return;
    setPromotingToTemplate(true);
    try {
      await onPromoteToTemplate({
        templateId: props.templateId,
        sourceVersion: resolved.version,
        sourceDefinitionChecksum: resolved.definitionChecksum,
        sourceDefinition: definition,
        layoutOverridesByNodeId: props.layoutOverridesByNodeId,
      });
    } finally {
      setPromotingToTemplate(false);
    }
  };

  const renderSlotControl = (field: DynamicTemplatePageFieldDescriptor) => {
    const slot = definition.slots[field.slotId];
    const hasPageValue = Object.prototype.hasOwnProperty.call(content, slot.slotId);
    // 面板只显示本页填写的值。模板示例不预填，没填的槽位在页面画布上收起。
    const value = hasPageValue ? content[slot.slotId] : undefined;
    if (!field.editable) {
      return (
        <>
          <p className="homepage-editor__properties-hint">此内容由模板锁定，页面不能修改。</p>
          {hasPageValue ? (
            <p className="homepage-editor__properties-hint" role="status">
              当前草稿仍保留旧的页面覆盖，发布前需要移除。
            </p>
          ) : null}
        </>
      );
    }
    if (field.controlKind === "text" && ["heading", "badge", "icon"].includes(field.slotType)) {
      return (
        <Input
          aria-label={field.label}
          value={typeof value === "string" ? value : ""}
          maxLength={field.validation.maxLength}
          onChange={(event) => updateContent(slot.slotId, event.target.value)}
        />
      );
    }
    if (field.controlKind === "text" && ["text", "richText"].includes(field.slotType)) {
      return (
        <TextArea
          aria-label={field.label}
          value={typeof value === "string" ? value : ""}
          rows={field.slotType === "richText" ? 6 : 3}
          maxLength={field.validation.maxLength}
          showCount={Boolean(field.validation.maxLength)}
          onChange={(event) => updateContent(slot.slotId, event.target.value)}
        />
      );
    }
    if (field.controlKind === "image") {
      const image = readPageImage(value);
      const commitImage = (patch: Partial<typeof image>) => {
        updateContent(slot.slotId, writePageImage({ ...image, ...patch }));
      };
      const imageNode = nodeBySlotId.get(slot.slotId);
      const imagePolicy = field.effectiveDesignOverrideCapabilities;
      const nodeLayout = imageNode ? layoutOverrides[imageNode.nodeId] : undefined;
      const desktopPresentation = readDeviceImagePresentation(slot, nodeLayout?.desktop, "desktop");
      const mobilePresentation = readDeviceImagePresentation(slot, nodeLayout?.mobile, "mobile");
      const mobilePreviewSrc = image.mobileSrc.trim() || image.src.trim();
      const explicitMobileFit = nodeLayout?.mobile?.objectFit;
      const sectionRole = definition.metadata.sectionRole ?? definition.templateRecipe?.sectionRole;
      const heroCapable = sectionRole === "page-hero"
        && (slot.semanticRole === "backgroundImage" || slot.semanticRole === "heroImage");
      const desktopRatio = parseInspectorRatio(slot.desktopRules.aspectRatio);
      const mobileRatio = parseInspectorRatio(slot.mobileRules.aspectRatio);
      const authoredPortrait = Boolean(mobileRatio && mobileRatio < 1 && Math.abs(mobileRatio - 9 / 16) >= 0.02 && Math.abs(mobileRatio - 4 / 5) >= 0.02);
      // 整节已对换时，缺手机图也不能退回桌面横框；画布裁的是对换后的比例。
      const pairedCanvasRatio = heroCapable && !isContentHeightSplitSection(definition)
        ? resolvePairedMobileCanvas(definition)
        : null;
      const swappedHeroFrame = pairedCanvasRatio
        ? formatExactTemplateRatio(pairedCanvasRatio.width, pairedCanvasRatio.height)
        : undefined;
      const heroCanvasFrame = swappedHeroFrame && swappedHeroFrame !== "auto" ? swappedHeroFrame : undefined;
      const reuseLandscape = heroCapable
        && !image.mobileSrc.trim()
        && !authoredPortrait
        && explicitMobileFit !== "cover"
        && explicitMobileFit !== "fill"
        && Boolean(desktopRatio && desktopRatio >= 1)
        && !heroCanvasFrame;
      const mobilePreviewFit = reuseLandscape
        ? "cover"
        : imageCarriesCopy
          && !image.mobileSrc.trim()
          && mobilePresentation.objectFit !== "cover"
          && mobilePresentation.objectFit !== "fill"
          ? "contain"
          : mobilePresentation.objectFit;
      const compositionDevice: "desktop" | "mobile" = editor.device === "mobile" ? "mobile" : "desktop";
      const writeImageComposition = (
        device: "desktop" | "mobile",
        patch: Partial<TemplateInstanceLayoutOverride>,
      ) => {
        if (!imageNode) return;
        // 只写当前画布这一端。视口由顶部设备切换决定，构图操作不改画布端口。
        updateMediaPresentation(imageNode.nodeId, device, patch);
      };
      const updateImageFocus = (device: "desktop" | "mobile", next: { x: number; y: number }) => {
        const presentation = device === "desktop" ? desktopPresentation : mobilePresentation;
        writeImageComposition(device, {
          focusXPercent: next.x === presentation.defaultFocus.x ? undefined : next.x,
          focusYPercent: next.y === presentation.defaultFocus.y ? undefined : next.y,
        });
      };
      const frames = describeEffectiveImageFrames({
        sectionRole,
        semanticRole: slot.semanticRole,
        geometryPolicy: definition.metadata.geometryPolicy,
        desktopRatioLabel: slot.desktopRules.aspectRatio,
        mobileRatioLabel: slot.mobileRules.aspectRatio,
      });
      const mobileFrameLabel = heroCanvasFrame
        ?? frames.firstHero
        ?? frames.mobile
        ?? slot.mobileRules.aspectRatio
        ?? slot.desktopRules.aspectRatio;
      const reusedPreviewRatio = reuseLandscape ? slot.desktopRules.aspectRatio : mobileFrameLabel;
      const assetGuidance = getImageAssetGuidance(slot, field.validation, {
        sectionRole,
        geometryPolicy: definition.metadata.geometryPolicy,
        device: compositionDevice,
        effectiveMobileFrame: heroCanvasFrame,
      });
      const renderImageComposition = (device: "desktop" | "mobile", quiet = false) => {
        if (!imageNode) return null;
        if (device === "mobile" && !mobilePreviewSrc) return null;
        const presentation = device === "desktop" ? desktopPresentation : mobilePresentation;
        const canDrag = presentation.objectFit !== "fill";
        const hasFit = Boolean(imagePolicy?.imageFit);
        if (!canDrag && !hasFit) return null;
        return (
          <div data-image-composition={device}>
            {canDrag ? (
              <ImageFocusField
                inspectorFieldKeys={{ x: "focusXPercent", y: "focusYPercent" }}
                inspectorDevice={device}
                label={`${field.label}画面焦点`}
                value={presentation.focus}
                showPad={false}
                showLabel={false}
                onChange={(next) => updateImageFocus(device, next)}
              />
            ) : null}
            {hasFit ? (
              <label
                className="homepage-editor__inspector-field"
                data-inspector-field="objectFit"
                data-inspector-device={device}
              >
                <span className="homepage-editor__properties-hint">排列方式</span>
                <Select
                  aria-label={`${field.label}图片适配`}
                  value={presentation.objectFit === "fill" ? undefined : presentation.objectFit}
                  placeholder={presentation.objectFit === "fill" ? "当前为拉伸，请改为裁切或完整显示" : undefined}
                  options={[
                    { value: "cover", label: "填满并裁切" },
                    { value: "contain", label: "完整显示" },
                  ]}
                  onChange={(nextObjectFit) => writeImageComposition(device, {
                    objectFit: nextObjectFit === (presentation.slotRules.objectFit ?? "cover") ? undefined : nextObjectFit,
                  })}
                />
              </label>
            ) : null}
            {hasFit ? (
              <NumberField
                inspectorField="imageScalePercent"
                inspectorDevice={device}
                label={`${field.label}缩放`}
                unit="%"
                min={100}
                max={200}
                value={presentation.imageLayout.imageScalePercent}
                onChange={(imageScalePercent) => writeImageComposition(device, {
                  imageScalePercent: imageScalePercent === 100 ? undefined : imageScalePercent,
                })}
                onClear={() => writeImageComposition(device, { imageScalePercent: undefined })}
              />
            ) : null}
            {presentation.hasOverride ? (
              <RestoreDefaultButton
                label="清除这一端的构图"
                onClick={() => writeImageComposition(device, {
                  objectFit: undefined,
                  imageScalePercent: undefined,
                  focusXPercent: undefined,
                  focusYPercent: undefined,
                })}
              />
            ) : quiet ? null : (
              <p className="homepage-editor__properties-hint">
                当前沿用模板构图，尚未单独设置。
              </p>
            )}
          </div>
        );
      };
      const editingMobile = compositionDevice === "mobile";
      const activePresentation = editingMobile ? mobilePresentation : desktopPresentation;
      const activeRatioLabel = editingMobile
        ? (image.mobileSrc.trim() ? mobileFrameLabel : reusedPreviewRatio)
        : slot.desktopRules.aspectRatio;
      const activeFit = editingMobile ? mobilePreviewFit : desktopPresentation.objectFit;
      const activeSrc = editingMobile ? image.mobileSrc : image.src;
      const inheritedSrc = editingMobile && !image.mobileSrc.trim() ? image.src.trim() : "";
      const canFocusActive = Boolean(imageNode)
        && activePresentation.objectFit !== "fill"
        && Boolean(activeSrc.trim() || inheritedSrc);
      const activeSpec = !editingMobile || (reuseLandscape && !image.mobileSrc.trim())
        ? mediaSpecFromRecommendation(
          field.validation.recommendedWidth,
          field.validation.recommendedHeight,
          activeRatioLabel,
          field.label,
        )
        : mediaSpecMatchingFrame(
          field.validation.recommendedWidth,
          field.validation.recommendedHeight,
          mobileFrameLabel,
          field.label,
        );
      return (
        <div className="homepage-editor__media-controls">
          <MediaPickerField
            fieldKey={editingMobile ? `${slot.slotId}-mobile` : slot.slotId}
            device={compositionDevice}
            value={activeSrc}
            fallbackSrc={inheritedSrc || undefined}
            required={editingMobile ? false : field.required}
            spec={activeSpec}
            previewAspectRatio={activeRatioLabel?.replace(":", " / ")}
            previewFit={activeFit}
            previewFocus={activePresentation.focus}
            previewZoom={(activePresentation.imageLayout.imageScalePercent ?? 100) / 100}
            frameLabel={activeRatioLabel}
            onFocusChange={canFocusActive
              ? (next) => updateImageFocus(compositionDevice, next)
              : undefined}
            onChange={(next) => commitImage(editingMobile ? { mobileSrc: next } : { src: next })}
          />
          {inheritedSrc ? (
            <p
              className="homepage-editor__properties-hint"
              data-media-inherited-hint="true"
              data-mobile-asset-gap={editingMobile && heroCapable ? "true" : undefined}
            >
              {reuseLandscape
                ? "这一端用的是桌面横图，按原比例显示。若要竖幅，替换成竖图，只换这一端。"
                : editingMobile && heroCapable
                  ? "这一端用的是桌面图，会按手机画框取景。若要竖幅，替换成竖图，只换这一端。"
                  : "这一端用的是桌面图，按当前画框取景。不合适就替换，只换这一端。"}
            </p>
          ) : null}
          {renderImageComposition(compositionDevice, Boolean(inheritedSrc))}
          {imageCarriesCopy ? (
            <p className="homepage-editor__properties-hint">
              画面上的字在图片里。换句子要替换当前这一端的图片，不要把横图裁成竖图。
            </p>
          ) : null}
          {editingMobile && heroCapable && !image.mobileSrc?.trim() && !inheritedSrc ? (
            <p className="homepage-editor__properties-hint" data-mobile-asset-gap="true">
              {explicitMobileFit === "cover" || explicitMobileFit === "fill"
                ? "当前适配是铺满，横图可能被裁进手机竖框。若要完整构图，请另传竖图。"
                : reuseLandscape
                  ? "还没有手机竖图。这张横图按桌面比例满宽显示，不再裁成竖幅，也不会留出深色边。若要手机竖幅，请另传一张竖图。"
                  : imageCarriesCopy
                    ? "这一处可以做页面第一屏，还没有手机图。带字的图会完整放入，不会裁切；请另传竖图。"
                    : "这一处可以做页面第一屏，还没有手机图。气氛照片会铺满，并可能裁掉主体；请另传竖图。"}
            </p>
          ) : null}
          {assetGuidance ? (
            <p className="homepage-editor__properties-hint" data-image-asset-guidance={slot.slotId}>
              {assetGuidance}
            </p>
          ) : null}
          <label className="homepage-editor__inspector-field">
            <span className="homepage-editor__properties-hint">替代文字</span>
            <Input
              aria-label={`${field.label}替代文字`}
              value={image.alt}
              placeholder="描述图片内容，供无障碍与图片缺失时使用"
              onChange={(event) => commitImage({ alt: event.target.value })}
            />
          </label>
        </div>
      );
    }
    if (field.controlKind === "link" && (field.slotType === "button" || field.slotType === "link")) {
      const action = asRecord(value);
      const targetType = typeof action.targetType === "string" ? action.targetType : "none";
      const linkUrl = targetType === "page"
        ? action.pagePath
        : targetType === "external"
          ? action.url
          : "";
      return (
        <div style={{ display: "grid", gap: 10 }}>
          <Input
            aria-label={`${field.label}文案`}
            value={typeof action.label === "string" ? action.label : ""}
            placeholder="行动文案"
            onChange={(event) => updateContent(slot.slotId, { ...action, label: event.target.value })}
          />
          <LinkTargetField
            id={`dynamic-template-${props.instanceId}-${slot.slotId}`}
            compact
            label={`${field.label}跳转`}
            targetType={targetType}
            productCode={typeof action.productCode === "string" ? action.productCode : ""}
            categorySlug={typeof action.categorySlug === "string" ? action.categorySlug : ""}
            linkUrl={typeof linkUrl === "string" ? linkUrl : ""}
            onChange={(patch) => {
              const nextTargetType = typeof patch.targetType === "string" ? patch.targetType : targetType;
              const next: Record<string, unknown> = {
                label: typeof action.label === "string" ? action.label : "",
                targetType: nextTargetType,
              };
              const productCode = typeof patch.productCode === "string" ? patch.productCode : action.productCode;
              const categorySlug = typeof patch.categorySlug === "string" ? patch.categorySlug : action.categorySlug;
              const nextLinkUrl = typeof patch.linkUrl === "string" ? patch.linkUrl : linkUrl;
              if (nextTargetType === "product" && typeof productCode === "string" && productCode) next.productCode = productCode;
              if (nextTargetType === "category" && typeof categorySlug === "string" && categorySlug) next.categorySlug = categorySlug;
              if (nextTargetType === "page" && typeof nextLinkUrl === "string" && nextLinkUrl) next.pagePath = nextLinkUrl;
              if (nextTargetType === "external" && typeof nextLinkUrl === "string" && nextLinkUrl) next.url = nextLinkUrl;
              updateContent(slot.slotId, next);
            }}
          />
        </div>
      );
    }
    if (field.controlKind === "product" && field.slotType === "product") {
      return (
        <ProductReferencesField
          value={typeof value === "string" && value ? [value] : []}
          onChange={(codes) => updateContent(slot.slotId, codes[0] ?? "")}
          minProducts={field.required ? 1 : 0}
          maxProducts={1}
        />
      );
    }
    if (field.controlKind === "product" && field.slotType === "collection") {
      const values = Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : [];
      return (
        <ProductReferencesField
          value={values}
          onChange={(codes) => updateContent(slot.slotId, codes)}
          minProducts={field.required ? Math.max(1, field.validation.minItems ?? 1) : (field.validation.minItems ?? 0)}
          maxProducts={field.validation.maxItems ?? 8}
        />
      );
    }
    return null;
  };

  const renderSlotFieldset = (field: DynamicTemplatePageFieldDescriptor) => {
    const slot = definition.slots[field.slotId];
    const hasPageValue = Object.prototype.hasOwnProperty.call(content, slot.slotId);
    const resetLabel = definition.schemaVersion >= 3
      ? field.controlKind === "image" ? "清除页面图片" : "清除页面文案"
      : field.controlKind === "image" ? "恢复模板图片" : "恢复模板文案";
    return (
    <fieldset
      key={slot.slotId}
      data-slot-id={slot.slotId}
      data-slot-task={field.task}
      data-inspector-field={slot.slotId}
      data-page-field-selected={selectedPageField?.slotId === slot.slotId ? "true" : undefined}
      {...getDynamicTemplatePageFieldDataAttributes(field, "page")}
      style={{ border: 0, borderTop: "1px solid var(--adm-line)", margin: 0, padding: "14px" }}
    >
      <legend style={{ width: "100%", padding: 0, marginBottom: 10 }}>
        <strong>{field.label}</strong>
        <Tag color={field.required ? "red" : "default"} style={{ marginLeft: 8 }}>{publicationPromiseLabel(field, definition.schemaVersion)}</Tag>
      </legend>
      {renderSlotControl(field)}
      {imageCarriesCopy && field.slotType === "heading" ? (
        <p className="homepage-editor__properties-hint">
          {field.required
            ? "这一节把标题标成必须填写。它留在页面大纲和读屏里，不会画到画面上。"
            : "标题可以留空。留空就不显示，也不会挡住这张图发布。"}
        </p>
      ) : null}
      {imageCarriesCopy && field.slotType === "button" ? (
        <p className="homepage-editor__properties-hint">
          画在图片里的按钮图案不是链接。只有保存了真实跳转、并且这一处行动是打开的，整张主图才会成为这一处链接。行动关闭或没有目标时，不会生成链接。
        </p>
      ) : null}
      {!imageCarriesCopy && field.slotType === "button" ? (
        <p className="homepage-editor__properties-hint">
          画在图片里的按钮图案不是链接。填好站内页面或已批准的网址后，这个按钮本身才是链接。
        </p>
      ) : null}
      {hasPageValue && (!field.required || !field.editable) ? (
        <div style={{ marginTop: 6 }}>
          <Button
            type="link"
            size="small"
            aria-label={resetLabel}
            onClick={() => resetContent(slot.slotId)}
            style={{ height: 24, paddingInline: 0 }}
          >
            {resetLabel}
          </Button>
          {field.controlKind === "image" ? (
            <p className="homepage-editor__properties-hint">
              {field.required
                ? "恢复后如果当前设备没有页面图片，整个区块在前台会隐藏。模板默认图不会公开。可撤销。"
                : "恢复后公开页面会收起这张图，有效文字仍保留。模板默认图不会公开。可撤销。"}
            </p>
          ) : (
            <p className="homepage-editor__properties-hint">清除这项的页面内容。重新填写前，页面画布先收起，不会补上模板示例。可撤销。</p>
          )}
        </div>
      ) : null}
      {field.editable && ["image", "heading", "text", "richText", "badge"].includes(slot.type) ? (
        <div style={{ marginTop: 6 }}>
          <Button
            type="link"
            size="small"
            aria-label="清空并隐藏"
            onClick={() => editor.updateFromCurrent((current) => {
              const nextContent = { ...asRecord(current.contentBySlotId) };
              nextContent[slot.slotId] = slot.type === "image" ? { src: "", alt: "" } : "";
              const currentHidden = Array.isArray(current.hiddenSlotIds)
                ? current.hiddenSlotIds.filter((value): value is string => typeof value === "string")
                : [];
              return {
                contentBySlotId: nextContent,
                hiddenSlotIds: slot.hideable
                  ? [...new Set([...currentHidden, slot.slotId])]
                  : currentHidden,
              };
            })}
            style={{ height: 24, paddingInline: 0 }}
          >
            清空并隐藏
          </Button>
          <p className="homepage-editor__properties-hint">
            {field.required
              ? "保留明确清空，不会自动填回模板文案。这项是公开必须内容，清空后不能发布。可撤销。"
              : "保留明确清空，不会自动填回模板文案。可撤销。"}
          </p>
        </div>
      ) : null}
      {field.hideable && !field.required ? (
        <SwitchField
          label={`${field.label}可见`}
          value={!hidden.includes(slot.slotId)}
          onChange={(checked) => toggleHidden(slot.slotId, !checked)}
        />
      ) : null}
      {field.editable && ["heading", "text", "richText", "badge"].includes(slot.type) && nodeBySlotId.get(slot.slotId) ? (
        <SwitchField
          label="这一端不显示这段文字"
          value={layoutOverrides[nodeBySlotId.get(slot.slotId)!.nodeId]?.[editor.device]?.visuallyCollapsed === true}
          hint="这一节里的这段文字都不显示，包括旁边不含这些字的图片。原文仍留给读屏。这不是清空内容。"
          onChange={(checked) => {
            const node = nodeBySlotId.get(slot.slotId);
            if (!node) return;
            updateMediaPresentation(node.nodeId, editor.device, { visuallyCollapsed: checked ? true : undefined });
          }}
        />
      ) : null}
    </fieldset>
    );
  };

  return (
    <section className="homepage-editor__properties" aria-label="模板实例属性">
      <div className="homepage-editor__properties-scroll" ref={propertyScrollRef}>
        <div className="homepage-editor__dynamic-instance-overview">
          <strong>{catalogCardName(
            definition.metadata.sectionRole
              ?? definition.templateRecipe?.sectionRole
              ?? (props.templateId ? catalogRoles[props.templateId] : undefined),
            definition.name || props.moduleName,
          )}</strong>
          <SwitchField
            label="在页面显示"
            value={props.isVisible !== false}
            disabled={editor.historyTransactionPending}
            hint={editor.historyTransactionPending ? "正在记录本次显隐操作，完成后可继续修改或撤销。" : undefined}
            onChange={(checked) => editor.updateHistoryTransaction({ isVisible: checked })}
          />
          {hasImageSlot ? (
            <div data-image-carries-copy-control="true">
              <SwitchField
                label="图片已含标题"
                value={imageCarriesCopy}
                disabled={editor.historyTransactionPending}
                hint={imageCarriesCopy
                  ? headingMustBeFilled
                    ? "完成稿。标成必须填写的标题仍要填写，只是不再画到画面上。"
                    : "完成稿。没有标成必须填写的标题可以留空，留空就不显示。"
                  : "照片。标题由这一节的模板排在画面上。"}
                onChange={(checked) => editor.updateHistoryTransaction({ imageCarriesCopy: checked })}
              />
            </div>
          ) : null}
          {mediaSideDeclaration ? (
            <div data-media-side-control="true">
              <SegmentedField
                label="图片位置"
                hint={mediaSideEffective
                  ? "只换桌面与平板的左右；手机仍是图在上、文在下。"
                  : "这一节的模板在桌面不是左右排列，暂时无法换边；请到模板设计里调整。"}
                value={selectedMediaSide}
                disabled={!mediaSideEffective}
                options={[
                  { label: "图在左", value: "start", diagram: "imageLeftTextRight" },
                  { label: "图在右", value: "end", diagram: "textLeftImageRight" },
                ]}
                onChange={(value) => {
                  if (editor.historyTransactionPending || value === selectedMediaSide) return;
                  editor.updateHistoryTransaction({
                    pageSettings: { ...props.pageSettings, mediaSide: value === "end" ? "end" : "start" },
                  });
                }}
              />
            </div>
          ) : null}
          {lockedLeftoverCount > 0 ? (
            <div className="homepage-editor__dynamic-instance-locked-leftover" role="status">
              <p className="homepage-editor__properties-hint">
                {lockedLeftoverCount} 个锁定字段仍保留页面覆盖，发布前需要移除。
              </p>
              <Button
                size="small"
                aria-label="移除锁定字段的页面覆盖"
                onClick={stripLockedPageValues}
              >
                移除锁定字段的页面覆盖
              </Button>
            </div>
          ) : null}
          <div
            className="homepage-editor__dynamic-instance-public-status"
            data-state={publicVisibilityState}
            role="status"
            aria-label="前台展示状态"
          >
            <strong>{publicVisibilityState === "hidden"
              ? "前台已关闭"
              : publicVisibilityState === "blocked"
                ? instancePublishErrorCount > 0
                  ? `当前实例有 ${instancePublishErrorCount} 项发布阻断`
                  : `页面有 ${currentPublishErrorCount} 项发布阻断`
              : publicVisibilityState === "ready"
                ? publicDecision.summary
                : publicDecision.summary}</strong>
            <span>{publicVisibilityState === "hidden"
              ? "重新开启后仍需点击页面“发布”，前台才会更新。"
              : publicVisibilityState === "blocked"
                ? "请打开下方发布检查定位问题。保存草稿不会更新客户前台。"
                : publicDecision.detail}</span>
          </div>
          <div className="homepage-editor__inspector-field">
            <span id={`dynamic-instance-property-scope-${props.instanceId}`} className="homepage-editor__sr-only">页面实例属性范围</span>
            <div
              className="homepage-editor__dynamic-instance-scope-list"
              role="group"
              aria-labelledby={`dynamic-instance-property-scope-${props.instanceId}`}
            >
              <button
                type="button"
                className={selectedPropertyNodeId === "" ? "is-active" : ""}
                aria-pressed={selectedPropertyNodeId === ""}
                onClick={() => selectInstancePropertyScope("")}
              >
                全部内容
              </button>
              {instancePropertyNodes.map((candidate) => (
                <button
                  key={candidate.nodeId}
                  type="button"
                  className={selectedPropertyNodeId === candidate.nodeId ? "is-active" : ""}
                  aria-pressed={selectedPropertyNodeId === candidate.nodeId}
                  title={candidate.name}
                  onClick={() => selectInstancePropertyScope(candidate.nodeId)}
                >
                  {candidate.name}
                </button>
              ))}
            </div>
          </div>
        </div>
        {selectedNode && selectedPolicy ? (
          <div style={{ borderTop: "1px solid var(--adm-line)", padding: 14 }}>
            <div style={{ display: "grid", gap: 10 }}>
              {selectedPolicy.position ? (
                <>
                  <NumberField
                    inspectorField="offsetXPercent"
                    inspectorDevice={editor.device}
                    label="水平偏移"
                    unit="%"
                    min={-selectedPolicy.maxOffsetPercent}
                    max={selectedPolicy.maxOffsetPercent}
                    value={selectedLayout.offsetXPercent ?? 0}
                    onChange={(offsetXPercent) => updateSelectedPresentation({ offsetXPercent })}
                    onClear={() => updateSelectedPresentation({ offsetXPercent: undefined })}
                  />
                  <NumberField
                    inspectorField="offsetYPercent"
                    inspectorDevice={editor.device}
                    label="垂直偏移"
                    unit="%"
                    min={-selectedPolicy.maxOffsetPercent}
                    max={selectedPolicy.maxOffsetPercent}
                    value={selectedLayout.offsetYPercent ?? 0}
                    onChange={(offsetYPercent) => updateSelectedPresentation({ offsetYPercent })}
                    onClear={() => updateSelectedPresentation({ offsetYPercent: undefined })}
                  />
                </>
              ) : null}
              {selectedPolicy.size ? (
                <NumberField
                  inspectorField="widthPercent"
                  inspectorDevice={editor.device}
                  label="区域宽度"
                  unit="%"
                  min={selectedPolicy.minWidthPercent}
                  max={selectedPolicy.maxWidthPercent}
                  value={selectedLayout.widthPercent ?? 100}
                  onChange={(widthPercent) => updateSelectedPresentation({ widthPercent })}
                  onClear={() => updateSelectedPresentation({ widthPercent: undefined })}
                />
              ) : null}
              {selectedPolicy.zIndex ? (
                <NumberField
                  inspectorField="zIndex"
                  inspectorDevice={editor.device}
                  label="层级"
                  min={-10}
                  max={10}
                  value={selectedLayout.zIndex ?? 0}
                  onChange={(zIndex) => updateSelectedPresentation({ zIndex: Math.round(zIndex) })}
                  onClear={() => updateSelectedPresentation({ zIndex: undefined })}
                />
              ) : null}
              {selectedPolicy.typography && selectedTextSlot ? (
                <>
                  <NumberField
                    inspectorField="fontSizePx"
                    inspectorDevice={editor.device}
                    label={`${selectedNode.name}字号`}
                    unit="px"
                    min={selectedPolicy.minFontSizePx ?? 12}
                    max={selectedPolicy.maxFontSizePx ?? 96}
                    value={selectedLayout.fontSizePx}
                    onChange={(fontSizePx) => updateSelectedPresentation({ fontSizePx })}
                    onClear={() => updateSelectedPresentation({ fontSizePx: undefined })}
                  />
                  <label
                    className="homepage-editor__inspector-field"
                    data-inspector-field="textAlign"
                    data-inspector-device={editor.device}
                  >
                    <span className="homepage-editor__properties-hint">文字对齐</span>
                    <Select
                      aria-label={`${selectedNode.name}文字对齐`}
                      value={selectedLayout.textAlign}
                      placeholder="跟随模板"
                      allowClear
                      options={[
                        { value: "left", label: "左对齐" },
                        { value: "center", label: "居中" },
                        { value: "right", label: "右对齐" },
                      ]}
                      onChange={(textAlign) => updateSelectedPresentation({ textAlign })}
                    />
                  </label>
                </>
              ) : null}
              {selectedPolicy.spacing && selectedTextSlot ? (
                <>
                  <NumberField
                    inspectorField="marginTopPx"
                    inspectorDevice={editor.device}
                    label={`${selectedNode.name}上间距`}
                    unit="px"
                    min={0}
                    max={selectedPolicy.maxSpacingPx ?? 120}
                    value={selectedLayout.marginTopPx ?? 0}
                    onChange={(marginTopPx) => updateSelectedPresentation({ marginTopPx })}
                    onClear={() => updateSelectedPresentation({ marginTopPx: undefined })}
                  />
                  <NumberField
                    inspectorField="marginBottomPx"
                    inspectorDevice={editor.device}
                    label={`${selectedNode.name}下间距`}
                    unit="px"
                    min={0}
                    max={selectedPolicy.maxSpacingPx ?? 120}
                    value={selectedLayout.marginBottomPx ?? 0}
                    onChange={(marginBottomPx) => updateSelectedPresentation({ marginBottomPx })}
                    onClear={() => updateSelectedPresentation({ marginBottomPx: undefined })}
                  />
                </>
              ) : null}
              <p className="homepage-editor__properties-hint">字号、对齐、间距和位置回到模板，文字内容保留。</p>
              <RestoreDefaultButton
                label="清除这一端的排版"
                disabled={Object.keys(selectedLayout).length === 0}
                onClick={resetSelectedPresentation}
              />
            </div>
          </div>
        ) : (
          <span className="homepage-editor__sr-only">页面实例编辑边界</span>
        )}
        {slotGroups.sections.map((section) => {
          const fields = imageCarriesCopy
            ? section.fields.filter((field) => {
              const slot = definition.slots[field.slotId];
              return field.stableKey !== "subtitle" && slot?.semanticRole !== "subtitle";
            })
            : section.fields;
          if (fields.length === 0) return null;
          return (
          <section
            key={`${section.group}:${section.fields[0]?.slotId ?? section.label}`}
            aria-label={section.label}
          >
            <div className="homepage-editor__inspector-section-head">
              <strong>{section.label}</strong>
              <span className="homepage-editor__properties-hint">
                {section.group === "image"
                  ? (imageCarriesCopy
                    ? "当前这一端的完成稿。手机没有单独的图时，沿用桌面图。"
                    : "当前这一端的图片和构图。手机没有单独的图时，沿用桌面图。")
                  : "两端共用"}
              </span>
            </div>
            {fields.map(renderSlotFieldset)}
          </section>
          );
        })}
        <section className="homepage-editor__inspector-section homepage-editor__dynamic-instance-management" aria-label="实例管理">
          <div className="homepage-editor__inspector-section-head">
            <strong>版本</strong>
          </div>
          <div className="homepage-editor__inspector-section-body">
            <span className="homepage-editor__properties-hint">固定版本 {props.templateId} v{props.templateVersion}</span>
            <div aria-label="当前字段来源" className="homepage-editor__dynamic-instance-sources">
              <span>模板基线 · 固定版本</span>
              <span>页面内容覆盖 {contentOverrideCount}</span>
              <span>页面设计覆盖 {designOverrideCount}</span>
            </div>
            {designOverrideCount > 0 && promotionPreview.promoted.length > 0 ? (
              <div className="homepage-editor__dynamic-instance-promote">
                <Button
                  type="default"
                  loading={promotingToTemplate}
                  disabled={!canPromoteToTemplate || !onPromoteToTemplate || promotionPreview.promoted.length === 0}
                  onClick={() => { void promoteToTemplate(); }}
                >
                  应用设计覆盖到母模板草稿
                </Button>
                <span className="homepage-editor__properties-hint">
                  {!canPromoteToTemplate
                    ? "只有超级管理员可以把页面设计覆盖应用到母模板草稿。"
                    : (
                      <>可安全应用 {promotionPreview.promoted.length} 项；{promotionPreview.skipped.length > 0
                        ? `${promotionPreview.skipped.length} 项需在模板设计中确认。`
                        : "不会带入文字、图片、商品或链接内容。"}</>
                    )}
                </span>
              </div>
            ) : null}
            <DynamicTemplateUpgradePanel
              definition={definition}
              instance={props}
              currentSchemaVersion={resolved.schemaVersion}
              currentDefinitionChecksum={resolved.definitionChecksum}
              onApply={(next, analysis, target) => {
                editor.updateHistoryTransaction({
                  templateVersion: next.templateVersion,
                  moduleName: next.moduleName,
                  contentBySlotId: next.contentBySlotId,
                  hiddenSlotIds: next.hiddenSlotIds,
                  layoutOverridesByNodeId: next.layoutOverridesByNodeId,
                }, (document) => ({
                  [DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY]: {
                    ...readResolvedDynamicTemplateDefinitions(
                      document[DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY],
                    ),
                    [dynamicTemplateVersionKey(target.templateId, target.version)]: {
                      templateId: target.templateId,
                      version: target.version,
                      schemaVersion: target.schemaVersion,
                      definitionChecksum: target.definitionChecksum,
                      definition: target.definition,
                    },
                  },
                }));
                const firstPending = analysis.pendingRequiredSlots[0];
                if (!firstPending) return;
                requestAnimationFrame(() => requestAnimationFrame(() => {
                  const field = document.querySelector<HTMLElement>(
                    `[data-slot-id="${CSS.escape(firstPending.slotId)}"]`,
                  );
                  const focusTarget = field?.querySelector<HTMLElement>(
                    "input, textarea, select, button, [tabindex]:not([tabindex='-1'])",
                  );
                  field?.scrollIntoView({ block: "center" });
                  focusTarget?.focus();
                }));
              }}
            />
            <p className="homepage-editor__properties-hint">文字、图片、商品和链接会保留。</p>
            <RestoreDefaultButton
              label="恢复模板样式"
              disabled={designOverrideCount === 0}
              onClick={() => modal.confirm({
                title: "恢复模板样式？",
                content: `将清除当前实例的字号、颜色、位置和缩放等设计覆盖，并继续读取锁定版本 ${props.templateId} v${props.templateVersion}。文字、图片、商品、链接和显隐会完整保留；母模板、其他实例与其他页面不会改变，可立即使用页面撤销恢复。`,
                okText: "恢复模板样式",
                cancelText: "取消",
                onOk: () => editor.updateHistoryTransaction({
                  layoutOverridesByNodeId: {},
                }),
              })}
            />
          </div>
        </section>
      </div>
      <InspectorFooterBar
        hasUnsavedChanges={hasUnsavedChanges}
        hasPersistedDraft={hasPersistedDraft}
        saving={saving}
        errorCount={currentPublishErrorCount}
        warningCount={currentPublishWarningCount}
        validationStatus={validationStatus}
        onRetryValidation={onRetryValidation}
        onReviewIssues={resolvePublishIssueReviewAction({
          errorCount: currentPublishErrorCount,
          warningCount: currentPublishWarningCount,
          issues: currentPublishIssues,
          onOpenPublishReview,
          modal,
        })}
      />
    </section>
  );
}
