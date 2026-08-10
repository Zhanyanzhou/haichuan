import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import { homeCampaign } from '@/data/homeCampaign';
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
  const rm = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold: 0.08 });
    o.observe(el);
    return () => o.disconnect();
  }, []);

  // 默认值 fallback
  const defaults = homeCampaign.signaturePoster;
  const c = module?.content;
  const l = module?.layoutConfig;
  const s = module?.styleConfig;

  const desktopImg = c?.desktopImage || defaults.image;
  const mobileImg = c?.mobileImage || desktopImg;
  const number = c?.number || defaults.number;
  const label = c?.label || defaults.label;
  const title = c?.title || defaults.title;
  const subtitle = c?.subtitle || defaults.subtitle;
  const linkUrl = c?.linkUrl || defaults.href;
  const focusX = s?.focusX ?? defaults.focusX;
  const focusY = s?.focusY ?? defaults.focusY;

  return (
    <section
      ref={ref}
      className="overflow-hidden"
      style={{
        minHeight: '110svh', padding: '120px 0 140px',
        background: s?.bgColor || LG,
        outline: editMode ? '2px solid rgba(184,148,78,0.6)' : undefined,
        outlineOffset: -2,
        position: 'relative' as const,
      }}
    >
      {editMode && (
        <div style={{ position: 'absolute', top: 8, right: 12, zIndex: 10, background: '#B8944E', color: '#fff', fontSize: 10, padding: '2px 8px', letterSpacing: '0.04em' }}>
          可编辑 · 单海报
        </div>
      )}
      <div className="grid grid-cols-12 gap-x-6 max-w-[1600px] mx-auto" style={{ padding: `0 ${PAD}` }}>
        <div className="col-span-12 md:col-span-3 self-center md:self-auto md:pt-[22vh]">
          <p className="text-[10px] tracking-[.2em] uppercase mb-2 font-sans" style={{ color: MU }}>{number} / {label}</p>
          <h2 className="text-[clamp(26px,2.8vw,40px)] leading-[1.12] tracking-[.02em] mb-1"
            style={{ fontFamily: '"Cormorant Garamond","Noto Serif SC",serif', color: TX }}>{title}</h2>
          {subtitle && <p className="text-sm mb-5" style={{ color: MU }}>{subtitle}</p>}
          <Link to={linkUrl} className="inline-flex items-center gap-2 text-[10px] tracking-[.14em] uppercase transition-opacity hover:opacity-55 font-sans" style={{ color: TX }}>
            VIEW SERIES <span>→</span>
          </Link>
        </div>
        <div className="col-span-12 md:col-span-9 mt-8 md:mt-0">
          <div className="overflow-hidden" style={{
            // 宽度不再在窄屏强制保留 600px，避免图片被父容器裁掉。
            width: 'min(100%, clamp(600px,82vw,1460px))', height: 'min(76svh, 140vw)', minHeight: '480px', maxHeight: '860px',
            marginLeft: 'auto', marginRight: '0',
            opacity: rm || visible ? 1 : 0,
            transform: rm || visible ? 'scale(1)' : 'scale(1.015) translateY(14px)',
            transition: 'opacity 0.95s ease, transform 0.95s ease',
          }}>
            <picture className="block w-full h-full">
              <source media="(max-width: 1023px) and (orientation: portrait)" srcSet={mobileImg} />
              <img src={desktopImg} alt={title} className="w-full h-full object-cover" loading="lazy" decoding="async"
                style={{ objectPosition: `${focusX}% ${focusY}%` }} />
            </picture>
          </div>
        </div>
      </div>
    </section>
  );
}
