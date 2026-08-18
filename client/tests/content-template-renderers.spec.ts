import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  CONTENT_TEMPLATE_CONTRACTS,
  CONTENT_TEMPLATE_REGISTRY,
  createContentTemplateMarker,
} from "../src/page-builder/generated/contentTemplates.generated";

type FixtureBlock = { type: string; props: Record<string, unknown> };

const image = (name: string) => `/svg/template-${name}.svg`;
const screenshotDir = path.resolve("test-results/content-template-renderers");

const mediaByType: Record<string, Record<string, unknown>> = {
  首屏主视觉: { desktopImage: image("hero"), mobileImage: image("hero") },
  全屏出血图: { image: image("full-bleed"), mobileImage: image("full-bleed") },
  视频区块: { videoUrl: "/media/contract-test.mp4", posterUrl: image("video"), aspectRatio: "16:9" },
  轮播图: { images: [1, 2, 3].map((id) => ({ url: image("carousel"), mobileUrl: image("carousel"), alt: `轮播测试图 ${id}`, link: "" })) },
  单图海报: { desktopImage: image("single-poster"), mobileImage: image("single-poster") },
  双图海报: { mainImage: image("double-poster"), detailImage: image("featured-product") },
  定制流程: { steps: [1, 2, 3].map((id) => ({ number: `0${id}`, name: `步骤 ${id}`, desc: "安全测试说明", image: "" })) },
  改款对比: { beforeImage: image("before-after"), afterImage: image("before-after") },
  单品焦点推荐: { productId: 1 },
  产品展示行: { productIds: [1, 2, 3], layout: "grid-3", mobileColumns: 2 },
  作品画廊: { items: [1, 2, 3, 4].map((id) => ({ image: image("asymmetric-gallery"), altText: `画廊测试图 ${id}`, caption: `FIG. 0${id}`, link: "" })) },
  佩戴灵感: { image: image("lookbook"), productIds: [1, 2] },
  分类卡片: { categories: [1, 2, 3].map((id) => ({ name: `品类 ${id}`, image: image("category-cards"), link: "/products", description: "安全测试说明" })) },
  按场景选购: { categories: [1, 2, 3].map((id) => ({ name: `场景 ${id}`, image: image("occasion-guide"), link: "/products", description: "安全测试说明" })) },
  热区图: { image: image("hotspot"), mobileImage: image("hotspot"), hotspots: [{ x: 42, y: 42, width: 12, height: 12, link: "/products", label: "热点" }] },
  卡片网格: { cards: [1, 2, 3].map((id) => ({ icon: `0${id}`, title: `要点 ${id}`, body: "安全测试说明" })) },
  服务承诺: { cards: [1, 2, 3].map((id) => ({ icon: `0${id}`, title: `服务 ${id}`, body: "已确认前仅作测试" })) },
  资质证书: { certificates: [1, 2].map((id) => ({ imageUrl: image("certificate"), name: `证书 ${id}`, desc: "内部测试材料" })) },
  门店信息: { image: image("store-info"), storeName: "测试门店", address: "测试地址", hours: "10:00–18:00", phone: "400-000-0000" },
  真实评价与实拍: { testimonials: [{ name: "测试署名", meta: "已授权测试", content: "这是一条不涉及真实顾客的安全测试引语。", image: image("testimonial") }] },
  预约入口: { title: "预约鉴赏", subtitle: "安全测试说明", buttonText: "预约鉴赏", linkUrl: "/contact", phone: "400-000-0000", bgColor: "#171717", tone: "dark" },
  限时活动: { eventImage: image("limited-offer"), title: "活动测试标题", body: "安全测试说明", targetDate: "2099-12-31T23:59:59", buttonText: "查看说明", linkUrl: "/about" },
};

const blocks: FixtureBlock[] = CONTENT_TEMPLATE_REGISTRY.map((entry, index) => ({
  type: entry.moduleType,
  props: {
    title: "安全测试标题",
    subtitle: "不涉及品牌、商品或服务事实的确定性测试说明。",
    body: "不涉及品牌、商品或服务事实的确定性测试说明。",
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
}));

async function seed(page: Page) {
  await page.route("**/api/analytics/track", (route) => route.fulfill({ status: 204, body: "" }));
  await page.route("**/api/products/public/**", (route) => {
    const id = Number(route.request().url().split("/").pop());
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 200, data: products.find((item) => item.id === id) ?? products[0] }) });
  });
  await page.route("**/api/products/public?*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ code: 200, data: { list: products, total: products.length } }),
  }));
  await page.route("**/api/page-modules/document/published?*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      code: 200,
      data: {
        id: 9701,
        pageKey: "home",
        puckData: { content: blocks, root: { props: {} } },
        metadata: { testFixture: "content-template-renderers" },
        editorVersion: "2",
        status: "PUBLISHED",
        version: 1,
      },
    }),
  }));
}

test.describe("23 个内容模板真实 Renderer（确定性 UI）", () => {
  test.beforeEach(async ({ page }) => {
    await seed(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  for (const viewport of [
    { name: "desktop", width: 1920, height: 1200 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    test(`${viewport.name}：23 个真实 Renderer、合同顺序、非坍塌与无横向溢出`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/");
      const renderers = page.locator('[data-content-template-renderer="real"]');
      await expect(renderers).toHaveCount(23);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

      for (const entry of CONTENT_TEMPLATE_REGISTRY) {
        const contract = CONTENT_TEMPLATE_CONTRACTS[entry.key];
        const renderer = page.locator(`[data-content-template-contract="${entry.key}"]`).first();
        await expect(renderer).toBeVisible();
        await expect(renderer).toHaveAttribute(`data-contract-order-${viewport.name}`, contract.order[viewport.name].join(","));
        const box = await renderer.boundingBox();
        expect(box?.height ?? 0, `${entry.moduleType} 高度坍塌`).toBeGreaterThan(44);
      }
    });
  }

  test("重点合同：视频、商品列数、热点、顾客分享与预约", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1200 });
    await page.goto("/");
    await expect(page.locator('[data-content-template-contract="video"] .hc-video-frame')).toHaveCSS("aspect-ratio", "16 / 9");
    await expect(page.locator('[data-content-template-contract="productRow"] .homepage-product-row__grid')).toHaveCSS("grid-template-columns", /.+ .+ .+/);
    await expect(page.locator('[data-content-template-contract="hotspot"] [data-content-role="hotspots"]').first()).toBeVisible();

    const testimonialRoles = await page.locator('[data-content-template-contract="testimonials"] [data-content-role]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-content-role")));
    expect(testimonialRoles).toEqual(["authorizedPhoto", "mainQuote", "attribution"]);
    const booking = page.locator('[data-content-template-contract="booking"]');
    await expect(booking.locator("form")).toHaveCount(0);
    await expect(booking.locator('[data-content-role="primaryAction"]')).toHaveCount(1);
  });

  test("重点模板保留桌面与手机截图证据", async ({ page }) => {
    await mkdir(screenshotDir, { recursive: true });
    const keys = ["hero", "video", "doublePoster", "productRow", "hotspot", "testimonials", "booking"];
    for (const viewport of [{ width: 1920, height: 1200 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.goto("/");
      for (const key of keys) {
        const renderer = page.locator(`[data-content-template-contract="${key}"]`).first();
        await renderer.scrollIntoViewIfNeeded();
        await renderer.screenshot({ path: path.join(screenshotDir, `${key}-${viewport.width}.png`) });
      }
    }
  });
});
