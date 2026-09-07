import { expect, test, type Page, type Route } from "@playwright/test";

type TestedRole = "ADMIN" | "WAREHOUSE" | "CUSTOMER_SERVICE";

const orders = [
  {
    id: 100,
    orderNo: "HC-PENDING-PAYMENT",
    customerName: "待付款客户",
    customerPhone: "13800000000",
    address: "测试地址零",
    totalAmount: 8000,
    discountAmount: 0,
    finalAmount: 8000,
    paidAmount: 0,
    status: "PENDING_PAYMENT",
    orderType: "SPOT",
    deliveryStatus: "PENDING_SHIP",
    payments: [],
    items: [],
    createdAt: "2026-08-22T00:30:00.000Z",
  },
  {
    id: 101,
    orderNo: "HC-PENDING-SHIP",
    customerName: "待发货客户",
    customerPhone: "13800000001",
    address: "测试地址一",
    totalAmount: 12000,
    discountAmount: 0,
    finalAmount: 12000,
    paidAmount: 12000,
    status: "PENDING_SHIP",
    orderType: "SPOT",
    deliveryStatus: "PENDING_SHIP",
    items: [],
    createdAt: "2026-08-22T01:00:00.000Z",
  },
  {
    id: 102,
    orderNo: "HC-SHIPPED",
    customerName: "已发货客户",
    customerPhone: "13800000002",
    address: "测试地址二",
    totalAmount: 18000,
    discountAmount: 1000,
    finalAmount: 17000,
    paidAmount: 17000,
    status: "SHIPPED",
    orderType: "SPOT",
    deliveryStatus: "SHIPPED",
    logisticsCompany: "顺丰速运",
    logisticsNo: "SF-TEST-102",
    fulfillments: [{ id: 202, status: "SHIPPED" }],
    items: [],
    createdAt: "2026-08-22T02:00:00.000Z",
  },
  {
    id: 103,
    orderNo: "HC-CUSTOM",
    customerName: "定制客户",
    customerPhone: "13800000003",
    address: "测试地址三",
    totalAmount: 36000,
    discountAmount: 0,
    finalAmount: 36000,
    paidAmount: 10000,
    status: "PENDING_SHIP",
    orderType: "CUSTOM",
    customStage: "NEED_CONFIRM",
    deliveryStatus: "PENDING_SHIP",
    internalNote: "仅用于权限测试",
    items: [],
    createdAt: "2026-08-22T03:00:00.000Z",
  },
  {
    id: 104,
    orderNo: "HC-RECEIVED",
    customerName: "已签收客户",
    customerPhone: "13800000004",
    address: "测试地址四",
    totalAmount: 22000,
    discountAmount: 0,
    finalAmount: 22000,
    paidAmount: 22000,
    status: "SHIPPED",
    orderType: "SPOT",
    deliveryStatus: "RECEIVED",
    fulfillments: [{ id: 204, status: "DELIVERED" }],
    items: [],
    createdAt: "2026-08-22T04:00:00.000Z",
  },
  {
    id: 105,
    orderNo: "HC-MULTI-PENDING-SHIP",
    customerName: "多包裹客户",
    customerPhone: "13800000005",
    address: "测试地址五",
    totalAmount: 28000,
    discountAmount: 0,
    finalAmount: 28000,
    paidAmount: 28000,
    status: "PENDING_SHIP",
    orderType: "SPOT",
    deliveryStatus: "PENDING_SHIP",
    fulfillments: [
      { id: 205, status: "PENDING_SHIP" },
      { id: 206, status: "PENDING_SHIP" },
    ],
    items: [],
    createdAt: "2026-08-22T05:00:00.000Z",
  },
] as const;

async function authenticate(page: Page, role: TestedRole) {
  await page.route("**/api/auth/profile", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        code: 200,
        message: "ok",
        data: {
          id: 1,
          username: `capability-${role.toLowerCase()}`,
          realName: "权限矩阵测试用户",
          role,
          status: "ACTIVE",
          createdAt: "2026-08-22T00:00:00.000Z",
        },
      }),
    }),
  );
}

async function mockOrderApis(page: Page, options: { rejectMultiPackageShip?: boolean } = {}) {
  const prohibitedRequests: string[] = [];

  await page.route("**/api/**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (request.method() === "GET" && path.endsWith("/auth/profile")) {
      await route.fallback();
      return;
    }
    const isMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(
      request.method(),
    );

    if (isMutation || path.endsWith("/orders/export")) {
      prohibitedRequests.push(`${request.method()} ${path}`);
    }

    if (
      options.rejectMultiPackageShip &&
      request.method() === "PUT" &&
      path.endsWith("/orders/105/ship")
    ) {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          statusCode: 409,
          message: "多包裹订单请前往履约中心逐包发货",
          error: "Conflict",
        }),
      });
      return;
    }

    if (request.method() === "GET" && path.endsWith("/orders")) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          code: 200,
          data: { list: orders, total: orders.length },
          message: "ok",
        }),
      });
      return;
    }

    const detailMatch = path.match(/\/orders\/(\d+)$/);
    if (request.method() === "GET" && detailMatch) {
      const order = orders.find(({ id }) => id === Number(detailMatch[1]));
      await route.fulfill({
        status: order ? 200 : 404,
        contentType: "application/json",
        body: JSON.stringify({
          code: order ? 200 : 404,
          data: order ?? null,
          message: order ? "ok" : "not found",
        }),
      });
      return;
    }

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ code: 200, data: {}, message: "ok" }),
    });
  });

  return prohibitedRequests;
}

function rowFor(page: Page, orderNo: string) {
  return page.getByRole("row").filter({ hasText: orderNo });
}

async function openDetail(page: Page, orderNo: string) {
  await rowFor(page, orderNo).getByRole("button", { name: "详情" }).click();
  const dialog = page.getByRole("dialog", { name: "订单详情" });
  await expect(dialog).toContainText(orderNo);
  return dialog;
}

async function closeDetail(page: Page) {
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog", { name: "订单详情" })).toHaveCount(0);
}

test.describe("订单管理前端 capability 矩阵", () => {
  test("ADMIN 可见全部既有管理员操作", async ({ page }) => {
    const antdConsoleProblems: string[] = [];
    page.on("console", (entry) => {
      const text = entry.text();
      if (/Static function can not consume context|destroyOnClose.*deprecated/i.test(text)) {
        antdConsoleProblems.push(text);
      }
    });
    await authenticate(page, "ADMIN");
    const prohibitedRequests = await mockOrderApis(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/admin/orders");

    await expect(page.getByRole("button", { name: "导出" })).toBeVisible();
    await expect(page.getByRole("button", { name: "人工建单" })).toBeVisible();
    await expect(
      rowFor(page, "HC-PENDING-SHIP").getByRole("button", { name: "发货" }),
    ).toBeVisible();
    await expect(
      rowFor(page, "HC-PENDING-SHIP").getByRole("button", { name: /取\s*消/ }),
    ).toHaveCount(0);
    await expect(
      rowFor(page, "HC-SHIPPED").getByRole("button", { name: /完\s*成/ }),
    ).toHaveCount(0);
    await expect(
      rowFor(page, "HC-PENDING-PAYMENT").getByRole("button", { name: /取\s*消/ }),
    ).toBeVisible();
    await expect(
      rowFor(page, "HC-RECEIVED").getByRole("button", { name: /完\s*成/ }),
    ).toBeVisible();
    await rowFor(page, "HC-RECEIVED").getByRole("button", { name: /完\s*成/ }).click();
    const completeConfirm = page.getByRole("dialog", { name: "确认完成该订单？" });
    await expect(completeConfirm).toBeVisible();
    await completeConfirm.getByRole("button", { name: /取\s*消/ }).click();

    const pendingPaymentDialog = await openDetail(page, "HC-PENDING-PAYMENT");
    for (const action of [
      "修改金额",
      "修改地址",
      "修改备注",
      "修改顾问",
    ]) {
      await expect(pendingPaymentDialog.getByRole("button", { name: action })).toBeVisible();
    }
    await closeDetail(page);

    const customDialog = await openDetail(page, "HC-CUSTOM");
    await expect(customDialog.getByRole("button", { name: "修改金额" })).toHaveCount(0);
    for (const action of ["修改地址", "修改备注", "修改顾问", "推进定制阶段"]) {
      await expect(customDialog.getByRole("button", { name: action })).toBeVisible();
    }
    await closeDetail(page);

    const shippedDialog = await openDetail(page, "HC-SHIPPED");
    await expect(
      shippedDialog.getByRole("button", { name: "确认签收" }),
    ).toBeVisible();
    expect(prohibitedRequests).toEqual([]);
    expect(antdConsoleProblems).toEqual([]);
  });

  test("多包裹发货冲突保留表单并引导至履约中心", async ({ page }) => {
    await authenticate(page, "ADMIN");
    const requests = await mockOrderApis(page, { rejectMultiPackageShip: true });
    await page.goto("/admin/orders");

    await rowFor(page, "HC-MULTI-PENDING-SHIP")
      .getByRole("button", { name: "发货" })
      .click();
    const shipDialog = page.getByRole("dialog", { name: "登记发货物流" });
    const carrierSelect = shipDialog.getByLabel("物流公司");
    await carrierSelect.click();
    await carrierSelect.press("Enter");
    await shipDialog.getByLabel("物流单号").fill("SF-MULTI-105");
    await shipDialog.getByRole("button", { name: "确认发货" }).click();

    const guide = page.getByRole("dialog", { name: "多包裹订单请逐包发货" });
    await expect(guide).toBeVisible();
    await guide.getByRole("button", { name: "留在当前页面" }).click();
    await expect(shipDialog).toBeVisible();
    await expect(shipDialog).toContainText("顺丰速运");
    await expect(shipDialog.getByLabel("物流单号")).toHaveValue("SF-MULTI-105");
    expect(requests).toContain("PUT /api/orders/105/ship");
  });

  test("多包裹发货冲突可从引导弹窗进入履约中心真实路由", async ({ page }) => {
    await authenticate(page, "ADMIN");
    await mockOrderApis(page, { rejectMultiPackageShip: true });
    await page.goto("/admin/orders");

    await rowFor(page, "HC-MULTI-PENDING-SHIP")
      .getByRole("button", { name: "发货" })
      .click();
    const shipDialog = page.getByRole("dialog", { name: "登记发货物流" });
    const carrierSelect = shipDialog.getByLabel("物流公司");
    await carrierSelect.click();
    await carrierSelect.press("Enter");
    await shipDialog.getByLabel("物流单号").fill("SF-MULTI-ROUTE-105");
    await shipDialog.getByRole("button", { name: "确认发货" }).click();

    const guide = page.getByRole("dialog", { name: "多包裹订单请逐包发货" });
    await guide.getByRole("button", { name: "前往履约中心" }).click();
    await expect(page).toHaveURL(/\/admin\/trade\/fulfillment$/);
    expect(new URL(page.url()).pathname).toBe("/admin/trade/fulfillment");
  });

  test("WAREHOUSE 不能进入订单中心或读取通用订单投影", async ({ page }) => {
    await authenticate(page, "WAREHOUSE");
    const prohibitedRequests = await mockOrderApis(page);
    const orderReadRequests: string[] = [];
    page.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      if (request.method() === "GET" && /\/api\/orders(?:\/|$)/.test(path)) {
        orderReadRequests.push(path);
      }
    });
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/admin/orders");

    await expect(page.getByText("抱歉，您没有访问此页面的权限")).toBeVisible();
    await expect(page.getByRole("button", { name: "导出" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "人工建单" })).toHaveCount(0);
    await expect(page.getByText("HC-PENDING-SHIP")).toHaveCount(0);
    expect(orderReadRequests).toEqual([]);
    expect(prohibitedRequests).toEqual([]);
  });

  test("CUSTOMER_SERVICE 仅可见内部备注修改", async ({ page }) => {
    await authenticate(page, "CUSTOMER_SERVICE");
    const prohibitedRequests = await mockOrderApis(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/admin/orders");

    await expect(page.getByRole("button", { name: "导出" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "人工建单" })).toHaveCount(0);
    for (const orderNo of [
      "HC-PENDING-PAYMENT",
      "HC-PENDING-SHIP",
      "HC-SHIPPED",
      "HC-CUSTOM",
      "HC-RECEIVED",
    ]) {
      const row = rowFor(page, orderNo);
      await expect(row.getByRole("button", { name: "发货" })).toHaveCount(0);
      await expect(row.getByRole("button", { name: /完\s*成/ })).toHaveCount(0);
      await expect(row.getByRole("button", { name: /取\s*消/ })).toHaveCount(0);
    }

    const customDialog = await openDetail(page, "HC-CUSTOM");
    await expect(
      customDialog.getByRole("button", { name: "修改备注" }),
    ).toBeVisible();
    for (const action of [
      "修改金额",
      "修改地址",
      "修改顾问",
      "推进定制阶段",
      "确认签收",
    ]) {
      await expect(customDialog.getByRole("button", { name: action })).toHaveCount(0);
    }
    expect(prohibitedRequests).toEqual([]);
  });
});
