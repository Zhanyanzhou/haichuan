import React from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import { App } from "antd";
import TemplateNativeDesignControls from "../../src/page-builder/template-editor/TemplateNativeDesignControls";
import { useTemplateEditorSession } from "../../src/page-builder/template-editor/templateEditorSession";
import { createNewDynamicTemplateDraft } from "../../src/page-builder/template-editor/dynamicTemplateDraftRepository";
import { addDynamicTemplateNode, DynamicTemplateRenderer } from "../../src/page-builder/template-definition";
import { setTemplateNodeRule } from "../../src/page-builder/template-definition/responsive";
import "../../src/styles/globals.css";
import "../../src/pages/admin/HomepageConfig/editor.css";
import "../../src/page-builder/template-editor/TemplateWorkspace.css";

const draft = createNewDynamicTemplateDraft("隔离响应式属性验收");
let definition = draft.definition;
function add(parentId: string, type: Parameters<typeof addDynamicTemplateNode>[2]) {
  const result = addDynamicTemplateNode(definition, parentId, type);
  definition = result.definition;
  return result.nodeId;
}
const region = add(definition.rootNodeId, "Grid");
const cards = Array.from({ length: 3 }, () => add(region, "ImageSlot"));
const headingRegion = add(definition.rootNodeId, "Container");
const heading = add(headingRegion, "HeadingSlot");
setTemplateNodeRule(definition, region, "desktop", "columns", [1, 1, 1]);
setTemplateNodeRule(definition, region, "tablet", "columns", [1, 1]);
setTemplateNodeRule(definition, region, "mobile", "columns", [1]);
for (const id of cards) setTemplateNodeRule(definition, id, "desktop", "height", { mode: "fixed", value: { value: 100, unit: "px" } });
draft.definition = definition;
useTemplateEditorSession.getState().open(draft);
const content = Object.fromEntries(cards.map((id) => [definition.nodes[id].slotId!, { src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='100'%3E%3Crect width='200' height='100' fill='%23DDE1E2'/%3E%3C/svg%3E", alt: "中性测试图" }]));
const renderedContent = { ...content, [definition.nodes[heading].slotId!]: "中性测试文字" };
function Fixture() {
  const state = useTemplateEditorSession();
  const [ids, select] = React.useState([region]);
  const [override, setOverride] = React.useState(false);
  const [isolated, setIsolated] = React.useState(false);
  const [frameDocument, setFrameDocument] = React.useState<Document | null>(null);
  const mountFrameContent = (element: HTMLIFrameElement) => {
    // 固定复现 load 后测量先于 Portal 挂载的时序，而不是依赖运行机器快慢。
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      if (element.isConnected) setFrameDocument(element.contentDocument);
    }));
  };
  const rendering = <DynamicTemplateRenderer definition={state.previewDocument ?? state.draft!.definition} device={state.device} breakpoint={state.breakpoint} contentBySlotId={renderedContent} layoutOverridesByNodeId={override ? { [cards[0]]: { desktop: { focusXPercent: 27 } } } : undefined} showEmptySlots />;
  return <App><main style={{ display: "grid", gridTemplateColumns: "1fr 350px", height: "100vh" }}>
    <section><nav>{(["desktop", "tablet", "mobile"] as const).map((bp) => <button key={bp} onClick={() => state.setBreakpoint(bp)}>{bp}</button>)}
      <button onClick={() => select([region])}>选择网格</button><button onClick={() => select([cards[0]])}>选择图片</button><button onClick={() => select(cards)}>多选图片</button>
      <button onClick={() => select([region, cards[0]])}>混选网格和图片</button>
      <button onClick={() => select([heading])}>选择标题</button>
      <button onClick={() => select([definition.rootNodeId])}>选择根容器</button>
      <button onClick={() => { state.executeCommand({ type: "update-definition", label: "建立 display none 验收前置", update: (next) => setTemplateNodeRule(next, cards[0], "mobile", "display", "none") }); state.setBreakpoint("mobile"); select([cards[0]]); }}>建立本端隐藏前置</button>
      <button onClick={() => { state.executeCommand({ type: "update-definition", label: "建立结构隐藏验收前置", update: (next) => { next.nodes[cards[0]].hidden = true; } }); select([cards[0]]); }}>建立结构隐藏前置</button>
      <button onClick={() => { setFrameDocument(null); setIsolated(!isolated); }}>切换隔离画布</button>
      <button onClick={() => { state.executeCommand({ type: "update-definition", label: "已有合法策略验收前置", update: (next) => {
        setTemplateNodeRule(next, cards[0], "desktop", "height", { mode: "viewport", value: { value: 50, unit: "vh" } });
        setTemplateNodeRule(next, region, "desktop", "display", "flex");
        setTemplateNodeRule(next, region, "desktop", "justifyContent", "space-around");
      } }); }}>建立已有策略前置</button>
      <button onClick={() => state.executeCommand({ type: "update-definition", label: "继承冲突验收前置", update: (next) => {
        setTemplateNodeRule(next, region, "tablet", "width", "fit");
        for (const id of cards) setTemplateNodeRule(next, id, "tablet", "width", { value: 100, unit: "px" });
      } })}>建立继承冲突前置</button>
      <button onClick={() => state.executeCommand({ type: "update-definition", label: "纵向 Flex 验收前置", update: (next) => { setTemplateNodeRule(next, region, "desktop", "display", "flex"); setTemplateNodeRule(next, region, "desktop", "direction", "column"); } })}>纵向Flex测试</button>
      <button onClick={() => state.undo()}>撤销</button><button onClick={() => state.redo()}>重做</button>
      <button onClick={() => { state.executeCommand({ type: "update-definition", label: "建立锚点验收上下文", update: (next) => {
        setTemplateNodeRule(next, region, "desktop", "height", { mode: "fixed", value: { value: 500, unit: "px" } });
        setTemplateNodeRule(next, region, "desktop", "padding", Object.fromEntries(["top", "right", "bottom", "left"].map((side) => [side, { value: 40, unit: "px" }])));
        setTemplateNodeRule(next, cards[0], "desktop", "width", { value: 100, unit: "px" });
        setTemplateNodeRule(next, cards[0], "desktop", "anchor", { horizontal: "left", vertical: "top", offsetX: { value: 0, unit: "px" }, offsetY: { value: 0, unit: "px" } });
      } }); setOverride(true); }}>建立锚点测试</button>
    </nav><div data-testid="render" style={{ fontSize: 24, fontWeight: 500, lineHeight: "36px" }}>{isolated ? <><iframe className="template-editor__viewport-frame" title="属性计算值隔离验收" srcDoc="<!doctype html><html><body><div id='render'></div></body></html>" style={{ position: "static", display: "block", width: "100%", height: 500 }} onLoad={(event) => mountFrameContent(event.currentTarget)} />{frameDocument?.getElementById("render") ? createPortal(<div style={{ fontSize: 36, lineHeight: "48px", fontWeight: 600 }}>{rendering}</div>, frameDocument.getElementById("render")!) : null}</> : rendering}</div>
    <output hidden data-testid="state">{JSON.stringify({ definition: state.draft!.definition, preview: Boolean(state.previewDocument), dirty: state.dirty, history: state.historyPast.length, ids: { region, cards, heading } })}</output>
    </section><aside style={{ overflow: "auto", padding: 16 }}><TemplateNativeDesignControls nodeIds={ids} /></aside>
  </main></App>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
