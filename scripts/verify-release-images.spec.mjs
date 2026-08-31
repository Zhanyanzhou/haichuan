import assert from "node:assert/strict";
import test from "node:test";

import { validateReleaseManifest } from "./verify-release-images.mjs";

const gitSha = "a".repeat(40);
const migrationBundleSha256 = "b".repeat(64);
const serverDigest = `sha256:${"c".repeat(64)}`;
const clientDigest = `sha256:${"d".repeat(64)}`;
const source = "https://github.com/example/haichuan";

function validManifest() {
  return {
    schemaVersion: 2,
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
    server: {
      image: "ghcr.io/example/haichuan-server",
      digest: serverDigest,
      reference: `ghcr.io/example/haichuan-server@${serverDigest}`,
    },
    client: {
      image: "ghcr.io/example/haichuan-client",
      digest: clientDigest,
      reference: `ghcr.io/example/haichuan-client@${clientDigest}`,
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
});

test("rejects an unknown manifest schema", () => {
  expectCode((manifest) => {
    manifest.schemaVersion = 3;
  }, "RELEASE_MANIFEST_SCHEMA_INVALID");
});
