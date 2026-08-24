import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  CONTENT_TEMPLATE_CONTRACTS,
  CONTENT_TEMPLATE_REGISTRY,
  createContentTemplateMarker,
  type ContentTemplateContract,
} from "../src/page-builder/generated/contentTemplates.generated";

type FixtureBlock = { type: string; props: Record<string, unknown> };

const image = (name: string) => `/svg/template-${name}.svg`;
const screenshotDir = path.resolve("test-results/content-template-renderers");
const fixtureSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000">
    <rect width="1600" height="1000" fill="#ECEBE7"/>
    <path d="M0 760L520 390L860 650L1180 300L1600 720V1000H0Z" fill="#DCDAD4"/>
    <circle cx="1260" cy="230" r="110" fill="#F7F6F3"/>
  </svg>
`;

const mediaByType: Record<string, Record<string, unknown>> = {
  首屏主视觉: { desktopImage: image("hero"), mobileImage: image("hero") },
  全屏出血图: { image: image("full-bleed"), mobileImage: image("full-bleed") },
  视频区块: { videoUrl: "/media/contract-test.mp4", posterUrl: image("video"), aspectRatio: "4:5" },
  轮播图: { images: [1, 2, 3].map((id) => ({ url: image("carousel"), mobileUrl: image("carousel"), alt: `轮播测试图 ${id}`, link: "" })) },
  单图海报: { desktopImage: image("single-poster"), mobileImage: image("single-poster") },
  双图海报: { mainImage: image("double-poster"), detailImage: image("featured-product") },
  定制流程: { steps: [1, 2, 3].map((id) => ({ number: `0${id}`, name: `步骤 ${id}`, desc: "安全测试说明", image: "" })) },
  改款对比: { beforeImage: image("before-after"), afterImage: image("before-after") },
  单品焦点推荐: { productCode: "SAFE-1" },
  产品展示行: { productCodes: ["SAFE-1", "SAFE-2", "SAFE-3"], layout: "grid-3", mobileColumns: 2 },
  作品画廊: { items: [1, 2, 3, 4].map((id) => ({ image: image("asymmetric-gallery"), altText: `画廊测试图 ${id}`, caption: `FIG. 0${id}`, link: "" })) },
  佩戴灵感: { image: image("lookbook"), altText: "佩戴灵感替代文字哨兵", productCodes: ["SAFE-1", "SAFE-2"] },
  分类卡片: { categorySlugs: ["safe-1", "safe-2", "safe-3"] },
  按场景选购: { categories: [1, 2, 3].map((id) => ({ name: `场景 ${id}`, image: image("occasion-guide"), link: "/products", description: "安全测试说明" })) },
  热区图: { image: image("hotspot"), mobileImage: image("hotspot"), altText: "热区导购场景替代文字", hotspots: [{ x: 42, y: 42, width: 12, height: 12, link: "/products", label: "热点" }] },
  卡片网格: { cards: [1, 2, 3].map((id) => ({ icon: `0${id}`, title: `要点 ${id}`, body: "安全测试说明" })) },
  服务承诺: { cards: [1, 2, 3].map((id) => ({ icon: `0${id}`, title: `服务 ${id}`, body: "已确认前仅作测试" })) },
  资质证书: { certificates: [1, 2].map((id) => ({ imageUrl: image("certificate"), name: `证书 ${id}`, desc: "内部测试材料", verificationConfirmed: true })) },
  门店信息: { image: image("store-info"), useSiteSettings: true, storeName: "备用测试门店", address: "备用测试地址", hours: "10:00–18:00", phone: "400-000-0000" },
  真实评价与实拍: { testimonials: [{ name: "测试署名", meta: "已授权测试", content: "这是一条不涉及真实顾客的安全测试引语。", image: image("testimonial"), authorizationConfirmed: true }] },
  预约入口: { backgroundImage: image("booking"), title: "预约鉴赏", subtitle: "安全测试说明", buttonText: "预约鉴赏", linkUrl: "/contact", phone: "400-000-0000", bgColor: "#171717", tone: "dark" },
  限时活动: { eventImage: image("limited-offer"), title: "活动测试标题", body: "安全测试说明", targetDate: "2099-12-31T23:59:59", buttonText: "查看说明", linkUrl: "/about" },
};

const blocks: FixtureBlock[] = CONTENT_TEMPLATE_REGISTRY.map((entry, index) => ({
  type: entry.moduleType,
  props: {
    eyebrow: "SAFE TEST",
    title: "安全测试标题",
    subtitle: "不涉及品牌、商品或服务事实的确定性测试说明。",
    body: "不涉及品牌、商品或服务事实的确定性测试说明。",
    actionText: "查看说明",
    buttonText: "查看说明",
    primaryText: "查看作品",
    targetType: "page",
    linkUrl: "/about",
    bgColor: "#FCFCFB",
    ...(mediaByType[entry.moduleType] ?? {}),
    id: `contract-renderer-${index + 1}`,
    __contentTemplate: createContentTemplateMarker(entry.moduleType),
  },
}));

const products = [1, 2, 3].map((id) => ({
  id,
  code: `SAFE-${id}`,
  name: `测试作品 ${id}`,
  price: 0,
  images: [{ url: image("product-row"), type: "FRONT", isPrimary: true }],
  category: { name: "测试分类" },
  link: `/products/${id}`,
}));

function rendererFixturePage() {
  const document = JSON.stringify({ content: blocks, root: { props: {} } })
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
  return `<!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>* { box-sizing: border-box; } html, body, #root { min-width: 0; margin: 0; }</style>
      </head>
      <body>
        <div id="root"></div>
        <script>window.__CONTENT_TEMPLATE_RENDERER_DOCUMENT__ = ${document};</script>
        <script type="module">
          import RefreshRuntime from "/@react-refresh";
          RefreshRuntime.injectIntoGlobalHook(window);
          window.$RefreshReg$ = () => {};
          window.$RefreshSig$ = () => (type) => type;
          window.__vite_plugin_react_preamble_installed__ = true;
        </script>
        <script type="module" src="/tests/fixtures/content-template-renderers.tsx"></script>
      </body>
    </html>`;
}

type ContractViewport = "desktop" | "mobile";

const ratioValue = (ratio: string) => {
  const [width, height] = ratio.split("/").map((part) => Number(part.trim()));
  return width / height;
};

const roleSelector = (role: string, viewport: ContractViewport) =>
  `[data-content-role="${role}"], [data-content-role-${viewport}="${role}"]`;

async function renderedRoleOrder(
  renderer: ReturnType<Page["locator"]>,
  viewport: ContractViewport,
) {
  return renderer.locator("[data-content-role], [data-content-role-desktop], [data-content-role-mobile]").evaluateAll(
    (nodes, activeViewport) => nodes
      .map((node) => node.getAttribute(`data-content-role-${activeViewport}`) ?? node.getAttribute("data-content-role"))
      .filter((role): role is string => Boolean(role)),
    viewport,
  );
}

function expectedObservedOrder(
  contract: ContentTemplateContract,
  viewport: ContractViewport,
  observed: readonly string[],
) {
  const observedSet = new Set(observed);
  return contract.order[viewport].filter((role) => observedSet.has(role));
}

async function seed(page: Page) {
  await page.route(/\/__content-template-renderers(?:\?.*)?$/, (route) => route.fulfill({
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: rendererFixturePage(),
  }));
  await page.route("**/svg/template-*.svg", (route) => route.fulfill({
    status: 200,
    contentType: "image/svg+xml",
    body: fixtureSvg,
  }));
  await page.route("**/api/analytics/track", (route) => route.fulfill({ status: 204, body: "" }));
  await page.route("**/api/settings/public", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      code: 200,
      data: {
        siteName: "统一来源测试门店",
        contactAddress: "统一来源测试地址",
        businessHours: "09:00–17:00",
        contactPhone: "400-111-2222",
      },
    }),
  }));
  await page.route("**/api/products/public/**", (route) => {
    const id = Number(route.request().url().split("/").pop());
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 200, data: products.find((item) => item.id === id) ?? products[0] }) });
  });
  await page.route("**/api/products/public?*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ code: 200, data: { list: products, total: products.length } }),
  }));
  await page.route("**/api/categories/tree", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      code: 200,
      data: [1, 2, 3].map((id) => ({
        id,
        slug: `safe-${id}`,
        name: `品类 ${id}`,
        coverImage: image("category-cards"),
        children: [],
      })),
    }),
  }));
}

test.describe("23 个内容模板真实 Renderer（确定性 UI）", () => {
  test.beforeEach(async ({ page }) => {
    await seed(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  for (const viewport of [
    { name: "desktop", contractViewport: "desktop", width: 1920, height: 1200 },
    { name: "compact-desktop", contractViewport: "desktop", width: 960, height: 900 },
    { name: "mobile", contractViewport: "mobile", width: 390, height: 844 },
  ]) {
    test(`${viewport.name}：23 个真实 Renderer、真实角色顺序、比例、高度与无横向溢出`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/__content-template-renderers");
      const renderers = page.locator('[data-content-template-renderer="real"]');
      await expect(renderers).toHaveCount(23);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

      for (const entry of CONTENT_TEMPLATE_REGISTRY) {
        const contract = CONTENT_TEMPLATE_CONTRACTS[entry.key];
        const viewportName = viewport.contractViewport as ContractViewport;
        const renderer = page.locator(`[data-content-template-contract="${entry.key}"]`).first();
        await expect(renderer).toBeVisible();
        await expect(renderer).toHaveAttribute(`data-contract-order-${viewportName}`, contract.order[viewportName].join(","));

        const observedRoles = await renderedRoleOrder(renderer, viewportName);
        const declaredRoles = new Set(contract.roles.map((role) => role.id));
        expect(observedRoles.length, `${entry.moduleType} 未暴露真实合同角色`).toBeGreaterThan(0);
        expect(
          observedRoles.filter((role) => !declaredRoles.has(role)),
          `${entry.moduleType} 出现合同外角色`,
        ).toEqual([]);

        const contractOrder = expectedObservedOrder(contract, viewportName, observedRoles);
        expect(
          observedRoles.join(",") === contractOrder.join(","),
          `${entry.moduleType} 真实 DOM 角色顺序 ${observedRoles.join(" > ")} 未匹配合同顺序`,
        ).toBe(true);

        for (const role of contract.roles) {
          const applies = !role.appliesTo || role.appliesTo.includes(viewportName);
          if (!role.required || !applies) continue;
          await expect(
            renderer.locator(roleSelector(role.id, viewportName)).first(),
            `${entry.moduleType}.${role.id} 必需角色未渲染`,
          ).toBeVisible();
        }

        const box = await renderer.boundingBox();
        expect(box?.height ?? 0, `${entry.moduleType} 高度坍塌`).toBeGreaterThan(44);
        const actualHeightMode = contract.heightModeByViewport[viewportName];
        if (actualHeightMode === "viewport") {
          expect(box?.height ?? 0, `${entry.moduleType} 未形成视口舞台`).toBeGreaterThanOrEqual(viewport.height * 0.75);
        }

        const rendererOverflow = await renderer.evaluate((node) => node.scrollWidth <= node.clientWidth + 1);
        expect(rendererOverflow, `${entry.moduleType} 区块发生横向溢出`).toBe(true);

        if (actualHeightMode === "viewport") continue;
        for (const role of contract.roles) {
          if (role.kind !== "media") continue;
          const slotCapability = contract.editorCapabilities.layoutOverrides?.slots?.find((slot) => slot.roleId === role.id);
          // 没有独立比例预设的媒体槽（例如 Booking 的全幅背景）跟随根框架与内容安全高度，
          // 合同中的图片规格比例只用于素材建议，不应误判为真实 DOM 必须始终固定该比例。
          if (slotCapability && (!slotCapability.ratioPresets || slotCapability.ratioPresets.length === 0)) continue;
          const expectedRatio = role.defaultRatioByViewport?.[viewportName];
          if (!expectedRatio) continue;
          const media = renderer.locator(roleSelector(role.id, viewportName)).first();
          if (await media.count() === 0 || !await media.isVisible()) continue;
          const mediaBox = await media.boundingBox();
          expect(mediaBox?.width ?? 0, `${entry.moduleType}.${role.id} 宽度坍塌`).toBeGreaterThan(20);
          expect(mediaBox?.height ?? 0, `${entry.moduleType}.${role.id} 高度坍塌`).toBeGreaterThan(20);
          const actualRatio = (mediaBox?.width ?? 0) / (mediaBox?.height ?? 1);
          expect(
            Math.abs(actualRatio - ratioValue(expectedRatio)),
            `${entry.moduleType}.${role.id} 实际比例 ${actualRatio.toFixed(3)} 不符合 ${expectedRatio}`,
          ).toBeLessThanOrEqual(0.06);
        }
      }
    });
  }

  test("重点合同：视频、商品列数、热点、顾客分享与预约", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1200 });
    await page.goto("/__content-template-renderers");
    await expect(page.locator('[data-content-template-contract="video"] .hc-video-frame')).toHaveCSS("aspect-ratio", "16 / 9");
    await expect(page.locator('[data-content-template-contract="productRow"] .homepage-product-row__grid')).toHaveCSS("grid-template-columns", /.+ .+ .+/);
    await expect(page.locator('[data-content-template-contract="hotspot"] [data-content-role="hotspots"]').first()).toBeVisible();
    await expect(page.locator('[data-content-template-contract="wearingInspiration"] img').first()).toHaveAttribute("alt", "佩戴灵感替代文字哨兵");
    await expect(page.locator('[data-content-template-contract="hotspot"] img').first()).toHaveAttribute("alt", "热区导购场景替代文字");
    await expect(page.locator('[data-content-template-contract="storeInfo"]')).toContainText("统一来源测试门店");
    await expect(page.locator('[data-content-template-contract="storeInfo"]')).not.toContainText("备用测试地址");

    const testimonialRoles = await page.locator('[data-content-template-contract="testimonials"] [data-content-role]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-content-role")));
    expect(testimonialRoles).toEqual(["authorizedPhoto", "mainQuote", "attribution"]);
    const booking = page.locator('[data-content-template-contract="booking"]');
    await expect(booking.locator("form")).toHaveCount(0);
    await expect(booking.locator('[data-content-role="primaryAction"]')).toHaveCount(1);

    await expect
      .poll(() => page.locator('[data-content-template-contract="categoryCards"] a').evaluateAll(
        (links) => links.map((link) => link.getAttribute("href")),
      ))
      .toEqual(["/catalog?category=1", "/catalog?category=2", "/catalog?category=3"]);
    await expect
      .poll(() => page.locator('[data-content-template-contract="sceneShopping"] a').evaluateAll(
        (links) => links.map((link) => link.getAttribute("href")),
      ))
      .toEqual(["/catalog", "/catalog", "/catalog"]);
  });

  test("23 模板声明的可视编辑槽位具有真实 DOM 落点", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1200 });
    await page.goto("/__content-template-renderers");
    for (const entry of CONTENT_TEMPLATE_REGISTRY) {
      const contract = CONTENT_TEMPLATE_CONTRACTS[entry.key];
      const renderer = page.locator(`[data-content-template-contract="${entry.key}"]`).first();
      for (const slot of contract.editorCapabilities.layoutOverrides?.slots ?? []) {
        await expect(
          renderer.locator(`[data-content-role="${slot.roleId}"], [data-content-role-desktop="${slot.roleId}"], [data-content-role-mobile="${slot.roleId}"]`).first(),
          `${entry.moduleType}.${slot.roleId} 合同开放了图片槽位，但真实 Renderer 没有对应节点`,
        ).toBeAttached();
      }
      for (const textRole of contract.editorCapabilities.layoutOverrides?.textRoles ?? []) {
        await expect(
          renderer.locator(`[data-content-role="${textRole.roleId}"], [data-editor-field~="${textRole.roleId}"]`).first(),
          `${entry.moduleType}.${textRole.roleId} 合同开放了文字角色，但真实 Renderer 没有对应节点`,
        ).toBeAttached();
      }
    }
  });

  test("黄金模板：受控实例覆盖被公开 Renderer 消费且 200% 缩放不横溢", async ({ page }) => {
    const hero = blocks.find((block) => block.type === "首屏主视觉")!;
    const productRow = blocks.find((block) => block.type === "产品展示行")!;
    const doublePoster = blocks.find((block) => block.type === "双图海报")!;
    const booking = blocks.find((block) => block.type === "预约入口")!;
    hero.props.__instanceOverrides = {
      version: 2,
      frame: { heightPreset: "compact" },
      nodes: {
        desktopImage: { ratio: 16 / 9, mediaView: { fit: "contain", zoom: 1.1, focusByViewport: { desktop: { x: 32, y: 68 } } } },
        title: { enabled: true, typography: { align: "center", color: "#FCFCFB", safeBand: "dark", maxLines: 3 } },
      },
    };
    productRow.props.__instanceOverrides = {
      version: 1,
      layout: { compositionPreset: "grid-2" },
    };
    doublePoster.props.__instanceOverrides = {
      version: 2,
      frame: { compositionPreset: "detail-led" },
      nodes: {
        mainImage: { ratio: 4 / 5, sizePreset: "standard", positionPreset: "center", mediaView: { fit: "contain", zoom: 1.1, focusByViewport: { desktop: { x: 42, y: 58 } } } },
        detailImage: { ratio: 1, sizePreset: "small", positionPreset: "end", mediaView: { fit: "cover", zoom: 1.05, focusByViewport: { desktop: { x: 60, y: 40 } } } },
      },
    };
    booking.props.backgroundImage = image("booking");
    booking.props.__instanceOverrides = {
      version: 2,
      frame: { heightPreset: "compact", aspectRatioByViewport: { desktop: 16 / 9 } },
      nodes: {
        bgImage: { mediaView: { fit: "contain", zoom: 1.05, focusByViewport: { desktop: { x: 36, y: 64 } } } },
        title: { typography: { align: "center", color: "#FCFCFB", safeBand: "dark", maxLines: 2 } },
      },
    };

    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto("/__content-template-renderers");
    const heroRenderer = page.locator('[data-content-template-contract="hero"]');
    await expect(heroRenderer).toHaveAttribute("data-instance-frame", "compact");
    await expect(heroRenderer.locator('[data-editor-field~="title"]')).toHaveCSS("background-color", "rgb(24, 26, 27)");
    await expect(heroRenderer.locator('[data-content-role-desktop="desktopImage"] img').first()).toHaveCSS("object-fit", "contain");
    await expect(heroRenderer.locator('[data-content-role-desktop="desktopImage"] img').first()).toHaveCSS("object-position", "32% 68%");
    await expect(page.locator('[data-content-template-contract="productRow"] [data-content-role="productCards"]')).toHaveCSS("grid-template-columns", /.+ .+/);
    const doubleRenderer = page.locator('[data-content-template-contract="doublePoster"]');
    await expect(doubleRenderer).toHaveAttribute("data-instance-composition", "detail-led");
    await expect(doubleRenderer.locator('[data-content-role="mainImage"] img')).toHaveCSS("object-fit", "contain");
    await expect(doubleRenderer.locator('[data-content-role="detailImage"] img')).toHaveCSS("object-position", "60% 40%");
    await expect(doubleRenderer.locator('[data-content-role="mainImage"]')).toHaveCSS("justify-self", "center");
    await expect(doubleRenderer.locator('[data-content-role="detailImage"]')).toHaveCSS("justify-self", "end");
    await expect(doubleRenderer.locator('[data-content-role="mainImage"]')).toHaveCSS("grid-column-start", "1");
    await expect(doubleRenderer.locator('[data-content-role="detailImage"]')).toHaveCSS("grid-column-start", "6");
    await expect(doubleRenderer.locator('[data-content-role="copy"]')).toHaveCSS("grid-column-start", "6");
    await expect(doubleRenderer.locator("a")).toHaveCount(1);
    await expect(doubleRenderer.locator('[data-content-role="action"]')).toHaveCount(1);
    const bookingRenderer = page.locator('[data-content-template-contract="booking"]');
    await expect(bookingRenderer).toHaveAttribute("data-instance-frame", "compact");
    await expect(bookingRenderer.locator(".hc-appointment")).toHaveCSS("aspect-ratio", "1.77778 / 1");
    await expect(bookingRenderer.locator('[data-content-role="bgImage"] img')).toHaveCSS("object-fit", "contain");
    await expect(bookingRenderer.locator('[data-editor-field~="title"]')).toHaveCSS("background-color", "rgb(24, 26, 27)");
    await expect(bookingRenderer.locator('[data-content-role="primaryAction"]')).toHaveCount(1);

    await page.evaluate(() => { document.body.style.zoom = "2"; });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    await expect(page.locator('[data-content-template-contract="booking"] [data-content-role="primaryAction"]')).toBeVisible();
  });

  test("重点模板保留桌面、中间宽度与手机截图证据", async ({ page }) => {
    await mkdir(screenshotDir, { recursive: true });
    const keys = ["hero", "video", "doublePoster", "productRow", "hotspot", "testimonials", "booking"];
    for (const viewport of [
      { width: 1920, height: 1200 },
      { width: 960, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/__content-template-renderers");
      for (const key of keys) {
        const renderer = page.locator(`[data-content-template-contract="${key}"]`).first();
        await renderer.scrollIntoViewIfNeeded();
        await renderer.screenshot({ path: path.join(screenshotDir, `${key}-${viewport.width}.png`) });
      }
    }
  });
});
