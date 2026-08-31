import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Puck } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import { puckConfig } from "../../src/page-builder/config/puckConfig";
import {
  CANVAS_VISUAL_EDIT_MESSAGE,
  type CanvasVisualEditMessage,
  useVisualEditorSession,
} from "../../src/page-builder/visual-editor/visualEditorSession";
import VisualEditorToolbar from "../../src/page-builder/visual-editor/VisualEditorToolbar";
import CanvasBlockInteractionBoundary from "../../src/pages/admin/HomepageConfig/components/CanvasBlockInteractionBoundary";
import "../../src/styles/globals.css";
import "../../src/pages/admin/HomepageConfig/editor.css";

const moduleType = "首屏主视觉";
const blockId = "puck-hero-visual-test";
const data = {
  content: [
    {
      type: moduleType,
      props: {
        id: blockId,
        desktopImage: "/svg/template-hero.svg",
        mobileImage: "/svg/template-hero.svg",
        title: "",
        eyebrow: "",
        subtitle: "",
        actionText: "",
        targetType: "none",
      },
    },
    {
      type: "文字横幅",
      props: {
        id: "puck-text-banner-order-test",
        title: "顺序保护测试",
        subtitle: "槽位调整不得改变模块顺序",
      },
    },
    {
      type: "产品展示行",
      props: {
        id: "puck-product-row-visual-test",
        title: "精选作品",
        subtitle: "",
        productIds: [],
        productCodes: [],
        layout: "grid-3",
        mobileColumns: 2,
        displayMode: "standard",
        actionStyle: "text",
        bgColor: "#FFFFFF",
        showPrice: true,
        showButton: false,
        buttonText: "查看详情",
      },
    },
  ],
  root: { props: {} },
};

function PuckVisualEditorFixture() {
  const [overrides, setOverrides] = useState<Record<string, unknown> | undefined>();
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null);
  const selectedBlockRef = useRef<string | null>(null);
  const [blockSelectionCount, setBlockSelectionCount] = useState(0);
  const [contentOrder, setContentOrder] = useState(
    data.content.map((block) => block.props.id),
  );
  const panelMode = useVisualEditorSession((state) => state.panelMode);
  const visualSelection = useVisualEditorSession((state) => state.selection);
  const visualMode = useVisualEditorSession((state) => state.mode);
  const setPanelMode = useVisualEditorSession((state) => state.setPanelMode);

  const editorConfig = useMemo(() => ({
    ...puckConfig,
    components: Object.fromEntries(
      Object.entries(puckConfig.components).map(([componentType, componentConfig]) => {
        const render = componentConfig.render as (props: Record<string, unknown>) => React.ReactNode;
        return [
          componentType,
          {
            ...componentConfig,
            render: (props: Record<string, unknown>) => (
              <CanvasBlockInteractionBoundary
                blockId={String(props.id ?? "")}
                blockType={componentType}
                blockLabel={componentType}
                selected={selectedBlockRef.current === String(props.id ?? "")}
                allowNodeSelection
                onSelect={() => {
                  const nextBlockId = String(props.id ?? "");
                  selectedBlockRef.current = nextBlockId;
                  setSelectedBlock(nextBlockId);
                  setBlockSelectionCount((count) => count + 1);
                }}
              >
                {render(props)}
              </CanvasBlockInteractionBoundary>
            ),
          },
        ];
      }),
    ),
  }), []);

  useEffect(() => {
    const onMessage = (event: MessageEvent<CanvasVisualEditMessage>) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== CANVAS_VISUAL_EDIT_MESSAGE) return;
      if (event.data.blockId !== blockId || event.data.moduleType !== moduleType) return;
      setOverrides(event.data.overrides);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <main className="puck-visual-fixture">
      <aside>
        <div role="tablist" aria-label="编辑类型">
          <button type="button" role="tab" aria-selected={panelMode === "content"} onClick={() => setPanelMode("content")}>内容编辑</button>
          <button type="button" role="tab" aria-selected={panelMode === "design"} onClick={() => setPanelMode("design")}>模板编辑</button>
        </div>
        <VisualEditorToolbar blockId={blockId} moduleType={moduleType} panelMode={panelMode} />
        <output data-testid="selected-block-state">
          {selectedBlock ? `已选择模块：${selectedBlock}` : "未选择模块"}
        </output>
        <output data-testid="block-selection-count">{blockSelectionCount}</output>
        <output data-testid="selected-visual-state">
          {visualSelection ? `${visualSelection.blockId}:${visualSelection.nodeId}:${visualMode}` : "未选择对象"}
        </output>
        <output data-testid="content-order-state">{contentOrder.join(",")}</output>
        <pre data-testid="puck-visual-state">{JSON.stringify(overrides ?? null)}</pre>
      </aside>
      <section className="puck-visual-stage" aria-label="缩放后的中央画布">
        <div className="puck-visual-canvas">
          <Puck
            config={editorConfig as any}
            data={data as any}
            permissions={{ drag: false }}
            onChange={(nextData) => {
              setContentOrder(nextData.content.map((block) => String(block.props.id)));
            }}
            iframe={{ enabled: true, waitForStyles: true, syncHostStyles: true }}
          >
            <Puck.Preview />
          </Puck>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<PuckVisualEditorFixture />);
