import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  collectContentReadiness,
  stableContentReadiness,
  verifyContentReadinessArtifact,
} from "./verify-release-images-content-readiness.mjs";
import { runContentReadinessMode } from "./verify-release-images.mjs";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

test("content readiness keeps formal launch blocked without persisted runtime evidence", () => {
  const evidence = collectContentReadiness(projectRoot);
  assert.equal(evidence.status, "BLOCKED");
  assert.equal(evidence.ready, false);
  assert.equal(evidence.targetEnvironmentInspected, false);
  assert.equal(evidence.pages.length, 6);
  assert.ok(evidence.pages.every((page) => page.contractDeclared && page.routeWired));
  assert.ok(evidence.blockers.some((item) => item.code === "SIX_PUBLIC_PAGE_PUBLISHED_CONTENT"));
  assert.ok(evidence.blockers.some((item) => item.code === "FORMAL_PRODUCT_ASSORTMENT"));
});

test("unknown rights stay distinct from missing, invalid references and passed checks", () => {
  const evidence = collectContentReadiness(projectRoot);
  assert.ok(evidence.summary.authorizationUnknownAssetCount > 0);
  assert.equal(
    evidence.summary.authorizationUnknownAssetCount
      + evidence.summary.testPlaceholderAssetCount,
    evidence.summary.publicMediaCount,
  );
  assert.ok(evidence.summary.resultCounts.passed > 0);
  assert.ok(evidence.summary.resultCounts.missing > 0);
  assert.ok(evidence.summary.resultCounts["unknown-rights"] > 0);
  assert.equal(evidence.summary.resultCounts["invalid-reference"], 0);
  assert.ok(evidence.assets.public
    .filter((asset) => asset.classification === "AUTHORIZATION_UNKNOWN")
    .every((asset) => asset.result === "unknown-rights"));
});

test("mock remote image is a test placeholder and parser-only origins are ignored", () => {
  const evidence = collectContentReadiness(projectRoot);
  assert.ok(evidence.assets.externalMediaReferences.some((item) =>
    item.url.includes("images.unsplash.com")
      && item.classification === "TEST_PLACEHOLDER"
      && item.result === "passed"));
  assert.ok(!evidence.assets.externalMediaReferences.some((item) =>
    item.url.includes("public-media.local")));
  assert.equal(evidence.summary.unmanagedExternalMediaReferenceCount, 0);
});

test("current public image tags declare alt and static public references resolve", () => {
  const evidence = collectContentReadiness(projectRoot);
  assert.equal(evidence.summary.imageTagsMissingAltAttribute, 0);
  assert.equal(evidence.summary.missingLocalMediaReferenceCount, 0);
  assert.ok(evidence.summary.imageTagsInspected > 0);
});

test("stable artifact comparison ignores only generatedAt and rejects other drift", () => {
  const evidence = collectContentReadiness(projectRoot);
  const changedTime = structuredClone(evidence);
  changedTime.generatedAt = "2099-01-01T00:00:00.000Z";
  assert.deepEqual(stableContentReadiness(changedTime), stableContentReadiness(evidence));

  const directory = mkdtempSync(resolve(tmpdir(), "hc-content-readiness-"));
  const artifact = resolve(directory, "current.json");
  writeFileSync(artifact, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  assert.equal(verifyContentReadinessArtifact(changedTime, artifact).gitSha, evidence.gitSha);

  const stale = JSON.parse(readFileSync(artifact, "utf8"));
  stale.summary.pageCount = 5;
  writeFileSync(artifact, `${JSON.stringify(stale, null, 2)}\n`, "utf8");
  assert.throws(
    () => verifyContentReadinessArtifact(evidence, artifact),
    { message: "CONTENT_READINESS_OUTPUT_STALE" },
  );
});

test("release image verifier exposes the content-readiness mode without hiding blockers", () => {
  const result = runContentReadinessMode(["--content-readiness"], projectRoot);
  assert.equal(result.mode, "content-readiness");
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.ok, false);
  assert.ok(result.blockers.length > 0);
});

test("content readiness enforcement exits non-zero while formal evidence is blocked", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/verify-release-images.mjs", "--content-readiness", "--enforce"],
    { cwd: projectRoot, encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  const output = JSON.parse(result.stdout);
  assert.equal(output.status, "BLOCKED");
  assert.equal(output.enforced, true);
});
