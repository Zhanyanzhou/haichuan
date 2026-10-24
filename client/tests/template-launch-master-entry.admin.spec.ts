import { expect, test, type Page } from "@playwright/test";

import { LAUNCH_TEMPLATE_MASTER_ENTRIES } from "../src/page-builder/template-creation/launchTemplateSet";
import type { TemplateDefinitionV2 } from "../src/page-builder/template-definition";
import {
  installNewTemplateServer,
  openTemplateDesignWithoutDraft,
  readSession,
  structurePanel,
} from "./fixtures/template-authoring-main-route";

// 首发七母版的**创建入口**验收（docs/page-builder/launch-template-set.md 第 5 节的第一步：
// "模板设计者的交付动作：七步创建或直接改机器合同 → 四区精调 → 保存模板草稿 → 独立发布模板版本"）。
//
// 与 launch-template-set.contract.spec.ts 的分工：那边锁七份定义的**结构骨架**（合同面，且只校验
// 文档副本），这边锁这些定义**能不能真的进编辑器**（入口面，跑实现源码）。两边都绿才谈得上
// "七块母版可以起步"；按文档 §7.3，这仍不等于七块母版已经通过逐块上线验收。
//
// 覆盖范围到"进入设计器"为止：不保存、不发布，因此服务端写入必须始终为空。
type MasterEntry = (typeof LAUNCH_TEMPLATE_MASTER_ENTRIES)[number];

const picker = (page: Page) => page.getByRole("dialog", { name: "选择首发母版", exact: true });
const masterEntry = (page: Page) => page.getByRole("button", { name: "从首发母版开始", exact: true });
const masterCard = (page: Page, name: string) => page.getByRole("button", { name: `母版 ${name}`, exact: true });
const beginButton = (page: Page) => picker(page).getByRole("button", { name: "用这块母版开始", exact: true });
const cancelButton = (page: Page) => picker(page).getByRole("button", { name: "取消", exact: true });
// 未保存确认框由 workspace 的 requestDirtySessionAction 渲染，标题随入口变化，按按钮文字定位更稳。
const discardButton = (page: Page) => page.getByRole("button", { name: "放弃修改并新建", exact: true });
const keepEditingButton = (page: Page) => page.getByRole("button", { name: "继续编辑", exact: true });

/**
 * 把定义里出现的 templateId 全部换成占位符，用来比较"只差标识"的两份定义。
 * 母版与派生实例的节点、槽位 id 都以 templateId 为前缀（`<templateId>_node_<id>`），换掉这层
 * 前缀之后两者必须逐字节相同——这就是"起步只换标识、不动结构"的判据。
 */
function normalizeIdentities(definition: TemplateDefinitionV2) {
  return JSON.stringify(definition).split(definition.templateId).join("<templateId>");
}

/** 紧凑宽度下模板目录是覆盖面板：默认收起，要点轨道按钮展开才能看到页脚入口。 */
const libraryRail = (page: Page) => page.getByRole("button", { name: "展开模板组件库", exact: true });
const compactLibrary = (page: Page) => page.getByRole("dialog", { name: "模板设计模板目录", exact: true });

async function openCompactLibrary(page: Page) {
  await libraryRail(page).click();
  await expect(compactLibrary(page)).toBeVisible();
}

/** 从面板里选一块母版并确认开始；遇到未保存确认框时按调用方要求处理。 */
async function startFromMaster(page: Page, entry: MasterEntry, onDirty: "expect" | "skip") {
  await masterEntry(page).click();
  await masterCard(page, entry.name).click();
  await beginButton(page).click();
  if (onDirty === "expect") {
    // 已有未保存草稿：换定义必须先过确认框，否则就是静默丢弃用户正在编辑的东西。
    await expect(discardButton(page)).toBeVisible();
    await discardButton(page).click();
  }
  await expect(picker(page)).toBeHidden();
  // 画布必须真的换过去：空态舞台只随 draft 的有无渲染，它消失即工作区认下了这份草稿。
  await expect(page.getByRole("region", { name: "空模板画布", exact: true })).toBeHidden();
}

test.describe("首发母版创建入口", () => {
  test("模板库底部能打开母版面板；取消与 Esc 都只关面板、不建草稿", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const server = await installNewTemplateServer(page);
    await openTemplateDesignWithoutDraft(page);

    expect(LAUNCH_TEMPLATE_MASTER_ENTRIES).toHaveLength(7);
    const trigger = masterEntry(page);
    const cards = page.locator(".launch-master-picker__card");
    const [first] = LAUNCH_TEMPLATE_MASTER_ENTRIES;

    for (const dismiss of ["escape", "button"] as const) {
      await trigger.click();
      await expect(picker(page)).toBeVisible();
      await expect(cards).toHaveCount(LAUNCH_TEMPLATE_MASTER_ENTRIES.length);
      // 没选之前不能开始，免得点进去发现是空的。
      await expect(beginButton(page)).toBeDisabled();
      for (const entry of LAUNCH_TEMPLATE_MASTER_ENTRIES) {
        await expect(masterCard(page, entry.name)).toBeVisible();
        await expect(masterCard(page, entry.name)).toHaveAttribute("aria-pressed", "false");
      }

      await masterCard(page, first.name).click();
      await expect(masterCard(page, first.name)).toHaveAttribute("aria-pressed", "true");
      await expect(beginButton(page)).toBeEnabled();

      if (dismiss === "escape") await page.keyboard.press("Escape");
      else await cancelButton(page).click();

      await expect(picker(page)).toBeHidden();
      // 面板是条件渲染挂上去的，关闭动画与 afterClose 都不保证跑得到，键盘位置必须回到入口按钮。
      await expect(trigger).toBeFocused();
      expect((await readSession(page)).definition).toBeNull();
    }

    // 打开、选择、取消都只是界面动作：没有模板草稿，也没有任何服务端写入。
    expect(server.writes).toEqual([]);
    expect(server.persisted).toBeNull();
    expect(server.published).toBeNull();
  });

  test("七块母版都能起步：每块派生出一份只换标识、不改结构的新模板草稿", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const server = await installNewTemplateServer(page);
    await openTemplateDesignWithoutDraft(page);

    const openedIds = new Set<string>();
    for (const [index, entry] of LAUNCH_TEMPLATE_MASTER_ENTRIES.entries()) {
      await test.step(`${entry.roleLabel}（${entry.name}）`, async () => {
        await startFromMaster(page, entry, index === 0 ? "skip" : "expect");
        await expect(structurePanel(page)).toBeVisible();

        const snapshot = await readSession(page);
        const definition = snapshot.definition;
        expect(definition, `${entry.name} 没能打开草稿`).not.toBeNull();
        if (!definition) return;

        expect(definition.name).toBe(entry.name);
        expect(definition.metadata.sectionRole).toBe(entry.role);
        // 实例必须换 id：templateId 在库里全局唯一，沿用母版 id 会直接撞 409。
        expect(definition.templateId).not.toBe(entry.templateId);
        expect(openedIds.has(definition.templateId), `${entry.name} 的实例 id 与前面的重复`).toBe(false);
        openedIds.add(definition.templateId);
        expect(normalizeIdentities(definition)).toBe(normalizeIdentities(entry.definition));
        // 新草稿是"未保存"状态：脏、没有服务端身份——这样设计师一保存就是新建，而不是覆盖谁。
        expect(snapshot.dirty).toBe(true);
        expect(snapshot.remote).toBeNull();
        expect(snapshot.sessionId).toBeTruthy();
      });
    }

    expect(openedIds.size).toBe(LAUNCH_TEMPLATE_MASTER_ENTRIES.length);
    // 起步只进编辑器：没有服务端草稿，也没有发布。
    expect(server.writes).toEqual([]);
    expect(server.persisted).toBeNull();
    expect(server.published).toBeNull();
  });

  test("有未保存草稿时面板等确认框：继续编辑保留选择，放弃修改才换定义", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const server = await installNewTemplateServer(page);
    await openTemplateDesignWithoutDraft(page);

    const [first, second] = LAUNCH_TEMPLATE_MASTER_ENTRIES;
    await startFromMaster(page, first, "skip");
    const openedId = (await readSession(page)).definition?.templateId;
    expect(openedId).toBeTruthy();

    await masterEntry(page).click();
    await masterCard(page, second.name).click();
    await beginButton(page).click();

    // 关键点一：确认框出现时面板**不能**先自己收起来——否则用户在确认框里点"继续编辑"，
    // 回到的就是"面板没了、什么都没发生"。
    await expect(discardButton(page)).toBeVisible();
    await expect(picker(page)).toBeVisible();
    await expect(masterCard(page, second.name)).toHaveAttribute("aria-pressed", "true");

    // 关键点二：继续编辑 = 什么都没发生，连选择本身也保留。
    await keepEditingButton(page).click();
    await expect(keepEditingButton(page)).toBeHidden();
    await expect(picker(page)).toBeVisible();
    await expect(masterCard(page, second.name)).toHaveAttribute("aria-pressed", "true");
    expect((await readSession(page)).definition?.templateId).toBe(openedId);

    // 再点一次开始，这次放弃修改：定义才真的换掉。
    await beginButton(page).click();
    await expect(discardButton(page)).toBeVisible();
    await discardButton(page).click();
    await expect(picker(page)).toBeHidden();

    const switched = (await readSession(page)).definition;
    expect(switched?.metadata.sectionRole).toBe(second.role);
    expect(switched?.templateId).not.toBe(openedId);
    expect(switched && normalizeIdentities(switched)).toBe(normalizeIdentities(second.definition));

    // 换了定义也只是换了编辑对象：全程没有服务端草稿。
    expect(server.writes).toEqual([]);
    expect(server.persisted).toBeNull();
  });

  test("紧凑宽度（960px）下换母版：面板等确认框，不连选择一起卸掉", async ({ page }) => {
    // 960×900 落在 521–1024 的紧凑区间，又避开 (max-width: 900px) 那套手机收起，
    // 让"目录在紧凑宽度下是覆盖面板"这一条单独受测——1024px 是 useCompactWorkspaceOverlay 的分界。
    await page.setViewportSize({ width: 960, height: 900 });
    const server = await installNewTemplateServer(page);
    await openTemplateDesignWithoutDraft(page);

    // 紧凑宽度下模板目录默认收起（窄屏设计模式的既定行为），先展开成覆盖面板。
    await openCompactLibrary(page);

    const [first, second] = LAUNCH_TEMPLATE_MASTER_ENTRIES;
    await startFromMaster(page, first, "skip");
    const openedId = (await readSession(page)).definition?.templateId;
    expect(openedId).toBeTruthy();

    // 换第二块：这一步要过未保存确认框，也是紧凑宽度下最容易把面板整块卸掉的一步。
    await openCompactLibrary(page);
    await masterEntry(page).click();
    await masterCard(page, second.name).click();
    await beginButton(page).click();

    // 覆盖面板一旦收起就是整块卸载，picker 也一起没——确认框还在，用户的选择却找不回来。
    await expect(discardButton(page)).toBeVisible();
    await expect(picker(page)).toBeVisible();
    await expect(compactLibrary(page)).toBeVisible();
    await expect(masterCard(page, second.name)).toHaveAttribute("aria-pressed", "true");

    await keepEditingButton(page).click();
    await expect(keepEditingButton(page)).toBeHidden();
    await expect(picker(page)).toBeVisible();
    await expect(compactLibrary(page)).toBeVisible();
    await expect(masterCard(page, second.name)).toHaveAttribute("aria-pressed", "true");
    expect((await readSession(page)).definition?.templateId).toBe(openedId);

    // 真放弃修改时才换定义，面板也才收起——收起是"进设计器"的结果，不是点击的副作用。
    await beginButton(page).click();
    await expect(discardButton(page)).toBeVisible();
    await discardButton(page).click();
    await expect(picker(page)).toBeHidden();
    await expect(compactLibrary(page)).toBeHidden();
    await expect(libraryRail(page)).toBeVisible();

    const switched = (await readSession(page)).definition;
    expect(switched?.metadata.sectionRole).toBe(second.role);
    expect(switched?.templateId).not.toBe(openedId);
    expect(switched && normalizeIdentities(switched)).toBe(normalizeIdentities(second.definition));
    expect(server.writes).toEqual([]);
    expect(server.persisted).toBeNull();
  });
});
