import { Link } from 'react-router-dom';
import { homeCampaign } from '@/data/homeCampaign';
import BlockEmptyPlaceholder from "@/components/blocks/_shared/BlockEmptyPlaceholder";
import { RESPONSIVE_CANVAS, SINGLE_POSTER_CONTRACT } from '@/page-builder/config/blockContracts';
import type { PageModule } from '@/types/pageModule';

const LG = '#F3F0E9';
const TX = '#28231F';
const MU = 'rgba(40,35,31,0.58)';
const PAD = 'clamp(24px,5vw,80px)';

interface Props { module?: PageModule; editMode?: boolean; }

/**
 * 单海报模块 — 左文右图
 */
export default function SinglePosterSection({ module, editMode }: Props) {
  // 默认值 fallback
  const defaults = homeCampaign.signaturePoster;
  const c = module?.content;
  const l = module?.layoutConfig;
  const s = module?.styleConfig;

  const desktopImg = c?.desktopImage || c?.mobileImage;
  const mobileImg = c?.mobileImage || c?.desktopImage;
  // P1-43：公开态无图不兜底陌生营销图（对齐 HeroSection），避免前台闪出 defaults.image；编辑态已在上方占位
  if (!editMode && !desktopImg) return null;
  const number = c?.number || defaults.number;
  const label = c?.label || defaults.label;
  const title = c?.title || defaults.title;
  const subtitle = c?.subtitle || defaults.subtitle;
  const linkUrl = c?.linkUrl || '';
  const focusX = s?.focusX ?? defaults.focusX;
  const focusY = s?.focusY ?? defaults.focusY;
  const isImageLeft = l?.template === 'leftImageRightText';

  const imageColumn = (
    <div data-editor-field="desktopImage mobileImage" className="homepage-single-poster__media" style={{ order: isImageLeft ? 0 : 1 }}>
      {desktopImg ? (
        <picture className="block w-full h-full">
          <source media={`(max-width:${SINGLE_POSTER_CONTRACT.canvas.mobileBreakpoint}px)`} srcSet={mobileImg} />
          <img
            src={desktopImg}
            alt={title}
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
            style={{ objectPosition: `${focusX}% ${focusY}%` }}
          />
        </picture>
      ) : (
        <BlockEmptyPlaceholder hint="单图海报" spec="请上传海报主图 · 建议 2400×1600（3:2）" height="100%" />
      )}
    </div>
  );

  const copyColumn = (
    <div className="homepage-single-poster__copy" style={{ order: isImageLeft ? 1 : 0 }}>
      <p data-editor-field="number label" className="text-[10px] tracking-[.2em] uppercase mb-2 font-sans" style={{ color: MU }}>{number} / {label}</p>
      <h2 data-editor-field="title" className="text-[clamp(26px,2.8vw,40px)] leading-[1.12] tracking-[.02em] mb-1"
        style={{ fontFamily: '"Cormorant Garamond","Noto Serif SC",serif', color: TX }}>{title}</h2>
      {subtitle ? <p data-editor-field="subtitle" className="text-sm mb-5" style={{ color: MU }}>{subtitle}</p> : null}
      {linkUrl ? (
        <Link data-editor-field="linkUrl" to={linkUrl} className="inline-flex items-center gap-2 text-[10px] tracking-[.14em] uppercase transition-opacity hover:opacity-55 font-sans" style={{ color: TX }}>
          VIEW SERIES <span>→</span>
        </Link>
      ) : null}
    </div>
  );

  return (
    <section
      className="homepage-single-poster overflow-hidden"
      style={{
        padding: 'clamp(64px,7vw,104px) 0',
        background: s?.bgColor || LG,
      }}
    >
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
