export type InspectorObjectKind =
  | "module"
  | "media"
  | "video"
  | "text"
  | "action"
  | "product"
  | "collection"
  | "structured";

export interface InspectorObjectOption {
  id: string;
  label: string;
  kind?: InspectorObjectKind;
  thumbnailUrl?: string;
}

export type InspectorResponsiveState =
  | "base"
  | "custom"
  | "inherited"
  | "partial"
  | "independent";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasViewportValue(value: unknown, viewport: "desktop" | "mobile") {
  return isRecord(value) && Object.prototype.hasOwnProperty.call(value, viewport);
}

export function getInspectorResponsiveStates({
  instanceOverrides,
  selectedNodeId,
  supportsFocus = false,
}: {
  instanceOverrides: unknown;
  selectedNodeId: string | null;
  supportsFocus?: boolean;
}): { desktop: InspectorResponsiveState; mobile: InspectorResponsiveState } {
  const overrides = isRecord(instanceOverrides) ? instanceOverrides : {};
  if (!selectedNodeId) {
    const frame = isRecord(overrides.frame) ? overrides.frame : {};
    const ratios = frame.aspectRatioByViewport;
    return {
      desktop: hasViewportValue(ratios, "desktop") ? "custom" : "base",
      mobile: hasViewportValue(ratios, "mobile") ? "independent" : "base",
    };
  }

  const nodes = isRecord(overrides.nodes) ? overrides.nodes : {};
  const node = isRecord(nodes[selectedNodeId]) ? nodes[selectedNodeId] : {};
  const mediaView = isRecord(node.mediaView) ? node.mediaView : {};
  const responsiveMaps = [node.rectByViewport, node.zIndexByViewport];
  if (supportsFocus) responsiveMaps.push(mediaView.focusByViewport);
  const desktopCount = responsiveMaps.filter((value) =>
    hasViewportValue(value, "desktop"),
  ).length;
  const mobileCount = responsiveMaps.filter((value) =>
    hasViewportValue(value, "mobile"),
  ).length;

  return {
    desktop: desktopCount > 0 ? "custom" : "base",
    mobile: mobileCount === 0
      ? "base"
      : mobileCount === responsiveMaps.length
        ? "independent"
        : "partial",
  };
}

interface InspectorObjectContextProps {
  moduleLabel: string;
  selectedObjectId: string | null;
  objects: readonly InspectorObjectOption[];
  onSelect: (objectId: string | null) => void;
  objectKind?: InspectorObjectKind;
  thumbnailUrl?: string;
  activeDevice?: "desktop" | "mobile";
  desktopState?: InspectorResponsiveState;
  mobileState?: InspectorResponsiveState;
  sharedDesignLabel?: string;
  blockId?: string;
  moduleType?: string;
  mode?: "content" | "design";
  onOpenPageSettings?: () => void;
}

/**
 * 属性面板的单一编辑范围入口。
 * 内容与模板模式共用的紧凑对象上下文；模板只读导航由独立组件渲染。
 */
export default function InspectorObjectContext({
  moduleLabel,
  selectedObjectId,
  objects,
  onSelect,
  objectKind = "module",
  thumbnailUrl: _thumbnailUrl,
  activeDevice = "desktop",
  desktopState = "base",
  mobileState = "base",
  sharedDesignLabel = "共享样式会同步到双端",
  blockId: _blockId,
  moduleType: _moduleType,
  mode = "content",
  onOpenPageSettings,
}: InspectorObjectContextProps) {
  const selectedObject = selectedObjectId
    ? objects.find((object) => object.id === selectedObjectId)
    : undefined;
  const isContentMode = mode === "content";
  return (
    <section
      className="homepage-editor__object-context"
      data-edit-scope={isContentMode ? "module" : selectedObjectId ? "object" : "module"}
      data-selected-node-id={selectedObjectId ?? "module"}
      data-selected-kind={objectKind}
      data-active-device={activeDevice}
      data-desktop-state={desktopState}
      data-mobile-state={mobileState}
      data-shared-design="true"
      data-panel-mode={mode}
      aria-label="当前编辑对象"
    >
      <div className="homepage-editor__object-context-line">
        <span className="homepage-editor__object-breadcrumb">
          <strong>{moduleLabel}</strong>
          <b aria-hidden="true">/</b>
          {isContentMode ? (
            <strong>全部内容</strong>
          ) : objects.length > 0 ? (
            <label className="homepage-editor__object-context-picker">
              <span>选择编辑对象</span>
              <select
                aria-label="选择编辑对象"
                value={selectedObjectId ?? ""}
                onChange={(event) => onSelect(event.target.value || null)}
              >
                <option value="">整体</option>
                {objects.map((object) => (
                  <option key={object.id} value={object.id}>{object.label}</option>
                ))}
              </select>
            </label>
          ) : (
            <strong>{selectedObject?.label ?? "整体"}</strong>
          )}
          <small>{isContentMode ? "当前模块全部适用内容" : sharedDesignLabel}</small>
        </span>
        {onOpenPageSettings ? (
          <button
            type="button"
            className="homepage-editor__edit-scope-badge"
            onClick={onOpenPageSettings}
            title="打开页面展示设置"
          >
            页面覆盖
          </button>
        ) : (
          <span className="homepage-editor__edit-scope-badge">页面覆盖</span>
        )}
      </div>
    </section>
  );
}
