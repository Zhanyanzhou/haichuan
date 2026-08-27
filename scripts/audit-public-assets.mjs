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
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = resolve(projectRoot, "client/public");
const defaultOutput = "artifacts/public-asset-audit/current.json";
const mediaExtensions = new Set([
  ".avif",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".mov",
  ".mp3",
  ".mp4",
  ".ogg",
  ".pdf",
  ".png",
  ".svg",
  ".wav",
  ".webm",
  ".webp",
]);
const textExtensions = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".mjs",
  ".scss",
  ".ts",
  ".tsx",
]);
const knownNonAssetSentinels = new Map([
  [
    "/images/brand-logo.svg",
    "LEGACY_PLACEHOLDER_VALUE_REJECTED_BY_CLIENT_AND_SERVER_SETTINGS_NORMALIZATION",
  ],
]);

function fail(code) {
  throw new Error(code);
}

function normalizePath(path) {
  return path.split(sep).join("/");
}

function projectRelative(path) {
  const value = normalizePath(relative(projectRoot, resolve(projectRoot, path)));
  if (!value || value === "." || value.startsWith("../")) {
    fail(`PATH_OUTSIDE_PROJECT:${path}`);
  }
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function walk(path) {
  if (!existsSync(path)) return [];
  const stat = lstatSync(path);
  if (!stat.isDirectory()) return [path];
  const entries = [];
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const absolutePath = resolve(path, entry.name);
    if (entry.isDirectory()) entries.push(...walk(absolutePath));
    else entries.push(absolutePath);
  }
  return entries;
}

function fileContent(path) {
  const stat = lstatSync(path);
  return stat.isSymbolicLink()
    ? Buffer.from(`SYMLINK:${readlinkSync(path)}`)
    : readFileSync(path);
}

function isTestSource(path) {
  const normalized = normalizePath(path);
  return (
    normalized.includes("/client/tests/") ||
    /\.(?:spec|test)\.[cm]?[jt]sx?$/.test(normalized)
  );
}

function collectTextSources() {
  const roots = [
    "client/src",
    "server/src",
    "contracts",
    "client/index.html",
    "client/vite.config.ts",
  ];
  const testRoots = ["client/tests"];
  const candidates = [
    ...roots.flatMap((path) => walk(resolve(projectRoot, path))),
    ...testRoots.flatMap((path) => walk(resolve(projectRoot, path))),
  ];
  const unique = [...new Set(candidates)]
    .filter((path) => textExtensions.has(extname(path).toLowerCase()))
    .sort((left, right) => projectRelative(left).localeCompare(projectRelative(right)));

  return unique.map((path) => ({
    path: projectRelative(path),
    content: readFileSync(path, "utf8"),
    test: isTestSource(path),
  }));
}

function findReferences(content, needle) {
  const references = [];
  let offset = 0;
  while (offset < content.length) {
    const index = content.indexOf(needle, offset);
    if (index < 0) break;
    const line = content.slice(0, index).split("\n").length;
    references.push(line);
    offset = index + needle.length;
  }
  return references;
}

function collectLiteralReferences(sources) {
  const literalPattern = /\/(?:images|fonts|videos|audio)\/[^\s"'`)<>{}?#]+\.(?:avif|gif|ico|jpe?g|mov|mp3|mp4|ogg|pdf|png|svg|wav|webm|webp)|\/(?:favicon\.svg|robots\.txt|sitemap\.xml)/giu;
  const references = new Map();
  for (const source of sources.filter((entry) => !entry.test)) {
    for (const match of source.content.matchAll(literalPattern)) {
      const literal = match[0].replaceAll("\\", "/");
      const line = source.content.slice(0, match.index).split("\n").length;
      const rows = references.get(literal) ?? [];
      rows.push({ file: source.path, line });
      references.set(literal, rows);
    }
  }
  return references;
}

function summarizeExtensions(files) {
  const extensions = new Map();
  for (const file of files) {
    const key = file.extension || "(none)";
    const current = extensions.get(key) ?? { files: 0, bytes: 0 };
    current.files += 1;
    current.bytes += file.bytes;
    extensions.set(key, current);
  }
  return Object.fromEntries(
    [...extensions.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function collectAudit() {
  if (!existsSync(publicRoot)) fail("PUBLIC_DIRECTORY_MISSING");
  const sources = collectTextSources();
  const literalReferences = collectLiteralReferences(sources);
  const files = walk(publicRoot)
    .sort((left, right) => normalizePath(relative(publicRoot, left)).localeCompare(
      normalizePath(relative(publicRoot, right)),
    ))
    .map((path) => {
      const relativePath = normalizePath(relative(publicRoot, path));
      const publicUrl = `/${relativePath}`;
      const content = fileContent(path);
      const runtimeReferences = [];
      const testReferences = [];
      for (const source of sources) {
        const lines = findReferences(source.content, publicUrl);
        for (const line of lines) {
          (source.test ? testReferences : runtimeReferences).push({
            file: source.path,
            line,
          });
        }
      }
      const extension = extname(relativePath).toLowerCase();
      return {
        path: relativePath,
        publicUrl,
        extension,
        bytes: content.length,
        sha256: sha256(content),
        media: mediaExtensions.has(extension),
        staticReferenceClassification:
          runtimeReferences.length > 0
            ? "STATIC_RUNTIME_REFERENCED"
            : testReferences.length > 0
              ? "TEST_ONLY_REFERENCE"
              : "NO_STATIC_REFERENCE",
        runtimeReferences,
        testReferences,
        rightsStatus: mediaExtensions.has(extension)
          ? "UNKNOWN_OWNER_EVIDENCE_REQUIRED"
          : "NOT_ASSESSED",
      };
    });

  const byHash = new Map();
  for (const file of files) {
    const rows = byHash.get(file.sha256) ?? [];
    rows.push(file.path);
    byHash.set(file.sha256, rows);
  }
  const exactDuplicateGroups = [...byHash.entries()]
    .filter(([, paths]) => paths.length > 1)
    .map(([hash, paths]) => ({ sha256: hash, files: paths.sort() }))
    .sort((left, right) => left.files[0].localeCompare(right.files[0]));

  const publicUrls = new Set(files.map((file) => file.publicUrl));
  const unresolvedStaticLiterals = [...literalReferences.entries()]
    .filter(([literal]) => !publicUrls.has(literal))
    .map(([literal, references]) => ({ literal, references }))
    .sort((left, right) => left.literal.localeCompare(right.literal));
  const knownSentinelLiterals = unresolvedStaticLiterals
    .filter(({ literal }) => knownNonAssetSentinels.has(literal))
    .map((entry) => ({
      ...entry,
      reason: knownNonAssetSentinels.get(entry.literal),
    }));
  const missingStaticLiterals = unresolvedStaticLiterals.filter(
    ({ literal }) => !knownNonAssetSentinels.has(literal),
  );
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  const mediaFiles = files.filter((file) => file.media);
  const exactDuplicateFiles = exactDuplicateGroups.reduce(
    (sum, group) => sum + group.files.length,
    0,
  );

  return {
    schemaVersion: 1,
    evidenceKind: "LOCAL_PUBLIC_ASSET_REFERENCE_AUDIT",
    generatedAt: new Date().toISOString(),
    deletionsAuthorized: false,
    rightsVerified: false,
    summary: {
      files: files.length,
      bytes: totalBytes,
      mediaFiles: mediaFiles.length,
      mediaBytes: mediaFiles.reduce((sum, file) => sum + file.bytes, 0),
      filesOverOneMiB: files.filter((file) => file.bytes > 1024 * 1024).length,
      staticRuntimeReferencedFiles: files.filter(
        (file) => file.runtimeReferences.length > 0,
      ).length,
      testOnlyReferencedFiles: files.filter(
        (file) =>
          file.runtimeReferences.length === 0 && file.testReferences.length > 0,
      ).length,
      noStaticReferenceFiles: files.filter(
        (file) =>
          file.runtimeReferences.length === 0 && file.testReferences.length === 0,
      ).length,
      exactDuplicateGroups: exactDuplicateGroups.length,
      exactDuplicateFiles,
      missingStaticLiterals: missingStaticLiterals.length,
    },
    byExtension: summarizeExtensions(files),
    largest: [...files]
      .sort((left, right) => right.bytes - left.bytes)
      .slice(0, 20)
      .map(({ path, bytes, sha256, staticReferenceClassification }) => ({
        path,
        bytes,
        sha256,
        staticReferenceClassification,
      })),
    exactDuplicateGroups,
    knownSentinelLiterals,
    missingStaticLiterals,
    files,
    limitations: [
      "ZERO_STATIC_REFERENCE_DOES_NOT_PROVE_UNUSED_OR_AUTHORIZE_DELETION",
      "DATABASE_CMS_UPLOAD_AND_RUNTIME_GENERATED_REFERENCES_NOT_INSPECTED",
      "RIGHTS_LICENSE_PROVENANCE_AND_OWNER_APPROVAL_REMAIN_UNKNOWN",
      "DUPLICATE_GROUPS_ONLY_PROVE_BYTE_IDENTICAL_CONTENT_NOT_VISUAL_SIMILARITY",
      "LOCAL_WORKTREE_EVIDENCE_DOES_NOT_PROVE_TARGET_ENVIRONMENT_USAGE",
    ],
  };
}

function stableAudit(audit) {
  const clone = structuredClone(audit);
  delete clone.generatedAt;
  return clone;
}

function outputPathFromArguments(argumentsList) {
  const positional = argumentsList.find((argument) => !argument.startsWith("--"));
  return resolve(projectRoot, positional ?? defaultOutput);
}

const argumentsList = process.argv.slice(2);
const check = argumentsList.includes("--check");
const verify = argumentsList.includes("--verify");
if (check && verify) fail("AUDIT_MODE_CONFLICT");
const outputPath = outputPathFromArguments(argumentsList);
projectRelative(outputPath);
const audit = collectAudit();

if (check) {
  if (!existsSync(outputPath)) fail(`AUDIT_OUTPUT_MISSING:${projectRelative(outputPath)}`);
  const existing = JSON.parse(readFileSync(outputPath, "utf8"));
  if (JSON.stringify(stableAudit(existing)) !== JSON.stringify(stableAudit(audit))) {
    fail(`PUBLIC_ASSET_AUDIT_STALE:${projectRelative(outputPath)}`);
  }
  if (audit.missingStaticLiterals.length > 0) {
    fail(`UNRESOLVED_PUBLIC_ASSET_LITERALS:${audit.missingStaticLiterals.length}`);
  }
} else if (!verify) {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
}
if ((check || verify) && audit.missingStaticLiterals.length > 0) {
  fail(`UNRESOLVED_PUBLIC_ASSET_LITERALS:${audit.missingStaticLiterals.length}`);
}

console.log(JSON.stringify({
  ok: true,
  mode: check ? "check" : verify ? "verify" : "write",
  output: projectRelative(outputPath),
  summary: audit.summary,
  limitations: audit.limitations,
}, null, 2));
