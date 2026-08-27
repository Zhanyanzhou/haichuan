import React, { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import EditorToolbar, {
  VIEWPORT_PRESETS,
} from "../../src/pages/admin/HomepageConfig/components/EditorToolbar";
import AntdProvider from "../../src/components/common/AntdProvider";
import {
  ROOT_ZONE,
  useHomepagePuck,
} from "../../src/pages/admin/HomepageConfig/editor-store";
import "../../src/styles/globals.css";
import "../../src/pages/admin/HomepageConfig/editor.css";

const heroType = "首屏主视觉";
const heroId = "template-internal-hero";

const initialData = {
  content: [
    {
      type: heroType,
      props: {
        id: heroId,
        desktopImage: "/svg/template-hero.svg",
        mobileImage: "/svg/template-hero.svg",
        eyebrow: "",
        title: "测试标题",
        subtitle: "",
        actionText: "",
        targetType: "none",
      },
    },
    {
      type: "文字横幅",
      props: {
        id: "template-internal-text-banner",
        title: "第二个模块",
        subtitle: "用于证明复制、删除和历史操作不依赖后端",
      },
    },
  ],
  root: { props: {} },
};

function SelectableBlock({
  blockId,
  blockType,
  children,
}: {
  blockId: string;
  blockType: string;
  children: ReactNode;
}) {
  const appData = useHomepagePuck((state) => state.appState.data);
  const dispatch = useHomepagePuck((state) => state.dispatch);
  const selectedItem = useHomepagePuck((state) => state.selectedItem);
  const index = appData.content.findIndex(
    (block) => String(block.props?.id ?? "") === blockId,
  );

  return (
    <CanvasBlockInteractionBoundary
      blockId={blockId}
      blockType={blockType}
      blockLabel={blockType}
      focused={String(selectedItem?.props?.id ?? "") === blockId}
      onSelect={() => {
        if (index < 0) return;
        dispatch({
          type: "setUi",
          ui: { itemSelector: { index, zone: ROOT_ZONE } },
          recordHistory: false,
        });
      }}
    >
      {children}
    </CanvasBlockInteractionBoundary>
  );
}

function FixtureControls() {
  const [previewMode, setPreviewMode] = useState(false);
  const appData = useHomepagePuck((state) => state.appState.data);
  const viewports = useHomepagePuck((state) => state.appState.ui.viewports);
  const dispatch = useHomepagePuck((state) => state.dispatch);
  const selectedItem = useHomepagePuck((state) => state.selectedItem);
  const dataRef = useRef(appData);
  const visualEditStartRef = useRef<typeof appData>();
  const panelMode = useVisualEditorSession((state) => state.panelMode);
  const selection = useVisualEditorSession((state) => state.selection);
  const setPanelMode = useVisualEditorSession((state) => state.setPanelMode);
  const viewportWidth = typeof viewports.current.width === "number"
    ? viewports.current.width
    : 1920;
  const previewScale = Math.min(1, 1160 / viewportWidth);
  dataRef.current = appData;

  useEffect(() => {
    const onVisualEdit = (event: MessageEvent<CanvasVisualEditMessage>) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== CANVAS_VISUAL_EDIT_MESSAGE) return;
      if (event.data.cancelled === true) {
        const start = visualEditStartRef.current;
        visualEditStartRef.current = undefined;
        if (start) dispatch({ type: "setData", data: start, recordHistory: false });
        return;
      }
      const current = dataRef.current;
      const index = current.content.findIndex(
        (block) => String(block.props?.id ?? "") === event.data.blockId,
      );
      if (index < 0) return;
      if (event.data.transient === true && !visualEditStartRef.current) {
        visualEditStartRef.current = structuredClone(current);
      }
      if (event.data.transient !== true) visualEditStartRef.current = undefined;
      const block = current.content[index];
      dispatch({
        type: "replace",
        destinationIndex: index,
        destinationZone: ROOT_ZONE,
        data: {
          ...block,
          props: {
            ...block.props,
            __instanceOverrides: event.data.overrides,
          },
        },
        recordHistory: event.data.transient !== true,
      });
    };
    window.addEventListener("message", onVisualEdit);
    return () => window.removeEventListener("message", onVisualEdit);
  }, [dispatch]);

  return (
    <>
      <EditorToolbar
        pageKey="home"
        publishing={false}
        saving={false}
        hasPendingDraft={false}
        viewingPublished={false}
        previewMode={previewMode}
        hasUnsavedChanges={false}
        publishValidationState="current"
        publishErrorCount={0}
        draftSavedAtLabel={null}
        onPublish={() => undefined}
        onSaveDraft={() => undefined}
        onExitViewing={() => undefined}
        onEditPendingDraft={() => undefined}
        onViewPublishedVersion={() => undefined}
        onDiscardDraft={() => undefined}
        onOpenRevisions={() => undefined}
        onOpenPageSettings={() => undefined}
        onPreviewModeChange={setPreviewMode}
        onDataChange={() => undefined}
      />
      <section className="template-internal-fixture__inspector" aria-label="视觉对象属性测试区">
        <p role="note">
          真实产品组件集成夹具；不调用保存、发布或后端接口。
        </p>
        <div role="tablist" aria-label="编辑类型">
          <button
            type="button"
            role="tab"
            aria-selected={panelMode === "content"}
            onClick={() => setPanelMode("content")}
          >
            内容编辑
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={panelMode === "design"}
            onClick={() => setPanelMode("design")}
          >
            模板编辑
          </button>
        </div>
        <VisualEditorToolbar
          blockId={heroId}
          moduleType={heroType}
          panelMode={panelMode}
        />
        <output data-testid="selected-module-state">
          {selectedItem ? String(selectedItem.props?.id ?? "未选模块") : "未选模块"}
        </output>
        <output data-testid="selected-visual-state">
          {selection
            ? `${selection.blockId}:${selection.nodeId}:${selection.kind}`
            : "未选对象"}
        </output>
        <output data-testid="viewport-state">
          {typeof viewports.current.width === "number" && viewports.current.width <= 480
            ? "mobile"
            : "desktop"}
        </output>
        <output data-testid="preview-state">{previewMode ? "preview" : "edit"}</output>
        <pre data-testid="fixture-data-state">{JSON.stringify(appData)}</pre>
      </section>
      <section className="template-internal-fixture__canvas" aria-label="真实 Puck 模块画布">
        <div
          data-testid="fixture-canvas-viewport"
          style={{
            width: `${viewportWidth}px`,
            transform: `scale(${previewScale})`,
            transformOrigin: "top left",
          }}
        >
          <Puck.Preview />
        </div>
      </section>
    </>
  );
}

function TemplateInternalEditorFixture() {
  const editorConfig = useMemo(
    () => ({
      ...puckConfig,
      components: Object.fromEntries(
        Object.entries(puckConfig.components).map(([componentType, componentConfig]) => {
          const render = componentConfig.render as (
            props: Record<string, unknown>,
          ) => React.ReactNode;
          return [
            componentType,
            {
              ...componentConfig,
              render: (props: Record<string, unknown>) => (
                <SelectableBlock
                  blockId={String(props.id ?? "")}
                  blockType={componentType}
                >
                  {render(props)}
                </SelectableBlock>
              ),
            },
          ];
        }),
      ),
    }),
    [],
  );

  return (
    <main className="template-internal-fixture">
      <Puck
        config={editorConfig as any}
        data={initialData as any}
        viewports={VIEWPORT_PRESETS}
        permissions={{ drag: false }}
        iframe={{ enabled: true, waitForStyles: true, syncHostStyles: true }}
      >
        <FixtureControls />
      </Puck>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <AntdProvider>
    <TemplateInternalEditorFixture />
  </AntdProvider>,
);
