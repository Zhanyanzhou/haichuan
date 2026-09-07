import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { videoPuckConfig } from "../../src/page-builder/adapters/video.puck";
import { createContentTemplateMarker } from "../../src/page-builder/generated/contentTemplates.generated";
import ContentTemplateContractFrame from "../../src/page-builder/runtime/ContentTemplateContractFrame";
import {
  CONTENT_TEMPLATE_RENDER_SURFACE,
  ContentTemplateRenderSurfaceProvider,
} from "../../src/page-builder/runtime/ContentTemplateRenderSurface";
import {
  CANVAS_VISUAL_EDIT_MESSAGE,
  getVisualEditorSessionSubscriberCount,
  useVisualEditorSession,
} from "../../src/page-builder/visual-editor/visualEditorSession";
import "../../src/styles/globals.css";

type Surface = "none" | "public" | "catalog" | "editor";
type TrackedEvent = "message" | "resize" | "blur";

const trackedEvents = new Set<TrackedEvent>(["message", "resize", "blur"]);
const activeListeners = new Map<TrackedEvent, Set<EventListenerOrEventListenerObject>>([
  ["message", new Set()],
  ["resize", new Set()],
  ["blur", new Set()],
]);
const addedListeners: Record<TrackedEvent, number> = { message: 0, resize: 0, blur: 0 };
const removedListeners: Record<TrackedEvent, number> = { message: 0, resize: 0, blur: 0 };
let clearNodeCalls = 0;
let cancelledGestureMessages = 0;

const originalAddEventListener = window.addEventListener.bind(window);
const originalRemoveEventListener = window.removeEventListener.bind(window);
window.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
  if (trackedEvents.has(type as TrackedEvent)) {
    const eventType = type as TrackedEvent;
    activeListeners.get(eventType)?.add(listener);
    addedListeners[eventType] += 1;
  }
  originalAddEventListener(type, listener, options);
}) as typeof window.addEventListener;
window.removeEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions) => {
  if (trackedEvents.has(type as TrackedEvent)) {
    const eventType = type as TrackedEvent;
    activeListeners.get(eventType)?.delete(listener);
    removedListeners[eventType] += 1;
  }
  originalRemoveEventListener(type, listener, options);
}) as typeof window.removeEventListener;

const originalPostMessage = window.postMessage.bind(window);
window.postMessage = ((message: unknown, targetOrigin: string, transfer?: Transferable[]) => {
  if (
    message &&
    typeof message === "object" &&
    "type" in message &&
    message.type === CANVAS_VISUAL_EDIT_MESSAGE &&
    "cancelled" in message &&
    message.cancelled === true
  ) {
    cancelledGestureMessages += 1;
  }
  return originalPostMessage(message, targetOrigin, transfer ?? []);
}) as typeof window.postMessage;

const originalClearNode = useVisualEditorSession.getState().clearNode;
useVisualEditorSession.setState({
  clearNode: (blockId) => {
    clearNodeCalls += 1;
    originalClearNode(blockId);
  },
});
useVisualEditorSession.getState().activateWorkspace("template");

const props = {
  ...videoPuckConfig.defaultProps,
  id: "template-editor:lifecycle-video",
  videoUrl: "",
  posterUrl: "",
  __contentTemplate: createContentTemplateMarker("视频区块"),
};

function LifecycleSurface({ surface }: { surface: Surface }) {
  if (surface === "none") return null;
  const frameProps = surface === "public"
    ? { ...props, id: "public-video" }
    : surface === "catalog"
      ? { ...props, id: "template-editor:catalog-video" }
      : props;
  const frame = (
    <ContentTemplateContractFrame
      moduleType="视频区块"
      mode={surface === "public" ? "public" : "editor"}
      props={frameProps}
    >
      {videoPuckConfig.render(frameProps)}
    </ContentTemplateContractFrame>
  );
  return surface === "catalog" ? (
    <ContentTemplateRenderSurfaceProvider surface={CONTENT_TEMPLATE_RENDER_SURFACE.CATALOG_PREVIEW}>
      {frame}
    </ContentTemplateRenderSurfaceProvider>
  ) : frame;
}

function Fixture() {
  const [surface, setSurface] = useState<Surface>("none");
  return (
    <main>
      {(["none", "public", "catalog", "editor"] as const).map((value) => (
        <button key={value} type="button" onClick={() => setSurface(value)}>{value}</button>
      ))}
      <output data-active-surface>{surface}</output>
      <section aria-label="生命周期渲染面">
        <LifecycleSurface surface={surface} />
      </section>
    </main>
  );
}

declare global {
  interface Window {
    __contentTemplateEditorLifecycle: () => {
      subscribers: number;
      activeListeners: Record<TrackedEvent, number>;
      addedListeners: Record<TrackedEvent, number>;
      removedListeners: Record<TrackedEvent, number>;
      clearNodeCalls: number;
      cancelledGestureMessages: number;
    };
  }
}

window.__contentTemplateEditorLifecycle = () => ({
  subscribers: getVisualEditorSessionSubscriberCount(),
  activeListeners: {
    message: activeListeners.get("message")?.size ?? 0,
    resize: activeListeners.get("resize")?.size ?? 0,
    blur: activeListeners.get("blur")?.size ?? 0,
  },
  addedListeners: { ...addedListeners },
  removedListeners: { ...removedListeners },
  clearNodeCalls,
  cancelledGestureMessages,
});

createRoot(document.getElementById("root")!).render(<Fixture />);
