import { expect, test, type Page } from "@playwright/test";
import { installAdminSession } from "./fixtures/session-auth";

async function authenticateProductEditor(page: Page) {
  await installAdminSession(page, {
    username: "product-metadata-editor",
    realName: "商品资料编辑员",
  });
}

async function fulfillApi(route: Parameters<Parameters<Page["route"]>[1]>[0], data: unknown) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ code: 200, data, message: "ok" }),
  });
}

test("标签字典加载与新建请求保持商品元数据合同", async ({ page }) => {
  await authenticateProductEditor(page);
  const writes: Array<{
    headers: Record<string, string>;
    body: Record<string, unknown>;
  }> = [];

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/auth/profile") return route.fallback();
    if (path === "/api/tags" && request.method() === "POST") {
      writes.push({
        headers: request.headers(),
        body: request.postDataJSON(),
      });
    }
    const data =
      path === "/api/tags" && request.method() === "GET"
        ? [
            {
              id: 1,
              name: "古法工艺",
              slug: "古法工艺",
              group: "工艺",
              sortOrder: 1,
              isActive: true,
              _count: { productTags: 3 },
            },
          ]
        : path === "/api/tags" && request.method() === "POST"
          ? { id: 2, name: "节日赠礼", group: "场景" }
          : path === "/api/settings/flags"
            ? {
                commerceEnabled: false,
                cartEnabled: false,
                paymentEnabled: false,
              }
            : {};
    await fulfillApi(route, data);
  });

  await page.goto("/admin/tags");
  await expect(page.getByRole("heading", { name: "标签字典" })).toBeVisible();
  await expect(page.getByText("古法工艺", { exact: true })).toBeVisible();
  await expect(page.getByText("3", { exact: true })).toBeVisible();

  await page.evaluate(() => {
    document.cookie = "hc_csrf=product-metadata-csrf; path=/";
  });
  await page.getByRole("button", { name: "新建标签" }).click();
  const dialog = page.getByRole("dialog", { name: "新建标签" });
  await dialog.getByLabel("标签名称").fill("节日赠礼");
  await dialog.getByLabel("分组（选填）").fill("场景");
  await dialog.getByRole("button", { name: /保\s*存/ }).click();

  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].headers.authorization).toBeUndefined();
  expect(writes[0].headers["x-csrf-token"]).toBe("product-metadata-csrf");
  expect(writes[0].body).toMatchObject({
    name: "节日赠礼",
    group: "场景",
    sortOrder: 0,
  });
});

test("AI 分类记录、报告与人工确认保持现有请求合同", async ({ page }) => {
  await authenticateProductEditor(page);
  const confirmations: Array<{
    url: string;
    headers: Record<string, string>;
    body: Record<string, unknown>;
  }> = [];

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/auth/profile") return route.fallback();
    if (
      path === "/api/ai-classify/confirm/7" &&
      request.method() === "PUT"
    ) {
      confirmations.push({
        url: path,
        headers: request.headers(),
        body: request.postDataJSON(),
      });
    }
    const data =
      path === "/api/ai-classify/records"
        ? {
            list: [
              {
                id: 7,
                predictedCategoryId: 2,
                predictedCategoryName: "平安扣",
                confidence: 92.5,
                status: "pending_confirm",
                createdAt: "2026-08-26 10:00",
              },
            ],
            total: 1,
          }
        : path === "/api/ai-classify/report"
          ? { accuracy: "95%", todayCount: 3 }
          : path === "/api/ai-classify/confirm/7"
            ? { id: 7, status: "confirmed" }
            : path === "/api/settings/flags"
              ? {
                  commerceEnabled: false,
                  cartEnabled: false,
                  paymentEnabled: false,
                }
              : {};
    await fulfillApi(route, data);
  });

  await page.goto("/admin/ai-classify");
  await expect(
    page.getByRole("heading", { name: "AI 智能分类" }),
  ).toBeVisible();
  await expect(page.getByText("平安扣", { exact: true })).toBeVisible();
  await expect(page.getByText("95%", { exact: true })).toBeVisible();

  await page.evaluate(() => {
    document.cookie = "hc_csrf=product-metadata-csrf; path=/";
  });
  await page.getByRole("button", { name: "确认结果" }).click();

  await expect.poll(() => confirmations.length).toBe(1);
  expect(confirmations[0].url).toBe("/api/ai-classify/confirm/7");
  expect(confirmations[0].headers.authorization).toBeUndefined();
  expect(confirmations[0].headers["x-csrf-token"]).toBe(
    "product-metadata-csrf",
  );
  expect(confirmations[0].body).toEqual({
    status: "confirmed",
    confirmedCategoryId: 2,
  });
});

test("AI 分类加载失败不会伪装成零指标，并可分别重试恢复", async ({ page }) => {
  await authenticateProductEditor(page);
  await page.setViewportSize({ width: 390, height: 844 });
  let mode: "fail" | "success" = "fail";

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/auth/profile") return route.fallback();
    if (path === "/api/ai-classify/records" || path === "/api/ai-classify/report") {
      if (mode === "fail") {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ code: 503, data: null, message: "test failure" }),
        });
        return;
      }
      await fulfillApi(
        route,
        path.endsWith("/records")
          ? {
              list: [{
                id: 9,
                predictedCategoryId: 3,
                predictedCategoryName: "戒指",
                confidence: 88,
                status: "pending_confirm",
                createdAt: "2026-08-27 10:00",
              }],
              total: 26,
            }
          : { accuracy: "95.0", autoConfirmRate: "42.3", todayCount: 4 },
      );
      return;
    }
    await fulfillApi(
      route,
      path === "/api/settings/flags"
        ? { commerceEnabled: false, cartEnabled: false, paymentEnabled: false }
        : {},
    );
  });

  await page.goto("/admin/ai-classify");
  await expect(
    page.getByText("识别记录加载失败，请稍后重新加载。"),
  ).toBeVisible();
  await expect(
    page.getByText("识别指标加载失败，请稍后重新加载。"),
  ).toBeVisible();
  await expect(page.getByText("0", { exact: true })).toHaveCount(0);

  mode = "success";
  const retryButtons = page.getByRole("button", { name: "重新加载" });
  await retryButtons.first().click();
  await retryButtons.last().click();

  await expect(page.getByText("戒指", { exact: true })).toBeVisible();
  await expect(page.getByText("26", { exact: true })).toBeVisible();
  await expect(page.getByText("42.3%", { exact: true })).toBeVisible();
  await expect(page.getByText("95.0%", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
