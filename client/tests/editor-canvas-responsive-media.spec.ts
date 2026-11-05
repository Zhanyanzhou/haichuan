import { expect, test, type Locator, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { installAdminSession } from "./fixtures/session-auth";
import {
  createBlankDynamicTemplateDefinition,
  createDynamicTemplateNode,
  createDynamicTemplateSlotDefinition,
} from "../src/page-builder/template-definition/nodeRegistry";
import { DYNAMIC_TEMPLATE_BLOCK_TYPE } from "../src/page-builder/dynamic-template-instance/types";

const imageSource = "/uploads/page-assets/canvas-responsive-image.jpg";
const backgroundSource = "/uploads/page-assets/canvas-responsive-background.jpg";
const frameSelector = ".homepage-editor__canvas-scale iframe";
type Scenario = { label: string; fit: "cover" | "contain"; semanticRole?: "backgroundImage" };

function fixtureDocument({ fit, semanticRole }: Scenario) {
  const definition = createBlankDynamicTemplateDefinition("画布图片档位测试");
  definition.schemaVersion = 3;
  const root = definition.nodes[definition.rootNodeId];
  const container = createDynamicTemplateNode("Container", "测试图框");
  const slot = createDynamicTemplateSlotDefinition("image", "画布主图", "mainImage");
  if (semanticRole) slot.semanticRole = semanticRole;
  const image = createDynamicTemplateNode("ImageSlot", "画布主图", slot.slotId);
  image.responsive.desktop.height = { mode: "aspect-ratio", ratio: { width: 4, height: 3 } };
  slot.desktopRules = { aspectRatio: "4:3", objectFit: fit, objectPosition: "center center" };
  root.childIds = [container.nodeId];
  root.responsive.desktop.backgroundImage = backgroundSource;
  container.childIds = [image.nodeId];
  definition.nodes[container.nodeId] = container;
  definition.nodes[image.nodeId] = image;
  definition.slots[slot.slotId] = slot;
  return {
    imageNodeId: image.nodeId,
    backgroundNodeId: root.nodeId,
    document: {
      id: 8801, pageKey: "products", version: 1, status: "DRAFT", reviewStatus: "APPROVED",
      editorVersion: "0.22.4", metadata: {}, contentHash: "a".repeat(64),
      updatedAt: "2026-11-05T00:00:00.000Z",
      puckData: {
        root: { props: {} }, zones: {},
        content: [{
          type: DYNAMIC_TEMPLATE_BLOCK_TYPE,
          props: {
            id: "canvas-responsive-block", instanceId: "canvas-responsive-instance", instanceSchemaVersion: 1,
            templateId: definition.templateId, templateVersion: 1, moduleName: definition.name,
            contentBySlotId: { [slot.slotId]: { src: imageSource, alt: "画布主图" } },
            hiddenSlotIds: [], isVisible: true,
            layoutOverridesByNodeId: {
              [image.nodeId]: { desktop: { imageScalePercent: 110, focusXPercent: 25, focusYPercent: 75 } },
            },
          },
        }],
        resolvedDynamicTemplates: {
          [`${definition.templateId}@1`]: {
            templateId: definition.templateId, version: 1, schemaVersion: definition.schemaVersion,
            definitionChecksum: "b".repeat(64), definition,
          },
        },
      },
    },
  };
}

async function installFixture(page: Page, scenario: Scenario) {
  const fixture = fixtureDocument(scenario);
  const facts: string[] = [];
  const previews: { source: string; width: number | null }[] = [];
  const writes: string[] = [];
  let releaseFacts!: () => void;
  let releaseUpgrades!: () => void;
  const factsGate = new Promise<void>((resolve) => { releaseFacts = resolve; });
  const upgradeGate = new Promise<void>((resolve) => { releaseUpgrades = resolve; });
  let holdUpgrades = false;

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const respond = (data: unknown) => route.fulfill({ json: { code: 200, data } });
    if (url.pathname === "/api/upload/media/by-url") {
      const source = url.searchParams.get("url") ?? "";
      facts.push(source);
      await factsGate;
      return respond({
        url: source, displayWidth: 6000, displayHeight: source === imageSource ? 3000 : 6000,
        metadataStatus: "measured", mediaRevision: "canvas-fixture", animated: false,
      });
    }
    if (url.pathname === "/api/upload/media/preview-by-storage-key") {
      const source = `/uploads/${url.searchParams.get("storageKey")}`;
      const width = url.searchParams.has("width") ? Number(url.searchParams.get("width")) : null;
      // 属性区小预览由原生 img 另发请求。这里只记录画布宿主取回的授权 blob。
      if (request.method() === "GET" && request.headers()["x-session-domain"] === "admin") {
        previews.push({ source, width });
        if (holdUpgrades) await upgradeGate;
      }
      const pixelWidth = width ?? 6000;
      const pixelHeight = source === imageSource ? pixelWidth / 2 : pixelWidth;
      return route.fulfill({
        contentType: "image/svg+xml",
        body: `<svg xmlns="http://www.w3.org/2000/svg" width="${pixelWidth}" height="${pixelHeight}"><rect width="100%" height="100%" fill="#998877"/></svg>`,
      });
    }
    if (url.pathname.endsWith("/document/validate")) return respond({ valid: true, errors: [], issues: [] });
    if (request.method() !== "GET") writes.push(`${request.method()} ${url.pathname}`);
    if (url.pathname.endsWith("/document/published/admin")) return respond(null);
    if (url.pathname.endsWith("/document/admin")) return respond(fixture.document);
    if (url.pathname.endsWith("/dynamic-templates/catalog")) return respond({ items: [] });
    if (url.pathname.endsWith("/dynamic-templates/published") || url.pathname.endsWith("/document/revisions")) return respond([]);
    return respond({});
  });
  await page.route("**/uploads/page-assets/canvas-responsive-*", (route) => route.fulfill({ status: 404 }));
  await installAdminSession(page);
  return { ...fixture, facts, previews, writes, releaseFacts, releaseUpgrades, holdUpgrades: () => { holdUpgrades = true; } };
}

const decodedWidth = (image: Locator) => image.evaluate((element: HTMLImageElement) =>
  element.complete ? element.naturalWidth : 0);

const tiers = [480, 800, 1200, 1680, 2400, 2880, 3840];

async function expectedTier(page: Page, surface: Locator, fit: Scenario["fit"]) {
  // 这个夹具固定使用 2:1 横图和 110% 作者缩放。铺满与完整显示分别由长边与短边限制。
  const scale = await page.locator(frameSelector).evaluate((frame: HTMLIFrameElement) => frame.getBoundingClientRect().width / frame.offsetWidth);
  const box = await surface.evaluate((element: HTMLElement) => ({
    width: element.offsetWidth, height: element.offsetHeight,
    dpr: element.ownerDocument.defaultView!.devicePixelRatio,
  }));
  expect(box.width).toBeGreaterThan(0);
  expect(box.height).toBeGreaterThan(0);
  expect(box.dpr).toBe(1.25);
  const paintedWidth = fit === "cover" ? Math.max(box.width, box.height * 2) : Math.min(box.width, box.height * 2);
  const need = paintedWidth * scale * box.dpr * 1.1;
  const tier = tiers.find((width) => width >= need);
  expect(tier, `fixture width for ${need}px`).toBeDefined();
  return tier!;
}

test.use({ viewport: { width: 1240, height: 900 }, deviceScaleFactor: 1.25 });

for (const scenario of [
  { label: "普通主图铺满", fit: "cover" },
  { label: "背景图槽完整显示", fit: "contain", semanticRole: "backgroundImage" },
] satisfies Scenario[]) {
  test(`店铺装修 ${scenario.label}按实际大小请求派生图，放大时保留已解码图片和原构图`, async ({ page }, testInfo) => {
    test.skip(process.env.PLAYWRIGHT_APP_MODE === "mock", "真实 Puck 路由和自有 HTTP 夹具");
    const fixture = await installFixture(page, scenario);
    try {
      await page.goto("/admin/editor/products");
      const canvas = page.frameLocator(frameSelector);
      const image = canvas.locator(`[data-template-node-id="${fixture.imageNodeId}"] img`);
      const background = canvas.locator(`[data-template-node-id="${fixture.backgroundNodeId}"]`);
      await expect(background).toBeVisible();
      await expect.poll(() => page.locator(frameSelector).evaluate((frame: HTMLIFrameElement) =>
        frame.getBoundingClientRect().width / frame.offsetWidth)).toBeLessThan(0.8);
      await expect.poll(() => fixture.facts).toContain(imageSource);
      fixture.releaseFacts();

      await expect(image).toHaveAttribute("src", /^blob:/);
      const smallImageWidth = await expectedTier(page, image, scenario.fit);
      await expect.poll(() => decodedWidth(image)).toBe(smallImageWidth);
      expect(fixture.previews).toContainEqual({ source: imageSource, width: smallImageWidth });
      await expect(image).toHaveCSS("object-fit", scenario.fit);
      await expect(image).toHaveCSS("object-position", "25% 75%");
      await expect(image).toHaveCSS("transform", "matrix(1.1, 0, 0, 1.1, 0, 0)");

      const initialImageSrc = await image.getAttribute("src");
      fixture.holdUpgrades();
      await page.getByRole("button", { name: "100%", exact: true }).click();
      await expect.poll(() => page.locator(frameSelector).evaluate((frame: HTMLIFrameElement) =>
        frame.getBoundingClientRect().width / frame.offsetWidth)).toBeCloseTo(1, 2);
      const largeImageWidth = await expectedTier(page, image, scenario.fit);
      expect(largeImageWidth).toBeGreaterThan(smallImageWidth);
      await expect.poll(() => fixture.previews).toContainEqual({ source: imageSource, width: largeImageWidth });
      await expect(image).toHaveAttribute("src", initialImageSrc!);
      await expect.poll(() => decodedWidth(image)).toBe(smallImageWidth);

      fixture.releaseUpgrades();
      await expect.poll(() => decodedWidth(image)).toBe(largeImageWidth);
      await expect(image).toHaveCSS("object-fit", scenario.fit);
      await expect(image).toHaveCSS("object-position", "25% 75%");
      await expect(image).toHaveCSS("transform", "matrix(1.1, 0, 0, 1.1, 0, 0)");
      // 页面实例仍遵循既有契约，不回放模板节点保存的背景照片。
      await expect(background).toHaveCSS("background-image", "none");
      expect(fixture.facts).not.toContain(backgroundSource);
      expect(fixture.previews.some(({ source }) => source === backgroundSource)).toBe(false);
      expect(fixture.previews).toEqual([
        { source: imageSource, width: smallImageWidth },
        { source: imageSource, width: largeImageWidth },
      ]);
      expect(fixture.writes).toEqual([]);
      const evidencePath = testInfo.outputPath("canvas-widths.json");
      await writeFile(evidencePath, JSON.stringify({ scenario, previews: fixture.previews }, null, 2));
      await testInfo.attach("画布图片请求档位", {
        path: evidencePath, contentType: "application/json",
      });
    } finally {
      fixture.releaseFacts();
      fixture.releaseUpgrades();
    }
  });
}
