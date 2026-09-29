import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { validatePreproductionDeployInputs } from "./prepare-preproduction-deploy.mjs";

const sha = (value) => value.repeat(64);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const publicSiteOrigin = "https://preview.example.test";
const leadGenerationEnv = `RELEASE_PROFILE=lead-generation\nVITE_PUBLIC_SITE_ORIGIN=${publicSiteOrigin}\n`;
const reviewedPageDocuments = () => [
  ["about", "/about", "1"],
  ["catalog", "/catalog", "2"],
  ["contact", "/contact", "3"],
  ["custom", "/custom", "4"],
  ["home", "/", "5"],
  ["products", "/products", "6"],
].map(([pageKey, path, digit]) => ({ pageKey, path, contentHash: sha(digit) }));

function manifest() {
  const gitSha = "a".repeat(40);
  const image = (component, value) => ({
    image: `ghcr.io/zhanyanzhou/haichuan-preproduction-${component}`,
    digest: `sha256:${sha(value)}`,
    reference: `ghcr.io/zhanyanzhou/haichuan-preproduction-${component}@sha256:${sha(value)}`,
    buildkitProvenance: { path: `provenance/${component}.buildkit.json`, sha256: sha("4") },
    sbom: { path: `sbom/${component}.spdx.json`, sha256: sha("5") },
  });
  return {
    schemaVersion: 9,
    assuranceLevel: "baseline",
    releaseStage: "preproduction",
    imageTag: `preproduction-sha-${gitSha}`,
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
    baselinePolicy: {
      artifactSystem: "github-actions-private-artifact",
      publicTransparencyLog: false,
      immutableImageDigests: true,
      buildkitProvenanceIncluded: true,
      sbomIncluded: true,
    },
    publicSeo: {
      origin: publicSiteOrigin,
      sourceStage: "preproduction",
      snapshotHash: sha("c"),
      prerenderManifestSha256: sha("d"),
      sourceArtifactId: 0,
      sourceArtifactDigest: `sha256:${sha("e")}`,
      sourceKind: "safe-fallback",
      contentReady: false,
      pageDocuments: [],
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

function asHigh(manifestValue) {
  manifestValue.assuranceLevel = "high";
  delete manifestValue.baselinePolicy;
  manifestValue.attestationPolicy = {
    signingSystem: "sigstore-cosign-keyless",
    cosignVersion: "v3.1.3",
    bundleMediaType: "application/vnd.dev.sigstore.bundle.v0.3+json",
    signerWorkflow: "github.com/zhanyanzhou/haichuan/.github/workflows/release-images.yml",
    signerIdentity: "https://github.com/zhanyanzhou/haichuan/.github/workflows/release-images.yml@refs/heads/main",
    certificateOidcIssuer: "https://token.actions.githubusercontent.com",
    sourceRef: "refs/heads/main",
    sourceDigest: manifestValue.gitSha,
    imageSignaturesVerified: true,
    imageAttestationsVerified: true,
    provenancePredicateType: "https://slsa.dev/provenance/v1",
    sbomPredicateType: "https://spdx.dev/Document",
    manifestPredicateType: "https://slsa.dev/provenance/v1",
  };
  for (const component of ["server", "client", "operations"]) {
    const entry = manifestValue[component];
    delete entry.buildkitProvenance;
    delete entry.sbom;
    entry.signatureBundle = { path: `attestations/${component}-image.sigstore.json`, sha256: sha("4") };
    entry.provenanceBundle = { path: `attestations/${component}-provenance.sigstore.json`, sha256: sha("5") };
    entry.sbomBundle = { path: `attestations/${component}-sbom.sigstore.json`, sha256: sha("6") };
    entry.provenancePredicateType = "https://slsa.dev/provenance/v1";
    entry.sbomPredicateType = "https://spdx.dev/Document";
  }
  return manifestValue;
}

test("prepares only digest-pinned preproduction images with safe gates", () => {
  const result = validatePreproductionDeployInputs(manifest(), `${leadGenerationEnv}CUSTOMER_COMMERCE_ENABLED=false\n`);
  assert.equal(result.PUBLIC_SEO_CONTENT_READY, "false");
  assert.equal(result.ASSURANCE_LEVEL, "baseline");
  assert.equal(result.RELEASE_PROFILE, "lead-generation");
  assert.equal(result.PUBLIC_SEO_ORIGIN, publicSiteOrigin);
  assert.equal(result.SERVER_IMAGE_DIGEST, sha("1"));
});

test("binds one manifest to the matching normalized deployment origin", () => {
  assert.equal(
    validatePreproductionDeployInputs(
      manifest(),
      "RELEASE_PROFILE=lead-generation\nVITE_PUBLIC_SITE_ORIGIN=https://preview.example.test/\n",
    ).PUBLIC_SEO_ORIGIN,
    publicSiteOrigin,
  );
  assert.throws(
    () => validatePreproductionDeployInputs(
      manifest(),
      "RELEASE_PROFILE=lead-generation\nVITE_PUBLIC_SITE_ORIGIN=https://other-preview.example.test\n",
    ),
    { message: "PREPRODUCTION_DEPLOY_PUBLIC_SITE_ORIGIN_MISMATCH" },
  );
  for (const originLine of ["", "VITE_PUBLIC_SITE_ORIGIN=http://preview.example.test\n", "VITE_PUBLIC_SITE_ORIGIN=https://preview.example.test/path\n"]) {
    assert.throws(
      () => validatePreproductionDeployInputs(manifest(), `RELEASE_PROFILE=lead-generation\n${originLine}`),
      { message: "PREPRODUCTION_DEPLOY_PUBLIC_SITE_ORIGIN_INVALID" },
    );
  }
});

test("accepts the high-assurance manifest contract", () => {
  const high = asHigh(manifest());
  assert.equal(validatePreproductionDeployInputs(high, leadGenerationEnv).ASSURANCE_LEVEL, "high");
});

test("rejects empty evidence contracts before deployment", () => {
  const emptyQuality = manifest();
  emptyQuality.qualityGate = {};
  assert.throws(() => validatePreproductionDeployInputs(emptyQuality, leadGenerationEnv), /QUALITY_GATE_SCHEMA_INVALID/);
  const emptyPolicy = manifest();
  emptyPolicy.baselinePolicy = {};
  assert.throws(() => validatePreproductionDeployInputs(emptyPolicy, leadGenerationEnv), /BASELINE_POLICY_INVALID/);
  const noSbom = manifest();
  delete noSbom.client.sbom;
  assert.throws(() => validatePreproductionDeployInputs(noSbom, leadGenerationEnv), /CLIENT_SCHEMA_INVALID/);
});

test("binds the caller supplied manifest hash and every baseline sidecar hash", () => {
  const root = mkdtempSync(join(tmpdir(), "haichuan-preproduction-release-"));
  try {
    const value = manifest();
    for (const component of ["server", "client", "operations"]) {
      for (const descriptor of [value[component].buildkitProvenance, value[component].sbom]) {
        const content = `${component}:${descriptor.path}\n`;
        const path = join(root, descriptor.path);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, content);
        descriptor.sha256 = hash(content);
      }
    }
    const manifestBytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
    const bundle = { releaseDir: root, manifestBytes, expectedManifestSha256: hash(manifestBytes) };
    assert.equal(validatePreproductionDeployInputs(value, leadGenerationEnv, bundle).ASSURANCE_LEVEL, "baseline");
    assert.throws(
      () => validatePreproductionDeployInputs(value, leadGenerationEnv, { ...bundle, expectedManifestSha256: sha("0") }),
      /MANIFEST_SHA256_MISMATCH/,
    );
    writeFileSync(join(root, value.client.sbom.path), "tampered\n");
    assert.throws(() => validatePreproductionDeployInputs(value, leadGenerationEnv, bundle), /CLIENT_SBOM_HASH_MISMATCH/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects a sidecar reached through a parent link outside the release bundle", () => {
  const root = mkdtempSync(join(tmpdir(), "haichuan-preproduction-release-"));
  const outside = mkdtempSync(join(tmpdir(), "haichuan-preproduction-outside-"));
  try {
    const value = manifest();
    for (const component of ["server", "client", "operations"]) {
      for (const descriptor of [value[component].buildkitProvenance, value[component].sbom]) {
        const content = `${component}:${descriptor.path}\n`;
        const path = join(root, descriptor.path);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, content);
        descriptor.sha256 = hash(content);
      }
    }

    rmSync(join(root, "provenance"), { recursive: true });
    const escapedContent = "server:escaped-provenance\n";
    writeFileSync(join(outside, "server.buildkit.json"), escapedContent);
    symlinkSync(outside, join(root, "provenance"), process.platform === "win32" ? "junction" : "dir");
    value.server.buildkitProvenance.sha256 = hash(escapedContent);

    const manifestBytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
    assert.throws(
      () => validatePreproductionDeployInputs(value, leadGenerationEnv, {
        releaseDir: root,
        manifestBytes,
        expectedManifestSha256: hash(manifestBytes),
      }),
      { message: "PREPRODUCTION_DEPLOY_SERVER_PROVENANCE_PATH_INVALID" },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("rejects production, floating images, and enabled external effects", () => {
  const production = manifest();
  production.releaseStage = "production";
  assert.throws(() => validatePreproductionDeployInputs(production, leadGenerationEnv), /MANIFEST_IDENTITY_INVALID/);
  const floating = manifest();
  floating.client.reference = `${floating.client.image}:latest`;
  assert.throws(() => validatePreproductionDeployInputs(floating, leadGenerationEnv), /CLIENT_REFERENCE_INVALID/);
  assert.throws(
    () => validatePreproductionDeployInputs(manifest(), `${leadGenerationEnv}PAYMENT_GATEWAY_TRANSACTIONS_ENABLED=true\n`),
    /UNSAFE_GATE:PAYMENT_GATEWAY_TRANSACTIONS_ENABLED/,
  );
  for (const key of [
    "SMTP_HOST",
    "SMTP_USER",
    "SMTP_PASS",
    "ALIYUN_SMS_ACCESS_KEY_ID",
    "ALIYUN_SMS_ACCESS_KEY_SECRET",
    "ALIYUN_SMS_SIGN_NAME",
    "ALIYUN_SMS_TEMPLATE_CODE",
  ]) {
    assert.throws(
      () => validatePreproductionDeployInputs(manifest(), `${leadGenerationEnv}${key}=configured\n`),
      { message: `PREPRODUCTION_DEPLOY_UNSAFE_EXTERNAL_CONFIG:${key}` },
    );
  }
});

test("requires an explicit authoritative lead-generation profile", () => {
  for (const envSource of [
    "",
    "RELEASE_PROFILE=transactional\n",
    "RELEASE_PROFILE=commerce\n",
    "RELEASE_PROFILE=Commerce\n",
  ]) {
    assert.throws(
      () => validatePreproductionDeployInputs(manifest(), `${envSource}VITE_PUBLIC_SITE_ORIGIN=${publicSiteOrigin}\n`),
      { message: "PREPRODUCTION_DEPLOY_RELEASE_PROFILE_INVALID" },
    );
  }
});

test("accepts reviewed preproduction content but rejects contradictory source facts", () => {
  const reviewed = manifest();
  reviewed.publicSeo.contentReady = true;
  reviewed.publicSeo.sourceKind = "approved-snapshot";
  reviewed.publicSeo.sourceArtifactId = 123;
  reviewed.publicSeo.pageDocuments = reviewedPageDocuments();
  const prepared = validatePreproductionDeployInputs(reviewed, leadGenerationEnv);
  assert.equal(prepared.PUBLIC_SEO_CONTENT_READY, "true");
  assert.equal(prepared.PUBLIC_SEO_PAGE_HASH_HOME, sha("5"));
  assert.equal(prepared.PUBLIC_SEO_PAGE_HASH_CONTACT, sha("3"));
  reviewed.publicSeo.sourceArtifactId = 0;
  assert.throws(() => validatePreproductionDeployInputs(reviewed, leadGenerationEnv), /PUBLIC_SEO_APPROVED_SOURCE_INVALID/);
});
