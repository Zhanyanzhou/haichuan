import { expect, test } from "@playwright/test";

import { createNewDynamicTemplateDraft } from "../src/page-builder/template-editor/dynamicTemplateDraftRepository";
import {
  nextTemplateWorkspaceScrollForOpen,
  resolveTemplateLibraryScrollRestore,
  useTemplateEditorSession,
} from "../src/page-builder/template-editor/templateEditorSession";

test.afterEach(() => {
  const session = useTemplateEditorSession.getState();
  if (session.previewMode) session.setPreviewMode(false);
  session.close();
});

test("目录已滚离顶部时，切模板不得把列表拽回 0", () => {
  expect(resolveTemplateLibraryScrollRestore(420, 0, 420)).toBe(420);
  expect(resolveTemplateLibraryScrollRestore(0, 0, 420)).toBe(420);
  expect(resolveTemplateLibraryScrollRestore(0, 360, 0)).toBe(360);
  expect(resolveTemplateLibraryScrollRestore(0, 0, 0)).toBe(0);
});

test("新会话保留目录滚动，并重置当前模板文档内的面板滚动", () => {
  expect(nextTemplateWorkspaceScrollForOpen({
    library: 480,
    structure: 90,
    canvas: 160,
    inspector: 40,
  })).toEqual({
    library: 480,
    structure: 0,
    canvas: 0,
    inspector: 0,
  });
});

test("打开另一个模板后，目录滚动仍在原位置", () => {
  const first = createNewDynamicTemplateDraft("目录滚动甲");
  const second = createNewDynamicTemplateDraft("目录滚动乙");
  useTemplateEditorSession.getState().open(first);
  const sessionId = useTemplateEditorSession.getState().sessionId;
  expect(sessionId).toBeTruthy();
  useTemplateEditorSession.getState().setWorkspaceScroll(sessionId!, {
    library: 420,
    structure: 80,
    canvas: 160,
    inspector: 40,
  });

  useTemplateEditorSession.getState().open(second);
  const next = useTemplateEditorSession.getState();
  expect(next.sessionId).not.toBe(sessionId);
  expect(next.draft?.definition.name).toBe("目录滚动乙");
  expect(next.workspaceScroll).toEqual({
    library: 420,
    structure: 0,
    canvas: 0,
    inspector: 0,
  });
});
