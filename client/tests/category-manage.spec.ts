import { expect, test, type Locator, type Page } from "@playwright/test";
import { installAdminSession } from "./fixtures/session-auth";

const categoryTree = [
  {
    id: 1,
    name: "珠宝首饰",
    slug: "jewelry",
    level: 1,
    sortOrder: 1,
    isActive: true,
    _count: { children: 3, products: 1 },
    manageableProductCount: 1,
    children: [
      {
        id: 2,
        name: "戒指",
        slug: "rings",
        level: 2,
        parentId: 1,
        sortOrder: 1,
        isActive: true,
        _count: { children: 0, products: 3 },
        manageableProductCount: 1,
      },
      {
        id: 3,
        name: "耳饰",
        slug: "earrings",
        level: 2,
        parentId: 1,
        sortOrder: 2,
        isActive: false,
        _count: { children: 0, products: 0 },
        manageableProductCount: 0,
      },
      {
        id: 5,
        name: "圆环形制",
        slug: "round",
        level: 2,
        parentId: 1,
        sortOrder: 3,
        isActive: true,
        _count: { children: 1, products: 0 },
        manageableProductCount: 0,
        children: [{
          id: 6, name: "平安扣", slug: "round-pendant", level: 3, parentId: 5,
          sortOrder: 1, isActive: true, _count: { children: 0, products: 8 }, manageableProductCount: 0,
        }],
      },
    ],
  },
];

const uncategorized = {
  id: 9, name: "未分类", slug: "system-uncategorized", level: 1,
  sortOrder: 2147483647, isActive: false, isUncategorized: true, children: [],
};

async function authenticateCategoryEditor(page: Page) {
  await installAdminSession(page, {
    username: "category-editor",
    realName: "分类编辑员",
  });
}

async function inlineEdges(first: Locator, second: Locator) {
  await expect(first).toBeVisible();
  await expect(second).toBeVisible();
  const [firstBox, secondBox] = await Promise.all([first.boundingBox(), second.boundingBox()]);
  if (!firstBox || !secondBox) throw new Error("分类目录元素缺少布局尺寸");
  const firstEnd = firstBox.x + firstBox.width;
  return { gap: secondBox.x - firstEnd, endOffset: secondBox.x + secondBox.width - firstEnd };
}

test.describe("分类管理现有交互合同", () => {
  test("加载、搜索、详情与商品列表跳转形成单一路径", async ({ page }) => {
    await authenticateCategoryEditor(page);
    const productQueries: URLSearchParams[] = [];
    const tree = structuredClone(categoryTree);
    const categoryWrites: unknown[] = [];
    let externalProductMoved = false;

    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      if (path === "/api/auth/profile") return route.fallback();
      let data: unknown = {};
      if (path === "/api/categories/admin/tree") data = tree;
      if (path === "/api/categories/2" && route.request().method() === "PUT") {
        const body = route.request().postDataJSON();
        categoryWrites.push(body);
        tree[0].children[0].name = body.name;
      }
      if (path === "/api/products") {
        productQueries.push(url.searchParams);
        const scope = url.searchParams.get("categoryId");
        const records = [
          { id: 101, name: "珠宝首饰示例商品", code: "HC-101", categoryId: externalProductMoved ? 2 : 1 },
          { id: 102, name: "金戒指", code: "HC-102", categoryId: 2 },
        ];
        const includeDescendants = url.searchParams.get("includeDescendants") === "true";
        const list = records.filter((record) => (scope === "1" && includeDescendants) || String(record.categoryId) === scope)
          .map((record) => ({ ...record, materialType: "GOLD_999", status: "DRAFT", price: 0 }));
        data = { list, total: list.length };
      }
      if (path === "/api/products/101") {
        data = { id: 101, categoryId: 1, name: "珠宝首饰示例商品", code: "HC-101", status: "DRAFT", images: [] };
      }
      if (path === "/api/products/102") {
        data = {
          id: 102, categoryId: 2, name: "金戒指", code: "HC-102", materialType: "GOLD_999",
          status: "DRAFT", price: 0, size: "13 号", goldWeight: 3.5,
          shortDescription: "戒指商品详情", images: [],
        };
      }
      if (path === "/api/settings/flags") {
        data = {
          commerceEnabled: false,
          cartEnabled: false,
          paymentEnabled: false,
        };
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ code: 200, data, message: "ok" }),
      });
    });

    await page.goto("/admin/categories");
    await expect(page.getByRole("heading", { name: "分类管理" })).toBeVisible();
    const directory = page.getByRole("region", { name: "分类列表" });
    await expect(directory.getByRole("heading", { name: "分类管理" })).toBeVisible();
    await expect(directory.getByText("珠宝首饰", { exact: true })).toBeVisible();
    await expect(directory.getByText("平安扣", { exact: true })).toBeVisible();
    await expect(directory.getByText("圆环形制 /", { exact: true })).toBeVisible();
    const collapse = directory.getByRole("button", { name: "收起「珠宝首饰」的下级分类" });
    await expect(collapse).toHaveAttribute("aria-expanded", "true");
    await collapse.press("Enter");
    await expect(directory.getByText("待归类 1 件")).toBeVisible();
    await expect(directory.getByText("平安扣", { exact: true })).toBeHidden();
    const directorySearch = directory.getByRole("textbox", { name: "搜索品类或款式" });
    await directorySearch.fill("平安扣");
    await expect(directory.getByText("平安扣", { exact: true })).toBeVisible();
    await directorySearch.clear();
    await expect(directory.getByText("平安扣", { exact: true })).toBeHidden();
    await directory.getByRole("button", { name: "展开「珠宝首饰」的下级分类" }).press("Enter");
    await expect(page.getByRole("heading", { name: "珠宝首饰的商品" })).toBeVisible();
    await expect(page.getByRole("list", { name: "珠宝首饰 / 未分类", exact: true }).getByText("珠宝首饰示例商品")).toBeVisible();
    await expect(page.getByRole("list", { name: "珠宝首饰 / 戒指", exact: true }).getByText("金戒指")).toBeVisible();
    expect(productQueries.at(-1)?.get("includeDescendants")).toBe("true");
    const branchPreview = page.getByRole("region", { name: "珠宝首饰的商品" });
    const parentRow = directory.getByRole("button", { name: /^查看「珠宝首饰」的商品/ });
    const parentCount = parentRow.getByText("2 件", { exact: true });
    const nameGap = (await inlineEdges(parentRow.getByText("珠宝首饰", { exact: true }), parentCount)).gap;
    expect(nameGap).toBeGreaterThanOrEqual(12);
    await expect(branchPreview.getByText(/共 2 件商品 · 已归二级 1 件 · 未分类 1 件/)).toBeVisible();
    const childGroup = directory.getByRole("list", { name: "「珠宝首饰」的下级分类" });
    const styleRow = childGroup.getByRole("button", { name: /^查看「戒指」的商品/ });
    const styleCount = styleRow.getByText("1 件", { exact: true });
    expect((await inlineEdges(parentCount, styleCount)).endOffset).toBeCloseTo(0);
    const unclassifiedRow = childGroup.getByRole("button", { name: "查看「珠宝首饰 / 未分类」的商品（1 件）" });
    await unclassifiedRow.click();
    await expect(unclassifiedRow).toHaveAttribute("aria-current", "true");
    const unclassified = page.getByRole("region", { name: "未分类的商品" });
    const cardInUnclassified = unclassified.getByRole("button", { name: /查看商品「珠宝首饰示例商品」/ });
    await expect(cardInUnclassified).toBeVisible();
    await expect(unclassified.getByText("金戒指", { exact: true })).toHaveCount(0);
    await expect(unclassified.getByRole("link", { name: "在商品管理中查看" })).toHaveAttribute("href", "/admin/products?categoryId=1");
    expect(productQueries.at(-1)?.has("includeDescendants")).toBe(false);
    await cardInUnclassified.click();
    const unclassifiedDetail = page.getByRole("region", { name: "珠宝首饰示例商品" });
    await expect(unclassifiedDetail.getByText("珠宝首饰 / 未分类", { exact: true }).first()).toBeVisible();
    await unclassifiedDetail.getByRole("button", { name: "返回分类商品" }).click();
    await expect(cardInUnclassified).toBeVisible();
    await parentRow.click();
    await expect(branchPreview.getByRole("list", { name: "珠宝首饰 / 戒指", exact: true }).getByText("金戒指")).toBeVisible();
    await expect(directory.getByRole("button", { name: /添加款式/ })).toHaveCount(0);
    await expect(directory.getByRole("button", { name: "批量改分类" })).toHaveCount(0);
    await expect(branchPreview.getByRole("button", { name: "批量改分类" })).toBeEnabled();
    await expect(branchPreview.getByRole("button", { name: /添加款式|编辑「/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "调整选款中心顺序" })).toBeVisible();

    await page.getByRole("button", { name: "新建分类" }).click();
    const createDialog = page.getByRole("dialog", { name: "新建分类" });
    await expect(createDialog.getByLabel("品类名称")).toBeVisible();
    await expect(createDialog.getByRole("radio", { name: "新建品类" })).toBeChecked();
    await expect(createDialog.getByRole("combobox", { name: "所属品类" })).toHaveCount(0);
    await expect(createDialog.getByLabel("网址标识")).toHaveCount(0);
    await createDialog.getByRole("button", { name: /取\s*消/ }).click();

    await page.getByRole("button", { name: "查看「圆环形制」的商品（0 件，另有 8 件历史关联）" }).click();
    await expect(page.getByRole("heading", { name: "圆环形制的商品" })).toBeVisible();
    const emptyBatch = page.getByRole("region", { name: "圆环形制的商品" }).getByRole("button", { name: "批量改分类" });
    await expect(emptyBatch).toBeDisabled();
    await expect(emptyBatch).toHaveAccessibleDescription("当前分类暂无商品。");
    await expect(page.getByText("此分类关联的 8 件商品均在回收站或已删除。")).toBeVisible();
    await expect(page.getByRole("button", { name: "查看「平安扣」的商品（0 件，另有 8 件历史关联）" })).toBeVisible();
    await expect(page.getByRole("link", { name: "查看此分类回收站" })).toHaveAttribute("href", /categoryId=5&includeDescendants=1&status=ARCHIVED/);

    await page.getByRole("textbox", { name: "搜索品类或款式" }).fill("戒指");
    await expect(page.getByText("戒指", { exact: true })).toBeVisible();
    await expect(page.getByText("耳饰", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "调整选款中心顺序" })).toBeDisabled();
    await expect(directory.getByText("清空搜索后可调整顺序。")).toBeVisible();

    await page.getByRole("button", { name: "查看「戒指」的商品（1 件，另有 2 件历史关联）" }).click();
    const preview = page.getByRole("region", { name: "戒指的商品" });
    const card = preview.getByRole("button", { name: /查看商品「金戒指」/ });
    await card.click();
    const detail = page.getByRole("region", { name: "金戒指" });
    await expect(detail.getByText("珠宝首饰 / 戒指").first()).toBeVisible();
    await expect(detail.getByText("13 号")).toBeVisible();
    await expect(detail.getByRole("img", { name: "金戒指" })).toBeVisible();
    await expect(directory.getByRole("button", { name: "查看「戒指」的商品（1 件，另有 2 件历史关联）" })).toHaveAttribute("aria-current", "true");
    await expect(detail.getByRole("link", { name: "编辑商品" })).toHaveAttribute("href", /products\/102\/edit\?returnTo=/);
    await expect(page).toHaveURL(/categoryId=2&productId=102$/);
    await detail.getByRole("button", { name: "返回分类商品" }).click();
    await expect(card).toBeVisible();
    await expect(preview.getByText("款号 HC-102")).toBeVisible();
    await expect(preview.getByText("草稿")).toBeVisible();
    await expect(page.getByText("珠宝首饰示例商品", { exact: true })).toHaveCount(0);
    expect(productQueries.at(-1)?.get("categoryId")).toBe("2");
    expect(productQueries.at(-1)?.has("includeDescendants")).toBe(false);

    const rootEdit = directory.getByRole("button", { name: "编辑「珠宝首饰」" });
    await expect(rootEdit).toHaveCSS("opacity", "0");
    await directory.getByRole("button", { name: /^查看「珠宝首饰」的商品/ }).hover();
    await expect(rootEdit).toHaveCSS("opacity", "1");
    await rootEdit.click();
    const rootDrawer = page.getByRole("dialog", { name: "编辑品类" });
    await expect(rootDrawer.getByLabel("分类名称")).toHaveValue("珠宝首饰");
    await page.keyboard.press("Escape");
    await expect(rootDrawer).toBeHidden();
    await expect(preview).toBeVisible();

    const ringRow = directory.getByRole("button", { name: /^查看「戒指」的商品/ });
    const ringEdit = directory.getByRole("button", { name: "编辑「戒指」" });
    await expect(ringEdit).toHaveCSS("opacity", "0");
    await ringRow.focus();
    await expect(ringEdit).toHaveCSS("opacity", "1");
    await page.keyboard.press("Tab");
    await expect(ringEdit).toBeFocused();
    await expect(ringEdit).toHaveCSS("opacity", "1");
    await page.keyboard.press("Enter");
    const editDrawer = page.getByRole("dialog", { name: "编辑款式" });
    const nameInput = editDrawer.getByLabel("分类名称");
    await expect(nameInput).toHaveValue("戒指");
    await expect(nameInput).toBeFocused();
    await expect(editDrawer.getByText("所属品类 · 珠宝首饰")).toBeVisible();
    await expect(editDrawer.getByRole("combobox", { name: "所属品类" })).toBeVisible();
    await nameInput.fill("黄金戒指");
    await nameInput.press("Enter");
    await expect(directory.getByRole("button", { name: "编辑「黄金戒指」" })).toHaveCount(1);
    expect(categoryWrites).toEqual([{ name: "黄金戒指" }]);
    await expect(nameInput).toBeEnabled();
    await page.keyboard.press("Escape");
    await expect(editDrawer).toBeHidden();

    await directory.getByRole("textbox", { name: "搜索品类或款式" }).clear();
    await expect(unclassifiedRow).toBeVisible();
    externalProductMoved = true;
    tree[0].manageableProductCount -= 1;
    tree[0]._count.products -= 1;
    tree[0].children[0].manageableProductCount += 1;
    tree[0].children[0]._count.products += 1;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(directory.getByRole("button", { name: "查看「黄金戒指」的商品（2 件，另有 2 件历史关联）" })).toBeVisible();
    await expect(page.getByRole("region", { name: "黄金戒指的商品" }).getByText("珠宝首饰示例商品")).toBeVisible();
    await expect(unclassifiedRow).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await directory.getByRole("button", { name: /^查看「黄金戒指」的商品/ }).hover();
    await directory.getByRole("button", { name: "编辑「黄金戒指」" }).click();
    await expect(nameInput).toBeFocused();
    await expect(nameInput).toBeInViewport();
    await page.keyboard.press("Escape");
    await expect(editDrawer).toBeHidden();
    await page.getByRole("region", { name: "黄金戒指的商品" }).getByRole("link", { name: "在商品管理中查看" }).click();
    await expect(page).toHaveURL(/\/admin\/products\?categoryId=2$/);
  });

  test("分类写请求沿用员工 Cookie 会话、CSRF 与原请求体", async ({ page }) => {
    await authenticateCategoryEditor(page);
    const categoryWrites: Array<{
      headers: Record<string, string>;
      body: Record<string, unknown>;
    }> = [];

    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === "/api/auth/profile") return route.fallback();
      if (path === "/api/categories" && request.method() === "POST") {
        categoryWrites.push({
          headers: request.headers(),
          body: request.postDataJSON(),
        });
      }

      const data =
        path === "/api/categories/admin/tree"
          ? categoryTree
          : path === "/api/categories" && request.method() === "POST"
            ? { id: 9, name: "胸针", slug: "brooches" }
            : {};
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ code: 200, data, message: "ok" }),
      });
    });

    await page.goto("/admin/categories");
    await expect(page.getByRole("heading", { name: "分类管理" })).toBeVisible();
    await page.evaluate(() => {
      document.cookie = "hc_csrf=category-csrf-token; path=/";
    });

    const createButton = page.getByRole("button", { name: "新建分类" });
    await createButton.click();
    const createDialog = page.getByRole("dialog", { name: "新建分类" });
    await expect(createDialog).toHaveCSS("width", "600px");
    await createDialog.getByLabel("品类名称").fill("胸针");
    await createDialog.getByRole("button", { name: /保\s*存/ }).click();

    await expect.poll(() => categoryWrites.length).toBe(1);
    expect(categoryWrites[0].headers.authorization).toBeUndefined();
    expect(categoryWrites[0].headers["x-csrf-token"]).toBe(
      "category-csrf-token",
    );
    expect(categoryWrites[0].body).toMatchObject({
      name: "胸针",
      slug: "cat",
      sortOrder: 2,
    });
    expect(categoryWrites[0].body.isActive).toBeUndefined();
    expect(categoryWrites[0].body.parentId).toBeUndefined();
    await expect(createDialog).toBeHidden();

    await createButton.click();
    await createDialog.getByLabel("品类名称").fill("新款吊坠");
    await createDialog.getByText("新建款式", { exact: true }).click();
    await expect(createDialog.getByLabel("款式名称")).toHaveValue("新款吊坠");
    await createDialog.getByRole("button", { name: /保\s*存/ }).click();
    await expect(createDialog.getByText("请选择所属品类", { exact: true })).toBeVisible();
    expect(categoryWrites).toHaveLength(1);
    const parent = createDialog.getByRole("combobox", { name: "所属品类" });
    await parent.fill("珠宝");
    await page.locator(".ant-select-dropdown").getByText("珠宝首饰", { exact: true }).click();
    await createDialog.getByRole("button", { name: /保\s*存/ }).click();
    await expect.poll(() => categoryWrites.length).toBe(2);
    expect(categoryWrites[1].body).toMatchObject({
      name: "新款吊坠",
      parentId: 1,
      sortOrder: 4,
    });
  });

  test("排序模式内只调整同级分类，取消不写入，键盘调整保存失败后可重试", async ({ page }) => {
    await authenticateCategoryEditor(page);
    const other = {
      id: 4, name: "摆件", slug: "ornaments", level: 1,
      sortOrder: 2, isActive: true, children: [],
    };
    const pendingCategory = { ...uncategorized, manageableProductCount: 1, _count: { children: 0, products: 1 } };
    let tree = [...categoryTree, other, pendingCategory];
    const writes: unknown[] = [];

    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === "/api/auth/profile") return route.fallback();
      if (path === "/api/categories/reorder") {
        writes.push(request.postDataJSON());
        if (writes.length === 1) {
          await route.fulfill({ status: 400, json: { message: "排序未保存，请重试" } });
          return;
        }
        tree = [{ ...other, sortOrder: 1 }, { ...categoryTree[0], sortOrder: 2 }, pendingCategory];
      }
      await route.fulfill({ json: { code: 200, data: path === "/api/categories/admin/tree" ? tree : {} } });
    });

    await page.goto("/admin/categories?categoryId=1");
    const sort = page.getByRole("button", { name: "调整选款中心顺序" });
    const save = page.getByRole("button", { name: "保存顺序" });
    const pending = page.getByText("顺序已调整，尚未保存");
    const allRoots = page.locator(".cat-row--root");
    await expect(allRoots.first().getByRole("button", { name: "查看「未分类」的商品（1 件）" })).toBeVisible();
    await expect(page.locator(".cat-row__grip")).toHaveCount(0);
    await sort.click();
    await expect(page.getByText("仅可调整同级分类。保存后更新选款中心顺序。")).toBeVisible();
    await expect(allRoots.first().locator(".cat-row__grip")).toHaveCount(0);
    const roots = allRoots.filter({ hasNotText: "未分类" });
    const sibling = roots.filter({ hasText: "珠宝首饰" });
    await page.locator(".cat-row--child").filter({ hasText: "戒指" }).locator(".cat-row__grip")
      .dragTo(sibling, { targetPosition: { x: 48, y: 6 } });
    await expect(pending).toHaveCount(0);
    await expect(roots.first()).toContainText("珠宝首饰");

    await roots.filter({ hasText: "摆件" }).locator(".cat-row__grip").dragTo(
      sibling, { targetPosition: { x: 48, y: 6 } },
    );
    await expect(roots.first()).toContainText("摆件");
    await expect(pending).toBeVisible();
    await expect(page.getByRole("region", { name: "珠宝首饰的商品" })).toBeVisible();
    await page.getByRole("button", { name: /取\s*消/ }).click();
    await expect(roots.first()).toContainText("珠宝首饰");
    expect(writes).toHaveLength(0);
    await expect(page.locator(".cat-row__grip")).toHaveCount(0);

    const childGroup = page.getByRole("list", { name: "「珠宝首饰」的下级分类" });
    const childRows = childGroup.locator(".cat-row--child:not(.cat-row--unclassified)");
    await sort.click();
    await childRows.filter({ hasText: "圆环形制" }).locator(".cat-row__grip").dragTo(
      childRows.filter({ hasText: "戒指" }), { targetPosition: { x: 48, y: 6 } },
    );
    await expect(childRows.first()).toContainText("圆环形制");
    await expect(pending).toBeVisible();
    await page.getByRole("button", { name: /取\s*消/ }).click();
    await expect(childRows.first()).toContainText("戒指");
    expect(writes).toHaveLength(0);

    await sort.press("Enter");
    await page.getByRole("button", { name: "上移「摆件」" }).press("Enter");
    await save.click();
    await expect(page.getByText("顺序保存失败，已保留本次调整，请重试。")).toBeVisible();
    await expect(roots.first()).toContainText("摆件");
    await expect(pending).toBeVisible();
    await save.click();
    await expect(pending).toHaveCount(0);
    await expect(roots.first()).toContainText("摆件");
    await expect(allRoots.first()).toContainText("未分类");
    expect(writes).toEqual([
      { items: [{ id: 4, sortOrder: 1 }, { id: 1, sortOrder: 2 }] },
      { items: [{ id: 4, sortOrder: 1 }, { id: 1, sortOrder: 2 }] },
    ]);
  });

  test("删除有商品的分类后进入未分类，并可将商品重新归类（模拟 API）", async ({ page }) => {
    await authenticateCategoryEditor(page);
    let deleted = false;
    let currentCategoryId = 2;
    const writes: Array<{ path: string; query: string; body: unknown }> = [];
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const { pathname: path, search, searchParams } = new URL(request.url());
      if (path === "/api/auth/profile") return route.fallback();
      let data: unknown = {};
      if (request.method() === "DELETE" && path === "/api/categories/2") {
        writes.push({ path, query: search, body: request.postData() });
        deleted = true;
        currentCategoryId = uncategorized.id;
        data = { success: true, movedProductCount: 3, uncategorizedCategoryId: uncategorized.id };
      } else if (request.method() === "PUT" && path === "/api/products/102") {
        const body = request.postDataJSON();
        writes.push({ path, query: search, body });
        currentCategoryId = body.categoryId;
      } else if (path === "/api/categories/admin/tree") {
        const workingCount = Number(currentCategoryId === uncategorized.id);
        data = deleted ? [
          { ...categoryTree[0], children: categoryTree[0].children.filter((node) => node.id !== 2) },
          { ...uncategorized, _count: { products: 2 + workingCount, children: 0 }, manageableProductCount: workingCount },
        ] : categoryTree;
      } else if (path === "/api/products") {
        const list = Number(searchParams.get("categoryId")) === currentCategoryId
          ? [{ id: 102, name: "金戒指", code: "HC-102", categoryId: currentCategoryId, materialType: "GOLD_999", status: "DRAFT" }]
          : [];
        data = { list, total: list.length };
      }
      await route.fulfill({ json: { code: 200, data } });
    });

    await page.goto("/admin/categories?categoryId=2");
    await page.getByRole("button", { name: /^查看「戒指」的商品/ }).hover();
    await page.getByRole("button", { name: "编辑「戒指」" }).click();
    await page.getByRole("dialog", { name: "编辑款式" }).getByRole("button", { name: "删除分类" }).click();
    const confirm = page.getByRole("dialog", { name: "删除「戒指」？" });
    await expect(confirm.getByText(/3 件关联商品将自动移入「未分类」/)).toBeVisible();
    await expect(confirm.getByRole("combobox")).toHaveCount(0);
    expect(writes).toHaveLength(0);
    await confirm.getByRole("button", { name: "删除分类" }).click();

    await expect(page).toHaveURL(/categoryId=9$/);
    await expect(page.getByText("分类已删除，3 件商品已移入「未分类」")).toBeVisible();
    await expect(page.getByRole("button", { name: /^查看「戒指」的商品/ })).toHaveCount(0);
    const fallback = page.getByRole("region", { name: "未分类的商品" });
    const directory = page.getByRole("region", { name: "分类列表" });
    await expect(directory.locator(".cat-row--root").first()).toContainText("未分类");
    await expect(directory.getByRole("button", { name: "编辑「未分类」" })).toHaveCount(0);
    await expect(directory.getByRole("button", { name: "给「未分类」添加款式" })).toHaveCount(0);
    await expect(fallback.getByRole("link", { name: "查看此分类回收站" })).toHaveAttribute("href", /categoryId=9&status=ARCHIVED/);
    await expect(fallback.getByRole("button", { name: /查看商品「金戒指」/ })).toBeVisible();

    await fallback.getByRole("button", { name: "批量改分类" }).click();
    await fallback.getByRole("checkbox", { name: "选择本页可移动商品" }).check();
    await fallback.getByRole("button", { name: "选择目标分类" }).click();
    const move = page.getByRole("dialog", { name: "批量改分类" });
    await move.getByRole("combobox", { name: "目标分类" }).press("ArrowDown");
    await page.locator(".ant-select-dropdown:visible").getByText("珠宝首饰", { exact: true }).click();
    await move.getByRole("button", { name: "确认移动 1 件" }).click();
    await expect(directory.getByRole("button", { name: /^查看「未分类」的商品/ })).toHaveCount(0);
    await expect(page).toHaveURL(/categoryId=1$/);
    await expect(page.getByRole("region", { name: "珠宝首饰的商品" }).getByText("金戒指", { exact: true })).toBeVisible();
    expect(writes).toEqual([
      { path: "/api/categories/2", query: "", body: null },
      { path: "/api/products/102", query: "", body: { categoryId: 1, expectedCategoryId: uncategorized.id } },
    ]);
  });

  test("批量改分类确认后提交原分类，部分失败只保留失败商品", async ({ page }) => {
    await authenticateCategoryEditor(page);
    const products = [
      { id: 101, name: "金戒甲", code: "HC-101" },
      { id: 102, name: "金戒乙", code: "HC-102" },
      { id: 103, name: "审核中的金戒", code: "HC-103", reviewStatus: "IN_REVIEW" },
    ].map((product) => ({ ...product, categoryId: 1, materialType: "GOLD_999", status: "DRAFT" }));
    const writes: Array<{ id: number; body: unknown }> = [];
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === "/api/auth/profile") return route.fallback();
      if (request.method() === "PUT" && path.startsWith("/api/products/")) {
        const id = Number(path.split("/").at(-1));
        writes.push({ id, body: request.postDataJSON() });
        if (id === 102) return route.fulfill({ status: 409, json: { message: "分类已变更" } });
        products[0].categoryId = 2;
      }
      const data = path === "/api/categories/admin/tree" ? categoryTree
        : path === "/api/products" ? { list: products, total: products.length } : {};
      await route.fulfill({ json: { code: 200, data } });
    });
    await page.goto("/admin/categories");
    const preview = page.getByRole("region", { name: "珠宝首饰的商品" });
    const startBatch = preview.getByRole("button", { name: "批量改分类" });
    const switchToRing = page.getByRole("button", { name: /^查看「戒指」的商品/ });
    const confirmSwitch = page.getByRole("dialog", { name: "切换分类并清空选择？" });
    await startBatch.click();
    const first = page.getByRole("checkbox", { name: /选择商品「金戒甲」/ });
    const second = page.getByRole("checkbox", { name: /选择商品「金戒乙」/ });
    await page.getByRole("listitem").filter({ has: first }).locator(".cat-product__media").click();
    await expect(first).toBeChecked();
    await page.getByText("金戒甲", { exact: true }).click();
    await expect(first).not.toBeChecked();
    await first.click();
    await expect(first).toBeChecked();
    await second.press("Space");
    await expect(second).toBeChecked();
    const locked = page.getByRole("checkbox", { name: /选择商品「审核中的金戒」/ });
    await expect(locked).toBeDisabled();
    await page.getByText("审核中的金戒", { exact: true }).click({ force: true });
    await expect(locked).not.toBeChecked();
    await expect(page.getByText("已选 2 件")).toBeVisible();
    await switchToRing.click();
    await expect(confirmSwitch.getByText("已选 2 件商品。切换后将清空本次选择。")).toBeVisible();
    await confirmSwitch.getByRole("button", { name: "保留当前选择" }).click();
    await expect(first).toBeChecked();
    await expect(second).toBeChecked();
    await switchToRing.click();
    await confirmSwitch.getByRole("button", { name: "清空并切换" }).click();
    await expect(page.getByRole("heading", { name: "戒指的商品" })).toBeVisible();
    expect(writes).toHaveLength(0);
    await page.getByRole("button", { name: /^查看「珠宝首饰」的商品/ }).click();
    await startBatch.click();
    await expect(preview.getByText("已选 0 件")).toBeVisible();
    await preview.getByRole("checkbox", { name: "选择本页可移动商品" }).check();
    await page.getByRole("button", { name: "选择目标分类" }).click();
    const dialog = page.getByRole("dialog", { name: "批量改分类" });
    await dialog.getByRole("combobox", { name: "目标分类" }).press("ArrowDown");
    await page.locator(".ant-select-dropdown:visible").getByText("珠宝首饰 / 戒指", { exact: true }).click();
    expect(writes).toHaveLength(0);
    await dialog.getByRole("button", { name: "确认移动 2 件" }).click();
    await expect(dialog.getByText("1 件未移动，已保留选择。")).toBeVisible();
    await expect(dialog.getByText("金戒甲", { exact: true })).toHaveCount(0);
    await expect(dialog.getByText("金戒乙", { exact: true })).toBeVisible();
    expect(writes.sort((a, b) => a.id - b.id)).toEqual([
      { id: 101, body: { categoryId: 2, expectedCategoryId: 1 } },
      { id: 102, body: { categoryId: 2, expectedCategoryId: 1 } },
    ]);
  });
});

test.describe("分类目录触屏交互", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("点选分类后才显示该行的编辑入口（模拟 API）", async ({ page }) => {
    await authenticateCategoryEditor(page);
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/auth/profile") return route.fallback();
      const data = path === "/api/categories/admin/tree" ? categoryTree
        : path === "/api/products" ? { list: [], total: 0 } : {};
      await route.fulfill({ json: { code: 200, data } });
    });

    await page.goto("/admin/categories");
    const directory = page.getByRole("region", { name: "分类列表" });
    const rootEdit = directory.getByRole("button", { name: "编辑「珠宝首饰」" });
    const ringEdit = directory.getByRole("button", { name: "编辑「戒指」" });
    const parentRow = directory.getByRole("button", { name: /^查看「珠宝首饰」的商品/ });
    const parentCount = parentRow.getByText("2 件", { exact: true });
    const styleCount = directory.getByRole("button", { name: /^查看「戒指」的商品/ }).getByText("1 件", { exact: true });
    expect((await inlineEdges(parentCount, styleCount)).endOffset).toBeCloseTo(0);
    await expect(rootEdit).toHaveCSS("opacity", "1");
    await expect(ringEdit).toHaveCSS("opacity", "0");
    await directory.getByRole("button", { name: /^查看「戒指」的商品/ }).tap();
    await expect(rootEdit).toHaveCSS("opacity", "0");
    await expect(ringEdit).toHaveCSS("opacity", "1");
    await expect(ringEdit).toHaveCSS("width", "44px");
    await expect(ringEdit).toHaveCSS("height", "44px");
    await ringEdit.tap();
    const edit = page.getByRole("dialog", { name: "编辑款式" });
    await expect(edit.getByLabel("分类名称")).toHaveValue("戒指");
    await page.keyboard.press("Escape");
    await expect(edit).toBeHidden();
    await expect(directory.locator(".cat-row__grip").first()).toBeHidden();
    await directory.getByRole("button", { name: "调整选款中心顺序" }).tap();
    await directory.getByRole("button", { name: "上移「圆环形制」" }).tap();
    const childSelections = directory.getByRole("list", { name: "「珠宝首饰」的下级分类" }).getByRole("button", { name: /^查看/ });
    await expect(childSelections.first()).toHaveAccessibleName(/^查看「珠宝首饰 \/ 未分类」/);
    await expect(childSelections.nth(1)).toHaveAccessibleName(/^查看「圆环形制」/);
    await directory.getByRole("button", { name: /取\s*消/ }).tap();
    await page.setViewportSize({ width: 320, height: 844 });
    await expect.poll(() => directory.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await directory.getByRole("button", { name: "新建分类" }).tap();
    const createDialog = page.getByRole("dialog", { name: "新建分类" });
    await createDialog.getByText("新建款式", { exact: true }).tap();
    await expect(createDialog.getByRole("combobox", { name: "所属品类" })).toBeVisible();
    await expect(createDialog.getByRole("button", { name: /保\s*存/ })).toBeInViewport();
    await expect.poll(() => createDialog.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return box.left >= 0 && box.right <= window.innerWidth && element.scrollWidth <= element.clientWidth;
    })).toBe(true);
  });
});
