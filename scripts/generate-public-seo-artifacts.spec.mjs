import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { renderPublicSeoArtifacts } from "./generate-public-seo-artifacts.mjs";

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
    "--strict",
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


