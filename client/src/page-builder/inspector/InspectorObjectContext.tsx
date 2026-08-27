import {
  AppstoreOutlined,
  DesktopOutlined,
  FileImageOutlined,
  FontSizeOutlined,
  LinkOutlined,
  MobileOutlined,
  ShoppingOutlined,
  UnorderedListOutlined,
  VideoCameraOutlined,
} from "@ant-design/icons";
import type { CSSProperties } from "react";
import {
  getContentTemplateContract,
  getContentTemplateDefaultRect,
  getContentTemplateEditableObject,
} from "../generated/contentTemplates.generated";
import { useVisualEditorSession } from "../visual-editor/visualEditorSession";

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
}

/**
 * 属性面板的单一编辑范围入口。
 * 原生 select 保留紧凑键盘切换；可视对象卡承担只读导航，模板模式的图层面板同步提供内部对象选择。
 */
export default function InspectorObjectContext({
  moduleLabel,
  selectedObjectId,
  objects,
  onSelect,
  objectKind = "module",
  thumbnailUrl,
  activeDevice = "desktop",
  desktopState = "base",
  mobileState = "base",
  sharedDesignLabel = "共享样式会同步到双端",
  blockId,
  moduleType,
  mode = "content",
}: InspectorObjectContextProps) {
  const measuredGeometry = useVisualEditorSession((state) =>
    blockId ? state.canvasGeometryByBlock[blockId]?.[activeDevice] : undefined,
  );
  const contract = moduleType ? getContentTemplateContract(moduleType) : undefined;
  const frameAspectRatio = measuredGeometry?.frameAspectRatio ??
    contract?.defaultGeometryByViewport[activeDevice].frameAspectRatio ?? 1;
  const scope = selectedObjectId ? "object" : "module";
  const stateLabel: Record<InspectorResponsiveState, string> = {
    base: "基准",
    custom: "已调整",
    inherited: "继承",
    partial: "部分独立",
    independent: "独立",
  };
  const kindLabel = {
    module: "Module · 模块",
    media: "Image · 图像对象",
    video: "Video · 视频对象",
    text: "Text · 文字对象",
    action: "Action · 行动对象",
    product: "Product · 商品对象",
    collection: "Collection · 集合对象",
    structured: "Object · 内容对象",
  }[objectKind];
  const iconForKind = (kind: InspectorObjectKind = "structured") => kind === "media"
    ? FileImageOutlined
    : kind === "video"
      ? VideoCameraOutlined
      : kind === "text"
        ? FontSizeOutlined
        : kind === "action"
          ? LinkOutlined
          : kind === "product"
            ? ShoppingOutlined
            : kind === "collection"
              ? UnorderedListOutlined
              : AppstoreOutlined;
  const selectedObject = selectedObjectId
    ? objects.find((object) => object.id === selectedObjectId)
    : undefined;
  const SelectedIcon = selectedObject ? iconForKind(selectedObject.kind) : AppstoreOutlined;

  return (
    <section
      className="homepage-editor__object-context"
      data-edit-scope={scope}
      data-selected-node-id={selectedObjectId ?? "module"}
      data-selected-kind={objectKind}
      data-active-device={activeDevice}
      data-desktop-state={desktopState}
      data-mobile-state={mobileState}
      data-shared-design="true"
      data-panel-mode={mode}
      aria-label="当前编辑对象"
    >
      {objects.length > 0 ? (
        <div
          className="homepage-editor__object-picker"
          data-inspector-object-picker="visual"
        >
          <div
            className="homepage-editor__object-picker-grid"
            role="listbox"
            aria-label="属性面板对象列表"
          >
            <button
              type="button"
              role="option"
              aria-selected={selectedObjectId === null}
              className={selectedObjectId === null ? "is-active" : ""}
              onClick={() => onSelect(null)}
              aria-label={`选择${moduleLabel}整个模板`}
            >
              <span className="homepage-editor__object-picker-thumb" aria-hidden="true">
                <AppstoreOutlined />
              </span>
              <strong>整体</strong>
            </button>
            {objects.map((object) => {
              const ObjectIcon = iconForKind(object.kind);
              return (
                <button
                  key={object.id}
                  type="button"
                  role="option"
                  aria-selected={selectedObjectId === object.id}
                  className={selectedObjectId === object.id ? "is-active" : ""}
                  onClick={() => onSelect(object.id)}
                  aria-label={`选择${object.label}`}
                >
                  <span className="homepage-editor__object-picker-thumb" aria-hidden="true">
                    <ObjectIcon />
                    {object.thumbnailUrl ? (
                      <img
                        src={object.thumbnailUrl}
                        alt=""
                        onError={(event) => {
                          event.currentTarget.hidden = true;
                        }}
                      />
                    ) : null}
                  </span>
                  <strong>{object.label}</strong>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      <label className="homepage-editor__object-native-select">
        <span>编辑对象</span>
        <select
          aria-label="选择编辑对象"
          value={selectedObjectId ?? ""}
          onChange={(event) => onSelect(event.target.value || null)}
        >
          <option value="">{moduleLabel}（模块级）</option>
          {objects.map((object) => (
            <option key={object.id} value={object.id}>{object.label}</option>
          ))}
        </select>
      </label>
      <div className="homepage-editor__object-context-line">
        <span className="homepage-editor__object-context-icon" aria-hidden="true">
          <SelectedIcon />
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt=""
              onError={(event) => {
                event.currentTarget.hidden = true;
              }}
            />
          ) : null}
        </span>
        <span>
          <strong>{selectedObject?.label ?? moduleLabel}</strong>
          <small>{mode === "content" ? kindLabel : sharedDesignLabel}</small>
        </span>
        <span className="homepage-editor__edit-scope-badge">
          {mode === "content"
            ? scope === "object" ? "内容" : "全部内容"
            : activeDevice === "mobile" ? "移动端" : "桌面端"}
        </span>
      </div>
      {contract && moduleType && objects.length > 0 ? (
        <div className="homepage-editor__template-navigator" data-mode={mode}>
          <div className="homepage-editor__object-picker-heading">
            <strong>{mode === "content" ? "在模板中的位置" : "模板画面"}</strong>
            <span>{mode === "content" ? "只用于定位" : "选择对象后在主画布调整"}</span>
          </div>
          <div
            className="homepage-editor__template-mini-frame"
            data-geometry-source={measuredGeometry ? "renderer" : "contract"}
            style={{ aspectRatio: frameAspectRatio } as CSSProperties}
            role="listbox"
            aria-label={`${moduleLabel}模板对象缩略导航`}
          >
            {objects.map((object) => {
              const editableObject = getContentTemplateEditableObject(moduleType, object.id);
              const fallbackNodeId = editableObject?.roleId ?? object.id;
              const rect = measuredGeometry?.nodes[object.id] ??
                measuredGeometry?.nodes[fallbackNodeId] ??
                getContentTemplateDefaultRect(moduleType, fallbackNodeId, activeDevice);
              if (!rect) return null;
              return (
                <button
                  key={object.id}
                  type="button"
                  role="option"
                  aria-selected={selectedObjectId === object.id}
                  className={selectedObjectId === object.id ? "is-active" : undefined}
                  onClick={() => onSelect(object.id)}
                  style={{
                    left: `${rect.x * 100}%`,
                    top: `${rect.y * 100}%`,
                    width: `${rect.width * 100}%`,
                    height: `${rect.height * 100}%`,
                  }}
                  title={object.label}
                >
                  {object.thumbnailUrl ? (
                    <img
                      src={object.thumbnailUrl}
                      alt=""
                      onError={(event) => {
                        event.currentTarget.hidden = true;
                      }}
                    />
                  ) : null}
                  <span>{object.label}</span>
                </button>
              );
            })}
          </div>
          <div
            className="homepage-editor__responsive-state"
            role="status"
            aria-label={`响应式状态：桌面端${stateLabel[desktopState]}，移动端${stateLabel[mobileState]}`}
          >
            <span data-device="desktop" data-state={desktopState} data-active={activeDevice === "desktop" ? "true" : "false"}>
              <DesktopOutlined aria-hidden="true" />桌面端 · {stateLabel[desktopState]}
            </span>
            <LinkOutlined aria-hidden="true" />
            <span data-device="mobile" data-state={mobileState} data-active={activeDevice === "mobile" ? "true" : "false"}>
              <MobileOutlined aria-hidden="true" />移动端 · {stateLabel[mobileState]}
            </span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
