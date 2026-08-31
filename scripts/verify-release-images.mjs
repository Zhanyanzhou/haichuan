import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const digestPattern = /^sha256:[a-f0-9]{64}$/;
const imageNamePattern = /^ghcr\.io\/[a-z0-9._/-]+$/;
const digestReferencePattern = /^ghcr\.io\/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$/;
const gitShaPattern = /^[a-f0-9]{40}$/;

function fail(code) {
  throw new Error(code);
}

function readProjectFile(path) {
  const absolutePath = join(projectRoot, path);
  if (!existsSync(absolutePath)) fail(`REQUIRED_FILE_MISSING:${path}`);
  return readFileSync(absolutePath, "utf8");
}

function currentGitSha() {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function repositoryMigrationBundleSha256() {
  return execFileSync(
    process.execPath,
    ["scripts/verify-migration-integrity.mjs", "--print-bundle-sha"],
    {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  ).trim();
}

function assertPinnedDockerfile(path, component) {
  const source = readProjectFile(path);
  const fromImages = [...source.matchAll(/^FROM\s+([^\s]+)(?:\s+AS\s+\S+)?\s*$/gim)]
    .map((match) => match[1]);
  if (fromImages.length === 0) fail(`DOCKERFILE_FROM_MISSING:${path}`);
  for (const image of fromImages) {
    if (!/@sha256:[a-f0-9]{64}$/.test(image)) {
      fail(`DOCKERFILE_BASE_NOT_PINNED:${path}:${image}`);
    }
  }
  for (const label of [
    "org.opencontainers.image.source",
    "org.opencontainers.image.revision",
    "io.haichuan.component",
    "io.haichuan.migration-bundle-sha256",
  ]) {
    if (!source.includes(label)) fail(`DOCKERFILE_LABEL_MISSING:${path}:${label}`);
  }
  if (!source.includes(`io.haichuan.component=\"${component}\"`)) {
    fail(`DOCKERFILE_COMPONENT_LABEL_INVALID:${path}`);
  }
  const runtimeStage = source.slice(source.toUpperCase().lastIndexOf("FROM "));
  const runtimeUser = /^USER\s+(\S+)\s*$/gim.exec(runtimeStage)?.[1];
  if (!runtimeUser || /^(?:root|0(?::0)?)$/i.test(runtimeUser)) {
    fail(`DOCKERFILE_RUNTIME_USER_NOT_NON_ROOT:${path}`);
  }
  return fromImages;
}

function assertNodeAndClientRuntimeBaseline() {
  for (const path of ["package.json", "client/package.json", "server/package.json"]) {
    const manifest = JSON.parse(readProjectFile(path));
    if (manifest?.engines?.node !== "22.x") {
      fail(`NODE_ENGINE_BASELINE_INVALID:${path}`);
    }
  }
  for (const path of [".github/workflows/ci.yml", ".github/workflows/quality.yml"]) {
    const source = readProjectFile(path);
    const versions = [...source.matchAll(/^\s+node-version:\s*["']?(\d+)["']?\s*$/gm)]
      .map((match) => Number(match[1]));
    if (versions.length === 0 || versions.some((version) => version !== 22)) {
      fail(`WORKFLOW_NODE_BASELINE_INVALID:${path}`);
    }
  }
  for (const path of ["server/Dockerfile", "client/Dockerfile"]) {
    const source = readProjectFile(path);
    const nodeBases = [...source.matchAll(/^FROM\s+(node:[^\s]+)(?:\s+AS\s+\S+)?\s*$/gim)]
      .map((match) => match[1]);
    if (nodeBases.length === 0 || nodeBases.some((image) => !/^node:22-alpine@sha256:/.test(image))) {
      fail(`DOCKERFILE_NODE_BASELINE_INVALID:${path}`);
    }
  }

  const compose = readProjectFile("docker-compose.yml");
  const clientNginx = readProjectFile("client/nginx.conf");
  const clientMainNginx = readProjectFile("client/nginx-main.conf");
  if (!compose.includes('- "80:8080"') ||
      !compose.includes("http://127.0.0.1:8080/") ||
      !/^\s*listen\s+8080;\s*$/m.test(clientNginx)) {
    fail("CLIENT_NON_ROOT_PORT_CONTRACT_INVALID");
  }
  for (const required of [
    "pid /tmp/nginx.pid;",
    "client_body_temp_path /tmp/client_temp;",
    "proxy_temp_path /tmp/proxy_temp;",
  ]) {
    if (!clientMainNginx.includes(required)) {
      fail(`CLIENT_NON_ROOT_NGINX_PATH_MISSING:${required}`);
    }
  }
  return { packageCount: 3, workflowCount: 2, dockerfileCount: 2 };
}

function assertComposeImages() {
  const source = readProjectFile("docker-compose.yml");
  if (!source.includes('image: "${SERVER_IMAGE:-2-server:latest}"')) {
    fail("COMPOSE_SERVER_IMAGE_CONTRACT_MISSING");
  }
  if (!source.includes('image: "${CLIENT_IMAGE:-2-client:latest}"')) {
    fail("COMPOSE_CLIENT_IMAGE_CONTRACT_MISSING");
  }

  const imageValues = [...source.matchAll(/^\s+image:\s*["']?([^"'\r\n]+)["']?\s*$/gm)]
    .map((match) => match[1].trim());
  for (const value of imageValues) {
    if (value === "${SERVER_IMAGE:-2-server:latest}" ||
        value === "${CLIENT_IMAGE:-2-client:latest}") {
      continue;
    }
    if (!/@sha256:[a-f0-9]{64}$/.test(value)) {
      fail(`COMPOSE_EXTERNAL_IMAGE_NOT_PINNED:${value}`);
    }
  }
  return imageValues;
}

function assertReleaseWorkflow() {
  const path = ".github/workflows/release-images.yml";
  const source = readProjectFile(path);
  const header = source.split(/^jobs:/m, 1)[0];
  if (!/^on:\s*\r?\n\s{2}workflow_dispatch:/m.test(header)) {
    fail("RELEASE_WORKFLOW_NOT_MANUAL_ONLY");
  }
  if (/^\s{2}(push|pull_request|schedule):/m.test(header)) {
    fail("RELEASE_WORKFLOW_AUTOMATIC_TRIGGER_FORBIDDEN");
  }
  for (const match of source.matchAll(/^\s+uses:\s+([^\s]+)\s*$/gm)) {
    const reference = match[1];
    if (!/@[a-f0-9]{40}$/.test(reference)) {
      fail(`RELEASE_WORKFLOW_ACTION_NOT_PINNED:${reference}`);
    }
  }
  if (!/^\s+provenance:\s+mode=max\s*$/m.test(source)) {
    fail("RELEASE_WORKFLOW_PROVENANCE_MISSING");
  }
  if (!/^\s+sbom:\s+true\s*$/m.test(source)) {
    fail("RELEASE_WORKFLOW_SBOM_MISSING");
  }
  if (!source.includes("release-manifest.json")) {
    fail("RELEASE_WORKFLOW_MANIFEST_MISSING");
  }
  if ((source.match(/^\s+push:\s+true\s*$/gm) ?? []).length !== 2) {
    fail("RELEASE_WORKFLOW_PUSH_CONTRACT_INVALID");
  }
  if ((source.match(/^\s+sbom:\s+true\s*$/gm) ?? []).length !== 2 ||
      (source.match(/^\s+provenance:\s+mode=max\s*$/gm) ?? []).length !== 2) {
    fail("RELEASE_WORKFLOW_ATTESTATION_CONTRACT_INVALID");
  }
  if (!source.includes(":sha-${{ github.sha }}")) {
    fail("RELEASE_WORKFLOW_COMMIT_TAG_MISSING");
  }
  if (!/^\s{2}actions:\s*read\s*$/m.test(source)) {
    fail("RELEASE_WORKFLOW_ACTIONS_READ_PERMISSION_MISSING");
  }
  if (!/^\s{2}quality-proof:\s*$/m.test(source) ||
      !/^\s{4}needs:\s*quality-proof\s*$/m.test(source)) {
    fail("RELEASE_WORKFLOW_QUALITY_PROOF_DEPENDENCY_MISSING");
  }
  for (const required of [
    "actions/workflows/quality.yml/runs?head_sha=${GITHUB_SHA}",
    'run.head_sha === process.env.GITHUB_SHA',
    'run.event === "push"',
    'run.conclusion === "success"',
    "QUALITY_GATE_SAME_SHA_SUCCESS_NOT_FOUND",
    "schemaVersion:2",
    "qualityGate:",
  ]) {
    if (!source.includes(required)) {
      fail(`RELEASE_WORKFLOW_QUALITY_PROOF_CONTRACT_MISSING:${required}`);
    }
  }
  return path;
}

function assertWorkflowActionsPinned() {
  const workflowPaths = [
    ".github/workflows/ci.yml",
    ".github/workflows/quality.yml",
    ".github/workflows/release-images.yml",
  ];
  let actionCount = 0;
  for (const path of workflowPaths) {
    const source = readProjectFile(path);
    for (const match of source.matchAll(/^\s+(?:-\s+)?uses:\s+([^\s]+)\s*$/gm)) {
      actionCount += 1;
      const reference = match[1];
      if (!/@[a-f0-9]{40}$/.test(reference)) {
        fail(`WORKFLOW_ACTION_NOT_PINNED:${path}:${reference}`);
      }
    }
  }
  if (actionCount === 0) fail("WORKFLOW_ACTION_REFERENCE_MISSING");
  return { workflowCount: workflowPaths.length, actionCount };
}

function assertReleaseSupplyChainTests() {
  const manifest = JSON.parse(readProjectFile("package.json"));
  const rootTest = manifest?.scripts?.test;
  const releaseTest = manifest?.scripts?.["test:release-supply-chain"];
  if (typeof rootTest !== "string" ||
      !rootTest.includes("npm run test:release-supply-chain")) {
    fail("RELEASE_SUPPLY_CHAIN_TEST_NOT_IN_QUALITY_SUITE");
  }
  if (releaseTest !== "node --test scripts/verify-release-images.spec.mjs") {
    fail("RELEASE_SUPPLY_CHAIN_TEST_COMMAND_INVALID");
  }
  return {
    command: releaseTest,
    includedInRootTest: true,
  };
}

function assertSafeRuntimeInspection() {
  const source = readProjectFile("scripts/verify-release-images.mjs");
  const forbiddenFullImageFormat = "{{json " + ".}}";
  if (source.includes(forbiddenFullImageFormat)) {
    fail("RUNTIME_IMAGE_INSPECT_MUST_USE_FIELD_ALLOWLIST");
  }
  for (const field of [
    "{{json .RepoDigests}}",
    "org.opencontainers.image.revision",
    "io.haichuan.component",
    "io.haichuan.migration-bundle-sha256",
  ]) {
    if (!source.includes(field)) {
      fail(`RUNTIME_IMAGE_INSPECT_FIELD_MISSING:${field}`);
    }
  }
  return 4;
}

function verifyStaticContract() {
  const serverBases = assertPinnedDockerfile("server/Dockerfile", "server");
  const clientBases = assertPinnedDockerfile("client/Dockerfile", "client");
  const runtimeBaseline = assertNodeAndClientRuntimeBaseline();
  const composeImages = assertComposeImages();
  const workflow = assertReleaseWorkflow();
  const workflowActions = assertWorkflowActionsPinned();
  const supplyChainTests = assertReleaseSupplyChainTests();
  const runtimeInspectionFieldCount = assertSafeRuntimeInspection();
  return {
    ok: true,
    mode: "static",
    dockerfileBaseCount: serverBases.length + clientBases.length,
    runtimeBaseline,
    composeImageCount: composeImages.length,
    workflow,
    workflowCount: workflowActions.workflowCount,
    workflowActionCount: workflowActions.actionCount,
    supplyChainTests,
    runtimeInspectionFieldCount,
  };
}

function validateImageEntry(name, entry) {
  if (!entry || typeof entry !== "object") fail(`RELEASE_MANIFEST_${name.toUpperCase()}_MISSING`);
  if (!imageNamePattern.test(entry.image ?? "")) {
    fail(`RELEASE_MANIFEST_${name.toUpperCase()}_IMAGE_INVALID`);
  }
  if (!digestPattern.test(entry.digest ?? "")) {
    fail(`RELEASE_MANIFEST_${name.toUpperCase()}_DIGEST_INVALID`);
  }
  if (!digestReferencePattern.test(entry.reference ?? "") ||
      entry.reference !== `${entry.image}@${entry.digest}`) {
    fail(`RELEASE_MANIFEST_${name.toUpperCase()}_REFERENCE_INVALID`);
  }
}

export function validateReleaseManifest(manifest, expected) {
  if (manifest?.schemaVersion !== 2) fail("RELEASE_MANIFEST_SCHEMA_INVALID");
  if (!gitShaPattern.test(manifest.gitSha ?? "")) fail("RELEASE_MANIFEST_GIT_SHA_INVALID");
  if (manifest.gitSha !== expected.gitSha) fail("RELEASE_MANIFEST_GIT_SHA_MISMATCH");
  if (!/^[a-f0-9]{64}$/.test(manifest.migrationBundleSha256 ?? "")) {
    fail("RELEASE_MANIFEST_MIGRATION_BUNDLE_INVALID");
  }
  if (manifest.migrationBundleSha256 !== expected.migrationBundleSha256) {
    fail("RELEASE_MANIFEST_MIGRATION_BUNDLE_MISMATCH");
  }
  if (typeof manifest.source !== "string" || !/^https:\/\/[^\s]+$/.test(manifest.source)) {
    fail("RELEASE_MANIFEST_SOURCE_INVALID");
  }
  const quality = manifest.qualityGate;
  if (!quality || typeof quality !== "object") fail("RELEASE_MANIFEST_QUALITY_GATE_MISSING");
  if (quality.workflow !== "quality.yml") fail("RELEASE_MANIFEST_QUALITY_WORKFLOW_INVALID");
  if (!Number.isSafeInteger(quality.runId) || quality.runId <= 0) {
    fail("RELEASE_MANIFEST_QUALITY_RUN_ID_INVALID");
  }
  if (quality.headSha !== manifest.gitSha) fail("RELEASE_MANIFEST_QUALITY_SHA_MISMATCH");
  if (quality.event !== "push" || quality.conclusion !== "success") {
    fail("RELEASE_MANIFEST_QUALITY_RESULT_INVALID");
  }
  if (quality.runUrl !== `${manifest.source}/actions/runs/${quality.runId}`) {
    fail("RELEASE_MANIFEST_QUALITY_RUN_URL_INVALID");
  }
  validateImageEntry("server", manifest.server);
  validateImageEntry("client", manifest.client);
  return manifest;
}

function readAndValidateManifest(path) {
  const absolutePath = resolve(projectRoot, path);
  const relativePath = relative(projectRoot, absolutePath);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    fail("RELEASE_MANIFEST_OUTSIDE_PROJECT");
  }
  if (!existsSync(absolutePath)) fail(`RELEASE_MANIFEST_MISSING:${path}`);
  const manifest = JSON.parse(readFileSync(absolutePath, "utf8"));
  return validateReleaseManifest(manifest, {
    gitSha: currentGitSha(),
    migrationBundleSha256: repositoryMigrationBundleSha256(),
  });
}

function inspectImageField(reference, format) {
  return execFileSync(
    "docker",
    ["image", "inspect", reference, "--format", format],
    { cwd: projectRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
}

function inspectImage(reference) {
  // 只读取 release identity 所需白名单字段。完整 image inspect 会把
  // Config.Env 一并带入进程输出；即使当前不打印，也不应让秘密材料进入
  // 诊断缓冲区或后续异常处理面。
  const repoDigests = JSON.parse(
    inspectImageField(reference, "{{json .RepoDigests}}") || "[]",
  );
  const readLabel = (label) =>
    inspectImageField(
      reference,
      `{{with .Config.Labels}}{{index . "${label}"}}{{end}}`,
    ) || null;
  return {
    repoDigests: Array.isArray(repoDigests) ? repoDigests : [],
    revisionLabel: readLabel("org.opencontainers.image.revision"),
    componentLabel: readLabel("io.haichuan.component"),
    migrationBundleLabel: readLabel("io.haichuan.migration-bundle-sha256"),
  };
}

function verifyRuntimeImage(component, reference, gitSha, migrationBundleSha256) {
  if (!digestReferencePattern.test(reference)) {
    fail(`RUNTIME_${component.toUpperCase()}_REFERENCE_NOT_DIGEST_PINNED`);
  }
  const inspected = inspectImage(reference);
  if (!inspected.repoDigests.includes(reference)) {
    fail(`RUNTIME_${component.toUpperCase()}_DIGEST_NOT_PRESENT`);
  }
  if (inspected.revisionLabel !== gitSha) {
    fail(`RUNTIME_${component.toUpperCase()}_REVISION_LABEL_MISMATCH`);
  }
  if (inspected.componentLabel !== component) {
    fail(`RUNTIME_${component.toUpperCase()}_COMPONENT_LABEL_MISMATCH`);
  }
  if (inspected.migrationBundleLabel !== migrationBundleSha256) {
    fail(`RUNTIME_${component.toUpperCase()}_MIGRATION_LABEL_MISMATCH`);
  }
}

function verifyRuntimeContract() {
  const serverImage = process.env.SERVER_IMAGE;
  const clientImage = process.env.CLIENT_IMAGE;
  const gitSha = process.env.RELEASE_GIT_SHA;
  const migrationBundleSha256 = process.env.MIGRATION_BUNDLE_SHA256;
  if (!serverImage || !clientImage || !gitSha || !migrationBundleSha256) {
    fail("RUNTIME_RELEASE_ENVIRONMENT_INCOMPLETE");
  }
  if (!gitShaPattern.test(gitSha)) fail("RUNTIME_RELEASE_GIT_SHA_INVALID");
  if (gitSha !== currentGitSha()) fail("RUNTIME_RELEASE_GIT_SHA_MISMATCH");
  if (!/^[a-f0-9]{64}$/.test(migrationBundleSha256)) {
    fail("RUNTIME_MIGRATION_BUNDLE_INVALID");
  }
  if (migrationBundleSha256 !== repositoryMigrationBundleSha256()) {
    fail("RUNTIME_MIGRATION_BUNDLE_MISMATCH");
  }
  verifyRuntimeImage("server", serverImage, gitSha, migrationBundleSha256);
  verifyRuntimeImage("client", clientImage, gitSha, migrationBundleSha256);
  return { ok: true, mode: "runtime", gitSha, migrationBundleSha256 };
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--static")) return verifyStaticContract();
  const manifestIndex = args.indexOf("--manifest");
  if (manifestIndex >= 0) {
    const path = args[manifestIndex + 1];
    if (!path) fail("RELEASE_MANIFEST_PATH_REQUIRED");
    const manifest = readAndValidateManifest(path);
    return {
      ok: true,
      mode: "manifest",
      gitSha: manifest.gitSha,
      migrationBundleSha256: manifest.migrationBundleSha256,
      serverReference: manifest.server.reference,
      clientReference: manifest.client.reference,
    };
  }
  if (args.includes("--runtime")) return verifyRuntimeContract();
  fail("VERIFY_RELEASE_IMAGES_MODE_REQUIRED");
}

const isDirectExecution = process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isDirectExecution) {
  try {
    console.log(JSON.stringify(main(), null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      code: error instanceof Error ? error.message : "RELEASE_IMAGE_VERIFICATION_FAILED",
    }));
    process.exitCode = 1;
  }
}
