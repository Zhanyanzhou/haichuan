import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
  type ReactNode,
} from "react";
import { App as AntdApp, Button, Input, Spin } from "antd";
import {
  AppstoreOutlined,
  BlockOutlined,
  CheckCircleOutlined,
  ControlOutlined,
  CopyOutlined,
  DeleteOutlined,
  DragOutlined,
  EditOutlined,
  EyeOutlined,
  ExclamationCircleOutlined,
  LeftOutlined,
  MenuOutlined,
  RightOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { Puck, type PuckAction, type UiState } from "@puckeditor/core";
import { useNavigate } from "react-router-dom";
import { canAccessAdminRoute } from "@/config/adminRouteAccess";
import { useAuthStore } from "@/store/authStore";
import "@puckeditor/core/puck.css";
import { puckConfig } from "@/page-builder/config/puckConfig";
import { BusinessRegionCanvasProvider } from "@/page-builder/adapters/businessRegion.puck";
import {
  BLOCK_META,
  BLOCK_PREVIEW_KIND,
  BLOCK_CATEGORIES,
  TEMPLATE_MEDIA_HINT,
  isContentTemplateInsertable,
  type BlockMeta,
} from "@/page-builder/config/blockMeta";
import {
  pageDocumentApi,
  personalContentTemplateApi,
  type PersonalContentTemplate,
} from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import { IMAGE_SPECS } from "@/page-builder/config/imageSpecs";
import { RESPONSIVE_CANVAS } from "@/page-builder/config/blockContracts";
import {
  blockTemplateStore,
  type BlockTemplate,
} from "@/page-builder/templates/blockTemplateStore";
import StorefrontNavigation from "@/components/layout/StorefrontNavigation";
import StorefrontFooter from "@/components/layout/StorefrontFooter";
import {
  PublicSiteSettingsProvider,
  usePublicSiteSettings,
  usePublicSiteSettingsResource,
} from "@/hooks/usePublicSiteSettings";
import SchemaInspectorPanel from "@/page-builder/inspector/SchemaInspectorPanel";
import DoublePosterInspector from "@/page-builder/inspector/panels/DoublePosterInspector";
import { getInspectorSchema } from "@/page-builder/inspector/schema/registry";
import {
  createEditorPageDefault,
  ensureEditorPageStructure,
  getEditorPage,
  getEditorPageByPath,
  resolvePageHeaderMode,
  type EditorPageKey,
} from "@/page-builder/config/editorPages";
import { migratePuckData } from "@/page-builder/utils/migratePuckData";
import ContentTemplateRendererPreview from "@/page-builder/preview/ContentTemplateRendererPreview";
import {
  createContentTemplateMarker,
  extractContentTemplateDefaultContent,
  extractContentTemplateLayoutData,
  getContentTemplatePreview,
  isContentTemplateAllowedForPage,
  sanitizeContentTemplateDefaultContent,
  sanitizeContentTemplateLayoutData,
  type ContentTemplateMediaRight,
} from "@/page-builder/generated/contentTemplates.generated";
import { isVisualRecord } from "@/page-builder/runtime/visualLayout";
import {
  MissingMediaState,
  normalizeLegacyRenderColors,
  useHasMissingAssets,
} from "@/page-builder/runtime/renderParity";
import {
  CANVAS_VISUAL_EDIT_MESSAGE,
  type CanvasVisualEditMessage,
} from "@/page-builder/visual-editor/visualEditorSession";
import "./editor.css";
import EditorToolbar, { VIEWPORT_PRESETS } from "./components/EditorToolbar";
import UnsavedChangesGuard from "./components/UnsavedChangesGuard";
import LayerRail from "./components/LayerRail";
import CanvasSelectionDock, {
  CanvasSelectionOverlay,
} from "./components/CanvasSelectionDock";
import RevisionDrawer from "./components/RevisionDrawer";
import PageSettingsDrawer from "./components/PageSettingsDrawer";
import CanvasBlockInteractionBoundary from "./components/CanvasBlockInteractionBoundary";
import {
  ROOT_ZONE,
  useHomepagePuck,
  focusCanvasBlock,
  setCanvasNavigationPreview,
  CANVAS_FOCUS_MESSAGE,
  CANVAS_HEIGHT_MESSAGE,
  CANVAS_NAVIGATION_MESSAGE,
  CANVAS_NAVIGATION_STATE_MESSAGE,
  CANVAS_PAGE_NAVIGATION_MESSAGE,
  type PageDocumentRevision,
  type PageDraftSnapshot,
  type PageSessionCache,
  type CanvasFocusMessage,
  type CanvasHeightMessage,
  type CanvasNavigationMessage,
  type CanvasNavigationStateMessage,
  type CanvasPageNavigationMessage,
} from "./editor-store";
import {
  getModuleDisplayName,
  formatEditorTime,
  getEditorErrorMessage,
  getEditorHttpStatus,
  canonicalizePuckContent,
  canonicalizePageContent,
} from "./editor-utils";

const HiddenPuckHeader = () => <span style={{ display: "none" }} />;

// Puck 把 override 函数视为组件类型。若在 JSX 内联创建，编辑器父层因
// 图层排序、滚动定位等状态重渲染时会反复卸载选区操作组，导致按钮抖动
// 或短暂消失。保持同一组件与对象引用，让原子 action 只更新必要节点。
const HOMEPAGE_EDITOR_OVERRIDES = {
  header: HiddenPuckHeader,
  headerActions: HiddenPuckHeader,
  componentOverlay: CanvasSelectionOverlay,
};

// 固定由顶部设备切换器控制预览尺寸，避免 Puck 根据浏览器窗口宽度回写为桌面端。
const INITIAL_EDITOR_UI: Partial<UiState> = {
  viewports: {
    current: {
      width: RESPONSIVE_CANVAS.desktop.width,
      height: RESPONSIVE_CANVAS.desktop.height,
    },
    options: [],
    controlsVisible: false,
  },
};

/**
 * 图层定位与画布滚动共用的安全距离：避开画布内固定缩放控件后，
 * 以内容可视区上缘作为当前浏览模块的判定线。
 */
const CANVAS_SCROLL_SPY_TOP_OFFSET = 24;

let blockIdSequence = 0;
const PERSONAL_TEMPLATE_CHANGED_EVENT = "haichuan:personal-template-changed";

/**
 * 脏标记比较签名:只取 content 的规范化形态(忽略 block id 与键序、不含 zones/ui)。
 * JSON 全等比较会让 Puck 首帧 normalize(补默认键/重排)被误判为用户修改,
 * 导致每次进入编辑器都显示"有未保存修改"并触发离开拦截(2026-08-18 实测修复)。
 */
function dataSignature(data: unknown): string {
  return canonicalizePuckContent(data);
}

function createBlockContent(type: string): {
  type: string;
  props: Record<string, any>;
} {
  const component = (
    puckConfig.components as Record<
      string,
      { defaultProps?: Record<string, unknown> }
    >
  )[type];
  // 统一注入合同印记(2026-08-18 P2):所有新插入块带显式 key/version,
  // 历史无印记块的 legacy-0 兼容只出现在旧数据上。
  const templateMarker = createContentTemplateMarker(type);
  return {
    type,
    props: {
      ...component?.defaultProps,
      ...(templateMarker ? { __contentTemplate: templateMarker } : {}),
      id: `homepage-block-${Date.now()}-${blockIdSequence++}`,
      locked: false,
    },
  };
}

/**
 * 使用 Puck 的局部 action 插入已经准备好的合同模块。
 * insert 先建立节点和索引但不记历史，replace 再写入合同印记与实例布局并记录；
 * 这样一次用户插入仍只有一条可撤销历史，也不再用 setData 重建整棵页面树。
 */
function insertPreparedBlock(
  dispatch: (action: PuckAction) => void,
  block: { type: string; props: Record<string, any> },
  destinationIndex: number,
) {
  const id = String(block.props.id);
  const preparedBlock = {
    ...block,
    props: { ...block.props, id },
  };
  dispatch({
    type: "insert",
    componentType: block.type,
    destinationIndex,
    destinationZone: ROOT_ZONE,
    id,
    recordHistory: false,
  });
  dispatch({
    type: "replace",
    destinationIndex,
    destinationZone: ROOT_ZONE,
    data: preparedBlock,
    recordHistory: true,
  });
}

function EditorCanvasFooter() {
  const { settings: siteSettings } = usePublicSiteSettings();
  const siteName = siteSettings?.siteName || "海川珠宝";
  return <StorefrontFooter siteName={siteName} preview />;
}

function EditorCanvasShell({
  children,
  pageKey,
}: {
  children: ReactNode;
  pageKey: EditorPageKey;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const siteSettingsResource = usePublicSiteSettingsResource();
  const currentViewport = useHomepagePuck(
    (state) => state.appState.ui.viewports.current,
  );
  const canvasData = useHomepagePuck((state) => state.appState.data);
  const headerMode = resolvePageHeaderMode(pageKey, canvasData);
  const businessRegionIndex = canvasData.content.findIndex(
    (block: { type?: string }) => block?.type === "业务功能区",
  );
  const hasLeadingDecoration =
    businessRegionIndex > 0 &&
    canvasData.content
      .slice(0, businessRegionIndex)
      .some(
        (block) =>
          (block.props as { isVisible?: boolean } | undefined)?.isVisible !==
          false,
      );
  const previewViewportHeight =
    currentViewport.height === "auto"
      ? RESPONSIVE_CANVAS.desktop.height
      : currentViewport.height;

  useEffect(() => {
    const root = rootRef.current;
    const frameWindow = root?.ownerDocument.defaultView;
    if (!frameWindow || frameWindow === window) return;

    const handleNavigationPreview = (
      event: MessageEvent<CanvasNavigationMessage>,
    ) => {
      if (
        event.source !== frameWindow.parent ||
        event.data?.type !== CANVAS_NAVIGATION_MESSAGE
      )
        return;
      setMenuOpen(event.data.open);
    };
    frameWindow.addEventListener("message", handleNavigationPreview);
    return () =>
      frameWindow.removeEventListener("message", handleNavigationPreview);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    const frameWindow = root?.ownerDocument.defaultView;
    if (!frameWindow || frameWindow === window) return;
    frameWindow.parent.postMessage(
      {
        type: CANVAS_NAVIGATION_STATE_MESSAGE,
        open: menuOpen,
      } satisfies CanvasNavigationStateMessage,
      "*",
    );
  }, [menuOpen]);

  return (
    <PublicSiteSettingsProvider resource={siteSettingsResource}>
    <div
      ref={rootRef}
      className="homepage-editor__storefront-frame"
      style={
        {
          "--homepage-editor-preview-height": `${previewViewportHeight}px`,
        } as any
      }
    >
      <StorefrontNavigation
        isHome={pageKey === "home"}
        headerMode={headerMode}
        preview
        menuOpen={menuOpen}
        onMenuOpenChange={setMenuOpen}
        onPreviewNavigate={(path) => {
          const frameWindow = rootRef.current?.ownerDocument.defaultView;
          frameWindow?.parent.postMessage(
            {
              type: CANVAS_PAGE_NAVIGATION_MESSAGE,
              path,
            } satisfies CanvasPageNavigationMessage,
            "*",
          );
        }}
      />
      <BusinessRegionCanvasProvider
        hasLeadingDecoration={hasLeadingDecoration}
      >
        {children}
      </BusinessRegionCanvasProvider>
      <EditorCanvasFooter />
    </div>
    </PublicSiteSettingsProvider>
  );
}

/**
 * 画布素材守卫（2026-08-21）：与公开端 GuardedBlock 共用同一套 /uploads/ 探测规则。
 * 素材被删除后，画布与前台一致显示占位（避免"前台占位、画布破图"的两张面孔），
 * 同时提示可在右侧属性面板重新选择素材；选中/编辑能力不受影响。
 */
function CanvasMediaGuard({
  blockType,
  blockProps,
  children,
}: {
  blockType: string;
  blockProps: Record<string, any>;
  children: ReactNode;
}) {
  const hasMissingAsset = useHasMissingAssets(blockProps);
  if (hasMissingAsset) {
    return (
      <MissingMediaState
        type={blockType}
        hint="与前台显示一致：素材文件已缺失，请在右侧属性面板重新选择素材。"
      />
    );
  }
  return <>{children}</>;
}

function CanvasBlockAnchor({
  blockId,
  blockType,
  children,
}: {
  blockId?: string;
  blockType: string;
  children: ReactNode;
}) {  const anchorRef = useRef<HTMLDivElement>(null);
  const clearFocusTimer = useRef<number | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const currentViewport = useHomepagePuck(
    (state) => state.appState.ui.viewports.current,
  );
  const dispatch = useHomepagePuck((state) => state.dispatch);
  const selectedBlockId = useHomepagePuck(
    (state) => state.selectedItem?.props?.id,
  );
  const editorViewportHeight =
    currentViewport.height === "auto"
      ? RESPONSIVE_CANVAS.desktop.height
      : currentViewport.height;

  useEffect(() => {
    const anchor = anchorRef.current;
    // Puck 通过 Portal 将节点渲染进 iframe，但 React effect 仍在宿主页面执行。
    // 因此必须从节点所属 document 取得 iframe window，而不是直接使用全局 window。
    const frameWindow = anchor?.ownerDocument.defaultView;
    if (!blockId || !anchor || !frameWindow || frameWindow === window) return;

    const handleFocusMessage = (event: MessageEvent<CanvasFocusMessage>) => {
      if (event.source !== frameWindow.parent) return;
      const detail = event.data;
      if (detail?.type !== CANVAS_FOCUS_MESSAGE || detail.blockId !== blockId)
        return;

      // 宿主层的 focusCanvasBlock 已在唯一画布滚动容器内完成定位。
      // iframe 内再次 scrollIntoView 会跨浏览上下文触发第二次滚动，属性更新
      // 或缩放画布时容易把当前模块错误地推离视口，因此这里只显示定位反馈。
      setIsFocused(true);
      if (clearFocusTimer.current)
        frameWindow.clearTimeout(clearFocusTimer.current);
      clearFocusTimer.current = frameWindow.setTimeout(
        () => setIsFocused(false),
        1800,
      );
    };

    frameWindow.addEventListener("message", handleFocusMessage);
    return () => {
      frameWindow.removeEventListener("message", handleFocusMessage);
      if (clearFocusTimer.current)
        frameWindow.clearTimeout(clearFocusTimer.current);
    };
  }, [blockId]);

  useEffect(() => {
    const anchor = anchorRef.current;
    const frameWindow = anchor?.ownerDocument.defaultView;
    if (!anchor || !frameWindow || frameWindow === window) return;

    // iframe 被内容撑高后，svh/vh 会随 iframe 高度变化，进而使模块再次变高。
    // 使用编辑器当前设备预设，而不是 iframe 的实时高度，保证切换设备后比例仍准确且整页高度稳定。
    const viewportHeight = Math.max(1, Math.round(editorViewportHeight));
    anchor.style.setProperty(
      "--homepage-editor-viewport-height",
      `${viewportHeight}px`,
    );
    anchor.style.setProperty(
      "--homepage-editor-single-height",
      `${Math.round(viewportHeight * 1.1)}px`,
    );
    anchor.style.setProperty(
      "--homepage-editor-single-image-height",
      `${Math.min(860, Math.round(viewportHeight * 0.76))}px`,
    );
    anchor.style.setProperty(
      "--homepage-editor-single-copy-offset",
      `${Math.round(viewportHeight * 0.22)}px`,
    );
    anchor.style.setProperty(
      "--homepage-editor-double-height",
      `${Math.round(viewportHeight * 1.18)}px`,
    );
    anchor.style.setProperty(
      "--homepage-editor-double-main-height",
      `${Math.min(900, Math.max(560, Math.round(viewportHeight * 0.8)))}px`,
    );
    anchor.style.setProperty(
      "--homepage-editor-double-detail-height",
      `${Math.min(520, Math.max(320, Math.round(viewportHeight * 0.48)))}px`,
    );
    anchor.style.setProperty(
      "--homepage-editor-bleed-height",
      `${Math.round(viewportHeight * 0.9)}px`,
    );
    anchor.style.setProperty(
      "--homepage-editor-bleed-bottom-padding",
      `${Math.min(80, Math.max(38, Math.round(viewportHeight * 0.07)))}px`,
    );
  }, [editorViewportHeight]);

  useEffect(() => {
    const anchor = anchorRef.current;
    const frameWindow = anchor?.ownerDocument.defaultView;
    if (!anchor || !frameWindow || frameWindow === window) return;

    const reportCanvasHeight = () => {
      // 不能直接量 documentElement.scrollHeight：iframe 文档的根元素高度
      // 至少等于 iframe 视口高度，而视口高度又由宿主按上报值回填，
      // 会形成“视口越高、文档越高”的循环，导致页脚下方多出大段空白。
      // 这里以画布内容壳（storefront-frame）的实际高度为准。
      const contentShell =
        anchor.closest<HTMLElement>(".homepage-editor__storefront-frame") ??
        anchor.ownerDocument.querySelector<HTMLElement>(
          ".homepage-editor__storefront-frame",
        );
      const documentHeight = Math.ceil(
        Math.max(
          contentShell?.scrollHeight || 0,
          contentShell?.offsetHeight || 0,
        ),
      );
      if (documentHeight <= 0) return;
      frameWindow.parent.postMessage(
        {
          type: CANVAS_HEIGHT_MESSAGE,
          height: documentHeight,
        } satisfies CanvasHeightMessage,
        "*",
      );
    };

    // 锚点位于 Puck 的 iframe document，使用其自身的 ResizeObserver 才能稳定监听尺寸变化。
    const observer = new frameWindow.ResizeObserver(reportCanvasHeight);
    observer.observe(anchor);
    reportCanvasHeight();
    const delayedReport = frameWindow.setTimeout(reportCanvasHeight, 80);
    return () => {
      observer.disconnect();
      frameWindow.clearTimeout(delayedReport);
    };
  }, []);

  const requestCanvasSelection = () => {
    const anchor = anchorRef.current;
    const frameWindow = anchor?.ownerDocument.defaultView;
    const puckBlock = anchor?.closest<HTMLElement>("[data-puck-component]");
    if (!blockId || !frameWindow || !puckBlock) return;

    setIsFocused(true);
    if (clearFocusTimer.current)
      frameWindow.clearTimeout(clearFocusTimer.current);
    clearFocusTimer.current = frameWindow.setTimeout(
      () => setIsFocused(false),
      1800,
    );

    const blockIndex = Array.from(
      puckBlock.ownerDocument.querySelectorAll<HTMLElement>(
        "[data-puck-component]",
      ),
    ).indexOf(puckBlock);
    // Puck 会在当前 pointerdown/click 收尾时同步自身的 itemSelector；
    // 因此模块选择必须等它完成后再落位。视觉节点选择由独立 store 保留，
    // 新 Inspector 挂载后会直接读取同一 blockId 的节点上下文。
    window.setTimeout(() => {
      if (blockIndex < 0) return;
      dispatch({
        type: "setUi",
        ui: { itemSelector: { index: blockIndex, zone: ROOT_ZONE } },
      });
    }, 60);
  };

  return (
    <CanvasBlockInteractionBoundary
      ref={anchorRef}
      blockId={blockId}
      blockType={blockType}
      blockLabel={BLOCK_META[blockType]?.name ?? blockType}
      focused={isFocused}
      selected={selectedBlockId === blockId}
      scrollMarginTop={CANVAS_SCROLL_SPY_TOP_OFFSET * 2 + 32}
      onSelect={requestCanvasSelection}
    >
      {children}
    </CanvasBlockInteractionBoundary>
  );
}

/** 保持 Puck 编辑器实例常驻，仅在页面切换时替换内部画布数据。 */
function CanvasPageDataSynchronizer({
  data,
  pageKey,
  canvasDataSyncVersion,
}: {
  data: any;
  pageKey: EditorPageKey;
  canvasDataSyncVersion: number;
}) {
  const dispatch = useHomepagePuck((state) => state.dispatch);
  const currentData = useHomepagePuck((state) => state.appState.data);
  const appliedSignatureRef = useRef<string | null>(null);
  const mountedWithInitialDataRef = useRef(false);
  const consumedCanvasDataSyncVersionRef = useRef(canvasDataSyncVersion);
  const dataSignature = useMemo(() => JSON.stringify(data), [data]);
  const currentDataSignature = useMemo(
    () => JSON.stringify(currentData),
    [currentData],
  );

  useEffect(() => {
    const signature = `${pageKey}:${dataSignature}`;
    // Puck 0.22.4 在 Provider 挂载时已经读取 data 并完成 walkAppState 归一化。
    // 归一化后的 store 与原始 data JSON 不同并不代表页面发生了外部切换；
    // 首帧再次 setData 只会重复整树遍历。后续切页、恢复版本等 data 变化
    // 仍由下方同步逻辑完成必要的整页替换。
    if (!mountedWithInitialDataRef.current) {
      mountedWithInitialDataRef.current = true;
      appliedSignatureRef.current = signature;
      return;
    }
    // 工具栏已经先把同一整页数据写入 Puck store，再同步父层 data prop。
    // 该版本只用于确认这次父层变化已由内部 action 消费，避免重复 setData。
    if (consumedCanvasDataSyncVersionRef.current !== canvasDataSyncVersion) {
      consumedCanvasDataSyncVersionRef.current = canvasDataSyncVersion;
      appliedSignatureRef.current = signature;
      return;
    }
    if (appliedSignatureRef.current === signature) return;
    appliedSignatureRef.current = signature;
    // Puck 已以同一份数据挂载时不重复执行昂贵的整页替换；页面切换时
    // currentDataSignature 与目标签名不同，仍会走 setData 完成必要同步。
    if (currentDataSignature === dataSignature) return;
    dispatch({ type: "setData", data });
    dispatch({ type: "setUi", ui: { itemSelector: null } });
  }, [canvasDataSyncVersion, currentDataSignature, data, dataSignature, dispatch, pageKey]);

  return null;
}

/**
 * 模块卡片不使用真实商品素材，而用“布局微缩图”展示该区块插入后的结构。
 * 这让用户先理解版式和内容层级，再决定是否添加。
 */
const PREVIEW_COLORS = {
  surface: "#FFFFFF",
  ink: "#181A1B",
  muted: "#6E7477",
  line: "#DDE1E2",
  media: "#DDE1E2",
  mediaDeep: "#B8BEC1",
  accent: "#181A1B",
  dark: "#111315",
  light: "#FFFFFF",
};

function PreviewText({
  x,
  y,
  width,
  lines = 3,
  inverse = false,
}: {
  x: number;
  y: number;
  width: number;
  lines?: number;
  inverse?: boolean;
}) {
  const color = inverse ? "rgba(255,255,255,.92)" : PREVIEW_COLORS.ink;
  const soft = inverse ? "rgba(255,255,255,.56)" : PREVIEW_COLORS.muted;
  return (
    <g aria-hidden="true">
      <rect x={x} y={y} width={width} height="9" rx="2" fill={color} />
      {Array.from(
        { length: Math.min(2, Math.max(0, lines - 1)) },
        (_, index) => (
          <rect
            key={index}
            x={x}
            y={y + 18 + index * 8}
            width={width * (index === 1 ? 0.62 : 0.84)}
            height="3"
            rx="2"
            fill={soft}
          />
        ),
      )}
    </g>
  );
}

function PreviewMedia({
  x,
  y,
  width,
  height,
  dark = false,
  label = "图片",
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  dark?: boolean;
  label?: string;
}) {
  const base = dark ? "#5F6568" : PREVIEW_COLORS.media;
  const detail = dark ? "#6E7477" : PREVIEW_COLORS.mediaDeep;
  return (
    <g aria-hidden="true">
      <rect x={x} y={y} width={width} height={height} rx="4" fill={base} />
      <rect
        x={x + 8}
        y={y + 8}
        width={Math.max(0, width - 16)}
        height={Math.max(0, height - 16)}
        rx="2"
        fill={detail}
        opacity=".2"
      />
      <path
        d={`M${x + 10} ${y + height - 10} L${x + width - 10} ${y + 10}`}
        stroke={dark ? "rgba(255,255,255,.36)" : "rgba(24,26,27,.16)"}
        strokeWidth="1"
      />
    </g>
  );
}

function PreviewCard({
  x,
  y,
  width,
  height,
  kind = "product",
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  kind?: "product" | "article" | "service" | "quote";
}) {
  const mediaHeight =
    kind === "article" ? height * 0.42 : kind === "service" ? 0 : height * 0.58;
  return (
    <g aria-hidden="true">
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx="4"
        fill={PREVIEW_COLORS.light}
        stroke={PREVIEW_COLORS.line}
      />
      {kind === "service" ? (
        <>
          <circle
            cx={x + width / 2}
            cy={y + 19}
            r="10"
            fill="#F4F5F5"
            stroke={PREVIEW_COLORS.accent}
          />
          <circle
            cx={x + width / 2}
            cy={y + 19}
            r="3"
            fill={PREVIEW_COLORS.accent}
          />
          <rect
            x={x + 10}
            y={y + 39}
            width={width - 20}
            height="5"
            rx="2.5"
            fill={PREVIEW_COLORS.ink}
          />
          <rect
            x={x + 16}
            y={y + 50}
            width={width - 32}
            height="4"
            rx="2"
            fill={PREVIEW_COLORS.muted}
          />
        </>
      ) : kind === "quote" ? (
        <>
          <circle cx={x + 19} cy={y + 20} r="9" fill={PREVIEW_COLORS.media} />
          <rect
            x={x + 10}
            y={y + 43}
            width={width - 20}
            height="5"
            rx="2"
            fill={PREVIEW_COLORS.ink}
          />
          <rect
            x={x + 10}
            y={y + 54}
            width={width - 28}
            height="4"
            rx="2"
            fill={PREVIEW_COLORS.muted}
          />
          <rect
            x={x + 10}
            y={y + height - 14}
            width={width * 0.36}
            height="4"
            rx="2"
            fill={PREVIEW_COLORS.accent}
          />
        </>
      ) : (
        <>
          <PreviewMedia
            x={x + 5}
            y={y + 5}
            width={width - 10}
            height={mediaHeight - 5}
            label={kind === "article" ? "内容" : "商品"}
          />
          <rect
            x={x + 8}
            y={y + mediaHeight + 8}
            width={width - 16}
            height="5"
            rx="2"
            fill={PREVIEW_COLORS.ink}
          />
          <rect
            x={x + 8}
            y={y + mediaHeight + 18}
            width={width * 0.48}
            height="4"
            rx="2"
            fill={PREVIEW_COLORS.accent}
          />
        </>
      )}
    </g>
  );
}

/** 内容模板卡片使用机器合同结构缩略图；非合同模块仍保留旧分类图示。 */
function BlockTemplateVisual({ name, viewport = "desktop" }: { name: string; viewport?: "desktop" | "mobile" }) {
  if (getContentTemplatePreview(name)) {
    return <ContentTemplateRendererPreview moduleType={name} viewport={viewport} variant="structure" />;
  }
  const kind = BLOCK_PREVIEW_KIND[name] ?? "hero";
  let content: ReactNode;
  let background = PREVIEW_COLORS.surface;

  switch (kind) {
    case "hero":
      background = PREVIEW_COLORS.dark;
      content = (
        <>
          <rect
            x="18"
            y="20"
            width="264"
            height="4"
            rx="2"
            fill="rgba(255,255,255,.48)"
          />
          <PreviewMedia x={14} y={47} width={272} height={153} dark />
          <PreviewText x={29} y={144} width={115} lines={3} inverse />
          <rect
            x={29}
            y="183"
            width="47"
            height="11"
            rx="2"
            fill={PREVIEW_COLORS.accent}
          />
          <rect
            x="111"
            y="234"
            width="78"
            height="139"
            rx="4"
            fill="#5f6568"
            opacity=".58"
          />
          <rect
            x="121"
            y="244"
            width="58"
            height="103"
            rx="3"
            fill="#6E7477"
            opacity=".52"
          />
        </>
      );
      break;
    case "single-poster":
      content = (
        <>
          <PreviewText x={21} y={52} width={72} lines={3} />
          <rect
            x={21}
            y="94"
            width="43"
            height="11"
            rx="2"
            fill="none"
            stroke={PREVIEW_COLORS.accent}
          />
          <PreviewMedia x={110} y={42} width={171} height={114} />
          <rect x="17" y="192" width="266" height="177" rx="4" fill="#ECEEEF" />
          <PreviewMedia x={30} y={211} width={140} height={93} />
          <PreviewText x={190} y={233} width={66} lines={2} />
        </>
      );
      break;
    case "double-poster":
      content = (
        <>
          <PreviewText x={18} y={27} width={108} lines={2} />
          <PreviewMedia x={18} y={83} width={160} height={120} />
          <PreviewMedia x={197} y={105} width={72} height={90} />
          <PreviewText x={197} y={219} width={72} lines={3} />
          <rect
            x={197}
            y="260"
            width="45"
            height="11"
            rx="2"
            fill={PREVIEW_COLORS.accent}
          />
          <rect
            x="18"
            y="306"
            width="252"
            height="1"
            fill={PREVIEW_COLORS.line}
          />
          <PreviewMedia x={18} y={327} width={105} height={79} />
          <PreviewMedia x={139} y={327} width={63} height={79} />
          <PreviewText x={218} y={347} width={52} lines={2} />
        </>
      );
      break;
    case "image-text":
      content = (
        <>
          <PreviewMedia x={16} y={72} width={132} height={99} />
          <PreviewText x={168} y={91} width={98} lines={3} />
          <rect
            x={168}
            y="135"
            width="48"
            height="11"
            rx="2"
            fill="none"
            stroke={PREVIEW_COLORS.accent}
          />
          <rect
            x="16"
            y="216"
            width="268"
            height="1"
            fill={PREVIEW_COLORS.line}
          />
          <PreviewText x={28} y={254} width={97} lines={3} />
          <PreviewMedia x={151} y={239} width={121} height={91} />
        </>
      );
      break;
    case "full-bleed":
      background = PREVIEW_COLORS.dark;
      content = (
        <>
          <PreviewMedia x={14} y={54} width={272} height={113} dark />
          <PreviewText x={34} y={89} width={118} lines={2} inverse />
          <rect
            x="34"
            y="126"
            width="55"
            height="2"
            rx="1"
            fill="rgba(255,255,255,.72)"
          />
          <rect
            x="187"
            y="213"
            width="88"
            height="106"
            rx="4"
            fill="#5f6568"
            opacity=".72"
          />
          <PreviewText x={198} y={246} width={62} lines={2} inverse />
          <rect
            x="198"
            y="282"
            width="39"
            height="2"
            rx="1"
            fill="rgba(255,255,255,.72)"
          />
          <rect
            x="26"
            y="363"
            width="248"
            height="1"
            fill="rgba(255,255,255,.18)"
          />
        </>
      );
      break;
    case "product-row":
      content = (
        <>
          <PreviewText x={22} y={30} width={114} lines={2} />
          {[0, 1, 2, 3].map((index) => (
            <g key={index}>
              <PreviewMedia
                x={18 + index * 68}
                y={108}
                width={58}
                height={58}
              />
              <rect
                x={23 + index * 68}
                y="177"
                width="47"
                height="5"
                rx="2"
                fill={PREVIEW_COLORS.ink}
              />
              <rect
                x={23 + index * 68}
                y="188"
                width="29"
                height="4"
                rx="2"
                fill={PREVIEW_COLORS.accent}
              />
            </g>
          ))}
          <rect
            x={106}
            y="220"
            width="88"
            height="11"
            rx="2"
            fill="none"
            stroke={PREVIEW_COLORS.accent}
          />
          <rect
            x="18"
            y="275"
            width="264"
            height="1"
            fill={PREVIEW_COLORS.line}
          />
          <PreviewText x={22} y={308} width={114} lines={2} />
        </>
      );
      break;
    case "category-cards":
    case "occasion-guide":
    case "gift-guide":
      content = (
        <>
          <PreviewText x={74} y={27} width={152} lines={2} />
          {[
            [18, 103],
            [156, 103],
            [18, 252],
            [156, 252],
          ].map(([x, y], index) => (
            <g key={index}>
              <PreviewMedia x={x} y={y} width={126} height={126} />
              <rect
                x={x + 11}
                y={y + 98}
                width="58"
                height="6"
                rx="2"
                fill="rgba(255,255,255,.88)"
              />
            </g>
          ))}
        </>
      );
      break;
    case "card-grid":
      content = (
        <>
          <PreviewText x={70} y={28} width={160} lines={2} />
          {[0, 1, 2].map((index) => (
            <PreviewCard
              key={index}
              x={18 + index * 92}
              y={128}
              width={80}
              height={156}
              kind="service"
            />
          ))}
        </>
      );
      break;
    case "text-banner":
      background = PREVIEW_COLORS.dark;
      content = (
        <>
          <rect x="16" y="159" width="268" height="56" rx="4" fill="#181A1B" />
          <PreviewText x={91} y={173} width={118} lines={2} inverse />
          <rect
            x="126"
            y="196"
            width="48"
            height="9"
            rx="2"
            fill={PREVIEW_COLORS.accent}
          />
          <PreviewText x={25} y={263} width={95} lines={2} />
          <PreviewText x={174} y={263} width={95} lines={2} />
        </>
      );
      break;
    case "carousel":
      content = (
        <>
          <PreviewMedia x={12} y={105} width={276} height={130} dark />
          <PreviewText x={28} y={162} width={104} lines={2} inverse />
          <path
            d="M23 176l8 -7v14zM277 176l-8 -7v14z"
            fill="#FFFFFF"
            opacity=".9"
          />
          {[0, 1, 2, 3].map((index) => (
            <circle
              key={index}
              cx={132 + index * 12}
              cy="220"
              r="3"
              fill={index === 0 ? PREVIEW_COLORS.accent : "#FFFFFF"}
            />
          ))}
          <PreviewMedia x={18} y={279} width={74} height={35} />
          <PreviewMedia x={112} y={279} width={74} height={35} />
          <PreviewMedia x={206} y={279} width={74} height={35} />
        </>
      );
      break;
    case "video":
      background = PREVIEW_COLORS.dark;
      content = (
        <>
          <PreviewMedia x={16} y={105} width={268} height={151} dark />
          <circle cx="150" cy="180" r="22" fill="rgba(255,255,255,.88)" />
          <path d="M145 170l17 10-17 10z" fill={PREVIEW_COLORS.dark} />
          <PreviewText x={65} y={293} width={170} lines={2} />
        </>
      );
      break;
    case "split-panel":
      content = (
        <>
          <PreviewMedia x={16} y={91} width={120} height={160} />
          <rect x="151" y="91" width="133" height="160" rx="4" fill="#ECEEEF" />
          <PreviewText x={168} y={134} width={96} lines={3} />
          <rect
            x={168}
            y="182"
            width="50"
            height="11"
            rx="2"
            fill={PREVIEW_COLORS.accent}
          />
          <PreviewText x={22} y={298} width={102} lines={2} />
          <PreviewText x={174} y={298} width={102} lines={2} />
        </>
      );
      break;
    case "hotspot":
      content = (
        <>
          <PreviewMedia x={14} y={99} width={272} height={153} dark />
          {[
            [80, 142],
            [202, 170],
            [132, 215],
          ].map(([x, y], index) => (
            <g key={index}>
              <circle
                cx={x}
                cy={y}
                r="10"
                fill={PREVIEW_COLORS.light}
                stroke={PREVIEW_COLORS.accent}
                strokeWidth="2"
              />
              <circle cx={x} cy={y} r="3" fill={PREVIEW_COLORS.accent} />
            </g>
          ))}
          <PreviewText x={74} y={294} width={152} lines={2} />
        </>
      );
      break;
    case "appointment":
      content = (
        <>
          <PreviewText x={28} y={52} width={119} lines={2} />
          <PreviewMedia x={176} y={50} width={94} height={71} />
          <rect
            x={28}
            y="133"
            width="118"
            height="11"
            rx="2"
            fill="#F4F5F5"
            stroke={PREVIEW_COLORS.accent}
          />
          <rect
            x={28}
            y="159"
            width="244"
            height="29"
            rx="3"
            fill={PREVIEW_COLORS.light}
            stroke={PREVIEW_COLORS.line}
          />
          <rect
            x={28}
            y="199"
            width="244"
            height="29"
            rx="3"
            fill={PREVIEW_COLORS.light}
            stroke={PREVIEW_COLORS.line}
          />
          <rect
            x={28}
            y="242"
            width="92"
            height="18"
            rx="2"
            fill={PREVIEW_COLORS.accent}
          />
        </>
      );
      break;
    case "certificate":
      content = (
        <>
          <PreviewText x={72} y={28} width={156} lines={2} />
          {[0, 1, 2].map((index) => (
            <g key={index}>
              <PreviewCard
                x={22 + index * 88}
                y={132}
                width={78}
                height={146}
                kind="service"
              />
              <circle
                cx={61 + index * 88}
                cy="164"
                r="16"
                fill="#F4F5F5"
                stroke={PREVIEW_COLORS.accent}
              />
            </g>
          ))}
        </>
      );
      break;
    case "custom-process":
      content = (
        <>
          <PreviewText x={72} y={28} width={156} lines={2} />
          <path d="M48 205H252" stroke={PREVIEW_COLORS.line} strokeWidth="2" />
          {[0, 1, 2, 3].map((index) => (
            <g key={index}>
              <circle
                cx={48 + index * 68}
                cy="205"
                r="16"
                fill={PREVIEW_COLORS.light}
                stroke={PREVIEW_COLORS.accent}
                strokeWidth="2"
              />
              <text
                x={43 + index * 68}
                y="209"
                fill={PREVIEW_COLORS.accent}
                fontSize="10"
              >
                0{index + 1}
              </text>
              <rect
                x={21 + index * 68}
                y="237"
                width="54"
                height="5"
                rx="2"
                fill={PREVIEW_COLORS.ink}
              />
              <rect
                x={25 + index * 68}
                y="249"
                width="46"
                height="4"
                rx="2"
                fill={PREVIEW_COLORS.muted}
              />
            </g>
          ))}
        </>
      );
      break;
    case "service-promise":
      content = (
        <>
          <PreviewText x={70} y={30} width={160} lines={2} />
          {[0, 1, 2].map((index) => (
            <PreviewCard
              key={index}
              x={18 + index * 92}
              y={144}
              width={80}
              height={118}
              kind="service"
            />
          ))}
          <rect
            x={96}
            y={296}
            width="108"
            height="16"
            rx="2"
            fill="none"
            stroke={PREVIEW_COLORS.accent}
          />
        </>
      );
      break;
    case "store-info":
      content = (
        <>
          <PreviewMedia x={16} y={94} width={126} height={95} />
          <PreviewText x={165} y={107} width={103} lines={2} />
          {[0, 1, 2].map((index) => (
            <g key={index}>
              <circle
                cx="172"
                cy={166 + index * 21}
                r="4"
                fill={PREVIEW_COLORS.accent}
              />
              <rect
                x="185"
                y={163 + index * 21}
                width="74"
                height="4"
                rx="2"
                fill={PREVIEW_COLORS.muted}
              />
            </g>
          ))}
          <rect
            x={165}
            y="231"
            width="68"
            height="11"
            rx="2"
            fill="none"
            stroke={PREVIEW_COLORS.accent}
          />
          <rect
            x="16"
            y="280"
            width="268"
            height="1"
            fill={PREVIEW_COLORS.line}
          />
          <PreviewText x={22} y={310} width={114} lines={2} />
        </>
      );
      break;
    case "featured-product":
      content = (
        <>
          <PreviewMedia x={30} y={91} width={99} height={132} />
          <PreviewText x={158} y={112} width={104} lines={3} />
          <rect
            x={158}
            y="164"
            width="63"
            height="11"
            rx="2"
            fill={PREVIEW_COLORS.accent}
          />
          <rect
            x={158}
            y="185"
            width="63"
            height="11"
            rx="2"
            fill="none"
            stroke={PREVIEW_COLORS.accent}
          />
          <rect
            x="18"
            y="266"
            width="264"
            height="1"
            fill={PREVIEW_COLORS.line}
          />
          <PreviewText x={24} y={299} width={116} lines={2} />
        </>
      );
      break;
    case "lookbook":
      content = (
        <>
          <PreviewText x={20} y={27} width={132} lines={2} />
          <PreviewMedia x={20} y={97} width={140} height={105} />
          <PreviewMedia x={178} y={97} width={70} height={93} />
          <PreviewMedia x={178} y={212} width={70} height={93} />
          <rect
            x="178"
            y="198"
            width="59"
            height="4"
            rx="2"
            fill={PREVIEW_COLORS.ink}
          />
          <rect
            x="178"
            y="313"
            width="59"
            height="4"
            rx="2"
            fill={PREVIEW_COLORS.ink}
          />
        </>
      );
      break;
    case "limited-offer":
      background = PREVIEW_COLORS.dark;
      content = (
        <>
          <PreviewText x={25} y={93} width={118} lines={3} inverse />
          {[0, 1, 2, 3].map((index) => (
            <g key={index}>
              <rect
                x={160 + index * 29}
                y="126"
                width="23"
                height="31"
                rx="2"
                fill="rgba(255,255,255,.14)"
              />
              <rect
                x={164 + index * 29}
                y="137"
                width="15"
                height="5"
                rx="2"
                fill="#DDE1E2"
              />
            </g>
          ))}
          <rect
            x={25}
            y={239}
            width="92"
            height="17"
            rx="2"
            fill={PREVIEW_COLORS.accent}
          />
          <rect
            x={25}
            y={287}
            width="188"
            height="18"
            rx="2"
            fill="none"
            stroke="rgba(221,225,226,.72)"
          />
        </>
      );
      break;
    case "testimonial":
      content = (
        <>
          <PreviewText x={72} y={28} width={156} lines={2} />
          {[0, 1, 2].map((index) => (
            <g key={index}>
              <PreviewMedia
                x={18 + index * 92}
                y={122}
                width={80}
                height={60}
              />
              <PreviewCard
                x={18 + index * 92}
                y={192}
                width={80}
                height={96}
                kind="quote"
              />
            </g>
          ))}
        </>
      );
      break;
    case "asymmetric-gallery":
      // 作品画廊:大图(4:5)→小图错位→方图→宽图(3:2)的非对称节奏
      content = (
        <>
          <PreviewText x={24} y={26} width={150} lines={2} />
          <PreviewMedia x={18} y={64} width={168} height={132} />
          <PreviewMedia x={196} y={92} width={86} height={104} />
          <PreviewMedia x={18} y={216} width={86} height={86} />
          <PreviewMedia x={114} y={216} width={168} height={112} />
          <rect
            x={18}
            y={344}
            width={96}
            height={11}
            rx={2}
            fill="none"
            stroke={PREVIEW_COLORS.accent}
          />
        </>
      );
      break;
    case "before-after":
      // 改款前后:4:5 对比图 + 滑动分割线手柄
      content = (
        <>
          <PreviewText x={70} y={24} width={160} lines={2} />
          <PreviewMedia x={18} y={66} width={264} height={250} />
          <rect
            x={150}
            y={66}
            width={132}
            height={250}
            fill={PREVIEW_COLORS.surface}
          />
          <rect x={149} y={66} width={2} height={250} fill="#FFFFFF" />
          <circle
            cx={150}
            cy={191}
            r={13}
            fill={PREVIEW_COLORS.accent}
            stroke="#FFFFFF"
            strokeWidth={2}
          />
          <rect
            x={26}
            y={76}
            width={34}
            height={9}
            rx={2}
            fill="rgba(17,19,21,.45)"
          />
          <rect
            x={240}
            y={76}
            width={34}
            height={9}
            rx={2}
            fill="rgba(17,19,21,.45)"
          />
        </>
      );
      break;
    default:
      content = (
        <>
          <PreviewText x={70} y={38} width={160} lines={2} />
          <PreviewMedia
            x={18}
            y={120}
            width={264}
            height={170}
            label="内容区域"
          />
          <rect
            x={104}
            y={322}
            width="92"
            height="16"
            rx="2"
            fill="none"
            stroke={PREVIEW_COLORS.accent}
          />
        </>
      );
  }

  return (
    <svg
      className="homepage-editor__template-preview-img"
      viewBox="0 0 300 400"
      role="img"
      aria-label={`${name}的内容框架预览`}
      preserveAspectRatio="xMidYMid meet"
    >
      <rect width="300" height="400" fill={background} />
      <rect
        x="8"
        y="8"
        width="284"
        height="384"
        rx="5"
        fill="none"
        stroke={
          background === PREVIEW_COLORS.dark
            ? "rgba(255,255,255,.16)"
            : "#DDE1E2"
        }
      />
      {content}
    </svg>
  );
}

function TemplateCard({
  name,
  meta,
  viewMode,
  previewViewport,
  onActivate,
  onPointerDragMove,
  onPointerDragEnd,
}: {
  name: string;
  meta: BlockMeta;
  viewMode: "single" | "double";
  previewViewport: "desktop" | "mobile";
  onActivate: (name: string) => void;
  onPointerDragMove: (name: string, clientX: number, clientY: number) => void;
  onPointerDragEnd: (name: string, clientX: number, clientY: number) => boolean;
}) {
  const { message } = AntdApp.useApp();
  const content = useHomepagePuck((state) => state.appState.data.content);
  const usedCount = content.filter(
    (item: { type: string }) => item.type === name,
  ).length;
  const limit = meta.limit ?? 5;
  const unavailable = usedCount >= limit;
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const didPointerDrag = useRef(false);
  const dragInput = useRef<"pointer" | "mouse" | null>(null);

  const moveTemplate = useCallback(
    (clientX: number, clientY: number) => {
      const start = pointerStart.current;
      if (!start) return;
      const distance = Math.hypot(clientX - start.x, clientY - start.y);
      if (distance < 7 && !didPointerDrag.current) return;
      didPointerDrag.current = true;
      onPointerDragMove(name, clientX, clientY);
    },
    [name, onPointerDragMove],
  );

  const endTemplateDrag = useCallback(
    (clientX: number, clientY: number) => {
      if (!pointerStart.current) return;
      pointerStart.current = null;
      if (!didPointerDrag.current) return;
      onPointerDragEnd(name, clientX, clientY);
      window.setTimeout(() => {
        didPointerDrag.current = false;
      }, 0);
    },
    [name, onPointerDragEnd],
  );

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

  const activateTemplate = () => {
    if (unavailable) {
      message.info(`“${meta.name}”最多可添加 ${limit} 个`);
      return;
    }
    onActivate(name);
  };

  return (
    <article
      className={`homepage-editor__template-card${unavailable ? " is-disabled" : ""}${viewMode === "double" ? " is-compact" : ""}`}
      data-template-name={name}
      role="button"
      tabIndex={unavailable ? -1 : 0}
      aria-disabled={unavailable || undefined}
      aria-label={`${meta.name}：点击添加到页面末尾，也可拖到画布指定位置`}
      onClick={() => {
        if (didPointerDrag.current) {
          didPointerDrag.current = false;
          return;
        }
        activateTemplate();
      }}
      onKeyDown={(event) => {
        if (
          !unavailable &&
          !event.repeat &&
          (event.key === "Enter" || event.key === " ")
        ) {
          event.preventDefault();
          event.currentTarget.click();
        }
      }}
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
      title={
        unavailable
          ? `${meta.name}已达可添加上限`
          : `点击添加${meta.name}到页面末尾，也可拖到画布指定位置`
      }
    >
      <div className="homepage-editor__template-card-main">
        <span className="homepage-editor__template-preview-wrap">
          {meta.previewImage ? (
            <img
              className="homepage-editor__template-preview-img"
              src={meta.previewImage}
              alt={meta.name}
              loading="lazy"
              draggable={false}
            />
          ) : (
            <BlockTemplateVisual name={name} viewport={previewViewport} />
          )}
          {meta.badge && (
            <span className="homepage-editor__template-badge">
              {meta.badge}
            </span>
          )}
          <span className="homepage-editor__template-add">点击添加 · 可拖拽</span>
        </span>
        <span className="homepage-editor__template-name">{meta.name}</span>
        <span className="homepage-editor__template-description">
          {meta.description}
        </span>
      </div>
      <div className="homepage-editor__template-footer">
        <span
          className={`homepage-editor__template-usage${unavailable ? " is-limit" : ""}`}
        >
          已添加 {usedCount} / {limit}
        </span>
        {viewMode === "single" && (
          <span className="homepage-editor__template-media-hint">
            {TEMPLATE_MEDIA_HINT[name] ?? meta.tags[0]}
          </span>
        )}
      </div>
    </article>
  );
}

function TemplateLibrary({
  pageKey,
  onInsertTemplate,
  onTemplatePointerDragMove,
  onTemplatePointerDragEnd,
}: {
  pageKey: EditorPageKey;
  onInsertTemplate: (name: string) => void;
  onTemplatePointerDragMove: (
    name: string,
    clientX: number,
    clientY: number,
  ) => void;
  onTemplatePointerDragEnd: (
    name: string,
    clientX: number,
    clientY: number,
  ) => boolean;
}) {
  const { message, modal } = AntdApp.useApp();
  const appData = useHomepagePuck((state) => state.appState.data);
  const dispatch = useHomepagePuck((state) => state.dispatch);
  const currentViewport = useHomepagePuck(
    (state) => state.appState.ui.viewports.current,
  );
  const previewViewport = typeof currentViewport.width === "number" && currentViewport.width <= 480
    ? "mobile"
    : "desktop";
  const [keyword, setKeyword] = useState("");
  const [viewMode, setViewMode] = useState<"single" | "double">(() => {
    try {
      return window.localStorage.getItem(
        "homepage-editor-template-view-mode",
      ) === "single"
        ? "single"
        : "double";
    } catch {
      return "double";
    }
  });
  const [localTemplates, setLocalTemplates] = useState<BlockTemplate[]>(() =>
    blockTemplateStore.getAll(),
  );
  const [personalTemplates, setPersonalTemplates] = useState<PersonalContentTemplate[]>([]);
  const [personalTemplatesLoading, setPersonalTemplatesLoading] = useState(true);
  const [personalTemplatesError, setPersonalTemplatesError] = useState<string | null>(null);

  useEffect(() => {
    window.localStorage.setItem("homepage-editor-template-view-mode", viewMode);
  }, [viewMode]);

  const refreshLocalTemplates = useCallback(() => {
    setLocalTemplates(blockTemplateStore.getAll());
  }, []);

  const refreshPersonalTemplates = useCallback(async () => {
    setPersonalTemplatesLoading(true);
    setPersonalTemplatesError(null);
    try {
      const response = await personalContentTemplateApi.list();
      setPersonalTemplates(unwrapResponse<PersonalContentTemplate[]>(response) ?? []);
    } catch {
      const fallbackMessage = "账号模板暂时不可用，内置模板和本机旧方案仍可使用";
      setPersonalTemplatesError(fallbackMessage);
    } finally {
      setPersonalTemplatesLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshPersonalTemplates();
    const refresh = () => void refreshPersonalTemplates();
    window.addEventListener(PERSONAL_TEMPLATE_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(PERSONAL_TEMPLATE_CHANGED_EVENT, refresh);
  }, [refreshPersonalTemplates]);

  const entries = useMemo(
    () =>
      Object.entries(BLOCK_META)
        .filter(([name, meta]) => {
          if (!isContentTemplateInsertable(name)) return false;
          if (!isContentTemplateAllowedForPage(pageKey, name)) return false;
          const matchKeyword =
            `${name}${meta.name}${meta.description}${meta.tags.join("")}`.includes(
              keyword.trim(),
            );
          return matchKeyword;
        })
        .sort(([, left], [, right]) => {
          const categoryOrder =
            BLOCK_CATEGORIES.indexOf(left.category) -
            BLOCK_CATEGORIES.indexOf(right.category);
          return categoryOrder || left.order - right.order;
        }),
    [keyword, pageKey],
  );
  const insertableTemplateCount = useMemo(
    () =>
      Object.keys(BLOCK_META).filter((name) =>
        isContentTemplateInsertable(name)
          && isContentTemplateAllowedForPage(pageKey, name),
      ).length,
    [pageKey],
  );
  const groupedEntries = useMemo(
    () =>
      BLOCK_CATEGORIES.map((group) => ({
        group,
        entries: entries.filter(([, meta]) => meta.category === group),
      })).filter((section) => section.entries.length > 0),
    [entries],
  );

  /* 左栏收缩（2026-08-16 用户需求）：收起为窄条，画布最大化；偏好记入 sessionStorage */
  const [libraryCollapsed, setLibraryCollapsed] = useState(() => {
    try {
      return window.matchMedia("(max-width: 900px)").matches ||
        sessionStorage.getItem("homepage-editor-library-collapsed") === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    const mobileWorkspace = window.matchMedia("(max-width: 900px)");
    const collapseForMobile = (event: MediaQueryListEvent) => {
      if (event.matches) setLibraryCollapsed(true);
    };
    mobileWorkspace.addEventListener("change", collapseForMobile);
    return () => {
      mobileWorkspace.removeEventListener("change", collapseForMobile);
    };
  }, []);
  const toggleLibrary = () => {
    setLibraryCollapsed((prev) => {
      const next = !prev;
      try {
        sessionStorage.setItem(
          "homepage-editor-library-collapsed",
          next ? "1" : "0",
        );
      } catch {
        /* 偏好记忆失败不阻断收放 */
      }
      return next;
    });
  };

  const insertPersonalTemplate = (template: PersonalContentTemplate) => {
    if (!isContentTemplateAllowedForPage(pageKey, template.moduleType)) {
      message.warning("当前页面角色不允许添加此模板");
      return;
    }
    const layoutData = sanitizeContentTemplateLayoutData(
      template.moduleType,
      template.layoutData,
    );
    if (!layoutData) {
      message.warning("此模板布局已不符合当前合同，请重新保存");
      return;
    }
    const meta = BLOCK_META[template.moduleType];
    const limit = meta?.limit ?? 5;
    const usedCount = (appData.content ?? []).filter(
      (item: { type: string }) => item.type === template.moduleType,
    ).length;
    if (usedCount >= limit) {
      message.info(`“${getModuleDisplayName(template.moduleType)}”最多可添加 ${limit} 个`);
      return;
    }
    const block = createBlockContent(template.moduleType);
    const contentDefaults = sanitizeContentTemplateDefaultContent(
      template.moduleType,
      template.contentDefaults,
    );
    block.props = {
      ...block.props,
      ...(contentDefaults ?? {}),
      __instanceOverrides: layoutData,
    };
    insertPreparedBlock(dispatch, block, appData.content?.length ?? 0);
    message.success(
      contentDefaults && Object.keys(contentDefaults).length > 0
        ? `已添加“${template.name}”并恢复已保存的默认内容`
        : `已添加“${template.name}”，内容使用安全空模板`,
    );
  };

  const confirmDeletePersonalTemplate = (template: PersonalContentTemplate) => {
    modal.confirm({
      title: `删除“${template.name}”？`,
      content: "只会删除当前账号的模板及其可选默认内容，不影响已插入页面或历史内容。",
      okText: "删除模板",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        try {
          await personalContentTemplateApi.remove(template.id);
          await refreshPersonalTemplates();
          message.success("模板已删除");
        } catch (error) {
          message.error(getEditorErrorMessage(error, "模板删除失败，请稍后重试"));
          throw error;
        }
      },
    });
  };

  const duplicatePersonalTemplate = async (template: PersonalContentTemplate) => {
    try {
      await personalContentTemplateApi.create({
        name: `${template.name} 副本 ${personalTemplates.length + 1}`,
        moduleType: template.moduleType,
        layoutData: template.layoutData,
        contentDefaults: template.contentDefaults,
      });
      await refreshPersonalTemplates();
      message.success("模板副本已创建");
    } catch (error) {
      message.error(getEditorErrorMessage(error, "模板复制失败，请稍后重试"));
    }
  };

  const renamePersonalTemplate = (template: PersonalContentTemplate) => {
    const inputId = `personal-template-name-${template.id}`;
    modal.confirm({
      title: "重命名模板",
      content: (
        <label htmlFor={inputId} style={{ display: "block", marginTop: 8, fontSize: 12 }}>
          模板名称
          <input
            id={inputId}
            type="text"
            defaultValue={template.name}
            style={{ display: "block", width: "100%", marginTop: 4, padding: "6px 10px", border: "1px solid var(--adm-line)", borderRadius: 3 }}
          />
        </label>
      ),
      okText: "保存名称",
      cancelText: "取消",
      onOk: async () => {
        const name = (document.getElementById(inputId) as HTMLInputElement | null)?.value.trim();
        if (!name) throw new Error("请输入模板名称");
        try {
          await personalContentTemplateApi.update(template.id, { name });
          await refreshPersonalTemplates();
          message.success("模板名称已更新");
        } catch (error) {
          message.error(
            getEditorErrorMessage(error, "模板名称更新失败，请稍后重试"),
          );
          throw error;
        }
      },
    });
  };

  const importLocalTemplate = (template: BlockTemplate) => {
    const migrated = migratePuckData({
      content: [{ type: template.type, props: template.props }],
    }).content[0];
    const layoutData = migrated
      ? extractContentTemplateLayoutData(migrated.type, migrated.props)
      : undefined;
    if (!migrated || !layoutData) {
      message.warning("此旧方案无法映射到当前模板合同");
      return;
    }
    modal.confirm({
      title: `导入“${template.name}”？`,
      content: "只抽取合法布局；旧图片、文案、链接和商品数据不会上传。",
      okText: "导入到我的模板",
      cancelText: "取消",
      onOk: async () => {
        try {
          await personalContentTemplateApi.create({
            name: template.name,
            moduleType: migrated.type,
            layoutData,
          });
          await refreshPersonalTemplates();
          message.success("旧方案的合法布局已导入");
        } catch (error) {
          message.error(
            getEditorErrorMessage(error, "旧方案导入失败，请稍后重试"),
          );
          throw error;
        }
      },
    });
  };

  if (libraryCollapsed) {
    return (
      <aside
        className="homepage-editor__library homepage-editor__library--collapsed"
        aria-label="模板组件库（已收起）"
      >
        <button
          type="button"
          className="homepage-editor__library-expand-btn admin-panel-collapse-toggle"
          onClick={toggleLibrary}
          title="展开模板组件库"
          aria-label="展开模板组件库"
        >
          <RightOutlined />
        </button>
      </aside>
    );
  }

  return (
    <aside className="homepage-editor__library" aria-label="模板组件库">
      <div className="homepage-editor__library-tools">
        <div className="homepage-editor__panel-header">
          <span className="homepage-editor__region-title">
            <AppstoreOutlined />
            模板组件库
          </span>
          <button
            type="button"
            className="homepage-editor__library-collapse-btn admin-panel-collapse-toggle"
            onClick={toggleLibrary}
            title="收起模板组件库"
            aria-label="收起模板组件库"
          >
            <LeftOutlined />
          </button>
        </div>
        <div className="homepage-editor__library-search-row">
          <Input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索模块"
            prefix={<SearchOutlined />}
            aria-label="搜索模块"
          />
          <div
            className="homepage-editor__view-toggle"
            role="group"
            aria-label="视图模式"
          >
            <button
              type="button"
              aria-pressed={viewMode === "single"}
              className={viewMode === "single" ? "is-active" : ""}
              onClick={() => setViewMode("single")}
              title="单列查看"
              aria-label="单列查看"
            >
              <MenuOutlined />
            </button>
            <button
              type="button"
              aria-pressed={viewMode === "double"}
              className={viewMode === "double" ? "is-active" : ""}
              onClick={() => setViewMode("double")}
              title="双列查看"
              aria-label="双列查看"
            >
              <AppstoreOutlined />
            </button>
          </div>
        </div>
        <div className="homepage-editor__library-drag-tip">
          <DragOutlined /> 拖动模块添加至画布
          <span
            className="homepage-editor__library-count"
            title={`显示 ${entries.length} / 已开放 ${insertableTemplateCount} 个；其余模板仍在完成结构验收`}
          >{`${entries.length} / ${insertableTemplateCount}`}</span>
        </div>
      </div>

      <div
        className={`homepage-editor__template-scroll${viewMode === "double" ? " is-double" : ""}`}
      >
        {entries.length > 0 || personalTemplates.length > 0 || localTemplates.length > 0 || personalTemplatesLoading || personalTemplatesError ? (
          <>
            {personalTemplatesLoading || personalTemplates.length > 0 || personalTemplatesError ? (
              <section
                className="homepage-editor__template-group"
                aria-labelledby="template-group-personal"
              >
                <h3 id="template-group-personal">我的模板</h3>
                {personalTemplatesLoading ? (
                  <div className="homepage-editor__library-empty" role="status">
                    <Spin size="small" />
                    <p>正在读取账号模板…</p>
                  </div>
                ) : (
                  <>
                    {personalTemplatesError ? (
                      <div className="homepage-editor__library-empty is-error" role="alert">
                        <p>{personalTemplatesError}</p>
                        <button
                          type="button"
                          className="homepage-editor__library-empty-action"
                          onClick={() => void refreshPersonalTemplates()}
                        >
                          重新加载账号模板
                        </button>
                      </div>
                    ) : null}
                    {personalTemplates.length > 0 ? (
                      <div className="homepage-editor__template-group-grid">
                        {personalTemplates.map((template) => (
                          <article className="homepage-editor__template-card" key={`personal-${template.id}`}>
                            <div
                              role="button"
                              tabIndex={0}
                              className="homepage-editor__template-card-main"
                              aria-label={`${template.name}：点击添加`}
                              onKeyDown={(event) => {
                                if (!event.repeat && (event.key === "Enter" || event.key === " ")) {
                                  event.preventDefault();
                                  insertPersonalTemplate(template);
                                }
                              }}
                              onClick={() => insertPersonalTemplate(template)}
                            >
                              <span className="homepage-editor__template-preview-wrap">
                                <ContentTemplateRendererPreview
                                  moduleType={template.moduleType}
                                  viewport={previewViewport}
                                  layoutData={template.layoutData}
                                  variant="structure"
                                />
                                <span className="homepage-editor__template-badge" style={{ background: "#181A1B" }}>我的</span>
                                <span className="homepage-editor__template-add">点击添加</span>
                              </span>
                              <span className="homepage-editor__template-name">{template.name}</span>
                              <span className="homepage-editor__template-description">
                                {getModuleDisplayName(template.moduleType)} · 账号同步
                                {template.contentDefaults ? " · 含默认内容" : ""}
                              </span>
                            </div>
                            <div className="homepage-editor__template-card-actions" aria-label={`${template.name}模板操作`}>
                              <button type="button" onClick={() => renamePersonalTemplate(template)} title="重命名此账号模板" aria-label="重命名模板">
                                <EditOutlined />
                              </button>
                              <button type="button" onClick={() => void duplicatePersonalTemplate(template)} title="复制此账号模板" aria-label="复制模板">
                                <CopyOutlined />
                              </button>
                              <button type="button" onClick={() => confirmDeletePersonalTemplate(template)} title="删除此账号模板" aria-label="删除模板">
                                <DeleteOutlined />
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : null}
                  </>
                )}
              </section>
            ) : null}
            {localTemplates.length > 0 ? (
              <section
                className="homepage-editor__template-group"
                aria-labelledby="template-group-local"
              >
                <h3 id="template-group-local">本机旧方案</h3>
                <div className="homepage-editor__template-group-grid">
                  {localTemplates.map((tpl) => (
                    <article
                      className="homepage-editor__template-card"
                      key={tpl.id}
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        className="homepage-editor__template-card-main"
                        aria-label={`${tpl.name}：点击添加`}
                        onKeyDown={(event) => {
                          if (
                            !event.repeat &&
                            (event.key === "Enter" || event.key === " ")
                          ) {
                            event.preventDefault();
                            event.currentTarget.click();
                          }
                        }}
                        onClick={() => {
                          // 个人常用方案可能保存于模板收敛之前(图文混排/分割面板/礼赠指南),
                          // 插入前经 migratePuckData 转为新类型,避免画布出现未注册坏块
                          const migratedBlock = migratePuckData({
                            content: [
                              {
                                type: tpl.type,
                                props: {
                                  ...JSON.parse(JSON.stringify(tpl.props)),
                                  id: `homepage-block-${Date.now()}-${blockIdSequence++}`,
                                  locked: false,
                                },
                              },
                            ],
                          }).content[0] ?? { type: tpl.type, props: {} };
                          if (!isContentTemplateAllowedForPage(pageKey, migratedBlock.type)) {
                            message.warning("当前页面角色不允许添加此模板");
                            return;
                          }
                          const meta = BLOCK_META[migratedBlock.type];
                          const limit = meta?.limit ?? 5;
                          const usedCount = (appData.content ?? []).filter(
                            (item: { type: string }) =>
                              item.type === migratedBlock.type,
                          ).length;
                          if (usedCount >= limit) {
                            message.info(
                              `“${getModuleDisplayName(migratedBlock.type)}”最多可添加 ${limit} 个`,
                            );
                            return;
                          }
                          insertPreparedBlock(
                            dispatch,
                            migratedBlock,
                            appData.content?.length ?? 0,
                          );
                          message.success(
                            migratedBlock.type !== tpl.type
                              ? `已添加“${tpl.name}”(已升级为「${getModuleDisplayName(migratedBlock.type)}」)`
                              : `已添加“${tpl.name}”`,
                          );
                        }}
                      >
                        <span className="homepage-editor__template-preview-wrap">
                          <BlockTemplateVisual name={tpl.type} viewport={previewViewport} />
                          <span
                            className="homepage-editor__template-badge"
                            style={{ background: "#181A1B" }}
                          >
                            我的
                          </span>
                          <span className="homepage-editor__template-add">
                            点击添加
                          </span>
                        </span>
                        <span className="homepage-editor__template-name">
                          {tpl.name}
                        </span>
                        <span className="homepage-editor__template-description">
                          {getModuleDisplayName(tpl.type)} ·{" "}
                          {new Date(tpl.createdAt).toLocaleDateString("zh-CN")}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="homepage-editor__template-favorite"
                        style={{ right: 34 }}
                        onClick={() => importLocalTemplate(tpl)}
                        title="只导入合法布局到我的模板"
                      >
                        导入
                      </button>
                      <button
                        type="button"
                        className="homepage-editor__template-favorite"
                        onClick={() => {
                          blockTemplateStore.remove(tpl.id);
                          refreshLocalTemplates();
                        }}
                        title="删除此本机旧方案"
                      >
                        <DeleteOutlined />
                      </button>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
            {groupedEntries.map(({ group, entries: groupItems }) => (
              <section
                className="homepage-editor__template-group"
                key={group}
                aria-labelledby={`template-group-${group}`}
              >
                <h3 id={`template-group-${group}`}>{group}</h3>
                <div className="homepage-editor__template-group-grid">
                  {groupItems.map(([name, meta]) => (
                    <TemplateCard
                      key={name}
                      name={name}
                      meta={meta}
                      viewMode={viewMode}
                      previewViewport={previewViewport}
                      onActivate={onInsertTemplate}
                      onPointerDragMove={onTemplatePointerDragMove}
                      onPointerDragEnd={onTemplatePointerDragEnd}
                    />
                  ))}
                </div>
              </section>
            ))}
          </>
        ) : (
          <div className="homepage-editor__library-empty">
            <p>暂无匹配模块</p>
            {keyword ? (
              <button
                type="button"
                className="homepage-editor__library-empty-action"
                onClick={() => setKeyword("")}
              >
                清除搜索
              </button>
            ) : null}
          </div>
        )}
      </div>
    </aside>
  );
}

/*


 * ══════════ 已退役的旧 Inspector 路径 ══════════
 * 2026-08 模板体系 R4b:10 个按模块手写的专属面板(约 2800 行)退役。
 * 2026-08-18 P1-2:Puck.Fields fallback、手写媒体编辑(TemplateStructureGuide/
 * MediaSourceStatus/MediaRequirementPanel)与轮播 CRUD 助手删除,全部 25 组件
 * 统一走声明式 Schema(inspector/schema/registry)。找回旧实现请查 git 历史。
 * ═════════════════════════════════════════════════════════════════════
 */

function InspectorPanel({
  hasUnsavedChanges,
  saving,
  onSaveDraft,
  onSaveAsTemplate,
  publishIssues,
  validationState,
}: {
  hasUnsavedChanges: boolean;
  saving: boolean;
  onSaveDraft: () => void;
  onSaveAsTemplate: (type: string, props: Record<string, any>) => void;
  publishIssues: PublishValidationIssue[];
  validationState: PublishValidationState;
}) {
  const selectedItem = useHomepagePuck((state) => state.selectedItem);
  const content = useHomepagePuck((state) => state.appState.data.content);
  const dispatch = useHomepagePuck((state) => state.dispatch);
  if (!selectedItem) {
    return (
      <section
        className="homepage-editor__properties"
        aria-label="属性面板"
      >
        <strong className="homepage-editor__properties-hint">
          点选画布或图层中的模块开始编辑
        </strong>
        <div className="homepage-editor__properties-scroll">
          <div className="homepage-editor__properties-empty-state">
            <AppstoreOutlined />
            <strong>未选择模块</strong>
            <span>
              {content.length > 0
                ? "从图层中选择模块，或直接从首个模块开始。"
                : "先从左侧模板组件库添加一个模块。"}
            </span>
            {content.length > 0 ? (
              <Button
                type="default"
                onClick={() => {
                  dispatch({
                    type: "setUi",
                    ui: { itemSelector: { index: 0, zone: ROOT_ZONE } },
                  });
                  focusCanvasBlock(content[0]?.props?.id);
                }}
              >
                编辑首个模块
              </Button>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  // 分派：双图文走对象化专用面板(实验,验证交互后再考虑推广);
  // 其余 25 个组件(24 内容模板 + 网站全局设置/业务功能区)走 Schema 注册表。
  if (selectedItem.type === "双图海报") {
    return (
      <DoublePosterInspector
        hasUnsavedChanges={hasUnsavedChanges}
        saving={saving}
        onSaveDraft={onSaveDraft}
        onSaveAsTemplate={onSaveAsTemplate}
        publishIssues={publishIssues}
        validationState={validationState}
      />
    );
  }
  const inspectorSchema = getInspectorSchema(selectedItem.type);
  if (inspectorSchema) {
    return (
      <SchemaInspectorPanel
        schema={inspectorSchema}
        hasUnsavedChanges={hasUnsavedChanges}
        saving={saving}
        onSaveDraft={onSaveDraft}
        onSaveAsTemplate={onSaveAsTemplate}
        publishIssues={publishIssues}
        validationState={validationState}
      />
    );
  }

  // 理论不可达:registry 全量覆盖。新增组件未注册 schema 时在此显式暴露,不静默渲染旧面板。
  console.warn(`[InspectorPanel] 未注册 Schema 的模块类型: ${selectedItem.type}`);
  return null;
}

function CanvasPreview({ frameRef }: { frameRef: RefObject<HTMLDivElement> }) {
  const content = useHomepagePuck((state) => state.appState.data.content);
  const currentViewport = useHomepagePuck(
    (state) => state.appState.ui.viewports.current,
  );
  const isEmpty = content.length === 0;
  const viewportWidth =
    currentViewport.width === "100%"
      ? RESPONSIVE_CANVAS.desktop.width
      : currentViewport.width;
  const viewportHeight =
    currentViewport.height === "auto"
      ? RESPONSIVE_CANVAS.desktop.height
      : currentViewport.height;
  const isDevicePreview = viewportWidth !== RESPONSIVE_CANVAS.desktop.width;
  const previewWidth = `${viewportWidth}px`;
  const [contentHeight, setContentHeight] = useState(viewportHeight);
  const previewHeight = `${Math.max(viewportHeight, contentHeight)}px`;

  useEffect(() => {
    setContentHeight(viewportHeight);
  }, [viewportHeight]);

  useEffect(() => {
    const handleCanvasHeight = (event: MessageEvent<CanvasHeightMessage>) => {
      const detail = event.data;
      // Puck 重建预览 iframe 时 WindowProxy 会变化，不能依赖对象全等判断。
      // 仍然校验来源站点与编辑器专用消息类型，避免接收跨站消息。
      if (
        event.origin !== window.location.origin ||
        detail?.type !== CANVAS_HEIGHT_MESSAGE
      )
        return;
      if (
        !Number.isFinite(detail.height) ||
        detail.height < viewportHeight ||
        detail.height > 50000
      )
        return;
      setContentHeight((current) =>
        Math.abs(current - detail.height) < 2 ? current : detail.height,
      );
    };
    window.addEventListener("message", handleCanvasHeight);
    return () => window.removeEventListener("message", handleCanvasHeight);
  }, [frameRef, viewportHeight]);

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
          <strong>从左侧添加第一个模块</strong>
          <span>拖动模块后，它会作为独立内容加入当前页面。</span>
        </div>
      )}
    </div>
  );
}

type PublishValidationIssue = {
  blockId?: string;
  field?: string;
  index?: number;
  code?: string;
  message: string;
  severity: "error" | "warning" | "info";
  path?: string;
};

type PublishValidationState = "checking" | "current" | "stale" | "error";

function resolvePublishValidationIssues(result: {
  errors?: string[];
  issues?: PublishValidationIssue[];
}): PublishValidationIssue[] {
  const structuredIssues = result.issues ?? [];
  const structuredErrorMessages = new Set(
    structuredIssues
      .filter((issue) => issue.severity === "error")
      .map((issue) => issue.message),
  );
  const fallbackErrors = (result.errors ?? [])
    .filter((message) => !structuredErrorMessages.has(message))
    .map((message) => ({
      message,
      severity: "error" as const,
    }));
  return [...structuredIssues, ...fallbackErrors];
}

function isPageSettingsPublishIssue(issue: PublishValidationIssue): boolean {
  return issue.severity === "error" && (
    issue.path === "metadata"
    || issue.path?.startsWith("metadata.")
    || issue.message.startsWith("页面设置：")
  );
}

function isSiteSettingsPublishIssue(issue: PublishValidationIssue): boolean {
  return issue.path === "siteSettings" || issue.path?.startsWith("siteSettings.") === true;
}

function EditorBody({
  onSaveAsTemplate,
  pageKey,
  contentReady,
  pageLabel,
  pageMode,
  hasUnsavedChanges,
  saving,
  previewMode,
  viewingPublished,
  onSaveDraft,
  publishIssues,
  validationState,
}: {
  onSaveAsTemplate: (type: string, props: Record<string, any>) => void;
  pageKey: EditorPageKey;
  contentReady: boolean;
  pageLabel: string;
  pageMode: "brand" | "commerce";
  hasUnsavedChanges: boolean;
  saving: boolean;
  previewMode: boolean;
  viewingPublished: boolean;
  onSaveDraft: (data: unknown) => void;
  publishIssues: PublishValidationIssue[];
  validationState: PublishValidationState;
}) {
  const { message } = AntdApp.useApp();
  const appData = useHomepagePuck((state) => state.appState.data);
  const appDataRef = useRef(appData);
  const currentViewport = useHomepagePuck(
    (state) => state.appState.ui.viewports.current,
  );
  const dispatch = useHomepagePuck((state) => state.dispatch);
  const selectedItem = useHomepagePuck((state) => state.selectedItem);
  const isInspecting = Boolean(selectedItem);
  const [draggingTemplate, setDraggingTemplate] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [canvasZoom, setCanvasZoom] = useState(1);
  const [canvasHeight, setCanvasHeight] = useState(0);
  const [navigationPreviewOpen, setNavigationPreviewOpen] = useState(false);
  // 画布滚动时定位到的当前模块下标（scroll-spy），仅用于左侧图层栏跟随滚动，不改变选中态。
  const [scrollSpyIndex, setScrollSpyIndex] = useState<number | null>(null);
  // 右侧属性面板手动收起（2026-08-16）：点选模块仍自动弹出(is-inspecting)，手动收起后保持收起
  const [inspectorCollapsed, setInspectorCollapsed] = useState(() => {
    try {
      return (
        sessionStorage.getItem("homepage-editor-inspector-collapsed") === "1"
      );
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(
        "homepage-editor-inspector-collapsed",
        inspectorCollapsed ? "1" : "0",
      );
    } catch {
      /* 偏好记忆失败不阻断收放 */
    }
  }, [inspectorCollapsed]);
  const [structureCollapsed, setStructureCollapsed] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(max-width: 1024px)").matches
      : false,
  );
  const primaryNavigationOpenRef = useRef(false);
  useEffect(() => {
    const compactWorkspace = window.matchMedia("(max-width: 1024px)");
    const syncStructureRail = (event: MediaQueryListEvent) => {
      setStructureCollapsed(event.matches || primaryNavigationOpenRef.current);
    };
    compactWorkspace.addEventListener("change", syncStructureRail);
    return () => {
      compactWorkspace.removeEventListener("change", syncStructureRail);
    };
  }, []);
  const autoSelectedPageRef = useRef<EditorPageKey | null>(null);
  useEffect(() => {
    if (
      !contentReady ||
      autoSelectedPageRef.current === pageKey ||
      appData.content.length === 0
    ) {
      return;
    }

    autoSelectedPageRef.current = pageKey;
    dispatch({
      type: "setUi",
      ui: { itemSelector: { index: 0, zone: ROOT_ZONE } },
    });
  }, [appData.content.length, contentReady, dispatch, pageKey]);
  useEffect(() => {
    const collapseLayersForPrimaryNavigation = (event: Event) => {
      const detail = (event as CustomEvent<{ open?: boolean }>).detail;
      const primaryNavigationOpen = detail?.open === true;
      primaryNavigationOpenRef.current = primaryNavigationOpen;
      setStructureCollapsed(primaryNavigationOpen);
    };

    window.addEventListener(
      "homepage-editor-primary-navigation-change",
      collapseLayersForPrimaryNavigation,
    );
    return () => {
      window.removeEventListener(
        "homepage-editor-primary-navigation-change",
        collapseLayersForPrimaryNavigation,
      );
    };
  }, []);
  useEffect(() => {
    // 窄平板从图层选择模块后立即把图层收回入口，给画布与属性面板留出
    // 可对照空间；用户仍可随时从 40px 图层入口再次展开。
    if (isInspecting && window.matchMedia("(max-width: 900px)").matches) {
      setStructureCollapsed(true);
    }
  }, [isInspecting]);
  // 默认完整展示画布；仅在用户主动缩放时退出自适应模式。
  const [isFitView, setIsFitView] = useState(true);
  // 滚动层与工具栏分离：工具栏占据固定布局高度，画布内容单独滚动。
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const previewFrameRef = useRef<HTMLDivElement>(null);
  const visualEditStartRef = useRef(
    new Map<string, { index: number; item: any }>(),
  );
  useEffect(() => {
    appDataRef.current = appData;
  }, [appData]);
  useEffect(() => {
    visualEditStartRef.current.clear();
  }, [pageKey]);
  useEffect(() => {
    const handleVisualEdit = (event: MessageEvent<CanvasVisualEditMessage>) => {
      if (viewingPublished) return;
      const detail = event.data;
      if (
        event.origin !== window.location.origin ||
        detail?.type !== CANVAS_VISUAL_EDIT_MESSAGE ||
        typeof detail.blockId !== "string" ||
        typeof detail.moduleType !== "string" ||
        (detail.overrides !== undefined &&
          (!isVisualRecord(detail.overrides) || detail.overrides.version !== 2))
      ) {
        return;
      }
      // Puck 在编辑过程中可能重建预览 iframe，WindowProxy 会变化；不能用
      // event.source 对象全等判断。消息仍受同源、协议、模块 id/type 与 v2 合同校验。
      const currentAppData = appDataRef.current;
      const contentIndex = currentAppData.content.findIndex(
        (item: { type?: string; props?: Record<string, unknown> }) =>
          item.type === detail.moduleType && item.props?.id === detail.blockId,
      );
      if (contentIndex < 0) return;
      const current = currentAppData.content[contentIndex] as {
        type: string;
        props: { id: string; [key: string]: any };
      };
      const nextItem = {
        ...current,
        props: {
          ...current.props,
          __instanceOverrides: detail.overrides,
          ...(current.props?.__contentTemplate
            ? {}
            : { __contentTemplate: createContentTemplateMarker(detail.moduleType) }),
        },
      };
      const transient = detail.transient === true;
      if (transient && !visualEditStartRef.current.has(detail.blockId)) {
        visualEditStartRef.current.set(detail.blockId, {
          index: contentIndex,
          item: current,
        });
      }
      const editStart = visualEditStartRef.current.get(detail.blockId);
      if (!transient && editStart) {
        // transient 已把 store 更新到最终值；先无历史恢复拖前快照，再记录
        // pointerup 的最终值，让整次手势只产生一个且可用的撤销步骤。
        dispatch({
          type: "replace",
          destinationIndex: editStart.index,
          destinationZone: ROOT_ZONE,
          data: editStart.item,
          recordHistory: false,
        });
        visualEditStartRef.current.delete(detail.blockId);
      }
      dispatch({
        type: "replace",
        destinationIndex: contentIndex,
        destinationZone: ROOT_ZONE,
        data: nextItem,
        recordHistory: !transient,
      });
    };
    window.addEventListener("message", handleVisualEdit);
    return () => window.removeEventListener("message", handleVisualEdit);
  }, [dispatch, viewingPublished]);
  const viewportWidth =
    currentViewport.width === "100%"
      ? RESPONSIVE_CANVAS.desktop.width
      : currentViewport.width;
  const canvasBaseWidth = viewportWidth;
  const canvasViewportLabel =
    typeof currentViewport.width === "number" &&
    typeof currentViewport.height === "number"
      ? `${currentViewport.width} × ${currentViewport.height}`
      : "自适应";

  useEffect(() => {
    const handleNavigationState = (
      event: MessageEvent<CanvasNavigationStateMessage>,
    ) => {
      if (
        event.origin !== window.location.origin ||
        event.data?.type !== CANVAS_NAVIGATION_STATE_MESSAGE
      )
        return;
      setNavigationPreviewOpen(event.data.open);
    };
    window.addEventListener("message", handleNavigationState);
    return () => window.removeEventListener("message", handleNavigationState);
  }, []);

  const toggleNavigationPreview = useCallback(() => {
    const next = !navigationPreviewOpen;
    if (next && stageRef.current) {
      stageRef.current.scrollTop = 0;
      // Puck 在切换设备后可能会异步定位当前选中区块；菜单展开必须以首屏为基准。
      window.setTimeout(() => {
        stageRef.current?.scrollTo({ top: 0, behavior: "auto" });
      }, 120);
    }
    setNavigationPreviewOpen(next);
    setCanvasNavigationPreview(next);
  }, [navigationPreviewOpen]);

  // 画布滚动时定位当前可见模块：以内容可视区上缘为基准，仅用于左侧图层栏跟随滚动。
  const computeScrollSpyIndex = useCallback(() => {
    const stage = stageRef.current;
    const frame = previewFrameRef.current;
    if (!stage || !frame) return;
    const iframe = frame.querySelector<HTMLIFrameElement>("iframe");
    const blockNodes = iframe?.contentDocument?.querySelectorAll<HTMLElement>(
      "[data-editor-block-id]",
    );
    if (
      !iframe ||
      !blockNodes ||
      blockNodes.length === 0 ||
      blockNodes.length !== appData.content.length
    ) {
      setScrollSpyIndex(null);
      return;
    }
    const iframeRect = iframe.getBoundingClientRect();
    const scale = iframeRect.width / canvasBaseWidth;
    if (scale <= 0) return;
    const stageRect = stage.getBoundingClientRect();
    const controlsBottom = stage
      .querySelector<HTMLElement>(".homepage-editor__canvas-controls")
      ?.getBoundingClientRect().bottom;
    const viewportAnchorY = Math.min(
      stageRect.bottom - CANVAS_SCROLL_SPY_TOP_OFFSET,
      Math.max(
        stageRect.top + CANVAS_SCROLL_SPY_TOP_OFFSET,
        (controlsBottom ?? stageRect.top) + CANVAS_SCROLL_SPY_TOP_OFFSET,
      ),
    );
    let current = 0;
    Array.from(blockNodes).forEach((block, index) => {
      const blockTop =
        iframeRect.top + block.getBoundingClientRect().top * scale;
      if (blockTop <= viewportAnchorY) current = index;
    });
    setScrollSpyIndex((previous) => (previous === current ? previous : current));
  }, [canvasBaseWidth, appData.content.length]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let rafId = 0;
    const handleStageScroll = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        computeScrollSpyIndex();
      });
    };
    stage.addEventListener("scroll", handleStageScroll, { passive: true });
    computeScrollSpyIndex();
    return () => {
      stage.removeEventListener("scroll", handleStageScroll);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [computeScrollSpyIndex]);

  const getDropIndex = useCallback(
    (clientY: number) => {
      const total = appData.content.length;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect || rect.height <= 0) return total;

      const frame = previewFrameRef.current;
      const iframe = frame?.querySelector("iframe");
      const blockNodes = iframe?.contentDocument?.querySelectorAll<HTMLElement>(
        "[data-puck-component]",
      );
      if (iframe && blockNodes && blockNodes.length === total) {
        const iframeRect = iframe.getBoundingClientRect();
        const scale = iframeRect.width / canvasBaseWidth;
        if (scale > 0) {
          const cursorY = (clientY - iframeRect.top) / scale;
          const blockIndex = Array.from(blockNodes).findIndex(
            (block) => cursorY < block.offsetTop + block.offsetHeight / 2,
          );
          return blockIndex === -1 ? total : blockIndex;
        }
      }

      const progress = Math.min(
        1,
        Math.max(0, (clientY - rect.top) / rect.height),
      );
      return Math.round(progress * total);
    },
    [appData.content.length, canvasBaseWidth],
  );

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

    // 装修页画布按宽度适配，长页面在工作区内纵向滚动。
    // 若同时按高度适配，多区块页面会被压成缩略图，且容易制造“画布缺失”的错觉。
    const nextZoom = isFitView
      ? Math.min(
          1,
          // 工作区左右各 24px 内边距（2026-08-16 收敛：84px 在缩放后显空旷）。
          Math.max(0.1, (stage.clientWidth - 48) / canvasBaseWidth),
        )
      : canvasZoom;

    setCanvasZoom((current) =>
      Math.abs(current - nextZoom) < 0.005 ? current : nextZoom,
    );
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

  // 页面内容可以随工作区缩放，编辑 HUD 则需要保持稳定的屏幕尺寸。
  // 通过同源 iframe 的 CSS 变量传入逆缩放值，避免 38% 画布下工具不可读。
  useLayoutEffect(() => {
    const frameHost = previewFrameRef.current;
    const iframe = frameHost?.querySelector<HTMLIFrameElement>("iframe");
    if (!iframe) return undefined;
    const syncEditorUiScale = () => {
      const documentElement = iframe.contentDocument?.documentElement;
      if (!documentElement) return;
      const inverseScale = Math.min(3, Math.max(1, 1 / Math.max(0.16, canvasZoom)));
      documentElement.style.setProperty("--hc-editor-ui-scale", inverseScale.toFixed(3));
    };
    syncEditorUiScale();
    iframe.addEventListener("load", syncEditorUiScale);
    return () => iframe.removeEventListener("load", syncEditorUiScale);
  }, [canvasZoom, viewportWidth, appData.content.length]);

  const adjustCanvasZoom = (delta: number) => {
    setIsFitView(false);
    setCanvasZoom((current) => Math.min(1, Math.max(0.16, current + delta)));
  };

  const insertTemplate = useCallback(
    (templateName: string, insertionIndex: number) => {
      const meta = BLOCK_META[templateName];
      if (!meta) return;
      if (!isContentTemplateAllowedForPage(pageKey, templateName)) {
        message.warning("当前页面角色不允许添加此模板");
        clearDragState();
        return;
      }
      const displayName = meta.name;
      const usedCount = appData.content.filter(
        (item: { type: string }) => item.type === templateName,
      ).length;
      if (usedCount >= (meta.limit ?? 5)) {
        message.info(`“${displayName}”已达到可添加上限`);
        clearDragState();
        return;
      }

      insertPreparedBlock(dispatch, createBlockContent(templateName), insertionIndex);
      dispatch({
        type: "setUi",
        ui: { itemSelector: { index: insertionIndex, zone: ROOT_ZONE } },
      });
      message.success(`已插入“${displayName}”，可在右侧继续编辑`);
      clearDragState();
    },
    [appData, clearDragState, dispatch, message, pageKey],
  );

  const getCanvasDropIndex = useCallback(
    (clientX: number, clientY: number) => {
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
    },
    [getDropIndex],
  );

  const handleTemplatePointerDragMove = useCallback(
    (name: string, clientX: number, clientY: number) => {
      const nextDropIndex = getCanvasDropIndex(clientX, clientY);
      if (nextDropIndex === null) {
        clearDragState();
        return;
      }
      setDraggingTemplate(name);
      setDropIndex(nextDropIndex);
    },
    [clearDragState, getCanvasDropIndex],
  );

  const handleTemplatePointerDragEnd = useCallback(
    (name: string, clientX: number, clientY: number) => {
      const insertionIndex = getCanvasDropIndex(clientX, clientY);
      if (insertionIndex === null) {
        clearDragState();
        return false;
      }
      insertTemplate(name, insertionIndex);
      return true;
    },
    [clearDragState, getCanvasDropIndex, insertTemplate],
  );

  const handleTemplateActivate = useCallback(
    (name: string) => insertTemplate(name, appData.content.length),
    [appData.content.length, insertTemplate],
  );

  const dropPosition =
    appData.content.length === 0 || dropIndex === null
      ? 50
      : (dropIndex / appData.content.length) * 100;

  return (
    <main
      className={`homepage-editor__body${isInspecting ? " is-inspecting" : ""}${previewMode ? " is-previewing" : ""}${viewingPublished ? " is-viewing-published" : ""}`}
    >
      {viewingPublished ? (
        <aside
          className="homepage-editor__library homepage-editor__library--readonly"
          aria-label="模板组件库（线上版本只读）"
        >
          <div className="homepage-editor__readonly-panel" role="status">
            <EyeOutlined />
            <strong>线上版本仅供查看</strong>
            <span>返回草稿后才能添加或导入模块。</span>
          </div>
        </aside>
      ) : (
        <TemplateLibrary
          pageKey={pageKey}
          onInsertTemplate={handleTemplateActivate}
          onTemplatePointerDragMove={handleTemplatePointerDragMove}
          onTemplatePointerDragEnd={handleTemplatePointerDragEnd}
        />
      )}

      <aside
        className={`homepage-editor__structure-workspace${structureCollapsed ? " is-collapsed" : ""}`}
        aria-label="图层面板"
      >
        {structureCollapsed ? (
          <button
            type="button"
            className="homepage-editor__structure-expand-btn admin-panel-collapse-toggle"
            onClick={() => setStructureCollapsed(false)}
            title="展开图层面板"
            aria-label="展开图层面板"
          >
            <RightOutlined />
          </button>
        ) : (
          <>
            <div className="homepage-editor__panel-header">
              <span className="homepage-editor__region-title">
                <BlockOutlined />
                图层面板
              </span>
            </div>
            <LayerRail
              navigationPreviewOpen={navigationPreviewOpen}
              onToggleNavigationPreview={toggleNavigationPreview}
              scrollSpyIndex={scrollSpyIndex}
              publishIssues={publishIssues}
              readOnly={viewingPublished}
            />
          </>
        )}
      </aside>

      <section
        className="homepage-editor__stage"
        aria-label={`${pageLabel}画布`}
      >
        {previewMode ? (
          <div className="homepage-editor__preview-mode-bar" role="status">
            <strong>当前画布预览 · {canvasViewportLabel}</strong>
            <span>包含尚未保存的修改；预览本身不会保存或发布。</span>
          </div>
        ) : null}
        <div className="homepage-editor__canvas-controls" aria-label="画布缩放">
          <button
            type="button"
            className={isFitView ? "is-active" : ""}
            onClick={() => setIsFitView(true)}
          >
            适应画布
          </button>
          <button
            type="button"
            className={
              !isFitView && Math.abs(canvasZoom - 1) < 0.005 ? "is-active" : ""
            }
            onClick={() => {
              setIsFitView(false);
              setCanvasZoom(1);
            }}
          >
            100%
          </button>
          <button
            type="button"
            onClick={() => adjustCanvasZoom(-0.1)}
            aria-label="缩小画布"
          >
            −
          </button>
          <output
            className="homepage-editor__canvas-readout"
            aria-label={`画布尺寸 ${canvasViewportLabel}，缩放 ${Math.round(canvasZoom * 100)}%`}
          >
            <span>{canvasViewportLabel}</span>
            {Math.round(canvasZoom * 100)}%
          </output>
          <button
            type="button"
            onClick={() => adjustCanvasZoom(0.1)}
            aria-label="放大画布"
          >
            +
          </button>
        </div>
        <div ref={stageRef} className="homepage-editor__canvas-scroll">
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
              style={{
                width: `${canvasBaseWidth}px`,
                transform: `scale(${canvasZoom})`,
              }}
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
        </div>
      </section>

      <div
        className={`homepage-editor__right-workspace${inspectorCollapsed ? " is-inspector-collapsed" : ""}`}
        aria-label="属性面板"
      >
        {inspectorCollapsed ? (
          <button
            type="button"
            className="homepage-editor__inspector-expand-btn admin-panel-collapse-toggle"
            onClick={() => setInspectorCollapsed(false)}
            title="展开属性面板"
            aria-label="展开属性面板"
          >
            <LeftOutlined />
          </button>
        ) : (
          <div className="homepage-editor__inspector-holder">
            <div className="homepage-editor__panel-header">
              <span className="homepage-editor__region-title">
                <ControlOutlined />
                属性面板
              </span>
              <button
                type="button"
                className="homepage-editor__inspector-collapse-btn admin-panel-collapse-toggle"
                onClick={() => setInspectorCollapsed(true)}
                title="收起属性面板"
                aria-label="收起属性面板"
              >
                <RightOutlined />
              </button>
            </div>
            {viewingPublished ? (
              <div className="homepage-editor__properties-empty-state homepage-editor__readonly-panel">
                <EyeOutlined />
                <strong>线上版本仅供查看</strong>
                <span>点击顶部“返回编辑”恢复进入前的草稿和未保存修改。</span>
              </div>
            ) : (
              <InspectorPanel
                hasUnsavedChanges={hasUnsavedChanges}
                saving={saving}
                onSaveDraft={() => onSaveDraft(appData)}
                onSaveAsTemplate={onSaveAsTemplate}
                publishIssues={publishIssues}
                validationState={validationState}
              />
            )}
          </div>
        )}
      </div>
    </main>
  );
}

export default function HomepageConfig({
  pageKey = "home",
}: {
  pageKey?: EditorPageKey;
}) {
  const { message, modal } = AntdApp.useApp();
  const navigate = useNavigate();
  const adminRole = useAuthStore((state) => state.user?.role);
  const canPublish = adminRole === "SUPER_ADMIN" || adminRole === "ADMIN";
  const canEditSiteContent = canAccessAdminRoute(adminRole, "/admin/site-content");
  const [data, setData] = useState<any>(() => createEditorPageDefault(pageKey));
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishIssues, setPublishIssues] = useState<PublishValidationIssue[]>(
    [],
  );
  const [publishValidationState, setPublishValidationState] =
    useState<PublishValidationState>("stale");
  const publishSettingsErrorCount = useMemo(
    () => publishIssues.filter(isPageSettingsPublishIssue).length,
    [publishIssues],
  );
  const [validationRevision, setValidationRevision] = useState(0);
  const validationRequestRef = useRef(0);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [revisionsOpen, setRevisionsOpen] = useState(false);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [revisions, setRevisions] = useState<PageDocumentRevision[]>([]);
  const [restoringVersion, setRestoringVersion] = useState<number | null>(null);
  const [revisionFailure, setRevisionFailure] = useState<{
    message: string;
    revision?: PageDocumentRevision;
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
  const activePageKeyRef = useRef(pageKey);
  const latestData = useRef<any>(data);
  const preserveSavedBaselineOnDataSyncRef = useRef(false);
  const controlledCanvasStateRef = useRef<{
    hasUnsavedChanges: boolean;
    baselineSignature: string | null;
  } | null>(null);
  const [canvasDataSyncVersion, setCanvasDataSyncVersion] = useState(0);
  const pageSessionCacheRef = useRef<Record<string, PageSessionCache>>({});
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const dataSignatureRef = useRef("");  const [metadata, setMetadata] = useState<Record<string, any>>({});
  const latestMetadata = useRef<Record<string, any>>({});
  const [pageSettingsOpen, setPageSettingsOpen] = useState(false);
  // 是否存在尚未发布的草稿修改。
  const [hasPendingDraft, setHasPendingDraft] = useState(false);
  const [publishedNeedsRevalidation, setPublishedNeedsRevalidation] = useState(false);
  const pendingDraftRef = useRef<any>(null);
  const editingDraftSnapshotRef = useRef<{
    data: any;
    metadata: Record<string, any>;
    hasUnsavedChanges: boolean;
    hasPendingDraft: boolean;
    savedSignature: string;
  } | null>(null);
  const publishedBaselineRef = useRef<any>(null);
  const publishedDataRef = useRef<any>(null);
  // 当前画布是否展示线上已发布版本（“查看线上版本”模式）。
  const [viewingPublished, setViewingPublished] = useState(false);
  // 供画布编辑回调读取最新“查看线上版本”状态，避免闭包过期。
  const viewingPublishedRef = useRef(false);
  // 线上版本的 metadata，供“查看线上版本”时还原。
  const publishedMetadataRef = useRef<Record<string, any>>({});
  const hasProtectedUnsavedChanges =
    hasUnsavedChanges ||
    (viewingPublished &&
      editingDraftSnapshotRef.current?.hasUnsavedChanges === true);

  useEffect(() => {
    activePageKeyRef.current = pageKey;
    setPreviewMode(false);
  }, [pageKey]);

  useEffect(() => {
    viewingPublishedRef.current = viewingPublished;
  }, [viewingPublished]);

  const saveBlockAsTemplate = useCallback(
    (blockType: string, blockProps: Record<string, any>) => {
      const moduleDisplayName = getModuleDisplayName(blockType);
      const layoutData = extractContentTemplateLayoutData(blockType, blockProps);
      if (!layoutData) {
        message.warning("当前模块不是可另存的内容模板，或布局数据需要先升级");
        return;
      }
      modal.confirm({
        title: "另存到模板库",
        content: (
          <div style={{ marginTop: 8 }}>
            <p style={{ margin: "0 0 8px", color: "var(--adm-text)", fontSize: 12 }}>
              默认仅保存桌面端与移动端布局、焦点和受控视觉属性。
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 92px", gap: 8, marginBottom: 12 }}>
              <ContentTemplateRendererPreview
                moduleType={blockType}
                viewport="desktop"
                layoutData={layoutData}
                variant="renderer"
              />
              <ContentTemplateRendererPreview
                moduleType={blockType}
                viewport="mobile"
                layoutData={layoutData}
                variant="renderer"
              />
            </div>
            <label style={{ fontSize: 12, color: "var(--adm-text-strong)" }}>
              模板名称
              <input
                id="block-template-name-input"
                type="text"
                defaultValue={`我的${moduleDisplayName}`}
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: 4,
                  padding: "6px 10px",
                  border: "1px solid var(--adm-line)",
                  borderRadius: 3,
                  fontSize: 13,
                  boxSizing: "border-box",
                }}
              />
            </label>
            <label
              htmlFor="block-template-include-content"
              style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 12, fontSize: 12, color: "var(--adm-text-strong)" }}
            >
              <input id="block-template-include-content" type="checkbox" style={{ marginTop: 2 }} />
              <span>
                同时保存当前默认内容
                <small style={{ display: "block", marginTop: 3, color: "var(--adm-text)" }}>
                  仅保存合同允许的文案、媒体、行动和有效引用；价格、库存、客户、门店资料及其他业务事实不会保存。
                </small>
              </span>
            </label>
          </div>
        ),
        okText: "保存模板",
        cancelText: "取消",
        onOk: async () => {
          const input = document.getElementById(
            "block-template-name-input",
          ) as HTMLInputElement | null;
          const name = input?.value?.trim() || `我的${moduleDisplayName}`;
          const includeDefaultContent = (
            document.getElementById("block-template-include-content") as HTMLInputElement | null
          )?.checked;
          const extractedDefaults = includeDefaultContent
            ? extractContentTemplateDefaultContent(blockType, blockProps)
            : undefined;
          try {
            await personalContentTemplateApi.create({
              name,
              moduleType: blockType,
              layoutData,
              ...(includeDefaultContent
                ? { contentDefaults: extractedDefaults ?? null }
                : {}),
            });
            window.dispatchEvent(new Event(PERSONAL_TEMPLATE_CHANGED_EVENT));
            message.success(
              includeDefaultContent && extractedDefaults && Object.keys(extractedDefaults).length > 0
                ? `「${name}」已保存布局和默认内容`
                : `「${name}」已保存到我的模板`,
            );
          } catch (error) {
            message.error(
              getEditorErrorMessage(error, "模板保存失败，请稍后重试"),
            );
            throw error;
          }
        },
      });
    },
    [message, modal],
  );
  const editorConfig = useMemo(
    () =>
      ({
        ...puckConfig,
        root: {
          ...puckConfig.root,
          render: ({ children }: { children: ReactNode }) => (
            <EditorCanvasShell
              pageKey={pageKey}
            >
              {children}
            </EditorCanvasShell>
          ),
        },
        components: Object.fromEntries(
          Object.entries(puckConfig.components).map(([type, component]) => [
            type,
            {
              ...(component as any),
              label: BLOCK_META[type]?.name ?? (component as any).label ?? type,
              render: (props: Record<string, any>) => {
                if (props.isVisible === false) {
                  return (
                    <div className="homepage-editor__hidden-block">
                      此模块已隐藏，不会发布到前台
                    </div>
                  );
                }
                // 与公开端同一套渲染规则（2026-08-21 对齐）：
                // 旧色值规范化此前只在公开端生效，老数据两端颜色可能不同；
                // 素材缺失检测同理，见 CanvasMediaGuard。
                const normalizedProps = normalizeLegacyRenderColors(
                  props,
                ) as Record<string, any>;
                const rendered = (component as any).render(normalizedProps);
                // 画布内统一注入 editMode，让 block 区分编辑预览与前台发布
                const editableBlock = isValidElement(rendered)
                  ? cloneElement(rendered, { editMode: true } as any)
                  : rendered;
                return (
                  <CanvasBlockAnchor blockId={props.id} blockType={type}>
                    <CanvasMediaGuard
                      blockType={type}
                      blockProps={normalizedProps}
                    >
                      {editableBlock}
                    </CanvasMediaGuard>
                  </CanvasBlockAnchor>
                );
              },
            },
          ]),
        ),
      }) as unknown as typeof puckConfig,
    [pageKey],
  );

  useEffect(() => {
    latestData.current = data;
  }, [data]);

  useEffect(() => {
    latestMetadata.current = metadata;
  }, [metadata]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadedPageKey(null);
      setHasUnsavedChanges(false);
      setHasPendingDraft(false);
      setPublishedNeedsRevalidation(false);
      setViewingPublished(false);
      setPublishIssues([]);
      setPublishValidationState("stale");
      setRevisions([]);
      setDraftSnapshot(null);
      setRevisionFailure(null);
      setDraftDiscardError(null);
      setRevisionsOpen(false);
      setPageSettingsOpen(false);
      pendingDraftRef.current = null;
      editingDraftSnapshotRef.current = null;
      publishedBaselineRef.current = null;
      publishedDataRef.current = null;
      publishedMetadataRef.current = {};
      let serverData = createEditorPageDefault(pageKey);
      const cachedPage = pageSessionCacheRef.current[pageKey];
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
        // 同时拉取线上已发布版本与后台草稿:存在未发布草稿差异时默认进入草稿继续编辑,
        // 否则展示线上版本(与下方 displayPuck 判定一致,2026-08-18 P1.5 核对)。
        const [publishedResponse, adminResponse] = await Promise.all([
          pageDocumentApi.getPublishedAdmin(pageKey),
          pageDocumentApi.getAdmin(pageKey),
        ]);
        if (cancelled) return;
        const publishedDoc = unwrapResponse<any>(publishedResponse);
        const adminDoc = unwrapResponse<any>(adminResponse);
        const publishedPuck = publishedDoc?.puckData ?? null;
        const draftPuck = adminDoc?.puckData ?? null;

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

        publishedMetadataRef.current = publishedDoc?.metadata || {};

        // 展示基准（2026-08-21 用户决策，取代 2026-08-19 已发布优先）：
        // 存在与线上不同的未发布草稿时优先展示草稿——画布应始终等于最新编辑内容，
        // 避免"保存过草稿却看到旧线上版"的错位感；工具栏徽标与「查看线上版本」
        // 入口可随时对照线上版。从未发布过或草稿与线上一致时展示线上版本。
        if (publishedPuck || draftPuck) {
          const viewingPublishedNow =
            Boolean(publishedPuck) && !nextHasPendingDraft;
          const displayPuck = nextHasPendingDraft
            ? draftPuck
            : publishedPuck || draftPuck;
          // 旧模板类型(分割面板/图文混排/礼赠指南)在此迁移为新体系类型;
          // 公开渲染器仍保留旧类型分支,已发布历史版本不受影响。
          serverData = ensureEditorPageStructure(
            pageKey,
            migratePuckData(displayPuck),
          );
          // 查看线上版本时 metadata 以线上文档为准；草稿文档仅作乐观锁与保存基准。
          const displayMetadata = viewingPublishedNow
            ? publishedDoc?.metadata || {}
            : adminDoc?.metadata || {};
          setData(serverData);
          latestData.current = serverData;
          dataSignatureRef.current = dataSignature(serverData);
          setMetadata(displayMetadata);
          latestMetadata.current = displayMetadata;
          setViewingPublished(viewingPublishedNow);
          // 乐观锁与“上次保存时间”仍以草稿文档为准，保证后续保存/发布能正确串行。
          const draftUpdatedAt = adminDoc?.updatedAt || null;
          pageSessionCacheRef.current[pageKey] = {
            data: serverData,
            metadata: displayMetadata,
            lastSaved: draftUpdatedAt ? formatEditorTime(draftUpdatedAt) : null,
            updatedAt: draftUpdatedAt,
          };
        } else if (!cachedPage) {
          // 新页面没有服务端数据时，仅此处一次性落入该页面的正确默认结构。
          setData(serverData);
          latestData.current = serverData;
          dataSignatureRef.current = dataSignature(serverData);
          pageSessionCacheRef.current[pageKey] = {
            data: serverData,
            metadata: {},
            lastSaved: null,
            updatedAt: null,
          };
        }

        setHasPendingDraft(nextHasPendingDraft);
        pendingDraftRef.current = nextHasPendingDraft
          ? ensureEditorPageStructure(pageKey, migratePuckData(draftPuck))
          : null;
        publishedBaselineRef.current = nextHasPublished
          ? canonicalizePageContent(publishedPuck, publishedDoc?.metadata)
          : null;
        publishedDataRef.current = nextHasPublished
          ? ensureEditorPageStructure(pageKey, migratePuckData(publishedPuck))
          : null;
      } catch (error) {
        if (!cancelled) {
          // 接口失败不能伪装成“没有草稿”，否则一次自动保存就可能覆盖已有装修内容。
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
  }, [loadAttempt, pageKey]);

  useEffect(() => {
    if (preserveSavedBaselineOnDataSyncRef.current) {
      preserveSavedBaselineOnDataSyncRef.current = false;
      return;
    }
    dataSignatureRef.current = dataSignature(data);
  }, [data]);

  const syncCanvasDataWithoutAdvancingSavedBaseline = useCallback(
    (nextData: unknown) => {
      preserveSavedBaselineOnDataSyncRef.current = true;
      setData(nextData);
      latestData.current = nextData;
      setCanvasDataSyncVersion((version) => version + 1);
    },
    [],
  );

  const trackEditorData = useCallback((nextData: unknown) => {
    latestData.current = nextData;
    const controlledState = controlledCanvasStateRef.current;
    if (controlledState) {
      controlledCanvasStateRef.current = null;
      // Puck 会在整页替换时补齐默认字段。服务端草稿采用归一化结果
      // 建立新基线；从线上比较返回时则恢复进入前的已保存基线与脏状态。
      dataSignatureRef.current =
        controlledState.baselineSignature ?? dataSignature(nextData);
      setHasUnsavedChanges(controlledState.hasUnsavedChanges);
      setPublishValidationState("stale");
      setValidationRevision((revision) => revision + 1);
      return;
    }
    // 规范化比较(忽略 block id/键序/非 content 字段):
    // Puck 首帧会 normalize 画布数据,JSON 全等会让每次进入编辑器都误报"有未保存修改"
    const changed = dataSignature(nextData) !== dataSignatureRef.current;
    setHasUnsavedChanges(changed);
    setPublishValidationState("stale");
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
    const controller = new AbortController();
    const requestId = ++validationRequestRef.current;
    const expectedSignature = canonicalizePageContent(
      latestData.current,
      latestMetadata.current,
    );
    setPublishValidationState("checking");
    const timer = window.setTimeout(() => {
      void pageDocumentApi
        .validate(
          pageKey,
          latestData.current,
          latestMetadata.current,
          controller.signal,
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
          setPublishIssues(resolvePublishValidationIssues(result));
          setPublishValidationState("current");
        })
        .catch((error) => {
          if (controller.signal.aborted || requestId !== validationRequestRef.current) return;
          // 失败时不能继续把上一轮问题伪装成当前结论；草稿仍完整保留，
          // 运营可从工具栏原位重试同一个服务端预检。
          setPublishIssues([]);
          setPublishValidationState("error");
          if (import.meta.env.DEV) console.warn("[PageDocument validate]", error);
        });
    }, 650);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [initialLoading, loadError, loadedPageKey, metadata, pageKey, validationRevision]);

  const saveDraft = useCallback(
    async (
      nextData: unknown,
      options: { silent?: boolean } = {},
    ): Promise<boolean> => {
      const targetPageKey = pageKey;
      if (
        initialLoading ||
        Boolean(loadError) ||
        loadedPageKey !== targetPageKey
      ) {
        if (!options.silent) message.warning("页面内容仍在加载，请稍后再保存");
        return false;
      }
      const requestedData = nextData ?? latestData.current;
      const requestedMetadata = latestMetadata.current;
      const save = async (): Promise<boolean> => {
        const editableData = requestedData ?? latestData.current;
        const isActivePage = () => targetPageKey === activePageKeyRef.current;
        // 手动保存才点亮按钮 loading 与成功提示；自动保存（silent）完全静默、不打扰。
        if (isActivePage() && !options.silent) {
          setSaving(true);
        }
        try {
          const response = await pageDocumentApi.save({
            pageKey: targetPageKey,
            puckData: editableData,
            metadata: requestedMetadata,
            editorVersion: "0.22.4",
            expectedUpdatedAt:
              pageSessionCacheRef.current[targetPageKey]?.updatedAt ||
              undefined,
          });
          const savedDocument = unwrapResponse<any>(response);
          // 服务端会在保存时移除旧联系电话、门店资料等业务事实副本。
          // 后续画布、缓存与发布校验必须以服务端回包为准，否则当前会话会继续
          // 持有已经从数据库清除的旧字段，直到刷新页面后才恢复一致。
          const persistedData = savedDocument?.puckData ?? editableData;
          const persistedMetadata =
            savedDocument?.metadata &&
            typeof savedDocument.metadata === "object" &&
            !Array.isArray(savedDocument.metadata)
              ? savedDocument.metadata
              : requestedMetadata;
          const updatedAt =
            typeof savedDocument?.updatedAt === "string"
              ? savedDocument.updatedAt
              : pageSessionCacheRef.current[targetPageKey]?.updatedAt ||
                new Date().toISOString();
          const lastSavedAt = formatEditorTime(updatedAt);
          pageSessionCacheRef.current[targetPageKey] = {
            data: persistedData,
            metadata: persistedMetadata,
            lastSaved: lastSavedAt,
            updatedAt,
          };

          if (!isActivePage()) return true;
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
          const isConflict = getEditorHttpStatus(error) === 409;
          if (isConflict) {
            modal.confirm({
              title: "检测到其他人更新了这份页面草稿",
              content:
                "当前画布修改仍完整保留。你可以继续留在本地核对，或明确放弃本地修改并重新加载远端草稿。",
              okText: "重新加载远端草稿",
              cancelText: "保留本地修改",
              okButtonProps: { danger: true },
              onOk: () => setLoadAttempt((attempt) => attempt + 1),
            });
          } else {
            message.error(getEditorErrorMessage(error, "保存失败，请重试"));
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
    [initialLoading, loadError, loadedPageKey, message, modal, pageKey],
  );

  const retryPublishValidation = useCallback(() => {
    setPublishValidationState("stale");
    setValidationRevision((revision) => revision + 1);
  }, []);

  // 2026-08-16 批次 D（用户决策）：2 秒自动保存已移除，改为显式保存模型——
  // 手动"保存草稿" + UnsavedChangesGuard（路由级离开拦截，三选项）+ beforeunload 三层。
  // 历史 reason：自动保存曾作为 SPA 跳转的静默兜底，用户判定其无价值且干扰草稿管理。

  const switchEditorPage = useCallback(
    async (path: string) => {
      const targetPage = getEditorPageByPath(path);
      if (!targetPage || targetPage.key === pageKey) return;
      // 未保存修改由 UnsavedChangesGuard 拦截（保存并离开/直接离开/继续编辑），此处纯导航。
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

  // 未保存改动时拦截关闭/刷新，避免误丢
  useEffect(() => {
    if (!hasProtectedUnsavedChanges) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasProtectedUnsavedChanges]);

  // 草稿保护（2026-08-16 起的显式保存模型）：
  // 1. useBlocker（UnsavedChangesGuard）：SPA 路由跳转弹三选项（保存并离开/直接离开/继续编辑）；
  // 2. beforeunload：拦截刷新 / 关闭；
  // 3. 显式动作（发布前保存、页面设置保存）各自先保存再执行。

  const loadRevisions = useCallback(async () => {
    setRevisionsLoading(true);
    setRevisionFailure(null);
    try {
      // 同时拉取版本历史与后台草稿：存在与最新发布版本不同的草稿时，在抽屉顶部展示“编辑草稿”入口。
      const [revisionsResponse, adminResponse] = await Promise.all([
        pageDocumentApi.getRevisions(pageKey),
        pageDocumentApi.getAdmin(pageKey),
      ]);
      const revisionList =
        unwrapResponse<PageDocumentRevision[]>(revisionsResponse) || [];
      setRevisions(revisionList);
      const adminDoc = unwrapResponse<any>(adminResponse);
      const draftPuck = adminDoc?.puckData ?? null;
      const hasDraft = Boolean(draftPuck);
      const latestPublishedPuck = revisionList[0]?.puckData ?? null;
      const latestPublishedMetadata = revisionList[0]?.metadata ?? null;
      const hasPublished = latestPublishedPuck != null;
      const hasPendingDraft =
        canonicalizePageContent(draftPuck, adminDoc?.metadata) !==
        canonicalizePageContent(latestPublishedPuck, latestPublishedMetadata);
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
      setRevisionFailure({
        message: getEditorErrorMessage(
          error,
          "版本列表加载失败，请稍后重试",
        ),
      });
    } finally {
      setRevisionsLoading(false);
    }
  }, [pageKey]);

  const applyDraftToCanvas = useCallback(
    (puckData: any, draftMetadata?: Record<string, any>) => {
      const structured = ensureEditorPageStructure(
        pageKey,
        migratePuckData(puckData),
      );
      controlledCanvasStateRef.current = {
        hasUnsavedChanges: false,
        baselineSignature: null,
      };
      preserveSavedBaselineOnDataSyncRef.current = true;
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
    try {
      const adminResponse = await pageDocumentApi.getAdmin(pageKey);
      const adminDoc = unwrapResponse<any>(adminResponse);
      const draftPuck = adminDoc?.puckData ?? null;
      if (!draftPuck) {
        message.info("暂无可编辑的草稿");
        return;
      }
      applyDraftToCanvas(draftPuck, adminDoc?.metadata || {});
      message.success("已加载未发布草稿，可继续编辑或重新发布");
    } catch (error) {
      console.error("[homepage-editor] 草稿加载失败", error);
      message.error("草稿加载失败，请刷新后重试");
    }
  }, [pageKey, applyDraftToCanvas, message]);

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
    preserveSavedBaselineOnDataSyncRef.current = true;
    setData(snapshot.data);
    latestData.current = snapshot.data;
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

  const openPageSettingsForEditing = useCallback(() => {
    if (viewingPublishedRef.current) {
      if (editingDraftSnapshotRef.current) {
        returnToEditingDraft();
      } else {
        // 首次打开且没有独立草稿时，当前线上内容就是新草稿的编辑基线。
        viewingPublishedRef.current = false;
        setViewingPublished(false);
      }
    }
    setPageSettingsOpen(true);
  }, [returnToEditingDraft]);

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
    const savedPage = pageSessionCacheRef.current[pageKey];
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
      hasUnsavedChanges: currentHasUnsavedChanges,
      hasPendingDraft: currentHasPendingDraft,
      savedSignature: dataSignatureRef.current,
    };
    controlledCanvasStateRef.current = {
      hasUnsavedChanges: false,
      baselineSignature: null,
    };
    preserveSavedBaselineOnDataSyncRef.current = true;
    setData(publishedDataRef.current);
    latestData.current = publishedDataRef.current;
    dataSignatureRef.current = dataSignature(publishedDataRef.current);
    setMetadata(publishedMetadataRef.current);
    latestMetadata.current = publishedMetadataRef.current;
    setHasUnsavedChanges(false);
    viewingPublishedRef.current = true;
    setViewingPublished(true);
  }, [hasUnsavedChanges, pageKey]);

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

  const discardDraftToPublished = useCallback(() => {
    modal.confirm({
      title: "放弃当前草稿并恢复线上版本？",
      content:
        "当前草稿的全部未发布修改将丢失，画布回到线上已发布版本；此操作不可撤销。",
      okText: "放弃草稿",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        if (!publishedDataRef.current) return;
        setDraftDiscardError(null);
        // 排空在途保存(如页面设置触发的静默保存):
        // 否则 in-flight 保存会在丢弃完成后回写草稿,让被丢弃的修改"复活"。
        await Promise.resolve(saveQueueRef.current).catch(() => {});
        // 真丢弃:服务端用最新发布版覆盖草稿(无发布版则删除文档),
        // 乐观锁防并发覆盖其他编辑者的修改。
        const expectedUpdatedAt =
          pageSessionCacheRef.current[pageKey]?.updatedAt ?? undefined;
        try {
          await pageDocumentApi.discardDraft(pageKey, expectedUpdatedAt);
        } catch (error) {
          setDraftDiscardError(
            getEditorErrorMessage(error, "放弃草稿失败，请稍后重试"),
          );
          return;
        }
        controlledCanvasStateRef.current = {
          hasUnsavedChanges: false,
          baselineSignature: null,
        };
        preserveSavedBaselineOnDataSyncRef.current = true;
        setData(publishedDataRef.current);
        latestData.current = publishedDataRef.current;
        dataSignatureRef.current = dataSignature(publishedDataRef.current);
        setMetadata(publishedMetadataRef.current);
        latestMetadata.current = publishedMetadataRef.current;
        setHasUnsavedChanges(false);
        setHasPendingDraft(false);
        setViewingPublished(false);
        pendingDraftRef.current = null;
        editingDraftSnapshotRef.current = null;
        viewingPublishedRef.current = false;
        message.success("已放弃草稿，当前内容与线上版本一致");
        // 重拉 admin 文档建立新的乐观锁与保存基准
        try {
          const adminResponse = await pageDocumentApi.getAdmin(pageKey);
          const adminDoc = unwrapResponse<any>(adminResponse);
          pageSessionCacheRef.current[pageKey] = {
            data: publishedDataRef.current,
            metadata: publishedMetadataRef.current,
            lastSaved: null,
            updatedAt: adminDoc?.updatedAt || null,
          };
        } catch {
          // 基准刷新失败不阻断;下次保存若乐观锁不匹配会显式提示
        }
      },
    });
  }, [message, modal, pageKey]);

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
      mediaRights?: ContentTemplateMediaRight[];
    }) => {
      const merged = { ...latestMetadata.current, ...next };
      setMetadata(merged);
      latestMetadata.current = merged;
      // 发布设置已经进入当前内存草稿；即使持久化失败也必须触发离开保护，
      // 不能关闭抽屉后把内容负责人、SEO 或授权编号静默丢失。
      setHasUnsavedChanges(true);
      setPublishValidationState("stale");
      setValidationRevision((revision) => revision + 1);
      const saved = await saveDraft(latestData.current, { silent: true });
      if (saved) {
        setPageSettingsOpen(false);
        message.success("页面发布设置已保存");
      }
      return saved;
    },
    [message, saveDraft],
  );

  const restoreRevision = useCallback(
    (revision: PageDocumentRevision) => {
      modal.confirm({
        title: `恢复版本 ${revision.version}？`,
        content:
          hasProtectedUnsavedChanges
            ? "当前画布的未保存修改和后台草稿都会被该历史版本覆盖；未保存修改无法恢复。此操作不会立即影响前台。"
            : "恢复后会覆盖当前后台草稿，但不会立即影响前台首页。确认后可继续编辑或重新发布。",
        okText: "恢复到草稿",
        cancelText: "取消",
        onOk: async () => {
          setRestoringVersion(revision.version);
          // 与放弃草稿一致，先排空已确认的在途保存，再读取最新乐观锁。
          // 这样恢复不会与稍早发出的保存请求争用旧 expectedUpdatedAt。
          await Promise.resolve(saveQueueRef.current).catch(() => {});
          const expectedUpdatedAt =
            pageSessionCacheRef.current[pageKey]?.updatedAt;
          if (!expectedUpdatedAt) {
            setRevisionFailure({
              message: "当前页面版本标识缺失，请刷新页面后再恢复",
              revision,
            });
            setRestoringVersion(null);
            return;
          }
          setRevisionFailure(null);
          try {
            const response = await pageDocumentApi.restoreRevision(
              pageKey,
              revision.version,
              expectedUpdatedAt,
            );
            const document = unwrapResponse<any>(response);
            if (document?.puckData) {
              const restoredData = ensureEditorPageStructure(
                pageKey,
                migratePuckData(document.puckData),
              );
              controlledCanvasStateRef.current = {
                hasUnsavedChanges: false,
                baselineSignature: null,
              };
              preserveSavedBaselineOnDataSyncRef.current = true;
              setData(restoredData);
              latestData.current = restoredData;
              // 恢复接口已经把该版本写成服务端草稿；Puck 随后的 setData 回调
              // 不应把这次受控整页替换误判为尚未保存的本地编辑。
              dataSignatureRef.current = dataSignature(restoredData);
              const restoredMetadata = document.metadata || {};
              setMetadata(restoredMetadata);
              latestMetadata.current = restoredMetadata;
              setHasUnsavedChanges(false);
              setHasPendingDraft(
                publishedBaselineRef.current != null &&
                  canonicalizePageContent(restoredData, restoredMetadata) !==
                    publishedBaselineRef.current,
              );
              setViewingPublished(false);
              pendingDraftRef.current = null;
              editingDraftSnapshotRef.current = null;
              viewingPublishedRef.current = false;
              const restoredUpdatedAt =
                document.updatedAt || new Date().toISOString();
              const restoredLastSaved = formatEditorTime(restoredUpdatedAt);
              pageSessionCacheRef.current[pageKey] = {
                data: restoredData,
                metadata: restoredMetadata,
                lastSaved: restoredLastSaved,
                updatedAt: restoredUpdatedAt,
              };
            }
            message.success(`已恢复版本 ${revision.version} 到草稿`);
            setRevisionsOpen(false);
          } catch (error) {
            setRevisionFailure({
              message: getEditorErrorMessage(
                error,
                "版本恢复失败，请稍后重试",
              ),
              revision,
            });
          } finally {
            setRestoringVersion(null);
          }
        },
      });
    },
    [hasProtectedUnsavedChanges, message, modal, pageKey],
  );

  const publishHome = async (
    nextData: unknown,
    locateBlock?: (blockIndex: number) => void,
  ) => {
    if (!canPublish) {
      message.warning("当前账号只能编辑草稿，请通知管理员审核并发布");
      return;
    }
    if (
      publishing ||
      initialLoading ||
      Boolean(loadError) ||
      loadedPageKey !== pageKey
    ) {
      if (!publishing) message.warning("页面内容仍在加载，请稍后再发布");
      return;
    }
    const editableData = nextData ?? latestData.current;
    const pageLabel = getEditorPage(pageKey).label;

    // 发布前预检：单一数据源 = 后端校验器，前端只负责展示问题列表
    setPublishing(true);
    let validation: {
      valid: boolean;
      errors: string[];
      issues?: PublishValidationIssue[];
    } | null = null;
    try {
      const response = await pageDocumentApi.validate(
        pageKey,
        editableData,
        latestMetadata.current,
      );
      validation = unwrapResponse<{
        valid: boolean;
        errors: string[];
        issues?: PublishValidationIssue[];
      }>(
        response,
      );
    } catch (error) {
      message.error(
        getEditorErrorMessage(error, "发布前校验失败，请稍后重试"),
      );
      setPublishing(false);
      return;
    }
    setPublishing(false);

    const blocks =
      (
        editableData as {
          content?: Array<{ type?: string; props?: Record<string, unknown> }>;
        }
      )?.content ?? [];
    const currentIssues = resolvePublishValidationIssues(validation ?? {});
    const actionableIssues = currentIssues.filter(
      (issue) => issue.severity !== "info",
    );

    if (validation && !validation.valid && validation.errors?.length) {
      const errorIssues: PublishValidationIssue[] = actionableIssues.filter(
        (issue) => issue.severity === "error",
      );
      setPublishIssues(actionableIssues);
      const firstIssue = errorIssues.find((issue) => issue.blockId);
      const firstBlockIndex = firstIssue?.blockId
        ? blocks.findIndex((block) => block.props?.id === firstIssue.blockId)
        : -1;
      if (firstBlockIndex >= 0 && locateBlock) {
        locateBlock(firstBlockIndex);
      }
      message.warning(
        firstBlockIndex >= 0
          ? `还有 ${validation.errors.length} 处内容待完善，已定位到第一处；可在右侧「发布检查」清单逐项处理，素材未到位的模块可暂时隐藏`
          : `还有 ${validation.errors.length} 处内容待完善，请查看右侧「发布检查」清单`,
      );
      return;
    }
    const warningIssues = actionableIssues.filter(
      (issue) => issue.severity === "warning",
    );
    const hasSiteSettingsWarnings = warningIssues.some(isSiteSettingsPublishIssue);
    setPublishIssues(warningIssues);

    const usesMobileFallback = blocks.some(
      (block) =>
        (block.type === "首屏主视觉" ||
          block.type === "单图海报" ||
          block.type === "全屏出血图" ||
          block.type === "热区图") &&
        Boolean(block.props?.desktopImage || block.props?.image) &&
        !block.props?.mobileImage,
    );
    const publishImpactCopy = usesMobileFallback
      ? "部分模块未上传移动端图片，移动端会复用对应桌面图，可能产生裁切。你仍可发布。"
      : pageKey === "home"
        ? "发布后，当前店铺首页将立即更新为本次编辑内容。"
        : `发布后，${pageLabel}将立即更新为本次编辑内容。`;
    let publishConfirmation: { destroy: () => void } | null = null;
    const openSiteContent = () => {
      publishConfirmation?.destroy();
      navigate("/admin/site-content");
    };
    publishConfirmation = modal.confirm({
      title: pageKey === "home" ? "确认发布首页？" : `确认发布${pageLabel}？`,
      content: (
        <div>
          {warningIssues.length > 0 ? (
            <section aria-label="发布提示">
              <p style={{ margin: "0 0 8px", fontWeight: 600 }}>
                以下 {warningIssues.length} 项提示不会阻断发布，但会影响公开端显示：
              </p>
              <ul style={{ margin: "0 0 14px", paddingInlineStart: 20 }}>
                {warningIssues.map((issue, index) => (
                  <li key={`${issue.path ?? ""}-${issue.message}-${index}`}>
                    {issue.message}
                  </li>
                ))}
              </ul>
              {hasSiteSettingsWarnings ? (
                canEditSiteContent ? (
                  <Button size="small" onClick={openSiteContent}>
                    前往店铺资料
                  </Button>
                ) : (
                  <p style={{ margin: "0 0 14px" }}>
                    当前账号没有店铺资料维护权限，请联系管理员处理。
                  </p>
                )
              ) : null}
            </section>
          ) : null}
          <p style={{ margin: 0 }}>{publishImpactCopy}</p>
        </div>
      ),
      okText: "确认发布",
      cancelText: "继续检查",
      onOk: async () => {
        setPublishing(true);
        try {
          const saved = await saveDraft(editableData, { silent: true });
          if (!saved) return;
          const persistedDraft = pageSessionCacheRef.current[pageKey];
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
          const publishResponse = await pageDocumentApi.publish(
            pageKey,
            undefined,
            persistedDraft?.updatedAt || undefined,
          );
          const publishedDocument = unwrapResponse<any>(publishResponse);
          const publishedData = publishedDocument?.puckData ?? publishData;
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
          pageSessionCacheRef.current[pageKey] = {
            data: publishedData,
            metadata: publishedMetadata,
            lastSaved: formatEditorTime(
              publishedDocument?.updatedAt || new Date(),
            ),
            updatedAt:
              publishedDocument?.updatedAt ||
              pageSessionCacheRef.current[pageKey]?.updatedAt ||
              null,
          };

          if (pageKey !== activePageKeyRef.current) return;
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
          void loadRevisions();
          message.success(
            hasNewerLocalChanges
              ? `${pageLabel}已发布；发布期间的新修改仍保留为未保存内容`
              : pageKey === "home"
                ? "店铺首页已发布，前台页面将立即读取最新版本"
                : `${pageLabel}已发布，前台页面将立即读取最新版本`,
          );
        } catch (error) {
          message.error(getEditorErrorMessage(error, "发布失败，请稍后重试"));
        } finally {
          setPublishing(false);
        }
      },
    });
  };

  return (
    <div className="homepage-editor">
      <RevisionDrawer
        open={revisionsOpen}
        revisions={revisions}
        loading={revisionsLoading}
        restoringVersion={restoringVersion}
        draft={draftSnapshot}
        error={revisionFailure?.message ?? null}
        retryLabel={
          revisionFailure?.revision
            ? `重新恢复版本 ${revisionFailure.revision.version}`
            : "重新加载"
        }
        onClose={() => setRevisionsOpen(false)}
        onRetry={() => {
          if (revisionFailure?.revision) {
            restoreRevision(revisionFailure.revision);
            return;
          }
          void loadRevisions();
        }}
        onRestore={restoreRevision}
        onEditDraft={editDraftFromRevisions}
      />

      <PageSettingsDrawer
        open={pageSettingsOpen}
        pageKey={pageKey}
        metadata={metadata}
        puckData={data}
        onClose={() => setPageSettingsOpen(false)}
        onSave={savePageSettings}
      />

      {draftDiscardError ? (
        <div className="homepage-editor__draft-action-error" role="alert">
          <ExclamationCircleOutlined aria-hidden="true" />
          <div>
            <strong>草稿仍然保留</strong>
            <span>{draftDiscardError}</span>
          </div>
          <Button size="small" onClick={discardDraftToPublished}>
            重新放弃草稿
          </Button>
          <Button
            size="small"
            type="text"
            onClick={() => setDraftDiscardError(null)}
          >
            关闭
          </Button>
        </div>
      ) : null}

      {loadError ? (
        <div className="homepage-editor__load-error" role="alert">
          <ExclamationCircleOutlined />
          <strong>无法打开店铺装修</strong>
          <span>{loadError}</span>
          <Button
            type="primary"
            onClick={() => {
              setInitialLoading(true);
              setLoadError(null);
              setLoadAttempt((attempt) => attempt + 1);
            }}
          >
            重新加载
          </Button>
        </div>
      ) : initialLoading || loadedPageKey !== pageKey ? (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Spin size="large" />
        </div>
      ) : (
        <Puck
          key="homepage-editor-canvas"
          config={editorConfig}
          data={data}
          ui={INITIAL_EDITOR_UI}
          viewports={VIEWPORT_PRESETS}
          permissions={
            viewingPublished
              ? {
                  drag: false,
                  duplicate: false,
                  delete: false,
                  edit: false,
                  insert: false,
                }
              : { drag: false }
          }
          iframe={{ enabled: true, waitForStyles: true, syncHostStyles: true }}
          onPublish={(nextData) => {
            setData(nextData);
            latestData.current = nextData;
          }}
          overrides={HOMEPAGE_EDITOR_OVERRIDES}
        >
          <CanvasPageDataSynchronizer
            data={data}
            pageKey={pageKey}
            canvasDataSyncVersion={canvasDataSyncVersion}
          />
          <CanvasSelectionDock readOnly={viewingPublished} />
          <EditorToolbar
            pageKey={pageKey}
            publishing={publishing}
            saving={saving}
            hasPendingDraft={hasPendingDraft}
            publishedNeedsRevalidation={publishedNeedsRevalidation}
            viewingPublished={viewingPublished}
            previewMode={previewMode}
            hasUnsavedChanges={hasUnsavedChanges}
            canPublish={canPublish}
            publishValidationState={publishValidationState}
            publishErrorCount={
              publishIssues.filter((issue) => issue.severity === "error").length
            }
            publishSettingsErrorCount={publishSettingsErrorCount}
            draftSavedAtLabel={
              pageSessionCacheRef.current[pageKey]?.lastSaved ?? null
            }
            onPublish={publishHome}
            onSaveDraft={(nextData) => {
              void saveDraft(nextData);
            }}
            onEditPendingDraft={editPendingDraft}
            onViewPublishedVersion={viewPublishedVersion}
            onDiscardDraft={discardDraftToPublished}
            onOpenRevisions={openRevisions}
            onOpenPageSettings={openPageSettingsForEditing}
            onRetryPublishValidation={retryPublishValidation}
            onPreviewModeChange={setPreviewMode}
            onDataChange={trackEditorData}
            onCanvasDataSync={syncCanvasDataWithoutAdvancingSavedBaseline}
            onExitViewing={returnToEditingDraft}
          />
          <EditorBody
            onSaveAsTemplate={saveBlockAsTemplate}
            pageKey={pageKey}
            contentReady={loadedPageKey === pageKey}
            pageLabel={getEditorPage(pageKey).label}
            pageMode={getEditorPage(pageKey).mode}
            hasUnsavedChanges={hasUnsavedChanges}
            saving={saving}
            previewMode={previewMode}
            viewingPublished={viewingPublished}
            onSaveDraft={(nextData) => {
              void saveDraft(nextData);
            }}
            publishIssues={publishIssues}
            validationState={publishValidationState}
          />
        </Puck>
      )}
      <UnsavedChangesGuard
        hasUnsavedChanges={hasProtectedUnsavedChanges}
        disabled={
          initialLoading || Boolean(loadError) || loadedPageKey !== pageKey
        }
        onSaveAndLeave={async () => {
          const protectedDraft = editingDraftSnapshotRef.current;
          if (viewingPublishedRef.current && protectedDraft) {
            const protectedData = protectedDraft.data;
            returnToEditingDraft();
            return Boolean(await saveDraft(protectedData));
          }
          return Boolean(await saveDraft(latestData.current));
        }}
      />
    </div>
  );
}
