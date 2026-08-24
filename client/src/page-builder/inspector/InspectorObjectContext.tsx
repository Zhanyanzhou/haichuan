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

export interface InspectorObjectOption {
  id: string;
  label: string;
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
      mobile: hasViewportValue(ratios, "mobile") ? "independent" : "inherited",
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
      ? "inherited"
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
  objectKind?: "module" | "media" | "video" | "text" | "action" | "product" | "collection" | "structured";
  thumbnailUrl?: string;
  activeDevice?: "desktop" | "mobile";
  desktopState?: InspectorResponsiveState;
  mobileState?: InspectorResponsiveState;
  sharedDesignLabel?: string;
}

/**
 * 属性面板的单一编辑范围入口。
 * 原生 select 同时承担当前对象提示与键盘切换，避免面包屑、标题和 chips 重复表达同一层级。
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
  mobileState = "inherited",
  sharedDesignLabel = "共享样式会同步到双端",
}: InspectorObjectContextProps) {
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
  const KindIcon = objectKind === "media"
    ? FileImageOutlined
    : objectKind === "video"
      ? VideoCameraOutlined
    : objectKind === "text"
      ? FontSizeOutlined
      : objectKind === "action"
        ? LinkOutlined
        : objectKind === "product"
          ? ShoppingOutlined
          : objectKind === "collection"
            ? UnorderedListOutlined
            : AppstoreOutlined;

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
      aria-label="当前编辑对象"
    >
      <div className="homepage-editor__object-thumbnail" aria-hidden="true">
        <KindIcon />
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt=""
            onError={(event) => {
              event.currentTarget.hidden = true;
            }}
          />
        ) : null}
      </div>
      <div className="homepage-editor__object-summary">
        <label>
          <span>编辑对象</span>
          <select
            aria-label="选择编辑对象"
            value={selectedObjectId ?? ""}
            onChange={(event) => onSelect(event.target.value || null)}
          >
            <option value="">{moduleLabel}（模块级）</option>
            {objects.map((object) => (
              <option key={object.id} value={object.id}>
                {object.label}
              </option>
            ))}
          </select>
        </label>
        <small>{kindLabel}</small>
        <div
          className="homepage-editor__responsive-state"
          role="status"
          aria-label={`响应式状态：桌面端${stateLabel[desktopState]}，移动端${stateLabel[mobileState]}`}
        >
          <span
            data-device="desktop"
            data-state={desktopState}
            data-active={activeDevice === "desktop" ? "true" : "false"}
          >
            <DesktopOutlined aria-hidden="true" />
            桌面端 · {stateLabel[desktopState]}
          </span>
          <LinkOutlined aria-hidden="true" />
          <span
            data-device="mobile"
            data-state={mobileState}
            data-active={activeDevice === "mobile" ? "true" : "false"}
          >
            <MobileOutlined aria-hidden="true" />
            移动端 · {stateLabel[mobileState]}
          </span>
        </div>
        <small className="homepage-editor__responsive-shared-note">
          {sharedDesignLabel}
        </small>
      </div>
      <span className="homepage-editor__edit-scope-badge">
        {scope === "object" ? "对象级" : "模块级"}
      </span>
    </section>
  );
}
