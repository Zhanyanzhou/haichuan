import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import HeroSection from "../../src/components/blocks/HeroSection";
import InstanceOverridesPanel from "../../src/page-builder/inspector/InstanceOverridesPanel";
import ContentTemplateContractFrame from "../../src/page-builder/runtime/ContentTemplateContractFrame";
import MediaPickerField from "../../src/page-builder/fields/MediaPickerField";
import { IMAGE_SPECS } from "../../src/page-builder/config/imageSpecs";
import {
  CANVAS_VISUAL_EDIT_MESSAGE,
  type CanvasVisualEditMessage,
  useVisualEditorSession,
} from "../../src/page-builder/visual-editor/visualEditorSession";
import VisualEditorToolbar from "../../src/page-builder/visual-editor/VisualEditorToolbar";
import "../../src/styles/globals.css";
import "../../src/pages/admin/HomepageConfig/editor.css";

const moduleType = "首屏主视觉";
const blockId = "hero-visual-test";

function VisualEditorHeroFixture() {
  const [props, setProps] = useState<Record<string, any>>({
    id: blockId,
    desktopImage: "/svg/template-hero.svg",
    mobileImage: "/svg/template-hero.svg",
    title: "",
    eyebrow: "",
    subtitle: "",
    actionText: "",
    targetType: "none",
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
  const selectNode = useVisualEditorSession((state) => state.selectNode);
  const setVisualMode = useVisualEditorSession((state) => state.setMode);
  const currentSelection = selection?.blockId === blockId ? selection : null;
  const pageModule = {
    id: blockId,
    moduleType,
    content: props,
    styleConfig: props,
    layoutConfig: props,
  } as any;

  return (
    <main className="visual-editor-fixture">
      <aside aria-label="属性面板测试区">
        <div role="tablist" aria-label="编辑类型">
          <button type="button" role="tab" aria-selected={panelMode === "content"} onClick={() => setPanelMode("content")}>内容编辑</button>
          <button type="button" role="tab" aria-selected={panelMode === "design"} onClick={() => setPanelMode("design")}>模板编辑</button>
        </div>
        <VisualEditorToolbar blockId={blockId} moduleType={moduleType} panelMode={panelMode} />
        {currentSelection ? <button type="button" onClick={() => clearNode(blockId)}>返回模块级</button> : null}
        {panelMode === "content" ? (
          <section aria-label="内容编辑测试区">
            <MediaPickerField
              fieldKey="desktopImage"
              device="desktop"
              value={props.desktopImage}
              onChange={(desktopImage) => update({ desktopImage })}
              spec={IMAGE_SPECS.hero.desktop}
              required
              previewAspectRatio="16 / 9"
            />
            <button
              type="button"
              onClick={() => {
                selectNode({ blockId, moduleType, nodeId: "desktopImage", kind: "media" });
                setPanelMode("design");
                setVisualMode("adjust-media");
              }}
            >
              在画布中调整构图
            </button>
          </section>
        ) : null}
        {panelMode === "design" ? (
          <InstanceOverridesPanel
            moduleType={moduleType}
            props={props}
            updateFromCurrent={updateFromCurrent}
            updateHistoryTransaction={updateHistoryTransaction}
            historyTransactionPending={false}
            scopes={currentSelection?.kind === "media" ? ["slots"] : currentSelection?.kind === "text" ? ["text"] : ["layout"]}
            selectedNodeId={currentSelection?.nodeId}
            resetAllDesign={!currentSelection}
            viewport="desktop"
          />
        ) : null}
        <pre data-testid="visual-state">{JSON.stringify(props.__instanceOverrides ?? null)}</pre>
      </aside>
      <section aria-label="中央画布测试区" className="visual-editor-fixture__canvas">
        <ContentTemplateContractFrame moduleType={moduleType} mode="editor" props={props}>
          <HeroSection module={pageModule} editMode />
        </ContentTemplateContractFrame>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<VisualEditorHeroFixture />);
