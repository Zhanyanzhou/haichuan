import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  PINNED_NODE_VERSION,
  assertSupportedNodeVersion,
  verifyNodeVersionContract,
} from "./verify-node-version.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("Node 22.12+ versions satisfy the runtime contract", () => {
  for (const version of ["22.12.0", "v22.12.1", PINNED_NODE_VERSION, "22.99.0"]) {
    assert.doesNotThrow(() => assertSupportedNodeVersion(version), version);
  }
});

test("older Node 22, other majors and incomplete versions fail closed", () => {
  for (const version of ["22.11.99", "21.99.0", "23.0.0", "25.2.1", "22", "22.12"]) {
    assert.throws(
      () => assertSupportedNodeVersion(version),
      /NODE_VERSION_UNSUPPORTED/,
      version,
    );
  }
});

test("local pins, all package manifests and setup-node workflows share one Node 22 contract", () => {
  const result = verifyNodeVersionContract(projectRoot);
  assert.equal(result.ok, true);
  assert.equal(result.runtimeVersion, process.versions.node);
  assert.equal(result.pinnedVersion, PINNED_NODE_VERSION);
  assert.equal(result.minimumVersion, "22.12.0");
  assert.equal(result.packages.length, 3);
  assert.equal(result.workflows.length > 0, true);
});

test("the executable verifier succeeds under the supported runtime", () => {
  const result = spawnSync(
    process.execPath,
    [resolve(projectRoot, "scripts", "verify-node-version.mjs")],
    { cwd: projectRoot, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).ok, true);
});
