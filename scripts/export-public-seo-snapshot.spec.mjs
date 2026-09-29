import assert from "node:assert/strict";
import test from "node:test";

import {
  createPublicSeoSnapshot,
  validatePublicSeoSnapshot,
} from "./export-public-seo-snapshot.mjs";
import {
  CONTENT_HASHES,
  makeRepresentativeRoutes,
  makeRoute,
  makeSnapshotInput,
} from "./public-seo-test-fixtures.mjs";

test("exports a canonical immutable Chinese-only snapshot", () => {
  const snapshot = createPublicSeoSnapshot(makeSnapshotInput(makeRepresentativeRoutes()));
  assert.equal(snapshot.schemaVersion, 3);
  assert.equal(snapshot.sourceStage, "production");
  assert.equal(snapshot.contentReady, true);
  assert.match(snapshot.snapshotHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(validatePublicSeoSnapshot(snapshot), snapshot);

  const chinese = snapshot.routes.find((route) => route.path === "/about");
  const expectedAlternates = [
    { locale: "zh-CN", hrefLang: "zh-CN", path: "/about" },
    { locale: "zh-CN", hrefLang: "x-default", path: "/about" },
  ];
  assert.deepEqual(chinese.alternates, expectedAlternates);
});

test("allows only an empty, non-publishable preproduction fallback snapshot", () => {
  const fallback = createPublicSeoSnapshot({
    ...makeSnapshotInput([]),
    sourceStage: "preproduction",
    contentReady: false,
  });
  assert.equal(fallback.contentReady, false);
  assert.deepEqual(fallback.routes, []);
  assert.deepEqual(validatePublicSeoSnapshot(fallback), fallback);
  assert.throws(
    () => createPublicSeoSnapshot({ ...makeSnapshotInput([]), contentReady: false }),
    /Only preproduction/i,
  );
  assert.throws(
    () => createPublicSeoSnapshot({ ...makeSnapshotInput([makeRoute()]), sourceStage: "preproduction", contentReady: false }),
    /must not contain publishable routes/i,
  );
  assert.throws(
    () => createPublicSeoSnapshot(makeSnapshotInput([])),
    /must contain at least one reviewed route/i,
  );
});

test("binds the source stage into canonical evidence and rejects unsupported stages", () => {
  const production = createPublicSeoSnapshot(makeSnapshotInput([makeRoute()]));
  const preproductionInput = makeSnapshotInput([makeRoute()]);
  preproductionInput.sourceStage = "preproduction";
  const preproduction = createPublicSeoSnapshot(preproductionInput);
  assert.equal(preproduction.sourceStage, "preproduction");
  assert.notEqual(preproduction.snapshotHash, production.snapshotHash);
  assert.throws(
    () => createPublicSeoSnapshot({ ...makeSnapshotInput([makeRoute()]), sourceStage: "staging" }),
    /sourceStage must be preproduction or production/,
  );
});

test("fails closed on source or per-route before/after hash drift", () => {
  const sourceDrift = makeSnapshotInput([makeRoute()]);
  sourceDrift.sourceSnapshotHashAfter = "f".repeat(64);
  assert.throws(() => createPublicSeoSnapshot(sourceDrift), /source facts changed/i);

  const routeDrift = makeRoute({ contentHashAfter: "3".repeat(64) });
  assert.throws(
    () => createPublicSeoSnapshot(makeSnapshotInput([routeDrift])),
    /content hash changed/i,
  );
});

test("rejects insecure origins, non-canonical routes, private paths, and duplicate paths", () => {
  const insecure = makeSnapshotInput([makeRoute()]);
  insecure.origin = "http://jewelry.example.test";
  assert.throws(() => createPublicSeoSnapshot(insecure), /HTTPS origin/i);

  assert.throws(
    () => createPublicSeoSnapshot(makeSnapshotInput([makeRoute({ canonicalPath: "/company" })])),
    /canonicalPath/i,
  );
  assert.throws(
    () => createPublicSeoSnapshot(makeSnapshotInput([makeRoute({ path: "/about$uri", canonicalPath: "/about$uri" })])),
    /Nginx-safe ASCII segments/i,
  );
  assert.throws(
    () => createPublicSeoSnapshot(makeSnapshotInput([makeRoute({ path: "/about%0a", canonicalPath: "/about%0a" })])),
    /Nginx-safe ASCII segments/i,
  );
  assert.throws(
    () => createPublicSeoSnapshot(makeSnapshotInput([makeRoute({ path: "/About", canonicalPath: "/About" })])),
    /must be lowercase/i,
  );
  assert.throws(
    () => createPublicSeoSnapshot(makeSnapshotInput([makeRoute({ path: "/en/cart", locale: "en" })])),
    /unsupported route locale/i,
  );
  for (const path of [
    "/api/health",
    "/assets/runtime.js",
    "/images/brand.jpg",
    "/svg/icon.svg",
    "/uploads/page-assets/example.jpg",
    "/.well-known/acme-challenge/probe",
    "/robots.txt",
    "/favicon.svg",
    "/index.html",
    "/sitemap.xml",
    "/search",
    "/en/api/health",
  ]) {
    assert.throws(
      () => createPublicSeoSnapshot(makeSnapshotInput([makeRoute({
        path,
        canonicalPath: path,
        ...(path.startsWith("/en/") ? { locale: "en" } : {}),
      })])),
      path.startsWith("/en/") ? /unsupported route locale/i : /reserved infrastructure route/i,
      path,
    );
  }
  assert.throws(
    () => createPublicSeoSnapshot(makeSnapshotInput([makeRoute({
      path: "/about/index.html",
      canonicalPath: "/about/index.html",
    })])),
    /reserved physical index route/i,
  );
  for (const path of ["/en/contact", "/en/privacy", "/en/products/HC-001"]) {
    assert.throws(
      () => createPublicSeoSnapshot(makeSnapshotInput([makeRoute({
        path,
        canonicalPath: path,
        locale: "en",
      })])),
      /unsupported route locale/i,
      path,
    );
  }
  assert.throws(
    () => createPublicSeoSnapshot(makeSnapshotInput([makeRoute(), makeRoute()])),
    /duplicate public route/i,
  );
});

test("English routes are retired even when content was human reviewed", () => {
  const machineTranslated = makeRoute({
    path: "/en/about",
    locale: "en",
    contentSource: "machine-translated",
  });
  assert.throws(
    () => createPublicSeoSnapshot(makeSnapshotInput([makeRoute(), machineTranslated])),
    /unsupported route locale/i,
  );

  const englishOnly = makeRoute({ path: "/en/about", locale: "en" });
  assert.throws(
    () => createPublicSeoSnapshot(makeSnapshotInput([englishOnly])),
    /unsupported route locale/i,
  );
});

test("requires complete SEO fields and safe rendered body markup", () => {
  assert.throws(
    () => createPublicSeoSnapshot(makeSnapshotInput([{ ...makeRoute(), title: "" }])),
    /title/i,
  );
  assert.throws(
    () => createPublicSeoSnapshot(makeSnapshotInput([{ ...makeRoute(), shareImage: "" }])),
    /shareImage/i,
  );
  assert.throws(
    () => createPublicSeoSnapshot(makeSnapshotInput([{
      ...makeRoute(),
      renderedBodyHtml: '<main onclick="steal()">正文</main>',
    }])),
    /executable/i,
  );
  assert.throws(
    () => createPublicSeoSnapshot(makeSnapshotInput([{
      ...makeRoute(),
      lastModified: "2026-02-31",
    }])),
    /real YYYY-MM-DD date/i,
  );
});

test("product routes accept only a stable public code bound to Product JSON-LD", () => {
  const numeric = makeRoute({
    path: "/products/123",
    kind: "product",
    alternateKey: "product:123",
    productCode: "123",
  });
  assert.throws(
    () => createPublicSeoSnapshot(makeSnapshotInput([numeric])),
    /non-numeric stable public product code/i,
  );

  const mismatch = makeRoute({
    path: "/products/HC-002",
    kind: "product",
    alternateKey: "product:hc-001",
    productCode: "HC-001",
  });
  assert.throws(
    () => createPublicSeoSnapshot(makeSnapshotInput([mismatch])),
    /path must use its stable product code/i,
  );

  const missingProductSchema = makeRoute({
    path: "/products/HC-001",
    kind: "product",
    alternateKey: "product:hc-001",
    productCode: "HC-001",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
    },
  });
  assert.throws(
    () => createPublicSeoSnapshot(makeSnapshotInput([missingProductSchema])),
    /Product structured data/i,
  );
});

test("snapshot validation detects any content or derived-field tampering", () => {
  const snapshot = createPublicSeoSnapshot(makeSnapshotInput([makeRoute()]));
  const tampered = structuredClone(snapshot);
  tampered.routes[0].title = "被篡改的标题";
  assert.throws(() => validatePublicSeoSnapshot(tampered), /hash does not match/i);

  const alternateDrift = structuredClone(snapshot);
  alternateDrift.routes[0].alternates[0].path = "/company";
  assert.throws(() => validatePublicSeoSnapshot(alternateDrift), /derived-field drift|hash does not match/i);
});
