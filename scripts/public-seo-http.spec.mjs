import assert from "node:assert/strict";
import test from "node:test";

import {
  assertRelativeLocation,
  assertSafeNotFoundHtml,
} from "./verify-public-seo-http.mjs";

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
