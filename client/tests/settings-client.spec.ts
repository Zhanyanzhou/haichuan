import { expect, test, type Page } from "@playwright/test";

async function authenticateAuditAdmin(page: Page) {
  await page.addInitScript(() => {
    const token = "settings-client-test-token";
    localStorage.setItem("token", token);
    localStorage.setItem(
      "jewelry-auth",
      JSON.stringify({
        state: {
          token,
          user: {
            id: 1,
            username: "settings-auditor",
            role: "SUPER_ADMIN",
            realName: "设置审计员",
          },
          isLoggedIn: true,
        },
        version: 0,
      }),
    );
  });
}

test("操作日志沿用员工鉴权和现有分页筛选参数", async ({ page }) => {
  await authenticateAuditAdmin(page);
  const logRequests: Array<{
    page: string | null;
    pageSize: string | null;
    keyword: string | null;
    module: string | null;
    authorization?: string;
  }> = [];

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    let data: unknown = {};

    if (url.pathname === "/api/settings/logs") {
      logRequests.push({
        page: url.searchParams.get("page"),
        pageSize: url.searchParams.get("pageSize"),
        keyword: url.searchParams.get("keyword"),
        module: url.searchParams.get("module"),
        authorization: request.headers().authorization,
      });
      data = {
        list: [
          {
            id: 1,
            createdAt: "2026-08-26 12:00:00",
            action: "发布商品",
            detail: JSON.stringify({ productCode: "HC-001" }),
            user: { realName: "设置审计员" },
          },
        ],
        total: 1,
        page: 1,
        pageSize: 30,
      };
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

  await page.goto("/admin/audit-logs");
  await expect(page.getByRole("heading", { name: "操作日志" })).toBeVisible();
  await expect(page.getByText("发布商品", { exact: true })).toBeVisible();

  await expect
    .poll(() =>
      logRequests.some(
        (request) =>
          request.page === "1" &&
          request.pageSize === "30" &&
          request.keyword === null &&
          request.module === null,
      ),
    )
    .toBe(true);

  await page.getByPlaceholder("搜索操作人 / 动作 / 模块").fill("发布");
  await page.getByPlaceholder("搜索操作人 / 动作 / 模块").press("Enter");
  await expect
    .poll(() =>
      logRequests.some(
        (request) => request.keyword === "发布" && request.module === null,
      ),
    )
    .toBe(true);
  await page.getByRole("combobox").click();
  await page
    .locator(".ant-select-item-option")
    .filter({ hasText: "商品" })
    .click();

  await expect
    .poll(() =>
      logRequests.some(
        (request) =>
          request.keyword === "发布" && request.module === "product",
      ),
    )
    .toBe(true);
  expect(
    logRequests.every(
      (request) =>
        request.authorization === "Bearer settings-client-test-token",
    ),
  ).toBe(true);
});
