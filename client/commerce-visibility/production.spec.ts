import { expect, test, type Page } from "@playwright/test";
import {
  isCustomerCommerceEnabled,
  isCustomerQuotationOrderingEnabled,
  isPaymentGatewayTransactionsEnabled,
  isCommerceFeatureEnabled,
} from "../../server/src/common/release/release-profile";

// 浏览器加载 Node 22 的真实生产 React bundle 与项目 Nginx 配置。
// 自有 API 仅以路由夹具隔离；此文件不是商户、资金或真实数据库联调。
type Switches = [commerce: boolean, quotation: boolean, transactions: boolean, refunds: boolean];
type Profile = "lead-generation" | "commerce";

function projectFlags(profile: Profile, switches: Switches) {
  const [commerce, quotation, transactions, refunds] = switches;
  const commerceEnabled = isCustomerCommerceEnabled(profile, String(commerce));
  return {
    commerceEnabled,
    cartEnabled: commerceEnabled,
    paymentEnabled: isPaymentGatewayTransactionsEnabled(profile, String(transactions)),
    quotationOrderingEnabled: isCustomerQuotationOrderingEnabled(profile, String(quotation)),
    refundsEnabled: isCommerceFeatureEnabled(profile, String(refunds)),
  };
}

async function attachIsolatedApi(page: Page, profile: Profile, switches: Switches) {
  const flags = projectFlags(profile, switches);
  const writes: string[] = [];
  await page.route("**/api/**", (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (method !== "GET") {
      writes.push(`${method} ${path}`);
      return route.fulfill({ status: 503, body: "isolated visibility test rejects writes" });
    }
    const data = (value: unknown) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ code: 200, message: "ok", data: value }),
    });
    if (path === "/api/settings/flags") {
      const { refundsEnabled: _privateRefundGate, ...publicFlags } = flags;
      return data(publicFlags);
    }
    if (path === "/api/settings/public") return data({ siteName: "海川珠宝" });
    if (path === "/api/customers/me") {
      return data({ id: 7, name: "隔离验收客户", phone: "13800000007", email: null });
    }
    if (path === "/api/cart") {
      return data([{
        id: 8,
        skuId: 9,
        quantity: 1,
        product: { name: "隔离验收作品" },
        sku: { price: 88 },
        availability: { available: true, status: "AVAILABLE", message: null },
      }]);
    }
    return data([]);
  });
  return { flags, writes };
}

test("服务端四开关在两种发布档位的全部组合均按独立门禁投影", () => {
  for (const profile of ["lead-generation", "commerce"] as const) {
    for (let bits = 0; bits < 16; bits += 1) {
      const switches: Switches = [0, 1, 2, 3].map((index) => Boolean(bits & (1 << index))) as Switches;
      const flags = projectFlags(profile, switches);
      const enabled = profile === "commerce";
      expect(flags.commerceEnabled).toBe(enabled && switches[0]);
      expect(flags.cartEnabled).toBe(flags.commerceEnabled);
      expect(flags.quotationOrderingEnabled).toBe(enabled && switches[1]);
      expect(flags.paymentEnabled).toBe(enabled && switches[2]);
      expect(flags.refundsEnabled).toBe(enabled && switches[3]);
    }
  }
});

for (const scenario of [
  { name: "线索型误开全部开关", profile: "lead-generation", switches: [true, true, true, true], checkout: false, cart: false },
  { name: "交易型全部关闭", profile: "commerce", switches: [false, false, false, false], checkout: false, cart: false },
  { name: "交易型仅开放购物车", profile: "commerce", switches: [true, true, false, false], checkout: false, cart: true },
  { name: "交易型支付开关打开但客户交易关闭", profile: "commerce", switches: [false, true, true, true], checkout: false, cart: false },
  { name: "交易型四开关全部开启", profile: "commerce", switches: [true, true, true, true], checkout: true, cart: true },
] as const) {
  test(`${scenario.name}：生产 React 与 Nginx 容器的交易路由可见性`, async ({ page }) => {
    const { flags, writes } = await attachIsolatedApi(
      page, scenario.profile, [...scenario.switches] as Switches,
    );
    const response = await page.goto("/checkout");
    expect(response?.status()).toBe(200);
    expect(response?.headers()["x-robots-tag"]).toContain("noindex");
    if (scenario.checkout) {
      await expect(page).toHaveURL(/\/checkout$/);
      await expect(page.getByRole("button", { name: /提交订单并支付/ })).toBeVisible();
      expect(flags.paymentEnabled).toBe(true);
    } else {
      await expect(page).toHaveURL(/\/contact$/);
      await expect(page.getByRole("button", { name: /提交订单并支付/ })).toHaveCount(0);
    }
    await page.goto("/cart");
    if (scenario.cart) {
      await expect(page).toHaveURL(/\/cart$/);
      await expect(page.getByText("隔离验收作品")).toBeVisible();
    } else {
      await expect(page).toHaveURL(/\/contact$/);
    }
    expect(writes).toEqual([]);
  });
}
