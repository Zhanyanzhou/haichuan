import { expect, test, type Page } from "@playwright/test";
import { installAdminSession } from "./fixtures/session-auth";
import {
  adminLandingRoute,
  canAccessAdminRoute,
  rolesForAdminRoute,
} from "../src/config/adminRouteAccess";

/**
 * 角色一致性防复发合同：锁定本轮修复后的口径——
 * 1) 工作台与 statistics 控制器 @Roles(SUPER_ADMIN, ADMIN) 同口径；
 * 2) 每个角色的登录落点必须可被该角色访问（曾发生 ALL_STAFF 失配导致 5 角色 403）；
 * 3) 异常订单的"查看"跳转与评价审核按钮不得对无权角色渲染。
 * 浏览器部分使用本地拦截的自有 API 夹具，不证明真实服务端行为。
 */

const ALL_ROLES = [
  "SUPER_ADMIN",
  "ADMIN",
  "EDITOR",
  "CUSTOMER_SERVICE",
  "WAREHOUSE",
  "SALES_CONSULTANT",
  "FINANCE",
] as const;

test.describe("后台路由权限映射合同", () => {
  test("工作台仅管理员可进，与 statistics 控制器 @Roles 同口径", () => {
    expect(rolesForAdminRoute("/admin/dashboard")).toEqual([
      "SUPER_ADMIN",
      "ADMIN",
    ]);
  });

  test("每个角色的登录落点都可被该角色访问", () => {
    for (const role of ALL_ROLES) {
      const landing = adminLandingRoute(role);
      expect(
        canAccessAdminRoute(role, landing),
        `${role} 的落点 ${landing} 必须可访问`,
      ).toBe(true);
    }
  });

  test("财务不能进入订单中心但可进入异常订单页", () => {
    expect(canAccessAdminRoute("FINANCE", "/admin/orders")).toBe(false);
    expect(canAccessAdminRoute("FINANCE", "/admin/trade/anomalies")).toBe(true);
  });

  test("客服可进入评价管理但不能进入工作台", () => {
    expect(canAccessAdminRoute("CUSTOMER_SERVICE", "/admin/reviews")).toBe(true);
    expect(canAccessAdminRoute("CUSTOMER_SERVICE", "/admin/dashboard")).toBe(
      false,
    );
  });
});

const jsonOk = (data: unknown) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({ code: 200, data, message: "ok" }),
});

async function mockEmptyAdminApis(
  page: Page,
  onStatisticsRequest?: () => void,
) {
  await page.route("**/api/**", (route) => {
    if (
      onStatisticsRequest &&
      new URL(route.request().url()).pathname.startsWith("/api/statistics")
    ) {
      onStatisticsRequest();
    }
    return route.fulfill(jsonOk({ list: [], total: 0 }));
  });
}

const anomalyOrder = {
  id: 201,
  orderNo: "HC2026090200002",
  customerName: "一致性测试客户",
  customerPhone: "13900000000",
  orderType: "SPOT",
  status: "PENDING_PAYMENT",
  anomalyReasons: ["长时间未付款"],
  createdAt: new Date().toISOString(),
};

const pendingReview = {
  id: 101,
  rating: 5,
  content: "一致性测试评价内容",
  status: "PENDING",
  reply: null,
  createdAt: new Date().toISOString(),
  product: { id: 1, name: "一致性测试作品", code: "CONSISTENCY-001" },
  customer: { id: 2, name: "测试客户", phone: "13800000000" },
  order: { id: 3, orderNo: "HC2026090100001" },
};

test.describe("非管理员角色的页面渲染行为", () => {
  test("EDITOR 进入 /admin 落到商品管理而非工作台", async ({ page }) => {
    await mockEmptyAdminApis(page);
    await installAdminSession(page, {
      username: "landing-editor",
      realName: "编辑落地测试",
      role: "EDITOR",
    });
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/products/);
  });

  test("EDITOR 直接访问工作台得到 403 页且不请求统计接口", async ({ page }) => {
    let statisticsRequests = 0;
    await mockEmptyAdminApis(page, () => {
      statisticsRequests += 1;
    });
    await installAdminSession(page, {
      username: "dashboard-editor",
      realName: "工作台权限测试",
      role: "EDITOR",
    });
    await page.goto("/admin/dashboard");
    await expect(page.getByText("403", { exact: true })).toBeVisible();
    expect(statisticsRequests).toBe(0);
  });

  test("FINANCE 的异常订单行不渲染跳转订单中心的查看按钮", async ({ page }) => {
    await mockEmptyAdminApis(page);
    await page.route(
      "**/api/orders/anomalies",
      (route) => route.fulfill(jsonOk({ list: [anomalyOrder], total: 1 })),
    );
    await installAdminSession(page, {
      username: "anomaly-finance",
      realName: "财务异常订单测试",
      role: "FINANCE",
    });
    await page.goto("/admin/trade/anomalies");
    await expect(page.getByText("HC2026090200002")).toBeVisible();
    await expect(page.getByRole("button", { name: "查看" })).toHaveCount(0);
  });

  test("ADMIN 的异常订单行渲染查看按钮", async ({ page }) => {
    await mockEmptyAdminApis(page);
    await page.route(
      "**/api/orders/anomalies",
      (route) => route.fulfill(jsonOk({ list: [anomalyOrder], total: 1 })),
    );
    await installAdminSession(page, {
      username: "anomaly-admin",
      realName: "管理员异常订单测试",
      role: "ADMIN",
    });
    await page.goto("/admin/trade/anomalies");
    await expect(page.getByText("HC2026090200002")).toBeVisible();
    // antd 两字按钮会自动插入空格（"查 看"），用正则兼容两种形态。
    await expect(page.getByRole("button", { name: /查\s*看/ })).toHaveCount(1);
  });

  test("客服的评价列表不渲染审核按钮并提示待管理员审核", async ({ page }) => {
    await mockEmptyAdminApis(page);
    await page.route(
      "**/api/reviews**",
      (route) => route.fulfill(jsonOk({ list: [pendingReview], total: 1 })),
    );
    await installAdminSession(page, {
      username: "review-service",
      realName: "客服评价测试",
      role: "CUSTOMER_SERVICE",
    });
    await page.goto("/admin/reviews");
    await expect(page.getByText("一致性测试评价内容")).toBeVisible();
    await expect(page.getByRole("button", { name: "通过" })).toHaveCount(0);
    await expect(page.getByText("待管理员审核")).toBeVisible();
  });

  test("ADMIN 的评价列表渲染通过按钮", async ({ page }) => {
    await mockEmptyAdminApis(page);
    await page.route(
      "**/api/reviews**",
      (route) => route.fulfill(jsonOk({ list: [pendingReview], total: 1 })),
    );
    await installAdminSession(page, {
      username: "review-admin",
      realName: "管理员评价测试",
      role: "ADMIN",
    });
    await page.goto("/admin/reviews");
    await expect(page.getByText("一致性测试评价内容")).toBeVisible();
    // antd 两字按钮会自动插入空格（"通 过"），用正则兼容两种形态。
    await expect(page.getByRole("button", { name: /通\s*过/ })).toHaveCount(1);
  });
});

test.describe("登录回跳的角色兜底", () => {
  test("无权限的 returnTo 回退到该角色落点而不是 403 页", async ({ page }) => {
    await mockEmptyAdminApis(page);
    await page.route(
      "**/api/auth/login",
      (route) =>
        route.fulfill(
          jsonOk({
            user: {
              id: 2,
              username: "editor-return",
              realName: "回跳编辑测试",
              role: "EDITOR",
              status: "ACTIVE",
            },
          }),
        ),
    );
    await page.goto("/admin/login?returnTo=/admin/settings");
    await page.getByPlaceholder("输入用户名").fill("editor-return");
    await page.getByPlaceholder("输入密码").fill("TestPassword123!");
    await page.getByRole("button", { name: "登录" }).click();
    await expect(page).toHaveURL(/\/admin\/products/);
  });
});
