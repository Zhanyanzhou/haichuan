import type { Page, Route } from "@playwright/test";

export type ServiceWriteObservation = {
  analytics: number;
  inquiry: number;
  unexpected: number;
};

export type ServiceFixtureOptions = {
  settingsState?: "empty" | "error";
  onInquiry?: (route: Route) => Promise<void>;
};

const wrapped = (data: unknown) => ({
  code: 200,
  data,
  message: "success",
});

export async function fulfillServiceApi(
  route: Route,
  data: unknown,
  status = 200,
) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(status >= 400 ? data : wrapped(data)),
  });
}

export async function mockPublicServiceThirdBatch(
  page: Page,
  options: ServiceFixtureOptions = {},
) {
  const writes: ServiceWriteObservation = {
    analytics: 0,
    inquiry: 0,
    unexpected: 0,
  };

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const method = request.method();
    const path = new URL(request.url()).pathname;

    if (path.endsWith("/analytics/track") && method === "POST") {
      writes.analytics += 1;
      return route.fulfill({ status: 204, body: "" });
    }

    if (path.endsWith("/inquiries") && method === "POST") {
      writes.inquiry += 1;
      if (options.onInquiry) return options.onInquiry(route);
      writes.unexpected += 1;
      return route.abort();
    }

    if (method !== "GET") {
      writes.unexpected += 1;
      return route.abort();
    }

    if (path.endsWith("/settings/public")) {
      if (options.settingsState === "error") {
        return fulfillServiceApi(
          route,
          { statusCode: 503, message: "settings unavailable" },
          503,
        );
      }
      return fulfillServiceApi(route, {
        siteName: "海川珠宝",
        contactPhone: "",
        contactEmail: "",
        contactAddress: "",
        businessHours: "",
      });
    }

    if (path.endsWith("/settings/flags")) {
      return fulfillServiceApi(route, {
        commerceEnabled: false,
        cartEnabled: false,
        paymentEnabled: false,
      });
    }

    if (path.endsWith("/page-modules/document/published")) {
      return fulfillServiceApi(route, null);
    }

    return fulfillServiceApi(route, null);
  });

  return writes;
}
