import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const clientRoot = resolve(testDirectory, "..");

function readClientSource(relativePath: string) {
  return readFileSync(resolve(clientRoot, relativePath), "utf8");
}

test.describe("店铺装修双工作区控制器边界", () => {
  test("工作台只组合一个 Puck 宿主并汇总页面与模板离开保护", () => {
    const workbench = readClientSource("src/pages/admin/HomepageConfig/index.tsx");

    expect(workbench.match(/<Puck(?:\s|>)/g)).toHaveLength(1);
    expect(workbench).toContain("usePageWorkspaceController");
    expect(workbench).toContain("useTemplateWorkspaceController");
    expect(workbench).toContain("hasProtectedUnsavedChanges || hasProtectedTemplateChanges");
    expect(workbench).not.toMatch(/pageDocumentApi\.(save|publish|validate|restoreRevision)/);
    expect(workbench).not.toMatch(/dynamicTemplateApi\.(create|updateDraft|publish|archive)/);
    expect(workbench).not.toContain("useTemplateEditorSession");
  });

  test("页面控制器独占页面乐观锁、保存队列、发布校验和版本生命周期", () => {
    const controller = readClientSource(
      "src/pages/admin/HomepageConfig/PageWorkspaceController.tsx",
    );

    expect(controller).toContain("saveQueueRef");
    expect(controller).toContain("validationRequestRef");
    expect(controller).toContain("expectedUpdatedAt");
    expect(controller).toContain("pageDocumentApi.restoreRevision");
    expect(controller).toContain("pageDocumentApi.rollbackPublication");
    expect(controller).not.toContain("useTemplateEditorSession");
  });

  test("模板控制器复用唯一模板会话并独占模板持久化生命周期", () => {
    const controller = readClientSource(
      "src/page-builder/template-editor/TemplateWorkspaceController.tsx",
    );
    const workspace = readClientSource(
      "src/page-builder/template-editor/TemplateWorkspace.tsx",
    );

    expect(controller).toContain("useTemplateEditorSession");
    expect(controller).toContain("expectedRevision");
    expect(controller).toContain("reconcileSaveResult");
    expect(controller).toContain("dynamicTemplateApi.publish");
    expect(workspace).not.toMatch(/dynamicTemplateApi\./);
    expect(workspace).not.toContain("useTemplateEditorSession");
    expect(controller).not.toMatch(/pageDocumentApi\./);
  });
});
