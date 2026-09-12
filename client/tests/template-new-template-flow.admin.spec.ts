import { expect, test, type Page } from "@playwright/test";
import type { TemplateDefinitionV2 } from "../src/page-builder/template-definition";
import {
  NEW_TEMPLATE_NAME,
  homepageConfigSource,
  installNewTemplateServer,
  readSession,
  stableAuthoringFacts,
  guide,
  productionStageAction,
  firstRegionAction,
  blankTemplateStart,
  structurePanel,
  openTemplateDesignWithoutDraft,
  createBlankTemplate,
  waitForMeasurementCycles,
  readCanvasReadout,
  expectHealthyStableCanvas,
  addFirstRegion,
  addTwoRegions,
  chooseAddTarget,
  addContentGroupsAndSlots,
  applyBasicSkeleton,
  fillTemplateName,
  fillTemplateIdentity,
  saveTemplate,
  completeProductionReviews,
  setSwitch,
} from "./fixtures/template-authoring-main-route";

test.describe("新建方案向导尺寸选择（确定性 UI / route Mock）", () => {
  async function openSizeDialog(page: Page) {
    await openTemplateDesignWithoutDraft(page);
    await page.getByRole("button", { name: "顶部新建模板", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "创建模板", exact: true });
    await dialog.getByRole("button", { name: "通用模板", exact: true }).click();
    await dialog.getByRole("button", { name: "下一步", exact: true }).click();
    return dialog;
  }

  async function confirmSize(dialog: ReturnType<Page["getByRole"]>) {
    await dialog.getByRole("button", { name: "下一步", exact: true }).click();
    await dialog.getByRole("button", { name: /上图下文/ }).click();
    await dialog.getByRole("button", { name: "1 张主图", exact: true }).click();
    await dialog.getByRole("button", { name: "下一步", exact: true }).click();
    await dialog.getByRole("button", { name: "前往确认（未配置项用推荐值）", exact: true }).click();
    await dialog.getByRole("button", { name: "创建模板", exact: true }).click();
  }

  for (const width of [1600, 390]) {
    test(`生成后模板设置入口可命名并保持草稿 ${width}px`, async ({ page }, testInfo) => {
      const server = await installNewTemplateServer(page);
      await page.setViewportSize({ width: 1600, height: 1000 });
      const dialog = await openSizeDialog(page);
      await dialog.getByRole("button", { name: /宽屏 16:9/ }).click();
      await confirmSize(dialog);
      await expect(dialog).toBeHidden();
      const initial = await readSession(page);
      const nameInput = page.getByRole("textbox", { name: "模板名称", exact: true });
      await expect(nameInput).toBeInViewport();
      await structurePanel(page).getByRole("treeitem").first().click();
      await expect.poll(async () => (await readSession(page)).selectedObjectId).not.toBe(initial.definition!.rootNodeId);
      if (width < 1200) await page.setViewportSize({ width, height: 844 });
      const settingsButton = page.getByRole("button", { name: "打开模板设置", exact: true });
      await expect(settingsButton).toBeInViewport();
      await expect(settingsButton).toContainText(width < 1200 ? "未命名模板" : "填写模板名称");
      await settingsButton.click();
      await expect(nameInput).toBeInViewport();
      await expect.poll(async () => (await readSession(page)).selectedObjectId).toBe(initial.definition!.rootNodeId);
      expect((await readSession(page)).definition).toEqual(initial.definition);
      await fillTemplateName(page, `设置入口验收 ${width}`);
      const named = await readSession(page);
      expect(named.definition!.name).toBe(`设置入口验收 ${width}`);
      expect(named.definition!.nodes).toEqual(initial.definition!.nodes);
      expect(named.definition!.metadata).toEqual(initial.definition!.metadata);
      expect(named.sessionId).toBe(initial.sessionId);
      expect(server.writes).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`template-settings-${width}.png`), animations: "disabled" });
      if (width < 1200) {
        await page.getByRole("button", { name: "收起模板属性面板", exact: true }).click();
      }
      await expect(settingsButton).toContainText("模板设置");
      await page.getByRole("button", { name: "撤销", exact: true }).click();
      await expect.poll(async () => (await readSession(page)).definition).toEqual(initial.definition);
      await expect(settingsButton).toContainText(width < 1200 ? "未命名模板" : "填写模板名称");
      expect(server.writes).toEqual([]);
    });
  }

  for (const [name, width, height] of [
    ["正方形", 1080, 1080], ["竖版", 1080, 1350], ["手机全屏", 1080, 1920],
    ["宽屏", 1920, 1080], ["标准竖版", 1080, 1440], ["海报竖版", 1200, 1800],
    ["标准横版", 1200, 900], ["社交横图", 1200, 628],
  ] as const) {
    test(`尺寸预设 ${name} 创建、选中、列表、逻辑尺寸与等比例适配`, async ({ page }, testInfo) => {
      const server = await installNewTemplateServer(page);
      await page.setViewportSize({ width: 1600, height: 1000 });
      const dialog = await openSizeDialog(page);
      await expect(dialog).toContainText("选择画布尺寸");
      expect((await readSession(page)).definition).toBeNull();
      await expect(dialog.getByRole("button", { name: "下一步", exact: true })).toBeDisabled();
      if (["标准竖版", "海报竖版", "标准横版", "社交横图"].includes(name)) await dialog.getByRole("button", { name: "更多尺寸", exact: true }).click();
      const option = dialog.getByRole("button", { name: new RegExp(`(?:^|\\s)${name} `) });
      await option.click();
      await expect(option).toHaveAttribute("aria-pressed", "true");
      await expect(dialog.locator('.template-recipe__grid button[aria-pressed="true"]')).toHaveCount(1);
      const preview = await option.locator("i").boundingBox();
      expect(preview!.width / preview!.height).toBeCloseTo(width / height, 1);
      if (name === "手机全屏") await page.screenshot({ path: testInfo.outputPath("size-modal-desktop.png"), animations: "disabled" });
      await confirmSize(dialog);
      await expect(dialog).toBeHidden();
      await expect(blankTemplateStart(page)).toBeHidden();
      const session = await readSession(page);
      expect(session.definition!.metadata.canvasSize).toEqual({ width, height, aspectRatio: width / height });
      expect(session.selectedObjectId).toBe(session.definition!.rootNodeId);
      expect(session.definition!.schemaVersion).toBe(3);
      expect(Object.keys(session.definition!.slots).length).toBeGreaterThan(0);
      expect(session.definition!.nodes[session.definition!.rootNodeId].childIds.length).toBeGreaterThan(0);
      expect(session.dirty).toBe(true);
      const card = page.locator(`[data-template-name="${session.definition!.templateId}"]`);
      await expect(card).toContainText("尚未保存");
      await expect(card.getByRole("button", { name: /未命名模板/ }).first()).toHaveAttribute("aria-pressed", "true");
      await expect.poll(async () => {
        const canvas = await readCanvasReadout(page);
        return [canvas.width, canvas.height];
      }).toEqual([width, height]);
      const frame = page.locator("iframe[title$='模板隔离画布']:visible");
      const box = await frame.boundingBox();
      expect(box!.width / box!.height).toBeCloseTo(width / height, 2);
      expect(box!.width).toBeLessThan(1600);
      expect(box!.height).toBeLessThan(1000);
      if (name === "手机全屏") await page.screenshot({ path: testInfo.outputPath("portrait-canvas-desktop.png"), animations: "disabled" });
      expect(server.writes).toEqual([]);
      await card.click();
      expect((await readSession(page)).sessionId).toBe(session.sessionId);
    });
  }

  test("自定义尺寸双向锁定、整数边界和取消保留当前草稿", async ({ page }) => {
    const server = await installNewTemplateServer(page);
    await page.setViewportSize({ width: 1600, height: 1000 });
    const dialog = await openSizeDialog(page);
    await dialog.getByRole("button", { name: /手机全屏 9:16/ }).click();
    await dialog.getByRole("button", { name: "自定义尺寸", exact: true }).click();
    const width = dialog.getByRole("spinbutton", { name: "宽度", exact: true });
    const height = dialog.getByRole("spinbutton", { name: "高度", exact: true });
    await dialog.getByRole("switch", { name: "锁定比例" }).click();
    await width.fill("540");
    await expect(height).toHaveValue("960");
    await height.fill("1600");
    await expect(width).toHaveValue("900");
    await dialog.getByRole("switch", { name: "锁定比例" }).click();
    for (const invalid of ["", "0", "-1", "4097", "12.5"]) {
      await width.fill(invalid);
      await expect(dialog.getByRole("button", { name: "下一步", exact: true })).toBeDisabled();
    }
    await width.fill("1200");
    await height.fill("800");
    await confirmSize(dialog);
    await expect(dialog).toBeHidden();
    await expect(blankTemplateStart(page)).toBeHidden();
    const created = await readSession(page);
    expect(created.definition!.metadata.canvasSize).toEqual({ width: 1200, height: 800, aspectRatio: 1.5 });
    await page.getByRole("button", { name: "顶部新建模板", exact: true }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "取消", exact: true }).click();
    expect(stableAuthoringFacts(await readSession(page))).toEqual(stableAuthoringFacts(created));
    await page.getByRole("button", { name: "顶部新建模板", exact: true }).click();
    await dialog.getByRole("button", { name: "通用模板", exact: true }).click();
    await dialog.getByRole("button", { name: "下一步", exact: true }).click();
    await dialog.getByRole("button", { name: /正方形 1:1/ }).click();
    await confirmSize(dialog);
    const guard = page.getByRole("dialog", { name: "新建模板？", exact: true });
    await expect(guard).toBeVisible();
    await guard.getByRole("button", { name: "继续编辑", exact: true }).click();
    expect(stableAuthoringFacts(await readSession(page))).toEqual(stableAuthoringFacts(created));
    expect(server.writes).toEqual([]);
  });

  test("最大自定义画布保持逻辑尺寸且完整适应编辑区", async ({ page }) => {
    await installNewTemplateServer(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    const dialog = await openSizeDialog(page);
    await dialog.getByRole("button", { name: "自定义尺寸", exact: true }).click();
    await dialog.getByRole("spinbutton", { name: "宽度", exact: true }).fill("4096");
    await dialog.getByRole("spinbutton", { name: "高度", exact: true }).fill("4096");
    await confirmSize(dialog);
    await expect.poll(async () => {
      const result = await readCanvasReadout(page);
      return [result.width, result.height];
    }).toEqual([4096, 4096]);
    const frame = await page.locator("iframe[title$='模板隔离画布']:visible").boundingBox();
    expect(frame!.width).toBeCloseTo(frame!.height, 1);
    expect(frame!.height).toBeLessThan(800);
  });

  test("尺寸数据保存及重新打开保留完整像素尺寸（route Mock）", async ({ page }) => {
    const server = await installNewTemplateServer(page);
    await page.setViewportSize({ width: 1600, height: 1000 });
    const dialog = await openSizeDialog(page);
    await dialog.getByRole("button", { name: /手机全屏 9:16/ }).click();
    await confirmSize(dialog);
    await expect(dialog).toBeHidden();
    await expect(blankTemplateStart(page)).toBeHidden();
    const created = (await readSession(page)).definition!;
    await saveTemplate(page);
    await expect.poll(() => server.saveResults.length).toBe(1);
    expect(server.persisted!.draft!.definition.metadata.canvasSize).toEqual(created.metadata.canvasSize);
    await openTemplateDesignWithoutDraft(page);
    const card = page.locator(`[data-template-name="${created.templateId}"]`);
    await card.getByRole("button", { name: /^打开未命名模板/ }).click();
    await expect.poll(async () => (await readSession(page)).definition?.metadata.canvasSize)
      .toEqual({ width: 1080, height: 1920, aspectRatio: 1080 / 1920 });
    await expect.poll(async () => {
      const result = await readCanvasReadout(page);
      return [result.width, result.height];
    }).toEqual([1080, 1920]);
  });

  test("画布尺寸合同拒绝非法值并兼容旧模板", async ({ page }) => {
    await installNewTemplateServer(page);
    await openTemplateDesignWithoutDraft(page);
    const result = await page.evaluate(async () => {
      const repoPath = "/src/page-builder/template-editor/dynamicTemplateDraftRepository.ts";
      const validatorPath = "/src/page-builder/template-definition/validateTemplateDefinition.ts";
      const { createNewDynamicTemplateDraft } = await import(/* @vite-ignore */ repoPath);
      const { validateDynamicTemplateDefinition } = await import(/* @vite-ignore */ validatorPath);
      const valid = [1, 4096].map((size) => {
        const definition = createNewDynamicTemplateDraft("尺寸测试", { width: size, height: size }).definition;
        return validateDynamicTemplateDefinition(definition).valid;
      });
      const rejected = [0, -1, 4097, NaN, Infinity, 1.5].map((width) => {
        try { createNewDynamicTemplateDraft("尺寸测试", { width, height: 1080 }); return false; }
        catch { return true; }
      });
      const definition = createNewDynamicTemplateDraft("尺寸测试", { width: 1200, height: 628 }).definition;
      definition.metadata.canvasSize.aspectRatio = 1.91;
      const mismatchRejected = !validateDynamicTemplateDefinition(definition).valid;
      const legacy = createNewDynamicTemplateDraft("旧模板").definition;
      return { valid, rejected, mismatchRejected,
        legacyValid: validateDynamicTemplateDefinition(legacy).valid,
        legacySizeAbsent: !legacy.metadata.canvasSize,
        legacyHeight: legacy.nodes[legacy.rootNodeId].responsive.desktop.height.mode };
    });
    expect(result).toEqual({ valid: [true, true], rejected: [true, true, true, true, true, true],
      mismatchRejected: true, legacyValid: true, legacySizeAbsent: true, legacyHeight: "auto" });
  });

  test("窄屏弹窗可滚动、键盘退出并恢复新建按钮焦点", async ({ page }, testInfo) => {
    await installNewTemplateServer(page);
    await page.setViewportSize({ width: 1600, height: 1000 });
    const dialog = await openSizeDialog(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await dialog.getByRole("button", { name: "自定义尺寸", exact: true }).click();
    await expect(dialog.getByRole("spinbutton", { name: "宽度", exact: true })).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    await dialog.getByRole("spinbutton", { name: "宽度", exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("size-modal-mobile.png"), animations: "disabled" });
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    expect((await readSession(page)).definition).toBeNull();
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.getByRole("button", { name: "顶部新建模板", exact: true }).click();
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByRole("button", { name: "顶部新建模板", exact: true })).toBeFocused();
  });
});

test.describe("TD-UI-2A 旧空白模板兼容制作流程（route Mock Chromium）", () => {
  const browserErrors = new WeakMap<Page, string[]>();
  test.beforeEach(async ({ page }) => {
    const errors: string[] = [];
    browserErrors.set(page, errors);
    page.on("pageerror", (error) => errors.push(error.message));
    await page.exposeFunction("__recordTemplateBrowserError", (message: string) => errors.push(message));
    // 原生 RO ErrorEvent 未必带 error 对象，不能仅依赖 Playwright pageerror。
    // 不替换 ResizeObserver、不增加尺寸读取，保持用户实际交互时序。
    await page.addInitScript(() => {
      const errors: string[] = [];
      const diagnosticWindow = window as unknown as {
        __templateBrowserErrors: string[];
        __rebindTemplateObserverListener: () => void;
        __recordTemplateBrowserError: (message: string) => Promise<void>;
      };
      diagnosticWindow.__templateBrowserErrors = errors;
      const onError = (event: ErrorEvent) => {
        if (!event.message) return;
        errors.push(event.message);
        void diagnosticWindow.__recordTemplateBrowserError(event.message);
      };
      diagnosticWindow.__rebindTemplateObserverListener = () => {
        window.removeEventListener("error", onError);
        window.addEventListener("error", onError);
      };
      diagnosticWindow.__rebindTemplateObserverListener();
    });
    const rebind = async () => {
      for (const frame of page.frames()) await frame.evaluate(() => {
        (window as unknown as { __rebindTemplateObserverListener?: () => void }).__rebindTemplateObserverListener?.();
      }).catch(() => undefined);
    };
    page.on("framenavigated", () => { void rebind(); });
    void page.locator(".homepage-editor__toolbar").waitFor({ state: "visible", timeout: 15000 })
      .then(rebind).catch(() => undefined);
  });
  test.afterEach(async ({ page }) => {
    const errors = browserErrors.get(page)!;
    // 让最后一个操作的原生测量交付完成后再读错误，避免关页丢失尾部 binding 消息。
    if (!page.isClosed()) await waitForMeasurementCycles(page, 2);
    const frames = await Promise.all(page.frames().map((frame) => frame.evaluate(() => {
      return (window as unknown as { __templateBrowserErrors?: string[] }).__templateBrowserErrors ?? [];
    }).catch(() => [])));
    errors.push(...frames.flat());
    // 包含测试自有页面关闭时的尾部通知；不访问或关闭人工页面。
    if (!page.isClosed()) await page.close();
    expect(errors, "新建流程不得出现浏览器异常，包括未交付的 ResizeObserver 通知").toEqual([]);
  });

  test("历史升级提示使用中性模板文案", () => {
    expect(homepageConfigSource).toContain("个模板实例；保存页面草稿后才会持久化");
    expect(homepageConfigSource).not.toContain("个人模板实例");
    expect(homepageConfigSource).not.toContain("动态模板实例");
  });

  test("进入模板设计不打开旧模板，显式载入旧空白夹具后仍可编辑且不自动写入", async ({ page }) => {
    const server = await installNewTemplateServer(page);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await openTemplateDesignWithoutDraft(page);
    expect((await readSession(page)).definition).toBeNull();
    expect(server.writes).toEqual([]);

    await page.getByRole("button", { name: "顶部新建模板", exact: true }).click();
    const wizard = page.getByRole("dialog", { name: "创建模板", exact: true });
    await expect(wizard).toBeVisible();
    expect((await readSession(page)).definition).toBeNull();
    await wizard.getByRole("button", { name: "取消", exact: true }).click();
    await createBlankTemplate(page);
    await expect(blankTemplateStart(page)).toBeVisible();
    const snapshot = await readSession(page);
    if (!snapshot.definition) throw new Error("载入旧空白夹具后缺少模板定义");
    expect(snapshot.definition.schemaVersion).toBe(2);
    expect(Object.keys(snapshot.definition.nodes)).toEqual([snapshot.definition.rootNodeId]);
    expect(snapshot.definition.nodes[snapshot.definition.rootNodeId].childIds).toEqual([]);
    expect(snapshot.definition.slots).toEqual({});
    expect(snapshot.definition.defaultContent).toEqual({});
    expect(snapshot.definition.previewContent).toEqual({});
    expect(snapshot.historyPast).toEqual([]);
    expect(server.writes).toEqual([]);

    await expect(guide(page)).toBeHidden();
    await expect(page.getByRole("list", { name: "模板制作建议", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "使用双图文骨架", exact: true })).toHaveCount(0);
    await expect(firstRegionAction(page)).toBeVisible();
    expect(snapshot.definition.name).toBe(NEW_TEMPLATE_NAME);
    expect(snapshot.dirty).toBe(true);
    await expect(page.getByRole("region", { name: "空白模板制作起点", exact: true })).toHaveCount(0);
    await expect(page.getByText(/转换为新版|固定模板|动态模板|个人模板|内置模板|新版模板|系统模板/)).toHaveCount(0);
  });

  test("未填写交付资料也可通过原生增补建立内容并保存，发布门禁仍然有效", async ({ page }) => {
    const server = await installNewTemplateServer(page);
    await page.setViewportSize({ width: 1600, height: 1000 });
    const blank = await createBlankTemplate(page);
    await addContentGroupsAndSlots(page);

    const scaffolded = await readSession(page);
    expect(scaffolded.historyPast.length).toBeGreaterThan(blank.historyPast.length);
    expect(scaffolded.semanticGeneration).toBeGreaterThan(blank.semanticGeneration);
    expect(Object.keys(scaffolded.definition!.slots)).toHaveLength(4);
    await expect(blankTemplateStart(page)).toBeHidden();
    expect(server.writes).toEqual([]);
    const save = page.locator(".homepage-editor__toolbar").getByRole("button", { name: /保存(?:模板|草稿)/ });
    await save.click();
    await expect.poll(() => server.saveResults.length).toBe(1);
    expect((await readSession(page)).definition).toEqual(scaffolded.definition);
    await page.getByRole("button", { name: /^发布模板/ }).click();
    const review = page.getByRole("region", { name: "本次发布检查", exact: true });
    await expect(review).toContainText("请先完成必要修改");
    await expect(review.getByRole("button", { name: "保存并发布模板", exact: true })).toBeDisabled();
    expect(server.writes).toHaveLength(1);
    expect(server.published).toBeNull();
  });

  test("结构问题修复复用统一区域命令且只产生一条内存历史", async ({ page }) => {
    const server = await installNewTemplateServer(page);
    await page.setViewportSize({ width: 1600, height: 1000 });
    const blank = await createBlankTemplate(page);
    const structure = structurePanel(page);
    const issue = structure.getByRole("listitem")
      .filter({ hasText: "模板尚未创建内容区域" });
    await expect(issue).toBeVisible();
    await issue.getByRole("button", { name: "修复", exact: true }).click();

    const repaired = await readSession(page);
    const definition = repaired.definition!;
    const regionIds = definition.nodes[definition.rootNodeId].childIds;
    expect(regionIds).toHaveLength(1);
    const region = definition.nodes[regionIds[0]];
    expect(region.name).toBe("内容区域 1");
    for (const device of ["desktop", "mobile"] as const) {
      const rules = region.responsive[device];
      expect(rules.gap).toEqual({ value: 24, unit: "px" });
      const side = { value: device === "desktop" ? 32 : 16, unit: "px" };
      expect(rules.padding).toEqual({ top: side, right: side, bottom: side, left: side });
    }
    expect(repaired.historyPast).toHaveLength(blank.historyPast.length + 1);
    expect(repaired.historyFuture).toEqual([]);
    expect(repaired.selectedObjectId).toBe(region.nodeId);
    expect(server.writes, "结构修复不得保存模板、发布模板或写入页面").toEqual([]);
  });


  test("P0 真正空白画布尺寸有限、稳定，适应画布不会被压到 10%", async ({ page }) => {
    await installNewTemplateServer(page);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await createBlankTemplate(page);
    await expectHealthyStableCanvas(page);

    await page.getByRole("button", { name: "适应画布", exact: true }).click();
    await waitForMeasurementCycles(page, 2);
    const fitted = await readCanvasReadout(page);
    expect(fitted.zoomPercent, `适应画布不得因异常高度退化为 10%：${fitted.label}`).not.toBe(10);
    expect(fitted.zoomPercent, fitted.label).toBeGreaterThan(10);
  });

  test("P0 添加首区域后画布仍有限且不持续增长", async ({ page }, testInfo) => {
    await installNewTemplateServer(page);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await createBlankTemplate(page);
    await addFirstRegion(page);
    await expectHealthyStableCanvas(page);

    const frame = page.frameLocator("iframe[title$='模板隔离画布']");
    const emptyRegion = frame.locator('[data-template-empty-structure="true"]').last();
    await expect(emptyRegion).toBeVisible();
    const editorHeight = await emptyRegion.evaluate((element) => element.getBoundingClientRect().height);
    expect(editorHeight, "空区域在隔离画布内必须具有最小编辑操作面").toBeGreaterThanOrEqual(120);
    const editorBox = await emptyRegion.boundingBox();
    expect(editorBox?.height, "适应画布缩放后仍必须保留可点击高度").toBeGreaterThanOrEqual(96);

    const snapshot = await readSession(page);
    const root = snapshot.definition!.nodes[snapshot.definition!.rootNodeId];
    const region = snapshot.definition!.nodes[root.childIds[0]];
    expect(region.responsive.desktop.height).toEqual({ mode: "auto" });
    // Mobile keeps inheriting the desktop auto rule; the editor placeholder must not persist a fixed height.
    expect(region.responsive.mobile.height).toBeUndefined();
    await page.screenshot({ path: testInfo.outputPath("empty-region-editor-surface.png"), fullPage: true });
  });

  test("旧空白模板的原生添加区域可由键盘触发且 history 加一", async ({ page }) => {
    await installNewTemplateServer(page);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await createBlankTemplate(page);
    await fillTemplateIdentity(page, "键盘添加首区域模板", "验证空白模板主动作");
    const ready = await readSession(page);
    await expect(guide(page)).toBeHidden();
    const action = firstRegionAction(page);
    await expect(action).toHaveCount(1);
    await action.focus();
    await page.keyboard.press("Enter");

    const after = await readSession(page);
    expect(after.historyPast).toHaveLength(ready.historyPast.length + 1);
    expect(after.definition!.nodes[after.definition!.rootNodeId].childIds).toHaveLength(1);
    await expect(guide(page)).toBeHidden();
    await expectHealthyStableCanvas(page);
  });

  test("添加第二个区域明确显示插入位置，确认只增加一次 history", async ({ page }) => {
    await installNewTemplateServer(page);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await createBlankTemplate(page);
    await addFirstRegion(page);
    const before = await readSession(page);
    await page.getByRole("button", { name: "添加区域", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "添加区域", exact: true });
    await expect(dialog.getByLabel("区域插入位置")).toBeVisible();
    await dialog.getByLabel("区域插入位置").selectOption("after");
    await dialog.getByRole("button", { name: "确认添加区域", exact: true }).click();

    const after = await readSession(page);
    expect(after.definition!.nodes[after.definition!.rootNodeId].childIds).toHaveLength(2);
    expect(after.historyPast).toHaveLength(before.historyPast.length + 1);
    await expect(guide(page)).toBeHidden();
  });

  test("已移除双图文起步流程，原生添加区域取消零增量、确认一条 history 且可撤销", async ({ page }) => {
    const server = await installNewTemplateServer(page);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await createBlankTemplate(page);
    await fillTemplateIdentity(page, "原生区域撤销模板", "验证添加区域确认与取消");
    await addFirstRegion(page);
    const blank = await readSession(page);
    await expect(page.getByRole("button", { name: "使用双图文骨架", exact: true })).toHaveCount(0);
    await expect(guide(page)).toBeHidden();
    const add = structurePanel(page).getByRole("button", { name: "添加区域", exact: true });
    await add.click();
    const dialog = page.getByRole("dialog", { name: "添加区域", exact: true });
    await expect(dialog.getByLabel("区域插入位置")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    expect(await readSession(page)).toEqual(blank);

    await add.click();
    await dialog.getByLabel("区域插入位置").selectOption("after");
    await dialog.getByRole("button", { name: "确认添加区域", exact: true }).click();
    const scaffolded = await readSession(page);
    expect(scaffolded.historyPast).toHaveLength(blank.historyPast.length + 1);
    expect(scaffolded.definition!.nodes[scaffolded.definition!.rootNodeId].childIds).toHaveLength(2);
    expect(Object.keys(scaffolded.definition!.slots)).toHaveLength(0);
    expect(scaffolded.definition!.defaultContent).toEqual({});
    expect(scaffolded.definition!.previewContent).toEqual({});
    const rootId = scaffolded.definition!.rootNodeId;
    expect(scaffolded.definition!.nodes[rootId].responsive).toEqual(blank.definition!.nodes[rootId].responsive);
    expect(scaffolded.definition!.nodes[rootId].responsive.desktop.height).toEqual({ mode: "auto" });
    await page.getByRole("button", { name: /^撤销/ }).click();
    expect((await readSession(page)).definition).toEqual(blank.definition);
    await page.getByRole("button", { name: /^重做/ }).click();
    expect((await readSession(page)).definition).toEqual(scaffolded.definition);
    expect(server.writes).toEqual([]);
  });

  for (const width of [1200, 1920]) test(`模板整体规则：${width}px入口、比例事务、非法值与手机覆盖`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const server = await installNewTemplateServer(page);
    await createBlankTemplate(page);
    await applyBasicSkeleton(page);
    const beforeSelection = await readSession(page);
    await structurePanel(page).getByRole("button", { name: "模板整体", exact: true }).click();
    const before = await readSession(page);
    expect(before.historyPast).toEqual(beforeSelection.historyPast);
    const rootId = before.definition!.rootNodeId;
    const inspector = page.getByRole("region", { name: "对象设计属性", exact: true });
    await expect(inspector.getByRole("heading", { name: "模板整体尺寸与比例", exact: true })).toBeInViewport();
    const mode = inspector.getByRole("combobox", { name: "高度方式", exact: true });
    await expect(mode).toHaveValue("auto");
    const presets = inspector.getByRole("group", { name: "模板整体比例预设", exact: true });
    await presets.getByRole("button", { name: "4:3", exact: true }).click();
    expect((await readSession(page)).definition).toEqual(before.definition);
    await inspector.getByRole("button", { name: "取消比例预览", exact: true }).click();
    expect((await readSession(page)).historyPast).toEqual(before.historyPast);
    await presets.getByRole("button", { name: "4:3", exact: true }).click();
    await inspector.getByRole("button", { name: "确认对象比例", exact: true }).click();
    const ratioState = await readSession(page);
    expect(ratioState.historyPast).toHaveLength(before.historyPast.length + 1);
    expect(ratioState.definition!.nodes[rootId].responsive.desktop.height).toEqual({ mode: "aspect-ratio", ratio: { width: 4, height: 3 } });
    const frame = page.locator("iframe[title$='模板隔离画布']");
    await expect.poll(() => frame.evaluate((element) => Number.parseFloat((element as HTMLIFrameElement).style.height))).toBe(1440);
    const ratioWidth = inspector.getByRole("spinbutton", { name: "比例宽", exact: true });
    await ratioWidth.fill("0"); await ratioWidth.press("Enter");
    await expect(ratioWidth).toHaveAttribute("aria-invalid", "true");
    expect((await readSession(page)).definition).toEqual(ratioState.definition);
    await ratioWidth.press("Escape");
    await expect(ratioWidth).toHaveValue("4");
    await ratioWidth.fill("16"); await ratioWidth.press("Enter");
    expect((await readSession(page)).definition!.nodes[rootId].responsive.desktop.height).toEqual({ mode: "aspect-ratio", ratio: { width: 16, height: 3 } });
    await page.getByRole("button", { name: "撤销", exact: true }).click();
    await expect(ratioWidth).toHaveValue("4");
    expect((await readSession(page)).definition).toEqual(ratioState.definition);
    expect(await inspector.evaluate((element) => element.scrollWidth > element.clientWidth + 1)).toBe(false);
    await page.screenshot({ path: testInfo.outputPath(`overall-rules-${width}.png`), fullPage: true });
    await page.getByRole("button", { name: /^移动端模板布局/ }).click();
    await expect(mode).toHaveValue("aspect-ratio");
    await mode.selectOption("auto");
    const mobile = await readSession(page);
    expect(mobile.definition!.nodes[rootId].responsive.mobile.height).toEqual({ mode: "auto" });
    expect(mobile.definition!.nodes[rootId].responsive.desktop.height).toEqual(ratioState.definition!.nodes[rootId].responsive.desktop.height);
    const property = inspector.locator('[data-template-design-property="node.height"]');
    await property.getByRole("button", { name: "恢复继承", exact: true }).click();
    await expect(mode).toHaveValue("aspect-ratio");
    expect((await readSession(page)).definition!.nodes[rootId].responsive.mobile.height).toBeUndefined();
    expect(server.writes).toEqual([]);
  });

  test("模板整体规则：先定整体再放槽位，骨架和保存均保留比例", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const server = await installNewTemplateServer(page);
    await createBlankTemplate(page);
    await structurePanel(page).getByRole("button", { name: "模板整体", exact: true }).click();
    const inspector = page.getByRole("region", { name: "对象设计属性", exact: true });
    await expect(inspector.getByRole("heading", { name: "模板整体尺寸与比例", exact: true })).toBeVisible();
    await inspector.getByRole("group", { name: "模板整体比例预设", exact: true }).getByRole("button", { name: "4:3", exact: true }).click();
    await inspector.getByRole("button", { name: "确认对象比例", exact: true }).click();
    const before = await readSession(page);
    const rootRules = before.definition!.nodes[before.definition!.rootNodeId].responsive;
    await applyBasicSkeleton(page);
    const composed = await readSession(page);
    expect(composed.definition!.nodes[composed.definition!.rootNodeId].responsive).toEqual(rootRules);
    await fillTemplateIdentity(page, "整体比例保留验收", "先设置整体，再添加图文");
    await saveTemplate(page);
    await expect.poll(async () => (await readSession(page)).dirty).toBe(false);
    expect(server.persisted).not.toBeNull();
    const stored = server.persisted!.draft!.definition;
    expect(stored.nodes[stored.rootNodeId].responsive).toEqual(rootRules);
    expect(server.writes.filter((write) => write.path.endsWith("/publish"))).toHaveLength(0);
    await inspector.getByRole("combobox", { name: "高度方式", exact: true }).selectOption("auto");
    const natural = await readSession(page);
    expect(natural.definition!.nodes[natural.definition!.rootNodeId].responsive.desktop.height).toEqual({ mode: "auto" });
    const frame = page.locator("iframe[title$='模板隔离画布']");
    await expect.poll(() => frame.evaluate((element) => Number.parseFloat((element as HTMLIFrameElement).style.height))).toBeLessThan(600);
    await page.mouse.move(10, 10);
    await page.screenshot({ path: testInfo.outputPath("overall-natural-content-1600.png"), fullPage: true });
  });

  test("未选合法目标零写，图片组与文字组可原生建立四类槽位", async ({ page }) => {
    const server = await installNewTemplateServer(page);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await createBlankTemplate(page);
    await addTwoRegions(page);

    await page.getByRole("button", { name: "选择模板目标 模板根节点", exact: true }).click();
    const beforeInvalid = await readSession(page);
    await page.getByRole("button", { name: "添加槽位", exact: true }).click();
    const invalidAdd = page.getByRole("button", { name: "添加图片槽位", exact: true });
    await expect(page.getByLabel("添加目标")).toHaveValue("");
    await expect(invalidAdd).toBeDisabled();
    expect(await readSession(page)).toEqual(beforeInvalid);
    expect(server.writes).toEqual([]);
    await page.keyboard.press("Escape");

    const tree = page.getByRole("tree", { name: "模板区域与槽位" });
    await tree.getByRole("treeitem", { name: /内容区域 1/ }).click();
    await page.getByRole("button", { name: "添加槽位", exact: true }).click();
    await page.getByRole("button", { name: "添加左右排列布局分组", exact: true }).click();
    await page.keyboard.press("Escape");
    await page.getByLabel("节点名称").first().fill("图片组");
    await page.getByLabel("节点名称").first().press("Tab");
    await page.getByRole("button", { name: "添加槽位", exact: true }).click();
    await chooseAddTarget(page, "图片组");
    await page.getByRole("button", { name: "添加图片槽位", exact: true }).click();
    await page.keyboard.press("Escape");
    await tree.getByRole("treeitem", { name: /内容区域 2/ }).click();
    await page.getByRole("button", { name: "添加槽位", exact: true }).click();
    await page.getByRole("button", { name: "添加上下排列布局分组", exact: true }).click();
    await page.keyboard.press("Escape");
    await page.getByLabel("节点名称").first().fill("文字组");
    await page.getByLabel("节点名称").first().press("Tab");
    await page.getByRole("button", { name: "添加槽位", exact: true }).click();
    await chooseAddTarget(page, "文字组");
    for (const label of ["添加标题槽位", "添加正文槽位", "添加按钮槽位"]) {
      await page.getByRole("button", { name: label, exact: true }).click();
    }
    await page.keyboard.press("Escape");

    const authored = await readSession(page);
    expect(Object.values(authored.definition!.slots).map((slot) => slot.type).sort())
      .toEqual(["button", "heading", "image", "text"]);
    await expect(guide(page)).toBeHidden();
    expect(server.writes).toEqual([]);
  });

  test("桌面与手机切换显示当前差异和待检查，点击设备本身不能冒充配置完成", async ({ page }) => {
    await installNewTemplateServer(page);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await createBlankTemplate(page);
    await addContentGroupsAndSlots(page);
    await expect(guide(page)).toBeHidden();
    const before = await readSession(page);

    await page.getByRole("button", { name: /移动端模板布局/ }).click();
    const mobile = await readSession(page);
    expect(mobile.device).toBe("mobile");
    expect(stableAuthoringFacts(mobile)).toEqual(stableAuthoringFacts(before));
    await page.getByRole("button", { name: /桌面端模板布局/ }).click();
    const desktopAgain = await readSession(page);
    expect(desktopAgain.device).toBe("desktop");
    expect(stableAuthoringFacts(desktopAgain)).toEqual(stableAuthoringFacts(before));
    expect(desktopAgain.productionReviewFacts).toEqual(before.productionReviewFacts);
    expect(desktopAgain.productionReviewFacts.desktop).toBe(false);
    expect(desktopAgain.productionReviewFacts.mobile).toBe(false);
  });

  test("页面开放范围阻止新冲突，既有冲突仍可定位并原子修复", async ({ page }) => {
    await installNewTemplateServer(page);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await createBlankTemplate(page);
    await addContentGroupsAndSlots(page);
    await fillTemplateIdentity(page, "页面开放范围模板", "验证真实页面字段与冲突定位");

    await (await productionStageAction(page, "页面开放范围")).click();
    const snapshot = await readSession(page);
    expect(snapshot.selectedObjectId).toBe(snapshot.definition!.rootNodeId);
    expect(snapshot.inspectorTask).toBe("page-scope");
    expect(snapshot.inspectorView).toBe("page-fields");
    await expect(page.getByRole("tab", { name: "页面开放范围", exact: true }))
      .toHaveAttribute("aria-selected", "true");
    const fields = page.getByRole("region", { name: "当前结构页面字段", exact: true });
    await expect(fields.getByRole("button")).toHaveCount(snapshot.pageFields.length);
    expect(snapshot.pageFields.length).toBeGreaterThan(0);
    const expectedLabels = snapshot.pageFields.map((field) => field.label);
    expect(await fields.getByRole("button").evaluateAll((buttons) => (
      buttons.map((button) => button.getAttribute("data-page-field-label"))
    ))).toEqual(expectedLabels);

    const field = fields.getByRole("button").filter({ hasText: expectedLabels[0] });
    await expect(field).toHaveCount(1);
    await field.click();
    await setSwitch(page, "页面可填写内容", true);
    await setSwitch(page, "页面可隐藏", false);
    await setSwitch(page, "页面必须填写", true);
    const requiredState = await readSession(page);
    await expect(page.getByRole("switch", { name: "页面可填写内容", exact: true })).toBeDisabled();
    await expect(page.getByRole("switch", { name: "页面可隐藏", exact: true })).toBeDisabled();
    await expect(page.getByText("必填字段必须允许填写；先关闭“页面必须填写”，才能改为只读。", { exact: true })).toBeVisible();
    await expect(page.getByText("必填字段不可允许页面隐藏；先关闭“页面必须填写”，才能开放隐藏。", { exact: true })).toBeVisible();
    expect((await readSession(page)).historyPast).toEqual(requiredState.historyPast);

    await setSwitch(page, "页面必须填写", false);
    await setSwitch(page, "页面可填写内容", false);
    await expect(page.getByRole("switch", { name: "页面必须填写", exact: true })).toBeDisabled();
    await expect(page.getByText("先允许页面填写内容并关闭页面隐藏，再设为必填；不会自动更改其他开关。", { exact: true })).toBeVisible();
    await setSwitch(page, "页面可填写内容", true);
    await setSwitch(page, "页面可隐藏", true);
    await expect(page.getByRole("switch", { name: "页面必须填写", exact: true })).toBeDisabled();
    await setSwitch(page, "页面可隐藏", false);
    await expect(page.getByRole("switch", { name: "页面必须填写", exact: true })).toBeEnabled();

    // 仅测试夹具模拟已载入的历史坏稿；新命令不得被用于制造非法 required/readonly 组合。
    await page.evaluate(async (slotId) => {
      const sessionPath = "/src/page-builder/template-editor/templateEditorSession.ts";
      const { useTemplateEditorSession } = await import(/* @vite-ignore */ sessionPath);
      const state = useTemplateEditorSession.getState();
      const definition = structuredClone(state.draft.definition);
      Object.assign(definition.slots[slotId], { required: true, editable: false, hideable: true });
      useTemplateEditorSession.setState({
        draft: { ...state.draft, definition },
        dirty: true,
        semanticGeneration: state.semanticGeneration + 1,
      });
    }, snapshot.pageFields[0].slotId);
    await expect(page.getByRole("tabpanel", { name: "页面开放范围", exact: true })
      .getByText("必填字段必须可填写且不可隐藏", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /^发布模板/ }).click();
    const locate = page.getByRole("region", { name: "本次发布检查", exact: true })
      .locator("[data-template-issue-object]")
      .filter({ hasText: "必填槽位必须允许页面实例填写真实内容" })
      .getByRole("button", { name: "定位并返回编辑", exact: true });
    await expect(locate).toHaveCount(1);
    await locate.click();
    await expect(page.getByRole("switch", { name: "页面可填写内容", exact: true })).toBeFocused();
    const beforeRepair = await readSession(page);
    await page.getByRole("button", { name: "允许填写并关闭隐藏", exact: true }).click();
    const repaired = await readSession(page);
    expect(repaired.definition!.slots[snapshot.pageFields[0].slotId]).toMatchObject({
      required: true, editable: true, hideable: false,
    });
    expect(repaired.historyPast).toHaveLength(beforeRepair.historyPast.length + 1);
    await expect(page.getByText("必填字段必须可填写且不可隐藏", { exact: true })).toHaveCount(0);
  });

  test("五态压力预览切换零请求、零 history，退出恢复 dirty、设备、scope 与选择", async ({ page }) => {
    const server = await installNewTemplateServer(page);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await createBlankTemplate(page);
    await addContentGroupsAndSlots(page);
    await page.getByRole("button", { name: /移动端模板布局/ }).click();
    await page.getByRole("tab", { name: "页面开放范围", exact: true }).click();
    const before = await readSession(page);
    const writesBefore = server.writes.length;
    const previewButton = page.getByRole("button", { name: "预览模板", exact: true });
    await previewButton.focus();
    await previewButton.click();
    const scenarios = page.getByRole("combobox", { name: "压力预览场景", exact: true });
    await expect(scenarios.locator("option")).toHaveCount(5);
    for (const scenario of ["short-text", "long-text", "optional-missing", "required-missing", "media-ratios"]) {
      await scenarios.selectOption(scenario);
      const during = await readSession(page);
      expect(stableAuthoringFacts(during)).toEqual(stableAuthoringFacts(before));
      expect(server.writes).toHaveLength(writesBefore);
    }
    const workspaceExit = page.getByRole("button", { name: "退出预览并继续编辑", exact: true });
    await expect(workspaceExit).toBeVisible();
    await workspaceExit.click();
    await expect(previewButton).toBeVisible();
    await expect(previewButton).toBeEnabled();
    await expect(previewButton).toBeFocused();
    expect(await readSession(page)).toEqual(before);
    expect(server.writes).toHaveLength(writesBefore);
    // 退出预览后两行工具区按正常文档流恢复，不保留旧指引高度或覆盖导航。
    await expect.poll(() => page.evaluate(() => {
      const stage = document.querySelector<HTMLElement>(".template-editor__stage");
      const toolbar = stage?.querySelector<HTMLElement>(".template-editor__view-toolbar");
      const nav = stage?.querySelector<HTMLElement>(".template-editor__scope-breadcrumb");
      if (!toolbar?.isConnected || !nav?.isConnected) return false;
      const gap = nav.getBoundingClientRect().top - toolbar.getBoundingClientRect().bottom;
      return gap >= -1 && gap < 12 && !stage?.style.getPropertyValue("--template-guide-bottom");
    })).toBe(true);
  });

  test("390 顶栏退出模板预览后焦点返回可见可操作的预览入口", async ({ page }) => {
    const server = await installNewTemplateServer(page);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await createBlankTemplate(page);
    await page.setViewportSize({ width: 390, height: 844 });

    const toolbar = page.locator(".template-editor__toolbar");
    const previewButton = toolbar.getByRole("button", { name: "预览模板", exact: true });
    await expect(previewButton).toBeVisible();
    await previewButton.click();

    const toolbarExit = toolbar.getByRole("button", { name: "退出模板预览", exact: true });
    await expect(toolbarExit).toBeVisible();
    await toolbarExit.focus();
    await expect(toolbarExit).toBeFocused();
    await toolbarExit.press("Enter");

    await expect(previewButton).toBeVisible();
    await expect(previewButton).toBeEnabled();
    await expect(previewButton).toBeFocused();
    expect(server.writes).toEqual([]);
  });

  test("保存失败保留草稿、编辑历史和模板名称输入", async ({ page }) => {
    const server = await installNewTemplateServer(page, { failNextSaveWith: 500 });
    await page.setViewportSize({ width: 1600, height: 1000 });
    await createBlankTemplate(page);
    await fillTemplateIdentity(page, "保存失败仍保留的模板", "验证保存失败后输入保留");
    await addContentGroupsAndSlots(page);
    await (await productionStageAction(page, "交付信息")).click();
    const before = await readSession(page);

    await saveTemplate(page);
    await expect.poll(async () => (await readSession(page)).saveStatus).toBe("error");
    const after = await readSession(page);
    expect(after.definition).toEqual(before.definition);
    expect(after.historyPast).toEqual(before.historyPast);
    expect(after.dirty).toBe(true);
    await expect(page.getByRole("textbox", { name: "模板名称", exact: true }).first())
      .toHaveValue("保存失败仍保留的模板");
    await expect(guide(page)).toBeHidden();
    await expect(page.getByRole("status", {
      name: "模板状态：保存失败，修改仍在，可以重试",
      exact: true,
    })).toContainText("保存未完成，输入仍保留");
    expect(server.writes.filter((write) => write.method === "POST")).toHaveLength(1);
  });

  test("结构完整的草稿无需人工勾选即可发布，检查零写且明确确认才发布", async ({ page }) => {
    const server = await installNewTemplateServer(page);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await createBlankTemplate(page);
    await fillTemplateIdentity(page, "待发布的制作向导模板", "新品工艺内容展示");
    await addContentGroupsAndSlots(page);
    await saveTemplate(page);
    await expect.poll(async () => (await readSession(page)).dirty).toBe(false);
    await expect(guide(page)).toBeHidden();
    expect((await readSession(page)).productionReviewFacts.desktop).toBe(false);
    expect(server.writes).toHaveLength(1);

    await page.getByRole("button", { name: /^发布模板/ }).click();
    const review = page.getByRole("region", { name: "本次发布检查", exact: true });
    await expect(review).toContainText("可以发布");
    await expect(review).not.toContainText("发布前需明确核对桌面端布局");
    await expect(review.getByRole("button", { name: "保存并发布模板", exact: true })).toBeEnabled();
    expect(server.writes).toHaveLength(1);
    await review.getByRole("button", { name: "保存并发布模板", exact: true }).click();
    await expect.poll(() => server.writes.filter((write) => write.path.endsWith("/publish")).length).toBe(1);
    await expect(review).toContainText(/模板 v1 已发布/);
  });

  test("八项明确核对只保存在会话，纯查看不污染草稿且定义变化会令核对失效", async ({ page }) => {
    const server = await installNewTemplateServer(page);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await createBlankTemplate(page);
    await fillTemplateIdentity(page, "会话核对事实模板", "核对事实失效验收");
    await addContentGroupsAndSlots(page);
    await saveTemplate(page);
    await expect.poll(async () => (await readSession(page)).dirty).toBe(false);
    const beforeReview = await readSession(page);

    await completeProductionReviews(page);
    const reviewed = await readSession(page);
    expect(stableAuthoringFacts(reviewed)).toEqual(stableAuthoringFacts(beforeReview));
    expect(reviewed.productionReviewFacts).toEqual({
      desktop: true,
      mobile: true,
      pageScope: true,
      stressPreview: {
        "short-text": true,
        "long-text": true,
        "optional-missing": true,
        "required-missing": true,
        "media-ratios": true,
      },
    });
    await expect(guide(page)).toBeHidden();
    expect(server.writes).toHaveLength(1);

    await (await productionStageAction(page, "交付信息")).click();
    await fillTemplateName(page, "定义已变化的会话核对事实模板");
    const changed = await readSession(page);
    expect(changed.dirty).toBe(true);
    expect(changed.productionReviewFacts).toEqual({
      desktop: false,
      mobile: false,
      pageScope: false,
      stressPreview: {
        "short-text": false,
        "long-text": false,
        "optional-missing": false,
        "required-missing": false,
        "media-ratios": false,
      },
    });
    await expect(guide(page)).toBeHidden();
    expect(server.writes).toHaveLength(1);
  });

  test("第一次发布点击只打开 review，明确确认才写入已保存的同一 revision 与 checksum", async ({ page }) => {
    const server = await installNewTemplateServer(page);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await createBlankTemplate(page);
    await fillTemplateIdentity(page, "两阶段发布制作向导模板", "新品工艺发布验收");
    await addContentGroupsAndSlots(page);
    await saveTemplate(page);
    await expect.poll(() => server.writes.length).toBe(1);
    expect(server.saveResults).toHaveLength(1);
    const initialSave = server.saveResults[0];

    await completeProductionReviews(page);
    await expect(guide(page)).toBeHidden();
    expect(server.writes).toHaveLength(1);

    await page.getByRole("button", { name: /^发布模板/ }).click();
    const review = page.getByRole("region", { name: "本次发布检查", exact: true });
    await expect(review).toBeVisible();
    await expect(review).toContainText("可以发布");
    expect(server.writes).toHaveLength(1);

    await review.getByRole("button", { name: "保存并发布模板", exact: true }).click();
    await expect.poll(() => server.writes.filter((write) => write.path.endsWith("/publish")).length)
      .toBe(1);
    await expect(review).toContainText(/模板 v1 已发布/);
    const draftSaves = server.writes.filter((write) => (
      write.path === "/api/page-modules/dynamic-templates" || write.path.endsWith("/draft")
    ));
    expect(draftSaves).toHaveLength(2);
    expect(server.saveResults).toHaveLength(2);
    const reviewedSave = server.saveResults[1];
    expect(reviewedSave.revision).toBe(initialSave.revision + 1);
    expect(reviewedSave.templateId).toBe(initialSave.templateId);
    const publish = server.writes.find((write) => write.path.endsWith("/publish"));
    expect(publish?.path).toBe(
      `/api/page-modules/dynamic-templates/${encodeURIComponent(reviewedSave.templateId)}/publish`,
    );
    expect(publish?.body).toMatchObject({
      expectedRevision: reviewedSave.revision,
      expectedChecksum: reviewedSave.checksum,
      targetVersion: 1,
    });
    expect(server.writes.filter((write) => write.path.endsWith("/publish"))).toHaveLength(1);
  });

  test("1200px 四区保持 12/8/60/20 且 96px 结构名称水平单行可读", async ({ page }) => {
    const server = await installNewTemplateServer(page);
    await page.setViewportSize({ width: 1200, height: 900 });
    await createBlankTemplate(page);
    await fillTemplateIdentity(page, "1200 窄桌面可读性回归模板", "真实 Chrome 窄桌面发布检查");
    await applyBasicSkeleton(page);

    const body = page.locator(".homepage-editor__body.template-editor__body:visible");
    await expect(body).toHaveCount(1);
    const geometry = await body.evaluate((element) => {
      const outer = element.getBoundingClientRect();
      const rect = (selector: string) => {
        const target = element.querySelector<HTMLElement>(selector);
        if (!target) throw new Error(`缺少四区节点：${selector}`);
        return target.getBoundingClientRect();
      };
      const library = rect(":scope > .homepage-editor__library");
      const structure = rect(":scope > .homepage-editor__structure-workspace");
      const canvas = rect(".homepage-editor__canvas-scroll");
      const inspector = rect(":scope > .homepage-editor__right-workspace");
      return {
        innerWidth: window.innerWidth,
        outerWidth: outer.width,
        widths: [library.width, structure.width, canvas.width, inspector.width],
      };
    });
    expect(geometry.innerWidth).toBe(1200);
    expect(geometry.widths.map((width) => Math.round(width))).toEqual([144, 96, 720, 240]);
    expect(Math.round(geometry.outerWidth)).toBe(1200);

    const expectReadableStructureNames = async () => {
      const tree = structurePanel(page).getByRole("tree", { name: "模板区域与槽位", exact: true });
      for (const name of ["双图文布局", "图片槽位 2", "文字组"]) {
        const item = tree.getByRole("treeitem", { name: new RegExp(name) }).first();
        await expect(item).toBeVisible();
        await expect(item).toHaveAttribute("aria-label", new RegExp(name));
        const text = item.locator("strong").first();
        await expect(text).toHaveAttribute("title", new RegExp(name));
        const layout = await text.evaluate((element) => {
          const range = document.createRange();
          range.selectNodeContents(element);
          const lineTops = [...range.getClientRects()].map((rect) => Math.round(rect.top));
          const style = getComputedStyle(element);
          const treeItem = element.closest<HTMLElement>('[role="treeitem"]')!;
          return {
            itemClientWidth: treeItem.clientWidth,
            itemScrollWidth: treeItem.scrollWidth,
            lineCount: new Set(lineTops).size,
            overflow: style.overflow,
            textOverflow: style.textOverflow,
            whiteSpace: style.whiteSpace,
            width: element.getBoundingClientRect().width,
            writingMode: style.writingMode,
          };
        });
        expect(layout.whiteSpace).toBe("nowrap");
        expect(layout.overflow).toBe("hidden");
        expect(layout.textOverflow).toBe("ellipsis");
        expect(layout.writingMode).toBe("horizontal-tb");
        expect(layout.lineCount).toBe(1);
        expect(layout.width).toBeGreaterThanOrEqual(32);
        expect(layout.itemScrollWidth).toBeLessThanOrEqual(layout.itemClientWidth + 1);
      }
    };
    await expectReadableStructureNames();
    const secondImage = structurePanel(page).getByRole("treeitem", { name: /图片槽位 2/ }).first();
    await secondImage.click();
    const secondImageRow = secondImage.locator("..");
    const nodeMenu = secondImageRow.getByRole("button", { name: "图片槽位 2节点操作", exact: true });
    await expect(nodeMenu).toBeVisible();
    const nonOverlappingControls = await Promise.all([
      secondImage.locator("strong").first().boundingBox(),
      nodeMenu.boundingBox(),
    ]);
    expect(nonOverlappingControls[0]).not.toBeNull();
    expect(nonOverlappingControls[1]).not.toBeNull();
    expect(nonOverlappingControls[0]!.x + nonOverlappingControls[0]!.width)
      .toBeLessThanOrEqual(nonOverlappingControls[1]!.x + 1);
    await nodeMenu.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menuitem", { name: "上移", exact: true })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "下移", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1600, height: 900 });
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(1600);
    await expectReadableStructureNames();
    for (const viewport of [
      { width: 1600, height: 900, expected: [192, 128, 960, 320] },
      { width: 1920, height: 1200, expected: [230, 154, 1152, 384] },
    ]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(viewport.width);
      const widths = await body.evaluate((element) => {
        const width = (selector: string) => {
          const target = element.querySelector<HTMLElement>(selector);
          if (!target) throw new Error(`缺少桌面四区节点：${selector}`);
          return Math.round(target.getBoundingClientRect().width);
        };
        return [
          width(":scope > .homepage-editor__library"),
          width(":scope > .homepage-editor__structure-workspace"),
          width(".homepage-editor__canvas-scroll"),
          width(":scope > .homepage-editor__right-workspace"),
        ];
      });
      expect(widths).toEqual(viewport.expected);
    }
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(1024);
    await expect(body).toHaveAttribute("data-template-workspace-compact", "true");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1025);
    expect(server.writes).toEqual([]);
  });

  for (const width of [1200, 1600, 1920]) {
    test(`${width}px 无旧制作检查，原生添加菜单和尺寸调整可用且纯查看不写草稿`, async ({ page }, testInfo) => {
      const server = await installNewTemplateServer(page);
      await page.setViewportSize({ width, height: 1000 });
      await createBlankTemplate(page);
      await applyBasicSkeleton(page);
      const before = stableAuthoringFacts(await readSession(page));
      await expect(guide(page)).toBeHidden();
      await expect(page.getByRole("button", { name: "展开制作检查", exact: true })).toHaveCount(0);
      const navigation = page.getByRole("navigation", { name: "画布编辑层级" });
      const navigationBefore = await navigation.boundingBox();
      await navigation.locator(".template-editor__canvas-add > summary").click({ trial: true });
      await navigation.locator(".template-editor__canvas-add > summary").click();
      await expect(navigation.locator(".template-editor__canvas-add")).toHaveAttribute("open", "");
      expect((await navigation.boundingBox())!.y).toBe(navigationBefore!.y);
      await navigation.locator(".template-editor__canvas-add > summary").click();
      expect(stableAuthoringFacts(await readSession(page))).toEqual(before);
      await structurePanel(page).getByRole("treeitem", { name: /内容区域 1/ }).first().click();
      const frame = page.locator("iframe[title$='模板隔离画布']");
      await expect(frame).toBeVisible();
      await waitForMeasurementCycles(page, 2);
      expect((await frame.boundingBox())!.y).toBeLessThan(350);
      const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
      const sizeHeading = inspector.getByRole("heading", { name: "尺寸与位置", exact: true });
      await expect(sizeHeading).toBeVisible();
      const sizeHeadingBox = await sizeHeading.boundingBox();
      expect(sizeHeadingBox).not.toBeNull();
      expect(sizeHeadingBox!.y + sizeHeadingBox!.height).toBeLessThanOrEqual(await page.evaluate(() => window.innerHeight));
      await page.getByRole("button", { name: "调整间距", exact: true }).click();
      for (const side of ["上", "右", "下", "左"]) {
        const handle = page.getByRole("button", { name: `拖动调整${side}内边距`, exact: true });
        await expect(handle).toBeVisible();
        await handle.click({ trial: true });
      }
      await page.mouse.move(10, 10);
      await page.screenshot({ path: testInfo.outputPath(`canvas-usability-${width}.png`), fullPage: true });
      expect(server.writes).toEqual([]);
    });
  }

  test("深层编辑中的原生添加可收起、视图浮层优先处理 Esc，并排预览往返不丢选择", async ({ page }) => {
    const server = await installNewTemplateServer(page);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await createBlankTemplate(page);
    await applyBasicSkeleton(page);
    await structurePanel(page).getByRole("treeitem", { name: /内容区域 1/ }).first().click();
    await page.getByRole("button", { name: "进入选中容器", exact: true }).click();
    const navigation = page.getByRole("navigation", { name: "画布编辑层级" });
    const scopeText = await navigation.innerText();
    const before = stableAuthoringFacts(await readSession(page));
    await expect(guide(page)).toBeHidden();
    const add = navigation.locator(".template-editor__canvas-add > summary");
    await add.click();
    await expect(navigation.locator(".template-editor__canvas-add")).toHaveAttribute("open", "");
    await add.click();
    await expect(navigation.locator(".template-editor__canvas-add")).not.toHaveAttribute("open", "");
    await expect(add).toBeFocused();
    expect(await navigation.innerText()).toBe(scopeText);
    const tools = page.getByRole("button", { name: /^视图辅助/ });
    await tools.click();
    await page.getByRole("group", { name: "画布视图辅助", exact: true }).getByRole("button", { name: "网格", exact: true }).focus();
    await page.keyboard.press("Escape");
    await expect(tools).toBeFocused();
    expect(await navigation.innerText()).toBe(scopeText);
    await tools.click();
    await page.getByRole("button", { name: "多设备并排预览", exact: true }).click();
    await expect(page.locator(".template-breakpoint-comparison__card iframe")).toHaveCount(3);
    await page.getByRole("button", { name: "预览模板", exact: true }).click();
    await expect(page.locator("iframe.template-editor__viewport-frame")).toHaveCount(1);
    await expect(page.locator(".template-breakpoint-comparison__card iframe")).toHaveCount(0);
    await page.getByRole("button", { name: "退出预览并继续编辑", exact: true }).click();
    await expect(page.locator(".template-breakpoint-comparison__card iframe")).toHaveCount(3);
    expect(stableAuthoringFacts(await readSession(page))).toEqual(before);
    expect(server.writes).toEqual([]);
  });

  for (const viewport of [
    { width: 1600, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    test(`${viewport.width}×${viewport.height} 长中文与无空格 token 不造成页面横向溢出，覆盖层关闭后焦点返回`, async ({ page }) => {
      const server = await installNewTemplateServer(page);
      await page.setViewportSize(viewport);
      if (viewport.width < 1200) {
        await openTemplateDesignWithoutDraft(page);
        const more = page.getByRole("button", { name: "更多模板操作", exact: true });
        await more.focus();
        await page.keyboard.press("Enter");
        const newTemplate = page.getByRole("menuitem", { name: /新建模板$/ });
        await newTemplate.focus();
        await page.keyboard.press("Enter");
        const wizard = page.getByRole("dialog", { name: "创建模板", exact: true });
        await expect(wizard).toBeVisible();
        expect((await readSession(page)).definition).toBeNull();
        await wizard.getByRole("button", { name: "取消", exact: true }).click();
        await createBlankTemplate(page);
        await expect(blankTemplateStart(page)).toBeVisible();
      } else {
        await createBlankTemplate(page);
      }

      const longName = "长中文模板制作流程焦点与溢出验证-UNBROKEN_TOKEN_0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      if (viewport.width < 1200) {
        const identityEntry = await fillTemplateIdentity(page, longName, "移动端长内容与焦点返回验证");
        const inspector = page.getByRole("dialog", { name: "模板属性工作区", exact: true });
        await expect(inspector).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(identityEntry).toBeFocused();
      } else {
        await fillTemplateIdentity(page, longName, "桌面端长内容与横向溢出验证");
      }

      await expect(guide(page)).toBeHidden();
      expect((await readSession(page)).definition!.name).toBe(longName);
      expect(await page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(viewport.width + 1);
      const action = firstRegionAction(page);
      await action.focus();
      await page.keyboard.press("Enter");
      await expectHealthyStableCanvas(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(viewport.width + 1);
      expect(server.writes).toEqual([]);
    });
  }
});
