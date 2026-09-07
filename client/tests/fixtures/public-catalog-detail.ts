import type { Page, Route } from "@playwright/test";
import { installCustomerSession } from "./session-auth";

export type FixtureSalesMode =
  | "DISPLAY_ONLY"
  | "SELECTION"
  | "APPOINTMENT"
  | "DIRECT_PURCHASE"
  | "CUSTOM_INQUIRY";

export type CatalogDetailProduct = ReturnType<typeof publicProduct>;

export type WriteObservation = {
  analytics: number;
  cart: number;
  favorite: number;
  inquiry: number;
  unexpected: number;
};

export type RouteBarrier = {
  reached: Promise<void>;
  release: () => void;
  waitUntilReleased: () => Promise<void>;
};

const images = [
  "/images/system/product-placeholder.svg?fixture=one",
  "/images/system/product-placeholder.svg?fixture=two",
  "/images/system/product-placeholder.svg?fixture=three",
  "/images/system/product-placeholder.svg?fixture=four",
  "/images/editorial/poster-floral-lock-v1.png",
];

export function createRouteBarrier(): RouteBarrier {
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
    release: releaseRequest,
    waitUntilReleased: async () => {
      markReached();
      await released;
    },
  };
}

export function publicProduct(
  id: number,
  salesMode: FixtureSalesMode,
  options: {
    available?: boolean;
    goldWeight?: number;
    weight?: number;
    size?: string;
    image?: string | null;
    certificates?: Array<{ id: number; productId: number; certType: "NATIONAL"; certNumber: string }>;
  } = {},
) {
  const direct = salesMode === "DIRECT_PURCHASE";
  const image = options.image === undefined ? images[(id - 1) % images.length] : options.image;
  return {
    id,
    code: `HC-TEST-${String(id).padStart(3, "0")}`,
    name: `构图验证作品 ${id}`,
    description: "用于确定性浏览器验收的中性作品说明。",
    shortDescription: "中性作品说明",
    categoryId: 1,
    category: { id: 1, name: id % 2 ? "戒指" : "吊坠" },
    materialType: "AU750" as const,
    goldWeight: options.goldWeight ?? 5.2,
    weight: options.weight ?? 6.1,
    size: options.size ?? "可调节",
    price: direct ? 12800 : null,
    salesMode,
    inventoryPolicy: "STANDARD" as const,
    isAvailableForPurchase: direct ? options.available : false,
    status: "PUBLISHED" as const,
    isHot: false,
    isNew: false,
    isRecommended: false,
    isLimited: false,
    isCustom: false,
    viewCount: 0,
    salesCount: 0,
    createdAt: new Date(0).toISOString(),
    images: image
      ? [{
          id: 1000 + id,
          productId: id,
          url: image,
          type: "FRONT" as const,
          sortOrder: 0,
          isVideo: false,
        }]
      : [],
    skus: direct
      ? [{
          id: id * 10,
          productId: id,
          skuCode: `HC-${id}-A`,
          material: "AU750" as const,
          goldWeight: options.goldWeight ?? 5.2,
          price: 12800,
          isActive: true,
        }]
      : [],
    craftTechnique: ["抛光"],
    detailContent: [],
    certificates: options.certificates ?? [],
  };
}

const wrapped = (data: unknown) => ({
  code: 200,
  data,
  message: "success",
  timestamp: new Date(0).toISOString(),
});

export function publishedCatalogDocument() {
  return {
    id: 7901,
    pageKey: "catalog",
    puckData: {
      content: [
        {
          type: "业务功能区",
          props: {
            id: "catalog-business-region",
            pageKey: "catalog",
            title: "选款工具与商品结果",
            items: "关键词/货号搜索|条件筛选|排序与结果|快速查看|选款清单|提交询价",
            locked: true,
          },
        },
      ],
      root: { props: {} },
    },
    metadata: {},
    status: "PUBLISHED",
    version: 1,
    publishedAt: "2026-08-24T00:00:00.000Z",
    updatedAt: "2026-08-24T00:00:00.000Z",
  };
}

async function fulfill(route: Route, data: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(status === 200 ? wrapped(data) : data),
  });
}

export async function mockCatalogDetail(
  page: Page,
  options: {
    products: CatalogDetailProduct[];
    signedIn?: boolean;
    flags?: { commerceEnabled: boolean; cartEnabled: boolean; paymentEnabled: boolean };
    flagsStatus?: number;
    flagsBarrier?: RouteBarrier;
    categoriesStatus?: number;
    productsStatus?: number;
    productsBarrier?: RouteBarrier;
    detailBarriers?: Record<string, RouteBarrier>;
    reviewsByProduct?: Record<number, { list: unknown[]; total: number; averageRating: number | null }>;
    allowCartWrite?: boolean;
    allowFavoriteWrite?: boolean;
    allowInquiryWrite?: boolean;
    onInquiry?: (route: Route) => Promise<void> | void;
  },
) {
  const findProduct = (reference: string) => options.products.find(
    (product) => product.code === reference || String(product.id) === reference,
  );
  const writes: WriteObservation = {
    analytics: 0,
    cart: 0,
    favorite: 0,
    inquiry: 0,
    unexpected: 0,
  };
  await page.addInitScript(({ signedIn }) => {
    localStorage.removeItem("hc_selection_tray");
    if (!signedIn) localStorage.removeItem("customer");
  }, { signedIn: options.signedIn === true });

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (method !== "GET") {
      if (path.endsWith("/analytics/track") && method === "POST") {
        writes.analytics += 1;
        return route.abort();
      }
      if (path.endsWith("/cart") && method === "POST") {
        writes.cart += 1;
        if (options.allowCartWrite) return fulfill(route, { id: 1 });
        writes.unexpected += 1;
        return route.abort();
      }
      if (/\/customers\/me\/favorites\/\d+\/toggle$/.test(path) && method === "POST") {
        writes.favorite += 1;
        if (options.allowFavoriteWrite) return fulfill(route, { favorited: true });
        writes.unexpected += 1;
        return route.abort();
      }
      if (path.endsWith("/inquiries") && method === "POST") {
        writes.inquiry += 1;
        if (options.onInquiry) return options.onInquiry(route);
        if (options.allowInquiryWrite) return fulfill(route, { id: writes.inquiry });
        writes.unexpected += 1;
        return route.abort();
      }
      writes.unexpected += 1;
      return route.abort();
    }
    if (path.endsWith("/stream")) return route.abort();
    if (path.endsWith("/settings/flags")) {
      if (options.flagsBarrier) await options.flagsBarrier.waitUntilReleased();
      if (options.flagsStatus && options.flagsStatus !== 200) {
        return fulfill(route, { statusCode: options.flagsStatus, message: "flags unavailable" }, options.flagsStatus);
      }
      return fulfill(route, options.flags ?? {
        commerceEnabled: true,
        cartEnabled: true,
        paymentEnabled: false,
      });
    }
    if (path.endsWith("/settings/public")) return fulfill(route, { siteName: "海川珠宝" });
    if (path.endsWith("/page-modules/document/published")) {
      return fulfill(
        route,
        url.searchParams.get("pageKey") === "catalog" ? publishedCatalogDocument() : null,
      );
    }
    if (path.endsWith("/categories/tree")) {
      if (options.categoriesStatus && options.categoriesStatus !== 200) {
        return fulfill(
          route,
          { statusCode: options.categoriesStatus, message: "categories unavailable" },
          options.categoriesStatus,
        );
      }
      return fulfill(route, [{ id: 1, name: "戒指", slug: "rings", level: 1, parentId: null, children: [] }]);
    }
    if (path.endsWith("/attributes")) return fulfill(route, []);
    if (path.endsWith("/customers/me/favorites")) return fulfill(route, []);
    if (path.endsWith("/gold-price/latest")) return fulfill(route, { price: 500 });
    if (path.includes("/recommendations/")) return fulfill(route, []);
    const reviewMatch = path.match(/\/reviews\/product\/(\d+)$/);
    if (reviewMatch) {
      return fulfill(route, options.reviewsByProduct?.[Number(reviewMatch[1])] ?? {
        list: [],
        total: 0,
        averageRating: null,
      });
    }
    if (path.endsWith("/products/catalog") || path.endsWith("/products/public")) {
      if (options.productsBarrier) await options.productsBarrier.waitUntilReleased();
      if (options.productsStatus && options.productsStatus !== 200) {
        return fulfill(route, { statusCode: options.productsStatus, message: "catalog unavailable" }, options.productsStatus);
      }
      const hasNoResultQuery = Array.from(url.searchParams.values()).includes("无结果");
      const list = hasNoResultQuery ? [] : options.products;
      return fulfill(route, {
        list,
        total: list.length,
        page: 1,
        pageSize: 32,
        facets: { sizes: [] },
      });
    }
    const detailMatch = path.match(/\/products\/(?:catalog|public)\/([^/]+)$/);
    if (detailMatch) {
      const reference = decodeURIComponent(detailMatch[1]);
      if (options.productsBarrier) await options.productsBarrier.waitUntilReleased();
      if (options.detailBarriers?.[reference]) {
        await options.detailBarriers[reference].waitUntilReleased();
      }
      if (options.productsStatus && options.productsStatus !== 200) {
        return fulfill(route, { statusCode: options.productsStatus, message: "detail unavailable" }, options.productsStatus);
      }
      return fulfill(route, findProduct(reference) ?? null);
    }
    return fulfill(route, null);
  });
  if (options.signedIn) {
    await installCustomerSession(page, { id: 1, name: "测试客户" });
  }

  return writes;
}
