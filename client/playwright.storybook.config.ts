import { defineConfig, devices } from "@playwright/test";

/**
 * Storybook 视觉基线独立配置：不进入 client/playwright.config.ts 的边界清单，
 * 也不启动业务 dev server。结果目录沿用已忽略的 playwright-report 与 test-results。
 */
const port = Number(process.env.STORYBOOK_PORT || 6010);
const baseURL = process.env.STORYBOOK_BASE_URL || `http://127.0.0.1:${port}`;
const candidates = process.env.STORYBOOK_SCREENSHOT_CANDIDATES === "1";
if (candidates && process.env.CI) {
  throw new Error("CI 不得生成或更新待审视觉基线；请运行状态检查或已认可基线比较。");
}

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
  snapshotPathTemplate: candidates
    ? "{testDir}/../../test-results/storybook-candidates/{platform}/{projectName}/{arg}{ext}"
    : "{testDir}/__screenshots__/{platform}/{projectName}/{arg}{ext}",
  // 缺失基线必须失败，不能把本次渲染自动接受为正确结果。
  updateSnapshots: candidates ? "all" : "none",
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
        reuseExistingServer: false,
        timeout: 180_000,
      },
});
