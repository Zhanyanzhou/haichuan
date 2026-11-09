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

const freeShippingTemplate = {
  id: 7,
  name: "标准包邮模板",
  feeMode: "FREE",
  baseFee: 0,
  remoteSurcharge: 0,
  freeShippingThreshold: null,
  excludedRegions: [],
  isActive: true,
};

async function chooseEditorOption(page: Page, field: string | RegExp, label: string) {
  const combobox = page.getByRole("combobox", { name: field });
  await expect(async () => {
    await combobox.evaluate((element) => element.scrollIntoView({ block: "center", behavior: "instant" }));
    if (await combobox.getAttribute("aria-expanded") !== "true") await combobox.click({ timeout: 2000 });
    await page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option")
      .getByText(label, { exact: true }).click({ timeout: 2000 });
  }).toPass({ timeout: 10_000 });
}

async function confirmDirectDelivery(page: Page) {
  await page.getByRole("checkbox", { name: "物流配送" }).check();
  await chooseEditorOption(page, /备货状态/, "现货");
  await chooseEditorOption(page, /发出时效/, "48 小时内发出");
  await page.getByRole("checkbox", { name: "已核对配送方式、备货状态和发出时效" }).check();
}

test.describe("商品编辑器现有接口契约", () => {
  test.skip(useMock, "该回归通过隔离拦截真实 API 路径验证状态与错误契约");

  for (const width of [390, 1440]) {
    test(`新建商品填写建议、文件名排序和图片内容去重（${width}px，API 夹具）`, async ({ page }) => {
      await installAdminSession(page);
      let codeChecks = 0;
      let unexpectedWrites = 0;
      await page.route("**/api/**", async (route) => {
        const { pathname } = new URL(route.request().url());
        if (pathname === "/api/auth/profile") return route.fallback();
        if (pathname === "/api/categories/admin/tree") return fulfill(route, [
          { id: 1, name: "戒指", children: [] }, { id: 2, name: "吊坠", children: [] },
        ]);
        if (pathname === "/api/products/admin/import-code-conflicts") {
          codeChecks++;
          const { codes } = route.request().postDataJSON();
          return fulfill(route, codes[0] === "ATP969" ? [{ requestedCode: "ATP969", code: "ATP969" }] : []);
        }
        if (route.request().method() !== "GET") unexpectedWrites++;
        return fulfill(route, {});
      });
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/admin/products/new");
      const title = page.getByRole("textbox", { name: "商品标题" });
      const code = page.getByRole("textbox", { name: "款号" });
      const suggestions = page.getByRole("region", { name: "填写建议" });
      await title.fill("18K玫瑰金红宝石戒指 ATP969");
      await page.getByRole("button", { name: "采用款号" }).click();
      await expect(page.getByText("建议款号已被使用，请核对后填写其他款号")).toBeVisible();
      await expect(code).toHaveValue("");
      await title.fill("18K玫瑰金红宝石戒指 ATP968");
      await expect(suggestions.getByText("主要材质 未填写 → 18K金 · 来自标题")).toBeVisible();
      await expect(code).toHaveValue("");
      await page.getByRole("button", { name: "采用全部建议" }).click();
      await expect(code).toHaveValue("ATP968");
      await expect(suggestions.getByText(/类目 已填入 戒指/)).toBeVisible();
      await page.getByRole("button", { name: "撤销类目" }).click();
      await code.fill("MANUAL-12");
      await title.fill("戒指 ATP999");
      await expect(code).toHaveValue("MANUAL-12");
      await expect(suggestions.getByRole("button", { name: "采用类目" })).toHaveCount(0);
      await expect(suggestions.getByRole("button", { name: "采用款号" })).toHaveCount(0);
      await expect(page.getByRole("spinbutton", { name: "金重（g）" })).toHaveValue("");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(codeChecks).toBe(2);

      await page.getByRole("button", { name: "前往上传商品图片" }).click();
      const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aHsQAAAAASUVORK5CYII=", "base64");
      const gallery = page.locator(".pro-editor__uploads");
      const chooserReady = page.waitForEvent("filechooser");
      await gallery.getByRole("button", { name: /上传图片，可一次多选/ }).first().click();
      await (await chooserReady).setFiles([
        { name: "ATP968_SIDE_戒指.png", mimeType: "image/png", buffer: Buffer.concat([png, Buffer.from([0])]) },
        { name: "ATP968戒指主图.png", mimeType: "image/png", buffer: png },
        { name: "不同文件名.png", mimeType: "image/png", buffer: png },
      ]);
      await expect(gallery.locator(".pro-editor__upload-card")).toHaveCount(2);
      const cover = gallery.getByTitle("ATP968戒指主图.png");
      await expect(cover.getByText("主图", { exact: true })).toBeVisible();
      await gallery.getByTitle("ATP968_SIDE_戒指.png").getByRole("button", { name: /前移/ }).click();
      await expect(cover.getByText("主图", { exact: true })).toHaveCount(0);
      expect(unexpectedWrites).toBe(0);
    });
  }

  test("加载失败可重试，重复保存只发送一次并将款号冲突落到字段", async ({ page }) => {
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
        // 旧版本接口仍可返回原文案，编辑器应显示新术语并定位字段。
        await fulfill(route, { statusCode: 409, message: "该商品货号已存在，请更换货号" }, 409);
        return;
      }
      await fulfill(route, {});
    });

    const viewport = { width: 1912, height: 948 };
    await page.setViewportSize(viewport);
    await page.goto("/admin/products/new");
    await expect(page.getByText("正在加载商品信息…")).toBeVisible();
    const loadingLayer = page.locator(".site-route-loading--admin-content");
    expect(await loadingLayer.evaluate((element) => element.closest(".admin-main") !== null)).toBe(true);
    const indicatorBox = (await loadingLayer.locator(".site-route-loading__indicator").boundingBox())!;
    expect.soft(indicatorBox.x + indicatorBox.width / 2).toBeCloseTo(viewport.width / 2, 0);
    expect.soft(indicatorBox.y + indicatorBox.height / 2).toBeCloseTo(viewport.height / 2, 0);
    releaseInitialCategoryRequest();
    await expect(page.getByText("商品编辑所需的类目加载失败。请重新加载后重试。")).toBeVisible();
    await expect(page.getByRole("button", { name: "重新加载" })).toBeVisible();
    await expect(page.locator('form[name="product-editor-main"]')).toHaveCount(0);

    await page.getByRole("button", { name: "重新加载" }).click();
    await expect(page.getByRole("heading", { name: "图文详情" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "预约定制", exact: true })).toBeChecked();
    await expect(page.getByRole("spinbutton", { name: "定制参考起价", exact: true })).toHaveValue("1000.00");
    await expect(page.getByRole("radio", { name: "立刻上架" })).toBeChecked();
    await expect(page.getByRole("radio", { name: "二手" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "物流服务" })).toHaveCount(0);
    await page.getByRole("radio", { name: "直接销售", exact: true }).click();
    await expect(page.getByText(/直接销售需要一个大于 0 的成交价/)).toBeVisible();
    await page.getByRole("button", { name: "基础信息" }).click();
    await page.getByRole("textbox", { name: "款号" }).fill("DUPLICATE-001");
    await chooseEditorOption(page, "当前类目", "戒指");

    const saveDraft = page.getByRole("button", { name: "保存草稿" });
    await saveDraft.dblclick();
    await expect(page.getByText("商品保存未完成")).toBeVisible();
    await expect(page.locator(".ant-form-item-explain-error").filter({ hasText: "该商品款号已存在" })).toBeVisible();
    expect(createAttempts).toBe(1);
  });

  test("已保存商品使用 SKU 起价，第一张即主图，并可确认删除未引用图片", async ({ page }) => {
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
      salesMode: "DIRECT_PURCHASE",
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
        { id: 201, productId: 9, skuCode: "RING-009-DEFAULT", material: "AU750", size: "14", color: "玫瑰金", price: 6999, isActive: true },
        { id: 202, productId: 9, skuCode: "RING-009-15", material: "AU750", size: "15", color: "白色", price: 7299, isActive: true },
      ],
      detailContent: [],
    };
    let deleteRequests = 0;
    let skuStatusRequests = 0;
    const skuUpdatePayloads: Array<Record<string, unknown>> = [];

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
      if (url.pathname === "/api/products/9/images/101" && route.request().method() === "DELETE") {
        deleteRequests += 1;
        product.images = product.images.filter((image) => image.id !== 101);
        await fulfill(route, { id: 101 });
        return;
      }
      if (url.pathname === "/api/products/9/skus/201" && route.request().method() === "PUT") {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        skuUpdatePayloads.push(body);
        Object.assign(product.skus[0], body);
        if (body.isActive === false && Object.keys(body).length === 1) {
          skuStatusRequests += 1;
          await new Promise((resolve) => setTimeout(resolve, 250));
          product.price = 7299;
        }
        await fulfill(route, product.skus[0]);
        return;
      }
      await fulfill(route, {});
    });

    await page.goto("/admin/products/9/edit");
    await expect(page.getByText("当前最低价", { exact: true })).toBeVisible();
    await expect(page.locator(".pro-editor__derived-price")).toHaveText("¥ 6999.00");
    await expect(page.getByText("有多个规格时，页面显示其中的最低价。")).toBeVisible();
    await expect(page.getByText(/2 个有效规格/)).toBeVisible();

    const defaultSkuRow = page.getByRole("row").filter({ hasText: "RING-009-DEFAULT" });
    await expect(defaultSkuRow).toContainText("玫瑰金");
    await defaultSkuRow.getByRole("button", { name: "编辑" }).click();
    const skuDialog = page.getByRole("dialog", { name: "编辑 SKU" });
    await expect(skuDialog.getByRole("textbox", { name: "颜色" })).toHaveValue("玫瑰金");
    await skuDialog.getByRole("textbox", { name: "颜色" }).fill("香槟金");
    await skuDialog.getByRole("button", { name: "保存 SKU" }).click();
    await expect(page.getByText("SKU 已更新")).toBeVisible();
    await expect(defaultSkuRow).toContainText("香槟金");
    expect(skuUpdatePayloads[0]).toMatchObject({ color: "香槟金" });

    await expect(page.getByRole("button", { name: "设为主图" })).toHaveCount(0);
    await expect(page.locator(".pro-editor__upload-card").first().locator(".pro-editor__cover-badge")).toHaveText("主图");

    await page.locator(".pro-editor__upload-actions").first().getByRole("button", { name: "删除" }).click();
    const confirmDialog = page.getByRole("dialog", { name: "确认删除这张商品图片？" });
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "确认删除" }).click();
    await expect(page.getByText("商品图片已删除")).toBeVisible();
    expect(deleteRequests).toBe(1);

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
    await page.getByRole("button", { name: "保存更改" }).click();

    await expect(page.getByText("商品已保存至仓库")).toBeVisible();
    expect(updatePayload?.dispatchTime).toBe("CUSTOM");
    expect(updatePayload?.customLeadTime).toBe("确认规格后 15 个工作日");
    expect(updatePayload?.deliveryMethods).toEqual(["EXPRESS"]);
    expect(updatePayload?.shippingTemplateId).toBe(7);
    await expect(title).toHaveValue("服务端规范化标题");
    await expect(page.getByRole("radio", { name: "预约到店" })).toBeChecked();
    await expect(page.getByRole("button", { name: "物流服务" })).toHaveCount(0);
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
        writesCompleted = true;
        return fulfill(route, { id: 15 });
      }
      if (url.pathname === "/api/products/15/status" && route.request().method() === "PUT") {
        publishRequests += 1;
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
    expect(publishRequests).toBe(0);
    expect(productGetRequests).toBe(2);

    await pendingVerification.getByRole("button", { name: "重新读取保存结果" }).click();
    await expect(title).toHaveValue("权威回读确认后的商品标题");
    await expect(page.getByText("商品保存结果已确认")).toBeVisible();
    await expect(page.locator(".pro-editor__footer [role='status']")).toContainText("最后保存于");
    expect(updateRequests).toBe(1);
    expect(publishRequests).toBe(0);
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
    expect(publishRequests).toBe(0);
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
    await expect(page.getByRole("columnheader", { name: "价格 / 起价" })).toBeVisible();
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
    await expect(page.getByRole("radio", { name: "直接销售" })).toBeChecked();
    await expect(page.getByText(/直接销售需要一个大于 0 的成交价/)).toBeVisible();
    await page.getByRole("radio", { name: "一物一件" }).click();
    await expect(page.getByText(/库存总量只能为 0 或 1/)).toBeVisible();
    await expect(page.getByText(/购买数量上限为 1/)).toBeVisible();
    await expect(page.getByText(/当前有 2 个有效 SKU/)).toBeVisible();
    await page.getByRole("button", { name: "保存更改" }).click();
    await expect(page.getByText("商品保存未完成")).toBeVisible();
    await expect(page.locator(".pro-editor__submit-error").getByText(/一物一件商品必须且只能有一个有效 SKU/)).toBeVisible();
    await expect(page.getByText("商品已保存至仓库")).toHaveCount(0);
    expect(updateAttempts).toBe(1);

    for (const mode of ["仅展示", "选款咨询", "预约到店"]) {
      await page.getByRole("radio", { name: mode }).click();
      await expect(page.getByText(/当前销售方式发布时不要求交易价格、SKU 或正库存/)).toBeVisible();
    }
    await page.getByRole("radio", { name: "预约定制", exact: true }).click();
    await expect(page.getByText(/顾客先预约定制，最终金额在确认方案后报价，不要求成品库存/)).toBeVisible();
  });

  test("首次创建响应丢失后由操作者显式重试并恢复同一款号，不重复创建业务对象", async ({ page }) => {
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
    await page.getByRole("textbox", { name: "款号" }).fill(product.code);
    await chooseEditorOption(page, "当前类目", "戒指");

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

  test("新建商品上架成功后清空表单，可直接填写下一件", async ({ page }) => {
    await installAdminSession(page);
    let createAttempts = 0;
    const products = new Map<number, { id: number; status: string; code?: string; name?: string }>();

    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      const method = route.request().method();
      if (url.pathname === "/api/auth/profile") return route.fallback();
      if (url.pathname === "/api/categories/admin/tree") return fulfill(route, [{ id: 1, name: "吊坠", children: [] }]);
      if (url.pathname === "/api/shipping-templates") return fulfill(route, [freeShippingTemplate]);
      if (url.pathname === "/api/settings/flags") return fulfill(route, { commerceEnabled: true, cartEnabled: true, paymentEnabled: true });
      if (url.pathname === "/api/products" && method === "POST") {
        createAttempts += 1;
        const body = route.request().postDataJSON() as Record<string, unknown>;
        expect(body).toMatchObject({
          fulfillmentConfirmed: true,
          fulfillmentType: "IN_STOCK",
          dispatchTime: "WITHIN_48_HOURS",
          deliveryMethods: ["EXPRESS"],
          shippingTemplateId: freeShippingTemplate.id,
        });
        const id = 70 + createAttempts;
        const product = {
          ...body,
          price: 1280,
          images: [],
          skus: [],
          detailContent: [],
          id,
          status: "DRAFT",
        };
        products.set(id, product);
        return fulfill(route, product);
      }
      const statusMatch = url.pathname.match(/^\/api\/products\/(\d+)\/status$/);
      if (statusMatch && method === "PUT") {
        const product = products.get(Number(statusMatch[1]));
        if (product) product.status = "PUBLISHED";
        return fulfill(route, product ?? {});
      }
      const productMatch = url.pathname.match(/^\/api\/products\/(\d+)$/);
      if (productMatch && (method === "GET" || method === "PUT")) {
        return fulfill(route, products.get(Number(productMatch[1])) ?? {});
      }
      return fulfill(route, {});
    });

    await page.goto("/admin/products/new");
    await page.getByRole("button", { name: "基础信息" }).click();
    await page.getByRole("textbox", { name: "商品标题" }).fill("18K金红宝石吊坠");
    await page.getByRole("textbox", { name: "款号" }).fill("ATP-310");
    await chooseEditorOption(page, "当前类目", "吊坠");
    await page.getByRole("radio", { name: "直接销售", exact: true }).click();
    await page.getByRole("spinbutton", { name: "成交价" }).fill("1280");
    await page.getByRole("spinbutton", { name: "金重（g）" }).fill("11");
    await chooseEditorOption(page, /主要材质/, "18K金");
    await chooseEditorOption(page, /运费模板/, freeShippingTemplate.name);
    await confirmDirectDelivery(page);
    const openVisibility = async () => {
      const field = page.locator("#product-editor-main_visibility");
      await field.evaluate((node) => {
        const scroller = node.closest(".pro-editor__body");
        if (!(scroller instanceof HTMLElement)) return;
        const nodeRect = node.getBoundingClientRect();
        const scrollerRect = scroller.getBoundingClientRect();
        scroller.scrollTop += nodeRect.top - scrollerRect.top - 120;
      });
      await page.locator(".ant-form-item").filter({ hasText: "可见范围" }).locator(".ant-select").click();
    };
    await openVisibility();
    await page.getByText("仅内部可见", { exact: true }).click();

    await page.getByRole("button", { name: "上架商品" }).click();
    await expect(page.getByText("商品已上架。可以继续填写下一件")).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/products\/new$/);
    await expect(page.getByRole("textbox", { name: "商品标题" })).toHaveValue("");
    await expect(page.getByRole("textbox", { name: "款号" })).toBeEnabled();
    await expect(page.getByRole("textbox", { name: "款号" })).toHaveValue("");
    await expect(page.getByRole("radio", { name: "预约定制", exact: true })).toBeChecked();
    await expect(page.getByRole("spinbutton", { name: "定制参考起价", exact: true })).toHaveValue("1000.00");
    await expect(page.getByRole("spinbutton", { name: "金重（g）" })).toHaveValue("");
    await expect(page.getByRole("button", { name: "上架商品" })).toBeEnabled();
    await expect(page.getByText("尚未保存", { exact: true })).toBeVisible();
    await expect(page.locator(".pro-editor__identity .ant-tag")).toHaveText("草稿");
    expect(createAttempts).toBe(1);

    await page.getByRole("radio", { name: "直接销售", exact: true }).click();
    await expect(page.getByRole("spinbutton", { name: "成交价" })).toHaveValue("");
    await page.getByRole("textbox", { name: "商品标题" }).fill("足金小鱼耳钉");
    await page.getByRole("textbox", { name: "款号" }).fill("ATP-311");
    await chooseEditorOption(page, "当前类目", "吊坠");
    await page.getByRole("spinbutton", { name: "成交价" }).fill("860");
    await chooseEditorOption(page, /主要材质/, "足金999");
    await chooseEditorOption(page, /运费模板/, freeShippingTemplate.name);
    await confirmDirectDelivery(page);
    await openVisibility();
    await page.getByText("仅内部可见", { exact: true }).click();
    await page.getByRole("button", { name: "上架商品" }).click();
    await expect(page.getByText("商品已上架。可以继续填写下一件")).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/products\/new$/);
    await expect(page.getByRole("textbox", { name: "商品标题" })).toHaveValue("");
    expect(createAttempts).toBe(2);
  });

  test("直购戒指类目要求圈口、宝石资料和有效鉴定证书（API 夹具）", async ({ page }) => {
    await installAdminSession(page);
    const product = {
      id: 52,
      code: "RING-052",
      name: "金镶红宝石戒指",
      categoryId: 1,
      status: "DRAFT",
      visibility: "PUBLIC",
      salesMode: "DIRECT_PURCHASE",
      materialType: "AU750",
      gemInfo: { type: "红宝石" },
      price: 6800,
      publishMode: "IMMEDIATE",
      scheduledPublishError: "发布前请补全: 有效鉴定证书" as string | null,
      shippingTemplateId: freeShippingTemplate.id,
      deliveryMethods: ["EXPRESS"],
      fulfillmentType: "IN_STOCK",
      dispatchTime: "WITHIN_48_HOURS",
      fulfillmentConfirmed: true,
      inventoryPolicy: "STANDARD",
      primaryImageId: 521,
      images: [{ id: 521, productId: 52, url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E", type: "FRONT", sortOrder: 0, isVideo: false }],
      skus: [{ id: 522, productId: 52, skuCode: "RING-052-DEFAULT", material: "AU750", price: 6800, isActive: true }],
      certificates: [] as Array<Record<string, unknown>>,
    };
    const certificateWrites: Array<Record<string, unknown>> = [];
    const certificateEdits: Array<Record<string, unknown>> = [];
    const certificateRemovals: number[] = [];
    const skuWrites: Array<Record<string, unknown>> = [];
    const combinedSkuWrites: Array<Record<string, unknown>> = [];
    let rejectSave = false;
    let publishCount = 0;
    await page.route("**/api/**", async (route) => {
      const { pathname } = new URL(route.request().url());
      const method = route.request().method();
      if (pathname === "/api/auth/profile") return route.fallback();
      if (pathname === "/api/categories/admin/tree") {
        return fulfill(route, [{ id: 1, name: "鉴定戒指", publicationRules: ["RING_SIZE", "GEMSTONE", "GEM_DISCLOSURE", "CERTIFICATE"], children: [] }]);
      }
      if (pathname === "/api/shipping-templates") return fulfill(route, [freeShippingTemplate]);
      if (pathname === "/api/products/52/certificates" && method === "POST") {
        const data = route.request().postDataJSON();
        certificateWrites.push(data);
        const created = { id: 522 + certificateWrites.length, productId: 52, ...data };
        product.certificates.push(created);
        return fulfill(route, created);
      }
      const certificateMatch = pathname.match(/^\/api\/products\/52\/certificates\/(\d+)$/);
      if (certificateMatch) {
        const id = Number(certificateMatch[1]);
        const index = product.certificates.findIndex((certificate) => certificate.id === id);
        if (index < 0) return fulfill(route, { statusCode: 404, message: "证书不存在" }, 404);
        if (method === "PUT") {
          const data = route.request().postDataJSON();
          certificateEdits.push(data);
          return fulfill(route, Object.assign(product.certificates[index], data));
        }
        if (method === "DELETE") {
          certificateRemovals.push(id);
          product.certificates.splice(index, 1);
          return fulfill(route, { id });
        }
      }
      if (pathname === "/api/products/52/status" && method === "PUT") {
        publishCount += 1;
        product.status = "PUBLISHED";
        product.scheduledPublishError = null;
        return fulfill(route, product);
      }
      if (pathname === "/api/products/52/skus/522" && method === "PUT") {
        const data = route.request().postDataJSON();
        skuWrites.push(data);
        return fulfill(route, Object.assign(product.skus[0], data));
      }
      if (pathname === "/api/products/52") {
        if (method === "PUT") {
          const { editorSkuUpdates, ...fields } = route.request().postDataJSON();
          if (editorSkuUpdates) combinedSkuWrites.push(...editorSkuUpdates);
          if (rejectSave) {
            return fulfill(route, { statusCode: 409, message: "已发布商品更新后不满足发布条件：发布前请补全: 确认备货状态和发出时效" }, 409);
          }
          for (const { id, expectedPrice: _expectedPrice, ...change } of editorSkuUpdates || []) {
            const sku = product.skus.find((item) => item.id === id);
            if (sku) Object.assign(sku, change);
          }
          Object.assign(product, fields);
        }
        return fulfill(route, product);
      }
      return fulfill(route, {});
    });

    await page.goto("/admin/products/52/edit");
    await expect(page.getByText("定时上架未完成")).toBeVisible();
    await expect(page.getByText("发布前请补全: 有效鉴定证书")).toBeVisible();
    const publish = page.getByRole("button", { name: "上架商品", exact: true });
    const ringSize = page.getByRole("textbox", { name: /戒指圈口/ });
    await expect(ringSize).toBeVisible();
    await publish.click();
    const gaps = page.locator(".pro-editor__gap-list");
    await expect(gaps.getByRole("button", { name: "戒指圈口" })).toBeVisible();
    await expect(gaps.getByRole("button", { name: "宝石来源" })).toBeVisible();
    await expect(gaps.getByRole("button", { name: "宝石处理说明" })).toBeVisible();
    await expect(gaps.getByRole("button", { name: "添加有效鉴定证书" })).toBeVisible();
    expect(publishCount).toBe(0);

    await ringSize.fill("港码 14");
    await chooseEditorOption(page, /宝石来源/, "天然");
    await page.getByRole("textbox", { name: /宝石处理说明/ }).fill("未经处理");
    await page.getByRole("button", { name: "添加证书" }).click();
    const dialog = page.getByRole("dialog", { name: "添加鉴定证书" });
    const saveCertificate = dialog.getByRole("button", { name: "保存证书" });
    await saveCertificate.click();
    await expect(dialog.getByText("请输入证书上的编号")).toBeVisible();
    expect(certificateWrites).toHaveLength(0);
    await chooseEditorOption(page, "证书类型", "GIA 证书");
    await dialog.getByRole("textbox", { name: "证书编号" }).fill("—");
    await saveCertificate.click();
    await expect(dialog.getByText("证书编号须包含数字或文字")).toBeVisible();
    expect(certificateWrites).toHaveLength(0);
    await dialog.getByRole("textbox", { name: "证书编号" }).fill(" GIA-RING-052 ");
    await saveCertificate.click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("GIA 证书 · GIA-RING-052")).toBeVisible();
    expect(certificateWrites).toEqual([{ certType: "GIA", certNumber: "GIA-RING-052" }]);
    expect(publishCount).toBe(0);

    await publish.click();
    await expect(page.locator(".pro-editor__identity .ant-tag")).toHaveText("已上架");
    expect(publishCount).toBe(1);
    expect(product.gemInfo).toMatchObject({ type: "红宝石", origin: "天然", treatment: "未经处理" });
    expect(combinedSkuWrites).toEqual([{ id: 522, size: "港码 14" }]);
    expect(skuWrites).toHaveLength(0);
    await expect(page.getByText("定时上架未完成")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "删除 GIA 证书 · GIA-RING-052" })).toBeDisabled();

    const editButton = page.getByRole("button", { name: "编辑 GIA 证书 · GIA-RING-052" });
    await editButton.click();
    const editDialog = page.getByRole("dialog", { name: "编辑鉴定证书" });
    await expect(editDialog.getByText(/顾客将暂时看不到这件商品/)).toBeVisible();
    await editDialog.getByRole("button", { name: "保存证书" }).click();
    await expect(editDialog).toBeHidden();
    expect(certificateEdits).toHaveLength(0);
    await editButton.click();
    await editDialog.getByRole("textbox", { name: "证书编号" }).fill("GIA-RING-052-A");
    await editDialog.getByRole("button", { name: "保存证书" }).click();
    await expect(editDialog).toBeHidden();
    expect(certificateEdits).toEqual([{ certType: "GIA", certNumber: "GIA-RING-052-A" }]);

    await page.getByRole("button", { name: "添加证书" }).click();
    await chooseEditorOption(page, "证书类型", "国检证书");
    await dialog.getByRole("textbox", { name: "证书编号" }).fill("NATIONAL-RING-052");
    await saveCertificate.click();
    await expect(dialog).toBeHidden();
    await page.getByRole("button", { name: "删除 国检证书 · NATIONAL-RING-052" }).click();
    const deleteDialog = page.getByRole("dialog", { name: /删除证书/ });
    await expect(deleteDialog.getByText(/顾客将暂时看不到这件商品/)).toBeVisible();
    await deleteDialog.getByRole("button", { name: "确认删除" }).click();
    await expect(page.getByText("国检证书 · NATIONAL-RING-052")).toHaveCount(0);
    expect(certificateRemovals).toEqual([524]);
    expect(publishCount).toBe(1);
    const price = page.getByRole("spinbutton", { name: /成交价/ });
    await price.fill("6900");
    rejectSave = true;
    await page.getByRole("button", { name: "保存更改", exact: true }).click();
    await expect(gaps.getByRole("button", { name: "确认备货状态和发出时效" })).toBeVisible();
    expect(product.skus[0].price).toBe(6800);
    expect(skuWrites).toHaveLength(0);
    expect(combinedSkuWrites.at(-1)).toMatchObject({ id: 522, price: 6900, expectedPrice: 6800 });
    await expect(price).toHaveValue("6900.00");
    rejectSave = false;
    await page.getByRole("button", { name: "保存更改", exact: true }).click();
    await expect(page.getByText("已保存商品更改", { exact: true })).toBeVisible();
    expect(product.skus[0].price).toBe(6900);
    expect(publishCount).toBe(1);
  });

  test("拖拽顺序用前移后移保存，直接销售可填写可售数量", async ({ page }) => {
    await installAdminSession(page);
    const product = {
      id: 41,
      code: "MOVE-041",
      name: "可调整主图顺序的戒指",
      categoryId: 1,
      materialType: "AU750",
      price: 4200,
      status: "DRAFT",
      visibility: "PUBLIC",
      salesMode: "DIRECT_PURCHASE",
      inventoryPolicy: "STANDARD",
      purchaseRegion: "MAINLAND",
      publishMode: "WAREHOUSE",
      fulfillmentType: "IN_STOCK",
      dispatchTime: "WITHIN_48_HOURS",
      deliveryMethods: [],
      primaryImageId: 411,
      images: [
        { id: 411, productId: 41, url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E", type: "FRONT", sortOrder: 0, isVideo: false },
        { id: 412, productId: 41, url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E", type: "SIDE", sortOrder: 1, isVideo: false },
      ],
      skus: [
        { id: 421, productId: 41, skuCode: "MOVE-041-DEFAULT", material: "AU750", price: 4200, isActive: true },
      ],
      detailContent: [],
    };
    const imageUpdates: Array<{ id: number; sortOrder?: number }> = [];
    let coverImageId: number | undefined;
    let stockUpdate: { quantity?: number; expectedQuantity?: number; type?: string } | undefined;
    let stockQuantity = 0;

    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      const method = route.request().method();
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
        await fulfill(route, { commerceEnabled: true, cartEnabled: true, paymentEnabled: true });
        return;
      }
      if (url.pathname === "/api/products/41" && method === "GET") {
        await fulfill(route, product);
        return;
      }
      if (url.pathname === "/api/products/41" && method === "PUT") {
        await fulfill(route, product);
        return;
      }
      if (url.pathname === "/api/inventory" && method === "GET") {
        await fulfill(route, {
          list: [{ id: 501, quantity: stockQuantity, sku: { skuCode: "MOVE-041-DEFAULT", product: { id: 41, name: product.name } } }],
          total: 1,
        });
        return;
      }
      if (/^\/api\/products\/41\/images\/\d+$/.test(url.pathname) && method === "PUT") {
        const imageId = Number(url.pathname.split("/").pop());
        const body = route.request().postDataJSON() as { sortOrder?: number };
        imageUpdates.push({ id: imageId, sortOrder: body.sortOrder });
        const image = product.images.find((item) => item.id === imageId);
        if (image && body.sortOrder != null) image.sortOrder = body.sortOrder;
        await fulfill(route, { id: imageId, sortOrder: body.sortOrder });
        return;
      }
      if (url.pathname === "/api/products/41/images/primary" && method === "PUT") {
        const body = route.request().postDataJSON() as { imageId?: number };
        coverImageId = body.imageId;
        product.primaryImageId = body.imageId ?? product.primaryImageId;
        await fulfill(route, { primaryImageId: product.primaryImageId });
        return;
      }
      if (url.pathname === "/api/inventory/501" && method === "PUT") {
        stockUpdate = route.request().postDataJSON() as { quantity?: number; expectedQuantity?: number; type?: string };
        stockQuantity = stockUpdate.quantity ?? stockQuantity;
        await fulfill(route, { id: 501, quantity: stockQuantity });
        return;
      }
      await fulfill(route, {});
    });

    await page.goto("/admin/products/41/edit");
    await expect(page.getByRole("spinbutton", { name: "可售数量" })).toHaveValue("0");
    await expect(page.getByRole("button", { name: "前移已上传图片 #411" })).toBeDisabled();
    await page.getByRole("button", { name: "后移已上传图片 #411" }).click();
    const cards = page.locator(".pro-editor__upload-card");
    await expect(cards.first().locator(".pro-editor__cover-badge")).toHaveText("主图");
    await expect(cards.nth(0).getByRole("button", { name: "后移已上传图片 #412" })).toBeVisible();

    await page.getByLabel("拖拽调整已上传图片 #412的顺序").dragTo(page.getByLabel("拖拽调整已上传图片 #411的顺序"));
    await expect(cards.nth(0).getByRole("button", { name: "后移已上传图片 #411" })).toBeVisible();

    await page.getByRole("button", { name: "后移已上传图片 #411" }).click();
    await page.getByRole("spinbutton", { name: "可售数量" }).fill("3");
    await page.getByRole("button", { name: "保存草稿" }).click();
    await expect(page.getByText("草稿已保存")).toBeVisible();
    expect(imageUpdates).toEqual([
      { id: 412, sortOrder: 0 },
      { id: 411, sortOrder: 1 },
    ]);
    expect(coverImageId).toBe(412);
    expect(stockUpdate).toMatchObject({ type: "adjust", quantity: 3, expectedQuantity: 0 });
  });
});
