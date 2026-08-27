import type { Page, Request } from "@playwright/test";

export type TestAdminRole =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "EDITOR"
  | "CUSTOMER_SERVICE"
  | "WAREHOUSE"
  | "SALES_CONSULTANT"
  | "FINANCE";

export type TestAdminUser = {
  id: number;
  username: string;
  realName: string;
  role: TestAdminRole;
  status: "ACTIVE";
  createdAt: string;
};

export type TestCustomer = {
  id: number;
  phone: string;
  name: string | null;
  email: string | null;
};

const wrapped = (data: unknown) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({ code: 200, data, message: "ok" }),
});

/**
 * 在业务 API catch-all 路由之后安装，使更具体的 profile 路由优先命中。
 * 该夹具模拟自有服务的 Cookie 会话恢复接口，不在浏览器存储中制造凭据。
 */
export async function installAdminSession(
  page: Page,
  overrides: Partial<TestAdminUser> = {},
) {
  const user: TestAdminUser = {
    id: 1,
    username: "playwright-admin",
    realName: "测试管理员",
    role: "SUPER_ADMIN",
    status: "ACTIVE",
    createdAt: "2026-08-22T00:00:00.000Z",
    ...overrides,
  };

  await page.route("**/api/auth/profile", (route) => route.fulfill(wrapped(user)));
  return user;
}

/** 与管理员夹具相同，但保留客户身份域头的独立合同。 */
export async function installCustomerSession(
  page: Page,
  overrides: Partial<TestCustomer> = {},
) {
  const customer: TestCustomer = {
    id: 7,
    phone: "13800000007",
    name: "测试会员",
    email: null,
    ...overrides,
  };

  await page.route("**/api/customers/me", (route) =>
    route.fulfill(wrapped(customer)),
  );
  return customer;
}

export function readSessionHeaders(request: Request) {
  const headers = request.headers();
  return {
    authorization: headers.authorization,
    csrf: headers["x-csrf-token"],
    sessionDomain: headers["x-session-domain"],
  };
}
