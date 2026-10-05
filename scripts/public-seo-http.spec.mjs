import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import test from "node:test";

import {
  assertPublishedSnapshotHtml,
  assertRelativeLocation,
  assertRepresentativeSnapshotCoverage,
  assertSafeFallbackHtml,
  assertSafeNotFoundHtml,
  assertSafeSpaShellHtml,
  fetchManual,
  matchesPublishedRouteBody,
} from "./verify-public-seo-http.mjs";
import { createPublicSeoSnapshot } from "./export-public-seo-snapshot.mjs";
import { renderPrerenderedHtml } from "./prerender-public-routes.mjs";
import { BASE_HTML, makeRepresentativeRoutes, makeRoute, makeSnapshotInput } from "./public-seo-test-fixtures.mjs";

test("loopback HTTP probes send the immutable snapshot hostname", async (t) => {
  const server = createServer((request, response) => {
    response.statusCode = request.headers.host === "jewelry.example.test" ? 200 : 421;
    response.end(request.headers.host);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetchManual(
    `http://127.0.0.1:${server.address().port}`,
    "/about",
    "jewelry.example.test",
  );
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "jewelry.example.test");
});

test("unpublished and private SPA shells retain noindex without published home markup", () => {
  assert.doesNotThrow(() => assertSafeSpaShellHtml(BASE_HTML, "/customer"));
  assert.throws(
    () => assertSafeSpaShellHtml(BASE_HTML.replace("noindex, nofollow", "index, follow"), "/contact"),
    /exposed publishable HTML/,
  );
  assert.throws(
    () => assertSafeSpaShellHtml(BASE_HTML.replace('<div id="root"></div>', '<div id="root" data-prerendered="true"></div>'), "/customer"),
    /exposed publishable HTML/,
  );
});

test("HTTP SEO verification accepts representative published HTML", () => {
  const snapshot = createPublicSeoSnapshot(makeSnapshotInput(makeRepresentativeRoutes()));
  for (const route of snapshot.routes) {
    const html = renderPrerenderedHtml(BASE_HTML, snapshot, route);
    assert.doesNotThrow(() => assertPublishedSnapshotHtml(html, route, snapshot.origin));
  }
});

test("HTTP SEO verification accepts and checks every structured-data node", () => {
  const routeInput = makeRoute({ structuredData: [
    { "@context": "https://schema.org", "@type": "WebPage", name: "关于海川" },
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [] },
  ] });
  const snapshot = createPublicSeoSnapshot(makeSnapshotInput([routeInput]));
  const route = snapshot.routes[0];
  const html = renderPrerenderedHtml(BASE_HTML, snapshot, route);
  assert.doesNotThrow(() => assertPublishedSnapshotHtml(html, route, snapshot.origin));
  assert.throws(
    () => assertPublishedSnapshotHtml(html.replace('"@type":"BreadcrumbList"', '"@type":"Article"'), route, snapshot.origin),
    /raw HTML does not match its immutable SEO snapshot/,
  );
});

test("HTTP SEO verification rejects metadata drift from the immutable snapshot", () => {
  const snapshot = createPublicSeoSnapshot(makeSnapshotInput([makeRoute()]));
  const route = snapshot.routes[0];
  const html = renderPrerenderedHtml(BASE_HTML, snapshot, route);
  assert.doesNotThrow(() => assertPublishedSnapshotHtml(html, route, snapshot.origin));

  for (const [original, replacement] of [
    ["<title>关于海川</title>", "<title>旧标题</title>"],
    ['name="description" content="经人工审核的品牌介绍。"', 'name="description" content="旧描述"'],
    ['property="og:title" content="关于海川"', 'property="og:title" content="旧标题"'],
    ['property="og:description" content="经人工审核的品牌介绍。"', 'property="og:description" content="旧描述"'],
    ['property="og:image" content="https://cdn.example.test/seo/share.jpg"', 'property="og:image" content="https://cdn.example.test/seo/old.jpg"'],
    ['name="twitter:image" content="https://cdn.example.test/seo/share.jpg"', 'name="twitter:image" content="https://cdn.example.test/seo/old.jpg"'],
    ['"@type":"WebPage"', '"@type":"Article"'],
  ]) {
    assert.ok(html.includes(original));
    assert.throws(
      () => assertPublishedSnapshotHtml(html.replace(original, replacement), route, snapshot.origin),
      /raw HTML does not match its immutable SEO snapshot/,
    );
  }
});

test("representative HTTP verification follows the Chinese-only publication contract", () => {
  const chineseOnly = [
    { kind: "page", locale: "zh-CN" },
    { kind: "legal", locale: "zh-CN" },
    { kind: "product", locale: "zh-CN" },
  ];
  assert.doesNotThrow(() => assertRepresentativeSnapshotCoverage(chineseOnly));
  assert.throws(
    () => assertRepresentativeSnapshotCoverage(chineseOnly.slice(0, 2)),
    /Chinese-only page, legal, and product fixtures/,
  );
  assert.throws(
    () => assertRepresentativeSnapshotCoverage([
      ...chineseOnly,
      { kind: "page", locale: "en" },
    ]),
    /Chinese-only page, legal, and product fixtures/,
  );
});

test("HTTP SEO verification accepts only same-origin relative redirects", () => {
  assert.doesNotThrow(() => assertRelativeLocation("/about?seo-probe=1", "/about", "?seo-probe=1"));

  for (const unsafeLocation of [
    "http://jewelry.example.test:8081/about?seo-probe=1",
    "https://jewelry.example.test/about?seo-probe=1",
    "//attacker.example/about?seo-probe=1",
  ]) {
    assert.throws(
      () => assertRelativeLocation(unsafeLocation, "/about", "?seo-probe=1"),
      /same-origin relative Location/,
    );
  }
});

test("HTTP SEO verification accepts only an explicit non-publishable fallback document", () => {
  const safe = '<html lang="zh-CN"><head><meta name="robots" content="noindex, nofollow"></head><body><main data-content-ready="false">预发布</main></body></html>';
  assert.doesNotThrow(() => assertSafeFallbackHtml(safe, "/"));
  assert.throws(() => assertSafeFallbackHtml(safe.replace("false", "true"), "/"), /contentReady=false/);
  assert.throws(() => assertSafeFallbackHtml(safe.replace("</head>", '<link rel="canonical" href="https://example.test/"></head>'), "/"), /publishable SEO metadata/);
});

test("HTTP SEO verification accepts the published home bootstrap instead of requiring fallback body text", () => {
  const route = {
    path: "/",
    renderedBodyHtml: "<main>semantic fallback</main>",
    bootstrapPageDocument: { pageKey: "home" },
  };
  const home = '<main data-public-first-fold="published"></main><script id="hc-published-page-document" type="application/json">{}</script>';
  assert.equal(matchesPublishedRouteBody(home, route), true);
  assert.equal(matchesPublishedRouteBody(route.renderedBodyHtml, route), false);
  assert.equal(matchesPublishedRouteBody(route.renderedBodyHtml, { ...route, bootstrapPageDocument: undefined }), true);
});

test("HTTP SEO verification preserves the exact redirect path and query", () => {
  assert.throws(
    () => assertRelativeLocation("/catalog?query=ring", "/catalog", "?query=bracelet"),
    /Redirect target drifted/,
  );
  assert.throws(
    () => assertRelativeLocation("/catalog#internal", "/catalog", ""),
    /Redirect target drifted/,
  );
  assert.throws(
    () => assertRelativeLocation(null, "/catalog", ""),
    /did not provide Location/,
  );
});

test("HTTP SEO verification retires English unpublished paths with a same-origin 308", () => {
  const source = readFileSync(new URL("./verify-public-seo-http.mjs", import.meta.url), "utf8");
  assert.match(source, /const retiredEnglishPath = "\/en\/__seo-unpublished-probe__";/);
  assert.match(source, /retiredEnglish\.status !== 308/);
  assert.match(source, /assertLocation\(retiredEnglish, "\/__seo-unpublished-probe__", ""\)/);
  assert.match(source, /"\/en\/\/__seo-malformed-probe__"/);
  assert.match(source, /"\/en\/%2F%2F__seo-malformed-probe__"/);
  assert.doesNotMatch(source, /\["\/en\/__seo-unpublished-probe__", 404, "en"\]/);
});

test("HTTP SEO verification requires locale-correct noindex 404 documents", () => {
  const englishNotFound = [
    '<!doctype html><html lang="en"><head>',
    '<meta name="robots" content="noindex,nofollow">',
    '</head><body><a href="/en">English home</a></body></html>',
  ].join("");
  assert.doesNotThrow(() => assertSafeNotFoundHtml(englishNotFound, "en", "/en/missing"));
  assert.throws(
    () => assertSafeNotFoundHtml(englishNotFound, "zh-CN", "/missing"),
    /document language zh-CN/,
  );
  assert.throws(
    () => assertSafeNotFoundHtml(
      '<html lang="en"><head><meta name="robots" content="index,follow"></head><body><a href="/en">Home</a></body></html>',
      "en",
      "/en/missing",
    ),
    /did not remain noindex,nofollow/,
  );
});
