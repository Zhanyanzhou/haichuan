import { expect, test, type Page } from "@playwright/test";
import { mockCatalogDetail, publicProduct } from "./fixtures/public-catalog-detail";

// 自有公开API夹具：验证查询和恢复界面，不代表真实后台或咨询联调。
const sampleProducts = [
  { ...publicProduct(1, "DISPLAY_ONLY"), code: "ATP375", name: "吊坠作品", categoryId: 2 },
  { ...publicProduct(2, "DISPLAY_ONLY"), code: "AA11412", name: "戒指作品", categoryId: 1 },
  { ...publicProduct(3, "DISPLAY_ONLY"), code: "HC-TEST-001", name: "旧编码作品", categoryId: 2 },
].map((product) => ({
  ...product,
  images: Array.from({ length: 3 }, (_, index) => ({
    id: product.id * 10 + index,
    productId: product.id,
    url: `/images/system/product-placeholder.svg?catalog-fix=${product.id}-${index}`,
    sortOrder: index,
    isVideo: false,
    type: "FRONT" as const,
  })),
}));

async function installCatalog(page: Page, selectionBag = false) {
  const products = selectionBag
    ? sampleProducts.map((product) => ({ ...product, salesMode: "SELECTION" as const }))
    : sampleProducts;
  await mockCatalogDetail(page, {
    products,
    flags: selectionBag ? { commerceEnabled: false, cartEnabled: false, paymentEnabled: false } : undefined,
  });
  const requests: URL[] = [];
  const state = { fail: false, wait: undefined as Promise<void> | undefined };
  const wrapped = (data: unknown) => ({ code: 200, data });
  await page.route("**/api/categories/tree**", (route) => route.fulfill({
    json: wrapped([
      { id: 1, name: "戒指", slug: "rings", level: 1, parentId: null, children: [] },
      { id: 2, name: "吊坠", slug: "pendants", level: 1, parentId: null, children: [] },
    ]),
  }));
  await page.route("**/api/products/public?**", async (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    await state.wait;
    if (state.fail) return route.fulfill({ status: 503, json: { message: "fixture unavailable" } });
    let list = [...products];
    const ids = url.searchParams.get("ids")?.split(",").map(Number);
    if (ids) list = list.filter((product) => ids.includes(product.id));
    const code = url.searchParams.get("exactCode");
    if (code) list = list.filter((product) => product.code === code);
    const keyword = url.searchParams.get("keyword");
    if (keyword) list = list.filter((product) => product.name.includes(keyword) || product.code.includes(keyword));
    const categories = url.searchParams.get("categoryIds")?.split(",");
    if (categories) list = list.filter((product) => categories.includes(String(product.categoryId)));
    return route.fulfill({ json: wrapped({ list, total: list.length, facets: { sizes: [] } }) });
  });
  return { requests, state };
}

for (const code of ["ATP375", "AA11412", "HC-TEST-001"]) {
  test(`真实或既有货号 ${code} 不受旧分类筛选遮蔽`, async ({ page }) => {
    const fixture = await installCatalog(page);
    await page.goto(`/catalog?category=1&query=${code}`);
    const product = sampleProducts.find((item) => item.code === code)!;
    await expect(page.getByRole("heading", { level: 3, name: product.name })).toBeVisible();
    expect(fixture.requests.some((url) => url.searchParams.get("exactCode") === code)).toBe(true);
    expect(fixture.requests.some((url) => url.searchParams.get("keyword") === code)).toBe(false);
    for (const url of fixture.requests.filter((request) => request.searchParams.get("exactCode") === code)) {
      expect(url.searchParams.has("categoryIds")).toBe(false);
      expect(url.searchParams.has("keyword")).toBe(false);
    }
  });
}

test("货号前缀查无精确作品后按原品类继续搜索", async ({ page }) => {
  const { requests } = await installCatalog(page);
  await page.goto("/catalog?category=2&query=ATP37");
  await expect(page.getByRole("heading", { level: 3, name: "吊坠作品" })).toBeVisible();
  const searchRequests = requests.filter((url) =>
    url.searchParams.has("exactCode") || url.searchParams.has("keyword"),
  );
  expect(searchRequests.map((url) => Object.fromEntries(
    [...url.searchParams].filter(([name]) => ["exactCode", "keyword", "categoryIds"].includes(name)),
  ))).toEqual([{ exactCode: "ATP37" }, { keyword: "ATP37", categoryIds: "2" }]);
});

test("普通名称及材质词保持关键词和分类语义", async ({ page }) => {
  const fixture = await installCatalog(page);
  for (const keyword of ["戒指", "S925", "PT950", "AU750", "18K"]) {
    await page.goto(`/catalog?category=1&query=${encodeURIComponent(keyword)}`);
    await expect.poll(() => fixture.requests.some((url) => url.searchParams.get("keyword") === keyword)).toBe(true);
    const request = fixture.requests.find((url) => url.searchParams.get("keyword") === keyword)!;
    expect(request.searchParams.has("exactCode")).toBe(false);
    expect(request.searchParams.get("categoryIds")).toBe("1");
  }
});

test("缓存刷新失败保留作品并给出可恢复提示", async ({ page }) => {
  const fixture = await installCatalog(page);
  await page.goto("/catalog");
  await expect(page.getByRole("heading", { level: 3 })).toHaveCount(3);
  const categoryNav = page.getByRole("navigation", { name: "作品品类" });
  await categoryNav.getByRole("button", { name: "戒指", exact: true }).click();
  await expect(page.getByRole("heading", { level: 3 })).toHaveCount(1);
  fixture.state.fail = true;
  await categoryNav.getByRole("button", { name: "全部", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "作品更新失败" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3 })).toHaveCount(3);
  fixture.state.fail = false;
  let releaseRefresh!: () => void;
  fixture.state.wait = new Promise<void>((resolve) => { releaseRefresh = resolve; });
  await page.getByRole("button", { name: "重试更新", exact: true }).click();
  try {
    await expect(page.getByRole("alert").filter({ hasText: "作品更新失败" })).toBeVisible();
    await expect(page.getByRole("button", { name: "正在更新", exact: true })).toBeDisabled();
    await expect(page.getByRole("heading", { level: 3 })).toHaveCount(3);
  } finally {
    releaseRefresh();
  }
  await expect(page.getByRole("alert").filter({ hasText: "作品更新失败" })).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 3 })).toHaveCount(3);
});

test("手机切换筛选等待慢网时，旧查询的作品不能继续点击", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await installCatalog(page);
  await page.goto("/catalog?category=1");
  const results = page.getByRole("region", { name: "作品结果" });
  await expect(results.getByRole("heading", { name: "戒指作品" })).toBeVisible();
  let release!: () => void;
  fixture.state.wait = new Promise<void>((resolve) => { release = resolve; });
  const nextRequest = page.waitForRequest((request) =>
    new URL(request.url()).searchParams.get("categoryIds") === "2",
  );
  try {
    await page.getByRole("navigation", { name: "作品品类" }).getByRole("button", { name: "吊坠", exact: true }).click();
    await nextRequest;
    await expect(results.getByRole("status", { name: "正在加载珠宝作品…" })).toBeVisible();
    await expect(results.getByRole("link", { name: "戒指作品", exact: true })).toHaveCount(0);
  } finally {
    release();
  }
  await expect(results.getByRole("heading", { name: "吊坠作品" })).toBeVisible();
});

test("手机从带筛选的目录打开购物袋，继续选款回到原结果", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installCatalog(page, true);
  await page.goto(`/catalog?category=2&query=${encodeURIComponent("吊坠")}`);
  const catalogUrl = page.url();
  const results = page.getByRole("region", { name: "作品结果" });
  await results.getByRole("button", { name: "加入选款" }).click();
  await page.getByRole("link", { name: "购物袋，已选 1 款", exact: true }).click();
  await expect(page).toHaveURL(/\/cart$/);
  await expect(page.getByRole("list", { name: "购物袋中的作品" })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(catalogUrl);
  await expect(results.getByRole("button", { name: "已选" })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("list", { name: "购物袋中的作品" })).toBeVisible();
  await page.getByRole("link", { name: "继续选款", exact: true }).click();
  await expect(page).toHaveURL(catalogUrl);
  await expect(results.getByRole("button", { name: "已选" })).toBeVisible();
  await expect(results.getByRole("heading", { name: "戒指作品" })).toHaveCount(0);
});

test("手机购物袋慢网校验失败后保留剩余作品并可重试", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await installCatalog(page, true);
  await page.goto("/catalog?category=2");
  const results = page.getByRole("region", { name: "作品结果" });
  await results.getByRole("button", { name: "加入选款" }).first().click();
  await results.getByRole("button", { name: "加入选款" }).click();
  await page.getByRole("link", { name: "购物袋，已选 2 款", exact: true }).click();
  const bag = page.getByRole("list", { name: "购物袋中的作品" });
  await expect(bag.getByRole("listitem")).toHaveCount(2);
  const handoff = page.getByRole("button", { name: "交给顾问", exact: true });
  await expect(handoff).toBeEnabled();

  let release!: () => void;
  fixture.state.wait = new Promise<void>((resolve) => { release = resolve; });
  fixture.state.fail = true;
  const pendingRequest = page.waitForRequest((request) => new URL(request.url()).searchParams.get("ids") === "3");
  try {
    await bag.getByRole("button", { name: "移除 吊坠作品", exact: true }).click();
    await pendingRequest;
    await expect(page.getByRole("status").filter({ hasText: "正在读取已选作品" })).toBeVisible();
    await expect(bag.getByRole("listitem")).toHaveCount(1);
    await expect(handoff).toHaveCount(0);
  } finally {
    release();
  }

  const alert = page.getByRole("alert").filter({ hasText: "已选作品暂时无法确认" });
  await expect(alert).toBeVisible();
  await expect(bag.getByRole("link", { name: /旧编码作品/ })).toBeVisible();
  const savedIds = await page.evaluate(() => {
    const stored = localStorage.getItem("hc_selection_tray");
    return stored ? JSON.parse(stored).state.selectedIds : [];
  });
  expect(savedIds).toEqual([3]);

  fixture.state.fail = false;
  await alert.getByRole("button", { name: "重新读取", exact: true }).click();
  await expect(handoff).toBeEnabled();
  await expect(alert).toHaveCount(0);
});

test("材质弹层支持Esc返回触发器及Tab离开关闭", async ({ page }) => {
  await installCatalog(page);
  await page.goto("/catalog");
  const trigger = page.getByRole("button", { name: "材质", exact: true });
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const materialGroup = page.getByRole("group", { name: "材质筛选", exact: true });
  await materialGroup.getByRole("checkbox").first().press("Escape");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await materialGroup.getByRole("checkbox").last().press("Tab");
  await expect(materialGroup).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "作品排序方式" })).toBeFocused();
});

test("手机切图目标互不重叠且键盘页头焦点可见", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installCatalog(page);
  await page.goto("/catalog");
  const marks = page.locator(".catalog-image-marks").first().getByRole("button");
  await expect(marks).toHaveCount(3);
  const boxes = await marks.evaluateAll((buttons) => buttons.map((button) => {
    const { left, right, top, bottom, width, height } = button.getBoundingClientRect();
    return { left, right, top, bottom, width, height };
  }));
  for (const box of boxes) {
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  for (let index = 1; index < boxes.length; index += 1) {
    expect(boxes[index].left >= boxes[index - 1].right || boxes[index].top >= boxes[index - 1].bottom).toBe(true);
  }
  await page.keyboard.press("Tab");
  const menu = page.getByRole("button", { name: "打开菜单", exact: true });
  await menu.focus();
  const outline = await menu.evaluate((button) => {
    const style = getComputedStyle(button);
    return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) };
  });
  expect(outline.style).toBe("solid");
  expect(outline.width).toBeGreaterThanOrEqual(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
