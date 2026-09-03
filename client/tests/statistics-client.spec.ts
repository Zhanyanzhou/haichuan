import { expect, test, type Page } from "@playwright/test";
import { installAdminSession } from "./fixtures/session-auth";

async function authenticateDashboardAdmin(page: Page) {
  await installAdminSession(page, {
    username: "statistics-auditor",
    realName: "统计审计员",
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
      if (url.pathname === "/api/auth/profile") return route.fallback();
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
    expect(dashboardHeaders[0].authorization).toBeUndefined();
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
    expect(trendRequests.every((request) => request.authorization === undefined))
      .toBe(true);
  });

  test("访问分析展示匿名回访、地域与多周期指标并适配手机宽度", async ({
    page,
  }) => {
    await authenticateDashboardAdmin(page);
    const overview = {
      collection: {
        ingestionEnabled: true,
        geoHeadersEnabled: true,
        dataset: "PRODUCTION",
        retentionDays: 90,
        consentRequired: true,
      },
      period: { days: 30, startDate: "2026-08-05", endDate: "2026-09-03" },
      totals: {
        pageViews: 128,
        visitors: 42,
        sessions: 57,
        newVisitors: 30,
        returningVisitors: 12,
        returnRate: 28.57,
        pagesPerSession: 2.25,
      },
      trend: [
        { date: "2026-09-01", pageViews: 25, visitors: 10, sessions: 12 },
        { date: "2026-09-02", pageViews: 48, visitors: 18, sessions: 22 },
        { date: "2026-09-03", pageViews: 55, visitors: 20, sessions: 23 },
      ],
      topPages: [
        { pagePath: "/", pageViews: 70, visitors: 35 },
        { pagePath: "/catalog", pageViews: 58, visitors: 22 },
      ],
      devices: [
        { deviceType: "mobile", pageViews: 90, visitors: 31 },
        { deviceType: "desktop", pageViews: 38, visitors: 11 },
      ],
      sources: [{ source: "direct", pageViews: 128, visitors: 42 }],
      regions: [
        {
          countryCode: "CN",
          region: "Guangdong",
          city: "Shenzhen",
          pageViews: 82,
          visitors: 28,
        },
      ],
    };

    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/auth/profile") return route.fallback();
      let data: unknown = [];
      if (path === "/api/analytics/overview") data = overview;
      if (path === "/api/analytics/visitors") {
        data = {
          total: 1,
          days: 30,
          list: [
            {
              visitorKey: "A1B2C3D4",
              firstSeen: "2026-08-20T08:00:00.000Z",
              lastSeen: "2026-09-03T02:00:00.000Z",
              activeDays: 4,
              sessions: 6,
              pageViews: 18,
              returning: true,
              countryCode: "CN",
              region: "Guangdong",
              city: "Shenzhen",
              deviceType: "mobile",
            },
          ],
        };
      }
      if (path === "/api/analytics/events") {
        data = {
          total: 1,
          page: 1,
          pageSize: 100,
          list: [
            {
              id: 1,
              occurredAt: "2026-09-03T02:00:00.000Z",
              eventName: "page_view",
              pagePath: "/catalog",
              source: "direct",
              deviceType: "mobile",
              visitorKey: "A1B2C3D4",
            },
          ],
        };
      }
      if (path === "/api/settings/flags") {
        data = { analyticsDashboardEnabled: true };
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ code: 200, data, message: "ok" }),
      });
    });

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/admin/analytics");
    await expect(page.getByRole("heading", { name: "访问分析" })).toBeVisible();
    await expect(
      page.locator(".ant-statistic").filter({ hasText: "独立访客" }),
    ).toContainText("42");
    await expect(
      page.locator(".ant-statistic").filter({ hasText: "回访访客" }),
    ).toContainText("12");
    await expect(page.getByText("CN · Guangdong · Shenzhen").first()).toBeVisible();
    await expect(page.getByText("访客 A1B2C3D4").first()).toBeVisible();
    await expect(page.getByText("回访", { exact: true }).first()).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.locator(".ant-card").filter({ hasText: "访问概览" }).first(),
    ).toBeVisible();
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });
});
