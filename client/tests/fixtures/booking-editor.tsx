import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import AppointmentBlock from "../../src/components/blocks/AppointmentBlock";
import FieldRenderer from "../../src/page-builder/inspector/FieldRenderer";
import InstanceOverridesPanel from "../../src/page-builder/inspector/InstanceOverridesPanel";
import { appointmentSchema } from "../../src/page-builder/inspector/schema/modules/appointment";
import ContentTemplateContractFrame from "../../src/page-builder/runtime/ContentTemplateContractFrame";
import {
  CANVAS_VISUAL_EDIT_MESSAGE,
  type CanvasVisualEditMessage,
  useVisualEditorSession,
} from "../../src/page-builder/visual-editor/visualEditorSession";
import VisualEditorToolbar from "../../src/page-builder/visual-editor/VisualEditorToolbar";
import "../../src/styles/globals.css";
import "../../src/pages/admin/HomepageConfig/editor.css";

const moduleType = "预约入口";
const blockId = "booking-editor-test";

function BookingEditorFixture() {
  const setPanelMode = useVisualEditorSession((state) => state.setPanelMode);
  const [props, setProps] = useState<Record<string, any>>({
    id: blockId,
    backgroundImage: "/svg/template-hero.svg",
    title: "预约鉴赏",
    subtitle: "一对一珠宝顾问，为您安排专属服务",
    buttonText: "立即预约",
    targetType: "url",
    linkUrl: "/contact",
    phone: "+86 400-800-1234",
    altText: "预约鉴赏背景",
    desktopFocusX: 50,
    desktopFocusY: 50,
    mobileFocusX: 50,
    mobileFocusY: 50,
  });

  useEffect(() => {
    setPanelMode("design");
    const onMessage = (event: MessageEvent<CanvasVisualEditMessage>) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== CANVAS_VISUAL_EDIT_MESSAGE) return;
      if (event.data.blockId !== blockId || event.data.moduleType !== moduleType) return;
      setProps((current) => ({ ...current, __instanceOverrides: event.data.overrides }));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [setPanelMode]);

  const update = (patch: Record<string, any>) =>
    setProps((current) => ({ ...current, ...patch }));
  const ctx = { props, device: "desktop" as const, viewportWidth: 1920 };
  const firstFields = appointmentSchema.sections
    .filter((section) => section.layer === "content" || section.layer === "interaction")
    .flatMap((section) => section.fields)
    .filter((field) => field.key !== "moduleName");
  const pageModule = {
    id: blockId,
    moduleType,
    content: props,
    styleConfig: props,
    layoutConfig: props,
  } as any;

  return (
    <main className="visual-editor-fixture">
      <aside aria-label="Booking 属性面板测试区">
        <section aria-label="核心文字和主行动" data-testid="booking-first-task">
          <h2>核心文字和主行动</h2>
          {firstFields.map((field) => (
            <div key={field.key} data-inspector-field={field.key}>
              <FieldRenderer def={field} ctx={ctx} update={update} moduleType={moduleType} />
            </div>
          ))}
        </section>
        <VisualEditorToolbar blockId={blockId} moduleType={moduleType} panelMode="design" />
        <InstanceOverridesPanel
          moduleType={moduleType}
          props={props}
          update={update}
          viewport="desktop"
        />
        <pre data-testid="booking-state">{JSON.stringify(props)}</pre>
      </aside>
      <section aria-label="Booking 中央画布测试区" className="visual-editor-fixture__canvas">
        <ContentTemplateContractFrame moduleType={moduleType} mode="editor" props={props}>
          <AppointmentBlock module={pageModule} editMode />
        </ContentTemplateContractFrame>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<BookingEditorFixture />);
