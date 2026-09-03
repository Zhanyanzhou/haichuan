import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import DoublePosterSection from "../../src/components/blocks/DoublePosterSection";
import InstanceOverridesPanel from "../../src/page-builder/inspector/InstanceOverridesPanel";
import ContentTemplateContractFrame from "../../src/page-builder/runtime/ContentTemplateContractFrame";
import {
  CANVAS_VISUAL_EDIT_MESSAGE,
  type CanvasVisualEditMessage,
  useVisualEditorSession,
} from "../../src/page-builder/visual-editor/visualEditorSession";
import VisualEditorToolbar from "../../src/page-builder/visual-editor/VisualEditorToolbar";
import "../../src/styles/globals.css";
import "../../src/pages/admin/HomepageConfig/editor.css";

const moduleType = "双图海报";
const blockId = "double-poster-visual-test";

function VisualEditorDoublePosterFixture() {
  const [props, setProps] = useState<Record<string, any>>({
    id: blockId,
    mainImage: "/svg/template-double-poster-main.svg",
    detailImage: "/svg/template-double-poster-detail.svg",
    mainAltText: "主海报测试图",
    detailAltText: "细节海报测试图",
    number: "02",
    label: "COLLECTION",
    title: "双图关系测试",
    description: "文字和行动必须跟随细节图所在的受控侧栏。",
    actionText: "查看系列",
    targetType: "page",
    linkUrl: "/products",
    mainFocusX: 50,
    mainFocusY: 50,
    detailFocusX: 50,
    detailFocusY: 50,
  });

  useEffect(() => {
    const onMessage = (event: MessageEvent<CanvasVisualEditMessage>) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== CANVAS_VISUAL_EDIT_MESSAGE) return;
      if (event.data.blockId !== blockId || event.data.moduleType !== moduleType) return;
      setProps((current) => ({ ...current, __instanceOverrides: event.data.overrides }));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const update = (patch: Record<string, any>) => setProps((current) => ({ ...current, ...patch }));
  const updateFromCurrent = (
    factory: (current: Record<string, any>) => Record<string, any>,
  ) => setProps((current) => ({ ...current, ...factory(current) }));
  const updateHistoryTransaction = (
    patchOrFactory: Record<string, any> | ((current: Record<string, any>) => Record<string, any>),
  ) => setProps((current) => ({
    ...current,
    ...(typeof patchOrFactory === "function" ? patchOrFactory(current) : patchOrFactory),
  }));
  const panelMode = useVisualEditorSession((state) => state.panelMode);
  const selection = useVisualEditorSession((state) => state.selection);
  const setPanelMode = useVisualEditorSession((state) => state.setPanelMode);
  const clearNode = useVisualEditorSession((state) => state.clearNode);
  const currentSelection = selection?.blockId === blockId ? selection : null;
  const pageModule = {
    id: blockId,
    moduleType,
    content: props,
    styleConfig: props,
    layoutConfig: props,
  } as any;

  return (
    <main className="visual-editor-double-fixture">
      <aside aria-label="属性面板测试区">
        <div role="tablist" aria-label="编辑类型">
          <button type="button" role="tab" aria-selected={panelMode === "content"} onClick={() => setPanelMode("content")}>内容编辑</button>
          <button type="button" role="tab" aria-selected={panelMode === "design"} onClick={() => setPanelMode("design")}>模板编辑</button>
        </div>
        <VisualEditorToolbar blockId={blockId} moduleType={moduleType} panelMode={panelMode} />
        {currentSelection ? <button type="button" onClick={() => clearNode(blockId)}>返回模块级</button> : null}
        {panelMode === "design" ? (
          <InstanceOverridesPanel
            moduleType={moduleType}
            props={props}
            updateFromCurrent={updateFromCurrent}
            updateHistoryTransaction={updateHistoryTransaction}
            historyTransactionPending={false}
            scopes={currentSelection ? ["slots"] : ["layout"]}
            selectedNodeId={currentSelection?.nodeId}
            resetAllDesign={!currentSelection}
            viewport="desktop"
          />
        ) : null}
        <pre data-testid="visual-state">{JSON.stringify(props.__instanceOverrides ?? null)}</pre>
        <output data-testid="content-state">{`${props.mainImage}|${props.detailImage}|${props.title}`}</output>
      </aside>
      <section aria-label="中央画布测试区" className="visual-editor-double-fixture__canvas">
        <ContentTemplateContractFrame moduleType={moduleType} mode="editor" props={props}>
          <DoublePosterSection module={pageModule} editMode />
        </ContentTemplateContractFrame>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<VisualEditorDoublePosterFixture />);
