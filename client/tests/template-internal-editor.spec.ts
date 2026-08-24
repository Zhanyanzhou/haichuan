import { expect, test, type Page, type TestInfo } from "@playwright/test";

const appMode = process.env.PLAYWRIGHT_APP_MODE === "mock" ? "mock" : "development";

const fixtureSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900">
    <rect width="1600" height="900" fill="#d8d6d0"/>
    <circle cx="1120" cy="360" r="230" fill="#f7f5ef"/>
  </svg>
`;

const fixtureHtml = `<!doctype html>
  <html lang="zh-CN">
    <head>
      <meta charset="utf-8" />
      <style>
        * { box-sizing: border-box; }
        body { margin: 0; background: #e8ebec; }
        .template-internal-fixture { min-height: 100vh; }
        .template-internal-fixture .homepage-editor__toolbar {
          position: relative;
          z-index: 5;
          width: 100%;
        }
        .template-internal-fixture__inspector {
          position: fixed;
          z-index: 4;
          top: 76px;
          left: 16px;
          width: 350px;
          max-height: calc(100vh - 92px);
          overflow: auto;
          padding: 16px;
          border: 1px solid #d9dddd;
          background: #f8f9f9;
        }
        .template-internal-fixture__inspector output,
        .template-internal-fixture__inspector pre {
          display: block;
          margin-top: 8px;
          overflow-wrap: anywhere;
          white-space: pre-wrap;
          font-size: 10px;
        }
        .template-internal-fixture__canvas {
          min-width: 0;
          margin-left: 382px;
          padding: 20px;
        }
        .template-internal-fixture__canvas iframe {
          min-height: 920px !important;
        }
      </style>
    </head>
    <body>
      <div id="root"></div>
      <script type="module">
        import RefreshRuntime from "/@react-refresh";
        RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {};
        window.$RefreshSig$ = () => (type) => type;
        window.__vite_plugin_react_preamble_installed__ = true;
      </script>
      <script type="module" src="/tests/fixtures/template-internal-editor.tsx"></script>
    </body>
  </html>`;

function json(data: unknown) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ code: 200, data, message: "success" }),
  };
}

function isForbiddenEditorWrite(method: string, url: string) {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method) &&
    /\/page-modules\/document(?:\/publish|\/draft)?$/.test(new URL(url).pathname);
}

function makeEmptyDraft() {
  return {
    id: 9601,
    pageKey: "home",
    puckData: { content: [], zones: {}, root: { props: {} } },
    metadata: {},
    editorVersion: "0.22.4",
    status: "DRAFT",
    version: 0,
    publishedAt: null,
    publishedBy: null,
    updatedAt: "2026-08-23T00:00:00.000Z",
  };
}

function makeHeroDraft() {
  const draft = makeEmptyDraft();
  return {
    ...draft,
    id: 9602,
    puckData: {
      ...draft.puckData,
      content: [
        {
          type: "首屏主视觉",
          props: {
            id: "template-editor-history-hero",
            desktopImage: "/svg/template-hero.svg",
            mobileImage: "/svg/template-hero.svg",
            eyebrow: "",
            title: "",
            subtitle: "",
            actionText: "",
            targetType: "none",
          },
        },
      ],
    },
  };
}

async function authenticateAdmin(page: Page) {
  await page.goto("/admin/login");
  await page.evaluate(() => {
    const user = {
      id: 1,
      username: "template-editor-ui-test",
      realName: "装修 UI 测试管理员",
      role: "SUPER_ADMIN",
    };
    localStorage.setItem("token", "template-editor-ui-test-token");
    localStorage.setItem(
      "jewelry-auth",
      JSON.stringify({
        state: {
          token: "template-editor-ui-test-token",
          user,
          isLoggedIn: true,
        },
        version: 0,
      }),
    );
  });
}

async function mockEditorApis(
  page: Page,
  draft: Record<string, any> = makeEmptyDraft(),
  forbiddenWrites: string[] = [],
) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = request.url();
    const pathname = new URL(url).pathname;
    if (isForbiddenEditorWrite(request.method(), url)) {
      forbiddenWrites.push(`${request.method()} ${pathname}`);
      return route.fulfill({ status: 409, contentType: "application/json", body: "{}" });
    }
    if (url.includes("/page-modules/document/validate")) {
      return route.fulfill(json({ valid: true, errors: [] }));
    }
    if (url.includes("/page-modules/document/revisions")) {
      return route.fulfill(json([]));
    }
    if (url.includes("/page-modules/document/published")) {
      return route.fulfill(json(null));
    }
    if (url.includes("/page-modules/document/admin")) {
      return route.fulfill(json(draft));
    }
    return route.fulfill(json({}));
  });
}

async function openComponentFixture(page: Page) {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.route(/\/__template-internal-editor(?:\?.*)?$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: fixtureHtml,
    }),
  );
  await page.route("**/svg/template-hero.svg", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: fixtureSvg,
    }),
  );
  await page.goto("/__template-internal-editor");
  await expect(page.getByRole("note")).toContainText("不调用保存、发布或后端接口");
  await expect(page.locator("iframe")).toHaveCount(1);
  await page.getByRole("button", { name: /桌面端布局/ }).click();
  await expect(page.getByTestId("viewport-state")).toHaveText("desktop");
  await expect.poll(async () =>
    page.frameLocator("iframe").locator("html").evaluate(() => window.innerWidth),
  ).toBeGreaterThan(767);
}

async function readFixtureData(page: Page) {
  return JSON.parse((await page.getByTestId("fixture-data-state").textContent()) || "null") as {
    content: Array<{ type: string; props: Record<string, any> }>;
  };
}

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  const screenshotPath = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path: screenshotPath, animations: "disabled" });
  await testInfo.attach(name, { path: screenshotPath, contentType: "image/png" });
}

function heroOverrides(data: Awaited<ReturnType<typeof readFixtureData>>) {
  return data.content.find((block) => block.props.id === "template-internal-hero")
    ?.props.__instanceOverrides as Record<string, any> | undefined;
}

async function expectInside(
  outer: { x: number; y: number; width: number; height: number },
  inner: { x: number; y: number; width: number; height: number },
) {
  expect(inner.x).toBeGreaterThanOrEqual(outer.x - 1);
  expect(inner.y).toBeGreaterThanOrEqual(outer.y - 1);
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width + 1);
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height + 1);
}

test.describe("模板内部编辑器（真实产品组件集成；不含后端持久化）", () => {
  let forbiddenWrites: string[];

  test.beforeEach(async ({ page }) => {
    forbiddenWrites = [];
    page.on("request", (request) => {
      if (isForbiddenEditorWrite(request.method(), request.url())) {
        forbiddenWrites.push(`${request.method()} ${new URL(request.url()).pathname}`);
      }
    });
    await openComponentFixture(page);
  });

  test.afterEach(() => {
    expect(forbiddenWrites).toEqual([]);
  });

  test("图片与文字可直接选择，图片构图可拖动，属性区随对象切换", async ({ page }, testInfo) => {
    const canvas = page.frameLocator("iframe");
    const media = canvas
      .locator('[data-content-role-desktop="desktopImage"]:visible')
      .first();
    const image = media.locator("img");
    const mediaBox = await image.boundingBox();
    if (!mediaBox) throw new Error("主图没有可操作尺寸");

    await image.click({
      position: { x: mediaBox.width * 0.82, y: mediaBox.height * 0.2 },
    });
    await expect(page.getByTestId("selected-visual-state")).toHaveText(
      "template-internal-hero:desktopImage:media",
    );
    const root = canvas.locator('[data-content-template-module="首屏主视觉"]').first();
    const hud = root.locator(
      '[data-hc-node-hud][data-node-id="desktopImage"][data-node-kind="media"]',
    );
    await expect(hud).toBeVisible();
    await expect(hud).toHaveAttribute("data-can-adjust-layout", "true");
    await expect(hud).toHaveAttribute("data-can-adjust-focus", "true");
    await expect(hud).toHaveAttribute("data-can-adjust-fit", "true");
    await expect(hud).toHaveAttribute("data-can-adjust-zoom", "true");
    await expect(hud.getByRole("button", { name: "调整对象区域" })).toBeVisible();
    await expect(hud.getByRole("button", { name: "调整图片构图" })).toBeVisible();
    await page.getByRole("tab", { name: "设计" }).click();
    await hud.getByRole("button", { name: "调整图片构图" }).click();
    await expect(root).toHaveAttribute("data-hc-media-focus-enabled", "true");

    const dragBox = await image.boundingBox();
    if (!dragBox) throw new Error("主图在构图模式下没有尺寸");
    await page.mouse.move(dragBox.x + dragBox.width * 0.75, dragBox.y + dragBox.height * 0.25);
    await page.mouse.down();
    await page.mouse.move(
      dragBox.x + dragBox.width * 0.75 + 70,
      dragBox.y + dragBox.height * 0.25 + 30,
      { steps: 8 },
    );
    await page.mouse.up();

    await expect.poll(async () =>
      heroOverrides(await readFixtureData(page))?.nodes?.desktopImage?.mediaView
        ?.focusByViewport?.desktop,
    ).not.toEqual(undefined);

    const title = canvas.locator('[data-hc-keyboard-node="title"]:visible').first();
    await title.click();
    await expect(page.getByTestId("selected-visual-state")).toHaveText(
      "template-internal-hero:title:text",
    );
    await expect(page.getByRole("button", { name: "调整图片构图" })).toHaveCount(0);
    await expect(root.locator('[data-hc-node-hud][data-node-id="title"]')
      .getByRole("button", { name: "调整对象区域" })).toBeVisible();
    await attachScreenshot(page, testInfo, "template-object-selection-and-media-focus");
  });

  test("拖动受模块边界约束，吸附辅助线在拖动中可观测且松手清理", async ({ page }) => {
    const canvas = page.frameLocator("iframe");
    const root = canvas.locator('[data-content-template-module="首屏主视觉"]').first();
    const title = canvas.locator('[data-hc-keyboard-node="title"]:visible').first();

    await title.click();
    await root.locator('[data-hc-node-hud][data-node-id="title"]')
      .getByRole("button", { name: "调整对象区域" }).click();

    const rootBox = await root.boundingBox();
    const titleBox = await title.boundingBox();
    if (!rootBox || !titleBox) throw new Error("标题或模块没有布局尺寸");
    await page.mouse.move(titleBox.x + titleBox.width / 2, titleBox.y + titleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(rootBox.x + 2, rootBox.y + 2, {
      steps: 12,
    });

    await expect(root).toHaveAttribute("data-hc-snap-active", "true");
    await expect.poll(async () => root.locator("[data-hc-snap-guide]").count()).toBeGreaterThan(0);
    const guides = await root.locator("[data-hc-snap-guide]").evaluateAll((nodes) =>
      nodes.map((node) => ({
        axis: node.getAttribute("data-axis"),
        kind: node.getAttribute("data-snap-kind"),
      })),
    );
    expect(guides.every((guide) => guide.axis === "x" || guide.axis === "y")).toBe(true);
    expect(
      guides.every((guide) =>
        ["frame-edge", "frame-center", "node-edge", "node-center"].includes(
          guide.kind || "",
        ),
      ),
    ).toBe(true);
    await page.mouse.up();
    await expect(root).not.toHaveAttribute("data-hc-snap-active", "true");
    await expect(root.locator("[data-hc-snap-guide]")).toHaveCount(0);

    const movedBox = await title.boundingBox();
    if (!movedBox) throw new Error("拖动后的标题没有布局尺寸");
    await expectInside(rootBox, movedBox);
    await expect.poll(async () =>
      heroOverrides(await readFixtureData(page))?.nodes?.title?.rectByViewport
        ?.desktop,
    ).not.toEqual(undefined);
  });

  test("8 个方向把手分别改变对应边、写入 store 且不越出模块", async ({ page }, testInfo) => {
    const canvas = page.frameLocator("iframe");
    const root = canvas.locator('[data-content-template-module="首屏主视觉"]').first();
    const title = canvas.locator('[data-hc-keyboard-node="title"]:visible').first();
    const rootBox = await root.boundingBox();
    if (!rootBox) throw new Error("模块没有布局尺寸");
    const undo = page.getByRole("button", { name: "撤销" });
    const directions = {
      n: { dx: 0, dy: -24, name: "调整对象大小：上边" },
      ne: { dx: 24, dy: -24, name: "调整对象大小：右上角" },
      e: { dx: 24, dy: 0, name: "调整对象大小：右边" },
      se: { dx: 24, dy: 24, name: "调整对象大小：右下角" },
      s: { dx: 0, dy: 24, name: "调整对象大小：下边" },
      sw: { dx: -24, dy: 24, name: "调整对象大小：左下角" },
      w: { dx: -24, dy: 0, name: "调整对象大小：左边" },
      nw: { dx: -24, dy: -24, name: "调整对象大小：左上角" },
    } as const;

    for (const [direction, movement] of Object.entries(directions)) {
      await title.click();
      await root.locator('[data-hc-node-hud][data-node-id="title"]')
        .getByRole("button", { name: "调整对象区域" }).click();
      const handles = root.locator('button[data-hc-resize-handle][data-node-id="title"]');
      await expect(handles).toHaveCount(8);
      const handle = root.locator(
        `button[data-hc-resize-handle][data-node-id="title"][data-resize-direction="${direction}"]`,
      );
      await expect(handle).toHaveCount(1);
      await expect(handle).toHaveAccessibleName(movement.name);
      expect(await handle.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return document.elementFromPoint(
          box.x + box.width / 2,
          box.y + box.height / 2,
        ) === element;
      })).toBe(true);

      const before = await title.boundingBox();
      const handleBox = await handle.boundingBox();
      const storeBefore = heroOverrides(await readFixtureData(page))?.nodes?.title
        ?.rectByViewport?.desktop;
      if (!before || !handleBox) throw new Error(`${direction} 缺少缩放前尺寸`);
      await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        handleBox.x + handleBox.width / 2 + movement.dx,
        handleBox.y + handleBox.height / 2 + movement.dy,
        { steps: 8 },
      );
      await page.mouse.up();
      await expect(root).toHaveAttribute("data-hc-gesture-phase", "commit");

      const after = await title.boundingBox();
      if (!after) throw new Error(`${direction} 缺少缩放后尺寸`);
      await expectInside(rootBox, after);
      const beforeRight = before.x + before.width;
      const afterRight = after.x + after.width;
      const beforeBottom = before.y + before.height;
      const afterBottom = after.y + after.height;
      if (direction.includes("e")) {
        expect(afterRight).toBeGreaterThan(beforeRight + 1);
        expect(Math.abs(after.x - before.x)).toBeLessThan(3);
      } else if (direction.includes("w")) {
        expect(after.x).toBeLessThan(before.x - 1);
        expect(Math.abs(afterRight - beforeRight)).toBeLessThan(3);
      } else {
        expect(Math.abs(after.x - before.x)).toBeLessThan(3);
        expect(Math.abs(after.width - before.width)).toBeLessThan(3);
      }
      if (direction.includes("s")) {
        expect(afterBottom).toBeGreaterThan(beforeBottom + 1);
        expect(Math.abs(after.y - before.y)).toBeLessThan(3);
      } else if (direction.includes("n")) {
        expect(after.y).toBeLessThan(before.y - 1);
        expect(Math.abs(afterBottom - beforeBottom)).toBeLessThan(3);
      } else {
        expect(Math.abs(after.y - before.y)).toBeLessThan(3);
        expect(Math.abs(after.height - before.height)).toBeLessThan(3);
      }
      await expect.poll(async () => JSON.stringify(
        heroOverrides(await readFixtureData(page))?.nodes?.title?.rectByViewport
          ?.desktop,
      )).not.toBe(JSON.stringify(storeBefore));

      if (direction === "nw") {
        await attachScreenshot(page, testInfo, "template-eight-direction-resize");
      }

      await expect(undo).toBeEnabled();
      await undo.click();
      await expect.poll(async () => JSON.stringify(
        heroOverrides(await readFixtureData(page))?.nodes?.title?.rectByViewport
          ?.desktop,
      )).toBe(JSON.stringify(storeBefore));
    }
  });

  test("文字框可从左右边调宽，8 个把手保持在模块边界内", async ({ page }) => {
    const canvas = page.frameLocator("iframe");
    const root = canvas.locator('[data-content-template-module="首屏主视觉"]').first();
    const title = canvas.locator('[data-hc-keyboard-node="title"]:visible').first();
    await title.click();
    await root
      .locator('[data-hc-node-hud][data-node-id="title"]')
      .getByRole("button", { name: "调整对象区域" })
      .click();

    const before = await title.boundingBox();
    const east = root.locator(
      'button[data-hc-resize-handle][data-node-id="title"][data-resize-direction="e"]',
    );
    const eastBox = await east.boundingBox();
    const rootBox = await root.boundingBox();
    if (!before || !eastBox || !rootBox) throw new Error("文字框或右边缩放把手没有尺寸");
    await east.hover();
    await page.mouse.down();
    await page.mouse.move(eastBox.x + eastBox.width / 2 + 90, eastBox.y + eastBox.height / 2, {
      steps: 10,
    });
    await page.mouse.up();

    const after = await title.boundingBox();
    if (!after) throw new Error("文字框调宽后没有尺寸");
    expect(after.width).toBeGreaterThan(before.width + 2);
    expect(Math.abs(after.height - before.height)).toBeLessThan(3);
    await expectInside(rootBox, after);
  });

  test("Esc 与 pointercancel 取消本地预览并保持历史不变", async ({ page }) => {
    const canvas = page.frameLocator("iframe");
    const root = canvas.locator('[data-content-template-module="首屏主视觉"]').first();
    const title = canvas.locator('[data-hc-keyboard-node="title"]:visible').first();
    await title.click();
    const hud = root.locator('[data-hc-node-hud][data-node-id="title"]');
    await hud.getByRole("button", { name: "调整对象区域" }).click();
    const initialBox = await title.boundingBox();
    if (!initialBox) throw new Error("标题没有初始尺寸");
    const undo = page.getByRole("button", { name: "撤销" });
    const undoDisabledBefore = await undo.isDisabled();

    await page.mouse.move(initialBox.x + initialBox.width / 2, initialBox.y + initialBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(initialBox.x + initialBox.width / 2 + 80, initialBox.y + initialBox.height / 2 + 30, {
      steps: 10,
    });
    await expect(root).toHaveAttribute("data-hc-gesture-phase", "update");
    expect(heroOverrides(await readFixtureData(page))).toBeUndefined();
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(root).toHaveAttribute("data-hc-gesture-phase", "cancel");
    const afterEscape = await title.boundingBox();
    expect(afterEscape).toEqual(initialBox);
    expect(heroOverrides(await readFixtureData(page))).toBeUndefined();
    expect(await undo.isDisabled()).toBe(undoDisabledBefore);

    await hud.getByRole("button", { name: "调整对象区域" }).click();
    await page.mouse.move(initialBox.x + initialBox.width / 2, initialBox.y + initialBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(initialBox.x + initialBox.width / 2 - 60, initialBox.y + initialBox.height / 2, {
      steps: 8,
    });
    await expect(root).toHaveAttribute("data-hc-gesture-phase", "update");
    await root.dispatchEvent("pointercancel", { pointerId: 1 });
    await page.mouse.up();
    await expect(root).toHaveAttribute("data-hc-gesture-phase", "cancel");
    const afterPointerCancel = await title.boundingBox();
    expect(afterPointerCancel).toEqual(initialBox);
    expect(heroOverrides(await readFixtureData(page))).toBeUndefined();
    expect(await undo.isDisabled()).toBe(undoDisabledBefore);
  });

  test("Desktop/Mobile 布局值分别写入同一模块实例", async ({ page }) => {
    const canvas = page.frameLocator("iframe");
    const title = canvas.locator('[data-hc-keyboard-node="title"]:visible').first();
    await title.click();
    const root = canvas.locator('[data-content-template-module="首屏主视觉"]').first();
    await root.locator('[data-hc-node-hud][data-node-id="title"]')
      .getByRole("button", { name: "调整对象区域" }).click();
    await title.press("ArrowRight");

    const desktopRect = heroOverrides(await readFixtureData(page))?.nodes?.title
      ?.rectByViewport?.desktop;
    expect(desktopRect).toBeTruthy();

    await page.getByRole("button", { name: /移动端布局/ }).click();
    await expect(page.getByTestId("viewport-state")).toHaveText("mobile");
    await expect.poll(async () =>
      canvas.locator("html").evaluate(() => window.innerWidth),
    ).toBeLessThanOrEqual(480);
    const inheritedMobile = heroOverrides(await readFixtureData(page));
    expect(inheritedMobile?.nodes?.title?.rectByViewport?.mobile).toBeUndefined();
    await title.click();
    await root.locator('[data-hc-node-hud][data-node-id="title"]')
      .getByRole("button", { name: "调整对象区域" }).click();
    await title.press("ArrowDown");

    await expect.poll(async () =>
      heroOverrides(await readFixtureData(page))?.nodes?.title?.rectByViewport
        ?.mobile,
    ).not.toEqual(undefined);
    const afterMobile = heroOverrides(await readFixtureData(page));
    expect(afterMobile?.nodes?.title?.rectByViewport?.desktop).toEqual(desktopRect);
    expect(afterMobile?.nodes?.title?.rectByViewport?.mobile).not.toEqual(desktopRect);

    await page.getByRole("button", { name: /桌面端布局/ }).click();
    await expect(page.getByTestId("viewport-state")).toHaveText("desktop");
    expect(
      heroOverrides(await readFixtureData(page))?.nodes?.title?.rectByViewport
        ?.desktop,
    ).toEqual(desktopRect);
  });

  test("顶部撤销、重做、复制、删除与预览均操作当前 Puck 画布", async ({ page }) => {
    const canvas = page.frameLocator("iframe");
    await canvas.getByRole("button", { name: "选择“首屏主视觉”模块" }).click();
    await expect(page.getByTestId("selected-module-state")).toHaveText(
      "template-internal-hero",
    );

    const duplicate = page.getByRole("button", { name: "复制当前模块" });
    const remove = page.getByRole("button", { name: "删除当前模块" });
    const undo = page.getByRole("button", { name: "撤销" });
    const redo = page.getByRole("button", { name: "重做" });
    await expect(duplicate).toBeEnabled();
    await expect(remove).toBeEnabled();

    await duplicate.click();
    await expect.poll(async () => (await readFixtureData(page)).content.length).toBe(3);
    await expect(undo).toBeEnabled();

    await remove.click();
    const dialog = page.getByRole("dialog").filter({ hasText: "删除“" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "删除模块" }).click();
    await expect.poll(async () => (await readFixtureData(page)).content.length).toBe(2);

    await undo.click();
    await expect.poll(async () => (await readFixtureData(page)).content.length).toBe(3);
    await expect(redo).toBeEnabled();
    await redo.click();
    await expect.poll(async () => (await readFixtureData(page)).content.length).toBe(2);

    await page.getByRole("button", { name: "预览当前画布" }).click();
    await expect(page.getByTestId("preview-state")).toHaveText("preview");
    await expect(page.getByRole("button", { name: "退出当前画布预览" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("preview-state")).toHaveText("edit");
  });
});

test.describe("完整后台壳（确定性 UI / 自有 API 网络夹具）", () => {
  test.skip(
    appMode === "mock",
    "该层在 development 模式用 page.route 替换自有 API；Mock 启动模式另有显式标识测试",
  );

  test("模板库真实拖入画布；本用例不证明保存或发布持久化", async ({ page }) => {
    const forbiddenWrites: string[] = [];
    await page.setViewportSize({ width: 1600, height: 1000 });
    await authenticateAdmin(page);
    await mockEditorApis(page, makeEmptyDraft(), forbiddenWrites);
    await page.goto("/admin/editor/home");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();

    const card = page.getByRole("button", { name: "首屏：拖到画布" });
    const canvasDocument = page.locator(".homepage-editor__canvas-document");
    await expect(card).toBeVisible();
    await expect(canvasDocument).toBeVisible();
    const cardBox = await card.boundingBox();
    const canvasBox = await canvasDocument.boundingBox();
    if (!cardBox || !canvasBox) throw new Error("模块卡或画布没有布局尺寸");

    await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + 120, {
      steps: 14,
    });
    await expect(page.getByText("在此插入")).toBeVisible();
    await page.mouse.up();

    await expect(page.getByText("已插入“首屏”，可在右侧继续编辑")).toBeVisible();
    await expect(page.locator(".homepage-editor__layer-item")).toHaveCount(1);
    const topOperations = page.getByRole("toolbar", { name: "画布编辑操作" });
    await expect(topOperations.getByRole("button", { name: "撤销" })).toBeEnabled();
    await expect(
      topOperations.getByRole("button", { name: "复制当前模块" }),
    ).toBeEnabled();
    await expect(
      topOperations.getByRole("button", { name: "删除当前模块" }),
    ).toBeEnabled();
    expect(forbiddenWrites).toEqual([]);
  });

  test("一次连续内部拖动只产生一条可撤销历史；本用例不证明服务端持久化", async ({
    page,
  }, testInfo) => {
    const forbiddenWrites: string[] = [];
    await page.setViewportSize({ width: 1600, height: 1000 });
    await authenticateAdmin(page);
    await mockEditorApis(page, makeHeroDraft(), forbiddenWrites);
    await page.goto("/admin/editor/home");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible();

    const canvas = page.frameLocator(".homepage-editor__canvas-scale iframe");
    const title = canvas.locator('[data-hc-keyboard-node="title"]:visible').first();
    await expect(title).toBeVisible();
    await title.click();
    const root = canvas.locator('[data-content-template-module="首屏主视觉"]').first();
    await root.locator('[data-hc-node-hud][data-node-id="title"]')
      .getByRole("button", { name: "调整对象区域" }).click();
    const instanceStyle = canvas
      .locator('[data-content-template-module="首屏主视觉"]')
      .locator("style[data-hc-instance-overrides]");
    const readInstanceStyle = async () =>
      (await instanceStyle.count()) > 0
        ? (await instanceStyle.textContent()) ?? ""
        : "";
    const initialInstanceStyle = await readInstanceStyle();
    const initialBox = await title.boundingBox();
    if (!initialBox) throw new Error("真实编辑器标题没有初始布局尺寸");
    await page.keyboard.down("Alt");
    await page.mouse.move(
      initialBox.x + initialBox.width / 2,
      initialBox.y + initialBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      initialBox.x + initialBox.width / 2 + 90,
      initialBox.y + initialBox.height / 2 - 28,
      { steps: 16 },
    );
    await page.mouse.up();
    await page.keyboard.up("Alt");

    const movedBox = await title.boundingBox();
    if (!movedBox) throw new Error("真实编辑器标题拖动后没有布局尺寸");
    expect(Math.abs(movedBox.x - initialBox.x) + Math.abs(movedBox.y - initialBox.y)).toBeGreaterThan(2);
    const movedInstanceStyle = await readInstanceStyle();
    expect(movedInstanceStyle).not.toBe(initialInstanceStyle);

    const undo = page.getByRole("button", { name: "撤销" });
    const redo = page.getByRole("button", { name: "重做" });
    await expect(undo).toBeEnabled();
    await undo.click();
    await expect.poll(readInstanceStyle).toBe(initialInstanceStyle);

    await expect(redo).toBeEnabled();
    await redo.click();
    await expect.poll(readInstanceStyle).toBe(movedInstanceStyle);
    await attachScreenshot(page, testInfo, "template-shell-single-history-step");
    expect(forbiddenWrites).toEqual([]);
  });
});
