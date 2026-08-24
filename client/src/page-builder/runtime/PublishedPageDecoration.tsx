import {
  createContext,
  lazy,
  Suspense,
  useContext,
  type ReactNode,
} from "react";
import { usePagePublishStream } from "@/hooks/usePagePublishStream";
import StaleDocumentNotice from "./StaleDocumentNotice";
import {
  createEditorPageDefault,
  ensureEditorPageStructure,
  isEditorPageKey,
} from "@/page-builder/config/editorPages";
import {
  usePublishedPageDocument,
  type PublishedPageDocumentStatus,
} from "./usePublishedPageDocument";

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

/**
 * 业务页保留其商品、筛选、表单等真实功能；装修内容围绕固定业务区渲染。
 * 只有取得有效发布快照时才渲染装修内容；从未发布、请求失败或文档无效时
 * 保留代码兜底/固定业务区，绝不把编辑器 seed 伪装为正式公开内容。
 */
export default function PublishedPageDecoration({
  pageKey,
  pageLabel,
  children,
  replaceChildren = false,
}: PublishedPageDecorationProps) {
  const { pageDocument, status, stale, refresh } = usePublishedPageDocument(pageKey);

  usePagePublishStream(pageKey, () => {
    void refresh();
  });

  const hasPublishedDocument = Boolean(
    status === "published" && pageDocument?.puckData,
  );
  const sourceData = hasPublishedDocument
    ? pageDocument?.puckData
    : null;
  const structuredData = sourceData && isEditorPageKey(pageKey)
    ? ensureEditorPageStructure(pageKey, sourceData)
    : sourceData;
  const publishedContent = Array.isArray(structuredData?.content)
    ? structuredData.content
    : [];
  const hasRenderablePublishedContent = publishedContent.some(
    (block: { type?: string; props?: Record<string, unknown> }) => {
      if (!block?.type || block.props?.isVisible === false || block.type === "业务功能区") {
        return false;
      }
      if (block.type !== "产品展示行") return true;
      const productIds = Array.isArray(block.props?.productIds)
        ? block.props.productIds
        : [];
      const productCodes = Array.isArray(block.props?.productCodes)
        ? block.props.productCodes
        : [];
      return productIds.length > 0 || productCodes.length > 0;
    },
  );
  const fallbackData = pageKey === "products" && !hasRenderablePublishedContent
    ? ensureEditorPageStructure("products", createEditorPageDefault("products"))
    : null;
  const effectiveData = fallbackData ?? structuredData;
  const content = Array.isArray(effectiveData?.content)
    ? effectiveData.content
    : [];
  const hasVisibleHeroTitle = content.some(
    (block: { type?: string; props?: Record<string, unknown> }) =>
      block.type === "首屏主视觉" &&
      block.props?.isVisible !== false &&
      typeof block.props?.title === "string" &&
      block.props.title.trim().length > 0,
  );
  const businessRegionIndex = content.findIndex(
    (block: { type?: string }) => block?.type === "业务功能区",
  );
  const beforeContent = businessRegionIndex >= 0
    ? content.slice(0, businessRegionIndex)
    : content;
  const afterContent = businessRegionIndex >= 0
    ? content.slice(businessRegionIndex + 1)
    : [];
  const hasLeadingDecoration = hasPublishedDocument && beforeContent.length > 0;

  if (!pageKey) return <>{children}</>;

  const withDecorationState = (node: ReactNode) => (
    <PageDecorationContext.Provider value={{ active: hasLeadingDecoration, pageKey, status }}>
      {node}
    </PageDecorationContext.Provider>
  );

  const loading = status === "idle" || status === "loading";
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
            <PuckDocumentRenderer data={data} />
          </AntdProvider>
        </Suspense>
      </section>
    );
  };

  if (!content.length) return withDecorationState(children);

  if (replaceChildren) {
    const replacement = (
      <>
        {pageLabel && fallbackData && !hasVisibleHeroTitle ? (
          <h1 className="sr-only">{pageLabel}</h1>
        ) : null}
        {renderDecoration(
          content.filter((block: { type?: string }) => block?.type !== "业务功能区"),
          "before",
        )}
        <StaleDocumentNotice visible={stale} onRefresh={() => void refresh()} />
      </>
    );
    return withDecorationState(
      pageKey === "products"
        ? <div data-page-document-state={hasPublishedDocument ? "published" : status}>{replacement}</div>
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
