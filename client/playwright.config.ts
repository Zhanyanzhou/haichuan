import { defineConfig, devices } from "@playwright/test";

const appMode = process.env.PLAYWRIGHT_APP_MODE === "mock" ? "mock" : "development";
// 旧测试只在 Node 侧读取该变量决定网络夹具/skip；envPrefix 白名单确保它不进入浏览器。
process.env.VITE_USE_MOCK = appMode === "mock" ? "true" : "false";
const port = Number(process.env.PLAYWRIGHT_PORT || (appMode === "mock" ? 5174 : 5173));
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${port}`;
const adminStorageState = process.env.PLAYWRIGHT_ADMIN_STORAGE_STATE;

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
      testIgnore: "**/*.admin.spec.ts",
      use: { ...devices["Desktop Chrome"] },
    },
    ...(adminStorageState
      ? [{
          name: "admin-chromium",
          testMatch: "**/*.admin.spec.ts",
          use: {
            ...devices["Desktop Chrome"],
            storageState: adminStorageState,
          },
        }]
      : []),
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
