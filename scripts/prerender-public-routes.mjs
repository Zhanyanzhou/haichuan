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

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function publicHomeHero(route, origin) {
  const blocks = route.bootstrapPageDocument?.puckData?.content;
  if (!Array.isArray(blocks)) return null;
  const hero = blocks.find((block) => block?.type === "首屏主视觉" && block?.props?.isVisible !== false);
  // 发布的 Puck Hero 将内容字段直接保存在 props，和客户端 Renderer 使用
  // 同一文档结构；不要为静态首屏另设 content 嵌套层。
  const content = hero?.props && typeof hero.props === "object" && !Array.isArray(hero.props)
    ? hero.props
    : {};
  const desktopImage = text(content?.desktopImage);
  const mobileImage = text(content?.mobileImage);
  const safeImage = (source) => {
    if (!source) return "";
    try {
      const url = new URL(source, origin);
      return url.protocol === "https:" && url.origin === origin ? url.href : "";
    } catch {
      return "";
    }
  };
  const image = safeImage(desktopImage || mobileImage);
  const mobile = safeImage(mobileImage || desktopImage);
  if (!image) return null;
  return {
    image,
    mobile,
    title: text(content?.title),
    subtitle: text(content?.subtitle),
    eyebrow: text(content?.eyebrow),
  };
}

function renderHomeFirstFold(route, origin) {
  const hero = publicHomeHero(route, origin);
  if (!hero) return route.renderedBodyHtml;
  const copy = [
    hero.eyebrow ? `<p class="hc-prerendered-home__eyebrow">${escapeHtml(hero.eyebrow)}</p>` : "",
    hero.title ? `<h1>${escapeHtml(hero.title)}</h1>` : "",
    hero.subtitle ? `<p class="hc-prerendered-home__subtitle">${escapeHtml(hero.subtitle)}</p>` : "",
  ].join("");
  return [
    '<main class="hc-prerendered-home" data-public-first-fold="published">',
    '<picture>',
    hero.mobile ? `<source media="(max-width: 767px)" srcset="${escapeHtml(hero.mobile)}">` : "",
    `<img src="${escapeHtml(hero.image)}" alt="" aria-hidden="true" width="3360" height="1470" fetchpriority="high" decoding="async">`,
    "</picture>",
    copy ? `<div class="hc-prerendered-home__shade"></div><div class="hc-prerendered-home__copy">${copy}</div>` : "",
    "</main>",
  ].join("");
}

const HOME_FIRST_FOLD_CSS = `
  <style data-public-first-fold="home">
    .hc-prerendered-home{position:relative;isolation:isolate;min-height:max(620px,100svh);overflow:hidden;background:#181A1B;color:#fff}
    .hc-prerendered-home picture,.hc-prerendered-home img{position:absolute;inset:0;width:100%;height:100%}
    .hc-prerendered-home img{object-fit:cover}
    .hc-prerendered-home__shade{position:absolute;inset:0;z-index:1;background:linear-gradient(90deg,rgba(16,18,19,.58) 0%,rgba(16,18,19,.24) 42%,rgba(16,18,19,0) 72%)}
    .hc-prerendered-home__copy{position:relative;z-index:2;display:grid;align-content:end;min-height:max(620px,100svh);width:min(100%,1440px);margin:0 auto;padding:clamp(128px,16vw,236px) clamp(24px,7vw,136px)}
    .hc-prerendered-home__copy>div{max-width:620px}.hc-prerendered-home h1{max-width:620px;margin:0;font-family:"Noto Serif SC",serif;font-size:clamp(42px,5.2vw,76px);font-weight:400;line-height:1.14}.hc-prerendered-home__eyebrow{margin:0 0 18px;font-size:11px;letter-spacing:.18em;line-height:1.4}.hc-prerendered-home__subtitle{max-width:620px;margin:20px 0 0;font-family:"Noto Serif SC",serif;font-size:clamp(17px,1.45vw,22px);font-style:italic;line-height:1.7}
  </style>`;

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
  const homeHero = route.path === "/" ? publicHomeHero(route, snapshot.origin) : null;
  const firstFoldHead = homeHero
    ? [
      HOME_FIRST_FOLD_CSS,
      `  <link data-public-first-fold="home" rel="preload" as="image" href="${escapeHtml(homeHero.image)}" fetchpriority="high">`,
    ]
    : [];
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
    ...firstFoldHead,
  ].join("\n");

  let html = stripManagedHead(baseHtml);
  html = html.replace(/<html\b([^>]*)>/i, (match, attributes) => {
    const withoutLang = attributes.replace(/\s+lang\s*=\s*(?:["'][^"']*["']|[^\s>]+)/i, "");
    return `<html${withoutLang} lang="${route.locale}">`;
  });
  html = html.replace(/<\/head\s*>/i, `${managedHead}\n</head>`);
  html = html.replace(
    rootPattern,
    `<div id="root" data-prerendered="true" data-prerendered-path="${escapeHtml(route.path)}" data-published-content-hash="${route.contentHash}">${route.path === "/" ? renderHomeFirstFold(route, snapshot.origin) : route.renderedBodyHtml}${route.bootstrapPageDocument ? `<script id="hc-published-page-document" type="application/json">${safeJson(route.bootstrapPageDocument)}</script>` : ""}</div>`,
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
