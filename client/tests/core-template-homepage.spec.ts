import { expect, test, type Page } from "@playwright/test";

const image = (name: string) => `/svg/template-${name}.svg`;
const useMock = process.env.VITE_USE_MOCK === "true";

const publishedProducts = [1, 2, 3, 4].map((id) => ({
  id,
  code: `TEST-${id}`,
  name: `测试作品 ${id}`,
  price: id * 10000,
  status: "PUBLISHED",
  isHot: false,
  isNew: false,
  isRecommended: false,
  isLimited: false,
  isCustom: false,
  viewCount: 0,
  salesCount: 0,
  images: [
    {
      id,
      productId: id,
      url: image("featured-product"),
      type: "FRONT",
      sortOrder: 0,
      isVideo: false,
    },
  ],
}));

const puckData = {
  content: [
    {
      type: "首屏主视觉",
      props: {
        id: "core-hero",
        desktopImage: image("hero"),
        mobileImage: image("hero"),
        title: "海川典藏",
        subtitle: "HAICHUAN JEWELRY / 2026",
        actionText: "探索本季作品",
        targetType: "page",
        linkUrl: "/products",
        productId: 0,
        altText: "海川典藏系列主视觉",
        alignment: "left",
        desktopFocusX: 50,
        desktopFocusY: 50,
        mobileFocusX: 50,
        mobileFocusY: 50,
      },
    },
    {
      type: "全屏出血图",
      props: {
        id: "core-poster",
        image: image("full-bleed"),
        mobileImage: image("full-bleed"),
        title: "鎏光之境",
        subtitle: "一张海报，只讲清一个系列与一次行动",
        buttonText: "查看系列",
        targetType: "page",
        linkUrl: "/products",
        productId: 0,
        template: "textBottomLeft",
        overlayPreset: "soft",
        altText: "鎏光之境系列海报",
        desktopFocusX: 50,
        desktopFocusY: 50,
        mobileFocusX: 50,
        mobileFocusY: 50,
      },
    },
    {
      type: "产品展示行",
      props: {
        id: "core-products",
        title: "当季作品",
        subtitle: "以统一比例、价格层级与购买路径呈现精选作品",
        productIds: [1, 2, 3, 4],
        layout: "grid-4",
        mobileColumns: 2,
        displayMode: "standard",
        actionStyle: "button",
        imageRatio: "3:4",
        showPrice: true,
        showButton: true,
        buttonText: "查看详情",
        titleSize: "medium",
        bgColor: "#FCFCFB",
      },
    },
    {
      type: "双图海报",
      props: {
        id: "core-double-poster",
        number: "02",
        label: "CRAFT & DETAIL",
        title: "金工细节",
        description: "主图建立情绪，竖图补充工艺与佩戴细节。",
        mainImage: image("double-poster"),
        detailImage: image("featured-product"),
        actionText: "了解定制工艺",
        targetType: "page",
        productId: 0,
        linkUrl: "/custom",
        layout: "mainLeft",
        mainAltText: "黄金作品主视觉",
        detailAltText: "黄金作品工艺细节",
        mainFocusX: 50,
        mainFocusY: 50,
        detailFocusX: 50,
        detailFocusY: 50,
      },
    },
    {
      type: "单品焦点推荐",
      props: {
        id: "core-featured-product",
        eyebrow: "FEATURED PIECE",
        title: "本季主推作品",
        summary: "把一件重点作品放大讲清，让品牌叙事自然进入商品详情与预约路径。",
        productId: 1,
        primaryText: "查看作品",
        secondaryText: "预约鉴赏",
        secondaryLink: "/contact",
        layout: "imageRight",
        bgColor: "#F5F2ED",
      },
    },
    {
      type: "图文混排",
      props: {
        id: "core-image-text",
        label: "ABOUT HAICHUAN",
        title: "东方金工，当代表达",
        body: "图文模块承担品牌、工艺与服务说明。图片建立氛围，文字只保留一条清晰叙事。",
        image: image("image-text"),
        imageAlt: "海川珠宝东方金工作品",
        buttonText: "关于海川",
        targetType: "page",
        productId: 0,
        linkUrl: "/about",
        template: "imageLeft",
        spacing: "comfortable",
        focusX: 50,
        focusY: 50,
      },
    },
    {
      type: "分类卡片",
      props: {
        id: "core-category-cards",
        title: "按需求探索",
        subtitle: "分类模块只负责分流，避免与作品陈列重复承担成交任务。",
        layout: "grid-3",
        bgColor: "#FBF9F6",
        categories: [
          { name: "日常佩戴", description: "轻盈、耐看、易搭配", image: image("category-cards"), link: "/products", altText: "日常佩戴珠宝", focusX: 50, focusY: 50 },
          { name: "重要赠礼", description: "为重要关系留下纪念", image: image("gift-guide"), link: "/products", altText: "重要赠礼珠宝", focusX: 50, focusY: 50 },
          { name: "专属定制", description: "从需求开始共同完成", image: image("custom-process"), link: "/custom", altText: "珠宝定制服务", focusX: 50, focusY: 50 },
        ],
      },
    },
    {
      type: "预约入口",
      props: {
        id: "core-appointment",
        backgroundImage: image("appointment"),
        title: "预约一对一鉴赏",
        subtitle: "由珠宝顾问根据场景、预算与风格，协助筛选适合的作品。",
        buttonText: "立即预约",
        linkUrl: "/contact",
        phone: "400-888-2026",
        altText: "海川珠宝预约鉴赏",
        focusX: 50,
        focusY: 50,
        tone: "dark",
        bgColor: "#1A1714",
      },
    },
  ],
  root: { props: {} },
};

const publishedStore = {
  drafts: {},
  published: {
    home: {
      id: 9001,
      pageKey: "home",
      puckData,
      metadata: { testFixture: "core-template-homepage" },
      editorVersion: "2",
      status: "PUBLISHED",
      version: 1,
      publishedAt: "2026-08-13T00:00:00.000Z",
      publishedBy: 1,
      createdAt: "2026-08-13T00:00:00.000Z",
      updatedAt: "2026-08-13T00:00:00.000Z",
    },
  },
  revisions: {},
};

async function seedCoreHomepage(page: Page) {
  await page.route("**/api/page-modules/document/published?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ code: 200, data: publishedStore.published.home, message: "success" }),
    }),
  );
  await page.route("**/api/products/public**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ code: 200, data: { list: publishedProducts }, message: "success" }),
    }),
  );
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))
    .toBe(true);
}

test.describe("八个核心装修模块首页闭环", () => {
  // VITE mock 在浏览器内直接返回空页面文档，会绕过本套件的网络拦截夹具。
  test.skip(useMock, "首页装修器闭环依赖网络 API 拦截，mock 模式下由静态渲染契约覆盖");

  test.beforeEach(async ({ page }) => {
    await seedCoreHomepage(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("桌面端按统一规则呈现并保留安全的站内路径", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "海川典藏", level: 1 })).toBeVisible();
    await expect(page.locator(".hc-single-poster")).toHaveCSS("aspect-ratio", "12 / 5");
    await expect(page.locator(".homepage-product-row__card")).toHaveCount(4);
    await expect(page.locator(".hc-double-poster")).toBeVisible();
    await expect(page.locator(".homepage-featured-product")).toHaveAttribute("data-layout", "imageRight");
    await expect(page.locator(".homepage-image-text")).toBeVisible();
    await expect(page.locator(".homepage-category-cards__grid > a")).toHaveCount(3);
    await expect(page.getByRole("heading", { name: "预约一对一鉴赏" })).toBeVisible();

    await expect(page.getByRole("link", { name: /探索本季作品/ })).toHaveAttribute("href", "/products");
    await expect(page.getByRole("link", { name: /关于海川/ })).toHaveAttribute("href", "/about");
    await expect(page.getByRole("link", { name: /立即预约/ })).toHaveAttribute("href", "/contact");
    await expectNoHorizontalOverflow(page);
  });

  test("移动端重排为可阅读顺序且没有横向裁切", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "海川典藏", level: 1 })).toBeVisible();
    await expect(page.locator(".hc-single-poster")).toHaveCSS("aspect-ratio", "5 / 6");
    await expect(page.locator(".homepage-product-row__grid")).toHaveCSS("grid-template-columns", /.+ .+/);
    await expect(page.locator(".homepage-featured-product__media")).toHaveCSS("order", "1");
    await expect(page.locator(".homepage-category-cards__grid")).toHaveCSS("grid-template-columns", /\d+(\.\d+)?px/);
    await expect(page.locator(".homepage-category-cards__grid > a")).toHaveCount(3);
    await expectNoHorizontalOverflow(page);
  });
});
