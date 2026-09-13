import { App as AntdApp } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  pageDocumentApi,
  type PageDocumentResource,
} from "@/services/api";
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
  DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY,
  getRequiredDynamicTemplateDefinitionKeys,
  inspectResolvedDynamicTemplateDefinitions,
  replaceResolvedDynamicTemplates,
  type ResolvedDynamicTemplateDefinitionMap,
  useResolvedDynamicTemplateDefinitions,
} from "@/page-builder/dynamic-template-instance";
import type {
  PublishValidationIssue,
  PublishValidationStatus,
} from "@/page-builder/inspector/publishValidation";
import {
  getPagePublishIssueKey,
  reconcilePagePublishIssueKey,
} from "@/page-builder/inspector/publishValidation";
import { USE_MOCK } from "@/services/mockData";
import type { PuckDocument, PuckProps } from "@/page-builder/types";
import {
  CANVAS_PAGE_NAVIGATION_MESSAGE,
  type CanvasPageNavigationMessage,
  type PageDocumentRevisionDetail,
  type PageDocumentRevisionPage,
  type PageDocumentRevisionSummary,
  type PageDraftSnapshot,
  type PageEditorHistoryCommand,
  type PageEditorHistorySnapshot,
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
import type { PublicContentLocale } from "@/i18n/publicLocale";

export function usePageWorkspaceController({
  pageKey,
  locale,
  canPublish,
}: {
  pageKey: EditorPageKey;
  locale: PublicContentLocale;
  canPublish: boolean;
}) {
  const { message, modal } = AntdApp.useApp();
  const navigate = useNavigate();
  const [data, setData] = useState<PuckDocument>(() => createEditorPageDefault(pageKey));
  const resolvedDynamicTemplateDefinitions = useResolvedDynamicTemplateDefinitions();
  const resolvedDefinitionsPayload = data[DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY];
  const inspectedResolvedDefinitions = useMemo(
    () => inspectResolvedDynamicTemplateDefinitions(resolvedDefinitionsPayload),
    [resolvedDefinitionsPayload],
  );
  const requiredResolvedDefinitionKeys = useMemo(
    () => getRequiredDynamicTemplateDefinitionKeys(data),
    [data],
  );
  const rejectedResolvedDefinitionKeys = requiredResolvedDefinitionKeys.filter(
    (key) => Boolean(inspectedResolvedDefinitions.rejected[key]),
  );
  const missingResolvedDefinitionKeys = requiredResolvedDefinitionKeys.filter((key) => (
    !inspectedResolvedDefinitions.rejected[key]
    && !inspectedResolvedDefinitions.definitions[key]
    && !resolvedDynamicTemplateDefinitions[key]
  ));
  const resolvedDynamicTemplatesError = rejectedResolvedDefinitionKeys.length > 0
    ? `页面锁定的模板版本解析失败：${rejectedResolvedDefinitionKeys.map((key) => (
        `${key}（${inspectedResolvedDefinitions.rejected[key].reason}）`
      )).join("；")}`
    : missingResolvedDefinitionKeys.length > 0
      ? `页面锁定的模板版本缺失：${missingResolvedDefinitionKeys.join("、")}`
      : null;
  const resolvedDynamicTemplatesReady = !resolvedDynamicTemplatesError
    && requiredResolvedDefinitionKeys.every((key) => Boolean(resolvedDynamicTemplateDefinitions[key]));
  const [saving, setSaving] = useState(false);
  const [draftSaveFailed, setDraftSaveFailed] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishIssues, setPublishIssues] = useState<PublishValidationIssue[]>(
    [],
  );
  const [publishValidationStatus, setPublishValidationStatus] =
    useState<PublishValidationStatus>("idle");
  const [publishAttemptFailure, setPublishAttemptFailure] = useState<{
    issue: PublishValidationIssue;
    sourceSignature: string;
  } | null>(null);
  const [publishReviewActive, setPublishReviewActive] = useState(false);
  const [publishReviewOpen, setPublishReviewOpen] = useState(false);
  const [publishReviewIssueKey, setPublishReviewIssueKey] = useState<string | null>(null);
  const previousPublishIssuesRef = useRef<PublishValidationIssue[]>([]);
  const [validationRevision, setValidationRevision] = useState(0);
  const validationRequestRef = useRef(0);
  const publishOperationRef = useRef(false);
  const publishOwnerRef = useRef<symbol | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [revisionsOpen, setRevisionsOpen] = useState(false);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [revisionsLoadingMore, setRevisionsLoadingMore] = useState(false);
  const [revisions, setRevisions] = useState<PageDocumentRevisionSummary[]>([]);
  const [revisionNextBeforeVersion, setRevisionNextBeforeVersion] = useState<number | null>(null);
  const [selectedRevision, setSelectedRevision] = useState<PageDocumentRevisionDetail | null>(null);
  const [selectedRevisionVersion, setSelectedRevisionVersion] = useState<number | null>(null);
  const [revisionDetailLoading, setRevisionDetailLoading] = useState(false);
  const [revisionDetailError, setRevisionDetailError] = useState<string | null>(null);
  const revisionDetailRequestRef = useRef(0);
  const [rollingBackRevisionId, setRollingBackRevisionId] = useState<number | null>(null);
  const [revisionFailure, setRevisionFailure] = useState<{
    message: string;
    revision?: PageDocumentRevisionSummary;
    action?: "rollback";
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
  const workspaceKey = `${locale}:${pageKey}`;
  const activePageKeyRef = useRef(workspaceKey);
  const latestData = useRef<PuckDocument>(data);
  const controlledCanvasStateRef = useRef<{
    hasUnsavedChanges: boolean;
    baselineSignature: string | null;
  } | null>(null);
  const [canvasDataSyncVersion, setCanvasDataSyncVersion] = useState(0);
  const [pendingPageHistoryCommand, setPendingPageHistoryCommand] = useState<PageEditorHistoryCommand | null>(null);
  const pendingPageHistoryCommandRef = useRef<PageEditorHistoryCommand | null>(null);
  const pageHistoryCommandsRef = useRef(new Map<number, PageEditorHistoryCommand>());
  const pageSessionCacheRef = useRef<Record<string, PageSessionCache>>({});
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const dataSignatureRef = useRef("");  const [metadata, setMetadata] = useState<PuckProps>({});
  const latestMetadata = useRef<PuckProps>({});
  const [pageSettingsOpen, setPageSettingsOpen] = useState(false);
  const [pageSettingsData, setPageSettingsData] = useState<PuckDocument | null>(null);
  const [pageSettingsFocusField, setPageSettingsFocusField] = useState<string | null>(null);
  // 是否存在尚未发布的草稿修改。
  const [hasPendingDraft, setHasPendingDraft] = useState(false);
  const [reviewStatus, setReviewStatus] = useState<PageDocumentResource["reviewStatus"]>("DRAFT");
  const [publishedNeedsRevalidation, setPublishedNeedsRevalidation] = useState(false);
  const pendingDraftRef = useRef<PuckDocument | null>(null);
  const editingDraftSnapshotRef = useRef<{
    data: PuckDocument;
    metadata: PuckProps;
    resolvedDynamicTemplateDefinitions: ResolvedDynamicTemplateDefinitionMap;
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
    activePageKeyRef.current = workspaceKey;
    // 工作区切换会使旧发布回包失效；新工作区必须立即解除旧 loading，
    // 而旧操作的 finally 不能再清除随后启动的新发布。
    publishOwnerRef.current = null;
    publishOperationRef.current = false;
    setPublishing(false);
    setPreviewMode(false);
  }, [workspaceKey]);

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
  }, [workspaceKey]);

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
      setDraftSaveFailed(false);
      setHasUnsavedChanges(false);
      setHasPendingDraft(false);
      setReviewStatus("DRAFT");
      setPublishedNeedsRevalidation(false);
      setViewingPublished(false);
      setPublishIssues([]);
      setPublishValidationStatus("idle");
      setPublishAttemptFailure(null);
      setPublishReviewActive(false);
      setPublishReviewOpen(false);
      setPublishReviewIssueKey(null);
      previousPublishIssuesRef.current = [];
      setRevisions([]);
      setRevisionsLoading(false);
      setRevisionsLoadingMore(false);
      setRevisionNextBeforeVersion(null);
      setSelectedRevision(null);
      setSelectedRevisionVersion(null);
      setRevisionDetailLoading(false);
      setRevisionDetailError(null);
      revisionDetailRequestRef.current += 1;
      setRollingBackRevisionId(null);
      setDraftSnapshot(null);
      setRevisionFailure(null);
      setDraftDiscardError(null);
      setRevisionsOpen(false);
      setPendingPageHistoryCommand(null);
      pendingPageHistoryCommandRef.current = null;
      pageHistoryCommandsRef.current.clear();
      setPageSettingsOpen(false);
      setPageSettingsData(null);
      pendingDraftRef.current = null;
      editingDraftSnapshotRef.current = null;
      publishedBaselineRef.current = null;
      publishedDataRef.current = null;
      publishedMetadataRef.current = {};
      let serverData = createEditorPageDefault(pageKey);
      const cachedPage = pageSessionCacheRef.current[workspaceKey];
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
        const [publishedResponse, adminResponse] = await Promise.all([
          pageDocumentApi.getPublishedAdmin(pageKey, locale),
          pageDocumentApi.getAdmin(pageKey, locale),
        ]);
        if (cancelled) return;
        const publishedDoc = unwrapResponse<PageDocumentResource | null>(publishedResponse);
        const adminDoc = unwrapResponse<PageDocumentResource | null>(adminResponse);
        setReviewStatus(adminDoc?.reviewStatus ?? "DRAFT");
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
          const displayMetadata = draftPuck
            ? normalizePuckMetadata(adminDoc?.metadata)
            : normalizePuckMetadata(publishedDoc?.metadata);
          setData(serverData);
          latestData.current = serverData;
          dataSignatureRef.current = dataSignature(serverData);
          setMetadata(displayMetadata);
          latestMetadata.current = displayMetadata;
          setViewingPublished(false);
          // 乐观锁与“上次保存时间”仍以草稿文档为准，保证后续保存/发布能正确串行。
          const draftUpdatedAt = adminDoc?.updatedAt || null;
          pageSessionCacheRef.current[workspaceKey] = {
            data: serverData,
            metadata: displayMetadata,
            lastSaved: draftUpdatedAt ? formatEditorTime(draftUpdatedAt) : null,
            updatedAt: draftUpdatedAt,
            contentHash: adminDoc?.contentHash ?? null,
            reviewStatus: adminDoc?.reviewStatus ?? "DRAFT",
          };
        } else if (!cachedPage) {
          // 新页面没有服务端数据时，仅此处一次性落入该页面的正确默认结构。
          setData(serverData);
          latestData.current = serverData;
          dataSignatureRef.current = dataSignature(serverData);
          pageSessionCacheRef.current[workspaceKey] = {
            data: serverData,
            metadata: {},
            lastSaved: null,
            updatedAt: null,
            contentHash: null,
            reviewStatus: "DRAFT",
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
  }, [loadAttempt, locale, message, pageKey, workspaceKey]);

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
          locale,
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
  }, [initialLoading, loadError, loadedPageKey, locale, metadata, pageKey, validationRevision]);

  const retryPublishValidation = useCallback(() => {
    if (publishAttemptFailure?.issue.code === "publish-request-conflict") {
      modal.confirm({
        title: "重新加载远端草稿？",
        content:
          "当前本地修改将被远端草稿替换。系统不会自动合并或覆盖任一侧；请仅在确认放弃本地修改后继续。",
        okText: "重新加载远端草稿",
        cancelText: "保留本地修改",
        okButtonProps: { danger: true },
        onOk: () => setLoadAttempt((attempt) => attempt + 1),
      });
      return;
    }
    setValidationRevision((revision) => revision + 1);
  }, [modal, publishAttemptFailure]);

  useEffect(() => {
    if (!publishAttemptFailure) return;
    const currentSignature = canonicalizePageContent(
      latestData.current,
      latestMetadata.current,
    );
    if (currentSignature === publishAttemptFailure.sourceSignature) return;

    // 显式发布失败属于该次发布快照的操作结果。草稿一旦继续修改，旧失败
    // 不再描述当前上下文；资格问题仍由自动重验独立维护。
    setPublishAttemptFailure(null);
    if (!publishIssues.some((issue) => issue.severity === "error")) {
      setPublishReviewActive(false);
      setPublishReviewOpen(false);
      setPublishReviewIssueKey(null);
    }
  }, [metadata, publishAttemptFailure, publishIssues, validationRevision]);

  const publishReviewIssues = useMemo(() => {
    if (!publishAttemptFailure) return publishIssues;
    const failureKey = getPagePublishIssueKey(publishAttemptFailure.issue);
    return [
      publishAttemptFailure.issue,
      ...publishIssues.filter((issue) => getPagePublishIssueKey(issue) !== failureKey),
    ];
  }, [publishAttemptFailure, publishIssues]);

  useEffect(() => {
    if (publishReviewActive) {
      setPublishReviewIssueKey((currentKey) => reconcilePagePublishIssueKey(
        previousPublishIssuesRef.current,
        currentKey,
        publishReviewIssues.filter((issue) => issue.severity === "error"),
      ));
    }
    previousPublishIssuesRef.current = publishReviewIssues;
  }, [publishReviewActive, publishReviewIssues]);

  const activatePublishReview = useCallback((issues: PublishValidationIssue[]) => {
    const errors = issues.filter((issue) => issue.severity === "error");
    setPublishReviewActive(true);
    setPublishReviewOpen(true);
    setPublishReviewIssueKey((currentKey) => (
      currentKey && errors.some((issue) => getPagePublishIssueKey(issue) === currentKey)
        ? currentKey
        : errors[0] ? getPagePublishIssueKey(errors[0]) : null
    ));
  }, []);

  const openPublishReview = useCallback(() => {
    if (
      !publishReviewActive
      && publishReviewIssues.length === 0
      && publishValidationStatus !== "unavailable"
    ) return;
    activatePublishReview(publishReviewIssues.length > 0
      ? publishReviewIssues
      : [{
          code: "publish-validation-unavailable",
          message: "暂时无法确认发布资格，请重新检查。",
          severity: "error",
          path: "lifecycle.validation",
        }]);
  }, [activatePublishReview, publishReviewActive, publishReviewIssues, publishValidationStatus]);

  const closePublishReview = useCallback(() => {
    setPublishReviewOpen(false);
  }, []);

  const saveDraft = useCallback(
    async (
      nextData: unknown,
      options: { silent?: boolean } = {},
    ): Promise<boolean> => {
      const targetPageKey = pageKey;
      const targetWorkspaceKey = workspaceKey;
      if (
        initialLoading ||
        Boolean(loadError) ||
        loadedPageKey !== targetPageKey
      ) {
        if (!options.silent) message.warning("页面仍在加载，请稍后再保存整页草稿");
        return false;
      }
      const requestedData = getPuckDocument(nextData) ?? latestData.current;
      const requestedMetadata = latestMetadata.current;
      const save = async (): Promise<boolean> => {
        const editableData = requestedData;
        const isActivePage = () => targetWorkspaceKey === activePageKeyRef.current;
        // 顶栏手动保存才点亮按钮 loading 与成功提示；发布前、保存并离开等
        // 内部显式保存使用 silent，避免重复成功提示。
        if (isActivePage() && !options.silent) {
          setDraftSaveFailed(false);
          setSaving(true);
        }
        try {
          const response = await pageDocumentApi.save({
            pageKey: targetPageKey,
            puckData: editableData,
            metadata: requestedMetadata,
            editorVersion: "0.22.4",
            locale,
            expectedUpdatedAt:
              pageSessionCacheRef.current[targetWorkspaceKey]?.updatedAt ||
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
              : pageSessionCacheRef.current[targetWorkspaceKey]?.updatedAt ||
                new Date().toISOString();
          const lastSavedAt = formatEditorTime(updatedAt);
          pageSessionCacheRef.current[targetWorkspaceKey] = {
            data: persistedData,
            metadata: persistedMetadata,
            lastSaved: lastSavedAt,
            updatedAt,
            contentHash: savedDocument?.contentHash ?? null,
            reviewStatus: savedDocument?.reviewStatus ?? "DRAFT",
          };
          if (isActivePage()) setReviewStatus(savedDocument?.reviewStatus ?? "DRAFT");

          if (!isActivePage()) return true;
          setDraftSaveFailed(false);
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
          setDraftSaveFailed(true);
          const status = getEditorHttpStatus(error);
          const isConflict = status === 409;
          if (isConflict) {
            modal.confirm({
              title: "检测到其他人更新了这份整页草稿",
              content:
                "当前页面设置与画布修改仍完整保留。你可以继续留在本地核对，或明确放弃本地修改并重新加载远端整页草稿。",
              okText: "重新加载远端草稿",
              cancelText: "保留本地修改",
              okButtonProps: { danger: true },
              onOk: () => setLoadAttempt((attempt) => attempt + 1),
            });
          } else {
            message.error(status === 403
              ? "当前账号已没有保存草稿的权限；权限可能已发生变化。请重新登录后再试，或联系管理员确认权限。"
              : getEditorErrorMessage(error, "整页草稿保存失败，请重试"));
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
    [initialLoading, loadError, loadedPageKey, locale, message, modal, pageKey, workspaceKey],
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
    const targetWorkspaceKey = workspaceKey;
    setRevisionsLoading(true);
    setRevisionFailure(null);
    try {
      // 列表只承载摘要；当前草稿与当前线上版本从各自权威接口读取，
      // 不能把某条历史列表记录冒充当前线上内容。
      const [revisionsResponse, adminResponse, publishedResponse] = await Promise.all([
        pageDocumentApi.getRevisions(pageKey, locale, { limit: 20 }),
        pageDocumentApi.getAdmin(pageKey, locale),
        pageDocumentApi.getPublishedAdmin(pageKey, locale),
      ]);
      if (targetWorkspaceKey !== activePageKeyRef.current) return;
      const revisionPage = unwrapResponse<PageDocumentRevisionPage>(revisionsResponse);
      const revisionList = revisionPage?.items ?? [];
      setRevisions(revisionList);
      setRevisionNextBeforeVersion(revisionPage?.nextBeforeVersion ?? null);
      const adminDoc = unwrapResponse<PageDocumentResource | null>(adminResponse);
      const publishedDoc = unwrapResponse<PageDocumentResource | null>(publishedResponse);
      const draftPuck = getPuckDocument(adminDoc?.puckData);
      const publishedPuck = getPuckDocument(publishedDoc?.puckData);
      const hasDraft = Boolean(draftPuck);
      const hasPublished = Boolean(publishedPuck);
      if (publishedPuck) {
        const structuredPublished = ensureEditorPageStructure(
          pageKey,
          migratePuckData(publishedPuck),
        );
        publishedDataRef.current = structuredPublished;
        publishedMetadataRef.current = normalizePuckMetadata(publishedDoc?.metadata);
        publishedBaselineRef.current = canonicalizePageContent(
          structuredPublished,
          publishedMetadataRef.current,
        );
      }
      const hasPendingDraft =
        canonicalizePageContent(draftPuck, adminDoc?.metadata) !==
        canonicalizePageContent(publishedPuck, publishedDoc?.metadata);
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
      if (targetWorkspaceKey !== activePageKeyRef.current) return;
      setRevisionFailure({
        message: getEditorErrorMessage(
          error,
          "版本列表加载失败，请稍后重试",
        ),
      });
    } finally {
      if (targetWorkspaceKey === activePageKeyRef.current) setRevisionsLoading(false);
    }
  }, [locale, pageKey, workspaceKey]);

  const loadMoreRevisions = useCallback(async () => {
    if (revisionNextBeforeVersion === null || revisionsLoadingMore) return;
    const targetWorkspaceKey = workspaceKey;
    setRevisionsLoadingMore(true);
    setRevisionFailure(null);
    try {
      const response = await pageDocumentApi.getRevisions(pageKey, locale, {
        beforeVersion: revisionNextBeforeVersion,
        limit: 20,
      });
      const page = unwrapResponse<PageDocumentRevisionPage>(response);
      if (targetWorkspaceKey !== activePageKeyRef.current) return;
      const incoming = page?.items ?? [];
      setRevisions((current) => {
        const existingIds = new Set(current.map((revision) => revision.id));
        return [...current, ...incoming.filter((revision) => !existingIds.has(revision.id))];
      });
      setRevisionNextBeforeVersion(page?.nextBeforeVersion ?? null);
    } catch (error) {
      if (targetWorkspaceKey !== activePageKeyRef.current) return;
      setRevisionFailure({
        message: getEditorErrorMessage(error, "更早版本加载失败，请稍后重试"),
      });
    } finally {
      if (targetWorkspaceKey === activePageKeyRef.current) setRevisionsLoadingMore(false);
    }
  }, [locale, pageKey, revisionNextBeforeVersion, revisionsLoadingMore, workspaceKey]);

  const selectRevision = useCallback(async (revision: PageDocumentRevisionSummary) => {
    const targetWorkspaceKey = workspaceKey;
    const requestId = ++revisionDetailRequestRef.current;
    setSelectedRevisionVersion(revision.version);
    setSelectedRevision(null);
    setRevisionDetailError(null);
    setRevisionDetailLoading(true);
    try {
      const response = await pageDocumentApi.getRevision(pageKey, locale, revision.version);
      const detail = unwrapResponse<PageDocumentRevisionDetail>(response);
      if (
        requestId !== revisionDetailRequestRef.current
        || targetWorkspaceKey !== activePageKeyRef.current
      ) return;
      const document = getPuckDocument(detail?.puckData);
      if (!detail || !document) throw new Error("历史版本正文无效，已拒绝加载");
      setSelectedRevision({
        ...detail,
        puckData: ensureEditorPageStructure(pageKey, migratePuckData(document)),
        metadata: normalizePuckMetadata(detail.metadata),
      });
    } catch (error) {
      if (
        requestId !== revisionDetailRequestRef.current
        || targetWorkspaceKey !== activePageKeyRef.current
      ) return;
      setRevisionDetailError(getEditorErrorMessage(error, "版本详情加载失败，请重试"));
    } finally {
      if (
        requestId === revisionDetailRequestRef.current
        && targetWorkspaceKey === activePageKeyRef.current
      ) setRevisionDetailLoading(false);
    }
  }, [locale, pageKey, workspaceKey]);

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
    const targetWorkspaceKey = workspaceKey;
    try {
      const adminResponse = await pageDocumentApi.getAdmin(pageKey, locale);
      if (targetWorkspaceKey !== activePageKeyRef.current) return;
      const adminDoc = unwrapResponse<PageDocumentResource | null>(adminResponse);
      const draftPuck = getPuckDocument(adminDoc?.puckData);
      if (!draftPuck) {
        message.info("暂无可编辑的草稿");
        return;
      }
      applyDraftToCanvas(draftPuck, adminDoc?.metadata || {});
      message.success("已加载未发布草稿，可继续编辑或重新发布");
    } catch (error) {
      if (targetWorkspaceKey !== activePageKeyRef.current) return;
      console.error("[homepage-editor] 草稿加载失败", error);
      message.error("草稿加载失败，请刷新后重试");
    }
  }, [applyDraftToCanvas, locale, message, pageKey, workspaceKey]);

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
    replaceResolvedDynamicTemplates(snapshot.resolvedDynamicTemplateDefinitions);
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
    const protectedDraft = viewingPublishedRef.current
      ? editingDraftSnapshotRef.current
      : null;
    if (viewingPublishedRef.current) {
      if (protectedDraft) {
        returnToEditingDraft();
      } else {
        // 首次打开且没有独立草稿时，当前线上内容就是新草稿的编辑基线。
        viewingPublishedRef.current = false;
        setViewingPublished(false);
      }
    }
    setPageSettingsData({
      ...latestData.current,
      [DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY]: protectedDraft
        ? protectedDraft.resolvedDynamicTemplateDefinitions
        : resolvedDynamicTemplateDefinitions,
    });
    setPageSettingsFocusField(focusField ?? null);
    setPageSettingsOpen(true);
  }, [resolvedDynamicTemplateDefinitions, returnToEditingDraft]);

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
    const savedPage = pageSessionCacheRef.current[workspaceKey];
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
      resolvedDynamicTemplateDefinitions: {
        ...resolvedDynamicTemplateDefinitions,
      },
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
  }, [hasUnsavedChanges, resolvedDynamicTemplateDefinitions, workspaceKey]);

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

  const canDiscardDraft = hasPendingDraft && publishedDataRef.current !== null;

  const discardDraftToPublished = useCallback(() => {
    if (!canDiscardDraft || !publishedDataRef.current) {
      message.info("当前页面还没有线上版本，无法恢复到线上版本");
      return;
    }
    const targetWorkspaceKey = workspaceKey;
    const targetPublishedData = publishedDataRef.current;
    const targetPublishedMetadata = { ...publishedMetadataRef.current };
    modal.confirm({
      title: "放弃当前草稿并恢复线上版本？",
      content:
        "当前草稿的全部未发布修改将丢失，画布回到线上已发布版本；此操作不可撤销。",
      okText: "放弃草稿",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        if (targetWorkspaceKey !== activePageKeyRef.current) return;
        if (!targetPublishedData) {
          message.info("当前页面还没有线上版本，无法恢复到线上版本");
          return;
        }
        setDraftDiscardError(null);
        // 排空在途保存(如页面设置触发的静默保存):
        // 否则 in-flight 保存会在丢弃完成后回写草稿,让被丢弃的修改"复活"。
        await Promise.resolve(saveQueueRef.current).catch(() => {});
        if (targetWorkspaceKey !== activePageKeyRef.current) return;
        // 真丢弃:服务端用最新发布版覆盖草稿(无发布版则删除文档),
        // 乐观锁防并发覆盖其他编辑者的修改。
        const expectedUpdatedAt =
          pageSessionCacheRef.current[targetWorkspaceKey]?.updatedAt ?? undefined;
        if (!expectedUpdatedAt) {
          setDraftDiscardError("当前页面版本标识缺失，请刷新页面后再放弃草稿");
          return;
        }
        try {
          await pageDocumentApi.discardDraft(pageKey, locale, expectedUpdatedAt);
        } catch (error) {
          if (targetWorkspaceKey === activePageKeyRef.current) {
            setDraftDiscardError(
              getEditorErrorMessage(error, "放弃草稿失败，请稍后重试"),
            );
          }
          return;
        }
        if (targetWorkspaceKey !== activePageKeyRef.current) return;
        controlledCanvasStateRef.current = {
          hasUnsavedChanges: false,
          baselineSignature: null,
        };
        setData(targetPublishedData);
        latestData.current = targetPublishedData;
        dataSignatureRef.current = dataSignature(targetPublishedData);
        setMetadata(targetPublishedMetadata);
        latestMetadata.current = targetPublishedMetadata;
        setHasUnsavedChanges(false);
        setHasPendingDraft(false);
        setViewingPublished(false);
        pendingDraftRef.current = null;
        editingDraftSnapshotRef.current = null;
        viewingPublishedRef.current = false;
        message.success("已放弃草稿，当前内容与线上版本一致");
        // 重拉 admin 文档建立新的乐观锁与保存基准
        try {
          const adminResponse = await pageDocumentApi.getAdmin(pageKey, locale);
          const adminDoc = unwrapResponse<PageDocumentResource | null>(adminResponse);
          pageSessionCacheRef.current[targetWorkspaceKey] = {
            data: targetPublishedData,
            metadata: targetPublishedMetadata,
            lastSaved: null,
            updatedAt: adminDoc?.updatedAt || null,
            contentHash: adminDoc?.contentHash ?? null,
            reviewStatus: adminDoc?.reviewStatus ?? "DRAFT",
          };
          if (targetWorkspaceKey === activePageKeyRef.current) {
            setReviewStatus(adminDoc?.reviewStatus ?? "DRAFT");
          }
        } catch {
          // 基准刷新失败不阻断;下次保存若乐观锁不匹配会显式提示
        }
      },
    });
  }, [canDiscardDraft, locale, message, modal, pageKey, workspaceKey]);

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
    }) => {
      const merged = { ...latestMetadata.current, ...next };
      setMetadata(merged);
      latestMetadata.current = merged;
      // 页面设置已经进入当前内存草稿；即使持久化失败也必须触发离开保护，
      // 不能关闭抽屉后把内容负责人或 SEO 修改静默丢失。
      setHasUnsavedChanges(true);
      setValidationRevision((revision) => revision + 1);
      const saved = await saveDraft(latestData.current, { silent: true });
      if (saved) {
        setPageSettingsOpen(false);
        setPageSettingsData(null);
        message.success("整页草稿已保存，包含页面设置与画布修改");
      }
      return saved;
    },
    [message, saveDraft],
  );

  const stageRevisionAsDraft = useCallback(
    (revision: PageDocumentRevisionDetail) => {
      modal.confirm({
        title: `载入版本 ${revision.version} 到当前草稿？`,
        content:
          hasProtectedUnsavedChanges
            ? "当前未保存修改会被替换，但本次替换本身可以撤销。版本只载入编辑器，不会自动保存或发布。"
            : "版本只载入编辑器并标记为未保存草稿，不会自动保存或发布。",
        okText: "载入当前草稿",
        cancelText: "取消",
        onOk: () => {
          const document = getPuckDocument(revision.puckData);
          if (!document) {
            setRevisionDetailError("历史版本正文无效，已拒绝载入");
            return;
          }
          const restoredData = ensureEditorPageStructure(pageKey, migratePuckData(document));
          const restoredMetadata = normalizePuckMetadata(revision.metadata);
          const restoredHasPendingDraft =
            publishedBaselineRef.current == null
            || canonicalizePageContent(restoredData, restoredMetadata)
              !== publishedBaselineRef.current;
          const cloneHistorySnapshot = (
            snapshot: PageEditorHistorySnapshot,
          ): PageEditorHistorySnapshot => structuredClone(snapshot);
          const before = cloneHistorySnapshot({
            data: latestData.current,
            metadata: latestMetadata.current,
            hasUnsavedChanges,
            hasPendingDraft,
            pendingDraft: pendingDraftRef.current,
            savedSignature: dataSignatureRef.current,
          });
          const after = cloneHistorySnapshot({
            data: restoredData,
            metadata: restoredMetadata,
            hasUnsavedChanges: true,
            hasPendingDraft: restoredHasPendingDraft,
            pendingDraft: restoredData,
            savedSignature: dataSignatureRef.current,
          });
          const command: PageEditorHistoryCommand = {
            id: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
              ? `page-history:${crypto.randomUUID()}`
              : `page-history:${Date.now()}-${Math.random().toString(36).slice(2)}`,
            before,
            after,
          };
          pendingPageHistoryCommandRef.current = command;
          setPendingPageHistoryCommand(command);
          controlledCanvasStateRef.current = {
            hasUnsavedChanges: true,
            baselineSignature: dataSignatureRef.current,
          };
          setData(restoredData);
          latestData.current = restoredData;
          setMetadata(restoredMetadata);
          latestMetadata.current = restoredMetadata;
          setHasUnsavedChanges(true);
          setHasPendingDraft(restoredHasPendingDraft);
          pendingDraftRef.current = restoredData;
          editingDraftSnapshotRef.current = null;
          viewingPublishedRef.current = false;
          setViewingPublished(false);
          setRevisionFailure(null);
          message.success(`版本 ${revision.version} 已载入当前草稿，尚未保存或发布`);
          setRevisionsOpen(false);
        },
      });
    },
    [hasPendingDraft, hasProtectedUnsavedChanges, hasUnsavedChanges, message, modal, pageKey],
  );

  const commitPageHistoryCommand = useCallback((commandId: string, historyIndex: number) => {
    const command = pendingPageHistoryCommandRef.current;
    if (command?.id !== commandId) return;
    for (const index of pageHistoryCommandsRef.current.keys()) {
      if (index >= historyIndex) pageHistoryCommandsRef.current.delete(index);
    }
    pageHistoryCommandsRef.current.set(historyIndex, command);
    pendingPageHistoryCommandRef.current = null;
    setPendingPageHistoryCommand((current) => current?.id === commandId ? null : current);
  }, []);

  const navigatePageHistoryCommand = useCallback((input: {
    direction: "back" | "forward";
    currentHistoryIndex: number;
    targetHistoryIndex: number;
    data: PuckDocument;
  }) => {
    const commandIndex = input.direction === "back"
      ? input.currentHistoryIndex
      : input.targetHistoryIndex;
    const command = pageHistoryCommandsRef.current.get(commandIndex);
    if (!command) return false;
    const snapshot = structuredClone(
      input.direction === "back" ? command.before : command.after,
    );
    controlledCanvasStateRef.current = {
      hasUnsavedChanges: snapshot.hasUnsavedChanges,
      baselineSignature: snapshot.savedSignature,
    };
    setData(input.data);
    latestData.current = input.data;
    setMetadata(snapshot.metadata);
    latestMetadata.current = snapshot.metadata;
    dataSignatureRef.current = snapshot.savedSignature;
    setHasUnsavedChanges(snapshot.hasUnsavedChanges);
    setHasPendingDraft(snapshot.hasPendingDraft);
    pendingDraftRef.current = snapshot.pendingDraft;
    setValidationRevision((revision) => revision + 1);
    return true;
  }, []);

  const rollbackPublication = useCallback(
    (revision: PageDocumentRevisionSummary) => {
      const targetWorkspaceKey = workspaceKey;
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
          if (targetWorkspaceKey !== activePageKeyRef.current) return;
          setRollingBackRevisionId(revision.id);
          setRevisionFailure(null);
          try {
            const response = await pageDocumentApi.rollbackPublication(
              pageKey,
              locale,
              revision.id,
              currentPublished.id,
            );
            const updatedDocument = unwrapResponse<PageDocumentResource | null>(response);
            const cached = pageSessionCacheRef.current[targetWorkspaceKey];
            if (cached && updatedDocument?.updatedAt) {
              pageSessionCacheRef.current[targetWorkspaceKey] = {
                ...cached,
                updatedAt: updatedDocument.updatedAt,
                contentHash: updatedDocument.contentHash ?? cached.contentHash,
                reviewStatus: updatedDocument.reviewStatus ?? cached.reviewStatus,
              };
              if (targetWorkspaceKey === activePageKeyRef.current) {
                setReviewStatus(updatedDocument.reviewStatus ?? cached.reviewStatus);
              }
            }

            const publishedResponse = await pageDocumentApi.getPublishedAdmin(pageKey, locale);
            if (targetWorkspaceKey !== activePageKeyRef.current) return;
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
            if (targetWorkspaceKey !== activePageKeyRef.current) return;
            setRevisionFailure({
              message: getEditorErrorMessage(error, "线上回滚失败，请稍后重试"),
              revision,
              action: "rollback",
            });
            throw error;
          } finally {
            if (targetWorkspaceKey === activePageKeyRef.current) {
              setRollingBackRevisionId(null);
            }
          }
        },
      });
    },
    [loadRevisions, locale, message, modal, pageKey, revisions, workspaceKey],
  );

  const applyReviewResource = useCallback((
    targetWorkspaceKey: string,
    resource: PageDocumentResource | null,
  ) => {
    if (!resource) return;
    const cached = pageSessionCacheRef.current[targetWorkspaceKey];
    if (cached) {
      pageSessionCacheRef.current[targetWorkspaceKey] = {
        ...cached,
        updatedAt: resource.updatedAt ?? cached.updatedAt,
        contentHash: resource.contentHash ?? cached.contentHash,
        reviewStatus: resource.reviewStatus ?? cached.reviewStatus,
      };
    }
    if (activePageKeyRef.current === targetWorkspaceKey) {
      setReviewStatus(resource.reviewStatus ?? "DRAFT");
    }
  }, []);

  const submitForReview = useCallback(async () => {
    const targetWorkspaceKey = workspaceKey;
    const saved = await saveDraft(latestData.current, { silent: true });
    if (!saved) return false;
    if (targetWorkspaceKey !== activePageKeyRef.current) return false;
    const current = pageSessionCacheRef.current[targetWorkspaceKey];
    if (!current?.updatedAt || !current.contentHash) {
      message.error("当前草稿缺少版本或内容指纹，请刷新后重试");
      return false;
    }
    try {
      const response = await pageDocumentApi.submitReview(
        pageKey,
        locale,
        current.updatedAt,
        current.contentHash,
      );
      applyReviewResource(targetWorkspaceKey, unwrapResponse<PageDocumentResource | null>(response));
      if (targetWorkspaceKey === activePageKeyRef.current) {
        message.success("当前语言版本已提交审核");
      }
      return true;
    } catch (error) {
      if (targetWorkspaceKey === activePageKeyRef.current) {
        message.error(getEditorErrorMessage(error, "提交审核失败，请重试"));
      }
      return false;
    }
  }, [applyReviewResource, locale, message, pageKey, saveDraft, workspaceKey]);

  const reviewDraft = useCallback(async (
    action: "APPROVE" | "REQUEST_CHANGES",
    note?: string,
  ) => {
    const targetWorkspaceKey = workspaceKey;
    const current = pageSessionCacheRef.current[targetWorkspaceKey];
    if (!current?.updatedAt || !current.contentHash) {
      message.error("当前草稿缺少版本或内容指纹，请刷新后重试");
      return false;
    }
    try {
      const response = await pageDocumentApi.review(
        pageKey,
        locale,
        current.updatedAt,
        current.contentHash,
        action,
        note,
      );
      applyReviewResource(targetWorkspaceKey, unwrapResponse<PageDocumentResource | null>(response));
      if (targetWorkspaceKey === activePageKeyRef.current) {
        message.success(action === "APPROVE" ? "当前语言版本已批准" : "已退回修改");
      }
      return true;
    } catch (error) {
      if (targetWorkspaceKey === activePageKeyRef.current) {
        message.error(getEditorErrorMessage(error, "审核操作失败，请重试"));
      }
      return false;
    }
  }, [applyReviewResource, locale, message, pageKey, workspaceKey]);

  const publishHome = async (
    nextData: unknown,
  ) => {
    if (!canPublish) {
      message.warning("当前账号只能编辑草稿，请通知管理员审核并发布");
      return;
    }
    if (
      publishOperationRef.current ||
      publishing ||
      initialLoading ||
      Boolean(loadError) ||
      loadedPageKey !== pageKey
    ) {
      if (!publishOperationRef.current && !publishing) {
        message.warning("页面内容仍在加载，请稍后再发布");
      }
      return;
    }
    const targetWorkspaceKey = workspaceKey;
    const publishOwner = Symbol(targetWorkspaceKey);
    const isActivePublish = () => (
      targetWorkspaceKey === activePageKeyRef.current
      && publishOwnerRef.current === publishOwner
    );
    const editableData = nextData ?? latestData.current;
    const pageLabel = getEditorPage(pageKey).label;

    publishOperationRef.current = true;
    publishOwnerRef.current = publishOwner;
    // 用户已明确发起新一次发布；旧操作结果到此失效。自动资格检查状态不受影响。
    setPublishAttemptFailure(null);
    setPublishing(true);
    try {
      const saved = await saveDraft(editableData, { silent: true });
      if (!saved) return;
      if (!isActivePublish()) return;
      const persistedDraft = pageSessionCacheRef.current[targetWorkspaceKey];
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
      if (!persistedDraft.contentHash) {
        message.error("当前页面内容指纹缺失，请刷新页面后再发布");
        return;
      }
      if (persistedDraft.reviewStatus !== "APPROVED") {
        message.warning("当前语言版本尚未通过审核，请先提交并由管理员批准");
        return;
      }
      const persistedUpdatedAt = persistedDraft.updatedAt;
      const persistedContentHash = persistedDraft.contentHash;

      // 发布前以刚保存的服务端草稿重新校验。异步编辑预检只负责即时反馈，
      // 不能代替本次发布动作的同源、最新资格判断。
      const validationResponse = await pageDocumentApi.validate(
        pageKey,
        publishData,
        publishMetadata,
        undefined,
        locale,
      );
      const validation = unwrapResponse<{
        valid: boolean;
        errors: string[];
        issues?: PublishValidationIssue[];
      }>(validationResponse);
      if (!isActivePublish()) return;
      const validationIssues = resolvePublishValidationIssues(validation ?? {});
      const blockingIssues = validationIssues.filter((issue) => issue.severity === "error");
      setPublishIssues(validationIssues);
      setPublishValidationStatus(
        blockingIssues.length > 0 || !validation?.valid ? "invalid" : "valid",
      );

      if (!validation?.valid || blockingIssues.length > 0) {
        const resolvedBlockers = blockingIssues.length > 0
          ? blockingIssues
          : (validation?.errors ?? []).map((errorMessage) => ({
              message: errorMessage,
              severity: "error" as const,
            }));
        setPublishIssues(resolvedBlockers);
        setPublishValidationStatus("invalid");
        activatePublishReview(resolvedBlockers);
        return;
      }

      const publishPersistedDraft = async () => {
        if (!isActivePublish()) return;
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
            locale,
            persistedUpdatedAt,
            persistedContentHash,
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
          pageSessionCacheRef.current[targetWorkspaceKey] = {
            data: publishedData,
            metadata: publishedMetadata,
            lastSaved: formatEditorTime(
              publishedDocument?.updatedAt || new Date(),
            ),
            updatedAt:
              publishedDocument?.updatedAt ||
              pageSessionCacheRef.current[targetWorkspaceKey]?.updatedAt ||
              null,
            contentHash: publishedDocument?.contentHash ?? persistedContentHash,
            reviewStatus: publishedDocument?.reviewStatus ?? "PUBLISHED",
          };

          if (!isActivePublish()) return;
          setReviewStatus(publishedDocument?.reviewStatus ?? "PUBLISHED");
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
          setPublishAttemptFailure(null);
          setPublishReviewActive(false);
          setPublishReviewOpen(false);
          setPublishReviewIssueKey(null);
          setPublishIssues([]);
          setPublishValidationStatus("valid");
          void loadRevisions();
          message.success(
            hasNewerLocalChanges
              ? `${pageLabel}已发布；发布期间的新修改仍保留为未保存内容`
              : pageKey === "home"
                ? "店铺首页已发布，前台页面将立即读取最新版本"
                : `${pageLabel}已发布，前台页面将立即读取最新版本`,
          );
        } catch (error) {
          if (!isActivePublish()) return;
          if (getEditorHttpStatus(error) === 400) {
            try {
              const refreshedResponse = await pageDocumentApi.validate(
                pageKey,
                publishData,
                publishMetadata,
                undefined,
                locale,
              );
              const refreshed = unwrapResponse<{
                valid: boolean;
                errors: string[];
                issues?: PublishValidationIssue[];
              }>(refreshedResponse);
              if (!isActivePublish()) return;
              const refreshedIssues = resolvePublishValidationIssues(refreshed ?? {});
              const refreshedBlockers = refreshedIssues.filter(
                (issue) => issue.severity === "error",
              );
              setPublishIssues(refreshedIssues);
              if (refreshedBlockers.length > 0) {
                setPublishValidationStatus("invalid");
                activatePublishReview(refreshedBlockers);
                return;
              }
            } catch {
              // 保留下面的安全通用错误；不把内部响应正文透传到后台页面。
            }
          }
          const status = getEditorHttpStatus(error);
          const failureMessage = status === 403
            ? "当前账号已没有发布权限；权限可能已发生变化。请重新登录后再试，或联系管理员确认权限。"
            : status === 409
              ? "远端草稿已更新，发布未完成。请选择保留本地修改或重新加载远端草稿。"
              : getEditorErrorMessage(error, "发布失败，请稍后重试");
          const lifecycleIssue: PublishValidationIssue = {
            code: status === 409
              ? "publish-request-conflict"
              : status === 403
                ? "publish-permission-changed"
                : "publish-validation-unavailable",
            message: failureMessage,
            severity: "error",
            path: "lifecycle.publish",
          };
          if (!isActivePublish()) return;
          setPublishAttemptFailure({
            issue: lifecycleIssue,
            sourceSignature: publishSourceSignature,
          });
          activatePublishReview([lifecycleIssue]);
          message.error(failureMessage);
        }
      };

      await publishPersistedDraft();
    } catch (error) {
      const failureMessage = getEditorErrorMessage(error, "发布前校验失败，请稍后重试");
      const lifecycleIssue: PublishValidationIssue = {
        code: "publish-validation-unavailable",
        message: failureMessage,
        severity: "error",
        path: "lifecycle.validation",
      };
      if (!isActivePublish()) return;
      setPublishAttemptFailure({
        issue: lifecycleIssue,
        sourceSignature: canonicalizePageContent(
          latestData.current,
          latestMetadata.current,
        ),
      });
      setPublishIssues([]);
      setPublishValidationStatus("unavailable");
      activatePublishReview([lifecycleIssue]);
      message.error(failureMessage);
    } finally {
      if (publishOwnerRef.current === publishOwner) {
        publishOwnerRef.current = null;
        publishOperationRef.current = false;
        setPublishing(false);
      }
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
    revisionDetailRequestRef.current += 1;
    setRevisionDetailLoading(false);
  }, []);

  const closePageSettings = useCallback(() => {
    setPageSettingsOpen(false);
    setPageSettingsData(null);
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

  const revisionDraftComparison = viewingPublished && editingDraftSnapshotRef.current
    ? {
        puckData: editingDraftSnapshotRef.current.data,
        metadata: editingDraftSnapshotRef.current.metadata,
      }
    : { puckData: data, metadata };
  const revisionPublishedComparison = publishedDataRef.current
    ? {
        puckData: publishedDataRef.current,
        metadata: publishedMetadataRef.current,
      }
    : null;

  return {
    data,
    metadata,
    resolvedDynamicTemplateDefinitions,
    resolvedDynamicTemplatesReady,
    resolvedDynamicTemplatesError,
    saving,
    draftSaveFailed,
    publishing,
    publishIssues,
    publishAttemptFailure,
    publishReviewIssues,
    publishValidationStatus,
    publishReviewActive,
    publishReviewOpen,
    publishReviewIssueKey,
    hasUnsavedChanges,
    hasProtectedUnsavedChanges,
    previewMode,
    revisionsOpen,
    revisionsLoading,
    revisionsLoadingMore,
    revisions,
    revisionNextBeforeVersion,
    selectedRevision,
    selectedRevisionVersion,
    revisionDetailLoading,
    revisionDetailError,
    revisionDraftComparison,
    revisionPublishedComparison,
    rollingBackRevisionId,
    revisionFailure,
    draftDiscardError,
    draftSnapshot,
    initialLoading,
    loadedPageKey,
    loadError,
    canvasDataSyncVersion,
    pendingPageHistoryCommand,
    pageSettingsOpen,
    pageSettingsData: pageSettingsData ?? data,
    pageSettingsFocusField,
    hasPendingDraft,
    reviewStatus,
    canDiscardDraft,
    publishedNeedsRevalidation,
    viewingPublished,
    draftSavedAtLabel: pageSessionCacheRef.current[workspaceKey]?.lastSaved ?? null,
    readViewingPublished,
    commitPuckData,
    retryLoad,
    closeRevisions,
    closePageSettings,
    dismissDraftDiscardError,
    setPreviewMode,
    retryPublishValidation,
    openPublishReview,
    closePublishReview,
    setPublishReviewIssueKey,
    saveDraft,
    switchEditorPage,
    loadRevisions,
    loadMoreRevisions,
    selectRevision,
    editDraftFromRevisions,
    returnToEditingDraft,
    openPageSettingsForEditing,
    editPendingDraft,
    viewPublishedVersion,
    discardDraftToPublished,
    openRevisions,
    savePageSettings,
    stageRevisionAsDraft,
    commitPageHistoryCommand,
    navigatePageHistoryCommand,
    rollbackPublication,
    submitForReview,
    reviewDraft,
    publishHome,
    trackEditorData,
    syncCanvasDataWithoutAdvancingSavedBaseline,
    saveProtectedChanges,
  };
}

export type PageWorkspaceController = ReturnType<typeof usePageWorkspaceController>;
