import { expect, test, type Page } from "@playwright/test";

const products = Array.from({ length: 40 }, (_, index) => {
  const id = index + 1;
  return {
    id,
    code: `HC-TEST-${String(id).padStart(3, "0")}`,
    name: `作品 ${String(id).padStart(2, "0")}`,
    categoryId: 2,
    category: { id: 2, name: "戒指" },
    shortDescription: "",
    materialType: id % 2 === 0 ? "AU750" : "GOLD_999",
    goldWeight: id % 10,
    weight: id % 10,
    size: id % 2 === 0 ? "标准" : "大号",
    craftTechnique: id % 2 === 0 ? ["古法金", "抛光"] : "錾刻",
    salesMode: "SELECTION",
    price: null,
    images: [],
    attributes: [],
  };
});

const categories = [
  {
    id: 1,
    name: "戒指",
    slug: "rings",
    level: 1,
    parentId: null,
    children: [
      {
        id: 2,
        name: "日常戒指",
        slug: "daily-rings",
        level: 2,
        parentId: 1,
        children: [],
      },
    ],
  },
];

function wrapped(data: unknown) {
  return { code: 200, data, message: "success", timestamp: new Date(0).toISOString() };
}

async function mockCatalogApi(page: Page) {
  await page.addInitScript(() => {
    localStorage.removeItem("customerToken");
    localStorage.removeItem("customer");
    localStorage.removeItem("hc_selection_tray");
  });
  await page.route("**/api/products/catalog/stream", (route) => route.abort());
  await page.route("**/api/categories/tree", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(wrapped(categories)) }),
  );
  await page.route("**/api/attributes", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        wrapped([
          { key: "material", name: "材质", values: [{ id: 1, value: "足金999", sortOrder: 1 }] },
          { key: "craft", name: "工艺", values: [{ id: 2, value: "古法金", sortOrder: 1 }] },
        ]),
      ),
    }),
  );
  await page.route("**/api/products/public**", (route) => {
    const url = new URL(route.request().url());
    const keyword = url.searchParams.get("keyword")?.trim() || "";
    if (keyword === "触发错误") {
      return route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
    }
    let filtered = [...products];
    const ids = url.searchParams.get("ids")?.split(",").map(Number).filter(Boolean);
    if (ids?.length) filtered = filtered.filter((product) => ids.includes(product.id));
    if (keyword === "无结果") filtered = [];
    else if (keyword) {
      filtered = filtered.filter(
        (product) => product.name.includes(keyword) || product.code.includes(keyword),
      );
    }
    const materialTypes = url.searchParams.get("materialTypes")?.split(",").filter(Boolean);
    const materialType = url.searchParams.get("materialType");
    if (materialTypes?.length) {
      filtered = filtered.filter((product) => materialTypes.includes(product.materialType));
    } else if (materialType) {
      filtered = filtered.filter((product) => product.materialType === materialType);
    }
    const pageNumber = Number(url.searchParams.get("page") || 1);
    const pageSize = Number(url.searchParams.get("pageSize") || 20);
    const start = (pageNumber - 1) * pageSize;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        wrapped({
          list: filtered.slice(start, start + pageSize),
          total: filtered.length,
          page: pageNumber,
          pageSize,
          facets: { sizes: ["标准", "大号"] },
        }),
      ),
    });
  });
}

test.beforeEach(async ({ page }) => {
  await mockCatalogApi(page);
});

test("Catalog 使用服务端分页并保持 URL、快速预览与跨页选款盘", async ({ page }) => {
  const firstRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname.endsWith("/api/products/public") && url.searchParams.get("pageSize") === "32";
  });
  await page.goto("/catalog");
  expect(new URL((await firstRequest).url()).searchParams.get("page")).toBe("1");
  await expect(page.getByRole("heading", { name: "作品 01" })).toBeVisible();
  await expect(page.getByRole("button", { name: "2", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "快速预览 作品 01" }).press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: "关闭快速预览" })).toBeFocused();
  await expect(page.getByRole("heading", { name: "作品 01" }).last()).toBeVisible();
  await page.getByRole("button", { name: "+ 加入选款" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByText("已选 1 款")).toBeVisible();

  const secondRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname.endsWith("/api/products/public") && url.searchParams.get("page") === "2";
  });
  await page.getByRole("button", { name: "2", exact: true }).click();
  await secondRequest;
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByRole("heading", { name: "作品 33" })).toBeVisible();
  await expect(page.getByText("已选 1 款")).toBeVisible();
  await page.getByRole("button", { name: "查看已选 1 款并提交选款咨询" }).press("Enter");
  await expect(page.getByRole("dialog", { name: "提交选款咨询" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "提交选款咨询" })).toHaveCount(0);
});

test("Catalog 将现有 URL 筛选翻译为服务端参数而不复用商品 ids", async ({ page }) => {
  const requestPromise = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname.endsWith("/api/products/public") && url.searchParams.has("craftTechniques");
  });
  await page.goto(
    "/catalog?category=1&material=%E8%B6%B3%E9%87%91999&craft=%E5%8F%A4%E6%B3%95%E9%87%91&weight=0%E2%80%945%E5%85%8B&size=%E6%A0%87%E5%87%86",
  );
  const url = new URL((await requestPromise).url());
  expect(url.searchParams.get("categoryIds")).toBe("1,2");
  expect(url.searchParams.get("ids")).toBeNull();
  expect(url.searchParams.get("materialTypes")).toBe("GOLD_999");
  expect(url.searchParams.get("craftTechniques")).toBe("古法金");
  expect(url.searchParams.get("weightRanges")).toBe("0:5");
  expect(url.searchParams.get("sizes")).toBe("标准");

  await page.getByRole("button", { name: /^材质/ }).click();
  const materialRequest = page.waitForRequest((request) => {
    const requestUrl = new URL(request.url());
    return (
      requestUrl.pathname.endsWith("/api/products/public") &&
      !requestUrl.searchParams.has("materialTypes") &&
      requestUrl.searchParams.get("craftTechniques") === "古法金"
    );
  });
  await page.getByRole("checkbox", { name: "足金999" }).click();
  await materialRequest;
  await expect(page).not.toHaveURL(/material=/);
});

test("Search 使用 24 条服务端分页并可加载更多", async ({ page }) => {
  await page.goto("/search");
  const input = page.getByPlaceholder("搜索作品名称、货号、品类或系列");
  const firstSearch = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.searchParams.get("keyword") === "作品" && url.searchParams.get("page") === "1";
  });
  await input.fill("作品");
  const firstUrl = new URL((await firstSearch).url());
  expect(firstUrl.searchParams.get("pageSize")).toBe("24");
  await expect(page.getByText("共找到 40 件作品")).toBeVisible();
  await expect(page.getByRole("button", { name: "加载更多" })).toBeVisible();

  const secondSearch = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.searchParams.get("keyword") === "作品" && url.searchParams.get("page") === "2";
  });
  await page.getByRole("button", { name: "加载更多" }).click();
  await secondSearch;
  await expect(page.getByRole("link", { name: /作品 40/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "加载更多" })).toHaveCount(0);
});

test("Search 的空态、错误态与 390px 溢出状态完整", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/search");
  const input = page.getByPlaceholder("搜索作品名称、货号、品类或系列");
  await input.fill("无结果");
  await expect(page.getByText("暂未找到符合条件的珠宝作品")).toBeVisible();

  await input.fill("触发错误");
  await expect(page.getByText("搜索结果暂时无法加载")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
});
