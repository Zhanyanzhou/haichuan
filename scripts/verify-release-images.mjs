import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { load as parseYaml } from "js-yaml";
import {
  collectContentReadiness,
  verifyContentReadinessArtifact,
  writeContentReadinessEvidence,
} from "./verify-release-images-content-readiness.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const digestPattern = /^sha256:[a-f0-9]{64}$/;
const imageNamePattern = /^ghcr\.io\/[a-z0-9._/-]+$/;
const digestReferencePattern = /^ghcr\.io\/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$/;
const gitShaPattern = /^[a-f0-9]{40}$/;
const operationsRuntimeExecutables = [
  "/usr/local/bin/backup.sh",
  "/usr/local/bin/check-backup-health.sh",
  "/usr/local/bin/restore.sh",
  "/usr/local/bin/restore-drill.sh",
  "/usr/local/bin/prune-backups.sh",
];
export const releaseStaticWorkflowPaths = Object.freeze([
  ".github/workflows/quality.yml",
  ".github/workflows/export-public-seo-snapshot.yml",
  ".github/workflows/release-images.yml",
  ".github/workflows/verify-production-evidence.yml",
]);

function fail(code) {
  throw new Error(code);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, expectedKeys) {
  return isRecord(value) &&
    Object.keys(value).sort().join("\0") === [...expectedKeys].sort().join("\0");
}

export function findComposeBuildServices(source) {
  let compose;
  try {
    compose = parseYaml(source, {
      json: false,
    });
  } catch {
    fail("COMPOSE_YAML_INVALID");
  }
  if (!isRecord(compose) || !isRecord(compose.services)) {
    fail("COMPOSE_SERVICES_INVALID");
  }

  const buildServices = [];
  for (const [serviceName, service] of Object.entries(compose.services)) {
    if (!isRecord(service) || Object.keys(service).length === 0) {
      fail(`COMPOSE_SERVICE_INVALID:${serviceName}`);
    }
    if (Object.hasOwn(service, "build")) buildServices.push(serviceName);
  }
  return buildServices;
}

export function validateComposeBuildPolicy(source) {
  const buildServices = findComposeBuildServices(source);
  if (buildServices.length > 0) {
    fail(`COMPOSE_PRODUCTION_BUILD_FORBIDDEN:${buildServices[0]}`);
  }
  return { buildServiceCount: 0 };
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
  if (/ARG\s+(?:BUILD_REVISION|BUILD_SOURCE|MIGRATION_BUNDLE_SHA256)=local/.test(source)) {
    fail(`DOCKERFILE_LOCAL_RELEASE_IDENTITY_FALLBACK_FORBIDDEN:${path}`);
  }
  const fromInstructions = [...source.matchAll(/^FROM\s+([^\s]+)(?:\s+AS\s+(\S+))?\s*$/gim)];
  if (fromInstructions.length === 0) fail(`DOCKERFILE_FROM_MISSING:${path}`);
  const stageAliases = new Set();
  const fromImages = [];
  for (const [, image, alias] of fromInstructions) {
    if (stageAliases.has(image)) {
      if (alias) stageAliases.add(alias);
      continue;
    }
    if (!/@sha256:[a-f0-9]{64}$/.test(image)) {
      fail(`DOCKERFILE_BASE_NOT_PINNED:${path}:${image}`);
    }
    fromImages.push(image);
    if (alias) stageAliases.add(alias);
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

function assertOperationsDockerStage() {
  const path = "server/Dockerfile";
  const source = readProjectFile(path);
  const runtimeDependencies = /^FROM\s+node:22-bookworm-slim@sha256:[a-f0-9]{64}\s+AS\s+runtime-deps\s*$/im.exec(source);
  if (
    !runtimeDependencies
    || !source.includes("npm ci --omit=dev --include=optional --legacy-peer-deps")
    || !source.includes("rm -rf node_modules/prisma node_modules/.bin/prisma")
  ) {
    fail("RUNTIME_DEPENDENCIES_STAGE_INVALID");
  }
  const match = /^FROM\s+runtime-deps\s+AS\s+operations\s*$/im.exec(source);
  if (!match) fail("OPERATIONS_DOCKER_STAGE_PINNED_BASE_MISSING");
  const stageStart = match.index;
  const nextStage = source.slice(stageStart + match[0].length).search(/^FROM\s+/im);
  const stage = nextStage < 0
    ? source.slice(stageStart)
    : source.slice(stageStart, stageStart + match[0].length + nextStage);
  const normalizedStage = stage.replace(/\\\r?\n\s*/g, " ");
  const executableNames = operationsRuntimeExecutables.map((path) => path.split("/").at(-1));
  for (const required of [
    "apt-get install -y --no-install-recommends default-mysql-client openssl",
    'io.haichuan.component="operations"',
    "COPY --from=build /app/node_modules/prisma ./node_modules/prisma",
    "COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma",
    "ln -sf ../prisma/build/index.js node_modules/.bin/prisma",
    "COPY --from=build /app/dist ./dist",
    `COPY ${executableNames.map((name) => `scripts/${name}`).join(" ")} /usr/local/bin/`,
    `chmod 0555 ${operationsRuntimeExecutables.join(" ")}`,
    'USER node',
    'CMD ["./node_modules/.bin/prisma", "migrate", "status"]',
    'test -n "$BUILD_REVISION"',
  ]) {
    if (!normalizedStage.includes(required)) fail(`OPERATIONS_DOCKER_STAGE_CONTRACT_MISSING:${required}`);
  }
  if (stage.includes("npm ci --include=dev")) fail("OPERATIONS_DOCKER_FULL_DEV_TREE_FORBIDDEN");
  for (const scriptPath of [
    "server/scripts/check-backup-health.sh",
    "server/scripts/restore.sh",
    "server/scripts/restore-drill.sh",
    "server/scripts/prune-backups.sh",
  ]) {
    const script = readProjectFile(scriptPath);
    if (/\$1\s*!~\s*\/\^\[0-9a-fA-F\]\{64\}\$\//.test(script)
        || !script.includes("length($1) != 64")) {
      fail(`OPERATIONS_SHA256_AWK_PORTABILITY_INVALID:${scriptPath}`);
    }
  }
  return { path, runtimeExecutables: operationsRuntimeExecutables };
}

function assertNodeAndClientRuntimeBaseline() {
  for (const path of ["package.json", "client/package.json", "server/package.json"]) {
    const manifest = JSON.parse(readProjectFile(path));
    if (manifest?.engines?.node !== "22.x") {
      fail(`NODE_ENGINE_BASELINE_INVALID:${path}`);
    }
  }
  for (const path of releaseStaticWorkflowPaths) {
    const source = readProjectFile(path);
    const versions = [...source.matchAll(/^\s+node-version:\s*["']?(\d+)["']?\s*$/gm)]
      .map((match) => Number(match[1]));
    if (versions.length === 0 || versions.some((version) => version !== 22)) {
      fail(`WORKFLOW_NODE_BASELINE_INVALID:${path}`);
    }
  }
  for (const [path, expectedBase] of [
    ["server/Dockerfile", /^node:22-bookworm-slim@sha256:/],
    ["client/Dockerfile", /^node:22-alpine@sha256:/],
  ]) {
    const source = readProjectFile(path);
    const nodeBases = [...source.matchAll(/^FROM\s+(node:[^\s]+)(?:\s+AS\s+\S+)?\s*$/gim)]
      .map((match) => match[1]);
    if (nodeBases.length === 0 || nodeBases.some((image) => !expectedBase.test(image))) {
      fail(`DOCKERFILE_NODE_BASELINE_INVALID:${path}`);
    }
  }

  const compose = readProjectFile("docker-compose.yml");
  const clientNginx = readProjectFile("client/nginx.conf");
  const clientMainNginx = readProjectFile("client/nginx-main.conf");
  if (!compose.includes('- "80:8080"') ||
      !compose.includes('- "127.0.0.1:8081:8081"') ||
      !compose.includes("http://127.0.0.1:8081/") ||
      !/^\s*listen\s+8080;\s*$/m.test(clientNginx) ||
      !/^\s*listen\s+8081;\s*$/m.test(clientNginx) ||
      !/^EXPOSE\s+8080\s+8081\s*$/m.test(readProjectFile("client/Dockerfile"))) {
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
  return {
    packageCount: 3,
    workflowCount: releaseStaticWorkflowPaths.length,
    dockerfileCount: 2,
  };
}

function assertComposeImages() {
  const source = readProjectFile("docker-compose.yml");
  if (!source.includes('image: "${SERVER_IMAGE_NAME:?SERVER_IMAGE_NAME is required}@sha256:${SERVER_IMAGE_DIGEST:?SERVER_IMAGE_DIGEST is required}"')) {
    fail("COMPOSE_SERVER_IMAGE_CONTRACT_MISSING");
  }
  if (!source.includes('image: "${CLIENT_IMAGE_NAME:?CLIENT_IMAGE_NAME is required}@sha256:${CLIENT_IMAGE_DIGEST:?CLIENT_IMAGE_DIGEST is required}"')) {
    fail("COMPOSE_CLIENT_IMAGE_CONTRACT_MISSING");
  }
  for (const path of [
    "docker-compose.yml",
    "docker-compose.operations.yml",
    "docker-compose.wechat-pay.yml",
  ]) {
    validateComposeBuildPolicy(readProjectFile(path));
  }
  if (/(?:latest|:-local|:-2-(?:server|client))/i.test(source)) {
    fail("COMPOSE_PRODUCTION_IMAGE_FALLBACK_FORBIDDEN");
  }

  const imageValues = [...source.matchAll(/^\s+image:\s*["']?([^"'\r\n]+)["']?\s*$/gm)]
    .map((match) => match[1].trim());
  for (const value of imageValues) {
    if (value.startsWith("${SERVER_IMAGE_NAME:?") || value.startsWith("${CLIENT_IMAGE_NAME:?") ||
        value.startsWith("${OPERATIONS_IMAGE_NAME:?")) {
      continue;
    }
    if (!/@sha256:[a-f0-9]{64}$/.test(value)) {
      fail(`COMPOSE_EXTERNAL_IMAGE_NOT_PINNED:${value}`);
    }
  }
  for (const required of [
    "read_only: true",
    "no-new-privileges:true",
    "cap_drop:",
    "BACKUP_RPO_SECONDS is required",
    "BACKUP_RETENTION_DAYS is required",
    "uploads_data:/app/uploads",
    "private_media_data:/app/private-media",
  ]) {
    if (!source.includes(required)) fail(`COMPOSE_PRODUCTION_CONTRACT_MISSING:${required}`);
  }
  if (!/^  backup:\s*\r?\n\s{4}image:\s*"\$\{OPERATIONS_IMAGE_NAME:\?OPERATIONS_IMAGE_NAME is required\}@sha256:\$\{OPERATIONS_IMAGE_DIGEST:\?OPERATIONS_IMAGE_DIGEST is required\}"\s*$/m.test(source)) {
    fail("COMPOSE_BACKUP_IMMUTABLE_OPERATIONS_IMAGE_REQUIRED");
  }
  if (/\.\/server\/scripts\/(?:backup|check-backup-health)\.sh/.test(source)) {
    fail("COMPOSE_HOST_EXECUTABLE_BIND_FORBIDDEN");
  }

  const operations = readProjectFile("docker-compose.operations.yml");
  for (const required of [
    '${OPERATIONS_IMAGE_NAME:?OPERATIONS_IMAGE_NAME is required}@sha256:${OPERATIONS_IMAGE_DIGEST:?OPERATIONS_IMAGE_DIGEST is required}',
    'profiles: ["operations"]',
    "RELEASE_PREFLIGHT_DATABASE_URL:-",
    "BOOTSTRAP_DATABASE_URL:-",
    "BOOTSTRAP_ADMIN_TARGET_CLASS:-",
    "BOOTSTRAP_ADMIN_ENVIRONMENT_ID:-",
    "BOOTSTRAP_ADMIN_EXPECTED_DATABASE:-",
    "BOOTSTRAP_ADMIN_APPROVAL_REFERENCE:-",
    '["./node_modules/.bin/prisma", "migrate", "status"]',
    '["node", "dist/cli/release-preflight.js"]',
    '["node", "dist/cli/bootstrap-admin.js"]',
  ]) {
    if (!operations.includes(required)) fail(`OPERATIONS_COMPOSE_CONTRACT_MISSING:${required}`);
  }
  return imageValues;
}

function assertReleaseWorkflow() {
  const path = ".github/workflows/release-images.yml";
  const source = readProjectFile(path);
  let workflow;
  try {
    workflow = parseYaml(source, { json: false });
  } catch {
    fail("RELEASE_WORKFLOW_YAML_INVALID");
  }
  if (!isRecord(workflow) || !isRecord(workflow.jobs)) fail("RELEASE_WORKFLOW_SCHEMA_INVALID");
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
  if ((source.match(/^\s+push:\s+true\s*$/gm) ?? []).length !== 3) {
    fail("RELEASE_WORKFLOW_PUSH_CONTRACT_INVALID");
  }
  if ((source.match(/^\s+sbom:\s+true\s*$/gm) ?? []).length !== 3 ||
      (source.match(/^\s+provenance:\s+mode=max\s*$/gm) ?? []).length !== 3) {
    fail("RELEASE_WORKFLOW_ATTESTATION_CONTRACT_INVALID");
  }
  for (const component of ["server", "client", "operations"]) {
    if (!source.includes(`tags: \${{ steps.release.outputs.${component}_image }}:\${{ steps.release.outputs.image_tag }}`)) {
      fail(`RELEASE_WORKFLOW_COMMIT_TAG_MISSING:${component}`);
    }
  }
  if (!source.includes('image_tag="sha-${GITHUB_SHA}"') ||
      !source.includes('image_tag="preproduction-sha-${GITHUB_SHA}"')) {
    fail("RELEASE_WORKFLOW_COMMIT_TAG_MISSING");
  }
  if (!/^permissions:\s*\{\}\s*$/m.test(source) ||
      !/^\s{6}actions:\s*read\s*$/m.test(source)) {
    fail("RELEASE_WORKFLOW_ACTIONS_READ_PERMISSION_MISSING");
  }
  if (!/^\s{6}id-token:\s*write\s*$/m.test(source) ||
      !/^\s{6}packages:\s*write\s*$/m.test(source) ||
      /^\s+attestations:\s*/m.test(source)) {
    fail("RELEASE_WORKFLOW_SIGSTORE_PERMISSION_POLICY_INVALID");
  }
  const buildJob = workflow.jobs["build-push"];
  const signingJob = workflow.jobs["sign-release"];
  if (!isRecord(buildJob) || !isRecord(signingJob) ||
      !isRecord(buildJob.permissions) || !isRecord(signingJob.permissions)) {
    fail("RELEASE_WORKFLOW_SIGNING_JOB_ISOLATION_MISSING");
  }
  if (Object.hasOwn(buildJob.permissions, "id-token") ||
      JSON.stringify(Object.keys(buildJob.permissions).sort()) !== JSON.stringify(["actions", "contents", "packages"]) ||
      buildJob.permissions.actions !== "read" || buildJob.permissions.contents !== "read" ||
      buildJob.permissions.packages !== "write") {
    fail("RELEASE_WORKFLOW_BUILD_PERMISSIONS_INVALID");
  }
  if (buildJob.outputs?.release_stage !== "${{ steps.release.outputs.release_stage }}" ||
      buildJob.outputs?.image_tag !== "${{ steps.release.outputs.image_tag }}") {
    fail("RELEASE_WORKFLOW_STAGE_OUTPUTS_INVALID");
  }
  if (JSON.stringify(Object.keys(signingJob.permissions).sort()) !== JSON.stringify(["actions", "id-token", "packages"]) ||
      signingJob.permissions.actions !== "read" || signingJob.permissions["id-token"] !== "write" ||
      signingJob.permissions.packages !== "write") {
    fail("RELEASE_WORKFLOW_SIGNING_PERMISSIONS_INVALID");
  }
  const signingSource = source.slice(source.indexOf("  sign-release:"));
  if (/actions\/checkout@|npm ci|node scripts\/|docker (?:build|run)/.test(signingSource)) {
    fail("RELEASE_WORKFLOW_SIGNING_JOB_EXECUTES_REPOSITORY_CODE");
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
    "schemaVersion: 5",
    "release_stage:",
    "PUBLIC_SEO_SOURCE_STAGE_MISMATCH",
    "qualityGate:",
    "operations_image=ghcr.io/${GITHUB_REPOSITORY,,}${repository_stage_suffix}-operations",
    "target: operations",
    "https://slsa.dev/provenance/v1",
    "https://spdx.dev/Document",
    "sigstore/cosign-installer@6f9f17788090df1f26f669e9d70d6ae9567deba6",
    "cosign-release: v3.1.3",
    "cosign sign --yes",
    "cosign attest --yes",
    "cosign verify-attestation",
    "cosign verify-blob-attestation",
    "--certificate-identity",
    "--certificate-oidc-issuer \"https://token.actions.githubusercontent.com\"",
    "--certificate-github-workflow-sha \"$GITHUB_SHA\"",
    "--certificate-github-workflow-ref \"$GITHUB_REF\"",
    "--type slsaprovenance1",
    "--type spdxjson",
    "--bundle",
    "application/vnd.dev.sigstore.bundle.v0.3+json",
    "artifact-ids: ${{ needs.build-push.outputs.signing_inputs_artifact_id }}",
    "RELEASE_SIGNING_INPUTS_HASH_MISMATCH",
    "RELEASE_MANIFEST_PROVENANCE_CONTENT_INVALID",
    "RELEASE_MANIFEST_PROVENANCE_DEPENDENCIES_INVALID",
    "release-manifest.attestation.json",
    "runtimeExecutables",
    "OPERATIONS_RUNTIME_EXECUTABLE_INVALID",
    "SERVER_RUNTIME_NATIVE_DEPENDENCY_INVALID:sharp",
  ]) {
    if (!source.includes(required)) {
      fail(`RELEASE_WORKFLOW_QUALITY_PROOF_CONTRACT_MISSING:${required}`);
    }
  }
  for (const required of [
    "sigstore_public_log_acknowledged:",
    "SIGSTORE_PUBLIC_LOG_ACKNOWLEDGEMENT_REQUIRED",
    "RELEASE_PROVENANCE_SOURCE_BINDING_INVALID",
    "sign_image server \"$SERVER_REFERENCE\"",
    "sign_image client \"$CLIENT_REFERENCE\"",
    "sign_image operations \"$OPERATIONS_REFERENCE\"",
    '--bundle "release-output/attestations/${component}-image.sigstore.json"',
    '--bundle "release-output/attestations/${component}-provenance.sigstore.json"',
    '--bundle "release-output/attestations/${component}-sbom.sigstore.json"',
  ]) {
    if (!source.includes(required)) fail(`RELEASE_WORKFLOW_SIGSTORE_CONTRACT_MISSING:${required}`);
  }
  if (/actions\/(?:attest|attest-build-provenance)@/.test(source) ||
      /--(?:key|new-bundle-format|insecure-ignore-tlog|insecure-ignore-sct)\b/.test(source) ||
      /--tlog-upload(?:=|\s+)false\b/.test(source)) {
    fail("RELEASE_WORKFLOW_SIGSTORE_FAIL_CLOSED_POLICY_INVALID");
  }
  return path;
}

export function validateProductionEvidenceVerificationWorkflow(source) {
  let workflow;
  try {
    workflow = parseYaml(source, { json: false });
  } catch {
    fail("PRODUCTION_EVIDENCE_WORKFLOW_YAML_INVALID");
  }
  if (!isRecord(workflow) || !isRecord(workflow.permissions) || !isRecord(workflow.jobs)) {
    fail("PRODUCTION_EVIDENCE_WORKFLOW_SCHEMA_INVALID");
  }
  if (Object.keys(workflow.permissions).length !== 0) {
    fail("PRODUCTION_EVIDENCE_WORKFLOW_ROOT_PERMISSIONS_INVALID");
  }
  const verifyJob = workflow.jobs.verify;
  if (!isRecord(verifyJob) || !isRecord(verifyJob.permissions)) {
    fail("PRODUCTION_EVIDENCE_WORKFLOW_JOB_PERMISSIONS_MISSING");
  }
  const expectedPermissions = ["actions", "contents", "packages"];
  const actualPermissions = Object.keys(verifyJob.permissions).sort();
  if (JSON.stringify(actualPermissions) !== JSON.stringify(expectedPermissions) ||
      expectedPermissions.some((name) => verifyJob.permissions[name] !== "read")) {
    fail("PRODUCTION_EVIDENCE_WORKFLOW_PERMISSIONS_INVALID");
  }
  const header = source.split(/^jobs:/m, 1)[0];
  if (!/^on:\s*\r?\n\s{2}workflow_dispatch:/m.test(header)) {
    fail("PRODUCTION_EVIDENCE_WORKFLOW_NOT_MANUAL_ONLY");
  }
  if (/^\s{2}(push|pull_request|schedule):/m.test(header)) {
    fail("PRODUCTION_EVIDENCE_WORKFLOW_AUTOMATIC_TRIGGER_FORBIDDEN");
  }
  for (const required of [
    "actions: read",
    "contents: read",
    "packages: read",
    "permissions: {}",
    "拒绝未受保护的验证来源",
    "RELEASE_REF_NOT_PROTECTED",
    "actions/download-artifact@",
    "run-id: ${{ inputs.evidence_run_id }}",
    "repository: ${{ github.repository }}",
    "persist-credentials: false",
    "npm ci --ignore-scripts",
    "sigstore/cosign-installer@6f9f17788090df1f26f669e9d70d6ae9567deba6",
    "cosign-release: v3.1.3",
    "docker/login-action@c94ce9fb468520275223c153574b00df6fe4bcc9",
    "node scripts/verify-production-evidence.mjs",
    "--evidence .codex-tmp/production-evidence/production-evidence.json",
    "--evidence-root .codex-tmp/production-evidence",
    "--evidence-bundle .codex-tmp/production-evidence/production-evidence.attestation.json",
    "--environment-id-sha256 \"$ENVIRONMENT_ID_SHA256\"",
    "--approval-reference-sha256 \"$APPROVAL_REFERENCE_SHA256\"",
    "--release-git-sha \"$RELEASE_GIT_SHA\"",
    "--migration-bundle-sha256 \"$MIGRATION_BUNDLE_SHA256\"",
    "--release-source \"$RELEASE_SOURCE\"",
    "--release-profile \"$RELEASE_PROFILE\"",
    "--repo \"$GITHUB_REPOSITORY\"",
    "--source-ref \"$SOURCE_REF\"",
    "--manifest-signer-workflow \"$MANIFEST_SIGNER_WORKFLOW\"",
    "--evidence-signer-workflow \"$EVIDENCE_SIGNER_WORKFLOW\"",
    "EVIDENCE_SIGNER_WORKFLOW: ${{ vars.PRODUCTION_EVIDENCE_SIGNER_WORKFLOW }}",
    "PRODUCTION_EVIDENCE_SIGNER_WORKFLOW_NOT_CONFIGURED",
    "PRODUCTION_EVIDENCE_VERIFIED",
  ]) {
    if (!source.includes(required)) {
      fail(`PRODUCTION_EVIDENCE_WORKFLOW_CONTRACT_MISSING:${required}`);
    }
  }
  if (/actions\/(?:attest|attest-build-provenance)@/.test(source)) {
    fail("PRODUCTION_EVIDENCE_WORKFLOW_MUST_NOT_SIGN_EVIDENCE");
  }
  if (/^\s+attestations:\s*/m.test(source) || /\bGH_TOKEN\s*:/.test(source)) {
    fail("PRODUCTION_EVIDENCE_WORKFLOW_LEGACY_ATTESTATION_PERMISSION_FORBIDDEN");
  }
  if (/inputs\.evidence_signer_workflow/.test(source)) {
    fail("PRODUCTION_EVIDENCE_WORKFLOW_SIGNER_INPUT_FORBIDDEN");
  }
  return { ok: true };
}

function assertProductionEvidenceVerificationWorkflow() {
  const path = ".github/workflows/verify-production-evidence.yml";
  validateProductionEvidenceVerificationWorkflow(readProjectFile(path));
  return path;
}

function assertWorkflowActionsPinned() {
  let actionCount = 0;
  for (const path of releaseStaticWorkflowPaths) {
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
  return { workflowCount: releaseStaticWorkflowPaths.length, actionCount };
}

function assertReleaseSupplyChainTests() {
  const manifest = JSON.parse(readProjectFile("package.json"));
  const rootTest = manifest?.scripts?.test;
  const releaseTest = manifest?.scripts?.["test:release-supply-chain"];
  if (typeof rootTest !== "string" ||
      !rootTest.includes("npm run test:release-supply-chain")) {
    fail("RELEASE_SUPPLY_CHAIN_TEST_NOT_IN_QUALITY_SUITE");
  }
  if (releaseTest !== "node --test scripts/release-profile-contract.spec.mjs scripts/verify-migration-integrity.spec.mjs scripts/verify-release-images.spec.mjs scripts/verify-production-evidence.spec.mjs scripts/production-evidence-collector.spec.mjs") {
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

function assertReverseProxyStaticLimitations() {
  const source = readProjectFile("scripts/verify-reverse-proxy-security.mjs");
  const limitations = [
    "TARGET_EDGE_CANONICAL_HOST_ALLOWLIST_UNVERIFIED",
    "TARGET_EDGE_REAL_IP_TRUST_BOUNDARY_UNVERIFIED",
  ];
  for (const limitation of limitations) {
    if (!source.includes(limitation)) {
      fail(`REVERSE_PROXY_STATIC_LIMITATION_MISSING:${limitation}`);
    }
  }
  if (!source.includes('productionReady: false')) {
    fail("REVERSE_PROXY_STATIC_SCOPE_OVERCLAIMS_PRODUCTION");
  }
  return limitations;
}

function verifyStaticContract() {
  const serverBases = assertPinnedDockerfile("server/Dockerfile", "server");
  const clientBases = assertPinnedDockerfile("client/Dockerfile", "client");
  const operationsStage = assertOperationsDockerStage();
  const runtimeBaseline = assertNodeAndClientRuntimeBaseline();
  const composeImages = assertComposeImages();
  const workflow = assertReleaseWorkflow();
  const productionEvidenceWorkflow = assertProductionEvidenceVerificationWorkflow();
  const workflowActions = assertWorkflowActionsPinned();
  const supplyChainTests = assertReleaseSupplyChainTests();
  const runtimeInspectionFieldCount = assertSafeRuntimeInspection();
  const reverseProxyStaticLimitations = assertReverseProxyStaticLimitations();
  return {
    ok: true,
    mode: "static",
    dockerfileBaseCount: serverBases.length + clientBases.length,
    operationsStage,
    runtimeBaseline,
    composeImageCount: composeImages.length,
    workflow,
    productionEvidenceWorkflow,
    workflowCount: workflowActions.workflowCount,
    workflowActionCount: workflowActions.actionCount,
    supplyChainTests,
    runtimeInspectionFieldCount,
    reverseProxyStaticLimitations,
  };
}

function validateImageEntry(name, entry) {
  if (!entry || typeof entry !== "object") fail(`RELEASE_MANIFEST_${name.toUpperCase()}_MISSING`);
  const requiredKeys = [
    "image", "digest", "reference", "signatureBundle", "provenanceBundle", "sbomBundle",
    "provenancePredicateType", "sbomPredicateType",
  ];
  if (name === "operations") requiredKeys.push("runtimeExecutables");
  if (!hasExactKeys(entry, requiredKeys)) fail(`RELEASE_MANIFEST_${name.toUpperCase()}_SCHEMA_INVALID`);
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
  if (entry.provenancePredicateType !== "https://slsa.dev/provenance/v1") {
    fail(`RELEASE_MANIFEST_${name.toUpperCase()}_PROVENANCE_POLICY_INVALID`);
  }
  if (entry.sbomPredicateType !== "https://spdx.dev/Document") {
    fail(`RELEASE_MANIFEST_${name.toUpperCase()}_SBOM_POLICY_INVALID`);
  }
  for (const [kind, expectedPath] of [
    ["signature", `attestations/${name}-image.sigstore.json`],
    ["provenance", `attestations/${name}-provenance.sigstore.json`],
    ["sbom", `attestations/${name}-sbom.sigstore.json`],
  ]) {
    const descriptor = entry[`${kind}Bundle`];
    if (!hasExactKeys(descriptor, ["path", "sha256"]) ||
        descriptor.path !== expectedPath ||
        !/^[a-f0-9]{64}$/.test(descriptor.sha256 ?? "")) {
      fail(`RELEASE_MANIFEST_${name.toUpperCase()}_${kind.toUpperCase()}_BUNDLE_INVALID`);
    }
  }
}

export function validateReleaseManifest(manifest, expected) {
  if (manifest?.schemaVersion !== 5) fail("RELEASE_MANIFEST_SCHEMA_INVALID");
  if (manifest.releaseStage !== "preproduction" && manifest.releaseStage !== "production") {
    fail("RELEASE_MANIFEST_STAGE_INVALID");
  }
  if (!gitShaPattern.test(manifest.gitSha ?? "")) fail("RELEASE_MANIFEST_GIT_SHA_INVALID");
  if (manifest.gitSha !== expected.gitSha) fail("RELEASE_MANIFEST_GIT_SHA_MISMATCH");
  const expectedImageTag = manifest.releaseStage === "production"
    ? `sha-${manifest.gitSha}`
    : `preproduction-sha-${manifest.gitSha}`;
  if (manifest.imageTag !== expectedImageTag) fail("RELEASE_MANIFEST_IMAGE_TAG_INVALID");
  if (expected.releaseStage && manifest.releaseStage !== expected.releaseStage) {
    fail("RELEASE_MANIFEST_STAGE_MISMATCH");
  }
  if (!/^[a-f0-9]{64}$/.test(manifest.migrationBundleSha256 ?? "")) {
    fail("RELEASE_MANIFEST_MIGRATION_BUNDLE_INVALID");
  }
  if (manifest.migrationBundleSha256 !== expected.migrationBundleSha256) {
    fail("RELEASE_MANIFEST_MIGRATION_BUNDLE_MISMATCH");
  }
  if (typeof manifest.source !== "string" || !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(manifest.source)) {
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
  const policy = manifest.attestationPolicy;
  if (!policy || typeof policy !== "object") fail("RELEASE_MANIFEST_ATTESTATION_POLICY_MISSING");
  if (!hasExactKeys(policy, [
    "signingSystem", "cosignVersion", "bundleMediaType", "signerWorkflow", "signerIdentity",
    "certificateOidcIssuer", "sourceRef", "sourceDigest", "imageSignaturesVerified",
    "imageAttestationsVerified", "provenancePredicateType", "sbomPredicateType",
    "manifestPredicateType",
  ])) fail("RELEASE_MANIFEST_ATTESTATION_POLICY_SCHEMA_INVALID");
  const sourceUrl = new URL(manifest.source);
  const repositoryPath = sourceUrl.pathname.replace(/^\/+|\/+$/g, "").toLowerCase();
  const expectedSigner = `github.com/${repositoryPath}/.github/workflows/release-images.yml`;
  if (policy.signerWorkflow?.toLowerCase() !== expectedSigner) {
    fail("RELEASE_MANIFEST_SIGNER_WORKFLOW_INVALID");
  }
  if (!/^refs\/(?:heads|tags)\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(policy.sourceRef ?? "") ||
      policy.sourceRef.includes("..") || policy.sourceRef.includes("//")) {
    fail("RELEASE_MANIFEST_SOURCE_REF_INVALID");
  }
  if (policy.signerIdentity?.toLowerCase() !== `https://${expectedSigner}@${policy.sourceRef}`) {
    fail("RELEASE_MANIFEST_SIGNER_IDENTITY_INVALID");
  }
  if (policy.sourceDigest !== manifest.gitSha) fail("RELEASE_MANIFEST_ATTESTATION_SHA_MISMATCH");
  if (policy.signingSystem !== "sigstore-cosign-keyless" ||
      policy.cosignVersion !== "v3.1.3" ||
      policy.bundleMediaType !== "application/vnd.dev.sigstore.bundle.v0.3+json" ||
      policy.certificateOidcIssuer !== "https://token.actions.githubusercontent.com" ||
      policy.imageSignaturesVerified !== true ||
      policy.imageAttestationsVerified !== true ||
      policy.provenancePredicateType !== "https://slsa.dev/provenance/v1" ||
      policy.sbomPredicateType !== "https://spdx.dev/Document" ||
      policy.manifestPredicateType !== "https://slsa.dev/provenance/v1") {
    fail("RELEASE_MANIFEST_ATTESTATION_POLICY_INVALID");
  }
  const publicSeo = manifest.publicSeo;
  if (!hasExactKeys(publicSeo, [
    "sourceStage",
    "snapshotHash",
    "prerenderManifestSha256",
    "sourceArtifactId",
    "sourceArtifactDigest",
  ])) {
    fail("RELEASE_MANIFEST_PUBLIC_SEO_SCHEMA_INVALID");
  }
  if (publicSeo.sourceStage !== manifest.releaseStage ||
      !/^[a-f0-9]{64}$/.test(publicSeo.snapshotHash) ||
      !/^[a-f0-9]{64}$/.test(publicSeo.prerenderManifestSha256) ||
      !Number.isSafeInteger(publicSeo.sourceArtifactId) ||
      publicSeo.sourceArtifactId <= 0 ||
      !digestPattern.test(publicSeo.sourceArtifactDigest)) {
    fail("RELEASE_MANIFEST_PUBLIC_SEO_INVALID");
  }
  validateImageEntry("server", manifest.server);
  validateImageEntry("client", manifest.client);
  validateImageEntry("operations", manifest.operations);
  if (!Array.isArray(manifest.operations.runtimeExecutables) ||
      manifest.operations.runtimeExecutables.length !== operationsRuntimeExecutables.length ||
      manifest.operations.runtimeExecutables.some(
        (path, index) => path !== operationsRuntimeExecutables[index],
      )) {
    fail("RELEASE_MANIFEST_OPERATIONS_EXECUTABLES_INVALID");
  }
  for (const component of ["server", "client", "operations"]) {
    const stageSuffix = manifest.releaseStage === "production" ? "" : "-preproduction";
    if (manifest[component].image !== `ghcr.io/${repositoryPath}${stageSuffix}-${component}`) {
      fail(`RELEASE_MANIFEST_${component.toUpperCase()}_REPOSITORY_INVALID`);
    }
  }
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
    releaseStage: "production",
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
  const serverImage = imageReferenceFromEnvironment(process.env, "server");
  const clientImage = imageReferenceFromEnvironment(process.env, "client");
  const operationsImage = imageReferenceFromEnvironment(process.env, "operations");
  const gitSha = process.env.RELEASE_GIT_SHA;
  const source = process.env.RELEASE_SOURCE;
  const migrationBundleSha256 = process.env.MIGRATION_BUNDLE_SHA256;
  if (!serverImage || !clientImage || !operationsImage || !source || !gitSha || !migrationBundleSha256) {
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
  verifyRuntimeImage("operations", operationsImage, gitSha, migrationBundleSha256);
  return { ok: true, mode: "runtime", gitSha, migrationBundleSha256 };
}

function imageReferenceFromEnvironment(env, component) {
  const prefix = component.toUpperCase();
  const name = env[`${prefix}_IMAGE_NAME`];
  const digest = env[`${prefix}_IMAGE_DIGEST`];
  if (!imageNamePattern.test(name ?? "") || !/^[a-f0-9]{64}$/.test(digest ?? "")) fail(`ENV_${prefix}_IMAGE_NOT_DIGEST_PINNED`);
  return `${name}@sha256:${digest}`;
}

export function validateReleaseEnvironment(env, manifest) {
  for (const component of ["server", "client", "operations"]) {
    const reference = imageReferenceFromEnvironment(env, component);
    if (reference !== manifest[component].reference) fail(`ENV_${component.toUpperCase()}_IMAGE_MANIFEST_MISMATCH`);
  }
  for (const [key, expected] of [["RELEASE_GIT_SHA", manifest.gitSha], ["RELEASE_SOURCE", manifest.source], ["MIGRATION_BUNDLE_SHA256", manifest.migrationBundleSha256]]) {
    if (env[key] !== expected) fail(`ENV_${key}_MANIFEST_MISMATCH`);
  }
  for (const key of ["BACKUP_INTERVAL_SECONDS", "BACKUP_RPO_SECONDS", "RESTORE_RTO_SECONDS", "BACKUP_RETENTION_DAYS", "BACKUP_DB_READY_TIMEOUT_SECONDS"]) {
    if (!/^[1-9][0-9]{0,8}$/.test(env[key] ?? "")) fail(`ENV_${key}_INVALID`);
  }
  if (Number(env.BACKUP_INTERVAL_SECONDS) > Number(env.BACKUP_RPO_SECONDS)) fail("ENV_BACKUP_RPO_UNACHIEVABLE");
  const volumeNames = ["MYSQL_VOLUME_NAME", "UPLOADS_VOLUME_NAME", "PRIVATE_MEDIA_VOLUME_NAME"].map((key) => {
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]+$/.test(env[key] ?? "")) fail(`ENV_${key}_INVALID`);
    return env[key];
  });
  if (new Set(volumeNames).size !== 3) fail("ENV_VOLUME_IDENTITIES_MUST_BE_DISTINCT");
  if (!/^(?:\/(?!\/)|[A-Za-z]:[\\/])/.test(env.BACKUP_HOST_DIR ?? "") || /^[A-Za-z]?:?[\\/]$/.test(env.BACKUP_HOST_DIR)) {
    fail("ENV_BACKUP_HOST_DIR_NOT_ABSOLUTE_OR_TOO_BROAD");
  }
  return { ok: true, mode: "environment", gitSha: manifest.gitSha, migrationBundleSha256: manifest.migrationBundleSha256 };
}

export function runContentReadinessMode(args, root = projectRoot) {
  const evidence = collectContentReadiness(root);
  const outputIndex = args.indexOf("--output");
  if (outputIndex >= 0 && !args[outputIndex + 1]) fail("CONTENT_READINESS_OUTPUT_REQUIRED");
  const outputPath = resolve(
    root,
    outputIndex >= 0
      ? args[outputIndex + 1]
      : "artifacts/content-readiness/current.json",
  );
  let output = relative(root, outputPath).split("\\").join("/");
  if (args.includes("--write")) {
    output = writeContentReadinessEvidence(evidence, outputPath, root);
  }
  if (args.includes("--check")) verifyContentReadinessArtifact(evidence, outputPath);
  return {
    ok: evidence.ready,
    mode: "content-readiness",
    status: evidence.status,
    enforced: args.includes("--enforce"),
    output,
    summary: evidence.summary,
    blockers: evidence.blockers,
  };
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--content-readiness")) return runContentReadinessMode(args);
  if (args.includes("--static")) return verifyStaticContract();
  const manifestIndex = args.indexOf("--manifest");
  if (manifestIndex >= 0) {
    const path = args[manifestIndex + 1];
    if (!path) fail("RELEASE_MANIFEST_PATH_REQUIRED");
    const manifest = readAndValidateManifest(path);
    if (args.includes("--environment")) return validateReleaseEnvironment(process.env, manifest);
    return {
      ok: true,
      mode: "manifest",
      gitSha: manifest.gitSha,
      migrationBundleSha256: manifest.migrationBundleSha256,
      serverReference: manifest.server.reference,
      clientReference: manifest.client.reference,
      operationsReference: manifest.operations.reference,
    };
  }
  if (args.includes("--runtime")) return verifyRuntimeContract();
  fail("VERIFY_RELEASE_IMAGES_MODE_REQUIRED");
}

const isDirectExecution = process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isDirectExecution) {
  try {
    const result = main();
    console.log(JSON.stringify(result, null, 2));
    if (result?.enforced && result?.status === "BLOCKED") process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      code: error instanceof Error ? error.message : "RELEASE_IMAGE_VERIFICATION_FAILED",
    }));
    process.exitCode = 1;
  }
}
