import { expect, test } from "@playwright/test";

const analyticsConfigured = process.env.VITE_ANALYTICS_ENABLED === "true";

test("匿名交易分析不发送或持久化订单与退款标识", async ({ page }) => {
  test.skip(!analyticsConfigured, "需要 VITE_ANALYTICS_ENABLED=true 的独立构建验证");
  const requests: Array<Record<string, unknown>> = [];
  await page.context().clearCookies();
  await page.route("**/api/settings/public**", (route) => route.fulfill({
    status: 200,
    json: { code: 200, data: {}, message: "ok" },
  }));
  await page.route("**/api/analytics/track", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ status: 204, body: "" });
  });

  await page.goto("/privacy");
  await page.evaluate(async () => {
    const analytics = await import("/src/hooks/useAnalytics.ts");
    analytics.setAnalyticsConsent("granted");
    analytics.trackOrderCreated();
    analytics.trackAddPaymentInfo(987654);
    analytics.trackPurchase(987654);
    analytics.trackPurchase(987654);
    analytics.trackRefund(876543);
    analytics.trackRefund(876543);
  });

  await expect.poll(() => requests.filter((request) => [
    "order_created",
    "add_payment_info",
    "purchase",
    "refund",
  ].includes(String(request.eventName))).length).toBe(4);

  const transactionEvents = requests.filter((request) => [
    "order_created",
    "add_payment_info",
    "purchase",
    "refund",
  ].includes(String(request.eventName)));
  expect(transactionEvents.map((request) => request.eventName)).toEqual([
    "order_created",
    "add_payment_info",
    "purchase",
    "refund",
  ]);
  for (const request of transactionEvents) {
    expect(request).not.toHaveProperty("metadata");
  }

  const storage = await page.evaluate(() => JSON.stringify({ ...sessionStorage }));
  expect(storage).not.toContain("987654");
  expect(storage).not.toContain("876543");
  expect(storage).not.toContain("hc.analytics-once");
});
