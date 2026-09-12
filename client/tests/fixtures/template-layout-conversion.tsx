import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "antd";
import TemplateLayoutConversionControls from "../../src/page-builder/template-editor/TemplateLayoutConversionControls";
import { createTemplateColumnResizeCommand } from "../../src/page-builder/template-editor/templateLayoutIntent";
import { useTemplateEditorSession } from "../../src/page-builder/template-editor/templateEditorSession";
import { createNewDynamicTemplateDraft } from "../../src/page-builder/template-editor/dynamicTemplateDraftRepository";
import { addDynamicTemplateNode, DynamicTemplateRenderer } from "../../src/page-builder/template-definition";
import { setTemplateNodeRule } from "../../src/page-builder/template-definition/responsive";
import "../../src/styles/globals.css";
import "../../src/page-builder/template-editor/TemplateWorkspace.css";

const draft = createNewDynamicTemplateDraft("隔离排列转换验收");
let definition = draft.definition;
const add = (parent: string, type: Parameters<typeof addDynamicTemplateNode>[2]) => { const result = addDynamicTemplateNode(definition, parent, type); definition = result.definition; return result.nodeId; };
const stack = add(definition.rootNodeId, "Stack");
const cards = [add(stack, "ImageSlot"), add(stack, "ImageSlot"), add(stack, "ImageSlot")];
for (const node of Object.values(definition.nodes)) node.responsive.mobile = {};
setTemplateNodeRule(definition, stack, "desktop", "height", { mode: "fixed", value: { value: 450, unit: "px" } });
setTemplateNodeRule(definition, stack, "desktop", "gap", { value: 12, unit: "px" });
setTemplateNodeRule(definition, stack, "desktop", "direction", "row");
setTemplateNodeRule(definition, stack, "desktop", "padding", Object.fromEntries(["top", "right", "bottom", "left"].map((side) => [side, { value: 24, unit: "px" }])));
for (const id of cards) { setTemplateNodeRule(definition, id, "desktop", "width", { value: 120, unit: "px" }); setTemplateNodeRule(definition, id, "desktop", "height", { mode: "fixed", value: { value: 100, unit: "px" } }); }
draft.definition = definition;
useTemplateEditorSession.getState().open(draft);
function Fixture() {
  const state = useTemplateEditorSession();
  const [show, setShow] = React.useState(true);
  return <App><main style={{ display: "grid", gridTemplateColumns: "750px 360px", height: "100vh" }}><section><nav>{(["desktop", "tablet", "mobile"] as const).map((bp) => <button key={bp} onClick={() => state.setBreakpoint(bp)}>{bp}</button>)}<button onClick={() => state.undo()}>撤销</button><button onClick={() => state.redo()}>重做</button><button onClick={() => setShow(!show)}>切换画布呈现</button><button onClick={() => state.executeCommand(createTemplateColumnResizeCommand(state.draft!.definition, stack, state.breakpoint, 0, 100, 600))}>模拟列分隔线意图</button><button onClick={() => { const copy = JSON.parse(JSON.stringify(state.draft)); state.open(copy); }}>保存格式往返</button></nav>
    {show ? <div data-canvas-focus-breakpoint={state.breakpoint}><DynamicTemplateRenderer definition={state.previewDocument ?? state.draft!.definition} device={state.device} breakpoint={state.breakpoint} showEmptySlots /></div> : null}
    <output hidden data-testid="state">{JSON.stringify({ definition: state.draft!.definition, history: state.historyPast.length, preview: Boolean(state.previewDocument), dirty: state.dirty, stack, cards })}</output></section><aside style={{ overflow: "auto", padding: 16 }}><TemplateLayoutConversionControls nodeId={stack} /></aside></main></App>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
