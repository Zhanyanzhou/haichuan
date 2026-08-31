export default function WorkspaceCanvasControls({
  isFitView,
  zoom,
  viewportLabel,
  onFit,
  onActualSize,
  onZoomOut,
  onZoomIn,
}: {
  isFitView: boolean;
  zoom: number;
  viewportLabel: string;
  onFit: () => void;
  onActualSize: () => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
}) {
  return (
    <div className="homepage-editor__canvas-controls" aria-label="画布缩放">
      <button
        type="button"
        className={isFitView ? "is-active" : ""}
        onClick={onFit}
      >
        适应画布
      </button>
      <button
        type="button"
        className={!isFitView && Math.abs(zoom - 1) < 0.005 ? "is-active" : ""}
        onClick={onActualSize}
      >
        100%
      </button>
      <button type="button" onClick={onZoomOut} aria-label="缩小画布">
        −
      </button>
      <output
        className="homepage-editor__canvas-readout"
        aria-label={`画布尺寸 ${viewportLabel}，缩放 ${Math.round(zoom * 100)}%`}
      >
        <span>{viewportLabel}</span>
        {Math.round(zoom * 100)}%
      </output>
      <button type="button" onClick={onZoomIn} aria-label="放大画布">
        +
      </button>
    </div>
  );
}
