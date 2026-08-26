import { expect, test, type Page } from "@playwright/test";

async function authenticateProductEditor(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("token", "shipping-template-test-token");
    localStorage.setItem(
      "jewelry-auth",
      JSON.stringify({
        state: {
          token: "shipping-template-test-token",
          user: {
            id: 1,
            username: "shipping-template-editor",
            role: "SUPER_ADMIN",
            name: "运费模板编辑员",
          },
          isLoggedIn: true,
        },
        version: 0,
      }),
    );
  });
}

test("商品编辑器加载并新建运费模板时保持请求合同", async ({ page }) => {
  await authenticateProductEditor(page);
  let listRequests = 0;
  const writes: Array<{
    headers: Record<string, string>;
    body: Record<string, unknown>;
  }> = [];

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
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
  await expect.poll(() => listRequests).toBe(1);

  await page.getByRole("button", { name: "物流服务" }).click();
  await page.getByRole("checkbox", { name: "物流配送" }).check();
  await page.evaluate(() => {
    document.cookie = "hc_admin_csrf=shipping-template-csrf; path=/";
  });
  await page
    .locator(".pro-editor__template-line")
    .getByRole("button", { name: /新建/ })
    .click();

  const dialog = page.getByRole("dialog", { name: "新建运费模板" });
  await dialog.getByLabel("模板名称").fill("珠宝顺丰保价模板");
  await dialog.getByLabel("承运商").fill("顺丰速运");
  await dialog.getByRole("button", { name: /保\s*存\s*模\s*板/ }).click();

  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].headers.authorization).toBe(
    "Bearer shipping-template-test-token",
  );
  expect(writes[0].headers["x-csrf-token"]).toBe("shipping-template-csrf");
  expect(writes[0].body).toEqual({
    name: "珠宝顺丰保价模板",
    carrier: "顺丰速运",
    feeMode: "FREE",
    baseFee: 0,
    insured: true,
    signatureRequired: true,
  });
  await expect(page.getByText("运费模板已创建并选中")).toBeVisible();
  await expect(
    page.locator(".pro-editor__template-card").getByText("珠宝顺丰保价模板"),
  ).toBeVisible();
});
