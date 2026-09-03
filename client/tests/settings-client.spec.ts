import { expect, test, type Page } from "@playwright/test";
import { installAdminSession } from "./fixtures/session-auth";

async function authenticateAuditAdmin(page: Page) {
  await installAdminSession(page, {
    username: "settings-auditor",
    realName: "设置审计员",
  });
}

test("操作日志沿用员工鉴权和现有分页筛选参数", async ({ page }) => {
  await authenticateAuditAdmin(page);
  const logRequests: Array<{
    page: string | null;
    pageSize: string | null;
    keyword: string | null;
    module: string | null;
    action: string | null;
    authorization?: string;
  }> = [];

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/auth/profile") return route.fallback();
    let data: unknown = {};

    if (url.pathname === "/api/settings/logs") {
      logRequests.push({
        page: url.searchParams.get("page"),
        pageSize: url.searchParams.get("pageSize"),
        keyword: url.searchParams.get("keyword"),
        module: url.searchParams.get("module"),
        action: url.searchParams.get("action"),
        authorization: request.headers().authorization,
      });
      const records = [
        {
          id: 1,
          createdAt: "2026-08-26T12:00:00.000Z",
          action: "TEMPLATE_ARCHIVED",
          module: "page-builder-template",
          targetId: 81,
          detail: JSON.stringify({
            schemaVersion: 1,
            event: "TEMPLATE_ARCHIVED",
            actor: 7,
            timestamp: "2026-08-26T12:00:00.000Z",
            templateId: "tpl_audit_hero",
            fromStatus: "ACTIVE",
            toStatus: "ARCHIVED",
            publishedVersion: 2,
            result: "succeeded",
          }),
          user: { realName: "设置审计员" },
        },
        {
          id: 2,
          createdAt: "2026-08-26T11:00:00.000Z",
          action: "TEMPLATE_VERSION_PUBLISHED",
          module: "page-builder-template",
          targetId: 81,
          detail: JSON.stringify({
            templateId: "tpl_audit_hero",
            fromVersion: 1,
            toVersion: 2,
            result: "succeeded",
          }),
          user: { realName: "设置审计员" },
        },
        {
          id: 3,
          createdAt: "2026-08-26T10:00:00.000Z",
          action: "发布商品",
          module: "product",
          targetId: 12,
          detail: JSON.stringify({ productCode: "HC-001" }),
          user: { realName: "设置审计员" },
        },
      ];
      const keyword = url.searchParams.get("keyword")?.toLowerCase();
      const module = url.searchParams.get("module");
      const action = url.searchParams.get("action");
      const list = records.filter((record) => (
        (!module || record.module === module)
        && (!action || record.action === action)
        && (!keyword || [record.action, record.module, record.user.realName]
          .some((value) => value.toLowerCase().includes(keyword)))
      ));
      data = {
        list,
        total: list.length,
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
  const auditTable = page.locator(".audit-logs__card .ant-table");
  await expect(auditTable.getByText("模板已移入回收站", { exact: true })).toBeVisible();
  await expect(page.getByText("使用中 → 回收站", { exact: true })).toBeVisible();
  await expect(page.getByText("模板 tpl_audit_hero", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("发布商品", { exact: true })).toBeVisible();

  await expect
    .poll(() =>
      logRequests.some(
        (request) =>
          request.page === "1" &&
          request.pageSize === "30" &&
          request.keyword === null &&
          request.module === null &&
          request.action === null,
      ),
    )
    .toBe(true);

  await page.getByPlaceholder("搜索操作人、动作或模块").fill("发布");
  await page.getByPlaceholder("搜索操作人、动作或模块").press("Enter");
  await expect
    .poll(() =>
      logRequests.some(
        (request) => request.keyword === "发布" && request.module === null,
      ),
    )
    .toBe(true);
  await page.getByRole("combobox", { name: "按模块筛选" }).click();
  await page
    .locator(".ant-select-item-option")
    .filter({ hasText: "模板设计" })
    .click();

  await page.getByRole("combobox", { name: "按动作筛选" }).click();
  await page
    .locator(".ant-select-item-option")
    .filter({ hasText: "模板已移入回收站" })
    .click();

  await expect
    .poll(() =>
      logRequests.some(
        (request) =>
          request.keyword === "发布"
          && request.module === "page-builder-template"
          && request.action === "TEMPLATE_ARCHIVED",
      ),
    )
    .toBe(true);
  await expect(page.getByText("共 0 条记录", { exact: true })).toBeVisible();
  await expect(page.getByText("没有符合当前筛选条件的操作记录", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "重置筛选" }).click();
  await expect(auditTable.getByText("模板已移入回收站", { exact: true })).toBeVisible();
  await expect(page.locator(".ant-select-dropdown:visible")).toHaveCount(0);
  const detailButton = page.getByRole("button", { name: "查看详情" }).first();
  await detailButton.focus();
  await page.keyboard.press("Enter");
  const detailDrawer = page.getByRole("dialog", { name: "模板已移入回收站" });
  await expect(detailDrawer).toBeVisible();
  await expect(detailDrawer.getByText("模板 tpl_audit_hero", { exact: true })).toBeVisible();
  await expect(detailDrawer.getByText("使用中 → 回收站", { exact: true })).toBeVisible();
  await expect(detailDrawer.getByText("成功", { exact: true })).toBeVisible();
  await expect.poll(async () => (
    await page.locator(".ant-drawer-content-wrapper:visible").boundingBox()
  )?.width ?? 0).toBeGreaterThan(500);
  await page.keyboard.press("Escape");
  await expect(detailDrawer).toBeHidden();
  await expect(page.locator(".ant-drawer-content-wrapper:visible")).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("search", { name: "操作日志筛选" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "按模块筛选" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (
    document.documentElement.scrollWidth <= window.innerWidth
  ))).toBe(true);
  expect(logRequests.every((request) => request.authorization === undefined))
    .toBe(true);
});

test("操作日志加载失败时提供可执行的重新加载入口", async ({ page }) => {
  await authenticateAuditAdmin(page);
  let attempts = 0;
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/auth/profile") return route.fallback();
    if (url.pathname === "/api/settings/logs") {
      attempts += 1;
      if (attempts === 1) {
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ code: 503, message: "internal fixture detail" }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          code: 200,
          data: { list: [], total: 0, page: 1, pageSize: 30 },
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

  await page.goto("/admin/audit-logs");
  await expect(page.getByText("操作日志加载失败。请稍后重新加载。", { exact: true })).toBeVisible();
  await expect(page.getByText("internal fixture detail", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "重新加载" }).click();
  await expect(page.getByText("暂无操作记录", { exact: true })).toBeVisible();
  expect(attempts).toBe(2);
});
