import { Link } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { usePageMetaStore } from '@/store/pageMetaStore';
import { pageDocumentApi } from '@/services/api';
import { unwrapResponse } from '@/utils/unwrap';

/* ═══════ 设计常量 ═══════ */
const DARK = '#24211E';
const LIGHT = '#F3F0EA';

function SectionLabel({ number, label }: { number: string; label: string }) {
  return (
    <p className="text-[11px] md:text-[12px] tracking-[.2em] uppercase mb-8 md:mb-10 font-sans"
      style={{ color: '#9B8264', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {number} / {label}
    </p>
  );
}

const designChapters = [
  { id: '01', en: 'LINE', zh: '线条决定一件珠宝如何接近身体。', body: '我们关注轮廓的转折、收拢与延伸。线条不是表面的装饰，而是作品结构、比例与佩戴感受的基础。', img: '/images/设计.png', ratio: 'aspect-[4/5]' },
  { id: '02', en: 'MATERIAL', zh: '材质保留着自然形成的痕迹。', body: '颜色、纹理、透光和微小差异，让每一种材质拥有不同的表情。设计需要回应材质，而不是掩盖材质。', img: '/images/錾刻.png', ratio: 'aspect-[3/2]' },
  { id: '03', en: 'LIGHT', zh: '光让材质产生第二层形态。', body: '珠宝的状态会随着环境和角度发生变化。光泽、阴影与反射，构成作品在佩戴过程中的动态表情。', img: '/images/镶嵌.png', ratio: 'aspect-square' },
];

export default function About() {
  const setPageMeta = usePageMetaStore((s) => s.setMeta);
  const clearPageMeta = usePageMetaStore((s) => s.clear);
  // 检测 about 装修内容：已发布则由 PublishedPageDecoration 渲染，本页不重复硬编码；未发布才兑底
  const [published, setPublished] = useState<boolean | null>(null);
  useEffect(() => {
    setPageMeta({
      title: '品牌故事 | 海川珠宝',
      description: '海川珠宝的品牌理念、设计哲学与东方工艺传承。',
    });
    return () => clearPageMeta();
  }, [setPageMeta, clearPageMeta]);

  useEffect(() => {
    let cancelled = false;
    pageDocumentApi
      .getPublished("about")
      .then((res) => {
        const data = unwrapResponse<any>(res);
        if (!cancelled) setPublished(Boolean(data?.puckData?.content?.length));
      })
      .catch(() => {
        if (!cancelled) setPublished(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [activeDesign, setActiveDesign] = useState(0);
  const designRefs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const refs = designRefs.current;
    const obs = new IntersectionObserver(
      (entries) => { entries.forEach((e) => { if (e.isIntersecting) { const idx = refs.indexOf(e.target as HTMLElement); if (idx >= 0) setActiveDesign(idx); } }); },
      { threshold: 0.4, rootMargin: '-20% 0px -40% 0px' },
    );
    refs.forEach((r) => r && obs.observe(r));
    return () => obs.disconnect();
  }, []);

  // 检测中或已有装修内容：交由 PublishedPageDecoration 渲染，本页不重复
  if (published !== false) return null;

  return (
    <main className="about-page" style={{ background: LIGHT }}>
      {/* ═══ Scene 01 — 品牌开场 ═══ */}
      <section className="relative overflow-hidden" style={{ minHeight: 'clamp(680px, calc(100svh - 64px), 860px)', background: '#F3F0EA' }}>
        <div className="h-full max-w-[1280px] mx-auto px-[22px] md:px-[40px] lg:px-[72px]">
          <div className="grid grid-cols-12 gap-x-6 h-full items-center">
            <div className="col-span-12 md:col-span-5 pt-10 md:pt-0">
              <hgroup>
                <p className="text-[11px] tracking-[.22em] uppercase mb-6 font-sans" style={{ color: '#9B8264', fontFamily: 'Inter, system-ui, sans-serif' }}>01 / THE HOUSE OF HAICHUAN</p>
                <h1 className="text-[clamp(42px,5.4vw,72px)] leading-[1.15] tracking-[.02em] mb-8" style={{ fontFamily: '"Cormorant Garamond","Noto Serif SC",serif', color: '#27231F' }}>珠宝，<br />沿着时间生长。</h1>
              </hgroup>
              <div className="max-w-[420px] space-y-3 mb-10 text-[15px] md:text-[16px] leading-[1.9]" style={{ color: '#777067' }}>
                <p>我们从材质的纹理、光的变化与佩戴的关系出发，让每一件作品在日常之中，慢慢形成属于佩戴者自己的意义。</p>
              </div>
              <p className="text-[12px] tracking-[.15em]" style={{ color: '#9B8264' }}>HAICHUAN JEWELRY</p>
              <div className="hidden md:flex items-center gap-3 mt-16">
                <span className="w-10 h-px" style={{ background: 'rgba(39,35,31,0.2)' }} />
                <span className="text-[10px] tracking-[.25em] uppercase" style={{ color: '#777067' }}>SCROLL TO DISCOVER</span>
              </div>
            </div>
            <div className="col-span-12 md:col-span-7 mt-8 md:mt-16 md:mb-0 h-[320px] md:h-[72%] max-h-[560px]" style={{ background: '#E8E3D9' }}>
              <img src="/images/设计.png" alt="珠宝材质与光影" className="w-full h-full object-cover" style={{ objectPosition: '50% 40%' }} />
              <div className="flex items-center gap-3 mt-3">
                <span className="w-8 h-px" style={{ background: 'rgba(39,35,31,0.2)' }} />
                <span className="text-[10px] tracking-[.15em] uppercase" style={{ color: '#777067' }}>FIG. 01 &nbsp; LIGHT, MATERIAL AND FORM</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ Scene 02 — 品牌序言 ═══ */}
      <section style={{ padding: '160px 0', background: '#FAF8F4' }}>
        <div className="max-w-[1280px] mx-auto px-[22px] md:px-[40px] lg:px-[72px]">
          <SectionLabel number="02" label="A POINT OF VIEW" />
          <div className="grid grid-cols-12 gap-x-6 gap-y-12">
            <div className="col-span-12 md:col-start-2 md:col-span-7">
              <p className="text-[clamp(36px,4.2vw,60px)] leading-[1.2] tracking-[.02em]" style={{ fontFamily: '"Cormorant Garamond","Noto Serif SC",serif', color: '#27231F' }}>
                海川不是一种固定的风格，<br />而是一种观看珠宝的方式。
              </p>
            </div>
            <div className="col-span-12 md:col-start-9 md:col-span-4 md:pt-[120px]">
              <div className="max-w-[380px] text-[15px] leading-[1.95] space-y-3" style={{ color: '#777067' }}>
                <p>我们关注一件珠宝与身体、光线和时间之间的关系。材质本身的纹理、轮廓的轻重与佩戴后的变化，共同决定了一件作品最终呈现出的状态。</p>
              </div>
            </div>
          </div>
          <div className="relative mt-20 md:mt-28">
            <div className="w-[62%] aspect-[3/2] overflow-hidden" style={{ background: '#E8E3D9' }}>
              <img src="/images/设计.png" alt="" className="w-full h-full object-cover" loading="lazy" />
              <p className="text-[10px] tracking-[.15em] uppercase mt-2" style={{ color: '#777067' }}>FIG. 02 &nbsp; TEXTURE STUDY</p>
            </div>
            <div className="absolute right-0 w-[28%] aspect-[3/4] overflow-hidden" style={{ top: '-100px', background: '#E8E3D9' }}>
              <img src="/images/錾刻.png" alt="" className="w-full h-full object-cover" loading="lazy" />
              <p className="text-[10px] tracking-[.15em] uppercase mt-2" style={{ color: '#777067' }}>FIG. 03 &nbsp; METAL DETAIL</p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ Scene 03 — 品牌理念（深色） ═══ */}
      <section className="relative overflow-hidden flex items-center" style={{ minHeight: 'clamp(620px, 82svh, 900px)', background: DARK }}>
        <span className="absolute left-[-8%] top-[10%] text-[min(42vw,520px)] leading-none font-black select-none pointer-events-none whitespace-nowrap opacity-[0.03]" style={{ fontFamily: '"Noto Serif SC",serif', color: '#F3EEE6' }}>海</span>
        <span className="absolute right-[-8%] bottom-[5%] text-[min(42vw,520px)] leading-none font-black select-none pointer-events-none whitespace-nowrap opacity-[0.03]" style={{ fontFamily: '"Noto Serif SC",serif', color: '#F3EEE6' }}>川</span>
        <div className="relative z-10 w-full max-w-[1280px] mx-auto px-[22px] md:px-[40px] lg:px-[72px]">
          <SectionLabel number="03" label="PHILOSOPHY" />
          <div className="grid grid-cols-12 gap-x-6">
            <div className="col-span-12 md:col-start-3 md:col-span-8">
              <p className="text-[clamp(32px,4.4vw,64px)] leading-[1.18] tracking-[.02em] max-w-[720px]" style={{ fontFamily: '"Cormorant Garamond","Noto Serif SC",serif', color: '#F3EEE6' }}>一件珠宝，<br />不会在完成制作的那一刻结束。</p>
              <p className="text-[clamp(32px,4.4vw,64px)] leading-[1.18] tracking-[.02em] max-w-[720px] mt-4" style={{ fontFamily: '"Cormorant Garamond","Noto Serif SC",serif', color: '#F3EEE6' }}>它会在佩戴、触碰与时间里，<br />继续形成自己的样子。</p>
            </div>
          </div>
          <div className="mt-20 md:mt-28 text-right">
            <p className="text-[12px] tracking-[.12em]" style={{ color: '#F3EEE6', fontFamily: 'Inter, system-ui, sans-serif' }}>HAICHUAN JEWELRY</p>
            <p className="text-[11px] tracking-[.1em] mt-1 opacity-60" style={{ color: '#F3EEE6' }}>A STUDY OF TIME AND MATERIAL</p>
          </div>
        </div>
      </section>

      {/* ═══ Scene 04 — 设计语言（Sticky） ═══ */}
      <section style={{ background: '#F3F0EA', padding: '160px 0' }}>
        <div className="max-w-[1280px] mx-auto px-[22px] md:px-[40px] lg:px-[72px]">
          <div className="grid grid-cols-12 gap-x-6">
            <aside className="hidden md:block md:col-span-4">
              <div className="sticky flex flex-col gap-2" style={{ top: '144px' }}>
                <SectionLabel number="04" label="DESIGN APPROACH" />
                {['线', '材', '光'].map((char, i) => (
                  <span key={char} className="text-[clamp(48px,5vw,80px)] leading-none tracking-[.04em] transition-all duration-500"
                    style={{ fontFamily: '"Cormorant Garamond","Noto Serif SC",serif', color: activeDesign === i ? '#27231F' : 'rgba(39,35,31,0.16)' }}>{char}</span>
                ))}
              </div>
            </aside>
            <div className="col-span-12 md:col-span-7 md:col-start-6">
              <div className="md:hidden mb-12"><SectionLabel number="04" label="DESIGN APPROACH" /></div>
              {designChapters.map((ch, i) => (
                <section key={ch.id} ref={(el) => { designRefs.current[i] = el; }} style={{ minHeight: 'clamp(520px, 78svh, 780px)', marginBottom: i < 2 ? '120px' : '0' }}>
                  <p className="text-[11px] tracking-[.2em] mb-4 font-sans" style={{ color: '#9B8264' }}>{ch.id} / {ch.en}</p>
                  <h2 className="text-[clamp(28px,3vw,44px)] leading-[1.22] tracking-[.03em] mb-6 max-w-[480px]" style={{ fontFamily: '"Cormorant Garamond","Noto Serif SC",serif', color: '#27231F' }}>{ch.zh}</h2>
                  <p className="text-[15px] leading-[1.9] mb-10 max-w-[400px]" style={{ color: '#777067' }}>{ch.body}</p>
                  <div className={`${ch.ratio} overflow-hidden`} style={{ background: '#E8E3D9' }}>
                    <img src={ch.img} alt={ch.en} className="w-full h-full object-cover" loading="lazy" />
                  </div>
                  <p className="text-[10px] tracking-[.15em] uppercase mt-2" style={{ color: '#777067' }}>FIG. {String(i + 4).padStart(2, '0')} &nbsp; {ch.en} STUDY</p>
                </section>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ Scene 05 — 作品入口 ═══ */}
      <div className="w-full overflow-hidden" style={{ height: 'clamp(360px, 60vw, 640px)', background: '#E8E3D9' }}>
        <img src="/images/设计.png" alt="" className="w-full h-full object-cover" loading="lazy" style={{ objectPosition: '50% 35%' }} />
      </div>
      <section style={{ background: '#FAF8F4', padding: '160px 0' }}>
        <div className="max-w-[1280px] mx-auto px-[22px] md:px-[40px] lg:px-[72px]">
          <SectionLabel number="05" label="COLLECTION" />
          <div className="grid grid-cols-12 gap-x-6 gap-y-10">
            <div className="col-span-12 md:col-span-6">
              <h2 className="text-[clamp(36px,4vw,56px)] leading-[1.18] tracking-[.02em]" style={{ fontFamily: '"Cormorant Garamond","Noto Serif SC",serif', color: '#27231F' }}>故事最终，<br />回到作品本身。</h2>
            </div>
            <div className="col-span-12 md:col-span-5 md:col-start-8 md:pt-4">
              <p className="text-[15px] leading-[1.9] mb-8 max-w-[380px]" style={{ color: '#777067' }}>从形态、材质与光开始，继续探索海川的珠宝作品。</p>
              <Link to="/products" className="group inline-flex items-center gap-2 pb-1 text-sm tracking-[.08em]" style={{ color: '#27231F', borderBottom: '1px solid rgba(39,35,31,0.2)' }}>
                <span>查看珠宝作品</span>
                <span className="inline-block transition-transform duration-300 group-hover:translate-x-[5px]">→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
