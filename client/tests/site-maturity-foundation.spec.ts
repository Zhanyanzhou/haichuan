import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildPublicUrl,
  normalizePublicSiteOrigin,
} from "../src/utils/publicSiteUrl";

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
  expect(nginx).toContain('X-Robots-Tag "noindex, nofollow"');
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
