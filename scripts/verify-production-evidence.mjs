import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

import { validateReleaseManifest } from "./verify-release-images.mjs";
import {
  RELEASE_PROFILE_CONTRACT,
  requireReleaseProfile,
} from "./release-profile-contract.mjs";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sha256Pattern = /^[a-f0-9]{64}$/;
const gitShaPattern = /^[a-f0-9]{40}$/;
const isoUtcPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const forbiddenNormalizedKeyPattern = /(?:password|secret|token|databaseurl|connectionstring|privatekey|apikey|credential|auth)/;
const requiredExternalServices = Object.freeze([
  "email",
  "sms",
  "logistics",
  "payment-gateway",
  "wechat",
  "object-storage",
]);
const provenancePredicateType = "https://slsa.dev/provenance/v1";
const sbomPredicateType = "https://spdx.dev/Document";
const sigstoreBundleMediaType = "application/vnd.dev.sigstore.bundle.v0.3+json";
const githubRepositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const githubRefPattern = /^refs\/(?:heads|tags)\/[A-Za-z0-9][A-Za-z0-9._/-]*$/;

function fail(code) {
  throw new Error(code);
}

function requireObject(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value;
}

function assertExactKeys(value, allowedKeys, code) {
  requireObject(value, code);
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`${code}:${key}`);
  }
}

function requireSha256(value, code) {
  if (!sha256Pattern.test(value ?? "")) fail(code);
}

function requirePositiveInteger(value, code) {
  if (!Number.isSafeInteger(value) || value <= 0) fail(code);
}

function requireIsoUtc(value, code) {
  if (!isoUtcPattern.test(value ?? "") || Number.isNaN(Date.parse(value))) fail(code);
}

function normalizeKey(key) {
  return key.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function rejectSensitiveKeys(value, path = "evidence") {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenNormalizedKeyPattern.test(normalizeKey(key))) {
      fail(`PRODUCTION_EVIDENCE_SENSITIVE_KEY_FORBIDDEN:${path}.${key}`);
    }
    rejectSensitiveKeys(child, `${path}.${key}`);
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function isWithin(parent, child) {
  const childRelative = relative(parent, child);
  return childRelative === "" || (!childRelative.startsWith("..") && !isAbsolute(childRelative));
}

function resolveArtifactPath(descriptor, label, evidenceRoot) {
  assertExactKeys(descriptor, ["path", "sha256"], `PRODUCTION_EVIDENCE_ARTIFACT_SCHEMA_INVALID:${label}`);
  if (typeof descriptor.path !== "string" || descriptor.path.length === 0 || isAbsolute(descriptor.path)) {
    fail(`PRODUCTION_EVIDENCE_ARTIFACT_PATH_INVALID:${label}`);
  }
  requireSha256(descriptor.sha256, `PRODUCTION_EVIDENCE_ARTIFACT_SHA_INVALID:${label}`);
  const artifactPath = resolve(evidenceRoot, descriptor.path);
  if (!isWithin(evidenceRoot, artifactPath)) fail(`PRODUCTION_EVIDENCE_ARTIFACT_OUTSIDE_ROOT:${label}`);
  if (!existsSync(artifactPath)) fail(`PRODUCTION_EVIDENCE_ARTIFACT_MISSING:${label}`);
  const stat = lstatSync(artifactPath);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`PRODUCTION_EVIDENCE_ARTIFACT_NOT_REGULAR_FILE:${label}`);
  const realArtifactPath = realpathSync(artifactPath);
  if (!isWithin(realpathSync(evidenceRoot), realArtifactPath)) fail(`PRODUCTION_EVIDENCE_ARTIFACT_OUTSIDE_ROOT:${label}`);
  return realArtifactPath;
}

function readArtifact(descriptor, label, evidenceRoot) {
  const realArtifactPath = resolveArtifactPath(descriptor, label, evidenceRoot);
  const bytes = readFileSync(realArtifactPath);
  if (sha256(bytes) !== descriptor.sha256) fail(`PRODUCTION_EVIDENCE_ARTIFACT_HASH_MISMATCH:${label}`);
  return bytes;
}

function parseJsonArtifact(descriptor, label, evidenceRoot) {
  try {
    return JSON.parse(readArtifact(descriptor, label, evidenceRoot).toString("utf8"));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("PRODUCTION_EVIDENCE_")) throw error;
    fail(`PRODUCTION_EVIDENCE_ARTIFACT_JSON_INVALID:${label}`);
  }
}

function validateReceipt(descriptor, label, expected, trusted, manifestSha256) {
  const receipt = parseJsonArtifact(descriptor, label, trusted.evidenceRoot);
  rejectSensitiveKeys(receipt, `receipt.${label}`);
  assertExactKeys(receipt, [
    "schemaVersion",
    "kind",
    "provider",
    "outcome",
    "observedAt",
    "environmentIdSha256",
    "approvalReferenceSha256",
    "releaseGitSha",
    "manifestSha256",
    "subjectSha256",
  ], `PRODUCTION_EVIDENCE_RECEIPT_SCHEMA_INVALID:${label}`);
  if (receipt.schemaVersion !== 1) fail(`PRODUCTION_EVIDENCE_RECEIPT_VERSION_INVALID:${label}`);
  requireIsoUtc(receipt.observedAt, `PRODUCTION_EVIDENCE_RECEIPT_TIME_INVALID:${label}`);
  if (receipt.kind !== expected.kind) fail(`PRODUCTION_EVIDENCE_RECEIPT_KIND_MISMATCH:${label}`);
  if (receipt.provider !== expected.provider) fail(`PRODUCTION_EVIDENCE_RECEIPT_PROVIDER_MISMATCH:${label}`);
  if (receipt.outcome !== expected.outcome) fail(`PRODUCTION_EVIDENCE_RECEIPT_OUTCOME_MISMATCH:${label}`);
  if (receipt.environmentIdSha256 !== trusted.environmentIdSha256) fail(`PRODUCTION_EVIDENCE_RECEIPT_ENVIRONMENT_MISMATCH:${label}`);
  if (receipt.approvalReferenceSha256 !== trusted.approvalReferenceSha256) fail(`PRODUCTION_EVIDENCE_RECEIPT_APPROVAL_MISMATCH:${label}`);
  if (receipt.releaseGitSha !== trusted.releaseGitSha) fail(`PRODUCTION_EVIDENCE_RECEIPT_RELEASE_MISMATCH:${label}`);
  if (receipt.manifestSha256 !== manifestSha256) fail(`PRODUCTION_EVIDENCE_RECEIPT_MANIFEST_MISMATCH:${label}`);
  if (receipt.subjectSha256 !== expected.subjectSha256) fail(`PRODUCTION_EVIDENCE_RECEIPT_SUBJECT_MISMATCH:${label}`);
  return receipt;
}

function validateTrustedContext(trusted) {
  requireObject(trusted, "PRODUCTION_EVIDENCE_TRUSTED_CONTEXT_REQUIRED");
  requireSha256(trusted.environmentIdSha256, "PRODUCTION_EVIDENCE_EXPECTED_ENVIRONMENT_INVALID");
  requireSha256(trusted.approvalReferenceSha256, "PRODUCTION_EVIDENCE_EXPECTED_APPROVAL_INVALID");
  if (!gitShaPattern.test(trusted.releaseGitSha ?? "")) fail("PRODUCTION_EVIDENCE_EXPECTED_RELEASE_INVALID");
  requireSha256(trusted.migrationBundleSha256, "PRODUCTION_EVIDENCE_EXPECTED_MIGRATION_BUNDLE_INVALID");
  if (typeof trusted.releaseSource !== "string" || !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(trusted.releaseSource)) {
    fail("PRODUCTION_EVIDENCE_EXPECTED_RELEASE_SOURCE_INVALID");
  }
  if (!githubRepositoryPattern.test(trusted.repository ?? "")) fail("PRODUCTION_EVIDENCE_EXPECTED_REPOSITORY_INVALID");
  if (trusted.releaseSource.toLowerCase() !== `https://github.com/${trusted.repository.toLowerCase()}`) {
    fail("PRODUCTION_EVIDENCE_EXPECTED_REPOSITORY_MISMATCH");
  }
  if (!githubRefPattern.test(trusted.sourceRef ?? "") || trusted.sourceRef.includes("..") || trusted.sourceRef.includes("//")) {
    fail("PRODUCTION_EVIDENCE_EXPECTED_SOURCE_REF_INVALID");
  }
  const repository = trusted.repository.toLowerCase();
  const expectedManifestSigner = `github.com/${repository}/.github/workflows/release-images.yml`;
  if (trusted.manifestSignerWorkflow?.toLowerCase() !== expectedManifestSigner) {
    fail("PRODUCTION_EVIDENCE_EXPECTED_MANIFEST_SIGNER_INVALID");
  }
  const evidenceSignerPattern = new RegExp(`^github\\.com/${repository.replaceAll(".", "\\.")}/\\.github/workflows/[A-Za-z0-9_.-]+\\.ya?ml$`, "i");
  if (!evidenceSignerPattern.test(trusted.evidenceSignerWorkflow ?? "") ||
      trusted.evidenceSignerWorkflow.toLowerCase() === expectedManifestSigner) {
    fail("PRODUCTION_EVIDENCE_EXPECTED_EVIDENCE_SIGNER_INVALID");
  }
  requireReleaseProfile(trusted.releaseProfile);
  if (typeof trusted.evidenceRoot !== "string" || !existsSync(trusted.evidenceRoot)) fail("PRODUCTION_EVIDENCE_ROOT_INVALID");
  const stat = lstatSync(trusted.evidenceRoot);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail("PRODUCTION_EVIDENCE_ROOT_INVALID");
}

function assertStrictManifestSchema(manifest) {
  assertExactKeys(manifest, [
    "schemaVersion", "releaseStage", "imageTag", "gitSha", "migrationBundleSha256", "source", "qualityGate",
    "attestationPolicy", "publicSeo", "server", "client", "operations",
  ], "PRODUCTION_EVIDENCE_MANIFEST_SCHEMA_INVALID");
  assertExactKeys(manifest.qualityGate, [
    "workflow", "runId", "runUrl", "headSha", "event", "conclusion",
  ], "PRODUCTION_EVIDENCE_MANIFEST_QUALITY_SCHEMA_INVALID");
  assertExactKeys(manifest.attestationPolicy, [
    "signingSystem", "cosignVersion", "bundleMediaType", "signerWorkflow", "signerIdentity",
    "certificateOidcIssuer", "sourceRef", "sourceDigest", "imageSignaturesVerified",
    "imageAttestationsVerified", "provenancePredicateType", "sbomPredicateType",
    "manifestPredicateType",
  ], "PRODUCTION_EVIDENCE_MANIFEST_ATTESTATION_SCHEMA_INVALID");
  assertExactKeys(manifest.publicSeo, [
    "sourceStage", "snapshotHash", "prerenderManifestSha256", "sourceArtifactId", "sourceArtifactDigest",
    "sourceKind", "contentReady",
  ], "PRODUCTION_EVIDENCE_MANIFEST_PUBLIC_SEO_SCHEMA_INVALID");
  for (const component of ["server", "client", "operations"]) {
    const allowedImageKeys = [
      "image", "digest", "reference", "signatureBundle", "provenanceBundle", "sbomBundle",
      "provenancePredicateType", "sbomPredicateType",
    ];
    if (component === "operations") allowedImageKeys.push("runtimeExecutables");
    assertExactKeys(
      manifest[component],
      allowedImageKeys,
      `PRODUCTION_EVIDENCE_MANIFEST_IMAGE_SCHEMA_INVALID:${component}`,
    );
  }
}

export function validateProductionEvidenceStructure(evidence, trusted) {
  validateTrustedContext(trusted);
  requireObject(evidence, "PRODUCTION_EVIDENCE_INVALID");
  rejectSensitiveKeys(evidence);
  assertExactKeys(evidence, [
    "schemaVersion", "generatedAt", "environment", "release", "database", "admin", "storage",
    "recovery", "edge", "observability", "featureGates", "externalServices", "rollback",
  ], "PRODUCTION_EVIDENCE_SCHEMA_UNKNOWN_FIELD");
  if (evidence.schemaVersion !== 3) fail("PRODUCTION_EVIDENCE_SCHEMA_INVALID");
  requireIsoUtc(evidence.generatedAt, "PRODUCTION_EVIDENCE_GENERATED_AT_INVALID");

  const environment = requireObject(evidence.environment, "PRODUCTION_EVIDENCE_ENVIRONMENT_MISSING");
  assertExactKeys(environment, ["approvalReferenceSha256", "releaseOwner", "rollbackOwner", "incidentOwner"], "PRODUCTION_EVIDENCE_ENVIRONMENT_SCHEMA_INVALID");
  requireSha256(environment.approvalReferenceSha256, "PRODUCTION_EVIDENCE_APPROVAL_INVALID");
  if (environment.approvalReferenceSha256 !== trusted.approvalReferenceSha256) {
    fail("PRODUCTION_EVIDENCE_APPROVAL_MISMATCH");
  }
  for (const owner of ["releaseOwner", "rollbackOwner", "incidentOwner"]) {
    if (typeof environment[owner] !== "string" || environment[owner].trim().length < 2) fail(`PRODUCTION_EVIDENCE_${owner.toUpperCase()}_INVALID`);
  }
  const release = requireObject(evidence.release, "PRODUCTION_EVIDENCE_RELEASE_MISSING");
  assertExactKeys(release, ["manifest", "manifestAttestationBundle", "runtimeIdentityReceipt", "composeContractReceipt"], "PRODUCTION_EVIDENCE_RELEASE_SCHEMA_INVALID");
  const manifest = parseJsonArtifact(release.manifest, "release.manifest", trusted.evidenceRoot);
  const manifestAttestationBundle = parseJsonArtifact(
    release.manifestAttestationBundle,
    "release.manifestAttestationBundle",
    trusted.evidenceRoot,
  );
  if (manifestAttestationBundle?.mediaType !== sigstoreBundleMediaType) {
    fail("PRODUCTION_EVIDENCE_MANIFEST_BUNDLE_FORMAT_INVALID");
  }
  rejectSensitiveKeys(manifest, "manifest");
  assertStrictManifestSchema(manifest);
  validateReleaseManifest(manifest, {
    gitSha: trusted.releaseGitSha,
    migrationBundleSha256: trusted.migrationBundleSha256,
    releaseStage: "production",
  });
  if (manifest.source !== trusted.releaseSource) fail("PRODUCTION_EVIDENCE_RELEASE_SOURCE_MISMATCH");
  if (manifest.attestationPolicy.signerWorkflow.toLowerCase() !== trusted.manifestSignerWorkflow.toLowerCase()) {
    fail("PRODUCTION_EVIDENCE_MANIFEST_SIGNER_MISMATCH");
  }
  if (manifest.attestationPolicy.sourceRef !== trusted.sourceRef) {
    fail("PRODUCTION_EVIDENCE_MANIFEST_SOURCE_REF_MISMATCH");
  }
  for (const component of ["server", "client", "operations"]) {
    for (const kind of ["signature", "provenance", "sbom"]) {
      const bundle = parseJsonArtifact(
        manifest[component][`${kind}Bundle`],
        `manifest.${component}.${kind}Bundle`,
        trusted.evidenceRoot,
      );
      if (bundle?.mediaType !== sigstoreBundleMediaType) {
        fail(`PRODUCTION_EVIDENCE_SIGSTORE_BUNDLE_FORMAT_INVALID:${component}:${kind}`);
      }
    }
  }
  const manifestSha256 = release.manifest.sha256;
  const manifestSubject = { subjectSha256: manifestSha256 };
  validateReceipt(release.runtimeIdentityReceipt, "release.runtimeIdentity", {
    kind: "runtime-identity", provider: "docker-cli", outcome: "verified", ...manifestSubject,
  }, trusted, manifestSha256);
  validateReceipt(release.composeContractReceipt, "release.composeContract", {
    kind: "compose-contract", provider: "docker-compose", outcome: "verified", ...manifestSubject,
  }, trusted, manifestSha256);

  const database = requireObject(evidence.database, "PRODUCTION_EVIDENCE_DATABASE_MISSING");
  assertExactKeys(database, ["migrationStatus", "preflightReport", "preflightReceipt"], "PRODUCTION_EVIDENCE_DATABASE_SCHEMA_INVALID");
  if (database.migrationStatus !== "up-to-date") fail("PRODUCTION_EVIDENCE_MIGRATION_NOT_CURRENT");
  readArtifact(database.preflightReport, "database.preflightReport", trusted.evidenceRoot);
  validateReceipt(database.preflightReceipt, "database.preflight", {
    kind: "database-preflight", provider: "release-preflight-cli", outcome: "up-to-date",
    subjectSha256: database.preflightReport.sha256,
  }, trusted, manifestSha256);

  const admin = requireObject(evidence.admin, "PRODUCTION_EVIDENCE_ADMIN_MISSING");
  assertExactKeys(admin, ["activeSuperAdminCount", "initializationOutcome", "receipt"], "PRODUCTION_EVIDENCE_ADMIN_SCHEMA_INVALID");
  requirePositiveInteger(admin.activeSuperAdminCount, "PRODUCTION_EVIDENCE_SUPER_ADMIN_MISSING");
  if (!["existing-account-verified", "one-shot-bootstrap-verified"].includes(admin.initializationOutcome)) fail("PRODUCTION_EVIDENCE_ADMIN_INITIALIZATION_INVALID");
  validateReceipt(admin.receipt, "admin", {
    kind: "admin-initialization",
    provider: admin.initializationOutcome === "existing-account-verified" ? "release-preflight-cli" : "bootstrap-admin-cli",
    outcome: admin.initializationOutcome,
    ...manifestSubject,
  }, trusted, manifestSha256);

  const storage = requireObject(evidence.storage, "PRODUCTION_EVIDENCE_STORAGE_MISSING");
  assertExactKeys(storage, ["receipt"], "PRODUCTION_EVIDENCE_STORAGE_SCHEMA_INVALID");
  validateReceipt(storage.receipt, "storage", {
    kind: "persistent-storage", provider: "docker-cli", outcome: "verified", ...manifestSubject,
  }, trusted, manifestSha256);

  const recovery = requireObject(evidence.recovery, "PRODUCTION_EVIDENCE_RECOVERY_MISSING");
  assertExactKeys(recovery, [
    "rpoSeconds", "rtoSeconds", "latestBackupAgeSeconds", "detectionSeconds", "targetPreparationSeconds",
    "databaseRestoreSeconds", "serviceRecoverySeconds", "trafficCutoverSeconds", "consistencyMode", "receipts",
  ], "PRODUCTION_EVIDENCE_RECOVERY_SCHEMA_INVALID");
  for (const field of ["rpoSeconds", "rtoSeconds", "latestBackupAgeSeconds", "detectionSeconds", "targetPreparationSeconds", "databaseRestoreSeconds", "serviceRecoverySeconds", "trafficCutoverSeconds"]) {
    if (!Number.isSafeInteger(recovery[field]) || recovery[field] < 0) fail(`PRODUCTION_EVIDENCE_RECOVERY_${field.toUpperCase()}_INVALID`);
  }
  requirePositiveInteger(recovery.rpoSeconds, "PRODUCTION_EVIDENCE_RPO_INVALID");
  requirePositiveInteger(recovery.rtoSeconds, "PRODUCTION_EVIDENCE_RTO_INVALID");
  if (recovery.latestBackupAgeSeconds > recovery.rpoSeconds) fail("PRODUCTION_EVIDENCE_RPO_NOT_MET");
  const endToEndRecoverySeconds = recovery.detectionSeconds + recovery.targetPreparationSeconds + recovery.databaseRestoreSeconds + recovery.serviceRecoverySeconds + recovery.trafficCutoverSeconds;
  if (endToEndRecoverySeconds > recovery.rtoSeconds) fail("PRODUCTION_EVIDENCE_RTO_NOT_MET");
  if (recovery.consistencyMode !== "quiesced") fail("PRODUCTION_EVIDENCE_RECOVERY_POINT_NOT_QUIESCED");
  const recoveryReceipts = requireObject(recovery.receipts, "PRODUCTION_EVIDENCE_RECOVERY_RECEIPTS_MISSING");
  const recoveryReceiptSpecs = {
    backupManifest: ["backup-manifest", "backup-cli"],
    restoreDrill: ["restore-drill", "restore-drill-cli"],
    writeQuiesce: ["write-quiesce", "release-operator"],
    offsiteReplication: ["offsite-replication", "backup-provider"],
  };
  assertExactKeys(recoveryReceipts, Object.keys(recoveryReceiptSpecs), "PRODUCTION_EVIDENCE_RECOVERY_RECEIPTS_SCHEMA_INVALID");
  for (const [key, [kind, provider]] of Object.entries(recoveryReceiptSpecs)) {
    validateReceipt(recoveryReceipts[key], `recovery.receipts.${key}`, {
      kind, provider, outcome: "verified", ...manifestSubject,
    }, trusted, manifestSha256);
  }

  for (const [sectionName, kind, provider] of [
    ["edge", "edge-security", "edge-audit"],
    ["observability", "observability-alert-drill", "monitor-audit"],
  ]) {
    const section = requireObject(evidence[sectionName], `PRODUCTION_EVIDENCE_${sectionName.toUpperCase()}_MISSING`);
    assertExactKeys(section, ["receipt"], `PRODUCTION_EVIDENCE_${sectionName.toUpperCase()}_SCHEMA_INVALID`);
    validateReceipt(section.receipt, sectionName, { kind, provider, outcome: "verified", ...manifestSubject }, trusted, manifestSha256);
  }

  const featureGates = requireObject(evidence.featureGates, "PRODUCTION_EVIDENCE_FEATURE_GATES_MISSING");
  assertExactKeys(featureGates, ["receipt"], "PRODUCTION_EVIDENCE_FEATURE_GATES_SCHEMA_INVALID");
  validateReceipt(featureGates.receipt, "featureGates", {
    kind: "feature-gates", provider: "release-preflight-cli", outcome: trusted.releaseProfile, ...manifestSubject,
  }, trusted, manifestSha256);

  if (!Array.isArray(evidence.externalServices)) fail("PRODUCTION_EVIDENCE_EXTERNAL_SERVICES_MISSING");
  const servicesByName = new Map();
  for (const service of evidence.externalServices) {
    requireObject(service, "PRODUCTION_EVIDENCE_EXTERNAL_SERVICE_INVALID");
    assertExactKeys(service, ["name", "status", "receipt"], "PRODUCTION_EVIDENCE_EXTERNAL_SERVICE_SCHEMA_INVALID");
    if (!requiredExternalServices.includes(service.name)) fail(`PRODUCTION_EVIDENCE_EXTERNAL_SERVICE_UNEXPECTED:${service.name}`);
    if (servicesByName.has(service.name)) fail(`PRODUCTION_EVIDENCE_EXTERNAL_SERVICE_DUPLICATED:${service.name}`);
    if (!["verified", "disabled", "not-applicable"].includes(service.status)) fail(`PRODUCTION_EVIDENCE_EXTERNAL_SERVICE_STATUS_INVALID:${service.name}`);
    if (trusted.releaseProfile === RELEASE_PROFILE_CONTRACT.commerceProfile &&
        service.name === "payment-gateway" && service.status !== "verified") {
      fail("PRODUCTION_EVIDENCE_COMMERCE_PAYMENT_SERVICE_NOT_VERIFIED");
    }
    servicesByName.set(service.name, service);
  }
  for (const name of requiredExternalServices) {
    if (!servicesByName.has(name)) fail(`PRODUCTION_EVIDENCE_EXTERNAL_SERVICE_MISSING:${name}`);
  }
  if (servicesByName.size !== requiredExternalServices.length) fail("PRODUCTION_EVIDENCE_EXTERNAL_SERVICE_SET_INVALID");
  for (const service of evidence.externalServices) {
    validateReceipt(service.receipt, `externalServices.${service.name}`, {
      kind: `external-service-${service.name}`,
      provider: service.status === "verified" ? "external-service-audit" : "release-policy",
      outcome: service.status,
      ...manifestSubject,
    }, trusted, manifestSha256);
  }

  const rollback = requireObject(evidence.rollback, "PRODUCTION_EVIDENCE_ROLLBACK_MISSING");
  assertExactKeys(rollback, ["runbook", "receipt"], "PRODUCTION_EVIDENCE_ROLLBACK_SCHEMA_INVALID");
  readArtifact(rollback.runbook, "rollback.runbook", trusted.evidenceRoot);
  validateReceipt(rollback.receipt, "rollback", {
    kind: "rollback-runbook", provider: "release-operator", outcome: "verified", subjectSha256: rollback.runbook.sha256,
  }, trusted, manifestSha256);
  return { manifest, manifestSha256 };
}

function executeCommand(command, args, options) {
  return new Promise((resolveResult, rejectResult) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let outputBytes = 0;
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      callback(value);
    };
    const collect = (target) => (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > 2 * 1024 * 1024) {
        child.kill();
        finish(rejectResult, Object.assign(new Error("ATTESTATION_OUTPUT_TOO_LARGE"), { code: "OUTPUT_LIMIT" }));
        return;
      }
      target.push(chunk);
    };
    child.stdout.on("data", collect(stdout));
    child.stderr.on("data", collect(stderr));
    child.on("error", (error) => finish(rejectResult, error));
    child.on("close", (exitCode) => finish(resolveResult, {
      exitCode,
      stdout: Buffer.concat(stdout).toString("utf8"),
      stderr: Buffer.concat(stderr).toString("utf8"),
    }));
  });
}

function requireTrustedRegularFile(path, evidenceRoot, code) {
  if (typeof path !== "string" || path.length === 0 || !existsSync(path)) fail(code);
  const absolutePath = resolve(path);
  if (!isWithin(realpathSync(evidenceRoot), realpathSync(absolutePath))) fail(code);
  const stat = lstatSync(absolutePath);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(code);
  return realpathSync(absolutePath);
}

function cosignPredicateName(predicateType) {
  if (predicateType === provenancePredicateType) return "slsaprovenance1";
  if (predicateType === sbomPredicateType) return "spdxjson";
  fail("PRODUCTION_EVIDENCE_PREDICATE_TYPE_UNSUPPORTED");
}

function cosignIdentityArgs(trusted, signerWorkflow) {
  return [
    "--certificate-identity", `https://${signerWorkflow}@${trusted.sourceRef}`,
    "--certificate-oidc-issuer", "https://token.actions.githubusercontent.com",
    "--certificate-github-workflow-trigger", "workflow_dispatch",
    "--certificate-github-workflow-sha", trusted.releaseGitSha,
    "--certificate-github-workflow-repository", trusted.repository,
    "--certificate-github-workflow-ref", trusted.sourceRef,
  ];
}

function blobAttestationArgs({ subject, bundlePath, trusted, signerWorkflow, predicateType }) {
  return [
    "verify-blob-attestation",
    "--bundle", bundlePath,
    "--type", cosignPredicateName(predicateType),
    ...cosignIdentityArgs(trusted, signerWorkflow),
    subject,
  ];
}

function imageSignatureArgs({ subject, bundlePath, trusted }) {
  return [
    "verify",
    "--bundle", bundlePath,
    ...cosignIdentityArgs(trusted, trusted.manifestSignerWorkflow),
    subject,
  ];
}

function imageAttestationArgs({ subject, bundlePath, trusted, predicateType }) {
  return [
    "verify-attestation",
    "--bundle", bundlePath,
    "--type", cosignPredicateName(predicateType),
    ...cosignIdentityArgs(trusted, trusted.manifestSignerWorkflow),
    subject,
  ];
}

function parseCosignDocuments(stdout, label) {
  const text = String(stdout ?? "").trim();
  if (!text) fail(`PRODUCTION_EVIDENCE_ATTESTATION_OUTPUT_INVALID:${label}`);
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    try {
      return text.split(/\r?\n/).filter(Boolean).flatMap((line) => {
        const parsed = JSON.parse(line);
        return Array.isArray(parsed) ? parsed : [parsed];
      });
    } catch {
      fail(`PRODUCTION_EVIDENCE_ATTESTATION_OUTPUT_INVALID:${label}`);
    }
  }
}

function parseCosignStatements(stdout, label) {
  return parseCosignDocuments(stdout, label).map((envelope) => {
    if (typeof envelope?.payload !== "string" || envelope.payload.length === 0) {
      fail(`PRODUCTION_EVIDENCE_ATTESTATION_OUTPUT_INVALID:${label}`);
    }
    try {
      return JSON.parse(Buffer.from(envelope.payload, "base64").toString("utf8"));
    } catch {
      fail(`PRODUCTION_EVIDENCE_ATTESTATION_OUTPUT_INVALID:${label}`);
    }
  });
}

function parseCosignImageAttestationOutput(stdout, spec, trusted) {
  const statements = parseCosignStatements(stdout, spec.label);
  const matched = statements.find((statement) =>
    statement?.predicateType === spec.predicateType &&
    Array.isArray(statement.subject) &&
    statement.subject.some((subject) => subject?.digest?.sha256 === spec.subjectSha256));
  if (!matched) fail(`PRODUCTION_EVIDENCE_ATTESTATION_RESULT_MISMATCH:${spec.label}`);
  if (spec.predicateType === provenancePredicateType) {
    const parameters = matched?.predicate?.buildDefinition?.externalParameters;
    const expectedBuilder = `https://${trusted.manifestSignerWorkflow}@${trusted.sourceRef}`;
    if (parameters?.component !== spec.component || parameters?.source !== trusted.releaseSource ||
        parameters?.releaseStage !== "production" ||
        parameters?.imageTag !== spec.manifest.imageTag ||
        parameters?.sourceRef !== trusted.sourceRef || parameters?.gitSha !== trusted.releaseGitSha ||
        matched?.predicate?.runDetails?.builder?.id?.toLowerCase() !== expectedBuilder.toLowerCase()) {
      fail(`PRODUCTION_EVIDENCE_PROVENANCE_CONTENT_MISMATCH:${spec.label}`);
    }
  } else if (matched?.predicate?.spdxVersion !== "SPDX-2.3" || matched?.predicate?.SPDXID !== "SPDXRef-DOCUMENT") {
    fail(`PRODUCTION_EVIDENCE_SBOM_CONTENT_MISMATCH:${spec.label}`);
  }
  return 1;
}

function parseCosignImageSignatureOutput(stdout, spec) {
  const matched = parseCosignDocuments(stdout, spec.label).some((entry) => {
    const critical = entry?.critical ?? entry?.Critical;
    const image = critical?.image ?? critical?.Image;
    return (image?.["docker-manifest-digest"] ?? image?.["Docker-manifest-digest"]) === `sha256:${spec.subjectSha256}`;
  });
  if (!matched) fail(`PRODUCTION_EVIDENCE_SIGNATURE_RESULT_MISMATCH:${spec.label}`);
  return 1;
}

function parseManifestProvenanceOutput(stdout, spec) {
  const statements = parseCosignStatements(stdout, spec.label);
  const matched = statements.find((statement) =>
    statement?.predicateType === provenancePredicateType &&
    statement.subject?.some((subject) => subject?.digest?.sha256 === spec.subjectSha256));
  const predicate = matched?.predicate;
  const parameters = predicate?.buildDefinition?.externalParameters;
  const expectedBuilder = `https://${spec.trusted.manifestSignerWorkflow}@${spec.trusted.sourceRef}`;
  const expectedBuildType = `${spec.trusted.releaseSource}/blob/${spec.trusted.releaseGitSha}/.github/workflows/release-images.yml#release-manifest-v6`;
  if (predicate?.buildDefinition?.buildType !== expectedBuildType ||
      parameters?.gitSha !== spec.trusted.releaseGitSha ||
      parameters?.sourceRef !== spec.trusted.sourceRef ||
      parameters?.qualityGateRunId !== spec.manifest.qualityGate.runId ||
      parameters?.schemaVersion !== spec.manifest.schemaVersion ||
      parameters?.releaseStage !== "production" ||
      parameters?.imageTag !== spec.manifest.imageTag ||
      predicate?.runDetails?.builder?.id?.toLowerCase() !== expectedBuilder.toLowerCase()) {
    fail("PRODUCTION_EVIDENCE_MANIFEST_PROVENANCE_CONTENT_MISMATCH");
  }
  const expectedDependencies = new Set([
    `${spec.trusted.releaseSource}@git:${spec.trusted.releaseGitSha}`,
    ...["server", "client", "operations"].map((component) => {
      const image = spec.manifest[component];
      return `${image.image}@${image.digest}`;
    }),
  ]);
  const resolvedDependencies = predicate?.buildDefinition?.resolvedDependencies ?? [];
  const actualDependencies = new Set(resolvedDependencies.map((dependency) =>
    dependency?.digest?.gitCommit
      ? `${dependency.uri}@git:${dependency.digest.gitCommit}`
      : `${dependency?.uri}@sha256:${dependency?.digest?.sha256}`));
  if (resolvedDependencies.length !== expectedDependencies.size ||
      actualDependencies.size !== expectedDependencies.size ||
      [...expectedDependencies].some((dependency) => !actualDependencies.has(dependency))) {
    fail("PRODUCTION_EVIDENCE_MANIFEST_PROVENANCE_DEPENDENCIES_MISMATCH");
  }
  return 1;
}

async function runAttestationVerification(executor, spec) {
  let result;
  try {
    result = await executor("cosign", spec.args, { cwd: projectRoot, shell: false });
  } catch (error) {
    if (error?.code === "ENOENT") fail("PRODUCTION_EVIDENCE_COSIGN_CLI_MISSING");
    fail(`PRODUCTION_EVIDENCE_ATTESTATION_EXECUTION_FAILED:${spec.label}`);
  }
  if (!result || result.exitCode !== 0) fail(`PRODUCTION_EVIDENCE_ATTESTATION_VERIFY_FAILED:${spec.label}`);
  if (spec.kind === "image-attestation") {
    return parseCosignImageAttestationOutput(result.stdout, spec, spec.trusted);
  }
  if (spec.kind === "image-signature") return parseCosignImageSignatureOutput(result.stdout, spec);
  if (spec.kind === "manifest-blob") return parseManifestProvenanceOutput(result.stdout, spec);
  return 1;
}

export async function verifyProductionEvidence(evidence, trusted, options = {}) {
  const validated = validateProductionEvidenceStructure(evidence, trusted);
  const evidencePath = requireTrustedRegularFile(
    options.evidencePath,
    trusted.evidenceRoot,
    "PRODUCTION_EVIDENCE_FILE_INVALID",
  );
  const evidenceBundlePath = requireTrustedRegularFile(
    options.evidenceBundlePath,
    trusted.evidenceRoot,
    "PRODUCTION_EVIDENCE_ATTESTATION_BUNDLE_INVALID",
  );
  let evidenceBundle;
  try {
    evidenceBundle = JSON.parse(readFileSync(evidenceBundlePath, "utf8"));
  } catch {
    fail("PRODUCTION_EVIDENCE_ATTESTATION_BUNDLE_JSON_INVALID");
  }
  if (evidenceBundle?.mediaType !== sigstoreBundleMediaType) {
    fail("PRODUCTION_EVIDENCE_ATTESTATION_BUNDLE_FORMAT_INVALID");
  }
  let evidenceFromDisk;
  try {
    evidenceFromDisk = JSON.parse(readFileSync(evidencePath, "utf8"));
  } catch {
    fail("PRODUCTION_EVIDENCE_JSON_INVALID");
  }
  if (!isDeepStrictEqual(evidenceFromDisk, evidence)) fail("PRODUCTION_EVIDENCE_FILE_CONTENT_MISMATCH");

  const manifestPath = resolveArtifactPath(evidence.release.manifest, "release.manifest", trusted.evidenceRoot);
  const manifestBundlePath = resolveArtifactPath(
    evidence.release.manifestAttestationBundle,
    "release.manifestAttestationBundle",
    trusted.evidenceRoot,
  );
  const specs = [
    {
      label: "production-evidence",
      args: blobAttestationArgs({
        subject: evidencePath,
        bundlePath: evidenceBundlePath,
        trusted,
        signerWorkflow: trusted.evidenceSignerWorkflow,
        predicateType: provenancePredicateType,
      }),
      predicateType: provenancePredicateType,
      subjectSha256: sha256(readFileSync(evidencePath)),
      kind: "evidence-blob",
    },
    {
      label: "release-manifest",
      args: blobAttestationArgs({
        subject: manifestPath,
        bundlePath: manifestBundlePath,
        trusted,
        signerWorkflow: trusted.manifestSignerWorkflow,
        predicateType: provenancePredicateType,
      }),
      predicateType: provenancePredicateType,
      subjectSha256: validated.manifestSha256,
      kind: "manifest-blob",
      manifest: validated.manifest,
      trusted,
    },
  ];
  for (const component of ["server", "client", "operations"]) {
    const image = validated.manifest[component];
    const signatureBundlePath = resolveArtifactPath(
      image.signatureBundle,
      `manifest.${component}.signatureBundle`,
      trusted.evidenceRoot,
    );
    specs.push({
      label: `${component}-signature`,
      args: imageSignatureArgs({ subject: image.reference, bundlePath: signatureBundlePath, trusted }),
      kind: "image-signature",
      subjectSha256: image.digest.slice("sha256:".length),
    });
    for (const [kind, predicateType] of [["provenance", provenancePredicateType], ["sbom", sbomPredicateType]]) {
      const bundlePath = resolveArtifactPath(
        image[`${kind}Bundle`],
        `manifest.${component}.${kind}Bundle`,
        trusted.evidenceRoot,
      );
      specs.push({
        label: `${component}-${kind}`,
        args: imageAttestationArgs({
          subject: image.reference,
          bundlePath,
          trusted,
          predicateType,
        }),
        kind: "image-attestation",
        component,
        manifest: validated.manifest,
        trusted,
        predicateType,
        subjectSha256: image.digest.slice("sha256:".length),
      });
    }
  }

  const executor = options.executor ?? executeCommand;
  let verifiedAttestationCount = 0;
  for (const spec of specs) {
    verifiedAttestationCount += await runAttestationVerification(executor, spec);
  }
  return { ...validated, verifiedAttestationCount, verifiedSubjects: specs.map(({ label }) => label) };
}

function parseRequiredArgs(args) {
  const allowed = new Set([
    "--evidence", "--evidence-root", "--evidence-bundle", "--environment-id-sha256",
    "--approval-reference-sha256",
    "--release-git-sha", "--migration-bundle-sha256", "--release-source", "--release-profile",
    "--repo", "--source-ref", "--manifest-signer-workflow", "--evidence-signer-workflow",
  ]);
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!allowed.has(flag)) fail(`PRODUCTION_EVIDENCE_ARGUMENT_UNKNOWN:${flag ?? ""}`);
    if (!value || value.startsWith("--")) fail(`PRODUCTION_EVIDENCE_ARGUMENT_VALUE_REQUIRED:${flag}`);
    if (values.has(flag)) fail(`PRODUCTION_EVIDENCE_ARGUMENT_DUPLICATED:${flag}`);
    values.set(flag, value);
  }
  for (const flag of allowed) {
    if (!values.has(flag)) fail(`PRODUCTION_EVIDENCE_ARGUMENT_REQUIRED:${flag}`);
  }
  return values;
}

function resolveProjectRegularFile(path, code) {
  const absolutePath = resolve(projectRoot, path);
  if (!isWithin(projectRoot, absolutePath) || !existsSync(absolutePath)) fail(code);
  const stat = lstatSync(absolutePath);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(code);
  if (!isWithin(realpathSync(projectRoot), realpathSync(absolutePath))) fail(code);
  return absolutePath;
}

function resolveProjectDirectory(path) {
  const absolutePath = resolve(projectRoot, path);
  if (!isWithin(projectRoot, absolutePath) || !existsSync(absolutePath)) fail("PRODUCTION_EVIDENCE_ROOT_INVALID");
  const stat = lstatSync(absolutePath);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail("PRODUCTION_EVIDENCE_ROOT_INVALID");
  if (!isWithin(realpathSync(projectRoot), realpathSync(absolutePath))) fail("PRODUCTION_EVIDENCE_ROOT_INVALID");
  return absolutePath;
}

async function main() {
  const args = parseRequiredArgs(process.argv.slice(2));
  const evidenceRoot = resolveProjectDirectory(args.get("--evidence-root"));
  const evidencePath = resolveProjectRegularFile(args.get("--evidence"), "PRODUCTION_EVIDENCE_FILE_INVALID");
  const evidenceBundlePath = resolveProjectRegularFile(
    args.get("--evidence-bundle"),
    "PRODUCTION_EVIDENCE_ATTESTATION_BUNDLE_INVALID",
  );
  if (!isWithin(evidenceRoot, evidencePath)) fail("PRODUCTION_EVIDENCE_FILE_OUTSIDE_ROOT");
  if (!isWithin(evidenceRoot, evidenceBundlePath)) fail("PRODUCTION_EVIDENCE_ATTESTATION_BUNDLE_OUTSIDE_ROOT");
  let evidence;
  try {
    evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  } catch {
    fail("PRODUCTION_EVIDENCE_JSON_INVALID");
  }
  const trusted = {
    evidenceRoot,
    environmentIdSha256: args.get("--environment-id-sha256"),
    approvalReferenceSha256: args.get("--approval-reference-sha256"),
    releaseGitSha: args.get("--release-git-sha"),
    migrationBundleSha256: args.get("--migration-bundle-sha256"),
    releaseSource: args.get("--release-source"),
    releaseProfile: args.get("--release-profile"),
    repository: args.get("--repo"),
    sourceRef: args.get("--source-ref"),
    manifestSignerWorkflow: args.get("--manifest-signer-workflow"),
    evidenceSignerWorkflow: args.get("--evidence-signer-workflow"),
  };
  const { manifestSha256, verifiedAttestationCount, verifiedSubjects } = await verifyProductionEvidence(
    evidence,
    trusted,
    { evidencePath, evidenceBundlePath },
  );
  return {
    ok: true,
    releaseGitSha: trusted.releaseGitSha,
    environmentIdSha256: trusted.environmentIdSha256,
    releaseProfile: trusted.releaseProfile,
    manifestSha256,
    generatedAt: evidence.generatedAt,
    verifiedAttestationCount,
    verifiedSubjects,
  };
}

const isDirectExecution = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isDirectExecution) {
  try {
    console.log(JSON.stringify(await main(), null, 2));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, code: error instanceof Error ? error.message : "PRODUCTION_EVIDENCE_VERIFICATION_FAILED" }));
    process.exitCode = 1;
  }
}
