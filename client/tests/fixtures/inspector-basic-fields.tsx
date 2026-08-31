import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import FieldRenderer from "../../src/page-builder/inspector/FieldRenderer";
import { hotspotSchema } from "../../src/page-builder/inspector/schema/modules/hotspot";
import { siteConfigSchema } from "../../src/page-builder/inspector/schema/modules/siteConfig";
import { videoSchema } from "../../src/page-builder/inspector/schema/modules/video";
import type {
  FieldDef,
  ModuleInspectorSchema,
} from "../../src/page-builder/inspector/schema/types";
import "../../src/styles/globals.css";
import "../../src/pages/admin/HomepageConfig/editor.css";

function findField(
  schema: ModuleInspectorSchema,
  control: FieldDef["control"],
  key?: string,
): FieldDef {
  for (const section of schema.sections) {
    for (const field of section.fields) {
      if (field.control === control && (!key || field.key === key)) return field;
      if (field.control === "array") {
        const nested = field.itemFields.find(
          (item) => item.control === control && (!key || item.key === key),
        );
        if (nested) return nested;
      }
    }
  }
  throw new Error(`${schema.moduleType} 缺少 ${control}:${key ?? "*"} 字段`);
}

const registeredFields: FieldDef[] = [
  findField(videoSchema, "text", "title"),
  findField(videoSchema, "textarea", "videoDescription"),
  findField(videoSchema, "segmented", "videoWidth"),
  findField(hotspotSchema, "number", "x"),
  findField(videoSchema, "switch", "autoPlay"),
  findField(videoSchema, "preset", "bgColor"),
  findField(videoSchema, "color", "bgColor"),
  findField(siteConfigSchema, "custom", "siteConfigJump"),
];

const supportedButInactiveSelect: FieldDef = {
  key: "qaSelect",
  label: "下拉控件兼容验证",
  control: "select",
  options: [
    { label: "选项一", value: "one" },
    { label: "选项二", value: "two" },
  ],
};

function FixtureRoute() {
  const location = useLocation();
  return <output data-testid="fixture-route">{location.pathname}</output>;
}

function InspectorBasicFieldsFixture() {
  const [props, setProps] = useState<Record<string, unknown>>({
    title: "原始标题",
    videoDescription: "原始视频说明",
    videoWidth: "standard",
    x: 50,
    autoPlay: false,
    bgColor: "#FFFFFF",
    qaSelect: "one",
  });
  const update = (patch: Record<string, unknown>) =>
    setProps((current) => ({ ...current, ...patch }));
  const ctx = {
    props,
    device: "desktop" as const,
    viewportWidth: 1920 as const,
  };

  return (
    <MemoryRouter initialEntries={["/__inspector-basic-fields"]}>
      <main style={{ width: 440, padding: 20 }}>
        <h1>Inspector 基础控件矩阵</h1>
        {registeredFields.map((field) => (
          <section
            key={`${field.control}:${field.key}`}
            data-inspector-matrix-control={field.control}
          >
            <FieldRenderer
              def={field}
              ctx={ctx}
              update={update}
              moduleType={field.control === "number" ? "热区图" : "视频区块"}
            />
          </section>
        ))}
        <section data-inspector-matrix-control="select">
          <FieldRenderer
            def={supportedButInactiveSelect}
            ctx={ctx}
            update={update}
          />
        </section>
        <FixtureRoute />
        <pre data-testid="inspector-basic-state">{JSON.stringify(props)}</pre>
      </main>
    </MemoryRouter>
  );
}

createRoot(document.getElementById("root")!).render(
  <InspectorBasicFieldsFixture />,
);
