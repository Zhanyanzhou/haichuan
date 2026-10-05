import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const MINIMUM_NODE_VERSION = Object.freeze({ major: 22, minor: 12, patch: 0 });
export const PINNED_NODE_VERSION = "22.23.2";
export const PACKAGE_ENGINE_RANGE = "22.x";

const packageContracts = Object.freeze([
  Object.freeze({ path: "package.json", preinstall: "node scripts/verify-node-version.mjs" }),
  Object.freeze({ path: "client/package.json", preinstall: "node ../scripts/verify-node-version.mjs" }),
  Object.freeze({ path: "server/package.json", preinstall: "node ../scripts/verify-node-version.mjs" }),
]);

function fail(code, detail) {
  throw new Error(detail ? `${code}:${detail}` : code);
}

export function parseNodeVersion(value) {
  if (typeof value !== "string") return null;
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value.trim());
  if (!match) return null;
  return Object.freeze({
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  });
}

export function assertSupportedNodeVersion(value, source = "runtime") {
  const version = parseNodeVersion(value);
  if (!version || version.major !== MINIMUM_NODE_VERSION.major || version.minor < MINIMUM_NODE_VERSION.minor) {
    fail("NODE_VERSION_UNSUPPORTED", `${source}:${value}`);
  }
  return version;
}

function readProjectFile(root, relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function verifyWorkflowNodeVersions(root) {
  const workflowRoot = join(root, ".github", "workflows");
  const workflows = readdirSync(workflowRoot)
    .filter((name) => /\.ya?ml$/i.test(name))
    .sort();
  const checked = [];

  for (const name of workflows) {
    const source = readFileSync(join(workflowRoot, name), "utf8");
    const setupNodeCount = [...source.matchAll(/^\s*uses:\s*actions\/setup-node@\S+\s*$/gm)].length;
    if (setupNodeCount === 0) continue;
    const nodeVersions = [...source.matchAll(/^\s*node-version:\s*["']?([^"'\s]+)["']?\s*$/gm)]
      .map((match) => match[1]);
    if (nodeVersions.length !== setupNodeCount || nodeVersions.some((version) => version !== "22")) {
      fail("NODE_WORKFLOW_VERSION_INVALID", name);
    }
    checked.push(Object.freeze({ path: `.github/workflows/${name}`, setupNodeCount }));
  }

  if (checked.length === 0) fail("NODE_WORKFLOW_VERSION_MISSING");
  return Object.freeze(checked);
}

export function verifyNodeVersionContract(root = projectRoot, runtimeVersion = process.versions.node) {
  assertSupportedNodeVersion(runtimeVersion);

  const nvmVersion = readProjectFile(root, ".nvmrc").trim();
  const nodeVersion = readProjectFile(root, ".node-version").trim();
  if (nvmVersion !== PINNED_NODE_VERSION || nodeVersion !== PINNED_NODE_VERSION) {
    fail("NODE_LOCAL_VERSION_PIN_INVALID", `${nvmVersion}:${nodeVersion}`);
  }
  assertSupportedNodeVersion(nvmVersion, ".nvmrc");
  assertSupportedNodeVersion(nodeVersion, ".node-version");

  const packages = packageContracts.map((contract) => {
    const manifest = JSON.parse(readProjectFile(root, contract.path));
    if (manifest?.engines?.node !== PACKAGE_ENGINE_RANGE) {
      fail("NODE_PACKAGE_ENGINE_INVALID", contract.path);
    }
    if (manifest?.scripts?.preinstall !== contract.preinstall) {
      fail("NODE_PACKAGE_PREINSTALL_INVALID", contract.path);
    }
    return Object.freeze({ path: contract.path, engine: manifest.engines.node });
  });

  const workflows = verifyWorkflowNodeVersions(root);
  return Object.freeze({
    ok: true,
    runtimeVersion,
    pinnedVersion: PINNED_NODE_VERSION,
    minimumVersion: `${MINIMUM_NODE_VERSION.major}.${MINIMUM_NODE_VERSION.minor}.${MINIMUM_NODE_VERSION.patch}`,
    packages,
    workflows,
  });
}

const isDirectExecution = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href === import.meta.url
  : false;

if (isDirectExecution) {
  try {
    console.log(JSON.stringify(verifyNodeVersionContract(), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
