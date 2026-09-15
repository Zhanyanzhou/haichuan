import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createPublicSeoSnapshot } from "./export-public-seo-snapshot.mjs";
import { prerenderPublicRoutes } from "./prerender-public-routes.mjs";
import {
  BASE_HTML,
  makeRepresentativeRoutes,
  makeRoute,
  makeSnapshotInput,
} from "./public-seo-test-fixtures.mjs";

const exportScriptPath = fileURLToPath(new URL("./export-public-seo-snapshot.mjs", import.meta.url));
const prerenderScriptPath = fileURLToPath(new URL("./prerender-public-routes.mjs", import.meta.url));

test("pre-renders Chinese, legal, and product routes with full SEO metadata", async (t) => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "haichuan-prerender-"));
  t.after(() => rmSync(temporaryDirectory, { recursive: true, force: true }));
  const snapshot = createPublicSeoSnapshot(makeSnapshotInput(makeRepresentativeRoutes()));

  const manifest = await prerenderPublicRoutes({
    snapshot,
    baseHtml: BASE_HTML,
    outDir: temporaryDirectory,
  });

  assert.equal(manifest.snapshotHash, snapshot.snapshotHash);
  assert.deepEqual(
    manifest.routes.map((route) => route.file),
    ["about/index.html", "privacy/index.html", "products/HC-001/index.html"],
  );
  assert.ok(manifest.routes.every((route) => /^[a-f0-9]{64}$/.test(route.htmlHash)));

  const chineseHtml = readFileSync(join(temporaryDirectory, "about", "index.html"), "utf8");
  assert.match(chineseHtml, /<html lang="zh-CN">/);
  assert.match(chineseHtml, /<title>关于海川 &lt;珠宝&gt;<\/title>/);
  assert.match(chineseHtml, /<main><h1>关于我们<\/h1><p>Published body\.<\/p><\/main>/);
  assert.match(chineseHtml, /rel="canonical" href="https:\/\/jewelry\.example\.test\/about"/);
  assert.match(chineseHtml, /hreflang="zh-CN" href="https:\/\/jewelry\.example\.test\/about"/);
  assert.doesNotMatch(chineseHtml, /hreflang="en"|\/en\/about/);
  assert.match(chineseHtml, /hreflang="x-default"/);
  assert.match(chineseHtml, /property="og:image"/);
  assert.match(chineseHtml, /name="twitter:card" content="summary_large_image"/);
  assert.match(chineseHtml, /type="application\/ld\+json">/);
  assert.match(chineseHtml, /\\u003c珠宝>/);
  assert.match(chineseHtml, /data-prerendered="true"/);
  assert.match(chineseHtml, /data-prerendered-path="\/about"/);
  assert.match(chineseHtml, new RegExp(snapshot.routes.find((route) => route.path === "/about").contentHash));
  assert.equal((chineseHtml.match(/<title>/g) ?? []).length, 1);

  const productHtml = readFileSync(join(temporaryDirectory, "products", "HC-001", "index.html"), "utf8");
  assert.match(productHtml, /property="og:type" content="product"/);
  assert.match(productHtml, /"@type":"Product"/);
  assert.match(productHtml, /"sku":"HC-001"/);

  const onDiskManifest = JSON.parse(readFileSync(join(temporaryDirectory, "prerendered-routes.json"), "utf8"));
  assert.deepEqual(onDiskManifest, manifest);
});

test("home injects the reviewed first-fold document and preloads its same-origin hero", async (t) => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "haichuan-prerender-home-"));
  t.after(() => rmSync(temporaryDirectory, { recursive: true, force: true }));
  const home = makeRoute({
    path: "/",
    alternateKey: "page:home",
    title: "海川珠宝",
    renderedBodyHtml: "<main><h1>首页语义正文</h1></main>",
    bootstrapPageDocument: {
      pageKey: "home",
      puckData: {
        content: [{
          type: "首屏主视觉",
          props: {
            desktopImage: "/uploads/hero.jpg",
            mobileImage: "/uploads/hero-mobile.jpg",
            eyebrow: "海川珠宝",
            title: "光映新姿",
            subtitle: "以珠宝记录此刻。",
          },
        }],
      },
      metadata: {},
      status: "PUBLISHED",
    },
  });
  const snapshot = createPublicSeoSnapshot(makeSnapshotInput([home]));
  await prerenderPublicRoutes({ snapshot, baseHtml: BASE_HTML, outDir: temporaryDirectory });

  const html = readFileSync(join(temporaryDirectory, "index.html"), "utf8");
  assert.match(html, /data-public-first-fold="published"/);
  assert.match(html, /rel="preload" as="image" href="https:\/\/jewelry\.example\.test\/uploads\/hero\.jpg" fetchpriority="high"/);
  assert.match(html, /id="hc-published-page-document" type="application\/json"/);
  assert.match(html, /光映新姿/);
  assert.doesNotMatch(html, /首页语义正文/);
});

test("invalid or tampered snapshots produce no output", async (t) => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "haichuan-prerender-invalid-"));
  t.after(() => rmSync(temporaryRoot, { recursive: true, force: true }));
  const outputDirectory = join(temporaryRoot, "dist");
  const snapshot = createPublicSeoSnapshot(makeSnapshotInput([makeRoute()]));
  snapshot.routes[0].description = "tampered";

  await assert.rejects(
    prerenderPublicRoutes({ snapshot, baseHtml: BASE_HTML, outDir: outputDirectory }),
    /snapshot hash/i,
  );
  assert.equal(existsSync(outputDirectory), false);
});

test("missing mount points and document-level body markup fail before writing", async (t) => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "haichuan-prerender-contract-"));
  t.after(() => rmSync(temporaryRoot, { recursive: true, force: true }));
  const snapshot = createPublicSeoSnapshot(makeSnapshotInput([makeRoute()]));
  const outputDirectory = join(temporaryRoot, "missing-root");

  await assert.rejects(
    prerenderPublicRoutes({
      snapshot,
      baseHtml: "<!doctype html><html><head></head><body></body></html>",
      outDir: outputDirectory,
    }),
    /mount point/i,
  );
  assert.equal(existsSync(outputDirectory), false);

  assert.throws(
    () => createPublicSeoSnapshot(makeSnapshotInput([{
      ...makeRoute(),
      renderedBodyHtml: "<script>alert(1)</script>",
    }])),
    /document-level markup/i,
  );
});

test("export and pre-render command-line entrypoints create a verified route tree", (t) => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "haichuan-prerender-cli-"));
  t.after(() => rmSync(temporaryRoot, { recursive: true, force: true }));
  const inputPath = join(temporaryRoot, "facts.json");
  const snapshotPath = join(temporaryRoot, "snapshot.json");
  const baseHtmlPath = join(temporaryRoot, "base.html");
  const outputDirectory = join(temporaryRoot, "dist");
  writeFileSync(inputPath, JSON.stringify(makeSnapshotInput([makeRoute()])), "utf8");
  writeFileSync(baseHtmlPath, BASE_HTML, "utf8");

  execFileSync(
    process.execPath,
    [exportScriptPath, "--input", inputPath, "--output", snapshotPath],
    { stdio: "pipe" },
  );
  execFileSync(
    process.execPath,
    [
      prerenderScriptPath,
      "--snapshot",
      snapshotPath,
      "--base-html",
      baseHtmlPath,
      "--out-dir",
      outputDirectory,
    ],
    { stdio: "pipe" },
  );

  assert.ok(existsSync(join(outputDirectory, "about", "index.html")));
  assert.ok(existsSync(join(outputDirectory, "prerendered-routes.json")));
});
