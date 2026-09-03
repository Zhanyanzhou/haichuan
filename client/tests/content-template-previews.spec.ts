import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  CONTENT_TEMPLATE_CONTRACTS,
  CONTENT_TEMPLATE_REGISTRY,
} from "../src/page-builder/generated/contentTemplates.generated";

const screenshotDir = path.resolve("test-results/content-template-previews");
const fullsizeScreenshotDir = path.resolve(
  "test-results/content-template-preview-fullsize",
);
const templateCount = CONTENT_TEMPLATE_REGISTRY.length;

function gallery(viewport: "desktop" | "mobile", variant: "structure" | "renderer" = "renderer") {
  return `<!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; color: #292722; background: #ebe7e1; font: 12px/1.5 Arial, sans-serif; }
          main { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; padding: 24px; }
          .preview-card { min-width: 0; padding: 10px; border: 1px solid #d9d3c9; background: #fffefc; }
          .preview-card [data-content-template-preview] { display: block; width: 100%; }
          .preview-card strong { display: block; margin-top: 8px; font-size: 13px; }
          @media (max-width: 720px) { main { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; padding: 12px; } }
        </style>
      </head>
      <body>
        <div id="root"></div>
        <script type="module">
          import RefreshRuntime from "/@react-refresh";
          RefreshRuntime.injectIntoGlobalHook(window);
          window.$RefreshReg$ = () => {};
          window.$RefreshSig$ = () => (type) => type;
          window.__vite_plugin_react_preamble_installed__ = true;
        </script>
        <script type="module" src="/tests/fixtures/content-template-preview-gallery.tsx?viewport=${viewport}&variant=${variant}"></script>
      </body>
    </html>`;
}

test("真实 Renderer 预览首个可观察帧即完成卡片缩放，不再二次闪动", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(() => {
    type PreviewFrameSample = {
      height: number;
      transform: string;
      heroAnimation: string;
      doublePosterTransform: string;
      doublePosterTransition: string;
    };
    const observedWindow = window as typeof window & { __previewFrameSamples?: PreviewFrameSample[] };
    const samples: PreviewFrameSample[] = [];
    observedWindow.__previewFrameSamples = samples;
    const sample = () => {
      const preview = document.querySelector<HTMLElement>('[data-content-template-preview="carousel"]');
      const renderer = preview?.firstElementChild as HTMLElement | null;
      const heroTitle = document.querySelector<HTMLElement>('[data-content-template-preview="hero"] .hc-hero__reveal');
      const doublePosterMain = document.querySelector<HTMLElement>(
        '[data-content-template-preview="doublePoster"] [data-content-role="mainImage"]',
      );
      if (preview && renderer && heroTitle && doublePosterMain) {
        samples.push({
          height: preview.getBoundingClientRect().height,
          transform: renderer.style.transform,
          heroAnimation: getComputedStyle(heroTitle).animationName,
          doublePosterTransform: doublePosterMain.style.transform,
          doublePosterTransition: getComputedStyle(doublePosterMain).transitionDuration,
        });
      }
      if (samples.length < 12) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.route(/\/__content-template-preview-first-frame(?:\?.*)?$/, (route) => route.fulfill({
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: gallery("desktop"),
  }));
  await page.route("**/api/products/catalog/stream**", (route) => route.abort());
  await page.route("**/api/page-modules/document/stream**", (route) => route.abort());
  await page.route("**/api/settings/public**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ code: 200, data: {} }),
  }));
  await page.goto("/__content-template-preview-first-frame");
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { __previewFrameSamples?: unknown[] }
  ).__previewFrameSamples?.length ?? 0)).toBe(12);

  const samples = await page.evaluate(() => (
    window as typeof window & {
      __previewFrameSamples?: Array<{
        height: number;
        transform: string;
        heroAnimation: string;
        doublePosterTransform: string;
        doublePosterTransition: string;
      }>;
    }
  ).__previewFrameSamples ?? []);
  expect(new Set(samples.map((sample) => sample.transform)).size).toBe(1);
  expect(Math.max(...samples.map((sample) => sample.height)) - Math.min(...samples.map((sample) => sample.height)))
    .toBeLessThanOrEqual(0.5);
  expect(new Set(samples.map((sample) => sample.heroAnimation))).toEqual(new Set(["none"]));
  expect(new Set(samples.map((sample) => sample.doublePosterTransform))).toEqual(new Set(["translateY(0px)"]));
  expect(new Set(samples.map((sample) => sample.doublePosterTransition))).toEqual(new Set(["0s"]));
});

for (const viewport of ["desktop", "mobile"] as const) {
  test(`${viewport}：${templateCount} 张模板库缩略图使用中性合同结构并保持统一卡片画幅`, async ({ page }) => {
    await page.setViewportSize(viewport === "desktop"
      ? { width: 1440, height: 1000 }
      : { width: 390, height: 844 });
    await page.route(/\/__content-template-structure-gallery(?:\?.*)?$/, (route) => route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: gallery(viewport, "structure"),
    }));
    await page.goto(`/__content-template-structure-gallery?viewport=${viewport}&variant=structure`);

    const previews = page.locator('[data-preview-mode="structure"]');
    await expect(previews).toHaveCount(CONTENT_TEMPLATE_REGISTRY.length);
    await expect(previews.locator("img")).toHaveCount(0);

    const outerHeights: number[] = [];
    const artboardRatios: number[] = [];
    for (const entry of CONTENT_TEMPLATE_REGISTRY) {
      const contract = CONTENT_TEMPLATE_CONTRACTS[entry.key];
      const preview = page.locator(`[data-content-template-preview="${entry.key}"]`);
      await expect(preview).toHaveAttribute("data-preview-layout-source", "contract-geometry");
      await expect(preview).toHaveAttribute(
        "data-preview-frame-aspect-ratio",
        String(contract.defaultGeometryByViewport[viewport].frameAspectRatio),
      );
      await expect(preview.locator("[data-preview-zone]")).toHaveCount(
        contract.defaultGeometryByViewport[viewport].zones.length,
      );
      outerHeights.push(await preview.evaluate((node) => node.getBoundingClientRect().height));
      artboardRatios.push(await preview.locator("[data-preview-artboard]").evaluate((node) => {
        const rect = (node as SVGGraphicsElement).getBBox();
        return rect.width / rect.height;
      }));
      expect(
        artboardRatios.at(-1),
        `${entry.key} 的中性画板比例必须与真实合同一致`,
      ).toBeCloseTo(contract.defaultGeometryByViewport[viewport].frameAspectRatio, 4);
    }
    expect(Math.max(...outerHeights) - Math.min(...outerHeights)).toBeLessThanOrEqual(1);
    expect(new Set(artboardRatios.map((ratio) => ratio.toFixed(2))).size).toBeGreaterThan(4);
  });

  test(`${viewport}：${templateCount} 张模板缩略图使用真实 Renderer 画幅并保留合同顺序`, async ({ page }) => {
    const runtimeErrors: string[] = [];
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    page.on("console", (message) => {
      const text = message.text();
      const isExpectedDevServerNoise = text.includes("WebSocket connection")
        || text.includes("[vite] failed to connect to websocket")
        || text.includes("Failed to send error to Vite server");
      if (message.type() === "error" && !isExpectedDevServerNoise) runtimeErrors.push(text);
    });
    await page.setViewportSize(viewport === "desktop"
      ? { width: 1440, height: 1000 }
      : { width: 390, height: 844 });
    await page.route(/\/__content-template-preview-gallery(?:\?.*)?$/, (route) => route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: gallery(viewport),
    }));
    await page.route("**/api/products/catalog/stream**", (route) => route.abort());
    await page.route("**/api/page-modules/document/stream**", (route) => route.abort());
    await page.route("**/api/settings/public**", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ code: 200, data: {} }),
    }));
    await page.goto(`/__content-template-preview-gallery?viewport=${viewport}`);

    const previews = page.locator("[data-content-template-preview]");
    await page.waitForTimeout(500);
    expect(runtimeErrors, "预览测试页不应出现运行时错误").toEqual([]);
    await expect(previews).toHaveCount(CONTENT_TEMPLATE_REGISTRY.length);
    const previewImageSources = await previews.locator("img[src]").evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLImageElement).currentSrc || (node as HTMLImageElement).src),
    );
    expect(previewImageSources.length, "真实 Renderer 预览应加载中性占位图").toBeGreaterThan(0);
    const unexpectedPreviewImageSources = previewImageSources.filter((source) => {
        if (source.startsWith("data:image/svg+xml")) return false;
        const pathname = new URL(source).pathname;
        return !(
          pathname.includes("/neutral-template-preview-v1/template-preview-")
          || pathname.endsWith("/images/system/product-placeholder.svg")
        ) || !pathname.endsWith(".svg");
      });
    expect(
      unexpectedPreviewImageSources,
      "模板预览运行时只允许加载模板或商品中性 SVG 占位图，不得加载真实摄影图片",
    ).toEqual([]);
    await expect.poll(() => page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    )).toBe(true);

    const renderedRatios: number[] = [];
    for (const entry of CONTENT_TEMPLATE_REGISTRY) {
      const preview = page.locator(`[data-content-template-preview="${entry.key}"]`);
      await expect(preview).toHaveAttribute("data-preview-viewport", viewport);
      await expect(preview).toHaveAttribute("data-preview-only", "true");
      await expect(preview).toHaveAttribute("data-preview-art-direction", "neutral-template-preview-v1");
      await expect(preview).toHaveAttribute("data-desktop-order", /.+/);
      await expect(preview).toHaveAttribute("data-mobile-order", /.+/);
      await expect(preview.locator('[data-content-template-renderer="real"]')).toHaveCount(1);
      await expect.poll(() => preview.evaluate((node) => node.getBoundingClientRect().height)).toBeGreaterThan(20);
      const [previewBox, rendererMetrics] = await Promise.all([
        preview.evaluate((node) => node.getBoundingClientRect().toJSON()),
        preview.locator('[data-content-template-renderer="real"]').evaluate((node) => ({
          box: node.getBoundingClientRect().toJSON(),
          scrollHeight: node.scrollHeight,
          scrollWidth: node.scrollWidth,
        })),
      ]);
      expect(
        Math.abs(previewBox.width - rendererMetrics.box.width),
        `${entry.key} 预览宽度应与真实 Renderer 一致`,
      ).toBeLessThanOrEqual(1.5);
      const rendererScale = previewBox.width / rendererMetrics.scrollWidth;
      expect(
        Math.abs(previewBox.height - rendererMetrics.scrollHeight * rendererScale),
        `${entry.key} 预览不得裁切或补空真实 Renderer 高度（外框 ${previewBox.height.toFixed(2)} / 内容 ${rendererMetrics.scrollHeight} × ${rendererScale.toFixed(4)}）`,
      ).toBeLessThanOrEqual(1.5);
      renderedRatios.push(previewBox.width / previewBox.height);
    }
    expect(new Set(renderedRatios.map((ratio) => ratio.toFixed(2))).size, "模板应保留各自真实画幅，而非统一卡片比例").toBeGreaterThan(4);

    const textBanner = page.locator('[data-content-template-preview="textBanner"]');
    await expect(textBanner.locator('[data-content-role="copy"]')).toHaveCount(1);
    await expect(textBanner.locator('[data-content-role="bgImage"]')).toHaveCount(1);
    await expect(textBanner.locator("[data-content-role]")).toHaveCount(2);
    const sceneShopping = page.locator('[data-content-template-preview="sceneShopping"]');
    await expect(sceneShopping.locator('[data-content-role="scenes"]')).toHaveCount(1);
    await expect(sceneShopping.locator('[data-content-role="categories"]')).toHaveCount(0);
    const heroShade = page
      .locator('[data-content-template-preview="hero"]')
      .locator(".hc-phase1-hero__copy-shade");
    await expect(heroShade).toHaveCSS("display", viewport === "desktop" ? "block" : "none");
    if (viewport === "desktop") {
      await expect(heroShade).toHaveCSS("background-image", /linear-gradient/);
    }

    await mkdir(screenshotDir, { recursive: true });
    await page.screenshot({
      path: path.join(screenshotDir, `all-${viewport}.png`),
      fullPage: true,
    });
  });

  test(`${viewport}：${templateCount} 个模板以同一预览内容生成全尺寸真实 Renderer 证据`, async ({ page }) => {
    const runtimeErrors: string[] = [];
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    page.on("console", (message) => {
      const text = message.text();
      const isExpectedDevServerNoise = text.includes("WebSocket connection")
        || text.includes("[vite] failed to connect to websocket")
        || text.includes("Failed to send error to Vite server");
      if (message.type() === "error" && !isExpectedDevServerNoise) runtimeErrors.push(text);
    });
    const sourceWidth = viewport === "desktop" ? 1200 : 390;
    await page.setViewportSize({ width: sourceWidth, height: viewport === "desktop" ? 900 : 844 });
    await page.route(/\/__content-template-preview-fullsize(?:\?.*)?$/, (route) => route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: gallery(viewport),
    }));
    await page.route("**/api/products/catalog/stream**", (route) => route.abort());
    await page.route("**/api/page-modules/document/stream**", (route) => route.abort());
    await page.route("**/api/settings/public**", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ code: 200, data: {} }),
    }));
    await page.goto(`/__content-template-preview-fullsize?viewport=${viewport}`);
    await page.waitForTimeout(500);
    await page.addStyleTag({
      content: `
        body { background: #fff; }
        main { display: block; width: ${sourceWidth}px; padding: 0; }
        .preview-card { display: none; width: ${sourceWidth}px; padding: 0; border: 0; background: #fff; }
        .preview-card.is-capture { display: block; }
        .preview-card strong { display: none; }
      `,
    });
    await mkdir(fullsizeScreenshotDir, { recursive: true });

    for (const entry of CONTENT_TEMPLATE_REGISTRY) {
      await page.locator(".preview-card").evaluateAll((cards, key) => {
        for (const card of cards) {
          card.classList.toggle("is-capture", card.getAttribute("data-template-key") === key);
        }
      }, entry.key);
      const preview = page.locator(`[data-content-template-preview="${entry.key}"]`);
      await expect(preview).toBeVisible();
      await expect.poll(() => preview.evaluate(
        (node) => ({
          width: node.getBoundingClientRect().width,
          height: node.getBoundingClientRect().height,
        }),
      )).toEqual(expect.objectContaining({ width: sourceWidth }));
      await expect.poll(() => preview.evaluate(
        (node) => node.getBoundingClientRect().height,
      )).toBeGreaterThan(20);
      if (entry.key === "hero" && viewport === "desktop") {
        await expect.poll(() => preview.evaluate(
          (node) => node.getBoundingClientRect().height,
        )).toBeCloseTo(900, 0);
      }
      const images = preview.locator("img");
      if (await images.count()) {
        await expect.poll(() => images.evaluateAll((nodes) =>
          nodes.every((node) => {
            const image = node as HTMLImageElement;
            return image.complete && image.naturalWidth > 0;
          }),
        )).toBe(true);
      }
      const categoryRole = entry.key === "sceneShopping"
        ? "scenes"
        : entry.key === "categoryCards"
          ? "categories"
          : null;
      const categoryCards = categoryRole
        ? preview.locator(`[data-content-role="${categoryRole}"] > *`)
        : null;
      for (const card of categoryCards ? await categoryCards.all() : []) {
        const labelNode = card.locator("p").first();
        await expect(labelNode).toBeVisible();
        const label = (await labelNode.textContent())?.trim() || "未命名卡片";
        await expect.poll(() => labelNode.evaluate((node) => getComputedStyle(node).color))
          .toBe("rgb(255, 255, 255)");
        const [labelBox, previewBox] = await Promise.all([
          labelNode.boundingBox(),
          preview.boundingBox(),
        ]);
        expect(labelBox, `${entry.key} 的卡片标题“${label}”应有布局尺寸`).not.toBeNull();
        expect(previewBox).not.toBeNull();
        expect(labelBox!.y, `${entry.key} 的卡片标题“${label}”不得位于预览裁切区上方`)
          .toBeGreaterThanOrEqual(previewBox!.y - 1);
        expect(
          labelBox!.y + labelBox!.height,
          `${entry.key} 的卡片标题“${label}”不得位于预览裁切区下方`,
        ).toBeLessThanOrEqual(previewBox!.y + previewBox!.height + 1);
      }
      await preview.screenshot({
        path: path.join(fullsizeScreenshotDir, `${entry.key}-${viewport}.png`),
        animations: "disabled",
      });
    }

    expect(runtimeErrors, "全尺寸预览不得出现运行时错误").toEqual([]);
  });
}
