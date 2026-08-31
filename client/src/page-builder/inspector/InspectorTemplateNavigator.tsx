import type { CSSProperties } from "react";
import {
  getContentTemplateContract,
  getContentTemplateDefaultRect,
  getContentTemplateEditableObject,
} from "../generated/contentTemplates.generated";
import { useVisualEditorSession } from "../visual-editor/visualEditorSession";
import type { InspectorObjectOption } from "./InspectorObjectContext";

interface InspectorTemplateNavigatorProps {
  moduleLabel: string;
  moduleType: string;
  blockId: string;
  objects: readonly InspectorObjectOption[];
  selectedObjectId: string | null;
  activeDevice: "desktop" | "mobile";
  onSelect: (objectId: string) => void;
}

/**
 * 模板模式的只读结构导航。
 * 这里只负责定位固定语义对象；拖拽、缩放和层级调整仍只发生在主画布。
 */
export default function InspectorTemplateNavigator({
  moduleLabel,
  moduleType,
  blockId,
  objects,
  selectedObjectId,
  activeDevice,
  onSelect,
}: InspectorTemplateNavigatorProps) {
  const measuredGeometry = useVisualEditorSession((state) =>
    blockId ? state.canvasGeometryByBlock[blockId]?.[activeDevice] : undefined,
  );
  const contract = getContentTemplateContract(moduleType);
  if (!contract || objects.length === 0) return null;

  const frameAspectRatio = measuredGeometry?.frameAspectRatio ??
    contract.defaultGeometryByViewport[activeDevice].frameAspectRatio ?? 1;
  const navigatorSurfaceStyle = {
    aspectRatio: frameAspectRatio,
    width: frameAspectRatio >= 5 / 3 ? "100%" : "auto",
    height: frameAspectRatio >= 5 / 3 ? "auto" : "100%",
  } as CSSProperties;

  return (
    <section
      className="homepage-editor__template-navigator"
      data-mode="design"
      aria-label="模板布局导航"
    >
      <div
        className="homepage-editor__template-mini-frame"
        data-geometry-source={measuredGeometry ? "renderer" : "contract"}
      >
        <div
          className="homepage-editor__template-mini-surface"
          style={navigatorSurfaceStyle}
          role="listbox"
          aria-label={`${moduleLabel}模板对象只读导航`}
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
                aria-label={`定位到${object.label}`}
                aria-selected={selectedObjectId === object.id}
                className={selectedObjectId === object.id ? "is-active" : undefined}
                onClick={() => onSelect(object.id)}
                style={{
                  left: `${rect.x * 100}%`,
                  top: `${rect.y * 100}%`,
                  width: `${rect.width * 100}%`,
                  height: `${rect.height * 100}%`,
                }}
                title={`定位到${object.label}`}
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
      </div>
      <p>360 × 216 · 只读导航，在主画布拖拽调整</p>
    </section>
  );
}
