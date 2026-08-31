import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

type CanvasBlockInteractionBoundaryProps = {
  blockId?: string;
  blockType: string;
  blockLabel: string;
  children: ReactNode;
  focused?: boolean;
  selected?: boolean;
  /** 仅供独立模板/视觉编辑夹具使用；正式页面装修始终保持模块级选择。 */
  allowNodeSelection?: boolean;
  scrollMarginTop?: number;
  onSelect: () => void;
};

/**
 * 正式画布的交互边界：整块内容可用于选中模块，但不再用透明遮罩
 * 覆盖图片和文字槽位。这样视觉节点仍能接收裁切、焦点和拖动操作。
 */
const CanvasBlockInteractionBoundary = forwardRef<
  HTMLDivElement,
  CanvasBlockInteractionBoundaryProps
>(function CanvasBlockInteractionBoundary(
  {
    blockId,
    blockType,
    blockLabel,
    children,
    focused = false,
    selected = false,
    allowNodeSelection = false,
    scrollMarginTop = 80,
    onSelect,
  },
  ref,
) {
  const boundaryRef = useRef<HTMLDivElement | null>(null);
  const assignBoundaryRef = useCallback((node: HTMLDivElement | null) => {
    boundaryRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) (ref as MutableRefObject<HTMLDivElement | null>).current = node;
  }, [ref]);

  useEffect(() => {
    // Puck 在父子 effect 执行后才把 data-puck-component 写到外层包装，
    // 首次 effect 里属性可能尚不存在，因此同时保留直接父节点作为观察目标。
    const puckBlock =
      boundaryRef.current?.closest<HTMLElement>("[data-puck-component]") ??
      boundaryRef.current?.parentElement;
    if (!puckBlock) return;

    const stripDisabledDragSemantics = () => {
      if (!puckBlock.hasAttribute("data-puck-disabled")) return;
      // Puck 在 drag=false 时仍把整块标成 aria-disabled 的 draggable button，
      // 会连带禁用内部图片/文字。模块排序已交给图层面板，因此移除这层
      // 失效的拖拽语义，保留下面独立、可聚焦的模块选择把手。
      const dragAttributes = [
        "role",
        "tabindex",
        "aria-roledescription",
        "aria-describedby",
        "aria-pressed",
        "aria-grabbed",
        "aria-disabled",
      ];
      if (
        !dragAttributes.some((attribute) => puckBlock.hasAttribute(attribute)) &&
        puckBlock.dataset.editorCanvasDragDisabled === "true"
      ) {
        return;
      }
      dragAttributes.forEach((attribute) => puckBlock.removeAttribute(attribute));
      if (puckBlock.dataset.editorCanvasDragDisabled !== "true") {
        puckBlock.setAttribute("data-editor-canvas-drag-disabled", "true");
      }
    };

    stripDisabledDragSemantics();
    const observer = new MutationObserver(stripDisabledDragSemantics);
    observer.observe(puckBlock, { attributes: true });
    return () => observer.disconnect();
  }, []);

  const handleCanvasClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    // 编辑画布只负责选择和调整，不执行公开页面的跳转、播放或提交动作。
    if (target.closest("a,button,input,select,textarea,[role='button']")) {
      event.preventDefault();
    }
    if (!allowNodeSelection) {
      event.stopPropagation();
    }
  };

  const handleCanvasPointerDownCapture = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (allowNodeSelection) return;
    // 页面装修只选择整块模板。必须在捕获阶段截断，避免事件继续进入
    // Renderer 的图片、文字或业务对象选择器并改变右侧属性上下文。
    event.preventDefault();
    event.stopPropagation();
    onSelect();
  };

  const handleCanvasKeyDownCapture = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    if (allowNodeSelection || (event.key !== "Enter" && event.key !== " ")) return;
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.closest("[data-editor-select-handle]")) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect();
  };

  const handleCanvasPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    // 模块与视觉节点均由项目自己的选择链处理。若继续冒泡到 Puck 的
    // 区块处理器，同一次点击会再次选中并按未缩放坐标滚动 iframe。
    event.stopPropagation();
    if (!selected) onSelect();
  };

  return (
    <div
      ref={assignBoundaryRef}
      data-editor-block-id={blockId}
      data-editor-block-type={blockType}
      data-editor-node-selection={allowNodeSelection ? "node" : "module"}
      onPointerDownCapture={handleCanvasPointerDownCapture}
      onPointerDown={handleCanvasPointerDown}
      onClickCapture={handleCanvasClickCapture}
      onKeyDownCapture={handleCanvasKeyDownCapture}
      onClick={(event) => event.stopPropagation()}
      style={{
        position: "relative",
        scrollMarginTop: `${scrollMarginTop}px`,
        ...(focused
          ? {
              outline: "1px solid #181A1B",
              outlineOffset: "-1px",
            }
          : {}),
      }}
    >
      <button
        type="button"
        className="homepage-editor__canvas-block-handle"
        data-editor-select-handle={blockType}
        aria-label={`选择“${blockLabel}”模块`}
        aria-pressed={selected}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!selected) onSelect();
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          event.stopPropagation();
          if (!selected) onSelect();
        }}
      >
        <span aria-hidden="true">⋮⋮</span>
      </button>
      {children}
    </div>
  );
});

export default CanvasBlockInteractionBoundary;
