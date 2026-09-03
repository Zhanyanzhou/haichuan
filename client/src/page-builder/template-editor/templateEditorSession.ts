import { create } from "zustand";
import type {
  TemplateEditorDraft,
  TemplateEditorContentLayer,
  TemplateEditorDevice,
  DynamicTemplatePreviewScenario,
  TemplateSaveStatus,
} from "./types";
import {
  getDynamicTemplateStructureLockViolation,
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
  return rebased;
}

function sameDraft(left: TemplateEditorDraft | null, right: TemplateEditorDraft | null) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function statusAfterDraftChange(current: TemplateSaveStatus): TemplateSaveStatus {
  return current === "conflict" ? "conflict" : "idle";
}

function createSessionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function resolveContractRoleForDevice(
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

export type TemplateSaveReconcileResult = "saved" | "newer-changes" | "stale-session";

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
  saveStatus: TemplateSaveStatus;
  open: (draft: TemplateEditorDraft, options?: { isNew?: boolean }) => void;
  close: () => void;
  commitDraft: (draft: TemplateEditorDraft, historyBaseline?: TemplateEditorDraft) => void;
  previewDraft: (draft: TemplateEditorDraft) => void;
  setName: (name: string) => void;
  setDynamicDefinition: (definition: TemplateDefinitionV2) => void;
  setDynamicVersionNote: (versionNote: string) => void;
  selectObject: (objectId: string | null) => void;
  selectContractRole: (nodeId: string, roleId: string) => void;
  setDevice: (device: TemplateEditorDevice) => void;
  setContentLayer: (contentLayer: TemplateEditorContentLayer) => void;
  setPreviewMode: (previewMode: boolean) => void;
  setPreviewScenario: (previewScenario: DynamicTemplatePreviewScenario) => void;
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
  saveStatus: "idle" as const,
};

export const useTemplateEditorSession = create<TemplateEditorSessionState>((set) => ({
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
  setDynamicDefinition: (definition) => {
    const state = useTemplateEditorSession.getState();
    if (!state.draft) return;
    if (getDynamicTemplateStructureLockViolation(state.draft.definition, definition)) return;
    state.commitDraft({ ...state.draft, definition: structuredClone(definition) });
  },
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
        };
      }

      result = "newer-changes";
      if (asCopy || savedDraft.definition.templateId !== requestedDraft.definition.templateId) {
        return { saveStatus: "idle" };
      }
      const rebasedDraft = rebaseDraftPersistence(state.draft, savedDraft);
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
      };
    });
    return result;
  },
}));

export function hasUnpersistedTemplateDraft(state = useTemplateEditorSession.getState()) {
  return Boolean(state.draft && state.dirty);
}
