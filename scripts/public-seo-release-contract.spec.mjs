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
  assert.ok(nginx.includes("include /etc/nginx/public-seo-routes.conf;"));
  assert.match(nginx, /location = \/search \{\s+return 308 \/catalog\$is_args\$args;/);
  assert.match(nginx, /location ~\* \^\/en\(\?:\/\|\$\) \{\s+error_page 404 =404 \/404-en\.html;\s+return 404;/);
  assert.match(nginx, /location \/ \{[\s\S]*?try_files \$uri =404;/);
  assert.match(nginx, /~\*\^\/\(admin\|preview\|customer\|cart\|checkout\|partner\)\(\/\|\\\?\|\$\) "noindex, nofollow";/);
  assert.match(nginx, /location ~\* \^\/\(admin\|preview\|customer\|cart\|checkout\|partner\)\(\/\|\$\) \{[\s\S]*?try_files \/index\.html =404;/);
  assert.match(nginx, /location \/uploads\/page-assets\/ \{[\s\S]*?proxy_cache off;[\s\S]*?expires off;/);
  assert.match(nginx, /location \/uploads\/page-assets\/ \{[\s\S]*?Cache-Control: public, no-store/);
});

test("release workflow validates a same-SHA artifact before build and performs real client HTTP checks", () => {
  const workflow = read(".github/workflows/release-images.yml");
  for (const required of [
    "public_seo_snapshot_artifact_id:",
    "m.workflow_run?.head_sha!==process.env.GITHUB_SHA",
    "public-seo-snapshot-${process.env.GITHUB_SHA}",
    "EXPECTED_SEO_PRODUCER_WORKFLOW_PATH: .github/workflows/export-public-seo-snapshot.yml",
    "PUBLIC_SEO_PRODUCER_RUN_INVALID",
    "PUBLIC_SEO_ARTIFACT_DIGEST_MISMATCH",
    "validatePublicSeoSnapshot",
    "PUBLIC_SEO_ORIGIN_MISMATCH",
    "PUBLIC_SPA_FALLBACK_NOINDEX_MISSING",
    "node scripts/prerender-public-routes.mjs",
    "node scripts/generate-public-seo-artifacts.mjs",
    "node scripts/verify-public-seo-http.mjs",
    "const publicSeo={snapshotHash:process.env.PUBLIC_SEO_SNAPSHOT_HASH",
    "prerenderManifestSha256:process.env.PUBLIC_SEO_PRERENDER_MANIFEST_SHA256",
    "sourceArtifactDigest:process.env.PUBLIC_SEO_SOURCE_ARTIFACT_DIGEST",
    "--read-only",
    "--tmpfs /tmp:rw,noexec,nosuid,nodev,size=32m",
    "SERVER_RUNTIME_NATIVE_DEPENDENCY_INVALID:sharp",
    "SERVER_RUNTIME_PRISMA_CLI_PRESENT",
  ]) {
    assert.ok(workflow.includes(required), `missing workflow SEO or protected probe contract: ${required}`);
  }
});

test("SEO producer workflow reads only protected environment facts and uploads one same-SHA JSON", () => {
  const workflow = read(".github/workflows/export-public-seo-snapshot.yml");
  assert.match(workflow, /on:\s*\n\s*workflow_dispatch:\s*\n/);
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  assert.ok(!workflow.includes("inputs:"), "producer must not accept operator-entered content facts");
  for (const required of [
    "environment: public-seo-production",
    "PUBLIC_SEO_EXPORT_READ_ONLY_AUTHORIZED: \"1\"",
    "PUBLIC_SEO_SOURCE_ENVIRONMENT_ID: ${{ vars.PUBLIC_SEO_SOURCE_ENVIRONMENT_ID }}",
    "PUBLIC_SEO_EXPECTED_DATABASE: ${{ vars.PUBLIC_SEO_EXPECTED_DATABASE }}",
    "PUBLIC_SEO_EXPECTED_DATABASE_HOST: ${{ vars.PUBLIC_SEO_EXPECTED_DATABASE_HOST }}",
    "PUBLIC_SEO_APPROVAL_REFERENCE: ${{ vars.PUBLIC_SEO_APPROVAL_REFERENCE }}",
    "PUBLIC_SEO_EXPECTED_ORIGIN: ${{ vars.PUBLIC_SEO_EXPECTED_ORIGIN }}",
    "PUBLIC_SEO_RELEASE_PROFILE: ${{ vars.PUBLIC_SEO_RELEASE_PROFILE }}",
    "DATABASE_URL: ${{ secrets.PUBLIC_SEO_READ_ONLY_DATABASE_URL }}",
    "PUBLIC_SEO_SOURCE_ENVIRONMENT_DRIFT",
    "node server/dist/cli/export-public-seo-snapshot.js",
    "node scripts/export-public-seo-snapshot.mjs",
    "validatePublicSeoSnapshot",
    "PUBLIC_SEO_ARTIFACT_MUST_CONTAIN_ONE_JSON",
    "name: public-seo-snapshot-${{ github.sha }}",
    "path: ${{ steps.snapshot.outputs.snapshot_path }}",
    "ARTIFACT_DIGEST: ${{ steps.upload.outputs.artifact-digest }}",
  ]) {
    assert.ok(workflow.includes(required), `missing producer workflow contract: ${required}`);
  }
  const jobEnv = workflow.match(/\n    env:\n(?<body>(?:      .+\n)+)    steps:/)?.groups?.body ?? "";
  assert.ok(!jobEnv.includes("DATABASE_URL"), "database secret must not be available to checkout/install/build/upload steps");
  assert.match(
    workflow,
    /- name: 从专用只读账号导出并冻结快照[\s\S]*?env:\s*\n\s*DATABASE_URL: \$\{\{ secrets\.PUBLIC_SEO_READ_ONLY_DATABASE_URL \}\}[\s\S]*?node server\/dist\/cli\/export-public-seo-snapshot\.js/,
  );
});

test("runbook keeps PageDocument publication separate from immutable public-route activation", () => {
  const runbook = read("docs/PRODUCTION_RELEASE_RUNBOOK.md");
  for (const required of [
    "后台把 PageDocument 标记为已发布，只会更新数据库中的已审核发布事实",
    "直接访问尚未进入当前镜像的英文路由仍应为 404",
    "手动运行 `Export Public SEO Snapshot`",
    "不得手工编辑 snapshot，也不得复用发布前的 artifact",
    "运行 `Release Images`",
    "数据库发布本身不授权构建、部署或切流",
    "至少一个未发布英文路径和一个未知英文路径仍为 404",
    "取消发布和内容回滚遵循同一方向",
  ]) {
    assert.ok(runbook.includes(required), `missing explicit PageDocument activation contract: ${required}`);
  }
});
