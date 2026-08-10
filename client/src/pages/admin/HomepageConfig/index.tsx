import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
  type ReactNode,
} from "react";
import { Button, Drawer, Input, Modal, Spin, message } from "antd";
import {
  AppstoreOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseOutlined,
  DeleteOutlined,
  DesktopOutlined,
  DragOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  ExclamationCircleOutlined,
  HeartFilled,
  HeartOutlined,
  HistoryOutlined,
  LayoutOutlined,
  MobileOutlined,
  RollbackOutlined,
  SaveOutlined,
  SearchOutlined,
  SendOutlined,
  TabletOutlined,
  UndoOutlined,
  RedoOutlined,
} from "@ant-design/icons";
import { Puck, createUsePuck, type UiState } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import { puckConfig } from "@/page-builder/config/puckConfig";
import {
  BLOCK_META,
  BLOCK_FILTERS,
  BLOCK_PREVIEW_KIND,
  TEMPLATE_MEDIA_HINT,
  type BlockMeta,
} from "@/page-builder/config/blockMeta";
import {
  jewelryHomeTemplate,
  pageTemplates,
  type TemplateDefinition,
} from "@/page-builder/templates/templates";
import { pageDocumentApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import MediaRequirementPanel from "@/page-builder/fields/MediaRequirementPanel";
import { blockTemplateStore, type BlockTemplate } from "@/page-builder/templates/blockTemplateStore";

const useHomepagePuck = createUsePuck<typeof puckConfig>();

type ViewportPreset = {
  label: string;
  icon: ReactNode;
  width: number | "100%";
  height: number | "auto";
};

function formatViewportSize(preset: ViewportPreset) {
  return `${preset.width} × ${preset.height}`;
}

type AutoSaveState = "idle" | "saving" | "saved" | "error";

type PageDocumentRevision = {
  id: number;
  version: number;
  puckData: unknown;
  status?: string;
  publishedAt?: string | null;
  publishedBy?: number | null;
  createdAt?: string;
};

const AUTO_SAVE_DELAY = 3500;

function formatEditorTime(value?: string | Date | null) {
  if (!value) return "";
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const VIEWPORT_PRESETS: ViewportPreset[] = [
  { label: "桌面端", icon: <DesktopOutlined />, width: 1440, height: 900 },
  { label: "平板端", icon: <TabletOutlined />, width: 768, height: 1024 },
  { label: "移动端", icon: <MobileOutlined />, width: 390, height: 844 },
];

const ROOT_ZONE = "root:default-zone";

let blockIdSequence = 0;

function createBlockContent(type: string) {
  const component = (puckConfig.components as Record<string, { defaultProps?: Record<string, unknown> }>)[type];
  return {
    type,
    props: {
      ...component?.defaultProps,
      id: `homepage-block-${Date.now()}-${blockIdSequence++}`,
      locked: false,
    },
  };
}

const MEDIA_FIELD_LABELS = [
  ["desktopImage", "桌面端图片"],
  ["mobileImage", "手机端图片"],
  ["image", "主图片"],
  ["mainImage", "主图片"],
  ["detailImage", "细节图片"],
  ["posterUrl", "视频封面"],
] as const;

/**
 * 模板卡片不使用真实商品素材，而用“布局微缩图”展示该区块插入后的结构。
 * 这让用户先理解版式和内容层级，再决定是否添加。
 */
function BlockTemplateVisual({ name }: { name: string }) {
  const kind = BLOCK_PREVIEW_KIND[name] ?? "hero";
  return (
    <span
      className={`homepage-editor__template-visual homepage-editor__template-visual--${kind}`}
      aria-hidden="true"
    >
      <span className="homepage-editor__mock-nav" />
      <span className="homepage-editor__mock-art" />
      <span className="homepage-editor__mock-copy">
        <i />
        <i />
        <i />
      </span>
      <span className="homepage-editor__mock-cards">
        <i />
        <i />
        <i />
        <i />
      </span>
      <span className="homepage-editor__mock-dots"><i /><i /><i /></span>
      <span className="homepage-editor__mock-play">▶</span>
      <span className="homepage-editor__mock-hotspot"><i /><i /><i /></span>
    </span>
  );
}

function PageTemplateVisual({ templateId }: { templateId: string }) {
  const theme = templateId.includes("product-guide")
    ? "guide"
    : templateId.includes("new-launch")
      ? "launch"
      : templateId.includes("campaign")
        ? "campaign"
        : "brand";
  return (
    <span className={`homepage-editor__page-template-visual is-${theme}`} aria-hidden="true">
      <span className="homepage-editor__page-template-nav" />
      <span className="homepage-editor__page-template-hero" />
      <span className="homepage-editor__page-template-story" />
      <span className="homepage-editor__page-template-products"><i /><i /><i /></span>
      <span className="homepage-editor__page-template-cta" />
    </span>
  );
}

function TemplateCard({
  name,
  meta,
  favorite,
  onToggleFavorite,
  onAdded,
  onPointerDragMove,
  onPointerDragEnd,
}: {
  name: string;
  meta: BlockMeta;
  favorite: boolean;
  onToggleFavorite: () => void;
  onAdded: () => void;
  onPointerDragMove: (name: string, clientX: number, clientY: number) => void;
  onPointerDragEnd: (name: string, clientX: number, clientY: number) => boolean;
}) {
  const content = useHomepagePuck((state) => state.appState.data.content);
  const usedCount = content.filter(
    (item: { type: string }) => item.type === name,
  ).length;
  const limit = meta.limit ?? 5;
  const unavailable = usedCount >= limit;
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const didPointerDrag = useRef(false);
  const dragInput = useRef<"pointer" | "mouse" | null>(null);

  const moveTemplate = useCallback((clientX: number, clientY: number) => {
    const start = pointerStart.current;
    if (!start) return;
    const distance = Math.hypot(clientX - start.x, clientY - start.y);
    if (distance < 7 && !didPointerDrag.current) return;
    didPointerDrag.current = true;
    onPointerDragMove(name, clientX, clientY);
  }, [name, onPointerDragMove]);

  const endTemplateDrag = useCallback((clientX: number, clientY: number) => {
    if (!pointerStart.current) return;
    pointerStart.current = null;
    if (!didPointerDrag.current) return;
    if (onPointerDragEnd(name, clientX, clientY)) {
      onAdded();
    }
  }, [name, onAdded, onPointerDragEnd]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (dragInput.current) {
        moveTemplate(event.clientX, event.clientY);
      }
    };
    const handleMouseUp = (event: MouseEvent) => {
      if (!dragInput.current) return;
      endTemplateDrag(event.clientX, event.clientY);
      dragInput.current = null;
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [endTemplateDrag, moveTemplate]);

  const explainDrag = () => {
    if (unavailable) {
      message.info(`“${name}”最多可添加 ${limit} 个`);
      return;
    }
    message.info("按住模块并拖到画布中的目标位置");
  };

  return (
    <article className={`homepage-editor__template-card${unavailable ? " is-disabled" : ""}`}>
      <button
        type="button"
        className="homepage-editor__template-card-main"
        disabled={unavailable}
        onClick={explainDrag}
        onPointerDown={(event) => {
          if (event.pointerType === "touch" || unavailable) return;
          dragInput.current = "pointer";
          pointerStart.current = { x: event.clientX, y: event.clientY };
          didPointerDrag.current = false;
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (dragInput.current === "pointer") {
            moveTemplate(event.clientX, event.clientY);
          }
        }}
        onPointerUp={(event) => {
          if (dragInput.current !== "pointer") return;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          endTemplateDrag(event.clientX, event.clientY);
          dragInput.current = null;
          if (!didPointerDrag.current) return;
          event.preventDefault();
        }}
        onPointerCancel={() => {
          pointerStart.current = null;
          didPointerDrag.current = false;
          dragInput.current = null;
        }}
        onMouseDown={(event) => {
          if (unavailable || dragInput.current === "pointer") return;
          dragInput.current = "mouse";
          pointerStart.current = { x: event.clientX, y: event.clientY };
          didPointerDrag.current = false;
        }}
        title={unavailable ? `${name}已达可添加上限` : `拖拽${name}到画布`}
      >
        <span className="homepage-editor__template-preview-wrap">
        <BlockTemplateVisual name={name} />
        {meta.badge && (
          <span className="homepage-editor__template-badge">{meta.badge}</span>
        )}
        <span className="homepage-editor__template-add">拖到画布</span>
        </span>
        <span className="homepage-editor__template-name">{name}</span>
        <span className="homepage-editor__template-description">{meta.description}</span>
      </button>
      <button
        type="button"
        className={`homepage-editor__template-favorite${favorite ? " is-active" : ""}`}
        onClick={onToggleFavorite}
        aria-label={`${favorite ? "取消收藏" : "收藏"}${name}`}
        title={favorite ? "取消收藏" : "收藏"}
      >
        {favorite ? <HeartFilled /> : <HeartOutlined />}
      </button>
      <div className="homepage-editor__template-footer">
        <span>已添加 {usedCount} / {limit}</span>
        <span>{TEMPLATE_MEDIA_HINT[name] ?? meta.tags[0]}</span>
      </div>
    </article>
  );
}

function TemplateLibrary({
  onTemplatePointerDragMove,
  onTemplatePointerDragEnd,
  onSaveAsTemplate,
}: {
  onTemplatePointerDragMove: (name: string, clientX: number, clientY: number) => void;
  onTemplatePointerDragEnd: (name: string, clientX: number, clientY: number) => boolean;
  onSaveAsTemplate: (type: string, props: Record<string, any>) => void;
}) {
  const appData = useHomepagePuck((state) => state.appState.data);
  const dispatch = useHomepagePuck((state) => state.dispatch);
  const [libraryType, setLibraryType] = useState<"blocks" | "pages">("blocks");
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("全部");
  const [recentNames, setRecentNames] = useState<string[]>(() => {
    try {
      const stored = window.localStorage.getItem("homepage-editor-template-recent");
      const parsed = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
    } catch {
      return [];
    }
  });
  const [favoriteNames, setFavoriteNames] = useState<string[]>(() => {
    try {
      const stored = window.localStorage.getItem("homepage-editor-template-favorites");
      const parsed = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
    } catch {
      return [];
    }
  });
  const [myTemplates, setMyTemplates] = useState<BlockTemplate[]>(() =>
    blockTemplateStore.getAll(),
  );

  useEffect(() => {
    window.localStorage.setItem(
      "homepage-editor-template-favorites",
      JSON.stringify(favoriteNames),
    );
  }, [favoriteNames]);

  useEffect(() => {
    window.localStorage.setItem(
      "homepage-editor-template-recent",
      JSON.stringify(recentNames),
    );
  }, [recentNames]);

  const recordRecent = useCallback((name: string) => {
    setRecentNames((current) => [name, ...current.filter((item) => item !== name)].slice(0, 8));
  }, []);

  const toggleFavorite = useCallback((name: string) => {
    setFavoriteNames((current) =>
      current.includes(name)
        ? current.filter((item) => item !== name)
        : [...current, name],
    );
  }, []);

  const refreshMyTemplates = useCallback(() => {
    setMyTemplates(blockTemplateStore.getAll());
  }, []);

  const saveBlockAsTemplate = useCallback((blockType: string, blockProps: Record<string, any>) => {
    Modal.confirm({
      title: "保存区块为模板",
      content: (
        <div style={{ marginTop: 8 }}>
          <p style={{ margin: "0 0 8px", color: "#6B6259", fontSize: 12 }}>
            将当前「{blockType}」的配置保存为可复用的模板。
          </p>
          <label style={{ fontSize: 12, color: "#4A4239" }}>
            模板名称
            <input
              id="block-template-name-input"
              type="text"
              defaultValue={`我的${blockType}`}
              style={{
                display: "block",
                width: "100%",
                marginTop: 4,
                padding: "6px 10px",
                border: "1px solid #DED8CE",
                borderRadius: 3,
                fontSize: 13,
                boxSizing: "border-box",
              }}
            />
          </label>
        </div>
      ),
      okText: "保存为模板",
      cancelText: "取消",
      onOk: () => {
        const input = document.getElementById("block-template-name-input") as HTMLInputElement | null;
        const name = input?.value?.trim() || `我的${blockType}`;
        blockTemplateStore.save(name, blockType, blockProps);
        refreshMyTemplates();
        message.success(`「${name}」已保存为模板，在「我的模板」中查看`);
      },
    });
  }, [refreshMyTemplates]);

  const entries = useMemo(
    () =>
      Object.entries(BLOCK_META).filter(([name, meta]) => {
        const matchCategory =
          category === "全部" ||
          (category === "推荐" && meta.recommended) ||
          (category === "最近使用" && recentNames.includes(name)) ||
          (category === "我的收藏" && favoriteNames.includes(name)) ||
          meta.category === category;
        const matchKeyword = `${name}${meta.description}${meta.tags.join("")}`.includes(keyword.trim());
        return matchCategory && matchKeyword;
      }),
    [category, favoriteNames, keyword, recentNames],
  );

  const pageEntries = useMemo(
    () =>
      pageTemplates.filter((template) =>
        `${template.name}${template.description}${template.tags?.join("") ?? ""}`.includes(keyword.trim()),
      ),
    [keyword],
  );

  const makePageData = useCallback((template: TemplateDefinition) => {
    const data = JSON.parse(JSON.stringify(template.puckData));
    const idPrefix = `${template.id}-${Date.now()}`;
    data.content = data.content.map((block: any, index: number) => ({
      ...block,
      props: { ...block.props, id: `${idPrefix}-${index}`, locked: false },
    }));
    return data;
  }, []);

  const applyPageTemplate = useCallback((template: TemplateDefinition, mode: "replace" | "append") => {
    const apply = () => {
      const templateData = makePageData(template);
      const nextData = mode === "replace"
        ? templateData
        : { ...appData, content: [...appData.content, ...templateData.content] };
      dispatch({ type: "setData", data: nextData });
      recordRecent(template.name);
      message.success(mode === "replace" ? `已应用“${template.name}”` : `已将“${template.name}”追加到页面末尾`);
    };

    if (mode === "append") {
      const templateBlockCount = template.puckData.content.length;
      Modal.confirm({
        title: `追加“${template.name}”的区块？`,
        content: `会在当前页面末尾新增 ${templateBlockCount} 个区块，不会修改现有 ${appData.content.length} 个区块。`,
        okText: `确认追加 ${templateBlockCount} 个区块`,
        cancelText: "返回检查",
        onOk: apply,
      });
      return;
    }

    if (mode === "replace" && appData.content.length > 0) {
      Modal.confirm({
        title: `替换为“${template.name}”？`,
        content: "当前画布中的区块将被替换。你可以先保存草稿，或选择“追加区块”保留现有内容。",
        okText: "替换当前页",
        cancelText: "取消",
        onOk: apply,
      });
      return;
    }
    apply();
  }, [appData, dispatch, makePageData, recordRecent]);

  return (
    <aside className="homepage-editor__library" aria-label="模板库">
      <div className="homepage-editor__library-tools">
        <div className="homepage-editor__library-title">
          <AppstoreOutlined />
          <span>{libraryType === "blocks" ? "区块模板" : "页面模板"}</span>
          <small>
            {libraryType === "blocks"
              ? `显示 ${entries.length} / 共 ${Object.keys(BLOCK_META).length} 个`
              : `显示 ${pageEntries.length} / 共 ${pageTemplates.length} 个`}
          </small>
        </div>
        <div className="homepage-editor__library-mode" role="tablist" aria-label="模板层级">
          <button type="button" role="tab" aria-selected={libraryType === "blocks"} className={libraryType === "blocks" ? "is-active" : ""} onClick={() => setLibraryType("blocks")}>区块模板</button>
          <button type="button" role="tab" aria-selected={libraryType === "pages"} className={libraryType === "pages" ? "is-active" : ""} onClick={() => setLibraryType("pages")}><LayoutOutlined /> 页面模板</button>
        </div>
        <Input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder={libraryType === "blocks" ? "搜索区块模板" : "搜索页面模板"}
          prefix={<SearchOutlined />}
          aria-label="搜索模板"
        />
        {libraryType === "blocks" && <div className="homepage-editor__library-tabs" role="tablist">
          {BLOCK_FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={category === item}
              className={category === item ? "is-active" : ""}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </div>}
        {libraryType === "blocks" && (
          <div className="homepage-editor__library-drag-tip">
            <DragOutlined /> 按住模板拖到画板，可指定插入位置
          </div>
        )}
      </div>

      <div className="homepage-editor__template-scroll">
        {libraryType === "blocks" && (entries.length > 0 || category === "我的模板") ? (
          category === "我的模板" ? (
            myTemplates.length > 0 ? (
              myTemplates.map((tpl) => (
                <article className="homepage-editor__template-card" key={tpl.id}>
                  <button
                    type="button"
                    className="homepage-editor__template-card-main"
                    onClick={() => {
                      const newBlock = {
                        type: tpl.type,
                        props: {
                          ...JSON.parse(JSON.stringify(tpl.props)),
                          id: `homepage-block-${Date.now()}-${blockIdSequence++}`,
                          locked: false,
                        },
                      };
                      const updated = {
                        ...appData,
                        content: [...(appData.content ?? []), newBlock],
                      };
                      dispatch({ type: "setData", data: updated });
                      recordRecent(tpl.type);
                      message.success(`已添加“${tpl.name}”`);
                    }}
                  >
                    <span className="homepage-editor__template-preview-wrap">
                      <BlockTemplateVisual name={tpl.type} />
                      <span className="homepage-editor__template-badge" style={{ background: "#6C5CE7" }}>我的</span>
                      <span className="homepage-editor__template-add">点击添加</span>
                    </span>
                    <span className="homepage-editor__template-name">{tpl.name}</span>
                    <span className="homepage-editor__template-description">
                      {tpl.type} · {new Date(tpl.createdAt).toLocaleDateString("zh-CN")}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="homepage-editor__template-favorite"
                    onClick={() => {
                      blockTemplateStore.remove(tpl.id);
                      refreshMyTemplates();
                    }}
                    title="删除此模板"
                  >
                    <DeleteOutlined />
                  </button>
                </article>
              ))
            ) : (
              <div className="homepage-editor__library-empty">
                还没有保存过区块模板。<br />
                在右侧图层中选中区块，点击「另存为模板」即可。
              </div>
            )
          ) : entries.length > 0 ? (
            entries.map(([name, meta]) => (
              <TemplateCard
                key={name}
                name={name}
                meta={meta}
                favorite={favoriteNames.includes(name)}
                onToggleFavorite={() => toggleFavorite(name)}
                onAdded={() => recordRecent(name)}
                onPointerDragMove={onTemplatePointerDragMove}
                onPointerDragEnd={onTemplatePointerDragEnd}
              />
            ))
          ) : (
            <div className="homepage-editor__library-empty">没有找到匹配的区块模板</div>
          )
        ) : null}
        {libraryType === "pages" && (pageEntries.length > 0 ? (
          pageEntries.map((template) => (
            <article className="homepage-editor__page-template-card" key={template.id}>
              <PageTemplateVisual templateId={template.id} />
              <div className="homepage-editor__page-template-content">
                <span>{template.scenario}</span>
                <strong>{template.name}</strong>
                <p>{template.description}</p>
                <small>{template.tags?.join(" · ")}</small>
                <div>
                  <Button size="small" type="primary" onClick={() => applyPageTemplate(template, "replace")}>替换页面</Button>
                  <Button size="small" onClick={() => applyPageTemplate(template, "append")}>追加 {template.puckData.content.length} 个区块</Button>
                </div>
              </div>
            </article>
          ))
        ) : (
          <div className="homepage-editor__library-empty">没有找到匹配的页面模板</div>
        ))}
      </div>
    </aside>
  );
}

function EditorToolbar({
  lastSaved,
  publishing,
  hasUnsavedChanges,
  autoSaveState,
  onPublish,
  onOpenRevisions,
  onDataChange,
}: {
  lastSaved: string | null;
  publishing: boolean;
  hasUnsavedChanges: boolean;
  autoSaveState: AutoSaveState;
  onPublish: (data: unknown) => void;
  onOpenRevisions: () => void;
  onDataChange: (data: unknown) => void;
}) {
  const appData = useHomepagePuck((state) => state.appState.data);
  const viewports = useHomepagePuck((state) => state.appState.ui.viewports);
  const dispatch = useHomepagePuck((state) => state.dispatch);
  const currentViewport = viewports.current;
  const initializedViewport = useRef(false);
  const [undoStack, setUndoStack] = useState<any[]>([]);
  const [redoStack, setRedoStack] = useState<any[]>([]);
  const lastDataRef = useRef<any>(appData);

  /* ── Undo/Redo ── */
  const pushUndo = useCallback((nextData: any) => {
    const prev = lastDataRef.current;
    if (prev && JSON.stringify(prev) !== JSON.stringify(nextData)) {
      setUndoStack((s) => [...s.slice(-49), JSON.parse(JSON.stringify(prev))]);
      setRedoStack([]);
    }
    lastDataRef.current = JSON.parse(JSON.stringify(nextData));
  }, []);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    const currentSnap = JSON.parse(JSON.stringify(appData));
    setRedoStack((s) => [...s, currentSnap]);
    dispatch({ type: "setData", data: prev });
    setUndoStack((s) => s.slice(0, -1));
    lastDataRef.current = prev;
  }, [undoStack, appData, dispatch]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    const currentSnap = JSON.parse(JSON.stringify(appData));
    setUndoStack((s) => [...s, currentSnap]);
    dispatch({ type: "setData", data: next });
    setRedoStack((s) => s.slice(0, -1));
    lastDataRef.current = next;
  }, [redoStack, appData, dispatch]);
  const saveStatusText =
    autoSaveState === "saving"
      ? "正在自动保存"
      : autoSaveState === "error"
        ? "保存失败，正在重试"
        : hasUnsavedChanges
          ? "有未保存修改"
          : lastSaved
            ? `上次保存 ${lastSaved}`
            : "草稿编辑中";

  useEffect(() => {
    pushUndo(appData);
    onDataChange(appData);
  }, [appData]);

  const setViewport = (preset: ViewportPreset) => {
    const uiPatch: Partial<UiState> = {
      viewports: {
        ...viewports,
        current: { width: preset.width, height: preset.height },
      },
    };
    dispatch({ type: "setUi", ui: uiPatch });
  };

  useEffect(() => {
    if (initializedViewport.current) return;
    initializedViewport.current = true;
    setViewport(VIEWPORT_PRESETS[0]);
  }, []);

  return (
    <header className="homepage-editor__toolbar">
      <div className="homepage-editor__toolbar-context">
        <strong>海川珠宝</strong>
        <span className="homepage-editor__toolbar-divider" />
        <span>当前页面：店铺首页</span>
        <span className={`homepage-editor__save-status is-${autoSaveState}`}>
          <i />
          {saveStatusText}
        </span>
      </div>

      <div className="homepage-editor__viewport-switcher" aria-label="预览设备">
        {VIEWPORT_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className={currentViewport.width === preset.width || (preset.width === 1440 && currentViewport.width === "100%") ? "is-active" : ""}
            onClick={() => setViewport(preset)}
            aria-pressed={currentViewport.width === preset.width || (preset.width === 1440 && currentViewport.width === "100%")}
            title={`${preset.label}预览（${formatViewportSize(preset)}）`}
          >
            {preset.icon}
            <span>{preset.label}<small>{formatViewportSize(preset)}</small></span>
          </button>
        ))}
      </div>

      <div className="homepage-editor__toolbar-actions">
        <Button
          size="small"
          icon={<UndoOutlined />}
          disabled={undoStack.length === 0}
          onClick={handleUndo}
          title={`撤销 (${undoStack.length})`}
        />
        <Button
          size="small"
          icon={<RedoOutlined />}
          disabled={redoStack.length === 0}
          onClick={handleRedo}
          title={`重做 (${redoStack.length})`}
        />
        <span className="text-gray-300" style={{ margin: "0 4px" }}>|</span>
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => window.open("/preview/home", "_blank")}
          title="在新窗口查看前台效果（实时读取后台草稿）"
        >
          预览
        </Button>
        <Button
          size="small"
          icon={<HistoryOutlined />}
          onClick={onOpenRevisions}
          title="查看历史发布版本并回滚到草稿"
        >
          版本
        </Button>
        <Button
          size="small"
          type="primary"
          icon={<SendOutlined />}
          loading={publishing}
          onClick={() => onPublish(appData)}
          title="发布到前台网站"
        >
          发布
        </Button>
      </div>
    </header>
  );
}

function LayerRail({
  onSaveAsTemplate,
}: {
  onSaveAsTemplate: (type: string, props: Record<string, any>) => void;
}) {
  const appData = useHomepagePuck((state) => state.appState.data);
  const dispatch = useHomepagePuck((state) => state.dispatch);
  const selectedItem = useHomepagePuck((state) => state.selectedItem);
  const selectedId = selectedItem?.props?.id;
  const content = appData.content as Array<{ type: string; props: Record<string, any> }>;
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const selectLayer = (index: number) => {
    dispatch({ type: "setUi", ui: { itemSelector: { index, zone: ROOT_ZONE } } });
  };

  const reorderLayer = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= content.length || to >= content.length) return;
    const nextContent = [...content];
    const [moved] = nextContent.splice(from, 1);
    nextContent.splice(to, 0, moved);
    dispatch({ type: "setData", data: { ...appData, content: nextContent } });
    selectLayer(to);
  };

  const removeLayer = (index: number) => {
    const item = content[index];
    if (item.props?.locked) {
      message.info("此模块已锁定，不能删除");
      return;
    }
    Modal.confirm({
      title: `删除“${item.type}”？`,
      content: "删除后可从模板库重新添加；尚未发布的修改可通过版本记录恢复。",
      okText: "删除模块",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: () => {
        const nextContent = content.filter((_, itemIndex) => itemIndex !== index);
        dispatch({ type: "setData", data: { ...appData, content: nextContent } });
        dispatch({ type: "setUi", ui: { itemSelector: null } });
      },
    });
  };

  const toggleLayerVisibility = (index: number) => {
    const nextContent = [...content];
    const item = nextContent[index];
    nextContent[index] = {
      ...item,
      props: { ...item.props, isVisible: item.props?.isVisible === false },
    };
    dispatch({ type: "setData", data: { ...appData, content: nextContent } });
    selectLayer(index);
  };

  return (
    <section className="homepage-editor__layer-rail" aria-label="页面图层">
      <div className="homepage-editor__layer-heading">
        <span>页面图层</span>
        <small>{appData.content.length} 个模块</small>
      </div>
      <div className="homepage-editor__layer-scroll">
        {content.map(
          (item, index) => {
            const active = item.props?.id === selectedId;
            return (
              <div
                key={item.props?.id ?? `${item.type}-${index}`}
                className={`homepage-editor__layer-item${active ? " is-active" : ""}${draggingIndex === index ? " is-dragging" : ""}${dropIndex === index ? " is-drop-target" : ""}`}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  setDraggingIndex(index);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDropIndex(index);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (draggingIndex !== null) reorderLayer(draggingIndex, index);
                  setDraggingIndex(null);
                  setDropIndex(null);
                }}
                onDragEnd={() => {
                  setDraggingIndex(null);
                  setDropIndex(null);
                }}
              >
                <button type="button" className="homepage-editor__layer-select" onClick={() => selectLayer(index)}>
                  <span className="homepage-editor__layer-order">{String(index + 1).padStart(2, "0")}</span>
                  <DragOutlined />
                  <span>{item.type}</span>
                </button>
                <span className="homepage-editor__layer-actions" aria-label={`${item.type} 操作`}>
                  <button type="button" onClick={() => toggleLayerVisibility(index)} aria-label={item.props?.isVisible === false ? "显示模块" : "隐藏模块"} title={item.props?.isVisible === false ? "显示模块" : "隐藏模块"}>{item.props?.isVisible === false ? <EyeInvisibleOutlined /> : <EyeOutlined />}</button>
                  <button type="button" onClick={() => onSaveAsTemplate(item.type, item.props)} title="另存为我的模板"><SaveOutlined /></button>
                  <button type="button" onClick={() => removeLayer(index)} disabled={item.props?.locked} aria-label="删除模块" title={item.props?.locked ? "模块已锁定" : "删除"}><DeleteOutlined /></button>
                </span>
              </div>
            );
          },
        )}
        {appData.content.length === 0 && (
          <div className="homepage-editor__layer-empty">
            从左侧添加模板后，这里会显示页面结构。
          </div>
        )}
      </div>
    </section>
  );
}

function MediaSourceStatus({ props }: { props: Record<string, any> }) {
  const sources: Array<{ key: string; label: string; url?: string }> = MEDIA_FIELD_LABELS
    .filter(([key]) => key in props)
    .map(([key, label]) => ({ key, label, url: props[key] as string | undefined }));
  const carouselItems = Array.isArray(props.images) ? props.images : [];
  if (carouselItems.length) {
    sources.push({ key: "images", label: `轮播桌面图（${carouselItems.filter((item: any) => item?.url).length}/${carouselItems.length}）`, url: carouselItems[0]?.url });
    sources.push({ key: "images", label: `轮播手机图（${carouselItems.filter((item: any) => item?.mobileUrl).length}/${carouselItems.length}）`, url: carouselItems[0]?.mobileUrl });
  }
  if (!sources.length) return null;

  const missing = sources.filter((source) => !source.url).length;
  const missingSource = sources.find((source) => !source.url);
  const focusMissingField = () => {
    if (!missingSource) return;
    const field = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${missingSource.key}"]`);
    field?.scrollIntoView({ block: "center", behavior: "smooth" });
    field?.focus();
  };
  return (
    <section className="homepage-editor__media-status" aria-label="素材配置状态">
      {missing ? <ExclamationCircleOutlined /> : <CheckCircleOutlined />}
      <div>
        <strong>{missing ? `${missing} 项素材待配置` : "素材已配置"}</strong>
        <span>{missing ? "当前预览正在使用默认图" : `${sources.length} 项素材已就绪`}</span>
        {missingSource && <button type="button" onClick={focusMissingField}>补齐{missingSource.label}</button>}
      </div>
    </section>
  );
}

function InspectorPanel() {
  const dispatch = useHomepagePuck((state) => state.dispatch);
  const selectedItem = useHomepagePuck((state) => state.selectedItem);

  if (!selectedItem) {
    return null;
  }

  const closePanel = () =>
    dispatch({ type: "setUi", ui: { itemSelector: null } });

  return (
    <section className="homepage-editor__properties" aria-label="模块属性">
      <div className="homepage-editor__properties-heading">
        <div>
          <span>模块设置</span>
          <strong>{selectedItem.type}</strong>
        </div>
        <button
          type="button"
          className="homepage-editor__close-panel"
          aria-label="收起模块设置"
          onClick={closePanel}
        >
          <CloseOutlined />
        </button>
      </div>

      <div className="homepage-editor__properties-scroll">
        <MediaSourceStatus props={selectedItem.props || {}} />
        <div className="homepage-editor__properties-section">内容与样式</div>
        <Puck.Fields />
        <details className="homepage-editor__media-details">
          <summary>图片规格与裁切检查</summary>
          <MediaRequirementPanel type={selectedItem.type} props={selectedItem.props || {}} />
        </details>
      </div>

    </section>
  );
}

function CanvasPreview({ frameRef }: { frameRef: RefObject<HTMLDivElement> }) {
  const content = useHomepagePuck((state) => state.appState.data.content);
  const currentViewport = useHomepagePuck((state) => state.appState.ui.viewports.current);
  const isEmpty = content.length === 0;
  const viewportWidth = currentViewport.width === "100%" ? 1440 : currentViewport.width;
  const viewportHeight = currentViewport.height === "auto" ? 900 : currentViewport.height;
  const isDevicePreview = viewportWidth !== 1440;
  const previewWidth = `${viewportWidth}px`;
  const previewHeight = `${viewportHeight}px`;

  return (
    <div
      ref={frameRef}
      className={`homepage-editor__preview-frame${isDevicePreview ? " is-device" : ""}`}
      style={{ width: previewWidth, height: previewHeight, maxWidth: "none" }}
    >
      {isDevicePreview && (
        <div className="homepage-editor__device-bar">
          <span />
          <span />
          <span />
        </div>
      )}
      <Puck.Preview />
      {isEmpty && (
        <div className="homepage-editor__canvas-empty">
          <strong>从左侧添加第一个模板</strong>
          <span>点击模板后，它会作为独立模块加入店铺首页。</span>
        </div>
      )}
    </div>
  );
}

function EditorBody({
  onSaveAsTemplate,
}: {
  onSaveAsTemplate: (type: string, props: Record<string, any>) => void;
}) {
  const appData = useHomepagePuck((state) => state.appState.data);
  const currentViewport = useHomepagePuck((state) => state.appState.ui.viewports.current);
  const dispatch = useHomepagePuck((state) => state.dispatch);
  const selectedItem = useHomepagePuck((state) => state.selectedItem);
  const isInspecting = Boolean(selectedItem);
  const [draggingTemplate, setDraggingTemplate] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [canvasZoom, setCanvasZoom] = useState(1);
  const [canvasHeight, setCanvasHeight] = useState(0);
  // 默认完整展示画布；仅在用户主动缩放时退出自适应模式。
  const [isFitView, setIsFitView] = useState(true);
  const stageRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const previewFrameRef = useRef<HTMLDivElement>(null);
  const viewportWidth = currentViewport.width === "100%" ? 1440 : currentViewport.width;
  const canvasBaseWidth = viewportWidth;

  const getDropIndex = useCallback((clientY: number) => {
    const total = appData.content.length;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.height <= 0) return total;

    const frame = previewFrameRef.current;
    const iframe = frame?.querySelector("iframe");
    const blockNodes = iframe?.contentDocument?.querySelectorAll<HTMLElement>("[data-puck-component]");
    if (iframe && blockNodes && blockNodes.length === total) {
      const iframeRect = iframe.getBoundingClientRect();
      const scale = iframeRect.width / canvasBaseWidth;
      if (scale > 0) {
        const cursorY = (clientY - iframeRect.top) / scale;
        const blockIndex = Array.from(blockNodes).findIndex((block) =>
          cursorY < block.offsetTop + block.offsetHeight / 2,
        );
        return blockIndex === -1 ? total : blockIndex;
      }
    }

    const progress = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    return Math.round(progress * total);
  }, [appData.content.length, canvasBaseWidth]);

  const clearDragState = useCallback(() => {
    setDraggingTemplate(null);
    setDropIndex(null);
  }, []);

  const updateCanvasMetrics = useCallback(() => {
    const stage = stageRef.current;
    const frame = previewFrameRef.current;
    if (!stage || !frame) return;

    const contentHeight = frame.offsetHeight;
    if (contentHeight <= 0) return;

    const nextZoom = isFitView
      ? Math.min(
        1,
        Math.max(
            0.35,
          Math.min(
            (stage.clientWidth - 72) / canvasBaseWidth,
            (stage.clientHeight - 128) / contentHeight,
          ),
        ),
      )
      : canvasZoom;

    setCanvasZoom((current) => Math.abs(current - nextZoom) < 0.005 ? current : nextZoom);
    setCanvasHeight(contentHeight * nextZoom);
  }, [canvasBaseWidth, canvasZoom, isFitView]);

  // 切换设备后始终重新适应可用工作区，避免沿用上一设备的手动缩放值而裁掉画面。
  useEffect(() => {
    setIsFitView(true);
  }, [viewportWidth]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const frame = previewFrameRef.current;
    if (!stage || !frame) return;

    const observer = new ResizeObserver(updateCanvasMetrics);
    observer.observe(stage);
    observer.observe(frame);
    requestAnimationFrame(updateCanvasMetrics);
    return () => observer.disconnect();
  }, [updateCanvasMetrics, appData.content.length, viewportWidth]);

  const adjustCanvasZoom = (delta: number) => {
    setIsFitView(false);
    setCanvasZoom((current) => Math.min(1, Math.max(0.16, current + delta)));
  };

  const insertTemplate = useCallback((templateName: string, insertionIndex: number) => {
    const meta = BLOCK_META[templateName];
    if (!meta) return;
    const usedCount = appData.content.filter(
      (item: { type: string }) => item.type === templateName,
    ).length;
    if (usedCount >= (meta.limit ?? 5)) {
      message.info(`“${templateName}”已达到可添加上限`);
      clearDragState();
      return;
    }

    const nextContent = [...appData.content];
    nextContent.splice(
      insertionIndex,
      0,
      createBlockContent(templateName) as typeof appData.content[number],
    );
    dispatch({
      type: "setData",
      data: { ...appData, content: nextContent },
    });
    dispatch({
      type: "setUi",
      ui: { itemSelector: { index: insertionIndex, zone: ROOT_ZONE } },
    });
    message.success(`已插入“${templateName}”，可在右侧继续编辑`);
    clearDragState();
  }, [appData, clearDragState, dispatch]);

  const getCanvasDropIndex = useCallback((clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (
      !rect ||
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    ) {
      return null;
    }
    return getDropIndex(clientY);
  }, [getDropIndex]);

  const handleTemplatePointerDragMove = useCallback((name: string, clientX: number, clientY: number) => {
    const nextDropIndex = getCanvasDropIndex(clientX, clientY);
    if (nextDropIndex === null) {
      clearDragState();
      return;
    }
    setDraggingTemplate(name);
    setDropIndex(nextDropIndex);
  }, [clearDragState, getCanvasDropIndex]);

  const handleTemplatePointerDragEnd = useCallback((name: string, clientX: number, clientY: number) => {
    const insertionIndex = getCanvasDropIndex(clientX, clientY);
    if (insertionIndex === null) {
      clearDragState();
      return false;
    }
    insertTemplate(name, insertionIndex);
    return true;
  }, [clearDragState, getCanvasDropIndex, insertTemplate]);

  const dropPosition = appData.content.length === 0 || dropIndex === null
    ? 50
    : (dropIndex / appData.content.length) * 100;

  return (
    <main
      className={`homepage-editor__body${isInspecting ? " is-inspecting" : ""}`}
    >
      <TemplateLibrary
        onTemplatePointerDragMove={handleTemplatePointerDragMove}
        onTemplatePointerDragEnd={handleTemplatePointerDragEnd}
        onSaveAsTemplate={onSaveAsTemplate}
      />

      <section ref={stageRef} className="homepage-editor__stage" aria-label="店铺首页画布">
        <div className="homepage-editor__stage-label">
          <span>选中画布模块即可编辑</span>
        </div>
        <div className="homepage-editor__canvas-controls" aria-label="画布缩放">
          <button
            type="button"
            className={isFitView ? "is-active" : ""}
            onClick={() => setIsFitView(true)}
          >
            适应画布
          </button>
          <button type="button" onClick={() => adjustCanvasZoom(-0.1)} aria-label="缩小画布">−</button>
          <output>{Math.round(canvasZoom * 100)}%</output>
          <button type="button" onClick={() => adjustCanvasZoom(0.1)} aria-label="放大画布">+</button>
        </div>
        <div
          ref={canvasRef}
          className={`homepage-editor__canvas-document${draggingTemplate ? " is-dragging" : ""}`}
          style={{
            width: `${canvasBaseWidth * canvasZoom}px`,
            height: canvasHeight ? `${canvasHeight}px` : undefined,
          }}
        >
          <div
            className="homepage-editor__canvas-scale"
            style={{ width: `${canvasBaseWidth}px`, transform: `scale(${canvasZoom})` }}
          >
            <CanvasPreview frameRef={previewFrameRef} />
          </div>
          {draggingTemplate && (
            <>
              <div className="homepage-editor__drop-scrim">
                <span>拖放“{draggingTemplate}”到目标位置</span>
              </div>
              <div
                className="homepage-editor__drop-indicator"
                style={{ top: `${dropPosition}%` }}
              >
                <span>在此插入</span>
              </div>
            </>
          )}
        </div>
      </section>

      <aside className="homepage-editor__right-workspace">
        <LayerRail onSaveAsTemplate={onSaveAsTemplate} />
        <InspectorPanel />
      </aside>
    </main>
  );
}

function RevisionDrawer({
  open,
  revisions,
  loading,
  restoringVersion,
  onClose,
  onRestore,
}: {
  open: boolean;
  revisions: PageDocumentRevision[];
  loading: boolean;
  restoringVersion: number | null;
  onClose: () => void;
  onRestore: (revision: PageDocumentRevision) => void;
}) {
  return (
    <Drawer
      title="发布版本"
      placement="right"
      width={420}
      open={open}
      onClose={onClose}
      className="homepage-editor__revision-drawer"
    >
      {loading ? (
        <div className="homepage-editor__revision-loading">
          <Spin />
        </div>
      ) : revisions.length > 0 ? (
        <div className="homepage-editor__revision-list">
          {revisions.map((revision) => (
            <article
              key={revision.id}
              className="homepage-editor__revision-item"
            >
              <div>
                <strong>版本 {revision.version}</strong>
                <span>
                  <ClockCircleOutlined />
                  {formatEditorTime(revision.publishedAt || revision.createdAt)}
                </span>
              </div>
              <Button
                size="small"
                icon={<RollbackOutlined />}
                loading={restoringVersion === revision.version}
                onClick={() => onRestore(revision)}
              >
                恢复到草稿
              </Button>
            </article>
          ))}
        </div>
      ) : (
        <div className="homepage-editor__revision-empty">
          还没有发布版本。发布首页后，这里会保留可回滚的快照。
        </div>
      )}
    </Drawer>
  );
}

export default function HomepageConfig() {
  const [data, setData] = useState<any>(jewelryHomeTemplate.puckData);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [autoSaveState, setAutoSaveState] = useState<AutoSaveState>("idle");
  const [revisionsOpen, setRevisionsOpen] = useState(false);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [revisions, setRevisions] = useState<PageDocumentRevision[]>([]);
  const [restoringVersion, setRestoringVersion] = useState<number | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const latestData = useRef<any>(data);

  const [myTemplates, setMyTemplates] = useState<BlockTemplate[]>(() =>
    blockTemplateStore.getAll(),
  );

  const refreshMyTemplates = useCallback(() => {
    setMyTemplates(blockTemplateStore.getAll());
  }, []);

  const saveBlockAsTemplate = useCallback((blockType: string, blockProps: Record<string, any>) => {
    Modal.confirm({
      title: "保存区块为模板",
      content: (
        <div style={{ marginTop: 8 }}>
          <p style={{ margin: "0 0 8px", color: "#6B6259", fontSize: 12 }}>
            将当前「{blockType}」的配置保存为可复用的模板。
          </p>
          <label style={{ fontSize: 12, color: "#4A4239" }}>
            模板名称
            <input
              id="block-template-name-input"
              type="text"
              defaultValue={`我的${blockType}`}
              style={{
                display: "block",
                width: "100%",
                marginTop: 4,
                padding: "6px 10px",
                border: "1px solid #DED8CE",
                borderRadius: 3,
                fontSize: 13,
                boxSizing: "border-box",
              }}
            />
          </label>
        </div>
      ),
      okText: "保存为模板",
      cancelText: "取消",
      onOk: () => {
        const input = document.getElementById("block-template-name-input") as HTMLInputElement | null;
        const name = input?.value?.trim() || `我的${blockType}`;
        blockTemplateStore.save(name, blockType, blockProps);
        refreshMyTemplates();
        message.success(`「${name}」已保存为模板，在「我的模板」中查看`);
      },
    });
  }, [refreshMyTemplates]);
  const editorConfig = useMemo(() => ({
    ...puckConfig,
    components: Object.fromEntries(
      Object.entries(puckConfig.components).map(([type, component]) => [
        type,
        {
          ...(component as any),
          render: (props: Record<string, any>) => props.isVisible === false ? (
            <div className="homepage-editor__hidden-block">此模块已隐藏，不会发布到前台</div>
          ) : (component as any).render(props),
        },
      ]),
    ),
  }) as typeof puckConfig, []);

  useEffect(() => {
    latestData.current = data;
  }, [data]);

  useEffect(() => {
    (async () => {
      let serverData = jewelryHomeTemplate.puckData;
      try {
        const response = await pageDocumentApi.getAdmin("home");
        const document = unwrapResponse<any>(response);
        if (document?.puckData) {
          serverData = document.puckData;
          setData(serverData);
          latestData.current = serverData;
          setEditorKey((current) => current + 1);
          if (document.updatedAt) {
            setLastSaved(formatEditorTime(document.updatedAt));
          }
        }
      } catch {
        // 无草稿时使用内置首页模板。
      }

    })();
  }, []);

  const trackEditorData = useCallback(
    (nextData: unknown) => {
      latestData.current = nextData;
      const changed = JSON.stringify(nextData) !== JSON.stringify(data);
      setHasUnsavedChanges(changed);
      if (changed) {
        setAutoSaveState((current) => current === "saving" ? current : "idle");
      }
    },
    [data],
  );

  const saveDraft = useCallback(async (
    nextData: unknown,
    options: { silent?: boolean } = {},
  ) => {
    const editableData = nextData ?? latestData.current;
    setSaving(true);
    setAutoSaveState("saving");
    try {
      await pageDocumentApi.save({
        pageKey: "home",
        puckData: editableData,
        editorVersion: "0.22.4",
      });
      const hasNewerLocalChanges =
        JSON.stringify(latestData.current) !== JSON.stringify(editableData);
      setLastSaved(formatEditorTime(new Date()));
      if (hasNewerLocalChanges) {
        setHasUnsavedChanges(true);
        setAutoSaveState("idle");
      } else {
        setData(editableData);
        latestData.current = editableData;
        setHasUnsavedChanges(false);
        setAutoSaveState("saved");
      }
      if (!options.silent) {
        message.success("首页草稿已保存");
      }
    } catch (error) {
      setAutoSaveState("error");
      if (!options.silent) {
        message.error(error instanceof Error ? error.message : "保存失败，请稍后重试");
      }
    } finally {
      setSaving(false);
    }
  }, []);

  useEffect(() => {
    if (!hasUnsavedChanges || saving || publishing) return;
    const timer = window.setTimeout(() => {
      void saveDraft(latestData.current, { silent: true });
    }, autoSaveState === "error" ? 8000 : AUTO_SAVE_DELAY);
    return () => window.clearTimeout(timer);
  }, [autoSaveState, hasUnsavedChanges, publishing, saveDraft, saving]);

  const loadRevisions = useCallback(async () => {
    setRevisionsLoading(true);
    try {
      const response = await pageDocumentApi.getRevisions("home");
      setRevisions(unwrapResponse<PageDocumentRevision[]>(response) || []);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "版本列表加载失败");
    } finally {
      setRevisionsLoading(false);
    }
  }, []);

  const openRevisions = useCallback(() => {
    setRevisionsOpen(true);
    void loadRevisions();
  }, [loadRevisions]);

  const restoreRevision = useCallback((revision: PageDocumentRevision) => {
    Modal.confirm({
      title: `恢复版本 ${revision.version}？`,
      content: "恢复后会覆盖当前后台草稿，但不会立即影响前台首页。确认后可继续编辑或重新发布。",
      okText: "恢复到草稿",
      cancelText: "取消",
      onOk: async () => {
        setRestoringVersion(revision.version);
        try {
          const response = await pageDocumentApi.restoreRevision("home", revision.version);
          const document = unwrapResponse<any>(response);
          if (document?.puckData) {
            setData(document.puckData);
            latestData.current = document.puckData;
            setHasUnsavedChanges(false);
            setAutoSaveState("saved");
            setLastSaved(formatEditorTime(document.updatedAt || new Date()));
            setEditorKey((current) => current + 1);
          }
          message.success(`已恢复版本 ${revision.version} 到草稿`);
          setRevisionsOpen(false);
        } catch (error) {
          message.error(error instanceof Error ? error.message : "版本恢复失败");
        } finally {
          setRestoringVersion(null);
        }
      },
    });
  }, []);

  const publishHome = (nextData: unknown) => {
    const editableData = nextData ?? latestData.current;
    const blocks = (editableData as { content?: Array<{ type?: string; props?: Record<string, unknown> }> })?.content ?? [];
    const incompleteHero = blocks.find((block) =>
      block.type === "首屏主视觉" && (!block.props?.desktopImage || !block.props?.mobileImage),
    );
    Modal.confirm({
      title: "确认发布首页？",
      content: incompleteHero
        ? "首屏主视觉缺少电脑端或手机端图片，发布后会使用默认图。请确认这是你的预期。"
        : "发布后，当前店铺首页将立即更新为本次编辑内容。",
      okText: "确认发布",
      cancelText: "继续检查",
      onOk: async () => {
        setPublishing(true);
        try {
          await pageDocumentApi.save({
            pageKey: "home",
            puckData: editableData,
            editorVersion: "0.22.4",
          });
          await pageDocumentApi.publish("home");
          setData(editableData);
          latestData.current = editableData;
          setHasUnsavedChanges(false);
          setAutoSaveState("saved");
          setLastSaved(formatEditorTime(new Date()));
          void loadRevisions();
          message.success("店铺首页已发布");
        } catch (error) {
          message.error(error instanceof Error ? error.message : "发布失败，请稍后重试");
        } finally {
          setPublishing(false);
        }
      },
    });
  };

  return (
    <div className="homepage-editor">
      <style>{`
        .homepage-editor {
          --puck-color-interactive: #B8944E;
          --puck-color-interactive-hover: #9C793B;
          --puck-color-interactive-active: #81642E;
          --puck-color-interactive-subtle: #F4EFE5;
          --puck-color-interactive-soft: #FAF7F1;
          --puck-color-selection-border: #B8944E;
          --puck-color-selection-bg: rgba(184, 148, 78, .10);
          --puck-color-focus-ring: #B8944E;
          --puck-font-family: "PingFang SC", "Microsoft YaHei", Arial, sans-serif;
          height: 100%;
          min-height: 0;
          display: flex;
          flex-direction: column;
          color: #24211E;
          background: #F4F5FA;
        }
        .homepage-editor > .Puck {
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .homepage-editor > [class*="PuckLayout"] {
          flex: 1;
          min-height: 0;
          height: 100% !important;
        }
        .admin-main--workspace:has(.homepage-editor) {
          height: 100%;
          min-height: 0;
          overflow: hidden;
        }
        .homepage-editor__toolbar {
          height: 64px;
          min-height: 64px;
          box-sizing: border-box;
          display: grid;
          grid-template-columns: minmax(260px, 1fr) auto minmax(260px, 1fr);
          align-items: center;
          gap: 18px;
          padding: 0 24px;
          background: #FFFFFF;
          border-bottom: 1px solid #E8E4DC;
        }
        .homepage-editor__toolbar-context {
          display: flex;
          align-items: center;
          gap: 9px;
          color: #8E877C;
          font-size: 12px;
          white-space: nowrap;
        }
        .homepage-editor__toolbar-context strong { color: #27231E; font-size: 14px; }
        .homepage-editor__toolbar-divider { width: 1px; height: 14px; background: #DED8CE; }
        .homepage-editor__save-status { display: inline-flex; align-items: center; gap: 5px; color: #7E9A74; }
        .homepage-editor__save-status.is-saving { color: #9A7A30; }
        .homepage-editor__save-status.is-error { color: #B14D45; }
        .homepage-editor__save-status i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
        .homepage-editor__viewport-switcher {
          display: flex;
          align-items: center;
          padding: 3px;
          border: 1px solid #ECE7DF;
          border-radius: 6px;
          background: #F8F7F4;
        }
        .homepage-editor__viewport-switcher button {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 10px;
          border: 0;
          border-radius: 4px;
          color: #888177;
          background: transparent;
          font-size: 12px;
          cursor: pointer;
        }
        .homepage-editor__viewport-switcher button > span { display: grid; gap: 1px; line-height: 1.1; text-align: left; }
        .homepage-editor__viewport-switcher button small { color: currentColor; font-size: 9px; opacity: .62; }
        .homepage-editor__viewport-switcher button.is-active {
          color: #78561D;
          background: #FFFFFF;
          box-shadow: 0 1px 3px rgba(47, 38, 25, .10);
        }
        .homepage-editor__toolbar-actions {
          justify-self: end;
          display: flex;
          gap: 8px;
        }
        .homepage-editor__toolbar-actions .ant-btn { border-radius: 3px; }
        .homepage-editor__toolbar-actions .ant-btn { min-height: 32px; }
        .homepage-editor__toolbar-actions .ant-btn-primary,
        .homepage-editor__properties-actions .ant-btn-primary {
          border-color: #B8944E;
          background: #B8944E;
        }
        .homepage-editor__revision-drawer .ant-drawer-header {
          border-bottom-color: #EEE8DE;
        }
        .homepage-editor__revision-loading,
        .homepage-editor__revision-empty {
          min-height: 180px;
          display: grid;
          place-items: center;
          color: #8E877C;
          text-align: center;
          line-height: 1.7;
        }
        .homepage-editor__revision-list {
          display: grid;
          gap: 10px;
        }
        .homepage-editor__revision-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          padding: 12px;
          border: 1px solid #EEE8DE;
          border-radius: 6px;
          background: #FFFEFC;
        }
        .homepage-editor__revision-item > div {
          min-width: 0;
          display: grid;
          gap: 5px;
        }
        .homepage-editor__revision-item strong {
          color: #2B2721;
          font-size: 13px;
        }
        .homepage-editor__revision-item span {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          color: #8D8375;
          font-size: 12px;
        }
        .homepage-editor__revision-item .ant-btn {
          flex: 0 0 auto;
          border-radius: 3px;
        }
        .homepage-editor__body {
          flex: 1;
          min-height: 0;
          position: relative;
          display: grid;
          grid-template-columns: 280px minmax(0, 1fr) auto;
          overflow: hidden;
        }
        .homepage-editor__library {
          min-height: 0;
          display: flex;
          flex-direction: column;
          background: #FFFFFF;
          border-right: 1px solid #E8E4DC;
        }
        .homepage-editor__library-tools {
          flex: 0 0 auto;
          padding: 16px 14px 12px;
          border-bottom: 1px solid #EEEAE4;
        }
        .homepage-editor__library-title {
          display: flex;
          align-items: center;
          gap: 7px;
          margin-bottom: 12px;
          color: #27231E;
          font-size: 14px;
          font-weight: 600;
        }
        .homepage-editor__library-title .anticon { color: #B8944E; }
        .homepage-editor__library-title small {
          margin-left: auto;
          color: #9A9187;
          font-size: 10px;
          font-weight: 400;
        }
        .homepage-editor__library-mode {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 3px;
          margin-bottom: 10px;
          padding: 3px;
          border: 1px solid #E8E2D9;
          border-radius: 5px;
          background: #F7F5F1;
        }
        .homepage-editor__library-mode button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          min-height: 27px;
          border: 0;
          border-radius: 3px;
          color: #81796F;
          background: transparent;
          font-size: 11px;
          cursor: pointer;
        }
        .homepage-editor__library-mode button.is-active {
          color: #644718;
          background: #FFFFFF;
          box-shadow: 0 1px 3px rgba(57, 45, 28, .10);
        }
        .homepage-editor__library-tools .ant-input-affix-wrapper {
          border-color: #E6E0D7;
          border-radius: 4px;
          box-shadow: none;
        }
        .homepage-editor__library-tools .ant-input-affix-wrapper:focus-within {
          border-color: #B8944E;
          box-shadow: 0 0 0 2px rgba(184, 148, 78, .10);
        }
        .homepage-editor__library-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
        .homepage-editor__library-tabs button {
          padding: 4px 9px;
          border: 1px solid transparent;
          border-radius: 4px;
          color: #7F786F;
          background: #F7F5F1;
          font-size: 11px;
          cursor: pointer;
        }
        .homepage-editor__library-tabs button.is-active {
          border-color: #D8C49A;
          color: #7D5A20;
          background: #FBF7EE;
        }
        .homepage-editor__library-drag-tip {
          display: flex;
          align-items: center;
          gap: 5px;
          margin-top: 10px;
          color: #9A8D7C;
          font-size: 10px;
          line-height: 1.3;
        }
        .homepage-editor__library-drag-tip .anticon { color: #B8944E; }
        .homepage-editor__template-scroll,
        .homepage-editor__layer-scroll,
        .homepage-editor__properties-scroll,
        .homepage-editor__stage {
          overscroll-behavior: contain;
          scrollbar-width: thin;
          scrollbar-color: #CFC8BE transparent;
        }
        .homepage-editor__template-scroll {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: 14px 14px 38px;
          background: #FCFCFB;
        }
        .homepage-editor__template-scroll::-webkit-scrollbar,
        .homepage-editor__layer-scroll::-webkit-scrollbar,
        .homepage-editor__properties-scroll::-webkit-scrollbar,
        .homepage-editor__stage::-webkit-scrollbar { width: 7px; }
        .homepage-editor__template-scroll::-webkit-scrollbar-thumb,
        .homepage-editor__layer-scroll::-webkit-scrollbar-thumb,
        .homepage-editor__properties-scroll::-webkit-scrollbar-thumb,
        .homepage-editor__stage::-webkit-scrollbar-thumb { border-radius: 999px; background: #CFC8BE; }
        .homepage-editor__template-card {
          position: relative;
          width: 100%;
          display: block;
          margin: 0 0 16px;
          padding: 0 0 11px;
          overflow: hidden;
          border: 1px solid #E9E4DC;
          border-radius: 6px;
          color: inherit;
          background: #FFFFFF;
          text-align: left;
          transition: transform .16s ease, border-color .16s ease, box-shadow .16s ease;
        }
        .homepage-editor__template-card:not(.is-disabled):hover {
          border-color: #B8944E;
          box-shadow: 0 8px 18px rgba(76, 53, 20, .13);
          transform: translateY(-1px);
        }
        .homepage-editor__template-card.is-disabled { opacity: .56; }
        .homepage-editor__template-card-main {
          display: block;
          width: 100%;
          padding: 0;
          border: 0;
          color: inherit;
          background: transparent;
          text-align: left;
          cursor: pointer;
        }
        .homepage-editor__template-card-main { touch-action: pan-y; }
        @media (pointer: fine) {
          .homepage-editor__template-card-main { cursor: grab; }
          .homepage-editor__template-card-main:active { cursor: grabbing; }
        }
        .homepage-editor__template-card-main:disabled { cursor: not-allowed; }
        .homepage-editor__template-preview-wrap { position: relative; display: block; }
        .homepage-editor__template-visual {
          position: relative;
          display: block;
          aspect-ratio: 3 / 4;
          overflow: hidden;
          background: #F4F5F7;
        }
        .homepage-editor__template-visual > span { position: absolute; box-sizing: border-box; }
        .homepage-editor__mock-nav { top: 8px; left: 8px; right: 8px; height: 7px; border-radius: 2px; background: rgba(47, 51, 58, .12); }
        .homepage-editor__mock-art { border-radius: 3px; background: linear-gradient(142deg, #BFD1DA 0%, #728A98 46%, #2C3843 100%); }
        .homepage-editor__mock-copy { display: grid; gap: 4px; }
        .homepage-editor__mock-copy i { display: block; height: 4px; border-radius: 999px; background: rgba(34, 39, 45, .56); }
        .homepage-editor__mock-copy i:nth-child(2) { width: 74%; opacity: .58; }
        .homepage-editor__mock-copy i:nth-child(3) { width: 48%; opacity: .36; }
        .homepage-editor__mock-cards { display: grid; gap: 4px; }
        .homepage-editor__mock-cards i { display: block; border-radius: 2px; background: linear-gradient(145deg, #F3E7D4, #C8A36A); }
        .homepage-editor__mock-dots { display: flex; gap: 4px; }
        .homepage-editor__mock-dots i { display: block; width: 4px; height: 4px; border-radius: 50%; background: #FFFFFF; opacity: .55; }
        .homepage-editor__mock-dots i:first-child { opacity: 1; }
        .homepage-editor__mock-play { display: none; place-items: center; width: 28px; height: 28px; border: 1px solid rgba(255,255,255,.74); border-radius: 50%; color: #FFF; font-size: 10px; }
        .homepage-editor__mock-hotspot { display: none; }
        .homepage-editor__mock-hotspot i { display: block; width: 10px; height: 10px; border: 2px solid #FFF; border-radius: 50%; box-shadow: 0 0 0 3px rgba(184,148,78,.55); }

        .homepage-editor__template-visual--hero { background: #D9D6D0; }
        .homepage-editor__template-visual--hero .homepage-editor__mock-art { inset: 18px 8px 8px; background: linear-gradient(145deg, #D8C5A6 0%, #8B684B 42%, #32271F 100%); }
        .homepage-editor__template-visual--hero .homepage-editor__mock-copy { left: 17px; right: 56%; bottom: 20px; }
        .homepage-editor__template-visual--hero .homepage-editor__mock-copy i { background: rgba(255,255,255,.9); }

        .homepage-editor__template-visual--single-poster { background: #F6F2EC; }
        .homepage-editor__template-visual--single-poster .homepage-editor__mock-art { top: 14px; right: 8px; bottom: 8px; width: 48%; background: linear-gradient(150deg, #BAA890, #5D5148); }
        .homepage-editor__template-visual--single-poster .homepage-editor__mock-copy { top: 38%; left: 14px; width: 39%; }

        .homepage-editor__template-visual--double-poster { padding: 25px 8px 8px; background: #F7F5F2; }
        .homepage-editor__template-visual--double-poster .homepage-editor__mock-art { top: 25px; left: 8px; width: calc(50% - 10px); bottom: 8px; background: linear-gradient(145deg, #C9D4D0, #62777A); }
        .homepage-editor__template-visual--double-poster .homepage-editor__mock-cards { top: 25px; right: 8px; width: calc(50% - 10px); bottom: 8px; grid-template-columns: 1fr; }
        .homepage-editor__template-visual--double-poster .homepage-editor__mock-cards i { background: linear-gradient(145deg, #E2C9AD, #9D745C); }
        .homepage-editor__template-visual--double-poster .homepage-editor__mock-cards i:not(:first-child) { display: none; }
        .homepage-editor__template-visual--double-poster .homepage-editor__mock-copy { left: 12px; top: 11px; width: 44%; }

        .homepage-editor__template-visual--image-text { background: #F4F0E9; }
        .homepage-editor__template-visual--image-text .homepage-editor__mock-art { left: 8px; top: 20px; bottom: 8px; width: 51%; background: linear-gradient(145deg, #E2CFB4, #806C59); }
        .homepage-editor__template-visual--image-text .homepage-editor__mock-copy { top: 39%; right: 12px; width: 31%; }

        .homepage-editor__template-visual--full-bleed .homepage-editor__mock-art { inset: 0; border-radius: 0; background: linear-gradient(150deg, #20282C, #59666A 48%, #D7C1A0); }
        .homepage-editor__template-visual--full-bleed .homepage-editor__mock-copy { left: 15%; right: 15%; bottom: 24px; }
        .homepage-editor__template-visual--full-bleed .homepage-editor__mock-copy i { margin: auto; background: rgba(255,255,255,.9); }

        .homepage-editor__template-visual--product-row,
        .homepage-editor__template-visual--card-grid,
        .homepage-editor__template-visual--category-cards { background: #FCFCFC; }
        .homepage-editor__template-visual--product-row .homepage-editor__mock-copy,
        .homepage-editor__template-visual--card-grid .homepage-editor__mock-copy,
        .homepage-editor__template-visual--category-cards .homepage-editor__mock-copy { left: 12px; top: 22px; width: 43%; }
        .homepage-editor__template-visual--product-row .homepage-editor__mock-cards { left: 9px; right: 9px; bottom: 12px; grid-template-columns: repeat(4, 1fr); height: 55%; }
        .homepage-editor__template-visual--product-row .homepage-editor__mock-cards i:nth-child(odd) { background: linear-gradient(145deg, #EFEBE6 0 44%, #BFA172 45% 72%, #F8F5F0 73%); }
        .homepage-editor__template-visual--category-cards .homepage-editor__mock-cards { left: 10px; right: 10px; bottom: 10px; grid-template-columns: repeat(2, 1fr); grid-template-rows: repeat(2, 1fr); height: 59%; }
        .homepage-editor__template-visual--category-cards .homepage-editor__mock-cards i:nth-child(1) { background: linear-gradient(135deg, #B5CBD2, #55717C); }
        .homepage-editor__template-visual--category-cards .homepage-editor__mock-cards i:nth-child(2) { background: linear-gradient(135deg, #E8D9C4, #9E765B); }
        .homepage-editor__template-visual--category-cards .homepage-editor__mock-cards i:nth-child(3) { background: linear-gradient(135deg, #D8CFB6, #887A56); }
        .homepage-editor__template-visual--category-cards .homepage-editor__mock-cards i:nth-child(4) { background: linear-gradient(135deg, #D2BBC1, #8E666C); }
        .homepage-editor__template-visual--card-grid .homepage-editor__mock-cards { left: 10px; right: 10px; bottom: 13px; grid-template-columns: repeat(3, 1fr); height: 57%; }
        .homepage-editor__template-visual--card-grid .homepage-editor__mock-cards i { background: linear-gradient(180deg, #EEE6D8 0 45%, #FFF 46%); border: 1px solid #EEE7DC; }

        .homepage-editor__template-visual--text-banner { display: grid; place-items: center; background: #E8DDCC; }
        .homepage-editor__template-visual--text-banner .homepage-editor__mock-art { inset: 16px 8px; background: linear-gradient(135deg, #5D4B37, #A88355); }
        .homepage-editor__template-visual--text-banner .homepage-editor__mock-copy { z-index: 1; width: 56%; }
        .homepage-editor__template-visual--text-banner .homepage-editor__mock-copy i { margin: auto; background: rgba(255,255,255,.92); }

        .homepage-editor__template-visual--carousel .homepage-editor__mock-art { inset: 18px 8px 8px; background: linear-gradient(145deg, #CDB99E, #766251); }
        .homepage-editor__template-visual--carousel .homepage-editor__mock-copy { left: 16px; bottom: 24px; width: 42%; }
        .homepage-editor__template-visual--carousel .homepage-editor__mock-copy i { background: #FFF; }
        .homepage-editor__template-visual--carousel .homepage-editor__mock-dots { right: 15px; bottom: 15px; }

        .homepage-editor__template-visual--video .homepage-editor__mock-art { inset: 8px; background: linear-gradient(145deg, #222927, #6C7A72); }
        .homepage-editor__template-visual--video .homepage-editor__mock-play { display: grid; left: calc(50% - 14px); top: calc(50% - 14px); }

        .homepage-editor__template-visual--split-panel { background: #F6F3EE; }
        .homepage-editor__template-visual--split-panel .homepage-editor__mock-art { left: 8px; top: 20px; bottom: 8px; width: calc(50% - 10px); background: linear-gradient(150deg, #C7A98D, #635042); }
        .homepage-editor__template-visual--split-panel .homepage-editor__mock-cards { right: 8px; top: 20px; bottom: 8px; width: calc(50% - 10px); grid-template-columns: 1fr; }
        .homepage-editor__template-visual--split-panel .homepage-editor__mock-cards i { background: #FDFCFA; border: 1px solid #E6DFD6; }
        .homepage-editor__template-visual--split-panel .homepage-editor__mock-cards i:not(:first-child) { display: none; }
        .homepage-editor__template-visual--split-panel .homepage-editor__mock-copy { top: 42%; right: 13px; width: 29%; }

        .homepage-editor__template-visual--hotspot .homepage-editor__mock-art { inset: 8px; background: linear-gradient(145deg, #D8C3A1, #906845 48%, #46372B); }
        .homepage-editor__template-visual--hotspot .homepage-editor__mock-hotspot { display: grid; gap: 19px; left: 30%; top: 29%; }
        .homepage-editor__template-badge {
          position: absolute;
          top: 8px;
          left: 8px;
          padding: 3px 6px;
          border-radius: 3px;
          color: #FFFFFF;
          background: #B8944E;
          font-size: 10px;
          line-height: 1.2;
        }
        .homepage-editor__template-add {
          position: absolute;
          right: 8px;
          bottom: 8px;
          padding: 4px 7px;
          border-radius: 3px;
          color: #FFFFFF;
          background: rgba(34, 29, 23, .76);
          font-size: 11px;
          opacity: 0;
          transform: translateY(3px);
          transition: opacity .16s ease, transform .16s ease;
        }
        .homepage-editor__template-card:hover .homepage-editor__template-add { opacity: 1; transform: translateY(0); }
        .homepage-editor__template-favorite {
          position: absolute;
          top: 8px;
          right: 8px;
          display: grid;
          width: 26px;
          height: 26px;
          place-items: center;
          border: 0;
          border-radius: 50%;
          color: #FFFFFF;
          background: rgba(35, 29, 22, .54);
          cursor: pointer;
          opacity: 0;
          transition: opacity .16s ease, color .16s ease, background .16s ease;
        }
        .homepage-editor__template-card:hover .homepage-editor__template-favorite,
        .homepage-editor__template-card:focus-within .homepage-editor__template-favorite,
        .homepage-editor__template-favorite.is-active { opacity: 1; }
        .homepage-editor__template-favorite.is-active { color: #D3A54D; background: #FFFFFF; }
        .homepage-editor__template-name {
          display: block;
          margin: 10px 11px 3px;
          color: #3A352F;
          font-size: 13px;
          font-weight: 600;
        }
        .homepage-editor__template-description {
          display: -webkit-box;
          min-height: 32px;
          margin: 0 11px;
          overflow: hidden;
          color: #8E867C;
          font-size: 11px;
          line-height: 16px;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
        }
        .homepage-editor__template-footer {
          display: flex;
          justify-content: space-between;
          margin: 9px 11px 0;
          color: #9B9389;
          font-size: 10px;
        }
        .homepage-editor__template-footer span:last-child { color: #92713B; }
        .homepage-editor__page-template-card {
          overflow: hidden;
          margin: 0 0 16px;
          border: 1px solid #E9E4DC;
          border-radius: 6px;
          background: #FFFFFF;
          transition: border-color .16s ease, box-shadow .16s ease;
        }
        .homepage-editor__page-template-card:hover { border-color: #B8944E; box-shadow: 0 8px 18px rgba(76, 53, 20, .10); }
        .homepage-editor__page-template-visual {
          position: relative;
          display: block;
          height: 108px;
          overflow: hidden;
          background: #F6F2EB;
        }
        .homepage-editor__page-template-visual > span { position: absolute; box-sizing: border-box; }
        .homepage-editor__page-template-nav { top: 8px; left: 9px; right: 9px; height: 6px; border-radius: 2px; background: rgba(44,39,32,.16); }
        .homepage-editor__page-template-hero { top: 20px; left: 9px; right: 9px; height: 37px; border-radius: 3px; background: linear-gradient(130deg, #D5C1A5, #806449 58%, #3B3028); }
        .homepage-editor__page-template-story { top: 63px; left: 9px; width: 42%; height: 31px; border-radius: 2px; background: linear-gradient(135deg, #F7F4EE, #D7C5AC); }
        .homepage-editor__page-template-products { right: 9px; top: 63px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px; width: 51%; height: 31px; }
        .homepage-editor__page-template-products i { display: block; border-radius: 2px; background: linear-gradient(145deg, #F3ECE2 0 55%, #B99561 56%); }
        .homepage-editor__page-template-cta { bottom: 8px; left: 9px; right: 9px; height: 4px; border-radius: 999px; background: #B8944E; }
        .homepage-editor__page-template-visual.is-guide { background: #F6F7F7; }
        .homepage-editor__page-template-visual.is-guide .homepage-editor__page-template-hero { background: linear-gradient(135deg, #C5D3D6, #58717A 62%, #29383E); }
        .homepage-editor__page-template-visual.is-guide .homepage-editor__page-template-story { background: linear-gradient(135deg, #FBFBFA, #DCE3E0); }
        .homepage-editor__page-template-visual.is-launch .homepage-editor__page-template-hero { background: linear-gradient(130deg, #B6987A, #5C4A3B 62%, #26201C); }
        .homepage-editor__page-template-visual.is-campaign { background: #FBF4E8; }
        .homepage-editor__page-template-visual.is-campaign .homepage-editor__page-template-hero { background: linear-gradient(135deg, #A36436, #D6A85B 58%, #6A4325); }
        .homepage-editor__page-template-visual.is-campaign .homepage-editor__page-template-cta { background: #9C5A2D; }
        .homepage-editor__page-template-content { padding: 11px; }
        .homepage-editor__page-template-content > span { display: block; color: #9B7D4C; font-size: 10px; }
        .homepage-editor__page-template-content strong { display: block; margin-top: 3px; color: #332D26; font-size: 13px; }
        .homepage-editor__page-template-content p { min-height: 34px; margin: 5px 0; color: #837B71; font-size: 11px; line-height: 17px; }
        .homepage-editor__page-template-content small { display: block; color: #A2988C; font-size: 10px; }
        .homepage-editor__page-template-content > div { display: flex; gap: 7px; margin-top: 10px; }
        .homepage-editor__page-template-content .ant-btn { flex: 1; border-radius: 3px; font-size: 11px; }
        .homepage-editor__page-template-content .ant-btn-primary { border-color: #B8944E; background: #B8944E; }
        .homepage-editor__library-empty { padding: 40px 8px; color: #9B9389; font-size: 12px; text-align: center; }
        .homepage-editor__stage {
          position: relative;
          min-width: 0;
          min-height: 0;
          overflow: auto;
          padding: 54px 42px 84px;
          background: #F5F6FB;
        }
        .homepage-editor__stage-label {
          position: sticky;
          z-index: 2;
          top: -38px;
          width: max-content;
          max-width: 100%;
          margin: -36px auto 18px;
          padding: 6px 10px;
          border: 1px solid #E5E1DA;
          border-radius: 4px;
          color: #716A61;
          background: rgba(255, 255, 255, .88);
          font-size: 12px;
          box-shadow: 0 2px 6px rgba(54, 44, 28, .04);
          backdrop-filter: blur(8px);
        }
        .homepage-editor__stage-label span { color: #716A61; }
        .homepage-editor__canvas-controls {
          position: sticky;
          z-index: 4;
          top: 10px;
          display: flex;
          align-items: center;
          width: max-content;
          margin: -30px 0 14px auto;
          overflow: hidden;
          border: 1px solid #E4DED5;
          border-radius: 5px;
          background: rgba(255, 255, 255, .92);
          box-shadow: 0 3px 12px rgba(54, 44, 28, .08);
          backdrop-filter: blur(8px);
        }
        .homepage-editor__canvas-controls button,
        .homepage-editor__canvas-controls output {
          min-width: 32px;
          height: 32px;
          padding: 0 8px;
          border: 0;
          color: #7D756B;
          background: transparent;
          font-size: 11px;
          line-height: 32px;
          text-align: center;
        }
        .homepage-editor__canvas-controls button { cursor: pointer; }
        .homepage-editor__canvas-controls button:hover,
        .homepage-editor__canvas-controls button.is-active { color: #76592B; background: #FBF7EE; }
        .homepage-editor__canvas-controls output { min-width: 42px; border-right: 1px solid #EEE9E1; border-left: 1px solid #EEE9E1; color: #8C8275; }
        .homepage-editor__canvas-document { position: relative; min-width: 1px; min-height: 1px; margin: 0 auto; }
        .homepage-editor__canvas-scale { position: absolute; top: 0; left: 0; transform-origin: top left; }
        .homepage-editor__canvas-document.is-dragging { outline: 1px dashed rgba(184, 148, 78, .72); outline-offset: 8px; }
        .homepage-editor__drop-scrim {
          position: absolute;
          z-index: 6;
          inset: 0;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding-top: 18px;
          pointer-events: none;
          background: rgba(250, 248, 244, .48);
        }
        .homepage-editor__drop-scrim span {
          padding: 6px 10px;
          border: 1px solid rgba(184, 148, 78, .42);
          border-radius: 999px;
          color: #76592B;
          background: rgba(255, 255, 255, .92);
          font-size: 11px;
          box-shadow: 0 3px 10px rgba(84, 61, 27, .08);
        }
        .homepage-editor__drop-indicator {
          position: absolute;
          z-index: 7;
          right: 10px;
          left: 10px;
          height: 2px;
          pointer-events: none;
          background: #B8944E;
          box-shadow: 0 0 0 1px rgba(255, 255, 255, .94), 0 2px 8px rgba(119, 84, 28, .2);
          transform: translateY(-1px);
        }
        .homepage-editor__drop-indicator::before,
        .homepage-editor__drop-indicator::after {
          position: absolute;
          top: -3px;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #B8944E;
          content: "";
        }
        .homepage-editor__drop-indicator::before { left: -1px; }
        .homepage-editor__drop-indicator::after { right: -1px; }
        .homepage-editor__drop-indicator span {
          position: absolute;
          top: -22px;
          left: 50%;
          padding: 2px 7px;
          border-radius: 3px;
          color: #FFFFFF;
          background: #98743A;
          font-size: 10px;
          transform: translateX(-50%);
          white-space: nowrap;
        }
        .homepage-editor__preview-frame {
          width: 100%;
          margin: 0 auto;
          overflow: hidden;
          background: #FFFFFF;
          box-shadow: 0 12px 28px rgba(39, 49, 70, .12);
          isolation: isolate;
        }
        .homepage-editor__preview-frame.is-device {
          border: 1px solid #E2E6F0;
          border-radius: 5px;
          box-shadow: 0 10px 26px rgba(39, 49, 70, .12);
        }
        .homepage-editor__device-bar {
          display: none;
        }
        .homepage-editor__device-bar span { width: 4px; height: 4px; border-radius: 50%; background: #8B959F; }
.homepage-editor__preview-frame [class*="PuckPreview"] { height: 100% !important; min-height: 0 !important; }
        .homepage-editor__preview-frame .puck-root { margin: 0 !important; border: 0 !important; box-shadow: none !important; }
        .homepage-editor__preview-frame [class*="DraggableComponent--isSelected"] {
          position: relative;
          z-index: 1;
          outline: 2px solid #4D68F7;
          outline-offset: -2px;
          box-shadow: 0 0 0 3px rgba(77, 104, 247, .09);
        }
        .homepage-editor__preview-frame :is(img, video, embed, object) {
          position: relative !important;
          display: block;
          width: 100% !important;
          max-width: 100% !important;
          box-sizing: border-box;
        }
        .homepage-editor__preview-frame video { pointer-events: none; }
.homepage-editor__preview-frame iframe { display: block; width: 100%; height: 100% !important; min-height: 0; border: 0; }
        .homepage-media-spec {
          margin: 12px 12px 16px;
          padding: 12px;
          border: 1px solid #E8E0D4;
          border-radius: 5px;
          background: #FCFAF5;
        }
        .homepage-media-spec__heading { display: grid; gap: 3px; }
        .homepage-media-spec__heading span { color: #9C7B44; font-size: 10px; letter-spacing: .06em; }
        .homepage-media-spec__heading strong { color: #3A332A; font-size: 13px; }
        .homepage-media-spec > p { margin: 8px 0; color: #7D756B; font-size: 11px; line-height: 1.55; }
        .homepage-media-spec__viewport { margin-bottom: 8px; color: #695E50; font-size: 10px; line-height: 1.5; }
        .homepage-media-spec__slot { padding: 8px 0; border-top: 1px solid #EEE7DC; }
        .homepage-media-spec__slot:first-of-type { border-top: 0; }
        .homepage-media-spec__slot div { display: grid; gap: 2px; }
        .homepage-media-spec__slot strong { color: #51483D; font-size: 11px; font-weight: 600; }
        .homepage-media-spec__slot span { color: #989084; font-size: 10px; line-height: 1.4; }
        .homepage-media-spec__slot em { display: block; margin-top: 4px; color: #8B8378; font-size: 10px; font-style: normal; }
        .homepage-media-spec__slot em.is-good { color: #5C8C5F; }
        .homepage-media-spec__slot em.is-watch { color: #9A792E; }
        .homepage-media-spec__slot em.is-risk { color: #B15645; }
        .homepage-editor__canvas-empty {
          margin: 24px;
          padding: 56px 24px;
          border: 1px dashed #CAB98E;
          color: #8C8478;
          background: #FCFAF5;
          text-align: center;
        }
        .homepage-editor__canvas-empty strong { display: block; margin-bottom: 7px; color: #514A40; font-size: 14px; }
        .homepage-editor__canvas-empty span { font-size: 12px; }
        .homepage-editor__hidden-block {
          display: grid;
          place-items: center;
          min-height: 88px;
          margin: 8px 0;
          border: 1px dashed #C9B99B;
          color: #8B7A61;
          background: repeating-linear-gradient(-45deg, #FCFAF5, #FCFAF5 8px, #F8F4EC 8px, #F8F4EC 16px);
          font-size: 12px;
        }
        .homepage-editor__right-workspace {
          width: 204px;
          min-height: 0;
          display: grid;
          grid-template-columns: 204px 0;
          overflow: hidden;
          background: #FFFFFF;
          border-left: 1px solid #E8E4DC;
          transition: width .22s ease, grid-template-columns .22s ease;
        }
        .homepage-editor__body.is-inspecting .homepage-editor__right-workspace {
          width: clamp(564px, 38vw, 724px);
          grid-template-columns: 204px minmax(360px, 1fr);
        }
        .homepage-editor__layer-rail {
          min-width: 0;
          display: flex;
          flex-direction: column;
          background: #FFFFFF;
          border-right: 1px solid #ECE8E2;
        }
        .homepage-editor__layer-heading {
          min-height: 68px;
          box-sizing: border-box;
          padding: 17px 16px 13px;
          border-bottom: 1px solid #EEEAE4;
        }
        .homepage-editor__layer-heading span { display: block; color: #2C2721; font-size: 14px; font-weight: 600; }
        .homepage-editor__layer-heading small { display: block; margin-top: 4px; color: #A0978A; font-size: 11px; }
        .homepage-editor__layer-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 12px 10px 28px; }
        .homepage-editor__layer-item {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 4px;
          margin-bottom: 7px;
          padding: 4px;
          overflow: hidden;
          border: 1px solid transparent;
          border-radius: 4px;
          color: #676057;
          background: transparent;
        }
        .homepage-editor__layer-item:hover { background: #F8F6F1; }
        .homepage-editor__layer-item.is-active { border-color: #C5A461; color: #76531B; background: #FCF8EF; }
        .homepage-editor__layer-item.is-dragging { opacity: .45; }
        .homepage-editor__layer-item.is-drop-target { border-color: #B8944E; background: #FCF8EF; box-shadow: inset 0 2px 0 #B8944E; }
        .homepage-editor__layer-select {
          min-width: 0;
          flex: 1;
          display: flex;
          align-items: center;
          gap: 6px;
          min-height: 32px;
          padding: 0 3px;
          border: 0;
          color: inherit;
          background: transparent;
          font-size: 12px;
          text-align: left;
          cursor: pointer;
        }
        .homepage-editor__layer-select .anticon { color: #B5AEA4; font-size: 11px; }
        .homepage-editor__layer-select > span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .homepage-editor__layer-order { color: #A38B5B; font-family: ui-monospace, monospace; font-size: 10px; }
        .homepage-editor__layer-actions { display: none; align-items: center; gap: 1px; }
        .homepage-editor__layer-item:hover .homepage-editor__layer-actions,
        .homepage-editor__layer-item.is-active .homepage-editor__layer-actions { display: inline-flex; }
        .homepage-editor__layer-actions button {
          width: 24px;
          height: 24px;
          border: 0;
          border-radius: 3px;
          color: #8E8170;
          background: transparent;
          cursor: pointer;
        }
        .homepage-editor__layer-actions button:hover:not(:disabled),
        .homepage-editor__layer-actions button:focus-visible { color: #6C4B18; background: #F0E7D7; outline: none; }
        .homepage-editor__layer-actions button:disabled { cursor: not-allowed; opacity: .35; }
        .homepage-editor__layer-empty { padding: 28px 8px; color: #A0978A; font-size: 12px; line-height: 1.7; text-align: center; }
        .homepage-editor__properties {
          min-width: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: #FFFFFF;
        }
        .homepage-editor__properties-heading {
          min-height: 68px;
          box-sizing: border-box;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 13px 18px;
          border-bottom: 1px solid #EEEAE4;
        }
        .homepage-editor__properties-heading span { display: block; color: #9A9288; font-size: 11px; }
        .homepage-editor__properties-heading strong { display: block; max-width: 390px; margin-top: 3px; overflow: hidden; color: #2C2721; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
        .homepage-editor__close-panel {
          width: 28px;
          height: 28px;
          flex: 0 0 auto;
          border: 0;
          border-radius: 4px;
          color: #7B746B;
          background: #F7F5F1;
          cursor: pointer;
        }
        .homepage-editor__close-panel:hover { color: #6F4E18; background: #F3ECDE; }
        .homepage-editor__properties-scroll {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: 18px 20px 34px;
        }
        .homepage-editor__properties-section {
          margin-bottom: 14px;
          color: #4D463E;
          font-size: 13px;
          font-weight: 600;
        }
        .homepage-editor__media-status {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          margin: 0 0 16px;
          padding: 0 0 12px;
          border-bottom: 1px solid #EEEAE4;
        }
        .homepage-editor__media-status > .anticon { margin-top: 2px; color: #5C8C5F; font-size: 14px; }
        .homepage-editor__media-status > .anticon-exclamation-circle { color: #A77727; }
        .homepage-editor__media-status > div { display: grid; gap: 2px; }
        .homepage-editor__media-status strong { color: #4A4136; font-size: 12px; }
        .homepage-editor__media-status span { color: #8E867C; font-size: 11px; line-height: 1.45; }
        .homepage-editor__media-status button {
          justify-self: start;
          margin: 4px 0 0;
          padding: 0;
          border: 0;
          color: #88652A;
          background: transparent;
          cursor: pointer;
          font-size: 11px;
          text-decoration: underline;
          text-underline-offset: 3px;
        }
        .homepage-editor__media-status button:hover { color: #634313; }
        .homepage-editor__media-details { margin: 24px 0 0; border-top: 1px solid #EEEAE4; }
        .homepage-editor__media-details summary {
          display: flex;
          align-items: center;
          justify-content: space-between;
          min-height: 40px;
          color: #766D62;
          cursor: pointer;
          font-size: 12px;
          list-style: none;
        }
        .homepage-editor__media-details summary::-webkit-details-marker { display: none; }
        .homepage-editor__media-details summary::after { color: #A38B5B; content: "+"; font-size: 16px; font-weight: 300; }
        .homepage-editor__media-details[open] summary::after { content: "−"; }
        .homepage-editor__media-details .homepage-media-spec { margin: 0 0 12px; }
        .homepage-editor__properties-scroll [data-puck-fields] { font-size: 13px; }
        .homepage-editor__properties-scroll input,
        .homepage-editor__properties-scroll textarea,
        .homepage-editor__properties-scroll select {
          border-color: #DED8CE !important;
          border-radius: 3px !important;
        }
        .homepage-editor__product-picker {
          display: grid;
          gap: 10px;
          min-width: 0;
          color: #3C352C;
          font-size: 12px;
        }
        .homepage-editor__product-picker-search input {
          width: 100%;
          height: 32px;
          box-sizing: border-box;
          padding: 0 10px;
          border: 1px solid #DED8CE;
          border-radius: 3px;
          outline: none;
          background: #FFFFFF;
          color: #2C2721;
        }
        .homepage-editor__product-picker-search input:focus {
          border-color: #B8944E;
          box-shadow: 0 0 0 2px rgba(184, 148, 78, .14);
        }
        .homepage-editor__product-picker-results,
        .homepage-editor__product-picker-selected {
          display: grid;
          gap: 7px;
          min-width: 0;
        }
        .homepage-editor__product-picker-results {
          max-height: 230px;
          overflow-y: auto;
          padding-right: 2px;
        }
        .homepage-editor__product-picker-title {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding-top: 2px;
          color: #4B4237;
          font-weight: 600;
        }
        .homepage-editor__product-picker-title span {
          color: #9A9288;
          font-size: 11px;
          font-weight: 500;
        }
        .homepage-editor__product-picker-row,
        .homepage-editor__product-picker-selected-row {
          width: 100%;
          min-width: 0;
          box-sizing: border-box;
          display: grid;
          grid-template-columns: 42px minmax(0, 1fr) auto;
          align-items: center;
          gap: 8px;
          min-height: 52px;
          padding: 6px;
          border: 1px solid #EEE9E1;
          border-radius: 4px;
          background: #FFFFFF;
          color: inherit;
        }
        .homepage-editor__product-picker-row {
          cursor: pointer;
          text-align: left;
        }
        .homepage-editor__product-picker-row:hover:not(:disabled) {
          border-color: #CDB981;
          background: #FCF8EF;
        }
        .homepage-editor__product-picker-row:disabled {
          cursor: default;
          opacity: .62;
        }
        .homepage-editor__product-picker-row img,
        .homepage-editor__product-picker-selected-row img {
          width: 42px;
          height: 42px;
          border-radius: 3px;
          object-fit: cover;
          background: #F3F0EA;
        }
        .homepage-editor__product-picker-row span,
        .homepage-editor__product-picker-selected-row span {
          min-width: 0;
          display: grid;
          gap: 3px;
        }
        .homepage-editor__product-picker-row strong,
        .homepage-editor__product-picker-selected-row strong,
        .homepage-editor__product-picker-row small,
        .homepage-editor__product-picker-selected-row small {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .homepage-editor__product-picker-row strong,
        .homepage-editor__product-picker-selected-row strong {
          color: #2C2721;
          font-size: 12px;
          font-weight: 600;
        }
        .homepage-editor__product-picker-row small,
        .homepage-editor__product-picker-selected-row small {
          color: #958B7E;
          font-size: 11px;
        }
        .homepage-editor__product-picker-row em {
          justify-self: end;
          color: #9A6B22;
          font-size: 11px;
          font-style: normal;
          white-space: nowrap;
        }
        .homepage-editor__product-picker-selected-row {
          grid-template-columns: 42px minmax(0, 1fr);
        }
        .homepage-editor__product-picker-selected-row > div {
          grid-column: 1 / -1;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 5px;
        }
        .homepage-editor__product-picker-selected-row button {
          height: 26px;
          border: 1px solid #E1D8C8;
          border-radius: 3px;
          background: #FBFAF7;
          color: #6A5C49;
          font-size: 11px;
          cursor: pointer;
        }
        .homepage-editor__product-picker-selected-row button:hover:not(:disabled) {
          border-color: #B8944E;
          color: #76531B;
          background: #FBF7EE;
        }
        .homepage-editor__product-picker-selected-row button:disabled {
          cursor: default;
          opacity: .45;
        }
        .homepage-editor__product-picker-note {
          min-height: 38px;
          box-sizing: border-box;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 9px 10px;
          border: 1px dashed #DDD5C8;
          border-radius: 4px;
          color: #948A7E;
          background: #FCFBF8;
          text-align: center;
        }
        .homepage-editor__product-picker-note.is-error {
          border-color: #E0B8A7;
          color: #A24324;
          background: #FFF8F5;
        }
        .homepage-editor__properties-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          padding: 12px 18px;
          border-top: 1px solid #EEEAE4;
          background: #FFFFFF;
        }
        .homepage-editor__properties-actions .ant-btn { border-radius: 3px; }
        .homepage-editor__properties-actions span { align-self: center; margin-right: auto; color: #8D8375; font-size: 11px; }
        .homepage-editor button:focus-visible,
        .homepage-editor input:focus-visible,
        .homepage-editor textarea:focus-visible,
        .homepage-editor select:focus-visible { outline: 2px solid rgba(184, 148, 78, .72); outline-offset: 2px; }
        @media (max-width: 1500px) {
          .homepage-editor__body { grid-template-columns: 248px minmax(0, 1fr) auto; }
          .homepage-editor__body.is-inspecting .homepage-editor__right-workspace {
            position: absolute;
            z-index: 8;
            top: 0;
            right: 0;
            bottom: 0;
            width: min(564px, calc(100vw - 220px));
            box-shadow: -12px 0 30px rgba(33, 27, 19, .16);
          }
          .homepage-editor__toolbar { grid-template-columns: minmax(180px, 1fr) auto minmax(220px, 1fr); gap: 10px; padding: 0 16px; }
        }
        @media (max-width: 980px) {
          .homepage-editor__body { grid-template-columns: 220px minmax(0, 1fr) 204px; }
          .homepage-editor__body.is-inspecting .homepage-editor__right-workspace { width: min(564px, calc(100vw - 56px)); }
          .homepage-editor__toolbar-context > span:not(.homepage-editor__save-status),
          .homepage-editor__toolbar-divider { display: none; }
          .homepage-editor__toolbar-actions .ant-btn > span:not(.anticon) { display: none; }
          .homepage-editor__toolbar-actions .ant-btn { min-width: 34px; padding-inline: 8px; }
        }
      `}</style>

      <RevisionDrawer
        open={revisionsOpen}
        revisions={revisions}
        loading={revisionsLoading}
        restoringVersion={restoringVersion}
        onClose={() => setRevisionsOpen(false)}
        onRestore={restoreRevision}
      />

      <Puck
        key={editorKey}
        config={editorConfig}
        data={data}
        viewports={VIEWPORT_PRESETS}
        iframe={{ enabled: true, waitForStyles: true, syncHostStyles: true }}
        onPublish={(nextData) => {
          setData(nextData);
          latestData.current = nextData;
        }}
        overrides={{
          header: () => <span style={{ display: "none" }} />,
          headerActions: () => <span style={{ display: "none" }} />,
        }}
      >
        <EditorToolbar
          lastSaved={lastSaved}
          publishing={publishing}
          hasUnsavedChanges={hasUnsavedChanges}
          autoSaveState={autoSaveState}
          onPublish={publishHome}
          onOpenRevisions={openRevisions}
          onDataChange={trackEditorData}
        />
        <EditorBody onSaveAsTemplate={saveBlockAsTemplate} />
      </Puck>
    </div>
  );
}
