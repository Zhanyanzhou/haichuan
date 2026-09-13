import { expect, test } from "@playwright/test";

const fixtureHtml = `<!doctype html>
<html lang="zh-CN">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
  <body>
    <div id="root"></div>
    <script type="module">
      import RefreshRuntime from "/@react-refresh";
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
    </script>
    <script type="module" src="/tests/fixtures/secure-image.tsx"></script>
  </body>
</html>`;

const svg = (color: string) => `
  <svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000">
    <rect width="800" height="1000" fill="${color}" />
  </svg>`;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const createObjectURL = URL.createObjectURL.bind(URL);
    const revokeObjectURL = URL.revokeObjectURL.bind(URL);
    (window as Window & { __objectUrls?: { created: string[]; revoked: string[] } }).__objectUrls = {
      created: [],
      revoked: [],
    };
    URL.createObjectURL = (value) => {
      const url = createObjectURL(value);
      (window as Window & { __objectUrls: { created: string[]; revoked: string[] } }).__objectUrls.created.push(url);
      return url;
    };
    URL.revokeObjectURL = (url) => {
      (window as Window & { __objectUrls: { created: string[]; revoked: string[] } }).__objectUrls.revoked.push(url);
      revokeObjectURL(url);
    };
  });
  await page.route(/\/__secure-image-fixture$/, (route) => route.fulfill({
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: fixtureHtml,
  }));
  await page.route("**/api/products/public/1/media/10**", (route) => route.fulfill({
    status: 200,
    contentType: "image/svg+xml",
    body: svg("#30363a"),
  }));
  await page.route(/\/api\/payments\/(1|2)\/proof$/, (route) => route.fulfill({
    status: 200,
    contentType: "image/svg+xml",
    body: svg("#8c7450"),
  }));
  await page.route("**/api/payments/404/proof", (route) => route.fulfill({ status: 404, body: "missing" }));
  await page.route("**/missing-fallback.jpg", (route) => route.fulfill({ status: 404, body: "missing" }));
});

test("responsive public image has stable dimensions and the sole LCP priority contract", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/__secure-image-fixture");

  const image = page.locator("img.priority-image");
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute("src", /\/api\/products\/public\/1\/media\/10$/);
  await expect(image).toHaveAttribute(
    "srcset",
    "/api/products/public/1/media/10?width=400 400w, /api/products/public/1/media/10?width=800 800w",
  );
  await expect(image).toHaveAttribute("sizes", "(max-width: 600px) 100vw, 800px");
  await expect(image).toHaveAttribute("width", "800");
  await expect(image).toHaveAttribute("height", "1000");
  await expect(image).toHaveAttribute("loading", "eager");
  await expect(image).toHaveAttribute("fetchpriority", "high");
});

test("explicit visibility deferral prevents the offscreen request until the viewport approaches", async ({ page }) => {
  let deferredRequests = 0;
  await page.route("**/deferred.svg", (route) => {
    deferredRequests += 1;
    return route.fulfill({ status: 200, contentType: "image/svg+xml", body: svg("#647075") });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/__secure-image-fixture");

  expect(deferredRequests).toBe(0);
  await expect(page.locator("img.deferred-image")).toHaveCount(0);
  await page.getByRole("region", { name: "Deferred image" }).scrollIntoViewIfNeeded();
  await expect(page.locator("img.deferred-image")).toBeVisible();
  await expect.poll(() => deferredRequests).toBe(1);
});

test("private Blob URLs are revoked on source replacement and unmount", async ({ page }) => {
  await page.goto("/__secure-image-fixture");
  await expect(page.locator("img.private-image")).toBeVisible();

  await page.getByRole("button", { name: "Replace private image" }).click();
  await expect.poll(() => page.evaluate(() => (
    window as Window & { __objectUrls: { created: string[]; revoked: string[] } }
  ).__objectUrls.created.length)).toBe(2);
  await expect.poll(() => page.evaluate(() => (
    window as Window & { __objectUrls: { created: string[]; revoked: string[] } }
  ).__objectUrls.revoked.length)).toBe(1);

  await page.getByRole("button", { name: "Unmount private image" }).click();
  await expect.poll(() => page.evaluate(() => (
    window as Window & { __objectUrls: { created: string[]; revoked: string[] } }
  ).__objectUrls.revoked.length)).toBe(2);
});

test("double image failure keeps an accessible stable-size placeholder", async ({ page }) => {
  await page.goto("/__secure-image-fixture");
  const placeholder = page.getByRole("img", { name: "Unavailable proof（图片暂不可用）" });
  await expect(placeholder).toBeVisible();
  const box = await placeholder.boundingBox();
  expect(box?.width).toBe(160);
  expect(box?.height).toBe(90);
});

test("structured data serializes safe facts and drops an invalid root atomically", async ({ page }) => {
  await page.goto("/__secure-image-fixture");
  const valid = page.locator('script[data-structured-data="fixture-valid"]');
  await expect(valid).toHaveCount(1);
  expect(await valid.textContent()).toContain("\\u003c/script>");
  expect(JSON.parse((await valid.textContent()) || "{}")).toMatchObject({
    "@type": "Organization",
    name: "海川</script>珠宝",
  });
  await expect(page.locator('script[data-structured-data="fixture-invalid"]')).toHaveCount(0);
});

test("public SEO authority stays closed without immutable pre-render evidence", async ({ page }) => {
  await page.route("**/api/settings/public**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      code: 200,
      data: {
        siteName: "海川珠宝",
        seoTitle: "海川珠宝",
        seoDescription: "浏览珠宝作品，了解定制与顾问服务。",
      },
    }),
  }));
  await page.goto("/privacy");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");

  const configuredOrigin = process.env.VITE_PUBLIC_SITE_ORIGIN;
  if (!configuredOrigin) {
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
    await expect(page.locator('meta[property="og:url"]')).toHaveCount(0);
    await expect(page.locator('meta[name="twitter:title"]')).toHaveCount(0);
    await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(0);
    await expect(page.locator('script[data-structured-data="organization"]')).toHaveCount(0);
    return;
  }

  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    `${configuredOrigin}/privacy`,
  );
  await expect(page.locator('meta[property="og:url"]')).toHaveCount(0);
  await expect(page.locator('meta[name="twitter:title"]')).toHaveCount(0);
  await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(0);
  await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveCount(0);
  await expect(page.locator('script[data-structured-data="organization"]')).toHaveCount(1);
});
