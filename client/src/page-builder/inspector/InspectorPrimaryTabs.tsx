import { useRef } from "react";

export type InspectorPrimaryMode = "content" | "design";

interface InspectorPrimaryTabsProps {
  activeMode: InspectorPrimaryMode;
  designDisabled?: boolean;
  onChange: (mode: InspectorPrimaryMode) => void;
}

const TABS: ReadonlyArray<{ mode: InspectorPrimaryMode; label: string }> = [
  { mode: "content", label: "内容编辑" },
  { mode: "design", label: "构图调整" },
];

/** 编辑器全局工作模式；通过 InspectorModePortal 挂载到顶部工具栏。 */
export default function InspectorPrimaryTabs({
  activeMode,
  designDisabled = false,
  onChange,
}: InspectorPrimaryTabsProps) {
  const tabRefs = useRef<Partial<Record<InspectorPrimaryMode, HTMLButtonElement | null>>>({});
  const enabledModes = TABS
    .map((tab) => tab.mode)
    .filter((mode) => mode !== "design" || !designDisabled);

  const moveFocus = (
    current: InspectorPrimaryMode,
    direction: -1 | 1 | "first" | "last",
  ) => {
    const currentIndex = enabledModes.indexOf(current);
    const nextMode = direction === "first"
      ? enabledModes[0]
      : direction === "last"
        ? enabledModes[enabledModes.length - 1]
        : enabledModes[(currentIndex + direction + enabledModes.length) % enabledModes.length];
    if (!nextMode) return;
    onChange(nextMode);
    window.requestAnimationFrame(() => tabRefs.current[nextMode]?.focus());
  };

  return (
    <nav className="homepage-editor__panel-mode-tabs" aria-label="编辑工作模式">
      <div role="tablist" aria-label="编辑工作模式">
        {TABS.map(({ mode, label }) => {
          const disabled = mode === "design" && designDisabled;
          return (
            <button
              key={mode}
              ref={(node) => {
                tabRefs.current[mode] = node;
              }}
              id={`inspector-panel-tab-${mode}`}
              type="button"
              role="tab"
              tabIndex={activeMode === mode ? 0 : -1}
              aria-selected={activeMode === mode}
              aria-controls={`inspector-panel-${mode}`}
              aria-disabled={disabled}
              disabled={disabled}
              className={activeMode === mode ? "is-active" : ""}
              onClick={() => onChange(mode)}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight") {
                  event.preventDefault();
                  moveFocus(mode, 1);
                } else if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  moveFocus(mode, -1);
                } else if (event.key === "Home") {
                  event.preventDefault();
                  moveFocus(mode, "first");
                } else if (event.key === "End") {
                  event.preventDefault();
                  moveFocus(mode, "last");
                }
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
