import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultOutput = "artifacts/candidate-evidence/current.json";

function fail(code) {
  throw new Error(code);
}

function normalizePath(path) {
  return path.split(sep).join("/");
}

function compareStable(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function projectRelative(path) {
  const value = normalizePath(relative(projectRoot, resolve(projectRoot, path)));
  if (!value || value === "." || value.startsWith("../")) {
    fail(`PATH_OUTSIDE_PROJECT:${path}`);
  }
  return value;
}

function run(command, args) {
  return execFileSync(command, args, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 32 * 1024 * 1024,
  }).trim();
}

function runNullSeparated(command, args) {
  const output = execFileSync(command, args, {
    cwd: projectRoot,
    encoding: "buffer",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 32 * 1024 * 1024,
  });
  return output
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map(normalizePath);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hashFile(path) {
  if (!existsSync(path)) fail(`REQUIRED_FILE_MISSING:${projectRelative(path)}`);
  return sha256(readFileSync(path));
}

function hashTree(path) {
  const root = resolve(projectRoot, path);
  if (!existsSync(root)) fail(`BUILD_OUTPUT_MISSING:${projectRelative(root)}`);
  const entries = [];

  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else {
        entries.push(absolutePath);
      }
    }
  }

  visit(root);
  entries.sort((left, right) =>
    compareStable(
      normalizePath(relative(root, left)),
      normalizePath(relative(root, right)),
    ),
  );

  const treeHash = createHash("sha256");
  let bytes = 0;
  for (const absolutePath of entries) {
    const relativePath = normalizePath(relative(root, absolutePath));
    const stat = lstatSync(absolutePath);
    const content = stat.isSymbolicLink()
      ? Buffer.from(`SYMLINK:${readlinkSync(absolutePath)}`)
      : readFileSync(absolutePath);
    bytes += content.length;
    treeHash.update(relativePath);
    treeHash.update("\0");
    treeHash.update(sha256(content));
    treeHash.update("\0");
  }

  return {
    sha256: treeHash.digest("hex"),
    files: entries.length,
    bytes,
  };
}

function hashClientBuildGraph() {
  const root = resolve(projectRoot, "client/dist");
  const assetsRoot = resolve(root, "assets");
  const indexPath = resolve(root, "index.html");
  if (!existsSync(indexPath) || !existsSync(assetsRoot)) {
    fail("CLIENT_BUILD_OUTPUT_MISSING");
  }

  const assetPaths = [];
  function visitAssets(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = resolve(directory, entry.name);
      if (entry.isDirectory()) visitAssets(absolutePath);
      else assetPaths.push(absolutePath);
    }
  }
  visitAssets(assetsRoot);

  const assetsByName = new Map();
  for (const absolutePath of assetPaths) {
    const name = normalizePath(relative(assetsRoot, absolutePath));
    const basename = name.split("/").at(-1);
    if (!basename || assetsByName.has(basename)) {
      fail(`CLIENT_BUILD_ASSET_BASENAME_COLLISION:${basename ?? "(empty)"}`);
    }
    assetsByName.set(basename, absolutePath);
  }

  const referencePattern = /(?:\.\/|\/assets\/|assets\/)([A-Za-z0-9_][A-Za-z0-9_.@-]*\.(?:avif|css|gif|ico|jpe?g|js|json|mp4|otf|png|svg|ttf|webm|webp|woff2?))/g;
  const reachableAssets = new Set();
  const pending = [];
  const enqueueReferences = (source, owner) => {
    referencePattern.lastIndex = 0;
    for (const match of source.matchAll(referencePattern)) {
      const name = match[1];
      const absolutePath = assetsByName.get(name);
      if (!absolutePath) fail(`CLIENT_BUILD_REFERENCE_MISSING:${owner}:${name}`);
      if (reachableAssets.has(absolutePath)) continue;
      reachableAssets.add(absolutePath);
      pending.push(absolutePath);
    }
  };

  enqueueReferences(readFileSync(indexPath, "utf8"), "index.html");
  while (pending.length > 0) {
    const absolutePath = pending.pop();
    if (!/\.(?:css|js)$/.test(absolutePath)) continue;
    enqueueReferences(
      readFileSync(absolutePath, "utf8"),
      normalizePath(relative(root, absolutePath)),
    );
  }

  const entries = [indexPath, ...reachableAssets].sort((left, right) =>
    compareStable(
      normalizePath(relative(root, left)),
      normalizePath(relative(root, right)),
    ),
  );
  const graphHash = createHash("sha256");
  let bytes = 0;
  for (const absolutePath of entries) {
    const relativePath = normalizePath(relative(root, absolutePath));
    const content = readFileSync(absolutePath);
    bytes += content.length;
    graphHash.update(relativePath);
    graphHash.update("\0");
    graphHash.update(sha256(content));
    graphHash.update("\0");
  }

  const unreachableGeneratedAssets = assetPaths.filter(
    (absolutePath) => !reachableAssets.has(absolutePath),
  );
  return {
    identityKind: "INDEX_REACHABLE_BUILD_GRAPH",
    sha256: graphHash.digest("hex"),
    files: entries.length,
    bytes,
    unreachableGeneratedAssetFiles: unreachableGeneratedAssets.length,
    unreachableGeneratedAssetBytes: unreachableGeneratedAssets.reduce(
      (total, absolutePath) => total + lstatSync(absolutePath).size,
      0,
    ),
  };
}

function inventoryTree(path) {
  const root = resolve(projectRoot, path);
  if (!existsSync(root)) fail(`REQUIRED_DIRECTORY_MISSING:${projectRelative(root)}`);
  const files = [];

  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(absolutePath);
      else files.push(absolutePath);
    }
  }

  visit(root);
  const byExtension = new Map();
  let totalBytes = 0;
  let assetsOverOneMiB = 0;
  const rows = files.map((absolutePath) => {
    const relativePath = normalizePath(relative(root, absolutePath));
    const bytes = lstatSync(absolutePath).size;
    const lastSegment = relativePath.split("/").at(-1) ?? relativePath;
    const extensionIndex = lastSegment.lastIndexOf(".");
    const extension = extensionIndex >= 0
      ? lastSegment.slice(extensionIndex).toLowerCase()
      : "(none)";
    totalBytes += bytes;
    if (bytes > 1024 * 1024) assetsOverOneMiB += 1;
    const current = byExtension.get(extension) ?? { files: 0, bytes: 0 };
    current.files += 1;
    current.bytes += bytes;
    byExtension.set(extension, current);
    return { path: relativePath, bytes };
  });

  return {
    sha256: hashTree(path).sha256,
    files: files.length,
    bytes: totalBytes,
    assetsOverOneMiB,
    byExtension: Object.fromEntries(
      [...byExtension.entries()].sort(([left], [right]) =>
        compareStable(left, right),
      ),
    ),
    largest: rows
      .sort((left, right) =>
        right.bytes - left.bytes || compareStable(left.path, right.path),
      )
      .slice(0, 15),
  };
}

function collectWorktree(outputPath) {
  // 固定 clean filter 语义，避免同一挂载工作树在 Windows 与 Linux 中
  // 因全局 core.autocrlf 不同而得到不同的修改集合和候选指纹。
  const gitPrefix = ["-c", "core.autocrlf=true"];
  const head = run("git", [...gitPrefix, "rev-parse", "HEAD"]);
  const branch = run("git", [...gitPrefix, "branch", "--show-current"]);
  const excludedOutput = projectRelative(outputPath);
  const tracked = new Set(
    runNullSeparated("git", [
      ...gitPrefix,
      "diff",
      "--name-only",
      "--no-renames",
      "-z",
      "HEAD",
      "--",
    ]).filter((path) => path !== excludedOutput),
  );
  const untracked = new Set(
    runNullSeparated("git", [
      ...gitPrefix,
      "ls-files",
      "--others",
      "--exclude-standard",
      "-z",
    ]).filter((path) => path !== excludedOutput),
  );
  const paths = [...new Set([...tracked, ...untracked])].sort(compareStable);
  const fingerprint = createHash("sha256");
  fingerprint.update(`HEAD:${head}\0`);
  let deleted = 0;
  let bytes = 0;

  for (const path of paths) {
    const absolutePath = resolve(projectRoot, path);
    fingerprint.update(path);
    fingerprint.update("\0");
    if (!existsSync(absolutePath)) {
      deleted += 1;
      fingerprint.update("DELETED\0");
      continue;
    }
    const stat = lstatSync(absolutePath);
    const content = stat.isSymbolicLink()
      ? Buffer.from(`SYMLINK:${readlinkSync(absolutePath)}`)
      : readFileSync(absolutePath);
    bytes += content.length;
    fingerprint.update(sha256(content));
    fingerprint.update("\0");
  }

  return {
    branch,
    head,
    dirty: paths.length > 0,
    fingerprintSha256: fingerprint.digest("hex"),
    changeCounts: {
      tracked: tracked.size,
      untracked: untracked.size,
      deleted,
      total: paths.length,
    },
    changedBytes: bytes,
    excludedGeneratedOutput: excludedOutput,
  };
}

function collectReleaseContract() {
  run(process.execPath, ["--test", "scripts/verify-release-images.spec.mjs"]);
  const result = JSON.parse(
    run(process.execPath, ["scripts/verify-release-images.mjs", "--static"]),
  );
  if (result?.ok !== true || result?.mode !== "static") {
    fail("STATIC_RELEASE_CONTRACT_FAILED");
  }
  return {
    ...result,
    manifestRegressionTests: {
      passed: true,
      path: "scripts/verify-release-images.spec.mjs",
    },
  };
}

function collectRuntime(source, migrationBundleSha256) {
  try {
    const readImageLabel = (imageId, label) => {
      try {
        const value = run("docker", [
          "image",
          "inspect",
          imageId,
          "--format",
          `{{with .Config.Labels}}{{index . "${label}"}}{{end}}`,
        ]);
        return value || null;
      } catch {
        return null;
      }
    };
    const inspectImageId = (imageId) => {
      try {
        return run("docker", [
          "image",
          "inspect",
          imageId,
          "--format",
          "{{.Id}}",
        ]) || null;
      } catch {
        return null;
      }
    };
    const lines = run("docker", ["compose", "ps", "--format", "json"])
      .split(/\r?\n/)
      .filter(Boolean);
    const services = lines
      .map((line) => JSON.parse(line))
      .map((entry) => {
        // 只读取候选身份所需的白名单字段；禁止读取完整容器 JSON，
        // 因为 Config.Env 可能包含数据库口令或第三方凭据。
        const imageId = run("docker", [
          "inspect",
          entry.ID,
          "--format",
          "{{.Image}}",
        ]);
        const configuredImage = run("docker", [
          "inspect",
          entry.ID,
          "--format",
          "{{.Config.Image}}",
        ]);
        const inspectedImageId = inspectImageId(imageId);
        const imageInspectable = inspectedImageId === imageId;
        const revisionLabel = imageInspectable
          ? readImageLabel(imageId, "org.opencontainers.image.revision")
          : null;
        const componentLabel = imageInspectable
          ? readImageLabel(imageId, "io.haichuan.component")
          : null;
        const migrationBundleLabel = imageInspectable
          ? readImageLabel(imageId, "io.haichuan.migration-bundle-sha256")
          : null;
        return {
          service: entry.Service,
          containerId: entry.ID,
          imageId,
          configuredImage,
          imageInspectable,
          state: entry.State,
          health: entry.Health || null,
          candidateLabelsPresent:
            revisionLabel !== null ||
            componentLabel !== null ||
            migrationBundleLabel !== null,
          revisionLabel,
          componentLabel,
          migrationBundleLabel,
        };
      })
      .sort((left, right) => compareStable(left.service, right.service));

    const candidateServices = services.filter((entry) =>
      entry.service === "server" || entry.service === "client",
    );
    const labelsMatch = candidateServices.length === 2 && candidateServices.every(
      (entry) =>
        entry.revisionLabel === source.head &&
        entry.componentLabel === entry.service &&
        entry.migrationBundleLabel === migrationBundleSha256,
    );
    const candidateImagesInspectable =
      candidateServices.length === 2 &&
      candidateServices.every((entry) => entry.imageInspectable);

    return {
      available: true,
      services,
      candidateIdentityVerified: !source.dirty && labelsMatch,
      limitations: [
        ...(source.dirty
          ? ["WORKTREE_DIRTY_CANNOT_MATCH_COMMIT_ONLY_IMAGE"]
          : []),
        ...(candidateImagesInspectable
          ? []
          : ["SERVER_OR_CLIENT_IMAGE_NOT_LOCALLY_INSPECTABLE"]),
        ...(labelsMatch ? [] : ["SERVER_OR_CLIENT_OCI_LABELS_DO_NOT_MATCH_CANDIDATE"]),
      ],
    };
  } catch {
    return {
      available: false,
      services: [],
      candidateIdentityVerified: false,
      limitations: ["DOCKER_RUNTIME_UNAVAILABLE_OR_UNREADABLE"],
    };
  }
}

function collectEvidence(outputPath) {
  const source = collectWorktree(outputPath);
  const publicAssetAuditPath = resolve(
    projectRoot,
    "artifacts/public-asset-audit/current.json",
  );
  const runtimeOwnershipAuditPath = resolve(
    projectRoot,
    "artifacts/runtime-ownership-audit/current.json",
  );
  run(process.execPath, [
    "scripts/audit-public-assets.mjs",
    "--check",
    projectRelative(publicAssetAuditPath),
  ]);
  run(process.execPath, [
    "scripts/audit-runtime-ownership.mjs",
    "--check",
    projectRelative(runtimeOwnershipAuditPath),
  ]);
  const runtimeOwnershipAudit = JSON.parse(
    readFileSync(runtimeOwnershipAuditPath, "utf8"),
  );
  if (runtimeOwnershipAudit?.schemaVersion !== 1) {
    fail("RUNTIME_OWNERSHIP_AUDIT_SCHEMA_INVALID");
  }
  const migrationBundleSha256 = run(process.execPath, [
    "scripts/verify-migration-integrity.mjs",
    "--print-bundle-sha",
  ]);
  const clientBuild = hashClientBuildGraph();
  const serverBuild = hashTree("server/dist");
  const evidence = {
    schemaVersion: 5,
    evidenceKind: "LOCAL_WORKTREE_CANDIDATE",
    generatedAt: new Date().toISOString(),
    releaseEligible: false,
    limitations: [
      "LOCAL_EVIDENCE_ONLY_NOT_A_RELEASE_MANIFEST",
      "DIRTY_WORKTREE_REQUIRES_APPROVED_GIT_FREEZE_BEFORE_RELEASE",
      "BUILD_HASHES_PROVE_ARTIFACT_IDENTITY_NOT_TARGET_ENVIRONMENT_BEHAVIOR",
      ...(clientBuild.unreachableGeneratedAssetFiles > 0
        ? ["CLIENT_DIST_UNREACHABLE_GENERATED_ASSETS_EXCLUDED_FROM_BUILD_IDENTITY"]
        : []),
    ],
    source,
    contracts: {
      contentTemplateContractSha256: hashFile(
        resolve(projectRoot, "contracts/page-builder/content-templates.contract.json"),
      ),
      migrationBundleSha256,
      lockfiles: {
        root: hashFile(resolve(projectRoot, "package-lock.json")),
        client: hashFile(resolve(projectRoot, "client/package-lock.json")),
        server: hashFile(resolve(projectRoot, "server/package-lock.json")),
      },
    },
    build: {
      client: clientBuild,
      server: serverBuild,
    },
    publicAssets: {
      ...inventoryTree("client/public"),
      governanceAudit: {
        path: projectRelative(publicAssetAuditPath),
        sha256: hashFile(publicAssetAuditPath),
      },
    },
    runtimeOwnership: {
      governanceAudit: {
        path: projectRelative(runtimeOwnershipAuditPath),
        sha256: hashFile(runtimeOwnershipAuditPath),
      },
      destructiveActionsAuthorized:
        runtimeOwnershipAudit.destructiveActionsAuthorized === true,
      summary: runtimeOwnershipAudit.summary,
    },
    releaseContract: collectReleaseContract(),
  };
  evidence.runtime = collectRuntime(source, migrationBundleSha256);
  return evidence;
}

function stableEvidence(evidence) {
  const clone = structuredClone(evidence);
  delete clone.generatedAt;
  return clone;
}

function writeEvidence(path) {
  const outputPath = resolve(projectRoot, path);
  projectRelative(outputPath);
  const evidence = collectEvidence(outputPath);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
  return {
    ok: true,
    mode: "generate",
    output: projectRelative(outputPath),
    sourceFingerprintSha256: evidence.source.fingerprintSha256,
    clientBuildSha256: evidence.build.client.sha256,
    serverBuildSha256: evidence.build.server.sha256,
    runtimeCandidateIdentityVerified:
      evidence.runtime.candidateIdentityVerified,
    releaseEligible: evidence.releaseEligible,
  };
}

function checkEvidence(path) {
  const outputPath = resolve(projectRoot, path);
  projectRelative(outputPath);
  if (!existsSync(outputPath)) fail(`EVIDENCE_FILE_MISSING:${path}`);
  const expected = JSON.parse(readFileSync(outputPath, "utf8"));
  if (expected?.schemaVersion !== 5) fail("EVIDENCE_SCHEMA_INVALID");
  const current = collectEvidence(outputPath);
  if (
    JSON.stringify(stableEvidence(expected)) !==
    JSON.stringify(stableEvidence(current))
  ) {
    fail("CANDIDATE_EVIDENCE_DRIFT");
  }
  return {
    ok: true,
    mode: "check",
    evidence: projectRelative(outputPath),
    sourceFingerprintSha256: current.source.fingerprintSha256,
    clientBuildSha256: current.build.client.sha256,
    serverBuildSha256: current.build.server.sha256,
    runtimeCandidateIdentityVerified:
      current.runtime.candidateIdentityVerified,
    releaseEligible: current.releaseEligible,
  };
}

function main() {
  const args = process.argv.slice(2);
  const checkIndex = args.indexOf("--check");
  if (checkIndex >= 0) {
    return checkEvidence(args[checkIndex + 1] || defaultOutput);
  }
  const outputIndex = args.indexOf("--output");
  return writeEvidence(args[outputIndex + 1] || defaultOutput);
}

try {
  console.log(JSON.stringify(main(), null, 2));
} catch (error) {
  console.error(
    JSON.stringify({
      ok: false,
      code:
        error instanceof Error
          ? error.message
          : "CANDIDATE_EVIDENCE_GENERATION_FAILED",
    }),
  );
  process.exitCode = 1;
}
