import { useId, type RefObject } from "react";
import { WEIGHT_RANGES } from "@/data/catalogData";
import { catalogTokens as T } from "./catalogTokens";
import useCatalogDialog from "./useCatalogDialog";

export default function FilterDrawer({
  materials,
  crafts,
  materialOptions,
  craftOptions,
  weights,
  sizes,
  sizeOptions,
  onMaterials,
  onCrafts,
  onWeights,
  onSizes,
  onClear,
  onClose,
  total,
  returnFocusRef,
}: {
  materials: string[];
  crafts: string[];
  materialOptions: string[];
  craftOptions: string[];
  weights: string[];
  sizes: string[];
  sizeOptions: string[];
  onMaterials: (m: string[]) => void;
  onCrafts: (c: string[]) => void;
  onWeights: (w: string[]) => void;
  onSizes: (s: string[]) => void;
  onClear: () => void;
  onClose: () => void;
  total: number;
  returnFocusRef: RefObject<HTMLElement | null>;
}) {
  const titleId = useId();
  const { dialogRef, initialFocusRef } = useCatalogDialog(onClose, returnFocusRef);
  const toggle = (arr: string[], v: string, setter: (a: string[]) => void) => {
    setter(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  };

  return (
    <>
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 90,
          background: "rgba(0,0,0,0.12)",
        }}
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(440px, 100%)",
          zIndex: 91,
          background: T.bg,
          overflowY: "auto",
          padding: "32px 28px",
          boxShadow: "-1px 0 0 " + T.line,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 28,
          }}
        >
          <h3
            id={titleId}
            style={{ fontSize: 16, fontWeight: 400, color: T.txt, margin: 0 }}
          >
            更多筛选
          </h3>
          <button
            ref={initialFocusRef}
            type="button"
            aria-label="关闭筛选"
            onClick={onClose}
            style={{
              background: "none",
              border: 0,
              cursor: "pointer",
              fontSize: 20,
              color: T.sec,
              lineHeight: 1,
              minWidth: 44,
              minHeight: 44,
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ flex: 1 }}>
          <FilterGroup
            title="材质"
            options={materialOptions}
            selected={materials}
            onToggle={(value) => toggle(materials, value, onMaterials)}
          />
          <FilterGroup
            title="工艺"
            options={craftOptions}
            selected={crafts}
            onToggle={(value) => toggle(crafts, value, onCrafts)}
          />
          <FilterGroup
            title="重量"
            options={WEIGHT_RANGES}
            selected={weights}
            onToggle={(value) => toggle(weights, value, onWeights)}
          />
          {sizeOptions.length > 0 && (
            <FilterGroup
              title="规格"
              options={sizeOptions}
              selected={sizes}
              onToggle={(value) => toggle(sizes, value, onSizes)}
            />
          )}
        </div>
        <div
          style={{
            display: "flex",
            gap: 12,
            paddingTop: 20,
            borderTop: `1px solid ${T.line}`,
          }}
        >
          <button
            onClick={onClear}
            style={{
              flex: 1,
              minHeight: 44,
              border: `1px solid ${T.line}`,
              background: "transparent",
              cursor: "pointer",
              fontSize: 12,
              color: T.sec,
            }}
          >
            重置
          </button>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              minHeight: 44,
              border: 0,
              background: T.txt,
              cursor: "pointer",
              fontSize: 12,
              color: "#FFFFFF",
            }}
          >
            查看 {total} 款结果
          </button>
        </div>
      </div>
    </>
  );
}

function FilterGroup({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  if (!options.length) return null;

  return (
    <div style={{ marginBottom: 24 }}>
      <p
        style={{
          fontSize: 10,
          letterSpacing: "0.1em",
          color: T.light,
          marginBottom: 12,
        }}
      >
        {title}
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px" }}>
        {options.map((option) => (
          <label
            key={option}
            style={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: 44,
              paddingInline: 4,
              gap: 6,
              cursor: "pointer",
              fontSize: 12,
              color: T.txt,
              paddingBlock: 2,
            }}
          >
            <input
              type="checkbox"
              checked={selected.includes(option)}
              onChange={() => onToggle(option)}
              style={{
                width: 13,
                height: 13,
                accentColor: T.txt,
                cursor: "pointer",
              }}
            />
            {option}
          </label>
        ))}
      </div>
    </div>
  );
}
