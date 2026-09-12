import { App as AntdApp, Button, type ModalFuncProps } from "antd";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  dynamicTemplateApi,
  type DynamicTemplateArchiveRequest,
  type PublishedDynamicTemplateResource,
  type DynamicTemplatePublishResultResource,
  type DynamicTemplateResource,
  type DynamicTemplateVersionPageResource,
  type DynamicTemplateVersionResource,
  type PublishedDynamicTemplateVersionResource,
  type TemplateCatalogResource,
} from "@/services/clients/dynamicTemplateClient";
import { unwrapResponse } from "@/utils/unwrap";
import { getEditorErrorMessage, getEditorHttpStatus } from "@/page-builder/workspace/editorLifecycleErrors";
import {
  createDynamicTemplateStableId,
  normalizeTemplateDimensionContract,
  validateDynamicTemplateDefinition,
  validateDynamicTemplatePublishDefinition,
  type TemplateDefinitionV2,
} from "../template-definition";
import {
  promoteInstanceOverridesToTemplateDraft,
  type PromoteDynamicTemplateInstanceRequest,
} from "../dynamic-template-instance/promoteToTemplate";
import { useVisualEditorSession } from "../visual-editor/visualEditorSession";
import { focusFirstInvalidNumberField } from "../inspector/controls/NumberField";
import {
  DYNAMIC_TEMPLATE_LOCAL_DRAFT_CHANGED_EVENT,
  loadLocalDynamicTemplateDraft,
  saveLocalDynamicTemplateDraft,
} from "./dynamicTemplateDraftRepository";
import {
  prepareDynamicTemplateDefinitionForNewIdentity,
  prepareHistoricalTemplateDefinitionForCurrentDraft,
} from "./dynamicTemplateEditorUtils";
import { copyTemplateDefinition } from "./templateCopy";
import type {
  ArchivableTemplateEditorLibraryTarget,
  PublishedDraftCreationState,
  TemplateEditorLibraryTarget,
} from "./TemplateEditorLibrary";
import { notifyDynamicTemplateCatalogChanged } from "./templateCatalogEvents";
import {
  useTemplateEditorSession,
  type TemplateWorkspaceScrollState,
} from "./templateEditorSession";
import {
  projectTemplateEditorSelectionSnapshot,
  type TemplateEditorSelectionSnapshot,
} from "./templateEditorSelection";
import {
  reconcileTemplatePublishIssueIndex,
  type TemplateInspectorIssueTarget,
} from "./templateInspectorCapabilities";
import type { TemplateEditorDraft } from "./types";
import {
  asDefinitionChecksum,
  beginReviewedSnapshotPublish,
  beginReviewedSnapshotSave,
  catalogRefreshFailed,
  catalogRefreshSucceeded,
  deriveTemplateProductionReadiness,
  markPublishReviewChanged,
  markPublishReviewStale,
  matchesReviewedVersionNote,
  openPublishReview as createPublishReview,
  publishedVersionVerificationMatched,
  publishedVersionVerificationMismatched,
  publishedVersionVerificationNotFound,
  publishReviewedSnapshotFailed,
  publishReviewedSnapshotSucceeded,
  retryCatalogRefresh,
  retryVerification,
  saveReviewedSnapshotFailed,
  saveVerificationMatched,
  saveVerificationMismatched,
  saveVerificationNotFound,
  verificationFailed,
  type EditingPublishState,
  type LivePublishContext,
  type OperationIdentity,
  type PublishFailure,
  type PublishWorkflowEffect,
  type PublishWorkflowState,
  type PublishWorkflowTransition,
  type SavingReviewedSnapshotState,
} from "./templatePublishWorkflow";

export interface PersistTemplateOptions {
  overwriteCurrent?: boolean;
}

type TemplateLifecycleTarget = Pick<DynamicTemplateResource, "templateId" | "name">;
type TemplateArchiveRequest = ArchivableTemplateEditorLibraryTarget | TemplateLifecycleTarget;

interface ResolvedTemplateArchiveTarget extends TemplateLifecycleTarget {
  sourceReference: string | null;
  request?: DynamicTemplateArchiveRequest;
}

function draftMatchesPersistedIdentity(
  draft: TemplateEditorDraft,
  templateId: string,
) {
  return draft.definition.templateId === templateId;
}

function targetMatchesDraft(target: TemplateEditorLibraryTarget, draft: TemplateEditorDraft) {
  if (target.kind === "dynamic-persisted") {
    return draftMatchesPersistedIdentity(
      draft,
      target.template.templateId,
    );
  }
  if (target.kind === "dynamic-local") return draft.localDraftId === target.localDraftId;
  return false;
}

function resolveTemplateArchiveTarget(
  target: TemplateArchiveRequest,
): ResolvedTemplateArchiveTarget | null {
  if ("templateId" in target) {
    return {
      templateId: target.templateId,
      name: target.name,
      sourceReference: null,
    };
  }
  if (target.kind === "dynamic-persisted") {
    const draft = target.template.draft;
    return {
      templateId: target.template.templateId,
      name: target.template.name,
      sourceReference: target.template.sourceReference,
      ...(draft && Number.isInteger(draft.revision) && draft.revision > 0
        && isDefinitionChecksum(draft.definitionChecksum)
        ? {
            request: {
              expectedRevision: draft.revision,
              expectedChecksum: draft.definitionChecksum,
            },
          }
        : {}),
    };
  }
  return null;
}

function clearTemplateSessionGeometry(sessionId: string | null) {
  if (!sessionId) return;
  useVisualEditorSession.getState()
    .clearCanvasGeometryNamespace(`template-editor:${sessionId}`);
}

/** 仅属于当前编辑会话，不进入模板草稿、历史或发布请求。 */
export interface TemplatePublishReview {
  sessionId: string;
  templateId: string;
  workflow: Exclude<PublishWorkflowState<TemplateDefinitionV2>, EditingPublishState>;
  issues: ReturnType<typeof validateDynamicTemplatePublishDefinition>["issues"];
  currentIndex: number;
  requestId: number;
  selectionSnapshot: TemplateEditorSelectionSnapshot;
}

export type PublishedDraftAvailability =
  | { status: "checking"; templateId: string }
  | { status: "available"; templateId: string }
  | { status: "unavailable"; templateId: string; failure?: PublishFailure };

export interface TemplateWorkspaceController {
  active: boolean;
  canManageTemplates: boolean;
  localOnly: boolean;
  publishing: boolean;
  publishWorkflow: PublishWorkflowState<TemplateDefinitionV2>;
  publishReview: TemplatePublishReview | null;
  publishIssueEditing: boolean;
  publishedDraftAvailability: PublishedDraftAvailability | null;
  publishedDraftCreation: PublishedDraftCreationState | null;
  openPublishReview: () => void;
  selectPublishIssue: (index: number) => void;
  editPublishIssue: (target: TemplateInspectorIssueTarget) => boolean;
  lifecycleBusy: boolean;
  draft: TemplateEditorDraft | null;
  selectedObjectLabel: string | null;
  dirty: boolean;
  hasBaseline: boolean;
  device: ReturnType<typeof useTemplateEditorSession.getState>["device"];
  previewMode: boolean;
  previewScenario: ReturnType<typeof useTemplateEditorSession.getState>["previewScenario"];
  saveStatus: ReturnType<typeof useTemplateEditorSession.getState>["saveStatus"];
  setPreviewMode: (previewMode: boolean) => void;
  sessionId: string | null;
  readWorkspaceScroll: () => TemplateWorkspaceScrollState;
  updateWorkspaceScroll: (
    sessionId: string,
    updates: Partial<TemplateWorkspaceScrollState>,
  ) => void;
  enter: (pageViewport: { width: number; height: number }) => void;
  returnToPage: () => void;
  closeSession: () => void;
  openTarget: (
    target: TemplateEditorLibraryTarget,
    onOpened?: (draft: TemplateEditorDraft) => void,
  ) => void;
  copyTarget: (
    target: TemplateEditorLibraryTarget,
    source: "copy" | "copy-published",
  ) => Promise<boolean>;
  persist: (options?: PersistTemplateOptions) => Promise<boolean>;
  persistForExit: () => Promise<boolean>;
  publish: () => Promise<boolean>;
  confirmPublish: () => void;
  cancelPublishReview: () => void;
  recheckPublishReview: () => void;
  retryPublishVerification: () => void;
  retryFailedPublish: () => void;
  retryCatalogRefresh: () => void;
  reloadPublishedDraft: () => void;
  createDraftFromPublished: (
    template: DynamicTemplateResource,
    published: PublishedDynamicTemplateResource,
  ) => Promise<boolean>;
  usePublishedTemplateInPage: () => void;
  promoteFromPage: (
    request: PromoteDynamicTemplateInstanceRequest,
    pageViewport: { width: number; height: number },
  ) => Promise<void>;
  archive: (target: TemplateArchiveRequest) => Promise<boolean>;
  restore: (template: TemplateLifecycleTarget) => Promise<boolean>;
  deleteDraft: (template: TemplateLifecycleTarget) => Promise<boolean>;
  listVersions: (options?: { beforeVersion?: number; limit?: number }) => Promise<DynamicTemplateVersionPageResource>;
  getVersion: (version: number) => Promise<DynamicTemplateVersionResource>;
  stageVersion: (version: DynamicTemplateVersionResource) => boolean;
  cancelCompatibilityRecovery: () => void;
  resumeCompatibilityRecovery: () => void;
  discardChanges: () => void;
}

function currentPublishedChecksum(
  template: DynamicTemplateResource,
  published?: Pick<PublishedDynamicTemplateResource, "version" | "definitionChecksum"> | null,
) {
  return published?.version === template.publishedVersion
    ? published.definitionChecksum
    : null;
}

function createPersistedDraft(
  template: DynamicTemplateResource,
  publishedDefinitionChecksum: string | null = null,
  recoveryFallbackDefinition?: TemplateEditorDraft["definition"],
): TemplateEditorDraft | null {
  if (!template.draft) return null;
  const sourceDefinition = recoveryFallbackDefinition ?? template.draft.definition;
  const validation = validateDynamicTemplateDefinition(sourceDefinition);
  if (!validation.valid || !validation.definition) return null;
  const definition = normalizeTemplateDimensionContract(validation.definition);
  const requiresContractNormalization = JSON.stringify(definition)
    !== JSON.stringify(sourceDefinition);
  return {
    format: "dynamic",
    sourceType: "persisted",
    localDraftId: template.templateId,
    versionNote: template.draft.versionNote ?? "",
    ...(template.sourceReference ? { sourceReference: template.sourceReference } : {}),
    ...(requiresContractNormalization && !recoveryFallbackDefinition
      ? { requiresContractNormalization: true }
      : {}),
    definition,
    remote: {
      databaseId: template.id,
      revision: template.draft.revision,
      publishedVersion: template.publishedVersion,
      baseVersion: template.draft.baseVersion,
      draftDefinitionChecksum: template.draft.definitionChecksum,
      publishedDefinitionChecksum,
      sourceType: template.sourceType,
      status: template.status,
      canDelete: template.canDelete === true,
      deleteBlockers: template.deleteBlockers ?? [],
    },
  };
}

interface PublishOperationMeta {
  requestedDraft: TemplateEditorDraft;
  savedDraft?: TemplateEditorDraft;
  savedResource?: DynamicTemplateResource;
}

function sameTemplateDefinition(left: TemplateDefinitionV2, right: TemplateDefinitionV2) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function saveDraftWithVerification(
  requestedDraft: TemplateEditorDraft,
  definition: TemplateDefinitionV2,
  request: () => Promise<unknown>,
): Promise<DynamicTemplateResource> {
  try {
    return unwrapResponse<DynamicTemplateResource>(await request());
  } catch (error) {
    const failure = classifyPublishFailure(error);
    if (!["network", "timeout", "server", "conflict"].includes(failure.category)) throw error;
    const verificationFailure = (result: "missing" | "mismatch" | "unavailable") => Object.assign(
      error instanceof Error ? error : new Error("模板保存失败"),
      { status: getEditorHttpStatus(error), templateSaveVerification: result },
    );
    // 写入可能已经完成；只读核验本次快照，不自动重发或采用其他会话的修改。
    let resource: DynamicTemplateResource | null;
    try {
      resource = unwrapResponse<DynamicTemplateResource | null>(
        await dynamicTemplateApi.getDraft(definition.templateId),
      );
    } catch (verificationError) {
      throw verificationFailure(getEditorHttpStatus(verificationError) === 404 ? "missing" : "unavailable");
    }
    const baseline = requestedDraft.sourceType === "persisted" ? requestedDraft.remote : undefined;
    const draft = resource?.draft;
    if (
      !resource || !draft
      || !Number.isInteger(resource.id) || resource.id <= 0
      || !Number.isInteger(draft.id) || draft.id <= 0
      || resource.templateId !== definition.templateId
      || resource.status !== "ACTIVE"
      || draft.revision !== (baseline ? baseline.revision + 1 : 1)
      || (baseline && (resource.id !== baseline.databaseId
        || resource.publishedVersion !== baseline.publishedVersion
        || draft.baseVersion !== baseline.baseVersion))
      || (!baseline && (resource.publishedVersion !== 0 || draft.baseVersion !== null))
      || !isDefinitionChecksum(draft.definitionChecksum)
      || draft.definition?.templateId !== definition.templateId
      || !sameTemplateDefinition(draft.definition, definition)
      || !matchesReviewedVersionNote(draft.versionNote, requestedDraft.versionNote)
    ) throw verificationFailure("mismatch");
    return resource;
  }
}

function createTrustedDraftFromPublished(
  resource: DynamicTemplateResource,
  published: PublishedDynamicTemplateResource,
) {
  const validation = validateDynamicTemplateDefinition(published.definition);
  if (
    !Number.isInteger(published.version)
    || published.version <= 0
    || !isDefinitionChecksum(published.definitionChecksum)
    || !validation.valid
    || !validation.definition
    || validation.definition.templateId !== published.templateId
    || !Number.isInteger(resource.id)
    || resource.id <= 0
    || resource.templateId !== published.templateId
    || resource.status !== "ACTIVE"
    || resource.publishedVersion !== published.version
    || !resource.draft
    || !Number.isInteger(resource.draft.id)
    || resource.draft.id <= 0
    || resource.draft.baseVersion !== published.version
    || resource.draft.revision !== 1
    || resource.draft.definitionChecksum !== published.definitionChecksum
    || resource.draft.definition.templateId !== published.templateId
    || !sameTemplateDefinition(resource.draft.definition, published.definition)
  ) return null;
  return createPersistedDraft(resource, published.definitionChecksum);
}

function isDefinitionChecksum(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function notifyEditableTemplateCatalogChanged(resource: DynamicTemplateResource) {
  if (!resource.draft) return;
  notifyDynamicTemplateCatalogChanged({
    kind: "editable-upsert",
    identity: {
      templateId: resource.templateId,
      revision: resource.draft.revision,
      definitionChecksum: resource.draft.definitionChecksum,
    },
    template: resource,
  });
}

function matchesPublishedDraftResource(
  resource: DynamicTemplateResource,
  operation: OperationIdentity,
  savedResource: DynamicTemplateResource,
  reviewedDefinition: TemplateDefinitionV2,
  publishedChecksum: string,
) {
  const draft = resource.draft;
  const savedRevision = savedResource.draft?.revision;
  if (!draft || !Number.isInteger(savedRevision) || !Number.isInteger(draft.revision)) return false;
  return resource.id === savedResource.id
    && resource.templateId === operation.templateId
    && resource.publishedVersion === operation.targetVersion
    && draft.revision === (savedRevision as number) + 1
    && draft.baseVersion === operation.targetVersion
    && draft.definitionChecksum === publishedChecksum
    && draft.definition.templateId === operation.templateId
    && sameTemplateDefinition(draft.definition, reviewedDefinition)
    && matchesReviewedVersionNote(draft.versionNote, "");
}

function classifyPublishFailure(error: unknown): PublishFailure {
  const workflowFailure = (error as { workflowFailure?: unknown })?.workflowFailure;
  if (workflowFailure && typeof workflowFailure === "object" && "category" in workflowFailure) {
    return workflowFailure as PublishFailure;
  }
  const status = getEditorHttpStatus(error);
  const code = typeof (error as { code?: unknown })?.code === "string"
    ? (error as { code: string }).code
    : undefined;
  if (status === 403) return { category: "permission", status, ...(code ? { code } : {}) };
  if (status === 409) return { category: "conflict", status, ...(code ? { code } : {}) };
  if (status && status >= 500) return { category: "server", status, ...(code ? { code } : {}) };
  if (code === "ECONNABORTED" || code === "ETIMEDOUT") return { category: "timeout", ...(code ? { code } : {}) };
  if (!status) return { category: "network", ...(code ? { code } : {}) };
  return { category: "rejected", status, ...(code ? { code } : {}) };
}

function throwMalformedPublishResponse(code: string): never {
  throw Object.assign(new Error(code), {
    workflowFailure: { category: "malformed-response", code } satisfies PublishFailure,
  });
}

function currentLivePublishContext(): LivePublishContext {
  const state = useTemplateEditorSession.getState();
  return {
    sessionId: state.sessionId ?? "",
    templateId: state.draft?.definition.templateId ?? "",
    semanticGeneration: state.semanticGeneration,
    targetVersion: (state.draft?.remote?.publishedVersion ?? 0) + 1,
  };
}

function isCurrentPublishOperation(
  state: PublishWorkflowState<TemplateDefinitionV2>,
  expected: OperationIdentity,
) {
  if (!("operation" in state)) return false;
  const operation = state.operation;
  const snapshot = state.snapshot;
  const live = currentLivePublishContext();
  return operation.operationId === expected.operationId
    && operation.sessionId === expected.sessionId
    && operation.templateId === expected.templateId
    && operation.semanticGeneration === expected.semanticGeneration
    && operation.targetVersion === expected.targetVersion
    && operation.baselineRevision === expected.baselineRevision
    && operation.baselineChecksum === expected.baselineChecksum
    && operation.versionNote === expected.versionNote
    && snapshot.sessionId === expected.sessionId
    && snapshot.templateId === expected.templateId
    && snapshot.semanticGeneration === expected.semanticGeneration
    && snapshot.targetVersion === expected.targetVersion
    && live.sessionId === expected.sessionId
    && live.templateId === expected.templateId;
}

function resetDefinitionPublishWorkflow(
  context: LivePublishContext,
): PublishWorkflowTransition<TemplateDefinitionV2> {
  return {
    state: { status: "editing", context },
    effects: [],
  };
}

export function useTemplateWorkspaceController({
  active,
  canManageTemplates,
  localOnly,
  isViewingPublished,
  onEnterWorkspace,
  onReturnPage,
}: {
  active: boolean;
  canManageTemplates: boolean;
  localOnly: boolean;
  isViewingPublished: () => boolean;
  onEnterWorkspace: (pageViewport: { width: number; height: number }) => void;
  onReturnPage: () => void;
}): TemplateWorkspaceController {
  const { message, modal } = AntdApp.useApp();
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const saveInFlightRef = useRef<Promise<boolean> | null>(null);
  const lifecycleInFlightRef = useRef(false);
  const publishedDraftCreationRequestRef = useRef(0);
  const transitionInFlightRef = useRef(false);
  const openRequestRef = useRef(0);
  const copyRequestRef = useRef(0);
  const activeRef = useRef(active);
  const canManageTemplatesRef = useRef(canManageTemplates);
  activeRef.current = active;
  canManageTemplatesRef.current = canManageTemplates;
  const draft = useTemplateEditorSession((state) => state.draft);
  const sessionId = useTemplateEditorSession((state) => state.sessionId);
  const semanticGeneration = useTemplateEditorSession((state) => state.semanticGeneration);
  const [publishWorkflow, setPublishWorkflow] = useState<PublishWorkflowState<TemplateDefinitionV2>>(
    () => resetDefinitionPublishWorkflow(currentLivePublishContext()).state,
  );
  const publishWorkflowRef = useRef(publishWorkflow);
  const publishEffectChainRef = useRef<Promise<void>>(Promise.resolve());
  const publishEffectRunnerRef = useRef<((effect: PublishWorkflowEffect<TemplateDefinitionV2>) => Promise<void>) | null>(null);
  const publishOperationMetaRef = useRef<{
    operationId: string;
    meta: PublishOperationMeta;
  } | null>(null);
  const [publishedDraftAvailability, setPublishedDraftAvailability] = useState<PublishedDraftAvailability | null>(null);
  const [publishedDraftCreation, setPublishedDraftCreation] = useState<PublishedDraftCreationState | null>(null);
  const [review, setReview] = useState<Omit<TemplatePublishReview, "workflow"> | null>(null);
  const [publishIssueEditing, setPublishIssueEditing] = useState(false);
  const reviewRequestRef = useRef(0);
  const publishReviewReturnRef = useRef<{
    sessionId: string;
    selectionSnapshot: TemplateEditorSelectionSnapshot;
    device: ReturnType<typeof useTemplateEditorSession.getState>["device"];
    canvasZoom: number | null;
    previewMode: boolean;
    previewScenario: ReturnType<typeof useTemplateEditorSession.getState>["previewScenario"];
    workspaceScroll: TemplateWorkspaceScrollState;
  } | null>(null);
  useEffect(() => () => {
    openRequestRef.current += 1;
    copyRequestRef.current += 1;
    publishedDraftCreationRequestRef.current += 1;
  }, []);
  const applyPublishTransition = useCallback((transition: PublishWorkflowTransition<TemplateDefinitionV2>) => {
    const operationMeta = publishOperationMetaRef.current;
    if (
      operationMeta
      && (!("operation" in transition.state)
        || transition.state.operation.operationId !== operationMeta.operationId)
    ) {
      publishOperationMetaRef.current = null;
    }
    publishWorkflowRef.current = transition.state;
    setPublishWorkflow(transition.state);
    for (const effect of transition.effects) {
      publishEffectChainRef.current = publishEffectChainRef.current
        .then(async () => publishEffectRunnerRef.current?.(effect))
        .catch(() => undefined);
    }
  }, []);
  const publishReview = review?.sessionId === sessionId
    && review.templateId === draft?.definition.templateId
    && publishWorkflow.status !== "editing"
    ? { ...review, workflow: publishWorkflow }
    : null;
  const publishing = ["saving-reviewed-snapshot", "publishing", "verifying-uncertain"].includes(
    publishWorkflow.status,
  );
  const openPublishReview = useCallback(() => {
    setPublishIssueEditing(false);
    const session = useTemplateEditorSession.getState();
    session.setInspectorTask("design");
    session.setInspectorView("context");
    const requestId = ++reviewRequestRef.current;
    setReview((current) => current ? { ...current, requestId } : current);
  }, []);
  const selectPublishIssue = useCallback((currentIndex: number) => {
    setReview((current) => current ? { ...current, currentIndex } : current);
  }, []);
  const editPublishIssue = useCallback((target: TemplateInspectorIssueTarget) => {
    const current = publishWorkflowRef.current;
    if (
      target.destination === "unavailable"
      || (target.destination === "inspector-field" && target.access !== "editable")
      || (current.status !== "review-blocked" && current.status !== "review-ready")
    ) return false;
    const session = useTemplateEditorSession.getState();
    if (
      !session.sessionId
      || !session.draft
      || session.sessionId !== current.snapshot.sessionId
      || session.draft.definition.templateId !== current.snapshot.templateId
    ) return false;

    applyPublishTransition(markPublishReviewStale(current, "issue-edit"));
    setPublishIssueEditing(true);
    return true;
  }, [applyPublishTransition]);
  const selectedObjectId = useTemplateEditorSession((state) => state.selectedObjectId);
  const selectedContractRole = useTemplateEditorSession((state) => state.selectedContractRole);
  const selectedObjectLabel = draft
    ? selectedContractRole?.roleId
      ?? (selectedObjectId ? draft.definition.nodes[selectedObjectId]?.name : null)
      ?? draft.definition.name
    : null;
  const dirty = useTemplateEditorSession((state) => state.dirty);
  const hasBaseline = useTemplateEditorSession((state) => Boolean(state.baseline));
  const device = useTemplateEditorSession((state) => state.device);
  const previewMode = useTemplateEditorSession((state) => state.previewMode);
  const previewScenario = useTemplateEditorSession((state) => state.previewScenario);
  const saveStatus = useTemplateEditorSession((state) => state.saveStatus);
  const setPreviewMode = useTemplateEditorSession((state) => state.setPreviewMode);
  useEffect(() => {
    const current = publishWorkflowRef.current;
    const live = currentLivePublishContext();
    if (
      current.status !== "editing"
      && (
        current.snapshot.sessionId !== live.sessionId
        || current.snapshot.templateId !== live.templateId
      )
    ) {
      publishOperationMetaRef.current = null;
      publishReviewReturnRef.current = null;
      setPublishIssueEditing(false);
      setReview(null);
      setPublishedDraftAvailability(null);
      applyPublishTransition(resetDefinitionPublishWorkflow(live));
      return;
    }
    if (current.status === "editing") applyPublishTransition(resetDefinitionPublishWorkflow(live));
  }, [applyPublishTransition, draft?.definition.templateId, sessionId]);
  useEffect(() => {
    const current = publishWorkflowRef.current;
    if (current.status === "editing" || current.snapshot.semanticGeneration === semanticGeneration) return;
    applyPublishTransition(markPublishReviewChanged(current, { kind: "semantic-generation" }));
  }, [applyPublishTransition, semanticGeneration]);
  const readWorkspaceScroll = useCallback(
    () => useTemplateEditorSession.getState().workspaceScroll,
    [],
  );
  const updateWorkspaceScroll = useCallback((
    expectedSessionId: string,
    updates: Partial<TemplateWorkspaceScrollState>,
  ) => {
    const current = useTemplateEditorSession.getState();
    current.setWorkspaceScroll(expectedSessionId, {
      ...current.workspaceScroll,
      ...updates,
    });
  }, []);

  const activateTemplateSession = useCallback((reset = true) => {
    const visualSession = useVisualEditorSession.getState();
    if (reset) {
      const sessionId = useTemplateEditorSession.getState().sessionId;
      clearTemplateSessionGeometry(sessionId);
      visualSession.resetWorkspaceContext("template");
    }
    visualSession.activateWorkspace("template");
  }, []);

  const openPersistedDraft = useCallback((
    template: DynamicTemplateResource,
    published?: PublishedDynamicTemplateResource,
    recoveryFallbackDefinition?: TemplateEditorDraft["definition"],
  ) => {
    if (template.status === "ARCHIVED") {
      message.warning("回收站中的模板需先恢复后才能继续编辑");
      return false;
    }
    const publishedChecksum = currentPublishedChecksum(template, published);
    const persistedDraft = createPersistedDraft(template, publishedChecksum)
      ?? (recoveryFallbackDefinition
        ? createPersistedDraft(template, publishedChecksum, recoveryFallbackDefinition)
        : null);
    if (!persistedDraft) {
      message.error("服务端模板缺少可编辑草稿");
      return false;
    }
    activateTemplateSession();
    const session = useTemplateEditorSession.getState();
    session.open(persistedDraft);
    session.selectObject(persistedDraft.definition.rootNodeId);
    return true;
  }, [activateTemplateSession, message]);

  const enter = useCallback((pageViewport: { width: number; height: number }) => {
    if (!canManageTemplates) {
      message.warning("只有超级管理员可以设计模板");
      return;
    }
    if (isViewingPublished()) {
      message.warning("请先返回页面草稿，再进入模板编辑");
      return;
    }
    onEnterWorkspace(pageViewport);
    const existingSession = useTemplateEditorSession.getState();
    if (existingSession.draft && existingSession.sessionId) {
      activateTemplateSession(false);
      return;
    }
    // 首次进入只切换工作区，不猜测运营要编辑哪个历史模板。
    // 目录与顶部“新建模板”由用户配置方案后建立新会话。
    activateTemplateSession(false);
  }, [activateTemplateSession, canManageTemplates, isViewingPublished, message, onEnterWorkspace]);

  const requireActive = useCallback(() => {
    if (!active) {
      message.info("请先点击顶部“模板设计”进入模板工作区");
      return false;
    }
    if (!canManageTemplates) {
      message.warning("只有超级管理员可以设计模板");
      return false;
    }
    return true;
  }, [active, canManageTemplates, message]);

  const openTargetImmediately = useCallback(async (target: TemplateEditorLibraryTarget) => {
    if (!requireActive()) return null;
    const requestId = ++openRequestRef.current;
    const sourceSession = useTemplateEditorSession.getState();
    const sourceSessionId = sourceSession.sessionId;
    const sourceTemplateId = sourceSession.draft?.definition.templateId ?? null;
    const sourceSemanticGeneration = sourceSession.semanticGeneration;
    const isCurrentRequest = () => {
      const currentSession = useTemplateEditorSession.getState();
      return openRequestRef.current === requestId
        && activeRef.current
        && canManageTemplatesRef.current
        && useVisualEditorSession.getState().workspace === "template"
        && currentSession.sessionId === sourceSessionId
        && (currentSession.draft?.definition.templateId ?? null) === sourceTemplateId
        && currentSession.semanticGeneration === sourceSemanticGeneration;
    };
    if (target.kind === "dynamic-local") {
      const localDraft = loadLocalDynamicTemplateDraft(target.localDraftId);
      if (!localDraft) {
        message.error("该本机模板草稿不存在或未通过当前结构校验");
        return null;
      }
      activateTemplateSession();
      const session = useTemplateEditorSession.getState();
      session.open(localDraft);
      session.selectObject(localDraft.definition.rootNodeId);
      return useTemplateEditorSession.getState().draft;
    }
    if (target.kind === "dynamic-new") {
      const generated = target.definition ? validateDynamicTemplateDefinition(target.definition) : null;
      if (!generated?.valid || !generated.definition) {
        message.error("模板方案未通过结构校验，请返回配置修改。当前草稿未改变。");
        return null;
      }
      const newDraft = {
        format: "dynamic" as const,
        sourceType: "local" as const,
        localDraftId: generated.definition.templateId,
        versionNote: "",
        definition: structuredClone(generated.definition),
        ...(target.copySource ? { copySource: target.copySource, copySourceDefinition: structuredClone(target.copySourceDefinition ?? generated.definition) } : {}),
      };
      activateTemplateSession();
      const session = useTemplateEditorSession.getState();
      session.open(newDraft, { isNew: true });
      if (target.canvasSize || target.definition) useTemplateEditorSession.getState().setDevice("desktop");
      session.selectObject(newDraft.definition.rootNodeId);
      return useTemplateEditorSession.getState().draft;
    }
    const templateId = target.template.templateId;
    try {
      const response = await dynamicTemplateApi.getDraft(templateId);
      if (!isCurrentRequest()) return null;
      const resource = unwrapResponse<DynamicTemplateResource | null>(response);
      if (!resource) {
        message.error("服务端模板草稿不存在，当前编辑会话未改变");
        return null;
      }
      const freshDraft = resource.draft;
      const validation = freshDraft
        ? validateDynamicTemplateDefinition(freshDraft.definition)
        : null;
      if (
        resource.templateId !== templateId
        || !freshDraft
        || !Number.isInteger(freshDraft.revision)
        || freshDraft.revision <= 0
        || !isDefinitionChecksum(freshDraft.definitionChecksum)
        || freshDraft.definition?.templateId !== templateId
        || !validation?.valid
        || !validation.definition
      ) {
        message.error("服务端返回的模板草稿身份或内容无效，当前编辑会话未改变");
        return null;
      }
      if (!openPersistedDraft(resource, target.published)) return null;
      return useTemplateEditorSession.getState().draft;
    } catch (error) {
      if (!isCurrentRequest()) return null;
      message.error(getEditorErrorMessage(error, "读取模板草稿失败，当前编辑会话未改变"));
      return null;
    }
  }, [activateTemplateSession, message, openPersistedDraft, requireActive]);

  const persist = useCallback((options: PersistTemplateOptions = {}): Promise<boolean> => {
    if (saveInFlightRef.current) return saveInFlightRef.current;
    if (focusFirstInvalidNumberField()) return Promise.resolve(false);
    const session = useTemplateEditorSession.getState();
    if (session.activeInteraction) {
      message.warning("请先确认或取消当前画布／属性操作，再保存模板");
      return Promise.resolve(false);
    }
    const currentDraft = session.draft;
    const sessionId = session.sessionId;
    if (!canManageTemplates || !currentDraft || !sessionId) return Promise.resolve(false);
    let requestedDraft = structuredClone(currentDraft);
    session.setSaveStatus("saving");
    const savePromise = (async (): Promise<boolean> => {
      try {
        let savedDraft: TemplateEditorDraft;
        if (localOnly) {
          const localBase: TemplateEditorDraft = requestedDraft.sourceType === "local"
            ? requestedDraft
            : (() => {
                const localDraftId = createDynamicTemplateStableId("tpl");
                return {
                  format: "dynamic" as const,
                  sourceType: "local" as const,
                  localDraftId,
                  versionNote: requestedDraft.versionNote,
                  sourceReference: requestedDraft.definition.templateId,
                  definition: {
                    ...structuredClone(requestedDraft.definition),
                    templateId: localDraftId,
                  },
                };
              })();
          localBase.definition = normalizeTemplateDimensionContract(localBase.definition);
          if (requestedDraft.sourceType !== "local") {
            localBase.definition = prepareDynamicTemplateDefinitionForNewIdentity(
              localBase.definition,
              localBase.localDraftId,
            );
          }
          delete localBase.compatibilityRecovery;
          savedDraft = saveLocalDynamicTemplateDraft(localBase);
          window.dispatchEvent(new Event(DYNAMIC_TEMPLATE_LOCAL_DRAFT_CHANGED_EVENT));
        } else {
          if (requestedDraft.copySource && requestedDraft.sourceType !== "persisted") {
            const original = structuredClone(requestedDraft.copySourceDefinition ?? requestedDraft.definition);
            original.name = requestedDraft.definition.name;
            const resource = await saveDraftWithVerification(requestedDraft, original, () => dynamicTemplateApi.create({ definition: original, copySource: requestedDraft.copySource, versionNote: requestedDraft.versionNote }));
            const initialSaved = resource ? createPersistedDraft(resource, null) : null;
            if (!initialSaved) throw new Error("服务端没有返回有效的副本草稿");
            notifyEditableTemplateCatalogChanged(resource);
            const initialRequest = { ...requestedDraft, definition: original };
            const initialResult = useTemplateEditorSession.getState().reconcileSaveResult({ sessionId, requestedDraft: initialRequest, savedDraft: initialSaved });
            if (initialResult === "stale-session") return true;
            // 首次创建已落地：立即保留真实 revision，后续精修保存失败只重试 update。
            const current = useTemplateEditorSession.getState();
            if (JSON.stringify(requestedDraft.definition) === JSON.stringify(original)) {
              message.success(initialResult === "newer-changes" ? "模板副本已保存；你还有新的未保存修改。" : "模板副本已保存，可继续编辑。");
              return true;
            }
            requestedDraft = { ...initialSaved, definition: requestedDraft.definition, versionNote: requestedDraft.versionNote };
            current.setSaveStatus("saving");
          }
          let definition = requestedDraft.copySource ? structuredClone(requestedDraft.definition) : normalizeTemplateDimensionContract(requestedDraft.definition);
          const updatesPersistedDraft = requestedDraft.sourceType === "persisted"
            && Boolean(requestedDraft.remote);
          if (!updatesPersistedDraft && !requestedDraft.copySource) {
            definition = prepareDynamicTemplateDefinitionForNewIdentity(
              definition,
              definition.templateId,
            );
          }
          const saved = await saveDraftWithVerification(requestedDraft, definition, () => updatesPersistedDraft
            ? dynamicTemplateApi.updateDraft(requestedDraft.definition.templateId, {
                expectedRevision: requestedDraft.remote!.revision,
                definition,
                versionNote: requestedDraft.versionNote,
                ...(requestedDraft.historyRestore ? {
                  restoreFromVersion: requestedDraft.historyRestore.sourceVersion,
                  restoreFromChecksum: requestedDraft.historyRestore.sourceChecksum,
                } : {}),
              })
            : dynamicTemplateApi.create({
                definition,
                versionNote: requestedDraft.versionNote,
                ...(requestedDraft.copySource ? { copySource: requestedDraft.copySource } : {}),
              }));
          const persistedDraft = saved ? createPersistedDraft(
            saved,
            saved.publishedVersion > 0
              ? requestedDraft.remote?.publishedDefinitionChecksum ?? null
              : null,
          ) : null;
          if (!persistedDraft) throw new Error("服务端没有返回可编辑模板草稿");
          savedDraft = persistedDraft;
          notifyEditableTemplateCatalogChanged(saved);
        }

        const reconciliation = useTemplateEditorSession.getState().reconcileSaveResult({
          sessionId,
          requestedDraft,
          savedDraft,
        });
        if (reconciliation === "stale-session") return true;
        if (reconciliation === "newer-changes") {
          message.success(localOnly
            ? "本机测试草稿已保存；你还有新的未保存修改"
            : "模板草稿已保存；你还有新的未保存修改");
        } else {
          message.success(localOnly
            ? "已保存为本机测试草稿；未写入服务端模板"
            : "模板草稿已保存，可继续设计或发布");
        }
        return true;
      } catch (error) {
        const current = useTemplateEditorSession.getState();
        const status = getEditorHttpStatus(error);
        const conflicted = status === 409;
        const serverMessage = error instanceof Error ? error.message : "";
        const verification = (error as { templateSaveVerification?: string })?.templateSaveVerification;
        const nameConflict = conflicted && (
          serverMessage === "当前账号已存在同名模板"
          || (serverMessage === "当前账号已存在同名模板，或模板 ID 已被使用" && verification === "missing")
        );
        const conflictMessage = nameConflict
          ? serverMessage
          : verification === "mismatch"
            ? "服务端模板身份或版本与本次保存不一致"
            : "模板保存发生冲突，暂时无法确认服务端保存结果";
        const permissionDenied = status === 403;
        if (
          current.sessionId === sessionId
          && current.draft?.definition.templateId === requestedDraft.definition.templateId
        ) {
          current.setSaveStatus(
            conflicted && !nameConflict ? "conflict" : permissionDenied ? "permission-error" : "error",
          );
          if (nameConflict) {
            message.warning(`${conflictMessage}；当前修改仍完整保留，请打开模板设置，修改模板名称后重新保存。`);
          } else if (conflicted) {
            message.warning(`${conflictMessage}；当前工作仍完整保留，请重新打开目录中的同一模板处理冲突。`);
          } else if (permissionDenied) {
            message.error("服务端拒绝保存模板：当前账号没有模板管理权限；修改仍完整保留。");
          } else {
            message.error(getEditorErrorMessage(error, "模板保存失败，当前修改仍完整保留"));
          }
        }
        return false;
      }
    })();
    saveInFlightRef.current = savePromise;
    void savePromise.finally(() => {
      if (saveInFlightRef.current === savePromise) saveInFlightRef.current = null;
    });
    return savePromise;
  }, [canManageTemplates, localOnly, message]);

  const persistForExit = useCallback(async () => {
    const source = useTemplateEditorSession.getState();
    const sourceSessionId = source.sessionId;
    const sourceTemplateId = source.draft?.definition.templateId;
    if (!sourceSessionId || !sourceTemplateId) return false;
    if (!await persist()) return false;
    const current = useTemplateEditorSession.getState();
    return current.sessionId === sourceSessionId
      && current.draft?.definition.templateId === sourceTemplateId
      && !current.dirty;
  }, [persist]);

  const closeTemplateSession = useCallback(() => {
    const sessionId = useTemplateEditorSession.getState().sessionId;
    clearTemplateSessionGeometry(sessionId);
    useTemplateEditorSession.getState().close();
    useVisualEditorSession.getState().resetWorkspaceContext("template");
    setReview(null);
  }, []);

  const requestDirtySessionAction = useCallback(({
    title,
    discardText,
    saveText,
    content,
    allowSave,
    onDiscard,
    onSaved,
  }: {
    title: string;
    discardText: string;
    saveText: string;
    content: ReactNode;
    allowSave: boolean;
    onDiscard: () => void;
    onSaved: () => void;
  }) => {
    if (transitionInFlightRef.current) return;
    transitionInFlightRef.current = true;
    const sourceSessionId = useTemplateEditorSession.getState().sessionId;
    let saveActionInFlight = false;
    let dialog: { destroy: () => void; update: (config: ModalFuncProps) => void } | null = null;
    const finish = (action: "discard" | "cancel") => {
      if (saveActionInFlight) return;
      dialog?.destroy();
      transitionInFlightRef.current = false;
      if (action === "discard") onDiscard();
    };
    const renderFooter = (saving: boolean): ModalFuncProps["footer"] => (
      (_, { OkBtn, CancelBtn }) => (
        <div className="template-editor__transition-footer">
          <Button danger disabled={saving} onClick={() => finish("discard")}>
            {discardText}
          </Button>
          <div className="template-editor__transition-footer-actions">
            <CancelBtn />
            {allowSave ? <OkBtn /> : null}
          </div>
        </div>
      )
    );
    const setSaveActionInFlight = (saving: boolean) => {
      saveActionInFlight = saving;
      dialog?.update({
        cancelButtonProps: { disabled: saving },
        keyboard: !saving,
        maskClosable: !saving,
        footer: renderFooter(saving),
      });
    };
    dialog = modal.confirm({
      className: "template-editor__transition-modal",
      width: 520,
      style: { maxWidth: "calc(100vw - 32px)" },
      title,
      content,
      okText: saveText,
      cancelText: "继续编辑",
      autoFocusButton: "cancel",
      footer: renderFooter(false),
      onOk: async (close) => {
        if (saveActionInFlight) return;
        setSaveActionInFlight(true);
        let shouldOpenSavedTarget = false;
        try {
          const saved = await persist({ overwriteCurrent: true });
          if (!saved) return;
          const current = useTemplateEditorSession.getState();
          if (current.sessionId !== sourceSessionId || current.dirty) {
            message.warning("保存请求期间又有新的修改，已留在当前模板继续编辑");
            return;
          }
          shouldOpenSavedTarget = true;
        } finally {
          setSaveActionInFlight(false);
          transitionInFlightRef.current = false;
        }
        if (shouldOpenSavedTarget) {
          onSaved();
          close();
        }
      },
      onCancel: () => finish("cancel"),
      afterClose: () => {
        if (!saveActionInFlight) transitionInFlightRef.current = false;
      },
    });
  }, [message, modal, persist]);

  const openTarget = useCallback((
    target: TemplateEditorLibraryTarget,
    onOpened?: (draft: TemplateEditorDraft) => void,
  ) => {
    const current = useTemplateEditorSession.getState();
    if (current.saveStatus === "saving" || publishing || lifecycleBusy) {
      message.info(
        publishing
          ? "正在发布模板，请等待完成后再切换"
          : lifecycleBusy
            ? "正在更新模板状态，请等待完成后再切换"
            : "正在保存模板，请等待完成后再切换",
      );
      return;
    }
    if (onOpened && current.draft && targetMatchesDraft(target, current.draft)) {
      onOpened(current.draft);
      return;
    }
    const completeOpen = () => {
      void openTargetImmediately(target).then((openedDraft) => {
        if (openedDraft) onOpened?.(openedDraft);
      });
    };
    if (!current.draft || !current.dirty) {
      completeOpen();
      return;
    }
    const templateName = current.draft.definition.name.trim() || "当前模板";
    const recoveryPending = Boolean(current.draft.compatibilityRecovery);
    const startsNewTemplate = target.kind === "dynamic-new";
    requestDirtySessionAction({
      title: startsNewTemplate ? "新建模板？" : "切换模板？",
      discardText: recoveryPending
        ? startsNewTemplate ? "放弃修复并新建" : "放弃修复并切换"
        : startsNewTemplate ? "放弃修改并新建" : "放弃修改并切换",
      saveText: startsNewTemplate ? "保存草稿并新建" : "保存草稿并切换",
      allowSave: canManageTemplates
        && current.saveStatus !== "conflict"
        && current.saveStatus !== "permission-error"
        && !current.draft.compatibilityRecovery,
      content: (
        <div className="template-editor__transition-confirm">
          <p className="template-editor__transition-summary">
            {recoveryPending
              ? `模板“${templateName}”的旧草稿需要升级，系统生成了一份修复方案（尚未保存）。`
              : `模板“${templateName}”还有未保存修改。`}
          </p>
          <p className="template-editor__transition-note">
            {recoveryPending
              ? "切换只会放弃这份修复方案；服务端原草稿保持原样，重新打开该模板时仍可再次获得修复方案。"
              : current.saveStatus === "permission-error"
              ? "服务端已拒绝当前账号保存这个模板；只能继续编辑，或明确放弃修改后切换。"
              : current.saveStatus === "conflict"
                ? "当前模板存在保存冲突；请留在当前会话核对修改，或明确放弃修改后重新打开同一模板。"
                : "保存后将作为模板草稿；已发布模板和页面草稿不会受到影响。"}
          </p>
        </div>
      ),
      onDiscard: completeOpen,
      onSaved: completeOpen,
    });
  }, [canManageTemplates, lifecycleBusy, message, openTargetImmediately, publishing, requestDirtySessionAction]);

  const copyTarget = useCallback(async (
    target: TemplateEditorLibraryTarget,
    action: "copy" | "copy-published",
  ) => {
    if (!requireActive() || lifecycleBusy || publishing) return false;
    const sourceSession = useTemplateEditorSession.getState();
    if (sourceSession.saveStatus === "saving") return false;
    const requestId = ++copyRequestRef.current;
    const sourceSessionId = sourceSession.sessionId;
    const sourceGeneration = sourceSession.semanticGeneration;
    try {
      let source: TemplateDefinitionV2 | undefined;
      let copySource: { templateId: string; revision: number; definitionChecksum: string } | undefined;
      let originalCopy: TemplateDefinitionV2 | undefined;
      if (
        action === "copy-published"
        && (target.kind !== "dynamic-persisted" || !target.published || target.published.schemaVersion === 1)
      ) {
        message.info("此正式版本暂不能直接复制，请先建立对应编辑草稿。");
        return false;
      }
      if (target.kind === "dynamic-persisted") {
        source = action === "copy-published" || !target.template.draft
          ? target.published?.definition
          : sourceSession.draft?.definition.templateId === target.template.templateId
            ? sourceSession.draft.definition
            : undefined;
        if (!source) {
          const response = await dynamicTemplateApi.getDraft(target.template.templateId);
          source = unwrapResponse<DynamicTemplateResource | null>(response)?.draft?.definition;
        }
      } else if (target.kind === "dynamic-local") {
        source = sourceSession.draft?.localDraftId === target.localDraftId
          ? sourceSession.draft.definition
          : loadLocalDynamicTemplateDraft(target.localDraftId)?.definition;
      }
      if (source?.schemaVersion === 1) {
        if (target.kind !== "dynamic-persisted") {
          message.info("请先保存旧模板草稿，再复制完整设计。");
          return false;
        }
        const response = await dynamicTemplateApi.getDraft(target.template.templateId);
        const resource = unwrapResponse<DynamicTemplateResource | null>(response);
        if (!resource?.draft) {
          message.info("此旧模板尚无编辑草稿，请先从正式版本建立草稿再复制。");
          return false;
        }
        originalCopy = resource.draft.definition;
        copySource = {
          templateId: resource.templateId,
          revision: resource.draft.revision,
          definitionChecksum: resource.draft.definitionChecksum,
        };
      }
      const current = useTemplateEditorSession.getState();
      if (
        requestId !== copyRequestRef.current
        || !activeRef.current
        || !canManageTemplatesRef.current
        || useVisualEditorSession.getState().workspace !== "template"
        || current.sessionId !== sourceSessionId
        || current.semanticGeneration !== sourceGeneration
      ) return false;
      if (!source) {
        message.error("无法读取要复制的模板，请重新打开后再试。");
        return false;
      }
      const definition = copyTemplateDefinition(source);
      const copySourceDefinition = originalCopy
        ? { ...structuredClone(originalCopy), templateId: definition.templateId, name: definition.name }
        : undefined;
      openTarget({
        kind: "dynamic-new",
        definition,
        ...(copySource ? { copySource, copySourceDefinition } : {}),
      });
      return true;
    } catch {
      message.error("复制模板失败，当前草稿未改变。");
      return false;
    }
  }, [lifecycleBusy, message, openTarget, publishing, requireActive]);

  const closeSession = useCallback(() => {
    const current = useTemplateEditorSession.getState();
    if (!current.draft) return;
    if (current.saveStatus === "saving" || publishing || lifecycleBusy) {
      message.info(
        publishing
          ? "正在发布模板，请等待完成后再关闭会话"
          : lifecycleBusy
            ? "正在更新模板状态，请等待完成后再关闭会话"
            : "正在保存模板，请等待完成后再关闭会话",
      );
      return;
    }
    const templateName = current.draft.definition.name.trim() || "当前模板";
    if (!current.dirty) {
      closeTemplateSession();
      message.success(`已关闭“${templateName}”的模板编辑会话`);
      return;
    }
    const allowSave = canManageTemplates
      && current.saveStatus !== "conflict"
      && current.saveStatus !== "permission-error"
      && !current.draft.compatibilityRecovery;
    const recoveryPending = Boolean(current.draft.compatibilityRecovery);
    requestDirtySessionAction({
      title: `关闭“${templateName}”的模板编辑会话？`,
      discardText: recoveryPending ? "放弃修复并关闭" : "不保存并关闭",
      saveText: "保存后关闭",
      allowSave,
      content: (
        <div className="template-editor__transition-confirm">
          <p className="template-editor__transition-summary">
            {recoveryPending
              ? "当前模板的旧草稿需要升级，系统生成了一份修复方案（尚未保存）。"
              : "当前模板还有未保存修改；不保存并关闭后，这些修改将丢失。"}
          </p>
          <p className="template-editor__transition-note">
            {recoveryPending
              ? "关闭只会放弃这份修复方案；服务端原草稿保持原样，重新打开该模板时仍可再次获得修复方案。"
              : allowSave
              ? "保存只会更新模板草稿，不会发布模板或修改页面。"
              : current.saveStatus === "permission-error"
                ? "服务端已拒绝当前账号保存这个模板。请继续编辑并联系管理员，或明确不保存并关闭。"
                : "当前模板存在保存冲突。请继续核对修改，或明确不保存并关闭后重新打开同一模板。"}
          </p>
        </div>
      ),
      onDiscard: closeTemplateSession,
      onSaved: closeTemplateSession,
    });
  }, [canManageTemplates, closeTemplateSession, lifecycleBusy, message, publishing, requestDirtySessionAction]);

  const reconcilePublishedDraft = useCallback((
    operation: OperationIdentity,
    resource: DynamicTemplateResource,
    publishedChecksum: string,
  ) => {
    const current = publishWorkflowRef.current;
    if (!isCurrentPublishOperation(current, operation) || !("snapshot" in current)) return false;
    const operationMeta = publishOperationMetaRef.current;
    const meta = operationMeta?.operationId === operation.operationId
      ? operationMeta.meta
      : null;
    if (
      !meta
      || !meta.savedResource
      || !matchesPublishedDraftResource(
        resource,
        operation,
        meta.savedResource,
        current.snapshot.reviewedDefinition,
        publishedChecksum,
      )
    ) return false;
    const savedDraft = createPersistedDraft(resource, publishedChecksum);
    if (!savedDraft) return false;
    useTemplateEditorSession.getState().reconcileSaveResult({
      sessionId: meta.requestedDraft.definition.templateId === resource.templateId
        ? operation.sessionId
        : "",
      requestedDraft: meta.savedDraft ?? meta.requestedDraft,
      savedDraft,
    });
    meta.savedDraft = savedDraft;
    meta.savedResource = resource;
    return true;
  }, []);

  const recoverPublishedDraft = useCallback(async (
    operation: OperationIdentity,
    templateId: string,
    publishedChecksum: string,
  ) => {
    if (!isCurrentPublishOperation(publishWorkflowRef.current, operation)) return;
    setPublishedDraftAvailability({ status: "checking", templateId });
    try {
      const response = await dynamicTemplateApi.getDraft(templateId);
      const resource = unwrapResponse<DynamicTemplateResource | null>(response);
      if (!isCurrentPublishOperation(publishWorkflowRef.current, operation)) return;
      if (!resource) {
        setPublishedDraftAvailability({ status: "unavailable", templateId });
        return;
      }
      if (
        resource.templateId !== templateId
        || !resource.draft
        || !Number.isInteger(resource.draft.revision)
        || resource.draft.revision <= 0
        || !isDefinitionChecksum(resource.draft.definitionChecksum)
        || resource.draft.definition.templateId !== templateId
      ) throwMalformedPublishResponse("MALFORMED_DRAFT_RECOVERY");
      if (reconcilePublishedDraft(operation, resource, publishedChecksum)) {
        setPublishedDraftAvailability({ status: "available", templateId });
      } else {
        setPublishedDraftAvailability({
          status: "unavailable",
          templateId,
          failure: { category: "malformed-response", code: "PUBLISHED_DRAFT_IDENTITY_MISMATCH" },
        });
      }
    } catch (error) {
      if (!isCurrentPublishOperation(publishWorkflowRef.current, operation)) return;
      setPublishedDraftAvailability({
        status: "unavailable",
        templateId,
        failure: classifyPublishFailure(error),
      });
    }
  }, [reconcilePublishedDraft]);

  publishEffectRunnerRef.current = async (effect) => {
    const operationId = effect.operation.operationId;
    const operationMeta = publishOperationMetaRef.current;
    const meta = operationMeta?.operationId === operationId
      ? operationMeta.meta
      : null;
    if (!meta) return;
    if (effect.kind === "save-reviewed-snapshot") {
      try {
        const response = effect.mode === "create"
          ? await dynamicTemplateApi.create({
              definition: effect.definition,
              ...(meta.requestedDraft?.copySource ? { copySource: meta.requestedDraft.copySource } : {}),
              ...(effect.versionNote ? { versionNote: effect.versionNote } : {}),
            })
          : await dynamicTemplateApi.updateDraft(effect.templateId, {
              expectedRevision: effect.expectedRevision as number,
              definition: effect.definition,
              ...(effect.versionNote ? { versionNote: effect.versionNote } : {}),
            });
        const resource = unwrapResponse<DynamicTemplateResource>(response);
        if (
          !resource
          || resource.templateId !== effect.templateId
          || !resource.draft
          || !Number.isInteger(resource.draft.revision)
          || resource.draft.revision <= 0
          || !isDefinitionChecksum(resource.draft.definitionChecksum)
          || !resource.draft.definition
          || resource.draft.definition.templateId !== effect.templateId
          || !sameTemplateDefinition(resource.draft.definition, effect.definition)
          || !matchesReviewedVersionNote(resource.draft.versionNote, effect.operation.versionNote)
        ) throwMalformedPublishResponse("MALFORMED_SAVED_DRAFT");
        const savedDraft = createPersistedDraft(
          resource,
          meta.requestedDraft.remote?.publishedDefinitionChecksum ?? null,
        );
        if (!savedDraft) throwMalformedPublishResponse("INVALID_SAVED_DRAFT_DEFINITION");
        const current = publishWorkflowRef.current;
        if (
          current.status !== "saving-reviewed-snapshot"
          || !isCurrentPublishOperation(current, effect.operation)
        ) return;
        meta.savedResource = resource;
        meta.savedDraft = savedDraft;
        useTemplateEditorSession.getState().reconcileSaveResult({
          sessionId: effect.operation.sessionId,
          requestedDraft: meta.requestedDraft,
          savedDraft,
        });
        notifyEditableTemplateCatalogChanged(resource);
        applyPublishTransition(beginReviewedSnapshotPublish(current, {
          operation: effect.operation,
          savedRevision: resource.draft.revision,
          savedChecksum: resource.draft.definitionChecksum,
          live: currentLivePublishContext(),
        }));
      } catch (error) {
        const current = publishWorkflowRef.current;
        if (
          current.status !== "saving-reviewed-snapshot"
          || !isCurrentPublishOperation(current, effect.operation)
        ) return;
        applyPublishTransition(saveReviewedSnapshotFailed(current, {
          operation: effect.operation,
          failure: classifyPublishFailure(error),
          live: currentLivePublishContext(),
        }));
      }
      return;
    }

    if (effect.kind === "verify-saved-draft") {
      const current = publishWorkflowRef.current;
      if (
        current.status !== "verifying-uncertain"
        || current.scope !== "save"
        || !isCurrentPublishOperation(current, effect.operation)
      ) return;
      try {
        const response = await dynamicTemplateApi.getDraft(effect.templateId);
        const resource = unwrapResponse<DynamicTemplateResource | null>(response);
        const latest = publishWorkflowRef.current;
        if (
          latest.status !== "verifying-uncertain"
          || latest.scope !== "save"
          || !isCurrentPublishOperation(latest, effect.operation)
        ) return;
        if (!resource) {
          applyPublishTransition(saveVerificationNotFound(latest, {
            operation: effect.operation,
            live: currentLivePublishContext(),
          }));
          return;
        }
        if (
          resource.templateId !== effect.templateId
          || !resource.draft
          || !Number.isInteger(resource.draft.revision)
          || resource.draft.revision <= 0
          || !isDefinitionChecksum(resource.draft.definitionChecksum)
          || !resource.draft.definition
        ) throwMalformedPublishResponse("MALFORMED_SAVE_VERIFICATION");
        if (
          effect.baselineRevision !== null
          && resource.draft.revision === effect.baselineRevision
          && resource.draft.definitionChecksum === effect.baselineChecksum
        ) {
          applyPublishTransition(saveVerificationNotFound(latest, {
            operation: effect.operation,
            live: currentLivePublishContext(),
          }));
          return;
        }
        if (
          !sameTemplateDefinition(resource.draft.definition, latest.snapshot.reviewedDefinition)
          || !matchesReviewedVersionNote(resource.draft.versionNote, effect.operation.versionNote)
        ) {
          applyPublishTransition(saveVerificationMismatched(latest, {
            operation: effect.operation,
            observedRevision: resource.draft.revision,
            observedChecksum: resource.draft.definitionChecksum,
            live: currentLivePublishContext(),
          }));
          return;
        }
        const savedDraft = createPersistedDraft(
          resource,
          meta.requestedDraft.remote?.publishedDefinitionChecksum ?? null,
        );
        if (!savedDraft) throwMalformedPublishResponse("INVALID_VERIFIED_DRAFT");
        meta.savedResource = resource;
        meta.savedDraft = savedDraft;
        useTemplateEditorSession.getState().reconcileSaveResult({
          sessionId: effect.operation.sessionId,
          requestedDraft: meta.requestedDraft,
          savedDraft,
        });
        notifyEditableTemplateCatalogChanged(resource);
        applyPublishTransition(saveVerificationMatched(latest, {
          operation: effect.operation,
          savedRevision: resource.draft.revision,
          savedChecksum: resource.draft.definitionChecksum,
          live: currentLivePublishContext(),
        }));
      } catch (error) {
        const latest = publishWorkflowRef.current;
        if (
          latest.status !== "verifying-uncertain"
          || latest.scope !== "save"
          || !isCurrentPublishOperation(latest, effect.operation)
        ) return;
        if (getEditorHttpStatus(error) === 404) {
          applyPublishTransition(saveVerificationNotFound(latest, {
            operation: effect.operation,
            live: currentLivePublishContext(),
          }));
        } else {
          applyPublishTransition(verificationFailed(latest, {
            operation: effect.operation,
            failure: classifyPublishFailure(error),
            live: currentLivePublishContext(),
          }));
        }
      }
      return;
    }

    if (effect.kind === "publish-reviewed-snapshot") {
      const current = publishWorkflowRef.current;
      if (
        current.status !== "publishing"
        || !meta.savedResource
        || !isCurrentPublishOperation(current, effect.operation)
      ) return;
      try {
        const response = await dynamicTemplateApi.publish(effect.templateId, effect.payload);
        const result = unwrapResponse<DynamicTemplatePublishResultResource>(response);
        if (
          !result
          || !result.published
          || result.templateId !== effect.templateId
          || result.version !== effect.operation.targetVersion
          || (result.outcome !== "published" && result.outcome !== "already-published")
          || result.published.dynamicTemplateId !== meta.savedResource.id
          || result.published.version !== effect.operation.targetVersion
          || result.published.definitionChecksum !== effect.payload.expectedChecksum
          || !result.published.definition
          || result.published.definition.templateId !== effect.templateId
          || !sameTemplateDefinition(result.published.definition, current.snapshot.reviewedDefinition)
          || !matchesReviewedVersionNote(result.published.versionNote, effect.operation.versionNote)
        ) throwMalformedPublishResponse("MALFORMED_PUBLISH_RESULT");
        const returnedDraftResource: DynamicTemplateResource | null = result.draft
          ? {
              ...meta.savedResource,
              publishedVersion: result.version,
              visibility: "STAFF",
              draft: result.draft,
            }
          : null;
        if (
          returnedDraftResource
          && !matchesPublishedDraftResource(
            returnedDraftResource,
            effect.operation,
            meta.savedResource,
            current.snapshot.reviewedDefinition,
            result.published.definitionChecksum,
          )
        ) throwMalformedPublishResponse("MALFORMED_PUBLISHED_DRAFT");
        const latest = publishWorkflowRef.current;
        if (
          latest.status !== "publishing"
          || !isCurrentPublishOperation(latest, effect.operation)
        ) return;
        const liveAtResponse = currentLivePublishContext();
        applyPublishTransition(publishReviewedSnapshotSucceeded(latest, {
          operation: effect.operation,
          templateId: result.templateId,
          version: result.version,
          checksum: asDefinitionChecksum(result.published.definitionChecksum),
          outcome: result.outcome,
          live: liveAtResponse,
        }));
        if (returnedDraftResource) {
          if (reconcilePublishedDraft(effect.operation, returnedDraftResource, result.published.definitionChecksum)) {
            setPublishedDraftAvailability({ status: "available", templateId: effect.templateId });
          } else {
            setPublishedDraftAvailability({
              status: "unavailable",
              templateId: effect.templateId,
              failure: { category: "malformed-response", code: "PUBLISHED_DRAFT_IDENTITY_MISMATCH" },
            });
          }
        } else {
          void recoverPublishedDraft(effect.operation, effect.templateId, result.published.definitionChecksum);
        }
      } catch (error) {
        const latest = publishWorkflowRef.current;
        if (
          latest.status !== "publishing"
          || !isCurrentPublishOperation(latest, effect.operation)
        ) return;
        applyPublishTransition(publishReviewedSnapshotFailed(latest, {
          operation: effect.operation,
          failure: classifyPublishFailure(error),
          live: currentLivePublishContext(),
        }));
      }
      return;
    }

    if (effect.kind === "verify-published-version") {
      const current = publishWorkflowRef.current;
      if (
        current.status !== "verifying-uncertain"
        || current.scope !== "publish"
        || !meta.savedResource
        || !isCurrentPublishOperation(current, effect.operation)
      ) return;
      try {
        const response = await dynamicTemplateApi.getPublishedVersion(effect.templateId, effect.targetVersion);
        const version = unwrapResponse<PublishedDynamicTemplateVersionResource | null>(response);
        const latest = publishWorkflowRef.current;
        if (
          latest.status !== "verifying-uncertain"
          || latest.scope !== "publish"
          || !isCurrentPublishOperation(latest, effect.operation)
        ) return;
        if (!version) {
          applyPublishTransition(publishedVersionVerificationNotFound(latest, {
            operation: effect.operation,
            live: currentLivePublishContext(),
          }));
          return;
        }
        if (
          !Number.isInteger(version.version)
          || !Number.isInteger(version.dynamicTemplateId)
          || !version.definition
          || !isDefinitionChecksum(version.definitionChecksum)
        ) throwMalformedPublishResponse("MALFORMED_PUBLISHED_VERSION");
        if (
          version.templateId !== effect.templateId
          || version.version !== effect.targetVersion
          || version.dynamicTemplateId !== meta.savedResource.id
          || version.definition.templateId !== effect.templateId
          || version.definitionChecksum !== effect.expectedChecksum
          || !sameTemplateDefinition(version.definition, latest.snapshot.reviewedDefinition)
          || !matchesReviewedVersionNote(version.versionNote, effect.operation.versionNote)
        ) {
          applyPublishTransition(publishedVersionVerificationMismatched(latest, {
            operation: effect.operation,
            observedChecksum: version.definitionChecksum,
            live: currentLivePublishContext(),
          }));
          return;
        }
        applyPublishTransition(publishedVersionVerificationMatched(latest, {
          operation: effect.operation,
          templateId: version.templateId,
          version: version.version,
          checksum: asDefinitionChecksum(version.definitionChecksum),
          outcome: "already-published",
          live: currentLivePublishContext(),
        }));
        void recoverPublishedDraft(effect.operation, effect.templateId, version.definitionChecksum);
      } catch (error) {
        const latest = publishWorkflowRef.current;
        if (
          latest.status !== "verifying-uncertain"
          || latest.scope !== "publish"
          || !isCurrentPublishOperation(latest, effect.operation)
        ) return;
        if (getEditorHttpStatus(error) === 404) {
          applyPublishTransition(publishedVersionVerificationNotFound(latest, {
            operation: effect.operation,
            live: currentLivePublishContext(),
          }));
        } else {
          applyPublishTransition(verificationFailed(latest, {
            operation: effect.operation,
            failure: classifyPublishFailure(error),
            live: currentLivePublishContext(),
          }));
        }
      }
      return;
    }

    const current = publishWorkflowRef.current;
    if (effect.kind !== "refresh-template-catalog") return;
    if (!isCurrentPublishOperation(current, effect.operation)) return;
    const catalogState = current.status === "published"
      ? current
      : current.status === "partial-failure"
        && current.reason === "template-published-catalog-stale"
        && current.saved
        && current.published
        ? {
            ...current,
            status: "published" as const,
            saved: current.saved,
            published: current.published,
            catalogStatus: "refreshing" as const,
          }
        : null;
    if (!catalogState) return;
    if (catalogState !== current) {
      publishWorkflowRef.current = catalogState;
      setPublishWorkflow(catalogState);
    }
    try {
      const response = await dynamicTemplateApi.listCatalog({ dedupe: false });
      const catalog = unwrapResponse<TemplateCatalogResource>(response);
      if (!catalog || !Array.isArray(catalog.items)) throwMalformedPublishResponse("MALFORMED_TEMPLATE_CATALOG");
      const latest = publishWorkflowRef.current;
      if (
        latest.status !== "published"
        || !isCurrentPublishOperation(latest, effect.operation)
      ) return;
      const exact = catalog.items.some((item) => item.kind === "published"
        && item.template.templateId === effect.templateId
        && item.template.version === effect.version
        && item.template.definitionChecksum === effect.checksum
        && sameTemplateDefinition(item.template.definition, latest.snapshot.reviewedDefinition)
        && matchesReviewedVersionNote(item.template.versionNote, effect.operation.versionNote));
      if (!exact) {
        applyPublishTransition(catalogRefreshFailed(latest, {
          operation: effect.operation,
          failure: { category: "rejected", code: "CATALOG_VERSION_MISSING" },
          live: { ...currentLivePublishContext(), targetVersion: effect.operation.targetVersion },
        }));
        return;
      }
      notifyDynamicTemplateCatalogChanged({
        kind: "verified-catalog",
        identity: {
          templateId: effect.templateId,
          version: effect.version,
          definitionChecksum: effect.checksum,
        },
        catalog,
      });
      applyPublishTransition(catalogRefreshSucceeded(latest, {
        operation: effect.operation,
        live: { ...currentLivePublishContext(), targetVersion: effect.operation.targetVersion },
      }));
    } catch (error) {
      const latest = publishWorkflowRef.current;
      if (
        latest.status !== "published"
        || !isCurrentPublishOperation(latest, effect.operation)
      ) return;
      applyPublishTransition(catalogRefreshFailed(latest, {
        operation: effect.operation,
        failure: classifyPublishFailure(error),
        live: { ...currentLivePublishContext(), targetVersion: effect.operation.targetVersion },
      }));
    }
  };

  const publish = useCallback(async (): Promise<boolean> => {
    if (localOnly) {
      message.info("Mock 模式只保存本机测试草稿，不支持服务端发布");
      return false;
    }
    if (!canManageTemplates) return false;
    const current = useTemplateEditorSession.getState();
    if (!current.draft || !current.sessionId) return false;
    if (current.draft.copySource) { message.info("请先保存模板副本，再打开发布检查。"); return false; }
    const existing = publishWorkflowRef.current;
    if (
      existing.status !== "editing"
      && existing.snapshot.sessionId === current.sessionId
      && existing.snapshot.templateId === current.draft.definition.templateId
    ) {
      openPublishReview();
      return false;
    }
    const readiness = deriveTemplateProductionReadiness({
      definition: current.draft.definition,
      reviewFacts: current.productionReviewFacts,
      hasBaseline: Boolean(current.baseline),
      dirty: current.dirty,
      saveStatus: current.saveStatus,
    });
    const validation = readiness.validation;
    const reviewIssues = [
      ...validation.issues.filter((issue) => issue.level === "error"),
      ...validation.issues.filter((issue) => issue.level !== "error"),
    ];
    const baselineIsStrict = current.draft.sourceType === "persisted"
      && current.draft.remote
      && Number.isInteger(current.draft.remote.revision)
      && current.draft.remote.revision > 0
      && isDefinitionChecksum(current.draft.remote.draftDefinitionChecksum);
    const machineIssues = reviewIssues.map((issue) => ({
      code: `${issue.code}:${issue.path}`,
      blocking: issue.level === "error",
    }));
    if (!readiness.machineReady) {
      machineIssues.push({
        code: "production-machine-readiness",
        blocking: true,
      });
    }
    if (current.draft.compatibilityRecovery) {
      machineIssues.push({ code: "compatibility-recovery", blocking: true });
    }
    if (current.draft.sourceType === "persisted" && !baselineIsStrict) {
      machineIssues.push({ code: "invalid-saved-identity", blocking: true });
    }
    publishReviewReturnRef.current = {
      sessionId: current.sessionId,
      selectionSnapshot: structuredClone(current.selectionSnapshot),
      device: current.device,
      canvasZoom: current.canvasZoom,
      previewMode: current.previewMode,
      previewScenario: current.previewScenario,
      workspaceScroll: structuredClone(current.workspaceScroll),
    };
    current.setPreviewMode(false);
    current.setInspectorTask("design");
    current.setInspectorView("context");
    setPublishIssueEditing(false);
    setPublishedDraftAvailability(null);
    setReview({
      sessionId: current.sessionId,
      templateId: current.draft.definition.templateId,
      issues: reviewIssues,
      currentIndex: Math.max(0, reviewIssues.findIndex((issue) => issue.level === "error")),
      requestId: ++reviewRequestRef.current,
      selectionSnapshot: structuredClone(current.selectionSnapshot),
    });
    applyPublishTransition(createPublishReview({
      sessionId: current.sessionId,
      templateId: current.draft.definition.templateId,
      semanticGeneration: current.semanticGeneration,
      targetVersion: (current.draft.remote?.publishedVersion ?? 0) + 1,
      reviewedDefinition: current.draft.definition,
      reviewedVersionNote: current.draft.versionNote,
      baseline: baselineIsStrict && current.draft.remote
        ? {
            revision: current.draft.remote.revision,
            checksum: asDefinitionChecksum(current.draft.remote.draftDefinitionChecksum),
          }
        : null,
      issues: machineIssues,
    }));
    return true;
  }, [applyPublishTransition, canManageTemplates, localOnly, message, openPublishReview]);

  const confirmPublish = useCallback(() => {
    const current = publishWorkflowRef.current;
    const session = useTemplateEditorSession.getState();
    if (current.status !== "review-ready" || !session.draft || !session.sessionId) return;
    const operationId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `publish-${Date.now()}`;
    publishOperationMetaRef.current = {
      operationId,
      meta: { requestedDraft: structuredClone(session.draft) },
    };
    applyPublishTransition(beginReviewedSnapshotSave(current, operationId));
  }, [applyPublishTransition]);

  const cancelPublishReview = useCallback(() => {
    const context = publishReviewReturnRef.current;
    const session = useTemplateEditorSession.getState();
    if (context && session.sessionId === context.sessionId) {
      useTemplateEditorSession.setState({
        selectionSnapshot: context.selectionSnapshot,
        ...projectTemplateEditorSelectionSnapshot(context.selectionSnapshot),
        device: context.device,
        canvasZoom: context.canvasZoom,
        previewScenario: context.previewScenario,
        previewMode: context.previewMode,
        workspaceScroll: context.workspaceScroll,
      });
    }
    publishReviewReturnRef.current = null;
    publishOperationMetaRef.current = null;
    setPublishIssueEditing(false);
    setReview(null);
    setPublishedDraftAvailability(null);
    applyPublishTransition(resetDefinitionPublishWorkflow(currentLivePublishContext()));
  }, [applyPublishTransition]);

  const recheckPublishReview = useCallback(() => {
    publishOperationMetaRef.current = null;
    setPublishIssueEditing(false);
    setReview(null);
    setPublishedDraftAvailability(null);
    applyPublishTransition(resetDefinitionPublishWorkflow(currentLivePublishContext()));
    window.queueMicrotask(() => { void publish(); });
  }, [applyPublishTransition, publish]);

  const retryPublishVerification = useCallback(() => {
    applyPublishTransition(retryVerification(publishWorkflowRef.current));
  }, [applyPublishTransition]);
  const retryFailedPublish = useCallback(() => {
    const current = publishWorkflowRef.current;
    if (
      current.status !== "partial-failure"
      || current.reason !== "draft-saved-template-unpublished"
      || !current.saved
      || current.currentInputChanged
    ) return;
    const saving: SavingReviewedSnapshotState<TemplateDefinitionV2> = {
      status: "saving-reviewed-snapshot",
      snapshot: current.snapshot,
      issues: current.issues,
      operation: current.operation,
      currentInputChanged: false,
      ...(current.staleReason ? { staleReason: current.staleReason } : {}),
    };
    applyPublishTransition(beginReviewedSnapshotPublish(saving, {
      operation: current.operation,
      savedRevision: current.saved.revision,
      savedChecksum: current.saved.checksum,
      live: currentLivePublishContext(),
    }));
  }, [applyPublishTransition]);
  const retryPublishCatalog = useCallback(() => {
    applyPublishTransition(retryCatalogRefresh(publishWorkflowRef.current));
  }, [applyPublishTransition]);
  const reloadPublishedDraft = useCallback(() => {
    const current = publishWorkflowRef.current;
    if (current.status === "editing" || !("published" in current) || !current.published) return;
    void recoverPublishedDraft(
      current.operation,
      current.published.templateId,
      current.published.checksum,
    );
  }, [recoverPublishedDraft]);
  const usePublishedTemplateInPage = useCallback(() => {
    const current = publishWorkflowRef.current;
    if (current.status !== "published" || current.catalogStatus !== "fresh") return;
    useVisualEditorSession.getState().activateWorkspace("page");
    notifyDynamicTemplateCatalogChanged();
    onReturnPage();
  }, [onReturnPage]);

  const promoteFromPage = useCallback(async (
    request: PromoteDynamicTemplateInstanceRequest,
    pageViewport: { width: number; height: number },
  ) => {
    if (!canManageTemplates) {
      message.warning("只有超级管理员可以把页面设计覆盖应用到母模板草稿");
      return;
    }
    if (localOnly) {
      message.info("Mock 模式没有服务端母模板草稿，不能执行安全回填");
      return;
    }
    if (isViewingPublished()) {
      message.warning("请先返回页面草稿，再应用设计覆盖");
      return;
    }
    const existingSession = useTemplateEditorSession.getState();
    if (existingSession.draft && existingSession.dirty) {
      message.warning("已有未保存的模板修改，请先返回模板设计处理后再回填");
      return;
    }
    try {
      const response = await dynamicTemplateApi.getDraft(request.templateId);
      const template = unwrapResponse<DynamicTemplateResource | null>(response);
      if (!template) {
        message.error("当前母模板不存在可编辑草稿");
        return;
      }
      if (template.status === "ARCHIVED") {
        message.warning("回收站中的模板不能接收页面设计覆盖");
        return;
      }
      const persistedDraft = createPersistedDraft(
        template,
        request.sourceVersion === template.publishedVersion
          ? request.sourceDefinitionChecksum
          : null,
      );
      if (!persistedDraft) {
        message.error("服务端模板缺少可编辑草稿");
        return;
      }
      const promotion = promoteInstanceOverridesToTemplateDraft({
        sourceDefinition: request.sourceDefinition,
        targetDefinition: persistedDraft.definition,
        layoutOverridesByNodeId: request.layoutOverridesByNodeId,
      });
      if (promotion.blockers.length > 0 || promotion.conflicts.length > 0) {
        modal.error({
          title: "未应用：母模板草稿存在安全冲突",
          content: <div>
            {promotion.blockers.map((blocker) => <p key={blocker}>{blocker}</p>)}
            {promotion.conflicts.slice(0, 6).map((conflict) => (
              <p key={`${conflict.nodeId}-${conflict.device}-${conflict.field}`}>
                <strong>{conflict.nodeName} · {conflict.label}：</strong>{conflict.reason}
              </p>
            ))}
            {promotion.conflicts.length > 6 ? <p>另有 {promotion.conflicts.length - 6} 项冲突。</p> : null}
            <p>请先在模板设计中合并同一字段，页面草稿未被修改。</p>
          </div>,
          okText: "知道了",
        });
        return;
      }
      if (promotion.promoted.length === 0) {
        message.info(promotion.alreadyApplied.length > 0
          ? "这些设计覆盖已存在于当前母模板草稿，无需重复应用"
          : "当前页面没有可无损应用到母模板草稿的设计覆盖");
        return;
      }
      modal.confirm({
        title: `应用 ${promotion.promoted.length} 项设计覆盖到母模板草稿？`,
        width: 560,
        content: <div>
          <p>将打开“{persistedDraft.definition.name}”的模板设计工作区，并形成一条可撤销、尚未保存的草稿修改。</p>
          <ul>{promotion.promoted.slice(0, 8).map((item) => (
            <li key={`${item.nodeId}-${item.device}-${item.field}`}>{item.nodeName} · {item.label}</li>
          ))}</ul>
          {promotion.promoted.length > 8 ? <p>另有 {promotion.promoted.length - 8} 项安全设计字段。</p> : null}
          {promotion.skipped.length > 0 ? <p>{promotion.skipped.length} 项偏移、图片缩放或精确焦点不能无损转换，将保留在当前页面，需在模板设计中人工确认。</p> : null}
          <p><strong>不会带入</strong>页面文字、图片、视频、商品、链接、隐藏状态，也不会自动保存、发布或更新其他页面。</p>
        </div>,
        okText: "打开模板草稿",
        cancelText: "取消",
        onOk: () => {
          onEnterWorkspace(pageViewport);
          activateTemplateSession();
          const session = useTemplateEditorSession.getState();
          session.open(persistedDraft);
          session.setDynamicDefinition(promotion.definition);
          session.selectObject(promotion.promoted[0]?.nodeId ?? promotion.definition.rootNodeId);
          message.success(`已应用 ${promotion.promoted.length} 项设计覆盖；尚未保存模板草稿`);
        },
      });
    } catch (error) {
      message.error(getEditorErrorMessage(error, "母模板草稿读取失败，页面修改仍完整保留"));
    }
  }, [activateTemplateSession, canManageTemplates, isViewingPublished, localOnly, message, modal, onEnterWorkspace]);

  const createDraftFromPublished = useCallback(async (
    template: DynamicTemplateResource,
    published: PublishedDynamicTemplateResource,
  ) => {
    if (!requireActive()) return false;
    if (localOnly) {
      message.info("Mock 模式不能从服务端正式版本建立编辑草稿");
      return false;
    }
    const publishedValidation = validateDynamicTemplateDefinition(published.definition);
    if (
      template.status !== "ACTIVE"
      || template.draft !== null
      || template.templateId !== published.templateId
      || template.publishedVersion !== published.version
      || !Number.isInteger(published.version)
      || published.version <= 0
      || !isDefinitionChecksum(published.definitionChecksum)
      || !publishedValidation.valid
      || publishedValidation.definition?.templateId !== template.templateId
    ) {
      message.error("目录中的正式版本身份不完整，未建立编辑草稿；请重新读取目录后重试");
      return false;
    }
    if (lifecycleInFlightRef.current) {
      message.info("正在更新模板状态，请等待完成后再重试");
      return false;
    }
    const sourceSession = useTemplateEditorSession.getState();
    if (sourceSession.dirty) {
      message.warning("当前模板还有未保存修改，请先保存或放弃修改，再建立并打开其他模板草稿");
      return false;
    }
    const requestId = ++publishedDraftCreationRequestRef.current;
    const expectedVersion = published.version;
    const expectedChecksum = published.definitionChecksum;
    const sourceIdentity = {
      sessionId: sourceSession.sessionId,
      templateId: sourceSession.draft?.definition.templateId ?? null,
      semanticGeneration: sourceSession.semanticGeneration,
    };
    const requestState = {
      templateId: template.templateId,
      expectedVersion,
      expectedChecksum,
    };
    const isOriginalOperation = () => {
      const latest = useTemplateEditorSession.getState();
      return publishedDraftCreationRequestRef.current === requestId
        && activeRef.current
        && canManageTemplatesRef.current
        && useVisualEditorSession.getState().workspace === "template"
        && latest.sessionId === sourceIdentity.sessionId
        && (latest.draft?.definition.templateId ?? null) === sourceIdentity.templateId
        && latest.semanticGeneration === sourceIdentity.semanticGeneration
        && !latest.dirty;
    };

    lifecycleInFlightRef.current = true;
    setLifecycleBusy(true);
    setPublishedDraftCreation({ ...requestState, status: "creating" });
    try {
      const response = await dynamicTemplateApi.createDraftFromPublished(template.templateId, {
        expectedVersion,
        expectedChecksum,
      });
      const resource = unwrapResponse<DynamicTemplateResource | null>(response);
      const persistedDraft = resource
        ? createTrustedDraftFromPublished(resource, published)
        : null;
      if (!resource || !persistedDraft) {
        const reason = "服务端返回的编辑草稿不完整或身份不一致，当前会话未改变；请重新读取目录后重试";
        if (publishedDraftCreationRequestRef.current === requestId) {
          setPublishedDraftCreation({ ...requestState, status: "failed", reason });
        }
        message.error(reason);
        return false;
      }
      if (!isOriginalOperation()) {
        const reason = "编辑草稿已建立，但当前会话已有后续变化；未自动打开，请重新读取目录";
        if (publishedDraftCreationRequestRef.current === requestId) {
          setPublishedDraftCreation({ ...requestState, status: "detached", reason });
        }
        if (activeRef.current && useVisualEditorSession.getState().workspace === "template") {
          message.warning(reason);
        }
        return false;
      }
      activateTemplateSession();
      const session = useTemplateEditorSession.getState();
      session.open(persistedDraft);
      session.selectObject(persistedDraft.definition.rootNodeId);
      setPublishedDraftCreation(null);
      notifyEditableTemplateCatalogChanged(resource);
      message.success(`已从正式版本 v${expectedVersion} 建立编辑草稿；未发布模板，也未修改任何页面`);
      return true;
    } catch (error) {
      const reason = getEditorHttpStatus(error) === 409
        ? "正式版本已变化，未建立编辑草稿；请重新读取目录后重试"
        : getEditorErrorMessage(error, "从正式版本建立编辑草稿失败，当前会话未改变；可以重试");
      if (publishedDraftCreationRequestRef.current === requestId) {
        setPublishedDraftCreation({ ...requestState, status: "failed", reason });
      }
      message.error(reason);
      return false;
    } finally {
      lifecycleInFlightRef.current = false;
      setLifecycleBusy(false);
    }
  }, [activateTemplateSession, localOnly, message, requireActive]);

  const runLifecycle = useCallback(async (operation: () => Promise<unknown>) => {
    if (localOnly || lifecycleInFlightRef.current) return false;
    lifecycleInFlightRef.current = true;
    setLifecycleBusy(true);
    try {
      await operation();
      return true;
    } finally {
      lifecycleInFlightRef.current = false;
      setLifecycleBusy(false);
    }
  }, [localOnly]);

  const archive = useCallback(async (target: TemplateArchiveRequest) => {
    try {
      const template = resolveTemplateArchiveTarget(target);
      if (!template) {
        message.error("当前模板缺少可归档的有效定义，原记录未被修改");
        return false;
      }
      const current = useTemplateEditorSession.getState();
      const matchesCurrent = current.draft && (
        "templateId" in target
          ? current.draft.definition.templateId === target.templateId
          : targetMatchesDraft(target, current.draft)
      );
      if (matchesCurrent && current.dirty) {
        message.warning("请先保存草稿或放弃未保存修改，再将当前模板移入回收站。");
        return false;
      }
      const sourceSession = matchesCurrent
        ? {
            sessionId: current.sessionId,
            semanticGeneration: current.semanticGeneration,
          }
        : null;
      const currentIdentity = matchesCurrent
        && current.draft?.remote
        && Number.isInteger(current.draft.remote.revision)
        && current.draft.remote.revision > 0
        && isDefinitionChecksum(current.draft.remote.draftDefinitionChecksum)
        ? {
            expectedRevision: current.draft.remote.revision,
            expectedChecksum: current.draft.remote.draftDefinitionChecksum,
          }
        : null;
      const archiveRequest = currentIdentity ?? template.request;
      if (!archiveRequest) {
        message.error("当前模板缺少可核对的草稿版本，请重新读取后再移入回收站");
        return false;
      }
      const ok = await runLifecycle(() => dynamicTemplateApi.archive(template.templateId, archiveRequest));
      if (!ok) return false;
      const latest = useTemplateEditorSession.getState();
      const latestMatches = latest.draft && draftMatchesPersistedIdentity(
        latest.draft,
        template.templateId,
      );
      const sourceSessionUnchanged = sourceSession
        && latest.sessionId === sourceSession.sessionId
        && latest.semanticGeneration === sourceSession.semanticGeneration
        && !latest.dirty;
      if (latestMatches && sourceSessionUnchanged) {
        closeTemplateSession();
      }
      notifyDynamicTemplateCatalogChanged();
      if (latestMatches && !sourceSessionUnchanged) {
        message.warning(`模板“${template.name}”已移入回收站；当前会话有后续修改，未自动关闭`);
      } else {
        message.success(`模板“${template.name}”已移入回收站`);
      }
      return true;
    } catch (error) {
      message.error(getEditorErrorMessage(error, "移入回收站失败，当前模板仍保留"));
      return false;
    }
  }, [closeTemplateSession, message, runLifecycle]);

  const restore = useCallback(async (template: TemplateLifecycleTarget) => {
    try {
      const ok = await runLifecycle(() => dynamicTemplateApi.restore(template.templateId));
      if (!ok) return false;
      notifyDynamicTemplateCatalogChanged();
      message.success(`模板“${template.name}”已恢复`);
      return true;
    } catch (error) {
      message.error(getEditorErrorMessage(error, "模板恢复失败，请重试"));
      return false;
    }
  }, [message, runLifecycle]);

  const deleteDraft = useCallback(async (template: TemplateLifecycleTarget) => {
    const current = useTemplateEditorSession.getState();
    const matchesCurrent = current.draft?.sourceType === "persisted"
      && current.draft.definition.templateId === template.templateId;
    if (matchesCurrent && current.dirty) {
      message.warning("请先保存草稿或放弃未保存修改，再永久删除当前模板。");
      return false;
    }
    const sourceSession = matchesCurrent
      ? {
          sessionId: current.sessionId,
          semanticGeneration: current.semanticGeneration,
        }
      : null;
    try {
      const ok = await runLifecycle(() => dynamicTemplateApi.deleteDraft(template.templateId));
      if (!ok) return false;
      const latest = useTemplateEditorSession.getState();
      const latestMatches = latest.draft?.sourceType === "persisted"
        && latest.draft.definition.templateId === template.templateId;
      const sourceSessionUnchanged = sourceSession
        && latest.sessionId === sourceSession.sessionId
        && latest.semanticGeneration === sourceSession.semanticGeneration
        && !latest.dirty;
      if (latestMatches && sourceSessionUnchanged) {
        closeTemplateSession();
      }
      notifyDynamicTemplateCatalogChanged();
      if (latestMatches && !sourceSessionUnchanged) {
        message.warning(`模板“${template.name}”已永久删除；当前会话有后续修改，未自动关闭`);
      } else {
        message.success(`模板“${template.name}”已永久删除`);
      }
      return true;
    } catch (error) {
      message.error(getEditorErrorMessage(error, "永久删除失败；模板和页面数据均未改变"));
      return false;
    }
  }, [closeTemplateSession, message, runLifecycle]);

  const listVersions = useCallback(async (options: { beforeVersion?: number; limit?: number } = {}) => {
    const currentDraft = useTemplateEditorSession.getState().draft;
    if (!currentDraft || currentDraft.sourceType !== "persisted") {
      return { items: [], nextBeforeVersion: null };
    }
    const response = await dynamicTemplateApi.listVersions(currentDraft.definition.templateId, options);
    return unwrapResponse<DynamicTemplateVersionPageResource>(response)
      ?? { items: [], nextBeforeVersion: null };
  }, []);

  const getVersion = useCallback(async (version: number) => {
    const currentDraft = useTemplateEditorSession.getState().draft;
    if (!currentDraft || currentDraft.sourceType !== "persisted") {
      throw new Error("当前模板没有可读取的正式版本");
    }
    const response = await dynamicTemplateApi.getPublishedVersion(
      currentDraft.definition.templateId,
      version,
    );
    const detail = unwrapResponse<DynamicTemplateVersionResource>(response);
    if (!detail) throw new Error("服务端没有返回可信版本详情");
    return detail;
  }, []);

  const stageVersion = useCallback((version: DynamicTemplateVersionResource) => {
    const session = useTemplateEditorSession.getState();
    const currentDraft = session.draft;
    if (!currentDraft || currentDraft.sourceType !== "persisted") return false;
    const nextDraft = structuredClone(currentDraft);
    nextDraft.definition = prepareHistoricalTemplateDefinitionForCurrentDraft(
      version.definition,
      currentDraft.definition,
    );
    nextDraft.historyRestore = {
      sourceTemplateId: currentDraft.definition.templateId,
      sourceVersion: version.version,
      sourceChecksum: version.definitionChecksum,
    };
    session.commitDraft(nextDraft);
    session.selectObject(nextDraft.definition.rootNodeId);
    message.success(`已将 v${version.version} 载入当前内存草稿，尚未保存或发布`);
    return true;
  }, [message]);

  const cancelCompatibilityRecovery = useCallback(() => {
    const result = useTemplateEditorSession.getState().cancelCompatibilityRecovery();
    if (result.status === "restored") {
      message.success("本次修复已取消，已恢复原模板草稿；服务端内容未改变");
      return;
    }
    if (result.status === "source-invalid") {
      message.error("原模板草稿未通过当前结构校验，原始数据仍保留；可继续使用修复方案或查看错误");
    }
  }, [message]);

  const resumeCompatibilityRecovery = useCallback(() => {
    if (useTemplateEditorSession.getState().resumeCompatibilityRecovery()) {
      message.info("已返回修复方案，仍需明确是否覆盖当前模板草稿");
    }
  }, [message]);

  const discardChanges = useCallback(() => {
    const current = useTemplateEditorSession.getState();
    if (!current.draft || !current.dirty) return;
    if (!current.baseline) {
      message.warning("新模板还没有已保存草稿；如需丢弃，请使用“关闭模板会话”统一处理。");
      return;
    }
    const sessionId = current.sessionId;
    if (!current.restoreBaseline()) return;
    setReview(null);
    clearTemplateSessionGeometry(sessionId);
  }, [message]);

  const returnToPage = useCallback(() => {
    const current = useTemplateEditorSession.getState();
    if (current.saveStatus === "saving" || publishing || lifecycleBusy) {
      message.info(
        publishing
          ? "正在发布模板，请等待完成后再返回页面装修"
          : lifecycleBusy
            ? "正在更新模板状态，请等待完成后再返回页面装修"
            : "正在保存模板，请等待完成后再返回页面装修",
      );
      return;
    }
    useVisualEditorSession.getState().activateWorkspace("page");
    onReturnPage();
  }, [lifecycleBusy, message, onReturnPage, publishing]);

  return {
    active,
    canManageTemplates,
    localOnly,
    publishing,
    publishWorkflow,
    publishReview,
    publishIssueEditing,
    publishedDraftAvailability,
    publishedDraftCreation,
    openPublishReview,
    selectPublishIssue,
    editPublishIssue,
    lifecycleBusy,
    draft,
    selectedObjectLabel,
    dirty,
    hasBaseline,
    device,
    previewMode,
    previewScenario,
    saveStatus,
    setPreviewMode,
    sessionId,
    readWorkspaceScroll,
    updateWorkspaceScroll,
    enter,
    returnToPage,
    closeSession,
    openTarget,
    copyTarget,
    persist,
    persistForExit,
    publish,
    confirmPublish,
    cancelPublishReview,
    recheckPublishReview,
    retryPublishVerification,
    retryFailedPublish,
    retryCatalogRefresh: retryPublishCatalog,
    reloadPublishedDraft,
    createDraftFromPublished,
    usePublishedTemplateInPage,
    promoteFromPage,
    archive,
    restore,
    deleteDraft,
    listVersions,
    getVersion,
    stageVersion,
    cancelCompatibilityRecovery,
    resumeCompatibilityRecovery,
    discardChanges,
  };
}
