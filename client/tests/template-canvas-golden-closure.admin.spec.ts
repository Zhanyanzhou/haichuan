import { expect, test, type Page } from "@playwright/test";
import { completeProductionReviews, createBlankTemplate, fillTemplateIdentity, installNewTemplateServer, readSession, saveTemplate, type NewTemplateMockServer } from "./fixtures/template-authoring-main-route";

// 主路由真实 UI + 自有 API 内存夹具。没有真实模板、页面或发布写入。
test.describe("画布黄金场景（隔离 API，不代表真实发布）", () => {
  test.setTimeout(180_000);
  const errorsByPage = new WeakMap<Page, string[]>();
  test.beforeEach(async ({ page }) => {
    const errors: string[] = [];
    errorsByPage.set(page, errors);
    page.on("pageerror", (error) => errors.push(error.message));
    await page.exposeFunction("__recordGoldenWindowError", (message: string) => errors.push(message));
    await page.addInitScript(() => {
      // 原生 ErrorEvent（例如 RO 通知异常）不保证触发 pageerror；只监听，不替换 observer 或吞错。
      window.addEventListener("error", (event) => {
        if (!event.message) return;
        void (window as Window & { __recordGoldenWindowError: (message: string) => Promise<void> }).__recordGoldenWindowError(`${location.pathname}: ${event.message}`);
      });
    });
  });
  test.afterEach(async ({ page }) => {
    // 关闭本测试自有页后再判定，包含卸载阶段异常；不安装 observer 补丁或吞错。
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await page.close();
    expect(errorsByPage.get(page) ?? [], "黄金制作过程不得有未处理浏览器异常").toEqual([]);
  });
  async function add(page: Page, label: string) {
    const menu = page.locator(".template-editor__canvas-add");
    if (await menu.getAttribute("open") === null) await menu.locator(":scope > summary").click();
    const isLayout = ["区域", "网格"].includes(label);
    const layout = menu.locator(".template-editor__canvas-add-layout");
    if (isLayout && await layout.getAttribute("open") === null) await layout.locator("summary").click();
    const before = Object.keys((await readSession(page)).definition!.nodes);
    await menu.getByRole("button", { name: `添加${label === "网格" ? "网格布局分组" : isLayout ? label : `${label}槽位`}`, exact: true }).click();
    await expect.poll(async () => Object.keys((await readSession(page)).definition!.nodes).length).toBe(before.length + 1);
    return Object.keys((await readSession(page)).definition!.nodes).find((id) => !before.includes(id))!;
  }
  async function select(page: Page, id: string) {
    await page.getByRole("tree", { name: "模板区域与槽位" }).locator(`[role="treeitem"][data-selection-target-id="${id}"]`).click();
    await expect.poll(async () => (await readSession(page)).selectedObjectId).toBe(id);
  }
  async function structureAction(page: Page, id: string, label: string) {
    const definition = (await readSession(page)).definition!;
    const node = definition.nodes[id];
    const rawName = node.slotId ? definition.slots[node.slotId]?.label ?? node.name : node.name;
    const item = page.getByRole("tree", { name: "模板区域与槽位" }).locator(`[role="treeitem"][data-selection-target-id="${id}"]`);
    await item.locator("xpath=..").getByRole("button", { name: `${rawName}节点操作`, exact: true }).click();
    await page.getByRole("menuitem", { name: label, exact: true }).last().click();
  }
  async function enter(page: Page, id: string) {
    await select(page, id);
    const name = (await readSession(page)).definition!.nodes[id].name;
    const hit = page.getByRole("button", { name: `选择模板目标 ${name}`, exact: true });
    if (await hit.isVisible()) await hit.press("Enter");
    else await page.getByRole("button", { name: "进入选中容器", exact: true }).click();
  }
  async function number(page: Page, label: string, value: number) {
    const field = page.getByRole("spinbutton", { name: label, exact: true });
    await field.fill(String(value)); await field.press("Enter");
    await expect(field).toHaveValue(String(value));
  }
  async function breakpoint(page: Page, label: string) {
    await page.getByRole("button", { name: new RegExp(`${label}端模板布局`) }).click();
  }
  async function savedReopenAndUse(page: Page, server: NewTemplateMockServer, name: string) {
    await saveTemplate(page);
    await expect.poll(async () => (await readSession(page)).dirty).toBe(false);
    const saved = structuredClone(server.persisted!.draft!.definition);
    // 只重新载入本测试已保存的隔离页面，不操作用户已有页签或草稿。
    await page.reload();
    await page.getByRole("button", { name: "模板设计", exact: true }).click();
    await page.getByRole("button", { name: new RegExp(`(?:打开|正在编辑)${name}模板`) }).click();
    await expect.poll(async () => (await readSession(page)).definition).toEqual(saved);
    await completeProductionReviews(page);
    await page.getByRole("button", { name: /^发布模板/ }).click();
    const review = page.getByRole("region", { name: "本次发布检查", exact: true });
    await expect(review).toContainText("可以发布");
    await review.getByRole("button", { name: "保存并发布模板", exact: true }).click();
    await expect.poll(() => server.published?.version).toBe(1);
    expect(server.published!.definition).toEqual(saved);
    await page.getByRole("button", { name: "页面装修", exact: true }).click();
    await page.getByRole("button", { name: `添加到页面：${name} v1`, exact: true }).click();
    const inspector = page.getByRole("region", { name: "模板实例属性", exact: true });
    for (const slot of Object.values(saved.slots)) {
      const field = inspector.locator(`fieldset[data-slot-id="${slot.slotId}"]`);
      if (slot.type === "image") {
        await field.getByRole("button", { name: /粘贴图片链接/ }).click();
        const urlInput = field.getByPlaceholder("输入图片 URL；清空后确认 = 删除图片");
        if (name === "黄金 Hero") {
          // 故意的不可用素材只存在隔离页面；错误层不能越过预览框挡住后续属性。
          await urlInput.fill("/images/golden-deliberately-missing.svg");
          await field.getByRole("button", { name: /^确\s*认$/ }).click();
          const error = field.getByRole("alert").filter({ hasText: "当前图片暂不可用" });
          await expect(error).toBeVisible();
          const bounds = (await field.locator(".homepage-editor__media-preview-img").boundingBox())!;
          const errorBounds = (await error.boundingBox())!;
          expect(errorBounds.x).toBeGreaterThanOrEqual(bounds.x - 1);
          expect(errorBounds.y).toBeGreaterThanOrEqual(bounds.y - 1);
          expect(errorBounds.x + errorBounds.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1);
          expect(errorBounds.y + errorBounds.height).toBeLessThanOrEqual(bounds.y + bounds.height + 1);
        }
        if (!(await urlInput.isVisible())) await field.getByRole("button", { name: /图片链接$/ }).click();
        await urlInput.fill("/images/system/product-placeholder.svg");
        await field.getByRole("button", { name: /^确\s*认$/ }).click();
        await expect.poll(async () => field.locator(".homepage-editor__media-preview-img img").evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
        await expect(field.locator(".homepage-editor__media-preview-img img")).toBeVisible();
        await expect(field.getByRole("alert").filter({ hasText: "当前图片暂不可用" })).toHaveCount(0);
      } else if (["heading", "text", "button"].includes(slot.type)) {
        await field.getByRole("textbox").first().fill(`${name} · ${slot.label}`);
        if (slot.type === "button") {
          await field.getByRole("button", { name: "页面", exact: true }).click();
          await field.getByPlaceholder("选择公开页面，或为页面添加查询参数").fill("/");
        }
      }
    }
    await page.getByRole("button", { name: "保存当前装修草稿", exact: true }).click();
    await expect.poll(() => server.pageDocument.puckData.content.length).toBe(1);
    expect(server.pageDocument.puckData.content[0]).toMatchObject({ type: "动态模板实例", props: { templateId: saved.templateId, templateVersion: 1 } });
    const pageReviewStatus = page.getByTestId("page-review-status");
    await expect(pageReviewStatus).toHaveText("草稿");
    await page.getByRole("button", { name: "提交审核", exact: true }).click();
    await expect(pageReviewStatus).toHaveText("待审核");
    await page.getByRole("button", { name: "批准", exact: true }).click();
    await expect(pageReviewStatus).toHaveText("已批准");
    await expect(page.getByRole("button", { name: "发布到前台网站", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "发布到前台网站", exact: true }).click();
    await expect.poll(() => server.publishedPage).not.toBeNull();
    await page.goto("/");
    await expect(page.locator(`[data-template-node-id="${saved.rootNodeId}"]`)).toBeVisible();
    return saved;
  }

  test("A：从空白制作 Hero、局部叠放、断点覆盖、保存重开及精确版本页面渲染", async ({ page }) => {
    const server = await installNewTemplateServer(page, { pageLifecycle: true });
    await page.setViewportSize({ width: 1600, height: 1000 });
    await createBlankTemplate(page);
    await fillTemplateIdentity(page, "黄金 Hero", "珠宝新品图文展示");
    const region = await add(page, "区域");
    await select(page, region);
    await page.getByRole("combobox", { name: "高度方式", exact: true }).selectOption("fixed");
    await number(page, "高度", 600);
    await enter(page, region);
    const image = await add(page, "图片");
    const heading = await add(page, "标题");
    await add(page, "正文");
    await add(page, "按钮");
    await select(page, heading);
    const beforeTrial = await readSession(page);
    // 空文本的命中区可能重叠；结构区精确选中后使用同一画布编辑动作的可见入口。
    await page.getByRole("button", { name: "预览文字试排", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "试排对象", exact: true })).toHaveValue(heading);
    const trialText = page.getByRole("textbox", { name: "试排标题", exact: true });
    await trialText.fill("仅本次试排：光与珠宝");
    await expect(page.frameLocator("iframe.template-editor__viewport-frame").getByText("仅本次试排：光与珠宝", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "退出预览并继续编辑", exact: true }).click();
    const afterTrial = await readSession(page);
    expect(afterTrial.definition).toEqual(beforeTrial.definition);
    expect(afterTrial.historyPast).toEqual(beforeTrial.historyPast);
    await page.getByText("高级定位 · 改为局部叠放", { exact: true }).click();
    await page.getByRole("button", { name: "锚点 left top", exact: true }).click();
    await page.getByRole("button", { name: "确认定位", exact: true }).click();
    const historyBeforeMove = (await readSession(page)).historyPast.length;
    const move = page.getByRole("button", { name: /拖动移动.*标题/ });
    await move.scrollIntoViewIfNeeded();
    const moveBox = (await move.boundingBox())!;
    await page.mouse.move(moveBox.x + moveBox.width / 2, moveBox.y + moveBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(moveBox.x + moveBox.width / 2 + 32, moveBox.y + moveBox.height / 2 + 20, { steps: 5 });
    await page.mouse.up();
    await expect.poll(async () => (await readSession(page)).historyPast.length).toBe(historyBeforeMove + 1);
    const resize = page.locator('[data-resize-direction="e"]');
    await resize.scrollIntoViewIfNeeded();
    const resizeBox = (await resize.boundingBox())!;
    const oldWidth = (await readSession(page)).definition!.nodes[heading].responsive.desktop.width;
    await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + resizeBox.height / 2);
    await page.mouse.down();
    // 全宽标题的东侧可能位于窗口边缘；向内收窄，避免把离开窗口的取消误作缩放。
    await page.mouse.move(resizeBox.x - 40, resizeBox.y + resizeBox.height / 2, { steps: 5 });
    await page.mouse.up();
    await expect.poll(async () => (await readSession(page)).definition!.nodes[heading].responsive.desktop.width).not.toEqual(oldWidth);
    await number(page, "锚点水平偏移", 36);
    await number(page, "锚点垂直偏移", 48);
    await select(page, image);
    await page.getByRole("combobox", { name: "高度方式", exact: true }).selectOption("fixed");
    await number(page, "高度", 320);
    await number(page, "水平焦点", 37.25);
    await breakpoint(page, "移动");
    await number(page, "水平焦点", 65);
    const designed = (await readSession(page)).definition!;
    const imageSlot = designed.slots[designed.nodes[image].slotId!];
    expect(imageSlot.desktopRules.objectPosition).toContain("37.25%");
    expect(imageSlot.mobileRules.objectPosition).toContain("65%");
    const saved = await savedReopenAndUse(page, server, "黄金 Hero");
    const anchored = page.locator(`[data-template-node-id="${heading}"]`);
    await expect(anchored).toHaveCSS("position", "absolute");
    const frame = await page.locator(`[data-template-node-id="${region}"]`).boundingBox();
    const title = await anchored.boundingBox();
    expect(title!.x - frame!.x).toBeCloseTo(36, 0);
    expect(title!.y - frame!.y).toBeCloseTo(48, 0);
    const publicImage = page.locator(`[data-template-node-id="${image}"] img`);
    await expect(publicImage).toHaveCSS("object-position", "37.25% 50%");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(publicImage).toHaveCSS("object-position", "65% 50%");
    await expect(page.getByText("仅本次试排：光与珠宝", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /黄金 Hero · .*按钮/ })).toHaveAttribute("href", "/");
    expect(saved.nodes[region].childIds).toHaveLength(4);
    expect(saved.nodes[heading].responsive.desktop.anchor).toMatchObject({ horizontal: "left", vertical: "top", offsetX: { value: 36 }, offsetY: { value: 48 } });
  });

  test("B：空白卡片网格三二一列、继承恢复、复制回流及保存后的公开响应式", async ({ page }) => {
    const server = await installNewTemplateServer(page, { pageLifecycle: true });
    await page.setViewportSize({ width: 1600, height: 1000 });
    await createBlankTemplate(page);
    await fillTemplateIdentity(page, "黄金卡片", "响应式珠宝系列卡片");
    const region = await add(page, "区域");
    await enter(page, region);
    const grid = await add(page, "网格");
    await enter(page, grid);
    const cards = [await add(page, "图片"), await add(page, "图片"), await add(page, "图片")];
    await select(page, cards[2]);
    await structureAction(page, cards[2], "复制槽位");
    await expect.poll(async () => (await readSession(page)).definition!.nodes[grid].childIds.length).toBe(4);
    const fourth = (await readSession(page)).definition!.nodes[grid].childIds.find((id) => !cards.includes(id))!;
    await select(page, fourth);
    await structureAction(page, fourth, "删除槽位");
    const deletion = page.getByRole("dialog");
    await deletion.getByRole("button", { name: /删除/, exact: false }).click();
    await expect.poll(async () => (await readSession(page)).definition!.nodes[grid].childIds.length).toBe(3);
    await select(page, cards[0]);
    await page.getByRole("tree", { name: "模板区域与槽位" }).locator(`[role="treeitem"][data-selection-target-id="${cards[1]}"]`).click({ modifiers: ["Control"] });
    await expect(page.getByRole("region", { name: "多选设计属性", exact: true })).toBeVisible();
    const batchHistory = (await readSession(page)).historyPast.length;
    await page.locator('details[data-template-property-group="外观"] > summary').click();
    await number(page, "圆角", 12);
    const batch = await readSession(page);
    expect(batch.historyPast).toHaveLength(batchHistory + 1);
    for (const id of cards.slice(0, 2)) expect(batch.definition!.nodes[id].responsive.desktop.radius).toEqual({ value: 12, unit: "px" });
    await select(page, grid);
    await number(page, "网格列数", 3);
    await number(page, "对象间距", 24);
    await page.getByRole("button", { name: "调整间距", exact: true }).click();
    const gapHandle = page.getByRole("button", { name: "拖动调整间距", exact: true });
    await gapHandle.scrollIntoViewIfNeeded();
    const gapBox = (await gapHandle.boundingBox())!;
    const gapHistory = (await readSession(page)).historyPast.length;
    await page.mouse.move(gapBox.x + gapBox.width / 2, gapBox.y + gapBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(gapBox.x + gapBox.width / 2 + 12, gapBox.y + gapBox.height / 2 + 12, { steps: 5 });
    await page.mouse.up();
    const dragged = await readSession(page);
    expect(dragged.historyPast).toHaveLength(gapHistory + 1);
    expect(dragged.definition!.nodes[grid].responsive.desktop.gap?.value).toBeGreaterThan(24);
    await expect(page.getByRole("spinbutton", { name: "对象间距", exact: true })).toHaveValue(String(dragged.definition!.nodes[grid].responsive.desktop.gap!.value));
    await number(page, "对象间距", 24);
    await breakpoint(page, "平板");
    await number(page, "网格列数", 2);
    await breakpoint(page, "移动");
    await number(page, "网格列数", 1);
    const beforeReset = (await readSession(page)).definition!;
    expect(beforeReset.nodes[grid].responsive.tablet?.columns).toHaveLength(2);
    expect(beforeReset.nodes[grid].responsive.mobile.columns).toHaveLength(1);
    await page.locator('[data-template-design-property="node.columns"]').getByRole("button", { name: "恢复继承", exact: true }).click();
    await expect(page.getByRole("spinbutton", { name: "网格列数", exact: true })).toHaveValue("2");
    await number(page, "网格列数", 1);
    const saved = await savedReopenAndUse(page, server, "黄金卡片");
    expect(saved.nodes[grid].childIds).toEqual(cards);
    for (const [width, columns] of [[1280, 3], [834, 2], [390, 1]]) {
      await page.setViewportSize({ width, height: 900 });
      const renderedGrid = page.locator(`[data-template-node-id="${grid}"]`);
      await expect.poll(async () => renderedGrid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length)).toBe(columns);
      await expect(renderedGrid).toHaveCSS("gap", "24px");
    }
  });

  test("C：预览 CTA 进入普通落地页后退出，恢复编辑画布与原选中对象", async ({ page }, testInfo) => {
    const server = await installNewTemplateServer(page);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await createBlankTemplate(page);
    const region = await add(page, "区域");
    await enter(page, region);
    const button = await add(page, "按钮");
    await select(page, button);
    await page.getByRole("button", { name: "预览文字试排", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "试排对象", exact: true })).toHaveValue(button);
    const trial = page.getByRole("region", { name: "试排内容（仅本次编辑）", exact: true });
    await trial.getByLabel("试排按钮文案", { exact: true }).fill("查看隔离落地页");
    await trial.getByLabel("试排链接", { exact: true }).fill("/contact");
    const before = await readSession(page);
    let navigations = 0;
    await page.route("**/contact", (route) => {
      navigations += 1;
      return route.fulfill({ contentType: "text/html", body: "<!doctype html><html><head><title>普通隔离落地页</title></head><body><h1>普通隔离落地页</h1></body></html>" });
    });
    const frame = page.frameLocator("iframe.template-editor__viewport-frame");
    const cta = frame.getByRole("link", { name: "查看隔离落地页", exact: true });
    await expect(cta).toHaveAttribute("href", "/contact");
    await cta.click();
    await expect.poll(() => navigations).toBe(1);
    await expect(frame.getByRole("heading", { name: "普通隔离落地页", exact: true })).toBeVisible();
    await expect(frame.locator("#template-viewport-root")).toHaveCount(0);
    await page.getByRole("button", { name: "退出预览并继续编辑", exact: true }).click();
    const after = await readSession(page);
    expect(after.definition).toEqual(before.definition);
    expect(after.historyPast).toEqual(before.historyPast);
    expect(after.historyFuture).toEqual(before.historyFuture);
    expect(after.dirty).toBe(before.dirty);
    expect(after.selectedObjectId).toBe(before.selectedObjectId);
    expect(after.previewMode).toBe(false);
    expect(server.writes).toEqual([]);
    await testInfo.attach("preview-exit-state", { contentType: "application/json", body: JSON.stringify({
      selectedObjectId: after.selectedObjectId, definitionUnchanged: true, historyUnchanged: true,
      dirty: after.dirty, previewMode: after.previewMode, writes: server.writes.length,
      iframeRootCount: await frame.locator("#template-viewport-root").count(),
      iframeText: await frame.locator("body").innerText(),
    }, null, 2) });
    await expect(frame.locator(`[data-template-node-id="${button}"]`)).not.toContainText("查看隔离落地页");
    await expect(frame.locator(`[data-template-node-id="${button}"]`)).not.toHaveAttribute("href", /.+/);
    await expect(frame.getByRole("heading", { name: "普通隔离落地页", exact: true })).toHaveCount(0);
    await expect(page.locator(`[data-overlay-selection-for="node:${button}"]`)).toBeVisible();
  });
});
