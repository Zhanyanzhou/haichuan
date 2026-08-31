/**
 * EditorToolbar.tsx — 装修编辑器顶部工具栏。
 * 设备切换器 + 保存/发布主操作；版本与页面设置收纳到更多菜单。
 * （自 index.tsx 平移，逻辑零变更）
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useGetPuck } from "@puckeditor/core";
import { App as AntdApp } from "antd";
import {
  DeleteOutlined,
  DesktopOutlined,
  DownloadOutlined,
  EditOutlined,
  EyeOutlined,
  HistoryOutlined,
  LayoutOutlined,
  MobileOutlined,
  SettingOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import type { EditorPageKey } from "@/page-builder/config/editorPages";
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
  useEditorHistoryTransaction,
  useHomepagePuck,
} from "../editor-store";
import { formatViewportSize, type ViewportPreset } from "../editor-utils";
import WorkspaceContextControls from "@/page-builder/template-editor/WorkspaceContextControls";
import useWorkspaceHistoryShortcuts from "@/page-builder/template-editor/useWorkspaceHistoryShortcuts";
import {
  WorkspaceDeviceSwitcher,
  WorkspaceStatusBadge,
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
  publishing,
  saving,
  hasPendingDraft,
  publishedNeedsRevalidation,
  viewingPublished,
  previewMode,
  hasUnsavedChanges,
  canPublish,
  canManageTemplates,
  draftSavedAtLabel,
  onPublish,
  onSaveDraft,
  onExitViewing,
  onEditPendingDraft,
  onViewPublishedVersion,
  onDiscardDraft,
  onOpenRevisions,
  onOpenPageSettings,
  onPreviewModeChange,
  onDataChange,
  onCanvasDataSync,
  onEnterTemplateMode,
  restoreViewport,
}: {
  pageKey: EditorPageKey;
  publishing: boolean;
  saving: boolean;
  hasPendingDraft: boolean;
  publishedNeedsRevalidation: boolean;
  viewingPublished: boolean;
  previewMode: boolean;
  hasUnsavedChanges: boolean;
  canPublish: boolean;
  canManageTemplates: boolean;
  draftSavedAtLabel: string | null;
  onPublish: (data: unknown) => void;
  onSaveDraft: (data: unknown) => void;
  onExitViewing: () => void;
  onEditPendingDraft: () => void;
  onViewPublishedVersion: () => void;
  onDiscardDraft: () => void;
  onOpenRevisions: () => void;
  onOpenPageSettings: () => void;
  onPreviewModeChange: (previewing: boolean) => void;
  onDataChange: (data: unknown) => void;
  /** 整页替换或历史导航后同步父层 data prop，不推进已保存草稿基线。 */
  onCanvasDataSync: (data: unknown) => void;
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
  const currentViewport = viewports.current;
  const publishUnavailableReason = !canPublish
    ? "当前账号只能编辑草稿，需由管理员发布"
    : viewingPublished
      ? "正在查看线上版本，无需重复发布"
      : null;
  const publishActionLabel = publishUnavailableReason
    ? `发布到前台网站（${publishUnavailableReason}）`
    : "发布到前台网站";
  const draftStatusMode = saving
    ? "saving"
    : hasUnsavedChanges
      ? "dirty"
      : viewingPublished
        ? "readonly"
        : hasPendingDraft
          ? "pending"
          : "clean";
  const draftStatusLabel = draftStatusMode === "saving"
    ? "正在保存草稿"
    : draftStatusMode === "dirty"
      ? "有未保存修改"
      : draftStatusMode === "pending"
        ? "草稿有未发布修改"
        : draftStatusMode === "readonly"
          ? "线上版本只读"
          : "与线上版本一致";
  const draftStatusDetail = draftStatusMode === "pending" || draftStatusMode === "clean"
    ? draftSavedAtLabel ? `最后保存 ${draftSavedAtLabel}` : null
    : null;
  const draftStatusAriaLabel = `草稿状态：${draftStatusLabel}${draftStatusDetail ? `，${draftStatusDetail}` : ""}`;

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
      before.history[direction]();
      const after = getPuck();
      onCanvasDataSync(after.appState.data);
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
    [getPuck, onCanvasDataSync, previewMode],
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
      onCanvasDataSync(getPuck().appState.data);
      dispatch({
        type: "setUi",
        ui: { itemSelector: null },
        recordHistory: false,
      });
    }
    onPreviewModeChange(nextPreviewMode);
  }, [dispatch, getPuck, onCanvasDataSync, onPreviewModeChange, previewMode]);

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

  /* ── 套用推荐结构:整页替换为该页面的预置结构(模块全部可编辑,不锁定) ── */

  const applyRecommendedStructure = useCallback(() => {
    const recommended = createEditorPageDefault(pageKey);
    modal.confirm({
      title: "套用推荐结构？",
      content:
        "当前画布将被该页面的推荐结构整体替换；尚未保存的修改会丢失，发布前不影响线上页面。",
      okText: "套用并替换画布",
      cancelText: "取消",
      onOk: () => {
        dispatch({
          type: "setData",
          data: recommended,
          recordHistory: true,
        });
        onCanvasDataSync(recommended);
        dispatch({ type: "setUi", ui: { itemSelector: null } });
        message.success("推荐结构已套用，模块可自由调整，请检查后保存草稿");
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
          {
            key: "discard-draft",
            icon: <DeleteOutlined />,
            label: "放弃草稿",
            danger: true,
            onClick: onDiscardDraft,
          },
        ]
      : [];

  const compactActionItems = [
    ...(publishedNeedsRevalidation
      ? [{
          key: "publication-revalidation",
          icon: <SettingOutlined />,
          label: "线上版本需重新审核",
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
          label: "套用推荐结构",
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
      label: "发布设置",
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
            {!viewingPublished ? (
              <WorkspaceStatusBadge
                mode={draftStatusMode}
                label={draftStatusLabel}
                detail={draftStatusDetail}
                ariaLabel={draftStatusAriaLabel}
                className="homepage-editor__draft-status"
              />
            ) : null}
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
          title: saving ? "正在保存当前装修草稿" : "保存当前装修草稿",
        }}
        more={{
          items: menuItems,
          onClick: handleMenuClick,
          danger: publishedNeedsRevalidation,
          ariaLabel:
            publishedNeedsRevalidation
              ? "更多编辑操作，线上版本需重新审核"
              : "更多编辑操作",
          title:
            publishedNeedsRevalidation
              ? "线上版本需重新审核；打开菜单处理发布设置"
              : "更多编辑操作",
        }}
        publish={{
          label: "发布",
          loading: publishing,
          disabled: Boolean(publishUnavailableReason),
          onClick: publishCurrentPage,
          ariaLabel: publishActionLabel,
          title: publishUnavailableReason ?? publishActionLabel,
        }}
      />
    </header>
  );

  return toolbarHost ? createPortal(toolbar, toolbarHost) : toolbar;
}
