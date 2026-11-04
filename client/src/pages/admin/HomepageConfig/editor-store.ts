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
import type { PuckDocument } from "@/page-builder/types";

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

let canvasFocusRequest = 0;

/** 同源 iframe 的几何由宿主滚动，postMessage 只负责画布中的定位反馈。 */
export function focusCanvasBlock(blockId?: string, field?: string, waitForLayout = false) {
  if (!blockId) return;
  const request = ++canvasFocusRequest;
  let remainingFrames = waitForLayout ? 60 : 0;
  const focus = () => {
    if (request !== canvasFocusRequest) return;
    const retry = () => {
      if (remainingFrames-- > 0) window.requestAnimationFrame(focus);
    };
    const frame = document.querySelector<HTMLIFrameElement>(
      ".homepage-editor__preview-frame iframe",
    );

    // 设计画布 iframe 会随 1920 基准宽度等比缩放，实际滚动容器在宿主 stage。
    // iframe 内 scrollIntoView 只负责字段自身定位，不能可靠推动宿主滚动，因此在
    // 同源编辑器中用真实几何位置把目标模块带到可视区上缘。
    const scrollContainer =
      frame?.closest<HTMLElement>(".homepage-editor__canvas-scroll") ??
      frame?.closest<HTMLElement>(".homepage-editor__stage");
    const documentElement = frame?.contentDocument?.documentElement;
    if (!frame || !scrollContainer || !documentElement) return retry();
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
    if (!target) return retry();
    const iframeRect = frame.getBoundingClientRect();
    const scrollRect = scrollContainer.getBoundingClientRect();
    const scale = iframeRect.width / Math.max(1, documentElement.clientWidth);
    const targetRect = target.getBoundingClientRect();
    // 新增节点的 DOM 先提交，iframe 高度再经消息回填；过早滚动会被旧高度截断。
    if (waitForLayout && remainingFrames > 0
      && documentElement.clientHeight + 2 < targetRect.bottom) return retry();
    frame.contentWindow?.postMessage(
      { type: CANVAS_FOCUS_MESSAGE, blockId, field } satisfies CanvasFocusMessage,
      "*",
    );
    const targetTop = iframeRect.top + targetRect.top * scale;
    const desiredTop = scrollRect.top + (targetField ? 24 : 12);
    scrollContainer.scrollBy({
      top: targetTop - desiredTop,
      // 图层选择、排序和属性更新可能在很短时间内连续发生；平滑滚动会把
      // 多个旧目标排队，导致用户停止操作后画布才跳到先前模块。
      behavior: "auto",
    });
  };
  window.requestAnimationFrame(focus);
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

export type PageDocumentRevisionSummary = {
  id: number;
  version: number;
  status?: string;
  publishedAt?: string | null;
  publishedBy?: number | null;
  createdAt?: string;
  isPublished?: boolean;
};

export type PageDocumentRevisionDetail = PageDocumentRevisionSummary & {
  puckData: unknown;
  metadata?: Record<string, unknown>;
};

export type PageDocumentRevisionPage = {
  items: PageDocumentRevisionSummary[];
  nextBeforeVersion: number | null;
};

/** 后台草稿快照：发布版本抽屉中用于展示与一键编辑的“未发布草稿”。 */
export type PageDraftSnapshot = {
  pageKey: string;
  puckData: unknown;
  metadata?: Record<string, unknown>;
  updatedAt?: string | null;
};

export type PageSessionCache = {
  data: PuckDocument;
  metadata: Record<string, unknown>;
  lastSaved: string | null;
  updatedAt: string | null;
  contentHash: string | null;
  reviewStatus: "DRAFT" | "IN_REVIEW" | "CHANGES_REQUESTED" | "APPROVED" | "PUBLISHED" | "ARCHIVED";
};

export type PageEditorHistorySnapshot = {
  data: PuckDocument;
  metadata: Record<string, unknown>;
  hasUnsavedChanges: boolean;
  hasPendingDraft: boolean;
  pendingDraft: PuckDocument | null;
  savedSignature: string;
};

/** 与一个 Puck History 项绑定的页面复合命令；正文与 metadata 必须一起回放。 */
export type PageEditorHistoryCommand = {
  id: string;
  before: PageEditorHistorySnapshot;
  after: PageEditorHistorySnapshot;
};
