/**
 * editor-utils.ts — 装修编辑器的纯函数与共享类型。
 * 不含组件与 Puck store 状态，仅依赖 config 层常量。
 * （自 index.tsx 平移，逻辑零变更）
 */
import type { ReactNode } from "react";
import { BLOCK_META } from "@/page-builder/config/blockMeta";
import { isMobileCanvasWidth } from "@/page-builder/config/blockContracts";
import { focusCanvasBlock } from "./editor-store";

export type ViewportPreset = {
  label: string;
  icon: ReactNode;
  width: number | "100%";
  height: number | "auto";
  displayWidth?: number;
};

export function formatViewportSize(preset: ViewportPreset) {
  return `${preset.displayWidth ?? preset.width} × ${preset.height}`;
}

export function cloneModuleProps<T extends Record<string, any>>(props: T): T {
  return JSON.parse(JSON.stringify(props)) as T;
}

/** 递归按键名排序，消除对象键序差异导致的误判。 */
function sortObjectKeys(value: any): any {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (value && typeof value === "object") {
    const sorted: Record<string, any> = {};
    Object.keys(value)
      .sort()
      .forEach((key) => {
        sorted[key] = sortObjectKeys(value[key]);
      });
    return sorted;
  }
  return value;
}

/**
 * 页面内容语义指纹：只比较 content 数组的 type 与 props，
 * 忽略会话生成的 block id、对象键序与 Puck 归一化带来的结构差异。
 * 用于判断“草稿是否与线上已发布内容存在实质差异”。
 */
export function canonicalizePuckContent(puck: unknown): string {
  if (!puck || !Array.isArray((puck as any).content)) return "";
  return JSON.stringify(
    (puck as any).content.map((block: any) => {
      const props = { ...(block.props || {}) };
      delete props.id;
      return { type: block.type, props: sortObjectKeys(props) };
    }),
  );
}

export function getModuleDisplayName(
  type: string,
  props?: Record<string, any>,
) {
  // 2026-08-16 用户决策：模块名固定为模板显示名，忽略历史自定义 moduleName。
  return BLOCK_META[type]?.name ?? type;
}

export function formatEditorTime(value?: string | Date | null) {
  if (!value) return "";
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getEditorErrorMessage(error: unknown, fallback: string) {
  const responseMessage = (
    error as { response?: { data?: { message?: unknown } } }
  )?.response?.data?.message;
  if (typeof responseMessage === "string" && responseMessage.trim())
    return responseMessage;
  if (Array.isArray(responseMessage))
    return (
      responseMessage.filter((item) => typeof item === "string").join("；") ||
      fallback
    );
  return error instanceof Error && error.message ? error.message : fallback;
}

export function getEditorHttpStatus(error: unknown) {
  const status = (error as { response?: { status?: unknown } })?.response
    ?.status;
  return typeof status === "number" ? status : undefined;
}

export type InspectorDevice = "desktop" | "mobile";

export function getInspectorDevice(viewport: {
  width: number | "100%";
}): InspectorDevice {
  return isMobileCanvasWidth(viewport.width) ? "mobile" : "desktop";
}

export function getFieldDevice(
  type: string,
  field: string,
): "desktop" | "mobile" | "shared" {
  if (field === "mobileImage" || field === "mobileUrl") return "mobile";
  if (
    (type === "首屏主视觉" || type === "单图海报") &&
    field === "desktopImage"
  )
    return "desktop";
  if (type === "全屏出血图" && field === "image") return "desktop";
  if (type === "轮播图" && field === "url") return "desktop";
  return "shared";
}

export function createCropPreview(
  aspectRatio: string,
  focusX = 50,
  focusY = 50,
) {
  return {
    previewAspectRatio: aspectRatio,
    previewFocus: { x: focusX, y: focusY },
  };
}

/** 定位右侧面板中的字段控件并联动画布滚动到对应模块。 */
export function focusInspectorField(field: string, blockId?: string) {
  window.requestAnimationFrame(() => {
    const target = document.querySelector<HTMLElement>(
      `[name="${field}"], [id*="${field}"], [data-media-field="${field}"]`,
    );
    target?.scrollIntoView({ block: "center", behavior: "smooth" });
    const focusable = target?.matches("input, textarea, select, button")
      ? target
      : target?.querySelector<HTMLElement>("button, input, textarea, select") ||
        target;
    focusable?.focus();

    focusCanvasBlock(blockId, field);
  });
}
