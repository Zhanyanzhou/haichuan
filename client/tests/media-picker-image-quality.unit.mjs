/**
 * 真实 MediaPickerField 入口。GET 都是 route-Mock，不是已登录后台，也不是数据库联调。
 * 竖图用例从 mediaSpecMatchingFrame(1440, 810, "9:16") 生成规格，不手工传 designWidth=390。
 */
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Window } from "happy-dom";

const here = dirname(fileURLToPath(import.meta.url));
const clientRoot = join(here, "..");
const require = createRequire(join(clientRoot, "package.json"));
const esbuild = require("esbuild");

const MOBILE_URL = "/uploads/page-assets/mobile-portrait.png";
const WIDE_URL = "/uploads/page-assets/wide-hero.png";
const FIRST_URL = "/uploads/page-assets/first-choice.png";
const SECOND_URL = "/uploads/page-assets/second-choice.png";

let domWindow;
const baselineMessagePorts = new Set();

function messagePorts() {
  return (process._getActiveHandles?.() ?? []).filter((handle) => handle?.constructor?.name === "MessagePort");
}

async function settleWindow(work) {
  let timer;
  try {
    await Promise.race([
      work,
      new Promise((resolve) => {
        timer = setTimeout(resolve, 3000);
        timer.unref?.();
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** happy-dom 的 abort/close 返回 Promise。浏览器包里的 React 调度器还会留下 MessagePort。 */
async function closeDom() {
  const current = domWindow;
  domWindow = undefined;
  if (!current) return;
  try {
    await settleWindow(Promise.resolve(current.happyDOM?.abort?.()));
    await settleWindow(Promise.resolve(current.happyDOM?.close?.()));
  } catch {
    // 上一扇测试窗已经关闭。
  }
  for (const handle of messagePorts()) {
    if (baselineMessagePorts.has(handle)) continue;
    try { handle.close?.(); } catch { /* 端口可能已经关闭。 */ }
    try { handle.unref?.(); } catch { /* 某些端口不能 unref。 */ }
  }
}

function installDom() {
  const window = new Window({ url: "http://127.0.0.1:5173/editor" });
  domWindow = window;
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return false; },
  });
  const names = [
    "window", "document", "navigator", "HTMLElement", "SVGElement", "Element", "Node",
    "DocumentFragment", "MutationObserver", "getComputedStyle", "requestAnimationFrame",
    "cancelAnimationFrame", "localStorage", "sessionStorage", "Image", "Event", "CustomEvent",
    "MessageChannel", "DOMParser", "NodeFilter", "HTMLInputElement", "HTMLButtonElement",
    "Comment", "Text",
  ];
  const publish = (name, value) => {
    if (value === undefined) return;
    try {
      Object.defineProperty(globalThis, name, {
        configurable: true,
        writable: true,
        value,
      });
    } catch {
      // Node 自带的只读全局（例如 navigator）保留；组件通过 window 访问 happy-dom。
    }
  };
  for (const name of names) publish(name, window[name]);
  const prototypes = [];
  for (let cursor = window; cursor && cursor !== Object.prototype; cursor = Object.getPrototypeOf(cursor)) {
    prototypes.push(cursor);
  }
  for (const cursor of prototypes) {
    for (const name of Object.getOwnPropertyNames(cursor)) {
      if (name === "constructor" || name in globalThis) continue;
      publish(name, window[name]);
    }
  }
  globalThis.window = window;
  globalThis.self = window;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  return window;
}

const bundleDir = join(here, ".tmp-image-quality");
let fixture;

async function loadFixture() {
  await closeDom();
  installDom();
  mkdirSync(bundleDir, { recursive: true });
  const outfile = join(bundleDir, "picker-fixture.mjs");
  const result = await esbuild.build({
    absWorkingDir: clientRoot,
    entryPoints: [join(here, "media-picker-image-quality.entry.tsx")],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    jsx: "automatic",
    alias: { "@": join(clientRoot, "src") },
    define: {
      "process.env.NODE_ENV": '"test"',
      "import.meta.env": JSON.stringify({
        MODE: "test",
        DEV: false,
        PROD: false,
        VITE_API_BASE_URL: "/api",
        VITE_PUBLIC_SITE_ORIGIN: "",
        VITE_ANALYTICS_ENABLED: "false",
      }),
    },
    loader: { ".css": "empty" },
    logLevel: "silent",
  });
  const js = result.outputFiles.find((file) => file.text.includes("mediaSpecMatchingFrame"));
  if (!js) throw new Error("fixture bundle missing");
  writeFileSync(outfile, js.text);
  fixture = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);
}

function routeMock(data) {
  return { data: { code: 200, data, message: "ok" } };
}

function measuredItem(url, displayWidth, displayHeight) {
  return {
    url,
    type: "image",
    name: "fixture",
    createdAt: "2026-11-04T00:00:00.000Z",
    displayWidth,
    displayHeight,
    metadataStatus: "measured",
  };
}

function seed(item) {
  localStorage.setItem("haichuan.page-media", JSON.stringify(item ? [item] : []));
}

async function settle(fixture) {
  for (let i = 0; i < 6; i += 1) await fixture.flush();
}

function text(host, selector) {
  return host.querySelector(selector)?.textContent ?? "";
}

test("模板设计和页面装修都把换框规格交给同一上传字段", () => {
  const template = readFileSync(join(clientRoot, "src/page-builder/template-editor/TemplateDefaultContentControls.tsx"), "utf8");
  const inspector = readFileSync(join(clientRoot, "src/page-builder/dynamic-template-instance/DynamicTemplateInstanceInspector.tsx"), "utf8");
  assert.match(template, /mediaSpecMatchingFrame\(\s*slot\.validation\.recommendedWidth/);
  assert.match(template, /device=\{breakpoint === "mobile" \? "mobile" : "desktop"\}/);
  assert.match(inspector, /mediaSpecMatchingFrame\(/);
  assert.match(inspector, /spec=\{activeSpec\}/);
  assert.match(inspector, /device=\{compositionDevice\}/);
});

describe("MediaPickerField 图片质量", { concurrency: 1 }, () => {
before(() => {
  for (const handle of messagePorts()) baselineMessagePorts.add(handle);
  return loadFixture();
});
after(async () => {
  await closeDom();
  await esbuild.stop();
  rmSync(bundleDir, { recursive: true, force: true });
});

test("真实父规格 810×1440 在手机 9:16 框里建议约 1171，而不是 2431", async () => {
    const spec = fixture.mediaSpecMatchingFrame(1440, 810, "9:16", "手机");
    assert.equal(spec.designCanvasWidth, 1440);
    assert.equal(spec.width, 810);
    seed(measuredItem(MOBILE_URL, 941, 1672));
    let reads = 0;
    fixture.uploadApi.getPageMediaByUrl = async () => {
      reads += 1;
      throw new Error("trusted cache must not fetch");
    };
    const view = await fixture.mount({
      device: "mobile",
      value: MOBILE_URL,
      spec,
      frameLabel: "9:16",
      previewFit: "cover",
    });
    await settle(fixture);
    const design = text(view.host, "[data-image-design]");
    const sharpness = text(view.host, "[data-image-sharpness]");
    assert.match(design, /上传推荐 810×1440/);
    assert.match(design, /模板设计基准 1440 宽/);
    assert.match(design, /设计参考 390×693/);
    assert.match(sharpness, /390 宽、3 倍屏/);
    assert.match(sharpness, /建议源宽约 1171/);
    assert.equal(sharpness.includes("2431"), false);
    assert.equal(sharpness.includes("810 宽"), false);
    assert.equal(reads, 0);
    await view.unmount();
});

test("半栏、作者缩放和横图铺满竖框各自计算", async () => {
    fixture.uploadApi.getPageMediaByUrl = async () => {
      throw new Error("trusted cache must not fetch");
    };
    const half = fixture.mediaSpecFromRecommendation(720, 405, "16:9", "半栏");
    seed(measuredItem(WIDE_URL, 1600, 900));
    const halfView = await fixture.mount({
      device: "desktop",
      value: WIDE_URL,
      spec: half,
      frameLabel: "16:9",
      previewFit: "cover",
    });
    await settle(fixture);
    const halfSharpness = text(halfView.host, "[data-image-sharpness]");
    assert.match(halfSharpness, /960 宽、2 倍屏/);
    assert.match(halfSharpness, /建议源宽约 1920/);
    assert.equal(halfSharpness.includes("够用"), false);
    await halfView.unmount();

    const portrait = fixture.mediaSpecMatchingFrame(1440, 810, "9:16", "手机");
    seed(measuredItem(WIDE_URL, 3840, 2160));
    const coverView = await fixture.mount({
      device: "mobile",
      value: WIDE_URL,
      spec: portrait,
      frameLabel: "9:16",
      previewFit: "cover",
    });
    await settle(fixture);
    const coverSharpness = text(coverView.host, "[data-image-sharpness]");
    assert.match(coverSharpness, /3698/);
    assert.equal(coverSharpness.includes("1171"), false);
    await coverView.unmount();

    seed(measuredItem(MOBILE_URL, 941, 1672));
    const scaledView = await fixture.mount({
      device: "mobile",
      value: MOBILE_URL,
      spec: portrait,
      frameLabel: "9:16",
      previewFit: "cover",
      previewZoom: 1.2,
    });
    await settle(fixture);
    assert.match(text(scaledView.host, "[data-image-sharpness]"), /建议源宽约 1405/);
    await scaledView.unmount();

    const inheritedView = await fixture.mount({
      device: "mobile",
      value: "",
      fallbackSrc: MOBILE_URL,
      spec: portrait,
      frameLabel: "9:16",
      previewFit: "cover",
    });
    await settle(fixture);
    const inheritedSource = text(inheritedView.host, "[data-image-source-pixels]");
    assert.match(inheritedSource, /沿用桌面图/);
    assert.match(inheritedSource, /941×1672/);
    assert.match(text(inheritedView.host, "[data-image-sharpness]"), /建议源宽约 1171/);
    await inheritedView.unmount();
});

test("route-Mock：unknown 旧宽高、无尺寸、失败重试、缓存再读、EXIF 和迟到响应", async () => {
    const desktop = fixture.mediaSpecFromRecommendation(1440, 810, "16:9", "桌面");
    seed(null);

    fixture.uploadApi.getPageMediaByUrl = async () => routeMock({
      url: WIDE_URL,
      name: "old",
      width: 3840,
      height: 2160,
      metadataStatus: "unknown",
    });
    const unknownView = await fixture.mount({
      device: "desktop",
      value: WIDE_URL,
      spec: desktop,
      frameLabel: "16:9",
    });
    await settle(fixture);
    assert.equal(unknownView.host.querySelector("[data-media-facts-state]")?.getAttribute("data-media-facts-state"), "unknown");
    assert.match(text(unknownView.host, "[data-image-sharpness]"), /还不能确认/);
    assert.equal(text(unknownView.host, "[data-image-sharpness]").includes("当前像素够用"), false);
    assert.equal(fixture.readPageMediaLibrary().some((item) => item.displayWidth), false);
    await unknownView.unmount();

    fixture.uploadApi.getPageMediaByUrl = async () => routeMock({ url: WIDE_URL, name: "empty" });
    const emptyView = await fixture.mount({
      device: "desktop",
      value: WIDE_URL,
      spec: desktop,
      frameLabel: "16:9",
    });
    await settle(fixture);
    assert.equal(emptyView.host.querySelector("[data-media-facts-state]")?.getAttribute("data-media-facts-state"), "unknown");
    assert.equal(text(emptyView.host, "[data-image-sharpness]").includes("当前像素够用"), false);
    await emptyView.unmount();

    let attempts = 0;
    fixture.uploadApi.getPageMediaByUrl = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("route-Mock 503");
      return routeMock({
        url: WIDE_URL,
        name: "retried",
        displayWidth: 3840,
        displayHeight: 2160,
        metadataStatus: "measured",
      });
    };
    const retryView = await fixture.mount({
      device: "desktop",
      value: WIDE_URL,
      spec: desktop,
      frameLabel: "16:9",
    });
    await settle(fixture);
    assert.match(text(retryView.host, "[data-image-source-pixels]"), /读取失败/);
    const retry = retryView.host.querySelector(".homepage-editor__media-facts-retry");
    assert.ok(retry);
    await fixture.click(retry);
    await settle(fixture);
    assert.equal(attempts, 2);
    assert.match(text(retryView.host, "[data-image-source-pixels]"), /3840×2160/);
    assert.match(text(retryView.host, "[data-image-sharpness]"), /够用/);
    await retryView.unmount();
    seed(null);

    seed({
      url: WIDE_URL,
      type: "image",
      name: "poison",
      createdAt: "2026-11-04T00:00:00.000Z",
      displayWidth: 3840,
      displayHeight: 2160,
      metadataStatus: "unknown",
    });
    let cacheReads = 0;
    fixture.uploadApi.getPageMediaByUrl = async () => {
      cacheReads += 1;
      return routeMock({
        url: WIDE_URL,
        name: "poison",
        width: 3840,
        height: 2160,
        metadataStatus: "unknown",
      });
    };
    const firstCache = await fixture.mount({
      device: "desktop",
      value: WIDE_URL,
      spec: desktop,
      frameLabel: "16:9",
    });
    await settle(fixture);
    assert.equal(cacheReads, 1);
    assert.equal(text(firstCache.host, "[data-image-sharpness]").includes("当前像素够用"), false);
    await firstCache.unmount();
    const secondCache = await fixture.mount({
      device: "desktop",
      value: WIDE_URL,
      spec: desktop,
      frameLabel: "16:9",
    });
    await settle(fixture);
    assert.equal(cacheReads, 2);
    assert.equal(secondCache.host.querySelector("[data-media-facts-state]")?.getAttribute("data-media-facts-state"), "unknown");
    assert.equal(text(secondCache.host, "[data-image-sharpness]").includes("当前像素够用"), false);
    await secondCache.unmount();
    seed(null);

    fixture.uploadApi.getPageMediaByUrl = async () => routeMock({
      url: WIDE_URL,
      name: "exif",
      width: 200,
      height: 100,
      displayWidth: 100,
      displayHeight: 200,
      metadataStatus: "measured",
    });
    const exifView = await fixture.mount({
      device: "desktop",
      value: WIDE_URL,
      spec: desktop,
      frameLabel: "16:9",
    });
    await settle(fixture);
    const exifSource = text(exifView.host, "[data-image-source-pixels]");
    assert.match(exifSource, /100×200/);
    assert.equal(exifSource.includes("200×100"), false);
    await exifView.unmount();
    seed(null);

    let releaseFirst = () => {};
    const firstPending = new Promise((resolve) => {
      releaseFirst = () => resolve(routeMock({
        url: FIRST_URL,
        name: "late",
        displayWidth: 9000,
        displayHeight: 9000,
        metadataStatus: "measured",
      }));
    });
    fixture.uploadApi.getPageMediaByUrl = (url) => {
      if (url === FIRST_URL) return firstPending;
      return Promise.resolve(routeMock({
        url: SECOND_URL,
        name: "current",
        displayWidth: 800,
        displayHeight: 600,
        metadataStatus: "measured",
      }));
    };
    const lateView = await fixture.mount({
      device: "desktop",
      value: FIRST_URL,
      spec: desktop,
      frameLabel: "16:9",
    });
    await lateView.setProps({
      device: "desktop",
      value: SECOND_URL,
      spec: desktop,
      frameLabel: "16:9",
    });
    await settle(fixture);
    assert.match(text(lateView.host, "[data-image-source-pixels]"), /800×600/);
    releaseFirst();
    await settle(fixture);
    const afterLate = text(lateView.host, "[data-image-source-pixels]");
    assert.match(afterLate, /800×600/);
    assert.equal(afterLate.includes("9000"), false);
    await lateView.unmount();
});
});
