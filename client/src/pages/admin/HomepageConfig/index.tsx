import {
  cloneElement,
  isValidElement,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
  type CSSProperties,
  type DragEvent,
  type ReactNode,
} from "react";
import { App as AntdApp, Button, Spin } from "antd";
import {
  AppstoreOutlined,
  BlockOutlined,
  ControlOutlined,
  EyeOutlined,
  ExclamationCircleOutlined,
} from "@ant-design/icons";
import { Puck, useGetPuck, type Data, type PuckAction, type UiState } from "@puckeditor/core";
import { useAuthStore } from "@/store/authStore";
import "@puckeditor/core/no-external.css";
import { puckConfig } from "@/page-builder/config/puckConfig";
import { BusinessRegionCanvasProvider } from "@/page-builder/adapters/businessRegion.puck";
import {
  BLOCK_META,
  isContentTemplateInsertable,
} from "@/page-builder/config/blockMeta";
import { type SystemContentTemplateCurrent } from "@/services/api";
import {
  RESPONSIVE_CANVAS,
  isMobileCanvasWidth,
} from "@/page-builder/config/blockContracts";
import StorefrontNavigation from "@/components/layout/StorefrontNavigation";
import StorefrontFooter from "@/components/layout/StorefrontFooter";
import {
  PublicSiteSettingsProvider,
  usePublicSiteSettings,
  usePublicSiteSettingsResource,
} from "@/hooks/usePublicSiteSettings";
import SchemaInspectorPanel from "@/page-builder/inspector/SchemaInspectorPanel";
import InspectorFooterBar from "@/page-builder/inspector/InspectorFooterBar";
import type {
  PagePublishIssueTarget,
  PublishValidationIssue,
  PublishValidationStatus,
} from "@/page-builder/inspector/publishValidation";
import {
  getPagePublishIssueKey,
  resolvePagePublishIssueTarget,
} from "@/page-builder/inspector/publishValidation";
import { getInspectorSchema } from "@/page-builder/inspector/schema/registry";
import {
  getEditorPage,
  resolvePageHeaderMode,
  type EditorPageKey,
} from "@/page-builder/config/editorPages";
import {
  CONTENT_TEMPLATE_BY_MODULE_TYPE,
  createContentTemplateMarker,
  getContentTemplatePageRule,
  isContentTemplateAllowedForPage,
  sanitizeContentTemplateLayoutData,
} from "@/page-builder/generated/contentTemplates.generated";
import { isVisualRecord } from "@/page-builder/runtime/visualLayout";
import { isVisiblePrimaryStageBlockInDocument } from "@/page-builder/utils/primaryStagePolicy";
import {
  MissingMediaState,
  normalizeLegacyRenderColors,
  useHasMissingAssets,
} from "@/page-builder/runtime/renderParity";
import {
  CANVAS_DYNAMIC_LAYOUT_EDIT_MESSAGE,
  CANVAS_SHARED_VISUAL_PREVIEW_MESSAGE,
  CANVAS_VISUAL_EDIT_MESSAGE,
  type CanvasDynamicLayoutEditMessage,
  type CanvasVisualEditMessage,
  useVisualEditorSession,
} from "@/page-builder/visual-editor/visualEditorSession";
import { UnifiedTemplateLibrary } from "@/page-builder/template-editor/TemplateEditorLibrary";
import { getSystemTemplatePublicationBlockReason } from "@/page-builder/template-editor/templatePublicationStatus";
import WorkspaceCanvasControls from "@/page-builder/template-editor/WorkspaceCanvasControls";
import { useTemplateWorkspaceController } from "@/page-builder/template-editor/TemplateWorkspaceController";
import { USE_MOCK } from "@/services/mockData";
import {
  getEffectiveDynamicTemplateInstanceEditPolicy,
  type TemplateDefinitionV2,
} from "@/page-builder/template-definition";
import {
  DYNAMIC_TEMPLATE_BLOCK_TYPE,
  DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY,
  DynamicTemplateInstanceView,
  createDynamicTemplateInstanceProps,
  dynamicTemplateVersionKey,
  planDynamicTemplateDocumentUpgrade,
  readResolvedDynamicTemplateDefinitions,
  registerResolvedDynamicTemplate,
  useResolvedDynamicTemplateDefinitions,
  type DynamicTemplateInstanceProps,
  type DynamicTemplateDocumentUpgradePlan,
  type ResolvedDynamicTemplateDefinitionMap,
} from "@/page-builder/dynamic-template-instance";
import DynamicTemplateInstanceInspector from "@/page-builder/dynamic-template-instance/DynamicTemplateInstanceInspector";
import { DynamicTemplateUpgradeReviewModal } from "@/page-builder/dynamic-template-instance/DynamicTemplateUpgradePanel";
import type { PromoteDynamicTemplateInstanceRequest } from "@/page-builder/dynamic-template-instance/promoteToTemplate";
import type { PublishedDynamicTemplateResource } from "@/services/clients/dynamicTemplateClient";
import type { EditorWorkspaceMode } from "@/page-builder/template-editor/types";
import {
  countUpgradeableSystemTemplateInstances,
  upgradeSystemTemplateInstances,
} from "@/page-builder/templates/templateOrigin";
import WorkspacePanelHeader from "@/page-builder/workspace/WorkspacePanelHeader";
import WorkspacePanelCollapseButton from "@/page-builder/workspace/WorkspacePanelCollapseButton";
import useCompactWorkspaceOverlay from "@/page-builder/workspace/useCompactWorkspaceOverlay";
import "./editor.css";
import EditorToolbar, { VIEWPORT_PRESETS } from "./components/EditorToolbar";
import UnsavedChangesGuard from "./components/UnsavedChangesGuard";
import { usePageWorkspaceController } from "./PageWorkspaceController";
import LayerRail from "./components/LayerRail";
import CanvasSelectionDock, {
  CanvasSelectionOverlay,
} from "./components/CanvasSelectionDock";
import RevisionDrawer from "./components/RevisionDrawer";
import PageSettingsDrawer from "./components/PageSettingsDrawer";
import CanvasBlockInteractionBoundary from "./components/CanvasBlockInteractionBoundary";
import PagePublishCheckPanel from "./components/PagePublishCheckPanel";
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
  type CanvasFocusMessage,
  type CanvasHeightMessage,
  type CanvasNavigationMessage,
  type CanvasNavigationStateMessage,
  type CanvasPageNavigationMessage,
  type PageEditorHistoryCommand,
} from "./editor-store";

// 模板编辑器只在运营者主动切换到模板模式后下载；页面编辑首开不承担其结构树、
// 版本面板和母模板画布成本。
const TemplateWorkspace = lazy(
  () => import("@/page-builder/template-editor/TemplateWorkspace"),
);
import type { PuckDocument, PuckProps } from "@/page-builder/types";

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

type CanvasComponentConfig = {
  label?: string;
  render: (props: PuckProps) => ReactNode;
  [key: string]: unknown;
};

function CanvasDynamicTemplateInstance({
  props,
  definition,
  mode,
}: {
  props: DynamicTemplateInstanceProps;
  definition?: TemplateDefinitionV2;
  mode: "editor" | "preview";
}) {
  const currentViewport = useHomepagePuck(
    (state) => state.appState.ui.viewports.current,
  );
  const device = isMobileCanvasWidth(currentViewport.width)
    ? "mobile"
    : "desktop";

  return (
    <DynamicTemplateInstanceView
      props={props}
      definition={definition}
      deviceOverride={device}
      mode={mode}
    />
  );
}

/**
 * 脏标记比较签名:只取 content 的规范化形态(忽略 block id 与键序、不含 zones/ui)。
 * JSON 全等比较会让 Puck 首帧 normalize(补默认键/重排)被误判为用户修改,
 * 导致每次进入编辑器都显示"有未保存修改"并触发离开拦截(2026-08-18 实测修复)。
 */
function createBlockContent(type: string): {
  type: string;
  props: PuckProps;
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
  block: { type: string; props: PuckProps },
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
  editable,
}: {
  children: ReactNode;
  pageKey: EditorPageKey;
  editable: boolean;
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
      data-canvas-editable={editable ? "true" : "false"}
      data-page-header-mode={headerMode}
      style={
        {
          "--homepage-editor-preview-height": `${previewViewportHeight}px`,
        } as CSSProperties
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
  blockProps: PuckProps;
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

    // 页面装修画布只建立模块上下文；任何旧的图片、文字或业务对象选择
    // 都必须在显示该模板完整属性面板前清除。
    useVisualEditorSession.getState().clearNode();

    setIsFocused(true);
    if (clearFocusTimer.current)
      frameWindow.clearTimeout(clearFocusTimer.current);
    clearFocusTimer.current = frameWindow.setTimeout(
      () => setIsFocused(false),
      1800,
    );

    if (selectedBlockId === blockId) return;

    const blockIndex = Array.from(
      puckBlock.ownerDocument.querySelectorAll<HTMLElement>(
        "[data-puck-component]",
      ),
    ).indexOf(puckBlock);
    // 模块选择等当前 pointerdown 收尾后落位，避免 Puck 在缩放 iframe 中
    // 按未缩放坐标重复滚动；内部对象上下文已在上方清除。
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
  historyCommand,
  onHistoryCommandCommitted,
}: {
  data: PuckDocument;
  pageKey: EditorPageKey;
  canvasDataSyncVersion: number;
  historyCommand: PageEditorHistoryCommand | null;
  onHistoryCommandCommitted: (commandId: string, historyIndex: number) => void;
}) {
  const getPuck = useGetPuck();
  const dispatch = useHomepagePuck((state) => state.dispatch);
  const currentData = useHomepagePuck((state) => state.appState.data);
  const appliedSignatureRef = useRef<string | null>(null);
  const appliedPageKeyRef = useRef(pageKey);
  const mountedWithInitialDataRef = useRef(false);
  const consumedCanvasDataSyncVersionRef = useRef(canvasDataSyncVersion);
  const consumedHistoryCommandIdRef = useRef<string | null>(null);
  const dataSignature = useMemo(() => JSON.stringify(data), [data]);
  const currentDataSignature = useMemo(
    () => JSON.stringify(currentData),
    [currentData],
  );

  useEffect(() => {
    const signature = `${pageKey}:${dataSignature}`;
    const isSamePage = appliedPageKeyRef.current === pageKey;
    appliedPageKeyRef.current = pageKey;
    // Puck 0.22.4 在 Provider 挂载时已经读取 data 并完成 walkAppState 归一化。
    // 归一化后的 store 与原始 data JSON 不同并不代表页面发生了外部切换；
    // 首帧再次 setData 只会重复整树遍历。后续切页、恢复版本等 data 变化
    // 仍由下方同步逻辑完成必要的整页替换。
    if (!mountedWithInitialDataRef.current) {
      mountedWithInitialDataRef.current = true;
      appliedSignatureRef.current = signature;
      return;
    }
    if (
      historyCommand
      && consumedHistoryCommandIdRef.current !== historyCommand.id
    ) {
      consumedHistoryCommandIdRef.current = historyCommand.id;
      const puck = getPuck();
      const historyIndex = puck.history.histories.slice(0, puck.history.index + 1).length;
      const historyData = {
        ...puck.appState.data,
        ...data,
        content: data.content ?? [],
        zones: data.zones ?? {},
        root: data.root ?? puck.appState.data.root,
      } as Data;
      dispatch({
        type: "setData",
        data: (currentData) => ({ ...currentData, ...historyData }),
        recordHistory: true,
      });
      dispatch({ type: "setUi", ui: { itemSelector: null }, recordHistory: false });
      appliedSignatureRef.current = signature;
      onHistoryCommandCommitted(historyCommand.id, historyIndex);
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
    if (currentDataSignature === dataSignature) {
      if (!isSamePage) {
        dispatch({ type: "setUi", ui: { itemSelector: null }, recordHistory: false });
      }
      return;
    }
    const puck = getPuck();
    const currentSelector = puck.appState.ui.itemSelector;
    const selectedBlock = currentSelector
      ? puck.appState.data.content[currentSelector.index]
      : undefined;
    const selectedBlockId = typeof selectedBlock?.props?.id === "string"
      ? selectedBlock.props.id
      : null;
    const stableIndex = isSamePage && selectedBlockId
      ? (data.content ?? []).findIndex((block) => block.props?.id === selectedBlockId)
      : -1;
    dispatch({ type: "setData", data: data as Partial<Data>, recordHistory: false });
    dispatch({
      type: "setUi",
      ui: {
        itemSelector: stableIndex >= 0
          ? { index: stableIndex, zone: currentSelector?.zone ?? ROOT_ZONE }
          : null,
      },
      recordHistory: false,
    });
  }, [canvasDataSyncVersion, currentDataSignature, data, dataSignature, dispatch, getPuck, historyCommand, onHistoryCommandCommitted, pageKey]);

  return null;
}

/**
 * 模块卡片不使用真实商品素材，而用“布局微缩图”展示该区块插入后的结构。
 * 这让用户先理解版式和内容层级，再决定是否添加。
 */
function getPageTemplateUpgradeRuleBlockers(
  pageKey: EditorPageKey,
  document: Record<string, unknown>,
  resolvedDefinitions?: ResolvedDynamicTemplateDefinitionMap,
) {
  const blockers: string[] = [];
  const rule = getContentTemplatePageRule(pageKey);
  if (!rule) return ["当前页面缺少页面规则。"];
  if (
    rule.contentPlacement === "root-only"
    && document.zones
    && typeof document.zones === "object"
    && !Array.isArray(document.zones)
    && Object.values(document.zones as Record<string, unknown>)
      .some((blocks) => Array.isArray(blocks) && blocks.length > 0)
  ) {
    blockers.push("当前页面不符合根内容位置规则。");
  }
  const availableDefinitions = {
    ...(resolvedDefinitions ?? {}),
    ...readResolvedDynamicTemplateDefinitions(
      document[DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY],
    ),
  };
  const documentForPolicies = {
    ...document,
    [DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY]: availableDefinitions,
  };
  const visibleContent = (Array.isArray(document.content) ? document.content : [])
    .filter((block) => {
      if (!block || typeof block !== "object" || Array.isArray(block)) return false;
      const props = (block as Record<string, unknown>).props;
      return !props
        || typeof props !== "object"
        || Array.isArray(props)
        || (props as Record<string, unknown>).isVisible !== false;
    });
  const primaryStageIndexes = visibleContent
    .map((block, index) => (
      isVisiblePrimaryStageBlockInDocument(block, documentForPolicies) ? index : -1
    ))
    .filter((index) => index >= 0);
  if (primaryStageIndexes.length > 0 && primaryStageIndexes[0] !== 0) {
    blockers.push("主舞台实例必须是首个可见品牌内容区。");
  }
  if (rule.headerMode.configured === "overlay-light") {
    const first = visibleContent[0];
    const firstRecord = first && typeof first === "object" && !Array.isArray(first)
      ? first as Record<string, unknown>
      : undefined;
    const fixed = typeof firstRecord?.type === "string"
      ? CONTENT_TEMPLATE_BY_MODULE_TYPE[firstRecord.type]
      : undefined;
    let overlayLightCompatible = fixed?.key === rule.headerMode.overlayRequiresFirstTemplate;
    if (firstRecord?.type === DYNAMIC_TEMPLATE_BLOCK_TYPE) {
      const props = firstRecord.props && typeof firstRecord.props === "object" && !Array.isArray(firstRecord.props)
        ? firstRecord.props as Record<string, unknown>
        : undefined;
      const templateId = typeof props?.templateId === "string" ? props.templateId : "";
      const templateVersion = Number(props?.templateVersion);
      const resolved = availableDefinitions[dynamicTemplateVersionKey(templateId, templateVersion)];
      overlayLightCompatible = Boolean(
        resolved?.definition.metadata.headerCompatibility?.includes("overlay-light"),
      );
    }
    if (!overlayLightCompatible) {
      blockers.push("首个可见品牌模块不兼容当前页面的浅色覆盖导航。");
    }
  }
  return blockers;
}

function PageTemplateLibraryAdapter({
  active,
  pageKey,
  onTemplateDragStart,
  onTemplateDragEnd,
}: {
  active: boolean;
  pageKey: EditorPageKey;
  onTemplateDragStart: (label: string, insertAt: (insertionIndex: number) => void) => void;
  onTemplateDragEnd: () => void;
}) {
  const { message, modal } = AntdApp.useApp();
  const appData = useHomepagePuck((state) => state.appState.data);
  const appDataRef = useRef(appData);
  appDataRef.current = appData;
  const resolvedDynamicTemplateDefinitions = useResolvedDynamicTemplateDefinitions();
  const dispatch = useHomepagePuck((state) => state.dispatch);
  const [dynamicUpgradeReview, setDynamicUpgradeReview] = useState<{
    template: PublishedDynamicTemplateResource;
    plan: DynamicTemplateDocumentUpgradePlan<Record<string, unknown>>;
  } | null>(null);
  const currentViewport = useHomepagePuck((state) => state.appState.ui.viewports.current);
  const previewViewport = typeof currentViewport.width === "number" && currentViewport.width <= 480
    ? "mobile"
    : "desktop";
  const getPublishedUpgradePlan = useCallback((template: PublishedDynamicTemplateResource) => {
    const currentRuleBlockers = getPageTemplateUpgradeRuleBlockers(
      pageKey,
      appData as unknown as Record<string, unknown>,
      resolvedDynamicTemplateDefinitions,
    );
    if (currentRuleBlockers.length > 0) {
      return {
        document: appData as unknown as Record<string, unknown>,
        upgradedCount: 0,
        blockers: currentRuleBlockers,
        instancePlans: [],
        pendingRequiredSlots: [],
        destructiveBlockers: [],
      };
    }
    const plan = planDynamicTemplateDocumentUpgrade({
      document: appData as unknown as Record<string, unknown>,
      resolvedDefinitions: resolvedDynamicTemplateDefinitions,
      target: {
        templateId: template.templateId,
        version: template.version,
        schemaVersion: template.schemaVersion,
        definitionChecksum: template.definitionChecksum,
        definition: template.definition,
        name: template.name,
      },
    });
    const nextRuleBlockers = plan.upgradedCount > 0
      ? getPageTemplateUpgradeRuleBlockers(
          pageKey,
          plan.document,
          resolvedDynamicTemplateDefinitions,
        )
      : [];
    if (nextRuleBlockers.length > 0) {
      return {
        document: appData as unknown as Record<string, unknown>,
        upgradedCount: 0,
        blockers: nextRuleBlockers,
        instancePlans: [],
        pendingRequiredSlots: [],
        destructiveBlockers: [],
      };
    }
    return plan;
  }, [appData, pageKey, resolvedDynamicTemplateDefinitions]);

  const upgradePublishedDynamicTemplateInPage = useCallback((
    template: PublishedDynamicTemplateResource,
  ) => {
    const plan = getPublishedUpgradePlan(template);
    if (plan.instancePlans.length === 0) return;
    setDynamicUpgradeReview({ template, plan });
  }, [getPublishedUpgradePlan]);

  const confirmPublishedDynamicTemplateUpgrade = useCallback(() => {
    if (!dynamicUpgradeReview || dynamicUpgradeReview.plan.upgradedCount === 0) return;
    const { template, plan } = dynamicUpgradeReview;
    registerResolvedDynamicTemplate({
      templateId: template.templateId,
      version: template.version,
      schemaVersion: template.schemaVersion,
      definitionChecksum: template.definitionChecksum,
      definition: template.definition,
    });
    dispatch({
      type: "setData",
      data: plan.document as typeof appData,
      recordHistory: true,
    });
    const firstPendingPlan = plan.instancePlans.find((item) => item.analysis.pendingRequiredSlots.length > 0);
    if (firstPendingPlan) {
      const content = Array.isArray(plan.document.content) ? plan.document.content : [];
      const index = content.findIndex((block) => {
        if (!block || typeof block !== "object" || Array.isArray(block)) return false;
        const props = (block as Record<string, unknown>).props;
        return Boolean(props && typeof props === "object" && !Array.isArray(props)
          && (props as Record<string, unknown>).id === firstPendingPlan.blockId);
      });
      if (index >= 0) {
        dispatch({ type: "setUi", ui: { itemSelector: { index, zone: ROOT_ZONE } } });
      }
      const firstPending = firstPendingPlan.analysis.pendingRequiredSlots[0];
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const field = document.querySelector<HTMLElement>(
          `[data-slot-id="${CSS.escape(firstPending.slotId)}"]`,
        );
        const focusTarget = field?.querySelector<HTMLElement>(
          "input, textarea, select, button, [tabindex]:not([tabindex='-1'])",
        );
        field?.scrollIntoView({ block: "center" });
        focusTarget?.focus();
      }));
    }
    setDynamicUpgradeReview(null);
    message.success(`已升级 ${plan.upgradedCount} 个模板实例；保存页面草稿后才会持久化`);
  }, [dispatch, dynamicUpgradeReview, message]);

  const insertPublishedDynamicTemplate = useCallback((
    template: PublishedDynamicTemplateResource,
    requestedInsertionIndex?: number,
  ) => {
    const currentDocument = appDataRef.current;
    const resolved = {
      templateId: template.templateId,
      version: template.version,
      schemaVersion: template.schemaVersion,
      definitionChecksum: template.definitionChecksum,
      definition: template.definition,
    };
    registerResolvedDynamicTemplate(resolved);
    const key = dynamicTemplateVersionKey(template.templateId, template.version);
    const document = currentDocument as unknown as PuckDocument;
    const existingResolved = document[DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY];
    const resolvedMap = existingResolved && typeof existingResolved === "object" && !Array.isArray(existingResolved)
      ? existingResolved as ResolvedDynamicTemplateDefinitionMap
      : {};
    const content = currentDocument.content ?? [];
    const insertionIndex = Math.min(
      content.length,
      Math.max(0, requestedInsertionIndex ?? content.length),
    );
    const instance = {
      type: DYNAMIC_TEMPLATE_BLOCK_TYPE,
      props: createDynamicTemplateInstanceProps({
        templateId: template.templateId,
        version: template.version,
        name: template.name,
      }),
    };
    dispatch({
      type: "setData",
      data: {
        ...currentDocument,
        [DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY]: {
          ...resolvedMap,
          [key]: resolved,
        },
        content: [
          ...content.slice(0, insertionIndex),
          instance,
          ...content.slice(insertionIndex),
        ],
      } as typeof currentDocument,
      recordHistory: true,
    });
    dispatch({
      type: "setUi",
      ui: { itemSelector: { index: insertionIndex, zone: ROOT_ZONE } },
    });
    message.success(`已添加“${template.name}”v${template.version}，可在右侧填写页面内容`);
  }, [dispatch, message]);

  return (
    <>
    <UnifiedTemplateLibrary
      mode="page"
      active={active}
      device={previewViewport}
      isPublishedTemplateAllowed={() => true}
      onInsertPublished={insertPublishedDynamicTemplate}
      onPublishedDragStart={(template) => onTemplateDragStart(
        template.name,
        (insertionIndex) => insertPublishedDynamicTemplate(template, insertionIndex),
      )}
      onPublishedDragEnd={onTemplateDragEnd}
      getPublishedUpgradeCount={(template) => getPublishedUpgradePlan(template).instancePlans.length}
      onUpgradePublished={upgradePublishedDynamicTemplateInPage}
    />
    {dynamicUpgradeReview ? (
      <DynamicTemplateUpgradeReviewModal
        open
        title={`升级“${dynamicUpgradeReview.template.name}”模板实例`}
        plans={dynamicUpgradeReview.plan.instancePlans}
        onConfirm={confirmPublishedDynamicTemplateUpgrade}
        onCancel={() => setDynamicUpgradeReview(null)}
      />
    ) : null}
    </>
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
  validationStatus,
  onRetryValidation,
  onOpenPublishReview,
  onOpenPageSettings,
  canPromoteToTemplate,
  onPromoteToTemplate,
}: {
  hasUnsavedChanges: boolean;
  saving: boolean;
  onSaveDraft: () => void;
  publishIssues: PublishValidationIssue[];
  validationStatus: PublishValidationStatus;
  onRetryValidation: () => void;
  onOpenPublishReview: () => void;
  onOpenPageSettings: (field?: string) => void;
  canPromoteToTemplate: boolean;
  onPromoteToTemplate: (request: PromoteDynamicTemplateInstanceRequest) => void | Promise<void>;
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
            <Button type="text" onClick={() => onOpenPageSettings()}>
              页面展示设置
            </Button>
          </div>
        </div>
        <InspectorFooterBar
          hasUnsavedChanges={hasUnsavedChanges}
          saving={saving}
          errorCount={publishIssues.filter((issue) => issue.severity === "error").length}
          warningCount={publishIssues.filter((issue) => issue.severity === "warning").length}
          validationStatus={validationStatus}
          onRetryValidation={onRetryValidation}
          onReviewIssues={publishIssues.length > 0 ? onOpenPublishReview : undefined}
        />
      </section>
    );
  }

  // 内容组件与网站全局设置/业务功能区走统一 Schema 注册表。
  if (selectedItem.type === DYNAMIC_TEMPLATE_BLOCK_TYPE) {
    return (
      <DynamicTemplateInstanceInspector
        hasUnsavedChanges={hasUnsavedChanges}
        saving={saving}
        publishIssues={publishIssues}
        validationStatus={validationStatus}
        onRetryValidation={onRetryValidation}
        onOpenPublishReview={onOpenPublishReview}
        onOpenPageSettings={onOpenPageSettings}
        canPromoteToTemplate={canPromoteToTemplate}
        onPromoteToTemplate={onPromoteToTemplate}
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
        templateDesignEnabled={false}
        publishIssues={publishIssues}
        validationStatus={validationStatus}
        onRetryValidation={onRetryValidation}
        onOpenPublishReview={onOpenPublishReview}
        onOpenPageSettings={onOpenPageSettings}
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

function EditorBody({
  workspaceActive,
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
  publishReviewIssues,
  publishAttemptFailed,
  validationStatus,
  onRetryValidation,
  onRetryPublish,
  publishReviewActive,
  publishReviewOpen,
  publishReviewIssueKey,
  onOpenPublishReview,
  onClosePublishReview,
  onSelectPublishReviewIssue,
  onExitPreview,
  onOpenPageSettings,
  canPromoteToTemplate,
  onPromoteToTemplate,
}: {
  workspaceActive: boolean;
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
  publishReviewIssues: PublishValidationIssue[];
  publishAttemptFailed: boolean;
  validationStatus: PublishValidationStatus;
  onRetryValidation: () => void;
  onRetryPublish: (data: unknown) => void;
  publishReviewActive: boolean;
  publishReviewOpen: boolean;
  publishReviewIssueKey: string | null;
  onOpenPublishReview: () => void;
  onClosePublishReview: () => void;
  onSelectPublishReviewIssue: (key: string | null) => void;
  onExitPreview: () => void;
  onOpenPageSettings: (field?: string) => void;
  canPromoteToTemplate: boolean;
  onPromoteToTemplate: (
    request: PromoteDynamicTemplateInstanceRequest,
    viewport: { width: number; height: number },
  ) => void | Promise<void>;
}) {
  const { message } = AntdApp.useApp();
  const appData = useHomepagePuck((state) => state.appState.data);
  const resolvedDynamicTemplateDefinitions = useResolvedDynamicTemplateDefinitions();
  const appDataRef = useRef(appData);
  appDataRef.current = appData;
  const currentViewport = useHomepagePuck(
    (state) => state.appState.ui.viewports.current,
  );
  const viewports = useHomepagePuck((state) => state.appState.ui.viewports);
  const dispatch = useHomepagePuck((state) => state.dispatch);
  const selectedItem = useHomepagePuck((state) => state.selectedItem);
  const isInspecting = Boolean(selectedItem);
  const [draggingTemplate, setDraggingTemplate] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const draggingTemplateRef = useRef<{
    label: string;
    insertAt: (insertionIndex: number) => void;
  } | null>(null);
  const [canvasZoom, setCanvasZoom] = useState(1);
  const [canvasHeight, setCanvasHeight] = useState(0);
  const [navigationPreviewOpen, setNavigationPreviewOpen] = useState(false);
  // 画布滚动时定位到的当前模块下标（scroll-spy），仅用于左侧图层栏跟随滚动，不改变选中态。
  const [scrollSpyIndex, setScrollSpyIndex] = useState<number | null>(null);
  // 右侧属性面板手动收起（2026-08-16）：点选模块仍自动弹出(is-inspecting)，手动收起后保持收起
  const [inspectorCollapsed, setInspectorCollapsed] = useState(() => {
    try {
      if (window.matchMedia("(min-width: 1200px)").matches) return false;
      return (
        sessionStorage.getItem("homepage-editor-inspector-collapsed") === "1"
      );
    } catch {
      return false;
    }
  });
  const updateInspectorCollapsed = useCallback((collapsed: boolean) => {
    setInspectorCollapsed(collapsed);
    try {
      sessionStorage.setItem(
        "homepage-editor-inspector-collapsed",
        collapsed ? "1" : "0",
      );
    } catch {
      /* 偏好记忆失败不阻断收放 */
    }
  }, []);
  const openInspector = useCallback(() => updateInspectorCollapsed(false), [updateInspectorCollapsed]);
  const closeInspector = useCallback(() => updateInspectorCollapsed(true), [updateInspectorCollapsed]);
  const selectedItemLabel = selectedItem
    ? BLOCK_META[selectedItem.type]?.name ?? selectedItem.type
    : null;
  const inspectorOverlay = useCompactWorkspaceOverlay({
    open: !inspectorCollapsed,
    onOpen: openInspector,
    onClose: closeInspector,
  });
  const requestInspectorOpen = inspectorOverlay.requestOpen;
  const publishReviewRef = useRef<HTMLElement>(null);
  const publishReviewTargets = useMemo(() => publishReviewIssues
    .filter((issue) => issue.severity === "error")
    .map((issue) => resolvePagePublishIssueTarget(
      issue,
      appData,
      resolvedDynamicTemplateDefinitions,
    )), [appData, publishReviewIssues, resolvedDynamicTemplateDefinitions]);

  const focusReviewPanel = useCallback(() => {
    window.requestAnimationFrame(() => {
      publishReviewRef.current?.scrollIntoView({ block: "nearest" });
      publishReviewRef.current?.focus();
    });
  }, []);

  const publishReviewOpenedRef = useRef(false);
  useEffect(() => {
    if (!publishReviewActive || !publishReviewOpen) {
      publishReviewOpenedRef.current = false;
      return;
    }
    if (previewMode) onExitPreview();
    // 只在检查面板本次开启时主动聚焦；父级回调更新不能抢走已定位字段的焦点。
    if (publishReviewOpenedRef.current) return;
    publishReviewOpenedRef.current = true;
    requestInspectorOpen();
    focusReviewPanel();
  }, [focusReviewPanel, onExitPreview, previewMode, publishReviewActive, publishReviewOpen, requestInspectorOpen]);

  const closePublishReview = useCallback(() => {
    onClosePublishReview();
    if (inspectorOverlay.compact) closeInspector();
    window.requestAnimationFrame(() => {
      document.getElementById("homepage-page-publish-review-entry")?.focus();
    });
  }, [closeInspector, inspectorOverlay.compact, onClosePublishReview]);

  const locatePublishIssue = useCallback((target: PagePublishIssueTarget) => {
    onSelectPublishReviewIssue(target.key);
    document.querySelectorAll<HTMLElement>("[data-page-publish-located]").forEach((element) => {
      delete element.dataset.pagePublishLocated;
    });
    if (target.destination === "page-settings") {
      onOpenPageSettings(target.field);
      return;
    }
    if (target.destination === "retry-validation" || target.destination === "unavailable") {
      onRetryValidation();
      focusReviewPanel();
      return;
    }
    if (target.blockIndex === undefined) {
      focusReviewPanel();
      return;
    }

    if (previewMode) onExitPreview();
    dispatch({
      type: "setUi",
      ui: { itemSelector: { index: target.blockIndex, zone: target.zone } },
      recordHistory: false,
    });
    if (target.blockId) focusCanvasBlock(target.blockId);

    if (target.destination === "structure") {
      if (inspectorOverlay.compact) inspectorOverlay.requestClose();
      window.requestAnimationFrame(() => {
        setStructureCollapsed(false);
        window.requestAnimationFrame(() => {
          const layer = target.blockId
            ? document.querySelector<HTMLElement>(`[data-layer-id="${CSS.escape(target.blockId)}"]`)
            : null;
          const focusTarget = layer?.querySelector<HTMLElement>(".homepage-editor__layer-select") ?? layer;
          if (layer) layer.dataset.pagePublishLocated = "true";
          focusTarget?.scrollIntoView({ block: "nearest" });
          focusTarget?.focus();
        });
      });
      return;
    }

    if (target.device !== "shared") {
      const preset = VIEWPORT_PRESETS.find((candidate) => (
        target.device === "mobile"
          ? candidate.width === RESPONSIVE_CANVAS.mobile.width
          : candidate.width === RESPONSIVE_CANVAS.desktop.width
      ));
      if (preset) {
        dispatch({
          type: "setUi",
          ui: {
            viewports: {
              ...viewports,
              current: { width: preset.width, height: preset.height },
            },
          },
          recordHistory: false,
        });
      }
    }
    if (target.blockId && target.moduleType && target.objectId && target.objectKind) {
      const visualKind = target.objectKind === "video"
        ? "media"
        : target.objectKind === "collection"
          ? "structured"
          : target.objectKind;
      useVisualEditorSession.getState().selectNode({
        blockId: target.blockId,
        moduleType: target.moduleType,
        nodeId: target.objectId,
        kind: visualKind,
      });
      useVisualEditorSession.getState().setPanelMode("content");
    }
    inspectorOverlay.requestOpen();
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const holder = publishReviewRef.current?.closest(".homepage-editor__inspector-holder");
      const candidates = target.field
        ? Array.from(holder?.querySelectorAll<HTMLElement>(
            `[data-inspector-field="${CSS.escape(target.field)}"]`,
          ) ?? [])
        : [];
      const field = candidates.find((candidate) => (
        target.device === "shared"
        || candidate.dataset.inspectorDevice === target.device
      )) ?? candidates[0];
      if (!field) {
        focusReviewPanel();
        return;
      }
      let details = field.closest("details");
      while (details) {
        details.open = true;
        details = details.parentElement?.closest("details") ?? null;
      }
      field.dataset.pagePublishLocated = "true";
      field.scrollIntoView({ block: "center" });
      const control = Array.from(field.querySelectorAll<HTMLElement>(
        "input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]",
      )).find((candidate) => (
        candidate.getAttribute("aria-disabled") !== "true"
        && candidate.getClientRects().length > 0
      ));
      if (control) control.focus();
      else {
        field.tabIndex = -1;
        field.focus();
      }
    }));
  }, [dispatch, focusReviewPanel, inspectorOverlay, onExitPreview, onOpenPageSettings, onRetryValidation, onSelectPublishReviewIssue, previewMode, viewports]);
  useEffect(() => {
    updateInspectorCollapsed(inspectorOverlay.compact);
  }, [inspectorOverlay.compact, updateInspectorCollapsed]);
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
  const visualEditStartRef = useRef(new Map<string, Data>());
  const visualEditFrameRef = useRef(new Map<string, number>());
  const visualEditPendingRef = useRef(new Map<string, CanvasVisualEditMessage>());
  const visualEditSourceRef = useRef(new Map<string, Window>());
  useEffect(() => {
    visualEditStartRef.current.clear();
    visualEditPendingRef.current.clear();
    visualEditSourceRef.current.clear();
    visualEditFrameRef.current.forEach((frame) => window.cancelAnimationFrame(frame));
    visualEditFrameRef.current.clear();
  }, [pageKey]);
  useEffect(() => {
    const visualEditFrames = visualEditFrameRef.current;
    const visualEditPending = visualEditPendingRef.current;
    const visualEditStarts = visualEditStartRef.current;
    const visualEditSources = visualEditSourceRef.current;
    const sendSharedPreview = (
      blockId: string,
      moduleType: string,
      overrides: Record<string, unknown> | undefined,
    ) => {
      const source = visualEditSources.get(blockId);
      source?.postMessage({
        type: CANVAS_SHARED_VISUAL_PREVIEW_MESSAGE,
        moduleType,
        ...(overrides ? { overrides } : {}),
      }, window.location.origin);
    };
    const handleVisualEdit = (event: MessageEvent<CanvasVisualEditMessage>) => {
      if (viewingPublished) return;
      const detail = event.data;
      if (
        event.origin !== window.location.origin ||
        detail?.type !== CANVAS_VISUAL_EDIT_MESSAGE ||
        detail.workspace !== "page" ||
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
      if (event.source && "postMessage" in event.source) {
        visualEditSources.set(detail.blockId, event.source as Window);
      }
      const applyDetail = (
        baseData: Data,
        edit: CanvasVisualEditMessage,
        recordHistory: boolean,
      ) => {
        const marker = createContentTemplateMarker(edit.moduleType);
        const designPatch: PuckProps = {
          __instanceOverrides: edit.overrides,
          ...(marker ? { __contentTemplate: marker } : {}),
        };
        const nextContent = (baseData.content as Array<{
            type: string;
            props: PuckProps & { id: string };
          }>).map((item) =>
            item.type === edit.moduleType && item.props.id === edit.blockId
              ? { ...item, props: { ...item.props, ...designPatch } }
              : item,
          );
        dispatch({
          type: "setData",
          data: { ...baseData, content: nextContent },
          recordHistory,
        });
      };
      const transient = detail.transient === true;
      if (detail.cancelled === true) {
        const pendingFrame = visualEditFrameRef.current.get(detail.blockId);
        if (pendingFrame !== undefined) window.cancelAnimationFrame(pendingFrame);
        visualEditFrameRef.current.delete(detail.blockId);
        visualEditPendingRef.current.delete(detail.blockId);
        sendSharedPreview(detail.blockId, detail.moduleType, undefined);
        visualEditStartRef.current.delete(detail.blockId);
        visualEditSourceRef.current.delete(detail.blockId);
        return;
      }
      if (transient) {
        if (!visualEditStartRef.current.has(detail.blockId)) {
          visualEditStartRef.current.set(detail.blockId, structuredClone(currentAppData));
        }
        visualEditPendingRef.current.set(detail.blockId, detail);
        if (!visualEditFrameRef.current.has(detail.blockId)) {
          const frame = window.requestAnimationFrame(() => {
            visualEditFrameRef.current.delete(detail.blockId);
            const pending = visualEditPendingRef.current.get(detail.blockId);
            if (!pending) return;
            visualEditPendingRef.current.delete(detail.blockId);
            sendSharedPreview(pending.blockId, pending.moduleType, pending.overrides);
          });
          visualEditFrameRef.current.set(detail.blockId, frame);
        }
        return;
      }
      const pendingFrame = visualEditFrameRef.current.get(detail.blockId);
      if (pendingFrame !== undefined) window.cancelAnimationFrame(pendingFrame);
      visualEditFrameRef.current.delete(detail.blockId);
      visualEditPendingRef.current.delete(detail.blockId);
      sendSharedPreview(detail.blockId, detail.moduleType, undefined);
      visualEditSourceRef.current.delete(detail.blockId);
      const editStart = visualEditStartRef.current.get(detail.blockId);
      if (editStart) {
        visualEditStartRef.current.delete(detail.blockId);
        applyDetail(editStart, detail, true);
        return;
      }
      applyDetail(currentAppData, detail, true);
    };
    window.addEventListener("message", handleVisualEdit);
    return () => {
      window.removeEventListener("message", handleVisualEdit);
      visualEditFrames.forEach((frame) => window.cancelAnimationFrame(frame));
      visualEditFrames.clear();
      visualEditPending.clear();
      visualEditStarts.clear();
      visualEditSources.clear();
    };
  }, [dispatch, viewingPublished]);
  useEffect(() => {
    const handleDynamicLayoutEdit = (event: MessageEvent<CanvasDynamicLayoutEditMessage>) => {
      const detail = event.data;
      if (
        viewingPublished ||
        event.origin !== window.location.origin ||
        detail?.type !== CANVAS_DYNAMIC_LAYOUT_EDIT_MESSAGE ||
        detail.workspace !== "page" ||
        typeof detail.instanceId !== "string" ||
        !/^[A-Za-z0-9_-]{1,160}$/.test(detail.instanceId) ||
        typeof detail.nodeId !== "string" ||
        !/^[A-Za-z0-9_-]{1,160}$/.test(detail.nodeId) ||
        (detail.device !== "desktop" && detail.device !== "mobile")
      ) return;
      const override = detail.override;
      const currentAppData = appDataRef.current;
      const currentContent = currentAppData.content as Array<{
        type: string;
        props: PuckProps & { id?: string; instanceId?: string };
      }>;
      const target = currentContent.find((item) => (
        item.type === DYNAMIC_TEMPLATE_BLOCK_TYPE && item.props.instanceId === detail.instanceId
      ));
      if (!target) return;
      const targetProps = target.props as DynamicTemplateInstanceProps;
      const resolved = readResolvedDynamicTemplateDefinitions(
        (currentAppData as unknown as Record<string, unknown>)[DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY],
      )[dynamicTemplateVersionKey(targetProps.templateId, Number(targetProps.templateVersion))];
      const node = resolved?.definition.nodes[detail.nodeId];
      const slot = node?.slotId ? resolved?.definition.slots[node.slotId] : undefined;
      const policy = node
        ? getEffectiveDynamicTemplateInstanceEditPolicy(node, slot)
        : null;
      if (!policy || (!policy.position && !policy.size && !policy.zIndex)) return;
      if (override !== undefined) {
        if (!override || typeof override !== "object" || Array.isArray(override)) return;
        const entries = Object.entries(override);
        if (entries.some(([key, value]) => {
          if (!["offsetXPercent", "offsetYPercent", "widthPercent", "zIndex"].includes(key)) return true;
          if (typeof value !== "number" || !Number.isFinite(value)) return true;
          if (key === "offsetXPercent" || key === "offsetYPercent") {
            return !policy.position || Math.abs(value) > policy.maxOffsetPercent;
          }
          if (key === "widthPercent") {
            return !policy.size || value < policy.minWidthPercent || value > policy.maxWidthPercent;
          }
          return !policy.zIndex || !Number.isInteger(value) || Math.abs(value) > 10;
        })) return;
      }
      const nextContent = currentContent.map((item) => {
        if (item !== target) return item;
        const currentOverrides = item.props.layoutOverridesByNodeId
          && typeof item.props.layoutOverridesByNodeId === "object"
          && !Array.isArray(item.props.layoutOverridesByNodeId)
          ? item.props.layoutOverridesByNodeId as Record<string, Record<string, unknown>>
          : {};
        const nextOverrides = { ...currentOverrides };
        const nextNode = { ...(nextOverrides[detail.nodeId] ?? {}) };
        const currentDevice = nextNode[detail.device]
          && typeof nextNode[detail.device] === "object"
          && !Array.isArray(nextNode[detail.device])
          ? nextNode[detail.device] as Record<string, unknown>
          : {};
        const nextDevice = { ...currentDevice };
        for (const key of ["offsetXPercent", "offsetYPercent", "widthPercent", "zIndex"] as const) {
          delete nextDevice[key];
        }
        if (override) Object.assign(nextDevice, override);
        if (Object.keys(nextDevice).length) nextNode[detail.device] = nextDevice;
        else delete nextNode[detail.device];
        if (Object.keys(nextNode).length) nextOverrides[detail.nodeId] = nextNode;
        else delete nextOverrides[detail.nodeId];
        return {
          ...item,
          props: {
            ...item.props,
            layoutOverridesByNodeId: nextOverrides,
          },
        };
      });
      dispatch({
        type: "setData",
        data: { ...currentAppData, content: nextContent },
        recordHistory: true,
      });
    };
    window.addEventListener("message", handleDynamicLayoutEdit);
    return () => window.removeEventListener("message", handleDynamicLayoutEdit);
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

    // dock 动画的最后一次测量也必须落地；比例阈值会丢掉最终数像素的变化。
    setCanvasZoom(nextZoom);
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

  const handleTemplateDragStart = useCallback(
    (label: string, insertAt: (insertionIndex: number) => void) => {
      draggingTemplateRef.current = { label, insertAt };
      setDraggingTemplate(label);
      setDropIndex(null);
    },
    [],
  );

  const handleTemplateDragEnd = useCallback(() => {
    draggingTemplateRef.current = null;
    clearDragState();
  }, [clearDragState]);

  const handleCanvasTemplateDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!draggingTemplateRef.current) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      setDropIndex(getCanvasDropIndex(event.clientX, event.clientY));
    },
    [getCanvasDropIndex],
  );

  const handleCanvasTemplateDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      const activeTemplate = draggingTemplateRef.current;
      if (!activeTemplate) return;
      event.preventDefault();
      const insertionIndex = getCanvasDropIndex(event.clientX, event.clientY);
      if (insertionIndex === null) {
        handleTemplateDragEnd();
        return;
      }
      draggingTemplateRef.current = null;
      activeTemplate.insertAt(insertionIndex);
      clearDragState();
    },
    [clearDragState, getCanvasDropIndex, handleTemplateDragEnd],
  );

  const dropPosition =
    appData.content.length === 0 || dropIndex === null
      ? 50
      : (dropIndex / appData.content.length) * 100;

  return (
    <main
      className={`homepage-editor__body${isInspecting ? " is-inspecting" : ""}${previewMode ? " is-previewing" : ""}${viewingPublished ? " is-viewing-published" : ""}${publishReviewOpen ? " is-reviewing-publish" : ""}`}
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
        <PageTemplateLibraryAdapter
          active={workspaceActive}
          pageKey={pageKey}
          onTemplateDragStart={handleTemplateDragStart}
          onTemplateDragEnd={handleTemplateDragEnd}
        />
      )}

      <aside
        className={`homepage-editor__structure-workspace${structureCollapsed ? " is-collapsed" : ""}`}
        aria-label="图层面板"
      >
        {structureCollapsed ? (
          <WorkspacePanelCollapseButton
            action="expand"
            panel="structure"
            panelLabel="图层面板"
            onClick={() => setStructureCollapsed(false)}
          />
        ) : (
          <>
            <WorkspacePanelHeader
              icon={<BlockOutlined />}
              title="图层面板"
              actions={inspectorOverlay.compact ? (
                <WorkspacePanelCollapseButton
                  action="collapse"
                  panel="structure"
                  panelLabel="图层面板"
                  onClick={() => setStructureCollapsed(true)}
                />
              ) : undefined}
            />
            <LayerRail
              navigationPreviewOpen={navigationPreviewOpen}
              onToggleNavigationPreview={toggleNavigationPreview}
              scrollSpyIndex={scrollSpyIndex}
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
            <span>
              {hasUnsavedChanges
                ? "正在预览尚未保存的修改；预览本身不会保存或发布。"
                : "正在预览已保存草稿；预览本身不会再次保存或发布。"}
            </span>
          </div>
        ) : null}
        <WorkspaceCanvasControls
          isFitView={isFitView}
          zoom={canvasZoom}
          viewportLabel={canvasViewportLabel}
          onFit={() => setIsFitView(true)}
          onActualSize={() => {
            setIsFitView(false);
            setCanvasZoom(1);
          }}
          onZoomOut={() => adjustCanvasZoom(-0.1)}
          onZoomIn={() => adjustCanvasZoom(0.1)}
        />
        <div ref={stageRef} className="homepage-editor__canvas-scroll">
          <div
            ref={canvasRef}
            className={`homepage-editor__canvas-document${draggingTemplate ? " is-dragging" : ""}`}
            onDragOver={handleCanvasTemplateDragOver}
            onDrop={handleCanvasTemplateDrop}
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
                {dropIndex !== null ? (
                  <div
                    className="homepage-editor__drop-indicator"
                    style={{ top: `${dropPosition}%` }}
                  >
                    <span>在此插入</span>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </section>

      <div
        ref={inspectorOverlay.panelRef as RefObject<HTMLDivElement>}
        className={`homepage-editor__right-workspace${inspectorCollapsed ? " is-inspector-collapsed" : ""}`}
        aria-label="属性面板"
        role={inspectorOverlay.compact && !inspectorCollapsed ? "dialog" : undefined}
        aria-modal={inspectorOverlay.compact && !inspectorCollapsed ? "true" : undefined}
        tabIndex={inspectorOverlay.compact && !inspectorCollapsed ? -1 : undefined}
        data-compact-overlay={inspectorOverlay.compact ? "inspector" : undefined}
        data-compact-overlay-open={!inspectorCollapsed || undefined}
        onKeyDown={inspectorOverlay.onPanelKeyDown}
      >
        {inspectorCollapsed && selectedItem ? (
          <WorkspacePanelCollapseButton
            ref={inspectorOverlay.openButtonRef}
            action="expand"
            panel="inspector"
            panelLabel="属性面板"
            compactLabel={selectedItemLabel ? `属性 · ${selectedItemLabel}` : "属性"}
            onClick={inspectorOverlay.requestOpen}
          />
        ) : null}
          <div
            className="homepage-editor__inspector-holder"
            hidden={inspectorCollapsed}
          >
            <WorkspacePanelHeader
              icon={<ControlOutlined />}
              title="属性面板"
              actions={inspectorOverlay.compact ? (
                <WorkspacePanelCollapseButton
                  ref={inspectorOverlay.closeButtonRef}
                  action="collapse"
                  panel="inspector"
                  panelLabel="属性面板"
                  compactLabel="关闭"
                  onClick={inspectorOverlay.requestClose}
                />
              ) : undefined}
            />
            {publishReviewActive && publishReviewOpen ? (
              <PagePublishCheckPanel
                issues={publishReviewIssues.filter((issue) => issue.severity === "error")}
                targets={publishReviewTargets}
                currentKey={publishReviewIssueKey}
                validationStatus={validationStatus}
                publishAttemptFailed={publishAttemptFailed}
                reviewRef={publishReviewRef}
                onLocate={locatePublishIssue}
                onClose={closePublishReview}
                onRetry={onRetryValidation}
                onRetryPublish={() => onRetryPublish(appData)}
              />
            ) : null}
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
                publishIssues={publishIssues}
                validationStatus={validationStatus}
                onRetryValidation={onRetryValidation}
                onOpenPublishReview={onOpenPublishReview}
                onOpenPageSettings={onOpenPageSettings}
                canPromoteToTemplate={canPromoteToTemplate}
                onPromoteToTemplate={(request) => onPromoteToTemplate(request, {
                  width: typeof currentViewport.width === "number"
                    ? currentViewport.width
                    : RESPONSIVE_CANVAS.desktop.width,
                  height: typeof currentViewport.height === "number"
                    ? currentViewport.height
                    : RESPONSIVE_CANVAS.desktop.height,
                })}
              />
            )}
          </div>
      </div>
    </main>
  );
}

export default function StoreDecorationWorkbench({
  pageKey = "home",
}: {
  pageKey?: EditorPageKey;
}) {
  const adminRole = useAuthStore((state) => state.user?.role);
  const canPublish = adminRole === "SUPER_ADMIN" || adminRole === "ADMIN";
  // 页面装修可由编辑与管理员完成；母模板设计是全站级结构权限，
  // 前后端统一只向 SUPER_ADMIN 开放。
  const canManageTemplates = adminRole === "SUPER_ADMIN";
  const [workspaceMode, setWorkspaceMode] = useState<EditorWorkspaceMode>("page");
  const pageViewportBeforeTemplateRef = useRef<{ width: number; height: number } | null>(null);
  const pageWorkspaceController = usePageWorkspaceController({
    pageKey,
    canPublish,
  });
  const {
    data,
    metadata,
    resolvedDynamicTemplateDefinitions,
    resolvedDynamicTemplatesReady,
    resolvedDynamicTemplatesError,
    saving,
    draftSaveFailed,
    publishing,
    publishIssues,
    publishAttemptFailure,
    publishReviewIssues,
    publishValidationStatus,
    publishReviewActive,
    publishReviewOpen,
    publishReviewIssueKey,
    hasUnsavedChanges,
    hasProtectedUnsavedChanges,
    previewMode,
    revisionsOpen,
    revisionsLoading,
    revisionsLoadingMore,
    revisions,
    revisionNextBeforeVersion,
    selectedRevision,
    selectedRevisionVersion,
    revisionDetailLoading,
    revisionDetailError,
    revisionDraftComparison,
    revisionPublishedComparison,
    rollingBackRevisionId,
    revisionFailure,
    draftDiscardError,
    draftSnapshot,
    initialLoading,
    loadedPageKey,
    loadError,
    canvasDataSyncVersion,
    pendingPageHistoryCommand,
    pageSettingsOpen,
    pageSettingsData,
    pageSettingsFocusField,
    hasPendingDraft,
    canDiscardDraft,
    publishedNeedsRevalidation,
    viewingPublished,
    draftSavedAtLabel,
    commitPuckData,
    retryLoad,
    closeRevisions,
    closePageSettings,
    dismissDraftDiscardError,
    setPreviewMode,
    retryPublishValidation,
    openPublishReview,
    closePublishReview,
    setPublishReviewIssueKey,
    saveDraft,
    loadRevisions,
    loadMoreRevisions,
    selectRevision,
    editDraftFromRevisions,
    returnToEditingDraft,
    openPageSettingsForEditing,
    editPendingDraft,
    viewPublishedVersion,
    discardDraftToPublished,
    openRevisions,
    savePageSettings,
    stageRevisionAsDraft,
    commitPageHistoryCommand,
    navigatePageHistoryCommand,
    rollbackPublication,
    publishHome,
    trackEditorData,
    syncCanvasDataWithoutAdvancingSavedBaseline,
    saveProtectedChanges,
  } = pageWorkspaceController;
  const enterTemplateWorkspace = useCallback((
    pageViewport: { width: number; height: number },
  ) => {
    pageViewportBeforeTemplateRef.current = { ...pageViewport };
    setWorkspaceMode("template");
  }, []);
  const returnToPageWorkspace = useCallback(() => {
    setWorkspaceMode("page");
  }, []);
  const templateWorkspaceController = useTemplateWorkspaceController({
    active: workspaceMode === "template",
    canManageTemplates,
    localOnly: USE_MOCK,
    isViewingPublished: pageWorkspaceController.readViewingPublished,
    onEnterWorkspace: enterTemplateWorkspace,
    onReturnPage: returnToPageWorkspace,
  });
  const hasProtectedTemplateChanges = Boolean(
    templateWorkspaceController.draft
    && templateWorkspaceController.dirty,
  );
  const hasAnyProtectedChanges =
    hasProtectedUnsavedChanges || hasProtectedTemplateChanges;

  const editorConfig = useMemo(
    () =>
      ({
        ...puckConfig,
        root: {
          ...puckConfig.root,
          render: ({ children }: { children: ReactNode }) => (
            <EditorCanvasShell
              pageKey={pageKey}
              editable={!previewMode}
            >
              {children}
            </EditorCanvasShell>
          ),
        },
        components: Object.fromEntries(
          (Object.entries(puckConfig.components) as unknown as Array<[string, CanvasComponentConfig]>).map(([type, component]) => [
            type,
            {
              ...component,
              label: BLOCK_META[type]?.name ?? component.label ?? type,
              render: (props: PuckProps) => {
                if (props.isVisible === false) {
                  if (previewMode) return null;
                  if (type !== DYNAMIC_TEMPLATE_BLOCK_TYPE) {
                    return (
                      <div className="homepage-editor__hidden-block">
                        此模块已隐藏，不会发布到前台
                      </div>
                    );
                  }
                }
                // 与公开端同一套渲染规则（2026-08-21 对齐）：
                // 旧色值规范化此前只在公开端生效，老数据两端颜色可能不同；
                // 素材缺失检测同理，见 CanvasMediaGuard。
                const normalized = normalizeLegacyRenderColors(props);
                const normalizedProps: PuckProps = normalized && typeof normalized === "object" && !Array.isArray(normalized)
                  ? normalized as PuckProps
                  : {};
                const rendered = type === DYNAMIC_TEMPLATE_BLOCK_TYPE
                  ? (() => {
                      const instanceProps = normalizedProps as DynamicTemplateInstanceProps;
                      const resolved = resolvedDynamicTemplateDefinitions[
                        dynamicTemplateVersionKey(
                          instanceProps.templateId,
                          instanceProps.templateVersion,
                        )
                      ];
                      return (
                        <CanvasDynamicTemplateInstance
                          props={instanceProps}
                          definition={resolved?.definition}
                          mode={previewMode ? "preview" : "editor"}
                        />
                      );
                    })()
                  : component.render(normalizedProps);
                // 画布内统一注入 editMode，让 block 区分编辑预览与前台发布
                const editableBlock = isValidElement<{ editMode?: boolean }>(rendered)
                  ? cloneElement(rendered, { editMode: !previewMode })
                  : rendered;
                return (
                  <CanvasBlockAnchor blockId={String(props.id ?? "")} blockType={type}>
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
    [pageKey, previewMode, resolvedDynamicTemplateDefinitions],
  );

  // 页面与模板两种会话只在工作台这一层汇总离开保护。
  useEffect(() => {
    if (!hasAnyProtectedChanges) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasAnyProtectedChanges]);

  return (
    <div className="homepage-editor">
      <RevisionDrawer
        open={revisionsOpen}
        revisions={revisions}
        loading={revisionsLoading}
        loadingMore={revisionsLoadingMore}
        nextBeforeVersion={revisionNextBeforeVersion}
        selectedVersion={selectedRevisionVersion}
        selectedRevision={selectedRevision}
        detailLoading={revisionDetailLoading}
        detailError={revisionDetailError}
        rollingBackRevisionId={rollingBackRevisionId}
        canRollback={canPublish}
        draft={draftSnapshot}
        draftComparison={revisionDraftComparison}
        publishedComparison={revisionPublishedComparison}
        error={revisionFailure?.message ?? null}
        onClose={closeRevisions}
        onRetry={() => {
          if (revisionFailure?.revision && revisionFailure.action === "rollback") {
            rollbackPublication(revisionFailure.revision);
            return;
          }
          void loadRevisions();
        }}
        onLoadMore={() => { void loadMoreRevisions(); }}
        onSelect={(revision) => { void selectRevision(revision); }}
        onStageRestore={stageRevisionAsDraft}
        onRollback={rollbackPublication}
        onEditDraft={editDraftFromRevisions}
      />

      <PageSettingsDrawer
        open={pageSettingsOpen}
        pageKey={pageKey}
        metadata={metadata}
        puckData={pageSettingsData}
        publishIssues={publishIssues}
        validationStatus={publishValidationStatus}
        focusField={pageSettingsFocusField}
        onRetryValidation={retryPublishValidation}
        onClose={() => {
          closePageSettings();
        }}
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
            onClick={dismissDraftDiscardError}
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
            onClick={retryLoad}
          >
            重新加载
          </Button>
        </div>
      ) : !initialLoading && loadedPageKey === pageKey && resolvedDynamicTemplatesError ? (
        <div className="homepage-editor__load-error" role="alert">
          <ExclamationCircleOutlined />
          <strong>模板版本解析失败</strong>
          <span>{resolvedDynamicTemplatesError}。页面草稿未修改，请重新加载后重试。</span>
          <Button type="primary" onClick={retryLoad}>
            重新加载模板版本
          </Button>
        </div>
      ) : initialLoading || loadedPageKey !== pageKey || !resolvedDynamicTemplatesReady ? (
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
          data={data as Partial<Data>}
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
              : { drag: false, duplicate: false }
          }
          iframe={{ enabled: true, waitForStyles: true, syncHostStyles: true }}
          onPublish={(nextData) => {
            commitPuckData(nextData);
          }}
          overrides={HOMEPAGE_EDITOR_OVERRIDES}
        >
          <CanvasPageDataSynchronizer
            data={data}
            pageKey={pageKey}
            canvasDataSyncVersion={canvasDataSyncVersion}
            historyCommand={pendingPageHistoryCommand}
            onHistoryCommandCommitted={commitPageHistoryCommand}
          />
          {workspaceMode === "page" ? (
            <CanvasSelectionDock readOnly={viewingPublished} />
          ) : null}
          {workspaceMode === "page" ? (
            <EditorToolbar
            pageKey={pageKey}
            publishing={publishing}
            saving={saving}
            draftSaveFailed={draftSaveFailed}
            hasPendingDraft={hasPendingDraft}
            canDiscardDraft={canDiscardDraft}
            publishedNeedsRevalidation={publishedNeedsRevalidation}
            viewingPublished={viewingPublished}
            previewMode={previewMode}
            hasUnsavedChanges={hasUnsavedChanges}
            canPublish={canPublish}
            canManageTemplates={canManageTemplates}
            draftSavedAtLabel={draftSavedAtLabel}
            publishValidationStatus={publishValidationStatus}
            publishAttemptFailed={Boolean(publishAttemptFailure)}
            publishReviewActive={publishReviewActive}
            publishReviewErrorCount={publishReviewIssues.filter((issue) => issue.severity === "error").length}
            onOpenPublishReview={openPublishReview}
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
            onPageHistoryNavigation={navigatePageHistoryCommand}
            onExitViewing={returnToEditingDraft}
            onEnterTemplateMode={templateWorkspaceController.enter}
            restoreViewport={pageViewportBeforeTemplateRef.current}
            />
          ) : null}
          <div
            className={`homepage-editor__page-workspace${workspaceMode === "template" ? " is-inactive" : ""}`}
            aria-hidden={workspaceMode === "template" || undefined}
          >
            <EditorBody
              workspaceActive={workspaceMode === "page"}
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
              publishReviewIssues={publishReviewIssues}
              publishAttemptFailed={Boolean(publishAttemptFailure)}
              validationStatus={publishValidationStatus}
              onRetryValidation={retryPublishValidation}
              onRetryPublish={publishHome}
              publishReviewActive={publishReviewActive}
              publishReviewOpen={publishReviewOpen}
              publishReviewIssueKey={publishReviewIssueKey}
              onOpenPublishReview={openPublishReview}
              onClosePublishReview={closePublishReview}
              onSelectPublishReviewIssue={setPublishReviewIssueKey}
              onExitPreview={() => setPreviewMode(false)}
              onOpenPageSettings={openPageSettingsForEditing}
              canPromoteToTemplate={canManageTemplates && !USE_MOCK}
              onPromoteToTemplate={templateWorkspaceController.promoteFromPage}
            />
          </div>
          {workspaceMode === "template" ? (
            <Suspense
              fallback={
                <div
                  className="homepage-editor__loading"
                  role="status"
                  aria-live="polite"
                >
                  <Spin />
                  <span>正在加载模板编辑器</span>
                </div>
              }
            >
              <TemplateWorkspace controller={templateWorkspaceController} />
            </Suspense>
          ) : null}
        </Puck>
      )}
      <UnsavedChangesGuard
        hasUnsavedChanges={hasAnyProtectedChanges}
        disabled={
          initialLoading || Boolean(loadError) || loadedPageKey !== pageKey
        }
        subject={
          hasProtectedTemplateChanges && hasProtectedUnsavedChanges
            ? "当前模板和页面"
            : hasProtectedTemplateChanges
              ? "当前模板"
              : "当前页面"
        }
        onSaveAndLeave={async () => {
          if (hasProtectedTemplateChanges) {
            const savedTemplate = await templateWorkspaceController.persistForExit();
            if (!savedTemplate) return false;
          }
          if (!hasProtectedUnsavedChanges) return true;
          return saveProtectedChanges();
        }}
      />
    </div>
  );
}
