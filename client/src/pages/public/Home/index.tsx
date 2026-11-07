import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
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
import type { PuckBlock, PuckDocument } from "@/page-builder/runtime/PuckDocumentRenderer";
import RouteLoading from "@/components/common/RouteLoading";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { loadPuckDocumentRenderer } from "@/page-builder/runtime/loadPublicPageRenderer";
import { scheduleChineseDisplayFonts } from "@/styles/loadChineseDisplayFonts";
import "./firstFold.css";
import { getHomeHeroPreview } from "@/page-builder/runtime/homeHeroPreview";
import {
  buildResponsiveUploadsDerivedUrl,
  buildResponsiveUploadsSrcSet,
  type PublicImageSourceFacts,
} from "@/utils/responsiveUploadsImage";
import { coverSizesFromViewportBox } from "@/page-builder/config/imageDeliveryGeometry";
import { CONTENT_TEMPLATE_LAYOUTS, ContentTemplateLayoutStyles, templateLayoutVars } from "@/page-builder/layout/contentTemplateLayouts";
import { FONT_DISPLAY, FONT_SANS } from "@/page-builder/designSystem/tokens";
import { resolveStorefrontLinkTargetUrl } from "@/page-builder/utils/linkTarget";
import {
  PublicImageFactsProvider,
  readPublicImageFacts,
  usePublicImageFact,
} from "@/page-builder/runtime/publicImageFacts";

const LG = "#F4F5F5";
const PuckDocumentRenderer = lazy(loadPuckDocumentRenderer);
const FIRST_IMAGE_WAIT_MS = 1500;

function heroDelivery(source: string, facts: PublicImageSourceFacts | null) {
  const srcSet = facts ? buildResponsiveUploadsSrcSet(source, facts) : undefined;
  const sizes = facts && !facts.animated
    ? coverSizesFromViewportBox({
      width: "100vw",
      height: "max(620px, 100svh)",
      sourceWidth: facts.displayWidth,
      sourceHeight: facts.displayHeight,
      objectFit: "cover",
    })
    : undefined;
  return {
    src: srcSet ? buildResponsiveUploadsDerivedUrl(source, 1680) ?? source : source,
    srcSet,
    sizes,
  };
}

/**
 * Renderer 尚未到达时，用当前发布文档先发现首图。等待态只占位，
 * 正式首屏的图文和操作由同一个 Renderer 呈现。
 */
function HomeLoadingStatus({ local = false }: { local?: boolean }) {
  return (
    <RouteLoading
      data-home-loading-status="true"
      scope="region"
      surface="public"
      label={local ? "主视觉正在准备" : "首页内容正在准备"}
    />
  );
}

export function HomeFirstFold({ data, stage }: { data?: PuckDocument | null; stage?: PuckBlock }) {
  const [device, setDevice] = useState<"desktop" | "mobile">(() => (
    typeof window !== "undefined" && window.innerWidth < 768 ? "mobile" : "desktop"
  ));
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setDevice(media.matches ? "mobile" : "desktop");
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const hero = getHomeHeroPreview(stage ? { ...data, content: [stage] } : data, device);
  const desktopFacts = usePublicImageFact(hero.image);
  const mobileFacts = usePublicImageFact(hero.mobileImage);
  const desktop = heroDelivery(hero.image, desktopFacts);
  const mobile = heroDelivery(hero.mobileImage, mobileFacts);
  const legacy = stage?.type === "首屏主视觉" ? stage.props : undefined;
  const actionText = typeof legacy?.actionText === "string" && resolveStorefrontLinkTargetUrl({
    targetType: typeof legacy.targetType === "string" ? legacy.targetType : undefined,
    productCode: typeof legacy.productCode === "string" ? legacy.productCode : undefined,
    productId: Number(legacy.productId) || undefined,
    categorySlug: legacy.categorySlug,
    linkUrl: typeof legacy.linkUrl === "string" ? legacy.linkUrl : undefined,
  }) ? legacy.actionText : "";
  const legacyLayout = legacy ? CONTENT_TEMPLATE_LAYOUTS.hero : undefined;
  return (
    <section
      aria-busy="true"
      aria-label="首页首屏"
      data-page-document-state="loading"
      className={legacyLayout
        ? "home-primary-stage-loading home-legacy-stage-loading hc-content-template hc-phase1-hero"
        : stage ? "home-first-fold-loading home-primary-stage-loading" : "home-first-fold-loading"}
      style={legacyLayout ? templateLayoutVars(legacyLayout) : undefined}
    >
      {legacyLayout ? (
        <>
          <ContentTemplateLayoutStyles />
          {/* 用相同画幅与字行占位，兼容分块到达前不公开文案或行动。 */}
          <div className="hc-phase1-hero__media" aria-hidden="true" />
          {hero.title || hero.subtitle || actionText ? (
            <div className="hc-phase1-hero__copy-band home-legacy-stage-loading__copy" aria-hidden="true">
              <div className="hc-content-template__copy hc-phase1-hero__copy">
                {hero.eyebrow ? <p className="hc-content-template__eyebrow">{hero.eyebrow}</p> : null}
                {hero.title ? <div className="hc-content-template__title whitespace-pre-line" style={{ fontFamily: `var(--hc-font-display, ${FONT_DISPLAY})`, fontSize: "var(--hc-hero-title-size, clamp(42px, 4.4vw, 76px))" }}>{hero.title}</div> : null}
                {hero.subtitle ? <p className="hc-content-template__body" style={{ fontFamily: `var(--hc-font-display, ${FONT_DISPLAY})`, fontStyle: "italic" }}>{hero.subtitle}</p> : null}
                {actionText ? <span className="hc-content-template__action" style={{ fontFamily: `var(--hc-font-sans, ${FONT_SANS})` }}>{actionText} <span>→</span></span> : null}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
      {desktop.src ? (
        <picture hidden>
          {mobile.src ? (
            <source media="(max-width: 767px)" srcSet={mobile.srcSet ?? mobile.src} sizes={mobile.sizes} />
          ) : null}
          <img
            src={desktop.src}
            srcSet={desktop.srcSet}
            sizes={desktop.sizes}
            alt=""
            {...{ fetchpriority: "high" }}
          />
        </picture>
      ) : null}
      <HomeLoadingStatus local={Boolean(stage)} />
    </section>
  );
}

function HomePrimaryStageReveal({ children }: { children: ReactNode }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    // 只检查正式 Renderer 选出的首图，无图首屏和视频封面直接交给 Renderer。
    const image = contentRef.current?.querySelector<HTMLImageElement>('img[fetchpriority="high"]');
    if (!image) {
      setReady(true);
      return;
    }

    let active = true;
    const reveal = () => {
      window.clearTimeout(timeout);
      if (active) setReady(true);
    };
    const timeout = window.setTimeout(reveal, FIRST_IMAGE_WAIT_MS);
    // 解码失败时放行，图片的错误占位与重试仍由 Renderer 处理。
    void image.decode().then(reveal, reveal);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (ready) scheduleChineseDisplayFonts();
  }, [ready]);

  return (
    <div className="home-primary-stage" data-ready={ready}>
      <div ref={contentRef} className="home-primary-stage__content" aria-hidden={!ready || undefined}>
        {children}
      </div>
      {!ready ? (
        <div className="home-primary-stage-loading home-primary-stage-loading--overlay">
          <HomeLoadingStatus local />
        </div>
      ) : null}
    </div>
  );
}

function HomeWithoutPrimaryStage() {
  useEffect(scheduleChineseDisplayFonts, []);
  return null;
}

function HomeFallback(props: ComponentProps<typeof PublicPageFallback>) {
  useEffect(scheduleChineseDisplayFonts, []);
  return <PublicPageFallback {...props} />;
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
      <HomeFallback
        pageKey="home"
        pageLabel="店铺首页"
        status={documentStatus}
        content={fallback ? {
          ...fallback,
          title: isReadFailure ? "首页暂不可用" : "首页正在完善",
          description: isReadFailure
            ? "首页内容暂时无法载入。您可以重新载入，或先进入选款中心。"
            : "首页现有内容需要重新审核后才能公开。您可以先进入选款中心，或了解珠宝定制服务。",
        } : undefined}
        onRetry={isReadFailure ? () => void refreshDocument(true) : undefined}
        locale="zh-CN"
      />
    );
  }

  if (documentStatus === "unpublished") {
    return (
      <HomeFallback
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
      <HomeFallback
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
      <HomeFallback
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

  return (
    <PublicImageFactsProvider facts={readPublicImageFacts(pageDocument)}>
    <div data-page-document-state="published" style={{ background: LG }}>
      <ErrorBoundary fallback={(
        <HomeFallback
          pageKey="home"
          pageLabel="首页暂不可用"
          status="error"
          content={homeFallback ? {
            ...homeFallback,
            title: "首页暂不可用",
            description: "首页暂时无法显示。您可以重新载入，或先进入选款中心。",
          } : undefined}
          onRetry={() => window.location.reload()}
          locale="zh-CN"
        />
      )}>
        <Suspense fallback={<HomeFirstFold data={readiness.data as PuckDocument} />}>
          <PuckDocumentRenderer
            data={readiness.data as PuckDocument}
            surface="home"
            pageKey="home"
            primaryHeading="海川珠宝"
            renderPrimaryStage={(stage, block) => stage ? (
              <Suspense fallback={<HomeFirstFold data={readiness.data as PuckDocument} stage={block} />}>
                <HomePrimaryStageReveal>{stage}</HomePrimaryStageReveal>
              </Suspense>
            ) : <HomeWithoutPrimaryStage />}
          />
        </Suspense>
      </ErrorBoundary>
      <StaleDocumentNotice
        visible={documentStale}
        onRefresh={() => void refreshDocument(false)}
        locale="zh-CN"
      />
    </div>
    </PublicImageFactsProvider>
  );
}
