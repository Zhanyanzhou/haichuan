import { expect, test, type Page, type Route } from "@playwright/test";
import { installAdminSession } from "./fixtures/session-auth";

type LeadState = {
  assignedTo: number | null;
  assigneeName: string | null;
};

const wrapped = (data: unknown) => JSON.stringify({
  code: 200,
  data,
  message: "ok",
});

async function fulfillJson(route: Route, data: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: status === 200 ? wrapped(data) : JSON.stringify(data),
  });
}

function listLead(state: LeadState) {
  return {
    id: 17,
    leadType: "inquiry",
    leadTypeLabel: "预约咨询",
    customerName: "测试访客",
    phone: "13800000000",
    relatedProducts: 1,
    status: "PENDING",
    assignedTo: state.assignedTo,
    assigneeName: state.assigneeName,
    createdAt: "2026-09-12T00:00:00.000Z",
    updatedAt: "2026-09-12T00:00:00.000Z",
  };
}

function detailLead(state: LeadState) {
  return {
    ...listLead(state),
    message: "希望预约到店看款。",
    assignee: state.assigneeName
      ? { id: state.assignedTo, realName: state.assigneeName }
      : null,
    followUps: [],
  };
}

async function installLeadRoutes(
  page: Page,
  state: LeadState,
  claim: (route: Route) => Promise<void>,
) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/auth/profile") return route.fallback();
    if (path === "/api/leads/inquiry/17/claim" && request.method() === "POST") {
      await claim(route);
      return;
    }
    if (path === "/api/leads/inquiry/17") {
      await fulfillJson(route, detailLead(state));
      return;
    }
    if (path === "/api/leads/notification-failures") {
      await fulfillJson(route, { list: [], total: 0 });
      return;
    }
    if (path === "/api/leads") {
      await fulfillJson(route, { list: [listLead(state)], total: 1 });
      return;
    }
    await fulfillJson(route, {});
  });
}

async function openLeadDetail(page: Page) {
  await page.goto("/admin/leads");
  await page.getByRole("button", { name: "查看" }).click();
  const drawer = page.getByRole("dialog", { name: "线索详情" });
  await expect(drawer.getByText("测试访客", { exact: true })).toBeVisible();
  await page.evaluate(() => {
    document.cookie = "hc_csrf=lead-claim-ui-csrf; path=/";
  });
  return drawer;
}

test.beforeEach(async ({ page }) => {
  await installAdminSession(page, {
    id: 7,
    username: "customer-service-7",
    realName: "客服七号",
    role: "CUSTOMER_SERVICE",
  });
});

test("领取期间阻止重复点击，成功后列表与详情同步负责人", async ({ page }) => {
  const state: LeadState = { assignedTo: null, assigneeName: null };
  let claimRequests = 0;
  let releaseClaim: (() => void) | undefined;
  await installLeadRoutes(page, state, async (route) => {
    claimRequests += 1;
    await new Promise<void>((resolve) => {
      releaseClaim = resolve;
    });
    state.assignedTo = 7;
    state.assigneeName = "客服七号";
    await fulfillJson(route, {
      id: 17,
      assignedTo: 7,
      status: "PENDING",
      updatedAt: "2026-09-12T01:00:00.000Z",
    });
  });

  await page.goto("/admin/leads");
  await page.evaluate(() => {
    document.cookie = "hc_csrf=lead-claim-ui-csrf; path=/";
  });
  const row = page.getByRole("row", { name: /测试访客/ });
  const claimButton = row.getByRole("button", { name: "领取线索" });
  await claimButton.click();
  await expect.poll(() => claimRequests).toBe(1);
  await expect(claimButton).toHaveClass(/ant-btn-loading/);

  await claimButton.evaluate((button) => (button as HTMLButtonElement).click());
  expect(claimRequests).toBe(1);
  releaseClaim?.();

  await expect(
    page.locator(".ant-alert").filter({ hasText: "线索已领取。" }),
  ).toBeVisible();
  await expect(row).toContainText("客服七号");
  await expect(row.getByRole("button", { name: "领取线索" })).toHaveCount(0);

  await row.getByRole("button", { name: "查看" }).click();
  const drawer = page.getByRole("dialog", { name: "线索详情" });
  await expect(drawer.getByText("客服七号", { exact: true })).toBeVisible();
  await expect(drawer.getByRole("button", { name: "领取线索" })).toHaveCount(0);
  expect(claimRequests).toBe(1);
});

test("领取冲突保留明确状态，并可重新加载确认实际负责人", async ({ page }) => {
  const state: LeadState = { assignedTo: null, assigneeName: null };
  await installLeadRoutes(page, state, async (route) => {
    state.assignedTo = 8;
    state.assigneeName = "客服八号";
    await fulfillJson(route, {
      code: 409,
      message: "线索已被其他员工领取，请刷新后确认",
    }, 409);
  });

  const drawer = await openLeadDetail(page);
  await drawer.getByRole("button", { name: "领取线索" }).click();

  await expect(
    drawer.getByText("线索已被其他员工领取。请重新加载后确认负责人。", {
      exact: true,
    }),
  ).toBeVisible();
  await drawer.getByRole("button", { name: "重新加载" }).click();
  await expect(drawer.getByText("客服八号", { exact: true })).toBeVisible();
  await expect(drawer.getByRole("button", { name: "领取线索" })).toHaveCount(0);
});

test("领取失败后恢复原操作，重试成功不会产生重复请求", async ({ page }) => {
  const state: LeadState = { assignedTo: null, assigneeName: null };
  let claimRequests = 0;
  await installLeadRoutes(page, state, async (route) => {
    claimRequests += 1;
    if (claimRequests === 1) {
      await fulfillJson(route, { code: 503, message: "temporary failure" }, 503);
      return;
    }
    state.assignedTo = 7;
    state.assigneeName = "客服七号";
    await fulfillJson(route, {
      id: 17,
      assignedTo: 7,
      status: "PENDING",
      updatedAt: "2026-09-12T01:00:00.000Z",
    });
  });

  const drawer = await openLeadDetail(page);
  const claimButton = drawer.getByRole("button", { name: "领取线索" });
  await claimButton.click();

  await expect(
    drawer.getByText("线索领取失败，请重新加载后重试。", { exact: true }),
  ).toBeVisible();
  await expect(claimButton).toBeEnabled();
  await claimButton.click();

  await expect(drawer.getByText("线索已领取。", { exact: true })).toBeVisible();
  await expect(drawer.getByText("客服七号", { exact: true })).toBeVisible();
  expect(claimRequests).toBe(2);
});
