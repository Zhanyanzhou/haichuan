import {
  createContentTemplateMarker,
  getContentTemplateContract,
  getContentTemplatePreview,
} from "../generated/contentTemplates.generated";
import { puckConfig } from "../config/puckConfig";

type PreviewViewport = "desktop" | "mobile";

const NEUTRAL_PREVIEW_COPY: Partial<Record<string, Record<string, string>>> = {
  textBanner: {
    title: "章节标题",
    body: "内容说明",
  },
};

function sanitizePreviewDefaults(value: unknown): unknown {
  if (typeof value === "string") {
    return /^https?:\/\//i.test(value) ? "" : value;
  }
  if (Array.isArray(value)) return value.map(sanitizePreviewDefaults);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, sanitizePreviewDefaults(nested)]),
    );
  }
  return value;
}

/**
 * 模板库缩略图直接缩放真实 Puck adapter + 合同根框架。
 * 它只提供裁切视窗，不重新描述角色坐标、顺序或比例。
 */
export default function ContentTemplateRendererPreview({
  moduleType,
  viewport = "desktop",
}: {
  moduleType: string;
  viewport?: PreviewViewport;
}) {
  const profile = getContentTemplatePreview(moduleType);
  const contract = getContentTemplateContract(moduleType);
  const component = (puckConfig.components as Record<string, any>)[moduleType];
  if (!profile || !contract || typeof component?.render !== "function") return null;

  const props = {
    ...(sanitizePreviewDefaults(component.defaultProps ?? {}) as Record<string, unknown>),
    ...(NEUTRAL_PREVIEW_COPY[contract.key] ?? {}),
    id: `template-library-preview-${contract.key}`,
    __contentTemplate: createContentTemplateMarker(moduleType),
  };
  const scale = viewport === "mobile" ? 6 / 13 : 1 / 4;

  return (
    <div
      className={`homepage-editor__template-preview-img is-renderer is-${viewport}`}
      role="img"
      aria-label={`${profile.displayName}的${viewport === "desktop" ? "桌面" : "手机"}真实构图预览：${profile.purpose}`}
      data-content-template-preview={contract.key}
      data-preview-viewport={viewport}
      data-desktop-order={contract.order.desktop.join(",")}
      data-mobile-order={contract.order.mobile.join(",")}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: viewport === "desktop" ? "300 / 186" : "180 / 228",
        overflow: "hidden",
        background: "#F4F5F5",
        pointerEvents: "none",
      }}
    >
      <div
        aria-hidden="true"
        {...({ inert: "" } as Record<string, string>)}
        style={{
          width: `${100 / scale}%`,
          minHeight: `${100 / scale}%`,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        {component.render(props)}
      </div>
    </div>
  );
}
