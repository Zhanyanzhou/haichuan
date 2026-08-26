import { expect, test, type Page } from "@playwright/test";

const attributes = [
  {
    id: 1,
    key: "material",
    name: "材质",
    sortOrder: 1,
    isFilterable: true,
    isActive: true,
    values: [
      {
        id: 11,
        value: "足金999",
        sortOrder: 1,
        isActive: true,
      },
    ],
  },
];

async function authenticateAttributeEditor(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("token", "attribute-manage-test-token");
    localStorage.setItem(
      "jewelry-auth",
      JSON.stringify({
        state: {
          token: "attribute-manage-test-token",
          user: {
            id: 1,
            username: "attribute-editor",
            role: "SUPER_ADMIN",
            name: "属性编辑员",
          },
          isLoggedIn: true,
        },
        version: 0,
      }),
    );
  });
}

test("属性字典加载与新建请求保持现有管理端合同", async ({ page }) => {
  await authenticateAttributeEditor(page);
  const writes: Array<{
    headers: Record<string, string>;
    body: Record<string, unknown>;
  }> = [];

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/attributes" && request.method() === "POST") {
      writes.push({
        headers: request.headers(),
        body: request.postDataJSON(),
      });
    }

    const data =
      path === "/api/attributes/admin"
        ? attributes
        : path === "/api/attributes" && request.method() === "POST"
          ? { id: 2, key: "craft", name: "工艺" }
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

  await page.goto("/admin/attributes");
  await expect(page.getByRole("heading", { name: "属性字典" })).toBeVisible();
  await expect(page.getByText("材质", { exact: true })).toBeVisible();
  await expect(page.getByText("material", { exact: true })).toBeVisible();

  await page.evaluate(() => {
    document.cookie = "hc_admin_csrf=attribute-csrf-token; path=/";
  });
  await page.getByRole("button", { name: "新建属性" }).click();
  const dialog = page.getByRole("dialog", { name: "新建属性" });
  await dialog.getByLabel("属性名").fill("工艺");
  await dialog.getByLabel("稳定键").fill("craft");
  await dialog.getByRole("button", { name: "OK", exact: true }).click();

  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].headers.authorization).toBe(
    "Bearer attribute-manage-test-token",
  );
  expect(writes[0].headers["x-csrf-token"]).toBe("attribute-csrf-token");
  expect(writes[0].body).toMatchObject({
    name: "工艺",
    key: "craft",
    sortOrder: 0,
    isFilterable: true,
  });
});
