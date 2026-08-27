import { expect, test } from "@playwright/test";
import { filterProducts } from "@/services/mockProductQuery";

const appMode = process.env.PLAYWRIGHT_APP_MODE === "mock" ? "mock" : "development";

const products = [
  {
    id: 3,
    code: "HC-MOCK-003",
    name: "足金素面作品",
    categoryId: 10,
    category: { name: "吊坠" },
    materialType: "GOLD_999",
    craftTechnique: ["抛光"],
    size: "小",
    goldWeight: 3.2,
    weight: 3.5,
    price: 3200,
    status: "PUBLISHED",
    isHot: true,
    isNew: false,
    isRecommended: true,
  },
  {
    id: 1,
    code: "HC-MOCK-001",
    name: "铂金镶嵌作品",
    categoryId: 20,
    category: { name: "戒指" },
    materialType: "PT950",
    craftTechnique: ["镶嵌", "抛光"],
    size: "中",
    goldWeight: 0,
    weight: 6.8,
    price: 8600,
    status: "PUBLISHED",
    isHot: false,
    isNew: true,
    isRecommended: false,
  },
  {
    id: 2,
    code: "HC-MOCK-002",
    name: "珍珠耳饰作品",
    categoryId: 30,
    category: { name: "耳饰" },
    materialType: "PEARL",
    craftTechnique: "镶嵌、拉丝",
    size: "大",
    goldWeight: 0,
    weight: 11.2,
    price: 5200,
    status: "DRAFT",
    isHot: false,
    isNew: false,
    isRecommended: true,
  },
];

test.describe("商品 Mock 查询模型", () => {
  test("支持精确货号、关键词和材质中文名", () => {
    expect(filterProducts(products, { exactCode: "HC-MOCK-002" }))
      .toEqual([products[2]]);
    expect(filterProducts(products, { keyword: "戒指" }))
      .toEqual([products[1]]);
    expect(filterProducts(products, { keyword: "足金999" }))
      .toEqual([products[0]]);
  });

  test("组合处理分类、材质、工艺、尺寸、重量和状态", () => {
    expect(
      filterProducts(products, {
        categoryIds: "10,20",
        materialTypes: "PT950,GOLD_999",
        craftTechniques: "镶嵌",
        sizes: "中,大",
        weightRanges: "5:10",
        status: "PUBLISHED",
      }),
    ).toEqual([products[1]]);
  });

  test("排序返回新数组且不改变输入顺序", () => {
    const originalIds = products.map((product) => product.id);
    expect(
      filterProducts(products, { sortBy: "price", sortOrder: "desc" })
        .map((product) => product.id),
    ).toEqual([1, 2, 3]);
    expect(products.map((product) => product.id)).toEqual(originalIds);
  });

  test("公开价格排序不消费非直购商品的内部价格", () => {
    const pricedProducts = products.map((product, index) => ({
      ...product,
      salesMode: index === 1 ? "DISPLAY_ONLY" : "DIRECT_PURCHASE",
    }));

    expect(
      filterProducts(pricedProducts, {
        sortBy: "price_asc",
        publicPriceOnly: true,
      }).map((product) => product.id),
    ).toEqual([3, 2]);
  });

  test("显式 Mock 模式下商品目录继续消费精确货号查询", async ({ page }) => {
    test.skip(appMode !== "mock", "该回归仅验证显式 Vite mock 模式");

    await page.goto("/catalog?query=JH-ES-001");

    await expect(
      page.getByRole("heading", { name: "星辰之泪 · 铂金钻石耳坠", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "星云系列 · 足金平安扣吊坠", exact: true }),
    ).toHaveCount(0);
  });

  test("显式 Mock 模式丢弃本地缓存中的畸形商品记录", async ({ page }) => {
    test.skip(appMode !== "mock", "该回归仅验证显式 Vite mock 模式");
    await page.addInitScript(() => {
      localStorage.setItem(
        "haichuan.mock-products",
        JSON.stringify([
          {
            id: 901,
            code: "HC-CACHE-VALID",
            name: "本地缓存有效作品",
            categoryId: 10,
            category: { id: 10, name: "吊坠" },
            materialType: "GOLD_999",
            status: "PUBLISHED",
            visibility: "PUBLIC",
            salesMode: "DISPLAY_ONLY",
            images: [],
            skus: [],
            certificates: null,
            tags: [],
          },
          { id: "invalid", code: "HC-CACHE-BROKEN" },
          null,
        ]),
      );
    });

    await page.goto("/catalog?query=HC-CACHE-VALID");

    await expect(
      page.getByRole("heading", { name: "本地缓存有效作品", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("HC-CACHE-BROKEN")).toHaveCount(0);
  });
});
