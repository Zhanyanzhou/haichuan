import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createPublicSeoSnapshot } from "./export-public-seo-snapshot.mjs";
import {
  renderPublicSeoArtifacts,
  renderPublicSeoNginxMap,
  renderPublicSeoPolicy,
} from "./generate-public-seo-artifacts.mjs";
import { prerenderPublicRoutes } from "./prerender-public-routes.mjs";
import {
  BASE_HTML,
  makeRepresentativeRoutes,
  makeRoute,
  makeSnapshotInput,
} from "./public-seo-test-fixtures.mjs";

const scriptPath = fileURLToPath(
  new URL("./generate-public-seo-artifacts.mjs", import.meta.url),
);

function runGenerator(manifest, ...arguments_) {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "haichuan-public-seo-"));
  const manifestPath = join(temporaryDirectory, "routes.json");
  const outputDirectory = join(temporaryDirectory, "public");
  mkdirSync(outputDirectory);
  writeFileSync(manifestPath, JSON.stringify(manifest), "utf8");
  execFileSync(
    process.execPath,
    [scriptPath, "--manifest", manifestPath, "--out-dir", outputDirectory, ...arguments_],
    { stdio: "pipe" },
  );
  return {
    robots: readFileSync(join(outputDirectory, "robots.txt"), "utf8"),
    sitemap: readFileSync(join(outputDirectory, "sitemap.xml"), "utf8"),
  };
}

async function prepareVerifiedArtifacts(routes = makeRepresentativeRoutes()) {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "haichuan-public-seo-v2-"));
  const outputDirectory = join(temporaryDirectory, "dist");
  const snapshotPath = join(temporaryDirectory, "snapshot.json");
  const snapshot = createPublicSeoSnapshot(makeSnapshotInput(routes));
  writeFileSync(snapshotPath, JSON.stringify(snapshot), "utf8");
  await prerenderPublicRoutes({ snapshot, baseHtml: BASE_HTML, outDir: outputDirectory });
  return {
    temporaryDirectory,
    outputDirectory,
    snapshotPath,
    snapshot,
    prerenderManifestPath: join(outputDirectory, "prerendered-routes.json"),
    nginxMapPath: join(temporaryDirectory, "public-seo-routes.map.conf"),
  };
}

function runVerifiedGenerator(prepared, ...arguments_) {
  execFileSync(
    process.execPath,
    [
      scriptPath,
      "--strict",
      "--manifest",
      prepared.snapshotPath,
      "--prerender-manifest",
      prepared.prerenderManifestPath,
      "--out-dir",
      prepared.outputDirectory,
      "--nginx-map",
      prepared.nginxMapPath,
      ...arguments_,
    ],
    { stdio: "pipe" },
  );
  return {
    robots: readFileSync(join(prepared.outputDirectory, "robots.txt"), "utf8"),
    sitemap: readFileSync(join(prepared.outputDirectory, "sitemap.xml"), "utf8"),
  };
}

test("missing production origin keeps sitemap empty and omits a guessed Sitemap URL", () => {
  const artifacts = runGenerator({ schemaVersion: 1, routes: [] });
  assert.doesNotMatch(artifacts.robots, /^Sitemap:/m);
  assert.doesNotMatch(artifacts.sitemap, /<loc>/);
  assert.match(artifacts.robots, /^Disallow: \/customer$/m);
});

test("only explicit published and indexable Chinese routes enter production artifacts", () => {
  const artifacts = runGenerator(
    {
      schemaVersion: 1,
      routes: [
        {
          path: "/catalog",
          published: true,
          indexable: true,
          locale: "zh-CN",
          lastModified: "2026-09-06",
        },
        {
          path: "/",
          published: true,
          indexable: true,
          locale: "zh-CN",
        },
      ],
    },
    "--origin",
    "https://jewelry.example.com",
  );
  assert.match(artifacts.robots, /Sitemap: https:\/\/jewelry\.example\.com\/sitemap\.xml/);
  assert.match(artifacts.sitemap, /<loc>https:\/\/jewelry\.example\.com\/<\/loc>/);
  assert.match(artifacts.sitemap, /<loc>https:\/\/jewelry\.example\.com\/catalog<\/loc>/);
  assert.match(artifacts.sitemap, /<lastmod>2026-09-06<\/lastmod>/);
});

test("private, unpublished, unavailable-locale, and insecure-origin inputs fail closed", () => {
  const invalidManifests = [
    [{ path: "/customer", published: true, indexable: true, locale: "zh-CN" }],
    [{ path: "/catalog", published: false, indexable: true, locale: "zh-CN" }],
    [{ path: "/en/catalog", published: true, indexable: true, locale: "en" }],
  ];
  for (const routes of invalidManifests) {
    assert.throws(() => runGenerator({ schemaVersion: 1, routes }));
  }
  assert.throws(() => runGenerator(
    { schemaVersion: 1, routes: [] },
    "--origin",
    "http://jewelry.example.com",
  ));
});

test("committed empty artifacts are reproducible in check mode", () => {
  execFileSync(
    process.execPath,
    [resolve(scriptPath), "--check"],
    { cwd: resolve(fileURLToPath(new URL("..", import.meta.url))), stdio: "pipe" },
  );
});

test("renderer never emits route URLs without an explicit origin", () => {
  const artifacts = renderPublicSeoArtifacts(null, [
    { pathname: "/catalog", lastModified: "2026-09-06" },
  ]);
  assert.doesNotMatch(artifacts.sitemap, /catalog/);
  assert.doesNotMatch(artifacts.robots, /^Sitemap:/m);
});

test("strict schema v3 emits only hash-matched Chinese routes and x-default alternates", async (t) => {
  const prepared = await prepareVerifiedArtifacts();
  t.after(() => rmSync(prepared.temporaryDirectory, { recursive: true, force: true }));
  const artifacts = runVerifiedGenerator(prepared);

  assert.match(artifacts.sitemap, /xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml"/);
  assert.match(artifacts.sitemap, /<loc>https:\/\/jewelry\.example\.test\/about<\/loc>/);
  assert.match(artifacts.sitemap, /hreflang="x-default" href="https:\/\/jewelry\.example\.test\/about"/);
  assert.doesNotMatch(artifacts.sitemap, /hreflang="en"|\/en\//);
  assert.match(artifacts.robots, /^Disallow: \/en$/m);
  const nginxMap = readFileSync(prepared.nginxMapPath, "utf8");
  assert.match(nginxMap, /^location = "\/about" \{$/m);
  assert.match(nginxMap, /^  try_files "\/about\/index\.html" =404;$/m);
  assert.match(nginxMap, /^location = "\/about\/index\.html" \{$/m);
  assert.match(
    nginxMap,
    /location = "\/about\/index\.html" \{\n  absolute_redirect off;\n  return 308 "\/about\$is_args\$args";/,
  );
  assert.match(
    nginxMap,
    /location = "\/about\/" \{\n  absolute_redirect off;\n  return 308 "\/about\$is_args\$args";/,
  );
  assert.match(nginxMap, /return 308 "\/about\$is_args\$args";/);
  assert.doesNotMatch(nginxMap, /^location = "\/en(?:\/|\")/m);
});

test("strict generation accepts the home first-fold artifact bound to its published snapshot", async (t) => {
  const home = makeRoute({
    path: "/",
    alternateKey: "page:home",
    bootstrapPageDocument: {
      pageKey: "home",
      puckData: {
        content: [{
          type: "首屏主视觉",
          props: { desktopImage: "/uploads/home-hero.jpg", title: "光映新姿" },
        }],
      },
      metadata: {},
      status: "PUBLISHED",
    },
  });
  const prepared = await prepareVerifiedArtifacts([home]);
  t.after(() => rmSync(prepared.temporaryDirectory, { recursive: true, force: true }));
  assert.doesNotThrow(() => runVerifiedGenerator(prepared));
  const html = readFileSync(join(prepared.outputDirectory, "index.html"), "utf8");
  assert.match(html, /data-public-first-fold="published"/);
  assert.match(html, /hc-published-page-document/);
});

test("generated canonical redirects never expose an absolute origin or internal port", () => {
  const nginxMap = renderPublicSeoNginxMap([
    { pathname: "/" },
    { pathname: "/about" },
  ]);

  assert.match(
    nginxMap,
    /location = "\/index\.html" \{\n  absolute_redirect off;\n  return 308 "\/\$is_args\$args";/,
  );
  assert.match(
    nginxMap,
    /location = "\/about\/index\.html" \{\n  absolute_redirect off;\n  return 308 "\/about\$is_args\$args";/,
  );
  assert.match(
    nginxMap,
    /location = "\/about\/" \{\n  absolute_redirect off;\n  return 308 "\/about\$is_args\$args";/,
  );
  assert.doesNotMatch(nginxMap, /https?:\/\//i);
  assert.doesNotMatch(nginxMap, /:8081/);
});

test("strict generation fails closed on HTML drift, content hash drift, and origin mismatch", async (t) => {
  const htmlDrift = await prepareVerifiedArtifacts([makeRoute()]);
  t.after(() => rmSync(htmlDrift.temporaryDirectory, { recursive: true, force: true }));
  writeFileSync(join(htmlDrift.outputDirectory, "about", "index.html"), "tampered", "utf8");
  assert.throws(() => runVerifiedGenerator(htmlDrift), /status 1|Command failed/);

  const hashDrift = await prepareVerifiedArtifacts([makeRoute()]);
  t.after(() => rmSync(hashDrift.temporaryDirectory, { recursive: true, force: true }));
  const manifest = JSON.parse(readFileSync(hashDrift.prerenderManifestPath, "utf8"));
  manifest.routes[0].contentHash = "f".repeat(64);
  writeFileSync(hashDrift.prerenderManifestPath, JSON.stringify(manifest), "utf8");
  assert.throws(() => runVerifiedGenerator(hashDrift), /status 1|Command failed/);

  const originMismatch = await prepareVerifiedArtifacts([makeRoute()]);
  t.after(() => rmSync(originMismatch.temporaryDirectory, { recursive: true, force: true }));
  assert.throws(
    () => runVerifiedGenerator(originMismatch, "--origin", "https://other.example.test"),
    /status 1|Command failed/,
  );
});

test("Chinese-only verified snapshots keep English fail-closed in robots", async (t) => {
  const prepared = await prepareVerifiedArtifacts([makeRoute()]);
  t.after(() => rmSync(prepared.temporaryDirectory, { recursive: true, force: true }));
  const artifacts = runVerifiedGenerator(prepared);
  assert.match(artifacts.robots, /^Disallow: \/en$/m);
  assert.doesNotMatch(artifacts.sitemap, /hreflang="en"/);
});

test("sitemap XML escapes canonical and alternate URLs", () => {
  const artifacts = renderPublicSeoArtifacts(
    "https://jewelry.example.test",
    [{
      pathname: "/collections/a&b",
      locale: "zh-CN",
      alternates: [{ hrefLang: "zh-CN", path: "/collections/a&b" }],
    }],
    { schemaVersion: 3 },
  );
  assert.match(artifacts.sitemap, /a&amp;b/);
  assert.doesNotMatch(artifacts.sitemap, /a&b/);
});

test("strict mode refuses legacy manifests without immutable pre-render evidence", () => {
  assert.throws(() => runGenerator(
    {
      schemaVersion: 1,
      routes: [{ path: "/", published: true, indexable: true, locale: "zh-CN" }],
    },
    "--origin",
    "https://jewelry.example.test",
    "--strict",
  ));
});

test("contentReady=false produces global noindex and safe public-route routing", async (t) => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "haichuan-public-seo-fallback-"));
  t.after(() => rmSync(temporaryDirectory, { recursive: true, force: true }));
  const outputDirectory = join(temporaryDirectory, "dist");
  mkdirSync(outputDirectory);
  const snapshot = createPublicSeoSnapshot({
    ...makeSnapshotInput([]),
    sourceStage: "preproduction",
    contentReady: false,
  });
  const snapshotPath = join(temporaryDirectory, "snapshot.json");
  writeFileSync(snapshotPath, JSON.stringify(snapshot), "utf8");
  await prerenderPublicRoutes({ snapshot, baseHtml: BASE_HTML, outDir: outputDirectory });
  const nginxMapPath = join(temporaryDirectory, "routes.conf");
  const nginxPolicyPath = join(temporaryDirectory, "policy.conf");
  execFileSync(process.execPath, [
    scriptPath,
    "--strict",
    "--origin", snapshot.origin,
    "--manifest", snapshotPath,
    "--prerender-manifest", join(outputDirectory, "prerendered-routes.json"),
    "--out-dir", outputDirectory,
    "--nginx-map", nginxMapPath,
    "--nginx-policy", nginxPolicyPath,
  ], { stdio: "pipe" });
  assert.match(readFileSync(join(outputDirectory, "robots.txt"), "utf8"), /^Disallow: \/$/m);
  assert.doesNotMatch(readFileSync(join(outputDirectory, "sitemap.xml"), "utf8"), /<loc>/);
  assert.match(readFileSync(nginxMapPath, "utf8"), /preproduction-not-ready\.html/);
  assert.match(readFileSync(nginxPolicyPath, "utf8"), /default "noindex, nofollow"/);
  assert.match(renderPublicSeoPolicy(false), /default "noindex, nofollow"/);
  assert.doesNotMatch(renderPublicSeoNginxMap([], { contentReady: false }), /index,follow/);
});
