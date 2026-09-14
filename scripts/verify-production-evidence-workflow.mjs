import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { load as parseYaml } from "js-yaml";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

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

export function validateProductionEvidenceSignerWorkflow(source) {
  let workflow;
  try {
    workflow = parseYaml(source, { json: false });
  } catch {
    fail("PRODUCTION_EVIDENCE_SIGNER_WORKFLOW_YAML_INVALID");
  }
  if (!isRecord(workflow) || !isRecord(workflow.on) || !isRecord(workflow.permissions) ||
      !isRecord(workflow.jobs)) {
    fail("PRODUCTION_EVIDENCE_SIGNER_WORKFLOW_SCHEMA_INVALID");
  }
  if (!hasExactKeys(workflow.on, ["workflow_dispatch"]) ||
      !isRecord(workflow.on.workflow_dispatch) ||
      !hasExactKeys(workflow.on.workflow_dispatch.inputs, [
        "release_run_id",
        "sigstore_public_log_acknowledged",
      ])) {
    fail("PRODUCTION_EVIDENCE_SIGNER_WORKFLOW_NOT_MANUAL_ONLY");
  }
  if (Object.keys(workflow.permissions).length !== 0) {
    fail("PRODUCTION_EVIDENCE_SIGNER_WORKFLOW_ROOT_PERMISSIONS_INVALID");
  }
  if (!hasExactKeys(workflow.jobs, ["collect", "sign", "verify"])) {
    fail("PRODUCTION_EVIDENCE_SIGNER_WORKFLOW_JOB_SET_INVALID");
  }
  const expectedPermissions = {
    collect: { actions: "read", contents: "read" },
    sign: { actions: "read", "id-token": "write" },
    verify: { actions: "read", contents: "read", packages: "read" },
  };
  for (const [name, expected] of Object.entries(expectedPermissions)) {
    const job = workflow.jobs[name];
    if (!isRecord(job) || job["runs-on"] !== "ubuntu-latest" ||
        !hasExactKeys(job.permissions, Object.keys(expected)) ||
        Object.entries(expected).some(([permission, access]) => job.permissions[permission] !== access)) {
      fail(`PRODUCTION_EVIDENCE_SIGNER_WORKFLOW_PERMISSIONS_INVALID:${name}`);
    }
  }
  if (workflow.jobs.collect.environment !== "production-evidence") {
    fail("PRODUCTION_EVIDENCE_SIGNER_WORKFLOW_ENVIRONMENT_INVALID");
  }
  const signJobStart = source.indexOf("  sign:");
  const verifyJobStart = source.indexOf("  verify:");
  if (signJobStart < 0 || verifyJobStart <= signJobStart) {
    fail("PRODUCTION_EVIDENCE_SIGNER_WORKFLOW_JOB_ORDER_INVALID");
  }
  const signJobSource = source.slice(signJobStart, verifyJobStart);
  if (/actions\/checkout@|npm\s+(?:ci|install)|node\s+scripts\/|docker\s+(?:build|run)|docker\/login-action@/.test(signJobSource)) {
    fail("PRODUCTION_EVIDENCE_SIGNER_WORKFLOW_SIGN_JOB_REPOSITORY_CODE_FORBIDDEN");
  }
  for (const match of source.matchAll(/^\s+(?:-\s+)?uses:\s+([^\s]+)\s*$/gm)) {
    if (!/@[a-f0-9]{40}$/.test(match[1])) {
      fail(`PRODUCTION_EVIDENCE_SIGNER_WORKFLOW_ACTION_NOT_PINNED:${match[1]}`);
    }
  }
  for (const required of [
    "environment: production-evidence",
    "PRODUCTION_EVIDENCE_ENVIRONMENT_ID_SHA256",
    "PRODUCTION_EVIDENCE_APPROVAL_REFERENCE_SHA256",
    "PRODUCTION_EVIDENCE_REMOTE_COLLECTOR_SHA256",
    "PRODUCTION_EVIDENCE_SSH_PRIVATE_KEY",
    "PRODUCTION_EVIDENCE_SSH_KNOWN_HOSTS",
    "SIGSTORE_PUBLIC_LOG_ACKNOWLEDGEMENT_REQUIRED",
    "EVIDENCE_REF_NOT_PROTECTED",
    "release-production-manifest-${process.env.GITHUB_SHA}",
    "manifest.releaseStage !== \"production\"",
    "artifact-ids: ${{ steps.release-run.outputs.artifact_id }}",
    "github-token: ${{ github.token }}",
    "repository: ${{ github.repository }}",
    "run-id: ${{ inputs.release_run_id }}",
    "StrictHostKeyChecking=yes",
    "UserKnownHostsFile=\"${RUNNER_TEMP}/production-evidence-ssh/known_hosts\"",
    "PasswordAuthentication=no",
    "KbdInteractiveAuthentication=no",
    "IdentitiesOnly=yes",
    "haichuan-production-evidence-collect",
    "--materialize-collector-envelope",
    "--collector-sha256 \"$REMOTE_COLLECTOR_SHA256\"",
    "node scripts/prepare-production-evidence-signing.mjs",
    "--release-owner \"$RELEASE_OWNER\"",
    "--rollback-owner \"$ROLLBACK_OWNER\"",
    "--incident-owner \"$INCIDENT_OWNER\"",
    "production-evidence-signing-inputs-${{ github.run_id }}",
    "artifact-ids: ${{ needs.collect.outputs.signing_inputs_artifact_id }}",
    "EXPECTED_SIGNING_INPUTS_SHA256: ${{ needs.collect.outputs.signing_inputs_sha256 }}",
    "cosign-release: v3.1.3",
    "cosign attest-blob --yes",
    "--type slsaprovenance1",
    "--certificate-identity \"$signer_identity\"",
    "--certificate-oidc-issuer \"https://token.actions.githubusercontent.com\"",
    "--certificate-github-workflow-trigger \"workflow_dispatch\"",
    "--certificate-github-workflow-sha \"$GITHUB_SHA\"",
    "--certificate-github-workflow-repository \"$GITHUB_REPOSITORY\"",
    "--certificate-github-workflow-ref \"$GITHUB_REF\"",
    "application/vnd.dev.sigstore.bundle.v0.3+json",
    "artifact-ids: ${{ needs.sign.outputs.signed_artifact_id }}",
    "node scripts/verify-production-evidence.mjs",
    "--evidence-signer-workflow \"github.com/$GITHUB_REPOSITORY/.github/workflows/production-evidence.yml\"",
    "PRODUCTION_EVIDENCE_SIGNED_AND_VERIFIED",
  ]) {
    if (!source.includes(required)) {
      fail(`PRODUCTION_EVIDENCE_SIGNER_WORKFLOW_CONTRACT_MISSING:${required}`);
    }
  }
  if (/actions\/(?:attest|attest-build-provenance)@/.test(source) ||
      /--(?:key|new-bundle-format|insecure-ignore-tlog|insecure-ignore-sct)\b/.test(source) ||
      /--tlog-upload(?:=|\s+)false\b/.test(source) ||
      /inputs\.(?:evidence|evidence_artifact|evidence_run_id|evidence_signer_workflow)/.test(source) ||
      /runs-on:\s*(?:self-hosted|\[[^\]]*self-hosted)/.test(source)) {
    fail("PRODUCTION_EVIDENCE_SIGNER_WORKFLOW_FAIL_CLOSED_POLICY_INVALID");
  }
  return { ok: true, jobs: ["collect", "sign", "verify"] };
}

function main() {
  const source = readFileSync(resolve(projectRoot, ".github/workflows/production-evidence.yml"), "utf8");
  process.stdout.write(`${JSON.stringify(validateProductionEvidenceSignerWorkflow(source))}\n`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      code: error instanceof Error && /^PRODUCTION_EVIDENCE_SIGNER_WORKFLOW_[A-Z0-9_:./${}-]+$/.test(error.message)
        ? error.message
        : "PRODUCTION_EVIDENCE_SIGNER_WORKFLOW_FAILED",
    }));
    process.exitCode = 1;
  }
}
