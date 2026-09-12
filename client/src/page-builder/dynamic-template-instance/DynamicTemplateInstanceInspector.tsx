import { useRef, useState } from "react";
import { App as AntdApp, Button, Input, Select, Tag } from "antd";
import MediaPickerField from "../fields/MediaPickerField";
import ProductReferencesField from "../fields/ProductReferencesField";
import NumberField, { focusFirstInvalidNumberField } from "../inspector/controls/NumberField";
import RestoreDefaultButton from "../inspector/controls/RestoreDefaultButton";
import SwitchField from "../inspector/controls/SwitchField";
import LinkTargetField from "../inspector/LinkTargetField";
import { useInspectorModuleEditor } from "../inspector/useInspectorModuleEditor";
import {
  type DynamicTemplateSlotDefinition,
  type TemplateInstanceLayoutOverride,
} from "../template-definition";
import { objectPositionToPercent } from "../template-definition/imagePosition";
import { useVisualEditorSession, type VisualNodeKind } from "../visual-editor/visualEditorSession";
import { useResolvedDynamicTemplate } from "./registry";
import {
  DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY,
  dynamicTemplateVersionKey,
  getDynamicTemplateInstanceEditorBlockId,
  readResolvedDynamicTemplateDefinitions,
  type DynamicTemplateInstanceProps,
} from "./types";
import DynamicTemplateUpgradePanel from "./DynamicTemplateUpgradePanel";
import {
  promoteInstanceOverridesToTemplateDraft,
  type PromoteDynamicTemplateInstanceRequest,
} from "./promoteToTemplate";
import ImageFocusField from "../inspector/controls/ImageFocusField";
import InspectorFooterBar from "../inspector/InspectorFooterBar";
import {
  getInspectorPublishIssues,
  type PublishValidationIssue,
  type PublishValidationStatus,
} from "../inspector/publishValidation";
import {
  getDynamicTemplatePageFieldDataAttributes,
  getDynamicTemplatePageFieldDescriptors,
  groupDynamicTemplatePageFields,
  PAGE_FIELD_TASK_LABELS,
  type DynamicTemplatePageFieldDescriptor,
} from "./pageFieldDescriptors";
import { hasExplicitDynamicTemplateInstanceImage } from "./mediaReferences";

const { TextArea } = Input;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getImageAssetGuidance(
  slot: DynamicTemplateSlotDefinition,
  validation: DynamicTemplatePageFieldDescriptor["validation"],
) {
  const parts: string[] = [];
  const { recommendedWidth, recommendedHeight } = validation;
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

function visualKindForField(field: DynamicTemplatePageFieldDescriptor): VisualNodeKind {
  if (field.controlKind === "image") return "media";
  if (field.controlKind === "text") return "text";
  if (field.controlKind === "link") return "action";
  if (field.controlKind === "product") return "product";
  return "structured";
}


export default function DynamicTemplateInstanceInspector({
  hasUnsavedChanges,
  saving,
  publishIssues,
  validationStatus,
  onRetryValidation,
  onOpenPageSettings,
  onOpenPublishReview,
  canPromoteToTemplate = false,
  onPromoteToTemplate,
}: {
  hasUnsavedChanges: boolean;
  saving: boolean;
  publishIssues: PublishValidationIssue[];
  validationStatus?: PublishValidationStatus;
  onRetryValidation?: () => void;
  onOpenPageSettings?: (field?: string) => void;
  onOpenPublishReview?: () => void;
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
  const editorBlockId = getDynamicTemplateInstanceEditorBlockId(props);
  const pageFields = getDynamicTemplatePageFieldDescriptors(definition);
  const pageFieldBySlotId = new Map(pageFields.map((field) => [field.slotId, field]));
  const content = asRecord(props.contentBySlotId);
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
  const hasPublicImage = hasExplicitDynamicTemplateInstanceImage(
    definition,
    content,
    hidden,
  );
  const publicVisibilityState = props.isVisible === false
    ? "hidden"
    : hasPublicImage
      ? "ready"
      : "empty";
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
  const currentPublishWarningCount = currentPublishIssues.filter(
    (issue) => issue.severity === "warning",
  ).length;
  const hasTemplateValueOverrides = designOverrideCount > 0
    || hidden.length > 0
    || props.isVisible === false;
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
    const value = hasPageValue
      ? content[slot.slotId]
      : field.required
        ? undefined
        : definition.defaultContent[slot.slotId];
    if (!field.editable) {
      return <p className="homepage-editor__properties-hint">此内容由模板锁定，页面不能修改。</p>;
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
      const image = typeof value === "string"
        ? { src: value, alt: "" }
        : asRecord(value);
      const imageNode = nodeBySlotId.get(slot.slotId);
      const imagePolicy = field.effectiveDesignOverrideCapabilities;
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
      const assetGuidance = getImageAssetGuidance(slot, field.validation);
      return (
        <div style={{ display: "grid", gap: 10 }}>
          <MediaPickerField
            fieldKey={slot.slotId}
            value={typeof image.src === "string" ? image.src : ""}
            required={field.required}
            previewAspectRatio={slotRules.aspectRatio?.replace(":", " / ")}
            previewFit={objectFit}
            previewFocus={focus}
            previewZoom={(imageLayout.imageScalePercent ?? 100) / 100}
            onChange={(src) => updateContent(
              slot.slotId,
              src.trim() ? { ...image, src } : "",
            )}
          />
          {assetGuidance ? (
            <p className="homepage-editor__properties-hint" data-image-asset-guidance={slot.slotId}>
              {assetGuidance}
            </p>
          ) : null}
          <label>
            <span className="homepage-editor__properties-hint">替代文字</span>
            <Input
              aria-label={`${field.label}替代文字`}
              value={typeof image.alt === "string" ? image.alt : ""}
              placeholder="描述图片内容，供无障碍与图片缺失时使用"
              onChange={(event) => updateContent(slot.slotId, { ...image, alt: event.target.value })}
            />
          </label>
          {imageNode && imagePolicy?.imageFit ? (
            <label
              className="homepage-editor__inspector-field"
              data-inspector-field="objectFit"
              data-inspector-device={editor.device}
            >
              <span className="homepage-editor__properties-hint">图片适配 · {editor.device === "desktop" ? "桌面端" : "移动端"}</span>
              <Select
                aria-label={`${field.label}图片适配`}
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
              inspectorField="imageScalePercent"
              inspectorDevice={editor.device}
              label={`${field.label}图片缩放`}
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
              inspectorFieldKeys={{ x: "focusXPercent", y: "focusYPercent" }}
              inspectorDevice={editor.device}
              label={`${field.label}画面焦点 · ${editor.device === "desktop" ? "桌面端" : "移动端"}`}
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
    return (
    <fieldset
      key={slot.slotId}
      data-slot-id={slot.slotId}
      data-slot-task={field.task}
      data-inspector-field={slot.slotId}
      {...getDynamicTemplatePageFieldDataAttributes(field, "page")}
      style={{ border: 0, borderTop: "1px solid var(--adm-line)", margin: 0, padding: "14px" }}
    >
      <legend style={{ width: "100%", padding: 0, marginBottom: 10 }}>
        <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <strong>{field.label}</strong>
          <span>
            {field.required ? <Tag color="red">必填</Tag> : null}
            <Tag>{field.slotTypeLabel}</Tag>
            <Tag color={hasPageValue ? "gold" : "default"}>
              {hasPageValue ? "页面内容" : "模板内容"}
            </Tag>
          </span>
        </span>
      </legend>
      {renderSlotControl(field)}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 10 }}>
        <Button
          size="small"
          disabled={field.required || !Object.prototype.hasOwnProperty.call(content, slot.slotId)}
          title={field.required ? "必填内容必须由页面实例提供" : undefined}
          onClick={() => resetContent(slot.slotId)}
        >
          移除页面内容覆盖
        </Button>
        {field.hideable && !field.required ? (
          <SwitchField
            label={visualKindForField(field) === "text" ? "显示这段文字" : "显示此内容"}
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
            disabled={editor.historyTransactionPending}
            hint={editor.historyTransactionPending ? "正在记录本次显隐操作，完成后可继续修改或撤销。" : undefined}
            onChange={(checked) => editor.updateHistoryTransaction({ isVisible: checked })}
          />
          <div
            className="homepage-editor__dynamic-instance-public-status"
            data-state={publicVisibilityState}
            role="status"
            aria-label="前台展示状态"
          >
            <strong>{publicVisibilityState === "hidden"
              ? "前台已关闭"
              : publicVisibilityState === "ready"
                ? "图片已添加"
                : "前台自动隐藏"}</strong>
            <span>{publicVisibilityState === "hidden"
              ? "重新开启后仍需点击页面“发布”，前台才会更新。"
              : publicVisibilityState === "ready"
                ? "保存只保留草稿；点击页面“发布”后，前台才会显示或更新。"
                : "尚未上传页面图片。保存只保留草稿；上传图片并点击页面“发布”后才会显示。"}</span>
          </div>
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
              <RestoreDefaultButton
                label="恢复当前设备节点默认值"
                disabled={Object.keys(selectedLayout).length === 0}
                onClick={resetSelectedPresentation}
              />
            </div>
          ) : null}
        </div>
        <div aria-label={`优先填写：${PAGE_FIELD_TASK_LABELS[slotGroups.task]}`}>
          <p className="homepage-editor__properties-hint" style={{ margin: "12px 14px 4px" }}>
            优先填写 · {PAGE_FIELD_TASK_LABELS[slotGroups.task]}
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
            <RestoreDefaultButton
              label="恢复模板值"
              disabled={!hasTemplateValueOverrides}
              onClick={() => modal.confirm({
                title: "恢复当前实例的模板值？",
                content: `将清除当前实例的构图、隐藏和显示状态覆盖，并继续读取锁定版本 ${props.templateId} v${props.templateVersion}。文字、图片、商品、链接等页面内容会完整保留；母模板、其他实例与其他页面不会改变，可立即使用页面撤销恢复。`,
                okText: "恢复模板值",
                cancelText: "取消",
                onOk: () => editor.updateHistoryTransaction({
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
        onReviewIssues={currentPublishErrorCount > 0
          ? onOpenPublishReview
          : currentPublishWarningCount > 0
            ? () => modal.warning({
                title: `当前模块与页面发布检查 · ${currentPublishWarningCount} 项待检查`,
                content: currentPublishIssues.map((issue, index) => (
                  <p key={`${issue.path ?? ""}-${issue.message}-${index}`}>
                    <strong>提醒：</strong>{issue.message}
                  </p>
                )),
                okText: "知道了",
              })
            : undefined}
      />
    </section>
  );
}
