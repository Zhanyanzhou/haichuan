import { expect, test, type Page } from "@playwright/test";
import { installNewTemplateServer, openTemplateDesignWithoutDraft, readSession } from "./fixtures/template-authoring-main-route";

async function openImageDefaults(page: Page, width: number) {
  const server = await installNewTemplateServer(page);
  await page.setViewportSize({ width, height: width < 600 ? 844 : 1050 });
  await openTemplateDesignWithoutDraft(page);
  const target = await page.evaluate(async () => {
    const presetsPath = "/src/page-builder/template-creation/presets.ts";
    const generatorPath = "/src/page-builder/template-creation/generateTemplateFromRecipe.ts";
    const repositoryPath = "/src/page-builder/template-editor/dynamicTemplateDraftRepository.ts";
    const sessionPath = "/src/page-builder/template-editor/templateEditorSession.ts";
    const [{ createRecommendedRecipe }, { generateTemplateFromRecipe }, { createNewDynamicTemplateDraft }, { useTemplateEditorSession }] = await Promise.all([
      import(/* @vite-ignore */ presetsPath), import(/* @vite-ignore */ generatorPath),
      import(/* @vite-ignore */ repositoryPath), import(/* @vite-ignore */ sessionPath),
    ]);
    const draft = createNewDynamicTemplateDraft("默认图片属性布局");
    draft.definition = generateTemplateFromRecipe(createRecommendedRecipe(), {
      templateId: draft.definition.templateId, name: "默认图片属性布局",
    });
    const image = (Object.values(draft.definition.nodes) as Array<{ nodeId: string; slotId?: string }>).find(
      (node) => node.slotId && draft.definition.slots[node.slotId].type === "image",
    )!;
    useTemplateEditorSession.getState().open(draft, { isNew: true });
    useTemplateEditorSession.getState().selectObject(image.nodeId);
    return { nodeId: image.nodeId, slotId: image.slotId! };
  });
  await expect(page.locator(`[data-template-default-content="${target.slotId}"]`)).toBeAttached();
  await page.evaluate((detail) => window.dispatchEvent(new CustomEvent("template-editor:open-default-content", { detail })), target);
  await expect(page.getByRole("region", { name: "模板默认内容", exact: true })).toBeVisible();
  return server;
}

for (const width of [1600, 390]) {
  test(`模板工具栏在 ${width}px 三设备切换不遮挡主要操作`, async ({ page }, testInfo) => {
    const server = await openImageDefaults(page, width);
    const before = (await readSession(page)).definition;
    if (width < 600) await page.keyboard.press("Escape");
    const toolbar = page.locator(".template-editor__toolbar");
    const switcher = toolbar.locator('[aria-label="模板响应式断点"]');
    const preview = toolbar.getByRole("button", { name: "预览模板", exact: true });
    const save = toolbar.getByRole("button", { name: "保存模板", exact: true });
    await expect(switcher).toBeVisible();
    for (const [breakpoint, label] of [["tablet", "平板端"], ["mobile", "移动端"], ["desktop", "桌面端"]] as const) {
      const button = switcher.getByRole("button", { name: new RegExp(`^${label}模板布局`) });
      await button.click();
      await expect(button).toHaveAttribute("aria-pressed", "true");
      await expect.poll(() => page.evaluate(async () => {
        const path = "/src/page-builder/template-editor/templateEditorSession.ts";
        return (await import(/* @vite-ignore */ path)).useTemplateEditorSession.getState().breakpoint;
      })).toBe(breakpoint);
      const deviceBox = (await button.boundingBox())!;
      expect(deviceBox.width).toBeGreaterThanOrEqual(28);
      for (const action of [toolbar.getByRole("button", { name: "撤销", exact: true }), preview, save]) {
        await expect(action).toBeVisible();
        const box = (await action.boundingBox())!;
        expect(deviceBox.x + deviceBox.width).toBeLessThanOrEqual(box.x);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
      }
    }
    if (width < 600) {
      await page.getByRole("button", { name: "适应画布", exact: true }).click();
      await expect.poll(() => page.locator('iframe.template-editor__viewport-frame').evaluate((frame) => {
        const rect = frame.getBoundingClientRect();
        let left = 0, right = innerWidth;
        for (let parent = frame.parentElement; parent; parent = parent.parentElement) {
          const style = getComputedStyle(parent);
          if (["hidden", "auto", "scroll", "clip"].includes(style.overflowX)) {
            const box = parent.getBoundingClientRect();
            left = Math.max(left, box.left); right = Math.min(right, box.right);
          }
        }
        return Math.max(left - rect.left, rect.right - right, 0);
      }), { message: "适应画布后完整画幅不能被横向裁切" }).toBeLessThanOrEqual(1);
    }
    await page.screenshot({ path: testInfo.outputPath(`template-toolbar-${width}.png`) });
    expect((await readSession(page)).definition).toEqual(before);
    expect(server.writes).toEqual([]);
  });

  test(`默认图片属性在 ${width}px 保持媒体流与标准开关尺寸`, async ({ page }, testInfo) => {
    const server = await openImageDefaults(page, width);
    const before = (await readSession(page)).definition;
    const section = page.getByRole("region", { name: "模板默认内容", exact: true });
    const link = section.getByRole("button", { name: "或粘贴图片链接", exact: true });
    await link.scrollIntoViewIfNeeded();
    const metrics = await section.evaluate((element) => {
      const media = element.querySelector(".homepage-editor__media-picker")!;
      const link = Array.from(media.querySelectorAll("button")).find((button) => button.textContent === "或粘贴图片链接")!;
      const label = Array.from(element.querySelectorAll("label")).find((item) => item.textContent?.startsWith("默认图片说明"))!;
      const rect = (item: Element) => { const box = item.getBoundingClientRect(); return { top: box.top, bottom: box.bottom, height: box.height, width: box.width }; };
      return { media: rect(media), link: rect(link), label: rect(label),
        upload: Array.from(media.querySelectorAll('[class*="upload"]')).map((item) => ({ className: item.className, ...rect(item), heightStyle: getComputedStyle(item).height, display: getComputedStyle(item).display })),
      };
    });
    await testInfo.attach("default-content-layout-metrics", { body: JSON.stringify(metrics, null, 2), contentType: "application/json" });
    await page.screenshot({ path: testInfo.outputPath(`default-content-${width}.png`) });
    expect.soft(metrics.link.bottom, "图片链接必须排在下一个字段标签之前").toBeLessThanOrEqual(metrics.label.top);
    expect.soft(metrics.link.bottom, "媒体容器应包住链接而不是溢出覆盖后续字段").toBeLessThanOrEqual(metrics.media.bottom);
    await link.click();
    await expect(section.getByPlaceholder("输入图片 URL；清空后确认 = 删除图片")).toBeVisible();
    const cancel = section.getByRole("button", { name: /^取\s*消$/ });
    const cancelBox = await cancel.boundingBox();
    const nextLabelBox = await section.locator("label").filter({ hasText: /^默认图片说明/ }).boundingBox();
    expect(cancelBox!.y + cancelBox!.height).toBeLessThanOrEqual(nextLabelBox!.y);
    await cancel.click();
    await expect(link).toBeVisible();
    await expect(section.getByRole("switch")).toHaveCount(0);
    await section.getByRole("button", { name: "设置页面开放范围", exact: true }).click();
    const pageScope = page.getByRole("tabpanel", { name: "页面开放范围", exact: true });
    const toggle = pageScope.getByRole("switch", { name: "页面可填写内容", exact: true });
    await expect(toggle).toBeFocused();
    const toggleBox = await toggle.boundingBox();
    // 同一权限控件移入页面开放范围后仍保持项目 small Switch 尺寸。
    expect(toggleBox!.height).toBe(18);
    expect(toggleBox!.width).toBeGreaterThan(toggleBox!.height);
    await expect(pageScope.getByRole("switch", { name: "可调整画面焦点", exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`page-scope-jump-${width}.png`) });
    expect((await readSession(page)).definition).toEqual(before);
    expect(server.writes).toEqual([]);
  });
}
