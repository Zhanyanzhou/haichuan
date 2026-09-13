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
  expect(quotationPanelSource).toContain("clearIdempotencyKey(detail.id, version.version)");
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
