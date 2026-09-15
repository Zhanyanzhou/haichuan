import {
  lazy,
  Suspense,
  useEffect,
} from "react";
import { useOutletContext } from "react-router-dom";
import { trackPageView } from "@/hooks/useAnalytics";
import { getEditorPage } from "@/page-builder/config/editorPages";
import {
  usePublishedPageDocument,
  type PublishedPageDocumentResource,
} from "@/page-builder/runtime/usePublishedPageDocument";
import StaleDocumentNotice from "@/page-builder/runtime/StaleDocumentNotice";
import { PublicPageFallback } from "@/page-builder/runtime/PublishedPageDecoration";
import { getPublishedPageReadiness } from "@/page-builder/runtime/publishedPageReadiness";
import type { PuckDocument } from "@/page-builder/runtime/PuckDocumentRenderer";

const LG = "#F4F5F5";
const PuckDocumentRenderer = lazy(() => import("@/page-builder/runtime/PuckDocumentRenderer"));

type HomeHeroPreview = {
  image: string;
  mobileImage: string;
  title: string;
  subtitle: string;
  eyebrow: string;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
/**
 * 公开首页在完整 Renderer 分块到达前只读取已发布文档的首个 Hero。
 * 这不是第二套内容：同一份 PageDocument 仍是唯一输入，只是先稳定呈现
 * 首屏的图片、标题和空间，避免访客看到技术性的全屏加载页。
 */
function getHomeHeroPreview(data?: PuckDocument | null): HomeHeroPreview {
  const blocks = Array.isArray(data?.content) ? data.content : [];
  const hero = blocks.find((block) => block?.type === "首屏主视觉" && block.props?.isVisible !== false);
  // Puck 的已发布首屏字段直接位于 block.props；此处必须与公开 Renderer、
  // 发布校验和初始模板保持同一数据结构，不能再造嵌套 content 副本。
  const content = hero?.props && typeof hero.props === "object" && !Array.isArray(hero.props)
    ? hero.props as Record<string, unknown>
    : {};
  const desktopImage = text(content?.desktopImage);
  const mobileImage = text(content?.mobileImage);
  return {
    image: desktopImage || mobileImage,
    mobileImage: mobileImage || desktopImage,
    title: text(content?.title),
    subtitle: text(content?.subtitle),
    eyebrow: text(content?.eyebrow),
  };
}
export function HomeFirstFold({ data }: { data?: PuckDocument | null }) {
  const hero = getHomeHeroPreview(data);
  const hasCopy = Boolean(hero.eyebrow || hero.title || hero.subtitle);

  return (
    <section
      aria-busy="true"
      aria-label="首页首屏"
      data-page-document-state="loading"
      style={{
        position: "relative",
        isolation: "isolate",
        minHeight: "max(620px, 100svh)",
        overflow: "hidden",
        background: hero.image ? "#181A1B" : LG,
        color: hero.image ? "#FFFFFF" : "#181A1B",
      }}
    >
      {hero.image ? (
        <picture>
          {hero.mobileImage ? <source media="(max-width: 767px)" srcSet={hero.mobileImage} /> : null}
          <img
            src={hero.image}
            alt=""
            aria-hidden="true"
            fetchPriority="high"
            decoding="async"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              zIndex: -2,
            }}
          />
        </picture>
      ) : null}
      {hero.image && hasCopy ? (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: -1,
            background: "linear-gradient(90deg, rgba(16,18,19,.58) 0%, rgba(16,18,19,.24) 42%, rgba(16,18,19,0) 72%)",
          }}
        />
      ) : null}
      {hasCopy ? (
        <div
          style={{
            display: "grid",
            alignContent: "end",
            minHeight: "max(620px, 100svh)",
            width: "min(100%, 1440px)",
            margin: "0 auto",
            padding: "clamp(128px, 16vw, 236px) clamp(24px, 7vw, 136px)",
          }}
        >
          <div style={{ maxWidth: 620 }}>
            {hero.eyebrow ? (
              <p style={{ margin: "0 0 18px", fontSize: 11, letterSpacing: "0.18em", lineHeight: 1.4 }}>
                {hero.eyebrow}
              </p>
            ) : null}
            {hero.title ? (
              <h1 style={{ margin: 0, fontFamily: 'var(--hc-font-display, "Noto Serif SC", serif)', fontSize: "clamp(42px, 5.2vw, 76px)", fontWeight: 400, lineHeight: 1.14 }}>
                {hero.title}
              </h1>
            ) : null}
            {hero.subtitle ? (
              <p style={{ margin: "20px 0 0", fontFamily: 'var(--hc-font-display, "Noto Serif SC", serif)', fontSize: "clamp(17px, 1.45vw, 22px)", fontStyle: "italic", lineHeight: 1.7 }}>
                {hero.subtitle}
              </p>
            ) : null}
          </div>
        </div>
      ) : <span className="sr-only">首页内容正在准备</span>}
    </section>
  );
}
export default function Home() {
  const homeFallback = getEditorPage("home").publicFallback;
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
    return <HomeFirstFold />;
  }

  if (documentStatus === "error" || documentStatus === "invalid") {
    const fallback = homeFallback;
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
        locale="zh-CN"
      />
    );
  }

  if (documentStatus === "unpublished") {
    return (
      <PublicPageFallback
        pageKey="home"
        pageLabel="店铺首页"
        status="unpublished"
        content={homeFallback}
        locale="zh-CN"
      />
    );
  }

  if (!pageDocument) {
    return (
      <PublicPageFallback
        pageKey="home"
        pageLabel="店铺首页"
        status="invalid"
        content={homeFallback}
        locale="zh-CN"
      />
    );
  }

  const readiness = getPublishedPageReadiness("home", pageDocument.puckData);
  if (!readiness?.ready) {
    const fallback = homeFallback;
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
        locale="zh-CN"
      />
    );
  }

  const hasVisibleHeroTitle = readiness.data.content?.some((block) => {
    if (
      block.type !== "首屏主视觉"
      || block.props?.isVisible === false
      || typeof block.props?.title !== "string"
      || block.props.title.trim().length === 0
    ) return false;
    const overrides = block.props.__instanceOverrides;
    if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) return true;
    const record = overrides as Record<string, unknown>;
    const nodes = record.nodes && typeof record.nodes === "object" && !Array.isArray(record.nodes)
      ? record.nodes as Record<string, unknown>
      : {};
    const textRoles = record.textRoles && typeof record.textRoles === "object" && !Array.isArray(record.textRoles)
      ? record.textRoles as Record<string, unknown>
      : {};
    const titleNode = (record.version === 2 ? nodes.title : textRoles.title) as Record<string, unknown> | undefined;
    return titleNode?.enabled !== false;
  });

  return (
    <div data-page-document-state="published" style={{ background: LG }}>
      {!hasVisibleHeroTitle ? <h1 className="sr-only">海川珠宝</h1> : null}
      <Suspense fallback={<HomeFirstFold data={readiness.data as PuckDocument} />}>
        <PuckDocumentRenderer
          data={readiness.data as PuckDocument}
          surface="home"
          heroHeadingLevel={hasVisibleHeroTitle ? 1 : 2}
        />
      </Suspense>
      <StaleDocumentNotice
        visible={documentStale}
        onRefresh={() => void refreshDocument(false)}
        locale="zh-CN"
      />
    </div>
  );
}
