import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validatePublicSeoSnapshot } from "./export-public-seo-snapshot.mjs";

function fail(message) {
  throw new Error(message);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeRegularExpression(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertDocumentLocale(html, locale, label) {
  const pattern = new RegExp(
    `<html\\b(?=[^>]*\\blang\\s*=\\s*["']${escapeRegularExpression(locale)}["'])[^>]*>`,
    "i",
  );
  if (!pattern.test(html)) fail(`${label} did not declare document language ${locale}.`);
}

export function assertSafeNotFoundHtml(html, locale, pathname) {
  assertDocumentLocale(html, locale, `Not-found route ${pathname}`);
  const robotsTag = [...String(html).matchAll(/<meta\b[^>]*>/gi)].find((match) =>
    /\bname\s*=\s*["']robots["']/i.test(match[0]),
  )?.[0];
  const robotsContent = robotsTag?.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1] ?? "";
  const directives = new Set(robotsContent.toLowerCase().split(/[\s,]+/).filter(Boolean));
  if (!directives.has("noindex") || !directives.has("nofollow")) {
    fail(`Not-found route ${pathname} did not remain noindex,nofollow.`);
  }
  const homePath = locale === "en" ? "/en" : "/";
  const homeLink = new RegExp(
    `<a\\b(?=[^>]*\\bhref\\s*=\\s*["']${escapeRegularExpression(homePath)}["'])[^>]*>`,
    "i",
  );
  if (!homeLink.test(html)) fail(`Not-found route ${pathname} did not provide its locale home link.`);
}

export function assertSafeFallbackHtml(html, pathname) {
  assertDocumentLocale(html, "zh-CN", `Safe fallback route ${pathname}`);
  if (!String(html).includes('data-content-ready="false"')) {
    fail(`Safe fallback route ${pathname} did not declare contentReady=false.`);
  }
  if (!/name=["']robots["'][^>]*content=["'][^"']*noindex[^"']*nofollow/i.test(String(html))) {
    fail(`Safe fallback route ${pathname} did not remain noindex,nofollow.`);
  }
  if (/<link\b[^>]*rel=["']canonical["']/i.test(String(html)) || /property=["']og:/i.test(String(html))) {
    fail(`Safe fallback route ${pathname} exposed publishable SEO metadata.`);
  }
}

function parseArguments(argv) {
  const result = { baseUrl: "", snapshot: "", requireRepresentative: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--base-url") result.baseUrl = argv[++index] || "";
    else if (argument === "--snapshot") result.snapshot = resolve(argv[++index] || "");
    else if (argument === "--require-representative") result.requireRepresentative = true;
    else fail(`Unknown argument: ${argument}`);
  }
  if (!result.baseUrl || !result.snapshot) fail("--base-url and --snapshot are required.");
  const base = new URL(result.baseUrl);
  if (
    base.protocol !== "http:"
    || !["127.0.0.1", "localhost"].includes(base.hostname)
    || base.username
    || base.password
    || base.pathname !== "/"
    || base.search
    || base.hash
  ) {
    fail("HTTP verification base URL must be an explicit local loopback HTTP origin.");
  }
  result.baseUrl = base.origin;
  return result;
}

async function fetchManual(baseUrl, pathname) {
  return fetch(new URL(pathname, `${baseUrl}/`), { redirect: "manual" });
}

export function assertRelativeLocation(location, pathname, search) {
  if (!location) fail(`Redirect for ${pathname} did not provide Location.`);
  if (!location.startsWith("/") || location.startsWith("//")) {
    fail(`Redirect for ${pathname} must use a same-origin relative Location.`);
  }
  const parsed = new URL(location, "http://redirect.invalid");
  if (
    parsed.origin !== "http://redirect.invalid"
    || parsed.pathname !== pathname
    || parsed.search !== search
    || parsed.hash
  ) {
    fail(`Redirect target drifted: expected ${pathname}${search}, received ${parsed.pathname}${parsed.search}.`);
  }
}

function assertLocation(response, pathname, search) {
  assertRelativeLocation(response.headers.get("location"), pathname, search);
}

export async function verifyPublicSeoHttp({ baseUrl, snapshot, requireRepresentative = false }) {
  const verifiedSnapshot = validatePublicSeoSnapshot(snapshot);
  if (requireRepresentative) {
    const kinds = new Set(verifiedSnapshot.routes.map((route) => route.kind));
    const locales = new Set(verifiedSnapshot.routes.map((route) => route.locale));
    if (!["page", "legal", "product"].every((kind) => kinds.has(kind)) || !locales.has("zh-CN") || !locales.has("en")) {
      fail("Representative HTTP verification requires Chinese, English, page, legal, and product fixtures.");
    }
  }

  if (!verifiedSnapshot.contentReady) {
    for (const pathname of ["/", "/catalog", "/contact"]) {
      const response = await fetchManual(baseUrl, pathname);
      if (response.status !== 200 || !response.headers.get("content-type")?.toLowerCase().includes("text/html")) {
        fail(`Safe fallback route ${pathname} was not available as HTML.`);
      }
      if (!/noindex/i.test(response.headers.get("x-robots-tag") || "")) {
        fail(`Safe fallback route ${pathname} did not receive an index-blocking response header.`);
      }
      assertSafeFallbackHtml(await response.text(), pathname);
    }
  }

  for (const route of verifiedSnapshot.routes) {
    const response = await fetchManual(baseUrl, route.path);
    if (response.status !== 200) fail(`Published route ${route.path} returned HTTP ${response.status}.`);
    if (!response.headers.get("content-type")?.toLowerCase().includes("text/html")) {
      fail(`Published route ${route.path} did not return HTML.`);
    }
    if ((response.headers.get("x-robots-tag") || "").toLowerCase().includes("noindex")) {
      fail(`Published route ${route.path} received an index-blocking response header.`);
    }
    const html = await response.text();
    assertDocumentLocale(html, route.locale, `Published route ${route.path}`);
    const canonical = escapeHtml(new URL(route.canonicalPath, verifiedSnapshot.origin).href);
    if (
      !html.includes(route.renderedBodyHtml)
      || !html.includes(`data-prerendered-path="${escapeHtml(route.path)}"`)
      || !html.includes(`data-published-content-hash="${route.contentHash}"`)
      || !html.includes(`name="published-content-hash" content="${route.contentHash}"`)
      || !html.includes(`rel="canonical" href="${canonical}"`)
      || !html.includes('name="robots" content="index,follow,max-image-preview:large"')
      || !html.includes('property="og:image"')
      || !html.includes('name="twitter:image"')
      || !html.includes('type="application/ld+json"')
    ) {
      fail(`Published route ${route.path} raw HTML does not match its immutable SEO snapshot.`);
    }
    for (const alternate of route.alternates) {
      const href = escapeHtml(new URL(alternate.path, verifiedSnapshot.origin).href);
      if (!html.includes(`hreflang="${alternate.hrefLang}" href="${href}"`)) {
        fail(`Published route ${route.path} is missing alternate ${alternate.hrefLang}.`);
      }
    }

    const physicalPath = route.path === "/" ? "/index.html" : `${route.path}/index.html`;
    const physical = await fetchManual(baseUrl, `${physicalPath}?seo-probe=1`);
    if (physical.status !== 308) {
      fail(`Physical pre-render path ${physicalPath} returned HTTP ${physical.status}, expected 308.`);
    }
    assertLocation(physical, route.path, "?seo-probe=1");
  }

  const reservedPaths = new Set(verifiedSnapshot.routes.map((route) => route.path));
  const notFoundProbes = [
    ["/__seo-unpublished-probe__", "zh-CN"],
    ["/products/__seo-invalid-probe__", "zh-CN"],
  ];
  for (const [pathname, locale] of notFoundProbes) {
    if (reservedPaths.has(pathname)) fail(`SEO probe path unexpectedly entered the snapshot: ${pathname}.`);
    const response = await fetchManual(baseUrl, pathname);
    if (response.status !== 404) {
      fail(`SEO probe ${pathname} returned HTTP ${response.status}, expected 404.`);
    }
    if (!response.headers.get("content-type")?.toLowerCase().includes("text/html")) {
      fail(`SEO probe ${pathname} did not return HTML.`);
    }
    assertSafeNotFoundHtml(await response.text(), locale, pathname);
  }

  const retiredEnglishPath = "/en/__seo-unpublished-probe__";
  if (reservedPaths.has(retiredEnglishPath)) {
    fail(`SEO probe path unexpectedly entered the snapshot: ${retiredEnglishPath}.`);
  }
  const retiredEnglish = await fetchManual(baseUrl, retiredEnglishPath);
  if (retiredEnglish.status !== 308) {
    fail(`SEO probe ${retiredEnglishPath} returned HTTP ${retiredEnglish.status}, expected 308.`);
  }
  assertLocation(retiredEnglish, "/__seo-unpublished-probe__", "");

  const malformedEnglishPath = "/en//__seo-malformed-probe__";
  const malformedEnglish = await fetchManual(baseUrl, malformedEnglishPath);
  if (malformedEnglish.status !== 404) {
    fail(`Malformed English path ${malformedEnglishPath} returned HTTP ${malformedEnglish.status}, expected 404.`);
  }

  const internalManifest = await fetchManual(baseUrl, "/prerendered-routes.json");
  if (internalManifest.status !== 404) {
    fail(`Internal pre-render manifest returned HTTP ${internalManifest.status}, expected 404.`);
  }

  const privateResponse = await fetchManual(baseUrl, "/customer?seo-probe=1");
  const privateHtml = await privateResponse.text();
  if (
    privateResponse.status !== 200
    || !/noindex\s*,\s*nofollow/i.test(privateResponse.headers.get("x-robots-tag") || "")
    || !privateHtml.includes('<meta name="robots" content="noindex, nofollow"')
  ) {
    fail("Private SPA route did not remain available and noindex.");
  }

  const search = await fetchManual(baseUrl, "/search?query=ring&category=bracelets");
  if (search.status !== 308) fail(`Legacy search returned HTTP ${search.status}, expected 308.`);
  assertLocation(search, "/catalog", "?query=ring&category=bracelets");

  const nonRootRoute = verifiedSnapshot.routes.find((route) => route.path !== "/");
  if (nonRootRoute) {
    const trailing = await fetchManual(baseUrl, `${nonRootRoute.path}/?seo-probe=1`);
    if (trailing.status !== 308) {
      fail(`Trailing slash route ${nonRootRoute.path}/ returned HTTP ${trailing.status}, expected 308.`);
    }
    assertLocation(trailing, nonRootRoute.path, "?seo-probe=1");
  }

  return { routeCount: verifiedSnapshot.routes.length, snapshotHash: verifiedSnapshot.snapshotHash };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const snapshot = JSON.parse(await readFile(options.snapshot, "utf8"));
  const result = await verifyPublicSeoHttp({
    baseUrl: options.baseUrl,
    snapshot,
    requireRepresentative: options.requireRepresentative,
  });
  process.stdout.write(`verified HTTP: ${result.routeCount} route(s), snapshot ${result.snapshotHash}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
