import { expect, test, type Page } from "@playwright/test";
import { CONTENT_TEMPLATE_REGISTRY } from "../src/page-builder/generated/contentTemplates.generated";

const activeTemplateCount = CONTENT_TEMPLATE_REGISTRY.length;

type InspectorObserverStats = {
  revision: number;
  mutationInstances: number;
  mutationObserveCalls: number;
  mutationDisconnectCalls: number;
  activeMutationObservers: number;
  resizeInstances: number;
  resizeObserveCalls: number;
  resizeDisconnectCalls: number;
  activeResizeObservers: number;
};

async function readInspectorObserverStats(page: Page) {
  return page.evaluate(() => (
    (window as typeof window & { __inspectorObserverDocuments?: InspectorObserverStats[] })
      .__inspectorObserverDocuments ?? []
  ));
}

function captureBrowserErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

test.use({
  launchOptions: {
    args: ["--disable-features=LocalNetworkAccessChecks"],
  },
});

const fixtureHtml = `<!doctype html>
  <html lang="zh-CN">
    <head>
      <meta charset="utf-8" />
      <style>
        * { box-sizing: border-box; }
        body { margin: 0; font-family: sans-serif; }
        header { display: flex; gap: 12px; padding: 12px; }
        [aria-label="动态模板画布"] { width: min(960px, 100%); margin: auto; padding: 24px; }
        [data-template-node-id="node_container"] { min-height: 320px; }
        [data-template-node-id="node_heading"] { padding: 24px; }
        [data-template-selected="true"] { outline: 2px solid #1f6d72; outline-offset: 2px; }
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
      <script type="module" src="/tests/fixtures/dynamic-template-foundation.tsx"></script>
    </body>
  </html>`;

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (error) => console.error(`[dynamic-template-fixture] ${error.message}`));
  await page.route("**/api/settings/public**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ code: 200, data: {} }),
    });
  });
  await page.route("**/dynamic-template-foundation.html*", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/html", body: fixtureHtml });
  });
  await page.goto("/dynamic-template-foundation.html");
  await expect(page.getByLabel("合法模板校验")).toHaveText("valid");
});

test.describe("模板 Inspector iframe observer 生命周期", () => {
  test("body 延迟出现后才挂载且选择变化不重复保留 observer", async ({ page }) => {
    const browserErrors = captureBrowserErrors(page);
    await page.goto("/dynamic-template-foundation.html?inspectorObserver=1");

    await expect(page.getByRole("complementary", { name: "模板属性" })).toBeVisible();
    await expect(page.getByLabel("Inspector 当前选择")).toHaveText("node_heading");
    await expect.poll(async () => {
      const [stats] = await readInspectorObserverStats(page);
      return stats && {
        activeMutationObservers: stats.activeMutationObservers,
        activeResizeObservers: stats.activeResizeObservers,
      };
    }).toEqual({ activeMutationObservers: 1, activeResizeObservers: 1 });

    await page.getByRole("button", { name: "移除 body 并选择图片" }).click();
    await expect(page.getByLabel("Inspector 当前选择")).toHaveText("node_image");
    await expect.poll(async () => {
      const [stats] = await readInspectorObserverStats(page);
      return stats && {
        activeMutationObservers: stats.activeMutationObservers,
        activeResizeObservers: stats.activeResizeObservers,
      };
    }).toEqual({ activeMutationObservers: 1, activeResizeObservers: 0 });

    await page.getByRole("button", { name: "恢复 body" }).click();
    await expect(page.getByRole("complementary", { name: "模板属性" })
      .getByText(/240 px/).first()).toBeVisible();
    await expect.poll(async () => {
      const [stats] = await readInspectorObserverStats(page);
      return stats && {
        activeMutationObservers: stats.activeMutationObservers,
        activeResizeObservers: stats.activeResizeObservers,
      };
    }).toEqual({ activeMutationObservers: 1, activeResizeObservers: 1 });

    for (const name of ["选择标题", "选择图片", "选择标题", "选择图片"]) {
      await page.getByRole("button", { name, exact: true }).click();
      await expect(page.getByLabel("Inspector 当前选择"))
        .toHaveText(name === "选择标题" ? "node_heading" : "node_image");
    }
    await expect.poll(async () => {
      const [stats] = await readInspectorObserverStats(page);
      return stats && {
        activeMutationObservers: stats.activeMutationObservers,
        activeResizeObservers: stats.activeResizeObservers,
      };
    }).toEqual({ activeMutationObservers: 1, activeResizeObservers: 1 });
    expect(browserErrors).toEqual([]);
  });

  test("iframe 文档替换与组件卸载会断开旧 observer", async ({ page }) => {
    const browserErrors = captureBrowserErrors(page);
    await page.goto("/dynamic-template-foundation.html?inspectorObserver=1");
    await expect.poll(async () => (await readInspectorObserverStats(page))[0]?.activeMutationObservers)
      .toBe(1);

    await page.getByRole("button", { name: "重载 iframe 文档" }).click();
    await expect.poll(async () => (await readInspectorObserverStats(page)).length).toBe(2);
    await expect.poll(async () => {
      const stats = await readInspectorObserverStats(page);
      return stats.map((entry) => ({
        revision: entry.revision,
        activeMutationObservers: entry.activeMutationObservers,
        activeResizeObservers: entry.activeResizeObservers,
      }));
    }).toEqual([
      { revision: 1, activeMutationObservers: 0, activeResizeObservers: 0 },
      { revision: 2, activeMutationObservers: 1, activeResizeObservers: 1 },
    ]);

    await page.getByRole("button", { name: "选择图片", exact: true }).click();
    await page.getByRole("button", { name: "重载 iframe 文档" }).click();
    await expect.poll(async () => (await readInspectorObserverStats(page)).length).toBe(3);
    await expect.poll(async () => {
      const stats = await readInspectorObserverStats(page);
      return stats.map((entry) => [
        entry.revision,
        entry.activeMutationObservers,
        entry.activeResizeObservers,
      ]);
    }).toEqual([[1, 0, 0], [2, 0, 0], [3, 1, 1]]);

    await page.getByRole("button", { name: "卸载 Inspector" }).click();
    await expect(page.getByRole("complementary", { name: "模板属性" })).toHaveCount(0);
    await expect.poll(async () => {
      const stats = await readInspectorObserverStats(page);
      return stats.map((entry) => [
        entry.revision,
        entry.activeMutationObservers,
        entry.activeResizeObservers,
      ]);
    }).toEqual([[1, 0, 0], [2, 0, 0], [3, 0, 0]]);
    expect(browserErrors).toEqual([]);
  });
});

test.describe("动态 TemplateDefinition 基础", () => {
  test("同一内容在桌面和移动端共享，几何顺序和图片规则分别生效", async ({ page }) => {
    const canvas = page.getByRole("region", { name: "动态模板画布" });
    const container = canvas.locator('[data-template-node-id="node_container"]');
    const image = canvas.locator('[data-template-node-id="node_image"] img');
    const heading = canvas.locator('[data-template-node-id="node_heading"] h2');

    await expect(heading).toHaveText("光，沿线而生");
    await expect(container).toHaveCSS("flex-direction", "row");
    await expect(canvas.locator('[data-template-node-id="node_image"]')).toHaveCSS("order", "1");
    await expect(canvas.locator('[data-template-node-id="node_heading"]')).toHaveCSS("order", "2");
    await expect(image).toHaveCSS("object-fit", "cover");
    await expect(image).toHaveCSS("object-position", "50% 50%");

    await page.getByRole("button", { name: "移动端", exact: true }).click();
    await expect(page.getByLabel("当前设备")).toHaveText("mobile");
    await expect(heading).toHaveText("光，沿线而生");
    await expect(container).toHaveCSS("flex-direction", "column");
    await expect(canvas.locator('[data-template-node-id="node_image"]')).toHaveCSS("order", "2");
    await expect(canvas.locator('[data-template-node-id="node_heading"]')).toHaveCSS("order", "1");
    await expect(image).toHaveCSS("object-fit", "contain");
    await expect(image).toHaveCSS("object-position", "50% 0%");
  });

  test("页面实例只覆盖槽位内容，公开渲染锁定精确正式版本", async ({ page }) => {
    await expect(
      page.getByRole("region", { name: "编辑器预览" }).locator("h2"),
    ).toHaveText("页面实例填写的标题");
    const publicVersion = page.getByRole("region", { name: "公开页面固定版本" });
    await expect(publicVersion.locator("h1")).toHaveText("正式版本三");
    await expect(publicVersion.locator("h1")).toHaveCount(1);
    await expect(page.getByLabel("动态首屏导航模式")).toHaveText("overlay-light");
    await expect(publicVersion).not.toContainText("正式版本四");
    await expect(publicVersion.locator('[data-dynamic-template-version="3"]')).toHaveCount(1);
  });

  test("空内容策略在公开页隐藏或回退默认值，编辑器始终保留可编辑占位", async ({ page }) => {
    const hidden = page.getByRole("region", { name: "空内容公开隐藏" });
    await expect(hidden.locator('[data-template-node-id="node_heading"]')).toHaveCount(0);
    await expect(hidden).not.toContainText("标题待填写");

    const editor = page.getByRole("region", { name: "空内容编辑占位" });
    await expect(editor.locator('[data-template-node-id="node_heading"]')).toContainText("标题待填写");

    const fallback = page.getByRole("region", { name: "空内容回退默认" });
    await expect(fallback.locator('[data-template-node-id="node_heading"] h2')).toHaveText("光，沿线而生");
  });

  test("五个真实消费宿主在桌面与移动端共用节点结构、视觉顺序和归一化几何", async ({ page }) => {
    const surfaces = [
      { label: "动态模板缩略图", mode: "thumbnail" },
      { label: "动态模板画布", mode: "editor" },
      { label: "页面模板实例", mode: "editor" },
      { label: "编辑器预览", mode: "preview" },
      { label: "公开页面固定版本", mode: "public" },
    ] as const;
    const getSurfaceRoot = (label: string) => {
      const region = page.getByRole("region", { name: label });
      return label === "动态模板缩略图"
        ? region.frameLocator("iframe[data-template-catalog-viewport]")
          .locator("[data-dynamic-template-id]")
        : region.locator("[data-dynamic-template-id]");
    };
    const readSurfaceGeometry = async (label: string) => {
      const root = getSurfaceRoot(label);
      await expect(root).toBeVisible();
      const nodes = await root.locator("[data-template-node-id]").evaluateAll((elements) => {
        const round = (value: number) => Math.round(value * 10_000) / 10_000;
        const rootElement = elements[0]?.closest<HTMLElement>("[data-dynamic-template-id]");
        if (!rootElement) return [];
        const rootRect = rootElement.getBoundingClientRect();
        const snapshots = elements.map((element, documentIndex) => {
          const rect = element.getBoundingClientRect();
          const parentNodeId = element.parentElement?.closest("[data-template-node-id]")
            ?.getAttribute("data-template-node-id") ?? null;
          return {
            nodeId: element.getAttribute("data-template-node-id"),
            nodeType: element.getAttribute("data-template-node-type"),
            slotId: element.getAttribute("data-template-slot-id"),
            parentNodeId,
            documentIndex,
            cssOrder: getComputedStyle(element).order,
            rect: {
              x: round((rect.left - rootRect.left) / rootRect.width),
              y: round((rect.top - rootRect.top) / rootRect.height),
              width: round(rect.width / rootRect.width),
              height: round(rect.height / rootRect.height),
              aspectRatio: round(rect.width / rect.height),
            },
            absoluteRect: {
              width: round(rect.width),
              height: round(rect.height),
            },
          };
        });
        return snapshots.map((snapshot) => {
          const siblings = snapshots.filter((candidate) => (
            candidate.parentNodeId === snapshot.parentNodeId
          ));
          const domIndex = siblings.findIndex((candidate) => candidate.nodeId === snapshot.nodeId);
          const visual = [...siblings].sort((left, right) => {
            const topDelta = left.rect.y - right.rect.y;
            if (Math.abs(topDelta) > 0.01) return topDelta;
            const leftDelta = left.rect.x - right.rect.x;
            if (Math.abs(leftDelta) > 0.01) return leftDelta;
            return left.documentIndex - right.documentIndex;
          });
          return {
            ...snapshot,
            domIndex,
            visualIndex: visual.findIndex((candidate) => candidate.nodeId === snapshot.nodeId),
          };
        });
      });
      const rootMetrics = await root.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return {
          width: rect.width,
          height: rect.height,
          aspectRatio: rect.width / rect.height,
          computedHeight: getComputedStyle(element).height,
          overflow: element.scrollWidth > element.clientWidth + 1,
        };
      });
      return { nodes, rootMetrics };
    };

    for (const viewport of [
      { width: 1920, height: 1200, device: "desktop", button: "桌面端" },
      { width: 390, height: 844, device: "mobile", button: "移动端" },
    ] as const) {
      await page.setViewportSize(viewport);
      await page.getByRole("button", { name: viewport.button, exact: true }).click();
      await expect(page.getByLabel("当前设备")).toHaveText(viewport.device);
      const thumbnail = page.getByRole("region", { name: "动态模板缩略图" });
      await expect(thumbnail.locator("[data-template-catalog-preview-shell]"))
        .toHaveAttribute("data-preview-status", "ready");
      await expect(thumbnail.locator("iframe[data-template-catalog-viewport]"))
        .toHaveAttribute("data-template-catalog-viewport", viewport.device);
      await expect(thumbnail.locator("[data-preview-height-mode]"))
        .toHaveAttribute("data-preview-height-mode", "aspect-ratio");

      const editorGeometry = await readSurfaceGeometry("动态模板画布");
      expect(editorGeometry.nodes.length).toBeGreaterThan(0);
      for (const surface of surfaces) {
        const region = page.getByRole("region", { name: surface.label });
        const root = getSurfaceRoot(surface.label);
        await expect(root).toHaveAttribute("data-dynamic-template-mode", surface.mode);
        const geometry = await readSurfaceGeometry(surface.label);
        expect(geometry.rootMetrics.width, `${viewport.device}.${surface.label} 根宽度`).toBeGreaterThan(0);
        expect(geometry.rootMetrics.height, `${viewport.device}.${surface.label} 根高度`).toBeGreaterThan(0);
        expect(geometry.rootMetrics.overflow, `${viewport.device}.${surface.label} 不应横向溢出`).toBe(false);
        expect(geometry.rootMetrics.computedHeight).not.toBe("0px");
        const configuredAspectRatio = viewport.device === "desktop" ? 16 / 9 : 4 / 5;
        // aspect-ratio 是最小画框语义；真实内容可以把自动高度撑高，但不能把画框压扁。
        expect(geometry.rootMetrics.aspectRatio).toBeLessThanOrEqual(configuredAspectRatio + 0.05);
        expect(
          Math.abs(geometry.rootMetrics.aspectRatio - editorGeometry.rootMetrics.aspectRatio)
            / Math.max(0.0001, editorGeometry.rootMetrics.aspectRatio),
          `${viewport.device}.${surface.label} 根节点实际高度语义漂移`,
        ).toBeLessThanOrEqual(0.05);

        expect(geometry.nodes.map((node) => ({
          nodeId: node.nodeId,
          nodeType: node.nodeType,
          slotId: node.slotId,
          parentNodeId: node.parentNodeId,
          documentIndex: node.documentIndex,
          domIndex: node.domIndex,
          cssOrder: node.cssOrder,
          visualIndex: node.visualIndex,
        })), `${viewport.device}.${surface.label} 节点、父子、DOM/CSS/视觉顺序`).toEqual(
          editorGeometry.nodes.map((node) => ({
            nodeId: node.nodeId,
            nodeType: node.nodeType,
            slotId: node.slotId,
            parentNodeId: node.parentNodeId,
            documentIndex: node.documentIndex,
            domIndex: node.domIndex,
            cssOrder: node.cssOrder,
            visualIndex: node.visualIndex,
          })),
        );
        for (const expected of editorGeometry.nodes) {
          const actual = geometry.nodes.find((node) => node.nodeId === expected.nodeId);
          expect(actual, `${viewport.device}.${surface.label}.${expected.nodeId} 缺少几何`).toBeTruthy();
          expect(actual!.absoluteRect.width).toBeGreaterThan(0);
          expect(actual!.absoluteRect.height).toBeGreaterThan(0);
          for (const dimension of ["x", "y", "width", "height"] as const) {
            expect(
              Math.abs(actual!.rect[dimension] - expected.rect[dimension]),
              `${viewport.device}.${surface.label}.${expected.nodeId}.${dimension} 归一化几何漂移`,
            ).toBeLessThanOrEqual(0.03);
          }
          if (["node_root", "node_container", "node_image"].includes(expected.nodeId ?? "")) {
            expect(
              Math.abs(actual!.rect.aspectRatio - expected.rect.aspectRatio)
                / Math.max(0.0001, expected.rect.aspectRatio),
              `${viewport.device}.${surface.label}.${expected.nodeId} 宽高比漂移`,
            ).toBeLessThanOrEqual(0.05);
          }
        }
        await expect(region).toBeVisible();
      }

      for (const label of ["页面模板实例", "编辑器预览", "公开页面固定版本"]) {
        const region = page.getByRole("region", { name: label });
        await expect(region.locator(
          '[data-editable-target-overlay-root], [data-template-selected], [data-template-node-label], [tabindex]',
        )).toHaveCount(0);
      }
    }
  });

  test("目录预览按真实比例、内容高度和图片文字 DOM 槽位统一呈现", async ({ page }) => {
    await page.addInitScript(() => {
      if (window.top !== window) return;
      const statuses: string[] = [];
      (window as typeof window & { __catalogPreviewStatuses?: string[] }).__catalogPreviewStatuses = statuses;
      const collect = () => {
        document.querySelectorAll<HTMLElement>("[data-template-catalog-preview-shell]")
          .forEach((element) => {
            const status = element.dataset.previewStatus;
            if (status && !statuses.includes(status)) statuses.push(status);
          });
      };
      const observer = new MutationObserver(collect);
      const install = () => {
        if (!document.documentElement) {
          window.setTimeout(install, 0);
          return;
        }
        observer.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ["data-preview-status"],
          childList: true,
          subtree: true,
        });
      };
      install();
    });
    await page.goto("/dynamic-template-foundation.html?catalogPreviews=1");
    const matrix = page.getByRole("region", { name: "模板目录比例预览夹具" });
    await expect(matrix).toBeVisible();
    const previewCase = (key: string) => matrix.locator(`[data-catalog-preview-case="${key}"]`);
    const artboard = (key: string) => previewCase(key).locator("[data-preview-natural-height]");

    for (const key of ["fixed-four-three", "square", "portrait", "auto", "dense", "blank"]) {
      await expect(previewCase(key).locator('[data-preview-status="ready"]')).toHaveCount(1);
      await expect(previewCase(key).locator('[data-preview-renderer-ready="true"]')).toHaveCount(1);
    }
    await expect.poll(() => page.evaluate(() => (
      (window as typeof window & { __catalogPreviewStatuses?: string[] }).__catalogPreviewStatuses ?? []
    ))).toEqual(expect.arrayContaining(["loading", "ready", "unavailable"]));

    await expect(matrix.locator("[data-template-catalog-dimension]")).toHaveCount(0);
    await expect(artboard("fixed-four-three")).toHaveAttribute("data-preview-height-mode", "fixed");
    await expect(artboard("fixed-four-three")).toHaveAttribute("data-preview-natural-height", "1440");

    for (const [key, expectedRatio] of [
      ["fixed-four-three", 4 / 3],
      ["square", 1],
      ["portrait", 3 / 4],
    ] as const) {
      await expect.poll(async () => {
        const box = await artboard(key).boundingBox();
        return box ? box.width / box.height : 0;
      }).toBeGreaterThan(expectedRatio * 0.99);
      await expect.poll(async () => {
        const box = await artboard(key).boundingBox();
        return box ? box.width / box.height : Number.POSITIVE_INFINITY;
      }).toBeLessThan(expectedRatio * 1.01);
    }

    const fixedFrame = previewCase("fixed-four-three").frameLocator("iframe");
    await fixedFrame.locator(".template-editor__catalog-canvas-renderer").evaluate((root) => {
      const stress = document.createElement("div");
      stress.dataset.previewStress = "fixed";
      stress.style.height = "6000px";
      root.appendChild(stress);
    });
    await expect(artboard("fixed-four-three")).toHaveAttribute("data-preview-natural-height", "1440");

    const autoArtboard = artboard("auto");
    const autoBefore = Number(await autoArtboard.getAttribute("data-preview-natural-height"));
    expect(autoBefore).toBeGreaterThanOrEqual(240);
    const autoFrame = previewCase("auto").frameLocator("iframe");
    await autoFrame.locator(".template-editor__catalog-canvas-renderer").evaluate((root) => {
      const stress = document.createElement("div");
      stress.dataset.previewStress = "auto";
      stress.style.height = "6000px";
      root.appendChild(stress);
    });
    await expect.poll(async () => Number(
      await autoArtboard.getAttribute("data-preview-natural-height"),
    )).toBeGreaterThan(autoBefore + 1000);

    await expect(artboard("blank")).toHaveAttribute("data-preview-height-mode", "auto");
    await expect.poll(async () => Number(
      await artboard("blank").getAttribute("data-preview-natural-height"),
    )).toBeGreaterThanOrEqual(240);

    const unavailable = previewCase("unavailable");
    await expect(unavailable.locator('[data-preview-status="unavailable"]')).toHaveCount(1);
    await expect(unavailable.getByText("预览不可用")).toBeVisible();

    const missingRenderer = previewCase("missing-renderer");
    await expect(missingRenderer.locator('[data-preview-status="ready"]')).toHaveCount(0);
    await expect(missingRenderer.locator('[data-preview-status="unavailable"]')).toHaveCount(1);
    await expect(missingRenderer.locator('[data-preview-renderer-ready="false"]')).toHaveCount(1);

    const dense = previewCase("dense");
    await dense.hover();
    for (const kind of ["media", "title"] as const) {
      const box = dense.locator(`[data-editable-target-kind="${kind}"]`).first();
      await expect(box).toBeVisible();
      await expect(box).toHaveCSS("border-top-style", "solid");
      await expect(box).toHaveCSS("pointer-events", "none");
    }
    await expect(dense.locator('[data-editable-target-kind="action"], [data-editable-target-kind="structured"]'))
      .toHaveCount(0);
    const readableLabel = dense.locator(".template-editor__editable-overlay-label").first();
    await expect(readableLabel).toHaveCSS("font-size", "12px");
    await expect(dense.locator('[data-template-editor-overlay-root="catalog"]'))
      .toHaveCSS("pointer-events", "none");
    await expect(dense.locator(".homepage-editor__template-slot-summary, .homepage-editor__template-description, .homepage-editor__template-add"))
      .toHaveCount(0);
    await expect(dense.locator(".homepage-editor__template-name"))
      .toHaveText("密集媒体文字槽位");

    const mediaGeometry = await dense.evaluate((card) => {
      const host = card.querySelector<HTMLElement>("[data-preview-natural-height]");
      const frame = card.querySelector<HTMLIFrameElement>("iframe");
      const overlay = card.querySelector<HTMLElement>('[data-editable-target-kind="media"]');
      const content = frame?.contentDocument?.querySelector<HTMLElement>(
        ".template-editor__catalog-canvas-renderer",
      );
      const source = content?.querySelector<HTMLElement>(
        '[data-hc-template-slot-kind="media"], [data-template-slot-id="slot_image"]',
      );
      if (!host || !frame || !overlay || !content || !source) return null;
      const hostBounds = host.getBoundingClientRect();
      const contentBounds = content.getBoundingClientRect();
      const sourceBounds = source.getBoundingClientRect();
      const overlayBounds = overlay.getBoundingClientRect();
      const scale = host.clientWidth / Number(frame.style.width.replace("px", ""));
      return {
        expectedLeft: hostBounds.left + (sourceBounds.left - contentBounds.left) * scale,
        expectedTop: hostBounds.top + (sourceBounds.top - contentBounds.top) * scale,
        actualLeft: overlayBounds.left,
        actualTop: overlayBounds.top,
      };
    });
    expect(mediaGeometry).not.toBeNull();
    expect(Math.abs(mediaGeometry!.expectedLeft - mediaGeometry!.actualLeft)).toBeLessThanOrEqual(2);
    expect(Math.abs(mediaGeometry!.expectedTop - mediaGeometry!.actualTop)).toBeLessThanOrEqual(2);

    await page.getByRole("button", { name: "目录移动端" }).click();
    await expect(page.getByLabel("目录预览当前设备")).toHaveText("mobile");
    await expect(matrix.locator("[data-template-catalog-dimension]")).toHaveCount(0);
    await expect(artboard("fixed-four-three")).toHaveAttribute("data-preview-natural-height", "390");
    await page.getByRole("button", { name: "目录桌面端" }).click();
    await expect(matrix.locator("[data-template-catalog-dimension]")).toHaveCount(0);
    await expect(artboard("fixed-four-three")).toHaveAttribute("data-preview-natural-height", "1440");
  });

  test("母模板明确控制移动布局切换宽度，平板与中间宽度按规则选择构图", async ({ page }) => {
    const instance = page.getByRole("region", { name: "编辑器预览" })
      .locator('[data-dynamic-template-instance-id="instance_test_v3"]');
    await page.setViewportSize({ width: 700, height: 900 });
    await expect(instance.locator('[data-dynamic-template-device="mobile"]')).toHaveCount(1);

    await page.setViewportSize({ width: 768, height: 900 });
    await expect(instance.locator('[data-dynamic-template-device="desktop"]')).toHaveCount(1);
  });

  test("整个实例隐藏值在公开与预览中不渲染，编辑态保留可恢复入口", async ({ page }) => {
    await expect(page.getByRole("region", { name: "隐藏实例公开" })).not.toContainText("不应出现在公开页面");
    await expect(page.getByRole("region", { name: "隐藏实例公开" }).locator("[data-dynamic-template-instance-id]"))
      .toHaveCount(0);
    const editorState = page.getByRole("region", { name: "隐藏实例编辑" });
    await expect(editorState).toContainText("当前页面中已隐藏");
    await expect(editorState).toContainText("可在右侧属性面板重新显示整个模板实例");
  });

  test("精确版本缺失时预览可解释、公开页面安全隐藏", async ({ page }) => {
    await expect(page.getByRole("region", { name: "缺失版本预览" })).toContainText(
      "缺少页面锁定的正式模板版本",
    );
    await expect(page.getByRole("region", { name: "缺失版本公开" })).not.toContainText(
      "页面实例填写的标题",
    );
  });

  test("模板画布仅由 host overlay 通过可访问名称、点击和键盘选择节点", async ({ page }) => {
    const editorCanvas = page.getByRole("region", { name: "模板 host overlay 画布" });
    const overlay = editorCanvas.locator('[data-template-editor-overlay-root="template-definition"]');
    const headingTarget = editorCanvas.getByRole("button", { name: "选择模板目标 标题" });
    const rendererFrame = editorCanvas.frameLocator("iframe");

    await expect(overlay).toHaveCount(1);
    await expect(headingTarget).toHaveCount(1);
    await expect(rendererFrame.getByRole("group", { name: "选择模板节点 标题" })).toHaveCount(0);
    await headingTarget.click();
    await expect(page.getByLabel("选中节点")).toHaveText("node_heading");
    await expect(headingTarget).toHaveAttribute("data-overlay-hit-selected", "true");

    const imageTarget = editorCanvas.getByRole("button", { name: "选择模板目标 主视觉图片" });
    await expect(imageTarget).toHaveCount(1);
    await imageTarget.focus();
    await imageTarget.press("Enter");
    await expect(page.getByLabel("选中节点")).toHaveText("node_image");
    await expect(imageTarget).toHaveAttribute("data-overlay-hit-selected", "true");
    await expect(editorCanvas.locator('[data-overlay-hit-for="node:node_image"]')).toHaveCount(1);
  });

  test("Renderer 只在模板定义工作面接收节点拖动和键盘微调，不再挂载局部缩放层", async ({ page }) => {
    const region = page.getByRole("region", { name: "V2 模板定义画布几何" });
    const node = region.locator('[data-template-node-id="node_image"]');
    const output = region.getByLabel("V2 模板构图预览覆盖");
    await expect(region.locator(".hc-dynamic-template")).toHaveAttribute(
      "data-dynamic-template-editor-surface",
      "template-definition",
    );
    await expect(node).toHaveAttribute("data-template-selected", "true");
    await expect(region.locator("[data-template-free-resize-handle], [data-template-node-toolbar]")).toHaveCount(0);

    await node.focus();
    await node.press("ArrowRight");
    await expect(output).toContainText('"offsetXPercent":1');
    await node.press("Shift+ArrowDown");
    await expect(output).toContainText('"offsetYPercent":5');
    await node.press("Alt+ArrowRight");
    await expect(output).toContainText('"widthPercent":101');

    const beforeMove = JSON.parse(await output.textContent() || "{}") as Record<string, { desktop?: { offsetXPercent?: number } }>;
    const box = await node.boundingBox();
    if (!box) throw new Error("V2 构图节点没有几何尺寸");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 24, box.y + box.height / 2 + 12);
    await page.mouse.up();
    await expect.poll(async () => {
      const next = JSON.parse(await output.textContent() || "{}") as Record<string, { desktop?: { offsetXPercent?: number } }>;
      return next.node_image?.desktop?.offsetXPercent ?? 0;
    }).toBeGreaterThan(beforeMove.node_image?.desktop?.offsetXPercent ?? 0);

    await expect(region.getByLabel("V2 模板构图手势提交次数")).not.toHaveText("0");
  });

  test("自由 Stack 使用归一化构图，局部手柄由唯一宿主覆盖层提供", async ({ page }) => {
    const region = page.getByRole("region", { name: "V2 自由层画布" });
    const node = region.locator('[data-template-node-id="node_heading"]');
    await expect(node).toHaveCSS("position", "absolute");
    await expect(node.locator("[data-template-free-resize-handle]")).toHaveCount(0);
    await node.focus();
    await node.press("ArrowRight");
    await expect(region.getByLabel("自由层手势提交次数")).toHaveText("1");
    const before = JSON.parse(await region.getByLabel("自由层位置").textContent() || "{}") as { x: number };
    const box = await node.boundingBox();
    if (!box) throw new Error("自由层节点没有几何尺寸");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 32, box.y + box.height / 2 + 10);
    await page.mouse.up();
    await expect(region.getByLabel("自由层手势提交次数")).toHaveText("2");
    await expect.poll(async () => {
      const next = JSON.parse(await region.getByLabel("自由层位置").textContent() || "{}") as { x: number };
      return next.x;
    }).toBeGreaterThan(before.x);
  });

  test("校验器拒绝重复字段、循环、缺失节点、非法嵌套、槽位错配、孤立节点、非法视口高度和未声明属性", async ({ page }) => {
    const cases = JSON.parse(await page.getByTestId("invalid-cases").textContent() || "{}") as Record<string, string[]>;
    expect(cases.duplicateSlotKey).toContain("DUPLICATE_SLOT_KEY");
    expect(cases.cycle).toContain("NODE_CYCLE");
    expect(cases.missingChild).toContain("MISSING_CHILD_NODE");
    expect(cases.illegalNesting).toContain("ILLEGAL_NESTING");
    expect(cases.slotMismatch).toContain("SLOT_NODE_TYPE_MISMATCH");
    expect(cases.orphanNode).toContain("ORPHAN_NODE");
    expect(cases.invalidViewportHeight).toContain("INVALID_VIEWPORT_HEIGHT_UNIT");
    expect(cases.unknownProperty).toContain("UNKNOWN_PROPERTY");
    expect(cases.invalidEmptyPolicy).toContain("INVALID_SLOT_EMPTY_POLICY");
    expect(cases.invalidVideoContent).toContain("DEFAULT_CONTENT_TYPE_MISMATCH");
    expect(cases.invalidCarouselContent).toContain("DEFAULT_CONTENT_TYPE_MISMATCH");
    expect(cases.invalidHotspotContent).toContain("DEFAULT_CONTENT_TYPE_MISMATCH");
    expect(cases.validDesktopFreeMobileFlow).toBe(true);
    expect(cases.placementOutOfBounds).toContain("PLACEMENT_OUT_OF_BOUNDS");
    expect(cases.placementInFlow).toContain("PLACEMENT_REQUIRES_FREE_STACK_PARENT");
    expect(cases.freeAutoHeight).toContain("FREE_LAYOUT_REQUIRES_FIXED_HEIGHT");
    expect(cases.freeNonStack).toContain("FREE_LAYOUT_REQUIRES_STACK");
  });

  test("节点操作保持稳定身份并支持新增、重命名、排序、换父级、复制、隐藏和删除", async ({ page }) => {
    const result = JSON.parse(await page.getByTestId("operation-result").textContent() || "{}") as {
      valid: boolean;
      containerChildren: string[];
      stackChildren: string[];
      headingName: string;
      headingHidden: boolean;
      slotKeys: string[];
      duplicateSlotIds: string[];
      duplicatedPreviewContent: unknown;
      duplicatedHasFormalDefault: boolean;
      duplicatedEmptyPolicy?: string;
      sourceDefaultContent: unknown;
      sourcePreviewContent: unknown;
      sourceEmptyPolicy?: string;
      duplicateRemoved: boolean;
      cycleCode: string;
    };
    expect(result.valid).toBe(true);
    expect(result.headingName).toBe("品牌标题");
    expect(result.headingHidden).toBe(true);
    expect(result.containerChildren[0]).toMatch(/^node_/);
    expect(result.stackChildren).toHaveLength(1);
    expect(new Set(result.slotKeys).size).toBe(result.slotKeys.length);
    expect(result.duplicateSlotIds).toHaveLength(1);
    expect(result.duplicatedPreviewContent).toBeUndefined();
    expect(result.duplicatedHasFormalDefault).toBe(false);
    expect(result.duplicatedEmptyPolicy).toBe("hide");
    expect(result.sourceDefaultContent).toBe("历史正式默认内容");
    expect(result.sourcePreviewContent).toBe("仅用于预览的示例");
    expect(result.sourceEmptyPolicy).toBe("use-default");
    expect(result.duplicateRemoved).toBe(true);
    expect(result.cycleCode).toBe("MOVE_WOULD_CREATE_CYCLE");
  });

  test("本机草稿保存、恢复、另存副本和 JSON 导入保持结构身份并移除内容值", async ({ page }) => {
    const result = JSON.parse(await page.getByTestId("local-draft-result").textContent() || "{}") as {
      savedId: string;
      savedDefaultContentCount: number;
      savedPreviewContentCount: number;
      savedEmptyPolicy?: string;
      loadedId: string;
      copiedId: string;
      copiedName: string;
      copiedDefaultContentCount: number;
      copiedPreviewContentCount: number;
      copiedEmptyPolicy?: string;
      importedId: string;
      importedName: string;
      importedDefaultContentCount: number;
      importedPreviewContentCount: number;
      savedCount: number;
      netAdded: number;
      savedPresent: boolean;
      copyPresent: boolean;
      exportedSchemaVersion: number;
    };
    expect(result.loadedId).toBe(result.savedId);
    expect(result.savedDefaultContentCount).toBe(0);
    expect(result.savedPreviewContentCount).toBe(0);
    expect(result.savedEmptyPolicy).toBe("hide");
    expect(result.copiedId).not.toBe(result.savedId);
    expect(result.importedId).not.toBe(result.savedId);
    expect(result.copiedName).toBe("本地草稿测试副本");
    expect(result.copiedDefaultContentCount).toBe(0);
    expect(result.copiedPreviewContentCount).toBe(0);
    expect(result.copiedEmptyPolicy).toBe("hide");
    expect(result.importedName).toBe("本地草稿测试");
    expect(result.importedDefaultContentCount).toBe(0);
    expect(result.importedPreviewContentCount).toBe(0);
    expect(result.savedCount).toBeGreaterThanOrEqual(2);
    expect(result.netAdded).toBe(2);
    expect(result.savedPresent).toBe(true);
    expect(result.copyPresent).toBe(true);
    expect(result.exportedSchemaVersion).toBe(1);
  });

  test("版本升级把新增必填槽位列为待填写，并把非空内容丢失列为破坏性阻断", async ({ page }) => {
    const result = JSON.parse(await page.getByTestId("upgrade-result").textContent() || "{}") as {
      originalVersion: number;
      compatibleVersion: number;
      compatibleContent: string;
      preserved: string[];
      compatibleBlockers: string[];
      discarded: string[];
      blockingReasons: string[];
      pendingRequiredSlots: Array<{ slotId: string; label: string }>;
      destructiveBlockers: Array<{ slotId?: string; reason: string }>;
    };
    expect(result.originalVersion).toBe(3);
    expect(result.compatibleVersion).toBe(4);
    expect(result.compatibleContent).toBe("页面保留内容");
    expect(result.preserved).toEqual(["slot_heading"]);
    expect(result.compatibleBlockers).toEqual([]);
    expect(result.discarded).toEqual(["slot_heading"]);
    expect(result.blockingReasons.some((message) => message.includes("无法无损保留"))).toBe(true);
    expect(result.pendingRequiredSlots).toEqual([
      { slotId: "slot_required", label: "新增必填正文" },
    ]);
    expect(result.destructiveBlockers).toEqual([
      expect.objectContaining({ slotId: "slot_heading" }),
    ]);
  });

  test("旧兼容来源只适配为新身份，原合同引用保持不变", async ({ page }) => {
    const result = JSON.parse(await page.getByTestId("legacy-adaptation-result").textContent() || "{}") as {
      sourceType: string;
      originalIdentity: string;
      originalIdentityAfter: string;
      adaptedFormat: string;
      adaptedTemplateId: string;
      sourceReference: string;
      mappedCount: number;
      skippedCount: number;
      riskCount: number;
      valid: boolean;
      visualRole: string;
      overlayCompatible: boolean;
      nodeType: string;
      slotType: string;
      layoutPreserved: boolean;
    };
    expect(result.sourceType).toBe("system");
    expect(result.originalIdentityAfter).toBe(result.originalIdentity);
    expect(result.adaptedFormat).toBe("dynamic");
    expect(result.adaptedTemplateId).not.toContain(result.originalIdentity);
    expect(result.sourceReference).toBe("legacy_system_hero");
    expect(result.mappedCount).toBeGreaterThan(0);
    expect(result.skippedCount).toBe(0);
    expect(result.riskCount).toBeGreaterThanOrEqual(3);
    expect(result.valid).toBe(true);
    expect(result.visualRole).toBe("primary-stage");
    expect(result.overlayCompatible).toBe(true);
    expect(result.nodeType).toBe("HeroTemplate");
    expect(result.slotType).toBe("heroTemplate");
    expect(result.layoutPreserved).toBe(true);
  });

  test(`${activeTemplateCount} 个活动兼容来源适配 dry-run 全部生成合法定义且不污染来源或携带旧数字商品引用`, async ({ page }) => {
    const results = JSON.parse(await page.getByTestId("legacy-all-conversion-result").textContent() || "[]") as Array<{
      key: string;
      moduleType: string;
      valid: boolean;
      sourceUnchanged?: boolean;
      nodeCount?: number;
      slotCount?: number;
      defaultContentCount?: number;
      previewContentCount?: number;
      containsLegacyNumericProductReference?: boolean;
      error?: string;
    }>;
    expect(results).toHaveLength(activeTemplateCount);
    expect(results.filter((item) => !item.valid)).toEqual([]);
    for (const result of results) {
      expect(result.sourceUnchanged, result.moduleType).toBe(true);
      expect(result.nodeCount, result.moduleType).toBeGreaterThanOrEqual(3);
      expect(result.slotCount, result.moduleType).toBeGreaterThan(0);
      expect(result.defaultContentCount, result.moduleType).toBe(0);
      expect(result.previewContentCount, result.moduleType).toBe(0);
      expect(result.containsLegacyNumericProductReference, result.moduleType).toBe(false);
    }
  });

  test("视频复杂节点复用成熟业务组件，兼容来源只迁移结构而不携带播放内容", async ({ page }) => {
    const videoRegion = page.getByRole("region", { name: "复杂视频节点" });
    await expect(videoRegion.locator('[data-template-node-type="Video"] video')).toHaveCount(1);
    await expect(videoRegion.getByLabel("中性品牌影片示例")).toBeVisible();
    await expect(videoRegion).toContainText("光影与工艺");

    const result = JSON.parse(await page.getByTestId("legacy-video-conversion-result").textContent() || "{}") as {
      valid: boolean;
      videoNodeType?: string;
      videoSlotType?: string;
      mappedCount: number;
      skippedVideo: boolean;
      previewVideoUrl?: string;
      defaultContainsVideo: boolean;
    };
    expect(result.valid).toBe(true);
    expect(result.videoNodeType).toBe("Video");
    expect(result.videoSlotType).toBe("video");
    expect(result.mappedCount).toBeGreaterThan(0);
    expect(result.skippedVideo).toBe(false);
    expect(result.previewVideoUrl).toBeUndefined();
    expect(result.defaultContainsVideo).toBe(false);
  });

  test("成熟首屏节点在 V2 公开模式复用正式 Renderer，并保留母模板内部构图", async ({ page }) => {
    const region = page.getByRole("region", { name: "成熟首屏 V2 节点" });
    await expect(region.locator('[data-template-node-type="HeroTemplate"] .hc-phase1-hero')).toHaveCount(1);
    await expect(region.locator(".hc-phase1-hero--edit")).toHaveCount(0);
    await expect(region.locator('[data-content-role="copy"] h1')).toHaveCount(1);
    await expect(region.locator('[data-content-template-contract="hero"]')).toHaveCount(1);
  });

  test("16 个成熟 V2 模板在 1920、1200、768、390 四档复用真实 Renderer 且不横向溢出", async ({ page }) => {
    for (const width of [1920, 1200, 768, 390]) {
      await page.setViewportSize({ width, height: Math.max(844, Math.round(width * 0.75)) });
      await page.getByRole("button", {
        name: width === 390 ? "移动端" : "桌面端",
        exact: true,
      }).click();
      const matrix = page.getByTestId("mature-template-v2-matrix");
      await expect(matrix.locator("[data-mature-template-module]")).toHaveCount(16);
      await expect(matrix.locator('[data-content-template-renderer="real"]')).toHaveCount(16);
      const overflow = await matrix.locator("[data-mature-template-module]").evaluateAll((elements) => elements
        .filter((element) => element.scrollWidth > element.clientWidth + 1)
        .map((element) => ({
          moduleType: element.getAttribute("data-mature-template-module"),
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
        })));
      expect(overflow, `${width}px 成熟模板出现横向溢出`).toEqual([]);
    }
  });

  test("21 个成熟及复杂视觉模板在四档宽度与当前公开 Renderer 保持角色顺序和高度等价", async ({ page }) => {
    for (const width of [1920, 1200, 768, 390]) {
      await page.setViewportSize({ width, height: Math.max(844, Math.round(width * 0.75)) });
      await page.goto("/dynamic-template-foundation.html?rendererParity=1");
      const matrix = page.getByTestId("template-renderer-parity-matrix");
      await expect(matrix.locator("[data-parity-module]")).toHaveCount(21);
      await expect.poll(() => matrix.locator("[data-parity-module]").evaluateAll((pairs) => {
        const roleOrder = (owner: Element) => Array.from(owner.querySelectorAll("[data-content-role], [data-content-role-desktop], [data-content-role-mobile]"))
          .map((element) => element.getAttribute("data-content-role")
            || element.getAttribute("data-content-role-desktop")
            || element.getAttribute("data-content-role-mobile"));
        return pairs.flatMap((pair) => {
          const current = pair.querySelector('[data-parity-source="current"] [data-content-template-renderer="real"]');
          const v2 = pair.querySelector('[data-parity-source="v2"] [data-content-template-renderer="real"]');
          if (!current || !v2) return [{ moduleType: pair.getAttribute("data-parity-module"), reason: "missing-renderer" }];
          const currentRoles = roleOrder(current);
          const v2Roles = roleOrder(v2);
          const heightDelta = Math.abs(current.getBoundingClientRect().height - v2.getBoundingClientRect().height);
          const overflow = current.scrollWidth > current.clientWidth + 1 || v2.scrollWidth > v2.clientWidth + 1;
          return JSON.stringify(currentRoles) === JSON.stringify(v2Roles) && heightDelta <= 1 && !overflow
            ? []
            : [{
                moduleType: pair.getAttribute("data-parity-module"),
                reason: "parity",
                currentRoles,
                v2Roles,
                heightDelta,
                overflow,
                currentSpacing: current.querySelector("[data-spacing]")?.getAttribute("data-spacing"),
                v2Spacing: v2.querySelector("[data-spacing]")?.getAttribute("data-spacing"),
                currentSectionPadding: current.querySelector(".hc-phase1-text")
                  ? getComputedStyle(current.querySelector(".hc-phase1-text") as Element).paddingBlock
                  : undefined,
                v2SectionPadding: v2.querySelector(".hc-phase1-text")
                  ? getComputedStyle(v2.querySelector(".hc-phase1-text") as Element).paddingBlock
                  : undefined,
                currentWidth: current.getBoundingClientRect().width,
                v2Width: v2.getBoundingClientRect().width,
                currentActionCount: current.querySelectorAll('[data-content-role="action"]').length,
                v2ActionCount: v2.querySelectorAll('[data-content-role="action"]').length,
              }];
        });
      }), {
        message: `${width}px 当前 Renderer 与 V2 适配器不等价`,
        timeout: 5_000,
      }).toEqual([]);
    }
  });

  for (const device of ["desktop", "mobile"] as const) {
    for (const scenario of ["empty", "long-text", "missing-image"] as const) {
      test(`${activeTemplateCount} 个正式模板在 ${device} 的 ${scenario} 场景保持公共 Renderer 稳定`, async ({ page }) => {
        const runtimeErrors: string[] = [];
        page.on("pageerror", (error) => runtimeErrors.push(error.message));
        page.on("console", (message) => {
          const text = message.text();
          const isExpectedDevServerNoise = text.includes("WebSocket connection")
            || text.includes("[vite] failed to connect to websocket")
            || text.includes("Failed to send error to Vite server");
          if (message.type() === "error" && !isExpectedDevServerNoise) runtimeErrors.push(text);
        });
        await page.setViewportSize(device === "desktop"
          ? { width: 1440, height: 1000 }
          : { width: 390, height: 844 });
        await page.goto(`/dynamic-template-foundation.html?templateScenarios=1&device=${device}&scenario=${scenario}`);

        const matrix = page.getByTestId("template-scenario-regression-matrix");
        await expect(matrix).toHaveAttribute("data-preview-scenario", scenario);
        await expect(matrix).toHaveAttribute("data-preview-device", device);
        await expect(matrix.locator("[data-scenario-template]")).toHaveCount(activeTemplateCount);
        await expect(matrix.locator("[data-dynamic-template-id]")).toHaveCount(activeTemplateCount);
        await page.waitForTimeout(250);
        expect(runtimeErrors, `${device}.${scenario} 不应出现 Renderer 运行时错误`).toEqual([]);
        const overflow = await matrix.locator("[data-scenario-template]").evaluateAll((elements) => elements
          .filter((element) => element.scrollWidth > element.clientWidth + 1)
          .map((element) => ({
            template: element.getAttribute("data-scenario-template"),
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
          })));
        expect(overflow, `${device}.${scenario} 不应产生模板级横向溢出`).toEqual([]);
        await expect.poll(() => page.evaluate(() => (
          document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
        ))).toBe(true);
        if (scenario === "long-text") {
          const runawayHeights = await matrix.locator("[data-scenario-template]").evaluateAll((elements) => elements
            .filter((element) => element.scrollHeight > 12_000)
            .map((element) => ({
              template: element.getAttribute("data-scenario-template"),
              scrollHeight: element.scrollHeight,
            })));
          expect(runawayHeights, `${device}.long-text 不应出现失控高度`).toEqual([]);
        }
      });
    }
  }

  test("3 个业务模板按稳定引用在当前公开 Renderer 与 V2 共用解析、空结果和响应式输出", async ({ page }) => {
    const products = [1, 2].map((id) => ({
      id,
      code: `SAFE-${id}`,
      name: `V2 测试作品 ${id}`,
      price: 0,
      images: [{ url: "/svg/template-product-row.svg", type: "FRONT", isPrimary: true }],
      category: { name: "测试分类" },
    }));
    let returnProducts = true;
    await page.route("**/api/products/public?*", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        code: 200,
        data: { list: returnProducts ? products : [], total: returnProducts ? products.length : 0 },
      }),
    }));
    await page.route("**/api/categories/tree?*", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        code: 200,
        data: [
          { id: 1, slug: "safe-1", name: "测试分类一", coverImage: "/svg/template-category.svg", children: [] },
          { id: 2, slug: "safe-2", name: "测试分类二", coverImage: "/svg/template-category.svg", children: [] },
        ],
      }),
    }));
    await page.route("**/svg/template-*.svg", (route) => route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3" fill="#ddd"/></svg>',
    }));

    for (const width of [1920, 1200, 768, 390]) {
      await page.setViewportSize({ width, height: Math.max(844, Math.round(width * 0.75)) });
      await page.goto("/dynamic-template-foundation.html?businessParity=1");
      const matrix = page.getByTestId("business-renderer-parity-matrix");
      const pairs = matrix.locator("[data-business-parity-module]");
      await expect(pairs).toHaveCount(3);
      await expect.poll(() => pairs.evaluateAll((elements) => elements.flatMap((pair) => {
        const current = pair.querySelector('[data-parity-source="current"] [data-content-template-renderer="real"]');
        const v2 = pair.querySelector('[data-parity-source="v2"] [data-content-template-renderer="real"]');
        if (!current || !v2) return [{ moduleType: pair.getAttribute("data-business-parity-module"), reason: "missing-renderer" }];
        const visibleText = (element: Element) => {
          const clone = element.cloneNode(true) as Element;
          clone.querySelectorAll("style,script").forEach((node) => node.remove());
          return clone.textContent?.replace(/\s+/g, " ").trim();
        };
        const currentText = visibleText(current);
        const v2Text = visibleText(v2);
        const heightDelta = Math.abs(current.getBoundingClientRect().height - v2.getBoundingClientRect().height);
        const overflow = current.scrollWidth > current.clientWidth + 1 || v2.scrollWidth > v2.clientWidth + 1;
        return currentText === v2Text && heightDelta <= 1 && !overflow
          ? []
          : [{
              moduleType: pair.getAttribute("data-business-parity-module"),
              reason: "parity",
              currentText,
              v2Text,
              heightDelta,
              overflow,
            }];
      })), { timeout: 5_000, message: `${width}px 业务模板公开解析不等价` }).toEqual([]);
    }

    returnProducts = false;
    await page.reload();
    const matrix = page.getByTestId("business-renderer-parity-matrix");
    await expect(matrix.getByText("所选主推商品已下架或暂不可展示")).toHaveCount(2);
    await expect(matrix.getByText("所选商品暂不可展示")).toHaveCount(2);
  });

  test("复杂交互与业务节点整体复用成熟组件，兼容来源适配不拆散业务结构", async ({ page }) => {
    const carousel = page.getByRole("region", { name: "复杂轮播节点" });
    await expect(carousel.locator('[data-template-node-type="Carousel"] .homepage-carousel')).toHaveCount(1);
    await expect(carousel.getByRole("img", { name: "中性轮播图片" })).toBeVisible();

    const hotspot = page.getByRole("region", { name: "复杂热区节点" });
    await expect(hotspot.locator('[data-template-node-type="Hotspot"] .homepage-hotspot')).toHaveCount(1);
    await expect(hotspot).toContainText("中性热区");

    const beforeAfter = page.getByRole("region", { name: "复杂前后对比节点" });
    await expect(beforeAfter.locator('[data-template-node-type="BeforeAfter"] [data-content-role="comparisonHandle"]')).toHaveCount(1);
    await expect(beforeAfter).toContainText("珠宝改款");

    const appointment = page.getByRole("region", { name: "复杂预约节点" });
    await expect(appointment.locator('[data-template-node-type="Appointment"] [data-content-role="primaryAction"]')).toHaveCount(1);
    await expect(appointment).toContainText("预约鉴赏");

    const productCard = page.getByRole("region", { name: "业务单品节点" });
    await expect(productCard.locator('[data-template-node-type="ProductCard"] [data-content-role="product"]')).toHaveCount(1);
    await expect(productCard).toContainText("代表作品");
    await expect(productCard).toContainText("请选择 1 件作品");

    const productCollection = page.getByRole("region", { name: "业务商品集合节点" });
    await expect(productCollection.locator('[data-template-node-type="ProductCollection"] .homepage-product-row__grid')).toHaveCount(1);
    await expect(productCollection.getByLabel("待选择商品 1")).toBeVisible();

    const categoryCollection = page.getByRole("region", { name: "业务分类集合节点" });
    await expect(categoryCollection.locator('[data-template-node-type="CategoryCollection"]')).toHaveCount(1);
    await expect(categoryCollection).toContainText("请在右侧配置分类数据");

    const converted = JSON.parse(await page.getByTestId("legacy-complex-conversion-result").textContent() || "[]") as Array<{
      moduleType: string;
      valid: boolean;
      nodeType?: string;
      slotType?: string;
      slotCount: number;
    }>;
    expect(converted).toEqual([
      { moduleType: "轮播图", valid: true, nodeType: "Carousel", slotType: "carousel", slotCount: 1 },
      { moduleType: "热区图", valid: true, nodeType: "Hotspot", slotType: "hotspot", slotCount: 1 },
      { moduleType: "改款对比", valid: true, nodeType: "BeforeAfter", slotType: "beforeAfter", slotCount: 1 },
      { moduleType: "预约入口", valid: true, nodeType: "Appointment", slotType: "appointment", slotCount: 1 },
      { moduleType: "单品焦点推荐", valid: true, nodeType: "ProductCard", slotType: "productCard", slotCount: 1 },
      { moduleType: "产品展示行", valid: true, nodeType: "ProductCollection", slotType: "productCollection", slotCount: 1 },
      { moduleType: "分类卡片", valid: true, nodeType: "CategoryCollection", slotType: "categoryCollection", slotCount: 1 },
    ]);
  });
});
