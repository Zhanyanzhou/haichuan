import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import NumberField, { focusFirstInvalidNumberField } from "../../src/page-builder/inspector/controls/NumberField";
import "../../src/pages/admin/HomepageConfig/editor.css";

function Fixture() {
  const [dimension, setDimension] = useState({ value: 1436.180371352785, unit: "px" });
  const [events, setEvents] = useState<unknown[]>([]);
  const [preview, setPreview] = useState<number | null>(null);
  const [guardedValue, setGuardedValue] = useState(900);
  return <main style={{ width: 240, padding: 16 }}>
    <NumberField label="高度" value={dimension.value} unit={dimension.unit} displayPrecision={2}
      unitOptions={["px", "%", "vh"]} min={1} max={5000} step={0.1}
      onChange={(value) => {
        setDimension({ ...dimension, value });
        setPreview(null);
        setEvents((previous) => [...previous, { kind: "value", value }]);
      }}
      onUnitChange={(unit, value) => {
        setDimension({ unit, value });
        setPreview(null);
        setEvents((previous) => [...previous, { kind: "unit", value, unit }]);
      }}
      onPreview={setPreview} onCancel={() => setPreview(null)} />
    <NumberField label="默认精度" value={dimension.value} onChange={(value) => setEvents((previous) => [...previous, { kind: "default", value }])} />
    <NumberField label="门禁数值" value={guardedValue} min={1} max={5000} onChange={(value) => {
      if (focusFirstInvalidNumberField()) return false;
      setGuardedValue(value);
      setEvents((previous) => [...previous, { kind: "guarded", value }]);
      return true;
    }} />
    <button type="button">离开属性</button>
    <output data-testid="state">{JSON.stringify({ ...dimension, events, preview, guardedValue })}</output>
  </main>;
}

createRoot(document.getElementById("root")!).render(<Fixture />);
