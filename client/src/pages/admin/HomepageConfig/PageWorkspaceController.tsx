import { App as AntdApp } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  pageDocumentApi,
  type PageDocumentResource,
  type PersonalContentTemplate,
} from "@/services/api";
import { dynamicTemplateApi, type TemplateCatalogResource } from "@/services/clients/dynamicTemplateClient";
import { unwrapResponse } from "@/utils/unwrap";
import {
  createEditorPageDefault,
  ensureEditorPageStructure,
  getEditorPage,
  getEditorPageByPath,
  type EditorPageKey,
} from "@/page-builder/config/editorPages";
import { migratePuckData } from "@/page-builder/utils/migratePuckData";
import {
  DYNAMIC_TEMPLATE_BLOCK_TYPE,
  DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY,
  dynamicTemplateVersionKey,
  replaceResolvedDynamicTemplates,
  useResolvedDynamicTemplateDefinitions,
} from "@/page-builder/dynamic-template-instance";
import { upgradePersonalTemplateInstances } from "@/page-builder/templates/templateOrigin";
import type {
  PublishValidationIssue,
  PublishValidationStatus,
} from "@/page-builder/inspector/publishValidation";
import type { ContentTemplateMediaRight } from "@/page-builder/generated/contentTemplates.generated";
import { USE_MOCK } from "@/services/mockData";
import type { PuckDocument, PuckProps } from "@/page-builder/types";
import {
  CANVAS_PAGE_NAVIGATION_MESSAGE,
  type CanvasPageNavigationMessage,
  type PageDocumentRevision,
  type PageDraftSnapshot,
  type PageSessionCache,
} from "./editor-store";
import {
  canonicalizePageContent,
  dataSignature,
  formatEditorTime,
  getPuckDocument,
  normalizePuckMetadata,
  resolvePublishValidationIssues,
} from "./editor-utils";
import {
  getEditorErrorMessage,
  getEditorHttpStatus,
} from "@/page-builder/workspace/editorLifecycleErrors";

export function usePageWorkspaceController({
  pageKey,
  canPublish,
}: {
  pageKey: EditorPageKey;
  canPublish: boolean;
}) {
  const { message, modal } = AntdApp.useApp();
  const navigate = useNavigate();
  const [data, setData] = useState<PuckDocument>(() => createEditorPageDefault(pageKey));
  const resolvedDynamicTemplateDefinitions = useResolvedDynamicTemplateDefinitions();
  const resolvedDefinitionsPayload = data[DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY];
  const waitsForResolvedDynamicTemplates = Boolean(
    resolvedDefinitionsPayload
    && typeof resolvedDefinitionsPayload === "object"
    && !Array.isArray(resolvedDefinitionsPayload)
    && Object.keys(resolvedDefinitionsPayload).length > 0,
  );
  const resolvedDynamicTemplatesReady = !waitsForResolvedDynamicTemplates || (data.content ?? []).every((block) => {
    if (block.type !== DYNAMIC_TEMPLATE_BLOCK_TYPE) return true;
    const templateId = block.props?.templateId;
    const templateVersion = block.props?.templateVersion;
    return typeof templateId === "string"
      && typeof templateVersion === "number"
      && Boolean(resolvedDynamicTemplateDefinitions[dynamicTemplateVersionKey(templateId, templateVersion)]);
  });
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishIssues, setPublishIssues] = useState<PublishValidationIssue[]>(
    [],
  );
  const [publishValidationStatus, setPublishValidationStatus] =
    useState<PublishValidationStatus>("idle");
  const [validationRevision, setValidationRevision] = useState(0);
  const validationRequestRef = useRef(0);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [revisionsOpen, setRevisionsOpen] = useState(false);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [revisions, setRevisions] = useState<PageDocumentRevision[]>([]);
  const [restoringVersion, setRestoringVersion] = useState<number | null>(null);
  const [rollingBackRevisionId, setRollingBackRevisionId] = useState<number | null>(null);
  const [revisionFailure, setRevisionFailure] = useState<{
    message: string;
    revision?: PageDocumentRevision;
    action?: "restore" | "rollback";
  } | null>(null);
  const [draftDiscardError, setDraftDiscardError] = useState<string | null>(
    null,
  );
  const [draftSnapshot, setDraftSnapshot] = useState<PageDraftSnapshot | null>(
    null,
  );
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadedPageKey, setLoadedPageKey] = useState<EditorPageKey | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const hasInitializedEditorRef = useRef(false);
  const activePageKeyRef = useRef(pageKey);
  const latestData = useRef<PuckDocument>(data);
  const controlledCanvasStateRef = useRef<{
    hasUnsavedChanges: boolean;
    baselineSignature: string | null;
  } | null>(null);
  const [canvasDataSyncVersion, setCanvasDataSyncVersion] = useState(0);
  const pageSessionCacheRef = useRef<Record<string, PageSessionCache>>({});
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const dataSignatureRef = useRef("");  const [metadata, setMetadata] = useState<PuckProps>({});
  const latestMetadata = useRef<PuckProps>({});
  const [pageSettingsOpen, setPageSettingsOpen] = useState(false);
  const [pageSettingsFocusField, setPageSettingsFocusField] = useState<string | null>(null);
  // 是否存在尚未发布的草稿修改。
  const [hasPendingDraft, setHasPendingDraft] = useState(false);
  const [publishedNeedsRevalidation, setPublishedNeedsRevalidation] = useState(false);
  const pendingDraftRef = useRef<PuckDocument | null>(null);
  const editingDraftSnapshotRef = useRef<{
    data: PuckDocument;
    metadata: PuckProps;
    hasUnsavedChanges: boolean;
    hasPendingDraft: boolean;
    savedSignature: string;
  } | null>(null);
  const publishedBaselineRef = useRef<string | null>(null);
  const publishedDataRef = useRef<PuckDocument | null>(null);
  // 当前画布是否展示线上已发布版本（“查看线上版本”模式）。
  const [viewingPublished, setViewingPublished] = useState(false);
  // 供画布编辑回调读取最新“查看线上版本”状态，避免闭包过期。
  const viewingPublishedRef = useRef(false);
  // 线上版本的 metadata，供“查看线上版本”时还原。
  const publishedMetadataRef = useRef<PuckProps>({});
  const hasProtectedUnsavedChanges =
    hasUnsavedChanges ||
    (viewingPublished &&
      editingDraftSnapshotRef.current?.hasUnsavedChanges === true);
  useEffect(() => {
    activePageKeyRef.current = pageKey;
    setPreviewMode(false);
  }, [pageKey]);

  useEffect(() => {
    viewingPublishedRef.current = viewingPublished;
  }, [viewingPublished]);


  useEffect(() => {
    latestData.current = data;
  }, [data]);

  useEffect(() => {
    // 解析结果按页面会话隔离。切换页面时必须先清空，避免另一页面暂存的
    // 精确模板版本短暂参与当前画布渲染。
    replaceResolvedDynamicTemplates(undefined);
  }, [pageKey]);

  useEffect(() => {
    // resolvedDynamicTemplates 是服务端注入的只读解析缓存，不是页面实例
    // 的业务数据。Puck 的撤销/重做快照会省略未知顶层字段；此时保留当前
    // 页面会话已验证的精确版本，不能把“字段缺失”解释为“清空缓存”。
    const resolvedDefinitions = data[DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY];
    if (
      resolvedDefinitions
      && typeof resolvedDefinitions === "object"
      && !Array.isArray(resolvedDefinitions)
      && Object.keys(resolvedDefinitions).length > 0
    ) {
      replaceResolvedDynamicTemplates(resolvedDefinitions);
    }
  }, [data]);

  useEffect(() => {
    latestMetadata.current = metadata;
  }, [metadata]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadedPageKey(null);
      setHasUnsavedChanges(false);
      setHasPendingDraft(false);
      setPublishedNeedsRevalidation(false);
      setViewingPublished(false);
      setPublishIssues([]);
      setPublishValidationStatus("idle");
      setRevisions([]);
      setDraftSnapshot(null);
      setRevisionFailure(null);
      setDraftDiscardError(null);
      setRevisionsOpen(false);
      setPageSettingsOpen(false);
      pendingDraftRef.current = null;
      editingDraftSnapshotRef.current = null;
      publishedBaselineRef.current = null;
      publishedDataRef.current = null;
      publishedMetadataRef.current = {};
      let serverData = createEditorPageDefault(pageKey);
      const cachedPage = pageSessionCacheRef.current[pageKey];
      if (!cancelled) {
        setLoadError(null);
        setViewingPublished(false);
        // 首次进入才展示整页加载态；切换页面时只替换画布数据，保持编辑器外壳稳定。
        if (!hasInitializedEditorRef.current) setInitialLoading(true);
        // 已访问页面直接恢复会话，避免默认模板闪现和重复全量更新。
        if (cachedPage) {
          serverData = cachedPage.data;
          setData(cachedPage.data);
          latestData.current = cachedPage.data;
          dataSignatureRef.current = dataSignature(cachedPage.data);
          setMetadata(cachedPage.metadata);
          latestMetadata.current = cachedPage.metadata;
        } else if (!hasInitializedEditorRef.current) {
          setData(serverData);
          latestData.current = serverData;
          dataSignatureRef.current = dataSignature(serverData);
          setMetadata({});
          latestMetadata.current = {};
        }
        setHasUnsavedChanges(false);
      }
      try {
        // 同时拉取线上已发布版本与后台草稿。店铺装修入口始终进入可编辑状态：
        // 有后台草稿时加载草稿；仅有线上版本时以线上内容作为新草稿的编辑基线。
        const [publishedResponse, adminResponse, templateCatalogResponse] = await Promise.all([
          pageDocumentApi.getPublishedAdmin(pageKey),
          pageDocumentApi.getAdmin(pageKey),
          dynamicTemplateApi.listCatalog().catch(() => null),
        ]);
        if (cancelled) return;
        const publishedDoc = unwrapResponse<PageDocumentResource | null>(publishedResponse);
        const adminDoc = unwrapResponse<PageDocumentResource | null>(adminResponse);
        const publishedPuck = getPuckDocument(publishedDoc?.puckData);
        const draftPuck = getPuckDocument(adminDoc?.puckData);

        const nextHasPublished = Boolean(publishedPuck);
        setPublishedNeedsRevalidation(
          nextHasPublished && publishedDoc?.publicationAttested === false,
        );
        // 草稿差异判定须同时比较 content 与 metadata：
        // 仅改 SEO 等 metadata 而未动内容的草稿，此前会被误判为“与线上一致”，
        // 导致刷新后既不提示草稿、也不提供“继续编辑草稿”入口。
        const nextHasPendingDraft =
          nextHasPublished &&
          Boolean(draftPuck) &&
          canonicalizePageContent(draftPuck, adminDoc?.metadata) !==
            canonicalizePageContent(publishedPuck, publishedDoc?.metadata);

        publishedMetadataRef.current = normalizePuckMetadata(publishedDoc?.metadata);

        // 编辑基准：后台草稿始终优先；没有草稿时才以线上版本作为新草稿基线。
        // 「查看线上版本」只由运营主动触发，不再作为进入店铺装修时的默认模式。
        if (publishedPuck || draftPuck) {
          const displayPuck = draftPuck ?? publishedPuck;
          if (!displayPuck) return;
          // 历史模块别名（分割面板/图文混排/礼赠指南）只在编辑器读取时规范化；
          // 公开 Renderer 继续按原类型重放已发布历史版本。
          serverData = ensureEditorPageStructure(
            pageKey,
            migratePuckData(displayPuck),
          );
          const persistedServerData = serverData;
          const templateCatalog = templateCatalogResponse
            ? unwrapResponse<TemplateCatalogResource>(templateCatalogResponse)
            : null;
          const personalTemplates = Array.isArray(templateCatalog?.items)
            ? templateCatalog.items.flatMap((item) => (
                item.kind === "personal-compatibility"
                  ? [item.template as PersonalContentTemplate]
                  : []
              ))
            : [];
          const personalUpgrade = upgradePersonalTemplateInstances(
            serverData as unknown as Record<string, unknown>,
            Array.isArray(personalTemplates) ? personalTemplates : [],
          );
          if (personalUpgrade.upgradedCount > 0) {
            serverData = personalUpgrade.document as unknown as PuckDocument;
            controlledCanvasStateRef.current = {
              hasUnsavedChanges: true,
              baselineSignature: dataSignature(persistedServerData),
            };
          }
          const displayMetadata = draftPuck
            ? normalizePuckMetadata(adminDoc?.metadata)
            : normalizePuckMetadata(publishedDoc?.metadata);
          setData(serverData);
          latestData.current = serverData;
          dataSignatureRef.current = personalUpgrade.upgradedCount > 0
            ? dataSignature(persistedServerData)
            : dataSignature(serverData);
          setMetadata(displayMetadata);
          latestMetadata.current = displayMetadata;
          setViewingPublished(false);
          if (personalUpgrade.upgradedCount > 0) {
            setHasUnsavedChanges(true);
            message.info(`已将 ${personalUpgrade.upgradedCount} 个历史模板实例布局升级到最新版本；真实内容保持不变，尚未保存或发布`);
          }
          // 乐观锁与“上次保存时间”仍以草稿文档为准，保证后续保存/发布能正确串行。
          const draftUpdatedAt = adminDoc?.updatedAt || null;
          pageSessionCacheRef.current[pageKey] = {
            data: serverData,
            metadata: displayMetadata,
            lastSaved: draftUpdatedAt ? formatEditorTime(draftUpdatedAt) : null,
            updatedAt: draftUpdatedAt,
          };
        } else if (!cachedPage) {
          // 新页面没有服务端数据时，仅此处一次性落入该页面的正确默认结构。
          setData(serverData);
          latestData.current = serverData;
          dataSignatureRef.current = dataSignature(serverData);
          pageSessionCacheRef.current[pageKey] = {
            data: serverData,
            metadata: {},
            lastSaved: null,
            updatedAt: null,
          };
        }

        setHasPendingDraft(nextHasPendingDraft);
        pendingDraftRef.current = nextHasPendingDraft && draftPuck
          ? ensureEditorPageStructure(pageKey, migratePuckData(draftPuck))
          : null;
        publishedBaselineRef.current = publishedPuck
          ? canonicalizePageContent(publishedPuck, publishedDoc?.metadata)
          : null;
        publishedDataRef.current = publishedPuck
          ? ensureEditorPageStructure(pageKey, migratePuckData(publishedPuck))
          : null;
      } catch (error) {
        if (!cancelled) {
          // 接口失败不能伪装成“没有草稿”，否则后续显式保存可能覆盖已有装修内容。
          setLoadError(
            getEditorErrorMessage(
              error,
              "店铺装修内容加载失败，请检查网络后重试",
            ),
          );
        }
      } finally {
        if (!cancelled) {
          hasInitializedEditorRef.current = true;
          setLoadedPageKey(pageKey);
          setInitialLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadAttempt, message, pageKey]);

  const syncCanvasDataWithoutAdvancingSavedBaseline = useCallback(
    (nextData: unknown) => {
      const nextDocument = getPuckDocument(nextData);
      if (!nextDocument) return;
      setData(nextDocument);
      latestData.current = nextDocument;
      setCanvasDataSyncVersion((version) => version + 1);
    },
    [],
  );

  const trackEditorData = useCallback((nextData: unknown) => {
    const nextDocument = getPuckDocument(nextData);
    if (!nextDocument) return;
    latestData.current = nextDocument;
    const controlledState = controlledCanvasStateRef.current;
    if (controlledState) {
      controlledCanvasStateRef.current = null;
      // Puck 会在整页替换时补齐默认字段。服务端草稿采用归一化结果
      // 建立新基线；从线上比较返回时则恢复进入前的已保存基线与脏状态。
      dataSignatureRef.current =
        controlledState.baselineSignature ?? dataSignature(nextDocument);
      setHasUnsavedChanges(controlledState.hasUnsavedChanges);
      setValidationRevision((revision) => revision + 1);
      return;
    }
    // 规范化比较(忽略 block id/键序/非 content 字段):
    // Puck 首帧会 normalize 画布数据,JSON 全等会让每次进入编辑器都误报"有未保存修改"
    const changed = dataSignature(nextDocument) !== dataSignatureRef.current;
    setHasUnsavedChanges(changed);
    setValidationRevision((revision) => revision + 1);
    // 查看线上版本时画布被编辑:自动切回编辑草稿并提示,避免“看着线上却在改草稿”的状态错乱。
    if (changed && viewingPublishedRef.current) {
      viewingPublishedRef.current = false;
      setViewingPublished(false);
      message.info("已切换到编辑模式，当前修改将保存为草稿");
    }
  }, [message]);

  useEffect(() => {
    if (initialLoading || loadError || loadedPageKey !== pageKey) return;
    if (USE_MOCK) {
      setPublishIssues([]);
      setPublishValidationStatus("unverified");
      return;
    }
    const controller = new AbortController();
    const requestId = ++validationRequestRef.current;
    setPublishValidationStatus("validating");
    const expectedSignature = canonicalizePageContent(
      latestData.current,
      latestMetadata.current,
    );
    const timer = window.setTimeout(() => {
      void pageDocumentApi
        .validate(
          pageKey,
          latestData.current,
          latestMetadata.current,
          controller.signal,
        )
        .then((response) => {
          if (
            controller.signal.aborted ||
            requestId !== validationRequestRef.current ||
            expectedSignature !==
              canonicalizePageContent(latestData.current, latestMetadata.current)
          ) {
            return;
          }
          const result = unwrapResponse<{
            valid: boolean;
            errors: string[];
            issues?: PublishValidationIssue[];
          }>(response);
          const issues = resolvePublishValidationIssues(result);
          setPublishIssues(issues);
          setPublishValidationStatus(
            issues.some((issue) => issue.severity === "error") ? "invalid" : "valid",
          );
        })
        .catch((error) => {
          if (controller.signal.aborted || requestId !== validationRequestRef.current) return;
          // 失败时不能继续把上一轮问题伪装成当前结论；草稿仍完整保留，
          // 运营可从工具栏原位重试同一个服务端预检。
          setPublishIssues([]);
          setPublishValidationStatus("unavailable");
          if (import.meta.env.DEV) console.warn("[PageDocument validate]", error);
        });
    }, 650);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [initialLoading, loadError, loadedPageKey, metadata, pageKey, validationRevision]);

  const retryPublishValidation = useCallback(() => {
    setValidationRevision((revision) => revision + 1);
  }, []);

  const saveDraft = useCallback(
    async (
      nextData: unknown,
      options: { silent?: boolean } = {},
    ): Promise<boolean> => {
      const targetPageKey = pageKey;
      if (
        initialLoading ||
        Boolean(loadError) ||
        loadedPageKey !== targetPageKey
      ) {
        if (!options.silent) message.warning("页面内容仍在加载，请稍后再保存");
        return false;
      }
      const requestedData = getPuckDocument(nextData) ?? latestData.current;
      const requestedMetadata = latestMetadata.current;
      const save = async (): Promise<boolean> => {
        const editableData = requestedData;
        const isActivePage = () => targetPageKey === activePageKeyRef.current;
        // 顶栏手动保存才点亮按钮 loading 与成功提示；发布前、保存并离开等
        // 内部显式保存使用 silent，避免重复成功提示。
        if (isActivePage() && !options.silent) {
          setSaving(true);
        }
        try {
          const response = await pageDocumentApi.save({
            pageKey: targetPageKey,
            puckData: editableData,
            metadata: requestedMetadata,
            editorVersion: "0.22.4",
            expectedUpdatedAt:
              pageSessionCacheRef.current[targetPageKey]?.updatedAt ||
              undefined,
          });
          const savedDocument = unwrapResponse<PageDocumentResource | null>(response);
          // 服务端会在保存时移除旧联系电话、门店资料等业务事实副本。
          // 后续画布、缓存与发布校验必须以服务端回包为准，否则当前会话会继续
          // 持有已经从数据库清除的旧字段，直到刷新页面后才恢复一致。
          const persistedData = getPuckDocument(savedDocument?.puckData) ?? editableData;
          const persistedMetadata =
            savedDocument?.metadata &&
            typeof savedDocument.metadata === "object" &&
            !Array.isArray(savedDocument.metadata)
              ? savedDocument.metadata
              : requestedMetadata;
          const updatedAt =
            typeof savedDocument?.updatedAt === "string"
              ? savedDocument.updatedAt
              : pageSessionCacheRef.current[targetPageKey]?.updatedAt ||
                new Date().toISOString();
          const lastSavedAt = formatEditorTime(updatedAt);
          pageSessionCacheRef.current[targetPageKey] = {
            data: persistedData,
            metadata: persistedMetadata,
            lastSaved: lastSavedAt,
            updatedAt,
          };

          if (!isActivePage()) return true;
          const hasNewerLocalData =
            JSON.stringify(latestData.current) !== JSON.stringify(editableData);
          const hasNewerLocalMetadata =
            JSON.stringify(latestMetadata.current) !==
            JSON.stringify(requestedMetadata);
          const hasNewerLocalChanges =
            hasNewerLocalData || hasNewerLocalMetadata;
          dataSignatureRef.current = dataSignature(persistedData);
          if (hasNewerLocalChanges) {
            setHasUnsavedChanges(true);
          } else {
            setData(persistedData);
            latestData.current = persistedData;
            setMetadata(persistedMetadata);
            latestMetadata.current = persistedMetadata;
            setHasUnsavedChanges(false);
          }
          const pendingData = hasNewerLocalChanges
            ? latestData.current
            : persistedData;
          const pendingMetadata = hasNewerLocalChanges
            ? latestMetadata.current
            : persistedMetadata;
          setHasPendingDraft(
            publishedBaselineRef.current != null &&
              canonicalizePageContent(pendingData, pendingMetadata) !==
                publishedBaselineRef.current,
          );
          setViewingPublished(false);
          if (!options.silent) message.success("页面草稿已保存");
          return true;
        } catch (error) {
          if (!isActivePage()) return false;
          const isConflict = getEditorHttpStatus(error) === 409;
          if (isConflict) {
            modal.confirm({
              title: "检测到其他人更新了这份页面草稿",
              content:
                "当前画布修改仍完整保留。你可以继续留在本地核对，或明确放弃本地修改并重新加载远端草稿。",
              okText: "重新加载远端草稿",
              cancelText: "保留本地修改",
              okButtonProps: { danger: true },
              onOk: () => setLoadAttempt((attempt) => attempt + 1),
            });
          } else {
            message.error(getEditorErrorMessage(error, "保存失败，请重试"));
          }
          return false;
        } finally {
          if (isActivePage()) setSaving(false);
        }
      };

      const queuedSave = saveQueueRef.current.then(save, save);
      saveQueueRef.current = queuedSave.then(
        () => undefined,
        () => undefined,
      );
      return queuedSave;
    },
    [initialLoading, loadError, loadedPageKey, message, modal, pageKey],
  );

  // 2026-08-16 批次 D（用户决策）：2 秒自动保存已移除，改为显式保存模型——
  // 手动"保存草稿" + UnsavedChangesGuard（路由级离开时保存或返回编辑）+ beforeunload 三层。
  // 历史 reason：自动保存曾作为 SPA 跳转的静默兜底，用户判定其无价值且干扰草稿管理。

  const switchEditorPage = useCallback(
    async (path: string) => {
      const targetPage = getEditorPageByPath(path);
      if (!targetPage || targetPage.key === pageKey) return;
      // 未保存修改由 UnsavedChangesGuard 拦截（保存并离开/继续编辑），此处纯导航。
      navigate(`/admin/editor/${targetPage.key}`);
    },
    [navigate, pageKey],
  );

  useEffect(() => {
    const handleCanvasPageNavigation = (
      event: MessageEvent<CanvasPageNavigationMessage>,
    ) => {
      if (
        event.data?.type !== CANVAS_PAGE_NAVIGATION_MESSAGE ||
        typeof event.data.path !== "string"
      )
        return;
      void switchEditorPage(event.data.path);
    };
    window.addEventListener("message", handleCanvasPageNavigation);
    return () =>
      window.removeEventListener("message", handleCanvasPageNavigation);
  }, [switchEditorPage]);

  // 草稿保护（2026-08-16 起的显式保存模型）：
  // 1. useBlocker（UnsavedChangesGuard）：SPA 路由跳转只提供保存并离开或继续编辑；
  // 2. beforeunload：拦截刷新 / 关闭；
  // 3. 显式动作（发布前保存、页面设置保存）各自先保存再执行。

  const loadRevisions = useCallback(async () => {
    setRevisionsLoading(true);
    setRevisionFailure(null);
    try {
      // 同时拉取版本历史与后台草稿：存在与最新发布版本不同的草稿时，在抽屉顶部展示“编辑草稿”入口。
      const [revisionsResponse, adminResponse] = await Promise.all([
        pageDocumentApi.getRevisions(pageKey),
        pageDocumentApi.getAdmin(pageKey),
      ]);
      const revisionList =
        unwrapResponse<PageDocumentRevision[]>(revisionsResponse) || [];
      setRevisions(revisionList);
      const adminDoc = unwrapResponse<PageDocumentResource | null>(adminResponse);
      const draftPuck = getPuckDocument(adminDoc?.puckData);
      const hasDraft = Boolean(draftPuck);
      const currentPublishedRevision = revisionList.find((revision) => revision.isPublished);
      const currentPublishedPuck = currentPublishedRevision?.puckData ?? null;
      const currentPublishedMetadata = currentPublishedRevision?.metadata ?? null;
      const hasPublished = currentPublishedPuck != null;
      const hasPendingDraft =
        canonicalizePageContent(draftPuck, adminDoc?.metadata) !==
        canonicalizePageContent(currentPublishedPuck, currentPublishedMetadata);
      // 草稿条目：只要存在草稿就展示；已发布且草稿与线上一致（刚发布）时不再单独展示。
      const showDraftEntry = hasDraft && (!hasPublished || hasPendingDraft);
      setDraftSnapshot(
        showDraftEntry
          ? {
              pageKey,
              puckData: draftPuck,
              metadata: adminDoc?.metadata || {},
              updatedAt: adminDoc?.updatedAt || null,
            }
          : null,
      );
    } catch (error) {
      setRevisionFailure({
        message: getEditorErrorMessage(
          error,
          "版本列表加载失败，请稍后重试",
        ),
      });
    } finally {
      setRevisionsLoading(false);
    }
  }, [pageKey]);

  const applyDraftToCanvas = useCallback(
    (puckData: unknown, draftMetadata?: PuckProps) => {
      const document = getPuckDocument(puckData);
      if (!document) return;
      const structured = ensureEditorPageStructure(
        pageKey,
        migratePuckData(document),
      );
      controlledCanvasStateRef.current = {
        hasUnsavedChanges: false,
        baselineSignature: null,
      };
      setData(structured);
      latestData.current = structured;
      dataSignatureRef.current = dataSignature(structured);
      if (draftMetadata) {
        setMetadata(draftMetadata);
        latestMetadata.current = draftMetadata;
      }
      setHasUnsavedChanges(false);
      pendingDraftRef.current = null;
      editingDraftSnapshotRef.current = null;
      viewingPublishedRef.current = false;
      setViewingPublished(false);
    },
    [pageKey],
  );

  const editDraftFromRevisions = useCallback(() => {
    if (!draftSnapshot?.puckData) return;
    applyDraftToCanvas(draftSnapshot.puckData, draftSnapshot.metadata);
    setRevisionsOpen(false);
    message.success("已加载未发布草稿，可继续编辑或重新发布");
  }, [applyDraftToCanvas, draftSnapshot, message]);

  const loadDraftIntoCanvas = useCallback(async () => {
    try {
      const adminResponse = await pageDocumentApi.getAdmin(pageKey);
      const adminDoc = unwrapResponse<PageDocumentResource | null>(adminResponse);
      const draftPuck = getPuckDocument(adminDoc?.puckData);
      if (!draftPuck) {
        message.info("暂无可编辑的草稿");
        return;
      }
      applyDraftToCanvas(draftPuck, adminDoc?.metadata || {});
      message.success("已加载未发布草稿，可继续编辑或重新发布");
    } catch (error) {
      console.error("[homepage-editor] 草稿加载失败", error);
      message.error("草稿加载失败，请刷新后重试");
    }
  }, [pageKey, applyDraftToCanvas, message]);

  const returnToEditingDraft = useCallback(() => {
    const snapshot = editingDraftSnapshotRef.current;
    if (!snapshot) {
      // 首次进入且后台草稿与线上内容完全一致时没有独立快照；当前画布、
      // metadata 与乐观锁基线已经由初次加载建立。返回编辑应直接复用它们，
      // 不能再发一次 GET，把一次瞬时读取失败变成无法退出的只读态。
      viewingPublishedRef.current = false;
      setViewingPublished(false);
      message.success("已进入编辑模式，当前线上内容保持不变");
      return;
    }
    controlledCanvasStateRef.current = {
      hasUnsavedChanges: snapshot.hasUnsavedChanges,
      baselineSignature: snapshot.savedSignature,
    };
    setData(snapshot.data);
    latestData.current = snapshot.data;
    setMetadata(snapshot.metadata);
    latestMetadata.current = snapshot.metadata;
    dataSignatureRef.current = snapshot.savedSignature;
    setHasUnsavedChanges(snapshot.hasUnsavedChanges);
    setHasPendingDraft(snapshot.hasPendingDraft);
    viewingPublishedRef.current = false;
    setViewingPublished(false);
    editingDraftSnapshotRef.current = null;
    message.success(
      snapshot.hasUnsavedChanges
        ? "已返回草稿，未保存修改保持不变"
        : "已返回未发布草稿",
    );
  }, [message]);

  const openPageSettingsForEditing = useCallback((focusField?: string) => {
    if (viewingPublishedRef.current) {
      if (editingDraftSnapshotRef.current) {
        returnToEditingDraft();
      } else {
        // 首次打开且没有独立草稿时，当前线上内容就是新草稿的编辑基线。
        viewingPublishedRef.current = false;
        setViewingPublished(false);
      }
    }
    setPageSettingsFocusField(focusField ?? null);
    setPageSettingsOpen(true);
  }, [returnToEditingDraft]);

  const editPendingDraft = useCallback(() => {
    if (viewingPublishedRef.current && editingDraftSnapshotRef.current) {
      returnToEditingDraft();
      return;
    }
    if (hasUnsavedChanges) {
      modal.confirm({
        title: "加载未发布草稿？",
        content: "当前画布存在尚未保存的修改，加载草稿会覆盖这些修改。",
        okText: "加载草稿",
        cancelText: "取消",
        onOk: () => void loadDraftIntoCanvas(),
      });
      return;
    }
    void loadDraftIntoCanvas();
  }, [hasUnsavedChanges, loadDraftIntoCanvas, modal, returnToEditingDraft]);

  const applyPublishedToCanvas = useCallback(async () => {
    // 若运营刚点过保存，先让该请求完整推进缓存和乐观锁，再建立比较快照。
    // 否则保存回包会在进入线上视图后把线上画布误标成草稿修改。
    await Promise.resolve(saveQueueRef.current).catch(() => {});
    if (!publishedDataRef.current) return;
    const savedPage = pageSessionCacheRef.current[pageKey];
    const currentHasUnsavedChanges = savedPage
      ? canonicalizePageContent(
          latestData.current,
          latestMetadata.current,
        ) !== canonicalizePageContent(savedPage.data, savedPage.metadata)
      : hasUnsavedChanges;
    const currentHasPendingDraft =
      publishedBaselineRef.current != null &&
      canonicalizePageContent(
        latestData.current,
        latestMetadata.current,
      ) !== publishedBaselineRef.current;
    editingDraftSnapshotRef.current = {
      data: latestData.current,
      metadata: latestMetadata.current,
      hasUnsavedChanges: currentHasUnsavedChanges,
      hasPendingDraft: currentHasPendingDraft,
      savedSignature: dataSignatureRef.current,
    };
    controlledCanvasStateRef.current = {
      hasUnsavedChanges: false,
      baselineSignature: null,
    };
    setData(publishedDataRef.current);
    latestData.current = publishedDataRef.current;
    dataSignatureRef.current = dataSignature(publishedDataRef.current);
    setMetadata(publishedMetadataRef.current);
    latestMetadata.current = publishedMetadataRef.current;
    setHasUnsavedChanges(false);
    viewingPublishedRef.current = true;
    setViewingPublished(true);
  }, [hasUnsavedChanges, pageKey]);

  const viewPublishedVersion = useCallback(() => {
    if (hasUnsavedChanges) {
      modal.confirm({
        title: "查看线上版本？",
        content:
          "画布上存在未保存修改。查看期间线上版本只读；返回编辑时会恢复当前草稿和未保存修改。",
        okText: "查看线上版本",
        cancelText: "取消",
        onOk: applyPublishedToCanvas,
      });
      return;
    }
    void applyPublishedToCanvas();
  }, [hasUnsavedChanges, applyPublishedToCanvas, modal]);

  const discardDraftToPublished = useCallback(() => {
    modal.confirm({
      title: "放弃当前草稿并恢复线上版本？",
      content:
        "当前草稿的全部未发布修改将丢失，画布回到线上已发布版本；此操作不可撤销。",
      okText: "放弃草稿",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        if (!publishedDataRef.current) return;
        setDraftDiscardError(null);
        // 排空在途保存(如页面设置触发的静默保存):
        // 否则 in-flight 保存会在丢弃完成后回写草稿,让被丢弃的修改"复活"。
        await Promise.resolve(saveQueueRef.current).catch(() => {});
        // 真丢弃:服务端用最新发布版覆盖草稿(无发布版则删除文档),
        // 乐观锁防并发覆盖其他编辑者的修改。
        const expectedUpdatedAt =
          pageSessionCacheRef.current[pageKey]?.updatedAt ?? undefined;
        if (!expectedUpdatedAt) {
          setDraftDiscardError("当前页面版本标识缺失，请刷新页面后再放弃草稿");
          return;
        }
        try {
          await pageDocumentApi.discardDraft(pageKey, expectedUpdatedAt);
        } catch (error) {
          setDraftDiscardError(
            getEditorErrorMessage(error, "放弃草稿失败，请稍后重试"),
          );
          return;
        }
        controlledCanvasStateRef.current = {
          hasUnsavedChanges: false,
          baselineSignature: null,
        };
        setData(publishedDataRef.current);
        latestData.current = publishedDataRef.current;
        dataSignatureRef.current = dataSignature(publishedDataRef.current);
        setMetadata(publishedMetadataRef.current);
        latestMetadata.current = publishedMetadataRef.current;
        setHasUnsavedChanges(false);
        setHasPendingDraft(false);
        setViewingPublished(false);
        pendingDraftRef.current = null;
        editingDraftSnapshotRef.current = null;
        viewingPublishedRef.current = false;
        message.success("已放弃草稿，当前内容与线上版本一致");
        // 重拉 admin 文档建立新的乐观锁与保存基准
        try {
          const adminResponse = await pageDocumentApi.getAdmin(pageKey);
          const adminDoc = unwrapResponse<PageDocumentResource | null>(adminResponse);
          pageSessionCacheRef.current[pageKey] = {
            data: publishedDataRef.current,
            metadata: publishedMetadataRef.current,
            lastSaved: null,
            updatedAt: adminDoc?.updatedAt || null,
          };
        } catch {
          // 基准刷新失败不阻断;下次保存若乐观锁不匹配会显式提示
        }
      },
    });
  }, [message, modal, pageKey]);

  const openRevisions = useCallback(() => {
    setRevisionsOpen(true);
    void loadRevisions();
  }, [loadRevisions]);

  const savePageSettings = useCallback(
    async (next: {
      seoTitle?: string;
      seoDescription?: string;
      ogImage?: string;
      contentOwner?: string;
      mediaRights?: ContentTemplateMediaRight[];
    }) => {
      const merged = { ...latestMetadata.current, ...next };
      setMetadata(merged);
      latestMetadata.current = merged;
      // 页面设置已经进入当前内存草稿；即使持久化失败也必须触发离开保护，
      // 不能关闭抽屉后把内容负责人、SEO 或授权编号静默丢失。
      setHasUnsavedChanges(true);
      setValidationRevision((revision) => revision + 1);
      const saved = await saveDraft(latestData.current, { silent: true });
      if (saved) {
        setPageSettingsOpen(false);
        message.success("页面设置已保存");
      }
      return saved;
    },
    [message, saveDraft],
  );

  const restoreRevision = useCallback(
    (revision: PageDocumentRevision) => {
      modal.confirm({
        title: `恢复版本 ${revision.version}？`,
        content:
          hasProtectedUnsavedChanges
            ? "当前画布的未保存修改和后台草稿都会被该历史版本覆盖；未保存修改无法恢复。此操作不会立即影响前台。"
            : "恢复后会覆盖当前后台草稿，但不会立即影响前台首页。确认后可继续编辑或重新发布。",
        okText: "恢复到草稿",
        cancelText: "取消",
        onOk: async () => {
          setRestoringVersion(revision.version);
          // 与放弃草稿一致，先排空已确认的在途保存，再读取最新乐观锁。
          // 这样恢复不会与稍早发出的保存请求争用旧 expectedUpdatedAt。
          await Promise.resolve(saveQueueRef.current).catch(() => {});
          const expectedUpdatedAt =
            pageSessionCacheRef.current[pageKey]?.updatedAt;
          if (!expectedUpdatedAt) {
            setRevisionFailure({
              message: "当前页面版本标识缺失，请刷新页面后再恢复",
              revision,
              action: "restore",
            });
            setRestoringVersion(null);
            return;
          }
          setRevisionFailure(null);
          try {
            const response = await pageDocumentApi.restoreRevision(
              pageKey,
              revision.version,
              expectedUpdatedAt,
            );
            const document = unwrapResponse<PageDocumentResource | null>(response);
            const restoredPuck = getPuckDocument(document?.puckData);
            if (restoredPuck) {
              const restoredData = ensureEditorPageStructure(
                pageKey,
                migratePuckData(restoredPuck),
              );
              controlledCanvasStateRef.current = {
                hasUnsavedChanges: false,
                baselineSignature: null,
              };
              setData(restoredData);
              latestData.current = restoredData;
              // 恢复接口已经把该版本写成服务端草稿；Puck 随后的 setData 回调
              // 不应把这次受控整页替换误判为尚未保存的本地编辑。
              dataSignatureRef.current = dataSignature(restoredData);
              const restoredMetadata = normalizePuckMetadata(document?.metadata);
              setMetadata(restoredMetadata);
              latestMetadata.current = restoredMetadata;
              setHasUnsavedChanges(false);
              setHasPendingDraft(
                publishedBaselineRef.current != null &&
                  canonicalizePageContent(restoredData, restoredMetadata) !==
                    publishedBaselineRef.current,
              );
              setViewingPublished(false);
              pendingDraftRef.current = null;
              editingDraftSnapshotRef.current = null;
              viewingPublishedRef.current = false;
              const restoredUpdatedAt =
                document?.updatedAt || new Date().toISOString();
              const restoredLastSaved = formatEditorTime(restoredUpdatedAt);
              pageSessionCacheRef.current[pageKey] = {
                data: restoredData,
                metadata: restoredMetadata,
                lastSaved: restoredLastSaved,
                updatedAt: restoredUpdatedAt,
              };
            }
            message.success(`已恢复版本 ${revision.version} 到草稿`);
            setRevisionsOpen(false);
          } catch (error) {
            setRevisionFailure({
              message: getEditorErrorMessage(
                error,
                "版本恢复失败，请稍后重试",
              ),
              revision,
              action: "restore",
            });
          } finally {
            setRestoringVersion(null);
          }
        },
      });
    },
    [hasProtectedUnsavedChanges, message, modal, pageKey],
  );

  const rollbackPublication = useCallback(
    (revision: PageDocumentRevision) => {
      const currentPublished = revisions.find((item) => item.isPublished);
      if (!currentPublished) {
        setRevisionFailure({ message: "当前线上版本指针缺失，不能执行回滚" });
        return;
      }
      modal.confirm({
        title: `回滚线上到版本 ${revision.version}？`,
        content:
          "此操作只切换线上发布指针，不会覆盖当前页面草稿，也不会修改或删除任何历史版本。",
        okText: "确认回滚线上",
        cancelText: "取消",
        onOk: async () => {
          setRollingBackRevisionId(revision.id);
          setRevisionFailure(null);
          try {
            const response = await pageDocumentApi.rollbackPublication(
              pageKey,
              revision.id,
              currentPublished.id,
            );
            const updatedDocument = unwrapResponse<PageDocumentResource | null>(response);
            const cached = pageSessionCacheRef.current[pageKey];
            if (cached && updatedDocument?.updatedAt) {
              pageSessionCacheRef.current[pageKey] = {
                ...cached,
                updatedAt: updatedDocument.updatedAt,
              };
            }

            const publishedResponse = await pageDocumentApi.getPublishedAdmin(pageKey);
            const publishedDocument = unwrapResponse<PageDocumentResource | null>(publishedResponse);
            const publishedPuck = getPuckDocument(publishedDocument?.puckData);
            if (!publishedPuck) throw new Error("回滚后未能读取新的线上版本");
            const nextPublishedData = ensureEditorPageStructure(
              pageKey,
              migratePuckData(publishedPuck),
            );
            const nextPublishedMetadata = normalizePuckMetadata(publishedDocument?.metadata);
            const nextPublishedBaseline = canonicalizePageContent(
              nextPublishedData,
              nextPublishedMetadata,
            );
            publishedDataRef.current = nextPublishedData;
            publishedMetadataRef.current = nextPublishedMetadata;
            publishedBaselineRef.current = nextPublishedBaseline;
            setHasPendingDraft(
              canonicalizePageContent(latestData.current, latestMetadata.current)
                !== nextPublishedBaseline,
            );
            if (viewingPublishedRef.current) {
              setData(nextPublishedData);
              latestData.current = nextPublishedData;
              setMetadata(nextPublishedMetadata);
              latestMetadata.current = nextPublishedMetadata;
              dataSignatureRef.current = dataSignature(nextPublishedData);
            }
            setRevisions((items) => items.map((item) => ({
              ...item,
              isPublished: item.id === revision.id,
            })));
            message.success(`线上页面已回滚到版本 ${revision.version}；当前草稿保持不变`);
            await loadRevisions();
          } catch (error) {
            setRevisionFailure({
              message: getEditorErrorMessage(error, "线上回滚失败，请稍后重试"),
              revision,
              action: "rollback",
            });
            throw error;
          } finally {
            setRollingBackRevisionId(null);
          }
        },
      });
    },
    [loadRevisions, message, modal, pageKey, revisions],
  );

  const publishHome = async (
    nextData: unknown,
  ) => {
    if (!canPublish) {
      message.warning("当前账号只能编辑草稿，请通知管理员审核并发布");
      return;
    }
    if (
      publishing ||
      initialLoading ||
      Boolean(loadError) ||
      loadedPageKey !== pageKey
    ) {
      if (!publishing) message.warning("页面内容仍在加载，请稍后再发布");
      return;
    }
    const editableData = nextData ?? latestData.current;
    const pageLabel = getEditorPage(pageKey).label;

    const showBlockingIssues = (issues: PublishValidationIssue[]) => {
      modal.error({
        title: `暂不能发布 · ${issues.length} 项问题待处理`,
        width: 620,
        content: (
          <div role="alert" aria-label="页面发布阻断清单">
            <p>当前草稿已经安全保存；修复以下问题后再发布：</p>
            <ol style={{ maxHeight: 320, overflowY: "auto", paddingInlineStart: 22 }}>
              {issues.map((issue, index) => (
                <li key={`${issue.path ?? ""}-${issue.message}-${index}`}>
                  {issue.message}
                </li>
              ))}
            </ol>
          </div>
        ),
        okText: "返回修改",
      });
    };

    setPublishing(true);
    try {
      const saved = await saveDraft(editableData, { silent: true });
      if (!saved) return;
      const persistedDraft = pageSessionCacheRef.current[pageKey];
      const publishData = persistedDraft?.data ?? latestData.current;
      const publishMetadata =
        persistedDraft?.metadata ?? latestMetadata.current;
      const publishSourceSignature = canonicalizePageContent(
        publishData,
        publishMetadata,
      );
      if (
        canonicalizePageContent(
          latestData.current,
          latestMetadata.current,
        ) !== publishSourceSignature
      ) {
        message.warning(
          "保存期间页面又发生了修改；新修改已保留但尚未保存，请再次确认后发布",
        );
        return;
      }
      if (!persistedDraft?.updatedAt) {
        message.error("当前页面版本标识缺失，请刷新页面后再发布");
        return;
      }
      const persistedUpdatedAt = persistedDraft.updatedAt;

      // 发布前以刚保存的服务端草稿重新校验。异步编辑预检只负责即时反馈，
      // 不能代替本次发布动作的同源、最新资格判断。
      const validationResponse = await pageDocumentApi.validate(
        pageKey,
        publishData,
        publishMetadata,
      );
      const validation = unwrapResponse<{
        valid: boolean;
        errors: string[];
        issues?: PublishValidationIssue[];
      }>(validationResponse);
      const validationIssues = resolvePublishValidationIssues(validation ?? {});
      const blockingIssues = validationIssues.filter((issue) => issue.severity === "error");
      setPublishIssues(validationIssues);

      if (!validation?.valid || blockingIssues.length > 0) {
        showBlockingIssues(blockingIssues.length > 0
          ? blockingIssues
          : (validation?.errors ?? []).map((errorMessage) => ({
              message: errorMessage,
              severity: "error" as const,
            })));
        return;
      }

      const publishPersistedDraft = async () => {
        setPublishing(true);
        try {
          if (
            canonicalizePageContent(
              latestData.current,
              latestMetadata.current,
            ) !== publishSourceSignature
          ) {
            message.warning(
              "发布确认期间页面又发生了修改；新修改仍完整保留，请重新发布",
            );
            return;
          }

          const publishResponse = await pageDocumentApi.publish(
            pageKey,
            undefined,
            persistedUpdatedAt,
          );
          const publishedDocument = unwrapResponse<PageDocumentResource | null>(publishResponse);
          const publishedData = getPuckDocument(publishedDocument?.puckData) ?? publishData;
          const publishedMetadata =
            publishedDocument?.metadata &&
            typeof publishedDocument.metadata === "object" &&
            !Array.isArray(publishedDocument.metadata)
              ? publishedDocument.metadata
              : publishMetadata;
          const publishedBaseline = canonicalizePageContent(
            publishedData,
            publishedMetadata,
          );
          pageSessionCacheRef.current[pageKey] = {
            data: publishedData,
            metadata: publishedMetadata,
            lastSaved: formatEditorTime(
              publishedDocument?.updatedAt || new Date(),
            ),
            updatedAt:
              publishedDocument?.updatedAt ||
              pageSessionCacheRef.current[pageKey]?.updatedAt ||
              null,
          };

          if (pageKey !== activePageKeyRef.current) return;
          const hasNewerLocalChanges =
            canonicalizePageContent(
              latestData.current,
              latestMetadata.current,
            ) !== publishSourceSignature;
          dataSignatureRef.current = dataSignature(publishedData);
          if (hasNewerLocalChanges) {
            setHasUnsavedChanges(true);
            setHasPendingDraft(
              canonicalizePageContent(
                latestData.current,
                latestMetadata.current,
              ) !== publishedBaseline,
            );
          } else {
            setData(publishedData);
            latestData.current = publishedData;
            setMetadata(publishedMetadata);
            latestMetadata.current = publishedMetadata;
            setHasUnsavedChanges(false);
            setHasPendingDraft(false);
          }
          setViewingPublished(false);
          publishedBaselineRef.current = publishedBaseline;
          pendingDraftRef.current = null;
          // 线上基线同步推进：发布后「查看线上版本」必须看到刚发布的内容，
          // 而不是发布前的旧线上版。
          publishedDataRef.current = publishedData;
          publishedMetadataRef.current = { ...publishedMetadata };
          editingDraftSnapshotRef.current = null;
          setPublishedNeedsRevalidation(false);
          void loadRevisions();
          message.success(
            hasNewerLocalChanges
              ? `${pageLabel}已发布；发布期间的新修改仍保留为未保存内容`
              : pageKey === "home"
                ? "店铺首页已发布，前台页面将立即读取最新版本"
                : `${pageLabel}已发布，前台页面将立即读取最新版本`,
          );
        } catch (error) {
          if (getEditorHttpStatus(error) === 400) {
            try {
              const refreshedResponse = await pageDocumentApi.validate(
                pageKey,
                publishData,
                publishMetadata,
              );
              const refreshed = unwrapResponse<{
                valid: boolean;
                errors: string[];
                issues?: PublishValidationIssue[];
              }>(refreshedResponse);
              const refreshedIssues = resolvePublishValidationIssues(refreshed ?? {});
              const refreshedBlockers = refreshedIssues.filter(
                (issue) => issue.severity === "error",
              );
              setPublishIssues(refreshedIssues);
              if (refreshedBlockers.length > 0) {
                showBlockingIssues(refreshedBlockers);
                return;
              }
            } catch {
              // 保留下面的安全通用错误；不把内部响应正文透传到后台页面。
            }
          }
          message.error(getEditorErrorMessage(error, "发布失败，请稍后重试"));
        } finally {
          setPublishing(false);
        }
      };

      await publishPersistedDraft();
    } catch (error) {
      message.error(getEditorErrorMessage(error, "发布前校验失败，请稍后重试"));
    } finally {
      setPublishing(false);
    }
  };


  const readViewingPublished = useCallback(
    () => viewingPublishedRef.current,
    [],
  );

  const commitPuckData = useCallback((nextData: PuckDocument) => {
    setData(nextData);
    latestData.current = nextData;
  }, []);

  const retryLoad = useCallback(() => {
    setInitialLoading(true);
    setLoadError(null);
    setLoadAttempt((attempt) => attempt + 1);
  }, []);

  const closeRevisions = useCallback(() => {
    setRevisionsOpen(false);
  }, []);

  const closePageSettings = useCallback(() => {
    setPageSettingsOpen(false);
    setPageSettingsFocusField(null);
  }, []);

  const dismissDraftDiscardError = useCallback(() => {
    setDraftDiscardError(null);
  }, []);

  const saveProtectedChanges = useCallback(async () => {
    const protectedDraft = editingDraftSnapshotRef.current;
    if (viewingPublishedRef.current && protectedDraft) {
      const protectedData = protectedDraft.data;
      returnToEditingDraft();
      return Boolean(await saveDraft(protectedData));
    }
    return Boolean(await saveDraft(latestData.current));
  }, [returnToEditingDraft, saveDraft]);

  return {
    data,
    metadata,
    resolvedDynamicTemplateDefinitions,
    resolvedDynamicTemplatesReady,
    saving,
    publishing,
    publishIssues,
    publishValidationStatus,
    hasUnsavedChanges,
    hasProtectedUnsavedChanges,
    previewMode,
    revisionsOpen,
    revisionsLoading,
    revisions,
    restoringVersion,
    rollingBackRevisionId,
    revisionFailure,
    draftDiscardError,
    draftSnapshot,
    initialLoading,
    loadedPageKey,
    loadError,
    canvasDataSyncVersion,
    pageSettingsOpen,
    pageSettingsFocusField,
    hasPendingDraft,
    publishedNeedsRevalidation,
    viewingPublished,
    draftSavedAtLabel: pageSessionCacheRef.current[pageKey]?.lastSaved ?? null,
    readViewingPublished,
    commitPuckData,
    retryLoad,
    closeRevisions,
    closePageSettings,
    dismissDraftDiscardError,
    setPreviewMode,
    retryPublishValidation,
    saveDraft,
    switchEditorPage,
    loadRevisions,
    editDraftFromRevisions,
    returnToEditingDraft,
    openPageSettingsForEditing,
    editPendingDraft,
    viewPublishedVersion,
    discardDraftToPublished,
    openRevisions,
    savePageSettings,
    restoreRevision,
    rollbackPublication,
    publishHome,
    trackEditorData,
    syncCanvasDataWithoutAdvancingSavedBaseline,
    saveProtectedChanges,
  };
}

export type PageWorkspaceController = ReturnType<typeof usePageWorkspaceController>;
