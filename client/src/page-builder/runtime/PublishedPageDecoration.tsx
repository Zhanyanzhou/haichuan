import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { usePagePublishStream } from "@/hooks/usePagePublishStream";
import { pageDocumentApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import PuckDocumentRenderer from "./PuckDocumentRenderer";

type PublishedPageDecorationProps = {
  pageKey?: string;
  pageLabel?: string;
  children?: ReactNode;
};

type PageResult = {
  pageKey?: string;
  pageDocument: any;
  status: "idle" | "loading" | "ready";
};

/**
 * 业务页保留其商品、筛选、表单等真实功能；已发布的装修内容作为页面前置视觉区渲染。
 * 未发布、加载失败或数据为空时静默降级为原业务页面，避免出现空白页。
 */
export default function PublishedPageDecoration({
  pageKey,
  pageLabel,
  children,
}: PublishedPageDecorationProps) {
  const [result, setResult] = useState<PageResult>({
    pageKey: undefined,
    pageDocument: null,
    status: "idle",
  });
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async (showLoading = false) => {
    if (!pageKey) {
      setResult({ pageKey: undefined, pageDocument: null, status: "ready" });
      return;
    }

    const requestId = ++requestIdRef.current;
    if (showLoading) {
      setResult({ pageKey, pageDocument: null, status: "loading" });
    }
    try {
      const response = await pageDocumentApi.getPublished(pageKey);
      if (mountedRef.current && requestIdRef.current === requestId) {
        setResult({
          pageKey,
          pageDocument: unwrapResponse<any>(response),
          status: "ready",
        });
      }
    } catch {
      if (mountedRef.current && requestIdRef.current === requestId) {
        setResult({ pageKey, pageDocument: null, status: "ready" });
      }
    }
  }, [pageKey]);

  useEffect(() => {
    void refresh(true);
  }, [refresh]);

  usePagePublishStream(pageKey, () => {
    void refresh();
  });

  const renderableData = result.pageKey === pageKey && result.pageDocument?.puckData
    ? {
        ...result.pageDocument.puckData,
        content: (result.pageDocument.puckData.content || []).filter(
          (block: { type?: string }) => block.type !== "业务功能区",
        ),
      }
    : null;

  if (!pageKey) return <>{children}</>;

  const loading = result.pageKey !== pageKey || result.status === "loading";
  if (loading) {
    return (
      <section
        aria-busy="true"
        aria-label={`正在载入${pageLabel || "页面"}`}
        style={{
          minHeight: "calc(100vh - 88px)",
          display: "grid",
          placeItems: "center",
          background: "#F4F0E8",
          color: "#8C785C",
          fontSize: 12,
          letterSpacing: ".14em",
        }}
      >
        正在载入{pageLabel || "页面"}
      </section>
    );
  }

  return (
    <>
      {renderableData?.content?.length ? (
        <section aria-label={`${pageLabel || "页面"}装修内容`}>
          <PuckDocumentRenderer data={renderableData} />
        </section>
      ) : null}
      {children}
    </>
  );
}
