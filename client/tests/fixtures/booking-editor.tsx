import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import AppointmentBlock from "../../src/components/blocks/AppointmentBlock";
import FieldRenderer from "../../src/page-builder/inspector/FieldRenderer";
import InstanceOverridesPanel from "../../src/page-builder/inspector/InstanceOverridesPanel";
import { appointmentSchema } from "../../src/page-builder/inspector/schema/modules/appointment";
import ContentTemplateContractFrame from "../../src/page-builder/runtime/ContentTemplateContractFrame";
import { migratePuckData } from "../../src/page-builder/utils/migratePuckData";
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
const migratedLegacyDocument = migratePuckData({
  content: [
    { type: moduleType, props: { id: "legacy-root", phone: "400-000-0000" } },
    {
      type: "按场景选购",
      props: {
        id: "legacy-item-links",
        categories: [
          { name: "货号详情", link: "/products/HC-LEGACY-001" },
          { name: "数字详情", link: "/products/42" },
          { name: "未登记页面", link: "/not-a-route" },
        ],
      },
    },
  ],
  zones: {
    secondary: [{ type: moduleType, props: { id: "legacy-zone", phone: "400-000-0000" } }],
  },
});

function BookingEditorFixture() {
  const setPanelMode = useVisualEditorSession((state) => state.setPanelMode);
  const [props, setProps] = useState<Record<string, any>>({
    id: blockId,
    backgroundImage: "/svg/template-hero.svg",
    title: "预约鉴赏",
    subtitle: "一对一珠宝顾问，为您安排专属服务",
    buttonText: "立即预约",
    targetType: "page",
    linkUrl: "/contact",
    // 遗留 PageDocument 哨兵：Renderer 必须忽略，联系电话只读统一设置。
    phone: "400-000-0000",
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
  const updateFromCurrent = (
    factory: (current: Record<string, any>) => Record<string, any>,
  ) => setProps((current) => ({ ...current, ...factory(current) }));
  const updateHistoryTransaction = (
    patchOrFactory: Record<string, any> | ((current: Record<string, any>) => Record<string, any>),
  ) => setProps((current) => ({
    ...current,
    ...(typeof patchOrFactory === "function" ? patchOrFactory(current) : patchOrFactory),
  }));
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
          updateFromCurrent={updateFromCurrent}
          updateHistoryTransaction={updateHistoryTransaction}
          historyTransactionPending={false}
          viewport="desktop"
        />
        <pre data-testid="booking-state">{JSON.stringify(props)}</pre>
        <pre data-testid="booking-migrated-state">{JSON.stringify(migratedLegacyDocument)}</pre>
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
