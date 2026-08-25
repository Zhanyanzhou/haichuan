import {
  createContentTemplateMarker,
  getContentTemplateContract,
  getContentTemplateDefaultRect,
  getContentTemplateEditableObject,
} from "../generated/contentTemplates.generated";
import {
  resolveVisualNode,
  setVisualOverridePath,
  toVisualOverridesV2,
  type VisualViewport,
} from "../runtime/visualLayout";
import InspectorDisclosure from "./InspectorDisclosure";

type OverrideRecord = Record<string, unknown>;

interface InstanceOverridesPanelProps {
  moduleType: string;
  props: Record<string, any>;
  update: (patch: Record<string, any>) => void;
  updateHistoryTransaction: (
    patch: Record<string, any> | ((props: Record<string, any>) => Record<string, any>),
  ) => void;
  historyTransactionPending: boolean;
  scopes?: ReadonlyArray<"layout" | "slots" | "text" | "surface" | "appearance">;
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
  none: "无",
  soft: "柔和",
  canvas: "明亮",
  mist: "柔灰",
  inkSurface: "深色",
  square: "直角",
  rounded: "圆润",
  lifted: "悬浮",
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

const NINE_POINT_POSITIONS = [
  { x: 0, y: 0, label: "左上" },
  { x: 50, y: 0, label: "顶部居中" },
  { x: 100, y: 0, label: "右上" },
  { x: 0, y: 50, label: "左侧居中" },
  { x: 50, y: 50, label: "居中" },
  { x: 100, y: 50, label: "右侧居中" },
  { x: 0, y: 100, label: "左下" },
  { x: 50, y: 100, label: "底部居中" },
  { x: 100, y: 100, label: "右下" },
] as const;

function isRecord(value: unknown): value is OverrideRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export default function InstanceOverridesPanel({
  moduleType,
  props,
  update,
  updateHistoryTransaction,
  historyTransactionPending,
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
  const selectedEditableObject = selectedNodeId
    ? getContentTemplateEditableObject(moduleType, selectedNodeId)
    : undefined;
  const supportsObjectAppearance = Boolean(
    selectedEditableObject && ["media", "video", "product", "collection"].includes(
      selectedEditableObject.kind,
    ),
  );
  const showSurface = scopes.includes("surface");
  const showAppearance = scopes.includes("appearance") && supportsObjectAppearance;
  const hasControls = showLayout || showSlots || showText || showSurface || showAppearance;
  if (!hasControls) return null;

  const sourceOverrides = isRecord(props.__instanceOverrides)
    ? props.__instanceOverrides
    : undefined;
  const overrides = toVisualOverridesV2(sourceOverrides);
  const frame = isRecord(overrides.frame) ? overrides.frame : {};
  const frameAspectRatios = isRecord(frame.aspectRatioByViewport)
    ? frame.aspectRatioByViewport
    : {};
  const hasActiveFrameRatioOverride = Object.prototype.hasOwnProperty.call(
    frameAspectRatios,
    viewport,
  );
  const activeFrameRatio = Number(
    frameAspectRatios[viewport] ?? frame.aspectRatio ??
      contract.defaultGeometryByViewport[viewport].frameAspectRatio,
  );
  const nodes = isRecord(overrides.nodes) ? overrides.nodes : {};
  const selectedRawNode = selectedNodeId && isRecord(nodes[selectedNodeId])
    ? nodes[selectedNodeId]
    : {};
  const selectedRects = isRecord(selectedRawNode.rectByViewport)
    ? selectedRawNode.rectByViewport
    : {};
  const selectedZIndexes = isRecord(selectedRawNode.zIndexByViewport)
    ? selectedRawNode.zIndexByViewport
    : {};
  const selectedMediaView = isRecord(selectedRawNode.mediaView)
    ? selectedRawNode.mediaView
    : {};
  const selectedFocus = isRecord(selectedMediaView.focusByViewport)
    ? selectedMediaView.focusByViewport
    : {};
  const hasMobileSpecificDesign = selectedNodeId
    ? [selectedRects, selectedZIndexes, selectedFocus].some((value) =>
        Object.prototype.hasOwnProperty.call(value, "mobile"),
      )
    : Object.prototype.hasOwnProperty.call(frameAspectRatios, "mobile");
  const deviceState = viewport === "desktop"
    ? "desktop"
    : hasMobileSpecificDesign
      ? "mobile-independent"
      : "mobile-default";
  const deviceLabel = viewport === "mobile" ? "移动端" : "桌面端";
  const sharedDesignLabel = showSurface
    ? "模块外观双端共用；留白遵循模板流式结构"
    : showAppearance
      ? "对象圆角与阴影双端共用"
    : showSlots && !showText
    ? "位置与焦点按当前端独立保存"
    : showText && !showSlots
      ? "位置与尺寸按当前端独立保存"
      : "桌面端与移动端构图互不覆盖";
  const viewportDesignLabel = showSurface
    ? "配色、圆角、阴影与留白作用于整个模板"
    : showAppearance
      ? "对象外观不会改变槽位位置和内容"
    : selectedNodeId
    ? `位置与层级作用于当前${deviceLabel}${showSlots ? "；图片焦点也按设备保存" : ""}`
    : `整体比例作用于当前${deviceLabel}`;

  const apply = (path: string[], value: unknown) => {
    update({
      __instanceOverrides: setVisualOverridePath(sourceOverrides, path, value),
      ...(props.__contentTemplate
        ? {}
        : { __contentTemplate: createContentTemplateMarker(moduleType) }),
    });
  };

  const applyHistoryTransaction = (path: string[], value: unknown) => {
    updateHistoryTransaction((currentProps) => ({
      __instanceOverrides: setVisualOverridePath(
        currentProps.__instanceOverrides,
        path,
        value,
      ),
      ...(currentProps.__contentTemplate
        ? {}
        : { __contentTemplate: createContentTemplateMarker(moduleType) }),
    }));
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
  const copyCurrentViewportToOther = () => {
    const targetViewport: VisualViewport = viewport === "desktop" ? "mobile" : "desktop";
    const entries: Array<{ path: string[]; value: unknown }> = [];
    if (showLayout) {
      entries.push({
        path: ["frame", "aspectRatioByViewport", targetViewport],
        value: activeFrameRatio,
      });
    }
    if (selectedNodeId) {
      const visualNode = resolveVisualNode(props, selectedNodeId, viewport);
      if (visualNode.rect) {
        entries.push({
          path: ["nodes", selectedNodeId, "rectByViewport", targetViewport],
          value: visualNode.rect,
        });
      }
      if (visualNode.focus) {
        entries.push({
          path: ["nodes", selectedNodeId, "mediaView", "focusByViewport", targetViewport],
          value: visualNode.focus,
        });
      }
    }
    if (entries.length) applyPaths(entries);
  };

  const renderSelectedNodeGeometry = (nodeId: string) => {
    if (selectedNodeId !== nodeId) return null;
    const visualNode = resolveVisualNode(props, nodeId, viewport);
    const rect = visualNode.rect ?? getContentTemplateDefaultRect(moduleType, nodeId, viewport);
    const editableObject = getContentTemplateEditableObject(moduleType, nodeId);
    const constraints = editableObject?.constraints;
    const bounds = constraints?.safeAreaRequired
      ? contract.defaultGeometryByViewport[viewport].safeArea
      : { x: 0, y: 0, width: 1, height: 1 };
    const rawNode = isRecord(nodes[nodeId]) ? nodes[nodeId] : {};
    const zIndexByViewport = isRecord(rawNode.zIndexByViewport)
      ? rawNode.zIndexByViewport
      : {};
    const viewportZIndex = zIndexByViewport[viewport];
    const activeZIndex = Number.isInteger(Number(viewportZIndex))
      ? Number(viewportZIndex)
      : 2;
    const deviceLabel = viewport === "mobile" ? "移动端" : "桌面端";
    const updateRect = (key: "x" | "y" | "width" | "height", value: number) => {
      if (!rect) return;
      const next = { ...rect, [key]: value };
      if (key === "x") next.x = Math.min(bounds.x + bounds.width - next.width, Math.max(bounds.x, next.x));
      if (key === "y") next.y = Math.min(bounds.y + bounds.height - next.height, Math.max(bounds.y, next.y));
      if (key === "width") next.width = Math.min(bounds.x + bounds.width - next.x, constraints?.maxSize.width ?? 1, Math.max(constraints?.minSize.width ?? 0.05, next.width));
      if (key === "height") next.height = Math.min(bounds.y + bounds.height - next.y, constraints?.maxSize.height ?? 1, Math.max(constraints?.minSize.height ?? 0.05, next.height));
      apply(["nodes", nodeId, "rectByViewport", viewport], next);
    };
    const applyZIndex = (value: number) => {
      apply(
        ["nodes", nodeId, "zIndexByViewport", viewport],
        value,
      );
    };
    return (
      <div
        className="homepage-editor__selected-node-geometry"
        data-visual-geometry-node={nodeId}
        data-visual-geometry-viewport={viewport}
      >
        <div
        className="homepage-editor__visual-preset-group"
        role="group"
        data-inspector-control="layer"
        aria-label={`图层顺序（${deviceLabel}）`}
        >
          <span>图层顺序 · 当前层级 {activeZIndex}</span>
          <div className="homepage-editor__choice-cards is-layer-order">
            <button type="button" onClick={() => applyZIndex(0)} disabled={activeZIndex <= 0}>
              <em>置于底层</em>
            </button>
            <button type="button" onClick={() => applyZIndex(Math.max(0, activeZIndex - 1))} disabled={activeZIndex <= 0}>
              <em>下移一层</em>
            </button>
            <button type="button" onClick={() => applyZIndex(Math.min(20, activeZIndex + 1))} disabled={activeZIndex >= 20}>
              <em>上移一层</em>
            </button>
            <button type="button" onClick={() => applyZIndex(20)} disabled={activeZIndex >= 20}>
              <em>置于顶层</em>
            </button>
          </div>
        </div>
        <InspectorDisclosure label="精确位置与尺寸">
          {rect ? (
            <div className="homepage-editor__geometry-fields">
              {([
                ["x", "横向位置", bounds.x, bounds.x + bounds.width - rect.width],
                ["y", "纵向位置", bounds.y, bounds.y + bounds.height - rect.height],
                ["width", "区域宽度", constraints?.minSize.width ?? 0.05, Math.min(constraints?.maxSize.width ?? 1, bounds.x + bounds.width - rect.x)],
                ["height", "区域高度", constraints?.minSize.height ?? 0.05, Math.min(constraints?.maxSize.height ?? 1, bounds.y + bounds.height - rect.y)],
              ] as const).map(([key, label, min, max]) => (
                <label key={key} className="homepage-editor__instance-field">
                  <span>{label} · {Math.round(rect[key] * 100)}%</span>
                  <input
                    aria-label={`${label}（${deviceLabel}）`}
                    type="range"
                    min={Math.round(min * 100)}
                    max={Math.round(max * 100)}
                    step={1}
                    value={Math.round(rect[key] * 100)}
                    onChange={(event) => updateRect(key, Number(event.target.value) / 100)}
                  />
                </label>
              ))}
              <button
                type="button"
                className="homepage-editor__inline-reset"
                disabled={historyTransactionPending}
                onClick={() => applyHistoryTransaction(
                  ["nodes", nodeId, "rectByViewport", viewport],
                  undefined,
                )}
              >
                恢复{deviceLabel}默认位置
              </button>
            </div>
          ) : (
            <p className="homepage-editor__inspector-hint">
              先在画布拖动对象，再在这里精确微调。
            </p>
          )}
        </InspectorDisclosure>
      </div>
    );
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
      <div
        className="homepage-editor__visual-preset-group"
        role="group"
        aria-label={label}
        data-inspector-control={kind}
      >
        <span>{label}</span>
        <div className={`homepage-editor__choice-cards is-${kind}`}>
          <button
            type="button"
            className={!activeValue ? "is-active" : ""}
            aria-pressed={!activeValue}
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
              aria-pressed={activeValue === option}
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
      (showSurface && ["colorPreset", "paddingPreset", "radiusPreset", "shadowPreset"].some(
        (key) => frame[key] !== undefined,
      )) ||
      (showAppearance && selectedNodeId && isRecord(nodes[selectedNodeId]) &&
        isRecord((nodes[selectedNodeId] as OverrideRecord).appearance)) ||
      (resetAllDesign && (overrides?.frame || Object.keys(nodes).length > 0)),
  );
  const createResetPatch = (currentProps: Record<string, any>) => {
    let next: unknown = currentProps.__instanceOverrides;
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
    if (showSurface && !resetAllDesign) {
      for (const key of ["colorPreset", "paddingPreset", "radiusPreset", "shadowPreset"]) {
        next = setVisualOverridePath(next, ["frame", key], undefined);
      }
    }
    if (showAppearance && selectedNodeId && !resetAllDesign) {
      next = setVisualOverridePath(next, ["nodes", selectedNodeId, "appearance"], undefined);
    }
    return { __instanceOverrides: next };
  };
  const resetScopedOverrides = () => {
    updateHistoryTransaction(createResetPatch);
  };
  const resetLabel = showSurface
    ? "恢复模块样式默认"
    : showAppearance && selectedNodeId
      ? `恢复${ROLE_LABELS[selectedNodeId] ?? selectedNodeId}外观默认`
      : selectedNodeId
        ? `恢复${ROLE_LABELS[selectedNodeId] ?? selectedNodeId}设计默认`
        : "恢复整个模块设计默认";

  return (
    <section
      className={`homepage-editor__instance-overrides${embedded ? " is-embedded" : ""}`}
      aria-labelledby={`instance-overrides-${String(props.id ?? contract.key)}`}
    >
      <div
        className="homepage-editor__instance-heading"
        data-device-state={deviceState}
      >
        <div>
          {embedded ? null : (
            <strong id={`instance-overrides-${String(props.id ?? contract.key)}`}>
              {showSurface
                ? "模块样式"
                : showAppearance
                  ? "对象样式"
              : showSlots && !showLayout && !showText
                ? "调整画面"
                : showText && !showLayout && !showSlots
                  ? "文字布局与保护"
                  : "当前模块设计"}
            </strong>
          )}
        </div>
        <button
          type="button"
          disabled={!scopedOverrideExists || historyTransactionPending}
          onClick={resetScopedOverrides}
          aria-label={resetLabel}
        >
          {showSurface
            ? "恢复模块样式"
            : showAppearance
              ? "恢复当前对象外观"
              : resetAllDesign
                ? "恢复模块设计"
                : "恢复当前对象设计"}
        </button>
        {!showSurface && !showAppearance ? <button
          type="button"
          disabled={historyTransactionPending}
          onClick={copyCurrentViewportToOther}
        >
          复制到{viewport === "desktop" ? "移动端" : "桌面端"}
        </button> : null}
      </div>
      <div
        className="homepage-editor__design-scope-note"
        data-responsive-scope={selectedNodeId ? "mixed" : "module"}
        role="note"
      >
        <strong>{sharedDesignLabel}</strong>
        <span>
          {viewportDesignLabel}
          {viewport === "mobile"
            ? hasMobileSpecificDesign
              ? " · 已有移动端独立位置"
              : " · 使用移动端默认构图"
            : ""}
        </span>
      </div>

      {showLayout ? renderVisualChoices(
        "整体画面",
        ["frame", "heightPreset"],
        frame.heightPreset,
        capabilities.framePresets,
        "frame",
      ) : null}
      {showLayout && capabilities.frameRatioPresets?.length ? (
        <div className="homepage-editor__visual-preset-group" role="group" aria-label="画面比例" data-inspector-control="ratio">
          <span>
            画面比例 · {viewport === "mobile" ? "移动端" : "桌面端"}
          </span>
          <div className="homepage-editor__ratio-cards">
            <button
              type="button"
              className={!hasActiveFrameRatioOverride ? "is-active" : ""}
              aria-pressed={!hasActiveFrameRatioOverride}
              onClick={() => apply(["frame", "aspectRatioByViewport", viewport], undefined)}
            >
              <i style={{ aspectRatio: activeFrameRatio }} />
              <em>默认</em>
            </button>
            {capabilities.frameRatioPresets.map((ratioPreset) => {
              const [width, height] = ratioPreset.split("/").map(Number);
              const ratio = width / height;
              return (
                <button
                  key={ratioPreset}
                  type="button"
                  className={hasActiveFrameRatioOverride && Math.abs(activeFrameRatio - ratio) < 0.001 ? "is-active" : ""}
                  aria-pressed={hasActiveFrameRatioOverride && Math.abs(activeFrameRatio - ratio) < 0.001}
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
            <InspectorDisclosure label="高级设置">
              <div className="homepage-editor__advanced-settings-grid">
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
                    disabled={historyTransactionPending}
                    onClick={() => applyHistoryTransaction(
                      ["frame", "aspectRatioByViewport", "mobile"],
                      undefined,
                    )}
                  >
                    恢复移动端默认比例
                  </button>
                ) : null}
              </div>
            </InspectorDisclosure>
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

      {showSurface ? (
        <>
          {renderVisualChoices("模板配色", ["frame", "colorPreset"], frame.colorPreset, ["canvas", "mist", "inkSurface"], "surface-color")}
          {contract.flow === "flow"
            ? renderVisualChoices("模块留白", ["frame", "paddingPreset"], frame.paddingPreset, ["compact", "standard", "spacious"], "surface-padding")
            : null}
          {contract.flow === "flow"
            ? renderVisualChoices("模块圆角", ["frame", "radiusPreset"], frame.radiusPreset, ["square", "soft", "rounded"], "surface-radius")
            : null}
          {contract.flow === "flow"
            ? renderVisualChoices("模块阴影", ["frame", "shadowPreset"], frame.shadowPreset, ["none", "soft", "lifted"], "surface-shadow")
            : null}
        </>
      ) : null}

      {showAppearance && selectedNodeId ? (
        <fieldset
          className="homepage-editor__instance-group"
          data-selected-object="true"
          data-object-appearance={selectedNodeId}
        >
          <legend>{ROLE_LABELS[selectedNodeId] ?? selectedNodeId}外观</legend>
          {renderVisualChoices(
            "对象圆角",
            ["nodes", selectedNodeId, "appearance", "radiusPreset"],
            isRecord(selectedRawNode.appearance) ? selectedRawNode.appearance.radiusPreset : undefined,
            ["square", "soft", "rounded"],
            "object-radius",
          )}
          {renderVisualChoices(
            "对象阴影",
            ["nodes", selectedNodeId, "appearance", "shadowPreset"],
            isRecord(selectedRawNode.appearance) ? selectedRawNode.appearance.shadowPreset : undefined,
            ["none", "soft", "lifted"],
            "object-shadow",
          )}
        </fieldset>
      ) : null}

      {showSlots ? visibleSlots.map((slot) => {
        const rawValue = nodes[slot.roleId];
        const value: OverrideRecord = isRecord(rawValue) ? rawValue : {};
        const visualNode = resolveVisualNode(props, slot.roleId, viewport);
        const mediaView = isRecord(value.mediaView) ? value.mediaView : {};
        return (
          <fieldset
            key={slot.roleId}
            className="homepage-editor__instance-group"
            data-selected-object={selectedNodeId ? "true" : "false"}
          >
            <legend>{ROLE_LABELS[slot.roleId] ?? slot.roleId}</legend>
            {slot.ratioPresets?.length ? (
              <div className="homepage-editor__visual-preset-group" role="group" aria-label={`${ROLE_LABELS[slot.roleId] ?? slot.roleId}比例`} data-inspector-control="ratio">
                <span>图片比例</span>
                <div className="homepage-editor__ratio-cards">
                  <button type="button" className={!visualNode.ratio ? "is-active" : ""} aria-pressed={!visualNode.ratio} onClick={() => apply(["nodes", slot.roleId, "ratio"], undefined)}>
                    <i style={{ aspectRatio: slot.ratioPresets[0] }} />
                    <em>默认</em>
                  </button>
                  {slot.ratioPresets.map((ratioPreset) => {
                    const [width, height] = ratioPreset.split("/").map(Number);
                    const ratio = width / height;
                    return (
                      <button key={ratioPreset} type="button" className={Math.abs(Number(visualNode.ratio) - ratio) < 0.001 ? "is-active" : ""} aria-pressed={Math.abs(Number(visualNode.ratio) - ratio) < 0.001} onClick={() => apply(["nodes", slot.roleId, "ratio"], ratio)}>
                        <i style={{ aspectRatio: ratioPreset }} />
                        <em>{ratioPreset}</em>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {renderVisualChoices("填充方式", ["nodes", slot.roleId, "mediaView", "fit"], mediaView.fit, slot.fit, "fit")}
            {slot.focusByViewport ? (
              <div
                className="homepage-editor__visual-preset-group"
                role="group"
                data-inspector-control="focus"
                aria-label={`${ROLE_LABELS[slot.roleId] ?? slot.roleId}画面焦点（${viewport === "mobile" ? "移动端" : "桌面端"}）`}
              >
                <span>画面焦点</span>
                <div className="homepage-editor__nine-point-grid">
                  {NINE_POINT_POSITIONS.map((point) => {
                    const active = Math.abs((visualNode.focus?.x ?? 50) - point.x) < 1 &&
                      Math.abs((visualNode.focus?.y ?? 50) - point.y) < 1;
                    return (
                      <button
                        key={`${point.x}-${point.y}`}
                        type="button"
                        aria-label={`焦点：${point.label}`}
                        aria-pressed={active}
                        className={active ? "is-active" : ""}
                        data-focus-x={point.x}
                        data-focus-y={point.y}
                        onClick={() => apply(
                          ["nodes", slot.roleId, "mediaView", "focusByViewport", viewport],
                          { x: point.x, y: point.y },
                        )}
                      >
                        <i aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>
                {viewport === "mobile" && Object.prototype.hasOwnProperty.call(
                  isRecord(mediaView.focusByViewport) ? mediaView.focusByViewport : {},
                  "mobile",
                ) ? (
                  <button
                    type="button"
                    className="homepage-editor__inline-reset"
                    disabled={historyTransactionPending}
                    onClick={() => applyHistoryTransaction(
                      ["nodes", slot.roleId, "mediaView", "focusByViewport", "mobile"],
                      undefined,
                    )}
                  >
                    恢复移动端默认焦点
                  </button>
                ) : null}
              </div>
            ) : null}
            {slot.zoom ? (
              <label className="homepage-editor__instance-field" data-inspector-control="zoom">
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
            {renderSelectedNodeGeometry(slot.roleId)}
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
        const updateRectPoint = (point: (typeof NINE_POINT_POSITIONS)[number]) => {
          const width = visualNode.rect?.width ?? (viewport === "mobile" ? 0.86 : 0.48);
          const height = visualNode.rect?.height ?? 0.12;
          const x = point.x === 0 ? 0.06 : point.x === 100 ? 0.94 - width : (1 - width) / 2;
          const y = point.y === 0 ? 0.06 : point.y === 100 ? 0.94 - height : (1 - height) / 2;
          apply(["nodes", role.roleId, "rectByViewport", viewport], {
            x: Math.max(0, Math.min(1 - width, x)),
            y: Math.max(0, Math.min(1 - height, y)),
            width,
            height,
          });
        };
        return (
          <fieldset
            key={role.roleId}
            className="homepage-editor__instance-group"
            data-selected-object={selectedNodeId ? "true" : "false"}
          >
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
                <div
                  className="homepage-editor__visual-preset-group"
                  role="group"
                  data-inspector-control="position"
                  aria-label={`${ROLE_LABELS[role.roleId] ?? role.roleId}快速定位（${viewport === "mobile" ? "移动端" : "桌面端"}）`}
                >
                  <span>快速定位</span>
                  <div className="homepage-editor__nine-point-grid">
                    {NINE_POINT_POSITIONS.map((point) => {
                      const width = visualNode.rect?.width ?? (viewport === "mobile" ? 0.86 : 0.48);
                      const height = visualNode.rect?.height ?? 0.12;
                      const centerX = visualNode.rect
                        ? visualNode.rect.x + visualNode.rect.width / 2
                        : 0.5;
                      const centerY = visualNode.rect
                        ? visualNode.rect.y + visualNode.rect.height / 2
                        : 0.5;
                      const targetX = point.x === 0
                        ? 0.06 + width / 2
                        : point.x === 100
                          ? 0.94 - width / 2
                          : 0.5;
                      const targetY = point.y === 0
                        ? 0.06 + height / 2
                        : point.y === 100
                          ? 0.94 - height / 2
                          : 0.5;
                      const active = Math.abs(centerX - targetX) < 0.02 &&
                        Math.abs(centerY - targetY) < 0.02;
                      return (
                        <button
                          key={`${point.x}-${point.y}`}
                          type="button"
                          aria-label={`位置：${point.label}`}
                          aria-pressed={active}
                          className={active ? "is-active" : ""}
                          data-position-x={point.x}
                          data-position-y={point.y}
                          onClick={() => updateRectPoint(point)}
                        >
                          <i aria-hidden="true" />
                        </button>
                      );
                    })}
                  </div>
                </div>
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
                {renderSelectedNodeGeometry(role.roleId)}
                {role.placementPresets?.length || role.maxLines || role.requiresSafeBand ? (
                  <InspectorDisclosure label="高级设置">
                    <div className="homepage-editor__advanced-settings-grid">
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
                  </InspectorDisclosure>
                ) : null}
              </>
            ) : null}
          </fieldset>
        );
      }) : null}
    </section>
  );
}
