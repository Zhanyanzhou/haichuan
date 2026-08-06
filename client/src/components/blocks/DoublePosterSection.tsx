import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import { homeCampaign } from '@/data/homeCampaign';
import type { PageModule } from '@/types/pageModule';

const SF = '#F8F6F1';
const TX = '#28231F';
const MU = 'rgba(40,35,31,0.58)';
const PAD = 'clamp(24px,5vw,80px)';

interface Props { module?: PageModule; editMode?: boolean; }

/**
 * 双海报模块 — 主图 + 细节图错位
 */
export default function DoublePosterSection({ module, editMode }: Props) {
  const rm = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold: 0.06 });
    o.observe(el);
    return () => o.disconnect();
  }, []);

  const defaults = homeCampaign.editorialPair;
  const c = module?.content;
  const s = module?.styleConfig;

  const mainImg = c?.mainImage || c?.desktopImage || defaults.mainImage;
  const detailImg = c?.detailImage || c?.mobileImage || defaults.detailImage;
  const number = c?.number || defaults.number;
  const label = c?.label || defaults.label;
  const title = c?.title || defaults.title;
  const description = c?.description || defaults.description;
  const linkUrl = c?.linkUrl || defaults.href;

  return (
    <section
      ref={ref}
      style={{
        minHeight: '118svh', padding: '140px 0 160px',
        background: s?.bgColor || SF,
        outline: editMode ? '2px solid rgba(184,148,78,0.6)' : undefined,
        outlineOffset: -2,
        position: 'relative' as const,
      }}
    >
      {editMode && (
        <div style={{ position: 'absolute', top: 8, right: 12, zIndex: 10, background: '#B8944E', color: '#fff', fontSize: 10, padding: '2px 8px', letterSpacing: '0.04em' }}>
          可编辑 · 双海报
        </div>
      )}
      <div className="grid grid-cols-12 gap-x-6 max-w-[1520px] mx-auto" style={{ padding: `0 ${PAD}` }}>
        <div className="col-span-12 md:col-span-8">
          <div className="overflow-hidden" style={{
            height: 'clamp(560px,80vh,900px)',
            opacity: rm || visible ? 1 : 0,
            transform: rm || visible ? 'translateY(0)' : 'translateY(18px)',
            transition: 'opacity 0.9s 0.05s ease, transform 0.9s 0.05s ease',
          }}>
            <img src={mainImg} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async"
              style={{ objectPosition: `${s?.mainFocusX ?? 50}% ${s?.mainFocusY ?? 50}%` }} />
          </div>
        </div>
        <div className="col-span-12 md:col-span-4 mt-10 md:mt-[180px]">
          <div className="overflow-hidden" style={{ height: 'clamp(320px,48vh,520px)' }}>
            <img src={detailImg} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async"
              style={{ objectPosition: `${s?.detailFocusX ?? 50}% ${s?.detailFocusY ?? 50}%` }} />
          </div>
          <div className="mt-6">
            <p className="text-[10px] tracking-[.2em] uppercase mb-2 font-sans" style={{ color: MU }}>{number} / {label}</p>
            <h2 className="text-[clamp(22px,2.2vw,32px)] leading-[1.12] tracking-[.02em] mb-1"
              style={{ fontFamily: '"Cormorant Garamond","Noto Serif SC",serif', color: TX }}>{title}</h2>
            <p className="text-sm mb-4 max-w-[240px]" style={{ color: MU }}>{description}</p>
            <Link to={linkUrl} className="inline-flex items-center gap-2 text-[10px] tracking-[.14em] uppercase transition-opacity hover:opacity-55 font-sans" style={{ color: TX }}>
              VIEW THE COLLECTION <span>→</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
