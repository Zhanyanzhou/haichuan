import { expect, test, type Page } from "@playwright/test";
import { installAdminSession } from "./fixtures/session-auth";
import type { TemplateCatalogResource } from "../src/services/clients/dynamicTemplateClient";
import { createBlankTemplate, firstRegionAction, makeResource, productionStageAction } from "./fixtures/template-authoring-main-route";
import { createBlankDynamicTemplateDefinition } from "../src/page-builder/template-definition";

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))
    .toBe(true);
}

async function clickCenterWithRealMouse(
  page: Page,
  target: import("@playwright/test").Locator,
  label: string,
) {
  await expect(target, `${label} 必须可见`).toBeVisible();
  await expect(target, `${label} 必须启用`).toBeEnabled();
  await target.scrollIntoViewIfNeeded();
  const hitTarget = await target.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const owner = document.elementFromPoint(center.x, center.y);
    return {
      center,
      height: rect.height,
      ownsCenter: owner === element || element.contains(owner),
      owner: owner instanceof HTMLElement
        ? `${owner.tagName.toLowerCase()}.${owner.className}`
        : owner?.nodeName ?? null,
      width: rect.width,
    };
  });
  expect(hitTarget.width, `${label} 必须有真实宽度`).toBeGreaterThan(0);
  expect(hitTarget.height, `${label} 必须有真实高度`).toBeGreaterThan(0);
  expect(hitTarget.ownsCenter, `${label} 中心被 ${hitTarget.owner ?? "未知节点"} 覆盖`).toBe(true);
  const pageBox = await target.boundingBox();
  if (!pageBox) throw new Error(`${label} 缺少顶层视口坐标`);
  // 画布空态按钮位于 iframe，鼠标使用顶层坐标，命中核对仍在所属文档内进行。
  await page.mouse.click(pageBox.x + pageBox.width / 2, pageBox.y + pageBox.height / 2);
}

async function applyDeterministicTextScale200(page: Page, probe: import("@playwright/test").Locator) {
  const baseline = await probe.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  const result = await page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>([
      ".template-editor__toolbar button",
      ".template-editor__body button",
      ".template-editor__body input",
      ".template-editor__body select",
      ".template-editor__body textarea",
      ".template-editor__body label",
      ".template-editor__body strong",
      ".template-editor__body small",
      ".template-editor__body p",
    ].join(",")));
    elements.forEach((element) => {
      element.dataset.td3cOriginalInlineFontSize = element.style.fontSize;
      const current = Number.parseFloat(getComputedStyle(element).fontSize);
      if (Number.isFinite(current) && current > 0) element.style.fontSize = `${current * 2}px`;
    });
    document.documentElement.dataset.td3cTextScale = "200";
    return { dpr: window.devicePixelRatio, count: elements.length };
  });
  expect(result.dpr, "文字缩放证据固定 DPR=1，不能用 deviceScaleFactor 冒充").toBe(1);
  expect(result.count).toBeGreaterThan(10);
  await expect.poll(() => probe.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)))
    .toBeCloseTo(baseline * 2, 4);
}

async function removeDeterministicTextScale200(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll<HTMLElement>("[data-td3c-original-inline-font-size]").forEach((element) => {
      element.style.fontSize = element.dataset.td3cOriginalInlineFontSize ?? "";
      delete element.dataset.td3cOriginalInlineFontSize;
    });
    delete document.documentElement.dataset.td3cTextScale;
  });
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function json(data: unknown) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ code: 200, data, message: "success" }),
  };
}

function editableTemplateCatalog() {
  const definition = createBlankDynamicTemplateDefinition("响应式目录测试模板");
  definition.metadata.category = "页面内容";
  return { items: [{ kind: "editable" as const, template: makeResource(definition, 1) }] };
}

async function installTemplateDesignFixture(
  page: Page,
  dangerousWrites: string[],
  templateCatalog: TemplateCatalogResource = { items: [] },
) {
  await installAdminSession(page, {
    username: "td3c2-compact-overlay",
    realName: "紧凑覆盖层测试",
    role: "SUPER_ADMIN",
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const method = request.method();
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/auth/profile") return route.fallback();
    if (pathname === "/api/page-modules/document/validate") {
      return route.fulfill(json({ valid: true, issues: [] }));
    }
    if (!SAFE_METHODS.has(method)) {
      dangerousWrites.push(`${method} ${pathname}`);
      return route.fulfill({ status: 409, contentType: "application/json", body: "{}" });
    }
    if (pathname === "/api/page-modules/dynamic-templates/catalog") {
      return route.fulfill(json(templateCatalog));
    }
    if (pathname === "/api/page-modules/document/revisions") {
      return route.fulfill(json([]));
    }
    if (pathname === "/api/page-modules/document/published") {
      return route.fulfill(json(null));
    }
    if (pathname === "/api/page-modules/document/admin") {
      return route.fulfill(json({
        id: 9320,
        pageKey: "home",
        puckData: { content: [], zones: {}, root: { props: {} } },
        metadata: {},
        editorVersion: "0.22.4",
        status: "DRAFT",
        version: 0,
        publishedAt: null,
        publishedBy: null,
        updatedAt: "2026-09-08T00:00:00.000Z",
      }));
    }
    return route.fulfill(json({}));
  });
}

async function openDesktopTemplateWorkspace(page: Page, dangerousWrites: string[]) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await installTemplateDesignFixture(page, dangerousWrites);
  await createBlankTemplate(page);
  await expect(page.getByRole("complementary", { name: "模板属性", exact: true })).toBeVisible();
  await (await productionStageAction(page, "交付信息")).click();
}

async function readTemplateSession(page: Page) {
  return page.evaluate(async () => {
    const modulePath = "/src/page-builder/template-editor/templateEditorSession.ts";
    const { useTemplateEditorSession } = await import(/* @vite-ignore */ modulePath);
    const state = useTemplateEditorSession.getState();
    return {
      sessionId: state.sessionId,
      templateId: state.draft?.definition.templateId ?? null,
      definition: state.draft?.definition ?? null,
      selectedObjectId: state.selectedObjectId,
      selectedContractRole: state.selectedContractRole,
      dirty: state.dirty,
      historyPast: state.historyPast.length,
      historyFuture: state.historyFuture.length,
      saveStatus: state.saveStatus,
    };
  });
}

async function openCompactTemplateWorkspace(
  page: Page,
  viewport: { width: number; height: number },
  dangerousWrites: string[],
) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await installTemplateDesignFixture(page, dangerousWrites);
  await createBlankTemplate(page);
  await expect(page.locator(".template-editor__body")).toBeVisible();
  await expect(page.getByRole("region", { name: /模板(?:设计)?画布/ })).toBeVisible();
  await page.setViewportSize(viewport);
  const inspectorClose = page.getByRole("button", { name: "收起模板属性面板", exact: true });
  if (await inspectorClose.isVisible()) {
    await inspectorClose.click({ timeout: 1_000 }).catch(() => undefined);
  }
  await expect(page.getByRole("button", { name: "展开模板结构面板", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "展开模板属性面板", exact: true })).toBeVisible();
  await expect(page.locator(".template-editor__body > [inert]")).toHaveCount(0);
  await expect(page.locator(".template-editor__toolbar")).not.toHaveAttribute("inert", "");
}

async function installBlockedClickProbe(target: import("@playwright/test").Locator) {
  await target.evaluate((element) => {
    (window as typeof window & { __td3c2BackgroundClicks?: number }).__td3c2BackgroundClicks = 0;
    element.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      (window as typeof window & { __td3c2BackgroundClicks?: number }).__td3c2BackgroundClicks = 1;
    }, { capture: true, once: true });
  });
}

async function readBlockedClickProbe(page: Page) {
  return page.evaluate(() => (
    (window as typeof window & { __td3c2BackgroundClicks?: number }).__td3c2BackgroundClicks ?? 0
  ));
}

test.describe("后台紧凑导航", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/**", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ success: false, message: "响应式导航确定性测试状态" }),
      }),
    );
    await installAdminSession(page);
  });

  test("1024px 切换为可键盘关闭的抽屉导航", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto("/admin/dashboard");

    const trigger = page.locator(".admin-header__menu-btn");
    const navigation = page.getByRole("navigation", { name: "后台导航" });

    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expectNoHorizontalOverflow(page);

    await trigger.click();
    await expect(navigation).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(trigger).toHaveAccessibleName("关闭后台导航");

    await page.keyboard.press("Escape");
    await expect(navigation).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("1025px 恢复固定侧栏", async ({ page }) => {
    await page.setViewportSize({ width: 1025, height: 900 });
    await page.goto("/admin/dashboard");

    await expect(page.getByRole("button", { name: "打开后台导航" })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "后台导航" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("TD-3C2 模板设计紧凑覆盖层（Mock Chromium）", () => {
  for (const viewport of [
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ]) {
    test(`${viewport.width}x${viewport.height} 属性覆盖层圈定焦点、隔离背景并返回入口`, async ({ page }) => {
      const dangerousWrites: string[] = [];
      await openCompactTemplateWorkspace(page, viewport, dangerousWrites);
      await expectNoHorizontalOverflow(page);
      await expect(page.locator(
        ".template-editor__body > .template-editor__stage .template-editor__canvas-scroll",
      )).toHaveCount(1);

      const trigger = page.getByRole("button", { name: "展开模板属性面板", exact: true });
      const backgroundAction = page.getByRole("button", { name: "模板设计", exact: true });
      const beforeOpen = await readTemplateSession(page);
      await expect(backgroundAction).toBeVisible();
      await installBlockedClickProbe(backgroundAction);

      await trigger.focus();
      await page.keyboard.press("Enter");
      const panel = page.getByRole("dialog", { name: "模板属性工作区", exact: true });
      const close = panel.getByRole("button", { name: "收起模板属性面板", exact: true });
      await expect(panel).toBeVisible();
      await expect(panel).toHaveAttribute("aria-modal", "true");
      await expect(close).toBeFocused();
      expect(await readTemplateSession(page)).toEqual(beforeOpen);

      const backgroundIsolation = await backgroundAction.evaluate((element) => {
        const inertRoot = element.closest<HTMLElement>("[inert]");
        return {
          isolated: Boolean(inertRoot),
          inertRootClassName: inertRoot?.className ?? null,
        };
      });
      expect(backgroundIsolation).toEqual({
        isolated: true,
        inertRootClassName: expect.stringContaining("template-editor__toolbar"),
      });
      await expect(page.locator(
        ".template-editor__body > :not(.template-editor__right-workspace):not([inert])",
      )).toHaveCount(0);
      await expect(page.locator(
        ".template-editor__toolbar[aria-hidden='true'], .template-editor__body > [aria-hidden='true']",
      )).toHaveCount(0);
      await backgroundAction.focus();
      await expect(backgroundAction).not.toBeFocused();

      await page.keyboard.press("Shift+Tab");
      await expect.poll(() => panel.evaluate((element) => element.contains(document.activeElement)))
        .toBe(true);
      await page.keyboard.press("Tab");
      await expect(close).toBeFocused();

      const pointerClickBlocked = await backgroundAction.click({ timeout: 750 })
        .then(() => false, () => true);
      expect(pointerClickBlocked).toBe(true);
      expect(
        await readBlockedClickProbe(page),
        "属性覆盖层打开时，背景工作模式操作不得接收指针点击",
      ).toBe(0);
      await expect(panel).toBeVisible();
      await expect.poll(() => backgroundAction.evaluate((element) => Boolean(element.closest("[inert]"))))
        .toBe(true);
      expect(await readTemplateSession(page)).toEqual(beforeOpen);
      expect(dangerousWrites).toEqual([]);

      await close.focus();
      await page.keyboard.press("Escape");
      await expect(panel).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await expect(page.getByRole("button", { name: "收起模板属性面板", exact: true }))
        .toHaveCount(0);
      expect(dangerousWrites).toEqual([]);
      await backgroundAction.focus();
      await expect(backgroundAction).toBeFocused();
      await expect(page.locator(".template-editor__toolbar")).not.toHaveAttribute("inert", "");
      await expect(page.locator(".template-editor__body > [inert]")).toHaveCount(0);
      expect(dangerousWrites).toEqual([]);

      const structureTrigger = page.getByRole("button", { name: "展开模板结构面板", exact: true });
      await structureTrigger.focus();
      await page.keyboard.press("Enter");
      const structureDialog = page.getByRole("dialog", { name: "模板结构", exact: true });
      const structureClose = structureDialog.getByRole("button", { name: "收起模板结构面板", exact: true });
      await expect(structureDialog).toHaveAttribute("aria-modal", "true");
      await expect(structureClose).toBeFocused();
      await backgroundAction.focus();
      await expect(backgroundAction).not.toBeFocused();
      await page.keyboard.press("Escape");
      await expect(structureDialog).toHaveCount(0);
      await expect(structureTrigger).toBeFocused();
      await expect(page.locator(".template-editor__body > [inert]")).toHaveCount(0);
      if (viewport.width === 1024) {
        await structureTrigger.click();
        await expect(structureDialog).toBeVisible();
        await page.setViewportSize({ width: 1200, height: 768 });
        await expect(structureDialog).toHaveCount(0);
        await page.setViewportSize(viewport);
        await expect(structureDialog).toBeVisible();
        await structureClose.click();
        await expect(structureTrigger).toBeFocused();
      }

      await trigger.click();
      await expect(panel).toBeVisible();
      await expect(close).toBeFocused();
      await expect.poll(() => backgroundAction.evaluate((element) => Boolean(element.closest("[inert]"))))
        .toBe(true);
      expect(dangerousWrites).toEqual([]);
      if (viewport.width === 1024) {
        await page.setViewportSize({ width: 1200, height: 768 });
        await expect(panel).toHaveCount(0);
        await expect(page.locator(".template-editor__toolbar")).not.toHaveAttribute("inert", "");
        await expect(page.locator(".template-editor__body > [inert]")).toHaveCount(0);
        await page.setViewportSize(viewport);
        await expect(panel).toBeVisible();
        await expect.poll(() => backgroundAction.evaluate((element) => Boolean(element.closest("[inert]"))))
          .toBe(true);
      }
      await close.click();
      await expect(panel).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await expect(page.locator(".template-editor__toolbar")).not.toHaveAttribute("inert", "");
      await expect(page.locator(".template-editor__body > [inert]")).toHaveCount(0);
      const hiddenLegacyControl = page.locator(".homepage-editor__inspector-holder[hidden] button").first();
      const disabledLegacyControl = page.getByRole("button", { name: "重做", exact: true });
      await expect(hiddenLegacyControl).toHaveCount(1);
      await expect(hiddenLegacyControl).toBeHidden();
      await expect(disabledLegacyControl).toBeDisabled();
      await hiddenLegacyControl.evaluate((element: HTMLElement) => element.focus());
      await expect(hiddenLegacyControl).not.toBeFocused();
      await disabledLegacyControl.evaluate((element: HTMLElement) => element.focus());
      await expect(disabledLegacyControl).not.toBeFocused();
      const sequentialFocusViolations: boolean[] = [];
      await page.locator("body").focus();
      for (let index = 0; index < 80; index += 1) {
        await page.keyboard.press("Tab");
        sequentialFocusViolations.push(await page.evaluate(() => {
          const hidden = document.querySelector(".homepage-editor__inspector-holder[hidden] button");
          const redo = document.querySelector('button[aria-label="重做"]');
          return document.activeElement === hidden || document.activeElement === redo;
        }));
      }
      expect(sequentialFocusViolations).not.toContain(true);
      await expect(hiddenLegacyControl).toBeHidden();
      await expect(disabledLegacyControl).not.toBeFocused();
      await applyDeterministicTextScale200(page, structureTrigger);
      await expect(structureTrigger).toBeVisible();
      await structureTrigger.focus();
      await expect(structureTrigger).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(structureClose).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(structureTrigger).toBeFocused();
      await trigger.focus();
      await page.keyboard.press("Enter");
      await expect(close).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
      await expect(page.locator(
        ".template-editor__body > .template-editor__stage .template-editor__canvas-scroll",
      )).toHaveCount(1);
      await expectNoHorizontalOverflow(page);
      await removeDeterministicTextScale200(page);
      expect(await readTemplateSession(page)).toEqual(beforeOpen);
      expect(dangerousWrites).toEqual([]);
    });
  }

  test("既有 inert 状态在关闭、断点切换与卸载后原样恢复", async ({ page }) => {
    const dangerousWrites: string[] = [];
    await openCompactTemplateWorkspace(page, { width: 1024, height: 768 }, dangerousWrites);
    const trigger = page.getByRole("button", { name: "展开模板属性面板", exact: true });
    await page.evaluate(() => {
      const target = window as typeof window & {
        __td3c2OriginalInertNodes?: { toolbar: HTMLElement; stage: HTMLElement };
      };
      const toolbar = document.querySelector<HTMLElement>(".template-editor__toolbar");
      const stage = document.querySelector<HTMLElement>(".template-editor__stage");
      if (!toolbar || !stage) throw new Error("缺少 inert 恢复目标");
      toolbar.setAttribute("inert", "toolbar-original");
      stage.setAttribute("inert", "stage-original");
      target.__td3c2OriginalInertNodes = { toolbar, stage };
    });
    const readOriginalInert = () => page.evaluate(() => {
      const nodes = (window as typeof window & {
        __td3c2OriginalInertNodes?: { toolbar: HTMLElement; stage: HTMLElement };
      }).__td3c2OriginalInertNodes;
      if (!nodes) throw new Error("inert 恢复目标已丢失");
      return {
        toolbar: {
          connected: nodes.toolbar.isConnected,
          attribute: nodes.toolbar.getAttribute("inert"),
          property: nodes.toolbar.inert,
        },
        stage: {
          connected: nodes.stage.isConnected,
          attribute: nodes.stage.getAttribute("inert"),
          property: nodes.stage.inert,
        },
      };
    });
    const originalState = {
      toolbar: { connected: true, attribute: "toolbar-original", property: true },
      stage: { connected: true, attribute: "stage-original", property: true },
    };

    await trigger.click();
    let panel = page.getByRole("dialog", { name: "模板属性工作区", exact: true });
    await expect(panel).toBeVisible();
    await panel.getByRole("button", { name: "收起模板属性面板", exact: true }).click();
    expect(await readOriginalInert()).toEqual(originalState);

    await trigger.click();
    await expect(panel).toBeVisible();
    await page.setViewportSize({ width: 1200, height: 768 });
    await expect(panel).toHaveCount(0);
    expect(await readOriginalInert()).toEqual(originalState);
    await page.setViewportSize({ width: 1024, height: 768 });
    panel = page.getByRole("dialog", { name: "模板属性工作区", exact: true });
    await expect(panel).toBeVisible();
    await expect(page.locator(".template-editor__structure")).toHaveAttribute("inert", "");

    await page.locator(".template-editor__workspace-navigation[data-mode='page']")
      .dispatchEvent("click");
    await expect(page.locator(".template-editor__body")).toHaveCount(0);
    expect(await readOriginalInert()).toEqual({
      toolbar: { connected: false, attribute: "toolbar-original", property: true },
      stage: { connected: false, attribute: "stage-original", property: true },
    });
    expect(dangerousWrites).toEqual([]);
  });

  test("会话与模板切换关闭旧 overlay，仅新 owner 显式打开后隔离并恢复替换节点", async ({ page }) => {
    const dangerousWrites: string[] = [];
    await openCompactTemplateWorkspace(page, { width: 1024, height: 768 }, dangerousWrites);
    const trigger = page.getByRole("button", { name: "展开模板属性面板", exact: true });
    await trigger.click();
    let panel = page.getByRole("dialog", { name: "模板属性工作区", exact: true });
    await expect(panel).toBeVisible();
    const before = await readTemplateSession(page);

    await page.evaluate(async () => {
      const { useTemplateEditorSession } = await import(
        /* @vite-ignore */ "/src/page-builder/template-editor/templateEditorSession.ts"
      );
      const state = useTemplateEditorSession.getState();
      const nextDraft = structuredClone(state.draft!);
      nextDraft.localDraftId = "td3c2-owner-next";
      nextDraft.definition.templateId = "dt_td3c2_owner_next";
      state.open(nextDraft, { isNew: true });
    });
    await expect(panel).toHaveCount(0);
    await expect(page.locator(".template-editor__toolbar")).not.toHaveAttribute("inert", "");
    const nextOwnerTrigger = page.getByRole("button", { name: "展开模板属性面板", exact: true });
    await nextOwnerTrigger.click();
    panel = page.getByRole("dialog", { name: "模板属性工作区", exact: true });
    await expect(panel).toBeVisible();
    await expect(page.locator("#admin-editor-toolbar-slot")).not.toHaveAttribute("inert", "");
    await expect(page.locator(".template-editor__toolbar")).toHaveAttribute("inert", "");
    await expect(page.locator(".template-editor__structure")).toHaveAttribute("inert", "");
    await page.evaluate(() => {
      const body = document.querySelector<HTMLElement>(".template-editor__body");
      const panelElement = body?.querySelector<HTMLElement>(".template-editor__right-workspace");
      if (!body || !panelElement) throw new Error("缺少 owner 节点替换宿主");
      const first = document.createElement("button");
      first.type = "button";
      first.dataset.td3c2OwnerProbe = "old";
      body.insertBefore(first, panelElement);
    });
    await expect(page.locator("[data-td3c2-owner-probe='old']")).toHaveAttribute("inert", "");
    await page.evaluate(() => {
      const oldProbe = document.querySelector<HTMLElement>("[data-td3c2-owner-probe='old']");
      if (!oldProbe) throw new Error("缺少待替换 owner probe");
      const next = document.createElement("button");
      next.type = "button";
      next.dataset.td3c2OwnerProbe = "new";
      oldProbe.replaceWith(next);
    });
    const newProbe = page.locator("[data-td3c2-owner-probe='new']");
    await expect(newProbe).toHaveAttribute("inert", "");

    await panel.getByRole("button", { name: "收起模板属性面板", exact: true }).click();
    await expect(panel).toHaveCount(0);
    await expect(newProbe).not.toHaveAttribute("inert", "");
    await expect(page.locator(".template-editor__toolbar")).not.toHaveAttribute("inert", "");
    await page.setViewportSize({ width: 1600, height: 1000 });
    const desktopPrimary = page.getByRole("button", { name: "保存模板", exact: true });
    await applyDeterministicTextScale200(page, desktopPrimary);
    await expect(desktopPrimary).toBeVisible();
    await desktopPrimary.focus();
    await expect(desktopPrimary).toBeFocused();
    await expect(page.getByRole("complementary", { name: "模板结构", exact: true })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "模板属性", exact: true })).toBeVisible();
    await expect(page.locator(
      ".template-editor__body > .template-editor__stage .template-editor__canvas-scroll",
    )).toHaveCount(1);
    await expectNoHorizontalOverflow(page);
    await removeDeterministicTextScale200(page);
    await page.getByRole("complementary", { name: "模板结构", exact: true })
      .getByRole("button", { name: "添加区域", exact: true })
      .click();
    const nodeName = page.getByRole("complementary", { name: "模板属性", exact: true })
      .getByRole("textbox", { name: "节点名称", exact: true });
    const longNames = [
      "海川珠宝极长中文结构名称用于验证多行换行不会遮挡任何主要操作入口",
      "Haichuan jewelry editorial template name with spaced words",
      "UNBROKENJEWELRYTEMPLATETOKEN1234567890ABCDEFGHIJ",
      "海川JEWELRY视觉Narrative模板MixedCJKEnglish结构名称",
    ];
    for (const name of longNames) {
      const beforeNameEdit = await readTemplateSession(page);
      await nodeName.fill(name);
      const beforeNameCommit = await readTemplateSession(page);
      expect(beforeNameCommit.definition, "fill 期间结构定义不得逐字写入").toEqual(beforeNameEdit.definition);
      expect(beforeNameCommit.historyPast, "fill 期间不得产生 history").toBe(beforeNameEdit.historyPast);
      expect(beforeNameCommit.historyFuture).toBe(beforeNameEdit.historyFuture);
      const visibleName = page.locator(".template-editor__region-select strong", { hasText: name }).first();
      await expect(visibleName, "事务输入提交前结构树不得提前更新").toHaveCount(0);
      await nodeName.press("Tab");
      const afterNameCommit = await readTemplateSession(page);
      expect(afterNameCommit.historyPast, "一次合法失焦提交只能产生一条 history")
        .toBe(beforeNameEdit.historyPast + 1);
      expect(afterNameCommit.historyFuture).toBe(0);
      expect(afterNameCommit.definition?.nodes[afterNameCommit.selectedObjectId!]?.name).toBe(name);
      await expect(visibleName).toBeVisible();
      const wrapEvidence = await visibleName.evaluate((element) => {
        const row = element.closest<HTMLElement>(".template-editor__region-select");
        return {
          overflowWrap: getComputedStyle(element).overflowWrap,
          contained: Boolean(row && row.scrollWidth <= row.clientWidth + 1),
        };
      });
      expect(wrapEvidence.overflowWrap).toBe("anywhere");
      expect(wrapEvidence.contained).toBe(true);
      await expectNoHorizontalOverflow(page);
      const saveCenterOwner = await desktopPrimary.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const owner = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return owner === element || element.contains(owner);
      });
      expect(saveCenterOwner, `长名称“${name}”不得遮挡保存主操作`).toBe(true);
      const preview = page.getByRole("button", { name: "预览模板", exact: true });
      await preview.focus();
      await page.keyboard.press("Tab");
      await expect(desktopPrimary).toBeFocused();
    }
    const after = await readTemplateSession(page);
    expect(after.sessionId).not.toBe(before.sessionId);
    expect(after.templateId).toBe("dt_td3c2_owner_next");
    expect(dangerousWrites).toEqual([]);
  });

  test("1056×858 与 1200×858 的添加区域、撤销和属性入口均由真实鼠标命中", async ({ page }) => {
    const dangerousWrites: string[] = [];
    const runtimeErrors: string[] = [];
    page.on("pageerror", (error) => runtimeErrors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") runtimeErrors.push(`console: ${message.text()}`);
    });

    await openDesktopTemplateWorkspace(page, dangerousWrites);
    await page.getByLabel("模板名称", { exact: true }).fill("紧凑窗口命中回归模板");
    await (await productionStageAction(page, "交付信息")).click();
    await page.getByLabel("用途", { exact: true }).fill("验证真实鼠标命中");
    await page.getByLabel("用途", { exact: true }).press("Tab");

    await page.setViewportSize({ width: 1056, height: 858 });
    const structureTrigger = page.getByRole("button", { name: "展开模板结构面板", exact: true });
    await clickCenterWithRealMouse(page, structureTrigger, "1056 结构入口");
    await expect(page.locator(".template-editor__structure:not(.is-collapsed)")).toBeVisible();

    const inspectorTrigger = page.getByRole("button", { name: "展开模板属性面板", exact: true });
    await clickCenterWithRealMouse(page, inspectorTrigger, "1056 属性入口");
    const inspectorWorkspace = page.locator(
      '.template-editor__right-workspace[data-compact-overlay-open="true"]',
    );
    await expect(inspectorWorkspace).toBeVisible();
    await expect(inspectorWorkspace).not.toHaveAttribute("aria-modal", "true");
    await expect(page.locator(".template-editor__structure.is-collapsed")).toBeVisible();
    await expect(page.locator(".template-editor__toolbar")).not.toHaveAttribute("inert", "");
    await expect(page.locator(".template-editor__stage")).not.toHaveAttribute("inert", "");
    expect(
      (await page.locator(".template-editor__stage").boundingBox())?.width ?? 0,
      "1056 属性 dock 打开后仍须保留至少 600px 可用画布",
    ).toBeGreaterThanOrEqual(600);

    const compactSkeleton = firstRegionAction(page);
    const compactGeometry = await Promise.all([
      compactSkeleton.boundingBox(),
      inspectorWorkspace.boundingBox(),
    ]);
    expect(compactGeometry[0]?.x).toBeDefined();
    expect(compactGeometry[1]?.x).toBeDefined();
    expect(
      (compactGeometry[0]?.x ?? 0) + (compactGeometry[0]?.width ?? 0),
      "1056 主操作不能伸入属性 dock",
    ).toBeLessThanOrEqual((compactGeometry[1]?.x ?? 0) + 1);
    await clickCenterWithRealMouse(page, compactSkeleton, "1056 添加区域操作");
    await expect(compactSkeleton).toBeHidden();

    const compactUndo = page.getByRole("button", { name: "撤销", exact: true });
    await clickCenterWithRealMouse(page, compactUndo, "1056 顶部撤销");
    await expect(compactSkeleton).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.setViewportSize({ width: 1200, height: 858 });
    await (await productionStageAction(page, "交付信息")).click();
    const desktopPropertyField = page.getByRole("complementary", { name: "模板属性", exact: true })
      .getByRole("textbox", { name: "模板名称", exact: true });
    await clickCenterWithRealMouse(page, desktopPropertyField, "1200 属性区入口");
    await expect(desktopPropertyField).toBeFocused();
    await clickCenterWithRealMouse(page, compactSkeleton, "1200 添加区域操作");
    await expect(compactSkeleton).toBeHidden();
    await clickCenterWithRealMouse(page, page.getByRole("button", { name: "撤销", exact: true }), "1200 顶部撤销");
    await expect(compactSkeleton).toBeVisible();
    await expectNoHorizontalOverflow(page);

    expect(runtimeErrors).toEqual([]);
    expect(dangerousWrites).toEqual([]);
  });
});

test.describe("TD-3C3 模板设计四区高频操作（Mock Chromium）", () => {
  test("flex 容器编辑真实子项宽度，按钮槽位直接编辑既有外观规则", async ({ page }) => {
    const dangerousWrites: string[] = [];
    await openDesktopTemplateWorkspace(page, dangerousWrites);
    const ids = await page.evaluate(async () => {
      const api = await import(/* @vite-ignore */ "/src/page-builder/template-definition/index.ts");
      const { useTemplateEditorSession } = await import(
        /* @vite-ignore */ "/src/page-builder/template-editor/templateEditorSession.ts"
      );
      const state = useTemplateEditorSession.getState();
      let definition = state.draft!.definition;
      const region = api.addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
      definition = region.definition;
      const image = api.addDynamicTemplateNode(definition, region.nodeId, "ImageSlot");
      definition = image.definition;
      const button = api.addDynamicTemplateNode(definition, region.nodeId, "ButtonSlot");
      definition = button.definition;
      definition.nodes[region.nodeId].name = "双栏内容";
      definition.nodes[image.nodeId].name = "主图片";
      definition.nodes[button.nodeId].name = "行动按钮";
      definition.nodes[region.nodeId].responsive.desktop.display = "flex";
      definition.nodes[region.nodeId].responsive.desktop.direction = "row";
      state.setDynamicDefinition(definition);
      state.selectObject(region.nodeId);
      return { regionId: region.nodeId, imageId: image.nodeId, buttonId: button.nodeId };
    });

    const renderer = page.frameLocator("iframe.template-editor__viewport-frame");
    const imageNode = renderer.locator(`[data-template-node-id="${ids.imageId}"]`);
    const buttonNode = renderer.locator(`[data-template-node-id="${ids.buttonId}"]`);
    await expect(imageNode).toBeVisible();
    await expect(buttonNode).toBeVisible();
    const baselineImageBox = await imageNode.boundingBox();
    const baselineButtonBox = await buttonNode.boundingBox();
    expect(baselineImageBox).not.toBeNull();
    expect(baselineButtonBox).not.toBeNull();

    const inspector = page.getByRole("complementary", { name: "模板属性", exact: true });
    await expect(inspector.getByText("列宽比例", { exact: true })).toHaveCount(0);
    await page.evaluate(async (imageId) => {
      const { useTemplateEditorSession } = await import(
        /* @vite-ignore */ "/src/page-builder/template-editor/templateEditorSession.ts"
      );
      useTemplateEditorSession.getState().selectObject(imageId);
    }, ids.imageId);
    const imageWidthMode = inspector.getByRole("combobox", { name: "宽度方式", exact: true });
    await imageWidthMode.selectOption("fixed");
    const imageWidth = inspector.getByRole("spinbutton", { name: "宽度", exact: true });
    await imageWidth.fill("60");
    await inspector.getByRole("combobox", { name: "宽度单位", exact: true }).selectOption("%");
    await page.evaluate(async (buttonId) => {
      const { useTemplateEditorSession } = await import(
        /* @vite-ignore */ "/src/page-builder/template-editor/templateEditorSession.ts"
      );
      useTemplateEditorSession.getState().selectObject(buttonId);
    }, ids.buttonId);
    const buttonWidthMode = inspector.getByRole("combobox", { name: "宽度方式", exact: true });
    await buttonWidthMode.selectOption("fixed");
    const buttonWidth = inspector.getByRole("spinbutton", { name: "宽度", exact: true });
    await buttonWidth.fill("40");
    await inspector.getByRole("combobox", { name: "宽度单位", exact: true }).selectOption("%");
    expect(await page.evaluate(async (imageId) => {
      const { useTemplateEditorSession } = await import(
        /* @vite-ignore */ "/src/page-builder/template-editor/templateEditorSession.ts"
      );
      return useTemplateEditorSession.getState().draft!.definition.nodes[imageId].responsive.desktop.width;
    }, ids.imageId)).toEqual({ value: 60, unit: "%" });
    const proportionalImageBox = await imageNode.boundingBox();
    const proportionalButtonBox = await buttonNode.boundingBox();
    expect(proportionalImageBox).not.toBeNull();
    expect(proportionalButtonBox).not.toBeNull();
    expect(proportionalImageBox!.width).toBeGreaterThan(baselineImageBox!.width + 1);
    expect(proportionalButtonBox!.width).toBeLessThan(baselineButtonBox!.width - 1);
    expect(proportionalImageBox!.width / (proportionalImageBox!.width + proportionalButtonBox!.width))
      .toBeCloseTo(0.6, 2);
    expect(await imageNode.evaluate((element) => (element as HTMLElement).style.width)).toBe("60%");
    expect(await buttonNode.evaluate((element) => (element as HTMLElement).style.width)).toBe("40%");

    const appearance = inspector.locator('details[data-template-property-group="外观"]');
    await appearance.locator("summary").first().click();
    await appearance.getByRole("combobox", { name: "背景预设", exact: true }).selectOption("brand-ink");
    await appearance.getByRole("combobox", { name: "边框预设", exact: true }).selectOption("strong");
    const radius = appearance.getByRole("spinbutton", { name: "圆角", exact: true });
    await radius.fill("12");
    await radius.press("Enter");
    const spacing = inspector.locator('details[data-template-property-group="间距与对齐"]');
    await spacing.locator("summary").first().click();
    await spacing.getByRole("checkbox", { name: "四边内边距联动", exact: true }).check();
    const padding = spacing.getByRole("spinbutton", { name: "上内边距", exact: true });
    await padding.fill("16");
    await padding.press("Enter");
    expect(await page.evaluate(async (buttonId) => {
      const { useTemplateEditorSession } = await import(
        /* @vite-ignore */ "/src/page-builder/template-editor/templateEditorSession.ts"
      );
      const rules = useTemplateEditorSession.getState().draft!.definition.nodes[buttonId].responsive.desktop;
      return {
        backgroundToken: rules.backgroundToken,
        borderToken: rules.borderToken,
        radius: rules.radius,
        padding: rules.padding,
      };
    }, ids.buttonId)).toEqual({
      backgroundToken: "brand-ink",
      borderToken: "strong",
      radius: { value: 12, unit: "px" },
      padding: {
        top: { value: 16, unit: "px" },
        right: { value: 16, unit: "px" },
        bottom: { value: 16, unit: "px" },
        left: { value: 16, unit: "px" },
      },
    });
    await expect(buttonNode).toHaveCSS("background-color", "rgb(24, 26, 27)");
    await expect(buttonNode).toHaveCSS("border-top-width", "1px");
    await expect(buttonNode).toHaveCSS("border-top-style", "solid");
    await expect(buttonNode).toHaveCSS("border-top-color", "rgb(110, 116, 119)");
    await expect(buttonNode).toHaveCSS("border-radius", "12px");
    await expect(buttonNode).toHaveCSS("padding", "16px");

    const desktopBeforeMobile = await page.evaluate(async ({ imageId, buttonId }) => {
      const { useTemplateEditorSession } = await import(
        /* @vite-ignore */ "/src/page-builder/template-editor/templateEditorSession.ts"
      );
      const definition = useTemplateEditorSession.getState().draft!.definition;
      return {
        image: structuredClone(definition.nodes[imageId].responsive.desktop),
        button: structuredClone(definition.nodes[buttonId].responsive.desktop),
      };
    }, ids);
    const desktopImageBoxBeforeMobile = await imageNode.boundingBox();
    const desktopButtonBoxBeforeMobile = await buttonNode.boundingBox();
    expect(desktopImageBoxBeforeMobile).not.toBeNull();
    expect(desktopButtonBoxBeforeMobile).not.toBeNull();

    await page.locator(".template-editor__toolbar")
      .getByRole("button", { name: /移动端模板布局/ })
      .click();
    const mobileWidth = inspector.getByRole("spinbutton", { name: "宽度", exact: true });
    await mobileWidth.fill("80");
    await mobileWidth.press("Enter");
    await appearance.getByRole("combobox", { name: "背景预设", exact: true }).selectOption("surface-muted");
    expect(await buttonNode.evaluate((element) => (element as HTMLElement).style.width)).toBe("80%");
    await expect(buttonNode).toHaveCSS("background-color", "rgb(244, 245, 245)");

    await page.locator(".template-editor__toolbar")
      .getByRole("button", { name: /桌面端模板布局/ })
      .click();
    expect(await page.evaluate(async ({ imageId, buttonId }) => {
      const { useTemplateEditorSession } = await import(
        /* @vite-ignore */ "/src/page-builder/template-editor/templateEditorSession.ts"
      );
      const definition = useTemplateEditorSession.getState().draft!.definition;
      return {
        image: structuredClone(definition.nodes[imageId].responsive.desktop),
        button: structuredClone(definition.nodes[buttonId].responsive.desktop),
      };
    }, ids)).toEqual(desktopBeforeMobile);
    const desktopImageBoxAfterMobile = await imageNode.boundingBox();
    const desktopButtonBoxAfterMobile = await buttonNode.boundingBox();
    expect(desktopImageBoxAfterMobile).not.toBeNull();
    expect(desktopButtonBoxAfterMobile).not.toBeNull();
    expect(Math.abs(desktopImageBoxAfterMobile!.width - desktopImageBoxBeforeMobile!.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(desktopButtonBoxAfterMobile!.width - desktopButtonBoxBeforeMobile!.width)).toBeLessThanOrEqual(1);
    await expect(buttonNode).toHaveCSS("background-color", "rgb(24, 26, 27)");
    await expect(buttonNode).toHaveCSS("border-top-color", "rgb(110, 116, 119)");
    await expect(buttonNode).toHaveCSS("border-radius", "12px");
    await expect(buttonNode).toHaveCSS("padding", "16px");
    expect(dangerousWrites).toEqual([]);
  });

  test("1200px 窄模板库卡片改为上图下文并保留操作命中区", async ({ page }) => {
    const dangerousWrites: string[] = [];
    await page.setViewportSize({ width: 1200, height: 768 });
    await installTemplateDesignFixture(page, dangerousWrites, editableTemplateCatalog());
    await page.goto("/admin/editor/home");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "模板设计", exact: true }).click();
    const expandLibrary = page.getByRole("button", { name: "展开模板组件库", exact: true });
    await expect(expandLibrary).toBeVisible();
    await expandLibrary.click();
    const library = page.locator('[data-unified-template-library="design"]');
    const card = library.locator(".homepage-editor__template-card").first();
    const cardMain = card.locator(".homepage-editor__template-card-main");
    const name = card.locator(".homepage-editor__template-name");
    const more = card.locator(".template-editor__template-more");
    await expect(card).toBeVisible();
    expect(await cardMain.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length))
      .toBe(1);
    expect(await name.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThanOrEqual(80);
    const moreHitTarget = await more.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const owner = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return { width: rect.width, height: rect.height, ownsCenter: owner === element || element.contains(owner) };
    });
    expect(moreHitTarget.width).toBeGreaterThanOrEqual(32);
    expect(moreHitTarget.height).toBeGreaterThanOrEqual(32);
    expect(moreHitTarget.ownsCenter).toBe(true);
    expect(dangerousWrites).toEqual([]);
  });

  test("页面目录只展示生命周期，不展示模板来源等级", async ({ page }) => {
    const dangerousWrites: string[] = [];
    await page.setViewportSize({ width: 1600, height: 1000 });
    await installTemplateDesignFixture(
      page,
      dangerousWrites,
      editableTemplateCatalog(),
    );
    await page.goto("/admin/editor/home");
    await expect(page.locator(".homepage-editor__toolbar")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "模板设计", exact: true }).click();
    const library = page.locator('[data-unified-template-library="design"]');
    const firstCard = library.locator(".homepage-editor__template-card").first();
    await expect(firstCard).toBeVisible();
    await expect(firstCard.locator('[data-template-publication-status="draft"]')).toBeVisible();
    await expect(firstCard).toContainText("尚未发布");
    await expect(library).not.toContainText(/内置模板|系统模板|动态模板|个人模板|自定义模板/);
    await expect(library.locator('[aria-label*="动态模板"], [title*="动态模板"]')).toHaveCount(0);
    const templateList = library.getByRole("region", { name: "模板列表", exact: true });
    await expect(templateList.getByRole("group", { name: /模板$/ }).first()).toBeVisible();
    await expect(library.locator("section[aria-label] section[aria-label]")).toHaveCount(0);
    expect(dangerousWrites).toEqual([]);
  });
});
