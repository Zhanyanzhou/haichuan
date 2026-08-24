/**
 * editor-store.ts — 装修编辑器的共享状态基座。
 *
 * Puck store 单例与「宿主 ↔ 画布 iframe」的 postMessage 协议集中于此，
 * 供 HomepageConfig/index.tsx 与 components/* 共同引用。
 * （自 index.tsx 平移，逻辑零变更）
 */
import { createUsePuck } from "@puckeditor/core";
import { puckConfig } from "@/page-builder/config/puckConfig";
import { create } from "zustand";

export const useHomepagePuck = createUsePuck<typeof puckConfig>();

/** Inspector reset 写入 Puck 历史期间，阻止顶栏读取到尚未闭合的事务。 */
export const useEditorHistoryTransaction = create<{
  pending: boolean;
  setPending: (pending: boolean) => void;
}>((set) => ({
  pending: false,
  setPending: (pending) => set({ pending }),
}));

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

    // 设计画布 iframe 会随 1920 基准宽度等比缩放，实际滚动容器在宿主 stage。
    // iframe 内 scrollIntoView 只负责字段自身定位，不能可靠推动宿主滚动，因此在
    // 同源编辑器中用真实几何位置把目标模块带到可视区上缘。
    const scrollContainer =
      frame?.closest<HTMLElement>(".homepage-editor__canvas-scroll") ??
      frame?.closest<HTMLElement>(".homepage-editor__stage");
    const documentElement = frame?.contentDocument?.documentElement;
    if (!frame || !scrollContainer || !documentElement) return;
    const targetBlock = Array.from(
      frame.contentDocument?.querySelectorAll<HTMLElement>(
        "[data-editor-block-id]",
      ) ?? [],
    ).find((element) => element.dataset.editorBlockId === blockId);
    const targetField = field && targetBlock
      ? Array.from(
          targetBlock.querySelectorAll<HTMLElement>("[data-editor-field]"),
        ).find((element) =>
          element.dataset.editorField?.split(/\s+/).includes(field),
        )
      : null;
    const target = targetField ?? targetBlock;
    if (!target) return;
    const iframeRect = frame.getBoundingClientRect();
    const scrollRect = scrollContainer.getBoundingClientRect();
    const scale = iframeRect.width / Math.max(1, documentElement.clientWidth);
    const targetRect = target.getBoundingClientRect();
    const targetTop = iframeRect.top + targetRect.top * scale;
    const desiredTop = scrollRect.top + (targetField ? 24 : 12);
    scrollContainer.scrollBy({
      top: targetTop - desiredTop,
      // 图层选择、排序和属性更新可能在很短时间内连续发生；平滑滚动会把
      // 多个旧目标排队，导致用户停止操作后画布才跳到先前模块。
      behavior: "auto",
    });
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
  metadata?: Record<string, any>;
  status?: string;
  publishedAt?: string | null;
  publishedBy?: number | null;
  createdAt?: string;
};

/** 后台草稿快照：发布版本抽屉中用于展示与一键编辑的“未发布草稿”。 */
export type PageDraftSnapshot = {
  pageKey: string;
  puckData: unknown;
  metadata?: Record<string, any>;
  updatedAt?: string | null;
};

export type PageSessionCache = {
  data: any;
  metadata: Record<string, any>;
  lastSaved: string | null;
  updatedAt: string | null;
};
