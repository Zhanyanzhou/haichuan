import { Link } from 'react-router-dom';
import BlockEmptyPlaceholder from "@/components/blocks/_shared/BlockEmptyPlaceholder";
import { RESPONSIVE_CANVAS, SINGLE_POSTER_CONTRACT } from '@/page-builder/config/blockContracts';
import { isSafeInternalPath } from '@/page-builder/utils/linkTarget';
import { DesignSystemStyles } from '@/page-builder/designSystem/sectionShell';
import { FONT_DISPLAY, FONT_SANS } from '@/page-builder/designSystem/tokens';
import type { PageModule } from '@/types/pageModule';

const LG = '#F3F0E9';
const TX = '#28231F';
const MU = 'rgba(40,35,31,0.58)';
const PAD = 'clamp(24px,5vw,80px)';

interface Props { module?: PageModule; editMode?: boolean; }

/**
 * 品牌故事(单图海报)— Editorial Split 母版
 * 桌面 38/62 编辑式分栏(可镜像),Mobile 图上文下。
 * 支持双端独立素材与双端独立焦点(旧数据共享 focusX/Y 自动回退)。
 */
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
  const actionText = c?.actionText || "查看系列";
  const linkUrl = isSafeInternalPath(c?.linkUrl) ? c?.linkUrl : '';
  const isImageLeft = l?.template === 'leftImageRightText';
  // 双端独立焦点;旧数据仅有共享 focusX/Y 时双端回退同值
  const desktopFocusX = s?.desktopFocusX ?? s?.focusX ?? 50;
  const desktopFocusY = s?.desktopFocusY ?? s?.focusY ?? 50;
  const mobileFocusX = s?.mobileFocusX ?? s?.focusX ?? 50;
  const mobileFocusY = s?.mobileFocusY ?? s?.focusY ?? 50;

  const imageColumn = (
    <div data-editor-field="desktopImage mobileImage" className="homepage-single-poster__media" style={{ order: isImageLeft ? 0 : 1 }}>
      {desktopImg ? (
        <picture className="block w-full h-full">
          <source media={`(max-width:${SINGLE_POSTER_CONTRACT.canvas.mobileBreakpoint}px)`} srcSet={mobileImg} />
          <img
            src={desktopImg}
            alt={title}
            className="homepage-single-poster__image w-full h-full object-cover"
            loading="lazy"
            decoding="async"
            width={1600}
            height={2000}
          />
        </picture>
      ) : (
        <BlockEmptyPlaceholder hint="品牌故事" spec="请上传海报主图 · 建议 1600×2000（4:5）" height="100%" />
      )}
    </div>
  );

  const copyColumn = (
    <div className="homepage-single-poster__copy" style={{ order: isImageLeft ? 1 : 0 }}>
      {(number || label) ? (
        <p data-editor-field="number label" className="text-[10px] tracking-[.2em] uppercase mb-2" style={{ color: MU, fontFamily: `var(--hc-font-sans, ${FONT_SANS})` }}>{number} / {label}</p>
      ) : null}
      {title ? (
        <h2 data-editor-field="title" className="leading-[1.12] tracking-[.02em] mb-1"
          style={{ fontFamily: `var(--hc-font-display, ${FONT_DISPLAY})`, fontSize: 'var(--hc-type-h2, clamp(26px,2.8vw,40px))', color: TX }}>{title}</h2>
      ) : null}
      {subtitle ? <p data-editor-field="subtitle" className="mb-5" style={{ color: MU, fontSize: 'var(--hc-type-body, 15px)', lineHeight: 1.9 }}>{subtitle}</p> : null}
      {linkUrl ? (
        <Link data-editor-field="linkUrl actionText" to={linkUrl} className="inline-flex items-center gap-2 text-[10px] tracking-[.14em] uppercase transition-opacity hover:opacity-55" style={{ color: TX, fontFamily: `var(--hc-font-sans, ${FONT_SANS})` }}>
          {actionText} <span>→</span>
        </Link>
      ) : null}
    </div>
  );

  return (
    <section
      className="homepage-single-poster hc-section overflow-hidden"
      data-density="brand"
      data-flow="flow"
      style={{
        padding: 'clamp(64px,7vw,104px) 0',
        background: s?.bgColor || LG,
        '--sp-focus-d': `${desktopFocusX}% ${desktopFocusY}%`,
        '--sp-focus-m': `${mobileFocusX}% ${mobileFocusY}%`,
      } as React.CSSProperties}
    >
      <DesignSystemStyles />
      <style>{`
        .homepage-single-poster__inner {
          display: grid;
          grid-template-columns: ${isImageLeft ? SINGLE_POSTER_CONTRACT.canvas.desktopImageLeftColumns : SINGLE_POSTER_CONTRACT.canvas.desktopColumns};
          align-items: stretch;
          gap: clamp(28px,4vw,56px);
          max-width: ${SINGLE_POSTER_CONTRACT.canvas.maxWidth}px;
          margin: 0 auto;
          padding: 0 ${PAD};
        }
        .homepage-single-poster__copy {
          min-width: 0;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          justify-content: center;
        }
        .homepage-single-poster__media {
          min-width: 0;
          overflow: hidden;
          aspect-ratio: ${SINGLE_POSTER_CONTRACT.canvas.desktopMediaAspectRatio};
          background: #F7F8FB;
        }
        .homepage-single-poster__image { object-position: var(--sp-focus-d); }
        @media ${RESPONSIVE_CANVAS.tabletMediaQuery} {
          .homepage-single-poster { padding-block: 56px !important; }
          .homepage-single-poster__inner {
            grid-template-columns: ${isImageLeft ? SINGLE_POSTER_CONTRACT.canvas.tabletImageLeftColumns : SINGLE_POSTER_CONTRACT.canvas.tabletColumns};
            gap: 32px;
            padding-inline: 24px;
          }
        }
        @media (max-width: ${SINGLE_POSTER_CONTRACT.canvas.mobileBreakpoint}px) {
          .homepage-single-poster { padding-block: 40px !important; }
          .homepage-single-poster__inner { grid-template-columns: minmax(0,1fr); gap: 28px; padding-inline: 20px; }
          .homepage-single-poster__media { order: 0 !important; aspect-ratio: ${SINGLE_POSTER_CONTRACT.canvas.mobileMediaAspectRatio}; }
          .homepage-single-poster__image { object-position: var(--sp-focus-m); }
          .homepage-single-poster__copy { order: 1 !important; padding-inline: 4px; }
        }
      `}</style>
      <div className="homepage-single-poster__inner">
        {copyColumn}
        {imageColumn}
      </div>
    </section>
  );
}
