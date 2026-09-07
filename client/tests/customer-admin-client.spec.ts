import { expect, test, type Page, type Request, type Route } from "@playwright/test";
import { installAdminSession } from "./fixtures/session-auth";

const customer = {
  id: 42,
  phone: "13800000000",
  name: "客户档案合同样本",
  email: "customer-contract@example.test",
  status: "ACTIVE",
  accountType: "MEMBER",
  partnerStatus: "NONE",
  lastOrderAt: "2026-08-20T08:00:00.000Z",
  createdAt: "2026-08-01T08:00:00.000Z",
  _count: { orders: 1, favorites: 1, inquiries: 2 },
};

const detail = {
  customer: {
    ...customer,
    updatedAt: "2026-08-20T09:00:00.000Z",
    _count: { inquiries: 2, selectionInquiries: 1, reviews: 1 },
  },
  stats: {
    orderCount: 1,
    totalSpent: "12800",
    totalPaid: "12800",
    totalRefunded: "0",
  },
  recentOrders: [
    {
      id: 9,
      orderNo: "ORD-CUSTOMER-42",
      status: "COMPLETED",
      orderType: "SPOT",
      finalAmount: "12800",
      paidAmount: "12800",
      createdAt: "2026-08-18T08:00:00.000Z",
      shippedAt: "2026-08-19T08:00:00.000Z",
    },
  ],
  favorites: [
    {
      createdAt: "2026-08-10T08:00:00.000Z",
      product: {
        id: 8,
        name: "客户档案收藏合同作品",
        status: "PUBLISHED",
        deletedAt: null,
      },
    },
  ],
  addressCount: 1,
};

async function authenticateCustomerService(page: Page) {
  await installAdminSession(page, {
    username: "customer-service-test",
    realName: "客户服务合同测试员",
    role: "CUSTOMER_SERVICE",
  });
}

async function fulfill(route: Route, data: unknown) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ code: 200, data, message: "ok" }),
  });
}

async function fail(route: Route, message: string) {
  await route.fulfill({
    status: 500,
    contentType: "application/json",
    body: JSON.stringify({ code: 500, message }),
  });
}

function isCustomerAdminRequest(request: Request, suffix: string) {
  return new URL(request.url()).pathname.endsWith(suffix);
}

test("客户档案只读页沿用员工 Cookie 会话，并保留筛选与详情合同", async ({ page }) => {
  await authenticateCustomerService(page);
  const listRequests: Request[] = [];
  const detailRequests: Request[] = [];

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/auth/profile")) return route.fallback();
    if (path.endsWith("/customers/admin/42")) {
      detailRequests.push(request);
      return fulfill(route, detail);
    }
    if (path.endsWith("/customers/admin")) {
      listRequests.push(request);
      return fulfill(route, { list: [customer], total: 1 });
    }
    if (path.endsWith("/settings/flags")) {
      return fulfill(route, {
        commerceEnabled: false,
        cartEnabled: false,
        paymentEnabled: false,
      });
    }
    return fulfill(route, {});
  });

  await page.goto("/admin/customers");
  await expect(page.getByRole("heading", { name: "客户管理" })).toBeVisible();
  await expect(page.getByText("客户档案合同样本", { exact: true })).toBeVisible();
  expect(listRequests[0].headers().authorization).toBeUndefined();
  expect(new URL(listRequests[0].url()).searchParams.get("page")).toBe("1");
  expect(new URL(listRequests[0].url()).searchParams.get("pageSize")).toBe("20");

  await page
    .getByPlaceholder("搜索手机号 / 姓名 / 邮箱（回车应用）")
    .fill("合同样本");
  await page
    .getByPlaceholder("搜索手机号 / 姓名 / 邮箱（回车应用）")
    .press("Enter");
  await expect.poll(() => listRequests.some((request) =>
    new URL(request.url()).searchParams.get("keyword") === "合同样本",
  )).toBe(true);

  await page.getByText("已停用", { exact: true }).click();
  await expect.poll(() => listRequests.some((request) => {
    const url = new URL(request.url());
    return url.searchParams.get("keyword") === "合同样本" &&
      url.searchParams.get("status") === "DISABLED";
  })).toBe(true);

  await page.getByRole("button", { name: "查看档案" }).click();
  await expect.poll(() => detailRequests.length).toBe(1);
  expect(detailRequests[0].headers().authorization).toBeUndefined();
  expect(isCustomerAdminRequest(detailRequests[0], "/customers/admin/42")).toBe(true);
  const drawer = page.getByRole("dialog", { name: "客户档案 #42" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText("ORD-CUSTOMER-42", { exact: true })).toBeVisible();
  await expect(drawer.getByText("客户档案收藏合同作品", { exact: true })).toBeVisible();
});

test("客户档案列表失败只显示安全本地文案并保留重试入口", async ({ page }) => {
  await authenticateCustomerService(page);
  const internalMessage = "Prisma P2022 column customer_secret does not exist";

  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/profile")) return route.fallback();
    if (path.endsWith("/customers/admin")) return fail(route, internalMessage);
    if (path.endsWith("/settings/flags")) {
      return fulfill(route, {
        commerceEnabled: false,
        cartEnabled: false,
        paymentEnabled: false,
      });
    }
    return fulfill(route, {});
  });

  await page.goto("/admin/customers");
  await expect(page.getByText("客户档案加载失败，请稍后重新加载。", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "重新加载" })).toBeVisible();
  await expect(page.getByText(internalMessage, { exact: true })).toHaveCount(0);
});

test("客户档案详情失败不暴露服务端异常并可就地重试", async ({ page }) => {
  await authenticateCustomerService(page);
  const internalMessage = "database stack at customers.service.ts:608";

  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/profile")) return route.fallback();
    if (path.endsWith("/customers/admin/42")) return fail(route, internalMessage);
    if (path.endsWith("/customers/admin")) {
      return fulfill(route, { list: [customer], total: 1 });
    }
    if (path.endsWith("/settings/flags")) {
      return fulfill(route, {
        commerceEnabled: false,
        cartEnabled: false,
        paymentEnabled: false,
      });
    }
    return fulfill(route, {});
  });

  await page.goto("/admin/customers");
  await page.getByRole("button", { name: "查看档案" }).click();
  const drawer = page.getByRole("dialog", { name: "客户档案 #" });
  await expect(drawer.getByText("客户详情加载失败，请稍后重新加载。", { exact: true })).toBeVisible();
  await expect(drawer.getByRole("button", { name: "重新加载" })).toBeVisible();
  await expect(page.getByText(internalMessage, { exact: true })).toHaveCount(0);
});
