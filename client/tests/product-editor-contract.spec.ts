import { expect, test, type Page, type Route } from "@playwright/test";

const useMock = process.env.VITE_USE_MOCK === "true";

function installAdminSession(page: Page) {
  return page.addInitScript(() => {
    localStorage.setItem("token", "isolated-admin-token");
    localStorage.setItem("jewelry-auth", JSON.stringify({
      state: {
        token: "isolated-admin-token",
        user: { id: 1, username: "isolated-admin", role: "SUPER_ADMIN", name: "Isolated Admin" },
        isLoggedIn: true,
      },
      version: 0,
    }));
  });
}

function fulfill(route: Route, data: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(status >= 400
      ? data
      : { code: 200, data, message: "ok" }),
  });
}

test.describe("商品编辑器现有接口契约", () => {
  test.skip(useMock, "该回归通过隔离拦截真实 API 路径验证状态与错误契约");

  test("加载失败可重试，重复保存只发送一次并将货号冲突落到字段", async ({ page }) => {
    await installAdminSession(page);
    let categoryAttempts = 0;
    let createAttempts = 0;
    let releaseInitialCategoryRequest!: () => void;
    const initialCategoryRequestGate = new Promise<void>((resolve) => {
      releaseInitialCategoryRequest = resolve;
    });

    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/categories/admin/tree") {
        categoryAttempts += 1;
        if (categoryAttempts === 1) {
          await initialCategoryRequestGate;
          await fulfill(route, { statusCode: 503, message: "temporary unavailable" }, 503);
          return;
        }
        await fulfill(route, [{ id: 1, name: "戒指", children: [] }]);
        return;
      }
      if (url.pathname === "/api/shipping-templates") {
        await fulfill(route, []);
        return;
      }
      if (url.pathname === "/api/settings/flags") {
        await fulfill(route, { commerceEnabled: false, cartEnabled: false, paymentEnabled: false });
        return;
      }
      if (url.pathname === "/api/products" && route.request().method() === "POST") {
        createAttempts += 1;
        await new Promise((resolve) => setTimeout(resolve, 250));
        await fulfill(route, { statusCode: 409, message: "该商品货号已存在，请更换货号" }, 409);
        return;
      }
      await fulfill(route, {});
    });

    await page.goto("/admin/products/new");
    await expect(page.getByText("正在加载商品信息…")).toBeVisible();
    releaseInitialCategoryRequest();
    await expect(page.getByText("商品编辑所需的类目或物流模板加载失败。请重新加载后重试。")).toBeVisible();
    await expect(page.getByRole("button", { name: "重新加载" })).toBeVisible();
    await expect(page.locator('form[name="product-editor-main"]')).toHaveCount(0);

    await page.getByRole("button", { name: "重新加载" }).click();
    await expect(page.getByRole("heading", { name: "图文描述" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "标准库存" })).toBeChecked();
    await expect(page.getByText(/当前销售方式发布时不要求交易价格、SKU 或正库存/)).toBeVisible();
    await page.getByRole("button", { name: "基础信息" }).click();
    await page.getByRole("textbox", { name: "货号" }).fill("DUPLICATE-001");
    await page.getByRole("combobox", { name: "当前类目" }).click();
    await page.getByText("戒指", { exact: true }).click();

    const saveDraft = page.getByRole("button", { name: "保存草稿" });
    await saveDraft.dblclick();
    await expect(page.getByText("商品保存未完成")).toBeVisible();
    await expect(page.locator(".ant-form-item-explain-error").filter({ hasText: "该商品货号已存在" })).toBeVisible();
    expect(createAttempts).toBe(1);
  });

  test("已保存商品使用 SKU 起价，并可设置主图和确认删除未引用图片", async ({ page }) => {
    const antdConsoleProblems: string[] = [];
    page.on("console", (entry) => {
      const text = entry.text();
      if (/Static function can not consume context|destroyOnClose.*deprecated/i.test(text)) {
        antdConsoleProblems.push(text);
      }
    });
    await installAdminSession(page);
    const product = {
      id: 9,
      code: "RING-009",
      name: "双规格戒指",
      categoryId: 1,
      materialType: "AU750",
      price: 6999,
      status: "OFFLINE",
      visibility: "MEMBER",
      salesMode: "DISPLAY_ONLY",
      inventoryPolicy: "STANDARD",
      purchaseRegion: "MAINLAND",
      publishMode: "WAREHOUSE",
      fulfillmentType: "IN_STOCK",
      dispatchTime: "WITHIN_48_HOURS",
      deliveryMethods: [],
      primaryImageId: 101,
      images: [
        { id: 101, productId: 9, url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E", type: "FRONT", sortOrder: 0, isVideo: false },
        { id: 102, productId: 9, url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E", type: "SIDE", sortOrder: 1, isVideo: false },
      ],
      skus: [
        { id: 201, productId: 9, skuCode: "RING-009-DEFAULT", material: "AU750", size: "14", price: 6999, isActive: true },
        { id: 202, productId: 9, skuCode: "RING-009-15", material: "AU750", size: "15", price: 7299, isActive: true },
      ],
      detailContent: [],
    };
    let primaryRequests = 0;
    let deleteRequests = 0;
    let skuStatusRequests = 0;

    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/categories/admin/tree") {
        await fulfill(route, [{ id: 1, name: "戒指", children: [] }]);
        return;
      }
      if (url.pathname === "/api/shipping-templates") {
        await fulfill(route, []);
        return;
      }
      if (url.pathname === "/api/settings/flags") {
        await fulfill(route, { commerceEnabled: false, cartEnabled: false, paymentEnabled: false });
        return;
      }
      if (url.pathname === "/api/products/9" && route.request().method() === "GET") {
        await fulfill(route, product);
        return;
      }
      if (url.pathname === "/api/products/9/images/primary" && route.request().method() === "PUT") {
        primaryRequests += 1;
        product.primaryImageId = 102;
        product.images = [product.images[1], product.images[0]];
        await fulfill(route, { primaryImageId: 102, listingImageId: 102 });
        return;
      }
      if (url.pathname === "/api/products/9/images/101" && route.request().method() === "DELETE") {
        deleteRequests += 1;
        product.images = product.images.filter((image) => image.id !== 101);
        await fulfill(route, { id: 101 });
        return;
      }
      if (url.pathname === "/api/products/9/skus/201" && route.request().method() === "PUT") {
        skuStatusRequests += 1;
        await new Promise((resolve) => setTimeout(resolve, 250));
        product.skus[0].isActive = false;
        product.price = 7299;
        await fulfill(route, product.skus[0]);
        return;
      }
      await fulfill(route, {});
    });

    await page.goto("/admin/products/9/edit");
    await expect(page.getByText("SKU 派生最低价", { exact: true })).toBeVisible();
    await expect(page.getByText("¥ 6999.00", { exact: true })).toBeVisible();
    await expect(page.getByText("系统按已启用且价格大于 0 的 SKU 自动派生")).toBeVisible();
    await expect(page.getByText(/2 个有效 SKU；SKU 价格是直购成交价/)).toBeVisible();

    await page.locator(".pro-editor__upload-actions").nth(1).getByRole("button", { name: "设为主图" }).click();
    await expect(page.getByText("商品主图已更新")).toBeVisible();
    expect(primaryRequests).toBe(1);

    await page.locator(".pro-editor__upload-actions").nth(1).getByRole("button", { name: "删除" }).click();
    const confirmDialog = page.getByRole("dialog", { name: "确认删除这张商品图片？" });
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "确认删除" }).click();
    await expect(page.getByText("商品图片已删除")).toBeVisible();
    expect(deleteRequests).toBe(1);

    const defaultSkuRow = page.getByRole("row").filter({ hasText: "RING-009-DEFAULT" });
    await defaultSkuRow.getByRole("button", { name: "停用" }).dblclick();
    await expect(page.getByText("SKU 已停用")).toBeVisible();
    expect(skuStatusRequests).toBe(1);
    expect(antdConsoleProblems).toEqual([]);
  });

  test("列表发布错误使用审核文案，下架必须确认后才发送请求", async ({ page }) => {
    const antdConsoleProblems: string[] = [];
    const duplicatedExpectedFailures: string[] = [];
    page.on("console", (entry) => {
      const text = entry.text();
      if (/Static function can not consume context|destroyOnClose.*deprecated/i.test(text)) {
        antdConsoleProblems.push(text);
      }
      if (text.includes("更新商品状态失败")) {
        duplicatedExpectedFailures.push(text);
      }
    });
    await installAdminSession(page);
    let productStatus = "OFFLINE";
    let publishRequests = 0;
    let offlineRequests = 0;

    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/products" && route.request().method() === "GET") {
        await fulfill(route, {
          list: [{
            id: 12,
            code: "PUBLISH-012",
            name: "发布校验商品",
            categoryId: 1,
            category: { id: 1, name: "戒指" },
            materialType: "AU750",
            price: 0,
            status: productStatus,
            salesMode: "DIRECT_PURCHASE",
            inventoryPolicy: "SINGLE_UNIT",
            visibility: "MEMBER",
            images: [],
            skus: [],
            totalStock: 0,
            completeness: { score: 30, isComplete: false, missingFields: ["商品价格", "商品图片", "可售SKU"] },
          }],
          total: 1,
        });
        return;
      }
      if (url.pathname === "/api/products/counts") {
        await fulfill(route, { all: 1, PUBLISHED: productStatus === "PUBLISHED" ? 1 : 0, OFFLINE: productStatus === "OFFLINE" ? 1 : 0, DRAFT: 0, ARCHIVED: 0 });
        return;
      }
      if (url.pathname === "/api/categories/admin/tree") {
        await fulfill(route, [{ id: 1, name: "戒指", children: [] }]);
        return;
      }
      if (url.pathname === "/api/settings/flags") {
        await fulfill(route, { commerceEnabled: false, cartEnabled: false, paymentEnabled: false });
        return;
      }
      if (url.pathname === "/api/products/12/status" && route.request().method() === "PUT") {
        const requestBody = route.request().postDataJSON() as { status: string };
        if (requestBody.status === "PUBLISHED") {
          publishRequests += 1;
          await fulfill(route, { statusCode: 422, message: "发布前请补全: 商品价格、商品图片、可售SKU" }, 422);
          return;
        }
        offlineRequests += 1;
        productStatus = "OFFLINE";
        await fulfill(route, { id: 12, status: productStatus });
        return;
      }
      await fulfill(route, {});
    });

    await page.goto("/admin/products");
    await expect(page.getByRole("columnheader", { name: "SKU 最低价" })).toBeVisible();
    await expect(page.getByText("一物一件", { exact: true })).toBeVisible();
    await expect(page.getByText("售罄 / 不可加入购物车", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "上架" }).click();
    await expect(page.getByText(/商品未达到发布条件/)).toBeVisible();
    expect(publishRequests).toBe(1);

    productStatus = "PUBLISHED";
    await page.reload();
    await page.getByRole("button", { name: "下架" }).click();
    expect(offlineRequests).toBe(0);
    const confirmDialog = page.getByRole("dialog", { name: "确认下架这个商品？" });
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "确认下架" }).click();
    await expect(page.getByText("商品已移入仓库")).toBeVisible();
    expect(offlineRequests).toBe(1);
    expect(duplicatedExpectedFailures).toEqual([]);
    expect(antdConsoleProblems).toEqual([]);
  });

  test("五种销售方式与库存策略按服务端门禁提示，SINGLE_UNIT 409 不被伪装成成功", async ({ page }) => {
    await installAdminSession(page);
    const product = {
      id: 21,
      code: "SINGLE-021",
      name: "一物一件测试商品",
      categoryId: 1,
      materialType: "AU750",
      price: 5200,
      status: "OFFLINE",
      visibility: "MEMBER",
      salesMode: "DIRECT_PURCHASE",
      inventoryPolicy: "STANDARD",
      purchaseRegion: "MAINLAND",
      publishMode: "WAREHOUSE",
      fulfillmentType: "IN_STOCK",
      dispatchTime: "WITHIN_48_HOURS",
      deliveryMethods: ["EXPRESS"],
      images: [{ id: 301, productId: 21, url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E", type: "FRONT", sortOrder: 0, isVideo: false }],
      skus: [
        { id: 401, productId: 21, skuCode: "SINGLE-021-A", material: "AU750", price: 5200, isActive: true },
        { id: 402, productId: 21, skuCode: "SINGLE-021-B", material: "AU750", price: 5600, isActive: true },
      ],
      detailContent: [],
    };
    let updateAttempts = 0;

    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/categories/admin/tree") return fulfill(route, [{ id: 1, name: "戒指", children: [] }]);
      if (url.pathname === "/api/shipping-templates") return fulfill(route, []);
      if (url.pathname === "/api/settings/flags") return fulfill(route, { commerceEnabled: true, cartEnabled: true, paymentEnabled: false });
      if (url.pathname === "/api/products/21" && route.request().method() === "GET") return fulfill(route, product);
      if (url.pathname === "/api/products/21" && route.request().method() === "PUT") {
        updateAttempts += 1;
        return fulfill(route, { statusCode: 409, message: "一物一件商品必须且只能有一个有效 SKU" }, 409);
      }
      return fulfill(route, {});
    });

    await page.goto("/admin/products/21/edit");
    await page.getByRole("radio", { name: "一物一件" }).click();
    await expect(page.getByText(/库存总量只能为 0 或 1/)).toBeVisible();
    await expect(page.getByText(/购买数量上限为 1/)).toBeVisible();
    await expect(page.getByText(/当前有 2 个有效 SKU/)).toBeVisible();

    for (const mode of ["仅展示", "选款咨询", "预约到店", "定制咨询"]) {
      await page.getByRole("radio", { name: mode }).click();
      await expect(page.getByText(/当前销售方式发布时不要求交易价格、SKU 或正库存/)).toBeVisible();
    }
    await page.getByRole("radio", { name: "直接购买" }).click();
    await expect(page.getByText(/所有有效 SKU 的交易价格、库存记录、配送方式和库存策略/)).toBeVisible();

    await page.getByRole("button", { name: "保存更改" }).click();
    await expect(page.getByText("商品保存未完成")).toBeVisible();
    await expect(page.locator(".pro-editor__submit-error").getByText(/一物一件商品必须且只能有一个有效 SKU/)).toBeVisible();
    await expect(page.getByText("商品已保存至仓库")).toHaveCount(0);
    expect(updateAttempts).toBe(1);
  });
});
