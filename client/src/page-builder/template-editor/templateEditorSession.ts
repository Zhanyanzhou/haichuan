import { create } from "zustand";
import type {
  TemplateEditorDraft,
  TemplateEditorContentLayer,
  TemplateEditorDevice,
  DynamicTemplatePreviewScenario,
  TemplateSaveStatus,
} from "./types";
import {
  executeDynamicTemplateDefinitionCommand,
  validateDynamicTemplateDefinition,
  type DynamicTemplateCommandResult,
  type DynamicTemplateValidationIssue,
  type DynamicTemplateDefinitionCommand,
  type TemplateDefinitionV2,
} from "../template-definition";
import { getContentTemplateContract } from "../generated/contentTemplates.generated";
import { getContentTemplateModuleTypeForSlotType } from "../template-definition/validateTemplateDefinition";

const HISTORY_LIMIT = 50;

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

function statusAfterDraftChange(current: TemplateSaveStatus): TemplateSaveStatus {
  return current === "conflict" || current === "permission-error" ? current : "idle";
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
  selectedObjectId: string | null,
  selectedContractRole: { nodeId: string; roleId: string } | null,
  device: TemplateEditorDevice,
) {
  if (selectedContractRole && definition.nodes[selectedContractRole.nodeId]) {
    const repairedRole = resolveContractRoleForDevice(
      definition,
      selectedContractRole,
      device,
    );
    if (repairedRole) {
      return {
        selectedObjectId: repairedRole.nodeId,
        selectedContractRole: repairedRole,
      };
    }
    return {
      selectedObjectId: selectedContractRole.nodeId,
      selectedContractRole: null,
    };
  }
  if (selectedObjectId && definition.nodes[selectedObjectId]) {
    return { selectedObjectId, selectedContractRole: null };
  }
  return {
    selectedObjectId: definition.rootNodeId,
    selectedContractRole: null,
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

export type TemplateCompatibilityRecoveryCancelResult =
  | { status: "restored" }
  | { status: "source-invalid"; issues: DynamicTemplateValidationIssue[] }
  | { status: "unavailable" };

interface TemplateEditorSessionState {
  sessionId: string | null;
  draft: TemplateEditorDraft | null;
  baseline: TemplateEditorDraft | null;
  selectedObjectId: string | null;
  selectedContractRole: { nodeId: string; roleId: string } | null;
  device: TemplateEditorDevice;
  contentLayer: TemplateEditorContentLayer;
  historyPast: TemplateEditorDraft[];
  historyFuture: TemplateEditorDraft[];
  dirty: boolean;
  previewMode: boolean;
  previewScenario: DynamicTemplatePreviewScenario;
  canvasZoom: number | null;
  saveStatus: TemplateSaveStatus;
  lastCommandResult: DynamicTemplateCommandResult | null;
  open: (draft: TemplateEditorDraft, options?: { isNew?: boolean }) => void;
  close: () => void;
  restoreBaseline: () => boolean;
  commitDraft: (draft: TemplateEditorDraft, historyBaseline?: TemplateEditorDraft) => void;
  previewDraft: (draft: TemplateEditorDraft) => void;
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
  selectObject: (objectId: string | null) => void;
  selectContractRole: (nodeId: string, roleId: string) => void;
  setDevice: (device: TemplateEditorDevice) => void;
  setContentLayer: (contentLayer: TemplateEditorContentLayer) => void;
  setPreviewMode: (previewMode: boolean) => void;
  setPreviewScenario: (previewScenario: DynamicTemplatePreviewScenario) => void;
  setCanvasZoom: (canvasZoom: number | null) => void;
  setSaveStatus: (saveStatus: TemplateSaveStatus) => void;
  undo: () => void;
  redo: () => void;
  markSaved: (draft: TemplateEditorDraft) => void;
  reconcileSaveResult: (input: {
    sessionId: string;
    requestedDraft: TemplateEditorDraft;
    savedDraft: TemplateEditorDraft;
    asCopy?: boolean;
  }) => TemplateSaveReconcileResult;
}

const EMPTY_STATE = {
  sessionId: null,
  draft: null,
  baseline: null,
  selectedObjectId: null,
  selectedContractRole: null,
  device: "desktop" as const,
  contentLayer: "preview" as const,
  historyPast: [] as TemplateEditorDraft[],
  historyFuture: [] as TemplateEditorDraft[],
  dirty: false,
  previewMode: false,
  previewScenario: "default" as const,
  canvasZoom: null as number | null,
  saveStatus: "idle" as const,
  lastCommandResult: null as DynamicTemplateCommandResult | null,
};

export const useTemplateEditorSession = create<TemplateEditorSessionState>((set, get) => ({
  ...EMPTY_STATE,
  open: (draft, options) =>
    set((state) => ({
      ...EMPTY_STATE,
      device: state.device,
      sessionId: createSessionId(),
      draft: cloneDraft(draft),
      baseline: options?.isNew ? null : cloneDraft(draft),
      selectedObjectId: draft.definition.rootNodeId,
      dirty: options?.isNew === true,
    })),
  close: () => set({ ...EMPTY_STATE }),
  restoreBaseline: () => {
    const state = get();
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
    const baseline = cloneDraft(state.baseline);
    set({
      draft: cloneDraft(baseline),
      baseline,
      ...repairTemplateEditorSelection(
        baseline.definition,
        nearestNodeId,
        selectedContractRole,
        state.device,
      ),
      contentLayer: "preview",
      historyPast: [],
      historyFuture: [],
      dirty: false,
      previewMode: false,
      previewScenario: "default",
      saveStatus: "idle",
      lastCommandResult: null,
    });
    return true;
  },
  commitDraft: (draft, historyBaseline) =>
    set((state) => {
      if (!state.draft) return state;
      const previous = historyBaseline ?? state.draft;
      if (sameDraft(previous, draft) && sameDraft(state.draft, draft)) return state;
      const nextDraft = cloneDraft(draft);
      const selection = repairTemplateEditorSelection(
        nextDraft.definition,
        state.selectedObjectId,
        state.selectedContractRole,
        state.device,
      );
      return {
        draft: nextDraft,
        ...selection,
        historyPast: sameDraft(previous, nextDraft)
          ? state.historyPast
          : [...state.historyPast, cloneDraft(previous)].slice(-HISTORY_LIMIT),
        historyFuture: [],
        dirty: !sameDraft(nextDraft, state.baseline),
        saveStatus: statusAfterDraftChange(state.saveStatus),
      };
    }),
  previewDraft: (draft) =>
    set((state) => {
      if (!state.draft) return state;
      const nextDraft = cloneDraft(draft);
      return {
        draft: nextDraft,
        ...repairTemplateEditorSelection(
          nextDraft.definition,
          state.selectedObjectId,
          state.selectedContractRole,
          state.device,
        ),
        dirty: !sameDraft(draft, state.baseline),
        saveStatus: statusAfterDraftChange(state.saveStatus),
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
        state.selectedObjectId,
        state.selectedContractRole,
        state.device,
      ),
      historyPast: [...state.historyPast, draftBeforeRestore].slice(-HISTORY_LIMIT),
      historyFuture: [],
      dirty: false,
      saveStatus: "idle",
      lastCommandResult: null,
    }));
    return { status: "restored" };
  },
  resumeCompatibilityRecovery: () => {
    const state = get();
    const recovery = state.draft?.compatibilityRecovery;
    if (!state.draft || !recovery || recovery.status === "pending") return false;
    state.commitDraft({
      ...state.draft,
      compatibilityRecovery: { ...recovery, status: "pending" },
    });
    return true;
  },
  clearLastCommandResult: () => set({ lastCommandResult: null }),
  setDynamicVersionNote: (versionNote) => {
    const state = useTemplateEditorSession.getState();
    if (!state.draft) return;
    state.commitDraft({ ...state.draft, versionNote: versionNote.slice(0, 500) });
  },
  selectObject: (selectedObjectId) => set({ selectedObjectId, selectedContractRole: null }),
  selectContractRole: (nodeId, roleId) => set({
    selectedObjectId: nodeId,
    selectedContractRole: { nodeId, roleId },
  }),
  setDevice: (device) => set((state) => {
    if (!state.draft || !state.selectedContractRole) return { device };
    return {
      device,
      selectedContractRole: resolveContractRoleForDevice(
        state.draft.definition,
        state.selectedContractRole,
        device,
      ),
    };
  }),
  setContentLayer: (contentLayer) => set({ contentLayer }),
  setPreviewMode: (previewMode) => set({ previewMode }),
  setPreviewScenario: (previewScenario) => set({ previewScenario }),
  setCanvasZoom: (canvasZoom) => set({ canvasZoom }),
  setSaveStatus: (saveStatus) => set({ saveStatus }),
  undo: () =>
    set((state) => {
      if (!state.draft || state.historyPast.length === 0) return state;
      const previous = rebaseDraftPersistence(
        state.historyPast[state.historyPast.length - 1],
        state.draft,
      );
      const selection = repairTemplateEditorSelection(
        previous.definition,
        state.selectedObjectId,
        state.selectedContractRole,
        state.device,
      );
      return {
        draft: cloneDraft(previous),
        ...selection,
        historyPast: state.historyPast.slice(0, -1),
        historyFuture: [cloneDraft(state.draft), ...state.historyFuture].slice(0, HISTORY_LIMIT),
        dirty: !sameDraft(previous, state.baseline),
        saveStatus: statusAfterDraftChange(state.saveStatus),
      };
    }),
  redo: () =>
    set((state) => {
      if (!state.draft || state.historyFuture.length === 0) return state;
      const next = rebaseDraftPersistence(state.historyFuture[0], state.draft);
      const selection = repairTemplateEditorSelection(
        next.definition,
        state.selectedObjectId,
        state.selectedContractRole,
        state.device,
      );
      return {
        draft: cloneDraft(next),
        ...selection,
        historyPast: [...state.historyPast, cloneDraft(state.draft)].slice(-HISTORY_LIMIT),
        historyFuture: state.historyFuture.slice(1),
        dirty: !sameDraft(next, state.baseline),
        saveStatus: statusAfterDraftChange(state.saveStatus),
      };
    }),
  markSaved: (draft) =>
    set((state) => {
      const nextDraft = cloneDraft(draft);
      return {
        draft: nextDraft,
        baseline: cloneDraft(draft),
        ...repairTemplateEditorSelection(
          nextDraft.definition,
          state.selectedObjectId,
          state.selectedContractRole,
          state.device,
        ),
        dirty: false,
        saveStatus: "success",
      };
    }),
  reconcileSaveResult: ({ sessionId, requestedDraft, savedDraft, asCopy = false }) => {
    let result: TemplateSaveReconcileResult = "stale-session";
    set((state) => {
      if (
        state.sessionId !== sessionId
        || !state.draft
        || state.draft.definition.templateId !== requestedDraft.definition.templateId
      ) return state;

      const completedRecoveryOverwrite = Boolean(
        !asCopy && requestedDraft.compatibilityRecovery,
      );
      const createsNewIdentity = asCopy
        || savedDraft.definition.templateId !== requestedDraft.definition.templateId;

      if (sameDraft(state.draft, requestedDraft)) {
        result = "saved";
        const nextDraft = cloneDraft(savedDraft);
        return {
          draft: nextDraft,
          baseline: cloneDraft(savedDraft),
          ...repairTemplateEditorSelection(
            nextDraft.definition,
            state.selectedObjectId,
            state.selectedContractRole,
            state.device,
          ),
          dirty: false,
          saveStatus: "success",
          // 新身份只继承已保存内容；来源身份的历史不能与副本持久化信息混用。
          ...(createsNewIdentity || completedRecoveryOverwrite
            ? { historyPast: [], historyFuture: [] }
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
          state.selectedObjectId,
          state.selectedContractRole,
          state.device,
        ),
        dirty: !sameDraft(rebasedDraft, savedDraft),
        saveStatus: "idle",
        ...(completedRecoveryOverwrite
          ? { historyPast: [], historyFuture: [] }
          : {}),
      };
    });
    return result;
  },
}));

export function hasUnpersistedTemplateDraft(state = useTemplateEditorSession.getState()) {
  return Boolean(state.draft && state.dirty);
}
