import { expect, test, type Page, type Route } from "@playwright/test";

const wrapped = (data: unknown) =>
  JSON.stringify({ code: 200, data, message: "ok" });

async function authenticateAdmin(page: Page) {
  await page.addInitScript(() => {
    const user = {
      id: 1,
      username: "operating-foundation-admin",
      realName: "经营底座测试管理员",
      role: "ADMIN",
      status: "ACTIVE",
      createdAt: "2026-08-22T00:00:00.000Z",
    };
    localStorage.setItem("token", "operating-foundation-test-token");
    localStorage.setItem(
      "jewelry-auth",
      JSON.stringify({
        state: {
          token: "operating-foundation-test-token",
          user,
          isLoggedIn: true,
        },
        version: 0,
      }),
    );
  });
}

async function fulfillJson(route: Route, data: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body:
      status >= 400
        ? JSON.stringify({ code: status, data: null, message: "test failure" })
        : wrapped(data),
  });
}

test.describe("后台经营底座第一批状态", () => {
  test("Inventory 失败不显示零值，重试后标清全量与当前页并按当前页导出", async ({
    page,
  }) => {
    await authenticateAdmin(page);
    let mode: "fail" | "success" = "fail";
    let releaseInventory!: () => void;
    const inventoryGate = new Promise<void>((resolve) => {
      releaseInventory = resolve;
    });

    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/api/warehouses")) {
        await fulfillJson(route, [{ id: 1, name: "深圳展厅" }]);
        return;
      }
      if (url.pathname.endsWith("/api/inventory")) {
        if (mode === "fail") {
          await inventoryGate;
          await fulfillJson(route, null, 503);
          return;
        }
        await fulfillJson(route, {
          list: [
            {
              id: 11,
              quantity: 8,
              safetyStock: 2,
              sku: { skuCode: "HC-SKU-11", product: { name: "测试戒指" } },
              warehouse: { name: "深圳展厅" },
            },
            {
              id: 12,
              quantity: 0,
              safetyStock: 2,
              sku: { skuCode: "HC-SKU-12", product: { name: "测试项链" } },
              warehouse: { name: "深圳展厅" },
            },
          ],
          total: 41,
        });
        return;
      }
      await fulfillJson(route, {});
    });

    await page.goto("/admin/inventory");
    await expect(page.getByText("正在加载库存数据…")).toBeVisible();
    releaseInventory();

    await expect(page.getByText("库存数据加载失败", { exact: true })).toBeVisible();
    await expect(page.getByText("库存记录总数（全量）")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "导出当前页" })).toBeDisabled();

    mode = "success";
    await page.getByRole("button", { name: "重新加载" }).click();
    await expect(page.getByText("库存记录总数（全量）")).toBeVisible();
    await expect(
      page.getByText("全量总数来自服务端；状态统计与状态筛选仅针对当前页已加载记录。"),
    ).toBeVisible();
    await expect(page.getByText("本页正常")).toBeVisible();
    await expect(page.getByText("本页缺货")).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "导出当前页" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain("库存报表");
    await expect(page.getByText("已导出当前页 2 条库存记录")).toBeVisible();
  });

  test("Inventory 明确展示空数据", async ({ page }) => {
    await authenticateAdmin(page);
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      await fulfillJson(
        route,
        path.endsWith("/api/inventory")
          ? { list: [], total: 0 }
          : path.endsWith("/api/warehouses")
            ? []
            : {},
      );
    });

    await page.goto("/admin/inventory");
    await expect(page.getByText("暂无库存记录")).toBeVisible();
    await expect(page.getByText("库存记录总数（全量）")).toHaveCount(0);
  });

  test("UserManage 隐藏失败前的旧结果，重试与筛选空态可恢复", async ({ page }) => {
    await authenticateAdmin(page);
    let mode: "old" | "fail" | "fresh" | "empty" = "old";
    let releaseUsers!: () => void;
    const usersGate = new Promise<void>((resolve) => {
      releaseUsers = resolve;
    });

    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (!path.endsWith("/api/users")) {
        await fulfillJson(route, {});
        return;
      }
      if (mode === "old") {
        await usersGate;
        await fulfillJson(route, {
          list: [
            {
              id: 1,
              username: "old-result",
              realName: "旧结果员工",
              role: "ADMIN",
              status: "ACTIVE",
              createdAt: "2026-08-22T00:00:00.000Z",
            },
          ],
          total: 1,
          roleCounts: { ADMIN: 1 },
        });
        return;
      }
      if (mode === "fail") {
        await fulfillJson(route, null, 503);
        return;
      }
      if (mode === "empty") {
        await fulfillJson(route, { list: [], total: 0, roleCounts: {} });
        return;
      }
      await fulfillJson(route, {
        list: [
          {
            id: 2,
            username: "fresh-result",
            realName: "新结果员工",
            role: "EDITOR",
            status: "ACTIVE",
            createdAt: "2026-08-22T00:00:00.000Z",
          },
        ],
        total: 1,
        roleCounts: { EDITOR: 1 },
      });
    });

    await page.goto("/admin/users");
    await expect(page.getByText("正在加载后台员工数据…")).toBeVisible();
    releaseUsers();
    await expect(page.getByText("旧结果员工")).toBeVisible();

    mode = "fail";
    const search = page.getByPlaceholder("搜索用户名 / 姓名 / 手机号");
    await search.fill("新员工");
    await search.press("Enter");
    await expect(page.getByText("后台员工数据加载失败", { exact: true })).toBeVisible();
    await expect(page.getByText("旧结果员工")).toHaveCount(0);
    await expect(page.getByText("超级管理员")).toHaveCount(0);

    mode = "fresh";
    await page.getByRole("button", { name: "重新加载" }).click();
    await expect(page.getByText("新结果员工")).toBeVisible();
    await expect(page.getByText("旧结果员工")).toHaveCount(0);

    mode = "empty";
    await search.fill("无结果");
    await search.press("Enter");
    await expect(page.getByText("没有符合当前筛选条件的后台员工")).toBeVisible();
  });

  test("GoldPrice 分项显示失败，重试成功且空数据不伪造价格", async ({ page }) => {
    await authenticateAdmin(page);
    let mode: "partial" | "success" | "empty" = "partial";
    let releaseGold!: () => void;
    const goldGate = new Promise<void>((resolve) => {
      releaseGold = resolve;
    });

    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (!path.includes("/api/gold-price/")) {
        await fulfillJson(route, {});
        return;
      }
      if (mode === "partial") {
        await goldGate;
        if (path.endsWith("/history")) {
          await fulfillJson(route, []);
        } else {
          await fulfillJson(route, null, 503);
        }
        return;
      }
      if (mode === "empty") {
        if (path.endsWith("/automation-status")) {
          await fulfillJson(route, { autoFetchConfigured: true });
        } else {
          await fulfillJson(route, path.endsWith("/history") ? [] : null);
        }
        return;
      }
      if (path.endsWith("/latest")) {
        await fulfillJson(route, {
          id: 31,
          price: 520.88,
          change: 2.5,
          source: "MANUAL",
          recordDate: "2026-08-22T00:00:00.000Z",
        });
      } else if (path.endsWith("/history")) {
        await fulfillJson(route, [
          {
            id: 31,
            price: 520.88,
            change: 2.5,
            source: "MANUAL",
            recordDate: "2026-08-22T00:00:00.000Z",
          },
        ]);
      } else {
        await fulfillJson(route, { autoFetchConfigured: false });
      }
    });

    await page.goto("/admin/gold-price");
    await expect(page.getByText("正在加载金价数据…")).toBeVisible();
    releaseGold();

    await expect(page.getByText("当前金价加载失败", { exact: true })).toBeVisible();
    await expect(page.getByText("自动抓取配置状态加载失败", { exact: true })).toBeVisible();
    await expect(page.getByText("暂无金价历史")).toBeVisible();
    await expect(page.getByText("485", { exact: true })).toHaveCount(0);
    await expect(page.getByText("0.00", { exact: true })).toHaveCount(0);

    mode = "success";
    await page.getByRole("button", { name: "重新加载" }).first().click();
    await expect(page.getByText("520.88 元/克", { exact: true })).toBeVisible();
    await expect(page.getByText("自动抓取未配置，当前金价需手动维护")).toBeVisible();

    mode = "empty";
    await page.reload();
    await expect(page.getByText("尚未配置当前金价")).toBeVisible();
    await expect(page.getByText("暂无金价历史")).toBeVisible();
    await page.getByRole("button", { name: "手动调价" }).click();
    await expect(page.getByRole("spinbutton")).toHaveValue("");
  });
});
