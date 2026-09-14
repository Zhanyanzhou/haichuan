import assert from "node:assert/strict";
import test from "node:test";

import { validatePreproductionDeployInputs } from "./prepare-preproduction-deploy.mjs";

const sha = (value) => value.repeat(64);
function manifest() {
  const gitSha = "a".repeat(40);
  const image = (component, value) => ({
    image: `ghcr.io/zhanyanzhou/haichuan-preproduction-${component}`,
    digest: `sha256:${sha(value)}`,
    reference: `ghcr.io/zhanyanzhou/haichuan-preproduction-${component}@sha256:${sha(value)}`,
  });
  return {
    schemaVersion: 6,
    releaseStage: "preproduction",
    imageTag: `preproduction-sha-${gitSha}`,
    gitSha,
    migrationBundleSha256: sha("b"),
    source: "https://github.com/Zhanyanzhou/haichuan",
    qualityGate: {},
    attestationPolicy: {},
    publicSeo: {
      sourceStage: "preproduction",
      snapshotHash: sha("c"),
      prerenderManifestSha256: sha("d"),
      sourceArtifactId: 0,
      sourceArtifactDigest: `sha256:${sha("e")}`,
      sourceKind: "safe-fallback",
      contentReady: false,
    },
    server: image("server", "1"),
    client: image("client", "2"),
    operations: image("operations", "3"),
  };
}

test("prepares only digest-pinned preproduction images with safe gates", () => {
  const result = validatePreproductionDeployInputs(manifest(), "RELEASE_PROFILE=lead-generation\nCUSTOMER_COMMERCE_ENABLED=false\n");
  assert.equal(result.PUBLIC_SEO_CONTENT_READY, "false");
  assert.equal(result.SERVER_IMAGE_DIGEST, sha("1"));
});

test("rejects production, floating images, and enabled external effects", () => {
  const production = manifest();
  production.releaseStage = "production";
  assert.throws(() => validatePreproductionDeployInputs(production, ""), /MANIFEST_IDENTITY_INVALID/);
  const floating = manifest();
  floating.client.reference = `${floating.client.image}:latest`;
  assert.throws(() => validatePreproductionDeployInputs(floating, ""), /CLIENT_IMAGE_INVALID/);
  assert.throws(
    () => validatePreproductionDeployInputs(manifest(), "PAYMENT_GATEWAY_TRANSACTIONS_ENABLED=true\n"),
    /UNSAFE_GATE:PAYMENT_GATEWAY_TRANSACTIONS_ENABLED/,
  );
});

test("accepts reviewed preproduction content but rejects contradictory source facts", () => {
  const reviewed = manifest();
  reviewed.publicSeo.contentReady = true;
  reviewed.publicSeo.sourceKind = "approved-snapshot";
  reviewed.publicSeo.sourceArtifactId = 123;
  assert.equal(validatePreproductionDeployInputs(reviewed, "").PUBLIC_SEO_CONTENT_READY, "true");
  reviewed.publicSeo.sourceArtifactId = 0;
  assert.throws(() => validatePreproductionDeployInputs(reviewed, ""), /APPROVED_CONTENT_INVALID/);
});
