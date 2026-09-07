import {
  useCallback,
  useId,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

export const FOUR_ZONE_DESKTOP_LAYOUT = Object.freeze({
  library: 12,
  tree: 8,
  canvas: 60,
  inspector: 20,
} as const);

export type FourZoneCollapsibleRegion = "tree" | "inspector";
export type FourZoneWorkspaceZone =
  | "library"
  | "tree"
  | "canvas"
  | "inspector";

export interface FourZoneWorkspaceRegion {
  id?: string;
  label: string;
  content: ReactNode;
  collapsedSummary?: ReactNode;
}

export interface FourZoneWorkspaceShellProps {
  ariaLabel: string;
  className?: string;
  library: FourZoneWorkspaceRegion;
  tree: FourZoneWorkspaceRegion;
  canvas: FourZoneWorkspaceRegion;
  inspector: FourZoneWorkspaceRegion;
  collapsibleRegions?: readonly FourZoneCollapsibleRegion[];
  defaultCollapsedRegions?: readonly FourZoneCollapsibleRegion[];
  onCollapsedRegionsChange?: (
    collapsedRegions: readonly FourZoneCollapsibleRegion[],
  ) => void;
  compactActiveRegion?: FourZoneWorkspaceZone;
}

const COLLAPSIBLE_REGION_ORDER: readonly FourZoneCollapsibleRegion[] = [
  "tree",
  "inspector",
];

const DESKTOP_GRID_STYLE = {
  display: "grid",
  gridTemplateColumns: `${FOUR_ZONE_DESKTOP_LAYOUT.library}fr ${FOUR_ZONE_DESKTOP_LAYOUT.tree}fr ${FOUR_ZONE_DESKTOP_LAYOUT.canvas}fr ${FOUR_ZONE_DESKTOP_LAYOUT.inspector}fr`,
  minWidth: 0,
} satisfies CSSProperties;

function CollapsibleWorkspaceRegion({
  as,
  collapsed,
  collapsible,
  onToggle,
  region,
  zone,
}: {
  as: "aside" | "section";
  collapsed: boolean;
  collapsible: boolean;
  onToggle: () => void;
  region: FourZoneWorkspaceRegion;
  zone: FourZoneWorkspaceZone;
}) {
  const contentId = useId();
  const Element = as;

  return (
    <Element
      id={region.id}
      className={`four-zone-workspace-shell__region four-zone-workspace-shell__${zone}`}
      aria-label={region.label}
      tabIndex={-1}
      data-zone={zone}
      data-collapsed={collapsed || undefined}
    >
      <header className="four-zone-workspace-shell__region-header">
        <span>{region.label}</span>
        {collapsed && region.collapsedSummary ? (
          <span className="four-zone-workspace-shell__collapsed-summary">
            {region.collapsedSummary}
          </span>
        ) : null}
        {collapsible ? (
          <button
            type="button"
            aria-controls={contentId}
            aria-expanded={!collapsed}
            onClick={onToggle}
          >
            {collapsed ? `展开${region.label}` : `收起${region.label}`}
          </button>
        ) : null}
      </header>
      <div
        id={contentId}
        className="four-zone-workspace-shell__region-content"
        hidden={collapsed}
      >
        {region.content}
      </div>
    </Element>
  );
}

export default function FourZoneWorkspaceShell({
  ariaLabel,
  className,
  library,
  tree,
  canvas,
  inspector,
  collapsibleRegions = COLLAPSIBLE_REGION_ORDER,
  defaultCollapsedRegions = [],
  onCollapsedRegionsChange,
  compactActiveRegion = "canvas",
}: FourZoneWorkspaceShellProps) {
  const [collapsedRegions, setCollapsedRegions] = useState(
    () => new Set<FourZoneCollapsibleRegion>(defaultCollapsedRegions),
  );

  const toggleRegion = useCallback((region: FourZoneCollapsibleRegion) => {
    setCollapsedRegions((current) => {
      const next = new Set(current);
      if (next.has(region)) next.delete(region);
      else next.add(region);
      onCollapsedRegionsChange?.(
        COLLAPSIBLE_REGION_ORDER.filter((candidate) => next.has(candidate)),
      );
      return next;
    });
  }, [onCollapsedRegionsChange]);

  const shellClassName = ["four-zone-workspace-shell", className]
    .filter(Boolean)
    .join(" ");

  return (
    <section
      className={shellClassName}
      aria-label={ariaLabel}
      data-desktop-layout="12/8/60/20"
      data-desktop-min-width="1200"
      data-compact-active-zone={compactActiveRegion}
      style={DESKTOP_GRID_STYLE}
    >
      <CollapsibleWorkspaceRegion
        as="aside"
        zone="library"
        region={library}
        collapsed={false}
        collapsible={false}
        onToggle={() => undefined}
      />
      <CollapsibleWorkspaceRegion
        as="aside"
        zone="tree"
        region={tree}
        collapsed={collapsedRegions.has("tree")}
        collapsible={collapsibleRegions.includes("tree")}
        onToggle={() => toggleRegion("tree")}
      />
      <CollapsibleWorkspaceRegion
        as="section"
        zone="canvas"
        region={canvas}
        collapsed={false}
        collapsible={false}
        onToggle={() => undefined}
      />
      <CollapsibleWorkspaceRegion
        as="aside"
        zone="inspector"
        region={inspector}
        collapsed={collapsedRegions.has("inspector")}
        collapsible={collapsibleRegions.includes("inspector")}
        onToggle={() => toggleRegion("inspector")}
      />
    </section>
  );
}
