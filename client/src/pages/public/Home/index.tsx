import {
  useCallback,
  useEffect,
  lazy,
  useRef,
  Suspense,
  useState,
} from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { pageDocumentApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import { trackPageView } from "@/hooks/useAnalytics";
import {
  createEditorPageDefault,
  getEditorPage,
  isEditorPageKey,
} from "@/page-builder/config/editorPages";
import {
  usePublishedPageDocument,
  type PublishedPageDocumentResource,
} from "@/page-builder/runtime/usePublishedPageDocument";
import StaleDocumentNotice from "@/page-builder/runtime/StaleDocumentNotice";
import { PublicPageFallback } from "@/page-builder/runtime/PublishedPageDecoration";
import { getPublishedPageReadiness } from "@/page-builder/runtime/publishedPageReadiness";
import type { PuckDocument } from "@/page-builder/runtime/PuckDocumentRenderer";

// 首页基础内容与装修渲染器分离，只有取得已发布的 Puck 数据时才加载编辑器运行时。
const PuckDocumentRenderer = lazy(
  () => import("@/page-builder/runtime/PuckDocumentRenderer"),
);

const LG = "#F4F5F5";

function HomeDocumentLoading() {
  return (
    <div aria-busy="true" style={{ background: LG, minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <h1 className="sr-only">海川珠宝</h1>
      <span style={{ color: "#5F6568", fontSize: 12, letterSpacing: ".16em" }}>正在载入首页</span>
    </div>
  );
}

function PuckDocumentLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{ minHeight: 180, display: "grid", placeItems: "center", color: "#5F6568", fontSize: 12, letterSpacing: ".12em" }}
    >
      正在渲染首页内容
    </div>
  );
}

export default function Home() {
  const layoutDocumentResource = useOutletContext<PublishedPageDocumentResource | null>();
  // 正常公开路由消费 PublicLayout 的单一资源；独立挂载 Home 时保留安全读取能力。
  const standaloneDocumentResource = usePublishedPageDocument(
    layoutDocumentResource ? undefined : "home",
  );
  const {
    pageDocument,
    status: documentStatus,
    stale: documentStale,
    refresh: refreshDocument,
  } = layoutDocumentResource ?? standaloneDocumentResource;

  useEffect(() => {
    trackPageView();
  }, []);

  if (documentStatus === "idle" || documentStatus === "loading") {
    return <HomeDocumentLoading />;
  }

  if (documentStatus === "error" || documentStatus === "invalid") {
    const fallback = getEditorPage("home").publicFallback;
    const isReadFailure = documentStatus === "error";
    return (
      <PublicPageFallback
        pageKey="home"
        pageLabel="店铺首页"
        status={documentStatus}
        content={fallback ? {
          ...fallback,
          title: isReadFailure ? "首页暂不可用" : "首页正在完善",
          description: isReadFailure
            ? "首页内容暂时无法载入。您可以重新载入，或先进入选款中心浏览当前公开款式。"
            : "首页现有内容需要重新审核后才能公开。您可以先进入选款中心，或了解珠宝定制服务。",
        } : undefined}
        onRetry={isReadFailure ? () => void refreshDocument(true) : undefined}
      />
    );
  }

  if (documentStatus === "unpublished") {
    return (
      <PublicPageFallback
        pageKey="home"
        pageLabel="店铺首页"
        status="unpublished"
        content={getEditorPage("home").publicFallback}
      />
    );
  }

  if (!pageDocument) {
    return (
      <PublicPageFallback
        pageKey="home"
        pageLabel="店铺首页"
        status="invalid"
        content={getEditorPage("home").publicFallback}
      />
    );
  }

  const readiness = getPublishedPageReadiness("home", pageDocument.puckData);
  if (!readiness?.ready) {
    const fallback = getEditorPage("home").publicFallback;
    return (
      <PublicPageFallback
        pageKey="home"
        pageLabel="店铺首页"
        status="invalid"
        content={fallback ? {
          ...fallback,
          title: "首页正在完善",
          description: "首页内容尚未满足公开展示要求。您可以先进入选款中心，或了解珠宝定制服务。",
        } : undefined}
      />
    );
  }

  const hasVisibleHeroTitle = readiness.data.content?.some((block) =>
    block.type === "首屏主视觉"
    && block.props?.isVisible !== false
    && typeof block.props?.title === "string"
    && block.props.title.trim().length > 0,
  );

  return (
    <div data-page-document-state="published" style={{ background: LG }}>
      {!hasVisibleHeroTitle ? <h1 className="sr-only">海川珠宝</h1> : null}
      <Suspense fallback={<PuckDocumentLoading />}>
        <PuckDocumentRenderer
          data={readiness.data as PuckDocument}
          surface="home"
          heroHeadingLevel={hasVisibleHeroTitle ? 1 : 2}
        />
      </Suspense>
      <StaleDocumentNotice
        visible={documentStale}
        onRefresh={() => void refreshDocument(false)}
      />
    </div>
  );
}

function useDraftPageDocument(pageKey = "home") {
  const [pageDocument, setPageDocument] = useState<{
    puckData?: PuckDocument;
  } | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(
    async () => {
      setStatus("loading");
      try {
        const response = await pageDocumentApi.getAdmin(pageKey);
        if (mountedRef.current) {
          setPageDocument(unwrapResponse<{ puckData?: PuckDocument } | null>(response));
          setStatus("ready");
        }
      } catch {
        if (mountedRef.current) {
          setPageDocument(null);
          setStatus("error");
        }
      }
    },
    [pageKey],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { pageDocument, status, refresh };
}

export function HomePreview() {
  return <PagePreview pageKey="home" />;
}

export function PagePreview({ pageKey: pageKeyProp }: { pageKey?: string }) {
  const { pageKey: routePageKey } = useParams();
  const pageKey = pageKeyProp || routePageKey || "home";
  const { pageDocument, status, refresh } = useDraftPageDocument(pageKey);

  if (status === "loading") {
    return <main aria-busy="true" style={{ background: LG, minHeight: "100vh" }} />;
  }

  if (status === "error") {
    return (
      <main
        data-page-document-state="preview-error"
        style={{
          background: LG,
          minHeight: "70vh",
          display: "grid",
          placeItems: "center",
          padding: 24,
        }}
      >
        <section
          role="alert"
          aria-label="草稿预览暂时无法载入"
          style={{
            width: "min(100%, 520px)",
            padding: "32px 28px",
            background: "#FFFFFF",
            border: "1px solid #DDE1E2",
            textAlign: "center",
          }}
        >
          <h1 style={{ margin: 0, color: "#181A1B", fontSize: 24, fontWeight: 500 }}>
            草稿预览暂时无法载入
          </h1>
          <p style={{ margin: "14px 0 24px", color: "#5F6568", lineHeight: 1.7 }}>
            当前没有展示推荐结构或历史内容，请重新载入以核对最新草稿。
          </p>
          <button
            type="button"
            onClick={() => void refresh()}
            style={{
              minHeight: 42,
              padding: "0 20px",
              border: "1px solid #181A1B",
              background: "#181A1B",
              color: "#FFFFFF",
              cursor: "pointer",
            }}
          >
            重新载入草稿预览
          </button>
        </section>
      </main>
    );
  }

  return (
    <main style={{ background: LG }}>
      {pageDocument?.puckData ? (
        <Suspense fallback={<PuckDocumentLoading />}>
          <PuckDocumentRenderer data={pageDocument.puckData} mode="preview" />
        </Suspense>
      ) : (
        <Suspense fallback={<PuckDocumentLoading />}>
          <PuckDocumentRenderer mode="preview" data={
            isEditorPageKey(pageKey)
              ? createEditorPageDefault(pageKey)
              : createEditorPageDefault("home")
          } />
        </Suspense>
      )}
    </main>
  );
}
