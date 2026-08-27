/**
 * SchemaInspectorPanel.tsx — 由模块 Schema 驱动的统一编辑面板。
 *
 * 结构：TopBar（当前实例）→
 *       当前模块发布问题 → 连续任务分区（按内容/业务对象任务调整顺序，全部直接展示）→
 *       FooterBar（手动保存整页草稿）。
 * 与 InspectorPanel 的三级分派配合：仅在 registry 命中时渲染。
 */
import { App as AntdApp } from "antd";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ROOT_ZONE,
  useHomepagePuck,
} from "../../pages/admin/HomepageConfig/editor-store";
import {
  getModuleDisplayName,
} from "../../pages/admin/HomepageConfig/editor-utils";
import InspectorTopBar from "./InspectorTopBar";
import InspectorObjectContext, {
  getInspectorResponsiveStates,
} from "./InspectorObjectContext";
import InspectorDisclosure from "./InspectorDisclosure";
import FieldRenderer, { isFieldVisible } from "./FieldRenderer";
import InstanceOverridesPanel from "./InstanceOverridesPanel";
import InspectorPrimaryTabs, {
  type InspectorPrimaryMode,
} from "./InspectorPrimaryTabs";
import { useVisualEditorSession } from "../visual-editor/visualEditorSession";
import { useInspectorModuleEditor } from "./useInspectorModuleEditor";
import type { PuckProps } from "../types";
import {
  getContentTemplateContract,
  getContentTemplateEditableFieldKeys,
  getContentTemplateEditableObject,
} from "../generated/contentTemplates.generated";
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
  onSaveAsTemplate: (type: string, props: PuckProps) => void;
  publishIssues: Array<{
    blockId?: string;
    message: string;
    severity: "error" | "warning" | "info";
    path?: string;
  }>;
  validationState: "checking" | "current" | "stale" | "error";
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

const OBJECT_TASK_GROUP_BY_KIND = {
  media: "media",
  video: "media",
  text: "content",
  action: "link",
  product: "product",
  collection: "product",
} as const satisfies Record<string, InspectorTaskGroup>;

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
    editableObject?.kind === "text" &&
    editableObject.contentFieldKeys.includes(nodeId)
  ) {
    return [nodeId] as const;
  }
  return getContentTemplateEditableFieldKeys(moduleType, nodeId);
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
  publishIssues,
  validationState,
  onSaveAsTemplate,
}: SchemaInspectorPanelProps) {
  const { message, modal } = AntdApp.useApp();
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
  const selectVisualNode = useVisualEditorSession((state) => state.selectNode);
  const clearVisualNode = useVisualEditorSession((state) => state.clearNode);
  const setVisualPanelMode = useVisualEditorSession((state) => state.setPanelMode);
  const visualPanelMode = useVisualEditorSession((state) => state.panelMode);
  const editorBlockId = editor?.props.id;

  useEffect(() => {
    panelScrollPositionsRef.current = { content: 0, design: 0 };
    suppressSelectionAutoScrollRef.current = null;
    setActivePanelMode("content");
    setVisualPanelMode("content");
    window.requestAnimationFrame(() => {
      inspectorScrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
    });
  }, [editor?.moduleType, editorBlockId, setVisualPanelMode]);

  useEffect(() => {
    if (visualPanelMode !== activePanelMode) setActivePanelMode(visualPanelMode);
  }, [activePanelMode, visualPanelMode]);

  useLayoutEffect(() => {
    const pending = pendingPanelScrollRef.current;
    if (!pending || pending.mode !== activePanelMode) return;
    inspectorScrollRef.current?.scrollTo({ top: pending.top, behavior: "auto" });
    pendingPanelScrollRef.current = null;
  }, [activePanelMode]);

  useEffect(() => {
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
  }, [clearVisualNode, editor?.device, editor?.moduleType, editorBlockId, visualSelection]);

  useEffect(() => {
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
      const target = fieldKeys
        .map((fieldKey) => document.querySelector<HTMLElement>(
          `[data-inspector-field="${CSS.escape(fieldKey)}"]`,
        ))
        .find(Boolean);
      target?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    return () => {
      window.cancelAnimationFrame(renderFrame);
    };
  }, [activePanelMode, editor?.moduleType, editorBlockId, visualSelection]);

  useEffect(() => {
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
  }, [activePanelMode, editor?.moduleType, editorBlockId, setVisualPanelMode, visualSelection]);

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
  const selectedContentEntries = currentEditableObject
    ? visibleFields
        .filter(({ field }) => selectedContentFieldKeys.has(field.key))
        .map<VisibleFieldEntry>(({ layer: _layer, ...entry }) => entry)
    : [];
  const selectedContentTaskGroups = currentEditableObject
    ? selectedContentEntries.length > 0
      ? [{
          group: OBJECT_TASK_GROUP_BY_KIND[currentEditableObject.kind],
          entries: selectedContentEntries,
        }]
      : []
    : contentTaskGroups;
  const selectedDesignGroup = designTaskGroups.find(
    ({ group }) => group === "composition",
  );
  const selectedSupportsAppearance = Boolean(
    currentEditableObject &&
      ["media", "video", "product", "collection"].includes(currentEditableObject.kind),
  );
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
    : selectedContentTaskGroups;
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
  const currentObjectCanEditDesign = currentEditableObject
    ? hasEditableDesign(currentEditableObject) && Boolean(selectedSlot || selectedTextRole)
    : hasInstanceDesignControls || designTaskGroups.some(({ entries }) => entries.length > 0);
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
  const selectedFieldScopes = currentEditableObject
    ? [...selectedContentFieldKeys].map(
        (fieldKey) => currentEditableObject.fieldScopes?.[fieldKey] ?? "shared",
      )
    : [];
  const hasSharedContent = selectedFieldScopes.includes("shared");
  const hasViewportContent = selectedFieldScopes.includes("viewport-specific");
  const selectedContentScopeLabel = hasViewportContent
    ? hasSharedContent
      ? `部分内容双端共用；其余字段作用于当前${editor.device === "mobile" ? "移动端" : "桌面端"}`
      : `内容字段作用于当前${editor.device === "mobile" ? "移动端" : "桌面端"}`
    : "内容字段双端共用";
  const schemaDefaults = schema.defaults ?? {};
  const currentPublishIssues = publishIssues.filter(
    (issue) =>
      issue.severity !== "info" && issue.blockId === editor.props.id,
  );

  const activatePanelMode = (panelMode: InspectorPrimaryMode) => {
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

  const removeModule = () => {
    const index = content.findIndex(
      (item) => item.props?.id === editor.props.id,
    );
    if (index < 0) return;
    if (content[index].props?.locked) {
      message.info("此模块已锁定，不能删除");
      return;
    }
    modal.confirm({
      title: `删除“${getModuleDisplayName(editor.moduleType, editor.props)}”？`,
      content: "删除后可通过顶部撤销恢复；保存草稿前不会影响前台页面。",
      okText: "删除模块",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: () => {
        dispatch({
          type: "remove",
          index,
          zone: ROOT_ZONE,
        });
        dispatch({ type: "setUi", ui: { itemSelector: null } });
      },
    });
  };

  const toggleVisibility = () => {
    editor.update({ isVisible: editor.props.isVisible === false });
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
    return (
      <section
        key={group}
        id={`inspector-task-section-${group}`}
        className="homepage-editor__task-group"
        data-task-group={group}
        data-property-level={PROPERTY_LEVEL_BY_TASK_GROUP[group]}
      >
        {rendersInstanceOverrides && currentVisualSelection ? null : (
          <header className="homepage-editor__task-panel-header">
            <h3>{groupTitle}</h3>
          </header>
        )}
        <div className="homepage-editor__task-panel-body">
          {rendersInstanceOverrides ? (
            <>
              <InstanceOverridesPanel
                moduleType={editor.moduleType}
                props={editor.props}
                update={editor.update}
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
                    <InspectorDisclosure label="高级设置">
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
          ) : entries.map((entry, fieldIndex) => (
              <div
                key={`${entry.sectionId}-${entry.field.key}-${fieldIndex}`}
                className={`homepage-editor__task-field${selectedContentFieldKeys.has(entry.field.key) ? " is-visual-selected" : ""}`}
                data-inspector-field={entry.field.key}
              >
                <FieldRenderer
                  def={entry.field}
                  ctx={ctx}
                  update={editor.update}
                  moduleType={editor.moduleType}
                />
                {Object.prototype.hasOwnProperty.call(schemaDefaults, entry.field.key) &&
                JSON.stringify(editor.props[entry.field.key]) !==
                  JSON.stringify(schemaDefaults[entry.field.key]) ? (
                  <button
                    type="button"
                    className="homepage-editor__field-reset"
                    aria-label={`恢复${entry.field.label}默认`}
                    onClick={() =>
                      editor.update({
                        [entry.field.key]: structuredClone(schemaDefaults[entry.field.key]),
                      })
                    }
                  >
                    恢复此项默认
                  </button>
                ) : null}
              </div>
            ))}
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
      aria-label="属性面板"
    >
      <InspectorTopBar
        displayName={schema.displayName}
        moduleName={
          typeof editor.props.moduleName === "string"
            ? editor.props.moduleName
            : ""
        }
        deviceLabel={editor.device === "mobile" ? "移动端画布" : "桌面端画布"}
        dirty={hasUnsavedChanges}
        onClose={editor.close}
        actions={[
          ...(editor.dirty
            ? [
                {
                  key: "revert",
                  label: "撤销本区修改",
                  onClick: editor.revert,
                },
              ]
            : []),
          // 系统区块(全局设置/业务功能区)只读或仅提供管理入口,不给破坏性动作
          ...(schema.systemBlock
            ? []
            : [
                {
                  key: "visibility",
                  label:
                    editor.props.isVisible === false
                      ? "取消隐藏模块"
                      : "隐藏模块",
                  onClick: toggleVisibility,
                },
                {
                  key: "remove",
                  label: "删除模块",
                  danger: true,
                  onClick: removeModule,
                },
              ]),
        ]}
      />

      <InspectorObjectContext
          moduleLabel={schema.displayName}
          selectedObjectId={selectedVisualObject?.nodeId ?? null}
          objects={visualObjects.map((item) => ({
            id: item.nodeId,
            label: VISUAL_NODE_LABELS[item.nodeId] ?? item.nodeId,
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
      />

      <InspectorPrimaryTabs
        activeMode={activePanelMode}
        designDisabled={!currentObjectCanEditDesign}
        onChange={activatePanelMode}
      />

      <div
        ref={inspectorScrollRef}
        className="homepage-editor__inspector-scroll"
        data-inspector-scroll="main"
      >
        {validationState !== "current" ? (
          <p className="homepage-editor__validation-state" role="status" aria-live="polite">
            {validationState === "checking"
              ? "正在按服务端发布规则核对当前页面…"
              : validationState === "error"
                ? "发布资格暂时无法核对；本地编辑内容已保留。"
                : "内容已变化，发布资格等待重新核对。"}
          </p>
        ) : null}
        {currentPublishIssues.length > 0 ? (
          <section
            className="homepage-editor__publish-issues homepage-editor__inspector-publish-issues"
            aria-label="当前模块发布检查问题"
            role="alert"
          >
            <strong>当前模板提示 · {currentPublishIssues.length} 项</strong>
            <div>
              {currentPublishIssues.map((issue, index) => (
                <p key={`${issue.path ?? ""}-${issue.message}-${index}`}>
                  {issue.message}
                </p>
              ))}
            </div>
          </section>
        ) : null}
        <div
          id={`inspector-panel-${activePanelMode}`}
          className="homepage-editor__panel-mode-content"
          role="tabpanel"
          aria-labelledby={`inspector-panel-tab-${activePanelMode}`}
        >
          {activeTaskGroups.length > 0 ? (
            <>
              {activePanelMode === "content" && currentEditableObject ? (
                <div
                  className="homepage-editor__design-scope-note"
                  data-content-scope={hasViewportContent
                    ? hasSharedContent ? "mixed" : "viewport-specific"
                    : "shared"}
                  role="note"
                >
                  <strong>{selectedContentScopeLabel}</strong>
                  {editor.device === "mobile" && hasViewportContent ? (
                    <span>未单独设置的移动端字段继续继承桌面端。</span>
                  ) : null}
                </div>
              ) : null}
              {activeTaskGroups.map(renderTaskGroup)}
              {activePanelMode === "content" &&
              currentEditableObject &&
              (currentEditableObject.kind === "media" || currentEditableObject.kind === "video") &&
              currentObjectCanEditDesign ? (
                <button
                  type="button"
                  className="homepage-editor__task-bridge"
                  onClick={() => activatePanelMode("design")}
                >
                  继续调整{currentEditableObject.kind === "video" ? "封面" : "图片"}构图与布局
                </button>
              ) : null}
              {activePanelMode === "design" && contentTemplateContract ? (
                <button
                  type="button"
                  className="homepage-editor__task-bridge"
                  onClick={() => onSaveAsTemplate(editor.moduleType, editor.props)}
                >
                  另存到模板库
                </button>
              ) : null}
            </>
          ) : (
            <div className="homepage-editor__object-empty-state" role="status">
              <strong>当前对象没有可编辑的{activePanelMode === "content" ? "内容" : "设计"}项</strong>
              <span>
                {activePanelMode === "content" && currentObjectCanEditDesign
                  ? "切换到“设计”可调整位置、大小和画面。"
                  : "请切换其他编辑对象或返回模块级。"}
              </span>
              {activePanelMode === "content" && currentObjectCanEditDesign ? (
                <button type="button" onClick={() => activatePanelMode("design")}>切换到设计</button>
              ) : currentVisualSelection ? (
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
    </section>
  );
}
