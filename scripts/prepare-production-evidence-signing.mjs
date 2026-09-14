import { createHash } from "node:crypto";
import {
  constants as fsConstants,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { validateProductionEvidenceStructure } from "./verify-production-evidence.mjs";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sha256Pattern = /^[a-f0-9]{64}$/;
const gitShaPattern = /^[a-f0-9]{40}$/;
const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const sourceRefPattern = /^refs\/(?:heads|tags)\/[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const workflowPattern = /^github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml$/i;
const isoUtcPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const forbiddenEvidencePathPattern = /(?:password|secret|token|credential|private.?key|database.?url|connection.?string|api.?key|auth)/i;
const ownerPattern = /^[^\u0000-\u001f\u007f]{2,120}$/;

function fail(code) {
  throw new Error(code);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function isWithin(parent, child) {
  const childRelative = relative(parent, child);
  return childRelative === "" || (!childRelative.startsWith("..") && !isAbsolute(childRelative));
}

function requirePositiveRunId(value, code) {
  if (!/^[1-9][0-9]*$/.test(value ?? "")) fail(code);
  return value;
}

export function validateTrustedPreparationContext(context) {
  if (!sha256Pattern.test(context.environmentIdSha256 ?? "")) fail("PRODUCTION_EVIDENCE_PREPARE_ENVIRONMENT_INVALID");
  if (!sha256Pattern.test(context.approvalReferenceSha256 ?? "")) fail("PRODUCTION_EVIDENCE_PREPARE_APPROVAL_INVALID");
  if (!gitShaPattern.test(context.releaseGitSha ?? "")) fail("PRODUCTION_EVIDENCE_PREPARE_RELEASE_SHA_INVALID");
  if (!sha256Pattern.test(context.migrationBundleSha256 ?? "")) fail("PRODUCTION_EVIDENCE_PREPARE_MIGRATION_SHA_INVALID");
  if (!repositoryPattern.test(context.repository ?? "")) fail("PRODUCTION_EVIDENCE_PREPARE_REPOSITORY_INVALID");
  if (context.releaseSource?.toLowerCase() !== `https://github.com/${context.repository.toLowerCase()}`) {
    fail("PRODUCTION_EVIDENCE_PREPARE_SOURCE_INVALID");
  }
  if (!sourceRefPattern.test(context.sourceRef ?? "") || context.sourceRef.includes("..") || context.sourceRef.includes("//")) {
    fail("PRODUCTION_EVIDENCE_PREPARE_SOURCE_REF_INVALID");
  }
  if (!workflowPattern.test(context.manifestSignerWorkflow ?? "") || !workflowPattern.test(context.evidenceSignerWorkflow ?? "")) {
    fail("PRODUCTION_EVIDENCE_PREPARE_SIGNER_INVALID");
  }
  const expectedPrefix = `github.com/${context.repository.toLowerCase()}/.github/workflows/`;
  if (!context.manifestSignerWorkflow.toLowerCase().startsWith(expectedPrefix) ||
      !context.evidenceSignerWorkflow.toLowerCase().startsWith(expectedPrefix) ||
      context.manifestSignerWorkflow.toLowerCase() === context.evidenceSignerWorkflow.toLowerCase()) {
    fail("PRODUCTION_EVIDENCE_PREPARE_SIGNER_INVALID");
  }
  requirePositiveRunId(context.releaseRunId, "PRODUCTION_EVIDENCE_PREPARE_RELEASE_RUN_INVALID");
  requirePositiveRunId(context.evidenceRunId, "PRODUCTION_EVIDENCE_PREPARE_EVIDENCE_RUN_INVALID");
  if (!context.releaseProfile || !["lead-generation", "commerce"].includes(context.releaseProfile)) {
    fail("PRODUCTION_EVIDENCE_PREPARE_RELEASE_PROFILE_INVALID");
  }
  for (const owner of ["releaseOwner", "rollbackOwner", "incidentOwner"]) {
    if (!ownerPattern.test(context[owner] ?? "") || context[owner] !== context[owner].trim()) {
      fail(`PRODUCTION_EVIDENCE_PREPARE_${owner.toUpperCase()}_INVALID`);
    }
  }
  return context;
}

function isDescriptor(value) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join("\0") === "path\0sha256" &&
    typeof value.path === "string" && sha256Pattern.test(value.sha256 ?? "");
}

export function collectDescriptorPaths(...values) {
  const descriptors = new Map();
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (isDescriptor(value)) {
      const current = descriptors.get(value.path);
      if (current && current !== value.sha256) fail(`PRODUCTION_EVIDENCE_PREPARE_DESCRIPTOR_CONFLICT:${value.path}`);
      descriptors.set(value.path, value.sha256);
      return;
    }
    for (const child of Array.isArray(value) ? value : Object.values(value)) visit(child);
  };
  for (const value of values) visit(value);
  return [...descriptors.entries()]
    .map(([path, digest]) => ({ path, sha256: digest }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function assertExactKeys(value, allowed, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  const actual = Object.keys(value).sort();
  const expected = [...allowed].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(code);
}

function safeEvidenceRelativePath(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 240 &&
    !isAbsolute(value) && !value.startsWith("/") && !value.startsWith("\\") &&
    !value.includes("\\") && !value.includes("//") && !value.split("/").includes("..") &&
    !/[\u0000-\u001f]/.test(value) && !forbiddenEvidencePathPattern.test(value);
}

function decodeCanonicalBase64(value, code) {
  if (typeof value !== "string" || value.length === 0 || value.length > 3_000_000 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    fail(code);
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) fail(code);
  return bytes;
}

export function materializeCollectorEnvelope({ envelopePath, evidenceRoot, expectedCollectorSha256, context }) {
  validateTrustedPreparationContext(context);
  if (!sha256Pattern.test(expectedCollectorSha256 ?? "")) fail("PRODUCTION_EVIDENCE_COLLECTOR_SHA_INVALID");
  const absoluteEnvelope = resolve(envelopePath);
  const outputRoot = resolve(evidenceRoot);
  if (!isWithin(projectRoot, absoluteEnvelope) || !existsSync(absoluteEnvelope)) fail("PRODUCTION_EVIDENCE_COLLECTOR_ENVELOPE_INVALID");
  const envelopeStat = lstatSync(absoluteEnvelope);
  if (!envelopeStat.isFile() || envelopeStat.isSymbolicLink() || envelopeStat.size > 12 * 1024 * 1024) {
    fail("PRODUCTION_EVIDENCE_COLLECTOR_ENVELOPE_INVALID");
  }
  if (!isWithin(projectRoot, outputRoot)) fail("PRODUCTION_EVIDENCE_COLLECTOR_OUTPUT_INVALID");
  mkdirSync(outputRoot, { recursive: true });
  if (lstatSync(outputRoot).isSymbolicLink() || !lstatSync(outputRoot).isDirectory()) {
    fail("PRODUCTION_EVIDENCE_COLLECTOR_OUTPUT_INVALID");
  }
  let envelope;
  try {
    envelope = JSON.parse(readFileSync(absoluteEnvelope, "utf8"));
  } catch {
    fail("PRODUCTION_EVIDENCE_COLLECTOR_ENVELOPE_INVALID");
  }
  assertExactKeys(envelope, [
    "schemaVersion", "collectorSha256", "environmentIdSha256", "approvalReferenceSha256",
    "releaseGitSha", "migrationBundleSha256", "repository", "sourceRef", "releaseProfile",
    "releaseRunId", "evidenceRunId", "releaseOwner", "rollbackOwner", "incidentOwner",
    "generatedAt", "files",
  ], "PRODUCTION_EVIDENCE_COLLECTOR_ENVELOPE_SCHEMA_INVALID");
  if (envelope.schemaVersion !== 1 || envelope.collectorSha256 !== expectedCollectorSha256 ||
      envelope.environmentIdSha256 !== context.environmentIdSha256 ||
      envelope.approvalReferenceSha256 !== context.approvalReferenceSha256 ||
      envelope.releaseGitSha !== context.releaseGitSha ||
      envelope.migrationBundleSha256 !== context.migrationBundleSha256 ||
      envelope.repository !== context.repository || envelope.sourceRef !== context.sourceRef ||
      envelope.releaseProfile !== context.releaseProfile ||
      String(envelope.releaseRunId) !== context.releaseRunId ||
      String(envelope.evidenceRunId) !== context.evidenceRunId ||
      envelope.releaseOwner !== context.releaseOwner ||
      envelope.rollbackOwner !== context.rollbackOwner ||
      envelope.incidentOwner !== context.incidentOwner) {
    fail("PRODUCTION_EVIDENCE_COLLECTOR_ENVELOPE_BINDING_INVALID");
  }
  if (!isoUtcPattern.test(envelope.generatedAt ?? "") || Number.isNaN(Date.parse(envelope.generatedAt))) {
    fail("PRODUCTION_EVIDENCE_COLLECTOR_ENVELOPE_TIME_INVALID");
  }
  if (!Array.isArray(envelope.files) || envelope.files.length === 0 || envelope.files.length > 64) {
    fail("PRODUCTION_EVIDENCE_COLLECTOR_FILE_SET_INVALID");
  }
  const seen = new Set();
  let totalBytes = 0;
  for (const file of envelope.files) {
    assertExactKeys(file, ["path", "sha256", "contentBase64"], "PRODUCTION_EVIDENCE_COLLECTOR_FILE_SCHEMA_INVALID");
    if (!safeEvidenceRelativePath(file.path) || !sha256Pattern.test(file.sha256 ?? "") || seen.has(file.path)) {
      fail("PRODUCTION_EVIDENCE_COLLECTOR_FILE_INVALID");
    }
    if (["production-evidence.attestation.json", "production-evidence.provenance.json", "production-evidence-signing-inputs.json"].includes(file.path)) {
      fail("PRODUCTION_EVIDENCE_COLLECTOR_SIGNING_FILE_FORBIDDEN");
    }
    seen.add(file.path);
    const bytes = decodeCanonicalBase64(file.contentBase64, "PRODUCTION_EVIDENCE_COLLECTOR_FILE_CONTENT_INVALID");
    totalBytes += bytes.length;
    if (bytes.length > 2 * 1024 * 1024 || totalBytes > 8 * 1024 * 1024 || sha256(bytes) !== file.sha256) {
      fail("PRODUCTION_EVIDENCE_COLLECTOR_FILE_HASH_INVALID");
    }
    const destination = resolve(outputRoot, file.path);
    if (!isWithin(outputRoot, destination) || existsSync(destination)) fail("PRODUCTION_EVIDENCE_COLLECTOR_FILE_COLLISION");
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, bytes, { flag: "wx" });
  }
  if (!seen.has("production-evidence.json")) fail("PRODUCTION_EVIDENCE_COLLECTOR_EVIDENCE_MISSING");
  let evidence;
  try {
    evidence = JSON.parse(readFileSync(resolve(outputRoot, "production-evidence.json"), "utf8"));
  } catch {
    fail("PRODUCTION_EVIDENCE_COLLECTOR_EVIDENCE_INVALID");
  }
  if (evidence.generatedAt !== envelope.generatedAt ||
      evidence.environment?.releaseOwner !== context.releaseOwner ||
      evidence.environment?.rollbackOwner !== context.rollbackOwner ||
      evidence.environment?.incidentOwner !== context.incidentOwner) {
    fail("PRODUCTION_EVIDENCE_COLLECTOR_EVIDENCE_BINDING_INVALID");
  }
  return { fileCount: seen.size, totalBytes, generatedAt: envelope.generatedAt };
}

function listRegularFiles(root, current = root, output = []) {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const absolute = resolve(current, entry.name);
    if (!isWithin(root, absolute)) fail("PRODUCTION_EVIDENCE_PREPARE_SOURCE_OUTSIDE_ROOT");
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) fail("PRODUCTION_EVIDENCE_PREPARE_SOURCE_SYMLINK_FORBIDDEN");
    if (stat.isDirectory()) listRegularFiles(root, absolute, output);
    else if (stat.isFile()) output.push(relative(root, absolute).split("\\").join("/"));
    else fail("PRODUCTION_EVIDENCE_PREPARE_SOURCE_FILE_TYPE_INVALID");
  }
  return output.sort();
}

function copyRegularFile(sourceRoot, outputRoot, descriptor) {
  const source = resolve(sourceRoot, descriptor.path);
  const destination = resolve(outputRoot, descriptor.path);
  if (!isWithin(sourceRoot, source) || !isWithin(outputRoot, destination)) {
    fail(`PRODUCTION_EVIDENCE_PREPARE_PATH_INVALID:${descriptor.path}`);
  }
  const sourceStat = lstatSync(source);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink() || !isWithin(realpathSync(sourceRoot), realpathSync(source))) {
    fail(`PRODUCTION_EVIDENCE_PREPARE_SOURCE_INVALID:${descriptor.path}`);
  }
  if (sha256(readFileSync(source)) !== descriptor.sha256) {
    fail(`PRODUCTION_EVIDENCE_PREPARE_HASH_MISMATCH:${descriptor.path}`);
  }
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination, fsConstants.COPYFILE_EXCL);
}

export function buildProductionEvidenceProvenance(context, evidence, manifestSha256, descriptors) {
  validateTrustedPreparationContext(context);
  if (!sha256Pattern.test(manifestSha256 ?? "")) fail("PRODUCTION_EVIDENCE_PREPARE_MANIFEST_SHA_INVALID");
  const signerIdentity = `https://${context.evidenceSignerWorkflow}@${context.sourceRef}`;
  return {
    buildDefinition: {
      buildType: `${context.releaseSource}/blob/${context.releaseGitSha}/.github/workflows/production-evidence.yml#production-evidence-v1`,
      externalParameters: {
        approvalReferenceSha256: context.approvalReferenceSha256,
        environmentIdSha256: context.environmentIdSha256,
        gitSha: context.releaseGitSha,
        manifestSha256,
        releaseProfile: context.releaseProfile,
        releaseRunId: Number(context.releaseRunId),
        releaseOwner: context.releaseOwner,
        rollbackOwner: context.rollbackOwner,
        incidentOwner: context.incidentOwner,
        schemaVersion: evidence.schemaVersion,
        sourceRef: context.sourceRef,
      },
      internalParameters: {},
      resolvedDependencies: [
        { uri: context.releaseSource, digest: { gitCommit: context.releaseGitSha } },
        ...descriptors.map((descriptor) => ({
          uri: `${context.releaseSource}/actions/runs/${context.releaseRunId}#${descriptor.path}`,
          digest: { sha256: descriptor.sha256 },
        })),
      ],
    },
    runDetails: {
      builder: { id: signerIdentity },
      metadata: { invocationId: `${context.releaseSource}/actions/runs/${context.evidenceRunId}` },
    },
  };
}

export function prepareProductionEvidenceSigning({ evidenceRoot, outputRoot, context }) {
  validateTrustedPreparationContext(context);
  const sourceRoot = resolve(evidenceRoot);
  const destinationRoot = resolve(outputRoot);
  if (!isWithin(projectRoot, sourceRoot) || !existsSync(sourceRoot)) fail("PRODUCTION_EVIDENCE_PREPARE_ROOT_INVALID");
  const rootStat = lstatSync(sourceRoot);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail("PRODUCTION_EVIDENCE_PREPARE_ROOT_INVALID");
  if (!isWithin(projectRoot, destinationRoot) || destinationRoot === sourceRoot || isWithin(sourceRoot, destinationRoot)) {
    fail("PRODUCTION_EVIDENCE_PREPARE_OUTPUT_INVALID");
  }
  if (existsSync(destinationRoot) && readdirSync(destinationRoot).length > 0) fail("PRODUCTION_EVIDENCE_PREPARE_OUTPUT_NOT_EMPTY");
  mkdirSync(destinationRoot, { recursive: true });

  const evidencePath = resolve(sourceRoot, "production-evidence.json");
  if (!existsSync(evidencePath) || lstatSync(evidencePath).isSymbolicLink() || !lstatSync(evidencePath).isFile()) {
    fail("PRODUCTION_EVIDENCE_PREPARE_FILE_INVALID");
  }
  let evidence;
  try {
    evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  } catch {
    fail("PRODUCTION_EVIDENCE_PREPARE_JSON_INVALID");
  }

  const trusted = {
    environmentIdSha256: context.environmentIdSha256,
    approvalReferenceSha256: context.approvalReferenceSha256,
    releaseGitSha: context.releaseGitSha,
    migrationBundleSha256: context.migrationBundleSha256,
    releaseSource: context.releaseSource,
    repository: context.repository,
    sourceRef: context.sourceRef,
    manifestSignerWorkflow: context.manifestSignerWorkflow,
    evidenceSignerWorkflow: context.evidenceSignerWorkflow,
    releaseProfile: context.releaseProfile,
    evidenceRoot: sourceRoot,
  };
  const validated = validateProductionEvidenceStructure(evidence, trusted);
  if (evidence.environment.releaseOwner !== context.releaseOwner ||
      evidence.environment.rollbackOwner !== context.rollbackOwner ||
      evidence.environment.incidentOwner !== context.incidentOwner) {
    fail("PRODUCTION_EVIDENCE_PREPARE_OWNER_MISMATCH");
  }
  const descriptors = collectDescriptorPaths(evidence, validated.manifest);
  const evidenceSha256 = sha256(readFileSync(evidencePath));
  const expectedSourceFiles = ["production-evidence.json", ...descriptors.map(({ path }) => path)].sort();
  const actualSourceFiles = listRegularFiles(sourceRoot);
  if (JSON.stringify(actualSourceFiles) !== JSON.stringify(expectedSourceFiles)) {
    fail("PRODUCTION_EVIDENCE_PREPARE_UNREFERENCED_FILE_FORBIDDEN");
  }

  copyRegularFile(sourceRoot, destinationRoot, { path: "production-evidence.json", sha256: evidenceSha256 });
  for (const descriptor of descriptors) copyRegularFile(sourceRoot, destinationRoot, descriptor);

  const predicate = buildProductionEvidenceProvenance(context, evidence, validated.manifestSha256, descriptors);
  const predicatePath = resolve(destinationRoot, "production-evidence.provenance.json");
  writeFileSync(predicatePath, canonicalJson(predicate), { encoding: "utf8", flag: "wx" });
  const predicateSha256 = sha256(readFileSync(predicatePath));
  const signingInputs = {
    schemaVersion: 1,
    repository: context.repository,
    releaseGitSha: context.releaseGitSha,
    sourceRef: context.sourceRef,
    releaseRunId: Number(context.releaseRunId),
    evidenceRunId: Number(context.evidenceRunId),
    evidenceSignerWorkflow: context.evidenceSignerWorkflow,
    evidenceSha256,
    predicateSha256,
    manifestSha256: validated.manifestSha256,
    migrationBundleSha256: context.migrationBundleSha256,
  };
  const signingInputsPath = resolve(destinationRoot, "production-evidence-signing-inputs.json");
  writeFileSync(signingInputsPath, canonicalJson(signingInputs), { encoding: "utf8", flag: "wx" });
  return {
    ...signingInputs,
    signingInputsSha256: sha256(readFileSync(signingInputsPath)),
    descriptorCount: descriptors.length,
  };
}

function parseArgs(argv) {
  const allowed = new Set([
    "--evidence-root", "--output-root", "--environment-id-sha256", "--approval-reference-sha256",
    "--release-git-sha", "--migration-bundle-sha256", "--release-source", "--repo", "--source-ref",
    "--manifest-signer-workflow", "--evidence-signer-workflow", "--release-profile", "--release-run-id",
    "--evidence-run-id", "--release-owner", "--rollback-owner", "--incident-owner",
  ]);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(flag)) fail(`PRODUCTION_EVIDENCE_PREPARE_ARGUMENT_UNKNOWN:${flag ?? ""}`);
    if (!value || value.startsWith("--")) fail(`PRODUCTION_EVIDENCE_PREPARE_ARGUMENT_VALUE_REQUIRED:${flag}`);
    if (values.has(flag)) fail(`PRODUCTION_EVIDENCE_PREPARE_ARGUMENT_DUPLICATED:${flag}`);
    values.set(flag, value);
  }
  for (const flag of allowed) if (!values.has(flag)) fail(`PRODUCTION_EVIDENCE_PREPARE_ARGUMENT_REQUIRED:${flag}`);
  return values;
}

function parseMaterializeArgs(argv) {
  const allowed = new Set([
    "--materialize-collector-envelope", "--evidence-root", "--collector-sha256",
    "--environment-id-sha256", "--approval-reference-sha256", "--release-git-sha",
    "--migration-bundle-sha256", "--release-source", "--repo", "--source-ref",
    "--manifest-signer-workflow", "--evidence-signer-workflow", "--release-profile",
    "--release-run-id", "--evidence-run-id", "--release-owner", "--rollback-owner", "--incident-owner",
  ]);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(flag)) fail(`PRODUCTION_EVIDENCE_COLLECTOR_ARGUMENT_UNKNOWN:${flag ?? ""}`);
    if (!value || value.startsWith("--")) fail(`PRODUCTION_EVIDENCE_COLLECTOR_ARGUMENT_VALUE_REQUIRED:${flag}`);
    if (values.has(flag)) fail(`PRODUCTION_EVIDENCE_COLLECTOR_ARGUMENT_DUPLICATED:${flag}`);
    values.set(flag, value);
  }
  for (const flag of allowed) if (!values.has(flag)) fail(`PRODUCTION_EVIDENCE_COLLECTOR_ARGUMENT_REQUIRED:${flag}`);
  return values;
}

function contextFromArgs(args) {
  return {
    environmentIdSha256: args.get("--environment-id-sha256"),
    approvalReferenceSha256: args.get("--approval-reference-sha256"),
    releaseGitSha: args.get("--release-git-sha"),
    migrationBundleSha256: args.get("--migration-bundle-sha256"),
    releaseSource: args.get("--release-source"),
    repository: args.get("--repo"),
    sourceRef: args.get("--source-ref"),
    manifestSignerWorkflow: args.get("--manifest-signer-workflow"),
    evidenceSignerWorkflow: args.get("--evidence-signer-workflow"),
    releaseProfile: args.get("--release-profile"),
    releaseRunId: args.get("--release-run-id"),
    evidenceRunId: args.get("--evidence-run-id"),
    releaseOwner: args.get("--release-owner"),
    rollbackOwner: args.get("--rollback-owner"),
    incidentOwner: args.get("--incident-owner"),
  };
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--materialize-collector-envelope")) {
    const args = parseMaterializeArgs(argv);
    const result = materializeCollectorEnvelope({
      envelopePath: args.get("--materialize-collector-envelope"),
      evidenceRoot: args.get("--evidence-root"),
      expectedCollectorSha256: args.get("--collector-sha256"),
      context: contextFromArgs(args),
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  const args = parseArgs(argv);
  const result = prepareProductionEvidenceSigning({
    evidenceRoot: args.get("--evidence-root"),
    outputRoot: args.get("--output-root"),
    context: contextFromArgs(args),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

const isDirectExecution = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isDirectExecution) {
  try {
    main();
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      code: error instanceof Error && /^PRODUCTION_EVIDENCE_(?:PREPARE|COLLECTOR)_[A-Z0-9_:./-]+$/.test(error.message)
        ? error.message
        : "PRODUCTION_EVIDENCE_PREPARE_FAILED",
    }));
    process.exitCode = 1;
  }
}
