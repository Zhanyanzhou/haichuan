import { expect, test, type Page } from "@playwright/test";

const useMock = process.env.VITE_USE_MOCK === "true";
const CURRENT_UPDATED_AT = "2026-08-23T08:00:00.000Z";

async function authenticateAdmin(page: Page) {
  await page.addInitScript(() => {
    const token = "page-revision-lock-token";
    localStorage.setItem("token", token);
    localStorage.setItem(
      "jewelry-auth",
      JSON.stringify({
        state: {
          token,
          user: {
            id: 1,
            username: "page-revision-lock-admin",
            realName: "历史恢复测试管理员",
            role: "SUPER_ADMIN",
          },
          isLoggedIn: true,
        },
        version: 0,
      }),
    );
  });
}

function ok(data: unknown) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ code: 200, data, message: "success" }),
  };
}

test.describe("页面历史版本恢复乐观锁", () => {
  test.skip(useMock, "该用例通过 HTTP 拦截验证真实 API payload 与 409 语义");

  test("恢复请求携带当前 updatedAt，陈旧冲突明确提示且不覆盖画布", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const consoleWarnings: string[] = [];
    page.on("console", (entry) => {
      const text = entry.text();
      const isExpectedDevServerNoise = text.includes("WebSocket connection")
        || text.includes("[vite] failed to connect to websocket")
        || text.includes("Failed to send error to Vite server");
      if (entry.type() === "error" && !isExpectedDevServerNoise) {
        consoleErrors.push(text);
      }
      if (entry.type() === "warning") consoleWarnings.push(text);
    });
    await authenticateAdmin(page);
    const puckData = {
      content: [],
      root: { props: {} },
    };
    const currentDocument = {
      id: 7,
      pageKey: "home",
      puckData,
      metadata: { seoTitle: "当前草稿" },
      editorVersion: "0.22.4",
      status: "DRAFT",
      version: 2,
      updatedAt: CURRENT_UPDATED_AT,
    };
    const revision = {
      id: 12,
      version: 1,
      puckData,
      metadata: { seoTitle: "历史版本" },
      status: "published",
      publishedAt: "2026-08-22T08:00:00.000Z",
      createdAt: "2026-08-22T08:00:00.000Z",
    };
    const restorePayloads: Array<Record<string, unknown>> = [];

    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (
        path === "/api/page-modules/document/revisions/1/restore" &&
        request.method() === "PUT"
      ) {
        restorePayloads.push(request.postDataJSON());
        return route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            code: 409,
            message:
              "该页面已被其他编辑者更新，请重新加载版本记录后再恢复",
          }),
        });
      }
      if (path === "/api/page-modules/document/revisions") {
        return route.fulfill(ok([revision]));
      }
      if (path === "/api/page-modules/document/published") {
        return route.fulfill(ok(currentDocument));
      }
      if (path === "/api/page-modules/document/admin") {
        return route.fulfill(ok(currentDocument));
      }
      if (path === "/api/page-modules/document/validate") {
        return route.fulfill(ok({ valid: true, errors: [], issues: [] }));
      }
      return route.fulfill(ok({ list: [], total: 0 }));
    });

    await page.goto("/admin/editor/home");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();

    const appointmentCard = page.locator(
      '.homepage-editor__template-card[data-template-name="预约入口"]',
    );
    await expect(appointmentCard).toHaveAttribute("role", "button");
    await expect(appointmentCard).toHaveAttribute("tabindex", "0");
    await expect(appointmentCard.evaluate((element) => element.tagName)).resolves.toBe(
      "ARTICLE",
    );
    await expect(
      appointmentCard.locator('[data-content-template-preview="booking"]'),
    ).toHaveCount(1);
    await expect(appointmentCard.getByRole("button")).toHaveCount(0);

    await appointmentCard.focus();
    await expect(appointmentCard).toBeFocused();
    await expect
      .poll(() => appointmentCard.evaluate((element) => getComputedStyle(element).outlineStyle))
      .not.toBe("none");
    await appointmentCard.press("Enter");
    await expect(page.getByText("已插入“预约入口”，可在右侧继续编辑")).toBeVisible();
    await expect(page.locator(".homepage-editor__layer-item")).toHaveCount(1);
    await expect(appointmentCard.locator(".homepage-editor__template-usage")).toHaveText(
      "已添加 1 / 3",
    );
    await expect(appointmentCard).not.toHaveAttribute("aria-disabled", "true");
    await expect(appointmentCard).toHaveAttribute("tabindex", "0");

    await page.getByRole("button", { name: "更多编辑操作" }).click();
    await page.getByRole("menuitem", { name: "发布历史" }).click();
    const drawer = page.getByRole("dialog", { name: "发布版本" });
    await expect(drawer.getByText("版本 1", { exact: true })).toBeVisible();
    await drawer.getByRole("button", { name: "恢复到草稿" }).click();

    const confirm = page.getByRole("dialog", { name: "恢复版本 1？" });
    await expect(confirm).toBeVisible();
    expect(consoleErrors, "编辑器交互与恢复确认阶段 console error 应为 0").toEqual([]);
    expect(
      consoleWarnings.filter(
        (warning) => !warning.includes("setData") || !warning.includes("expensive"),
      ),
      "仅允许已确认的 Puck setData expensive 第三方提示",
    ).toEqual([]);
    consoleErrors.length = 0;
    consoleWarnings.length = 0;
    await confirm.getByRole("button", { name: "恢复到草稿" }).click();

    await expect.poll(() => restorePayloads.length).toBe(1);
    expect(restorePayloads[0]).toEqual({
      pageKey: "home",
      expectedUpdatedAt: CURRENT_UPDATED_AT,
    });
    await expect(
      page.getByText(
        "该页面已被其他编辑者更新，请重新加载版本记录后再恢复",
      ),
    ).toBeVisible();
    await expect(drawer).toBeVisible();

    expect(consoleErrors).toEqual([
      "Failed to load resource: the server responded with a status of 409 (Conflict)",
    ]);
    expect(
      consoleWarnings.filter(
        (warning) => !warning.includes("setData") || !warning.includes("expensive"),
      ),
      "仅允许已确认的 Puck setData expensive 第三方提示",
    ).toEqual([]);
  });
});
