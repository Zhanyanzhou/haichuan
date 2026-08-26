import { expect, test, type Page } from "@playwright/test";

async function authenticate(page: Page) {
  await page.addInitScript(() => {
    const user = {
      id: 1,
      username: "inquiry-context-admin",
      realName: "咨询测试管理员",
      role: "ADMIN",
    };
    localStorage.setItem("token", "inquiry-context-token");
    localStorage.setItem(
      "jewelry-auth",
      JSON.stringify({
        state: { token: "inquiry-context-token", user, isLoggedIn: true },
        version: 0,
      }),
    );
  });
}

const wrapped = (data: unknown) => JSON.stringify({
  code: 200,
  data,
  message: "ok",
});

test("普通咨询详情展示服务端关联的来源作品与货号", async ({ page }) => {
  await authenticate(page);
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/leads/inquiry/17")) {
      await route.fulfill({
        contentType: "application/json",
        body: wrapped({
          id: 17,
          leadType: "inquiry",
          leadTypeLabel: "预约咨询",
          customerName: "测试访客",
          phone: "13800000000",
          status: "PENDING",
          message: "希望了解这件作品。",
          createdAt: "2026-08-26T00:00:00.000Z",
          product: { id: 42, name: "光序素圈戒指", code: "HC-RING-042" },
          followUps: [],
        }),
      });
      return;
    }
    if (path.endsWith("/leads")) {
      await route.fulfill({
        contentType: "application/json",
        body: wrapped({
          list: [{
            id: 17,
            leadType: "inquiry",
            leadTypeLabel: "预约咨询",
            customerName: "测试访客",
            phone: "13800000000",
            relatedProducts: 1,
            status: "PENDING",
            createdAt: "2026-08-26T00:00:00.000Z",
          }],
          total: 1,
        }),
      });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: wrapped({ list: [], total: 0 }),
    });
  });

  await page.goto("/admin/leads");
  await page.getByRole("button", { name: "查看" }).click();
  const drawer = page.getByRole("dialog", { name: "线索详情" });
  await expect(drawer.getByText("来源作品", { exact: true })).toBeVisible();
  await expect(drawer.getByText("光序素圈戒指", { exact: true })).toBeVisible();
  await expect(drawer.getByText("货号：HC-RING-042", { exact: true })).toBeVisible();
});
