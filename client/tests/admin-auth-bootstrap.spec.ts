import { expect, test, type Page, type Route } from "@playwright/test";

const adminUser = {
  id: 9,
  username: "bootstrap-admin",
  realName: "会话恢复管理员",
  role: "ADMIN",
  status: "ACTIVE",
};

function fulfill(route: Route, data: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify({
      code: status,
      data,
      message: status >= 400 ? "request failed" : "ok",
    }),
  });
}

async function submitLogin(page: Page) {
  await page.getByPlaceholder("输入用户名").fill("bootstrap-admin");
  await page.getByPlaceholder("输入密码").fill("TestPassword123!");
  await page.getByRole("button", { name: "登录" }).click();
}

test("后台 profile 401 才进入登录页并保留原路径", async ({ page }) => {
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/profile") return fulfill(route, null, 401);
    if (path === "/api/auth/login") return fulfill(route, { user: adminUser });
    return fulfill(route, { list: [], total: 0 });
  });

  await page.goto("/admin/trade/payments?status=PENDING");
  await expect(page).toHaveURL(/\/admin\/login$/);
  await submitLogin(page);
  await expect(page).toHaveURL(/\/admin\/trade\/payments\?status=PENDING$/);
});

test("后台 profile 暂时失败时保留未知态并允许只读重试", async ({ page }) => {
  let profileRequests = 0;
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/profile") {
      profileRequests += 1;
      return profileRequests === 1
        ? fulfill(route, null, 503)
        : fulfill(route, adminUser);
    }
    return fulfill(route, { list: [], total: 0 });
  });

  await page.goto("/admin/dashboard");
  const alert = page.getByRole("alert");
  await expect(alert).toContainText("后台登录状态暂时无法确认");
  await expect(page).toHaveURL(/\/admin\/dashboard$/);

  const stateBeforeRetry = await page.evaluate(async () => {
    const { useAuthStore } = await import("/src/store/authStore.ts");
    return useAuthStore.getState().status;
  });
  expect(stateBeforeRetry).toBe("unknown");

  await alert.getByRole("button", { name: "重新验证" }).click();
  await expect(page.getByRole("heading", { name: "今日经营" })).toBeVisible();
  expect(profileRequests).toBe(2);
});

test("已卸载守卫的迟到 profile 不会清空刚登录的新管理员", async ({ page }) => {
  let releaseProfile!: () => void;
  const profileGate = new Promise<void>((resolve) => {
    releaseProfile = resolve;
  });
  let profileStarted!: () => void;
  const profileRequestStarted = new Promise<void>((resolve) => {
    profileStarted = resolve;
  });

  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/profile") {
      profileStarted();
      await profileGate;
      return fulfill(route, { ...adminUser, id: 1, username: "stale-admin" });
    }
    if (path === "/api/auth/login") return fulfill(route, { user: adminUser });
    return fulfill(route, { list: [], total: 0 });
  });

  await page.goto("/admin/dashboard");
  await profileRequestStarted;
  await page.evaluate(() => {
    window.history.pushState({}, "", "/admin/login");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page.getByRole("heading", { name: "欢迎登录" })).toBeVisible();
  await submitLogin(page);
  await expect(page).toHaveURL(/\/admin\/dashboard$/);

  releaseProfile();
  await expect.poll(() => page.evaluate(async () => {
    const { useAuthStore } = await import("/src/store/authStore.ts");
    const state = useAuthStore.getState();
    return { status: state.status, username: state.user?.username };
  })).toEqual({ status: "authenticated", username: "bootstrap-admin" });
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
});

test("会话刷新后写请求重试使用轮换后的 CSRF token", async ({ page }) => {
  const headers: string[] = [];
  let refreshCount = 0;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/upload/media/26/restore") {
      headers.push(route.request().headers()["x-csrf-token"] || "");
      return fulfill(route, null, headers.length === 1 ? 401 : 200);
    }
    if (path === "/api/auth/session/refresh") {
      refreshCount += 1;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "set-cookie": "hc_csrf=fresh-token; Path=/; SameSite=Lax" },
        body: JSON.stringify({ code: 200, data: { user: adminUser }, message: "ok" }),
      });
    }
    return fulfill(route, { list: [], total: 0 });
  });

  await page.goto("/");
  await page.evaluate(() => { document.cookie = "hc_csrf=old-token; Path=/"; });
  await page.evaluate(async () => {
    const { default: api } = await import("/src/services/httpClient.ts");
    await api.post("/upload/media/26/restore");
  });

  expect(refreshCount).toBe(1);
  expect(headers).toEqual(["old-token", "fresh-token"]);
});
