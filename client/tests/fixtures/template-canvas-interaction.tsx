import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "antd";
import DynamicTemplateCanvas from "../../src/page-builder/template-editor/DynamicTemplateCanvas";
import { useTemplateEditorSession } from "../../src/page-builder/template-editor/templateEditorSession";
import { createNewDynamicTemplateDraft } from "../../src/page-builder/template-editor/dynamicTemplateDraftRepository";
import { addDynamicTemplateNode } from "../../src/page-builder/template-definition";
import "../../src/styles/globals.css";
import "../../src/pages/admin/HomepageConfig/editor.css";
import "../../src/page-builder/template-editor/TemplateWorkspace.css";

const draft = createNewDynamicTemplateDraft("画布隔离交互");
let definition = draft.definition;
const add = (parent: string, type: Parameters<typeof addDynamicTemplateNode>[2], name: string) => {
  const result = addDynamicTemplateNode(definition, parent, type);
  definition = result.definition;
  definition.nodes[result.nodeId].name = name;
  return result.nodeId;
};
const region = add(definition.rootNodeId, "Container", "内容区域");
const stack = add(region, "Stack", "自由构图");
const first = add(stack, "ImageSlot", "前图");
const second = add(stack, "ImageSlot", "后图");
const locked = add(stack, "ImageSlot", "锁定图");
const hidden = add(stack, "ImageSlot", "隐藏图");
const flowMode = new URLSearchParams(window.location.search).has("flow");
const anchored = new URLSearchParams(window.location.search).has("anchor");
const crossMode = new URLSearchParams(window.location.search).has("cross");
const gridMode = new URLSearchParams(window.location.search).has("grid");
const overlapMode = new URLSearchParams(window.location.search).has("overlap");
const destination = crossMode ? add(region, "Stack", "目标分组") : null;
const text = flowMode ? add(stack, "TextSlot", "试排文字") : null;
for (const device of ["desktop", "mobile"] as const) {
  definition.nodes[definition.rootNodeId].responsive[device].height = { mode: "fixed", value: { value: 600, unit: "px" } };
  definition.nodes[region].responsive[device].height = { mode: "fixed", value: { value: 550, unit: "px" } };
  if (new URLSearchParams(window.location.search).has("root-ratio")) {
    definition.nodes[definition.rootNodeId].responsive[device].height = { mode: "aspect-ratio", ratio: { width: 4, height: 3 } };
  }
  if (new URLSearchParams(window.location.search).has("root-auto")) {
    definition.nodes[definition.rootNodeId].responsive[device].height = { mode: "auto" };
  }
  if (new URLSearchParams(window.location.search).has("root-max-height")) {
    definition.nodes[definition.rootNodeId].responsive[device].maxHeight = { value: 400, unit: "px" };
  }
  if (new URLSearchParams(window.location.search).has("root-max-height-vh")) {
    definition.nodes[definition.rootNodeId].responsive[device].maxHeight = { value: 50, unit: "vh" };
  }
  if (new URLSearchParams(window.location.search).has("root-max-width")) {
    definition.nodes[definition.rootNodeId].responsive[device].maxWidth = { value: 450, unit: "px" };
    definition.nodes[region].responsive[device].height = { mode: "fixed", value: { value: 100, unit: "px" } };
  }
  Object.assign(definition.nodes[stack].responsive[device], { layoutMode: "free", height: { mode: "fixed", value: { value: 500, unit: "px" } } });
  definition.nodes[first].responsive[device].placement = { x: 0.1, y: 0.1, width: 0.35, height: 0.35, zIndex: 1 };
  definition.nodes[second].responsive[device].placement = { x: 0.2, y: 0.2, width: 0.35, height: 0.35, zIndex: 2 };
  definition.nodes[locked].responsive[device].placement = { x: 0.7, y: 0.1, width: 0.2, height: 0.3, zIndex: 3 };
  definition.nodes[hidden].responsive[device].placement = { x: 0.7, y: 0.5, width: 0.2, height: 0.3, zIndex: 4 };
  if (flowMode) {
    Object.assign(definition.nodes[stack].responsive[device], { layoutMode: "flow", display: "flex", direction: "row", gap: { value: 20, unit: "px" } });
    for (const id of definition.nodes[stack].childIds) {
      delete definition.nodes[id].responsive[device].placement;
      definition.nodes[id].responsive[device].width = { value: 180, unit: "px" };
      definition.nodes[id].responsive[device].height = { mode: "fixed", value: { value: 140, unit: "px" } };
    }
  }
  if (anchored) {
    const space = { value: 40, unit: "px" as const };
    definition.nodes[stack].responsive[device].padding = { top: space, left: space, right: space, bottom: space };
    delete definition.nodes[first].responsive[device].placement;
    definition.nodes[first].responsive[device].anchor = { horizontal: "left", vertical: "top", offsetX: { value: 0, unit: "px" }, offsetY: { value: 0, unit: "px" } };
    definition.nodes[first].responsive[device].width = { value: 160, unit: "px" };
    definition.nodes[first].responsive[device].height = { mode: "fixed", value: { value: 110, unit: "px" } };
  }
  if (destination) {
    Object.assign(definition.nodes[region].responsive[device], { display: "flex", direction: "row", gap: { value: 20, unit: "px" } });
    definition.nodes[stack].responsive[device].width = { value: 350, unit: "px" };
    Object.assign(definition.nodes[destination].responsive[device], { width: { value: 350, unit: "px" }, height: { mode: "fixed", value: { value: 500, unit: "px" } } });
  }
  if (gridMode) {
    Object.assign(definition.nodes[stack].responsive[device], { layoutMode: "flow", display: "grid", direction: "column", columns: [1, 1, 1], gap: { value: 20, unit: "px" } });
    for (const id of definition.nodes[stack].childIds) {
      delete definition.nodes[id].responsive[device].placement;
      definition.nodes[id].responsive[device].width = "fill";
      definition.nodes[id].responsive[device].height = { mode: "fixed", value: { value: 140, unit: "px" } };
    }
  }
  if (overlapMode) {
    definition.nodes[locked].responsive[device].placement = { ...definition.nodes[first].responsive[device].placement!, zIndex: 3 };
    definition.nodes[hidden].responsive[device].placement = { ...definition.nodes[first].responsive[device].placement!, zIndex: 4 };
  }
  if (new URLSearchParams(window.location.search).has("limits")) {
    Object.assign(definition.nodes[first].responsive[device], {
      minWidth: { value: 15, unit: "%" }, maxWidth: { value: 30, unit: "%" },
      minHeight: { value: 80, unit: "px" }, maxHeight: { value: 180, unit: "px" },
    });
  }
  if (new URLSearchParams(window.location.search).has("ratio")) {
    definition.nodes[stack].responsive[device].alignItems = "start";
    definition.nodes[first].responsive[device].height = { mode: "aspect-ratio", ratio: { width: 2, height: 1 } };
  }
  if (new URLSearchParams(window.location.search).has("percent-height")) {
    definition.nodes[first].responsive[device].maxHeight = { value: 50, unit: "%" };
    definition.nodes[stack].responsive[device].alignItems = "start";
    if (new URLSearchParams(window.location.search).has("auto-parent")) definition.nodes[stack].responsive[device].height = { mode: "auto" };
  }
  if (new URLSearchParams(window.location.search).has("grid-limit")) {
    definition.nodes[first].responsive[device].width = { value: 100, unit: "px" };
    definition.nodes[first].responsive[device].maxWidth = { value: 50, unit: "%" };
  }
  if (new URLSearchParams(window.location.search).has("anchor-limit")) {
    definition.nodes[first].responsive[device].maxWidth = { value: 50, unit: "%" };
    definition.nodes[first].responsive[device].anchor = { horizontal: "right", vertical: "top", offsetX: { value: -300, unit: "px" }, offsetY: { value: 0, unit: "px" } };
  }
}
definition.nodes[locked].authoring = { structureLocked: true };
definition.nodes[hidden].hidden = true;
definition.metadata.previewDesktopWidth = 900;
if (new URLSearchParams(window.location.search).has("legacy")) definition.schemaVersion = 1;
if (new URLSearchParams(window.location.search).has("schema3")) {
  definition.schemaVersion = 3;
  definition.defaultContent[definition.nodes[first].slotId!] = { src: "/favicon.ico", alt: "默认图片" };
  if (text) definition.defaultContent[definition.nodes[text].slotId!] = "模板默认文字";
}
draft.definition = definition;
useTemplateEditorSession.getState().open(draft);
const initialZoom = Number(new URLSearchParams(window.location.search).get("zoom"));
if (initialZoom) useTemplateEditorSession.getState().setCanvasZoom(initialZoom);

function Fixture() {
  const state = useTemplateEditorSession();
  const [canvasVisible, setCanvasVisible] = React.useState(true);
  return <App><div style={{ width: "100vw", height: "100vh", display: "flex", flexDirection: "column" }}>
    <button data-testid="toggle-canvas" onClick={() => setCanvasVisible((visible) => !visible)}>切换测试画布挂载</button>
    <div><button onClick={() => state.undo()}>撤销</button><button onClick={() => state.redo()}>重做</button>{(["desktop", "tablet", "mobile"] as const).map((bp) => <button key={bp} onClick={() => state.setBreakpoint(bp)}>聚焦{bp}</button>)}</div>
    <output data-testid="state" style={{ display: "none" }}>{JSON.stringify({
      ids: { region, stack, first, second, locked, hidden, text, destination }, rootId: definition.rootNodeId,
      selected: state.selectionSnapshot.targets, scope: state.editingScopeId,
      history: state.historyPast.length, dirty: state.dirty, preview: Boolean(state.previewDocument),
      placement: state.draft?.definition.nodes[first].responsive.desktop.placement,
      firstRules: state.draft?.definition.nodes[first].responsive.desktop,
      stackRules: state.draft?.definition.nodes[stack].responsive.desktop,
      firstSlotRules: state.draft?.definition.slots[definition.nodes[first].slotId!].desktopRules,
      responsive: state.draft?.definition.nodes[stack].responsive,
      rootResponsive: state.draft?.definition.nodes[definition.rootNodeId].responsive,
      childIds: state.draft?.definition.nodes[stack].childIds,
      destinationChildren: destination ? state.draft?.definition.nodes[destination].childIds : [],
      breakpoint: state.breakpoint, previewWidth: state.previewWidth,
      storedWidth: state.draft?.definition.metadata.previewDesktopWidth,
    })}</output>
    {canvasVisible ? <DynamicTemplateCanvas /> : null}
  </div></App>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
