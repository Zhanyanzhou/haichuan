import { expect, test, type Route } from "@playwright/test";

function apiResponse(data: unknown) {
  return JSON.stringify({ code: 200, data, message: "success" });
}

test.describe("收敛闭环：公开语言与客户通知", () => {
  test("EN-A 在英文未发布时不请求中文公开事实并保持 noindex", async ({ page }) => {
    const apiRequests: string[] = [];
    await page.route("**/api/**", async (route) => {
      apiRequests.push(route.request().url());
      await route.abort();
    });

    for (const path of [
      "/en",
      "/en/catalog",
      "/en/products/HC-001",
      "/en/contact",
      "/en/privacy",
    ]) {
      apiRequests.length = 0;
      await page.goto(path);
      await expect(
        page.getByRole("heading", { name: "English site is not published yet" }),
      ).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        "content",
        "noindex, nofollow",
      );
      await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
      await expect(page.locator('[data-locale-availability="unavailable"]')).toBeVisible();
      expect(apiRequests, path).toEqual([]);
    }

    await page.getByRole("link", { name: "Visit the Chinese site" }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  });

  test("已登录客户只能通过本人令牌读取并更新服务通知", async ({ page }) => {
    let notificationStatus = "AVAILABLE";
    const notificationRequests: Array<{ method: string; authorization: string | undefined }> = [];

    await page.addInitScript(() => {
      localStorage.setItem("customerToken", "closure-customer-token");
      localStorage.setItem("customer", JSON.stringify({ id: 7, name: "测试会员" }));
    });

    await page.route("**/api/**", async (route: Route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      let data: unknown = [];

      if (path === "/api/customers/me/notifications") {
        notificationRequests.push({
          method: request.method(),
          authorization: request.headers().authorization,
        });
        data = {
          list: [{
            id: 91,
            type: "SERVICE_PAYMENT_CONFIRMED",
            title: "付款已确认",
            body: "本次付款 ¥400.00，累计 ¥400.00，剩余 ¥600.00。",
            actionUrl: "/customer?section=orders",
            status: notificationStatus,
            availableAt: "2026-08-26T08:00:00.000Z",
            readAt: notificationStatus === "READ" ? "2026-08-26T08:01:00.000Z" : null,
          }],
          total: 1,
          unreadCount: notificationStatus === "AVAILABLE" ? 1 : 0,
          page: 1,
          pageSize: 20,
        };
      } else if (path === "/api/customers/me/notifications/91/read") {
        notificationRequests.push({
          method: request.method(),
          authorization: request.headers().authorization,
        });
        notificationStatus = "READ";
        data = { id: 91, status: "READ" };
      } else if (path === "/api/customers/me") {
        data = { id: 7, name: "测试会员", phone: "" };
      } else if (path === "/api/settings/flags") {
        data = { commerceEnabled: false, cartEnabled: false, paymentEnabled: false };
      } else if (path === "/api/settings/public") {
        data = { siteName: "海川珠宝" };
      } else if (path === "/api/partner-applications/me") {
        data = null;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: apiResponse(data),
      });
    });

    await page.goto("/customer");

    const panel = page.getByRole("region", { name: "服务通知" });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("heading", { name: "付款已确认" })).toBeVisible();
    await expect(panel.getByText(/本次付款.*累计.*剩余/)).toBeVisible();
    await panel.getByRole("button", { name: "标为已读", exact: true }).click();
    await expect(
      panel.getByRole("button", { name: "标为已读", exact: true }),
    ).toHaveCount(0);

    expect(notificationRequests).toEqual(expect.arrayContaining([
      { method: "GET", authorization: "Bearer closure-customer-token" },
      { method: "PUT", authorization: "Bearer closure-customer-token" },
    ]));
  });
});
