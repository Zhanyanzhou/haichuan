import { expect, test, type Page, type Request, type Route } from "@playwright/test";
import { installCustomerSession, readSessionHeaders } from "./fixtures/session-auth";

function apiResponse(data: unknown) {
  return JSON.stringify({ code: 200, data, message: "success" });
}

async function fulfill(route: Route, data: unknown) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: apiResponse(data),
  });
}

function requestContract(request: Request) {
  return {
    path: new URL(request.url()).pathname,
    method: request.method(),
    ...readSessionHeaders(request),
  };
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  )).toBe(true);
}

test.describe("客户咨询回复闭环", () => {
  test("登录客户从普通咨询回执进入同一 canonical Lead 并看到顾问回复", async ({ page }) => {
    const protectedRequests: ReturnType<typeof requestContract>[] = [];
    const consultationPaths: string[] = [];

    await page.addInitScript(() => {
      document.cookie = "hc_csrf=consultation-receipt-csrf; path=/";
    });
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path.startsWith("/api/customers/me/") || path === "/api/inquiries") {
        protectedRequests.push(requestContract(request));
      }

      if (path === "/api/inquiries" && request.method() === "POST") {
        return fulfill(route, {
          id: 17,
          sourceId: 17,
          leadId: 41,
          status: "PENDING",
          createdAt: "2026-09-22T08:00:00.000Z",
        });
      }
      if (path === "/api/customers/me/consultations/41") {
        consultationPaths.push(path);
        return fulfill(route, {
          leadId: 41,
          sourceId: 17,
          type: "inquiry",
          status: "CONTACTED",
          handlingState: "IN_PROGRESS",
          nextAction: "REVIEW_ADVISOR_REPLY",
          message: "希望了解星河戒指的到店试戴安排。",
          consultationType: "到店咨询",
          preferredContact: "电话",
          preferredTime: "下午 (14:00-18:00)",
          budgetRange: null,
          product: { name: "星河戒指" },
          items: [],
          createdAt: "2026-09-22T08:00:00.000Z",
          updatedAt: "2026-09-22T09:00:00.000Z",
          reply: {
            id: 501,
            content: "已为您记录到店试戴需求，顾问会进一步确认可预约时段。",
            createdAt: "2026-09-22T09:00:00.000Z",
          },
        });
      }
      if (path.startsWith("/api/customers/me/consultations/")) {
        consultationPaths.push(path);
        return route.fulfill({ status: 404, json: { message: "咨询记录不存在" } });
      }
      if (path === "/api/customers/me/inquiries") {
        return fulfill(route, { list: [], total: 0, page: 1, pageSize: 3 });
      }
      if (path === "/api/customers/me/selection-inquiries") {
        return fulfill(route, []);
      }
      if (path === "/api/customers/me/notifications") {
        return fulfill(route, {
          list: [], total: 0, unreadCount: 0, page: 1, pageSize: 20,
        });
      }
      if (path === "/api/settings/public") {
        return fulfill(route, {
          siteName: "海川珠宝",
          contactPhone: "",
          contactEmail: "",
          contactAddress: "",
          businessHours: "",
        });
      }
      if (path === "/api/settings/flags") {
        return fulfill(route, {
          commerceEnabled: false,
          cartEnabled: false,
          paymentEnabled: false,
          partnerApplicationsWriteEnabled: false,
        });
      }
      if (path === "/api/page-modules/document/published") return fulfill(route, null);
      if (path === "/api/partner-applications/me") return fulfill(route, null);
      if (path.endsWith("/analytics/track")) {
        return route.fulfill({ status: 204, body: "" });
      }
      if (request.method() === "GET") return fulfill(route, []);
      return route.abort();
    });
    await installCustomerSession(page, {
      id: 7,
      name: "咨询回执会员",
      phone: "13800000007",
    });

    await page.goto("/contact");
    await expect(page.locator("#cf-name")).toHaveValue("咨询回执会员");
    await expect(page.locator("#cf-phone")).toHaveValue("13800000007");
    await page.locator("#cf-type").selectOption("到店咨询");
    await page.locator("#cf-message").fill("希望了解星河戒指的到店试戴安排。");
    await page.locator("#cf-privacy-consent").check();
    await page.getByRole("button", { name: "提交需求" }).click();

    const receipt = page.locator('dl[aria-label="咨询回执"]');
    await expect(receipt).toContainText("#17");
    const detailLink = page.getByRole("link", { name: "查看本次咨询" });
    await expect(detailLink).toHaveAttribute(
      "href",
      "/customer?section=consultations&leadId=41",
    );
    await detailLink.click();

    await expect(page).toHaveURL(/\/customer\?section=consultations&leadId=41$/);
    const detail = page.getByRole("region", { name: "咨询详情" });
    await expect(detail.getByRole("heading", { name: "星河戒指" })).toBeVisible();
    await expect(detail.getByText("已联系", { exact: true })).toBeVisible();
    await expect(detail.getByText("当前责任：海川顾问持续跟进")).toBeVisible();
    await expect(detail.getByText("下一步：请查看最新回复，并留意后续服务通知。")).toBeVisible();
    await expect(detail.getByText(
      "已为您记录到店试戴需求，顾问会进一步确认可预约时段。",
    )).toBeVisible();
    await expectNoHorizontalOverflow(page);
    expect(consultationPaths).toEqual(["/api/customers/me/consultations/41"]);
    expect(consultationPaths).not.toContain("/api/customers/me/consultations/17");
    expect(protectedRequests).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: "/api/inquiries",
        method: "POST",
        authorization: undefined,
        csrf: "consultation-receipt-csrf",
        sessionDomain: "customer",
      }),
      expect.objectContaining({
        path: "/api/customers/me/consultations/41",
        method: "GET",
        authorization: undefined,
        sessionDomain: "customer",
      }),
    ]));
  });

  test("客户 A 的迟到提交不会污染或解锁客户 B 的在途咨询", async ({ page }, testInfo) => {
    const customerA = {
      id: 7,
      phone: "13800000007",
      name: "客户甲",
      email: null,
    };
    const customerB = {
      id: 8,
      phone: "13800000008",
      name: "客户乙",
      email: null,
    };
    let releaseA!: () => void;
    let releaseB!: () => void;
    let markARequested!: () => void;
    let markBRequested!: () => void;
    const waitA = new Promise<void>((resolve) => { releaseA = resolve; });
    const waitB = new Promise<void>((resolve) => { releaseB = resolve; });
    const aRequested = new Promise<void>((resolve) => { markARequested = resolve; });
    const bRequested = new Promise<void>((resolve) => { markBRequested = resolve; });
    const idempotencyKeys: string[] = [];

    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === "/api/inquiries" && request.method() === "POST") {
        const body = request.postDataJSON() as { phone: string };
        idempotencyKeys.push(request.headers()["idempotency-key"]);
        if (body.phone === customerA.phone) {
          markARequested();
          await waitA;
          return fulfill(route, {
            id: 17,
            sourceId: 17,
            leadId: 41,
            status: "PENDING",
            createdAt: "2026-09-22T08:00:00.000Z",
          });
        }
        markBRequested();
        await waitB;
        return fulfill(route, {
          id: 18,
          sourceId: 18,
          leadId: 42,
          status: "PENDING",
          createdAt: "2026-09-22T08:01:00.000Z",
        });
      }
      if (path === "/api/settings/public") {
        return fulfill(route, {
          siteName: "海川珠宝",
          contactPhone: "",
          contactEmail: "",
          contactAddress: "",
          businessHours: "",
        });
      }
      if (path === "/api/page-modules/document/published") return fulfill(route, null);
      if (request.method() === "GET") return fulfill(route, []);
      return route.abort();
    });
    await installCustomerSession(page, customerA);
    await page.goto("/contact");
    await page.locator("#cf-type").selectOption("到店咨询");
    await page.locator("#cf-message").fill("客户甲的预约需求");
    await page.locator("#cf-privacy-consent").check();
    await page.getByRole("button", { name: "提交需求" }).click();
    await aRequested;

    await page.evaluate(async (customer) => {
      const { useCustomerAuthStore } = await import("/src/store/customerAuthStore.ts");
      useCustomerAuthStore.getState().setAuth(customer);
    }, customerB);
    await expect(page.locator("#cf-name")).toHaveValue(customerB.name);
    await expect(page.locator("#cf-phone")).toHaveValue(customerB.phone);
    await page.locator("#cf-type").selectOption("到店咨询");
    await page.locator("#cf-message").fill("客户乙的预约需求");
    await page.locator("#cf-privacy-consent").check();
    await page.getByRole("button", { name: "提交需求" }).click();
    await bRequested;

    releaseA();
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
    await page.screenshot({
      path: testInfo.outputPath("contact-cross-customer-pending.png"),
      fullPage: false,
    });
    await expect(page.getByRole("button", { name: "正在提交…" })).toBeDisabled();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "需求已提交" })).toHaveCount(0);

    releaseB();
    await expect(page.getByRole("heading", { name: "需求已提交" })).toBeVisible();
    await expect(page.locator('dl[aria-label="咨询回执"]')).toContainText("#18");
    await expect(page.getByRole("link", { name: "查看本次咨询" }))
      .toHaveAttribute("href", "/customer?section=consultations&leadId=42");
    expect(idempotencyKeys).toHaveLength(2);
    expect(idempotencyKeys[0]).toBeTruthy();
    expect(idempotencyKeys[1]).toBeTruthy();
    expect(idempotencyKeys[1]).not.toBe(idempotencyKeys[0]);
  });

  test("390px 客户可区分待接收、已接手与已结束并从终态恢复", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/customers/me/inquiries") {
        return fulfill(route, {
          list: [
            {
              id: 11,
              leadId: 41,
              status: "PENDING",
              handlingState: "WAITING_ASSIGNMENT",
              nextAction: "WAIT_FOR_ADVISOR",
              message: "等待顾问团队接收。",
              consultationType: "到店咨询",
              createdAt: "2026-09-22T08:00:00.000Z",
              updatedAt: "2026-09-22T08:00:00.000Z",
              reply: null,
            },
            {
              id: 12,
              leadId: 42,
              status: "PENDING",
              handlingState: "ADVISOR_ASSIGNED",
              nextAction: "WAIT_FOR_ADVISOR",
              message: "顾问已接手但尚未回复。",
              consultationType: "预约咨询",
              createdAt: "2026-09-22T07:00:00.000Z",
              updatedAt: "2026-09-22T07:30:00.000Z",
              reply: null,
            },
          ],
          total: 2,
          page: 1,
          pageSize: 3,
        });
      }
      if (path === "/api/customers/me/selection-inquiries") {
        return fulfill(route, [{
          id: 13,
          leadId: 43,
          status: "COMPLETED",
          handlingState: "CLOSED",
          nextAction: "START_NEW_CONSULTATION",
          message: "本次选款咨询已经结束。",
          items: [{ productNameSnapshot: "流光项链" }],
          createdAt: "2026-09-21T08:00:00.000Z",
          updatedAt: "2026-09-22T06:00:00.000Z",
          reply: null,
        }]);
      }
      if (path === "/api/customers/me/notifications") {
        return fulfill(route, {
          list: [], total: 0, unreadCount: 0, page: 1, pageSize: 20,
        });
      }
      if (path === "/api/settings/flags") {
        return fulfill(route, {
          commerceEnabled: false,
          cartEnabled: false,
          paymentEnabled: false,
          partnerApplicationsWriteEnabled: false,
        });
      }
      if (path === "/api/partner-applications/me") return fulfill(route, null);
      return fulfill(route, []);
    });
    await installCustomerSession(page, { id: 7, name: "咨询状态会员" });

    await page.goto("/customer");
    const appointments = page.locator("#my-appointments");
    await expect(appointments.getByText("当前责任：顾问团队正在接收")).toBeVisible();
    await expect(appointments.getByText("当前责任：海川顾问已接手")).toBeVisible();
    await expect(appointments.getByText("下一步：请留意客户中心的服务通知。")).toHaveCount(2);

    const selections = page.locator("#my-selections");
    await expect(selections.getByText("当前责任：本次咨询已结束")).toBeVisible();
    await expect(selections.getByText("下一步：如仍需服务，请重新发起咨询。")).toBeVisible();
    await expect(selections.getByRole("link", { name: "重新进入选款中心" }))
      .toHaveAttribute("href", "/catalog");
    await expectNoHorizontalOverflow(page);
  });

  test("客户 A 退出后客户 B 登录不会继承 A 的选款", async ({ page }) => {
    const customerA = {
      id: 7,
      phone: "13800000007",
      name: "选款会员 A",
      email: null,
    };
    const customerB = {
      id: 8,
      phone: "13800000008",
      name: "选款会员 B",
      email: null,
    };
    let currentCustomer: typeof customerA | null = customerA;
    await page.addInitScript(() => {
      localStorage.setItem("hc_selection_tray", JSON.stringify({
        state: { ownerKey: "customer:7", selectedIds: [1] },
        version: 1,
      }));
    });
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === "/api/customers/me") {
        return currentCustomer
          ? fulfill(route, currentCustomer)
          : route.fulfill({ status: 401, json: { message: "anonymous" } });
      }
      if (path === "/api/customers/session/logout") {
        currentCustomer = null;
        return fulfill(route, { success: true });
      }
      if (path === "/api/customers/login/challenge") {
        return fulfill(route, { level: "none" });
      }
      if (path === "/api/customers/login") {
        currentCustomer = customerB;
        return fulfill(route, { customer: customerB });
      }
      if (path === "/api/customers/sms-requirements") {
        return fulfill(route, { registerRequired: true });
      }
      if (path === "/api/customers/wechat/config") {
        return fulfill(route, { enabled: false });
      }
      if (path === "/api/customers/me/inquiries") {
        return fulfill(route, { list: [], total: 0, page: 1, pageSize: 5 });
      }
      if (path === "/api/customers/me/notifications") {
        return fulfill(route, { list: [], total: 0, unreadCount: 0, page: 1, pageSize: 20 });
      }
      if (path === "/api/settings/flags") {
        return fulfill(route, { commerceEnabled: false, cartEnabled: false, paymentEnabled: false });
      }
      if (path === "/api/partner-applications/me") return fulfill(route, null);
      return fulfill(route, []);
    });

    await page.goto("/customer");
    await expect(page.getByRole("heading", { name: "我的账号" })).toBeVisible();
    await page.getByRole("button", { name: "退出登录" }).click();
    await expect(page.getByRole("button", { name: "会员登录 / 注册" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => {
      const raw = localStorage.getItem("hc_selection_tray");
      return raw ? JSON.parse(raw).state : null;
    })).toEqual({ ownerKey: "guest", selectedIds: [] });

    await page.getByLabel("手机号").fill(customerB.phone);
    await page.getByLabel("密码").fill("CustomerB1");
    await page.getByRole("button", { name: "登录我的账户" }).click();
    await expect(page.getByRole("heading", { name: "我的账号" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => {
      const raw = localStorage.getItem("hc_selection_tray");
      return raw ? JSON.parse(raw).state : null;
    })).toEqual({ ownerKey: "customer:8", selectedIds: [] });
  });

  test("客户 A 的慢私有 GET 在切换到 B 后不会合并或回填", async ({ page }) => {
    const customerA = { id: 7, phone: "13800000007", name: "会员 A", email: null };
    const customerB = { id: 8, phone: "13800000008", name: "会员 B", email: null };
    let currentCustomer: typeof customerA | null = customerA;
    let releaseCustomerANotifications: (() => Promise<void>) | null = null;
    let notificationRequests = 0;

    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/customers/me") {
        return currentCustomer
          ? fulfill(route, currentCustomer)
          : route.fulfill({ status: 401, json: { message: "anonymous" } });
      }
      if (path === "/api/customers/session/logout") {
        currentCustomer = null;
        return fulfill(route, { success: true });
      }
      if (path === "/api/customers/login/challenge") {
        return fulfill(route, { level: "none" });
      }
      if (path === "/api/customers/login") {
        currentCustomer = customerB;
        return fulfill(route, { customer: customerB });
      }
      if (path === "/api/customers/sms-requirements") {
        return fulfill(route, { registerRequired: true });
      }
      if (path === "/api/customers/wechat/config") {
        return fulfill(route, { enabled: false });
      }
      if (path === "/api/customers/me/notifications") {
        notificationRequests += 1;
        if (currentCustomer?.id === customerA.id && !releaseCustomerANotifications) {
          return new Promise<void>((resolve) => {
            releaseCustomerANotifications = async () => {
              await fulfill(route, {
                list: [{
                  id: 71,
                  type: "SERVICE_CONSULTATION_REPLIED",
                  locale: "ZH_CN",
                  title: "A 私密通知",
                  body: "仅客户 A 可见",
                  actionUrl: null,
                  status: "AVAILABLE",
                  availableAt: "2026-09-21T00:00:00.000Z",
                  createdAt: "2026-09-21T00:00:00.000Z",
                }],
                total: 1,
                unreadCount: 1,
                page: 1,
                pageSize: 20,
              });
              resolve();
            };
          });
        }
        return fulfill(route, {
          list: [], total: 0, unreadCount: 0, page: 1, pageSize: 20,
        });
      }
      if (path === "/api/customers/me/inquiries") {
        return fulfill(route, { list: [], total: 0, page: 1, pageSize: 3 });
      }
      if (path === "/api/settings/flags") {
        return fulfill(route, {
          commerceEnabled: false,
          cartEnabled: false,
          paymentEnabled: false,
          partnerApplicationsWriteEnabled: false,
        });
      }
      if (path === "/api/partner-applications/me") return fulfill(route, null);
      return fulfill(route, []);
    });

    await page.goto("/customer");
    await expect(page.getByRole("heading", { name: "我的账号" })).toBeVisible();
    await expect.poll(() => Boolean(releaseCustomerANotifications)).toBe(true);

    await page.getByRole("button", { name: "退出登录" }).click();
    await expect(page.getByRole("button", { name: "会员登录 / 注册" })).toBeVisible();
    await page.getByLabel("手机号").fill(customerB.phone);
    await page.getByLabel("密码").fill("CustomerB1");
    await page.getByRole("button", { name: "登录我的账户" }).click();
    await expect(page.getByText("您好，会员 B。您的作品、咨询与服务记录都在这里。")).toBeVisible();
    await expect.poll(() => notificationRequests).toBe(2);

    await releaseCustomerANotifications!();
    await expect(page.getByText("A 私密通知")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "服务通知" })
      .getByText("暂时没有新的服务通知。")).toBeVisible();
  });

  test("客户 A 的慢 GET 返回旧 401 时不会刷新或退出已登录的 B", async ({ page }) => {
    const customerA = { id: 7, phone: "13800000007", name: "会员 A", email: null };
    const customerB = { id: 8, phone: "13800000008", name: "会员 B", email: null };
    let currentCustomer: typeof customerA | null = customerA;
    let releaseCustomerARequest: (() => Promise<void>) | null = null;
    let notificationRequests = 0;
    let refreshRequests = 0;
    await page.addInitScript(() => {
      const target = window as typeof window & { __customerEpochGlobalErrors?: number };
      target.__customerEpochGlobalErrors = 0;
      window.addEventListener("haichuan:request-error", () => {
        target.__customerEpochGlobalErrors = (target.__customerEpochGlobalErrors ?? 0) + 1;
      });
    });

    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/customers/me") {
        return currentCustomer
          ? fulfill(route, currentCustomer)
          : route.fulfill({ status: 401, json: { message: "anonymous" } });
      }
      if (path === "/api/customers/session/logout") {
        currentCustomer = null;
        return fulfill(route, { success: true });
      }
      if (path === "/api/customers/session/refresh") {
        refreshRequests += 1;
        return route.fulfill({ status: 401, json: { message: "expired" } });
      }
      if (path === "/api/customers/login/challenge") return fulfill(route, { level: "none" });
      if (path === "/api/customers/login") {
        currentCustomer = customerB;
        return fulfill(route, { customer: customerB });
      }
      if (path === "/api/customers/sms-requirements") {
        return fulfill(route, { registerRequired: true });
      }
      if (path === "/api/customers/wechat/config") return fulfill(route, { enabled: false });
      if (path === "/api/customers/me/notifications") {
        notificationRequests += 1;
        if (currentCustomer?.id === customerA.id && !releaseCustomerARequest) {
          return new Promise<void>((resolve) => {
            releaseCustomerARequest = async () => {
              await route.fulfill({ status: 401, json: { message: "expired A session" } });
              resolve();
            };
          });
        }
        return fulfill(route, { list: [], total: 0, unreadCount: 0, page: 1, pageSize: 20 });
      }
      if (path === "/api/customers/me/inquiries") {
        return fulfill(route, { list: [], total: 0, page: 1, pageSize: 3 });
      }
      if (path === "/api/settings/flags") {
        return fulfill(route, {
          commerceEnabled: false,
          cartEnabled: false,
          paymentEnabled: false,
          partnerApplicationsWriteEnabled: false,
        });
      }
      if (path === "/api/partner-applications/me") return fulfill(route, null);
      return fulfill(route, []);
    });

    await page.goto("/customer");
    await expect(page.getByRole("heading", { name: "我的账号" })).toBeVisible();
    await expect.poll(() => Boolean(releaseCustomerARequest)).toBe(true);
    await page.getByRole("button", { name: "退出登录" }).click();
    await expect(page.getByRole("button", { name: "会员登录 / 注册" })).toBeVisible();
    const loginForm = page.locator("#member-access-form");
    await loginForm.getByLabel("手机号", { exact: true }).fill(customerB.phone);
    await loginForm.getByLabel("密码", { exact: true }).fill("CustomerB1");
    await loginForm.getByRole("button", { name: "登录我的账户" }).click();
    await expect(page.getByText("您好，会员 B。您的作品、咨询与服务记录都在这里。")).toBeVisible();
    await expect.poll(() => notificationRequests).toBe(2);

    await releaseCustomerARequest!();
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
    expect(refreshRequests).toBe(0);
    await expect(page.getByRole("button", { name: "会员登录 / 注册" })).toHaveCount(0);
    await expect(page.evaluate(async () => {
      const { useCustomerAuthStore } = await import("/src/store/customerAuthStore.ts");
      const target = window as typeof window & { __customerEpochGlobalErrors?: number };
      return {
        customerId: useCustomerAuthStore.getState().customer?.id,
        authStatus: useCustomerAuthStore.getState().status,
        globalErrors: target.__customerEpochGlobalErrors ?? 0,
      };
    })).resolves.toEqual({ customerId: 8, authStatus: "authenticated", globalErrors: 0 });
  });

  test("客户 A 的迟到通知已读 401 不会用 B 会话重试或退出 B", async ({ page }) => {
    const customerA = { id: 7, phone: "13800000007", name: "会员 A", email: null };
    const customerB = { id: 8, phone: "13800000008", name: "会员 B", email: null };
    let currentCustomer: typeof customerA | null = customerA;
    let releaseCustomerAMarkRead: (() => Promise<void>) | null = null;
    let markReadRequests = 0;
    let refreshRequests = 0;

    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === "/api/customers/me") {
        return currentCustomer
          ? fulfill(route, currentCustomer)
          : route.fulfill({ status: 401, json: { message: "anonymous" } });
      }
      if (path === "/api/customers/session/logout") {
        currentCustomer = null;
        return fulfill(route, { success: true });
      }
      if (path === "/api/customers/login/challenge") return fulfill(route, { level: "none" });
      if (path === "/api/customers/login") {
        currentCustomer = customerB;
        return fulfill(route, { customer: customerB });
      }
      if (path === "/api/customers/session/refresh") {
        refreshRequests += 1;
        return currentCustomer
          ? fulfill(route, { customer: currentCustomer })
          : route.fulfill({ status: 401, json: { message: "expired" } });
      }
      if (path === "/api/customers/sms-requirements") {
        return fulfill(route, { registerRequired: true });
      }
      if (path === "/api/customers/wechat/config") return fulfill(route, { enabled: false });
      if (path === "/api/customers/me/notifications/91/read" && request.method() === "PUT") {
        markReadRequests += 1;
        if (markReadRequests === 1) {
          return new Promise<void>((resolve) => {
            releaseCustomerAMarkRead = async () => {
              await route.fulfill({ status: 401, json: { message: "expired A session" } });
              resolve();
            };
          });
        }
        return route.fulfill({ status: 401, json: { message: "B does not own A notification" } });
      }
      if (path === "/api/customers/me/notifications") {
        return fulfill(route, currentCustomer?.id === customerA.id
          ? {
              list: [{
                id: 91,
                type: "SERVICE_CONSULTATION_REPLIED",
                locale: "ZH_CN",
                title: "顾问已回复 A 的咨询",
                body: "仅客户 A 可见",
                actionUrl: "/customer?section=consultations&leadId=41",
                status: "AVAILABLE",
                availableAt: "2026-09-22T09:00:00.000Z",
                createdAt: "2026-09-22T09:00:00.000Z",
              }],
              total: 1,
              unreadCount: 1,
              page: 1,
              pageSize: 20,
            }
          : { list: [], total: 0, unreadCount: 0, page: 1, pageSize: 20 });
      }
      if (path === "/api/customers/me/inquiries") {
        return fulfill(route, { list: [], total: 0, page: 1, pageSize: 3 });
      }
      if (path === "/api/settings/flags") {
        return fulfill(route, {
          commerceEnabled: false,
          cartEnabled: false,
          paymentEnabled: false,
          partnerApplicationsWriteEnabled: false,
        });
      }
      if (path === "/api/partner-applications/me") return fulfill(route, null);
      return fulfill(route, []);
    });
    await page.goto("/customer");
    const notifications = page.getByRole("region", { name: "服务通知" });
    await expect(notifications.getByText("顾问已回复 A 的咨询")).toBeVisible();
    await notifications.getByRole("button", { name: "标为已读", exact: true }).click();
    await expect.poll(() => Boolean(releaseCustomerAMarkRead)).toBe(true);

    await page.getByRole("button", { name: "退出登录", exact: true }).click();
    const loginForm = page.locator("#member-access-form");
    await expect(loginForm.getByRole("button", { name: "登录我的账户" })).toBeVisible();
    await loginForm.getByLabel("手机号", { exact: true }).fill(customerB.phone);
    await loginForm.getByLabel("密码", { exact: true }).fill("CustomerB1");
    await loginForm.getByRole("button", { name: "登录我的账户" }).click();
    await expect(page.getByText("您好，会员 B。您的作品、咨询与服务记录都在这里。")).toBeVisible();

    await releaseCustomerAMarkRead!();
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));

    expect(markReadRequests).toBe(1);
    expect(refreshRequests).toBe(0);
    await expect(page.getByRole("button", { name: "会员登录 / 注册" })).toHaveCount(0);
    await expect(page.getByText("通知状态更新失败，请稍后重试")).toHaveCount(0);
    await expect(page.evaluate(async () => {
      const { useCustomerAuthStore } = await import("/src/store/customerAuthStore.ts");
      return {
        customerId: useCustomerAuthStore.getState().customer?.id,
        authStatus: useCustomerAuthStore.getState().status,
      };
    })).resolves.toEqual({ customerId: 8, authStatus: "authenticated" });
  });

  test("客户在 390px 从通知定位不在第一页的预约咨询", async ({ page }) => {
    const protectedRequests: ReturnType<typeof requestContract>[] = [];
    const inquiryPages: string[] = [];

    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      document.cookie = "hc_csrf=consultation-csrf; path=/";
    });
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path.startsWith("/api/customers/me/")) {
        protectedRequests.push(requestContract(request));
      }

      if (path === "/api/customers/me/inquiries") {
        inquiryPages.push(new URL(request.url()).searchParams.get("page") || "1");
        return fulfill(route, {
          list: [{
            id: 11,
            leadId: 43,
            status: "PENDING",
            message: "第一页的其他预约。",
            consultationType: "新咨询",
            product: { name: "其他作品" },
            createdAt: "2026-09-07T10:00:00.000Z",
            updatedAt: "2026-09-07T10:00:00.000Z",
            reply: null,
          }],
          total: 4,
          page: 1,
          pageSize: 3,
        });
      }
      if (path === "/api/customers/me/consultations/41") {
        return fulfill(route, {
          leadId: 41,
          sourceId: 11,
          type: "inquiry",
          status: "CONTACTED",
          handlingState: "IN_PROGRESS",
          nextAction: "REVIEW_ADVISOR_REPLY",
          message: "想了解蓝宝石戒指的改圈与交付时间。",
          consultationType: "到店预约",
          preferredContact: "phone",
          preferredTime: "周六下午",
          budgetRange: "20000-30000",
          product: { name: "蓝宝石钻戒" },
          items: [],
          createdAt: "2026-09-06T08:00:00.000Z",
          updatedAt: "2026-09-07T08:00:00.000Z",
          reply: {
            id: 501,
            content: "可以为您预留周六下午的鉴赏时段，改圈需先现场测量。",
            createdAt: "2026-09-07T08:00:00.000Z",
          },
        });
      }
      if (path === "/api/customers/me/selection-inquiries") {
        return fulfill(route, [{
          id: 12,
          leadId: 42,
          status: "FOLLOWING",
          handlingState: "IN_PROGRESS",
          nextAction: "REVIEW_ADVISOR_REPLY",
          message: "请比较两件作品的日常佩戴感。",
          items: [
            { productNameSnapshot: "祖母绿项链" },
            { productNameSnapshot: "沙弗莱吊坠" },
          ],
          createdAt: "2026-09-05T08:00:00.000Z",
          updatedAt: "2026-09-07T09:00:00.000Z",
          reply: {
            id: 502,
            content: "祖母绿项链存在感更强，沙弗莱吊坠更适合日常叠戴。",
            createdAt: "2026-09-07T09:00:00.000Z",
          },
        }]);
      }
      if (path === "/api/customers/me/notifications") {
        return fulfill(route, {
          list: [{
            id: 91,
            type: "SERVICE_CONSULTATION_REPLIED",
            locale: "ZH_CN",
            title: "您的咨询已有新回复",
            body: "顾问已回复您的咨询，请在客户中心查看。",
            actionUrl: "/customer?section=consultations&leadId=41",
            status: "AVAILABLE",
            availableAt: "2026-09-07T08:00:00.000Z",
            createdAt: "2026-09-07T08:00:00.000Z",
          }],
          total: 1,
          unreadCount: 1,
          page: 1,
          pageSize: 20,
        });
      }
      if (path === "/api/customers/me/notifications/91/read") {
        return fulfill(route, { id: 91, status: "READ" });
      }
      if (path === "/api/settings/flags") {
        return fulfill(route, {
          commerceEnabled: false,
          cartEnabled: false,
          paymentEnabled: false,
          partnerApplicationsWriteEnabled: false,
        });
      }
      if (path === "/api/partner-applications/me") return fulfill(route, null);
      return fulfill(route, []);
    });
    await installCustomerSession(page, { id: 7, name: "咨询测试会员" });

    await page.goto("/customer");
    await expect(page.getByRole("heading", { name: "我的账号" })).toBeVisible();

    const selection = page.getByRole("heading", { name: "祖母绿项链" })
      .locator("xpath=ancestor::article");
    await selection.getByText("查看详情", { exact: true }).click();
    await expect(selection.getByText("请比较两件作品的日常佩戴感。")).toBeVisible();
    await expect(selection.getByText("祖母绿项链、沙弗莱吊坠")).toBeVisible();
    await expect(selection.getByText("当前责任：海川顾问持续跟进")).toBeVisible();

    await page.getByRole("link", { name: "查看咨询详情 →" }).click();
    await expect(page).toHaveURL(/section=consultations&leadId=41/);
    const focusedDetail = page.getByRole("region", { name: "咨询详情" });
    await expect(focusedDetail.getByRole("heading", { name: "蓝宝石钻戒" })).toBeVisible();
    await expect(focusedDetail.getByText("想了解蓝宝石戒指的改圈与交付时间。")).toBeVisible();
    await expect(focusedDetail.getByText("可以为您预留周六下午的鉴赏时段，改圈需先现场测量。")).toBeVisible();
    await expect(focusedDetail.getByText(/^海川顾问 ·/)).toBeVisible();
    await expect(focusedDetail.getByText("下一步：请查看最新回复，并留意后续服务通知。")).toBeVisible();

    await expectNoHorizontalOverflow(page);
    expect(inquiryPages).not.toContain("2");
    expect(protectedRequests).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: "/api/customers/me/inquiries",
        method: "GET",
        authorization: undefined,
        sessionDomain: "customer",
      }),
      expect.objectContaining({
        path: "/api/customers/me/consultations/41",
        method: "GET",
        authorization: undefined,
        sessionDomain: "customer",
      }),
      expect.objectContaining({
        path: "/api/customers/me/notifications/91/read",
        method: "PUT",
        authorization: undefined,
        csrf: "consultation-csrf",
        sessionDomain: "customer",
      }),
    ]));
  });

  test("刷新直达第四条选款咨询，列表翻页后仍可访问历史记录", async ({ page }) => {
    const selections = [1, 2, 3, 4].map((index) => ({
      id: 20 + index,
      leadId: 41 + index,
      status: index === 4 ? "FOLLOWING" : "PENDING",
      message: `选款需求 ${index}`,
      items: [{ productNameSnapshot: index === 4 ? "第四件历史作品" : `选款作品 ${index}` }],
      createdAt: `2026-09-0${7 - index}T08:00:00.000Z`,
      updatedAt: "2026-09-07T09:00:00.000Z",
      reply: null,
    }));

    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/customers/me/selection-inquiries") {
        return fulfill(route, selections);
      }
      if (path === "/api/customers/me/consultations/45") {
        return fulfill(route, {
          leadId: 45,
          sourceId: 24,
          type: "selection",
          status: "FOLLOWING",
          message: "选款需求 4",
          items: [{ productNameSnapshot: "第四件历史作品" }],
          product: null,
          createdAt: "2026-09-03T08:00:00.000Z",
          updatedAt: "2026-09-07T09:00:00.000Z",
          reply: {
            id: 505,
            content: "第四件作品已为您保留，可到店试戴。",
            createdAt: "2026-09-07T09:00:00.000Z",
          },
        });
      }
      if (path === "/api/customers/me/inquiries") {
        return fulfill(route, { list: [], total: 0, page: 1, pageSize: 3 });
      }
      if (path === "/api/customers/me/notifications") {
        return fulfill(route, { list: [], total: 0, unreadCount: 0, page: 1, pageSize: 20 });
      }
      if (path === "/api/settings/flags") {
        return fulfill(route, { commerceEnabled: false, cartEnabled: false, paymentEnabled: false });
      }
      if (path === "/api/partner-applications/me") return fulfill(route, null);
      return fulfill(route, []);
    });
    await installCustomerSession(page, { id: 10, name: "历史选款会员" });

    await page.goto("/customer?section=consultations&leadId=45");
    const focusedDetail = page.getByRole("region", { name: "咨询详情" });
    await expect(focusedDetail.getByRole("heading", { name: "第四件历史作品" })).toBeVisible();
    await expect(focusedDetail.getByText("第四件作品已为您保留，可到店试戴。")).toBeVisible();
    await expect(page.locator("#my-selections").getByRole("heading", { name: "第四件历史作品" })).toHaveCount(0);

    const pagination = page.getByRole("navigation", { name: "选款咨询分页" });
    await pagination.getByTitle("2").click();
    await expect(page).toHaveURL(/\/customer$/);
    await expect(focusedDetail).toHaveCount(0);
    await expect(page.locator("#my-selections").getByRole("heading", { name: "第四件历史作品" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe("my-selections");
  });

  test("非规范咨询直达参数不发起详情请求并可恢复到本人列表", async ({ page }) => {
    const consultationPaths: string[] = [];
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.startsWith("/api/customers/me/consultations/")) {
        consultationPaths.push(path);
        return route.fulfill({ status: 500, json: { message: "不应发起该请求" } });
      }
      if (path === "/api/customers/me/inquiries") {
        return fulfill(route, { list: [], total: 0, page: 1, pageSize: 3 });
      }
      if (path === "/api/customers/me/selection-inquiries") return fulfill(route, []);
      if (path === "/api/customers/me/notifications") {
        return fulfill(route, { list: [], total: 0, unreadCount: 0, page: 1, pageSize: 20 });
      }
      if (path === "/api/settings/flags") {
        return fulfill(route, { commerceEnabled: false, cartEnabled: false, paymentEnabled: false });
      }
      if (path === "/api/partner-applications/me") return fulfill(route, null);
      return fulfill(route, []);
    });
    await installCustomerSession(page, { id: 12, name: "咨询链接校验会员" });

    const invalidUrls = [
      "/customer?section=consultations&leadId=1e3",
      "/customer?section=consultations&leadId=%2B41",
      "/customer?section=consultations&leadId=041",
      "/customer?section=consultations&leadId=0",
      "/customer?section=consultations&leadId=-1",
      "/customer?section=consultations&leadId=1.5",
      "/customer?section=consultations&leadId=9007199254740992",
      "/customer?section=consultations&leadId=41&leadId=42",
      "/customer?leadId=41",
      "/customer?section=orders&leadId=41",
      "/customer?section=consultations&leadId=41&orderId=7",
      "/customer?section=consultations&leadId=41&source=notification",
    ];

    for (const invalidUrl of invalidUrls) {
      await page.goto(invalidUrl);
      const invalidTarget = page.getByRole("region", { name: "咨询定位无效" });
      await expect(invalidTarget).toBeVisible();
      await expect(invalidTarget.getByRole("alert")).toContainText(
        "系统未发起咨询详情请求",
      );
      await expect(invalidTarget).not.toContainText("未找到这条咨询");
      await expect(invalidTarget).not.toContainText("咨询详情暂时无法加载");
      expect(consultationPaths, invalidUrl).toEqual([]);

      await invalidTarget.getByRole("button", { name: "返回咨询列表" }).click();
      await expect(page).toHaveURL(/\/customer$/);
      await expect(invalidTarget).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe("my-appointments");
    }
  });

  test("定向详情失败可原链接重试，他人或不存在记录统一显示 404", async ({ page }) => {
    let attempts = 0;
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/customers/me/consultations/88") {
        attempts += 1;
        if (attempts === 1) {
          return route.fulfill({ status: 503, json: { message: "temporary" } });
        }
        return fulfill(route, {
          leadId: 88,
          sourceId: 33,
          type: "inquiry",
          status: "CONTACTED",
          message: "重试后可见的本人咨询。",
          items: [],
          product: { name: "重试作品" },
          createdAt: "2026-09-06T08:00:00.000Z",
          updatedAt: "2026-09-07T08:00:00.000Z",
          reply: {
            id: 508,
            content: "重试已恢复详情。",
            createdAt: "2026-09-07T08:00:00.000Z",
          },
        });
      }
      if (path === "/api/customers/me/consultations/999") {
        return route.fulfill({ status: 404, json: { message: "咨询记录不存在", internalNote: "不得显示" } });
      }
      if (path === "/api/customers/me/inquiries") {
        return fulfill(route, { list: [], total: 0, page: 1, pageSize: 3 });
      }
      if (path === "/api/customers/me/selection-inquiries") return fulfill(route, []);
      if (path === "/api/customers/me/notifications") {
        return fulfill(route, { list: [], total: 0, unreadCount: 0, page: 1, pageSize: 20 });
      }
      if (path === "/api/settings/flags") {
        return fulfill(route, { commerceEnabled: false, cartEnabled: false, paymentEnabled: false });
      }
      if (path === "/api/partner-applications/me") return fulfill(route, null);
      return fulfill(route, []);
    });
    await installCustomerSession(page, { id: 11, name: "详情重试会员" });

    await page.goto("/customer?section=consultations&leadId=88");
    const focusedDetail = page.getByRole("region", { name: "咨询详情" });
    await expect(focusedDetail.getByRole("alert")).toContainText("咨询详情暂时无法加载");
    await focusedDetail.getByRole("button", { name: "重新加载" }).click();
    await expect(focusedDetail.getByRole("heading", { name: "重试作品" })).toBeVisible();
    await expect(focusedDetail.getByText("重试已恢复详情。")).toBeVisible();

    await page.goto("/customer?section=consultations&leadId=999");
    await expect(focusedDetail.getByRole("alert")).toContainText("未找到这条咨询");
    await expect(page.getByText("不得显示")).toHaveCount(0);
    await focusedDetail.getByRole("button", { name: "返回咨询列表" }).click();
    await expect(page).toHaveURL(/\/customer$/);
  });

  test("选款咨询失败可重试，预约咨询权限失败不伪装空态", async ({ page }) => {
    let selectionAttempts = 0;
    let inquiryForbidden = true;
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/customers/me/selection-inquiries") {
        selectionAttempts += 1;
        if (selectionAttempts === 1) {
          return route.fulfill({ status: 503, json: { message: "unavailable" } });
        }
        return fulfill(route, []);
      }
      if (path === "/api/customers/me/inquiries") {
        if (inquiryForbidden) {
          return route.fulfill({ status: 403, json: { message: "forbidden" } });
        }
        return fulfill(route, { list: [], total: 0, page: 1, pageSize: 5 });
      }
      if (path === "/api/settings/flags") {
        return fulfill(route, { commerceEnabled: false, cartEnabled: false, paymentEnabled: false });
      }
      if (path === "/api/customers/me/notifications") {
        return fulfill(route, { list: [], total: 0, unreadCount: 0, page: 1, pageSize: 20 });
      }
      if (path === "/api/partner-applications/me") return fulfill(route, null);
      return fulfill(route, []);
    });
    await installCustomerSession(page, { id: 8, name: "异常状态会员" });

    await page.goto("/customer");
    const selections = page.locator("#my-selections");
    const appointments = page.locator("#my-appointments");
    await expect(selections.getByRole("alert")).toContainText("选款咨询暂时无法加载");
    await expect(selections.getByText("暂未提交选款咨询。")).toHaveCount(0);
    await expect(appointments.getByRole("alert")).toContainText("你没有查看预约咨询的权限");
    await expect(appointments.getByText("还没有预约记录。")).toHaveCount(0);

    await selections.getByRole("button", { name: "重新加载" }).click();
    await expect(selections.getByText("暂未提交选款咨询。")).toBeVisible();
    inquiryForbidden = false;
    await appointments.getByRole("button", { name: "重新加载" }).click();
    await expect(appointments.getByText("还没有预约记录。")).toBeVisible();
  });

  test("咨询资源返回 401 时清理会话并回到会员登录", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("hc_selection_tray", JSON.stringify({
        state: { ownerKey: "customer:9", selectedIds: [1] },
        version: 1,
      }));
    });
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/customers/me/inquiries" || path === "/api/customers/session/refresh") {
        return route.fulfill({ status: 401, json: { message: "expired" } });
      }
      if (path === "/api/settings/flags") {
        return fulfill(route, { commerceEnabled: false, cartEnabled: false, paymentEnabled: false });
      }
      return fulfill(route, []);
    });
    await installCustomerSession(page, { id: 9, name: "会话失效会员" });

    await page.goto("/customer");
    await expect(page.getByRole("button", { name: "会员登录 / 注册" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "我的账号" })).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => {
      const raw = localStorage.getItem("hc_selection_tray");
      return raw ? JSON.parse(raw).state : null;
    })).toEqual({ ownerKey: "guest", selectedIds: [] });
  });
});
