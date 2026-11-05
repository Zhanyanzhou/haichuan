import { expect, test } from "@playwright/test";

test("后台登录入口不下载公开页壳层或公开内容渲染器", async ({ page }) => {
  test.skip(process.env.PLAYWRIGHT_APP_MODE === "mock", "需要真实模块请求观测");
  const publicModules: string[] = [];
  page.on("request", (request) => {
    if (/\/(?:src\/(?:components\/layout\/PublicLayout|page-builder\/runtime\/PuckDocumentRenderer)\.tsx|assets\/(?:PublicLayout|PuckDocumentRenderer)-[^/]+\.js)(?:\?.*)?$/.test(request.url())) {
      publicModules.push(request.url());
    }
  });
  await page.route("**/api/**", (route) => route.fulfill({ json: { code: 200, data: null } }));
  await page.goto("/admin/login");
  await expect(page.getByPlaceholder("输入用户名")).toBeVisible();
  expect(publicModules).toEqual([]);
});
