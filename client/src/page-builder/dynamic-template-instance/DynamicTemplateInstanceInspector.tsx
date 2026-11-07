import { Button, Input, Tag } from "antd";
import { useEffect, useRef, useState } from "react";
import { normalizePublicProductReference } from "@/utils/publicProductPath";
import { productApi } from "@/services/api";
import { requestStatus } from "@/services/httpClient";
import type { Product } from "@/types";
import { unwrapResponse } from "@/utils/unwrap";
import MediaPickerField, { mediaSpecFromRecommendation, mediaSpecMatchingFrame } from "../fields/MediaPickerField";
import ProductReferencesField from "../fields/ProductReferencesField";
import SegmentedField from "../inspector/controls/SegmentedField";
import SwitchField from "../inspector/controls/SwitchField";
import LinkTargetField from "../inspector/LinkTargetField";
import { useInspectorModuleEditor } from "../inspector/useInspectorModuleEditor";
import {
  type DynamicTemplateSlotDefinition,
  type TemplateInstanceLayoutOverride,
} from "../template-definition";
import { describeActionCopy } from "../template-definition/templateCopyUnits";
import { hasTemplateImageContent } from "../template-definition/imageContent";
import { isTemplateProductImage } from "../template-definition/managedMediaPreview";
import { getTemplateVisibleLayoutChildIds, getWorkGridImageSlotIds } from "../template-definition/layoutAuthoring";
import { objectPositionToPercent } from "../template-definition/imagePosition";
import { describeEffectiveImageFrames } from "../template-definition/mobileWorkGrid";
import { resolveTemplateNodeRules, resolveTemplateSlotRules } from "../template-definition/responsive";
import { defaultTemplateImageFit } from "../template-definition/designPropertySemantics";
import { sectionCopyHiddenByDefault } from "../template-definition/sectionCopyVisibility";
import {
  formatExactTemplateRatio,
  getEffectiveTemplateRootRules,
  isContentHeightSplitSection,
  resolvePairedMobileCanvas,
} from "../template-definition/templateDimensions";
import { useVisualEditorSession } from "../visual-editor/visualEditorSession";
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
import PageLayoutPresetCards from "./PageLayoutPresetCards";
import { catalogCardName } from "../template-editor/catalogCardName";
import { usePublishedTemplateSectionRoles } from "../template-editor/publishedTemplateSectionRoles";
import type { PublishValidationIssue } from "../inspector/publishValidation";
import {
  getDynamicTemplatePageFieldDataAttributes,
  getDynamicTemplatePageFieldDescriptors,
  groupDynamicTemplatePageFields,
  type DynamicTemplatePageFieldDescriptor,
} from "./pageFieldDescriptors";
import { publicationPromiseLabel } from "./publicationPromise";
import { resolveDynamicTemplatePublicVisibility } from "./publicVisibility";

const { TextArea } = Input;

function hasPageFieldValue(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasPageFieldValue);
  return Object.entries(asRecord(value)).some(([key, entry]) => (
    (key !== "targetType" || entry !== "none") && hasPageFieldValue(entry)
  ));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readPageImage(value: unknown) {
  if (typeof value === "string") return { src: value, alt: "", mobileSrc: "", workProductCode: "" };
  const record = asRecord(value);
  return {
    src: typeof record.src === "string" ? record.src : "",
    alt: typeof record.alt === "string" ? record.alt : "",
    mobileSrc: typeof record.mobileSrc === "string" ? record.mobileSrc : "",
    workProductCode: normalizePublicProductReference(record.workProductCode) ?? "",
  };
}

function readDeviceImagePresentation(
  slotRules: DynamicTemplateSlotDefinition["desktopRules"],
  imageLayout: TemplateInstanceLayoutOverride | undefined,
  defaultFit: NonNullable<TemplateInstanceLayoutOverride["objectFit"]>,
) {
  const layout = imageLayout ?? {};
  const defaultFocus = objectPositionToPercent(slotRules.objectPosition);
  return {
    defaultFit,
    imageLayout: layout,
    defaultFocus,
    objectFit: layout.objectFit ?? defaultFit,
    focus: {
      x: layout.focusXPercent ?? defaultFocus.x,
      y: layout.focusYPercent ?? defaultFocus.y,
    },
  };
}

function hasImageCompositionOverride(layout: TemplateInstanceLayoutOverride | undefined): boolean {
  return layout?.objectFit !== undefined
    || layout?.imageScalePercent !== undefined
    || layout?.focusXPercent !== undefined
    || layout?.focusYPercent !== undefined;
}

function writePageImage(image: ReturnType<typeof readPageImage>) {
  const mobileSrc = image.mobileSrc.trim();
  if (!image.src.trim() && !image.alt.trim() && !mobileSrc) return "";
  return {
    src: image.src,
    alt: image.alt,
    ...(mobileSrc ? { mobileSrc } : {}),
    ...(image.workProductCode ? { workProductCode: image.workProductCode } : {}),
  };
}

function needsWorkMainImage(image: ReturnType<typeof readPageImage>) {
  return !image.src.trim() || isTemplateProductImage(image.src);
}

async function readWorkMainImage(code: string, signal: AbortSignal) {
  try {
    const product = unwrapResponse<Product>(await productApi.getPublicById(code, {
      locale: "zh-CN", publicOnly: true, suppressGlobalError: true, signal,
    }));
    const primary = product?.primaryImage;
    if (product?.code !== code || !primary || primary.isVideo) return null;
    const canonicalUrl = `/products/public/${product.id}/media/${primary.id}`;
    if (primary.mediaUrl !== canonicalUrl || !isTemplateProductImage(canonicalUrl)) return null;
    return { src: canonicalUrl, alt: product.name?.trim() || code };
  } catch (error) {
    if (requestStatus(error) !== 404) throw error;
    return null;
  }
}

const WORK_IMAGE_COMPOSITION_FIELDS = ["objectFit", "imageScalePercent", "focusXPercent", "focusYPercent"] as const;

function withWorkImageComposition(target: unknown, source: unknown) {
  const next = { ...asRecord(target) };
  const previous = asRecord(source);
  for (const device of ["desktop", "mobile"] as const) {
    const overrides = { ...asRecord(next[device]) };
    const previousOverrides = asRecord(previous[device]);
    for (const property of WORK_IMAGE_COMPOSITION_FIELDS) {
      if (previousOverrides[property] === undefined) delete overrides[property];
      else overrides[property] = previousOverrides[property];
    }
    if (Object.keys(overrides).length) next[device] = overrides;
    else delete next[device];
  }
  return next;
}

function parseInspectorRatio(ratio: string | undefined): number | undefined {
  if (!ratio || !/^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/.test(ratio)) return undefined;
  const [width, height] = ratio.split(":").map(Number);
  if (!(width > 0) || !(height > 0)) return undefined;
  return width / height;
}

export default function DynamicTemplateInstanceInspector({
  publishIssues,
  onOpenPublishReview,
  pageKey,
}: {
  publishIssues: PublishValidationIssue[];
  onOpenPublishReview?: () => void;
  pageKey?: string;
}) {
  const editor = useInspectorModuleEditor();
  const props = (editor?.props ?? {}) as DynamicTemplateInstanceProps;
  const catalogRoles = usePublishedTemplateSectionRoles((state) => state.rolesByTemplateId);
  const resolved = useResolvedDynamicTemplate(props.templateId ?? "", Number(props.templateVersion));
  const selection = useVisualEditorSession((state) => state.selection);
  const fieldRequest = useVisualEditorSession((state) => state.contentActionRequest);
  const [dismissedDescriptionRequest, setDismissedDescriptionRequest] = useState<typeof fieldRequest>(null);
  const inspectorRef = useRef<HTMLElement>(null);
  const editorBlockId = getDynamicTemplateInstanceEditorBlockId(props);
  const [workPicker, setWorkPicker] = useState<{ blockId: string; slotId: string } | null>(null);
  const [pendingWorkUploads, setPendingWorkUploads] = useState(0);
  const pendingWorkUploadsRef = useRef(0);
  useEffect(() => {
    if (!fieldRequest || fieldRequest.field === "alt" || fieldRequest.blockId !== editorBlockId) return;
    const field = inspectorRef.current?.querySelector<HTMLElement>(
      `[data-inspector-object-id="${CSS.escape(fieldRequest.nodeId)}"]`,
    );
    if (!field) return;
    field.focus({ preventScroll: true });
    const scroller = field.closest<HTMLElement>(".homepage-editor__properties-scroll");
    if (scroller) {
      scroller.scrollTop += field.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    }
  }, [editorBlockId, fieldRequest, resolved]);
  if (!editor) return null;
  if (!resolved) {
    return (
      <section className="homepage-editor__properties" aria-label="模板实例属性">
        <div className="homepage-editor__properties-scroll">
          <div className="homepage-editor__properties-empty-state" role="alert">
            <strong>暂时无法打开此区块</strong>
            <span>请稍后重试。</span>
          </div>
        </div>
      </section>
    );
  }
  const definition = resolved.definition;
  const pageFields = getDynamicTemplatePageFieldDescriptors(definition);
  const sectionRole = definition.metadata.sectionRole ?? definition.templateRecipe?.sectionRole;
  const displayRole = sectionRole ?? (props.templateId ? catalogRoles[props.templateId] : undefined);
  const pageFieldBySlotId = new Map(pageFields.map((field) => [field.slotId, field]));
  const content = asRecord(props.contentBySlotId);
  const imageCarriesCopy = props.imageCarriesCopy === true;
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
  const selectedImage = selectedPageField?.editable && selectedPageField.controlKind === "image"
    ? readPageImage(content[selectedPageField.slotId])
    : null;
  const canCorrectImageDescription = Boolean(selectedImage?.alt.trim() && (selectedImage.src.trim() || selectedImage.mobileSrc.trim()));
  const layoutOverrides = props.layoutOverridesByNodeId ?? {};
  const styleOverrideCount = Object.values(layoutOverrides).filter((byDevice) => (
    Object.values(byDevice).some((override) => Object.keys(override ?? {}).some((key) => key !== "visuallyCollapsed"))
  )).length + Number(Boolean(props.pageSettings?.mediaSide));
  const breakpoint = editor.device === "mobile" ? "mobile" : "desktop";
  const hasImageOnDevice = pageFields.some((field) => (
    field.controlKind === "image" && !hidden.includes(field.slotId)
    && hasTemplateImageContent(content[field.slotId], breakpoint)
  ));
  const workSlotIds = getWorkGridImageSlotIds(definition);
  const workFields = pageFields.filter((field) => workSlotIds.has(field.slotId));
  const visibleWorkNodes = (device: "desktop" | "mobile") => {
    const visible = new Set<string>();
    if (!workFields.length) return visible;
    const rootRules = getEffectiveTemplateRootRules(definition, device);
    if (definition.nodes[definition.rootNodeId].hidden || rootRules.hidden || rootRules.display === "none") return visible;
    const visit = (nodeId: string) => {
      if (visible.has(nodeId)) return;
      visible.add(nodeId);
      getTemplateVisibleLayoutChildIds(definition, nodeId, device).forEach(visit);
    };
    visit(definition.rootNodeId);
    return visible;
  };
  const desktopWorkNodes = visibleWorkNodes("desktop");
  const mobileWorkNodes = visibleWorkNodes("mobile");
  const isAvailableWorkSlot = (field: DynamicTemplatePageFieldDescriptor, values: Record<string, unknown>, hiddenSlots: readonly unknown[]) => {
    const image = readPageImage(values[field.slotId]);
    const visible = breakpoint === "mobile" ? mobileWorkNodes : desktopWorkNodes;
    return field.editable && !hiddenSlots.includes(field.slotId) && visible.has(field.nodeId) && !image.workProductCode;
  };
  const availableWorkFields = workFields.filter((field) => isAvailableWorkSlot(field, content, hidden));
  const missingWorkCount = workFields.filter((field) => (
    hidden.includes(field.slotId) || !hasTemplateImageContent(content[field.slotId], breakpoint)
  )).length;
  const editableFields = pageFields.filter((field) => {
    if (!field.editable) return false;
    const slot = definition.slots[field.slotId];
    if (imageCarriesCopy && !field.required && (slot.key === "subtitle" || slot.semanticRole === "subtitle")) return false;
    if (field.required || hasPageFieldValue(content[field.slotId])) return true;
    return !sectionCopyHiddenByDefault(sectionRole, slot, resolveTemplateNodeRules(definition, field.nodeId, breakpoint).hidden);
  });
  const heroCopyFields = sectionRole === "page-hero"
    ? editableFields.filter((field) => ["heading", "text", "richText"].includes(field.slotType))
    : [];
  const supplementalFields = editableFields.filter((field) => {
    if (heroCopyFields.includes(field)) return false;
    if (field.required || workSlotIds.has(field.slotId)) return false;
    const slot = definition.slots[field.slotId];
    if (sectionRole === "creation-grid") return field.controlKind === "text" || field.controlKind === "link";
    if (sectionRole !== "page-hero" && sectionRole !== "editorial-split") return false;
    return field.controlKind === "link" || field.slotType === "badge" || slot.semanticRole === "secondaryImage"
      || ["subtitle", "logo", "brandName", "eyebrow"].includes(slot.semanticRole ?? slot.key);
  });
  const primaryFields = editableFields.filter((field) => !supplementalFields.includes(field) && !heroCopyFields.includes(field));
  if (sectionRole === "editorial-split") {
    primaryFields.sort((left, right) => Number(right.controlKind === "text") - Number(left.controlKind === "text"));
  }
  const slotGroups = groupDynamicTemplatePageFields(primaryFields, selectedNode?.slotId);
  const primaryImage = primaryFields.find((field) => field.controlKind === "image");
  const artworkImage = imageCarriesCopy ? editableFields.find((field) => (
    field.controlKind === "image" && !hidden.includes(field.slotId)
    && hasTemplateImageContent(content[field.slotId], breakpoint)
  )) : undefined;
  const fieldDisplayLabel = (field: DynamicTemplatePageFieldDescriptor) => field.slotType === "button" && field.label === "按钮 / CTA"
    ? "按钮与跳转" : field.label;
  const publicDecision = resolveDynamicTemplatePublicVisibility({
    definition,
    contentBySlotId: content,
    hiddenSlotIds: hidden,
    breakpoint,
    pageKey,
  });
  const instancePublishErrorCount = publishIssues.filter((issue) => (
    issue.severity === "error"
    && (issue.blockId === editorBlockId || issue.blockId === props.instanceId)
  )).length;
  const publicVisibilityState = props.isVisible === false
    ? "hidden"
    : instancePublishErrorCount > 0
      ? "blocked"
      : publicDecision.visible
        ? "ready"
        : "empty";
  const nodeBySlotId = new Map(
    Object.values(definition.nodes).flatMap((candidate) => candidate.slotId ? [[candidate.slotId, candidate] as const] : []),
  );
  const workNeighbor = (field: DynamicTemplatePageFieldDescriptor, offset: -1 | 1) => {
    const adjacent = workFields[workFields.indexOf(field) + offset];
    if (!adjacent?.editable || !field.editable || hidden.includes(field.slotId) || hidden.includes(adjacent.slotId)) return;
    const sourceSlot = definition.slots[field.slotId];
    const targetSlot = definition.slots[adjacent.slotId];
    const sameGrid = Object.values(definition.nodes).some((node) =>
      node.type === "Grid" && node.childIds.includes(field.nodeId) && node.childIds.includes(adjacent.nodeId));
    if (!sameGrid || [desktopWorkNodes, mobileWorkNodes].some((visible) => (
      !visible.has(field.nodeId) || !visible.has(adjacent.nodeId)
    ))) return;
    // 只交换同一网格内等价的图片卡位，避免把作品放进约束不同的槽位。
    const cardRules = (slot: DynamicTemplateSlotDefinition, descriptor: DynamicTemplatePageFieldDescriptor) =>
      JSON.stringify([slot.required, slot.hideable, slot.validation, slot.desktopRules, slot.mobileRules,
        descriptor.effectiveDesignOverrideCapabilities]);
    if (cardRules(sourceSlot, field) !== cardRules(targetSlot, adjacent)) return;
    return adjacent;
  };
  const moveWork = (field: DynamicTemplatePageFieldDescriptor, adjacent: DynamicTemplatePageFieldDescriptor) => {
    if (pendingWorkUploads || editor.historyTransactionPending) return;
    editor.updateHistoryTransaction((current) => {
      const nextContent = { ...asRecord(current.contentBySlotId) };
      const nextOverrides = { ...asRecord(current.layoutOverridesByNodeId) };
      // 图片、手机专用图、替代文字和关联作品一起移动，取景也随图片移动。
      const swap = (values: Record<string, unknown>, from: string, to: string) => {
        const original = values[from];
        if (Object.prototype.hasOwnProperty.call(values, to)) values[from] = values[to];
        else delete values[from];
        if (original !== undefined) values[to] = original;
        else delete values[to];
      };
      swap(nextContent, field.slotId, adjacent.slotId);
      const source = nextOverrides[field.nodeId];
      const destination = nextOverrides[adjacent.nodeId];
      for (const [nodeId, target, previous] of [
        [field.nodeId, source, destination],
        [adjacent.nodeId, destination, source],
      ] as const) {
        const layout = withWorkImageComposition(target, previous);
        if (Object.keys(layout).length) nextOverrides[nodeId] = layout;
        else delete nextOverrides[nodeId];
      }
      return { contentBySlotId: nextContent, layoutOverridesByNodeId: nextOverrides };
    });
  };
  const linkWorkBatch = async (codes: string[], signal: AbortSignal) => {
    const retryMessage = "作品卡位已变化，请关闭后重新选择。";
    if (pendingWorkUploadsRef.current || editor.historyTransactionPending) return retryMessage;
    const fields = availableWorkFields.slice(0, codes.length);
    const references = codes.map(normalizePublicProductReference);
    if (!fields.length || fields.length !== codes.length || references.some((code) => !code)) return retryMessage;
    const images = await Promise.all(fields.map(({ slotId }, index) => (
      needsWorkMainImage(readPageImage(content[slotId])) ? readWorkMainImage(references[index]!, signal) : null
    )));
    if (signal.aborted) return;
    const missing = fields.findIndex(({ slotId }, index) => needsWorkMainImage(readPageImage(content[slotId])) && !images[index]);
    if (missing >= 0) return `作品 ${references[missing]} 的公开主图不可用。请选择其他作品后重试。`;
    if (pendingWorkUploadsRef.current) return retryMessage;
    const committed = editor.updateHistoryTransaction((current) => {
      const values = asRecord(current.contentBySlotId);
      const hiddenSlots = Array.isArray(current.hiddenSlotIds) ? current.hiddenSlotIds : [];
      if (!fields.every((field, index) => (
        isAvailableWorkSlot(field, values, hiddenSlots)
        && (!needsWorkMainImage(readPageImage(values[field.slotId])) || images[index])
      ))) return;
      const nextContent = { ...values };
      fields.forEach(({ slotId }, index) => {
        const image = readPageImage(values[slotId]);
        const primary = needsWorkMainImage(image) ? images[index] : null;
        nextContent[slotId] = writePageImage({
          ...image,
          src: primary?.src ?? image.src,
          alt: !image.mobileSrc.trim() && primary && (!image.alt.trim() || isTemplateProductImage(image.src)) ? primary.alt : image.alt,
          workProductCode: references[index] ?? "",
        });
      });
      return { contentBySlotId: nextContent };
    });
    return committed ? undefined : retryMessage;
  };
  const updateContent = (slotId: string, value: unknown) => {
    editor.updateFromCurrent((current) => ({
      contentBySlotId: {
        ...asRecord(current.contentBySlotId),
        [slotId]: value,
      },
    }));
  };
  const stripLockedPageValues = () => {
    editor.updateFromCurrent((current) => ({
      contentBySlotId: stripNonEditableSlotContent(current.contentBySlotId, definition),
    }));
  };
  const lockedLeftoverCount = countNonEditableSlotContent(content, definition);
  const showPreviouslyHiddenField = (slotId: string) => {
    editor.updateFromCurrent((current) => {
      const currentHidden = Array.isArray(current.hiddenSlotIds)
        ? current.hiddenSlotIds.filter((value): value is string => typeof value === "string")
        : [];
      return {
        hiddenSlotIds: currentHidden.filter((value) => value !== slotId),
      };
    });
  };
  const fieldActions = editableFields.flatMap((field) => {
    const label = fieldDisplayLabel(field);
    const node = nodeBySlotId.get(field.slotId);
    const actions = [];
    if (hidden.includes(field.slotId) && field.hideable && !field.required) {
      actions.push({
        key: `show-${field.slotId}`,
        label: `恢复显示${label}`,
        onClick: () => showPreviouslyHiddenField(field.slotId),
      });
    }
    if (field.controlKind === "image" && node
      && hasImageCompositionOverride(layoutOverrides[node.nodeId]?.[breakpoint])) {
      actions.push({
        key: `reset-${field.slotId}`,
        label: `恢复${label}的模板取景`,
        onClick: () => updateMediaPresentation(node.nodeId, breakpoint, {
          objectFit: undefined,
          imageScalePercent: undefined,
          focusXPercent: undefined,
          focusYPercent: undefined,
        }),
      });
    }
    return actions;
  });
  const restoreInstanceStyle = () => {
    const visibilityOverrides: NonNullable<DynamicTemplateInstanceProps["layoutOverridesByNodeId"]> = {};
    for (const [nodeId, byDevice] of Object.entries(layoutOverrides)) {
      for (const device of ["desktop", "mobile"] as const) {
        const visuallyCollapsed = byDevice[device]?.visuallyCollapsed;
        if (visuallyCollapsed === undefined) continue;
        (visibilityOverrides[nodeId] ??= {})[device] = { visuallyCollapsed };
      }
    }
    editor.updateHistoryTransaction({
      layoutOverridesByNodeId: visibilityOverrides,
      ...(props.pageSettings?.mediaSide ? { pageSettings: { ...props.pageSettings, mediaSide: undefined } } : {}),
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
  const renderSlotControl = (field: DynamicTemplatePageFieldDescriptor) => {
    const slot = definition.slots[field.slotId];
    const hasPageValue = Object.prototype.hasOwnProperty.call(content, slot.slotId);
    // 面板只显示本页填写的值。模板示例不预填，没填的槽位在页面画布上收起。
    const value = hasPageValue ? content[slot.slotId] : undefined;
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
        // 上传可能在切端后才完成，合并时读取最新的另一端图片和替代文字。
        editor.updateFromCurrent((current) => {
          const currentContent = asRecord(current.contentBySlotId);
          return {
            contentBySlotId: {
              ...currentContent,
              [slot.slotId]: writePageImage({ ...readPageImage(currentContent[slot.slotId]), ...patch }),
            },
          };
        });
      };
      const imageNode = nodeBySlotId.get(slot.slotId);
      const imagePolicy = field.effectiveDesignOverrideCapabilities;
      const nodeLayout = imageNode ? layoutOverrides[imageNode.nodeId] : undefined;
      const desktopRules = resolveTemplateSlotRules(definition, slot.slotId, "desktop");
      const mobileRules = resolveTemplateSlotRules(definition, slot.slotId, "mobile");
      const inheritedFit = definition.schemaVersion >= 2 ? nodeLayout?.desktop?.objectFit : undefined;
      const usageFit = defaultTemplateImageFit(slot.semanticRole, workSlotIds.has(slot.slotId));
      const desktopDefaultFit = field === artworkImage ? "contain" : desktopRules.objectFit ?? usageFit;
      const mobileDefaultFit = inheritedFit ?? (field === artworkImage ? "contain" : mobileRules.objectFit ?? usageFit);
      const desktopPresentation = readDeviceImagePresentation(desktopRules, nodeLayout?.desktop, desktopDefaultFit);
      const mobilePresentation = readDeviceImagePresentation(mobileRules, nodeLayout?.mobile, mobileDefaultFit);
      const explicitMobileFit = nodeLayout?.mobile?.objectFit ?? inheritedFit;
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
      const compositionDevice: "desktop" | "mobile" = editor.device === "mobile" ? "mobile" : "desktop";
      const writeImageComposition = (
        device: "desktop" | "mobile",
        patch: Partial<TemplateInstanceLayoutOverride>,
      ) => {
        if (!imageNode) return;
        // 只写当前画布这一端。视口由顶部设备切换决定，构图操作不改画布端口。
        updateMediaPresentation(imageNode.nodeId, device, patch);
      };
      const updateImageFocus = (device: "desktop" | "mobile", next: Partial<{ x: number; y: number }>) => {
        const presentation = device === "desktop" ? desktopPresentation : mobilePresentation;
        const patch: Partial<TemplateInstanceLayoutOverride> = {};
        if (next.x !== undefined) patch.focusXPercent = next.x === presentation.defaultFocus.x ? undefined : next.x;
        if (next.y !== undefined) patch.focusYPercent = next.y === presentation.defaultFocus.y ? undefined : next.y;
        writeImageComposition(device, patch);
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
      const editingMobile = compositionDevice === "mobile";
      const activePresentation = editingMobile ? mobilePresentation : desktopPresentation;
      const activeRatioLabel = editingMobile
        ? (image.mobileSrc.trim() ? mobileFrameLabel : reusedPreviewRatio)
        : slot.desktopRules.aspectRatio;
      const configuredFit = activePresentation.objectFit;
      const activeSrc = editingMobile ? image.mobileSrc : image.src;
      const inheritedSrc = editingMobile && !image.mobileSrc.trim() ? image.src.trim() : "";
      const canFocusActive = Boolean(imageNode)
        && activePresentation.objectFit !== "fill"
        && Boolean(activeSrc.trim() || inheritedSrc);
      const canFitActive = Boolean(imageNode && imagePolicy?.imageFit && (activeSrc.trim() || inheritedSrc));
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
      const showImageDescription = fieldRequest?.field === "alt"
        && fieldRequest !== dismissedDescriptionRequest
        && fieldRequest.blockId === editorBlockId
        && fieldRequest.nodeId === field.nodeId
        && selectedPageField?.slotId === slot.slotId;
      const openImageDescription = () => {
        const session = useVisualEditorSession.getState();
        const imageSelection = {
          blockId: editorBlockId,
          moduleType: editor.moduleType,
          nodeId: field.nodeId,
          kind: "media" as const,
        };
        session.selectNode(imageSelection);
        session.requestContentAction(imageSelection, "alt");
      };
      const imageHint = editingMobile && activeSrc.trim()
        ? "正在使用手机专用图"
        : inheritedSrc ? "手机沿用桌面图"
          : !activeSrc.trim() && activeSpec
          ? `建议 ${activeSpec.width} × ${activeSpec.height} px`
          : "";
      return (
        <div className="homepage-editor__media-controls">
          {imageHint ? <p className="homepage-editor__properties-hint" data-image-asset-guidance={slot.slotId}
            data-media-inherited-hint={inheritedSrc ? "true" : undefined}
            data-mobile-asset-gap={editingMobile && heroCapable && !activeSrc.trim() ? "true" : undefined}>
            {imageHint}
          </p> : null}
          <MediaPickerField
            key={editorBlockId}
            fieldKey={editingMobile ? `${slot.slotId}-mobile` : slot.slotId}
            device={compositionDevice}
            value={activeSrc}
            fallbackSrc={inheritedSrc || undefined}
            required={editingMobile ? false : field.required}
            spec={activeSpec}
            previewAspectRatio={activeRatioLabel?.replace(":", " / ")}
            previewFit={configuredFit}
            previewFocus={activePresentation.focus}
            previewZoom={(activePresentation.imageLayout.imageScalePercent ?? 100) / 100}
            frameLabel={activeRatioLabel}
            imageInfo="warnings"
            compactActions
            uploadOnly
            clearImageLabel={editingMobile && image.src.trim() ? "恢复沿用桌面图" : editingMobile ? "移除手机专用图" : "移除桌面图片"}
            clearImageWarning={!editingMobile && !image.mobileSrc.trim() ? "手机端也会失去沿用的桌面图。" : undefined}
            onUploadingChange={workSlotIds.has(slot.slotId) ? (uploading) => {
              pendingWorkUploadsRef.current += uploading ? 1 : -1;
              setPendingWorkUploads(pendingWorkUploadsRef.current);
            } : undefined}
            onFocusChange={canFocusActive
              ? (next) => updateImageFocus(compositionDevice, next)
              : undefined}
            onChange={(next) => commitImage(editingMobile ? { mobileSrc: next } : { src: next })}
          />
          {canFitActive ? (
            <div
              key={`${editorBlockId}:${slot.slotId}:${compositionDevice}`}
              className="homepage-editor__instance-subgroup"
              data-image-composition={compositionDevice}
            >
              <div data-inspector-field="objectFit" data-inspector-device={compositionDevice}>
                <SegmentedField
                  label="图片适配"
                  ariaLabel={`${field.label}图片适配`}
                  value={configuredFit}
                  hint={configuredFit === "fill" ? "当前为拉伸" : undefined}
                  options={[
                    { value: "cover", label: "填满并裁切" },
                    { value: "contain", label: "完整显示" },
                  ]}
                  onChange={(objectFit) => writeImageComposition(compositionDevice, {
                    objectFit: objectFit === activePresentation.defaultFit
                      ? undefined : objectFit === "contain" ? "contain" : "cover",
                  })}
                />
              </div>
            </div>
          ) : null}
          {!showImageDescription && (activeSrc.trim() || inheritedSrc) && !(image.workProductCode && !image.alt.trim()) ? (
            <Button size="small" type="link" onClick={openImageDescription}>
              {image.alt.trim() ? "编辑图片说明" : "添加图片说明"}
            </Button>
          ) : null}
          {showImageDescription ? (
            <div className="homepage-editor__instance-subgroup" data-inspector-field="alt">
              <label className="homepage-editor__inspector-field">
                <span>图片说明</span>
                <Input
                  autoFocus
                  aria-label={`${field.label}替代文字`}
                  value={image.alt}
                  placeholder="简述图中的作品，供读屏使用"
                  onChange={(event) => commitImage({ alt: event.target.value })}
                />
              </label>
              <Button size="small" aria-label="完成图片说明" onClick={(event) => {
                setDismissedDescriptionRequest(fieldRequest);
                event.currentTarget.closest("fieldset")?.focus();
              }}>完成</Button>
            </div>
          ) : null}
          {workSlotIds.has(slot.slotId) && (Boolean(activeSrc.trim() || inheritedSrc) || image.workProductCode) ? (
            <div className="homepage-editor__instance-subgroup" data-inspector-field="workProductCode">
              <strong>作品跳转</strong>
              <ProductReferencesField
                key={editorBlockId}
                value={image.workProductCode ? [image.workProductCode] : []}
                onChange={(codes) => commitImage({ workProductCode: normalizePublicProductReference(codes[0]) ?? "" })}
                minProducts={1}
                maxProducts={1}
                singlePicker={{
                  open: workPicker?.blockId === editorBlockId && workPicker.slotId === slot.slotId,
                  onOpen: () => setWorkPicker({ blockId: editorBlockId, slotId: slot.slotId }),
                  onClose: () => setWorkPicker(null),
                  onConfirm: isTemplateProductImage(image.src) ? async (code, signal) => {
                    const primary = await readWorkMainImage(code, signal);
                    if (signal.aborted) return;
                    if (!primary) return `作品 ${code} 的公开主图不可用。请选择其他作品后重试。`;
                    if (pendingWorkUploadsRef.current) return "图片正在上传，请稍后重试。";
                    const committed = editor.updateHistoryTransaction((current) => {
                      const values = asRecord(current.contentBySlotId);
                      const currentImage = readPageImage(values[slot.slotId]);
                      if (currentImage.workProductCode !== image.workProductCode) return;
                      const applyMainImage = needsWorkMainImage(currentImage);
                      return {
                        contentBySlotId: {
                          ...values,
                          [slot.slotId]: writePageImage({
                            ...currentImage,
                            src: applyMainImage ? primary.src : currentImage.src,
                            alt: applyMainImage && !currentImage.mobileSrc.trim() ? primary.alt : currentImage.alt,
                            workProductCode: code,
                          }),
                        },
                      };
                    });
                    return committed ? undefined : "卡位内容已变化，请关闭后重新选择。";
                  } : undefined,
                }}
              />
              {image.workProductCode && imageNode && !image.alt.trim() && !showImageDescription ? (
                <div className="homepage-editor__instance-inline-actions">
                  <span role="status">图片需要说明，才能作为商品链接。</span>
                  <Button size="small" onClick={openImageDescription}>
                    填写图片说明
                  </Button>
                </div>
              ) : null}
              <div className="homepage-editor__instance-inline-actions">
                {image.workProductCode ? (
                  <Button size="small" type="text" onClick={() => commitImage({ workProductCode: "" })}>
                    清除跳转
                  </Button>
                ) : (
                  <Button size="small" onClick={() => setWorkPicker({ blockId: editorBlockId, slotId: slot.slotId })}>
                    选择商品
                  </Button>
                )}
              </div>
            </div>
          ) : null}
        </div>
      );
    }
    if (field.controlKind === "link" && (field.slotType === "button" || field.slotType === "link")) {
      const action = asRecord(value);
      const label = typeof action.label === "string" ? action.label : "";
      const copyGuidance = describeActionCopy(field.slotType, label);
      const linksArtwork = imageCarriesCopy && field.slotType === "button";
      const showActionLabel = !linksArtwork || field.required;
      const targetType = typeof action.targetType === "string" ? action.targetType : "none";
      const linkUrl = targetType === "page"
        ? action.pagePath
        : targetType === "external"
          ? action.url
          : "";
      return (
        <div style={{ display: "grid", gap: 10 }}>
          {showActionLabel ? (
            <Input
              aria-label={`${fieldDisplayLabel(field)}文案`}
              value={label}
              placeholder={field.slotType === "button" ? "输入按钮文字" : "输入链接文字"}
              onChange={(event) => updateContent(slot.slotId, { ...action, label: event.target.value })}
            />
          ) : null}
          {showActionLabel && copyGuidance.review ? <p className="homepage-editor__properties-hint" role="status" data-template-copy-guidance={field.slotType}>{copyGuidance.hint}</p> : null}
          <LinkTargetField
            key={`${editorBlockId}:${slot.slotId}`}
            id={`dynamic-template-${props.instanceId}-${slot.slotId}`}
            compact
            pickerPresentation="dialog"
            label={`${fieldDisplayLabel(field)}跳转`}
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
          {showActionLabel && !label.trim() && targetType !== "none" ? (
            <p className="homepage-editor__properties-hint">填写文字后，{field.slotType === "button" ? "按钮" : "链接"}才会显示在页面上。</p>
          ) : null}
          {targetType === "product" && typeof action.productCode === "string" && action.productCode.trim() ? (
            <p className="homepage-editor__properties-hint" role="status">
              此商品去向仅在装修预览中生效。需要前台跳转时，可选择分类、页面或外链。
            </p>
          ) : null}
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
    const textNode = ["heading", "text", "richText", "badge"].includes(slot.type) ? nodeBySlotId.get(slot.slotId) : undefined;
    const hiddenAcrossDevices = hidden.includes(slot.slotId);
    const visuallyCollapsed = textNode && layoutOverrides[textNode.nodeId]?.[breakpoint]?.visuallyCollapsed === true;
    const previousWork = workSlotIds.has(slot.slotId) ? workNeighbor(field, -1) : undefined;
    const nextWork = workSlotIds.has(slot.slotId) ? workNeighbor(field, 1) : undefined;
    return (
      <fieldset
        key={slot.slotId}
        className="homepage-editor__instance-slot"
        data-slot-id={slot.slotId}
        data-slot-task={field.task}
        data-inspector-field={slot.slotId}
        data-inspector-object-id={nodeBySlotId.get(slot.slotId)?.nodeId}
        data-page-field-selected={selectedPageField?.slotId === slot.slotId ? "true" : undefined}
        tabIndex={-1}
        {...getDynamicTemplatePageFieldDataAttributes(field, "page")}
      >
        <legend>
          <strong>{fieldDisplayLabel(field)}</strong>
          {hiddenAcrossDevices && field.hideable && !field.required ? (
            <small className="homepage-editor__properties-hint"> · 已隐藏</small>
          ) : null}
          {field.required ? (
            <Tag color="red" style={{ marginLeft: 8 }}>{publicationPromiseLabel(field, definition.schemaVersion)}</Tag>
          ) : null}
        </legend>
        {renderSlotControl(field)}
        {(previousWork || nextWork) && hasPageFieldValue(content[slot.slotId]) ? (
          <div className="homepage-editor__instance-inline-actions">
            <Button size="small" disabled={!previousWork || pendingWorkUploads > 0 || editor.historyTransactionPending}
              aria-label={`${field.label}前移`} onClick={() => previousWork && moveWork(field, previousWork)}>前移</Button>
            <Button size="small" disabled={!nextWork || pendingWorkUploads > 0 || editor.historyTransactionPending}
              aria-label={`${field.label}后移`} onClick={() => nextWork && moveWork(field, nextWork)}>后移</Button>
          </div>
        ) : null}
        {field === primaryImage && imageCarriesCopy ? imageCarriesCopyControl : null}
        {imageCarriesCopy && field.slotType === "button" ? (
          <p className="homepage-editor__properties-hint">
            设置跳转后，整张主图可点击。
          </p>
        ) : null}
        {textNode && !hiddenAcrossDevices && (visuallyCollapsed || (hasImageOnDevice && hasPageFieldValue(content[slot.slotId]))) ? (
          <SwitchField
            label={editor.device === "mobile" ? "在手机端收起这段文字" : "在桌面端收起这段文字"}
            hint={visuallyCollapsed ? "原文仍可被读屏读取。" : undefined}
            value={Boolean(visuallyCollapsed)}
            onChange={(checked) => updateMediaPresentation(textNode.nodeId, breakpoint, { visuallyCollapsed: checked ? true : undefined })}
          />
        ) : null}
      </fieldset>
    );
  };

  const imageCarriesCopyControl = (
    <div className="homepage-editor__instance-inline-actions">
      <span>标题已隐藏</span>
      <Button
        size="small"
        disabled={editor.historyTransactionPending}
        onClick={() => editor.updateHistoryTransaction({ imageCarriesCopy: false })}
      >
        恢复标题显示
      </Button>
    </div>
  );

  return (
    <section ref={inspectorRef} className="homepage-editor__properties homepage-editor__instance-inspector" aria-label="模板实例属性">
      <div className="homepage-editor__properties-scroll">
        <div className="homepage-editor__dynamic-instance-overview">
          <div className="homepage-editor__instance-heading">
            <strong>{catalogCardName(displayRole, definition.name || props.moduleName)}</strong>
            <DynamicTemplateUpgradePanel
              key={editorBlockId}
              fieldActions={fieldActions}
              onRestoreStyle={styleOverrideCount > 0 ? restoreInstanceStyle : undefined}
              restoreStyleDisabled={editor.historyTransactionPending}
              onCorrectImageDescription={canCorrectImageDescription && selection ? () => {
                useVisualEditorSession.getState().requestContentAction(selection, "alt");
              } : undefined}
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
          </div>
          {!primaryImage && imageCarriesCopy ? imageCarriesCopyControl : null}
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
          {publicVisibilityState !== "ready" ? <div
            className="homepage-editor__dynamic-instance-public-status"
            data-state={publicVisibilityState}
            role="status"
            aria-label="前台展示状态"
          >
            <strong>{publicVisibilityState === "hidden"
              ? "此区块已隐藏，可在图层面板恢复"
              : publicVisibilityState === "blocked"
                ? `本节有 ${instancePublishErrorCount} 项发布阻断`
                : publicDecision.summary}</strong>
            {publicVisibilityState === "blocked" && onOpenPublishReview ? (
              <Button size="small" type="link" onClick={onOpenPublishReview}>查看发布检查</Button>
            ) : null}
          </div> : null}
        </div>
        {breakpoint === "desktop" && mediaSideEffective ? (
          <PageLayoutPresetCards
            value={selectedMediaSide}
            disabled={editor.historyTransactionPending}
            onChange={(mediaSide) => {
              if (mediaSide === selectedMediaSide || editor.historyTransactionPending) return;
              editor.updateHistoryTransaction({
                pageSettings: { ...props.pageSettings, mediaSide },
              });
            }}
          />
        ) : null}
        {slotGroups.sections.map(({ group, label, fields }) => {
          const isWorkSection = group === "image" && fields.some((field) => workSlotIds.has(field.slotId));
          const title = isWorkSection ? "作品" : label;
          return (
            <section
              key={`${group}:${fields[0].slotId}`}
              aria-label={title}
            >
              {fields.length > 1 ? (
                <div className="homepage-editor__inspector-section-head">
                  <strong>{title}</strong>
                  {isWorkSection ? <span role="status">
                    {missingWorkCount > 0 ? `还缺 ${missingWorkCount} 张作品图` : `已填齐 ${workFields.length} 张作品图`}
                  </span> : null}
                </div>
              ) : null}
              {isWorkSection && availableWorkFields.length > 0 ? (
                <div className="homepage-editor__instance-subgroup">
                  <ProductReferencesField
                    key={editorBlockId}
                    batchPicker={{ label: "批量选作品", onConfirm: linkWorkBatch }}
                    minProducts={1}
                    maxProducts={availableWorkFields.length}
                    readOnly={pendingWorkUploads > 0 || editor.historyTransactionPending}
                  />
                  <p className="homepage-editor__properties-hint">按选择顺序填入未关联作品的卡位。空卡位自动带入主图，已选图片可以单独更换。</p>
                </div>
              ) : null}
              {fields.map(renderSlotFieldset)}
            </section>
          );
        })}
        {heroCopyFields.length > 0 ? (
          <section aria-label="标题与说明">
            <div className="homepage-editor__inspector-section-head"><strong>标题与说明</strong></div>
            {heroCopyFields.every((field) => !field.required) ? (
              <p className="homepage-editor__properties-hint">图片已带文案时，可将对应文字留空。</p>
            ) : null}
            {heroCopyFields.map(renderSlotFieldset)}
          </section>
        ) : null}
        {supplementalFields.map(renderSlotFieldset)}
      </div>

    </section>
  );
}
