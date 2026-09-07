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
const publicLayoutSource = readFileSync(
  "src/components/layout/PublicLayout.tsx",
  "utf8",
);
const errorBoundarySource = readFileSync(
  "src/components/common/ErrorBoundary.tsx",
  "utf8",
);

test("共享错误边界使用中性降级并阻止异常页面进入索引", () => {
  expect(errorBoundarySource).toContain('robots.content = "noindex, nofollow"');
  expect(errorBoundarySource).toContain('document.title = "页面加载异常"');
  expect(errorBoundarySource).toContain("当前页面暂时无法显示，请刷新后重试。");
  expect(errorBoundarySource).not.toContain("可通过联系页面提交需求");
  expect(errorBoundarySource).not.toContain("页面加载异常｜海川珠宝");
});

test("生产构建关闭开发画廊、mock mode 与静态首页 fallback", () => {
  expect(appSource).toContain("const TemplateGallery = import.meta.env.DEV");
  expect(viteSource).toContain('command === "build" && mode === "mock"');
  expect(homeSource).toContain("<PublicPageFallback");
  expect(publishedPageSource).toContain(
    'data-production-fallback={content ? "safe-status" : "disabled"}',
  );
  expect(publicLayoutSource).toContain("{USE_MOCK && (");
  expect(publicLayoutSource).toContain('aria-label="演示数据说明"');
  expect(publicLayoutSource).toContain("不代表真实库存、价格或服务承诺");
});

test("分析必须显式配置并获得访客同意", () => {
  expect(analyticsSource).toContain('VITE_ANALYTICS_ENABLED === "true"');
  expect(analyticsSource).toContain("hasAnalyticsConsent()");
  expect(analyticsSource).toContain("consentGranted: true");
  expect(analyticsSource).toContain("consentVersion: ANALYTICS_CONSENT_VERSION");
  expect(analyticsSource).toContain("hc_analytics_consent");
  expect(analyticsSource).toContain("sessionStorage");
  expect(analyticsSource).toContain('const ANALYTICS_VISITOR_KEY = "hc.analytics-visitor"');
  expect(analyticsSource).toContain("localStorage.removeItem(ANALYTICS_VISITOR_KEY)");
  expect(analyticsSource.indexOf("hasAnalyticsConsent()")).toBeLessThan(
    analyticsSource.indexOf("void send"),
  );
  expect(analyticsBannerSource).toContain("撤回同意");
  expect(analyticsBannerSource).toContain("同意匿名分析");
});

test("分析使用匿名访客、30 分钟会话并排除敏感路径", () => {
  expect(analyticsSource).toContain("ANALYTICS_SESSION_TIMEOUT_MS = 30 * 60 * 1000");
  expect(analyticsSource).toContain('createAnalyticsId("v")');
  expect(analyticsSource).toContain("visitorId: ensureVisitorId()");
  expect(analyticsSource).toContain("isTrackableAnalyticsPath");
  for (const path of ["admin", "preview", "customer", "cart", "checkout", "partner"]) {
    expect(analyticsSource).toContain(path);
  }
  expect(analyticsBannerSource).toContain("location.pathname");
});

test("标准电商事件齐全且 purchase 不复用订单创建语义", () => {
  for (const eventName of [
    "view_item_list",
    "view_item",
    "search",
    "add_to_cart",
    "remove_from_cart",
    "view_cart",
    "begin_checkout",
    "add_payment_info",
    "purchase",
    "refund",
  ]) {
    expect(analyticsSource).toContain(`"${eventName}"`);
  }
  expect(analyticsSource).toContain('fire("order_created"');
  expect(analyticsSource).toContain('fireOnce("purchase"');
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
