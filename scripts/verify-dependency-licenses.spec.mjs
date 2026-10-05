import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ALLOWED_LICENSE_EXPRESSIONS,
  auditPackageLock,
  verifyDependencyLicenses,
} from "./verify-dependency-licenses.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function fixture(options = {}) {
  const license = Object.hasOwn(options, "license") ? options.license : "MIT";
  const { privateRoot = true, version = "1.0.0" } = options;
  return {
    id: "fixture",
    manifest: { name: "private-fixture", private: privateRoot },
    lockfile: {
      lockfileVersion: 3,
      packages: {
        "": { name: "private-fixture", version: "1.0.0" },
        "node_modules/example": { version, license },
      },
    },
    overrides: {},
  };
}

test("current root, client and server lockfiles pass the deterministic license policy", () => {
  const result = verifyDependencyLicenses(projectRoot);
  assert.equal(result.ok, true);
  assert.deepEqual(result.packageRoots.map(({ id }) => id), ["root", "client", "server"]);
  assert.equal(result.packageRoots.every(({ privatePackageCount }) => privatePackageCount === 1), true);
  assert.equal(result.packageRoots.every(({ linkedPackageCount }) => linkedPackageCount === 0), true);
  assert.equal(result.dependencyCount > 0, true);
  assert.equal(result.auditedOverrideCount, 8);
});

test("private package roots do not require a publishable license declaration", () => {
  const result = auditPackageLock(fixture());
  assert.equal(result.privatePackageCount, 1);
  assert.equal(result.dependencyCount, 1);
});

test("public package roots still require an approved license", () => {
  const input = fixture({ privateRoot: false });
  assert.throws(
    () => auditPackageLock(input),
    /DEPENDENCY_LICENSE_ROOT_MISSING:fixture/,
  );
});

test("missing dependency license metadata fails closed without an exact audited override", () => {
  const input = fixture({ license: undefined });
  assert.throws(
    () => auditPackageLock(input),
    /DEPENDENCY_LICENSE_MISSING:fixture:node_modules\/example@1\.0\.0/,
  );
});

test("an audited override binds the package path, version and original license field", () => {
  const input = fixture({ license: undefined });
  input.overrides = {
    "fixture:node_modules/example@1.0.0": {
      declaredLicense: null,
      license: "MIT",
      evidence: "fixture evidence",
    },
  };
  assert.deepEqual(
    auditPackageLock(input).usedOverrides,
    ["fixture:node_modules/example@1.0.0"],
  );

  input.lockfile.packages["node_modules/example"].license = "ISC";
  assert.throws(
    () => auditPackageLock(input),
    /DEPENDENCY_LICENSE_OVERRIDE_DRIFT:fixture:node_modules\/example@1\.0\.0/,
  );
});

test("strong copyleft and noncommercial licenses are explicitly denied", () => {
  for (const license of ["GPL-3.0-only", "AGPL-3.0-only", "SSPL-1.0", "CC-BY-NC-4.0"]) {
    assert.throws(
      () => auditPackageLock(fixture({ license })),
      /DEPENDENCY_LICENSE_DENIED/,
      license,
    );
  }
});

test("unknown license expressions fail closed while every approved expression is accepted", () => {
  assert.throws(
    () => auditPackageLock(fixture({ license: "LicenseRef-Custom" })),
    /DEPENDENCY_LICENSE_UNAPPROVED/,
  );
  for (const license of ALLOWED_LICENSE_EXPRESSIONS) {
    assert.doesNotThrow(() => auditPackageLock(fixture({ license })), license);
  }
});

test("the executable verifier succeeds against the current three lockfiles", () => {
  const result = spawnSync(
    process.execPath,
    [resolve(projectRoot, "scripts", "verify-dependency-licenses.mjs")],
    { cwd: projectRoot, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.packageRoots.length, 3);
});
