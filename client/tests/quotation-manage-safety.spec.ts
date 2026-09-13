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
