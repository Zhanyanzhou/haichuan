import { expect, test, type Page } from "@playwright/test";
import { installAdminSession } from "./fixtures/session-auth";

/**
 * 店铺装修 —— 草稿恢复与继续编辑回归测试
 *
 * 覆盖：保存草稿后重新进入编辑器默认加载最新草稿（而非线上版本）；
 * 「查看线上版本 / 继续编辑草稿 / 放弃草稿」的完整状态流转。
 *
 * 运行方式（需预先录制已登录的 admin 会话快照）：
 *   $env:PLAYWRIGHT_ADMIN_STORAGE_STATE="tests/.auth/admin.json"
 *   npx playwright test editor-draft-recovery --project=admin-chromium
 *
 * 说明：本测试通过 page.route 注入「已发布版本 P + 与 P 不同的草稿 D」，
 * 断言编辑器的草稿状态机，不依赖真实业务数据；仅为前端流程回归。
 */

const useMock = process.env.VITE_USE_MOCK === "true";
const API_PREFIX = "**/api/**";

async function authenticateAdmin(page: Page) {
  await installAdminSession(page, {
    username: "editor-draft-test-admin",
    realName: "草稿回归管理员",
  });
}

async function selectHeroTitleInput(page: Page) {
  const inspector = page.getByRole("region", { name: "属性面板" });
  const input = inspector.getByRole("textbox", {
    name: "主标题",
    exact: true,
  });
  await expect(input).toBeVisible();
  return input;
}

async function readPageSeoTitle(page: Page) {
  await page.getByRole("button", { name: "更多编辑操作" }).click();
  await page.getByRole("menuitem", { name: "页面设置" }).click();
  const drawer = page.getByRole("dialog", { name: "页面展示设置" });
  const input = drawer.locator('[data-page-settings-field="seoTitle"] input');
  await expect(input).toBeVisible();
  const value = await input.inputValue();
  await drawer.locator(".ant-drawer-close").click();
  await expect(drawer).toBeHidden();
  return value;
}

const heroBlock = {
  type: "首屏主视觉",
  props: {
    id: "draft-hero",
    title: "草稿标题",
    subtitle: "草稿副标题",
    desktopImage: "/svg/template-hero.svg",
    mobileImage: "/svg/template-hero.svg",
    altText: "草稿测试图",
  },
};

const versionedMediaTemplateId = "tpl_draft_media";

function createVersionedMediaDefinition(version: 1 | 2) {
  return {
    schemaVersion: 1,
    templateId: versionedMediaTemplateId,
    name: `草稿媒体模板 v${version}`,
    description: `用于验证页面设置恢复精确模板版本 ${version}`,
    metadata: {
      category: "品牌展示",
      purpose: "草稿媒体授权回归",
      layoutType: "单图展示",
      slotSummary: "1 个图片槽位",
      recommendedFor: ["home"],
      desktopRatio: "4:3",
      mobileRatio: "4:3",
      visualRole: "support-stage",
      headerCompatibility: ["solid"],
      tags: ["draft-recovery"],
    },
    rootNodeId: "node_root",
    nodes: {
      node_root: {
        nodeId: "node_root",
        type: "Section",
        name: "模板根节点",
        childIds: ["node_container"],
        props: { semanticTag: "section" },
        responsive: {
          desktop: {
            display: "block",
            order: 0,
            width: "fill",
            height: { mode: "auto" },
          },
          mobile: {
            display: "block",
            order: 0,
            width: "fill",
            height: { mode: "auto" },
          },
        },
        hidden: false,
      },
      node_container: {
        nodeId: "node_container",
        type: "Container",
        name: "图片容器",
        childIds: ["node_image"],
        props: {},
        responsive: {
          desktop: {
            display: "block",
            order: 0,
            width: "fill",
            height: { mode: "auto" },
          },
          mobile: {
            display: "block",
            order: 0,
            width: "fill",
            height: { mode: "auto" },
          },
        },
        hidden: false,
      },
      node_image: {
        nodeId: "node_image",
        type: "ImageSlot",
        name: "主图",
        slotId: "slot_image",
        childIds: [],
        props: {},
        instanceEditPolicy: {
          position: true,
          size: true,
          zIndex: true,
          imageFit: true,
          imageFocus: true,
          minWidthPercent: 50,
          maxWidthPercent: 120,
          maxOffsetPercent: 20,
        },
        responsive: {
          desktop: {
            display: "block",
            order: 0,
            width: "fill",
            height: { mode: "aspect-ratio", ratio: { width: 4, height: 3 } },
          },
          mobile: {
            display: "block",
            order: 0,
            width: "fill",
            height: { mode: "aspect-ratio", ratio: { width: 4, height: 3 } },
          },
        },
        hidden: false,
      },
    },
    slots: {
      slot_image: {
        slotId: "slot_image",
        key: "mainImage",
        type: "image",
        label: "主图",
        required: true,
        editable: true,
        hideable: false,
        validation: { recommendedWidth: 1200, recommendedHeight: 900 },
        desktopRules: {
          aspectRatio: "4:3",
          objectFit: "cover",
          objectPosition: "center center",
        },
        mobileRules: {
          aspectRatio: "4:3",
          objectFit: "cover",
          objectPosition: "center center",
        },
      },
    },
    defaultContent: {
      slot_image: { src: `/uploads/template-v${version}.jpg`, alt: `模板版本 ${version}` },
    },
  };
}

function createVersionedMediaPuckData(version: 1 | 2, assetUrl: string) {
  const definition = createVersionedMediaDefinition(version);
  return {
    content: [{
      type: "动态模板实例",
      props: {
        id: `dynamic-media-block-v${version}`,
        instanceSchemaVersion: 1,
        instanceId: `dynamic-media-instance-v${version}`,
        templateId: versionedMediaTemplateId,
        templateVersion: version,
        moduleName: definition.name,
        contentBySlotId: {
          slot_image: { src: assetUrl, alt: `页面版本 ${version} 主图` },
        },
        layoutOverridesByNodeId: {},
        hiddenSlotIds: [],
        isVisible: true,
      },
    }],
    zones: {},
    root: { props: {} },
    resolvedDynamicTemplates: {
      [`${versionedMediaTemplateId}@${version}`]: {
        templateId: versionedMediaTemplateId,
        version,
        schemaVersion: definition.schemaVersion,
        definitionChecksum: `checksum-v${version}`,
        definition,
      },
    },
  };
}

const publishedDoc = {
  id: 9001,
  pageKey: "home",
  puckData: { content: [], root: { props: {} } },
  metadata: { seoTitle: "线上版本" },
  editorVersion: "0.22.4",
  status: "PUBLISHED",
  reviewStatus: "PUBLISHED",
  contentHash: "b".repeat(64),
  version: 1,
  publishedAt: "2026-08-14T00:00:00.000Z",
  updatedAt: "2026-08-14T00:00:00.000Z",
};

const draftDoc = {
  id: 9002,
  pageKey: "home",
  puckData: { content: [heroBlock], root: { props: {} } },
  metadata: { seoTitle: "草稿版本" },
  editorVersion: "0.22.4",
  status: "DRAFT",
  reviewStatus: "DRAFT",
  contentHash: "a".repeat(64),
  version: 1,
  publishedAt: null,
  updatedAt: "2026-08-14T01:00:00.000Z",
};

function json(data: unknown) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ code: 200, data, message: "success" }),
  };
}

async function approveCurrentPageForPublishing(page: Page) {
  const reviewStatus = page.getByTestId("page-review-status");
  await expect(reviewStatus).toHaveText("草稿");
  await page.getByRole("button", { name: "提交审核", exact: true }).click();
  await expect(reviewStatus).toHaveText("待审核");
  await page.getByRole("button", { name: "批准", exact: true }).click();
  await expect(reviewStatus).toHaveText("已批准");
  await expect(page.locator(".homepage-editor__toolbar-publish")).toBeEnabled();
}

async function mockEditorApis(
  page: Page,
  options: {
    published?: Record<string, any>;
    draft?: Record<string, any>;
    saveDelayMs?: number;
    saveFailureCount?: number;
    beforeSaveResponse?: () => Promise<void>;
    adminFailureOnRequest?: number;
    saveConflict?: boolean;
    publishFailure?: boolean;
    revisions?: Array<Record<string, any>>;
    revisionsFailureCount?: number;
    revisionDetailFailureCount?: number;
    revisionDetailFailureStatuses?: number[];
    revisionDetailDelays?: Record<number, number>;
    discardFailureCount?: number;
    normalizeSavedPuckData?: (puckData: any) => any;
    normalizeSavedMetadata?: (metadata: any) => any;
  } = {},
) {
  let published: Record<string, any> = options.published ?? publishedDoc;
  let saved: Record<string, any> = { ...(options.draft ?? draftDoc) };
  let revisionsFailureCount = options.revisionsFailureCount ?? 0;
  let revisionDetailFailureCount = options.revisionDetailFailureCount ?? 0;
  let saveFailureCount = options.saveFailureCount ?? 0;
  const revisionDetailFailureStatuses = [...(options.revisionDetailFailureStatuses ?? [])];
  let discardFailureCount = options.discardFailureCount ?? 0;
  let adminRequestCount = 0;
  await page.route(`${API_PREFIX}*`, async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes("/auth/profile")) return route.fallback();

    if (url.includes("/validate")) {
      return route.fulfill(json({ valid: true, errors: [] }));
    }
    if (method === "GET" && /\/revisions\/\d+(?:\?|$)/.test(url)) {
      const version = Number(url.match(/\/revisions\/(\d+)/)?.[1]);
      const detailDelay = options.revisionDetailDelays?.[version] ?? 0;
      if (detailDelay > 0) await new Promise((resolve) => setTimeout(resolve, detailDelay));
      const failureStatus = revisionDetailFailureStatuses.shift()
        ?? (revisionDetailFailureCount > 0 ? 503 : null);
      if (failureStatus) {
        if (revisionDetailFailureCount > 0) revisionDetailFailureCount -= 1;
        return route.fulfill({
          status: failureStatus,
          contentType: "application/json",
          body: JSON.stringify({
            code: failureStatus,
            message: "PrismaClientKnownRequestError P2022 at revision.detail",
          }),
        });
      }
      const revision = options.revisions?.find(
        (item) => item.version === version,
      );
      if (!revision) return route.fulfill({ ...json({}), status: 404 });
      return route.fulfill(json(revision));
    }
    if (url.includes("/revisions")) {
      if (revisionsFailureCount > 0) {
        revisionsFailureCount -= 1;
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            code: 503,
            message: "PrismaClientKnownRequestError P2022 at revision.list",
          }),
        });
      }
      const revisions = options.revisions ?? [];
      return route.fulfill(json({
        items: revisions.map(({ puckData: _puckData, metadata: _metadata, ...summary }) => ({
          ...summary,
          isPublished: summary.isPublished ?? summary.version === published.version,
        })),
        nextBeforeVersion: null,
      }));
    }
    if (url.includes("/review/submit")) {
      saved = {
        ...saved,
        reviewStatus: "IN_REVIEW",
        updatedAt: "2026-08-14T01:40:00.000Z",
      };
      return route.fulfill(json(saved));
    }
    if (url.includes("/review") && method === "PUT") {
      const body = route.request().postDataJSON() as { action?: string };
      saved = {
        ...saved,
        reviewStatus: body.action === "APPROVE" ? "APPROVED" : "CHANGES_REQUESTED",
        updatedAt: "2026-08-14T01:45:00.000Z",
      };
      return route.fulfill(json(saved));
    }
    if (method === "DELETE" && url.includes("/document/draft")) {
      if (discardFailureCount > 0) {
        discardFailureCount -= 1;
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            code: 503,
            message: "PrismaClientKnownRequestError P2022 at draft.discard",
          }),
        });
      }
      saved = { ...published };
      return route.fulfill(json({ discarded: true }));
    }
    if (url.includes("/published")) {
      return route.fulfill(json(published));
    }
    if (url.includes("/publish")) {
      if (options.publishFailure) {
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            code: 503,
            message: "PrismaClientKnownRequestError P2022 at page_modules.publish",
          }),
        });
      }
      saved = {
        ...saved,
        status: "PUBLISHED",
        reviewStatus: "PUBLISHED",
        publishedAt: "2026-08-14T02:00:00.000Z",
      };
      published = { ...published, ...saved };
      return route.fulfill(json(saved));
    }
    if (url.includes("/admin")) {
      adminRequestCount += 1;
      if (adminRequestCount === options.adminFailureOnRequest) {
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            code: 503,
            message: "PrismaClientKnownRequestError P2022 at document.admin",
          }),
        });
      }
      return route.fulfill(json(saved));
    }
    if (method === "PUT") {
      if (saveFailureCount > 0) {
        saveFailureCount -= 1;
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            code: 503,
            message: "PrismaClientKnownRequestError P2022 at document.save",
          }),
        });
      }
      if (options.saveConflict) {
        return route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            code: 409,
            message: "该页面已被其他编辑者更新，请重新加载后再保存",
          }),
        });
      }
      if (options.saveDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.saveDelayMs));
      }
      await options.beforeSaveResponse?.();
      const body = route.request().postDataJSON() as {
        puckData?: unknown;
        metadata?: unknown;
      };
      saved = {
        ...saved,
        puckData: options.normalizeSavedPuckData
          ? options.normalizeSavedPuckData(body.puckData ?? saved.puckData)
          : (body.puckData ?? saved.puckData) as any,
        metadata: options.normalizeSavedMetadata
          ? options.normalizeSavedMetadata(body.metadata ?? saved.metadata)
          : (body.metadata ?? saved.metadata) as any,
        updatedAt: "2026-08-14T01:30:00.000Z",
      };
      return route.fulfill(json(saved));
    }
    return route.fulfill(json({}));
  });
}

test.describe("店铺装修 —— 草稿恢复与继续编辑", () => {
  test.skip(useMock, "依赖 HTTP 拦截夹具，mock 模式由手动验收覆盖");

  test.beforeEach(async ({ page }) => {
    await authenticateAdmin(page);
    await mockEditorApis(page);
  });

  test("存在未发布草稿时，重新进入编辑器默认加载草稿", async ({ page }) => {
    await page.goto("/admin/editor/home");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();

    const status = page.locator(".homepage-editor__draft-status");
    await expect(status).toContainText("有未发布更改", { timeout: 10000 });
    await expect(status).toHaveAttribute(
      "aria-label",
      /草稿状态：有未发布更改，已保存/,
    );
  });

  test("线上内容与草稿一致时默认直接进入编辑模式", async ({
    page,
  }) => {
    const sharedPuckData = {
      content: [
        {
          ...heroBlock,
          props: { ...heroBlock.props, title: "线上编辑基线标题" },
        },
      ],
      root: { props: {} },
    };
    let adminReads = 0;
    page.on("request", (request) => {
      if (
        request.method() === "GET" &&
        new URL(request.url()).pathname.endsWith("/page-modules/document/admin")
      ) {
        adminReads += 1;
      }
    });
    await page.unroute(`${API_PREFIX}*`);
    await mockEditorApis(page, {
      published: {
        ...publishedDoc,
        puckData: sharedPuckData,
        metadata: { seoTitle: "共同页面资料" },
      },
      draft: {
        ...draftDoc,
        puckData: sharedPuckData,
        metadata: { seoTitle: "共同页面资料" },
      },
      // 保留第二次读取失败陷阱，证明进入编辑态不依赖额外请求。
      adminFailureOnRequest: 2,
    });

    await page.goto("/admin/editor/home");
    await expect(
      page.getByText("线上版本仅供查看", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.frameLocator("iframe").getByText("线上编辑基线标题", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "保存当前装修草稿" }),
    ).toBeVisible();
    await expect(
      page.frameLocator("iframe").getByText("线上编辑基线标题", { exact: true }),
    ).toBeVisible();
    const heroTitleInput = await selectHeroTitleInput(page);
    await expect(heroTitleInput).toHaveValue("线上编辑基线标题");
    await heroTitleInput.fill("从线上基线开始的新草稿标题");
    await expect(
      page.locator('.homepage-editor__draft-status[data-mode="dirty"]'),
    ).toContainText("有未保存修改");
    await expect(
      page.getByText("PrismaClientKnownRequestError P2022 at document.admin", {
        exact: true,
      }),
    ).toHaveCount(0);
    expect(adminReads).toBe(1);
  });

  test("连续编辑文字后立即预览并退出，保存仍使用完整最新画布", async ({
    page,
  }) => {
    const savePayloads: any[] = [];
    page.on("request", (request) => {
      if (
        request.method() === "PUT" &&
        new URL(request.url()).pathname.endsWith("/page-modules/document")
      ) {
        savePayloads.push(request.postDataJSON());
      }
    });

    await page.goto("/admin/editor/home");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();

    const inspector = page.getByRole("region", { name: "属性面板" });
    const titleInput = await selectHeroTitleInput(page);
    const subtitleInput = inspector.getByRole("textbox", {
      name: "副标题",
      exact: true,
    });
    await titleInput.fill("立即预览也不能丢失的主标题");
    await subtitleInput.fill("连续输入后保存的完整副标题");

    await page.getByRole("button", { name: "预览当前画布" }).click();
    await expect(page.getByText("当前画布预览 · 1920 × 1200")).toBeVisible();
    await expect(
      page
        .frameLocator(".homepage-editor__canvas-scale iframe")
        .getByText("立即预览也不能丢失的主标题", { exact: true }),
    ).toBeVisible();

    await page.getByRole("button", { name: "退出当前画布预览" }).click();
    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    await expect.poll(() => savePayloads.length).toBe(1);
    expect(savePayloads[0]?.puckData?.content?.[0]?.props).toMatchObject({
      title: "立即预览也不能丢失的主标题",
      subtitle: "连续输入后保存的完整副标题",
    });
  });

  test("查看线上版本为只读比较，返回后保留未保存画布", async ({ page }) => {
    const savePayloads: any[] = [];
    page.on("request", (request) => {
      if (
        request.method() === "PUT" &&
        new URL(request.url()).pathname.endsWith("/page-modules/document")
      ) {
        savePayloads.push(request.postDataJSON());
      }
    });
    await page.unroute(`${API_PREFIX}*`);
    await mockEditorApis(page, {
      published: {
        ...publishedDoc,
        puckData: {
          content: [
            {
              ...heroBlock,
              props: { ...heroBlock.props, title: "当前线上标题" },
            },
          ],
          root: { props: {} },
        },
      },
    });
    await page.goto("/admin/editor/home");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
    const status = page.locator(".homepage-editor__draft-status");
    await expect(status).toContainText("有未发布更改", { timeout: 10000 });
    const heroTitleInput = await selectHeroTitleInput(page);
    await expect(heroTitleInput).toHaveValue("草稿标题");
    await heroTitleInput.fill("返回后仍需保留的未保存标题");
    await expect(status).toContainText("有未保存修改");

    await page.getByRole("button", { name: "更多编辑操作" }).click();
    await page.getByRole("menuitem", { name: "查看线上版本" }).click();
    const dialog = page.getByRole("dialog", { name: "查看线上版本？" });
    await expect(dialog).toContainText("返回编辑时会恢复当前草稿和未保存修改");
    await dialog.getByRole("button", { name: "查看线上版本" }).click();
    await expect(status).toHaveAttribute("data-mode", "readonly");
    await expect(status).toContainText("线上版本");
    await expect(
      page.getByText("线上版本仅供查看", { exact: true }),
    ).toHaveCount(2);
    await expect(
      page.frameLocator("iframe").getByText("当前线上标题", { exact: true }),
    ).toBeVisible();
    await expect(heroTitleInput).toHaveCount(0);
    await expect(page.getByRole("button", { name: "删除当前模块" })).toHaveCount(0);
    await page
      .locator(".homepage-editor__layer-item")
      .filter({ hasText: "首屏" })
      .click();
    await expect(page.getByRole("group", { name: /首屏.*图层操作/ })).toHaveCount(0);
    await page.getByRole("button", { name: "更多编辑操作" }).click();
    await expect(page.getByRole("menuitem", { name: "套用首屏测试结构" })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: "页面设置" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "导入方案 JSON" })).toHaveCount(0);
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "返回编辑" }).click();
    await expect(
      page
        .frameLocator("iframe")
        .getByText("返回后仍需保留的未保存标题", { exact: true }),
    ).toBeVisible();
    await expect(status).toContainText("有未保存修改");
    await page
      .locator(".homepage-editor__layer-item")
      .filter({ hasText: "首屏" })
      .click();
    await expect(heroTitleInput).toHaveValue("返回后仍需保留的未保存标题");
    await expect(page.getByText("已返回草稿，未保存修改保持不变")).toBeVisible();
    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    await expect(
      page.locator(".ant-message-notice-content")
        .getByText("页面草稿已保存", { exact: true }),
    ).toBeVisible();
    expect(savePayloads).toHaveLength(1);
    expect(savePayloads[0].puckData.content[0].props.title).toBe(
      "返回后仍需保留的未保存标题",
    );
  });

  test("从线上 v1 打开页面设置时恢复草稿 v2 定义并保留媒体授权", async ({ page }) => {
    const publishedAssetUrl = "/svg/template-hero.svg?fixture=published-v1";
    const draftAssetUrl = "/svg/template-hero.svg?fixture=draft-v2";
    const draftMediaRight = {
      assetUrl: draftAssetUrl,
      source: "品牌自有拍摄",
      authorizationId: "HC-DRAFT-V2-001",
    };
    const savePayloads: any[] = [];
    page.on("request", (request) => {
      if (
        request.method() === "PUT"
        && new URL(request.url()).pathname.endsWith("/page-modules/document")
      ) {
        savePayloads.push(request.postDataJSON());
      }
    });
    await page.unroute(`${API_PREFIX}*`);
    await mockEditorApis(page, {
      published: {
        ...publishedDoc,
        puckData: createVersionedMediaPuckData(1, publishedAssetUrl),
        metadata: {
          seoTitle: "线上 v1",
          mediaRights: [{
            assetUrl: publishedAssetUrl,
            source: "线上素材来源",
            authorizationId: "HC-ONLINE-V1-001",
          }],
        },
      },
      draft: {
        ...draftDoc,
        puckData: createVersionedMediaPuckData(2, draftAssetUrl),
        metadata: {
          seoTitle: "草稿 v2",
          mediaRights: [draftMediaRight],
        },
      },
    });

    await page.goto("/admin/editor/home");
    const status = page.locator(".homepage-editor__draft-status");
    await expect(status).toContainText("有未发布更改", { timeout: 10_000 });
    await expect(
      page.getByRole("region", { name: "模板实例属性" })
        .getByText("草稿媒体模板 v2", { exact: true }),
    ).toBeVisible();

    await page.getByRole("button", { name: "更多编辑操作" }).click();
    await page.getByRole("menuitem", { name: "查看线上版本" }).click();
    await expect(status).toHaveAttribute("data-mode", "readonly");
    await expect(
      page.getByText("线上版本仅供查看", { exact: true }),
    ).toHaveCount(2);

    await page.getByRole("button", { name: "更多编辑操作" }).click();
    await page.getByRole("menuitem", { name: "页面设置" }).click();

    const drawer = page.getByRole("dialog", { name: "页面展示设置" });
    await expect(drawer).toBeVisible();
    await expect(status).not.toHaveAttribute("data-mode", "readonly");
    await expect(
      page.getByText("已返回未发布草稿", { exact: true }),
    ).toBeVisible();

    const rights = drawer.getByRole("region", { name: "媒体来源与授权" });
    await expect(rights).toContainText("1 项当前页面素材");
    await expect(rights.getByTestId("page-media-right")).toHaveCount(0);
    await expect(rights.getByRole("link", { name: "在页面素材库登记与审核" }))
      .toHaveAttribute("href", "/admin/media");
    await expect(rights.getByRole("textbox", { name: /素材 \d+ 来源/ })).toHaveCount(0);

    await drawer.getByRole("button", { name: "保存整页草稿" }).click();
    await expect.poll(() => savePayloads.length).toBe(1);
    expect(savePayloads[0]).toMatchObject({
      puckData: {
        content: [{
          props: {
            templateId: versionedMediaTemplateId,
            templateVersion: 2,
            contentBySlotId: {
              slot_image: { src: draftAssetUrl },
            },
          },
        }],
      },
      metadata: {
        seoTitle: "草稿 v2",
        mediaRights: [draftMediaRight],
      },
    });
  });

  test("移动窄屏查看线上版本后仍可恢复未保存画布", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/editor/home");
    const heroTitleInput = await selectHeroTitleInput(page);
    await expect(heroTitleInput).toHaveValue("草稿标题");
    await heroTitleInput.fill("移动端未保存标题");

    await page.getByRole("button", { name: "更多编辑操作" }).click();
    await page.getByRole("menuitem", { name: "查看线上版本" }).click();
    const dialog = page.getByRole("dialog", { name: "查看线上版本？" });
    await dialog.getByRole("button", { name: "查看线上版本" }).click();
    await expect(
      page.getByText("线上版本仅供查看", { exact: true }),
    ).toHaveCount(2);

    await page.getByRole("button", { name: "更多编辑操作" }).click();
    await page.getByRole("menuitem", { name: "继续编辑草稿" }).click();
    await expect(
      page
        .frameLocator("iframe")
        .getByText("移动端未保存标题", { exact: true }),
    ).toBeVisible();
    await expect(
      page.locator('.homepage-editor__draft-status[data-mode="dirty"]'),
    ).toContainText("有未保存修改");
  });

  test("查看线上版本期间离开仍保护并保存进入前的草稿", async ({ page }) => {
    const savePayloads: any[] = [];
    page.on("request", (request) => {
      if (
        request.method() === "PUT" &&
        new URL(request.url()).pathname.endsWith("/page-modules/document")
      ) {
        savePayloads.push(request.postDataJSON());
      }
    });
    await page.goto("/admin/editor/home");
    const heroTitleInput = await selectHeroTitleInput(page);
    await heroTitleInput.fill("离开前必须保存的草稿标题");

    await page.getByRole("button", { name: "更多编辑操作" }).click();
    await page.getByRole("menuitem", { name: "查看线上版本" }).click();
    await page
      .getByRole("dialog", { name: "查看线上版本？" })
      .getByRole("button", { name: "查看线上版本" })
      .click();
    await expect(
      page.getByText("线上版本仅供查看", { exact: true }),
    ).toHaveCount(2);

    await page.getByRole("button", { name: "展开一级导航" }).click();
    await page
      .locator(".admin-sidebar__nav")
      .getByRole("button", { name: "首页" })
      .first()
      .click();
    const guard = page.getByRole("dialog", { name: "保存后离开？" });
    await expect(guard).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/editor\/home/);
    await guard.getByRole("button", { name: "保存并离开" }).click();

    await expect(page).toHaveURL(/\/admin\/dashboard/);
    expect(savePayloads).toHaveLength(1);
    expect(savePayloads[0].puckData.content[0].props.title).toBe(
      "离开前必须保存的草稿标题",
    );
  });

  test("查看线上版本等待在途保存后建立最新草稿快照", async ({ page }) => {
    await page.unroute(`${API_PREFIX}*`);
    await mockEditorApis(page, { saveDelayMs: 800 });
    await page.goto("/admin/editor/home");
    const heroTitleInput = await selectHeroTitleInput(page);
    await heroTitleInput.fill("保存完成后再比较的标题");
    const saveResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        new URL(response.url()).pathname.endsWith("/page-modules/document"),
    );
    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    await page.getByRole("button", { name: "更多编辑操作" }).click();
    await page.getByRole("menuitem", { name: "查看线上版本" }).click();
    await page
      .getByRole("dialog", { name: "查看线上版本？" })
      .getByRole("button", { name: "查看线上版本" })
      .click();

    await saveResponse;
    await expect(
      page.getByText("线上版本仅供查看", { exact: true }),
    ).toHaveCount(2);
    await page.getByRole("button", { name: "返回编辑" }).click();
    await expect(
      page
        .frameLocator("iframe")
        .getByText("保存完成后再比较的标题", { exact: true }),
    ).toBeVisible();
    await expect(
      page.locator('.homepage-editor__draft-status[data-mode="pending"]'),
    ).toContainText("有未发布更改");
    await expect(
      page.locator('.homepage-editor__draft-status[data-mode="dirty"]'),
    ).toHaveCount(0);
  });

  test("放弃草稿需二次确认，取消后草稿不变", async ({ page }) => {
    await page.goto("/admin/editor/home");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
    const status = page.locator(".homepage-editor__draft-status");
    await expect(status).toContainText("有未发布更改", { timeout: 10000 });

    await page.getByRole("button", { name: "更多编辑操作" }).click();
    await page.getByRole("menuitem", { name: "放弃草稿" }).click();
    const dialog = page.getByRole("dialog", {
      name: "放弃当前草稿并恢复线上版本？",
    });
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: /取\s*消/ }).click();
    await expect(dialog).toBeHidden();
    await expect(status).toContainText("有未发布更改");
  });

  test("未发布页面不提供无法执行的放弃草稿入口", async ({ page }) => {
    let discardRequests = 0;
    page.on("request", (request) => {
      if (
        request.method() === "DELETE"
        && new URL(request.url()).pathname.endsWith("/page-modules/document/draft")
      ) discardRequests += 1;
    });
    await page.unroute(`${API_PREFIX}*`);
    await mockEditorApis(page, {
      published: {},
      draft: {
        ...draftDoc,
        publishedAt: null,
        status: "DRAFT",
      },
    });

    await page.goto("/admin/editor/home");
    await page.getByRole("button", { name: "更多编辑操作" }).click();
    await expect(page.getByRole("menuitem", { name: "放弃草稿" })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: "查看线上版本" })).toHaveCount(0);
    expect(discardRequests).toBe(0);
  });

  test("单项与批量删除准确说明当前会话撤销和发布历史边界", async ({ page }) => {
    await page.unroute(`${API_PREFIX}*`);
    await mockEditorApis(page, {
      draft: {
        ...draftDoc,
        puckData: {
          content: [
            heroBlock,
            {
              ...heroBlock,
              props: { ...heroBlock.props, id: "draft-hero-second", title: "第二个草稿标题" },
            },
          ],
          root: { props: {} },
        },
      },
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/admin/editor/home");

    const layers = page.locator(".homepage-editor__layer-item");
    await expect(layers).toHaveCount(2);
    await layers.first().getByRole("button", { name: /删除首屏/ }).press("Enter");
    let dialog = page.getByRole("dialog", { name: /删除“首屏/ });
    await expect(dialog).toContainText("当前编辑会话中可用顶部“撤销”恢复");
    await expect(dialog).toContainText("发布历史只包含已发布快照");
    await expect(dialog).not.toContainText("尚未发布的修改可通过版本记录恢复");
    await dialog.getByRole("button", { name: /取\s*消/ }).click();

    await layers.nth(0).locator(".homepage-editor__layer-select").click({ modifiers: ["Control"] });
    await layers.nth(1).locator(".homepage-editor__layer-select").click({ modifiers: ["Control"] });
    await page.locator(".homepage-editor__layer-batch")
      .getByRole("button", { name: "删除" }).press("Enter");
    dialog = page.getByRole("dialog", { name: "删除 2 个模块？" });
    await expect(dialog).toContainText("当前编辑会话中可用顶部“撤销”恢复");
    await expect(dialog).toContainText("发布历史只包含已发布快照");
    await expect(dialog).not.toContainText("尚未发布的修改可通过版本记录恢复");
    await dialog.getByRole("button", { name: "删除模块" }).click();
    await expect(layers).toHaveCount(0);

    const undo = page.getByRole("button", { name: "撤销", exact: true });
    await expect(undo).toBeEnabled();
    await undo.focus();
    await undo.press("Enter");
    await expect(layers).toHaveCount(2);
  });

  test("版本列表失败时在抽屉保留安全错误并可原位重试", async ({ page }) => {
    await page.unroute(`${API_PREFIX}*`);
    await mockEditorApis(page, { revisionsFailureCount: 1 });
    await page.goto("/admin/editor/home");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();

    await page.getByRole("button", { name: "更多编辑操作" }).click();
    await page.getByRole("menuitem", { name: "发布历史" }).click();

    const alert = page.getByRole("alert").filter({ hasText: "版本列表未加载" });
    await expect(alert).toContainText("版本列表加载失败，请稍后重试");
    await expect(
      page.getByText("PrismaClientKnownRequestError P2022 at revision.list", {
        exact: true,
      }),
    ).toHaveCount(0);

    await alert.getByRole("button", { name: "重新加载" }).click();
    await expect(alert).toHaveCount(0);
    await expect(page.getByText("未发布草稿", { exact: true })).toBeVisible();
  });

  test("单版本详情失败时保留当前画布并可原位重试后载入内存草稿", async ({ page }) => {
    const revision = {
      ...publishedDoc,
      id: 8999,
      version: 1,
      puckData: {
        content: [
          {
            ...heroBlock,
            props: { ...heroBlock.props, title: "历史版本标题" },
          },
        ],
      },
      updatedAt: "2026-08-13T00:00:00.000Z",
      publishedAt: "2026-08-13T00:00:00.000Z",
    };
    await page.unroute(`${API_PREFIX}*`);
    await mockEditorApis(page, {
      revisions: [{ ...publishedDoc, version: 2 }, revision],
      revisionDetailFailureCount: 1,
    });
    await page.goto("/admin/editor/home");
    const heroTitleInput = await selectHeroTitleInput(page);
    await expect(heroTitleInput).toHaveValue("草稿标题");

    await page.getByRole("button", { name: "更多编辑操作" }).click();
    await page.getByRole("menuitem", { name: "发布历史" }).click();
    const revisionItem = page.locator(".homepage-editor__revision-item").filter({ hasText: "版本 1" });
    await revisionItem.getByRole("button", { name: /版本 1/ }).click();

    const alert = page.getByRole("alert").filter({ hasText: "版本详情无法使用" });
    await expect(alert).toContainText("版本详情加载失败，请重试");
    await expect(heroTitleInput).toHaveValue("草稿标题");
    await expect(
      page.getByText("PrismaClientKnownRequestError P2022 at revision.detail", {
        exact: true,
      }),
    ).toHaveCount(0);

    await alert.getByRole("button", { name: /重\s*试/ }).click();
    await expect(alert).toHaveCount(0);
    await expect(page.getByLabel("版本 1 预览")).toContainText("历史版本标题");
    await page.getByRole("button", { name: "载入当前草稿" }).click();
    const dialog = page.getByRole("dialog", { name: "载入版本 1 到当前草稿？" });
    await dialog.getByRole("button", { name: "载入当前草稿" }).click();
    await expect(
      page.frameLocator("iframe").getByText("历史版本标题", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("status", { name: /草稿状态/ })).toContainText("有未保存修改");
    await expect(page.getByRole("button", { name: "撤销", exact: true })).toBeEnabled();
  });

  for (const statusCode of [404, 500, 503]) {
    test(`版本详情 ${statusCode} 不改变当前选择、画布或草稿状态`, async ({ page }) => {
      const revision = {
        ...publishedDoc,
        id: 8900 + statusCode,
        version: 1,
        puckData: {
          content: [{
            ...heroBlock,
            props: { ...heroBlock.props, title: `不应载入的 ${statusCode} 标题` },
          }],
          root: { props: {} },
        },
      };
      await page.unroute(`${API_PREFIX}*`);
      await mockEditorApis(page, {
        revisions: [{ ...publishedDoc, version: 2 }, revision],
        revisionDetailFailureStatuses: [statusCode],
      });
      await page.goto("/admin/editor/home");
      await page.getByRole("button", { name: "更多编辑操作" }).click();
      await page.getByRole("menuitem", { name: "发布历史" }).click();
      const history = page.getByRole("dialog", { name: "页面发布历史" });
      await history.locator(".homepage-editor__revision-item")
        .filter({ hasText: "版本 1" })
        .getByRole("button", { name: /版本 1/ }).click();
      await expect(history.getByRole("alert")).toContainText("版本详情加载失败，请重试");
      await expect(page.frameLocator("iframe").getByText("草稿标题", { exact: true })).toBeVisible();
      await expect(page.locator(".homepage-editor__draft-status")).toContainText("有未发布更改");
      await expect(page.getByRole("button", { name: "撤销", exact: true })).toBeDisabled();
    });
  }

  test("延迟返回的旧页面版本详情不能覆盖后选择的新版本", async ({ page }) => {
    const version1 = {
      ...publishedDoc,
      id: 8981,
      version: 1,
      puckData: {
        content: [{ ...heroBlock, props: { ...heroBlock.props, title: "延迟版本一" } }],
        root: { props: {} },
      },
    };
    const version2 = {
      ...publishedDoc,
      id: 8982,
      version: 2,
      puckData: {
        content: [{ ...heroBlock, props: { ...heroBlock.props, title: "当前版本二" } }],
        root: { props: {} },
      },
    };
    await page.unroute(`${API_PREFIX}*`);
    await mockEditorApis(page, {
      revisions: [version2, version1],
      revisionDetailDelays: { 1: 300, 2: 10 },
    });
    await page.goto("/admin/editor/home");
    await page.getByRole("button", { name: "更多编辑操作" }).click();
    await page.getByRole("menuitem", { name: "发布历史" }).click();
    const history = page.getByRole("dialog", { name: "页面发布历史" });
    await history.locator(".homepage-editor__revision-item")
      .filter({ hasText: "版本 1" })
      .getByRole("button", { name: /版本 1/ }).click();
    await history.locator(".homepage-editor__revision-item")
      .filter({ hasText: "版本 2" })
      .getByRole("button", { name: /版本 2/ }).click();
    await expect(history.getByLabel("版本 2 预览")).toContainText("当前版本二");
    await page.waitForTimeout(350);
    await expect(history.getByLabel("版本 2 预览")).toContainText("当前版本二");
    await expect(history.getByLabel("版本 1 预览")).toHaveCount(0);
  });

  for (const scenario of [
    { label: "仅 metadata", title: "草稿标题", seoTitle: "历史 metadata SEO" },
    { label: "正文与 metadata", title: "历史复合标题", seoTitle: "历史复合 SEO" },
  ]) {
    test(`${scenario.label} 历史载入作为一个命令随撤销重做完整回放并可显式保存`, async ({ page }) => {
      const revision = {
        ...publishedDoc,
        id: scenario.label === "仅 metadata" ? 8971 : 8972,
        version: 1,
        puckData: {
          content: [{ ...heroBlock, props: { ...heroBlock.props, title: scenario.title } }],
          root: { props: {} },
        },
        metadata: { seoTitle: scenario.seoTitle },
      };
      const saveBodies: Array<Record<string, any>> = [];
      page.on("request", (request) => {
        if (
          request.method() === "PUT"
          && new URL(request.url()).pathname.endsWith("/page-modules/document")
        ) saveBodies.push(request.postDataJSON() as Record<string, any>);
      });
      await page.unroute(`${API_PREFIX}*`);
      await mockEditorApis(page, { revisions: [{ ...publishedDoc, version: 2 }, revision] });
      await page.goto("/admin/editor/home");
      await page.getByRole("button", { name: "更多编辑操作" }).click();
      await page.getByRole("menuitem", { name: "发布历史" }).click();
      const history = page.getByRole("dialog", { name: "页面发布历史" });
      await history.locator(".homepage-editor__revision-item")
        .filter({ hasText: "版本 1" })
        .getByRole("button", { name: /版本 1/ }).click();
      await history.getByRole("button", { name: "载入当前草稿" }).click();
      await page.getByRole("dialog", { name: "载入版本 1 到当前草稿？" })
        .getByRole("button", { name: "载入当前草稿" }).click();

      await expect(page.frameLocator("iframe").getByText(scenario.title, { exact: true })).toBeVisible();
      expect(await readPageSeoTitle(page)).toBe(scenario.seoTitle);
      await expect(page.locator(".homepage-editor__draft-status")).toContainText("有未保存修改");

      const undo = page.getByRole("button", { name: "撤销", exact: true });
      const redo = page.getByRole("button", { name: "重做", exact: true });
      await undo.click();
      await expect(page.frameLocator("iframe").getByText("草稿标题", { exact: true })).toBeVisible();
      expect(await readPageSeoTitle(page)).toBe("草稿版本");
      await expect(page.locator(".homepage-editor__draft-status")).toContainText("有未发布更改");
      await expect(page.locator(".homepage-editor__draft-status")).not.toContainText("有未保存修改");
      await expect(undo).toBeDisabled();
      await expect(redo).toBeEnabled();

      await redo.click();
      await expect(page.frameLocator("iframe").getByText(scenario.title, { exact: true })).toBeVisible();
      expect(await readPageSeoTitle(page)).toBe(scenario.seoTitle);
      await expect(page.locator(".homepage-editor__draft-status")).toContainText("有未保存修改");
      await page.getByRole("button", { name: "保存当前装修草稿" }).click();
      await expect.poll(() => saveBodies.length).toBe(1);
      expect(saveBodies[0]?.metadata).toMatchObject({ seoTitle: scenario.seoTitle });
      expect(saveBodies[0]?.puckData?.content?.[0]?.props?.title).toBe(scenario.title);
    });
  }

  test("取消载入历史版本保持零修改、零历史命令和零写入", async ({ page }) => {
    const revision = {
      ...publishedDoc,
      id: 8961,
      version: 1,
      puckData: {
        content: [{ ...heroBlock, props: { ...heroBlock.props, title: "取消版本标题" } }],
        root: { props: {} },
      },
      metadata: { seoTitle: "取消版本 SEO" },
    };
    const writes: string[] = [];
    page.on("request", (request) => {
      const pathname = new URL(request.url()).pathname;
      if (request.method() !== "GET" && !pathname.endsWith("/validate")) writes.push(pathname);
    });
    await page.unroute(`${API_PREFIX}*`);
    await mockEditorApis(page, { revisions: [{ ...publishedDoc, version: 2 }, revision] });
    await page.goto("/admin/editor/home");
    await page.getByRole("button", { name: "更多编辑操作" }).click();
    await page.getByRole("menuitem", { name: "发布历史" }).click();
    const history = page.getByRole("dialog", { name: "页面发布历史" });
    await history.locator(".homepage-editor__revision-item")
      .filter({ hasText: "版本 1" })
      .getByRole("button", { name: /版本 1/ }).click();
    await expect(history.getByLabel("版本 1 预览")).toContainText("取消版本标题");
    await history.getByRole("button", { name: "载入当前草稿" }).click();
    const confirm = page.locator(".ant-modal-confirm")
      .filter({ hasText: "载入版本 1 到当前草稿？" });
    await expect(confirm).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(confirm).toBeHidden();
    await history.locator(".ant-drawer-close").click();
    await expect(history).toBeHidden();
    await expect(page.frameLocator("iframe").getByText("草稿标题", { exact: true })).toBeVisible();
    expect(await readPageSeoTitle(page)).toBe("草稿版本");
    await expect(page.getByRole("button", { name: "撤销", exact: true })).toBeDisabled();
    expect(writes).toEqual([]);
  });

  test("历史版本载入零写入且后续显式保存使用最新乐观锁", async ({ page }) => {
    const revision = {
      ...publishedDoc,
      id: 8998,
      version: 1,
      puckData: {
        content: [
          {
            ...heroBlock,
            props: { ...heroBlock.props, title: "串行恢复后的历史标题" },
          },
        ],
        root: { props: {} },
      },
      updatedAt: "2026-08-12T00:00:00.000Z",
      publishedAt: "2026-08-12T00:00:00.000Z",
    };
    const restoreWrites: string[] = [];
    const saveBodies: Array<{ expectedUpdatedAt?: string }> = [];
    let releaseSaveResponse: (() => void) | undefined;
    const saveResponseGate = new Promise<void>((resolve) => {
      releaseSaveResponse = resolve;
    });
    page.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      if (/\/revisions\/\d+\/restore$/.test(path)) restoreWrites.push(path);
      if (request.method() === "PUT" && path.endsWith("/page-modules/document")) {
        saveBodies.push(request.postDataJSON() as { expectedUpdatedAt?: string });
      }
    });
    await page.unroute(`${API_PREFIX}*`);
    await mockEditorApis(page, {
      revisions: [{ ...publishedDoc, version: 2 }, revision],
      beforeSaveResponse: () => saveResponseGate,
    });
    await page.goto("/admin/editor/home");
    const heroTitleInput = await selectHeroTitleInput(page);
    await heroTitleInput.fill("保存队列中的新标题");

    const saveResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        new URL(response.url()).pathname.endsWith("/page-modules/document"),
    );
    const saveRequest = page.waitForRequest(
      (request) =>
        request.method() === "PUT" &&
        new URL(request.url()).pathname.endsWith("/page-modules/document"),
    );
    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    await saveRequest;
    await page.getByRole("button", { name: "更多编辑操作" }).click();
    await page.getByRole("menuitem", { name: "发布历史" }).click();
    const revisionItem = page
      .locator(".homepage-editor__revision-item")
      .filter({ hasText: "版本 1" });
    await revisionItem.getByRole("button", { name: /版本 1/ }).click();
    await expect(page.getByLabel("版本 1 预览")).toContainText("串行恢复后的历史标题");
    await page.getByRole("button", { name: "载入当前草稿" }).click();
    const dialog = page.getByRole("dialog", { name: "载入版本 1 到当前草稿？" });
    await expect(dialog).toContainText("本次替换本身可以撤销");
    await dialog.getByRole("button", { name: "载入当前草稿" }).click();
    expect(restoreWrites).toHaveLength(0);

    releaseSaveResponse?.();
    await saveResponse;
    await expect(
      page.frameLocator("iframe").getByText("串行恢复后的历史标题", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByRole("status", { name: /草稿状态/ })).toContainText("有未保存修改");
    await expect(page.getByRole("button", { name: "撤销", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    await expect.poll(() => saveBodies.length).toBe(2);
    expect(saveBodies[1]?.expectedUpdatedAt).toBe("2026-08-14T01:30:00.000Z");
  });

  test("放弃草稿失败时保留草稿并提供持续重试入口", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.unroute(`${API_PREFIX}*`);
    await mockEditorApis(page, { discardFailureCount: 1 });
    await page.goto("/admin/editor/home");
    const status = page.locator(".homepage-editor__draft-status");
    await expect(status).toContainText("有未发布更改");

    await page.getByRole("button", { name: "更多编辑操作" }).click();
    await page.getByRole("menuitem", { name: "放弃草稿" }).click();
    let dialog = page.getByRole("dialog", {
      name: "放弃当前草稿并恢复线上版本？",
    });
    await dialog.getByRole("button", { name: "放弃草稿" }).click();

    const alert = page.getByRole("alert").filter({ hasText: "草稿仍然保留" });
    await expect(alert).toContainText("放弃草稿失败，请稍后重试");
    await expect(status).toContainText("有未发布更改");
    await expect(
      page.getByText("PrismaClientKnownRequestError P2022 at draft.discard", {
        exact: true,
      }),
    ).toHaveCount(0);

    await alert.getByRole("button", { name: "重新放弃草稿" }).click();
    dialog = page.getByRole("dialog", {
      name: "放弃当前草稿并恢复线上版本？",
    });
    await dialog.getByRole("button", { name: "放弃草稿" }).click();
    await expect(alert).toHaveCount(0);
    await expect(status).toHaveCount(0);
  });

  test("仅 metadata 不同时仍识别为未发布草稿", async ({ page }) => {
    const sharedPuck = { content: [heroBlock], root: { props: {} } };
    await page.unroute(`${API_PREFIX}*`);
    await mockEditorApis(page, {
      published: {
        ...publishedDoc,
        puckData: sharedPuck,
        metadata: { seoTitle: "线上 SEO" },
      },
      draft: {
        ...draftDoc,
        puckData: sharedPuck,
        metadata: { seoTitle: "草稿 SEO" },
      },
    });

    await page.goto("/admin/editor/home");
    const status = page.locator(".homepage-editor__draft-status");
    await expect(status).toContainText("有未发布更改", { timeout: 10000 });
    await page.getByRole("button", { name: "更多编辑操作" }).click();
    await expect(page.getByRole("menuitem", { name: "查看线上版本" })).toBeVisible();
  });

  test("发布后再次保存不会把相同 content 和 metadata 误报为草稿", async ({
    page,
  }) => {
    await page.unroute(`${API_PREFIX}*`);
    await mockEditorApis(page, { saveDelayMs: 250 });

    await page.goto("/admin/editor/home");
    await approveCurrentPageForPublishing(page);
    const publishButton = page.locator(".homepage-editor__toolbar-publish");
    await expect(publishButton).toBeEnabled({ timeout: 10000 });
    await publishButton.click();
    await expect(page.getByText("店铺首页已发布")).toBeVisible();

    const status = page.locator(".homepage-editor__draft-status");
    await expect(status).toHaveCount(0);
    const saveButton = page.getByRole("button", { name: "保存当前装修草稿" });
    await saveButton.click();
    await expect(status).toContainText("保存中…");
    await expect(status).toHaveAttribute("title", /草稿状态：保存中…/);
    await expect(
      page.locator(".ant-message-notice-content")
        .getByText("页面草稿已保存", { exact: true }),
    ).toBeVisible();
    await expect(status).toHaveCount(0);
    await expect(page.locator(".homepage-editor__toolbar")).not.toContainText("已保存");
  });

  test("草稿保存失败时状态区保留准确失败事实，重试成功后恢复草稿状态", async ({ page }) => {
    await page.unroute(`${API_PREFIX}*`);
    await mockEditorApis(page, { saveFailureCount: 1 });
    await page.goto("/admin/editor/home");

    const status = page.locator(".homepage-editor__draft-status");
    const saveButton = page.getByRole("button", { name: "保存当前装修草稿" });
    await saveButton.click();
    await expect(status).toHaveAttribute("data-mode", "error");
    await expect(status).toContainText("保存失败");
    await expect(status).toHaveAttribute("title", /草稿状态：保存失败.*请重试/);

    await saveButton.click();
    await expect(status).toHaveAttribute("data-mode", "pending");
    await expect(status).toContainText("有未发布更改");
  });

  test("页面设置保存遇到 409 时说明整页范围并保留本地输入", async ({ page }) => {
    let saveRequests = 0;
    page.on("request", (request) => {
      if (
        request.method() === "PUT"
        && new URL(request.url()).pathname.endsWith("/page-modules/document")
      ) saveRequests += 1;
    });
    await page.unroute(`${API_PREFIX}*`);
    await mockEditorApis(page, { saveConflict: true });
    await page.goto("/admin/editor/home");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();

    await page.getByRole("button", { name: "更多编辑操作" }).click();
    await page.getByRole("menuitem", { name: "页面设置" }).click();
    const drawer = page.getByRole("dialog", { name: "页面展示设置" });
    const ownerInput = drawer.getByPlaceholder("例：品牌内容组");
    await ownerInput.fill("冲突后保留的内容团队");
    await drawer.getByRole("button", { name: "保存整页草稿" }).click();

    const conflictDialog = page.getByRole("dialog", {
      name: "检测到其他人更新了这份整页草稿",
    });
    await expect(conflictDialog).toBeVisible();
    await expect(conflictDialog).toContainText("当前页面设置与画布修改仍完整保留");
    await conflictDialog.getByRole("button", { name: "保留本地修改" }).click();
    await expect(drawer).toBeVisible();
    await expect(ownerInput).toHaveValue("冲突后保留的内容团队");
    expect(saveRequests).toBe(1);
  });

  test("发布前保存等待期间出现新修改时中止发布并保留本地画布", async ({
    page,
  }) => {
    await page.unroute(`${API_PREFIX}*`);
    await mockEditorApis(page, { saveDelayMs: 800 });
    const publishRequests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.endsWith("/document/publish")) {
        publishRequests.push(request.url());
      }
    });

    await page.goto("/admin/editor/home");
    await approveCurrentPageForPublishing(page);
    const heroTitleInput = await selectHeroTitleInput(page);
    await expect(heroTitleInput).toHaveValue("草稿标题");

    await page.locator(".homepage-editor__toolbar-publish").click();
    await heroTitleInput.fill("发布等待期间的新修改");

    await expect(
      page.getByText(
        "保存期间页面又发生了修改；新修改已保留但尚未保存，请再次确认后发布",
      ),
    ).toBeVisible();
    await expect(heroTitleInput).toHaveValue("发布等待期间的新修改");
    await expect(
      page.locator('.homepage-editor__draft-status[data-mode="dirty"]'),
    ).toContainText("有未保存修改");
    expect(publishRequests).toEqual([]);
  });

  test("发布接口失败后只提示一次安全错误，已保存草稿刷新后仍可继续", async ({
    page,
  }) => {
    await page.unroute(`${API_PREFIX}*`);
    await mockEditorApis(page, { publishFailure: true });

    await page.goto("/admin/editor/home");
    let heroTitleInput = await selectHeroTitleInput(page);
    await expect(heroTitleInput).toHaveValue("草稿标题");
    await heroTitleInput.fill("发布失败后保留的草稿标题");

    await approveCurrentPageForPublishing(page);

    const publishButton = page.locator(".homepage-editor__toolbar-publish");
    await expect(publishButton).toBeEnabled({ timeout: 10000 });
    await publishButton.click();

    await expect(page.getByText("发布失败，请稍后重试", { exact: true })).toHaveCount(1);
    await expect(
      page.getByText("PrismaClientKnownRequestError P2022 at page_modules.publish", {
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByText("服务器繁忙，请稍后再试", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.locator('.homepage-editor__workspace-status[data-mode="error"]'),
    ).toContainText("发布失败 · 可重试");
    await expect(
      page.locator('.homepage-editor__workspace-status[data-mode="error"]'),
    ).toContainText("有未发布更改");
    await expect(page.getByRole("region", { name: "本次发布检查" }))
      .toContainText("草稿仍完整保留，可明确重试");
    await expect(publishButton).toBeEnabled();

    await page.reload();
    heroTitleInput = await selectHeroTitleInput(page);
    await expect(heroTitleInput).toHaveValue("发布失败后保留的草稿标题");
    await expect(
      page.locator('.homepage-editor__draft-status[data-mode="pending"]'),
    ).toContainText("有未发布更改");
  });

  test("SPA 切换页面时隐藏旧画布且不会把旧内容写入新 pageKey", async ({
    page,
  }) => {
    await page.unroute(`${API_PREFIX}*`);
    let releaseCustom!: () => void;
    const customGate = new Promise<void>((resolve) => {
      releaseCustom = resolve;
    });
    const writes: Array<Record<string, unknown>> = [];
    const validations: string[] = [];
    const routerWarnings: string[] = [];
    page.on("console", (entry) => {
      if (entry.type() === "warning" && entry.text().includes("blocker on a POP navigation")) {
        routerWarnings.push(entry.text());
      }
    });

    await page.route(`${API_PREFIX}*`, async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const pageKey = url.searchParams.get("pageKey") || "home";
      const method = request.method();
      if (url.pathname.endsWith("/document/validate")) {
        const body = request.postDataJSON() as { pageKey?: string };
        validations.push(body.pageKey || "");
        return route.fulfill(json({ valid: true, errors: [], issues: [] }));
      }
      if (method === "PUT") {
        writes.push(request.postDataJSON());
        return route.fulfill(json(draftDoc));
      }
      if (
        pageKey === "custom" &&
        (url.pathname.endsWith("/document/admin") ||
          url.pathname.endsWith("/document/published"))
      ) {
        await customGate;
      }
      if (url.pathname.endsWith("/document/published")) {
        return route.fulfill(json(pageKey === "home" ? publishedDoc : null));
      }
      if (url.pathname.endsWith("/document/admin")) {
        return route.fulfill(
          json(
            pageKey === "home"
              ? draftDoc
              : {
                  ...draftDoc,
                  pageKey: "custom",
                  puckData: {
                    content: [
                      {
                        type: "首屏主视觉",
                        props: { id: "custom-copy", title: "定制页草稿" },
                      },
                    ],
                    root: { props: {} },
                  },
                },
          ),
        );
      }
      return route.fulfill(json([]));
    });
    await authenticateAdmin(page);

    await page.goto("/admin/editor/home");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
    // 工具栏先于 650ms 防抖发布校验出现。直接等待初始 home 校验完成，
    // 不再用未经审核时必然禁用的发布按钮间接推断校验状态。
    await expect.poll(() => validations).toEqual(["home"]);
    validations.length = 0;

    await page.evaluate(() => {
      window.postMessage(
        {
          type: "homepage-editor:page-navigation",
          path: "/custom",
        },
        window.location.origin,
      );
    });
    await expect(page).toHaveURL(/\/admin\/editor\/custom$/);
    await expect(page.locator(".homepage-editor__toolbar")).toHaveCount(0);
    await expect(page.locator(".ant-spin-spinning")).toBeVisible();
    expect(writes).toEqual([]);
    expect(validations).toEqual([]);

    releaseCustom();
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
    expect(writes).toEqual([]);
    expect(routerWarnings).toEqual([]);
  });
});
