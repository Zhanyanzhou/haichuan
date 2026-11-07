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
  test(`真实或既有款号 ${code} 不受旧分类筛选遮蔽`, async ({ page }) => {
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

test("款号前缀查无精确作品后按原品类继续搜索", async ({ page }) => {
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

test("页头预览和目录共用完整款号优先，前缀查无精确款号时继续搜索", async ({ page }) => {
  await installCatalog(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const exact = { ...sampleProducts[0], code: "ATP1873", name: "精确款号作品" };
  const similar = { ...sampleProducts[2], code: "ATP1874", name: "ATP1873 相似款" };
  const queries: Array<{ exactCode: string | null; keyword: string | null }> = [];
  await page.route("**/api/products/public?**", (route) => {
    const params = new URL(route.request().url()).searchParams;
    const exactCode = params.get("exactCode");
    const keyword = params.get("keyword");
    if (exactCode || keyword) queries.push({ exactCode, keyword });
    const list = exactCode ? (exactCode === exact.code ? [exact] : []) : [exact, similar];
    return route.fulfill({
      json: { code: 200, data: { list, total: list.length, page: 1, pageSize: 32, facets: { sizes: [] } } },
    });
  });
  await page.goto("/privacy");
  await page.getByRole("button", { name: "打开菜单" }).click();
  await page.getByRole("dialog", { name: "品牌菜单" }).getByRole("button", { name: "搜索" }).click();
  const dialog = page.getByRole("dialog", { name: "搜索作品" });
  const input = dialog.getByRole("textbox", { name: "关键词或款号" });

  await input.fill("ATP187");
  await expect(dialog.getByRole("link", { name: similar.name })).toBeVisible();
  expect(queries).toEqual([
    { exactCode: "ATP187", keyword: null },
    { exactCode: null, keyword: "ATP187" },
  ]);

  await input.fill("ＡＴＰ１８７３");
  await expect(dialog.getByRole("link", { name: exact.name })).toBeVisible();
  await expect(dialog.getByRole("link", { name: similar.name })).toHaveCount(0);
  await dialog.getByRole("button", { name: "查看结果" }).click();
  const results = page.getByRole("region", { name: "作品结果" });
  await expect(results.getByRole("heading", { name: exact.name })).toBeVisible();
  await expect(results.getByRole("heading", { level: 3 })).toHaveCount(1);
  expect(queries.filter(({ exactCode }) => exactCode === exact.code)).toHaveLength(2);
  expect(queries.some(({ keyword }) => keyword === exact.code)).toBe(false);
});

test("中文组合查询的联想采用当前服务端结果，并隔离迟到与输入法中的旧建议", async ({ page }) => {
  await installCatalog(page);
  const matched = { ...sampleProducts[0], name: "圆牌六字真言花丝镂空吊坠" };
  const next = { ...sampleProducts[1], name: "如意戒指" };
  const requests: URL[] = [];
  let releaseSlow!: () => void;
  const slowResponse = new Promise<void>((resolve) => { releaseSlow = resolve; });
  let completeSlow!: () => void;
  const slowCompleted = new Promise<void>((resolve) => { completeSlow = resolve; });
  await page.route("**/api/products/public?**", async (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    const keyword = url.searchParams.get("keyword") || "";
    if (keyword === "圆牌 六字") await slowResponse;
    const list = keyword === "戒指" ? [next] : [matched];
    try {
      await route.fulfill({
        json: { code: 200, data: { list, total: list.length, page: 1, pageSize: 32, facets: { sizes: [] } } },
      });
    } finally {
      if (keyword === "圆牌 六字") completeSlow();
    }
  });
  try {
    await page.goto("/catalog");
    const input = page.getByRole("combobox", { name: "关键词或款号" });
    const suggestions = page.getByRole("listbox", { name: "搜索建议" });
    await input.fill("圆牌镂空吊坠");
    await expect(suggestions.getByRole("option", { name: `作品 ${matched.name}` })).toBeVisible();
    expect(requests.find((url) => url.searchParams.get("keyword") === "圆牌镂空吊坠")
      ?.searchParams.get("sortBy")).toBe("relevance");

    await input.fill("圆牌 六字");
    await expect(suggestions).toHaveCount(0);
    await expect.poll(() => requests.some((url) => url.searchParams.get("keyword") === "圆牌 六字")).toBe(true);
    await input.fill("戒指");
    await expect(suggestions.getByRole("option", { name: `作品 ${next.name}` })).toBeVisible();
    releaseSlow();
    await slowCompleted;
    await expect(suggestions.getByRole("option", { name: `作品 ${matched.name}` })).toHaveCount(0);

    await input.dispatchEvent("compositionstart");
    await expect(suggestions).toHaveCount(0);
    await input.press("Enter");
    await expect(page).toHaveURL(/query=%E6%88%92%E6%8C%87/);
    await input.dispatchEvent("compositionend");
    await expect(suggestions.getByRole("option", { name: `作品 ${next.name}` })).toBeVisible();
    await input.press("ArrowUp");
    await input.press("Enter");
    await expect(input).toHaveValue(next.name);
    await expect(input).toHaveAttribute("aria-expanded", "false");
  } finally {
    releaseSlow();
  }
});

for (const width of [1440, 390]) {
  test(`${width}px 空结果隐藏联想，材质联想只采用已匹配作品的实际材质`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await installCatalog(page);
    const matched = { ...sampleProducts[0], name: "金质吊坠", materialType: "GOLD_999" };
    await page.route("**/api/products/public?**", (route) => {
      const keyword = new URL(route.request().url()).searchParams.get("keyword");
      const list = keyword === "18K金" ? [] : [matched];
      return route.fulfill({
        json: { code: 200, data: { list, total: list.length, facets: { sizes: [] } } },
      });
    });
    await page.goto("/catalog");
    const input = page.getByRole("combobox", { name: "关键词或款号" });
    const suggestions = page.getByRole("listbox", { name: "搜索建议" });
    await input.fill("18K金");
    await expect(page.getByText("没有找到「18K金」", { exact: true })).toBeVisible();
    await expect(suggestions).toHaveCount(0);
    await input.fill("金");
    await expect(suggestions.getByRole("option", { name: "材质 足金999", exact: true })).toBeVisible();
    await expect(suggestions.getByRole("option", { name: "材质 18K金", exact: true })).toHaveCount(0);
    await expect(suggestions.getByRole("option", { name: "材质 足金9999", exact: true })).toHaveCount(0);
    await expect(suggestions.getByRole("option", { name: `作品 ${matched.name}` })).toBeVisible();
  });
}

test("目录第二页的联想按相同筛选读取第一页，并以服务端次序呈现", async ({ page }) => {
  await installCatalog(page);
  const first = { ...sampleProducts[0], name: "圆牌六字真言吊坠" };
  const later = { ...sampleProducts[2], name: "圆牌莲花吊坠" };
  const requests: URL[] = [];
  await page.route("**/api/products/public?**", (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    const pageNumber = Number(url.searchParams.get("page") || 1);
    const list = pageNumber === 1 ? [first] : [later];
    return route.fulfill({
      json: { code: 200, data: { list, total: 33, page: pageNumber, pageSize: 32, facets: { sizes: [] } } },
    });
  });
  await page.goto("/catalog?query=圆牌&category=2&page=2");
  await expect(page.getByRole("heading", { level: 3, name: later.name })).toBeVisible();
  const input = page.getByRole("combobox", { name: "关键词或款号" });
  await input.focus();
  const suggestions = page.getByRole("listbox", { name: "搜索建议" });
  await expect(suggestions.getByRole("option", { name: `作品 ${first.name}` })).toBeVisible();
  await expect(suggestions.getByRole("option", { name: `作品 ${later.name}` })).toHaveCount(0);
  const request = requests.find((url) => url.searchParams.get("pageSize") === "8");
  expect(request?.searchParams.get("page")).toBe("1");
  expect(request?.searchParams.get("categoryIds")).toBe("2");
  expect(request?.searchParams.get("keyword")).toBe("圆牌");
  expect(request?.searchParams.get("sortBy")).toBe("relevance");
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

test("材质行支持键盘进入多选、取消暂选并确认应用", async ({ page }) => {
  await installCatalog(page);
  await page.goto("/catalog");
  const filterTrigger = page.getByRole("button", { name: /^筛选(?: · \d+)?$/ });
  const materialGroup = page.getByRole("group", { name: "材质筛选", exact: true });
  await expect(filterTrigger).toHaveAttribute("aria-expanded", "false");
  await expect(materialGroup).toBeHidden();
  await filterTrigger.press("Enter");
  await expect(filterTrigger).toHaveAttribute("aria-expanded", "true");
  await expect(materialGroup).toBeVisible();
  const multiple = materialGroup.getByRole("button", { name: "多选", exact: true });
  await multiple.focus();
  await multiple.press("Enter");
  const first = materialGroup.getByRole("checkbox").first();
  await first.focus();
  await first.press("Space");
  await expect(first).toBeChecked();
  await expect(page).not.toHaveURL(/material=/);
  await materialGroup.getByRole("checkbox").last().press("Tab");
  await expect(materialGroup.getByRole("button", { name: "确定", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  const cancel = materialGroup.getByRole("button", { name: "取消", exact: true });
  await expect(cancel).toBeFocused();
  await cancel.press("Enter");
  await expect(materialGroup.getByRole("checkbox")).toHaveCount(0);
  await expect(multiple).toBeFocused();
  await expect(materialGroup.getByRole("button", { name: "不限", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page).not.toHaveURL(/material=/);

  await multiple.press("Enter");
  await first.focus();
  await first.press("Space");
  await first.press("Escape");
  await expect(materialGroup.getByRole("checkbox")).toHaveCount(0);
  await expect(multiple).toBeFocused();
  await expect(page).not.toHaveURL(/material=/);

  await multiple.focus();
  await multiple.press("Enter");
  await first.focus();
  await first.press("Space");
  await materialGroup.getByRole("checkbox").last().press("Tab");
  await materialGroup.getByRole("button", { name: "确定", exact: true }).press("Enter");
  await expect(page).toHaveURL(/material=/);
  await expect(materialGroup.getByRole("checkbox")).toHaveCount(0);
  await expect(multiple).toBeFocused();
  await expect(page.getByRole("button", { name: /^移除筛选 材质 ·/ })).toHaveCount(1);
});

test("手机紧凑圆点切图器、横滑与键盘页头焦点可用", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installCatalog(page);
  await page.goto("/catalog");
  const media = page.locator("[data-catalog-product-media]").first();
  const dots = media.locator("[data-catalog-image-dots]");
  await expect(dots).toBeVisible();
  await expect(dots).toHaveAccessibleName("下一张图片，当前第 1 张，共 3 张");
  const dotsBox = await dots.boundingBox();
  expect(dotsBox?.width).toBeGreaterThanOrEqual(44);
  expect(dotsBox?.height).toBeGreaterThanOrEqual(44);
  const visualDots = dots.locator(".catalog-image-dot");
  await expect(visualDots).toHaveCount(3);
  await expect(dots.locator('.catalog-image-dot[data-active="true"]')).toHaveCount(1);
  await expect(visualDots.first()).toHaveAttribute("data-active", "true");
  const visualBounds = await visualDots.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect()));
  expect(visualBounds.at(-1)!.right - visualBounds[0].left).toBeLessThanOrEqual(32);
  await dots.click();
  await expect(media).toHaveAttribute("data-catalog-image-index", "1");
  await expect(visualDots.nth(1)).toHaveAttribute("data-active", "true");
  await media.evaluate((element) => {
    element.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      pointerId: 1,
      pointerType: "touch",
      clientX: 280,
      clientY: 220,
    }));
  });
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent("pointermove", {
      pointerId: 1,
      pointerType: "touch",
      clientX: 180,
      clientY: 220,
    }));
    window.dispatchEvent(new PointerEvent("pointerup", {
      pointerId: 1,
      pointerType: "touch",
      clientX: 180,
      clientY: 220,
    }));
  });
  await expect(media).toHaveAttribute("data-catalog-image-index", "2");
  await expect(visualDots.nth(2)).toHaveAttribute("data-active", "true");
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

test("桌面悬停恢复下一张按钮并与圆点状态同步", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installCatalog(page);
  await page.goto("/catalog");
  const media = page.locator("[data-catalog-product-media]").first();
  const next = media.locator("[data-catalog-image-next]");
  await expect(next).toBeAttached();
  await expect.poll(() => next.evaluate((button) => Number.parseFloat(getComputedStyle(button).opacity)))
    .toBe(0);
  await media.hover();
  await expect.poll(() => next.evaluate((button) => Number.parseFloat(getComputedStyle(button).opacity)))
    .toBe(1);
  const box = await next.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);
  await next.click();
  await expect(media).toHaveAttribute("data-catalog-image-index", "1");
  await expect(media.locator(".catalog-image-dot").nth(1)).toHaveAttribute("data-active", "true");
});
