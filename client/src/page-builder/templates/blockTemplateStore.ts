import {
  createContentTemplateMarker,
  getContentTemplateContract,
} from "../generated/contentTemplates.generated";
import type { PuckProps } from "../types";

/**
 * blockTemplateStore.ts — 区块模板 localStorage 持久化
 */
const STORAGE_KEY = "homepage-editor-block-templates";

export interface BlockTemplate {
  id: string;
  name: string;
  type: string;
  props: PuckProps;
  createdAt: string;
  templateId?: string;
  templateVersion?: number;
}

function readAll(): BlockTemplate[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((item): item is BlockTemplate => Boolean(
          item && typeof item === "object" && !Array.isArray(item)
          && typeof (item as { id?: unknown }).id === "string"
          && typeof (item as { name?: unknown }).name === "string"
          && typeof (item as { type?: unknown }).type === "string"
          && (item as { props?: unknown }).props !== null
          && typeof (item as { props?: unknown }).props === "object",
        ))
      : [];
  } catch { return []; }
}

function writeAll(list: BlockTemplate[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 30)));
}

export const blockTemplateStore = {
  getAll: readAll,
  save(name: string, type: string, props: PuckProps): BlockTemplate {
    const contract = getContentTemplateContract(type);
    const marker = createContentTemplateMarker(type);
    const t: BlockTemplate = {
      id: `bt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name, type,
      // 常用方案插入的是一个新实例：active 模板在副本中生成当前印记，
      // 不回写也不升级画布上被另存的 legacy-0 原区块。
      props: {
        ...JSON.parse(JSON.stringify(props)),
        ...(marker ? { __contentTemplate: marker } : {}),
      },
      createdAt: new Date().toISOString(),
      ...(contract
        ? { templateId: contract.key, templateVersion: contract.version }
        : {}),
    };
    const list = [t, ...readAll()];
    writeAll(list);
    return t;
  },
  remove(id: string): void { writeAll(readAll().filter((t) => t.id !== id)); },
};
