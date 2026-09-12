import React from "react";
import { createRoot } from "react-dom/client";
import {
  addDynamicTemplateNode,
  createBlankDynamicTemplateDefinition,
  DynamicTemplateRenderer,
} from "../../src/page-builder/template-definition";
import "../../src/page-builder/template-editor/TemplateWorkspace.css";

let definition = createBlankDynamicTemplateDefinition("Renderer 身份边界测试");
const container = addDynamicTemplateNode(
  definition,
  definition.rootNodeId,
  "Container",
);
definition = container.definition;
const heading = addDynamicTemplateNode(definition, container.nodeId, "HeadingSlot");
definition = heading.definition;
const emptyRegion = addDynamicTemplateNode(definition, definition.rootNodeId, "Container");
definition = emptyRegion.definition;

const sharedProps = {
  definition,
  device: "desktop" as const,
  contentBySlotId: { [heading.slotId!]: "身份边界标题" },
  templateEditorSessionId: "session-should-not-leak",
  selectedNodeId: heading.nodeId,
  selectedContractRole: { nodeId: heading.nodeId, roleId: "title" },
  onSelectNode: () => undefined,
  onSelectContractRole: () => undefined,
};

function Fixture() {
  return (
    <main>
      <section data-testid="template-definition">
        <DynamicTemplateRenderer
          {...sharedProps}
          mode="editor"
          editorSurface="template-definition"
        />
      </section>
      <section data-testid="host-overlay-definition">
        <DynamicTemplateRenderer
          {...sharedProps}
          mode="editor"
          editorSurface="template-definition"
          interactionOwner="host-overlay"
        />
      </section>
      <section data-testid="page-instance">
        <DynamicTemplateRenderer
          {...sharedProps}
          mode="editor"
          editorSurface="page-instance"
        />
      </section>
      <section data-testid="ordinary-editor">
        <DynamicTemplateRenderer {...sharedProps} mode="editor" />
      </section>
      <section data-testid="public">
        <DynamicTemplateRenderer
          {...sharedProps}
          mode="public"
          editorSurface="template-definition"
        />
      </section>
      <section data-testid="preview">
        <DynamicTemplateRenderer
          {...sharedProps}
          mode="preview"
          editorSurface="template-definition"
        />
      </section>
      <section data-testid="thumbnail">
        <DynamicTemplateRenderer
          {...sharedProps}
          mode="thumbnail"
          editorSurface="template-definition"
        />
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Fixture />
  </React.StrictMode>,
);
