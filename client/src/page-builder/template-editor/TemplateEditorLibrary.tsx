import {
  AppstoreOutlined,
  DeleteOutlined,
  EllipsisOutlined,
  ExclamationCircleOutlined,
  InboxOutlined,
  LeftOutlined,
  PlusOutlined,
  ReloadOutlined,
  RightOutlined,
} from "@ant-design/icons";
import { Dropdown, Spin, type MenuProps } from "antd";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { BLOCK_META } from "../config/blockMeta";
import { RESPONSIVE_CANVAS } from "../config/blockContracts";
import { CONTENT_TEMPLATE_BY_MODULE_TYPE } from "../generated/contentTemplates.generated";
import { DynamicTemplateRenderer, type TemplateDefinitionV2 } from "../template-definition";
import {
  createSystemCompatibilityRecoveryDefinition,
  resolveUnifiedTemplateCatalogPresentation,
  unifyTemplateCatalogItems,
  type UnifiedTemplateCatalogPresentation,
} from "../templates/unifiedTemplateCatalog";
import WorkspacePanelHeader from "../workspace/WorkspacePanelHeader";
import useCompactWorkspaceOverlay from "../workspace/useCompactWorkspaceOverlay";
import {
  DYNAMIC_TEMPLATE_LOCAL_DRAFT_CHANGED_EVENT,
  listLocalDynamicTemplateDrafts,
  type StoredDynamicTemplateDraft,
} from "./dynamicTemplateDraftRepository";
import { adaptLegacyTemplateSource } from "./legacyTemplateConversion";
import TemplateCatalogCard from "./TemplateCatalogCard";
import TemplateCatalogViewportPreview from "./TemplateCatalogViewportPreview";
import TemplateCatalogControls, { type TemplateCatalogViewMode } from "./TemplateCatalogControls";
import { groupTemplateCatalogEntries } from "./templateCatalogGrouping";
import { DYNAMIC_TEMPLATE_CATALOG_CHANGED_EVENT } from "./templateCatalogEvents";
import {
  getTemplatePublicationLabel,
  matchesTemplatePublicationFilter,
  resolveTemplatePublicationStatus,
  type TemplatePublicationStatus,
} from "./templatePublicationStatus";
import {
  createPersonalTemplateDraft,
  createSystemTemplateDraft,
} from "./templateDraftAdapter";
import {
  createTemplateCatalogPreviewModel,
  createTemplateCatalogPreviewContentBySlotId,
  type TemplateCatalogPreviewModel,
} from "./templatePreviewModel";
import { useTemplateEditorSession } from "./templateEditorSession";
import type {
  PersonalContentTemplate,
  SystemContentTemplateCurrent,
} from "@/services/api";
import {
  dynamicTemplateApi,
  type DynamicTemplateResource,
  type PublishedDynamicTemplateResource,
  type TemplateCatalogItemResource,
} from "@/services/clients/dynamicTemplateClient";
import { unwrapResponse } from "@/utils/unwrap";

const PERSONAL_TEMPLATE_CHANGED_EVENT = "haichuan:personal-template-changed";
const SYSTEM_TEMPLATE_CHANGED_EVENT = "haichuan:system-template-changed";
const VIEW_MODE_STORAGE_KEY = "homepage-editor-template-view-mode";
const COLLAPSED_STORAGE_KEY = "homepage-editor-library-collapsed";

export type TemplateEditorLibraryTarget =
  | { kind: "system-fixed"; moduleType: string; current?: SystemContentTemplateCurrent }
  | { kind: "personal-fixed"; template: PersonalContentTemplate }
  | {
      kind: "dynamic-persisted";
      template: DynamicTemplateResource;
      published?: PublishedDynamicTemplateResource;
      recoveryDefinition?: TemplateDefinitionV2;
    }
  | { kind: "dynamic-local"; localDraftId: string }
  | { kind: "dynamic-new" };

interface CatalogEntryBase {
  key: string;
  identity: string;
  group: string;
  name: string;
  preview: ReactNode;
}

interface DesignCatalogEntry extends CatalogEntryBase {
  kind: "design";
  active: boolean;
  lifecycle: TemplatePublicationStatus | null;
  target: TemplateEditorLibraryTarget;
}

interface PageSystemCatalogEntry extends CatalogEntryBase {
  kind: "page-system";
  moduleType: string;
  current: SystemContentTemplateCurrent;
  insertAllowed: boolean;
}

interface PagePublishedCatalogEntry extends CatalogEntryBase {
  kind: "page-published";
  template: PublishedDynamicTemplateResource;
  insertAllowed: boolean;
}

interface PageDraftCatalogEntry extends CatalogEntryBase {
  kind: "page-draft";
  template: DynamicTemplateResource;
}

type UnifiedCatalogEntry =
  | DesignCatalogEntry
  | PageDraftCatalogEntry
  | PageSystemCatalogEntry
  | PagePublishedCatalogEntry;

interface DesignModeProps {
  mode: "design";
  device: "desktop" | "mobile";
  localOnly?: boolean;
  activeSourceReference?: string | null;
  activePersistedTemplateId?: string | null;
  activeLocalDraftId?: string | null;
  onOpen: (target: TemplateEditorLibraryTarget) => void;
  onArchive: (template: DynamicTemplateResource) => void;
  onDelete: (template: DynamicTemplateResource) => void;
  onRestore: (template: DynamicTemplateResource) => void;
}

interface PageModeProps {
  mode: "page";
  device: "desktop" | "mobile";
  pageHasPrimaryStage: boolean;
  isSystemTemplateAllowed: (moduleType: string) => boolean;
  onInsertSystem: (moduleType: string, current: SystemContentTemplateCurrent) => void;
  onSystemDragStart: (moduleType: string, current: SystemContentTemplateCurrent) => void;
  onSystemDragEnd: () => void;
  isPublishedTemplateAllowed: (template: PublishedDynamicTemplateResource) => boolean;
  onInsertPublished: (template: PublishedDynamicTemplateResource) => void;
  onPublishedDragStart: (template: PublishedDynamicTemplateResource) => void;
  onPublishedDragEnd: () => void;
  getPublishedUpgradeCount: (template: PublishedDynamicTemplateResource) => number;
  onUpgradePublished: (template: PublishedDynamicTemplateResource) => void;
  getSystemUpgradeCount: (current: SystemContentTemplateCurrent) => number;
  onUpgradeSystem: (current: SystemContentTemplateCurrent) => void;
}

export type UnifiedTemplateLibraryProps = DesignModeProps | PageModeProps;

function matchesKeyword(keyword: string, ...values: Array<string | undefined | null>) {
  const normalized = keyword.trim().toLocaleLowerCase("zh-CN");
  if (!normalized) return true;
  return values.some((value) => value?.toLocaleLowerCase("zh-CN").includes(normalized));
}

function withTemplateSuffix(name: string) {
  return name.endsWith("模板") ? name : `${name}模板`;
}

const DynamicTemplateCatalogPreview = memo(function DynamicTemplateCatalogPreview({
  definition,
  device,
  previewModel,
  previewKey = definition.templateId,
}: {
  definition: TemplateDefinitionV2;
  device: "desktop" | "mobile";
  previewModel: TemplateCatalogPreviewModel;
  previewKey?: string;
}) {
  const contentBySlotId = useMemo(
    () => createTemplateCatalogPreviewContentBySlotId(definition),
    [definition],
  );
  return (
    <TemplateCatalogViewportPreview
      fallbackHeight={previewModel.fallbackHeight}
      heightMode={previewModel.heightMode}
      ratioLabel={previewModel.ratioLabel}
      slots={previewModel.slots}
      sourceWidth={previewModel.sourceWidth}
      templateKey={previewKey}
      title={definition.name}
      viewport={device}
    >
      <DynamicTemplateRenderer
        definition={definition}
        device={device}
        contentBySlotId={contentBySlotId}
        mode="thumbnail"
      />
    </TemplateCatalogViewportPreview>
  );
});

function resolveUnifiedTemplatePreviewDefinition(
  presentation: UnifiedTemplateCatalogPresentation,
): { definition: TemplateDefinitionV2; previewKey: string } | null {
  if (presentation.source === "published" || presentation.source === "draft") {
    return { definition: presentation.definition, previewKey: presentation.templateId };
  }
  try {
    const source = presentation.source === "system-compatibility"
      ? createSystemTemplateDraft(presentation.current.moduleType, presentation.current)
      : createPersonalTemplateDraft(presentation.personal as PersonalContentTemplate);
    if (!source) return null;
    return {
      definition: adaptLegacyTemplateSource(source).draft.definition,
      previewKey: presentation.source === "system-compatibility"
        ? presentation.current.contractKey
        : (presentation.personal as PersonalContentTemplate).contractKey,
    };
  } catch {
    return null;
  }
}

function renderDynamicTemplatePreview(
  definition: TemplateDefinitionV2,
  device: "desktop" | "mobile",
  previewKey = definition.templateId,
): Pick<CatalogEntryBase, "preview"> {
  const previewModel = createTemplateCatalogPreviewModel(definition, device);
  return {
    preview: (
      <DynamicTemplateCatalogPreview
        definition={definition}
        device={device}
        previewKey={previewKey}
        previewModel={previewModel}
      />
    ),
  };
}

function renderUnifiedTemplatePreview(
  presentation: UnifiedTemplateCatalogPresentation,
  device: "desktop" | "mobile",
): Pick<CatalogEntryBase, "preview"> {
  const resolved = resolveUnifiedTemplatePreviewDefinition(presentation);
  if (resolved) {
    return renderDynamicTemplatePreview(resolved.definition, device, resolved.previewKey);
  }
  const viewport = RESPONSIVE_CANVAS[device];
  return {
    preview: (
      <TemplateCatalogViewportPreview
        fallbackHeight={viewport.height}
        heightMode="auto"
        ratioLabel="auto"
        slots={[]}
        sourceWidth={viewport.width}
        templateKey={`unavailable-${presentation.source}`}
        title={presentation.name}
        unavailable
        viewport={device}
      />
    ),
  };
}

function readInitialViewMode(): TemplateCatalogViewMode {
  try {
    return window.localStorage.getItem(VIEW_MODE_STORAGE_KEY) === "double" ? "double" : "single";
  } catch {
    return "single";
  }
}

function readInitialCollapsed() {
  try {
    if (window.matchMedia("(min-width: 1200px)").matches) return false;
    return window.matchMedia("(max-width: 900px)").matches
      || window.sessionStorage.getItem(COLLAPSED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function identityForTarget(target: TemplateEditorLibraryTarget) {
  if (target.kind === "dynamic-persisted") {
    return target.template.sourceReference?.startsWith("legacy_")
      ? `source:${target.template.sourceReference}`
      : `template:${target.template.templateId}`;
  }
  if (target.kind === "system-fixed") {
    return `source:legacy_system_${target.current?.contractKey ?? target.moduleType}`;
  }
  if (target.kind === "personal-fixed") return `source:legacy_personal_${target.template.id}`;
  if (target.kind === "dynamic-local") return `local:${target.localDraftId}`;
  return "new";
}

function DesignTemplateCard({
  device,
  entry,
  onArchive,
  onDelete,
  onOpen,
  onRestore,
  viewMode,
}: {
  device: "desktop" | "mobile";
  entry: DesignCatalogEntry;
  onArchive?: (template: DynamicTemplateResource) => void;
  onDelete?: (template: DynamicTemplateResource) => void;
  onOpen: (target: TemplateEditorLibraryTarget) => void;
  onRestore: (template: DynamicTemplateResource) => void;
  viewMode: TemplateCatalogViewMode;
}) {
  const archivedTemplate = entry.target.kind === "dynamic-persisted"
    && entry.target.template.status === "ARCHIVED"
    ? entry.target.template
    : null;
  const persistedTemplate = entry.target.kind === "dynamic-persisted"
    ? entry.target.template
    : null;
  const lifecycleLabel = getTemplatePublicationLabel(entry.lifecycle);
  const formalVersion = persistedTemplate?.publishedVersion
    ?? (entry.target.kind === "system-fixed" ? entry.target.current?.activeVersion : undefined);
  const purpose = persistedTemplate?.draft?.definition.metadata.purpose;
  const requiresInitialSave = entry.target.kind === "system-fixed"
    || entry.target.kind === "personal-fixed";
  const deleteBlockedReason = persistedTemplate?.deleteBlockers?.[0]?.message
    ?? "此模板包含需要保留的系统、版本或页面引用数据。";
  const actionItems: MenuProps["items"] = archivedTemplate
    ? [
        {
          key: "restore",
          icon: <ReloadOutlined />,
          label: "恢复模板",
        },
        { type: "divider" },
        {
          key: "permanently-delete",
          icon: <DeleteOutlined />,
          danger: true,
          disabled: !archivedTemplate.canDelete,
          label: (
            <span title={archivedTemplate.canDelete ? "永久删除后无法恢复" : deleteBlockedReason}>
              {archivedTemplate.canDelete ? "永久删除模板" : "永久删除不可用"}
            </span>
          ),
        },
      ]
    : persistedTemplate?.status === "ACTIVE" && onArchive
      ? [{
          key: "move-to-trash",
          icon: <InboxOutlined />,
          danger: true,
          label: "移入回收站",
        }]
      : requiresInitialSave
        ? [{
            key: "save-before-trash",
            icon: <InboxOutlined />,
            disabled: true,
            label: (
              <span title="先打开并保存为统一母模板；未保存修改不会自动保存">
                首次保存后可移入回收站
              </span>
            ),
          }]
        : [{
            key: "local-trash-unavailable",
            icon: <InboxOutlined />,
            disabled: true,
            label: "本机测试草稿不支持回收站",
          }];
  const handleActionClick: NonNullable<MenuProps["onClick"]> = ({ key }) => {
    if (key === "move-to-trash" && persistedTemplate) onArchive?.(persistedTemplate);
    if (key === "restore" && archivedTemplate) onRestore(archivedTemplate);
    if (key === "permanently-delete" && archivedTemplate?.canDelete) onDelete?.(archivedTemplate);
  };
  return (
    <TemplateCatalogCard
      active={entry.active}
      ariaLabel={archivedTemplate
        ? `回收站模板“${entry.name}”，恢复后才能设计，状态：${lifecycleLabel}`
        : `${entry.active ? "正在编辑" : "打开"}${withTemplateSuffix(entry.name)}，状态：${lifecycleLabel.replace(" · ", "，")}`}
      className={`unified-template-library__card is-${device}${archivedTemplate ? " is-trash-template" : ""}`}
      compact={viewMode === "double"}
      dataTemplateIdentity={entry.identity}
      disabled={Boolean(archivedTemplate)}
      name={entry.name}
      metadata={purpose && purpose !== entry.group && purpose !== entry.name ? purpose : undefined}
      actionLabel={archivedTemplate ? "恢复后可编辑" : "编辑模板"}
      disabledReason={archivedTemplate ? "请通过更多模板操作恢复模板" : undefined}
      preview={entry.preview}
      statusLabel={(
        <span data-template-publication-status={entry.lifecycle ?? "unverifiable"}>
          {lifecycleLabel}
          {formalVersion ? ` · v${formalVersion}` : ""}
        </span>
      )}
      onClick={archivedTemplate ? undefined : () => onOpen(entry.target)}
      trailingAction={(
        <Dropdown
          menu={{ items: actionItems, onClick: handleActionClick }}
          placement="bottomRight"
          trigger={["click"]}
        >
          <button
            type="button"
            className="template-editor__template-more"
            aria-label={`更多模板操作：${entry.name}`}
            aria-haspopup="menu"
            title={`更多模板操作：${entry.name}`}
            onClick={(event) => event.stopPropagation()}
          >
            <EllipsisOutlined />
          </button>
        </Dropdown>
      )}
    />
  );
}

function PageSystemTemplateCard({
  device,
  entry,
  getUpgradeCount,
  onActivate,
  onDragEnd,
  onDragStart,
  onUpgrade,
  viewMode,
}: {
  device: "desktop" | "mobile";
  entry: PageSystemCatalogEntry;
  getUpgradeCount: (current: SystemContentTemplateCurrent) => number;
  onActivate: (moduleType: string, current: SystemContentTemplateCurrent) => void;
  onDragEnd: PageModeProps["onSystemDragEnd"];
  onDragStart: PageModeProps["onSystemDragStart"];
  onUpgrade: (current: SystemContentTemplateCurrent) => void;
  viewMode: TemplateCatalogViewMode;
}) {
  const upgradeCount = getUpgradeCount(entry.current);
  const insertAllowed = entry.insertAllowed;
  return (
    <TemplateCatalogCard
      ariaLabel={insertAllowed
        ? `${entry.name}：点击添加到页面末尾，也可拖到画布指定位置`
        : `${entry.name}已有主舞台实例，不能再次添加`}
      className={`unified-template-library__card is-${device}${insertAllowed ? "" : " is-insert-blocked"}`}
      compact={viewMode === "double"}
      controlClassName="homepage-editor__template-card-activate"
      dataTemplateIdentity={entry.identity}
      dataTemplateName={entry.moduleType}
      disabled={!insertAllowed}
      draggable={insertAllowed}
      name={entry.name}
      preview={entry.preview}
      metadata={entry.group}
      statusLabel={entry.current.activeVersion > 0 ? `已发布 · v${entry.current.activeVersion}` : "内置模板"}
      onClick={insertAllowed ? () => onActivate(entry.moduleType, entry.current) : undefined}
      onDragStart={insertAllowed ? (event) => {
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData("application/x-haichuan-page-template", entry.moduleType);
        onDragStart(entry.moduleType, entry.current);
      } : undefined}
      onDragEnd={onDragEnd}
      trailingAction={upgradeCount > 0 ? (
        <button
          type="button"
          className="homepage-editor__template-upgrade-action"
          onClick={() => onUpgrade(entry.current)}
          aria-label={`升级页面中的${entry.name}模板，共 ${upgradeCount} 处`}
          title={`升级页面中的${entry.name}模板，共 ${upgradeCount} 处`}
        >
          <ExclamationCircleOutlined />
        </button>
      ) : null}
    />
  );
}

function PagePublishedTemplateCard({
  device,
  entry,
  getUpgradeCount,
  onActivate,
  onDragEnd,
  onDragStart,
  onUpgrade,
  viewMode,
}: {
  device: "desktop" | "mobile";
  entry: PagePublishedCatalogEntry;
  getUpgradeCount: PageModeProps["getPublishedUpgradeCount"];
  onActivate: PageModeProps["onInsertPublished"];
  onDragEnd: PageModeProps["onPublishedDragEnd"];
  onDragStart: PageModeProps["onPublishedDragStart"];
  onUpgrade: PageModeProps["onUpgradePublished"];
  viewMode: TemplateCatalogViewMode;
}) {
  const upgradeCount = getUpgradeCount(entry.template);
  const insertAllowed = entry.insertAllowed;
  return (
    <TemplateCatalogCard
      ariaLabel={insertAllowed
        ? `添加${entry.name}版本${entry.template.version}`
        : `${entry.name}版本${entry.template.version}已添加为主舞台，不能再次添加`}
      className={`unified-template-library__card is-${device}${insertAllowed ? "" : " is-insert-blocked"}`}
      compact={viewMode === "double"}
      controlClassName="homepage-editor__dynamic-template-card-main"
      dataTemplateIdentity={entry.identity}
      dataTemplateName={entry.template.templateId}
      disabled={!insertAllowed}
      draggable={insertAllowed}
      name={entry.name}
      preview={entry.preview}
      metadata={[entry.group, entry.template.definition.metadata.purpose].filter(Boolean).join(" · ")}
      statusLabel={`已发布 · v${entry.template.version}`}
      onClick={insertAllowed ? () => onActivate(entry.template) : undefined}
      onDragStart={insertAllowed ? (event) => {
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData(
          "application/x-haichuan-published-template",
          `${entry.template.templateId}@${entry.template.version}`,
        );
        onDragStart(entry.template);
      } : undefined}
      onDragEnd={onDragEnd}
      trailingAction={upgradeCount > 0 ? (
        <button
          type="button"
          className="homepage-editor__template-upgrade-action"
          onClick={() => onUpgrade(entry.template)}
          aria-label={`升级页面中的${entry.name}动态模板，共 ${upgradeCount} 处`}
          title={`升级页面中的${entry.name}动态模板，共 ${upgradeCount} 处`}
        >
          <ExclamationCircleOutlined />
        </button>
      ) : null}
    />
  );
}

/** 页面装修与模板设计唯一的模板目录本体；只有最终动作按模式区分。 */
export function UnifiedTemplateLibrary(props: UnifiedTemplateLibraryProps) {
  const [keyword, setKeyword] = useState("");
  const [viewMode, setViewMode] = useState<TemplateCatalogViewMode>(readInitialViewMode);
  const [collapsed, setCollapsed] = useState(readInitialCollapsed);
  const [designStatus, setDesignStatus] = useState<"all" | "draft" | "published">("all");
  const [designView, setDesignView] = useState<"library" | "trash">("library");
  const [catalogItems, setCatalogItems] = useState<TemplateCatalogItemResource[]>([]);
  const catalogItemsRef = useRef<TemplateCatalogItemResource[]>([]);
  const catalogRequestIdRef = useRef(0);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const localOnly = props.mode === "design" && Boolean(props.localOnly);
  const [localDrafts, setLocalDrafts] = useState<StoredDynamicTemplateDraft[]>(() => (
    localOnly ? listLocalDynamicTemplateDrafts() : []
  ));
  const setLibraryCollapsed = useCallback((next: boolean) => {
    setCollapsed(next);
    try { window.sessionStorage.setItem(COLLAPSED_STORAGE_KEY, next ? "1" : "0"); } catch { /* 非关键偏好 */ }
  }, []);
  const libraryOverlay = useCompactWorkspaceOverlay({
    open: props.mode === "design" && !collapsed,
    onOpen: () => setLibraryCollapsed(false),
    onClose: () => setLibraryCollapsed(true),
  });

  useEffect(() => {
    if (!libraryOverlay.compact) {
      setLibraryCollapsed(false);
    } else if (props.mode === "design") {
      setLibraryCollapsed(true);
    }
  }, [libraryOverlay.compact, props.mode, setLibraryCollapsed]);

  useEffect(() => {
    try { window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode); } catch { /* 非关键偏好 */ }
  }, [viewMode]);

  useEffect(() => {
    const mobileWorkspace = window.matchMedia("(max-width: 900px)");
    const collapseForMobile = (event: MediaQueryListEvent) => {
      if (event.matches) setCollapsed(true);
    };
    mobileWorkspace.addEventListener("change", collapseForMobile);
    return () => mobileWorkspace.removeEventListener("change", collapseForMobile);
  }, []);

  const openDesignTarget = (target: TemplateEditorLibraryTarget) => {
    if (props.mode !== "design") return;
    props.onOpen(target);
    if (libraryOverlay.compact) {
      libraryOverlay.requestClose();
    }
  };

  const refreshCatalog = useCallback(async () => {
    const requestId = catalogRequestIdRef.current + 1;
    catalogRequestIdRef.current = requestId;
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const response = await dynamicTemplateApi.listCatalog({ dedupe: false });
      if (requestId !== catalogRequestIdRef.current) return;
      const catalog = unwrapResponse<{ items?: TemplateCatalogItemResource[] }>(response);
      const nextItems = Array.isArray(catalog?.items) ? catalog.items : [];
      catalogItemsRef.current = nextItems;
      setCatalogItems(nextItems);
    } catch {
      if (requestId !== catalogRequestIdRef.current) return;
      setCatalogError(catalogItemsRef.current.length > 0
        ? "目录刷新失败，已保留上次成功结果。"
        : localOnly
          ? "模板目录暂时无法读取；仅显示当前本机草稿。"
          : "模板目录暂时无法读取，请重试。");
    } finally {
      if (requestId === catalogRequestIdRef.current) setCatalogLoading(false);
    }
  }, [localOnly]);

  useEffect(() => {
    void refreshCatalog();
    const handleCatalogChanged = () => { void refreshCatalog(); };
    const handleLocalChanged = () => setLocalDrafts(localOnly ? listLocalDynamicTemplateDrafts() : []);
    window.addEventListener(PERSONAL_TEMPLATE_CHANGED_EVENT, handleCatalogChanged);
    window.addEventListener(DYNAMIC_TEMPLATE_CATALOG_CHANGED_EVENT, handleCatalogChanged);
    window.addEventListener(DYNAMIC_TEMPLATE_LOCAL_DRAFT_CHANGED_EVENT, handleLocalChanged);
    window.addEventListener(SYSTEM_TEMPLATE_CHANGED_EVENT, handleCatalogChanged);
    return () => {
      window.removeEventListener(PERSONAL_TEMPLATE_CHANGED_EVENT, handleCatalogChanged);
      catalogRequestIdRef.current += 1;
      window.removeEventListener(DYNAMIC_TEMPLATE_CATALOG_CHANGED_EVENT, handleCatalogChanged);
      window.removeEventListener(DYNAMIC_TEMPLATE_LOCAL_DRAFT_CHANGED_EVENT, handleLocalChanged);
      window.removeEventListener(SYSTEM_TEMPLATE_CHANGED_EVENT, handleCatalogChanged);
    };
  }, [localOnly, refreshCatalog]);

  const unifiedCatalog = useMemo(() => unifyTemplateCatalogItems(catalogItems), [catalogItems]);
  const catalogEntries = useMemo<UnifiedCatalogEntry[]>(() => {
    const entries: UnifiedCatalogEntry[] = [];
    for (const entry of unifiedCatalog) {
      const editable = entry.editable;
      const current = entry.systemCompatibility;
      const personal = entry.personalCompatibility;
      const presentation = resolveUnifiedTemplateCatalogPresentation(entry);
      if (!presentation) continue;

      if (props.mode === "page") {
        if (
          presentation.source === "published"
          && props.isPublishedTemplateAllowed(presentation.published)
          && matchesKeyword(
            keyword,
            presentation.published.name,
            presentation.published.description,
            presentation.published.category,
            presentation.published.purpose,
            ...presentation.published.tags,
          )
        ) {
          const insertAllowed = presentation.published.definition.metadata.visualRole !== "primary-stage"
            || !props.pageHasPrimaryStage;
          entries.push({
            kind: "page-published",
            key: entry.key,
            identity: entry.key,
            group: presentation.category,
            name: presentation.name,
            ...renderUnifiedTemplatePreview(presentation, props.device),
            template: presentation.published,
            insertAllowed,
          });
          continue;
        }
        if (presentation.source === "draft") {
          // 回收站状态只影响新页面可选目录；历史页面继续按精确版本重放。
          if (presentation.editable.status === "ARCHIVED") continue;
          if (!matchesKeyword(
            keyword,
            presentation.name,
            presentation.editable.description,
            presentation.category,
            presentation.editable.purpose,
            ...presentation.editable.tags,
          )) continue;
          const currentMeta = current ? BLOCK_META[current.moduleType] : null;
          if (current && currentMeta) {
            if (!props.isSystemTemplateAllowed(current.moduleType)) continue;
            const insertAllowed = CONTENT_TEMPLATE_BY_MODULE_TYPE[current.moduleType]?.visualRole !== "primary-stage"
              || !props.pageHasPrimaryStage;
            const currentPresentation: UnifiedTemplateCatalogPresentation = {
              source: "system-compatibility",
              name: current.displayName,
              category: null,
              description: current.displayName,
              current,
            };
            entries.push({
              kind: "page-system",
              key: entry.key,
              identity: entry.key,
              group: currentMeta.category,
              name: currentMeta.name,
              ...renderUnifiedTemplatePreview(currentPresentation, props.device),
              moduleType: current.moduleType,
              current,
              insertAllowed,
            });
            continue;
          }
          // 未首次发布的 CUSTOM 草稿只属于模板设计，不进入页面装修模板库。
          continue;
        }
        if (presentation.source === "system-compatibility") {
          const meta = BLOCK_META[presentation.current.moduleType];
          if (!meta
            || !props.isSystemTemplateAllowed(presentation.current.moduleType)
            || !matchesKeyword(
            keyword,
            presentation.current.moduleType,
            meta.name,
            meta.description,
            ...meta.tags,
          )) continue;
          const insertAllowed = CONTENT_TEMPLATE_BY_MODULE_TYPE[presentation.current.moduleType]?.visualRole !== "primary-stage"
            || !props.pageHasPrimaryStage;
          entries.push({
            kind: "page-system",
            key: entry.key,
            identity: entry.key,
            group: meta.category,
            name: meta.name,
            ...renderUnifiedTemplatePreview(presentation, props.device),
            moduleType: presentation.current.moduleType,
            current: presentation.current,
            insertAllowed,
          });
        }
        continue;
      }

      if (!matchesKeyword(
        keyword,
        editable?.name,
        editable?.category,
        editable?.description,
        current?.displayName,
        current?.moduleType,
        current ? BLOCK_META[current.moduleType]?.description : null,
        personal?.name,
        personal?.moduleType,
      )) continue;

      if (editable?.draft) {
        const recoveryDefinition = presentation.source === "system-compatibility"
          ? createSystemCompatibilityRecoveryDefinition(editable, presentation.current)
          : undefined;
        const target: TemplateEditorLibraryTarget = {
          kind: "dynamic-persisted",
          template: editable,
          ...(entry.published ? { published: entry.published } : {}),
          recoveryDefinition,
        };
        const matchesActiveSource = Boolean(
          props.activeSourceReference
          && editable.sourceReference === props.activeSourceReference,
        );
        entries.push({
          kind: "design",
          key: entry.key,
          identity: identityForTarget(target),
          group: editable.category,
          active: props.activePersistedTemplateId === editable.templateId || matchesActiveSource,
          lifecycle: resolveTemplatePublicationStatus({
            status: editable.status,
            publishedVersion: editable.publishedVersion,
            draftDefinitionChecksum: editable.draft.definitionChecksum,
            publishedDefinitionChecksum: entry.published?.version === editable.publishedVersion
              ? entry.published.definitionChecksum
              : null,
          }),
          name: editable.name,
          target,
          ...renderUnifiedTemplatePreview(presentation, props.device),
        });
        continue;
      }

      if (current && presentation.source === "system-compatibility") {
        const meta = BLOCK_META[current.moduleType];
        const target: TemplateEditorLibraryTarget = { kind: "system-fixed", moduleType: current.moduleType, current };
        entries.push({
          kind: "design",
          key: entry.key,
          identity: identityForTarget(target),
          group: meta?.category ?? "其他用途",
          active: props.activeSourceReference === `legacy_system_${current.contractKey}`,
          lifecycle: "published-current",
          name: meta?.name ?? current.displayName,
          target,
          ...renderUnifiedTemplatePreview(presentation, props.device),
        });
        continue;
      }

      if (!personal || presentation.source !== "personal-compatibility") continue;
      const target: TemplateEditorLibraryTarget = {
        kind: "personal-fixed",
        template: personal as PersonalContentTemplate,
      };
      entries.push({
        kind: "design",
        key: entry.key,
        identity: identityForTarget(target),
        group: BLOCK_META[personal.moduleType]?.category ?? "其他用途",
        active: props.activeSourceReference === `legacy_personal_${personal.id}`,
        lifecycle: "draft",
        name: personal.name,
        target,
        ...renderUnifiedTemplatePreview(presentation, props.device),
      });
    }

    if (props.mode === "design" && localOnly) {
      for (const template of localDrafts) {
        if (!matchesKeyword(keyword, template.definition.name, template.definition.metadata.category)) continue;
        const target: TemplateEditorLibraryTarget = { kind: "dynamic-local", localDraftId: template.localDraftId };
        entries.push({
          kind: "design",
          key: `local-${template.localDraftId}`,
          identity: identityForTarget(target),
          group: template.definition.metadata.category,
          active: props.activeLocalDraftId === template.localDraftId,
          lifecycle: "draft",
          name: template.definition.name,
          target,
          ...renderDynamicTemplatePreview(template.definition, props.device),
        });
      }
    }
    if (props.mode !== "design") return entries;
    return entries.filter((entry) => {
      if (entry.kind !== "design") return true;
      if (designView === "trash") return entry.lifecycle === "archived";
      if (entry.lifecycle === "archived") return false;
      return matchesTemplatePublicationFilter(entry.lifecycle, designStatus);
    });
  }, [designStatus, designView, keyword, localDrafts, localOnly, props, unifiedCatalog]);

  const groupedCatalogEntries = useMemo(
    () => groupTemplateCatalogEntries(catalogEntries, (entry) => entry.group),
    [catalogEntries],
  );
  const visibleCatalogGroups = props.mode === "design"
    ? [{ group: "模板", entries: catalogEntries }]
    : groupedCatalogEntries;
  const visibleEntryCount = visibleCatalogGroups.reduce((count, group) => count + group.entries.length, 0);
  const hasFilters = Boolean(keyword.trim()) || (props.mode === "design" && (designStatus !== "all" || designView !== "library"));
  const resetFilters = () => {
    setKeyword("");
    setDesignStatus("all");
    setDesignView("library");
  };

  if (collapsed) {
    return (
      <aside
        className="homepage-editor__library homepage-editor__library--collapsed"
        aria-label="模板组件库（已收起）"
        data-unified-template-library={props.mode}
        data-compact-overlay={libraryOverlay.compact ? "library-trigger" : undefined}
      >
        <button
          ref={libraryOverlay.openButtonRef}
          type="button"
          className="homepage-editor__library-expand-btn admin-panel-collapse-toggle"
          onClick={libraryOverlay.requestOpen}
          title="展开模板组件库"
          aria-label="展开模板组件库"
        >
          <RightOutlined />
          <span className="homepage-editor__compact-panel-label">模板目录</span>
        </button>
      </aside>
    );
  }

  return (
    <aside
      ref={libraryOverlay.panelRef}
      className="homepage-editor__library template-editor__library"
      aria-label={libraryOverlay.compact && props.mode === "design"
        ? "模板设计模板目录"
        : "模板组件库"}
      data-unified-template-library={props.mode}
      role={libraryOverlay.compact && props.mode === "design" ? "dialog" : undefined}
      aria-modal={libraryOverlay.compact && props.mode === "design" ? "true" : undefined}
      tabIndex={libraryOverlay.compact && props.mode === "design" ? -1 : undefined}
      data-compact-overlay={libraryOverlay.compact ? "library" : undefined}
      data-compact-overlay-open={libraryOverlay.compact || undefined}
      onKeyDown={libraryOverlay.onPanelKeyDown}
    >
      <div className="homepage-editor__library-tools">
        <WorkspacePanelHeader
          icon={<AppstoreOutlined />}
          title="模板组件库"
          actions={libraryOverlay.compact ? (
            <button
              ref={libraryOverlay.closeButtonRef}
              type="button"
              className="homepage-editor__library-collapse-btn admin-panel-collapse-toggle"
              onClick={libraryOverlay.requestClose}
              title="收起模板组件库"
              aria-label="收起模板组件库"
            >
              <LeftOutlined />
            </button>
          ) : undefined}
          />
          <TemplateCatalogControls
            keyword={keyword}
            onKeywordChange={setKeyword}
          placeholder="搜索模板"
          searchAriaLabel="搜索模板"
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          tip={props.mode === "design"
            ? designView === "trash"
              ? "回收站中的模板只能恢复或永久删除"
              : "点击编辑模板；更多操作在卡片右侧"
            : "点击添加，也可拖到画布"}
          countLabel={String(visibleEntryCount)}
          countTitle={`当前显示 ${visibleEntryCount} 个模板`}
          singleViewToggle={props.mode === "design"}
        />
        {props.mode === "design" ? (
          <div
            className={`template-editor__status-filters${designView === "trash" ? " is-trash-view" : ""}`}
            role="group"
            aria-label={designView === "trash" ? "模板回收站导航" : "模板生命周期筛选"}
          >
            {designView === "library" ? (
              <>
                {([
                  ["all", "全部"],
                  ["draft", "草稿"],
                  ["published", "已发布"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={designStatus === value ? "is-active" : ""}
                    aria-pressed={designStatus === value}
                    onClick={() => setDesignStatus(value)}
                  >
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  className="template-editor__trash-entry"
                  aria-label="打开模板回收站"
                  onClick={() => setDesignView("trash")}
                >
                  <DeleteOutlined />
                  回收站
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setDesignView("library")}>
                <LeftOutlined />
                返回模板库
              </button>
            )}
          </div>
        ) : null}
        {hasFilters ? (
          <div className="unified-template-library__filter-summary" role="status">
            <span>{[keyword.trim() ? `搜索：${keyword.trim()}` : "", props.mode === "design" && designView === "trash" ? "回收站" : "", props.mode === "design" && designStatus !== "all" ? designStatus === "draft" ? "草稿" : "已发布" : ""].filter(Boolean).join(" · ")}</span>
            <button type="button" onClick={resetFilters}>重置筛选</button>
          </div>
        ) : null}
      </div>

      <div className={`homepage-editor__template-scroll unified-template-library__scroll${viewMode === "double" ? " is-double" : ""}`}>
        {catalogLoading ? (
          <div className="homepage-editor__library-empty" role="status">
            <Spin size="small" />
            <p>正在读取{props.mode === "design" && designView === "trash" ? "模板回收站" : "模板目录"}…</p>
          </div>
        ) : null}
        {catalogError ? (
          <div className="homepage-editor__library-empty is-error" role="alert">
            <p>{catalogError}</p>
            <button type="button" onClick={() => { void refreshCatalog(); }}>重新读取</button>
          </div>
        ) : null}
        <section className="homepage-editor__template-group" aria-label="模板列表">
          {visibleCatalogGroups.map(({ group, entries }) => {
            // 设计模式的单一分组名就是“模板”，再拼接后缀会得到“模板模板”。
            return <section key={group} aria-label={group.endsWith("模板") ? group : `${group}模板`}>
            <div className="homepage-editor__template-group-grid">
            {entries.map((entry) => {
                if (entry.kind === "design" && props.mode === "design") {
                  return (
                    <DesignTemplateCard
                      key={entry.key}
                      device={props.device}
                      entry={entry}
                      onArchive={localOnly ? undefined : props.onArchive}
                      onDelete={localOnly ? undefined : props.onDelete}
                      onOpen={openDesignTarget}
                      onRestore={props.onRestore}
                      viewMode={viewMode}
                    />
                  );
                }
                if (entry.kind === "page-published" && props.mode === "page") {
                  return (
                    <PagePublishedTemplateCard
                      key={entry.key}
                      device={props.device}
                      entry={entry}
                      getUpgradeCount={props.getPublishedUpgradeCount}
                      onActivate={props.onInsertPublished}
                      onDragStart={props.onPublishedDragStart}
                      onDragEnd={props.onPublishedDragEnd}
                      onUpgrade={props.onUpgradePublished}
                      viewMode={viewMode}
                    />
                  );
                }
                if (entry.kind === "page-draft" && props.mode === "page") {
                  return (
                    <TemplateCatalogCard
                      key={entry.key}
                      ariaLabel={`新模板“${entry.name}”尚未首次发布，暂时不能添加到页面`}
                      className={`unified-template-library__card is-${props.device}`}
                      compact={viewMode === "double"}
                      dataTemplateIdentity={entry.identity}
                      dataTemplateName={entry.template.templateId}
                      disabled
                      name={entry.name}
                      preview={entry.preview}
                      metadata={entry.group}
                      statusLabel="草稿 · 尚未首次发布"
                    />
                  );
                }
                if (entry.kind === "page-system" && props.mode === "page") {
                  return (
                    <PageSystemTemplateCard
                      key={entry.key}
                      device={props.device}
                      entry={entry}
                      getUpgradeCount={props.getSystemUpgradeCount}
                      onActivate={props.onInsertSystem}
                      onDragStart={props.onSystemDragStart}
                      onDragEnd={props.onSystemDragEnd}
                      onUpgrade={props.onUpgradeSystem}
                      viewMode={viewMode}
                    />
                  );
                }
                return null;
            })}
          </div>
          </section>
          })}
        </section>
        {!catalogLoading && !catalogError && visibleEntryCount === 0 ? (
          <div className="homepage-editor__library-empty">
            <p>{props.mode === "design" && designView === "trash"
              ? keyword ? "回收站中没有匹配的模板。" : "回收站为空。"
              : hasFilters ? "没有符合当前筛选条件的模板。" : "模板库中还没有模板。"}</p>
            {!hasFilters && props.mode === "design" ? <p>从新建空白模板开始设计。</p> : null}
          </div>
        ) : null}
      </div>
      {props.mode === "design" && designView === "library" ? (
        <footer className="template-editor__library-footer">
          <button
            type="button"
            aria-label="新建模板"
            onClick={() => openDesignTarget({ kind: "dynamic-new" })}
          >
            <PlusOutlined />
            <span>新建模板</span>
          </button>
        </footer>
      ) : null}
    </aside>
  );
}

export default function TemplateEditorLibrary({
  onArchive,
  onDelete,
  onOpen,
  onRestore,
  localOnly = false,
}: {
  onArchive: (template: DynamicTemplateResource) => void;
  onDelete: (template: DynamicTemplateResource) => void;
  onOpen: (target: TemplateEditorLibraryTarget) => void;
  onRestore: (template: DynamicTemplateResource) => void;
  localOnly?: boolean;
}) {
  const draft = useTemplateEditorSession((state) => state.draft);
  const device = useTemplateEditorSession((state) => state.device);
  return (
    <UnifiedTemplateLibrary
      mode="design"
      device={device}
      localOnly={localOnly}
      activeSourceReference={draft?.sourceReference ?? null}
      activePersistedTemplateId={draft?.sourceType === "persisted" ? draft.definition.templateId : null}
      activeLocalDraftId={draft?.sourceType === "local" ? draft.localDraftId : null}
      onArchive={onArchive}
      onDelete={onDelete}
      onOpen={onOpen}
      onRestore={onRestore}
    />
  );
}
