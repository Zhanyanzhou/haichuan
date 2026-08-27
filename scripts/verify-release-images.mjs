import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
  return fromImages;
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
  return path;
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
  const composeImages = assertComposeImages();
  const workflow = assertReleaseWorkflow();
  const runtimeInspectionFieldCount = assertSafeRuntimeInspection();
  return {
    ok: true,
    mode: "static",
    dockerfileBaseCount: serverBases.length + clientBases.length,
    composeImageCount: composeImages.length,
    workflow,
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

function readAndValidateManifest(path) {
  const absolutePath = resolve(projectRoot, path);
  const relativePath = relative(projectRoot, absolutePath);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    fail("RELEASE_MANIFEST_OUTSIDE_PROJECT");
  }
  if (!existsSync(absolutePath)) fail(`RELEASE_MANIFEST_MISSING:${path}`);
  const manifest = JSON.parse(readFileSync(absolutePath, "utf8"));
  if (manifest?.schemaVersion !== 1) fail("RELEASE_MANIFEST_SCHEMA_INVALID");
  if (!gitShaPattern.test(manifest.gitSha ?? "")) fail("RELEASE_MANIFEST_GIT_SHA_INVALID");
  if (manifest.gitSha !== currentGitSha()) fail("RELEASE_MANIFEST_GIT_SHA_MISMATCH");
  if (!/^[a-f0-9]{64}$/.test(manifest.migrationBundleSha256 ?? "")) {
    fail("RELEASE_MANIFEST_MIGRATION_BUNDLE_INVALID");
  }
  if (manifest.migrationBundleSha256 !== repositoryMigrationBundleSha256()) {
    fail("RELEASE_MANIFEST_MIGRATION_BUNDLE_MISMATCH");
  }
  if (typeof manifest.source !== "string" || !/^https:\/\/[^\s]+$/.test(manifest.source)) {
    fail("RELEASE_MANIFEST_SOURCE_INVALID");
  }
  validateImageEntry("server", manifest.server);
  validateImageEntry("client", manifest.client);
  return manifest;
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

try {
  console.log(JSON.stringify(main(), null, 2));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    code: error instanceof Error ? error.message : "RELEASE_IMAGE_VERIFICATION_FAILED",
  }));
  process.exitCode = 1;
}
