import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Public SEO is part of the signed release supply chain. Importing its focused
// specs keeps the root `npm test` and the quality workflow from bypassing them.
import "./export-public-seo-snapshot.spec.mjs";
import "./create-preproduction-safe-seo-snapshot.spec.mjs";
import "./generate-public-seo-artifacts.spec.mjs";
import "./prerender-public-routes.spec.mjs";
import "./public-seo-release-contract.spec.mjs";
import "./public-seo-http.spec.mjs";
import "./prepare-preproduction-deploy.spec.mjs";
import "../server/scripts/database-upgrade-rehearsal.test.mjs";

import {
  releaseStaticWorkflowPaths,
  validateComposeBuildPolicy,
  validateProductionEvidenceVerificationWorkflow,
  validateReleaseEnvironment,
  validateReleaseManifest,
} from "./verify-release-images.mjs";

const releaseWorkflow = readFileSync(new URL("../.github/workflows/release-images.yml", import.meta.url), "utf8");
const qualityWorkflow = readFileSync(new URL("../.github/workflows/quality.yml", import.meta.url), "utf8");
const productionEvidenceWorkflow = readFileSync(new URL("../.github/workflows/verify-production-evidence.yml", import.meta.url), "utf8");
const baseCompose = readFileSync(new URL("../docker-compose.yml", import.meta.url), "utf8");
const operationsCompose = readFileSync(new URL("../docker-compose.operations.yml", import.meta.url), "utf8");
const wechatPayCompose = readFileSync(new URL("../docker-compose.wechat-pay.yml", import.meta.url), "utf8");
const serverDockerfile = readFileSync(new URL("../server/Dockerfile", import.meta.url), "utf8");
const clientDockerfile = readFileSync(new URL("../client/Dockerfile", import.meta.url), "utf8");
const operationsShellSources = [
  "check-backup-health.sh",
  "restore.sh",
  "restore-drill.sh",
  "prune-backups.sh",
].map((name) => [name, readFileSync(new URL(`../server/scripts/${name}`, import.meta.url), "utf8")]);
const localRecoveryDrill = readFileSync(new URL("./run-operations-recovery-drill.ps1", import.meta.url), "utf8");
const reverseProxyVerifier = readFileSync(new URL("./verify-reverse-proxy-security.mjs", import.meta.url), "utf8");
const environmentExample = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
const productionRunbook = readFileSync(new URL("../docs/PRODUCTION_RELEASE_RUNBOOK.md", import.meta.url), "utf8");

const gitSha = "a".repeat(40);
const migrationBundleSha256 = "b".repeat(64);
const serverDigest = `sha256:${"c".repeat(64)}`;
const clientDigest = `sha256:${"d".repeat(64)}`;
const operationsDigest = `sha256:${"e".repeat(64)}`;

test("static release checks follow all active release workflows", () => {
  assert.deepEqual(releaseStaticWorkflowPaths, [
    ".github/workflows/quality.yml",
    ".github/workflows/export-public-seo-snapshot.yml",
    ".github/workflows/release-images.yml",
    ".github/workflows/verify-production-evidence.yml",
  ]);
});

test("build job installs verifier dependencies while isolated signing job executes no repository code", () => {
  const qualityInstall = qualityWorkflow.indexOf("npm ci --ignore-scripts");
  const qualityVerify = qualityWorkflow.indexOf("node scripts/verify-release-images.mjs --static");
  assert.ok(qualityInstall >= 0 && qualityInstall < qualityVerify);
  assert.match(qualityWorkflow, /^permissions:\s*\r?\n\s{2}contents: read/m);
  assert.match(qualityWorkflow, /persist-credentials: false/);
  assert.match(qualityWorkflow, /ParseFile\(/);
  assert.match(qualityWorkflow, /scripts\/run-operations-recovery-drill\.ps1/);

  const releaseInstall = releaseWorkflow.indexOf("npm ci --ignore-scripts");
  const migrationVerify = releaseWorkflow.indexOf("node scripts/verify-migration-integrity.mjs --print-bundle-sha");
  const registryLogin = releaseWorkflow.indexOf("uses: docker/login-action@");
  const clientInstall = releaseWorkflow.indexOf("npm ci --prefix client");
  assert.ok(releaseInstall >= 0 && releaseInstall < migrationVerify);
  assert.ok(clientInstall >= 0 && clientInstall < registryLogin);
  assert.match(releaseWorkflow, /persist-credentials: false/);
  const signingJob = releaseWorkflow.slice(releaseWorkflow.indexOf("  sign-release:"));
  assert.doesNotMatch(signingJob, /actions\/checkout@|npm ci|node scripts\/|docker (?:build|run)/);
  assert.match(signingJob, /artifact-ids: \$\{\{ needs\.build-push\.outputs\.signing_inputs_artifact_id \}\}/);
  assert.match(signingJob, /artifact-ids:[\s\S]*?merge-multiple: true/);
  assert.match(signingJob, /buildkitProvenancePredicateType: buildkitPredicateType/);
  assert.doesNotMatch(signingJob, /cosign verify(?:-attestation)? "\$\{verification_identity\[@\]\}"/);
  assert.match(signingJob, /cosign verify-blob-attestation "\$\{verification_identity\[@\]\}"/);
  assert.match(signingJob, /--digest "\$expected_digest" --digestAlg sha256/);
  assert.match(signingJob, /--type "https:\/\/sigstore\.dev\/cosign\/sign\/v1"/);
  assert.match(signingJob, /const payload = bundle\?\.dsseEnvelope\?\.payload/);
  assert.match(signingJob, /RELEASE_SIGNING_INPUTS_HASH_MISMATCH/);
});

test("release workflow verifies common identity labels on all three image digests", () => {
  assert.match(releaseWorkflow, /verify_identity "\$SERVER_REFERENCE" server/);
  assert.match(releaseWorkflow, /verify_identity "\$CLIENT_REFERENCE" client/);
  assert.match(releaseWorkflow, /verify_identity "\$OPERATIONS_REFERENCE" operations/);
  for (const label of [
    "org.opencontainers.image.revision",
    "io.haichuan.component",
    "io.haichuan.migration-bundle-sha256",
  ]) {
    assert.match(releaseWorkflow, new RegExp(label.replaceAll(".", "\\.")));
  }
});

test("client Docker stages and release workflow keep an exact build ARG contract", () => {
  const stages = clientDockerfile.split(/(?=^FROM\s+)/gm).filter(Boolean);
  assert.equal(stages.length, 2);
  assert.match(stages[0], /^FROM\s+\S+\s+AS\s+verify\s*$/m);
  assert.match(stages[1], /^FROM\s+\S+\s*$/m);

  const argNames = (source) => [...source.matchAll(/^ARG\s+([A-Z][A-Z0-9_]*)(?:=.*)?\s*$/gm)]
    .map((match) => match[1]);
  const verifyArgs = [
    "VITE_API_BASE_URL",
    "VITE_PUBLIC_SITE_ORIGIN",
    "VITE_ANALYTICS_ENABLED",
    "PUBLIC_SEO_SNAPSHOT_HASH",
    "PUBLIC_SEO_PRERENDER_MANIFEST_SHA256",
    "PUBLIC_SEO_SNAPSHOT_ARTIFACT_DIGEST",
    "PUBLIC_SEO_CONTENT_READY",
    "PUBLIC_SEO_SOURCE_KIND",
  ];
  const runtimeArgs = [
    "BUILD_REVISION",
    "BUILD_SOURCE",
    "MIGRATION_BUNDLE_SHA256",
    "PUBLIC_SEO_SNAPSHOT_HASH",
    "PUBLIC_SEO_PRERENDER_MANIFEST_SHA256",
    "PUBLIC_SEO_SNAPSHOT_ARTIFACT_DIGEST",
    "PUBLIC_SEO_CONTENT_READY",
    "PUBLIC_SEO_SOURCE_KIND",
  ];
  assert.deepEqual(argNames(stages[0]), verifyArgs);
  assert.deepEqual(argNames(stages[1]), runtimeArgs);

  const clientBuildStep = releaseWorkflow.match(
    /- name: \u6784\u5efa\u5e76\u63a8\u9001\u5ba2\u6237\u7aef\u955c\u50cf\r?\n(?<body>[\s\S]*?)(?=\r?\n\s{6}- name:)/,
  );
  assert.ok(clientBuildStep, "client image build step missing");
  const workflowArgs = [...clientBuildStep.groups.body.matchAll(/^\s{12}([A-Z][A-Z0-9_]*)=/gm)]
    .map((match) => match[1]);
  assert.deepEqual(workflowArgs, [
    "BUILD_REVISION",
    "BUILD_SOURCE",
    "MIGRATION_BUNDLE_SHA256",
    "VITE_API_BASE_URL",
    "VITE_PUBLIC_SITE_ORIGIN",
    "VITE_ANALYTICS_ENABLED",
    "PUBLIC_SEO_SNAPSHOT_HASH",
    "PUBLIC_SEO_PRERENDER_MANIFEST_SHA256",
    "PUBLIC_SEO_SNAPSHOT_ARTIFACT_DIGEST",
    "PUBLIC_SEO_CONTENT_READY",
    "PUBLIC_SEO_SOURCE_KIND",
  ]);
  assert.deepEqual(
    [...new Set([...verifyArgs, ...runtimeArgs])].sort(),
    [...workflowArgs].sort(),
  );
});

test("production migration gate binds trigger privilege and binary-log policy evidence", () => {
  for (const key of [
    "MIGRATION_TARGET_ENVIRONMENT_ID",
    "MIGRATION_EXPECTED_DATABASE",
    "MIGRATION_APPROVAL_REFERENCE_SHA256",
    "MIGRATION_ACCOUNT_CAPABILITY_EVIDENCE_SHA256",
    "MIGRATION_TRIGGER_POLICY_EVIDENCE_SHA256",
  ]) {
    assert.match(environmentExample, new RegExp(`^${key}=$`, "m"));
  }
  for (const required of [
    "TRIGGER",
    "@@GLOBAL.log_bin",
    "@@GLOBAL.log_bin_trust_function_creators",
    "MySQL 1419",
    "MySQL 1449",
    "20260913121000_enforce_quotation_conversion_invariants",
    "不能直接盲重跑",
  ]) {
    assert.ok(productionRunbook.includes(required), `missing migration account gate: ${required}`);
  }
});

test("production evidence workflow verifies but never signs operator artifacts", () => {
  assert.match(productionEvidenceWorkflow, /^on:\s*\r?\n\s{2}workflow_dispatch:/m);
  assert.doesNotMatch(productionEvidenceWorkflow, /^\s{2}(?:push|pull_request|schedule):/m);
  assert.match(productionEvidenceWorkflow, /actions\/download-artifact@[a-f0-9]{40}/);
  assert.match(productionEvidenceWorkflow, /sigstore\/cosign-installer@6f9f17788090df1f26f669e9d70d6ae9567deba6/);
  assert.match(productionEvidenceWorkflow, /cosign-release: v3\.1\.3/);
  assert.match(productionEvidenceWorkflow, /docker\/login-action@c94ce9fb468520275223c153574b00df6fe4bcc9/);
  assert.match(productionEvidenceWorkflow, /persist-credentials: false/);
  assert.match(productionEvidenceWorkflow, /npm ci --ignore-scripts/);
  assert.match(productionEvidenceWorkflow, /run-id: \$\{\{ inputs\.evidence_run_id \}\}/);
  assert.match(productionEvidenceWorkflow, /node scripts\/verify-production-evidence\.mjs/);
  assert.doesNotMatch(productionEvidenceWorkflow, /GH_TOKEN:|attestations:\s*(?:read|write)/);
  assert.match(productionEvidenceWorkflow, /--evidence-signer-workflow "\$EVIDENCE_SIGNER_WORKFLOW"/);
  assert.match(productionEvidenceWorkflow, /EVIDENCE_SIGNER_WORKFLOW: \$\{\{ vars\.PRODUCTION_EVIDENCE_SIGNER_WORKFLOW \}\}/);
  assert.match(productionEvidenceWorkflow, /PRODUCTION_EVIDENCE_SIGNER_WORKFLOW_NOT_CONFIGURED/);
  assert.doesNotMatch(productionEvidenceWorkflow, /inputs\.evidence_signer_workflow/);
  assert.match(productionEvidenceWorkflow, /^permissions:\s*\{\}\s*$/m);
  assert.match(productionEvidenceWorkflow, /^\s{4}permissions:\s*\r?\n\s{6}actions: read\s*\r?\n\s{6}contents: read\s*\r?\n\s{6}packages: read/m);
  assert.match(productionEvidenceWorkflow, /--manifest-signer-workflow "\$MANIFEST_SIGNER_WORKFLOW"/);
  assert.match(productionEvidenceWorkflow, /--environment-id-sha256 "\$ENVIRONMENT_ID_SHA256"/);
  assert.match(productionEvidenceWorkflow, /--approval-reference-sha256 "\$APPROVAL_REFERENCE_SHA256"/);
  assert.doesNotMatch(productionEvidenceWorkflow, /actions\/(?:attest|attest-build-provenance)@/);
  assert.equal(validateProductionEvidenceVerificationWorkflow(productionEvidenceWorkflow).ok, true);
  assert.throws(
    () => validateProductionEvidenceVerificationWorkflow(
      productionEvidenceWorkflow.replace("packages: read", "packages: write"),
    ),
    { message: "PRODUCTION_EVIDENCE_WORKFLOW_PERMISSIONS_INVALID" },
  );
  assert.throws(
    () => validateProductionEvidenceVerificationWorkflow(
      productionEvidenceWorkflow.replace(
        "permissions: {}",
        "permissions:\n  contents: read",
      ),
    ),
    { message: "PRODUCTION_EVIDENCE_WORKFLOW_ROOT_PERMISSIONS_INVALID" },
  );
});

test("reverse proxy static verification cannot claim target edge readiness", () => {
  assert.match(reverseProxyVerifier, /productionReady: false/);
  assert.match(reverseProxyVerifier, /TARGET_EDGE_CANONICAL_HOST_ALLOWLIST_UNVERIFIED/);
  assert.match(reverseProxyVerifier, /TARGET_EDGE_REAL_IP_TRUST_BOUNDARY_UNVERIFIED/);
  assert.doesNotMatch(reverseProxyVerifier, /项反向代理安全合同通过/);
});

test("release workflow rejects non-default or unprotected release refs before quality lookup", () => {
  const policyIndex = releaseWorkflow.indexOf("拒绝未受保护的发布来源");
  const qualityLookupIndex = releaseWorkflow.indexOf("查找同一 SHA 的成功质量门禁");
  assert.ok(policyIndex >= 0 && policyIndex < qualityLookupIndex);
  assert.match(releaseWorkflow, /DEFAULT_BRANCH_REF: refs\/heads\/\$\{\{ github\.event\.repository\.default_branch \}\}/);
  assert.match(releaseWorkflow, /refs\/heads\/release\/\*/);
  assert.match(releaseWorkflow, /RELEASE_REF_PROTECTED: \$\{\{ github\.ref_protected \}\}/);
  assert.match(releaseWorkflow, /if \[ "\$RELEASE_REF_PROTECTED" != "true" \]/);
});

test("backup execution is immutable inside the attested operations image", () => {
  assert.match(baseCompose, /^  backup:\s*\r?\n\s{4}image:\s*"\$\{OPERATIONS_IMAGE_NAME:\?OPERATIONS_IMAGE_NAME is required\}@sha256:\$\{OPERATIONS_IMAGE_DIGEST:\?OPERATIONS_IMAGE_DIGEST is required\}"/m);
  assert.doesNotMatch(baseCompose, /\.\/server\/scripts\/(?:backup|check-backup-health)\.sh/);
  assert.match(serverDockerfile, /node:22-bookworm-slim@sha256:[a-f0-9]{64}/);
  assert.match(serverDockerfile, /apt-get install -y --no-install-recommends default-mysql-client openssl/);
  assert.match(
    serverDockerfile,
    /^RUN npm ci --omit=dev --include=optional --legacy-peer-deps \\\r?\n\s+&& rm -rf node_modules\/prisma node_modules\/\.bin\/prisma\s*$/m,
  );
  for (const script of [
    "backup.sh",
    "check-backup-health.sh",
    "restore.sh",
    "restore-drill.sh",
    "prune-backups.sh",
  ]) {
    assert.match(serverDockerfile, new RegExp(`scripts/${script.replace(".", "\\.")}`));
    assert.match(serverDockerfile, new RegExp(`/usr/local/bin/${script.replace(".", "\\.")}`));
    assert.match(releaseWorkflow, new RegExp(`/usr/local/bin/${script.replace(".", "\\.")}`));
  }
  assert.match(releaseWorkflow, /target: operations/);
  assert.match(releaseWorkflow, /sign_image operations "\$OPERATIONS_REFERENCE"/);
  assert.match(releaseWorkflow, /\$\{component\}-provenance\.sigstore\.json/);
  assert.match(releaseWorkflow, /\$\{component\}-sbom\.sigstore\.json/);
  assert.match(releaseWorkflow, /runtimeExecutables/);
  assert.match(releaseWorkflow, /SERVER_RUNTIME_DEPENDENCY_INVALID:@nestjs\/common/);
  assert.match(
    releaseWorkflow,
    /node -e "for \(const dependency of \[\\"@nestjs\/common\\", \\"@prisma\/client\\", \\"bcrypt\\"\]\) require\(dependency\)"/,
  );
  assert.doesNotMatch(releaseWorkflow, /\['@nestjs\/common', '@prisma\/client', 'bcrypt'\]/);
});

test("backup manifest SHA validation is portable across the operations image awk", () => {
  for (const [name, source] of operationsShellSources) {
    assert.match(source, /length\(\$1\) != 64/, name);
    assert.doesNotMatch(source, /\$1\s*!~\s*\/\^\[0-9a-fA-F\]\{64\}\$\//, name);
  }
});

test("local recovery drill is isolated, credential-safe and keeps production RTO unverified", () => {
  assert.match(localRecoveryDrill, /hc-ops-rehearsal-/);
  assert.match(localRecoveryDrill, /administratorLoginAfterRestore = \$true/);
  assert.match(localRecoveryDrill, /businessRtoMet = 'UNVERIFIED'/);
  assert.match(localRecoveryDrill, /cleanupRemaining/);
  assert.doesNotMatch(localRecoveryDrill, /Get-Content[^\r\n]*\.env|--env-file/);
  assert.doesNotMatch(localRecoveryDrill, /accessToken\s*\)|console\.log\([^\r\n]*accessToken/);
});

test("production Compose rejects invalid service structures", () => {
  for (const source of [
    "services:\n  server:\n",
    "services:\n  server: image-only\n",
    "services:\n  server: []\n",
    "services:\n  server: {}\n",
  ]) {
    assert.throws(
      () => validateComposeBuildPolicy(source),
      { message: "COMPOSE_SERVICE_INVALID:server" },
    );
  }
});

test("production Compose rejects every supported build syntax", () => {
  for (const source of [
    "services:\n  server:\n    build:\n      context: .\n",
    "services:\n  server:\n    build: .\n",
    "services:\n  server:\n    build: { context: . }\n",
    "services:\n  server:\n    'build': .\n",
    "services:\n  server: { build: . }\n",
    "services:\n  server: { \"build\": { context: . } }\n",
    "services:\n  server:\n    \"\\x62uild\": .\n",
    "services:\n  server:\n    ? build\n    : .\n",
    "services:\n  server:\n    !!str build: .\n",
    "x-build-service: &build-service\n  build: .\nservices:\n  server:\n    <<: *build-service\n",
  ]) {
    assert.throws(
      () => validateComposeBuildPolicy(source),
      { message: "COMPOSE_PRODUCTION_BUILD_FORBIDDEN:server" },
    );
  }
  assert.doesNotThrow(() => validateComposeBuildPolicy([
    "services:",
    "  server:",
    "    image: example@sha256:deadbeef",
    "    command: |",
    "      build: this is shell text, not a YAML key",
    "# build: .",
  ].join("\n")));
});

test("base, operations and WeChat Compose accept image-only services and reject injected builds", () => {
  for (const [source, serviceName] of [
    [baseCompose, "server"],
    [operationsCompose, "migration-status"],
    [wechatPayCompose, "server"],
  ]) {
    assert.doesNotThrow(() => validateComposeBuildPolicy(source));
    const mutated = source.replace(
      new RegExp(`^  ${serviceName}:\\s*$`, "m"),
      `  ${serviceName}:\n    build: .`,
    );
    assert.notEqual(mutated, source);
    assert.throws(
      () => validateComposeBuildPolicy(mutated),
      { message: `COMPOSE_PRODUCTION_BUILD_FORBIDDEN:${serviceName}` },
    );
  }
});
const source = "https://github.com/example/haichuan";
const bundle = (component, kind) => ({
  path: `attestations/${component}-${kind}.sigstore.json`,
  sha256: "4".repeat(64),
});
const imageEntry = (component, digest) => ({
  image: `ghcr.io/example/haichuan-${component}`,
  digest,
  reference: `ghcr.io/example/haichuan-${component}@${digest}`,
  signatureBundle: bundle(component, "image"),
  provenanceBundle: bundle(component, "provenance"),
  sbomBundle: bundle(component, "sbom"),
  provenancePredicateType: "https://slsa.dev/provenance/v1",
  sbomPredicateType: "https://spdx.dev/Document",
});

function validManifest() {
  return {
    schemaVersion: 6,
    releaseStage: "production",
    imageTag: `sha-${gitSha}`,
    gitSha,
    migrationBundleSha256,
    source,
    qualityGate: {
      workflow: "quality.yml",
      runId: 1234,
      runUrl: `${source}/actions/runs/1234`,
      headSha: gitSha,
      event: "push",
      conclusion: "success",
    },
    attestationPolicy: {
      signingSystem: "sigstore-cosign-keyless",
      cosignVersion: "v3.1.3",
      bundleMediaType: "application/vnd.dev.sigstore.bundle.v0.3+json",
      signerWorkflow: "github.com/example/haichuan/.github/workflows/release-images.yml",
      signerIdentity: "https://github.com/example/haichuan/.github/workflows/release-images.yml@refs/heads/main",
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
      sourceStage: "production",
      snapshotHash: "1".repeat(64),
      prerenderManifestSha256: "2".repeat(64),
      sourceArtifactId: 5678,
      sourceArtifactDigest: `sha256:${"3".repeat(64)}`,
      sourceKind: "approved-snapshot",
      contentReady: true,
    },
    server: imageEntry("server", serverDigest),
    client: imageEntry("client", clientDigest),
    operations: {
      ...imageEntry("operations", operationsDigest),
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

function validate(manifest) {
  return validateReleaseManifest(manifest, { gitSha, migrationBundleSha256 });
}

function expectCode(mutator, code) {
  const manifest = validManifest();
  mutator(manifest);
  assert.throws(() => validate(manifest), (error) => error?.message === code);
}

test("accepts a manifest bound to the expected source, quality run, migration and digests", () => {
  assert.deepEqual(validate(validManifest()), validManifest());
});

test("rejects a manifest for another Git revision", () => {
  expectCode((manifest) => {
    manifest.gitSha = "e".repeat(40);
  }, "RELEASE_MANIFEST_GIT_SHA_MISMATCH");
});

test("rejects a manifest for another migration bundle", () => {
  expectCode((manifest) => {
    manifest.migrationBundleSha256 = "e".repeat(64);
  }, "RELEASE_MANIFEST_MIGRATION_BUNDLE_MISMATCH");
});

test("rejects a quality proof for another revision", () => {
  expectCode((manifest) => {
    manifest.qualityGate.headSha = "e".repeat(40);
  }, "RELEASE_MANIFEST_QUALITY_SHA_MISMATCH");
});

test("rejects a non-push or unsuccessful quality proof", () => {
  expectCode((manifest) => {
    manifest.qualityGate.event = "workflow_dispatch";
  }, "RELEASE_MANIFEST_QUALITY_RESULT_INVALID");
  expectCode((manifest) => {
    manifest.qualityGate.conclusion = "failure";
  }, "RELEASE_MANIFEST_QUALITY_RESULT_INVALID");
});

test("rejects a quality run URL outside the declared repository", () => {
  expectCode((manifest) => {
    manifest.qualityGate.runUrl = "https://github.com/other/repo/actions/runs/1234";
  }, "RELEASE_MANIFEST_QUALITY_RUN_URL_INVALID");
});

test("rejects floating image references and digest/reference mismatches", () => {
  expectCode((manifest) => {
    manifest.server.reference = "ghcr.io/example/haichuan-server:latest";
  }, "RELEASE_MANIFEST_SERVER_REFERENCE_INVALID");
  expectCode((manifest) => {
    manifest.client.reference = `ghcr.io/example/haichuan-client@${serverDigest}`;
  }, "RELEASE_MANIFEST_CLIENT_REFERENCE_INVALID");
  expectCode((manifest) => {
    manifest.operations.reference = "ghcr.io/example/haichuan-operations:latest";
  }, "RELEASE_MANIFEST_OPERATIONS_REFERENCE_INVALID");
});

test("rejects a missing operations image", () => {
  expectCode((manifest) => {
    delete manifest.operations;
  }, "RELEASE_MANIFEST_OPERATIONS_MISSING");
});

test("rejects missing or drifted operations runtime executables", () => {
  expectCode((manifest) => {
    delete manifest.operations.runtimeExecutables;
  }, "RELEASE_MANIFEST_OPERATIONS_SCHEMA_INVALID");
  expectCode((manifest) => {
    manifest.operations.runtimeExecutables[2] = "/usr/local/bin/unapproved.sh";
  }, "RELEASE_MANIFEST_OPERATIONS_EXECUTABLES_INVALID");
});

test("rejects image names outside the manifest repository", () => {
  expectCode((manifest) => {
    manifest.operations.image = "ghcr.io/other/repo-operations";
    manifest.operations.reference = `${manifest.operations.image}@${operationsDigest}`;
  }, "RELEASE_MANIFEST_OPERATIONS_REPOSITORY_INVALID");
});

test("rejects signer workflow, source digest and attestation policy drift", () => {
  expectCode((manifest) => {
    manifest.attestationPolicy.signerWorkflow = "github.com/other/repo/.github/workflows/release-images.yml";
  }, "RELEASE_MANIFEST_SIGNER_WORKFLOW_INVALID");
  expectCode((manifest) => {
    manifest.attestationPolicy.sourceDigest = "f".repeat(40);
  }, "RELEASE_MANIFEST_ATTESTATION_SHA_MISMATCH");
  expectCode((manifest) => {
    manifest.attestationPolicy.imageAttestationsVerified = false;
  }, "RELEASE_MANIFEST_ATTESTATION_POLICY_INVALID");
  expectCode((manifest) => {
    manifest.attestationPolicy.imageSignaturesVerified = false;
  }, "RELEASE_MANIFEST_ATTESTATION_POLICY_INVALID");
  expectCode((manifest) => {
    manifest.attestationPolicy.cosignVersion = "v3.0.6";
  }, "RELEASE_MANIFEST_ATTESTATION_POLICY_INVALID");
  expectCode((manifest) => {
    manifest.attestationPolicy.sourceRef = "refs/heads/release/other";
  }, "RELEASE_MANIFEST_SIGNER_IDENTITY_INVALID");
});

test("rejects missing, renamed or unhashed Sigstore bundle descriptors", () => {
  expectCode((manifest) => {
    delete manifest.server.signatureBundle;
  }, "RELEASE_MANIFEST_SERVER_SCHEMA_INVALID");
  expectCode((manifest) => {
    manifest.client.provenanceBundle.path = "attestations/other.sigstore.json";
  }, "RELEASE_MANIFEST_CLIENT_PROVENANCE_BUNDLE_INVALID");
  expectCode((manifest) => {
    manifest.operations.sbomBundle.sha256 = "not-a-sha";
  }, "RELEASE_MANIFEST_OPERATIONS_SBOM_BUNDLE_INVALID");
});

test("rejects invalid per-image provenance and SBOM predicate policies", () => {
  expectCode((manifest) => {
    manifest.server.provenancePredicateType = "https://example.invalid/provenance";
  }, "RELEASE_MANIFEST_SERVER_PROVENANCE_POLICY_INVALID");
  expectCode((manifest) => {
    manifest.client.sbomPredicateType = "https://spdx.dev/Document/v2.2";
  }, "RELEASE_MANIFEST_CLIENT_SBOM_POLICY_INVALID");
});

test("rejects an unknown manifest schema", () => {
  expectCode((manifest) => {
    manifest.schemaVersion = 2;
  }, "RELEASE_MANIFEST_SCHEMA_INVALID");
});

test("stage-bound manifests isolate preproduction repositories and production validation", () => {
  const manifest = validManifest();
  manifest.releaseStage = "preproduction";
  manifest.imageTag = `preproduction-sha-${gitSha}`;
  manifest.publicSeo.sourceStage = "preproduction";
  for (const component of ["server", "client", "operations"]) {
    manifest[component].image = `ghcr.io/example/haichuan-preproduction-${component}`;
    manifest[component].reference = `${manifest[component].image}@${manifest[component].digest}`;
  }
  assert.deepEqual(validateReleaseManifest(manifest, { gitSha, migrationBundleSha256, releaseStage: "preproduction" }), manifest);
  assert.throws(
    () => validateReleaseManifest(manifest, { gitSha, migrationBundleSha256, releaseStage: "production" }),
    (error) => error?.message === "RELEASE_MANIFEST_STAGE_MISMATCH",
  );
});

test("preproduction accepts a safe fallback while production rejects it", () => {
  const manifest = validManifest();
  manifest.releaseStage = "preproduction";
  manifest.imageTag = `preproduction-sha-${gitSha}`;
  manifest.publicSeo = {
    ...manifest.publicSeo,
    sourceStage: "preproduction",
    sourceArtifactId: 0,
    sourceKind: "safe-fallback",
    contentReady: false,
  };
  for (const component of ["server", "client", "operations"]) {
    manifest[component].image = `ghcr.io/example/haichuan-preproduction-${component}`;
    manifest[component].reference = `${manifest[component].image}@${manifest[component].digest}`;
  }
  assert.deepEqual(validateReleaseManifest(manifest, { gitSha, migrationBundleSha256, releaseStage: "preproduction" }), manifest);
  manifest.releaseStage = "production";
  manifest.imageTag = `sha-${gitSha}`;
  manifest.publicSeo.sourceStage = "production";
  for (const component of ["server", "client", "operations"]) {
    manifest[component].image = `ghcr.io/example/haichuan-${component}`;
    manifest[component].reference = `${manifest[component].image}@${manifest[component].digest}`;
  }
  assert.throws(
    () => validateReleaseManifest(manifest, { gitSha, migrationBundleSha256, releaseStage: "production" }),
    (error) => error?.message === "RELEASE_MANIFEST_PUBLIC_SEO_FALLBACK_INVALID",
  );
});

test("release manifest requires exact immutable public SEO evidence", () => {
  expectCode((manifest) => {
    delete manifest.publicSeo;
  }, "RELEASE_MANIFEST_PUBLIC_SEO_SCHEMA_INVALID");
  expectCode((manifest) => {
    manifest.publicSeo.snapshotHash = "not-a-digest";
  }, "RELEASE_MANIFEST_PUBLIC_SEO_INVALID");
  expectCode((manifest) => {
    manifest.publicSeo.sourceArtifactId = 0;
  }, "RELEASE_MANIFEST_PUBLIC_SEO_APPROVED_SOURCE_INVALID");
  expectCode((manifest) => {
    manifest.publicSeo.untrusted = true;
  }, "RELEASE_MANIFEST_PUBLIC_SEO_SCHEMA_INVALID");
});

test("release environment refuses floating tags, manifest drift and invalid backup/volume policy", () => {
  const manifest = validManifest();
  const env = {
    SERVER_IMAGE_NAME: manifest.server.image, SERVER_IMAGE_DIGEST: manifest.server.digest.slice(7),
    CLIENT_IMAGE_NAME: manifest.client.image, CLIENT_IMAGE_DIGEST: manifest.client.digest.slice(7),
    OPERATIONS_IMAGE_NAME: manifest.operations.image, OPERATIONS_IMAGE_DIGEST: manifest.operations.digest.slice(7), RELEASE_GIT_SHA: gitSha,
    RELEASE_SOURCE: source, MIGRATION_BUNDLE_SHA256: migrationBundleSha256,
    BACKUP_INTERVAL_SECONDS: "3600", BACKUP_RPO_SECONDS: "7200", RESTORE_RTO_SECONDS: "3600",
    BACKUP_RETENTION_DAYS: "7", BACKUP_DB_READY_TIMEOUT_SECONDS: "60",
    MYSQL_VOLUME_NAME: "mysql-data", UPLOADS_VOLUME_NAME: "uploads-data",
    PRIVATE_MEDIA_VOLUME_NAME: "private-media-data", BACKUP_HOST_DIR: "/srv/backup",
  };
  assert.equal(validateReleaseEnvironment(env, manifest).ok, true);
  for (const [changes, code] of [
    [{ SERVER_IMAGE_NAME: "ghcr.io/example/haichuan-server:latest" }, "ENV_SERVER_IMAGE_NOT_DIGEST_PINNED"],
    [{ CLIENT_IMAGE_NAME: manifest.server.image }, "ENV_CLIENT_IMAGE_MANIFEST_MISMATCH"],
    [{ RELEASE_GIT_SHA: "f".repeat(40) }, "ENV_RELEASE_GIT_SHA_MANIFEST_MISMATCH"],
    [{ BACKUP_INTERVAL_SECONDS: "7201" }, "ENV_BACKUP_RPO_UNACHIEVABLE"],
    [{ RESTORE_RTO_SECONDS: "0" }, "ENV_RESTORE_RTO_SECONDS_INVALID"],
    [{ UPLOADS_VOLUME_NAME: "mysql-data" }, "ENV_VOLUME_IDENTITIES_MUST_BE_DISTINCT"],
    [{ BACKUP_HOST_DIR: "./backups" }, "ENV_BACKUP_HOST_DIR_NOT_ABSOLUTE_OR_TOO_BROAD"],
  ]) assert.throws(() => validateReleaseEnvironment({ ...env, ...changes }, manifest), { message: code });
});
