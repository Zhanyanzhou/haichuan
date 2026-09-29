import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { verifyPublicPageSync } from "./verify-public-page-sync.mjs";

const pageDocuments = [
  ["about", "/about", "1"],
  ["catalog", "/catalog", "2"],
  ["contact", "/contact", "3"],
  ["custom", "/custom", "4"],
  ["home", "/", "5"],
  ["products", "/products", "6"],
].map(([pageKey, path, digit]) => ({ pageKey, path, contentHash: digit.repeat(64) }));

function manifest(contentReady = true) {
  return {
    schemaVersion: 9,
    publicSeo: {
      contentReady,
      pageDocuments: contentReady ? structuredClone(pageDocuments) : [],
    },
  };
}

function synchronizedFetch(overrides = {}) {
  return async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname === "/api/page-modules/document/published") {
      const pageKey = parsed.searchParams.get("pageKey");
      const page = pageDocuments.find((entry) => entry.pageKey === pageKey);
      const contentHash = overrides.apiHash?.[pageKey] ?? page?.contentHash;
      return Response.json({ data: { pageKey, locale: "zh-CN", status: "PUBLISHED", version: 1, contentHash } });
    }
    const page = pageDocuments.find((entry) => entry.path === parsed.pathname);
    const contentHash = overrides.htmlHash?.[page?.pageKey] ?? page?.contentHash;
    return new Response(
      `<meta name="published-content-hash" content="${contentHash}"><div id="root" data-prerendered-path="${parsed.pathname}" data-published-content-hash="${contentHash}"></div>`,
      { headers: { "content-type": "text/html" } },
    );
  };
}

test("pre-mutation API verification binds all six public PageDocuments to the signed manifest", async () => {
  const result = await verifyPublicPageSync({
    manifest: manifest(),
    baseUrl: "http://127.0.0.1:8081",
    mode: "api",
    fetchImpl: synchronizedFetch(),
  });
  assert.deepEqual(result, { pageCount: 6, mode: "api", skipped: false });
});

test("post-deploy verification rejects API or static HTML content drift", async () => {
  await assert.rejects(
    verifyPublicPageSync({
      manifest: manifest(),
      baseUrl: "http://127.0.0.1:8081",
      mode: "full",
      fetchImpl: synchronizedFetch({ htmlHash: { contact: "f".repeat(64) } }),
    }),
    { message: "PUBLIC_PAGE_SYNC_HTML_HASH_MISMATCH:contact" },
  );
  await assert.rejects(
    verifyPublicPageSync({
      manifest: manifest(),
      baseUrl: "http://127.0.0.1:8081",
      mode: "api",
      fetchImpl: synchronizedFetch({ apiHash: { products: "e".repeat(64) } }),
    }),
    { message: "PUBLIC_PAGE_SYNC_API_HASH_MISMATCH:products" },
  );
});

test("reconciliation rejects non-public response types, noindex HTML, and invalid versions", async () => {
  await assert.rejects(
    verifyPublicPageSync({
      manifest: manifest(),
      baseUrl: "http://127.0.0.1:8081",
      mode: "api",
      fetchImpl: async () => new Response("not-json", { headers: { "content-type": "text/plain" } }),
    }),
    { message: "PUBLIC_PAGE_SYNC_API_CONTENT_TYPE_INVALID" },
  );
  await assert.rejects(
    verifyPublicPageSync({
      manifest: manifest(),
      baseUrl: "http://127.0.0.1:8081",
      mode: "api",
      fetchImpl: async () => Response.json({ data: {
        pageKey: "about",
        locale: "zh-CN",
        status: "PUBLISHED",
        version: 0,
        contentHash: "1".repeat(64),
      } }),
    }),
    { message: "PUBLIC_PAGE_SYNC_API_HASH_MISMATCH:about" },
  );
  await assert.rejects(
    verifyPublicPageSync({
      manifest: manifest(),
      baseUrl: "http://127.0.0.1:8081",
      mode: "full",
      fetchImpl: async (url) => {
        const parsed = new URL(url);
        if (parsed.pathname.startsWith("/api/")) return synchronizedFetch()(url);
        return new Response("<html></html>", {
          headers: { "content-type": "text/html", "x-robots-tag": "noindex" },
        });
      },
    }),
    { message: "PUBLIC_PAGE_SYNC_HTML_NOINDEX_INVALID" },
  );
});

test("safe fallback carries no PageDocument hashes and skips the reconciliation", async () => {
  const result = await verifyPublicPageSync({
    manifest: manifest(false),
    baseUrl: "http://127.0.0.1:8081",
    fetchImpl: async () => { throw new Error("must not fetch"); },
  });
  assert.deepEqual(result, { pageCount: 0, mode: "full", skipped: true });
});

test("deployment checks the API before mutation and API plus HTML after replacement", () => {
  const deploy = readFileSync(new URL("./deploy-preproduction.sh", import.meta.url), "utf8");
  const operationsCompose = readFileSync(new URL("../docker-compose.operations.yml", import.meta.url), "utf8");
  const preflight = deploy.indexOf('run --rm release-preflight');
  const preMutation = deploy.indexOf('--mode api');
  const mutation = deploy.indexOf('mutation_started="true"');
  const replacement = deploy.indexOf('up -d --no-deps --wait server client backup', mutation);
  const postDeploy = deploy.indexOf('--mode full');
  assert.ok(preflight >= 0 && preflight < preMutation && preMutation < mutation);
  assert.ok(mutation < replacement && replacement < postDeploy);
  for (const pageKey of ["HOME", "ABOUT", "PRODUCTS", "CATALOG", "CUSTOM", "CONTACT"]) {
    assert.match(deploy, new RegExp(`export [^\\n]*PUBLIC_SEO_PAGE_HASH_${pageKey}|export PUBLIC_SEO_PAGE_HASH_${pageKey}`));
    assert.match(operationsCompose, new RegExp(`PUBLIC_SEO_PAGE_HASH_${pageKey}:`));
  }
});
