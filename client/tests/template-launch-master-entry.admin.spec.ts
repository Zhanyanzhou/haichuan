import { expect, test } from "@playwright/test";

import {
  installNewTemplateServer,
  openTemplateDesignWithoutDraft,
  readSession,
} from "./fixtures/template-authoring-main-route";

for (const width of [1600, 960, 390]) {
  test(`模板设计保留目录，${width}px 不再提供首发母版起步（自有 API Mock）`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const server = await installNewTemplateServer(page);
    await openTemplateDesignWithoutDraft(page);

    if (width <= 1024) {
      await page.getByRole("button", { name: "展开模板组件库", exact: true }).press("Enter");
      await expect(page.getByRole("dialog", { name: "模板设计模板目录", exact: true })).toBeVisible();
    } else {
      await expect(page.getByRole("complementary", { name: "模板组件库", exact: true })).toBeVisible();
    }
    await expect(page.getByRole("button", { name: "从首发母版开始", exact: true, includeHidden: true })).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: "选择首发母版", exact: true, includeHidden: true })).toHaveCount(0);
    expect((await readSession(page)).definition).toBeNull();
    expect(server.writes).toEqual([]);
  });
}
