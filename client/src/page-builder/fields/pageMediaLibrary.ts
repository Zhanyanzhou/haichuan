export const PAGE_MEDIA_STORAGE_KEY = "haichuan.page-media";
export const PAGE_MEDIA_LIBRARY_CHANGED_EVENT = "page-builder:page-media-library-changed";

export type PageMediaItem = {
  url: string;
  type: "image" | "video";
  name: string;
  createdAt: string;
};

function isPageMediaItem(value: unknown): value is PageMediaItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return typeof item.url === "string"
    && (item.type === "image" || item.type === "video")
    && typeof item.name === "string"
    && typeof item.createdAt === "string";
}

function resolveStorage(storage?: Storage) {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readPageMediaLibrary(storage?: Storage): PageMediaItem[] {
  const target = resolveStorage(storage);
  if (!target) return [];
  try {
    const raw = target.getItem(PAGE_MEDIA_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isPageMediaItem) : [];
  } catch {
    return [];
  }
}

export function writePageMediaLibrary(items: readonly PageMediaItem[], storage?: Storage) {
  const target = resolveStorage(storage);
  if (!target) return false;
  try {
    target.setItem(PAGE_MEDIA_STORAGE_KEY, JSON.stringify(items));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(PAGE_MEDIA_LIBRARY_CHANGED_EVENT));
    }
    return true;
  } catch {
    return false;
  }
}

export function addPageMediaItem(item: PageMediaItem, storage?: Storage) {
  const current = readPageMediaLibrary(storage);
  return writePageMediaLibrary(
    [item, ...current.filter((candidate) => candidate.url !== item.url)],
    storage,
  );
}
