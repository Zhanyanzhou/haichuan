import { create } from "zustand";
import type {
  TemplateEditorDraft,
  TemplateEditorContentLayer,
  TemplateEditorDevice,
  DynamicTemplatePreviewScenario,
  TemplateSaveStatus,
} from "./types";
import type { TemplateDefinitionV2 } from "../template-definition";

const HISTORY_LIMIT = 50;

function cloneDraft(draft: TemplateEditorDraft): TemplateEditorDraft {
  return structuredClone(draft);
}

function sameDraft(left: TemplateEditorDraft | null, right: TemplateEditorDraft | null) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function createSessionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

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
    set({
      ...EMPTY_STATE,
      sessionId: createSessionId(),
      draft: cloneDraft(draft),
      baseline: options?.isNew ? null : cloneDraft(draft),
      dirty: options?.isNew === true,
    }),
  close: () => set({ ...EMPTY_STATE }),
  commitDraft: (draft, historyBaseline) =>
    set((state) => {
      if (!state.draft) return state;
      const previous = historyBaseline ?? state.draft;
      if (sameDraft(previous, draft) && sameDraft(state.draft, draft)) return state;
      const nextDraft = cloneDraft(draft);
      return {
        draft: nextDraft,
        historyPast: sameDraft(previous, nextDraft)
          ? state.historyPast
          : [...state.historyPast, cloneDraft(previous)].slice(-HISTORY_LIMIT),
        historyFuture: [],
        dirty: !sameDraft(nextDraft, state.baseline),
        saveStatus: "idle",
      };
    }),
  previewDraft: (draft) =>
    set((state) => state.draft ? {
      draft: cloneDraft(draft),
      dirty: !sameDraft(draft, state.baseline),
      saveStatus: "idle",
    } : state),
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
  setDevice: (device) => set({ device }),
  setContentLayer: (contentLayer) => set({ contentLayer }),
  setPreviewMode: (previewMode) => set({ previewMode }),
  setPreviewScenario: (previewScenario) => set({ previewScenario }),
  setSaveStatus: (saveStatus) => set({ saveStatus }),
  undo: () =>
    set((state) => {
      if (!state.draft || state.historyPast.length === 0) return state;
      const previous = state.historyPast[state.historyPast.length - 1];
      return {
        draft: cloneDraft(previous),
        historyPast: state.historyPast.slice(0, -1),
        historyFuture: [cloneDraft(state.draft), ...state.historyFuture].slice(0, HISTORY_LIMIT),
        dirty: !sameDraft(previous, state.baseline),
        saveStatus: "idle",
      };
    }),
  redo: () =>
    set((state) => {
      if (!state.draft || state.historyFuture.length === 0) return state;
      const next = state.historyFuture[0];
      return {
        draft: cloneDraft(next),
        historyPast: [...state.historyPast, cloneDraft(state.draft)].slice(-HISTORY_LIMIT),
        historyFuture: state.historyFuture.slice(1),
        dirty: !sameDraft(next, state.baseline),
        saveStatus: "idle",
      };
    }),
  markSaved: (draft) =>
    set({
      draft: cloneDraft(draft),
      baseline: cloneDraft(draft),
      dirty: false,
      saveStatus: "success",
    }),
}));

export function hasUnpersistedTemplateDraft(state = useTemplateEditorSession.getState()) {
  return Boolean(state.draft && state.dirty);
}
