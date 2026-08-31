import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  CONTENT_TEMPLATE_CONTRACTS,
  CONTENT_TEMPLATE_EDITOR_ACCEPTANCE_MATRIX,
  CONTENT_TEMPLATE_REGISTRY,
  createContentTemplateMarker,
  getContentTemplateIssues,
  sanitizeContentTemplateLayoutData,
  type ContentTemplateContract,
} from "../src/page-builder/generated/contentTemplates.generated";

type FixtureBlock = { type: string; props: Record<string, unknown> };

const image = (name: string) => `/svg/template-${name}.svg`;
const screenshotDir = path.resolve(
  "../artifacts/design-audit/template-v2-acceptance-2026-08-29/screenshots",
);
const fixtureSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000">
    <rect width="1600" height="1000" fill="#ECEBE7"/>
    <path d="M0 760L520 390L860 650L1180 300L1600 720V1000H0Z" fill="#DCDAD4"/>
    <circle cx="1260" cy="230" r="110" fill="#F7F6F3"/>
  </svg>
`;

const mediaByType: Record<string, Record<string, unknown>> = {
  首屏主视觉: { desktopImage: image("hero"), mobileImage: image("hero"), altText: "首屏主视觉替代文字哨兵" },
  全屏出血图: { image: image("full-bleed"), mobileImage: image("full-bleed"), altText: "全屏出血图替代文字哨兵" },
  视频区块: { videoUrl: "/media/contract-test.mp4", posterUrl: image("video"), aspectRatio: "4:5" },
  轮播图: { images: [1, 2, 3].map((id) => ({ url: image("carousel"), mobileUrl: image("carousel"), alt: `轮播测试图 ${id}`, link: "" })) },
  单图海报: { desktopImage: image("single-poster"), mobileImage: image("single-poster"), altText: "单图海报替代文字哨兵" },
  双图海报: { mainImage: image("double-poster"), detailImage: image("featured-product"), mainAltText: "双图海报主图替代文字哨兵", detailAltText: "双图海报细节图替代文字哨兵" },
  工艺细节: {
    leadImage: image("craft-lead"),
    leadAltText: "工艺主图测试替代文字",
    detailImageOne: image("craft-detail-one"),
    detailOneAltText: "工艺细节图一测试替代文字",
    detailImageTwo: image("craft-detail-two"),
    detailTwoAltText: "工艺细节图二测试替代文字",
  },
  定制流程: { steps: [1, 2, 3].map((id) => ({ number: `0${id}`, name: `步骤 ${id}`, desc: "安全测试说明", image: image("journey") })) },
  改款对比: { beforeImage: image("before-after"), afterImage: image("before-after"), beforeAltText: "改款前替代文字哨兵", afterAltText: "改款后替代文字哨兵" },
  单品焦点推荐: {
    productCode: "SAFE-1",
    secondaryText: "查看说明",
    secondaryTargetType: "page",
    secondaryLinkUrl: "/about",
  },
  产品展示行: { productCodes: ["SAFE-1", "SAFE-2", "SAFE-3"], layout: "grid-3", mobileColumns: 2 },
  作品画廊: { items: [1, 2, 3, 4].map((id) => ({ image: image("asymmetric-gallery"), altText: `画廊测试图 ${id}`, caption: `FIG. 0${id}`, link: "" })) },
  佩戴灵感: { image: image("lookbook"), altText: "佩戴灵感替代文字哨兵", productCodes: ["SAFE-1", "SAFE-2"] },
  分类卡片: { categorySlugs: ["safe-1", "safe-2", "safe-3"] },
  按场景选购: { categories: [1, 2, 3].map((id) => ({ name: `场景 ${id}`, image: image("occasion-guide"), altText: `场景入口替代文字 ${id}`, link: "/products", description: "安全测试说明" })) },
  热区图: { image: image("hotspot"), mobileImage: image("hotspot"), altText: "热区导购场景替代文字", hotspots: [{ x: 42, y: 42, width: 12, height: 12, link: "/products", label: "热点" }] },
  卡片网格: { cards: [1, 2, 3].map((id) => ({ icon: `0${id}`, title: `要点 ${id}`, body: "安全测试说明" })) },
  服务承诺: { cards: [1, 2, 3].map((id) => ({ icon: `0${id}`, title: `服务 ${id}`, body: "已确认前仅作测试" })) },
  资质证书: { certificates: [1, 2].map((id) => ({ imageUrl: image("certificate"), name: `证书 ${id}`, desc: "内部测试材料", verificationConfirmed: true })) },
  门店信息: {
    image: image("store-info"),
    useSiteSettings: false,
    storeName: "备用测试门店",
    address: "备用测试地址",
    hours: "10:00–18:00",
    phone: "400-000-0000",
    mapUrl: "https://legacy.invalid/store",
  },
  真实评价与实拍: { testimonials: [{ name: "测试署名", meta: "已授权测试", content: "这是一条不涉及真实顾客的安全测试引语。", image: image("testimonial"), authorizationConfirmed: true }] },
  预约入口: { backgroundImage: image("booking"), altText: "预约背景替代文字哨兵", title: "预约鉴赏", subtitle: "安全测试说明", buttonText: "预约鉴赏", linkUrl: "/contact", phone: "400-000-0000", bgColor: "#171717", tone: "dark" },
  限时活动: { eventImage: image("limited-offer"), title: "活动测试标题", body: "安全测试说明", targetDate: "2099-12-31T23:59:59", buttonText: "查看说明", linkUrl: "/about" },
};

const createBlocks = (): FixtureBlock[] => CONTENT_TEMPLATE_REGISTRY.map((entry, index) => ({
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
const emptyFixtureValue = (value: unknown): unknown => {
  if (typeof value === "string") return "";
  if (typeof value === "number") return 0;
  if (typeof value === "boolean") return false;
  if (Array.isArray(value)) return [];
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, emptyFixtureValue(nested)]),
    );
  }
  return value;
};
const createEmptyBlocks = (): FixtureBlock[] => createBlocks().map((block, index) => ({
  type: block.type,
  props: {
    ...Object.fromEntries(
      Object.entries(block.props)
        .filter(([key]) => key !== "id" && key !== "__contentTemplate")
        .map(([key, value]) => [key, emptyFixtureValue(value)]),
    ),
    id: `empty-contract-renderer-${index + 1}`,
    __contentTemplate: block.props.__contentTemplate,
  },
}));
const STRESS_TEXT_KEYS = new Set([
  "title", "subtitle", "body", "description", "desc", "content", "name", "label", "caption",
  "beforeLabel", "afterLabel", "actionText", "buttonText", "primaryText", "secondaryText",
  "storeName", "address",
]);
const stressFixtureValue = (value: unknown, key = ""): unknown => {
  if (typeof value === "string") {
    if (/^\/(?:svg|media)\//.test(value)) return "/media/contract-missing-asset";
    if (STRESS_TEXT_KEYS.has(key)) return `异常内容${"仍需稳定换行".repeat(18)}`;
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => stressFixtureValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([nestedKey, nested]) => [nestedKey, stressFixtureValue(nested, nestedKey)]),
    );
  }
  return value;
};
const createStressBlocks = (): FixtureBlock[] => createBlocks().map((block, index) => ({
  type: block.type,
  props: {
    ...stressFixtureValue(block.props) as Record<string, unknown>,
    id: `stress-contract-renderer-${index + 1}`,
    __contentTemplate: block.props.__contentTemplate,
  },
}));
const templateCount = CONTENT_TEMPLATE_REGISTRY.length;

const products = [1, 2, 3].map((id) => ({
  id,
  code: `SAFE-${id}`,
  name: `测试作品 ${id}`,
  price: 0,
  images: [{ url: image("product-row"), type: "FRONT", isPrimary: true }],
  category: { name: "测试分类" },
  link: `/products/${id}`,
}));

function rendererFixturePage(blocks: FixtureBlock[] = createBlocks()) {
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

async function horizontalOverflowNodes(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    return Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .flatMap((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.width <= 1 || (rect.right <= viewportWidth + 1 && rect.left >= -1)) return [];
        return [{
          tag: element.tagName.toLowerCase(),
          className: String(element.className).slice(0, 120),
          role: element.dataset.contentRole ?? element.dataset.contentTemplateContract ?? "",
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        }];
      })
      .slice(0, 20);
  });
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
  await page.route("**/api/products/catalog/stream**", (route) => route.abort());
  await page.route("**/api/page-modules/document/stream**", (route) => route.abort());
  await page.route("**/api/settings/public**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      code: 200,
      data: {
        siteName: "统一来源测试品牌",
        storeName: "统一来源测试门店",
        contactAddress: "统一来源测试地址",
        businessHours: "09:00–17:00",
        contactPhone: "400-111-2222",
        storeMapUrl: "https://maps.example.com/unified-store",
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
  await page.route("**/api/categories/tree**", (route) => route.fulfill({
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

test.describe(`${templateCount} 个内容模板真实 Renderer（确定性 UI）`, () => {
  test.beforeEach(async ({ page }) => {
    await seed(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("全部 24 模板在全空素材与空业务来源下保持双端安全输出", async ({ page }) => {
    const runtimeErrors: string[] = [];
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    await page.unroute(/\/__content-template-renderers(?:\?.*)?$/);
    await page.route(/\/__content-template-renderers(?:\?.*)?$/, (route) => route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: rendererFixturePage(createEmptyBlocks()),
    }));
    await page.unroute("**/api/settings/public**");
    await page.route("**/api/settings/public**", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ code: 200, data: {} }),
    }));
    await page.unroute("**/api/products/public/**");
    await page.route("**/api/products/public/**", (route) => route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ code: 404, data: null }),
    }));
    await page.unroute("**/api/products/public?*");
    await page.route("**/api/products/public?*", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ code: 200, data: { list: [], total: 0 } }),
    }));
    await page.unroute("**/api/categories/tree**");
    await page.route("**/api/categories/tree**", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ code: 200, data: [] }),
    }));

    for (const viewport of [
      { width: 1920, height: 1200 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/__content-template-renderers");
      await expect(page.locator('[data-content-template-renderer="real"]')).toHaveCount(templateCount);
      expect(await horizontalOverflowNodes(page), `${viewport.width}px 全空页面不得横向溢出`).toEqual([]);
      expect(await page.locator('img[src=""], img:not([src])').count(), "全空素材不得生成空图片请求").toBe(0);
      expect(
        await page.locator("a").evaluateAll((links) => links
          .filter((link) => !(link.getAttribute("href") ?? "").trim())
          .map((link) => link.outerHTML)),
        "全空行动不得生成空链接",
      ).toEqual([]);
      expect(
        await page.locator("body").innerText(),
        "公开端不得泄漏编辑器上传或填写提示",
      ).not.toMatch(/点击上传|拖入图片|请在右侧|待上传|待补充/);
      for (const entry of CONTENT_TEMPLATE_REGISTRY) {
        const renderer = page.locator(`[data-content-template-contract="${entry.key}"]`).first();
        await expect(renderer, `${entry.moduleType} 全空状态仍应保留可识别合同边界`).toBeAttached();
        expect(
          await renderer.evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
          `${entry.moduleType} 全空状态不得横向溢出`,
        ).toBe(true);
        expect(await renderer.innerText()).not.toMatch(/\bundefined\b|\bnull\b|\bNaN\b/);
      }
    }
    expect(runtimeErrors).toEqual([]);
  });

  test("全部 24 模板在坏媒体与超长内容下保持四档稳定边界", async ({ page }) => {
    const runtimeErrors: string[] = [];
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    await page.unroute(/\/__content-template-renderers(?:\?.*)?$/);
    await page.route(/\/__content-template-renderers(?:\?.*)?$/, (route) => route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: rendererFixturePage(createStressBlocks()),
    }));
    await page.route("**/media/contract-missing-asset", (route) => route.fulfill({
      status: 404,
      contentType: "text/plain; charset=utf-8",
      body: "missing",
    }));

    for (const viewport of [
      { width: 1920, height: 1200 },
      { width: 1200, height: 900 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/__content-template-renderers");
      await expect(page.locator('[data-content-template-renderer="real"]')).toHaveCount(templateCount);
      await expect.poll(() => horizontalOverflowNodes(page), {
        message: `${viewport.width}px 坏媒体与超长内容不得造成页面横向溢出`,
      }).toEqual([]);
      for (const entry of CONTENT_TEMPLATE_REGISTRY) {
        const renderer = page.locator(`[data-content-template-contract="${entry.key}"]`).first();
        await expect(renderer, `${entry.moduleType} 异常内容下仍应保留合同边界`).toBeAttached();
        expect(await renderer.innerText()).not.toMatch(/\bundefined\b|\bnull\b|\bNaN\b/);
      }
    }
    expect(runtimeErrors).toEqual([]);
  });

  test("原始发布门禁拒绝未知设备，公开净化器保留双端并剔除未知设备", () => {
    const rawTextBannerOverrides = {
      version: 2 as const,
      nodes: {
        copy: {
          rectByViewport: {
            desktop: { x: 0.08, y: 0.56, width: 0.48, height: 0.18 },
            mobile: { x: 0.06, y: 0.38, width: 0.88, height: 0.2 },
            tablet: { x: 0.1, y: 0.1, width: 0.8, height: 0.2 },
          },
          zIndexByViewport: { desktop: 3, mobile: 4, tablet: 5 },
        },
      },
    };
    const rawIssues = getContentTemplateIssues({
      moduleType: "文字横幅",
      props: {
        __contentTemplate: createContentTemplateMarker("文字横幅"),
        __instanceOverrides: rawTextBannerOverrides,
      },
    });
    expect(rawIssues.some((issue) =>
      issue.severity === "error" && issue.path.includes("rectByViewport"),
    )).toBe(true);
    const sanitizedTextBanner = sanitizeContentTemplateLayoutData("文字横幅", rawTextBannerOverrides);
    expect(sanitizedTextBanner?.nodes?.copy?.rectByViewport?.desktop).toBeDefined();
    expect(sanitizedTextBanner?.nodes?.copy?.rectByViewport?.mobile).toBeDefined();
    expect((sanitizedTextBanner?.nodes?.copy?.rectByViewport as Record<string, unknown>)?.tablet).toBeUndefined();

    const heroOverrides = {
      version: 2 as const,
      nodes: {
        title: {
          rectByViewport: rawTextBannerOverrides.nodes.copy.rectByViewport,
          zIndexByViewport: rawTextBannerOverrides.nodes.copy.zIndexByViewport,
        },
      },
    };
    const sanitizedHero = sanitizeContentTemplateLayoutData("首屏主视觉", heroOverrides);
    expect(sanitizedHero?.nodes?.title?.rectByViewport?.desktop).toBeDefined();
    expect(sanitizedHero?.nodes?.title?.rectByViewport?.mobile).toBeDefined();
    expect(sanitizedHero?.nodes?.title?.zIndexByViewport?.desktop).toBe(3);
    expect(sanitizedHero?.nodes?.title?.zIndexByViewport?.mobile).toBe(4);
  });

  test("浏览器缺少观察器 API 时双图海报仍显示核心媒体", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.addInitScript(() => {
      Object.defineProperty(window, "IntersectionObserver", {
        configurable: true,
        value: undefined,
      });
      Object.defineProperty(window, "ResizeObserver", {
        configurable: true,
        value: undefined,
      });
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/__content-template-renderers");

    const doublePoster = page.locator('[data-content-template-contract="doublePoster"]');
    await expect(doublePoster.locator('[data-content-role="mainImage"]')).toHaveCSS("opacity", "1");
    await expect(doublePoster.locator('[data-content-role="detailImage"]')).toBeVisible();
  });

  test("公开 Renderer 不生成未登记页面死链，并保留登记页面查询参数", async ({ page }) => {
    const blocks: FixtureBlock[] = [
      {
        type: "首屏主视觉",
        props: {
          id: "invalid-page-target",
          desktopImage: image("hero"),
          mobileImage: image("hero"),
          altText: "页面目标门禁测试主视觉",
          title: "未登记页面目标",
          actionText: "不应生成死链",
          targetType: "page",
          linkUrl: "/not-a-route",
          __contentTemplate: createContentTemplateMarker("首屏主视觉"),
        },
      },
      {
        type: "文字横幅",
        props: {
          id: "valid-page-target",
          title: "登记页面目标",
          buttonText: "进入筛选结果",
          targetType: "page",
          linkUrl: "/catalog?category=12",
          __contentTemplate: createContentTemplateMarker("文字横幅"),
        },
      },
    ];
    await page.unroute(/\/__content-template-renderers(?:\?.*)?$/);
    await page.route(/\/__content-template-renderers(?:\?.*)?$/, (route) => route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: rendererFixturePage(blocks),
    }));

    await page.goto("/__content-template-renderers");
    await expect(page.getByText("未登记页面目标")).toBeVisible();
    await expect(page.getByRole("link", { name: "不应生成死链" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "进入筛选结果" })).toHaveAttribute(
      "href",
      "/catalog?category=12",
    );
  });

  for (const viewport of [
    { name: "desktop", contractViewport: "desktop", width: 1920, height: 1200 },
    { name: "desktop-standard", contractViewport: "desktop", width: 1440, height: 900 },
    { name: "compact-desktop", contractViewport: "desktop", width: 1024, height: 768 },
    { name: "tablet-portrait", contractViewport: "desktop", width: 768, height: 1024 },
    { name: "mobile", contractViewport: "mobile", width: 390, height: 844 },
  ]) {
    test(`${viewport.name}：${templateCount} 个真实 Renderer、真实角色顺序、比例、高度与无横向溢出`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/__content-template-renderers");
      const renderers = page.locator('[data-content-template-renderer="real"]');
      await expect(renderers).toHaveCount(templateCount);
      // 商品 Renderer 在 mock 模式仍沿真实异步解析路径；先等待稳定角色落点，
      // 再读取全量 DOM 顺序，避免把合法 loading 状态误判为合同缺失。
      await expect(page.locator('[data-content-template-contract="featuredProduct"] [data-content-role="product"]')).toBeAttached();
      await expect(page.locator('[data-content-template-contract="productRow"] [data-content-role="productCards"]')).toBeAttached();
      expect(await horizontalOverflowNodes(page), "页面出现横向越界节点").toEqual([]);

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
        // 768–1023px 使用现行中间宽度 CSS 重排；它继承 desktop 的素材与阅读顺序，
        // 但不强制维持大桌面的满视口舞台高度。
        if (actualHeightMode === "viewport" && viewport.width >= 1024) {
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
          // 前后对比的两张素材以 cover 方式叠满同一个合成画框，素材比例约束用于上传与实例裁切，
          // 真实 img DOM 必须跟随合成画框，不能分别强制成 4:5。
          if (contract.key === "comparison" && (role.id === "before" || role.id === "after")) continue;
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

  test("768px 视口不会因非覆盖式滚动条压缩内容宽度而切换为手机顺序", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/__content-template-renderers");
    const renderer = page.locator('[data-content-template-contract="doublePoster"]').first();
    await renderer.evaluate((node) => {
      (node as HTMLElement).style.width = "753px";
    });

    const contract = CONTENT_TEMPLATE_CONTRACTS.doublePoster;
    await expect.poll(async () => {
      const observedRoles = await renderedRoleOrder(renderer, "desktop");
      return observedRoles.join(",");
    }).toBe(contract.order.desktop.join(","));
  });

  test("重点合同：视频、商品列数、热点、顾客分享与预约", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1200 });
    await page.goto("/__content-template-renderers");
    await expect(page.locator('[data-content-template-contract="video"] .hc-video__media')).toHaveCSS("aspect-ratio", "16 / 9");
    await expect(page.locator('[data-content-template-contract="productRow"] .homepage-product-row__grid')).toHaveCSS("grid-template-columns", /.+ .+ .+/);
    await expect(page.locator('[data-content-template-contract="hotspot"] [data-content-role="hotspots"]').first()).toBeVisible();
    await expect(page.locator('[data-content-template-contract="wearingInspiration"] img').first()).toHaveAttribute("alt", "佩戴灵感替代文字哨兵");
    await expect(page.locator('[data-content-template-contract="hotspot"] img').first()).toHaveAttribute("alt", "热区导购场景替代文字");
    await expect(page.locator('[data-content-template-contract="hero"] img:visible').first()).toHaveAttribute("alt", "首屏主视觉替代文字哨兵");
    await expect(page.locator('[data-content-template-contract="fullBleed"] img').first()).toHaveAttribute("alt", "全屏出血图替代文字哨兵");
    await expect(page.locator('[data-content-template-contract="singlePoster"] img:visible').first()).toHaveAttribute("alt", "单图海报替代文字哨兵");
    await expect(page.locator('[data-content-template-contract="doublePoster"] [data-content-role="mainImage"] img').first()).toHaveAttribute("alt", "双图海报主图替代文字哨兵");
    await expect(page.locator('[data-content-template-contract="doublePoster"] [data-content-role="detailImage"] img').first()).toHaveAttribute("alt", "双图海报细节图替代文字哨兵");
    const comparison = page.locator('[data-content-template-contract="comparison"]');
    await expect(comparison.getByRole("img", { name: "改款前替代文字哨兵" })).toBeVisible();
    await expect(comparison.getByRole("img", { name: "改款后替代文字哨兵" })).toBeVisible();
    const comparisonTrack = page.locator('[data-content-template-contract="comparison"] .hc-before-after__track');
    const desktopComparisonBox = await comparisonTrack.boundingBox();
    expect(
      (desktopComparisonBox?.width ?? 0) / (desktopComparisonBox?.height ?? 1),
      "改款对比桌面画框应使用模板合同 8:5，而不是单张素材 4:5",
    ).toBeCloseTo(1.6, 1);
    await comparisonTrack.focus();
    await comparisonTrack.press("ArrowRight");
    await expect(comparisonTrack).toHaveAttribute("aria-valuenow", "51");
    await comparisonTrack.press("Shift+ArrowLeft");
    await expect(comparisonTrack).toHaveAttribute("aria-valuenow", "41");
    await expect(page.locator('[data-content-template-contract="booking"]').getByRole("img", { name: "预约背景替代文字哨兵" })).toBeVisible();
    const carousel = page.locator('[data-content-template-contract="carousel"] .homepage-carousel');
    await expect(carousel.getByRole("img", { name: "轮播测试图 1" })).toBeVisible();
    await carousel.focus();
    await carousel.press("ArrowRight");
    await expect(carousel.getByRole("img", { name: "轮播测试图 2" })).toBeVisible();
    const pauseCarousel = carousel.getByRole("button", { name: "暂停自动轮播" });
    await pauseCarousel.click();
    await expect(carousel.getByRole("button", { name: "继续自动轮播" })).toHaveAttribute("aria-pressed", "true");
    await carousel.getByRole("button", { name: "切换到第 3 张轮播图" }).click();
    await expect(carousel.getByRole("img", { name: "轮播测试图 3" })).toBeVisible();
    await expect(page.locator('[data-content-template-contract="gallery"]').getByRole("img", { name: "画廊测试图 1" })).toBeVisible();
    await expect(page.locator('[data-content-template-contract="sceneShopping"]').getByRole("img", { name: "场景入口替代文字 1" })).toBeVisible();
    await expect(page.locator('[data-content-template-contract="journey"]').getByRole("img", { name: "步骤 1" })).toBeVisible();
    await expect(page.locator('[data-content-template-contract="certificates"]').getByRole("img", { name: "证书 1" })).toBeVisible();
    await expect(page.locator('[data-content-template-contract="testimonials"]').getByRole("img", { name: "测试署名" })).toBeVisible();
    await expect(page.locator('[data-content-template-contract="storeInfo"]')).toContainText("统一来源测试门店");
    await expect(page.locator('[data-content-template-contract="storeInfo"]')).not.toContainText("备用测试门店");
    await expect(page.locator('[data-content-template-contract="storeInfo"]')).not.toContainText("备用测试地址");
    await expect(page.locator('[data-content-template-contract="storeInfo"] [data-content-role="action"]'))
      .toHaveAttribute("href", "https://maps.example.com/unified-store");

    const testimonialRoles = await page.locator('[data-content-template-contract="testimonials"] [data-content-role]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-content-role")));
    expect(testimonialRoles).toEqual(["authorizedPhoto", "mainQuote", "attribution"]);
    const booking = page.locator('[data-content-template-contract="booking"]');
    await expect(booking.locator("form")).toHaveCount(0);
    await expect(booking.locator('[data-content-role="primaryAction"]')).toHaveCount(1);
    await expect(booking.locator('[data-content-role="secondaryContact"]')).toHaveText("400-111-2222");
    await expect(booking).not.toContainText("400-000-0000");

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

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/__content-template-renderers");
    const mobileCarousel = page.locator('[data-content-template-contract="carousel"] .homepage-carousel');
    const mobileCarouselBox = await mobileCarousel.boundingBox();
    await mobileCarousel.dispatchEvent("pointerdown", {
      pointerId: 9,
      pointerType: "touch",
      clientX: (mobileCarouselBox?.x ?? 0) + (mobileCarouselBox?.width ?? 0) * 0.8,
      clientY: (mobileCarouselBox?.y ?? 0) + (mobileCarouselBox?.height ?? 0) * 0.5,
    });
    await mobileCarousel.dispatchEvent("pointerup", {
      pointerId: 9,
      pointerType: "touch",
      clientX: (mobileCarouselBox?.x ?? 0) + (mobileCarouselBox?.width ?? 0) * 0.2,
      clientY: (mobileCarouselBox?.y ?? 0) + (mobileCarouselBox?.height ?? 0) * 0.5,
    });
    await expect(mobileCarousel.getByRole("img", { name: "轮播测试图 2" })).toBeVisible();
    const mobileComparisonBox = await page
      .locator('[data-content-template-contract="comparison"] .hc-before-after__track')
      .boundingBox();
    expect(
      (mobileComparisonBox?.width ?? 0) / (mobileComparisonBox?.height ?? 1),
      "改款对比移动画框应使用模板合同 4:5",
    ).toBeCloseTo(0.8, 1);
    const mobileVideo = page.locator('[data-content-template-contract="video"]');
    const mobileVideoMedia = mobileVideo.locator('.hc-video__media');
    const mobileVideoCopy = mobileVideo.locator('[data-content-role="copy"]');
    await expect(mobileVideoMedia).toHaveCSS("aspect-ratio", "4 / 5");
    await expect(mobileVideoCopy).toBeVisible();
    const [mobileVideoMediaBox, mobileVideoCopyBox] = await Promise.all([
      mobileVideoMedia.boundingBox(),
      mobileVideoCopy.boundingBox(),
    ]);
    expect(mobileVideoCopyBox?.top ?? 0, "手机端视频说明应堆叠在媒体下方")
      .toBeGreaterThanOrEqual((mobileVideoMediaBox?.bottom ?? 0) - 1);
  });

  test("商品变更后单品推荐与佩戴灵感重新核对公开资格", async ({ page }) => {
    await page.addInitScript(() => {
      const sources: Array<{ onmessage: ((event: { data: string }) => void) | null }> = [];
      class TestEventSource {
        onmessage: ((event: { data: string }) => void) | null = null;
        onerror: (() => void) | null = null;

        constructor(_url: string) {
          sources.push(this);
        }

        close() {}
      }

      (window as any).EventSource = TestEventSource;
      (window as any).__getProductStreamCount = () => sources.length;
      (window as any).__emitProductChange = () => {
        sources.forEach((source) => source.onmessage?.({ data: "{}" }));
      };
    });

    const blocks: FixtureBlock[] = [
      {
        type: "单品焦点推荐",
        props: {
          id: "live-featured-product",
          title: "实时主推作品",
          productCode: "SAFE-1",
          __contentTemplate: createContentTemplateMarker("单品焦点推荐"),
        },
      },
      {
        type: "佩戴灵感",
        props: {
          id: "live-lookbook-products",
          title: "实时佩戴灵感",
          image: image("lookbook"),
          altText: "实时佩戴灵感测试图",
          productCodes: ["SAFE-1", "SAFE-2"],
          __contentTemplate: createContentTemplateMarker("佩戴灵感"),
        },
      },
    ];
    let activeProducts = products.slice(0, 2);
    let productReads = 0;
    await page.unroute(/\/__content-template-renderers(?:\?.*)?$/);
    await page.route(/\/__content-template-renderers(?:\?.*)?$/, (route) => route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: rendererFixturePage(blocks),
    }));
    await page.unroute("**/api/products/public?*");
    await page.route("**/api/products/public?*", (route) => {
      productReads += 1;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          code: 200,
          data: { list: activeProducts, total: activeProducts.length },
        }),
      });
    });

    await page.goto("/__content-template-renderers");
    const featured = page.locator('[data-content-template-contract="featuredProduct"]');
    const lookbook = page.locator('[data-content-template-contract="wearingInspiration"]');
    await expect(featured).toContainText("测试作品 1");
    await expect(lookbook).toContainText("测试作品 1");
    await expect(lookbook).toContainText("测试作品 2");
    await expect.poll(() => page.evaluate(() => (window as any).__getProductStreamCount())).toBe(1);
    const readsBeforeChange = productReads;

    activeProducts = [];
    await page.evaluate(() => {
      (window as any).__emitProductChange();
    });

    await expect(page.getByText("所选主推商品已下架或暂不可展示")).toBeVisible();
    await expect(featured).not.toContainText("测试作品 1");
    await expect(lookbook).not.toContainText("测试作品 1");
    await expect(lookbook).not.toContainText("测试作品 2");
    expect(productReads).toBeGreaterThan(readsBeforeChange);
  });

  test("未配置门店资料时不把网站名称伪装成门店名称", async ({ page }) => {
    await page.unroute("**/api/settings/public**");
    await page.route("**/api/settings/public**", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        code: 200,
        data: { siteName: "仅用于网站的品牌名称" },
      }),
    }));
    await page.goto("/__content-template-renderers");

    const storeInfo = page.locator('[data-content-template-contract="storeInfo"]');
    await expect(storeInfo.locator('[data-content-role="store"]')).toBeVisible();
    await expect(storeInfo.locator('[data-content-role="copy"]')).toHaveCount(0);
    await expect(storeInfo).not.toContainText("仅用于网站的品牌名称");

    const booking = page.locator('[data-content-template-contract="booking"]');
    await expect(booking.locator('[data-content-role="secondaryContact"]')).toHaveCount(0);
    await expect(booking).not.toContainText("400-000-0000");
  });

  test("重复预览区域不会把真实集合容器压缩到第一张卡片", async ({ page }) => {
    const collectionNodes = [
      ["productRow", "productCards"],
      ["gallery", "works"],
      ["categoryCards", "categories"],
      ["sceneShopping", "scenes"],
      ["certificates", "certificates"],
    ] as const;

    for (const viewport of [
      { width: 1920, height: 1200, minimumWidthRatio: 0.55 },
      { width: 390, height: 844, minimumWidthRatio: 0.75 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/__content-template-renderers");
      for (const [templateKey, nodeId] of collectionNodes) {
        const renderer = page.locator(`[data-content-template-contract="${templateKey}"]`).first();
        const collection = renderer.locator(`[data-content-role="${nodeId}"]`).first();
        await expect(collection, `${templateKey}.${nodeId} 应完成异步内容挂载`).toBeVisible();
        await expect(collection, `${templateKey}.${nodeId} 应保持真实内容流`).not.toHaveCSS("position", "absolute");
        const [rendererBox, collectionBox] = await Promise.all([
          renderer.boundingBox(),
          collection.boundingBox(),
        ]);
        expect(rendererBox && collectionBox, `${templateKey}.${nodeId} 应具有可测量的真实布局`).toBeTruthy();
        expect(
          collectionBox!.width / Math.max(1, rendererBox!.width),
          `${templateKey}.${nodeId} 不得收缩成单个预览卡片宽度`,
        ).toBeGreaterThanOrEqual(viewport.minimumWidthRatio);
      }

      const productRenderer = page.locator('[data-content-template-contract="productRow"]').first();
      const [headingBox, gridBox] = await Promise.all([
        productRenderer.locator('[data-content-role="copy"]').first().boundingBox(),
        productRenderer.locator('[data-content-role="productCards"]').first().boundingBox(),
      ]);
      expect(headingBox && gridBox).toBeTruthy();
      expect(gridBox!.y, "商品列表不得覆盖标题区").toBeGreaterThanOrEqual(
        headingBox!.y + headingBox!.height - 1,
      );
    }
  });

  test(`${templateCount} 模板声明的可视编辑槽位具有真实 DOM 落点`, async ({ page }) => {
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
    const overriddenBlocks = createBlocks();
    const hero = overriddenBlocks.find((block) => block.type === "首屏主视觉")!;
    const productRow = overriddenBlocks.find((block) => block.type === "产品展示行")!;
    const doublePoster = overriddenBlocks.find((block) => block.type === "双图海报")!;
    const booking = overriddenBlocks.find((block) => block.type === "预约入口")!;
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

    // 覆盖测试使用独立文档，避免污染后续默认模板截图证据。
    await page.route(/\/__content-template-renderers(?:\?.*)?$/, (route) => route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: rendererFixturePage(overriddenBlocks),
    }));

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
    await expect(bookingRenderer).toHaveCSS("aspect-ratio", "1.77778 / 1");
    await expect(bookingRenderer.locator('[data-content-role="bgImage"] img')).toHaveCSS("object-fit", "contain");
    await expect(bookingRenderer.locator('[data-editor-field~="title"]')).toHaveCSS("background-color", "rgb(24, 26, 27)");
    await expect(bookingRenderer.locator('[data-content-role="primaryAction"]')).toHaveCount(1);

    await page.evaluate(() => { document.body.style.zoom = "2"; });
    await expect.poll(() => page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    )).toBe(true);
    await expect(page.locator('[data-content-template-contract="booking"] [data-content-role="primaryAction"]')).toBeVisible();
  });

  test("公开 Renderer 在全部合同对象的桌面和移动端消费位置与层级覆盖", async ({ page }) => {
    const overriddenBlocks = createBlocks();
    for (const block of overriddenBlocks) {
      const matrix = CONTENT_TEMPLATE_EDITOR_ACCEPTANCE_MATRIX.find(
        (entry) => entry.moduleType === block.type,
      );
      expect(matrix, `${block.type} 缺少机器验收矩阵`).toBeTruthy();
      block.props.__instanceOverrides = {
        version: 2,
        nodes: Object.fromEntries(matrix!.objects.map((object, objectIndex) => [
          object.roleId,
          {
            rectByViewport: Object.fromEntries(
              (["desktop", "mobile"] as const)
                .filter((viewport) => object.viewports[viewport].applicable)
                .map((viewport) => [viewport, object.viewports[viewport].defaultRect]),
            ),
            zIndexByViewport: Object.fromEntries(
              (["desktop", "mobile"] as const)
                .filter((viewport) => object.viewports[viewport].applicable)
                .map((viewport) => [viewport, Math.min(20, objectIndex + 1)]),
            ),
          },
        ])),
      };
    }
    await page.route(/\/__content-template-renderers(?:\?.*)?$/, (route) => route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: rendererFixturePage(overriddenBlocks),
    }));

    for (const viewport of [
      { name: "desktop" as const, width: 1024, height: 900 },
      { name: "mobile" as const, width: 390, height: 844 },
    ]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/__content-template-renderers");
      for (const matrix of CONTENT_TEMPLATE_EDITOR_ACCEPTANCE_MATRIX) {
        const renderer = page.locator(`[data-content-template-contract="${matrix.templateKey}"]`).first();
        await expect(renderer, `${matrix.templateKey} 公开 Renderer 未挂载`).toBeAttached();
        for (const object of matrix.objects) {
          if (!object.viewports[viewport.name].applicable) continue;
          const selectors = [...new Set([object.roleId, ...object.nodeIds])]
            .flatMap((nodeId) => [
              `[data-content-role="${nodeId}"]`,
              `[data-content-role-${viewport.name}="${nodeId}"]`,
              `[data-editor-field~="${nodeId}"]`,
            ])
            .join(", ");
          const node = renderer.locator(selectors).first();
          await expect(node, `${matrix.templateKey}.${object.roleId}.${viewport.name} 缺少真实 DOM 落点`).toBeAttached();
          await expect(node, `${matrix.templateKey}.${object.roleId}.${viewport.name} 未消费位置覆盖`).toHaveCSS("position", "absolute");
          await expect(node, `${matrix.templateKey}.${object.roleId}.${viewport.name} 未消费层级覆盖`).toHaveCSS(
            "z-index",
            String(Math.min(20, matrix.objects.indexOf(object) + 1)),
          );
        }
      }
    }
  });

  test("分类与 HTTPS 外链行动目标在公开 Renderer 使用唯一去向", async ({ page }) => {
    const blocks = createBlocks().filter((block) =>
      ["文字横幅", "限时活动"].includes(block.type),
    );
    const categoryAction = blocks.find((block) => block.type === "文字横幅")!;
    categoryAction.props.targetType = "category";
    categoryAction.props.categorySlug = "daily-rings";
    categoryAction.props.linkUrl = "";
    const externalAction = blocks.find((block) => block.type === "限时活动")!;
    externalAction.props.targetType = "external";
    externalAction.props.linkUrl = "https://partner.example.com/jewelry-story";
    externalAction.props.categorySlug = "";

    await page.route(/\/__content-template-renderers(?:\?.*)?$/, (route) => route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: rendererFixturePage(blocks),
    }));
    await page.goto("/__content-template-renderers");
    await expect(page.locator('[data-content-template-contract="textBanner"] a')).toHaveAttribute(
      "href",
      "/catalog?category=daily-rings",
    );
    await expect(page.locator('[data-content-template-contract="limitedEvent"] a')).toHaveAttribute(
      "href",
      "https://partner.example.com/jewelry-story",
    );
  });

  test("全部模板保留 1920、1200、960、768 与 390 五档截图证据", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-08-29T12:00:00.000Z"));
    const screenshotBlocks = createBlocks();
    const carousel = screenshotBlocks.find((block) => block.type === "轮播图");
    if (carousel) carousel.props.autoPlay = false;
    await page.unroute(/\/__content-template-renderers(?:\?.*)?$/);
    await page.route(/\/__content-template-renderers(?:\?.*)?$/, (route) => route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: rendererFixturePage(screenshotBlocks),
    }));
    await mkdir(screenshotDir, { recursive: true });
    const keys = CONTENT_TEMPLATE_REGISTRY.map((entry) => entry.key);
    for (const viewport of [
      { width: 1920, height: 1200 },
      { width: 1200, height: 900 },
      { width: 960, height: 900 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/__content-template-renderers");
      for (const key of keys) {
        const renderer = page.locator(`[data-content-template-contract="${key}"]`).first();
        await expect(renderer, `${key}.${viewport.width} 截图目标未稳定挂载`).toBeVisible();
        await renderer.screenshot({
          path: path.join(screenshotDir, `${key}-${viewport.width}.png`),
          animations: "disabled",
        });
      }
    }
  });
});
