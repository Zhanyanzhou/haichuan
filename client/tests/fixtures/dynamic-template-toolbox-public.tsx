import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

import {
  compileDynamicTemplateRenderPlan,
  DynamicTemplateRenderer,
  validateDynamicTemplateDefinition,
} from "../../src/page-builder/template-definition";
import { createTemplatePreviewContentBySlotId } from "../../src/page-builder/template-editor/templatePreviewModel";

const STORAGE_KEY = "dynamic-template-toolbox-public-definition";
const rawDefinition = sessionStorage.getItem(STORAGE_KEY);
const parsedDefinition = rawDefinition ? JSON.parse(rawDefinition) : null;
const validation = validateDynamicTemplateDefinition(parsedDefinition);
const root = createRoot(document.getElementById("root")!);
const definition = validation.valid ? validation.definition : undefined;
const contentBySlotId = definition ? createTemplatePreviewContentBySlotId(definition) : {};
const renderPlan = definition
  ? compileDynamicTemplateRenderPlan(definition, {
      device: "desktop",
      contentBySlotId,
      showEmptySlots: true,
    })
  : null;

root.render(definition && renderPlan?.ok ? (
  <MemoryRouter>
    <main aria-label="复杂组件公开 Renderer">
      <DynamicTemplateRenderer
        definition={definition}
        device="desktop"
        mode="public"
        showEmptySlots
        contentBySlotId={contentBySlotId}
      />
    </main>
  </MemoryRouter>
) : (
  <main role="alert">
    模板定义无法公开渲染：
    {JSON.stringify(renderPlan && !renderPlan.ok ? renderPlan.issues : validation.issues)}
  </main>
));
