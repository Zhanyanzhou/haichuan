import { expect, test, type Page, type Route } from "@playwright/test";

type SalesMode =
  | "DISPLAY_ONLY"
  | "SELECTION"
  | "APPOINTMENT"
  | "DIRECT_PURCHASE"
  | "CUSTOM_INQUIRY";

type InventoryPolicy = "STANDARD" | "SINGLE_UNIT";

type RouteBarrier = {
  reached: Promise<void>;
  release: () => void;
  waitUntilReleased: () => Promise<void>;
};

function captureAntdConsoleProblems(page: Page) {
  const problems: string[] = [];
  page.on("console", (entry) => {
    const text = entry.text();
    if (/Static function can not consume context|destroyOnClose.*deprecated/i.test(text)) {
      problems.push(text);
    }
  });
  return problems;
}

function createRouteBarrier(): RouteBarrier {
  let markReached = () => {};
  let releaseRequest = () => {};
  const reached = new Promise<void>((resolve) => {
    markReached = resolve;
  });
  const released = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });

  return {
    reached,
    release: () => releaseRequest(),
    waitUntilReleased: async () => {
      markReached();
      await released;
    },
  };
}

const wrapped = (data: unknown) => ({
  code: 200,
  data,
  message: "success",
  timestamp: new Date(0).toISOString(),
});

function product(
  id: number,
  salesMode: SalesMode,
  options: {
    available?: boolean;
    inventoryPolicy?: InventoryPolicy;
  } = {},
) {
  const direct = salesMode === "DIRECT_PURCHASE";
  return {
    id,
    code: `HC-${id}`,
    name: `销售模式作品 ${id}`,
    description: "用于确定性验证前台销售状态。",
    shortDescription: "销售状态测试作品",
    categoryId: 1,
    category: { id: 1, name: "戒指" },
    materialType: "AU750",
    goldWeight: 5.2,
    price: direct ? 12800 : null,
    salesMode,
    inventoryPolicy: options.inventoryPolicy ?? "STANDARD",
    isAvailableForPurchase: direct ? options.available ?? true : false,
    images: [],
    skus: direct
      ? [{ id: id * 10, productId: id, material: "AU750", price: 12800, isActive: true }]
      : [],
    craftTechnique: [],
    detailContent: [],
    certificates: [],
  };
}

async function fulfill(route: Route, data: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(status === 200 ? wrapped(data) : data),
  });
}

async function mockPublicSales(
  page: Page,
  options: {
    products: ReturnType<typeof product>[];
    flags?: { commerceEnabled: boolean; cartEnabled: boolean; paymentEnabled: boolean };
    flagsStatus?: number;
    flagsBarrier?: RouteBarrier;
    cartItems?: unknown[];
    cartStatus?: number;
    cartStatuses?: number[];
    cartBarrier?: RouteBarrier;
    addStatus?: number;
    updateStatus?: number;
    requestCounts?: { add: number; update: number; checkout: number };
  },
) {
  const productsById = new Map(options.products.map((item) => [item.id, item]));
  let cartGetCount = 0;
  const flags = options.flags ?? {
    commerceEnabled: true,
    cartEnabled: true,
    paymentEnabled: true,
  };
  await page.addInitScript(() => {
    localStorage.setItem("customerToken", "sales-mode-ui-test");
    localStorage.setItem("customer", JSON.stringify({ id: 1, name: "测试客户" }));
    localStorage.removeItem("hc_selection_tray");
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (path.endsWith("/stream")) return route.abort();
    if (path.endsWith("/settings/flags")) {
      if (options.flagsBarrier) await options.flagsBarrier.waitUntilReleased();
      return fulfill(
        route,
        options.flagsStatus === 500
          ? { statusCode: 500, message: "交易能力暂时无法读取" }
          : flags,
        options.flagsStatus,
      );
    }
    if (path.endsWith("/settings/public")) return fulfill(route, { siteName: "海川珠宝" });
    if (path.endsWith("/page-modules/document/published")) return fulfill(route, null);
    if (path.endsWith("/categories/tree")) {
      return fulfill(route, [{ id: 1, name: "戒指", slug: "rings", level: 1, parentId: null, children: [] }]);
    }
    if (path.endsWith("/attributes")) return fulfill(route, []);
    if (path.endsWith("/customers/favorites")) return fulfill(route, []);
    if (path.endsWith("/customers/profile")) {
      return fulfill(route, { name: "测试客户", phone: "138****0000" });
    }
    if (path.endsWith("/gold-price/latest")) return fulfill(route, { price: 500 });
    if (path.includes("/recommendations/")) return fulfill(route, []);
    if (path.includes("/reviews/product/")) {
      return fulfill(route, { list: [], total: 0, averageRating: null });
    }
    if (path.endsWith("/products/catalog") || path.endsWith("/products/public")) {
      return fulfill(route, {
        list: options.products,
        total: options.products.length,
        page: 1,
        pageSize: 32,
        facets: { sizes: [] },
      });
    }
    const detailMatch = path.match(/\/products\/(?:catalog|public)\/(\d+)$/);
    if (detailMatch) return fulfill(route, productsById.get(Number(detailMatch[1])) ?? null);

    if (path.endsWith("/cart") && method === "GET") {
      const requestIndex = cartGetCount++;
      if (requestIndex === 0 && options.cartBarrier) {
        await options.cartBarrier.waitUntilReleased();
      }
      const cartStatus = options.cartStatuses?.[requestIndex] ?? options.cartStatus;
      if (cartStatus && cartStatus !== 200) {
        return fulfill(route, { statusCode: cartStatus, message: "购物车服务暂时不可用" }, cartStatus);
      }
      return fulfill(route, options.cartItems ?? []);
    }
    if (path.endsWith("/cart") && method === "POST") {
      if (options.requestCounts) options.requestCounts.add += 1;
      await new Promise((resolve) => setTimeout(resolve, 80));
      if (options.addStatus === 409) {
        return fulfill(route, { statusCode: 409, message: "一物一件商品在购物车中最多保留 1 件" }, 409);
      }
      return fulfill(route, { id: 1 });
    }
    if (/\/cart\/\d+$/.test(path) && method === "PUT") {
      if (options.requestCounts) options.requestCounts.update += 1;
      await new Promise((resolve) => setTimeout(resolve, 80));
      if (options.updateStatus === 409) {
        return fulfill(route, { statusCode: 409, message: "商品库存不足，请刷新后重试" }, 409);
      }
      return fulfill(route, { id: 1 });
    }
    if (path.endsWith("/customers/checkout")) {
      if (options.requestCounts) options.requestCounts.checkout += 1;
      return fulfill(route, { order: { id: 1, orderNo: "TEST-1", finalAmount: 12800 } });
    }
    return fulfill(route, null);
  });
}

test("Catalog 消费服务端销售模式、派生价格和售罄状态", async ({ page }) => {
  await mockPublicSales(page, {
    products: [
      product(1, "DIRECT_PURCHASE", { available: false }),
      product(2, "SELECTION"),
      product(3, "DISPLAY_ONLY"),
    ],
  });
  await page.goto("/catalog");

  await expect(page.getByText("¥12,800 起")).toBeVisible();
  await expect(page.getByText("已售罄", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "查看作品" }).first()).toHaveAttribute("href", "/products/1");
  await expect(page.getByRole("button", { name: "+ 加入选款" })).toBeVisible();
  const displayOnlyCard = page.locator(".catalog-cell").filter({
    has: page.getByRole("heading", { name: "销售模式作品 3" }),
  });
  await expect(displayOnlyCard.getByText("仅展示", { exact: true })).toHaveCount(0);
  await expect(displayOnlyCard.getByRole("link", { name: "查看作品" }))
    .toHaveAttribute("href", "/products/3");
  await expect(page.getByText("图片暂不可用").first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => Array.from(document.images)
    .filter((image) => {
      const rect = image.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && image.naturalWidth === 0;
    }).length)).toBe(0);
});

test("Catalog 在交易能力加载中先降级为查看作品，明确开放后再显示购买", async ({ page }) => {
  const flagsBarrier = createRouteBarrier();
  await mockPublicSales(page, {
    products: [product(4, "DIRECT_PURCHASE", { available: true })],
    flagsBarrier,
  });
  await page.goto("/catalog");
  await flagsBarrier.reached;

  await expect(page.getByRole("link", { name: "查看作品" }).first())
    .toHaveAttribute("href", "/products/4");
  await expect(page.getByRole("link", { name: "查看并购买" })).toHaveCount(0);

  flagsBarrier.release();
  await expect(page.getByRole("link", { name: "查看并购买" }).first())
    .toHaveAttribute("href", "/products/4");
});

test("Catalog 在交易能力读取失败时不承诺购买", async ({ page }) => {
  await mockPublicSales(page, {
    products: [product(5, "DIRECT_PURCHASE", { available: true })],
    flagsStatus: 500,
  });
  await page.goto("/catalog");

  await expect(page.getByRole("link", { name: "查看作品" }).first())
    .toHaveAttribute("href", "/products/5");
  await expect(page.getByRole("link", { name: "查看并购买" })).toHaveCount(0);
});

test("DIRECT_PURCHASE 有货时使用 SKU 价格且重复点击只提交一次", async ({ page }) => {
  const antdConsoleProblems = captureAntdConsoleProblems(page);
  const requestCounts = { add: 0, update: 0, checkout: 0 };
  await mockPublicSales(page, {
    products: [product(10, "DIRECT_PURCHASE", { available: true })],
    requestCounts,
  });
  await page.goto("/products/10");

  await expect(page.getByText("¥12,800", { exact: true })).toBeVisible();
  const addButton = page.getByRole("button", { name: /加入购物车/ });
  await expect(addButton).toBeEnabled();
  await Promise.all([
    addButton.click({ force: true }),
    addButton.click({ force: true }),
  ]);
  await expect.poll(() => requestCounts.add).toBe(1);
  await expect(page.getByText("已加入购物车")).toBeVisible();
  expect(antdConsoleProblems).toEqual([]);
});

test("DIRECT_PURCHASE 0 库存明确售罄且不发加购请求", async ({ page }) => {
  const requestCounts = { add: 0, update: 0, checkout: 0 };
  await mockPublicSales(page, {
    products: [product(11, "DIRECT_PURCHASE", { available: false })],
    requestCounts,
  });
  await page.goto("/products/11");

  const soldOut = page.getByRole("button", { name: "已售罄" });
  await expect(soldOut).toBeDisabled();
  await expect(page.getByText("该作品已售罄，仍可继续浏览作品信息或联系珠宝顾问。")).toBeVisible();
  expect(requestCounts.add).toBe(0);
});

test("SINGLE_UNIT 在详情和购物车都固定数量上限 1", async ({ page }) => {
  const single = product(12, "DIRECT_PURCHASE", {
    available: true,
    inventoryPolicy: "SINGLE_UNIT",
  });
  await mockPublicSales(page, {
    products: [single],
    cartItems: [{
      id: 81,
      productId: single.id,
      skuId: single.skus[0].id,
      quantity: 1,
      product: { name: single.name, goldWeight: single.goldWeight },
      sku: { material: "AU750", goldWeight: 5.2, price: 12800 },
    }],
  });

  await page.goto("/products/12");
  await expect(page.getByRole("button", { name: "增加数量" })).toBeDisabled();
  await expect(page.getByText("一物一件，每位顾客的购物车最多保留 1 件。")).toBeVisible();

  await page.goto("/cart");
  await expect(page.getByRole("button", { name: `增加${single.name}数量` })).toBeDisabled();
  await expect(page.getByText("一物一件，购物车数量上限为 1。")).toBeVisible();
});

test("四种非直购模式只提供真实可达的浏览、选款、预约或定制入口", async ({ page }) => {
  const cases = [
    { id: 20, mode: "DISPLAY_ONLY" as const, text: "咨询此款作品", href: "/contact" },
    { id: 21, mode: "SELECTION" as const, text: "加入选款", href: null },
    { id: 22, mode: "APPOINTMENT" as const, text: "预约鉴赏此款", href: "/contact" },
    { id: 23, mode: "CUSTOM_INQUIRY" as const, text: "咨询此款定制", href: "/custom" },
  ];
  await mockPublicSales(page, { products: cases.map((item) => product(item.id, item.mode)) });

  for (const item of cases) {
    await page.goto(`/products/${item.id}`);
    if (item.href) {
      await expect(page.getByRole("link", { name: item.text })).toHaveAttribute("href", item.href);
    } else {
      const selectionAction = page.getByRole("button", { name: item.text });
      await expect(selectionAction).toBeVisible();
      await selectionAction.click();
      await expect(page.getByRole("button", { name: "已加入" })).toBeVisible();
    }
    await expect(page.getByRole("button", { name: /加入购物车/ })).toHaveCount(0);
    await expect(page.getByText(/¥12,800/)).toHaveCount(0);
  }
});

test("详情加购 409 显示服务端原因且不伪造成功", async ({ page }) => {
  const antdConsoleProblems = captureAntdConsoleProblems(page);
  const requestCounts = { add: 0, update: 0, checkout: 0 };
  await mockPublicSales(page, {
    products: [product(30, "DIRECT_PURCHASE", { available: true, inventoryPolicy: "SINGLE_UNIT" })],
    addStatus: 409,
    requestCounts,
  });
  await page.goto("/products/30");
  await page.getByRole("button", { name: /加入购物车/ }).click();

  await expect(page.getByRole("alert")).toContainText("一物一件商品在购物车中最多保留 1 件");
  await expect(page.getByText("已加入购物车")).toHaveCount(0);
  expect(requestCounts.add).toBe(1);
  expect(antdConsoleProblems).toEqual([]);
});

test("购物车更新 409 与重复点击都不产生假数量", async ({ page }) => {
  const antdConsoleProblems = captureAntdConsoleProblems(page);
  const requestCounts = { add: 0, update: 0, checkout: 0 };
  const standard = product(31, "DIRECT_PURCHASE", { available: true });
  await mockPublicSales(page, {
    products: [standard],
    cartItems: [{
      id: 91,
      productId: standard.id,
      skuId: standard.skus[0].id,
      quantity: 1,
      product: { name: standard.name, goldWeight: standard.goldWeight, inventoryPolicy: "STANDARD" },
      sku: { material: "AU750", goldWeight: 5.2, price: 12800 },
    }],
    updateStatus: 409,
    requestCounts,
  });
  await page.goto("/cart");
  const increase = page.getByRole("button", { name: `增加${standard.name}数量` });
  await Promise.all([
    increase.click({ force: true }),
    increase.click({ force: true }),
  ]);

  await expect.poll(() => requestCounts.update).toBe(1);
  await expect(page.getByRole("alert")).toContainText("商品库存不足，请刷新后重试");
  await expect(page.getByText("1", { exact: true })).toBeVisible();
  expect(antdConsoleProblems).toEqual([]);
});

test("购物车加载与错误状态可理解且可重试", async ({ page }) => {
  const cartBarrier = createRouteBarrier();
  await mockPublicSales(page, {
    products: [],
    cartStatuses: [500, 200],
    cartBarrier,
  });
  await page.goto("/cart");
  await cartBarrier.reached;
  await expect(page.getByText("加载中...")).toBeVisible();
  cartBarrier.release();
  await expect(page.getByText("购物车暂时无法加载")).toBeVisible();
  await page.getByRole("button", { name: "重新加载" }).click();
  await expect(page.getByText("购物车为空")).toBeVisible();
  await expect(page.getByText("购物车暂时无法加载")).toHaveCount(0);
});

test("库存策略无法读取时安全暂停增量与结算", async ({ page }) => {
  await mockPublicSales(page, {
    products: [],
    cartItems: [{
      id: 92,
      productId: 999,
      skuId: 9990,
      quantity: 1,
      product: { name: "库存规则未知作品", goldWeight: 4.1 },
      sku: { material: "AU750", goldWeight: 4.1, price: 9800 },
    }],
  });
  await page.goto("/cart");
  await expect(page.getByRole("alert")).toContainText("数量规则暂时无法确认");
  await expect(page.getByRole("button", { name: "增加库存规则未知作品数量" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "暂不可结算" })).toBeDisabled();
});

test("购物车与支付开关关闭时不能进入交易或创建订单", async ({ page }) => {
  const requestCounts = { add: 0, update: 0, checkout: 0 };
  await mockPublicSales(page, {
    products: [product(40, "DIRECT_PURCHASE", { available: true })],
    flags: { commerceEnabled: true, cartEnabled: false, paymentEnabled: false },
    requestCounts,
  });
  await page.goto("/catalog");
  await expect(page.getByRole("link", { name: "查看作品" }).first())
    .toHaveAttribute("href", "/products/40");
  await expect(page.getByRole("link", { name: "查看并购买" })).toHaveCount(0);

  await page.goto("/products/40");
  await expect(page.getByRole("link", { name: "购买暂未开放，联系顾问" })).toHaveAttribute("href", "/contact");
  await expect(page.getByRole("button", { name: /加入购物车/ })).toHaveCount(0);

  await page.goto("/cart");
  await expect(page).toHaveURL(/\/contact$/);
  await page.goto("/checkout");
  await expect(page).toHaveURL(/\/contact$/);
  expect(requestCounts.checkout).toBe(0);
});

test("支付关闭但购物车开启时仍禁止进入结算", async ({ page }) => {
  const requestCounts = { add: 0, update: 0, checkout: 0 };
  await mockPublicSales(page, {
    products: [product(41, "DIRECT_PURCHASE", { available: true })],
    flags: { commerceEnabled: true, cartEnabled: true, paymentEnabled: false },
    requestCounts,
  });
  await page.goto("/checkout");
  await expect(page).toHaveURL(/\/contact$/);
  expect(requestCounts.checkout).toBe(0);
});

test("总交易开关关闭时详情不提供加购且交易页面不可达", async ({ page }) => {
  const requestCounts = { add: 0, update: 0, checkout: 0 };
  await mockPublicSales(page, {
    products: [product(42, "DIRECT_PURCHASE", { available: true })],
    flags: { commerceEnabled: false, cartEnabled: true, paymentEnabled: true },
    requestCounts,
  });
  await page.goto("/products/42");
  await expect(page.getByRole("link", { name: "购买暂未开放，联系顾问" })).toBeVisible();
  await expect(page.getByRole("button", { name: /加入购物车/ })).toHaveCount(0);
  await page.goto("/cart");
  await expect(page).toHaveURL(/\/contact$/);
  expect(requestCounts.add).toBe(0);
});

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`${viewport.name} 销售入口有清晰键盘焦点且没有横向溢出`, async ({ page }) => {
    const single = product(50, "DIRECT_PURCHASE", {
      available: true,
      inventoryPolicy: "SINGLE_UNIT",
    });
    await mockPublicSales(page, {
      products: [single],
      cartItems: [{
        id: 101,
        productId: single.id,
        skuId: single.skus[0].id,
        quantity: 1,
        product: { name: single.name, goldWeight: single.goldWeight },
        sku: { material: "AU750", goldWeight: 5.2, price: 12800 },
      }],
    });
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    const checks = [
      { path: "/catalog", role: "link" as const, name: "查看并购买" },
      { path: "/products/50", role: "button" as const, name: "加入购物车" },
      { path: "/cart", role: "link" as const, name: /去结算/ },
    ];
    for (const check of checks) {
      await page.goto(check.path);
      const target = page.getByRole(check.role, { name: check.name }).first();
      await target.focus();
      await expect(target).toBeFocused();
      await expect(target).toHaveCSS("outline-width", "2px");
      await expect.poll(() => page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      )).toBe(true);
    }
  });
}
