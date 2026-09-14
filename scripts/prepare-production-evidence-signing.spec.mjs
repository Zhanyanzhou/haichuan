import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildProductionEvidenceProvenance,
  collectDescriptorPaths,
  materializeCollectorEnvelope,
  validateTrustedPreparationContext,
} from "./prepare-production-evidence-signing.mjs";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const digest = (character) => character.repeat(64);
const context = Object.freeze({
  environmentIdSha256: digest("1"),
  approvalReferenceSha256: digest("2"),
  releaseGitSha: "a".repeat(40),
  migrationBundleSha256: digest("b"),
  releaseSource: "https://github.com/example/haichuan",
  repository: "example/haichuan",
  sourceRef: "refs/heads/main",
  manifestSignerWorkflow: "github.com/example/haichuan/.github/workflows/release-images.yml",
  evidenceSignerWorkflow: "github.com/example/haichuan/.github/workflows/production-evidence.yml",
  releaseProfile: "lead-generation",
  releaseRunId: "123",
  evidenceRunId: "456",
  releaseOwner: "release-owner",
  rollbackOwner: "rollback-owner",
  incidentOwner: "incident-owner",
});

test("trusted preparation context binds distinct repository workflows and immutable release identity", () => {
  assert.deepEqual(validateTrustedPreparationContext({ ...context }), context);
  assert.throws(
    () => validateTrustedPreparationContext({
      ...context,
      evidenceSignerWorkflow: context.manifestSignerWorkflow,
    }),
    { message: "PRODUCTION_EVIDENCE_PREPARE_SIGNER_INVALID" },
  );
  assert.throws(
    () => validateTrustedPreparationContext({ ...context, sourceRef: "refs/heads/release/../main" }),
    { message: "PRODUCTION_EVIDENCE_PREPARE_SOURCE_REF_INVALID" },
  );
});

test("descriptor collection is deterministic and rejects conflicting hashes for one path", () => {
  assert.deepEqual(
    collectDescriptorPaths(
      { second: { path: "receipts/z.json", sha256: digest("3") } },
      [{ path: "receipts/a.json", sha256: digest("4") }],
    ),
    [
      { path: "receipts/a.json", sha256: digest("4") },
      { path: "receipts/z.json", sha256: digest("3") },
    ],
  );
  assert.throws(
    () => collectDescriptorPaths(
      { path: "receipt.json", sha256: digest("3") },
      { path: "receipt.json", sha256: digest("4") },
    ),
    { message: "PRODUCTION_EVIDENCE_PREPARE_DESCRIPTOR_CONFLICT:receipt.json" },
  );
});

test("SLSA predicate binds source, exact workflows, runs and every descriptor", () => {
  const descriptors = [{ path: "receipt.json", sha256: digest("3") }];
  const predicate = buildProductionEvidenceProvenance(
    context,
    { schemaVersion: 3 },
    digest("4"),
    descriptors,
  );
  assert.equal(
    predicate.runDetails.builder.id,
    "https://github.com/example/haichuan/.github/workflows/production-evidence.yml@refs/heads/main",
  );
  assert.equal(predicate.buildDefinition.externalParameters.releaseRunId, 123);
  assert.equal(predicate.buildDefinition.externalParameters.manifestSha256, digest("4"));
  assert.deepEqual(predicate.buildDefinition.resolvedDependencies, [
    { uri: context.releaseSource, digest: { gitCommit: context.releaseGitSha } },
    {
      uri: `${context.releaseSource}/actions/runs/123#receipt.json`,
      digest: { sha256: digest("3") },
    },
  ]);
});

test("collector envelope is run-bound, hash-checked and cannot inject signing outputs", () => {
  const tempBase = join(projectRoot, ".codex-tmp");
  mkdirSync(tempBase, { recursive: true });
  const root = mkdtempSync(join(tempBase, "production-evidence-envelope-test-"));
  const evidenceRoot = join(root, "materialized");
  const envelopePath = join(root, "envelope.json");
  const collectorSha256 = digest("5");
  const evidenceBytes = Buffer.from(`${JSON.stringify({
    generatedAt: "2026-09-14T12:00:00Z",
    environment: {
      releaseOwner: context.releaseOwner,
      rollbackOwner: context.rollbackOwner,
      incidentOwner: context.incidentOwner,
    },
  })}\n`);
  const envelope = {
    schemaVersion: 1,
    collectorSha256,
    environmentIdSha256: context.environmentIdSha256,
    approvalReferenceSha256: context.approvalReferenceSha256,
    releaseGitSha: context.releaseGitSha,
    migrationBundleSha256: context.migrationBundleSha256,
    repository: context.repository,
    sourceRef: context.sourceRef,
    releaseProfile: context.releaseProfile,
    releaseRunId: Number(context.releaseRunId),
    evidenceRunId: Number(context.evidenceRunId),
    releaseOwner: context.releaseOwner,
    rollbackOwner: context.rollbackOwner,
    incidentOwner: context.incidentOwner,
    generatedAt: "2026-09-14T12:00:00Z",
    files: [{
      path: "production-evidence.json",
      sha256: sha256(evidenceBytes),
      contentBase64: evidenceBytes.toString("base64"),
    }],
  };
  try {
    writeFileSync(envelopePath, `${JSON.stringify(envelope)}\n`);
    assert.deepEqual(materializeCollectorEnvelope({
      envelopePath,
      evidenceRoot,
      expectedCollectorSha256: collectorSha256,
      context,
    }), {
      fileCount: 1,
      totalBytes: evidenceBytes.length,
      generatedAt: envelope.generatedAt,
    });
    assert.equal(readFileSync(join(evidenceRoot, "production-evidence.json"), "utf8"), evidenceBytes.toString());

    const injectedPath = join(root, "injected-envelope.json");
    const injected = {
      ...envelope,
      files: [{
        path: "production-evidence.attestation.json",
        sha256: sha256(evidenceBytes),
        contentBase64: evidenceBytes.toString("base64"),
      }],
    };
    writeFileSync(injectedPath, `${JSON.stringify(injected)}\n`);
    assert.throws(
      () => materializeCollectorEnvelope({
        envelopePath: injectedPath,
        evidenceRoot: join(root, "injected"),
        expectedCollectorSha256: collectorSha256,
        context,
      }),
      { message: "PRODUCTION_EVIDENCE_COLLECTOR_SIGNING_FILE_FORBIDDEN" },
    );

    const replayPath = join(root, "replay-envelope.json");
    writeFileSync(replayPath, `${JSON.stringify({ ...envelope, evidenceRunId: 999 })}\n`);
    assert.throws(
      () => materializeCollectorEnvelope({
        envelopePath: replayPath,
        evidenceRoot: join(root, "replay"),
        expectedCollectorSha256: collectorSha256,
        context,
      }),
      { message: "PRODUCTION_EVIDENCE_COLLECTOR_ENVELOPE_BINDING_INVALID" },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
