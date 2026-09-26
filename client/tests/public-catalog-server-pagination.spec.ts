import { expect, test, type Page } from "@playwright/test";
import { publishedCatalogDocument } from "./fixtures/public-catalog-detail";
import {
  PRIVACY_CONSENT_CONTENT_HASH,
  PRIVACY_CONSENT_VERSION,
} from "../src/config/privacyConsent";

const products = Array.from({ length: 40 }, (_, index) => {
  const id = index + 1;
  return {
    id,
    code: `HC-TEST-${String(id).padStart(3, "0")}`,
    name: `作品 ${String(id).padStart(2, "0")}`,
    categoryId: 2,
    category: { id: 2, name: "戒指" },
    shortDescription: "",
    materialType: id % 2 === 0 ? "AU750" : "GOLD_999",
    goldWeight: id % 10,
    weight: id % 10,
    size: id % 2 === 0 ? "标准" : "大号",
    craftTechnique: id % 2 === 0 ? ["古法金", "抛光"] : "錾刻",
    salesMode: "SELECTION",
    price: null,
    images: [],
    attributes: [],
  };
});

const categories = [
  {
    id: 1,
    name: "戒指",
    slug: "rings",
    level: 1,
    parentId: null,
    children: [
      {
        id: 2,
        name: "日常戒指",
        slug: "daily-rings",
        level: 2,
        parentId: 1,
        children: [],
      },
    ],
  },
];

function wrapped(data: unknown) {
  return { code: 200, data, message: "success", timestamp: new Date(0).toISOString() };
}

async function mockCatalogApi(page: Page) {
  await page.addInitScript(() => {
    localStorage.removeItem("customerToken");
    localStorage.removeItem("customer");
    localStorage.removeItem("hc_selection_tray");
  });
  await page.route("**/api/products/catalog/stream**", (route) => route.abort());
  await page.route("**/api/page-modules/document/stream**", (route) => route.abort());
  await page.route("**/api/page-modules/document/published?*", (route) => {
    const url = new URL(route.request().url());
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        wrapped(url.searchParams.get("pageKey") === "catalog" ? publishedCatalogDocument() : null),
      ),
    });
  });
  await page.route("**/api/categories/tree**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(wrapped(categories)) }),
  );
  await page.route("**/api/attributes", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        wrapped([
          { key: "material", name: "材质", values: [{ id: 1, value: "足金999", sortOrder: 1 }] },
          { key: "craft", name: "工艺", values: [{ id: 2, value: "古法金", sortOrder: 1 }] },
        ]),
      ),
    }),
  );
  await page.route("**/api/products/public**", (route) => {
    const url = new URL(route.request().url());
    const keyword = url.searchParams.get("keyword")?.trim() || "";
    if (keyword === "触发错误") {
      return route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
    }
    let filtered = [...products];
    const ids = url.searchParams.get("ids")?.split(",").map(Number).filter(Boolean);
    if (ids?.includes(9_998)) {
      return route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
    }
    if (ids?.length) filtered = filtered.filter((product) => ids.includes(product.id));
    if (keyword === "无结果") filtered = [];
    else if (keyword) {
      filtered = filtered.filter(
        (product) => product.name.includes(keyword) || product.code.includes(keyword),
      );
    }
    const materialTypes = url.searchParams.get("materialTypes")?.split(",").filter(Boolean);
    const materialType = url.searchParams.get("materialType");
    if (materialTypes?.length) {
      filtered = filtered.filter((product) => materialTypes.includes(product.materialType));
    } else if (materialType) {
      filtered = filtered.filter((product) => product.materialType === materialType);
    }
    const pageNumber = Number(url.searchParams.get("page") || 1);
    const pageSize = Number(url.searchParams.get("pageSize") || 20);
    const start = (pageNumber - 1) * pageSize;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        wrapped({
          list: filtered.slice(start, start + pageSize),
          total: filtered.length,
          page: pageNumber,
          pageSize,
          facets: { sizes: ["标准", "大号"] },
        }),
      ),
    });
  });
}

async function seedSelection(
  page: Page,
  ids: number[],
  ownerKey: "guest" | `customer:${number}` = "guest",
) {
  await page.addInitScript(({ selectedIds, owner }) => {
    localStorage.setItem(
      "hc_selection_tray",
      JSON.stringify({ state: { ownerKey: owner, selectedIds }, version: 1 }),
    );
  }, { selectedIds: ids, owner: ownerKey });
}

async function seedLegacySelection(page: Page, ids: number[]) {
  await page.addInitScript((selectedIds) => {
    localStorage.setItem(
      "hc_selection_tray",
      JSON.stringify({ state: { selectedIds }, version: 0 }),
    );
  }, ids);
}

test.beforeEach(async ({ page }) => {
  await mockCatalogApi(page);
});

test("Catalog 身份未确定时隐藏选款，同一客户确认后恢复并跨刷新保留", async ({ page }) => {
  let releaseProfile: (() => void) | undefined;
  const profileBlocked = new Promise<void>((resolve) => {
    releaseProfile = resolve;
  });
  let profileReads = 0;
  await seedSelection(page, [1], "customer:7");
  await page.route("**/api/customers/me", async (route) => {
    profileReads += 1;
    if (profileReads === 1) await profileBlocked;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(wrapped({
        id: 7,
        phone: "13800000007",
        name: "作用域会员 A",
        email: null,
      })),
    });
  });
  await page.route("**/api/products/catalog**", (route) => {
    const url = new URL(route.request().url());
    const ids = url.searchParams.get("ids")?.split(",").map(Number).filter(Boolean);
    const filtered = ids ? products.filter((product) => ids.includes(product.id)) : products;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(wrapped({
        list: filtered.slice(0, 32),
        total: filtered.length,
        page: 1,
        pageSize: 32,
        facets: { sizes: ["标准", "大号"] },
      })),
    });
  });

  await page.goto("/catalog");
  await expect(page.getByText("已选 1 款")).toHaveCount(0);
  expect(await page.evaluate(() => {
    const raw = localStorage.getItem("hc_selection_tray");
    return raw ? JSON.parse(raw).state.ownerKey : null;
  })).toBe("customer:7");

  releaseProfile?.();
  await expect(page.getByText("已选 1 款")).toBeVisible();
  await page.reload();
  await expect(page.getByText("已选 1 款")).toBeVisible();
});

test("Catalog 丢弃没有 owner 的 v0 选款而不认领给当前访客", async ({ page }) => {
  await seedLegacySelection(page, [1]);
  await page.route("**/api/customers/me", (route) =>
    route.fulfill({ status: 401, json: { message: "anonymous" } }),
  );
  await page.route("**/api/customers/session/refresh", (route) =>
    route.fulfill({ status: 401, json: { message: "anonymous" } }),
  );

  await page.goto("/catalog");
  await expect(page.getByText("已选 1 款")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => {
    const raw = localStorage.getItem("hc_selection_tray");
    return raw ? JSON.parse(raw) : null;
  })).toEqual({
    state: { ownerKey: "guest", selectedIds: [] },
    version: 1,
  });
});

test("Catalog 在公开商品响应畸形时过滤无效记录而不污染目录", async ({ page }) => {
  await page.route("**/api/products/public**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        wrapped({
          list: [
            products[0],
            { id: 0, categoryId: 2, name: "非法商品 ID" },
            { id: 2, categoryId: "not-a-category", name: "非法分类 ID" },
            null,
          ],
          total: 1,
          facets: { sizes: ["标准", 42, null] },
        }),
      ),
    }),
  );

  await page.goto("/catalog");
  await expect(page.getByRole("heading", { name: "作品 01" })).toBeVisible();
  await expect(page.getByText("非法商品 ID")).toHaveCount(0);
  await expect(page.getByText("非法分类 ID")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /暂时无法加载/ })).toHaveCount(0);
});

test("Catalog 使用服务端分页并保持 URL、快速预览与跨页选款盘", async ({ page }) => {
  const firstRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname.endsWith("/api/products/public") && url.searchParams.get("pageSize") === "32";
  });
  await page.goto("/catalog");
  expect(new URL((await firstRequest).url()).searchParams.get("page")).toBe("1");
  await expect(page.getByRole("heading", { name: "作品 01" })).toBeVisible();
  const pagination = page.getByRole("navigation", { name: "作品分页" });
  await expect(pagination.getByRole("button", { name: "1", exact: true }))
    .toHaveAttribute("aria-current", "page");
  await expect(pagination.getByRole("button", { name: "上一页" })).toBeDisabled();
  await expect(pagination.getByRole("button", { name: "下一页" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "2", exact: true })).toBeVisible();

  const quickViewTrigger = page.getByRole("button", { name: "快速预览 作品 01" });
  await quickViewTrigger.press("Enter");
  const quickView = page.getByRole("dialog");
  await expect(quickView).toBeVisible();
  await expect(quickView).toHaveAccessibleName("作品 01");
  await expect(quickView.getByRole("button", { name: "关闭快速预览" })).toBeFocused();
  await expect(quickView.getByRole("heading", { name: "作品 01" })).toBeVisible();
  await expect(quickView.getByText("HC-TEST-001", { exact: true })).toBeVisible();
  await quickView.getByRole("button", { name: "+ 加入选款" }).click();
  await page.keyboard.press("Escape");
  await expect(quickViewTrigger).toBeFocused();
  await expect(page.getByText("已选 1 款")).toBeVisible();

  const secondRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname.endsWith("/api/products/public") && url.searchParams.get("page") === "2";
  });
  await page.getByRole("button", { name: "2", exact: true }).click();
  await secondRequest;
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByRole("heading", { name: "作品 33" })).toBeVisible();
  await expect(page.getByRole("region", { name: "作品结果" })).toBeFocused();
  await expect(pagination.getByRole("button", { name: "2", exact: true }))
    .toHaveAttribute("aria-current", "page");
  await expect(page.getByText("已选 1 款")).toBeVisible();
  await page.getByRole("button", { name: "查看已选 1 款并提交选款咨询" }).press("Enter");
  await expect(page.getByRole("dialog", { name: "提交选款咨询" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "提交选款咨询" })).toHaveCount(0);
});

test("Catalog 加载状态可被辅助技术识别，越界页替换当前历史项", async ({ page }) => {
  let releaseProducts: (() => void) | undefined;
  const productsBlocked = new Promise<void>((resolve) => {
    releaseProducts = resolve;
  });
  let barrierReached: (() => void) | undefined;
  const reached = new Promise<void>((resolve) => {
    barrierReached = resolve;
  });
  await page.route("**/api/products/public**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/api/products/public")) {
      barrierReached?.();
      await productsBlocked;
    }
    await route.fallback();
  });

  await page.goto("/catalog");
  await reached;
  const loading = page.getByRole("status", { name: "正在加载珠宝作品…" });
  await expect(loading).toHaveAttribute("aria-busy", "true");
  await expect(page.getByRole("region", { name: "作品结果" }))
    .toHaveAttribute("aria-busy", "true");
  releaseProducts?.();
  await expect(page.getByRole("heading", { name: "作品 01" })).toBeVisible();

  await page.goto("/catalog?page=99");
  await expect(page).toHaveURL(/\/catalog\?page=2$/);
  await expect(page.getByRole("heading", { name: "作品 33" })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/catalog$/);
});

test("Catalog 将现有 URL 筛选翻译为服务端参数而不复用商品 ids", async ({ page }) => {
  const requestPromise = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname.endsWith("/api/products/public") && url.searchParams.has("craftTechniques");
  });
  await page.goto(
    "/catalog?category=1&material=%E8%B6%B3%E9%87%91999&craft=%E5%8F%A4%E6%B3%95%E9%87%91&weight=0%E2%80%945%E5%85%8B&size=%E6%A0%87%E5%87%86",
  );
  const url = new URL((await requestPromise).url());
  expect(url.searchParams.get("categoryIds")).toBe("1,2");
  expect(url.searchParams.get("ids")).toBeNull();
  expect(url.searchParams.get("materialTypes")).toBe("GOLD_999");
  expect(url.searchParams.get("craftTechniques")).toBe("古法金");
  expect(url.searchParams.get("weightRanges")).toBe("0:5");
  expect(url.searchParams.get("sizes")).toBe("标准");

  await page.getByRole("button", { name: /^材质/ }).click();
  const materialRequest = page.waitForRequest((request) => {
    const requestUrl = new URL(request.url());
    return (
      requestUrl.pathname.endsWith("/api/products/public") &&
      !requestUrl.searchParams.has("materialTypes") &&
      requestUrl.searchParams.get("craftTechniques") === "古法金"
    );
  });
  await page.getByRole("checkbox", { name: "足金999" }).click();
  await materialRequest;
  await expect(page).not.toHaveURL(/material=/);
});

test("Catalog 接受行动目标保存的分类 slug 并展开全部后代", async ({ page }) => {
  const requestPromise = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname.endsWith("/api/products/public") && url.searchParams.has("categoryIds");
  });
  await page.goto("/catalog?category=rings");
  const url = new URL((await requestPromise).url());
  expect(url.searchParams.get("categoryIds")).toBe("1,2");
  expect(url.searchParams.get("ids")).toBeNull();
});

test("Catalog 搜索的空态、错误态与 390px 溢出状态完整", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/catalog");
  const input = page.getByRole("search").getByRole("combobox", { name: "关键词或货号" });
  await input.fill("无结果");
  await input.press("Enter");
  await expect(page.getByText("没有符合当前筛选的作品")).toBeVisible();

  await input.fill("触发错误");
  await input.press("Enter");
  await expect(page.getByText("作品目录暂时无法加载")).toBeVisible();
  const selectionCta = page.getByRole("link", { name: "提交选款需求" });
  await expect(selectionCta).toHaveAttribute("href", "/contact?type=product");
  const [retryBox, ctaBox] = await Promise.all([
    page.getByRole("button", { name: "重新加载" }).boundingBox(),
    selectionCta.boundingBox(),
  ]);
  expect(retryBox).not.toBeNull();
  expect(ctaBox).not.toBeNull();
  expect(retryBox!.height).toBeGreaterThanOrEqual(44);
  expect(ctaBox!.height).toBeGreaterThanOrEqual(44);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    )
    .toBe(true);

  await selectionCta.click();
  await expect(page).toHaveURL(/\/contact\?type=product$/);
  await expect(page.locator("#cf-type")).toHaveValue("选款建议");
});

test("Catalog 筛选无结果时保留仍有效的持久化选款", async ({ page }) => {
  await seedSelection(page, [1]);
  await page.goto("/catalog?query=%E6%97%A0%E7%BB%93%E6%9E%9C");

  await expect(page.getByText("没有符合当前筛选的作品")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "查看已选 1 款并提交选款咨询" }),
  ).toBeVisible();

  const persistedIds = await page.evaluate(() => {
    const raw = localStorage.getItem("hc_selection_tray");
    return raw ? JSON.parse(raw).state.selectedIds : [];
  });
  expect(persistedIds).toEqual([1]);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
});

test("选款咨询提交前可核对全部作品名称与编号并逐项移除", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedSelection(page, [1, 2]);
  await page.goto("/catalog");

  await page.getByRole("button", { name: "查看已选 2 款并提交选款咨询" }).click();
  const dialog = page.getByRole("dialog", { name: "提交选款咨询" });
  const selectionList = dialog.getByRole("list", { name: "本次选款作品" });
  await expect(selectionList.getByText("作品 01", { exact: true })).toBeVisible();
  await expect(selectionList.getByText("作品编号 HC-TEST-001", { exact: true })).toBeVisible();
  await expect(selectionList.getByText("作品 02", { exact: true })).toBeVisible();
  await expect(selectionList.getByText("作品编号 HC-TEST-002", { exact: true })).toBeVisible();

  const removeFirst = selectionList.getByRole("button", { name: "移除 作品 01" });
  const removeBox = await removeFirst.boundingBox();
  expect(removeBox).not.toBeNull();
  expect(removeBox!.width).toBeGreaterThanOrEqual(44);
  expect(removeBox!.height).toBeGreaterThanOrEqual(44);
  await removeFirst.click();

  await expect(dialog.getByText("已选 1 款作品", { exact: false })).toBeVisible();
  await expect(selectionList.getByText("作品 01", { exact: true })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => {
    const raw = localStorage.getItem("hc_selection_tray");
    return raw ? JSON.parse(raw).state.selectedIds : [];
  })).toEqual([2]);
});

test("Catalog 权威查询确认作品失效后清理旧选款且空目录不显示虚假数量", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedSelection(page, [9_999]);
  await page.route("**/api/products/public**", (route) => {
    const url = new URL(route.request().url());
    const pageNumber = Number(url.searchParams.get("page") || 1);
    const pageSize = Number(url.searchParams.get("pageSize") || 20);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        wrapped({
          list: [],
          total: 0,
          page: pageNumber,
          pageSize,
          facets: { sizes: [] },
        }),
      ),
    });
  });
  await page.goto("/catalog");

  await expect(page.getByText("珠宝作品正在筹备中")).toBeVisible();
  await expect(page.getByText("已移除 1 款当前不可用的作品")).toBeVisible();
  await expect(page.getByText("已选 1 款")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem("hc_selection_tray");
        return raw ? JSON.parse(raw).state.selectedIds : [];
      }),
    )
    .toEqual([]);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
});

test("Catalog 校验持久化选款时区分 loading 与 error 且不误删", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let releaseSelectionLookup: (() => void) | undefined;
  const selectionLookupBlocked = new Promise<void>((resolve) => {
    releaseSelectionLookup = resolve;
  });
  await page.route("**/api/products/public**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("ids") === "1") {
      await selectionLookupBlocked;
    }
    await route.fallback();
  });
  await seedSelection(page, [1]);
  await page.goto("/catalog?query=%E6%97%A0%E7%BB%93%E6%9E%9C");

  await expect(page.getByText("正在确认已选作品")).toBeVisible();
  await expect(page.getByText("已选 1 款")).toHaveCount(0);
  releaseSelectionLookup?.();
  await expect(
    page.getByRole("button", { name: "查看已选 1 款并提交选款咨询" }),
  ).toBeVisible();

  await seedSelection(page, [9_998]);
  await page.reload();
  await expect(page.getByText("选款状态暂时无法确认")).toBeVisible();
  await expect(page.getByRole("button", { name: "重新确认选款" })).toBeVisible();
  await expect(page.getByText("已选 1 款")).toHaveCount(0);
  const persistedIds = await page.evaluate(() => {
    const raw = localStorage.getItem("hc_selection_tray");
    return raw ? JSON.parse(raw).state.selectedIds : [];
  });
  expect(persistedIds).toEqual([9_998]);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
});

test("选款咨询失败保留填写内容，重试复用幂等键且阻止同刻重复请求", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const writes: Array<{ idempotencyKey?: string; body: Record<string, unknown> }> = [];
  let releaseRetry: (() => void) | undefined;
  const retryBlocked = new Promise<void>((resolve) => {
    releaseRetry = resolve;
  });
  await page.route("**/api/selection-inquiries", async (route) => {
    const request = route.request();
    writes.push({
      idempotencyKey: request.headers()["idempotency-key"],
      body: request.postDataJSON(),
    });
    if (writes.length === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ code: 503, message: "temporary unavailable" }),
      });
      return;
    }
    await retryBlocked;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(wrapped({
        id: 71,
        sourceId: 71,
        leadId: 91,
        status: "PENDING",
        createdAt: "2026-09-22T00:00:00.000Z",
      })),
    });
  });
  await seedSelection(page, [1]);
  await page.goto("/catalog");
  await page.getByRole("button", { name: "查看已选 1 款并提交选款咨询" }).click();
  const dialog = page.getByRole("dialog", { name: "提交选款咨询" });
  await dialog.getByPlaceholder("您的称呼").fill("测试访客");
  await dialog.getByPlaceholder("方便我们联系您").fill("13800138000");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "提交选款咨询（1 款）" }).click();

  await expect(dialog.getByRole("alert")).toContainText("提交结果待确认");
  await expect(dialog.getByText(
    "存在一笔结果待确认的选款咨询。保持原内容重试可安全查回原回执；新建前请先明确放弃恢复。",
    { exact: true },
  )).toBeVisible();
  await expect(dialog.getByPlaceholder("您的称呼")).toHaveValue("测试访客");
  await expect(dialog.getByPlaceholder("方便我们联系您")).toHaveValue("13800138000");
  const storedAttempt = await page.evaluate(() => ({ ...sessionStorage }));
  expect(JSON.stringify(storedAttempt)).not.toContain("测试访客");
  expect(JSON.stringify(storedAttempt)).not.toContain("13800138000");

  await page.reload();
  await page.getByRole("button", { name: "查看已选 1 款并提交选款咨询" }).click();
  await expect(dialog.getByText(
    "存在一笔结果待确认的选款咨询。保持原内容重试可安全查回原回执；新建前请先明确放弃恢复。",
    { exact: true },
  )).toBeVisible();
  await dialog.getByPlaceholder("您的称呼").fill("测试访客");
  await dialog.getByPlaceholder("方便我们联系您").fill("13800138000");
  await dialog.getByRole("checkbox").check();
  const retry = dialog.getByRole("button", { name: "提交选款咨询（1 款）" });
  await retry.evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[0].idempotencyKey).toBeTruthy();
  expect(writes[1].idempotencyKey).toBe(writes[0].idempotencyKey);
  expect(writes[1].body).toMatchObject({
    customerName: "测试访客",
    phone: "13800138000",
    privacyConsent: true,
    privacyConsentVersion: PRIVACY_CONSENT_VERSION,
    privacyConsentContentHash: PRIVACY_CONSENT_CONTENT_HASH,
  });
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  )).toBe(true);

  releaseRetry?.();
  const receiptDialog = page.getByRole("dialog", { name: "选款咨询已提交" });
  await expect(receiptDialog).toBeVisible();
  await receiptDialog.getByRole("button", { name: "完成并清空选款" }).click();
  await expect(receiptDialog).toHaveCount(0);
  await expect(page.getByText("已选 1 款")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => {
    const raw = localStorage.getItem("hc_selection_tray");
    return raw ? JSON.parse(raw).state.selectedIds : [];
  })).toEqual([]);
});

test("客户 A 的迟到选款咨询不会污染或提前解锁客户 B 的提交", async ({ page }) => {
  let releaseCustomerA!: () => void;
  let releaseCustomerB!: () => void;
  const customerAGate = new Promise<void>((resolve) => {
    releaseCustomerA = resolve;
  });
  const customerBGate = new Promise<void>((resolve) => {
    releaseCustomerB = resolve;
  });
  const writes: Array<Record<string, unknown>> = [];

  await page.route("**/api/customers/me", (route) =>
    route.fulfill({ status: 401, json: { message: "anonymous" } }),
  );
  await page.route("**/api/customers/session/refresh", (route) =>
    route.fulfill({ status: 401, json: { message: "anonymous" } }),
  );
  await page.route("**/api/settings/public**", (route) =>
    route.fulfill({ status: 200, json: wrapped({}) }),
  );
  await page.route("**/api/settings/flags", (route) =>
    route.fulfill({ status: 200, json: wrapped({ commerceEnabled: false }) }),
  );
  await page.route("**/api/products/catalog**", (route) => {
    const url = new URL(route.request().url());
    const ids = url.searchParams.get("ids")?.split(",").map(Number).filter(Boolean);
    const filtered = ids?.length
      ? products.filter((product) => ids.includes(product.id))
      : products;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(wrapped({
        list: filtered.slice(0, 32),
        total: filtered.length,
        page: 1,
        pageSize: 32,
        facets: { sizes: ["标准", "大号"] },
      })),
    });
  });

  await page.route("**/api/selection-inquiries", async (route) => {
    const requestIndex = writes.push(route.request().postDataJSON());
    if (requestIndex === 1) await customerAGate;
    if (requestIndex === 2) await customerBGate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(wrapped({
        id: 70 + requestIndex,
        sourceId: 70 + requestIndex,
        leadId: 90 + requestIndex,
        status: "PENDING",
        createdAt: "2026-09-22T00:00:00.000Z",
      })),
    });
  });

  await page.goto("/catalog");
  await page.evaluate(async () => {
    const { useCustomerAuthStore } = await import("/src/store/customerAuthStore.ts");
    const { useSelectionStore } = await import("/src/store/selectionStore.ts");
    useCustomerAuthStore.getState().setAuth({
      id: 101,
      name: "客户 A",
      phone: "13800000101",
      email: "a@example.test",
    });
    useSelectionStore.getState().toggle(1);
  });

  await page.getByRole("button", { name: "查看已选 1 款并提交选款咨询" }).click();
  let dialog = page.getByRole("dialog", { name: "提交选款咨询" });
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "提交选款咨询（1 款）" }).click();
  await expect.poll(() => writes.length).toBe(1);

  await page.evaluate(async () => {
    const { useCustomerAuthStore } = await import("/src/store/customerAuthStore.ts");
    const { useSelectionStore } = await import("/src/store/selectionStore.ts");
    useCustomerAuthStore.getState().setAuth({
      id: 202,
      name: "客户 B",
      phone: "13800000202",
      email: "b@example.test",
    });
    useSelectionStore.getState().toggle(2);
  });

  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "查看已选 1 款并提交选款咨询" }).click();
  dialog = page.getByRole("dialog", { name: "提交选款咨询" });
  await expect(dialog.getByText("客户 B")).toBeVisible();
  await dialog.getByRole("checkbox").check();
  const customerBSubmit = dialog.getByRole("button", { name: "提交选款咨询（1 款）" });
  await customerBSubmit.click();
  await expect.poll(() => writes.length).toBe(2);
  const customerBSubmitting = dialog.getByRole("button", { name: "提交中…" });
  await expect(customerBSubmitting).toBeDisabled();

  releaseCustomerA();
  await page.waitForTimeout(150);
  await expect(customerBSubmitting).toBeDisabled();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "选款咨询已提交" })).toHaveCount(0);
  await customerBSubmitting.evaluate((button: HTMLButtonElement) => button.click());
  expect(writes).toHaveLength(2);

  releaseCustomerB();
  const receiptDialog = page.getByRole("dialog", { name: "选款咨询已提交" });
  await expect(receiptDialog).toContainText("#72");
  await expect(receiptDialog).not.toContainText("#71");
});

test("登录客户从选款回执按 canonical Lead 进入本人咨询详情", async ({ page }) => {
  const customer = {
    id: 7,
    phone: "13800000007",
    name: "选款回执会员",
    email: null,
  };
  const consultationPaths: string[] = [];

  await page.addInitScript(() => {
    document.cookie = "hc_csrf=selection-receipt-csrf; path=/";
  });
  await page.route("**/api/customers/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(wrapped(customer)),
  }));
  await page.route("**/api/selection-inquiries", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(wrapped({
      id: 71,
      sourceId: 71,
      leadId: 91,
      status: "PENDING",
      createdAt: "2026-09-22T08:00:00.000Z",
    })),
  }));
  await page.route("**/api/customers/me/consultations/*", async (route) => {
    const path = new URL(route.request().url()).pathname;
    consultationPaths.push(path);
    if (path !== "/api/customers/me/consultations/91") {
      return route.fulfill({ status: 404, json: { message: "咨询记录不存在" } });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(wrapped({
        leadId: 91,
        sourceId: 71,
        type: "selection",
        status: "FOLLOWING",
        message: "希望比较作品的日常佩戴感。",
        consultationType: null,
        preferredContact: null,
        preferredTime: null,
        budgetRange: null,
        product: null,
        items: [{ productNameSnapshot: "作品 01" }],
        createdAt: "2026-09-22T08:00:00.000Z",
        updatedAt: "2026-09-22T09:00:00.000Z",
        reply: {
          id: 601,
          content: "顾问已记录您的比较需求，可在沟通时继续补充佩戴场景。",
          createdAt: "2026-09-22T09:00:00.000Z",
        },
      })),
    });
  });
  await page.route("**/api/customers/me/inquiries**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(wrapped({ list: [], total: 0, page: 1, pageSize: 3 })),
  }));
  await page.route("**/api/customers/me/selection-inquiries", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(wrapped([])),
  }));
  await page.route("**/api/customers/me/notifications**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(wrapped({
      list: [], total: 0, unreadCount: 0, page: 1, pageSize: 20,
    })),
  }));
  await page.route("**/api/customers/me/notification-preferences", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(wrapped({ list: [], marketingConsentGranted: false })),
  }));
  await page.route("**/api/customers/me/quotations**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(wrapped({ list: [], total: 0, page: 1, pageSize: 20 })),
  }));
  await page.route("**/api/customers/me/favorites", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(wrapped([])),
  }));
  await page.route("**/api/customers/me/cooperation-design-files", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(wrapped([])),
  }));
  for (const path of ["orders", "addresses"] as const) {
    await page.route(`**/api/customers/me/${path}`, (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(wrapped([])),
    }));
  }
  await page.route("**/api/partner-applications/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(wrapped(null)),
  }));
  await page.route("**/api/settings/flags", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(wrapped({
      commerceEnabled: false,
      cartEnabled: false,
      paymentEnabled: false,
      partnerApplicationsWriteEnabled: false,
    })),
  }));
  await page.route("**/api/settings/public**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(wrapped({
      siteName: "海川珠宝",
      contactPhone: "",
      contactEmail: "",
      contactAddress: "",
      businessHours: "",
    })),
  }));
  await page.route("**/api/products/catalog**", (route) => {
    const url = new URL(route.request().url());
    const ids = url.searchParams.get("ids")?.split(",").map(Number).filter(Boolean);
    const filtered = ids?.length
      ? products.filter((product) => ids.includes(product.id))
      : products;
    const pageNumber = Number(url.searchParams.get("page") || 1);
    const pageSize = Number(url.searchParams.get("pageSize") || 32);
    const start = (pageNumber - 1) * pageSize;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(wrapped({
        list: filtered.slice(start, start + pageSize),
        total: filtered.length,
        page: pageNumber,
        pageSize,
        facets: { sizes: ["标准", "大号"] },
      })),
    });
  });
  await page.route("**/api/recommendations/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(wrapped([])),
  }));

  await seedSelection(page, [1], "customer:7");
  await page.goto("/catalog");
  await page.getByRole("button", { name: "查看已选 1 款并提交选款咨询" }).click();
  const dialog = page.getByRole("dialog", { name: "提交选款咨询" });
  await expect(dialog.getByText("选款回执会员")).toBeVisible();
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "提交选款咨询（1 款）" }).click();

  const receiptDialog = page.getByRole("dialog", { name: "选款咨询已提交" });
  await expect(receiptDialog).toContainText("#71");
  const detailLink = receiptDialog.getByRole("link", { name: "查看本次咨询" });
  await expect(detailLink).toHaveAttribute(
    "href",
    "/customer?section=consultations&leadId=91",
  );
  await detailLink.click();

  await expect(page).toHaveURL(/\/customer\?section=consultations&leadId=91$/);
  const detail = page.getByRole("region", { name: "咨询详情" });
  await expect(detail.getByRole("heading", { name: "作品 01" })).toBeVisible();
  await expect(detail.getByText("持续跟进中", { exact: true })).toBeVisible();
  await expect(detail.getByText(
    "顾问已记录您的比较需求，可在沟通时继续补充佩戴场景。",
  )).toBeVisible();
  expect(consultationPaths).toEqual(["/api/customers/me/consultations/91"]);
  expect(consultationPaths).not.toContain("/api/customers/me/consultations/71");
});

test("Catalog 在 390px 保持 4:5 媒体、可用对话框宽度并恢复触发焦点", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/catalog");

  const search = page.getByRole("combobox", { name: "关键词或货号" });
  await search.fill("作品");
  await expect(search).toHaveAttribute("aria-expanded", "true");
  await expect(search).toHaveAttribute("aria-controls");
  const listboxId = await search.getAttribute("aria-controls");
  expect(listboxId).toBeTruthy();
  await expect(page.getByRole("listbox")).toHaveAttribute("id", listboxId!);
  await search.fill("");
  await search.blur();

  const productMedia = page.locator("[data-catalog-product-media]").first();
  const productMediaBox = await productMedia.boundingBox();
  expect(productMediaBox).not.toBeNull();
  expect(productMediaBox!.width / productMediaBox!.height).toBeCloseTo(0.8, 1);

  const quickTrigger = page.getByRole("button", { name: "快速预览 作品 01" });
  await quickTrigger.click();
  const quickDialog = page.getByRole("dialog", { name: "作品 01" });
  await expect(quickDialog).toBeVisible();
  const quickDialogBox = await quickDialog.boundingBox();
  const quickMediaBox = await quickDialog.locator("[data-catalog-quick-media]").boundingBox();
  expect(quickDialogBox).not.toBeNull();
  expect(quickDialogBox!.width).toBeGreaterThanOrEqual(350);
  expect(quickDialogBox!.x + quickDialogBox!.width).toBeLessThanOrEqual(390);
  expect(quickMediaBox).not.toBeNull();
  expect(quickMediaBox!.width / quickMediaBox!.height).toBeCloseTo(0.8, 1);
  await page.keyboard.press("Escape");
  await expect(quickTrigger).toBeFocused();

  const filterTrigger = page.getByRole("button", { name: "更多筛选" });
  await filterTrigger.click();
  const filterDialog = page.getByRole("dialog", { name: "更多筛选" });
  await expect(filterDialog).toBeVisible();
  await expect(filterDialog.getByRole("button", { name: "关闭筛选" })).toBeFocused();
  const filterDialogBox = await filterDialog.boundingBox();
  expect(filterDialogBox).not.toBeNull();
  expect(filterDialogBox!.width).toBeGreaterThanOrEqual(350);
  expect(filterDialogBox!.x + filterDialogBox!.width).toBeLessThanOrEqual(390);
  await page.keyboard.press("Escape");
  await expect(filterTrigger).toBeFocused();

  for (const control of [quickTrigger, filterTrigger]) {
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
});
