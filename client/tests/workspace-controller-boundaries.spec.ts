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
    expect(controller).toContain("pageDocumentApi.getRevision");
    expect(controller).toContain("stageRevisionAsDraft");
    expect(controller).not.toContain("pageDocumentApi.restoreRevision");
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

  test("临时返回只切换工作区，显式关闭才清理模板会话", () => {
    const controller = readClientSource(
      "src/page-builder/template-editor/TemplateWorkspaceController.tsx",
    );
    const returnStart = controller.indexOf("const returnToPage");
    const returnEnd = controller.indexOf("return {", returnStart);
    const returnImplementation = controller.slice(returnStart, returnEnd);

    expect(returnStart).toBeGreaterThan(-1);
    expect(returnImplementation).toContain('activateWorkspace("page")');
    expect(returnImplementation).not.toContain(".close()");
    expect(controller).toContain("closeSession");

    const storeCloseCalls = controller.match(/\.close\(\)/g) ?? [];
    const closeCommandStart = controller.indexOf("const closeTemplateSession");
    const closeCommandEnd = controller.indexOf("const requestDirtySessionAction", closeCommandStart);
    const closeCommand = controller.slice(closeCommandStart, closeCommandEnd);
    const activateStart = controller.indexOf("const activateTemplateSession");
    const activateEnd = controller.indexOf("const openSystemDraft", activateStart);
    const activateImplementation = controller.slice(activateStart, activateEnd);
    const discardStart = controller.indexOf("const discardChanges");
    const discardEnd = controller.indexOf("const openImportedDraft", discardStart);
    const discardImplementation = controller.slice(discardStart, discardEnd);

    expect(storeCloseCalls).toHaveLength(1);
    expect(activateImplementation).toContain("clearTemplateSessionGeometry(sessionId)");
    expect(closeCommand).toContain("useTemplateEditorSession.getState().close()");
    expect(closeCommand).toContain("clearTemplateSessionGeometry(sessionId)");
    expect(discardImplementation).not.toContain(".close()");
    expect(discardImplementation).not.toContain(".open(");
    expect(discardImplementation).toContain("restoreBaseline()");
    expect(discardImplementation).toContain("clearTemplateSessionGeometry(sessionId)");
    expect(controller).toContain("clearCanvasGeometryNamespace");
    expect(controller).not.toContain("clearCanvasGeometry(`template-editor:");

    const toolbar = readClientSource(
      "src/page-builder/template-editor/TemplateEditorToolbar.tsx",
    );
    expect(toolbar.match(/clearCanvasGeometryNamespace/g) ?? []).toHaveLength(2);
    expect(toolbar).not.toContain("clearCanvasGeometry(`template-editor:");
  });
});
