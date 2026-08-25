/**
 * EditorToolbar.tsx — 装修编辑器顶部工具栏。
 * 设备切换器 + 保存/发布主操作；版本与页面设置收纳到更多菜单。
 * （自 index.tsx 平移，逻辑零变更）
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useGetPuck } from "@puckeditor/core";
import { App as AntdApp, Button, Dropdown } from "antd";
import {
  CopyOutlined,
  DeleteOutlined,
  DesktopOutlined,
  DownloadOutlined,
  EditOutlined,
  EyeOutlined,
  HistoryOutlined,
  LayoutOutlined,
  MobileOutlined,
  MoreOutlined,
  RedoOutlined,
  SaveOutlined,
  SendOutlined,
  SettingOutlined,
  UndoOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import type { EditorPageKey } from "@/page-builder/config/editorPages";
import { createEditorPageDefault } from "@/page-builder/config/editorPages";
import { RESPONSIVE_CANVAS } from "@/page-builder/config/blockContracts";
import { BLOCK_META } from "@/page-builder/config/blockMeta";
import { migratePuckData } from "@/page-builder/utils/migratePuckData";
import { USE_MOCK } from "@/services/mockData";
import {
  ROOT_ZONE,
  useEditorHistoryTransaction,
  useHomepagePuck,
} from "../editor-store";
import {
  formatViewportSize,
  getModuleDisplayName,
  type ViewportPreset,
} from "../editor-utils";

export const VIEWPORT_PRESETS: ViewportPreset[] = [
  // 平板档已移除（2026-08-16 用户决策）：平板继承桌面布局无独立编辑价值，
  // 仅移动端有独立素材/焦点/比例，保留两档。
  { label: "桌面端", icon: <DesktopOutlined />, ...RESPONSIVE_CANVAS.desktop },
  { label: "移动端", icon: <MobileOutlined />, ...RESPONSIVE_CANVAS.mobile },
];

type DraftStatusMode = "saving" | "dirty" | "pending" | "clean" | "published";

function getDraftStatusMode(options: {
  saving: boolean;
  viewingPublished: boolean;
  hasUnsavedChanges: boolean;
  hasPendingDraft: boolean;
}): DraftStatusMode {
  if (options.saving) return "saving";
  if (options.hasUnsavedChanges) return "dirty";
  if (options.viewingPublished) return "published";
  if (options.hasPendingDraft) return "pending";
  return "clean";
}

function DraftStatusBadge({
  mode,
  draftSavedAtLabel,
}: {
  mode: DraftStatusMode;
  draftSavedAtLabel: string | null;
}) {
  if (mode === "published") return null;

  let content: ReactNode;
  if (mode === "saving") {
    content = <>正在保存草稿</>;
  } else if (mode === "dirty") {
    content = (
      <>
        <i className="homepage-editor__draft-status-dot" aria-hidden="true" />
        有未保存修改
      </>
    );
  } else if (mode === "pending") {
    content = (
      <>
        草稿有未发布修改
        {draftSavedAtLabel ? <small>最后保存 {draftSavedAtLabel}</small> : null}
      </>
    );
  } else {
    content = (
      <>
        与线上版本一致
        {draftSavedAtLabel ? <small>最后保存 {draftSavedAtLabel}</small> : null}
      </>
    );
  }

  const accessibleLabel =
    mode === "saving"
      ? "草稿状态：正在保存草稿"
      : mode === "dirty"
        ? "草稿状态：有未保存修改"
        : mode === "pending"
          ? `草稿状态：草稿有未发布修改${draftSavedAtLabel ? `，最后保存 ${draftSavedAtLabel}` : ""}`
          : `草稿状态：与线上版本一致${draftSavedAtLabel ? `，最后保存 ${draftSavedAtLabel}` : ""}`;

  return (
    <div
      className="homepage-editor__draft-status"
      data-mode={mode}
      role="status"
      aria-label={accessibleLabel}
      title={accessibleLabel}
    >
      {content}
    </div>
  );
}

export default function EditorToolbar({
  pageKey,
  publishing,
  saving,
  hasPendingDraft,
  viewingPublished,
  previewMode,
  hasUnsavedChanges,
  publishValidationState,
  publishErrorCount,
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
}: {
  pageKey: EditorPageKey;
  publishing: boolean;
  saving: boolean;
  hasPendingDraft: boolean;
  viewingPublished: boolean;
  previewMode: boolean;
  hasUnsavedChanges: boolean;
  publishValidationState: "checking" | "current" | "stale" | "error";
  publishErrorCount: number;
  draftSavedAtLabel: string | null;
  onPublish: (data: unknown, locateBlock: (blockIndex: number) => void) => void;
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
}) {
  const { message, modal } = AntdApp.useApp();
  const [toolbarHost, setToolbarHost] = useState<HTMLElement | null>(null);
  const getPuck = useGetPuck();
  const appData = useHomepagePuck((state) => state.appState.data);
  const viewports = useHomepagePuck((state) => state.appState.ui.viewports);
  const dispatch = useHomepagePuck((state) => state.dispatch);
  const selectedItem = useHomepagePuck((state) => state.selectedItem);
  const history = useHomepagePuck((state) => state.history);
  const historyTransactionPending = useEditorHistoryTransaction(
    (state) => state.pending,
  );
  const currentViewport = viewports.current;
  const content = appData.content as Array<{
    type: string;
    props: Record<string, any>;
  }>;
  const selectedIndex = content.findIndex(
    (item) => item.props?.id === selectedItem?.props?.id,
  );
  const selectedModule = selectedIndex >= 0 ? content[selectedIndex] : null;
  const selectedLocked = Boolean(selectedModule?.props?.locked);
  const selectedLabel = selectedModule
    ? getModuleDisplayName(selectedModule.type, selectedModule.props)
    : null;
  const publishUnavailableReason = viewingPublished
    ? "正在查看线上版本，无需重复发布"
    : publishValidationState === "checking"
      ? "正在核对发布资格"
      : publishValidationState === "stale"
        ? "内容已变化，等待重新核对发布资格"
        : publishValidationState === "error"
          ? "发布资格暂时无法核对，请稍后重试"
          : publishErrorCount > 0
            ? `还有 ${publishErrorCount} 项发布问题需要处理`
            : null;

  useEffect(() => {
    onDataChange(appData);
  }, [appData, onDataChange]);

  useEffect(() => {
    setToolbarHost(document.getElementById("admin-editor-toolbar-slot"));
  }, []);

  const setViewport = useCallback(
    (preset: ViewportPreset) => {
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

  const navigateHistory = useCallback(
    (direction: "back" | "forward") => {
      if (previewMode || useEditorHistoryTransaction.getState().pending) {
        return;
      }

      const before = getPuck();
      const canNavigate =
        direction === "back"
          ? before.history.hasPast
          : before.history.hasFuture;
      if (!canNavigate) return;

      // Puck 历史快照包含 ui.viewports.current；内容撤销不应切换用户
      // 正在编辑的设备。历史导航后只恢复 current，且不再写入历史。
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
    },
    [getPuck, onCanvasDataSync, previewMode],
  );

  const publishCurrentPage = useCallback(() => {
    onPublish(appData, (blockIndex) => {
      dispatch({
        type: "setUi",
        ui: { itemSelector: { index: blockIndex, zone: ROOT_ZONE } },
      });
    });
  }, [appData, dispatch, onPublish]);

  const duplicateSelected = useCallback(() => {
    if (!selectedModule || selectedLocked || previewMode) return;
    dispatch({
      type: "duplicate",
      sourceIndex: selectedIndex,
      sourceZone: ROOT_ZONE,
    });
    message.success(`已复制“${selectedLabel}”模块`);
  }, [
    dispatch,
    message,
    previewMode,
    selectedIndex,
    selectedLabel,
    selectedLocked,
    selectedModule,
  ]);

  const deleteSelected = useCallback(() => {
    if (!selectedModule || selectedLocked || previewMode) return;
    modal.confirm({
      title: `删除“${selectedLabel}”？`,
      content: "删除后可使用“撤销”恢复；发布前不会影响线上页面。",
      okText: "删除模块",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: () => {
        dispatch({
          type: "remove",
          index: selectedIndex,
          zone: ROOT_ZONE,
        });
        message.success(`已删除“${selectedLabel}”模块`);
      },
    });
  }, [
    dispatch,
    message,
    modal,
    previewMode,
    selectedIndex,
    selectedLabel,
    selectedLocked,
    selectedModule,
  ]);

  const togglePreviewMode = useCallback(() => {
    const nextPreviewMode = !previewMode;
    if (nextPreviewMode) {
      dispatch({
        type: "setUi",
        ui: { itemSelector: null },
        recordHistory: false,
      });
    }
    onPreviewModeChange(nextPreviewMode);
  }, [dispatch, onPreviewModeChange, previewMode]);

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
        // 系统区块(业务功能区由动态页 ensureEditorPageStructure 固定附加,
        // 网站全局设置随画布结构)不在 BLOCK_META,但导出 JSON 含它们,须一并放行
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
        modal.confirm({
          title: "导入装修方案？",
          content:
            "当前画布内容将被导入的方案整体替换；尚未保存的修改会丢失，发布前不影响线上页面。",
          okText: "导入并替换画布",
          cancelText: "取消",
          onOk: () => {
            dispatch({ type: "setData", data: migrated, recordHistory: true });
            onCanvasDataSync(migrated);
            message.success("方案已导入画布，请检查后保存草稿");
          },
        });
      } catch {
        message.error("导入失败：文件不是合法的 JSON");
      }
    },
    [dispatch, message, modal, onCanvasDataSync],
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
    ...draftMenuItems,
    ...(draftMenuItems.length > 0 ? [{ type: "divider" as const }] : []),
    {
      key: "recommended",
      icon: <LayoutOutlined />,
      label: "套用推荐结构",
      onClick: applyRecommendedStructure,
    },
    {
      key: "revisions",
      icon: <HistoryOutlined />,
      label: "发布历史",
      onClick: onOpenRevisions,
    },
    {
      key: "settings",
      icon: <SettingOutlined />,
      label: "SEO 设置",
      onClick: onOpenPageSettings,
    },
    { type: "divider" as const },
    {
      key: "export",
      icon: <DownloadOutlined />,
      label: "导出方案 JSON",
      onClick: exportPageDecoration,
    },
    {
      key: "import",
      icon: <UploadOutlined />,
      label: "导入方案 JSON",
      onClick: () => {
        const input = document.getElementById(
          "homepage-editor-import-file",
        ) as HTMLInputElement | null;
        input?.click();
      },
    },
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
      <div
        className="homepage-editor__viewport-switcher"
        aria-label="编辑设备：桌面端与移动端布局可分别调整"
        title="切换桌面端或移动端布局；移动端调整不会覆盖桌面端"
      >
        {VIEWPORT_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className={
              currentViewport.width === preset.width ||
              (preset.width === RESPONSIVE_CANVAS.desktop.width &&
                currentViewport.width === "100%")
                ? "is-active"
                : ""
            }
            onClick={() => setViewport(preset)}
            aria-pressed={
              currentViewport.width === preset.width ||
              (preset.width === RESPONSIVE_CANVAS.desktop.width &&
                currentViewport.width === "100%")
            }
            title={`${preset.label}预览（${formatViewportSize(preset)}）`}
            aria-label={`${preset.label}布局（${formatViewportSize(preset)}）`}
          >
            {preset.icon}
            <span>
              {preset.label}
              <small>{formatViewportSize(preset)}</small>
            </span>
          </button>
        ))}
      </div>

      <div className="homepage-editor__toolbar-left-context">
        <DraftStatusBadge
          mode={getDraftStatusMode({
            saving,
            viewingPublished,
            hasUnsavedChanges,
            hasPendingDraft,
          })}
          draftSavedAtLabel={draftSavedAtLabel}
        />

        <div className="homepage-editor__edit-context">
          <span
            className="homepage-editor__selected-module"
            data-selected={selectedModule ? "true" : "false"}
            role="status"
            aria-label={
              selectedLabel
                ? `当前选中模块：${selectedLabel}`
                : "当前未选中模块"
            }
            title={
              selectedLabel
                ? `当前选中：${selectedLabel}`
                : "请在画布或图层面板选择模块"
            }
          >
            {selectedLabel ? `已选：${selectedLabel}` : "未选模块"}
          </span>
          <div
            className="homepage-editor__history-actions"
            role="toolbar"
            aria-label="画布编辑操作"
          >
            <Button
              type="text"
              size="small"
              icon={<UndoOutlined />}
              disabled={!history.hasPast || previewMode || historyTransactionPending}
              onClick={() => navigateHistory("back")}
              aria-label="撤销"
              title="撤销"
            />
            <Button
              type="text"
              size="small"
              icon={<RedoOutlined />}
              disabled={!history.hasFuture || previewMode || historyTransactionPending}
              onClick={() => navigateHistory("forward")}
              aria-label="重做"
              title="重做"
            />
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              disabled={!selectedModule || selectedLocked || previewMode}
              onClick={duplicateSelected}
              aria-label="复制当前模块"
              title={selectedLocked ? "固定模块不能复制" : "复制当前模块"}
            />
            <Button
              type="text"
              danger
              size="small"
              icon={<DeleteOutlined />}
              disabled={!selectedModule || selectedLocked || previewMode}
              onClick={deleteSelected}
              aria-label="删除当前模块"
              title={selectedLocked ? "固定模块不能删除" : "删除当前模块"}
            />
          </div>
        </div>
      </div>

      <div className="homepage-editor__toolbar-actions">
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
        <Button
          className="homepage-editor__toolbar-preview"
          size="small"
          type={previewMode ? "primary" : "default"}
          icon={<EyeOutlined />}
          onClick={togglePreviewMode}
          aria-pressed={previewMode}
          aria-label={previewMode ? "退出当前画布预览" : "预览当前画布"}
          title={
            previewMode
              ? "退出当前画布预览（Esc）"
              : "预览当前内存中的画布，不会保存或发布"
          }
        >
          {previewMode ? "退出预览" : "预览"}
        </Button>
        <div className="homepage-editor__toolbar-secondary-actions">
          {viewingPublished ? (
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={onExitViewing}
              title="返回编辑模式"
            >
              返回编辑
            </Button>
          ) : (
            <Button
              size="small"
              icon={<SaveOutlined />}
              loading={saving}
              onClick={() => onSaveDraft(appData)}
              aria-label={saving ? "正在保存当前装修草稿" : "保存当前装修草稿"}
              title={saving ? "正在保存当前装修草稿" : "保存当前装修草稿"}
            >
              保存草稿
            </Button>
          )}
        </div>
        <Dropdown
          trigger={["click"]}
          placement="bottomRight"
          menu={{ items: menuItems, onClick: handleMenuClick }}
        >
          <Button
            className="homepage-editor__toolbar-more"
            size="small"
            icon={<MoreOutlined />}
            aria-label="更多编辑操作"
          >
            更多
          </Button>
        </Dropdown>
        <Button
          className="homepage-editor__toolbar-publish"
          size="small"
          type="primary"
          icon={<SendOutlined />}
          aria-label={
            publishUnavailableReason
              ? `发布到前台网站（${publishUnavailableReason}）`
              : "发布到前台网站"
          }
          loading={publishing}
          disabled={Boolean(publishUnavailableReason)}
          onClick={publishCurrentPage}
          title={publishUnavailableReason ?? "发布到前台网站"}
        >
          发布
        </Button>
      </div>
    </header>
  );

  return toolbarHost ? createPortal(toolbar, toolbarHost) : toolbar;
}
