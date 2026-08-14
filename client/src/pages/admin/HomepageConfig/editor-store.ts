/**
 * editor-store.ts — 装修编辑器的共享状态基座。
 *
 * Puck store 单例与「宿主 ↔ 画布 iframe」的 postMessage 协议集中于此，
 * 供 HomepageConfig/index.tsx 与 components/* 共同引用。
 * （自 index.tsx 平移，逻辑零变更）
 */
import { createUsePuck } from "@puckeditor/core";
import { puckConfig } from "@/page-builder/config/puckConfig";

export const useHomepagePuck = createUsePuck<typeof puckConfig>();

/** 内容区根插槽标识（与 Puck itemSelector.zone 对应） */
export const ROOT_ZONE = "root:default-zone";

/* ═══════ 宿主 ↔ 画布 iframe 的 postMessage 协议 ═══════ */

export const CANVAS_FOCUS_MESSAGE = "homepage-editor:focus-block";
export const CANVAS_HEIGHT_MESSAGE = "homepage-editor:canvas-height";
export const CANVAS_NAVIGATION_MESSAGE = "homepage-editor:navigation-preview";
export const CANVAS_NAVIGATION_STATE_MESSAGE =
  "homepage-editor:navigation-state";
export const CANVAS_PAGE_NAVIGATION_MESSAGE = "homepage-editor:page-navigation";

export type CanvasFocusMessage = {
  type: typeof CANVAS_FOCUS_MESSAGE;
  blockId: string;
  field?: string;
};

export type CanvasHeightMessage = {
  type: typeof CANVAS_HEIGHT_MESSAGE;
  height: number;
};

export type CanvasNavigationMessage = {
  type: typeof CANVAS_NAVIGATION_MESSAGE;
  open: boolean;
};

export type CanvasNavigationStateMessage = {
  type: typeof CANVAS_NAVIGATION_STATE_MESSAGE;
  open: boolean;
};

export type CanvasPageNavigationMessage = {
  type: typeof CANVAS_PAGE_NAVIGATION_MESSAGE;
  path: string;
};

/**
 * Puck 画布运行在 iframe 中，宿主页面不能直接操作其 DOM。
 * 通过 postMessage 把「图层/字段定位」交给画布内的锚点处理，避免图层已选中、画布仍停在首屏。
 */
export function focusCanvasBlock(blockId?: string, field?: string) {
  if (!blockId) return;
  window.requestAnimationFrame(() => {
    const frame = document.querySelector<HTMLIFrameElement>(
      ".homepage-editor__preview-frame iframe",
    );
    frame?.contentWindow?.postMessage(
      {
        type: CANVAS_FOCUS_MESSAGE,
        blockId,
        field,
      } satisfies CanvasFocusMessage,
      "*",
    );
  });
}

export function setCanvasNavigationPreview(open: boolean) {
  window.requestAnimationFrame(() => {
    const frame = document.querySelector<HTMLIFrameElement>(
      ".homepage-editor__preview-frame iframe",
    );
    frame?.contentWindow?.postMessage(
      {
        type: CANVAS_NAVIGATION_MESSAGE,
        open,
      } satisfies CanvasNavigationMessage,
      "*",
    );
  });
}

/* ═══════ 编辑器会话状态类型 ═══════ */

export type AutoSaveState = "idle" | "saved" | "error";

export type PageDocumentRevision = {
  id: number;
  version: number;
  puckData: unknown;
  status?: string;
  publishedAt?: string | null;
  publishedBy?: number | null;
  createdAt?: string;
};

export type PageSessionCache = {
  data: any;
  metadata: Record<string, any>;
  lastSaved: string | null;
  updatedAt: string | null;
};
