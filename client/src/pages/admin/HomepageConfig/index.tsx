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
  CheckCircleOutlined,
  ControlOutlined,
  EyeOutlined,
  ExclamationCircleOutlined,
} from "@ant-design/icons";
import { Puck, type Data, type PuckAction, type UiState } from "@puckeditor/core";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import "@puckeditor/core/no-external.css";
import { puckConfig } from "@/page-builder/config/puckConfig";
import { BusinessRegionCanvasProvider } from "@/page-builder/adapters/businessRegion.puck";
import {
  BLOCK_META,
  isContentTemplateInsertable,
} from "@/page-builder/config/blockMeta";
import {
  pageDocumentApi,
  type PageDocumentResource,
  type PersonalContentTemplate,
  type SystemContentTemplateCurrent,
} from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import { IMAGE_SPECS } from "@/page-builder/config/imageSpecs";
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
import DoublePosterInspector from "@/page-builder/inspector/panels/DoublePosterInspector";
import InspectorFooterBar from "@/page-builder/inspector/InspectorFooterBar";
import type {
  PublishValidationIssue,
  PublishValidationStatus,
} from "@/page-builder/inspector/publishValidation";
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
import {
  createContentTemplateMarker,
  extractContentTemplateLayoutData,
  getContentTemplateContract,
  getContentTemplatePreview,
  isContentTemplateAllowedForPage,
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
  CANVAS_DYNAMIC_LAYOUT_EDIT_MESSAGE,
  CANVAS_SHARED_VISUAL_PREVIEW_MESSAGE,
  CANVAS_VISUAL_EDIT_MESSAGE,
  type CanvasDynamicLayoutEditMessage,
  type CanvasVisualEditMessage,
  useVisualEditorSession,
} from "@/page-builder/visual-editor/visualEditorSession";
import type { PersistTemplateOptions } from "@/page-builder/template-editor/TemplateWorkspace";
import { UnifiedTemplateLibrary } from "@/page-builder/template-editor/TemplateEditorLibrary";
import { notifyDynamicTemplateCatalogChanged } from "@/page-builder/template-editor/templateCatalogEvents";
import WorkspaceCanvasControls from "@/page-builder/template-editor/WorkspaceCanvasControls";
import {
  createPersonalTemplateDraft,
  createSystemTemplateDraft,
} from "@/page-builder/template-editor/templateDraftAdapter";
import { adaptLegacyTemplateSource } from "@/page-builder/template-editor/legacyTemplateConversion";
import {
  hasUnpersistedTemplateDraft,
  useTemplateEditorSession,
} from "@/page-builder/template-editor/templateEditorSession";
import {
  DYNAMIC_TEMPLATE_LOCAL_DRAFT_CHANGED_EVENT,
  createNewDynamicTemplateDraft,
  loadLocalDynamicTemplateDraft,
  saveLocalDynamicTemplateDraft,
} from "@/page-builder/template-editor/dynamicTemplateDraftRepository";
import { USE_MOCK } from "@/services/mockData";
import {
  createDynamicTemplateStableId,
  getEffectiveDynamicTemplateInstanceEditPolicy,
  type TemplateDefinitionV2,
} from "@/page-builder/template-definition";
import {
  DYNAMIC_TEMPLATE_BLOCK_TYPE,
  DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY,
  DynamicTemplateInstanceView,
  createDynamicTemplateInstanceProps,
  dynamicTemplateVersionKey,
  readResolvedDynamicTemplateDefinitions,
  registerResolvedDynamicTemplate,
  replaceResolvedDynamicTemplates,
  useResolvedDynamicTemplateDefinitions,
  type DynamicTemplateInstanceProps,
  type ResolvedDynamicTemplateDefinitionMap,
} from "@/page-builder/dynamic-template-instance";
import DynamicTemplateInstanceInspector from "@/page-builder/dynamic-template-instance/DynamicTemplateInstanceInspector";
import {
  dynamicTemplateApi,
  type DynamicTemplatePublishResultResource,
  type DynamicTemplateResource,
  type PublishedDynamicTemplateResource,
  type TemplateCatalogResource,
} from "@/services/clients/dynamicTemplateClient";
import type {
  EditorWorkspaceMode,
  TemplateEditorDraft,
} from "@/page-builder/template-editor/types";
import {
  countUpgradeableSystemTemplateInstances,
  upgradePersonalTemplateInstances,
  upgradeSystemTemplateInstances,
} from "@/page-builder/templates/templateOrigin";
import WorkspacePanelHeader from "@/page-builder/workspace/WorkspacePanelHeader";
import WorkspacePanelCollapseButton from "@/page-builder/workspace/WorkspacePanelCollapseButton";
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

// 模板编辑器只在运营者主动切换到模板模式后下载；页面编辑首开不承担其结构树、
// 版本面板和母模板画布成本。
const TemplateWorkspace = lazy(
  () => import("@/page-builder/template-editor/TemplateWorkspace"),
);
import {
  getModuleDisplayName,
  formatEditorTime,
  getEditorErrorMessage,
  getEditorHttpStatus,
  canonicalizePuckContent,
  canonicalizePageContent,
} from "./editor-utils";
import {
  isPuckDocument,
  type PuckDocument,
  type PuckProps,
} from "@/page-builder/types";

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

function createPersistedDynamicTemplateDraft(
  template: DynamicTemplateResource,
): TemplateEditorDraft | null {
  if (!template.draft) return null;
  return {
    format: "dynamic",
    sourceType: "persisted",
    localDraftId: template.templateId,
    versionNote: template.draft.versionNote ?? "",
    ...(template.sourceReference ? { sourceReference: template.sourceReference } : {}),
    definition: structuredClone(template.draft.definition),
    remote: {
      databaseId: template.id,
      revision: template.draft.revision,
      publishedVersion: template.publishedVersion,
      baseVersion: template.draft.baseVersion,
    },
  };
}

type CanvasComponentConfig = {
  label?: string;
  render: (props: PuckProps) => ReactNode;
  [key: string]: unknown;
};

type EditorPuckBlock = {
  type: string;
  props: PuckProps & { id: string };
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
function dataSignature(data: unknown): string {
  return canonicalizePuckContent(data);
}

function normalizePuckMetadata(value: unknown): PuckProps {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as PuckProps
    : {};
}

function getPuckDocument(value: unknown): PuckDocument | null {
  return isPuckDocument(value) ? value : null;
}

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
}: {
  data: PuckDocument;
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
    dispatch({ type: "setData", data: data as Partial<Data> });
    dispatch({ type: "setUi", ui: { itemSelector: null } });
  }, [canvasDataSyncVersion, currentDataSignature, data, dataSignature, dispatch, pageKey]);

  return null;
}

/**
 * 模块卡片不使用真实商品素材，而用“布局微缩图”展示该区块插入后的结构。
 * 这让用户先理解版式和内容层级，再决定是否添加。
 */
function PageTemplateLibraryAdapter({
  pageKey,
  onInsertTemplate,
  onTemplateDragStart,
  onTemplateDragEnd,
}: {
  pageKey: EditorPageKey;
  onInsertTemplate: (
    name: string,
    current?: SystemContentTemplateCurrent,
    insertionIndex?: number,
  ) => void;
  onTemplateDragStart: (label: string, insertAt: (insertionIndex: number) => void) => void;
  onTemplateDragEnd: () => void;
}) {
  const { message, modal } = AntdApp.useApp();
  const appData = useHomepagePuck((state) => state.appState.data);
  const dispatch = useHomepagePuck((state) => state.dispatch);
  const currentViewport = useHomepagePuck((state) => state.appState.ui.viewports.current);
  const previewViewport = typeof currentViewport.width === "number" && currentViewport.width <= 480
    ? "mobile"
    : "desktop";

  const upgradeSystemTemplateInPage = useCallback((current: SystemContentTemplateCurrent) => {
    const upgradeableCount = countUpgradeableSystemTemplateInstances(
      appData as unknown as Record<string, unknown>,
      current,
    );
    if (upgradeableCount === 0) return;
    modal.confirm({
      title: `升级“${current.displayName}”页面实例？`,
      content: `将 ${upgradeableCount} 个页面实例的布局升级到系统版本 ${current.activeVersion}。图片、文字、商品和链接保持不变；只修改当前页面草稿，不会自动发布。`,
      okText: "升级当前页面草稿",
      cancelText: "取消",
      onOk: () => {
        const result = upgradeSystemTemplateInstances(
          appData as unknown as Record<string, unknown>,
          current,
        );
        if (result.upgradedCount === 0) return;
        dispatch({
          type: "setData",
          data: result.document as unknown as typeof appData,
          recordHistory: true,
        });
        message.success(`已升级 ${result.upgradedCount} 个实例；保存页面草稿后才会持久化`);
      },
    });
  }, [appData, dispatch, message, modal]);

  const insertPublishedDynamicTemplate = useCallback((
    template: PublishedDynamicTemplateResource,
    requestedInsertionIndex = appData.content?.length ?? 0,
  ) => {
    const resolved = {
      templateId: template.templateId,
      version: template.version,
      schemaVersion: template.schemaVersion,
      definitionChecksum: template.definitionChecksum,
      definition: template.definition,
    };
    registerResolvedDynamicTemplate(resolved);
    const key = dynamicTemplateVersionKey(template.templateId, template.version);
    const document = appData as unknown as PuckDocument;
    const existingResolved = document[DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY];
    const resolvedMap = existingResolved && typeof existingResolved === "object" && !Array.isArray(existingResolved)
      ? existingResolved as ResolvedDynamicTemplateDefinitionMap
      : {};
    const content = appData.content ?? [];
    const insertionIndex = Math.min(
      content.length,
      Math.max(0, requestedInsertionIndex),
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
        ...appData,
        [DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY]: {
          ...resolvedMap,
          [key]: resolved,
        },
        content: [
          ...content.slice(0, insertionIndex),
          instance,
          ...content.slice(insertionIndex),
        ],
      } as typeof appData,
      recordHistory: true,
    });
    dispatch({
      type: "setUi",
      ui: { itemSelector: { index: insertionIndex, zone: ROOT_ZONE } },
    });
    message.success(`已添加“${template.name}”v${template.version}，可在右侧填写页面内容`);
  }, [appData, dispatch, message]);

  return (
    <UnifiedTemplateLibrary
      mode="page"
      device={previewViewport}
      isSystemTemplateAllowed={(moduleType) => (
        isContentTemplateInsertable(moduleType)
        && isContentTemplateAllowedForPage(pageKey, moduleType)
      )}
      onInsertSystem={onInsertTemplate}
      onSystemDragStart={(moduleType, current) => onTemplateDragStart(
        moduleType,
        (insertionIndex) => onInsertTemplate(moduleType, current, insertionIndex),
      )}
      onSystemDragEnd={onTemplateDragEnd}
      onInsertPublished={insertPublishedDynamicTemplate}
      onPublishedDragStart={(template) => onTemplateDragStart(
        template.name,
        (insertionIndex) => insertPublishedDynamicTemplate(template, insertionIndex),
      )}
      onPublishedDragEnd={onTemplateDragEnd}
      getSystemUpgradeCount={(current) => countUpgradeableSystemTemplateInstances(
        appData as unknown as Record<string, unknown>,
        current,
      )}
      onUpgradeSystem={upgradeSystemTemplateInPage}
    />
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
  onOpenPageSettings,
}: {
  hasUnsavedChanges: boolean;
  saving: boolean;
  onSaveDraft: () => void;
  publishIssues: PublishValidationIssue[];
  validationStatus: PublishValidationStatus;
  onRetryValidation: () => void;
  onOpenPageSettings: (field?: string) => void;
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
        />
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
        templateDesignEnabled={false}
        publishIssues={publishIssues}
        validationStatus={validationStatus}
        onRetryValidation={onRetryValidation}
        onOpenPageSettings={onOpenPageSettings}
      />
    );
  }
  if (selectedItem.type === DYNAMIC_TEMPLATE_BLOCK_TYPE) {
    return (
      <DynamicTemplateInstanceInspector
        hasUnsavedChanges={hasUnsavedChanges}
        saving={saving}
        publishIssues={publishIssues}
        validationStatus={validationStatus}
        onRetryValidation={onRetryValidation}
        onOpenPageSettings={onOpenPageSettings}
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

function resolveBlockingPublishIssues(result: {
  errors?: string[];
  issues?: PublishValidationIssue[];
}): PublishValidationIssue[] {
  return resolvePublishValidationIssues(result).filter(
    (issue) => issue.severity === "error",
  );
}

function EditorBody({
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
  validationStatus,
  onRetryValidation,
  onOpenPageSettings,
}: {
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
  validationStatus: PublishValidationStatus;
  onRetryValidation: () => void;
  onOpenPageSettings: (field?: string) => void;
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
  const visualEditStartRef = useRef(new Map<string, Data>());
  const visualEditFrameRef = useRef(new Map<string, number>());
  const visualEditPendingRef = useRef(new Map<string, CanvasVisualEditMessage>());
  const visualEditSourceRef = useRef(new Map<string, Window>());
  useEffect(() => {
    appDataRef.current = appData;
  }, [appData]);
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
    (
      templateName: string,
      insertionIndex: number,
      current?: SystemContentTemplateCurrent,
    ) => {
      const meta = BLOCK_META[templateName];
      if (!meta) return;
      if (!isContentTemplateAllowedForPage(pageKey, templateName)) {
        message.warning("当前页面角色不允许添加此模板");
        clearDragState();
        return;
      }
      const displayName = meta.name;
      const block = createBlockContent(templateName);
      const marker = createContentTemplateMarker(templateName);
      const layoutData = sanitizeContentTemplateLayoutData(
        templateName,
        current?.moduleType === templateName ? current.layoutData : { version: 2 },
      );
      if (marker && layoutData) {
        block.props = {
          ...block.props,
          __instanceOverrides: layoutData,
          __templateOrigin: {
            kind: "system",
            contractKey: current?.moduleType === templateName
              ? current.contractKey
              : marker.key,
            version: current?.moduleType === templateName
              ? current.activeVersion
              : 0,
          },
        };
      }
      insertPreparedBlock(dispatch, block, insertionIndex);
      dispatch({
        type: "setUi",
        ui: { itemSelector: { index: insertionIndex, zone: ROOT_ZONE } },
      });
      message.success(`已插入“${displayName}”，可在右侧继续编辑`);
      clearDragState();
    },
    [clearDragState, dispatch, message, pageKey],
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

  const handleTemplateActivate = useCallback(
    (name: string, current?: SystemContentTemplateCurrent, insertionIndex?: number) => (
      insertTemplate(name, insertionIndex ?? appData.content.length, current)
    ),
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
        <PageTemplateLibraryAdapter
          pageKey={pageKey}
          onInsertTemplate={handleTemplateActivate}
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
              actions={(
                <WorkspacePanelCollapseButton
                  action="collapse"
                  panel="structure"
                  panelLabel="图层面板"
                  onClick={() => setStructureCollapsed(true)}
                />
              )}
            />
            <LayerRail
              navigationPreviewOpen={navigationPreviewOpen}
              onToggleNavigationPreview={toggleNavigationPreview}
              scrollSpyIndex={scrollSpyIndex}
              readOnly={viewingPublished}
              publishIssues={publishIssues}
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
        className={`homepage-editor__right-workspace${inspectorCollapsed ? " is-inspector-collapsed" : ""}`}
        aria-label="属性面板"
      >
        {inspectorCollapsed ? (
          <WorkspacePanelCollapseButton
            action="expand"
            panel="inspector"
            panelLabel="属性面板"
            onClick={() => setInspectorCollapsed(false)}
          />
        ) : null}
          <div
            className="homepage-editor__inspector-holder"
            hidden={inspectorCollapsed}
          >
            <WorkspacePanelHeader
              icon={<ControlOutlined />}
              title="属性面板"
              actions={(
                <WorkspacePanelCollapseButton
                  action="collapse"
                  panel="inspector"
                  panelLabel="属性面板"
                  onClick={() => setInspectorCollapsed(true)}
                />
              )}
            />
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
                onOpenPageSettings={onOpenPageSettings}
              />
            )}
          </div>
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
  // 页面装修可由编辑与管理员完成；母模板设计是全站级结构权限，
  // 前后端统一只向 SUPER_ADMIN 开放。
  const canManageTemplates = adminRole === "SUPER_ADMIN";
  const [workspaceMode, setWorkspaceMode] = useState<EditorWorkspaceMode>("page");
  const [templatePublishing, setTemplatePublishing] = useState(false);
  const templatePublishInFlightRef = useRef(false);
  const pageViewportBeforeTemplateRef = useRef<{ width: number; height: number } | null>(null);
  const templateDraft = useTemplateEditorSession((state) => state.draft);
  const templateDirty = useTemplateEditorSession((state) => state.dirty);
  const [data, setData] = useState<PuckDocument>(() => createEditorPageDefault(pageKey));
  const resolvedDynamicTemplateDefinitions = useResolvedDynamicTemplateDefinitions();
  const resolvedDefinitionsPayload = data[DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY];
  const waitsForResolvedDynamicTemplates = Boolean(
    resolvedDefinitionsPayload
    && typeof resolvedDefinitionsPayload === "object"
    && !Array.isArray(resolvedDefinitionsPayload)
    && Object.keys(resolvedDefinitionsPayload).length > 0,
  );
  const resolvedDynamicTemplatesReady = !waitsForResolvedDynamicTemplates || (data.content ?? []).every((block) => {
    if (block.type !== DYNAMIC_TEMPLATE_BLOCK_TYPE) return true;
    const templateId = block.props?.templateId;
    const templateVersion = block.props?.templateVersion;
    return typeof templateId === "string"
      && typeof templateVersion === "number"
      && Boolean(resolvedDynamicTemplateDefinitions[dynamicTemplateVersionKey(templateId, templateVersion)]);
  });
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishIssues, setPublishIssues] = useState<PublishValidationIssue[]>(
    [],
  );
  const [publishValidationStatus, setPublishValidationStatus] =
    useState<PublishValidationStatus>("idle");
  const [validationRevision, setValidationRevision] = useState(0);
  const validationRequestRef = useRef(0);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [revisionsOpen, setRevisionsOpen] = useState(false);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [revisions, setRevisions] = useState<PageDocumentRevision[]>([]);
  const [restoringVersion, setRestoringVersion] = useState<number | null>(null);
  const [rollingBackRevisionId, setRollingBackRevisionId] = useState<number | null>(null);
  const [revisionFailure, setRevisionFailure] = useState<{
    message: string;
    revision?: PageDocumentRevision;
    action?: "restore" | "rollback";
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
  const latestData = useRef<PuckDocument>(data);
  const controlledCanvasStateRef = useRef<{
    hasUnsavedChanges: boolean;
    baselineSignature: string | null;
  } | null>(null);
  const [canvasDataSyncVersion, setCanvasDataSyncVersion] = useState(0);
  const pageSessionCacheRef = useRef<Record<string, PageSessionCache>>({});
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const dataSignatureRef = useRef("");  const [metadata, setMetadata] = useState<PuckProps>({});
  const latestMetadata = useRef<PuckProps>({});
  const [pageSettingsOpen, setPageSettingsOpen] = useState(false);
  const [pageSettingsFocusField, setPageSettingsFocusField] = useState<string | null>(null);
  // 是否存在尚未发布的草稿修改。
  const [hasPendingDraft, setHasPendingDraft] = useState(false);
  const [publishedNeedsRevalidation, setPublishedNeedsRevalidation] = useState(false);
  const pendingDraftRef = useRef<PuckDocument | null>(null);
  const editingDraftSnapshotRef = useRef<{
    data: PuckDocument;
    metadata: PuckProps;
    hasUnsavedChanges: boolean;
    hasPendingDraft: boolean;
    savedSignature: string;
  } | null>(null);
  const publishedBaselineRef = useRef<string | null>(null);
  const publishedDataRef = useRef<PuckDocument | null>(null);
  // 当前画布是否展示线上已发布版本（“查看线上版本”模式）。
  const [viewingPublished, setViewingPublished] = useState(false);
  // 供画布编辑回调读取最新“查看线上版本”状态，避免闭包过期。
  const viewingPublishedRef = useRef(false);
  // 线上版本的 metadata，供“查看线上版本”时还原。
  const publishedMetadataRef = useRef<PuckProps>({});
  const hasProtectedUnsavedChanges =
    hasUnsavedChanges ||
    (viewingPublished &&
      editingDraftSnapshotRef.current?.hasUnsavedChanges === true);
  const hasProtectedTemplateChanges = Boolean(
    workspaceMode === "template"
    && templateDraft
    && templateDirty,
  );
  const hasAnyProtectedChanges =
    hasProtectedUnsavedChanges || hasProtectedTemplateChanges;

  const openSystemTemplateDraft = useCallback((
    moduleType: string,
    current: SystemContentTemplateCurrent | undefined,
    markAsNew: boolean,
  ) => {
    const sourceDraft = createSystemTemplateDraft(moduleType, current);
    if (!sourceDraft) {
      message.error("当前母模板缺少可编辑合同，暂时无法打开");
      return null;
    }
    try {
      const loaded = adaptLegacyTemplateSource(sourceDraft);
      const visualSession = useVisualEditorSession.getState();
      visualSession.resetWorkspaceContext("template");
      visualSession.activateWorkspace("template");
      const session = useTemplateEditorSession.getState();
      session.open(loaded.draft, { isNew: markAsNew });
      session.selectObject(loaded.draft.definition.rootNodeId);
      if (loaded.skippedItems.length > 0) {
        message.warning(`母模板已打开；有 ${loaded.skippedItems.length} 项旧引用需在发布前重新确认`);
      }
      return useTemplateEditorSession.getState().sessionId;
    } catch (error) {
      message.error(getEditorErrorMessage(error, "当前母模板暂时无法在统一编辑器中打开"));
      return null;
    }
  }, [message]);

  useEffect(() => {
    activePageKeyRef.current = pageKey;
    setPreviewMode(false);
  }, [pageKey]);

  useEffect(() => {
    viewingPublishedRef.current = viewingPublished;
  }, [viewingPublished]);

  const openEmptyTemplateWorkspace = useCallback((pageViewport: { width: number; height: number }) => {
    if (!canManageTemplates) {
      message.warning("只有超级管理员可以设计模板");
      return;
    }
    if (viewingPublishedRef.current) {
      message.warning("请先返回页面草稿，再进入模板编辑");
      return;
    }
    const visualSession = useVisualEditorSession.getState();
    pageViewportBeforeTemplateRef.current = { ...pageViewport };
    visualSession.resetWorkspaceContext("template");
    visualSession.activateWorkspace("template");
    useTemplateEditorSession.getState().close();
    setWorkspaceMode("template");
    const defaultModuleType = "首屏主视觉";
    const openedSessionId = openSystemTemplateDraft(defaultModuleType, undefined, false);
    const contractKey = getContentTemplateContract(defaultModuleType)?.key;
    if (!openedSessionId || !contractKey) return;

    void dynamicTemplateApi.listCatalog()
      .then((response) => {
        const catalog = unwrapResponse<TemplateCatalogResource>(response);
        const current = catalog?.items.find((item) => (
          item.kind === "system-compatibility" && item.template.contractKey === contractKey
        ));
        const systemCurrent = current?.kind === "system-compatibility" ? current.template : null;
        const session = useTemplateEditorSession.getState();
        if (
          !systemCurrent
          || systemCurrent.moduleType !== defaultModuleType
          || systemCurrent.activeVersion <= 0
          || session.sessionId !== openedSessionId
          || session.dirty
        ) return;
        openSystemTemplateDraft(defaultModuleType, systemCurrent, false);
      })
      .catch(() => {
        const session = useTemplateEditorSession.getState();
        if (session.sessionId === openedSessionId && !session.dirty) {
          message.warning("首屏当前版本暂时无法读取，已打开代码合同基线");
        }
      });
  }, [canManageTemplates, message, openSystemTemplateDraft]);

  const openSystemTemplateWorkspace = useCallback((
    moduleType: string,
    current?: SystemContentTemplateCurrent,
  ) => {
    if (workspaceMode !== "template") {
      message.info("请先点击顶部“模板设计”进入模板工作区");
      return;
    }
    if (!canManageTemplates) {
      message.warning("只有超级管理员可以设计模板");
      return;
    }
    openSystemTemplateDraft(moduleType, current, false);
  }, [canManageTemplates, message, openSystemTemplateDraft, workspaceMode]);

  const openPersonalTemplateWorkspace = useCallback((template: PersonalContentTemplate) => {
    if (workspaceMode !== "template") {
      message.info("请先点击顶部“模板设计”进入模板工作区");
      return;
    }
    if (!canManageTemplates) {
      message.warning("只有超级管理员可以设计模板");
      return;
    }
    const sourceDraft = createPersonalTemplateDraft(template);
    if (!sourceDraft) {
      message.error("此模板与当前合同不兼容，原记录未被修改");
      return;
    }
    try {
      const loaded = adaptLegacyTemplateSource(sourceDraft);
      const visualSession = useVisualEditorSession.getState();
      visualSession.resetWorkspaceContext("template");
      visualSession.activateWorkspace("template");
      const session = useTemplateEditorSession.getState();
      session.open(loaded.draft, { isNew: false });
      session.selectObject(loaded.draft.definition.rootNodeId);
      if (loaded.skippedItems.length > 0) {
        message.warning(`母模板已打开；有 ${loaded.skippedItems.length} 项旧引用需在发布前重新确认`);
      }
    } catch (error) {
      message.error(getEditorErrorMessage(error, "当前母模板暂时无法在统一编辑器中打开"));
    }
  }, [canManageTemplates, message, workspaceMode]);

  const openNewDynamicTemplateWorkspace = useCallback(() => {
    if (workspaceMode !== "template") {
      message.info("请先点击顶部“模板设计”进入模板工作区");
      return;
    }
    if (!canManageTemplates) {
      message.warning("只有超级管理员可以设计模板");
      return;
    }
    const draft = createNewDynamicTemplateDraft("未命名模板");
    const visualSession = useVisualEditorSession.getState();
    visualSession.resetWorkspaceContext("template");
    visualSession.activateWorkspace("template");
    const session = useTemplateEditorSession.getState();
    session.open(draft, { isNew: true });
    session.selectObject(draft.definition.rootNodeId);
  }, [canManageTemplates, message, workspaceMode]);

  const openDynamicTemplateWorkspace = useCallback((localDraftId: string) => {
    if (workspaceMode !== "template") {
      message.info("请先点击顶部“模板设计”进入模板工作区");
      return;
    }
    if (!canManageTemplates) {
      message.warning("只有超级管理员可以设计模板");
      return;
    }
    const draft = loadLocalDynamicTemplateDraft(localDraftId);
    if (!draft) {
      message.error("该本机模板草稿不存在或未通过当前结构校验");
      return;
    }
    const visualSession = useVisualEditorSession.getState();
    visualSession.resetWorkspaceContext("template");
    visualSession.activateWorkspace("template");
    const session = useTemplateEditorSession.getState();
    session.open(draft);
    session.selectObject(draft.definition.rootNodeId);
  }, [canManageTemplates, message, workspaceMode]);

  const openPersistedTemplateDraft = useCallback((template: DynamicTemplateResource) => {
    if (template.status === "ARCHIVED") {
      message.warning("已归档模板需先恢复后才能继续编辑");
      return false;
    }
    const draft = createPersistedDynamicTemplateDraft(template);
    if (!draft) {
      message.error("服务端模板缺少可编辑草稿");
      return false;
    }
    const visualSession = useVisualEditorSession.getState();
    visualSession.resetWorkspaceContext("template");
    visualSession.activateWorkspace("template");
    const session = useTemplateEditorSession.getState();
    session.open(draft);
    session.selectObject(draft.definition.rootNodeId);
    return true;
  }, [message]);

  const openPersistedDynamicTemplateWorkspace = useCallback((template: DynamicTemplateResource) => {
    if (workspaceMode !== "template") {
      message.info("请先点击顶部“模板设计”进入模板工作区");
      return;
    }
    if (!canManageTemplates) {
      message.warning("只有超级管理员可以设计模板");
      return;
    }
    openPersistedTemplateDraft(template);
  }, [canManageTemplates, message, openPersistedTemplateDraft, workspaceMode]);

  const returnToPageWorkspace = useCallback(() => {
    useTemplateEditorSession.getState().close();
    useVisualEditorSession.getState().activateWorkspace("page");
    setWorkspaceMode("page");
  }, []);

  const persistTemplateDraft = useCallback(async (
    options: PersistTemplateOptions = {},
  ): Promise<boolean> => {
    const session = useTemplateEditorSession.getState();
    const draft = session.draft;
    if (!canManageTemplates || !draft) return false;
    session.setSaveStatus("saving");
    try {
      if (USE_MOCK) {
        const localBase = draft.sourceType === "local"
          ? draft
          : (() => {
              const localDraftId = createDynamicTemplateStableId("tpl");
              return {
                format: "dynamic" as const,
                sourceType: "local" as const,
                localDraftId,
                versionNote: draft.versionNote,
                sourceReference: draft.definition.templateId,
                definition: {
                  ...structuredClone(draft.definition),
                  templateId: localDraftId,
                },
              };
            })();
        const savedDraft = saveLocalDynamicTemplateDraft(localBase, {
          asCopy: draft.sourceType === "local" && options.asCopy,
          name: options.name,
        });
        useTemplateEditorSession.getState().markSaved(savedDraft);
        window.dispatchEvent(new Event(DYNAMIC_TEMPLATE_LOCAL_DRAFT_CHANGED_EVENT));
        message.success(options.asCopy
          ? `“${savedDraft.definition.name}”已另存为本机测试草稿`
          : "已保存为本机测试草稿；未写入服务端模板");
        return true;
      }
      let response: unknown;
      if (options.asCopy && draft.sourceType === "persisted") {
        response = await dynamicTemplateApi.saveAs(draft.definition.templateId, {
          name: (options.name ?? `${draft.definition.name} 副本`).trim(),
          versionNote: draft.versionNote,
        });
      } else {
        const definition = structuredClone(draft.definition);
        if (options.name?.trim()) definition.name = options.name.trim();
        if (options.asCopy) definition.templateId = createDynamicTemplateStableId("tpl");
        response = draft.sourceType === "persisted" && draft.remote && !options.asCopy
          ? await dynamicTemplateApi.updateDraft(draft.definition.templateId, {
              expectedRevision: draft.remote.revision,
              definition,
              versionNote: draft.versionNote,
            })
            : await dynamicTemplateApi.create({
              definition,
              versionNote: draft.versionNote,
              ...((options.asCopy ? draft.definition.templateId : draft.sourceReference)
                ? { sourceReference: options.asCopy ? draft.definition.templateId : draft.sourceReference }
                : {}),
            });
      }
      const saved = unwrapResponse<DynamicTemplateResource>(response);
      const savedDraft = saved ? createPersistedDynamicTemplateDraft(saved) : null;
      if (!savedDraft) throw new Error("服务端没有返回可编辑模板草稿");
      useTemplateEditorSession.getState().markSaved(savedDraft);
      notifyDynamicTemplateCatalogChanged();
      message.success(options.asCopy
        ? `“${savedDraft.definition.name}”副本已保存为新的账号模板`
        : "模板草稿已保存，可继续设计或发布");
      return true;
    } catch (error) {
      useTemplateEditorSession.getState().setSaveStatus("error");
      message.error(getEditorErrorMessage(error, "模板保存失败，当前修改仍完整保留"));
      return false;
    }
  }, [canManageTemplates, message]);

  const publishDynamicTemplateDraft = useCallback(async (): Promise<boolean> => {
    if (USE_MOCK) {
      message.info("Mock 模式只保存本机测试草稿，不支持服务端发布");
      return false;
    }
    if (!canManageTemplates || templatePublishInFlightRef.current) return false;
    templatePublishInFlightRef.current = true;
    setTemplatePublishing(true);
    const releasePublishing = () => {
      templatePublishInFlightRef.current = false;
      setTemplatePublishing(false);
    };
    let state = useTemplateEditorSession.getState();
    if (!state.draft) {
      releasePublishing();
      return false;
    }
    if (state.dirty || state.draft.sourceType === "local") {
      const saved = await persistTemplateDraft();
      if (!saved) {
        releasePublishing();
        return false;
      }
      state = useTemplateEditorSession.getState();
    }
    const draft = state.draft;
    if (!draft || draft.sourceType !== "persisted" || !draft.remote) {
      releasePublishing();
      message.error("模板草稿尚未建立服务端版本，无法发布");
      return false;
    }
    return await new Promise<boolean>((resolve) => {
      let settled = false;
      const settle = (result: boolean) => {
        if (settled) return;
        settled = true;
        releasePublishing();
        resolve(result);
      };
      modal.confirm({
        title: `确认发布模板 v${draft.remote!.publishedVersion + 1}`,
        width: 560,
        okText: "确认发布模板",
        cancelText: "取消",
        maskClosable: false,
        content: (
          <div style={{ display: "grid", gap: 12 }}>
            <p style={{ margin: 0 }}>
              本次只创建不可变的模板新版本，不会修改任何页面草稿、线上页面或页面方案。
            </p>
            <p style={{ margin: 0 }}>
              已有页面实例会继续锁定当前模板版本；如需使用新版，必须在页面装修中显式升级草稿并重新发布页面。
            </p>
          </div>
        ),
        onOk: async () => {
          try {
            const publishResponse = await dynamicTemplateApi.publish(
              draft.definition.templateId,
              {
                expectedRevision: draft.remote!.revision,
                ...(draft.versionNote ? { versionNote: draft.versionNote } : {}),
              },
            );
            const published = unwrapResponse<DynamicTemplatePublishResultResource>(
              publishResponse,
            );
            if (
              !published
              || published.templateId !== draft.definition.templateId
              || published.version !== draft.remote!.publishedVersion + 1
              || !Number.isInteger(published.draft?.revision)
            ) {
              throw new Error("服务端返回的模板发布结果与当前草稿不一致");
            }
            const current = useTemplateEditorSession.getState();
            const currentDraft = current.draft;
            if (
              currentDraft?.sourceType === "persisted"
              && currentDraft.remote
              && currentDraft.definition.templateId === published.templateId
              && currentDraft.remote.revision === draft.remote!.revision
            ) {
              const nextDraft = structuredClone(currentDraft);
              nextDraft.versionNote = "";
              nextDraft.remote = {
                databaseId: currentDraft.remote.databaseId,
                revision: published.draft.revision,
                publishedVersion: published.version,
                baseVersion: published.version,
              };
              current.markSaved(nextDraft);
            }
            notifyDynamicTemplateCatalogChanged();
            message.success(`模板 v${published.version} 已发布；现有页面仍保持原版本`);
            settle(true);
          } catch (error) {
            message.error(getEditorErrorMessage(
              error,
              "模板发布失败，当前模板草稿和页面会话仍保留",
            ));
            settle(false);
          }
        },
        onCancel: () => settle(false),
      });
    });
  }, [canManageTemplates, message, modal, persistTemplateDraft]);

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
                  return (
                    <div className="homepage-editor__hidden-block">
                      此模块已隐藏，不会发布到前台
                    </div>
                  );
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

  useEffect(() => {
    latestData.current = data;
  }, [data]);

  useEffect(() => {
    // 解析结果按页面会话隔离。切换页面时必须先清空，避免另一页面暂存的
    // 精确模板版本短暂参与当前画布渲染。
    replaceResolvedDynamicTemplates(undefined);
  }, [pageKey]);

  useEffect(() => {
    // resolvedDynamicTemplates 是服务端注入的只读解析缓存，不是页面实例
    // 的业务数据。Puck 的撤销/重做快照会省略未知顶层字段；此时保留当前
    // 页面会话已验证的精确版本，不能把“字段缺失”解释为“清空缓存”。
    const resolvedDefinitions = data[DYNAMIC_TEMPLATE_RESOLVED_DEFINITIONS_KEY];
    if (
      resolvedDefinitions
      && typeof resolvedDefinitions === "object"
      && !Array.isArray(resolvedDefinitions)
      && Object.keys(resolvedDefinitions).length > 0
    ) {
      replaceResolvedDynamicTemplates(resolvedDefinitions);
    }
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
      setPublishValidationStatus("idle");
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
        // 同时拉取线上已发布版本与后台草稿。店铺装修入口始终进入可编辑状态：
        // 有后台草稿时加载草稿；仅有线上版本时以线上内容作为新草稿的编辑基线。
        const [publishedResponse, adminResponse, templateCatalogResponse] = await Promise.all([
          pageDocumentApi.getPublishedAdmin(pageKey),
          pageDocumentApi.getAdmin(pageKey),
          dynamicTemplateApi.listCatalog().catch(() => null),
        ]);
        if (cancelled) return;
        const publishedDoc = unwrapResponse<PageDocumentResource | null>(publishedResponse);
        const adminDoc = unwrapResponse<PageDocumentResource | null>(adminResponse);
        const publishedPuck = getPuckDocument(publishedDoc?.puckData);
        const draftPuck = getPuckDocument(adminDoc?.puckData);

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

        publishedMetadataRef.current = normalizePuckMetadata(publishedDoc?.metadata);

        // 编辑基准：后台草稿始终优先；没有草稿时才以线上版本作为新草稿基线。
        // 「查看线上版本」只由运营主动触发，不再作为进入店铺装修时的默认模式。
        if (publishedPuck || draftPuck) {
          const displayPuck = draftPuck ?? publishedPuck;
          if (!displayPuck) return;
          // 历史模块别名（分割面板/图文混排/礼赠指南）只在编辑器读取时规范化；
          // 公开 Renderer 继续按原类型重放已发布历史版本。
          serverData = ensureEditorPageStructure(
            pageKey,
            migratePuckData(displayPuck),
          );
          const persistedServerData = serverData;
          const templateCatalog = templateCatalogResponse
            ? unwrapResponse<TemplateCatalogResource>(templateCatalogResponse)
            : null;
          const personalTemplates = Array.isArray(templateCatalog?.items)
            ? templateCatalog.items.flatMap((item) => (
                item.kind === "personal-compatibility"
                  ? [item.template as PersonalContentTemplate]
                  : []
              ))
            : [];
          const personalUpgrade = upgradePersonalTemplateInstances(
            serverData as unknown as Record<string, unknown>,
            Array.isArray(personalTemplates) ? personalTemplates : [],
          );
          if (personalUpgrade.upgradedCount > 0) {
            serverData = personalUpgrade.document as unknown as PuckDocument;
            controlledCanvasStateRef.current = {
              hasUnsavedChanges: true,
              baselineSignature: dataSignature(persistedServerData),
            };
          }
          const displayMetadata = draftPuck
            ? normalizePuckMetadata(adminDoc?.metadata)
            : normalizePuckMetadata(publishedDoc?.metadata);
          setData(serverData);
          latestData.current = serverData;
          dataSignatureRef.current = personalUpgrade.upgradedCount > 0
            ? dataSignature(persistedServerData)
            : dataSignature(serverData);
          setMetadata(displayMetadata);
          latestMetadata.current = displayMetadata;
          setViewingPublished(false);
          if (personalUpgrade.upgradedCount > 0) {
            setHasUnsavedChanges(true);
            message.info(`已将 ${personalUpgrade.upgradedCount} 个历史模板实例布局升级到最新版本；真实内容保持不变，尚未保存或发布`);
          }
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
        pendingDraftRef.current = nextHasPendingDraft && draftPuck
          ? ensureEditorPageStructure(pageKey, migratePuckData(draftPuck))
          : null;
        publishedBaselineRef.current = publishedPuck
          ? canonicalizePageContent(publishedPuck, publishedDoc?.metadata)
          : null;
        publishedDataRef.current = publishedPuck
          ? ensureEditorPageStructure(pageKey, migratePuckData(publishedPuck))
          : null;
      } catch (error) {
        if (!cancelled) {
          // 接口失败不能伪装成“没有草稿”，否则后续显式保存可能覆盖已有装修内容。
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
  }, [loadAttempt, message, pageKey]);

  const syncCanvasDataWithoutAdvancingSavedBaseline = useCallback(
    (nextData: unknown) => {
      const nextDocument = getPuckDocument(nextData);
      if (!nextDocument) return;
      setData(nextDocument);
      latestData.current = nextDocument;
      setCanvasDataSyncVersion((version) => version + 1);
    },
    [],
  );

  const trackEditorData = useCallback((nextData: unknown) => {
    const nextDocument = getPuckDocument(nextData);
    if (!nextDocument) return;
    latestData.current = nextDocument;
    const controlledState = controlledCanvasStateRef.current;
    if (controlledState) {
      controlledCanvasStateRef.current = null;
      // Puck 会在整页替换时补齐默认字段。服务端草稿采用归一化结果
      // 建立新基线；从线上比较返回时则恢复进入前的已保存基线与脏状态。
      dataSignatureRef.current =
        controlledState.baselineSignature ?? dataSignature(nextDocument);
      setHasUnsavedChanges(controlledState.hasUnsavedChanges);
      setValidationRevision((revision) => revision + 1);
      return;
    }
    // 规范化比较(忽略 block id/键序/非 content 字段):
    // Puck 首帧会 normalize 画布数据,JSON 全等会让每次进入编辑器都误报"有未保存修改"
    const changed = dataSignature(nextDocument) !== dataSignatureRef.current;
    setHasUnsavedChanges(changed);
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
    if (USE_MOCK) {
      setPublishIssues([]);
      setPublishValidationStatus("unverified");
      return;
    }
    const controller = new AbortController();
    const requestId = ++validationRequestRef.current;
    setPublishValidationStatus("validating");
    const expectedSignature = canonicalizePageContent(
      latestData.current,
      latestMetadata.current,
    );
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
          const issues = resolvePublishValidationIssues(result);
          setPublishIssues(issues);
          setPublishValidationStatus(
            issues.some((issue) => issue.severity === "error") ? "invalid" : "valid",
          );
        })
        .catch((error) => {
          if (controller.signal.aborted || requestId !== validationRequestRef.current) return;
          // 失败时不能继续把上一轮问题伪装成当前结论；草稿仍完整保留，
          // 运营可从工具栏原位重试同一个服务端预检。
          setPublishIssues([]);
          setPublishValidationStatus("unavailable");
          if (import.meta.env.DEV) console.warn("[PageDocument validate]", error);
        });
    }, 650);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [initialLoading, loadError, loadedPageKey, metadata, pageKey, validationRevision]);

  const retryPublishValidation = useCallback(() => {
    setValidationRevision((revision) => revision + 1);
  }, []);

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
      const requestedData = getPuckDocument(nextData) ?? latestData.current;
      const requestedMetadata = latestMetadata.current;
      const save = async (): Promise<boolean> => {
        const editableData = requestedData;
        const isActivePage = () => targetPageKey === activePageKeyRef.current;
        // 顶栏手动保存才点亮按钮 loading 与成功提示；发布前、保存并离开等
        // 内部显式保存使用 silent，避免重复成功提示。
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
          const savedDocument = unwrapResponse<PageDocumentResource | null>(response);
          // 服务端会在保存时移除旧联系电话、门店资料等业务事实副本。
          // 后续画布、缓存与发布校验必须以服务端回包为准，否则当前会话会继续
          // 持有已经从数据库清除的旧字段，直到刷新页面后才恢复一致。
          const persistedData = getPuckDocument(savedDocument?.puckData) ?? editableData;
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

  // 2026-08-16 批次 D（用户决策）：2 秒自动保存已移除，改为显式保存模型——
  // 手动"保存草稿" + UnsavedChangesGuard（路由级离开时保存或返回编辑）+ beforeunload 三层。
  // 历史 reason：自动保存曾作为 SPA 跳转的静默兜底，用户判定其无价值且干扰草稿管理。

  const switchEditorPage = useCallback(
    async (path: string) => {
      const targetPage = getEditorPageByPath(path);
      if (!targetPage || targetPage.key === pageKey) return;
      // 未保存修改由 UnsavedChangesGuard 拦截（保存并离开/继续编辑），此处纯导航。
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
    if (!hasAnyProtectedChanges) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasAnyProtectedChanges]);

  // 草稿保护（2026-08-16 起的显式保存模型）：
  // 1. useBlocker（UnsavedChangesGuard）：SPA 路由跳转只提供保存并离开或继续编辑；
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
      const adminDoc = unwrapResponse<PageDocumentResource | null>(adminResponse);
      const draftPuck = getPuckDocument(adminDoc?.puckData);
      const hasDraft = Boolean(draftPuck);
      const currentPublishedRevision = revisionList.find((revision) => revision.isPublished);
      const currentPublishedPuck = currentPublishedRevision?.puckData ?? null;
      const currentPublishedMetadata = currentPublishedRevision?.metadata ?? null;
      const hasPublished = currentPublishedPuck != null;
      const hasPendingDraft =
        canonicalizePageContent(draftPuck, adminDoc?.metadata) !==
        canonicalizePageContent(currentPublishedPuck, currentPublishedMetadata);
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
    (puckData: unknown, draftMetadata?: PuckProps) => {
      const document = getPuckDocument(puckData);
      if (!document) return;
      const structured = ensureEditorPageStructure(
        pageKey,
        migratePuckData(document),
      );
      controlledCanvasStateRef.current = {
        hasUnsavedChanges: false,
        baselineSignature: null,
      };
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
      const adminDoc = unwrapResponse<PageDocumentResource | null>(adminResponse);
      const draftPuck = getPuckDocument(adminDoc?.puckData);
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

  const openPageSettingsForEditing = useCallback((focusField?: string) => {
    if (viewingPublishedRef.current) {
      if (editingDraftSnapshotRef.current) {
        returnToEditingDraft();
      } else {
        // 首次打开且没有独立草稿时，当前线上内容就是新草稿的编辑基线。
        viewingPublishedRef.current = false;
        setViewingPublished(false);
      }
    }
    setPageSettingsFocusField(focusField ?? null);
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
        if (!expectedUpdatedAt) {
          setDraftDiscardError("当前页面版本标识缺失，请刷新页面后再放弃草稿");
          return;
        }
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
          const adminDoc = unwrapResponse<PageDocumentResource | null>(adminResponse);
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
      // 页面设置已经进入当前内存草稿；即使持久化失败也必须触发离开保护，
      // 不能关闭抽屉后把内容负责人、SEO 或授权编号静默丢失。
      setHasUnsavedChanges(true);
      setValidationRevision((revision) => revision + 1);
      const saved = await saveDraft(latestData.current, { silent: true });
      if (saved) {
        setPageSettingsOpen(false);
        message.success("页面设置已保存");
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
              action: "restore",
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
            const document = unwrapResponse<PageDocumentResource | null>(response);
            const restoredPuck = getPuckDocument(document?.puckData);
            if (restoredPuck) {
              const restoredData = ensureEditorPageStructure(
                pageKey,
                migratePuckData(restoredPuck),
              );
              controlledCanvasStateRef.current = {
                hasUnsavedChanges: false,
                baselineSignature: null,
              };
              setData(restoredData);
              latestData.current = restoredData;
              // 恢复接口已经把该版本写成服务端草稿；Puck 随后的 setData 回调
              // 不应把这次受控整页替换误判为尚未保存的本地编辑。
              dataSignatureRef.current = dataSignature(restoredData);
              const restoredMetadata = normalizePuckMetadata(document?.metadata);
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
                document?.updatedAt || new Date().toISOString();
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
              action: "restore",
            });
          } finally {
            setRestoringVersion(null);
          }
        },
      });
    },
    [hasProtectedUnsavedChanges, message, modal, pageKey],
  );

  const rollbackPublication = useCallback(
    (revision: PageDocumentRevision) => {
      const currentPublished = revisions.find((item) => item.isPublished);
      if (!currentPublished) {
        setRevisionFailure({ message: "当前线上版本指针缺失，不能执行回滚" });
        return;
      }
      modal.confirm({
        title: `回滚线上到版本 ${revision.version}？`,
        content:
          "此操作只切换线上发布指针，不会覆盖当前页面草稿，也不会修改或删除任何历史版本。",
        okText: "确认回滚线上",
        cancelText: "取消",
        onOk: async () => {
          setRollingBackRevisionId(revision.id);
          setRevisionFailure(null);
          try {
            const response = await pageDocumentApi.rollbackPublication(
              pageKey,
              revision.id,
              currentPublished.id,
            );
            const updatedDocument = unwrapResponse<PageDocumentResource | null>(response);
            const cached = pageSessionCacheRef.current[pageKey];
            if (cached && updatedDocument?.updatedAt) {
              pageSessionCacheRef.current[pageKey] = {
                ...cached,
                updatedAt: updatedDocument.updatedAt,
              };
            }

            const publishedResponse = await pageDocumentApi.getPublishedAdmin(pageKey);
            const publishedDocument = unwrapResponse<PageDocumentResource | null>(publishedResponse);
            const publishedPuck = getPuckDocument(publishedDocument?.puckData);
            if (!publishedPuck) throw new Error("回滚后未能读取新的线上版本");
            const nextPublishedData = ensureEditorPageStructure(
              pageKey,
              migratePuckData(publishedPuck),
            );
            const nextPublishedMetadata = normalizePuckMetadata(publishedDocument?.metadata);
            const nextPublishedBaseline = canonicalizePageContent(
              nextPublishedData,
              nextPublishedMetadata,
            );
            publishedDataRef.current = nextPublishedData;
            publishedMetadataRef.current = nextPublishedMetadata;
            publishedBaselineRef.current = nextPublishedBaseline;
            setHasPendingDraft(
              canonicalizePageContent(latestData.current, latestMetadata.current)
                !== nextPublishedBaseline,
            );
            if (viewingPublishedRef.current) {
              setData(nextPublishedData);
              latestData.current = nextPublishedData;
              setMetadata(nextPublishedMetadata);
              latestMetadata.current = nextPublishedMetadata;
              dataSignatureRef.current = dataSignature(nextPublishedData);
            }
            setRevisions((items) => items.map((item) => ({
              ...item,
              isPublished: item.id === revision.id,
            })));
            message.success(`线上页面已回滚到版本 ${revision.version}；当前草稿保持不变`);
            await loadRevisions();
          } catch (error) {
            setRevisionFailure({
              message: getEditorErrorMessage(error, "线上回滚失败，请稍后重试"),
              revision,
              action: "rollback",
            });
            throw error;
          } finally {
            setRollingBackRevisionId(null);
          }
        },
      });
    },
    [loadRevisions, message, modal, pageKey, revisions],
  );

  const publishHome = async (
    nextData: unknown,
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

    const showBlockingIssues = (issues: PublishValidationIssue[]) => {
      modal.error({
        title: `暂不能发布 · ${issues.length} 项问题待处理`,
        width: 620,
        content: (
          <div role="alert" aria-label="页面发布阻断清单">
            <p>当前草稿已经安全保存；修复以下问题后再发布：</p>
            <ol style={{ maxHeight: 320, overflowY: "auto", paddingInlineStart: 22 }}>
              {issues.map((issue, index) => (
                <li key={`${issue.path ?? ""}-${issue.message}-${index}`}>
                  {issue.message}
                </li>
              ))}
            </ol>
          </div>
        ),
        okText: "返回修改",
      });
    };

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
      if (!persistedDraft?.updatedAt) {
        message.error("当前页面版本标识缺失，请刷新页面后再发布");
        return;
      }
      const persistedUpdatedAt = persistedDraft.updatedAt;

      // 发布前以刚保存的服务端草稿重新校验。异步编辑预检只负责即时反馈，
      // 不能代替本次发布动作的同源、最新资格判断。
      const validationResponse = await pageDocumentApi.validate(
        pageKey,
        publishData,
        publishMetadata,
      );
      const validation = unwrapResponse<{
        valid: boolean;
        errors: string[];
        issues?: PublishValidationIssue[];
      }>(validationResponse);
      const validationIssues = resolvePublishValidationIssues(validation ?? {});
      const blockingIssues = validationIssues.filter((issue) => issue.severity === "error");
      setPublishIssues(validationIssues);

      if (!validation?.valid || blockingIssues.length > 0) {
        showBlockingIssues(blockingIssues.length > 0
          ? blockingIssues
          : (validation?.errors ?? []).map((errorMessage) => ({
              message: errorMessage,
              severity: "error" as const,
            })));
        return;
      }

      const publishPersistedDraft = async () => {
        setPublishing(true);
        try {
          if (
            canonicalizePageContent(
              latestData.current,
              latestMetadata.current,
            ) !== publishSourceSignature
          ) {
            message.warning(
              "发布确认期间页面又发生了修改；新修改仍完整保留，请重新发布",
            );
            return;
          }

          const publishResponse = await pageDocumentApi.publish(
            pageKey,
            undefined,
            persistedUpdatedAt,
          );
          const publishedDocument = unwrapResponse<PageDocumentResource | null>(publishResponse);
          const publishedData = getPuckDocument(publishedDocument?.puckData) ?? publishData;
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
          if (getEditorHttpStatus(error) === 400) {
            try {
              const refreshedResponse = await pageDocumentApi.validate(
                pageKey,
                publishData,
                publishMetadata,
              );
              const refreshed = unwrapResponse<{
                valid: boolean;
                errors: string[];
                issues?: PublishValidationIssue[];
              }>(refreshedResponse);
              const refreshedIssues = resolvePublishValidationIssues(refreshed ?? {});
              const refreshedBlockers = refreshedIssues.filter(
                (issue) => issue.severity === "error",
              );
              setPublishIssues(refreshedIssues);
              if (refreshedBlockers.length > 0) {
                showBlockingIssues(refreshedBlockers);
                return;
              }
            } catch {
              // 保留下面的安全通用错误；不把内部响应正文透传到后台页面。
            }
          }
          message.error(getEditorErrorMessage(error, "发布失败，请稍后重试"));
        } finally {
          setPublishing(false);
        }
      };

      await publishPersistedDraft();
    } catch (error) {
      message.error(getEditorErrorMessage(error, "发布前校验失败，请稍后重试"));
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="homepage-editor">
      <RevisionDrawer
        open={revisionsOpen}
        revisions={revisions}
        loading={revisionsLoading}
        restoringVersion={restoringVersion}
        rollingBackRevisionId={rollingBackRevisionId}
        canRollback={canPublish}
        draft={draftSnapshot}
        error={revisionFailure?.message ?? null}
        retryLabel={
          revisionFailure?.revision
            ? revisionFailure.action === "rollback"
              ? `重新回滚到版本 ${revisionFailure.revision.version}`
              : `重新恢复版本 ${revisionFailure.revision.version}`
            : "重新加载"
        }
        onClose={() => setRevisionsOpen(false)}
        onRetry={() => {
          if (revisionFailure?.revision) {
            if (revisionFailure.action === "rollback") {
              rollbackPublication(revisionFailure.revision);
            } else {
              restoreRevision(revisionFailure.revision);
            }
            return;
          }
          void loadRevisions();
        }}
        onRestore={restoreRevision}
        onRollback={rollbackPublication}
        onEditDraft={editDraftFromRevisions}
      />

      <PageSettingsDrawer
        open={pageSettingsOpen}
        pageKey={pageKey}
        metadata={metadata}
        puckData={data}
        publishIssues={publishIssues}
        validationStatus={publishValidationStatus}
        focusField={pageSettingsFocusField}
        onRetryValidation={retryPublishValidation}
        onClose={() => {
          setPageSettingsOpen(false);
          setPageSettingsFocusField(null);
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
          {workspaceMode === "page" ? (
            <CanvasSelectionDock readOnly={viewingPublished} />
          ) : null}
          {workspaceMode === "page" ? (
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
            canManageTemplates={canManageTemplates}
            draftSavedAtLabel={pageSessionCacheRef.current[pageKey]?.lastSaved ?? null}
            publishValidationStatus={publishValidationStatus}
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
            onEnterTemplateMode={openEmptyTemplateWorkspace}
            restoreViewport={pageViewportBeforeTemplateRef.current}
            />
          ) : null}
          <div
            className={`homepage-editor__page-workspace${workspaceMode === "template" ? " is-inactive" : ""}`}
            aria-hidden={workspaceMode === "template" || undefined}
          >
            <EditorBody
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
              validationStatus={publishValidationStatus}
              onRetryValidation={retryPublishValidation}
              onOpenPageSettings={openPageSettingsForEditing}
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
              <TemplateWorkspace
                onPersist={persistTemplateDraft}
                onPublish={USE_MOCK ? undefined : publishDynamicTemplateDraft}
                localOnly={USE_MOCK}
                publishing={templatePublishing}
                onReturnPage={returnToPageWorkspace}
                onOpenSystemTemplate={openSystemTemplateWorkspace}
                onOpenPersonalTemplate={openPersonalTemplateWorkspace}
                onCreateDynamicTemplate={openNewDynamicTemplateWorkspace}
                onOpenDynamicTemplate={openDynamicTemplateWorkspace}
                onOpenPersistedDynamicTemplate={openPersistedDynamicTemplateWorkspace}
              />
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
            const savedTemplate = await persistTemplateDraft();
            if (!savedTemplate) return false;
          }
          if (!hasProtectedUnsavedChanges) return true;
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
