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
import { Button, Drawer, Input, Modal, Spin, Upload, message } from "antd";
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
  HistoryOutlined,
  MenuOutlined,
  MobileOutlined,
  RollbackOutlined,
  SaveOutlined,
  SearchOutlined,
  SendOutlined,
  SettingOutlined,
  TabletOutlined,
  UndoOutlined,
  RedoOutlined,
  UpOutlined,
  DownOutlined,
  InboxOutlined,
  SwapOutlined,
} from "@ant-design/icons";
import { Puck, createUsePuck, type UiState } from "@puckeditor/core";
import { useNavigate } from "react-router-dom";
import "@puckeditor/core/puck.css";
import { puckConfig } from "@/page-builder/config/puckConfig";
import {
  BLOCK_META,
  BLOCK_PREVIEW_KIND,
  BLOCK_CATEGORIES,
  TEMPLATE_MEDIA_HINT,
  type BlockMeta,
} from "@/page-builder/config/blockMeta";
import { pageDocumentApi, uploadApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import MediaRequirementPanel from "@/page-builder/fields/MediaRequirementPanel";
import MediaPickerField, { type MediaSpec } from "@/page-builder/fields/MediaPickerField";
import ProductIdsField from "@/page-builder/fields/ProductIdsField";
import ColorField from "@/page-builder/fields/ColorField";
import { IMAGE_SPECS } from "@/page-builder/config/imageSpecs";
import {
  HOTSPOT_CONTRACT,
  HERO_CONTRACT,
  FULL_BLEED_CONTRACT,
  DOUBLE_POSTER_CONTRACT,
  FEATURED_PRODUCT_CONTRACT,
  CATEGORY_CARDS_CONTRACT,
  APPOINTMENT_CONTRACT,
  IMAGE_TEXT_CONTRACT,
  PRODUCT_ROW_CONTRACT,
  SINGLE_POSTER_CONTRACT,
  evaluateHotspotContract,
  evaluateHeroContract,
  evaluateFullBleedContract,
  evaluateDoublePosterContract,
  evaluateFeaturedProductContract,
  evaluateCategoryCardsContract,
  evaluateAppointmentContract,
  evaluateImageTextContract,
  evaluateProductRowContract,
  evaluateSinglePosterContract,
  type ModuleContractStatus,
} from "@/page-builder/config/blockContracts";
import { blockTemplateStore, type BlockTemplate } from "@/page-builder/templates/blockTemplateStore";
import StorefrontNavigation from "@/components/layout/StorefrontNavigation";
import InspectorSection from "@/page-builder/inspector/InspectorSection";
import ImageStatus from "@/page-builder/inspector/ImageStatus";
import FocusPicker from "@/page-builder/inspector/FocusPicker";
import LinkTargetField from "@/page-builder/inspector/LinkTargetField";
import {
  createEditorPageDefault,
  ensureEditorPageStructure,
  editorPages,
  getEditorPage,
  getEditorPageByPath,
  type EditorPageKey,
} from "@/page-builder/config/editorPages";

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

type PageSessionCache = {
  data: any;
  metadata: Record<string, any>;
  lastSaved: string | null;
  updatedAt: string | null;
};

function cloneModuleProps<T extends Record<string, any>>(props: T): T {
  return JSON.parse(JSON.stringify(props)) as T;
}

function getModuleDisplayName(type: string, props?: Record<string, any>) {
  return typeof props?.moduleName === "string" && props.moduleName.trim()
    ? props.moduleName.trim()
    : BLOCK_META[type]?.name ?? type;
}

function formatEditorTime(value?: string | Date | null) {
  if (!value) return "";
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getEditorErrorMessage(error: unknown, fallback: string) {
  const responseMessage = (error as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  if (typeof responseMessage === "string" && responseMessage.trim()) return responseMessage;
  if (Array.isArray(responseMessage)) return responseMessage.filter((item) => typeof item === "string").join("；") || fallback;
  return error instanceof Error && error.message ? error.message : fallback;
}

function getEditorHttpStatus(error: unknown) {
  const status = (error as { response?: { status?: unknown } })?.response?.status;
  return typeof status === "number" ? status : undefined;
}

const VIEWPORT_PRESETS: ViewportPreset[] = [
  { label: "桌面端", icon: <DesktopOutlined />, width: 1440, height: 900 },
  { label: "平板端", icon: <TabletOutlined />, width: 768, height: 1024 },
  { label: "移动端", icon: <MobileOutlined />, width: 390, height: 844 },
];

// 固定由顶部设备切换器控制预览尺寸，避免 Puck 根据浏览器窗口宽度回写为桌面端。
const INITIAL_EDITOR_UI: Partial<UiState> = {
  viewports: {
    current: { width: 1440, height: 900 },
    options: [],
    controlsVisible: false,
  },
};


const ROOT_ZONE = "root:default-zone";
const CANVAS_FOCUS_MESSAGE = "homepage-editor:focus-block";
const CANVAS_HEIGHT_MESSAGE = "homepage-editor:canvas-height";
const CANVAS_NAVIGATION_MESSAGE = "homepage-editor:navigation-preview";
const CANVAS_NAVIGATION_STATE_MESSAGE = "homepage-editor:navigation-state";
const CANVAS_PAGE_NAVIGATION_MESSAGE = "homepage-editor:page-navigation";

type CanvasFocusMessage = {
  type: typeof CANVAS_FOCUS_MESSAGE;
  blockId: string;
  field?: string;
};

type CanvasHeightMessage = {
  type: typeof CANVAS_HEIGHT_MESSAGE;
  height: number;
};

type CanvasNavigationMessage = {
  type: typeof CANVAS_NAVIGATION_MESSAGE;
  open: boolean;
};

type CanvasNavigationStateMessage = {
  type: typeof CANVAS_NAVIGATION_STATE_MESSAGE;
  open: boolean;
};

type CanvasPageNavigationMessage = {
  type: typeof CANVAS_PAGE_NAVIGATION_MESSAGE;
  path: string;
};

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

type InspectorGuideItem = {
  field: string;
  label: string;
  placement: string;
  kind: "media" | "text";
  device?: "desktop" | "mobile" | "shared";
};

type InspectorMediaItem = {
  field: string;
  label: string;
  placement: string;
  device: "desktop" | "mobile" | "shared";
  required: boolean;
  spec: MediaSpec;
  placeholder: string;
  carouselIndex?: number;
  previewAspectRatio?: string;
  previewFocus?: { x: number; y: number };
};

const CAROUSEL_MOBILE_SPEC: MediaSpec = {
  width: 750,
  height: 1000,
  ratio: "3:4",
  label: "手机端轮播图（建议 750×1000，3:4）",
};

type InspectorDevice = "desktop" | "mobile";

function createCropPreview(aspectRatio: string, focusX = 50, focusY = 50) {
  return {
    previewAspectRatio: aspectRatio,
    previewFocus: { x: focusX, y: focusY },
  };
}

/**
 * Puck 画布运行在 iframe 中，宿主页面不能直接操作其 DOM。
 * 通过 postMessage 把“图层/字段定位”交给画布内的锚点处理，避免图层已选中、画布仍停在首屏。
 */
function focusCanvasBlock(blockId?: string, field?: string) {
  if (!blockId) return;
  window.requestAnimationFrame(() => {
    const frame = document.querySelector<HTMLIFrameElement>(
      ".homepage-editor__preview-frame iframe",
    );
    frame?.contentWindow?.postMessage(
      { type: CANVAS_FOCUS_MESSAGE, blockId, field } satisfies CanvasFocusMessage,
      "*",
    );
  });
}

function setCanvasNavigationPreview(open: boolean) {
  window.requestAnimationFrame(() => {
    const frame = document.querySelector<HTMLIFrameElement>(
      ".homepage-editor__preview-frame iframe",
    );
    frame?.contentWindow?.postMessage(
      { type: CANVAS_NAVIGATION_MESSAGE, open } satisfies CanvasNavigationMessage,
      "*",
    );
  });
}

function EditorCanvasFooter() {
  return (
    <footer
      aria-label="全局页脚预览"
      style={{
        padding: "44px clamp(24px, 5vw, 72px)",
        background: "#24211E",
        color: "rgba(255,255,255,.78)",
      }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
        <div>
          <p style={{ margin: 0, color: "#D4B77A", fontSize: 11, letterSpacing: ".2em" }}>HAICHUAN JEWELRY</p>
          <p style={{ margin: "10px 0 0", fontSize: 13 }}>全局页脚 · 联系方式与导航由店铺资料统一管理</p>
        </div>
        <p style={{ margin: 0, alignSelf: "end", color: "rgba(255,255,255,.46)", fontSize: 11 }}>此区同步应用于所有前台页面</p>
      </div>
    </footer>
  );
}

function EditorCanvasShell({ children, isHome }: { children: ReactNode; isHome: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const currentViewport = useHomepagePuck((state) => state.appState.ui.viewports.current);
  const previewViewportHeight = currentViewport.height === "auto" ? 900 : currentViewport.height;

  useEffect(() => {
    const root = rootRef.current;
    const frameWindow = root?.ownerDocument.defaultView;
    if (!frameWindow || frameWindow === window) return;

    const handleNavigationPreview = (event: MessageEvent<CanvasNavigationMessage>) => {
      if (event.source !== frameWindow.parent || event.data?.type !== CANVAS_NAVIGATION_MESSAGE) return;
      setMenuOpen(event.data.open);
    };
    frameWindow.addEventListener("message", handleNavigationPreview);
    return () => frameWindow.removeEventListener("message", handleNavigationPreview);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    const frameWindow = root?.ownerDocument.defaultView;
    if (!frameWindow || frameWindow === window) return;
    frameWindow.parent.postMessage(
      { type: CANVAS_NAVIGATION_STATE_MESSAGE, open: menuOpen } satisfies CanvasNavigationStateMessage,
      "*",
    );
  }, [menuOpen]);

  return (
    <div
      ref={rootRef}
      className="homepage-editor__storefront-frame"
      style={{ "--homepage-editor-preview-height": `${previewViewportHeight}px` } as any}
    >
      <StorefrontNavigation
        isHome={isHome}
        preview
        menuOpen={menuOpen}
        onMenuOpenChange={setMenuOpen}
        onPreviewNavigate={(path) => {
          const frameWindow = rootRef.current?.ownerDocument.defaultView;
          frameWindow?.parent.postMessage(
            { type: CANVAS_PAGE_NAVIGATION_MESSAGE, path } satisfies CanvasPageNavigationMessage,
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
  const currentViewport = useHomepagePuck((state) => state.appState.ui.viewports.current);
  const dispatch = useHomepagePuck((state) => state.dispatch);
  const editorViewportHeight = currentViewport.height === "auto" ? 900 : currentViewport.height;

  useEffect(() => {
    const anchor = anchorRef.current;
    // Puck 通过 Portal 将节点渲染进 iframe，但 React effect 仍在宿主页面执行。
    // 因此必须从节点所属 document 取得 iframe window，而不是直接使用全局 window。
    const frameWindow = anchor?.ownerDocument.defaultView;
    if (!blockId || !anchor || !frameWindow || frameWindow === window) return;

    const handleFocusMessage = (event: MessageEvent<CanvasFocusMessage>) => {
      if (event.source !== frameWindow.parent) return;
      const detail = event.data;
      if (detail?.type !== CANVAS_FOCUS_MESSAGE || detail.blockId !== blockId) return;

      const fieldTarget = detail.field
        ? anchor.querySelector<HTMLElement>(`[data-editor-field~="${detail.field}"]`)
        : null;
      (fieldTarget || anchor).scrollIntoView({ block: "center", behavior: "smooth" });
      setIsFocused(true);
      if (clearFocusTimer.current) frameWindow.clearTimeout(clearFocusTimer.current);
      clearFocusTimer.current = frameWindow.setTimeout(() => setIsFocused(false), 1800);
    };

    frameWindow.addEventListener("message", handleFocusMessage);
    return () => {
      frameWindow.removeEventListener("message", handleFocusMessage);
      if (clearFocusTimer.current) frameWindow.clearTimeout(clearFocusTimer.current);
    };
  }, [blockId]);

  useEffect(() => {
    const anchor = anchorRef.current;
    const frameWindow = anchor?.ownerDocument.defaultView;
    if (!anchor || !frameWindow || frameWindow === window) return;

    // iframe 被内容撑高后，svh/vh 会随 iframe 高度变化，进而使模块再次变高。
    // 使用编辑器当前设备预设，而不是 iframe 的实时高度，保证切换设备后比例仍准确且整页高度稳定。
    const viewportHeight = Math.max(1, Math.round(editorViewportHeight));
    anchor.style.setProperty("--homepage-editor-viewport-height", `${viewportHeight}px`);
    anchor.style.setProperty("--homepage-editor-single-height", `${Math.round(viewportHeight * 1.1)}px`);
    anchor.style.setProperty("--homepage-editor-single-image-height", `${Math.min(860, Math.round(viewportHeight * 0.76))}px`);
    anchor.style.setProperty("--homepage-editor-single-copy-offset", `${Math.round(viewportHeight * 0.22)}px`);
    anchor.style.setProperty("--homepage-editor-double-height", `${Math.round(viewportHeight * 1.18)}px`);
    anchor.style.setProperty("--homepage-editor-double-main-height", `${Math.min(900, Math.max(560, Math.round(viewportHeight * 0.8)))}px`);
    anchor.style.setProperty("--homepage-editor-double-detail-height", `${Math.min(520, Math.max(320, Math.round(viewportHeight * 0.48)))}px`);
    anchor.style.setProperty("--homepage-editor-bleed-height", `${Math.round(viewportHeight * 0.9)}px`);
    anchor.style.setProperty("--homepage-editor-bleed-bottom-padding", `${Math.min(80, Math.max(38, Math.round(viewportHeight * 0.07)))}px`);
  }, [editorViewportHeight]);

  useEffect(() => {
    const anchor = anchorRef.current;
    const frameWindow = anchor?.ownerDocument.defaultView;
    if (!anchor || !frameWindow || frameWindow === window) return;

    const reportCanvasHeight = () => {
      const documentHeight = Math.ceil(Math.max(
        anchor.ownerDocument.documentElement.scrollHeight,
        anchor.ownerDocument.body?.scrollHeight || 0,
      ));
      if (documentHeight <= 0) return;
      frameWindow.parent.postMessage(
        { type: CANVAS_HEIGHT_MESSAGE, height: documentHeight } satisfies CanvasHeightMessage,
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
    if (clearFocusTimer.current) frameWindow.clearTimeout(clearFocusTimer.current);
    clearFocusTimer.current = frameWindow.setTimeout(() => setIsFocused(false), 1800);

    const blockIndex = Array.from(
      puckBlock.ownerDocument.querySelectorAll<HTMLElement>("[data-puck-component]"),
    ).indexOf(puckBlock);
    window.setTimeout(() => {
      if (blockIndex < 0) return;
      dispatch({
        type: "setUi",
        ui: { itemSelector: { index: blockIndex, zone: ROOT_ZONE } },
      });
    }, 60);
  };

  return (
    <div
      ref={anchorRef}
      data-editor-block-id={blockId}
      data-editor-block-type={blockType}
      style={{
        position: "relative",
        ...(isFocused ? {
          zIndex: 2,
          outline: "3px solid #B8944E",
          outlineOffset: "-3px",
          boxShadow: "0 0 0 7px rgba(184, 148, 78, .20)",
        } : {}),
      }}
    >
      <div
        data-editor-select-overlay={blockType}
        aria-hidden="true"
        onPointerDownCapture={requestCanvasSelection}
        onClick={(event) => {
          event.preventDefault();
          requestCanvasSelection();
        }}
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 20,
          width: "100%",
          height: "100%",
          padding: 0,
          border: 0,
          background: "transparent",
          cursor: "pointer",
        }}
      />
      {children}
    </div>
  );
}

/** 保持 Puck 编辑器实例常驻，仅在页面切换时替换内部画布数据。 */
function CanvasPageDataSynchronizer({ data, pageKey }: { data: any; pageKey: EditorPageKey }) {
  const dispatch = useHomepagePuck((state) => state.dispatch);
  const appliedSignatureRef = useRef<string | null>(null);
  const dataSignature = useMemo(() => JSON.stringify(data), [data]);

  useEffect(() => {
    const signature = `${pageKey}:${dataSignature}`;
    if (appliedSignatureRef.current === signature) return;
    appliedSignatureRef.current = signature;
    dispatch({ type: "setData", data });
    dispatch({ type: "setUi", ui: { itemSelector: null } });
  }, [data, dataSignature, dispatch, pageKey]);

  return null;
}

function getInspectorDevice(viewport: { width: number | "100%" }): InspectorDevice {
  return viewport.width === 390 ? "mobile" : "desktop";
}

function getFieldDevice(type: string, field: string): "desktop" | "mobile" | "shared" {
  if (field === "mobileImage" || field === "mobileUrl") return "mobile";
  if (
    (type === "首屏主视觉" || type === "单图海报")
    && field === "desktopImage"
  ) return "desktop";
  if (type === "全屏出血图" && field === "image") return "desktop";
  if (type === "轮播图" && field === "url") return "desktop";
  return "shared";
}

function getInspectorGuideItems(type: string, props: Record<string, any>): InspectorGuideItem[] {
  const guideItems = TEMPLATE_STRUCTURE_GUIDES[type] || MEDIA_FIELD_LABELS
    .filter(([field]) => field in props)
    .map(([field, label]) => ({
      field,
      label,
      placement: "此模块的图片区域",
      kind: "media" as const,
    }));
  return guideItems.map((item) => ({
    ...item,
    device: item.kind === "media" ? getFieldDevice(type, item.field) : "shared",
  }));
}

/**
 * 右侧素材卡片与画布字段一一对应。这里不复用桌面/移动端字段表达模块角色：
 * 双图海报只有主海报、细节海报两个固定角色；其余响应式模块才区分设备。
 */
function getInspectorMediaItems(type: string, props: Record<string, any> = {}): InspectorMediaItem[] {
  switch (type) {
    case "首屏主视觉":
      return [
        { field: "desktopImage", label: "桌面端主视觉", placement: "桌面端首屏背景", device: "desktop", required: true, spec: IMAGE_SPECS.hero.desktop, placeholder: "拖拽或点击上传桌面端主视觉", ...createCropPreview("16 / 9", props.focusX, props.focusY) },
        { field: "mobileImage", label: "移动端主视觉", placement: "移动端首屏背景", device: "mobile", required: false, spec: IMAGE_SPECS.hero.mobile, placeholder: "拖拽或点击上传移动端主视觉", ...createCropPreview("9 / 16", props.focusX, props.focusY) },
      ];
    case "单图海报":
      return [
        { field: "desktopImage", label: "桌面端海报", placement: "桌面端海报主视觉区", device: "desktop", required: true, spec: IMAGE_SPECS.singlePoster.image, placeholder: "拖拽或点击上传桌面端海报", ...createCropPreview("4 / 3", props.focusX, props.focusY) },
        { field: "mobileImage", label: "移动端海报", placement: "移动端海报主视觉区", device: "mobile", required: false, spec: IMAGE_SPECS.singlePoster.mobile, placeholder: "拖拽或点击上传移动端海报", ...createCropPreview("3 / 4", props.focusX, props.focusY) },
      ];
    case "双图海报":
      return [
        { field: "mainImage", label: "主海报", placement: "画布左侧的大图", device: "shared", required: true, spec: IMAGE_SPECS.doublePoster.main, placeholder: "拖拽或点击上传主海报", ...createCropPreview("4 / 3", props.mainFocusX, props.mainFocusY) },
        { field: "detailImage", label: "细节海报", placement: "画布右侧的竖图", device: "shared", required: true, spec: IMAGE_SPECS.doublePoster.detail, placeholder: "拖拽或点击上传细节海报", ...createCropPreview("4 / 5", props.detailFocusX, props.detailFocusY) },
      ];
    case "图文混排":
      return [{ field: "image", label: "图文配图", placement: "图文区域的图片侧", device: "shared", required: true, spec: IMAGE_SPECS.imageText.image, placeholder: "拖拽或点击上传图文配图", ...createCropPreview("4 / 3", props.focusX, props.focusY) }];
    case "全屏出血图":
      return [
        { field: "image", label: "桌面端背景图", placement: "桌面端全屏背景", device: "desktop", required: true, spec: IMAGE_SPECS.fullBleed.desktop, placeholder: "拖拽或点击上传桌面端背景图", ...createCropPreview("12 / 5", props.focusX, props.focusY) },
        { field: "mobileImage", label: "移动端背景图", placement: "移动端全屏背景", device: "mobile", required: false, spec: IMAGE_SPECS.fullBleed.mobile, placeholder: "拖拽或点击上传移动端背景图", ...createCropPreview("5 / 6", props.focusX, props.focusY) },
      ];
    case "分割面板":
      return [{ field: "image", label: "分栏配图", placement: "图片分栏", device: "shared", required: true, spec: IMAGE_SPECS.splitPanel.image, placeholder: "拖拽或点击上传分栏配图", ...createCropPreview("3 / 4", props.focusX, props.focusY) }];
    case "热区图":
      return [
        { field: "image", label: "桌面端热区图", placement: "桌面端热区底图", device: "desktop", required: true, spec: IMAGE_SPECS.hotspot.desktop, placeholder: "拖拽或点击上传桌面端热区图", ...createCropPreview("16 / 9", props.focusX, props.focusY) },
        { field: "mobileImage", label: "移动端热区图", placement: "移动端热区底图", device: "mobile", required: false, spec: IMAGE_SPECS.hotspot.mobile, placeholder: "拖拽或点击上传移动端热区图", ...createCropPreview("3 / 4", props.focusX, props.focusY) },
      ];
    case "视频区块":
      return [{ field: "posterUrl", label: "视频封面", placement: "视频未播放时的封面", device: "shared", required: false, spec: IMAGE_SPECS.video.poster, placeholder: "拖拽或点击上传视频封面", ...createCropPreview("16 / 9") }];
    case "轮播图": {
      const images = Array.isArray(props.images) ? props.images : [];
      return images.flatMap((_: Record<string, any>, index: number) => [
        {
          field: `images.${index}.url`,
          label: `第 ${index + 1} 张桌面图`,
          placement: "桌面端轮播画面",
          device: "desktop" as const,
          required: true,
          spec: IMAGE_SPECS.carousel.image,
          placeholder: `拖拽或点击上传第 ${index + 1} 张桌面图`,
          carouselIndex: index,
          ...createCropPreview("1920 / 900"),
        },
        {
          field: `images.${index}.mobileUrl`,
          label: `第 ${index + 1} 张移动图`,
          placement: "移动端轮播画面",
          device: "mobile" as const,
          required: false,
          spec: CAROUSEL_MOBILE_SPEC,
          placeholder: `拖拽或点击上传第 ${index + 1} 张移动图`,
          carouselIndex: index,
          ...createCropPreview("3 / 4"),
        },
      ]);
    }
    default:
      return [];
  }
}

function getInspectorMediaValue(props: Record<string, any>, field: string): string | undefined {
  const carouselField = field.match(/^images\.(\d+)\.(url|mobileUrl)$/);
  if (carouselField) {
    const images = Array.isArray(props.images) ? props.images : [];
    return images[Number(carouselField[1])]?.[carouselField[2]];
  }
  return props[field] as string | undefined;
}

const TEMPLATE_STRUCTURE_GUIDES: Record<string, InspectorGuideItem[]> = {
  "首屏主视觉": [
    { field: "desktopImage", label: "桌面端主视觉", placement: "桌面端首屏背景", kind: "media" },
    { field: "mobileImage", label: "移动端主视觉", placement: "移动端首屏背景", kind: "media" },
    { field: "subtitle", label: "副标题", placement: "左下角文案的第一行", kind: "text" },
    { field: "title", label: "标题", placement: "左下角主标题", kind: "text" },
    { field: "actionText", label: "按钮文字", placement: "主标题下方的行动按钮", kind: "text" },
    { field: "linkUrl", label: "按钮链接", placement: "行动按钮的跳转地址", kind: "text" },
  ],
  "双图海报": [
    { field: "mainImage", label: "主海报", placement: "画布左侧的大图", kind: "media" },
    { field: "detailImage", label: "细节海报", placement: "画布右侧的竖图", kind: "media" },
    { field: "number", label: "编号", placement: "细节图下方的第一行", kind: "text" },
    { field: "label", label: "标签", placement: "编号右侧", kind: "text" },
    { field: "title", label: "标题", placement: "细节图下方的主标题", kind: "text" },
    { field: "description", label: "介绍", placement: "细节图下方的说明文字", kind: "text" },
  ],
  "单图海报": [
    { field: "desktopImage", label: "海报主图", placement: "模块的主视觉区域", kind: "media" },
    { field: "mobileImage", label: "移动端适配图", placement: "移动端的海报主视觉区域", kind: "media" },
    { field: "number", label: "编号", placement: "海报文案区的第一行", kind: "text" },
    { field: "label", label: "标签", placement: "编号旁", kind: "text" },
    { field: "title", label: "标题", placement: "海报文案区的主标题", kind: "text" },
    { field: "subtitle", label: "副标题", placement: "主标题下方", kind: "text" },
  ],
  "图文混排": [
    { field: "image", label: "图文配图", placement: "图文区域的图片侧", kind: "media" },
    { field: "label", label: "标签", placement: "文案区域顶部", kind: "text" },
    { field: "title", label: "标题", placement: "文案区域主标题", kind: "text" },
    { field: "body", label: "正文", placement: "主标题下方", kind: "text" },
  ],
  "分割面板": [
    { field: "image", label: "分栏配图", placement: "图片分栏", kind: "media" },
    { field: "title", label: "标题", placement: "文字分栏主标题", kind: "text" },
    { field: "subtitle", label: "副标题", placement: "主标题下方", kind: "text" },
    { field: "body", label: "正文", placement: "文字分栏说明", kind: "text" },
  ],
  "文字横幅": [
    { field: "eyebrow", label: "眉题", placement: "横幅文案顶部", kind: "text" },
    { field: "title", label: "标题", placement: "横幅中央主标题", kind: "text" },
    { field: "body", label: "正文", placement: "标题下方", kind: "text" },
  ],
};

function focusInspectorField(field: string, blockId?: string) {
  window.requestAnimationFrame(() => {
    const target = document.querySelector<HTMLElement>(
      `[name="${field}"], [id*="${field}"], [data-media-field="${field}"]`,
    );
    target?.scrollIntoView({ block: "center", behavior: "smooth" });
    const focusable = target?.matches("input, textarea, select, button")
      ? target
      : target?.querySelector<HTMLElement>("button, input, textarea, select") || target;
    focusable?.focus();

    focusCanvasBlock(blockId, field);
  });
}

function TemplateStructureGuide({
  type,
  props,
  blockId,
  device,
  onMediaChange,
  onCarouselItemChange,
  onAddCarouselItem,
  onMoveCarouselItem,
  onRemoveCarouselItem,
}: {
  type: string;
  props: Record<string, any>;
  blockId?: string;
  device: InspectorDevice;
  onMediaChange: (field: string, value: string) => void;
  onCarouselItemChange: (index: number, field: "link" | "alt", value: string) => void;
  onAddCarouselItem: () => void;
  onMoveCarouselItem: (index: number, direction: -1 | 1) => void;
  onRemoveCarouselItem: (index: number) => void;
}) {
  const configuredMediaItems = getInspectorMediaItems(type, props);
  const carouselItems = Array.isArray(props.images) ? props.images : [];
  const isCarousel = type === "轮播图";
  const [activeCarouselIndex, setActiveCarouselIndex] = useState(0);
  useEffect(() => {
    setActiveCarouselIndex(0);
  }, [props.id]);
  if (!configuredMediaItems.length && type !== "轮播图") return null;

  const mediaItems = configuredMediaItems.filter(
    (item) => item.device === "shared" || item.device === device,
  ).filter((item) => !isCarousel || item.carouselIndex === activeCarouselIndex);

  return (
    <section className="homepage-editor__structure-guide" aria-label={`${type}编辑位置说明`}>
      {isCarousel && carouselItems.length > 0 && (
        <div className="homepage-editor__carousel-tabs" role="tablist" aria-label="轮播项">
          {carouselItems.map((_: Record<string, any>, index: number) => (
            <button
              key={index}
              type="button"
              role="tab"
              aria-selected={activeCarouselIndex === index}
              className={activeCarouselIndex === index ? "is-active" : ""}
              onClick={() => setActiveCarouselIndex(index)}
            >
              选项 {index + 1}
            </button>
          ))}
          <span>{activeCarouselIndex + 1}/{carouselItems.length}</span>
        </div>
      )}
      {mediaItems.length > 0 && (
        <div className="homepage-editor__structure-group">
          <div className="homepage-editor__structure-media-grid">
            {mediaItems.map((item) => (
              <article key={item.field} className="homepage-editor__structure-media">
                <div className="homepage-editor__structure-media-heading">
                  <span>
                    <strong>{item.label}</strong>
                    {item.required && <em>必填</em>}
                  </span>
                  <small>{item.placement}</small>
                </div>
                <MediaPickerField
                  fieldKey={item.field}
                  device={item.device}
                  value={getInspectorMediaValue(props, item.field)}
                  onChange={(value) => onMediaChange(item.field, value)}
                  spec={item.spec}
                  required={item.required}
                  placeholder={item.placeholder}
                  previewAspectRatio={item.previewAspectRatio}
                  previewFocus={item.previewFocus}
                />
                {item.carouselIndex !== undefined && (
                  <div className="homepage-editor__carousel-item-settings">
                    <label>
                      替代文本
                      <Input
                        size="small"
                        value={carouselItems[item.carouselIndex]?.alt || ""}
                        onChange={(event) => onCarouselItemChange(item.carouselIndex!, "alt", event.target.value)}
                        placeholder="说明这张图片"
                      />
                    </label>
                    <label>
                      点击跳转
                      <Input
                        size="small"
                        value={carouselItems[item.carouselIndex]?.link || ""}
                        onChange={(event) => onCarouselItemChange(item.carouselIndex!, "link", event.target.value)}
                        placeholder="可选，例如 /products"
                      />
                    </label>
                    <div className="homepage-editor__carousel-item-actions">
                      <button type="button" disabled={item.carouselIndex === 0} onClick={() => onMoveCarouselItem(item.carouselIndex!, -1)}>上移</button>
                      <button type="button" disabled={item.carouselIndex === carouselItems.length - 1} onClick={() => onMoveCarouselItem(item.carouselIndex!, 1)}>下移</button>
                      <button
                        type="button"
                        disabled={carouselItems.length <= 1}
                        onClick={() => {
                          onRemoveCarouselItem(item.carouselIndex!);
                          setActiveCarouselIndex((current) => Math.min(current, carouselItems.length - 2));
                        }}
                      >
                        删除此轮播项
                      </button>
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>
      )}

      {isCarousel && (
        <div className="homepage-editor__carousel-add">
          <span>每个轮播项分别维护桌面图与移动图；移动图为空时，移动端复用桌面图。</span>
          <button type="button" onClick={() => {
            onAddCarouselItem();
            setActiveCarouselIndex(carouselItems.length);
          }}>新增轮播项</button>
        </div>
      )}

    </section>
  );
}

/**
 * 模块卡片不使用真实商品素材，而用“布局微缩图”展示该区块插入后的结构。
 * 这让用户先理解版式和内容层级，再决定是否添加。
 */
const PREVIEW_COLORS = {
  surface: "#FBFAF7",
  ink: "#3F372F",
  muted: "#A89E92",
  line: "#DED6CA",
  media: "#E5DDD1",
  mediaDeep: "#B9A994",
  accent: "#B8944E",
  dark: "#342D27",
  light: "#FFFFFF",
};

function PreviewText({ x, y, width, lines = 3, inverse = false }: {
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
      {Array.from({ length: Math.min(2, Math.max(0, lines - 1)) }, (_, index) => (
        <rect
          key={index}
          x={x}
          y={y + 18 + index * 8}
          width={width * (index === 1 ? .62 : .84)}
          height="3"
          rx="2"
          fill={soft}
        />
      ))}
    </g>
  );
}

function PreviewMedia({ x, y, width, height, dark = false, label = "图片" }: {
  x: number;
  y: number;
  width: number;
  height: number;
  dark?: boolean;
  label?: string;
}) {
  const base = dark ? "#6C5A4A" : PREVIEW_COLORS.media;
  const detail = dark ? "#95816C" : PREVIEW_COLORS.mediaDeep;
  return (
    <g aria-hidden="true">
      <rect x={x} y={y} width={width} height={height} rx="4" fill={base} />
      <rect x={x + 8} y={y + 8} width={Math.max(0, width - 16)} height={Math.max(0, height - 16)} rx="2" fill={detail} opacity=".2" />
      <path d={`M${x + 10} ${y + height - 10} L${x + width - 10} ${y + 10}`} stroke={dark ? "rgba(255,255,255,.36)" : "rgba(63,55,47,.16)"} strokeWidth="1" />
    </g>
  );
}

function PreviewCard({ x, y, width, height, kind = "product" }: {
  x: number;
  y: number;
  width: number;
  height: number;
  kind?: "product" | "article" | "service" | "quote";
}) {
  const mediaHeight = kind === "article" ? height * .42 : kind === "service" ? 0 : height * .58;
  return (
    <g aria-hidden="true">
      <rect x={x} y={y} width={width} height={height} rx="4" fill={PREVIEW_COLORS.light} stroke={PREVIEW_COLORS.line} />
      {kind === "service" ? (
        <>
          <circle cx={x + width / 2} cy={y + 19} r="10" fill="#F2E9DA" stroke={PREVIEW_COLORS.accent} />
          <circle cx={x + width / 2} cy={y + 19} r="3" fill={PREVIEW_COLORS.accent} />
          <rect x={x + 10} y={y + 39} width={width - 20} height="5" rx="2.5" fill={PREVIEW_COLORS.ink} />
          <rect x={x + 16} y={y + 50} width={width - 32} height="4" rx="2" fill={PREVIEW_COLORS.muted} />
        </>
      ) : kind === "quote" ? (
        <>
          <circle cx={x + 19} cy={y + 20} r="9" fill={PREVIEW_COLORS.media} />
          <rect x={x + 10} y={y + 43} width={width - 20} height="5" rx="2" fill={PREVIEW_COLORS.ink} />
          <rect x={x + 10} y={y + 54} width={width - 28} height="4" rx="2" fill={PREVIEW_COLORS.muted} />
          <rect x={x + 10} y={y + height - 14} width={width * .36} height="4" rx="2" fill={PREVIEW_COLORS.accent} />
        </>
      ) : (
        <>
          <PreviewMedia x={x + 5} y={y + 5} width={width - 10} height={mediaHeight - 5} label={kind === "article" ? "内容" : "商品"} />
          <rect x={x + 8} y={y + mediaHeight + 8} width={width - 16} height="5" rx="2" fill={PREVIEW_COLORS.ink} />
          <rect x={x + 8} y={y + mediaHeight + 18} width={width * .48} height="4" rx="2" fill={PREVIEW_COLORS.accent} />
        </>
      )}
    </g>
  );
}

/** 不使用具体商品或摄影素材，直接把每种模块的内容框架画成线框缩略图。 */
function BlockTemplateVisual({ name }: { name: string }) {
  const kind = BLOCK_PREVIEW_KIND[name] ?? "hero";
  let content: ReactNode;
  let background = PREVIEW_COLORS.surface;

  switch (kind) {
    case "hero":
      background = PREVIEW_COLORS.dark;
      content = <><rect x="18" y="20" width="264" height="4" rx="2" fill="rgba(255,255,255,.48)" /><PreviewMedia x={14} y={47} width={272} height={153} dark /><PreviewText x={29} y={144} width={115} lines={3} inverse /><rect x={29} y="183" width="47" height="11" rx="2" fill={PREVIEW_COLORS.accent} /><rect x="111" y="234" width="78" height="139" rx="4" fill="#665649" opacity=".58" /><rect x="121" y="244" width="58" height="103" rx="3" fill="#8D7A66" opacity=".52" /></>;
      break;
    case "single-poster":
      content = <><PreviewText x={21} y={52} width={72} lines={3} /><rect x={21} y="94" width="43" height="11" rx="2" fill="none" stroke={PREVIEW_COLORS.accent} /><PreviewMedia x={110} y={42} width={171} height={114} /><rect x="17" y="192" width="266" height="177" rx="4" fill="#F2EEE7" /><PreviewMedia x={30} y={211} width={140} height={93} /><PreviewText x={190} y={233} width={66} lines={2} /></>;
      break;
    case "double-poster":
      content = <><PreviewText x={18} y={27} width={108} lines={2} /><PreviewMedia x={18} y={83} width={160} height={120} /><PreviewMedia x={197} y={105} width={72} height={90} /><PreviewText x={197} y={219} width={72} lines={3} /><rect x={197} y="260" width="45" height="11" rx="2" fill={PREVIEW_COLORS.accent} /><rect x="18" y="306" width="252" height="1" fill={PREVIEW_COLORS.line} /><PreviewMedia x={18} y={327} width={105} height={79} /><PreviewMedia x={139} y={327} width={63} height={79} /><PreviewText x={218} y={347} width={52} lines={2} /></>;
      break;
    case "image-text":
      content = <><PreviewMedia x={16} y={72} width={132} height={99} /><PreviewText x={168} y={91} width={98} lines={3} /><rect x={168} y="135" width="48" height="11" rx="2" fill="none" stroke={PREVIEW_COLORS.accent} /><rect x="16" y="216" width="268" height="1" fill={PREVIEW_COLORS.line} /><PreviewText x={28} y={254} width={97} lines={3} /><PreviewMedia x={151} y={239} width={121} height={91} /></>;
      break;
    case "full-bleed":
      background = PREVIEW_COLORS.dark;
      content = <><PreviewMedia x={14} y={54} width={272} height={113} dark /><PreviewText x={34} y={89} width={118} lines={2} inverse /><rect x="34" y="126" width="55" height="2" rx="1" fill="rgba(255,255,255,.72)" /><rect x="187" y="213" width="88" height="106" rx="4" fill="#665649" opacity=".72" /><PreviewText x={198} y={246} width={62} lines={2} inverse /><rect x="198" y="282" width="39" height="2" rx="1" fill="rgba(255,255,255,.72)" /><rect x="26" y="363" width="248" height="1" fill="rgba(255,255,255,.18)" /></>;
      break;
    case "product-row":
      content = <><PreviewText x={22} y={30} width={114} lines={2} />{[0, 1, 2, 3].map((index) => <g key={index}><PreviewMedia x={18 + index * 68} y={108} width={58} height={58} /><rect x={23 + index * 68} y="177" width="47" height="5" rx="2" fill={PREVIEW_COLORS.ink} /><rect x={23 + index * 68} y="188" width="29" height="4" rx="2" fill={PREVIEW_COLORS.accent} /></g>)}<rect x={106} y="220" width="88" height="11" rx="2" fill="none" stroke={PREVIEW_COLORS.accent} /><rect x="18" y="275" width="264" height="1" fill={PREVIEW_COLORS.line} /><PreviewText x={22} y={308} width={114} lines={2} /></>;
      break;
    case "category-cards":
    case "occasion-guide":
    case "gift-guide":
      content = <><PreviewText x={74} y={27} width={152} lines={2} />{[[18, 103], [156, 103], [18, 252], [156, 252]].map(([x, y], index) => <g key={index}><PreviewMedia x={x} y={y} width={126} height={126} /><rect x={x + 11} y={y + 98} width="58" height="6" rx="2" fill="rgba(255,255,255,.88)" /></g>)}</>;
      break;
    case "card-grid":
      content = <><PreviewText x={70} y={28} width={160} lines={2} />{[0, 1, 2].map((index) => <PreviewCard key={index} x={18 + index * 92} y={128} width={80} height={156} kind="service" />)}</>;
      break;
    case "text-banner":
      background = PREVIEW_COLORS.dark;
      content = <><rect x="16" y="159" width="268" height="56" rx="4" fill="#584838" /><PreviewText x={91} y={173} width={118} lines={2} inverse /><rect x="126" y="196" width="48" height="9" rx="2" fill={PREVIEW_COLORS.accent} /><PreviewText x={25} y={263} width={95} lines={2} /><PreviewText x={174} y={263} width={95} lines={2} /></>;
      break;
    case "carousel":
      content = <><PreviewMedia x={12} y={105} width={276} height={130} dark /><PreviewText x={28} y={162} width={104} lines={2} inverse /><path d="M23 176l8 -7v14zM277 176l-8 -7v14z" fill="#FFFFFF" opacity=".9" />{[0, 1, 2, 3].map((index) => <circle key={index} cx={132 + index * 12} cy="220" r="3" fill={index === 0 ? PREVIEW_COLORS.accent : "#FFFFFF"} />)}<PreviewMedia x={18} y={279} width={74} height={35} /><PreviewMedia x={112} y={279} width={74} height={35} /><PreviewMedia x={206} y={279} width={74} height={35} /></>;
      break;
    case "video":
      background = PREVIEW_COLORS.dark;
      content = <><PreviewMedia x={16} y={105} width={268} height={151} dark /><circle cx="150" cy="180" r="22" fill="rgba(255,255,255,.88)" /><path d="M145 170l17 10-17 10z" fill={PREVIEW_COLORS.dark} /><PreviewText x={65} y={293} width={170} lines={2} /></>;
      break;
    case "split-panel":
      content = <><PreviewMedia x={16} y={91} width={120} height={160} /><rect x="151" y="91" width="133" height="160" rx="4" fill="#F2EEE7" /><PreviewText x={168} y={134} width={96} lines={3} /><rect x={168} y="182" width="50" height="11" rx="2" fill={PREVIEW_COLORS.accent} /><PreviewText x={22} y={298} width={102} lines={2} /><PreviewText x={174} y={298} width={102} lines={2} /></>;
      break;
    case "hotspot":
      content = <><PreviewMedia x={14} y={99} width={272} height={153} dark />{[[80, 142], [202, 170], [132, 215]].map(([x, y], index) => <g key={index}><circle cx={x} cy={y} r="10" fill={PREVIEW_COLORS.light} stroke={PREVIEW_COLORS.accent} strokeWidth="2" /><circle cx={x} cy={y} r="3" fill={PREVIEW_COLORS.accent} /></g>)}<PreviewText x={74} y={294} width={152} lines={2} /></>;
      break;
    case "appointment":
      content = <><PreviewText x={28} y={52} width={119} lines={2} /><PreviewMedia x={176} y={50} width={94} height={71} /><rect x={28} y="133" width="118" height="11" rx="2" fill="#F0E6D5" stroke={PREVIEW_COLORS.accent} /><rect x={28} y="159" width="244" height="29" rx="3" fill={PREVIEW_COLORS.light} stroke={PREVIEW_COLORS.line} /><rect x={28} y="199" width="244" height="29" rx="3" fill={PREVIEW_COLORS.light} stroke={PREVIEW_COLORS.line} /><rect x={28} y="242" width="92" height="18" rx="2" fill={PREVIEW_COLORS.accent} /></>;
      break;
    case "certificate":
      content = <><PreviewText x={72} y={28} width={156} lines={2} />{[0, 1, 2].map((index) => <g key={index}><PreviewCard x={22 + index * 88} y={132} width={78} height={146} kind="service" /><circle cx={61 + index * 88} cy="164" r="16" fill="#F4ECDE" stroke={PREVIEW_COLORS.accent} /></g>)}</>;
      break;
    case "custom-process":
      content = <><PreviewText x={72} y={28} width={156} lines={2} /><path d="M48 205H252" stroke={PREVIEW_COLORS.line} strokeWidth="2" />{[0, 1, 2, 3].map((index) => <g key={index}><circle cx={48 + index * 68} cy="205" r="16" fill={PREVIEW_COLORS.light} stroke={PREVIEW_COLORS.accent} strokeWidth="2" /><text x={43 + index * 68} y="209" fill={PREVIEW_COLORS.accent} fontSize="10">0{index + 1}</text><rect x={21 + index * 68} y="237" width="54" height="5" rx="2" fill={PREVIEW_COLORS.ink} /><rect x={25 + index * 68} y="249" width="46" height="4" rx="2" fill={PREVIEW_COLORS.muted} /></g>)}</>;
      break;
    case "service-promise":
      content = <><PreviewText x={70} y={30} width={160} lines={2} />{[0, 1, 2].map((index) => <PreviewCard key={index} x={18 + index * 92} y={144} width={80} height={118} kind="service" />)}<rect x={96} y={296} width="108" height="16" rx="2" fill="none" stroke={PREVIEW_COLORS.accent} /></>;
      break;
    case "store-info":
      content = <><PreviewMedia x={16} y={94} width={126} height={95} /><PreviewText x={165} y={107} width={103} lines={2} />{[0, 1, 2].map((index) => <g key={index}><circle cx="172" cy={166 + index * 21} r="4" fill={PREVIEW_COLORS.accent} /><rect x="185" y={163 + index * 21} width="74" height="4" rx="2" fill={PREVIEW_COLORS.muted} /></g>)}<rect x={165} y="231" width="68" height="11" rx="2" fill="none" stroke={PREVIEW_COLORS.accent} /><rect x="16" y="280" width="268" height="1" fill={PREVIEW_COLORS.line} /><PreviewText x={22} y={310} width={114} lines={2} /></>;
      break;
    case "featured-product":
      content = <><PreviewMedia x={30} y={91} width={99} height={132} /><PreviewText x={158} y={112} width={104} lines={3} /><rect x={158} y="164" width="63" height="11" rx="2" fill={PREVIEW_COLORS.accent} /><rect x={158} y="185" width="63" height="11" rx="2" fill="none" stroke={PREVIEW_COLORS.accent} /><rect x="18" y="266" width="264" height="1" fill={PREVIEW_COLORS.line} /><PreviewText x={24} y={299} width={116} lines={2} /></>;
      break;
    case "lookbook":
      content = <><PreviewText x={20} y={27} width={132} lines={2} /><PreviewMedia x={20} y={97} width={140} height={105} /><PreviewMedia x={178} y={97} width={70} height={93} /><PreviewMedia x={178} y={212} width={70} height={93} /><rect x="178" y="198" width="59" height="4" rx="2" fill={PREVIEW_COLORS.ink} /><rect x="178" y="313" width="59" height="4" rx="2" fill={PREVIEW_COLORS.ink} /></>;
      break;
    case "limited-offer":
      background = PREVIEW_COLORS.dark;
      content = <><PreviewText x={25} y={93} width={118} lines={3} inverse />{[0, 1, 2, 3].map((index) => <g key={index}><rect x={160 + index * 29} y="126" width="23" height="31" rx="2" fill="rgba(255,255,255,.14)" /><rect x={164 + index * 29} y="137" width="15" height="5" rx="2" fill="#F3DEAE" /></g>)}<rect x={25} y={239} width="92" height="17" rx="2" fill={PREVIEW_COLORS.accent} /><rect x={25} y={287} width="188" height="18" rx="2" fill="none" stroke="rgba(243,222,174,.72)" /></>;
      break;
    case "testimonial":
      content = <><PreviewText x={72} y={28} width={156} lines={2} />{[0, 1, 2].map((index) => <g key={index}><PreviewMedia x={18 + index * 92} y={122} width={80} height={60} /><PreviewCard x={18 + index * 92} y={192} width={80} height={96} kind="quote" /></g>)}</>;
      break;
    default:
      content = <><PreviewText x={70} y={38} width={160} lines={2} /><PreviewMedia x={18} y={120} width={264} height={170} label="内容区域" /><rect x={104} y={322} width="92" height="16" rx="2" fill="none" stroke={PREVIEW_COLORS.accent} /></>;
  }

  return (
    <svg
      className="homepage-editor__template-preview-img homepage-editor__template-layout-preview"
      viewBox="0 0 300 400"
      role="img"
      aria-label={`${name}的内容框架预览`}
      preserveAspectRatio="xMidYMid meet"
    >
      <rect width="300" height="400" fill={background} />
      <rect x="8" y="8" width="284" height="384" rx="5" fill="none" stroke={background === PREVIEW_COLORS.dark ? "rgba(255,255,255,.16)" : "#E5DED3"} />
      {content}
    </svg>
  );
}

function TemplateCard({
  name,
  meta,
  viewMode,
  onPointerDragMove,
  onPointerDragEnd,
}: {
  name: string;
  meta: BlockMeta;
  viewMode: "single" | "double";
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
    onPointerDragEnd(name, clientX, clientY);
  }, [name, onPointerDragEnd]);

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
    <article className={`homepage-editor__template-card${unavailable ? " is-disabled" : ""}${viewMode === "double" ? " is-compact" : ""}`}>
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
        title={unavailable ? `${meta.name}已达可添加上限` : `拖拽${meta.name}到画布`}
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
            <BlockTemplateVisual name={name} />
          )}
          {meta.badge && (
            <span className="homepage-editor__template-badge">{meta.badge}</span>
          )}
          <span className="homepage-editor__template-add">拖到画布</span>
        </span>
        <span className="homepage-editor__template-name">{meta.name}</span>
        <span className="homepage-editor__template-description">{meta.description}</span>
      </button>
      <div className="homepage-editor__template-footer">
        <span>已添加 {usedCount} / {limit}</span>
        {viewMode === "single" && <span>{TEMPLATE_MEDIA_HINT[name] ?? meta.tags[0]}</span>}
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
  const [keyword, setKeyword] = useState("");
  const [viewMode, setViewMode] = useState<"single" | "double">(() => {
    try {
      return window.localStorage.getItem("homepage-editor-template-view-mode") === "double" ? "double" : "single";
    } catch {
      return "single";
    }
  });
  const [myTemplates, setMyTemplates] = useState<BlockTemplate[]>(() =>
    blockTemplateStore.getAll(),
  );

  useEffect(() => {
    window.localStorage.setItem("homepage-editor-template-view-mode", viewMode);
  }, [viewMode]);

  const refreshMyTemplates = useCallback(() => {
    setMyTemplates(blockTemplateStore.getAll());
  }, []);

  const saveBlockAsTemplate = useCallback((blockType: string, blockProps: Record<string, any>) => {
    const moduleDisplayName = getModuleDisplayName(blockType);
    Modal.confirm({
      title: "保存为常用方案",
      content: (
        <div style={{ marginTop: 8 }}>
          <p style={{ margin: "0 0 8px", color: "#6B6259", fontSize: 12 }}>
            将当前模块的内容与版式保存为可复用的常用方案。
          </p>
          <label style={{ fontSize: 12, color: "#4A4239" }}>
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
                border: "1px solid #DED8CE",
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
        const input = document.getElementById("block-template-name-input") as HTMLInputElement | null;
        const name = input?.value?.trim() || `我的${moduleDisplayName}`;
        blockTemplateStore.save(name, blockType, blockProps);
        refreshMyTemplates();
        message.success(`「${name}」已保存为常用方案`);
      },
    });
  }, [refreshMyTemplates]);

  const entries = useMemo(
    () =>
      Object.entries(BLOCK_META).filter(([name, meta]) => {
        const matchKeyword = `${name}${meta.name}${meta.description}${meta.tags.join("")}`.includes(keyword.trim());
        return matchKeyword;
      }).sort(([, left], [, right]) => {
        const categoryOrder = BLOCK_CATEGORIES.indexOf(left.category) - BLOCK_CATEGORIES.indexOf(right.category);
        return categoryOrder || left.order - right.order;
      }),
    [keyword],
  );
  const groupedEntries = useMemo(
    () => BLOCK_CATEGORIES.map((group) => ({
      group,
      entries: entries.filter(([, meta]) => meta.category === group),
    })).filter((section) => section.entries.length > 0),
    [entries],
  );

  return (
    <aside className="homepage-editor__library" aria-label="内容模块库">
      <div className="homepage-editor__library-tools">
        <div className="homepage-editor__library-title">
          <AppstoreOutlined />
          <span>内容模块</span>
          <small>{`显示 ${entries.length} / 共 ${Object.keys(BLOCK_META).length} 个`}</small>
        </div>
        <div className="homepage-editor__library-search-row">
          <Input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索模块"
            prefix={<SearchOutlined />}
            aria-label="搜索模块"
          />
          <div className="homepage-editor__view-toggle" role="group" aria-label="视图模式">
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
        </div>
      </div>

      <div className={`homepage-editor__template-scroll${viewMode === "double" ? " is-double" : ""}`}>
        {(entries.length > 0 || myTemplates.length > 0) ? (
          <>
            {myTemplates.length > 0 ? (
              <section className="homepage-editor__template-group" aria-labelledby="template-group-saved">
                <h3 id="template-group-saved">常用方案</h3>
                <div className="homepage-editor__template-group-grid">
                  {myTemplates.map((tpl) => (
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
                      {getModuleDisplayName(tpl.type)} · {new Date(tpl.createdAt).toLocaleDateString("zh-CN")}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="homepage-editor__template-favorite"
                    onClick={() => {
                      blockTemplateStore.remove(tpl.id);
                      refreshMyTemplates();
                    }}
                    title="删除此常用方案"
                  >
                    <DeleteOutlined />
                  </button>
                </article>
                  ))}
                </div>
              </section>
            ) : null}
            {groupedEntries.map(({ group, entries: groupItems }) => (
              <section className="homepage-editor__template-group" key={group} aria-labelledby={`template-group-${group}`}>
                <h3 id={`template-group-${group}`}>{group}</h3>
                <div className="homepage-editor__template-group-grid">
                  {groupItems.map(([name, meta]) => (
                    <TemplateCard
                      key={name}
                      name={name}
                      meta={meta}
                      viewMode={viewMode}
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
              <button type="button" className="homepage-editor__library-empty-action" onClick={() => setKeyword("")}>清除搜索</button>
            ) : null}
          </div>
        )}
      </div>
    </aside>
  );
}

function EditorToolbar({
  pageKey,
  lastSaved,
  publishing,
  hasUnsavedChanges,
  autoSaveState,
  onPublish,
  onOpenRevisions,
  onOpenPageSettings,
  onDataChange,
  onPreview,
  onPageChange,
}: {
  pageKey: EditorPageKey;
  lastSaved: string | null;
  publishing: boolean;
  hasUnsavedChanges: boolean;
  autoSaveState: AutoSaveState;
  onPublish: (data: unknown, locateBlock: (blockIndex: number) => void) => void;
  onOpenRevisions: () => void;
  onOpenPageSettings: () => void;
  onDataChange: (data: unknown) => void;
  onPreview: (data: unknown, previewWindow: Window | null) => void;
  onPageChange: (pageKey: EditorPageKey) => void;
}) {
  const appData = useHomepagePuck((state) => state.appState.data);
  const viewports = useHomepagePuck((state) => state.appState.ui.viewports);
  const dispatch = useHomepagePuck((state) => state.dispatch);
  const currentViewport = viewports.current;
  const [undoStack, setUndoStack] = useState<any[]>([]);
  const [redoStack, setRedoStack] = useState<any[]>([]);
  const lastDataRef = useRef<any>(appData);
  const undoTimerRef = useRef<number | null>(null);
  const pendingUndoRef = useRef<any>(null);

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
      ? "正在保存草稿"
      : autoSaveState === "error"
        ? "保存失败，请重试"
        : hasUnsavedChanges
          ? "有未保存修改"
          : lastSaved
            ? `上次保存 ${lastSaved}`
            : "草稿编辑中";

  useEffect(() => {
    onDataChange(appData);
    // 历史入栈节流：连续编辑（如拖拽每帧）合并为一次快照，避免栈被瞬态中间态塞满
    pendingUndoRef.current = appData;
    if (undoTimerRef.current !== null) return;
    undoTimerRef.current = window.setTimeout(() => {
      undoTimerRef.current = null;
      if (pendingUndoRef.current !== null) {
        pushUndo(pendingUndoRef.current);
      }
    }, 400);
  }, [appData, onDataChange, pushUndo]);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current !== null) {
        window.clearTimeout(undoTimerRef.current);
        undoTimerRef.current = null;
      }
    };
  }, []);

  const setViewport = useCallback((preset: ViewportPreset) => {
    dispatch({
      type: "setUi",
      ui: {
        viewports: {
          ...viewports,
          current: { width: preset.width, height: preset.height },
        },
      },
    });
  }, [dispatch, viewports]);

  return (
    <header className="homepage-editor__toolbar">
      <div className="homepage-editor__toolbar-context">
        <strong>海川珠宝</strong>
        <span className="homepage-editor__toolbar-divider" />
        <label className="homepage-editor__page-picker">
          <span>当前编辑</span>
          <select value={pageKey} onChange={(event) => onPageChange(event.target.value as EditorPageKey)}>
            {editorPages.map((page) => <option key={page.key} value={page.key}>{page.label}</option>)}
          </select>
        </label>
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
          onClick={() => onPreview(appData, window.open("about:blank", "_blank"))}
          title="先保存当前草稿，再在新窗口查看未发布效果"
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
          icon={<SettingOutlined />}
          onClick={onOpenPageSettings}
          title="页面 SEO 标题与描述（影响搜索与社交分享）"
        >
          页面设置
        </Button>
        <Button
          size="small"
          type="primary"
          icon={<SendOutlined />}
          loading={publishing}
          onClick={() =>
            onPublish(appData, (blockIndex) => {
              dispatch({
                type: "setUi",
                ui: { itemSelector: { index: blockIndex, zone: ROOT_ZONE } },
              });
            })
          }
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
  navigationPreviewOpen,
  onToggleNavigationPreview,
}: {
  onSaveAsTemplate: (type: string, props: Record<string, any>) => void;
  navigationPreviewOpen: boolean;
  onToggleNavigationPreview: () => void;
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
    focusCanvasBlock(content[index]?.props?.id);
  };

  const reorderLayer = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= content.length || to >= content.length) return;
    if (content[from]?.props?.locked || content[to]?.props?.locked) {
      message.info("固定业务区不能调整顺序");
      return;
    }
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
      title: `删除“${getModuleDisplayName(item.type, item.props)}”？`,
      content: "删除后可从模块库重新添加；尚未发布的修改可通过版本记录恢复。",
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
      <div className="homepage-editor__layer-scroll">
        <div className="homepage-editor__layer-frame homepage-editor__layer-global">
          <button type="button" onClick={onToggleNavigationPreview} aria-pressed={navigationPreviewOpen}>
            <span>页面导航栏</span>
          </button>
        </div>
        {content.map(
          (item, index) => {
            const active = item.props?.id === selectedId;
            return (
              <div
                key={item.props?.id ?? `${item.type}-${index}`}
                className={`homepage-editor__layer-item${active ? " is-active" : ""}${draggingIndex === index ? " is-dragging" : ""}${dropIndex === index ? " is-drop-target" : ""}`}
                draggable={!item.props?.locked}
                onDragStart={(event) => {
                  if (item.props?.locked) return;
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
                  <span>{getModuleDisplayName(item.type, item.props)}</span>
                  <DragOutlined />
                </button>
              </div>
            );
          },
        )}
        {appData.content.length === 0 && (
          <div className="homepage-editor__layer-empty">
            从左侧添加模块后，这里会显示页面结构。
          </div>
        )}
      </div>
    </section>
  );
}

function MediaSourceStatus({
  type,
  props,
  device,
  blockId,
}: {
  type: string;
  props: Record<string, any>;
  device: InspectorDevice;
  blockId?: string;
}) {
  const allSources = getInspectorMediaItems(type, props)
    .map((item) => ({
      key: item.field,
      label: item.label,
      device: item.device,
      required: item.required,
      url: getInspectorMediaValue(props, item.field),
    }));
  if (!allSources.length) return null;

  // 发布规则以全量必填素材为准，不能因用户当前停留在移动端就掩盖桌面端缺图。
  const missing = allSources.filter((source) => source.required && !source.url).length;
  const missingSource = allSources.find((source) => source.required && !source.url);
  const mobileFallbackCount = device === "mobile"
    ? type === "轮播图"
      ? (Array.isArray(props.images) ? props.images.filter((item: any) => !item?.mobileUrl && item?.url).length : 0)
      : !props.mobileImage && Boolean(props.desktopImage || props.image) ? 1 : 0
    : 0;

  if (!missing || !missingSource) {
    if (!mobileFallbackCount) return null;
    return (
      <section className="homepage-editor__media-status is-fallback" aria-label="移动端素材兜底说明">
        <CheckCircleOutlined />
        <div>
          <strong>移动端将复用桌面图{mobileFallbackCount > 1 ? `（${mobileFallbackCount} 张）` : ""}</strong>
          <span>可以继续发布；建议补充竖版图片，以避免裁切影响文案与主体。</span>
        </div>
      </section>
    );
  }

  const messageText = "仅此素材待上传，已配置的区域仍会正常显示。";
  return (
    <section className="homepage-editor__media-status" aria-label="素材配置状态">
      <ExclamationCircleOutlined />
      <div>
        <strong>待配置：{missingSource.label}{missing > 1 ? ` 等 ${missing} 项` : ""}</strong>
        <span>{missingSource.device !== "shared" && missingSource.device !== device ? `请先切换到${missingSource.device === "desktop" ? "桌面端" : "移动端"}补齐；${messageText}` : messageText}</span>
        {missingSource.device === "shared" || missingSource.device === device ? (
          <button type="button" onClick={() => focusInspectorField(missingSource.key, blockId)}>去上传{missingSource.label}</button>
        ) : null}
      </div>
    </section>
  );
}

function InspectorDraftActions({
  saving,
  onSave,
  onCancel,
}: {
  saving: boolean;
  onSave: () => Promise<void>;
  onCancel: () => void;
}) {
  return (
    <footer className="homepage-editor__properties-actions">
      <span>修改仅在点击保存后写入草稿</span>
      <Button size="small" disabled={saving} onClick={onCancel}>取消</Button>
      <Button
        size="small"
        type="primary"
        icon={<SaveOutlined />}
        loading={saving}
        onClick={() => void onSave()}
      >
        保存
      </Button>
    </footer>
  );
}

function ContractStatusBanner({ status }: { status: ModuleContractStatus }) {
  const tone = status.errors.length > 0 ? "error" : status.warnings.length > 0 ? "warning" : "ready";
  return (
    <div className={`homepage-editor__contract-status is-${tone}`} role="status">
      {tone === "ready" ? <CheckCircleOutlined /> : <ExclamationCircleOutlined />}
      <div>
        <strong>内容完成度 {status.completed}/{status.total}</strong>
        {status.errors.length > 0 ? (
          <span>发布前需完成：{status.errors.join("；")}</span>
        ) : status.warnings.length > 0 ? (
          <span>{status.warnings[0]}</span>
        ) : (
          <span>当前模块已达到发布标准</span>
        )}
      </div>
    </div>
  );
}

function InspectorHeader({
  title,
  device,
  onClose,
}: {
  title: string;
  device: InspectorDevice;
  onClose: () => void;
}) {
  return (
    <header className="homepage-editor__inspector-header">
      <strong className="homepage-editor__inspector-title">{title}</strong>
      <span className="homepage-editor__inspector-device">{device === "mobile" ? "移动端" : "桌面端"}</span>
      <button type="button" className="homepage-editor__close-panel" aria-label="收起模块设置" onClick={onClose}>
        <CloseOutlined />
      </button>
    </header>
  );
}

function useSelectedModuleEditor() {
  const dispatch = useHomepagePuck((state) => state.dispatch);
  const appData = useHomepagePuck((state) => state.appState.data);
  const selectedItem = useHomepagePuck((state) => state.selectedItem);
  const currentViewport = useHomepagePuck((state) => state.appState.ui.viewports.current);
  const props = (selectedItem?.props || {}) as Record<string, any>;
  const content = appData.content as Array<{ type: string; props: Record<string, any> }>;
  const index = content.findIndex((item) => item.props?.id === props.id);
  const update = (patch: Record<string, any>) => {
    if (index < 0) return;
    const next = [...content];
    next[index] = { ...next[index], props: { ...next[index].props, ...patch } };
    dispatch({ type: "setData", data: { ...appData, content: next } });
  };
  const close = () => dispatch({ type: "setUi", ui: { itemSelector: null } });
  return { props, update, close, device: getInspectorDevice(currentViewport) };
}

function HeroInspector({
  saving,
  onSave,
  onCancel,
}: {
  saving: boolean;
  onSave: () => Promise<void>;
  onCancel: () => void;
}) {
  const dispatch = useHomepagePuck((state) => state.dispatch);
  const appData = useHomepagePuck((state) => state.appState.data);
  const selectedItem = useHomepagePuck((state) => state.selectedItem);
  const currentViewport = useHomepagePuck((state) => state.appState.ui.viewports.current);
  const device = getInspectorDevice(currentViewport);
  const props = (selectedItem?.props || {}) as Record<string, any>;
  const content = appData.content as Array<{ type: string; props: Record<string, any> }>;
  const index = content.findIndex((item) => item.props?.id === props.id);
  const [safeArea, setSafeArea] = useState(false);
  const [meta, setMeta] = useState<{ width?: number; height?: number; format?: string; size?: number }>({});
  const [imgNatural, setImgNatural] = useState({ width: 0, height: 0 });

  const update = (patch: Record<string, any>) => {
    if (index < 0) return;
    const next = [...content];
    next[index] = { ...next[index], props: { ...next[index].props, ...patch } };
    dispatch({ type: "setData", data: { ...appData, content: next } });
  };
  const closePanel = () => dispatch({ type: "setUi", ui: { itemSelector: null } });

  const imageField = device === "mobile" ? "mobileImage" : "desktopImage";
  const configuredImageUrl = props[imageField] || "";
  const imageUrl = configuredImageUrl || (device === "mobile" ? props.desktopImage || "" : "");
  const isFallback = device === "mobile" && !configuredImageUrl && Boolean(props.desktopImage);
  const focusXField = device === "mobile" ? "mobileFocusX" : "desktopFocusX";
  const focusYField = device === "mobile" ? "mobileFocusY" : "desktopFocusY";
  const focusX = Math.min(100, Math.max(0, Number(props[focusXField] ?? props.focusX ?? 50)));
  const focusY = Math.min(100, Math.max(0, Number(props[focusYField] ?? props.focusY ?? 50)));
  const spec = device === "mobile" ? IMAGE_SPECS.hero.mobile : IMAGE_SPECS.hero.desktop;
  const aspectRatio = device === "mobile" ? "9 / 16" : "16 / 9";
  const status = evaluateHeroContract(props);

  useEffect(() => {
    if (!imageUrl) { setImgNatural({ width: 0, height: 0 }); return; }
    let cancelled = false;
    const img = new Image();
    img.onload = () => { if (!cancelled) setImgNatural({ width: img.naturalWidth, height: img.naturalHeight }); };
    img.src = imageUrl;
    return () => { cancelled = true; };
  }, [imageUrl]);

  const finalWidth = meta.width || imgNatural.width;
  const finalHeight = meta.height || imgNatural.height;
  const format = meta.format || (imageUrl.match(/\.(webp|avif|jpe?g|png|gif)/i)?.[1] || "").toLowerCase();
  const size = meta.size;
  const hasImage = Boolean(imageUrl);

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) { message.error("只能上传图片"); return false; }
    if (file.size > 10 * 1024 * 1024) { message.error("图片不能超过 10MB"); return false; }
    try {
      const result = await uploadApi.uploadImage(file);
      const data = unwrapResponse<{ url?: string; width?: number; height?: number; format?: string; size?: number }>(result);
      const url = data?.url || (result as any)?.data?.url;
      if (url) {
        update({ [imageField]: url });
        setMeta({ width: data?.width, height: data?.height, format: data?.format, size: data?.size || file.size });
        message.success("上传成功");
      } else { message.error("上传返回结果异常"); }
    } catch { message.error("上传失败，请重试"); }
    return false;
  };

  return (
    <section className="homepage-editor__inspector" data-active-device={device} aria-label="模块属性">
      <header className="homepage-editor__inspector-header">
        <strong className="homepage-editor__inspector-title">{getModuleDisplayName("首屏主视觉", props)}</strong>
        <span className="homepage-editor__inspector-device">{device === "mobile" ? "移动端" : "桌面端"}</span>
        <button type="button" className="homepage-editor__close-panel" aria-label="收起模块设置" onClick={closePanel}>
          <CloseOutlined />
        </button>
      </header>

      <div className="homepage-editor__inspector-scroll">
        <p className="homepage-editor__properties-helper">{HERO_CONTRACT.purpose}</p>
        <ContractStatusBanner status={status} />
        <InspectorSection title="模块概况" resetKey={props.id}>
          <div className="homepage-editor__inspector-field">
            <label>图层名称<span className="homepage-editor__inspector-hint">仅用于页面结构识别</span></label>
            <Input
              value={props.moduleName || ""}
              onChange={(event) => update({ moduleName: event.target.value })}
              maxLength={24}
              placeholder="默认使用首屏展示"
            />
          </div>
        </InspectorSection>

        <InspectorSection title={device === "mobile" ? "移动端主视觉" : "桌面端主视觉"} resetKey={props.id}>
          {isFallback ? (
            <div className="homepage-editor__media-status is-fallback">
              <ExclamationCircleOutlined />
              <div><strong>当前复用桌面端主视觉</strong><span>建议上传9:16竖图，并为移动端单独设置焦点。</span></div>
            </div>
          ) : null}
          {hasImage ? (
            <>
              <div className="homepage-editor__inspector-image-summary">
                <img src={imageUrl} alt="当前主视觉图片" />
                <div>
                  <strong>{device === "mobile" ? "移动端主视觉" : "桌面端主视觉"}</strong>
                  <span>已同步到画布</span>
                  <div className="homepage-editor__inspector-image-actions">
                    <Upload accept="image/*" showUploadList={false} beforeUpload={handleUpload}>
                      <Button size="small" type="primary" icon={<SwapOutlined />}>替换</Button>
                    </Upload>
                    {configuredImageUrl ? <Button size="small" icon={<DeleteOutlined />} onClick={() => update({ [imageField]: "" })}>移除</Button> : null}
                  </div>
                </div>
              </div>
              <p className="homepage-editor__inspector-media-spec">推荐比例：{spec.ratio} · 建议 ≥ {spec.width} × {spec.height}</p>
              <details className="homepage-editor__inspector-details">
                <summary>调整裁剪与安全区域</summary>
                <FocusPicker
                  src={imageUrl}
                  focusX={focusX}
                  focusY={focusY}
                  aspectRatio={aspectRatio}
                  safeArea={safeArea}
                  onChange={(x, y) => update({ [focusXField]: x, [focusYField]: y })}
                />
                <label className="homepage-editor__inspector-toggle">
                  <input type="checkbox" checked={safeArea} onChange={(e) => setSafeArea(e.target.checked)} />
                  <span>显示安全区域</span>
                </label>
              </details>
              <details className="homepage-editor__inspector-details">
                <summary>图片检查</summary>
                <ImageStatus width={finalWidth} height={finalHeight} format={format} size={size} spec={spec} />
              </details>
            </>
          ) : (
            <div className="homepage-editor__inspector-empty">
              <p>暂无主视觉图片</p>
              <Upload accept="image/*" showUploadList={false} beforeUpload={handleUpload}>
                <Button size="small" type="primary" icon={<InboxOutlined />}>上传图片</Button>
              </Upload>
              <small>推荐比例：{spec.ratio} · 建议 ≥ {spec.width} × {spec.height}</small>
            </div>
          )}
        </InspectorSection>

        <InspectorSection title="文字内容" resetKey={props.id}>
          <div className="homepage-editor__inspector-field">
            <label>标题 <em>必填</em><span className="homepage-editor__inspector-count">{(props.title || "").length}/{HERO_CONTRACT.content.limits.title}</span></label>
            <Input value={props.title || ""} onChange={(e) => update({ title: e.target.value })} maxLength={HERO_CONTRACT.content.limits.title} placeholder="主标题" status={props.title?.trim() ? undefined : "error"} />
          </div>
          <div className="homepage-editor__inspector-field">
            <label>副标题<span className="homepage-editor__inspector-count">{(props.subtitle || "").length}/{HERO_CONTRACT.content.limits.subtitle}</span></label>
            <Input.TextArea value={props.subtitle || ""} onChange={(e) => update({ subtitle: e.target.value })} maxLength={HERO_CONTRACT.content.limits.subtitle} rows={2} placeholder="副标题（1-2 行）" />
          </div>
          <div className="homepage-editor__inspector-field">
            <label>按钮文字<span className="homepage-editor__inspector-count">{(props.actionText || "").length}/{HERO_CONTRACT.content.limits.actionText}</span></label>
            <Input value={props.actionText || ""} onChange={(e) => update({ actionText: e.target.value })} maxLength={HERO_CONTRACT.content.limits.actionText} placeholder="如：探索新品（留空不显示按钮）" />
          </div>
        </InspectorSection>

        <InspectorSection title="点击跳转" resetKey={props.id}>
          <LinkTargetField
            id={props.id}
            targetType={props.targetType}
            productId={props.productId}
            linkUrl={props.linkUrl}
            onChange={update}
            label="首屏按钮点击后"
          />
        </InspectorSection>

        <InspectorSection title="版式设置" defaultOpen={false} resetKey={props.id}>
          <div className="homepage-editor__inspector-option-group">
            <div>
              <strong>文案对齐</strong>
              <span>即时调整首屏文字位置，不影响图片焦点。</span>
            </div>
            <div className="homepage-editor__inspector-segmented" role="group" aria-label="文案对齐">
              <button
                type="button"
                className={props.alignment === "center" ? "is-active" : ""}
                aria-pressed={props.alignment === "center"}
                onClick={() => update({ alignment: "center" })}
              >
                居中
              </button>
              <button
                type="button"
                className={props.alignment !== "center" ? "is-active" : ""}
                aria-pressed={props.alignment !== "center"}
                onClick={() => update({ alignment: "left" })}
              >
                左对齐
              </button>
            </div>
          </div>
        </InspectorSection>

        <InspectorSection title="高级设置" defaultOpen={false} resetKey={props.id}>
          <div className="homepage-editor__inspector-field">
            <label>图片替代文字<span className="homepage-editor__inspector-hint">用于 SEO / 无障碍，不在页面显示</span></label>
            <Input value={props.altText || ""} onChange={(e) => update({ altText: e.target.value })} maxLength={HERO_CONTRACT.content.limits.altText} placeholder="描述这张主视觉图" />
          </div>
        </InspectorSection>
      </div>
      <InspectorDraftActions saving={saving} onSave={onSave} onCancel={onCancel} />
    </section>
  );
}

/**
 * 图文混排样板检查器：内容、素材、布局与高级设置按业务顺序拆分。
 * 草稿允许不完整，发布质量问题在顶部即时提示。
 */
function ImageTextInspector({
  saving,
  onSave,
  onCancel,
}: {
  saving: boolean;
  onSave: () => Promise<void>;
  onCancel: () => void;
}) {
  const dispatch = useHomepagePuck((state) => state.dispatch);
  const appData = useHomepagePuck((state) => state.appState.data);
  const selectedItem = useHomepagePuck((state) => state.selectedItem);
  const currentViewport = useHomepagePuck((state) => state.appState.ui.viewports.current);
  const device = getInspectorDevice(currentViewport);
  const props = (selectedItem?.props || {}) as Record<string, any>;
  const content = appData.content as Array<{ type: string; props: Record<string, any> }>;
  const index = content.findIndex((item) => item.props?.id === props.id);
  const template = props.template || IMAGE_TEXT_CONTRACT.defaults.template;
  const needsImage = template !== "textOnly";
  const focusX = Math.min(100, Math.max(0, Number(props.focusX ?? 50)));
  const focusY = Math.min(100, Math.max(0, Number(props.focusY ?? 50)));
  const status = evaluateImageTextContract(props);
  const statusTone = status.errors.length > 0 ? "error" : status.warnings.length > 0 ? "warning" : "ready";

  const update = (patch: Record<string, any>) => {
    if (index < 0) return;
    const next = [...content];
    next[index] = { ...next[index], props: { ...next[index].props, ...patch } };
    dispatch({ type: "setData", data: { ...appData, content: next } });
  };
  const closePanel = () => dispatch({ type: "setUi", ui: { itemSelector: null } });

  return (
    <section className="homepage-editor__inspector" data-active-device={device} aria-label="图文混排模块属性">
      <header className="homepage-editor__inspector-header">
        <strong className="homepage-editor__inspector-title">{getModuleDisplayName("图文混排", props)}</strong>
        <span className="homepage-editor__inspector-device">{device === "mobile" ? "移动端" : "桌面端"}</span>
        <button type="button" className="homepage-editor__close-panel" aria-label="收起模块设置" onClick={closePanel}>
          <CloseOutlined />
        </button>
      </header>

      <div className="homepage-editor__inspector-scroll">
        <p className="homepage-editor__properties-helper">{IMAGE_TEXT_CONTRACT.purpose}</p>
        <div className={`homepage-editor__contract-status is-${statusTone}`} role="status">
          {statusTone === "ready" ? <CheckCircleOutlined /> : <ExclamationCircleOutlined />}
          <div>
            <strong>内容完成度 {status.completed}/{status.total}</strong>
            {status.errors.length > 0 ? (
              <span>发布前需完成：{status.errors.join("；")}</span>
            ) : status.warnings.length > 0 ? (
              <span>{status.warnings[0]}</span>
            ) : (
              <span>当前模块已达到发布标准</span>
            )}
          </div>
        </div>

        <InspectorSection title="模块概况" resetKey={props.id}>
          <div className="homepage-editor__inspector-field">
            <label>图层名称<span className="homepage-editor__inspector-hint">仅用于页面结构识别</span></label>
            <Input
              value={props.moduleName || ""}
              onChange={(event) => update({ moduleName: event.target.value })}
              maxLength={24}
              placeholder="默认使用图文介绍"
            />
          </div>
        </InspectorSection>

        <InspectorSection title="基础内容" resetKey={props.id}>
          <div className="homepage-editor__inspector-field">
            <label>标签<span className="homepage-editor__inspector-count">{(props.label || "").length}/{IMAGE_TEXT_CONTRACT.content.limits.label}</span></label>
            <Input value={props.label || ""} onChange={(event) => update({ label: event.target.value })} maxLength={IMAGE_TEXT_CONTRACT.content.limits.label} placeholder="例如 BRAND STORY" />
          </div>
          <div className="homepage-editor__inspector-field">
            <label>标题 <em>必填</em><span className="homepage-editor__inspector-count">{(props.title || "").length}/{IMAGE_TEXT_CONTRACT.content.limits.title}</span></label>
            <Input value={props.title || ""} onChange={(event) => update({ title: event.target.value })} maxLength={IMAGE_TEXT_CONTRACT.content.limits.title} placeholder="品牌故事" status={props.title?.trim() ? undefined : "error"} />
          </div>
          <div className="homepage-editor__inspector-field">
            <label>正文<span className="homepage-editor__inspector-count">{(props.body || "").length}/{IMAGE_TEXT_CONTRACT.content.limits.body}</span></label>
            <Input.TextArea value={props.body || ""} onChange={(event) => update({ body: event.target.value })} maxLength={IMAGE_TEXT_CONTRACT.content.limits.body} rows={4} placeholder="用 2—4 行说明设计理念、材质或品牌故事" />
          </div>
          <div className="homepage-editor__inspector-field">
            <label>按钮文字<span className="homepage-editor__inspector-hint">留空则不显示按钮</span></label>
            <Input value={props.buttonText || ""} onChange={(event) => update({ buttonText: event.target.value })} maxLength={IMAGE_TEXT_CONTRACT.content.limits.buttonText} placeholder="查看详情" />
          </div>
        </InspectorSection>

        {props.buttonText ? (
          <InspectorSection title="点击跳转" resetKey={props.id}>
            <LinkTargetField
              id={props.id}
              targetType={props.targetType}
              productId={props.productId}
              linkUrl={props.linkUrl}
              onChange={update}
              label="图文按钮点击后"
            />
          </InspectorSection>
        ) : null}

        {needsImage && (
          <InspectorSection title="图片素材" resetKey={props.id}>
            <MediaPickerField
              fieldKey="image"
              device="shared"
              value={props.image || ""}
              onChange={(image) => update({ image })}
              required
              spec={IMAGE_SPECS.imageText.image}
              placeholder="上传图文配图"
              previewAspectRatio={IMAGE_TEXT_CONTRACT.canvas.desktopMediaAspectRatio}
              previewFocus={{ x: focusX, y: focusY }}
            />
          </InspectorSection>
        )}

        <InspectorSection title="布局" defaultOpen={false} resetKey={props.id}>
          <div className="homepage-editor__inspector-option-group">
            <div>
              <strong>展示方式</strong>
              <span>桌面端按标准版式展示；移动端图文自动改为上下排列。</span>
            </div>
            <div className="homepage-editor__inspector-segmented is-grid" role="group" aria-label="图文展示方式">
              {[
                ["textLeftImageRight", "文左图右"],
                ["textRightImageLeft", "图左文右"],
                ["textOnly", "纯文字"],
                ["imageBackground", "图片背景"],
              ].map(([value, label]) => (
                <button key={value} type="button" className={template === value ? "is-active" : ""} aria-pressed={template === value} onClick={() => update({ template: value })}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="homepage-editor__inspector-option-group">
            <div>
              <strong>内容留白</strong>
              <span>只调整文字区域的呼吸感，不破坏图片比例。</span>
            </div>
            <div className="homepage-editor__inspector-segmented is-three" role="group" aria-label="内容留白">
              {[["compact", "紧凑"], ["normal", "标准"], ["spacious", "宽松"]].map(([value, label]) => (
                <button key={value} type="button" className={(props.spacing || "normal") === value ? "is-active" : ""} aria-pressed={(props.spacing || "normal") === value} onClick={() => update({ spacing: value })}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="homepage-editor__layout-rule">
            <strong>画布标准</strong>
            <span>桌面：双栏 1:1，图片 4:3，最大宽度 1280px</span>
            <span>移动：图片在上、文字在下，图片 3:4</span>
          </div>
        </InspectorSection>

        {needsImage && (
          <InspectorSection title="高级设置" defaultOpen={false} resetKey={props.id}>
            <div className="homepage-editor__inspector-field">
              <label>图片替代文字<span className="homepage-editor__inspector-hint">用于无障碍与搜索，不在页面显示</span></label>
              <Input value={props.imageAlt || ""} onChange={(event) => update({ imageAlt: event.target.value })} maxLength={IMAGE_TEXT_CONTRACT.content.limits.imageAlt} placeholder="描述图片中的人物、珠宝或场景" />
            </div>
            {props.image && (
              <div className="homepage-editor__inspector-field">
                <label>图片焦点<span className="homepage-editor__inspector-hint">裁切时优先保留的位置</span></label>
                <FocusPicker
                  src={props.image}
                  focusX={focusX}
                  focusY={focusY}
                  aspectRatio={IMAGE_TEXT_CONTRACT.canvas.desktopMediaAspectRatio}
                  onChange={(x, y) => update({ focusX: x, focusY: y })}
                />
              </div>
            )}
          </InspectorSection>
        )}
      </div>
      <InspectorDraftActions saving={saving} onSave={onSave} onCancel={onCancel} />
    </section>
  );
}

function SinglePosterInspector({ saving, onSave, onCancel }: {
  saving: boolean;
  onSave: () => Promise<void>;
  onCancel: () => void;
}) {
  const { props, update, close, device } = useSelectedModuleEditor();
  const status = evaluateSinglePosterContract(props);
  const imageField = device === "mobile" ? "mobileImage" : "desktopImage";
  const imageSpec = device === "mobile" ? IMAGE_SPECS.singlePoster.mobile : IMAGE_SPECS.singlePoster.image;
  const aspectRatio = device === "mobile"
    ? SINGLE_POSTER_CONTRACT.canvas.mobileMediaAspectRatio
    : SINGLE_POSTER_CONTRACT.canvas.desktopMediaAspectRatio;
  const focusX = Math.min(100, Math.max(0, Number(props.focusX ?? 50)));
  const focusY = Math.min(100, Math.max(0, Number(props.focusY ?? 50)));

  return (
    <section className="homepage-editor__inspector" data-active-device={device} aria-label="单图海报模块属性">
      <InspectorHeader title={getModuleDisplayName("单图海报", props)} device={device} onClose={close} />
      <div className="homepage-editor__inspector-scroll">
        <p className="homepage-editor__properties-helper">{SINGLE_POSTER_CONTRACT.purpose}</p>
        <ContractStatusBanner status={status} />

        <InspectorSection title="模块概况" resetKey={props.id}>
          <div className="homepage-editor__inspector-field">
            <label>图层名称<span className="homepage-editor__inspector-hint">仅用于页面结构识别</span></label>
            <Input value={props.moduleName || ""} onChange={(event) => update({ moduleName: event.target.value })} maxLength={24} placeholder="默认使用单图介绍" />
          </div>
        </InspectorSection>

        <InspectorSection title="基础内容" resetKey={props.id}>
          <div className="homepage-editor__inspector-field">
            <label>编号<span className="homepage-editor__inspector-count">{(props.number || "").length}/{SINGLE_POSTER_CONTRACT.content.limits.number}</span></label>
            <Input value={props.number || ""} onChange={(event) => update({ number: event.target.value })} maxLength={SINGLE_POSTER_CONTRACT.content.limits.number} placeholder="01" />
          </div>
          <div className="homepage-editor__inspector-field">
            <label>标签<span className="homepage-editor__inspector-count">{(props.label || "").length}/{SINGLE_POSTER_CONTRACT.content.limits.label}</span></label>
            <Input value={props.label || ""} onChange={(event) => update({ label: event.target.value })} maxLength={SINGLE_POSTER_CONTRACT.content.limits.label} placeholder="SIGNATURE" />
          </div>
          <div className="homepage-editor__inspector-field">
            <label>标题 <em>必填</em><span className="homepage-editor__inspector-count">{(props.title || "").length}/{SINGLE_POSTER_CONTRACT.content.limits.title}</span></label>
            <Input value={props.title || ""} onChange={(event) => update({ title: event.target.value })} maxLength={SINGLE_POSTER_CONTRACT.content.limits.title} status={props.title?.trim() ? undefined : "error"} />
          </div>
          <div className="homepage-editor__inspector-field">
            <label>副标题<span className="homepage-editor__inspector-count">{(props.subtitle || "").length}/{SINGLE_POSTER_CONTRACT.content.limits.subtitle}</span></label>
            <Input value={props.subtitle || ""} onChange={(event) => update({ subtitle: event.target.value })} maxLength={SINGLE_POSTER_CONTRACT.content.limits.subtitle} placeholder="一句话补充系列卖点" />
          </div>
          <div className="homepage-editor__inspector-field">
            <label>点击跳转 <em>必填</em></label>
            <Input value={props.linkUrl || ""} onChange={(event) => update({ linkUrl: event.target.value })} placeholder="例如 /products" status={props.linkUrl?.trim() ? undefined : "error"} />
          </div>
        </InspectorSection>

        <InspectorSection title={device === "mobile" ? "移动端海报" : "桌面端海报"} resetKey={props.id}>
          {device === "mobile" && !props.mobileImage ? (
            <div className="homepage-editor__media-status is-fallback">
              <ExclamationCircleOutlined />
              <div><strong>当前复用桌面端海报</strong><span>建议上传3:4竖图，避免主体被自动裁切。</span></div>
            </div>
          ) : null}
          <MediaPickerField
            fieldKey={imageField}
            device={device}
            value={props[imageField] || ""}
            onChange={(value) => update({ [imageField]: value })}
            required={device === "desktop"}
            spec={imageSpec}
            placeholder={device === "mobile" ? "上传移动端竖版海报" : "上传桌面端海报"}
            previewAspectRatio={aspectRatio}
            previewFocus={{ x: focusX, y: focusY }}
          />
        </InspectorSection>

        <InspectorSection title="布局" defaultOpen={false} resetKey={props.id}>
          <div className="homepage-editor__inspector-option-group">
            <div><strong>桌面端图文顺序</strong><span>移动端始终采用图片在上、文字在下。</span></div>
            <div className="homepage-editor__inspector-segmented" role="group" aria-label="海报图文顺序">
              {[["leftTextRightImage", "文左图右"], ["leftImageRightText", "图左文右"]].map(([value, label]) => (
                <button key={value} type="button" className={(props.template || "leftTextRightImage") === value ? "is-active" : ""} aria-pressed={(props.template || "leftTextRightImage") === value} onClick={() => update({ template: value })}>{label}</button>
              ))}
            </div>
          </div>
          <div className="homepage-editor__layout-rule"><strong>画布标准</strong><span>桌面：文案1/4、图片3/4，图片固定3:2</span><span>移动：图片3:4，文案置于图片下方</span></div>
        </InspectorSection>

        {(props.desktopImage || props.mobileImage) && (
          <InspectorSection title="高级设置" defaultOpen={false} resetKey={props.id}>
            <div className="homepage-editor__inspector-field">
              <label>图片焦点<span className="homepage-editor__inspector-hint">双端共用，裁切时优先保留</span></label>
              <FocusPicker src={props[imageField] || props.desktopImage || props.mobileImage} focusX={focusX} focusY={focusY} aspectRatio={aspectRatio} onChange={(x, y) => update({ focusX: x, focusY: y })} />
            </div>
          </InspectorSection>
        )}
      </div>
      <InspectorDraftActions saving={saving} onSave={onSave} onCancel={onCancel} />
    </section>
  );
}

function FullBleedInspector({ saving, onSave, onCancel }: {
  saving: boolean;
  onSave: () => Promise<void>;
  onCancel: () => void;
}) {
  const { props, update, close, device } = useSelectedModuleEditor();
  const status = evaluateFullBleedContract(props);
  const imageField = device === "mobile" ? "mobileImage" : "image";
  const imageSpec = device === "mobile" ? IMAGE_SPECS.fullBleed.mobile : IMAGE_SPECS.fullBleed.desktop;
  const aspectRatio = device === "mobile" ? "5 / 6" : "12 / 5";
  const focusXField = device === "mobile" ? "mobileFocusX" : "desktopFocusX";
  const focusYField = device === "mobile" ? "mobileFocusY" : "desktopFocusY";
  const focusX = Math.min(100, Math.max(0, Number(props[focusXField] ?? 50)));
  const focusY = Math.min(100, Math.max(0, Number(props[focusYField] ?? 50)));
  const previewImage = props[imageField] || props.image || props.mobileImage || "";

  return (
    <section className="homepage-editor__inspector" data-active-device={device} aria-label="单张海报模块属性">
      <InspectorHeader title={getModuleDisplayName("全屏出血图", props)} device={device} onClose={close} />
      <div className="homepage-editor__inspector-scroll">
        <p className="homepage-editor__properties-helper">{FULL_BLEED_CONTRACT.purpose}</p>
        <ContractStatusBanner status={status} />

        <InspectorSection title="模块概况" resetKey={props.id}>
          <div className="homepage-editor__inspector-field">
            <label>图层名称<span className="homepage-editor__inspector-hint">仅用于页面结构识别</span></label>
            <Input value={props.moduleName || ""} onChange={(event) => update({ moduleName: event.target.value })} maxLength={24} placeholder="默认使用单张海报" />
          </div>
        </InspectorSection>

        <InspectorSection title={device === "mobile" ? "移动端海报" : "桌面端海报"} resetKey={props.id}>
          {device === "mobile" && !props.mobileImage && props.image ? (
            <div className="homepage-editor__media-status is-fallback">
              <ExclamationCircleOutlined />
              <div><strong>当前复用桌面端海报</strong><span>建议上传5:6竖图，避免人物或珠宝主体被裁切。</span></div>
            </div>
          ) : null}
          <MediaPickerField
            fieldKey={imageField}
            device={device}
            value={props[imageField] || ""}
            onChange={(value) => update({ [imageField]: value })}
            required={device === "desktop"}
            spec={imageSpec}
            placeholder={device === "mobile" ? "上传移动端5:6海报" : "上传桌面端12:5海报"}
            previewAspectRatio={aspectRatio}
            previewFocus={{ x: focusX, y: focusY }}
          />
          {previewImage ? (
            <div className="homepage-editor__inspector-field">
              <label>{device === "mobile" ? "移动端视觉焦点" : "桌面端视觉焦点"}<span className="homepage-editor__inspector-hint">两端独立保存</span></label>
              <FocusPicker
                src={previewImage}
                focusX={focusX}
                focusY={focusY}
                aspectRatio={aspectRatio}
                safeArea
                onChange={(x, y) => update({ [focusXField]: x, [focusYField]: y })}
              />
            </div>
          ) : null}
          <div className="homepage-editor__layout-rule">
            <strong>画布标准</strong>
            <span>桌面：12:5通栏横图，完整宽度展示</span>
            <span>移动：5:6竖图，独立素材与独立焦点</span>
          </div>
        </InspectorSection>

        <InspectorSection title="文字内容" resetKey={props.id}>
          <div className="homepage-editor__inspector-field">
            <label>标题<span className="homepage-editor__inspector-count">{(props.title || "").length}/{FULL_BLEED_CONTRACT.content.limits.title}</span></label>
            <Input value={props.title || ""} onChange={(event) => update({ title: event.target.value })} maxLength={FULL_BLEED_CONTRACT.content.limits.title} placeholder="可留空，使用纯视觉海报" />
          </div>
          <div className="homepage-editor__inspector-field">
            <label>副标题<span className="homepage-editor__inspector-count">{(props.subtitle || "").length}/{FULL_BLEED_CONTRACT.content.limits.subtitle}</span></label>
            <Input.TextArea value={props.subtitle || ""} onChange={(event) => update({ subtitle: event.target.value })} maxLength={FULL_BLEED_CONTRACT.content.limits.subtitle} rows={2} placeholder="建议1—2行，避免遮挡主体" />
          </div>
          <div className="homepage-editor__inspector-field">
            <label>引导文字<span className="homepage-editor__inspector-count">{(props.buttonText || "").length}/{FULL_BLEED_CONTRACT.content.limits.actionText}</span></label>
            <Input value={props.buttonText || ""} onChange={(event) => update({ buttonText: event.target.value })} maxLength={FULL_BLEED_CONTRACT.content.limits.actionText} placeholder="例如：探索系列；不跳转时不会显示" />
          </div>
        </InspectorSection>

        <InspectorSection title="点击跳转" resetKey={props.id}>
          <LinkTargetField id={props.id} targetType={props.targetType} productId={props.productId} linkUrl={props.linkUrl} onChange={update} label="整张海报点击后" />
        </InspectorSection>

        <InspectorSection title="版式设置" defaultOpen={false} resetKey={props.id}>
          <div className="homepage-editor__inspector-option-group">
            <div><strong>文字位置</strong><span>只提供稳定版式，避免自由拖拽破坏海报构图。</span></div>
            <div className="homepage-editor__inspector-segmented is-grid" role="group" aria-label="海报文字位置">
              {[["textCenter", "居中"], ["textLeft", "左侧"], ["textRight", "右侧"], ["textBottomLeft", "左下"]].map(([value, label]) => (
                <button key={value} type="button" className={(props.template || "textCenter") === value ? "is-active" : ""} aria-pressed={(props.template || "textCenter") === value} onClick={() => update({ template: value })}>{label}</button>
              ))}
            </div>
          </div>
          <div className="homepage-editor__inspector-option-group">
            <div><strong>文字遮罩</strong><span>只调节可读性，不改变品牌色与字体。</span></div>
            <div className="homepage-editor__inspector-segmented is-three" role="group" aria-label="海报文字遮罩">
              {[["none", "无"], ["soft", "柔和"], ["strong", "加强"]].map(([value, label]) => (
                <button key={value} type="button" className={(props.overlayPreset || "soft") === value ? "is-active" : ""} aria-pressed={(props.overlayPreset || "soft") === value} onClick={() => update({ overlayPreset: value })}>{label}</button>
              ))}
            </div>
          </div>
        </InspectorSection>

        <InspectorSection title="高级设置" defaultOpen={false} resetKey={props.id}>
          <div className="homepage-editor__inspector-field">
            <label>图片替代文字<span className="homepage-editor__inspector-hint">用于搜索与无障碍，不在海报上显示</span></label>
            <Input value={props.altText || ""} onChange={(event) => update({ altText: event.target.value })} maxLength={FULL_BLEED_CONTRACT.content.limits.altText} placeholder="描述海报中的珠宝或场景" />
          </div>
        </InspectorSection>
      </div>
      <InspectorDraftActions saving={saving} onSave={onSave} onCancel={onCancel} />
    </section>
  );
}

function DoublePosterInspector({ saving, onSave, onCancel }: {
  saving: boolean;
  onSave: () => Promise<void>;
  onCancel: () => void;
}) {
  const { props, update, close, device } = useSelectedModuleEditor();
  const status = evaluateDoublePosterContract(props);
  const mainFocusX = Math.min(100, Math.max(0, Number(props.mainFocusX ?? 50)));
  const mainFocusY = Math.min(100, Math.max(0, Number(props.mainFocusY ?? 50)));
  const detailFocusX = Math.min(100, Math.max(0, Number(props.detailFocusX ?? 50)));
  const detailFocusY = Math.min(100, Math.max(0, Number(props.detailFocusY ?? 50)));

  return (
    <section className="homepage-editor__inspector" data-active-device={device} aria-label="双图展示模块属性">
      <InspectorHeader title={getModuleDisplayName("双图海报", props)} device={device} onClose={close} />
      <div className="homepage-editor__inspector-scroll">
        <p className="homepage-editor__properties-helper">{DOUBLE_POSTER_CONTRACT.purpose}</p>
        <ContractStatusBanner status={status} />

        <InspectorSection title="模块概况" resetKey={props.id}>
          <div className="homepage-editor__inspector-field">
            <label>图层名称<span className="homepage-editor__inspector-hint">仅用于页面结构识别</span></label>
            <Input value={props.moduleName || ""} onChange={(event) => update({ moduleName: event.target.value })} maxLength={24} placeholder="默认使用双图展示" />
          </div>
        </InspectorSection>

        <InspectorSection title="文字内容" resetKey={props.id}>
          <div className="homepage-editor__inspector-field">
            <label>编号<span className="homepage-editor__inspector-count">{(props.number || "").length}/{DOUBLE_POSTER_CONTRACT.content.limits.number}</span></label>
            <Input value={props.number || ""} onChange={(event) => update({ number: event.target.value })} maxLength={DOUBLE_POSTER_CONTRACT.content.limits.number} placeholder="02" />
          </div>
          <div className="homepage-editor__inspector-field">
            <label>标签<span className="homepage-editor__inspector-count">{(props.label || "").length}/{DOUBLE_POSTER_CONTRACT.content.limits.label}</span></label>
            <Input value={props.label || ""} onChange={(event) => update({ label: event.target.value })} maxLength={DOUBLE_POSTER_CONTRACT.content.limits.label} placeholder="COLLECTION" />
          </div>
          <div className="homepage-editor__inspector-field">
            <label>标题 <em>必填</em><span className="homepage-editor__inspector-count">{(props.title || "").length}/{DOUBLE_POSTER_CONTRACT.content.limits.title}</span></label>
            <Input value={props.title || ""} onChange={(event) => update({ title: event.target.value })} maxLength={DOUBLE_POSTER_CONTRACT.content.limits.title} status={props.title?.trim() ? undefined : "error"} />
          </div>
          <div className="homepage-editor__inspector-field">
            <label>介绍文字<span className="homepage-editor__inspector-count">{(props.description || "").length}/{DOUBLE_POSTER_CONTRACT.content.limits.description}</span></label>
            <Input.TextArea value={props.description || ""} onChange={(event) => update({ description: event.target.value })} maxLength={DOUBLE_POSTER_CONTRACT.content.limits.description} rows={3} placeholder="补充系列气质、材质或工艺特点" />
          </div>
          <div className="homepage-editor__inspector-field">
            <label>引导文字<span className="homepage-editor__inspector-count">{(props.actionText || "").length}/{DOUBLE_POSTER_CONTRACT.content.limits.actionText}</span></label>
            <Input value={props.actionText || ""} onChange={(event) => update({ actionText: event.target.value })} maxLength={DOUBLE_POSTER_CONTRACT.content.limits.actionText} placeholder="查看系列" />
          </div>
        </InspectorSection>

        <InspectorSection title="主海报 · 4:3" resetKey={props.id}>
          <MediaPickerField
            fieldKey="mainImage"
            device="shared"
            value={props.mainImage || ""}
            onChange={(mainImage) => update({ mainImage })}
            required
            spec={IMAGE_SPECS.doublePoster.main}
            placeholder="上传主海报"
            previewAspectRatio={DOUBLE_POSTER_CONTRACT.canvas.mainMediaAspectRatio}
            previewFocus={{ x: mainFocusX, y: mainFocusY }}
          />
          {props.mainImage ? (
            <div className="homepage-editor__inspector-field">
              <label>主图视觉焦点</label>
              <FocusPicker src={props.mainImage} focusX={mainFocusX} focusY={mainFocusY} aspectRatio={DOUBLE_POSTER_CONTRACT.canvas.mainMediaAspectRatio} safeArea onChange={(x, y) => update({ mainFocusX: x, mainFocusY: y })} />
            </div>
          ) : null}
        </InspectorSection>

        <InspectorSection title="细节海报 · 4:5" resetKey={props.id}>
          <MediaPickerField
            fieldKey="detailImage"
            device="shared"
            value={props.detailImage || ""}
            onChange={(detailImage) => update({ detailImage })}
            required
            spec={IMAGE_SPECS.doublePoster.detail}
            placeholder="上传细节海报"
            previewAspectRatio={DOUBLE_POSTER_CONTRACT.canvas.detailMediaAspectRatio}
            previewFocus={{ x: detailFocusX, y: detailFocusY }}
          />
          {props.detailImage ? (
            <div className="homepage-editor__inspector-field">
              <label>细节图视觉焦点</label>
              <FocusPicker src={props.detailImage} focusX={detailFocusX} focusY={detailFocusY} aspectRatio={DOUBLE_POSTER_CONTRACT.canvas.detailMediaAspectRatio} safeArea onChange={(x, y) => update({ detailFocusX: x, detailFocusY: y })} />
            </div>
          ) : null}
        </InspectorSection>

        <InspectorSection title="点击跳转" resetKey={props.id}>
          <LinkTargetField id={props.id} targetType={props.targetType} productId={props.productId} linkUrl={props.linkUrl} onChange={update} label="引导文字点击后" />
        </InspectorSection>

        <InspectorSection title="版式设置" defaultOpen={false} resetKey={props.id}>
          <div className="homepage-editor__inspector-option-group">
            <div><strong>桌面端主次关系</strong><span>移动端始终先展示主图，再展示细节图与文字。</span></div>
            <div className="homepage-editor__inspector-segmented" role="group" aria-label="双图桌面版式">
              {[["mainLeft", "主图在左"], ["mainRight", "主图在右"]].map(([value, label]) => (
                <button key={value} type="button" className={(props.layout || "mainLeft") === value ? "is-active" : ""} aria-pressed={(props.layout || "mainLeft") === value} onClick={() => update({ layout: value })}>{label}</button>
              ))}
            </div>
          </div>
          <div className="homepage-editor__layout-rule"><strong>画布标准</strong><span>主图固定4:3，细节图固定4:5</span><span>桌面8/4栏；移动端上下排列，不使用视口高度撑大模块</span></div>
        </InspectorSection>

        <InspectorSection title="高级设置" defaultOpen={false} resetKey={props.id}>
          <div className="homepage-editor__inspector-field">
            <label>主图替代文字<span className="homepage-editor__inspector-hint">用于搜索与无障碍</span></label>
            <Input value={props.mainAltText || ""} onChange={(event) => update({ mainAltText: event.target.value })} maxLength={DOUBLE_POSTER_CONTRACT.content.limits.altText} placeholder="描述主海报内容" />
          </div>
          <div className="homepage-editor__inspector-field">
            <label>细节图替代文字</label>
            <Input value={props.detailAltText || ""} onChange={(event) => update({ detailAltText: event.target.value })} maxLength={DOUBLE_POSTER_CONTRACT.content.limits.altText} placeholder="描述细节图内容" />
          </div>
        </InspectorSection>
      </div>
      <InspectorDraftActions saving={saving} onSave={onSave} onCancel={onCancel} />
    </section>
  );
}

function ProductRowFlatSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="homepage-editor__product-row-section" aria-label={title}>
      <header className="homepage-editor__product-row-section-head">
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </header>
      <div className="homepage-editor__product-row-section-body">{children}</div>
    </section>
  );
}

function ProductRowInspector({ saving, onSave, onCancel }: {
  saving: boolean;
  onSave: () => Promise<void>;
  onCancel: () => void;
}) {
  const { props, update, close, device } = useSelectedModuleEditor();
  const status = evaluateProductRowContract(props);
  const productIds = Array.isArray(props.productIds) ? props.productIds : [];
  const displayMode = props.displayMode || "standard";
  const actionStyle = props.actionStyle || (props.showButton ? "button" : "none");

  const updateProducts = (nextIds: number[]) => {
    if (nextIds.length > PRODUCT_ROW_CONTRACT.content.maxProducts) {
      message.warning(`产品展示行最多选择 ${PRODUCT_ROW_CONTRACT.content.maxProducts} 件商品`);
      return;
    }
    update({ productIds: nextIds });
  };

  return (
    <section className="homepage-editor__inspector homepage-editor__product-row-inspector" data-active-device={device} aria-label="作品陈列模块属性">
      <InspectorHeader title={getModuleDisplayName("产品展示行", props)} device={device} onClose={close} />
      <div className="homepage-editor__inspector-scroll">
        <p className="homepage-editor__properties-helper">{PRODUCT_ROW_CONTRACT.purpose}</p>
        <ContractStatusBanner status={status} />

        <ProductRowFlatSection title="模块基础内容">
          <div className="homepage-editor__inspector-field">
            <label>模块名称<span className="homepage-editor__inspector-hint">仅用于页面结构识别</span></label>
            <Input value={props.moduleName || ""} onChange={(event) => update({ moduleName: event.target.value })} maxLength={24} placeholder="默认使用作品陈列" />
          </div>
          <div className="homepage-editor__inspector-field">
            <label>模块样式</label>
          <div className="homepage-editor__product-row-mode-picker" role="group" aria-label="商品展示模式">
            <button
              type="button"
              className={displayMode === "album" ? "is-active" : ""}
              aria-pressed={displayMode === "album"}
              onClick={() => update({ displayMode: "album", showPrice: false, actionStyle: "none", showButton: false })}
            >
              <span className="homepage-editor__product-row-mode-preview">
                <img src="/svg/template-lookbook.svg" alt="画册展示版式预览" />
              </span>
              <span><strong>画册展示</strong><small>突出图片与作品氛围</small></span>
            </button>
            <button
              type="button"
              className={displayMode === "standard" ? "is-active" : ""}
              aria-pressed={displayMode === "standard"}
              onClick={() => update({ displayMode: "standard", showPrice: true, actionStyle: "text", showButton: false })}
            >
              <span className="homepage-editor__product-row-mode-preview">
                <img src="/svg/template-product-row.svg" alt="标准选款版式预览" />
              </span>
              <span><strong>标准选款</strong><small>显示价格与详情入口</small></span>
            </button>
          </div>
          <span className="homepage-editor__product-row-mode-note">选择样式会应用一组推荐配置，下方仍可逐项调整。</span>
          </div>
          <div className="homepage-editor__inspector-field">
            <label>标题<span className="homepage-editor__inspector-count">{(props.title || "").length}/{PRODUCT_ROW_CONTRACT.content.limits.title}</span></label>
            <Input value={props.title || ""} onChange={(event) => update({ title: event.target.value })} maxLength={PRODUCT_ROW_CONTRACT.content.limits.title} placeholder="可留空，直接展示商品" />
          </div>
          <div className="homepage-editor__inspector-field">
            <label>副标题<span className="homepage-editor__inspector-count">{(props.subtitle || "").length}/{PRODUCT_ROW_CONTRACT.content.limits.subtitle}</span></label>
            <Input value={props.subtitle || ""} onChange={(event) => update({ subtitle: event.target.value })} maxLength={PRODUCT_ROW_CONTRACT.content.limits.subtitle} placeholder="补充系列、材质或推荐理由" />
          </div>
        </ProductRowFlatSection>

        <ProductRowFlatSection
          title={`选择商品 · ${productIds.length}/${PRODUCT_ROW_CONTRACT.content.maxProducts}`}
          description={`至少选择 ${PRODUCT_ROW_CONTRACT.content.minProducts} 件；已选顺序就是画布与前台展示顺序。`}
        >
          <ProductIdsField value={productIds} onChange={updateProducts} maxProducts={PRODUCT_ROW_CONTRACT.content.maxProducts} />
        </ProductRowFlatSection>

        <ProductRowFlatSection title="陈列布局" description="桌面端与手机端设置同时显示，不随当前预览设备隐藏。">
          <div className="homepage-editor__product-row-setting">
            <div><strong>桌面端列数</strong><span>控制电脑端每行展示的商品数量。</span></div>
            <div className="homepage-editor__inspector-segmented is-three" role="group" aria-label="桌面端商品列数">
              {[["grid-2", "2列"], ["grid-3", "3列"], ["grid-4", "4列"]].map(([value, label]) => (
                <button key={value} type="button" className={(props.layout || "grid-3") === value ? "is-active" : ""} aria-pressed={(props.layout || "grid-3") === value} onClick={() => update({ layout: value })}>{label}</button>
              ))}
            </div>
          </div>
          <div className="homepage-editor__product-row-setting">
            <div><strong>手机端列数</strong><span>1列突出细节，2列提高浏览效率。</span></div>
            <div className="homepage-editor__inspector-segmented" role="group" aria-label="手机端商品列数">
              {[1, 2].map((value) => (
                <button key={value} type="button" className={(props.mobileColumns === 1 ? 1 : 2) === value ? "is-active" : ""} aria-pressed={(props.mobileColumns === 1 ? 1 : 2) === value} onClick={() => update({ mobileColumns: value })}>{value}列</button>
              ))}
            </div>
          </div>
          <div className="homepage-editor__product-row-setting">
            <div><strong>商品图片比例</strong><span>3:4适合珠宝画册，1:1适合统一商品主图。</span></div>
            <div className="homepage-editor__inspector-segmented" role="group" aria-label="商品图片比例">
              {[["3:4", "3:4竖版"], ["1:1", "1:1方图"]].map(([value, label]) => (
                <button key={value} type="button" className={(props.imageRatio || "3:4") === value ? "is-active" : ""} aria-pressed={(props.imageRatio || "3:4") === value} onClick={() => update({ imageRatio: value })}>{label}</button>
              ))}
            </div>
          </div>
          <div className="homepage-editor__layout-rule"><strong>当前画布</strong><span>{device === "desktop" ? `电脑端 · ${(props.layout || "grid-3").replace("grid-", "")}列` : `手机端 · ${props.mobileColumns === 1 ? 1 : 2}列`}</span><span>图片比例：{props.imageRatio || "3:4"}</span></div>
        </ProductRowFlatSection>

        <ProductRowFlatSection title="商品信息">
          <div className="homepage-editor__product-row-setting">
            <div><strong>价格</strong><span>价格从商品资料读取，模板内不能修改。</span></div>
            <div className="homepage-editor__inspector-segmented" role="group" aria-label="是否显示价格">
              <button type="button" className={props.showPrice !== false ? "is-active" : ""} aria-pressed={props.showPrice !== false} onClick={() => update({ showPrice: true })}>显示价格</button>
              <button type="button" className={props.showPrice === false ? "is-active" : ""} aria-pressed={props.showPrice === false} onClick={() => update({ showPrice: false })}>隐藏价格</button>
            </div>
          </div>
          <div className="homepage-editor__product-row-setting">
            <div><strong>操作样式</strong><span>三种样式均进入商品详情，不伪装成立即购买。</span></div>
            <div className="homepage-editor__inspector-segmented is-three" role="group" aria-label="商品操作样式">
              {[["none", "整卡点击"], ["text", "文字链接"], ["button", "描边按钮"]].map(([value, label]) => (
                <button key={value} type="button" className={actionStyle === value ? "is-active" : ""} aria-pressed={actionStyle === value} onClick={() => update({ actionStyle: value, showButton: value === "button", buttonText: value === "button" ? "查看详情" : props.buttonText })}>{label}</button>
              ))}
            </div>
          </div>
        </ProductRowFlatSection>

        <ProductRowFlatSection title="模块背景">
          <div className="homepage-editor__product-row-setting">
            <div><strong>背景预设</strong><span>限定品牌中性色，避免不同模块出现杂乱配色。</span></div>
            <div className="homepage-editor__inspector-segmented is-three" role="group" aria-label="作品陈列背景">
              {[["#FCFCFB", "暖白"], ["#F5F2ED", "米白"], ["#F1F1EF", "浅灰"]].map(([value, label]) => (
                <button key={value} type="button" className={(props.bgColor || "#FCFCFB").toUpperCase() === value ? "is-active" : ""} aria-pressed={(props.bgColor || "#FCFCFB").toUpperCase() === value} onClick={() => update({ bgColor: value })}>{label}</button>
              ))}
            </div>
          </div>
        </ProductRowFlatSection>
      </div>
      <InspectorDraftActions saving={saving} onSave={onSave} onCancel={onCancel} />
    </section>
  );
}

function FeaturedProductInspector({ saving, onSave, onCancel }: {
  saving: boolean;
  onSave: () => Promise<void>;
  onCancel: () => void;
}) {
  const { props, update, close, device } = useSelectedModuleEditor();
  const status = evaluateFeaturedProductContract(props);
  const productId = Number(props.productId) || 0;

  return (
    <section className="homepage-editor__inspector" data-active-device={device} aria-label="单品主推模块属性">
      <InspectorHeader title={getModuleDisplayName("单品焦点推荐", props)} device={device} onClose={close} />
      <div className="homepage-editor__inspector-scroll">
        <p className="homepage-editor__properties-helper">{FEATURED_PRODUCT_CONTRACT.purpose}</p>
        <ContractStatusBanner status={status} />

        <InspectorSection title="模块概况" resetKey={props.id}>
          <div className="homepage-editor__inspector-field">
            <label>图层名称<span className="homepage-editor__inspector-hint">仅用于页面结构识别</span></label>
            <Input value={props.moduleName || ""} onChange={(event) => update({ moduleName: event.target.value })} maxLength={24} placeholder="默认使用单品主推" />
          </div>
        </InspectorSection>

        <InspectorSection title="主推商品 · 1件" resetKey={props.id}>
          <ProductIdsField
            value={productId > 0 ? [productId] : []}
            onChange={(ids) => update({ productId: Number(ids[ids.length - 1]) || 0 })}
            maxProducts={1}
          />
          <p className="homepage-editor__section-note">商品主图、名称和价格读取真实商品数据；画布与发布页保持同步。</p>
        </InspectorSection>

        <InspectorSection title="内容表达" resetKey={props.id}>
          <div className="homepage-editor__inspector-field">
            <label>眉题<span className="homepage-editor__inspector-count">{(props.eyebrow || "").length}/{FEATURED_PRODUCT_CONTRACT.content.limits.eyebrow}</span></label>
            <Input value={props.eyebrow || ""} onChange={(event) => update({ eyebrow: event.target.value })} maxLength={FEATURED_PRODUCT_CONTRACT.content.limits.eyebrow} placeholder="FEATURED PIECE" />
          </div>
          <div className="homepage-editor__inspector-field">
            <label>标题 <em>必填</em><span className="homepage-editor__inspector-count">{(props.title || "").length}/{FEATURED_PRODUCT_CONTRACT.content.limits.title}</span></label>
            <Input value={props.title || ""} onChange={(event) => update({ title: event.target.value })} maxLength={FEATURED_PRODUCT_CONTRACT.content.limits.title} status={props.title?.trim() ? undefined : "error"} />
          </div>
          <div className="homepage-editor__inspector-field">
            <label>作品卖点<span className="homepage-editor__inspector-count">{(props.summary || "").length}/{FEATURED_PRODUCT_CONTRACT.content.limits.summary}</span></label>
            <Input.TextArea value={props.summary || ""} onChange={(event) => update({ summary: event.target.value })} maxLength={FEATURED_PRODUCT_CONTRACT.content.limits.summary} rows={4} placeholder="说明材质、工艺或设计价值" />
          </div>
          <div className="homepage-editor__inspector-field">
            <label>商品入口文字 <em>必填</em></label>
            <Input value={props.primaryText || ""} onChange={(event) => update({ primaryText: event.target.value })} maxLength={FEATURED_PRODUCT_CONTRACT.content.limits.actionText} placeholder="查看作品" />
          </div>
        </InspectorSection>

        <InspectorSection title="次要行动" defaultOpen={false} resetKey={props.id}>
          <div className="homepage-editor__inspector-field">
            <label>次要入口文字<span className="homepage-editor__inspector-hint">留空则只保留商品详情主入口</span></label>
            <Input value={props.secondaryText || ""} onChange={(event) => update({ secondaryText: event.target.value })} maxLength={FEATURED_PRODUCT_CONTRACT.content.limits.actionText} placeholder="预约鉴赏" />
          </div>
          {props.secondaryText ? (
            <div className="homepage-editor__inspector-field">
              <label htmlFor={`featured-secondary-${props.id}`}>站内页面 <em>必填</em></label>
              <select id={`featured-secondary-${props.id}`} value={props.secondaryLink || ""} onChange={(event) => update({ secondaryLink: event.target.value })}>
                <option value="" disabled>请选择页面</option>
                {editorPages.map((page) => <option key={page.key} value={page.publicPath}>{page.label}</option>)}
              </select>
            </div>
          ) : null}
        </InspectorSection>

        <InspectorSection title="版式设置" defaultOpen={false} resetKey={props.id}>
          <div className="homepage-editor__inspector-option-group">
            <div><strong>桌面端图文顺序</strong><span>移动端始终先展示商品图，再展示文字和行动入口。</span></div>
            <div className="homepage-editor__inspector-segmented" role="group" aria-label="单品主推桌面版式">
              {[["imageLeft", "商品图在左"], ["imageRight", "商品图在右"]].map(([value, label]) => (
                <button key={value} type="button" className={(props.layout || "imageLeft") === value ? "is-active" : ""} aria-pressed={(props.layout || "imageLeft") === value} onClick={() => update({ layout: value })}>{label}</button>
              ))}
            </div>
          </div>
          <div className="homepage-editor__layout-rule"><strong>画布标准</strong><span>商品主图固定3:4，桌面双栏，移动端上下排列</span><span>商品详情始终是主行动，预约只作为次要入口</span></div>
        </InspectorSection>
      </div>
      <InspectorDraftActions saving={saving} onSave={onSave} onCancel={onCancel} />
    </section>
  );
}

function CategoryCardsInspector({ saving, onSave, onCancel }: {
  saving: boolean;
  onSave: () => Promise<void>;
  onCancel: () => void;
}) {
  const { props, update, close, device } = useSelectedModuleEditor();
  const status = evaluateCategoryCardsContract(props);
  const cards = Array.isArray(props.categories) ? props.categories : [];
  const updateCards = (nextCards: Array<Record<string, any>>) => update({ categories: nextCards });
  const updateCard = (index: number, patch: Record<string, any>) => updateCards(cards.map((card: Record<string, any>, cardIndex: number) => cardIndex === index ? { ...card, ...patch } : card));
  const moveCard = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= cards.length) return;
    const next = [...cards];
    [next[index], next[target]] = [next[target], next[index]];
    updateCards(next);
  };

  return (
    <section className="homepage-editor__inspector" data-active-device={device} aria-label="分类导航模块属性">
      <InspectorHeader title={getModuleDisplayName("分类卡片", props)} device={device} onClose={close} />
      <div className="homepage-editor__inspector-scroll">
        <p className="homepage-editor__properties-helper">{CATEGORY_CARDS_CONTRACT.purpose}</p>
        <ContractStatusBanner status={status} />

        <InspectorSection title="模块概况" resetKey={props.id}>
          <div className="homepage-editor__inspector-field">
            <label>图层名称<span className="homepage-editor__inspector-hint">仅用于页面结构识别</span></label>
            <Input value={props.moduleName || ""} onChange={(event) => update({ moduleName: event.target.value })} maxLength={24} placeholder="默认使用分类导航" />
          </div>
          <div className="homepage-editor__inspector-field">
            <label>标题 <em>必填</em><span className="homepage-editor__inspector-count">{(props.title || "").length}/{CATEGORY_CARDS_CONTRACT.content.limits.title}</span></label>
            <Input value={props.title || ""} onChange={(event) => update({ title: event.target.value })} maxLength={CATEGORY_CARDS_CONTRACT.content.limits.title} status={props.title?.trim() ? undefined : "error"} />
          </div>
          <div className="homepage-editor__inspector-field">
            <label>副标题<span className="homepage-editor__inspector-count">{(props.subtitle || "").length}/{CATEGORY_CARDS_CONTRACT.content.limits.subtitle}</span></label>
            <Input.TextArea value={props.subtitle || ""} onChange={(event) => update({ subtitle: event.target.value })} maxLength={CATEGORY_CARDS_CONTRACT.content.limits.subtitle} rows={2} />
          </div>
        </InspectorSection>

        <InspectorSection title={`分类入口 · ${cards.length}/${CATEGORY_CARDS_CONTRACT.content.maxItems}`} resetKey={props.id}>
          {cards.map((card: Record<string, any>, index: number) => {
            const focusX = Math.min(100, Math.max(0, Number(card.focusX ?? 50)));
            const focusY = Math.min(100, Math.max(0, Number(card.focusY ?? 50)));
            return (
              <details key={card.id || index} className="homepage-editor__inspector-details" open={index === 0}>
                <summary>{card.name || `分类 ${index + 1}`}</summary>
                <div className="homepage-editor__inspector-field">
                  <label>分类名称 <em>必填</em></label>
                  <Input value={card.name || ""} onChange={(event) => updateCard(index, { name: event.target.value })} maxLength={CATEGORY_CARDS_CONTRACT.content.limits.name} />
                </div>
                <MediaPickerField
                  fieldKey={`categories.${index}.image`}
                  device="shared"
                  value={card.image || ""}
                  onChange={(image) => updateCard(index, { image })}
                  required
                  spec={IMAGE_SPECS.categoryCards.image}
                  placeholder="上传分类图片"
                  previewAspectRatio={CATEGORY_CARDS_CONTRACT.canvas.mediaAspectRatio}
                  previewFocus={{ x: focusX, y: focusY }}
                />
                {card.image ? <FocusPicker src={card.image} focusX={focusX} focusY={focusY} aspectRatio={CATEGORY_CARDS_CONTRACT.canvas.mediaAspectRatio} onChange={(x, y) => updateCard(index, { focusX: x, focusY: y })} /> : null}
                <div className="homepage-editor__inspector-field">
                  <label>站内路径 <em>必填</em><span className="homepage-editor__inspector-hint">例如 /products?categoryId=12</span></label>
                  <Input value={card.link || ""} onChange={(event) => updateCard(index, { link: event.target.value })} status={String(card.link || "").startsWith("/") && !String(card.link || "").startsWith("//") ? undefined : "error"} />
                </div>
                <div className="homepage-editor__inspector-field">
                  <label>选择提示</label>
                  <Input value={card.description || ""} onChange={(event) => updateCard(index, { description: event.target.value })} maxLength={CATEGORY_CARDS_CONTRACT.content.limits.description} placeholder="一句话说明该分类特点" />
                </div>
                <div className="homepage-editor__inspector-field">
                  <label>图片替代文字</label>
                  <Input value={card.altText || ""} onChange={(event) => updateCard(index, { altText: event.target.value })} maxLength={CATEGORY_CARDS_CONTRACT.content.limits.altText} />
                </div>
                <div className="homepage-editor__inspector-inline-actions">
                  <Button size="small" onClick={() => moveCard(index, -1)} disabled={index === 0}>上移</Button>
                  <Button size="small" onClick={() => moveCard(index, 1)} disabled={index === cards.length - 1}>下移</Button>
                  <Button size="small" danger onClick={() => updateCards(cards.filter((_: unknown, cardIndex: number) => cardIndex !== index))}>移除</Button>
                </div>
              </details>
            );
          })}
          <Button
            type="dashed"
            block
            disabled={cards.length >= CATEGORY_CARDS_CONTRACT.content.maxItems}
            onClick={() => updateCards([...cards, { name: "新分类", image: "", link: "/products", description: "", altText: "", focusX: 50, focusY: 50 }])}
          >添加分类入口</Button>
        </InspectorSection>

        <InspectorSection title="版式设置" defaultOpen={false} resetKey={props.id}>
          <div className="homepage-editor__inspector-option-group">
            <div><strong>桌面端列数</strong><span>移动端固定单列，保持图片和文字可读。</span></div>
            <div className="homepage-editor__inspector-segmented is-three" role="group" aria-label="分类导航列数">
              {[["grid-2", "2列"], ["grid-3", "3列"], ["grid-4", "4列"]].map(([value, label]) => (
                <button key={value} type="button" className={(props.layout || "grid-3") === value ? "is-active" : ""} aria-pressed={(props.layout || "grid-3") === value} onClick={() => update({ layout: value })}>{label}</button>
              ))}
            </div>
          </div>
          <div className="homepage-editor__layout-rule"><strong>画布标准</strong><span>全部卡片固定3:4，桌面2/3/4列，移动端单列</span><span>每张卡片只承担一次分类导航</span></div>
        </InspectorSection>
      </div>
      <InspectorDraftActions saving={saving} onSave={onSave} onCancel={onCancel} />
    </section>
  );
}

function AppointmentInspector({ saving, onSave, onCancel }: {
  saving: boolean;
  onSave: () => Promise<void>;
  onCancel: () => void;
}) {
  const { props, update, close, device } = useSelectedModuleEditor();
  const status = evaluateAppointmentContract(props);
  const focusX = Math.min(100, Math.max(0, Number(props.focusX ?? 50)));
  const focusY = Math.min(100, Math.max(0, Number(props.focusY ?? 50)));

  return (
    <section className="homepage-editor__inspector" data-active-device={device} aria-label="预约引导模块属性">
      <InspectorHeader title={getModuleDisplayName("预约入口", props)} device={device} onClose={close} />
      <div className="homepage-editor__inspector-scroll">
        <p className="homepage-editor__properties-helper">{APPOINTMENT_CONTRACT.purpose}</p>
        <ContractStatusBanner status={status} />

        <InspectorSection title="模块概况" resetKey={props.id}>
          <div className="homepage-editor__inspector-field">
            <label>图层名称<span className="homepage-editor__inspector-hint">仅用于页面结构识别</span></label>
            <Input value={props.moduleName || ""} onChange={(event) => update({ moduleName: event.target.value })} maxLength={24} placeholder="默认使用预约引导" />
          </div>
        </InspectorSection>

        <InspectorSection title="行动内容" resetKey={props.id}>
          <div className="homepage-editor__inspector-field">
            <label>标题 <em>必填</em><span className="homepage-editor__inspector-count">{(props.title || "").length}/{APPOINTMENT_CONTRACT.content.limits.title}</span></label>
            <Input value={props.title || ""} onChange={(event) => update({ title: event.target.value })} maxLength={APPOINTMENT_CONTRACT.content.limits.title} status={props.title?.trim() ? undefined : "error"} />
          </div>
          <div className="homepage-editor__inspector-field">
            <label>服务说明<span className="homepage-editor__inspector-count">{(props.subtitle || "").length}/{APPOINTMENT_CONTRACT.content.limits.subtitle}</span></label>
            <Input.TextArea value={props.subtitle || ""} onChange={(event) => update({ subtitle: event.target.value })} maxLength={APPOINTMENT_CONTRACT.content.limits.subtitle} rows={3} />
          </div>
          <div className="homepage-editor__inspector-field">
            <label>主按钮文字 <em>必填</em></label>
            <Input value={props.buttonText || ""} onChange={(event) => update({ buttonText: event.target.value })} maxLength={APPOINTMENT_CONTRACT.content.limits.buttonText} placeholder="立即预约" />
          </div>
          <div className="homepage-editor__inspector-field">
            <label htmlFor={`appointment-page-${props.id}`}>预约页面 <em>必填</em></label>
            <select id={`appointment-page-${props.id}`} value={props.linkUrl || ""} onChange={(event) => update({ linkUrl: event.target.value })}>
              <option value="" disabled>请选择页面</option>
              {editorPages.map((page) => <option key={page.key} value={page.publicPath}>{page.label}</option>)}
            </select>
          </div>
          <div className="homepage-editor__inspector-field">
            <label>咨询电话<span className="homepage-editor__inspector-hint">可选，只作为次要入口</span></label>
            <Input value={props.phone || ""} onChange={(event) => update({ phone: event.target.value })} placeholder="例如 400-000-0000" />
          </div>
        </InspectorSection>

        <InspectorSection title="背景视觉" resetKey={props.id}>
          <MediaPickerField fieldKey="backgroundImage" device="shared" value={props.backgroundImage || ""} onChange={(backgroundImage) => update({ backgroundImage })} spec={IMAGE_SPECS.fullBleed.desktop} placeholder="可选；留空使用纯色背景" previewAspectRatio={APPOINTMENT_CONTRACT.canvas.backgroundAspectRatio} previewFocus={{ x: focusX, y: focusY }} />
          {props.backgroundImage ? <FocusPicker src={props.backgroundImage} focusX={focusX} focusY={focusY} aspectRatio={APPOINTMENT_CONTRACT.canvas.backgroundAspectRatio} safeArea onChange={(x, y) => update({ focusX: x, focusY: y })} /> : null}
        </InspectorSection>

        <InspectorSection title="视觉预设" defaultOpen={false} resetKey={props.id}>
          <div className="homepage-editor__inspector-segmented" role="group" aria-label="预约引导视觉预设">
            {[["dark", "深色典藏"], ["ivory", "象牙留白"]].map(([value, label]) => (
              <button key={value} type="button" className={(props.tone || "dark") === value ? "is-active" : ""} aria-pressed={(props.tone || "dark") === value} onClick={() => update({ tone: value })}>{label}</button>
            ))}
          </div>
          <div className="homepage-editor__layout-rule"><strong>行动规则</strong><span>预约按钮始终是唯一主行动</span><span>电话为可选次要入口，不增加第三个按钮</span></div>
        </InspectorSection>

        {props.backgroundImage ? (
          <InspectorSection title="高级设置" defaultOpen={false} resetKey={props.id}>
            <div className="homepage-editor__inspector-field">
              <label>背景图片替代文字</label>
              <Input value={props.altText || ""} onChange={(event) => update({ altText: event.target.value })} maxLength={APPOINTMENT_CONTRACT.content.limits.altText} />
            </div>
          </InspectorSection>
        ) : null}
      </div>
      <InspectorDraftActions saving={saving} onSave={onSave} onCancel={onCancel} />
    </section>
  );
}

function HotspotInspector({ saving, onSave, onCancel }: {
  saving: boolean;
  onSave: () => Promise<void>;
  onCancel: () => void;
}) {
  const { props, update, close, device } = useSelectedModuleEditor();
  const status = evaluateHotspotContract(props);
  const imageField = device === "mobile" ? "mobileImage" : "image";
  const hotspotField = device === "mobile" ? "mobileHotspots" : "hotspots";
  const imageSpec = device === "mobile" ? IMAGE_SPECS.hotspot.mobile : IMAGE_SPECS.hotspot.desktop;
  const aspectRatio = device === "mobile" ? HOTSPOT_CONTRACT.canvas.mobileMediaAspectRatio : HOTSPOT_CONTRACT.canvas.desktopMediaAspectRatio;
  const currentHotspots = Array.isArray(props[hotspotField]) ? props[hotspotField] : [];
  const desktopHotspots = Array.isArray(props.hotspots) ? props.hotspots : [];

  const updateHotspots = (next: Array<Record<string, any>>) => update({ [hotspotField]: next });
  const updateHotspot = (itemIndex: number, patch: Record<string, any>) => {
    updateHotspots(currentHotspots.map((item: Record<string, any>, index: number) => index === itemIndex ? { ...item, ...patch } : item));
  };
  const addHotspot = () => {
    if (currentHotspots.length >= HOTSPOT_CONTRACT.content.maxHotspots) {
      message.warning(`每个设备最多配置 ${HOTSPOT_CONTRACT.content.maxHotspots} 个热区`);
      return;
    }
    const offset = Math.min(60, 8 + currentHotspots.length * 6);
    updateHotspots([...currentHotspots, { label: "", x: offset, y: offset, width: 24, height: 18, link: "" }]);
  };
  const moveHotspot = (itemIndex: number, direction: -1 | 1) => {
    const target = itemIndex + direction;
    if (target < 0 || target >= currentHotspots.length) return;
    const next = [...currentHotspots];
    [next[itemIndex], next[target]] = [next[target], next[itemIndex]];
    updateHotspots(next);
  };

  return (
    <section className="homepage-editor__inspector" data-active-device={device} aria-label="热区图模块属性">
      <InspectorHeader title={getModuleDisplayName("热区图", props)} device={device} onClose={close} />
      <div className="homepage-editor__inspector-scroll">
        <p className="homepage-editor__properties-helper">{HOTSPOT_CONTRACT.purpose}</p>
        <ContractStatusBanner status={status} />
        <InspectorSection title="模块概况" resetKey={props.id}>
          <div className="homepage-editor__inspector-field">
            <label>图层名称<span className="homepage-editor__inspector-hint">仅用于页面结构识别</span></label>
            <Input value={props.moduleName || ""} onChange={(event) => update({ moduleName: event.target.value })} maxLength={24} placeholder="默认使用可点击图片" />
          </div>
        </InspectorSection>

        <InspectorSection title={device === "mobile" ? "移动端底图" : "桌面端底图"} resetKey={props.id}>
          {device === "mobile" && !props.mobileImage ? <div className="homepage-editor__media-status is-fallback"><ExclamationCircleOutlined /><div><strong>当前复用桌面端底图</strong><span>上传3:4移动图后，请重新校准移动端热区。</span></div></div> : null}
          <MediaPickerField fieldKey={imageField} device={device} value={props[imageField] || ""} onChange={(value) => update({ [imageField]: value })} required={device === "desktop"} spec={imageSpec} placeholder={device === "mobile" ? "上传移动端热区底图" : "上传桌面端热区底图"} previewAspectRatio={aspectRatio} />
        </InspectorSection>

        <InspectorSection title={`${device === "mobile" ? "移动端" : "桌面端"}热区 · ${currentHotspots.length}/${HOTSPOT_CONTRACT.content.maxHotspots}`} resetKey={props.id}>
          {device === "mobile" && currentHotspots.length === 0 && desktopHotspots.length > 0 ? (
            <button type="button" className="homepage-editor__copy-device-config" onClick={() => update({ mobileHotspots: cloneModuleProps(desktopHotspots) })}>复制桌面端热区后校准</button>
          ) : null}
          <p className="homepage-editor__section-note">先在画布确认区域，再为每个热区设置明确的跳转链接。</p>
          <div className="homepage-editor__hotspot-list">
            {currentHotspots.map((item: Record<string, any>, itemIndex: number) => (
              <article key={itemIndex} className="homepage-editor__hotspot-card">
                <header><strong>热区 {itemIndex + 1}</strong><div><button type="button" disabled={itemIndex === 0} onClick={() => moveHotspot(itemIndex, -1)}>上移</button><button type="button" disabled={itemIndex === currentHotspots.length - 1} onClick={() => moveHotspot(itemIndex, 1)}>下移</button><button type="button" onClick={() => updateHotspots(currentHotspots.filter((_: unknown, index: number) => index !== itemIndex))}>删除</button></div></header>
                <div className="homepage-editor__inspector-field"><label>标签<span className="homepage-editor__inspector-count">{(item.label || "").length}/{HOTSPOT_CONTRACT.content.limits.label}</span></label><Input size="small" value={item.label || ""} onChange={(event) => updateHotspot(itemIndex, { label: event.target.value })} maxLength={HOTSPOT_CONTRACT.content.limits.label} placeholder="例如 查看系列" /></div>
                <div className="homepage-editor__inspector-field"><label>跳转链接 <em>必填</em></label><Input size="small" value={item.link || ""} onChange={(event) => updateHotspot(itemIndex, { link: event.target.value })} placeholder="例如 /products/123" status={item.link?.trim() ? undefined : "error"} /></div>
                <div className="homepage-editor__hotspot-geometry">
                  {[["x", "左"], ["y", "上"], ["width", "宽"], ["height", "高"]].map(([field, label]) => (
                    <label key={field}><span>{label}%</span><Input size="small" type="number" min={field === "width" || field === "height" ? 1 : 0} max={100} value={item[field]} onChange={(event) => updateHotspot(itemIndex, { [field]: Number(event.target.value) })} /></label>
                  ))}
                </div>
              </article>
            ))}
          </div>
          <button type="button" className="homepage-editor__add-hotspot" disabled={currentHotspots.length >= HOTSPOT_CONTRACT.content.maxHotspots} onClick={addHotspot}>＋ 添加热区</button>
        </InspectorSection>

        <InspectorSection title="适配规则" defaultOpen={false} resetKey={props.id}>
          <div className="homepage-editor__layout-rule"><strong>画布标准</strong><span>桌面：底图16:9，独立桌面热区坐标</span><span>移动：底图3:4，独立移动热区坐标</span><span>未配置移动热区时暂时复用桌面坐标，并给出发布提醒</span></div>
        </InspectorSection>
      </div>
      <InspectorDraftActions saving={saving} onSave={onSave} onCancel={onCancel} />
    </section>
  );
}

function InspectorPanel({
  saving,
  onSaveDraft,
}: {
  saving: boolean;
  onSaveDraft: (data: unknown) => Promise<boolean>;
}) {
  const dispatch = useHomepagePuck((state) => state.dispatch);
  const appData = useHomepagePuck((state) => state.appState.data);
  const selectedItem = useHomepagePuck((state) => state.selectedItem);
  const currentViewport = useHomepagePuck((state) => state.appState.ui.viewports.current);
  const selectedKey = selectedItem?.props?.id || selectedItem?.type || "";
  const baselinePropsRef = useRef(new Map<string, Record<string, any>>());

  useEffect(() => {
    if (!selectedItem || !selectedKey || baselinePropsRef.current.has(selectedKey)) return;
    baselinePropsRef.current.set(selectedKey, cloneModuleProps(selectedItem.props || {}));
  }, [selectedItem, selectedKey]);

  if (!selectedItem) {
    return (
      <section className="homepage-editor__properties homepage-editor__properties--empty" aria-label="模块属性">
        <div className="homepage-editor__properties-heading">
          <div>
            <span>模块设置</span>
            <strong>选择一个模块开始编辑</strong>
          </div>
        </div>
        <div className="homepage-editor__properties-scroll">
          <div className="homepage-editor__properties-empty-state">
            <AppstoreOutlined />
            <strong>从画布或页面图层选择模块</strong>
            <span>当前页面中的图片、文案和排序都会被保留；选择模块后可在这里编辑。</span>
          </div>
        </div>
      </section>
    );
  }

  const selectedId = selectedItem.props?.id;
  const restoreSelectedModule = () => {
    const baseline = baselinePropsRef.current.get(selectedKey);
    const content = appData.content as Array<{ type: string; props: Record<string, any> }>;
    const index = content.findIndex((item) => item.props?.id === selectedId);
    if (!baseline || index < 0) return;
    const nextContent = [...content];
    nextContent[index] = { ...nextContent[index], props: cloneModuleProps(baseline) };
    dispatch({ type: "setData", data: { ...appData, content: nextContent } });
    message.info("已恢复该模块上次保存的内容");
  };

  const saveCurrentDraft = async () => {
    const saved = await onSaveDraft(appData);
    if (!saved) return;
    const content = appData.content as Array<{ type: string; props: Record<string, any> }>;
    content.forEach((item) => {
      const key = item.props?.id || item.type;
      baselinePropsRef.current.set(key, cloneModuleProps(item.props || {}));
    });
  };

  if (selectedItem.type === "首屏主视觉") {
    return <HeroInspector saving={saving} onSave={saveCurrentDraft} onCancel={restoreSelectedModule} />;
  }

  if (selectedItem.type === "图文混排") {
    return <ImageTextInspector saving={saving} onSave={saveCurrentDraft} onCancel={restoreSelectedModule} />;
  }

  if (selectedItem.type === "单图海报") {
    return <SinglePosterInspector saving={saving} onSave={saveCurrentDraft} onCancel={restoreSelectedModule} />;
  }

  if (selectedItem.type === "全屏出血图") {
    return <FullBleedInspector saving={saving} onSave={saveCurrentDraft} onCancel={restoreSelectedModule} />;
  }

  if (selectedItem.type === "双图海报") {
    return <DoublePosterInspector saving={saving} onSave={saveCurrentDraft} onCancel={restoreSelectedModule} />;
  }

  if (selectedItem.type === "产品展示行") {
    return <ProductRowInspector saving={saving} onSave={saveCurrentDraft} onCancel={restoreSelectedModule} />;
  }

  if (selectedItem.type === "单品焦点推荐") {
    return <FeaturedProductInspector saving={saving} onSave={saveCurrentDraft} onCancel={restoreSelectedModule} />;
  }

  if (selectedItem.type === "分类卡片") {
    return <CategoryCardsInspector saving={saving} onSave={saveCurrentDraft} onCancel={restoreSelectedModule} />;
  }

  if (selectedItem.type === "预约入口") {
    return <AppointmentInspector saving={saving} onSave={saveCurrentDraft} onCancel={restoreSelectedModule} />;
  }

  if (selectedItem.type === "热区图") {
    return <HotspotInspector saving={saving} onSave={saveCurrentDraft} onCancel={restoreSelectedModule} />;
  }

  const closePanel = () =>
    dispatch({ type: "setUi", ui: { itemSelector: null } });

  const device = getInspectorDevice(currentViewport);
  const isCarousel = selectedItem.type === "轮播图";
  const hasCardContent = ["分类卡片", "卡片网格", "资质证书", "定制流程", "真实评价与实拍"].includes(selectedItem.type);
  const currentMediaItems = getInspectorMediaItems(selectedItem.type, selectedItem.props || {});
  const hasMediaEditor = currentMediaItems.some(
    (item) => item.device === "shared" || item.device === device,
  ) || selectedItem.type === "轮播图";
  const hasMissingRequiredMedia = currentMediaItems.some(
    (item) => item.required && !getInspectorMediaValue(selectedItem.props || {}, item.field),
  );
  const updateMedia = (field: string, value: string) => {
    const content = appData.content as Array<{ type: string; props: Record<string, any> }>;
    const index = content.findIndex((item) => item.props?.id === selectedId);
    if (index < 0) return;

    const nextContent = [...content];
    const carouselField = field.match(/^images\.(\d+)\.(url|mobileUrl)$/);
    const nextProps = { ...nextContent[index].props };
    if (carouselField) {
      const imageIndex = Number(carouselField[1]);
      const imageField = carouselField[2] as "url" | "mobileUrl";
      const images = Array.isArray(nextProps.images) ? [...nextProps.images] : [];
      if (!images[imageIndex]) return;
      images[imageIndex] = { ...images[imageIndex], [imageField]: value };
      nextProps.images = images;
    } else {
      nextProps[field] = value;
    }
    nextContent[index] = {
      ...nextContent[index],
      props: nextProps,
    };
    dispatch({ type: "setData", data: { ...appData, content: nextContent } });
  };

  const updateCarouselImages = (updater: (images: Array<Record<string, any>>) => Array<Record<string, any>>) => {
    const content = appData.content as Array<{ type: string; props: Record<string, any> }>;
    const index = content.findIndex((item) => item.props?.id === selectedId);
    if (index < 0) return;
    const nextContent = [...content];
    const currentProps = nextContent[index].props as Record<string, any>;
    const images = Array.isArray(currentProps.images) ? currentProps.images : [];
    nextContent[index] = {
      ...nextContent[index],
      props: { ...currentProps, images: updater(images) },
    };
    dispatch({ type: "setData", data: { ...appData, content: nextContent } });
  };

  const updateCarouselItem = (itemIndex: number, field: "link" | "alt", value: string) => {
    updateCarouselImages((images) => images.map((item, index) => (
      index === itemIndex ? { ...item, [field]: value } : item
    )));
  };

  const addCarouselItem = () => {
    updateCarouselImages((images) => [
      ...images,
      { url: "", mobileUrl: "", link: "", alt: `轮播图 ${images.length + 1}` },
    ]);
  };

  const moveCarouselItem = (itemIndex: number, direction: -1 | 1) => {
    updateCarouselImages((images) => {
      const targetIndex = itemIndex + direction;
      if (targetIndex < 0 || targetIndex >= images.length) return images;
      const next = [...images];
      [next[itemIndex], next[targetIndex]] = [next[targetIndex], next[itemIndex]];
      return next;
    });
  };

  const removeCarouselItem = (itemIndex: number) => {
    const selectedProps = selectedItem.props as Record<string, any>;
    const images = Array.isArray(selectedProps.images) ? selectedProps.images : [];
    if (images.length <= 1) return;
    Modal.confirm({
      title: "删除此轮播项？",
      content: "删除后该轮播图及其桌面/移动素材都会从当前草稿移除。",
      okText: "删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: () => updateCarouselImages((current) => current.filter((_, index) => index !== itemIndex)),
    });
  };

  const updateModuleName = (moduleName: string) => {
    const content = appData.content as Array<{ type: string; props: Record<string, any> }>;
    const index = content.findIndex((item) => item.props?.id === selectedId);
    if (index < 0) return;
    const nextContent = [...content];
    nextContent[index] = {
      ...nextContent[index],
      props: { ...nextContent[index].props, moduleName },
    };
    dispatch({ type: "setData", data: { ...appData, content: nextContent } });
  };

  return (
    <section
      className="homepage-editor__properties"
      data-active-device={device}
      data-module-type={selectedItem.type}
      aria-label="模块属性"
    >
      <div className="homepage-editor__properties-heading">
        <div>
          <strong>{getModuleDisplayName(selectedItem.type, selectedItem.props)}</strong>
        </div>
        <span className="homepage-editor__properties-device">
          {device === "mobile" ? "移动端" : "桌面端"}
        </span>
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
        <p className="homepage-editor__properties-helper">按当前模块的内容顺序填写；画布会即时预览，点击保存后写入草稿。</p>
        <InspectorSection title="图层名称" defaultOpen resetKey={selectedKey}>
          <div className="homepage-editor__inspector-field">
            <label>图层名称<span className="homepage-editor__inspector-hint">仅用于页面结构识别</span></label>
            <Input
              value={(selectedItem.props as Record<string, any>)?.moduleName || ""}
              onChange={(event) => updateModuleName(event.target.value)}
              maxLength={24}
              placeholder={`默认使用${getModuleDisplayName(selectedItem.type)}`}
            />
          </div>
        </InspectorSection>
        {!isCarousel && (
          <InspectorSection title={hasCardContent ? "卡盘内容配置" : "内容配置、导航文字与商品列表"} defaultOpen resetKey={selectedKey}>
            <Puck.Fields />
          </InspectorSection>
        )}
        {hasMediaEditor && (
          <InspectorSection title={isCarousel ? "卡盘内容配置" : "背景海报及推荐比例"} defaultOpen resetKey={selectedKey}>
            <MediaSourceStatus type={selectedItem.type} props={selectedItem.props || {}} device={device} blockId={selectedItem.props?.id} />
            <TemplateStructureGuide
              type={selectedItem.type}
              props={selectedItem.props || {}}
              blockId={selectedItem.props?.id}
              device={device}
              onMediaChange={updateMedia}
              onCarouselItemChange={updateCarouselItem}
              onAddCarouselItem={addCarouselItem}
              onMoveCarouselItem={moveCarouselItem}
              onRemoveCarouselItem={removeCarouselItem}
            />
          </InspectorSection>
        )}
        {isCarousel && (
          <InspectorSection title="播放与显示" defaultOpen={false} resetKey={selectedKey}>
            <Puck.Fields />
          </InspectorSection>
        )}
        {hasMediaEditor && (
          <InspectorSection title="图片检查" defaultOpen={false} resetKey={selectedKey}>
          <MediaRequirementPanel type={selectedItem.type} props={selectedItem.props || {}} />
          </InspectorSection>
        )}
      </div>
      <InspectorDraftActions saving={saving} onSave={saveCurrentDraft} onCancel={restoreSelectedModule} />
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
        event.origin !== window.location.origin
        || detail?.type !== CANVAS_HEIGHT_MESSAGE
      ) return;
      if (!Number.isFinite(detail.height) || detail.height < viewportHeight || detail.height > 50000) return;
      setContentHeight((current) => Math.abs(current - detail.height) < 2 ? current : detail.height);
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

/** 画布侧边的当前模块快捷操作，与页面结构栏保持互补。 */
function CanvasBlockActionDock({
  frameRef,
  canvasRef,
}: {
  frameRef: RefObject<HTMLDivElement>;
  canvasRef: RefObject<HTMLDivElement>;
}) {
  const appData = useHomepagePuck((state) => state.appState.data);
  const dispatch = useHomepagePuck((state) => state.dispatch);
  const selectedItem = useHomepagePuck((state) => state.selectedItem);
  const selectedId = selectedItem?.props?.id;
  const content = appData.content as Array<{ type: string; props: Record<string, any> }>;
  const selectedIndex = content.findIndex((item) => item.props?.id === selectedId);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const updatePosition = useCallback(() => {
    if (selectedIndex < 0) {
      setPosition(null);
      return;
    }
    const canvas = canvasRef.current;
    const iframe = frameRef.current?.querySelector("iframe");
    const block = iframe?.contentDocument?.querySelectorAll<HTMLElement>("[data-puck-component]")[selectedIndex];
    if (!canvas || !iframe || !block || iframe.clientWidth <= 0) {
      setPosition(null);
      return;
    }
    const canvasRect = canvas.getBoundingClientRect();
    const iframeRect = iframe.getBoundingClientRect();
    const stageRect = canvas.closest(".homepage-editor__stage")?.getBoundingClientRect();
    const scale = iframeRect.width / iframe.clientWidth;
    const nextPosition = {
      top: iframeRect.top - canvasRect.top + block.offsetTop * scale,
      left: Math.min(
        iframeRect.right - canvasRect.left + 12,
        (stageRect?.right ?? iframeRect.right) - canvasRect.left - 42,
      ),
    };
    setPosition((current) => (
      current
      && Math.abs(current.top - nextPosition.top) < 1
      && Math.abs(current.left - nextPosition.left) < 1
    ) ? current : nextPosition);
  }, [canvasRef, frameRef, selectedIndex]);

  useLayoutEffect(() => {
    updatePosition();
    const initialFrame = requestAnimationFrame(updatePosition);
    const settledFrame = requestAnimationFrame(() => requestAnimationFrame(updatePosition));
    const observer = new ResizeObserver(updatePosition);
    if (frameRef.current) observer.observe(frameRef.current);
    window.addEventListener("resize", updatePosition);
    return () => {
      cancelAnimationFrame(initialFrame);
      cancelAnimationFrame(settledFrame);
      observer.disconnect();
      window.removeEventListener("resize", updatePosition);
    };
  }, [frameRef, updatePosition]);

  if (selectedIndex < 0 || !position) return null;

  const selectedModule = content[selectedIndex];
  const isLocked = Boolean(selectedModule.props?.locked);
  const move = (direction: -1 | 1) => {
    const targetIndex = selectedIndex + direction;
    if (
      isLocked
      || targetIndex < 0
      || targetIndex >= content.length
      || content[targetIndex]?.props?.locked
    ) return;
    const nextContent = [...content];
    [nextContent[selectedIndex], nextContent[targetIndex]] = [nextContent[targetIndex], nextContent[selectedIndex]];
    dispatch({ type: "setData", data: { ...appData, content: nextContent } });
    dispatch({ type: "setUi", ui: { itemSelector: { index: targetIndex, zone: ROOT_ZONE } } });
    focusCanvasBlock(selectedId);
  };
  const remove = () => {
    if (isLocked) {
      message.info("此模块已锁定，不能删除");
      return;
    }
    Modal.confirm({
      title: `删除“${getModuleDisplayName(selectedModule.type, selectedModule.props)}”？`,
      content: "删除后可从模块库重新添加；尚未发布的修改可通过版本记录恢复。",
      okText: "删除模块",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: () => {
        dispatch({ type: "setData", data: { ...appData, content: content.filter((_, index) => index !== selectedIndex) } });
        dispatch({ type: "setUi", ui: { itemSelector: null } });
      },
    });
  };

  return (
    <div
      className="homepage-editor__canvas-action-dock"
      style={{ top: `${position.top}px`, left: `${position.left}px` }}
      role="group"
      aria-label={`“${getModuleDisplayName(selectedModule.type, selectedModule.props)}”快捷操作`}
    >
      <button
        type="button"
        onClick={() => move(-1)}
        disabled={isLocked || selectedIndex === 0 || content[selectedIndex - 1]?.props?.locked}
        aria-label="上移模块"
        title="上移"
      >
        <UpOutlined />
      </button>
      <button
        type="button"
        onClick={() => move(1)}
        disabled={isLocked || selectedIndex === content.length - 1 || content[selectedIndex + 1]?.props?.locked}
        aria-label="下移模块"
        title="下移"
      >
        <DownOutlined />
      </button>
      <button
        type="button"
        className="is-danger"
        onClick={remove}
        disabled={isLocked}
        aria-label="删除模块"
        title="删除模块"
      >
        <DeleteOutlined />
      </button>
    </div>
  );
}

function EditorBody({
  onSaveAsTemplate,
  pageLabel,
  saving,
  onSaveDraft,
}: {
  onSaveAsTemplate: (type: string, props: Record<string, any>) => void;
  pageLabel: string;
  saving: boolean;
  onSaveDraft: (data: unknown) => Promise<boolean>;
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
  const [navigationPreviewOpen, setNavigationPreviewOpen] = useState(false);
  // 默认完整展示画布；仅在用户主动缩放时退出自适应模式。
  const [isFitView, setIsFitView] = useState(true);
  const stageRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const previewFrameRef = useRef<HTMLDivElement>(null);
  const viewportWidth = currentViewport.width === "100%" ? 1440 : currentViewport.width;
  const canvasBaseWidth = viewportWidth;

  useEffect(() => {
    const handleNavigationState = (event: MessageEvent<CanvasNavigationStateMessage>) => {
      if (
        event.origin !== window.location.origin
        || event.data?.type !== CANVAS_NAVIGATION_STATE_MESSAGE
      ) return;
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

    // 装修页画布按宽度适配，长页面在工作区内纵向滚动。
    // 若同时按高度适配，多区块页面会被压成缩略图，且容易制造“画布缺失”的错觉。
    const nextZoom = isFitView
      ? Math.min(
        1,
        // 工作区左右各 42px 内边距，按完整 84px 预留避免纵向滚动条出现时产生横向溢出。
        Math.max(0.1, (stage.clientWidth - 84) / canvasBaseWidth),
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
    message.success(`已插入“${displayName}”，可在右侧继续编辑`);
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

      <section ref={stageRef} className="homepage-editor__stage" aria-label={`${pageLabel}画布`}>
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
          <CanvasBlockActionDock frameRef={previewFrameRef} canvasRef={canvasRef} />
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

      <div className="homepage-editor__right-workspace">
        <LayerRail
          onSaveAsTemplate={onSaveAsTemplate}
          navigationPreviewOpen={navigationPreviewOpen}
          onToggleNavigationPreview={toggleNavigationPreview}
        />
        <InspectorPanel saving={saving} onSaveDraft={onSaveDraft} />
      </div>
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

function PageSettingsDrawer({
  open,
  metadata,
  onClose,
  onSave,
}: {
  open: boolean;
  metadata: Record<string, any>;
  onClose: () => void;
  onSave: (next: { seoTitle?: string; seoDescription?: string; ogImage?: string }) => void;
}) {
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [ogImage, setOgImage] = useState("");

  useEffect(() => {
    if (open) {
      setSeoTitle(metadata?.seoTitle || "");
      setSeoDescription(metadata?.seoDescription || "");
      setOgImage(metadata?.ogImage || "");
    }
  }, [open, metadata]);

  return (
    <Drawer
      title="页面 SEO 设置"
      placement="right"
      width={420}
      open={open}
      onClose={onClose}
      extra={
        <Button
          type="primary"
          size="small"
          onClick={() => onSave({
            seoTitle: seoTitle.trim(),
            seoDescription: seoDescription.trim(),
            ogImage: ogImage.trim(),
          })}
        >
          保存
        </Button>
      }
    >
      <div className="homepage-editor__page-settings">
        <p className="homepage-editor__page-settings-hint">
          设置首页的搜索标题与描述，影响搜索引擎收录与微信 / 微博等社交分享卡片。留空则沿用「店铺资料」里的站点级默认值。
        </p>
        <label className="homepage-editor__page-settings-label">页面标题（建议 ≤ 30 字）</label>
        <Input
          value={seoTitle}
          onChange={(e) => setSeoTitle(e.target.value)}
          placeholder="例：海川珠宝 · 足金匠心系列官方旗舰店"
          maxLength={60}
          showCount
        />
        <label className="homepage-editor__page-settings-label">页面描述（建议 ≤ 80 字）</label>
        <Input.TextArea
          value={seoDescription}
          onChange={(e) => setSeoDescription(e.target.value)}
          placeholder="例：海川珠宝精选足金、K金、钻石作品，提供在线选款与一对一顾问定制服务。"
          maxLength={160}
          showCount
          autoSize={{ minRows: 3, maxRows: 6 }}
        />
        <label className="homepage-editor__page-settings-label">社交分享图（og:image）</label>
        <MediaPickerField
          value={ogImage}
          onChange={setOgImage}
          spec={{ width: 1200, height: 630, ratio: "1.91:1", label: "社交分享图（推荐 1200×630，1.91:1）" }}
          placeholder="上传分享卡片封面"
        />
        <p className="homepage-editor__page-settings-hint" style={{ marginTop: 6 }}>
          分享到微信 / 微博 / Twitter 等平台时显示的封面图，建议 1200×630。留空则使用页面中的第一张图片。
        </p>
      </div>
    </Drawer>
  );
}

export default function HomepageConfig({ pageKey = "home" }: { pageKey?: EditorPageKey }) {
  const navigate = useNavigate();
  const [data, setData] = useState<any>(() => createEditorPageDefault(pageKey));
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [autoSaveState, setAutoSaveState] = useState<AutoSaveState>("idle");
  const [revisionsOpen, setRevisionsOpen] = useState(false);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [revisions, setRevisions] = useState<PageDocumentRevision[]>([]);
  const [restoringVersion, setRestoringVersion] = useState<number | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const hasInitializedEditorRef = useRef(false);
  const activePageKeyRef = useRef(pageKey);
  const latestData = useRef<any>(data);
  const pageSessionCacheRef = useRef<Record<string, PageSessionCache>>({});
  const autoSaveRetryRef = useRef(0);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const dataSignatureRef = useRef("");
  const [metadata, setMetadata] = useState<Record<string, any>>({});
  const latestMetadata = useRef<Record<string, any>>({});
  const [pageSettingsOpen, setPageSettingsOpen] = useState(false);

  useEffect(() => {
    activePageKeyRef.current = pageKey;
  }, [pageKey]);

  const [myTemplates, setMyTemplates] = useState<BlockTemplate[]>(() =>
    blockTemplateStore.getAll(),
  );

  const refreshMyTemplates = useCallback(() => {
    setMyTemplates(blockTemplateStore.getAll());
  }, []);

  const saveBlockAsTemplate = useCallback((blockType: string, blockProps: Record<string, any>) => {
    const moduleDisplayName = getModuleDisplayName(blockType);
    Modal.confirm({
      title: "保存为常用方案",
      content: (
        <div style={{ marginTop: 8 }}>
          <p style={{ margin: "0 0 8px", color: "#6B6259", fontSize: 12 }}>
            将当前模块的内容与版式保存为可复用的常用方案。
          </p>
          <label style={{ fontSize: 12, color: "#4A4239" }}>
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
                border: "1px solid #DED8CE",
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
        const input = document.getElementById("block-template-name-input") as HTMLInputElement | null;
        const name = input?.value?.trim() || `我的${moduleDisplayName}`;
        blockTemplateStore.save(name, blockType, blockProps);
        refreshMyTemplates();
        message.success(`「${name}」已保存为常用方案`);
      },
    });
  }, [refreshMyTemplates]);
  const editorConfig = useMemo(() => ({
    ...puckConfig,
    root: {
      ...puckConfig.root,
      render: ({ children }: { children: ReactNode }) => <EditorCanvasShell isHome={pageKey === "home"}>{children}</EditorCanvasShell>,
    },
    components: Object.fromEntries(
      Object.entries(puckConfig.components).map(([type, component]) => [
        type,
        {
          ...(component as any),
          label: BLOCK_META[type]?.name ?? (component as any).label ?? type,
          render: (props: Record<string, any>) => {
            if (props.isVisible === false) {
              return <div className="homepage-editor__hidden-block">此模块已隐藏，不会发布到前台</div>;
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
  }) as unknown as typeof puckConfig, [pageKey]);

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
        // 首次进入才展示整页加载态；切换页面时只替换画布数据，保持编辑器外壳稳定。
        if (!hasInitializedEditorRef.current) setInitialLoading(true);
        // 已访问页面直接恢复会话，避免默认模板闪现和重复全量更新。
        if (cachedPage) {
          serverData = cachedPage.data;
          setData(cachedPage.data);
          latestData.current = cachedPage.data;
          dataSignatureRef.current = JSON.stringify(cachedPage.data);
          setMetadata(cachedPage.metadata);
          latestMetadata.current = cachedPage.metadata;
          setLastSaved(cachedPage.lastSaved);
        } else if (!hasInitializedEditorRef.current) {
          setData(serverData);
          latestData.current = serverData;
          dataSignatureRef.current = JSON.stringify(serverData);
          setMetadata({});
          latestMetadata.current = {};
          setLastSaved(null);
        }
        setHasUnsavedChanges(false);
        setAutoSaveState("idle");
      }
      try {
        const response = await pageDocumentApi.getAdmin(pageKey);
        const document = unwrapResponse<any>(response);
        if (!cancelled && document?.puckData) {
          serverData = ensureEditorPageStructure(pageKey, document.puckData);
          setData(serverData);
          latestData.current = serverData;
          dataSignatureRef.current = JSON.stringify(serverData);
          const serverMetadata = document.metadata || {};
          setMetadata(serverMetadata);
          latestMetadata.current = serverMetadata;
          if (document.updatedAt) {
            setLastSaved(formatEditorTime(document.updatedAt));
          }
          pageSessionCacheRef.current[pageKey] = {
            data: serverData,
            metadata: serverMetadata,
            lastSaved: document.updatedAt ? formatEditorTime(document.updatedAt) : null,
            updatedAt: document.updatedAt || null,
          };
        } else if (!cachedPage) {
          // 新页面没有服务端草稿时，仅此处一次性落入该页面的正确默认结构。
          setData(serverData);
          latestData.current = serverData;
          dataSignatureRef.current = JSON.stringify(serverData);
          pageSessionCacheRef.current[pageKey] = { data: serverData, metadata: {}, lastSaved: null, updatedAt: null };
        }
      } catch (error) {
        if (!cancelled) {
          // 接口失败不能伪装成“没有草稿”，否则一次自动保存就可能覆盖已有装修内容。
          setLoadError(getEditorErrorMessage(error, "店铺装修内容加载失败，请检查网络后重试"));
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
    dataSignatureRef.current = JSON.stringify(data);
  }, [data]);

  const trackEditorData = useCallback((nextData: unknown) => {
    latestData.current = nextData;
    const changed = JSON.stringify(nextData) !== dataSignatureRef.current;
    setHasUnsavedChanges(changed);
    if (changed) {
      autoSaveRetryRef.current = 0;
      setAutoSaveState((current) => current === "saving" ? current : "idle");
    }
  }, []);

  const saveDraft = useCallback(async (
    nextData: unknown,
    options: { silent?: boolean } = {},
  ): Promise<boolean> => {
    const targetPageKey = pageKey;
    const requestedData = nextData ?? latestData.current;
    const requestedMetadata = latestMetadata.current;
    const save = async (): Promise<boolean> => {
      const editableData = requestedData ?? latestData.current;
      const isActivePage = () => targetPageKey === activePageKeyRef.current;
      if (isActivePage()) {
        setSaving(true);
        setAutoSaveState("saving");
      }
      try {
        const response = await pageDocumentApi.save({
          pageKey: targetPageKey,
          puckData: editableData,
          metadata: requestedMetadata,
          editorVersion: "0.22.4",
          expectedUpdatedAt: pageSessionCacheRef.current[targetPageKey]?.updatedAt || undefined,
        });
        const savedDocument = unwrapResponse<any>(response);
        const updatedAt = typeof savedDocument?.updatedAt === "string"
          ? savedDocument.updatedAt
          : pageSessionCacheRef.current[targetPageKey]?.updatedAt || new Date().toISOString();
        const lastSavedAt = formatEditorTime(updatedAt);
        pageSessionCacheRef.current[targetPageKey] = {
          data: editableData,
          metadata: requestedMetadata,
          lastSaved: lastSavedAt,
          updatedAt,
        };

        if (!isActivePage()) return true;
        const hasNewerLocalChanges = JSON.stringify(latestData.current) !== JSON.stringify(editableData);
        setLastSaved(lastSavedAt);
        if (hasNewerLocalChanges) {
          setHasUnsavedChanges(true);
          setAutoSaveState("idle");
        } else {
          setData(editableData);
          latestData.current = editableData;
          setHasUnsavedChanges(false);
          setAutoSaveState("saved");
        }
        autoSaveRetryRef.current = 0;
        if (!options.silent) message.success("页面草稿已保存");
        return true;
      } catch (error) {
        if (!isActivePage()) return false;
        const isConflict = getEditorHttpStatus(error) === 409;
        autoSaveRetryRef.current = 0;
        setAutoSaveState("error");
        if (isConflict) {
          message.error("该页面已被其他编辑者更新，请重新加载后再继续编辑");
        } else {
          message.error(getEditorErrorMessage(error, options.silent ? "草稿保存失败" : "保存失败，请重试"));
        }
        return false;
      } finally {
        if (isActivePage()) setSaving(false);
      }
    };

    const queuedSave = saveQueueRef.current.then(save, save);
    saveQueueRef.current = queuedSave.then(() => undefined, () => undefined);
    return queuedSave;
  }, [pageKey]);

  const switchEditorPage = useCallback(async (path: string) => {
    const targetPage = getEditorPageByPath(path);
    if (!targetPage || targetPage.key === pageKey) return;
    if (hasUnsavedChanges) {
      const saved = await saveDraft(latestData.current, { silent: true });
      if (!saved) {
        message.error("当前页面草稿保存失败，已停止切换以避免内容丢失");
        return;
      }
    }
    navigate(`/admin/editor/${targetPage.key}`);
  }, [hasUnsavedChanges, navigate, pageKey, saveDraft]);

  useEffect(() => {
    const handleCanvasPageNavigation = (event: MessageEvent<CanvasPageNavigationMessage>) => {
      if (event.data?.type !== CANVAS_PAGE_NAVIGATION_MESSAGE || typeof event.data.path !== "string") return;
      void switchEditorPage(event.data.path);
    };
    window.addEventListener("message", handleCanvasPageNavigation);
    return () => window.removeEventListener("message", handleCanvasPageNavigation);
  }, [switchEditorPage]);

  const previewDraft = useCallback(async (nextData: unknown, previewWindow: Window | null) => {
    const saved = await saveDraft(nextData, { silent: true });
    if (!saved) {
      previewWindow?.close();
      message.error("草稿保存失败，未打开预览，请检查网络后重试");
      return;
    }
    if (previewWindow) {
      previewWindow.location.replace(`/preview/${pageKey}`);
      return;
    }
    message.info("浏览器阻止了新窗口，请允许弹窗后重试预览");
  }, [pageKey, saveDraft]);

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

  const loadRevisions = useCallback(async () => {
    setRevisionsLoading(true);
    try {
      const response = await pageDocumentApi.getRevisions(pageKey);
      setRevisions(unwrapResponse<PageDocumentRevision[]>(response) || []);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "版本列表加载失败");
    } finally {
      setRevisionsLoading(false);
    }
  }, [pageKey]);

  const openRevisions = useCallback(() => {
    setRevisionsOpen(true);
    void loadRevisions();
  }, [loadRevisions]);

  const savePageSettings = useCallback(
    (next: { seoTitle?: string; seoDescription?: string; ogImage?: string }) => {
      const merged = { ...latestMetadata.current, ...next };
      setMetadata(merged);
      latestMetadata.current = merged;
      setPageSettingsOpen(false);
      void saveDraft(latestData.current, { silent: true });
    },
    [saveDraft],
  );

  const restoreRevision = useCallback((revision: PageDocumentRevision) => {
    Modal.confirm({
      title: `恢复版本 ${revision.version}？`,
      content: "恢复后会覆盖当前后台草稿，但不会立即影响前台首页。确认后可继续编辑或重新发布。",
      okText: "恢复到草稿",
      cancelText: "取消",
      onOk: async () => {
        setRestoringVersion(revision.version);
        try {
          const response = await pageDocumentApi.restoreRevision(pageKey, revision.version);
          const document = unwrapResponse<any>(response);
          if (document?.puckData) {
            setData(document.puckData);
            latestData.current = document.puckData;
            const restoredMetadata = document.metadata || {};
            setMetadata(restoredMetadata);
            latestMetadata.current = restoredMetadata;
            setHasUnsavedChanges(false);
            setAutoSaveState("saved");
            const restoredUpdatedAt = document.updatedAt || new Date().toISOString();
            const restoredLastSaved = formatEditorTime(restoredUpdatedAt);
            setLastSaved(restoredLastSaved);
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
          message.error(error instanceof Error ? error.message : "版本恢复失败");
        } finally {
          setRestoringVersion(null);
        }
      },
    });
  }, [pageKey]);

  const publishHome = async (
    nextData: unknown,
    locateBlock?: (blockIndex: number) => void,
  ) => {
    if (publishing) return;
    const editableData = nextData ?? latestData.current;

    // 发布前预检：单一数据源 = 后端校验器，前端只负责展示问题列表
    setPublishing(true);
    let validation: { valid: boolean; errors: string[] } | null = null;
    try {
      const response = await pageDocumentApi.validate(
        pageKey,
        editableData,
      );
      validation = unwrapResponse<{ valid: boolean; errors: string[] }>(
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

    if (validation && !validation.valid && validation.errors?.length) {
      const validationModal = Modal.error({
        title: `发布前需修复 ${validation.errors.length} 个问题`,
        content: (
          <ul
            style={{
              paddingLeft: 20,
              margin: 0,
              maxHeight: 320,
              overflowY: "auto",
            }}
          >
            {validation.errors.map((err, idx) => {
              const blockMatch = err.match(/^第\s*(\d+)\s*个区块/);
              const blockIndex = blockMatch ? Number(blockMatch[1]) - 1 : null;
              return (
                <li key={`${err}-${idx}`} style={{ fontSize: 13, lineHeight: 1.8, marginBottom: 6 }}>
                  <span>{err}</span>
                  {blockIndex !== null && blockIndex >= 0 && locateBlock ? (
                    <Button
                      type="link"
                      size="small"
                      style={{ paddingInline: 8 }}
                      onClick={() => {
                        validationModal.destroy();
                        locateBlock(blockIndex);
                      }}
                    >
                      定位此模块
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ),
        okText: "去修复",
      });
      return;
    }

    const blocks = (editableData as { content?: Array<{ type?: string; props?: Record<string, unknown> }> })?.content ?? [];
    const usesMobileFallback = blocks.some((block) =>
      (block.type === "首屏主视觉" || block.type === "单图海报" || block.type === "全屏出血图" || block.type === "热区图")
      && Boolean(block.props?.desktopImage || block.props?.image)
      && !block.props?.mobileImage,
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
            lastSaved: formatEditorTime(publishedDocument?.updatedAt || new Date()),
            updatedAt: publishedDocument?.updatedAt || pageSessionCacheRef.current[pageKey]?.updatedAt || null,
          };
          setData(editableData);
          latestData.current = editableData;
          setHasUnsavedChanges(false);
          setAutoSaveState("saved");
          setLastSaved(formatEditorTime(new Date()));
          void loadRevisions();
          message.success("店铺首页已发布，前台页面将立即读取最新版本");
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
        .homepage-editor__load-error {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 32px;
          color: #675B4E;
          text-align: center;
        }
        .homepage-editor__load-error > .anticon { color: #B15645; font-size: 28px; }
        .homepage-editor__load-error strong { color: #302A23; font-size: 16px; }
        .homepage-editor__load-error span { max-width: 520px; color: #82776B; font-size: 13px; line-height: 1.7; }
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
        .homepage-editor__page-picker { display: inline-flex; align-items: center; gap: 6px; color: #756B5F; font-size: 12px; }
        .homepage-editor__page-picker select { min-width: 116px; height: 28px; padding: 0 26px 0 8px; color: #3E3529; border: 1px solid #DED8CE; border-radius: 4px; background: #FFFDFC; font-size: 12px; cursor: pointer; }
        .homepage-editor__page-picker select:focus-visible { outline: 2px solid rgba(184, 148, 78, .72); outline-offset: 2px; }
        .homepage-editor__save-status { display: inline-flex; align-items: center; gap: 5px; color: #7E9A74; }
        .homepage-editor__save-status.is-saving { color: #9A7A30; }
        .homepage-editor__save-status.is-error { color: #B14D45; }
        .homepage-editor__save-status i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
        .homepage-editor__viewport-switcher {
          display: flex;
          align-items: center;
          flex: 0 0 auto;
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
          white-space: nowrap;
        }
        .homepage-editor__viewport-switcher button > .anticon { display: inline-flex; }
        .homepage-editor__viewport-switcher button > span:not(.anticon) { display: grid; gap: 1px; line-height: 1.1; text-align: left; white-space: nowrap; }
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
        .homepage-editor__page-settings {
          display: grid;
          gap: 4px;
        }
        .homepage-editor__page-settings-hint {
          margin: 0 0 12px;
          padding: 10px 12px;
          border-radius: 6px;
          background: #F6F1E8;
          color: #8D8375;
          font-size: 12px;
          line-height: 1.7;
        }
        .homepage-editor__page-settings-label {
          display: block;
          margin-top: 10px;
          margin-bottom: 2px;
          color: #2B2721;
          font-size: 13px;
          font-weight: 500;
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
          padding: 12px 12px 10px;
          border-bottom: 1px solid #EEEAE4;
        }
        .homepage-editor__library-title {
          display: flex;
          align-items: center;
          gap: 7px;
          margin-bottom: 8px;
          color: #27231E;
          font-size: 13px;
          font-weight: 600;
        }
        .homepage-editor__library-title .anticon { color: #B8944E; }
        .homepage-editor__library-title small {
          margin-left: auto;
          color: #9A9187;
          font-size: 10px;
          font-weight: 400;
        }
        .homepage-editor__library-search-row {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .homepage-editor__library-search-row .ant-input-affix-wrapper {
          flex: 1;
          min-width: 0;
          border-color: #E6E0D7;
          border-radius: 4px;
          box-shadow: none;
        }
        .homepage-editor__library-search-row .ant-input-affix-wrapper:focus-within {
          border-color: #B8944E;
          box-shadow: 0 0 0 2px rgba(184, 148, 78, .10);
        }
        .homepage-editor__view-toggle button {
          flex: 0 0 auto;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 30px;
          height: 30px;
          padding: 0;
          border: 1px solid #E6E0D7;
          border-radius: 4px;
          background: #FFFFFF;
          color: #8A8077;
          font-size: 13px;
          cursor: pointer;
        }
        .homepage-editor__view-toggle button:hover {
          color: #644718;
          border-color: #D8C49A;
        }
        .homepage-editor__view-toggle button.is-active {
          color: #644718;
          background: #FBF7EE;
          border-color: #D8C49A;
        }
        .homepage-editor__view-toggle {
          display: inline-flex;
          gap: 4px;
        }
        .homepage-editor__library-tabs {
          display: flex;
          margin-top: 10px;
          border-bottom: 1px solid #EEEAE4;
        }
        .homepage-editor__library-tabs button {
          position: relative;
          flex: 1 1 0;
          min-width: 0;
          padding: 5px 2px 8px;
          border: 0;
          color: #9A9187;
          background: transparent;
          font-size: 11px;
          text-align: center;
          white-space: nowrap;
          cursor: pointer;
        }
        .homepage-editor__library-tabs button:hover { color: #644718; }
        .homepage-editor__library-tabs button.is-active {
          color: #644718;
          font-weight: 600;
        }
        .homepage-editor__library-tabs button.is-active::after {
          content: "";
          position: absolute;
          left: 50%;
          bottom: 0;
          width: 18px;
          height: 2px;
          border-radius: 999px;
          background: #B8944E;
          transform: translateX(-50%);
        }
        .homepage-editor__template-scroll.is-double {
          display: grid;
          grid-template-columns: 1fr 1fr;
          align-content: start;
          grid-auto-rows: max-content;
          gap: 10px;
        }
        .homepage-editor__template-scroll.is-double .homepage-editor__template-card {
          margin: 0;
          padding: 0 0 6px;
          border-color: #F0EBE3;
        }
        .homepage-editor__template-preview-img {
          display: block;
          width: 100%;
          aspect-ratio: 3 / 4;
          object-fit: cover;
          background: #F4F5F7;
        }
        /* 双列预览统一 3:4（与 SVG viewBox 一致，无裁切）；名称单行省略，保证每张卡片尺寸完全一致 */
        .homepage-editor__template-scroll.is-double .homepage-editor__template-preview-img {
          aspect-ratio: 3 / 4;
        }
        .homepage-editor__template-scroll.is-double .homepage-editor__template-name {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .homepage-editor__template-card.is-compact .homepage-editor__template-description {
          display: none;
        }
        .homepage-editor__template-card.is-compact .homepage-editor__template-name {
          font-size: 12px;
        }
        .homepage-editor__library-drag-tip {
          display: flex;
          align-items: center;
          gap: 5px;
          margin-top: 8px;
          color: #ACA398;
          font-size: 10px;
          line-height: 1.3;
        }
        .homepage-editor__library-drag-tip .anticon { color: #C2B8A8; }
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
        .homepage-editor__template-scroll.is-double { display: block; }
        .homepage-editor__template-group + .homepage-editor__template-group { margin-top: 22px; }
        .homepage-editor__template-group > h3 {
          margin: 0 0 10px;
          color: #756A5F;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: .08em;
        }
        .homepage-editor__template-scroll.is-double .homepage-editor__template-group-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
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
        .homepage-editor__canvas-action-dock {
          position: absolute;
          z-index: 8;
          display: grid;
          gap: 2px;
          width: 38px;
          padding: 4px;
          border: 1px solid #E3E8F0;
          border-radius: 19px;
          background: rgba(255, 255, 255, .96);
          box-shadow: 0 6px 18px rgba(46, 60, 88, .12);
          backdrop-filter: blur(8px);
        }
        .homepage-editor__canvas-action-dock button {
          display: grid;
          width: 30px;
          height: 30px;
          place-items: center;
          padding: 0;
          border: 0;
          border-radius: 50%;
          color: #4C5B73;
          background: transparent;
          cursor: pointer;
          font-size: 13px;
          transition: color .16s ease, background .16s ease;
        }
        .homepage-editor__canvas-action-dock button:hover:not(:disabled),
        .homepage-editor__canvas-action-dock button:focus-visible {
          color: #3048CD;
          background: #EEF1FF;
          outline: 0;
        }
        .homepage-editor__canvas-action-dock button.is-danger:hover:not(:disabled),
        .homepage-editor__canvas-action-dock button.is-danger:focus-visible {
          color: #C83C42;
          background: #FFF0F0;
        }
        .homepage-editor__canvas-action-dock button:disabled {
          color: #C7CEDA;
          cursor: not-allowed;
        }
        .homepage-editor__storefront-frame .storefront-navigation--preview .site-header,
        .homepage-editor__storefront-frame .storefront-navigation--preview .site-header__left-group {
          position: absolute;
        }
        .homepage-editor__storefront-frame .storefront-navigation--preview .brand-menu {
          position: absolute;
          right: 0;
          bottom: auto;
          height: var(--homepage-editor-preview-height, 900px);
        }
        .homepage-editor__storefront-frame .storefront-navigation--preview .brand-menu__inner {
          min-height: 100%;
          box-sizing: border-box;
        }
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
        .homepage-editor__layer-frame { display: grid; gap: 7px; margin: 0 0 10px; padding: 10px; border: 1px solid #ECE3D6; border-radius: 5px; background: #FCFBF8; }
        .homepage-editor__layer-frame > span { color: #8A7861; font-size: 10px; font-weight: 600; letter-spacing: .08em; }
        .homepage-editor__layer-frame button { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 7px; width: 100%; padding: 7px 8px; border: 1px solid #E8DED0; border-radius: 4px; color: #5E5040; background: #FFFFFF; cursor: pointer; text-align: left; }
        .homepage-editor__layer-frame button:hover,
        .homepage-editor__layer-frame button[aria-pressed="true"] { border-color: #C5A461; color: #76531B; background: #FCF8EF; }
        .homepage-editor__layer-frame button .anticon { color: #A38351; }
        .homepage-editor__layer-frame button span { min-width: 0; overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
        .homepage-editor__layer-frame button small { grid-column: 2; color: #9B9082; font-size: 10px; }
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
          gap: 8px;
          padding: 13px 16px;
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
        .homepage-editor__properties-device {
          margin-left: auto;
          padding: 3px 8px;
          border-radius: 999px;
          color: #8A692D;
          background: #FBF7EE;
          font-size: 11px;
          line-height: 1.3;
          white-space: nowrap;
        }
        .homepage-editor__properties-scroll {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: 12px 16px 30px;
        }
        .homepage-editor__properties-helper {
          margin: 0 0 4px;
          color: #93897D;
          font-size: 11px;
          line-height: 1.55;
        }
        .homepage-editor__properties-section {
          display: none;
        }
        .homepage-editor__properties .homepage-editor__inspector-section {
          margin: 0;
          border-top: 1px solid #EEEAE4;
        }
        .homepage-editor__properties .homepage-editor__inspector-section:first-of-type {
          border-top: 0;
        }
        .homepage-editor__properties .homepage-editor__inspector-section-head {
          padding: 12px 0;
          font-size: 13px;
        }
        .homepage-editor__properties .homepage-editor__inspector-section-body {
          gap: 12px;
          padding: 0 0 14px;
        }
        .homepage-editor__media-status {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          margin: 0;
          padding: 9px 10px;
          border: 1px solid #EAE3D8;
          border-radius: 5px;
          background: #FCFBF8;
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
        .homepage-editor__properties[data-active-device="desktop"] [class*="PuckFields-field"]:has(.homepage-editor__media-picker[data-media-device="mobile"]),
        .homepage-editor__properties[data-active-device="mobile"] [class*="PuckFields-field"]:has(.homepage-editor__media-picker[data-media-device="desktop"]) {
          display: none;
        }
        .homepage-editor__properties[data-active-device="desktop"] [class*="PuckFields-field"]:has([data-editor-device="mobile"]),
        .homepage-editor__properties[data-active-device="mobile"] [class*="PuckFields-field"]:has([data-editor-device="desktop"]) {
          display: none;
        }
        .homepage-editor__properties:is(
          [data-module-type="首屏主视觉"],
          [data-module-type="单图海报"],
          [data-module-type="双图海报"],
          [data-module-type="图文混排"],
          [data-module-type="全屏出血图"],
          [data-module-type="分割面板"],
          [data-module-type="轮播图"],
          [data-module-type="热区图"],
          [data-module-type="视频区块"]
        ) [class*="PuckFields-field"]:has(.homepage-editor__media-picker) {
          display: none;
        }
        .homepage-editor__properties[data-module-type="轮播图"] form[class*="PuckFields"] > [class*="PuckFields-field"]:first-child {
          display: none;
        }
        .homepage-editor__media-preview-img {
          min-height: 168px;
          display: grid;
          place-items: center;
          overflow: hidden;
          background: #F5F2ED;
        }
        .homepage-editor__media-preview-img.is-crop-preview {
          min-height: 0;
        }
        .homepage-editor__media-preview-note {
          margin: 6px 0 0;
          color: #8E867C;
          font-size: 11px;
          line-height: 1.45;
        }
        .homepage-editor__structure-guide {
          display: grid;
          gap: 10px;
          margin: 0;
          padding: 0;
          border: 0;
          background: transparent;
        }
        .homepage-editor__structure-group { display: grid; gap: 8px; }
        .homepage-editor__structure-title {
          color: #7A5E2D;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: .06em;
        }
        .homepage-editor__structure-media-grid { display: grid; gap: 8px; }
        .homepage-editor__structure-media {
          min-width: 0;
          display: grid;
          gap: 8px;
          padding: 9px;
          border: 1px solid #E5D9C5;
          border-radius: 4px;
          color: #8E8170;
          background: #FFFFFF;
          text-align: left;
        }
        .homepage-editor__structure-media-heading { display: grid; gap: 3px; }
        .homepage-editor__structure-media-heading > span { display: flex; align-items: center; gap: 6px; }
        .homepage-editor__structure-media strong { color: #4A4136; font-size: 12px; }
        .homepage-editor__structure-media small { color: #8E867C; font-size: 11px; line-height: 1.35; }
        .homepage-editor__structure-media em { color: #B15645; font-size: 10px; font-style: normal; }
        .homepage-editor__structure-media .homepage-editor__media-picker { margin: 0; }
        .homepage-editor__carousel-item-settings { display: grid; gap: 8px; padding-top: 2px; }
        .homepage-editor__carousel-item-settings label { display: grid; gap: 4px; color: #746B60; font-size: 11px; }
        .homepage-editor__carousel-item-actions { display: flex; flex-wrap: wrap; gap: 5px; }
        .homepage-editor__carousel-item-actions button,
        .homepage-editor__carousel-add button {
          padding: 4px 7px;
          border: 1px solid #DDD3C4;
          border-radius: 3px;
          color: #72582B;
          background: #FFFFFF;
          cursor: pointer;
          font-size: 11px;
        }
        .homepage-editor__carousel-item-actions button:last-child { color: #A94E42; }
        .homepage-editor__carousel-item-actions button:disabled { cursor: not-allowed; opacity: .42; }
        .homepage-editor__carousel-add { display: grid; gap: 8px; color: #887D70; font-size: 11px; line-height: 1.45; }
        .homepage-editor__carousel-add button { justify-self: start; border-color: #B8944E; color: #76592B; }
        .homepage-editor__device-number-field { display: grid; gap: 5px; color: #746B60; font-size: 12px; }
        .homepage-editor__device-number-field input { width: 100%; height: 30px; box-sizing: border-box; padding: 0 8px; }
        .homepage-editor__structure-copy-list { display: grid; gap: 2px; }
        .homepage-editor__structure-copy-list button {
          display: grid;
          grid-template-columns: 84px minmax(0, 1fr);
          gap: 8px;
          padding: 6px 4px;
          border: 0;
          border-radius: 3px;
          color: #665B4E;
          background: transparent;
          cursor: pointer;
          text-align: left;
        }
        .homepage-editor__structure-copy-list button:hover,
        .homepage-editor__structure-copy-list button:focus-visible { background: #F3EBDD; outline: none; }
        .homepage-editor__structure-copy-list strong { color: #4A4136; font-size: 11px; }
        .homepage-editor__structure-copy-list span { color: #8E867C; font-size: 11px; line-height: 1.35; }
        .homepage-editor__media-details { margin: 0; border-top: 1px solid #EEEAE4; }
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
          gap: 12px;
          min-width: 0;
          color: #3C352C;
          font-size: 12px;
        }
        .homepage-editor__product-picker-method {
          display: grid;
          grid-template-columns: 16px minmax(0, 1fr);
          align-items: start;
          gap: 8px;
          padding: 2px 0;
        }
        .homepage-editor__product-picker-method > span {
          width: 14px;
          height: 14px;
          box-sizing: border-box;
          margin-top: 1px;
          border: 4px solid #FFFFFF;
          border-radius: 50%;
          background: #B8944E;
          box-shadow: 0 0 0 1px #B8944E;
        }
        .homepage-editor__product-picker-method > div {
          min-width: 0;
          display: grid;
          gap: 3px;
        }
        .homepage-editor__product-picker-method strong {
          color: #453D34;
          font-size: 12px;
          font-weight: 600;
        }
        .homepage-editor__product-picker-method small {
          color: #958B7E;
          font-size: 11px;
          line-height: 1.45;
        }
        .homepage-editor__product-picker-search input {
          width: 100%;
          height: 36px;
          box-sizing: border-box;
          padding: 0 12px;
          border: 1px solid #DED8CE;
          border-radius: 5px;
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
        /* 作品陈列使用全展开结构：分区只负责建立层级，不提供折叠或收纳入口。 */
        .homepage-editor__product-row-inspector .homepage-editor__inspector-scroll {
          padding-top: 6px;
        }
        .homepage-editor__product-row-section {
          padding: 18px 0 20px;
          border-top: 1px solid #ECE8E2;
        }
        .homepage-editor__product-row-section:first-of-type {
          border-top: 0;
        }
        .homepage-editor__product-row-section-head {
          display: grid;
          gap: 4px;
          margin-bottom: 13px;
        }
        .homepage-editor__product-row-section-head h3 {
          margin: 0;
          color: #2C2721;
          font-size: 14px;
          font-weight: 600;
          line-height: 1.4;
        }
        .homepage-editor__product-row-section-head p {
          margin: 0;
          color: #93897D;
          font-size: 11px;
          line-height: 1.55;
        }
        .homepage-editor__product-row-section-body {
          display: grid;
          gap: 14px;
          min-width: 0;
        }
        .homepage-editor__product-row-mode-picker {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          align-items: start;
          gap: 12px;
        }
        .homepage-editor__product-row-mode-picker button {
          min-width: 0;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 6px 6px 10px;
          border: 1px solid #E3DED6;
          border-radius: 5px;
          color: #625A51;
          background: #FFFFFF;
          cursor: pointer;
          text-align: left;
          transition: border-color .16s ease, background-color .16s ease, box-shadow .16s ease;
        }
        .homepage-editor__product-row-mode-picker button:hover {
          border-color: #C8B17A;
          background: #FCFAF5;
        }
        .homepage-editor__product-row-mode-picker button:focus-visible {
          outline: 2px solid rgba(184, 148, 78, .42);
          outline-offset: 2px;
        }
        .homepage-editor__product-row-mode-picker button.is-active {
          border-color: #B8944E;
          color: #76531B;
          background: #FFFCF6;
          box-shadow: 0 0 0 2px rgba(184, 148, 78, .10);
        }
        .homepage-editor__product-row-mode-preview {
          width: 100%;
          aspect-ratio: 4 / 3;
          display: block;
          overflow: hidden;
          border: 1px solid #ECE8E1;
          border-radius: 3px;
          background: #F7F6F3;
        }
        .homepage-editor__product-row-mode-preview img {
          width: 100%;
          height: 100%;
          display: block;
          object-fit: cover;
          object-position: top center;
        }
        .homepage-editor__product-row-mode-picker button > span:last-child {
          width: 100%;
          min-width: 0;
          display: grid;
          gap: 3px;
          padding-inline: 3px;
        }
        .homepage-editor__product-row-mode-picker button strong {
          color: #3F382F;
          font-size: 13px;
          font-weight: 600;
        }
        .homepage-editor__product-row-mode-picker button small {
          color: #978D81;
          font-size: 11px;
          line-height: 1.4;
        }
        .homepage-editor__product-row-mode-note {
          display: block;
          margin-top: 8px;
          color: #93897D;
          font-size: 11px;
          line-height: 1.5;
        }
        .homepage-editor__product-row-setting {
          min-width: 0;
          display: grid;
          grid-template-columns: minmax(116px, .8fr) minmax(180px, 1.2fr);
          align-items: center;
          gap: 16px;
          padding: 2px 0;
        }
        .homepage-editor__product-row-setting > div:first-child {
          min-width: 0;
          display: grid;
          gap: 3px;
        }
        .homepage-editor__product-row-setting strong {
          color: #4A4136;
          font-size: 12px;
          font-weight: 600;
        }
        .homepage-editor__product-row-setting span {
          color: #93897D;
          font-size: 11px;
          line-height: 1.45;
        }
        .homepage-editor__product-row-inspector .homepage-editor__layout-rule {
          margin-top: 2px;
        }
        .homepage-editor__product-row-inspector .homepage-editor__inspector-segmented button:focus-visible {
          outline: 2px solid rgba(184, 148, 78, .38);
          outline-offset: 1px;
        }
        @media (max-width: 1500px) {
          .homepage-editor__product-row-setting {
            grid-template-columns: 1fr;
            gap: 8px;
          }
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
        .homepage-editor__inspector-media-spec {
          margin: 8px 0 0;
          color: #8D8375;
          font-size: 11px;
          line-height: 1.45;
        }
        .homepage-editor button:focus-visible,
        .homepage-editor input:focus-visible,
        .homepage-editor textarea:focus-visible,
        .homepage-editor select:focus-visible { outline: 2px solid rgba(184, 148, 78, .72); outline-offset: 2px; }
        @media (max-width: 1500px) {
          .homepage-editor__body { grid-template-columns: 248px minmax(0, 1fr) auto; }
          .homepage-editor__body.is-inspecting { grid-template-columns: minmax(260px, 1fr) minmax(520px, 564px); }
          .homepage-editor__body.is-inspecting .homepage-editor__library { display: none; }
          .homepage-editor__body.is-inspecting .homepage-editor__right-workspace {
            position: static;
            width: auto;
            grid-template-columns: 184px minmax(336px, 1fr);
            box-shadow: none;
          }
          .homepage-editor__toolbar { grid-template-columns: minmax(180px, 1fr) auto minmax(220px, 1fr); gap: 10px; padding: 0 16px; }
        }
        @media (max-width: 1120px) {
          .homepage-editor__body.is-inspecting { grid-template-columns: minmax(220px, 1fr) minmax(420px, 520px); }
          .homepage-editor__body.is-inspecting .homepage-editor__library { display: none; }
          .homepage-editor__body.is-inspecting .homepage-editor__right-workspace {
            width: auto;
            grid-template-columns: 160px minmax(260px, 1fr);
          }
        }
        @media (max-width: 980px) {
          .homepage-editor__body { grid-template-columns: 220px minmax(0, 1fr) 204px; }
          .homepage-editor__body.is-inspecting { grid-template-columns: minmax(180px, 1fr) minmax(356px, 420px); }
          .homepage-editor__body.is-inspecting .homepage-editor__right-workspace { width: auto; grid-template-columns: 118px minmax(238px, 1fr); }
          .homepage-editor__body.is-inspecting .homepage-editor__layer-heading { padding-inline: 10px; }
          .homepage-editor__body.is-inspecting .homepage-editor__layer-scroll { padding-inline: 7px; }
          .homepage-editor__body.is-inspecting .homepage-editor__layer-frame { padding: 7px; }
          .homepage-editor__toolbar-context > span:not(.homepage-editor__save-status),
          .homepage-editor__toolbar-divider { display: none; }
          .homepage-editor__toolbar-actions .ant-btn > span:not(.anticon) { display: none; }
          .homepage-editor__toolbar-actions .ant-btn { min-width: 34px; padding-inline: 8px; }
        }

        /* ═══ 模块设置面板重构（首屏主视觉） ═══ */
        .homepage-editor__inspector {
          min-height: 0;
          display: flex;
          flex-direction: column;
          background: #FFFFFF;
        }
        .homepage-editor__inspector-header {
          position: sticky;
          top: 0;
          z-index: 2;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 14px;
          border-bottom: 1px solid #EEEAE4;
          background: #FFFFFF;
        }
        .homepage-editor__inspector-eyebrow { font-size: 10px; color: #9A9288; letter-spacing: 0.08em; }
        .homepage-editor__inspector-title { flex: 1; font-size: 14px; font-weight: 600; color: #2C2721; }
        .homepage-editor__inspector-device {
          font-size: 11px;
          color: #B8944E;
          background: #FBF7EE;
          padding: 2px 8px;
          border-radius: 999px;
        }
        .homepage-editor__inspector-scroll {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          overscroll-behavior: contain;
          scrollbar-width: thin;
          padding: 4px 14px 24px;
        }
        .homepage-editor__inspector-section { margin-bottom: 4px; }
        .homepage-editor__inspector-section + .homepage-editor__inspector-section { border-top: 1px solid #EEEAE4; }
        .homepage-editor__inspector-section-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          padding: 10px 0;
          border: 0;
          background: transparent;
          font-size: 14px;
          font-weight: 600;
          color: #2C2721;
          cursor: pointer;
        }
        .homepage-editor__inspector-section-icon { color: #9A9288; font-size: 14px; }
        .homepage-editor__inspector-section-body { display: flex; flex-direction: column; gap: 16px; padding-bottom: 10px; }
        .homepage-editor__inspector-field { display: flex; flex-direction: column; gap: 6px; }
        .homepage-editor__inspector-field > label {
          font-size: 13px;
          font-weight: 500;
          color: #4A4239;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .homepage-editor__inspector-count,
        .homepage-editor__inspector-hint { font-size: 11px; font-weight: 400; color: #9A9288; }
        .homepage-editor__inspector-field > label em { color: #B15645; font-size: 10px; font-style: normal; font-weight: 500; }
        .homepage-editor__inspector-warn { font-size: 11px; color: #B15645; }
        .homepage-editor__inspector-toggle { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #6B6259; }
        .homepage-editor__inspector-image-actions { display: flex; gap: 8px; }
        .homepage-editor__inspector-image-summary {
          display: grid;
          grid-template-columns: 76px minmax(0, 1fr);
          align-items: center;
          gap: 10px;
          padding: 8px;
          border: 1px solid #EAE3D8;
          border-radius: 6px;
          background: #FCFBF8;
        }
        .homepage-editor__inspector-image-summary img {
          width: 76px;
          height: 58px;
          border-radius: 4px;
          object-fit: cover;
          background: #F1EDE6;
        }
        .homepage-editor__inspector-image-summary > div { min-width: 0; display: grid; gap: 4px; }
        .homepage-editor__inspector-image-summary strong { color: #4A4136; font-size: 12px; }
        .homepage-editor__inspector-image-summary span { color: #93897D; font-size: 11px; }
        .homepage-editor__inspector-image-summary .homepage-editor__inspector-image-actions { margin-top: 2px; }
        .homepage-editor__inspector-details { border-top: 1px solid #EEEAE4; }
        .homepage-editor__inspector-details summary {
          display: flex;
          align-items: center;
          justify-content: space-between;
          min-height: 38px;
          color: #766D62;
          cursor: pointer;
          font-size: 12px;
          list-style: none;
        }
        .homepage-editor__inspector-details summary::-webkit-details-marker { display: none; }
        .homepage-editor__inspector-details summary::after { color: #A38B5B; content: "+"; font-size: 16px; font-weight: 300; }
        .homepage-editor__inspector-details[open] summary::after { content: "−"; }
        .homepage-editor__inspector-details .homepage-editor__focus-picker,
        .homepage-editor__inspector-details .homepage-editor__image-status { margin-bottom: 10px; }
        .homepage-editor__inspector-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 24px 12px;
          text-align: center;
          border: 1px dashed #E0D6C4;
          border-radius: 8px;
          background: #FCFAF5;
          color: #8A7F72;
        }
        .homepage-editor__inspector-empty small { font-size: 11px; color: #ACA398; }
        .homepage-editor__inspector-placeholder,
        .homepage-editor__inspector-device-info { font-size: 12px; color: #8A7F72; line-height: 1.6; margin: 0; }
        .homepage-editor__inspector-option-group {
          display: grid;
          gap: 10px;
          padding: 10px;
          border: 1px solid #EAE3D8;
          border-radius: 6px;
          background: #FCFBF8;
        }
        .homepage-editor__inspector-option-group > div:first-child { display: grid; gap: 3px; }
        .homepage-editor__inspector-option-group strong { color: #4A4136; font-size: 12px; }
        .homepage-editor__inspector-option-group span { color: #93897D; font-size: 11px; line-height: 1.45; }
        .homepage-editor__inspector-segmented {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 5px;
          padding: 3px;
          border-radius: 5px;
          background: #F2EEE7;
        }
        .homepage-editor__inspector-segmented.is-three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .homepage-editor__inspector-segmented button {
          min-height: 28px;
          border: 0;
          border-radius: 3px;
          color: #776D60;
          background: transparent;
          cursor: pointer;
          font-size: 12px;
        }
        .homepage-editor__inspector-segmented button.is-active {
          color: #694A17;
          background: #FFFFFF;
          box-shadow: 0 1px 2px rgba(78, 58, 29, .14);
        }
        .homepage-editor__contract-status {
          display: grid;
          grid-template-columns: 18px minmax(0, 1fr);
          gap: 8px;
          margin: 10px 0 2px;
          padding: 10px;
          border: 1px solid #E7E0D4;
          border-radius: 6px;
          color: #786D61;
          background: #FCFBF8;
        }
        .homepage-editor__contract-status > .anticon { margin-top: 2px; font-size: 14px; }
        .homepage-editor__contract-status > div { min-width: 0; display: grid; gap: 3px; }
        .homepage-editor__contract-status strong { color: #4A4136; font-size: 12px; }
        .homepage-editor__contract-status span { font-size: 11px; line-height: 1.5; }
        .homepage-editor__contract-status.is-ready { border-color: #DCE8DC; color: #648067; background: #F7FBF7; }
        .homepage-editor__contract-status.is-warning { border-color: #EADFC9; color: #98742E; background: #FFFBF3; }
        .homepage-editor__contract-status.is-error { border-color: #EBD5CF; color: #A45543; background: #FFF8F6; }
        .homepage-editor__layout-rule {
          display: grid;
          gap: 4px;
          padding: 10px;
          border-left: 2px solid #B8944E;
          color: #8C8277;
          background: #FBF9F5;
          font-size: 11px;
          line-height: 1.45;
        }
        .homepage-editor__layout-rule strong { color: #5E5143; font-size: 12px; }
        .homepage-editor__section-note {
          margin: 0;
          color: #8E867C;
          font-size: 11px;
          line-height: 1.55;
        }
        .homepage-editor__copy-device-config,
        .homepage-editor__add-hotspot {
          min-height: 34px;
          border: 1px solid #D9C9A9;
          border-radius: 5px;
          color: #785A25;
          background: #FFFCF6;
          cursor: pointer;
          font-size: 12px;
        }
        .homepage-editor__copy-device-config:hover,
        .homepage-editor__add-hotspot:hover:not(:disabled) { border-color: #B8944E; background: #FBF6EB; }
        .homepage-editor__add-hotspot:disabled { color: #AAA198; cursor: not-allowed; background: #F6F4F1; }
        .homepage-editor__hotspot-list { display: grid; gap: 10px; }
        .homepage-editor__hotspot-card {
          display: grid;
          gap: 10px;
          padding: 10px;
          border: 1px solid #E7E1D8;
          border-radius: 6px;
          background: #FCFBF8;
        }
        .homepage-editor__hotspot-card > header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .homepage-editor__hotspot-card > header strong { color: #4A4136; font-size: 12px; }
        .homepage-editor__hotspot-card > header div { display: flex; gap: 3px; }
        .homepage-editor__hotspot-card > header button {
          padding: 2px 5px;
          border: 0;
          color: #887B6C;
          background: transparent;
          cursor: pointer;
          font-size: 10px;
        }
        .homepage-editor__hotspot-card > header button:last-child { color: #AC5A4B; }
        .homepage-editor__hotspot-card > header button:disabled { color: #C8C2BA; cursor: not-allowed; }
        .homepage-editor__hotspot-geometry { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 5px; }
        .homepage-editor__hotspot-geometry label { min-width: 0; display: grid; gap: 4px; color: #8E867C; font-size: 10px; }
        .homepage-editor__hotspot-geometry input { padding-inline: 5px; text-align: center; }

        /* FocusPicker */
        .homepage-editor__focus-picker { display: flex; flex-direction: column; gap: 8px; }
        .homepage-editor__focus-picker-img {
          position: relative;
          width: 100%;
          border-radius: 8px;
          overflow: hidden;
          background: #F5F2ED;
          box-shadow: 0 1px 3px rgba(76, 53, 20, 0.08);
          touch-action: none;
        }
        .homepage-editor__focus-point {
          position: absolute;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          border: 2px solid #FFFFFF;
          background: rgba(184, 148, 78, 0.9);
          box-shadow: 0 0 0 2px rgba(0,0,0,0.25), 0 2px 6px rgba(0,0,0,0.3);
          transform: translate(-50%, -50%);
          pointer-events: none;
        }
        .homepage-editor__safe-area {
          position: absolute;
          inset: 12%;
          border: 1px dashed rgba(255,255,255,0.7);
          border-radius: 4px;
          pointer-events: none;
        }
        .homepage-editor__focus-quick summary { font-size: 11px; color: #8A7F72; cursor: pointer; list-style: none; }
        .homepage-editor__focus-quick summary::-webkit-details-marker { display: none; }
        .homepage-editor__focus-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; margin-top: 6px; }
        .homepage-editor__focus-grid button { aspect-ratio: 1; border: 1px solid #ECE5DA; border-radius: 4px; background: #FCFAF5; cursor: pointer; }
        .homepage-editor__focus-grid button.is-active { border-color: #B8944E; background: #FBF7EE; }

        /* ImageStatus */
        .homepage-editor__image-status {
          display: flex;
          flex-direction: column;
          gap: 3px;
          padding: 8px 10px;
          border-radius: 6px;
          background: #FCFAF5;
          font-size: 11px;
        }
        .homepage-editor__image-status-row { display: flex; align-items: center; gap: 6px; color: #5A5048; }
        .homepage-editor__image-status-icon { width: 12px; }
        .homepage-editor__image-status-row.is-ok .homepage-editor__image-status-icon { color: #5C8C5F; }
        .homepage-editor__image-status-row.is-warn .homepage-editor__image-status-icon { color: #C7822F; }
        .homepage-editor__image-status-label { color: #9A9288; min-width: 52px; }
        .homepage-editor__image-status-value { flex: 1; }
        .homepage-editor__image-status-hint { color: #C7822F; }
        .homepage-editor__carousel-tabs {
          display: flex;
          align-items: center;
          gap: 4px;
          overflow-x: auto;
          padding: 0 0 8px;
          border-bottom: 1px solid #EEEAE4;
        }
        .homepage-editor__carousel-tabs button {
          flex: 0 0 auto;
          min-height: 28px;
          padding: 0 9px;
          border: 0;
          border-bottom: 2px solid transparent;
          color: #82786B;
          background: transparent;
          cursor: pointer;
          font-size: 12px;
        }
        .homepage-editor__carousel-tabs button.is-active { border-bottom-color: #B8944E; color: #684A1B; font-weight: 600; }
        .homepage-editor__carousel-tabs > span { margin-left: auto; color: #A0978A; font-size: 11px; white-space: nowrap; }

        /* ── 装修工作台：参考式四栏布局。仅调整编辑器壳层，不触碰页面内容数据。 ── */
        .homepage-editor__body {
          grid-template-columns: 260px minmax(420px, 1fr) 244px 514px;
          background:
            radial-gradient(circle at 52% 8%, rgba(255, 255, 255, .94), transparent 28rem),
            linear-gradient(135deg, #F7F8FC 0%, #F1F4FA 100%);
        }
        .homepage-editor__right-workspace {
          display: contents;
        }
        .homepage-editor__library {
          border-right-color: #E3E7EF;
          background: rgba(255, 255, 255, .94);
        }
        .homepage-editor__library-tools {
          padding: 15px 14px 12px;
          border-bottom-color: #E8EBF1;
        }
        .homepage-editor__library-title {
          margin-bottom: 11px;
          letter-spacing: .01em;
        }
        .homepage-editor__library-search-row .ant-input-affix-wrapper,
        .homepage-editor__view-toggle button {
          border-color: #E0E5EF;
          background: #FAFBFE;
        }
        .homepage-editor__library-tabs {
          margin-top: 12px;
          border-bottom-color: #E8EBF1;
        }
        .homepage-editor__library-tabs button {
          padding-bottom: 9px;
        }
        .homepage-editor__template-scroll {
          padding: 14px 12px 36px;
          background: rgba(250, 251, 254, .72);
        }
        .homepage-editor__template-card {
          border-color: #E5E9F0;
          border-radius: 8px;
          box-shadow: 0 1px 2px rgba(34, 48, 73, .025);
        }
        .homepage-editor__stage {
          padding: 46px clamp(26px, 3vw, 62px) 76px;
          background: transparent;
        }
        .homepage-editor__stage-label {
          top: -29px;
          margin-top: -30px;
          border-color: #E1E6EF;
          color: #7A8493;
          background: rgba(255, 255, 255, .9);
          box-shadow: 0 4px 16px rgba(57, 72, 98, .07);
        }
        .homepage-editor__canvas-controls {
          border-color: #E0E5EE;
          box-shadow: 0 5px 18px rgba(57, 72, 98, .08);
        }
        .homepage-editor__canvas-document {
          padding: 8px;
          border-radius: 10px;
          background: rgba(255, 255, 255, .56);
          box-shadow: 0 12px 34px rgba(43, 60, 87, .06);
        }
        .homepage-editor__preview-frame {
          border: 1px solid #E0E5EE;
          border-radius: 7px;
          box-shadow: 0 14px 32px rgba(39, 52, 76, .14);
        }
        .homepage-editor__layer-rail {
          border-right: 1px solid #E3E7EF;
          background: rgba(255, 255, 255, .96);
        }
        .homepage-editor__layer-heading,
        .homepage-editor__properties-heading {
          min-height: 72px;
          padding-top: 18px;
          padding-bottom: 14px;
          border-bottom-color: #E8EBF1;
        }
        .homepage-editor__layer-scroll {
          padding: 13px 10px 30px;
        }
        .homepage-editor__layer-frame {
          border-color: #E3E8F0;
          background: #FAFBFE;
        }
        .homepage-editor__layer-item {
          margin-bottom: 5px;
          border-radius: 6px;
        }
        .homepage-editor__layer-item:hover { background: #F4F6FA; }
        .homepage-editor__properties,
        .homepage-editor__inspector {
          min-width: 0;
          border-left: 0;
          background: rgba(255, 255, 255, .98);
        }
        .homepage-editor__properties-scroll,
        .homepage-editor__inspector-scroll {
          padding: 14px 18px 32px;
        }
        .homepage-editor__properties-empty-state {
          min-height: 280px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 9px;
          padding: 28px;
          color: #8B95A6;
          text-align: center;
        }
        .homepage-editor__properties-empty-state > .anticon {
          margin-bottom: 3px;
          color: #B8944E;
          font-size: 34px;
          opacity: .82;
        }
        .homepage-editor__properties-empty-state strong { color: #4B5565; font-size: 13px; }
        .homepage-editor__properties-empty-state span { max-width: 260px; font-size: 12px; line-height: 1.7; }

        /* 页面图层改为独立模块卡片：与画布内容一一对应，拖拽排序更直观。 */
        .homepage-editor__layer-rail {
          background: #FFFFFF;
        }
        .homepage-editor__layer-heading {
          padding: 18px 14px 14px;
        }
        .homepage-editor__layer-heading span { font-size: 15px; color: #252B3A; }
        .homepage-editor__layer-heading small { color: #8B94A5; }
        .homepage-editor__layer-scroll {
          padding: 14px 12px 30px;
          background: #FBFCFF;
        }
        .homepage-editor__layer-group-label {
          display: block;
          margin: 0 2px 7px;
          color: #98A2B3;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: .08em;
        }
        .homepage-editor__layer-global + .homepage-editor__layer-group-label {
          margin-top: 3px;
        }
        .homepage-editor__layer-frame {
          display: block;
          margin-bottom: 14px;
          padding: 0;
          border: 0;
          border-radius: 0;
          background: transparent;
          box-shadow: none;
        }
        .homepage-editor__layer-frame button {
          min-height: 54px;
          padding: 9px 10px;
          border-color: #E3E8F1;
          border-radius: 7px;
          color: #3A4659;
          background: #FFFFFF;
          box-shadow: 0 2px 6px rgba(38, 56, 86, .025);
        }
        .homepage-editor__layer-frame button .anticon { color: #8694AA; }
        .homepage-editor__layer-frame button small { color: #8D98AA; }
        .homepage-editor__layer-frame button:hover,
        .homepage-editor__layer-frame button[aria-pressed="true"] {
          border-color: #4D68F7;
          color: #3F59E4;
          background: #F4F6FF;
          box-shadow: 0 0 0 2px rgba(77, 104, 247, .10);
        }
        .homepage-editor__layer-item {
          position: relative;
          min-height: 46px;
          margin-bottom: 9px;
          padding: 0;
          overflow: visible;
          border: 1px solid #E3E8F1;
          border-radius: 7px;
          color: #39465B;
          background: #FFFFFF;
          box-shadow: 0 2px 6px rgba(38, 56, 86, .025);
          transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease;
        }
        .homepage-editor__layer-item:hover {
          border-color: #BFC9F9;
          background: #FFFFFF;
          box-shadow: 0 5px 13px rgba(54, 77, 136, .09);
          transform: translateY(-1px);
        }
        .homepage-editor__layer-item.is-active {
          border-color: #4D68F7;
          color: #3048CD;
          background: #F8F9FF;
          box-shadow: 0 0 0 2px rgba(77, 104, 247, .11), 0 5px 14px rgba(54, 77, 136, .08);
        }
        .homepage-editor__layer-item.is-drop-target {
          border-color: #4D68F7;
          background: #F4F6FF;
          box-shadow: inset 0 3px 0 #4D68F7;
        }
        .homepage-editor__layer-select {
          width: 100%;
          min-height: 46px;
          gap: 8px;
          padding: 0 10px;
          font-size: 12px;
        }
        .homepage-editor__layer-order {
          min-width: 20px;
          color: #9AA4B5;
          font-size: 10px;
        }
        .homepage-editor__layer-select > span:last-child {
          order: 2;
          min-width: 0;
          flex: 1;
          color: #3A4659;
          font-weight: 500;
        }
        .homepage-editor__layer-select > .anticon {
          order: 3;
          margin-left: auto;
          color: #A2ACBC;
          font-size: 14px;
          cursor: grab;
        }
        .homepage-editor__layer-item.is-active .homepage-editor__layer-select > span:last-child { color: #3048CD; }
        .homepage-editor__layer-item.is-active .homepage-editor__layer-select > .anticon { color: #4D68F7; }
        .homepage-editor__layer-actions {
          position: absolute;
          z-index: 2;
          top: calc(100% + 5px);
          right: 6px;
          display: none;
          padding: 3px;
          border: 1px solid #DEE5F1;
          border-radius: 6px;
          background: #FFFFFF;
          box-shadow: 0 8px 18px rgba(46, 63, 91, .14);
        }
        .homepage-editor__layer-item:hover .homepage-editor__layer-actions,
        .homepage-editor__layer-item.is-active .homepage-editor__layer-actions,
        .homepage-editor__layer-actions:focus-within { display: inline-flex; }
        .homepage-editor__layer-actions button {
          color: #718096;
        }
        .homepage-editor__layer-actions button:hover:not(:disabled),
        .homepage-editor__layer-actions button:focus-visible {
          color: #3F59E4;
          background: #EEF1FF;
        }

        /* 参考图比例：无标题的窄排序列，首张为固定导航栏。 */
        .homepage-editor__layer-scroll {
          padding: 24px 46px 32px;
          background: #FFFFFF;
        }
        .homepage-editor__layer-frame {
          margin: 0 0 11px;
        }
        .homepage-editor__layer-frame button {
          min-height: 37px;
          display: flex;
          align-items: center;
          width: 100%;
          padding: 0 12px;
          border-color: #E8EBF2;
          border-radius: 4px;
          box-shadow: none;
        }
        .homepage-editor__layer-frame button span {
          font-size: 12px;
          font-weight: 500;
        }
        .homepage-editor__layer-item {
          min-height: 37px;
          margin-bottom: 11px;
          border-color: #E8EBF2;
          border-radius: 4px;
          box-shadow: none;
          transition: border-color .16s ease, background .16s ease;
        }
        .homepage-editor__layer-item:hover {
          box-shadow: none;
          transform: none;
        }
        .homepage-editor__layer-item.is-active {
          background: #F5F7FF;
          box-shadow: none;
        }
        .homepage-editor__layer-select {
          min-height: 37px;
          padding: 0 12px;
        }
        .homepage-editor__layer-select > .anticon {
          font-size: 13px;
        }
        .homepage-editor__layer-select > span {
          min-width: 0;
          flex: 1 1 auto;
        }
        .homepage-editor__layer-select > .anticon {
          flex: 0 0 auto;
          margin-left: auto !important;
        }
        .homepage-editor__layer-actions { display: none !important; }

        /* 重新设计：让图层列成为可读的页面结构导航，而不是悬空的小卡片堆。 */
        .homepage-editor__body {
          grid-template-columns: 260px minmax(420px, 1fr) 200px 558px;
        }
        .homepage-editor__layer-rail {
          border-left: 1px solid #E7EAF0;
          border-right: 1px solid #E7EAF0;
          background: #F7F8FB;
        }
        .homepage-editor__layer-scroll {
          padding: 22px 18px 36px;
          background:
            linear-gradient(180deg, #FAFBFD 0%, #F6F7FA 100%);
        }
        .homepage-editor__layer-frame {
          margin: 0 0 12px;
        }
        .homepage-editor__layer-frame button,
        .homepage-editor__layer-item {
          box-sizing: border-box;
          width: 100%;
          min-height: 44px;
          border-radius: 8px;
        }
        .homepage-editor__layer-frame button {
          position: relative;
          padding: 0 14px 0 17px;
          border-color: #E6DDCB;
          color: #5D4C35;
          background: #FFFEFB;
          box-shadow: 0 1px 2px rgba(73, 56, 30, .035);
        }
        .homepage-editor__layer-frame button::before {
          position: absolute;
          top: 12px;
          bottom: 12px;
          left: 0;
          width: 3px;
          border-radius: 0 3px 3px 0;
          background: #B8944E;
          content: "";
        }
        .homepage-editor__layer-frame button:hover,
        .homepage-editor__layer-frame button[aria-pressed="true"] {
          border-color: #D4C09A;
          color: #614514;
          background: #FFFCF6;
          box-shadow: 0 0 0 2px rgba(184, 148, 78, .10);
        }
        .homepage-editor__layer-frame button span {
          color: inherit;
          font-weight: 600;
          letter-spacing: .01em;
        }
        .homepage-editor__layer-item {
          min-height: 44px;
          margin-bottom: 10px;
          border-color: #E4E8F0;
          background: #FFFFFF;
          box-shadow: 0 1px 2px rgba(40, 51, 70, .025);
        }
        .homepage-editor__layer-item:hover {
          border-color: #C8D1E7;
          background: #FFFFFF;
          box-shadow: 0 4px 10px rgba(45, 61, 93, .06);
        }
        .homepage-editor__layer-item.is-active {
          border-color: #4D68F7;
          background: #F5F7FF;
          box-shadow: 0 0 0 2px rgba(77, 104, 247, .10);
        }
        .homepage-editor__layer-select {
          position: relative;
          min-height: 42px;
          padding: 0 52px 0 15px;
        }
        .homepage-editor__layer-select > span {
          color: #3C485B;
          font-weight: 500;
          letter-spacing: .01em;
        }
        .homepage-editor__layer-select > .anticon {
          position: absolute;
          top: 50%;
          right: 13px;
          width: 24px;
          height: 24px;
          display: inline-grid;
          place-items: center;
          margin: 0 !important;
          border-radius: 5px;
          color: #98A4B7;
          background: transparent;
          font-size: 14px;
          transition: color .16s ease, background .16s ease;
          transform: translateY(-50%);
        }
        .homepage-editor__layer-item:hover .homepage-editor__layer-select > .anticon {
          color: #687792;
          background: #F2F4F8;
        }
        .homepage-editor__layer-item.is-active .homepage-editor__layer-select > span { color: #3048CD; }
        .homepage-editor__layer-item.is-active .homepage-editor__layer-select > .anticon {
          color: #4D68F7;
          background: #EAEEFF;
        }
        @media (max-width: 1500px) {
          .homepage-editor__body,
          .homepage-editor__body.is-inspecting {
            grid-template-columns: 240px minmax(360px, 1fr) 200px 474px;
          }
          .homepage-editor__body.is-inspecting .homepage-editor__library { display: flex; }
          .homepage-editor__body.is-inspecting .homepage-editor__right-workspace { display: contents; }
        }
        @media (max-width: 1200px) {
          .homepage-editor__body,
          .homepage-editor__body.is-inspecting {
            grid-template-columns: 212px minmax(300px, 1fr) 200px 368px;
          }
          .homepage-editor__body.is-inspecting .homepage-editor__layer-scroll { padding-inline: 14px; }
        }
        @media (max-width: 980px) {
          .homepage-editor__body,
          .homepage-editor__body.is-inspecting {
            grid-template-columns: 180px minmax(260px, 1fr) 90px minmax(272px, 316px);
          }
          .homepage-editor__body.is-inspecting .homepage-editor__right-workspace { display: contents; }
          .homepage-editor__library-tools { padding-inline: 9px; }
          .homepage-editor__stage { padding-inline: 18px; }
          .homepage-editor__layer-scroll,
          .homepage-editor__body.is-inspecting .homepage-editor__layer-scroll { padding-inline: 8px; }
          .homepage-editor__layer-select { padding-inline: 9px; }
          .homepage-editor__layer-select > .anticon { display: none; }
          .homepage-editor__properties-scroll,
          .homepage-editor__inspector-scroll { padding-inline: 12px; }
        }

        /* 右侧控制区：模块列表与设置共用一个工作台，仅以轻量分隔线区分职责。 */
        .homepage-editor__body,
        .homepage-editor__body.is-inspecting {
          grid-template-columns: 260px minmax(420px, 1fr) minmax(0, 758px);
        }
        .homepage-editor__right-workspace,
        .homepage-editor__body.is-inspecting .homepage-editor__right-workspace {
          width: auto;
          min-width: 0;
          display: grid;
          grid-template-columns: 200px minmax(0, 1fr);
          overflow: hidden;
          border-left: 1px solid #E7EAF0;
          background: #FFFFFF;
          box-shadow: none;
          transition: none;
        }
        .homepage-editor__layer-rail {
          border-left: 0;
          border-right-color: #ECEEF2;
          background: #FFFFFF;
        }
        .homepage-editor__layer-scroll {
          padding: 18px 12px 28px;
          background: #FFFFFF;
        }
        .homepage-editor__layer-frame {
          margin-bottom: 10px;
        }
        .homepage-editor__layer-frame button,
        .homepage-editor__layer-item {
          min-height: 42px;
          margin-bottom: 3px;
          border-color: transparent;
          border-radius: 6px;
          background: transparent;
          box-shadow: none;
        }
        .homepage-editor__layer-frame button {
          padding-inline: 12px;
          color: #4D596B;
        }
        .homepage-editor__layer-item:hover,
        .homepage-editor__layer-frame button:hover,
        .homepage-editor__layer-frame button[aria-pressed="true"] {
          border-color: transparent;
          color: #3F59E4;
          background: #F5F7FC;
          box-shadow: none;
          transform: none;
        }
        .homepage-editor__layer-item.is-active {
          border-color: #DCE3FF;
          color: #3048CD;
          background: #F3F5FF;
          box-shadow: inset 3px 0 0 #4D68F7;
        }
        .homepage-editor__layer-select {
          min-height: 42px;
          padding-inline: 12px 10px;
        }
        .homepage-editor__properties,
        .homepage-editor__inspector {
          background: #FFFFFF;
        }
        .homepage-editor__properties-heading,
        .homepage-editor__inspector-header {
          border-bottom-color: #ECEEF2;
        }
        @media (max-width: 1500px) {
          .homepage-editor__body,
          .homepage-editor__body.is-inspecting {
            grid-template-columns: 240px minmax(360px, 1fr) minmax(0, 674px);
          }
        }
        @media (max-width: 1200px) {
          .homepage-editor__body,
          .homepage-editor__body.is-inspecting {
            grid-template-columns: 212px minmax(300px, 1fr) minmax(0, 568px);
          }
        }
        @media (max-width: 980px) {
          .homepage-editor__body,
          .homepage-editor__body.is-inspecting {
            grid-template-columns: 180px minmax(260px, 1fr) minmax(0, 362px);
          }
          .homepage-editor__right-workspace,
          .homepage-editor__body.is-inspecting .homepage-editor__right-workspace {
            grid-template-columns: 90px minmax(272px, 1fr);
          }
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
          <Button type="primary" onClick={() => {
            setInitialLoading(true);
            setLoadError(null);
            setLoadAttempt((attempt) => attempt + 1);
          }}>
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
          <CanvasPageDataSynchronizer data={data} pageKey={pageKey} />
          <EditorToolbar
              pageKey={pageKey}
              lastSaved={lastSaved}
              publishing={publishing}
              hasUnsavedChanges={hasUnsavedChanges}
              autoSaveState={autoSaveState}
              onPublish={publishHome}
              onOpenRevisions={openRevisions}
              onOpenPageSettings={() => setPageSettingsOpen(true)}
              onDataChange={trackEditorData}
              onPreview={previewDraft}
            onPageChange={(nextPageKey) => void switchEditorPage(getEditorPage(nextPageKey).publicPath)}
          />
          <EditorBody
              onSaveAsTemplate={saveBlockAsTemplate}
              pageLabel={getEditorPage(pageKey).label}
            saving={saving}
            onSaveDraft={saveDraft}
          />
        </Puck>
      )}
    </div>
  );
}
