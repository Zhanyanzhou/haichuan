import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const realEnvironment = {
  productCode: process.env.CONSULTATION_REAL_PRODUCT_CODE?.trim() ?? "",
  selectionProductCode: process.env.CONSULTATION_REAL_SELECTION_PRODUCT_CODE?.trim() ?? "",
  customerPhone: process.env.CONSULTATION_REAL_CUSTOMER_PHONE?.trim() ?? "",
  password: process.env.CONSULTATION_REAL_PASSWORD ?? "",
  staffUsername: process.env.CONSULTATION_REAL_STAFF_USERNAME?.trim() ?? "",
};

const realE2eEnabled = process.env.CONSULTATION_REAL_E2E === "1"
  && Object.values(realEnvironment).every(Boolean);

type ViewportCase = {
  name: string;
  width: number;
  height: number;
};

type ConsultationReceipt = {
  sourceId: number;
  leadId: number;
};

type LeadListRow = {
  id: number;
  leadType: string;
};

type LeadType = "inquiry" | "selection";

const viewportCases: ViewportCase[] = [
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "mobile-390", width: 390, height: 844 },
];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function unwrapData(value: unknown): Record<string, unknown> {
  const envelope = asRecord(value);
  const data = asRecord(envelope?.data);
  return data ?? envelope ?? {};
}

function parseReceipt(value: unknown): ConsultationReceipt {
  const data = unwrapData(value);
  const sourceId = Number(data.sourceId);
  const leadId = Number(data.leadId);
  expect(Number.isSafeInteger(sourceId) && sourceId > 0, "咨询回执必须包含正整数 sourceId").toBe(true);
  expect(Number.isSafeInteger(leadId) && leadId > 0, "咨询回执必须包含 canonical leadId").toBe(true);
  return { sourceId, leadId };
}

function parseLeadRows(value: unknown): LeadListRow[] {
  const data = unwrapData(value);
  if (!Array.isArray(data.list)) return [];
  return data.list.flatMap((item) => {
    const row = asRecord(item);
    const id = Number(row?.id);
    const leadType = typeof row?.leadType === "string" ? row.leadType : "";
    return Number.isSafeInteger(id) && id > 0 && leadType
      ? [{ id, leadType }]
      : [];
  });
}

function isApiResponse(response: { url(): string; request(): { method(): string } }, pathname: string, method: string) {
  return new URL(response.url()).pathname === pathname
    && response.request().method() === method;
}

async function loginCustomer(page: Page) {
  await page.goto("/customer");
  await page.getByRole("button", { name: "会员登录", exact: true }).click();
  await page.getByLabel("手机号", { exact: true }).fill(realEnvironment.customerPhone);
  await page.getByLabel("密码", { exact: true }).fill(realEnvironment.password);
  await page.getByRole("button", { name: "登录我的账户", exact: true }).click();
  await expect(page.getByRole("button", { name: "退出登录", exact: true })).toBeVisible();
}

async function loginStaff(page: Page) {
  await page.goto("/admin/leads?type=inquiry");
  await page.getByPlaceholder("输入用户名", { exact: true }).fill(realEnvironment.staffUsername);
  await page.getByPlaceholder("输入密码", { exact: true }).fill(realEnvironment.password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/leads(?:\?|$)/);
  await expect(page.getByRole("heading", { name: "客户线索", exact: true })).toBeVisible();
}

async function submitProductConsultation(page: Page, message: string) {
  await page.goto(`/products/${encodeURIComponent(realEnvironment.productCode)}`);
  const productHeading = page.getByRole("heading", { level: 1 }).first();
  await expect(productHeading).toBeVisible();
  const productName = (await productHeading.textContent())?.trim() ?? "";
  expect(productName, "真实作品详情必须展示作品名称").not.toBe("");
  const inquiryLink = page.getByRole("link", { name: "咨询此款作品", exact: true });
  await expect(inquiryLink).toBeVisible();
  await inquiryLink.click();

  await expect(page).toHaveURL((url) => (
    url.pathname === "/contact"
    && url.searchParams.get("type") === "product"
    && url.searchParams.get("productRef") === realEnvironment.productCode
  ));
  await expect(page.getByText(`货号：${realEnvironment.productCode}`, { exact: true })).toBeVisible();
  await expect(page.getByText(productName, { exact: true }).first()).toBeVisible();
  await expect(page.locator("#cf-phone")).toHaveValue(realEnvironment.customerPhone);
  await expect(page.locator("#cf-type")).toHaveValue("选款建议");
  await page.locator("#cf-message").fill(message);
  await page.locator("#cf-privacy-consent").check();

  const responsePromise = page.waitForResponse((response) => (
    isApiResponse(response, "/api/inquiries", "POST")
  ));
  await page.getByRole("button", { name: "提交需求", exact: true }).click();
  const response = await responsePromise;
  expect(response.status(), "真实咨询提交应成功创建").toBe(201);
  expect(response.request().headers()["idempotency-key"], "UI 提交必须携带幂等键").toBeTruthy();
  const receipt = parseReceipt(await response.json());

  const receiptPanel = page.locator('dl[aria-label="咨询回执"]');
  await expect(receiptPanel).toContainText(`#${receipt.sourceId}`);
  const detailLink = page.getByRole("link", { name: "查看本次咨询", exact: true });
  await expect(detailLink).toHaveAttribute(
    "href",
    `/customer?section=consultations&leadId=${receipt.leadId}`,
  );
  await detailLink.click();
  await expect(page).toHaveURL(
    new RegExp(`/customer\\?section=consultations&leadId=${receipt.leadId}$`),
  );
  const consultationDetail = page.getByRole("region", { name: "咨询详情" });
  await expect(consultationDetail).toContainText(message);
  await expect(consultationDetail).toContainText(productName);
  await expect(consultationDetail).toContainText("顾问尚未回复");
  return { ...receipt, productName };
}

async function submitSelectionConsultation(page: Page, message: string) {
  await page.goto(`/products/${encodeURIComponent(realEnvironment.selectionProductCode)}`);
  const productHeading = page.getByRole("heading", { level: 1 }).first();
  await expect(productHeading).toBeVisible();
  const productName = (await productHeading.textContent())?.trim() ?? "";
  expect(productName, "真实选款作品详情必须展示作品名称").not.toBe("");
  await page.getByRole("button", { name: "加入选款", exact: true }).click();
  await expect(page.getByRole("button", { name: "已加入", exact: true })).toBeVisible();

  await page.goto("/catalog");
  const tray = page.getByRole("button", { name: "查看已选 1 款并提交选款咨询" });
  await expect(tray).toBeVisible();
  await tray.click();
  const dialog = page.getByRole("dialog", { name: "提交选款咨询" });
  await expect(dialog).toContainText(productName);
  await expect(dialog).toContainText(realEnvironment.selectionProductCode);
  await dialog.getByPlaceholder("预算范围、佩戴需求、特殊要求等").fill(message);
  await dialog.getByRole("checkbox").check();

  const responsePromise = page.waitForResponse((response) => (
    isApiResponse(response, "/api/selection-inquiries", "POST")
  ));
  await dialog.getByRole("button", { name: "提交选款咨询（1 款）", exact: true }).click();
  const response = await responsePromise;
  expect(response.status(), "真实选款咨询提交应成功创建").toBe(201);
  expect(response.request().headers()["idempotency-key"], "选款 UI 提交必须携带幂等键").toBeTruthy();
  const receipt = parseReceipt(await response.json());

  const receiptDialog = page.getByRole("dialog", { name: "选款咨询已提交" });
  await expect(receiptDialog).toContainText(`#${receipt.sourceId}`);
  const detailLink = receiptDialog.getByRole("link", { name: "查看本次咨询", exact: true });
  await expect(detailLink).toHaveAttribute(
    "href",
    `/customer?section=consultations&leadId=${receipt.leadId}`,
  );
  await detailLink.click();
  await expect(page).toHaveURL(
    new RegExp(`/customer\\?section=consultations&leadId=${receipt.leadId}$`),
  );
  const consultationDetail = page.getByRole("region", { name: "咨询详情" });
  await expect(consultationDetail).toContainText(message);
  await expect(consultationDetail).toContainText(productName);
  await expect(consultationDetail).toContainText("顾问尚未回复");
  return { ...receipt, productName };
}

async function locateLeadThroughAdminUi(page: Page, leadType: LeadType, leadId: number) {
  await page.goto(`/admin/leads?type=${leadType}`);
  await expect(page.getByRole("heading", { name: "客户线索", exact: true })).toBeVisible();
  const keyword = page.getByPlaceholder("客户姓名/电话（回车应用）");
  const listResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/leads"
      && response.request().method() === "GET"
      && url.searchParams.get("keyword") === realEnvironment.customerPhone;
  });
  await keyword.fill(realEnvironment.customerPhone);
  await keyword.press("Enter");
  const listResponse = await listResponsePromise;
  expect(listResponse.status(), "后台真实线索列表应可读取").toBe(200);
  const rows = parseLeadRows(await listResponse.json());
  expect(
    rows.some((row) => row.id === leadId && row.leadType === leadType),
    `后台筛选结果必须包含 canonical Lead #${leadId}`,
  ).toBe(true);

  const tableRows = page.getByRole("table").getByRole("row");
  await expect(tableRows).toHaveCount(rows.length + 1);
  const targetRow = page.locator(`tr[data-row-key="${leadType}-${leadId}"]`);
  await expect(targetRow).toBeVisible();
  const detailResponsePromise = page.waitForResponse((response) => (
    isApiResponse(response, `/api/leads/${leadType}/${leadId}`, "GET")
  ));
  await targetRow.getByRole("button", { name: /查看/ }).click();
  const detailResponse = await detailResponsePromise;
  expect(detailResponse.status(), "后台详情必须按 canonical leadId 读取").toBe(200);
  return page.getByRole("dialog", { name: "线索详情" });
}

async function claimAndReply(
  page: Page,
  leadType: LeadType,
  leadId: number,
  message: string,
  reply: string,
  expectedProductCode: string,
) {
  const drawer = await locateLeadThroughAdminUi(page, leadType, leadId);
  await expect(drawer).toContainText(message);
  await expect(drawer).toContainText(expectedProductCode);

  const claimResponsePromise = page.waitForResponse((response) => (
    isApiResponse(response, `/api/leads/${leadType}/${leadId}/claim`, "POST")
  ));
  await drawer.getByRole("button", { name: "领取线索", exact: true }).click();
  const claimResponse = await claimResponsePromise;
  expect(claimResponse.status(), "客服应能领取目标线索").toBe(201);
  await expect(drawer.getByRole("button", { name: "领取线索", exact: true })).toHaveCount(0);

  await drawer.getByLabel("客户可见回复").fill(reply);
  const replyResponsePromise = page.waitForResponse((response) => (
    isApiResponse(response, `/api/leads/${leadType}/${leadId}/reply`, "POST")
  ));
  await drawer.getByRole("button", { name: "提交回复", exact: true }).click();
  const replyResponse = await replyResponsePromise;
  expect(replyResponse.status(), "客服回复应成功写入目标线索").toBe(201);
  expect(replyResponse.request().headers()["idempotency-key"], "回复必须携带幂等键").toBeTruthy();
  await expect(drawer).toContainText(reply);
}

async function assertCustomerReadback(
  page: Page,
  receipt: ConsultationReceipt & { productName: string },
  reply: string,
) {
  const path = `/api/customers/me/consultations/${receipt.leadId}`;
  const targetUrl = `/customer?section=consultations&leadId=${receipt.leadId}`;
  const navigationResponse = page.waitForResponse((response) => isApiResponse(response, path, "GET"));
  await page.goto(targetUrl);
  expect((await navigationResponse).status(), "客户应能按 canonical leadId 读回本人咨询").toBe(200);

  const reloadResponse = page.waitForResponse((response) => isApiResponse(response, path, "GET"));
  await page.reload();
  expect((await reloadResponse).status(), "客户刷新后应读回本人同一条咨询").toBe(200);
  const detail = page.getByRole("region", { name: "咨询详情" });
  await expect(detail).toContainText(reply);
  await expect(detail).toContainText(receipt.productName);
  await expect(detail).toContainText("下一步：请查看最新回复，并留意后续服务通知。");
}

test.describe("咨询旅程真实浏览器闭环", () => {
  test.setTimeout(120_000);
  test.skip(
    !realE2eEnabled,
    "需要 CONSULTATION_REAL_E2E=1 及完整的隔离测试作品、客户和客服凭据",
  );

  for (const viewport of viewportCases) {
    test(`${viewport.name}：普通/选款咨询、canonical Lead、客服回复与客户回读`, async ({ browser }, testInfo) => {
      const baseURL = testInfo.project.use.baseURL;
      expect(typeof baseURL === "string" && baseURL.length > 0, "必须由 Playwright 配置同源 Vite baseURL").toBe(true);
      const customerContext = await browser.newContext({
        baseURL: baseURL as string,
        viewport: { width: viewport.width, height: viewport.height },
      });
      let staffContext: BrowserContext | undefined;
      let customerPage: Page | undefined;
      let staffPage: Page | undefined;
      const marker = `${viewport.name}-${testInfo.workerIndex}-${Date.now().toString(36)}`;
      const consultationMessage = `真实咨询闭环 ${marker}：请确认这件作品的佩戴与到店安排。`;
      const selectionMessage = `真实选款闭环 ${marker}：请比较本次选择作品并给出佩戴建议。`;
      const advisorReply = `顾问回复 ${marker}：已收到需求，请在客户中心留意后续安排。`;
      const selectionReply = `选款顾问回复 ${marker}：已收到选款需求，可继续补充佩戴场景。`;

      try {
        customerPage = await customerContext.newPage();
        await loginCustomer(customerPage);
        const inquiryReceipt = await submitProductConsultation(customerPage, consultationMessage);
        const selectionReceipt = await submitSelectionConsultation(customerPage, selectionMessage);

        staffContext = await browser.newContext({
          baseURL: baseURL as string,
          viewport: { width: 1440, height: 900 },
        });
        staffPage = await staffContext.newPage();
        await loginStaff(staffPage);
        await claimAndReply(
          staffPage,
          "inquiry",
          inquiryReceipt.leadId,
          consultationMessage,
          advisorReply,
          realEnvironment.productCode,
        );
        await claimAndReply(
          staffPage,
          "selection",
          selectionReceipt.leadId,
          selectionMessage,
          selectionReply,
          realEnvironment.selectionProductCode,
        );

        await assertCustomerReadback(customerPage, inquiryReceipt, advisorReply);
        await assertCustomerReadback(customerPage, selectionReceipt, selectionReply);
        expect(
          await customerPage.evaluate(() => (
            document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
          )),
          `${viewport.name} 客户页面不应出现横向溢出`,
        ).toBe(true);
        await customerPage.screenshot({
          path: testInfo.outputPath(`consultation-real-${viewport.name}-success.png`),
          fullPage: true,
        });
      } catch (error) {
        const failureScreenshots = [
          customerPage?.screenshot({
            path: testInfo.outputPath(`consultation-real-${viewport.name}-customer-failure.png`),
            fullPage: true,
          }),
          staffPage?.screenshot({
            path: testInfo.outputPath(`consultation-real-${viewport.name}-staff-failure.png`),
            fullPage: true,
          }),
        ].filter((capture): capture is Promise<Buffer> => Boolean(capture));
        await Promise.allSettled(failureScreenshots);
        throw error;
      } finally {
        await staffContext?.close();
        await customerContext.close();
      }
    });
  }
});
