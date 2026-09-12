import {
  CloseCircleOutlined,
  DesktopOutlined,
  DownloadOutlined,
  HistoryOutlined,
  InfoCircleOutlined,
  SettingOutlined,
  DeleteOutlined,
  MobileOutlined,
  TabletOutlined,
  PlusOutlined,
  RollbackOutlined,
} from "@ant-design/icons";
import { Button } from "antd";
import { useCallback, useEffect, useState, type Ref } from "react";
import { createPortal } from "react-dom";
import type { TemplatePublishReview } from "./TemplateWorkspaceController";
import { RESPONSIVE_CANVAS } from "../config/blockContracts";
import { useTemplateEditorSession } from "./templateEditorSession";
import {
  CANVAS_TEMPLATE_HISTORY_MESSAGE,
  type CanvasTemplateHistoryMessage,
  useVisualEditorSession,
} from "../visual-editor/visualEditorSession";
import useWorkspaceHistoryShortcuts from "./useWorkspaceHistoryShortcuts";
import { resolveTemplatePublicationStatus } from "./templatePublicationStatus";
import { deriveTemplatePersistencePresentation } from "./templatePublishWorkflow";
import WorkspaceContextControls from "./WorkspaceContextControls";
import {
  WorkspaceDeviceSwitcher,
  WorkspaceToolbarActions,
} from "./WorkspaceToolbarPrimitives";

export default function TemplateEditorToolbar({
  onCreate,
  onSave,
  onPublish,
  localOnly = false,
  publishing = false,
  publishReview = null,
  publishIssueEditing = false,
  publishedDraftUnavailable = false,
  onOpenPublishReview,
  onExport,
  onOpenVersionHistory,
  onArchive,
  onDiscard,
  onCloseSession,
  lifecycleBusy = false,
  onRequestReturn,
  onTogglePreview,
  previewButtonRef,
}: {
  onCreate?: () => void;
  onSave?: () => void;
  onPublish?: () => void;
  localOnly?: boolean;
  publishing?: boolean;
  publishReview?: TemplatePublishReview | null;
  publishIssueEditing?: boolean;
  publishedDraftUnavailable?: boolean;
  onOpenPublishReview?: () => void;
  onExport?: () => void;
  onOpenVersionHistory?: () => void;
  onArchive?: () => void;
  onDiscard?: () => void;
  onCloseSession?: () => void;
  lifecycleBusy?: boolean;
  onRequestReturn: () => void;
  onTogglePreview: () => void;
  previewButtonRef?: Ref<HTMLButtonElement>;
}) {
  const [toolbarHost, setToolbarHost] = useState<HTMLElement | null>(null);
  const draft = useTemplateEditorSession((state) => state.draft);
  const device = useTemplateEditorSession((state) => state.device);
  const breakpoint = useTemplateEditorSession((state) => state.breakpoint);
  const setBreakpoint = useTemplateEditorSession((state) => state.setBreakpoint);
  const previewMode = useTemplateEditorSession((state) => state.previewMode);
  const previewScenario = useTemplateEditorSession((state) => state.previewScenario);
  const productionReviewFacts = useTemplateEditorSession((state) => state.productionReviewFacts);
  const saveStatus = useTemplateEditorSession((state) => state.saveStatus);
  const dirty = useTemplateEditorSession((state) => state.dirty);
  const hasBaseline = useTemplateEditorSession((state) => Boolean(state.baseline));
  const canUndo = useTemplateEditorSession((state) => state.historyPast.length > 0);
  const canRedo = useTemplateEditorSession((state) => state.historyFuture.length > 0);
  const setDevice = useTemplateEditorSession((state) => state.setDevice);
  const confirmStressPreviewScenarioReview = useTemplateEditorSession(
    (state) => state.confirmStressPreviewScenarioReview,
  );

  useEffect(() => {
    setToolbarHost(document.getElementById("admin-editor-toolbar-slot"));
  }, []);

  const navigateHistory = useCallback((direction: "back" | "forward") => {
    const state = useTemplateEditorSession.getState();
    if (state.previewMode) return false;
    if (direction === "back") {
      if (state.historyPast.length === 0) return false;
      state.undo();
      if (state.sessionId) {
        useVisualEditorSession.getState()
          .clearCanvasGeometryNamespace(`template-editor:${state.sessionId}`);
      }
      return true;
    }
    if (state.historyFuture.length === 0) return false;
    state.redo();
    if (state.sessionId) {
      useVisualEditorSession.getState()
        .clearCanvasGeometryNamespace(`template-editor:${state.sessionId}`);
    }
    return true;
  }, []);

  useWorkspaceHistoryShortcuts({
    disabled: previewMode,
    onNavigate: navigateHistory,
  });

  useEffect(() => {
    const handleCanvasHistory = (event: MessageEvent<CanvasTemplateHistoryMessage>) => {
      if (event.origin && event.origin !== window.location.origin) return;
      const message = event.data;
      const state = useTemplateEditorSession.getState();
      if (
        message?.type !== CANVAS_TEMPLATE_HISTORY_MESSAGE
        || message.workspace !== "template"
        || !state.sessionId
        || message.templateSessionId !== state.sessionId
        || (
          message.blockId !== `template-editor:${state.sessionId}`
          && !message.blockId.startsWith(`template-editor:${state.sessionId}:`)
        )
      ) return;
      navigateHistory(message.direction);
    };
    window.addEventListener("message", handleCanvasHistory);
    return () => window.removeEventListener("message", handleCanvasHistory);
  }, [navigateHistory]);

  const draftName = draft?.definition.name ?? "未选择模板";
  const desktopPreviewWidth = draft?.definition.metadata.previewDesktopWidth
    ?? RESPONSIVE_CANVAS.desktop.width;
  const mobilePreviewWidth = draft?.definition.metadata.previewMobileWidth
    ?? RESPONSIVE_CANVAS.mobile.width;
  const saving = saveStatus === "saving";
  const saveFailed = saveStatus === "error";
  const permissionDenied = saveStatus === "permission-error";
  const conflicted = saveStatus === "conflict";
  const publishFailed = saveStatus === "publish-error";
  const publicationStatus = !draft
    ? null
    : draft.sourceType === "persisted" && draft.remote
      ? resolveTemplatePublicationStatus({
          status: draft.remote.status,
          publishedVersion: draft.remote.publishedVersion,
          draftDefinitionChecksum: draft.remote.draftDefinitionChecksum,
          publishedDefinitionChecksum: draft.remote.publishedDefinitionChecksum,
        })
      : "draft" as const;
  const hasUnpublishedDraftChanges = publicationStatus === "published-with-unpublished-changes";
  const busy = saving || publishing || lifecycleBusy;
  const persistence = deriveTemplatePersistencePresentation({
    draft,
    localOnly,
    hasBaseline,
    dirty,
    saveStatus,
  });
  const needsInitialSave = Boolean(
    draft && persistence.state === "unpersisted",
  );
  const currentStressScenarioReviewed = productionReviewFacts.stressPreview[previewScenario];
  const saveDisabledReason = saving
    ? "正在保存模板"
    : publishing
      ? "正在发布模板"
      : lifecycleBusy
        ? "正在更新模板状态"
        : previewMode
          ? "退出预览后才能保存模板"
        : publishedDraftUnavailable
          ? "正式版本已发布，但当前没有可编辑草稿；请为当前模板重新建立编辑草稿"
        : !draft
          ? "请先从模板目录选择一个模板"
          : !draftName.trim()
            ? "请先填写模板名称"
            : !dirty && !needsInitialSave
              ? "当前模板没有未保存修改"
              : null;
  const compactActionItems = [
    {
      key: "new-template",
      icon: <PlusOutlined />,
      label: "新建模板",
      className: "template-editor__toolbar-new-menu-item",
      onClick: onCreate,
    },
    ...(draft
      ? [{
          key: "template-metadata",
          icon: <InfoCircleOutlined />,
          label: "模板资料与使用限制",
          onClick: () => window.dispatchEvent(new Event("template-editor:open-metadata")),
        }]
      : []),
    ...(draft && onOpenVersionHistory
      ? [{
          key: "versions",
          icon: <HistoryOutlined />,
          label: "版本历史",
          onClick: onOpenVersionHistory,
        }]
      : []),
    ...(draft && dirty && onDiscard
      ? [{
          key: "discard",
          icon: <RollbackOutlined />,
          label: "放弃未保存修改",
          disabled: previewMode,
          danger: true,
          onClick: onDiscard,
        }]
      : []),
    ...(draft && onCloseSession
      ? [{
          key: "close-session",
          icon: <CloseCircleOutlined />,
          label: "关闭模板会话",
          onClick: onCloseSession,
        }]
      : []),
    ...(draft && onExport
      ? [{
          key: "export",
          icon: <DownloadOutlined />,
          label: "导出模板文件",
          onClick: onExport,
        }]
      : []),
    ...(draft && onArchive
      ? [{
          key: "archive",
          icon: <DeleteOutlined />,
          label: "移入回收站",
          disabled: previewMode,
          danger: true,
          onClick: onArchive,
        }]
      : []),
  ];
  const menuItems = compactActionItems.map(({ onClick: _onClick, ...item }) => item);
  const handleMenuClick = ({ key }: { key: string }) => {
    compactActionItems.find((item) => item.key === key)?.onClick?.();
  };
  const publishDisabledReason = publishing
    ? "正在发布模板"
      : saving
        ? "正在保存模板"
      : previewMode
        ? "退出预览后才能检查并发布模板"
      : conflicted
        ? "当前模板存在保存冲突，请重新读取目录并处理冲突后再保存"
      : permissionDenied
        ? "服务端已拒绝当前账号保存这个模板，请联系管理员"
      : publishedDraftUnavailable
        ? "正式版本已发布，但当前没有可编辑草稿；请为当前模板重新建立编辑草稿"
      : !draft
    ? "请先从模板目录选择一个模板"
    : !onPublish
        ? (localOnly ? "Mock 模式只保存本机测试草稿，不支持服务端发布" : "当前模板暂不支持发布")
        : !draftName.trim()
          ? "请先填写模板名称"
          : null;
  const publishWillSaveFirst = Boolean(
    draft
    && (
      dirty
      || draft.sourceType === "local"
      || draft.requiresContractNormalization === true
    ),
  );
  const workflowStatus = publishReview?.workflow.status;
  const workflowFailed = workflowStatus === "partial-failure";
  const workflowStale = workflowStatus === "review-stale";
  const toolbarStateMode = persistence.state === "failed"
    || publishFailed
    || workflowFailed
      ? "error"
      : workflowStale
        ? "warning"
        : busy
            ? "pending"
            : persistence.state === "dirty"
              || persistence.state === "unpersisted"
              || hasUnpublishedDraftChanges
              ? "dirty"
              : "clean";
  const toolbarStateLabel = lifecycleBusy
        ? "正在更新"
        : publishing
          ? "正在发布"
          : saving
            ? persistence.label
            : publishFailed
              ? "发布失败"
              : hasUnpublishedDraftChanges && persistence.saved
                ? "有未发布修改"
                : persistence.label;
  const toolbarStateAriaLabel = workflowStatus === "partial-failure"
        ? publishReview?.workflow.reason === "template-published-catalog-stale"
          ? "目录未同步"
          : "发布未完成"
      : workflowStatus === "review-stale"
        ? "发布检查已过期"
      : workflowStatus === "review-blocked"
        ? "发布检查有阻断"
      : workflowStatus === "review-ready"
        ? "待确认发布"
      : workflowStatus === "verifying-uncertain"
        ? "正在核对结果"
      : workflowStatus === "published"
        ? publishReview?.workflow.catalogStatus === "fresh" ? "模板已发布" : "正在同步目录"
      : lifecycleBusy
        ? "模板状态：正在更新模板状态"
        : publishing
          ? "模板状态：正在发布模板"
          : saving
            ? persistence.ariaLabel
            : publishFailed
              ? "模板状态：发布失败，草稿仍在，可以重试"
              : hasUnpublishedDraftChanges && persistence.saved
                ? "模板状态：有未发布修改"
                : persistence.ariaLabel;
  const toolbarStateAction = publishReview ? onOpenPublishReview : undefined;

  const toolbar = (
    <header className="homepage-editor__toolbar template-editor__toolbar">
      {Number(draft?.definition.schemaVersion) >= 2 ? <WorkspaceDeviceSwitcher
        ariaLabel="模板响应式断点"
        title="切换模板的桌面、平板或手机布局规则"
        value={breakpoint}
        options={[
          { value: "desktop", label: "桌面", detail: `${desktopPreviewWidth} px`, icon: <DesktopOutlined />, ariaLabel: `桌面端模板布局（${desktopPreviewWidth} px）` },
          { value: "tablet", label: "平板", detail: "834 px", icon: <TabletOutlined />, ariaLabel: "平板端模板布局（834 px）" },
          { value: "mobile", label: "手机", detail: `${mobilePreviewWidth} px`, icon: <MobileOutlined />, ariaLabel: `移动端模板布局（${mobilePreviewWidth} px）` },
        ]}
        onChange={setBreakpoint}
      /> : <WorkspaceDeviceSwitcher
        ariaLabel="模板设计设备：桌面端与移动端规则分别调整"
        title="切换模板的桌面端或移动端布局规则"
        value={device}
        options={[
          {
            value: "desktop",
            label: "桌面端",
            detail: `${desktopPreviewWidth} px`,
            icon: <DesktopOutlined />,
            ariaLabel: `桌面端模板布局（${desktopPreviewWidth} px）`,
          },
          {
            value: "mobile",
            label: "移动端",
            detail: `${mobilePreviewWidth} px`,
            icon: <MobileOutlined />,
            ariaLabel: `移动端模板布局（${mobilePreviewWidth} px）`,
          },
        ]}
        onChange={setDevice}
      />}

      <WorkspaceContextControls
        activeMode="template"
        subjectLabel="当前模板"
        subjectValue={draftName}
        status={toolbarStateAction ? (
          <button
            type="button"
            className="template-editor__toolbar-state"
            data-mode={toolbarStateMode}
            onClick={toolbarStateAction}
            aria-label={`${toolbarStateAriaLabel}，点击查看详情`}
          >
            <i aria-hidden="true" />
            <span>{toolbarStateLabel}</span>
          </button>
        ) : (
          <span
            className="template-editor__toolbar-state"
            data-mode={toolbarStateMode}
            role="status"
            aria-label={toolbarStateAriaLabel}
          >
            <i aria-hidden="true" />
            <span>{toolbarStateLabel}</span>
          </span>
        )}
        onSelectPage={previewMode ? undefined : onRequestReturn}
      />

      <WorkspaceToolbarActions
        leading={(
          <>
            <Button
              className="template-editor__toolbar-new"
              size="small"
              icon={<PlusOutlined />}
              disabled={busy || previewMode || !onCreate}
              onClick={onCreate}
              aria-label="顶部新建模板"
              title="配置并生成模板；当前模板有未保存修改时会先询问如何处理"
            >
              新建模板
            </Button>
            {draft && !previewMode ? (
              <Button
                className="template-editor__toolbar-settings"
                size="small"
                icon={<SettingOutlined />}
                disabled={busy || (Boolean(publishReview) && !publishIssueEditing)}
                onClick={() => window.dispatchEvent(new Event("template-editor:open-settings"))}
                aria-label="打开模板设置"
                title="修改模板名称、画布尺寸与整体样式"
              >
                {!draftName.trim() || draftName === "未命名模板" ? "填写模板名称" : "模板设置"}
              </Button>
            ) : null}
            {previewMode && draft ? (
              <Button
                size="small"
                disabled={currentStressScenarioReviewed}
                onClick={() => confirmStressPreviewScenarioReview(previewScenario)}
                aria-label={currentStressScenarioReviewed
                  ? "当前压力预览场景已核对"
                  : "确认当前压力预览场景已核对"}
                title={currentStressScenarioReviewed
                  ? "当前压力预览场景已经明确核对"
                  : "确认当前只读压力预览场景的内容、比例与溢出均已核对"}
              >
                {currentStressScenarioReviewed ? "当前场景已核对" : "确认当前场景已核对"}
              </Button>
            ) : null}
          </>
        )}
        history={{
          canUndo: canUndo && !previewMode,
          canRedo: canRedo && !previewMode,
          onUndo: () => { navigateHistory("back"); },
          onRedo: () => { navigateHistory("forward"); },
        }}
        preview={{
          active: previewMode,
          buttonRef: previewButtonRef,
          label: previewMode ? "退出预览" : "预览",
          disabled: !draft || busy || Boolean(publishReview),
          onClick: onTogglePreview,
          ariaLabel: previewMode ? "退出模板预览" : "预览模板",
          title: publishReview
            ? "请先完成或取消当前发布检查"
            : previewMode
              ? "退出当前模板预览（Esc）"
              : "预览当前模板草稿，不会保存或发布",
        }}
        save={{
          label: conflicted ? "存在保存冲突" : saveFailed || permissionDenied ? "重试保存" : localOnly ? "保存本机草稿" : "保存草稿",
          loading: saving,
          disabled: Boolean(saveDisabledReason),
          onClick: () => onSave?.(),
          ariaLabel: conflicted
            ? "当前模板存在保存冲突"
            : saveFailed || permissionDenied
            ? "重试保存模板草稿"
            : localOnly
              ? "保存本机测试草稿"
              : "保存模板",
          title: conflicted
            ? "服务端已有其他人的新修改；请重新读取目录并处理冲突，当前编辑内容仍保留"
            : saveDisabledReason ?? (saveFailed || permissionDenied
              ? permissionDenied
                ? "再次向服务端检查当前账号能否保存；失败不会丢失修改"
                : "重新保存当前模板草稿；失败不会丢失修改"
              : needsInitialSave
                ? "首次保存后建立可管理的模板草稿，不会自动发布页面"
                : localOnly
                  ? "只保存到当前浏览器本机存储，不写入服务端模板"
                  : "保存当前模板草稿，不会自动发布页面"),
        }}
        more={{
          items: menuItems,
          onClick: handleMenuClick,
          disabled: busy || previewMode || compactActionItems.length === 0,
          ariaLabel: "更多模板操作",
          title: compactActionItems.length > 0 ? "更多模板操作" : "当前模板没有其他可用操作",
        }}
        publish={{
          label: localOnly && !onPublish ? "不可发布" : "发布模板",
          loading: publishing,
          disabled: Boolean(publishDisabledReason),
          onClick: () => onPublish?.(),
          ariaLabel: publishDisabledReason
            ? `发布模板新版本（${publishDisabledReason}）`
            : publishFailed
              ? "重试发布模板新版本（当前草稿仍保留）"
            : publishWillSaveFirst
              ? "发布模板新版本（将先保存当前模板草稿）"
              : "发布模板新版本",
          title: publishDisabledReason
            ?? (publishFailed
              ? "重新发布当前模板的新版本；失败不会丢失模板草稿"
              : publishWillSaveFirst
                ? "将先保存当前模板草稿，再发布新版本；现有页面仍保持原版本"
                : "发布当前模板的新版本；现有页面仍保持原版本"),
        }}
      />
    </header>
  );

  return toolbarHost ? createPortal(toolbar, toolbarHost) : toolbar;
}
