import { expect, test, type Page, type Request } from "@playwright/test";
import {
  mockCatalogDetail,
  publicProduct,
} from "./fixtures/public-catalog-detail";

const ADMIN_TOKEN = "review-client-admin-token";
const CSRF_TOKEN = "review-client-csrf-token";

async function authenticateReviewAdmin(page: Page) {
  await page.addInitScript(
    ({ adminToken, csrfToken }) => {
      localStorage.setItem("token", adminToken);
      localStorage.setItem(
        "jewelry-auth",
        JSON.stringify({
          state: {
            token: adminToken,
            user: {
              id: 1,
              username: "review-auditor",
              role: "SUPER_ADMIN",
              name: "评价审核员",
            },
            isLoggedIn: true,
          },
          version: 0,
        }),
      );
      document.cookie = `hc_admin_csrf=${csrfToken}; Path=/`;
    },
    { adminToken: ADMIN_TOKEN, csrfToken: CSRF_TOKEN },
  );
}

function response(data: unknown) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ code: 200, data, message: "ok" }),
  };
}

test("评价管理沿用员工鉴权、筛选参数和审核写请求合同", async ({ page }) => {
  await authenticateReviewAdmin(page);
  const listRequests: Request[] = [];
  const moderationRequests: Request[] = [];
  const review = {
    id: 71,
    rating: 5,
    content: "评价客户端合同测试内容",
    images: [],
    status: "PENDING",
    reply: null,
    createdAt: "2026-08-26T08:00:00.000Z",
    product: { id: 77, name: "评价合同测试作品", code: "HC-REVIEW-077" },
    customer: { id: 18, name: "评价合同客户", phone: "13800000000" },
    order: { id: 14, orderNo: "ORD-REVIEW-014" },
  };

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/reviews" && request.method() === "GET") {
      listRequests.push(request);
      return route.fulfill(response({ list: [review], total: 1 }));
    }
    if (
      url.pathname === "/api/reviews/71/moderate" &&
      request.method() === "PUT"
    ) {
      moderationRequests.push(request);
      return route.fulfill(response({ ...review, status: "APPROVED" }));
    }
    if (url.pathname === "/api/settings/flags") {
      return route.fulfill(
        response({
          commerceEnabled: false,
          cartEnabled: false,
          paymentEnabled: false,
        }),
      );
    }
    return route.fulfill(response({}));
  });

  await page.goto("/admin/reviews");
  await expect(page.getByRole("heading", { name: "评价管理" })).toBeVisible();
  await expect(page.getByText("评价合同测试作品", { exact: true })).toBeVisible();
  await expect.poll(() => listRequests.length).toBeGreaterThan(0);

  const listUrl = new URL(listRequests[0].url());
  expect(listUrl.searchParams.get("page")).toBe("1");
  expect(listUrl.searchParams.get("pageSize")).toBe("20");
  expect(listUrl.searchParams.get("status")).toBe("PENDING");
  expect(listRequests[0].headers().authorization).toBe(`Bearer ${ADMIN_TOKEN}`);

  await page.getByRole("button", { name: /通\s*过/ }).click();
  await expect(page.getByText("已通过，评价将在作品页展示", { exact: true }))
    .toBeVisible();
  await expect.poll(() => moderationRequests.length).toBe(1);

  const moderationRequest = moderationRequests[0];
  expect(moderationRequest.headers().authorization).toBe(`Bearer ${ADMIN_TOKEN}`);
  expect(moderationRequest.headers()["x-csrf-token"]).toBe(CSRF_TOKEN);
  expect(moderationRequest.postDataJSON()).toEqual({ status: "APPROVED" });
});

test("商品详情公开读取已审核评价且不携带客户令牌", async ({ page }) => {
  const reviewRequests: Request[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/reviews/product/77") {
      reviewRequests.push(request);
    }
  });
  await mockCatalogDetail(page, {
    products: [publicProduct(77, "DISPLAY_ONLY", { available: false })],
    reviewsByProduct: {
      77: {
        list: [
          {
            id: 91,
            rating: 5,
            content: "公开评价只展示审核通过后的内容",
            images: [],
            reply: "感谢您的认可",
            createdAt: "2026-08-26T08:00:00.000Z",
            reviewer: "评***户",
          },
        ],
        total: 1,
        averageRating: 5,
      },
    },
  });

  await page.goto("/products/77");
  await page.getByRole("tab", { name: "评价" }).click();
  await expect(page.getByText("5 分 · 1 条评价", { exact: true })).toBeVisible();
  await expect(
    page.getByText("公开评价只展示审核通过后的内容", { exact: true }),
  ).toBeVisible();
  await expect.poll(() => reviewRequests.length).toBe(1);

  const request = reviewRequests[0];
  expect(new URL(request.url()).searchParams.get("pageSize")).toBe("20");
  expect(request.headers().authorization).toBeUndefined();
});
