import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { validateProductionDeployInputs } from "./prepare-production-deploy.mjs";

const sha = (value) => value.repeat(64);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const origin = "https://www.example.test";
const productionEnv = [
  "RELEASE_PROFILE=lead-generation",
  `VITE_PUBLIC_SITE_ORIGIN=${origin}`,
  "BACKUP_INTERVAL_SECONDS=3600",
  "BACKUP_RPO_SECONDS=7200",
  "RESTORE_RTO_SECONDS=3600",
  "BACKUP_RETENTION_DAYS=30",
  "BACKUP_DB_READY_TIMEOUT_SECONDS=300",
  "BACKUP_HOST_DIR=/var/backups/haichuan",
  "MYSQL_VOLUME_NAME=haichuan-production-mysql",
  "UPLOADS_VOLUME_NAME=haichuan-production-uploads",
  "PRIVATE_MEDIA_VOLUME_NAME=haichuan-production-private",
  "",
].join("\n");

function pageDocuments() {
  return [
    ["about", "/about", "1"],
    ["catalog", "/catalog", "2"],
    ["contact", "/contact", "3"],
    ["custom", "/custom", "4"],
    ["home", "/", "5"],
    ["products", "/products", "6"],
  ].map(([pageKey, path, digit]) => ({ pageKey, path, contentHash: sha(digit) }));
}

function manifest() {
  const gitSha = "a".repeat(40);
  const image = (component, value) => ({
    image: `ghcr.io/zhanyanzhou/haichuan-${component}`,
    digest: `sha256:${sha(value)}`,
    reference: `ghcr.io/zhanyanzhou/haichuan-${component}@sha256:${sha(value)}`,
    signatureBundle: { path: `attestations/${component}-image.sigstore.json`, sha256: sha("4") },
    provenanceBundle: { path: `attestations/${component}-provenance.sigstore.json`, sha256: sha("5") },
    sbomBundle: { path: `attestations/${component}-sbom.sigstore.json`, sha256: sha("6") },
    provenancePredicateType: "https://slsa.dev/provenance/v1",
    sbomPredicateType: "https://spdx.dev/Document",
  });
  return {
    schemaVersion: 9,
    assuranceLevel: "high",
    releaseStage: "production",
    imageTag: `sha-${gitSha}`,
    gitSha,
    migrationBundleSha256: sha("b"),
    source: "https://github.com/Zhanyanzhou/haichuan",
    qualityGate: {
      workflow: "quality.yml",
      runId: 1234,
      runUrl: "https://github.com/Zhanyanzhou/haichuan/actions/runs/1234",
      headSha: gitSha,
      headRef: "refs/heads/main",
      runAttempt: 1,
      profile: "full",
      event: "push",
      conclusion: "success",
      proofArtifactId: 9876,
      proofArtifactDigest: `sha256:${sha("6")}`,
      proofSha256: sha("7"),
      jobSet: ["verify", "e2e-deterministic", "real-mysql"],
    },
    releaseAuthorization: {
      mode: "explicit-unprotected-ref",
      approvalSha256: sha("8"),
      sourceSha: gitSha,
      actor: "release-owner",
      runId: 4321,
    },
    attestationPolicy: {
      signingSystem: "sigstore-cosign-keyless",
      cosignVersion: "v3.1.3",
      bundleMediaType: "application/vnd.dev.sigstore.bundle.v0.3+json",
      signerWorkflow: "github.com/zhanyanzhou/haichuan/.github/workflows/release-images.yml",
      signerIdentity: "https://github.com/zhanyanzhou/haichuan/.github/workflows/release-images.yml@refs/heads/main",
      certificateOidcIssuer: "https://token.actions.githubusercontent.com",
      sourceRef: "refs/heads/main",
      sourceDigest: gitSha,
      imageSignaturesVerified: true,
      imageAttestationsVerified: true,
      provenancePredicateType: "https://slsa.dev/provenance/v1",
      sbomPredicateType: "https://spdx.dev/Document",
      manifestPredicateType: "https://slsa.dev/provenance/v1",
    },
    publicSeo: {
      origin,
      sourceStage: "production",
      snapshotHash: sha("c"),
      prerenderManifestSha256: sha("d"),
      sourceArtifactId: 123,
      sourceArtifactDigest: `sha256:${sha("e")}`,
      sourceKind: "approved-snapshot",
      contentReady: true,
      pageDocuments: pageDocuments(),
    },
    server: image("server", "1"),
    client: image("client", "2"),
    operations: {
      ...image("operations", "3"),
      runtimeExecutables: [
        "/usr/local/bin/backup.sh",
        "/usr/local/bin/check-backup-health.sh",
        "/usr/local/bin/restore.sh",
        "/usr/local/bin/restore-drill.sh",
        "/usr/local/bin/prune-backups.sh",
      ],
    },
  };
}

function writeSidecars(root, value) {
  for (const component of ["server", "client", "operations"]) {
    for (const descriptor of [
      value[component].signatureBundle,
      value[component].provenanceBundle,
      value[component].sbomBundle,
    ]) {
      const content = `${component}:${descriptor.path}\n`;
      const path = join(root, descriptor.path);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
      descriptor.sha256 = hash(content);
    }
  }
}

test("prepares only production high approved content with digest-pinned images and isolated volumes", () => {
  const result = validateProductionDeployInputs(manifest(), productionEnv);
  assert.equal(result.ASSURANCE_LEVEL, "high");
  assert.equal(result.PUBLIC_SEO_CONTENT_READY, "true");
  assert.equal(result.PUBLIC_SEO_SOURCE_KIND, "approved-snapshot");
  assert.equal(result.PUBLIC_SEO_ORIGIN, origin);
  assert.equal(result.SERVER_IMAGE_DIGEST, sha("1"));
  assert.equal(result.PUBLIC_SEO_PAGE_HASH_HOME, sha("5"));
  assert.equal(result.MYSQL_VOLUME_NAME, "haichuan-production-mysql");
  assert.equal(result.INITIAL_CUTOVER_AUTHORIZED, "false");
});

test("rejects preproduction, baseline, fallback, and incomplete evidence", () => {
  const preproduction = manifest();
  preproduction.releaseStage = "preproduction";
  assert.throws(() => validateProductionDeployInputs(preproduction, productionEnv), /MANIFEST_IDENTITY_INVALID/);

  const baseline = manifest();
  baseline.assuranceLevel = "baseline";
  delete baseline.attestationPolicy;
  baseline.baselinePolicy = {};
  assert.throws(() => validateProductionDeployInputs(baseline, productionEnv), /MANIFEST_SCHEMA_INVALID/);

  const fallback = manifest();
  fallback.publicSeo.sourceKind = "safe-fallback";
  fallback.publicSeo.contentReady = false;
  fallback.publicSeo.sourceArtifactId = 0;
  fallback.publicSeo.pageDocuments = [];
  assert.throws(() => validateProductionDeployInputs(fallback, productionEnv), /PUBLIC_SEO_FALLBACK_INVALID/);

  const emptyQuality = manifest();
  emptyQuality.qualityGate = {};
  assert.throws(() => validateProductionDeployInputs(emptyQuality, productionEnv), /QUALITY_GATE_SCHEMA_INVALID/);
});

test("binds the deployment origin and authoritative lead-generation profile", () => {
  assert.equal(
    validateProductionDeployInputs(manifest(), productionEnv.replace(origin, `${origin}/`)).PUBLIC_SEO_ORIGIN,
    origin,
  );
  for (const value of ["https://other.example.test", "http://www.example.test", "https://www.example.test/path"]) {
    assert.throws(
      () => validateProductionDeployInputs(manifest(), productionEnv.replace(origin, value)),
      /PUBLIC_SITE_ORIGIN_(?:MISMATCH|INVALID)/,
    );
  }
  for (const profile of ["", "commerce", "transactional", "Commerce"]) {
    const env = productionEnv.replace("RELEASE_PROFILE=lead-generation", `RELEASE_PROFILE=${profile}`);
    assert.throws(() => validateProductionDeployInputs(manifest(), env), { message: "PRODUCTION_DEPLOY_RELEASE_PROFILE_INVALID" });
  }
});

test("rejects enabled external effects and unsafe payment provider configuration", () => {
  for (const key of [
    "CUSTOMER_COMMERCE_ENABLED",
    "CUSTOMER_QUOTATION_ORDERING_ENABLED",
    "PARTNER_APPLICATIONS_WRITE_ENABLED",
    "NOTIFICATION_DELIVERY_ENABLED",
    "PAYMENT_GATEWAY_TRANSACTIONS_ENABLED",
    "PAYMENT_GATEWAY_REFUNDS_ENABLED",
    "ANALYTICS_INGESTION_ENABLED",
  ]) {
    assert.throws(() => validateProductionDeployInputs(manifest(), `${productionEnv}${key}=true\n`), {
      message: `PRODUCTION_DEPLOY_UNSAFE_GATE:${key}`,
    });
  }
  for (const key of [
    "SMTP_HOST",
    "SMTP_USER",
    "SMTP_PASS",
    "ALIYUN_SMS_ACCESS_KEY_ID",
    "ALIYUN_SMS_ACCESS_KEY_SECRET",
    "ALIYUN_SMS_SIGN_NAME",
    "ALIYUN_SMS_TEMPLATE_CODE",
  ]) {
    assert.throws(() => validateProductionDeployInputs(manifest(), `${productionEnv}${key}=configured\n`), {
      message: `PRODUCTION_DEPLOY_UNSAFE_EXTERNAL_CONFIG:${key}`,
    });
  }
  assert.throws(() => validateProductionDeployInputs(manifest(), `${productionEnv}PAYMENT_PROVIDER_MODE=live\n`), {
    message: "PRODUCTION_DEPLOY_UNSAFE_PAYMENT_PROVIDER_MODE",
  });
});

test("rejects floating images and contradictory immutable environment values", () => {
  const floating = manifest();
  floating.client.reference = `${floating.client.image}:latest`;
  assert.throws(() => validateProductionDeployInputs(floating, productionEnv), /CLIENT_REFERENCE_INVALID/);
  assert.throws(
    () => validateProductionDeployInputs(manifest(), `${productionEnv}SERVER_IMAGE_DIGEST=${sha("0")}\n`),
    { message: "PRODUCTION_DEPLOY_ENV_SERVER_IMAGE_DIGEST_MANIFEST_MISMATCH" },
  );
  assert.throws(
    () => validateProductionDeployInputs(manifest(), `${productionEnv}RELEASE_GIT_SHA=${"0".repeat(40)}\n`),
    { message: "PRODUCTION_DEPLOY_ENV_RELEASE_GIT_SHA_MANIFEST_MISMATCH" },
  );
});

test("requires three distinct persistent volumes and an achievable backup policy", () => {
  const duplicateVolumes = productionEnv.replace("haichuan-production-private", "haichuan-production-uploads");
  assert.throws(() => validateProductionDeployInputs(manifest(), duplicateVolumes), /VOLUME_IDENTITIES_MUST_BE_DISTINCT/);
  const missingVolume = productionEnv.replace("MYSQL_VOLUME_NAME=haichuan-production-mysql", "MYSQL_VOLUME_NAME=");
  assert.throws(() => validateProductionDeployInputs(manifest(), missingVolume), /MYSQL_VOLUME_NAME_INVALID/);
  const impossibleRpo = productionEnv.replace("BACKUP_RPO_SECONDS=7200", "BACKUP_RPO_SECONDS=60");
  assert.throws(() => validateProductionDeployInputs(manifest(), impossibleRpo), /BACKUP_RPO_UNACHIEVABLE/);
});

test("makes initial production cutover explicit and rejects ambiguous values", () => {
  assert.equal(
    validateProductionDeployInputs(manifest(), `${productionEnv}PRODUCTION_INITIAL_SIGNED_CUTOVER_AUTHORIZED=1\n`).INITIAL_CUTOVER_AUTHORIZED,
    "true",
  );
  for (const value of ["true", "yes", "2", "-1"]) {
    assert.throws(
      () => validateProductionDeployInputs(manifest(), `${productionEnv}PRODUCTION_INITIAL_SIGNED_CUTOVER_AUTHORIZED=${value}\n`),
      { message: "PRODUCTION_DEPLOY_INITIAL_CUTOVER_AUTHORIZATION_INVALID" },
    );
  }
});

test("binds the caller supplied manifest hash and all nine high-assurance sidecar hashes", () => {
  const root = mkdtempSync(join(tmpdir(), "haichuan-production-release-"));
  try {
    const value = manifest();
    writeSidecars(root, value);
    const manifestBytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
    const bundle = { releaseDir: root, manifestBytes, expectedManifestSha256: hash(manifestBytes) };
    assert.equal(validateProductionDeployInputs(value, productionEnv, bundle).ASSURANCE_LEVEL, "high");
    assert.throws(
      () => validateProductionDeployInputs(value, productionEnv, { ...bundle, expectedManifestSha256: sha("0") }),
      { message: "PRODUCTION_DEPLOY_MANIFEST_SHA256_MISMATCH" },
    );
    writeFileSync(join(root, value.client.sbomBundle.path), "tampered\n");
    assert.throws(() => validateProductionDeployInputs(value, productionEnv, bundle), {
      message: "PRODUCTION_DEPLOY_CLIENT_SBOM_HASH_MISMATCH",
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects a sidecar reached through a parent link outside the release bundle", () => {
  const root = mkdtempSync(join(tmpdir(), "haichuan-production-release-"));
  const outside = mkdtempSync(join(tmpdir(), "haichuan-production-outside-"));
  try {
    const value = manifest();
    writeSidecars(outside, value);
    symlinkSync(join(outside, "attestations"), join(root, "attestations"), process.platform === "win32" ? "junction" : "dir");
    const manifestBytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
    assert.throws(() => validateProductionDeployInputs(value, productionEnv, {
      releaseDir: root,
      manifestBytes,
      expectedManifestSha256: hash(manifestBytes),
    }), { message: "PRODUCTION_DEPLOY_SERVER_SIGNATURE_PATH_INVALID" });
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});
