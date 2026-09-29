import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const SHA256 = /^[a-f0-9]{64}$/;
const REQUIRED_PAGE_PATHS = Object.freeze({
  about: "/about",
  catalog: "/catalog",
  contact: "/contact",
  custom: "/custom",
  home: "/",
  products: "/products",
});

function fail(code) {
  throw new Error(code);
}

function normalizeBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail("PUBLIC_PAGE_SYNC_BASE_URL_INVALID");
  }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash) {
    fail("PUBLIC_PAGE_SYNC_BASE_URL_INVALID");
  }
  return url;
}

export function validateManifestPageDocuments(manifest) {
  const seo = manifest?.publicSeo;
  if (manifest?.schemaVersion !== 9 || !seo || !Array.isArray(seo.pageDocuments)) {
    fail("PUBLIC_PAGE_SYNC_MANIFEST_INVALID");
  }
  if (seo.contentReady !== true) {
    if (seo.pageDocuments.length !== 0) fail("PUBLIC_PAGE_SYNC_FALLBACK_PAGES_INVALID");
    return [];
  }
  const expectedKeys = Object.keys(REQUIRED_PAGE_PATHS);
  if (seo.pageDocuments.length !== expectedKeys.length) fail("PUBLIC_PAGE_SYNC_PAGE_SET_INVALID");
  const seen = new Set();
  for (let index = 0; index < seo.pageDocuments.length; index += 1) {
    const page = seo.pageDocuments[index];
    const expectedKey = expectedKeys[index];
    if (
      !page
      || typeof page !== "object"
      || Array.isArray(page)
      || Object.keys(page).sort().join("\0") !== ["contentHash", "pageKey", "path"].sort().join("\0")
      || page.pageKey !== expectedKey
      || page.path !== REQUIRED_PAGE_PATHS[expectedKey]
      || !SHA256.test(page.contentHash ?? "")
      || seen.has(page.pageKey)
    ) fail("PUBLIC_PAGE_SYNC_PAGE_SET_INVALID");
    seen.add(page.pageKey);
  }
  return seo.pageDocuments;
}

function apiDocument(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value.data && typeof value.data === "object" && !Array.isArray(value.data)
    ? value.data
    : value;
  return candidate;
}

async function fetchChecked(fetchImpl, url, label) {
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { Accept: label === "api" ? "application/json" : "text/html" },
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    fail(`PUBLIC_PAGE_SYNC_${label.toUpperCase()}_UNAVAILABLE`);
  }
  if (!response.ok) fail(`PUBLIC_PAGE_SYNC_${label.toUpperCase()}_HTTP_${response.status}`);
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (label === "api" && !contentType.includes("application/json")) {
    fail("PUBLIC_PAGE_SYNC_API_CONTENT_TYPE_INVALID");
  }
  if (label === "html") {
    if (!contentType.includes("text/html")) fail("PUBLIC_PAGE_SYNC_HTML_CONTENT_TYPE_INVALID");
    if ((response.headers.get("x-robots-tag") ?? "").toLowerCase().includes("noindex")) {
      fail("PUBLIC_PAGE_SYNC_HTML_NOINDEX_INVALID");
    }
  }
  return response;
}

export async function verifyPublicPageSync({
  manifest,
  baseUrl,
  mode = "full",
  fetchImpl = fetch,
}) {
  if (mode !== "api" && mode !== "full") fail("PUBLIC_PAGE_SYNC_MODE_INVALID");
  const pages = validateManifestPageDocuments(manifest);
  if (pages.length === 0) return { pageCount: 0, mode, skipped: true };
  const base = normalizeBaseUrl(baseUrl);

  for (const page of pages) {
    const apiUrl = new URL("/api/page-modules/document/published", base);
    apiUrl.searchParams.set("pageKey", page.pageKey);
    apiUrl.searchParams.set("locale", "zh-CN");
    const apiResponse = await fetchChecked(fetchImpl, apiUrl, "api");
    let payload;
    try {
      payload = apiDocument(await apiResponse.json());
    } catch {
      fail("PUBLIC_PAGE_SYNC_API_JSON_INVALID");
    }
    if (
      payload?.pageKey !== page.pageKey
      || payload?.locale !== "zh-CN"
      || payload?.status !== "PUBLISHED"
      || !Number.isSafeInteger(payload?.version)
      || payload.version <= 0
      || payload?.contentHash !== page.contentHash
    ) fail(`PUBLIC_PAGE_SYNC_API_HASH_MISMATCH:${page.pageKey}`);

    if (mode === "full") {
      const htmlResponse = await fetchChecked(fetchImpl, new URL(page.path, base), "html");
      const html = await htmlResponse.text();
      if (
        !html.includes(`name="published-content-hash" content="${page.contentHash}"`)
        || !html.includes(`data-published-content-hash="${page.contentHash}"`)
        || !html.includes(`data-prerendered-path="${page.path}"`)
      ) fail(`PUBLIC_PAGE_SYNC_HTML_HASH_MISMATCH:${page.pageKey}`);
    }
  }

  return { pageCount: pages.length, mode, skipped: false };
}

function parseArguments(argv) {
  const options = { manifest: "", baseUrl: "", mode: "full" };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index + 1];
    if (argv[index] === "--manifest") options.manifest = value, index += 1;
    else if (argv[index] === "--base-url") options.baseUrl = value, index += 1;
    else if (argv[index] === "--mode") options.mode = value, index += 1;
    else fail(`PUBLIC_PAGE_SYNC_ARGUMENT_INVALID:${argv[index]}`);
  }
  if (!options.manifest || !options.baseUrl) fail("PUBLIC_PAGE_SYNC_ARGUMENTS_INCOMPLETE");
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const manifest = JSON.parse(await readFile(options.manifest, "utf8"));
  const result = await verifyPublicPageSync({ manifest, baseUrl: options.baseUrl, mode: options.mode });
  process.stdout.write(result.skipped
    ? `public page sync skipped: contentReady=false\n`
    : `public page sync verified: ${result.pageCount} page(s), mode=${result.mode}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
