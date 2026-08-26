import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildPublicUrl,
  normalizePublicSiteOrigin,
} from "../src/utils/publicSiteUrl";
import { isNonIndexablePublicRoute } from "../src/utils/publicSeoPolicy";
import {
  publicPageDocumentStreamUrl,
  publicProductStreamUrl,
} from "../src/services/httpClient";

test("公开站点 Origin 拒绝不安全或带路径配置", () => {
  expect(normalizePublicSiteOrigin("https://jewelry.example.com")).toBe(
    "https://jewelry.example.com",
  );
  expect(normalizePublicSiteOrigin("http://jewelry.example.com")).toBeNull();
  expect(
    normalizePublicSiteOrigin("http://127.0.0.1:5173", { allowHttp: true }),
  ).toBe("http://127.0.0.1:5173");
  expect(
    normalizePublicSiteOrigin("https://jewelry.example.com/store"),
  ).toBeNull();
  expect(
    buildPublicUrl("https://jewelry.example.com", "//hostile.example/path"),
  ).toBe("https://jewelry.example.com/hostile.example/path");
});

test("账户、交易、受控预览和开发页统一使用非索引路由策略", () => {
  for (const pathname of [
    "/customer",
    "/customer/forgot",
    "/CUSTOMER/RESET",
    "/cart",
    "/checkout/confirm",
    "/partner",
    "/en",
    "/en/catalog",
    "/preview/home",
    "/__templates",
  ]) {
    expect(isNonIndexablePublicRoute(pathname), pathname).toBe(true);
  }

  for (const pathname of [
    "/",
    "/catalog",
    "/products/HC-001",
    "/custom",
    "/contact",
    "/privacy",
    "/business-info",
  ]) {
    expect(isNonIndexablePublicRoute(pathname), pathname).toBe(false);
  }
});

test("Docker 构建只传递公开 Vite 配置且 Nginx 二次隔离非公开页面", () => {
  const dockerfile = readFileSync(resolve("Dockerfile"), "utf8");
  const compose = readFileSync(resolve("../docker-compose.yml"), "utf8");
  const nginx = readFileSync(resolve("nginx.conf"), "utf8");

  expect(dockerfile).toContain('ARG VITE_PUBLIC_SITE_ORIGIN=""');
  expect(dockerfile).toContain('ARG VITE_ANALYTICS_ENABLED="false"');
  expect(compose).toContain("VITE_PUBLIC_SITE_ORIGIN:");
  expect(compose).not.toMatch(/args:[\s\S]{0,500}(JWT_SECRET|DATABASE_URL)/);
  expect(nginx).toContain("location = /__templates");
  expect(nginx).toContain("TemplateGallery-");
  expect(nginx).toContain("location ~* ^/en(/|$)");
  expect(nginx).toContain(
    "location ~* ^/(admin|preview|customer|cart|checkout|partner)(/|$)",
  );
  expect(nginx).toContain("map $request_uri $hc_robots_tag");
  expect(nginx).toContain('~*^/en(/|$) "noindex, nofollow"');
  expect(nginx).toContain(
    'add_header X-Robots-Tag $hc_robots_tag always',
  );
  expect(nginx).not.toContain('add_header X-Robots-Tag "noindex, nofollow"');
  expect(nginx).toMatch(
    /location = \/api\/products\/catalog\/stream \{[\s\S]*?proxy_buffering off;[\s\S]*?\}/,
  );
});

test("公开 SSE URL 显式携带内容语言，英文不会缺省订阅中文流", () => {
  expect(publicProductStreamUrl("zh-CN")).toContain("locale=zh-CN");
  expect(publicProductStreamUrl("en")).toContain("locale=en");
  expect(publicPageDocumentStreamUrl("zh-CN")).toContain("locale=zh-CN");
  expect(publicPageDocumentStreamUrl("en")).toContain("locale=en");
});

test("未知公开路径呈现可恢复的品牌 404 且禁止索引", async ({ page }) => {
  await page.goto("/this-page-does-not-exist");

  await expect(page).toHaveURL(/this-page-does-not-exist$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "此页未被找到" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "返回首页" })).toHaveAttribute(
    "href",
    "/",
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex,\s*nofollow/,
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
});

test("404 在 390px 视口无横向溢出且键盘焦点清晰", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/missing-on-mobile");
  await page.getByRole("link", { name: "返回首页" }).focus();

  await expect(page.getByRole("link", { name: "返回首页" })).toBeFocused();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

for (const viewport of [
  { label: "desktop", width: 1440, height: 900 },
  { label: "mobile", width: 390, height: 844 },
]) {
  test(`账户旅程禁止索引，离开后恢复公开页面索引状态 · ${viewport.label}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/customer/forgot");

    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex,\s*nofollow/,
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);

    await page.goto("/privacy");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /index,\s*follow/,
    );
    if (process.env.VITE_PUBLIC_SITE_ORIGIN) {
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        new URL("/privacy", page.url()).href,
      );
    }
  });
}
