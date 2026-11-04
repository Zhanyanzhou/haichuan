/**
 * 第六轮首屏几何与原图回退诊断。
 * 自带 Vite（5191，不代理 3000）和独立浏览器上下文。
 * 失败态是对本任务试样请求的浏览器 Mock，只证明前端行为，不是网关或数据库鉴权。
 */
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const requireClient = createRequire(path.join(root, "client/package.json"));
const requireServer = createRequire(path.join(root, "server/package.json"));
const { createServer } = requireClient("vite");
const react = requireClient("@vitejs/plugin-react").default;
const { chromium } = requireClient("@playwright/test");
const sharp = requireServer("sharp");

const PORT = 5191;
const outputArg = process.argv.indexOf("--output-dir");
if (outputArg !== -1 && !process.argv[outputArg + 1]) throw new Error("--output-dir requires a path");
const outDir = outputArg === -1
  ? path.join(root, "docs/research/image-quality-2026-11-04")
  : path.resolve(root, process.argv[outputArg + 1]);
const shotDir = path.join(outDir, "r6-screenshots");
const evidencePath = path.join(outDir, "cursor-acceptance-r6-evidence.json");

const HTML = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/src/page-builder/dev/heroImageDeliveryFixture.tsx"></script></body></html>`;

function listeners() {
  const text = execFileSync("netstat", ["-ano", "-p", "tcp"], { encoding: "utf8" });
  return text.split(/\r?\n/).filter((line) => /:(3000|5173|5191)\s/.test(line) && /LISTENING/i.test(line));
}

function imagePlugin() {
  const cache = new Map();
  return {
    name: "r6-hero-fixture",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        if (url.pathname === "/hero-image-delivery-fixture") {
          server.transformIndexHtml(url.pathname, HTML).then((html) => {
            res.statusCode = 200;
            res.setHeader("content-type", "text/html; charset=utf-8");
            res.end(html);
          }).catch(next);
          return;
        }
        const match = url.pathname.match(/^\/uploads\/page-assets\/(r6-(desktop|mobile)-[ab])\.png$/);
        if (!match) {
          next();
          return;
        }
        const intrinsic = match[2] === "desktop"
          ? { width: 3840, height: 2160 }
          : { width: 2000, height: 2500 };
        const requested = Number(url.searchParams.get("width"));
        const width = Number.isFinite(requested) && requested > 0
          ? Math.min(requested, intrinsic.width)
          : intrinsic.width;
        const height = Math.max(1, Math.round(intrinsic.height * (width / intrinsic.width)));
        const key = `${match[1]}:${width}x${height}`;
        const send = (body) => {
          res.statusCode = 200;
          res.setHeader("content-type", "image/png");
          res.setHeader("cache-control", "no-store");
          res.setHeader("x-r6-png-width", String(width));
          res.setHeader("content-length", String(body.length));
          res.end(body);
        };
        const cached = cache.get(key);
        if (cached) {
          send(cached);
          return;
        }
        const color = match[2] === "desktop" ? { r: 28, g: 36, b: 48 } : { r: 92, g: 74, b: 58 };
        sharp({ create: { width, height, channels: 3, background: color } }).png().toBuffer()
          .then((body) => {
            cache.set(key, body);
            send(body);
          })
          .catch(next);
      });
    },
  };
}

async function readHero(page) {
  return page.evaluate(() => {
    const published = document.querySelector("[data-page-document-state='published']");
    const media = published?.querySelector(".hc-phase1-hero__media");
    const picture = media?.querySelector("picture");
    const img = media?.querySelector("img");
    const source = media?.querySelector("source");
    const box = media?.getBoundingClientRect();
    const current = img?.currentSrc || "";
    let parsed = null;
    try {
      parsed = current ? new URL(current, location.href) : null;
    } catch {
      parsed = null;
    }
    return {
      mediaWidth: box ? Math.round(box.width * 100) / 100 : 0,
      mediaHeight: box ? Math.round(box.height * 100) / 100 : 0,
      imgSizes: img?.getAttribute("sizes") ?? null,
      sourceSizes: source?.getAttribute("sizes") ?? null,
      delivery: picture?.getAttribute("data-hero-image-delivery") ?? null,
      currentPath: parsed?.pathname ?? null,
      requestWidth: parsed ? Number(parsed.searchParams.get("width")) || null : null,
      naturalWidth: img?.naturalWidth ?? 0,
      naturalHeight: img?.naturalHeight ?? 0,
      placeholder: document.body.innerText.includes("主视觉图片暂不可用"),
    };
  });
}

async function waitForPaint(page, pathPart) {
  await page.waitForFunction((part) => {
    const img = document.querySelector("[data-page-document-state='published'] .hc-phase1-hero__media img");
    return Boolean(img && img.complete && img.naturalWidth > 0 && (!part || img.currentSrc.includes(part)));
  }, pathPart, { timeout: 90000 });
}

function chosenFile(traffic, hero) {
  const width = hero.requestWidth == null ? null : String(hero.requestWidth);
  return [...traffic].reverse().find((row) => row.path === hero.currentPath && row.width === width && row.status === 200);
}

async function waitForChosenFile(traffic, hero) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const file = chosenFile(traffic, hero);
    if (file?.pngWidth) return file;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  return chosenFile(traffic, hero);
}

function near(actual, expected, tolerance = 3) {
  return Math.abs(actual - expected) <= tolerance;
}

function assertCase(name, condition, detail) {
  if (!condition) throw new Error(`${name}: ${detail}`);
}

async function main() {
  await mkdir(shotDir, { recursive: true });
  const started = listeners();
  if (started.some((line) => /:5191\s/.test(line))) {
    const blocked = {
      generatedAt: new Date().toISOString(),
      node: process.version,
      blocked: "5191 已被占用。没有按端口结束进程。",
      listeners: started,
      mockScope: "未启动。失败态 Mock 只证明前端行为，不是网关或数据库鉴权。",
    };
    await writeFile(evidencePath, JSON.stringify(blocked, null, 2));
    throw new Error("5191 is already in use");
  }

  const clientRoot = path.join(root, "client");
  process.chdir(clientRoot);
  const server = await createServer({
    configFile: false,
    root: clientRoot,
    cacheDir: outputArg === -1
      ? path.join(os.tmpdir(), "haichuan-image-r6-vite")
      : path.join(outDir, ".vite-cache"),
    plugins: [react(), imagePlugin()],
    resolve: { alias: { "@": path.join(clientRoot, "src") } },
    server: {
      host: "127.0.0.1",
      port: PORT,
      strictPort: true,
      watch: null,
    },
  });
  const browser = await chromium.launch({ headless: true });
  const cases = [];
  const failures = [];
  try {
    await server.listen();
    const base = `http://127.0.0.1:${PORT}/hero-image-delivery-fixture`;

    async function withPage(viewport, run, { mode = "geometry", routes } = {}) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.dpr,
      });
      const page = await context.newPage();
      const traffic = [];
      page.on("response", async (response) => {
        try {
          const url = response.url();
          if (!url.includes("/uploads/page-assets/") && !url.includes("/api/upload/media/preview-by-storage-key")) return;
          const parsed = new URL(url);
          const row = {
            path: parsed.pathname,
            width: parsed.searchParams.get("width"),
            status: response.status(),
            generatedWidth: Number(response.headers()["x-r6-png-width"]) || null,
            pngWidth: null,
            pngHeight: null,
          };
          if (response.status() === 200 && (response.headers()["content-type"] || "").includes("image")) {
            const body = await response.body().catch(() => null);
            if (body) {
              const meta = await sharp(body).metadata();
              row.pngWidth = meta.width ?? null;
              row.pngHeight = meta.height ?? null;
            }
          }
          traffic.push(row);
        } catch {
          // 页面关闭后的迟到响应不计入本轮证据。
        }
      });
      if (routes) await routes(page);
      await page.goto(`${base}?mode=${mode}`, { waitUntil: "domcontentloaded", timeout: 90000 });
      try {
        return await run(page, traffic);
      } finally {
        await context.close();
      }
    }

    const geometry = [
      {
        name: "desktop-1920-dpr2",
        viewport: { width: 1920, height: 1080, dpr: 2 },
        file: "r6-desktop-a.png",
        expect: (hero, file) => {
          assertCase("desktop path", hero.currentPath?.endsWith("/r6-desktop-a.png"), hero.currentPath);
          assertCase("desktop width", hero.requestWidth === 3840, String(hero.requestWidth));
          assertCase("desktop decoded", file?.pngWidth === 3840 && file?.pngHeight === 2160, `${file?.pngWidth}x${file?.pngHeight}`);
          assertCase("desktop sizes", hero.imgSizes?.includes("100svh") && hero.imgSizes.includes("1.7778"), hero.imgSizes);
          assertCase("desktop frame", near(hero.mediaWidth, 1920, 20) && near(hero.mediaHeight, 1080, 20), `${hero.mediaWidth}x${hero.mediaHeight}`);
        },
      },
      {
        name: "phone-390-dpr3",
        viewport: { width: 390, height: 844, dpr: 3 },
        file: "r6-mobile-a.png",
        expect: (hero, file) => {
          assertCase("phone path", hero.currentPath?.endsWith("/r6-mobile-a.png"), hero.currentPath);
          assertCase("phone width", hero.requestWidth === 1200, String(hero.requestWidth));
          assertCase("phone decoded", file?.pngWidth === 1200, String(file?.pngWidth));
          assertCase("phone sizes", hero.sourceSizes === "100vw" && !hero.sourceSizes.includes("100svh"), hero.sourceSizes);
          assertCase("phone frame", near(hero.mediaHeight, hero.mediaWidth * 1.25, 4), `${hero.mediaWidth}x${hero.mediaHeight}`);
        },
      },
      {
        name: "phone-767-dpr2",
        viewport: { width: 767, height: 1000, dpr: 2 },
        file: "r6-mobile-a.png",
        expect: (hero, file) => {
          assertCase("767 path", hero.currentPath?.endsWith("/r6-mobile-a.png"), hero.currentPath);
          assertCase("767 sizes", hero.sourceSizes === "100vw", hero.sourceSizes);
          assertCase("767 frame", hero.mediaHeight < 990 && near(hero.mediaHeight, hero.mediaWidth * 1.25, 4), `${hero.mediaWidth}x${hero.mediaHeight}`);
          assertCase("767 width", hero.requestWidth === 1680, String(hero.requestWidth));
          assertCase("767 decoded", file?.pngWidth === 1680, String(file?.pngWidth));
        },
      },
      {
        name: "tablet-768-dpr2",
        viewport: { width: 768, height: 1024, dpr: 2 },
        file: "r6-desktop-a.png",
        expect: (hero, file) => {
          assertCase("768 path", hero.currentPath?.endsWith("/r6-desktop-a.png"), hero.currentPath);
          assertCase("768 sizes", hero.imgSizes?.startsWith("(max-width: 1023px)"), hero.imgSizes);
          assertCase("768 frame", hero.mediaHeight < 500 && near(hero.mediaHeight, hero.mediaWidth * 9 / 16, 4), `${hero.mediaWidth}x${hero.mediaHeight}`);
          assertCase("768 width", hero.requestWidth === 1680, String(hero.requestWidth));
          assertCase("768 decoded", file?.pngWidth === 1680, String(file?.pngWidth));
        },
      },
      {
        name: "tablet-1023-dpr2",
        viewport: { width: 1023, height: 1366, dpr: 2 },
        file: "r6-desktop-a.png",
        expect: (hero, file) => {
          assertCase("1023 frame", hero.mediaHeight < 700 && near(hero.mediaHeight, hero.mediaWidth * 9 / 16, 4), `${hero.mediaWidth}x${hero.mediaHeight}`);
          assertCase("1023 width", hero.requestWidth === 2400, String(hero.requestWidth));
          assertCase("1023 decoded", file?.pngWidth === 2400, String(file?.pngWidth));
        },
      },
      {
        name: "desktop-1024-dpr2",
        viewport: { width: 1024, height: 1366, dpr: 2 },
        file: "r6-desktop-a.png",
        expect: (hero, file) => {
          assertCase("1024 frame", hero.mediaHeight > 1200, `${hero.mediaWidth}x${hero.mediaHeight}`);
          assertCase("1024 sizes", hero.imgSizes?.includes("100svh"), hero.imgSizes);
          assertCase("1024 width", hero.requestWidth === 3840, String(hero.requestWidth));
          assertCase("1024 decoded", file?.pngWidth === 3840, String(file?.pngWidth));
        },
      },
      {
        name: "cover-1200x1800-dpr2",
        viewport: { width: 1200, height: 1800, dpr: 2 },
        file: "r6-desktop-a.png",
        expect: (hero, file) => {
          assertCase("cover box", near(hero.mediaWidth, 1200, 20) && near(hero.mediaHeight, 1800, 20), `${hero.mediaWidth}x${hero.mediaHeight}`);
          assertCase("cover width", hero.requestWidth === 3840, String(hero.requestWidth));
          assertCase("cover decoded", file?.pngWidth === 3840 && file?.pngHeight === 2160, `${file?.pngWidth}x${file?.pngHeight}`);
        },
      },
    ];

    for (const item of geometry) {
      try {
        const outcome = await withPage(item.viewport, async (page, traffic) => {
          await waitForPaint(page, item.file);
          const hero = await readHero(page);
          await page.locator(".hc-phase1-hero__media").screenshot({
            path: path.join(shotDir, `${item.name}.png`),
          });
          const file = await waitForChosenFile(traffic, hero);
          item.expect(hero, file);
          return { hero, file };
        });
        cases.push({ name: item.name, ok: true, ...outcome });
      } catch (error) {
        failures.push({ name: item.name, error: String(error) });
        cases.push({ name: item.name, ok: false, error: String(error) });
      }
    }

    try {
      const stability = await withPage({ width: 1920, height: 1080, dpr: 2 }, async (page) => {
        await waitForPaint(page, "r6-desktop-a.png");
        const beforeScroll = await readHero(page);
        await page.evaluate(() => window.scrollTo(0, 48));
        await page.waitForTimeout(250);
        const afterScroll = await readHero(page);
        await page.setViewportSize({ width: 390, height: 844 });
        await waitForPaint(page, "r6-mobile-a.png");
        const phone = await readHero(page);
        await page.setViewportSize({ width: 1024, height: 1366 });
        await waitForPaint(page, "width=3840");
        const wide = await readHero(page);
        await page.setViewportSize({ width: 390, height: 844 });
        await waitForPaint(page, "r6-mobile-a.png");
        await page.waitForTimeout(250);
        const phoneAgain = await readHero(page);
        assertCase("scroll src", beforeScroll.currentPath === afterScroll.currentPath && beforeScroll.requestWidth === afterScroll.requestWidth, `${beforeScroll.requestWidth} -> ${afterScroll.requestWidth}`);
        assertCase("scroll box", near(beforeScroll.mediaWidth, afterScroll.mediaWidth, 1) && near(beforeScroll.mediaHeight, afterScroll.mediaHeight, 1), "box moved");
        assertCase("resize return", phone.currentPath === phoneAgain.currentPath && phone.requestWidth === phoneAgain.requestWidth, `${phone.requestWidth} -> ${phoneAgain.requestWidth}`);
        assertCase("resize box", near(phone.mediaWidth, phoneAgain.mediaWidth, 1) && near(phone.mediaHeight, phoneAgain.mediaHeight, 1), "box drifted");
        assertCase("wide after phone", wide.requestWidth === 3840, String(wide.requestWidth));
        return { beforeScroll, afterScroll, phone, wide, phoneAgain };
      });
      cases.push({ name: "resize-scroll-stable", ok: true, stability });
    } catch (error) {
      failures.push({ name: "resize-scroll-stable", error: String(error) });
      cases.push({ name: "resize-scroll-stable", ok: false, error: String(error) });
    }

    async function fallbackRoutes(page, { both, blockUploads }) {
      await page.route(/\/uploads\/page-assets\//, async (route) => {
        if (blockUploads) {
          await route.fulfill({ status: 404, body: "blocked" });
          return;
        }
        const url = new URL(route.request().url());
        const derivative = url.searchParams.has("width");
        const firstImage = url.pathname.includes("-a.png");
        if (both || (derivative && firstImage)) {
          await route.fulfill({ status: 404, body: "derivative-missing" });
          return;
        }
        await route.continue();
      });
    }

    for (const item of [
      { name: "fallback-phone", viewport: { width: 390, height: 844, dpr: 3 }, file: "/r6-mobile-a.png", decoded: 2000 },
      { name: "fallback-desktop", viewport: { width: 1920, height: 1080, dpr: 2 }, file: "/r6-desktop-a.png", decoded: 3840 },
    ]) {
      try {
        const result = await withPage(item.viewport, async (page, traffic) => {
          await waitForPaint(page, item.file);
          const hero = await readHero(page);
          await page.locator(".hc-phase1-hero__media").screenshot({ path: path.join(shotDir, `${item.name}.png`) });
          const before = traffic.length;
          await page.waitForTimeout(600);
          assertCase(`${item.name} delivery`, hero.delivery === "original", hero.delivery);
          assertCase(`${item.name} path`, hero.currentPath?.endsWith(item.file), hero.currentPath);
          assertCase(`${item.name} original`, hero.requestWidth === null, String(hero.requestWidth));
          assertCase(`${item.name} decoded`, hero.naturalWidth === item.decoded, String(hero.naturalWidth));
          assertCase(`${item.name} bounded`, traffic.length === before, `grew ${traffic.length - before}`);
          const originals = traffic.filter((row) => row.path.endsWith(item.file) && row.width === null && row.status === 200);
          assertCase(`${item.name} requested`, originals.length >= 1, JSON.stringify(traffic));
          await page.locator("#r6-swap").click();
          await page.waitForFunction(() => {
            const img = document.querySelector("[data-page-document-state='published'] .hc-phase1-hero__media img");
            return Boolean(img?.currentSrc.includes("-b.png") && img.complete && img.naturalWidth > 0);
          });
          const swapped = await readHero(page);
          assertCase(`${item.name} swap`, swapped.delivery === "derived" && swapped.currentPath?.includes("-b.png") && swapped.requestWidth !== null, JSON.stringify(swapped));
          return { hero, swapped, traffic };
        }, { mode: "fallback", routes: (page) => fallbackRoutes(page, { both: false }) });
        cases.push({ name: item.name, ok: true, result });
      } catch (error) {
        failures.push({ name: item.name, error: String(error) });
        cases.push({ name: item.name, ok: false, error: String(error) });
      }
    }

    try {
      const failed = await withPage({ width: 390, height: 844, dpr: 2 }, async (page, traffic) => {
        await page.waitForFunction(() => document.body.innerText.includes("主视觉图片暂不可用"), null, { timeout: 20000 });
        await page.waitForTimeout(700);
        const hero = await readHero(page);
        await page.locator(".hc-phase1-hero").screenshot({ path: path.join(shotDir, "fallback-both-phone.png") });
        assertCase("both placeholder", hero.placeholder && hero.delivery === null, JSON.stringify(hero));
        assertCase("both bounded", traffic.length > 0 && traffic.length <= 6, String(traffic.length));
        return { hero, traffic };
      }, { mode: "fallback", routes: (page) => fallbackRoutes(page, { both: true }) });
      const failedDesktop = await withPage({ width: 1280, height: 800, dpr: 2 }, async (page, traffic) => {
        await page.waitForFunction(() => document.body.innerText.includes("主视觉图片暂不可用"), null, { timeout: 20000 });
        await page.waitForTimeout(700);
        const hero = await readHero(page);
        assertCase("desktop both", hero.placeholder && traffic.length > 0 && traffic.length <= 6, String(traffic.length));
        return { hero, traffic };
      }, { mode: "fallback", routes: (page) => fallbackRoutes(page, { both: true }) });
      cases.push({ name: "fallback-both", ok: true, phone: failed, desktop: failedDesktop });
    } catch (error) {
      failures.push({ name: "fallback-both", error: String(error) });
      cases.push({ name: "fallback-both", ok: false, error: String(error) });
    }

    try {
      const edit = await withPage({ width: 1280, height: 800, dpr: 1 }, async (page, traffic) => {
        await waitForPaint(page, "blob:");
        const hero = await readHero(page);
        await page.locator(".hc-phase1-hero__media").screenshot({ path: path.join(shotDir, "edit-preview.png") });
        assertCase("edit blob", hero.currentPath?.startsWith("blob:") || page.url().includes("mode=edit") && hero.naturalWidth > 0 && hero.delivery === "editor", JSON.stringify(hero));
        const current = await page.evaluate(() => document.querySelector(".hc-phase1-hero__media img")?.currentSrc ?? "");
        assertCase("edit current blob", current.startsWith("blob:"), current);
        assertCase("edit no uploads", traffic.every((row) => row.path.includes("preview-by-storage-key")), JSON.stringify(traffic));
        return { hero, current, traffic };
      }, {
        mode: "edit",
        routes: async (page) => {
          await page.route(/\/api\/upload\/media\/preview-by-storage-key/, async (route) => {
            const body = await sharp({ create: { width: 32, height: 18, channels: 3, background: { r: 20, g: 20, b: 20 } } }).png().toBuffer();
            await route.fulfill({ status: 200, contentType: "image/png", body });
          });
          await fallbackRoutes(page, { blockUploads: true });
        },
      });
      const editFail = await withPage({ width: 1280, height: 800, dpr: 1 }, async (page, traffic) => {
        await page.waitForSelector("[data-asset-placeholder-status]", { timeout: 20000 });
        const hero = await readHero(page);
        await page.locator(".hc-phase1-hero").screenshot({ path: path.join(shotDir, "edit-fail.png") });
        assertCase("edit fail keeps editor placeholder", hero.delivery !== "original" && !hero.placeholder, JSON.stringify(hero));
        assertCase("edit fail no uploads", traffic.every((row) => !row.path.includes("/uploads/")), JSON.stringify(traffic));
        assertCase("edit fail asked preview", traffic.some((row) => row.path.includes("preview-by-storage-key")), JSON.stringify(traffic));
        return { hero, traffic };
      }, {
        mode: "edit-fail",
        routes: async (page) => {
          await page.route(/\/api\/upload\/media\/preview-by-storage-key/, (route) => route.fulfill({ status: 404, body: "no-preview" }));
          await fallbackRoutes(page, { blockUploads: true });
        },
      });
      cases.push({ name: "edit-preview", ok: true, edit, editFail });
    } catch (error) {
      failures.push({ name: "edit-preview", error: String(error) });
      cases.push({ name: "edit-preview", ok: false, error: String(error) });
    }
    // 换回同一来源也必须是新的加载周期，不继承第一次 A 的 original/failed 状态。
    for (const viewport of [
      { name: "phone", width: 390, height: 844, dpr: 3, file: "r6-mobile-a.png", derived: 1200 },
      { name: "desktop", width: 1920, height: 1080, dpr: 2, file: "r6-desktop-a.png", derived: 3840 },
    ]) {
      for (const scenario of ["recovered", "original-blocked", "still-failing"]) {
        const name = `roundtrip-${viewport.name}-${scenario}`;
        let returningToA = false;
        try {
          const result = await withPage(viewport, async (page, traffic) => {
            if (scenario === "still-failing") {
              await page.waitForFunction(() => document.body.innerText.includes("主视觉图片暂不可用"));
            } else {
              await waitForPaint(page, viewport.file);
              const initial = await readHero(page);
              assertCase(`${name} initial fallback`, initial.delivery === "original", JSON.stringify(initial));
            }
            await page.locator("#r6-swap").click();
            await waitForPaint(page, "-b.png");
            const middle = await readHero(page);
            assertCase(`${name} B derived`, middle.delivery === "derived", JSON.stringify(middle));
            returningToA = true;
            const beforeReturn = traffic.length;
            await page.locator("#r6-swap").click();
            if (scenario === "still-failing") {
              await page.waitForFunction(() => document.body.innerText.includes("主视觉图片暂不可用"));
              // 有界观察：终态之后不能再发第三次请求或重新进入重试。
              await page.waitForTimeout(700);
              const hero = await readHero(page);
              const returnRequests = traffic.slice(beforeReturn).filter((row) => row.path.endsWith(viewport.file));
              assertCase(`${name} terminal`, hero.placeholder && hero.delivery === null, JSON.stringify(hero));
              assertCase(`${name} bounded`, returnRequests.length === 2
                && returnRequests[0].width === String(viewport.derived)
                && returnRequests[1].width === null
                && returnRequests.every((row) => row.status === 404), JSON.stringify(returnRequests));
              return { middle, hero, returnRequests };
            }
            await waitForPaint(page, viewport.file);
            const hero = await readHero(page);
            const file = await waitForChosenFile(traffic, hero);
            const returnRequests = traffic.slice(beforeReturn).filter((row) => row.path.endsWith(viewport.file));
            assertCase(`${name} fresh derivative`, hero.delivery === "derived"
              && hero.requestWidth === viewport.derived
              && file?.pngWidth === viewport.derived
              && !hero.placeholder, JSON.stringify({ hero, file }));
            assertCase(`${name} no original`, returnRequests.length > 0
              && returnRequests.every((row) => row.width !== null && row.status === 200), JSON.stringify(returnRequests));
            await page.locator(".hc-phase1-hero__media").screenshot({ path: path.join(shotDir, `${name}.png`) });
            return { middle, hero, file, returnRequests };
          }, {
            mode: "fallback",
            routes: async (page) => {
              await page.route(/\/uploads\/page-assets\//, async (route) => {
                const url = new URL(route.request().url());
                const isA = url.pathname.endsWith("-a.png");
                const derivative = url.searchParams.has("width");
                const failA = scenario === "still-failing"
                  || (!returningToA && derivative)
                  || (returningToA && scenario === "original-blocked" && !derivative);
                if (isA && failA) await route.fulfill({ status: 404, body: "transient-image-failure" });
                else await route.continue();
              });
            },
          });
          cases.push({ name, ok: true, result });
        } catch (error) {
          failures.push({ name, error: String(error) });
          cases.push({ name, ok: false, error: String(error) });
        }
      }
    }
    for (const sample of [
      { name: "single-desktop-on-phone", only: "desktop", width: 390, height: 844, file: "r6-desktop-a.png" },
      { name: "single-mobile-on-desktop", only: "mobile", width: 1920, height: 1080, file: "r6-mobile-a.png" },
    ]) {
      try {
        const result = await withPage({ ...sample, dpr: 2 }, async (page, traffic) => {
          await waitForPaint(page, sample.file);
          const hero = await readHero(page);
          const file = await waitForChosenFile(traffic, hero);
          assertCase(sample.name, hero.delivery === "derived" && hero.currentPath?.endsWith(sample.file)
            && (file?.pngWidth ?? 0) > 0, JSON.stringify({ hero, file }));
          return { hero, file };
        }, { mode: `geometry&only=${sample.only}` });
        cases.push({ name: sample.name, ok: true, result });
      } catch (error) {
        failures.push({ name: sample.name, error: String(error) });
        cases.push({ name: sample.name, ok: false, error: String(error) });
      }
    }

    // 端点切换只影响当前端的加载状态，另一端的失败/回退不能随之传播。
    for (const direction of [
      { name: "phone-to-desktop", width: 390, height: 844, nextWidth: 1920, nextHeight: 1080, bad: "mobile", good: "desktop" },
      { name: "desktop-to-phone", width: 1920, height: 1080, nextWidth: 390, nextHeight: 844, bad: "desktop", good: "mobile" },
    ]) {
      for (const terminal of [true, false]) {
        const name = `endpoint-${direction.name}-${terminal ? "failed" : "fallback"}`;
        try {
          const result = await withPage({ ...direction, dpr: 2 }, async (page, traffic) => {
            const badFile = `r6-${direction.bad}-a.png`;
            const goodFile = `r6-${direction.good}-a.png`;
            if (terminal) {
              await page.waitForFunction(() => document.body.innerText.includes("主视觉图片暂不可用"));
            } else {
              await waitForPaint(page, badFile);
              const fallback = await readHero(page);
              await waitForChosenFile(traffic, fallback);
              assertCase(`${name} initial original`, fallback.delivery === "original", JSON.stringify(fallback));
            }
            const failedOrFallback = await readHero(page);
            await page.setViewportSize({ width: direction.nextWidth, height: direction.nextHeight });
            await waitForPaint(page, goodFile);
            const healthy = await readHero(page);
            const file = await waitForChosenFile(traffic, healthy);
            assertCase(`${name} healthy derived`, healthy.delivery === "derived" && !healthy.placeholder
              && (file?.pngWidth ?? 0) > 0, JSON.stringify({ healthy, file }));
            assertCase(`${name} healthy no original`, !traffic.some((row) => row.path.endsWith(goodFile) && row.width === null),
              JSON.stringify(traffic));
            await page.locator(".hc-phase1-hero__media").screenshot({ path: path.join(shotDir, `${name}.png`) });
            const badRequestsBeforeReturn = traffic.filter((row) => row.path.endsWith(badFile)).length;
            const allRequestsBeforeReturn = traffic.length;
            await page.setViewportSize({ width: direction.width, height: direction.height });
            if (terminal) {
              await page.waitForFunction(() => document.body.innerText.includes("主视觉图片暂不可用"));
              // 观察返回失败端和同端缩放：已终止的资源不能由resize启动新重试。
              await page.waitForTimeout(700);
              await page.setViewportSize({ width: direction.width + (direction.bad === "mobile" ? 20 : -100), height: direction.height });
              await page.waitForTimeout(700);
              const returned = await readHero(page);
              const badRequestsAfterReturn = traffic.filter((row) => row.path.endsWith(badFile)).length;
              assertCase(`${name} terminal retained`, returned.placeholder && returned.delivery === null, JSON.stringify(returned));
              assertCase(`${name} no resize retry`, badRequestsAfterReturn === badRequestsBeforeReturn,
                `${badRequestsBeforeReturn} -> ${badRequestsAfterReturn}`);
              assertCase(`${name} no other endpoint request`, traffic.length === allRequestsBeforeReturn,
                JSON.stringify(traffic.slice(allRequestsBeforeReturn)));
              return { failedOrFallback, healthy, file, returned, badRequestsBeforeReturn, badRequestsAfterReturn,
                allRequestsBeforeReturn, allRequestsAfterReturn: traffic.length };
            }
            await waitForPaint(page, badFile);
            const returned = await readHero(page);
            assertCase(`${name} own fallback retained`, returned.delivery === "original"
              && returned.requestWidth === null && !returned.placeholder, JSON.stringify(returned));
            return { failedOrFallback, healthy, file, returned };
          }, {
            mode: "geometry",
            routes: async (page) => {
              await page.route(/\/uploads\/page-assets\//, async (route) => {
                const url = new URL(route.request().url());
                if (url.pathname.includes(`r6-${direction.bad}-`)
                  && (terminal || url.searchParams.has("width"))) {
                  await route.fulfill({ status: 404, body: "one-endpoint-unavailable" });
                } else await route.continue();
              });
            },
          });
          cases.push({ name, ok: true, result });
        } catch (error) {
          failures.push({ name, error: String(error) });
          cases.push({ name, ok: false, error: String(error) });
        }
      }
    }

    try {
      const result = await withPage({ width: 390, height: 844, dpr: 2 }, async (page, traffic) => {
        await page.waitForFunction(() => document.body.innerText.includes("主视觉图片暂不可用"));
        const desktopFailure = page.waitForResponse((response) => {
          const url = new URL(response.url());
          return url.pathname.endsWith("r6-desktop-a.png") && !url.searchParams.has("width") && response.status() === 404;
        });
        await page.setViewportSize({ width: 1920, height: 1080 });
        await desktopFailure;
        await page.waitForFunction(() => document.body.innerText.includes("主视觉图片暂不可用"));
        await page.waitForTimeout(700);
        const requestsBefore = traffic.length;
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForFunction(() => document.body.innerText.includes("主视觉图片暂不可用"));
        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.waitForTimeout(700);
        const hero = await readHero(page);
        assertCase("both endpoints bounded", requestsBefore === 4 && traffic.length === requestsBefore
          && traffic.every((row) => row.status === 404) && hero.placeholder, JSON.stringify({ requestsBefore, hero, traffic }));
        return { hero, traffic };
      }, { mode: "geometry", routes: (page) => fallbackRoutes(page, { both: true }) });
      cases.push({ name: "both-endpoints-failed-no-resize-retry", ok: true, result });
    } catch (error) {
      failures.push({ name: "both-endpoints-failed-no-resize-retry", error: String(error) });
      cases.push({ name: "both-endpoints-failed-no-resize-retry", ok: false, error: String(error) });
    }
  } finally {
    await browser.close();
    await server.close();
  }

  const ended = listeners();
  const evidence = {
    generatedAt: new Date().toISOString(),
    node: process.version,
    port: PORT,
    proxyToUserApi: false,
    mockScope: "失败态只拦截本任务试样的浏览器请求，证明前端回退。不是真实网关，也不是数据库鉴权。解码尺寸是诊断服务按请求宽度生成的 PNG，真实网关解码沿用第五轮 closure。",
    listenersBefore: started,
    listenersAfter: ended,
    userPortsUnchanged: started.filter((line) => /:(3000|5173)\s/.test(line)).join("\n")
      === ended.filter((line) => /:(3000|5173)\s/.test(line)).join("\n"),
    failures,
    cases,
  };
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ evidencePath, cases: cases.length, failures: failures.length, userPortsUnchanged: evidence.userPortsUnchanged }));
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  process.exitCode = 1;
  console.error(error);
});
