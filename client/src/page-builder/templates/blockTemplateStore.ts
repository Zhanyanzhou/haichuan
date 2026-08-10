/**
 * blockTemplateStore.ts — 区块模板 localStorage 持久化
 */
const STORAGE_KEY = "homepage-editor-block-templates";

export interface BlockTemplate {
  id: string;
  name: string;
  type: string;
  props: Record<string, any>;
  createdAt: string;
}

function readAll(): BlockTemplate[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function writeAll(list: BlockTemplate[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 30)));
}

export const blockTemplateStore = {
  getAll: readAll,
  save(name: string, type: string, props: Record<string, any>): BlockTemplate {
    const t: BlockTemplate = {
      id: `bt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name, type,
      props: JSON.parse(JSON.stringify(props)),
      createdAt: new Date().toISOString(),
    };
    const list = [t, ...readAll()];
    writeAll(list);
    return t;
  },
  remove(id: string): void { writeAll(readAll().filter((t) => t.id !== id)); },
};
