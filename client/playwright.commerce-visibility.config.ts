import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.COMMERCE_VISIBILITY_BASE_URL;
const host = process.env.COMMERCE_VISIBILITY_HOST;
if (!baseURL || !host) {
  throw new Error("COMMERCE_VISIBILITY_NGINX_CANDIDATE_REQUIRED");
}

export default defineConfig({
  testDir: "./tests",
  testMatch: "commerce-production-visibility.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "line",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    extraHTTPHeaders: { Host: host },
    trace: "retain-on-failure",
  },
});
