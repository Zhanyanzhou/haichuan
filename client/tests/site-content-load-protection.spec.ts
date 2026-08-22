import { expect, test } from "@playwright/test";

const useMock = process.env.VITE_USE_MOCK === "true";

async function authenticateAdmin(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    localStorage.setItem("token", "mock-jwt-token");
    localStorage.setItem(
      "jewelry-auth",
      JSON.stringify({
        state: {
          token: "mock-jwt-token",
          user: {
            id: 1,
            username: "mock-admin",
            role: "SUPER_ADMIN",
            realName: "Mock Admin",
          },
          isLoggedIn: true,
        },
        version: 0,
      }),
    );
  });
}

test.describe("店铺资料加载失败保护", () => {
  test.skip(useMock, "该回归通过拦截真实 API 路径构造确定性的加载失败状态");

  test("加载失败时禁止保存，重试成功后回显并允许保存", async ({ page }) => {
    const antdConsoleProblems: string[] = [];
    page.on("console", (entry) => {
      const text = entry.text();
      if (/Static function can not consume context|destroyOnClose.*deprecated/i.test(text)) {
        antdConsoleProblems.push(text);
      }
    });
    await page.setViewportSize({ width: 1024, height: 768 });
    await authenticateAdmin(page);

    let settingsRequestCount = 0;
    let updateRequestCount = 0;
    let releaseFailedRequest: (() => void) | undefined;
    const failedRequestGate = new Promise<void>((resolve) => {
      releaseFailedRequest = resolve;
    });

    await page.route("**/api/settings", async (route) => {
      if (route.request().method() === "PUT") {
        updateRequestCount += 1;
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ code: 200, data: route.request().postDataJSON(), message: "ok" }),
        });
        return;
      }

      settingsRequestCount += 1;
      if (settingsRequestCount === 1) {
        await failedRequestGate;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ code: 503, message: "service unavailable" }),
        });
        return;
      }

      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          code: 200,
          data: { siteName: "远端店铺名称", contactPhone: "400-123-4567" },
          message: "ok",
        }),
      });
    });

    await page.goto("/admin/site-content");
    await expect(page.getByText("正在加载店铺资料…")).toBeVisible();
    releaseFailedRequest?.();

    await expect(page.getByText("店铺资料读取失败。为避免覆盖未知的远端内容，当前已禁止编辑和保存。"))
      .toBeVisible();
    await expect(page.getByRole("button", { name: "保存设置" })).toHaveCount(0);

    await page.getByRole("button", { name: "重新加载" }).click();
    await expect(page.getByLabel("网站名称")).toHaveValue("远端店铺名称");
    await expect(page.getByRole("button", { name: "保存设置" })).toBeEnabled();

    await page.getByLabel("网站名称").fill("已确认的店铺名称");
    await page.getByRole("button", { name: "保存设置" }).click();
    await expect.poll(() => updateRequestCount).toBe(1);
    await expect(page.getByText("店铺资料已保存")).toBeVisible();
    expect(antdConsoleProblems).toEqual([]);
  });

  test("远端明确返回空数据时展示空态并允许首次配置", async ({ page }) => {
    await authenticateAdmin(page);
    await page.route("**/api/settings", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ code: 200, data: {}, message: "ok" }),
      }),
    );

    await page.goto("/admin/site-content");

    await expect(page.getByText("当前尚未配置店铺资料。填写下方表单并保存后，将用于网站页眉、页脚和默认 SEO。"))
      .toBeVisible();
    await expect(page.getByRole("button", { name: "保存设置" })).toBeEnabled();
  });
});
