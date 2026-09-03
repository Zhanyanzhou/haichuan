/**
 * SchemaInspectorPanel.tsx — 由模块 Schema 驱动的统一编辑面板。
 *
 * 结构：TopBar（当前实例）→
 *       模板导航 / 校验状态 → 连续任务分区（按内容/业务对象任务调整顺序，全部直接展示）→
 *       FooterBar（手动保存整页草稿）。
 * 与 InspectorPanel 的三级分派配合：仅在 registry 命中时渲染。
 */
import { UndoOutlined } from "@ant-design/icons";
import { App as AntdApp } from "antd";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  useHomepagePuck,
} from "../../pages/admin/HomepageConfig/editor-store";
import {
  getModuleDisplayName,
} from "../../pages/admin/HomepageConfig/editor-utils";
import InspectorObjectContext, {
  getInspectorResponsiveStates,
} from "./InspectorObjectContext";
import InspectorDisclosure from "./InspectorDisclosure";
import InspectorFooterBar from "./InspectorFooterBar";
import {
  getInspectorPublishIssues,
  isPagePublishIssue,
  type PublishValidationIssue,
  type PublishValidationStatus,
} from "./publishValidation";
import InspectorModePortal from "./InspectorModePortal";
import InspectorTemplateNavigator from "./InspectorTemplateNavigator";
import FieldRenderer, { isFieldVisible } from "./FieldRenderer";
import InstanceOverridesPanel from "./InstanceOverridesPanel";
import {
  type InspectorPrimaryMode,
} from "./InspectorPrimaryTabs";
import { useVisualEditorSession } from "../visual-editor/visualEditorSession";
import { useInspectorModuleEditor } from "./useInspectorModuleEditor";
import type { PuckProps } from "../types";
import {
  extractContentTemplateLayoutData,
  getContentTemplateContract,
  getContentTemplateEditableFieldKeys,
  getContentTemplateEditableObject,
} from "../generated/contentTemplates.generated";
import { getTemplateContractNodeLabel } from "../runtime/contentTemplateRolePresentation";
import {
  applySharedTemplateDesignPatch,
  getSharedTemplateDesignSignatures,
} from "../visual-editor/sharedTemplateDesign";
import {
  type FieldDef,
  type InspectorContext,
  type InspectorLayer,
  type ModuleInspectorSchema,
} from "./schema/types";

interface SchemaInspectorPanelProps {
  schema: ModuleInspectorSchema;
  hasUnsavedChanges: boolean;
  saving: boolean;
  onSaveDraft: () => void;
  templateDesignEnabled?: boolean;
  publishIssues: PublishValidationIssue[];
  validationStatus?: PublishValidationStatus;
  onRetryValidation?: () => void;
  onOpenPageSettings?: (field?: string) => void;
}

type InspectorTaskGroup =
  | "content"
  | "media"
  | "product"
  | "link"
  | "composition"
  | "style"
  | "feature";

type InspectorPropertyLevel =
  | "content"
  | "layout"
  | "style"
  | "interaction"
  | "advanced";

interface VisibleFieldEntry {
  sectionId: string;
  field: FieldDef;
}

const VISUAL_NODE_LABELS: Record<string, string> = {
  desktopImage: "桌面主图",
  mobileImage: "移动端主图",
  image: "主图",
  mainImage: "主海报",
  detailImage: "细节海报",
  copy: "文案",
  bgImage: "背景图",
  product: "商品作品",
  productCards: "商品区域",
  title: "标题",
  eyebrow: "眉题",
  subtitle: "副标题",
  description: "说明文字",
  actionText: "行动文字",
  buttonText: "主按钮",
  action: "行动入口",
  video: "视频",
  collection: "内容集合",
};

const DESIGN_CAPABILITIES = new Set([
  "fit",
  "zoom",
  "ratio",
  "typography",
  "layout",
  "layer",
  "z",
  "focus",
  "size",
  "position",
  "visibility",
]);

type EditableObject = NonNullable<
  ReturnType<typeof getContentTemplateEditableObject>
>;

function toVisualNodeKind(kind: EditableObject["kind"]) {
  if (kind === "video") return "media" as const;
  if (kind === "collection") return "structured" as const;
  return kind;
}

function isEditableObjectAvailableOnDevice(
  object: EditableObject,
  roles: readonly { id: string; appliesTo?: readonly ("desktop" | "mobile")[] }[],
  device: "desktop" | "mobile",
) {
  const objectNodeIds = new Set([object.roleId, ...(object.nodeIds ?? [])]);
  const matchingRoles = roles.filter((role) => objectNodeIds.has(role.id));
  return matchingRoles.length === 0 || matchingRoles.some(
    (role) => !role.appliesTo || role.appliesTo.includes(device),
  );
}

function hasEditableDesign(object: EditableObject | undefined) {
  return Boolean(object?.capabilities.some((capability) =>
    DESIGN_CAPABILITIES.has(capability),
  ));
}

function getSharedDesignLabel(object: EditableObject | undefined) {
  if (!object) return "模块共享设置同步到双端";
  const sharedCapabilities = Object.entries(object.responsive)
    .filter(([, scope]) => scope === "shared")
    .map(([capability]) => capability);
  if (sharedCapabilities.length === 0) return "当前对象仅按设备保存设计";
  const labels: Record<string, string> = {
    ratio: "比例",
    fit: "填充",
    zoom: "缩放",
    typography: "排版",
    content: "内容",
    link: "去向",
    items: "条目",
    playback: "播放",
    visibility: "显示",
  };
  const summary = sharedCapabilities
    .map((capability) => labels[capability] ?? capability)
    .slice(0, 3)
    .join("、");
  return `${summary || "共享属性"}双端共用`;
}

function getInspectorContentFieldKeys(moduleType: string, nodeId: string) {
  const editableObject = getContentTemplateEditableObject(moduleType, nodeId);
  if (
    editableObject &&
    ["text", "action"].includes(editableObject.kind) &&
    editableObject.contentFieldKeys.includes(nodeId)
  ) {
    return [nodeId] as const;
  }
  return getContentTemplateEditableFieldKeys(moduleType, nodeId);
}

function findInspectorFieldTarget(
  container: HTMLElement | null,
  fieldKeys: readonly string[],
  device: "desktop" | "mobile",
  preferMedia: boolean,
) {
  if (!container) return undefined;
  const candidates = fieldKeys.flatMap((fieldKey) => {
    const field = container.querySelector<HTMLElement>(
      `[data-inspector-field="${CSS.escape(fieldKey)}"]`,
    );
    return field ? [field] : [];
  });
  if (!preferMedia) return candidates[0];
  const mediaCandidates = candidates.filter((field) =>
    Boolean(field.querySelector("[data-media-field]")),
  );
  return mediaCandidates.find((field) => field.dataset.inspectorDevice === device) ??
    mediaCandidates.find((field) => field.dataset.selectedMediaField === "true") ??
    mediaCandidates[0] ??
    candidates[0];
}

const CONTENT_TASK_GROUP_ORDER: InspectorTaskGroup[] = [
  "media",
  "content",
  "product",
  "link",
  "composition",
  "style",
  "feature",
];

const BUSINESS_TASK_GROUP_ORDER: InspectorTaskGroup[] = [
  "product",
  "media",
  "content",
  "link",
  "composition",
  "style",
  "feature",
];

const TASK_GROUP_ORDER_BY_PRIMARY: Record<string, InspectorTaskGroup[]> = {
  media: CONTENT_TASK_GROUP_ORDER,
  product: BUSINESS_TASK_GROUP_ORDER,
  category: BUSINESS_TASK_GROUP_ORDER,
  structured: ["feature", "content", "media", "link", "composition", "style", "product"],
  text: ["content", "media", "link", "composition", "style", "feature", "product"],
  action: ["link", "content", "media", "composition", "style", "feature", "product"],
};

const TASK_GROUP_META: Record<
  InspectorTaskGroup,
  { label: string }
> = {
  media: {
    label: "内容 · 图片",
  },
  content: {
    label: "内容 · 文字",
  },
  product: {
    label: "内容 · 商品",
  },
  link: {
    label: "交互",
  },
  composition: {
    label: "布局",
  },
  style: {
    label: "样式",
  },
  feature: {
    label: "高级设置",
  },
};

const PROPERTY_LEVEL_BY_TASK_GROUP: Record<InspectorTaskGroup, InspectorPropertyLevel> = {
  media: "content",
  content: "content",
  product: "content",
  link: "interaction",
  composition: "layout",
  style: "style",
  feature: "advanced",
};

function getPanelMode(
  group: InspectorTaskGroup,
): Exclude<InspectorPrimaryMode, "quick"> {
  return group === "composition" || group === "style" ? "design" : "content";
}

function getTaskGroup(
  field: FieldDef,
  layer: InspectorLayer,
): InspectorTaskGroup {
  if (layer === "feature") {
    return "feature";
  }
  if (layer === "product") {
    return "product";
  }
  if (
    field.control === "media" ||
    field.control === "video" ||
    layer === "media"
  ) {
    return "media";
  }
  if (field.control === "linkTarget" || layer === "interaction") {
    return "link";
  }
  if (layer === "layout") {
    return "composition";
  }
  if (layer === "style") {
    return "style";
  }
  return "content";
}

export default function SchemaInspectorPanel({
  schema,
  hasUnsavedChanges,
  saving,
  publishIssues,
  templateDesignEnabled = true,
  validationStatus,
  onRetryValidation,
  onOpenPageSettings,
}: SchemaInspectorPanelProps) {
  const { modal } = AntdApp.useApp();
  const editor = useInspectorModuleEditor();
  const [activePanelMode, setActivePanelMode] =
    useState<InspectorPrimaryMode>("content");
  const inspectorScrollRef = useRef<HTMLDivElement>(null);
  const panelScrollPositionsRef = useRef<Record<InspectorPrimaryMode, number>>({
    content: 0,
    design: 0,
  });
  const pendingPanelScrollRef = useRef<{
    mode: InspectorPrimaryMode;
    top: number;
  } | null>(null);
  const suppressSelectionAutoScrollRef = useRef<InspectorPrimaryMode | null>(null);
  const dispatch = useHomepagePuck((state) => state.dispatch);
  const appData = useHomepagePuck((state) => state.appState.data);
  const viewports = useHomepagePuck((state) => state.appState.ui.viewports);
  const visualSelection = useVisualEditorSession((state) => state.selection);
  const contentActionRequest = useVisualEditorSession((state) => state.contentActionRequest);
  const selectVisualNode = useVisualEditorSession((state) => state.selectNode);
  const clearVisualNode = useVisualEditorSession((state) => state.clearNode);
  const setVisualPanelMode = useVisualEditorSession((state) => state.setPanelMode);
  const visualPanelMode = useVisualEditorSession((state) => state.panelMode);
  const visualWorkspace = useVisualEditorSession((state) => state.workspace);
  const editorBlockId = editor?.props.id;

  useEffect(() => {
    if (visualWorkspace !== "page") return;
    clearVisualNode();
    panelScrollPositionsRef.current = { content: 0, design: 0 };
    suppressSelectionAutoScrollRef.current = null;
    setActivePanelMode("content");
    setVisualPanelMode("content");
    window.requestAnimationFrame(() => {
      inspectorScrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
    });
  }, [clearVisualNode, editor?.moduleType, editorBlockId, setVisualPanelMode, visualWorkspace]);

  useEffect(() => {
    if (visualWorkspace !== "page") return;
    if (visualPanelMode !== activePanelMode) setActivePanelMode(visualPanelMode);
  }, [activePanelMode, visualPanelMode, visualWorkspace]);

  useEffect(() => {
    if (visualWorkspace !== "page") return;
    if (templateDesignEnabled) return;
    if (activePanelMode !== "content") setActivePanelMode("content");
    if (visualPanelMode !== "content") setVisualPanelMode("content");
  }, [activePanelMode, setVisualPanelMode, templateDesignEnabled, visualPanelMode, visualWorkspace]);

  useLayoutEffect(() => {
    const pending = pendingPanelScrollRef.current;
    if (!pending || pending.mode !== activePanelMode) return;
    const restoreScroll = () => {
      inspectorScrollRef.current?.scrollTo({ top: pending.top, behavior: "auto" });
    };
    restoreScroll();
    pendingPanelScrollRef.current = null;
    // 对象导航与小画布会在页签提交后的下一帧完成尺寸同步；届时再复核一次，
    // 避免首次 scrollTo 被尚未稳定的可滚动高度夹回顶部。
    const frameId = window.requestAnimationFrame(restoreScroll);
    return () => window.cancelAnimationFrame(frameId);
  }, [activePanelMode]);

  useEffect(() => {
    if (visualWorkspace !== "page") return;
    if (!editorBlockId || !visualSelection || visualSelection.blockId !== editorBlockId) return;
    const editableObject = getContentTemplateEditableObject(
      editor?.moduleType ?? "",
      visualSelection.nodeId,
    );
    const roles = getContentTemplateContract(editor?.moduleType ?? "")?.roles ?? [];
    if (!editableObject || !isEditableObjectAvailableOnDevice(
      editableObject,
      roles,
      editor?.device ?? "desktop",
    )) {
      clearVisualNode(editorBlockId);
    }
  }, [clearVisualNode, editor?.device, editor?.moduleType, editorBlockId, visualSelection, visualWorkspace]);

  useEffect(() => {
    if (visualWorkspace !== "page") return;
    if (!editorBlockId || !visualSelection || visualSelection.blockId !== editorBlockId) return;
    const fieldKeys = getInspectorContentFieldKeys(
      editor?.moduleType ?? "",
      visualSelection.nodeId,
    );
    if (fieldKeys.length === 0 || activePanelMode !== "content") return;
    if (suppressSelectionAutoScrollRef.current === activePanelMode) {
      suppressSelectionAutoScrollRef.current = null;
      return;
    }
    const renderFrame = window.requestAnimationFrame(() => {
      const target = findInspectorFieldTarget(
        inspectorScrollRef.current,
        fieldKeys,
        editor.device,
        visualSelection.kind === "media",
      );
      target?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      if (visualSelection.kind === "text" || visualSelection.kind === "action") {
        target?.querySelector<HTMLElement>("input, textarea, select, button, [tabindex]")?.focus();
      }
    });
    return () => {
      window.cancelAnimationFrame(renderFrame);
    };
  }, [activePanelMode, editor?.device, editor?.moduleType, editorBlockId, visualSelection, visualWorkspace]);

  useEffect(() => {
    if (visualWorkspace !== "page") return;
    if (!editorBlockId || !contentActionRequest ||
      contentActionRequest.blockId !== editorBlockId || activePanelMode !== "content") return;
    const fieldKeys = getInspectorContentFieldKeys(
      editor?.moduleType ?? "",
      contentActionRequest.nodeId,
    );
    const renderFrame = window.requestAnimationFrame(() => {
      const target = findInspectorFieldTarget(
        inspectorScrollRef.current,
        fieldKeys,
        editor.device,
        contentActionRequest.kind === "media",
      );
      target?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      if (contentActionRequest.kind === "media") {
        target?.querySelector<HTMLElement>("[data-media-field]")?.focus();
      }
    });
    return () => window.cancelAnimationFrame(renderFrame);
  }, [activePanelMode, contentActionRequest, editor?.device, editor?.moduleType, editorBlockId, visualWorkspace]);

  useEffect(() => {
    if (visualWorkspace !== "page") return;
    if (activePanelMode !== "design" || !editorBlockId || !visualSelection ||
      visualSelection.blockId !== editorBlockId) return;
    const editableObject = getContentTemplateEditableObject(
      editor?.moduleType ?? "",
      visualSelection.nodeId,
    );
    if (editableObject && !hasEditableDesign(editableObject)) {
      setActivePanelMode("content");
      setVisualPanelMode("content");
    }
  }, [activePanelMode, editor?.moduleType, editorBlockId, setVisualPanelMode, visualSelection, visualWorkspace]);

  const ctx: InspectorContext | null = editor
    ? {
        props: editor.props,
        device: editor.device,
        viewportWidth: viewports.current.width,
      }
    : null;

  if (!editor || !ctx) return null;

  const content = appData.content as Array<{
    type: string;
    props: PuckProps;
  }>;

  const visibleFields = schema.sections
    .filter((section) => !section.visibleWhen || section.visibleWhen(ctx))
    .flatMap((section) =>
      section.fields
        .filter(
          (field) =>
            field.key !== "moduleName" &&
            isFieldVisible(field, ctx) &&
            (!field.device ||
              field.device === "shared" ||
              field.device === editor.device),
        )
        .map((field) => ({
          sectionId: section.id,
          layer: section.layer,
          field,
        })),
    );

  // 模块级分组沿用 Schema；对象级字段与能力只消费生成合同的显式映射。
  const contentTemplateContract = getContentTemplateContract(editor.moduleType);
  const primaryTask = contentTemplateContract?.editorCapabilities.primaryTask;
  const taskGroupOrder = primaryTask
    ? TASK_GROUP_ORDER_BY_PRIMARY[primaryTask]
    : visibleFields.some(
          (entry) => getTaskGroup(entry.field, entry.layer) === "product",
        )
      ? BUSINESS_TASK_GROUP_ORDER
      : CONTENT_TASK_GROUP_ORDER;
  const contractLayoutOverrides =
    contentTemplateContract?.editorCapabilities.layoutOverrides;
  const currentVisualSelection =
    visualSelection?.blockId === editor.props.id ? visualSelection : null;
  const editableObjects = contentTemplateContract?.editorCapabilities.editableObjects ?? [];
  const currentEditableObject = currentVisualSelection
    ? getContentTemplateEditableObject(editor.moduleType, currentVisualSelection.nodeId)
    : undefined;
  const selectedContentFieldKeys = new Set(
    currentVisualSelection
      ? getInspectorContentFieldKeys(editor.moduleType, currentVisualSelection.nodeId)
      : [],
  );
  const selectedOverrideNodeId = currentEditableObject
    ? [
        currentVisualSelection?.nodeId,
        currentEditableObject.roleId,
        ...(currentEditableObject.nodeIds ?? []),
      ].find((nodeId) =>
        Boolean(nodeId) && Boolean(
          contractLayoutOverrides?.slots?.some((slot) => slot.roleId === nodeId) ||
          contractLayoutOverrides?.textRoles?.some((role) => role.roleId === nodeId),
        ),
      )
    : undefined;
  const selectedSlot = contractLayoutOverrides?.slots?.find(
    (slot) => slot.roleId === selectedOverrideNodeId,
  );
  const selectedTextRole = contractLayoutOverrides?.textRoles?.find(
    (role) => role.roleId === selectedOverrideNodeId,
  );
  const hasInstanceDesignControls = Boolean(
    contractLayoutOverrides &&
      ((contractLayoutOverrides.slots?.length ?? 0) > 0 ||
        (contractLayoutOverrides.textRoles?.length ?? 0) > 0 ||
        (contractLayoutOverrides.framePresets?.length ?? 0) > 0 ||
        (contractLayoutOverrides.frameRatioPresets?.length ?? 0) > 0 ||
        (contractLayoutOverrides.compositionPresets?.length ?? 0) > 0),
  );
  const taskGroups = taskGroupOrder.map((group) => ({
    group,
    entries: visibleFields
      .filter((entry) => getTaskGroup(entry.field, entry.layer) === group)
      .map<VisibleFieldEntry>(({ layer: _layer, ...entry }) => entry),
  })).filter((item) => item.entries.length > 0);
  if (
    hasInstanceDesignControls &&
    !taskGroups.some(({ group }) => group === "composition")
  ) {
    taskGroups.push({ group: "composition", entries: [] });
  }
  if (
    contentTemplateContract &&
    !taskGroups.some(({ group }) => group === "style")
  ) {
    taskGroups.push({ group: "style", entries: [] });
  }
  const contentTaskGroups = taskGroups.filter(
    ({ group }) => getPanelMode(group) === "content",
  );
  const visuallyManagedPresetValues = new Set([
    ...(contractLayoutOverrides?.framePresets ?? []),
    ...(contractLayoutOverrides?.compositionPresets ?? []),
    ...(contractLayoutOverrides?.frameRatioPresets ?? []).map((value) => value.replace("/", ":")),
    ...(contractLayoutOverrides?.slots ?? []).flatMap((slot) =>
      (slot.ratioPresets ?? []).map((value) => value.replace("/", ":")),
    ),
  ]);
  const isVisuallyManagedPreset = (field: FieldDef) => {
    if (field.control !== "segmented" || field.options.length < 2) return false;
    return field.options.every((option) =>
      visuallyManagedPresetValues.has(option.value.replace("/", ":")),
    );
  };
  const designTaskGroups = taskGroups.filter(
    ({ group }) => getPanelMode(group) === "design",
  ).map(({ group, entries }) => ({
    group,
    entries: entries.filter(({ field }) => !isVisuallyManagedPreset(field)),
  }));
  const selectedContentTaskGroups = currentEditableObject
    ? taskGroupOrder
        .map((group) => ({
          group,
          entries: visibleFields
            .filter(({ field, layer }) =>
              selectedContentFieldKeys.has(field.key) &&
              getTaskGroup(field, layer) === group &&
              getPanelMode(group) === "content",
            )
            .map<VisibleFieldEntry>(({ layer: _layer, ...entry }) => entry),
        }))
        .filter((item) => item.entries.length > 0)
    : contentTaskGroups;
  const selectedDesignGroup = designTaskGroups.find(
    ({ group }) => group === "composition",
  );
  const selectedSupportsAppearance = Boolean(
    currentEditableObject &&
      ["media", "video", "product", "collection"].includes(currentEditableObject.kind),
  );
  // 页面装修默认展示完整任务组；只有运营人员在属性面板内显式选择对象时
  // 才提供对象高亮与媒体增强语境。画布点击始终保持模块级上下文。
  const activeTaskGroups = activePanelMode === "design"
    ? currentVisualSelection
      ? selectedTextRole
        ? [{ group: "style" as const, entries: [] }]
        : [
            ...(selectedDesignGroup ? [{ ...selectedDesignGroup, entries: [] }] : []),
            ...(selectedSupportsAppearance
              ? [{ group: "style" as const, entries: [] }]
              : []),
          ]
      : designTaskGroups
    : contentTaskGroups;
  const layoutTextRoleIds = new Set(
    (contractLayoutOverrides?.textRoles ?? []).map((role) => role.roleId),
  );
  const visualObjects = editableObjects
    .filter((object) => isEditableObjectAvailableOnDevice(
      object,
      contentTemplateContract?.roles ?? [],
      editor.device,
    ))
    .flatMap((object) => {
      const editableTextNodeIds = object.kind === "text" || object.kind === "action"
        ? (object.nodeIds ?? [object.roleId]).filter((nodeId) =>
            layoutTextRoleIds.has(nodeId),
          )
        : [];
      const nodeIds = editableTextNodeIds.length > 0
        ? editableTextNodeIds
        : [object.roleId];
      return nodeIds.map((nodeId) => ({
        nodeId,
        kind: toVisualNodeKind(object.kind),
        object,
      }));
    });
  const selectedVisualObject = currentVisualSelection
    ? visualObjects.find((object) => object.nodeId === currentVisualSelection.nodeId) ??
      visualObjects.find((object) => object.object === currentEditableObject)
    : undefined;
  const actionVisualObject = visualObjects.find((object) => object.object.kind === "action");
  const mediaTextVisualObject = visualObjects.find((object) => object.object.kind === "text");
  const selectedMediaFields = selectedContentTaskGroups
    .flatMap(({ entries }) => entries)
    .map(({ field }) => field)
    .filter((field) => field.control === "media");
  const selectedMediaField = selectedMediaFields.find((field) => field.device === editor.device) ??
    selectedMediaFields.find((field) => field.key === selectedSlot?.fieldKey) ??
    selectedMediaFields.find((field) => field.key === currentVisualSelection?.nodeId) ??
    selectedMediaFields[0];
  const selectedMediaRatio = selectedMediaField?.control === "media"
    ? selectedMediaField.spec.ratio
    : "默认";
  const selectedMediaHasVisibility = Boolean(
    currentEditableObject &&
      (currentEditableObject.kind === "media" || currentEditableObject.kind === "video"),
  );
  const currentObjectCanEditDesign = templateDesignEnabled && (currentEditableObject
    ? hasEditableDesign(currentEditableObject) && Boolean(selectedSlot || selectedTextRole)
    : hasInstanceDesignControls || designTaskGroups.some(({ entries }) => entries.length > 0));
  const responsiveStates = getInspectorResponsiveStates({
    instanceOverrides: editor.props.__instanceOverrides,
    selectedNodeId: selectedOverrideNodeId ?? null,
    supportsFocus: currentEditableObject?.capabilities.includes("focus") ?? false,
  });
  const thumbnailFieldKey = currentEditableObject &&
    (currentEditableObject.kind === "media" || currentEditableObject.kind === "video")
      ? selectedSlot?.fieldKey ?? currentEditableObject.contentFieldKeys.find(
          (fieldKey) => fieldKey !== currentEditableObject.altFieldKey,
        )
      : undefined;
  const selectedThumbnailValue = thumbnailFieldKey
    ? editor.props[thumbnailFieldKey]
    : undefined;
  const selectedThumbnailUrl = typeof selectedThumbnailValue === "string"
    ? selectedThumbnailValue
    : undefined;
  const schemaDefaults = schema.defaults ?? {};
  const currentPublishIssues = getInspectorPublishIssues(publishIssues, editor.props.id);
  const currentPublishErrorCount = currentPublishIssues.filter(
    (issue) => issue.severity === "error",
  ).length;
  const currentPublishWarningCount = currentPublishIssues.filter(
    (issue) => issue.severity === "warning",
  ).length;
  const resolveIssueFieldKey = (issue: PublishValidationIssue) => {
    const rawFieldKey = issue.field ?? issue.path?.split(".").pop();
    if (!rawFieldKey) return undefined;
    if (visibleFields.some(({ field }) => field.key === rawFieldKey)) return rawFieldKey;
    const linkField = visibleFields.find(({ field }) => {
      if (field.control !== "linkTarget") return false;
      const prefix = field.keyPrefix ?? "";
      const candidateKeys = prefix
        ? ["TargetType", "ProductCode", "ProductId", "CategorySlug", "LinkUrl"]
            .map((suffix) => `${prefix}${suffix}`)
        : ["targetType", "productCode", "productId", "categorySlug", "linkUrl"];
      return candidateKeys.includes(rawFieldKey);
    });
    return linkField?.field.key ?? rawFieldKey;
  };
  const commitPanelMode = (panelMode: InspectorPrimaryMode) => {
    const targetScrollTop = panelScrollPositionsRef.current[panelMode];
    if (panelMode !== activePanelMode && inspectorScrollRef.current) {
      panelScrollPositionsRef.current[activePanelMode] =
        inspectorScrollRef.current.scrollTop;
      pendingPanelScrollRef.current = { mode: panelMode, top: targetScrollTop };
      // 手动切换页签时以该页签自己的位置为准，不能再被选中字段的自动定位覆盖。
      suppressSelectionAutoScrollRef.current = panelMode;
    }
    setActivePanelMode(panelMode);
    setVisualPanelMode(panelMode);
  };

  const focusPublishIssue = (issue: PublishValidationIssue) => {
    if (isPagePublishIssue(issue)) {
      onOpenPageSettings?.(issue.path ?? issue.field);
      return;
    }
    const fieldKey = resolveIssueFieldKey(issue);
    if (!fieldKey) return;
    commitPanelMode("content");
    const focusField = () => {
      const field = inspectorScrollRef.current?.querySelector<HTMLElement>(
        `[data-inspector-field="${CSS.escape(fieldKey)}"]`,
      );
      if (!field) return;
      field.scrollIntoView({ block: "center", behavior: "smooth" });
      field.querySelector<HTMLElement>("input, textarea, select, button, [tabindex]")?.focus();
    };
    window.requestAnimationFrame(() => window.requestAnimationFrame(focusField));
  };

  const activatePanelMode = (panelMode: InspectorPrimaryMode) => {
    if (!templateDesignEnabled && panelMode === "design") return;
    if (panelMode !== "design" || activePanelMode === "design") {
      commitPanelMode(panelMode);
      return;
    }
    const signatures = getSharedTemplateDesignSignatures(content, editor.moduleType);
    if (signatures.size <= 1) {
      commitPanelMode("design");
      return;
    }
    modal.confirm({
      title: "统一本页同类模板设计？",
      content: `本页的“${getModuleDisplayName(editor.moduleType, editor.props)}”存在不同设计。进入模板编辑会以当前选中模块为基准，统一全部同类模块；各自图片、文字、链接和业务内容保持不变。`,
      okText: "统一并进入",
      cancelText: "取消",
      onOk: () => {
        const selectedDesign = extractContentTemplateLayoutData(
          editor.moduleType,
          editor.props,
        );
        dispatch({
          type: "setData",
          data: {
            ...appData,
            content: applySharedTemplateDesignPatch(content, editor.moduleType, {
              __instanceOverrides: selectedDesign,
            }),
          },
          recordHistory: true,
        });
        commitPanelMode("design");
      },
      onCancel: () => commitPanelMode("content"),
    });
  };

  const renderTaskGroup = (item: {
    group: InspectorTaskGroup;
    entries: VisibleFieldEntry[];
  }) => {
    const { group, entries } = item;
    const meta = TASK_GROUP_META[group];
    const groupTitle = group === "composition"
      ? currentVisualSelection
        ? "布局 · 对象"
        : "布局 · 模块"
      : group === "style" && currentVisualSelection
        ? selectedTextRole ? "样式 · 文字" : "样式 · 对象"
      : schema.groupTitles?.[group] ?? meta.label;
    const rendersInstanceOverrides = group === "composition" || (
      group === "style" && Boolean(
        !currentVisualSelection || selectedTextRole || selectedSupportsAppearance,
      )
    );
    const isSelectedMediaTask = Boolean(
      currentVisualSelection && group === "media" &&
        (currentEditableObject?.kind === "media" || currentEditableObject?.kind === "video"),
    );
    return (
      <section
        key={group}
        id={`inspector-task-section-${group}`}
        className="homepage-editor__task-group"
        data-task-group={group}
        data-property-level={PROPERTY_LEVEL_BY_TASK_GROUP[group]}
        data-selected-task={activePanelMode === "design" && isSelectedMediaTask ? "media" : undefined}
      >
        {activePanelMode === "design" && rendersInstanceOverrides && currentVisualSelection ? null : (
          <header className="homepage-editor__task-panel-header">
            <h3>{groupTitle}</h3>
          </header>
        )}
        <div className="homepage-editor__task-panel-body">
          {group === "content" ? (
            <InstanceOverridesPanel
              moduleType={editor.moduleType}
              props={editor.props}
              updateFromCurrent={editor.updateFromCurrent}
              updateHistoryTransaction={editor.updateHistoryTransaction}
              historyTransactionPending={editor.historyTransactionPending}
              scopes={["text"]}
              embedded
              viewport={editor.device}
              contentTextVisibilityOnly
            />
          ) : null}
          {group === "link" ? (
            <InstanceOverridesPanel
              moduleType={editor.moduleType}
              props={editor.props}
              updateFromCurrent={editor.updateFromCurrent}
              updateHistoryTransaction={editor.updateHistoryTransaction}
              historyTransactionPending={editor.historyTransactionPending}
              scopes={["text"]}
              embedded
              viewport={editor.device}
              contentActionVisibilityOnly
            />
          ) : null}
          {rendersInstanceOverrides ? (
            <>
              <InstanceOverridesPanel
                moduleType={editor.moduleType}
                props={editor.props}
                updateFromCurrent={editor.updateFromCurrent}
                updateHistoryTransaction={editor.updateHistoryTransaction}
                historyTransactionPending={editor.historyTransactionPending}
                scopes={
                  group === "style"
                    ? selectedTextRole
                      ? ["text"]
                      : currentVisualSelection
                        ? ["appearance"]
                        : ["surface"]
                    : selectedSlot
                    ? ["slots"]
                    : ["layout"]
                }
                selectedNodeId={selectedOverrideNodeId}
                resetAllDesign={group === "composition" && !currentVisualSelection}
                embedded
                viewport={editor.device}
              />
              {!currentVisualSelection && entries.length > 0 ? (
                <>
                  {entries
                    .filter(({ field }) => field.control !== "color")
                    .map((entry, fieldIndex) => (
                      <div
                        key={`${entry.sectionId}-${entry.field.key}-${fieldIndex}`}
                        className="homepage-editor__task-field"
                        data-inspector-field={entry.field.key}
                      >
                        <FieldRenderer
                          def={entry.field}
                          ctx={ctx}
                          update={editor.update}
                          moduleType={editor.moduleType}
                        />
                      </div>
                    ))}
                  {entries.some(({ field }) => field.control === "color") ? (
                    <InspectorDisclosure label="自定义颜色">
                      <div className="homepage-editor__advanced-settings-grid">
                        {entries
                          .filter(({ field }) => field.control === "color")
                          .map((entry, fieldIndex) => (
                            <div
                              key={`${entry.sectionId}-${entry.field.key}-advanced-${fieldIndex}`}
                              className="homepage-editor__task-field"
                              data-inspector-field={entry.field.key}
                            >
                              <FieldRenderer
                                def={entry.field}
                                ctx={ctx}
                                update={editor.update}
                                moduleType={editor.moduleType}
                              />
                            </div>
                          ))}
                      </div>
                    </InspectorDisclosure>
                  ) : null}
                </>
              ) : null}
            </>
          ) : (
            <>
              {entries.map((entry, fieldIndex) => {
                const isSelectedField = selectedContentFieldKeys.has(entry.field.key);
                const fieldIsOverridden = Object.prototype.hasOwnProperty.call(
                  schemaDefaults,
                  entry.field.key,
                ) && JSON.stringify(editor.props[entry.field.key]) !==
                  JSON.stringify(schemaDefaults[entry.field.key]);
                const isMediaControlField = entry.field.control === "media";
                const isSelectedMediaControlField = Boolean(
                  isSelectedMediaTask && selectedMediaField?.key === entry.field.key,
                );
                const isSelectedMediaAltField = Boolean(
                  isSelectedMediaTask && currentEditableObject?.altFieldKey === entry.field.key,
                );
                const mediaSlotForField = isMediaControlField
                  ? contractLayoutOverrides?.slots?.find((slot) =>
                      slot.fieldKey === entry.field.key || slot.roleId === entry.field.key,
                    )
                  : undefined;
                return (
                  <div
                    key={`${entry.sectionId}-${entry.field.key}-${fieldIndex}`}
                    className={`homepage-editor__task-field${isSelectedField ? " is-visual-selected" : ""}${fieldIsOverridden ? " has-field-reset" : ""}`}
                    data-inspector-field={entry.field.key}
                    data-inspector-device={entry.field.device ?? "shared"}
                    data-selected-media-field={isSelectedMediaControlField || isSelectedMediaAltField ? "true" : undefined}
                  >
                    <FieldRenderer
                      def={entry.field}
                      ctx={ctx}
                      update={editor.update}
                      moduleType={editor.moduleType}
                      taskPresentation={isMediaControlField ? "media" : undefined}
                      textRows={isSelectedMediaAltField ? 3 : undefined}
                    />
                  {isMediaControlField && mediaSlotForField ? (
                    <InstanceOverridesPanel
                      moduleType={editor.moduleType}
                      props={editor.props}
                      updateFromCurrent={editor.updateFromCurrent}
                      updateHistoryTransaction={editor.updateHistoryTransaction}
                      historyTransactionPending={editor.historyTransactionPending}
                      scopes={["slots"]}
                      selectedNodeId={mediaSlotForField.roleId}
                      embedded
                      viewport={editor.device}
                      contentMediaOnly
                    />
                  ) : null}
                  {fieldIsOverridden ? (
                    <button
                      type="button"
                      className="homepage-editor__field-reset"
                      aria-label={`恢复${entry.field.label}默认`}
                      title={`恢复${entry.field.label}默认`}
                      onClick={() =>
                        editor.update({
                          [entry.field.key]: structuredClone(schemaDefaults[entry.field.key]),
                        })
                      }
                    >
                      <UndoOutlined aria-hidden="true" />
                    </button>
                  ) : null}
                  {isSelectedMediaAltField ? (
                    <>
                      <div className="homepage-editor__media-click-behavior">
                        <span>点击行为</span>
                        {actionVisualObject ? (
                          <button
                            type="button"
                            onClick={() => selectVisualNode({
                              blockId: String(editor.props.id ?? ""),
                              moduleType: editor.moduleType,
                              nodeId: actionVisualObject.nodeId,
                              kind: actionVisualObject.kind,
                            })}
                          >
                            由行动入口控制
                            <span aria-hidden="true">›</span>
                          </button>
                        ) : (
                          <span>无</span>
                        )}
                      </div>
                      {selectedMediaHasVisibility && selectedSlot ? (
                        <InstanceOverridesPanel
                          moduleType={editor.moduleType}
                          props={editor.props}
                          updateFromCurrent={editor.updateFromCurrent}
                          updateHistoryTransaction={editor.updateHistoryTransaction}
                          historyTransactionPending={editor.historyTransactionPending}
                          scopes={["slots"]}
                          selectedNodeId={selectedOverrideNodeId}
                          embedded
                          viewport={editor.device}
                          contentMediaOnly
                          contentMediaVisibilityOnly
                        />
                      ) : null}
                      {templateDesignEnabled ? (
                      <div className="homepage-editor__media-setting-links" aria-label="图片相关设置">
                        <button type="button" onClick={() => activatePanelMode("design")}>
                          <span>布局与比例</span>
                          <small>{selectedMediaRatio} · 100%</small>
                          <b aria-hidden="true">›</b>
                        </button>
                        <button
                          type="button"
                          disabled={!mediaTextVisualObject}
                          onClick={() => {
                            if (!mediaTextVisualObject) return;
                            selectVisualNode({
                              blockId: String(editor.props.id ?? ""),
                              moduleType: editor.moduleType,
                              nodeId: mediaTextVisualObject.nodeId,
                              kind: mediaTextVisualObject.kind,
                            });
                            activatePanelMode("design");
                          }}
                        >
                          <span>文字与颜色</span>
                          <small>{mediaTextVisualObject ? "编辑文案对象" : "不适用"}</small>
                          <b aria-hidden="true">›</b>
                        </button>
                        <button type="button" onClick={() => activatePanelMode("design")}>
                          <span>模板专属设置</span>
                          <small>默认</small>
                          <b aria-hidden="true">›</b>
                        </button>
                        <button type="button" onClick={() => activatePanelMode("design")}>
                          <span>高级设置</span>
                          <small>默认</small>
                          <b aria-hidden="true">›</b>
                        </button>
                      </div>
                      ) : null}
                    </>
                  ) : null}
                </div>
                );
              })}
            </>
          )}
        </div>
      </section>
    );
  };

  return (
    <section
      className="homepage-editor__inspector"
      data-inspector-root="visual-properties"
      data-active-device={editor.device}
      data-module-type={editor.moduleType}
      data-panel-mode={activePanelMode}
      aria-label="属性面板"
    >
      {templateDesignEnabled ? (
        <InspectorModePortal
          activeMode={activePanelMode}
          designDisabled={!currentObjectCanEditDesign}
          onChange={activatePanelMode}
        />
      ) : null}

      <InspectorObjectContext
          moduleLabel={schema.displayName}
          blockId={String(editor.props.id ?? "")}
          moduleType={editor.moduleType}
          mode={activePanelMode}
          selectedObjectId={selectedVisualObject?.nodeId ?? null}
          objects={visualObjects.map((item) => ({
            id: item.nodeId,
            label: VISUAL_NODE_LABELS[item.nodeId] ?? getTemplateContractNodeLabel(item.nodeId),
            kind: item.kind,
            thumbnailUrl: item.object.contentFieldKeys
              .map((fieldKey) => editor.props[fieldKey])
              .find((value): value is string => typeof value === "string" && value.length > 0),
          }))}
          objectKind={currentEditableObject?.kind ?? "module"}
          thumbnailUrl={selectedThumbnailUrl}
          activeDevice={editor.device}
          desktopState={responsiveStates.desktop}
          mobileState={responsiveStates.mobile}
          sharedDesignLabel={getSharedDesignLabel(currentEditableObject)}
          onSelect={(nodeId) => {
            if (!nodeId) {
              clearVisualNode(String(editor.props.id ?? ""));
              return;
            }
            const item = visualObjects.find((object) => object.nodeId === nodeId);
            if (!item) return;
            selectVisualNode({
              blockId: String(editor.props.id ?? ""),
              moduleType: editor.moduleType,
              nodeId: item.nodeId,
              kind: item.kind,
            });
            if (activePanelMode === "design" && !hasEditableDesign(item.object)) {
              activatePanelMode("content");
            }
          }}
          onOpenPageSettings={() => onOpenPageSettings?.()}
      />

      <div
        ref={inspectorScrollRef}
        className="homepage-editor__inspector-scroll"
        data-inspector-scroll="main"
      >
        {activeTaskGroups.length > 1 ? (
          <nav className="homepage-editor__inspector-task-nav" aria-label="属性任务导航">
            {activeTaskGroups.map(({ group, entries }) => {
              const issueCount = currentPublishIssues.filter((issue) =>
                !isPagePublishIssue(issue)
                && Boolean(resolveIssueFieldKey(issue))
                && entries.some(({ field }) => field.key === resolveIssueFieldKey(issue)),
              ).length;
              return (
                <button
                  key={group}
                  type="button"
                  onClick={() => inspectorScrollRef.current
                    ?.querySelector<HTMLElement>(`#inspector-task-section-${group}`)
                    ?.scrollIntoView({ block: "start", behavior: "smooth" })}
                >
                  {TASK_GROUP_META[group].label.replace("内容 · ", "")}
                  {issueCount > 0 ? <b aria-label={`${issueCount} 项问题`}>{issueCount}</b> : null}
                </button>
              );
            })}
          </nav>
        ) : null}
        {activePanelMode === "design" && contentTemplateContract ? (
          <InspectorTemplateNavigator
            moduleLabel={schema.displayName}
            moduleType={editor.moduleType}
            blockId={String(editor.props.id ?? "")}
            objects={visualObjects.map((item) => ({
              id: item.nodeId,
              label: VISUAL_NODE_LABELS[item.nodeId] ?? getTemplateContractNodeLabel(item.nodeId),
              kind: item.kind,
              thumbnailUrl: item.object.contentFieldKeys
                .map((fieldKey) => editor.props[fieldKey])
                .find((value): value is string => typeof value === "string" && value.length > 0),
            }))}
            selectedObjectId={selectedVisualObject?.nodeId ?? null}
            activeDevice={editor.device}
            onSelect={(nodeId) => {
              const item = visualObjects.find((object) => object.nodeId === nodeId);
              if (!item) return;
              selectVisualNode({
                blockId: String(editor.props.id ?? ""),
                moduleType: editor.moduleType,
                nodeId: item.nodeId,
                kind: item.kind,
              });
            }}
          />
        ) : null}
        <div
          id={`inspector-panel-${activePanelMode}`}
          className="homepage-editor__panel-mode-content"
          role="tabpanel"
          aria-labelledby={templateDesignEnabled ? `inspector-panel-tab-${activePanelMode}` : undefined}
          aria-label={templateDesignEnabled ? undefined : "页面实例内容"}
        >
          {activeTaskGroups.length > 0 ? (
            <>
              {activeTaskGroups.map(renderTaskGroup)}
            </>
          ) : (
            <div className="homepage-editor__object-empty-state" role="status">
              <strong>{activePanelMode === "content" ? "当前模块没有可编辑内容" : "当前对象没有可编辑设计项"}</strong>
              <span>
                {templateDesignEnabled && activePanelMode === "content" && currentObjectCanEditDesign
                  ? "请在编辑器顶部切换到“模板编辑”调整位置、大小和画面。"
                  : activePanelMode === "content"
                    ? "当前设备或条件下没有适用字段。"
                    : "请切换其他编辑对象或返回模块级。"}
              </span>
              {activePanelMode === "design" && currentVisualSelection ? (
                <button
                  type="button"
                  onClick={() => clearVisualNode(String(editor.props.id ?? ""))}
                >
                  返回模块级
                </button>
              ) : null}
            </div>
          )}
        </div>
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
                        focusPublishIssue(issue);
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
