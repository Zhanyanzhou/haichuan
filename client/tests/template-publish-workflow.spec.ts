import { expect, test } from "@playwright/test";
import {
  asDefinitionChecksum,
  beginReviewedSnapshotPublish,
  beginReviewedSnapshotSave,
  buildStrictPublishPayload,
  catalogRefreshFailed,
  catalogRefreshSucceeded,
  deriveTemplateProductionReadiness,
  markPublishReviewChanged,
  openPublishReview,
  publishedVersionVerificationMatched,
  publishedVersionVerificationMismatched,
  publishedVersionVerificationNotFound,
  publishReviewedSnapshotFailed,
  publishReviewedSnapshotSucceeded,
  retryCatalogRefresh,
  retryVerification,
  resetPublishWorkflow,
  saveVerificationMatched,
  saveVerificationMismatched,
  saveVerificationNotFound,
  saveReviewedSnapshotFailed,
  verificationFailed,
  type LivePublishContext,
  type OperationIdentity,
  type PublishFailure,
  type PublishingReviewedSnapshotState,
  type PublishWorkflowState,
  type ReviewReadyState,
  type SavingReviewedSnapshotState,
} from "../src/page-builder/template-editor/templatePublishWorkflow";
import {
  addDynamicTemplateNode,
  createBlankDynamicTemplateDefinition,
  type TemplateDefinitionV2,
} from "../src/page-builder/template-definition";

const CHECKSUM_A = asDefinitionChecksum("a".repeat(64));
const CHECKSUM_B = asDefinitionChecksum("b".repeat(64));

function definition() {
  return {
    schemaVersion: 1,
    modelVersion: 2,
    templateId: "template-a",
    name: "工艺模板",
    metadata: { category: "craft", tags: ["fine"] },
    rootNodeId: "root",
    nodes: { root: { id: "root", type: "root", childIds: [] } },
    slots: {},
  };
}

function reviewInput(overrides: Partial<Parameters<typeof openPublishReview>[0]> = {}) {
  return {
    sessionId: "session-a",
    templateId: "template-a",
    semanticGeneration: 7,
    targetVersion: 3,
    reviewedDefinition: definition(),
    reviewedVersionNote: "third version",
    baseline: { revision: 11, checksum: CHECKSUM_A },
    issues: [],
    ...overrides,
  };
}

function live(overrides: Partial<LivePublishContext> = {}): LivePublishContext {
  return {
    sessionId: "session-a",
    templateId: "template-a",
    semanticGeneration: 7,
    targetVersion: 3,
    ...overrides,
  };
}

function readyState(): ReviewReadyState<Record<string, unknown>> {
  const result = openPublishReview(reviewInput());
  expect(result.state.status).toBe("review-ready");
  return result.state as ReviewReadyState<Record<string, unknown>>;
}

function savingState() {
  const result = beginReviewedSnapshotSave(readyState(), "operation-a");
  expect(result.state.status).toBe("saving-reviewed-snapshot");
  return result.state as SavingReviewedSnapshotState<Record<string, unknown>>;
}

function publishingState(): PublishingReviewedSnapshotState<Record<string, unknown>> {
  const saving = savingState();
  const result = beginReviewedSnapshotPublish(saving, {
    operation: saving.operation,
    savedRevision: 12,
    savedChecksum: CHECKSUM_A,
    live: live(),
  });
  expect(result.state.status).toBe("publishing");
  return result.state as PublishingReviewedSnapshotState<Record<string, unknown>>;
}

function expectIgnored<T extends PublishWorkflowState<Record<string, unknown>>>(
  before: T,
  result: { state: PublishWorkflowState<Record<string, unknown>>; effects: readonly unknown[] },
) {
  expect(result.state).toBe(before);
  expect(result.effects).toEqual([]);
}

test("open review is a zero-effect calculation and reports ready or blocked", () => {
    const ready = openPublishReview(reviewInput());
    const blocked = openPublishReview(reviewInput({
      issues: [{ code: "invalid-structure", blocking: true }],
    }));

    expect(ready.state.status).toBe("review-ready");
    expect(blocked.state.status).toBe("review-blocked");
    expect(ready.effects).toEqual([]);
    expect(blocked.effects).toEqual([]);
  });

  test("production readiness keeps optional review facts without blocking publication", () => {
    const productionDefinition = {
      ...definition(),
      metadata: { ...definition().metadata, purpose: "发布核对投影测试" },
    } as unknown as TemplateDefinitionV2;
    const missingFacts = {
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
    const blocked = deriveTemplateProductionReadiness({
      definition: productionDefinition,
      reviewFacts: missingFacts,
      hasBaseline: true,
      dirty: false,
      saveStatus: "success",
    });

    expect(blocked.operatorReviewReady).toBe(false);
    expect(blocked.operatorReviewIssues).toHaveLength(8);
    expect(blocked.operatorReviewIssues.map((issue) => issue.key)).toEqual([
      "desktop",
      "mobile",
      "page-scope",
      "stress-preview:short-text",
      "stress-preview:long-text",
      "stress-preview:optional-missing",
      "stress-preview:required-missing",
      "stress-preview:media-ratios",
    ]);
    expect(blocked.operatorReviewIssues.every((issue) => !issue.blocking)).toBe(true);
    expect(blocked.reviewCanSubmit).toBe(blocked.machineReady);
    expect(blocked.publishReady).toBe(blocked.machineReady);

    const reviewed = deriveTemplateProductionReadiness({
      definition: productionDefinition,
      reviewFacts: {
        desktop: true,
        mobile: true,
        pageScope: true,
        stressPreview: {
          "short-text": true,
          "long-text": true,
          "optional-missing": true,
          "required-missing": true,
          "media-ratios": true,
        },
      },
      hasBaseline: true,
      dirty: false,
      saveStatus: "success",
    });
    expect(reviewed.operatorReviewReady).toBe(true);
    expect(reviewed.operatorReviewIssues).toEqual([]);
    expect(reviewed.reviewCanSubmit).toBe(reviewed.machineReady);
    expect(reviewed.publishReady).toBe(reviewed.machineReady);
  });

  test("a mature template slot directly inside a content region is already organized", () => {
    const blank = createBlankDynamicTemplateDefinition("首屏母模板");
    blank.metadata.purpose = "验证成熟模板使用统一发布门禁";
    const region = addDynamicTemplateNode(blank, blank.rootNodeId, "Container");
    const hero = addDynamicTemplateNode(region.definition, region.nodeId, "HeroTemplate");
    const missingReviews = deriveTemplateProductionReadiness({
      definition: hero.definition,
      reviewFacts: {
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
      },
      hasBaseline: true,
      dirty: false,
      saveStatus: "success",
    });
    const reviewed = deriveTemplateProductionReadiness({
      definition: hero.definition,
      reviewFacts: {
        desktop: true,
        mobile: true,
        pageScope: true,
        stressPreview: {
          "short-text": true,
          "long-text": true,
          "optional-missing": true,
          "required-missing": true,
          "media-ratios": true,
        },
      },
      hasBaseline: true,
      dirty: false,
      saveStatus: "success",
    });

    expect(missingReviews.pageFieldCount).toBe(1);
    expect(missingReviews.layoutGroupCount).toBe(0);
    expect(missingReviews.organizationReady).toBe(true);
    expect(missingReviews.machineReady).toBe(true);
    expect(missingReviews.operatorReviewIssues).toHaveLength(8);
    expect(missingReviews.publishReady).toBe(true);
    expect(reviewed.operatorReviewIssues).toEqual([]);
    expect(reviewed.machineReady).toBe(true);
    expect(reviewed.publishReady).toBe(true);
  });

  test("default template identity is reported as locatable publish blockers", () => {
    const blank = createBlankDynamicTemplateDefinition();
    const region = addDynamicTemplateNode(blank, blank.rootNodeId, "Container");
    const hero = addDynamicTemplateNode(region.definition, region.nodeId, "HeroTemplate");
    const readiness = deriveTemplateProductionReadiness({
      definition: hero.definition,
      reviewFacts: {
        desktop: true,
        mobile: true,
        pageScope: true,
        stressPreview: {
          "short-text": true,
          "long-text": true,
          "optional-missing": true,
          "required-missing": true,
          "media-ratios": true,
        },
      },
      hasBaseline: true,
      dirty: false,
      saveStatus: "success",
    });

    expect(readiness.identityReady).toBe(false);
    expect(readiness.validation.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        level: "error",
        code: "PUBLISH_REQUIRES_TEMPLATE_NAME",
        path: "name",
        message: expect.stringContaining("模板设置"),
      }),
    ]));
    expect(readiness.errorCount).toBe(1);
    expect(readiness.machineReady).toBe(false);
    expect(readiness.reviewCanSubmit).toBe(false);
    expect(readiness.publishReady).toBe(false);
  });

  test("a named template can publish with its generated purpose and no description", () => {
    const blank = createBlankDynamicTemplateDefinition("说明型模板");
    blank.description = "";
    const region = addDynamicTemplateNode(blank, blank.rootNodeId, "Container");
    const hero = addDynamicTemplateNode(region.definition, region.nodeId, "HeroTemplate");
    const readiness = deriveTemplateProductionReadiness({
      definition: hero.definition,
      reviewFacts: {
        desktop: true,
        mobile: true,
        pageScope: true,
        stressPreview: {
          "short-text": true,
          "long-text": true,
          "optional-missing": true,
          "required-missing": true,
          "media-ratios": true,
        },
      },
      hasBaseline: true,
      dirty: false,
      saveStatus: "success",
    });

    expect(readiness.identityReady).toBe(true);
    expect(readiness.validation.issues).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "PUBLISH_REQUIRES_TEMPLATE_PURPOSE" }),
    ]));
    expect(readiness.machineReady).toBe(true);
    expect(readiness.publishReady).toBe(true);
  });

  test("an empty content region remains blocked until a real page field exists", () => {
    const blank = createBlankDynamicTemplateDefinition("空内容区域模板");
    blank.metadata.purpose = "验证空区域不能绕过组织内容门禁";
    const region = addDynamicTemplateNode(blank, blank.rootNodeId, "Container");
    const readiness = deriveTemplateProductionReadiness({
      definition: region.definition,
      reviewFacts: {
        desktop: true,
        mobile: true,
        pageScope: true,
        stressPreview: {
          "short-text": true,
          "long-text": true,
          "optional-missing": true,
          "required-missing": true,
          "media-ratios": true,
        },
      },
      hasBaseline: true,
      dirty: false,
      saveStatus: "success",
    });

    expect(readiness.regionCount).toBe(1);
    expect(readiness.pageFieldCount).toBe(0);
    expect(readiness.organizationReady).toBe(false);
    expect(readiness.machineReady).toBe(false);
    expect(readiness.publishReady).toBe(false);
  });

  test("the reviewed definition is deeply isolated from the live object", () => {
    const source = definition();
    const opened = openPublishReview(reviewInput({ reviewedDefinition: source }));
    const reviewed = opened.state as ReviewReadyState<ReturnType<typeof definition>>;
    source.name = "changed later";
    source.metadata.tags.push("later");

    expect(reviewed.snapshot.reviewedDefinition).not.toBe(source);
    expect(reviewed.snapshot.reviewedDefinition.name).toBe("工艺模板");
    expect(reviewed.snapshot.reviewedDefinition.metadata.tags).toEqual(["fine"]);
    expect(Object.isFrozen(reviewed.snapshot.reviewedDefinition.metadata.tags)).toBe(true);
  });

  test("persistent semantic changes stale review while workspace-only changes do not", () => {
    const ready = readyState();
    const ephemeralKinds = ["selection", "scope", "device", "zoom", "scroll", "focus", "stress-preview"] as const;
    for (const kind of ephemeralKinds) {
      const unchanged = markPublishReviewChanged(ready, { kind });
      expect(unchanged.state).toBe(ready);
    }

    const persistentKinds = ["definition", "version-note", "template-identity", "target-version", "semantic-generation"] as const;
    for (const kind of persistentKinds) {
      const stale = markPublishReviewChanged(ready, { kind });
      expect(stale.state.status).toBe("review-stale");
    }
  });

  test("double confirm keeps one operation identity and emits at most one save intent", () => {
    const first = beginReviewedSnapshotSave(readyState(), "operation-a");
    const second = beginReviewedSnapshotSave(first.state, "operation-b");

    expect(first.effects).toHaveLength(1);
    expect(first.effects[0].kind).toBe("save-reviewed-snapshot");
    expect(second.effects).toEqual([]);
    expect(second.state.status).toBe("saving-reviewed-snapshot");
    expect((second.state as SavingReviewedSnapshotState<Record<string, unknown>>).operation.operationId)
      .toBe("operation-a");
  });

  test("a save that finishes after new semantic input stops before publish", () => {
    const saving = savingState();
    const changed = markPublishReviewChanged(saving, { kind: "semantic-generation" });
    const result = beginReviewedSnapshotPublish(changed.state as SavingReviewedSnapshotState<Record<string, unknown>>, {
      operation: saving.operation,
      savedRevision: 12,
      savedChecksum: CHECKSUM_A,
      live: live({ semanticGeneration: 8 }),
    });

    expect(result.state.status).toBe("partial-failure");
    expect(result.state).toMatchObject({ reason: "draft-saved-template-unpublished", currentInputChanged: true });
    expect(result.effects).toEqual([]);

    const unmarked = savingState();
    const detectedFromLiveContext = beginReviewedSnapshotPublish(unmarked, {
      operation: unmarked.operation,
      savedRevision: 12,
      savedChecksum: CHECKSUM_A,
      live: live({ semanticGeneration: 8 }),
    });
    expect(detectedFromLiveContext.state).toMatchObject({
      status: "partial-failure",
      reason: "draft-saved-template-unpublished",
      currentInputChanged: true,
    });
    expect(detectedFromLiveContext.effects).toEqual([]);
  });

  test("definite publish failures preserve the saved-draft partial-success fact", () => {
    const categories = ["permission", "conflict", "rejected"] as const;
    for (const category of categories) {
      const publishing = publishingState();
      const result = publishReviewedSnapshotFailed(publishing, {
        operation: publishing.operation,
        failure: { category },
        live: live(),
      });
      expect(result.state).toMatchObject({
        status: "partial-failure",
        reason: "draft-saved-template-unpublished",
        failure: { category },
      });
      expect(result.effects).toEqual([]);
    }
  });

  test("definite save permission and conflict failures preserve the reviewed input without retry", () => {
    for (const failure of [
      { category: "permission", status: 403 },
      { category: "conflict", status: 409 },
    ] as const) {
      const saving = savingState();
      const result = saveReviewedSnapshotFailed(saving, {
        operation: saving.operation,
        failure,
        live: live(),
      });

      expect(result.state).toMatchObject({
        status: "review-ready",
        snapshot: saving.snapshot,
        lastFailure: failure,
      });
      expect(result.effects).toEqual([]);
    }
  });

  test("uncertain save and publish responses only enter verification", () => {
    const uncertain: PublishFailure[] = [
      { category: "timeout" },
      { category: "network" },
      { category: "server" },
      { category: "malformed-response" },
    ];
    for (const failure of uncertain) {
      const publishing = publishingState();
      const publishResult = publishReviewedSnapshotFailed(publishing, {
        operation: publishing.operation,
        failure,
        live: live(),
      });
      expect(publishResult.state).toMatchObject({ status: "verifying-uncertain", scope: "publish" });
      expect(publishResult.effects.map((effect) => effect.kind)).toEqual(["verify-published-version"]);

      const saving = savingState();
      const saveResult = saveReviewedSnapshotFailed(saving, {
        operation: saving.operation,
        failure,
        live: live(),
      });
      expect(saveResult.state).toMatchObject({ status: "verifying-uncertain", scope: "save" });
      expect(saveResult.effects.map((effect) => effect.kind)).toEqual(["verify-saved-draft"]);
    }
  });

  test("unknown save and publish outcomes are verified before any retry", () => {
    const saving = savingState();
    const saveResult = saveReviewedSnapshotFailed(saving, {
      operation: saving.operation,
      failure: { category: "unknown" },
      live: live(),
    });
    expect(saveResult.state).toMatchObject({ status: "verifying-uncertain", scope: "save" });
    expect(saveResult.effects.map((effect) => effect.kind)).toEqual(["verify-saved-draft"]);

    const publishing = publishingState();
    const publishResult = publishReviewedSnapshotFailed(publishing, {
      operation: publishing.operation,
      failure: { category: "unknown" },
      live: live(),
    });
    expect(publishResult.state).toMatchObject({ status: "verifying-uncertain", scope: "publish" });
    expect(publishResult.effects.map((effect) => effect.kind)).toEqual(["verify-published-version"]);
  });

  test("a malformed save checksum verifies the draft and never publishes", () => {
    const saving = savingState();
    const result = beginReviewedSnapshotPublish(saving, {
      operation: saving.operation,
      savedRevision: 12,
      savedChecksum: "not-a-server-checksum",
      live: live(),
    });

    expect(result.state).toMatchObject({
      status: "verifying-uncertain",
      scope: "save",
      lastFailure: { category: "malformed-response" },
    });
    expect(result.effects).toEqual([{
      kind: "verify-saved-draft",
      operation: saving.operation,
      templateId: "template-a",
      baselineRevision: 11,
      baselineChecksum: CHECKSUM_A,
    }]);
    expect(result.effects.some((effect) => effect.kind === "publish-reviewed-snapshot")).toBe(false);
  });

  test("save verification matches, conflicts, and retries only the frozen save intent", () => {
    const saving = savingState();
    const uncertain = saveReviewedSnapshotFailed(saving, {
      operation: saving.operation,
      failure: { category: "timeout" },
      live: live(),
    });
    expect(uncertain.effects).toEqual([{
      kind: "verify-saved-draft",
      operation: saving.operation,
      templateId: "template-a",
      baselineRevision: 11,
      baselineChecksum: CHECKSUM_A,
    }]);

    const matched = saveVerificationMatched(uncertain.state, {
      operation: saving.operation,
      savedRevision: 12,
      savedChecksum: CHECKSUM_B,
      live: live(),
    });
    expect(matched.state).toMatchObject({
      status: "publishing",
      saved: { revision: 12, checksum: CHECKSUM_B },
    });
    expect(matched.effects[0]).toMatchObject({
      kind: "publish-reviewed-snapshot",
      payload: { expectedRevision: 12, expectedChecksum: CHECKSUM_B },
    });

    const mismatched = saveVerificationMismatched(uncertain.state, {
      operation: saving.operation,
      observedRevision: 12,
      observedChecksum: CHECKSUM_A,
      live: live(),
    });
    expect(mismatched.state).toMatchObject({
      status: "partial-failure",
      reason: "draft-save-verification-conflict",
      failure: { category: "conflict", code: "SAVE_VERIFICATION_MISMATCH" },
    });
    expect(mismatched.effects).toEqual([]);

    const notFound = saveVerificationNotFound(uncertain.state, {
      operation: saving.operation,
      live: live(),
    });
    expect(notFound.state.status).toBe("saving-reviewed-snapshot");
    expect(notFound.effects).toEqual([{
      kind: "save-reviewed-snapshot",
      operation: saving.operation,
      templateId: "template-a",
      mode: "update",
      expectedRevision: 11,
      definition: saving.snapshot.reviewedDefinition,
      versionNote: "third version",
    }]);

    const changed = markPublishReviewChanged(uncertain.state, { kind: "definition" });
    const staleNotFound = saveVerificationNotFound(changed.state, {
      operation: saving.operation,
      live: live({ semanticGeneration: 8 }),
    });
    expect(staleNotFound.state).toMatchObject({
      status: "review-stale",
      staleReason: "definition",
    });
    expect(staleNotFound.effects).toEqual([]);
  });

  test("verification resolves exact matches, conflicts, and safe same-intent retries", () => {
    const publishing = publishingState();
    const uncertain = publishReviewedSnapshotFailed(publishing, {
      operation: publishing.operation,
      failure: { category: "timeout" },
      live: live(),
    });
    expect(uncertain.state.status).toBe("verifying-uncertain");

    const matched = publishedVersionVerificationMatched(uncertain.state, {
      operation: publishing.operation,
      templateId: "template-a",
      version: 3,
      checksum: CHECKSUM_A,
      outcome: "published",
      live: live(),
    });
    expect(matched.state.status).toBe("published");
    expect(matched.effects.map((effect) => effect.kind)).toEqual(["refresh-template-catalog"]);
    expect(matched.effects.some((effect) => effect.kind === "publish-reviewed-snapshot")).toBe(false);

    const mismatched = publishedVersionVerificationMismatched(uncertain.state, {
      operation: publishing.operation,
      observedChecksum: CHECKSUM_B,
      live: live(),
    });
    expect(mismatched.state).toMatchObject({
      status: "partial-failure",
      reason: "draft-saved-template-unpublished",
      failure: { category: "conflict" },
    });

    const notFound = publishedVersionVerificationNotFound(uncertain.state, {
      operation: publishing.operation,
      live: live(),
    });
    expect(notFound.state.status).toBe("publishing");
    expect(notFound.effects.map((effect) => effect.kind)).toEqual(["publish-reviewed-snapshot"]);
    expect(notFound.effects[0].operation).toEqual(publishing.operation);

    const changed = markPublishReviewChanged(uncertain.state, { kind: "definition" });
    const staleNotFound = publishedVersionVerificationNotFound(changed.state, {
      operation: publishing.operation,
      live: live({ semanticGeneration: 8 }),
    });
    expect(staleNotFound.state.status).toBe("review-stale");
    expect(staleNotFound.effects).toEqual([]);
  });

  test("verification failures stay query-only", () => {
    const publishing = publishingState();
    const uncertain = publishReviewedSnapshotFailed(publishing, {
      operation: publishing.operation,
      failure: { category: "timeout" },
      live: live(),
    });
    const failed = verificationFailed(uncertain.state, {
      operation: publishing.operation,
      failure: { category: "network" },
      live: live(),
    });
    expect(failed.state.status).toBe("verifying-uncertain");
    expect(failed.effects).toEqual([]);
    const retried = retryVerification(failed.state);
    expect(retried.effects.map((effect) => effect.kind)).toEqual(["verify-published-version"]);
  });

  test("catalog refresh failure preserves publication and retries only the catalog", () => {
    const publishing = publishingState();
    const success = publishReviewedSnapshotSucceeded(publishing, {
      operation: publishing.operation,
      templateId: "template-a",
      version: 3,
      checksum: CHECKSUM_A,
      outcome: "published",
      live: live(),
    });
    expect(success.state.status).toBe("published");
    const failed = catalogRefreshFailed(success.state, {
      operation: publishing.operation,
      failure: { category: "network" },
      live: live(),
    });
    expect(failed.state).toMatchObject({
      status: "partial-failure",
      reason: "template-published-catalog-stale",
      published: { version: 3, checksum: CHECKSUM_A },
    });
    const retry = retryCatalogRefresh(failed.state);
    expect(retry.effects.map((effect) => effect.kind)).toEqual(["refresh-template-catalog"]);
    expect(retry.effects.some((effect) => effect.kind === "publish-reviewed-snapshot")).toBe(false);
  });

  test("catalog success keeps the publication fact and reset returns to editing", () => {
    const publishing = publishingState();
    const success = publishReviewedSnapshotSucceeded(publishing, {
      operation: publishing.operation,
      templateId: "template-a",
      version: 3,
      checksum: CHECKSUM_A,
      outcome: "already-published",
      live: live(),
    });
    const refreshed = catalogRefreshSucceeded(success.state, {
      operation: publishing.operation,
      live: live(),
    });
    expect(refreshed.state).toMatchObject({
      status: "published",
      catalogStatus: "fresh",
      published: { outcome: "already-published" },
    });
    expect(refreshed.effects).toEqual([]);

    const reset = resetPublishWorkflow(live({ semanticGeneration: 8 }));
    expect(reset).toEqual({
      state: { status: "editing", context: live({ semanticGeneration: 8 }) },
      effects: [],
    });
  });

  test("late save, publish, verify, and catalog results are ignored by full operation identity", () => {
    const saving = savingState();
    const wrongOperation: OperationIdentity = { ...saving.operation, operationId: "old-operation" };
    expectIgnored(saving, beginReviewedSnapshotPublish(saving, {
      operation: wrongOperation,
      savedRevision: 12,
      savedChecksum: CHECKSUM_A,
      live: live(),
    }));

    const publishing = publishingState();
    expectIgnored(publishing, publishReviewedSnapshotSucceeded(publishing, {
      operation: { ...publishing.operation, semanticGeneration: 6 },
      templateId: "template-a",
      version: 3,
      checksum: CHECKSUM_A,
      outcome: "published",
      live: live(),
    }));

    const uncertain = publishReviewedSnapshotFailed(publishing, {
      operation: publishing.operation,
      failure: { category: "timeout" },
      live: live(),
    });
    expectIgnored(uncertain.state, publishedVersionVerificationMatched(uncertain.state, {
      operation: { ...publishing.operation, sessionId: "old-session" },
      templateId: "template-a",
      version: 3,
      checksum: CHECKSUM_A,
      outcome: "published",
      live: live(),
    }));

    const published = publishReviewedSnapshotSucceeded(publishing, {
      operation: publishing.operation,
      templateId: "template-a",
      version: 3,
      checksum: CHECKSUM_A,
      outcome: "published",
      live: live(),
    });
    expectIgnored(published.state, catalogRefreshFailed(published.state, {
      operation: { ...publishing.operation, targetVersion: 4 },
      failure: { category: "network" },
      live: live(),
    }));
  });

  test("baseline revision, baseline checksum, and normalized version note are in every operation identity", () => {
    const paddedReview = openPublishReview(reviewInput({ reviewedVersionNote: "  third version  " }));
    const paddedReady = paddedReview.state as ReviewReadyState<Record<string, unknown>>;
    const normalizedOperation = beginReviewedSnapshotSave(paddedReady, "normalized-note");
    expect(normalizedOperation.state).toMatchObject({
      status: "saving-reviewed-snapshot",
      snapshot: { reviewedVersionNote: "third version" },
      operation: {
        baselineRevision: 11,
        baselineChecksum: CHECKSUM_A,
        versionNote: "third version",
      },
    });

    for (const field of ["baselineRevision", "baselineChecksum", "versionNote"] as const) {
      const saving = savingState();
      const drifted: OperationIdentity = {
        ...saving.operation,
        [field]: field === "baselineRevision"
          ? saving.operation.baselineRevision! + 1
          : field === "baselineChecksum"
            ? CHECKSUM_B
            : `${saving.operation.versionNote}-stale`,
      };
      expectIgnored(saving, beginReviewedSnapshotPublish(saving, {
        operation: drifted,
        savedRevision: 12,
        savedChecksum: CHECKSUM_A,
        live: live(),
      }));

      const publishing = publishingState();
      expectIgnored(publishing, publishReviewedSnapshotSucceeded(publishing, {
        operation: { ...publishing.operation, [field]: drifted[field] },
        templateId: "template-a",
        version: 3,
        checksum: CHECKSUM_A,
        outcome: "published",
        live: live(),
      }));

      const uncertain = publishReviewedSnapshotFailed(publishing, {
        operation: publishing.operation,
        failure: { category: "timeout" },
        live: live(),
      });
      expectIgnored(uncertain.state, publishedVersionVerificationMatched(uncertain.state, {
        operation: { ...publishing.operation, [field]: drifted[field] },
        templateId: "template-a",
        version: 3,
        checksum: CHECKSUM_A,
        outcome: "published",
        live: live(),
      }));

      const published = publishReviewedSnapshotSucceeded(publishing, {
        operation: publishing.operation,
        templateId: "template-a",
        version: 3,
        checksum: CHECKSUM_A,
        outcome: "published",
        live: live(),
      });
      expectIgnored(published.state, catalogRefreshFailed(published.state, {
        operation: { ...publishing.operation, [field]: drifted[field] },
        failure: { category: "network" },
        live: live(),
      }));
    }
  });

  test("published and already-published retain one publication fact with distinct outcomes", () => {
    for (const outcome of ["published", "already-published"] as const) {
      const publishing = publishingState();
      const result = publishReviewedSnapshotSucceeded(publishing, {
        operation: publishing.operation,
        templateId: "template-a",
        version: 3,
        checksum: CHECKSUM_A,
        outcome,
        live: live(),
      });
      expect(result.state).toMatchObject({
        status: "published",
        published: { templateId: "template-a", version: 3, checksum: CHECKSUM_A, outcome },
      });
    }
  });

  test("strict payload is built only from the frozen snapshot and confirmed saved identity", () => {
    const snapshot = readyState().snapshot;
    const payload = buildStrictPublishPayload(snapshot, {
      revision: 12,
      checksum: CHECKSUM_B,
    });

    expect(payload).toEqual({
      expectedRevision: 12,
      expectedChecksum: CHECKSUM_B,
      targetVersion: 3,
      versionNote: "third version",
    });
    expect(Object.keys(payload).sort()).toEqual([
      "expectedChecksum",
      "expectedRevision",
      "targetVersion",
      "versionNote",
    ]);
    expect(JSON.stringify(payload)).not.toContain("PageDocument");
    expect(JSON.stringify(payload)).not.toContain("reviewedDefinition");
    expect(JSON.stringify(payload)).not.toContain("preview");
  });

  test("a local review binds the created server draft identity before publishing", () => {
    const opened = openPublishReview(reviewInput({ baseline: null }));
    const ready = opened.state as ReviewReadyState<Record<string, unknown>>;
    const saving = beginReviewedSnapshotSave(ready, "create-local");
    expect(saving.effects[0]).toMatchObject({
      kind: "save-reviewed-snapshot",
      mode: "create",
      expectedRevision: null,
      operation: { baselineRevision: null, baselineChecksum: null },
    });

    const result = beginReviewedSnapshotPublish(
      saving.state as SavingReviewedSnapshotState<Record<string, unknown>>,
      {
        operation: (saving.state as SavingReviewedSnapshotState<Record<string, unknown>>).operation,
        savedRevision: 1,
        savedChecksum: CHECKSUM_B,
        live: live(),
      },
    );

    expect(result.state).toMatchObject({
      status: "publishing",
      saved: { revision: 1, checksum: CHECKSUM_B },
    });
    expect(result.effects[0]).toMatchObject({
      kind: "publish-reviewed-snapshot",
      payload: { expectedRevision: 1, expectedChecksum: CHECKSUM_B },
    });
  });

  test("a dirty persisted review publishes the checksum confirmed by its save response", () => {
    const opened = openPublishReview(reviewInput({
      baseline: { revision: 11, checksum: CHECKSUM_A },
    }));
    const ready = opened.state as ReviewReadyState<Record<string, unknown>>;
    const saving = beginReviewedSnapshotSave(ready, "update-dirty");
    expect(saving.effects[0]).toMatchObject({
      kind: "save-reviewed-snapshot",
      mode: "update",
      expectedRevision: 11,
    });

    const result = beginReviewedSnapshotPublish(
      saving.state as SavingReviewedSnapshotState<Record<string, unknown>>,
      {
        operation: (saving.state as SavingReviewedSnapshotState<Record<string, unknown>>).operation,
        savedRevision: 12,
        savedChecksum: CHECKSUM_B,
        live: live(),
      },
    );

    expect(result.state.status).toBe("publishing");
    expect(result.effects[0]).toMatchObject({
      kind: "publish-reviewed-snapshot",
      payload: { expectedRevision: 12, expectedChecksum: CHECKSUM_B },
    });

    const publishing = result.state as PublishingReviewedSnapshotState<Record<string, unknown>>;
    const success = publishReviewedSnapshotSucceeded(publishing, {
      operation: publishing.operation,
      templateId: "template-a",
      version: 3,
      checksum: CHECKSUM_B,
      outcome: "published",
      live: live(),
    });
    expect(success.state).toMatchObject({
      status: "published",
      saved: { revision: 12, checksum: CHECKSUM_B },
      published: { checksum: CHECKSUM_B },
    });
    expect(success.effects[0]).toMatchObject({
      kind: "refresh-template-catalog",
      checksum: CHECKSUM_B,
    });

    const uncertain = publishReviewedSnapshotFailed(publishing, {
      operation: publishing.operation,
      failure: { category: "timeout" },
      live: live(),
    });
    expect(uncertain.effects).toEqual([{
      kind: "verify-published-version",
      operation: publishing.operation,
      templateId: "template-a",
      targetVersion: 3,
      expectedChecksum: CHECKSUM_B,
    }]);

    const notFound = publishedVersionVerificationNotFound(uncertain.state, {
      operation: publishing.operation,
      live: live(),
    });
    expect(notFound.effects[0]).toMatchObject({
      kind: "publish-reviewed-snapshot",
      payload: { expectedRevision: 12, expectedChecksum: CHECKSUM_B },
    });

    const matched = publishedVersionVerificationMatched(uncertain.state, {
      operation: publishing.operation,
      templateId: "template-a",
      version: 3,
      checksum: CHECKSUM_B,
      outcome: "already-published",
      live: live(),
    });
    expect(matched.state).toMatchObject({
      status: "published",
      saved: { revision: 12, checksum: CHECKSUM_B },
      published: { checksum: CHECKSUM_B, outcome: "already-published" },
    });
    expect(matched.effects[0]).toMatchObject({
      kind: "refresh-template-catalog",
      checksum: CHECKSUM_B,
    });
  });
