import { App as AntdApp, Alert, Button, Input, Modal, Spin } from "antd";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import "./TemplateWorkspace.css";
import DynamicTemplateCanvas from "./DynamicTemplateCanvas";
import DynamicTemplateInspectorPanel from "./DynamicTemplateInspectorPanel";
import { TemplateTrialPreviewControls } from "./TemplateTrialContentControls";
import DynamicTemplateStructurePanel from "./DynamicTemplateStructurePanel";
import TemplateEditorToolbar from "./TemplateEditorToolbar";
import NewTemplateRecipeModal from "../template-creation/NewTemplateRecipeModal";
import {
  exportDynamicTemplateDraftJson,
} from "./dynamicTemplateDraftRepository";
import WorkspacePanelHeader from "../workspace/WorkspacePanelHeader";
import WorkspacePanelCollapseButton from "../workspace/WorkspacePanelCollapseButton";
import useCompactWorkspaceOverlay, {
  COMPACT_WORKSPACE_QUERY,
  DOCKED_WORKSPACE_QUERY,
} from "../workspace/useCompactWorkspaceOverlay";
import { AppstoreOutlined, BlockOutlined, ControlOutlined } from "@ant-design/icons";
import TemplateEditorLibrary, {
  type ArchivableTemplateEditorLibraryTarget,
  type TemplateEditorLibraryTarget,
} from "./TemplateEditorLibrary";
import type { TemplateWorkspaceController } from "./TemplateWorkspaceController";
import type { TemplateInspectorIssueTarget } from "./templateInspectorCapabilities";
import {
  DynamicTemplateRenderer,
  type TemplateDefinitionV2,
} from "../template-definition";
import {
  type DynamicTemplateResource,
  type PublishedDynamicTemplateResource,
  type DynamicTemplateVersionSummaryResource,
  type DynamicTemplateVersionResource,
} from "@/services/clients/dynamicTemplateClient";
import { summarizeTemplateHistoryDiff } from "./templateHistoryDiff";
import {
  type TemplateInspectorTask,
  type TemplateInspectorView,
  type TemplateWorkspaceScrollState,
  useTemplateEditorSession,
} from "./templateEditorSession";
import {
  projectTemplateEditorSelectionSnapshot,
  type TemplateEditorSelectionSnapshot,
} from "./templateEditorSelection";
import { focusFirstInvalidNumberField } from "../inspector/controls/NumberField";
import {
  TEMPLATE_STRESS_PREVIEW_SCENARIOS,
  type TemplateStressPreviewScenario,
} from "./templateStressPreviewEngine";

const STRESS_PREVIEW_LABELS: Record<TemplateStressPreviewScenario, string> = {
  "short-text": "短文字与中性内容",
  "long-text": "超长文字与换行",
  "optional-missing": "可选内容缺失",
  "required-missing": "必填内容缺失",
  "media-ratios": "横、方、竖媒体比例",
};

const MEDIA_PREVIEW_SLOT_TYPES = new Set([
  "image", "heroTemplate",
]);

function describeStressPreview(
  definition: TemplateDefinitionV2,
  scenario: TemplateStressPreviewScenario,
) {
  const slots = Object.values(definition.slots);
  const requiredCount = slots.filter((slot) => slot.required).length;
  const optionalCount = slots.length - requiredCount;
  const mediaCount = slots.filter((slot) => MEDIA_PREVIEW_SLOT_TYPES.has(slot.type)).length;
  if (scenario === "optional-missing") {
    return optionalCount > 0
      ? `已将 ${optionalCount} 个可选槽位置空；画布按公开页规则收起这些槽位，不显示“待填写”假内容。`
      : "不适用：当前模板没有可选槽位。";
  }
  if (scenario === "required-missing") {
    return requiredCount > 0
      ? `已将 ${requiredCount} 个必填槽位置空；公开页不显示占位，发布检查必须报告这些缺失项。`
      : "不适用：当前模板没有必填槽位，请先在页面开放范围中设置需要强制填写的字段。";
  }
  if (scenario === "media-ratios") {
    return mediaCount > 0
      ? `正在按结构顺序为 ${mediaCount} 个媒体槽位轮换横图、方图和竖图，检查裁切与容器稳定性。`
      : "不适用：当前模板没有媒体槽位。";
  }
  if (scenario === "long-text") {
    return "已按每个字段的长度上限生成长文字，用于检查换行、截断和高度稳定性。";
  }
  return "使用中性短内容检查模板的基础构图、顺序和间距。";
}

const WORKSPACE_SCROLL_SELECTORS = {
  structure: ".template-editor__body > .template-editor__structure .template-editor__structure-scroll",
  canvas: ".template-editor__body > .template-editor__stage .template-editor__canvas-scroll",
  inspector: ".template-editor__body > .template-editor__right-workspace .template-editor__inspector .homepage-editor__inspector-scroll",
} as const;

interface TemplatePreviewDomScrollSnapshot {
  structure: number;
  canvasTop: number;
  canvasLeft: number;
  inspector: number;
}

interface TemplatePreviewEntrySnapshot {
  sessionId: string;
  templateId: string;
  selectionSnapshot: TemplateEditorSelectionSnapshot;
  device: "desktop" | "mobile";
  canvasZoom: number | null;
  inspectorTask: TemplateInspectorTask;
  inspectorView: TemplateInspectorView;
  workspaceScroll: TemplateWorkspaceScrollState;
  domScroll: TemplatePreviewDomScrollSnapshot;
  structureCollapsed: boolean;
  inspectorCollapsed: boolean;
  previewScenario: TemplateStressPreviewScenario;
  focusElement: HTMLElement | null;
}

type TemplatePreviewOwner = Pick<TemplatePreviewEntrySnapshot, "sessionId" | "templateId">;

interface TemplatePublishReviewFocusSnapshot extends TemplatePreviewOwner {
  focusElement: HTMLElement | null;
}

interface CompactPanelInertState {
  hadAttribute: boolean;
  attributeValue: string | null;
  propertyValue: boolean;
}

interface CompactPanelInertLease {
  owner: TemplatePreviewOwner;
  original: CompactPanelInertState;
}

interface CompactOverlayPreference {
  owner: TemplatePreviewOwner;
  structureOpen: boolean;
  inspectorOpen: boolean;
}

const compactPanelInertLeases = new WeakMap<HTMLElement, CompactPanelInertLease>();

function isSameTemplateWorkspaceOwner(
  current: TemplatePreviewOwner,
  expected: TemplatePreviewOwner,
) {
  return current.sessionId === expected.sessionId && current.templateId === expected.templateId;
}

function isCurrentTemplateIdentityOwner(owner: TemplatePreviewOwner) {
  const state = useTemplateEditorSession.getState();
  return state.sessionId === owner.sessionId
    && state.draft?.definition.templateId === owner.templateId;
}

function isCurrentTemplateWorkspaceOwner(owner: TemplatePreviewOwner) {
  const state = useTemplateEditorSession.getState();
  return !state.previewMode
    && state.sessionId === owner.sessionId
    && state.draft?.definition.templateId === owner.templateId;
}

function isVisibleOperableFocusTarget(element: HTMLElement | null): element is HTMLElement {
  if (!element?.isConnected || element.closest("[inert]")) return false;
  if (element instanceof HTMLButtonElement && element.disabled) return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none"
    && style.visibility !== "hidden"
    && element.getClientRects().length > 0;
}

function useCompactPanelIsolation({
  active,
  bodyRef,
  panelRef,
  owner,
}: {
  active: boolean;
  bodyRef: RefObject<HTMLDivElement | null>;
  panelRef: RefObject<HTMLElement | null>;
  owner: TemplatePreviewOwner | null;
}) {
  useEffect(() => {
    if (!active || !owner || !isCurrentTemplateWorkspaceOwner(owner)) return undefined;
    const ownsEditableWorkspace = () => isCurrentTemplateWorkspaceOwner(owner);
    const body = bodyRef.current;
    const panel = panelRef.current;
    if (!ownsEditableWorkspace() || !body || !panel) return undefined;

    const leasedElements = new Set<HTMLElement>();
    const makeInert = (element: HTMLElement | null) => {
      if (!ownsEditableWorkspace() || !element || element === panel) return;
      const existingLease = compactPanelInertLeases.get(element);
      if (!existingLease) {
        compactPanelInertLeases.set(element, {
          owner,
          original: {
            hadAttribute: element.hasAttribute("inert"),
            attributeValue: element.getAttribute("inert"),
            propertyValue: element.inert,
          },
        });
      } else if (!isSameTemplateWorkspaceOwner(existingLease.owner, owner)) {
        compactPanelInertLeases.set(element, { ...existingLease, owner });
      }
      leasedElements.add(element);
      element.inert = true;
    };
    const toolbarHost = body.ownerDocument.getElementById("admin-editor-toolbar-slot");
    const findToolbar = () => (
      toolbarHost?.querySelector<HTMLElement>(".template-editor__toolbar")
      ?? body.parentElement?.querySelector<HTMLElement>(".template-editor__toolbar")
      ?? null
    );
    const isolatePanel = () => {
      if (!ownsEditableWorkspace()) return;
      Array.from(body.children).forEach((child) => {
        if (child instanceof HTMLElement) makeInert(child);
      });
      makeInert(findToolbar());
    };

    isolatePanel();
    const observer = new MutationObserver(() => {
      if (ownsEditableWorkspace()) isolatePanel();
    });
    observer.observe(body, { childList: true });
    if (body.parentElement) observer.observe(body.parentElement, { childList: true });
    const toolbarMutationRoot = toolbarHost ?? findToolbar()?.parentElement;
    if (toolbarMutationRoot) observer.observe(toolbarMutationRoot, { childList: true });
    return () => {
      observer.disconnect();
      const state = useTemplateEditorSession.getState();
      const hasReplacementOwner = Boolean(state.sessionId && state.draft?.definition.templateId);
      if (!isCurrentTemplateIdentityOwner(owner) && hasReplacementOwner) return;
      leasedElements.forEach((element) => {
        const lease = compactPanelInertLeases.get(element);
        if (!lease || !isSameTemplateWorkspaceOwner(lease.owner, owner)) return;
        element.inert = lease.original.propertyValue;
        if (lease.original.hadAttribute) {
          element.setAttribute("inert", lease.original.attributeValue ?? "");
        } else {
          element.removeAttribute("inert");
        }
        compactPanelInertLeases.delete(element);
      });
    };
  }, [active, bodyRef, owner, panelRef]);
}

export default function TemplateWorkspace({
  controller,
}: {
  controller: TemplateWorkspaceController;
}) {
  const { message, modal } = AntdApp.useApp();
  const [newTemplateSizeOpen, setNewTemplateSizeOpen] = useState(false);
  const [trialTargetNodeId, setTrialTargetNodeId] = useState<string | undefined>();
  const [rename, setRename] = useState<{ templateId: string; name: string } | null>(null);
  const {
    localOnly,
    publishing,
    publishReview,
    publishedDraftAvailability,
    lifecycleBusy,
    draft,
    selectedObjectLabel,
    dirty,
    hasBaseline,
    device,
    previewMode,
    previewScenario,
    saveStatus,
    sessionId,
    readWorkspaceScroll,
    updateWorkspaceScroll,
  } = controller;
  const activeTemplateId = draft?.definition.templateId;
  const [structureCollapsed, setStructureCollapsed] = useState(() => {
    try {
      if (window.matchMedia(DOCKED_WORKSPACE_QUERY).matches) return false;
      const stored = sessionStorage.getItem("template-editor-structure-collapsed");
      if (stored === "1") return true;
      if (stored === "0") return false;
    } catch {
      /* 工作区偏好不可用时使用当前视口默认值 */
    }
    return typeof window !== "undefined" && window.matchMedia("(max-width: 1024px)").matches;
  });
  const [inspectorCollapsed, setInspectorCollapsed] = useState(() => {
    try {
      if (window.matchMedia(DOCKED_WORKSPACE_QUERY).matches) return false;
      return sessionStorage.getItem("template-editor-inspector-collapsed") === "1";
    } catch {
      return false;
    }
  });
  const [showMobileTemplateIdentity, setShowMobileTemplateIdentity] = useState(() => (
    typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches
  ));
  const [compactOverlayModal, setCompactOverlayModal] = useState(() => (
    typeof window !== "undefined" && window.matchMedia("(max-width: 1024px)").matches
  ));
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setShowMobileTemplateIdentity(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1024px)");
    const update = () => setCompactOverlayModal(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useLayoutEffect(() => {
    if (!sessionId || !activeTemplateId || previewMode) return undefined;
    const owner = { sessionId, templateId: activeTemplateId };
    if (!isCurrentTemplateWorkspaceOwner(owner)) return undefined;
    const restoreScroll = readWorkspaceScroll();
    const previewRestore = pendingPreviewDomRestoreRef.current;
    const restoresPreviewEntry = previewRestore?.sessionId === sessionId
      && previewRestore.templateId === activeTemplateId;
    const pendingRestore = new Set(
      Object.keys(WORKSPACE_SCROLL_SELECTORS) as Array<keyof typeof WORKSPACE_SCROLL_SELECTORS>,
    );
    const scrollCleanups = new Map<keyof typeof WORKSPACE_SCROLL_SELECTORS, () => void>();
    const restoreAvailablePanels = () => {
      if (!isCurrentTemplateWorkspaceOwner(owner)) return;
      for (const [key, selector] of Object.entries(WORKSPACE_SCROLL_SELECTORS) as Array<
        [keyof typeof WORKSPACE_SCROLL_SELECTORS, string]
      >) {
        if (!pendingRestore.has(key)) continue;
        const element = document.querySelector<HTMLElement>(selector);
        if (!element) continue;
        const previewTop = key === "canvas"
          ? previewRestore?.domScroll.canvasTop
          : previewRestore?.domScroll[key];
        const targetTop = restoresPreviewEntry && previewTop !== undefined
          ? previewTop
          : restoreScroll[key];
        element.scrollTop = targetTop;
        if (key === "canvas" && restoresPreviewEntry && previewRestore) {
          element.scrollLeft = previewRestore.domScroll.canvasLeft;
        }
        if (
          restoresPreviewEntry
          && (element.scrollTop !== targetTop
            || (key === "canvas" && element.scrollLeft !== previewRestore?.domScroll.canvasLeft))
        ) continue;
        if (!restoresPreviewEntry && targetTop > 0 && element.scrollTop === 0) continue;
        const saveScroll = () => {
          if (!isCurrentTemplateWorkspaceOwner(owner)) return;
          updateWorkspaceScroll(sessionId, { [key]: element.scrollTop });
        };
        element.addEventListener("scroll", saveScroll, { passive: true });
        scrollCleanups.set(key, () => element.removeEventListener("scroll", saveScroll));
        pendingRestore.delete(key);
      }
      if (
        pendingRestore.size === 0
        && previewRestore
        && pendingPreviewDomRestoreRef.current === previewRestore
      ) pendingPreviewDomRestoreRef.current = null;
    };
    const restoreFrame = window.requestAnimationFrame(restoreAvailablePanels);
    const observer = new MutationObserver(restoreAvailablePanels);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      const ownsCurrentWorkspace = isCurrentTemplateWorkspaceOwner(owner);
      window.cancelAnimationFrame(restoreFrame);
      observer.disconnect();
      scrollCleanups.forEach((cleanup) => cleanup());
      if (!ownsCurrentWorkspace) return;
      const latestScroll = readWorkspaceScroll();
      updateWorkspaceScroll(sessionId, {
        structure: document.querySelector<HTMLElement>(WORKSPACE_SCROLL_SELECTORS.structure)?.scrollTop ?? latestScroll.structure,
        canvas: document.querySelector<HTMLElement>(WORKSPACE_SCROLL_SELECTORS.canvas)?.scrollTop ?? latestScroll.canvas,
        inspector: document.querySelector<HTMLElement>(WORKSPACE_SCROLL_SELECTORS.inspector)?.scrollTop ?? latestScroll.inspector,
      });
    };
  }, [activeTemplateId, previewMode, readWorkspaceScroll, sessionId, updateWorkspaceScroll]);
  const updateStructureCollapsed = useCallback((collapsed: boolean) => {
    setStructureCollapsed(collapsed);
    try {
      sessionStorage.setItem("template-editor-structure-collapsed", collapsed ? "1" : "0");
    } catch {
      /* 工作区偏好不可用时不影响当前收放 */
    }
  }, []);
  const updateInspectorCollapsed = useCallback((collapsed: boolean) => {
    setInspectorCollapsed(collapsed);
    try {
      sessionStorage.setItem("template-editor-inspector-collapsed", collapsed ? "1" : "0");
    } catch {
      /* 工作区偏好不可用时不影响当前收放 */
    }
  }, []);
  const compactOverlayPreferenceRef = useRef<CompactOverlayPreference | null>(null);
  const recordCompactOverlayPreference = useCallback((
    panel: "structure" | "inspector",
    open: boolean,
  ) => {
    if (!window.matchMedia(COMPACT_WORKSPACE_QUERY).matches) return;
    const state = useTemplateEditorSession.getState();
    if (!state.sessionId || !state.draft || state.previewMode) return;
    const owner = {
      sessionId: state.sessionId,
      templateId: state.draft.definition.templateId,
    };
    const current = compactOverlayPreferenceRef.current;
    const next = current && isSameTemplateWorkspaceOwner(current.owner, owner)
      ? current
      : { owner, structureOpen: false, inspectorOpen: false };
    compactOverlayPreferenceRef.current = {
      ...next,
      structureOpen: panel === "structure" ? open : open ? false : next.structureOpen,
      inspectorOpen: panel === "inspector" ? open : open ? false : next.inspectorOpen,
    };
  }, []);
  const structureOverlay = useCompactWorkspaceOverlay({
    open: !structureCollapsed,
    modal: compactOverlayModal,
    onOpen: () => {
      recordCompactOverlayPreference("structure", true);
      updateInspectorCollapsed(true);
      updateStructureCollapsed(false);
    },
    onClose: () => {
      recordCompactOverlayPreference("structure", false);
      updateStructureCollapsed(true);
    },
  });
  const inspectorOverlay = useCompactWorkspaceOverlay({
    open: !inspectorCollapsed,
    modal: compactOverlayModal,
    onOpen: () => {
      recordCompactOverlayPreference("inspector", true);
      updateStructureCollapsed(true);
      updateInspectorCollapsed(false);
    },
    onClose: () => {
      recordCompactOverlayPreference("inspector", false);
      updateInspectorCollapsed(true);
    },
  });
  const workspaceBodyRef = useRef<HTMLDivElement>(null);
  const compactPanelOwner = sessionId && activeTemplateId && !previewMode
    ? { sessionId, templateId: activeTemplateId }
    : null;
  useCompactPanelIsolation({
    active: structureOverlay.compact && compactOverlayModal && !structureCollapsed,
    bodyRef: workspaceBodyRef,
    panelRef: structureOverlay.panelRef,
    owner: compactPanelOwner,
  });
  useCompactPanelIsolation({
    active: inspectorOverlay.compact && compactOverlayModal && !inspectorCollapsed,
    bodyRef: workspaceBodyRef,
    panelRef: inspectorOverlay.panelRef,
    owner: compactPanelOwner,
  });
  const previewEntryRef = useRef<TemplatePreviewEntrySnapshot | null>(null);
  const previewButtonRef = useRef<HTMLButtonElement>(null);
  const pendingPreviewDomRestoreRef = useRef<({
    sessionId: string;
    templateId: string;
    domScroll: TemplatePreviewDomScrollSnapshot;
  }) | null>(null);
  const enterStressPreview = useCallback(() => {
    const state = useTemplateEditorSession.getState();
    if (publishReview || state.previewMode || !state.sessionId || !state.draft) return;
    if (focusFirstInvalidNumberField()) return;
    previewEntryRef.current = {
      sessionId: state.sessionId,
      templateId: state.draft.definition.templateId,
      selectionSnapshot: structuredClone(state.selectionSnapshot),
      device: state.device,
      canvasZoom: state.canvasZoom,
      inspectorTask: state.inspectorTask,
      inspectorView: state.inspectorView,
      workspaceScroll: { ...state.workspaceScroll },
      domScroll: {
        structure: document.querySelector<HTMLElement>(WORKSPACE_SCROLL_SELECTORS.structure)
          ?.scrollTop ?? state.workspaceScroll.structure,
        canvasTop: document.querySelector<HTMLElement>(WORKSPACE_SCROLL_SELECTORS.canvas)
          ?.scrollTop ?? state.workspaceScroll.canvas,
        canvasLeft: document.querySelector<HTMLElement>(WORKSPACE_SCROLL_SELECTORS.canvas)
          ?.scrollLeft ?? 0,
        inspector: document.querySelector<HTMLElement>(WORKSPACE_SCROLL_SELECTORS.inspector)
          ?.scrollTop ?? state.workspaceScroll.inspector,
      },
      structureCollapsed,
      inspectorCollapsed,
      previewScenario: state.previewScenario,
      focusElement: document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null,
    };
    if (inspectorOverlay.compact) setInspectorCollapsed(false);
    state.setPreviewScenario("short-text");
    state.setPreviewMode(true);
  }, [inspectorCollapsed, inspectorOverlay.compact, publishReview, structureCollapsed]);
  const exitStressPreview = useCallback((owner: TemplatePreviewOwner) => {
    const snapshot = previewEntryRef.current;
    if (
      !snapshot
      || snapshot.sessionId !== owner.sessionId
      || snapshot.templateId !== owner.templateId
    ) return;
    const state = useTemplateEditorSession.getState();
    if (
      state.sessionId !== snapshot.sessionId
      || state.draft?.definition.templateId !== snapshot.templateId
    ) {
      previewEntryRef.current = null;
      return;
    }
    pendingPreviewDomRestoreRef.current = {
      sessionId: snapshot.sessionId,
      templateId: snapshot.templateId,
      domScroll: snapshot.domScroll,
    };
    previewEntryRef.current = null;
    useTemplateEditorSession.setState({
      previewMode: false,
      selectionSnapshot: snapshot.selectionSnapshot,
      ...projectTemplateEditorSelectionSnapshot(snapshot.selectionSnapshot),
      device: snapshot.device,
      canvasZoom: snapshot.canvasZoom,
      inspectorTask: snapshot.inspectorTask,
      inspectorView: snapshot.inspectorView,
      previewScenario: snapshot.previewScenario,
      workspaceScroll: snapshot.workspaceScroll,
    });
    setStructureCollapsed(snapshot.structureCollapsed);
    setInspectorCollapsed(snapshot.inspectorCollapsed);
    const focusOwner = { sessionId: snapshot.sessionId, templateId: snapshot.templateId };
    window.requestAnimationFrame(() => {
      if (!isCurrentTemplateWorkspaceOwner(focusOwner)) return;
      window.requestAnimationFrame(() => {
        if (!isCurrentTemplateWorkspaceOwner(focusOwner)) return;
        const focusTarget = isVisibleOperableFocusTarget(snapshot.focusElement)
          ? snapshot.focusElement
          : previewButtonRef.current;
        if (isVisibleOperableFocusTarget(focusTarget)) {
          focusTarget.focus({ preventScroll: true });
        }
      });
    });
  }, []);
  const exitCurrentStressPreview = useCallback(() => {
    if (!sessionId || !draft) return;
    exitStressPreview({
      sessionId,
      templateId: draft.definition.templateId,
    });
  }, [draft, exitStressPreview, sessionId]);
  useEffect(() => {
    const snapshot = previewEntryRef.current;
    if (snapshot && (
      snapshot.sessionId !== sessionId
      || snapshot.templateId !== draft?.definition.templateId
    )) {
      previewEntryRef.current = null;
    }
    const pendingRestore = pendingPreviewDomRestoreRef.current;
    if (pendingRestore && (
      pendingRestore.sessionId !== sessionId
      || pendingRestore.templateId !== draft?.definition.templateId
    )) {
      pendingPreviewDomRestoreRef.current = null;
    }
  }, [draft?.definition.templateId, sessionId]);
  useEffect(() => {
    if (!previewMode || !sessionId || !draft) return undefined;
    const owner = {
      sessionId,
      templateId: draft.definition.templateId,
    };
    const onPreviewKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      exitStressPreview(owner);
    };
    window.addEventListener("keydown", onPreviewKeyDown);
    return () => window.removeEventListener("keydown", onPreviewKeyDown);
  }, [draft, exitStressPreview, previewMode, sessionId]);
  const openedReviewRequest = useRef<number | null>(null);
  const publishReviewFocusRef = useRef<TemplatePublishReviewFocusSnapshot | null>(null);
  const publishReviewVisibleRef = useRef(false);
  const publishReviewFocusReturnFrameRef = useRef<number | null>(null);
  const capturePublishReviewFocus = useCallback(() => {
    const state = useTemplateEditorSession.getState();
    if (!state.sessionId || !state.draft || state.previewMode) return;
    const owner = {
      sessionId: state.sessionId,
      templateId: state.draft.definition.templateId,
    };
    const current = publishReviewFocusRef.current;
    if (current && isSameTemplateWorkspaceOwner(current, owner)) return;
    if (publishReviewFocusReturnFrameRef.current !== null) {
      window.cancelAnimationFrame(publishReviewFocusReturnFrameRef.current);
      publishReviewFocusReturnFrameRef.current = null;
    }
    publishReviewFocusRef.current = {
      ...owner,
      focusElement: document.activeElement instanceof HTMLElement ? document.activeElement : null,
    };
  }, []);
  const publishWithFocusLifecycle = useCallback(() => {
    capturePublishReviewFocus();
    void controller.publish();
  }, [capturePublishReviewFocus, controller]);
  const openPublishReviewWithFocusLifecycle = useCallback(() => {
    capturePublishReviewFocus();
    controller.openPublishReview();
  }, [capturePublishReviewFocus, controller]);
  const publishReviewRequestId = publishReview?.requestId ?? null;
  const publishReviewSessionId = publishReview?.sessionId ?? null;
  const publishReviewTemplateId = publishReview?.templateId ?? null;
  const publishReviewVisible = publishReviewRequestId !== null;
  useLayoutEffect(() => {
    publishReviewVisibleRef.current = publishReviewVisible;
    if (publishReviewVisible) {
      if (publishReviewFocusReturnFrameRef.current !== null) {
        window.cancelAnimationFrame(publishReviewFocusReturnFrameRef.current);
        publishReviewFocusReturnFrameRef.current = null;
      }
      if (!publishReviewFocusRef.current) capturePublishReviewFocus();
      return undefined;
    }
    const snapshot = publishReviewFocusRef.current;
    if (!snapshot) return undefined;
    publishReviewFocusReturnFrameRef.current = window.requestAnimationFrame(() => {
      publishReviewFocusReturnFrameRef.current = window.requestAnimationFrame(() => {
        publishReviewFocusReturnFrameRef.current = null;
        if (
          publishReviewVisibleRef.current
          || publishReviewFocusRef.current !== snapshot
          || !isCurrentTemplateWorkspaceOwner(snapshot)
        ) return;
        publishReviewFocusRef.current = null;
        const focusTarget = snapshot.focusElement?.isConnected
          ? snapshot.focusElement
          : document.querySelector<HTMLElement>('[aria-label^="发布模板新版本"]');
        focusTarget?.focus();
      });
    });
    return () => {
      if (publishReviewFocusReturnFrameRef.current === null) return;
      window.cancelAnimationFrame(publishReviewFocusReturnFrameRef.current);
      publishReviewFocusReturnFrameRef.current = null;
    };
  }, [
    capturePublishReviewFocus,
    publishReviewRequestId,
    publishReviewSessionId,
    publishReviewTemplateId,
    publishReviewVisible,
  ]);
  const [inspectorTopInset, setInspectorTopInset] = useState(0);
  useLayoutEffect(() => {
    if (!inspectorOverlay.compact || inspectorCollapsed) return;
    const panel = inspectorOverlay.panelRef.current;
    const body = panel?.parentElement;
    if (!panel || !body) return;
    // 手机端身份与状态悬浮在画布上方，属性面板始终避开它们，保留关闭按钮命中。
    const controls = Array.from(document.querySelectorAll<HTMLElement>(
      ".template-editor__workspace-subject, .template-editor__toolbar .homepage-editor__workspace-status",
    ));
    const measure = () => {
      const bodyTop = body.getBoundingClientRect().top;
      setInspectorTopInset(Math.max(0, ...controls.map((control) => (
        getComputedStyle(control).position === "fixed" ? control.getBoundingClientRect().bottom - bodyTop : 0
      ))));
    };
    measure();
    const observer = new ResizeObserver(measure);
    [body, ...controls].forEach((element) => observer.observe(element));
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [inspectorOverlay.compact, inspectorOverlay.panelRef, inspectorCollapsed]);
  useEffect(() => {
    if (!publishReview || openedReviewRequest.current === publishReview.requestId) return;
    openedReviewRequest.current = publishReview.requestId;
    if (useTemplateEditorSession.getState().previewMode) exitCurrentStressPreview();
    if (inspectorOverlay.compact) inspectorOverlay.requestOpen();
    else setInspectorCollapsed(false);
  }, [exitCurrentStressPreview, inspectorOverlay, publishReview]);
  useEffect(() => {
    const openMetadataPanel = (event: Event) => {
      const state = useTemplateEditorSession.getState();
      if (!state.draft || state.previewMode || focusFirstInvalidNumberField()) return;
      if (inspectorOverlay.compact) {
        // 菜单项关闭后会卸载，使用稳定的菜单触发按钮作为关闭面板后的焦点归处。
        if (event.type === "template-editor:open-metadata") {
          document.querySelector<HTMLButtonElement>('.homepage-editor__toolbar [data-workspace-action="more"]')?.focus({ preventScroll: true });
        }
        inspectorOverlay.requestOpen();
      } else updateInspectorCollapsed(false);
    };
    window.addEventListener("template-editor:open-metadata", openMetadataPanel);
    window.addEventListener("template-editor:open-settings", openMetadataPanel);
    return () => {
      window.removeEventListener("template-editor:open-metadata", openMetadataPanel);
      window.removeEventListener("template-editor:open-settings", openMetadataPanel);
    };
  }, [inspectorOverlay, updateInspectorCollapsed]);
  useEffect(() => {
    if (!previewMode) setTrialTargetNodeId(undefined);
  }, [previewMode]);
  useEffect(() => {
    const openContent = (event: Event) => {
      const state = useTemplateEditorSession.getState();
      const detail = (event as CustomEvent<{ nodeId?: string; slotId?: string }>).detail;
      if (!state.draft || state.previewMode || !detail || typeof detail.nodeId !== "string" || typeof detail.slotId !== "string" || focusFirstInvalidNumberField()) return;
      const node = state.draft.definition.nodes[detail.nodeId];
      if (!node || node.slotId !== detail.slotId || !state.draft.definition.slots[detail.slotId]) return;
      if (event.type === "template-editor:open-trial-content") {
        if (Number(state.draft.definition.schemaVersion) >= 3) return;
        state.selectObject(node.nodeId);
        enterStressPreview();
        if (useTemplateEditorSession.getState().previewMode) {
          setTrialTargetNodeId(node.nodeId);
          if (inspectorOverlay.compact) inspectorOverlay.requestOpen(); else updateInspectorCollapsed(false);
        }
      } else {
        if (Number(state.draft.definition.schemaVersion) < 3) return;
        state.selectObject(node.nodeId);
        state.setInspectorTask("design");
        state.setInspectorView("context");
        if (inspectorOverlay.compact) {
          inspectorOverlay.openButtonRef.current?.focus({ preventScroll: true });
          inspectorOverlay.requestOpen();
        } else updateInspectorCollapsed(false);
      }
    };
    window.addEventListener("template-editor:open-default-content", openContent);
    window.addEventListener("template-editor:open-trial-content", openContent);
    return () => {
      window.removeEventListener("template-editor:open-default-content", openContent);
      window.removeEventListener("template-editor:open-trial-content", openContent);
    };
  }, [enterStressPreview, inspectorOverlay, updateInspectorCollapsed]);
  const prepareIssueTarget = (target: TemplateInspectorIssueTarget) => {
    if (target.destination === "structure-region" || target.destination === "structure-slot") {
      if (inspectorOverlay.compact) structureOverlay.requestOpen();
      else updateStructureCollapsed(false);
    }
  };

  const previousCompactLayoutRef = useRef<boolean | null>(null);
  useEffect(() => {
    const previousCompact = previousCompactLayoutRef.current;
    if (previousCompact === inspectorOverlay.compact) return;
    previousCompactLayoutRef.current = inspectorOverlay.compact;
    if (!inspectorOverlay.compact) {
      updateStructureCollapsed(false);
      updateInspectorCollapsed(false);
      return;
    }
    const owner = sessionId && activeTemplateId ? { sessionId, templateId: activeTemplateId } : null;
    const preference = owner
      && compactOverlayPreferenceRef.current
      && isSameTemplateWorkspaceOwner(compactOverlayPreferenceRef.current.owner, owner)
      ? compactOverlayPreferenceRef.current
      : null;
    updateStructureCollapsed(!preference?.structureOpen);
    updateInspectorCollapsed(!preference?.inspectorOpen);
    if (owner && (preference?.structureOpen || preference?.inspectorOpen)) {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        if (!isCurrentTemplateWorkspaceOwner(owner)) return;
        const current = compactOverlayPreferenceRef.current;
        if (!current || !isSameTemplateWorkspaceOwner(current.owner, owner)) return;
        if (current.structureOpen) structureOverlay.closeButtonRef.current?.focus();
        else if (current.inspectorOpen) inspectorOverlay.closeButtonRef.current?.focus();
      }));
    }
  }, [
    activeTemplateId,
    inspectorOverlay.compact,
    inspectorOverlay.closeButtonRef,
    sessionId,
    structureOverlay.closeButtonRef,
    updateInspectorCollapsed,
    updateStructureCollapsed,
  ]);
  useEffect(() => {
    if (!sessionId || !activeTemplateId) {
      compactOverlayPreferenceRef.current = null;
      return;
    }
    const owner = { sessionId, templateId: activeTemplateId };
    const current = compactOverlayPreferenceRef.current;
    if (current && isSameTemplateWorkspaceOwner(current.owner, owner)) return;
    compactOverlayPreferenceRef.current = {
      owner,
      structureOpen: false,
      inspectorOpen: false,
    };
    if (inspectorOverlay.compact) {
      updateStructureCollapsed(true);
      updateInspectorCollapsed(true);
    }
  }, [
    activeTemplateId,
    inspectorOverlay.compact,
    sessionId,
    updateInspectorCollapsed,
    updateStructureCollapsed,
  ]);
  useEffect(() => {
    try {
      sessionStorage.setItem(
        "template-editor-structure-collapsed",
        structureCollapsed ? "1" : "0",
      );
    } catch {
      /* 工作区偏好不可用时不影响模板会话 */
    }
  }, [structureCollapsed]);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        "template-editor-inspector-collapsed",
        inspectorCollapsed ? "1" : "0",
      );
    } catch {
      /* 工作区偏好不可用时不影响模板会话 */
    }
  }, [inspectorCollapsed]);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsError, setVersionsError] = useState<string | null>(null);
  const [versions, setVersions] = useState<DynamicTemplateVersionSummaryResource[]>([]);
  const [versionsNextBefore, setVersionsNextBefore] = useState<number | null>(null);
  const [versionsLoadingMore, setVersionsLoadingMore] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [selectedVersionDetail, setSelectedVersionDetail] = useState<DynamicTemplateVersionResource | null>(null);
  const [versionDetailLoading, setVersionDetailLoading] = useState(false);
  const [versionDetailError, setVersionDetailError] = useState<string | null>(null);
  const [currentPublishedDetail, setCurrentPublishedDetail] = useState<DynamicTemplateVersionResource | null>(null);
  const versionHistoryRequestIdRef = useRef(0);
  const versionRequestIdRef = useRef(0);
  const currentPublishedVersionRequestIdRef = useRef(0);
  const versionDetailRequestsRef = useRef(new Map<string, Promise<DynamicTemplateVersionResource>>());

  useEffect(() => {
    versionHistoryRequestIdRef.current += 1;
    versionRequestIdRef.current += 1;
    currentPublishedVersionRequestIdRef.current += 1;
    versionDetailRequestsRef.current.clear();
  }, [activeTemplateId, sessionId]);

  const openTemplateTarget = useCallback((target: TemplateEditorLibraryTarget) => {
    if (target.kind === "dynamic-new" && !target.definition) {
      setNewTemplateSizeOpen(true);
      return;
    }
    const currentDraft = useTemplateEditorSession.getState().draft;
    if (target.kind === "dynamic-local" && currentDraft?.sourceType === "local"
      && currentDraft.localDraftId === target.localDraftId) return;
    controller.openTarget(target);
  }, [controller]);

  const manageTemplate = async (target: TemplateEditorLibraryTarget, action: "copy" | "copy-published" | "rename") => {
    if (!controller.canManageTemplates || controller.lifecycleBusy || controller.publishing || controller.saveStatus === "saving") return;
    if (action === "rename") {
      controller.openTarget(target, (opened) => setRename({ templateId: opened.definition.templateId, name: opened.definition.name }));
      return;
    }
    await controller.copyTarget(target, action);
  };

  const applyTemplateName = () => {
    if (!rename || !rename.name.trim()) return;
    const current = useTemplateEditorSession.getState();
    if (current.draft?.definition.templateId !== rename.templateId) { setRename(null); return; }
    if (focusFirstInvalidNumberField()) return;
    const result = current.executeCommand({ type: "transform-definition", label: "重命名模板", transform: (next) => { next.name = rename.name.trim(); return next; } });
    if (!result.ok) return;
    setRename(null);
    message.success("名称已应用到草稿，保存草稿后生效。");
  };

  const moveTemplateToTrash = (
    target: ArchivableTemplateEditorLibraryTarget | Pick<DynamicTemplateResource, "templateId" | "name">,
    name: string,
  ) => {
    if (localOnly || lifecycleBusy) return;
    let archiveDialog: { destroy: () => void } | null = null;
    archiveDialog = modal.confirm({
      title: `将模板“${name}”移入回收站？`,
      content: "移入回收站后，模板将从组件库隐藏，页面装修不能再新增；已有页面和已发布版本保持不变，可在模板回收站恢复。",
      okText: "移入回收站",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        const archived = await controller.archive(target);
        if (archived) {
          archiveDialog?.destroy();
        }
      },
    });
  };

  const discardCurrentDraft = () => {
    if (!draft || !dirty || !hasBaseline) return;
    modal.confirm({
      title: `放弃“${draft.definition.name}”的未保存修改？`,
      content: "当前编辑会恢复到最近一次已保存草稿；正式版本和页面实例不会改变。",
      okText: "放弃未保存修改",
      okButtonProps: { danger: true },
      cancelText: "继续编辑",
      onOk: () => {
        controller.discardChanges();
        message.success("未保存的模板修改已放弃");
      },
    });
  };

  const permanentlyDeleteTemplate = (template: Pick<DynamicTemplateResource, "templateId" | "name">) => {
    if (localOnly || lifecycleBusy) return;
    modal.confirm({
      title: `永久删除模板“${template.name}”？`,
      content: "永久删除后无法恢复。仅当模板从未发布、没有版本历史、没有页面引用且没有其他需要保留的数据时才可永久删除。",
      okText: "永久删除模板",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        await controller.deleteDraft(template);
      },
    });
  };

  const restoreTemplate = (template: import("@/services/clients/dynamicTemplateClient").DynamicTemplateResource) => {
    if (localOnly || lifecycleBusy) return;
    modal.confirm({
      title: `恢复模板“${template.name}”？`,
      content: "恢复后模板会重新进入可设计状态；若已有正式版本，也会重新进入页面装修目录。已有页面实例不会被修改。",
      okText: "恢复模板",
      cancelText: "取消",
      onOk: async () => {
        await controller.restore(template);
      },
    });
  };

  const confirmCreateDraftFromPublished = (
    template: DynamicTemplateResource,
    published: PublishedDynamicTemplateResource,
  ) => {
    if (localOnly || lifecycleBusy) return;
    if (dirty) {
      message.warning("当前模板还有未保存修改，请先保存或放弃修改，再建立并打开其他模板草稿");
      return;
    }
    modal.confirm({
      title: `从正式版本 v${published.version} 建立“${template.name}”的编辑草稿？`,
      content: (
        <div className="template-editor__transition-confirm">
          <p className="template-editor__transition-summary">
            将使用目录中精确的正式版本 v{published.version} 和校验值 {published.definitionChecksum.slice(0, 12)}…，在服务端创建一份可编辑草稿。
          </p>
          <p className="template-editor__transition-note">
            新草稿的初始结构与该正式版本完全一致。此操作不会发布模板、升级页面实例或修改任何页面；失败时当前模板和目录卡片都会保留，可重新读取目录后重试。
          </p>
        </div>
      ),
      okText: "建立并打开编辑草稿",
      cancelText: "取消",
      autoFocusButton: "cancel",
      onOk: async () => {
        await controller.createDraftFromPublished(template, published);
      },
    });
  };

  const saveCurrentTemplate = async () => {
    if (!draft) return;
    if (localOnly) {
      modal.confirm({
        title: "保存本机测试草稿",
        content: "只写入当前浏览器本机存储，不创建服务端模板。",
        okText: "更新本机测试草稿",
        cancelText: "取消",
        onOk: async () => {
          const saved = await controller.persist({ overwriteCurrent: true });
          if (!saved) throw new Error("本机测试草稿保存失败");
        },
      });
      return;
    }
    await controller.persist({ overwriteCurrent: true });
  };

  const requestVersionDetail = (templateId: string, version: number) => {
    const key = `${templateId}:${version}`;
    const existing = versionDetailRequestsRef.current.get(key);
    if (existing) return existing;
    const request = controller.getVersion(version);
    versionDetailRequestsRef.current.set(key, request);
    void request.catch(() => {
      if (versionDetailRequestsRef.current.get(key) === request) {
        versionDetailRequestsRef.current.delete(key);
      }
    });
    return request;
  };

  const selectHistoricalVersion = async (version: number, ownerTemplateId = activeTemplateId) => {
    if (!ownerTemplateId) return;
    const requestId = ++versionRequestIdRef.current;
    setSelectedVersion(version);
    setSelectedVersionDetail(null);
    setVersionDetailLoading(true);
    setVersionDetailError(null);
    try {
      const detail = await requestVersionDetail(ownerTemplateId, version);
      if (
        requestId !== versionRequestIdRef.current
        || useTemplateEditorSession.getState().draft?.definition.templateId !== ownerTemplateId
      ) return;
      setSelectedVersionDetail(detail);
    } catch {
      if (
        requestId !== versionRequestIdRef.current
        || useTemplateEditorSession.getState().draft?.definition.templateId !== ownerTemplateId
      ) return;
      setVersionDetailError("该版本详情读取或完整性校验失败，当前模板草稿未改变");
    } finally {
      if (
        requestId === versionRequestIdRef.current
        && useTemplateEditorSession.getState().draft?.definition.templateId === ownerTemplateId
      ) setVersionDetailLoading(false);
    }
  };

  const openVersionHistory = async () => {
    if (!draft) return;
    const ownerTemplateId = draft.definition.templateId;
    const openRequestId = ++versionHistoryRequestIdRef.current;
    versionRequestIdRef.current += 1;
    currentPublishedVersionRequestIdRef.current += 1;
    versionDetailRequestsRef.current.clear();
    setVersionsOpen(true);
    setVersionsLoading(true);
    setVersionsError(null);
    try {
      if (draft.sourceType !== "persisted") {
        setVersionsOpen(false);
        return;
      }
      const page = await controller.listVersions({ limit: 20 });
      if (
        openRequestId !== versionHistoryRequestIdRef.current
        || useTemplateEditorSession.getState().draft?.definition.templateId !== ownerTemplateId
      ) return;
      setVersions(page.items);
      setVersionsNextBefore(page.nextBeforeVersion);
      const firstVersion = page.items[0]?.version ?? null;
      setSelectedVersion(firstVersion);
      setSelectedVersionDetail(null);
      setCurrentPublishedDetail(null);
      if (draft.remote?.publishedVersion) {
        const publishedRequestId = ++currentPublishedVersionRequestIdRef.current;
        void requestVersionDetail(ownerTemplateId, draft.remote.publishedVersion)
          .then((detail) => {
            if (
              publishedRequestId === currentPublishedVersionRequestIdRef.current
              && useTemplateEditorSession.getState().draft?.definition.templateId === ownerTemplateId
            ) setCurrentPublishedDetail(detail);
          })
          .catch(() => {
            if (
              publishedRequestId === currentPublishedVersionRequestIdRef.current
              && useTemplateEditorSession.getState().draft?.definition.templateId === ownerTemplateId
            ) setCurrentPublishedDetail(null);
          });
      }
      if (firstVersion) void selectHistoricalVersion(firstVersion, ownerTemplateId);
    } catch {
      if (
        openRequestId === versionHistoryRequestIdRef.current
        && useTemplateEditorSession.getState().draft?.definition.templateId === ownerTemplateId
      ) setVersionsError("版本历史读取失败，当前模板草稿未改变");
    } finally {
      if (
        openRequestId === versionHistoryRequestIdRef.current
        && useTemplateEditorSession.getState().draft?.definition.templateId === ownerTemplateId
      ) setVersionsLoading(false);
    }
  };

  const closeVersionHistory = () => {
    versionHistoryRequestIdRef.current += 1;
    versionRequestIdRef.current += 1;
    currentPublishedVersionRequestIdRef.current += 1;
    versionDetailRequestsRef.current.clear();
    setVersionsOpen(false);
  };

  const loadOlderVersions = async () => {
    if (!versionsNextBefore || versionsLoadingMore) return;
    setVersionsLoadingMore(true);
    try {
      const page = await controller.listVersions({ beforeVersion: versionsNextBefore, limit: 20 });
      setVersions((current) => [...current, ...page.items]);
      setVersionsNextBefore(page.nextBeforeVersion);
    } catch {
      message.error("更早版本读取失败，已加载的版本仍可查看");
    } finally {
      setVersionsLoadingMore(false);
    }
  };

  const confirmStageHistoricalVersion = () => {
    if (!selectedVersionDetail || !draft) return;
    const version = selectedVersionDetail;
    modal.confirm({
      title: `将 v${version.version} 载入当前草稿？`,
      content: "只替换当前内存草稿，并形成一个可撤销步骤；不会自动保存、发布或修改任何页面。当前历史内容保持只读。",
      okText: "载入当前草稿",
      cancelText: "取消",
      onOk: () => {
        if (controller.stageVersion(version)) setVersionsOpen(false);
      },
    });
  };

  const exportDynamicDraft = () => {
    if (!draft) return;
    try {
      const source = exportDynamicTemplateDraftJson(draft);
      const blob = new Blob([source], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${draft.definition.name.replace(/[\\/:*?"<>|]+/g, "-") || "dynamic-template"}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      message.success("已导出通过校验的模板定义文件");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "模板导出失败");
    }
  };

  const inspectorIsModalDialog = inspectorOverlay.compact
    && compactOverlayModal
    && !inspectorCollapsed;

  return (
    <>
      {rename ? <Modal open title="重命名模板" okText="应用名称" cancelText="取消"
        maskClosable={false}
        okButtonProps={{ disabled: !rename.name.trim() }}
        onCancel={() => setRename(null)} onOk={applyTemplateName}>
        <label htmlFor="template-rename-input">模板名称</label>
        <Input id="template-rename-input" autoFocus maxLength={100} value={rename.name}
          onChange={(event) => setRename({ ...rename, name: event.target.value })} onPressEnter={applyTemplateName} />
      </Modal> : null}
      {newTemplateSizeOpen ? <NewTemplateRecipeModal
        onCancel={() => setNewTemplateSizeOpen(false)}
        onCreate={(definition) => {
          controller.openTarget({ kind: "dynamic-new", definition }, () => setNewTemplateSizeOpen(false));
        }}
      /> : null}
      <TemplateEditorToolbar
        onCreate={previewMode ? undefined : () => openTemplateTarget({ kind: "dynamic-new" })}
        onSave={previewMode ? undefined : () => { void saveCurrentTemplate(); }}
        onPublish={!previewMode && draft && !localOnly ? publishWithFocusLifecycle : undefined}
        localOnly={localOnly}
        publishing={publishing}
        publishReview={publishReview}
        publishIssueEditing={controller.publishIssueEditing}
        publishedDraftUnavailable={publishedDraftAvailability?.status === "unavailable"}
        onOpenPublishReview={openPublishReviewWithFocusLifecycle}
        onExport={draft ? exportDynamicDraft : undefined}
        onOpenVersionHistory={draft?.sourceType === "persisted"
          ? () => { void openVersionHistory(); }
          : undefined}
        onArchive={!previewMode && draft?.sourceType === "persisted" && !localOnly
          ? () => moveTemplateToTrash(
              {
                templateId: draft.definition.templateId,
                name: draft.definition.name,
              },
              draft.definition.name,
            )
          : undefined}
        onDiscard={!previewMode && draft && dirty && hasBaseline
          ? discardCurrentDraft
          : undefined}
        onCloseSession={!previewMode && draft ? controller.closeSession : undefined}
        lifecycleBusy={lifecycleBusy}
        onRequestReturn={controller.returnToPage}
        onTogglePreview={previewMode ? exitCurrentStressPreview : enterStressPreview}
        previewButtonRef={previewButtonRef}
      />
      <div
        ref={workspaceBodyRef}
        className={`homepage-editor__body template-editor__body${previewMode ? " is-previewing" : ""}`}
        data-template-workspace-compact={inspectorOverlay.compact ? "true" : "false"}
      >
        {showMobileTemplateIdentity && draft ? (
          <button
            type="button"
            className="template-editor__workspace-subject template-editor__mobile-settings"
            aria-label={previewMode ? `当前模板：${draft.definition.name}` : "打开模板设置"}
            disabled={previewMode || publishing || lifecycleBusy || saveStatus === "saving" || (Boolean(publishReview) && !controller.publishIssueEditing)}
            onClick={() => window.dispatchEvent(new Event("template-editor:open-settings"))}
          >
            <small>{previewMode ? "当前模板" : "模板设置 · 名称与尺寸"}</small>
            <strong>{draft.definition.name}</strong>
          </button>
        ) : null}
        {previewMode ? (
          <aside
            className="homepage-editor__library template-editor__library template-editor__empty-panel"
            aria-label="模板目录预览"
          >
            <WorkspacePanelHeader icon={<AppstoreOutlined />} title="模板目录" />
            <p>压力预览期间目录保持只读；退出预览后才能打开、新建、恢复或管理模板。</p>
          </aside>
        ) : (
          <TemplateEditorLibrary
            draft={draft}
            dirty={dirty}
            hasBaseline={hasBaseline}
            device={device}
            sessionId={sessionId}
            readWorkspaceScroll={readWorkspaceScroll}
            updateWorkspaceScroll={updateWorkspaceScroll}
            onArchive={moveTemplateToTrash}
            onCreateDraftFromPublished={confirmCreateDraftFromPublished}
            onDelete={permanentlyDeleteTemplate}
            onOpen={openTemplateTarget}
            onManage={(target, action) => { void manageTemplate(target, action); }}
            publishedDraftCreation={controller.publishedDraftCreation}
            onRestore={restoreTemplate}
            localOnly={localOnly}
          />
        )}
        {previewMode ? (
          <aside
            className="homepage-editor__structure-workspace template-editor__structure template-editor__empty-panel"
            aria-label="模板结构预览"
          >
            <WorkspacePanelHeader icon={<BlockOutlined />} title="模板结构" />
            <p>当前只检查 Renderer 构图与内容边界；结构操作已暂停。</p>
          </aside>
        ) : structureCollapsed ? (
          <aside
            className="homepage-editor__structure-workspace template-editor__structure is-collapsed"
            aria-label="模板结构（已收起）"
          >
            <WorkspacePanelCollapseButton
              ref={structureOverlay.openButtonRef}
              action="expand"
              panel="structure"
              panelLabel="模板结构面板"
              onClick={structureOverlay.requestOpen}
            />
          </aside>
        ) : draft ? (
          <DynamicTemplateStructurePanel
            panelRef={structureOverlay.panelRef}
            closeButtonRef={structureOverlay.closeButtonRef}
            compactOverlay={structureOverlay.compact}
            modalOverlay={structureOverlay.compact && compactOverlayModal}
            publishIssueEditing={controller.publishIssueEditing}
            onOpenPublishReview={openPublishReviewWithFocusLifecycle}
            onSelectTarget={inspectorOverlay.compact ? inspectorOverlay.requestOpen : undefined}
            onPanelKeyDown={structureOverlay.onPanelKeyDown}
            onCollapse={structureOverlay.compact ? structureOverlay.requestClose : undefined}
          />
        ) : (
          <aside className="homepage-editor__structure-workspace template-editor__structure template-editor__empty-panel" aria-label="模板结构">
            <WorkspacePanelHeader
              icon={<BlockOutlined />}
              title="模板结构"
              actions={inspectorOverlay.compact ? (
                <WorkspacePanelCollapseButton
                  action="collapse"
                  panel="structure"
                  panelLabel="模板结构面板"
                  onClick={structureOverlay.requestClose}
                />
              ) : undefined}
            />
            <p>从左侧选择母模板后，这里会显示模板整体、图片槽位、文字槽位和行动对象。</p>
          </aside>
        )}
        {draft ? <DynamicTemplateCanvas /> : (
          <section className="homepage-editor__stage template-editor__stage template-editor__empty-stage" aria-label="空模板画布">
            <div className="template-editor__empty-stage-card">
              <strong>从左侧选择模板进行设计</strong>
              <span>打开现有模板继续精修，或新建模板，选择用途、尺寸与布局后自动生成设计。</span>
            </div>
          </section>
        )}
        <div
          ref={inspectorOverlay.panelRef as RefObject<HTMLDivElement>}
          style={inspectorOverlay.compact && !inspectorCollapsed ? { top: inspectorTopInset } : undefined}
          className={`homepage-editor__right-workspace template-editor__right-workspace${inspectorCollapsed ? " is-inspector-collapsed" : ""}`}
          aria-label={inspectorIsModalDialog ? "模板属性工作区" : undefined}
          role={inspectorIsModalDialog ? "dialog" : undefined}
          aria-modal={inspectorIsModalDialog ? "true" : undefined}
          tabIndex={inspectorIsModalDialog ? -1 : undefined}
          data-compact-overlay={inspectorOverlay.compact ? "inspector" : undefined}
          data-compact-overlay-open={!inspectorCollapsed || undefined}
          onKeyDown={inspectorOverlay.onPanelKeyDown}
        >
          {inspectorCollapsed && draft ? (
            <WorkspacePanelCollapseButton
              ref={inspectorOverlay.openButtonRef}
              action="expand"
              panel="inspector"
              panelLabel="模板属性面板"
              compactLabel={selectedObjectLabel ? `属性 · ${selectedObjectLabel}` : "属性"}
              onClick={inspectorOverlay.requestOpen}
            />
          ) : null}
            <div
              className="homepage-editor__inspector-holder"
              hidden={inspectorCollapsed}
              style={inspectorCollapsed ? { display: "none" } : undefined}
            >
              <WorkspacePanelHeader
                icon={<ControlOutlined />}
                title="模板属性"
                actions={inspectorOverlay.compact ? (
                  <WorkspacePanelCollapseButton
                    ref={inspectorOverlay.closeButtonRef}
                    action="collapse"
                    panel="inspector"
                    panelLabel="模板属性面板"
                    compactLabel="关闭"
                    onClick={inspectorOverlay.requestClose}
                  />
                ) : undefined}
              />
              {draft && previewMode ? (
                <div
                  className="homepage-editor__inspector template-editor__inspector template-editor__preview-inspector"
                  aria-label="模板预览说明"
                >
                  <Alert
                    type="info"
                    showIcon
                    message="正在预览模板"
                    description="可切换压力场景或填写临时试排内容；不会修改模板草稿。"
                  />
                  <label className="template-editor__stress-preview-select">
                    <span>压力场景</span>
                    <select
                      aria-label="压力预览场景"
                      value={previewScenario}
                      onChange={(event) => {
                        const scenario = TEMPLATE_STRESS_PREVIEW_SCENARIOS.find(
                          (candidate) => candidate === event.target.value,
                        );
                        if (scenario) useTemplateEditorSession.getState().setPreviewScenario(scenario);
                      }}
                    >
                      {TEMPLATE_STRESS_PREVIEW_SCENARIOS.map((scenario) => (
                        <option key={scenario} value={scenario}>{STRESS_PREVIEW_LABELS[scenario]}</option>
                      ))}
                    </select>
                  </label>
                  <TemplateTrialPreviewControls definition={draft.definition} initialNodeId={trialTargetNodeId} />
                  <p
                    role="status"
                    data-template-stress-preview-summary={previewScenario}
                    data-template-empty-slot-policy="public-collapse"
                  >
                    {describeStressPreview(draft.definition, previewScenario)}
                  </p>
                  <Button onClick={exitCurrentStressPreview}>退出预览并继续编辑</Button>
                </div>
              ) : draft ? <DynamicTemplateInspectorPanel
                localOnly={localOnly}
                workspaceVisible={!inspectorCollapsed}
                publishReview={controller.publishIssueEditing ? null : publishReview}
                publishIssueEditing={controller.publishIssueEditing}
                publishedDraftAvailability={publishedDraftAvailability}
                onSelectPublishIssue={controller.selectPublishIssue}
                onPrepareIssueTarget={prepareIssueTarget}
                onEditPublishIssue={controller.editPublishIssue}
                onOpenPublishReview={openPublishReviewWithFocusLifecycle}
                onConfirmPublish={controller.confirmPublish}
                onCancelPublishReview={controller.cancelPublishReview}
                onRecheckPublishReview={controller.recheckPublishReview}
                onRetryPublishVerification={controller.retryPublishVerification}
                onRetryFailedPublish={controller.retryFailedPublish}
                onRetryCatalogRefresh={controller.retryCatalogRefresh}
                onReloadPublishedDraft={controller.reloadPublishedDraft}
                onUsePublishedTemplate={controller.usePublishedTemplateInPage}
              /> : (
                <aside className="homepage-editor__inspector template-editor__inspector template-editor__empty-panel" aria-label="模板属性">
                  <p>选择模板后，可在这里调整整体比例、设备规则以及当前槽位的精确位置和大小。</p>
                </aside>
              )}
            </div>
        </div>
      </div>

      <Modal
        title="模板版本历史"
        open={versionsOpen}
        width={900}
        footer={<Button onClick={closeVersionHistory}>关闭</Button>}
        onCancel={closeVersionHistory}
      >
        <Alert
          data-template-version-history-policy="read-only-version-pinned"
          type="info"
          showIcon
          message="历史读取与载入都不会自动写入"
          description="页面实例继续锁定原版本。只有随后明确点击保存或发布，当前模板才会进入既有持久化流程。"
        />
        {versionsLoading ? <div role="status"><Spin /> 正在读取版本历史…</div> : null}
        {versionsError ? (
          <Alert
            type="error"
            showIcon
            message={versionsError}
            action={<Button onClick={() => { void openVersionHistory(); }}>重试</Button>}
          />
        ) : null}
        {!versionsLoading && !versionsError && draft ? (
          <div className="template-editor__history-layout">
            <div className="template-editor__history-list" role="list" aria-label="模板正式版本">
              {versions.map((version) => (
                <Button
                  key={version.version}
                  type={selectedVersion === version.version ? "primary" : "text"}
                  block
                  style={{ height: "auto", justifyContent: "flex-start", marginBottom: 6 }}
                  onClick={() => { void selectHistoricalVersion(version.version); }}
                >
                  v{version.version} · {new Date(version.publishedAt).toLocaleString("zh-CN")}
                </Button>
              ))}
              {versionsNextBefore ? (
                <Button block loading={versionsLoadingMore} onClick={() => { void loadOlderVersions(); }}>
                  加载更早版本
                </Button>
              ) : null}
              {versions.length === 0 ? <span className="homepage-editor__properties-hint">尚未发布正式版本</span> : null}
            </div>
            <section className="template-editor__history-detail" aria-label={selectedVersion ? `正式版本 ${selectedVersion} 预览` : "正式版本详情"}>
              {versionDetailLoading ? <div role="status"><Spin /> 正在校验版本详情…</div> : null}
              {versionDetailError ? (
                <Alert
                  type="error"
                  showIcon
                  message={versionDetailError}
                  action={selectedVersion ? (
                    <Button onClick={() => { void selectHistoricalVersion(selectedVersion); }}>重试</Button>
                  ) : undefined}
                />
              ) : null}
              {selectedVersionDetail ? (() => {
                const version = selectedVersionDetail;
                const draftDiff = summarizeTemplateHistoryDiff(version.definition, draft.definition);
                const publishedDiff = currentPublishedDetail
                  ? summarizeTemplateHistoryDiff(version.definition, currentPublishedDetail.definition)
                  : null;
                const renderDiff = (label: string, diff: ReturnType<typeof summarizeTemplateHistoryDiff>) => (
                  <div>
                    <strong>{label}</strong>
                    <p>节点 +{diff.nodesAdded} / -{diff.nodesRemoved} / 改 {diff.nodesChanged}；槽位 +{diff.slotsAdded} / -{diff.slotsRemoved} / 改 {diff.slotsChanged}</p>
                    <p>响应式 {diff.responsiveRulesChanged} 处；样式 {diff.styleRulesChanged} 处；根节点 {diff.rootChanged ? "已变" : "未变"}；元数据 {diff.metadataChanged ? "已变" : "未变"}</p>
                  </div>
                );
                return (
                  <>
                    <strong>v{version.version}</strong>
                    <p>{version.versionNote || "未填写版本说明"}</p>
                    <code>{version.definitionChecksum.slice(0, 16)}</code>
                    <div className="template-editor__history-preview">
                      <DynamicTemplateRenderer definition={version.definition} device={device} mode="thumbnail" />
                    </div>
                    {renderDiff("与当前草稿比较", draftDiff)}
                    {publishedDiff ? renderDiff("与当前正式版本比较", publishedDiff) : (
                      <p className="homepage-editor__properties-hint">当前正式版本详情暂不可用，不影响所选版本查看。</p>
                    )}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      <Button type="primary" onClick={confirmStageHistoricalVersion}>载入当前草稿</Button>
                    </div>
                  </>
                );
              })() : null}
            </section>
          </div>
        ) : null}
      </Modal>

      <span className="sr-only" role="status" aria-live="polite">
        {saveStatus === "saving"
          ? "正在保存模板"
          : saveStatus === "error"
            ? "模板保存失败，修改仍在"
            : saveStatus === "permission-error"
              ? "模板保存权限不足，修改仍在，可显式重试"
            : saveStatus === "conflict"
              ? "模板保存冲突，修改仍在，请重新读取目录并处理冲突"
            : saveStatus === "publish-error"
              ? "模板发布失败，草稿仍在"
              : saveStatus === "publish-success"
                ? "模板新版本已发布，已有页面保持原版本"
                : ""}
      </span>
    </>
  );
}
