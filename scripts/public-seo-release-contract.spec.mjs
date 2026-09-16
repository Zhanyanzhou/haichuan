import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (pathname) => readFileSync(resolve(projectRoot, pathname), "utf8");

test("SPA base shell remains noindex until strict pre-render replaces its metadata", () => {
  const html = read("client/index.html");
  assert.match(html, /<meta name="robots" content="noindex, nofollow" \/>/);
});

test("client image requires immutable SEO inputs and carries their evidence labels", () => {
  const dockerfile = read("client/Dockerfile");
  for (const required of [
    "COPY .release-seo/public-seo-snapshot.json",
    "COPY .release-seo/public-seo-routes.conf",
    "COPY dist/",
    "--prerender-manifest ./dist/prerendered-routes.json",
    "--nginx-map ./public-seo-routes.conf",
    "--strict",
    "--check",
    "rm ./dist/prerendered-routes.json",
    "io.haichuan.public-seo-snapshot-sha256",
    "io.haichuan.public-seo-prerender-manifest-sha256",
    "io.haichuan.public-seo-source-artifact-digest",
  ]) {
    assert.ok(dockerfile.includes(required), `missing Docker SEO contract: ${required}`);
  }
});

test("Nginx serves only generated indexable routes while preserving protected SPA and media behavior", () => {
  const nginx = read("client/nginx.conf");
  const nginxMain = read("client/nginx-main.conf");
  const generator = read("scripts/generate-public-seo-artifacts.mjs");
  assert.ok(nginx.includes("include /etc/nginx/public-seo-routes.conf;"));
  assert.ok(nginxMain.includes("include /etc/nginx/public-seo-policy.conf;"));
  assert.match(nginx, /location = \/search \{\s+return 308 \/catalog\$is_args\$args;/);
  assert.match(nginx, /location = \/en \{\s+return 308 \/\$is_args\$args;\s+absolute_redirect off;/);
  assert.ok(nginx.includes("location ~* ^/en/([^/].*)$ {"));
  assert.match(nginx, /location ~\* \^\/en\(\?:\/\|\$\) \{\s+return 404;/);
  assert.match(nginx, /location ~\* \^\/en\/\/ \{\s+return 404;/);
  assert.match(nginx, /location ~\* \^\/en\/\.\+\(%2f\|%5c\|\\\\\) \{\s+return 404;/);
  assert.match(nginxMain, /merge_slashes off;/);
  assert.doesNotMatch(nginx, /404-en\.html/);
  assert.match(nginx, /location \/ \{[\s\S]*?try_files \$uri =404;/);
  assert.ok(generator.includes("renderPublicSeoPolicy"));
  assert.ok(generator.includes("admin|preview|customer|cart|checkout|partner"));
  assert.ok(generator.includes('"noindex, nofollow"'));
  assert.match(nginx, /location ~\* \^\/\(admin\|preview\|customer\|cart\|checkout\|partner\)\(\/\|\$\) \{[\s\S]*?try_files \/index\.html =404;/);
  assert.match(nginx, /location \/uploads\/page-assets\/ \{[\s\S]*?proxy_cache off;[\s\S]*?expires off;/);
  assert.match(nginx, /location \/uploads\/page-assets\/ \{[\s\S]*?Cache-Control: public, no-store/);
});

test("release workflow validates a same-SHA artifact before build and performs real client HTTP checks", () => {
  const workflow = read(".github/workflows/release-images.yml");
  for (const required of [
    "public_seo_snapshot_artifact_id:",
    "m.workflow_run?.head_sha!==process.env.GITHUB_SHA",
    "public-seo-${process.env.RELEASE_STAGE}-snapshot-${process.env.GITHUB_SHA}",
    "EXPECTED_SEO_PRODUCER_WORKFLOW_PATH: .github/workflows/export-public-seo-snapshot.yml",
    "PUBLIC_SEO_PRODUCER_RUN_INVALID",
    "PUBLIC_SEO_ARTIFACT_DIGEST_MISMATCH",
    "validatePublicSeoSnapshot",
    "PUBLIC_SEO_ORIGIN_MISMATCH",
    "PUBLIC_SEO_SOURCE_STAGE_MISMATCH",
    "release_stage:",
    "preproduction-sha-${GITHUB_SHA}",
    "-preproduction",
    "releaseStage: process.env.RELEASE_STAGE",
    "sourceStage: process.env.RELEASE_STAGE",
    "PUBLIC_SPA_FALLBACK_NOINDEX_MISSING",
    "node scripts/prerender-public-routes.mjs",
    "node scripts/generate-public-seo-artifacts.mjs",
    "node scripts/verify-public-seo-http.mjs",
    "publicSeo: {",
    "snapshotHash: process.env.PUBLIC_SEO_SNAPSHOT_HASH",
    "prerenderManifestSha256: process.env.PUBLIC_SEO_PRERENDER_MANIFEST_SHA256",
    "sourceArtifactDigest: process.env.PUBLIC_SEO_SOURCE_ARTIFACT_DIGEST",
    "--read-only",
    "--tmpfs /tmp:rw,noexec,nosuid,nodev,size=32m",
    "SERVER_RUNTIME_NATIVE_DEPENDENCY_INVALID:sharp",
    "SERVER_RUNTIME_PRISMA_CLI_PRESENT",
  ]) {
    assert.ok(workflow.includes(required), `missing workflow SEO or protected probe contract: ${required}`);
  }
});

test("SEO producer workflow binds preproduction or production to protected environment facts", () => {
  const workflow = read(".github/workflows/export-public-seo-snapshot.yml");
  assert.match(workflow, /workflow_dispatch:\s*\n\s*inputs:\s*\n\s*source_stage:/);
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  for (const required of [
    "environment: public-seo-${{ inputs.source_stage }}",
    "PUBLIC_SEO_EXPORT_READ_ONLY_AUTHORIZED: \"1\"",
    "PUBLIC_SEO_SOURCE_STAGE: ${{ inputs.source_stage }}",
    "PUBLIC_SEO_SOURCE_ENVIRONMENT_ID: ${{ vars.PUBLIC_SEO_SOURCE_ENVIRONMENT_ID }}",
    "PUBLIC_SEO_EXPECTED_DATABASE: ${{ vars.PUBLIC_SEO_EXPECTED_DATABASE }}",
    "PUBLIC_SEO_EXPECTED_DATABASE_HOST: ${{ vars.PUBLIC_SEO_EXPECTED_DATABASE_HOST }}",
    "PUBLIC_SEO_DATABASE_TRANSPORT_HOST: \"127.0.0.1\"",
    "PUBLIC_SEO_APPROVAL_REFERENCE: ${{ vars.PUBLIC_SEO_APPROVAL_REFERENCE }}",
    "PUBLIC_SEO_EXPECTED_ORIGIN: ${{ vars.PUBLIC_SEO_EXPECTED_ORIGIN }}",
    "PUBLIC_SEO_RELEASE_PROFILE: ${{ vars.PUBLIC_SEO_RELEASE_PROFILE }}",
    "DATABASE_URL: ${{ secrets.PUBLIC_SEO_READ_ONLY_DATABASE_URL }}",
    "PUBLIC_SEO_SSH_PRIVATE_KEY: ${{ secrets.PUBLIC_SEO_SSH_PRIVATE_KEY }}",
    "PUBLIC_SEO_SSH_KNOWN_HOSTS: ${{ secrets.PUBLIC_SEO_SSH_KNOWN_HOSTS }}",
    "PUBLIC_SEO_SSH_HOST_KEY_SHA256: ${{ vars.PUBLIC_SEO_SSH_HOST_KEY_SHA256 }}",
    "PUBLIC_SEO_TUNNEL_TARGET_DATABASE_HOST_IDENTITY: ${{ vars.PUBLIC_SEO_TUNNEL_TARGET_DATABASE_HOST_IDENTITY }}",
    "PUBLIC_SEO_DATABASE_URL_MUST_USE_SSH_LOOPBACK_TUNNEL",
    "PUBLIC_SEO_SSH_REMOTE_DATABASE_HOST_MUST_USE_TARGET_LOOPBACK",
    'test "$PUBLIC_SEO_EXPECTED_DATABASE_HOST" = "$PUBLIC_SEO_TUNNEL_TARGET_DATABASE_HOST_IDENTITY"',
    "StrictHostKeyChecking=yes",
    "ExitOnForwardFailure=yes",
    "127.0.0.1:${PUBLIC_SEO_SSH_LOCAL_PORT}",
    "if: always()",
    "清理 SSH 隧道和临时密钥",
    "PUBLIC_SEO_SOURCE_ENVIRONMENT_DRIFT",
    "node server/dist/cli/export-public-seo-snapshot.js",
    "node scripts/export-public-seo-snapshot.mjs",
    "validatePublicSeoSnapshot",
    "PUBLIC_SEO_ARTIFACT_MUST_CONTAIN_ONE_JSON",
    "name: public-seo-${{ inputs.source_stage }}-snapshot-${{ github.sha }}",
    "path: ${{ steps.snapshot.outputs.snapshot_path }}",
    "ARTIFACT_DIGEST: ${{ steps.upload.outputs.artifact-digest }}",
  ]) {
    assert.ok(workflow.includes(required), `missing producer workflow contract: ${required}`);
  }
  const jobEnv = workflow.match(/\n    env:\n(?<body>(?:      .+\n)+)    steps:/)?.groups?.body ?? "";
  assert.ok(!jobEnv.includes("DATABASE_URL"), "database secret must not be available to checkout/install/build/upload steps");
  assert.ok(!jobEnv.includes("PUBLIC_SEO_SSH_PRIVATE_KEY"), "SSH private key must not be available at job scope");
  assert.match(
    workflow,
    /- name: 从专用只读账号导出并冻结快照[\s\S]*?env:\s*\n\s*DATABASE_URL: \$\{\{ secrets\.PUBLIC_SEO_READ_ONLY_DATABASE_URL \}\}[\s\S]*?node server\/dist\/cli\/export-public-seo-snapshot\.js/,
  );
});

test("SEO tunnel overlay exposes MySQL only on an explicit loopback high port", () => {
  const overlay = read("docker-compose.public-seo-tunnel.yml");
  assert.match(overlay, /services:\s*\n\s*mysql:\s*\n\s*ports:/);
  assert.ok(overlay.includes("127.0.0.1:${PUBLIC_SEO_SSH_REMOTE_DATABASE_PORT:?PUBLIC_SEO_SSH_REMOTE_DATABASE_PORT is required}:3306"));
  assert.doesNotMatch(overlay, /0\.0\.0\.0|\[::\]|["']3306:3306["']/);
  assert.doesNotMatch(overlay, /^\s*build:/m);
});

test("HTTP SEO probe treats historical English unpublished paths as same-origin 308", () => {
  const verifier = read("scripts/verify-public-seo-http.mjs");
  assert.match(verifier, /retiredEnglishPath = "\/en\/__seo-unpublished-probe__"/);
  assert.match(verifier, /retiredEnglish\.status !== 308/);
  assert.match(verifier, /assertLocation\(retiredEnglish, "\/__seo-unpublished-probe__", ""\)/);
  assert.doesNotMatch(verifier, /\["\/en\/__seo-unpublished-probe__", 404, "en"\]/);
});

test("runbook keeps PageDocument publication separate from immutable public-route activation", () => {
  const runbook = read("docs/PRODUCTION_RELEASE_RUNBOOK.md");
  for (const required of [
    "后台把 PageDocument 标记为已发布，只会更新数据库中的已审核中文发布事实",
    "历史 `/en` 与 `/en/<path>` 只允许同源 `308` 到对应中文路径",
    "手动运行 `Export Public SEO Snapshot`",
    "不得手工编辑 snapshot，也不得复用发布前的 artifact",
    "运行 `Release Images`",
    "数据库发布本身不授权构建、部署或切流",
    "`/en//...`、编码斜杠和反斜杠必须失败关闭",
    "取消发布和内容回滚遵循同一方向",
  ]) {
    assert.ok(runbook.includes(required), `missing explicit PageDocument activation contract: ${required}`);
  }
});
