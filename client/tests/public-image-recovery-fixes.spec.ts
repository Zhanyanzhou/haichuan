import { expect, test, type Page } from "@playwright/test";

// 使用真实 SecureImage 和受控媒体响应验证失败恢复，不调用真实受控媒体或写接口。
async function mountImageProbe(page: Page, query = "") {
  await page.route("**/__image-recovery-probe*", (route) => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><html><head><meta charset="utf-8"><script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
    </script></head><body><div id="root"></div><script type="module" src="/tests/fixtures/secure-image-recovery.tsx"></script></body></html>`,
  }));
  await page.goto(`/__image-recovery-probe${query}`);
}

const validImage = '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" fill="#eee"/></svg>';

test("独立公开图片失败后可原地重试并保留尺寸", async ({ page }) => {
  let attempts = 0;
  await page.route("**/__secure-image.svg?*", (route) => {
    const kind = new URL(route.request().url()).searchParams.get("kind");
    if (kind === "standalone" && ++attempts === 1) return route.abort("failed");
    return route.fulfill({ contentType: "image/svg+xml", body: validImage });
  });
  await mountImageProbe(page);
  const region = page.getByRole("region", { name: "独立图片" });
  await expect(region.getByRole("button", { name: "重新加载图片" })).toBeVisible();
  const failedBox = await region.getByRole("group").boundingBox();
  await region.getByRole("button", { name: "重新加载图片" }).click();
  const image = region.getByRole("img", { name: "恢复测试作品" });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(240);
  const readyBox = await image.boundingBox();
  expect(readyBox?.width).toBe(failedBox?.width);
  expect(readyBox?.height).toBe(failedBox?.height);
  expect(attempts).toBe(2);
});

test("链接和按钮内的失败图片不嵌套重试按钮，网络恢复后自动回读", async ({ page }) => {
  const attempts = new Map<string, number>();
  await page.route("**/__secure-image.svg?*", (route) => {
    const key = new URL(route.request().url()).searchParams.get("kind") || "";
    const count = (attempts.get(key) || 0) + 1;
    attempts.set(key, count);
    return count === 1
      ? route.abort("failed")
      : route.fulfill({ contentType: "image/svg+xml", body: validImage });
  });
  await mountImageProbe(page);
  const link = page.getByRole("link", { name: "进入作品" });
  const button = page.getByRole("button", { name: "选择图片", exact: true });
  await expect(link).toContainText("图片暂不可用");
  await expect(button).toContainText("图片暂不可用");
  await expect(link.locator("button")).toHaveCount(0);
  await expect(button.locator("button")).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => link.locator("img").evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(240);
  await expect.poll(() => button.locator("img").evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(240);
  expect([...attempts.values()]).toEqual([2, 2, 2]);
});

test("私有图片重试仍走会话Blob请求且不向原生img透出私有地址", async ({ page }) => {
  let attempts = 0;
  const domains: Array<string | undefined> = [];
  await page.route("**/api/products/catalog/88/media/99", (route) => {
    attempts += 1;
    domains.push(route.request().headers()["x-session-domain"]);
    return attempts === 1
      ? route.fulfill({ status: 503, body: "temporary media failure" })
      : route.fulfill({ contentType: "image/svg+xml", body: validImage });
  });
  await page.route("**/__secure-image.svg?*", (route) => route.fulfill({ contentType: "image/svg+xml", body: validImage }));
  await mountImageProbe(page, "?private=1");
  const region = page.getByRole("region", { name: "独立图片" });
  await region.getByRole("button", { name: "重新加载图片" }).click();
  const image = region.getByRole("img", { name: "恢复测试作品" });
  await expect(image).toHaveAttribute("src", /^blob:/);
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(240);
  expect(domains).toEqual(["customer", "customer"]);
});

test("隐私页联系方式不受整站设置未就绪影响，失败后可重试", async ({ page }) => {
  let contactReads = 0;
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/stream")) return route.abort();
    if (path === "/api/settings/public") return route.fulfill({ status: 503, json: { message: "site not ready" } });
    if (path === "/api/settings/public-contact") {
      contactReads += 1;
      if (contactReads === 1) return route.fulfill({ status: 503, json: { message: "temporary failure" } });
      return route.fulfill({ json: { code: 200, data: { contactPhone: "020-00000000", contactEmail: "test@example.invalid" } } });
    }
    if (path === "/api/customers/me") return route.fulfill({ status: 401, json: { message: "fixture anonymous" } });
    return route.fulfill({ json: { code: 200, data: null } });
  });
  await page.goto("/privacy");
  await expect(page.getByRole("alert").filter({ hasText: "联系信息暂时无法加载" })).toBeVisible();
  await page.getByRole("button", { name: "重新加载联系方式" }).click();
  await expect(page.getByRole("link", { name: "电话：020-00000000", exact: true })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "联系信息暂时无法加载" })).toHaveCount(0);
  expect(contactReads).toBe(2);
});
