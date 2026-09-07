import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

function readSource(relativePath: string) {
  return readFileSync(resolve("src", relativePath), "utf8");
}

const pageRoot = readSource("pages/admin/PageDecorationWorkspace/index.tsx");
const templateRoot = readSource("pages/admin/TemplateDesignWorkspace/index.tsx");
const proposal = readSource(
  "page-builder/handoffs/pageToTemplateDraftProposal.ts",
);

test.describe("页面装修与母模板设计 composition 边界", () => {
  test("两个根使用不同领域入口且只共享纯四区壳", () => {
    expect(pageRoot).toContain('data-workspace-root="page-decoration"');
    expect(templateRoot).toContain('data-workspace-root="template-design"');
    expect(pageRoot).toContain("templateInstanceLibrary");
    expect(pageRoot).toContain("pageLayerTree");
    expect(pageRoot).toContain("pageCanvas");
    expect(pageRoot).toContain("pageInspector");
    expect(templateRoot).toContain("sectionPatternSlotLibrary");
    expect(templateRoot).toContain("templateStructureTree");
    expect(templateRoot).toContain("templateBlueprintCanvas");
    expect(templateRoot).toContain("templateConstraintInspector");
    expect(pageRoot).toContain("FourZoneWorkspaceShell");
    expect(templateRoot).toContain("FourZoneWorkspaceShell");
  });

  test("页面根不拥有模板 controller/session/repository", () => {
    expect(pageRoot).not.toMatch(
      /TemplateWorkspace|TemplateWorkspaceController|templateEditorSession|dynamicTemplateDraftRepository|dynamicTemplateApi/,
    );
    expect(pageRoot).not.toMatch(/workspaceMode|workspaceKind|publish|UnsavedChangesGuard/);
  });

  test("模板根只表达母模板结构、蓝图和约束，不表达真实业务内容", () => {
    for (const required of [
      "Section、Pattern 与 Slot 库",
      "模板结构树",
      "模板蓝图与响应式预览画布",
      "默认值、约束与允许编辑范围",
    ]) {
      expect(templateRoot).toContain(required);
    }
    expect(templateRoot).not.toMatch(
      /PageWorkspaceController|pageDocumentApi|useHomepagePuck|Product|SKU|Customer|Order|mediaUrl|workspaceMode|workspaceKind|publish/,
    );
  });

  test("页面到模板的交接严格限于结构引用且只能消费一次", () => {
    for (const allowedField of [
      "structure",
      "slots",
      "layout",
      "responsive",
      "editableRange",
      "suggestedName",
    ]) {
      expect(proposal).toContain(allowedField);
    }
    expect(proposal).toContain("hasExactKeys");
    expect(proposal).toContain("already-consumed");
    expect(proposal).toContain("consumedHandoffIds.add");
    expect(proposal).not.toMatch(
      /defaultContent|previewContent|pageDocument|pageDraft|mediaUrl|imageUrl|videoUrl|productId|skuId|customerId|orderId|authToken|saveState|publishState/,
    );
  });
});
