import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "antd";
import TemplateNativeResponsiveControls from "../../src/page-builder/template-editor/TemplateNativeResponsiveControls";
import { getNativeDesignProperties } from "../../src/page-builder/template-editor/TemplateNativeDesignControls";
import { useTemplateEditorSession } from "../../src/page-builder/template-editor/templateEditorSession";
import { createNewDynamicTemplateDraft } from "../../src/page-builder/template-editor/dynamicTemplateDraftRepository";
import { addDynamicTemplateNode, DynamicTemplateRenderer } from "../../src/page-builder/template-definition";
import { setTemplateNodeRule, setTemplateSlotRule } from "../../src/page-builder/template-definition/responsive";
import "../../src/styles/globals.css";
import "../../src/pages/admin/HomepageConfig/editor.css";
import "../../src/page-builder/template-editor/TemplateWorkspace.css";

const draft = createNewDynamicTemplateDraft("响应式分组确定性验收");
let definition = draft.definition;
function add(parentId: string, type: Parameters<typeof addDynamicTemplateNode>[2]) {
  const result = addDynamicTemplateNode(definition, parentId, type);
  definition = result.definition; return result.nodeId;
}
const grid = add(definition.rootNodeId, "Grid");
const image = add(grid, "ImageSlot");
const container = add(definition.rootNodeId, "Container");
const heading = add(container, "HeadingSlot");
const locked = add(definition.rootNodeId, "Grid");
const slotId = definition.nodes[heading].slotId!;
for (const [bp, columns, gap, font] of [["desktop", 3, 24, 32], ["tablet", 2, 12, 24], ["mobile", 1, 6, 18]] as const) {
  setTemplateNodeRule(definition, grid, bp, "columns", Array.from({ length: columns }, () => 1));
  setTemplateNodeRule(definition, grid, bp, "gap", { value: gap, unit: "px" });
  setTemplateSlotRule(definition, slotId, bp, "fontSize", { value: font, unit: "px" });
}
setTemplateNodeRule(definition, container, "mobile", "width", "fit");
setTemplateNodeRule(definition, heading, "mobile", "width", { value: 180, unit: "px" });
setTemplateNodeRule(definition, image, "desktop", "height", { mode: "fixed", value: { value: 80, unit: "px" } });
setTemplateNodeRule(definition, locked, "desktop", "columns", [1, 1, 1]);
setTemplateNodeRule(definition, locked, "tablet", "columns", [1]);
definition.nodes[locked].authoring = { structureLocked: true };
draft.definition = definition;
useTemplateEditorSession.getState().open(draft);

function Fixture() {
  const state = useTemplateEditorSession();
  const [ids, setIds] = React.useState([grid]);
  return <App><main style={{ padding: 16 }}>
    <nav>{(["desktop", "tablet", "mobile"] as const).map((bp) => <button key={bp} onClick={() => state.setBreakpoint(bp)}>{bp}</button>)}
      <button onClick={() => setIds([grid])}>选择网格</button><button onClick={() => setIds([heading])}>选择标题</button>
      <button onClick={() => setIds([grid, locked])}>多选含锁定网格</button>
      <button onClick={() => { state.executeCommand({ type: "update-definition", label: "测试前置修改", update: (next) => {
        setTemplateNodeRule(next, grid, "mobile", "gap", { value: 99, unit: "px" });
        setTemplateNodeRule(next, grid, "mobile", "height", { mode: "fixed", value: { value: 260, unit: "px" } });
        setTemplateNodeRule(next, grid, "mobile", "padding.top", { value: 33, unit: "px" });
      } }); }}>修改手机间距和高度</button>
      <button onClick={() => state.open(draft, { isNew: true })}>无保存基线</button>
      <button onClick={() => state.undo()}>撤销</button><button onClick={() => state.redo()}>重做</button>
    </nav>
    <aside className="template-editor__native-design" style={{ width: 240 }}><TemplateNativeResponsiveControls nodeIds={ids} getProperties={getNativeDesignProperties} /></aside>
    <div data-testid="render"><DynamicTemplateRenderer definition={state.draft!.definition} device={state.device} breakpoint={state.breakpoint} contentBySlotId={{ [slotId]: "中性测试标题" }} /></div>
    <output hidden data-testid="state">{JSON.stringify({ definition: state.draft!.definition, history: state.historyPast.length, dirty: state.dirty, ids: { grid, image, container, heading, locked } })}</output>
  </main></App>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
