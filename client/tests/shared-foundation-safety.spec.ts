import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const appSource = readFileSync("src/App.tsx", "utf8");
const analyticsSource = readFileSync("src/hooks/useAnalytics.ts", "utf8");
const viteSource = readFileSync("vite.config.ts", "utf8");
const homeSource = readFileSync("src/pages/public/Home/index.tsx", "utf8");
const analyticsBannerSource = readFileSync(
  "src/components/privacy/AnalyticsConsentBanner.tsx",
  "utf8",
);
const publishedPageSource = readFileSync(
  "src/page-builder/runtime/PublishedPageDecoration.tsx",
  "utf8",
);
const editorPagesSource = readFileSync(
  "src/page-builder/config/editorPages.ts",
  "utf8",
);

test("生产构建关闭开发画廊、mock mode 与静态首页 fallback", () => {
  expect(appSource).toContain("const TemplateGallery = import.meta.env.DEV");
  expect(viteSource).toContain('command === "build" && mode === "mock"');
  expect(homeSource).toContain("<PublicPageFallback");
  expect(publishedPageSource).toContain(
    'data-production-fallback={content ? "safe-status" : "disabled"}',
  );
});

test("分析必须显式配置并获得访客同意", () => {
  expect(analyticsSource).toContain('VITE_ANALYTICS_ENABLED === "true"');
  expect(analyticsSource).toContain("hasAnalyticsConsent()");
  expect(analyticsSource).toContain("consentGranted: true");
  expect(analyticsSource).toContain("consentVersion: ANALYTICS_CONSENT_VERSION");
  expect(analyticsSource).toContain("hc_analytics_consent");
  expect(analyticsSource).toContain("sessionStorage");
  expect(analyticsSource).not.toContain("localStorage");
  expect(analyticsBannerSource).toContain("撤回同意");
  expect(analyticsBannerSource).toContain("同意匿名分析");
});

test("六个公开页面只接受已发布 PageDocument，缺失时使用安全空状态", () => {
  for (const key of ["home", "products", "catalog", "custom", "about", "contact"]) {
    expect(editorPagesSource).toContain(`key: "${key}"`);
  }
  expect(publishedPageSource).toContain(
    'data-production-fallback={content ? "safe-status" : "disabled"}',
  );
  expect(publishedPageSource).toContain("内容暂不可用");
  expect(publishedPageSource).not.toContain("fallbackData");
  expect(publishedPageSource).not.toContain('createEditorPageDefault("products")');
  expect(homeSource).not.toContain("FallbackHome");
  expect(homeSource).not.toContain("productFocus");
  expect(homeSource).not.toContain("/images/products/");
});
