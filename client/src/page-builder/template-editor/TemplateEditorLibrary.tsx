import {
  AppstoreOutlined,
  ExclamationCircleOutlined,
  LeftOutlined,
  PlusOutlined,
  ReloadOutlined,
  RightOutlined,
} from "@ant-design/icons";
import { Spin } from "antd";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { BLOCK_META } from "../config/blockMeta";
import ContentTemplateRendererPreview from "../preview/ContentTemplateRendererPreview";
import { DynamicTemplateRenderer } from "../template-definition";
import {
  resolveUnifiedTemplateCatalogPresentation,
  unifyTemplateCatalogItems,
  type UnifiedTemplateCatalogPresentation,
} from "../templates/unifiedTemplateCatalog";
import WorkspacePanelHeader from "../workspace/WorkspacePanelHeader";
import {
  DYNAMIC_TEMPLATE_LOCAL_DRAFT_CHANGED_EVENT,
  listLocalDynamicTemplateDrafts,
  type StoredDynamicTemplateDraft,
} from "./dynamicTemplateDraftRepository";
import TemplateCatalogCard from "./TemplateCatalogCard";
import TemplateCatalogControls, { type TemplateCatalogViewMode } from "./TemplateCatalogControls";
import { groupTemplateCatalogEntries } from "./templateCatalogGrouping";
import { DYNAMIC_TEMPLATE_CATALOG_CHANGED_EVENT } from "./templateCatalogEvents";
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
  | { kind: "dynamic-persisted"; template: DynamicTemplateResource }
  | { kind: "dynamic-local"; localDraftId: string }
  | { kind: "dynamic-new" };

interface CatalogEntryBase {
  key: string;
  identity: string;
  group: string;
  badge?: string;
  description: string;
  name: string;
  preview: ReactNode;
}

interface DesignCatalogEntry extends CatalogEntryBase {
  kind: "design";
  active: boolean;
  target: TemplateEditorLibraryTarget;
}

interface PageSystemCatalogEntry extends CatalogEntryBase {
  kind: "page-system";
  moduleType: string;
  current: SystemContentTemplateCurrent;
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
  onRestore: (template: DynamicTemplateResource) => void;
  onDragTargetChange: (target: TemplateEditorLibraryTarget | null) => void;
}

interface PageModeProps {
  mode: "page";
  device: "desktop" | "mobile";
  isSystemTemplateAllowed: (moduleType: string) => boolean;
  onInsertSystem: (moduleType: string, current: SystemContentTemplateCurrent) => void;
  onSystemDragStart: (moduleType: string, current: SystemContentTemplateCurrent) => void;
  onSystemDragEnd: () => void;
  onInsertPublished: (template: PublishedDynamicTemplateResource) => void;
  onPublishedDragStart: (template: PublishedDynamicTemplateResource) => void;
  onPublishedDragEnd: () => void;
  getSystemUpgradeCount: (current: SystemContentTemplateCurrent) => number;
  onUpgradeSystem: (current: SystemContentTemplateCurrent) => void;
}

export type UnifiedTemplateLibraryProps = DesignModeProps | PageModeProps;

function matchesKeyword(keyword: string, ...values: Array<string | undefined | null>) {
  const normalized = keyword.trim().toLocaleLowerCase("zh-CN");
  if (!normalized) return true;
  return values.some((value) => value?.toLocaleLowerCase("zh-CN").includes(normalized));
}

function renderUnifiedTemplatePreview(
  presentation: UnifiedTemplateCatalogPresentation,
  device: "desktop" | "mobile",
) {
  if (presentation.source === "published" || presentation.source === "draft") {
    return (
      <DynamicTemplateRenderer
        definition={presentation.definition}
        device={device}
        mode="thumbnail"
      />
    );
  }
  if (presentation.source === "system-compatibility") {
    return (
      <ContentTemplateRendererPreview
        moduleType={presentation.current.moduleType}
        viewport={device}
        layoutData={presentation.current.layoutData}
        variant="renderer"
      />
    );
  }
  return (
    <ContentTemplateRendererPreview
      moduleType={presentation.personal.moduleType}
      viewport={device}
      layoutData={presentation.personal.layoutData}
      variant="renderer"
    />
  );
}

function readInitialViewMode(): TemplateCatalogViewMode {
  try {
    return window.localStorage.getItem(VIEW_MODE_STORAGE_KEY) === "single" ? "single" : "double";
  } catch {
    return "double";
  }
}

function readInitialCollapsed() {
  try {
    return window.matchMedia("(max-width: 900px), (min-width: 1200px) and (max-width: 1439px)").matches
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
  onDragTargetChange,
  onOpen,
  onRestore,
  viewMode,
}: {
  device: "desktop" | "mobile";
  entry: DesignCatalogEntry;
  onDragTargetChange: (target: TemplateEditorLibraryTarget | null) => void;
  onOpen: (target: TemplateEditorLibraryTarget) => void;
  onRestore: (template: DynamicTemplateResource) => void;
  viewMode: TemplateCatalogViewMode;
}) {
  const archivedTemplate = entry.target.kind === "dynamic-persisted"
    && entry.target.template.status === "ARCHIVED"
    ? entry.target.template
    : null;
  return (
    <TemplateCatalogCard
      active={entry.active}
      ariaLabel={archivedTemplate
        ? `已归档模板“${entry.name}”，恢复后才能设计`
        : `${entry.active ? "正在编辑" : "打开"}${entry.name}模板`}
      badge={entry.badge}
      className={`unified-template-library__card is-${device}`}
      compact={viewMode === "double"}
      dataTemplateIdentity={entry.identity}
      description={entry.description}
      disabled={Boolean(archivedTemplate)}
      draggable={!archivedTemplate}
      name={entry.name}
      preview={entry.preview}
      actionHint={archivedTemplate ? "恢复后可设计" : "点击打开 · 拖到画布打开"}
      onClick={() => onOpen(entry.target)}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "link";
        event.dataTransfer.setData("application/x-haichuan-template-library", entry.target.kind);
        onDragTargetChange(entry.target);
      }}
      onDragEnd={() => onDragTargetChange(null)}
      trailingAction={archivedTemplate ? (
        <button
          type="button"
          className="homepage-editor__template-design-action"
          onClick={() => onRestore(archivedTemplate)}
          aria-label={`恢复模板“${entry.name}”`}
          title="恢复后重新进入模板目录；不会修改已有页面实例"
        >
          <ReloadOutlined />
          恢复
        </button>
      ) : null}
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
  return (
    <TemplateCatalogCard
      ariaLabel={`${entry.name}：点击添加到页面末尾，也可拖到画布指定位置`}
      badge={entry.badge}
      className={`unified-template-library__card is-${device}`}
      compact={viewMode === "double"}
      controlClassName="homepage-editor__template-card-activate"
      dataTemplateIdentity={entry.identity}
      dataTemplateName={entry.moduleType}
      description={entry.description}
      draggable
      name={entry.name}
      preview={entry.preview}
      actionHint="点击添加 · 可拖拽"
      onClick={() => onActivate(entry.moduleType, entry.current)}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData("application/x-haichuan-page-template", entry.moduleType);
        onDragStart(entry.moduleType, entry.current);
      }}
      onDragEnd={onDragEnd}
      title={`点击添加${entry.name}到页面末尾，也可拖到画布指定位置`}
      trailingAction={upgradeCount > 0 ? (
        <button
          type="button"
          className="homepage-editor__template-design-action"
          onClick={() => onUpgrade(entry.current)}
          aria-label={`升级页面中的${entry.name}模板`}
        >
          <ExclamationCircleOutlined />
          发现新版 · 升级 {upgradeCount} 处
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
  const [catalogItems, setCatalogItems] = useState<TemplateCatalogItemResource[]>([]);
  const catalogItemsRef = useRef<TemplateCatalogItemResource[]>([]);
  const catalogRequestIdRef = useRef(0);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const localOnly = props.mode === "design" && Boolean(props.localOnly);
  const [localDrafts, setLocalDrafts] = useState<StoredDynamicTemplateDraft[]>(() => (
    localOnly ? listLocalDynamicTemplateDrafts() : []
  ));

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

  const setLibraryCollapsed = (next: boolean) => {
    setCollapsed(next);
    try { window.sessionStorage.setItem(COLLAPSED_STORAGE_KEY, next ? "1" : "0"); } catch { /* 非关键偏好 */ }
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
        if (presentation.source === "published" && matchesKeyword(
          keyword,
          presentation.published.name,
          presentation.published.description,
          presentation.published.category,
          presentation.published.purpose,
          ...presentation.published.tags,
        )) {
          const hasUnpublishedChanges = Boolean(entry.editable?.draft && (
            entry.editable.draft.baseVersion !== presentation.published.version
            || entry.editable.draft.definitionChecksum !== presentation.published.definitionChecksum
          ));
          entries.push({
            kind: "page-published",
            key: entry.key,
            identity: entry.key,
            group: presentation.category,
            badge: `已发布 v${presentation.published.version}${hasUnpublishedChanges ? " · 有草稿" : ""}`,
            description: `${presentation.description}${hasUnpublishedChanges ? " · 有未发布修改" : ""}`,
            name: presentation.name,
            preview: renderUnifiedTemplatePreview(presentation, props.device),
            template: presentation.published,
          });
          continue;
        }
        if (presentation.source === "draft") {
          // 归档只影响新页面可选目录；设计模式仍保留归档管理入口。
          if (presentation.editable.status === "ARCHIVED") continue;
          if (current && !props.isSystemTemplateAllowed(current.moduleType)) continue;
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
              badge: current.activeVersion > 0
                ? `系统 v${current.activeVersion} · 有草稿`
                : "系统基线 · 有草稿",
              description: `${currentMeta.description} · 模板设计中有未发布修改，页面继续使用当前可用版本`,
              name: currentMeta.name,
              preview: renderUnifiedTemplatePreview(currentPresentation, props.device),
              moduleType: current.moduleType,
              current,
            });
            continue;
          }
          entries.push({
            kind: "page-draft",
            key: entry.key,
            identity: entry.key,
            group: presentation.category,
            description: `${presentation.description} · 完成首次发布后会自动进入页面组件库`,
            name: presentation.name,
            preview: renderUnifiedTemplatePreview(presentation, props.device),
            template: presentation.editable,
          });
          continue;
        }
        if (presentation.source === "system-compatibility") {
          if (!props.isSystemTemplateAllowed(presentation.current.moduleType)) continue;
          const meta = BLOCK_META[presentation.current.moduleType];
          if (!meta || !matchesKeyword(
            keyword,
            presentation.current.moduleType,
            meta.name,
            meta.description,
            ...meta.tags,
          )) continue;
          entries.push({
            kind: "page-system",
            key: entry.key,
            identity: entry.key,
            group: meta.category,
            ...(presentation.current.activeVersion > 0
              ? { badge: `系统 v${presentation.current.activeVersion}` }
              : {}),
            description: meta.description,
            name: meta.name,
            preview: renderUnifiedTemplatePreview(presentation, props.device),
            moduleType: presentation.current.moduleType,
            current: presentation.current,
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
        const target: TemplateEditorLibraryTarget = { kind: "dynamic-persisted", template: editable };
        entries.push({
          kind: "design",
          key: entry.key,
          identity: identityForTarget(target),
          group: editable.category,
          active: props.activePersistedTemplateId === editable.templateId,
          ...(editable.status === "ARCHIVED"
            ? { badge: "已归档" }
            : editable.publishedVersion > 0
              ? { badge: `草稿 · 已发布 v${editable.publishedVersion}` }
              : {}),
          name: editable.name,
          description: editable.slotSummary,
          target,
          preview: renderUnifiedTemplatePreview(presentation, props.device),
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
          ...(current.activeVersion > 0 ? { badge: `系统 v${current.activeVersion}` } : {}),
          name: meta?.name ?? current.displayName,
          description: meta?.description ?? current.displayName,
          target,
          preview: renderUnifiedTemplatePreview(presentation, props.device),
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
        badge: "个人模板 · 发布后可用于页面",
        name: personal.name,
        description: `${BLOCK_META[personal.moduleType]?.name ?? personal.moduleType} · 待发布`,
        target,
        preview: renderUnifiedTemplatePreview(presentation, props.device),
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
          badge: "本机草稿",
          name: template.definition.name,
          description: `${template.definition.metadata.category} · 尚未发布`,
          target,
          preview: <DynamicTemplateRenderer definition={template.definition} device={props.device} mode="thumbnail" />,
        });
      }
    }
    return entries;
  }, [keyword, localDrafts, localOnly, props, unifiedCatalog]);

  const groupedCatalogEntries = useMemo(
    () => groupTemplateCatalogEntries(catalogEntries, (entry) => entry.group),
    [catalogEntries],
  );

  if (collapsed) {
    return (
      <aside
        className="homepage-editor__library homepage-editor__library--collapsed"
        aria-label="模板组件库（已收起）"
        data-unified-template-library={props.mode}
      >
        <button
          type="button"
          className="homepage-editor__library-expand-btn admin-panel-collapse-toggle"
          onClick={() => setLibraryCollapsed(false)}
          title="展开模板组件库"
          aria-label="展开模板组件库"
        >
          <RightOutlined />
        </button>
      </aside>
    );
  }

  return (
    <aside
      className="homepage-editor__library template-editor__library"
      aria-label="模板组件库"
      data-unified-template-library={props.mode}
    >
      <div className="homepage-editor__library-tools">
        <WorkspacePanelHeader
          icon={<AppstoreOutlined />}
          title="模板组件库"
          actions={(
            <button
              type="button"
              className="homepage-editor__library-collapse-btn admin-panel-collapse-toggle"
              onClick={() => setLibraryCollapsed(true)}
              title="收起模板组件库"
              aria-label="收起模板组件库"
            >
              <LeftOutlined />
            </button>
          )}
        />
        <TemplateCatalogControls
          keyword={keyword}
          onKeywordChange={setKeyword}
          placeholder="搜索模板"
          searchAriaLabel="搜索模板"
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          tip={props.mode === "design" ? "点击打开设计，也可拖入画布" : "点击添加，也可拖到画布"}
          countLabel={String(catalogEntries.length)}
          countTitle={`当前显示 ${catalogEntries.length} 个模板`}
        />
      </div>

      <div className={`homepage-editor__template-scroll unified-template-library__scroll${viewMode === "double" ? " is-double" : ""}`}>
        <div
          className="homepage-editor__template-group homepage-editor__template-catalog-heading"
          aria-labelledby="unified-template-catalog-heading"
        >
          <div className="homepage-editor__template-group-heading">
            <h3 id="unified-template-catalog-heading">模板目录</h3>
            {props.mode === "design" ? (
              <button
                type="button"
                className="homepage-editor__library-empty-action"
                onClick={() => props.onOpen({ kind: "dynamic-new" })}
              >
                <PlusOutlined /> 新建空白模板
              </button>
            ) : null}
          </div>
        </div>
        {catalogLoading ? (
          <div className="homepage-editor__library-empty" role="status">
            <Spin size="small" />
            <p>正在读取模板目录…</p>
          </div>
        ) : null}
        {catalogError ? (
          <div className="homepage-editor__library-empty is-error" role="alert">
            <p>{catalogError}</p>
            <button type="button" onClick={() => { void refreshCatalog(); }}>重新读取</button>
          </div>
        ) : null}
        <section className="homepage-editor__template-group" aria-label="模板列表">
          <div className="homepage-editor__template-group-grid">
            {groupedCatalogEntries.flatMap(({ entries }) => entries).map((entry) => {
                if (entry.kind === "design" && props.mode === "design") {
                  return (
                    <DesignTemplateCard
                      key={entry.key}
                      device={props.device}
                      entry={entry}
                      onOpen={props.onOpen}
                      onRestore={props.onRestore}
                      onDragTargetChange={props.onDragTargetChange}
                      viewMode={viewMode}
                    />
                  );
                }
                if (entry.kind === "page-published" && props.mode === "page") {
                  return (
                    <TemplateCatalogCard
                      key={entry.key}
                      ariaLabel={`添加${entry.name}版本${entry.template.version}`}
                      badge={entry.badge}
                      className={`unified-template-library__card is-${props.device}`}
                      compact={viewMode === "double"}
                      controlClassName="homepage-editor__dynamic-template-card-main"
                      dataTemplateIdentity={entry.identity}
                      description={entry.description}
                      draggable
                      name={entry.name}
                      preview={entry.preview}
                      actionHint="点击添加 · 可拖拽"
                      onClick={() => props.onInsertPublished(entry.template)}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "copy";
                        event.dataTransfer.setData(
                          "application/x-haichuan-published-template",
                          `${entry.template.templateId}@${entry.template.version}`,
                        );
                        props.onPublishedDragStart(entry.template);
                      }}
                      onDragEnd={props.onPublishedDragEnd}
                      title={`点击添加${entry.name}到页面末尾，也可拖到画布指定位置`}
                    />
                  );
                }
                if (entry.kind === "page-draft" && props.mode === "page") {
                  return (
                    <TemplateCatalogCard
                      key={entry.key}
                      ariaLabel={`新模板“${entry.name}”尚未首次发布，暂时不能添加到页面`}
                      badge="新模板草稿 · 待首次发布"
                      className={`unified-template-library__card is-${props.device}`}
                      compact={viewMode === "double"}
                      dataTemplateIdentity={entry.identity}
                      dataTemplateName={entry.template.templateId}
                      description={entry.description}
                      disabled
                      name={entry.name}
                      preview={entry.preview}
                      actionHint="首次发布后可添加"
                      title="请从顶部“进入模板设计”完成首次发布；页面模板卡不会进入模板设计"
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
        {!catalogLoading && catalogEntries.length === 0 ? (
          <div className="homepage-editor__library-empty">
            <p>没有匹配的模板。</p>
            {keyword ? <button type="button" onClick={() => setKeyword("")}>清除搜索</button> : null}
          </div>
        ) : null}
      </div>
    </aside>
  );
}

export default function TemplateEditorLibrary({
  onDragTargetChange,
  onOpen,
  onRestore,
  localOnly = false,
}: {
  onDragTargetChange: (target: TemplateEditorLibraryTarget | null) => void;
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
      onOpen={onOpen}
      onRestore={onRestore}
      onDragTargetChange={onDragTargetChange}
    />
  );
}
