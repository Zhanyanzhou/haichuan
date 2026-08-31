import { defineConfig, devices } from "@playwright/test";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appMode = process.env.PLAYWRIGHT_APP_MODE === "mock" ? "mock" : "development";
// 旧测试只在 Node 侧读取该变量决定网络夹具/skip；envPrefix 白名单确保它不进入浏览器。
process.env.VITE_USE_MOCK = appMode === "mock" ? "true" : "false";
const port = Number(process.env.PLAYWRIGHT_PORT || (appMode === "mock" ? 5174 : 5173));
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${port}`;

// 每个 spec 必须且只能属于一个确定性边界。混合文件按主要业务参与者归类；
// 真实环境会话与真实接口验收另行执行，不能用这些自有 API 夹具代替。
const testBoundaryFiles = {
  public: [
    "content-template-previews.spec.ts",
    "content-template-renderers.spec.ts",
    "content-template-skeletons.spec.ts",
    "core-template-homepage.spec.ts",
    "mock-product-query.spec.ts",
    "privacy-trust.spec.ts",
    "public-catalog-detail-foundation.spec.ts",
    "public-catalog-server-pagination.spec.ts",
    "public-home-foundation.spec.ts",
    "public-service-p0.spec.ts",
    "public-service-third-batch.spec.ts",
    "responsive-public.spec.ts",
    "shared-foundation-safety.spec.ts",
    "site-maturity-foundation.spec.ts",
    "unwrap-boundary.spec.ts",
  ],
  customer: [
    "closure-locale-notifications.spec.ts",
    "public-access.spec.ts",
    "public-sales-mode.spec.ts",
    "recommendation-client.spec.ts",
    "trade-safety-ui.spec.ts",
  ],
  admin: [
    "admin-auth-store-capabilities.spec.ts",
    "admin-header-toolbar.spec.ts",
    "admin-operating-foundation-states.spec.ts",
    "array-field.spec.ts",
    "attribute-manage.spec.ts",
    "booking-editor.spec.ts",
    "category-manage.spec.ts",
    "category-references-field.spec.ts",
    "customer-admin-client.spec.ts",
    "dynamic-template-foundation.spec.ts",
    "dynamic-template-page-instance.spec.ts",
    "editor-draft-recovery.admin.spec.ts",
    "editor-leave-guard.admin.spec.ts",
    "editor-visual-redesign-acceptance.spec.ts",
    "inquiry-context.admin.spec.ts",
    "inspector-context-panel.spec.ts",
    "lead-follow-up-contract.spec.ts",
    "order-manage-capabilities.spec.ts",
    "page-document-runtime-sync.spec.ts",
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
    "template-internal-editor.spec.ts",
    "template-version-origin.spec.ts",
    "ui-color-standards.spec.ts",
    "visual-editor-double-poster.spec.ts",
    "visual-editor-hero.spec.ts",
    "warehouse-manage.spec.ts",
  ],
} as const;

const boundaryEntries = Object.entries(testBoundaryFiles).flatMap(([boundary, files]) =>
  files.map((file) => ({ boundary, file })),
);
const duplicateFiles = boundaryEntries
  .filter(({ file }, index, entries) => entries.findIndex((entry) => entry.file === file) !== index)
  .map(({ file }) => file);
const discoveredSpecFiles = readdirSync(fileURLToPath(new URL("./tests", import.meta.url)))
  .filter((file) => file.endsWith(".spec.ts"))
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
      use: { ...devices["Desktop Chrome"] },
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
