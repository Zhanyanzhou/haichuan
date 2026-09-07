import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  validateComposeBuildPolicy,
  validateReleaseEnvironment,
  validateReleaseManifest,
} from "./verify-release-images.mjs";

const releaseWorkflow = readFileSync(new URL("../.github/workflows/release-images.yml", import.meta.url), "utf8");
const baseCompose = readFileSync(new URL("../docker-compose.yml", import.meta.url), "utf8");
const operationsCompose = readFileSync(new URL("../docker-compose.operations.yml", import.meta.url), "utf8");
const wechatPayCompose = readFileSync(new URL("../docker-compose.wechat-pay.yml", import.meta.url), "utf8");
const serverDockerfile = readFileSync(new URL("../server/Dockerfile", import.meta.url), "utf8");

const gitSha = "a".repeat(40);
const migrationBundleSha256 = "b".repeat(64);
const serverDigest = `sha256:${"c".repeat(64)}`;
const clientDigest = `sha256:${"d".repeat(64)}`;
const operationsDigest = `sha256:${"e".repeat(64)}`;

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
  assert.match(serverDockerfile, /RUN apk add --no-cache bash mariadb-client openssl/);
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
  assert.match(releaseWorkflow, /id: operations-provenance/);
  assert.match(releaseWorkflow, /id: operations-sbom/);
  assert.match(releaseWorkflow, /runtimeExecutables/);
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

function validManifest() {
  return {
    schemaVersion: 3,
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
      signerWorkflow: "github.com/example/haichuan/.github/workflows/release-images.yml",
      sourceDigest: gitSha,
      imageAttestationsVerified: true,
      provenancePredicateType: "https://slsa.dev/provenance/v1",
      sbomPredicateType: "https://spdx.dev/Document/v2.3",
      manifestPredicateType: "https://slsa.dev/provenance/v1",
    },
    server: {
      image: "ghcr.io/example/haichuan-server",
      digest: serverDigest,
      reference: `ghcr.io/example/haichuan-server@${serverDigest}`,
      provenancePredicateType: "https://slsa.dev/provenance/v1",
      sbomPredicateType: "https://spdx.dev/Document/v2.3",
    },
    client: {
      image: "ghcr.io/example/haichuan-client",
      digest: clientDigest,
      reference: `ghcr.io/example/haichuan-client@${clientDigest}`,
      provenancePredicateType: "https://slsa.dev/provenance/v1",
      sbomPredicateType: "https://spdx.dev/Document/v2.3",
    },
    operations: {
      image: "ghcr.io/example/haichuan-operations",
      digest: operationsDigest,
      reference: `ghcr.io/example/haichuan-operations@${operationsDigest}`,
      provenancePredicateType: "https://slsa.dev/provenance/v1",
      sbomPredicateType: "https://spdx.dev/Document/v2.3",
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
  }, "RELEASE_MANIFEST_OPERATIONS_EXECUTABLES_INVALID");
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
