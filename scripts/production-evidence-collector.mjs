#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_CONFIG_PATH = "/etc/haichuan/production-evidence-collector.json";
const SHA256 = /^[a-f0-9]{64}$/;
const GIT_SHA = /^[a-f0-9]{40}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SOURCE_REF = /^refs\/(?:heads|tags)\/[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const FORBIDDEN_KEY = /(?:password|secret|token|databaseurl|connectionstring|privatekey|apikey|credential|auth)/;
const EXTERNAL_SERVICES = [
  "email",
  "sms",
  "logistics",
  "payment-gateway",
  "wechat",
  "object-storage",
];
const RECEIPT_SPECS = Object.freeze({
  "database-preflight": ["database-preflight", "release-preflight-cli"],
  admin: ["admin-initialization", null],
  storage: ["persistent-storage", "docker-cli"],
  "backup-manifest": ["backup-manifest", "backup-cli"],
  "restore-drill": ["restore-drill", "restore-drill-cli"],
  "write-quiesce": ["write-quiesce", "release-operator"],
  "offsite-replication": ["offsite-replication", "backup-provider"],
  edge: ["edge-security", "edge-audit"],
  observability: ["observability-alert-drill", "monitor-audit"],
  "feature-gates": ["feature-gates", "release-preflight-cli"],
  rollback: ["rollback-runbook", "release-operator"],
});
const RECEIPT_KEYS = [
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
];

function fail(code) {
  throw new Error(code);
}

function normalizeKey(key) {
  return key.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function rejectSensitiveKeys(value, path = "value") {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEY.test(normalizeKey(key))) fail(`PRODUCTION_EVIDENCE_COLLECTOR_SENSITIVE_KEY:${path}.${key}`);
    rejectSensitiveKeys(child, `${path}.${key}`);
  }
}

function exactKeys(value, keys, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail(code);
  return value;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function requireSha(value, code) {
  if (!SHA256.test(value ?? "")) fail(code);
  return value;
}

function requirePositiveInteger(value, code) {
  if (!Number.isSafeInteger(value) || value <= 0) fail(code);
  return value;
}

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function readBoundedStdin(stream, limit = 2 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  return new Promise((accept, reject) => {
    stream.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("PRODUCTION_EVIDENCE_COLLECTOR_REQUEST_TOO_LARGE"));
        stream.destroy();
        return;
      }
      chunks.push(chunk);
    });
    stream.on("end", () => accept(Buffer.concat(chunks)));
    stream.on("error", () => reject(new Error("PRODUCTION_EVIDENCE_COLLECTOR_REQUEST_READ_FAILED")));
  });
}

function assertRegularTrustedFile(path, { enforceOwnership, maxBytes, code }) {
  if (!existsSync(path)) fail(code);
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size <= 0 || info.size > maxBytes) fail(code);
  if (enforceOwnership && process.platform !== "win32" && (info.uid !== 0 || (info.mode & 0o022) !== 0)) fail(code);
  return info;
}

function readTrustedJson(path, options) {
  assertRegularTrustedFile(path, options);
  let value;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    fail(options.code);
  }
  rejectSensitiveKeys(value, basename(path));
  return value;
}

function validateRequest(request) {
  exactKeys(request, [
    "schemaVersion", "repository", "releaseSource", "releaseRunId", "evidenceRunId",
    "releaseGitSha", "sourceRef", "migrationBundleSha256", "releaseProfile",
    "environmentIdSha256", "approvalReferenceSha256", "releaseOwner", "rollbackOwner",
    "incidentOwner", "manifestSha256", "rollbackRunbookSha256", "manifest",
  ], "PRODUCTION_EVIDENCE_COLLECTOR_REQUEST_SCHEMA_INVALID");
  if (request.schemaVersion !== 1 || !REPOSITORY.test(request.repository ?? "")) fail("PRODUCTION_EVIDENCE_COLLECTOR_REQUEST_INVALID");
  if (request.releaseSource?.toLowerCase() !== `https://github.com/${request.repository.toLowerCase()}`) fail("PRODUCTION_EVIDENCE_COLLECTOR_REQUEST_SOURCE_INVALID");
  requirePositiveInteger(request.releaseRunId, "PRODUCTION_EVIDENCE_COLLECTOR_RELEASE_RUN_INVALID");
  requirePositiveInteger(request.evidenceRunId, "PRODUCTION_EVIDENCE_COLLECTOR_EVIDENCE_RUN_INVALID");
  if (!GIT_SHA.test(request.releaseGitSha ?? "") || !SOURCE_REF.test(request.sourceRef ?? "") || request.sourceRef.includes("..") || request.sourceRef.includes("//")) {
    fail("PRODUCTION_EVIDENCE_COLLECTOR_REQUEST_RELEASE_INVALID");
  }
  for (const field of ["migrationBundleSha256", "environmentIdSha256", "approvalReferenceSha256", "manifestSha256", "rollbackRunbookSha256"]) {
    requireSha(request[field], `PRODUCTION_EVIDENCE_COLLECTOR_REQUEST_${field.toUpperCase()}_INVALID`);
  }
  if (!['lead-generation', 'commerce'].includes(request.releaseProfile)) fail("PRODUCTION_EVIDENCE_COLLECTOR_REQUEST_PROFILE_INVALID");
  for (const field of ["releaseOwner", "rollbackOwner", "incidentOwner"]) {
    if (typeof request[field] !== "string" || request[field].trim() !== request[field] || request[field].length < 2 || request[field].length > 120) {
      fail(`PRODUCTION_EVIDENCE_COLLECTOR_REQUEST_${field.toUpperCase()}_INVALID`);
    }
  }
  const manifest = request.manifest;
  if (!manifest || manifest.schemaVersion !== 5 || manifest.releaseStage !== "production" || manifest.gitSha !== request.releaseGitSha ||
      manifest.migrationBundleSha256 !== request.migrationBundleSha256 || manifest.source !== request.releaseSource ||
      manifest.attestationPolicy?.sourceRef !== request.sourceRef) {
    fail("PRODUCTION_EVIDENCE_COLLECTOR_REQUEST_MANIFEST_BINDING_INVALID");
  }
  for (const component of ["server", "client", "operations"]) {
    if (!/^ghcr\.io\/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$/.test(manifest[component]?.reference ?? "")) {
      fail(`PRODUCTION_EVIDENCE_COLLECTOR_REQUEST_${component.toUpperCase()}_IMAGE_INVALID`);
    }
  }
  return request;
}

function validateConfig(config, request, enforceOwnership) {
  exactKeys(config, [
    "schemaVersion", "environmentIdSha256", "contractRoot", "composeEnvFile", "composeFiles",
    "composeProjectName", "containerNames", "receiptRoot", "maxReceiptAgeSeconds", "environmentContract",
  ], "PRODUCTION_EVIDENCE_COLLECTOR_CONFIG_SCHEMA_INVALID");
  if (config.schemaVersion !== 1 || config.environmentIdSha256 !== request.environmentIdSha256) fail("PRODUCTION_EVIDENCE_COLLECTOR_CONFIG_ENVIRONMENT_MISMATCH");
  for (const field of ["contractRoot", "composeEnvFile", "receiptRoot"]) {
    if (!isAbsolute(config[field] ?? "")) fail(`PRODUCTION_EVIDENCE_COLLECTOR_CONFIG_${field.toUpperCase()}_INVALID`);
  }
  if (!Array.isArray(config.composeFiles) || config.composeFiles.length === 0 || config.composeFiles.length > 8 || config.composeFiles.some((item) => !isAbsolute(item))) {
    fail("PRODUCTION_EVIDENCE_COLLECTOR_CONFIG_COMPOSE_FILES_INVALID");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$/.test(config.composeProjectName ?? "")) fail("PRODUCTION_EVIDENCE_COLLECTOR_CONFIG_PROJECT_INVALID");
  exactKeys(config.containerNames, ["server", "client", "backup"], "PRODUCTION_EVIDENCE_COLLECTOR_CONFIG_CONTAINERS_INVALID");
  for (const value of Object.values(config.containerNames)) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(value ?? "")) fail("PRODUCTION_EVIDENCE_COLLECTOR_CONFIG_CONTAINER_INVALID");
  }
  if (!Number.isSafeInteger(config.maxReceiptAgeSeconds) || config.maxReceiptAgeSeconds < 60 || config.maxReceiptAgeSeconds > 86400) {
    fail("PRODUCTION_EVIDENCE_COLLECTOR_CONFIG_RECEIPT_AGE_INVALID");
  }
  exactKeys(config.environmentContract, [
    "backupIntervalSeconds", "backupRpoSeconds", "restoreRtoSeconds", "backupRetentionDays",
    "backupDbReadyTimeoutSeconds", "mysqlVolumeName", "uploadsVolumeName", "privateMediaVolumeName", "backupHostDir",
  ], "PRODUCTION_EVIDENCE_COLLECTOR_CONFIG_ENVIRONMENT_CONTRACT_INVALID");
  const root = realpathSync(config.contractRoot);
  const receipts = realpathSync(config.receiptRoot);
  for (const dir of [root, receipts]) {
    const info = statSync(dir);
    if (!info.isDirectory() || (enforceOwnership && process.platform !== "win32" && (info.uid !== 0 || (info.mode & 0o022) !== 0))) {
      fail("PRODUCTION_EVIDENCE_COLLECTOR_CONFIG_DIRECTORY_UNTRUSTED");
    }
  }
  for (const path of [config.composeEnvFile, ...config.composeFiles]) {
    assertRegularTrustedFile(path, { enforceOwnership, maxBytes: 2 * 1024 * 1024, code: "PRODUCTION_EVIDENCE_COLLECTOR_COMPOSE_INPUT_UNTRUSTED" });
  }
  return { ...config, contractRoot: root, receiptRoot: receipts };
}

function execute(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      cwd: options.cwd,
      env: options.env,
      encoding: "utf8",
      input: options.input,
      stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
      maxBuffer: 256 * 1024,
      timeout: 120_000,
      windowsHide: true,
    }).trim();
  } catch {
    fail(options.failureCode ?? "PRODUCTION_EVIDENCE_COLLECTOR_PROBE_FAILED");
  }
}

function runtimeEnvironment(request, config) {
  const result = { ...process.env };
  for (const component of ["server", "client", "operations"]) {
    const entry = request.manifest[component];
    result[`${component.toUpperCase()}_IMAGE_NAME`] = entry.image;
    result[`${component.toUpperCase()}_IMAGE_DIGEST`] = entry.digest.slice("sha256:".length);
  }
  Object.assign(result, {
    RELEASE_GIT_SHA: request.releaseGitSha,
    RELEASE_SOURCE: request.releaseSource,
    MIGRATION_BUNDLE_SHA256: request.migrationBundleSha256,
    BACKUP_INTERVAL_SECONDS: String(config.environmentContract.backupIntervalSeconds),
    BACKUP_RPO_SECONDS: String(config.environmentContract.backupRpoSeconds),
    RESTORE_RTO_SECONDS: String(config.environmentContract.restoreRtoSeconds),
    BACKUP_RETENTION_DAYS: String(config.environmentContract.backupRetentionDays),
    BACKUP_DB_READY_TIMEOUT_SECONDS: String(config.environmentContract.backupDbReadyTimeoutSeconds),
    MYSQL_VOLUME_NAME: config.environmentContract.mysqlVolumeName,
    UPLOADS_VOLUME_NAME: config.environmentContract.uploadsVolumeName,
    PRIVATE_MEDIA_VOLUME_NAME: config.environmentContract.privateMediaVolumeName,
    BACKUP_HOST_DIR: config.environmentContract.backupHostDir,
  });
  return result;
}

function validateProbeJson(output, mode, request) {
  let value;
  try { value = JSON.parse(output); } catch { fail(`PRODUCTION_EVIDENCE_COLLECTOR_${mode.toUpperCase()}_OUTPUT_INVALID`); }
  if (value?.ok !== true || value.mode !== mode || value.gitSha !== request.releaseGitSha || value.migrationBundleSha256 !== request.migrationBundleSha256) {
    fail(`PRODUCTION_EVIDENCE_COLLECTOR_${mode.toUpperCase()}_FAILED`);
  }
}

function inspectRunningContainer(run, name, expectedImage) {
  const output = run("docker", [
    "container", "inspect", name, "--format",
    "{{json .Config.Image}}|{{json .State.Status}}|{{if .State.Health}}{{json .State.Health.Status}}{{else}}null{{end}}",
  ], { failureCode: "PRODUCTION_EVIDENCE_COLLECTOR_CONTAINER_INSPECT_FAILED" });
  const parts = output.split("|");
  if (parts.length !== 3) fail("PRODUCTION_EVIDENCE_COLLECTOR_CONTAINER_OUTPUT_INVALID");
  let image;
  let status;
  let health;
  try { [image, status, health] = parts.map((part) => JSON.parse(part)); } catch { fail("PRODUCTION_EVIDENCE_COLLECTOR_CONTAINER_OUTPUT_INVALID"); }
  if (image !== expectedImage || status !== "running" || health !== "healthy") fail(`PRODUCTION_EVIDENCE_COLLECTOR_CONTAINER_NOT_READY:${name}`);
}

function receiptDescriptor(path, bytes) {
  return { path, sha256: sha256(bytes) };
}

function validateFreshTime(value, nowMs, maxAgeSeconds, code) {
  if (!ISO_UTC.test(value ?? "")) fail(code);
  const observed = Date.parse(value);
  if (!Number.isFinite(observed) || observed > nowMs + 60_000 || nowMs - observed > maxAgeSeconds * 1000) fail(code);
}

function validateReceipt(receipt, { request, kind, provider, outcome, subjectSha256, nowMs, maxAgeSeconds, label }) {
  exactKeys(receipt, RECEIPT_KEYS, `PRODUCTION_EVIDENCE_COLLECTOR_RECEIPT_SCHEMA_INVALID:${label}`);
  if (receipt.schemaVersion !== 1 || receipt.kind !== kind || (provider && receipt.provider !== provider) || receipt.outcome !== outcome ||
      receipt.environmentIdSha256 !== request.environmentIdSha256 || receipt.approvalReferenceSha256 !== request.approvalReferenceSha256 ||
      receipt.releaseGitSha !== request.releaseGitSha || receipt.manifestSha256 !== request.manifestSha256 || receipt.subjectSha256 !== subjectSha256) {
    fail(`PRODUCTION_EVIDENCE_COLLECTOR_RECEIPT_BINDING_INVALID:${label}`);
  }
  validateFreshTime(receipt.observedAt, nowMs, maxAgeSeconds, `PRODUCTION_EVIDENCE_COLLECTOR_RECEIPT_STALE:${label}`);
  return receipt;
}

function makeReceipt(request, generatedAt, kind, provider, outcome, subjectSha256) {
  return {
    schemaVersion: 1,
    kind,
    provider,
    outcome,
    observedAt: generatedAt,
    environmentIdSha256: request.environmentIdSha256,
    approvalReferenceSha256: request.approvalReferenceSha256,
    releaseGitSha: request.releaseGitSha,
    manifestSha256: request.manifestSha256,
    subjectSha256,
  };
}

function loadEvidenceInputs(config, request, { nowMs, enforceOwnership }) {
  const read = (name, maxBytes = 256 * 1024) => {
    const path = join(config.receiptRoot, name);
    assertRegularTrustedFile(path, { enforceOwnership, maxBytes, code: `PRODUCTION_EVIDENCE_COLLECTOR_INPUT_UNTRUSTED:${name}` });
    const bytes = readFileSync(path);
    return { bytes, value: readTrustedJson(path, { enforceOwnership, maxBytes, code: `PRODUCTION_EVIDENCE_COLLECTOR_INPUT_INVALID:${name}` }) };
  };
  const factsInput = read("facts.json");
  const facts = exactKeys(factsInput.value, [
    "schemaVersion", "generatedAt", "environmentIdSha256", "approvalReferenceSha256", "releaseGitSha", "manifestSha256",
    "database", "admin", "recovery", "externalServices",
  ], "PRODUCTION_EVIDENCE_COLLECTOR_FACTS_SCHEMA_INVALID");
  if (facts.schemaVersion !== 1 || facts.environmentIdSha256 !== request.environmentIdSha256 ||
      facts.approvalReferenceSha256 !== request.approvalReferenceSha256 || facts.releaseGitSha !== request.releaseGitSha ||
      facts.manifestSha256 !== request.manifestSha256) fail("PRODUCTION_EVIDENCE_COLLECTOR_FACTS_BINDING_INVALID");
  validateFreshTime(facts.generatedAt, nowMs, config.maxReceiptAgeSeconds, "PRODUCTION_EVIDENCE_COLLECTOR_FACTS_STALE");
  exactKeys(facts.database, ["migrationStatus"], "PRODUCTION_EVIDENCE_COLLECTOR_DATABASE_FACTS_INVALID");
  if (facts.database.migrationStatus !== "up-to-date") fail("PRODUCTION_EVIDENCE_COLLECTOR_MIGRATION_NOT_CURRENT");
  exactKeys(facts.admin, ["activeSuperAdminCount", "initializationOutcome"], "PRODUCTION_EVIDENCE_COLLECTOR_ADMIN_FACTS_INVALID");
  requirePositiveInteger(facts.admin.activeSuperAdminCount, "PRODUCTION_EVIDENCE_COLLECTOR_ADMIN_MISSING");
  if (!["existing-account-verified", "one-shot-bootstrap-verified"].includes(facts.admin.initializationOutcome)) fail("PRODUCTION_EVIDENCE_COLLECTOR_ADMIN_OUTCOME_INVALID");
  exactKeys(facts.recovery, [
    "rpoSeconds", "rtoSeconds", "latestBackupAgeSeconds", "detectionSeconds", "targetPreparationSeconds",
    "databaseRestoreSeconds", "serviceRecoverySeconds", "trafficCutoverSeconds", "consistencyMode",
  ], "PRODUCTION_EVIDENCE_COLLECTOR_RECOVERY_FACTS_INVALID");
  for (const field of ["rpoSeconds", "rtoSeconds"]) requirePositiveInteger(facts.recovery[field], "PRODUCTION_EVIDENCE_COLLECTOR_RECOVERY_LIMIT_INVALID");
  for (const field of ["latestBackupAgeSeconds", "detectionSeconds", "targetPreparationSeconds", "databaseRestoreSeconds", "serviceRecoverySeconds", "trafficCutoverSeconds"]) {
    if (!Number.isSafeInteger(facts.recovery[field]) || facts.recovery[field] < 0) fail("PRODUCTION_EVIDENCE_COLLECTOR_RECOVERY_TIMING_INVALID");
  }
  const recoveryTotal = facts.recovery.detectionSeconds + facts.recovery.targetPreparationSeconds + facts.recovery.databaseRestoreSeconds + facts.recovery.serviceRecoverySeconds + facts.recovery.trafficCutoverSeconds;
  if (facts.recovery.consistencyMode !== "quiesced" || facts.recovery.latestBackupAgeSeconds > facts.recovery.rpoSeconds || recoveryTotal > facts.recovery.rtoSeconds) {
    fail("PRODUCTION_EVIDENCE_COLLECTOR_RECOVERY_OBJECTIVE_NOT_MET");
  }
  if (!Array.isArray(facts.externalServices) || facts.externalServices.length !== EXTERNAL_SERVICES.length) fail("PRODUCTION_EVIDENCE_COLLECTOR_EXTERNAL_FACTS_INVALID");
  const external = new Map();
  for (const item of facts.externalServices) {
    exactKeys(item, ["name", "status"], "PRODUCTION_EVIDENCE_COLLECTOR_EXTERNAL_FACT_INVALID");
    if (!EXTERNAL_SERVICES.includes(item.name) || external.has(item.name) || !["verified", "disabled", "not-applicable"].includes(item.status)) {
      fail("PRODUCTION_EVIDENCE_COLLECTOR_EXTERNAL_FACT_INVALID");
    }
    if (request.releaseProfile === "commerce" && item.name === "payment-gateway" && item.status !== "verified") fail("PRODUCTION_EVIDENCE_COLLECTOR_COMMERCE_PAYMENT_NOT_VERIFIED");
    external.set(item.name, item.status);
  }

  const preflight = read("database-preflight-report.json", 1024 * 1024);
  if (!preflight.value || typeof preflight.value !== "object") fail("PRODUCTION_EVIDENCE_COLLECTOR_PREFLIGHT_REPORT_INVALID");
  const inputs = new Map([["database-preflight-report.json", preflight.bytes]]);
  const receipt = (name, kind, provider, outcome, subject = request.manifestSha256) => {
    const input = read(`${name}.json`);
    validateReceipt(input.value, { request, kind, provider, outcome, subjectSha256: subject, nowMs, maxAgeSeconds: config.maxReceiptAgeSeconds, label: name });
    inputs.set(`${name}.json`, input.bytes);
    return receiptDescriptor(`${name}.json`, input.bytes);
  };
  const descriptors = {
    databasePreflight: receipt("database-preflight", ...RECEIPT_SPECS["database-preflight"], "up-to-date", sha256(preflight.bytes)),
    admin: receipt("admin", RECEIPT_SPECS.admin[0], facts.admin.initializationOutcome === "existing-account-verified" ? "release-preflight-cli" : "bootstrap-admin-cli", facts.admin.initializationOutcome),
    storage: receipt("storage", ...RECEIPT_SPECS.storage, "verified"),
    backupManifest: receipt("backup-manifest", ...RECEIPT_SPECS["backup-manifest"], "verified"),
    restoreDrill: receipt("restore-drill", ...RECEIPT_SPECS["restore-drill"], "verified"),
    writeQuiesce: receipt("write-quiesce", ...RECEIPT_SPECS["write-quiesce"], "verified"),
    offsiteReplication: receipt("offsite-replication", ...RECEIPT_SPECS["offsite-replication"], "verified"),
    edge: receipt("edge", ...RECEIPT_SPECS.edge, "verified"),
    observability: receipt("observability", ...RECEIPT_SPECS.observability, "verified"),
    featureGates: receipt("feature-gates", ...RECEIPT_SPECS["feature-gates"], request.releaseProfile),
    rollback: receipt("rollback", ...RECEIPT_SPECS.rollback, "verified", request.rollbackRunbookSha256),
  };
  descriptors.externalServices = EXTERNAL_SERVICES.map((name) => {
    const status = external.get(name);
    return {
      name,
      status,
      receipt: receipt(`external-${name}`, `external-service-${name}`, status === "verified" ? "external-service-audit" : "release-policy", status),
    };
  });
  return { facts, inputs, descriptors, preflightDescriptor: receiptDescriptor("database-preflight-report.json", preflight.bytes) };
}

export function collectProductionEvidence({ request, config, selfPath, run = execute, now = () => new Date(), enforceOwnership = true }) {
  validateRequest(request);
  const trustedConfig = validateConfig(config, request, enforceOwnership);
  assertRegularTrustedFile(selfPath, { enforceOwnership, maxBytes: 2 * 1024 * 1024, code: "PRODUCTION_EVIDENCE_COLLECTOR_SELF_UNTRUSTED" });
  const collectorSha256 = sha256(readFileSync(selfPath));
  const generatedAt = now().toISOString().replace(/\.\d{3}Z$/, "Z");
  const nowMs = Date.parse(generatedAt);
  const work = mkdtempSync(join(tmpdir(), "haichuan-production-evidence-"));
  try {
    const manifestPath = join(work, "release-manifest.json");
    writeFileSync(manifestPath, canonicalJson(request.manifest), { flag: "wx", mode: 0o600 });
    const env = runtimeEnvironment(request, trustedConfig);
    const verifier = join(trustedConfig.contractRoot, "scripts", "verify-release-images.mjs");
    assertRegularTrustedFile(verifier, { enforceOwnership, maxBytes: 2 * 1024 * 1024, code: "PRODUCTION_EVIDENCE_COLLECTOR_VERIFIER_UNTRUSTED" });
    validateProbeJson(run("node", [verifier, "--manifest", manifestPath, "--environment"], {
      cwd: trustedConfig.contractRoot, env, failureCode: "PRODUCTION_EVIDENCE_COLLECTOR_ENVIRONMENT_PROBE_FAILED",
    }), "environment", request);
    validateProbeJson(run("node", [verifier, "--runtime"], {
      cwd: trustedConfig.contractRoot, env, failureCode: "PRODUCTION_EVIDENCE_COLLECTOR_RUNTIME_PROBE_FAILED",
    }), "runtime", request);

    const composeArgs = ["compose", "--env-file", trustedConfig.composeEnvFile, "--project-name", trustedConfig.composeProjectName];
    for (const file of trustedConfig.composeFiles) composeArgs.push("-f", file);
    composeArgs.push("config", "--images");
    const composeImages = run("docker", composeArgs, { cwd: trustedConfig.contractRoot, failureCode: "PRODUCTION_EVIDENCE_COLLECTOR_COMPOSE_PROBE_FAILED" })
      .split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (composeImages.length === 0 || composeImages.some((image) => !/.+@sha256:[a-f0-9]{64}$/.test(image))) fail("PRODUCTION_EVIDENCE_COLLECTOR_COMPOSE_IMAGE_UNPINNED");
    for (const component of ["server", "client", "operations"]) {
      if (!composeImages.includes(request.manifest[component].reference)) fail(`PRODUCTION_EVIDENCE_COLLECTOR_COMPOSE_IMAGE_MISSING:${component}`);
    }
    inspectRunningContainer(run, trustedConfig.containerNames.server, request.manifest.server.reference);
    inspectRunningContainer(run, trustedConfig.containerNames.client, request.manifest.client.reference);
    inspectRunningContainer(run, trustedConfig.containerNames.backup, request.manifest.operations.reference);

    const bundlePath = join(trustedConfig.receiptRoot, "release-manifest.attestation.json");
    assertRegularTrustedFile(bundlePath, { enforceOwnership, maxBytes: 2 * 1024 * 1024, code: "PRODUCTION_EVIDENCE_COLLECTOR_MANIFEST_BUNDLE_UNTRUSTED" });
    const manifestBundleSha256 = sha256(readFileSync(bundlePath));
    const { facts, inputs, descriptors, preflightDescriptor } = loadEvidenceInputs(trustedConfig, request, { nowMs, enforceOwnership });
    const runtimeBytes = Buffer.from(canonicalJson(makeReceipt(request, generatedAt, "runtime-identity", "docker-cli", "verified", request.manifestSha256)));
    const composeBytes = Buffer.from(canonicalJson(makeReceipt(request, generatedAt, "compose-contract", "docker-compose", "verified", request.manifestSha256)));
    inputs.set("runtime-identity.json", runtimeBytes);
    inputs.set("compose-contract.json", composeBytes);
    const evidence = {
      schemaVersion: 3,
      generatedAt,
      environment: {
        approvalReferenceSha256: request.approvalReferenceSha256,
        releaseOwner: request.releaseOwner,
        rollbackOwner: request.rollbackOwner,
        incidentOwner: request.incidentOwner,
      },
      release: {
        manifest: { path: "release-manifest.json", sha256: request.manifestSha256 },
        manifestAttestationBundle: { path: "release-manifest.attestation.json", sha256: manifestBundleSha256 },
        runtimeIdentityReceipt: receiptDescriptor("runtime-identity.json", runtimeBytes),
        composeContractReceipt: receiptDescriptor("compose-contract.json", composeBytes),
      },
      database: { migrationStatus: "up-to-date", preflightReport: preflightDescriptor, preflightReceipt: descriptors.databasePreflight },
      admin: { activeSuperAdminCount: facts.admin.activeSuperAdminCount, initializationOutcome: facts.admin.initializationOutcome, receipt: descriptors.admin },
      storage: { receipt: descriptors.storage },
      recovery: { ...facts.recovery, receipts: {
        backupManifest: descriptors.backupManifest,
        restoreDrill: descriptors.restoreDrill,
        writeQuiesce: descriptors.writeQuiesce,
        offsiteReplication: descriptors.offsiteReplication,
      } },
      edge: { receipt: descriptors.edge },
      observability: { receipt: descriptors.observability },
      featureGates: { receipt: descriptors.featureGates },
      externalServices: descriptors.externalServices,
      rollback: { runbook: { path: "rollback-runbook.md", sha256: request.rollbackRunbookSha256 }, receipt: descriptors.rollback },
    };
    const evidenceBytes = Buffer.from(canonicalJson(evidence));
    inputs.set("production-evidence.json", evidenceBytes);
    const files = [...inputs.entries()].map(([path, bytes]) => ({ path, sha256: sha256(bytes), contentBase64: bytes.toString("base64") }));
    return {
      schemaVersion: 1,
      collectorSha256,
      environmentIdSha256: request.environmentIdSha256,
      approvalReferenceSha256: request.approvalReferenceSha256,
      releaseGitSha: request.releaseGitSha,
      migrationBundleSha256: request.migrationBundleSha256,
      repository: request.repository,
      sourceRef: request.sourceRef,
      releaseProfile: request.releaseProfile,
      releaseRunId: request.releaseRunId,
      evidenceRunId: request.evidenceRunId,
      releaseOwner: request.releaseOwner,
      rollbackOwner: request.rollbackOwner,
      incidentOwner: request.incidentOwner,
      generatedAt,
      files,
    };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

async function main() {
  if (process.argv.length !== 2) fail("PRODUCTION_EVIDENCE_COLLECTOR_ARGUMENTS_FORBIDDEN");
  const requestBytes = await readBoundedStdin(process.stdin);
  let request;
  try { request = JSON.parse(requestBytes.toString("utf8")); } catch { fail("PRODUCTION_EVIDENCE_COLLECTOR_REQUEST_JSON_INVALID"); }
  const config = readTrustedJson(DEFAULT_CONFIG_PATH, {
    enforceOwnership: true,
    maxBytes: 256 * 1024,
    code: "PRODUCTION_EVIDENCE_COLLECTOR_CONFIG_UNTRUSTED",
  });
  const selfPath = realpathSync(fileURLToPath(import.meta.url));
  process.stdout.write(canonicalJson(collectProductionEvidence({ request, config, selfPath })));
}

const direct = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (direct) {
  main().catch((error) => {
    const code = error instanceof Error && /^PRODUCTION_EVIDENCE_COLLECTOR_[A-Z0-9_:-]+$/.test(error.message)
      ? error.message
      : "PRODUCTION_EVIDENCE_COLLECTOR_FAILED";
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}
