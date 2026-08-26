import { expect, test, type Page } from "@playwright/test";

type TestedRole = "SUPER_ADMIN" | "ADMIN" | "CUSTOMER_SERVICE" | "WAREHOUSE";

async function authenticate(page: Page, role: TestedRole) {
  await page.addInitScript((currentRole) => {
    const user = {
      id: 1,
      username: `auth-store-${currentRole.toLowerCase()}`,
      realName: "权限读取测试用户",
      role: currentRole,
      status: "ACTIVE",
      createdAt: "2026-08-22T00:00:00.000Z",
    };
    localStorage.setItem("token", "auth-store-test-token");
    localStorage.setItem(
      "jewelry-auth",
      JSON.stringify({
        state: {
          token: "auth-store-test-token",
          user,
          isLoggedIn: true,
        },
        version: 0,
      }),
    );
  }, role);
}

async function mockEmptyAdminApis(page: Page) {
  await page.route("**/api/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        code: 200,
        data: { list: [], total: 0 },
        message: "ok",
      }),
    }),
  );
}

test.describe("后台页面统一从 authStore 读取角色", () => {
  test("ADMIN 在桌面端保留原有写操作入口", async ({ page }) => {
    await authenticate(page, "ADMIN");
    await mockEmptyAdminApis(page);
    await page.setViewportSize({ width: 1440, height: 900 });

    for (const target of [
      { path: "/admin/trade/after-sales", action: "登记售后" },
      { path: "/admin/trade/payments", action: "异常补录" },
      { path: "/admin/trade/refunds", action: "发起退款" },
    ]) {
      await page.goto(target.path);
      await expect(page).toHaveURL(new RegExp(`${target.path}$`));
      await expect(page.getByRole("button", { name: target.action })).toBeVisible();
    }
  });

  test("CUSTOMER_SERVICE 在常用平板尺寸可进入付款与售后，且只获得服务端已有动作", async ({
    page,
  }) => {
    await authenticate(page, "CUSTOMER_SERVICE");
    await mockEmptyAdminApis(page);
    await page.setViewportSize({ width: 1024, height: 768 });

    await page.goto("/admin/trade/after-sales");
    await expect(page).toHaveURL(/\/admin\/trade\/after-sales$/);
    await expect(page.getByRole("button", { name: "登记售后" })).toBeVisible();

    await page.goto("/admin/trade/payments");
    await expect(page).toHaveURL(/\/admin\/trade\/payments$/);
    await expect(page.getByRole("button", { name: "异常补录" })).toHaveCount(0);

    await page.goto("/admin/trade/refunds");
    await expect(page).toHaveURL(/\/admin\/trade\/refunds$/);
    await expect(page.getByRole("button", { name: "发起退款" })).toHaveCount(0);
  });

  test("WAREHOUSE 不显示付款审核且直接 URL 返回 403，不发送付款请求", async ({ page }) => {
    await authenticate(page, "WAREHOUSE");
    let paymentRequests = 0;
    await page.route("**/api/**", (route) => {
      if (new URL(route.request().url()).pathname.startsWith("/api/payments")) paymentRequests += 1;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ code: 200, data: { list: [], total: 0 }, message: "ok" }),
      });
    });

    await page.goto("/admin/trade/payments");
    await expect(page.getByText("抱歉，您没有访问此页面的权限")).toBeVisible();
    await expect(page.getByText("支付记录", { exact: true })).toHaveCount(0);
    expect(paymentRequests).toBe(0);
  });

  test("员工禁用与账号安全操作只对 SUPER_ADMIN 可见", async ({ page }) => {
    const installUsers = async (role: TestedRole) => {
      await authenticate(page, role);
      await page.route("**/api/**", (route) => route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          code: 200,
          data: {
            list: [{ id: 8, username: "staff-8", realName: "员工八", role: "EDITOR", status: "ACTIVE" }],
            total: 1,
            roleCounts: { EDITOR: 1 },
          },
          message: "ok",
        }),
      }));
      await page.goto("/admin/users");
    };

    await installUsers("ADMIN");
    await expect(page.getByRole("button", { name: "新建员工" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "重置密码" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "禁用" })).toHaveCount(0);

    await page.unroute("**/api/**");
    await installUsers("SUPER_ADMIN");
    await expect(page.getByRole("button", { name: "新建员工" })).toBeVisible();
    await expect(page.getByRole("button", { name: "重置密码" })).toBeVisible();
    await expect(page.getByRole("button", { name: "禁用" })).toBeVisible();
  });

  test("编辑员工时用户名只读且更新 payload 不含用户名，密码统一至少 8 位", async ({
    page,
  }) => {
    await authenticate(page, "SUPER_ADMIN");
    const updatePayloads: Array<Record<string, unknown>> = [];
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === "/api/users" && request.method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            code: 200,
            data: {
              list: [
                {
                  id: 8,
                  username: "staff-8",
                  realName: "员工八",
                  role: "EDITOR",
                  status: "ACTIVE",
                },
              ],
              total: 1,
              roleCounts: { EDITOR: 1 },
            },
            message: "ok",
          }),
        });
      }
      if (path === "/api/users/8" && request.method() === "PUT") {
        updatePayloads.push(request.postDataJSON());
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ code: 200, data: { id: 8 }, message: "ok" }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ code: 200, data: {}, message: "ok" }),
      });
    });

    await page.goto("/admin/users");
    await expect(page.getByText("员工八")).toBeVisible();
    await page.getByRole("button", { name: "编辑" }).click();
    const editDialog = page.getByRole("dialog", { name: "编辑后台员工" });
    const username = editDialog.getByLabel("用户名");
    await expect(username).toHaveValue("staff-8");
    await expect(username).toHaveAttribute("readonly", "");
    await editDialog.getByLabel("姓名").fill("员工八（已更新）");
    await editDialog.getByRole("button", { name: /保\s*存/ }).click();
    await expect.poll(() => updatePayloads.length).toBe(1);
    expect(updatePayloads[0]).not.toHaveProperty("username");
    expect(updatePayloads[0]).toMatchObject({ realName: "员工八（已更新）" });

    await page.getByRole("button", { name: "重置密码" }).click();
    const resetDialog = page.getByRole("dialog", { name: /重置密码/ });
    await resetDialog.getByLabel("新密码").fill("1234567");
    await resetDialog.getByLabel("新密码").press("Tab");
    await expect(resetDialog.getByText("密码至少 8 位")).toBeVisible();
    expect(updatePayloads).toHaveLength(1);
    await resetDialog.getByRole("button", { name: "Close" }).click();

    await page.getByRole("button", { name: "新建员工" }).click();
    const createDialog = page.getByRole("dialog", { name: "新建后台员工" });
    await createDialog.getByLabel("密码").fill("1234567");
    await createDialog.getByLabel("密码").press("Tab");
    await expect(createDialog.getByText("密码至少 8 位")).toBeVisible();
  });
});
