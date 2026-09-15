import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { validateProductionEvidenceSignerWorkflow } from "./verify-production-evidence-workflow.mjs";

const workflow = readFileSync(new URL("../.github/workflows/production-evidence.yml", import.meta.url), "utf8");

test("production evidence signer uses protected collection and an isolated keyless signing job", () => {
  assert.equal(validateProductionEvidenceSignerWorkflow(workflow).ok, true);
  const signJob = workflow.slice(workflow.indexOf("  sign:"), workflow.indexOf("  verify:"));
  assert.doesNotMatch(signJob, /actions\/checkout@|npm (?:ci|install)|node scripts\/|docker\/login-action@/);
  assert.match(signJob, /^\s{4}permissions:\s*\r?\n\s{6}actions: read\s*\r?\n\s{6}id-token: write/m);
  assert.match(workflow, /artifact-ids: \$\{\{ steps\.release-run\.outputs\.artifact_id \}\}[\s\S]*?run-id: \$\{\{ inputs\.release_run_id \}\}/);
  assert.match(workflow, /artifact-ids: \$\{\{ needs\.collect\.outputs\.signing_inputs_artifact_id \}\}/);
});

test("production evidence signer contract rejects extra artifact inputs, self-hosted runners and wider signing permissions", () => {
  assert.throws(
    () => validateProductionEvidenceSignerWorkflow(workflow.replace("id-token: write", "id-token: read")),
    { message: "PRODUCTION_EVIDENCE_SIGNER_WORKFLOW_PERMISSIONS_INVALID:sign" },
  );
  assert.throws(
    () => validateProductionEvidenceSignerWorkflow(workflow.replace(
      "release_run_id:\n",
      "evidence_run_id:\n        description: operator artifact\n        required: true\n        type: string\n      release_run_id:\n",
    )),
    { message: "PRODUCTION_EVIDENCE_SIGNER_WORKFLOW_NOT_MANUAL_ONLY" },
  );
  assert.throws(
    () => validateProductionEvidenceSignerWorkflow(workflow.replace("runs-on: ubuntu-latest", "runs-on: self-hosted")),
    { message: "PRODUCTION_EVIDENCE_SIGNER_WORKFLOW_PERMISSIONS_INVALID:collect" },
  );
  const commentedAuthorization = workflow.replace(
    '            test "$UNPROTECTED_REF_AUTHORIZED" = "true" ||',
    '            # test "$UNPROTECTED_REF_AUTHORIZED" = "true" ||',
  );
  assert.notEqual(commentedAuthorization, workflow);
  assert.throws(
    () => validateProductionEvidenceSignerWorkflow(commentedAuthorization),
    /PRODUCTION_EVIDENCE_SIGNER_WORKFLOW_AUTHORIZATION_CONTRACT_MISSING/,
  );
  const commentedSourceBinding = workflow.replace(
    '            test "$AUTHORIZED_SOURCE_SHA" = "$GITHUB_SHA" ||',
    '            # test "$AUTHORIZED_SOURCE_SHA" = "$GITHUB_SHA" ||',
  );
  assert.notEqual(commentedSourceBinding, workflow);
  assert.throws(
    () => validateProductionEvidenceSignerWorkflow(commentedSourceBinding),
    /PRODUCTION_EVIDENCE_SIGNER_WORKFLOW_AUTHORIZATION_CONTRACT_MISSING/,
  );
});
