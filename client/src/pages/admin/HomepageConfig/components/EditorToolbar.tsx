/**
 * EditorToolbar.tsx — 装修编辑器顶部工具栏。
 * 页面身份 + 设备切换器 + 状态/历史/预览/保存/发布主操作；
 * 页面级低频工具使用带文字的独立入口。
 * （自 index.tsx 平移，逻辑零变更）
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useGetPuck, type Data, type UiState } from "@puckeditor/core";
import { App as AntdApp } from "antd";
import {
  DeleteOutlined,
  DesktopOutlined,
  DownloadOutlined,
  EditOutlined,
  EyeOutlined,
  ExclamationCircleOutlined,
  HistoryOutlined,
  LayoutOutlined,
  MobileOutlined,
  SettingOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import type { EditorPageKey } from "@/page-builder/config/editorPages";
import type { PuckDocument } from "@/page-builder/types";
import {
  createEditorPageDefault,
  ensureEditorPageStructure,
  getEditorPage,
} from "@/page-builder/config/editorPages";
import { RESPONSIVE_CANVAS } from "@/page-builder/config/blockContracts";
import { BLOCK_META } from "@/page-builder/config/blockMeta";
import { migratePuckData } from "@/page-builder/utils/migratePuckData";
import { USE_MOCK } from "@/services/mockData";
import {
  focusCanvasBlock,
  useEditorHistoryTransaction,
  useHomepagePuck,
} from "../editor-store";
import {
  useVisualEditorSession,
  type VisualEditorMode,
  type VisualNodeSelection,
} from "@/page-builder/visual-editor/visualEditorSession";
import type { PublishValidationStatus } from "@/page-builder/inspector/publishValidation";
import type { PublicContentLocale } from "@/i18n/publicLocale";
import { formatViewportSize, type ViewportPreset } from "../editor-utils";
import WorkspaceContextControls from "@/page-builder/template-editor/WorkspaceContextControls";
import useWorkspaceHistoryShortcuts from "@/page-builder/template-editor/useWorkspaceHistoryShortcuts";
import {
  WorkspaceDeviceSwitcher,
  WorkspaceToolbarActions,
} from "@/page-builder/template-editor/WorkspaceToolbarPrimitives";

export const VIEWPORT_PRESETS: ViewportPreset[] = [
  // 平板档已移除（2026-08-16 用户决策）：平板继承桌面布局无独立编辑价值，
  // 仅移动端有独立素材/焦点/比例，保留两档。
  { label: "桌面端", icon: <DesktopOutlined />, ...RESPONSIVE_CANVAS.desktop },
  { label: "移动端", icon: <MobileOutlined />, ...RESPONSIVE_CANVAS.mobile },
];

export default function EditorToolbar({
  pageKey,
  locale,
  reviewStatus,
  publishing,
  saving,
  hasPendingDraft,
  draftSaveFailed,
  canDiscardDraft,
  publishedNeedsRevalidation,
  viewingPublished,
  previewMode,
  hasUnsavedChanges,
  canPublish,
  canManageTemplates,
  draftSavedAtLabel,
  publishValidationStatus,
  publishAttemptFailed,
  publishReviewActive,
  publishReviewErrorCount,
  onOpenPublishReview,
  onLocaleChange,
  localeSwitchDisabled,
  onSubmitReview,
  onApproveReview,
  onRequestChanges,
  onPublish,
  onSaveDraft,
  onExitViewing,
  onEditPendingDraft,
  onViewPublishedVersion,
  onDiscardDraft,
  onOpenRevisions,
  onOpenPageSettings,
  onRetryPublishValidation,
  onPreviewModeChange,
  onDataChange,
  onCanvasDataSync,
  onPageHistoryNavigation,
  onEnterTemplateMode,
  restoreViewport,
}: {
  pageKey: EditorPageKey;
  locale: PublicContentLocale;
  reviewStatus: "DRAFT" | "IN_REVIEW" | "CHANGES_REQUESTED" | "APPROVED" | "PUBLISHED" | "ARCHIVED";
  publishing: boolean;
  saving: boolean;
  hasPendingDraft: boolean;
  draftSaveFailed: boolean;
  canDiscardDraft: boolean;
  publishedNeedsRevalidation: boolean;
  viewingPublished: boolean;
  previewMode: boolean;
  hasUnsavedChanges: boolean;
  canPublish: boolean;
  canManageTemplates: boolean;
  draftSavedAtLabel: string | null;
  publishValidationStatus: PublishValidationStatus;
  publishAttemptFailed: boolean;
  publishReviewActive: boolean;
  publishReviewErrorCount: number;
  onOpenPublishReview: () => void;
  onLocaleChange: (locale: PublicContentLocale) => void;
  localeSwitchDisabled: boolean;
  onSubmitReview: () => void;
  onApproveReview: () => void;
  onRequestChanges: (note: string) => void;
  onPublish: (data: unknown) => void;
  onSaveDraft: (data: unknown) => void;
  onExitViewing: () => void;
  onEditPendingDraft: () => void;
  onViewPublishedVersion: () => void;
  onDiscardDraft: () => void;
  onOpenRevisions: () => void;
  onOpenPageSettings: () => void;
  onRetryPublishValidation: () => void;
  onPreviewModeChange: (previewing: boolean) => void;
  onDataChange: (data: unknown) => void;
  /** 整页替换或历史导航后同步父层 data prop，不推进已保存草稿基线。 */
  onCanvasDataSync: (data: unknown) => void;
  onPageHistoryNavigation: (input: {
    direction: "back" | "forward";
    currentHistoryIndex: number;
    targetHistoryIndex: number;
    data: PuckDocument;
  }) => boolean;
  onEnterTemplateMode: (viewport: { width: number; height: number }) => void;
  restoreViewport?: { width: number; height: number } | null;
}) {
  const { message, modal } = AntdApp.useApp();
  const [toolbarHost, setToolbarHost] = useState<HTMLElement | null>(null);
  const getPuck = useGetPuck();
  const appData = useHomepagePuck((state) => state.appState.data);
  const viewports = useHomepagePuck((state) => state.appState.ui.viewports);
  const dispatch = useHomepagePuck((state) => state.dispatch);
  const canUndo = useHomepagePuck((state) => state.history.hasPast);
  const canRedo = useHomepagePuck((state) => state.history.hasFuture);
  const historyPending = useEditorHistoryTransaction((state) => state.pending);
  const previewSelectionRef = useRef<{
    itemSelector: UiState["itemSelector"];
    blockId?: string;
    visualSelection: VisualNodeSelection | null;
    visualMode: VisualEditorMode;
    panelMode: "content" | "design";
  } | null>(null);
  const wasPreviewModeRef = useRef(previewMode);
  const currentViewport = viewports.current;
  const publishUnavailableReason = USE_MOCK
      ? "Mock 模式未连接真实发布服务"
    : viewingPublished
      ? "正在查看线上版本，无需重复发布"
    : !canPublish
      ? "当前账号可提交审核，发布需由管理员完成"
    : reviewStatus !== "APPROVED"
      ? "当前语言版本需先通过审核"
      : null;
  const publishActionLabel = publishUnavailableReason
    ? `发布到前台网站（${publishUnavailableReason}）`
    : "发布到前台网站";
  const draftStatusMode = saving
    ? "saving"
    : draftSaveFailed
      ? "error"
    : hasUnsavedChanges
      ? "dirty"
      : viewingPublished
        ? "readonly"
        : hasPendingDraft
          ? "pending"
          : "clean";
  const draftStatusLabel = draftStatusMode === "saving"
    ? "保存中…"
    : draftStatusMode === "error"
      ? "保存失败"
    : draftStatusMode === "dirty"
      ? "有未保存修改"
      : draftStatusMode === "pending"
        ? "有未发布更改"
        : draftStatusMode === "readonly"
          ? "线上版本"
          : draftSavedAtLabel
            ? `已保存 ${draftSavedAtLabel}`
            : "与线上版本一致";
  const savedAtDescription = draftSavedAtLabel && draftStatusMode !== "clean"
    ? `，已保存 ${draftSavedAtLabel}`
    : "";
  const draftStatusAriaLabel = `草稿状态：${draftStatusLabel}${savedAtDescription}${draftSaveFailed ? "，请重试" : ""}`;
  const toolbarPublishReviewMode = publishing
    ? "pending"
    : publishAttemptFailed
      || publishReviewErrorCount > 0
      || publishValidationStatus === "unavailable"
      ? "error"
      : "clean";
  const toolbarPublishReviewLabel = publishing
    ? "正在发布页面…"
    : publishAttemptFailed
      ? "发布失败 · 可重试"
      : publishValidationStatus === "validating"
        ? "正在检查发布资格…"
        : publishValidationStatus === "unavailable"
          ? "发布检查不可用"
          : publishReviewErrorCount > 0
            ? `发布未通过 · ${publishReviewErrorCount} 项`
            : "已满足发布门禁";

  useEffect(() => {
    onDataChange(appData);
  }, [appData, onDataChange]);

  useEffect(() => {
    setToolbarHost(document.getElementById("admin-editor-toolbar-slot"));
  }, []);

  const setViewport = useCallback(
    (preset: Pick<ViewportPreset, "width" | "height">) => {
      dispatch({
        type: "setUi",
        ui: {
          viewports: {
            ...viewports,
            current: { width: preset.width, height: preset.height },
          },
        },
      });
    },
    [dispatch, viewports],
  );

  const restoredViewportRef = useRef(false);
  useEffect(() => {
    if (restoredViewportRef.current || !restoreViewport) return;
    restoredViewportRef.current = true;
    setViewport(restoreViewport);
  }, [restoreViewport, setViewport]);

  const navigateHistory = useCallback(
    (direction: "back" | "forward") => {
      if (previewMode || useEditorHistoryTransaction.getState().pending) return false;
      const before = getPuck();
      const canNavigate = direction === "back"
        ? before.history.hasPast
        : before.history.hasFuture;
      if (!canNavigate) return false;
      const activeViewport = { ...before.appState.ui.viewports.current };
      const currentHistoryIndex = before.history.index;
      const targetHistoryIndex = direction === "back"
        ? before.history.index - 1
        : before.history.index + 1;
      before.history[direction]();
      const after = getPuck();
      const handledCompositeHistory = onPageHistoryNavigation({
        direction,
        currentHistoryIndex,
        targetHistoryIndex,
        data: after.appState.data as PuckDocument,
      });
      if (!handledCompositeHistory) onCanvasDataSync(after.appState.data);
      after.dispatch({
        type: "setUi",
        ui: {
          viewports: {
            ...after.appState.ui.viewports,
            current: activeViewport,
          },
        },
        recordHistory: false,
      });
      return true;
    },
    [getPuck, onCanvasDataSync, onPageHistoryNavigation, previewMode],
  );

  useWorkspaceHistoryShortcuts({
    disabled: viewingPublished || previewMode,
    onNavigate: navigateHistory,
  });

  const publishCurrentPage = useCallback(() => {
    onPublish(getPuck().appState.data);
  }, [getPuck, onPublish]);

  const togglePreviewMode = useCallback(() => {
    const nextPreviewMode = !previewMode;
    if (nextPreviewMode) {
      // 进入预览会切换画布分支；切换前先把 Puck 的即时内存状态同步给父层，
      // 避免 onChange 尚未提交时由旧受控 data 重新挂载而丢失刚输入的字段。
      const puck = getPuck();
      const itemSelector = puck.appState.ui.itemSelector;
      const selectedBlock = itemSelector
        ? puck.appState.data.content[itemSelector.index]
        : undefined;
      const visualState = useVisualEditorSession.getState();
      previewSelectionRef.current = {
        itemSelector,
        blockId: typeof selectedBlock?.props?.id === "string"
          ? selectedBlock.props.id
          : visualState.selection?.blockId,
        visualSelection: visualState.selection,
        visualMode: visualState.mode,
        panelMode: visualState.panelMode,
      };
      onCanvasDataSync(puck.appState.data);
      dispatch({
        type: "setUi",
        ui: { itemSelector: null },
        recordHistory: false,
      });
    }
    onPreviewModeChange(nextPreviewMode);
  }, [dispatch, getPuck, onCanvasDataSync, onPreviewModeChange, previewMode]);

  useEffect(() => {
    const wasPreviewing = wasPreviewModeRef.current;
    wasPreviewModeRef.current = previewMode;
    if (!wasPreviewing || previewMode) return;
    const snapshot = previewSelectionRef.current;
    previewSelectionRef.current = null;
    if (!snapshot) return;
    window.requestAnimationFrame(() => {
      const puck = getPuck();
      const stableIndex = snapshot.blockId
        ? puck.appState.data.content.findIndex(
            (block) => block.props?.id === snapshot.blockId,
          )
        : -1;
      const itemSelector = stableIndex >= 0
        ? { index: stableIndex, zone: snapshot.itemSelector?.zone ?? "root:default-zone" }
        : snapshot.itemSelector;
      if (itemSelector) {
        dispatch({ type: "setUi", ui: { itemSelector }, recordHistory: false });
      }
      const visualState = useVisualEditorSession.getState();
      visualState.setPanelMode(snapshot.panelMode);
      if (snapshot.visualSelection) visualState.selectNode(snapshot.visualSelection);
      visualState.setMode(snapshot.visualMode);
      if (snapshot.blockId) focusCanvasBlock(snapshot.blockId);
    });
  }, [dispatch, getPuck, previewMode]);

  useEffect(() => {
    if (!previewMode) return undefined;
    const exitPreviewOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onPreviewModeChange(false);
    };
    window.addEventListener("keydown", exitPreviewOnEscape);
    return () => window.removeEventListener("keydown", exitPreviewOnEscape);
  }, [onPreviewModeChange, previewMode]);

  /* ── 装修方案导入/导出(纯编辑器侧,便于跨环境迁移与备份) ── */

  const exportPageDecoration = useCallback(() => {
    const payload = {
      kind: "haichuan-page-decoration",
      version: 1,
      pageKey,
      exportedAt: new Date().toISOString(),
      puckData: appData,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    anchor.href = url;
    anchor.download = `haichuan-${pageKey}-${stamp}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    message.success("方案已导出为 JSON");
  }, [appData, message, pageKey]);

  const importPageDecoration = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const raw = JSON.parse(text);
        const puck = raw?.puckData ?? raw;
        const declaredPageKey = typeof raw?.pageKey === "string" ? raw.pageKey : null;
        if (declaredPageKey && declaredPageKey !== pageKey) {
          message.error(
            `导入失败：该方案属于 ${declaredPageKey} 页面，不能覆盖当前 ${pageKey} 页面`,
          );
          return;
        }
        if (
          !puck ||
          typeof puck !== "object" ||
          !Array.isArray(puck.content) ||
          puck.content.length === 0
        ) {
          message.error("导入失败：文件中未找到有效的页面内容（content）");
          return;
        }
        // 未知模块类型直接拒绝,避免画布出现未注册坏块。
        // 系统区块不在 BLOCK_META，但旧导出 JSON 可能含有；先识别为已知版本，
        // 再由 ensureEditorPageStructure 按当前页面合同移除或重建。
        const knownTypes = new Set([
          ...Object.keys(BLOCK_META),
          "网站全局设置",
          "业务功能区",
        ]);
        const unknownTypes = [
          ...new Set(
            puck.content
              .map((block: { type?: string }) => block?.type)
              .filter(
                (type: string | undefined) =>
                  type && !knownTypes.has(type),
              ),
          ),
        ];
        if (unknownTypes.length > 0) {
          message.error(
            `导入失败：包含未知模块类型（${unknownTypes.join("、")}），可能来自其他版本`,
          );
          return;
        }
        const migrated = migratePuckData(puck);
        const structured = ensureEditorPageStructure(pageKey, migrated);
        const listPageBlocks = (data: unknown) => {
          if (!data || typeof data !== "object" || Array.isArray(data)) return [];
          const document = data as {
            content?: unknown[];
            zones?: Record<string, unknown>;
          };
          return [
            ...(Array.isArray(document.content) ? document.content : []),
            ...Object.values(document.zones ?? {}).flatMap((blocks) =>
              Array.isArray(blocks) ? blocks : [],
            ),
          ].filter((block) => block && typeof block === "object" && !Array.isArray(block));
        };
        const importedBlocks = listPageBlocks(migrated);
        const normalizedBlocks = listPageBlocks(structured);
        const normalizedBrandBlocks = normalizedBlocks.filter(
          (block) => (block as { type?: string }).type !== "业务功能区",
        );
        const removedBlockCount = Math.max(
          0,
          importedBlocks.length - normalizedBlocks.length,
        );
        if (normalizedBrandBlocks.length === 0) {
          message.error("导入失败：当前页面能力过滤后没有可编辑的品牌内容模块");
          return;
        }
        const pageLabel = getEditorPage(pageKey).label;
        modal.confirm({
          title: "导入装修方案？",
          content: (
            <div>
              <p>
                当前画布内容将被导入的方案整体替换；尚未保存的修改会丢失，发布前不影响线上页面。
              </p>
              {removedBlockCount > 0 ? (
                <p>
                  将移除 {removedBlockCount} 个不适用于{pageLabel}的系统或模板区块；固定业务区会按当前页面合同重新建立。
                </p>
              ) : null}
            </div>
          ),
          okText: "导入并替换画布",
          cancelText: "取消",
          onOk: () => {
            dispatch({ type: "setData", data: structured, recordHistory: true });
            onCanvasDataSync(structured);
            message.success(
              removedBlockCount > 0
                ? `方案已导入并移除 ${removedBlockCount} 个不适用区块，请检查后保存草稿`
                : "方案已导入画布，请检查后保存草稿",
            );
          },
        });
      } catch {
        message.error("导入失败：文件不是合法的 JSON");
      }
    },
    [dispatch, message, modal, onCanvasDataSync, pageKey],
  );

  /* ── 套用首屏测试结构：整页替换为唯一保留的可编辑首屏种子。 ── */

  const applyRecommendedStructure = useCallback(() => {
    const recommended = createEditorPageDefault(pageKey);
    modal.confirm({
      title: "套用首屏测试结构？",
      content:
        "当前画布将被统一的首屏测试结构整体替换；尚未保存的修改会丢失，发布前不影响线上页面。",
      okText: "套用并替换画布",
      cancelText: "取消",
      onOk: () => {
        dispatch({
          type: "setData",
          data: recommended as Partial<Data>,
          recordHistory: true,
        });
        onCanvasDataSync(recommended);
        dispatch({ type: "setUi", ui: { itemSelector: null } });
        message.success("首屏测试结构已套用，可继续调整并保存草稿");
      },
    });
  }, [dispatch, message, modal, onCanvasDataSync, pageKey]);

  const draftMenuItems = viewingPublished
    ? hasPendingDraft
      ? [
          {
            key: "edit-draft",
            icon: <EditOutlined />,
            label: "继续编辑草稿",
            onClick: onEditPendingDraft,
          },
        ]
      : []
    : hasPendingDraft
      ? [
          {
            key: "view-published",
            icon: <EyeOutlined />,
            label: "查看线上版本",
            onClick: onViewPublishedVersion,
          },
          ...(canDiscardDraft
            ? [{
                key: "discard-draft",
                icon: <DeleteOutlined />,
                label: "放弃草稿",
                danger: true,
                onClick: onDiscardDraft,
              }]
            : []),
        ]
      : [];

  const compactActionItems = [
    ...(publishValidationStatus === "unavailable"
      ? [{
          key: "retry-publish-validation",
          icon: <ExclamationCircleOutlined />,
          label: "重新检查发布资格",
          danger: true,
          onClick: onRetryPublishValidation,
        }, { type: "divider" as const }]
      : []),
    ...(publishedNeedsRevalidation
      ? [{
          key: "publication-revalidation",
          icon: <SettingOutlined />,
          label: "线上版本需重新校验",
          danger: true,
          onClick: onOpenPageSettings,
        }]
      : []),
    ...(publishedNeedsRevalidation
      ? [{ type: "divider" as const }]
      : []),
    ...draftMenuItems,
    ...(draftMenuItems.length > 0 ? [{ type: "divider" as const }] : []),
    ...(!viewingPublished
      ? [{
          key: "recommended",
          icon: <LayoutOutlined />,
          label: "套用首屏测试结构",
          onClick: applyRecommendedStructure,
        }]
      : []),
    {
      key: "revisions",
      icon: <HistoryOutlined />,
      label: "发布历史",
      onClick: onOpenRevisions,
    },
    {
      key: "settings",
      icon: <SettingOutlined />,
      label: "页面设置",
      onClick: onOpenPageSettings,
    },
    { type: "divider" as const },
    {
      key: "export",
      icon: <DownloadOutlined />,
      label: "导出方案 JSON",
      onClick: exportPageDecoration,
    },
    ...(!viewingPublished
      ? [{
          key: "import",
          icon: <UploadOutlined />,
          label: "导入方案 JSON",
          onClick: () => {
            const input = document.getElementById(
              "homepage-editor-import-file",
            ) as HTMLInputElement | null;
            input?.click();
          },
        }]
      : []),
  ];

  const menuItems = compactActionItems.map((item) => {
    if ("onClick" in item) {
      const { onClick, ...rest } = item;
      return rest;
    }
    return item;
  });

  const handleMenuClick = ({ key }: { key: string }) => {
    for (const item of compactActionItems) {
      if ("key" in item && item.key === key && "onClick" in item) {
        item.onClick();
        return;
      }
    }
  };

  const toolbar = (
    <header className="homepage-editor__toolbar">
      <input
        id="homepage-editor-import-file"
        type="file"
        accept="application/json,.json"
        style={{ display: "none" }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void importPageDecoration(file);
        }}
      />
      <WorkspaceDeviceSwitcher
        ariaLabel="编辑设备：桌面端与移动端布局可分别调整"
        title="切换桌面端或移动端布局；移动端调整不会覆盖桌面端"
        value={currentViewport.width === RESPONSIVE_CANVAS.mobile.width ? "mobile" : "desktop"}
        options={VIEWPORT_PRESETS.map((preset) => ({
          value: preset.width === RESPONSIVE_CANVAS.mobile.width ? "mobile" : "desktop",
          label: preset.label,
          detail: formatViewportSize(preset),
          icon: preset.icon,
          title: `${preset.label}预览（${formatViewportSize(preset)}）`,
          ariaLabel: `${preset.label}布局（${formatViewportSize(preset)}）`,
        }))}
        onChange={(value) => {
          const preset = VIEWPORT_PRESETS.find((candidate) => (
            value === "mobile"
              ? candidate.width === RESPONSIVE_CANVAS.mobile.width
              : candidate.width === RESPONSIVE_CANVAS.desktop.width
          ));
          if (preset) setViewport(preset);
        }}
      />

      <div
        id="homepage-editor-mode-slot"
        className="homepage-editor__mode-slot"
        aria-label="编辑工作模式入口"
      />

      <WorkspaceContextControls
        activeMode="page"
        subjectLabel="当前页面"
        subjectValue={getEditorPage(pageKey).label}
        status={publishReviewActive ? (
          <button
            id="homepage-page-publish-review-entry"
            type="button"
            className="homepage-editor__workspace-status template-editor__toolbar-state"
            data-mode={toolbarPublishReviewMode}
            disabled={publishing}
            onClick={onOpenPublishReview}
            aria-label={publishing
              ? "正在发布页面"
              : publishAttemptFailed
                ? "上次发布失败，查看详情并重试"
                : `查看本次发布检查（${publishReviewErrorCount} 项错误）`}
            title={publishAttemptFailed
              ? "上次发布未完成；草稿仍保留，可查看详情后重新发布"
              : "查看本次发布检查；修复后须再次显式发布"}
          >
            <i aria-hidden="true" />
            <span>{toolbarPublishReviewLabel}</span>
            <small>{hasUnsavedChanges
              ? "有未保存修改"
              : hasPendingDraft
                ? "有未发布更改"
                : "草稿仍在"}</small>
          </button>
        ) : draftStatusMode === "clean" ? undefined : (
          <span
            className="homepage-editor__draft-status template-editor__toolbar-state"
            data-mode={draftStatusMode}
            role="status"
            aria-label={draftStatusAriaLabel}
            title={draftStatusAriaLabel}
          >
            <i aria-hidden="true" />
            <span>{draftStatusLabel}</span>
          </span>
        )}
        canEnterTemplate={canManageTemplates && !viewingPublished}
        templateDisabledReason={!canManageTemplates
          ? "只有超级管理员可以设计模板"
          : viewingPublished
            ? "返回草稿后才能设计模板"
            : undefined}
        onSelectTemplate={() => onEnterTemplateMode({
          width: typeof currentViewport.width === "number"
            ? currentViewport.width
            : RESPONSIVE_CANVAS.desktop.width,
          height: typeof currentViewport.height === "number"
            ? currentViewport.height
            : RESPONSIVE_CANVAS.desktop.height,
        })}
      />

      <WorkspaceToolbarActions
        history={{
          canUndo: !viewingPublished && !previewMode && !historyPending && canUndo,
          canRedo: !viewingPublished && !previewMode && !historyPending && canRedo,
          onUndo: () => { navigateHistory("back"); },
          onRedo: () => { navigateHistory("forward"); },
        }}
        leading={(
          <>
            {USE_MOCK ? (
              <span
                className="homepage-editor__mock-mode-badge"
                data-testid="homepage-editor-mock-mode"
                role="status"
                aria-label="当前为 Mock 模式，数据仅保存在本机，不连接真实接口"
                title="当前为 Mock 模式，数据仅保存在本机，不连接真实接口"
              >
                Mock <span>模式</span>
              </span>
            ) : null}
            <div className="homepage-editor__locale-review-controls" aria-label="内容语言与审核状态">
              <label>
                <span className="sr-only">内容语言</span>
                <select
                  value={locale}
                  disabled={localeSwitchDisabled}
                  onChange={(event) => onLocaleChange(event.target.value as PublicContentLocale)}
                  title={localeSwitchDisabled ? "请先保存当前修改再切换语言" : "切换独立的中文或英文页面草稿"}
                  aria-label="内容语言"
                >
                  <option value="zh-CN">中文</option>
                  <option value="en">English</option>
                </select>
              </label>
              <span role="status" data-testid="page-review-status">
                {reviewStatus === "DRAFT" ? "草稿"
                  : reviewStatus === "IN_REVIEW" ? "待审核"
                    : reviewStatus === "CHANGES_REQUESTED" ? "已退回"
                      : reviewStatus === "APPROVED" ? "已批准"
                        : reviewStatus === "PUBLISHED" ? "已发布"
                          : "已归档"}
              </span>
              {(reviewStatus === "DRAFT" || reviewStatus === "CHANGES_REQUESTED") && !viewingPublished ? (
                <button type="button" onClick={onSubmitReview} disabled={saving || publishing}>
                  提交审核
                </button>
              ) : null}
              {canPublish && reviewStatus === "IN_REVIEW" ? (
                <>
                  <button type="button" onClick={onApproveReview} disabled={saving || publishing}>
                    批准
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const note = window.prompt("请输入退回修改原因");
                      if (note?.trim()) onRequestChanges(note.trim());
                    }}
                    disabled={saving || publishing}
                  >
                    退回修改
                  </button>
                </>
              ) : null}
            </div>
          </>
        )}
        preview={{
          active: previewMode,
          label: previewMode ? "退出预览" : "预览",
          onClick: togglePreviewMode,
          ariaLabel: previewMode ? "退出当前画布预览" : "预览当前画布",
          title:
            previewMode
              ? "退出当前画布预览（Esc）"
              : "预览当前内存中的画布，不会保存或发布",
        }}
        save={viewingPublished ? {
          label: "返回编辑",
          icon: <EditOutlined />,
          onClick: onExitViewing,
          ariaLabel: "返回编辑",
          title: "返回编辑模式",
        } : {
          label: "保存草稿",
          loading: saving,
          onClick: () => onSaveDraft(getPuck().appState.data),
          ariaLabel: saving ? "正在保存当前装修草稿" : "保存当前装修草稿",
          title: saving ? "正在保存当前装修草稿" : "仅保存草稿，不更新客户前台",
        }}
        more={{
          items: menuItems,
          onClick: handleMenuClick,
          ariaLabel: publishedNeedsRevalidation
            ? "更多编辑操作，线上版本需重新校验"
            : "更多编辑操作",
          title: publishedNeedsRevalidation
            ? "页面工具；线上版本需重新校验"
            : "页面设置、发布历史与方案工具",
        }}
        publish={{
          label: "发布",
          loading: publishing,
          disabled: Boolean(publishUnavailableReason),
          onClick: publishCurrentPage,
          ariaLabel: publishActionLabel,
          title: publishUnavailableReason
            ?? "保存当前草稿并发布页面；只有此操作会更新客户前台，无图片模板会自动隐藏",
        }}
      />
    </header>
  );

  return toolbarHost ? createPortal(toolbar, toolbarHost) : toolbar;
}
