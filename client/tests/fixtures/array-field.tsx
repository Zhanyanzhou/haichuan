import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import ArrayField from "../../src/page-builder/inspector/controls/ArrayField";
import type { ArrayFieldDef } from "../../src/page-builder/inspector/schema/types";
import "../../src/styles/globals.css";
import "../../src/pages/admin/HomepageConfig/editor.css";

const def: ArrayFieldDef = {
  key: "images",
  label: "轮播图片",
  control: "array",
  itemLabel: "图片",
  minItems: 2,
  maxItems: 3,
  defaultItem: { alt: "新图片", caption: "" },
  itemSummary: (item) => String(item.alt || "未命名图片"),
  itemFields: [
    { key: "alt", label: "替代文字", control: "text", required: true },
    {
      key: "caption",
      label: "图注",
      control: "text",
      visibleWhen: ({ props }) => props.alt !== "隐藏图注",
    },
  ],
};

function ArrayFieldFixture() {
  const [items, setItems] = useState([
    { alt: "第一张", caption: "第一图注" },
    { alt: "第二张", caption: "第二图注" },
  ]);
  return (
    <main style={{ width: 440, padding: 20 }}>
      <ArrayField
        def={def}
        value={items}
        ctx={{ props: { images: items }, device: "desktop", viewportWidth: 1920 }}
        onChange={setItems}
        moduleType="轮播图"
      />
      <pre data-testid="array-state">{JSON.stringify(items)}</pre>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<ArrayFieldFixture />);
