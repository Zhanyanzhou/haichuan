import { useCallback, useEffect, useRef, useState } from "react";
import { pageDocumentApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import type { PuckBlock, PuckDocument } from "./PuckDocumentRenderer";

export type PublishedPageDocumentStatus =
  | "idle"
  | "loading"
  | "published"
  | "unpublished"
  | "invalid"
  | "error";

export type PublishedPageDocument = Record<string, unknown> & {
  pageKey: string;
  puckData: PuckDocument & { content: PuckBlock[] };
  metadata?: unknown;
  status: "PUBLISHED";
};

type PublishedPageDocumentState = {
  pageKey?: string;
  pageDocument: PublishedPageDocument | null;
  status: PublishedPageDocumentStatus;
  /** 刷新失败时仍在使用最后一次有效发布快照。 */
  stale: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isPuckBlock(value: unknown): value is PuckBlock {
  return isRecord(value)
    && typeof value.type === "string"
    && value.type.trim().length > 0
    && isRecord(value.props);
}

/**
 * 公共端只接受结构明确、且属于当前页面的已发布 PageDocument。
 * 这里不升级旧文档，也不把编辑器 seed 当成公开快照。
 */
export function isPublishedPageDocument(
  value: unknown,
  pageKey: string,
): value is PublishedPageDocument {
  if (!isRecord(value)) return false;
  if (value.pageKey !== pageKey || value.status !== "PUBLISHED") return false;
  if (!isRecord(value.puckData)) return false;
  if (!Array.isArray(value.puckData.content)) return false;
  if (!value.puckData.content.every(isPuckBlock)) return false;

  const zoneBlocks = isRecord(value.puckData.zones)
    ? Object.values(value.puckData.zones).flatMap((blocks) =>
        Array.isArray(blocks) ? blocks : [null],
      )
    : [];
  if (!zoneBlocks.every(isPuckBlock)) return false;

  return value.puckData.content.length + zoneBlocks.length > 0;
}

/**
 * 统一公开发布态语义：
 * - 200 + null = 从未发布；
 * - 非空但结构不合法 = invalid；
 * - 请求失败 = error；
 * - 已经展示过有效快照后刷新失败，不清空最后一次有效公开结果。
 */
export function usePublishedPageDocument(pageKey?: string) {
  const [state, setState] = useState<PublishedPageDocumentState>({
    pageKey: undefined,
    pageDocument: null,
    status: pageKey ? "loading" : "idle",
    stale: false,
  });
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const lastValidRef = useRef<{
    pageKey: string;
    pageDocument: PublishedPageDocument;
  } | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async (showLoading = false) => {
    if (!pageKey) {
      lastValidRef.current = null;
      setState({
        pageKey: undefined,
        pageDocument: null,
        status: "idle",
        stale: false,
      });
      return;
    }

    const requestId = ++requestIdRef.current;
    const lastValid = lastValidRef.current?.pageKey === pageKey
      ? lastValidRef.current.pageDocument
      : null;

    if (showLoading && !lastValid) {
      setState({
        pageKey,
        pageDocument: null,
        status: "loading",
        stale: false,
      });
    }

    try {
      const response = await pageDocumentApi.getPublished(pageKey);
      const pageDocument = unwrapResponse<unknown>(response);
      if (!mountedRef.current || requestIdRef.current !== requestId) return;

      if (pageDocument == null) {
        if (lastValid) {
          setState({
            pageKey,
            pageDocument: lastValid,
            status: "published",
            stale: true,
          });
        } else {
          setState({
            pageKey,
            pageDocument: null,
            status: "unpublished",
            stale: false,
          });
        }
        return;
      }

      if (!isPublishedPageDocument(pageDocument, pageKey)) {
        if (lastValid) {
          setState({
            pageKey,
            pageDocument: lastValid,
            status: "published",
            stale: true,
          });
        } else {
          setState({
            pageKey,
            pageDocument: null,
            status: "invalid",
            stale: false,
          });
        }
        return;
      }

      lastValidRef.current = { pageKey, pageDocument };
      setState({
        pageKey,
        pageDocument,
        status: "published",
        stale: false,
      });
    } catch {
      if (!mountedRef.current || requestIdRef.current !== requestId) return;
      if (lastValid) {
        setState({
          pageKey,
          pageDocument: lastValid,
          status: "published",
          stale: true,
        });
      } else {
        setState({
          pageKey,
          pageDocument: null,
          status: "error",
          stale: false,
        });
      }
    }
  }, [pageKey]);

  useEffect(() => {
    if (lastValidRef.current?.pageKey !== pageKey) {
      lastValidRef.current = null;
    }
    void refresh(true);
  }, [pageKey, refresh]);

  return { ...state, refresh };
}
