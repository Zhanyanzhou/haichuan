import { expect, test, type Page, type Route } from "@playwright/test";
import { installAdminSession } from "./fixtures/session-auth";

const wrapped = (data: unknown) =>
  JSON.stringify({ code: 200, data, message: "ok" });

async function authenticateAdmin(page: Page) {
  await installAdminSession(page, {
    username: "operating-foundation-admin",
    realName: "经营底座测试管理员",
    role: "SUPER_ADMIN",
  });
}

async function fulfillJson(route: Route, data: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body:
      status >= 400
        ? JSON.stringify({ code: status, data: null, message: "test failure" })
        : wrapped(data),
  });
}

test.describe("后台经营底座第一批状态", () => {
  test("合作申请加载失败可重试，审核写请求保持可恢复且移动端不产生页面级横向滚动", async ({
    page,
  }) => {
    await authenticateAdmin(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      document.cookie = "hc_csrf=partner-review-csrf; Path=/";
    });
    let mode: "fail" | "success" = "fail";
    const reviewBodies: unknown[] = [];

    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path.endsWith("/api/auth/profile")) return route.fallback();
      if (path.endsWith("/api/settings/flags")) {
        await fulfillJson(route, {
          commerceEnabled: false,
          cartEnabled: false,
          paymentEnabled: false,
          partnerApplicationsWriteEnabled: true,
        });
        return;
      }
      if (path.endsWith("/api/partner-applications") && request.method() === "GET") {
        if (mode === "fail") {
          await fulfillJson(route, null, 503);
          return;
        }
        await fulfillJson(route, {
          list: [{
            id: 7,
            customerId: 17,
            applicantName: "合作申请测试客户",
            applicantPhone: "13800001234",
            companyName: "测试珠宝工作室",
            channelType: "线下工作室",
            status: "PENDING",
            submittedAt: "2026-08-27T08:00:00.000Z",
            createdAt: "2026-08-27T08:00:00.000Z",
          }],
          total: 1,
        });
        return;
      }
      if (
        path.endsWith("/api/partner-applications/7/review")
        && request.method() === "PUT"
      ) {
        reviewBodies.push(request.postDataJSON());
        await fulfillJson(route, { id: 7, status: "APPROVED" });
        return;
      }
      await fulfillJson(route, {});
    });

    await page.goto("/admin/partner-applications");
    await expect(
      page.getByText("合作申请列表加载失败，请稍后重新加载。"),
    ).toBeVisible();

    mode = "success";
    await page.getByRole("button", { name: "重新加载" }).click();
    await expect(page.getByText("合作申请测试客户")).toBeVisible();
    await expect(page.getByText("138****1234")).toBeVisible();

    await page.locator(".ant-table-content").evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
    });
    await page.getByRole("button", { name: /审\s*核/ }).click();
    await page.getByRole("button", { name: "提交审核" }).click();
    await expect(page.getByText("审核已提交")).toBeVisible();
    await expect.poll(() => reviewBodies.length).toBe(1);
    expect(reviewBodies[0]).toEqual({ action: "APPROVED" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("Inventory 失败不显示零值，重试后标清全量与当前页并按当前页导出", async ({
    page,
  }) => {
    await authenticateAdmin(page);
    let mode: "fail" | "success" = "fail";
    let releaseInventory!: () => void;
    const inventoryGate = new Promise<void>((resolve) => {
      releaseInventory = resolve;
    });

    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/api/auth/profile")) return route.fallback();
      if (url.pathname.endsWith("/api/warehouses")) {
        await fulfillJson(route, [{ id: 1, name: "深圳展厅" }]);
        return;
      }
      if (url.pathname.endsWith("/api/inventory")) {
        if (mode === "fail") {
          await inventoryGate;
          await fulfillJson(route, null, 503);
          return;
        }
        await fulfillJson(route, {
          list: [
            {
              id: 11,
              quantity: 8,
              safetyStock: 2,
              sku: { skuCode: "HC-SKU-11", product: { name: "测试戒指" } },
              warehouse: { name: "深圳展厅" },
            },
            {
              id: 12,
              quantity: 0,
              safetyStock: 2,
              sku: { skuCode: "HC-SKU-12", product: { name: "测试项链" } },
              warehouse: { name: "深圳展厅" },
            },
          ],
          total: 41,
        });
        return;
      }
      await fulfillJson(route, {});
    });

    await page.goto("/admin/inventory");
    await expect(page.getByText("正在加载库存数据…")).toBeVisible();
    releaseInventory();

    await expect(page.getByText("库存数据加载失败", { exact: true })).toBeVisible();
    await expect(page.getByText("库存记录总数（全量）")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "导出当前页" })).toBeDisabled();

    mode = "success";
    await page.getByRole("button", { name: "重新加载" }).click();
    await expect(page.getByText("库存记录总数（全量）")).toBeVisible();
    await expect(
      page.getByText("全量总数来自服务端；状态统计与状态筛选仅针对当前页已加载记录。"),
    ).toBeVisible();
    await expect(page.getByText("本页正常")).toBeVisible();
    await expect(page.getByText("本页缺货")).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "导出当前页" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain("库存报表");
    await expect(page.getByText("已导出当前页 2 条库存记录")).toBeVisible();
  });

  test("Inventory 明确展示空数据", async ({ page }) => {
    await authenticateAdmin(page);
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/api/auth/profile")) return route.fallback();
      await fulfillJson(
        route,
        path.endsWith("/api/inventory")
          ? { list: [], total: 0 }
          : path.endsWith("/api/warehouses")
            ? []
            : {},
      );
    });

    await page.goto("/admin/inventory");
    await expect(page.getByText("暂无库存记录")).toBeVisible();
    await expect(page.getByText("库存记录总数（全量）")).toHaveCount(0);
  });

  test("Inventory 设为目标库存发送 adjust 契约，并反馈非法输入与接口失败", async ({
    page,
  }) => {
    await authenticateAdmin(page);
    let quantity = 8;
    let updateMode: "success" | "fail" = "success";
    let updateCalls = 0;
    let lastUpdateBody: unknown;

    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path.endsWith("/api/auth/profile")) return route.fallback();
      if (path.endsWith("/api/warehouses")) {
        await fulfillJson(route, [{ id: 1, name: "深圳展厅" }]);
        return;
      }
      if (path.endsWith("/api/inventory/11") && request.method() === "PUT") {
        updateCalls += 1;
        lastUpdateBody = request.postDataJSON();
        if (updateMode === "fail") {
          await fulfillJson(route, null, 400);
          return;
        }
        quantity = Number((lastUpdateBody as { quantity?: number }).quantity);
        await fulfillJson(route, { id: 11, quantity });
        return;
      }
      if (path.endsWith("/api/inventory")) {
        await fulfillJson(route, {
          list: [
            {
              id: 11,
              quantity,
              safetyStock: 2,
              sku: { skuCode: "HC-SKU-11", product: { name: "测试戒指" } },
              warehouse: { name: "深圳展厅" },
            },
          ],
          total: 1,
        });
        return;
      }
      await fulfillJson(route, {});
    });

    await page.goto("/admin/inventory");
    await expect(page.getByText("测试戒指")).toBeVisible();

    const inventoryRow = page.getByRole("row").filter({ hasText: "测试戒指" });
    await inventoryRow.getByRole("button").click();
    const targetQuantity = page.getByRole("spinbutton", { name: "目标库存" });
    await targetQuantity.fill("5");
    await page.getByRole("button", { name: "保存库存调整" }).click();

    await expect(page.getByText("库存已调整")).toBeVisible();
    expect(lastUpdateBody).toEqual({ type: "adjust", quantity: 5 });
    expect(updateCalls).toBe(1);

    await inventoryRow.getByRole("button").click();
    await targetQuantity.clear();
    await page.getByRole("button", { name: "保存库存调整" }).click();
    await expect(page.getByText("目标库存必须是非负整数").last()).toBeVisible();
    expect(updateCalls).toBe(1);

    await targetQuantity.fill("-1");
    await page.getByRole("button", { name: "保存库存调整" }).click();
    await expect(page.getByText("目标库存必须是非负整数").last()).toBeVisible();
    expect(updateCalls).toBe(1);

    await targetQuantity.fill("1.5");
    await page.getByRole("button", { name: "保存库存调整" }).click();
    await expect(page.getByText("目标库存必须是非负整数").last()).toBeVisible();
    expect(updateCalls).toBe(1);

    updateMode = "fail";
    await targetQuantity.fill("7");
    await page.getByRole("button", { name: "保存库存调整" }).click();
    await expect(
      page.getByText("库存调整失败，请重新加载库存后核对数量。"),
    ).toBeVisible();
    await expect(page.getByRole("dialog", { name: "调整库存" })).toBeVisible();
    expect(lastUpdateBody).toEqual({ type: "adjust", quantity: 7 });
    expect(updateCalls).toBe(2);
  });

  test("UserManage 隐藏失败前的旧结果，重试与筛选空态可恢复", async ({ page }) => {
    await authenticateAdmin(page);
    let mode: "old" | "fail" | "fresh" | "empty" = "old";
    let releaseUsers!: () => void;
    const usersGate = new Promise<void>((resolve) => {
      releaseUsers = resolve;
    });

    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/api/auth/profile")) return route.fallback();
      if (!path.endsWith("/api/users")) {
        await fulfillJson(route, {});
        return;
      }
      if (mode === "old") {
        await usersGate;
        await fulfillJson(route, {
          list: [
            {
              id: 1,
              username: "old-result",
              realName: "旧结果员工",
              role: "ADMIN",
              status: "ACTIVE",
              createdAt: "2026-08-22T00:00:00.000Z",
            },
          ],
          total: 1,
          roleCounts: { ADMIN: 1 },
        });
        return;
      }
      if (mode === "fail") {
        await fulfillJson(route, null, 503);
        return;
      }
      if (mode === "empty") {
        await fulfillJson(route, { list: [], total: 0, roleCounts: {} });
        return;
      }
      await fulfillJson(route, {
        list: [
          {
            id: 2,
            username: "fresh-result",
            realName: "新结果员工",
            role: "EDITOR",
            status: "ACTIVE",
            createdAt: "2026-08-22T00:00:00.000Z",
          },
        ],
        total: 1,
        roleCounts: { EDITOR: 1 },
      });
    });

    await page.goto("/admin/users");
    await expect(page.getByText("正在加载后台员工数据…")).toBeVisible();
    releaseUsers();
    await expect(page.getByText("旧结果员工")).toBeVisible();

    mode = "fail";
    const search = page.getByPlaceholder("搜索用户名 / 姓名 / 手机号");
    await search.fill("新员工");
    await search.press("Enter");
    await expect(page.getByText("后台员工数据加载失败", { exact: true })).toBeVisible();
    await expect(page.getByText("旧结果员工")).toHaveCount(0);
    await expect(page.getByText("超级管理员")).toHaveCount(0);

    mode = "fresh";
    await page.getByRole("button", { name: "重新加载" }).click();
    await expect(page.getByText("新结果员工")).toBeVisible();
    await expect(page.getByText("旧结果员工")).toHaveCount(0);

    mode = "empty";
    await search.fill("无结果");
    await search.press("Enter");
    await expect(page.getByText("没有符合当前筛选条件的后台员工")).toBeVisible();
  });

  test("GoldPrice 分项显示失败，重试成功且空数据不伪造价格", async ({ page }) => {
    await authenticateAdmin(page);
    let mode: "partial" | "success" | "empty" = "partial";
    let releaseGold!: () => void;
    const goldGate = new Promise<void>((resolve) => {
      releaseGold = resolve;
    });

    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/api/auth/profile")) return route.fallback();
      if (!path.includes("/api/gold-price/")) {
        await fulfillJson(route, {});
        return;
      }
      if (mode === "partial") {
        await goldGate;
        if (path.endsWith("/history")) {
          await fulfillJson(route, []);
        } else {
          await fulfillJson(route, null, 503);
        }
        return;
      }
      if (mode === "empty") {
        if (path.endsWith("/automation-status")) {
          await fulfillJson(route, { autoFetchConfigured: true });
        } else {
          await fulfillJson(route, path.endsWith("/history") ? [] : null);
        }
        return;
      }
      if (path.endsWith("/latest")) {
        await fulfillJson(route, {
          id: 31,
          price: 520.88,
          change: 2.5,
          source: "MANUAL",
          recordDate: "2026-08-22T00:00:00.000Z",
        });
      } else if (path.endsWith("/history")) {
        await fulfillJson(route, [
          {
            id: 31,
            price: 520.88,
            change: 2.5,
            source: "MANUAL",
            recordDate: "2026-08-22T00:00:00.000Z",
          },
        ]);
      } else {
        await fulfillJson(route, { autoFetchConfigured: false });
      }
    });

    await page.goto("/admin/gold-price");
    await expect(page.getByText("正在加载金价数据…")).toBeVisible();
    releaseGold();

    await expect(page.getByText("当前金价加载失败", { exact: true })).toBeVisible();
    await expect(page.getByText("自动抓取配置状态加载失败", { exact: true })).toBeVisible();
    await expect(page.getByText("暂无金价历史")).toBeVisible();
    await expect(page.getByText("485", { exact: true })).toHaveCount(0);
    await expect(page.getByText("0.00", { exact: true })).toHaveCount(0);

    mode = "success";
    await page.getByRole("button", { name: "重新加载" }).first().click();
    await expect(page.getByText("520.88 元/克", { exact: true })).toBeVisible();
    await expect(page.getByText("自动抓取未配置，当前金价需手动维护")).toBeVisible();

    mode = "empty";
    await page.reload();
    await expect(page.getByText("尚未配置当前金价")).toBeVisible();
    await expect(page.getByText("暂无金价历史")).toBeVisible();
    await page.getByRole("button", { name: "手动调价" }).click();
    await expect(page.getByRole("spinbutton")).toHaveValue("");
  });
});

test.describe("后台经营底座第二批状态", () => {
  test("订单详情失败时保留抽屉并可就地重新加载", async ({ page }) => {
    await authenticateAdmin(page);
    let detailAttempts = 0;
    const order = {
      id: 501,
      orderNo: "HC-ORDER-501",
      customerName: "详情恢复测试客户",
      customerPhone: "13800000501",
      address: "测试地址",
      totalAmount: 12800,
      discountAmount: 0,
      finalAmount: 12800,
      paidAmount: 0,
      status: "PENDING_PAYMENT",
      orderType: "SPOT",
      deliveryStatus: "PENDING_SHIP",
      payments: [],
      items: [],
      createdAt: "2026-09-06T08:00:00.000Z",
    };

    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path.endsWith("/api/auth/profile")) return route.fallback();
      if (path.endsWith("/api/orders/501")) {
        detailAttempts += 1;
        if (detailAttempts === 1) return fulfillJson(route, null, 503);
        return fulfillJson(route, order);
      }
      if (path.endsWith("/api/orders")) {
        return fulfillJson(route, { list: [order], total: 1 });
      }
      await fulfillJson(route, {});
    });

    await page.goto("/admin/orders");
    await page.getByRole("row").filter({ hasText: "HC-ORDER-501" })
      .getByRole("button", { name: "详情" }).click();

    const drawer = page.getByRole("dialog", { name: "订单详情" });
    await expect(drawer.getByText("订单详情加载失败", { exact: true })).toBeVisible();
    await expect(drawer.getByText("HC-ORDER-501", { exact: true })).toHaveCount(0);
    await drawer.getByRole("button", { name: "重新加载" }).click();
    await expect(drawer.getByText("HC-ORDER-501", { exact: true }).first()).toBeVisible();
    expect(detailAttempts).toBe(2);
  });

  test("报价单详情失败时保留抽屉并可就地重新加载", async ({ page }) => {
    await authenticateAdmin(page);
    let detailAttempts = 0;
    const quotation = {
      id: 601,
      quoteNo: "HC-QUOTE-601",
      customerName: "报价恢复测试客户",
      customerPhone: "13800000601",
      status: "DRAFT",
      totalAmount: 16800,
      discountAmount: 800,
      finalAmount: 16000,
      depositAmount: 2000,
      items: [],
      createdAt: "2026-09-06T08:00:00.000Z",
    };

    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path.endsWith("/api/auth/profile")) return route.fallback();
      if (path.endsWith("/api/quotations/601")) {
        detailAttempts += 1;
        if (detailAttempts === 1) return fulfillJson(route, null, 503);
        return fulfillJson(route, quotation);
      }
      if (path.endsWith("/api/quotations")) {
        return fulfillJson(route, { list: [quotation], total: 1 });
      }
      await fulfillJson(route, {});
    });

    await page.goto("/admin/trade/quotations");
    await page.getByRole("row").filter({ hasText: "HC-QUOTE-601" })
      .getByRole("button", { name: "详情" }).click();

    const drawer = page.getByRole("dialog", { name: "报价单详情" });
    await expect(drawer.getByText("报价单详情加载失败", { exact: true })).toBeVisible();
    await drawer.getByRole("button", { name: "重新加载" }).click();
    await expect(drawer.getByText("HC-QUOTE-601", { exact: true }).first()).toBeVisible();
    expect(detailAttempts).toBe(2);
  });

  test("备份状态查询失败不伪造未挂载状态，重试后显示真实结果", async ({ page }) => {
    await authenticateAdmin(page);
    let attempts = 0;

    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/api/auth/profile")) return route.fallback();
      if (path.endsWith("/api/settings/backup")) {
        attempts += 1;
        if (attempts === 1) return fulfillJson(route, null, 503);
        return fulfillJson(route, {
          lastBackup: "2026-09-06T07:00:00.000Z",
          autoBackup: true,
          storageMounted: true,
          backupSchedule: "每 24 小时执行一次",
          totalBackups: 3,
          executionStatus: "SUCCESS",
          lastAttemptFinishedAt: "2026-09-06T07:05:00.000Z",
          lastExitCode: 0,
          message: "最近一次备份已完成。",
          latestFiles: [],
        });
      }
      await fulfillJson(route, {});
    });

    await page.goto("/admin/settings");
    await expect(page.getByText("备份状态加载失败", { exact: true })).toBeVisible();
    await expect(page.getByText("未挂载", { exact: true })).toHaveCount(0);
    await expect(page.getByText("自动备份", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "重新加载" }).click();
    await expect(page.getByText("数据库与媒体备份", { exact: true })).toBeVisible();
    await expect(page.getByText("已成功", { exact: true })).toBeVisible();
    await expect(page.getByText("已配置", { exact: true })).toBeVisible();
    expect(attempts).toBe(2);
  });

  test("未知备份执行状态安全降级而不让系统设置页崩溃", async ({ page }) => {
    await authenticateAdmin(page);

    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/api/auth/profile")) return route.fallback();
      if (path.endsWith("/api/settings/backup")) {
        return fulfillJson(route, {
          lastBackup: null,
          autoBackup: false,
          storageMounted: true,
          backupSchedule: null,
          totalBackups: 0,
          executionStatus: "UPSTREAM_NEW_STATUS",
          message: "上游返回了尚未识别的状态。",
          latestFiles: [],
        });
      }
      await fulfillJson(route, {});
    });

    await page.goto("/admin/settings");
    await expect(page.getByRole("heading", { name: "系统设置" })).toBeVisible();
    await expect(page.getByText("状态未知", { exact: true })).toHaveCount(2);
    await expect(page.getByText("上游返回了尚未识别的状态。", { exact: true })).toHaveCount(2);
  });

  test("商品批量操作部分失败后保留失败项选择", async ({ page }) => {
    await authenticateAdmin(page);
    const products = [
      {
        id: 701,
        code: "HC-PRODUCT-701",
        name: "批量成功商品",
        categoryId: 1,
        materialType: "GOLD",
        status: "DRAFT",
        price: 12800,
        totalStock: 1,
        salesCount: 0,
        images: [],
        skus: [],
        createdAt: "2026-09-06T08:00:00.000Z",
      },
      {
        id: 702,
        code: "HC-PRODUCT-702",
        name: "批量失败商品",
        categoryId: 1,
        materialType: "GOLD",
        status: "DRAFT",
        price: 16800,
        totalStock: 1,
        salesCount: 0,
        images: [],
        skus: [],
        createdAt: "2026-09-06T08:00:00.000Z",
      },
    ];

    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path.endsWith("/api/auth/profile")) return route.fallback();
      if (path.endsWith("/api/products/counts")) {
        return fulfillJson(route, { all: 2, DRAFT: 2, PUBLISHED: 0, OFFLINE: 0, ARCHIVED: 0 });
      }
      if (path.endsWith("/api/products/701/status") && request.method() === "PUT") {
        return fulfillJson(route, { id: 701, status: "PUBLISHED" });
      }
      if (path.endsWith("/api/products/702/status") && request.method() === "PUT") {
        return fulfillJson(route, null, 503);
      }
      if (path.endsWith("/api/products")) {
        return fulfillJson(route, { list: products, total: 2 });
      }
      if (path.endsWith("/api/categories/admin/tree")) {
        return fulfillJson(route, []);
      }
      await fulfillJson(route, {});
    });

    await page.goto("/admin/products");
    const successRow = page.getByRole("row").filter({ hasText: "批量成功商品" });
    const failedRow = page.getByRole("row").filter({ hasText: "批量失败商品" });
    await successRow.getByRole("checkbox").check();
    await failedRow.getByRole("checkbox").check();
    await page.getByRole("button", { name: "更多批量操作" }).click();
    await page.getByRole("menuitem", { name: "批量上架" }).click();

    await expect(page.getByText(/已完成 1 项，共 2 项；未完成项请检查后重试/)).toBeVisible();
    await expect(successRow.getByRole("checkbox")).not.toBeChecked();
    await expect(failedRow.getByRole("checkbox")).toBeChecked();
    await expect(page.getByText("已选 1 件", { exact: true })).toBeVisible();
  });

  test("390px 下高频运营页保留对象、主操作且不产生页面级横向滚动", async ({ page }) => {
    await authenticateAdmin(page);
    await page.setViewportSize({ width: 390, height: 844 });

    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/api/auth/profile")) return route.fallback();
      if (path.endsWith("/api/products/counts")) {
        return fulfillJson(route, { all: 0, DRAFT: 0, PUBLISHED: 0, OFFLINE: 0, ARCHIVED: 0 });
      }
      if (path.endsWith("/api/products")) {
        return fulfillJson(route, { list: [], total: 0 });
      }
      if (path.endsWith("/api/categories/admin/tree")) {
        return fulfillJson(route, []);
      }
      if (path.endsWith("/api/orders") || path.endsWith("/api/quotations")) {
        return fulfillJson(route, { list: [], total: 0 });
      }
      if (path.endsWith("/api/customers/admin")) {
        return fulfillJson(route, { list: [], total: 0 });
      }
      if (path.endsWith("/api/settings/backup")) {
        return fulfillJson(route, {
          lastBackup: null,
          autoBackup: false,
          storageMounted: false,
          backupSchedule: null,
          totalBackups: 0,
          executionStatus: "UNKNOWN",
          message: "本地环境未挂载备份目录。",
          latestFiles: [],
        });
      }
      await fulfillJson(route, {});
    });

    const pages = [
      { path: "/admin/products", heading: "商品管理", action: "新建商品" },
      { path: "/admin/orders", heading: "订单中心", action: "人工建单" },
      { path: "/admin/trade/quotations", heading: "报价管理", action: "新建报价" },
      { path: "/admin/customers", heading: "客户管理", action: "刷新" },
      { path: "/admin/settings", heading: "系统设置", action: "刷新备份状态" },
    ];

    for (const target of pages) {
      await page.goto(target.path);
      await expect(page.getByRole("heading", { name: target.heading })).toBeVisible();
      await expect(page.getByRole("button", { name: target.action })).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        `${target.path} 不应产生页面级横向滚动`,
      ).toBe(true);
    }

    await page.goto("/admin/products");
    const advanced = page.getByRole("button", { name: /展\s*开/ });
    await advanced.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: /收\s*起/ }))
      .toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#product-advanced-filters")).toBeVisible();
  });
});
