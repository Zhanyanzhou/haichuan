import { Link } from 'react-router-dom';
import BlockEmptyPlaceholder from "@/components/blocks/_shared/BlockEmptyPlaceholder";
import { SINGLE_POSTER_CONTRACT, resolveContractAspectRatio } from '@/page-builder/config/blockContracts';
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

/** 白盒画册冷调(2026-08-19):纯白底、近黑字、冷灰;金色废除。 */
const BG = '#FFFFFF';
const TX = '#181A1B';
const MU = '#6E7477';

interface Props { module?: PageModule; editMode?: boolean; }

/** 单图文 · 画廊海报式(P1) — 图 ≥75% 主导偏右,签名束贴左下;移动端 4:5 叠字同构。 */
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
    productCode: c?.productCode,
    productId: c?.productId,
    linkUrl: c?.linkUrl,
  });
  const isImageLeft = l?.template === 'leftImageRightText';
  // 双端独立焦点;旧数据仅有共享 focusX/Y 时双端回退同值
  const desktopFocusX = s?.desktopFocusX ?? s?.focusX ?? 50;
  const desktopFocusY = s?.desktopFocusY ?? s?.focusY ?? 50;
  const mobileFocusX = s?.mobileFocusX ?? s?.focusX ?? 50;
  const mobileFocusY = s?.mobileFocusY ?? s?.focusY ?? 50;
  // 比例选项(契约派生):桌面走 desktopImage 角色(平板沿用桌面档),手机走 mobileImage 角色
  const posterRatio = {
    desktop: resolveContractAspectRatio("singlePoster", "desktopImage", c?.aspectRatio, "desktop"),
    mobile: resolveContractAspectRatio("singlePoster", "mobileImage", c?.aspectRatio, "mobile"),
  };
  const [posterRatioW, posterRatioH] = posterRatio.desktop
    .split("/")
    .map((part) => Number(part.trim()));

  const imageColumn = (
    <div
      data-editor-field="desktopImage mobileImage"
      data-content-role-desktop="desktopImage"
      data-content-role-mobile="mobileImage"
      className="hc-content-template__media hc-phase1-single__media"
    >
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
            height={Math.round((1600 * posterRatioH) / posterRatioW)}
          />
        </picture>
      ) : (
        <BlockEmptyPlaceholder hint={CONTENT_TEMPLATE_LAYOUTS.singlePoster.displayName} spec={`请上传海报主图 · ${IMAGE_SPECS.singlePoster.image.label}`} height="100%" />
      )}
    </div>
  );

  const copyColumn = (
    <div className="hc-content-template__copy hc-phase1-single__copy" data-content-role="copy">
      {(number || label) ? (
        <div data-editor-field="number label" style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 16 }}>
          {number ? (
            <span style={{ fontFamily: `var(--hc-font-display, ${FONT_DISPLAY})`, fontSize: "clamp(13px, 0.75vw, 19px)", color: TX, letterSpacing: "0.08em" }}>{number}</span>
          ) : null}
          {label ? (
            <span className="hc-content-template__eyebrow" style={{ color: MU, fontFamily: `var(--hc-font-sans, ${FONT_SANS})`, margin: 0 }}>{label}</span>
          ) : null}
        </div>
      ) : null}
      {title ? (
        <h2 data-editor-field="title" className="hc-content-template__title"
          style={{ fontFamily: `var(--hc-font-display, ${FONT_DISPLAY})`, fontSize: 'var(--hc-type-display, clamp(28px,2vw,56px))', color: TX }}>{title}</h2>
      ) : null}
      {subtitle ? <p data-editor-field="subtitle" className="hc-content-template__body" style={{ color: MU, marginTop: 14 }}>{subtitle}</p> : null}
      {actionText && targetUrl ? (
        editMode ? (
          <span data-content-role="action" data-editor-field="actionText targetType productId linkUrl" className="hc-content-template__action mt-5" style={{ color: TX, fontFamily: `var(--hc-font-sans, ${FONT_SANS})` }}>
            {actionText} <span>→</span>
          </span>
        ) : (
          <Link data-content-role="action" data-editor-field="actionText targetType productId linkUrl" to={targetUrl} className="hc-content-template__action mt-5 transition-opacity hover:opacity-55" style={{ color: TX, fontFamily: `var(--hc-font-sans, ${FONT_SANS})` }}>
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
      data-height-mode-mobile={CONTENT_TEMPLATE_LAYOUTS.singlePoster.heightModeByViewport.mobile}
      data-mobile-order={CONTENT_TEMPLATE_LAYOUTS.singlePoster.mobile.order.join(",")}
      data-density="brand"
      data-spacing="normal"
      data-flow={CONTENT_TEMPLATE_LAYOUTS.singlePoster.flow}
      style={{
        background: s?.bgColor || BG,
        '--sp-focus-d': `${desktopFocusX}% ${desktopFocusY}%`,
        '--sp-focus-m': `${mobileFocusX}% ${mobileFocusY}%`,
        ...templateLayoutVars(CONTENT_TEMPLATE_LAYOUTS.singlePoster, { mediaRatio: posterRatio }),
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
