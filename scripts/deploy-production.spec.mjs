import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const deploy = readFileSync(new URL("./deploy-production.sh", import.meta.url), "utf8");
const prepare = readFileSync(new URL("./prepare-production-deploy.mjs", import.meta.url), "utf8");
const operationsCompose = readFileSync(new URL("../docker-compose.operations.yml", import.meta.url), "utf8");
const qualityWorkflow = readFileSync(new URL("../.github/workflows/quality.yml", import.meta.url), "utf8");
const runbook = readFileSync(new URL("../docs/PRODUCTION_RELEASE_RUNBOOK.md", import.meta.url), "utf8");
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

function ordered(...needles) {
  let previous = -1;
  for (const needle of needles) {
    const index = deploy.indexOf(needle, previous + 1);
    assert.ok(index > previous, `missing or out-of-order deployment step: ${needle}`);
    previous = index;
  }
}

test("production entry requires high assurance and validates signatures plus signed content", () => {
  assert.match(deploy, /prepare-production-deploy\.mjs/);
  assert.doesNotMatch(deploy, /prepare-preproduction-deploy|PREPRODUCTION/);
  assert.match(deploy, /ASSURANCE_LEVEL" = "high"/);
  assert.match(deploy, /PUBLIC_SEO_SOURCE_KIND" = "approved-snapshot"/);
  assert.match(deploy, /--certificate-github-workflow-trigger "workflow_dispatch"/);
  assert.match(deploy, /--certificate-github-workflow-sha "\$RELEASE_GIT_SHA"/);
  assert.match(deploy, /--certificate-github-workflow-repository "Zhanyanzhou\/haichuan"/);
  assert.match(deploy, /--certificate-github-workflow-ref "\$release_source_ref"/);
  for (const kind of ["image", "provenance", "sbom"]) {
    assert.match(deploy, new RegExp(`\\$\\{component\\}-\\$\\{kind\\}\\.sigstore\\.json`));
    assert.ok(deploy.includes(`${kind}) predicate_type=`));
  }
  for (const evidence of [
    "PRODUCTION_IMAGE_SIGNATURE_SUBJECT_INVALID",
    "PRODUCTION_PROVENANCE_CONTENT_INVALID",
    "PRODUCTION_SBOM_CONTENT_INVALID",
    "PRODUCTION_MANIFEST_PROVENANCE_CONTENT_INVALID",
    "PRODUCTION_MANIFEST_PROVENANCE_DEPENDENCIES_INVALID",
    'spdxVersion !== "SPDX-2.3"',
  ]) assert.ok(deploy.includes(evidence), evidence);
});

test("dry-run ends after compose expansion and before container inspection or image pulls", () => {
  ordered(
    'config --images',
    'if [ "$dry_run" = "true" ]',
    'previous_count=0',
    'docker inspect "$container"',
    'docker pull',
    'mutation_started="true"',
  );
  const dryRunExit = deploy.indexOf('echo "DEPLOY_DRY_RUN_OK"');
  assert.ok(dryRunExit > 0 && dryRunExit < deploy.indexOf("docker volume inspect"));
});

test("database operations stay read-only and all application replacements forbid builds", () => {
  assert.doesNotMatch(deploy, /migrate\s+deploy|migrate\s+dev|bootstrap-admin/);
  ordered('run --rm migration-status', 'run --rm release-preflight', 'mutation_started="true"', 'up -d --no-deps --no-build --wait server client backup');
  assert.equal((deploy.match(/up -d --no-deps --no-build --wait server client backup/g) ?? []).length, 2);
  assert.match(operationsCompose, /command: \["\.\/node_modules\/\.bin\/prisma", "migrate", "status"\]/);
  assert.match(operationsCompose, /command: \["node", "dist\/cli\/release-preflight\.js"\]/);
});

test("initial cutover and existing production are separate fail-closed states", () => {
  assert.match(deploy, /previous_count" -eq 0/);
  assert.match(deploy, /DEPLOY_INITIAL_PRODUCTION_CUTOVER_AUTHORIZATION_REQUIRED/);
  assert.match(deploy, /previous_count" -ne 3/);
  assert.match(deploy, /DEPLOY_EXISTING_CONTAINERS_NOT_VERIFIABLE_PRODUCTION/);
  assert.match(deploy, /DEPLOY_INITIAL_CUTOVER_AUTHORIZATION_STALE/);
  assert.match(deploy, /com\.docker\.compose\.project/);
  assert.match(deploy, /com\.docker\.compose\.service/);
  assert.match(deploy, /\^ghcr\\\.io\/zhanyanzhou\/haichuan-\$\{component\}@sha256:/);
});

test("automatic rollback requires a coherent previous production release and the same schema bundle", () => {
  assert.match(deploy, /previous_production" = "true".*previous_migration_bundle" = "\$MIGRATION_BUNDLE_SHA256"/);
  assert.match(deploy, /DEPLOY_AUTOMATIC_ROLLBACK_DISABLED reason=schema-compatibility-unproven/);
  assert.match(deploy, /previous_server%@sha256/);
  assert.match(deploy, /previous_client%@sha256/);
  assert.match(deploy, /previous_operations%@sha256/);
  assert.match(deploy, /RELEASE_GIT_SHA="\$previous_release_sha"/);
  assert.match(deploy, /DEPLOY_ROLLBACK_UNAVAILABLE_MANUAL_ACTION_REQUIRED/);
});

test("persistent database and media identities are checked before mutation", () => {
  ordered(
    'docker volume inspect "$MYSQL_VOLUME_NAME"',
    'docker volume inspect "$UPLOADS_VOLUME_NAME"',
    'docker volume inspect "$PRIVATE_MEDIA_VOLUME_NAME"',
    'mutation_started="true"',
  );
  for (const check of [
    "DEPLOY_MYSQL_NOT_IN_PRODUCTION_PROJECT",
    "DEPLOY_MYSQL_VOLUME_IDENTITY_MISMATCH",
    "DEPLOY_MEDIA_VOLUME_IDENTITY_MISMATCH",
    "DEPLOY_BACKUP_NOT_HEALTHY",
  ]) assert.ok(deploy.includes(check), check);
});

test("post-deploy checks cover health, pages, SEO, security headers, Host and retired English", () => {
  ordered(
    'up -d --no-deps --no-build --wait server client backup',
    'http://127.0.0.1:8081/api/health',
    'http://127.0.0.1:8081/api/ready',
    '--mode full',
    'verify-public-seo-http.mjs',
    "grep -i '^Content-Security-Policy:",
    "grep -i '^X-Content-Type-Options: nosniff'",
    "grep -i '^Referrer-Policy:",
    "grep -i '^Permissions-Policy:",
    'DEPLOY_UNTRUSTED_HOST_NOT_REJECTED',
    'DEPLOY_RETIRED_ENGLISH_API_NOT_REJECTED',
    'mutation_started="false"',
  );
  assert.match(deploy, /--require-representative/);
  assert.match(deploy, /Host: invalid\.example/);
  assert.match(deploy, /locale=en/);
  assert.match(deploy, /400\|404/);
});

test("manifest SEO identity is bound to pulled image labels and the embedded snapshot", () => {
  for (const label of [
    "public-seo-snapshot-sha256",
    "public-seo-prerender-manifest-sha256",
    "public-seo-source-artifact-digest",
    "public-seo-content-ready",
    "public-seo-source-kind",
  ]) assert.ok(deploy.includes(label), label);
  assert.match(deploy, /snapshot\.snapshotHash!==seo\.snapshotHash/);
  assert.match(deploy, /snapshot\.origin!==seo\.origin/);
  assert.match(deploy, /snapshot\.sourceStage!=="production"/);
});

test("quality gate and runbook include the production entry and its tests", () => {
  assert.match(qualityWorkflow, /bash -n scripts\/deploy-preproduction\.sh scripts\/deploy-production\.sh/);
  assert.match(packageJson.scripts["test:release-supply-chain"], /prepare-production-deploy\.spec\.mjs/);
  assert.match(packageJson.scripts["test:release-supply-chain"], /deploy-production\.spec\.mjs/);
  assert.match(runbook, /### 1\.1\.1 生产一次性部署入口/);
  assert.match(runbook, /PRODUCTION_INITIAL_SIGNED_CUTOVER_AUTHORIZED=1/);
  assert.match(runbook, /不得长期同机并行/);
  assert.match(prepare, /PRODUCTION_DEPLOY_INITIAL_CUTOVER_AUTHORIZATION_INVALID/);
});
