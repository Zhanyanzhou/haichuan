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
import { Button, Input, Modal, Spin, message } from "antd";
import {
  AppstoreOutlined,
  BlockOutlined,
  CheckCircleOutlined,
  CloseOutlined,
  ControlOutlined,
  DeleteOutlined,
  DragOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
  MenuOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { Puck, type UiState } from "@puckeditor/core";
import { useNavigate } from "react-router-dom";
import "@puckeditor/core/puck.css";
import { puckConfig } from "@/page-builder/config/puckConfig";
import {
  BLOCK_META,
  BLOCK_PREVIEW_KIND,
  BLOCK_CATEGORIES,
  TEMPLATE_MEDIA_HINT,
  isContentTemplateInsertable,
  type BlockMeta,
} from "@/page-builder/config/blockMeta";
import { pageDocumentApi, settingsApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import { IMAGE_SPECS } from "@/page-builder/config/imageSpecs";
import { RESPONSIVE_CANVAS } from "@/page-builder/config/blockContracts";
import {
  blockTemplateStore,
  type BlockTemplate,
} from "@/page-builder/templates/blockTemplateStore";
import StorefrontNavigation from "@/components/layout/StorefrontNavigation";
import SchemaInspectorPanel from "@/page-builder/inspector/SchemaInspectorPanel";
import { getInspectorSchema } from "@/page-builder/inspector/schema/registry";
import {
  createEditorPageDefault,
  ensureEditorPageStructure,
  getEditorPage,
  getEditorPageByPath,
  type EditorPageKey,
} from "@/page-builder/config/editorPages";
import { migratePuckData } from "@/page-builder/utils/migratePuckData";
import ContentTemplateSkeletonPreview from "@/page-builder/preview/ContentTemplateSkeletonPreview";
import ContentTemplateFrameworkOverview from "@/page-builder/preview/ContentTemplateFrameworkOverview";
import { getContentTemplatePreview, createContentTemplateMarker } from "@/page-builder/generated/contentTemplates.generated";
import { isVisualRecord } from "@/page-builder/runtime/visualLayout";
import {
  CANVAS_VISUAL_EDIT_MESSAGE,
  type CanvasVisualEditMessage,
} from "@/page-builder/visual-editor/visualEditorSession";
import "./editor.css";
import EditorToolbar, { VIEWPORT_PRESETS } from "./components/EditorToolbar";
import UnsavedChangesGuard from "./components/UnsavedChangesGuard";
import LayerRail from "./components/LayerRail";
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

/**
 * 脏标记比较签名:只取 content 的规范化形态(忽略 block id 与键序、不含 zones/ui)。
 * JSON 全等比较会让 Puck 首帧 normalize(补默认键/重排)被误判为用户修改,
 * 导致每次进入编辑器都显示"有未保存修改"并触发离开拦截(2026-08-18 实测修复)。
 */
function dataSignature(data: unknown): string {
  return canonicalizePuckContent(data);
}

function createBlockContent(type: string) {
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

function EditorCanvasFooter() {
  const [siteSettings, setSiteSettings] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    settingsApi
      .getPublicSettings()
      .then((res) => {
        if (!cancelled) setSiteSettings(unwrapResponse<any>(res));
      })
      .catch(() => {
        // 画布页脚仅作预览，接口不可用时回落品牌默认值，不阻断编辑。
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const siteName = siteSettings?.siteName || "海川珠宝";
  const contactPhone = siteSettings?.contactPhone?.trim() || "";
  const contactEmail = siteSettings?.contactEmail?.trim() || "";

  return (
    <footer className="site-footer" aria-label="页脚预览">
      <div className="site-footer__inner">
        <div>
          <p className="site-footer__brand-label">HAICHUAN JEWELRY</p>
          <p className="site-footer__brand-name">{siteName}</p>
          <p className="site-footer__brand-desc">黄金珠宝作品与选款服务</p>
        </div>
        <div>
          <p className="site-footer__col-title">探索</p>
          <nav>
            {["珠宝作品", "选款中心", "定制服务", "品牌故事", "预约咨询"].map(
              (label) => (
                <a
                  key={label}
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  title="画布预览，点击不跳转"
                >
                  {label}
                </a>
              ),
            )}
          </nav>
        </div>
        <div>
          <p className="site-footer__col-title">联系</p>
          {contactPhone && (
            <span className="site-footer__link">☎ {contactPhone}</span>
          )}
          {contactEmail && (
            <span className="site-footer__link">✉ {contactEmail}</span>
          )}
          {!contactPhone && !contactEmail && (
            <span className="site-footer__link">联系方式待完善</span>
          )}
        </div>
      </div>
      <p className="site-footer__copyright">
        © {new Date().getFullYear()} {siteName}
      </p>
    </footer>
  );
}

function EditorCanvasShell({
  children,
  isHome,
  headerMode,
}: {
  children: ReactNode;
  isHome: boolean;
  headerMode: "overlay-light" | "solid";
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const currentViewport = useHomepagePuck(
    (state) => state.appState.ui.viewports.current,
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
        isHome={isHome}
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
      {children}
      <EditorCanvasFooter />
    </div>
  );
}

function CanvasBlockAnchor({
  blockId,
  blockType,
  children,
}: {
  blockId?: string;
  blockType: string;
  children: ReactNode;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const clearFocusTimer = useRef<number | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const currentViewport = useHomepagePuck(
    (state) => state.appState.ui.viewports.current,
  );
  const dispatch = useHomepagePuck((state) => state.dispatch);
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
          anchor.ownerDocument.body?.scrollHeight || 0,
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
}: {
  data: any;
  pageKey: EditorPageKey;
}) {
  const dispatch = useHomepagePuck((state) => state.dispatch);
  const currentData = useHomepagePuck((state) => state.appState.data);
  const appliedSignatureRef = useRef<string | null>(null);
  const dataSignature = useMemo(() => JSON.stringify(data), [data]);
  const currentDataSignature = useMemo(
    () => JSON.stringify(currentData),
    [currentData],
  );

  useEffect(() => {
    const signature = `${pageKey}:${dataSignature}`;
    if (appliedSignatureRef.current === signature) return;
    appliedSignatureRef.current = signature;
    // Puck 已以同一份数据挂载时不重复执行昂贵的整页替换；页面切换时
    // currentDataSignature 与目标签名不同，仍会走 setData 完成必要同步。
    if (currentDataSignature === dataSignature) return;
    dispatch({ type: "setData", data });
    dispatch({ type: "setUi", ui: { itemSelector: null } });
  }, [currentDataSignature, data, dataSignature, dispatch, pageKey]);

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

/** 不使用具体商品或摄影素材，直接把每种模块的内容框架画成线框缩略图。 */
function BlockTemplateVisual({ name, viewport = "desktop" }: { name: string; viewport?: "desktop" | "mobile" }) {
  if (getContentTemplatePreview(name)) {
    return <ContentTemplateSkeletonPreview moduleType={name} viewport={viewport} />;
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
  onPointerDragMove,
  onPointerDragEnd,
}: {
  name: string;
  meta: BlockMeta;
  viewMode: "single" | "double";
  previewViewport: "desktop" | "mobile";
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

  const explainDrag = () => {
    if (unavailable) {
      message.info(`“${meta.name}”最多可添加 ${limit} 个`);
      return;
    }
    message.info("按住模块并拖到画布中的目标位置");
  };

  return (
    <article
      className={`homepage-editor__template-card${unavailable ? " is-disabled" : ""}${viewMode === "double" ? " is-compact" : ""}`}
    >
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
        title={
          unavailable ? `${meta.name}已达可添加上限` : `拖拽${meta.name}到画布`
        }
      >
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
          <span className="homepage-editor__template-add">拖到画布</span>
        </span>
        <span className="homepage-editor__template-name">{meta.name}</span>
        <span className="homepage-editor__template-description">
          {meta.description}
        </span>
      </button>
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
  onTemplatePointerDragMove,
  onTemplatePointerDragEnd,
  onSaveAsTemplate,
}: {
  pageKey: EditorPageKey;
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
  onSaveAsTemplate: (type: string, props: Record<string, any>) => void;
}) {
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
  const [myTemplates, setMyTemplates] = useState<BlockTemplate[]>(() =>
    blockTemplateStore.getAll(),
  );
  const [frameworkOverviewOpen, setFrameworkOverviewOpen] = useState(false);

  useEffect(() => {
    window.localStorage.setItem("homepage-editor-template-view-mode", viewMode);
  }, [viewMode]);

  const refreshMyTemplates = useCallback(() => {
    setMyTemplates(blockTemplateStore.getAll());
  }, []);

  // 「保存为个人常用方案」弹窗逻辑由主编辑器组件定义并经 props 传入,此处不重复实现。

  const entries = useMemo(
    () =>
      Object.entries(BLOCK_META)
        .filter(([name, meta]) => {
          if (!isContentTemplateInsertable(name)) return false;
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
    [keyword],
  );
  const insertableTemplateCount = useMemo(
    () =>
      Object.keys(BLOCK_META).filter((name) =>
        isContentTemplateInsertable(name),
      ).length,
    [],
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

  if (libraryCollapsed) {
    return (
      <aside
        className="homepage-editor__library homepage-editor__library--collapsed"
        aria-label="模板组件库（已收起）"
      >
        <button
          type="button"
          className="homepage-editor__library-expand-btn"
          onClick={toggleLibrary}
          title="展开模板组件库"
          aria-label="展开模板组件库"
        >
          <AppstoreOutlined />
          <span>模板组件库</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="homepage-editor__library" aria-label="模板组件库">
      <div className="homepage-editor__library-tools">
        <div className="homepage-editor__panel-header">
          <button
            type="button"
            className="homepage-editor__library-collapse-btn"
            onClick={toggleLibrary}
            title="收起模板组件库"
            aria-label="收起模板组件库"
          >
            ‹
          </button>
          <span className="homepage-editor__region-title">
            <AppstoreOutlined />
            模板组件库
          </span>
          <button
            type="button"
            className="homepage-editor__library-overview-btn"
            onClick={() => setFrameworkOverviewOpen(true)}
            title="查看 23 个内容模板结构总览"
            aria-label="查看 23 个内容模板结构总览"
          >
            <InfoCircleOutlined />
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

      <Modal
        open={frameworkOverviewOpen}
        onCancel={() => setFrameworkOverviewOpen(false)}
        footer={null}
        width="min(1180px, calc(100vw - 32px))"
        title="内容模板基础框架总览"
        styles={{ body: { maxHeight: "72vh", overflow: "auto", padding: 20 } }}
      >
        <ContentTemplateFrameworkOverview />
      </Modal>

      <div
        className={`homepage-editor__template-scroll${viewMode === "double" ? " is-double" : ""}`}
      >
        {entries.length > 0 || myTemplates.length > 0 ? (
          <>
            {myTemplates.length > 0 ? (
              <section
                className="homepage-editor__template-group"
                aria-labelledby="template-group-saved"
              >
                <h3 id="template-group-saved">个人常用方案</h3>
                <div className="homepage-editor__template-group-grid">
                  {myTemplates.map((tpl) => (
                    <article
                      className="homepage-editor__template-card"
                      key={tpl.id}
                    >
                      <button
                        type="button"
                        className="homepage-editor__template-card-main"
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
                          const updated = {
                            ...appData,
                            content: [
                              ...(appData.content ?? []),
                              migratedBlock,
                            ],
                          };
                          dispatch({ type: "setData", data: updated });
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
                      </button>
                      <button
                        type="button"
                        className="homepage-editor__template-favorite"
                        onClick={() => {
                          blockTemplateStore.remove(tpl.id);
                          refreshMyTemplates();
                        }}
                        title="删除此个人常用方案"
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
  publishIssues,
  validationState,
}: {
  hasUnsavedChanges: boolean;
  saving: boolean;
  onSaveDraft: () => void;
  publishIssues: PublishValidationIssue[];
  validationState: PublishValidationState;
}) {
  const selectedItem = useHomepagePuck((state) => state.selectedItem);
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
            <span>已添加模块的图片、文案与排序都会保留。</span>
          </div>
        </div>
      </section>
    );
  }

  // 分派：全部 25 个组件(23 内容模板 + 网站全局设置/业务功能区)走 Schema 注册表。
  const inspectorSchema = getInspectorSchema(selectedItem.type);
  if (inspectorSchema) {
    return (
      <SchemaInspectorPanel
        schema={inspectorSchema}
        hasUnsavedChanges={hasUnsavedChanges}
        saving={saving}
        onSaveDraft={onSaveDraft}
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

function EditorBody({
  onSaveAsTemplate,
  pageKey,
  pageLabel,
  pageMode,
  hasUnsavedChanges,
  saving,
  onSaveDraft,
  publishIssues,
  validationState,
}: {
  onSaveAsTemplate: (type: string, props: Record<string, any>) => void;
  pageKey: EditorPageKey;
  pageLabel: string;
  pageMode: "brand" | "commerce";
  hasUnsavedChanges: boolean;
  saving: boolean;
  onSaveDraft: (data: unknown) => void;
  publishIssues: PublishValidationIssue[];
  validationState: PublishValidationState;
}) {
  const appData = useHomepagePuck((state) => state.appState.data);
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
      ? window.matchMedia("(max-width: 1199px)").matches
      : false,
  );
  useEffect(() => {
    const compactWorkspace = window.matchMedia("(max-width: 1199px)");
    const syncStructureRail = (event: MediaQueryListEvent) => {
      setStructureCollapsed(event.matches);
    };
    compactWorkspace.addEventListener("change", syncStructureRail);
    return () => {
      compactWorkspace.removeEventListener("change", syncStructureRail);
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
  useEffect(() => {
    const handleVisualEdit = (event: MessageEvent<CanvasVisualEditMessage>) => {
      const detail = event.data;
      const iframe = previewFrameRef.current?.querySelector<HTMLIFrameElement>("iframe");
      if (
        event.origin !== window.location.origin ||
        event.source !== iframe?.contentWindow ||
        detail?.type !== CANVAS_VISUAL_EDIT_MESSAGE ||
        typeof detail.blockId !== "string" ||
        typeof detail.moduleType !== "string" ||
        (detail.overrides !== undefined &&
          (!isVisualRecord(detail.overrides) || detail.overrides.version !== 2))
      ) {
        return;
      }
      const contentIndex = appData.content.findIndex(
        (item: { type?: string; props?: Record<string, unknown> }) =>
          item.type === detail.moduleType && item.props?.id === detail.blockId,
      );
      if (contentIndex < 0) return;
      const current = appData.content[contentIndex] as {
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
      dispatch({
        type: "replace",
        destinationIndex: contentIndex,
        destinationZone: ROOT_ZONE,
        data: nextItem,
      });
    };
    window.addEventListener("message", handleVisualEdit);
    return () => window.removeEventListener("message", handleVisualEdit);
  }, [appData, dispatch]);
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

  const adjustCanvasZoom = (delta: number) => {
    setIsFitView(false);
    setCanvasZoom((current) => Math.min(1, Math.max(0.16, current + delta)));
  };

  const insertTemplate = useCallback(
    (templateName: string, insertionIndex: number) => {
      const meta = BLOCK_META[templateName];
      if (!meta) return;
      const displayName = meta.name;
      const usedCount = appData.content.filter(
        (item: { type: string }) => item.type === templateName,
      ).length;
      if (usedCount >= (meta.limit ?? 5)) {
        message.info(`“${displayName}”已达到可添加上限`);
        clearDragState();
        return;
      }

      const nextContent = [...appData.content];
      nextContent.splice(
        insertionIndex,
        0,
        createBlockContent(templateName) as (typeof appData.content)[number],
      );
      dispatch({
        type: "setData",
        data: { ...appData, content: nextContent },
      });
      dispatch({
        type: "setUi",
        ui: { itemSelector: { index: insertionIndex, zone: ROOT_ZONE } },
      });
      message.success(`已插入“${displayName}”，可在右侧继续编辑`);
      clearDragState();
    },
    [appData, clearDragState, dispatch],
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

  const dropPosition =
    appData.content.length === 0 || dropIndex === null
      ? 50
      : (dropIndex / appData.content.length) * 100;

  return (
    <main
      className={`homepage-editor__body${isInspecting ? " is-inspecting" : ""}`}
    >
      <TemplateLibrary
        pageKey={pageKey}
        onTemplatePointerDragMove={handleTemplatePointerDragMove}
        onTemplatePointerDragEnd={handleTemplatePointerDragEnd}
        onSaveAsTemplate={onSaveAsTemplate}
      />

      <aside
        className={`homepage-editor__structure-workspace${structureCollapsed ? " is-collapsed" : ""}`}
        aria-label="图层面板"
      >
        {structureCollapsed ? (
          <button
            type="button"
            className="homepage-editor__structure-expand-btn"
            onClick={() => setStructureCollapsed(false)}
            title="展开图层面板"
            aria-label="展开图层面板"
          >
            <BlockOutlined />
            <span>图层面板</span>
          </button>
        ) : (
          <>
            <div className="homepage-editor__panel-header">
              <span className="homepage-editor__region-title">
                <BlockOutlined />
                图层面板
              </span>
              <button
                type="button"
                className="homepage-editor__structure-collapse-btn"
                onClick={() => setStructureCollapsed(true)}
                title="收起图层面板"
                aria-label="收起图层面板"
              >
                <CloseOutlined />
              </button>
            </div>
            <LayerRail
              onSaveAsTemplate={onSaveAsTemplate}
              navigationPreviewOpen={navigationPreviewOpen}
              onToggleNavigationPreview={toggleNavigationPreview}
              scrollSpyIndex={scrollSpyIndex}
              publishIssues={publishIssues}
              validationState={validationState}
            />
          </>
        )}
      </aside>

      <section
        className="homepage-editor__stage"
        aria-label={`${pageLabel}画布`}
      >
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
            className="homepage-editor__inspector-expand-btn"
            onClick={() => setInspectorCollapsed(false)}
            title="展开属性面板"
            aria-label="展开属性面板"
          >
            <span>属性面板</span>
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
                className="homepage-editor__inspector-collapse-btn"
                onClick={() => setInspectorCollapsed(true)}
                title="收起属性面板"
                aria-label="收起属性面板"
              >
                ›
              </button>
            </div>
            <InspectorPanel
              hasUnsavedChanges={hasUnsavedChanges}
              saving={saving}
              onSaveDraft={() => onSaveDraft(appData)}
              publishIssues={publishIssues}
              validationState={validationState}
            />
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
  const navigate = useNavigate();
  const [data, setData] = useState<any>(() => createEditorPageDefault(pageKey));
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishIssues, setPublishIssues] = useState<PublishValidationIssue[]>(
    [],
  );
  const [publishValidationState, setPublishValidationState] =
    useState<PublishValidationState>("stale");
  const [validationRevision, setValidationRevision] = useState(0);
  const validationRequestRef = useRef(0);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [revisionsOpen, setRevisionsOpen] = useState(false);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [revisions, setRevisions] = useState<PageDocumentRevision[]>([]);
  const [restoringVersion, setRestoringVersion] = useState<number | null>(null);
  const [draftSnapshot, setDraftSnapshot] = useState<PageDraftSnapshot | null>(
    null,
  );
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const hasInitializedEditorRef = useRef(false);
  const activePageKeyRef = useRef(pageKey);
  const latestData = useRef<any>(data);
  const pageSessionCacheRef = useRef<Record<string, PageSessionCache>>({});
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const dataSignatureRef = useRef("");  const [metadata, setMetadata] = useState<Record<string, any>>({});
  const latestMetadata = useRef<Record<string, any>>({});
  const [pageSettingsOpen, setPageSettingsOpen] = useState(false);
  // 是否存在尚未发布的草稿修改。
  const [hasPendingDraft, setHasPendingDraft] = useState(false);
  const pendingDraftRef = useRef<any>(null);
  const publishedBaselineRef = useRef<any>(null);
  const publishedDataRef = useRef<any>(null);
  // 当前画布是否展示线上已发布版本（“查看线上版本”模式）。
  const [viewingPublished, setViewingPublished] = useState(false);
  // 供画布编辑回调读取最新“查看线上版本”状态，避免闭包过期。
  const viewingPublishedRef = useRef(false);
  // 草稿最后保存时间（仅用于“正在编辑草稿”状态展示）。
  const [draftSavedAtLabel, setDraftSavedAtLabel] = useState<string | null>(
    null,
  );
  // 线上版本的 metadata，供“查看线上版本”时还原。
  const publishedMetadataRef = useRef<Record<string, any>>({});

  useEffect(() => {
    activePageKeyRef.current = pageKey;
  }, [pageKey]);

  useEffect(() => {
    viewingPublishedRef.current = viewingPublished;
  }, [viewingPublished]);

  const [myTemplates, setMyTemplates] = useState<BlockTemplate[]>(() =>
    blockTemplateStore.getAll(),
  );

  const refreshMyTemplates = useCallback(() => {
    setMyTemplates(blockTemplateStore.getAll());
  }, []);

  const saveBlockAsTemplate = useCallback(
    (blockType: string, blockProps: Record<string, any>) => {
      const moduleDisplayName = getModuleDisplayName(blockType);
      Modal.confirm({
        title: "保存为个人常用方案",
        content: (
          <div style={{ marginTop: 8 }}>
            <p style={{ margin: "0 0 8px", color: "var(--adm-text)", fontSize: 12 }}>
              仅在当前浏览器中保存当前模块的内容与受控预设，不会同步给其他账号或成员。
            </p>
            <label style={{ fontSize: 12, color: "var(--adm-text-strong)" }}>
              方案名称
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
          </div>
        ),
        okText: "保存方案",
        cancelText: "取消",
        onOk: () => {
          const input = document.getElementById(
            "block-template-name-input",
          ) as HTMLInputElement | null;
          const name = input?.value?.trim() || `我的${moduleDisplayName}`;
          blockTemplateStore.save(name, blockType, blockProps);
          refreshMyTemplates();
          message.success(`「${name}」已保存为个人常用方案`);
        },
      });
    },
    [refreshMyTemplates],
  );
  const editorConfig = useMemo(
    () =>
      ({
        ...puckConfig,
        root: {
          ...puckConfig.root,
          render: ({ children }: { children: ReactNode }) => (
            <EditorCanvasShell
              isHome={pageKey === "home"}
              headerMode={getEditorPage(pageKey).headerMode}
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
                const rendered = (component as any).render(props);
                // 画布内统一注入 editMode，让 block 区分编辑预览与前台发布
                const editableBlock = isValidElement(rendered)
                  ? cloneElement(rendered, { editMode: true } as any)
                  : rendered;
                return (
                  <CanvasBlockAnchor blockId={props.id} blockType={type}>
                    {editableBlock}
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
      let serverData = createEditorPageDefault(pageKey);
      const cachedPage = pageSessionCacheRef.current[pageKey];
      if (!cancelled) {
        setLoadError(null);
        setViewingPublished(false);
        setDraftSavedAtLabel(null);
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
          pageDocumentApi.getPublished(pageKey),
          pageDocumentApi.getAdmin(pageKey),
        ]);
        if (cancelled) return;
        const publishedDoc = unwrapResponse<any>(publishedResponse);
        const adminDoc = unwrapResponse<any>(adminResponse);
        const publishedPuck = publishedDoc?.puckData ?? null;
        const draftPuck = adminDoc?.puckData ?? null;

        const nextHasPublished = Boolean(publishedPuck);
        // 草稿差异判定须同时比较 content 与 metadata：
        // 仅改 SEO 等 metadata 而未动内容的草稿，此前会被误判为“与线上一致”，
        // 导致刷新后既不提示草稿、也不提供“继续编辑草稿”入口。
        const nextHasPendingDraft =
          nextHasPublished &&
          Boolean(draftPuck) &&
          canonicalizePageContent(draftPuck, adminDoc?.metadata) !==
            canonicalizePageContent(publishedPuck, publishedDoc?.metadata);

        publishedMetadataRef.current = publishedDoc?.metadata || {};

        // 展示基准（2026-08-19 用户决策）：刷新后始终优先展示线上已发布版本，
        // 让模板/页面更新第一时间可见；存在未发布草稿时通过徽标与
        // 「继续编辑草稿」入口提示，仅在从未发布过时回退到草稿继续编辑。
        if (publishedPuck || draftPuck) {
          const viewingPublishedNow = Boolean(publishedPuck);
          const displayPuck = publishedPuck || draftPuck;
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
        setDraftSavedAtLabel(
          nextHasPendingDraft && adminDoc?.updatedAt
            ? formatEditorTime(adminDoc.updatedAt)
            : null,
        );
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
          setInitialLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadAttempt, pageKey]);

  useEffect(() => {
    dataSignatureRef.current = dataSignature(data);
  }, [data]);

  const trackEditorData = useCallback((nextData: unknown) => {
    latestData.current = nextData;
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
  }, []);

  useEffect(() => {
    if (initialLoading || loadError) return;
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
          setPublishIssues(
            result.issues ??
              result.errors.map((message) => ({ message, severity: "error" as const })),
          );
          setPublishValidationState("current");
        })
        .catch((error) => {
          if (controller.signal.aborted || requestId !== validationRequestRef.current) return;
          setPublishValidationState("error");
          if (import.meta.env.DEV) console.warn("[PageDocument validate]", error);
        });
    }, 650);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [initialLoading, loadError, metadata, pageKey, validationRevision]);

  const saveDraft = useCallback(
    async (
      nextData: unknown,
      options: { silent?: boolean } = {},
    ): Promise<boolean> => {
      const targetPageKey = pageKey;
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
          const updatedAt =
            typeof savedDocument?.updatedAt === "string"
              ? savedDocument.updatedAt
              : pageSessionCacheRef.current[targetPageKey]?.updatedAt ||
                new Date().toISOString();
          const lastSavedAt = formatEditorTime(updatedAt);
          pageSessionCacheRef.current[targetPageKey] = {
            data: editableData,
            metadata: requestedMetadata,
            lastSaved: lastSavedAt,
            updatedAt,
          };

          if (!isActivePage()) return true;
          const hasNewerLocalChanges =
            JSON.stringify(latestData.current) !== JSON.stringify(editableData);
          if (hasNewerLocalChanges) {
            setHasUnsavedChanges(true);
          } else {
            setData(editableData);
            latestData.current = editableData;
            setHasUnsavedChanges(false);
          }
          setHasPendingDraft(
            publishedBaselineRef.current != null &&
              canonicalizePageContent(editableData, requestedMetadata) !==
                publishedBaselineRef.current,
          );
          setViewingPublished(false);
          if (!options.silent) message.success("页面草稿已保存");
          return true;
        } catch (error) {
          if (!isActivePage()) return false;
          const isConflict = getEditorHttpStatus(error) === 409;
          if (isConflict) {
            Modal.confirm({
              title: "检测到其他人更新了这份页面草稿",
              content:
                "当前画布修改仍完整保留。你可以继续留在本地核对，或明确放弃本地修改并重新加载远端草稿。",
              okText: "重新加载远端草稿",
              cancelText: "保留本地修改",
              okButtonProps: { danger: true },
              onOk: () => setLoadAttempt((attempt) => attempt + 1),
            });
          } else if (!options.silent) {
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
    [pageKey],
  );

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
    if (!hasUnsavedChanges) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedChanges]);

  // 草稿保护（2026-08-16 起的显式保存模型）：
  // 1. useBlocker（UnsavedChangesGuard）：SPA 路由跳转弹三选项（保存并离开/直接离开/继续编辑）；
  // 2. beforeunload：拦截刷新 / 关闭；
  // 3. 显式动作（发布前保存、页面设置保存）各自先保存再执行。

  const loadRevisions = useCallback(async () => {
    setRevisionsLoading(true);
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
      message.error(
        error instanceof Error ? error.message : "版本列表加载失败",
      );
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
      setData(structured);
      latestData.current = structured;
      dataSignatureRef.current = dataSignature(structured);
      if (draftMetadata) {
        setMetadata(draftMetadata);
        latestMetadata.current = draftMetadata;
      }
      setHasUnsavedChanges(false);
      pendingDraftRef.current = null;
      setViewingPublished(false);
    },
    [pageKey],
  );

  const editDraftFromRevisions = useCallback(() => {
    if (!draftSnapshot?.puckData) return;
    applyDraftToCanvas(draftSnapshot.puckData, draftSnapshot.metadata);
    setRevisionsOpen(false);
    message.success("已加载未发布草稿，可继续编辑或重新发布");
  }, [applyDraftToCanvas, draftSnapshot]);

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
  }, [pageKey, applyDraftToCanvas]);

  const editPendingDraft = useCallback(() => {
    if (hasUnsavedChanges) {
      Modal.confirm({
        title: "加载未发布草稿？",
        content: "当前画布存在尚未保存的修改，加载草稿会覆盖这些修改。",
        okText: "加载草稿",
        cancelText: "取消",
        onOk: () => void loadDraftIntoCanvas(),
      });
      return;
    }
    void loadDraftIntoCanvas();
  }, [hasUnsavedChanges, loadDraftIntoCanvas]);

  const applyPublishedToCanvas = useCallback(() => {
    if (!publishedDataRef.current) return;
    setData(publishedDataRef.current);
    latestData.current = publishedDataRef.current;
    dataSignatureRef.current = dataSignature(publishedDataRef.current);
    setMetadata(publishedMetadataRef.current);
    latestMetadata.current = publishedMetadataRef.current;
    setHasUnsavedChanges(false);
    setViewingPublished(true);
  }, []);

  const viewPublishedVersion = useCallback(() => {
    if (hasUnsavedChanges) {
      Modal.confirm({
        title: "查看线上版本？",
        content: "画布上存在未保存修改，查看线上版本会暂时离开当前编辑内容。",
        okText: "查看线上版本",
        cancelText: "取消",
        onOk: applyPublishedToCanvas,
      });
      return;
    }
    applyPublishedToCanvas();
  }, [hasUnsavedChanges, applyPublishedToCanvas]);

  const discardDraftToPublished = useCallback(() => {
    Modal.confirm({
      title: "放弃当前草稿并恢复线上版本？",
      content:
        "当前草稿的全部未发布修改将丢失，画布回到线上已发布版本；此操作不可撤销。",
      okText: "放弃草稿",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        if (!publishedDataRef.current) return;
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
          message.error(
            error instanceof Error ? error.message : "放弃草稿失败，请刷新后重试",
          );
          return;
        }
        setData(publishedDataRef.current);
        latestData.current = publishedDataRef.current;
        dataSignatureRef.current = dataSignature(publishedDataRef.current);
        setMetadata(publishedMetadataRef.current);
        latestMetadata.current = publishedMetadataRef.current;
        setHasUnsavedChanges(false);
        setHasPendingDraft(false);
        setViewingPublished(false);
        pendingDraftRef.current = null;
        setDraftSavedAtLabel(null);
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
  }, [pageKey]);

  const openRevisions = useCallback(() => {
    setRevisionsOpen(true);
    void loadRevisions();
  }, [loadRevisions]);

  const savePageSettings = useCallback(
    (next: {
      seoTitle?: string;
      seoDescription?: string;
      ogImage?: string;
    }) => {
      const merged = { ...latestMetadata.current, ...next };
      setMetadata(merged);
      latestMetadata.current = merged;
      setPageSettingsOpen(false);
      void saveDraft(latestData.current, { silent: true });
    },
    [saveDraft],
  );

  const restoreRevision = useCallback(
    (revision: PageDocumentRevision) => {
      Modal.confirm({
        title: `恢复版本 ${revision.version}？`,
        content:
          "恢复后会覆盖当前后台草稿，但不会立即影响前台首页。确认后可继续编辑或重新发布。",
        okText: "恢复到草稿",
        cancelText: "取消",
        onOk: async () => {
          setRestoringVersion(revision.version);
          try {
            const response = await pageDocumentApi.restoreRevision(
              pageKey,
              revision.version,
            );
            const document = unwrapResponse<any>(response);
            if (document?.puckData) {
              setData(document.puckData);
              latestData.current = document.puckData;
              const restoredMetadata = document.metadata || {};
              setMetadata(restoredMetadata);
              latestMetadata.current = restoredMetadata;
              setHasUnsavedChanges(false);
              setHasPendingDraft(
                publishedBaselineRef.current != null &&
                  canonicalizePageContent(document.puckData, restoredMetadata) !==
                    publishedBaselineRef.current,
              );
              setViewingPublished(false);
              pendingDraftRef.current = null;
              const restoredUpdatedAt =
                document.updatedAt || new Date().toISOString();
              const restoredLastSaved = formatEditorTime(restoredUpdatedAt);
              pageSessionCacheRef.current[pageKey] = {
                data: document.puckData,
                metadata: restoredMetadata,
                lastSaved: restoredLastSaved,
                updatedAt: restoredUpdatedAt,
              };
            }
            message.success(`已恢复版本 ${revision.version} 到草稿`);
            setRevisionsOpen(false);
          } catch (error) {
            message.error(
              error instanceof Error ? error.message : "版本恢复失败",
            );
          } finally {
            setRestoringVersion(null);
          }
        },
      });
    },
    [pageKey],
  );

  const publishHome = async (
    nextData: unknown,
    locateBlock?: (blockIndex: number) => void,
  ) => {
    if (publishing) return;
    const editableData = nextData ?? latestData.current;

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
        error instanceof Error ? error.message : "发布前校验失败，请稍后重试",
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

    if (validation && !validation.valid && validation.errors?.length) {
      const errorIssues: PublishValidationIssue[] = validation.issues?.filter(
        (issue) => issue.severity === "error",
      ) ?? validation.errors.map<PublishValidationIssue>((message) => ({
        message,
        severity: "error",
      }));
      setPublishIssues(errorIssues);
      const firstIssue = errorIssues.find((issue) => issue.blockId);
      const firstBlockIndex = firstIssue?.blockId
        ? blocks.findIndex((block) => block.props?.id === firstIssue.blockId)
        : -1;
      if (firstBlockIndex >= 0 && locateBlock) {
        locateBlock(firstBlockIndex);
      }
      message.warning(
        firstBlockIndex >= 0
          ? `还有 ${validation.errors.length} 处内容待完善，已定位到第一处`
          : `还有 ${validation.errors.length} 处内容待完善，请检查图层栏标出的模块`,
      );
      return;
    }
    setPublishIssues([]);

    const usesMobileFallback = blocks.some(
      (block) =>
        (block.type === "首屏主视觉" ||
          block.type === "单图海报" ||
          block.type === "全屏出血图" ||
          block.type === "热区图") &&
        Boolean(block.props?.desktopImage || block.props?.image) &&
        !block.props?.mobileImage,
    );
    Modal.confirm({
      title: "确认发布首页？",
      content: usesMobileFallback
        ? "部分模块未上传移动端图片，移动端会复用对应桌面图，可能产生裁切。你仍可发布。"
        : "发布后，当前店铺首页将立即更新为本次编辑内容。",
      okText: "确认发布",
      cancelText: "继续检查",
      onOk: async () => {
        setPublishing(true);
        try {
          const saved = await saveDraft(editableData, { silent: true });
          if (!saved) return;
          const publishResponse = await pageDocumentApi.publish(
            pageKey,
            undefined,
            pageSessionCacheRef.current[pageKey]?.updatedAt || undefined,
          );
          const publishedDocument = unwrapResponse<any>(publishResponse);
          pageSessionCacheRef.current[pageKey] = {
            data: editableData,
            metadata: latestMetadata.current,
            lastSaved: formatEditorTime(
              publishedDocument?.updatedAt || new Date(),
            ),
            updatedAt:
              publishedDocument?.updatedAt ||
              pageSessionCacheRef.current[pageKey]?.updatedAt ||
              null,
          };
          setData(editableData);
          latestData.current = editableData;
          setHasUnsavedChanges(false);
          setHasPendingDraft(false);
          setViewingPublished(false);
          setDraftSavedAtLabel(null);
          publishedBaselineRef.current = canonicalizePuckContent(editableData);
          pendingDraftRef.current = null;
          void loadRevisions();
          message.success("店铺首页已发布，前台页面将立即读取最新版本");
        } catch (error) {
          message.error(
            error instanceof Error ? error.message : "发布失败，请稍后重试",
          );
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
        onClose={() => setRevisionsOpen(false)}
        onRestore={restoreRevision}
        onEditDraft={editDraftFromRevisions}
      />

      <PageSettingsDrawer
        open={pageSettingsOpen}
        metadata={metadata}
        onClose={() => setPageSettingsOpen(false)}
        onSave={savePageSettings}
      />

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
      ) : initialLoading ? (
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
          permissions={{ drag: false }}
          iframe={{ enabled: true, waitForStyles: true, syncHostStyles: true }}
          onPublish={(nextData) => {
            setData(nextData);
            latestData.current = nextData;
          }}
          overrides={{
            header: () => <span style={{ display: "none" }} />,
            headerActions: () => <span style={{ display: "none" }} />,
            // 画布只保留 Puck 的选择轮廓；排序与删除统一回到图层面板，
            // 避免常驻操作浮岛覆盖真实图片、标题和前台交互热区。
            componentOverlay: ({ children }) => <>{children}</>,
          }}
        >
          <CanvasPageDataSynchronizer data={data} pageKey={pageKey} />
          <EditorToolbar
            pageKey={pageKey}
            publishing={publishing}
            saving={saving}
            hasPendingDraft={hasPendingDraft}
            viewingPublished={viewingPublished}
            hasUnsavedChanges={hasUnsavedChanges}
            publishValidationState={publishValidationState}
            publishErrorCount={publishIssues.filter(
              (issue) => issue.severity === "error",
            ).length}
            draftSavedAtLabel={draftSavedAtLabel}
            onPublish={publishHome}
            onSaveDraft={(nextData) => {
              void saveDraft(nextData);
            }}
            onEditPendingDraft={editPendingDraft}
            onViewPublishedVersion={viewPublishedVersion}
            onDiscardDraft={discardDraftToPublished}
            onOpenRevisions={openRevisions}
            onOpenPageSettings={() => setPageSettingsOpen(true)}
            onDataChange={trackEditorData}
            onExitViewing={() => {
              viewingPublishedRef.current = false;
              setViewingPublished(false);
            }}
          />
          <EditorBody
            onSaveAsTemplate={saveBlockAsTemplate}
            pageKey={pageKey}
            pageLabel={getEditorPage(pageKey).label}
            pageMode={getEditorPage(pageKey).mode}
            hasUnsavedChanges={hasUnsavedChanges}
            saving={saving}
            onSaveDraft={(nextData) => {
              void saveDraft(nextData);
            }}
            publishIssues={publishIssues}
            validationState={publishValidationState}
          />
        </Puck>
      )}
      <UnsavedChangesGuard
        hasUnsavedChanges={hasUnsavedChanges}
        disabled={initialLoading || Boolean(loadError)}
        onSaveAndLeave={async () =>
          Boolean(await saveDraft(latestData.current))
        }
      />
    </div>
  );
}
