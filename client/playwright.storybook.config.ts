import { defineConfig, devices } from "@playwright/test";

/**
 * Storybook 视觉基线独立配置：不进入 client/playwright.config.ts 的边界清单，
 * 也不启动业务 dev server。结果目录沿用已忽略的 playwright-report 与 test-results。
 */
const port = Number(process.env.STORYBOOK_PORT || 6010);
const baseURL = process.env.STORYBOOK_BASE_URL || `http://127.0.0.1:${port}`;

const desktop = { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } };
const mobile = { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } };

export default defineConfig({
  // 放在 .storybook 下，避免进入 client/playwright.config.ts 的 tests 边界清单。
  testDir: "./.storybook/visual",
  testMatch: "storybook-visual.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["html", { open: "never", outputFolder: "playwright-report/storybook" }]],
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}{ext}",
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01 } },
  use: {
    baseURL,
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "storybook-desktop", use: desktop },
    { name: "storybook-mobile", use: mobile },
  ],
  webServer: process.env.STORYBOOK_BASE_URL
    ? undefined
    : {
        command: `npm run storybook -- --host 127.0.0.1 --port ${port} --no-open`,
        url: `${baseURL}/index.json`,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
