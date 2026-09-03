import { useRef, useState } from "react";
import { App as AntdApp, Button, Input, Select, Tag } from "antd";
import MediaPickerField from "../fields/MediaPickerField";
import ProductReferencesField from "../fields/ProductReferencesField";
import NumberField from "../inspector/controls/NumberField";
import RestoreDefaultButton from "../inspector/controls/RestoreDefaultButton";
import SwitchField from "../inspector/controls/SwitchField";
import LinkTargetField from "../inspector/LinkTargetField";
import { useInspectorModuleEditor } from "../inspector/useInspectorModuleEditor";
import {
  getEffectiveDynamicTemplateInstanceEditPolicy,
  type DynamicTemplateSlotDefinition,
  type TemplateInstanceLayoutOverride,
} from "../template-definition";
import { objectPositionToPercent } from "../template-definition/imagePosition";
import { useVisualEditorSession, type VisualNodeKind } from "../visual-editor/visualEditorSession";
import { useResolvedDynamicTemplate } from "./registry";
import type { DynamicTemplateInstanceProps } from "./types";
import DynamicTemplateUpgradePanel from "./DynamicTemplateUpgradePanel";
import {
  promoteInstanceOverridesToTemplateDraft,
  type PromoteDynamicTemplateInstanceRequest,
} from "./promoteToTemplate";
import VideoContentFields from "../inspector/controls/VideoContentFields";
import DynamicComplexContentFields, { isDynamicComplexSlotType } from "../inspector/controls/DynamicComplexContentFields";
import ImageFocusField from "../inspector/controls/ImageFocusField";
import InspectorFooterBar from "../inspector/InspectorFooterBar";
import {
  getInspectorPublishIssues,
  isPagePublishIssue,
  type PublishValidationIssue,
  type PublishValidationStatus,
} from "../inspector/publishValidation";

const { TextArea } = Input;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getImageAssetGuidance(slot: DynamicTemplateSlotDefinition) {
  const parts: string[] = [];
  const { recommendedWidth, recommendedHeight } = slot.validation;
  if (recommendedWidth && recommendedHeight) {
    parts.push(`建议素材：${recommendedWidth} × ${recommendedHeight} 像素`);
  } else if (recommendedWidth) {
    parts.push(`建议素材宽度：${recommendedWidth} 像素`);
  } else if (recommendedHeight) {
    parts.push(`建议素材高度：${recommendedHeight} 像素`);
  }
  if (slot.desktopRules.aspectRatio) {
    parts.push(`桌面端 ${slot.desktopRules.aspectRatio}`);
  }
  if (slot.mobileRules.aspectRatio) {
    parts.push(`移动端 ${slot.mobileRules.aspectRatio}`);
  }
  return parts.join(" · ");
}

function orderedSlots(definition: NonNullable<ReturnType<typeof useResolvedDynamicTemplate>>["definition"]) {
  const result: DynamicTemplateSlotDefinition[] = [];
  const seen = new Set<string>();
  const visit = (nodeId: string) => {
    const node = definition.nodes[nodeId];
    if (!node) return;
    if (node.slotId && !seen.has(node.slotId) && definition.slots[node.slotId]) {
      seen.add(node.slotId);
      result.push(definition.slots[node.slotId]);
    }
    node.childIds.forEach(visit);
  };
  visit(definition.rootNodeId);
  return result;
}

function visualKindForSlot(slot: DynamicTemplateSlotDefinition): VisualNodeKind {
  if (["image", "video", "carousel", "hotspot", "beforeAfter"].includes(slot.type)) return "media";
  if (["heading", "text", "richText", "badge", "icon"].includes(slot.type)) return "text";
  if (["button", "link", "appointment"].includes(slot.type)) return "action";
  if (["product", "collection", "productCard", "productCollection", "categoryCollection"].includes(slot.type)) return "product";
  return "structured";
}

type InspectorTask = "media" | "commerce" | "conversion" | "trust" | "content";

const SLOT_TASK_BY_TYPE: Partial<Record<DynamicTemplateSlotDefinition["type"], InspectorTask>> = {
  image: "media",
  video: "media",
  carousel: "media",
  hotspot: "media",
  beforeAfter: "media",
  heroTemplate: "media",
  fullBleedTemplate: "media",
  singlePosterTemplate: "media",
  doublePosterTemplate: "media",
  galleryTemplate: "media",
  lookbookTemplate: "media",
  product: "commerce",
  collection: "commerce",
  productCard: "commerce",
  productCollection: "commerce",
  categoryCollection: "commerce",
  sceneShoppingTemplate: "commerce",
  button: "conversion",
  link: "conversion",
  appointment: "conversion",
  limitedEventTemplate: "conversion",
  storeInfoTemplate: "trust",
  servicePromisesTemplate: "trust",
  certificatesTemplate: "trust",
  testimonialsTemplate: "trust",
  craftDetailsTemplate: "trust",
  brandPointsTemplate: "trust",
  heading: "content",
  text: "content",
  richText: "content",
  badge: "content",
  icon: "content",
  textBannerTemplate: "content",
  journeyTemplate: "content",
};

const TASK_LABEL: Record<InspectorTask, string> = {
  media: "媒体与画面",
  commerce: "商品与分类",
  conversion: "行动与转化",
  trust: "服务与信任",
  content: "文字内容",
};

const SLOT_TYPE_LABEL: Partial<Record<DynamicTemplateSlotDefinition["type"], string>> = {
  image: "图片",
  video: "视频",
  carousel: "轮播",
  hotspot: "热点",
  beforeAfter: "对比图",
  heading: "标题",
  text: "正文",
  richText: "富文本",
  badge: "标签",
  icon: "图标",
  button: "按钮",
  link: "链接",
  appointment: "预约",
  product: "商品",
  collection: "商品集合",
  productCard: "商品卡片",
  productCollection: "商品集合",
  categoryCollection: "分类集合",
};

const V1_CORE_SLOT_TYPES = new Set<DynamicTemplateSlotDefinition["type"]>([
  "image",
  "heading",
  "text",
  "product",
  "button",
]);

function inferInspectorTask(
  slots: DynamicTemplateSlotDefinition[],
  selectedSlotId?: string,
): InspectorTask {
  const selectedSlot = slots.find((slot) => slot.slotId === selectedSlotId);
  if (selectedSlot) return SLOT_TASK_BY_TYPE[selectedSlot.type] ?? "content";
  const counts = new Map<InspectorTask, number>();
  for (const slot of slots) {
    const task = SLOT_TASK_BY_TYPE[slot.type] ?? "content";
    counts.set(task, (counts.get(task) ?? 0) + 1);
  }
  return (["commerce", "media", "conversion", "trust", "content"] as const)
    .reduce((best, task) => (
      (counts.get(task) ?? 0) > (counts.get(best) ?? 0) ? task : best
    ), "commerce");
}

function groupInspectorSlots(
  slots: DynamicTemplateSlotDefinition[],
  selectedSlotId?: string,
) {
  const task = inferInspectorTask(slots, selectedSlotId);
  const isCompactCoreTemplate = slots.length <= 5
    && slots.every((slot) => V1_CORE_SLOT_TYPES.has(slot.type));
  if (isCompactCoreTemplate) {
    return { task, primary: slots, secondary: [] };
  }
  const relatedTasks: Record<InspectorTask, InspectorTask[]> = {
    media: ["media", "conversion"],
    commerce: ["commerce", "conversion"],
    conversion: ["conversion", "commerce"],
    trust: ["trust", "conversion"],
    content: ["content", "conversion"],
  };
  const taskRank = new Map(relatedTasks[task].map((candidate, index) => [candidate, index]));
  const indexed = slots.map((slot, index) => ({ slot, index, slotTask: SLOT_TASK_BY_TYPE[slot.type] ?? "content" }));
  const primary = indexed
    .filter(({ slot, slotTask }) => slot.slotId === selectedSlotId || slot.required || taskRank.has(slotTask))
    .sort((left, right) => {
      if (left.slot.slotId === selectedSlotId) return -1;
      if (right.slot.slotId === selectedSlotId) return 1;
      const leftRank = taskRank.get(left.slotTask) ?? relatedTasks[task].length;
      const rightRank = taskRank.get(right.slotTask) ?? relatedTasks[task].length;
      return leftRank - rightRank || left.index - right.index;
    })
    .map(({ slot }) => slot);
  const primaryIds = new Set(primary.map((slot) => slot.slotId));
  return {
    task,
    primary,
    secondary: slots.filter((slot) => !primaryIds.has(slot.slotId)),
  };
}

export default function DynamicTemplateInstanceInspector({
  hasUnsavedChanges,
  saving,
  publishIssues,
  validationStatus,
  onRetryValidation,
  onOpenPageSettings,
  canPromoteToTemplate = false,
  onPromoteToTemplate,
}: {
  hasUnsavedChanges: boolean;
  saving: boolean;
  publishIssues: PublishValidationIssue[];
  validationStatus?: PublishValidationStatus;
  onRetryValidation?: () => void;
  onOpenPageSettings?: (field?: string) => void;
  canPromoteToTemplate?: boolean;
  onPromoteToTemplate?: (request: PromoteDynamicTemplateInstanceRequest) => void | Promise<void>;
}) {
  const editor = useInspectorModuleEditor();
  const props = (editor?.props ?? {}) as DynamicTemplateInstanceProps;
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
  const slots = orderedSlots(definition);
  const content = asRecord(props.contentBySlotId);
  const hidden = Array.isArray(props.hiddenSlotIds)
    ? props.hiddenSlotIds.filter((value): value is string => typeof value === "string")
    : [];
  const selectedNode = selection?.blockId === props.instanceId
    ? definition.nodes[selection.nodeId]
    : undefined;
  const selectedSlot = selectedNode?.slotId
    ? definition.slots[selectedNode.slotId]
    : undefined;
  const selectedPolicy = selectedNode
    ? getEffectiveDynamicTemplateInstanceEditPolicy(selectedNode, selectedSlot)
    : null;
  const slotGroups = groupInspectorSlots(slots, selectedNode?.slotId);
  const layoutOverrides = props.layoutOverridesByNodeId ?? {};
  const promotionPreview = promoteInstanceOverridesToTemplateDraft({
    sourceDefinition: definition,
    targetDefinition: definition,
    layoutOverridesByNodeId: props.layoutOverridesByNodeId,
  });
  const contentOverrideCount = Object.keys(content).length + hidden.length + (props.isVisible === false ? 1 : 0);
  const designOverrideCount = Object.values(layoutOverrides).reduce((total, devices) => (
    total + Object.values(devices ?? {}).reduce((deviceTotal, override) => (
      deviceTotal + Object.keys(override ?? {}).length
    ), 0)
  ), 0);
  const currentPublishIssues = getInspectorPublishIssues(publishIssues, props.instanceId);
  const currentPublishErrorCount = currentPublishIssues.filter(
    (issue) => issue.severity === "error",
  ).length;
  const currentPublishWarningCount = currentPublishIssues.filter(
    (issue) => issue.severity === "warning",
  ).length;
  const hasInstanceOverrides = Object.keys(content).length > 0
    || Object.keys(layoutOverrides).length > 0
    || hidden.length > 0
    || props.isVisible === false;
  const nodeBySlotId = new Map(
    Object.values(definition.nodes).flatMap((candidate) => candidate.slotId ? [[candidate.slotId, candidate] as const] : []),
  );
  const instancePropertyNodes = Object.values(definition.nodes).filter((candidate) => {
    const candidateSlot = candidate.slotId ? definition.slots[candidate.slotId] : undefined;
    return Boolean(candidateSlot?.editable);
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
    if (!nodeId) {
      clearVisualNode(props.instanceId);
      return;
    }
    const nextNode = definition.nodes[nodeId];
    const nextSlot = nextNode?.slotId ? definition.slots[nextNode.slotId] : undefined;
    if (!nextNode || !nextSlot?.editable) return;
    const policy = getEffectiveDynamicTemplateInstanceEditPolicy(nextNode, nextSlot);
    selectVisualNode({
      blockId: props.instanceId,
      moduleType: props.moduleName || definition.name,
      nodeId: nextNode.nodeId,
      kind: visualKindForSlot(nextSlot),
      canAdjustLayout: Boolean(policy && (policy.position || policy.size)),
      canAdjustMedia: Boolean(nextSlot.type === "image" && policy && (policy.imageFit || policy.imageFocus)),
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
  const updateMediaPresentation = (nodeId: string, patch: Partial<TemplateInstanceLayoutOverride>) => {
    editor.updateFromCurrent((current) => {
      const currentOverrides = asRecord(current.layoutOverridesByNodeId);
      const currentNode = asRecord(currentOverrides[nodeId]);
      const currentDevice = asRecord(currentNode[editor.device]);
      const nextDevice: Record<string, unknown> = { ...currentDevice };
      for (const key of ["objectFit", "imageScalePercent", "focusXPercent", "focusYPercent"] as const) {
        if (Object.prototype.hasOwnProperty.call(patch, key)) nextDevice[key] = patch[key];
      }
      for (const [key, value] of Object.entries(nextDevice)) {
        if (value === undefined) delete nextDevice[key];
      }
      const nextOverrides = { ...currentOverrides };
      const nextNode = { ...currentNode };
      if (Object.keys(nextDevice).length > 0) nextNode[editor.device] = nextDevice;
      else delete nextNode[editor.device];
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
        sourceDefinition: definition,
        layoutOverridesByNodeId: props.layoutOverridesByNodeId,
      });
    } finally {
      setPromotingToTemplate(false);
    }
  };

  const renderSlotControl = (slot: DynamicTemplateSlotDefinition) => {
    const hasPageValue = Object.prototype.hasOwnProperty.call(content, slot.slotId);
    const value = hasPageValue
      ? content[slot.slotId]
      : slot.required
        ? undefined
        : definition.defaultContent[slot.slotId];
    if (!slot.editable) {
      return <p className="homepage-editor__properties-hint">此内容由模板锁定，页面不能修改。</p>;
    }
    if (["heading", "badge", "icon"].includes(slot.type)) {
      return (
        <Input
          aria-label={slot.label}
          value={typeof value === "string" ? value : ""}
          maxLength={slot.validation.maxLength}
          onChange={(event) => updateContent(slot.slotId, event.target.value)}
        />
      );
    }
    if (["text", "richText"].includes(slot.type)) {
      return (
        <TextArea
          aria-label={slot.label}
          value={typeof value === "string" ? value : ""}
          rows={slot.type === "richText" ? 6 : 3}
          maxLength={slot.validation.maxLength}
          showCount={Boolean(slot.validation.maxLength)}
          onChange={(event) => updateContent(slot.slotId, event.target.value)}
        />
      );
    }
    if (slot.type === "image") {
      const image = typeof value === "string"
        ? { src: value, alt: "" }
        : asRecord(value);
      const imageNode = nodeBySlotId.get(slot.slotId);
      const imagePolicy = imageNode
        ? getEffectiveDynamicTemplateInstanceEditPolicy(imageNode, slot)
        : null;
      const slotRules = editor.device === "desktop" ? slot.desktopRules : slot.mobileRules;
      const imageLayout = imageNode
        ? layoutOverrides[imageNode.nodeId]?.[editor.device] ?? {}
        : {};
      const defaultFocus = objectPositionToPercent(slotRules.objectPosition);
      const objectFit = imageLayout.objectFit ?? slotRules.objectFit ?? "cover";
      const focus = {
        x: imageLayout.focusXPercent ?? defaultFocus.x,
        y: imageLayout.focusYPercent ?? defaultFocus.y,
      };
      const hasImageLayoutOverride = imageLayout.objectFit !== undefined
        || imageLayout.imageScalePercent !== undefined
        || imageLayout.focusXPercent !== undefined
        || imageLayout.focusYPercent !== undefined;
      const assetGuidance = getImageAssetGuidance(slot);
      return (
        <div style={{ display: "grid", gap: 10 }}>
          <MediaPickerField
            fieldKey={slot.slotId}
            value={typeof image.src === "string" ? image.src : ""}
            required={slot.required}
            previewAspectRatio={slotRules.aspectRatio?.replace(":", " / ")}
            previewFit={objectFit}
            previewFocus={focus}
            onChange={(src) => updateContent(slot.slotId, { ...image, src })}
          />
          {assetGuidance ? (
            <p className="homepage-editor__properties-hint" data-image-asset-guidance={slot.slotId}>
              {assetGuidance}
            </p>
          ) : null}
          <label>
            <span className="homepage-editor__properties-hint">替代文字</span>
            <Input
              aria-label={`${slot.label}替代文字`}
              value={typeof image.alt === "string" ? image.alt : ""}
              placeholder="描述图片内容，供无障碍与图片缺失时使用"
              onChange={(event) => updateContent(slot.slotId, { ...image, alt: event.target.value })}
            />
          </label>
          {imageNode && imagePolicy?.imageFit ? (
            <label>
              <span className="homepage-editor__properties-hint">图片适配 · {editor.device === "desktop" ? "桌面端" : "移动端"}</span>
              <Select
                aria-label={`${slot.label}图片适配`}
                value={objectFit}
                options={[
                  { value: "cover", label: "填满并裁切" },
                  { value: "contain", label: "完整显示" },
                  { value: "fill", label: "拉伸填满" },
                ]}
                onChange={(nextObjectFit) => updateMediaPresentation(imageNode.nodeId, {
                  objectFit: nextObjectFit === (slotRules.objectFit ?? "cover") ? undefined : nextObjectFit,
                })}
              />
            </label>
          ) : null}
          {imageNode && imagePolicy?.imageFit ? (
            <NumberField
              label={`${slot.label}图片缩放`}
              unit="%"
              hint="只缩放图片内容，不改变母模板区域尺寸"
              min={100}
              max={200}
              value={imageLayout.imageScalePercent}
              onChange={(imageScalePercent) => updateMediaPresentation(imageNode.nodeId, {
                imageScalePercent: imageScalePercent === 100 ? undefined : imageScalePercent,
              })}
              onClear={() => updateMediaPresentation(imageNode.nodeId, { imageScalePercent: undefined })}
            />
          ) : null}
          {imageNode && imagePolicy?.imageFocus ? (
            <ImageFocusField
              label={`${slot.label}画面焦点 · ${editor.device === "desktop" ? "桌面端" : "移动端"}`}
              value={focus}
              onChange={({ x, y }) => updateMediaPresentation(imageNode.nodeId, {
                focusXPercent: x === defaultFocus.x ? undefined : x,
                focusYPercent: y === defaultFocus.y ? undefined : y,
              })}
            />
          ) : null}
          {imageNode && (imagePolicy?.imageFit || imagePolicy?.imageFocus) ? (
            <RestoreDefaultButton
              label="恢复当前设备图片构图"
              disabled={!hasImageLayoutOverride}
              onClick={() => updateMediaPresentation(imageNode.nodeId, {
                objectFit: undefined,
                imageScalePercent: undefined,
                focusXPercent: undefined,
                focusYPercent: undefined,
              })}
            />
          ) : null}
        </div>
      );
    }
    if (slot.type === "button" || slot.type === "link") {
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
            aria-label={`${slot.label}文案`}
            value={typeof action.label === "string" ? action.label : ""}
            placeholder="行动文案"
            onChange={(event) => updateContent(slot.slotId, { ...action, label: event.target.value })}
          />
          <LinkTargetField
            id={`dynamic-template-${props.instanceId}-${slot.slotId}`}
            compact
            label={`${slot.label}跳转`}
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
    if (slot.type === "product") {
      return (
        <ProductReferencesField
          value={typeof value === "string" && value ? [value] : []}
          onChange={(codes) => updateContent(slot.slotId, codes[0] ?? "")}
          minProducts={slot.required ? 1 : 0}
          maxProducts={1}
        />
      );
    }
    if (slot.type === "collection") {
      const values = Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : [];
      return (
        <ProductReferencesField
          value={values}
          onChange={(codes) => updateContent(slot.slotId, codes)}
          minProducts={slot.required ? Math.max(1, slot.validation.minItems ?? 1) : (slot.validation.minItems ?? 0)}
          maxProducts={slot.validation.maxItems ?? 8}
        />
      );
    }
    if (slot.type === "video") {
      return (
        <VideoContentFields
          scope="page"
          required={slot.required}
          value={asRecord(value)}
          onChange={(next) => updateContent(slot.slotId, next)}
        />
      );
    }
    if (isDynamicComplexSlotType(slot.type)) {
      return (
        <DynamicComplexContentFields
          scope="page"
          device={editor.device}
          slotType={slot.type}
          value={asRecord(value)}
          onChange={(next) => updateContent(slot.slotId, next)}
        />
      );
    }
    return null;
  };

  const renderSlotFieldset = (slot: DynamicTemplateSlotDefinition) => {
    const hasPageValue = Object.prototype.hasOwnProperty.call(content, slot.slotId);
    return (
    <fieldset
      key={slot.slotId}
      data-slot-id={slot.slotId}
      data-slot-task={SLOT_TASK_BY_TYPE[slot.type] ?? "content"}
      data-inspector-field={slot.slotId}
      style={{ border: 0, borderTop: "1px solid var(--adm-line)", margin: 0, padding: "14px" }}
    >
      <legend style={{ width: "100%", padding: 0, marginBottom: 10 }}>
        <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <strong>{slot.label}</strong>
          <span>
            {slot.required ? <Tag color="red">必填</Tag> : null}
            <Tag>{SLOT_TYPE_LABEL[slot.type] ?? "内容槽位"}</Tag>
            <Tag color={hasPageValue ? "gold" : "default"}>
              {hasPageValue ? "页面内容" : "模板内容"}
            </Tag>
          </span>
        </span>
      </legend>
      {renderSlotControl(slot)}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 10 }}>
        <Button
          size="small"
          disabled={slot.required || !Object.prototype.hasOwnProperty.call(content, slot.slotId)}
          title={slot.required ? "必填内容必须由页面实例提供" : undefined}
          onClick={() => resetContent(slot.slotId)}
        >
          移除页面内容覆盖
        </Button>
        {slot.hideable && !slot.required ? (
          <SwitchField
            label={visualKindForSlot(slot) === "text" ? "显示这段文字" : "显示此内容"}
            value={!hidden.includes(slot.slotId)}
            onChange={(checked) => toggleHidden(slot.slotId, !checked)}
          />
        ) : null}
      </div>
    </fieldset>
    );
  };

  return (
    <section className="homepage-editor__properties" aria-label="模板实例属性">
      <div className="homepage-editor__properties-scroll" ref={propertyScrollRef}>
        <div className="homepage-editor__dynamic-instance-overview">
          <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <strong>{definition.name}</strong>
            <button
              type="button"
              className="homepage-editor__edit-scope-badge"
              onClick={() => onOpenPageSettings?.()}
            >
              页面覆盖
            </button>
          </span>
          <SwitchField
            label="在页面显示"
            value={props.isVisible !== false}
            onChange={(checked) => editor.update({ isVisible: checked })}
          />
          <div className="homepage-editor__inspector-field">
            <span id={`dynamic-instance-property-scope-${props.instanceId}`}>页面实例属性范围</span>
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
            <span className="homepage-editor__properties-hint">点击画布只选择整个模板；需要调整某个实例属性时从这里明确选择。</span>
          </div>
        </div>
        <div style={{ borderTop: "1px solid var(--adm-line)", padding: 14 }}>
          <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <strong>{selectedNode ? `当前选择：${selectedNode.name}` : "页面实例编辑边界"}</strong>
            {selectedNode ? (
              <Tag color={Object.keys(selectedLayout).length > 0 ? "blue" : "default"}>
                {Object.keys(selectedLayout).length > 0 ? "页面已覆盖" : "模板控制"}
              </Tag>
            ) : null}
          </span>
          <p className="homepage-editor__properties-hint">
            {selectedPolicy
              ? "页面装修只修改当前实例。下方仅开放母模板授权的属性，并且只通过右侧输入调整；画布不会进入内部节点拖拽。"
              : "当前显示整个模板的内容属性；页面装修不能在画布中选择或改变模板节点树。"}
          </p>
          {selectedNode && selectedPolicy ? (
            <div style={{ display: "grid", gap: 10 }}>
              {selectedPolicy.position ? (
                <>
                  <NumberField
                    label="水平偏移"
                    unit="%"
                    min={-selectedPolicy.maxOffsetPercent}
                    max={selectedPolicy.maxOffsetPercent}
                    value={selectedLayout.offsetXPercent ?? 0}
                    onChange={(offsetXPercent) => updateSelectedPresentation({ offsetXPercent })}
                    onClear={() => updateSelectedPresentation({ offsetXPercent: undefined })}
                  />
                  <NumberField
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
                    label={`${selectedNode.name}字号`}
                    unit="px"
                    min={selectedPolicy.minFontSizePx ?? 12}
                    max={selectedPolicy.maxFontSizePx ?? 96}
                    value={selectedLayout.fontSizePx}
                    onChange={(fontSizePx) => updateSelectedPresentation({ fontSizePx })}
                    onClear={() => updateSelectedPresentation({ fontSizePx: undefined })}
                  />
                  <label>
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
                    label={`${selectedNode.name}上间距`}
                    unit="px"
                    min={0}
                    max={selectedPolicy.maxSpacingPx ?? 120}
                    value={selectedLayout.marginTopPx ?? 0}
                    onChange={(marginTopPx) => updateSelectedPresentation({ marginTopPx })}
                    onClear={() => updateSelectedPresentation({ marginTopPx: undefined })}
                  />
                  <NumberField
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
              <RestoreDefaultButton
                label="恢复当前设备节点默认值"
                disabled={Object.keys(selectedLayout).length === 0}
                onClick={resetSelectedPresentation}
              />
            </div>
          ) : null}
        </div>
        <div aria-label={`优先填写：${TASK_LABEL[slotGroups.task]}`}>
          <p className="homepage-editor__properties-hint" style={{ margin: "12px 14px 4px" }}>
            优先填写 · {TASK_LABEL[slotGroups.task]}
          </p>
          {slotGroups.primary.map(renderSlotFieldset)}
        </div>
        {slotGroups.secondary.length > 0 ? (
          <div className="homepage-editor__dynamic-instance-secondary" aria-label="补充内容">
            <p className="homepage-editor__properties-hint">
              补充内容 · {slotGroups.secondary.length} 项
            </p>
            {slotGroups.secondary.map(renderSlotFieldset)}
          </div>
        ) : null}
        <section className="homepage-editor__inspector-section homepage-editor__dynamic-instance-management" aria-label="实例管理">
          <div className="homepage-editor__inspector-section-head">
            <strong>实例管理</strong>
            <span>版本、母模板同步与整体恢复</span>
          </div>
          <div className="homepage-editor__inspector-section-body">
            <span className="homepage-editor__properties-hint">固定版本 {props.templateId} v{props.templateVersion}</span>
            <div aria-label="当前字段来源" className="homepage-editor__dynamic-instance-sources">
              <Tag>模板基线 · 固定版本</Tag>
              <Tag color="gold">页面内容覆盖 {contentOverrideCount}</Tag>
              <Tag color="blue">页面设计覆盖 {designOverrideCount}</Tag>
            </div>
            {designOverrideCount > 0 ? (
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
              onApply={(next) => editor.update({
                templateVersion: next.templateVersion,
                moduleName: next.moduleName,
                contentBySlotId: next.contentBySlotId,
                hiddenSlotIds: next.hiddenSlotIds,
                layoutOverridesByNodeId: next.layoutOverridesByNodeId,
              })}
            />
            <RestoreDefaultButton
              label="恢复整个实例默认值"
              disabled={!hasInstanceOverrides}
              onClick={() => modal.confirm({
                title: "恢复整个实例默认值？",
                content: "将清除当前页面中这个实例的内容、构图、隐藏和显示状态覆盖；母模板、其他实例与其他页面不会改变，可立即使用页面撤销恢复。",
                okText: "恢复默认",
                cancelText: "取消",
                onOk: () => editor.updateHistoryTransaction({
                  contentBySlotId: {},
                  layoutOverridesByNodeId: {},
                  hiddenSlotIds: [],
                  isVisible: true,
                }),
              })}
            />
          </div>
        </section>
      </div>
      <InspectorFooterBar
        hasUnsavedChanges={hasUnsavedChanges}
        saving={saving}
        errorCount={currentPublishErrorCount}
        warningCount={currentPublishWarningCount}
        validationStatus={validationStatus}
        onRetryValidation={onRetryValidation}
        onReviewIssues={currentPublishIssues.length > 0 ? () => {
          const showModal = currentPublishErrorCount > 0 ? modal.error : modal.warning;
          const instance = showModal({
            title: currentPublishErrorCount > 0
              ? `当前模块与页面发布检查 · ${currentPublishErrorCount} 项阻断`
              : `当前模块与页面发布检查 · ${currentPublishWarningCount} 项待检查`,
            content: (
              <div className="homepage-editor__publish-issue-list">
                {currentPublishIssues.map((issue, index) => (
                  <div key={`${issue.path ?? ""}-${issue.message}-${index}`}>
                    <p>
                      <strong>{issue.severity === "error" ? "阻断：" : "提醒："}</strong>
                      {issue.message}
                    </p>
                    {(issue.field || isPagePublishIssue(issue)) ? (
                      <button type="button" onClick={() => {
                        instance.destroy();
                        if (isPagePublishIssue(issue)) {
                          onOpenPageSettings?.(issue.path ?? issue.field);
                          return;
                        }
                        const fieldKey = issue.field ?? issue.path?.split(".").pop();
                        if (!fieldKey) return;
                        const field = propertyScrollRef.current?.querySelector<HTMLElement>(
                          `[data-inspector-field="${CSS.escape(fieldKey)}"]`,
                        );
                        field?.scrollIntoView({ block: "center", behavior: "smooth" });
                        field?.querySelector<HTMLElement>("input, textarea, select, button, [tabindex]")?.focus();
                      }}>
                        {isPagePublishIssue(issue) ? "打开页面设置" : "定位到字段"}
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            ),
            okText: "知道了",
          });
        } : undefined}
      />
    </section>
  );
}
