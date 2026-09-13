import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const PRODUCT_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,49}$/;
const PRIVATE_PATH_PREFIXES = [
  "/admin",
  "/cart",
  "/checkout",
  "/customer",
  "/partner",
  "/preview",
  "/__templates",
];
const RESERVED_PUBLIC_PATH_PREFIXES = [
  "/api",
  "/assets",
  "/images",
  "/svg",
  "/uploads",
  "/.well-known",
];
const RESERVED_PUBLIC_PATHS = new Set([
  "/404.html",
  "/404-en.html",
  "/favicon.ico",
  "/favicon.svg",
  "/index.html",
  "/robots.txt",
  "/search",
  "/sitemap.xml",
]);
const ENGLISH_PUBLIC_CONTENT_PATHS = new Set(["/", "/about", "/products", "/custom"]);
const ROUTE_KINDS = new Set(["page", "legal", "product"]);
const CONTENT_SOURCES = new Set(["human-reviewed", "verified-facts"]);

function fail(message) {
  throw new Error(message);
}

function assertRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
  return value;
}

function assertExactKeys(value, allowed, label) {
  const extras = Object.keys(value).filter((key) => !allowed.has(key));
  if (extras.length > 0) fail(`${label} contains unsupported field(s): ${extras.join(", ")}.`);
}

export function normalizeProductionOrigin(value) {
  if (typeof value !== "string" || !value.trim()) {
    fail("Snapshot origin must be an explicit HTTPS origin.");
  }
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    fail("Snapshot origin must be a valid URL.");
  }
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || url.pathname !== "/"
    || url.search
    || url.hash
  ) {
    fail("Snapshot origin must be an HTTPS origin without credentials, path, query, or fragment.");
  }
  return url.origin;
}

export function normalizePublicPath(value, label = "Route path") {
  if (
    typeof value !== "string"
    || !value.startsWith("/")
    || value.startsWith("//")
    || /[?#\\\u0000-\u001f]/.test(value)
    || (value.length > 1 && value.endsWith("/"))
    || value.includes("//")
    || /%2f|%5c/i.test(value)
    || !/^\/(?:[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*)?$/.test(value)
  ) {
    fail(`${label} must be a canonical absolute path made of Nginx-safe ASCII segments without a query, fragment, backslash, duplicate slash, or trailing slash.`);
  }
  let normalized;
  try {
    normalized = new URL(value, "https://snapshot.invalid").pathname;
    decodeURIComponent(value);
  } catch {
    fail(`${label} contains invalid URL encoding.`);
  }
  if (normalized !== value || /(?:^|\/)\.{1,2}(?:\/|$)/.test(value)) {
    fail(`${label} is not canonical.`);
  }
  return value;
}

function localizedContentPath(pathname, locale) {
  if (locale === "en") {
    if (pathname !== "/en" && !pathname.startsWith("/en/")) {
      fail(`English route ${pathname} must use the /en prefix.`);
    }
    return pathname === "/en" ? "/" : pathname.slice(3);
  }
  if (locale !== "zh-CN") fail(`Unsupported route locale: ${String(locale)}.`);
  if (pathname === "/en" || pathname.startsWith("/en/")) {
    fail(`Chinese route ${pathname} must not use the /en prefix.`);
  }
  return pathname;
}

function assertPublicPath(pathname, locale) {
  const contentPath = localizedContentPath(pathname, locale).toLowerCase();
  if (PRIVATE_PATH_PREFIXES.some(
    (prefix) => contentPath === prefix || contentPath.startsWith(`${prefix}/`),
  )) {
    fail(`Private route ${pathname} cannot enter a public SEO snapshot.`);
  }
  if (
    RESERVED_PUBLIC_PATHS.has(contentPath)
    || RESERVED_PUBLIC_PATH_PREFIXES.some(
      (prefix) => contentPath === prefix || contentPath.startsWith(`${prefix}/`),
    )
  ) {
    fail(`Reserved infrastructure route ${pathname} cannot enter a public SEO snapshot.`);
  }
  if (contentPath.endsWith("/index.html")) {
    fail(`Reserved physical index route ${pathname} cannot enter a public SEO snapshot.`);
  }
  if (locale === "en" && !ENGLISH_PUBLIC_CONTENT_PATHS.has(contentPath)) {
    fail(`English route ${pathname} is not available in the public application.`);
  }
}

function normalizeText(value, label, maxLength) {
  if (typeof value !== "string") fail(`${label} must be text.`);
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized || normalized.length > maxLength) {
    fail(`${label} must contain 1-${maxLength} characters.`);
  }
  return normalized;
}

function normalizeHash(value, label) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    fail(`${label} must be a lowercase SHA-256 value.`);
  }
  return value;
}

function normalizeLastModified(value, label) {
  const parsed = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00Z`)
    : null;
  if (
    !parsed
    || Number.isNaN(parsed.getTime())
    || parsed.toISOString().slice(0, 10) !== value
  ) {
    fail(`${label} must use a real YYYY-MM-DD date.`);
  }
  return value;
}

function normalizeShareImage(value, label) {
  if (typeof value !== "string" || !value.trim()) fail(`${label} is required.`);
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    fail(`${label} must be an absolute HTTPS URL.`);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    fail(`${label} must be an absolute HTTPS URL without credentials or a fragment.`);
  }
  return url.href;
}

function normalizeRenderedBody(value, label) {
  if (typeof value !== "string" || !value.trim()) fail(`${label} is required.`);
  const html = value.trim();
  const forbidden = [
    /<(?:html|head|body|base|meta|link|script|iframe|object|embed)\b/i,
    /\son[a-z]+\s*=/i,
    /(?:href|src)\s*=\s*["']?\s*javascript:/i,
  ];
  if (forbidden.some((pattern) => pattern.test(html))) {
    fail(`${label} contains executable or document-level markup.`);
  }
  return html;
}

function normalizeStructuredData(value, label) {
  if (value === undefined) return undefined;
  const nodes = Array.isArray(value) ? value : [value];
  if (nodes.length === 0) fail(`${label} must not be empty.`);
  for (const [index, node] of nodes.entries()) {
    const record = assertRecord(node, `${label}[${index}]`);
    if (record["@context"] !== "https://schema.org") {
      fail(`${label}[${index}] must use https://schema.org.`);
    }
    const type = record["@type"];
    if (
      !(typeof type === "string" && type.trim())
      && !(Array.isArray(type) && type.length > 0 && type.every((entry) => typeof entry === "string" && entry.trim()))
    ) {
      fail(`${label}[${index}] must declare a schema.org type.`);
    }
  }
  try {
    JSON.stringify(value);
  } catch {
    fail(`${label} must be JSON serializable.`);
  }
  return value;
}

function normalizeRoute(entry, index) {
  const label = `routes[${index}]`;
  const value = assertRecord(entry, label);
  assertExactKeys(value, new Set([
    "path",
    "canonicalPath",
    "locale",
    "kind",
    "alternateKey",
    "published",
    "indexable",
    "contentSource",
    "contentHashBefore",
    "contentHashAfter",
    "lastModified",
    "siteName",
    "title",
    "description",
    "shareImage",
    "renderedBodyHtml",
    "structuredData",
    "productCode",
  ]), label);

  const pathname = normalizePublicPath(value.path, `${label}.path`);
  const canonicalPath = normalizePublicPath(value.canonicalPath, `${label}.canonicalPath`);
  if (canonicalPath !== pathname) fail(`${label}.canonicalPath must equal its canonical route path.`);
  assertPublicPath(pathname, value.locale);
  if (!ROUTE_KINDS.has(value.kind)) fail(`${label}.kind is unsupported.`);
  if (value.published !== true || value.indexable !== true) {
    fail(`${label} must be explicitly published and indexable.`);
  }
  if (!CONTENT_SOURCES.has(value.contentSource)) {
    fail(`${label}.contentSource must be human-reviewed or verified-facts; machine translation and fallback content are not publishable.`);
  }
  if (value.locale === "en" && value.contentSource !== "human-reviewed") {
    fail(`${label} English content must be human-reviewed.`);
  }
  if (value.kind !== "product" && value.contentSource !== "human-reviewed") {
    fail(`${label} authored page content must be human-reviewed.`);
  }

  const contentHashBefore = normalizeHash(value.contentHashBefore, `${label}.contentHashBefore`);
  const contentHashAfter = normalizeHash(value.contentHashAfter, `${label}.contentHashAfter`);
  if (contentHashBefore !== contentHashAfter) {
    fail(`${label} content hash changed while the snapshot was being exported.`);
  }

  const alternateKey = normalizeText(value.alternateKey, `${label}.alternateKey`, 120);
  if (!/^[a-z0-9][a-z0-9:._-]*$/.test(alternateKey)) {
    fail(`${label}.alternateKey must use lowercase stable identifier characters.`);
  }
  const contentPath = localizedContentPath(pathname, value.locale);
  if (value.kind !== "product" && contentPath !== contentPath.toLowerCase()) {
    fail(`${label}.path must be lowercase for a non-product public route.`);
  }
  let productCode;
  if (value.kind === "product") {
    productCode = normalizeText(value.productCode, `${label}.productCode`, 50);
    if (!PRODUCT_CODE_PATTERN.test(productCode) || /^\d+$/.test(productCode)) {
      fail(`${label}.productCode must be a non-numeric stable public product code.`);
    }
    const expectedPrefix = value.locale === "en" ? "/products/" : "/products/";
    if (!contentPath.startsWith(expectedPrefix) || decodeURIComponent(contentPath.slice(expectedPrefix.length)) !== productCode) {
      fail(`${label}.path must use its stable product code.`);
    }
  } else if (value.productCode !== undefined) {
    fail(`${label}.productCode is only valid for product routes.`);
  }

  const structuredData = normalizeStructuredData(value.structuredData, `${label}.structuredData`);
  if (value.kind === "product") {
    const nodes = Array.isArray(structuredData) ? structuredData : [structuredData];
    if (!structuredData || !nodes.some((node) => node?.["@type"] === "Product" && node.sku === productCode)) {
      fail(`${label} product routes require Product structured data with the same stable sku.`);
    }
  }

  return {
    path: pathname,
    canonicalPath,
    locale: value.locale,
    kind: value.kind,
    alternateKey,
    published: true,
    indexable: true,
    contentSource: value.contentSource,
    contentHash: contentHashBefore,
    lastModified: normalizeLastModified(value.lastModified, `${label}.lastModified`),
    siteName: normalizeText(value.siteName, `${label}.siteName`, 120),
    title: normalizeText(value.title, `${label}.title`, 200),
    description: normalizeText(value.description, `${label}.description`, 500),
    shareImage: normalizeShareImage(value.shareImage, `${label}.shareImage`),
    renderedBodyHtml: normalizeRenderedBody(value.renderedBodyHtml, `${label}.renderedBodyHtml`),
    ...(structuredData === undefined ? {} : { structuredData }),
    ...(productCode ? { productCode } : {}),
  };
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function createPublicSeoSnapshot(input) {
  const value = assertRecord(input, "Snapshot export input");
  assertExactKeys(value, new Set([
    "schemaVersion",
    "origin",
    "sourceSnapshotHashBefore",
    "sourceSnapshotHashAfter",
    "routes",
  ]), "Snapshot export input");
  if (value.schemaVersion !== 1 || !Array.isArray(value.routes)) {
    fail("Snapshot export input must use schemaVersion 1 and a routes array.");
  }
  const sourceHashBefore = normalizeHash(value.sourceSnapshotHashBefore, "sourceSnapshotHashBefore");
  const sourceHashAfter = normalizeHash(value.sourceSnapshotHashAfter, "sourceSnapshotHashAfter");
  if (sourceHashBefore !== sourceHashAfter) {
    fail("Published source facts changed while the snapshot was being exported.");
  }

  const routes = value.routes.map(normalizeRoute);
  const seenPaths = new Set();
  const seenAlternateLocales = new Set();
  for (const route of routes) {
    if (seenPaths.has(route.path)) fail(`Duplicate public route: ${route.path}.`);
    seenPaths.add(route.path);
    const alternateLocaleKey = `${route.alternateKey}:${route.locale}`;
    if (seenAlternateLocales.has(alternateLocaleKey)) {
      fail(`Duplicate locale ${route.locale} for alternate key ${route.alternateKey}.`);
    }
    seenAlternateLocales.add(alternateLocaleKey);
  }
  routes.sort((left, right) => left.path.localeCompare(right.path, "en"));

  const groups = new Map();
  for (const route of routes) {
    const group = groups.get(route.alternateKey) ?? [];
    group.push(route);
    groups.set(route.alternateKey, group);
  }
  const routesWithAlternates = routes.map((route) => {
    const group = groups.get(route.alternateKey) ?? [];
    const chinese = group.find((entry) => entry.locale === "zh-CN");
    const english = group.find((entry) => entry.locale === "en");
    if (english && !chinese) {
      fail(`English route ${english.path} requires a published Chinese reciprocal alternate.`);
    }
    if (group.some((entry) => entry.kind !== route.kind)) {
      fail(`Alternate key ${route.alternateKey} cannot mix route kinds.`);
    }
    if (
      route.kind === "product"
      && group.some((entry) => entry.productCode !== route.productCode)
    ) {
      fail(`Alternate key ${route.alternateKey} must use one stable product code.`);
    }
    const alternates = [
      ...(chinese ? [{ locale: "zh-CN", hrefLang: "zh-CN", path: chinese.path }] : []),
      ...(english ? [{ locale: "en", hrefLang: "en", path: english.path }] : []),
      ...(chinese ? [{ locale: "zh-CN", hrefLang: "x-default", path: chinese.path }] : []),
    ];
    return { ...route, alternates };
  });

  const origin = normalizeProductionOrigin(value.origin);
  const snapshotBody = {
    schemaVersion: 2,
    origin,
    sourceSnapshotHash: sourceHashBefore,
    routes: routesWithAlternates,
  };
  return {
    ...snapshotBody,
    snapshotHash: sha256(stableJson(snapshotBody)),
  };
}

export function validatePublicSeoSnapshot(snapshot) {
  const value = assertRecord(snapshot, "Public SEO snapshot");
  if (value.schemaVersion !== 2 || !Array.isArray(value.routes)) {
    fail("Public SEO snapshot must use schemaVersion 2 and a routes array.");
  }
  const sourceInput = {
    schemaVersion: 1,
    origin: value.origin,
    sourceSnapshotHashBefore: value.sourceSnapshotHash,
    sourceSnapshotHashAfter: value.sourceSnapshotHash,
    routes: value.routes.map((route) => ({
      ...route,
      contentHashBefore: route.contentHash,
      contentHashAfter: route.contentHash,
      // Derived fields are recreated below and are not accepted as export input.
      alternates: undefined,
      contentHash: undefined,
    })).map((route) => Object.fromEntries(
      Object.entries(route).filter(([, entry]) => entry !== undefined),
    )),
  };
  const recreated = createPublicSeoSnapshot(sourceInput);
  if (recreated.snapshotHash !== value.snapshotHash) {
    fail("Public SEO snapshot hash does not match its canonical content.");
  }
  if (stableJson(recreated) !== stableJson(value)) {
    fail("Public SEO snapshot contains non-canonical or derived-field drift.");
  }
  return recreated;
}

function parseArguments(argv) {
  const result = { input: "", output: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--input") result.input = resolve(argv[++index] || "");
    else if (argument === "--output") result.output = resolve(argv[++index] || "");
    else fail(`Unknown argument: ${argument}`);
  }
  if (!result.input || !result.output) fail("Both --input and --output are required.");
  return result;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const input = JSON.parse(await readFile(options.input, "utf8"));
  const snapshot = createPublicSeoSnapshot(input);
  await writeFile(options.output, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  process.stdout.write(`exported: ${snapshot.routes.length} route(s), snapshot ${snapshot.snapshotHash}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
