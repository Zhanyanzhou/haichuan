import {
  createContext,
  lazy,
  Suspense,
  useContext,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import StaleDocumentNotice from "./StaleDocumentNotice";
import {
  getPublishedPageReadiness,
  isRenderablePublishedBrandBlock,
} from "./publishedPageReadiness";
import {
  type PublishedPageDocumentResource,
  type PublishedPageDocumentStatus,
} from "./usePublishedPageDocument";
import type { PuckBlock } from "./PuckDocumentRenderer";

// 页面装修器及其编辑器依赖仅在确有已发布内容时加载，避免进入纯展示页首屏。
const PuckDocumentRenderer = lazy(() => import("./PuckDocumentRenderer"));
const AntdProvider = lazy(() => import("@/components/common/AntdProvider"));

export type PublicPageFallbackContent = {
  eyebrow: string;
  title: string;
  description: string;
  primaryAction: { label: string; href: string };
  secondaryAction?: { label: string; href: string };
};

type PublishedPageDecorationProps = {
  pageKey?: string;
  pageLabel?: string;
  documentResource: PublishedPageDocumentResource;
  children?: ReactNode;
  /** 关于与定制等纯品牌页：只有有效发布内容才能替换安全短页。 */
  replaceChildren?: boolean;
  /** 未发布、无效或读取失败时的公开安全短页；与编辑器 seed 完全隔离。 */
  publicFallback?: PublicPageFallbackContent;
};

type PageDecorationState = {
  active: boolean;
  pageKey?: string;
  status: PublishedPageDocumentStatus;
};

const PageDecorationContext = createContext<PageDecorationState>({
  active: false,
  status: "idle",
});

/** 动态业务页用它隐藏自身旧页头，只保留装修文档中的视觉页头。 */
export function usePageDecorationState() {
  return useContext(PageDecorationContext);
}

export function PublicPageFallback({
  pageKey,
  pageLabel,
  status,
  content,
  onRetry,
}: {
  pageKey: string;
  pageLabel?: string;
  status: PublishedPageDocumentStatus;
  content?: PublicPageFallbackContent;
  onRetry?: () => void;
}) {
  const fallbackTitleId = `${pageKey}-public-fallback-title`;
  // 未发布或合同无效需要运营补齐内容；重复请求不会改变结果。
  // 只有真实读取失败才向访客提供可恢复动作。
  const canRetry = Boolean(onRetry && status === "error");

  return (
    <section
      data-page-document-state={status}
      data-production-fallback={content ? "safe-status" : "disabled"}
      aria-labelledby={fallbackTitleId}
      aria-live="polite"
      style={{
        minHeight: "min(680px, 70vh)",
        display: "grid",
        placeItems: "center",
        padding: "clamp(88px, 12vw, 168px) 24px",
        textAlign: "center",
        background: "#F7F8F8",
        color: "#181A1B",
      }}
    >
      <div style={{ width: "min(100%, 680px)" }}>
        {content?.eyebrow ? (
          <p style={{ margin: "0 0 22px", color: "#6E7477", fontSize: 10, letterSpacing: "0.2em" }}>
            {content.eyebrow}
          </p>
        ) : null}
        <h1
          id={fallbackTitleId}
          style={{
            margin: 0,
            fontFamily: 'var(--hc-font-display, "Cormorant Garamond", "Noto Serif SC", serif)',
            fontSize: "clamp(32px, 5vw, 56px)",
            fontWeight: 400,
            letterSpacing: "0.03em",
            lineHeight: 1.16,
          }}
        >
          {content?.title || pageLabel || "页面内容"}
        </h1>
        <p style={{ maxWidth: 560, margin: "24px auto 0", color: "#5F6568", fontSize: 14, lineHeight: 1.9 }}>
          {content?.description || "内容暂不可用，请稍后再试。"}
        </p>
        {content ? (
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12, marginTop: 34 }}>
            <Link
              to={content.primaryAction.href}
              className="page-public-fallback__action"
              style={{
                display: "inline-flex",
                minHeight: 48,
                alignItems: "center",
                justifyContent: "center",
                padding: "0 26px",
                background: "#181A1B",
                color: "#FFFFFF",
                fontSize: 12,
                letterSpacing: "0.08em",
                textDecoration: "none",
              }}
            >
              {content.primaryAction.label}
            </Link>
            {content.secondaryAction ? (
              <Link
                to={content.secondaryAction.href}
                className="page-public-fallback__action"
                style={{
                  display: "inline-flex",
                  minHeight: 48,
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0 26px",
                  border: "1px solid rgba(24,26,27,0.32)",
                  color: "#181A1B",
                  fontSize: 12,
                  letterSpacing: "0.08em",
                  textDecoration: "none",
                }}
              >
                {content.secondaryAction.label}
              </Link>
            ) : null}
          </div>
        ) : null}
        {canRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="page-public-fallback__retry"
            style={{
              minHeight: 44,
              marginTop: 18,
              padding: "0 12px",
              border: 0,
              background: "transparent",
              color: "#5F6568",
              fontSize: 12,
              textDecoration: "underline",
              textUnderlineOffset: 4,
              cursor: "pointer",
            }}
          >
            重新载入内容
          </button>
        ) : null}
      </div>
    </section>
  );
}

/**
 * 业务页保留其商品、筛选、表单等真实功能；装修内容围绕固定业务区渲染。
 * PageDocument 是六个公开页面的发布门禁。只有取得有效发布快照时才渲染
 * 装修内容与固定业务区；从未发布、请求失败或文档无效时统一进入安全空状态。
 */
export default function PublishedPageDecoration({
  pageKey,
  pageLabel,
  documentResource,
  children,
  replaceChildren = false,
  publicFallback,
}: PublishedPageDecorationProps) {
  const { pageDocument, status, stale, refresh } = documentResource;

  const hasPublishedDocument = Boolean(
    status === "published" && pageDocument?.puckData,
  );
  const sourceData = hasPublishedDocument
    ? pageDocument?.puckData
    : null;
  const readiness = getPublishedPageReadiness(pageKey, sourceData);
  const structuredData = readiness?.data ?? sourceData;
  const effectiveStatus: PublishedPageDocumentStatus = hasPublishedDocument && readiness && !readiness.ready
    ? "invalid"
    : status;
  const publishedContent = Array.isArray(structuredData?.content)
    ? structuredData.content
    : [];
  const hasRenderablePublishedContent = publishedContent.some(
    isRenderablePublishedBrandBlock,
  );
  const effectiveData = structuredData;
  const content = Array.isArray(effectiveData?.content)
    ? effectiveData.content
    : [];
  const businessRegionIndex = content.findIndex(
    (block: { type?: string }) => block?.type === "业务功能区",
  );
  // 动态业务页的 PageDocument 可以只保留系统业务区：例如旧 catalog
  // 快照中的商品墙被能力矩阵过滤后，真实筛选与商品结果仍应继续渲染。
  // 纯品牌页仍必须拥有至少一个可渲染的品牌区块，不能借此恢复代码兜底。
  const hasRenderablePageContent = Boolean(readiness?.ready) && (replaceChildren
    ? hasRenderablePublishedContent
    : hasRenderablePublishedContent || businessRegionIndex >= 0);
  const beforeContent = businessRegionIndex >= 0
    ? content.slice(0, businessRegionIndex)
    : content;
  const afterContent = businessRegionIndex >= 0
    ? content.slice(businessRegionIndex + 1)
    : [];
  const hasLeadingDecoration = hasPublishedDocument && beforeContent.length > 0;

  if (!pageKey) return <>{children}</>;

  const withDecorationState = (node: ReactNode) => (
    <PageDecorationContext.Provider value={{ active: hasLeadingDecoration && effectiveStatus === "published", pageKey, status: effectiveStatus }}>
      {node}
    </PageDecorationContext.Provider>
  );

  const loading = status === "idle" || status === "loading";
  if (loading) {
    // 动态业务页不能因非关键装修仍在读取而失去固定功能。
    if (!replaceChildren) {
      return withDecorationState(
        <div data-page-document-state="loading" data-production-fallback="business-content">
          {children}
        </div>,
      );
    }
    return withDecorationState(
      <div
        data-page-document-state="loading"
        aria-busy="true"
        aria-live="polite"
        style={{ minHeight: "60vh", display: "grid", placeItems: "center", color: "#5F6568", fontSize: 12 }}
      >
        正在载入{pageLabel || "页面"}
      </div>,
    );
  }

  if (!hasPublishedDocument || !hasRenderablePageContent || !content.length) {
    // Catalog、Contact 等固定业务页不由装修失败遮蔽；纯品牌页不得回退到
    // 另一套硬编码品牌长页，否则会绕开 PageDocument 发布与正式内容门禁。
    if (!replaceChildren) {
      return withDecorationState(
        <div data-page-document-state={effectiveStatus} data-production-fallback="code-content">
          {children}
        </div>,
      );
    }

    return withDecorationState(
      <PublicPageFallback
        pageKey={pageKey}
        pageLabel={pageLabel}
        status={effectiveStatus}
        content={publicFallback}
        onRetry={() => void refresh(true)}
      />,
    );
  }

  const renderDecoration = (sectionContent: PuckBlock[], position: "before" | "after") => {
    if (!sectionContent.length || !effectiveData) return null;
    const data = { ...effectiveData, content: sectionContent };
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
            <PuckDocumentRenderer
              data={data}
              primaryHeading={replaceChildren ? pageLabel : undefined}
            />
          </AntdProvider>
        </Suspense>
      </section>
    );
  };

  if (replaceChildren) {
    const replacement = (
      <>
        {renderDecoration(
          content.filter((block: { type?: string }) => block?.type !== "业务功能区"),
          "before",
        )}
        <StaleDocumentNotice visible={stale} onRefresh={() => void refresh()} />
      </>
    );
    return withDecorationState(
      pageKey === "products"
        ? <div data-page-document-state={hasPublishedDocument ? "published" : effectiveStatus}>{replacement}</div>
        : replacement,
    );
  }

  return withDecorationState(
    <>
      {renderDecoration(beforeContent, "before")}
      {children}
      {renderDecoration(afterContent, "after")}
      <StaleDocumentNotice visible={stale} onRefresh={() => void refresh()} />
    </>,
  );
}
