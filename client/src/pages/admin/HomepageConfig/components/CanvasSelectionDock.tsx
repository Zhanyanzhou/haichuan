import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { App as AntdApp } from "antd";
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { registerOverlayPortal } from "@puckeditor/core";
import { ROOT_ZONE, useHomepagePuck } from "../editor-store";
import { getModuleDisplayName } from "../editor-utils";

export default function CanvasSelectionDock() {
  const { modal } = AntdApp.useApp();
  const portalRef = useRef<HTMLDivElement>(null);
  const lastDockPositionRef = useRef<{ left: number; top: number } | null>(null);
  const [dockPosition, setDockPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const [dockHost, setDockHost] = useState<HTMLElement | null>(null);
  const appData = useHomepagePuck((state) => state.appState.data);
  const dispatch = useHomepagePuck((state) => state.dispatch);
  const selectedItem = useHomepagePuck((state) => state.selectedItem);
  const componentId = String(selectedItem?.props?.id ?? "");
  const content = appData.content as Array<{
    type: string;
    props: Record<string, any>;
  }>;
  const selectedIndex = content.findIndex(
    (item) => item.props?.id === componentId,
  );
  const selectedModule = selectedIndex >= 0 ? content[selectedIndex] : null;
  const componentType = selectedModule?.type ?? "";
  const selectedLocked = Boolean(selectedModule?.props?.locked);
  const canMoveUp =
    Boolean(selectedModule) &&
    !selectedLocked &&
    selectedIndex > 0 &&
    !content[selectedIndex - 1]?.props?.locked;
  const canMoveDown =
    Boolean(selectedModule) &&
    !selectedLocked &&
    selectedIndex < content.length - 1 &&
    !content[selectedIndex + 1]?.props?.locked;

  useEffect(() => {
    if (!componentId || !portalRef.current) return undefined;
    return registerOverlayPortal(portalRef.current, { disableDrag: true });
  }, [componentId, dockHost]);

  useLayoutEffect(() => {
    const hostWindow = window;
    const frame = document.querySelector<HTMLIFrameElement>(
      ".homepage-editor__canvas-scroll iframe",
    );
    const frameDocument = frame?.contentDocument;
    const frameWindow = frame?.contentWindow;
    const selectedBlock = Array.from(
      frameDocument?.querySelectorAll<HTMLElement>("[data-puck-component]") ?? [],
    ).find((candidate) => candidate.dataset.puckComponent === componentId);
    const nextDockHost = frame?.closest<HTMLElement>(
      ".homepage-editor__canvas-scroll",
    );
    const canvasDocument = frame?.closest<HTMLElement>(
      ".homepage-editor__canvas-document",
    );

    if (
      !componentId ||
      !selectedBlock ||
      !frameWindow ||
      !frame ||
      !nextDockHost
    ) {
      lastDockPositionRef.current = null;
      setDockPosition(null);
      setDockHost(null);
      return undefined;
    }
    if (dockHost !== nextDockHost) setDockHost(nextDockHost);

    const updatePosition = () => {
      const selectionBox = selectedBlock.getBoundingClientRect();
      const frameBox = frame.getBoundingClientRect();
      const hostBox = nextDockHost.getBoundingClientRect();
      // iframe 的 DOMRect/offsetWidth 同属边框盒；contentDocument.clientWidth 会扣除
      // 内部滚动条，在 100% 画布上会把 4px 差值错误放大到纵向坐标。
      const frameWidth = frame.offsetWidth;
      const scale = frameWidth > 0 ? frameBox.width / frameWidth : 1;
      const nextPosition = {
        left:
          frameBox.left -
          hostBox.left +
          nextDockHost.scrollLeft -
          nextDockHost.clientLeft +
          selectionBox.right * scale,
        top:
          frameBox.top -
          hostBox.top +
          nextDockHost.scrollTop -
          nextDockHost.clientTop +
          selectionBox.bottom * scale,
      };
      const previousPosition = lastDockPositionRef.current;
      if (
        previousPosition &&
        Math.abs(previousPosition.left - nextPosition.left) < 4 &&
        Math.abs(previousPosition.top - nextPosition.top) < 4
      ) {
        return;
      }
      lastDockPositionRef.current = nextPosition;

      // dock 与 iframe 共处画布滚动容器，使用内容坐标后会随滚动同步移动，
      // 不再依赖父页面 scroll 事件追赶 iframe 的屏幕坐标。
      if (portalRef.current) {
        portalRef.current.style.left = `${nextPosition.left}px`;
        portalRef.current.style.top = `${nextPosition.top}px`;
        portalRef.current.style.visibility = "visible";
      }
      setDockPosition(nextPosition);
    };

    let revealFrame = 0;
    const revealDock = () => {
      if (revealFrame) hostWindow.cancelAnimationFrame(revealFrame);
      revealFrame = hostWindow.requestAnimationFrame(() => {
        revealFrame = 0;
        updatePosition();
        const dock = portalRef.current;
        if (!dock) return;

        const dockBox = dock.getBoundingClientRect();
        const hostViewport = nextDockHost.getBoundingClientRect();
        const inset = 4;
        let left = 0;
        let top = 0;
        if (dockBox.right > hostViewport.right - inset) {
          left = dockBox.right - hostViewport.right + inset;
        } else if (dockBox.left < hostViewport.left + inset) {
          left = dockBox.left - hostViewport.left - inset;
        }
        if (dockBox.bottom > hostViewport.bottom - inset) {
          top = dockBox.bottom - hostViewport.bottom + inset;
        } else if (dockBox.top < hostViewport.top + inset) {
          top = dockBox.top - hostViewport.top - inset;
        }
        if (Math.abs(left) >= 0.5 || Math.abs(top) >= 0.5) {
          nextDockHost.scrollBy({ left, top, behavior: "auto" });
        }
      });
    };

    updatePosition();
    revealDock();
    hostWindow.addEventListener("resize", revealDock);
    hostWindow.addEventListener("scroll", updatePosition, true);
    frameWindow.addEventListener("resize", revealDock);
    frameWindow.addEventListener("scroll", updatePosition, true);
    const overlayObserver = new ResizeObserver(updatePosition);
    const frameObserver = new ResizeObserver(revealDock);
    overlayObserver.observe(selectedBlock);
    frameObserver.observe(frame);
    if (canvasDocument) frameObserver.observe(canvasDocument);

    return () => {
      hostWindow.removeEventListener("resize", revealDock);
      hostWindow.removeEventListener("scroll", updatePosition, true);
      frameWindow.removeEventListener("resize", revealDock);
      frameWindow.removeEventListener("scroll", updatePosition, true);
      if (revealFrame) hostWindow.cancelAnimationFrame(revealFrame);
      overlayObserver.disconnect();
      frameObserver.disconnect();
    };
  }, [componentId, dockHost, selectedIndex]);

  const moveSelected = (direction: -1 | 1) => {
    const targetIndex = selectedIndex + direction;
    if (
      !selectedModule ||
      selectedLocked ||
      targetIndex < 0 ||
      targetIndex >= content.length ||
      content[targetIndex]?.props?.locked
    ) {
      return;
    }

    dispatch({
      type: "reorder",
      sourceIndex: selectedIndex,
      destinationIndex: targetIndex,
      destinationZone: ROOT_ZONE,
      recordHistory: true,
    });
    dispatch({
      type: "setUi",
      ui: { itemSelector: { index: targetIndex, zone: ROOT_ZONE } },
    });
  };

  const deleteSelected = () => {
    if (!selectedModule || selectedLocked) return;
    const displayName = getModuleDisplayName(
      selectedModule.type || componentType,
      selectedModule.props,
    );
    modal.confirm({
      title: `删除“${displayName}”？`,
      content: "删除后可从模板组件库重新添加；尚未发布的修改可通过版本记录恢复。",
      okText: "删除模块",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: () => {
        dispatch({
          type: "remove",
          index: selectedIndex,
          zone: ROOT_ZONE,
          recordHistory: true,
        });
        dispatch({ type: "setUi", ui: { itemSelector: null } });
      },
    });
  };

  return selectedModule && dockHost
    ? createPortal(
        <div
          ref={portalRef}
          className="homepage-editor__canvas-selection-dock"
          role="toolbar"
          aria-label={`调整“${getModuleDisplayName(selectedModule.type, selectedModule.props)}”模块`}
          style={
            dockPosition
              ? { left: dockPosition.left, top: dockPosition.top }
              : { visibility: "hidden" }
          }
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            disabled={!canMoveUp}
            onClick={() => moveSelected(-1)}
            aria-label="上移当前模块"
            title="上移"
          >
            <ArrowUpOutlined aria-hidden="true" />
          </button>
          <button
            type="button"
            disabled={!canMoveDown}
            onClick={() => moveSelected(1)}
            aria-label="下移当前模块"
            title="下移"
          >
            <ArrowDownOutlined aria-hidden="true" />
          </button>
          <button
            type="button"
            className="is-danger"
            disabled={selectedLocked}
            onClick={deleteSelected}
            aria-label={selectedLocked ? "固定模块不能删除" : "删除当前模块"}
            title={selectedLocked ? "固定模块不能删除" : "删除"}
          >
            <DeleteOutlined aria-hidden="true" />
          </button>
        </div>,
        dockHost,
      )
    : null;
}

/** Puck 的临时 hover/selected portal 只负责绘制视觉覆盖层。 */
export function CanvasSelectionOverlay({ children }: { children: ReactNode }) {
  return (
    <div className="homepage-editor__canvas-selection-overlay">{children}</div>
  );
}
