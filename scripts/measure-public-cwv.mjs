import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const requireFromClient = createRequire(
  new URL("../client/package.json", import.meta.url),
);
const { chromium } = requireFromClient("@playwright/test");

const GOOD_THRESHOLDS = Object.freeze({ lcp: 2500, cls: 0.1, inp: 200 });
const VIEWPORTS = Object.freeze([
  { name: "desktop", width: 1920, height: 1200 },
  { name: "mobile", width: 390, height: 844 },
]);

function parseArguments(argv) {
  const options = {
    baseUrl: "",
    enforce: false,
    output: "",
    paths: ["/"],
    quiet: false,
    runs: 1,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--base-url") options.baseUrl = argv[++index] || "";
    else if (argument === "--path") options.paths.push(argv[++index] || "");
    else if (argument === "--runs") options.runs = Number(argv[++index]);
    else if (argument === "--output") options.output = argv[++index] || "";
    else if (argument === "--enforce") options.enforce = true;
    else if (argument === "--quiet") options.quiet = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  options.paths = [...new Set(options.paths.filter(Boolean))];
  if (!Number.isInteger(options.runs) || options.runs < 1 || options.runs > 5) {
    throw new Error("--runs must be an integer from 1 to 5.");
  }
  return options;
}

function normalizeBaseUrl(value) {
  const url = new URL(value);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) {
    throw new Error("--base-url must be a public HTTP(S) origin without credentials.");
  }
  return url.origin;
}

function sanitizeResourceName(value, baseUrl) {
  try {
    const url = new URL(value);
    const queryKeys = [...new Set(url.searchParams.keys())].sort();
    const queryShape = queryKeys.length ? `?${queryKeys.join("&")}` : "";
    return url.origin === baseUrl
      ? `${url.pathname}${queryShape}`
      : `${url.origin}${url.pathname}`;
  } catch {
    return value;
  }
}

async function measureScenario(browser, baseUrl, pathname, viewport, run) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const responseDetails = new Map();
  page.on("response", (response) => {
    responseDetails.set(response.url(), {
      status: response.status(),
      contentType: response.headers()["content-type"] || "",
    });
  });
  const client = await context.newCDPSession(page);
  await client.send("Network.enable");
  await client.send("Network.setCacheDisabled", { cacheDisabled: true });
  await page.addInitScript(() => {
    const metrics = { lcp: 0, cls: 0, inp: 0 };
    let clsSessionValue = 0;
    let clsSessionStart = 0;
    let clsLastShift = 0;
    Object.defineProperty(window, "__hcWebVitals", { value: metrics, configurable: true });
    try {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const latest = entries.at(-1);
        if (latest) metrics.lcp = latest.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch {}
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!("hadRecentInput" in entry) || !entry.hadRecentInput) {
            if (
              clsLastShift
              && entry.startTime - clsLastShift < 1000
              && entry.startTime - clsSessionStart < 5000
            ) {
              clsSessionValue += entry.value || 0;
            } else {
              clsSessionValue = entry.value || 0;
              clsSessionStart = entry.startTime;
            }
            clsLastShift = entry.startTime;
            metrics.cls = Math.max(metrics.cls, clsSessionValue);
          }
        }
      }).observe({ type: "layout-shift", buffered: true });
    } catch {}
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if ((entry.interactionId || 0) > 0) metrics.inp = Math.max(metrics.inp, entry.duration || 0);
        }
      }).observe({ type: "event", buffered: true, durationThreshold: 16 });
    } catch {}
  });

  const target = new URL(pathname, `${baseUrl}/`).href;
  const startedAt = Date.now();
  await page.goto(target, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(750);

  const menu = page.getByRole("button", { name: "打开菜单" });
  if (await menu.isVisible().catch(() => false)) {
    await menu.click();
    const closeMenu = page.getByRole("button", { name: "关闭菜单" });
    if (await closeMenu.isVisible().catch(() => false)) await closeMenu.click();
  } else {
    await page.locator("body").click({ position: { x: 8, y: 8 } });
  }
  await page.waitForTimeout(300);

  const snapshot = await page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0];
    const resources = performance
      .getEntriesByType("resource")
      .map((entry) => ({
        name: entry.name,
        initiatorType: entry.initiatorType,
        startTime: Number(entry.startTime.toFixed(1)),
        duration: Number(entry.duration.toFixed(1)),
        transferSize: entry.transferSize || 0,
        encodedBodySize: entry.encodedBodySize || 0,
        decodedBodySize: entry.decodedBodySize || 0,
      }))
      .sort((left, right) => left.startTime - right.startTime);
    const metrics = window.__hcWebVitals || { lcp: 0, cls: 0, inp: 0 };
    return {
      metrics: {
        lcp: Number(metrics.lcp.toFixed(1)),
        cls: Number(metrics.cls.toFixed(4)),
        inp: Number(metrics.inp.toFixed(1)),
      },
      navigation: navigation
        ? {
            ttfb: Number((navigation.responseStart - navigation.requestStart).toFixed(1)),
            domContentLoaded: Number(navigation.domContentLoadedEventEnd.toFixed(1)),
            load: Number(navigation.loadEventEnd.toFixed(1)),
          }
        : null,
      resources,
    };
  });

  await context.close();
  const metricsAvailable = snapshot.metrics.lcp > 0 && snapshot.metrics.inp > 0;
  return {
    pathname,
    viewport,
    run,
    coldCache: true,
    wallTime: Date.now() - startedAt,
    ...snapshot,
    resources: snapshot.resources.map((entry) => ({
      ...entry,
      name: sanitizeResourceName(entry.name, baseUrl),
      ...(responseDetails.get(entry.name) || {}),
    })),
    assessment: {
      metricsAvailable,
      lcpGood: snapshot.metrics.lcp > 0 && snapshot.metrics.lcp <= GOOD_THRESHOLDS.lcp,
      clsGood: snapshot.metrics.cls <= GOOD_THRESHOLDS.cls,
      inpGood: snapshot.metrics.inp > 0 && snapshot.metrics.inp <= GOOD_THRESHOLDS.inp,
    },
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (!options.baseUrl) throw new Error("--base-url is required.");
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
          args: ["--no-sandbox"],
        }
      : {}),
  });
  const measurements = [];
  try {
    for (const pathname of options.paths) {
      for (const viewport of VIEWPORTS) {
        for (let run = 1; run <= options.runs; run += 1) {
          measurements.push(await measureScenario(browser, baseUrl, pathname, viewport, run));
        }
      }
    }
  } finally {
    await browser.close();
  }

  const result = {
    measuredAt: new Date().toISOString(),
    baseUrl,
    thresholds: GOOD_THRESHOLDS,
    methodology: "Fresh browser context and disabled HTTP cache per run; local headless Chromium; one menu interaction for INP.",
    measurements,
  };
  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  if (options.output) await writeFile(resolve(options.output), serialized, "utf8");
  if (options.quiet) {
    process.stdout.write(`measured ${measurements.length} cold-cache scenario(s)\n`);
  } else {
    process.stdout.write(serialized);
  }
  if (
    options.enforce
    && measurements.some((measurement) => (
      !measurement.assessment.metricsAvailable
      || !measurement.assessment.lcpGood
      || !measurement.assessment.clsGood
      || !measurement.assessment.inpGood
    ))
  ) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}


