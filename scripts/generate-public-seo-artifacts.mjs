import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const defaultManifest = resolve(projectRoot, "client/seo/published-routes.json");
const defaultOutputDirectory = resolve(projectRoot, "client/public");
const nonIndexablePrefixes = [
  "/admin",
  "/cart",
  "/checkout",
  "/customer",
  "/partner",
  "/preview",
  "/__templates",
  "/en",
];

function parseArguments(argv) {
  const result = {
    check: false,
    strict: false,
    manifest: defaultManifest,
    outputDirectory: defaultOutputDirectory,
    origin: process.env.PUBLIC_SITE_ORIGIN || process.env.VITE_PUBLIC_SITE_ORIGIN || "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check") result.check = true;
    else if (argument === "--strict") result.strict = true;
    else if (argument === "--origin") result.origin = argv[++index] || "";
    else if (argument === "--manifest") result.manifest = resolve(argv[++index] || "");
    else if (argument === "--out-dir") result.outputDirectory = resolve(argv[++index] || "");
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return result;
}

function normalizeProductionOrigin(value) {
  if (!value) return null;
  const url = new URL(value);
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || url.pathname !== "/"
    || url.search
    || url.hash
  ) {
    throw new Error("Production site origin must be an HTTPS origin without credentials, path, query, or fragment.");
  }
  return url.origin;
}

function isPrivatePath(pathname) {
  const lowerPath = pathname.toLowerCase();
  return nonIndexablePrefixes.some(
    (prefix) => lowerPath === prefix || lowerPath.startsWith(`${prefix}/`),
  );
}

function normalizeRoute(entry, index) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`Route ${index + 1} must be an object.`);
  }
  if (entry.published !== true || entry.indexable !== true) {
    throw new Error(`Route ${index + 1} must explicitly be published and indexable.`);
  }
  if (entry.locale !== "zh-CN") {
    throw new Error(`Route ${index + 1} uses an unavailable locale.`);
  }
  if (
    typeof entry.path !== "string"
    || !entry.path.startsWith("/")
    || entry.path.startsWith("//")
    || /[?#\\\u0000-\u001f]/.test(entry.path)
  ) {
    throw new Error(`Route ${index + 1} has an invalid public path.`);
  }
  const pathname = entry.path === "/"
    ? "/"
    : `/${entry.path.replace(/^\/+|\/+$/g, "")}`;
  if (isPrivatePath(pathname)) {
    throw new Error(`Route ${index + 1} is private and cannot enter the sitemap.`);
  }
  if (
    entry.lastModified !== undefined
    && (typeof entry.lastModified !== "string"
      || !/^\d{4}-\d{2}-\d{2}$/.test(entry.lastModified)
      || Number.isNaN(Date.parse(`${entry.lastModified}T00:00:00Z`)))
  ) {
    throw new Error(`Route ${index + 1} has an invalid lastModified date.`);
  }
  return {
    pathname,
    ...(entry.lastModified ? { lastModified: entry.lastModified } : {}),
  };
}

async function readManifest(pathname) {
  const value = JSON.parse(await readFile(pathname, "utf8"));
  if (!value || value.schemaVersion !== 1 || !Array.isArray(value.routes)) {
    throw new Error("Published route manifest must use schemaVersion 1 and a routes array.");
  }
  const routes = value.routes.map(normalizeRoute);
  const seen = new Set();
  for (const route of routes) {
    if (seen.has(route.pathname)) throw new Error(`Duplicate public route: ${route.pathname}`);
    seen.add(route.pathname);
  }
  return routes.sort((left, right) => left.pathname.localeCompare(right.pathname, "en"));
}

function escapeXml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function renderPublicSeoArtifacts(origin, routes) {
  const sitemapLines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<!-- Generated from client/seo/published-routes.json; do not add unverified URLs by hand. -->",
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ];
  if (origin) {
    for (const route of routes) {
      sitemapLines.push("  <url>", `    <loc>${escapeXml(new URL(route.pathname, `${origin}/`).href)}</loc>`);
      if (route.lastModified) sitemapLines.push(`    <lastmod>${route.lastModified}</lastmod>`);
      sitemapLines.push("  </url>");
    }
  }
  sitemapLines.push("</urlset>", "");

  const robotsLines = [
    "# Generated from client/seo/published-routes.json; use the generator for production.",
    "User-agent: *",
    "Allow: /",
    ...nonIndexablePrefixes.map((prefix) => `Disallow: ${prefix}`),
  ];
  if (origin && routes.length > 0) robotsLines.push(`Sitemap: ${origin}/sitemap.xml`);
  robotsLines.push("");
  return {
    robots: robotsLines.join("\n"),
    sitemap: sitemapLines.join("\n"),
  };
}

async function checkOrWrite(pathname, expected, check) {
  if (!check) {
    await writeFile(pathname, expected, "utf8");
    return;
  }
  const actual = await readFile(pathname, "utf8");
  if (actual.replace(/\r\n/g, "\n") !== expected) {
    throw new Error(`${pathname} is stale. Run generate-public-seo-artifacts.mjs.`);
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const origin = normalizeProductionOrigin(options.origin);
  const routes = await readManifest(options.manifest);
  if (options.strict && (!origin || routes.length === 0)) {
    throw new Error("Strict mode requires a confirmed HTTPS origin and at least one verified published route.");
  }
  const artifacts = renderPublicSeoArtifacts(origin, routes);
  await Promise.all([
    checkOrWrite(resolve(options.outputDirectory, "robots.txt"), artifacts.robots, options.check),
    checkOrWrite(resolve(options.outputDirectory, "sitemap.xml"), artifacts.sitemap, options.check),
  ]);
  process.stdout.write(
    `${options.check ? "verified" : "generated"}: ${routes.length} published route(s), origin ${origin || "unset"}\n`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}


