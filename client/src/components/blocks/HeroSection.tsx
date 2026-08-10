import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import { homeCampaign } from '@/data/homeCampaign';
import type { PageModule } from '@/types/pageModule';

const LT = '#F1ECE3';

interface Props { module?: PageModule; editMode?: boolean; }

/**
 * Hero 模块 — 全屏首屏主视觉
 */
export default function HeroSection({ module, editMode }: Props) {
  const rm = useReducedMotion();
  const [vf, setVf] = useState(false);

  const defaults = homeCampaign.heroFilm;
  const c = module?.content;
  const s = module?.styleConfig;

  const desktopImg = c?.desktopImage || defaults.poster;
  const mobileImg = c?.mobileImage || defaults.mobilePoster || defaults.poster;
  const title = c?.title || defaults.title;
  const subtitle = c?.subtitle || defaults.eyebrow;
  const actionText = c?.actionText || defaults.action;
  const linkUrl = c?.linkUrl || defaults.href;
  const focusX = s?.focusX ?? defaults.focusX;
  const focusY = s?.focusY ?? defaults.focusY;

  return (
    <section
      className="relative w-full overflow-hidden"
      style={{
        height: '100svh', minHeight: '680px', background: '#0F0D0C',
        outline: editMode ? '2px solid rgba(184,148,78,0.6)' : undefined,
        outlineOffset: -2,
        position: 'relative' as const,
      }}
    >
      {editMode && (
        <div style={{ position: 'absolute', top: 8, right: 12, zIndex: 10, background: '#B8944E', color: '#fff', fontSize: 10, padding: '2px 8px', letterSpacing: '0.04em' }}>
          可编辑 · Hero
        </div>
      )}
      <picture>
        <source media="(max-width: 1023px) and (orientation: portrait)" srcSet={mobileImg} />
        <img
          src={desktopImg} alt={c?.altText || title}
          decoding="sync"
          width={1024} height={1536}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ objectPosition: `${focusX}% ${focusY + 5}%` }}
        />
      </picture>
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'linear-gradient(to top, rgba(15,13,12,0.32), rgba(15,13,12,0.02) 44%, rgba(15,13,12,0.06))' }}
      />
      {/* 顶部安全区渐变 */}
      <div className="absolute top-0 left-0 right-0 pointer-events-none"
        style={{ height: '140px', background: 'linear-gradient(to bottom, rgba(246,243,237,0.22) 0%, rgba(246,243,237,0.08) 52%, rgba(246,243,237,0) 100%)' }}
      />

      {/* 左下文案 */}
      <div className="absolute bottom-[clamp(38px,7vh,76px)] left-[clamp(28px,4.2vw,72px)] z-10" style={{ maxWidth: '520px' }}>
        <p className="text-[10px] md:text-[11px] tracking-[.2em] uppercase mb-4 font-sans"
          style={{ color: 'rgba(255,255,255,0.6)', fontFamily: 'Inter,system-ui,sans-serif', opacity: rm ? 1 : 0, transform: rm ? 'none' : 'translateY(12px)', animation: rm ? 'none' : 'fadeUp 0.7s 0.18s cubic-bezier(0.22,1,0.36,1) forwards' }}>
          {subtitle}
        </p>
        <h1 className="text-[clamp(40px,5vw,68px)] leading-[1.1] tracking-[.02em] mb-6 whitespace-pre-line"
          style={{ fontFamily: '"Cormorant Garamond","Noto Serif SC",serif', color: LT, opacity: rm ? 1 : 0, transform: rm ? 'none' : 'translateY(12px)', animation: rm ? 'none' : 'fadeUp 0.7s 0.28s cubic-bezier(0.22,1,0.36,1) forwards' }}>
          {title}
        </h1>
        {actionText && linkUrl && (
          <Link to={linkUrl} className="inline-flex items-center gap-2 text-[10px] md:text-[11px] tracking-[.14em] uppercase transition-opacity duration-300 hover:opacity-60"
            style={{ color: 'rgba(255,255,255,0.7)', fontFamily: 'Inter,system-ui,sans-serif', opacity: rm ? 1 : 0, transform: rm ? 'none' : 'translateY(12px)', animation: rm ? 'none' : 'fadeUp 0.7s 0.38s cubic-bezier(0.22,1,0.36,1) forwards' }}>
            {actionText} <span>→</span>
          </Link>
        )}
      </div>
      {/* 底部下滑线 */}
      <span className="absolute bottom-[22px] left-1/2 -translate-x-1/2 w-8 h-px animate-pulse opacity-40" style={{ background: 'rgba(255,255,255,0.5)' }} />
    </section>
  );
}
