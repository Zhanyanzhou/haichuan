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
    fulfillments: [
      {
        id: 201,
        fulfillmentNo: "FUL-PENDING-101",
        status: "PENDING_SHIP",
        carrier: null,
        trackingNo: null,
      },
    ],
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
    depositAmount: 10000,
    paidAmount: 10000,
    refundedAmount: 0,
    status: "PENDING_SHIP",
    orderType: "CUSTOM",
    customStage: "NEED_CONFIRM",
    deliveryStatus: "NONE",
    internalNote: "仅用于权限测试",
    items: [],
    createdAt: "2026-08-22T03:00:00.000Z",
  },
  {
    id: 107,
    orderNo: "HC-UNPAID-DEPOSIT",
    customerName: "未付定金客户",
    customerPhone: "13800000007",
    address: "测试地址七",
    totalAmount: 30000,
    discountAmount: 0,
    finalAmount: 30000,
    depositAmount: 10000,
    paidAmount: 0,
    refundedAmount: 0,
    status: "PENDING_PAYMENT",
    orderType: "CUSTOM",
    customStage: "PENDING_DEPOSIT",
    deliveryStatus: "NONE",
    items: [],
    createdAt: "2026-08-22T07:00:00.000Z",
  },
  {
    id: 108,
    orderNo: "HC-DISPUTED-CUSTOM",
    customerName: "争议中定制客户",
    customerPhone: "13800000008",
    address: "测试地址八",
    totalAmount: 36000,
    discountAmount: 0,
    finalAmount: 36000,
    depositAmount: 10000,
    paidAmount: 36000,
    refundedAmount: 0,
    status: "PENDING_SHIP",
    orderType: "CUSTOM",
    customStage: "BALANCE_PAID",
    deliveryStatus: "NONE",
    refunds: [{
      id: 308,
      refundNo: "RF-DISPUTED-CUSTOM",
      orderId: 108,
      amount: 1000,
      status: "PROCESSING",
      createdAt: "2026-08-22T08:00:00.000Z",
    }],
    afterSalesCases: [],
    items: [],
    createdAt: "2026-08-22T08:00:00.000Z",
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
  {
    id: 106,
    orderNo: "HC-CANCELLED-CUSTOM",
    customerName: "已取消定制客户",
    customerPhone: "13800000006",
    address: "测试地址六",
    totalAmount: 32000,
    discountAmount: 0,
    finalAmount: 32000,
    paidAmount: 0,
    status: "CANCELLED",
    orderType: "CUSTOM",
    customStage: "DESIGN_CONFIRM",
    deliveryStatus: "NONE",
    items: [],
    createdAt: "2026-08-22T06:00:00.000Z",
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

async function mockOrderApis(
  page: Page,
  options: {
    rejectMultiPackageShip?: boolean;
    customStageCommitThenFail?: boolean;
    terminalWritesCommitThenFail?: boolean;
    completionUnconfirmed?: "not-committed" | "unknown";
    detailOperationsCommitThenFail?: boolean;
    detailOperationUnconfirmed?: "not-committed" | "unknown";
    shipCommitThenFail?: boolean;
    shipUnconfirmed?: "not-committed" | "unknown";
    adminCreateCommitThenFail?: boolean;
    delayedShipFailure?: {
      gate: Promise<void>;
      onCompleted?: () => void;
    };
    delayedDetail?: {
      orderId: number;
      gate: Promise<void>;
      onCompleted?: () => void;
    };
  } = {},
) {
  const prohibitedRequests: string[] = [];
  let customStage = orders.find(({ id }) => id === 103)?.customStage;
  const orderOverrides: Record<number, Record<string, unknown>> = {};
  let completionVerificationShouldFail = false;
  let detailOperationVerificationShouldFail = false;
  let shipVerificationShouldFail = false;
  let adminCreateRequestCount = 0;

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
      options.adminCreateCommitThenFail
      && request.method() === "POST"
      && path.endsWith("/orders")
    ) {
      adminCreateRequestCount += 1;
      if (adminCreateRequestCount === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ statusCode: 503, message: "response lost after commit" }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          code: 200,
          data: { id: 901, orderNo: "HC-ADMIN-IDEMPOTENT" },
          message: "ok",
        }),
      });
      return;
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

    if (
      options.delayedShipFailure
      && request.method() === "PUT"
      && path.endsWith("/orders/101/ship")
    ) {
      await options.delayedShipFailure.gate;
      options.delayedShipFailure.onCompleted?.();
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ statusCode: 503, message: "delayed response lost" }),
      });
      return;
    }

    if (
      (options.shipCommitThenFail || options.shipUnconfirmed)
      && request.method() === "PUT"
      && path.endsWith("/orders/101/ship")
    ) {
      if (options.shipCommitThenFail) {
        const body = request.postDataJSON() as {
          logisticsCompany: string;
          logisticsNo: string;
        };
        orderOverrides[101] = {
          status: "SHIPPED",
          deliveryStatus: "SHIPPED",
          fulfillments: [
            {
              id: 201,
              fulfillmentNo: "FUL-PENDING-101",
              status: "SHIPPED",
              carrier: body.logisticsCompany.trim(),
              trackingNo: body.logisticsNo.trim(),
            },
          ],
        };
      }
      shipVerificationShouldFail = options.shipUnconfirmed === "unknown";
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ statusCode: 503, message: "response lost" }),
      });
      return;
    }

    if (
      options.customStageCommitThenFail &&
      request.method() === "PUT" &&
      path.endsWith("/orders/103/custom-stage")
    ) {
      customStage = (request.postDataJSON() as { stage: string }).stage;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ statusCode: 503, message: "response lost" }),
      });
      return;
    }

    if (
      options.completionUnconfirmed
      && request.method() === "PUT"
      && path.endsWith("/orders/104/status")
    ) {
      completionVerificationShouldFail = options.completionUnconfirmed === "unknown";
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ statusCode: 503, message: "response lost" }),
      });
      return;
    }

    if (
      options.detailOperationsCommitThenFail
      && request.method() === "PUT"
      && /\/orders\/100\/(amount|address|note|consultant)$/.test(path)
    ) {
      const operation = path.split("/").at(-1);
      const body = request.postDataJSON() as Record<string, unknown>;
      if (operation === "amount") {
        for (const field of [
          "discountAmount",
          "adjustmentAmount",
          "finalAmount",
          "depositAmount",
          "balanceAmount",
        ]) {
          if (body[field] !== undefined) {
            orderOverrides[100] = { ...orderOverrides[100], [field]: body[field] };
          }
        }
      } else if (operation === "address") {
        orderOverrides[100] = { ...orderOverrides[100], address: String(body.address).trim() };
      } else if (operation === "note") {
        const normalized = typeof body.internalNote === "string" ? body.internalNote.trim() : "";
        orderOverrides[100] = { ...orderOverrides[100], internalNote: normalized || null };
      } else if (operation === "consultant") {
        orderOverrides[100] = {
          ...orderOverrides[100],
          salesConsultantId: body.salesConsultantId ?? null,
        };
      }
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ statusCode: 503, message: "response lost" }),
      });
      return;
    }

    if (
      options.detailOperationUnconfirmed
      && request.method() === "PUT"
      && path.endsWith("/orders/100/note")
    ) {
      detailOperationVerificationShouldFail = options.detailOperationUnconfirmed === "unknown";
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ statusCode: 503, message: "response lost" }),
      });
      return;
    }

    if (options.terminalWritesCommitThenFail && request.method() === "PUT") {
      const statusMatch = path.match(/\/orders\/(100|104)\/status$/);
      const receiveMatch = path.match(/\/orders\/(102)\/receive$/);
      if (statusMatch) {
        const orderId = Number(statusMatch[1]);
        const targetStatus = (request.postDataJSON() as { status: string }).status;
        if (
          (orderId === 100 && targetStatus === "CANCELLED")
          || (orderId === 104 && targetStatus === "COMPLETED")
        ) {
          orderOverrides[orderId] = { status: targetStatus };
          await route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ statusCode: 503, message: "response lost" }),
          });
          return;
        }
      }
      if (receiveMatch) {
        orderOverrides[102] = {
          deliveryStatus: "RECEIVED",
          fulfillments: [{ id: 202, status: "DELIVERED" }],
        };
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ statusCode: 503, message: "response lost" }),
        });
        return;
      }
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

    if (request.method() === "GET" && path.endsWith("/products")) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          code: 200,
          data: {
            list: [{ id: 501, name: "幂等测试戒指", code: "IDEMPOTENT-RING" }],
            total: 1,
          },
          message: "ok",
        }),
      });
      return;
    }

    if (request.method() === "GET" && path.endsWith("/products/501/skus")) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          code: 200,
          data: [{ id: 601, skuCode: "IDEMPOTENT-RING-01", price: 8800 }],
          message: "ok",
        }),
      });
      return;
    }

    if (request.method() === "GET" && path.endsWith("/marketing/coupons/usable")) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ code: 200, data: [], message: "ok" }),
      });
      return;
    }

    if (request.method() === "GET" && path.endsWith("/users/assignable")) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          code: 200,
          data: [{ id: 9, name: "顾问九", role: "SALES_CONSULTANT" }],
          message: "ok",
        }),
      });
      return;
    }

    const detailMatch = path.match(/\/orders\/(\d+)$/);
    if (request.method() === "GET" && detailMatch) {
      const orderId = Number(detailMatch[1]);
      if (orderId === 104 && completionVerificationShouldFail) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ statusCode: 503, message: "verification unavailable" }),
        });
        return;
      }
      if (orderId === 100 && detailOperationVerificationShouldFail) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ statusCode: 503, message: "verification unavailable" }),
        });
        return;
      }
      if (orderId === 101 && shipVerificationShouldFail) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ statusCode: 503, message: "verification unavailable" }),
        });
        return;
      }
      if (options.delayedDetail?.orderId === orderId) {
        await options.delayedDetail.gate;
        options.delayedDetail.onCompleted?.();
      }
      const fixture = orders.find(({ id }) => id === orderId);
      const order = fixture
        ? {
            ...fixture,
            ...(orderOverrides[orderId] ?? {}),
            ...(orderId === 103 ? { customStage } : {}),
          }
        : undefined;
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

async function fillAdminOrderCreateDialog(page: Page, address: string) {
  const dialog = page.getByRole("dialog", { name: "人工建单" });
  await dialog.getByLabel("客户姓名").fill("幂等测试客户");
  await dialog.getByLabel("手机号").fill("13800000999");
  await dialog.getByLabel("收货地址").fill(address);
  const itemSelects = dialog
    .locator(".ant-form-item")
    .filter({ hasText: "商品明细" })
    .getByRole("combobox");
  await itemSelects.nth(0).click();
  await page
    .locator(".ant-select-dropdown:visible .ant-select-item-option-content")
    .filter({ hasText: "幂等测试戒指" })
    .click();
  await itemSelects.nth(1).click();
  await page
    .locator(".ant-select-dropdown:visible .ant-select-item-option-content")
    .filter({ hasText: "IDEMPOTENT-RING-01" })
    .click();
  return dialog;
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
      rowFor(page, "HC-CUSTOM").getByRole("button", { name: "发货" }),
    ).toHaveCount(0);
    await expect(rowFor(page, "HC-CUSTOM")).toContainText("需求确认");
    await expect(rowFor(page, "HC-CUSTOM")).toContainText("未到交付阶段");
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
    await customDialog.getByRole("button", { name: "推进定制阶段" }).click();
    const stageDialog = page.getByRole("dialog", { name: "推进定制阶段" });
    await stageDialog.getByRole("combobox").click();
    const visibleStageOptions = page.locator(
      ".ant-select-dropdown:visible .ant-select-item-option-content",
    );
    for (const unavailableStage of ["已付定金", "尾款完成", "已交付", "已完成", "需求确认"]) {
      await expect(visibleStageOptions.filter({ hasText: unavailableStage })).toHaveCount(0);
    }
    await page.keyboard.press("Escape");
    await stageDialog.getByRole("button", { name: "Close" }).click();
    await expect(stageDialog).toHaveCount(0);
    await closeDetail(page);

    const unpaidCustomDialog = await openDetail(page, "HC-UNPAID-DEPOSIT");
    await unpaidCustomDialog.getByRole("button", { name: "推进定制阶段" }).click();
    const unpaidStageDialog = page.getByRole("dialog", { name: "推进定制阶段" });
    await expect(unpaidStageDialog.getByRole("note")).toContainText("尚未达到约定定金");
    await unpaidStageDialog.getByRole("combobox").click();
    const unpaidStageOptions = page.locator(
      ".ant-select-dropdown:visible .ant-select-item-option-content",
    );
    for (const unavailableStage of ["设计确认", "制作中", "质检完成", "待付尾款", "待交付"]) {
      await expect(unpaidStageOptions.filter({ hasText: unavailableStage })).toHaveCount(0);
    }
    await unpaidStageDialog.getByRole("button", { name: "Close" }).click();
    await expect(unpaidStageDialog).toHaveCount(0);
    await closeDetail(page);

    const disputedCustomDialog = await openDetail(page, "HC-DISPUTED-CUSTOM");
    await disputedCustomDialog.getByRole("button", { name: "推进定制阶段" }).click();
    const disputedStageDialog = page.getByRole("dialog", { name: "推进定制阶段" });
    await expect(disputedStageDialog.getByRole("note")).toContainText("处理中的退款或售后");
    await disputedStageDialog.getByRole("combobox").click();
    const disputedStageOptions = page.locator(
      ".ant-select-dropdown:visible .ant-select-item-option-content",
    );
    await expect(disputedStageOptions.filter({ hasText: /^待交付$/ })).toHaveCount(0);
    await disputedStageDialog.getByRole("button", { name: "Close" }).click();
    await expect(disputedStageDialog).toHaveCount(0);
    await closeDetail(page);

    const cancelledCustomDialog = await openDetail(page, "HC-CANCELLED-CUSTOM");
    await expect(
      cancelledCustomDialog.getByRole("button", { name: "推进定制阶段" }),
    ).toHaveCount(0);
    await closeDetail(page);

    const shippedDialog = await openDetail(page, "HC-SHIPPED");
    await expect(
      shippedDialog.getByRole("button", { name: "确认签收" }),
    ).toBeVisible();
    expect(prohibitedRequests).toEqual([]);
    expect(antdConsoleProblems).toEqual([]);
  });

  test("人工建单响应丢失后保留并复用同一凭据，改动内容时零 POST", async ({ page }) => {
    await authenticate(page, "ADMIN");
    const createRequests: Array<{ key: string | undefined; body: unknown }> = [];
    page.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      if (request.method() === "POST" && path.endsWith("/api/orders")) {
        createRequests.push({
          key: request.headers()["idempotency-key"],
          body: request.postDataJSON(),
        });
      }
    });
    await mockOrderApis(page, { adminCreateCommitThenFail: true });
    await page.goto("/admin/orders");

    await page.getByRole("button", { name: "人工建单" }).click();
    const dialog = await fillAdminOrderCreateDialog(page, "深圳市测试路 1 号");
    await dialog.getByRole("button", { name: "创建订单" }).click();

    await expect(page.getByText("订单创建结果待确认")).toBeVisible();
    await expect(dialog.getByText("存在结果待确认的人工建单")).toBeVisible();
    expect(createRequests).toHaveLength(1);
    expect(createRequests[0].key).toMatch(/^admin-order-create-/);

    await dialog.getByLabel("收货地址").fill("深圳市测试路 2 号");
    await dialog.getByRole("button", { name: "创建订单" }).click();
    await expect(dialog.getByText("存在另一笔结果待确认的人工建单")).toBeVisible();
    expect(createRequests).toHaveLength(1);

    await dialog.getByLabel("收货地址").fill("深圳市测试路 1 号");
    await dialog.getByRole("button", { name: "创建订单" }).click();
    await expect(page.getByText("订单已创建")).toBeVisible();
    await expect(dialog).toHaveCount(0);
    expect(createRequests).toHaveLength(2);
    expect(createRequests[1].key).toBe(createRequests[0].key);
    expect(createRequests[1].body).toEqual(createRequests[0].body);
  });

  test("人工建单无法持久化安全凭据时不发送 POST", async ({ page }) => {
    await page.addInitScript(() => {
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function setItem(key: string, value: string) {
        if (key.startsWith("hc:admin-order-create-attempt:")) {
          throw new DOMException("storage unavailable", "QuotaExceededError");
        }
        return originalSetItem.call(this, key, value);
      };
    });
    await authenticate(page, "ADMIN");
    const createRequests: string[] = [];
    page.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      if (request.method() === "POST" && path.endsWith("/api/orders")) {
        createRequests.push(path);
      }
    });
    await mockOrderApis(page);
    await page.goto("/admin/orders");

    await page.getByRole("button", { name: "人工建单" }).click();
    const dialog = await fillAdminOrderCreateDialog(page, "深圳市测试路 3 号");
    await dialog.getByRole("button", { name: "创建订单" }).click();

    await expect(page.getByText("浏览器无法安全保存本次建单的重试凭据")).toBeVisible();
    expect(createRequests).toEqual([]);
    await expect(dialog).toBeVisible();
  });

  test("定制阶段写入响应丢失后以权威 GET 收敛且不重复 PUT", async ({ page }) => {
    await authenticate(page, "ADMIN");
    const requests = await mockOrderApis(page, { customStageCommitThenFail: true });
    await page.goto("/admin/orders");

    const customDialog = await openDetail(page, "HC-CUSTOM");
    await customDialog.getByRole("button", { name: "推进定制阶段" }).click();
    const stageDialog = page.getByRole("dialog", { name: "推进定制阶段" });
    await stageDialog.getByRole("combobox").click();
    await page
      .locator(".ant-select-dropdown:visible .ant-select-item-option-content")
      .filter({ hasText: /^设计确认$/ })
      .click();
    await stageDialog.getByRole("button", { name: /提\s*交/ }).click();

    await expect(page.getByText("定制阶段已写入并完成权威核验")).toBeVisible();
    await expect(stageDialog).toHaveCount(0);
    await expect(customDialog).toContainText("设计确认");
    expect(requests.filter((entry) => entry === "PUT /api/orders/103/custom-stage")).toHaveLength(1);
  });

  test("发货响应丢失后按单包裹物流事实核验且不重复 PUT", async ({ page }) => {
    await authenticate(page, "ADMIN");
    const requests = await mockOrderApis(page, { shipCommitThenFail: true });
    await page.goto("/admin/orders");

    await rowFor(page, "HC-PENDING-SHIP").getByRole("button", { name: "发货" }).click();
    const shipDialog = page.getByRole("dialog", { name: "登记发货物流" });
    const carrierSelect = shipDialog.getByLabel("物流公司");
    await carrierSelect.click();
    await carrierSelect.press("Enter");
    await shipDialog.getByLabel("物流单号").fill("SF-RECOVERY-101");
    await shipDialog.getByRole("button", { name: "确认发货" }).click();

    await expect(page.getByText("发货信息已写入并完成权威核验")).toBeVisible();
    await expect(shipDialog).toHaveCount(0);
    expect(requests.filter((entry) => entry === "PUT /api/orders/101/ship")).toHaveLength(1);
  });

  for (const scenario of [
    {
      mode: "not-committed" as const,
      expected: "权威订单仍明确处于待发货，本次登记确定未生效；当前物流信息已保留，可安全重试。",
    },
    {
      mode: "unknown" as const,
      expected: "发货登记结果待确认，当前物流信息已保留；请先核对订单详情或履约中心，暂不要重复操作。",
    },
  ]) {
    test(`发货响应丢失后区分 ${scenario.mode} 并保留物流输入`, async ({ page }) => {
      await authenticate(page, "ADMIN");
      const requests = await mockOrderApis(page, { shipUnconfirmed: scenario.mode });
      await page.goto("/admin/orders");

      await rowFor(page, "HC-PENDING-SHIP").getByRole("button", { name: "发货" }).click();
      const shipDialog = page.getByRole("dialog", { name: "登记发货物流" });
      const carrierSelect = shipDialog.getByLabel("物流公司");
      await carrierSelect.click();
      await carrierSelect.press("Enter");
      await shipDialog.getByLabel("物流单号").fill("SF-RETAIN-101");
      await shipDialog.getByRole("button", { name: "确认发货" }).click();

      await expect(page.getByText(scenario.expected)).toBeVisible();
      await expect(shipDialog).toBeVisible();
      await expect(shipDialog.getByLabel("物流单号")).toHaveValue("SF-RETAIN-101");
      expect(requests.filter((entry) => entry === "PUT /api/orders/101/ship")).toHaveLength(1);
    });
  }

  test("关闭 A 后打开 B 时迟到的发货失败不会污染当前表单", async ({ page }) => {
    let releaseShip!: () => void;
    let delayedShipCompleted = false;
    const shipGate = new Promise<void>((resolve) => {
      releaseShip = resolve;
    });

    await authenticate(page, "ADMIN");
    const requests = await mockOrderApis(page, {
      delayedShipFailure: {
        gate: shipGate,
        onCompleted: () => {
          delayedShipCompleted = true;
        },
      },
    });
    await page.goto("/admin/orders");

    await rowFor(page, "HC-PENDING-SHIP").getByRole("button", { name: "发货" }).click();
    const firstShipDialog = page.getByRole("dialog", { name: "登记发货物流" });
    const carrierSelect = firstShipDialog.getByLabel("物流公司");
    await carrierSelect.click();
    await carrierSelect.press("Enter");
    await firstShipDialog.getByLabel("物流单号").fill("SF-DELAYED-101");
    await firstShipDialog.getByRole("button", { name: "确认发货" }).click();
    await firstShipDialog.getByRole("button", { name: "Close" }).click();

    await rowFor(page, "HC-MULTI-PENDING-SHIP").getByRole("button", { name: "发货" }).click();
    const currentShipDialog = page.getByRole("dialog", { name: "登记发货物流" });
    await expect(currentShipDialog).toContainText("HC-MULTI-PENDING-SHIP");

    releaseShip();
    await expect.poll(() => delayedShipCompleted).toBe(true);
    await expect(currentShipDialog).toContainText("HC-MULTI-PENDING-SHIP");
    await expect(page.getByText("发货登记结果待确认")).toHaveCount(0);
    expect(requests.filter((entry) => entry === "PUT /api/orders/101/ship")).toHaveLength(1);
  });

  test("金额、地址、备注与顾问响应丢失后按目标字段核验且不重复 PUT", async ({ page }) => {
    await authenticate(page, "ADMIN");
    const requests = await mockOrderApis(page, { detailOperationsCommitThenFail: true });
    await page.goto("/admin/orders");

    const detailDialog = await openDetail(page, "HC-PENDING-PAYMENT");

    await detailDialog.getByRole("button", { name: "修改金额" }).click();
    const amountDialog = page.getByRole("dialog", { name: "修改金额" });
    await amountDialog.getByLabel("应收金额").fill("7900");
    await amountDialog.getByLabel("调整原因").fill("线下议价确认");
    await amountDialog.getByRole("button", { name: /提\s*交/ }).click();
    await expect(page.getByText("订单金额已写入并完成权威核验")).toBeVisible();
    await expect(amountDialog).toHaveCount(0);

    await detailDialog.getByRole("button", { name: "修改地址" }).click();
    const addressDialog = page.getByRole("dialog", { name: "修改地址" });
    await addressDialog.getByLabel("收货地址").fill("  新测试地址  ");
    await addressDialog.getByRole("button", { name: /提\s*交/ }).click();
    await expect(page.getByText("收货地址已写入并完成权威核验")).toBeVisible();
    await expect(addressDialog).toHaveCount(0);

    await detailDialog.getByRole("button", { name: "修改备注" }).click();
    const noteDialog = page.getByRole("dialog", { name: "修改备注" });
    await noteDialog.getByLabel("内部备注").fill("  已电话确认  ");
    await noteDialog.getByRole("button", { name: /提\s*交/ }).click();
    await expect(page.getByText("内部备注已写入并完成权威核验")).toBeVisible();
    await expect(noteDialog).toHaveCount(0);

    await detailDialog.getByRole("button", { name: "修改顾问" }).click();
    const consultantDialog = page.getByRole("dialog", { name: "修改顾问" });
    await consultantDialog.getByRole("combobox").click();
    await page.locator(".ant-select-dropdown:visible .ant-select-item-option-content")
      .filter({ hasText: "顾问九" })
      .click();
    await consultantDialog.getByRole("button", { name: /提\s*交/ }).click();
    await expect(page.getByText("销售顾问已写入并完成权威核验")).toBeVisible();
    await expect(consultantDialog).toHaveCount(0);

    for (const operation of ["amount", "address", "note", "consultant"]) {
      expect(requests.filter((entry) => entry === `PUT /api/orders/100/${operation}`)).toHaveLength(1);
    }
  });

  for (const scenario of [
    {
      mode: "not-committed" as const,
      expected: "权威订单仍未匹配本次修改，本次操作确定未生效，当前输入已保留，可安全重试。",
    },
    {
      mode: "unknown" as const,
      expected: "订单修改结果待确认，当前输入已保留；请先重新加载详情，暂不要重复操作。",
    },
  ]) {
    test(`详情修改响应丢失后区分 ${scenario.mode} 并保留输入`, async ({ page }) => {
      await authenticate(page, "ADMIN");
      const requests = await mockOrderApis(page, { detailOperationUnconfirmed: scenario.mode });
      await page.goto("/admin/orders");

      const detailDialog = await openDetail(page, "HC-PENDING-PAYMENT");
      await detailDialog.getByRole("button", { name: "修改备注" }).click();
      const noteDialog = page.getByRole("dialog", { name: "修改备注" });
      await noteDialog.getByLabel("内部备注").fill("需要保留的备注");
      await noteDialog.getByRole("button", { name: /提\s*交/ }).click();

      await expect(page.getByText(scenario.expected)).toBeVisible();
      await expect(noteDialog).toBeVisible();
      await expect(noteDialog.getByLabel("内部备注")).toHaveValue("需要保留的备注");
      expect(requests.filter((entry) => entry === "PUT /api/orders/100/note")).toHaveLength(1);
    });
  }

  test("完成、取消与签收响应丢失后只读权威订单且不重复写入", async ({ page }) => {
    await authenticate(page, "ADMIN");
    const requests = await mockOrderApis(page, { terminalWritesCommitThenFail: true });
    await page.goto("/admin/orders");

    await rowFor(page, "HC-RECEIVED").getByRole("button", { name: /完\s*成/ }).click();
    await page.getByRole("dialog", { name: "确认完成该订单？" })
      .getByRole("button", { name: "确认完成" })
      .click();
    await expect(page.getByText("订单已完成并完成权威核验")).toBeVisible();

    await rowFor(page, "HC-PENDING-PAYMENT")
      .getByRole("button", { name: /取\s*消/ })
      .click();
    const cancelDialog = page.getByRole("dialog", { name: /取消订单“HC-PENDING-PAYMENT”/ });
    await cancelDialog.getByLabel("取消原因").fill("客户线下取消");
    await cancelDialog.getByRole("button", { name: "确认取消" }).click();
    await expect(page.getByText("订单已取消并完成权威核验")).toBeVisible();
    await expect(cancelDialog).toHaveCount(0);

    const shippedDialog = await openDetail(page, "HC-SHIPPED");
    await shippedDialog.getByRole("button", { name: "确认签收" }).click();
    await page.getByRole("dialog", { name: "确认签收？" })
      .getByRole("button", { name: "确认签收" })
      .click();
    await expect(page.getByText("订单已签收并完成权威核验")).toBeVisible();
    await expect(shippedDialog).toContainText("已送达");
    await expect(shippedDialog.getByRole("button", { name: "确认签收" })).toHaveCount(0);

    expect(requests.filter((entry) => entry === "PUT /api/orders/104/status")).toHaveLength(1);
    expect(requests.filter((entry) => entry === "PUT /api/orders/100/status")).toHaveLength(1);
    expect(requests.filter((entry) => entry === "PUT /api/orders/102/receive")).toHaveLength(1);
  });

  for (const scenario of [
    {
      mode: "not-committed" as const,
      expected: "权威订单仍未完成，本次操作确定未生效，可安全重试。",
    },
    {
      mode: "unknown" as const,
      expected: "订单完成结果待确认，请先重新加载核对，暂不要重复操作。",
    },
  ]) {
    test(`完成响应丢失后区分 ${scenario.mode} 且不自动重放`, async ({ page }) => {
      await authenticate(page, "ADMIN");
      const requests = await mockOrderApis(page, { completionUnconfirmed: scenario.mode });
      await page.goto("/admin/orders");

      await rowFor(page, "HC-RECEIVED").getByRole("button", { name: /完\s*成/ }).click();
      await page.getByRole("dialog", { name: "确认完成该订单？" })
        .getByRole("button", { name: "确认完成" })
        .click();

      await expect(page.getByText(scenario.expected)).toBeVisible();
      expect(requests.filter((entry) => entry === "PUT /api/orders/104/status")).toHaveLength(1);
    });
  }

  test("关闭 A 后打开 B 时迟到的 A 详情不会覆盖当前订单", async ({ page }) => {
    let releaseFirstDetail!: () => void;
    let firstDetailCompleted = false;
    const firstDetailGate = new Promise<void>((resolve) => {
      releaseFirstDetail = resolve;
    });

    await authenticate(page, "ADMIN");
    await mockOrderApis(page, {
      delayedDetail: {
        orderId: 100,
        gate: firstDetailGate,
        onCompleted: () => {
          firstDetailCompleted = true;
        },
      },
    });
    await page.goto("/admin/orders");

    const firstDetailRequest = page.waitForRequest((request) =>
      request.method() === "GET" && new URL(request.url()).pathname.endsWith("/orders/100"),
    );
    await rowFor(page, "HC-PENDING-PAYMENT")
      .getByRole("button", { name: "详情" })
      .click();
    await firstDetailRequest;
    await closeDetail(page);

    const currentDialog = await openDetail(page, "HC-PENDING-SHIP");
    await expect(currentDialog).toContainText("待发货客户");
    await expect(currentDialog).toContainText("13800000001");

    releaseFirstDetail();
    await expect.poll(() => firstDetailCompleted).toBe(true);
    await expect(currentDialog).toContainText("HC-PENDING-SHIP");
    await expect(currentDialog).toContainText("待发货客户");
    await expect(currentDialog).toContainText("13800000001");
    await expect(currentDialog).not.toContainText("HC-PENDING-PAYMENT");
    await expect(currentDialog).not.toContainText("待付款客户");
    await expect(currentDialog).not.toContainText("13800000000");
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
