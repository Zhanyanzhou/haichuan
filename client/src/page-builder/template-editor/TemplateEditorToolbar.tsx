import {
  CopyOutlined,
  DesktopOutlined,
  DownloadOutlined,
  HistoryOutlined,
  DeleteOutlined,
  MobileOutlined,
  RollbackOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { RESPONSIVE_CANVAS } from "../config/blockContracts";
import { useTemplateEditorSession } from "./templateEditorSession";
import {
  CANVAS_TEMPLATE_HISTORY_MESSAGE,
  type CanvasTemplateHistoryMessage,
  useVisualEditorSession,
} from "../visual-editor/visualEditorSession";
import WorkspaceContextControls from "./WorkspaceContextControls";
import useWorkspaceHistoryShortcuts from "./useWorkspaceHistoryShortcuts";
import {
  WorkspaceDeviceSwitcher,
  WorkspaceStatusBadge,
  WorkspaceToolbarActions,
} from "./WorkspaceToolbarPrimitives";

export default function TemplateEditorToolbar({
  onSave,
  onOpenSaveCopy,
  onPublish,
  localOnly = false,
  publishing = false,
  onExport,
  onImport,
  onOpenVersionHistory,
  onArchive,
  onDiscard,
  lifecycleBusy = false,
  onRequestReturn,
}: {
  onSave: () => void;
  onOpenSaveCopy: () => void;
  onPublish?: () => void;
  localOnly?: boolean;
  publishing?: boolean;
  onExport?: () => void;
  onImport?: () => void;
  onOpenVersionHistory?: () => void;
  onArchive?: () => void;
  onDiscard?: () => void;
  lifecycleBusy?: boolean;
  onRequestReturn: () => void;
}) {
  const [toolbarHost, setToolbarHost] = useState<HTMLElement | null>(null);
  const draft = useTemplateEditorSession((state) => state.draft);
  const device = useTemplateEditorSession((state) => state.device);
  const previewMode = useTemplateEditorSession((state) => state.previewMode);
  const saveStatus = useTemplateEditorSession((state) => state.saveStatus);
  const dirty = useTemplateEditorSession((state) => state.dirty);
  const canUndo = useTemplateEditorSession((state) => state.historyPast.length > 0);
  const canRedo = useTemplateEditorSession((state) => state.historyFuture.length > 0);
  const setDevice = useTemplateEditorSession((state) => state.setDevice);
  const setPreviewMode = useTemplateEditorSession((state) => state.setPreviewMode);

  useEffect(() => {
    setToolbarHost(document.getElementById("admin-editor-toolbar-slot"));
  }, []);

  useEffect(() => {
    if (!previewMode) return undefined;
    const exitPreview = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setPreviewMode(false);
    };
    window.addEventListener("keydown", exitPreview);
    return () => window.removeEventListener("keydown", exitPreview);
  }, [previewMode, setPreviewMode]);

  const navigateHistory = useCallback((direction: "back" | "forward") => {
    const state = useTemplateEditorSession.getState();
    if (state.previewMode) return false;
    if (direction === "back") {
      if (state.historyPast.length === 0) return false;
      state.undo();
      if (state.sessionId) {
        useVisualEditorSession.getState().clearCanvasGeometry(`template-editor:${state.sessionId}`);
      }
      return true;
    }
    if (state.historyFuture.length === 0) return false;
    state.redo();
    if (state.sessionId) {
      useVisualEditorSession.getState().clearCanvasGeometry(`template-editor:${state.sessionId}`);
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
  const conflicted = saveStatus === "conflict";
  const publishFailed = saveStatus === "publish-error";
  const publishSucceeded = saveStatus === "publish-success";
  const busy = saving || publishing || lifecycleBusy;
  const needsInitialSave = Boolean(
    draft
    && !localOnly
    && draft.sourceType === "local"
    && saveStatus !== "success",
  );
  const saveDisabledReason = saving
    ? "正在保存模板"
    : publishing
      ? "正在发布模板"
      : lifecycleBusy
        ? "正在更新模板状态"
        : !draft
          ? "请先从模板目录选择一个模板"
          : !draftName.trim()
            ? "请先填写模板名称"
            : !dirty && !needsInitialSave
              ? "当前模板没有未保存修改"
              : null;
  const compactActionItems = [
    ...(draft
      ? [{
          key: "save-copy",
          icon: <CopyOutlined />,
          label: localOnly ? "另存为本机草稿" : "另存为模板",
          onClick: onOpenSaveCopy,
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
          danger: true,
          onClick: onDiscard,
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
    ...(draft && onImport
      ? [{
          key: "import",
          icon: <UploadOutlined />,
          label: "导入模板文件",
          onClick: onImport,
        }]
      : []),
    ...(draft && onArchive
      ? [{
          key: "archive",
          icon: <DeleteOutlined />,
          label: "移入回收站",
          danger: true,
          onClick: onArchive,
        }]
      : []),
  ];
  const menuItems = compactActionItems.map(({ onClick: _onClick, ...item }) => item);
  const handleMenuClick = ({ key }: { key: string }) => {
    compactActionItems.find((item) => item.key === key)?.onClick();
  };
  const publishDisabledReason = publishing
    ? "正在发布模板"
    : saving
      ? "正在保存模板"
      : conflicted
        ? "当前模板存在保存冲突，请先将修改另存为新模板"
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

  const toolbar = (
    <header className="homepage-editor__toolbar template-editor__toolbar">
      <WorkspaceDeviceSwitcher
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
      />

      <WorkspaceContextControls
        activeMode="template"
        onSelectPage={onRequestReturn}
      />

      <WorkspaceToolbarActions
        leading={(
          <WorkspaceStatusBadge
            mode={busy
              ? "saving"
              : saveFailed || publishFailed
                ? "error"
                : conflicted
                  ? "conflict"
                : dirty
                  ? "dirty"
                  : needsInitialSave
                    ? "pending"
                    : draft
                      ? "clean"
                      : "readonly"}
            label={lifecycleBusy
              ? "正在更新模板状态"
              : publishing
              ? "正在发布模板"
              : saving
              ? "正在保存模板"
              : saveFailed
                ? "保存失败"
                : conflicted
                  ? "保存冲突"
                : publishFailed
                  ? "发布失败"
              : dirty
                ? "有未保存修改"
                : needsInitialSave
                  ? "尚未建立模板草稿"
                  : publishSucceeded
                    ? "已发布新版本"
                : draft
                  ? (localOnly ? "本机草稿已保存" : "模板草稿已保存")
                  : "未选择模板"}
            detail={saveFailed
              ? "修改仍在 · 可重试"
              : conflicted
                ? "修改仍在 · 请另存副本"
              : publishFailed
                ? "草稿仍在 · 可重试"
                : publishSucceeded
                  ? "已有页面保持原版本"
                  : localOnly && draft
                    ? "发布不可用"
                    : needsInitialSave
                      ? "首次保存后可管理"
                      : null}
            ariaLabel={lifecycleBusy
              ? "模板状态：正在更新模板状态"
              : publishing
              ? "模板状态：正在发布模板"
              : saving
              ? "模板状态：正在保存模板"
              : saveFailed
                ? "模板状态：保存失败，修改仍在，可以重试"
                : conflicted
                  ? "模板状态：保存冲突，修改仍在，请另存为新模板"
                : publishFailed
                  ? "模板状态：发布失败，草稿仍在，可以重试"
              : dirty
                ? "模板状态：有未保存修改"
                : needsInitialSave
                  ? "模板状态：尚未建立模板草稿"
                  : publishSucceeded
                    ? "模板状态：已发布新版本，已有页面保持原版本"
                : draft
                  ? (localOnly ? "模板状态：本机测试草稿已保存" : "模板状态：模板草稿已保存")
                  : "模板状态：未选择模板"}
          />
        )}
        history={{
          canUndo: canUndo && !previewMode,
          canRedo: canRedo && !previewMode,
          onUndo: () => { navigateHistory("back"); },
          onRedo: () => { navigateHistory("forward"); },
        }}
        preview={{
          active: previewMode,
          label: previewMode ? "退出预览" : "预览",
          disabled: !draft || busy,
          onClick: () => setPreviewMode(!previewMode),
          ariaLabel: previewMode ? "退出模板预览" : "预览模板",
          title: previewMode ? "退出当前模板预览（Esc）" : "预览当前模板草稿，不会保存或发布",
        }}
        save={{
          label: conflicted ? "另存副本" : saveFailed ? "重试保存" : localOnly ? "保存本机草稿" : "保存模板",
          loading: saving,
          disabled: conflicted ? false : Boolean(saveDisabledReason),
          onClick: conflicted ? onOpenSaveCopy : onSave,
          ariaLabel: conflicted
            ? "另存当前冲突修改为新模板"
            : saveFailed
            ? "重试保存模板草稿"
            : localOnly
              ? "保存本机测试草稿"
              : "保存模板",
          title: conflicted
            ? "服务端已有其他人的新修改；另存为新模板可完整保留当前工作"
            : saveDisabledReason ?? (saveFailed
              ? "重新保存当前模板草稿；失败不会丢失修改"
              : needsInitialSave
                ? "首次保存后建立可管理的模板草稿，不会自动发布页面"
                : localOnly
                  ? "只保存到当前浏览器本机存储，不写入服务端模板"
                  : "保存当前模板草稿，不会自动发布页面"),
        }}
        more={{
          items: menuItems,
          onClick: handleMenuClick,
          disabled: busy || compactActionItems.length === 0,
          ariaLabel: "更多模板操作",
          title: compactActionItems.length > 0 ? "更多模板操作" : "当前模板没有其他可用操作",
        }}
        publish={{
          label: localOnly && !onPublish ? "不可发布" : publishFailed ? "重试发布" : "发布",
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
