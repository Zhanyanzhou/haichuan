import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { installCustomerSession } from "./fixtures/session-auth";

const quotationClientSource = readFileSync(
  "src/services/clients/customerQuotationClient.ts",
  "utf8",
);
const quotationPanelSource = readFileSync(
  "src/pages/public/CustomerCenter/CustomerQuotationsPanel.tsx",
  "utf8",
);
const adminQuotationSource = readFileSync(
  "src/pages/admin/QuotationManage/index.tsx",
  "utf8",
);
const configurationDrawerSource = readFileSync(
  "src/pages/admin/QuotationManage/QuotationConfigurationDrawer.tsx",
  "utf8",
);
const featureFlagSource = readFileSync("src/store/featureFlags.ts", "utf8");
const orderPanelSource = readFileSync(
  "src/pages/public/CustomerCenter/CustomerOrdersPanel.tsx",
  "utf8",
);
const apiSource = readFileSync("src/services/api.ts", "utf8");

async function mockCustomerQuotationPanel(
  page: Page,
  designFiles: unknown,
  designFilesStatus: 200 | 403 = 200,
) {
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const respond = (data: unknown) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ code: 200, data, message: "ok" }),
    });

    if (path.endsWith("/settings/public")) return respond({ siteName: "海川珠宝" });
    if (path.endsWith("/settings/flags")) {
      return respond({ commerceEnabled: false, cartEnabled: false, paymentEnabled: false });
    }
    if (path === "/api/customers/me/cooperation-design-files") {
      if (designFilesStatus === 403) {
        return route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({ code: 403, message: "forbidden" }),
        });
      }
      return respond(designFiles);
    }
    if (path === "/api/customers/me/quotations") {
      return respond({ list: [], total: 0, page: 1, pageSize: 20 });
    }
    if (path === "/api/customers/me/notifications") {
      return respond({ list: [], total: 0, unreadCount: 0, page: 1, pageSize: 20 });
    }
    if (path === "/api/customers/me/inquiries") {
      return respond({ list: [], total: 0, page: 1, pageSize: 3 });
    }
    if (
      path === "/api/customers/me/orders" ||
      path === "/api/customers/me/addresses" ||
      path === "/api/customers/me/selection-inquiries" ||
      path === "/api/customers/me/favorites" ||
      path === "/api/recommendations/for-you"
    ) {
      return respond([]);
    }
    if (path === "/api/partners/me") return respond(null);
    return respond([]);
  });
  await installCustomerSession(page, { name: "3D 文件合同测试客户" });
}

test("客户报价接口使用客户身份域，并以报价版本复用幂等键", () => {
  expect(quotationClientSource).toContain('"/customers/me/quotations"');
  expect(quotationClientSource).toContain('"/customers/me/cooperation-design-files"');
  expect(quotationClientSource).toContain("/confirm-and-order");
  expect(quotationClientSource).toContain('"Idempotency-Key": idempotencyKey');
  expect(quotationClientSource).toContain("customerAuthHeaders()");
  expect(quotationPanelSource).toContain("haichuan.quotation-confirm.${quotationId}.${version}");
  expect(quotationPanelSource).toContain("getOrCreateIdempotencyKey");
  expect(quotationPanelSource).toContain(
    "clearIdempotencyKey(quotationId, quotationVersion)",
  );
});

test("报价确认入口安全默认关闭，订单支付按钮只服从支付门禁", () => {
  expect(featureFlagSource).toMatch(/quotationOrderingEnabled:\s*false/);
  expect(quotationPanelSource).toContain("useQuotationOrderingEnabled");
  expect(quotationPanelSource).toContain("disabled={!orderingEnabled || !canConfirm}");
  expect(quotationPanelSource).toContain("在线支付暂未开放");
  expect(orderPanelSource).toContain("paymentEnabled ?");
});

test("v1 报价在客户与后台详情中明确只读", () => {
  expect(quotationPanelSource).toContain("(version.snapshotSchemaVersion ?? 1) < 2");
  expect(quotationPanelSource).toContain("旧版报价仅供查看，请联系顾问复制或修订后重发 v2");
  expect(quotationPanelSource).toContain('detail.status === "PENDING_CONFIRM" && !isLegacySnapshot');
  expect(adminQuotationSource).toContain("旧版报价仅供查看");
  expect(adminQuotationSource).toContain("请复制报价或创建修订版，并按 v2 重新发出");
});

test("客户合作蜡模详情只展示已确认蜡重和实际克价来源", () => {
  expect(quotationPanelSource).toContain("确认蜡重");
  expect(quotationPanelSource).toContain("rateSourceLabel");
  expect(quotationPanelSource).toContain("明确确认此文件版本");
  expect(quotationPanelSource).not.toContain("targetGoldWeight");
  expect(quotationPanelSource).not.toContain("蜡重×10");
});

test("后台只发出或修订报价，不提供员工确认和转单调用", () => {
  expect(adminQuotationSource).toContain("RETAIL: \"标准零售\"");
  expect(adminQuotationSource).toContain("CUSTOM: \"高级定制\"");
  expect(adminQuotationSource).toContain("PARTNER_WAX: \"合作蜡模\"");
  expect(adminQuotationSource).toContain("quotationApi.issue");
  expect(adminQuotationSource).toContain("quotationApi.revise");
  expect(adminQuotationSource).not.toContain("quotationApi.confirm(");
  expect(adminQuotationSource).not.toContain("quotationApi.convertToOrder(");
  expect(adminQuotationSource).toContain("员工不能代确认或转单");
});

test("销售报价页只使用报价域的客户搜索与发出选项", () => {
  expect(apiSource).toContain('api.get("/quotations/issue-customers"');
  expect(apiSource).toContain('api.get(`/quotations/${id}/issue-options`)');
  expect(adminQuotationSource).toContain("quotationApi.searchIssueCustomers");
  expect(adminQuotationSource).toContain("quotationApi.getIssueOptions");
  expect(adminQuotationSource).not.toContain("customerAdminApi");
  expect(adminQuotationSource).toContain("QuotationConfigurationDrawer");
  expect(configurationDrawerSource).toContain("quotationConfigurationApi");
  expect(configurationDrawerSource).toContain("创建蜡价版本");
  expect(configurationDrawerSource).toContain("创建费用规则版本");
  expect(configurationDrawerSource).toContain("创建资源桶");
  expect(configurationDrawerSource).toContain("创建文件版本");
  expect(configurationDrawerSource).toContain("createDesignFileVersionFromUpload");
  expect(configurationDrawerSource).toContain('accept=".3dm,.3mf,.obj,.step,.stl,.stp"');
  expect(configurationDrawerSource).not.toContain("uploadApi.listPageMedia");
});

test("客户 3D 文件数组响应正常渲染待确认版本", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await mockCustomerQuotationPanel(page, [{
    id: 41,
    productId: null,
    referenceNo: "DESIGN-CUSTOMER-41",
    currentVersion: 2,
    versions: [{
      id: 412,
      version: 2,
      status: "SUBMITTED",
      redWaxWeight: "4.000",
      purpleWaxWeight: null,
      fileName: "customer-design-v2.3dm",
      byteSize: 12,
      checksumSha256: "a".repeat(64),
      downloadUrl: "/api/customers/me/cooperation-design-files/41/versions/2/content",
    }],
  }]);

  await page.goto("/customer");

  await expect(page.getByRole("heading", { name: "待确认的 3D 文件" })).toBeVisible();
  await expect(page.getByText("DESIGN-CUSTOMER-41 · V2")).toBeVisible();
  await expect(page.getByRole("button", { name: "明确确认此文件版本" })).toBeDisabled();
  expect(pageErrors).toEqual([]);
});

test("客户 3D 文件非数组响应进入可重试错误态而不崩溃", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await mockCustomerQuotationPanel(page, { list: [], total: 0 });

  await page.goto("/customer");

  await expect(page.getByRole("heading", { name: "我的报价" })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "3D 文件记录暂时无法加载",
  );
  await expect(page.getByRole("button", { name: "重新加载文件" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "待确认的 3D 文件" })).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("客户 3D 文件畸形数组响应进入可重试错误态且保持交易入口关闭", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await mockCustomerQuotationPanel(page, [{
    id: 41,
    referenceNo: "DESIGN-MALFORMED-41",
    currentVersion: 2,
    versions: { status: "SUBMITTED" },
  }]);

  await page.goto("/customer");

  await expect(page.getByRole("alert")).toContainText(
    "3D 文件记录暂时无法加载",
  );
  await expect(page.getByRole("heading", { name: "待确认的 3D 文件" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "确认报价并创建订单" })).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("客户 3D 文件返回 403 时显示权限错误且不渲染待确认区", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await mockCustomerQuotationPanel(page, null, 403);

  await page.goto("/customer");

  await expect(page.getByRole("heading", { name: "我的报价" })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "当前账户不能确认这份报价",
  );
  await expect(page.getByRole("button", { name: "重新加载文件" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "待确认的 3D 文件" })).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("报价修订说明进入发出合同并在运营与客户详情中可见", () => {
  expect(adminQuotationSource).toContain("changeSummary: values.changeSummary?.trim() || undefined");
  expect(adminQuotationSource).toContain("请说明本版相对上一版本的变更");
  expect(adminQuotationSource).toContain("本版变更：");
  expect(quotationPanelSource).toContain("本版变更");
  expect(quotationPanelSource).toContain("version.changeSummary");
});

test("报价详情给出当前责任与下一步且转单后定位唯一对应订单", () => {
  expect(quotationPanelSource).toContain("当前责任与下一步");
  expect(quotationPanelSource).toContain("quotationJourney(detail, orderingEnabled)");
  expect(quotationPanelSource).toContain("await onOrderCreated?.(result.order)");
  expect(quotationPanelSource).toContain("focusCanonicalOrder(result.order.id)");
  expect(quotationPanelSource).toContain("detail.convertedOrder.orderNo");
  expect(orderPanelSource).toContain('id={`customer-order-${order.id}`}');
});

test("客户订单退款与售后状态给出当前责任和可恢复下一步", () => {
  expect(orderPanelSource).toContain("getCustomerRefundGuidance");
  expect(orderPanelSource).toContain("getCustomerAfterSalesGuidance");
  expect(orderPanelSource).toContain("当前责任：");
  expect(orderPanelSource).toContain("下一步：");
  expect(orderPanelSource).toContain("系统会继续查询渠道结果");
  expect(orderPanelSource).toContain("可在当前订单撤销后重新申请");
  expect(orderPanelSource).toContain("visibleOrders.map");
  expect(orderPanelSource).toContain("查看全部 ${orders.length} 笔订单");
});

test("客户确认报价后刷新并聚焦服务端返回的唯一订单", async ({ page }) => {
  let converted = false;
  const order = {
    id: 501,
    orderNo: "ORD-CANONICAL-501",
    finalAmount: 6800,
    status: "PENDING_PAYMENT",
    orderType: "CUSTOM",
    quoteChannel: "CUSTOM",
    createdAt: "2026-09-22T08:00:00.000Z",
    items: [],
    quotedLines: [{
      id: 1,
      description: "高级定制戒指",
      quantity: 1,
      unitAmount: 6800,
      lineAmount: 6800,
    }],
    payments: [],
    fulfillments: [],
    refunds: [],
    afterSalesCases: [],
  };
  const quotation = {
    id: 71,
    quoteNo: "QT-CANONICAL-71",
    customerName: "转单定位客户",
    customerPhone: "13800000007",
    status: "PENDING_CONFIRM",
    channel: "CUSTOM",
    currentVersion: 2,
    totalAmount: 6800,
    discountAmount: 0,
    finalAmount: 6800,
    depositAmount: 0,
    validUntil: "2026-10-22T00:00:00.000Z",
    createdAt: "2026-09-22T08:00:00.000Z",
    currentVersionRecord: {
      id: 712,
      version: 2,
      status: "ISSUED",
      currency: "CNY",
      subtotal: 6800,
      discountAmount: 0,
      feeAmount: 0,
      totalAmount: 6800,
      snapshotSchemaVersion: 2,
      changeSummary: "按客户确认的戒围调整尺寸与交期",
      items: [{
        id: 1,
        description: "高级定制戒指",
        quantity: 1,
        unitPrice: 6800,
        subtotal: 6800,
      }],
    },
  };

  await page.route("**/api/**", (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const respond = (data: unknown) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ code: 200, data, message: "ok" }),
    });
    if (path.endsWith("/settings/public")) return respond({ siteName: "海川珠宝" });
    if (path.endsWith("/settings/flags")) {
      return respond({
        commerceEnabled: false,
        cartEnabled: false,
        paymentEnabled: false,
        quotationOrderingEnabled: true,
      });
    }
    if (path === "/api/customers/me/quotations/71/confirm-and-order" && request.method() === "POST") {
      converted = true;
      return respond({ order });
    }
    if (path === "/api/customers/me/quotations/71") return respond(quotation);
    if (path === "/api/customers/me/quotations") {
      return respond({ list: [quotation], total: 1, page: 1, pageSize: 20 });
    }
    if (path === "/api/customers/me/orders") return respond(converted ? [order] : []);
    if (path === "/api/customers/me/addresses") {
      return respond([{
        id: 31,
        recipientName: "张女士",
        recipientPhone: "13800000007",
        province: "上海市",
        city: "上海市",
        district: "黄浦区",
        detail: "测试路 1 号",
        isDefault: true,
      }]);
    }
    if (path === "/api/customers/me/cooperation-design-files") return respond([]);
    if (path === "/api/customers/me/notifications") {
      return respond({ list: [], total: 0, unreadCount: 0, page: 1, pageSize: 20 });
    }
    if (path === "/api/customers/me/inquiries") {
      return respond({ list: [], total: 0, page: 1, pageSize: 3 });
    }
    if (
      path === "/api/customers/me/selection-inquiries" ||
      path === "/api/customers/me/favorites" ||
      path === "/api/recommendations/for-you"
    ) return respond([]);
    if (path === "/api/partners/me") return respond(null);
    return respond([]);
  });
  await installCustomerSession(page, { name: "转单定位客户" });
  await page.goto("/customer");

  await page.getByRole("button", { name: "查看报价" }).click();
  await expect(page.getByText("按客户确认的戒围调整尺寸与交期")).toBeVisible();
  await page.getByLabel("收货地址").click();
  await page.getByText("张女士 · 上海市上海市黄浦区测试路 1 号").click();
  await page.getByRole("button", { name: "确认报价并创建订单" }).click();
  await page.getByRole("button", { name: "确认报价并创建订单" }).last().click();

  const canonicalOrder = page.locator("#customer-order-501");
  await expect(canonicalOrder).toBeVisible();
  await expect(canonicalOrder).toHaveAttribute("aria-label", "订单 ORD-CANONICAL-501");
  await expect(canonicalOrder).toBeFocused();
  await expect(page).toHaveURL(/\/customer\?section=orders&orderId=501$/);
});

test("历史已转单报价会自动展开并聚焦第 5 笔较早订单", async ({ page }) => {
  const orders = Array.from({ length: 5 }, (_, index) => ({
    id: 601 + index,
    orderNo: `ORD-HISTORY-${index + 1}`,
    finalAmount: 6800 + index,
    status: "PENDING_PAYMENT",
    orderType: "CUSTOM",
    quoteChannel: "CUSTOM",
    createdAt: `2026-09-${22 - index}T08:00:00.000Z`,
    items: [],
    quotedLines: [],
    payments: [],
    fulfillments: [],
    refunds: [],
    afterSalesCases: [],
  }));
  const targetOrder = orders[4];
  const quotation = {
    id: 72,
    quoteNo: "QT-HISTORY-72",
    customerName: "历史报价客户",
    customerPhone: "13800000008",
    status: "CONVERTED",
    channel: "CUSTOM",
    currentVersion: 2,
    totalAmount: 6804,
    discountAmount: 0,
    finalAmount: 6804,
    depositAmount: 0,
    validUntil: "2026-10-22T00:00:00.000Z",
    createdAt: "2026-09-18T08:00:00.000Z",
    convertedOrder: {
      id: targetOrder.id,
      orderNo: targetOrder.orderNo,
    },
    currentVersionRecord: {
      id: 722,
      version: 2,
      status: "ACCEPTED",
      currency: "CNY",
      subtotal: 6804,
      discountAmount: 0,
      feeAmount: 0,
      totalAmount: 6804,
      snapshotSchemaVersion: 2,
      changeSummary: "客户已确认并生成历史订单",
      items: [],
    },
  };

  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const respond = (data: unknown) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ code: 200, data, message: "ok" }),
    });
    if (path.endsWith("/settings/public")) return respond({ siteName: "海川珠宝" });
    if (path.endsWith("/settings/flags")) {
      return respond({
        commerceEnabled: false,
        cartEnabled: false,
        paymentEnabled: false,
        quotationOrderingEnabled: true,
      });
    }
    if (path === "/api/customers/me/quotations/72") return respond(quotation);
    if (path === "/api/customers/me/quotations") {
      return respond({ list: [quotation], total: 1, page: 1, pageSize: 20 });
    }
    if (path === "/api/customers/me/orders") return respond(orders);
    if (path === "/api/customers/me/addresses") return respond([]);
    if (path === "/api/customers/me/cooperation-design-files") return respond([]);
    if (path === "/api/customers/me/notifications") {
      return respond({ list: [], total: 0, unreadCount: 0, page: 1, pageSize: 20 });
    }
    if (path === "/api/customers/me/inquiries") {
      return respond({ list: [], total: 0, page: 1, pageSize: 3 });
    }
    if (
      path === "/api/customers/me/selection-inquiries" ||
      path === "/api/customers/me/favorites" ||
      path === "/api/recommendations/for-you"
    ) return respond([]);
    if (path === "/api/partners/me") return respond(null);
    return respond([]);
  });
  await installCustomerSession(page, { name: "历史报价客户" });
  await page.goto("/customer");

  await expect(page.locator(`#customer-order-${targetOrder.id}`)).toHaveCount(0);
  await page.getByRole("button", { name: "查看报价" }).click();
  await page.getByRole("button", {
    name: `查看订单 ${targetOrder.orderNo}`,
  }).click();

  const target = page.locator(`#customer-order-${targetOrder.id}`);
  await expect(target).toBeVisible();
  await expect(target).toBeFocused();
  await expect(page).toHaveURL(
    new RegExp(`/customer\\?section=orders&orderId=${targetOrder.id}$`),
  );
});

test("关闭旧报价后迟到详情不会覆盖新打开的报价", async ({ page }) => {
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const quote = (id: number, quoteNo: string, amount: number) => ({
    id,
    quoteNo,
    customerName: "报价竞态客户",
    customerPhone: "13800000000",
    status: "PENDING_CONFIRM",
    channel: "CUSTOM",
    currentVersion: 1,
    totalAmount: amount,
    discountAmount: 0,
    finalAmount: amount,
    depositAmount: 0,
    createdAt: "2026-09-21T08:00:00.000Z",
    currentVersionRecord: {
      id: id * 10,
      version: 1,
      status: "ISSUED",
      currency: "CNY",
      subtotal: amount,
      discountAmount: 0,
      feeAmount: 0,
      totalAmount: amount,
      snapshotSchemaVersion: 2,
      items: [{
        id: id * 100,
        description: `报价项目 ${id}`,
        quantity: 1,
        unitPrice: amount,
        subtotal: amount,
      }],
    },
  });
  const first = quote(41, "QUOTE-RACE-41", 4100);
  const second = quote(42, "QUOTE-RACE-42", 4200);

  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const respond = (data: unknown) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ code: 200, data, message: "ok" }),
    });
    if (path.endsWith("/settings/public")) return respond({ siteName: "海川珠宝" });
    if (path.endsWith("/settings/flags")) {
      return respond({ commerceEnabled: false, cartEnabled: false, paymentEnabled: false });
    }
    if (path === "/api/customers/me/quotations") {
      return respond({ list: [first, second], total: 2, page: 1, pageSize: 20 });
    }
    if (path === "/api/customers/me/quotations/41") {
      await firstGate;
      return respond(first);
    }
    if (path === "/api/customers/me/quotations/42") return respond(second);
    if (path === "/api/customers/me/notifications") {
      return respond({ list: [], total: 0, unreadCount: 0, page: 1, pageSize: 20 });
    }
    if (path === "/api/customers/me/inquiries") {
      return respond({ list: [], total: 0, page: 1, pageSize: 3 });
    }
    if (
      path === "/api/customers/me/orders" ||
      path === "/api/customers/me/addresses" ||
      path === "/api/customers/me/selection-inquiries" ||
      path === "/api/customers/me/favorites" ||
      path === "/api/customers/me/cooperation-design-files" ||
      path === "/api/recommendations/for-you"
    ) return respond([]);
    if (path === "/api/partners/me") return respond(null);
    return respond([]);
  });
  await installCustomerSession(page, { name: "报价竞态客户" });
  await page.goto("/customer");

  await page.getByRole("button", { name: "查看报价" }).nth(0).click();
  await expect(page.getByRole("dialog", { name: "报价详情" })).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "查看报价" }).nth(1).click();
  await expect(page.getByText("QUOTE-RACE-42", { exact: true })).toBeVisible();

  releaseFirst();
  await expect(page.getByText("QUOTE-RACE-42", { exact: true })).toBeVisible();
  await expect(page.getByText("报价项目 42", { exact: true })).toBeVisible();
  await expect(page.getByText("报价项目 41", { exact: true })).toHaveCount(0);
});

test("身份 refresh 切换客户后清空旧报价订单并忽略迟到转单结果", async ({ page }) => {
  let activeCustomer: "A" | "B" = "A";
  let releaseTracking!: () => void;
  let releaseConfirmation!: () => void;
  let confirmationStarted = false;
  let confirmationDelivered = false;
  let refreshCompleted = false;
  const trackingGate = new Promise<void>((resolve) => {
    releaseTracking = resolve;
  });
  const confirmationGate = new Promise<void>((resolve) => {
    releaseConfirmation = resolve;
  });
  const customers = {
    A: { id: 7, phone: "13800000007", name: "客户甲", email: null },
    B: { id: 8, phone: "13800000008", name: "客户乙", email: null },
  };
  const order = (owner: "A" | "B") => ({
    id: owner === "A" ? 701 : 801,
    orderNo: owner === "A" ? "ORD-OWNER-A" : "ORD-OWNER-B",
    finalAmount: owner === "A" ? 7100 : 8100,
    status: "SHIPPED",
    orderType: "CUSTOM",
    quoteChannel: "CUSTOM",
    createdAt: "2026-09-22T08:00:00.000Z",
    items: [],
    quotedLines: [{
      id: owner === "A" ? 71 : 81,
      description: owner === "A" ? "客户甲定制作业" : "客户乙定制作业",
      quantity: 1,
      unitAmount: owner === "A" ? 7100 : 8100,
      lineAmount: owner === "A" ? 7100 : 8100,
    }],
    logisticsCompany: "顺丰速运",
    logisticsNo: owner === "A" ? "SF-A" : "SF-B",
    payments: [],
    fulfillments: [],
    refunds: [],
    afterSalesCases: [],
  });
  const quotation = (owner: "A" | "B") => ({
    id: owner === "A" ? 71 : 81,
    quoteNo: owner === "A" ? "QUOTE-OWNER-A" : "QUOTE-OWNER-B",
    customerName: owner === "A" ? "客户甲" : "客户乙",
    customerPhone: customers[owner].phone,
    status: "PENDING_CONFIRM",
    channel: "CUSTOM",
    currentVersion: 1,
    totalAmount: owner === "A" ? 7100 : 8100,
    discountAmount: 0,
    finalAmount: owner === "A" ? 7100 : 8100,
    depositAmount: 0,
    createdAt: "2026-09-22T08:00:00.000Z",
    currentVersionRecord: {
      id: owner === "A" ? 711 : 811,
      version: 1,
      status: "ISSUED",
      currency: "CNY",
      subtotal: owner === "A" ? 7100 : 8100,
      discountAmount: 0,
      feeAmount: 0,
      totalAmount: owner === "A" ? 7100 : 8100,
      snapshotSchemaVersion: 2,
      items: [{
        id: owner === "A" ? 7111 : 8111,
        description: owner === "A" ? "客户甲报价项目" : "客户乙报价项目",
        quantity: 1,
        unitPrice: owner === "A" ? 7100 : 8100,
        subtotal: owner === "A" ? 7100 : 8100,
      }],
    },
  });

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const respond = (data: unknown, status = 200) => route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify({ code: status, data, message: status === 200 ? "ok" : "unauthorized" }),
    });
    if (path.endsWith("/settings/public")) return respond({ siteName: "海川珠宝" });
    if (path.endsWith("/settings/flags")) {
      return respond({
        commerceEnabled: false,
        cartEnabled: false,
        paymentEnabled: false,
        quotationOrderingEnabled: true,
      });
    }
    if (path === "/api/customers/session/refresh") {
      activeCustomer = "B";
      refreshCompleted = true;
      return respond({ customer: customers.B });
    }
    if (path === "/api/customers/me") return respond(customers[activeCustomer]);
    if (path === "/api/customers/me/quotations") {
      const current = quotation(activeCustomer);
      return respond({ list: [current], total: 1, page: 1, pageSize: 20 });
    }
    if (path === "/api/customers/me/quotations/71") return respond(quotation("A"));
    if (path === "/api/customers/me/quotations/71/confirm-and-order" && request.method() === "POST") {
      confirmationStarted = true;
      await confirmationGate;
      await respond({ order: order("A") });
      confirmationDelivered = true;
      return;
    }
    if (path === "/api/customers/me/orders/701/tracking") {
      if (activeCustomer === "A") {
        await trackingGate;
        return respond(null, 401);
      }
      return respond({ carrier: "", trackingNo: "", state: "", events: [] });
    }
    if (path === "/api/customers/me/orders") return respond([order(activeCustomer)]);
    if (path === "/api/customers/me/addresses") {
      return respond([{
        id: activeCustomer === "A" ? 31 : 41,
        recipientName: activeCustomer === "A" ? "甲女士" : "乙女士",
        recipientPhone: customers[activeCustomer].phone,
        province: "上海市",
        city: "上海市",
        district: "黄浦区",
        detail: activeCustomer === "A" ? "甲地址 1 号" : "乙地址 2 号",
        isDefault: true,
      }]);
    }
    if (path === "/api/customers/me/cooperation-design-files") return respond([]);
    if (path === "/api/customers/me/notifications") {
      return respond({ list: [], total: 0, unreadCount: 0, page: 1, pageSize: 20 });
    }
    if (path === "/api/customers/me/inquiries") {
      return respond({ list: [], total: 0, page: 1, pageSize: 3 });
    }
    if (
      path === "/api/customers/me/selection-inquiries" ||
      path === "/api/customers/me/favorites" ||
      path === "/api/recommendations/for-you"
    ) return respond([]);
    if (path === "/api/partners/me") return respond(null);
    return respond([]);
  });

  await page.goto("/customer");
  await expect(page.getByText("QUOTE-OWNER-A", { exact: false })).toBeVisible();
  await expect(page.getByText("ORD-OWNER-A", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "查看轨迹" }).click();
  await page.getByRole("button", { name: "查看报价" }).click();
  await page.getByLabel("收货地址").click();
  await page.getByText("甲女士 · 上海市上海市黄浦区甲地址 1 号").click();
  await page.getByRole("button", { name: "确认报价并创建订单" }).click();
  await page.getByRole("button", { name: "确认报价并创建订单" }).last().click();
  await expect.poll(() => confirmationStarted).toBe(true);

  releaseTracking();
  await expect.poll(() => refreshCompleted).toBe(true);
  await expect(page.getByText("QUOTE-OWNER-B", { exact: false })).toBeVisible();
  await expect(page.getByText("ORD-OWNER-B", { exact: false })).toBeVisible();
  await expect(page.getByText("QUOTE-OWNER-A", { exact: false })).toHaveCount(0);
  await expect(page.getByText("ORD-OWNER-A", { exact: false })).toHaveCount(0);

  releaseConfirmation();
  await expect.poll(() => confirmationDelivered).toBe(true);
  await expect(page.getByText("订单 ORD-OWNER-A 已创建", { exact: true })).toHaveCount(0);
  await expect(page.locator("#customer-order-701")).toHaveCount(0);
  await expect(page.locator("#customer-order-801")).toBeVisible();
});
