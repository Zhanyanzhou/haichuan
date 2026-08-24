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
  await page.route("**/api/page-modules/document/stream", (route) => route.abort());
  await page.route("**/api/page-modules/document/published?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(wrapped(null)),
    }),
  );
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
    if (ids?.includes(9_998)) {
      return route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
    }
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

async function seedSelection(page: Page, ids: number[]) {
  await page.addInitScript((selectedIds) => {
    localStorage.setItem(
      "hc_selection_tray",
      JSON.stringify({ state: { selectedIds }, version: 0 }),
    );
  }, ids);
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

  const quickViewTrigger = page.getByRole("button", { name: "快速预览 作品 01" });
  await quickViewTrigger.press("Enter");
  const quickView = page.getByRole("dialog");
  await expect(quickView).toBeVisible();
  await expect(quickView).toHaveAccessibleName("作品 01");
  await expect(quickView.getByRole("button", { name: "关闭快速预览" })).toBeFocused();
  await expect(quickView.getByRole("heading", { name: "作品 01" })).toBeVisible();
  await expect(quickView.getByText("HC-TEST-001", { exact: true })).toBeVisible();
  await quickView.getByRole("button", { name: "+ 加入选款" }).click();
  await page.keyboard.press("Escape");
  await expect(quickViewTrigger).toBeFocused();
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

test("Catalog 搜索的空态、错误态与 390px 溢出状态完整", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/catalog");
  const input = page.getByRole("search").getByRole("combobox", { name: "关键词或货号" });
  await input.fill("无结果");
  await input.press("Enter");
  await expect(page.getByText("没有符合当前筛选的作品")).toBeVisible();

  await input.fill("触发错误");
  await input.press("Enter");
  await expect(page.getByText("作品目录暂时无法加载")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
});

test("Catalog 筛选无结果时保留仍有效的持久化选款", async ({ page }) => {
  await seedSelection(page, [1]);
  await page.goto("/catalog?query=%E6%97%A0%E7%BB%93%E6%9E%9C");

  await expect(page.getByText("没有符合当前筛选的作品")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "查看已选 1 款并提交选款咨询" }),
  ).toBeVisible();

  const persistedIds = await page.evaluate(() => {
    const raw = localStorage.getItem("hc_selection_tray");
    return raw ? JSON.parse(raw).state.selectedIds : [];
  });
  expect(persistedIds).toEqual([1]);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
});

test("Catalog 权威查询确认作品失效后清理旧选款且空目录不显示虚假数量", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedSelection(page, [9_999]);
  await page.route("**/api/products/public**", (route) => {
    const url = new URL(route.request().url());
    const pageNumber = Number(url.searchParams.get("page") || 1);
    const pageSize = Number(url.searchParams.get("pageSize") || 20);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        wrapped({
          list: [],
          total: 0,
          page: pageNumber,
          pageSize,
          facets: { sizes: [] },
        }),
      ),
    });
  });
  await page.goto("/catalog");

  await expect(page.getByText("珠宝作品正在筹备中")).toBeVisible();
  await expect(page.getByText("已移除 1 款当前不可用的作品")).toBeVisible();
  await expect(page.getByText("已选 1 款")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem("hc_selection_tray");
        return raw ? JSON.parse(raw).state.selectedIds : [];
      }),
    )
    .toEqual([]);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
});

test("Catalog 校验持久化选款时区分 loading 与 error 且不误删", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let releaseSelectionLookup: (() => void) | undefined;
  const selectionLookupBlocked = new Promise<void>((resolve) => {
    releaseSelectionLookup = resolve;
  });
  await page.route("**/api/products/public**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("ids") === "1") {
      await selectionLookupBlocked;
    }
    await route.fallback();
  });
  await seedSelection(page, [1]);
  await page.goto("/catalog?query=%E6%97%A0%E7%BB%93%E6%9E%9C");

  await expect(page.getByText("正在确认已选作品")).toBeVisible();
  await expect(page.getByText("已选 1 款")).toHaveCount(0);
  releaseSelectionLookup?.();
  await expect(
    page.getByRole("button", { name: "查看已选 1 款并提交选款咨询" }),
  ).toBeVisible();

  await seedSelection(page, [9_998]);
  await page.reload();
  await expect(page.getByText("选款状态暂时无法确认")).toBeVisible();
  await expect(page.getByRole("button", { name: "重新确认选款" })).toBeVisible();
  await expect(page.getByText("已选 1 款")).toHaveCount(0);
  const persistedIds = await page.evaluate(() => {
    const raw = localStorage.getItem("hc_selection_tray");
    return raw ? JSON.parse(raw).state.selectedIds : [];
  });
  expect(persistedIds).toEqual([9_998]);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
});

test("Catalog 在 390px 保持 4:5 媒体、可用对话框宽度并恢复触发焦点", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/catalog");

  const search = page.getByRole("combobox", { name: "关键词或货号" });
  await search.fill("作品");
  await expect(search).toHaveAttribute("aria-expanded", "true");
  await expect(search).toHaveAttribute("aria-controls");
  const listboxId = await search.getAttribute("aria-controls");
  expect(listboxId).toBeTruthy();
  await expect(page.getByRole("listbox")).toHaveAttribute("id", listboxId!);
  await search.fill("");
  await search.blur();

  const productMedia = page.locator("[data-catalog-product-media]").first();
  const productMediaBox = await productMedia.boundingBox();
  expect(productMediaBox).not.toBeNull();
  expect(productMediaBox!.width / productMediaBox!.height).toBeCloseTo(0.8, 1);

  const quickTrigger = page.getByRole("button", { name: "快速预览 作品 01" });
  await quickTrigger.click();
  const quickDialog = page.getByRole("dialog", { name: "作品 01" });
  await expect(quickDialog).toBeVisible();
  const quickDialogBox = await quickDialog.boundingBox();
  const quickMediaBox = await quickDialog.locator("[data-catalog-quick-media]").boundingBox();
  expect(quickDialogBox).not.toBeNull();
  expect(quickDialogBox!.width).toBeGreaterThanOrEqual(350);
  expect(quickDialogBox!.x + quickDialogBox!.width).toBeLessThanOrEqual(390);
  expect(quickMediaBox).not.toBeNull();
  expect(quickMediaBox!.width / quickMediaBox!.height).toBeCloseTo(0.8, 1);
  await page.keyboard.press("Escape");
  await expect(quickTrigger).toBeFocused();

  const filterTrigger = page.getByRole("button", { name: "更多筛选" });
  await filterTrigger.click();
  const filterDialog = page.getByRole("dialog", { name: "更多筛选" });
  await expect(filterDialog).toBeVisible();
  await expect(filterDialog.getByRole("button", { name: "关闭筛选" })).toBeFocused();
  const filterDialogBox = await filterDialog.boundingBox();
  expect(filterDialogBox).not.toBeNull();
  expect(filterDialogBox!.width).toBeGreaterThanOrEqual(350);
  expect(filterDialogBox!.x + filterDialogBox!.width).toBeLessThanOrEqual(390);
  await page.keyboard.press("Escape");
  await expect(filterTrigger).toBeFocused();

  for (const control of [quickTrigger, filterTrigger]) {
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
});
