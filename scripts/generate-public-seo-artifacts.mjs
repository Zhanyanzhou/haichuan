import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  normalizeProductionOrigin,
  validatePublicSeoSnapshot,
} from "./export-public-seo-snapshot.mjs";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const defaultManifest = resolve(projectRoot, "client/seo/published-routes.json");
const defaultOutputDirectory = resolve(projectRoot, "client/public");
const privatePathPrefixes = [
  "/admin",
  "/cart",
  "/checkout",
  "/customer",
  "/partner",
  "/preview",
  "/__templates",
];
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function fail(message) {
  throw new Error(message);
}

function assertRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object.`);
  return value;
}

function assertExactKeys(value, allowed, label) {
  const extras = Object.keys(value).filter((key) => !allowed.has(key));
  if (extras.length > 0) fail(`${label} contains unsupported field(s): ${extras.join(", ")}.`);
}

function parseArguments(argv) {
  const result = {
    check: false,
    strict: false,
    manifest: defaultManifest,
    prerenderManifest: "",
    nginxMap: "",
    nginxPolicy: "",
    outputDirectory: defaultOutputDirectory,
    origin: process.env.PUBLIC_SITE_ORIGIN || process.env.VITE_PUBLIC_SITE_ORIGIN || "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check") result.check = true;
    else if (argument === "--strict") result.strict = true;
    else if (argument === "--origin") result.origin = argv[++index] || "";
    else if (argument === "--manifest") result.manifest = resolve(argv[++index] || "");
    else if (argument === "--prerender-manifest") result.prerenderManifest = resolve(argv[++index] || "");
    else if (argument === "--nginx-map") result.nginxMap = resolve(argv[++index] || "");
    else if (argument === "--nginx-policy") result.nginxPolicy = resolve(argv[++index] || "");
    else if (argument === "--out-dir") result.outputDirectory = resolve(argv[++index] || "");
    else fail(`Unknown argument: ${argument}`);
  }
  return result;
}

function normalizeOptionalOrigin(value) {
  if (!value) return null;
  return normalizeProductionOrigin(value);
}

function isPrivatePath(pathname) {
  const lowerPath = pathname.toLowerCase();
  return privatePathPrefixes.some(
    (prefix) => lowerPath === prefix || lowerPath.startsWith(`${prefix}/`),
  );
}

function normalizeLegacyRoute(entry, index) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    fail(`Route ${index + 1} must be an object.`);
  }
  if (entry.published !== true || entry.indexable !== true) {
    fail(`Route ${index + 1} must explicitly be published and indexable.`);
  }
  if (entry.locale !== "zh-CN") fail(`Route ${index + 1} uses an unavailable locale.`);
  if (
    typeof entry.path !== "string"
    || !entry.path.startsWith("/")
    || entry.path.startsWith("//")
    || /[?#\\\u0000-\u001f]/.test(entry.path)
  ) {
    fail(`Route ${index + 1} has an invalid public path.`);
  }
  const pathname = entry.path === "/" ? "/" : `/${entry.path.replace(/^\/+|\/+$/g, "")}`;
  if (isPrivatePath(pathname)) fail(`Route ${index + 1} is private and cannot enter the sitemap.`);
  if (
    entry.lastModified !== undefined
    && (typeof entry.lastModified !== "string"
      || !/^\d{4}-\d{2}-\d{2}$/.test(entry.lastModified)
      || Number.isNaN(Date.parse(`${entry.lastModified}T00:00:00Z`)))
  ) {
    fail(`Route ${index + 1} has an invalid lastModified date.`);
  }
  return {
    pathname,
    locale: "zh-CN",
    ...(entry.lastModified ? { lastModified: entry.lastModified } : {}),
  };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function escapeRegularExpression(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtmlAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function verifyPrerenderManifest(pathname, snapshot) {
  if (!pathname) fail("Schema v2 requires --prerender-manifest.");
  const value = assertRecord(JSON.parse(await readFile(pathname, "utf8")), "Pre-render manifest");
  assertExactKeys(value, new Set(["schemaVersion", "snapshotHash", "routes"]), "Pre-render manifest");
  if (value.schemaVersion !== 1 || value.snapshotHash !== snapshot.snapshotHash || !Array.isArray(value.routes)) {
    fail("Pre-render manifest must use schemaVersion 1 and match the immutable SEO snapshot hash.");
  }
  if (value.routes.length !== snapshot.routes.length) {
    fail("Pre-render manifest route set does not match the immutable SEO snapshot.");
  }

  const expectedRoutes = new Map(snapshot.routes.map((route) => [route.path, route]));
  const manifestDirectory = dirname(pathname);
  const seen = new Set();
  for (const [index, uncheckedEntry] of value.routes.entries()) {
    const entry = assertRecord(uncheckedEntry, `Pre-render manifest routes[${index}]`);
    assertExactKeys(entry, new Set(["path", "contentHash", "file", "htmlHash"]), `Pre-render manifest routes[${index}]`);
    const route = expectedRoutes.get(entry.path);
    if (!route || seen.has(entry.path)) fail(`Unexpected or duplicate pre-render route: ${String(entry.path)}.`);
    seen.add(entry.path);
    if (entry.contentHash !== route.contentHash || !SHA256_PATTERN.test(entry.htmlHash)) {
      fail(`Pre-render hashes do not match snapshot route ${entry.path}.`);
    }
    const expectedFile = route.path === "/" ? "index.html" : `${route.path.slice(1)}/index.html`;
    if (
      typeof entry.file !== "string"
      || entry.file !== expectedFile
      || !entry.file.endsWith("index.html")
      || isAbsolute(entry.file)
      || entry.file.includes("\\")
      || entry.file.split("/").some((segment) => !segment || segment === "." || segment === "..")
    ) {
      fail(`Pre-render route ${entry.path} has an unsafe output file.`);
    }
    const absoluteFile = resolve(manifestDirectory, entry.file);
    if (!absoluteFile.startsWith(`${resolve(manifestDirectory)}${sep}`)) {
      fail(`Pre-render route ${entry.path} escapes its manifest directory.`);
    }
    const html = await readFile(absoluteFile, "utf8");
    if (sha256(html) !== entry.htmlHash) fail(`Pre-rendered HTML drifted for route ${entry.path}.`);
    const hashPattern = new RegExp(
      `<meta\\b(?=[^>]*name=["']published-content-hash["'])(?=[^>]*content=["']${route.contentHash}["'])[^>]*>`,
      "i",
    );
    const rootHashPattern = new RegExp(
      `<div\\b(?=[^>]*id=["']root["'])(?=[^>]*data-prerendered-path=["']${escapeRegularExpression(escapeHtmlAttribute(route.path))}["'])(?=[^>]*data-published-content-hash=["']${route.contentHash}["'])[^>]*>`,
      "i",
    );
    if (!hashPattern.test(html) || !rootHashPattern.test(html)) {
      fail(`Pre-rendered HTML does not bind the published content hash for route ${entry.path}.`);
    }
    if (!html.includes(route.renderedBodyHtml)) {
      fail(`Pre-rendered HTML does not contain the immutable published body for route ${entry.path}.`);
    }
    const canonicalHref = escapeHtmlAttribute(new URL(route.canonicalPath, snapshot.origin).href);
    const canonicalPattern = new RegExp(
      `<link\\b(?=[^>]*rel=["']canonical["'])(?=[^>]*href=["']${escapeRegularExpression(canonicalHref)}["'])[^>]*>`,
      "i",
    );
    if (!canonicalPattern.test(html)) {
      fail(`Pre-rendered HTML canonical does not match snapshot route ${entry.path}.`);
    }
    for (const alternate of route.alternates) {
      const alternateHref = escapeHtmlAttribute(new URL(alternate.path, snapshot.origin).href);
      const alternatePattern = new RegExp(
        `<link\\b(?=[^>]*rel=["']alternate["'])(?=[^>]*hreflang=["']${escapeRegularExpression(alternate.hrefLang)}["'])(?=[^>]*href=["']${escapeRegularExpression(alternateHref)}["'])[^>]*>`,
        "i",
      );
      if (!alternatePattern.test(html)) {
        fail(`Pre-rendered HTML alternates do not match snapshot route ${entry.path}.`);
      }
    }
  }
}

async function readPublishedRoutes(options) {
  const unchecked = JSON.parse(await readFile(options.manifest, "utf8"));
  if (unchecked?.schemaVersion === 3) {
    const snapshot = validatePublicSeoSnapshot(unchecked);
    await verifyPrerenderManifest(options.prerenderManifest, snapshot);
    const configuredOrigin = normalizeOptionalOrigin(options.origin);
    if (configuredOrigin && configuredOrigin !== snapshot.origin) {
      fail("Configured production origin does not match the immutable SEO snapshot origin.");
    }
    return {
      origin: snapshot.origin,
      schemaVersion: 3,
      contentReady: snapshot.contentReady,
      routes: snapshot.routes.map((route) => ({
        pathname: route.path,
        locale: route.locale,
        lastModified: route.lastModified,
        alternates: route.alternates,
      })),
    };
  }
  if (!unchecked || unchecked.schemaVersion !== 1 || !Array.isArray(unchecked.routes)) {
    fail("Published route manifest must use schemaVersion 1 or immutable snapshot schemaVersion 3.");
  }
  const routes = unchecked.routes.map(normalizeLegacyRoute);
  const seen = new Set();
  for (const route of routes) {
    if (seen.has(route.pathname)) fail(`Duplicate public route: ${route.pathname}`);
    seen.add(route.pathname);
  }
  return {
    origin: normalizeOptionalOrigin(options.origin),
    schemaVersion: 1,
    contentReady: true,
    routes: routes.sort((left, right) => left.pathname.localeCompare(right.pathname, "en")),
  };
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function renderPublicSeoArtifacts(origin, routes, { schemaVersion = 1, contentReady = true } = {}) {
  const hasAlternates = routes.some((route) => Array.isArray(route.alternates) && route.alternates.length > 0);
  const sitemapLines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    schemaVersion === 1
      ? "<!-- Generated from client/seo/published-routes.json; do not add unverified URLs by hand. -->"
      : "<!-- Generated from a verified published-route manifest; do not add unverified URLs by hand. -->",
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${hasAlternates ? ' xmlns:xhtml="http://www.w3.org/1999/xhtml"' : ""}>`,
  ];
  if (origin) {
    for (const route of routes) {
      sitemapLines.push("  <url>", `    <loc>${escapeXml(new URL(route.pathname, `${origin}/`).href)}</loc>`);
      if (route.lastModified) sitemapLines.push(`    <lastmod>${route.lastModified}</lastmod>`);
      for (const alternate of route.alternates ?? []) {
        sitemapLines.push(
          `    <xhtml:link rel="alternate" hreflang="${escapeXml(alternate.hrefLang)}" href="${escapeXml(new URL(alternate.path, `${origin}/`).href)}" />`,
        );
      }
      sitemapLines.push("  </url>");
    }
  }
  sitemapLines.push("</urlset>", "");

  const hasPublishedEnglish = routes.some((route) => route.locale === "en");
  const disallowedPrefixes = [
    ...privatePathPrefixes,
    ...(schemaVersion === 3 && hasPublishedEnglish
      ? privatePathPrefixes.map((prefix) => `/en${prefix}`)
      : ["/en"]),
  ];
  const robotsLines = [
    schemaVersion === 1
      ? "# Generated from client/seo/published-routes.json; use the generator for production."
      : "# Generated from a verified published-route manifest; use the generator for production.",
    "User-agent: *",
    ...(contentReady
      ? ["Allow: /", ...disallowedPrefixes.map((prefix) => `Disallow: ${prefix}`)]
      : ["Disallow: /"]),
  ];
  if (origin && routes.length > 0) robotsLines.push(`Sitemap: ${origin}/sitemap.xml`);
  robotsLines.push("");
  return { robots: robotsLines.join("\n"), sitemap: sitemapLines.join("\n") };
}

export function renderPublicSeoPolicy(contentReady = true) {
  return [
    "# Generated from the immutable SEO snapshot; included at http scope.",
    "map $request_uri $hc_robots_tag {",
    `  default ${contentReady ? '\"\"' : '\"noindex, nofollow\"'};`,
    '  ~*^/(admin|preview|customer|cart|checkout|partner)(/|\\?|$) "noindex, nofollow";',
    "}",
    "",
  ].join("\n");
}

export function renderPublicSeoNginxMap(routes, { contentReady = true } = {}) {
  if (!contentReady) {
    const safePaths = ["/", "/products", "/catalog", "/custom", "/about", "/contact", "/privacy", "/business-info"];
    return [
      "# Generated safe preproduction routing; no route is indexable or publishable.",
      "location = /preproduction-not-ready.html { internal; }",
      ...safePaths.flatMap((pathname) => [
        "",
        `location = \"${pathname}\" {`,
        "  try_files /preproduction-not-ready.html =404;",
        "  expires -1;",
        "}",
      ]),
      "",
    ].join("\n");
  }
  const locations = routes.flatMap((route) => {
    const outputFile = route.pathname === "/"
      ? "/index.html"
      : `${route.pathname}/index.html`;
    return [
      `location = \"${route.pathname}\" {`,
      `  try_files \"${outputFile}\" =404;`,
      "  expires -1;",
      "}",
      "",
      `location = \"${outputFile}\" {`,
      "  absolute_redirect off;",
      `  return 308 \"${route.pathname}$is_args$args\";`,
      "}",
      ...(route.pathname === "/" ? [] : [
        "",
        `location = \"${route.pathname}/\" {`,
        "  absolute_redirect off;",
        `  return 308 \"${route.pathname}$is_args$args\";`,
        "}",
      ]),
    ];
  });
  return [
    "# Generated from the verified pre-render manifest; included at server scope.",
    ...locations,
    "",
  ].join("\n");
}

async function checkOrWrite(pathname, expected, check) {
  if (!check) {
    await writeFile(pathname, expected, "utf8");
    return;
  }
  const actual = await readFile(pathname, "utf8");
  if (actual.replace(/\r\n/g, "\n") !== expected) {
    fail(`${pathname} is stale. Run generate-public-seo-artifacts.mjs.`);
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const published = await readPublishedRoutes(options);
  if (options.strict && (!published.origin || published.schemaVersion !== 3 || (published.contentReady !== false && published.routes.length === 0))) {
    fail("Strict mode requires an immutable schema v3 snapshot and verified pre-render evidence; reviewed snapshots require at least one route.");
  }
  if (options.strict && !options.nginxMap) {
    fail("Strict mode requires --nginx-map so only verified pre-rendered routes can be served as indexable HTML.");
  }
  const artifacts = renderPublicSeoArtifacts(published.origin, published.routes, {
    schemaVersion: published.schemaVersion,
    contentReady: published.contentReady,
  });
  if (!options.check) await mkdir(options.outputDirectory, { recursive: true });
  await Promise.all([
    checkOrWrite(resolve(options.outputDirectory, "robots.txt"), artifacts.robots, options.check),
    checkOrWrite(resolve(options.outputDirectory, "sitemap.xml"), artifacts.sitemap, options.check),
    ...(options.nginxMap
      ? [checkOrWrite(options.nginxMap, renderPublicSeoNginxMap(published.routes, { contentReady: published.contentReady }), options.check)]
      : []),
    ...(options.nginxPolicy
      ? [checkOrWrite(options.nginxPolicy, renderPublicSeoPolicy(published.contentReady), options.check)]
      : []),
  ]);
  process.stdout.write(
    `${options.check ? "verified" : "generated"}: ${published.routes.length} published route(s), origin ${published.origin || "unset"}\n`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
