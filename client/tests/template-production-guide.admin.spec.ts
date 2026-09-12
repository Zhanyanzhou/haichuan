import { expect, test } from "@playwright/test";
import {
  addDynamicTemplateNode,
  createBlankDynamicTemplateDefinition,
  validateDynamicTemplatePublishDefinition,
} from "../src/page-builder/template-definition";
import { buildTemplateStructureAudit } from "../src/page-builder/template-editor/templateStructureAudit";
import { resolveTemplateInspectorIssueTarget } from "../src/page-builder/template-editor/templateInspectorCapabilities";
import {
  createBlankTemplate,
  blankTemplateStart,
  guide,
  saveTemplate,
  installNewTemplateServer,
  readSession,
} from "./fixtures/template-authoring-main-route";

test.describe("结构审查的三端有效显隐", () => {
  function fixture() {
    const blank = createBlankDynamicTemplateDefinition("三端审查");
    const region = addDynamicTemplateNode(blank, blank.rootNodeId, "Container");
    const text = addDynamicTemplateNode(region.definition, region.nodeId, "TextSlot");
    Object.assign(text.definition.slots[text.slotId!], { required: true, editable: true, hideable: false });
    return { definition: text.definition, regionId: region.nodeId, nodeId: text.nodeId };
  }
  test("平板 hidden 及手机继承均报告，手机显式恢复后只剩平板", () => {
    const { definition, nodeId } = fixture();
    definition.nodes[nodeId].responsive.tablet = { hidden: true };
    const before = structuredClone(definition);
    const audit = buildTemplateStructureAudit(definition);
    expect(audit.issues.filter((issue) => issue.code === "REQUIRED_SLOT_DEVICE_HIDDEN").map((issue) => issue.device)).toEqual(["tablet", "mobile"]);
    expect(audit.requiredComplete).toBe(0);
    expect(definition).toEqual(before);
    definition.nodes[nodeId].responsive.mobile = { hidden: false };
    expect(buildTemplateStructureAudit(definition).issues.filter((issue) => issue.code === "REQUIRED_SLOT_DEVICE_HIDDEN").map((issue) => issue.device)).toEqual(["tablet"]);
  });
  test("桌面 display none 向三端继承，必填完成度不能变绿", () => {
    const { definition, nodeId } = fixture();
    definition.nodes[nodeId].responsive.desktop.display = "none";
    const audit = buildTemplateStructureAudit(definition);
    expect(audit.issues.filter((issue) => issue.code === "REQUIRED_SLOT_DEVICE_HIDDEN").map((issue) => issue.device)).toEqual(["desktop", "tablet", "mobile"]);
    expect(audit.requiredComplete).toBe(0);
  });
  test("定位实际隐藏祖先；全局隐藏优先于断点隐藏", () => {
    const { definition, regionId, nodeId } = fixture();
    definition.nodes[regionId].responsive.tablet = { hidden: true };
    expect(buildTemplateStructureAudit(definition).issues.filter((issue) => issue.code === "REQUIRED_SLOT_DEVICE_HIDDEN").map((issue) => issue.nodeId)).toEqual([regionId, regionId]);
    const publishIssues = validateDynamicTemplatePublishDefinition(definition).issues
      .filter((issue) => issue.code === "PUBLISH_REQUIRED_SLOT_DEVICE_HIDDEN");
    expect(publishIssues.map((issue) => [issue.nodeId, issue.path])).toEqual([
      [regionId, `nodes.${regionId}.responsive.tablet.display`],
      [regionId, `nodes.${regionId}.responsive.mobile.display`],
    ]);
    const tabletTarget = resolveTemplateInspectorIssueTarget(definition, publishIssues[0]);
    expect(tabletTarget).toMatchObject({
      objectId: regionId,
      field: "responsive.*.display",
      destination: "inspector-field",
    });
    expect(tabletTarget.device).toBeUndefined();
    expect(publishIssues[0].slotId).toBe(definition.nodes[nodeId].slotId);
    definition.nodes[regionId].hidden = true;
    const audit = buildTemplateStructureAudit(definition);
    expect(audit.issues.find((issue) => issue.code === "REQUIRED_SLOT_HIDDEN")?.nodeId).toBe(regionId);
    expect(audit.issues.filter((issue) => issue.code === "REQUIRED_SLOT_DEVICE_HIDDEN")).toEqual([]);
    expect(audit.requiredComplete).toBe(0);
    const globalPublish = validateDynamicTemplatePublishDefinition(definition).issues
      .filter((issue) => issue.code === "PUBLISH_REQUIRED_SLOT_HIDDEN");
    expect(globalPublish).toHaveLength(1);
    expect(globalPublish[0]).toMatchObject({ nodeId: regionId, path: `nodes.${regionId}.hidden` });
  });
});

test.describe("模板编辑简化（隔离接口 Mock）", () => {
  test("图片建议默认收起且可发布，未命名错误定位保留草稿", async ({ page }, testInfo) => {
    const server = await installNewTemplateServer(page);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await createBlankTemplate(page);
    const imageId = await page.evaluate(async () => {
      const definitionPath = "/src/page-builder/template-definition/index.ts";
      const sessionPath = "/src/page-builder/template-editor/templateEditorSession.ts";
      const [{ addDynamicTemplateNode }, { useTemplateEditorSession }] = await Promise.all([
        import(/* @vite-ignore */ definitionPath), import(/* @vite-ignore */ sessionPath),
      ]);
      const state = useTemplateEditorSession.getState();
      const region = addDynamicTemplateNode(state.draft.definition, state.draft.definition.rootNodeId, "Container");
      const image = addDynamicTemplateNode(region.definition, region.nodeId, "ImageSlot");
      image.definition.nodes[region.nodeId].responsive.desktop.height = { mode: "fixed", value: { value: 240, unit: "px" } };
      image.definition.nodes[region.nodeId].responsive.mobile = { height: { mode: "fixed", value: { value: 240, unit: "px" } } };
      image.definition.nodes[image.nodeId].responsive.desktop.height = { mode: "auto" };
      image.definition.nodes[image.nodeId].responsive.mobile = { height: { mode: "auto" } };
      state.setDynamicDefinition(image.definition);
      return image.nodeId;
    });
    const publish = page.locator(".homepage-editor__toolbar").getByRole("button", { name: /^发布模板新版本/ });
    await publish.click();
    const review = page.getByRole("region", { name: "本次发布检查", exact: true });
    await expect(review).toContainText("1 项需要修改");
    await expect(review.getByRole("button", { name: "保存并发布模板", exact: true })).toBeDisabled();
    const suggestions = review.locator("details").filter({ has: page.locator("summary", { hasText: "设计建议" }) });
    await expect(suggestions).not.toHaveAttribute("open", "");
    await suggestions.locator("summary").click();
    await suggestions.getByRole("button", { name: "查看对应设置", exact: true }).last().click();
    await expect(review).toBeHidden();
    expect((await readSession(page)).selectedObjectId).toBe(imageId);
    await expect(page.locator('[data-template-design-property="node.height"][data-template-inspector-located="true"] select')).toBeFocused();
    await expect(page.getByText(/当前不可直接编辑/)).toHaveCount(0);
    expect(server.writes).toEqual([]);
    await page.getByRole("button", { name: "打开模板设置", exact: true }).click();
    const name = page.getByRole("textbox", { name: "模板名称", exact: true });
    await name.fill("自动高度图片模板");
    await name.press("Tab");
    await publish.click();
    await review.getByRole("button", { name: "重新检查", exact: true }).click();
    await expect(review).toContainText("可以发布");
    await expect(review).not.toContainText("项需要修改");
    await expect(suggestions).not.toHaveAttribute("open", "");
    await expect(review.getByRole("button", { name: "保存并发布模板", exact: true })).toBeEnabled();
    expect(server.writes).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("publish-suggestions.png"), fullPage: true });
    await review.getByRole("button", { name: "保存并发布模板", exact: true }).click();
    await expect.poll(() => server.published?.definition.name).toBe("自动高度图片模板");
    expect(server.writes.filter((write) => write.path.endsWith("/publish"))).toHaveLength(1);
  });

  test("旧空模板只保留轻量恢复入口，没有第二套任务链且可保存草稿", async ({ page }) => {
    const server = await installNewTemplateServer(page);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await createBlankTemplate(page);
    await expect(guide(page)).toHaveCount(0);
    await expect(page.getByRole("region", { name: "空白模板制作起点", exact: true })).toHaveCount(0);
    const empty = blankTemplateStart(page);
    await expect(empty.getByRole("button")).toHaveCount(1);
    await expect(empty.getByRole("button", { name: "添加区域", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "使用双图文骨架", exact: true })).toHaveCount(0);
    const before = await readSession(page);
    expect(server.writes).toEqual([]);
    await saveTemplate(page);
    await expect.poll(() => server.saveResults.length).toBe(1);
    const after = await readSession(page);
    expect(after.definition?.name).toBe("未命名模板");
    expect(after.definition?.slots).toEqual({});
    expect(after.productionReviewFacts).toEqual(before.productionReviewFacts);
    expect(after.historyPast).toEqual(before.historyPast);
    expect(server.published).toBeNull();
    await empty.getByRole("button", { name: "添加区域", exact: true }).click();
    const added = await readSession(page);
    expect(added.definition?.nodes[added.definition.rootNodeId].childIds).toHaveLength(1);
    expect(added.historyPast.length).toBe(after.historyPast.length + 1);
    await page.getByRole("button", { name: "撤销", exact: true }).click();
    await expect(empty.getByRole("button", { name: "添加区域", exact: true })).toBeVisible();
    expect((await readSession(page)).definition).toEqual(after.definition);
    expect(server.saveResults).toHaveLength(1);
  });

  test("预览和发布检查通过独立入口访问，人工确认只在发布检查可见", async ({ page }) => {
    const server = await installNewTemplateServer(page);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await createBlankTemplate(page);
    const before = await readSession(page);
    await expect(page.getByRole("button", { name: "确认已核对桌面端布局", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "预览模板", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "压力预览场景", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "退出预览并继续编辑", exact: true }).click();
    await page.locator(".homepage-editor__toolbar").getByRole("button", { name: /^发布模板新版本/ }).click();
    const validation = page.getByRole("region", { name: "本次发布检查", exact: true });
    await expect(validation).toBeVisible();
    await expect(validation).toContainText("请先完成必要修改");
    await expect(validation).toContainText("发布前至少需要一个区域或容器。");
    await expect(validation).toContainText("发布前至少需要一个内容槽位。");
    const after = await readSession(page);
    expect(after.definition).toEqual(before.definition);
    expect(after.historyPast).toEqual(before.historyPast);
    expect(after.dirty).toEqual(before.dirty);
    expect(after.productionReviewFacts).toEqual(before.productionReviewFacts);
    expect(server.writes).toEqual([]);
    await validation.locator("summary", { hasText: "预览与核对（可选）" }).click();
    await validation.getByRole("button", { name: "确认已核对桌面端布局", exact: true }).click();
    expect((await readSession(page)).productionReviewFacts.desktop).toBe(true);
    await validation.getByRole("button", { name: "发布检查移动端模板布局", exact: true }).click();
    await validation.getByRole("button", { name: "确认已核对移动端布局", exact: true }).click();
    await validation.getByRole("button", { name: "确认页面开放范围已核对", exact: true }).click();
    const reviewed = await readSession(page);
    expect(reviewed.productionReviewFacts).toMatchObject({ desktop: true, mobile: true, pageScope: true });
    expect(reviewed.definition).toEqual(before.definition);
    expect(server.writes).toEqual([]);
  });

  test("人工核对只记录事实，未命名仍须在发布前补填", async ({ page }) => {
    await installNewTemplateServer(page);
    await createBlankTemplate(page);
    const result = await page.evaluate(async () => {
      const definitionPath = "/src/page-builder/template-definition/index.ts";
      const workflowPath = "/src/page-builder/template-editor/templatePublishWorkflow.ts";
      const sessionPath = "/src/page-builder/template-editor/templateEditorSession.ts";
      const [definitions, { deriveTemplateProductionReadiness }, { createTemplateProductionReviewFacts }] = await Promise.all([
        import(/* @vite-ignore */ definitionPath) as Promise<typeof import("../src/page-builder/template-definition")>,
        import(/* @vite-ignore */ workflowPath) as Promise<typeof import("../src/page-builder/template-editor/templatePublishWorkflow")>,
        import(/* @vite-ignore */ sessionPath) as Promise<typeof import("../src/page-builder/template-editor/templateEditorSession")>,
      ]);
      const blank = definitions.createBlankDynamicTemplateDefinition();
      const region = definitions.addDynamicTemplateNode(blank, blank.rootNodeId, "Container");
      const content = definitions.addDynamicTemplateNode(region.definition, region.nodeId, "TextSlot");
      const reviewFacts = createTemplateProductionReviewFacts();
      const input: Parameters<typeof deriveTemplateProductionReadiness>[0] = {
        definition: content.definition, hasBaseline: false, dirty: true, saveStatus: "idle", reviewFacts,
      };
      const before = JSON.stringify(input.definition);
      const initial = deriveTemplateProductionReadiness(input);
      reviewFacts.desktop = true;
      reviewFacts.mobile = true;
      for (const key of Object.keys(reviewFacts.stressPreview) as Array<keyof typeof reviewFacts.stressPreview>) reviewFacts.stressPreview[key] = true;
      reviewFacts.pageScope = true;
      const reviewed = deriveTemplateProductionReadiness(input);
      return {
        initialPending: initial.operatorReviewIssues.length,
        reviewedPending: reviewed.operatorReviewIssues.length,
        publishReady: reviewed.publishReady,
        codes: reviewed.validation.issues.map((issue) => issue.code),
        unchanged: JSON.stringify(input.definition) === before,
      };
    });
    expect(result.initialPending).toBeGreaterThan(0);
    expect(result.reviewedPending).toBe(0);
    expect(result.publishReady).toBe(false);
    expect(result.codes).toEqual(expect.arrayContaining(["PUBLISH_REQUIRES_TEMPLATE_NAME"]));
    expect(result.codes).not.toContain("PUBLISH_REQUIRES_TEMPLATE_PURPOSE");
    expect(result.unchanged).toBe(true);
  });
});
