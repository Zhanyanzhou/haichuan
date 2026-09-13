import { defineConfig, devices } from "@playwright/test";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appMode = process.env.PLAYWRIGHT_APP_MODE === "mock" ? "mock" : "development";
// 旧测试只在 Node 侧读取该变量决定网络夹具/skip；envPrefix 白名单确保它不进入浏览器。
process.env.VITE_USE_MOCK = appMode === "mock" ? "true" : "false";
// Playwright 的 webServer 随测试进程启停，必须与人工开发服务隔离，避免测试结束后
// 把用户正在访问的 5173/5174 一并带走，或错误复用缺少真实后端的临时前端。
const defaultTestPort = appMode === "mock" ? 5177 : 5176;
const port = Number(process.env.PLAYWRIGHT_PORT || defaultTestPort);
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${port}`;
const forwardedProto = process.env.PLAYWRIGHT_FORWARDED_PROTO;
const browserChannel = process.env.PLAYWRIGHT_BROWSER_CHANNEL === "chrome"
  ? "chrome" as const
  : undefined;
const browserExecutablePath = process.env.PLAYWRIGHT_BROWSER_EXECUTABLE_PATH || undefined;

// 每个 spec 必须且只能属于一个确定性边界。混合文件按主要业务参与者归类；
// 真实环境会话与真实接口验收另行执行，不能用这些自有 API 夹具代替。
const testBoundaryFiles = {
  public: [
    "public-accessibility.spec.ts",
    "content-template-previews.spec.ts",
    "content-template-renderers.spec.ts",
    "mock-product-query.spec.ts",
    "privacy-trust.spec.ts",
    "public-catalog-detail-foundation.spec.ts",
    "public-catalog-server-pagination.spec.ts",
    "public-service-p0.spec.ts",
    "public-service-third-batch.spec.ts",
    "responsive-public.spec.ts",
    "shared-foundation-safety.spec.ts",
    "site-maturity-foundation.spec.ts",
    "unwrap-boundary.spec.ts",
  ],
  customer: [
    "closure-locale-notifications.spec.ts",
    "customer-consultation-reply.spec.ts",
    "customer-quotation-contract.spec.ts",
    "customer-profile-management.spec.ts",
    "public-access.spec.ts",
    "public-sales-mode.spec.ts",
    "recommendation-client.spec.ts",
    "trade-safety-ui.spec.ts",
  ],
  admin: [
    "recipe-radius-input.test.ts",
    "template-inline-text-guard.unit.ts",
    "template-layout-diagram.unit.ts",
    "template-media-arrangement.unit.ts",
    "template-media-history.unit.ts",
    "template-purpose-media-inheritance.unit.ts",
    "template-stress-preview-engine.unit.ts",
    "template-editor-refinement.admin.spec.ts",
    "template-management-structure.admin.spec.ts",
    "template-property-reliability.admin.spec.ts",
    "template-default-content-layout.admin.spec.ts",
    "template-recipe-media-references.spec.ts",
    "template-recipe-editor.admin.spec.ts",
    "template-recipe-renderer.spec.ts",
    "template-recipe-generator.spec.ts",
    "template-design-width.spec.ts",
    "template-recipe-wizard.admin.spec.ts",
    "number-field-transactions.admin.spec.ts",
    "template-properties-page-scope.admin.spec.ts",
    "template-native-responsive.admin.spec.ts",
    "template-breakpoint-comparison.admin.spec.ts",
    "admin-auth-store-capabilities.spec.ts",
    "admin-auth-real-closure.spec.ts",
    "admin-header-toolbar.spec.ts",
    "admin-operating-foundation-states.spec.ts",
    "admin-role-route-consistency.spec.ts",
    "attribute-manage.spec.ts",
    "category-manage.spec.ts",
    "category-references-field.spec.ts",
    "customer-admin-client.spec.ts",
    "dynamic-template-page-instance.spec.ts",
    "editable-target-geometry.spec.ts",
    "editable-targets.spec.ts",
    "editor-draft-recovery.admin.spec.ts",
    "editor-leave-guard.admin.spec.ts",
    "inquiry-context.admin.spec.ts",
    "lead-follow-up-contract.spec.ts",
    "media-library.admin.spec.ts",
    "media-video-real-closure.admin.spec.ts",
    "order-manage-capabilities.spec.ts",
    "page-builder-real-closure.spec.ts",
    "page-publish-validation.admin.spec.ts",
    "page-revision-optimistic-lock.spec.ts",
    "product-editor-contract.spec.ts",
    "product-editor-regression.spec.ts",
    "product-manage-query.spec.ts",
    "product-media-pointer.spec.ts",
    "product-metadata-clients.spec.ts",
    "product-references-field.spec.ts",
    "puck-visual-editor.spec.ts",
    "quotation-manage-safety.spec.ts",
    "responsive-admin.admin.spec.ts",
    "review-client.spec.ts",
    "settings-client.spec.ts",
    "shipping-template-client.spec.ts",
    "site-content-access.spec.ts",
    "site-content-load-protection.spec.ts",
    "statistics-client.spec.ts",
    "template-lifecycle-unification.admin.spec.ts",
    "template-editor-selection-core.spec.ts",
    "template-canvas-interaction.admin.spec.ts",
    "template-canvas-intuitive-controls.admin.spec.ts",
    "template-responsive-contract.spec.ts",
    "template-native-design.admin.spec.ts",
    "template-layout-conversion.admin.spec.ts",
    "template-canvas-golden-closure.admin.spec.ts",
    "template-page-scope-separation.spec.ts",
    "template-persisted-draft-boundaries.admin.spec.ts",
    "template-trial-content.admin.spec.ts",
    "template-new-template-flow.admin.spec.ts",
    "template-production-guide.admin.spec.ts",
    "template-inspector-usage.admin.spec.ts",
    "template-layout-starters.admin.spec.ts",
    "template-design-authoring-core.spec.ts",
    "template-design-integrated-flow.admin.spec.ts",
    "template-structure-keyboard.spec.ts",
    "template-publish-workflow.spec.ts",
    "template-version-origin.spec.ts",
    "ui-color-standards.spec.ts",
    "visual-editor-hero.spec.ts",
    "warehouse-manage.spec.ts",
    "workspace-controller-boundaries.spec.ts",
  ],
} as const;

const boundaryEntries = Object.entries(testBoundaryFiles).flatMap(([boundary, files]) =>
  files.map((file) => ({ boundary, file })),
);
const duplicateFiles = boundaryEntries
  .filter(({ file }, index, entries) => entries.findIndex((entry) => entry.file === file) !== index)
  .map(({ file }) => file);
const discoveredSpecFiles = readdirSync(fileURLToPath(new URL("./tests", import.meta.url)))
  .filter((file) => /\.(?:spec|test|unit)\.ts$/.test(file))
  .sort();
const classifiedFiles = new Set(boundaryEntries.map(({ file }) => file));
const unclassifiedFiles = discoveredSpecFiles.filter((file) => !classifiedFiles.has(file));
const missingFiles = [...classifiedFiles].filter((file) => !discoveredSpecFiles.includes(file));

if (duplicateFiles.length > 0 || unclassifiedFiles.length > 0 || missingFiles.length > 0) {
  throw new Error(
    [
      duplicateFiles.length > 0 ? `重复归类: ${[...new Set(duplicateFiles)].join(", ")}` : "",
      unclassifiedFiles.length > 0 ? `未归类: ${unclassifiedFiles.join(", ")}` : "",
      missingFiles.length > 0 ? `清单中文件不存在: ${missingFiles.join(", ")}` : "",
    ].filter(Boolean).join("；"),
  );
}

const testMatch = (files: readonly string[]) => files.map((file) => `**/${file}`);

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI
    ? [["html", { open: "never" }], ["github"]]
    : [["html", { open: "never" }]],
  use: {
    baseURL,
    extraHTTPHeaders: forwardedProto
      ? { "X-Forwarded-Proto": forwardedProto }
      : undefined,
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "public-chromium",
      testMatch: testMatch(testBoundaryFiles.public),
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "customer-chromium",
      testMatch: testMatch(testBoundaryFiles.customer),
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "admin-chromium",
      testMatch: testMatch(testBoundaryFiles.admin),
      use: {
        ...devices["Desktop Chrome"],
        ...(browserExecutablePath
          ? { launchOptions: { executablePath: browserExecutablePath } }
          : browserChannel
            ? { channel: browserChannel }
            : {}),
      },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: `npm run dev -- --mode ${appMode} --host 127.0.0.1 --port ${port}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
