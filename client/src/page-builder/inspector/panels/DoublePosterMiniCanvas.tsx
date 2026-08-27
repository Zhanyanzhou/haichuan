import { useState, type CSSProperties, type ReactNode } from "react";
import {
  AppstoreOutlined,
  FontSizeOutlined,
  LinkOutlined,
  PictureOutlined,
  WarningFilled,
} from "@ant-design/icons";
import type { PuckProps } from "../../types";
import { getContentTemplateContract } from "../../generated/contentTemplates.generated";
import {
  isVisualRecord,
  resolveVisualNode,
  type VisualRect,
  type VisualViewport,
} from "../../runtime/visualLayout";
import { useVisualEditorSession } from "../../visual-editor/visualEditorSession";

export type DoublePosterObjectId = "mainImage" | "detailImage" | "copy" | "action";

interface DoublePosterMiniCanvasProps {
  activeDevice: VisualViewport;
  mode: "content" | "design";
  availableObjectIds: readonly DoublePosterObjectId[];
  issueObjectIds: ReadonlySet<DoublePosterObjectId>;
  props: PuckProps;
  selectedObjectId: DoublePosterObjectId | null;
  onSelect: (objectId: DoublePosterObjectId | null) => void;
}

const OBJECT_LABELS: Record<DoublePosterObjectId, string> = {
  mainImage: "主图",
  detailImage: "细节图",
  copy: "文案",
  action: "行动入口",
};

const isObjectId = (value: string): value is DoublePosterObjectId =>
  Object.prototype.hasOwnProperty.call(OBJECT_LABELS, value);

const toPercent = (value: number) => `${Math.max(0, Math.min(1, value)) * 100}%`;

function getFrameComposition(props: PuckProps) {
  const overrides = isVisualRecord(props.__instanceOverrides)
    ? props.__instanceOverrides
    : undefined;
  const frame = overrides && isVisualRecord(overrides.frame) ? overrides.frame : undefined;
  const layout = overrides && isVisualRecord(overrides.layout) ? overrides.layout : undefined;
  const value = frame?.compositionPreset ?? layout?.compositionPreset;
  return value === "main-led" || value === "balanced" || value === "detail-led"
    ? value
    : undefined;
}

/**
 * 构图预设目前由运行时写成列宽规则；小画布只把同一语义投影到合同矩形，
 * 不维护额外的模板顺序、间距或断点。
 */
function applyDesktopComposition(
  rect: VisualRect,
  objectId: DoublePosterObjectId,
  composition: ReturnType<typeof getFrameComposition>,
): VisualRect {
  if (!composition) return rect;
  const mainWidth = composition === "main-led"
    ? 8 / 12
    : composition === "detail-led"
      ? 5 / 12
      : 6 / 12;
  return objectId === "mainImage"
    ? { ...rect, x: 0, width: mainWidth }
    : { ...rect, x: mainWidth, width: 1 - mainWidth };
}

function objectContent(
  objectId: DoublePosterObjectId,
  props: PuckProps,
  viewport: VisualViewport,
): ReactNode {
  if (objectId === "mainImage" || objectId === "detailImage") {
    const source = typeof props[objectId] === "string" ? props[objectId] : "";
    if (!source) {
      return <PictureOutlined className="homepage-editor__dp-mini-placeholder" aria-hidden="true" />;
    }
    const visual = resolveVisualNode(props, objectId, viewport);
    const fallbackX = Number(props[objectId === "mainImage" ? "mainFocusX" : "detailFocusX"] ?? 50);
    const fallbackY = Number(props[objectId === "mainImage" ? "mainFocusY" : "detailFocusY"] ?? 50);
    return (
      <img
        src={source}
        alt=""
        draggable={false}
        onError={(event) => {
          event.currentTarget.hidden = true;
        }}
        style={{
          objectFit: visual.fit ?? "cover",
          objectPosition: `${visual.focus?.x ?? fallbackX}% ${visual.focus?.y ?? fallbackY}%`,
          transform: visual.zoom && visual.zoom !== 1 ? `scale(${visual.zoom})` : undefined,
        }}
      />
    );
  }
  if (objectId === "copy") {
    const eyebrow = [props.number, props.label]
      .filter((value) => typeof value === "string" && value.trim())
      .join(" / ");
    return (
      <span className="homepage-editor__dp-mini-copy" aria-hidden="true">
        {eyebrow ? <small>{eyebrow}</small> : null}
        <strong>{typeof props.title === "string" && props.title.trim() ? props.title : "标题"}</strong>
        <i>{typeof props.description === "string" && props.description.trim() ? props.description : "说明文字"}</i>
      </span>
    );
  }
  return (
    <span className="homepage-editor__dp-mini-action" aria-hidden="true">
      {typeof props.actionText === "string" && props.actionText.trim() ? props.actionText : <LinkOutlined />}
      <span>→</span>
    </span>
  );
}

export default function DoublePosterMiniCanvas({
  activeDevice,
  mode,
  availableObjectIds,
  issueObjectIds,
  props,
  selectedObjectId,
  onSelect,
}: DoublePosterMiniCanvasProps) {
  const [expanded, setExpanded] = useState(true);
  const contract = getContentTemplateContract("双图海报");
  const geometry = contract?.defaultGeometryByViewport[activeDevice];
  const blockId = String(props.id ?? "");
  const measuredGeometry = useVisualEditorSession(
    (state) => state.canvasGeometryByBlock[blockId]?.[activeDevice],
  );
  const composition = activeDevice === "desktop" ? getFrameComposition(props) : undefined;
  const background = typeof props.bgColor === "string" ? props.bgColor : "#FFFFFF";
  const frameAspectRatio = measuredGeometry?.frameAspectRatio ?? geometry?.frameAspectRatio ??
    (activeDevice === "mobile" ? 0.6 : 1.5);
  const actionVisible = Boolean(
    typeof props.actionText === "string" && props.actionText.trim() &&
    measuredGeometry?.nodes.action,
  );
  const zones = (geometry?.zones ?? [])
    .filter((zone) =>
      isObjectId(zone.roleId) &&
      availableObjectIds.includes(zone.roleId) &&
      (zone.roleId !== "action" || mode === "design" || actionVisible),
    )
    .map((zone) => {
      const objectId = zone.roleId as DoublePosterObjectId;
      const visual = resolveVisualNode(props, objectId, activeDevice);
      const defaultRect = activeDevice === "desktop"
        ? applyDesktopComposition(zone.rect, objectId, composition)
        : zone.rect;
      return {
        objectId,
        rect: measuredGeometry?.nodes[objectId] ?? visual.rect ?? defaultRect,
        zIndex: visual.zIndex ?? (
          objectId === "action"
            ? typeof props.actionText === "string" && props.actionText.trim() ? 4 : 1
            : objectId === "copy" ? 3 : 2
        ),
        enabled: visual.enabled !== false,
      };
    });

  const objectActionLabel = (objectId: DoublePosterObjectId, hasIssue: boolean, enabled: boolean) => {
    const label = OBJECT_LABELS[objectId];
    const action = mode === "content"
      ? `选择${label}内容`
      : `选择${label}并在主画布调整模板`;
    return `${action}${hasIssue ? "，存在发布问题" : ""}${enabled ? "" : "，当前隐藏"}`;
  };
  const objectIcon = (objectId: DoublePosterObjectId) => objectId === "copy"
    ? FontSizeOutlined
    : objectId === "action"
      ? LinkOutlined
      : PictureOutlined;

  return (
    <section
      className="homepage-editor__dp-mini"
      data-device={activeDevice}
      data-mini-canvas-mode={mode}
      data-geometry-source={measuredGeometry ? "renderer" : "contract"}
      aria-label={`双图文${mode === "content" ? "内容" : "模板"}画布`}
    >
      <div
        className="homepage-editor__dp-object-rail"
        role="listbox"
        aria-label="双图文对象"
      >
        {availableObjectIds.map((objectId) => {
          const ObjectIcon = objectIcon(objectId);
          const selected = selectedObjectId === objectId;
          const hasIssue = issueObjectIds.has(objectId);
          return (
            <button
              key={objectId}
              type="button"
              role="option"
              aria-selected={selected}
              aria-label={`${OBJECT_LABELS[objectId]}对象${hasIssue ? "，存在发布问题" : ""}`}
              className={selected ? "is-active" : undefined}
              onClick={() => onSelect(objectId)}
            >
              <ObjectIcon aria-hidden="true" />
              <span>{OBJECT_LABELS[objectId]}</span>
              {hasIssue ? <i aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
      <header className="homepage-editor__dp-mini-toolbar">
        <span aria-live="polite">
          {mode === "content" ? "在模板中的位置" : "模板画面"} · {activeDevice === "mobile" ? "移动端" : "桌面端"}
        </span>
        <span className="homepage-editor__dp-mini-tools">
          <button
            type="button"
            className={selectedObjectId === null ? "is-active" : undefined}
            aria-label={mode === "content" ? "选择双图文模块内容" : "选择整个双图文模板"}
            aria-pressed={selectedObjectId === null}
            title={mode === "content" ? "模块内容" : "整个模板"}
            onClick={() => onSelect(null)}
          >
            <AppstoreOutlined aria-hidden="true" />
          </button>
          {mode === "content" && !actionVisible ? (
            <button
              type="button"
              className={selectedObjectId === "action" ? "is-active" : undefined}
              aria-label="编辑行动入口"
              aria-pressed={selectedObjectId === "action"}
              title="添加行动入口"
              onClick={() => onSelect("action")}
            >
              <LinkOutlined aria-hidden="true" />
            </button>
          ) : null}
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls="double-poster-mini-canvas"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "收起" : "展开"}
          </button>
        </span>
      </header>

      {expanded ? (
        <div
          id="double-poster-mini-canvas"
          className="homepage-editor__dp-mini-frame"
          style={{
            "--dp-mini-ratio": frameAspectRatio,
            background,
          } as CSSProperties}
        >
          {zones.map(({ objectId, rect, zIndex, enabled }) => {
            const hasIssue = issueObjectIds.has(objectId);
            const label = OBJECT_LABELS[objectId];
            return (
              <button
                key={objectId}
                type="button"
                className={`homepage-editor__dp-mini-object is-${objectId}${selectedObjectId === objectId ? " is-active" : ""}${enabled ? "" : " is-disabled-object"}`}
                data-mini-canvas-object={objectId}
                aria-label={objectActionLabel(objectId, hasIssue, enabled)}
                aria-pressed={selectedObjectId === objectId}
                title={label}
                style={{
                  left: toPercent(rect.x),
                  top: toPercent(rect.y),
                  width: toPercent(rect.width),
                  height: toPercent(rect.height),
                  zIndex,
                }}
                onClick={() => {
                  onSelect(objectId);
                }}
              >
                {objectContent(objectId, props, activeDevice)}
                {hasIssue ? (
                  <span className="homepage-editor__dp-mini-issue" title={`${label}存在发布问题`}>
                    <WarningFilled aria-hidden="true" />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      <p className="homepage-editor__dp-mini-status">
        {mode === "content"
          ? selectedObjectId === "mainImage" || selectedObjectId === "detailImage"
            ? "已选择图片对象；请在主画布点击图片上传或替换"
            : selectedObjectId
              ? `正在编辑${OBJECT_LABELS[selectedObjectId]}`
              : "选择画面内容开始编辑"
          : selectedObjectId
            ? `已选择${OBJECT_LABELS[selectedObjectId]}，请在主画布移动或缩放`
            : "选择对象后在主画布调整模板"}
        {selectedObjectId && issueObjectIds.has(selectedObjectId) ? <span>需完善</span> : null}
      </p>
    </section>
  );
}
