/**
 * EditorToolbar.tsx — 装修编辑器顶部工具栏。
 * 品牌标识 / 页面切换 / 自动保存状态 + 设备切换器 + 版本/设置/保存/发布操作。
 * （自 index.tsx 平移，逻辑零变更）
 */
import { useCallback, useEffect } from "react";
import { Button, Dropdown, Modal, message } from "antd";
import {
  DesktopOutlined,
  DownloadOutlined,
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
import {
  createEditorPageDefault,
  editorPages,
} from "@/page-builder/config/editorPages";
import { RESPONSIVE_CANVAS } from "@/page-builder/config/blockContracts";
import { BLOCK_META } from "@/page-builder/config/blockMeta";
import { migratePuckData } from "@/page-builder/utils/migratePuckData";
import {
  ROOT_ZONE,
  useHomepagePuck,
  type AutoSaveState,
} from "../editor-store";
import { formatViewportSize, type ViewportPreset } from "../editor-utils";

export const VIEWPORT_PRESETS: ViewportPreset[] = [
  // 平板档已移除（2026-08-16 用户决策）：平板继承桌面布局无独立编辑价值，
  // 仅移动端有独立素材/焦点/比例，保留两档。
  { label: "桌面端", icon: <DesktopOutlined />, ...RESPONSIVE_CANVAS.desktop },
  { label: "移动端", icon: <MobileOutlined />, ...RESPONSIVE_CANVAS.mobile },
];

export default function EditorToolbar({
  pageKey,
  lastSaved,
  publishing,
  saving,
  hasUnsavedChanges,
  hasPublished,
  hasPendingDraft,
  autoSaveState,
  onPublish,
  onSaveDraft,
  onOpenRevisions,
  onOpenPageSettings,
  onDataChange,
  onPageChange,
}: {
  pageKey: EditorPageKey;
  lastSaved: string | null;
  publishing: boolean;
  saving: boolean;
  hasUnsavedChanges: boolean;
  hasPublished: boolean;
  hasPendingDraft: boolean;
  autoSaveState: AutoSaveState;
  onPublish: (data: unknown, locateBlock: (blockIndex: number) => void) => void;
  onSaveDraft: () => void;
  onOpenRevisions: () => void;
  onOpenPageSettings: () => void;
  onDataChange: (data: unknown) => void;
  onPageChange: (pageKey: EditorPageKey) => void;
}) {
  const appData = useHomepagePuck((state) => state.appState.data);
  const viewports = useHomepagePuck((state) => state.appState.ui.viewports);
  const dispatch = useHomepagePuck((state) => state.dispatch);
  const currentViewport = viewports.current;
  const saveStatusText =
    autoSaveState === "error"
      ? "保存失败，请点保存重试"
      : hasPendingDraft
        ? "有未发布修改"
        : hasUnsavedChanges
          ? "有未保存修改"
          : hasPublished
            ? "已发布"
            : "尚未发布";

  useEffect(() => {
    onDataChange(appData);
  }, [appData, onDataChange]);

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
        // 未知模块类型直接拒绝,避免画布出现未注册坏块
        const knownTypes = new Set(Object.keys(BLOCK_META));
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

  const compactActionItems = [
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
    {
      key: "save",
      icon: <SaveOutlined />,
      label: "保存草稿",
      onClick: onSaveDraft,
    },
  ];

  return (
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
      <div className="homepage-editor__toolbar-context">
        <strong>海川珠宝</strong>
        <span className="homepage-editor__toolbar-divider" />
        <label className="homepage-editor__page-picker">
          <span>当前编辑</span>
          <select
            value={pageKey}
            onChange={(event) =>
              onPageChange(event.target.value as EditorPageKey)
            }
          >
            {editorPages.map((page) => (
              <option key={page.key} value={page.key}>
                {page.label}
              </option>
            ))}
          </select>
        </label>
        <span className={`homepage-editor__save-status is-${autoSaveState}`}>
          <i />
          {saveStatusText}
        </span>
      </div>

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

      <div className="homepage-editor__toolbar-actions">
        <div className="homepage-editor__toolbar-secondary-actions">
          <Button
            size="small"
            icon={<HistoryOutlined />}
            onClick={onOpenRevisions}
            title="查看历史发布版本并回滚到草稿"
          >
            发布历史
          </Button>
          <Button
            size="small"
            icon={<SettingOutlined />}
            onClick={onOpenPageSettings}
            title="页面 SEO 标题与描述（影响搜索与社交分享）"
          >
            SEO 设置
          </Button>
          <Button
            size="small"
            icon={<SaveOutlined />}
            loading={saving}
            onClick={onSaveDraft}
            title="立即保存当前装修草稿"
          >
            保存草稿
          </Button>
        </div>
        <Dropdown
          trigger={["click"]}
          placement="bottomRight"
          menu={{
            items: compactActionItems.map(({ onClick, ...item }) => item),
            onClick: ({ key }) =>
              compactActionItems.find((item) => item.key === key)?.onClick?.(),
          }}
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
          loading={publishing}
          onClick={publishCurrentPage}
          title="发布到前台网站"
        >
          发布
        </Button>
      </div>
    </header>
  );
}
