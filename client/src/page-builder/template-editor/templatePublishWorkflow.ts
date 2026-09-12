import {
  validateDynamicTemplatePublishDefinition,
  type DynamicTemplateValidationIssue,
} from "../template-definition/validateTemplateDefinition";
import type { TemplateDefinitionV2 } from "../template-definition/generated/templateDefinition.generated";
import type { TemplateProductionReviewFacts } from "./templateEditorSession";
import type { TemplateStressPreviewScenario } from "./templateStressPreviewEngine";
import type { TemplateEditorDraft, TemplateSaveStatus } from "./types";

export type DefinitionChecksum = string & { readonly __definitionChecksum: unique symbol };

export type PublishFailureCategory =
  | "permission"
  | "conflict"
  | "network"
  | "timeout"
  | "server"
  | "malformed-response"
  | "rejected"
  | "unknown";

export interface PublishFailure {
  category: PublishFailureCategory;
  code?: string;
  status?: number;
}

export interface LivePublishContext {
  sessionId: string;
  templateId: string;
  semanticGeneration: number;
  targetVersion: number;
}

export interface ReviewedPublishSnapshot<Definition extends object = Record<string, unknown>>
  extends LivePublishContext {
  reviewedDefinition: Definition;
  reviewedVersionNote: string;
  baseline: ConfirmedSavedIdentity | null;
}

export interface PublishReviewIssue {
  code: string;
  blocking: boolean;
}

export type TemplateProductionReviewKey =
  | "desktop"
  | "mobile"
  | "page-scope"
  | `stress-preview:${TemplateStressPreviewScenario}`;

export interface TemplateProductionReviewIssue extends PublishReviewIssue {
  key: TemplateProductionReviewKey;
  path: string;
  message: string;
}

export interface TemplateProductionReadiness {
  validation: ReturnType<typeof validateDynamicTemplatePublishDefinition>;
  identityReady: boolean;
  regionCount: number;
  isBlank: boolean;
  pageFieldCount: number;
  layoutGroupCount: number;
  organizationReady: boolean;
  responsiveIssueCount: number;
  scopeIssueCount: number;
  errorCount: number;
  warningCount: number;
  desktopReviewed: boolean;
  mobileReviewed: boolean;
  pageScopeReviewed: boolean;
  reviewedStressScenarioCount: number;
  stressPreviewReady: boolean;
  operatorReviewReady: boolean;
  operatorReviewIssues: readonly TemplateProductionReviewIssue[];
  machineReady: boolean;
  saved: boolean;
  reviewCanSubmit: boolean;
  publishReady: boolean;
}

export type TemplatePersistenceDisplayState =
  | "none"
  | "unpersisted"
  | "clean"
  | "dirty"
  | "saving"
  | "failed";

export interface TemplatePersistencePresentation {
  state: TemplatePersistenceDisplayState;
  label: string;
  ariaLabel: string;
  saved: boolean;
}

const SAVE_FAILURES: readonly TemplateSaveStatus[] = [
  "error",
  "permission-error",
  "conflict",
  "publish-error",
];

/**
 * 编辑器 baseline 只表示“可以恢复到打开时的内容”，不能证明服务端已有草稿。
 * 所有保存状态文案都必须经过这里，避免兼容来源同时显示“待保存”和“草稿已保存”。
 */
export function deriveTemplatePersistencePresentation({
  draft,
  localOnly,
  hasBaseline,
  dirty,
  saveStatus,
}: {
  draft: TemplateEditorDraft | null;
  localOnly: boolean;
  hasBaseline: boolean;
  dirty: boolean;
  saveStatus: TemplateSaveStatus;
}): TemplatePersistencePresentation {
  if (!draft) {
    return {
      state: "none",
      label: "未选择模板",
      ariaLabel: "模板状态：未选择模板",
      saved: false,
    };
  }
  if (saveStatus === "saving") {
    return {
      state: "saving",
      label: "正在保存",
      ariaLabel: "模板状态：正在保存模板",
      saved: false,
    };
  }
  if (saveStatus === "error") {
    return {
      state: "failed",
      label: "保存未完成，输入仍保留",
      ariaLabel: "模板状态：保存失败，修改仍在，可以重试",
      saved: false,
    };
  }
  if (saveStatus === "permission-error") {
    return {
      state: "failed",
      label: "保存权限不足，输入仍保留",
      ariaLabel: "模板状态：保存权限不足，修改仍在，可以重试",
      saved: false,
    };
  }
  if (saveStatus === "conflict") {
    return {
      state: "failed",
      label: "保存冲突，输入仍保留",
      ariaLabel: "模板状态：保存冲突，修改仍在，请重新打开同一模板处理冲突",
      saved: false,
    };
  }
  if (dirty) {
    return {
      state: "dirty",
      label: "有未保存修改",
      ariaLabel: "模板状态：有未保存修改",
      saved: false,
    };
  }
  if (localOnly) {
    if (hasBaseline) {
      return {
        state: "clean",
        label: "本机草稿已保存",
        ariaLabel: "模板状态：本机测试草稿已保存",
        saved: true,
      };
    }
    return {
      state: "unpersisted",
      label: "尚未建立本机草稿",
      ariaLabel: "模板状态：尚未建立本机测试草稿",
      saved: false,
    };
  }
  if (draft.sourceType === "persisted" && draft.remote) {
    return {
      state: "clean",
      label: "服务端草稿已保存",
      ariaLabel: "模板状态：服务端草稿已保存",
      saved: true,
    };
  }
  return {
    state: "unpersisted",
    label: "尚未建立服务端草稿",
    ariaLabel: "模板状态：尚未建立服务端草稿",
    saved: false,
  };
}

const STRESS_PREVIEW_LABELS: Record<TemplateStressPreviewScenario, string> = {
  "short-text": "短文字与中性内容",
  "long-text": "超长文字与换行",
  "optional-missing": "可选内容缺失",
  "required-missing": "必填内容缺失",
  "media-ratios": "不同媒体比例",
};

const PRODUCTION_STRESS_REVIEW_SCENARIOS = [
  "short-text",
  "long-text",
  "optional-missing",
  "required-missing",
  "media-ratios",
] as const satisfies readonly TemplateStressPreviewScenario[];

function createProductionReviewIssue(
  key: TemplateProductionReviewKey,
  message: string,
): TemplateProductionReviewIssue {
  return {
    key,
    code: `PRODUCTION_REVIEW_REQUIRED:${key}`,
    path: `productionReview.${key}`,
    message,
    blocking: false,
  };
}

function countReachablePageFields(definition: TemplateDefinitionV2) {
  const visitedNodes = new Set<string>();
  const visitedSlots = new Set<string>();
  const visit = (nodeId: string) => {
    if (visitedNodes.has(nodeId)) return;
    visitedNodes.add(nodeId);
    const node = definition.nodes[nodeId];
    if (!node) return;
    if (node.slotId && definition.slots[node.slotId]) visitedSlots.add(node.slotId);
    node.childIds.forEach(visit);
  };
  visit(definition.rootNodeId);
  return visitedSlots.size;
}

function isPageScopeIssue(issue: DynamicTemplateValidationIssue) {
  return /^slots\.[^.]+\.(?:label|required|editable|hideable|validation(?:\.|$))/.test(issue.path);
}

function isResponsiveIssue(issue: DynamicTemplateValidationIssue) {
  return /\.responsive\.(?:desktop|mobile)\./.test(issue.path)
    || /\.(?:desktopRules|mobileRules)\./.test(issue.path);
}

function deriveTemplateIdentityValidation(definition: TemplateDefinitionV2) {
  const nameReady = definition.name.trim().length > 0
    && definition.name.trim() !== "未命名模板";
  const issues: DynamicTemplateValidationIssue[] = [];
  if (!nameReady) {
    issues.push({
      level: "error",
      code: "PUBLISH_REQUIRES_TEMPLATE_NAME",
      path: "name",
      message: "请打开“模板设置”，填写模板名称后再发布。",
    });
  }
  return { ready: nameReady, issues };
}

/**
 * 模板制作向导、顶部发布入口与发布状态机共享的唯一就绪投影。
 * 人工核对事实来自当前编辑 session，不进入定义、历史或发布 payload。
 */
export function deriveTemplateProductionReadiness({
  definition,
  reviewFacts,
  hasBaseline,
  dirty,
  saveStatus,
}: {
  definition: TemplateDefinitionV2;
  reviewFacts: TemplateProductionReviewFacts;
  hasBaseline: boolean;
  dirty: boolean;
  saveStatus: TemplateSaveStatus;
}): TemplateProductionReadiness {
  const root = definition.nodes[definition.rootNodeId];
  const regionCount = root?.childIds.length ?? 0;
  const pageFieldCount = countReachablePageFields(definition);
  const layoutGroupCount = Object.values(definition.nodes).filter((node) => (
    node.nodeId !== definition.rootNodeId && ["Stack", "Row", "Grid"].includes(node.type)
  )).length;
  const baseValidation = validateDynamicTemplatePublishDefinition(definition);
  const identityValidation = deriveTemplateIdentityValidation(definition);
  const identityIssuePaths = new Set(identityValidation.issues.map((issue) => issue.path));
  const validation = identityValidation.ready
    ? baseValidation
    : {
        ...baseValidation,
        valid: false,
        issues: [
          ...baseValidation.issues.filter((issue) => (
            issue.level !== "error" || !identityIssuePaths.has(issue.path)
          )),
          ...identityValidation.issues,
        ],
      };
  const errorCount = validation.issues.filter((issue) => issue.level === "error").length;
  const warningCount = validation.issues.filter((issue) => issue.level === "warning").length;
  const scopeIssueCount = validation.issues.filter((issue) => issue.level === "error" && isPageScopeIssue(issue)).length;
  const responsiveIssueCount = validation.issues.filter((issue) => issue.level === "error" && isResponsiveIssue(issue)).length;
  const identityReady = identityValidation.ready;
  // 真实字段在定义中只能位于合法内容容器下；显式 Row / Grid / Stack 是
  // 可选的复杂构图能力，不应成为单槽位模板或成熟整块模板的发布前置条件。
  const organizationReady = pageFieldCount > 0;
  const reviewedStressScenarioCount = PRODUCTION_STRESS_REVIEW_SCENARIOS.filter(
    (scenario) => reviewFacts.stressPreview[scenario],
  ).length;
  const stressPreviewReady = reviewedStressScenarioCount === PRODUCTION_STRESS_REVIEW_SCENARIOS.length;
  const operatorReviewIssues: TemplateProductionReviewIssue[] = [];
  if (!reviewFacts.desktop) {
    operatorReviewIssues.push(createProductionReviewIssue(
      "desktop",
      "发布前需明确核对桌面端布局。",
    ));
  }
  if (!reviewFacts.mobile) {
    operatorReviewIssues.push(createProductionReviewIssue(
      "mobile",
      "发布前需明确核对移动端布局。",
    ));
  }
  if (!reviewFacts.pageScope) {
    operatorReviewIssues.push(createProductionReviewIssue(
      "page-scope",
      "发布前需明确核对页面开放范围。",
    ));
  }
  for (const scenario of PRODUCTION_STRESS_REVIEW_SCENARIOS) {
    if (reviewFacts.stressPreview[scenario]) continue;
    operatorReviewIssues.push(createProductionReviewIssue(
      `stress-preview:${scenario}`,
      `发布前需明确核对压力预览：${STRESS_PREVIEW_LABELS[scenario]}。`,
    ));
  }
  const machineReady = identityReady
    && regionCount > 0
    && organizationReady
    && responsiveIssueCount === 0
    && scopeIssueCount === 0
    && errorCount === 0;
  const operatorReviewReady = operatorReviewIssues.length === 0;
  const saved = hasBaseline && !dirty && !SAVE_FAILURES.includes(saveStatus);
  const reviewCanSubmit = machineReady;
  return {
    validation,
    identityReady,
    regionCount,
    isBlank: regionCount === 0,
    pageFieldCount,
    layoutGroupCount,
    organizationReady,
    responsiveIssueCount,
    scopeIssueCount,
    errorCount,
    warningCount,
    desktopReviewed: reviewFacts.desktop,
    mobileReviewed: reviewFacts.mobile,
    pageScopeReviewed: reviewFacts.pageScope,
    reviewedStressScenarioCount,
    stressPreviewReady,
    operatorReviewReady,
    operatorReviewIssues,
    machineReady,
    saved,
    reviewCanSubmit,
    publishReady: reviewCanSubmit && saved,
  };
}

export function toProductionReviewValidationIssue(
  issue: TemplateProductionReviewIssue,
): DynamicTemplateValidationIssue {
  return {
    level: issue.blocking ? "error" : "info",
    code: issue.code,
    path: issue.path,
    message: issue.message,
  };
}

export interface OperationIdentity extends LivePublishContext {
  operationId: string;
  baselineRevision: number | null;
  baselineChecksum: DefinitionChecksum | null;
  versionNote: string;
}

export interface ConfirmedSavedIdentity {
  revision: number;
  checksum: DefinitionChecksum;
}

export interface StrictPublishPayload {
  expectedRevision: number;
  expectedChecksum: DefinitionChecksum;
  targetVersion: number;
  versionNote?: string;
}

export interface PublishedTemplateFact {
  templateId: string;
  version: number;
  checksum: DefinitionChecksum;
  outcome: "published" | "already-published";
}

export interface EditingPublishState {
  status: "editing";
  context: LivePublishContext;
}

interface ReviewStateBase<Definition extends object> {
  snapshot: ReviewedPublishSnapshot<Definition>;
  issues: readonly PublishReviewIssue[];
  lastFailure?: PublishFailure;
}

export interface ReviewBlockedState<Definition extends object> extends ReviewStateBase<Definition> {
  status: "review-blocked";
}

export interface ReviewReadyState<Definition extends object> extends ReviewStateBase<Definition> {
  status: "review-ready";
}

export interface ReviewStaleState<Definition extends object> extends ReviewStateBase<Definition> {
  status: "review-stale";
  staleReason: string;
}

interface OperationStateBase<Definition extends object> extends ReviewStateBase<Definition> {
  operation: OperationIdentity;
  currentInputChanged: boolean;
  staleReason?: string;
}

export interface SavingReviewedSnapshotState<Definition extends object>
  extends OperationStateBase<Definition> {
  status: "saving-reviewed-snapshot";
}

export interface PublishingReviewedSnapshotState<Definition extends object>
  extends OperationStateBase<Definition> {
  status: "publishing";
  saved: ConfirmedSavedIdentity;
}

export interface VerifyingUncertainState<Definition extends object>
  extends OperationStateBase<Definition> {
  status: "verifying-uncertain";
  scope: "save" | "publish";
  saved?: ConfirmedSavedIdentity;
  lastFailure: PublishFailure;
}

export interface PublishedWorkflowState<Definition extends object>
  extends OperationStateBase<Definition> {
  status: "published";
  saved: ConfirmedSavedIdentity;
  published: PublishedTemplateFact;
  catalogStatus: "refreshing" | "fresh";
}

export interface PartialFailureState<Definition extends object>
  extends OperationStateBase<Definition> {
  status: "partial-failure";
  reason:
    | "draft-save-verification-conflict"
    | "draft-saved-template-unpublished"
    | "template-published-catalog-stale";
  saved?: ConfirmedSavedIdentity;
  published?: PublishedTemplateFact;
  failure: PublishFailure;
}

export type PublishWorkflowState<Definition extends object = Record<string, unknown>> =
  | EditingPublishState
  | ReviewBlockedState<Definition>
  | ReviewReadyState<Definition>
  | ReviewStaleState<Definition>
  | SavingReviewedSnapshotState<Definition>
  | PublishingReviewedSnapshotState<Definition>
  | VerifyingUncertainState<Definition>
  | PublishedWorkflowState<Definition>
  | PartialFailureState<Definition>;

export interface SaveReviewedSnapshotEffect<Definition extends object> {
  kind: "save-reviewed-snapshot";
  operation: OperationIdentity;
  templateId: string;
  mode: "create" | "update";
  expectedRevision: number | null;
  definition: Definition;
  versionNote: string;
}

export interface PublishReviewedSnapshotEffect {
  kind: "publish-reviewed-snapshot";
  operation: OperationIdentity;
  templateId: string;
  payload: StrictPublishPayload;
}

export interface VerifySavedDraftEffect {
  kind: "verify-saved-draft";
  operation: OperationIdentity;
  templateId: string;
  baselineRevision: number | null;
  baselineChecksum: DefinitionChecksum | null;
}

export interface VerifyPublishedVersionEffect {
  kind: "verify-published-version";
  operation: OperationIdentity;
  templateId: string;
  targetVersion: number;
  expectedChecksum: DefinitionChecksum;
}

export interface RefreshTemplateCatalogEffect {
  kind: "refresh-template-catalog";
  operation: OperationIdentity;
  templateId: string;
  version: number;
  checksum: DefinitionChecksum;
}

export type PublishWorkflowEffect<Definition extends object = Record<string, unknown>> =
  | SaveReviewedSnapshotEffect<Definition>
  | PublishReviewedSnapshotEffect
  | VerifySavedDraftEffect
  | VerifyPublishedVersionEffect
  | RefreshTemplateCatalogEffect;

export interface PublishWorkflowTransition<Definition extends object = Record<string, unknown>> {
  state: PublishWorkflowState<Definition>;
  effects: readonly PublishWorkflowEffect<Definition>[];
}

export type PublishReviewChange =
  | { kind: "definition" | "version-note" | "template-identity" | "target-version" | "semantic-generation" }
  | { kind: "selection" | "scope" | "device" | "zoom" | "scroll" | "focus" | "stress-preview" };

interface OperationEvent {
  operation: OperationIdentity;
  live: LivePublishContext;
}

const UNCERTAIN_FAILURES = new Set<PublishFailureCategory>([
  "network",
  "timeout",
  "server",
  "malformed-response",
  "unknown",
]);

export function asDefinitionChecksum(value: string): DefinitionChecksum {
  if (!isDefinitionChecksum(value)) {
    throw new Error("definition checksum must be a 64-character lowercase SHA-256 value");
  }
  return value as DefinitionChecksum;
}

function isDefinitionChecksum(value: unknown): value is DefinitionChecksum {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}

function unchanged<Definition extends object>(
  state: PublishWorkflowState<Definition>,
): PublishWorkflowTransition<Definition> {
  return { state, effects: [] };
}

function hasSnapshot<Definition extends object>(
  state: PublishWorkflowState<Definition>,
): state is Exclude<PublishWorkflowState<Definition>, EditingPublishState> {
  return state.status !== "editing";
}

function hasOperation<Definition extends object>(
  state: PublishWorkflowState<Definition>,
): state is
  | SavingReviewedSnapshotState<Definition>
  | PublishingReviewedSnapshotState<Definition>
  | VerifyingUncertainState<Definition>
  | PublishedWorkflowState<Definition>
  | PartialFailureState<Definition> {
  return "operation" in state;
}

function sameOperation(left: OperationIdentity, right: OperationIdentity): boolean {
  return left.operationId === right.operationId
    && left.sessionId === right.sessionId
    && left.templateId === right.templateId
    && left.semanticGeneration === right.semanticGeneration
    && left.targetVersion === right.targetVersion
    && left.baselineChecksum === right.baselineChecksum
    && left.baselineRevision === right.baselineRevision
    && left.versionNote === right.versionNote;
}

function normalizeReviewedVersionNote(value: string): string {
  return value.trim();
}

export function matchesReviewedVersionNote(observed: unknown, expected: string): boolean {
  return (observed === null || typeof observed === "string")
    && normalizeReviewedVersionNote(observed ?? "") === normalizeReviewedVersionNote(expected);
}

function sameLiveIdentity(
  snapshot: ReviewedPublishSnapshot<object>,
  live: LivePublishContext,
): boolean {
  return snapshot.sessionId === live.sessionId
    && snapshot.templateId === live.templateId
    && snapshot.semanticGeneration === live.semanticGeneration
    && snapshot.targetVersion === live.targetVersion;
}

function acceptsOperationEvent<Definition extends object>(
  state: PublishWorkflowState<Definition>,
  event: OperationEvent,
): boolean {
  if (!hasOperation(state) || !sameOperation(state.operation, event.operation)) return false;
  if (
    state.snapshot.sessionId !== event.live.sessionId
    || state.snapshot.templateId !== event.live.templateId
    || state.snapshot.targetVersion !== event.live.targetVersion
  ) return false;
  return true;
}

function operationFor<Definition extends object>(
  snapshot: ReviewedPublishSnapshot<Definition>,
  operationId: string,
): OperationIdentity {
  if (!operationId.trim()) throw new Error("operationId is required");
  return {
    operationId,
    sessionId: snapshot.sessionId,
    templateId: snapshot.templateId,
    semanticGeneration: snapshot.semanticGeneration,
    targetVersion: snapshot.targetVersion,
    baselineChecksum: snapshot.baseline?.checksum ?? null,
    baselineRevision: snapshot.baseline?.revision ?? null,
    versionNote: normalizeReviewedVersionNote(snapshot.reviewedVersionNote),
  };
}

function saveEffect<Definition extends object>(
  snapshot: ReviewedPublishSnapshot<Definition>,
  operation: OperationIdentity,
): SaveReviewedSnapshotEffect<Definition> {
  return {
    kind: "save-reviewed-snapshot",
    operation,
    templateId: snapshot.templateId,
    mode: snapshot.baseline ? "update" : "create",
    expectedRevision: snapshot.baseline?.revision ?? null,
    definition: snapshot.reviewedDefinition,
    versionNote: snapshot.reviewedVersionNote,
  };
}

function verifyEffect<Definition extends object>(
  state: VerifyingUncertainState<Definition>,
): VerifySavedDraftEffect | VerifyPublishedVersionEffect {
  if (state.scope === "save") {
    return {
      kind: "verify-saved-draft",
      operation: state.operation,
      templateId: state.snapshot.templateId,
      baselineRevision: state.operation.baselineRevision,
      baselineChecksum: state.operation.baselineChecksum,
    };
  }
  if (!state.saved) throw new Error("saved draft identity is required for publish verification");
  return {
    kind: "verify-published-version",
    operation: state.operation,
    templateId: state.snapshot.templateId,
    targetVersion: state.snapshot.targetVersion,
    expectedChecksum: state.saved.checksum,
  };
}

function publishEffect<Definition extends object>(
  state: PublishingReviewedSnapshotState<Definition>,
): PublishReviewedSnapshotEffect {
  return {
    kind: "publish-reviewed-snapshot",
    operation: state.operation,
    templateId: state.snapshot.templateId,
    payload: buildStrictPublishPayload(state.snapshot, state.saved),
  };
}

function catalogEffect<Definition extends object>(
  state: PublishedWorkflowState<Definition> | PartialFailureState<Definition>,
): RefreshTemplateCatalogEffect {
  if (!state.published) throw new Error("published template fact is required");
  return {
    kind: "refresh-template-catalog",
    operation: state.operation,
    templateId: state.published.templateId,
    version: state.published.version,
    checksum: state.published.checksum,
  };
}

function staleState<Definition extends object>(
  state: Exclude<PublishWorkflowState<Definition>, EditingPublishState>,
  reason: string,
): ReviewStaleState<Definition> {
  return {
    status: "review-stale",
    snapshot: state.snapshot,
    issues: state.issues,
    staleReason: reason,
    ...(state.lastFailure ? { lastFailure: state.lastFailure } : {}),
  };
}

function draftSavedPartialFailure<Definition extends object>(
  state: OperationStateBase<Definition>,
  saved: ConfirmedSavedIdentity | undefined,
  failure: PublishFailure,
): PartialFailureState<Definition> {
  return {
    status: "partial-failure",
    snapshot: state.snapshot,
    issues: state.issues,
    operation: state.operation,
    currentInputChanged: state.currentInputChanged,
    ...(state.staleReason ? { staleReason: state.staleReason } : {}),
    reason: "draft-saved-template-unpublished",
    ...(saved ? { saved } : {}),
    failure,
  };
}

function publishedTransition<Definition extends object>(
  state: PublishingReviewedSnapshotState<Definition> | VerifyingUncertainState<Definition>,
  fact: PublishedTemplateFact,
): PublishWorkflowTransition<Definition> {
  if (!state.saved) return unchanged(state);
  const published: PublishedWorkflowState<Definition> = {
    status: "published",
    snapshot: state.snapshot,
    issues: state.issues,
    operation: state.operation,
    currentInputChanged: state.currentInputChanged,
    ...(state.staleReason ? { staleReason: state.staleReason } : {}),
    saved: state.saved,
    published: fact,
    catalogStatus: "refreshing",
  };
  return { state: published, effects: [catalogEffect(published)] };
}

export function openPublishReview<Definition extends object>(input: {
  sessionId: string;
  templateId: string;
  semanticGeneration: number;
  targetVersion: number;
  reviewedDefinition: Definition;
  reviewedVersionNote: string;
  baseline: ConfirmedSavedIdentity | null;
  issues: readonly PublishReviewIssue[];
}): PublishWorkflowTransition<Definition> {
  const snapshot = deepFreeze({
    sessionId: input.sessionId,
    templateId: input.templateId,
    semanticGeneration: input.semanticGeneration,
    targetVersion: input.targetVersion,
    reviewedDefinition: structuredClone(input.reviewedDefinition),
    reviewedVersionNote: normalizeReviewedVersionNote(input.reviewedVersionNote),
    baseline: input.baseline ? { ...input.baseline } : null,
  });
  const issues = deepFreeze(structuredClone([...input.issues]));
  return {
    state: issues.some((issue) => issue.blocking)
      ? { status: "review-blocked", snapshot, issues }
      : { status: "review-ready", snapshot, issues },
    effects: [],
  };
}

export function markPublishReviewStale<Definition extends object>(
  state: PublishWorkflowState<Definition>,
  reason: string,
): PublishWorkflowTransition<Definition> {
  if (!hasSnapshot(state)) return unchanged(state);
  return { state: staleState(state, reason), effects: [] };
}

export function markPublishReviewChanged<Definition extends object>(
  state: PublishWorkflowState<Definition>,
  change: PublishReviewChange,
): PublishWorkflowTransition<Definition> {
  if (["selection", "scope", "device", "zoom", "scroll", "focus", "stress-preview"].includes(change.kind)) {
    return unchanged(state);
  }
  if (!hasSnapshot(state) || state.status === "review-stale") return unchanged(state);
  if (hasOperation(state)) {
    return {
      state: { ...state, currentInputChanged: true, staleReason: change.kind },
      effects: [],
    };
  }
  return { state: staleState(state, change.kind), effects: [] };
}

export function beginReviewedSnapshotSave<Definition extends object>(
  state: PublishWorkflowState<Definition>,
  operationId: string,
): PublishWorkflowTransition<Definition> {
  if (state.status !== "review-ready") return unchanged(state);
  const operation = operationFor(state.snapshot, operationId);
  const saving: SavingReviewedSnapshotState<Definition> = {
    status: "saving-reviewed-snapshot",
    snapshot: state.snapshot,
    issues: state.issues,
    operation,
    currentInputChanged: false,
  };
  return { state: saving, effects: [saveEffect(saving.snapshot, operation)] };
}

export function buildStrictPublishPayload<Definition extends object>(
  snapshot: ReviewedPublishSnapshot<Definition>,
  saved: ConfirmedSavedIdentity,
): StrictPublishPayload {
  if (!Number.isInteger(saved.revision) || saved.revision <= 0) {
    throw new Error("confirmed saved revision must be a positive integer");
  }
  if (!isDefinitionChecksum(saved.checksum)) {
    throw new Error("confirmed saved checksum must be a 64-character lowercase SHA-256 value");
  }
  return {
    expectedRevision: saved.revision,
    expectedChecksum: saved.checksum,
    targetVersion: snapshot.targetVersion,
    ...(snapshot.reviewedVersionNote ? { versionNote: snapshot.reviewedVersionNote } : {}),
  };
}

export function beginReviewedSnapshotPublish<Definition extends object>(
  state: SavingReviewedSnapshotState<Definition>,
  event: OperationEvent & { savedRevision: number; savedChecksum: string },
): PublishWorkflowTransition<Definition> {
  if (!acceptsOperationEvent(state, event)) return unchanged(state);
  if (
    !Number.isInteger(event.savedRevision)
    || event.savedRevision <= 0
    || !isDefinitionChecksum(event.savedChecksum)
  ) {
    const verifying: VerifyingUncertainState<Definition> = {
      ...state,
      status: "verifying-uncertain",
      scope: "save",
      lastFailure: { category: "malformed-response" },
    };
    return { state: verifying, effects: [verifyEffect(verifying)] };
  }
  const saved = { revision: event.savedRevision, checksum: event.savedChecksum };
  if (state.currentInputChanged || !sameLiveIdentity(state.snapshot, event.live)) {
    const changedState = {
      ...state,
      currentInputChanged: true,
      staleReason: state.staleReason ?? "semantic-generation",
    };
    return {
      state: draftSavedPartialFailure(
        changedState,
        saved,
        { category: "conflict", code: "REVIEW_STALE_AFTER_SAVE" },
      ),
      effects: [],
    };
  }
  const publishing: PublishingReviewedSnapshotState<Definition> = {
    ...state,
    status: "publishing",
    saved,
  };
  return { state: publishing, effects: [publishEffect(publishing)] };
}

export function saveReviewedSnapshotFailed<Definition extends object>(
  state: SavingReviewedSnapshotState<Definition>,
  event: OperationEvent & { failure: PublishFailure },
): PublishWorkflowTransition<Definition> {
  if (!acceptsOperationEvent(state, event)) return unchanged(state);
  const sourceState = sameLiveIdentity(state.snapshot, event.live)
    ? state
    : { ...state, currentInputChanged: true, staleReason: state.staleReason ?? "semantic-generation" };
  if (UNCERTAIN_FAILURES.has(event.failure.category)) {
    const verifying: VerifyingUncertainState<Definition> = {
      ...sourceState,
      status: "verifying-uncertain",
      scope: "save",
      lastFailure: event.failure,
    };
    return { state: verifying, effects: [verifyEffect(verifying)] };
  }
  if (sourceState.currentInputChanged) {
    return {
      state: staleState(sourceState, sourceState.staleReason ?? "save-failed-after-change"),
      effects: [],
    };
  }
  return {
    state: {
      status: "review-ready",
      snapshot: state.snapshot,
      issues: state.issues,
      lastFailure: event.failure,
    },
    effects: [],
  };
}

export function publishReviewedSnapshotFailed<Definition extends object>(
  state: PublishingReviewedSnapshotState<Definition>,
  event: OperationEvent & { failure: PublishFailure },
): PublishWorkflowTransition<Definition> {
  if (!acceptsOperationEvent(state, event)) return unchanged(state);
  const sourceState = sameLiveIdentity(state.snapshot, event.live)
    ? state
    : { ...state, currentInputChanged: true, staleReason: state.staleReason ?? "semantic-generation" };
  if (UNCERTAIN_FAILURES.has(event.failure.category)) {
    const verifying: VerifyingUncertainState<Definition> = {
      ...sourceState,
      status: "verifying-uncertain",
      scope: "publish",
      lastFailure: event.failure,
    };
    return { state: verifying, effects: [verifyEffect(verifying)] };
  }
  return {
    state: draftSavedPartialFailure(sourceState, state.saved, event.failure),
    effects: [],
  };
}

export function publishReviewedSnapshotSucceeded<Definition extends object>(
  state: PublishingReviewedSnapshotState<Definition>,
  event: OperationEvent & PublishedTemplateFact,
): PublishWorkflowTransition<Definition> {
  if (!acceptsOperationEvent(state, event)) return unchanged(state);
  if (
    event.templateId !== state.snapshot.templateId
    || event.version !== state.snapshot.targetVersion
    || event.checksum !== state.saved.checksum
  ) {
    const verifying: VerifyingUncertainState<Definition> = {
      ...state,
      status: "verifying-uncertain",
      scope: "publish",
      lastFailure: { category: "malformed-response" },
    };
    return { state: verifying, effects: [verifyEffect(verifying)] };
  }
  const sourceState = sameLiveIdentity(state.snapshot, event.live)
    ? state
    : { ...state, currentInputChanged: true, staleReason: state.staleReason ?? "semantic-generation" };
  return publishedTransition(sourceState, {
    templateId: event.templateId,
    version: event.version,
    checksum: event.checksum,
    outcome: event.outcome,
  });
}

export function saveVerificationMatched<Definition extends object>(
  state: PublishWorkflowState<Definition>,
  event: OperationEvent & { savedRevision: number; savedChecksum: string },
): PublishWorkflowTransition<Definition> {
  if (
    state.status !== "verifying-uncertain"
    || state.scope !== "save"
    || !acceptsOperationEvent(state, event)
  ) return unchanged(state);
  if (
    !Number.isInteger(event.savedRevision)
    || event.savedRevision <= 0
    || !isDefinitionChecksum(event.savedChecksum)
  ) {
    return {
      state: { ...state, lastFailure: { category: "malformed-response" } },
      effects: [],
    };
  }
  const saving: SavingReviewedSnapshotState<Definition> = {
    status: "saving-reviewed-snapshot",
    snapshot: state.snapshot,
    issues: state.issues,
    operation: state.operation,
    currentInputChanged: state.currentInputChanged,
    ...(state.staleReason ? { staleReason: state.staleReason } : {}),
  };
  return beginReviewedSnapshotPublish(saving, {
    operation: event.operation,
    savedRevision: event.savedRevision,
    savedChecksum: event.savedChecksum,
    live: event.live,
  });
}

export function saveVerificationMismatched<Definition extends object>(
  state: PublishWorkflowState<Definition>,
  event: OperationEvent & { observedRevision?: number; observedChecksum?: string },
): PublishWorkflowTransition<Definition> {
  if (
    state.status !== "verifying-uncertain"
    || state.scope !== "save"
    || !acceptsOperationEvent(state, event)
  ) return unchanged(state);
  const sourceState = sameLiveIdentity(state.snapshot, event.live)
    ? state
    : { ...state, currentInputChanged: true, staleReason: state.staleReason ?? "semantic-generation" };
  return {
    state: {
      status: "partial-failure",
      snapshot: sourceState.snapshot,
      issues: sourceState.issues,
      operation: sourceState.operation,
      currentInputChanged: sourceState.currentInputChanged,
      ...(sourceState.staleReason ? { staleReason: sourceState.staleReason } : {}),
      reason: "draft-save-verification-conflict",
      failure: { category: "conflict", code: "SAVE_VERIFICATION_MISMATCH" },
    },
    effects: [],
  };
}

export function saveVerificationNotFound<Definition extends object>(
  state: PublishWorkflowState<Definition>,
  event: OperationEvent,
): PublishWorkflowTransition<Definition> {
  if (
    state.status !== "verifying-uncertain"
    || state.scope !== "save"
    || !acceptsOperationEvent(state, event)
  ) return unchanged(state);
  if (state.currentInputChanged || !sameLiveIdentity(state.snapshot, event.live)) {
    return { state: staleState(state, state.staleReason ?? "save-verification-not-found-after-change"), effects: [] };
  }
  const saving: SavingReviewedSnapshotState<Definition> = {
    status: "saving-reviewed-snapshot",
    snapshot: state.snapshot,
    issues: state.issues,
    operation: state.operation,
    currentInputChanged: false,
  };
  return { state: saving, effects: [saveEffect(saving.snapshot, saving.operation)] };
}

export function publishedVersionVerificationMatched<Definition extends object>(
  state: PublishWorkflowState<Definition>,
  event: OperationEvent & PublishedTemplateFact,
): PublishWorkflowTransition<Definition> {
  if (
    state.status !== "verifying-uncertain"
    || state.scope !== "publish"
    || !state.saved
    || !acceptsOperationEvent(state, event)
  ) return unchanged(state);
  if (
    event.templateId !== state.snapshot.templateId
    || event.version !== state.snapshot.targetVersion
    || event.checksum !== state.saved.checksum
  ) {
    return publishedVersionVerificationMismatched(state, {
      operation: event.operation,
      observedChecksum: event.checksum,
      live: event.live,
    });
  }
  const sourceState = sameLiveIdentity(state.snapshot, event.live)
    ? state
    : { ...state, currentInputChanged: true, staleReason: state.staleReason ?? "semantic-generation" };
  return publishedTransition(sourceState, {
    templateId: event.templateId,
    version: event.version,
    checksum: event.checksum,
    outcome: event.outcome,
  });
}

export function publishedVersionVerificationMismatched<Definition extends object>(
  state: PublishWorkflowState<Definition>,
  event: OperationEvent & { observedChecksum?: string },
): PublishWorkflowTransition<Definition> {
  if (
    state.status !== "verifying-uncertain"
    || state.scope !== "publish"
    || !acceptsOperationEvent(state, event)
  ) return unchanged(state);
  const sourceState = sameLiveIdentity(state.snapshot, event.live)
    ? state
    : { ...state, currentInputChanged: true, staleReason: state.staleReason ?? "semantic-generation" };
  return {
    state: draftSavedPartialFailure(
      sourceState,
      state.saved,
      { category: "conflict", code: "PUBLISH_VERIFICATION_CHECKSUM_MISMATCH" },
    ),
    effects: [],
  };
}

export function publishedVersionVerificationNotFound<Definition extends object>(
  state: PublishWorkflowState<Definition>,
  event: OperationEvent,
): PublishWorkflowTransition<Definition> {
  if (
    state.status !== "verifying-uncertain"
    || state.scope !== "publish"
    || !state.saved
    || !acceptsOperationEvent(state, event)
  ) return unchanged(state);
  if (state.currentInputChanged || !sameLiveIdentity(state.snapshot, event.live)) {
    return { state: staleState(state, state.staleReason ?? "publish-verification-not-found-after-change"), effects: [] };
  }
  const publishing: PublishingReviewedSnapshotState<Definition> = {
    status: "publishing",
    snapshot: state.snapshot,
    issues: state.issues,
    operation: state.operation,
    currentInputChanged: false,
    saved: state.saved,
  };
  return { state: publishing, effects: [publishEffect(publishing)] };
}

export function verificationFailed<Definition extends object>(
  state: PublishWorkflowState<Definition>,
  event: OperationEvent & { failure: PublishFailure },
): PublishWorkflowTransition<Definition> {
  if (state.status !== "verifying-uncertain" || !acceptsOperationEvent(state, event)) return unchanged(state);
  return { state: { ...state, lastFailure: event.failure }, effects: [] };
}

export function retryVerification<Definition extends object>(
  state: PublishWorkflowState<Definition>,
): PublishWorkflowTransition<Definition> {
  if (state.status !== "verifying-uncertain") return unchanged(state);
  return { state, effects: [verifyEffect(state)] };
}

export function catalogRefreshSucceeded<Definition extends object>(
  state: PublishWorkflowState<Definition>,
  event: OperationEvent,
): PublishWorkflowTransition<Definition> {
  if (state.status !== "published" || !acceptsOperationEvent(state, event)) return unchanged(state);
  return { state: { ...state, catalogStatus: "fresh" }, effects: [] };
}

export function catalogRefreshFailed<Definition extends object>(
  state: PublishWorkflowState<Definition>,
  event: OperationEvent & { failure: PublishFailure },
): PublishWorkflowTransition<Definition> {
  if (state.status !== "published" || !acceptsOperationEvent(state, event)) return unchanged(state);
  return {
    state: {
      ...state,
      status: "partial-failure",
      reason: "template-published-catalog-stale",
      failure: event.failure,
    },
    effects: [],
  };
}

export function retryCatalogRefresh<Definition extends object>(
  state: PublishWorkflowState<Definition>,
): PublishWorkflowTransition<Definition> {
  if (
    state.status !== "partial-failure"
    || state.reason !== "template-published-catalog-stale"
    || !state.published
  ) return unchanged(state);
  return { state, effects: [catalogEffect(state)] };
}

export function resetPublishWorkflow(context: LivePublishContext): PublishWorkflowTransition {
  return { state: { status: "editing", context }, effects: [] };
}
