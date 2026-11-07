import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useEditorCanvasActive } from "@/page-builder/workspace/editorCanvasActivity";
import { readPageEditorWorkspaceScale } from "@/page-builder/workspace/pageEditorWorkspaceTiers";
import { App as AntdApp } from "antd";
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CopyOutlined,
  DeleteOutlined,
  ExportOutlined,
} from "@ant-design/icons";
import { registerOverlayPortal, useGetPuck } from "@puckeditor/core";
import { ROOT_ZONE, useHomepagePuck } from "../editor-store";
import { usePageCanvasTemplatePreview } from "../pageCanvasTemplatePreview";
import { getModuleDisplayName, resolveTemplateSectionRole } from "../editor-utils";
import { getResolvedDynamicTemplateDefinitions, useResolvedDynamicTemplateDefinitions } from "@/page-builder/dynamic-template-instance/registry";
import { DYNAMIC_TEMPLATE_BLOCK_TYPE, dynamicTemplateVersionKey } from "@/page-builder/dynamic-template-instance/types";
import type { EditorPageKey } from "@/page-builder/config/editorPages";
import { usePublishedTemplateSectionRoles } from "@/page-builder/template-editor/publishedTemplateSectionRoles";
import type { PuckProps } from "@/page-builder/types";
import {
  canReorderPageModule,
  clonePageModule,
  deletePageModules,
  duplicatePageModule,
  reorderPageModules,
  usePageModuleStructureHistoryGuard,
} from "./pageModuleActions";
import CrossPageModuleCopy, { type CrossPageModuleSnapshot } from "./CrossPageModuleCopy";

function findCanvasBlock(
  frameDocument: Document | null | undefined,
  componentId: string,
): HTMLElement | undefined {
  if (!frameDocument || !componentId) return undefined;
  return Array.from(
    frameDocument.querySelectorAll<HTMLElement>(
      "[data-editor-block-id], [data-puck-component]",
    ),
  ).find((candidate) => (
    candidate.dataset.editorBlockId === componentId
    || candidate.dataset.puckComponent === componentId
  ));
}

export default function CanvasSelectionDock({
  readOnly = false,
  pageKey,
  onSwitchPage,
}: {
  readOnly?: boolean;
  pageKey: EditorPageKey;
  onSwitchPage: (key: EditorPageKey, copyId: string) => void;
}) {
  const { modal, message } = AntdApp.useApp();
  const canvasActive = useEditorCanvasActive();
  const getPuck = useGetPuck();
  usePageModuleStructureHistoryGuard();
  const portalRef = useRef<HTMLDivElement>(null);
  const lastDockPositionRef = useRef<{ left: number; top: number } | null>(null);
  const [dockPosition, setDockPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const [dockHost, setDockHost] = useState<HTMLElement | null>(null);
  const [canvasReadyRevision, setCanvasReadyRevision] = useState(0);
  const [crossPageSnapshot, setCrossPageSnapshot] = useState<CrossPageModuleSnapshot | null>(null);
  const appData = useHomepagePuck((state) => state.appState.data);
  const resolvedDefinitions = useResolvedDynamicTemplateDefinitions();
  const rolesByTemplateId = usePublishedTemplateSectionRoles((state) => state.rolesByTemplateId);
  const selectedItem = useHomepagePuck((state) => state.selectedItem);
  const canvasPreview = usePageCanvasTemplatePreview();
  const componentId = canvasPreview?.focused ? "" : String(selectedItem?.props?.id ?? "");
  const content = appData.content as Array<{
    type: string;
    props: PuckProps & { id: string };
  }>;
  const selectedIndex = content.findIndex(
    (item) => item.props?.id === componentId,
  );
  const selectedModule = selectedIndex >= 0 ? content[selectedIndex] : null;
  const selectedDisplayName = selectedModule
    ? getModuleDisplayName(
      selectedModule.type,
      selectedModule.props,
      resolveTemplateSectionRole(selectedModule.props, { definitions: resolvedDefinitions, rolesByTemplateId }),
    )
    : "";
  const componentType = selectedModule?.type ?? "";
  const selectedLocked = Boolean(selectedModule?.props?.locked);
  const canMoveUp = canReorderPageModule(content[selectedIndex], content[selectedIndex - 1]);
  const canMoveDown = canReorderPageModule(content[selectedIndex], content[selectedIndex + 1]);

  useEffect(() => {
    if (!canvasActive || !componentId || !portalRef.current) return undefined;
    return registerOverlayPortal(portalRef.current, { disableDrag: true });
  }, [canvasActive, componentId, dockHost]);

  useLayoutEffect(() => {
    if (!canvasActive) return;
    const hostWindow = window;
    const frame = document.querySelector<HTMLIFrameElement>(
      ".homepage-editor__canvas-scroll iframe",
    );
    const frameDocument = frame?.contentDocument;
    const frameWindow = frame?.contentWindow;
    const selectedBlock = findCanvasBlock(frameDocument, componentId);
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

      if (!componentId) return undefined;

      let disposed = false;
      const observedFrames = new Set<HTMLIFrameElement>();
      const readinessObserver = new MutationObserver(() => {
        observeCurrentFrame();
        notifyWhenReady();
      });
      const observeCurrentFrame = () => {
        const nextFrame = document.querySelector<HTMLIFrameElement>(
          ".homepage-editor__canvas-scroll iframe",
        );
        if (nextFrame && !observedFrames.has(nextFrame)) {
          observedFrames.add(nextFrame);
          nextFrame.addEventListener("load", notifyWhenReady);
        }
        const nextRoot = nextFrame?.contentDocument?.documentElement;
        if (nextRoot) {
          readinessObserver.observe(nextRoot, {
            attributes: true,
            attributeFilter: ["data-editor-block-id", "data-puck-component"],
            childList: true,
            subtree: true,
          });
        }
        return nextFrame;
      };
      const notifyWhenReady = () => {
        if (disposed) return;
        const nextFrame = observeCurrentFrame();
        const nextHost = nextFrame?.closest<HTMLElement>(
          ".homepage-editor__canvas-scroll",
        );
        if (
          !nextFrame?.contentWindow ||
          !nextHost ||
          !findCanvasBlock(nextFrame.contentDocument, componentId)
        ) {
          return;
        }
        disposed = true;
        setCanvasReadyRevision((revision) => revision + 1);
      };

      readinessObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
      observeCurrentFrame();
      notifyWhenReady();

      return () => {
        disposed = true;
        readinessObserver.disconnect();
        observedFrames.forEach((observedFrame) => {
          observedFrame.removeEventListener("load", notifyWhenReady);
        });
      };
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
      const hostZoom = readPageEditorWorkspaceScale(nextDockHost);
      // 屏幕坐标包含工作台缩放，浮动工具栏的定位和滚动值使用宿主坐标。
      const nextPosition = {
        left:
          (frameBox.left - hostBox.left + selectionBox.right * scale) / hostZoom +
          nextDockHost.scrollLeft -
          nextDockHost.clientLeft,
        top:
          (frameBox.top - hostBox.top + selectionBox.bottom * scale) / hostZoom +
          nextDockHost.scrollTop -
          nextDockHost.clientTop,
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
          const hostZoom = readPageEditorWorkspaceScale(nextDockHost);
          nextDockHost.scrollBy({ left: left / hostZoom, top: top / hostZoom, behavior: "auto" });
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
  }, [canvasActive, canvasReadyRevision, componentId, dockHost, selectedIndex]);

  const moveSelected = (direction: -1 | 1) => {
    if (readOnly) return;
    reorderPageModules(getPuck, selectedIndex, selectedIndex + direction);
  };

  const deleteSelected = () => {
    if (readOnly) return;
    if (!selectedModule || selectedLocked) return;
    modal.confirm({
      title: `删除“${selectedDisplayName}”？`,
      content: "删除后可在本次编辑中撤销；保存页面草稿不会立即更新公开页面。",
      okText: "删除模块",
      okButtonProps: { danger: true },
      autoFocusButton: "cancel",
      cancelText: "取消",
      onOk: () => {
        deletePageModules(getPuck, [selectedIndex]);
      },
    });
  };

  const duplicateSelected = () => {
    if (readOnly || !selectedModule || selectedLocked) return;
    duplicatePageModule(getPuck, selectedIndex);
  };

  const copyToOtherPage = () => {
    const source = (getPuck().appState.data.content as typeof content).find((item) => item.props.id === componentId);
    if (!source || source.props.locked || source.type !== DYNAMIC_TEMPLATE_BLOCK_TYPE || readOnly) return;
    const { templateId, templateVersion } = source.props;
    const version = getResolvedDynamicTemplateDefinitions()[
      dynamicTemplateVersionKey(String(templateId ?? ""), Number(templateVersion))
    ];
    if (!version) {
      message.warning("此区块的模板版本尚未加载，请稍后重试。");
      return;
    }
    setCrossPageSnapshot({ sourcePage: pageKey, name: selectedDisplayName, block: clonePageModule(source), version });
  };

  return (
    <>
    {canvasActive && selectedModule && dockHost && !readOnly
    ? createPortal(
        <div
          ref={portalRef}
          className="homepage-editor__canvas-selection-dock"
          role="toolbar"
          aria-label={`调整“${selectedDisplayName}”模块`}
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
            disabled={selectedLocked}
            onClick={duplicateSelected}
            aria-label={selectedLocked ? "固定模块不能复制" : "复制当前模块"}
            title={selectedLocked ? "固定模块不能复制" : "复制"}
          >
            <CopyOutlined aria-hidden="true" />
          </button>
          {componentType === DYNAMIC_TEMPLATE_BLOCK_TYPE && !selectedLocked ? (
            <button
              type="button"
              onClick={copyToOtherPage}
              aria-label="复制到其他页面"
              title="复制到其他页面"
            >
              <ExportOutlined aria-hidden="true" />
            </button>
          ) : null}
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
    {crossPageSnapshot ? (
      <CrossPageModuleCopy
        key={crossPageSnapshot.block.props.id}
        snapshot={crossPageSnapshot}
        pageKey={pageKey}
        readOnly={readOnly}
        onSwitchPage={onSwitchPage}
        onClose={() => setCrossPageSnapshot(null)}
      />
    ) : null}
    </>
  );
}

/** Puck 的临时 hover/selected portal 只负责绘制视觉覆盖层。 */
export function CanvasSelectionOverlay({ children }: { children: ReactNode }) {
  return (
    <div className="homepage-editor__canvas-selection-overlay">{children}</div>
  );
}
