import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Input } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { uploadApi, type PageMediaAsset } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import { resolveManagedTemplateMediaPreviewUrl } from "../template-definition/managedMediaPreview";
import {
  readPageMediaLibrary,
  writePageMediaLibrary,
  type PageMediaItem,
} from "./pageMediaLibrary";
import { cachedImageFactFields } from "./trustedMediaSize";

const PAGE_SIZE = 100;
const SESSION_MEDIA_UPLOADED_EVENT = "page-builder:media-uploaded";

type LoadState = "idle" | "loading" | "ready" | "error";

function cachedImages(): PageMediaItem[] {
  return readPageMediaLibrary().filter((item) => item.type === "image");
}

async function readReadyImages(): Promise<PageMediaItem[]> {
  const assets = new Map<number, PageMediaAsset>();
  let page = 1;
  let total = 0;
  do {
    const response = await uploadApi.listPageMedia({
      page,
      pageSize: PAGE_SIZE,
      type: "image",
      status: "READY",
    });
    const data = unwrapResponse<{
      list: PageMediaAsset[];
      total: number;
    }>(response);
    const batch = Array.isArray(data?.list) ? data.list : [];
    total = typeof data?.total === "number" ? data.total : 0;
    batch.forEach((asset) => assets.set(asset.id, asset));
    page += 1;
    if (batch.length === 0) break;
  } while ((page - 1) * PAGE_SIZE < total);

  return [...assets.values()]
    .filter((asset) => asset.type === "image" && asset.status === "READY" && asset.available)
    .map((asset) => ({
      url: asset.url,
      type: "image" as const,
      name: asset.name,
      createdAt: asset.createdAt,
      ...cachedImageFactFields(asset),
    }));
}

function useSharedPageMedia(active: boolean) {
  const [state, setState] = useState<LoadState>("idle");
  const [items, setItems] = useState<PageMediaItem[]>(cachedImages);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setState("loading");
    try {
      const next = await readReadyImages();
      if (requestId !== requestIdRef.current) return;
      setItems(next);
      setState("ready");
      // 浏览器存储仅作下次加载前的视觉缓存；当前结果始终以本次服务端读取为准。
      writePageMediaLibrary(next);
    } catch {
      if (requestId !== requestIdRef.current) return;
      setItems([]);
      setState("error");
    }
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    void load();
    const refresh = () => void load();
    window.addEventListener(SESSION_MEDIA_UPLOADED_EVENT, refresh);
    return () => {
      requestIdRef.current += 1;
      window.removeEventListener(SESSION_MEDIA_UPLOADED_EVENT, refresh);
    };
  }, [active, load]);

  return { state, items, retry: load };
}

export default function SharedPageMediaPicker({
  open,
  currentValue,
  onSelect,
}: {
  open: boolean;
  currentValue?: string;
  onSelect: (url: string) => void;
}) {
  const { state, items, retry } = useSharedPageMedia(open);
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);
  if (!open) return null;

  const selectable = state === "ready";
  const keyword = query.trim().toLowerCase();
  const visibleItems = keyword
    ? items.filter((item) => item.name.toLowerCase().includes(keyword))
    : items;
  const currentAvailable = Boolean(
    currentValue && items.some((item) => item.url === currentValue),
  );

  return (
    <div
      className="homepage-editor__current-page-media"
      aria-label="共享页面素材"
      role="region"
    >
      <div className="homepage-editor__current-page-media-heading">
        <strong>共享页面素材</strong>
        <span role="status">{keyword ? `${visibleItems.length} / ${items.length} 张` : `${items.length} 张`}</span>
      </div>
      {selectable && items.length > 0 ? (
        <Input
          allowClear
          aria-label="搜索素材文件名"
          placeholder="搜索素材文件名"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      ) : null}
      {state === "loading" ? (
        <p className="homepage-editor__current-page-media-empty" role="status">
          正在同步共享素材库；缓存图片暂不可选择。
        </p>
      ) : null}
      {state === "error" ? (
        <div className="homepage-editor__current-page-media-empty" role="alert">
          <p>共享素材加载失败，未使用浏览器缓存代替最新结果。</p>
          <Button size="small" icon={<ReloadOutlined />} onClick={() => void retry()}>
            重新加载共享素材
          </Button>
        </div>
      ) : null}
      {state === "ready" && currentValue && !currentAvailable ? (
        <div className="homepage-editor__current-page-media-empty" role="status">
          <strong>当前引用需核对</strong>
          <p>当前值已保留，但不在可用共享素材中，可能已归档或失效，不能重新选择。</p>
        </div>
      ) : null}
      {state !== "error" && visibleItems.length > 0 ? (
        <div className="homepage-editor__current-page-media-items">
          {visibleItems.map((item) => (
            <button
              key={item.url}
              type="button"
              className={`homepage-editor__page-media-option${item.url === currentValue ? " is-current" : ""}`}
              disabled={!selectable}
              onClick={() => onSelect(item.url)}
              aria-label={item.url === currentValue ? `当前素材：${item.name}` : `使用素材：${item.name}`}
              title={item.name}
            >
              <img
                src={resolveManagedTemplateMediaPreviewUrl(item.url, 480)}
                alt=""
                loading="lazy"
                onError={(event) => {
                  // 动图或不支持转码的格式保留原素材；只回退一次，不循环请求失败图片。
                  const original = resolveManagedTemplateMediaPreviewUrl(item.url);
                  if (event.currentTarget.getAttribute("src") !== original) {
                    event.currentTarget.src = original;
                  }
                }}
              />
              <span>{item.name}</span>
            </button>
          ))}
        </div>
      ) : state === "ready" ? (
        <p className="homepage-editor__current-page-media-empty">
          {items.length ? "没有匹配的素材，可修改文件名关键词。" : "共享素材库暂无可用图片，可上传新图。"}
        </p>
      ) : null}
    </div>
  );
}
