import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { validatePublicSeoSnapshot } from "./export-public-seo-snapshot.mjs";

function fail(message) {
  throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeJson(value) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function stripManagedHead(html) {
  return html
    .replace(/<title\b[^>]*>[\s\S]*?<\/title\s*>/gi, "")
    .replace(/<meta\b(?=[^>]*(?:name\s*=\s*["'](?:description|keywords|published-content-hash|robots|twitter:[^"']+)["']|property\s*=\s*["']og:[^"']+["']))[^>]*>\s*/gi, "")
    .replace(/<link\b(?=[^>]*rel\s*=\s*["'](?:canonical|alternate)["'])[^>]*>\s*/gi, "")
    .replace(/<script\b(?=[^>]*type\s*=\s*["']application\/ld\+json["'])[^>]*>[\s\S]*?<\/script\s*>\s*/gi, "");
}

function routeOutputFile(outDir, pathname) {
  const segments = pathname === "/" ? [] : pathname.slice(1).split("/");
  const destination = resolve(outDir, ...segments, "index.html");
  const root = resolve(outDir);
  if (destination !== resolve(root, "index.html") && !destination.startsWith(`${root}${sep}`)) {
    fail(`Route ${pathname} escapes the pre-render output directory.`);
  }
  return destination;
}

function buildStructuredData(route, canonicalUrl) {
  if (route.structuredData !== undefined) return route.structuredData;
  return {
    "@context": "https://schema.org",
    "@type": route.kind === "legal" ? "WebPage" : "WebPage",
    name: route.title,
    description: route.description,
    url: canonicalUrl,
  };
}

export function renderPrerenderedHtml(baseHtml, snapshot, route) {
  if (typeof baseHtml !== "string" || !/<html\b/i.test(baseHtml) || !/<head\b/i.test(baseHtml) || !/<\/head\s*>/i.test(baseHtml)) {
    fail("Base HTML must contain html and head elements.");
  }
  const rootPattern = /<div\b(?=[^>]*\bid\s*=\s*["']root["'])[^>]*>\s*<\/div\s*>/i;
  if (!rootPattern.test(baseHtml)) {
    fail('Base HTML must contain an empty <div id="root"></div> mount point.');
  }

  const canonicalUrl = new URL(route.canonicalPath, snapshot.origin).href;
  const locale = route.locale === "en" ? "en_US" : "zh_CN";
  const alternates = route.alternates.map((alternate) => {
    const href = new URL(alternate.path, snapshot.origin).href;
    return `  <link data-public-seo="managed" rel="alternate" hreflang="${escapeHtml(alternate.hrefLang)}" href="${escapeHtml(href)}">`;
  });
  const structuredData = buildStructuredData(route, canonicalUrl);
  const jsonLdNodes = (Array.isArray(structuredData) ? structuredData : [structuredData]).map(
    (node) => `  <script data-public-seo="managed" type="application/ld+json">${safeJson(node)}</script>`,
  );
  const managedHead = [
    `  <title>${escapeHtml(route.title)}</title>`,
    `  <meta data-public-seo="managed" name="description" content="${escapeHtml(route.description)}">`,
    "  <meta data-public-seo=\"managed\" name=\"robots\" content=\"index,follow,max-image-preview:large\">",
    `  <meta data-public-seo="managed" name="published-content-hash" content="${route.contentHash}">`,
    `  <link data-public-seo="managed" rel="canonical" href="${escapeHtml(canonicalUrl)}">`,
    ...alternates,
    `  <meta data-public-seo="managed" property="og:type" content="${route.kind === "product" ? "product" : "website"}">`,
    `  <meta data-public-seo="managed" property="og:site_name" content="${escapeHtml(route.siteName)}">`,
    `  <meta data-public-seo="managed" property="og:title" content="${escapeHtml(route.title)}">`,
    `  <meta data-public-seo="managed" property="og:description" content="${escapeHtml(route.description)}">`,
    `  <meta data-public-seo="managed" property="og:url" content="${escapeHtml(canonicalUrl)}">`,
    `  <meta data-public-seo="managed" property="og:image" content="${escapeHtml(route.shareImage)}">`,
    `  <meta data-public-seo="managed" property="og:locale" content="${locale}">`,
    "  <meta data-public-seo=\"managed\" name=\"twitter:card\" content=\"summary_large_image\">",
    `  <meta data-public-seo="managed" name="twitter:title" content="${escapeHtml(route.title)}">`,
    `  <meta data-public-seo="managed" name="twitter:description" content="${escapeHtml(route.description)}">`,
    `  <meta data-public-seo="managed" name="twitter:image" content="${escapeHtml(route.shareImage)}">`,
    ...jsonLdNodes,
  ].join("\n");

  let html = stripManagedHead(baseHtml);
  html = html.replace(/<html\b([^>]*)>/i, (match, attributes) => {
    const withoutLang = attributes.replace(/\s+lang\s*=\s*(?:["'][^"']*["']|[^\s>]+)/i, "");
    return `<html${withoutLang} lang="${route.locale}">`;
  });
  html = html.replace(/<\/head\s*>/i, `${managedHead}\n</head>`);
  html = html.replace(
    rootPattern,
    `<div id="root" data-prerendered="true" data-prerendered-path="${escapeHtml(route.path)}" data-published-content-hash="${route.contentHash}">${route.renderedBodyHtml}</div>`,
  );
  return html;
}

export async function prerenderPublicRoutes({ snapshot: uncheckedSnapshot, baseHtml, outDir }) {
  const snapshot = validatePublicSeoSnapshot(uncheckedSnapshot);
  if (typeof outDir !== "string" || !outDir.trim()) fail("A pre-render output directory is required.");

  // Render and validate every route before creating any output.
  const outputs = snapshot.routes.map((route) => {
    const html = renderPrerenderedHtml(baseHtml, snapshot, route);
    const absoluteFile = routeOutputFile(outDir, route.path);
    return {
      route,
      html,
      absoluteFile,
      relativeFile: relative(resolve(outDir), absoluteFile).replaceAll("\\", "/"),
      htmlHash: sha256(html),
    };
  });

  for (const output of outputs) {
    await mkdir(resolve(output.absoluteFile, ".."), { recursive: true });
    await writeFile(output.absoluteFile, output.html, "utf8");
  }
  const manifest = {
    schemaVersion: 1,
    snapshotHash: snapshot.snapshotHash,
    routes: outputs.map((output) => ({
      path: output.route.path,
      contentHash: output.route.contentHash,
      file: output.relativeFile,
      htmlHash: output.htmlHash,
    })),
  };
  await mkdir(resolve(outDir), { recursive: true });
  await writeFile(
    resolve(outDir, "prerendered-routes.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  return manifest;
}

function parseArguments(argv) {
  const result = { snapshot: "", baseHtml: "", outDir: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--snapshot") result.snapshot = resolve(argv[++index] || "");
    else if (argument === "--base-html") result.baseHtml = resolve(argv[++index] || "");
    else if (argument === "--out-dir") result.outDir = resolve(argv[++index] || "");
    else fail(`Unknown argument: ${argument}`);
  }
  if (!result.snapshot || !result.baseHtml || !result.outDir) {
    fail("--snapshot, --base-html, and --out-dir are required.");
  }
  return result;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const snapshot = JSON.parse(await readFile(options.snapshot, "utf8"));
  const baseHtml = await readFile(options.baseHtml, "utf8");
  const manifest = await prerenderPublicRoutes({ snapshot, baseHtml, outDir: options.outDir });
  process.stdout.write(`pre-rendered: ${manifest.routes.length} route(s), snapshot ${manifest.snapshotHash}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
