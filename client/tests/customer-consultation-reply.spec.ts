import { expect, test, type Page, type Request, type Route } from "@playwright/test";
import { installCustomerSession, readSessionHeaders } from "./fixtures/session-auth";

function apiResponse(data: unknown) {
  return JSON.stringify({ code: 200, data, message: "success" });
}

async function fulfill(route: Route, data: unknown) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: apiResponse(data),
  });
}

function requestContract(request: Request) {
  return {
    path: new URL(request.url()).pathname,
    method: request.method(),
    ...readSessionHeaders(request),
  };
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  )).toBe(true);
}

test.describe("客户咨询回复闭环", () => {
  test("客户在 390px 从通知定位不在第一页的预约咨询", async ({ page }) => {
    const protectedRequests: ReturnType<typeof requestContract>[] = [];
    const inquiryPages: string[] = [];

    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      document.cookie = "hc_csrf=consultation-csrf; path=/";
    });
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path.startsWith("/api/customers/me/")) {
        protectedRequests.push(requestContract(request));
      }

      if (path === "/api/customers/me/inquiries") {
        inquiryPages.push(new URL(request.url()).searchParams.get("page") || "1");
        return fulfill(route, {
          list: [{
            id: 11,
            leadId: 43,
            status: "PENDING",
            message: "第一页的其他预约。",
            consultationType: "新咨询",
            product: { name: "其他作品" },
            createdAt: "2026-09-07T10:00:00.000Z",
            updatedAt: "2026-09-07T10:00:00.000Z",
            reply: null,
          }],
          total: 4,
          page: 1,
          pageSize: 3,
        });
      }
      if (path === "/api/customers/me/consultations/41") {
        return fulfill(route, {
          leadId: 41,
          sourceId: 11,
          type: "inquiry",
          status: "CONTACTED",
          message: "想了解蓝宝石戒指的改圈与交付时间。",
          consultationType: "到店预约",
          preferredContact: "phone",
          preferredTime: "周六下午",
          budgetRange: "20000-30000",
          product: { name: "蓝宝石钻戒" },
          items: [],
          createdAt: "2026-09-06T08:00:00.000Z",
          updatedAt: "2026-09-07T08:00:00.000Z",
          reply: {
            id: 501,
            content: "可以为您预留周六下午的鉴赏时段，改圈需先现场测量。",
            createdAt: "2026-09-07T08:00:00.000Z",
          },
        });
      }
      if (path === "/api/customers/me/selection-inquiries") {
        return fulfill(route, [{
          id: 12,
          leadId: 42,
          status: "FOLLOWING",
          message: "请比较两件作品的日常佩戴感。",
          items: [
            { productNameSnapshot: "祖母绿项链" },
            { productNameSnapshot: "沙弗莱吊坠" },
          ],
          createdAt: "2026-09-05T08:00:00.000Z",
          updatedAt: "2026-09-07T09:00:00.000Z",
          reply: {
            id: 502,
            content: "祖母绿项链存在感更强，沙弗莱吊坠更适合日常叠戴。",
            createdAt: "2026-09-07T09:00:00.000Z",
          },
        }]);
      }
      if (path === "/api/customers/me/notifications") {
        return fulfill(route, {
          list: [{
            id: 91,
            type: "SERVICE_CONSULTATION_REPLIED",
            locale: "ZH_CN",
            title: "您的咨询已有新回复",
            body: "顾问已回复您的咨询，请在客户中心查看。",
            actionUrl: "/customer?section=consultations&leadId=41",
            status: "AVAILABLE",
            availableAt: "2026-09-07T08:00:00.000Z",
            createdAt: "2026-09-07T08:00:00.000Z",
          }],
          total: 1,
          unreadCount: 1,
          page: 1,
          pageSize: 20,
        });
      }
      if (path === "/api/customers/me/notifications/91/read") {
        return fulfill(route, { id: 91, status: "READ" });
      }
      if (path === "/api/settings/flags") {
        return fulfill(route, {
          commerceEnabled: false,
          cartEnabled: false,
          paymentEnabled: false,
          partnerApplicationsWriteEnabled: false,
        });
      }
      if (path === "/api/partner-applications/me") return fulfill(route, null);
      return fulfill(route, []);
    });
    await installCustomerSession(page, { id: 7, name: "咨询测试会员" });

    await page.goto("/customer");
    await expect(page.getByRole("heading", { name: "我的账号" })).toBeVisible();

    const selection = page.getByRole("heading", { name: "祖母绿项链" })
      .locator("xpath=ancestor::article");
    await selection.getByText("查看详情", { exact: true }).click();
    await expect(selection.getByText("请比较两件作品的日常佩戴感。")).toBeVisible();
    await expect(selection.getByText("祖母绿项链、沙弗莱吊坠")).toBeVisible();

    await page.getByRole("link", { name: "查看咨询详情 →" }).click();
    await expect(page).toHaveURL(/section=consultations&leadId=41/);
    const focusedDetail = page.getByRole("region", { name: "咨询详情" });
    await expect(focusedDetail.getByRole("heading", { name: "蓝宝石钻戒" })).toBeVisible();
    await expect(focusedDetail.getByText("想了解蓝宝石戒指的改圈与交付时间。")).toBeVisible();
    await expect(focusedDetail.getByText("可以为您预留周六下午的鉴赏时段，改圈需先现场测量。")).toBeVisible();
    await expect(focusedDetail.getByText(/^海川顾问 ·/)).toBeVisible();

    await expectNoHorizontalOverflow(page);
    expect(inquiryPages).not.toContain("2");
    expect(protectedRequests).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: "/api/customers/me/inquiries",
        method: "GET",
        authorization: undefined,
        sessionDomain: "customer",
      }),
      expect.objectContaining({
        path: "/api/customers/me/consultations/41",
        method: "GET",
        authorization: undefined,
        sessionDomain: "customer",
      }),
      expect.objectContaining({
        path: "/api/customers/me/notifications/91/read",
        method: "PUT",
        authorization: undefined,
        csrf: "consultation-csrf",
        sessionDomain: "customer",
      }),
    ]));
  });

  test("刷新直达第四条选款咨询，列表翻页后仍可访问历史记录", async ({ page }) => {
    const selections = [1, 2, 3, 4].map((index) => ({
      id: 20 + index,
      leadId: 41 + index,
      status: index === 4 ? "FOLLOWING" : "PENDING",
      message: `选款需求 ${index}`,
      items: [{ productNameSnapshot: index === 4 ? "第四件历史作品" : `选款作品 ${index}` }],
      createdAt: `2026-09-0${7 - index}T08:00:00.000Z`,
      updatedAt: "2026-09-07T09:00:00.000Z",
      reply: null,
    }));

    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/customers/me/selection-inquiries") {
        return fulfill(route, selections);
      }
      if (path === "/api/customers/me/consultations/45") {
        return fulfill(route, {
          leadId: 45,
          sourceId: 24,
          type: "selection",
          status: "FOLLOWING",
          message: "选款需求 4",
          items: [{ productNameSnapshot: "第四件历史作品" }],
          product: null,
          createdAt: "2026-09-03T08:00:00.000Z",
          updatedAt: "2026-09-07T09:00:00.000Z",
          reply: {
            id: 505,
            content: "第四件作品已为您保留，可到店试戴。",
            createdAt: "2026-09-07T09:00:00.000Z",
          },
        });
      }
      if (path === "/api/customers/me/inquiries") {
        return fulfill(route, { list: [], total: 0, page: 1, pageSize: 3 });
      }
      if (path === "/api/customers/me/notifications") {
        return fulfill(route, { list: [], total: 0, unreadCount: 0, page: 1, pageSize: 20 });
      }
      if (path === "/api/settings/flags") {
        return fulfill(route, { commerceEnabled: false, cartEnabled: false, paymentEnabled: false });
      }
      if (path === "/api/partner-applications/me") return fulfill(route, null);
      return fulfill(route, []);
    });
    await installCustomerSession(page, { id: 10, name: "历史选款会员" });

    await page.goto("/customer?section=consultations&leadId=45");
    const focusedDetail = page.getByRole("region", { name: "咨询详情" });
    await expect(focusedDetail.getByRole("heading", { name: "第四件历史作品" })).toBeVisible();
    await expect(focusedDetail.getByText("第四件作品已为您保留，可到店试戴。")).toBeVisible();
    await expect(page.locator("#my-selections").getByRole("heading", { name: "第四件历史作品" })).toHaveCount(0);

    const pagination = page.getByRole("navigation", { name: "选款咨询分页" });
    await pagination.getByTitle("2").click();
    await expect(page).toHaveURL(/\/customer$/);
    await expect(focusedDetail).toHaveCount(0);
    await expect(page.locator("#my-selections").getByRole("heading", { name: "第四件历史作品" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe("my-selections");
  });

  test("定向详情失败可原链接重试，他人或不存在记录统一显示 404", async ({ page }) => {
    let attempts = 0;
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/customers/me/consultations/88") {
        attempts += 1;
        if (attempts === 1) {
          return route.fulfill({ status: 503, json: { message: "temporary" } });
        }
        return fulfill(route, {
          leadId: 88,
          sourceId: 33,
          type: "inquiry",
          status: "CONTACTED",
          message: "重试后可见的本人咨询。",
          items: [],
          product: { name: "重试作品" },
          createdAt: "2026-09-06T08:00:00.000Z",
          updatedAt: "2026-09-07T08:00:00.000Z",
          reply: {
            id: 508,
            content: "重试已恢复详情。",
            createdAt: "2026-09-07T08:00:00.000Z",
          },
        });
      }
      if (path === "/api/customers/me/consultations/999") {
        return route.fulfill({ status: 404, json: { message: "咨询记录不存在", internalNote: "不得显示" } });
      }
      if (path === "/api/customers/me/inquiries") {
        return fulfill(route, { list: [], total: 0, page: 1, pageSize: 3 });
      }
      if (path === "/api/customers/me/selection-inquiries") return fulfill(route, []);
      if (path === "/api/customers/me/notifications") {
        return fulfill(route, { list: [], total: 0, unreadCount: 0, page: 1, pageSize: 20 });
      }
      if (path === "/api/settings/flags") {
        return fulfill(route, { commerceEnabled: false, cartEnabled: false, paymentEnabled: false });
      }
      if (path === "/api/partner-applications/me") return fulfill(route, null);
      return fulfill(route, []);
    });
    await installCustomerSession(page, { id: 11, name: "详情重试会员" });

    await page.goto("/customer?section=consultations&leadId=88");
    const focusedDetail = page.getByRole("region", { name: "咨询详情" });
    await expect(focusedDetail.getByRole("alert")).toContainText("咨询详情暂时无法加载");
    await focusedDetail.getByRole("button", { name: "重新加载" }).click();
    await expect(focusedDetail.getByRole("heading", { name: "重试作品" })).toBeVisible();
    await expect(focusedDetail.getByText("重试已恢复详情。")).toBeVisible();

    await page.goto("/customer?section=consultations&leadId=999");
    await expect(focusedDetail.getByRole("alert")).toContainText("未找到这条咨询");
    await expect(page.getByText("不得显示")).toHaveCount(0);
    await focusedDetail.getByRole("button", { name: "返回咨询列表" }).click();
    await expect(page).toHaveURL(/\/customer$/);
  });

  test("选款咨询失败可重试，预约咨询权限失败不伪装空态", async ({ page }) => {
    let selectionAttempts = 0;
    let inquiryForbidden = true;
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/customers/me/selection-inquiries") {
        selectionAttempts += 1;
        if (selectionAttempts === 1) {
          return route.fulfill({ status: 503, json: { message: "unavailable" } });
        }
        return fulfill(route, []);
      }
      if (path === "/api/customers/me/inquiries") {
        if (inquiryForbidden) {
          return route.fulfill({ status: 403, json: { message: "forbidden" } });
        }
        return fulfill(route, { list: [], total: 0, page: 1, pageSize: 5 });
      }
      if (path === "/api/settings/flags") {
        return fulfill(route, { commerceEnabled: false, cartEnabled: false, paymentEnabled: false });
      }
      if (path === "/api/customers/me/notifications") {
        return fulfill(route, { list: [], total: 0, unreadCount: 0, page: 1, pageSize: 20 });
      }
      if (path === "/api/partner-applications/me") return fulfill(route, null);
      return fulfill(route, []);
    });
    await installCustomerSession(page, { id: 8, name: "异常状态会员" });

    await page.goto("/customer");
    const selections = page.locator("#my-selections");
    const appointments = page.locator("#my-appointments");
    await expect(selections.getByRole("alert")).toContainText("选款咨询暂时无法加载");
    await expect(selections.getByText("暂未提交选款咨询。")).toHaveCount(0);
    await expect(appointments.getByRole("alert")).toContainText("你没有查看预约咨询的权限");
    await expect(appointments.getByText("还没有预约记录。")).toHaveCount(0);

    await selections.getByRole("button", { name: "重新加载" }).click();
    await expect(selections.getByText("暂未提交选款咨询。")).toBeVisible();
    inquiryForbidden = false;
    await appointments.getByRole("button", { name: "重新加载" }).click();
    await expect(appointments.getByText("还没有预约记录。")).toBeVisible();
  });

  test("咨询资源返回 401 时清理会话并回到会员登录", async ({ page }) => {
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/customers/me/inquiries" || path === "/api/customers/session/refresh") {
        return route.fulfill({ status: 401, json: { message: "expired" } });
      }
      if (path === "/api/settings/flags") {
        return fulfill(route, { commerceEnabled: false, cartEnabled: false, paymentEnabled: false });
      }
      return fulfill(route, []);
    });
    await installCustomerSession(page, { id: 9, name: "会话失效会员" });

    await page.goto("/customer");
    await expect(page.getByRole("button", { name: "会员登录 / 注册" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "我的账号" })).toHaveCount(0);
  });
});
