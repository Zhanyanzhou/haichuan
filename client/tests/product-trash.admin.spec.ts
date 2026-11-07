import { expect, test, type Page } from "@playwright/test";
import { installAdminSession, type TestAdminRole } from "./fixtures/session-auth";

const products = [
  { id: 11, name: "可删除的归档草稿" },
  { id: 12, name: "有库存记录的归档商品" },
  { id: 13, name: "被页面引用的归档商品" },
].map((product) => ({
  ...product,
  code: `TRASH-FIXTURE-${product.id}`,
  status: "ARCHIVED",
  salesMode: "DISPLAY_ONLY",
  materialType: "GOLD_999",
  totalStock: product.id === 12 ? 7 : 0,
  images: [],
  skus: [],
}));

async function installTrashFixture(
  page: Page,
  role: TestAdminRole,
  initialProducts = products,
  { waitForDelete, restoreBeforeDeleteId, restoreAttempts }: {
    waitForDelete?: Promise<void>;
    restoreBeforeDeleteId?: number;
    restoreAttempts?: number[];
  } = {},
) {
  let archived = [...initialProducts];
  let restored: (typeof products)[number] | undefined;
  const attemptedIds: number[] = [];

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const match = url.pathname.match(/^\/api\/products\/(\d+)\/permanent$/);
    const restoreMatch = url.pathname.match(/^\/api\/products\/(\d+)\/restore$/);

    if (restoreMatch && request.method() === "PUT") {
      const id = Number(restoreMatch[1]);
      restoreAttempts?.push(id);
      if (id === 12) return route.fulfill({ status: 409, json: { code: 409 } });
      const product = archived.find((item) => item.id === id);
      if (!product) return route.fulfill({ status: 404, json: { code: 404 } });
      archived = archived.filter((item) => item.id !== id);
      restored = { ...product, status: "DRAFT" };
      return route.fulfill({ json: { code: 200, data: restored } });
    }

    if (match && request.method() === "DELETE") {
      const id = Number(match[1]);
      attemptedIds.push(id);
      if (waitForDelete) await waitForDelete;
      const product = archived.find((item) => item.id === id);
      archived = archived.filter((item) => item.id !== id);
      if (product && id === restoreBeforeDeleteId) {
        restored = { ...product, status: "DRAFT" };
        return route.fulfill({
          status: 409,
          json: {
            code: 409,
            errorCode: "PRODUCT_PERMANENT_DELETE_NOT_ARCHIVED",
            message: "服务端异常正文不应直接展示",
          },
        });
      }
      return route.fulfill({ json: { code: 200, data: { id } } });
    }

    let data: unknown = {};
    if (url.pathname === "/api/products") {
      const currentPage = Number(url.searchParams.get("page") ?? "1");
      const pageSize = Number(url.searchParams.get("pageSize") ?? "20");
      const start = (currentPage - 1) * pageSize;
      const status = url.searchParams.get("status");
      const list = status === "ARCHIVED" ? archived : (!status || status === "DRAFT") && restored ? [restored] : [];
      data = { list: list.slice(start, start + pageSize), total: list.length };
    } else if (url.pathname === "/api/products/counts") {
      data = { all: restored ? 1 : 0, PUBLISHED: 0, OFFLINE: 0, DRAFT: restored ? 1 : 0, ARCHIVED: archived.length };
    } else if (url.pathname === "/api/categories/admin/tree") {
      data = [];
    }
    await route.fulfill({ json: { code: 200, data } });
  });
  await installAdminSession(page, { role });
  return attemptedIds;
}

test.describe("商品回收站永久删除界面（API 夹具）", () => {
  test.skip(process.env.VITE_USE_MOCK === "true", "通过路由夹具拦截实际请求路径");

  test("单件取消不发请求，确认后刷新列表和回收站计数", async ({ page }) => {
    const attemptedIds = await installTrashFixture(page, "SUPER_ADMIN");
    await page.goto("/admin/products?status=ARCHIVED");
    const remove = page.getByRole("button", { name: "永久删除「可删除的归档草稿」" });
    const dialog = page.getByRole("dialog");

    await remove.click();
    const consequences = dialog.getByText(/商品会从商品列表和回收站移除，无法恢复/);
    await expect(consequences).toContainText("订单、库存等业务记录会保留");
    await expect(consequences).toContainText("引用该商品的页面区块可能不再展示它");
    await dialog.getByRole("button", { name: /^取\s*消$/ }).click();
    await expect(dialog).toHaveCount(0);
    expect(attemptedIds).toEqual([]);

    await remove.click();
    await dialog.getByRole("button", { name: "永久删除", exact: true }).click();
    await expect(remove).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "回收站（2）" })).toBeVisible();
    await expect(page.getByText("「可删除的归档草稿」已永久删除。", { exact: true })).toBeVisible();
    expect(attemptedIds).toEqual([11]);
  });

  test("移动端可批量删除有关联的商品，状态已变化的商品单独提示", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const stale = { ...products[0], id: 14, code: "TRASH-FIXTURE-14", name: "由其他管理员恢复的商品" };
    const unselected = { ...products[0], id: 15, code: "TRASH-FIXTURE-15", name: "未勾选的归档商品" };
    const selected = [...products, stale];
    const attemptedIds = await installTrashFixture(page, "SUPER_ADMIN", [...selected, unselected], {
      restoreBeforeDeleteId: stale.id,
    });
    await page.goto("/admin/products?status=ARCHIVED");
    const batchRemove = page.getByRole("button", { name: "批量永久删除" });
    await expect(batchRemove).toBeDisabled();
    await expect(page.getByRole("button", { name: "更多批量操作" })).toHaveCount(0);

    for (const product of selected) {
      await page.getByRole("row").filter({ hasText: product.name }).getByRole("checkbox").check();
    }
    await batchRemove.click();
    const confirm = page.getByRole("dialog").filter({ hasText: "永久删除选中的 4 件商品？" });
    await expect(confirm.getByRole("list", { name: "勾选的商品" }).getByRole("listitem")).toHaveCount(4);
    await expect(confirm.getByText(unselected.name)).toHaveCount(0);
    await confirm.getByRole("button", { name: "永久删除", exact: true }).click();

    const result = page.getByRole("dialog").filter({ hasText: "已永久删除 3 件商品，1 件未完成" });
    await expect(result.getByText(`「${stale.name}」商品已不在回收站，请核对最新状态。`)).toBeVisible();
    await expect(result.getByText("服务端异常正文不应直接展示")).toHaveCount(0);
    await result.getByRole("button", { name: /^关\s*闭$/ }).click();
    for (const product of selected) {
      await expect(page.getByRole("row").filter({ hasText: product.name })).toHaveCount(0);
    }
    await expect(page.getByRole("row").filter({ hasText: unselected.name }).getByRole("checkbox")).not.toBeChecked();
    await expect(page.getByRole("tab", { name: "回收站（1）" })).toBeVisible();
    await page.getByRole("tab", { name: "草稿（1）" }).click();
    await expect(page.getByRole("row").filter({ hasText: stale.name })).toBeVisible();
    expect([...attemptedIds].sort()).toEqual([11, 12, 13, 14]);
  });

  test("删除最后一页的唯一商品后回到仍有商品的上一页", async ({ page }) => {
    const attemptedIds = await installTrashFixture(page, "SUPER_ADMIN", [products[1], products[0]]);
    await page.goto("/admin/products?status=ARCHIVED&page=2&pageSize=1");
    await page.getByRole("button", { name: "永久删除「可删除的归档草稿」" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "永久删除", exact: true }).click();
    await expect(page.getByRole("row").filter({ hasText: products[1].name })).toBeVisible();
    await expect(page.getByRole("tab", { name: "回收站（1）" })).toBeVisible();
    await expect(page).not.toHaveURL(/[?&]page=2(?:&|$)/);
    expect(attemptedIds).toEqual([11]);
  });

  test("确认后的会话发生变化时不再发送排队的永久删除请求", async ({ page }) => {
    let releaseDeletes!: () => void;
    const waitForDelete = new Promise<void>((resolve) => { releaseDeletes = resolve; });
    const archived = [...products, { ...products[0], id: 14, code: "TRASH-FIXTURE-14", name: "排队商品" }];
    const attemptedIds = await installTrashFixture(page, "SUPER_ADMIN", archived, { waitForDelete });
    await page.goto("/admin/products?status=ARCHIVED");
    await page.getByRole("columnheader").getByRole("checkbox").check();
    await page.getByRole("button", { name: "批量永久删除" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "永久删除", exact: true }).click();

    try {
      await expect.poll(() => attemptedIds.length).toBe(3);
      await page.evaluate(async () => {
        const authModule = "/src/store/authStore.ts";
        const { useAuthStore } = await import(authModule);
        const { user, setAuth } = useAuthStore.getState();
        if (!user) throw new Error("缺少测试管理员会话");
        setAuth({ ...user, id: 999 });
      });
    } finally {
      releaseDeletes();
    }

    await expect(dialog).toHaveCount(0);
    expect([...attemptedIds].sort()).toEqual([11, 12, 13]);
  });

  test("普通管理员批量恢复为草稿，保留失败项且没有永久删除入口", async ({ page }) => {
    const restoreAttempts: number[] = [];
    const attemptedIds = await installTrashFixture(page, "ADMIN", products, { restoreAttempts });
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto("/admin/products?status=ARCHIVED");
    const row = page.getByRole("row").filter({ hasText: products[0].name });
    await expect(row.getByRole("button", { name: "查看", exact: true })).toBeVisible();
    await expect(row.getByRole("button", { name: "恢复草稿", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /永久删除|更多批量操作/ })).toHaveCount(0);
    const batchRestore = page.getByRole("button", { name: "批量恢复草稿" });
    await expect(batchRestore).toBeDisabled();
    const rowCheckbox = (name: string) => page.getByRole("row").filter({ hasText: name }).getByRole("checkbox");
    await rowCheckbox(products[0].name).check();
    await rowCheckbox(products[1].name).check();
    await batchRestore.click();
    const confirmation = page.getByRole("dialog", { name: "恢复选中的 2 件商品为草稿？" });
    await expect(confirmation.getByText("恢复后可重新编辑，商品不会自动上架。")).toBeVisible();
    await confirmation.getByRole("button", { name: /^取\s*消$/ }).click();
    await expect(confirmation).toHaveCount(0);
    expect(restoreAttempts).toEqual([]);

    await batchRestore.click();
    await confirmation.getByRole("button", { name: "恢复 2 件商品" }).click();
    const result = page.getByRole("dialog", { name: "已恢复 1 件商品，1 件未恢复" });
    await expect(result.getByText(new RegExp(products[1].name))).toBeVisible();
    await result.getByRole("button", { name: /^关\s*闭$/ }).click();
    await expect(row).toHaveCount(0);
    await expect(rowCheckbox(products[1].name)).toBeChecked();
    await expect(rowCheckbox(products[2].name)).not.toBeChecked();
    await page.getByRole("tab", { name: /草稿/ }).click();
    await expect(row).toBeVisible();
    expect(restoreAttempts.sort()).toEqual([11, 12]);
    expect(attemptedIds).toEqual([]);
  });
});
