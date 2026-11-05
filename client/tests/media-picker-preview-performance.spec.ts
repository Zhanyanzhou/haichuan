import { expect, test, type Page } from "@playwright/test";
import type { ComponentProps } from "react";
import type MediaPickerField from "../src/page-builder/fields/MediaPickerField";

type PickerProps = ComponentProps<typeof MediaPickerField>;
type HarnessWindow = Window & {
  pickerView: Awaited<ReturnType<typeof import("./media-picker-image-quality.entry").mount>>;
  pickerProps: PickerProps;
  pickerFocusChanges: Array<{ x: number; y: number }>;
};
const FIRST = "/uploads/page-assets/preview-first.jpg";
const SECOND = "/uploads/page-assets/preview-second.jpg";
const image = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="800" height="450" fill="#ddd"/></svg>';
const svgResponse = { contentType: "image/svg+xml", body: image };

async function fixture(page: Page, props: Partial<PickerProps> = {}) {
  const reads: Array<{ key: string | null; width: string | null }> = [];
  const factsReads: string[] = [];
  const writes: string[] = [];
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() !== "GET") writes.push(route.request().method());
    if (url.pathname === "/api/upload/media/preview-by-storage-key") {
      reads.push({ key: url.searchParams.get("storageKey"), width: url.searchParams.get("width") });
      return route.fulfill(svgResponse);
    }
    if (url.pathname === "/api/upload/media/by-url") {
      factsReads.push(url.searchParams.get("url") ?? "");
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ code: 200, data: {
        url: url.searchParams.get("url"), displayWidth: 6000, displayHeight: 4000,
        metadataStatus: "measured", mediaRevision: "original-facts", animated: false,
      } }) });
    }
    return route.fulfill({ status: 400, body: "Unexpected API" });
  });
  await page.route("**/__media-picker-preview", (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type; window.__vite_plugin_react_preamble_installed__ = true;</script></head><body></body></html>` }));
  await page.goto("/__media-picker-preview");
  await page.evaluate(async (initial) => {
    const entry = "/tests/media-picker-image-quality.entry.tsx";
    const { mount } = await import(/* @vite-ignore */ entry);
    const harness = window as HarnessWindow;
    harness.pickerFocusChanges = [];
    harness.pickerProps = { ...initial, onFocusChange: (next: { x: number; y: number }) => {
      harness.pickerFocusChanges.push(next);
      harness.pickerProps = { ...harness.pickerProps, previewFocus: next };
      void harness.pickerView.setProps(harness.pickerProps);
    } };
    harness.pickerView = await mount(harness.pickerProps);
    harness.pickerView.host.style.width = "320px";
  }, {
    value: FIRST, device: "desktop", previewAspectRatio: "16 / 9", previewFit: "cover",
    previewZoom: 1.2, previewFocus: { x: 35, y: 65 }, frameLabel: "16:9",
    spec: { width: 1440, height: 810, ratio: "16 / 9", designCanvasWidth: 1440, label: "桌面图" }, ...props,
  });
  return { reads, factsReads, writes };
}

async function changeSource(page: Page, value: string) {
  await page.evaluate(async (next) => {
    const harness = window as HarnessWindow;
    harness.pickerProps = { ...harness.pickerProps, value: next };
    await harness.pickerView.setProps(harness.pickerProps);
  }, value);
}

test("小预览请求800档，原图facts保持6000像素，焦点和取景比例保持可操作", async ({ page }) => {
  const { reads, factsReads, writes } = await fixture(page);
  const pad = page.getByRole("slider", { name: "拖动调整画面焦点" });
  const preview = pad.getByRole("img", { name: "预览" });
  await expect(preview).toHaveAttribute("src", /[?&]width=800$/);
  await expect.poll(() => preview.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBe(800);
  await expect(page.locator("[data-image-source-pixels]")).toContainText("6000×4000");
  await expect(page.locator("[data-image-source-pixels]")).not.toContainText("800×450");
  await expect(page.locator("[data-media-quality]")).toHaveAttribute("data-media-quality", "warning");
  await expect(page.locator("[data-image-sharpness]")).toContainText("当前像素够用");
  await expect(page.locator("[data-image-crop]")).toContainText("裁掉约 41%");
  await expect(pad).toHaveCSS("aspect-ratio", "16 / 9");
  await expect(preview).toHaveCSS("object-fit", "cover");
  await expect(preview).toHaveCSS("object-position", "35% 65%");
  await expect(preview).toHaveCSS("transform", "matrix(1.2, 0, 0, 1.2, 0, 0)");
  await pad.press("ArrowRight");
  await expect(pad).toHaveAttribute("aria-valuenow", "36");
  const bounds = await pad.boundingBox();
  if (!bounds) throw new Error("missing focus surface");
  await page.mouse.move(bounds.x + bounds.width * .25, bounds.y + bounds.height * .4);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * .7, bounds.y + bounds.height * .3);
  await page.mouse.up();
  await expect(pad).toHaveAttribute("aria-valuenow", "70");
  expect(reads.length).toBeGreaterThan(0);
  expect(reads.every((read) => read.width === "800")).toBe(true);
  expect(factsReads).toEqual([FIRST]);
  expect(writes).toEqual([]);
});

test("派生图404仅回退一次原图，原图成功后保留焦点和原图facts", async ({ page }) => {
  const requests: Array<string | null> = [];
  const state = await fixture(page);
  await page.route("**/api/upload/media/preview-by-storage-key**", async (route) => {
    const width = new URL(route.request().url()).searchParams.get("width");
    requests.push(width);
    return width ? route.fulfill({ status: 404, body: "animated or undecodable" }) : route.fulfill(svgResponse);
  });
  await changeSource(page, SECOND);
  const preview = page.getByRole("slider").getByRole("img");
  await expect(preview).toHaveAttribute("src", /storageKey=page-assets%2Fpreview-second.jpg$/);
  await expect.poll(() => preview.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBe(800);
  await expect(page.locator(".homepage-editor__media-preview-error")).toHaveCount(0);
  expect(requests).toContain("800");
  expect(requests.filter((width) => width === null)).toHaveLength(1);
  expect(state.writes).toEqual([]);
});

test("原图也失败时稳定显示错误，新源从800档开始且不继承旧失败", async ({ page }) => {
  const state = await fixture(page);
  const requests: Array<{ key: string | null; width: string | null }> = [];
  await page.route("**/api/upload/media/preview-by-storage-key**", async (route) => {
    const url = new URL(route.request().url());
    requests.push({ key: url.searchParams.get("storageKey"), width: url.searchParams.get("width") });
    return url.searchParams.get("storageKey")?.includes("broken")
      ? route.fulfill({ status: 404, body: "missing" }) : route.fulfill(svgResponse);
  });
  await changeSource(page, "/uploads/page-assets/broken.jpg");
  await expect(page.getByRole("alert")).toContainText("当前图片暂不可用");
  await expect(page.locator("[data-media-quality]")).toHaveAttribute("data-media-quality", "error");
  const brokenRequests = [...requests];
  await page.waitForTimeout(250);
  expect(requests).toEqual(brokenRequests);
  expect(requests.map((read) => read.width)).toEqual(["800", null]);
  await changeSource(page, SECOND);
  await expect(page.getByRole("slider").getByRole("img")).toHaveAttribute("src", /preview-second.jpg&width=800$/);
  await expect(page.locator(".homepage-editor__media-preview-error")).toHaveCount(0);
  expect(requests.filter((read) => read.key?.includes("second")).every((read) => read.width === "800")).toBe(true);
  expect(state.writes).toEqual([]);
});

test("旧源失败迟到不会让新源回退原图或显示错误", async ({ page }) => {
  const state = await fixture(page);
  const requests: Array<{ key: string | null; width: string | null }> = [];
  let releaseOld: (() => void) | undefined;
  const oldGate = new Promise<void>((resolve) => { releaseOld = resolve; });
  await page.route("**/api/upload/media/preview-by-storage-key**", async (route) => {
    const url = new URL(route.request().url());
    requests.push({ key: url.searchParams.get("storageKey"), width: url.searchParams.get("width") });
    if (url.searchParams.get("storageKey")?.includes("slow-old")) {
      await oldGate;
      return route.fulfill({ status: 404, body: "late old failure" });
    }
    return route.fulfill(svgResponse);
  });
  await changeSource(page, "/uploads/page-assets/slow-old.jpg");
  await expect.poll(() => requests.length).toBeGreaterThan(0);
  await changeSource(page, SECOND);
  releaseOld?.();
  const preview = page.getByRole("slider").getByRole("img");
  await expect(preview).toHaveAttribute("src", /preview-second.jpg&width=800$/);
  await expect.poll(() => preview.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBe(800);
  await page.waitForTimeout(150);
  await expect(page.locator(".homepage-editor__media-preview-error")).toHaveCount(0);
  expect(requests.every((read) => read.width === "800")).toBe(true);
  expect(state.writes).toEqual([]);
});
