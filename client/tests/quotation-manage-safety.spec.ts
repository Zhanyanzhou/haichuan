import { expect, test, type Page, type Route } from "@playwright/test";
import { installAdminSession } from "./fixtures/session-auth";

type QuotationStatus =
  | "DRAFT"
  | "PENDING_CONFIRM"
  | "CONFIRMED"
  | "CONVERTED";

const quotations = [
  createQuotation(201, "HC-Q-DRAFT", "草稿客户", "DRAFT"),
  createQuotation(202, "HC-Q-PENDING", "待确认客户", "PENDING_CONFIRM"),
  createQuotation(203, "HC-Q-CONFIRMED", "历史已确认客户", "CONFIRMED"),
  {
    ...createQuotation(204, "HC-Q-CONVERTED", "历史已转单客户", "CONVERTED"),
    convertedOrderId: 304,
    convertedOrder: {
      id: 304,
      orderNo: "HC-ORDER-304",
      status: "PENDING_PAYMENT",
    },
  },
];

function createQuotation(
  id: number,
  quoteNo: string,
  customerName: string,
  status: QuotationStatus,
) {
  return {
    id,
    quoteNo,
    customerName,
    customerPhone: `13800000${id}`,
    customerEmail: `${id}@example.test`,
    status,
    totalAmount: 12800,
    discountAmount: 800,
    finalAmount: 12000,
    depositAmount: 2000,
    validUntil: "2026-09-30T00:00:00.000Z",
    createdAt: "2026-08-23T00:00:00.000Z",
    items: [
      {
        id: id * 10,
        productId: 1,
        skuId: 11,
        productName: "测试戒指",
        spec: "18K 金",
        quantity: 1,
        unitPrice: 12800,
        quotedPrice: 12000,
        subtotal: 12000,
        sku: { id: 11, skuCode: "HC-SKU-11" },
      },
    ],
    salesConsultant: {
      id: 9,
      realName: "测试顾问",
      username: "quotation-test",
    },
  };
}

async function authenticateAdmin(page: Page) {
  await installAdminSession(page, {
    username: "quotation-safety-admin",
    realName: "报价安全测试管理员",
    role: "ADMIN",
  });
}

async function mockQuotationApis(page: Page) {
  const dangerousRequests: string[] = [];

  await page.route("**/api/**", async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/auth/profile") return route.fallback();

    if (/\/quotations\/\d+\/(confirm|convert)$/.test(path)) {
      dangerousRequests.push(`${request.method()} ${path}`);
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ code: 500, data: null, message: "dangerous request" }),
      });
      return;
    }

    if (request.method() === "GET" && path.endsWith("/quotations")) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          code: 200,
          data: {
            list: quotations,
            total: quotations.length,
            page: 1,
            pageSize: 20,
          },
          message: "ok",
        }),
      });
      return;
    }

    const detailMatch = path.match(/\/quotations\/(\d+)$/);
    if (request.method() === "GET" && detailMatch) {
      const quotation = quotations.find(
        ({ id }) => id === Number(detailMatch[1]),
      );
      await route.fulfill({
        status: quotation ? 200 : 404,
        contentType: "application/json",
        body: JSON.stringify({
          code: quotation ? 200 : 404,
          data: quotation ?? null,
          message: quotation ? "ok" : "not found",
        }),
      });
      return;
    }

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ code: 200, data: {}, message: "ok" }),
    });
  });

  return dangerousRequests;
}

function rowFor(page: Page, quoteNo: string) {
  return page.getByRole("row").filter({ hasText: quoteNo });
}

async function openDetail(page: Page, quoteNo: string) {
  await rowFor(page, quoteNo).getByRole("button", { name: "详情" }).click();
  const dialog = page.getByRole("dialog", { name: "报价单详情" });
  await expect(dialog).toContainText(quoteNo);
  return dialog;
}

async function closeDetail(page: Page) {
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog", { name: "报价单详情" })).toHaveCount(0);
}

async function fulfillJson(route: Route, data: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify({ code: status, data, message: status < 400 ? "ok" : "failed" }),
  });
}

async function fillNewQuotation(page: Page) {
  await page.getByRole("button", { name: "新建报价" }).click();
  const dialog = page.getByRole("dialog", { name: "新建报价" });
  const customerSearch = dialog.locator(".ant-select-selection-search-input").first();
  await customerSearch.fill("恢复客户");
  await page.getByText("恢复客户 · 13800000007", { exact: true }).click();
  await dialog.getByPlaceholder("商品名称").fill("结果待确认戒指");
  await dialog.getByPlaceholder("原价").fill("12800");
  await dialog.getByPlaceholder("报价").fill("12000");
  return dialog;
}

test("报价列表与详情不提供员工确认或转单入口，历史状态仍只读展示", async ({
  page,
}) => {
  await authenticateAdmin(page);
  const dangerousRequests = await mockQuotationApis(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/admin/trade/quotations");

  await expect(rowFor(page, "HC-Q-PENDING")).toContainText("待客户确认");
  await expect(rowFor(page, "HC-Q-CONFIRMED")).toContainText("已确认");
  await expect(rowFor(page, "HC-Q-CONVERTED")).toContainText("已转订单");
  await expect(rowFor(page, "HC-Q-PENDING")).toContainText(
    "员工不能代确认或转单；请等待客户操作",
  );
  await expect(rowFor(page, "HC-Q-CONFIRMED")).toContainText(
    "历史版本只读；员工不能代转单",
  );
  await expect(page.getByRole("button", { name: "客户已确认" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /转(为)?订单/ })).toHaveCount(0);

  const draftDialog = await openDetail(page, "HC-Q-DRAFT");
  await expect(
    draftDialog.getByRole("button", { name: "发出报价" }),
  ).toBeVisible();
  await closeDetail(page);

  const pendingDialog = await openDetail(page, "HC-Q-PENDING");
  await expect(pendingDialog.getByText("客户确认与转单暂不可由员工操作")).toBeVisible();
  await expect(pendingDialog.getByText(/报价只能由所属客户在账户中心确认/)).toBeVisible();
  await expect(pendingDialog.getByRole("button", { name: "创建修订版" })).toBeVisible();
  await expect(pendingDialog.getByRole("button", { name: "取消报价" })).toBeVisible();
  await expect(pendingDialog.getByRole("button", { name: "客户已确认" })).toHaveCount(0);
  await expect(pendingDialog.getByRole("button", { name: /转(为)?订单/ })).toHaveCount(0);
  await closeDetail(page);

  const confirmedDialog = await openDetail(page, "HC-Q-CONFIRMED");
  await expect(confirmedDialog.getByText("客户确认与转单暂不可由员工操作")).toBeVisible();
  await expect(confirmedDialog.getByRole("button", { name: "取消报价" })).toHaveCount(0);
  await expect(confirmedDialog.getByRole("button", { name: "客户已确认" })).toHaveCount(0);
  await expect(confirmedDialog.getByRole("button", { name: /转(为)?订单/ })).toHaveCount(0);
  await closeDetail(page);

  const convertedDialog = await openDetail(page, "HC-Q-CONVERTED");
  await expect(convertedDialog.getByText("HC-ORDER-304", { exact: true })).toBeVisible();
  await expect(convertedDialog.getByRole("button", { name: /转(为)?订单/ })).toHaveCount(0);
  expect(dangerousRequests).toEqual([]);
});

test("修订已创建但权威回读失败时只允许 GET 恢复且不会重复修订", async ({
  page,
}) => {
  await authenticateAdmin(page);
  const pending = createQuotation(
    202,
    "HC-Q-REVISION-RECOVERY",
    "修订恢复客户",
    "PENDING_CONFIRM",
  );
  const revised = { ...pending, status: "DRAFT" as const };
  let revisionPosts = 0;
  let listReads = 0;
  let detailReads = 0;
  let failReadsAfterWrite = false;
  let failedListRead = false;
  let failedDetailRead = false;

  await page.route("**/api/**", async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/auth/profile") return route.fallback();

    if (request.method() === "POST" && path === "/api/quotations/202/revisions") {
      revisionPosts += 1;
      failReadsAfterWrite = true;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ code: 200, data: revised, message: "ok" }),
      });
    }

    if (request.method() === "GET" && path === "/api/quotations") {
      listReads += 1;
      if (failReadsAfterWrite && !failedListRead) {
        failedListRead = true;
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ code: 503, data: null, message: "列表回读暂时失败" }),
        });
      }
      const item = revisionPosts ? revised : pending;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          code: 200,
          data: { list: [item], total: 1, page: 1, pageSize: 20 },
          message: "ok",
        }),
      });
    }

    if (request.method() === "GET" && path === "/api/quotations/202") {
      detailReads += 1;
      if (failReadsAfterWrite && !failedDetailRead) {
        failedDetailRead = true;
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ code: 503, data: null, message: "详情回读暂时失败" }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          code: 200,
          data: revisionPosts ? revised : pending,
          message: "ok",
        }),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ code: 200, data: {}, message: "ok" }),
    });
  });

  await page.goto("/admin/trade/quotations");
  const detailDialog = await openDetail(page, "HC-Q-REVISION-RECOVERY");
  await detailDialog.getByRole("button", { name: "创建修订版" }).click();
  const confirmDialog = page.getByRole("dialog", { name: /修订报价/ });
  await confirmDialog.getByRole("button", { name: "创建修订版" }).click();

  await expect(
    page.getByText("修订草稿已创建，权威状态待确认", { exact: true }),
  ).toBeVisible();
  await expect(detailDialog.getByRole("button", { name: "创建修订版" })).toHaveCount(0);
  await expect(detailDialog.getByRole("button", { name: "发出报价" })).toHaveCount(0);
  await expect(detailDialog.getByRole("button", { name: "删除报价单" })).toHaveCount(0);
  expect(revisionPosts).toBe(1);
  expect(listReads).toBe(2);
  expect(detailReads).toBe(2);

  await expect(confirmDialog).toHaveCount(0);
  await detailDialog.getByRole("button", { name: "重新读取报价" }).click();
  await expect(
    page.getByText("修订草稿已创建，权威状态待确认", { exact: true }),
  ).toHaveCount(0);
  await expect(detailDialog.getByRole("button", { name: "发出报价" })).toBeVisible();
  await expect(rowFor(page, "HC-Q-REVISION-RECOVERY")).toContainText("草稿");
  await expect(detailDialog.getByText("草稿", { exact: true })).toBeVisible();
  await expect(detailDialog.getByRole("button", { name: "创建修订版" })).toHaveCount(0);
  expect(revisionPosts).toBe(1);
  expect(listReads).toBe(3);
  expect(detailReads).toBe(3);
});

test("首次报价创建响应丢失后显式重试复用同一幂等键且不产生第二张草稿", async ({
  page,
}) => {
  await authenticateAdmin(page);
  const idempotencyKeys: string[] = [];
  const requestBodies: unknown[] = [];
  let postAttempts = 0;
  let logicalCreates = 0;
  let committed = false;
  const created = createQuotation(901, "HC-Q-RECOVERED", "恢复客户", "DRAFT");

  await page.route("**/api/**", async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/auth/profile") return route.fallback();
    if (request.method() === "GET" && path === "/api/quotations") {
      return fulfillJson(route, {
        list: committed ? [created] : [],
        total: committed ? 1 : 0,
        page: 1,
        pageSize: 20,
      });
    }
    if (request.method() === "GET" && path === "/api/quotations/issue-customers") {
      return fulfillJson(route, {
        list: [{
          id: 7,
          name: "恢复客户",
          phone: "13800000007",
          email: "recover@example.test",
          accountType: "MEMBER",
          partnerStatus: "NONE",
          status: "ACTIVE",
        }],
      });
    }
    if (request.method() === "GET" && path === "/api/users/assignable") {
      return fulfillJson(route, []);
    }
    if (request.method() === "POST" && path === "/api/quotations") {
      postAttempts += 1;
      idempotencyKeys.push(request.headers()["idempotency-key"] ?? "");
      requestBodies.push(request.postDataJSON());
      if (!committed) {
        committed = true;
        logicalCreates += 1;
      }
      if (postAttempts === 1) return route.abort("failed");
      return fulfillJson(route, created);
    }
    return fulfillJson(route, {});
  });

  await page.goto("/admin/trade/quotations");
  const dialog = await fillNewQuotation(page);
  await dialog.getByRole("button", { name: "创建草稿" }).click();

  await expect(
    dialog.getByText("存在结果待确认的报价草稿", { exact: true }),
  ).toBeVisible();
  expect(postAttempts).toBe(1);

  await dialog.getByRole("button", { name: "创建草稿" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(rowFor(page, "HC-Q-RECOVERED")).toBeVisible();

  expect(postAttempts).toBe(2);
  expect(logicalCreates).toBe(1);
  expect(idempotencyKeys[0]).toMatch(/^quotation-create-/);
  expect(idempotencyKeys[1]).toBe(idempotencyKeys[0]);
  expect(requestBodies[1]).toEqual(requestBodies[0]);
  await expect.poll(() => page.evaluate(() => (
    sessionStorage.getItem("hc:quotation-create-attempt:1")
  ))).toBeNull();
});

test("待确认报价内容变化或浏览器存储失败时均保持零新增 POST", async ({
  page,
}) => {
  await authenticateAdmin(page);
  let postAttempts = 0;

  await page.route("**/api/**", async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/auth/profile") return route.fallback();
    if (request.method() === "GET" && path === "/api/quotations") {
      return fulfillJson(route, { list: [], total: 0, page: 1, pageSize: 20 });
    }
    if (request.method() === "GET" && path === "/api/quotations/issue-customers") {
      return fulfillJson(route, {
        list: [{
          id: 7,
          name: "恢复客户",
          phone: "13800000007",
          email: "recover@example.test",
          accountType: "MEMBER",
          partnerStatus: "NONE",
          status: "ACTIVE",
        }],
      });
    }
    if (request.method() === "GET" && path === "/api/users/assignable") {
      return fulfillJson(route, []);
    }
    if (request.method() === "POST" && path === "/api/quotations") {
      postAttempts += 1;
      return route.abort("failed");
    }
    return fulfillJson(route, {});
  });

  await page.goto("/admin/trade/quotations");
  const dialog = await fillNewQuotation(page);
  await dialog.getByRole("button", { name: "创建草稿" }).click();
  await expect(
    dialog.getByText("存在结果待确认的报价草稿", { exact: true }),
  ).toBeVisible();
  expect(postAttempts).toBe(1);

  await dialog.getByLabel("备注（选填）").fill("已经变更的创建意图");
  await dialog.getByRole("button", { name: "创建草稿" }).click();
  await expect(
    dialog.getByText("存在另一张结果待确认的报价草稿", { exact: true }),
  ).toBeVisible();
  expect(postAttempts).toBe(1);

  await dialog.getByRole("button", { name: "放弃旧凭据" }).click();
  const abandonDialog = page.getByRole("dialog", { name: "放弃旧的报价创建凭据" });
  await abandonDialog.getByRole("button", { name: "确认放弃凭据" }).click();
  await expect(abandonDialog).toHaveCount(0);

  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("storage blocked", "QuotaExceededError");
    };
  });
  await dialog.getByRole("button", { name: "创建草稿" }).click();
  await expect(page.getByText(/浏览器无法安全保存本次报价创建的重试凭据/)).toBeVisible();
  expect(postAttempts).toBe(1);
});
