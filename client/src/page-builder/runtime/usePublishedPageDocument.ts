import { useCallback, useEffect, useRef, useState } from "react";
import { usePagePublishStream } from "@/hooks/usePagePublishStream";
import { pageDocumentApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import type { PuckBlock, PuckDocument } from "./PuckDocumentRenderer";
import {
  getBrowserPublicContentLocale,
  type PublicContentLocale,
} from "@/i18n/publicLocale";

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

export type PublishedPageDocumentResource = PublishedPageDocumentState & {
  refresh: (showLoading?: boolean) => Promise<void>;
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

function isExplicitlyInvalidPublishedPageDocument(
  value: unknown,
  pageKey: string,
) {
  return isRecord(value)
    && value.pageKey === pageKey
    && value.status === "INVALID";
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
export function usePublishedPageDocument(
  pageKey?: string,
  localeOverride?: PublicContentLocale,
): PublishedPageDocumentResource {
  const locale = localeOverride ?? getBrowserPublicContentLocale();
  const [state, setState] = useState<PublishedPageDocumentState>({
    pageKey: undefined,
    pageDocument: null,
    status: pageKey ? "loading" : "idle",
    stale: false,
  });
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const activeRefreshRef = useRef<{ key: string; pending: boolean } | null>(null);
  const lastValidRef = useRef<{
    key: string;
    pageKey: string;
    pageDocument: PublishedPageDocument;
  } | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async (showLoading = false): Promise<void> => {
    if (!pageKey) {
      requestIdRef.current += 1;
      activeRefreshRef.current = null;
      lastValidRef.current = null;
      setState({
        pageKey: undefined,
        pageDocument: null,
        status: "idle",
        stale: false,
      });
      return;
    }

    const key = `${locale}:${pageKey}`;
    if (activeRefreshRef.current?.key === key) {
      // 首次订阅、重连或连续发布可能在 GET 期间到达；合并为读取后的补拉，
      // 避免新请求作废初次成功快照，而补拉失败又无可保留的内容。
      activeRefreshRef.current.pending = true;
      return;
    }
    const operation = { key, pending: false };
    activeRefreshRef.current = operation;
    const requestId = ++requestIdRef.current;
    const lastValid = lastValidRef.current?.key === key
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
      const response = await pageDocumentApi.getPublished(pageKey, locale);
      const pageDocument = unwrapResponse<unknown>(response);
      if (!mountedRef.current || requestIdRef.current !== requestId) return;

      if (pageDocument == null) {
        // 200 + null 是服务端明确的“当前语言没有发布指针”，不是暂时网络失败。
        // 必须清除旧内存快照，避免撤销发布后继续展示历史正文。
        lastValidRef.current = null;
        setState({
          pageKey,
          pageDocument: null,
          status: "unpublished",
          stale: false,
        });
        return;
      }

      // 服务端明确判定旧 revision 未通过当前正式内容门禁时，不能继续展示
      // 内存中的旧快照；这与暂时断网不同，必须立即进入安全降级。
      if (isExplicitlyInvalidPublishedPageDocument(pageDocument, pageKey)) {
        lastValidRef.current = null;
        setState({
          pageKey,
          pageDocument: null,
          status: "invalid",
          stale: false,
        });
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

      lastValidRef.current = { key, pageKey, pageDocument };
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
    } finally {
      if (activeRefreshRef.current === operation) {
        activeRefreshRef.current = null;
        if (operation.pending && mountedRef.current) void refresh(false);
      }
    }
  }, [locale, pageKey]);

  useEffect(() => {
    if (lastValidRef.current?.key !== `${locale}:${pageKey ?? ""}`) {
      lastValidRef.current = null;
    }
    void refresh(true);
  }, [locale, pageKey, refresh]);

  usePagePublishStream(pageKey, () => {
    void refresh(false);
  }, locale);

  // 页面重新可见时主动对齐 revision，弥补断网、合盖或后台标签页期间错过的发布事件。
  useEffect(() => {
    if (!pageKey) return;
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refresh(false);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [pageKey, refresh]);

  return { ...state, refresh };
}
