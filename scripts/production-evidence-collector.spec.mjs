import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { collectProductionEvidence } from "./production-evidence-collector.mjs";

const sha = (character) => character.repeat(64);
const gitSha = "a".repeat(40);
const now = new Date("2026-09-14T10:00:00Z");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const selfPath = fileURLToPath(new URL("./production-evidence-collector.mjs", import.meta.url));

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "haichuan-production-collector-"));
  const contractRoot = join(root, "contract");
  const receiptRoot = join(root, "receipts");
  const composeFile = join(root, "docker-compose.yml");
  const composeEnvFile = join(root, "production.env");
  mkdirSync(join(contractRoot, "scripts"), { recursive: true });
  mkdirSync(receiptRoot, { recursive: true });
  writeFileSync(join(contractRoot, "scripts", "verify-release-images.mjs"), "// fixed verifier\n");
  writeFileSync(composeFile, "services: {}\n");
  writeFileSync(composeEnvFile, "# values intentionally omitted in test\n");

  const image = (component, character) => ({
    image: `ghcr.io/example/haichuan-${component}`,
    digest: `sha256:${sha(character)}`,
    reference: `ghcr.io/example/haichuan-${component}@sha256:${sha(character)}`,
  });
  const request = {
    schemaVersion: 1,
    repository: "example/haichuan",
    releaseSource: "https://github.com/example/haichuan",
    releaseRunId: 101,
    evidenceRunId: 202,
    releaseGitSha: gitSha,
    sourceRef: "refs/heads/main",
    migrationBundleSha256: sha("b"),
    releaseProfile: "lead-generation",
    environmentIdSha256: sha("1"),
    approvalReferenceSha256: sha("2"),
    releaseOwner: "release-owner",
    rollbackOwner: "rollback-owner",
    incidentOwner: "incident-owner",
    manifestSha256: sha("3"),
    rollbackRunbookSha256: sha("4"),
    manifest: {
      schemaVersion: 5,
      releaseStage: "production",
      gitSha,
      migrationBundleSha256: sha("b"),
      source: "https://github.com/example/haichuan",
      attestationPolicy: { sourceRef: "refs/heads/main" },
      server: image("server", "c"),
      client: image("client", "d"),
      operations: image("operations", "e"),
    },
  };
  const config = {
    schemaVersion: 1,
    environmentIdSha256: sha("1"),
    contractRoot,
    composeEnvFile,
    composeFiles: [composeFile],
    composeProjectName: "haichuan",
    containerNames: { server: "jewelry-server", client: "jewelry-client", backup: "jewelry-backup" },
    receiptRoot,
    maxReceiptAgeSeconds: 600,
    environmentContract: {
      backupIntervalSeconds: 3600,
      backupRpoSeconds: 86400,
      restoreRtoSeconds: 3600,
      backupRetentionDays: 30,
      backupDbReadyTimeoutSeconds: 60,
      mysqlVolumeName: "haichuan_mysql",
      uploadsVolumeName: "haichuan_uploads",
      privateMediaVolumeName: "haichuan_private_media",
      backupHostDir: "/srv/haichuan/backups",
    },
  };
  const receipt = (kind, provider, outcome, subjectSha256 = request.manifestSha256) => ({
    schemaVersion: 1,
    kind,
    provider,
    outcome,
    observedAt: "2026-09-14T09:59:00Z",
    environmentIdSha256: request.environmentIdSha256,
    approvalReferenceSha256: request.approvalReferenceSha256,
    releaseGitSha: request.releaseGitSha,
    manifestSha256: request.manifestSha256,
    subjectSha256,
  });
  const preflight = Buffer.from('{"schemaVersion":1,"technicalReady":true}\n');
  writeFileSync(join(receiptRoot, "database-preflight-report.json"), preflight);
  writeJson(join(receiptRoot, "facts.json"), {
    schemaVersion: 1,
    generatedAt: "2026-09-14T09:59:00Z",
    environmentIdSha256: request.environmentIdSha256,
    approvalReferenceSha256: request.approvalReferenceSha256,
    releaseGitSha: request.releaseGitSha,
    manifestSha256: request.manifestSha256,
    database: { migrationStatus: "up-to-date" },
    admin: { activeSuperAdminCount: 1, initializationOutcome: "existing-account-verified" },
    recovery: {
      rpoSeconds: 86400,
      rtoSeconds: 3600,
      latestBackupAgeSeconds: 120,
      detectionSeconds: 30,
      targetPreparationSeconds: 120,
      databaseRestoreSeconds: 600,
      serviceRecoverySeconds: 300,
      trafficCutoverSeconds: 30,
      consistencyMode: "quiesced",
    },
    externalServices: ["email", "sms", "logistics", "payment-gateway", "wechat", "object-storage"]
      .map((name) => ({ name, status: "disabled" })),
  });
  writeJson(join(receiptRoot, "release-manifest.attestation.json"), { mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json" });
  const receiptFiles = {
    "database-preflight": receipt("database-preflight", "release-preflight-cli", "up-to-date", hash(preflight)),
    admin: receipt("admin-initialization", "release-preflight-cli", "existing-account-verified"),
    storage: receipt("persistent-storage", "docker-cli", "verified"),
    "backup-manifest": receipt("backup-manifest", "backup-cli", "verified"),
    "restore-drill": receipt("restore-drill", "restore-drill-cli", "verified"),
    "write-quiesce": receipt("write-quiesce", "release-operator", "verified"),
    "offsite-replication": receipt("offsite-replication", "backup-provider", "verified"),
    edge: receipt("edge-security", "edge-audit", "verified"),
    observability: receipt("observability-alert-drill", "monitor-audit", "verified"),
    "feature-gates": receipt("feature-gates", "release-preflight-cli", "lead-generation"),
    rollback: receipt("rollback-runbook", "release-operator", "verified", request.rollbackRunbookSha256),
  };
  for (const [name, value] of Object.entries(receiptFiles)) writeJson(join(receiptRoot, `${name}.json`), value);
  for (const name of ["email", "sms", "logistics", "payment-gateway", "wechat", "object-storage"]) {
    writeJson(join(receiptRoot, `external-${name}.json`), receipt(`external-service-${name}`, "release-policy", "disabled"));
  }
  const run = (command, args) => {
    if (command === "node" && args.includes("--environment")) return JSON.stringify({ ok: true, mode: "environment", gitSha, migrationBundleSha256: sha("b") });
    if (command === "node" && args.includes("--runtime")) return JSON.stringify({ ok: true, mode: "runtime", gitSha, migrationBundleSha256: sha("b") });
    if (command === "docker" && args[0] === "compose") {
      return [request.manifest.server.reference, request.manifest.client.reference, request.manifest.operations.reference, `mysql:8.0@sha256:${sha("f")}`].join("\n");
    }
    if (command === "docker" && args[0] === "container") {
      const name = args[2];
      const expected = name === "jewelry-server" ? request.manifest.server.reference
        : name === "jewelry-client" ? request.manifest.client.reference : request.manifest.operations.reference;
      return `${JSON.stringify(expected)}|"running"|"healthy"`;
    }
    throw new Error("unexpected command");
  };
  return { root, request, config, receiptRoot, run, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("collector emits one bound, materializable envelope after live probes and fresh provider receipts", () => {
  const item = fixture();
  try {
    const envelope = collectProductionEvidence({ ...item, selfPath, now: () => now, enforceOwnership: false });
    assert.equal(envelope.schemaVersion, 1);
    assert.equal(envelope.releaseGitSha, gitSha);
    assert.match(envelope.collectorSha256, /^[a-f0-9]{64}$/);
    const paths = envelope.files.map((file) => file.path);
    assert(paths.includes("production-evidence.json"));
    assert(paths.includes("runtime-identity.json"));
    assert(paths.includes("observability.json"));
    assert(!paths.includes("release-manifest.attestation.json"));
    const evidenceFile = envelope.files.find((file) => file.path === "production-evidence.json");
    const evidence = JSON.parse(Buffer.from(evidenceFile.contentBase64, "base64").toString("utf8"));
    assert.equal(evidence.database.migrationStatus, "up-to-date");
    assert.equal(evidence.release.manifestAttestationBundle.path, "release-manifest.attestation.json");
    assert.equal(evidence.externalServices.length, 6);
  } finally { item.cleanup(); }
});

test("collector fails closed when a mandatory provider receipt is absent", () => {
  const item = fixture();
  try {
    rmSync(join(item.receiptRoot, "observability.json"));
    assert.throws(
      () => collectProductionEvidence({ ...item, selfPath, now: () => now, enforceOwnership: false }),
      /PRODUCTION_EVIDENCE_COLLECTOR_INPUT_UNTRUSTED:observability.json/,
    );
  } finally { item.cleanup(); }
});

test("collector rejects sensitive keys even inside an otherwise valid preflight report", () => {
  const item = fixture();
  try {
    writeJson(join(item.receiptRoot, "database-preflight-report.json"), { technicalReady: true, databaseUrl: "redacted" });
    assert.throws(
      () => collectProductionEvidence({ ...item, selfPath, now: () => now, enforceOwnership: false }),
      /PRODUCTION_EVIDENCE_COLLECTOR_SENSITIVE_KEY/,
    );
  } finally { item.cleanup(); }
});

test("collector rejects a stale receipt", () => {
  const item = fixture();
  try {
    const path = join(item.receiptRoot, "edge.json");
    const value = JSON.parse(readFileSync(path, "utf8"));
    value.observedAt = "2026-09-14T09:00:00Z";
    writeJson(path, value);
    assert.throws(
      () => collectProductionEvidence({ ...item, selfPath, now: () => now, enforceOwnership: false }),
      /PRODUCTION_EVIDENCE_COLLECTOR_RECEIPT_STALE:edge/,
    );
  } finally { item.cleanup(); }
});

test("collector does not emit evidence when a runtime probe fails", () => {
  const item = fixture();
  try {
    const run = (command, args, options) => {
      if (command === "node" && args.includes("--runtime")) throw new Error(options.failureCode);
      return item.run(command, args, options);
    };
    assert.throws(
      () => collectProductionEvidence({ ...item, run, selfPath, now: () => now, enforceOwnership: false }),
      /PRODUCTION_EVIDENCE_COLLECTOR_RUNTIME_PROBE_FAILED/,
    );
  } finally { item.cleanup(); }
});
