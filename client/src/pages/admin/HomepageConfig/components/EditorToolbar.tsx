/**
 * EditorToolbar.tsx — 装修编辑器顶部工具栏。
 * 设备切换器 + 保存/发布主操作；版本与页面设置收纳到更多菜单。
 * （自 index.tsx 平移，逻辑零变更）
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button, Dropdown, Modal, message } from "antd";
import {
  DeleteOutlined,
  DesktopOutlined,
  DownloadOutlined,
  EditOutlined,
  EyeOutlined,
  HistoryOutlined,
  LayoutOutlined,
  MobileOutlined,
  MoreOutlined,
  SaveOutlined,
  SendOutlined,
  SettingOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import type { EditorPageKey } from "@/page-builder/config/editorPages";
import { createEditorPageDefault } from "@/page-builder/config/editorPages";
import { RESPONSIVE_CANVAS } from "@/page-builder/config/blockContracts";
import { BLOCK_META } from "@/page-builder/config/blockMeta";
import { migratePuckData } from "@/page-builder/utils/migratePuckData";
import { ROOT_ZONE, useHomepagePuck } from "../editor-store";
import { formatViewportSize, type ViewportPreset } from "../editor-utils";

export const VIEWPORT_PRESETS: ViewportPreset[] = [
  // 平板档已移除（2026-08-16 用户决策）：平板继承桌面布局无独立编辑价值，
  // 仅移动端有独立素材/焦点/比例，保留两档。
  { label: "桌面端", icon: <DesktopOutlined />, ...RESPONSIVE_CANVAS.desktop },
  { label: "移动端", icon: <MobileOutlined />, ...RESPONSIVE_CANVAS.mobile },
];

/** 草稿状态机的展示态:查看线上(不渲染) > 未保存 > 未发布差异 > 与线上一致 */
type DraftStatusMode = "published" | "dirty" | "pending" | "clean";

function getDraftStatusMode(options: {
  viewingPublished: boolean;
  hasUnsavedChanges: boolean;
  hasPendingDraft: boolean;
}): DraftStatusMode {
  // 未保存修改优先于“查看线上版本”，避免线上查看态下改动画布却看不到脏提示。
  if (options.hasUnsavedChanges) return "dirty";
  if (options.viewingPublished) return "published";
  if (options.hasPendingDraft) return "pending";
  return "clean";
}

/** 草稿状态徽标(常显部分;查看线上态不渲染——2026-08-19 用户决策删
 * "正在查看线上版本"字样,此时工具栏已有「返回编辑」按钮与禁用的发布钮,状态不迷失) */
function DraftStatusBadge({
  mode,
  draftSavedAtLabel,
}: {
  mode: DraftStatusMode;
  draftSavedAtLabel: string | null;
}) {
  if (mode === "published") return null;
  let content: ReactNode;
  if (mode === "dirty") {
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
        {draftSavedAtLabel ? <small>已保存 {draftSavedAtLabel}</small> : null}
      </>
    );
  } else {
    content = <>与线上版本一致</>;
  }
  return (
    <div
      className="homepage-editor__draft-status"
      data-mode={mode}
      role="status"
      aria-label="草稿状态"
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
  onDataChange,
}: {
  pageKey: EditorPageKey;
  publishing: boolean;
  saving: boolean;
  hasPendingDraft: boolean;
  viewingPublished: boolean;
  /** 画布存在未保存修改 */
  hasUnsavedChanges: boolean;
  /** 最新服务端发布门禁状态；非 current 时不得把页面表现为可发布。 */
  publishValidationState: "checking" | "current" | "stale" | "error";
  /** 最新服务端门禁中的阻断级问题数量。 */
  publishErrorCount: number;
  /** 草稿最后保存时间标签(如 "14:32") */
  draftSavedAtLabel: string | null;
  onPublish: (data: unknown, locateBlock: (blockIndex: number) => void) => void;
  onSaveDraft: (data: unknown) => void;
  onExitViewing: () => void;
  onEditPendingDraft: () => void;
  onViewPublishedVersion: () => void;
  onDiscardDraft: () => void;
  onOpenRevisions: () => void;
  onOpenPageSettings: () => void;
  onDataChange: (data: unknown) => void;
}) {
  const [toolbarHost, setToolbarHost] = useState<HTMLElement | null>(null);
  const appData = useHomepagePuck((state) => state.appState.data);
  const viewports = useHomepagePuck((state) => state.appState.ui.viewports);
  const dispatch = useHomepagePuck((state) => state.dispatch);
  const currentViewport = viewports.current;
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

  const publishCurrentPage = useCallback(() => {
    onPublish(appData, (blockIndex) => {
      dispatch({
        type: "setUi",
        ui: { itemSelector: { index: blockIndex, zone: ROOT_ZONE } },
      });
    });
  }, [appData, dispatch, onPublish]);

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
  }, [appData, pageKey]);

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
        Modal.confirm({
          title: "导入装修方案？",
          content:
            "当前画布内容将被导入的方案整体替换；尚未保存的修改会丢失，发布前不影响线上页面。",
          okText: "导入并替换画布",
          cancelText: "取消",
          onOk: () => {
            dispatch({ type: "setData", data: migrated });
            message.success("方案已导入画布，请检查后保存草稿");
          },
        });
      } catch {
        message.error("导入失败：文件不是合法的 JSON");
      }
    },
    [dispatch],
  );

  /* ── 套用推荐结构:整页替换为该页面的预置结构(模块全部可编辑,不锁定) ── */

  const applyRecommendedStructure = useCallback(() => {
    const recommended = createEditorPageDefault(pageKey);
    Modal.confirm({
      title: "套用推荐结构？",
      content:
        "当前画布将被该页面的推荐结构整体替换；尚未保存的修改会丢失，发布前不影响线上页面。",
      okText: "套用并替换画布",
      cancelText: "取消",
      onOk: () => {
        dispatch({ type: "setData", data: recommended });
        dispatch({ type: "setUi", ui: { itemSelector: null } });
        message.success("推荐结构已套用，模块可自由调整，请检查后保存草稿");
      },
    });
  }, [dispatch, pageKey]);

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
        aria-label="预览设备：仅手机端可覆写素材与焦点"
        title="仅手机端（≤767px）可覆写素材与焦点"
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
          >
            {preset.icon}
            <span>
              {preset.label}
              <small>{formatViewportSize(preset)}</small>
            </span>
          </button>
        ))}
      </div>

      {/* 草稿状态徽标:未保存/未发布差异/与线上一致 常显;查看线上态不渲染(2026-08-19 用户决策) */}
      <DraftStatusBadge
        mode={getDraftStatusMode({
          viewingPublished,
          hasUnsavedChanges,
          hasPendingDraft,
        })}
        draftSavedAtLabel={draftSavedAtLabel}
      />

      <div className="homepage-editor__toolbar-actions">
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
              title="立即保存当前装修草稿"
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
          aria-label={publishUnavailableReason
            ? `发布到前台网站（${publishUnavailableReason}）`
            : "发布到前台网站"}
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
