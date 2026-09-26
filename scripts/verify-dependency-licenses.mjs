import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const PACKAGE_ROOTS = Object.freeze([
  Object.freeze({ id: "root", directory: "." }),
  Object.freeze({ id: "client", directory: "client" }),
  Object.freeze({ id: "server", directory: "server" }),
]);

// 只接受当前已经审计过、适合本项目分发方式的 SPDX 表达式。
// 新表达式默认失败，必须在依赖变更评审中显式确认后加入。
export const ALLOWED_LICENSE_EXPRESSIONS = Object.freeze([
  "(MIT OR CC0-1.0)",
  "0BSD",
  "Apache-2.0",
  "Apache-2.0 AND LGPL-3.0-or-later",
  "Apache-2.0 AND LGPL-3.0-or-later AND MIT",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "BlueOak-1.0.0",
  "CC-BY-4.0",
  "ISC",
  "LGPL-3.0-or-later",
  "MIT",
  "MIT AND ISC",
  "MIT OR Apache-2.0",
  "MIT-0",
  "MPL-2.0",
  "OFL-1.1",
  "Python-2.0",
  "Unlicense",
]);

const allowedLicenses = new Set(ALLOWED_LICENSE_EXPRESSIONS);
const deniedLicensePattern = /(?:^|[\s(])(?:AGPL-|GPL-|SSPL-|BUSL-|CC-BY-NC|CC-BY-ND|Commons-Clause|Elastic-License|Proprietary|UNLICENSED)/i;

// 这些旧包的发布物包含明确许可证文本，但 lockfile 元数据缺失或不是 SPDX 字符串。
// 覆盖绑定包根、lockfile 路径、精确版本和原始字段；任一变化都会失败关闭。
export const AUDITED_LICENSE_OVERRIDES = Object.freeze({
  "root:node_modules/spawn-command@0.0.2": Object.freeze({
    declaredLicense: null,
    license: "MIT",
    evidence: "distributed LICENSE",
  }),
  "server:node_modules/@darabonba/typescript@1.0.5": Object.freeze({
    declaredLicense: "Apache License 2.0",
    license: "Apache-2.0",
    evidence: "legacy package metadata",
  }),
  "server:node_modules/busboy@1.6.0": Object.freeze({
    declaredLicense: null,
    license: "MIT",
    evidence: "legacy licenses metadata and distributed LICENSE",
  }),
  "server:node_modules/passport-local@1.0.0": Object.freeze({
    declaredLicense: null,
    license: "MIT",
    evidence: "legacy licenses metadata and distributed LICENSE",
  }),
  "server:node_modules/passport-strategy@1.0.0": Object.freeze({
    declaredLicense: null,
    license: "MIT",
    evidence: "legacy licenses metadata and distributed LICENSE",
  }),
  "server:node_modules/pause@0.0.1": Object.freeze({
    declaredLicense: null,
    license: "MIT",
    evidence: "distributed Readme.md license section",
  }),
  "server:node_modules/pause-stream@0.0.11": Object.freeze({
    declaredLicense: Object.freeze(["MIT", "Apache2"]),
    license: "MIT OR Apache-2.0",
    evidence: "legacy package metadata and distributed LICENSE",
  }),
  "server:node_modules/streamsearch@1.1.0": Object.freeze({
    declaredLicense: null,
    license: "MIT",
    evidence: "legacy licenses metadata and distributed LICENSE",
  }),
});

function failure(code, detail) {
  const error = new Error(`${code}:${detail}`);
  error.code = code;
  return error;
}

function packageNameFromPath(packagePath) {
  const marker = "node_modules/";
  const markerIndex = packagePath.lastIndexOf(marker);
  return markerIndex === -1 ? packagePath : packagePath.slice(markerIndex + marker.length);
}

function sameDeclaredLicense(actual, expected) {
  return JSON.stringify(actual ?? null) === JSON.stringify(expected);
}

function assertAllowedLicense(license, identity) {
  if (deniedLicensePattern.test(license)) {
    throw failure("DEPENDENCY_LICENSE_DENIED", `${identity}:${license}`);
  }
  if (!allowedLicenses.has(license)) {
    throw failure("DEPENDENCY_LICENSE_UNAPPROVED", `${identity}:${license}`);
  }
}

export function auditPackageLock({
  id,
  manifest,
  lockfile,
  overrides = AUDITED_LICENSE_OVERRIDES,
}) {
  if (!id || !manifest || !lockfile || lockfile.lockfileVersion !== 3 || !lockfile.packages) {
    throw failure("DEPENDENCY_LICENSE_INPUT_INVALID", id || "unknown");
  }

  const packageEntries = Object.entries(lockfile.packages);
  const rootEntry = packageEntries.find(([packagePath]) => packagePath === "")?.[1];
  if (!rootEntry) {
    throw failure("DEPENDENCY_LICENSE_LOCK_ROOT_MISSING", id);
  }

  let privatePackageCount = 0;
  let linkedPackageCount = 0;
  let dependencyCount = 0;
  const usedOverrides = [];
  const licenseCounts = new Map();

  if (manifest.private === true) {
    privatePackageCount += 1;
  } else {
    const rootLicense = typeof manifest.license === "string" ? manifest.license.trim() : "";
    if (!rootLicense) throw failure("DEPENDENCY_LICENSE_ROOT_MISSING", id);
    assertAllowedLicense(rootLicense, `${id}:${manifest.name || "<root>"}`);
  }

  for (const [packagePath, packageData] of packageEntries) {
    if (packagePath === "") continue;
    if (packageData?.link === true) {
      linkedPackageCount += 1;
      continue;
    }
    if (!packagePath.includes("node_modules/") && packageData?.private === true) {
      privatePackageCount += 1;
      continue;
    }
    if (!packageData || typeof packageData.version !== "string" || packageData.version.length === 0) {
      throw failure("DEPENDENCY_LICENSE_VERSION_MISSING", `${id}:${packagePath}`);
    }

    dependencyCount += 1;
    const identity = `${id}:${packagePath}@${packageData.version}`;
    const override = overrides[identity];
    let license;

    if (override) {
      if (!sameDeclaredLicense(packageData.license, override.declaredLicense)) {
        throw failure("DEPENDENCY_LICENSE_OVERRIDE_DRIFT", identity);
      }
      license = override.license;
      usedOverrides.push(identity);
    } else {
      if (typeof packageData.license !== "string" || packageData.license.trim().length === 0) {
        throw failure("DEPENDENCY_LICENSE_MISSING", identity);
      }
      license = packageData.license.trim();
    }

    assertAllowedLicense(license, `${identity}:${packageNameFromPath(packagePath)}`);
    licenseCounts.set(license, (licenseCounts.get(license) || 0) + 1);
  }

  return Object.freeze({
    id,
    dependencyCount,
    privatePackageCount,
    linkedPackageCount,
    usedOverrides: Object.freeze(usedOverrides.sort()),
    licenseCounts: Object.freeze(Object.fromEntries([...licenseCounts].sort(([a], [b]) => a.localeCompare(b)))),
  });
}

export function verifyDependencyLicenses(root = projectRoot) {
  const results = PACKAGE_ROOTS.map(({ id, directory }) => {
    const packageRoot = resolve(root, directory);
    const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
    const lockfile = JSON.parse(readFileSync(join(packageRoot, "package-lock.json"), "utf8"));
    return auditPackageLock({ id, manifest, lockfile });
  });

  const usedOverrides = new Set(results.flatMap((result) => result.usedOverrides));
  const staleOverrides = Object.keys(AUDITED_LICENSE_OVERRIDES).filter((identity) => !usedOverrides.has(identity));
  if (staleOverrides.length > 0) {
    throw failure("DEPENDENCY_LICENSE_OVERRIDE_STALE", staleOverrides.join(","));
  }

  return Object.freeze({
    ok: true,
    packageRoots: results,
    dependencyCount: results.reduce((total, result) => total + result.dependencyCount, 0),
    auditedOverrideCount: usedOverrides.size,
  });
}

const isCli = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href === import.meta.url
  : false;

if (isCli) {
  try {
    console.log(JSON.stringify(verifyDependencyLicenses(), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
