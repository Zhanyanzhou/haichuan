import {
  createContentTemplateMarker,
  getContentTemplateContract,
} from "../generated/contentTemplates.generated";
import {
  resolveVisualNode,
  setVisualOverridePath,
  toVisualOverridesV2,
  type VisualViewport,
} from "../runtime/visualLayout";

type OverrideRecord = Record<string, unknown>;

interface InstanceOverridesPanelProps {
  moduleType: string;
  props: Record<string, any>;
  update: (patch: Record<string, any>) => void;
  scopes?: ReadonlyArray<"layout" | "slots" | "text">;
  embedded?: boolean;
  viewport?: VisualViewport;
  selectedNodeId?: string;
  resetAllDesign?: boolean;
}

const LABELS: Record<string, string> = {
  compact: "紧凑",
  standard: "标准",
  spacious: "舒展",
  immersive: "沉浸",
  tall: "纵向",
  wide: "宽幅",
  balanced: "均衡",
  "main-led": "主图优先",
  "detail-led": "细节图优先",
  "image-left": "图片在左",
  "image-right": "图片在右",
  "grid-2": "两列",
  "grid-3": "三列",
  "grid-4": "四列",
  editorial: "编辑式",
  left: "左侧",
  center: "居中",
  right: "右侧",
  start: "起始侧",
  end: "末端侧",
  overlay: "图片叠字",
  below: "图片下方",
  narrow: "窄",
  large: "大",
  small: "小",
  ink: "石墨黑",
  mineral: "矿物灰",
  ivory: "象牙白",
  cover: "填满裁切",
  contain: "完整显示",
  light: "浅色文字带",
  dark: "深色文字带",
  sm: "小",
  md: "标准",
  lg: "大",
  xs: "极小",
  xl: "特大",
};

const TEXT_COLORS: Record<string, string> = {
  ink: "#181A1B",
  mineral: "#5F6568",
  ivory: "#FFFFFF",
};

const TEXT_SIZE_LEVELS: Record<string, "xs" | "sm" | "md" | "lg" | "xl"> = {
  small: "sm",
  standard: "md",
  large: "lg",
};

const ROLE_LABELS: Record<string, string> = {
  desktopImage: "桌面主图",
  mobileImage: "移动端主图",
  image: "主图",
  coverImage: "封面图",
  frames: "轮播画面",
  mainImage: "主海报",
  detailImage: "细节海报",
  before: "改造前",
  after: "改造后",
  product: "商品主图",
  productCards: "商品卡片",
  works: "作品图片",
  wearingImage: "佩戴场景图",
  categories: "分类卡片",
  scenes: "场景卡片",
  sceneImage: "场景主图",
  certificates: "证书图片",
  store: "门店图片",
  authorizedPhoto: "授权实拍",
  bgImage: "背景图",
  event: "活动主图",
  copy: "文案",
  eyebrow: "眉题",
  title: "主标题",
  subtitle: "副标题",
  actionText: "行动文字",
  buttonText: "主行动文字",
};

function isRecord(value: unknown): value is OverrideRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export default function InstanceOverridesPanel({
  moduleType,
  props,
  update,
  scopes = ["layout", "slots", "text"],
  embedded = false,
  viewport = "desktop",
  selectedNodeId,
  resetAllDesign = false,
}: InstanceOverridesPanelProps) {
  const contract = getContentTemplateContract(moduleType);
  const capabilities = contract?.editorCapabilities.layoutOverrides;
  if (!contract || !capabilities) return null;

  const showLayout = scopes.includes("layout") && Boolean(
    capabilities.framePresets?.length || capabilities.frameRatioPresets?.length ||
      capabilities.frameRatioRange || capabilities.compositionPresets?.length,
  );
  const visibleSlots = (capabilities.slots ?? []).filter(
    (slot) => !selectedNodeId || slot.roleId === selectedNodeId,
  );
  const visibleTextRoles = (capabilities.textRoles ?? []).filter(
    (role) => !selectedNodeId || role.roleId === selectedNodeId,
  );
  const showSlots = scopes.includes("slots") && visibleSlots.length > 0;
  const showText = scopes.includes("text") && visibleTextRoles.length > 0;
  const hasControls = showLayout || showSlots || showText;
  if (!hasControls) return null;

  const sourceOverrides = isRecord(props.__instanceOverrides)
    ? props.__instanceOverrides
    : undefined;
  const overrides = toVisualOverridesV2(sourceOverrides);
  const frame = isRecord(overrides.frame) ? overrides.frame : {};
  const frameAspectRatios = isRecord(frame.aspectRatioByViewport)
    ? frame.aspectRatioByViewport
    : {};
  const activeFrameRatio = Number(
    frameAspectRatios[viewport] ??
      (viewport === "mobile" ? frameAspectRatios.desktop : undefined) ??
      frame.aspectRatio,
  );
  const nodes = isRecord(overrides.nodes) ? overrides.nodes : {};

  const apply = (path: string[], value: unknown) => {
    update({
      __instanceOverrides: setVisualOverridePath(sourceOverrides, path, value),
      ...(props.__contentTemplate
        ? {}
        : { __contentTemplate: createContentTemplateMarker(moduleType) }),
    });
  };

  const applyPaths = (entries: ReadonlyArray<{ path: string[]; value: unknown }>) => {
    let next: unknown = sourceOverrides;
    for (const entry of entries) {
      next = setVisualOverridePath(next, entry.path, entry.value);
    }
    update({
      __instanceOverrides: next,
      ...(props.__contentTemplate
        ? {}
        : { __contentTemplate: createContentTemplateMarker(moduleType) }),
    });
  };

  const renderVisualChoices = (
    label: string,
    path: string[],
    value: unknown,
    options?: readonly string[],
    kind = "preset",
  ) => {
    if (!options?.length) return null;
    const activeValue = typeof value === "string" ? value : "";
    const optionLabel = (option: string) => {
      if (kind === "align") {
        return option === "left" ? "左对齐" : option === "center" ? "居中对齐" : "右对齐";
      }
      if (kind === "size") return `${LABELS[option] ?? option}字号`;
      return LABELS[option] ?? option.split(" / ").join(":");
    };
    return (
      <div className="homepage-editor__visual-preset-group" role="group" aria-label={label}>
        <span>{label}</span>
        <div className={`homepage-editor__choice-cards is-${kind}`}>
          <button
            type="button"
            className={!activeValue ? "is-active" : ""}
            onClick={() => apply(path, undefined)}
          >
            <i data-choice="default"><b /></i>
            <em>默认</em>
          </button>
          {options.map((option) => (
            <button
              key={option}
              type="button"
              className={activeValue === option ? "is-active" : ""}
              onClick={() => apply(path, option)}
            >
              <i data-choice={option}><b /></i>
              <em>{optionLabel(option)}</em>
            </button>
          ))}
        </div>
      </div>
    );
  };

  const scopedOverrideExists = Boolean(
    (showLayout && overrides?.frame) ||
      (showSlots && visibleSlots.some((slot) => nodes[slot.roleId])) ||
      (showText && visibleTextRoles.some((role) => nodes[role.roleId])) ||
      (resetAllDesign && (overrides?.frame || Object.keys(nodes).length > 0)),
  );
  const resetScopedOverrides = () => {
    let next: unknown = sourceOverrides;
    if (showLayout || resetAllDesign) next = setVisualOverridePath(next, ["frame"], undefined);
    if (showSlots || resetAllDesign) {
      for (const slot of resetAllDesign ? capabilities.slots ?? [] : visibleSlots) {
        next = setVisualOverridePath(next, ["nodes", slot.roleId], undefined);
      }
    }
    if (showText || resetAllDesign) {
      for (const role of resetAllDesign ? capabilities.textRoles ?? [] : visibleTextRoles) {
        next = setVisualOverridePath(next, ["nodes", role.roleId], undefined);
      }
    }
    update({ __instanceOverrides: next });
  };

  return (
    <section
      className={`homepage-editor__instance-overrides${embedded ? " is-embedded" : ""}`}
      aria-labelledby={`instance-overrides-${String(props.id ?? contract.key)}`}
    >
      <div className="homepage-editor__instance-heading">
        <div>
          {embedded ? null : (
            <strong id={`instance-overrides-${String(props.id ?? contract.key)}`}>
              {showSlots && !showLayout && !showText
                ? "调整画面"
                : showText && !showLayout && !showSlots
                  ? "文字布局与保护"
                  : "当前模块设计"}
            </strong>
          )}
          <small>{selectedNodeId ? "直接在画布拖动；这里用于少量精确设置。" : "调整只作用于当前模块。"}</small>
        </div>
        <button
          type="button"
          disabled={!scopedOverrideExists}
          onClick={resetScopedOverrides}
        >
          {resetAllDesign ? "恢复整个模块" : "恢复默认"}
        </button>
      </div>

      {showLayout ? renderVisualChoices(
        "整体画面",
        ["frame", "heightPreset"],
        frame.heightPreset,
        capabilities.framePresets,
        "frame",
      ) : null}
      {showLayout && capabilities.frameRatioPresets?.length ? (
        <div className="homepage-editor__visual-preset-group" role="group" aria-label="画面比例">
          <span>
            画面比例 · {viewport === "mobile" ? "移动端" : "桌面端"}
            {viewport === "mobile" && frameAspectRatios.mobile === undefined && frameAspectRatios.desktop !== undefined
              ? "（与桌面端一致）"
              : ""}
          </span>
          <div className="homepage-editor__ratio-cards">
            <button
              type="button"
              className={!Number.isFinite(activeFrameRatio) ? "is-active" : ""}
              onClick={() => apply(["frame", "aspectRatioByViewport", viewport], undefined)}
            >
              <i style={{ aspectRatio: capabilities.frameRatioPresets[0] }} />
              <em>默认</em>
            </button>
            {capabilities.frameRatioPresets.map((ratioPreset) => {
              const [width, height] = ratioPreset.split("/").map(Number);
              const ratio = width / height;
              return (
                <button
                  key={ratioPreset}
                  type="button"
                  className={Number.isFinite(activeFrameRatio) && Math.abs(activeFrameRatio - ratio) < 0.001 ? "is-active" : ""}
                  onClick={() => apply(["frame", "aspectRatioByViewport", viewport], ratio)}
                >
                  <i style={{ aspectRatio: ratioPreset }} />
                  <em>{ratioPreset}</em>
                </button>
              );
            })}
          </div>
          {capabilities.frameRatioRange ||
          (viewport === "mobile" && frameAspectRatios.mobile !== undefined) ? (
            <details className="homepage-editor__progressive-settings">
              <summary>更多设置</summary>
              <div>
                {capabilities.frameRatioRange ? (
                  <label className="homepage-editor__instance-field">
                    <span>自定义比例 · {Number.isFinite(activeFrameRatio) ? activeFrameRatio.toFixed(2) : "默认"}</span>
                    <input
                      type="range"
                      min={capabilities.frameRatioRange.min}
                      max={capabilities.frameRatioRange.max}
                      step={capabilities.frameRatioRange.step}
                      value={Number.isFinite(activeFrameRatio) ? activeFrameRatio : 16 / 9}
                      onChange={(event) => apply(["frame", "aspectRatioByViewport", viewport], Number(event.target.value))}
                    />
                  </label>
                ) : null}
                {viewport === "mobile" && frameAspectRatios.mobile !== undefined ? (
                  <button
                    type="button"
                    className="homepage-editor__inline-reset"
                    onClick={() => apply(["frame", "aspectRatioByViewport", "mobile"], undefined)}
                  >
                    与桌面端一致
                  </button>
                ) : null}
              </div>
            </details>
          ) : null}
        </div>
      ) : null}
      {showLayout ? renderVisualChoices(
        "版式",
        ["frame", "compositionPreset"],
        frame.compositionPreset,
        capabilities.compositionPresets,
        "composition",
      ) : null}

      {showSlots ? visibleSlots.map((slot) => {
        const rawValue = nodes[slot.roleId];
        const value: OverrideRecord = isRecord(rawValue) ? rawValue : {};
        const visualNode = resolveVisualNode(props, slot.roleId, viewport);
        const mediaView = isRecord(value.mediaView) ? value.mediaView : {};
        return (
          <fieldset key={slot.roleId} className="homepage-editor__instance-group">
            <legend>{ROLE_LABELS[slot.roleId] ?? slot.roleId}</legend>
            {slot.ratioPresets?.length ? (
              <div className="homepage-editor__visual-preset-group" role="group" aria-label={`${ROLE_LABELS[slot.roleId] ?? slot.roleId}比例`}>
                <span>图片比例</span>
                <div className="homepage-editor__ratio-cards">
                  <button type="button" className={!visualNode.ratio ? "is-active" : ""} onClick={() => apply(["nodes", slot.roleId, "ratio"], undefined)}>
                    <i style={{ aspectRatio: slot.ratioPresets[0] }} />
                    <em>默认</em>
                  </button>
                  {slot.ratioPresets.map((ratioPreset) => {
                    const [width, height] = ratioPreset.split("/").map(Number);
                    const ratio = width / height;
                    return (
                      <button key={ratioPreset} type="button" className={Math.abs(Number(visualNode.ratio) - ratio) < 0.001 ? "is-active" : ""} onClick={() => apply(["nodes", slot.roleId, "ratio"], ratio)}>
                        <i style={{ aspectRatio: ratioPreset }} />
                        <em>{ratioPreset}</em>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {renderVisualChoices("图片显示", ["nodes", slot.roleId, "mediaView", "fit"], mediaView.fit, slot.fit, "fit")}
            {slot.zoom ? (
              <label className="homepage-editor__instance-field">
                <span>画面缩放 · {Number(visualNode.zoom ?? 1).toFixed(2)}×</span>
                <input
                  type="range"
                  min={slot.zoom.min}
                  max={slot.zoom.max}
                  step={slot.zoom.step}
                  value={Number(visualNode.zoom ?? 1)}
                  onChange={(event) =>
                    apply(["nodes", slot.roleId, "mediaView", "zoom"], Number(event.target.value) === 1 ? undefined : Number(event.target.value))
                  }
                />
              </label>
            ) : null}
            {slot.sizePresets?.length || slot.positionPresets?.length ? (
              <details className="homepage-editor__progressive-settings">
                <summary>更多设置</summary>
                <div>
                  {renderVisualChoices(
                    "区域大小",
                    ["nodes", slot.roleId, "sizePreset"],
                    value.sizePreset,
                    slot.sizePresets,
                    "slot-size",
                  )}
                  {renderVisualChoices(
                    "区域位置",
                    ["nodes", slot.roleId, "positionPreset"],
                    value.positionPreset,
                    slot.positionPresets,
                    "slot-position",
                  )}
                </div>
              </details>
            ) : null}
          </fieldset>
        );
      }) : null}

      {showText ? visibleTextRoles.map((role) => {
        const rawValue = nodes[role.roleId];
        const value: OverrideRecord = isRecord(rawValue) ? rawValue : {};
        const typography = isRecord(value.typography) ? value.typography : {};
        const visualNode = resolveVisualNode(props, role.roleId, viewport);
        const enabled = typeof value.enabled === "boolean"
          ? value.enabled
          : typeof props[role.roleId] === "string" && props[role.roleId].trim().length > 0;
        const currentWidth = visualNode.rect?.width;
        const currentPosition = visualNode.rect
          ? visualNode.rect.x < 0.2
            ? "left"
            : visualNode.rect.x + visualNode.rect.width > 0.8
              ? "right"
              : "center"
          : undefined;
        const updateRectPreset = (position: string, widthPreset?: string) => {
          const widthMap: Record<string, number> = { narrow: 0.34, standard: 0.48, wide: 0.68 };
          const requestedWidth = widthMap[widthPreset ?? ""] ?? currentWidth ?? (viewport === "mobile" ? 0.86 : 0.48);
          const width = viewport === "mobile" ? Math.min(0.9, requestedWidth) : requestedWidth;
          const x = position === "left" ? 0.06 : position === "right" ? 0.94 - width : (1 - width) / 2;
          const defaultY: Record<string, number> = { eyebrow: 0.54, title: 0.61, subtitle: 0.76, actionText: 0.86 };
          const heightMap: Record<string, number> = { eyebrow: 0.08, title: 0.16, subtitle: 0.1, actionText: 0.08 };
          applyPaths([{
            path: ["nodes", role.roleId, "rectByViewport", viewport],
            value: {
              x: Math.max(0, Math.min(1 - width, x)),
              y: visualNode.rect?.y ?? defaultY[role.roleId] ?? 0.62,
              width,
              height: visualNode.rect?.height ?? heightMap[role.roleId] ?? 0.1,
            },
          }]);
        };
        return (
          <fieldset key={role.roleId} className="homepage-editor__instance-group">
            <legend>{ROLE_LABELS[role.roleId] ?? role.roleId}</legend>
            <label className="homepage-editor__instance-toggle">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => apply(["nodes", role.roleId, "enabled"], event.target.checked)}
              />
              <span>显示这段文字</span>
            </label>
            {enabled ? (
              <>
                {role.widthPresets?.length ? (
                  <div className="homepage-editor__visual-preset-group" role="group" aria-label={`${ROLE_LABELS[role.roleId] ?? role.roleId}宽度`}>
                    <span>文字宽度</span>
                    <div className="homepage-editor__text-width-cards">
                      {role.widthPresets.map((widthPreset) => {
                        const widthMap: Record<string, number> = { narrow: 0.34, standard: 0.48, wide: 0.68 };
                        return (
                          <button
                            key={widthPreset}
                            type="button"
                            className={currentWidth && Math.abs(currentWidth - Math.min(viewport === "mobile" ? 0.9 : 1, widthMap[widthPreset] ?? 0.48)) < 0.02 ? "is-active" : ""}
                            onClick={() => updateRectPreset(currentPosition ?? "center", widthPreset)}
                          >
                            <i style={{ width: `${(widthMap[widthPreset] ?? 0.48) * 100}%` }} />
                            <em>{LABELS[widthPreset] ?? widthPreset}</em>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                {renderVisualChoices(
                  "字号级别",
                  ["nodes", role.roleId, "typography", "sizeLevel"],
                  typography.sizeLevel,
                  role.sizePresets?.map((preset) => TEXT_SIZE_LEVELS[preset] ?? preset),
                  "size",
                )}
                {renderVisualChoices("文字对齐", ["nodes", role.roleId, "typography", "align"], typography.align, role.align, "align")}
                {role.colorTokens?.length ? (
                  <div className="homepage-editor__visual-preset-group" role="group" aria-label={`${ROLE_LABELS[role.roleId] ?? role.roleId}颜色`}>
                    <span>文字颜色</span>
                    <div className="homepage-editor__color-cards">
                      {role.colorTokens.map((token) => (
                        <button
                          key={token}
                          type="button"
                          className={typography.color === TEXT_COLORS[token] ? "is-active" : ""}
                          onClick={() => apply(["nodes", role.roleId, "typography", "color"], TEXT_COLORS[token])}
                          aria-label={LABELS[token] ?? token}
                        >
                          <i style={{ background: TEXT_COLORS[token] }} />
                          <em>{LABELS[token] ?? token}</em>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {role.placementPresets?.length || role.maxLines || role.requiresSafeBand ? (
                  <details className="homepage-editor__progressive-settings">
                    <summary>更多设置</summary>
                    <div>
                      {role.placementPresets?.length ? (
                        <div className="homepage-editor__visual-preset-group" role="group" aria-label={`${ROLE_LABELS[role.roleId] ?? role.roleId}位置`}>
                          <span>精确位置</span>
                          <div className="homepage-editor__position-cards">
                            {role.placementPresets.map((position) => (
                              <button
                                key={position}
                                type="button"
                                className={currentPosition === position ? "is-active" : ""}
                                onClick={() => updateRectPreset(position)}
                              >
                                <i data-position={position}><b /></i>
                                <em>{LABELS[position] ?? position}</em>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {role.maxLines ? (
                        <label className="homepage-editor__instance-field">
                          <span>最多显示 {Number(typography.maxLines ?? role.maxLines)} 行</span>
                          <input
                            type="range"
                            min={1}
                            max={role.maxLines}
                            step={1}
                            value={Number(typography.maxLines ?? role.maxLines)}
                            onChange={(event) => apply(["nodes", role.roleId, "typography", "maxLines"], Number(event.target.value))}
                          />
                        </label>
                      ) : null}
                      {role.requiresSafeBand
                        ? renderVisualChoices("安全文字带", ["nodes", role.roleId, "typography", "safeBand"], typography.safeBand, ["light", "dark"], "safe-band")
                        : null}
                    </div>
                  </details>
                ) : null}
              </>
            ) : null}
          </fieldset>
        );
      }) : null}
    </section>
  );
}
