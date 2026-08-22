import { expect, test } from "@playwright/test";

const useMock = process.env.VITE_USE_MOCK === "true";

test.describe("商品编辑器关键回归", () => {
  test.skip(!useMock, "该回归使用隔离 Mock 数据验证编辑流程");

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("token", "mock-jwt-token");
      localStorage.setItem("jewelry-auth", JSON.stringify({
        state: {
          token: "mock-jwt-token",
          user: { id: 1, username: "mock-admin", role: "SUPER_ADMIN", name: "Mock Admin" },
          isLoggedIn: true,
        },
        version: 0,
      }));
      localStorage.removeItem("haichuan.mock-products");
    });
    await page.goto("/admin/products/new");
    await expect(page.getByRole("heading", { name: "图文描述" })).toBeVisible();
  });

  test("新建状态、核心字段过滤、预览和物流条件一致", async ({ page }) => {
    await expect(page.getByText("尚未保存", { exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "品牌" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "批量导入" })).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "可见范围" })).toBeVisible();
    await expect(page.getByRole("button", { name: "添加 SKU" })).toBeDisabled();

    const primaryTextColor = await page.locator(".pro-editor__footer .ant-btn-primary > span").evaluate((element) => getComputedStyle(element).color);
    expect(primaryTextColor).toBe("rgb(255, 255, 255)");

    await page.getByRole("switch", { name: "只看核心字段" }).click();
    await expect(page.getByRole("textbox", { name: "品牌" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "证书编号" })).toBeVisible();

    await page.getByRole("button", { name: "预览" }).click();
    await expect(page.getByRole("dialog", { name: "商品预览" })).toBeVisible();
    await expect(page.getByText("尚未上传主图")).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();

    await page.getByRole("button", { name: "物流服务" }).click();
    await page.waitForTimeout(400);
    await page.getByRole("checkbox", { name: "物流配送" }).uncheck();
    await page.getByText("到店自提", { exact: true }).click();
    await expect(page.getByRole("checkbox", { name: "到店自提" })).toBeChecked();
    await expect(page.getByText("当前未选择物流配送，无需设置运费模板。" )).toBeVisible();
  });

  test("校验提示准确，草稿允许标题未完成", async ({ page }) => {
    await page.getByRole("button", { name: "保存到仓库" }).click();
    await expect(page.getByText("请检查并修正标红字段")).toBeVisible();
    await expect(page.getByText("保存失败，请检查后重试")).toHaveCount(0);

    await page.getByRole("button", { name: "基础信息" }).click();
    await page.waitForTimeout(400);
    await page.getByRole("textbox", { name: "货号" }).fill(`DRAFT-${Date.now()}`);
    await page.getByRole("combobox", { name: "当前类目" }).click();
    const firstCategory = page.locator(".ant-select-item-option").first();
    await expect(firstCategory).toBeVisible();
    await firstCategory.click();
    await page.getByRole("button", { name: "保存草稿" }).click();

    await expect(page).toHaveURL(/\/admin\/products\/\d+\/edit$/);
    await expect(page.getByRole("textbox", { name: "商品标题" })).toHaveValue(/未命名商品-/);
    const countAfterCreate = await page.evaluate(() => JSON.parse(localStorage.getItem("haichuan.mock-products") || "[]").length);
    await page.getByRole("button", { name: "保存草稿" }).click();
    await expect(page.getByText("草稿已保存")).toBeVisible();
    const countAfterRetry = await page.evaluate(() => JSON.parse(localStorage.getItem("haichuan.mock-products") || "[]").length);
    expect(countAfterRetry).toBe(countAfterCreate);
  });

  test("桌面金额输入宽度和平板重排可用", async ({ page }) => {
    await page.getByRole("switch", { name: "只看核心字段" }).click();
    await page.getByRole("button", { name: "销售信息" }).click();
    const priceWidth = await page.getByRole("spinbutton", { name: "工费" }).evaluate((element) => element.closest(".ant-input-number-affix-wrapper")?.getBoundingClientRect().width || 0);
    expect(priceWidth).toBeGreaterThanOrEqual(300);

    await page.setViewportSize({ width: 720, height: 720 });
    const metrics = await page.evaluate(() => ({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.width);
  });

  test("保存已上架商品内容不会把状态降为草稿", async ({ page }) => {
    const publishedProduct = {
      id: 1,
      code: "PUBLISHED-001",
      name: "已上架测试商品",
      categoryId: 53,
      materialType: "GOLD_999",
      price: 5280,
      status: "PUBLISHED",
      visibility: "MEMBER",
      salesMode: "DISPLAY_ONLY",
      purchaseRegion: "MAINLAND",
      publishMode: "IMMEDIATE",
      fulfillmentType: "IN_STOCK",
      dispatchTime: "WITHIN_48_HOURS",
      deliveryMethods: ["EXPRESS"],
      shippingTemplateId: 1,
      images: [{ id: 101, productId: 1, url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'/%3E", type: "FRONT", sortOrder: 0, isVideo: false }],
      skus: [{ id: 201, productId: 1, skuCode: "PUBLISHED-001-DEFAULT", material: "GOLD_999", price: 5280, stock: 1, safetyStock: 0, isActive: true }],
      detailContent: [],
      createdAt: new Date().toISOString(),
    };
    await page.addInitScript((product) => {
      localStorage.setItem("haichuan.mock-products", JSON.stringify([product]));
    }, publishedProduct);
    await page.goto("/admin/products/1/edit");
    await expect(page.getByText("已上架", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "保存更改" })).toBeVisible();
    await expect(page.getByRole("button", { name: /下\s*架/ })).toBeVisible();

    await page.getByRole("textbox", { name: "商品标题" }).fill("已上架测试商品（已更新）");
    await page.getByRole("button", { name: "保存更改" }).click();
    await expect(page.getByText("已保存商品更改")).toBeVisible();

    const storedStatus = await page.evaluate(() => JSON.parse(localStorage.getItem("haichuan.mock-products") || "[]")[0]?.status);
    expect(storedStatus).toBe("PUBLISHED");
  });
});
