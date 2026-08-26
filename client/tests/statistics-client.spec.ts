import { expect, test, type Page } from "@playwright/test";

async function authenticateDashboardAdmin(page: Page) {
  await page.addInitScript(() => {
    const token = "statistics-client-test-token";
    localStorage.setItem("token", token);
    localStorage.setItem(
      "jewelry-auth",
      JSON.stringify({
        state: {
          token,
          user: {
            id: 1,
            username: "statistics-auditor",
            role: "SUPER_ADMIN",
            name: "统计审计员",
          },
          isLoggedIn: true,
        },
        version: 0,
      }),
    );
  });
}

test.describe("后台统计客户端现有合同", () => {
  test("仪表盘沿用员工鉴权并按指标和时间范围加载趋势", async ({ page }) => {
    await authenticateDashboardAdmin(page);
    const dashboardHeaders: Record<string, string>[] = [];
    const trendRequests: Array<{
      days: string | null;
      metric: string | null;
      authorization?: string;
    }> = [];

    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      let data: unknown = {};

      if (url.pathname === "/api/statistics/dashboard") {
        dashboardHeaders.push(request.headers());
        data = {
          orderToday: 3,
          revenueToday: 16800,
          inquiriesToday: 2,
          pageViewsToday: 88,
          orderYesterday: 2,
          revenueYesterday: 12000,
          inquiriesYesterday: 1,
          pageViewsYesterday: 80,
          publishedProductCount: 24,
          pendingShip: 1,
          pendingAppointmentInquiries: 1,
          pendingSelectionInquiries: 0,
          lowStock: 0,
          pendingReview: 0,
        };
      } else if (url.pathname === "/api/statistics/trend") {
        trendRequests.push({
          days: url.searchParams.get("days"),
          metric: url.searchParams.get("metric"),
          authorization: request.headers().authorization,
        });
        data = [
          { date: "2026-08-25", count: 2 },
          { date: "2026-08-26", count: 3 },
        ];
      } else if (url.pathname === "/api/settings/flags") {
        data = {
          commerceEnabled: false,
          cartEnabled: false,
          paymentEnabled: false,
        };
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ code: 200, data, message: "ok" }),
      });
    });

    await page.goto("/admin/dashboard");
    await expect(page.getByRole("heading", { name: "今日经营" })).toBeVisible();
    await expect(page.getByText("¥16,800", { exact: true })).toBeVisible();
    await expect(page.locator(".admin-dashboard__card")).toHaveCount(6);
    await expect(page.locator(".admin-dashboard__card-label")).toHaveText([
      "今日订单",
      "成交金额",
      "新增咨询",
      "页面浏览量",
      "在售商品数",
      "待发货订单",
    ]);
    const pendingInquiry = page.locator(".admin-dashboard__alert-item");
    await expect(pendingInquiry).toHaveCount(1);
    await expect(pendingInquiry).toContainText("待处理咨询");
    await expect(pendingInquiry).toHaveAttribute(
      "href",
      "/admin/leads?status=PENDING",
    );
    await expect(page.getByRole("tab", { name: "订单数" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await expect.poll(() => dashboardHeaders.length).toBe(1);
    expect(dashboardHeaders[0].authorization).toBe(
      "Bearer statistics-client-test-token",
    );
    await expect
      .poll(() =>
        trendRequests.some(
          (request) => request.days === "7" && request.metric === "orders",
        ),
      )
      .toBe(true);

    await page.getByRole("tab", { name: "成交金额" }).click();
    await page.getByRole("tab", { name: "近 30 日" }).click();
    await expect(page.getByRole("tab", { name: "成交金额" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByRole("tab", { name: "近 30 日" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await expect
      .poll(() =>
        trendRequests.some(
          (request) => request.days === "30" && request.metric === "revenue",
        ),
      )
      .toBe(true);
    expect(
      trendRequests.every(
        (request) =>
          request.authorization === "Bearer statistics-client-test-token",
      ),
    ).toBe(true);
  });
});
