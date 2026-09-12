import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { FullscreenOutlined } from "@ant-design/icons";
import type { TemplateDesignHeightMode } from "../template-definition";
import { useCommittedNumberInput } from "../inspector/controls/NumberField";

interface EditableCanvasSize {
  width: number;
  height: number;
  heightMode: TemplateDesignHeightMode;
  ratioLabel: string;
  device: "desktop" | "mobile";
  minWidth: number;
  maxWidth: number;
  canRestore: boolean;
  previewWidthOnly?: boolean;
  overflow?: { horizontal: number; vertical: number; nodeId?: string };
  onWidthChange: (width: number) => void;
  onHeightChange?: (height: number) => void;
  onHeightModeChange?: (mode: TemplateDesignHeightMode) => void;
  onRatioChange?: (ratio: { width: number; height: number }) => void;
  onRestore?: () => void;
  onLocateOverflow: () => void;
}

const DESKTOP_RATIO_PRESETS = ["21:9", "16:9", "3:2", "4:3", "1:1"] as const;
const MOBILE_RATIO_PRESETS = ["1:1", "4:5", "3:4", "9:16"] as const;
const DESKTOP_WIDTH_PRESETS = [1280, 1440, 1920, 2560] as const;
const MOBILE_WIDTH_PRESETS = [320, 375, 390, 430] as const;

export function CanvasDimensionInput({
  label,
  shortLabel,
  value,
  min,
  max,
  onCommit,
  commitUnchanged = false,
  allowDecimals = false,
}: {
  label: string;
  shortLabel: string;
  value: number;
  min: number;
  max: number;
  onCommit: (value: number) => void;
  commitUnchanged?: boolean;
  allowDecimals?: boolean;
}) {
  const displayValue = allowDecimals ? value : Math.round(value);
  const errorId = `${useId()}-error`;
  const transaction = useCommittedNumberInput({
    label,
    value: displayValue,
    min,
    max,
    onCommit,
    commitUnchanged,
  });

  return (
    <label className="template-editor__canvas-size-field">
      <span aria-hidden="true">{shortLabel}</span>
      <input
        ref={transaction.inputRef}
        type="text"
        role="spinbutton"
        inputMode={allowDecimals ? "decimal" : "numeric"}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={transaction.draft.trim() && Number.isFinite(Number(transaction.draft)) ? Number(transaction.draft) : undefined}
        aria-label={label}
        data-number-step={allowDecimals ? "any" : 1}
        min={min}
        max={max}
        data-committed-number-input="true"
        value={transaction.draft}
        aria-invalid={transaction.error ? "true" : undefined}
        aria-describedby={transaction.error ? errorId : undefined}
        onChange={(event) => transaction.setDraft(event.target.value)}
        onBlur={transaction.onBlur}
        onKeyDown={transaction.onKeyDown}
      />
      {transaction.error ? <span id={errorId} className="homepage-editor__field-error" role="alert">{transaction.error}</span> : null}
    </label>
  );
}

function CanvasRatioInput({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (value: { width: number; height: number }) => void;
}) {
  const [width, height] = /^\d+:\d+$/.test(value)
    ? value.split(":").map(Number)
    : [1, 1];
  return (
    <span className="template-editor__canvas-ratio-field" role="group" aria-label="模板固定比例">
      <CanvasDimensionInput
        label="比例宽"
        shortLabel="比"
        value={width}
        min={1}
        max={1000}
        onCommit={(nextWidth) => onCommit({ width: nextWidth, height })}
      />
      <span aria-hidden="true">:</span>
      <CanvasDimensionInput
        label="比例高"
        shortLabel=""
        value={height}
        min={1}
        max={1000}
        onCommit={(nextHeight) => onCommit({ width, height: nextHeight })}
      />
    </span>
  );
}

function CanvasZoomInput({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (scale: number) => void;
}) {
  const percentage = Math.round(value * 100);
  const [draftValue, setDraftValue] = useState(String(percentage));
  const [edited, setEdited] = useState(false);

  useEffect(() => {
    if (edited) return;
    setDraftValue(String(percentage));
  }, [edited, percentage]);

  const commit = () => {
    if (!edited) return;
    const parsed = Number.parseInt(draftValue, 10);
    const nextPercentage = Number.isFinite(parsed)
      ? Math.min(200, Math.max(10, parsed))
      : percentage;
    setDraftValue(String(nextPercentage));
    setEdited(false);
    onCommit(nextPercentage / 100);
  };

  return (
    <label className="template-editor__canvas-zoom-field">
      <span className="sr-only">画布缩放百分比</span>
      <input
        type="number"
        inputMode="numeric"
        aria-label="画布缩放百分比"
        min={10}
        max={200}
        step={5}
        value={draftValue}
        onChange={(event) => {
          setDraftValue(event.target.value);
          setEdited(true);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            setDraftValue(String(percentage));
            setEdited(false);
            event.currentTarget.blur();
          }
        }}
      />
      <span aria-hidden="true">%</span>
    </label>
  );
}

export default function WorkspaceCanvasControls({
  isFitView,
  zoom,
  viewportLabel,
  editableSize,
  onFit,
  onActualSize,
  onZoomChange,
  onZoomOut,
  onZoomIn,
  panMode = false,
  showGrid = false,
  showCenterGuides = false,
  showSafeArea = false,
  snapToGrid = true,
  canLocateSelection = false,
  onPanModeChange,
  onGridChange,
  onCenterGuidesChange,
  onSafeAreaChange,
  onSnapToGridChange,
  onLocateSelection,
  onFitSelection,
  viewActions,
  variant = "full",
}: {
  isFitView: boolean;
  zoom: number;
  viewportLabel: string;
  editableSize?: EditableCanvasSize;
  onFit: () => void;
  onActualSize: () => void;
  onZoomChange?: (scale: number) => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
  panMode?: boolean;
  showGrid?: boolean;
  showCenterGuides?: boolean;
  showSafeArea?: boolean;
  snapToGrid?: boolean;
  canLocateSelection?: boolean;
  onPanModeChange?: () => void;
  onGridChange?: () => void;
  onCenterGuidesChange?: () => void;
  onSafeAreaChange?: () => void;
  onSnapToGridChange?: () => void;
  onLocateSelection?: () => void;
  onFitSelection?: () => void;
  viewActions?: ReactNode;
  variant?: "full" | "minimal";
}) {
  const [isSizeEditorOpen, setIsSizeEditorOpen] = useState(false);
  const [isViewToolsOpen, setIsViewToolsOpen] = useState(false);
  const controlsRef = useRef<HTMLDivElement>(null);
  const sizeTriggerRef = useRef<HTMLButtonElement>(null);
  const viewToolsTriggerRef = useRef<HTMLButtonElement>(null);
  const sizePanelId = useId();
  const viewToolsPanelId = useId();
  const ratioPresets: readonly string[] = editableSize?.device === "mobile"
    ? MOBILE_RATIO_PRESETS
    : DESKTOP_RATIO_PRESETS;
  const widthPresets: readonly number[] = editableSize?.device === "mobile"
    ? MOBILE_WIDTH_PRESETS
    : DESKTOP_WIDTH_PRESETS;
  const selectedRatioPreset = editableSize?.heightMode === "aspect-ratio"
    && ratioPresets.includes(editableSize.ratioLabel)
    ? editableSize.ratioLabel
    : "";
  const sizeSummary = editableSize
    ? editableSize.previewWidthOnly ? `${Math.round(editableSize.width)} px` : editableSize.heightMode === "fixed"
      ? `${Math.round(editableSize.width)} × ${Math.round(editableSize.height)}`
      : editableSize.heightMode === "aspect-ratio"
        ? `${Math.round(editableSize.width)} · ${editableSize.ratioLabel}`
        : `${Math.round(editableSize.width)} × 随内容`
    : "";
  const activeViewTools = [
    panMode ? "手形平移" : "",
    showGrid ? "网格" : "",
    showCenterGuides ? "中心线" : "",
    showSafeArea ? "安全区" : "",
  ].filter(Boolean);

  useEffect(() => {
    if (!isSizeEditorOpen && !isViewToolsOpen) return undefined;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (controlsRef.current?.contains(event.target as Node)) return;
      setIsSizeEditorOpen(false);
      setIsViewToolsOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
    };
  }, [isSizeEditorOpen, isViewToolsOpen]);

  if (variant === "minimal") {
    return (
      <div className="homepage-editor__canvas-controls template-editor__canvas-controls--minimal" aria-label="画布缩放">
        <button type="button" onClick={onZoomOut} aria-label="缩小画布">−</button>
        <output aria-label={`画布缩放 ${Math.round(zoom * 100)}%`} aria-live="polite">
          {Math.round(zoom * 100)}%
        </output>
        <button type="button" onClick={onZoomIn} aria-label="放大画布">＋</button>
        <button type="button" onClick={onFit} aria-label="适应画布" title="适应画布">
          <FullscreenOutlined />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={controlsRef}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented || event.nativeEvent.isComposing
          || (!isSizeEditorOpen && !isViewToolsOpen)) return;
        event.preventDefault();
        event.stopPropagation();
        const trigger = isSizeEditorOpen ? sizeTriggerRef.current : viewToolsTriggerRef.current;
        setIsSizeEditorOpen(false);
        setIsViewToolsOpen(false);
        trigger?.focus();
      }}
      className={`homepage-editor__canvas-controls${editableSize ? " template-editor__canvas-controls--editable" : ""}`}
      aria-label={editableSize ? editableSize.previewWidthOnly ? "画布缩放与预览宽度" : "画布缩放与模板尺寸" : "画布缩放"}
    >
      {editableSize ? (
        <div className="template-editor__canvas-size-disclosure">
          <button
            ref={sizeTriggerRef}
            type="button"
            className="template-editor__canvas-size-trigger"
            aria-expanded={isSizeEditorOpen}
            aria-controls={sizePanelId}
            aria-label={`${editableSize.previewWidthOnly ? "预览宽度" : "模板尺寸"}：${sizeSummary}`}
            onClick={() => {
              setIsViewToolsOpen(false);
              setIsSizeEditorOpen((open) => !open);
            }}
          >
            <span>{editableSize.previewWidthOnly ? "预览宽度" : "模板尺寸"}</span>
            <strong>{sizeSummary}</strong>
            <span className="template-editor__canvas-size-trigger-arrow" aria-hidden="true">⌄</span>
          </button>
          <div
            id={sizePanelId}
            className="template-editor__canvas-size-panel"
            role="group"
            aria-label={editableSize.previewWidthOnly ? "画布观察宽度" : "模板整体尺寸"}
            hidden={!isSizeEditorOpen}
          >
            <div className="template-editor__canvas-size-panel-head">
              <strong>{editableSize.previewWidthOnly ? "当前预览宽度" : "当前画布尺寸"}</strong>
              <span>{editableSize.previewWidthOnly ? "仅预览，不保存" : "可撤销"}</span>
            </div>
            {editableSize.previewWidthOnly ? <p>拖动或输入宽度连续预览响应式，不修改模板根尺寸，也不进入撤销历史。根高度和比例请在右侧属性面板修改。</p> : null}
            <div className="template-editor__canvas-size-control">
              <CanvasDimensionInput
                label={editableSize.previewWidthOnly ? "预览宽度" : "设计宽度"}
                shortLabel="宽"
                value={editableSize.width}
                min={editableSize.minWidth}
                max={editableSize.maxWidth}
                onCommit={editableSize.onWidthChange}
              />
              <label className="template-editor__canvas-width-preset">
                <span className="sr-only">{editableSize.previewWidthOnly ? "常用预览宽度" : "常用模板宽度"}</span>
                <select
                  aria-label={editableSize.previewWidthOnly ? "常用预览宽度" : "常用模板宽度"}
                  value={widthPresets.includes(editableSize.width) ? String(editableSize.width) : ""}
                  onChange={(event) => {
                    const width = Number(event.target.value);
                    if (Number.isFinite(width) && width > 0) editableSize.onWidthChange(width);
                  }}
                >
                  <option value="">宽度预设</option>
                  {widthPresets.map((width) => (
                    <option key={width} value={width}>{width}px</option>
                  ))}
                </select>
              </label>
              {editableSize.onHeightModeChange ? <label className="template-editor__canvas-height-mode">
                <span>高度</span>
                <select
                  aria-label="模板高度模式"
                  value={editableSize.heightMode}
                  onChange={(event) => editableSize.onHeightModeChange?.(event.target.value as TemplateDesignHeightMode)}
                >
                  <option value="fixed">固定高度</option>
                  <option value="aspect-ratio">固定比例</option>
                  <option value="auto">随内容</option>
                </select>
              </label> : null}
              {editableSize.heightMode === "fixed" && editableSize.onHeightChange ? (
                <CanvasDimensionInput
                  label="模板固定高度"
                  shortLabel="高"
                  value={editableSize.height}
                  min={40}
                  max={9999}
                  onCommit={editableSize.onHeightChange}
                />
              ) : null}
              {editableSize.heightMode === "aspect-ratio" && editableSize.onRatioChange ? (
                <CanvasRatioInput value={editableSize.ratioLabel} onCommit={editableSize.onRatioChange} />
              ) : null}
              {editableSize.onRatioChange ? <label className="template-editor__canvas-ratio-preset">
                <span className="sr-only">常用模板比例</span>
                <select
                  aria-label="常用模板比例"
                  value={selectedRatioPreset}
                  onChange={(event) => {
                    const [width, height] = event.target.value.split(":").map(Number);
                    if (width > 0 && height > 0) editableSize.onRatioChange?.({ width, height });
                  }}
                >
                  <option value="">比例预设</option>
                  {ratioPresets.map((preset) => (
                    <option key={preset} value={preset}>{preset}</option>
                  ))}
                </select>
              </label> : null}
              {editableSize.onRestore ? <button
                type="button"
                disabled={!editableSize.canRestore}
                title={editableSize.canRestore
                  ? "恢复当前画布已保存的尺寸"
                  : "当前画布尺寸与已保存版本一致"}
                onClick={editableSize.onRestore}
              >
                恢复已保存尺寸
              </button> : null}
            </div>
          </div>
        </div>
      ) : null}
      {editableSize?.overflow
        && (editableSize.overflow.horizontal > 0 || editableSize.overflow.vertical > 0) ? (
          <button
            type="button"
            className="template-editor__canvas-overflow-warning"
            disabled={!editableSize.overflow.nodeId}
            aria-label={`内容越界${editableSize.overflow.horizontal > 0
              ? `，横向 ${editableSize.overflow.horizontal}px`
              : ""}${editableSize.overflow.vertical > 0
              ? `，纵向 ${editableSize.overflow.vertical}px`
              : ""}${editableSize.overflow.nodeId ? "，点击定位问题节点" : ""}`}
            title={editableSize.overflow.nodeId
              ? "模板内容超出当前边界；点击定位最主要的越界节点"
              : "模板内容超出当前边界；可调整整体尺寸、节点位置或溢出规则"}
            onClick={editableSize.onLocateOverflow}
          >
            <span role="status">内容越界
            {editableSize.overflow.horizontal > 0
              ? ` 横向 ${editableSize.overflow.horizontal}px`
              : ""}
            {editableSize.overflow.vertical > 0
              ? ` 纵向 ${editableSize.overflow.vertical}px`
              : ""}</span>
            {editableSize.overflow.nodeId ? " · 定位" : ""}
          </button>
        ) : null}
      <span className="template-editor__canvas-controls-divider" aria-hidden="true" />
      <button
        type="button"
        className={isFitView ? "is-active" : ""}
        aria-label="适应画布"
        title="适应画布"
        onClick={onFit}
      >
        适应画布
      </button>
      {editableSize && onZoomChange ? (
        <>
          <output
            className="template-editor__canvas-view-readout"
            aria-label={`画布尺寸 ${viewportLabel}，缩放 ${Math.round(zoom * 100)}%`}
            aria-live="polite"
          >
            {editableSize.previewWidthOnly ? "视口 " : ""}{viewportLabel}
          </output>
          <CanvasZoomInput value={zoom} onCommit={onZoomChange} />
        </>
      ) : (
        <button
          type="button"
          className={!isFitView && Math.abs(zoom - 1) < 0.005 ? "is-active" : ""}
          onClick={onActualSize}
        >
          100%
        </button>
      )}
      <button type="button" onClick={onZoomOut} aria-label="缩小画布">
        −
      </button>
      {!editableSize ? (
        <output
          className="homepage-editor__canvas-readout"
          aria-label={`画布尺寸 ${viewportLabel}，缩放 ${Math.round(zoom * 100)}%`}
        >
          <span>{viewportLabel}</span>
          {Math.round(zoom * 100)}%
        </output>
      ) : null}
      <button type="button" onClick={onZoomIn} aria-label="放大画布">
        +
      </button>
      {editableSize ? (
        <>
          <span className="template-editor__canvas-controls-divider" aria-hidden="true" />
          <div className="template-editor__canvas-view-disclosure">
            <button
              ref={viewToolsTriggerRef}
              type="button"
              className={`template-editor__canvas-view-trigger${activeViewTools.length > 0 ? " is-active" : ""}`}
              aria-expanded={isViewToolsOpen}
              aria-controls={viewToolsPanelId}
              aria-label={activeViewTools.length > 0
                ? `视图辅助：已开启${activeViewTools.join("、")}`
                : "视图辅助"}
              onClick={() => {
                setIsSizeEditorOpen(false);
                setIsViewToolsOpen((open) => !open);
              }}
            >
              视图辅助
              <span aria-hidden="true">⌄</span>
            </button>
            <div
              id={viewToolsPanelId}
              className="template-editor__canvas-view-panel"
              role="group"
              aria-label="画布视图辅助"
              hidden={!isViewToolsOpen}
            >
              <button
                type="button"
                className={panMode ? "is-active" : ""}
                aria-pressed={panMode}
                title="开启后拖动画布空白区域平移；聚焦画布后也可用方向键移动"
                onClick={onPanModeChange}
              >
                手形平移
              </button>
              <button
                type="button"
                className={showGrid ? "is-active" : ""}
                aria-pressed={showGrid}
                onClick={onGridChange}
              >
                网格
              </button>
              <button
                type="button"
                className={showCenterGuides ? "is-active" : ""}
                aria-pressed={showCenterGuides}
                onClick={onCenterGuidesChange}
              >
                中心线
              </button>
              <button
                type="button"
                className={showSafeArea ? "is-active" : ""}
                aria-pressed={showSafeArea}
                title="显示距离四边 5% 的内容安全区"
                onClick={onSafeAreaChange}
              >
                安全区
              </button>
              <button
                type="button"
                className={snapToGrid ? "is-active" : ""}
                aria-pressed={snapToGrid}
                title="拖动模板边界时吸附到 10px 网格；按住 Alt 临时关闭吸附"
                onClick={onSnapToGridChange}
              >
                吸附 10px
              </button>
              <button
                type="button"
                disabled={!canLocateSelection}
                title={canLocateSelection ? "在当前缩放下把选中对象移到视野中心" : "请先选择一个画布节点"}
                onClick={onLocateSelection}
              >
                定位选中
              </button>
              <button
                type="button"
                disabled={!canLocateSelection}
                title={canLocateSelection ? "放大或缩小并居中显示当前选中对象" : "请先选择一个画布节点"}
                onClick={onFitSelection}
              >
                适应选中
              </button>
              {viewActions}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
