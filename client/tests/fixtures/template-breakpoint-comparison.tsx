import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import TemplateBreakpointComparison from "../../src/page-builder/template-editor/TemplateBreakpointComparison";
import { createNewDynamicTemplateDraft } from "../../src/page-builder/template-editor/dynamicTemplateDraftRepository";
import { addDynamicTemplateNode } from "../../src/page-builder/template-definition";
import { setTemplateNodeRule, type TemplateBreakpoint } from "../../src/page-builder/template-definition/responsive";
import "../../src/styles/globals.css";
const draft = createNewDynamicTemplateDraft("三视图隔离测试");
let definition = draft.definition;
const grid = addDynamicTemplateNode(definition, definition.rootNodeId, "Grid");
definition = grid.definition;
const cards: string[] = [];
for (let index = 0; index < 3; index += 1) {
  const child = addDynamicTemplateNode(definition, grid.nodeId, "ImageSlot");
  definition = child.definition;
  cards.push(child.nodeId);
  setTemplateNodeRule(definition, child.nodeId, "desktop", "height", { mode: "fixed", value: { value: 120, unit: "px" } });
}
setTemplateNodeRule(definition, grid.nodeId, "desktop", "columns", [1, 1, 1]);
setTemplateNodeRule(definition, grid.nodeId, "tablet", "columns", [1, 1]);
setTemplateNodeRule(definition, grid.nodeId, "mobile", "columns", [1]);
setTemplateNodeRule(definition, cards[0], "mobile", "hidden", true);
const original = JSON.stringify(definition);
const content = Object.fromEntries(cards.map((id) => [definition.nodes[id].slotId!, { src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10'/%3E", alt: "并排测试图片" }]));
function Fixture() {
  const [selected, select] = useState(cards[0]);
  const [focus, setFocus] = useState<TemplateBreakpoint>("desktop");
  return <><TemplateBreakpointComparison definition={definition} contentBySlotId={content} selectedNodeId={selected} onFocus={(bp, id) => { setFocus(bp); if (id) select(id); }} />
    <output data-testid="comparison-state" hidden>{JSON.stringify({ grid: grid.nodeId, cards, selected, focus, unchanged: original === JSON.stringify(definition) })}</output></>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
