import { expect, test, type APIResponse, type Page } from "@playwright/test";

const realQaEnabled = process.env.PAGE_BUILDER_REAL_QA === "true";
const apiBaseUrl = process.env.PAGE_BUILDER_REAL_API_BASE_URL ?? "";
const browserBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "";
const username = process.env.PAGE_BUILDER_QA_USERNAME ?? "";
const password = process.env.PAGE_BUILDER_QA_PASSWORD ?? "";
const expectedApiBaseUrl = "http://127.0.0.1:3101/api";
const expectedBrowserBaseUrl = "http://127.0.0.1:5175";
const forwardedProtoHeaders = process.env.PLAYWRIGHT_FORWARDED_PROTO
  ? { "X-Forwarded-Proto": process.env.PLAYWRIGHT_FORWARDED_PROTO }
  : undefined;

const exactQaTarget = realQaEnabled
  && apiBaseUrl === expectedApiBaseUrl
  && browserBaseUrl === expectedBrowserBaseUrl
  && username.length > 0
  && password.length > 0;

function unwrap<T>(body: unknown): T {
  if (body && typeof body === "object" && "data" in body) {
    return (body as { data: T }).data;
  }
  return body as T;
}

async function responseData<T>(response: APIResponse): Promise<T> {
  expect(response.ok(), `${response.status()} ${response.url()} 应成功`).toBe(true);
  return unwrap<T>(await response.json());
}

async function browserWriteResult(
  page: Page,
  path: string,
  data: Record<string, unknown>,
  method: "PUT" | "POST" = "PUT",
) {
  return page.evaluate(async ({ url, payload, requestMethod }) => {
    const prefix = "hc_csrf=";
    const csrfCookie = document.cookie
      .split("; ")
      .find((item) => item.startsWith(prefix));
    const csrfToken = csrfCookie
      ? decodeURIComponent(csrfCookie.slice(prefix.length))
      : "";
    if (!csrfToken) throw new Error("登录后未获得 CSRF Cookie");

    const response = await fetch(url, {
      method: requestMethod,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
      },
      body: JSON.stringify(payload),
    });
    return {
      ok: response.ok,
      status: response.status,
      body: await response.json().catch(() => null),
    };
  }, { url: `/api${path}`, payload: data, requestMethod: method });
}

async function browserWrite<T>(
  page: Page,
  path: string,
  data: Record<string, unknown>,
  method: "PUT" | "POST" = "PUT",
): Promise<T> {
  const result = await browserWriteResult(page, path, data, method);

  expect(result.ok, `${result.status} ${path} 应成功`).toBe(true);
  return unwrap<T>(result.body);
}

async function loginThroughUi(page: Page) {
  await page.goto("/admin/login");
  await page.getByRole("textbox", { name: "用户名" }).fill(username);
  await page.locator("#admin-login-password").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
  await expect(page.getByRole("button", { name: /账户菜单/ })).toBeVisible();
}

async function recoverTemplateCatalogAfterThrottle(page: Page) {
  const retryButton = page.getByRole("button", { name: "重新读取", exact: true });
  await page.waitForTimeout(1_000);
  for (let attempt = 0; attempt < 3 && await retryButton.isVisible(); attempt += 1) {
    const responsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === "/api/page-modules/dynamic-templates/catalog";
    });
    await retryButton.click();
    const response = await responsePromise;
    if (response.ok()) {
      await expect(retryButton).toHaveCount(0);
      return;
    }
    expect(response.status()).toBe(429);
    const retryAfterSeconds = Number.parseInt(response.headers()["retry-after"] ?? "1", 10);
    await page.waitForTimeout((Math.min(Math.max(retryAfterSeconds, 1), 59) * 1_000) + 250);
  }
  await expect(retryButton).toHaveCount(0);
}

async function returnToPageWorkspaceAndOpenPublishedTemplate(
  page: Page,
  accessibleName: string,
) {
  let retryAfterSeconds = 60;
  const captureCatalogThrottle = (response: import("@playwright/test").Response) => {
    const url = new URL(response.url());
    if (
      response.status() === 429
      && url.pathname === "/api/page-modules/dynamic-templates/catalog"
    ) {
      const parsed = Number.parseInt(response.headers()["retry-after"] ?? "", 10);
      if (Number.isFinite(parsed) && parsed > 0) retryAfterSeconds = parsed;
    }
  };
  page.on("response", captureCatalogThrottle);
  try {
    await page.getByRole("button", { name: "页面装修", exact: true }).click();
    const templateButton = page.getByRole("button", { name: accessibleName });
    try {
      await expect(templateButton).toBeVisible({ timeout: 5_000 });
    } catch {
      const retryButton = page.getByRole("button", { name: "重新读取" });
      await expect(page.getByRole("alert")).toContainText("目录刷新失败");
      await expect(retryButton).toBeVisible();
      await page.waitForTimeout((Math.min(retryAfterSeconds, 60) + 1) * 1_000);
      await retryButton.click();
      await expect(templateButton).toBeVisible({ timeout: 15_000 });
    }
    await templateButton.click();
  } finally {
    page.off("response", captureCatalogThrottle);
  }
}

async function dragOverlayCompatibleHeroIntoCanvas(page: Page) {
  const card = page.getByRole("button", {
    name: "首屏：点击添加到页面末尾，也可拖到画布指定位置",
  });
  const canvas = page.locator(".homepage-editor__canvas-document");
  await card.scrollIntoViewIfNeeded();
  await expect(card).toBeInViewport();
  await expect(canvas).toBeVisible();
  const cardBox = await card.boundingBox();
  const canvasBox = await canvas.boundingBox();
  if (!cardBox || !canvasBox) throw new Error("模板卡片或页面画布没有可用尺寸");

  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + 120, {
    steps: 14,
  });
  await expect(page.getByText("在此插入")).toBeVisible();
  await page.mouse.up();
  await expect(page.getByText("已插入“首屏”，可在右侧继续编辑")).toBeVisible();
  await expect(page.locator(".homepage-editor__layer-item")).toHaveCount(1);
}

async function design1920By240Template(page: Page, templateName: string) {
  const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
  const structure = page.getByRole("complementary", { name: "模板结构" });
  const addSlot = async (label: "图片槽位" | "标题槽位" | "正文槽位" | "按钮槽位") => {
    await structure.getByRole("button", { name: "添加槽位", exact: true }).click();
    const palette = page.getByRole("dialog", { name: "添加槽位", exact: true });
    await palette.getByRole("button", { name: `添加${label}`, exact: true }).click();
    await expect(palette).toBeHidden();
  };
  await inspector.getByRole("textbox", { name: "模板名称", exact: true }).fill(templateName);
  await page.locator(".template-editor__toolbar")
    .getByRole("button", { name: "更多模板操作", exact: true }).click();
  await page.getByRole("menuitem", { name: /模板资料与使用限制/ }).click();
  await inspector.getByRole("button", { name: "导航兼容模式：浅色覆盖", exact: true }).click();

  await page.getByRole("button", { name: /^模板尺寸：/ }).click();
  const sizeControls = page.getByRole("group", { name: "模板整体尺寸" });
  await expect(sizeControls).toBeVisible();
  await sizeControls.getByRole("combobox", { name: "模板高度模式" }).selectOption("fixed");
  await sizeControls.getByRole("spinbutton", { name: "模板固定高度" }).fill("240");
  await sizeControls.getByRole("spinbutton", { name: "模板固定高度" }).press("Enter");
  await expect(sizeControls.getByRole("spinbutton", { name: "设计宽度" })).toHaveValue("1920");
  await expect(page.getByRole("button", { name: /^模板尺寸：/ })).toContainText("1920 × 240");

  await inspector.getByRole("button", { name: "容器布局：分列排列", exact: true }).click();
  await inspector.getByRole("button", { name: "容器列宽：2:3", exact: true }).click();
  await inspector.getByRole("spinbutton", { name: "槽位间距", exact: true }).fill("12");
  await inspector.getByRole("spinbutton", { name: "槽位间距", exact: true }).press("Enter");
  await inspector.getByRole("button", { name: "容器留白：紧凑", exact: true }).click();

  await structure.getByRole("button", { name: /添加区域/ }).click();
  await inspector.getByRole("textbox", { name: "节点名称" }).fill("文字区");
  await inspector.getByRole("button", { name: "容器布局：上下排列", exact: true }).click();
  const gapInput = inspector.getByRole("spinbutton", { name: "槽位间距", exact: true });
  const initialGap = await gapInput.inputValue();
  await gapInput.fill("4");
  await gapInput.press("Enter");
  await expect(gapInput).toHaveValue("4");
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect(gapInput).toHaveValue(initialGap);
  await page.getByRole("button", { name: "重做", exact: true }).click();
  await expect(gapInput).toHaveValue("4");
  await inspector.getByRole("button", { name: "容器留白：紧凑", exact: true }).click();

  await addSlot("标题槽位");
  await inspector.getByRole("spinbutton", { name: "槽位字号", exact: true }).fill("28");
  await inspector.getByRole("spinbutton", { name: "槽位字号", exact: true }).press("Enter");
  await addSlot("正文槽位");
  await addSlot("按钮槽位");

  await structure.getByRole("button", { name: /添加区域/ }).click();
  await inspector.getByRole("textbox", { name: "节点名称" }).fill("图片区");
  await inspector.getByRole("button", { name: "容器布局：上下排列", exact: true }).click();
  await inspector.getByRole("button", { name: "容器留白：紧凑", exact: true }).click();
  await addSlot("图片槽位");
  await inspector.getByRole("combobox", { name: "槽位高度方式" }).selectOption("fixed");
  await inspector.getByRole("spinbutton", { name: "槽位高度", exact: true }).fill("180");
  await inspector.getByRole("spinbutton", { name: "槽位高度", exact: true }).press("Enter");
  await inspector.getByRole("button", { name: "裁切填满", exact: true }).click();

  return { inspector, structure, sizeControls };
}

interface AcceptanceTemplateBlueprint {
  name: string;
  width: number;
  height: number;
  mobileHeight: number;
  imageFirst: boolean;
  dualColumn: boolean;
  textSlots: string[];
  imageRatio: "1:1" | "4:3" | "16:9" | "9:16";
  headingSize: number;
}

const ACCEPTANCE_TEMPLATE_BLUEPRINTS: AcceptanceTemplateBlueprint[] = [
  {
    name: "01 方形作品入口",
    width: 1080,
    height: 1080,
    mobileHeight: 488,
    imageFirst: false,
    dualColumn: false,
    textSlots: ["系列标识", "副标题", "作品说明", "辅助信息"],
    imageRatio: "1:1",
    headingSize: 48,
  },
  {
    name: "02 纵版作品海报",
    width: 1080,
    height: 1350,
    mobileHeight: 585,
    imageFirst: true,
    dualColumn: false,
    textSlots: ["分类标签", "作品说明", "系列署名"],
    imageRatio: "4:3",
    headingSize: 56,
  },
  {
    name: "03 移动沉浸品牌故事",
    width: 1080,
    height: 1920,
    mobileHeight: 693,
    imageFirst: true,
    dualColumn: false,
    textSlots: ["叙事眉题", "副标题", "日期或章节"],
    imageRatio: "9:16",
    headingSize: 72,
  },
  {
    name: "04 横向工艺专题",
    width: 1200,
    height: 627,
    mobileHeight: 520,
    imageFirst: false,
    dualColumn: true,
    textSlots: ["专题眉题", "专题摘要"],
    imageRatio: "4:3",
    headingSize: 50,
  },
  {
    name: "05 系列主视觉 Hero",
    width: 1920,
    height: 1080,
    mobileHeight: 693,
    imageFirst: false,
    dualColumn: true,
    textSlots: ["系列标识", "小标签", "主视觉说明"],
    imageRatio: "4:3",
    headingSize: 82,
  },
];

async function designAcceptanceTemplate(
  page: Page,
  blueprint: AcceptanceTemplateBlueprint,
) {
  const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
  const structure = page.getByRole("complementary", { name: "模板结构", exact: true });
  const addSlot = async (
    type: "图片槽位" | "标题槽位" | "正文槽位" | "按钮槽位",
    label: string,
  ) => {
    await structure.getByRole("button", { name: "添加槽位", exact: true }).click();
    const palette = page.getByRole("dialog", { name: "添加槽位", exact: true });
    await palette.getByRole("button", { name: `添加${type}`, exact: true }).click();
    await expect(palette).toBeHidden();
    const name = inspector.getByRole("textbox", { name: "槽位名称", exact: true });
    await name.fill(label);
    await name.press("Tab");
  };
  const addTextRegionContent = async () => {
    if (blueprint.textSlots[0]) await addSlot("正文槽位", blueprint.textSlots[0]);
    await addSlot("标题槽位", "主标题");
    await inspector.getByRole("spinbutton", { name: "槽位字号", exact: true })
      .fill(String(blueprint.headingSize));
    await inspector.getByRole("spinbutton", { name: "槽位字号", exact: true }).press("Enter");
    for (const label of blueprint.textSlots.slice(1)) {
      await addSlot("正文槽位", label);
    }
    await addSlot("按钮槽位", "行动入口");
  };
  const addImage = async () => {
    await addSlot("图片槽位", "主视觉图片");
    const ratio = inspector.getByRole("combobox", { name: "图片槽位比例" });
    await ratio.selectOption(blueprint.imageRatio);
    await inspector.getByRole("button", { name: "裁切填满", exact: true }).click();
    if (blueprint.imageRatio === "1:1" || blueprint.imageRatio === "9:16") {
      await inspector.getByRole("combobox", { name: "槽位宽度方式" }).selectOption("px");
      const imageWidth = blueprint.imageRatio === "9:16" ? 520 : 500;
      await inspector.getByRole("spinbutton", { name: "槽位宽度" }).fill(String(imageWidth));
      await inspector.getByRole("spinbutton", { name: "槽位宽度" }).press("Enter");
    }
  };

  await inspector.getByRole("textbox", { name: "模板名称", exact: true }).fill(blueprint.name);
  await page.getByRole("button", { name: /^模板尺寸：/ }).click();
  const sizeControls = page.getByRole("group", { name: "模板整体尺寸" });
  await sizeControls.getByRole("spinbutton", { name: "设计宽度" }).fill(String(blueprint.width));
  await sizeControls.getByRole("spinbutton", { name: "设计宽度" }).press("Enter");
  await sizeControls.getByRole("combobox", { name: "模板高度模式" }).selectOption("fixed");
  await sizeControls.getByRole("spinbutton", { name: "模板固定高度" }).fill(String(blueprint.height));
  await sizeControls.getByRole("spinbutton", { name: "模板固定高度" }).press("Enter");

  if (blueprint.dualColumn) {
    await inspector.getByRole("button", { name: "容器布局：分列排列", exact: true }).click();
    await inspector.getByRole("button", { name: "容器列宽：2:3", exact: true }).click();
  } else {
    await inspector.getByRole("button", { name: "容器布局：上下排列", exact: true }).click();
  }
  await inspector.getByRole("spinbutton", { name: "槽位间距", exact: true }).fill(blueprint.dualColumn ? "48" : "0");
  await inspector.getByRole("spinbutton", { name: "槽位间距", exact: true }).press("Enter");
  await inspector.getByRole("button", { name: blueprint.width >= 1200 ? "容器留白：宽松" : "容器留白：标准", exact: true }).click();

  await structure.getByRole("button", { name: "添加区域", exact: true }).click();
  await inspector.getByRole("textbox", { name: "节点名称", exact: true })
    .fill(blueprint.dualColumn ? "文案区域" : "内容区域");
  await inspector.getByRole("button", { name: "容器布局：上下排列", exact: true }).click();
  await inspector.getByRole("spinbutton", { name: "槽位间距", exact: true }).fill(blueprint.dualColumn ? "16" : "12");
  await inspector.getByRole("spinbutton", { name: "槽位间距", exact: true }).press("Enter");
  await inspector.getByRole("button", { name: "容器留白：紧凑", exact: true }).click();

  if (!blueprint.dualColumn && blueprint.imageFirst) await addImage();
  await addTextRegionContent();
  if (!blueprint.dualColumn && !blueprint.imageFirst) await addImage();

  if (blueprint.dualColumn) {
    await structure.getByRole("button", { name: "添加区域", exact: true }).click();
    await inspector.getByRole("textbox", { name: "节点名称", exact: true }).fill("媒体区域");
    await inspector.getByRole("button", { name: "容器布局：上下排列", exact: true }).click();
    await inspector.getByRole("button", { name: "容器留白：紧凑", exact: true }).click();
    await addImage();
  }

  await page.getByRole("button", { name: /^移动端模板布局/ }).click();
  await page.getByRole("button", { name: /^模板尺寸：/ }).click();
  await sizeControls.getByRole("spinbutton", { name: "设计宽度" }).fill("390");
  await sizeControls.getByRole("spinbutton", { name: "设计宽度" }).press("Enter");
  await sizeControls.getByRole("combobox", { name: "模板高度模式" }).selectOption("fixed");
  await sizeControls.getByRole("spinbutton", { name: "模板固定高度" }).fill(String(blueprint.mobileHeight));
  await sizeControls.getByRole("spinbutton", { name: "模板固定高度" }).press("Enter");
  const mobileRootTarget = page.getByRole("button", {
    name: "选择模板目标 模板根节点",
    exact: true,
  });
  await mobileRootTarget.focus();
  await mobileRootTarget.press("Enter");
  await inspector.getByRole("button", { name: "容器布局：上下排列", exact: true }).click();
  await page.getByRole("button", { name: "选择模板目标 主视觉图片", exact: true }).click();
  await inspector.getByRole("combobox", { name: "槽位宽度方式" }).selectOption("px");
  const mobileImageWidth = blueprint.imageRatio === "9:16" ? 240 : blueprint.imageRatio === "1:1" ? 220 : 300;
  await inspector.getByRole("spinbutton", { name: "槽位宽度" }).fill(String(mobileImageWidth));
  await inspector.getByRole("spinbutton", { name: "槽位宽度" }).press("Enter");
  await page.getByRole("button", { name: /^桌面端模板布局/ }).click();

  return { inspector, structure, sizeControls };
}

test.describe("店铺装修真实浏览器闭环（一次性 MySQL + 真实 NestJS API）", () => {
  test.describe.configure({ mode: "serial" });

  test.skip(
    !exactQaTarget,
    "仅在显式 PAGE_BUILDER_REAL_QA=true 且使用 127.0.0.1:3101/5175 一次性环境时运行",
  );

  test("拖入模板、编辑、保存、刷新、预览、发布，并保持未发布草稿与公开快照隔离", async ({
    browser,
    page,
  }, testInfo) => {
    const pageKey = "products";
    const publishedTitle = "真实浏览器闭环页面";
    const draftOnlyTitle = "仅存在于未发布草稿";
    const metadata = {
      seoTitle: "真实浏览器闭环 | 海川珠宝",
      seoDescription: "验证店铺装修从页面编辑到公开 Renderer 的真实保存与发布链路。",
      ogImage: "",
      contentOwner: "店铺装修 QA",
      mediaRights: [],
    };

    await page.setViewportSize({ width: 1440, height: 900 });
    await loginThroughUi(page);

    const previousPublished = await responseData<{ version: number } | null>(
      await page.request.get(
        `${apiBaseUrl}/page-modules/document/published/admin?pageKey=${pageKey}`,
      ),
    );
    const expectedPublishedVersion = (previousPublished?.version ?? 0) + 1;
    const currentDraft = await responseData<{ updatedAt: string } | null>(
      await page.request.get(
        `${apiBaseUrl}/page-modules/document/admin?pageKey=${pageKey}`,
      ),
    );
    const seeded = await browserWrite<{ updatedAt: string }>(
      page,
      "/page-modules/document",
      {
        pageKey,
        puckData: { content: [], zones: {}, root: { props: {} } },
        metadata,
        editorVersion: "0.22.4",
        ...(currentDraft ? { expectedUpdatedAt: currentDraft.updatedAt } : {}),
      },
    );
    expect(Date.parse(seeded.updatedAt)).not.toBeNaN();

    await page.goto(`/admin/editor/${pageKey}`);
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
    await dragOverlayCompatibleHeroIntoCanvas(page);

    const inspector = page.locator(".homepage-editor__inspector");
    const titleInput = inspector.getByRole("textbox", {
      name: "主标题",
      exact: true,
    });
    const bodyInput = inspector.getByRole("textbox", {
      name: "副标题",
      exact: true,
    });
    await titleInput.fill(publishedTitle);
    await expect(titleInput).toHaveValue(publishedTitle);
    await bodyInput.fill("页面内容通过真实属性面板写入，并由同一公开 Renderer 展示。");
    await expect(titleInput).toHaveValue(publishedTitle);
    await inspector.getByRole("textbox", { name: "图片替代文字", exact: true })
      .fill("珠宝首屏闭环测试图片");

    const uploadVisibleHeroImage = async () => {
      const uploadResponse = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return response.request().method() === "POST"
          && url.pathname === "/api/upload/image";
      });
      const chooser = page.waitForEvent("filechooser");
      await inspector.getByRole("button", { name: /拖入图片，或点击选择文件/ }).click();
      await (await chooser).setFiles("public/images/admin/templates/jewelry-home-wireframe.png");
      expect((await uploadResponse).ok()).toBe(true);
      await expect(inspector.getByRole("button", { name: "点击更换当前图片" })).toBeVisible();
    };
    await uploadVisibleHeroImage();
    await page.getByRole("button", { name: /^移动端布局/ }).click();
    await inspector.getByRole("button", { name: "单独设置手机端" }).click();
    await expect(inspector.getByRole("button", { name: "点击更换当前图片" })).toBeVisible();
    await page.getByRole("button", { name: /^桌面端布局/ }).click();

    await page.getByRole("button", { name: "预览当前画布" }).click();
    await expect(page.getByText("当前画布预览 · 1920 × 1200")).toBeVisible();
    await expect(
      page.frameLocator(".homepage-editor__canvas-scale iframe").getByText(publishedTitle),
    ).toBeVisible();
    await page.getByRole("button", { name: "退出当前画布预览" }).click();

    await page.getByRole("button", { name: "更多编辑操作" }).click();
    await page.getByRole("menuitem", { name: "页面设置" }).click();
    const settings = page.getByRole("dialog", { name: "页面展示设置" });
    await settings.getByRole("textbox", { name: "素材 1 来源" }).fill("QA 自有测试素材");
    await settings.getByRole("textbox", { name: "素材 1 授权编号" }).fill("QA-REAL-CLOSURE-001");
    const saveResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "PUT"
        && url.pathname === "/api/page-modules/document";
    });
    await settings.getByRole("button", { name: "保存整页草稿" }).click();
    expect((await saveResponse).ok()).toBe(true);
    await expect(settings).toBeHidden();

    await page.reload();
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
    await expect(
      inspector.getByRole("textbox", { name: "主标题", exact: true }),
    ).toHaveValue(publishedTitle);
    await expect(
      page.frameLocator(".homepage-editor__canvas-scale iframe").getByText(publishedTitle),
    ).toBeVisible();

    const validation = await browserWrite<{
      valid: boolean;
      errors: string[];
    }>(page, "/page-modules/document/validate", { pageKey }, "POST");
    expect(validation.valid, JSON.stringify(validation.errors)).toBe(true);
    const publishButton = page.locator(".homepage-editor__toolbar-publish");
    await expect(publishButton).toBeEnabled({ timeout: 15_000 });
    const publishResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "PUT"
        && url.pathname === "/api/page-modules/document/publish";
    });
    await publishButton.click();
    expect((await publishResponse).ok()).toBe(true);

    const anonymous = await browser.newContext({
      viewport: { width: 1200, height: 900 },
      extraHTTPHeaders: forwardedProtoHeaders,
    });
    const publicPage = await anonymous.newPage();
    const publicApi = await responseData<{
      version: number;
      puckData: { content: Array<{ props?: Record<string, unknown> }> };
    }>(await anonymous.request.get(
      `${apiBaseUrl}/page-modules/document/published?pageKey=${pageKey}&locale=zh-CN`,
    ));
    expect(publicApi.version).toBe(expectedPublishedVersion);
    expect(publicApi.puckData.content[0]?.props?.title).toBe(publishedTitle);

    await publicPage.goto(`${browserBaseUrl}/products`);
    await expect(publicPage.getByText(publishedTitle)).toBeVisible();
    const publicRenderer = publicPage.locator('[data-content-template="hero"]');
    await expect(publicRenderer).toBeVisible();
    await expect.poll(() => publicRenderer.evaluate((node) => node.getBoundingClientRect().height))
      .toBeGreaterThan(20);
    await expect.poll(() => publicPage.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    )).toBe(true);
    await publicPage.screenshot({
      path: testInfo.outputPath("page-builder-public-1200x900.png"),
      fullPage: true,
    });

    await publicPage.setViewportSize({ width: 390, height: 844 });
    await publicPage.reload();
    await expect(publicPage.getByText(publishedTitle)).toBeVisible();
    await expect(publicRenderer).toHaveAttribute("data-mobile-order", /.+/);
    await expect.poll(() => publicPage.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    )).toBe(true);
    await publicPage.screenshot({
      path: testInfo.outputPath("page-builder-public-390x844.png"),
      fullPage: true,
    });

    await titleInput.fill(draftOnlyTitle);
    const draftSaveResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "PUT"
        && url.pathname === "/api/page-modules/document";
    });
    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    expect((await draftSaveResponse).ok()).toBe(true);

    await publicPage.reload();
    await expect(publicPage.getByText(publishedTitle)).toBeVisible();
    await expect(publicPage.getByText(draftOnlyTitle)).toHaveCount(0);
    const publishedAfterDraft = await responseData<{
      version: number;
      puckData: { content: Array<{ props?: Record<string, unknown> }> };
    }>(await anonymous.request.get(
      `${apiBaseUrl}/page-modules/document/published?pageKey=${pageKey}&locale=zh-CN`,
    ));
    expect(publishedAfterDraft.version).toBe(expectedPublishedVersion);
    expect(publishedAfterDraft.puckData.content[0]?.props?.title).toBe(publishedTitle);

    await anonymous.close();
  });

  test("真实网站从零创建并往返加载五种画布模板", async ({ page }, testInfo) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await loginThroughUi(page);
    await page.goto("/admin/editor/products");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "模板设计", exact: true }).click();

    const created: Array<{ templateId: string; blueprint: AcceptanceTemplateBlueprint }> = [];
    for (const blueprint of ACCEPTANCE_TEMPLATE_BLUEPRINTS) {
      await page.getByRole("button", { name: "新建模板", exact: true }).click();
      const { sizeControls } = await designAcceptanceTemplate(page, blueprint);
      await page.screenshot({
        path: testInfo.outputPath(`${blueprint.name.replace(/\s+/g, "-")}-editor.png`),
        fullPage: true,
      });

      const createResponsePromise = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return response.request().method() === "POST"
          && url.pathname === "/api/page-modules/dynamic-templates";
      });
      await page.getByRole("button", { name: "保存模板", exact: true }).click();
      const record = await responseData<{ templateId: string }>(await createResponsePromise);
      created.push({ templateId: record.templateId, blueprint });
      await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();

      await page.reload();
      await page.getByRole("button", { name: "模板设计", exact: true }).click();
      await page.getByRole("textbox", { name: "搜索模板", exact: true }).fill(blueprint.name);
      await page.getByRole("button", {
        name: new RegExp(`(?:打开|正在编辑)${blueprint.name}模板`),
      }).click();
      await page.getByRole("button", { name: /^模板尺寸：/ }).click();
      await expect(sizeControls.getByRole("spinbutton", { name: "设计宽度" }))
        .toHaveValue(String(blueprint.width));
      await expect(sizeControls.getByRole("spinbutton", { name: "模板固定高度" }))
        .toHaveValue(String(blueprint.height));

      const publishResponsePromise = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return response.request().method() === "POST"
          && url.pathname === `/api/page-modules/dynamic-templates/${record.templateId}/publish`;
      });
      await page.getByRole("button", { name: /^发布模板新版本/ }).click();
      expect((await publishResponsePromise).ok()).toBe(true);
      await expect(page.getByText("模板 v1 已发布；现有页面仍保持原版本")).toBeVisible();

      const published = await responseData<{
        definition: {
          metadata: { previewDesktopWidth: number; previewMobileWidth: number };
          rootNodeId: string;
          nodes: Record<string, {
            type: string;
            childIds: string[];
            responsive: {
              desktop: { height: { mode: string; value?: { value: number } } };
              mobile: { height: { mode: string; value?: { value: number } } };
            };
          }>;
          slots: Record<string, { type: string; desktopRules: { objectFit?: string } }>;
          defaultContent: Record<string, unknown>;
          previewContent: Record<string, unknown>;
        };
      }>(await page.request.get(
        `${apiBaseUrl}/page-modules/dynamic-templates/published/${record.templateId}/versions/1`,
      ));
      const definition = published.definition;
      const root = definition.nodes[definition.rootNodeId];
      expect(definition.metadata.previewDesktopWidth).toBe(blueprint.width);
      expect(definition.metadata.previewMobileWidth).toBe(390);
      expect(root.responsive.desktop.height.value?.value).toBe(blueprint.height);
      expect(root.responsive.mobile.height.value?.value).toBe(blueprint.mobileHeight);
      expect(Object.values(definition.slots).filter((slot) => slot.type === "image")).toHaveLength(1);
      expect(Object.values(definition.slots).filter((slot) => slot.type === "heading")).toHaveLength(1);
      expect(Object.values(definition.slots).filter((slot) => slot.type === "button")).toHaveLength(1);
      expect(Object.values(definition.slots).find((slot) => slot.type === "image")?.desktopRules.objectFit)
        .toBe("cover");
      expect(root.childIds).toHaveLength(blueprint.dualColumn ? 2 : 1);
      expect(definition.defaultContent).toEqual({});
      expect(definition.previewContent).toEqual({});
    }

    const catalog = await responseData<{
      items: Array<{ kind: string; template: { templateId?: string; version?: number } }>;
    }>(await page.request.get(`${apiBaseUrl}/page-modules/dynamic-templates/catalog`));
    for (const { templateId } of created) {
      expect(catalog.items.some((item) => (
        item.kind === "published"
        && item.template.templateId === templateId
        && item.template.version === 1
      ))).toBe(true);
    }

    for (const viewport of [
      { width: 1600, height: 1000 },
      { width: 1280, height: 800 },
      { width: 1024, height: 768 },
    ]) {
      await page.setViewportSize(viewport);
      await expect.poll(() => page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      )).toBe(true);
    }
  });

  test("真实网站完成 1920×240 模板设计、页面内容、版本锁定、回收站与恢复闭环", async ({
    browser,
    page,
  }, testInfo) => {
    test.setTimeout(300_000);
    const pageKey = "products";
    const templateNameV1 = "真实闭环临时模板";
    const templateNameV2 = "真实闭环临时模板 v2";

    await page.setViewportSize({ width: 1600, height: 1000 });
    await loginThroughUi(page);

    const currentDraft = await responseData<{ updatedAt: string } | null>(
      await page.request.get(
        `${apiBaseUrl}/page-modules/document/admin?pageKey=${pageKey}`,
      ),
    );
    await browserWrite(page, "/page-modules/document", {
      pageKey,
      puckData: { content: [], zones: {}, root: { props: {} } },
      metadata: {
        seoTitle: "模板设计真实闭环 | 海川珠宝",
        seoDescription: "验证母模板结构、页面实例内容与公开 Renderer 的真实发布链路。",
        ogImage: "",
        contentOwner: "模板设计 QA",
        mediaRights: [],
      },
      editorVersion: "0.22.4",
      ...(currentDraft ? { expectedUpdatedAt: currentDraft.updatedAt } : {}),
    });

    await page.goto(`/admin/editor/${pageKey}`);
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();
    const workspaceSwitch = page.getByRole("group", { name: "店铺装修工作模式切换" });
    await expect(workspaceSwitch).toHaveAttribute("data-active-mode", "page");

    await expect(workspaceSwitch).toHaveAttribute("data-active-mode", "page");
    await expect(page.locator(".template-editor__toolbar")).toHaveCount(0);

    await page.getByRole("button", { name: "模板设计", exact: true }).click();
    await expect(page.locator(".template-editor__toolbar")).toBeVisible();
    await page.getByRole("button", { name: "新建模板", exact: true }).click();
    const { sizeControls } = await design1920By240Template(page, templateNameV1);
    await page.screenshot({
      path: testInfo.outputPath("dynamic-template-editor-1920x240-structure.png"),
      fullPage: true,
    });
    const createResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "POST"
        && url.pathname === "/api/page-modules/dynamic-templates";
    });
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    const createdTemplate = await responseData<{ templateId: string }>(await createResponsePromise);
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();

    await page.reload();
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "模板设计", exact: true }).click();
    await recoverTemplateCatalogAfterThrottle(page);
    await page.getByRole("button", {
      name: new RegExp(`(?:打开|正在编辑)${templateNameV1}模板`),
    }).click();
    await page.getByRole("button", { name: /^模板尺寸：/ }).click();
    await expect(sizeControls).toBeVisible();
    await expect(sizeControls.getByRole("spinbutton", { name: "设计宽度" })).toHaveValue("1920");
    await expect(sizeControls.getByRole("spinbutton", { name: "模板固定高度" })).toHaveValue("240");
    await expect(page.getByRole("complementary", { name: "模板结构" })).toContainText("图片区");
    await expect(page.getByRole("complementary", { name: "模板结构" })).toContainText("文字区");

    await page.getByRole("button", { name: "预览模板" }).click();
    const previewScenario = page.getByRole("combobox", { name: "预览内容场景" });
    for (const scenario of ["default", "empty", "long-text", "missing-image"] as const) {
      await previewScenario.selectOption(scenario);
      await expect(page.frameLocator("iframe.template-editor__viewport-frame")
        .locator(".template-editor__dynamic-canvas-renderer"))
        .toHaveAttribute("data-preview-scenario", scenario);
      await page.screenshot({
        path: testInfo.outputPath(`dynamic-template-preview-${scenario}.png`),
        fullPage: true,
      });
    }
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "页面装修", exact: true }).click();
    await expect(page.getByRole("button", {
      name: new RegExp(`添加${templateNameV1}版本`),
    })).toHaveCount(0);
    await expect(page.locator(
      `[data-template-identity="template:${createdTemplate.templateId}"]`,
    )).toHaveCount(0);
    await expect(workspaceSwitch).toHaveAttribute("data-active-mode", "page");

    await page.getByRole("button", { name: "模板设计", exact: true }).click();
    await page.getByRole("button", {
      name: new RegExp(`(?:打开|正在编辑)${templateNameV1}模板`),
    }).click();
    const publishV1ResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "POST"
        && url.pathname === `/api/page-modules/dynamic-templates/${createdTemplate.templateId}/publish`;
    });
    await page.getByRole("button", { name: "发布模板新版本" }).click();
    expect((await publishV1ResponsePromise).ok()).toBe(true);
    await expect(page.getByText("模板 v1 已发布；现有页面仍保持原版本")).toBeVisible();
    const publishedV1 = await responseData<{
      definition: {
        nodes: Record<string, { nodeId: string; name: string; slotId?: string }>;
        slots: Record<string, { slotId: string; key: string }>;
        defaultContent: Record<string, unknown>;
        previewContent: Record<string, unknown>;
      };
    }>(await page.request.get(
      `${apiBaseUrl}/page-modules/dynamic-templates/published/${createdTemplate.templateId}/versions/1`,
    ));
    const slotsByKey = Object.fromEntries(
      Object.values(publishedV1.definition.slots).map((slot) => [slot.key, slot]),
    );
    expect(publishedV1.definition.defaultContent).toEqual({});
    expect(publishedV1.definition.previewContent).toEqual({});
    expect(JSON.stringify(publishedV1.definition)).not.toContain("周年典藏系列");

    await page.getByRole("button", { name: "页面装修", exact: true }).click();
    const publishedV1Control = page.getByRole("button", {
      name: `添加${templateNameV1}版本1`,
    });
    await expect(publishedV1Control).toBeVisible();
    await publishedV1Control.click();
    await publishedV1Control.click();
    await expect(page.locator(".homepage-editor__layer-item")).toHaveCount(2);

    const instanceInspector = page.getByRole("region", { name: "模板实例属性" });
    await expect(instanceInspector).toContainText(`固定版本 ${createdTemplate.templateId} v1`);
    await instanceInspector.getByRole("textbox", { name: "标题槽位" }).fill("周年典藏系列");
    await instanceInspector.getByRole("textbox", { name: "正文槽位" })
      .fill("以克制留白呈现珠宝工艺与佩戴光泽。");
    await instanceInspector.getByRole("textbox", { name: "按钮槽位文案" }).fill("查看系列");
    await instanceInspector.getByRole("group", { name: "按钮槽位跳转" })
      .getByRole("button", { name: "页面" }).click();
    await instanceInspector.getByRole("combobox", { name: "站内页面" }).fill("/products");
    const imageField = instanceInspector.locator(`[data-slot-id="${slotsByKey.image.slotId}"]`);
    const uploadImageResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "POST"
        && url.pathname === "/api/upload/image";
    });
    const imageChooserPromise = page.waitForEvent("filechooser");
    await imageField.getByRole("button", { name: /拖入图片或点击上传/ }).click();
    await (await imageChooserPromise).setFiles(
      "public/images/admin/templates/jewelry-home-wireframe.png",
    );
    const uploadedImage = await responseData<{ url: string }>(await uploadImageResponsePromise);
    await expect(imageField.getByRole("button", { name: "替换图片" })).toBeVisible();
    await imageField.getByRole("textbox", { name: "图片槽位替代文字" })
      .fill("周年典藏系列珠宝工艺展示");
    await instanceInspector.getByRole("group", { name: "页面实例属性范围" })
      .getByRole("button", { name: "标题槽位", exact: true }).click();
    await expect(instanceInspector.getByText("水平偏移", { exact: true })).toHaveCount(0);
    await expect(instanceInspector.getByText("垂直偏移", { exact: true })).toHaveCount(0);
    await expect(instanceInspector.getByText("区域宽度", { exact: true })).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath("dynamic-template-v1-repeat.png"),
      fullPage: true,
    });

    const saveV1PageResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "PUT"
        && url.pathname === "/api/page-modules/document";
    });
    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    expect((await saveV1PageResponsePromise).ok()).toBe(true);
    await page.reload();
    await expect(page.locator(".homepage-editor__layer-item")).toHaveCount(2);

    const draftAfterV1 = await responseData<{
      updatedAt: string;
      metadata: Record<string, unknown>;
      editorVersion?: string;
      puckData: { content: Array<{ props?: Record<string, unknown> }> };
    }>(await page.request.get(
      `${apiBaseUrl}/page-modules/document/admin?pageKey=${pageKey}`,
    ));
    const v1Instances = draftAfterV1.puckData.content.filter((block) => (
      block.props?.templateId === createdTemplate.templateId
    ));
    expect(v1Instances).toHaveLength(2);
    expect(v1Instances.every((block) => block.props?.templateVersion === 1)).toBe(true);
    const populatedV1 = v1Instances.find((block) => (
      (block.props?.contentBySlotId as Record<string, unknown> | undefined)?.[slotsByKey.heading.slotId]
      === "周年典藏系列"
    ));
    expect(populatedV1?.props?.layoutOverridesByNodeId).toEqual({});
    expect(populatedV1?.props?.nodes).toBeUndefined();
    expect(populatedV1?.props?.slots).toBeUndefined();
    expect(populatedV1?.props?.definition).toBeUndefined();
    expect(populatedV1?.props?.contentBySlotId).toMatchObject({
      [slotsByKey.image.slotId]: { src: uploadedImage.url },
      [slotsByKey.heading.slotId]: "周年典藏系列",
      [slotsByKey.description.slotId]: "以克制留白呈现珠宝工艺与佩戴光泽。",
      [slotsByKey.button.slotId]: {
        label: "查看系列",
        targetType: "page",
        pagePath: "/products",
      },
    });

    const headingNode = Object.values(publishedV1.definition.nodes).find(
      (node) => node.slotId === slotsByKey.heading.slotId,
    );
    if (!headingNode) throw new Error("正式模板 v1 缺少标题槽位节点");
    const forgedPuckData = structuredClone(draftAfterV1.puckData);
    const forgedInstance = forgedPuckData.content.find((block) => (
      (block.props?.contentBySlotId as Record<string, unknown> | undefined)?.[
        slotsByKey.heading.slotId
      ] === "周年典藏系列"
    ));
    if (!forgedInstance?.props) throw new Error("页面草稿缺少待伪造的 v1 实例");
    forgedInstance.props.layoutOverridesByNodeId = {
      [headingNode.nodeId]: {
        desktop: { offsetXPercent: 12, widthPercent: 120 },
      },
    };
    const forbiddenLayoutWrite = await browserWriteResult(page, "/page-modules/document", {
      pageKey,
      puckData: forgedPuckData,
      metadata: draftAfterV1.metadata,
      editorVersion: draftAfterV1.editorVersion,
      expectedUpdatedAt: draftAfterV1.updatedAt,
    });
    expect(forbiddenLayoutWrite.status).toBe(400);
    expect(JSON.stringify(forbiddenLayoutWrite.body)).toContain("页面实例构图覆盖无效");
    const draftAfterForbiddenWrite = await responseData<{
      updatedAt: string;
      puckData: { content: Array<{ props?: Record<string, unknown> }> };
    }>(await page.request.get(
      `${apiBaseUrl}/page-modules/document/admin?pageKey=${pageKey}`,
    ));
    expect(draftAfterForbiddenWrite.updatedAt).toBe(draftAfterV1.updatedAt);
    const unchangedPopulatedV1 = draftAfterForbiddenWrite.puckData.content.find((block) => (
      (block.props?.contentBySlotId as Record<string, unknown> | undefined)?.[
        slotsByKey.heading.slotId
      ] === "周年典藏系列"
    ));
    expect(unchangedPopulatedV1?.props?.layoutOverridesByNodeId).toEqual({});

    const publishPageResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "PUT"
        && url.pathname === "/api/page-modules/document/publish";
    });
    const publishPageButton = page.locator(".homepage-editor__toolbar-publish");
    await expect(publishPageButton).toBeEnabled({ timeout: 15_000 });
    await publishPageButton.click();
    expect((await publishPageResponsePromise).ok()).toBe(true);
    await expect(page.getByText("珠宝作品已发布，前台页面将立即读取最新版本")).toBeVisible();

    const anonymous = await browser.newContext({
      viewport: { width: 1200, height: 900 },
      extraHTTPHeaders: forwardedProtoHeaders,
    });
    const publicPage = await anonymous.newPage();
    await publicPage.goto(`${browserBaseUrl}/products`);
    await expect(publicPage.getByText("周年典藏系列", { exact: true })).toBeVisible();
    const publicInstance = publicPage.locator('[data-dynamic-template-version="1"]')
      .filter({ has: publicPage.locator(`[data-dynamic-template-id="${createdTemplate.templateId}"]`) })
      .filter({ hasText: "周年典藏系列" })
      .first();
    await expect(publicInstance).toBeVisible();
    const imageRegionNode = Object.values(publishedV1.definition.nodes)
      .find((node) => node.name === "图片区");
    const textRegionNode = Object.values(publishedV1.definition.nodes)
      .find((node) => node.name === "文字区");
    if (!imageRegionNode || !textRegionNode) throw new Error("正式模板缺少图片区或文字区");
    const publicImageRegion = publicInstance.locator(
      `[data-template-node-id="${imageRegionNode.nodeId}"]`,
    );
    const publicTextRegion = publicInstance.locator(
      `[data-template-node-id="${textRegionNode.nodeId}"]`,
    );
    await expect(publicImageRegion).toBeVisible();
    await expect(publicTextRegion).toBeVisible();
    const desktopImageBox = await publicImageRegion.boundingBox();
    const desktopTextBox = await publicTextRegion.boundingBox();
    if (!desktopImageBox || !desktopTextBox) throw new Error("桌面公开模板区域没有可用尺寸");
    expect(desktopTextBox.x).toBeLessThan(desktopImageBox.x);
    expect(Math.abs(desktopImageBox.y - desktopTextBox.y)).toBeLessThanOrEqual(2);
    expect(desktopImageBox.width / desktopTextBox.width).toBeGreaterThan(1.45);
    expect(desktopImageBox.width / desktopTextBox.width).toBeLessThan(1.55);
    await expect.poll(() => publicPage.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    )).toBe(true);
    await publicPage.screenshot({
      path: testInfo.outputPath("dynamic-template-public-1200x900.png"),
      fullPage: true,
    });

    await publicPage.setViewportSize({ width: 390, height: 844 });
    await publicPage.reload();
    await expect(publicPage.getByText("周年典藏系列", { exact: true })).toBeVisible();
    const mobileImageBox = await publicImageRegion.boundingBox();
    const mobileTextBox = await publicTextRegion.boundingBox();
    if (!mobileImageBox || !mobileTextBox) throw new Error("移动公开模板区域没有可用尺寸");
    expect(mobileTextBox.y).toBeLessThan(mobileImageBox.y);
    expect(Math.abs(mobileImageBox.x - mobileTextBox.x)).toBeLessThanOrEqual(2);
    await expect.poll(() => publicPage.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    )).toBe(true);
    await publicPage.screenshot({
      path: testInfo.outputPath("dynamic-template-public-390x844.png"),
      fullPage: true,
    });
    await anonymous.close();

    await page.getByRole("button", { name: "模板设计", exact: true }).click();
    await page.getByRole("button", {
      name: new RegExp(`(?:打开|正在编辑)${templateNameV1}模板`),
    }).click();
    const templateInspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    await templateInspector.getByRole("textbox", { name: "模板名称", exact: true })
      .fill(templateNameV2);
    const updateResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "PATCH"
        && url.pathname === `/api/page-modules/dynamic-templates/${createdTemplate.templateId}/draft`;
    });
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    expect((await updateResponsePromise).ok()).toBe(true);
    const publishV2ResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "POST"
        && url.pathname === `/api/page-modules/dynamic-templates/${createdTemplate.templateId}/publish`;
    });
    await page.getByRole("button", { name: "发布模板新版本" }).click();
    expect((await publishV2ResponsePromise).ok()).toBe(true);

    await page.reload();
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "页面装修", exact: true }).click();
    await recoverTemplateCatalogAfterThrottle(page);
    const populatedV1Layer = page.locator(
      '.homepage-editor__layer-item[data-layer-index="1"] .homepage-editor__layer-select',
    );
    await populatedV1Layer.click();
    await expect(instanceInspector).toContainText("发现新版本 v2");
    await instanceInspector.getByRole("button", { name: "查看差异" }).click();
    const upgradeDialog = page.getByRole("dialog", { name: "模板版本升级：v1 → v2" });
    await expect(upgradeDialog).toContainText("周年典藏系列");
    await expect(upgradeDialog).toContainText("确认后只修改当前内存草稿并增加一条页面历史");
    await upgradeDialog.getByRole("button", { name: "确认升级页面草稿", exact: true }).click();
    await expect(page.getByText("页面实例已升级到 v2；尚未保存页面草稿，可使用页面撤销回退"))
      .toBeVisible();
    await expect(instanceInspector).toContainText(`固定版本 ${createdTemplate.templateId} v2`);
    await expect(instanceInspector.getByRole("textbox", { name: "标题槽位" }))
      .toHaveValue("周年典藏系列");
    await expect(instanceInspector.getByRole("textbox", { name: "正文槽位" }))
      .toHaveValue("以克制留白呈现珠宝工艺与佩戴光泽。");
    await page.screenshot({
      path: testInfo.outputPath("dynamic-template-explicit-upgrade-v1-to-v2.png"),
      fullPage: true,
    });

    const saveV2PageResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "PUT"
        && url.pathname === "/api/page-modules/document";
    });
    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    expect((await saveV2PageResponsePromise).ok()).toBe(true);
    await page.reload();
    await expect(page.locator(".homepage-editor__layer-item")).toHaveCount(2);

    const draftAfterV2 = await responseData<{
      puckData: { content: Array<{ props?: Record<string, unknown> }> };
    }>(await page.request.get(
      `${apiBaseUrl}/page-modules/document/admin?pageKey=${pageKey}`,
    ));
    const versionedInstances = draftAfterV2.puckData.content.filter((block) => (
      block.props?.templateId === createdTemplate.templateId
    ));
    expect(versionedInstances.map((block) => block.props?.templateVersion)).toEqual([1, 2]);
    const upgradedPopulatedV2 = versionedInstances.find((block) => (
      block.props?.templateVersion === 2
      && (block.props?.contentBySlotId as Record<string, unknown> | undefined)?.[
        slotsByKey.heading.slotId
      ] === "周年典藏系列"
    ));
    expect(upgradedPopulatedV2?.props?.contentBySlotId).toMatchObject({
      [slotsByKey.image.slotId]: { src: uploadedImage.url },
      [slotsByKey.heading.slotId]: "周年典藏系列",
      [slotsByKey.description.slotId]: "以克制留白呈现珠宝工艺与佩戴光泽。",
      [slotsByKey.button.slotId]: {
        label: "查看系列",
        targetType: "page",
        pagePath: "/products",
      },
    });
    const publishedAfterV2Draft = await responseData<{
      puckData: { content: Array<{ props?: Record<string, unknown> }> };
    }>(await page.request.get(
      `${apiBaseUrl}/page-modules/document/published?pageKey=${pageKey}&locale=zh-CN`,
    ));
    expect(publishedAfterV2Draft.puckData.content
      .filter((block) => block.props?.templateId === createdTemplate.templateId)
      .map((block) => block.props?.templateVersion))
      .toEqual([1, 1]);

    await page.getByRole("button", { name: "模板设计", exact: true }).click();
    await page.getByRole("button", {
      name: new RegExp(`(?:打开|正在编辑)${templateNameV2}模板`),
    }).click();
    await page.locator(".template-editor__toolbar")
      .getByRole("button", { name: "更多模板操作", exact: true }).click();
    await page.getByRole("menuitem", { name: "移入回收站" }).click();
    const archiveResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "POST"
        && url.pathname === `/api/page-modules/dynamic-templates/${createdTemplate.templateId}/archive`;
    });
    const archiveDialog = page.getByRole("dialog", { name: `将模板“${templateNameV2}”移入回收站？` });
    await archiveDialog
      .getByRole("button", { name: "移入回收站" })
      .click();
    expect((await archiveResponsePromise).ok()).toBe(true);
    await expect(archiveDialog).toBeHidden();

    await page.getByRole("button", { name: "页面装修", exact: true }).click();
    await expect(page.locator(
      `[data-template-identity="template:${createdTemplate.templateId}"]`,
    )).toHaveCount(0);
    await page.reload();
    await expect(page.locator(".homepage-editor__layer-item")).toHaveCount(2);
    await page.screenshot({
      path: testInfo.outputPath("dynamic-template-archived-existing-page.png"),
      fullPage: true,
    });

    await page.getByRole("button", { name: "模板设计", exact: true }).click();
    await page.getByRole("button", { name: "打开模板回收站" }).click();
    const restoreResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "POST"
        && url.pathname === `/api/page-modules/dynamic-templates/${createdTemplate.templateId}/restore`;
    });
    await page.getByRole("button", { name: `更多模板操作：${templateNameV2}` }).click();
    await page.getByRole("menuitem", { name: "恢复模板" }).click();
    await page.getByRole("dialog", { name: `恢复模板“${templateNameV2}”？` })
      .getByRole("button", { name: "恢复模板" })
      .click();
    expect((await restoreResponsePromise).ok()).toBe(true);
    await page.getByRole("button", { name: "页面装修", exact: true }).click();
    await expect(page.getByRole("button", {
      name: `添加${templateNameV2}版本2`,
    })).toBeVisible();

    const finalCatalog = await responseData<{
      items: Array<{
        kind: string;
        template: { templateId?: string; status?: string; version?: number };
      }>;
    }>(await page.request.get(
      `${apiBaseUrl}/page-modules/dynamic-templates/catalog`,
    ));
    expect(finalCatalog.items.some((item) => (
      item.kind === "editable"
        && item.template.templateId === createdTemplate.templateId
        && item.template.status === "ACTIVE"
    ))).toBe(true);
    expect(finalCatalog.items.some((item) => (
      item.kind === "published"
        && item.template.templateId === createdTemplate.templateId
        && item.template.version === 2
    ))).toBe(true);
  });

  test("真实网站以 Product Slot 选择真实商品 code，并阻断未就绪商品发布", async ({ page }, testInfo) => {
    test.fixme(true, "当前简化槽位工具未提供 Product Slot 创建入口，Schema 与 Renderer 能力无法由设计 UI 从零触达");
    test.setTimeout(120_000);
    const pageKey = "products";
    const templateName = "真实闭环商品槽位模板";
    const productCode = "HC-TEMPLATE-QA-001";

    await page.setViewportSize({ width: 1600, height: 1000 });
    await loginThroughUi(page);
    const category = await browserWrite<{ id: number }>(page, "/categories", {
      name: "模板闭环测试分类",
      slug: "template-closure-qa",
      isActive: true,
    }, "POST");
    await browserWrite(page, "/products", {
      name: "真实闭环测试商品",
      code: productCode,
      shortDescription: "仅存在于一次性隔离数据库的 Product Slot 测试商品。",
      categoryId: category.id,
      price: 12_800,
      status: "DRAFT",
      visibility: "INTERNAL",
      salesMode: "DISPLAY_ONLY",
    }, "POST");

    const currentDraft = await responseData<{ updatedAt: string } | null>(
      await page.request.get(
        `${apiBaseUrl}/page-modules/document/admin?pageKey=${pageKey}`,
      ),
    );
    await browserWrite(page, "/page-modules/document", {
      pageKey,
      puckData: { content: [], zones: {}, root: { props: {} } },
      metadata: {
        seoTitle: "Product Slot 真实闭环 | 海川珠宝",
        seoDescription: "验证页面装修只保存稳定商品 code，并阻止未就绪商品进入公开页面。",
        ogImage: "",
        contentOwner: "模板设计 QA",
        mediaRights: [],
      },
      editorVersion: "0.22.4",
      ...(currentDraft ? { expectedUpdatedAt: currentDraft.updatedAt } : {}),
    });

    await page.goto(`/admin/editor/${pageKey}`);
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "模板设计", exact: true }).click();
    await page.getByRole("button", { name: "新建模板", exact: true }).click();
    const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    await inspector.getByRole("textbox", { name: "模板名称", exact: true }).fill(templateName);
    await page.getByRole("button", { name: "商品槽位 内容槽位" }).click();

    const createResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "POST"
        && url.pathname === "/api/page-modules/dynamic-templates";
    });
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    const createdTemplate = await responseData<{ templateId: string }>(await createResponsePromise);
    const publishResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "POST"
        && url.pathname === `/api/page-modules/dynamic-templates/${createdTemplate.templateId}/publish`;
    });
    await page.getByRole("button", { name: "发布模板新版本" }).click();
    expect((await publishResponsePromise).ok()).toBe(true);
    const publishedTemplate = await responseData<{
      definition: { slots: Record<string, { slotId: string; key: string; type: string }> };
    }>(await page.request.get(
      `${apiBaseUrl}/page-modules/dynamic-templates/published/${createdTemplate.templateId}/versions/1`,
    ));
    const productSlot = Object.values(publishedTemplate.definition.slots)
      .find((slot) => slot.type === "product");
    if (!productSlot) throw new Error("正式模板缺少 Product Slot");

    await returnToPageWorkspaceAndOpenPublishedTemplate(
      page,
      `添加${templateName}版本1`,
    );
    const instanceInspector = page.getByRole("region", { name: "模板实例属性" });
    const productField = instanceInspector.locator(`[data-slot-id="${productSlot.slotId}"]`);
    await expect(productField).toContainText("从真实商品库选择");
    await productField.getByRole("button", { name: "选择商品", exact: true }).click();
    const productDialog = page.getByRole("dialog", { name: "选择商品" });
    await productDialog.getByRole("textbox", { name: "搜索商品名称或货号" }).fill(productCode);
    const productCard = productDialog.getByRole("button", { name: new RegExp(productCode) });
    await expect(productCard).toBeVisible();
    await expect(productCard).toContainText("草稿");
    await productCard.click();
    await productDialog.getByRole("button", { name: "确认选择（1）" }).click();
    await expect(productField).toContainText("已选择 1 件商品");
    await expect(page.frameLocator(".homepage-editor__canvas-scale iframe").getByText(productCode))
      .toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("dynamic-template-product-slot-selected.png"),
      fullPage: true,
    });

    const saveResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "PUT"
        && url.pathname === "/api/page-modules/document";
    });
    await page.getByRole("button", { name: "保存当前装修草稿" }).click();
    expect((await saveResponsePromise).ok()).toBe(true);
    const savedDraft = await responseData<{
      updatedAt: string;
      puckData: { content: Array<{ props?: Record<string, unknown> }> };
    }>(await page.request.get(
      `${apiBaseUrl}/page-modules/document/admin?pageKey=${pageKey}`,
    ));
    const productInstance = savedDraft.puckData.content.find(
      (block) => block.props?.templateId === createdTemplate.templateId,
    );
    expect(productInstance?.props?.contentBySlotId).toEqual({
      [productSlot.slotId]: productCode,
    });
    expect(productInstance?.props?.product).toBeUndefined();
    expect(productInstance?.props?.productId).toBeUndefined();

    const blockedPublish = await browserWriteResult(page, "/page-modules/document/publish", {
      pageKey,
      expectedUpdatedAt: savedDraft.updatedAt,
    });
    expect(blockedPublish.status).toBe(400);
    expect(JSON.stringify(blockedPublish.body)).toContain(productCode);
    expect(JSON.stringify(blockedPublish.body)).toContain("未满足公开发布条件");
  });

  test("真实网站区分放弃未保存模板与回收站永久删除", async ({ page }) => {
    test.setTimeout(300_000);
    const unsavedName = "真实闭环待放弃模板";
    const draftName = "真实闭环待删除草稿";
    const createRequests: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (
        request.method() === "POST"
        && url.pathname === "/api/page-modules/dynamic-templates"
      ) {
        createRequests.push(url.pathname);
      }
    });

    await page.setViewportSize({ width: 1600, height: 1000 });
    await loginThroughUi(page);
    await page.goto("/admin/editor/home");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "模板设计", exact: true }).click();
    await recoverTemplateCatalogAfterThrottle(page);
    await page.getByRole("button", { name: "新建模板", exact: true }).click();
    const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    await inspector.getByRole("textbox", { name: "模板名称", exact: true }).fill(unsavedName);
    await page.locator(".template-editor__toolbar")
      .getByRole("button", { name: "更多模板操作", exact: true }).click();
    await page.getByRole("menuitem", { name: /关闭模板会话/ }).click();
    const discardDialog = page.getByRole("dialog", {
      name: `关闭“${unsavedName}”的模板编辑会话？`,
    });
    await expect(discardDialog).toContainText("当前模板还有未保存修改");
    await discardDialog.getByRole("button", { name: "不保存并关闭" }).click();
    await expect(inspector.getByRole("textbox", { name: "模板名称", exact: true })).toHaveCount(0);
    expect(createRequests).toHaveLength(0);

    await page.getByRole("button", { name: "新建模板", exact: true }).click();
    await inspector.getByRole("textbox", { name: "模板名称", exact: true }).fill(draftName);
    const structure = page.getByRole("complementary", { name: "模板结构", exact: true });
    await structure.getByRole("button", { name: "添加槽位", exact: true }).click();
    await page.getByRole("dialog", { name: "添加槽位", exact: true })
      .getByRole("button", { name: "添加标题槽位", exact: true }).click();
    const createResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "POST"
        && url.pathname === "/api/page-modules/dynamic-templates";
    });
    await page.getByRole("button", { name: "保存模板", exact: true }).click();
    const createdDraft = await responseData<{ templateId: string }>(await createResponsePromise);
    await expect(page.getByText("模板草稿已保存，可继续设计或发布")).toBeVisible();

    await page.getByRole("button", { name: `更多模板操作：${draftName}` }).click();
    await page.getByRole("menuitem", { name: "移入回收站" }).click();
    const trashResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "POST"
        && url.pathname === `/api/page-modules/dynamic-templates/${createdDraft.templateId}/archive`;
    });
    await page.getByRole("dialog", { name: `将模板“${draftName}”移入回收站？` })
      .getByRole("button", { name: "移入回收站" })
      .click();
    expect((await trashResponsePromise).ok()).toBe(true);
    await page.getByRole("button", { name: "打开模板回收站" }).click();
    await page.getByRole("button", { name: `更多模板操作：${draftName}` }).click();
    await page.getByRole("menuitem", { name: "永久删除模板" }).click();
    const deleteDialog = page.getByRole("dialog", { name: `永久删除模板“${draftName}”？` });
    await expect(deleteDialog).toContainText("没有版本历史且未被页面引用");
    const deleteResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "DELETE"
        && url.pathname === `/api/page-modules/dynamic-templates/${createdDraft.templateId}`;
    });
    await deleteDialog.getByRole("button", { name: "永久删除模板" }).click();
    expect((await deleteResponsePromise).ok()).toBe(true);
    await expect(page.getByText(`模板“${draftName}”已永久删除`)).toBeVisible();

    const catalog = await responseData<{
      items: Array<{ kind: string; template: { templateId?: string } }>;
    }>(await page.request.get(`${apiBaseUrl}/page-modules/dynamic-templates/catalog`));
    expect(catalog.items.some((item) => (
      item.kind === "editable" && item.template.templateId === createdDraft.templateId
    ))).toBe(false);
  });
});
