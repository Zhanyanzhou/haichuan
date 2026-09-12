import {
  AppstoreOutlined,
  DeleteOutlined,
  EditOutlined,
  EllipsisOutlined,
  ExclamationCircleOutlined,
  InboxOutlined,
  LeftOutlined,
  PlusOutlined,
  ReloadOutlined,
  RightOutlined,
} from "@ant-design/icons";
import { Button, Dropdown, Modal, Spin, type MenuProps } from "antd";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { RESPONSIVE_CANVAS } from "../config/blockContracts";
import {
  DynamicTemplateRenderer,
  validateDynamicTemplateDefinition,
  type TemplateDefinitionV2,
} from "../template-definition";
import {
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
import TemplateCatalogCard from "./TemplateCatalogCard";
import TemplateCatalogViewportPreview from "./TemplateCatalogViewportPreview";
import TemplateCatalogControls, { type TemplateCatalogViewMode } from "./TemplateCatalogControls";
import { groupTemplateCatalogEntries } from "./templateCatalogGrouping";
import {
  DYNAMIC_TEMPLATE_CATALOG_CHANGED_EVENT,
  type DynamicTemplateCatalogChangeDetail,
} from "./templateCatalogEvents";
import {
  getTemplatePublicationLabel,
  matchesTemplatePublicationFilter,
  resolveTemplatePublicationStatus,
  type TemplatePublicationStatus,
} from "./templatePublicationStatus";
import {
  createTemplateCatalogPreviewModel,
  createTemplateCatalogPreviewContentBySlotId,
  type TemplateCatalogPreviewModel,
} from "./templatePreviewModel";
import type { TemplateWorkspaceScrollState } from "./templateEditorSession";
import type { TemplateEditorDraft } from "./types";
import {
  dynamicTemplateApi,
  type DynamicTemplateResource,
  type PublishedDynamicTemplateResource,
  type TemplateCatalogItemResource,
} from "@/services/clients/dynamicTemplateClient";
import { unwrapResponse } from "@/utils/unwrap";

const VIEW_MODE_STORAGE_KEY = "homepage-editor-template-view-mode";
const COLLAPSED_STORAGE_KEY = "homepage-editor-library-collapsed";

export type TemplateEditorLibraryTarget =
  | {
      kind: "dynamic-persisted";
      template: DynamicTemplateResource;
      published?: PublishedDynamicTemplateResource;
    }
  | { kind: "dynamic-local"; localDraftId: string }
  | { kind: "dynamic-new"; canvasSize?: TemplateDefinitionV2["metadata"]["canvasSize"]; definition?: TemplateDefinitionV2; copySource?: TemplateEditorDraft["copySource"]; copySourceDefinition?: TemplateDefinitionV2 };

export type ArchivableTemplateEditorLibraryTarget = Extract<
  TemplateEditorLibraryTarget,
  { kind: "dynamic-persisted" }
>;

export type PublishedDraftCreationState = {
  templateId: string;
  expectedVersion: number;
  expectedChecksum: string;
  status: "creating" | "failed" | "detached";
  reason?: string;
};

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
  draftState?: "unsaved" | "saved" | "modified";
  lifecycle: TemplatePublicationStatus | null;
  lifecycleDetail?: string;
  target: TemplateEditorLibraryTarget;
}

interface PagePublishedCatalogEntry extends CatalogEntryBase {
  kind: "page-published";
  template: PublishedDynamicTemplateResource;
}

interface PageDraftCatalogEntry extends CatalogEntryBase {
  kind: "page-draft";
  template: DynamicTemplateResource;
}

type UnifiedCatalogEntry =
  | DesignCatalogEntry
  | PageDraftCatalogEntry
  | PagePublishedCatalogEntry;

interface DesignModeProps {
  mode: "design";
  active?: boolean;
  device: "desktop" | "mobile";
  sessionId: string | null;
  readWorkspaceScroll: () => TemplateWorkspaceScrollState;
  updateWorkspaceScroll: (
    sessionId: string,
    updates: Partial<TemplateWorkspaceScrollState>,
  ) => void;
  localOnly?: boolean;
  activeSourceReference?: string | null;
  activePersistedTemplateId?: string | null;
  activeLocalDraftId?: string | null;
  currentDraft?: TemplateEditorDraft | null;
  currentDraftDirty: boolean;
  currentDraftHasBaseline: boolean;
  onOpen: (target: TemplateEditorLibraryTarget) => void;
  onManage?: (target: TemplateEditorLibraryTarget, action: "copy" | "copy-published" | "rename") => void;
  onCreateDraftFromPublished: (
    template: DynamicTemplateResource,
    published: PublishedDynamicTemplateResource,
  ) => void;
  publishedDraftCreation?: PublishedDraftCreationState | null;
  onArchive: (target: ArchivableTemplateEditorLibraryTarget, name: string) => void;
  onDelete: (template: DynamicTemplateResource) => void;
  onRestore: (template: DynamicTemplateResource) => void;
}

interface PageModeProps {
  mode: "page";
  active: boolean;
  device: "desktop" | "mobile";
  isPublishedTemplateAllowed: (template: PublishedDynamicTemplateResource) => boolean;
  onInsertPublished: (template: PublishedDynamicTemplateResource) => void;
  onPublishedDragStart: (template: PublishedDynamicTemplateResource) => void;
  onPublishedDragEnd: () => void;
  getPublishedUpgradeCount: (template: PublishedDynamicTemplateResource) => number;
  onUpgradePublished: (template: PublishedDynamicTemplateResource) => void;
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
      showSlotAnnotations={false}
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
  return { definition: presentation.definition, previewKey: presentation.templateId };
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
    return `template:${target.template.templateId}`;
  }
  if (target.kind === "dynamic-local") return `local:${target.localDraftId}`;
  return "new";
}

function dataTemplateNameForTarget(target: TemplateEditorLibraryTarget) {
  if (target.kind === "dynamic-persisted") return target.template.templateId;
  if (target.kind === "dynamic-local") return target.localDraftId;
  return undefined;
}

function isDefinitionChecksum(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isIntegerAtLeast(value: unknown, minimum: number): value is number {
  return Number.isInteger(value) && Number(value) >= minimum;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isTemplateDefinitionFor(value: unknown, templateId: string) {
  const validation = validateDynamicTemplateDefinition(value);
  return Boolean(
    validation.valid
    && validation.definition
    && validation.definition.templateId === templateId,
  );
}

function hasSharedTemplatePresentationFields(value: Record<string, unknown>) {
  return isNonEmptyString(value.name)
    && typeof value.category === "string"
    && typeof value.purpose === "string"
    && typeof value.layoutType === "string"
    && isNullableString(value.description)
    && typeof value.slotSummary === "string"
    && isStringArray(value.recommendedFor)
    && isStringArray(value.tags);
}

function isDynamicTemplateResource(value: unknown): value is DynamicTemplateResource {
  if (!isRecord(value) || !isNonEmptyString(value.templateId)) return false;
  if (
    !isIntegerAtLeast(value.id, 1)
    || !(value.ownerId === null || isIntegerAtLeast(value.ownerId, 1))
    || (value.sourceType !== "SYSTEM" && value.sourceType !== "CUSTOM")
    || (value.visibility !== "PRIVATE" && value.visibility !== "STAFF")
    || (value.status !== "ACTIVE" && value.status !== "ARCHIVED")
    || !hasSharedTemplatePresentationFields(value)
    || !isIntegerAtLeast(value.definitionSchemaVersion, 1)
    || !isIntegerAtLeast(value.publishedVersion, 0)
    || !isNullableString(value.sourceReference)
    || !isNullableString(value.archivedAt)
    || typeof value.createdAt !== "string"
    || typeof value.updatedAt !== "string"
    || (value.canDelete !== undefined && typeof value.canDelete !== "boolean")
  ) return false;
  if (value.deleteBlockers !== undefined && (
    !Array.isArray(value.deleteBlockers)
    || !value.deleteBlockers.every((item) => isRecord(item)
      && typeof item.code === "string"
      && typeof item.message === "string")
  )) return false;
  if (value.draft === null) return true;
  if (!isRecord(value.draft)) return false;
  const draft = value.draft;
  return isIntegerAtLeast(draft.id, 1)
    && (draft.baseVersion === null || isIntegerAtLeast(draft.baseVersion, 1))
    && isIntegerAtLeast(draft.revision, 1)
    && isTemplateDefinitionFor(draft.definition, value.templateId)
    && isDefinitionChecksum(draft.definitionChecksum)
    && isNullableString(draft.versionNote)
    && typeof draft.updatedAt === "string";
}

function isPublishedTemplateResource(value: unknown): value is PublishedDynamicTemplateResource {
  if (!isRecord(value) || !isNonEmptyString(value.templateId)) return false;
  return hasSharedTemplatePresentationFields(value)
    && isNullableString(value.sourceReference)
    && isIntegerAtLeast(value.version, 1)
    && isIntegerAtLeast(value.schemaVersion, 1)
    && isTemplateDefinitionFor(value.definition, value.templateId)
    && isDefinitionChecksum(value.definitionChecksum)
    && isNullableString(value.versionNote)
    && typeof value.publishedAt === "string";
}

function isTemplateCatalogItemResource(value: unknown): value is TemplateCatalogItemResource {
  if (!isRecord(value)) return false;
  if (value.kind === "editable") return isDynamicTemplateResource(value.template);
  if (value.kind === "published") return isPublishedTemplateResource(value.template);
  return false;
}

function readDynamicCatalogChange(event: Event): DynamicTemplateCatalogChangeDetail | null {
  const value = (event as CustomEvent<unknown>).detail;
  if (!isRecord(value)) return null;
  const detail = value;
  if (detail.kind === "editable-upsert") {
    const identity = detail.identity;
    const template = detail.template;
    if (!isRecord(identity) || !isDynamicTemplateResource(template)) return null;
    const draft = template.draft;
    if (
      !draft
      || identity.templateId !== template.templateId
      || identity.templateId !== draft.definition.templateId
      || !Number.isInteger(identity.revision)
      || Number(identity.revision) <= 0
      || identity.revision !== draft.revision
      || !isDefinitionChecksum(identity.definitionChecksum)
      || identity.definitionChecksum !== draft.definitionChecksum
    ) return null;
    return detail as DynamicTemplateCatalogChangeDetail;
  }
  if (detail.kind === "verified-catalog") {
    const identity = detail.identity;
    const catalog = detail.catalog;
    if (
      !isRecord(identity)
      || !isRecord(catalog)
      || !Array.isArray(catalog.items)
      || !catalog.items.every(isTemplateCatalogItemResource)
      || (catalog.source !== undefined && catalog.source !== "unified")
      || !isNonEmptyString(identity.templateId)
      || !Number.isInteger(identity.version)
      || Number(identity.version) <= 0
      || !isDefinitionChecksum(identity.definitionChecksum)
      || !catalog.items.some((item) => item.kind === "published"
        && item.template.templateId === identity.templateId
        && item.template.version === identity.version
        && item.template.definitionChecksum === identity.definitionChecksum)
    ) return null;
    return detail as DynamicTemplateCatalogChangeDetail;
  }
  return null;
}

function DesignTemplateCard({
  device,
  entry,
  onArchive,
  onDelete,
  onOpen,
  onManage,
  onCreateDraftFromPublished,
  publishedDraftCreation,
  onRefresh,
  onRestore,
  viewMode,
}: {
  device: "desktop" | "mobile";
  entry: DesignCatalogEntry;
  onArchive?: (target: ArchivableTemplateEditorLibraryTarget, name: string) => void;
  onDelete?: (template: DynamicTemplateResource) => void;
  onOpen: (target: TemplateEditorLibraryTarget) => void;
  onManage?: (target: TemplateEditorLibraryTarget, action: "copy" | "copy-published" | "rename") => void;
  onCreateDraftFromPublished: (
    template: DynamicTemplateResource,
    published: PublishedDynamicTemplateResource,
  ) => void;
  publishedDraftCreation?: PublishedDraftCreationState | null;
  onRefresh: () => void;
  onRestore: (template: DynamicTemplateResource) => void;
  viewMode: TemplateCatalogViewMode;
}) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const archivedTemplate = entry.target.kind === "dynamic-persisted"
    && entry.target.template.status === "ARCHIVED"
    ? entry.target.template
    : null;
  const persistedTemplate = entry.target.kind === "dynamic-persisted"
    ? entry.target.template
    : null;
  const missingEditableDraft = Boolean(persistedTemplate && !persistedTemplate.draft);
  const publishedTemplate = entry.target.kind === "dynamic-persisted"
    ? entry.target.published
    : undefined;
  const currentDraftCreation = persistedTemplate
    && publishedTemplate
    && publishedDraftCreation?.templateId === persistedTemplate.templateId
    && publishedDraftCreation.expectedVersion === publishedTemplate.version
    && publishedDraftCreation.expectedChecksum === publishedTemplate.definitionChecksum
    ? publishedDraftCreation
    : null;
  const creatingEditableDraft = currentDraftCreation?.status === "creating";
  const detachedEditableDraft = currentDraftCreation?.status === "detached";
  const lifecycleLabel = getTemplatePublicationLabel(entry.lifecycle);
  const formalVersion = persistedTemplate?.publishedVersion;
  const purpose = persistedTemplate?.purpose;
  const deleteBlockedReason = persistedTemplate?.deleteBlockers?.[0]?.message
    ?? "此模板包含需要保留的版本、页面引用或历史关联数据。";
  const draftStateLabel = entry.draftState === "modified"
    ? "有未保存修改"
    : entry.draftState === "saved"
      ? "已保存"
      : entry.draftState === "unsaved"
        ? "尚未保存"
        : null;
  const inactiveDraftLabel = entry.lifecycle === "published-with-unpublished-changes"
    ? "草稿有修改"
    : entry.lifecycle === "published-current" || entry.lifecycle === "draft"
      ? "草稿已保存"
      : lifecycleLabel;
  const actionItems: MenuProps["items"] = missingEditableDraft
    ? [
        ...(!detachedEditableDraft ? [{
          key: "create-draft-from-published",
          icon: <EditOutlined />,
          disabled: creatingEditableDraft,
          label: creatingEditableDraft ? "正在建立编辑草稿" : "从正式版本建立编辑草稿",
        }] : []),
        {
          key: "reload-catalog",
          icon: <ReloadOutlined />,
          disabled: creatingEditableDraft,
          label: "重新读取目录",
        },
      ]
    : archivedTemplate
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
    : [
        {
          key: "open",
          icon: <EditOutlined />,
          label: "打开编辑",
        },
        onArchive && entry.target.kind !== "dynamic-local" && entry.target.kind !== "dynamic-new"
          ? {
              key: "move-to-trash",
              icon: <InboxOutlined />,
              danger: true,
              label: "移入回收站",
            }
          : {
              key: "local-trash-unavailable",
              icon: <InboxOutlined />,
              disabled: true,
              label: "本机测试草稿不支持回收站",
            },
      ];
  const handleActionClick: NonNullable<MenuProps["onClick"]> = ({ key }) => {
    setActionsOpen(false);
    if (key === "copy" || key === "copy-published" || key === "rename") onManage?.(entry.target, key);
    if (key === "open") onOpen(entry.target);
    if (
      key === "create-draft-from-published"
      && persistedTemplate
      && publishedTemplate
    ) onCreateDraftFromPublished(persistedTemplate, publishedTemplate);
    if (key === "reload-catalog") onRefresh();
    if (
      key === "move-to-trash"
      && entry.target.kind !== "dynamic-local"
      && entry.target.kind !== "dynamic-new"
    ) onArchive?.(entry.target, entry.name);
    if (key === "restore" && archivedTemplate) onRestore(archivedTemplate);
    if (key === "permanently-delete" && archivedTemplate?.canDelete) onDelete?.(archivedTemplate);
  };
  return (
    <TemplateCatalogCard
      active={entry.active}
      ariaLabel={missingEditableDraft
        ? `${withTemplateSuffix(entry.name)}缺少编辑草稿，可从正式版本 v${formalVersion ?? "未知"} 建立，状态：${lifecycleLabel}`
        : archivedTemplate
        ? `回收站模板“${entry.name}”，恢复后才能设计，状态：${lifecycleLabel}`
        : `${entry.active ? "正在编辑" : "打开"}${withTemplateSuffix(entry.name)}，${entry.active ? `当前草稿${draftStateLabel ? `，${draftStateLabel}` : ""}` : inactiveDraftLabel}${formalVersion ? `，线上 v${formalVersion}` : ""}`}
      className={`unified-template-library__card is-${device}${archivedTemplate ? " is-trash-template" : ""}${missingEditableDraft ? " is-draft-unavailable" : ""}`}
      compact={viewMode === "double"}
      dataTemplateIdentity={entry.identity}
      dataTemplateName={dataTemplateNameForTarget(entry.target)}
      disabled={Boolean(archivedTemplate) || creatingEditableDraft}
      name={entry.name}
      metadata={purpose && purpose !== entry.group && purpose !== entry.name ? purpose : undefined}
      actionLabel={missingEditableDraft
        ? creatingEditableDraft
          ? "正在建立编辑草稿…"
          : detachedEditableDraft
            ? "重新读取目录"
            : currentDraftCreation?.status === "failed"
              ? "重试建立编辑草稿"
              : "从正式版本建立编辑草稿"
        : archivedTemplate ? "恢复后可编辑" : "编辑模板"}
      disabledReason={missingEditableDraft
        ? currentDraftCreation?.reason
          ?? `当前没有可编辑草稿；确认后将从正式版本 v${formalVersion ?? "未知"} 创建，不会发布模板或修改页面`
        : archivedTemplate ? "请通过更多模板操作恢复模板" : undefined}
      preview={entry.preview}
      statusLabel={(
        <span
          className="template-editor__catalog-version-state"
          data-template-publication-status={entry.lifecycle ?? "unverifiable"}
        >
          <span className="template-editor__catalog-draft-state">
            {entry.active ? "当前草稿" : inactiveDraftLabel}
            {draftStateLabel ? ` · ${draftStateLabel}` : ""}
            {entry.lifecycleDetail ? ` · ${entry.lifecycleDetail}` : ""}
            {missingEditableDraft ? " · 缺少可编辑草稿" : ""}
          </span>
          {formalVersion ? (
            <span className="template-editor__catalog-published-state">线上 v{formalVersion}</span>
          ) : null}
        </span>
      )}
      onClick={archivedTemplate || creatingEditableDraft
        ? undefined
        : missingEditableDraft
          ? detachedEditableDraft
            ? onRefresh
            : persistedTemplate && publishedTemplate
              ? () => onCreateDraftFromPublished(persistedTemplate, publishedTemplate)
              : onRefresh
          : () => onOpen(entry.target)}
      trailingAction={(
        <Dropdown
          destroyOnHidden
          menu={{ items: onManage && !archivedTemplate ? [
            ...(actionItems ?? []),
            { type: "divider" },
            { key: "copy", label: entry.active ? "复制当前草稿" : missingEditableDraft ? `复制正式版 v${formalVersion}` : "复制草稿", disabled: missingEditableDraft && publishedTemplate?.schemaVersion === 1, title: missingEditableDraft && publishedTemplate?.schemaVersion === 1 ? "此旧正式版需先建立对应编辑草稿再复制" : undefined },
            ...(!missingEditableDraft && publishedTemplate ? [{ key: "copy-published", label: `复制正式版 v${formalVersion}`, disabled: publishedTemplate.schemaVersion === 1, title: publishedTemplate.schemaVersion === 1 ? "此旧正式版需先建立对应编辑草稿再复制" : undefined }] : []),
            ...(!missingEditableDraft ? [{ key: "rename", label: "重命名" }] : []),
          ] : actionItems, onClick: handleActionClick }}
          open={actionsOpen}
          onOpenChange={setActionsOpen}
          placement="bottomRight"
          transitionName=""
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

function PagePublishedTemplateCard({
  device,
  entry,
  getUpgradeCount,
  onActivate,
  onDragEnd,
  onDragStart,
  onPreview,
  onUpgrade,
  viewMode,
}: {
  device: "desktop" | "mobile";
  entry: PagePublishedCatalogEntry;
  getUpgradeCount: PageModeProps["getPublishedUpgradeCount"];
  onActivate: PageModeProps["onInsertPublished"];
  onDragEnd: PageModeProps["onPublishedDragEnd"];
  onDragStart: PageModeProps["onPublishedDragStart"];
  onPreview: (template: PublishedDynamicTemplateResource) => void;
  onUpgrade: PageModeProps["onUpgradePublished"];
  viewMode: TemplateCatalogViewMode;
}) {
  const upgradeCount = getUpgradeCount(entry.template);
  return (
    <TemplateCatalogCard
      ariaLabel={`预览${entry.name}版本${entry.template.version}`}
      className={`unified-template-library__card is-${device}`}
      compact={viewMode === "double"}
      controlClassName="homepage-editor__dynamic-template-card-main"
      dataTemplateIdentity={entry.identity}
      dataTemplateName={entry.template.templateId}
      draggable
      name={entry.name}
      preview={entry.preview}
      metadata={[entry.group, entry.template.definition.metadata.purpose].filter(Boolean).join(" · ")}
      statusLabel={`已发布 · v${entry.template.version}`}
      actionLabel="预览模板"
      onClick={() => onPreview(entry.template)}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData(
          "application/x-haichuan-published-template",
          `${entry.template.templateId}@${entry.template.version}`,
        );
        onDragStart(entry.template);
      }}
      onDragEnd={onDragEnd}
      trailingAction={(
        <span
          style={{
            display: "flex",
            gap: 4,
            position: "absolute",
            right: 0,
            top: 0,
            pointerEvents: "auto",
          }}
        >
          <button
            type="button"
            className="homepage-editor__template-upgrade-action"
            style={{ position: "static", width: "auto", padding: "0 9px", borderRadius: 16 }}
            onClick={() => onActivate(entry.template)}
            aria-label={`添加到页面：${entry.name} v${entry.template.version}`}
            title="添加到页面"
          >
            添加到页面
          </button>
          {upgradeCount > 0 ? (
            <button
              type="button"
              className="homepage-editor__template-upgrade-action"
              style={{ position: "static" }}
              onClick={() => onUpgrade(entry.template)}
              aria-label={`升级页面中的${entry.name}模板实例，共 ${upgradeCount} 处`}
              title={`升级页面中的${entry.name}模板实例，共 ${upgradeCount} 处`}
            >
              <ExclamationCircleOutlined />
            </button>
          ) : null}
        </span>
      )}
    />
  );
}

/** 页面装修与模板设计唯一的模板目录本体；只有最终动作按模式区分。 */
export function UnifiedTemplateLibrary(props: UnifiedTemplateLibraryProps) {
  const catalogActive = props.active ?? true;
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
  const [publishedPreview, setPublishedPreview] = useState<PublishedDynamicTemplateResource | null>(null);
  const [publishedPreviewDevice, setPublishedPreviewDevice] = useState<"desktop" | "mobile">(props.device);
  const templateScrollRef = useRef<HTMLDivElement>(null);
  const templateSessionId = props.mode === "design" ? props.sessionId : null;
  const readWorkspaceScroll = props.mode === "design" ? props.readWorkspaceScroll : null;
  const localOnly = props.mode === "design" && Boolean(props.localOnly);
  const newCanvasDraftId = props.mode === "design" && props.currentDraft?.sourceType === "local"
    && props.currentDraft.definition.metadata.canvasSize ? props.currentDraft.localDraftId : null;
  useEffect(() => {
    if (!newCanvasDraftId) return;
    setKeyword("");
    setDesignStatus("all");
    setDesignView("library");
  }, [newCanvasDraftId]);
  const [localDrafts, setLocalDrafts] = useState<StoredDynamicTemplateDraft[]>(() => (
    localOnly ? listLocalDynamicTemplateDrafts() : []
  ));
  const setLibraryCollapsed = useCallback((next: boolean) => {
    setCollapsed(next);
    try { window.sessionStorage.setItem(COLLAPSED_STORAGE_KEY, next ? "1" : "0"); } catch { /* 非关键偏好 */ }
  }, []);
  const openPublishedPreview = useCallback((template: PublishedDynamicTemplateResource) => {
    setPublishedPreviewDevice(props.device);
    setPublishedPreview(template);
  }, [props.device]);
  const publishedPreviewModel = useMemo(() => (
    publishedPreview
      ? createTemplateCatalogPreviewModel(publishedPreview.definition, publishedPreviewDevice)
      : null
  ), [publishedPreview, publishedPreviewDevice]);
  useLayoutEffect(() => {
    if (!readWorkspaceScroll || !templateSessionId || collapsed || catalogLoading) return;
    const element = templateScrollRef.current;
    if (!element) return;
    const scrollTop = readWorkspaceScroll().library;
    const frame = window.requestAnimationFrame(() => {
      element.scrollTop = scrollTop;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [catalogItems.length, catalogLoading, collapsed, localDrafts.length, readWorkspaceScroll, templateSessionId]);
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

  const applyCatalogItems = useCallback((items: TemplateCatalogItemResource[]) => {
    catalogRequestIdRef.current += 1;
    catalogItemsRef.current = items;
    setCatalogItems(items);
    setCatalogLoading(false);
    setCatalogError(null);
  }, []);

  const applyDynamicCatalogChange = useCallback((
    detail: DynamicTemplateCatalogChangeDetail,
  ) => {
    if (detail.kind === "verified-catalog") {
      applyCatalogItems(detail.catalog.items);
      return true;
    }
    const incoming = detail.template;
    const existingIndex = catalogItemsRef.current.findIndex((item) => (
      item.kind === "editable" && item.template.templateId === detail.identity.templateId
    ));
    if (existingIndex >= 0) {
      const existing = catalogItemsRef.current[existingIndex];
      if (existing.kind !== "editable") return false;
      const existingRevision = existing.template.draft?.revision ?? -1;
      const existingChecksum = existing.template.draft?.definitionChecksum ?? null;
      if (existingRevision > detail.identity.revision) return true;
      if (existingRevision === detail.identity.revision) {
        if (existingChecksum === detail.identity.definitionChecksum) return true;
        return false;
      }
      const nextItems = [...catalogItemsRef.current];
      nextItems[existingIndex] = { kind: "editable", template: incoming };
      applyCatalogItems(nextItems);
      return true;
    }
    applyCatalogItems([
      ...catalogItemsRef.current,
      { kind: "editable", template: incoming },
    ]);
    return true;
  }, [applyCatalogItems]);

  useEffect(() => {
    if (catalogActive) void refreshCatalog();
    const handleDynamicCatalogChanged = (event: Event) => {
      if (!catalogActive) return;
      const detail = readDynamicCatalogChange(event);
      if (!detail || !applyDynamicCatalogChange(detail)) void refreshCatalog();
    };
    const handleLocalChanged = () => setLocalDrafts(localOnly ? listLocalDynamicTemplateDrafts() : []);
    window.addEventListener(DYNAMIC_TEMPLATE_CATALOG_CHANGED_EVENT, handleDynamicCatalogChanged);
    window.addEventListener(DYNAMIC_TEMPLATE_LOCAL_DRAFT_CHANGED_EVENT, handleLocalChanged);
    return () => {
      catalogRequestIdRef.current += 1;
      window.removeEventListener(DYNAMIC_TEMPLATE_CATALOG_CHANGED_EVENT, handleDynamicCatalogChanged);
      window.removeEventListener(DYNAMIC_TEMPLATE_LOCAL_DRAFT_CHANGED_EVENT, handleLocalChanged);
    };
  }, [applyDynamicCatalogChange, catalogActive, localOnly, refreshCatalog]);

  const unifiedCatalog = useMemo(() => unifyTemplateCatalogItems(catalogItems), [catalogItems]);
  const catalogEntries = useMemo<UnifiedCatalogEntry[]>(() => {
    const entries: UnifiedCatalogEntry[] = [];
    for (const entry of unifiedCatalog) {
      const editable = entry.editable;
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
          entries.push({
            kind: "page-published",
            key: entry.key,
            identity: entry.key,
            group: presentation.category,
            name: presentation.name,
            ...renderUnifiedTemplatePreview(presentation, props.device),
            template: presentation.published,
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
          // 未首次发布的 CUSTOM 草稿只属于模板设计，不进入页面装修模板库。
          continue;
        }
        continue;
      }

      if (!matchesKeyword(
        keyword,
        editable?.name,
        editable?.category,
        editable?.description,
      )) continue;

      const ordinaryEditable = editable
        && editable.sourceType === "CUSTOM"
        ? editable
        : null;

      if (ordinaryEditable?.draft) {
        const active = props.activePersistedTemplateId === ordinaryEditable.templateId;
        const currentDefinition = active
          && props.currentDraft?.definition.templateId === ordinaryEditable.templateId
          ? props.currentDraft.definition
          : ordinaryEditable.draft.definition;
        const target: TemplateEditorLibraryTarget = {
          kind: "dynamic-persisted",
          template: ordinaryEditable,
          ...(entry.published ? { published: entry.published } : {}),
        };
        entries.push({
          kind: "design",
          key: entry.key,
          identity: identityForTarget(target),
          group: ordinaryEditable.category,
          active,
          draftState: active
            ? !props.currentDraftHasBaseline
              ? "unsaved"
              : props.currentDraftDirty
                ? "modified"
                : "saved"
            : undefined,
          lifecycle: resolveTemplatePublicationStatus({
            status: ordinaryEditable.status,
            publishedVersion: ordinaryEditable.publishedVersion,
            draftDefinitionChecksum: ordinaryEditable.draft.definitionChecksum,
            publishedDefinitionChecksum: entry.published?.version === ordinaryEditable.publishedVersion
              ? entry.published.definitionChecksum
              : null,
          }),
          name: ordinaryEditable.name,
          target,
          ...renderDynamicTemplatePreview(
            currentDefinition,
            props.device,
            `${ordinaryEditable.templateId}:draft`,
          ),
        });
        continue;
      }

      if (ordinaryEditable && entry.published) {
        const target: TemplateEditorLibraryTarget = {
          kind: "dynamic-persisted",
          template: ordinaryEditable,
          published: entry.published,
        };
        entries.push({
          kind: "design",
          key: entry.key,
          identity: identityForTarget(target),
          group: ordinaryEditable.category,
          active: false,
          lifecycle: ordinaryEditable.status === "ARCHIVED" ? "archived" : "published-current",
          name: ordinaryEditable.name,
          target,
          ...renderUnifiedTemplatePreview(presentation, props.device),
        });
      }
    }

    if (props.mode === "design" && localOnly) {
      for (const template of localDrafts) {
        if (!matchesKeyword(keyword, template.definition.name, template.definition.metadata.category)) continue;
        const target: TemplateEditorLibraryTarget = { kind: "dynamic-local", localDraftId: template.localDraftId };
        const active = props.activeLocalDraftId === template.localDraftId;
        const currentDefinition = active
          && props.currentDraft?.localDraftId === template.localDraftId
          ? props.currentDraft.definition
          : template.definition;
        entries.push({
          kind: "design",
          key: `local-${template.localDraftId}`,
          identity: identityForTarget(target),
          group: template.definition.metadata.category,
          active,
          draftState: active
            ? !props.currentDraftHasBaseline
              ? "unsaved"
              : props.currentDraftDirty
                ? "modified"
                : "saved"
            : undefined,
          lifecycle: "draft",
          name: template.definition.name,
          target,
          ...renderDynamicTemplatePreview(
            currentDefinition,
            props.device,
            `${currentDefinition.templateId}:draft`,
          ),
        });
      }
    }
    if (props.mode === "design" && props.currentDraft?.sourceType === "local"
      && !entries.some((entry) => entry.key === `local-${props.currentDraft?.localDraftId}`)) {
      const currentDraft = props.currentDraft;
      if (matchesKeyword(keyword, currentDraft.definition.name, currentDraft.definition.metadata.category)) {
        const target: TemplateEditorLibraryTarget = { kind: "dynamic-local", localDraftId: currentDraft.localDraftId! };
        entries.unshift({
          kind: "design", key: `local-${currentDraft.localDraftId}`,
          identity: identityForTarget(target), group: currentDraft.definition.metadata.category,
          active: true,
          draftState: !props.currentDraftHasBaseline
            ? "unsaved"
            : props.currentDraftDirty
              ? "modified"
              : "saved",
          lifecycle: "draft",
          name: currentDraft.definition.name, target,
          ...renderDynamicTemplatePreview(currentDraft.definition, props.device),
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
    <>
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
            : "点击卡片预览；使用“添加到页面”或拖拽完成添加"}
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
              <button
                type="button"
                aria-label="返回模板库"
                onClick={() => setDesignView("library")}
              >
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

      <div
        ref={templateScrollRef}
        className={`homepage-editor__template-scroll unified-template-library__scroll${viewMode === "double" ? " is-double" : ""}`}
        onScroll={props.mode === "design" && templateSessionId ? (event) => {
          props.updateWorkspaceScroll(templateSessionId, {
            library: event.currentTarget.scrollTop,
          });
        } : undefined}
      >
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
            return <div key={group} role="group" aria-label={group.endsWith("模板") ? group : `${group}模板`}>
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
                      onManage={props.onManage}
                      onCreateDraftFromPublished={props.onCreateDraftFromPublished}
                      publishedDraftCreation={props.publishedDraftCreation}
                      onRefresh={() => { void refreshCatalog(); }}
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
                      onPreview={openPublishedPreview}
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
                return null;
            })}
          </div>
          </div>
          })}
        </section>
        {!catalogLoading && !catalogError && visibleEntryCount === 0 ? (
          <div className="homepage-editor__library-empty">
            <p>{props.mode === "design" && designView === "trash"
              ? keyword ? "回收站中没有匹配的模板。" : "回收站为空。"
              : hasFilters
                ? "没有符合当前筛选条件的模板。"
                : props.mode === "page"
                  ? "尚无可添加的已发布模板。请先由超级管理员在模板设计中保存并发布模板。"
                  : "模板库中还没有已保存模板。"}</p>
            {!hasFilters && props.mode === "design" ? <p>选择用途、尺寸和布局，生成模板后继续精修。</p> : null}
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
    {props.mode === "page" && publishedPreview && publishedPreviewModel ? (
      <Modal
        title={`预览模板：${publishedPreview.name} · v${publishedPreview.version}`}
        open
        width={960}
        okText="添加到页面"
        cancelText="关闭预览"
        onOk={() => {
          props.onInsertPublished(publishedPreview);
          setPublishedPreview(null);
        }}
        onCancel={() => setPublishedPreview(null)}
      >
        <div style={{ display: "grid", gap: 12 }}>
          <p style={{ margin: 0 }}>
            {publishedPreview.name} · 精确版本 v{publishedPreview.version}。预览和设备切换不会修改页面；只有“添加到页面”才会创建实例。
          </p>
          <div role="group" aria-label="模板预览设备" style={{ display: "flex", gap: 8 }}>
            {(["desktop", "mobile"] as const).map((device) => (
              <Button
                key={device}
                size="small"
                type={publishedPreviewDevice === device ? "primary" : "default"}
                aria-pressed={publishedPreviewDevice === device}
                onClick={() => setPublishedPreviewDevice(device)}
              >
                {device === "desktop" ? "桌面端预览" : "移动端预览"}
              </Button>
            ))}
          </div>
          <div style={{ maxHeight: "60vh", overflow: "auto" }}>
            <DynamicTemplateCatalogPreview
              definition={publishedPreview.definition}
              device={publishedPreviewDevice}
              previewKey={`${publishedPreview.templateId}@${publishedPreview.version}`}
              previewModel={publishedPreviewModel}
            />
          </div>
        </div>
      </Modal>
    ) : null}
    </>
  );
}

export default function TemplateEditorLibrary({
  draft,
  dirty,
  hasBaseline,
  device,
  sessionId,
  readWorkspaceScroll,
  updateWorkspaceScroll,
  onArchive,
  onDelete,
  onCreateDraftFromPublished,
  onOpen,
  onManage,
  publishedDraftCreation,
  onRestore,
  localOnly = false,
}: {
  draft: TemplateEditorDraft | null;
  dirty: boolean;
  hasBaseline: boolean;
  device: "desktop" | "mobile";
  sessionId: string | null;
  readWorkspaceScroll: () => TemplateWorkspaceScrollState;
  updateWorkspaceScroll: (
    sessionId: string,
    updates: Partial<TemplateWorkspaceScrollState>,
  ) => void;
  onArchive: (target: ArchivableTemplateEditorLibraryTarget, name: string) => void;
  onDelete: (template: DynamicTemplateResource) => void;
  onCreateDraftFromPublished: (
    template: DynamicTemplateResource,
    published: PublishedDynamicTemplateResource,
  ) => void;
  onOpen: (target: TemplateEditorLibraryTarget) => void;
  onManage?: (target: TemplateEditorLibraryTarget, action: "copy" | "copy-published" | "rename") => void;
  publishedDraftCreation?: PublishedDraftCreationState | null;
  onRestore: (template: DynamicTemplateResource) => void;
  localOnly?: boolean;
}) {
  return (
    <UnifiedTemplateLibrary
      mode="design"
      active
      device={device}
      sessionId={sessionId}
      readWorkspaceScroll={readWorkspaceScroll}
      updateWorkspaceScroll={updateWorkspaceScroll}
      localOnly={localOnly}
      currentDraft={draft}
      currentDraftDirty={dirty}
      currentDraftHasBaseline={hasBaseline}
      activeSourceReference={draft?.sourceReference ?? null}
      activePersistedTemplateId={draft?.sourceType === "persisted" ? draft.definition.templateId : null}
      activeLocalDraftId={draft?.sourceType === "local" ? draft.localDraftId : null}
      onArchive={onArchive}
      onDelete={onDelete}
      onCreateDraftFromPublished={onCreateDraftFromPublished}
      onOpen={onOpen}
      onManage={onManage}
      publishedDraftCreation={publishedDraftCreation}
      onRestore={onRestore}
    />
  );
}
