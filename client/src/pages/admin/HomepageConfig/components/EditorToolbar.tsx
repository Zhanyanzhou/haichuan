/**
 * EditorToolbar.tsx — 装修编辑器顶部工具栏。
 * 品牌标识 / 页面切换 / 自动保存状态 + 设备切换器 + 版本/设置/保存/发布操作。
 * （自 index.tsx 平移，逻辑零变更）
 */
import { useCallback, useEffect } from "react";
import { Button, Dropdown } from "antd";
import {
  DesktopOutlined,
  HistoryOutlined,
  MobileOutlined,
  MoreOutlined,
  SaveOutlined,
  SendOutlined,
  SettingOutlined,
  TabletOutlined,
} from "@ant-design/icons";
import type { EditorPageKey } from "@/page-builder/config/editorPages";
import { editorPages } from "@/page-builder/config/editorPages";
import { RESPONSIVE_CANVAS } from "@/page-builder/config/blockContracts";
import {
  ROOT_ZONE,
  useHomepagePuck,
  type AutoSaveState,
} from "../editor-store";
import { formatViewportSize, type ViewportPreset } from "../editor-utils";

export const VIEWPORT_PRESETS: ViewportPreset[] = [
  { label: "桌面端", icon: <DesktopOutlined />, ...RESPONSIVE_CANVAS.desktop },
  { label: "平板端", icon: <TabletOutlined />, ...RESPONSIVE_CANVAS.tablet },
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

  const compactActionItems = [
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
      key: "save",
      icon: <SaveOutlined />,
      label: "保存草稿",
      onClick: onSaveDraft,
    },
  ];

  return (
    <header className="homepage-editor__toolbar">
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
        aria-label="预览设备：平板继承电脑布局，仅手机端可覆写素材与焦点"
        title="平板继承电脑布局；仅手机端（≤767px）可覆写素材与焦点"
      >
        {VIEWPORT_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className={
              currentViewport.width === preset.width ||
              (preset.width === 1440 && currentViewport.width === "100%")
                ? "is-active"
                : ""
            }
            onClick={() => setViewport(preset)}
            aria-pressed={
              currentViewport.width === preset.width ||
              (preset.width === 1440 && currentViewport.width === "100%")
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
