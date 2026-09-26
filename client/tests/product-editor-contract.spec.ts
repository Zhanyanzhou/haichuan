import { expect, test, type Page, type Route } from "@playwright/test";
import { installAdminSession as installMockAdminSession } from "./fixtures/session-auth";

const useMock = process.env.VITE_USE_MOCK === "true";

function installAdminSession(page: Page) {
  return installMockAdminSession(page, {
    username: "isolated-admin",
    realName: "Isolated Admin",
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
      if (url.pathname === "/api/auth/profile") return route.fallback();
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
    const directPurchase = page.getByRole("radio", { name: "直接购买" });
    await expect(directPurchase).toBeEnabled();
    await directPurchase.click();
    await expect(page.getByText(/仍可维护直购商品事实，公开端不会开放加购或支付/)).toBeVisible();
    await expect(page.getByRole("button", { name: "前往库存管理" })).toBeVisible();
    await page.getByRole("radio", { name: "仅展示" }).click();
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
      if (url.pathname === "/api/auth/profile") return route.fallback();
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
    await expect(page.locator(".pro-editor__derived-price")).toHaveText("¥ 6999.00");
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

  test("保存后以权威 GET 完整回填服务端规范化字段", async ({ page }) => {
    await installAdminSession(page);
    let saved = false;
    let updatePayload: Record<string, unknown> | undefined;
    const baseProduct = {
      id: 10,
      code: "CANONICAL-010",
      name: "初始标题",
      shortDescription: "完整商品简介与佩戴建议",
      description: "完整商品说明，用于验证保存后的权威回读。",
      categoryId: 1,
      materialType: "AU750",
      price: 6999,
      status: "OFFLINE",
      visibility: "MEMBER",
      salesMode: "DISPLAY_ONLY",
      inventoryPolicy: "STANDARD",
      purchaseRegion: "MAINLAND",
      publishMode: "WAREHOUSE",
      fulfillmentType: "PREORDER",
      dispatchTime: "CUSTOM",
      customLeadTime: "确认规格后 15 个工作日",
      deliveryMethods: ["EXPRESS"],
      shippingTemplateId: 7,
      requiresInsuredShipping: false,
      requiresSignature: false,
      includesCertificate: false,
      images: [{ id: 110, productId: 10, url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E", type: "FRONT", sortOrder: 0, isVideo: false }],
      skus: [{ id: 210, productId: 10, skuCode: "CANONICAL-010-A", material: "AU750", size: "14", price: 6999, isActive: true }],
      detailContent: [],
    };

    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/auth/profile") return route.fallback();
      if (url.pathname === "/api/categories/admin/tree") return fulfill(route, [{ id: 1, name: "戒指", children: [] }]);
      if (url.pathname === "/api/shipping-templates") return fulfill(route, [{ id: 7, name: "标准配送", isDefault: true, isActive: true }]);
      if (url.pathname === "/api/settings/flags") return fulfill(route, { commerceEnabled: true, cartEnabled: true, paymentEnabled: false });
      if (url.pathname === "/api/products/10" && route.request().method() === "GET") {
        return fulfill(route, saved ? {
          ...baseProduct,
          name: "服务端规范化标题",
          salesMode: "APPOINTMENT",
          dispatchTime: "WITHIN_24_HOURS",
          customLeadTime: null,
          deliveryMethods: ["STORE_PICKUP"],
          shippingTemplateId: null,
        } : baseProduct);
      }
      if (url.pathname === "/api/products/10" && route.request().method() === "PUT") {
        updatePayload = route.request().postDataJSON() as Record<string, unknown>;
        saved = true;
        return fulfill(route, { id: 10 });
      }
      return fulfill(route, {});
    });

    await page.goto("/admin/products/10/edit");
    const title = page.getByRole("textbox", { name: "商品标题" });
    await expect(title).toHaveValue("初始标题");
    await title.fill("仅存在于提交前的本地标题");
    await page.getByRole("radio", { name: "24小时内" }).click();
    await page.getByRole("button", { name: "保存更改" }).click();

    await expect(page.getByText("商品已保存至仓库")).toBeVisible();
    expect(updatePayload?.customLeadTime).toBeNull();
    await expect(title).toHaveValue("服务端规范化标题");
    await expect(page.getByRole("radio", { name: "预约到店" })).toBeChecked();
    await expect(page.getByRole("radio", { name: "24小时内" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "到店自提" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "物流配送" })).not.toBeChecked();
    await expect(page.locator(".pro-editor__footer [role='status']")).toContainText("最后保存于");
  });

  test("写入成功但权威 GET 暂时失败时只重试回读，不重复 PUT 或发布动作", async ({ page }) => {
    await installAdminSession(page);
    let productGetRequests = 0;
    let updateRequests = 0;
    let publishRequests = 0;
    let writesCompleted = false;
    let releaseLateVerification!: () => void;
    let signalLateVerificationStarted!: () => void;
    const lateVerificationGate = new Promise<void>((resolve) => {
      releaseLateVerification = resolve;
    });
    const lateVerificationStarted = new Promise<void>((resolve) => {
      signalLateVerificationStarted = resolve;
    });
    const baseProduct = {
      id: 15,
      code: "VERIFY-015",
      name: "待更新的已发布商品",
      shortDescription: "完整商品简介与佩戴建议",
      description: "完整商品说明，用于验证保存结果未知时的只读恢复。",
      categoryId: 1,
      materialType: "AU750",
      price: 6999,
      status: "PUBLISHED",
      visibility: "PUBLIC",
      salesMode: "DISPLAY_ONLY",
      inventoryPolicy: "STANDARD",
      purchaseRegion: "MAINLAND",
      publishMode: "IMMEDIATE",
      fulfillmentType: "IN_STOCK",
      dispatchTime: "WITHIN_48_HOURS",
      deliveryMethods: [],
      images: [{ id: 115, productId: 15, url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E", type: "FRONT", sortOrder: 0, isVideo: false }],
      skus: [],
      detailContent: [],
    };

    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/auth/profile") return route.fallback();
      if (url.pathname === "/api/categories/admin/tree") return fulfill(route, [{ id: 1, name: "戒指", children: [] }]);
      if (url.pathname === "/api/shipping-templates") return fulfill(route, []);
      if (url.pathname === "/api/settings/flags") return fulfill(route, { commerceEnabled: false, cartEnabled: false, paymentEnabled: false });
      if (url.pathname === "/api/products/15" && route.request().method() === "GET") {
        productGetRequests += 1;
        if (productGetRequests === 2 || productGetRequests === 4) {
          return fulfill(route, { statusCode: 503, message: "temporary read failure" }, 503);
        }
        if (productGetRequests === 5) {
          signalLateVerificationStarted();
          await lateVerificationGate;
        }
        return fulfill(route, writesCompleted ? {
          ...baseProduct,
          name: "权威回读确认后的商品标题",
        } : baseProduct);
      }
      if (url.pathname === "/api/products/16" && route.request().method() === "GET") {
        return fulfill(route, {
          ...baseProduct,
          id: 16,
          code: "VERIFY-016",
          name: "另一件商品",
          images: [],
        });
      }
      if (url.pathname === "/api/products/15" && route.request().method() === "PUT") {
        updateRequests += 1;
        return fulfill(route, { id: 15 });
      }
      if (url.pathname === "/api/products/15/status" && route.request().method() === "PUT") {
        publishRequests += 1;
        writesCompleted = true;
        return fulfill(route, { ...baseProduct, name: "权威回读确认后的商品标题" });
      }
      return fulfill(route, {});
    });

    await page.goto("/admin/products/15/edit");
    const title = page.getByRole("textbox", { name: "商品标题" });
    await expect(title).toHaveValue("待更新的已发布商品");
    await title.fill("运营提交的新标题");
    await page.getByRole("button", { name: "保存更改" }).click();

    const pendingVerification = page.getByRole("alert").filter({ hasText: "商品已写入，最新状态待确认" });
    await expect(pendingVerification).toBeVisible();
    await expect(pendingVerification).toContainText("系统不会重复保存或重新执行发布动作");
    await expect(title).toHaveValue("运营提交的新标题");
    expect(updateRequests).toBe(1);
    expect(publishRequests).toBe(1);
    expect(productGetRequests).toBe(2);

    await pendingVerification.getByRole("button", { name: "重新读取保存结果" }).click();
    await expect(title).toHaveValue("权威回读确认后的商品标题");
    await expect(page.getByText("商品保存结果已确认")).toBeVisible();
    await expect(page.locator(".pro-editor__footer [role='status']")).toContainText("最后保存于");
    expect(updateRequests).toBe(1);
    expect(publishRequests).toBe(1);
    expect(productGetRequests).toBe(3);

    await expect(page.getByText("商品保存结果已确认")).toHaveCount(0, { timeout: 5000 });
    await title.fill("第二次运营修改");
    await page.getByRole("button", { name: "保存更改" }).click();
    await expect(pendingVerification).toBeVisible();
    await pendingVerification.getByRole("button", { name: "重新读取保存结果" }).click();
    await lateVerificationStarted;

    await page.getByRole("button", { name: "返回商品列表" }).click();
    const leaveDialog = page.getByRole("dialog", { name: "离开当前编辑？" });
    await expect(leaveDialog).toBeVisible();
    await leaveDialog.getByRole("button", { name: "放弃修改" }).click();
    await expect(page).toHaveURL(/\/admin\/products$/);
    await page.goto("/admin/products/16/edit");
    await expect(page).toHaveURL(/\/admin\/products\/16\/edit$/);
    await expect(title).toHaveValue("另一件商品");

    releaseLateVerification();
    await expect(title).toHaveValue("另一件商品");
    await expect(page.getByText("商品保存结果已确认")).toHaveCount(0);
    expect(updateRequests).toBe(2);
    expect(publishRequests).toBe(2);
    expect(productGetRequests).toBe(5);
  });

  test("保存中切换商品时隔离旧编辑会话的迟到回读", async ({ page }) => {
    await installAdminSession(page);
    let releaseProductAUpdate!: () => void;
    let signalProductAUpdateStarted!: () => void;
    let signalProductARefreshFinished!: () => void;
    const productAUpdateGate = new Promise<void>((resolve) => {
      releaseProductAUpdate = resolve;
    });
    const productAUpdateStarted = new Promise<void>((resolve) => {
      signalProductAUpdateStarted = resolve;
    });
    const productARefreshFinished = new Promise<void>((resolve) => {
      signalProductARefreshFinished = resolve;
    });
    let productAGetCount = 0;

    const createProduct = (id: number, name: string) => ({
      id,
      code: `ROUTE-${id}`,
      name,
      shortDescription: `${name}的完整简介与佩戴建议`,
      description: `${name}的完整商品说明，用于验证编辑会话隔离。`,
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
      images: [],
      skus: [],
      detailContent: [],
    });

    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/auth/profile") return route.fallback();
      if (url.pathname === "/api/categories/admin/tree") return fulfill(route, [{ id: 1, name: "戒指", children: [] }]);
      if (url.pathname === "/api/shipping-templates") return fulfill(route, []);
      if (url.pathname === "/api/settings/flags") return fulfill(route, { commerceEnabled: false, cartEnabled: false, paymentEnabled: false });
      if (url.pathname === "/api/products/10" && route.request().method() === "GET") {
        productAGetCount += 1;
        await fulfill(route, createProduct(10, productAGetCount === 1 ? "商品 A" : "商品 A 迟到回读"));
        if (productAGetCount > 1) signalProductARefreshFinished();
        return;
      }
      if (url.pathname === "/api/products/10" && route.request().method() === "PUT") {
        signalProductAUpdateStarted();
        await productAUpdateGate;
        return fulfill(route, { id: 10 });
      }
      if (url.pathname === "/api/products/11" && route.request().method() === "GET") {
        return fulfill(route, createProduct(11, "商品 B"));
      }
      return fulfill(route, {});
    });

    await page.goto("/admin/products/10/edit");
    const title = page.getByRole("textbox", { name: "商品标题" });
    await expect(title).toHaveValue("商品 A");
    await title.fill("商品 A 待保存");
    await page.getByRole("button", { name: "保存更改" }).click();
    await productAUpdateStarted;

    await page.evaluate(() => {
      window.history.pushState({}, "", "/admin/products/11/edit");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await expect(page).toHaveURL(/\/admin\/products\/11\/edit$/);
    await expect(title).toHaveValue("商品 B");
    await expect(page.getByRole("button", { name: "保存更改" })).not.toHaveClass(/ant-btn-loading/);

    releaseProductAUpdate();
    await productARefreshFinished;
    await expect(title).toHaveValue("商品 B");
    await expect(page.locator(".pro-editor__footer [role='status']")).toContainText("当前状态：仓库中");
    await expect(page.getByText("草稿已保存")).toHaveCount(0);
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
      if (url.pathname === "/api/auth/profile") return route.fallback();
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
    const publishDialog = page.getByRole("dialog", { name: "上架“发布校验商品”？" });
    await expect(publishDialog).toBeVisible();
    await publishDialog.getByRole("button", { name: "确认上架" }).click();
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
      shortDescription: "用于验证一物一件库存策略的完整商品简介",
      description: "该商品 fixture 提供完整说明，以确保保存请求能够到达服务端并验证 409 冲突处理。",
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
      if (url.pathname === "/api/auth/profile") return route.fallback();
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

  test("首次创建响应丢失后由操作者显式重试并恢复同一货号，不重复创建业务对象", async ({ page }) => {
    await installAdminSession(page);
    let createAttempts = 0;
    let updateAttempts = 0;
    const createBodies: unknown[] = [];
    const product = {
      id: 31,
      code: "CREATE-RECOVERY-031",
      name: "未命名商品-CREATE-RECOVERY-031",
      categoryId: 1,
      materialType: "GOLD_999",
      price: 0,
      status: "DRAFT",
      visibility: "MEMBER",
      salesMode: "DISPLAY_ONLY",
      inventoryPolicy: "STANDARD",
      purchaseRegion: "MAINLAND",
      publishMode: "WAREHOUSE",
      fulfillmentType: "IN_STOCK",
      dispatchTime: "WITHIN_48_HOURS",
      deliveryMethods: ["EXPRESS"],
      requiresInsuredShipping: true,
      requiresSignature: true,
      includesCertificate: true,
      images: [],
      skus: [{
        id: 311,
        productId: 31,
        skuCode: "CREATE-RECOVERY-031-DEFAULT",
        material: "GOLD_999",
        price: 0,
        isActive: true,
      }],
      detailContent: [],
    };

    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/auth/profile") return route.fallback();
      if (url.pathname === "/api/categories/admin/tree") return fulfill(route, [{ id: 1, name: "戒指", children: [] }]);
      if (url.pathname === "/api/shipping-templates") return fulfill(route, []);
      if (url.pathname === "/api/settings/flags") return fulfill(route, { commerceEnabled: false, cartEnabled: false, paymentEnabled: false });
      if (url.pathname === "/api/products" && route.request().method() === "POST") {
        createAttempts += 1;
        createBodies.push(route.request().postDataJSON());
        if (createAttempts === 1) {
          return fulfill(route, { statusCode: 503, message: "response lost after commit" }, 503);
        }
        return fulfill(route, product);
      }
      if (url.pathname === "/api/products/31" && route.request().method() === "PUT") {
        updateAttempts += 1;
        return fulfill(route, { id: 31 });
      }
      if (url.pathname === "/api/products/31" && route.request().method() === "GET") {
        return fulfill(route, product);
      }
      return fulfill(route, {});
    });

    await page.goto("/admin/products/new");
    await page.getByRole("button", { name: "基础信息" }).click();
    await page.getByRole("textbox", { name: "货号" }).fill(product.code);
    await page.getByRole("combobox", { name: "当前类目" }).click();
    await page.getByText("戒指", { exact: true }).click();

    const saveDraft = page.getByRole("button", { name: "保存草稿" });
    await saveDraft.click();
    await expect(page.locator(".pro-editor__submit-error")).toContainText("商品创建结果待确认");
    await expect(page.locator(".pro-editor__submit-error")).toContainText("再次点击保存");
    expect(createAttempts).toBe(1);
    expect(updateAttempts).toBe(0);

    await saveDraft.click();
    await expect(page.getByText("草稿已保存")).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/products\/31\/edit$/);
    expect(createAttempts).toBe(2);
    expect(updateAttempts).toBe(1);
    expect(createBodies[1]).toEqual(createBodies[0]);
  });
});
