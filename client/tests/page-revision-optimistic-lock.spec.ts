import { expect, test, type Page } from "@playwright/test";
import { installAdminSession } from "./fixtures/session-auth";
import {
  PAGE_TEMPLATE_FIXTURE_ID,
  PAGE_TEMPLATE_FIXTURE_NAME,
  PAGE_TEMPLATE_FIXTURE_VERSION,
  publishedPageTemplateCatalog,
} from "./fixtures/template-catalog";

const useMock = process.env.VITE_USE_MOCK === "true";
const CURRENT_UPDATED_AT = "2026-08-23T08:00:00.000Z";

async function authenticateAdmin(page: Page) {
  await installAdminSession(page, {
    username: "page-revision-lock-admin",
    realName: "历史恢复测试管理员",
  });
}

function ok(data: unknown) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ code: 200, data, message: "success" }),
  };
}

test.describe("页面历史版本载入与保存乐观锁", () => {
  test.skip(useMock, "该用例通过 HTTP 拦截验证真实 API payload 与 409 语义");

  test("历史载入零写入，后续保存携带当前 updatedAt 且陈旧冲突不覆盖画布", async ({
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
    const savePayloads: Array<Record<string, unknown>> = [];
    const catalog = publishedPageTemplateCatalog();

    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === "/api/auth/profile") return route.fallback();
      if (path === "/api/page-modules/dynamic-templates/catalog") {
        return route.fulfill(ok(catalog));
      }
      if (path === "/api/page-modules/document" && request.method() === "PUT") {
        savePayloads.push(request.postDataJSON());
        return route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            code: 409,
            message:
              "该页面已被其他编辑者更新，请重新加载后再保存",
          }),
        });
      }
      if (path === "/api/page-modules/document/revisions/1") {
        return route.fulfill(ok(revision));
      }
      if (path === "/api/page-modules/document/revisions") {
        const { puckData: _puckData, metadata: _metadata, ...summary } = revision;
        return route.fulfill(ok({ items: [summary], nextBeforeVersion: null }));
      }
      if (
        path === "/api/page-modules/document/published"
        || path === "/api/page-modules/document/published/admin"
      ) {
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

    const expandLibrary = page.getByRole("button", { name: "展开模板组件库" });
    if (await expandLibrary.isVisible()) await expandLibrary.click();

    const appointmentCard = page.locator(
      `.homepage-editor__template-card[data-template-name="${PAGE_TEMPLATE_FIXTURE_ID}"]`,
    );
    await expect(appointmentCard.evaluate((element) => element.tagName)).resolves.toBe(
      "ARTICLE",
    );
    const appointmentPreviewButton = appointmentCard.getByRole("button", {
      name: `预览${PAGE_TEMPLATE_FIXTURE_NAME}版本${PAGE_TEMPLATE_FIXTURE_VERSION}`,
    });
    const appointmentAddButton = appointmentCard.getByRole("button", {
      name: `添加到页面：${PAGE_TEMPLATE_FIXTURE_NAME} v${PAGE_TEMPLATE_FIXTURE_VERSION}`,
    });
    await expect(appointmentPreviewButton).toHaveAttribute("draggable", "true");
    await expect(appointmentAddButton).toBeEnabled();
    await appointmentAddButton.click();
    await expect(page.getByText(
      `已添加“${PAGE_TEMPLATE_FIXTURE_NAME}”v${PAGE_TEMPLATE_FIXTURE_VERSION}，可在右侧填写页面内容`,
    )).toBeVisible();
    await expect(page.locator(".homepage-editor__layer-item")).toHaveCount(1);
    await expect(appointmentCard.locator(".homepage-editor__template-footer")).toHaveCount(0);

    await page.getByRole("button", { name: "更多编辑操作" }).click();
    await page.getByRole("menuitem", { name: "发布历史" }).click();
    const drawer = page.getByRole("dialog", { name: "页面发布历史" });
    await expect(drawer.getByText("版本 1", { exact: true })).toBeVisible();
    await drawer.getByRole("button", { name: /版本 1/ }).click();
    await expect(drawer.getByRole("region", { name: "页面版本详情" }))
      .toContainText("相对当前内存草稿");
    await drawer.getByRole("button", { name: "载入当前草稿" }).click();

    const confirm = page.getByRole("dialog", { name: "载入版本 1 到当前草稿？" });
    await expect(confirm).toBeVisible();
    expect(consoleErrors, "编辑器交互与载入确认阶段 console error 应为 0").toEqual([]);
    expect(
      consoleWarnings.filter(
        (warning) => !warning.includes("setData") || !warning.includes("expensive"),
      ),
      "仅允许已确认的 Puck setData expensive 第三方提示",
    ).toEqual([]);
    consoleErrors.length = 0;
    consoleWarnings.length = 0;
    await confirm.getByRole("button", { name: "载入当前草稿" }).click();
    expect(savePayloads).toHaveLength(0);
    await page.getByRole("button", { name: "保存当前装修草稿" }).click();

    await expect.poll(() => savePayloads.length).toBe(1);
    expect(savePayloads[0]).toMatchObject({
      pageKey: "home",
      expectedUpdatedAt: CURRENT_UPDATED_AT,
      metadata: { seoTitle: "历史版本" },
    });
    const conflict = page.getByRole("dialog", { name: "检测到其他人更新了这份整页草稿" });
    await expect(conflict).toContainText("当前页面设置与画布修改仍完整保留");
    await expect(page.getByText(
      "该页面已被其他编辑者更新，请重新加载后再保存",
    )).toHaveCount(0);
    await expect(drawer).toHaveCount(0);
    await conflict.getByRole("button", { name: "保留本地修改" }).click();

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

  test("线上回滚只发送 revision 指针切换，草稿与历史快照保持不变", async ({ page }) => {
    await authenticateAdmin(page);
    const catalog = publishedPageTemplateCatalog();
    const draftPuckData = {
      content: [{ type: "首屏主视觉", props: { id: "draft", title: "未发布草稿" } }],
      root: { props: {} },
    };
    const revision37 = {
      id: 37,
      documentId: 7,
      version: 37,
      puckData: {
        content: [{ type: "首屏主视觉", props: { id: "v37", title: "线上版本 37" } }],
        root: { props: {} },
      },
      metadata: { seoTitle: "版本 37" },
      status: "published",
      publishedAt: "2026-08-22T07:00:00.000Z",
      createdAt: "2026-08-22T07:00:00.000Z",
      isPublished: false,
    };
    const revision39 = {
      id: 39,
      documentId: 7,
      version: 39,
      puckData: {
        content: [{ type: "首屏主视觉", props: { id: "v39", title: "线上版本 39" } }],
        root: { props: {} },
      },
      metadata: { seoTitle: "版本 39" },
      status: "published",
      publishedAt: "2026-08-23T07:00:00.000Z",
      createdAt: "2026-08-23T07:00:00.000Z",
      isPublished: true,
    };
    let publishedRevisionId = 39;
    const rollbackPayloads: Array<Record<string, unknown>> = [];
    const unexpectedWrites: string[] = [];
    const draftDocument = {
      id: 7,
      pageKey: "home",
      puckData: draftPuckData,
      metadata: { seoTitle: "未发布草稿" },
      editorVersion: "0.22.4",
      status: "DRAFT",
      version: 40,
      publishedRevisionId,
      updatedAt: CURRENT_UPDATED_AT,
    };
    const publishedDocument = () => {
      const revision = publishedRevisionId === 37 ? revision37 : revision39;
      return {
        ...draftDocument,
        puckData: revision.puckData,
        metadata: revision.metadata,
        status: "PUBLISHED",
        version: revision.version,
        publishedRevisionId,
        publishedAt: revision.publishedAt,
        updatedAt: revision.publishedAt,
      };
    };

    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === "/api/auth/profile") return route.fallback();
      if (path === "/api/page-modules/dynamic-templates/catalog") {
        return route.fulfill(ok(catalog));
      }
      if (
        path === "/api/page-modules/document/revisions/37/rollback-publication"
        && request.method() === "PUT"
      ) {
        rollbackPayloads.push(request.postDataJSON());
        publishedRevisionId = 37;
        return route.fulfill(ok({
          ...draftDocument,
          publishedRevisionId,
          updatedAt: "2026-08-23T08:01:00.000Z",
        }));
      }
      if (path === "/api/page-modules/document/revisions/37") {
        return route.fulfill(ok({ ...revision37, isPublished: publishedRevisionId === 37 }));
      }
      if (path === "/api/page-modules/document/revisions/39") {
        return route.fulfill(ok({ ...revision39, isPublished: publishedRevisionId === 39 }));
      }
      if (path === "/api/page-modules/document/revisions") {
        const summary = (revision: typeof revision37) => {
          const { puckData: _puckData, metadata: _metadata, ...item } = revision;
          return { ...item, isPublished: publishedRevisionId === revision.id };
        };
        return route.fulfill(ok({
          items: [summary(revision39), summary(revision37)],
          nextBeforeVersion: null,
        }));
      }
      if (path === "/api/page-modules/document/published/admin") {
        return route.fulfill(ok(publishedDocument()));
      }
      if (path === "/api/page-modules/document/published") {
        return route.fulfill(ok(publishedDocument()));
      }
      if (path === "/api/page-modules/document/admin") {
        return route.fulfill(ok({ ...draftDocument, publishedRevisionId }));
      }
      if (path === "/api/page-modules/document/validate") {
        return route.fulfill(ok({ valid: true, errors: [], issues: [] }));
      }
      if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) {
        unexpectedWrites.push(`${request.method()} ${path}`);
      }
      return route.fulfill(ok({ list: [], total: 0 }));
    });

    await page.goto("/admin/editor/home");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
    await page.getByRole("button", { name: "更多编辑操作" }).click();
    await page.getByRole("menuitem", { name: "发布历史" }).click();
    const drawer = page.getByRole("dialog", { name: "页面发布历史" });
    const version37 = drawer.locator(".homepage-editor__revision-item", {
      hasText: "版本 37",
    });
    await expect(version37.getByText("当前线上版本")).toHaveCount(0);
    await version37.getByRole("button", { name: "回滚线上" }).click();
    const confirmation = page.getByRole("dialog", { name: "回滚线上到版本 37？" });
    await expect(confirmation).toContainText("不会覆盖当前页面草稿");
    await confirmation.getByRole("button", { name: "确认回滚线上" }).click();

    await expect(page.getByText("线上页面已回滚到版本 37；当前草稿保持不变")).toBeVisible();
    await expect(version37.getByText("当前线上版本")).toBeVisible();
    expect(rollbackPayloads).toEqual([{
      pageKey: "home",
      locale: "zh-CN",
      expectedPublishedRevisionId: 39,
    }]);
    expect(unexpectedWrites).toEqual([]);
    expect(draftDocument.puckData).toEqual(draftPuckData);
    expect(revision39.puckData.content[0].props.title).toBe("线上版本 39");
  });
});
