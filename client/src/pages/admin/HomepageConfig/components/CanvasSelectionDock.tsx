import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Modal } from "antd";
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { registerOverlayPortal } from "@puckeditor/core";
import { ROOT_ZONE, useHomepagePuck } from "../editor-store";
import { getModuleDisplayName } from "../editor-utils";

export default function CanvasSelectionDock({
  children,
  componentId,
  componentType,
  isSelected,
}: {
  children: ReactNode;
  componentId: string;
  componentType: string;
  isSelected: boolean;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const [dockPosition, setDockPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const [dockHost, setDockHost] = useState<HTMLElement | null>(null);
  const appData = useHomepagePuck((state) => state.appState.data);
  const dispatch = useHomepagePuck((state) => state.dispatch);
  const content = appData.content as Array<{
    type: string;
    props: Record<string, any>;
  }>;
  const selectedIndex = content.findIndex(
    (item) => item.props?.id === componentId,
  );
  const selectedModule = selectedIndex >= 0 ? content[selectedIndex] : null;
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
    if (!isSelected || !portalRef.current) return undefined;
    return registerOverlayPortal(portalRef.current, { disableDrag: true });
  }, [dockHost, isSelected]);

  useLayoutEffect(() => {
    const overlay = overlayRef.current;
    const frameDocument = overlay?.ownerDocument;
    const frameWindow = frameDocument?.defaultView;
    const hostWindow = window.parent !== window ? window.parent : window;
    const frame = frameDocument
      ? Array.from(hostWindow.document.querySelectorAll("iframe")).find(
          (candidate) => candidate.contentDocument === frameDocument,
        )
      : null;
    const nextDockHost = frame?.closest<HTMLElement>(
      ".homepage-editor__canvas-scroll",
    );
    const canvasDocument = frame?.closest<HTMLElement>(
      ".homepage-editor__canvas-document",
    );

    if (!isSelected || !overlay || !frameWindow || !frame || !nextDockHost) {
      setDockPosition(null);
      setDockHost(null);
      return undefined;
    }
    if (dockHost !== nextDockHost) setDockHost(nextDockHost);

    const updatePosition = () => {
      const selectionBox = (
        overlay.closest<HTMLElement>("[data-puck-component]") ?? overlay
      ).getBoundingClientRect();
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

      // dock 与 iframe 共处画布滚动容器，使用内容坐标后会随滚动同步移动，
      // 不再依赖父页面 scroll 事件追赶 iframe 的屏幕坐标。
      if (portalRef.current) {
        portalRef.current.style.left = `${nextPosition.left}px`;
        portalRef.current.style.top = `${nextPosition.top}px`;
        portalRef.current.style.visibility = "visible";
      }
      setDockPosition((current) =>
        current &&
        Math.abs(current.left - nextPosition.left) < 0.5 &&
        Math.abs(current.top - nextPosition.top) < 0.5
          ? current
          : nextPosition,
      );
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
    overlayObserver.observe(overlay);
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
  }, [componentId, dockHost, isSelected]);

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

    const nextContent = [...content];
    [nextContent[selectedIndex], nextContent[targetIndex]] = [
      nextContent[targetIndex],
      nextContent[selectedIndex],
    ];
    dispatch({
      type: "setData",
      data: { ...appData, content: nextContent },
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
    Modal.confirm({
      title: `删除“${displayName}”？`,
      content: "删除后可从模板组件库重新添加；尚未发布的修改可通过版本记录恢复。",
      okText: "删除模块",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: () => {
        dispatch({
          type: "setData",
          data: {
            ...appData,
            content: content.filter((_, index) => index !== selectedIndex),
          },
          recordHistory: true,
        });
        dispatch({ type: "setUi", ui: { itemSelector: null } });
      },
    });
  };

  return (
    <div ref={overlayRef} className="homepage-editor__canvas-selection-overlay">
      {children}
      {isSelected && selectedModule && dockHost
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
        : null}
    </div>
  );
}
