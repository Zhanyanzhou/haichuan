import { create } from "zustand";
import type {
  TemplateEditorDraft,
  TemplateEditorContentLayer,
  TemplateEditorDevice,
  TemplateSaveStatus,
} from "./types";
import type { TemplateStressPreviewScenario } from "./templateStressPreviewEngine";
import {
  executeDynamicTemplateDefinitionCommand,
  getDynamicTemplateNodeRegistryEntry,
  validateDynamicTemplateDefinition,
  type DynamicTemplateCommandResult,
  type DynamicTemplateValidationIssue,
  type DynamicTemplateDefinitionCommand,
  type TemplateDefinitionV2,
} from "../template-definition";
import { getContentTemplateContract } from "../generated/contentTemplates.generated";
import { getContentTemplateModuleTypeForSlotType } from "../template-definition/validateTemplateDefinition";
import { focusFirstInvalidNumberField } from "../inspector/controls/NumberField";
import { resolveTemplateBreakpoint, type TemplateBreakpoint } from "../template-definition/responsive";
import {
  createTemplateEditorSelectionSnapshot,
  isSameTemplateEditorSelectionTarget,
  projectTemplateEditorSelectionSnapshot,
  repairTemplateEditorSelectionSnapshot,
  transitionTemplateEditorSelection,
  selectTemplateEditorTargets,
  type TemplateEditorSelectionTarget,
  type TemplateEditorSelectionSnapshot,
  type TemplateEditorSelectionTransitionInput,
  type TemplateEditorSelectionTransitionResult,
} from "./templateEditorSelection";

const HISTORY_LIMIT = 50;

export interface TemplateProductionReviewFacts {
  desktop: boolean;
  mobile: boolean;
  pageScope: boolean;
  stressPreview: Record<TemplateStressPreviewScenario, boolean>;
}

export function createTemplateProductionReviewFacts(): TemplateProductionReviewFacts {
  return {
    desktop: false,
    mobile: false,
    pageScope: false,
    stressPreview: {
      "short-text": false,
      "long-text": false,
      "optional-missing": false,
      "required-missing": false,
      "media-ratios": false,
    },
  };
}

function cloneDraft(draft: TemplateEditorDraft): TemplateEditorDraft {
  return structuredClone(draft);
}

function rebaseDraftPersistence(
  draft: TemplateEditorDraft,
  persistenceSource: TemplateEditorDraft,
  options: { historyRestore: "preserve-target" | "from-source" } = {
    historyRestore: "preserve-target",
  },
): TemplateEditorDraft {
  const rebased = cloneDraft(draft);
  rebased.sourceType = persistenceSource.sourceType;
  rebased.localDraftId = persistenceSource.localDraftId;
  rebased.remote = persistenceSource.remote
    ? structuredClone(persistenceSource.remote)
    : undefined;
  if (persistenceSource.copySource) {
    rebased.copySource = structuredClone(persistenceSource.copySource);
    rebased.copySourceDefinition = persistenceSource.copySourceDefinition ? structuredClone(persistenceSource.copySourceDefinition) : undefined;
  } else {
    delete rebased.copySource;
    delete rebased.copySourceDefinition;
  }
  if (persistenceSource.sourceReference !== undefined) {
    rebased.sourceReference = persistenceSource.sourceReference;
  } else {
    delete rebased.sourceReference;
  }
  if (persistenceSource.requiresContractNormalization === true) {
    rebased.requiresContractNormalization = true;
  } else {
    delete rebased.requiresContractNormalization;
  }
  if (options.historyRestore === "from-source") {
    if (persistenceSource.historyRestore) {
      rebased.historyRestore = structuredClone(persistenceSource.historyRestore);
    } else {
      delete rebased.historyRestore;
    }
  }
  return rebased;
}

function sameDraft(left: TemplateEditorDraft | null, right: TemplateEditorDraft | null) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameDefinition(left: TemplateEditorDraft | null, right: TemplateEditorDraft | null) {
  if (!left || !right) return left === right;
  return JSON.stringify(left.definition) === JSON.stringify(right.definition);
}

function sameSemanticDraft(left: TemplateEditorDraft | null, right: TemplateEditorDraft | null) {
  if (!left || !right) return left === right;
  return JSON.stringify({
    definition: left.definition,
    versionNote: left.versionNote,
  }) === JSON.stringify({
    definition: right.definition,
    versionNote: right.versionNote,
  });
}

function statusAfterDraftChange(current: TemplateSaveStatus): TemplateSaveStatus {
  return current === "conflict" || current === "permission-error" ? current : "idle";
}

function createPreviewReadOnlyResult(label: string): DynamicTemplateCommandResult {
  return {
    ok: false,
    changed: false,
    code: "PREVIEW_READ_ONLY",
    label,
    message: "压力预览为只读状态，请退出预览后再修改模板。",
  };
}

function createSessionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function resolveContractRoleForDevice(
  definition: TemplateDefinitionV2,
  selection: { nodeId: string; roleId: string },
  device: TemplateEditorDevice,
) {
  const node = definition.nodes[selection.nodeId];
  const slot = node?.slotId ? definition.slots[node.slotId] : undefined;
  const moduleType = slot ? getContentTemplateModuleTypeForSlotType(slot.type) : undefined;
  const contract = moduleType ? getContentTemplateContract(moduleType) : undefined;
  const role = contract?.roles.find((candidate) => candidate.id === selection.roleId);
  if (!role) return null;
  if (!role?.appliesTo?.length || role.appliesTo.includes(device)) return selection;
  const fallbackRole = role.fallbackRoleId
    ? contract?.roles.find((candidate) => candidate.id === role.fallbackRoleId)
    : undefined;
  const fallbackIsEditable = contract?.editorCapabilities.editableObjects.some(
    (candidate) => candidate.roleId === fallbackRole?.id,
  );
  if (
    !fallbackRole
    || !fallbackIsEditable
    || (fallbackRole.appliesTo?.length && !fallbackRole.appliesTo.includes(device))
  ) {
    return null;
  }
  return { nodeId: selection.nodeId, roleId: fallbackRole.id };
}

function repairTemplateEditorSelection(
  definition: TemplateDefinitionV2,
  selectionSnapshot: TemplateEditorSelectionSnapshot,
  device: TemplateEditorDevice,
  sourceDefinition: TemplateDefinitionV2 = definition,
) {
  const hasExistingSelectionTarget = selectionSnapshot.targets.some((target) => (
    Boolean(definition.nodes[target.targetId])
  ));
  const repairedSnapshot = repairTemplateEditorSelectionSnapshot(
    definition,
    selectionSnapshot,
    {
      repairTarget: (target) => {
        if (!definition.nodes[target.targetId] && !hasExistingSelectionTarget) {
          return {
            targetId: findNearestBaselineNodeId(
              sourceDefinition,
              definition,
              target.targetId,
            ),
          };
        }
        if (!definition.nodes[target.targetId]) return null;
        if (target.roleId === undefined) return target;
        const repairedRole = resolveContractRoleForDevice(
          definition,
          { nodeId: target.targetId, roleId: target.roleId },
          device,
        );
        return repairedRole
          ? { targetId: repairedRole.nodeId, roleId: repairedRole.roleId }
          : { targetId: target.targetId };
      },
    },
  );
  return {
    selectionSnapshot: repairedSnapshot,
    ...projectTemplateEditorSelectionSnapshot(repairedSnapshot),
  };
}

function findNearestBaselineNodeId(
  currentDefinition: TemplateDefinitionV2,
  baselineDefinition: TemplateDefinitionV2,
  selectedNodeId: string | null,
) {
  if (!selectedNodeId) return baselineDefinition.rootNodeId;
  const parentByNodeId = new Map<string, string>();
  for (const [parentId, node] of Object.entries(currentDefinition.nodes)) {
    for (const childId of node.childIds) parentByNodeId.set(childId, parentId);
  }
  const visited = new Set<string>();
  let candidate: string | undefined = selectedNodeId;
  while (candidate && !visited.has(candidate)) {
    if (baselineDefinition.nodes[candidate]) return candidate;
    visited.add(candidate);
    candidate = parentByNodeId.get(candidate);
  }
  return baselineDefinition.rootNodeId;
}

export type TemplateSaveReconcileResult = "saved" | "newer-changes" | "stale-session";

interface TemplateEditorSelectionHistoryEntry {
  before: TemplateEditorSelectionSnapshot;
  after: TemplateEditorSelectionSnapshot;
}

export interface TemplateWorkspaceScrollState {
  library: number;
  structure: number;
  canvas: number;
  inspector: number;
}

export type TemplateInspectorTask = "design" | "page-scope";
export type TemplateInspectorView = "context" | "page-fields";

/** 手势预览只投影定义；草稿、保存基线和历史始终保留已提交内容。 */
export interface TemplateEditorInteraction {
  token: string;
  label: string;
  sessionId: string;
  semanticGeneration: number;
  device: TemplateEditorDevice;
  breakpoint: TemplateBreakpoint;
  baselineDefinition: TemplateDefinitionV2;
}

function interactionFailure(label: string, code: string, message: string): DynamicTemplateCommandResult {
  return { ok: false, changed: false, label, code, message };
}

function parentNodeId(definition: TemplateDefinitionV2, nodeId: string): string | null {
  return Object.values(definition.nodes).find((node) => node.childIds.includes(nodeId))?.nodeId ?? null;
}

function canEnterTemplateScope(definition: TemplateDefinitionV2, nodeId: string): boolean {
  const node = definition.nodes[nodeId];
  if (!node) return false;
  if (getDynamicTemplateNodeRegistryEntry(node.type).canHaveChildren) return true;
  const slot = node.slotId ? definition.slots[node.slotId] : undefined;
  const moduleType = slot ? getContentTemplateModuleTypeForSlotType(slot.type) : undefined;
  return Boolean(moduleType && getContentTemplateContract(moduleType)?.editorCapabilities.editableObjects.length);
}

function scopeForSelection(definition: TemplateDefinitionV2, snapshot: TemplateEditorSelectionSnapshot, currentScopeId: string | null) {
  const target = snapshot.primaryTarget;
  if (!target) return repairEditingScope(definition, currentScopeId);
  if (target.roleId !== undefined) return target.targetId;
  return target.targetId === currentScopeId
    ? currentScopeId
    : parentNodeId(definition, target.targetId) ?? definition.rootNodeId;
}

function repairEditingScope(
  definition: TemplateDefinitionV2,
  editingScopeId: string | null,
  sourceDefinition: TemplateDefinitionV2 = definition,
): string {
  const candidate = findNearestBaselineNodeId(sourceDefinition, definition, editingScopeId);
  return canEnterTemplateScope(definition, candidate)
    ? candidate
    : parentNodeId(definition, candidate) ?? definition.rootNodeId;
}

export type TemplateCompatibilityRecoveryCancelResult =
  | { status: "restored" }
  | { status: "source-invalid"; issues: DynamicTemplateValidationIssue[] }
  | { status: "unavailable" };

interface TemplateEditorSessionState {
  sessionId: string | null;
  draft: TemplateEditorDraft | null;
  baseline: TemplateEditorDraft | null;
  semanticGeneration: number;
  previewDocument: TemplateDefinitionV2 | null;
  activeInteraction: TemplateEditorInteraction | null;
  editingScopeId: string | null;
  selectionSnapshot: TemplateEditorSelectionSnapshot;
  selectedObjectId: string | null;
  selectedContractRole: { nodeId: string; roleId: string } | null;
  device: TemplateEditorDevice;
  breakpoint: TemplateBreakpoint;
  contentLayer: TemplateEditorContentLayer;
  historyPast: TemplateEditorDraft[];
  historyFuture: TemplateEditorDraft[];
  selectionHistoryPast: TemplateEditorSelectionHistoryEntry[];
  selectionHistoryFuture: TemplateEditorSelectionHistoryEntry[];
  dirty: boolean;
  productionReviewFacts: TemplateProductionReviewFacts;
  inspectorTask: TemplateInspectorTask;
  inspectorView: TemplateInspectorView;
  previewMode: boolean;
  previewScenario: TemplateStressPreviewScenario;
  canvasZoom: number | null;
  previewWidth: number | null;
  workspaceScroll: TemplateWorkspaceScrollState;
  saveStatus: TemplateSaveStatus;
  lastCommandResult: DynamicTemplateCommandResult | null;
  open: (draft: TemplateEditorDraft, options?: { isNew?: boolean }) => void;
  close: () => void;
  restoreBaseline: () => boolean;
  commitDraft: (draft: TemplateEditorDraft, historyBaseline?: TemplateEditorDraft) => void;
  previewDraft: (draft: TemplateEditorDraft) => void;
  beginInteraction: (label: string, options?: { source?: "field" | "pointer" }) => string | null;
  previewInteraction: (token: string, command: DynamicTemplateDefinitionCommand) => DynamicTemplateCommandResult;
  commitInteraction: (token: string) => DynamicTemplateCommandResult;
  cancelInteraction: (token?: string) => boolean;
  enterEditingScope: (nodeId?: string) => boolean;
  leaveEditingScope: () => boolean;
  setName: (name: string) => void;
  executeCommand: (command: DynamicTemplateDefinitionCommand) => DynamicTemplateCommandResult;
  setDynamicDefinition: (definition: TemplateDefinitionV2) => DynamicTemplateCommandResult;
  stageCompatibilityRecovery: (input: {
    definition: TemplateDefinitionV2;
    originalDefinition: unknown;
    sourceRevision: number;
    sourceChecksum: string;
  }) => DynamicTemplateCommandResult;
  cancelCompatibilityRecovery: () => TemplateCompatibilityRecoveryCancelResult;
  resumeCompatibilityRecovery: () => boolean;
  clearLastCommandResult: () => void;
  setDynamicVersionNote: (versionNote: string) => void;
  transitionSelection: (
    input: Omit<TemplateEditorSelectionTransitionInput, "definition" | "snapshot">,
  ) => TemplateEditorSelectionTransitionResult | null;
  selectObject: (objectId: string | null) => void;
  selectTargets: (targets: readonly TemplateEditorSelectionTarget[], options?: { additive?: boolean }) => TemplateEditorSelectionTransitionResult | null;
  selectContractRole: (nodeId: string, roleId: string) => void;
  setDevice: (device: TemplateEditorDevice) => void;
  setBreakpoint: (breakpoint: TemplateBreakpoint) => boolean;
  setContentLayer: (contentLayer: TemplateEditorContentLayer) => void;
  setInspectorTask: (inspectorTask: TemplateInspectorTask) => void;
  setInspectorView: (inspectorView: TemplateInspectorView) => void;
  confirmDeviceReview: (device: TemplateEditorDevice) => void;
  confirmPageScopeReview: (source?: "publish-review") => void;
  confirmStressPreviewScenarioReview: (scenario: TemplateStressPreviewScenario) => void;
  setPreviewMode: (previewMode: boolean) => void;
  setPreviewScenario: (previewScenario: TemplateStressPreviewScenario) => void;
  setCanvasZoom: (canvasZoom: number | null) => void;
  setPreviewWidth: (width: number | null) => boolean;
  setWorkspaceScroll: (
    sessionId: string,
    workspaceScroll: TemplateWorkspaceScrollState,
  ) => void;
  setSaveStatus: (saveStatus: TemplateSaveStatus) => void;
  undo: () => void;
  redo: () => void;
  markSaved: (draft: TemplateEditorDraft) => void;
  reconcileSaveResult: (input: {
    sessionId: string;
    requestedDraft: TemplateEditorDraft;
    savedDraft: TemplateEditorDraft;
  }) => TemplateSaveReconcileResult;
}

const EMPTY_STATE = {
  sessionId: null,
  draft: null,
  baseline: null,
  semanticGeneration: 0,
  previewDocument: null as TemplateDefinitionV2 | null,
  activeInteraction: null as TemplateEditorInteraction | null,
  editingScopeId: null as string | null,
  selectionSnapshot: createTemplateEditorSelectionSnapshot(),
  selectedObjectId: null,
  selectedContractRole: null,
  device: "desktop" as const,
  breakpoint: "desktop" as TemplateBreakpoint,
  contentLayer: "preview" as const,
  historyPast: [] as TemplateEditorDraft[],
  historyFuture: [] as TemplateEditorDraft[],
  selectionHistoryPast: [] as TemplateEditorSelectionHistoryEntry[],
  selectionHistoryFuture: [] as TemplateEditorSelectionHistoryEntry[],
  dirty: false,
  productionReviewFacts: createTemplateProductionReviewFacts(),
  inspectorTask: "design" as const,
  inspectorView: "context" as const,
  previewMode: false,
  previewScenario: "short-text" as const,
  canvasZoom: null as number | null,
  previewWidth: null as number | null,
  workspaceScroll: {
    library: 0,
    structure: 0,
    canvas: 0,
    inspector: 0,
  },
  saveStatus: "idle" as const,
  lastCommandResult: null as DynamicTemplateCommandResult | null,
};

export const useTemplateEditorSession = create<TemplateEditorSessionState>((set, get) => ({
  ...EMPTY_STATE,
  open: (draft, options) =>
    set((state) => {
      const selectionSnapshot = createTemplateEditorSelectionSnapshot({
        targetId: draft.definition.rootNodeId,
      });
      return {
        ...EMPTY_STATE,
        productionReviewFacts: createTemplateProductionReviewFacts(),
        device: state.device,
        breakpoint: state.breakpoint === "tablet" && Number(draft.definition.schemaVersion) < 2
          ? "desktop" : state.breakpoint,
        sessionId: createSessionId(),
        draft: cloneDraft(draft),
        editingScopeId: draft.definition.rootNodeId,
        baseline: options?.isNew ? null : cloneDraft(draft),
        selectionSnapshot,
        ...projectTemplateEditorSelectionSnapshot(selectionSnapshot),
        dirty: options?.isNew === true,
      };
    }),
  close: () => {
    if (get().previewMode) return;
    set({
      ...EMPTY_STATE,
      productionReviewFacts: createTemplateProductionReviewFacts(),
    });
  },
  restoreBaseline: () => {
    const state = get();
    if (state.previewMode) return false;
    if (!state.draft || !state.baseline) return false;
    const selectedNodeId = state.selectedContractRole?.nodeId ?? state.selectedObjectId;
    const nearestNodeId = findNearestBaselineNodeId(
      state.draft.definition,
      state.baseline.definition,
      selectedNodeId,
    );
    const selectedContractRole = nearestNodeId === state.selectedContractRole?.nodeId
      ? state.selectedContractRole
      : null;
    const restoredPrimary = selectedContractRole
      ? { targetId: selectedContractRole.nodeId, roleId: selectedContractRole.roleId }
      : { targetId: nearestNodeId };
    const currentPrimary = state.selectionSnapshot.primaryTarget;
    const selectionBeforeRepair: TemplateEditorSelectionSnapshot = {
      targets: state.selectionSnapshot.targets.map((target) => (
        isSameTemplateEditorSelectionTarget(target, currentPrimary)
          ? restoredPrimary
          : target
      )),
      primaryTarget: restoredPrimary,
      anchorTarget: isSameTemplateEditorSelectionTarget(
        state.selectionSnapshot.anchorTarget,
        currentPrimary,
      )
        ? restoredPrimary
        : state.selectionSnapshot.anchorTarget,
    };
    const baseline = cloneDraft(state.baseline);
    set({
      draft: cloneDraft(baseline),
      previewDocument: null,
      activeInteraction: null,
      editingScopeId: repairEditingScope(baseline.definition, state.editingScopeId, state.draft.definition),
      baseline,
      ...repairTemplateEditorSelection(
        baseline.definition,
        selectionBeforeRepair,
        state.device,
      ),
      contentLayer: "preview",
      historyPast: [],
      historyFuture: [],
      selectionHistoryPast: [],
      selectionHistoryFuture: [],
      dirty: false,
      previewMode: false,
      previewScenario: "short-text",
      productionReviewFacts: createTemplateProductionReviewFacts(),
      saveStatus: "idle",
      lastCommandResult: null,
      semanticGeneration: state.semanticGeneration + 1,
    });
    return true;
  },
  commitDraft: (draft, historyBaseline) =>
    set((state) => {
      if (state.previewMode) return state;
      if (!state.draft) return state;
      const previous = historyBaseline ?? state.draft;
      if (sameDraft(previous, draft) && sameDraft(state.draft, draft)) {
        return state.activeInteraction ? { activeInteraction: null, previewDocument: null } : state;
      }
      const nextDraft = cloneDraft(draft);
      const selection = repairTemplateEditorSelection(
        nextDraft.definition,
        state.selectionSnapshot,
        state.device,
        state.draft.definition,
      );
      const createsHistoryEntry = !sameDraft(previous, nextDraft);
      return {
        draft: nextDraft,
        previewDocument: null,
        activeInteraction: null,
        editingScopeId: scopeForSelection(nextDraft.definition, selection.selectionSnapshot,
          repairEditingScope(nextDraft.definition, state.editingScopeId, state.draft.definition)),
        ...selection,
        historyPast: !createsHistoryEntry
          ? state.historyPast
          : [...state.historyPast, cloneDraft(previous)].slice(-HISTORY_LIMIT),
        historyFuture: [],
        selectionHistoryPast: !createsHistoryEntry
          ? state.selectionHistoryPast
          : [...state.selectionHistoryPast, {
              before: state.selectionSnapshot,
              after: selection.selectionSnapshot,
            }].slice(-HISTORY_LIMIT),
        selectionHistoryFuture: [],
        dirty: !sameDraft(nextDraft, state.baseline),
        saveStatus: statusAfterDraftChange(state.saveStatus),
        productionReviewFacts: sameDefinition(state.draft, nextDraft)
          ? state.productionReviewFacts
          : createTemplateProductionReviewFacts(),
        semanticGeneration: sameSemanticDraft(state.draft, nextDraft)
          ? state.semanticGeneration
          : state.semanticGeneration + 1,
      };
    }),
  beginInteraction: (label, options) => {
    if (options?.source !== "field" && focusFirstInvalidNumberField()) return null;
    // 字段 flush 可能刚提交一次草稿；事务基线必须从 flush 之后重新读取。
    const state = get();
    if (!state.draft || !state.sessionId || state.previewMode) return null;
    // 替换事务即取消旧预览，旧指针迟到事件不能提交新事务。
    const token = createSessionId();
    set({
      previewDocument: null,
      activeInteraction: {
        token,
        label,
        sessionId: state.sessionId,
        semanticGeneration: state.semanticGeneration,
        device: state.device,
        breakpoint: state.breakpoint,
        baselineDefinition: structuredClone(state.draft.definition),
      },
    });
    return token;
  },
  previewInteraction: (token, command) => {
    const state = get();
    const active = state.activeInteraction;
    if (!active || active.token !== token) {
      return interactionFailure(command.label, "STALE_INTERACTION", "操作已取消或已被新的操作替代。");
    }
    if (!state.draft || state.previewMode || state.sessionId !== active.sessionId
      || state.semanticGeneration !== active.semanticGeneration || state.device !== active.device || state.breakpoint !== active.breakpoint
      || !sameDefinition(state.draft, { ...state.draft, definition: active.baselineDefinition })) {
      state.cancelInteraction(token);
      return interactionFailure(command.label, "STALE_INTERACTION", "编辑对象或断点已经变化，请重新开始操作。");
    }
    // 命令接收开始时的定义：累计鼠标位移不会在每一帧重复叠加。
    const result = executeDynamicTemplateDefinitionCommand(active.baselineDefinition, command);
    if (!result.ok) {
      set({ activeInteraction: null, previewDocument: null, lastCommandResult: result });
      return result;
    }
    set({ previewDocument: result.definition, lastCommandResult: result });
    return result;
  },
  commitInteraction: (token) => {
    const state = get();
    const active = state.activeInteraction;
    if (!active || active.token !== token) {
      return interactionFailure("提交操作", "STALE_INTERACTION", "操作已取消或已被新的操作替代。");
    }
    if (!state.draft || state.previewMode || state.sessionId !== active.sessionId
      || state.semanticGeneration !== active.semanticGeneration || state.device !== active.device || state.breakpoint !== active.breakpoint
      || !sameDefinition(state.draft, { ...state.draft, definition: active.baselineDefinition })) {
      state.cancelInteraction(token);
      return interactionFailure(active.label, "STALE_INTERACTION", "模板已经变化，本次预览没有写入。");
    }
    // 确认实际展示的结果，不重放可能捕获可变闭包的 UI 命令。
    const result = executeDynamicTemplateDefinitionCommand(state.draft.definition, {
      type: "replace-definition",
      label: active.label,
      definition: state.previewDocument ?? active.baselineDefinition,
    });
    if (!result.ok) {
      set({ activeInteraction: null, previewDocument: null, lastCommandResult: result });
      return result;
    }
    set({ activeInteraction: null, previewDocument: null, lastCommandResult: result });
    if (result.changed) get().commitDraft({ ...state.draft, definition: result.definition });
    return result;
  },
  cancelInteraction: (token) => {
    const active = get().activeInteraction;
    if (!active || (token !== undefined && active.token !== token)) return false;
    set({ activeInteraction: null, previewDocument: null });
    return true;
  },
  enterEditingScope: (nodeId) => {
    const state = get();
    const targetId = nodeId ?? state.selectionSnapshot.primaryTarget?.targetId;
    if (state.previewMode || !state.draft || !targetId || focusFirstInvalidNumberField()) return false;
    const node = state.draft.definition.nodes[targetId];
    if (!node || !canEnterTemplateScope(state.draft.definition, targetId)) return false;
    const selectionSnapshot = createTemplateEditorSelectionSnapshot({ targetId });
    set({
      activeInteraction: null,
      previewDocument: null,
      editingScopeId: targetId,
      selectionSnapshot,
      ...projectTemplateEditorSelectionSnapshot(selectionSnapshot),
    });
    return true;
  },
  leaveEditingScope: () => {
    const state = get();
    if (state.cancelInteraction()) return true;
    if (state.previewMode || !state.draft || !state.editingScopeId || focusFirstInvalidNumberField()) return false;
    const parentId = parentNodeId(state.draft.definition, state.editingScopeId);
    if (!parentId) return false;
    const selectionSnapshot = createTemplateEditorSelectionSnapshot({ targetId: state.editingScopeId });
    set({
      editingScopeId: parentId,
      selectionSnapshot,
      ...projectTemplateEditorSelectionSnapshot(selectionSnapshot),
    });
    return true;
  },
  previewDraft: (draft) =>
    set((state) => {
      if (state.previewMode) return state;
      if (!state.draft) return state;
      const nextDraft = cloneDraft(draft);
      return {
        draft: nextDraft,
        ...repairTemplateEditorSelection(
          nextDraft.definition,
          state.selectionSnapshot,
          state.device,
        ),
        dirty: !sameDraft(draft, state.baseline),
        saveStatus: statusAfterDraftChange(state.saveStatus),
        productionReviewFacts: sameDefinition(state.draft, nextDraft)
          ? state.productionReviewFacts
          : createTemplateProductionReviewFacts(),
        semanticGeneration: sameSemanticDraft(state.draft, nextDraft)
          ? state.semanticGeneration
          : state.semanticGeneration + 1,
      };
    }),
  setName: (name) => {
    const state = useTemplateEditorSession.getState();
    if (!state.draft) return;
    state.commitDraft({
      ...state.draft,
      definition: { ...state.draft.definition, name },
    });
  },
  executeCommand: (command) => {
    const state = get();
    if (state.previewMode) return createPreviewReadOnlyResult(command.label);
    if (!state.draft) {
      const result: DynamicTemplateCommandResult = {
        ok: false,
        changed: false,
        code: "NO_ACTIVE_DRAFT",
        label: command.label,
        message: "当前没有可编辑的模板草稿。",
      };
      set({ lastCommandResult: result });
      return result;
    }
    const result = executeDynamicTemplateDefinitionCommand(state.draft.definition, command);
    set({ lastCommandResult: result });
    if (result.ok && result.changed) {
      state.commitDraft({ ...state.draft, definition: result.definition });
    }
    return result;
  },
  setDynamicDefinition: (definition) => get().executeCommand({
    type: "replace-definition",
    label: "更新模板",
    definition,
  }),
  stageCompatibilityRecovery: ({
    definition,
    originalDefinition,
    sourceRevision,
    sourceChecksum,
  }) => {
    const state = get();
    if (state.previewMode) return createPreviewReadOnlyResult("载入系统修复方案");
    if (!state.draft) {
      const result: DynamicTemplateCommandResult = {
        ok: false,
        changed: false,
        code: "NO_ACTIVE_DRAFT",
        label: "载入系统修复方案",
        message: "当前没有可编辑的模板草稿。",
      };
      set({ lastCommandResult: result });
      return result;
    }
    const result = executeDynamicTemplateDefinitionCommand(state.draft.definition, {
      type: "replace-definition",
      label: "载入系统修复方案",
      definition,
    });
    set({ lastCommandResult: result });
    if (!result.ok) return result;
    state.commitDraft({
      ...state.draft,
      definition: result.definition,
      compatibilityRecovery: {
        status: "pending",
        originalDefinition: structuredClone(originalDefinition),
        originalVersionNote: state.draft.versionNote,
        sourceRevision,
        sourceChecksum,
      },
    });
    return result;
  },
  cancelCompatibilityRecovery: () => {
    const state = get();
    if (state.previewMode) return { status: "unavailable" };
    const recovery = state.draft?.compatibilityRecovery;
    if (!state.draft || !recovery) return { status: "unavailable" };
    const validation = validateDynamicTemplateDefinition(recovery.originalDefinition);
    if (!validation.valid || !validation.definition) {
      state.commitDraft({
        ...state.draft,
        compatibilityRecovery: { ...recovery, status: "source-invalid" },
      });
      return { status: "source-invalid", issues: validation.issues };
    }
    const draftBeforeRestore = cloneDraft(state.draft);
    const restoredDefinition = validation.definition;
    const restored = cloneDraft(draftBeforeRestore);
    restored.definition = restoredDefinition;
    restored.versionNote = recovery.originalVersionNote;
    delete restored.compatibilityRecovery;
    // 取消修复即回到原草稿本身：把恢复结果设为干净基线，避免把“恢复原状”
    // 当作未保存修改去拦截后续切换或关闭；撤销历史保留，仍可回到修复方案。
    set((state) => ({
      draft: cloneDraft(restored),
      baseline: cloneDraft(restored),
      ...repairTemplateEditorSelection(
        restoredDefinition,
        state.selectionSnapshot,
        state.device,
      ),
      historyPast: [...state.historyPast, draftBeforeRestore].slice(-HISTORY_LIMIT),
      historyFuture: [],
      selectionHistoryPast: [...state.selectionHistoryPast, {
        before: state.selectionSnapshot,
        after: repairTemplateEditorSelection(
          restoredDefinition,
          state.selectionSnapshot,
          state.device,
          state.draft!.definition,
        ).selectionSnapshot,
      }].slice(-HISTORY_LIMIT),
      selectionHistoryFuture: [],
      dirty: false,
      productionReviewFacts: createTemplateProductionReviewFacts(),
      saveStatus: "idle",
      lastCommandResult: null,
    }));
    return { status: "restored" };
  },
  resumeCompatibilityRecovery: () => {
    const state = get();
    if (state.previewMode) return false;
    const recovery = state.draft?.compatibilityRecovery;
    if (!state.draft || !recovery || recovery.status === "pending") return false;
    state.commitDraft({
      ...state.draft,
      compatibilityRecovery: { ...recovery, status: "pending" },
    });
    return true;
  },
  clearLastCommandResult: () => set((state) => (
    state.previewMode ? state : { lastCommandResult: null }
  )),
  setDynamicVersionNote: (versionNote) => {
    const state = useTemplateEditorSession.getState();
    if (!state.draft) return;
    state.commitDraft({ ...state.draft, versionNote: versionNote.slice(0, 500) });
  },
  transitionSelection: (input) => {
    const state = get();
    if (state.previewMode || !state.draft) return null;
    if (focusFirstInvalidNumberField()) return null;
    const result = transitionTemplateEditorSelection({
      ...input,
      definition: state.draft.definition,
      snapshot: state.selectionSnapshot,
    });
    if (result.ok && result.changed) {
      set((current) => ({
        activeInteraction: null,
        previewDocument: null,
        editingScopeId: scopeForSelection(state.draft!.definition, result.snapshot, current.editingScopeId),
        selectionSnapshot: result.snapshot,
        ...projectTemplateEditorSelectionSnapshot(result.snapshot),
        selectionHistoryPast: current.historyFuture.length === 0
          && current.selectionHistoryPast.length > 0
          ? [
              ...current.selectionHistoryPast.slice(0, -1),
              {
                ...current.selectionHistoryPast[current.selectionHistoryPast.length - 1],
                after: result.snapshot,
              },
            ]
          : current.selectionHistoryPast,
      }));
    }
    return result;
  },
  selectTargets: (targets, options) => {
    const state = get();
    if (state.previewMode || !state.draft || focusFirstInvalidNumberField()) return null;
    const result = selectTemplateEditorTargets({
      definition: state.draft.definition,
      snapshot: state.selectionSnapshot,
      targets,
      additive: options?.additive,
    });
    if (result.changed) {
      set({ activeInteraction: null, previewDocument: null, selectionSnapshot: result.snapshot,
        ...projectTemplateEditorSelectionSnapshot(result.snapshot) });
    }
    return result;
  },
  selectObject: (selectedObjectId) => {
    if (selectedObjectId !== null) {
      get().transitionSelection({
        target: { targetId: selectedObjectId },
        visibleTargets: [{ targetId: selectedObjectId }],
      });
      return;
    }
    if (get().previewMode || focusFirstInvalidNumberField()) return;
    const selectionSnapshot = createTemplateEditorSelectionSnapshot();
    set({
      activeInteraction: null,
      previewDocument: null,
      selectionSnapshot,
      ...projectTemplateEditorSelectionSnapshot(selectionSnapshot),
    });
  },
  selectContractRole: (nodeId, roleId) => {
    get().transitionSelection({
      target: { targetId: nodeId, roleId },
      visibleTargets: [{ targetId: nodeId, roleId }],
    });
  },
  setDevice: (device) => {
    if (focusFirstInvalidNumberField()) return;
    const state = get();
    if (!state.draft) { set({ device, breakpoint: device }); return; }
    set({
      device,
      breakpoint: device,
      previewWidth: null,
      activeInteraction: null,
      previewDocument: null,
      ...repairTemplateEditorSelection(
        state.draft.definition,
        state.selectionSnapshot,
        device,
      ),
    });
  },
  setBreakpoint: (breakpoint) => {
    if (focusFirstInvalidNumberField()) return false;
    const state = get();
    if (breakpoint === "tablet" && (!state.draft || Number(state.draft.definition.schemaVersion) < 2)) return false;
    const device = breakpoint === "mobile" ? "mobile" : "desktop";
    set({
      breakpoint, device, previewWidth: null, activeInteraction: null, previewDocument: null,
      ...(state.draft ? repairTemplateEditorSelection(state.draft.definition, state.selectionSnapshot, device) : {}),
    });
    return true;
  },
  setContentLayer: (contentLayer) => {
    if (get().previewMode) return;
    if (focusFirstInvalidNumberField()) return;
    set({ contentLayer });
  },
  setInspectorTask: (inspectorTask) => set((state) => (
    state.previewMode ? state : { inspectorTask }
  )),
  setInspectorView: (inspectorView) => set((state) => (
    state.previewMode ? state : { inspectorView }
  )),
  confirmDeviceReview: (device) => set((state) => (
    state.draft && !state.previewMode && state.device === device
      ? {
          productionReviewFacts: {
            ...state.productionReviewFacts,
            [device]: true,
          },
        }
      : state
  )),
  confirmPageScopeReview: (source) => set((state) => (
    state.draft && !state.previewMode && (state.inspectorTask === "page-scope" || source === "publish-review")
      ? {
          productionReviewFacts: {
            ...state.productionReviewFacts,
            pageScope: true,
          },
        }
      : state
  )),
  confirmStressPreviewScenarioReview: (scenario) => set((state) => (
    state.draft && state.previewMode && state.previewScenario === scenario
      ? {
          productionReviewFacts: {
            ...state.productionReviewFacts,
            stressPreview: {
              ...state.productionReviewFacts.stressPreview,
              [scenario]: true,
            },
          },
        }
      : state
  )),
  setPreviewMode: (previewMode) => set({ previewMode, activeInteraction: null, previewDocument: null }),
  setPreviewScenario: (previewScenario) => set({ previewScenario }),
  setCanvasZoom: (canvasZoom) => set((state) => (
    state.previewMode ? state : { canvasZoom }
  )),
  setPreviewWidth: (width) => {
    if (focusFirstInvalidNumberField()) return false;
    const state = get();
    if (width !== null && (!Number.isFinite(width) || width < 1)) return false;
    const previewWidth = width === null ? null : Math.round(width);
    const breakpoint = previewWidth !== null && state.draft
      ? resolveTemplateBreakpoint(state.draft.definition, previewWidth) : state.breakpoint;
    const device = breakpoint === "mobile" ? "mobile" : "desktop";
    set({
      previewWidth, breakpoint, device, activeInteraction: null, previewDocument: null,
      ...(state.draft ? repairTemplateEditorSelection(state.draft.definition, state.selectionSnapshot, device) : {}),
    });
    return true;
  },
  setWorkspaceScroll: (sessionId, workspaceScroll) => set((state) => (
    !state.previewMode && state.sessionId === sessionId ? { workspaceScroll } : state
  )),
  setSaveStatus: (saveStatus) => set((state) => (
    state.previewMode ? state : { saveStatus }
  )),
  undo: () =>
    set((state) => {
      if (state.previewMode) return state;
      if (state.activeInteraction) return { activeInteraction: null, previewDocument: null };
      if (!state.draft || state.historyPast.length === 0) return state;
      const previous = rebaseDraftPersistence(
        state.historyPast[state.historyPast.length - 1],
        state.draft,
      );
      const selectionHistory = state.selectionHistoryPast[state.selectionHistoryPast.length - 1];
      const selection = repairTemplateEditorSelection(
        previous.definition,
        selectionHistory?.before ?? state.selectionSnapshot,
        state.device,
        state.draft.definition,
      );
      return {
        draft: cloneDraft(previous),
        editingScopeId: scopeForSelection(previous.definition, selection.selectionSnapshot, state.editingScopeId),
        ...selection,
        historyPast: state.historyPast.slice(0, -1),
        historyFuture: [cloneDraft(state.draft), ...state.historyFuture].slice(0, HISTORY_LIMIT),
        selectionHistoryPast: state.selectionHistoryPast.slice(0, -1),
        selectionHistoryFuture: selectionHistory
          ? [selectionHistory, ...state.selectionHistoryFuture].slice(0, HISTORY_LIMIT)
          : state.selectionHistoryFuture,
        dirty: !sameDraft(previous, state.baseline),
        saveStatus: statusAfterDraftChange(state.saveStatus),
        productionReviewFacts: sameDefinition(state.draft, previous)
          ? state.productionReviewFacts
          : createTemplateProductionReviewFacts(),
        semanticGeneration: sameSemanticDraft(state.draft, previous)
          ? state.semanticGeneration
          : state.semanticGeneration + 1,
      };
    }),
  redo: () =>
    set((state) => {
      if (state.previewMode) return state;
      if (state.activeInteraction) return { activeInteraction: null, previewDocument: null };
      if (!state.draft || state.historyFuture.length === 0) return state;
      const next = rebaseDraftPersistence(state.historyFuture[0], state.draft);
      const selectionHistory = state.selectionHistoryFuture[0];
      const selection = repairTemplateEditorSelection(
        next.definition,
        selectionHistory?.after ?? state.selectionSnapshot,
        state.device,
        state.draft.definition,
      );
      return {
        draft: cloneDraft(next),
        editingScopeId: scopeForSelection(next.definition, selection.selectionSnapshot, state.editingScopeId),
        ...selection,
        historyPast: [...state.historyPast, cloneDraft(state.draft)].slice(-HISTORY_LIMIT),
        historyFuture: state.historyFuture.slice(1),
        selectionHistoryPast: selectionHistory
          ? [...state.selectionHistoryPast, selectionHistory].slice(-HISTORY_LIMIT)
          : state.selectionHistoryPast,
        selectionHistoryFuture: state.selectionHistoryFuture.slice(1),
        dirty: !sameDraft(next, state.baseline),
        saveStatus: statusAfterDraftChange(state.saveStatus),
        productionReviewFacts: sameDefinition(state.draft, next)
          ? state.productionReviewFacts
          : createTemplateProductionReviewFacts(),
        semanticGeneration: sameSemanticDraft(state.draft, next)
          ? state.semanticGeneration
          : state.semanticGeneration + 1,
      };
    }),
  markSaved: (draft) =>
    set((state) => {
      if (state.previewMode) return state;
      const nextDraft = cloneDraft(draft);
      return {
        draft: nextDraft,
        baseline: cloneDraft(draft),
        ...(!sameDefinition(state.draft, nextDraft) ? { activeInteraction: null, previewDocument: null } : {}),
        editingScopeId: repairEditingScope(nextDraft.definition, state.editingScopeId, state.draft?.definition),
        ...repairTemplateEditorSelection(
          nextDraft.definition,
          state.selectionSnapshot,
          state.device,
        ),
        dirty: false,
        productionReviewFacts: sameDefinition(state.draft, nextDraft)
          ? state.productionReviewFacts
          : createTemplateProductionReviewFacts(),
        saveStatus: "success",
      };
    }),
  reconcileSaveResult: ({ sessionId, requestedDraft, savedDraft }) => {
    let result: TemplateSaveReconcileResult = "stale-session";
    set((state) => {
      if (state.previewMode) return state;
      if (
        state.sessionId !== sessionId
        || !state.draft
        || state.draft.definition.templateId !== requestedDraft.definition.templateId
      ) return state;

      const completedRecoveryOverwrite = Boolean(requestedDraft.compatibilityRecovery);
      const createsNewIdentity = savedDraft.definition.templateId !== requestedDraft.definition.templateId;

      if (sameDraft(state.draft, requestedDraft)) {
        result = "saved";
        const nextDraft = cloneDraft(savedDraft);
        return {
          draft: nextDraft,
          baseline: cloneDraft(savedDraft),
          ...(!sameDefinition(state.draft, nextDraft) ? { activeInteraction: null, previewDocument: null } : {}),
          editingScopeId: repairEditingScope(nextDraft.definition, state.editingScopeId, state.draft.definition),
          ...repairTemplateEditorSelection(
            nextDraft.definition,
            state.selectionSnapshot,
            state.device,
          ),
          dirty: false,
          productionReviewFacts: sameDefinition(state.draft, nextDraft)
            ? state.productionReviewFacts
            : createTemplateProductionReviewFacts(),
          saveStatus: "success",
          // 新身份只继承已保存内容；来源身份的历史不能与副本持久化信息混用。
          ...(createsNewIdentity || completedRecoveryOverwrite
            ? {
                historyPast: [],
                historyFuture: [],
                selectionHistoryPast: [],
                selectionHistoryFuture: [],
              }
            : {}),
        };
      }

      result = "newer-changes";
      if (createsNewIdentity) {
        return { saveStatus: "idle" };
      }
      const rebasedDraft = rebaseDraftPersistence(state.draft, savedDraft, {
        historyRestore: "from-source",
      });
      if (completedRecoveryOverwrite) {
        delete rebasedDraft.compatibilityRecovery;
      }
      return {
        draft: rebasedDraft,
        baseline: cloneDraft(savedDraft),
        ...repairTemplateEditorSelection(
          rebasedDraft.definition,
          state.selectionSnapshot,
          state.device,
        ),
        dirty: !sameDraft(rebasedDraft, savedDraft),
        saveStatus: "idle",
        ...(completedRecoveryOverwrite
          ? {
              historyPast: [],
              historyFuture: [],
              selectionHistoryPast: [],
              selectionHistoryFuture: [],
            }
          : {}),
      };
    });
    return result;
  },
}));

export function hasUnpersistedTemplateDraft(state = useTemplateEditorSession.getState()) {
  return Boolean(state.draft && state.dirty);
}
