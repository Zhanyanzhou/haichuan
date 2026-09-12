import { expect, test, type Page } from "@playwright/test";
import { installAdminSession } from "./fixtures/session-auth";

type TestedRole =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "EDITOR"
  | "CUSTOMER_SERVICE"
  | "WAREHOUSE"
  | "SALES_CONSULTANT"
  | "FINANCE";

async function authenticate(page: Page, role: TestedRole) {
  await installAdminSession(page, {
    username: `site-content-${role.toLowerCase()}`,
    realName: "店铺资料权限测试用户",
    role,
  });
}

async function mockSettings(page: Page, onRequest?: () => void) {
  await page.route("**/api/settings/publication-readiness", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        code: 200,
        data: {
          schemaVersion: 2,
          ready: true,
          status: "READY",
          persisted: true,
          blockers: [],
        },
        message: "ok",
      }),
    }),
  );
  await page.route("**/api/settings", (route) => {
    onRequest?.();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        code: 200,
        data: { siteName: "海川珠宝测试店铺" },
        message: "ok",
      }),
    });
  });
}

for (const role of ["SUPER_ADMIN", "ADMIN"] as const) {
  test(`${role} 可通过导航和直接 URL 进入店铺资料`, async ({ page }) => {
    await authenticate(page, role);
    await mockSettings(page);

    await page.goto("/admin/site-content");

    await expect(page).toHaveURL(/\/admin\/site-content$/);
    await expect(
      page.getByRole("heading", { name: "店铺资料与品牌设置" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "店铺资料", exact: true }),
    ).toBeVisible();
  });
}

for (const role of [
  "EDITOR",
  "CUSTOMER_SERVICE",
  "WAREHOUSE",
  "SALES_CONSULTANT",
  "FINANCE",
] as const) {
  test(`${role} 不显示店铺资料入口且直接 URL 返回 403`, async ({ page }) => {
    await authenticate(page, role);
    let settingsRequests = 0;
    await mockSettings(page, () => {
      settingsRequests += 1;
    });

    await page.goto("/admin/site-content");

    await expect(
      page.getByText("抱歉，您没有访问此页面的权限"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "店铺资料", exact: true }),
    ).toHaveCount(0);
    expect(settingsRequests).toBe(0);
  });
}
