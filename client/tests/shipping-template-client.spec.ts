import { expect, test, type Page } from "@playwright/test";
import { installAdminSession } from "./fixtures/session-auth";

async function authenticateProductEditor(page: Page) {
  await installAdminSession(page, {
    username: "shipping-template-editor",
    realName: "运费模板编辑员",
  });
}

test("商品发布页不加载运费模板，也不提供物流入口", async ({ page }) => {
  await authenticateProductEditor(page);
  let listRequests = 0;
  const writes: Array<{
    headers: Record<string, string>;
    body: Record<string, unknown>;
  }> = [];

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/auth/profile") return route.fallback();
    if (path === "/api/shipping-templates" && request.method() === "GET") {
      listRequests += 1;
    }
    if (path === "/api/shipping-templates" && request.method() === "POST") {
      writes.push({
        headers: request.headers(),
        body: request.postDataJSON(),
      });
    }

    const data =
      path === "/api/categories/admin/tree"
        ? [{ id: 1, name: "戒指", children: [] }]
        : path === "/api/shipping-templates" && request.method() === "GET"
          ? []
          : path === "/api/shipping-templates" && request.method() === "POST"
            ? {
                id: 8,
                name: "珠宝顺丰保价模板",
                carrier: "顺丰速运",
                feeMode: "FREE",
                baseFee: 0,
                remoteSurcharge: 0,
                insured: true,
                signatureRequired: true,
                isDefault: false,
                isActive: true,
              }
            : path === "/api/settings/flags"
              ? {
                  commerceEnabled: false,
                  cartEnabled: false,
                  paymentEnabled: false,
                }
              : {};
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ code: 200, data, message: "ok" }),
    });
  });

  await page.goto("/admin/products/new");
  await expect(page.getByRole("heading", { name: "图文描述" })).toBeVisible();
  await expect(page.getByRole("button", { name: "物流服务" })).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "新建运费模板" })).toHaveCount(0);
  expect(listRequests).toBe(0);
  expect(writes).toEqual([]);
});
