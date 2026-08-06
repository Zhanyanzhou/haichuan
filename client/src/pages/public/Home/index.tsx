import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import { homeCampaign } from '@/data/homeCampaign';
import { usePublishedSlots, useDraftSlots } from '@/hooks/useContentSlots';
import { usePublishedModules, useAdminModules } from '@/hooks/usePageModules';
import type { PublishedSlots } from '@/types/contentSlot';
import type { PageModule } from '@/types/pageModule';
import SinglePosterSection from '@/components/blocks/SinglePosterSection';
import DoublePosterSection from '@/components/blocks/DoublePosterSection';
import HeroSection from '@/components/blocks/HeroSection';

/* ═══════ 设计常量 + 间距系统 ═══════ */
const LG = '#F3F0E9';
const SF = '#F8F6F1';
const DK = '#1C1A18';
const TX = '#28231F';
const MU = 'rgba(40,35,31,0.58)';
const LT = '#F1ECE3';
const LM = 'rgba(241,236,227,0.55)';
const PAD = 'clamp(24px,5vw,80px)';

function useInView(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null);
  const [v, setV] = useState(false);
  useEffect(() => { const el = ref.current; if (!el) return; const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) setV(true); }, { threshold }); o.observe(el); return () => o.disconnect(); }, [threshold]);
  return { ref, visible: v };
}

export { LG, SF, DK, TX, MU, LT, LM, PAD };
export { useInView };
export { SlotCtx };

/* ═══════ 01 · Hero Film ═══════ */
export function HeroFilm() {
  const rm = useReducedMotion();
  const [vf, setVf] = useState(false);
  const f = homeCampaign.heroFilm;
  const showV = Boolean(f.desktopVideo && !vf);

  return (
    <section className="relative w-full overflow-hidden" style={{ height: '100svh', minHeight: '680px', background: '#0F0D0C' }}>
      <picture>
        <source media="(max-width:767px)" srcSet={f.mobilePoster || f.poster} />
        <img src={f.poster} alt="" fetchpriority="high" decoding="sync"
          width={1024} height={1536}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ objectPosition: `${f.focusX}% ${f.focusY + 5}%` }} />
      </picture>
      {showV && <video className="absolute inset-0 w-full h-full object-cover" src={f.desktopVideo} poster={f.poster} autoPlay muted loop playsInline preload="metadata" onError={() => setVf(true)} style={{ objectPosition: `${f.focusX}% ${f.focusY + 5}%` }} />}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to top, rgba(15,13,12,0.32), rgba(15,13,12,0.02) 44%, rgba(15,13,12,0.06))' }} />

      {/* 顶部安全区渐变 — 保证 Header 可读性 */}
      <div className="absolute top-0 left-0 right-0 pointer-events-none" style={{ height: '140px', background: 'linear-gradient(to bottom, rgba(246,243,237,0.22) 0%, rgba(246,243,237,0.08) 52%, rgba(246,243,237,0) 100%)' }} />

      {/* 左下文案 — 逐级淡入 */}
      <div className="absolute bottom-[clamp(38px,7vh,76px)] left-[clamp(28px,4.2vw,72px)] z-10" style={{ maxWidth: '520px' }}>
        <p className="text-[10px] md:text-[11px] tracking-[.2em] uppercase mb-4 font-sans"
          style={{ color: 'rgba(255,255,255,0.6)', fontFamily: 'Inter,system-ui,sans-serif', opacity: rm ? 1 : 0, transform: rm ? 'none' : 'translateY(12px)', animation: rm ? 'none' : 'fadeUp 0.7s 0.18s cubic-bezier(0.22,1,0.36,1) forwards' }}>
          {f.eyebrow}
        </p>
        <h1 className="text-[clamp(40px,5vw,68px)] leading-[1.1] tracking-[.02em] mb-6 whitespace-pre-line"
          style={{ fontFamily: '"Cormorant Garamond","Noto Serif SC",serif', color: LT, opacity: rm ? 1 : 0, transform: rm ? 'none' : 'translateY(12px)', animation: rm ? 'none' : 'fadeUp 0.7s 0.28s cubic-bezier(0.22,1,0.36,1) forwards' }}>
          {f.title}
        </h1>
        <Link to={f.href} className="inline-flex items-center gap-2 text-[10px] md:text-[11px] tracking-[.14em] uppercase transition-opacity duration-300 hover:opacity-60"
          style={{ color: 'rgba(255,255,255,0.7)', fontFamily: 'Inter,system-ui,sans-serif', opacity: rm ? 1 : 0, transform: rm ? 'none' : 'translateY(12px)', animation: rm ? 'none' : 'fadeUp 0.7s 0.38s cubic-bezier(0.22,1,0.36,1) forwards' }}>
          {f.action} <span>→</span>
        </Link>
      </div>

      {/* 底部中央下滑线 */}
      <span className="absolute bottom-[22px] left-1/2 -translate-x-1/2 w-8 h-px animate-pulse opacity-40" style={{ background: 'rgba(255,255,255,0.5)' }} />
    </section>
  );
}

/* ═══════ 02 · Brand Transition ═══════ */
export function BrandTransition() {
  const rm = useReducedMotion();
  const { ref, visible } = useInView(0.2);
  return (
    <section ref={ref} style={{ minHeight: '34svh', maxHeight: '480px', padding: '110px 0', background: LG }}>
      <div className="max-w-[1280px] mx-auto" style={{ padding: `0 ${PAD}` }}>
        <div className="grid grid-cols-12 gap-x-6">
          <div className="col-span-12 md:col-span-8 md:col-start-3">
            <p className="text-[clamp(28px,3vw,46px)] leading-[1.5] tracking-[.02em] max-w-[700px] whitespace-pre-line"
              style={{ fontFamily: '"Cormorant Garamond","Noto Serif SC",serif', color: TX, opacity: rm || visible ? 1 : 0, transform: rm || visible ? 'translateY(0)' : 'translateY(16px)', transition: 'opacity 0.8s ease, transform 0.8s ease' }}>
              {homeCampaign.manifesto.text}
            </p>
          </div>
          <div className="col-span-12 md:col-span-3 md:col-start-10 md:self-end mt-4 md:mt-0">
            <p className="text-[10px] tracking-[.18em] uppercase" style={{ color: MU, fontFamily: 'Inter,system-ui,sans-serif' }}>HAICHUAN JEWELRY</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════ 03 · Signature Campaign ═══════ */
export function SignatureCampaign() {
  const rm = useReducedMotion();
  const { ref, visible } = useInView(0.08);
  const s = homeCampaign.signaturePoster;
  const slot = useSlot('HOME_SIG_POSTER');
  const posterSrc = slot?.desktopAsset || s.image;
  return (
    <section ref={ref} className="overflow-hidden" style={{ minHeight: '110svh', padding: '120px 0 140px', background: LG }}>
      <div className="grid grid-cols-12 gap-x-6 max-w-[1600px] mx-auto" style={{ padding: `0 ${PAD}` }}>
        {/* 左侧文字：col 1-3，对齐到海报 35-45% 位置 */}
        <div className="col-span-12 md:col-span-3 self-center md:self-auto md:pt-[22vh]">
          <p className="text-[10px] tracking-[.2em] uppercase mb-2 font-sans" style={{ color: MU }}>{s.number} / {s.label}</p>
          <h2 className="text-[clamp(26px,2.8vw,40px)] leading-[1.12] tracking-[.02em] mb-1" style={{ fontFamily: '"Cormorant Garamond","Noto Serif SC",serif', color: TX }}>{s.title}</h2>
          {s.subtitle && <p className="text-sm mb-5" style={{ color: MU }}>{s.subtitle}</p>}
          <Link to={s.href} className="inline-flex items-center gap-2 text-[10px] tracking-[.14em] uppercase transition-opacity hover:opacity-55 font-sans" style={{ color: TX }}>VIEW SERIES <span>→</span></Link>
        </div>
        {/* 右侧超大海报：col 4-12 */}
        <div className="col-span-12 md:col-span-9 mt-8 md:mt-0">
          <div className="overflow-hidden" style={{ width: 'clamp(600px,82vw,1460px)', height: 'clamp(480px,76vh,860px)', marginLeft: 'auto', marginRight: '0', opacity: rm || visible ? 1 : 0, transform: rm || visible ? 'scale(1)' : 'scale(1.015) translateY(14px)', transition: 'opacity 0.95s ease, transform 0.95s ease' }}>
            <img src={posterSrc} alt={s.title} className="w-full h-full object-cover" loading="lazy" decoding="async" style={{ objectPosition: `${s.focusX}% ${s.focusY}%` }} />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════ 04 · Editorial Campaign ═══════ */
export function EditorialCampaign() {
  const rm = useReducedMotion();
  const { ref, visible } = useInView(0.06);
  const p = homeCampaign.editorialPair;
  return (
    <section ref={ref} style={{ minHeight: '118svh', padding: '140px 0 160px', background: SF }}>
      <div className="grid grid-cols-12 gap-x-6 max-w-[1520px] mx-auto" style={{ padding: `0 ${PAD}` }}>
        {/* 主海报 col 1-8，占 66% 宽度 */}
        <div className="col-span-12 md:col-span-8">
          <div className="overflow-hidden" style={{ height: 'clamp(560px,80vh,900px)', opacity: rm || visible ? 1 : 0, transform: rm || visible ? 'translateY(0)' : 'translateY(18px)', transition: 'opacity 0.9s 0.05s ease, transform 0.9s 0.05s ease' }}>
            <img src={p.mainImage} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" style={{ objectPosition: `${p.mainFocusX}% ${p.mainFocusY}%` }} />
          </div>
        </div>
        {/* 细节海报 col 9-12，向下错位 180px */}
        <div className="col-span-12 md:col-span-4 mt-10 md:mt-[180px]">
          <div className="overflow-hidden" style={{ height: 'clamp(320px,48vh,520px)' }}>
            <img src={p.detailImage} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" style={{ objectPosition: `${p.detailFocusX}% ${p.detailFocusY}%` }} />
          </div>
          <div className="mt-6">
            <p className="text-[10px] tracking-[.2em] uppercase mb-2 font-sans" style={{ color: MU }}>{p.number} / {p.label}</p>
            <h2 className="text-[clamp(22px,2.2vw,32px)] leading-[1.12] tracking-[.02em] mb-1" style={{ fontFamily: '"Cormorant Garamond","Noto Serif SC",serif', color: TX }}>{p.title}</h2>
            <p className="text-sm mb-4 max-w-[240px]" style={{ color: MU }}>{p.description}</p>
            <Link to={p.href} className="inline-flex items-center gap-2 text-[10px] tracking-[.14em] uppercase transition-opacity hover:opacity-55 font-sans" style={{ color: TX }}>VIEW THE COLLECTION <span>→</span></Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════ 05 · Craft Finale ═══════ */
export function CraftFinale() {
  const rm = useReducedMotion();
  const { ref, visible } = useInView(0.06);
  const c = homeCampaign.craftPoster;

  return (
    <section ref={ref} className="overflow-hidden" style={{ minHeight: '100svh', background: DK, padding: `110px ${PAD}` }}>
      <div className="grid grid-cols-12 gap-x-6 h-full items-center">
        <div className="col-span-12 md:col-span-8">
          <div className="overflow-hidden" style={{ height: 'clamp(520px,72vh,820px)', opacity: rm || visible ? 1 : 0, transform: rm || visible ? 'translateY(0)' : 'translateY(16px)', transition: 'opacity 0.95s ease, transform 0.95s ease' }}>
            <img src={c.image} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" style={{ objectPosition: `${c.focusX}% ${c.focusY}%` }} />
          </div>
        </div>
        <div className="col-span-12 md:col-span-3 md:col-start-10 mt-8 md:mt-0" style={{ maxWidth: '340px' }}>
          <p className="text-[10px] tracking-[.2em] uppercase mb-4 font-sans" style={{ color: LM }}>{c.number} / {c.label}</p>
          <h2 className="text-[clamp(28px,3.2vw,46px)] leading-[1.12] tracking-[.02em] mb-6 whitespace-pre-line" style={{ fontFamily: '"Cormorant Garamond","Noto Serif SC",serif', color: LT }}>{c.title}</h2>
          <Link to={c.href} className="inline-flex items-center gap-2 text-[10px] tracking-[.14em] uppercase transition-opacity hover:opacity-55 font-sans" style={{ color: LM }}>DISCOVER THE CRAFT <span>→</span></Link>
        </div>
      </div>
    </section>
  );
}

/* ═══════ 06 · Home Closing Campaign ═══════ */
export function HomeClosingCampaign() {
  const rm = useReducedMotion();
  const { ref, visible } = useInView(0.08);

  return (
    <section ref={ref} className="relative overflow-hidden"
      style={{ minHeight: '82svh', height: 'clamp(620px,86svh,940px)', background: '#12100E' }}>
      {/* 全宽图片 */}
      {/* TODO: Replace with final closing campaign image */}
      <img
        src="/images/editorial/hero-gold-bangle-v1.png"
        alt=""
        className="absolute inset-0 w-full h-full object-cover block"
        loading="lazy" decoding="async"
        style={{ objectPosition: 'center center' }}
      />

      {/* 左侧渐变遮罩 — 保证左下文字可读 */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'linear-gradient(90deg, rgba(18,16,14,0.48) 0%, rgba(18,16,14,0.16) 46%, rgba(18,16,14,0.03) 78%)' }} />

      {/* 左下文案 */}
      <div className="absolute z-10"
        style={{ left: 'clamp(32px,5.5vw,96px)', bottom: 'clamp(48px,9vh,110px)', maxWidth: '520px' }}>
        {/* TODO: Replace with final homepage closing campaign copy */}
        <p className="text-[10px] tracking-[.22em] uppercase leading-[1.4] font-sans"
          style={{ color: 'rgba(255,255,255,0.72)', fontFamily: 'Inter,system-ui,sans-serif', opacity: rm || visible ? 1 : 0, transform: rm || visible ? 'translateY(0)' : 'translateY(16px)', transition: 'opacity 0.9s ease, transform 0.9s ease' }}>
          THE HOUSE OF HAICHUAN
        </p>

        <h2 className="text-[clamp(40px,5.2vw,74px)] leading-[1.12] tracking-[.04em] whitespace-pre-line mt-6"
          style={{ fontFamily: '"Cormorant Garamond","Noto Serif SC",serif', color: '#F6F1E9', opacity: rm || visible ? 1 : 0, transform: rm || visible ? 'translateY(0)' : 'translateY(16px)', transition: 'opacity 0.9s 0.08s ease, transform 0.9s 0.08s ease' }}>
          {'器有形，\n意无界。'}
        </h2>

        <Link to="/products"
          className="group inline-flex items-center gap-3 text-[11px] tracking-[.12em] uppercase font-sans mt-9 transition-colors duration-360 hover:text-white focus-visible:text-white"
          style={{ color: 'rgba(255,255,255,0.82)', transitionTimingFunction: 'cubic-bezier(0.22,1,0.36,1)', opacity: rm || visible ? 1 : 0, transform: rm || visible ? 'translateY(0)' : 'translateY(16px)', transition: 'opacity 0.9s 0.16s ease, transform 0.9s 0.16s ease' }}>
          探索珠宝作品
          <span className="inline-block transition-transform duration-360 group-hover:translate-x-[5px]"
            style={{ transitionTimingFunction: 'cubic-bezier(0.22,1,0.36,1)' }} aria-hidden="true">→</span>
          {/* hover 下线 */}
          <span className="absolute bottom-[-4px] left-0 h-px w-0 transition-all duration-360 group-hover:w-full"
            style={{ background: '#fff', transitionTimingFunction: 'cubic-bezier(0.22,1,0.36,1)' }} />
        </Link>
      </div>
    </section>
  );
}

/* ═══════ 全局动画定义 ═══════ */
export const fadeUpStyle = `
  @keyframes fadeUp {
    to { opacity: 1; transform: translateY(0); }
  }
`;

/* ═══════ Slot Context ═══════ */
const SlotCtx = createContext<PublishedSlots>({});
function useSlot(key: string) {
  const slots = useContext(SlotCtx);
  return slots[key];
}

/* ═══════ 模块→组件映射 ═══════ */
const MODULE_MAP: Record<string, React.ComponentType<{ module: PageModule; editMode?: boolean }>> = {
  hero: HeroSection,
  singlePoster: SinglePosterSection,
  doublePoster: DoublePosterSection,
};

/** 编辑器包装帧 — 仅在 editMode 下给模块加 data-module-id + 发送 postMessage */
function EditorModuleFrame({ module, children }: { module: PageModule; children: React.ReactNode }) {
  const handleMouseEnter = () => {
    window.parent.postMessage({ type: 'MODULE_HOVERED', moduleId: module.id }, '*');
  };
  const handleMouseLeave = () => {
    window.parent.postMessage({ type: 'MODULE_HOVERED', moduleId: null }, '*');
  };
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.parent.postMessage({ type: 'MODULE_SELECTED', moduleId: module.id }, '*');
  };

  return (
    <section
      data-module-id={module.id}
      data-module-type={module.moduleType}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      style={{ position: 'relative', cursor: 'pointer' }}
    >
      {children}
    </section>
  );
}

function renderModule(m: PageModule, editMode = false) {
  const Comp = MODULE_MAP[m.moduleType];
  if (!Comp) return null;
  const inner = <Comp key={m.id} module={m} editMode={editMode} />;
  if (!editMode) return inner;
  return <EditorModuleFrame key={m.id} module={m}>{inner}</EditorModuleFrame>;
}

/* ═══════ 硬编码 fallback 渲染 ═══════ */
function FallbackHome() {
  return (
    <>
      <HeroFilm />
      <BrandTransition />
      <SignatureCampaign />
      <EditorialCampaign />
      <CraftFinale />
      <HomeClosingCampaign />
    </>
  );
}

/* ═══════ 主页 ═══════ */
export default function Home() {
  const { modules, loading } = usePublishedModules('home');
  const { slots } = usePublishedSlots('home');

  // 加载中不闪烁
  if (loading) {
    return (
      <main style={{ background: LG, minHeight: '100vh' }}>
        <style>{fadeUpStyle}</style>
      </main>
    );
  }

  // 有已发布模块 → 模块驱动渲染；否则 → fallback
  const hasPublished = modules.length > 0;

  return (
    <SlotCtx.Provider value={slots}>
    <main style={{ background: LG }}>
      <style>{fadeUpStyle}</style>
      {hasPublished
        ? modules.map(m => renderModule(m))
        : <FallbackHome />
      }
    </main>
    </SlotCtx.Provider>
  );
}

/* ═══════ 预览页（后台 iframe 用，读取草稿模块） ═══════ */
export function HomePreview() {
  const { modules, loading, refresh } = useAdminModules('home');
  const { slots } = useDraftSlots('home');

  // 通知父页面预览已就绪
  useEffect(() => {
    if (!loading && window.parent !== window) {
      window.parent.postMessage({ type: 'CANVAS_READY' }, '*');
    }
  }, [loading]);

  // 监听父页面发来的模块修改消息
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (!e.data || e.data.type !== 'PATCH_MODULE') return;
      // 收到修改后刷新数据
      refresh();
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [refresh]);

  if (loading) {
    return (
      <main style={{ background: LG, minHeight: '100vh' }}>
        <style>{fadeUpStyle}</style>
      </main>
    );
  }

  const hasModules = modules.length > 0;

  return (
    <SlotCtx.Provider value={slots}>
    <main style={{ background: LG }}>
      <style>{fadeUpStyle}</style>
      <style>{`
        [data-module-id] { transition: outline 0.15s; }
        [data-module-id]:hover { outline: 1px dashed #B8944E; outline-offset: -1px; }
      `}</style>
      {hasModules
        ? modules.filter(m => m.isVisible).map(m => renderModule(m, true))
        : <FallbackHome />
      }
    </main>
    </SlotCtx.Provider>
  );
}
