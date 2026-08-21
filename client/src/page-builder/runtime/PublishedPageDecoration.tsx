import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePagePublishStream } from "@/hooks/usePagePublishStream";
import { pageDocumentApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import {
  createEditorPageDefault,
  ensureEditorPageStructure,
  isEditorPageKey,
} from "@/page-builder/config/editorPages";

// 页面装修器及其编辑器依赖仅在确有已发布内容时加载，避免进入纯展示页首屏。
const PuckDocumentRenderer = lazy(() => import("./PuckDocumentRenderer"));
const AntdProvider = lazy(() => import("@/components/common/AntdProvider"));

type PublishedPageDecorationProps = {
  pageKey?: string;
  pageLabel?: string;
  children?: ReactNode;
  /** 关于与定制等纯品牌页：有发布内容时替换代码兜底页。 */
  replaceChildren?: boolean;
};

type PageResult = {
  pageKey?: string;
  pageDocument: any;
  status: "idle" | "loading" | "ready";
};

type PageDecorationState = {
  active: boolean;
  pageKey?: string;
};

const PageDecorationContext = createContext<PageDecorationState>({
  active: false,
});

/** 动态业务页用它隐藏自身旧页头，只保留装修文档中的视觉页头。 */
export function usePageDecorationState() {
  return useContext(PageDecorationContext);
}

/**
 * 业务页保留其商品、筛选、表单等真实功能；装修内容围绕固定业务区渲染。
 * 没有发布文档时使用与编辑器一致的 PageDocument 种子，不再回退到第二套静态页面。
 */
export default function PublishedPageDecoration({
  pageKey,
  pageLabel,
  children,
  replaceChildren = false,
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

  const defaultData = useMemo(
    () => isEditorPageKey(pageKey) ? createEditorPageDefault(pageKey) : null,
    [pageKey],
  );
  const hasPublishedDocument = Boolean(
    result.pageKey === pageKey && result.pageDocument?.puckData,
  );
  const sourceData = hasPublishedDocument
    ? result.pageDocument.puckData
    : defaultData;
  const structuredData = sourceData && isEditorPageKey(pageKey)
    ? ensureEditorPageStructure(pageKey, sourceData)
    : sourceData;
  const content = Array.isArray(structuredData?.content)
    ? structuredData.content
    : [];
  const businessRegionIndex = content.findIndex(
    (block: { type?: string }) => block?.type === "业务功能区",
  );
  const beforeContent = businessRegionIndex >= 0
    ? content.slice(0, businessRegionIndex)
    : content;
  const afterContent = businessRegionIndex >= 0
    ? content.slice(businessRegionIndex + 1)
    : [];

  if (!pageKey) return <>{children}</>;

  const withDecorationState = (node: ReactNode) => (
    <PageDecorationContext.Provider value={{ active: hasPublishedDocument, pageKey }}>
      {node}
    </PageDecorationContext.Provider>
  );

  const loading = result.pageKey !== pageKey || result.status === "loading";
  if (loading) {
    if (!replaceChildren) return withDecorationState(children);
    return withDecorationState(
      <div
        aria-busy="true"
        aria-live="polite"
        style={{ minHeight: "60vh", display: "grid", placeItems: "center", color: "#5F6568", fontSize: 12 }}
      >
        正在载入{pageLabel || "页面"}
      </div>,
    );
  }

  const renderDecoration = (sectionContent: any[], position: "before" | "after") => {
    if (!sectionContent.length || !structuredData) return null;
    const data = { ...structuredData, content: sectionContent };
    return (
      <section aria-label={`${pageLabel || "页面"}装修内容${position === "after" ? "补充" : ""}`}>
        <Suspense
          fallback={
            <div
              aria-busy="true"
              aria-live="polite"
              style={{ minHeight: 120, display: "grid", placeItems: "center", color: "#5F6568", fontSize: 12 }}
            >
              正在渲染页面内容
            </div>
          }
        >
          <AntdProvider>
            <PuckDocumentRenderer data={data} />
          </AntdProvider>
        </Suspense>
      </section>
    );
  };

  if (!content.length) return withDecorationState(children);

  if (replaceChildren) {
    return withDecorationState(
      <>
        {!hasPublishedDocument && pageLabel ? (
          <h1 className="sr-only">{pageLabel}</h1>
        ) : null}
        {renderDecoration(
          content.filter((block: { type?: string }) => block?.type !== "业务功能区"),
          "before",
        )}
      </>,
    );
  }

  return withDecorationState(
    <>
      {renderDecoration(beforeContent, "before")}
      {children}
      {renderDecoration(afterContent, "after")}
    </>,
  );
}
