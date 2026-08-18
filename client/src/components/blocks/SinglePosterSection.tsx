import { Link } from 'react-router-dom';
import BlockEmptyPlaceholder from "@/components/blocks/_shared/BlockEmptyPlaceholder";
import { RESPONSIVE_CANVAS, SINGLE_POSTER_CONTRACT } from '@/page-builder/config/blockContracts';
import { IMAGE_SPECS } from '@/page-builder/config/imageSpecs';
import { resolveLinkTargetUrl } from '@/page-builder/utils/linkTarget';
import { DesignSystemStyles } from '@/page-builder/designSystem/sectionShell';
import { FONT_DISPLAY, FONT_SANS } from '@/page-builder/designSystem/tokens';
import {
  CONTENT_TEMPLATE_LAYOUTS,
  ContentTemplateLayoutStyles,
  templateLayoutVars,
} from '@/page-builder/layout/contentTemplateLayouts';
import type { PageModule } from '@/types/pageModule';

const LG = '#F3F0E9';
const TX = '#28231F';
const MU = 'rgba(40,35,31,0.58)';

interface Props { module?: PageModule; editMode?: boolean; }

/** 单图文 — 受控镜像的 38/62 编辑式分栏，移动端固定图上文下。 */
export default function SinglePosterSection({ module, editMode }: Props) {
  const c = module?.content as (PageModule['content'] & Record<string, any>) | undefined;
  const l = module?.layoutConfig;
  const s = module?.styleConfig as (PageModule['styleConfig'] & Record<string, any>) | undefined;

  const desktopImg = c?.desktopImage || c?.mobileImage;
  const mobileImg = c?.mobileImage || c?.desktopImage;
  // 公开态无图不兜底陌生营销图,静默隐藏;编辑态显示占位
  if (!editMode && !desktopImg) return null;
  // 文案不再回退营销默认值:未填写即不渲染对应节点
  const number = typeof c?.number === "string" ? c.number : "";
  const label = typeof c?.label === "string" ? c.label : "";
  const title = typeof c?.title === "string" ? c.title : "";
  const subtitle = typeof c?.subtitle === "string" ? c.subtitle : "";
  const actionText = typeof c?.actionText === "string" ? c.actionText : "";
  const targetUrl = resolveLinkTargetUrl({
    targetType: c?.targetType,
    productId: c?.productId,
    linkUrl: c?.linkUrl,
  });
  const isImageLeft = l?.template === 'leftImageRightText';
  // 双端独立焦点;旧数据仅有共享 focusX/Y 时双端回退同值
  const desktopFocusX = s?.desktopFocusX ?? s?.focusX ?? 50;
  const desktopFocusY = s?.desktopFocusY ?? s?.focusY ?? 50;
  const mobileFocusX = s?.mobileFocusX ?? s?.focusX ?? 50;
  const mobileFocusY = s?.mobileFocusY ?? s?.focusY ?? 50;

  const imageColumn = (
    <div data-editor-field="desktopImage mobileImage" className="hc-content-template__media hc-phase1-single__media">
      {desktopImg ? (
        <picture className="block w-full h-full">
          <source media={`(max-width:${SINGLE_POSTER_CONTRACT.canvas.mobileBreakpoint}px)`} srcSet={mobileImg} />
          <img
            src={desktopImg}
            alt={c?.altText || title}
            className="homepage-single-poster__image w-full h-full object-cover"
            loading="lazy"
            decoding="async"
            width={1600}
            height={2000}
          />
        </picture>
      ) : (
        <BlockEmptyPlaceholder hint={CONTENT_TEMPLATE_LAYOUTS.singlePoster.displayName} spec={`请上传海报主图 · ${IMAGE_SPECS.singlePoster.image.label}`} height="100%" />
      )}
    </div>
  );

  const copyColumn = (
    <div className="hc-content-template__copy hc-phase1-single__copy">
      {(number || label) ? (
        <p data-editor-field="number label" className="hc-content-template__eyebrow" style={{ color: MU, fontFamily: `var(--hc-font-sans, ${FONT_SANS})` }}>{[number, label].filter(Boolean).join(" / ")}</p>
      ) : null}
      {title ? (
        <h2 data-editor-field="title" className="hc-content-template__title"
          style={{ fontFamily: `var(--hc-font-display, ${FONT_DISPLAY})`, fontSize: 'var(--hc-type-h2, clamp(26px,2.8vw,40px))', color: TX }}>{title}</h2>
      ) : null}
      {subtitle ? <p data-editor-field="subtitle" className="hc-content-template__body" style={{ color: MU }}>{subtitle}</p> : null}
      {actionText && targetUrl ? (
        editMode ? (
          <span data-editor-field="actionText targetType productId linkUrl" className="hc-content-template__action mt-5" style={{ color: TX, fontFamily: `var(--hc-font-sans, ${FONT_SANS})` }}>
            {actionText} <span>→</span>
          </span>
        ) : (
          <Link data-editor-field="actionText targetType productId linkUrl" to={targetUrl} className="hc-content-template__action mt-5 transition-opacity hover:opacity-55" style={{ color: TX, fontFamily: `var(--hc-font-sans, ${FONT_SANS})` }}>
            {actionText} <span>→</span>
          </Link>
        )
      ) : null}
    </div>
  );

  return (
    <section
      className="hc-content-template hc-phase1-single-section homepage-single-poster hc-section overflow-hidden"
      data-content-template={CONTENT_TEMPLATE_LAYOUTS.singlePoster.key}
      data-visual-role={CONTENT_TEMPLATE_LAYOUTS.singlePoster.visualRole}
      data-height-mode-desktop={CONTENT_TEMPLATE_LAYOUTS.singlePoster.heightModeByViewport.desktop}
      data-height-mode-tablet={CONTENT_TEMPLATE_LAYOUTS.singlePoster.heightModeByViewport.tablet}
      data-height-mode-mobile={CONTENT_TEMPLATE_LAYOUTS.singlePoster.heightModeByViewport.mobile}
      data-mobile-order={CONTENT_TEMPLATE_LAYOUTS.singlePoster.mobile.order.join(",")}
      data-density="brand"
      data-spacing="normal"
      data-flow={CONTENT_TEMPLATE_LAYOUTS.singlePoster.flow}
      style={{
        background: s?.bgColor || LG,
        '--sp-focus-d': `${desktopFocusX}% ${desktopFocusY}%`,
        '--sp-focus-m': `${mobileFocusX}% ${mobileFocusY}%`,
        ...templateLayoutVars(CONTENT_TEMPLATE_LAYOUTS.singlePoster),
      } as React.CSSProperties}
    >
      <DesignSystemStyles />
      <ContentTemplateLayoutStyles />
      <style>{`
        .homepage-single-poster__image { object-position: var(--sp-focus-d); }
        @media (max-width: ${SINGLE_POSTER_CONTRACT.canvas.mobileBreakpoint}px) {
          .homepage-single-poster__image { object-position: var(--sp-focus-m); }
        }
      `}</style>
      <div className="hc-content-template__container hc-phase1-single" data-mirror={isImageLeft}>
        {imageColumn}
        {copyColumn}
      </div>
    </section>
  );
}
