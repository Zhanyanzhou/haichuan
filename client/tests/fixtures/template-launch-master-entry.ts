import { expect, type Page } from "@playwright/test";

/** 在自有 Mock 会话装入已有母版定义，隔离验证仍保留的模板维护能力。 */
export async function seedLaunchMasterDraft(page: Page, name = "页面首屏") {
  await page.evaluate(async (masterName) => {
    const masterPath = "/src/page-builder/template-creation/launchTemplateSet.ts";
    const sessionPath = "/src/page-builder/template-editor/templateEditorSession.ts";
    const [{ LAUNCH_TEMPLATE_MASTER_ENTRIES, instantiateLaunchTemplateMaster }, { useTemplateEditorSession }] =
      await Promise.all([import(/* @vite-ignore */ masterPath), import(/* @vite-ignore */ sessionPath)]);
    const master = LAUNCH_TEMPLATE_MASTER_ENTRIES.find((entry: { name: string }) => entry.name === masterName);
    if (!master) throw new Error(`找不到测试母版 ${masterName}`);
    const definition = instantiateLaunchTemplateMaster(master.role);
    if (!definition) throw new Error(`无法装入测试母版 ${masterName}`);
    const session = useTemplateEditorSession.getState();
    session.open({
      format: "dynamic",
      sourceType: "local",
      localDraftId: definition.templateId,
      versionNote: "",
      definition,
    }, { isNew: true });
    session.setDevice("desktop");
    session.selectObject(definition.rootNodeId);
  }, name);
  await expect(page.getByRole("region", { name: "空模板画布", exact: true })).toBeHidden();
}
