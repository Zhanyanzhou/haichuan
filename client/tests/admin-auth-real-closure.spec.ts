import { expect, test } from "@playwright/test";

const enabled = process.env.ADMIN_AUTH_REAL_E2E === "1";
const apiBaseUrl = process.env.ADMIN_AUTH_REAL_API_BASE_URL;
const username = process.env.ADMIN_AUTH_REAL_USERNAME;
const password = process.env.ADMIN_AUTH_REAL_PASSWORD;

test.describe("后台员工真实 Cookie 会话", () => {
  test.skip(
    !enabled || !apiBaseUrl || !username || !password,
    "仅由一次性真实 MySQL 鉴权门禁显式启用",
  );

  test("浏览器登录只保存 HttpOnly 会话，退出后回到登录页", async ({
    page,
    context,
  }) => {
    let loginAuthorization: string | undefined;
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/auth/login") {
        loginAuthorization = request.headers().authorization;
      }
    });

    await page.goto("/admin/login", { timeout: 45_000 });
    await page.getByPlaceholder("输入用户名").fill(username!);
    await page.getByPlaceholder("输入密码").fill(password!);
    await page.getByRole("button", { name: "登录", exact: true }).click();

    await expect(page).toHaveURL(/\/admin\/dashboard(?:[/?#]|$)/);
    await expect(page.getByRole("button", { name: /账户菜单，当前用户/ })).toBeVisible();
    expect(loginAuthorization).toBeUndefined();

    const cookies = await context.cookies();
    const access = cookies.find((cookie) => cookie.name === "hc_admin_access");
    const refresh = cookies.find((cookie) => cookie.name === "hc_admin_refresh");
    const csrf = cookies.find((cookie) => cookie.name === "hc_csrf");
    expect(access?.httpOnly).toBe(true);
    expect(access?.path).toBe("/api");
    expect(refresh?.httpOnly).toBe(true);
    expect(refresh?.path).toBe("/api/auth/session");
    expect(csrf?.httpOnly).toBe(false);
    expect(csrf?.path).toBe("/");

    const browserCredentialCopies = await page.evaluate(() => ({
      token: localStorage.getItem("token"),
      customerToken: localStorage.getItem("customerToken"),
      legacyAdmin: localStorage.getItem("jewelry-auth"),
    }));
    expect(browserCredentialCopies).toEqual({
      token: null,
      customerToken: null,
      legacyAdmin: null,
    });

    await page.getByRole("button", { name: /账户菜单，当前用户/ }).click();
    await page.getByRole("menuitem", { name: "退出登录" }).click();
    await expect(page).toHaveURL(/\/admin\/login(?:[/?#]|$)/);
    await expect(page.getByRole("button", { name: "登录", exact: true })).toBeVisible();

    const afterLogout = await context.cookies(apiBaseUrl!);
    expect(afterLogout.some((cookie) => cookie.name === "hc_admin_access")).toBe(false);
    expect(afterLogout.some((cookie) => cookie.name === "hc_admin_refresh")).toBe(false);
    const profile = await context.request.get(`${apiBaseUrl}/auth/profile`);
    expect(profile.status()).toBe(401);
  });
});
