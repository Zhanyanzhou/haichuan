import { expect, test, type Page, type Route } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { mockCatalogDetail, publicProduct } from "./fixtures/public-catalog-detail";
import { installAdminSession } from "./fixtures/session-auth";
import { deriveFolderProductIdentity, inferFolderCategory } from "@/pages/admin/ProductManage/productFolderImportInference";

// 自有 API 夹具只证明界面接线和保存后回读，不计为真实数据库联调。
const fulfill = (route: Route, data: unknown) => route.fulfill({
  json: { code: 200, data, message: "ok" },
});

async function installEditorFixture(page: Page) {
  const record = {
    ...publicProduct(61, "CUSTOM_INQUIRY"),
    code: "CUSTOM-PRICE-061",
    name: "定制参考价验证作品",
    price: 6999,
    priceMin: 1000 as number | null,
    status: "OFFLINE",
    visibility: "PUBLIC",
    purchaseRegion: "MAINLAND",
    publishMode: "WAREHOUSE",
    fulfillmentType: "CUSTOM",
    dispatchTime: "CUSTOM",
    customLeadTime: "方案确认后另行约定",
    deliveryMethods: [],
    skus: [{
      id: 610,
      productId: 61,
      skuCode: "CUSTOM-PRICE-061-A",
      material: "AU750",
      price: 6999,
      isActive: true,
    }],
  };
  const updates: Record<string, unknown>[] = [];
  const skuWrites: string[] = [];
  let productReads = 0;
  await page.route("**/api/**", async (route) => {
    const { pathname } = new URL(route.request().url());
    const method = route.request().method();
    if (pathname === "/api/auth/profile") return route.fallback();
    if (pathname === "/api/categories/admin/tree") {
      return fulfill(route, [{ id: 1, name: "戒指", children: [] }]);
    }
    if (pathname === "/api/shipping-templates") return fulfill(route, []);
    if (pathname === "/api/settings/flags") {
      return fulfill(route, { commerceEnabled: false, cartEnabled: false, paymentEnabled: false });
    }
    if (pathname === "/api/products/61" && method === "GET") {
      productReads += 1;
      return fulfill(route, record);
    }
    if (pathname === "/api/products/61" && method === "PUT") {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      updates.push(payload);
      if (payload.priceMin === null || typeof payload.priceMin === "number") {
        record.priceMin = payload.priceMin;
      }
      return fulfill(route, { id: record.id });
    }
    if (/\/products\/61\/skus/.test(pathname) && method !== "GET") {
      skuWrites.push(`${method} ${pathname}`);
      return fulfill(route, {});
    }
    return fulfill(route, {});
  });
  await installAdminSession(page);
  return { record, updates, skuWrites, productReads: () => productReads };
}

async function installBatchFixture(page: Page, count: number, failOnceId?: number, ignoreStartingPriceOnce = false) {
  const records = Array.from({ length: count }, (_, index) => ({
    ...publicProduct(index + 1, "DIRECT_PURCHASE"),
    code: `BATCH-${String(index + 1).padStart(3, "0")}`,
    name: `批量定制作品 ${index + 1}`,
    status: "OFFLINE",
    priceMin: null as number | null,
    salesMode: "DIRECT_PURCHASE" as string,
  }));
  const updates: Array<{ id: number; payload: Record<string, unknown> }> = [];
  const scopePages: number[] = [];
  const skuWrites: string[] = [];
  let didFail = false;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/auth/profile") return route.fallback();
    if (url.pathname === "/api/products" && request.method() === "GET") {
      const pageNumber = Number(url.searchParams.get("page") || 1);
      const pageSize = Number(url.searchParams.get("pageSize") || 20);
      if (pageSize > 50) return route.fulfill({ status: 400, json: { code: 400, message: "pageSize must not be greater than 50" } });
      if (pageSize === 50) scopePages.push(pageNumber);
      return fulfill(route, { list: records.slice((pageNumber - 1) * pageSize, pageNumber * pageSize), total: records.length });
    }
    if (url.pathname === "/api/products/counts") {
      return fulfill(route, { all: records.length, PUBLISHED: 0, OFFLINE: records.length, DRAFT: 0, ARCHIVED: 0 });
    }
    if (url.pathname === "/api/categories/admin/tree") return fulfill(route, []);
    const update = url.pathname.match(/^\/api\/products\/(\d+)$/);
    if (update && request.method() === "PUT") {
      const id = Number(update[1]);
      const payload = request.postDataJSON() as Record<string, unknown>;
      updates.push({ id, payload });
      if (id === failOnceId && !didFail) {
        didFail = true;
        return route.fulfill({ status: 409, json: { code: 409, message: "商品状态已变化，请重新读取" } });
      }
      records[id - 1].salesMode = "CUSTOM_INQUIRY";
      if (ignoreStartingPriceOnce) {
        ignoreStartingPriceOnce = false;
        return fulfill(route, records[id - 1]);
      }
      records[id - 1].priceMin = Number(payload.priceMin);
      return fulfill(route, records[id - 1]);
    }
    if (/\/products\/\d+\/skus/.test(url.pathname) && request.method() !== "GET") skuWrites.push(url.pathname);
    return fulfill(route, {});
  });
  await installAdminSession(page);
  return { records, updates, scopePages, skuWrites };
}

async function installFolderImportFixture(page: Page) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    if (pathname === "/api/auth/profile") return route.fallback();
    if (pathname === "/api/products" && request.method() === "GET") {
      return fulfill(route, { list: [], total: 0 });
    }
    if (pathname === "/api/products/counts") {
      return fulfill(route, { all: 0, PUBLISHED: 0, OFFLINE: 0, DRAFT: 0, ARCHIVED: 0 });
    }
    if (pathname === "/api/categories/admin/tree") {
      return fulfill(route, [{ id: 7, name: "吊坠", isActive: true, children: [] }]);
    }
    if (pathname === "/api/products/admin/import-code-conflicts") return fulfill(route, []);
    return fulfill(route, {});
  });
  await installAdminSession(page, { id: 19 });
}

async function chooseFolderImage(page: Page) {
  const dialog = page.getByRole("dialog", { name: "按文件夹导入商品草稿" });
  const folder = test.info().outputPath("product-folder-import");
  await mkdir(folder, { recursive: true });
  const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aCTkAAAAASUVORK5CYII=", "base64");
  await writeFile(join(folder, "TEST104双侧卷筒结构吊坠正面.png"), pixel);
  await dialog.getByLabel("选择商品图片文件夹").setInputFiles(folder);
  await expect(dialog.getByRole("status", { name: "识别 1 款，已选 1 款，1 款可保存" })).toBeVisible();
  return dialog;
}

test.describe("预约定制起价的后台与公开展示（自有 API 夹具）", () => {
  test.skip(process.env.VITE_USE_MOCK === "true", "需要实际请求路径以拦截自有 API");

  test("后台修改参考起价后保存并回读，保留 SKU 成交价", async ({ page }) => {
    const fixture = await installEditorFixture(page);
    await page.goto("/admin/products/61/edit");
    const startingPrice = page.getByRole("spinbutton", { name: "定制参考起价" });
    await expect(page.getByRole("radio", { name: "预约定制", exact: true })).toBeChecked();
    await expect(startingPrice).toHaveValue("1000.00");
    await startingPrice.fill("1600");
    await page.getByRole("button", { name: "保存更改", exact: true }).click();
    await expect(page.getByText("商品已保存至仓库", { exact: true })).toBeVisible();
    expect(fixture.updates).toHaveLength(1);
    expect(fixture.updates[0]).toMatchObject({ salesMode: "CUSTOM_INQUIRY", priceMin: 1600 });
    expect(fixture.updates[0]).not.toHaveProperty("price");
    expect(fixture.updates[0]).not.toHaveProperty("skus");
    expect(fixture.skuWrites).toEqual([]);
    expect(fixture.record.skus[0].price).toBe(6999);
    expect(fixture.productReads()).toBeGreaterThanOrEqual(2);
    await expect(startingPrice).toHaveValue("1600.00");
    await page.reload();
    await expect(startingPrice).toHaveValue("1600.00");
  });

  test("后台允许清空参考起价并提交 null，不把空值恢复成默认价", async ({ page }) => {
    const fixture = await installEditorFixture(page);
    await page.goto("/admin/products/61/edit");
    const startingPrice = page.getByRole("spinbutton", { name: "定制参考起价" });
    await expect(startingPrice).toHaveValue("1000.00");
    await startingPrice.fill("");
    await page.getByRole("button", { name: "保存更改", exact: true }).click();
    await expect(page.getByText("商品已保存至仓库", { exact: true })).toBeVisible();
    expect(fixture.updates[0]).toMatchObject({ salesMode: "CUSTOM_INQUIRY", priceMin: null });
    await page.reload();
    await expect(startingPrice).toHaveValue("");
    expect(fixture.skuWrites).toEqual([]);
  });

  test("统一预约定制包含第二页商品，取消不写，确认只更新参考价与模式", async ({ page }) => {
    const fixture = await installBatchFixture(page, 101);
    await page.goto("/admin/products");
    await page.getByRole("button", { name: "统一设置预约定制", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "统一设置预约定制" });
    await expect(dialog.getByRole("button", { name: "确认修改 101 件商品", exact: true })).toBeEnabled();
    await expect(dialog.getByRole("spinbutton", { name: "定制参考起价（元）" })).toHaveValue("1000.00");
    await expect(dialog.getByRole("list", { name: "本次修改的商品" }).getByRole("listitem")).toHaveCount(101);
    expect(fixture.scopePages).toEqual([1, 2, 3]);
    await dialog.getByRole("button", { name: /^取\s*消$/ }).click();
    await expect(dialog).toHaveCount(0);
    expect(fixture.updates).toEqual([]);
    await page.getByRole("button", { name: "统一设置预约定制", exact: true }).click();
    await dialog.getByRole("button", { name: "确认修改 101 件商品", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(fixture.updates).toHaveLength(101);
    expect(fixture.updates.map(({ id }) => id)).toEqual(Array.from({ length: 101 }, (_, index) => index + 1));
    for (const { payload } of fixture.updates) {
      expect(payload).toEqual({ salesMode: "CUSTOM_INQUIRY", priceMin: 1000 });
    }
    expect(fixture.records.every((record) => record.price === 12800 && record.skus[0].price === 12800)).toBe(true);
    expect(fixture.skuWrites).toEqual([]);
    await page.reload();
    await expect(page.locator(".product-manage__price").first()).toContainText(/1,000/);
  });

  test("统一预约定制的部分失败保留失败范围，再试不重复成功项", async ({ page }) => {
    const fixture = await installBatchFixture(page, 3, 2);
    await page.goto("/admin/products");
    await page.getByRole("button", { name: "统一设置预约定制", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "统一设置预约定制" });
    await dialog.getByRole("button", { name: "确认修改 3 件商品", exact: true }).click();
    await expect(dialog.getByText(/已更新 2 件，1 件未确认完成/)).toBeVisible();
    await expect(dialog.getByRole("list", { name: "本次修改的商品" }).getByRole("listitem")).toHaveCount(1);
    await expect(dialog.getByRole("list", { name: "本次修改的商品" })).toContainText("BATCH-002");
    const retry = dialog.getByRole("button", { name: /确认修改 1 件商品$/ });
    await expect(retry).toBeEnabled();
    await retry.click();
    await expect(dialog).toHaveCount(0);
    expect(fixture.updates.map(({ id }) => id)).toEqual([1, 2, 3, 2]);
    expect(fixture.skuWrites).toEqual([]);
  });

  test("服务端忽略参考价时不得将 HTTP 成功冒充保存成功", async ({ page }) => {
    const fixture = await installBatchFixture(page, 2, undefined, true);
    await page.goto("/admin/products");
    await page.getByRole("button", { name: "统一设置预约定制", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "统一设置预约定制" });
    await dialog.getByRole("button", { name: "确认修改 2 件商品", exact: true }).click();
    await expect(dialog.getByText(/已更新 0 件，2 件未确认完成/)).toBeVisible();
    expect(fixture.updates.map(({ id }) => id)).toEqual([1]);
    await dialog.getByRole("button", { name: /确认修改 2 件商品$/ }).click();
    await expect(dialog).toHaveCount(0);
    expect(fixture.updates.map(({ id }) => id)).toEqual([1, 1, 2]);
    expect(fixture.records.every((record) => record.priceMin === 1000)).toBe(true);
  });

  test("文件夹导入默认预约定制、1000 元起和全部人可见", async ({ page }) => {
    await installFolderImportFixture(page);
    await page.goto("/admin/products");
    await page.getByRole("button", { name: "按文件夹导入商品草稿", exact: true }).click();
    const dialog = await chooseFolderImage(page);

    await expect(dialog.getByText("自动识别", { exact: true })).toBeVisible();
    await expect(dialog.getByText("来自“吊坠” · 1/1 款", { exact: true })).toBeVisible();
    await expect(dialog.getByText("预约定制", { exact: true })).toBeVisible();
    await expect(dialog.getByText("全部人可见", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("spinbutton", { name: "统一定制参考起价" })).toHaveValue("1000.00");
    const save = dialog.getByRole("button", { name: "保存草稿 · 1", exact: true });
    await expect(save).toBeEnabled();
    await page.screenshot({ path: test.info().outputPath("folder-import-auto-filled.png"), fullPage: true });
  });

  test("文件夹导入固定默认值不受旧浏览器设置影响", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      localStorage.setItem("haichuan-product-folder-import-settings:v1:19", JSON.stringify({
        categoryId: 7,
        salesMode: "CUSTOM_INQUIRY",
        priceMin: 1600,
        visibility: "MEMBER",
      }));
    });
    await installFolderImportFixture(page);
    await page.goto("/admin/products");
    await page.getByRole("button", { name: "按文件夹导入商品草稿", exact: true }).click();
    const dialog = await chooseFolderImage(page);

    await expect(dialog.getByText("预约定制", { exact: true })).toBeVisible();
    await expect(dialog.getByText("全部人可见", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("spinbutton", { name: "统一定制参考起价" })).toHaveValue("1000.00");
    await expect(dialog.getByRole("checkbox", { name: "记住设置" })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "保存草稿 · 1", exact: true })).toBeEnabled();
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: test.info().outputPath("folder-import-mobile.png"), fullPage: true });
  });

  test("描述性文件名自动生成干净标题和稳定款号，并识别类目", async () => {
    const description = "弧面方牌卷草钱纹镂空格纹双侧卷筒结构吊坠";
    const identity = deriveFolderProductIdentity(`ATP104（${description}）`, "ATP104", description);
    expect(identity).toMatchObject({
      code: "ATP104",
      title: `${description} ATP104`,
      key: "ATP104",
    });
    expect(inferFolderCategory([{
      ...identity,
      selected: true,
      images: [{ path: `ATP104（${description}）/ATP104${description}正面.png` }],
    }], [
      { value: 7, label: "吊坠" },
      { value: 8, label: "戒指" },
    ])).toMatchObject({ categoryId: 7, categoryLabel: "吊坠", keyword: "吊坠" });
  });

  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    test(`${viewport.width}px 列表和详情读取后台参考起价，预约携带稳定款号`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const work = { ...publicProduct(62, "CUSTOM_INQUIRY"), name: "定制参考价作品", priceMin: 1600 };
      const noPrice = { ...publicProduct(63, "CUSTOM_INQUIRY"), name: "未标价定制作品", priceMin: null };
      const writes = await mockCatalogDetail(page, { products: [work, noPrice] });
      await page.goto("/catalog");
      const card = page.locator('[data-catalog-product-id="62"]');
      await expect(card).toContainText(/¥\s*1,600\s*起/);
      await expect(card.getByRole("link", { name: "预约定制", exact: true })).toHaveCount(0);
      await expect(page.locator('[data-catalog-product-id="63"]')).not.toContainText(/¥\s*[\d,]+/);
      await page.screenshot({ path: test.info().outputPath("custom-pricing-catalog.png"), fullPage: true });
      await page.goto(`/products/${work.code}`);
      await expect(page.getByRole("heading", { name: work.name, exact: true })).toBeVisible();
      await expect(page.locator(".product-detail-page__commerce-facts")).toContainText(/¥\s*1,600\s*起/);
      await expect(page.getByText("定制参考起价", { exact: true })).toBeVisible();
      await expect(page.getByText(/最终金额在确认定制方案后报价/)).toBeVisible();
      await page.screenshot({ path: test.info().outputPath("custom-pricing-detail.png"), fullPage: true });
      await expect(page.getByRole("link", { name: "预约定制", exact: true })).toHaveAttribute(
        "href", `/custom?type=custom&productRef=${work.code}`,
      );
      await expect(page.getByRole("button", { name: "加入购物车", exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "立即购买", exact: true })).toHaveCount(0);
      expect(await page.locator('script[type="application/ld+json"]').allTextContents()).not.toEqual(
        expect.arrayContaining([expect.stringContaining('"offers"')]),
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      await page.goto(`/products/${noPrice.code}`);
      await expect(page.getByRole("heading", { name: noPrice.name, exact: true })).toBeVisible();
      await expect(page.getByText("定制参考起价", { exact: true })).toHaveCount(0);
      await expect(page.locator(".product-detail-page__commerce-facts .is-price")).toHaveCount(0);
      expect(writes.cart).toBe(0);
      expect(writes.unexpected).toBe(0);
    });
  }
});
