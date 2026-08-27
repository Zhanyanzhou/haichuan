import type { PuckProps } from "../types";
import { extractContentTemplateLayoutData } from "../generated/contentTemplates.generated";

export interface SharedTemplateBlock {
  type: string;
  props: PuckProps;
}

/**
 * 页面内同一 moduleType 共用设计，内容与模块级状态仍保持实例独立。
 * 调用方只传入已经过合同清洗的设计补丁，避免在这里建立第二份布局事实。
 */
export function applySharedTemplateDesignPatch<T extends SharedTemplateBlock>(
  content: T[],
  moduleType: string,
  patch: PuckProps,
): T[] {
  let changed = false;
  const next = content.map((item) => {
    if (item.type !== moduleType) return item;
    changed = true;
    return {
      ...item,
      props: {
        ...item.props,
        ...patch,
        ...(item.props.id === undefined ? {} : { id: item.props.id }),
      },
    };
  });
  return changed ? next : content;
}

export function getSharedTemplateDesignSignatures(
  content: SharedTemplateBlock[],
  moduleType: string,
): Set<string> {
  return new Set(
    content
      .filter((item) => item.type === moduleType)
      .map((item) => JSON.stringify(
        extractContentTemplateLayoutData(moduleType, item.props) ?? null,
      )),
  );
}
