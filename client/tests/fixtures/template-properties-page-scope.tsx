import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "antd";
import DynamicTemplateInspectorPanel from "../../src/page-builder/template-editor/DynamicTemplateInspectorPanel";
import { addDynamicTemplateNode } from "../../src/page-builder/template-definition";
import { createNewDynamicTemplateDraft } from "../../src/page-builder/template-editor/dynamicTemplateDraftRepository";
import { useTemplateEditorSession } from "../../src/page-builder/template-editor/templateEditorSession";
import "../../src/styles/globals.css";
import "../../src/styles/adminLuxury.css";
import "../../src/pages/admin/HomepageConfig/editor.css";
import "../../src/page-builder/template-editor/TemplateWorkspace.css";

const draft = createNewDynamicTemplateDraft("属性交付测试");
const container = addDynamicTemplateNode(draft.definition, draft.definition.rootNodeId, "Container");
const image = addDynamicTemplateNode(container.definition, container.nodeId, "ImageSlot");
const heading = addDynamicTemplateNode(image.definition, container.nodeId, "HeadingSlot");
draft.definition = heading.definition;
Object.assign(draft.definition.slots[image.slotId!], { label: "工艺主图", required: true, editable: false, hideable: true });
Object.assign(draft.definition.slots[heading.slotId!], { label: "工艺标题", required: false, editable: true, hideable: false, validation: { minLength: 2, maxLength: 36 } });
useTemplateEditorSession.getState().open(draft, { isNew: true });
useTemplateEditorSession.getState().selectObject(image.nodeId);
useTemplateEditorSession.getState().setInspectorTask("page-scope");
Object.assign(window, {
  __templateScopeSession: useTemplateEditorSession,
  __templateScopeIds: { imageNodeId: image.nodeId, imageSlotId: image.slotId!, textNodeId: heading.nodeId, rootId: draft.definition.rootNodeId },
});
const width = Number(new URLSearchParams(window.location.search).get("width")) || 384;
createRoot(document.getElementById("root")!).render(<App><div className="admin-shell-v7" style={{ width, height: 900 }}><DynamicTemplateInspectorPanel localOnly /></div></App>);
