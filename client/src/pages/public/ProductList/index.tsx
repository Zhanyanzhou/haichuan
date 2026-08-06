import { useState, useCallback, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import {
  coverImage, signatureSeries, secondarySeries1, secondarySeries2,
  objectStudies, campaignArchive, closingImage, allGalleryImages,
  type ExImage,
} from '@/data/collections';

/* ═══════ 工具 ═══════ */
const U = { hidden: { opacity: 0, y: 14 }, visible: { opacity: 1, y: 0 } };
const F = { hidden: { opacity: 0, scale: 1.01 }, visible: { opacity: 1, scale: 1 } };
const D = 0.9;
const E: [number, number, number, number] = [0.22, 1, 0.36, 1];

function useReveal(m?: string) { const r = useRef<HTMLDivElement>(null); return { ref: r, inView: useInView(r, { once: true, margin: m || '-60px 0px' }) }; }

const V = { bg: '#F4F1EA', surface: '#F8F6F1', text: '#29241F', sec: 'rgba(41,36,31,0.56)', line: 'rgba(41,36,31,0.12)', acc: '#A7895B' };

const SX = { paddingInline: 'clamp(48px,5vw,88px)' } as const;
const PX = 'clamp(48px,5vw,88px)';
const MX = 'max-w-[1760px] mx-auto';

function Img({ img, className = '', style, onClick, loading = 'lazy' as const }: {
  img: ExImage; className?: string; style?: React.CSSProperties; onClick?: () => void; loading?: 'lazy' | 'eager';
}) {
  return <img src={img.src} alt={img.alt} className={className} loading={loading}
    style={{ objectPosition: img.objectPosition, cursor: onClick ? 'pointer' : undefined, ...style }}
    onClick={onClick} />;
}

function Label({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: '9px', letterSpacing: '0.22em', color: V.acc }}>{children}</p>;
}

/* ═══════ Lightbox ═══════ */
function Lightbox({ images, index, onClose }: { images: (ExImage & { label?: string })[];
  index: number; onClose: () => void }) {
  const [i, setI] = useState(index);
  const prev = () => setI(p => (p - 1 + images.length) % images.length);
  const next = () => setI(p => (p + 1) % images.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowLeft') prev(); if (e.key === 'ArrowRight') next(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  const img = images[i];
  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
        style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <button onClick={onClose} aria-label="关闭"
          style={{ position: 'absolute', top: '20px', right: '24px', zIndex: 5, minWidth: '44px', minHeight: '44px', background: 'none', border: 0, color: 'rgba(255,255,255,0.65)', fontSize: '28px', cursor: 'pointer', lineHeight: 1 }}>✕</button>
        <button onClick={prev} aria-label="上一张"
          style={{ position: 'absolute', left: 'clamp(8px,3vw,32px)', top: '50%', transform: 'translateY(-50%)', zIndex: 5, minWidth: '48px', minHeight: '48px', background: 'none', border: 0, color: 'rgba(255,255,255,0.5)', fontSize: '32px', cursor: 'pointer' }}>‹</button>
        <button onClick={next} aria-label="下一张"
          style={{ position: 'absolute', right: 'clamp(8px,3vw,32px)', top: '50%', transform: 'translateY(-50%)', zIndex: 5, minWidth: '48px', minHeight: '48px', background: 'none', border: 0, color: 'rgba(255,255,255,0.5)', fontSize: '32px', cursor: 'pointer' }}>›</button>
        <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}
          style={{ maxWidth: '92vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <img src={img.src} alt={img.alt} style={{ maxWidth: '100%', maxHeight: '78vh', objectFit: 'contain' }} />
          {img.label && <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '11px', letterSpacing: '0.1em', marginTop: '14px', textAlign: 'center' }}>{img.label} — {i + 1}/{images.length}</p>}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/* ═══════ 01. Works Cover ═══════ */
function WorksCover({ onImageClick }: { onImageClick: (idx: number) => void }) {
  const { ref, inView } = useReveal();
  return (
    <section ref={ref} className="w-full overflow-hidden" style={{ minHeight: '76svh', maxHeight: '920px', background: V.bg }}>
      <motion.div variants={F} initial="hidden" animate={inView ? 'visible' : 'hidden'} transition={{ duration: D, ease: E }}
        className="relative w-full h-full" style={{ minHeight: '76svh', maxHeight: '920px' }}>
        <Img img={coverImage} className="w-full h-full object-cover" loading="eager" onClick={() => onImageClick(0)} />
        <div style={{ position: 'absolute', left: PX, bottom: 'clamp(40px,6vh,72px)', zIndex: 2 }}>
          <motion.p variants={U} initial="hidden" animate={inView ? 'visible' : 'hidden'} transition={{ duration: D, ease: E, delay: 0.2 }}
            style={{ fontSize: '9px', letterSpacing: '0.22em', color: 'rgba(255,255,255,0.6)', marginBottom: '14px' }}>JEWELRY WORKS</motion.p>
          <motion.h1 variants={U} initial="hidden" animate={inView ? 'visible' : 'hidden'} transition={{ duration: D, ease: E, delay: 0.28 }}
            style={{ fontSize: 'clamp(34px,3.5vw,58px)', fontWeight: 400, lineHeight: 1.15, letterSpacing: '0.05em', color: '#fff' }}>珠宝作品</motion.h1>
        </div>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.18), transparent 50%)', pointerEvents: 'none' }} />
      </motion.div>
    </section>
  );
}

/* ═══════ 02. Curatorial Statement ═══════ */
function CuratorialStatement() {
  const { ref, inView } = useReveal();
  return (
    <section ref={ref} className="w-full" style={{ background: V.surface, paddingBlock: 'clamp(90px,12vh,150px)' }}>
      <div className={MX} style={{ maxWidth: '720px', ...SX }}>
        <motion.p variants={U} initial="hidden" animate={inView ? 'visible' : 'hidden'} transition={{ duration: D, ease: E }}
          style={{ fontSize: 'clamp(23px,2.2vw,36px)', lineHeight: 1.65, fontWeight: 400, color: V.text }}>
          以材质、结构与佩戴为线索，<br />呈现海川对当代珠宝的持续表达。
        </motion.p>
        {/* TODO: Replace with verified brand curatorial statement. */}
      </div>
    </section>
  );
}

/* ═══════ 03. Signature Series: 手镯 ═══════ */
function SignatureSeries({ onImageClick }: { onImageClick: (idx: number) => void }) {
  const { ref, inView } = useReveal();
  const s = signatureSeries;
  const idxBase = 1; // cover=0, sig start at 1
  return (
    <section ref={ref} className="w-full" style={{ paddingTop: 'clamp(130px,15vh,180px)', paddingBottom: 'clamp(140px,16vh,200px)', background: V.bg }}>
      {/* ── 第一段：名称 + 主海报 ── */}
      <div className={MX} style={SX}>
        <motion.div variants={U} initial="hidden" animate={inView ? 'visible' : 'hidden'} transition={{ duration: D, ease: E }}
          style={{ marginBottom: 'clamp(48px,6vh,72px)' }}>
          <Label>{s.number} / {s.englishName}</Label>
          <h2 style={{ fontSize: 'clamp(42px,4vw,66px)', fontWeight: 400, lineHeight: 1.15, letterSpacing: '0.04em', color: V.text, marginTop: '12px' }}>{s.name}</h2>
          <p style={{ fontSize: 'clamp(15px,1vw,17px)', lineHeight: 1.85, maxWidth: '480px', color: V.sec, marginTop: '18px' }}>{s.statement}</p>
          {/* TODO: Replace with verified series statement */}
        </motion.div>
      </div>
      <motion.div variants={F} initial="hidden" animate={inView ? 'visible' : 'hidden'} transition={{ duration: D, ease: E, delay: 0.1 }}
        className="w-full overflow-hidden" style={{ height: 'clamp(620px,76vh,880px)' }}>
        <Img img={s.poster} className="w-full h-full object-cover" onClick={() => onImageClick(idxBase)} />
      </motion.div>

      {/* ── 第二段：佩戴图 ── */}
      <div className={MX} style={{ ...SX, marginTop: 'clamp(100px,12vh,150px)' }}>
        <div className="grid grid-cols-12 gap-x-10 items-end">
          <div className="col-span-12 md:col-span-5" style={{ marginBottom: 'clamp(20px,3vh,40px)' }}>
            <motion.div variants={U} initial="hidden" animate={inView ? 'visible' : 'hidden'} transition={{ duration: D, ease: E, delay: 0.2 }}>
              <p style={{ fontSize: '9px', letterSpacing: '0.18em', color: V.acc, marginBottom: '10px' }}>ON BODY</p>
              <p style={{ fontSize: 'clamp(14px,1vw,16px)', lineHeight: 1.7, color: V.sec, maxWidth: '300px' }}>珠宝与身体、服装和动作的关系。</p>
            </motion.div>
          </div>
          <div className="col-span-12 md:col-span-7">
            <motion.div variants={F} initial="hidden" animate={inView ? 'visible' : 'hidden'} transition={{ duration: D, ease: E, delay: 0.2 }}
              className="overflow-hidden">
              <div style={{ aspectRatio: '3/2' }}><Img img={s.model} className="w-full h-full object-cover" onClick={() => onImageClick(idxBase + 1)} /></div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* ── 第三段：静物 + 细节 ── */}
      <div className={MX} style={{ ...SX, marginTop: 'clamp(80px,10vh,130px)' }}>
        <div className="grid grid-cols-12 gap-x-10 items-start">
          <div className="col-span-12 md:col-span-7">
            <motion.div variants={F} initial="hidden" animate={inView ? 'visible' : 'hidden'} transition={{ duration: D, ease: E, delay: 0.2 }}
              className="overflow-hidden"><div style={{ aspectRatio: '3/2' }}><Img img={s.still} className="w-full h-full object-cover" onClick={() => onImageClick(idxBase + 2)} /></div></motion.div>
          </div>
          <div className="col-span-12 md:col-span-5" style={{ marginTop: 'clamp(30px,4vh,0px)' }}>
            <motion.div variants={F} initial="hidden" animate={inView ? 'visible' : 'hidden'} transition={{ duration: D, ease: E, delay: 0.3 }}
              className="overflow-hidden"><div style={{ aspectRatio: '4/5', maxHeight: '500px' }}><Img img={s.detail} className="w-full h-full object-cover" onClick={() => onImageClick(idxBase + 3)} /></div></motion.div>
            <motion.p variants={U} initial="hidden" animate={inView ? 'visible' : 'hidden'} transition={{ duration: D, ease: E, delay: 0.4 }}
              style={{ fontSize: '10px', letterSpacing: '0.14em', color: V.sec, marginTop: '14px' }}>錾刻细节 — 金工纹理</motion.p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════ 04. Secondary Series 1: 吊坠 ═══════ */
function SecondarySeries1({ onImageClick }: { onImageClick: (idx: number) => void }) {
  const { ref, inView } = useReveal();
  const s = secondarySeries1;
  const idxBase = 5;
  return (
    <section ref={ref} className="w-full" style={{ paddingTop: 'clamp(120px,14vh,160px)', paddingBottom: 'clamp(120px,14vh,160px)', background: V.surface }}>
      <div className={MX} style={SX}>
        <div className="grid grid-cols-12 gap-x-10 items-start">
          <div className="col-span-12 md:col-span-5">
            <motion.div variants={F} initial="hidden" animate={inView ? 'visible' : 'hidden'} transition={{ duration: D, ease: E }}
              className="overflow-hidden"><div style={{ aspectRatio: '3/4', maxHeight: '720px' }}><Img img={s.poster} className="w-full h-full object-cover" onClick={() => onImageClick(idxBase)} /></div></motion.div>
          </div>
          <div className="col-span-12 md:col-span-7" style={{ marginTop: 'clamp(40px,6vh,0px)' }}>
            <motion.div variants={U} initial="hidden" animate={inView ? 'visible' : 'hidden'} transition={{ duration: D, ease: E, delay: 0.15 }}
              style={{ marginBottom: 'clamp(40px,5vh,60px)' }}>
              <Label>{s.number} / {s.englishName}</Label>
              <h3 style={{ fontSize: 'clamp(36px,3.2vw,52px)', fontWeight: 400, lineHeight: 1.18, letterSpacing: '0.04em', color: V.text, marginTop: '10px' }}>{s.name}</h3>
              <p style={{ fontSize: 'clamp(14px,1vw,16px)', lineHeight: 1.85, maxWidth: '400px', color: V.sec, marginTop: '14px' }}>{s.statement}</p>
            </motion.div>
            <motion.div variants={F} initial="hidden" animate={inView ? 'visible' : 'hidden'} transition={{ duration: D, ease: E, delay: 0.25 }}
              className="overflow-hidden"><div style={{ aspectRatio: '3/2', maxHeight: '420px' }}><Img img={s.secondary} className="w-full h-full object-cover" onClick={() => onImageClick(idxBase + 1)} /></div></motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════ 05. Secondary Series 2: 戒指 ═══════ */
function SecondarySeries2({ onImageClick }: { onImageClick: (idx: number) => void }) {
  const { ref, inView } = useReveal();
  const s = secondarySeries2;
  const idxBase = 7;
  return (
    <section ref={ref} className="w-full" style={{ paddingTop: 'clamp(120px,14vh,160px)', paddingBottom: 'clamp(120px,14vh,160px)', background: V.bg }}>
      <div className={MX} style={SX}>
        <motion.div variants={U} initial="hidden" animate={inView ? 'visible' : 'hidden'} transition={{ duration: D, ease: E }}
          style={{ marginBottom: 'clamp(48px,6vh,72px)' }}>
          <Label>{s.number} / {s.englishName}</Label>
          <h3 style={{ fontSize: 'clamp(36px,3.2vw,52px)', fontWeight: 400, lineHeight: 1.18, letterSpacing: '0.04em', color: V.text, marginTop: '10px' }}>{s.name}</h3>
          <p style={{ fontSize: 'clamp(14px,1vw,16px)', lineHeight: 1.85, maxWidth: '400px', color: V.sec, marginTop: '14px' }}>{s.statement}</p>
        </motion.div>
        <div className="grid grid-cols-12 gap-x-10 items-start">
          <div className="col-span-12 md:col-span-8">
            <motion.div variants={F} initial="hidden" animate={inView ? 'visible' : 'hidden'} transition={{ duration: D, ease: E, delay: 0.1 }}
              className="overflow-hidden"><div style={{ aspectRatio: '4/5', maxHeight: '680px' }}><Img img={s.poster} className="w-full h-full object-cover" onClick={() => onImageClick(idxBase)} /></div></motion.div>
          </div>
          <div className="col-span-12 md:col-span-4" style={{ marginTop: 'clamp(30px,4vh,0px)', display: 'flex', flexDirection: 'column', gap: 'clamp(24px,3vw,40px)' }}>
            <motion.div variants={F} initial="hidden" animate={inView ? 'visible' : 'hidden'} transition={{ duration: D, ease: E, delay: 0.2 }}
              className="overflow-hidden"><div style={{ aspectRatio: '3/2' }}><Img img={s.detail1} className="w-full h-full object-cover" onClick={() => onImageClick(idxBase + 1)} /></div></motion.div>
            <motion.div variants={F} initial="hidden" animate={inView ? 'visible' : 'hidden'} transition={{ duration: D, ease: E, delay: 0.28 }}
              className="overflow-hidden"><div style={{ aspectRatio: '4/5' }}><Img img={s.detail2} className="w-full h-full object-cover" onClick={() => onImageClick(idxBase + 2)} /></div></motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════ 06. Object Studies ═══════ */
function ObjectStudies({ onImageClick }: { onImageClick: (idx: number) => void }) {
  const { ref, inView } = useReveal();
  const idxBase = 10;
  return (
    <section ref={ref} className="w-full" style={{ paddingTop: 'clamp(120px,14vh,160px)', paddingBottom: 'clamp(130px,15vh,180px)', background: V.surface }}>
      <div className={MX} style={SX}>
        <motion.div variants={U} initial="hidden" animate={inView ? 'visible' : 'hidden'} transition={{ duration: D, ease: E }}
          style={{ marginBottom: 'clamp(56px,7vh,88px)' }}>
          <Label>OBJECT STUDIES</Label>
          <h3 style={{ fontSize: 'clamp(36px,3.2vw,52px)', fontWeight: 400, lineHeight: 1.18, letterSpacing: '0.04em', color: V.text, marginTop: '10px' }}>珠宝形态</h3>
          <p style={{ fontSize: 'clamp(14px,1vw,16px)', lineHeight: 1.85, maxWidth: '440px', color: V.sec, marginTop: '12px' }}>轮廓、结构、镶嵌与金属表面 — 珠宝在光线下的形态研究。</p>
        </motion.div>
        <div className="grid grid-cols-12 gap-x-8 gap-y-8 items-start">
          <div className="col-span-12 md:col-span-7">
            <motion.div variants={F} initial="hidden" animate={inView ? 'visible' : 'hidden'} transition={{ duration: D, ease: E, delay: 0.1 }}
              className="overflow-hidden"><div style={{ aspectRatio: '3/2' }}><Img img={objectStudies[0]} className="w-full h-full object-cover" onClick={() => onImageClick(idxBase)} /></div></motion.div>
          </div>
          <div className="col-span-12 md:col-span-5" style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(24px,3vw,36px)' }}>
            <motion.div variants={F} initial="hidden" animate={inView ? 'visible' : 'hidden'} transition={{ duration: D, ease: E, delay: 0.2 }}
              className="overflow-hidden"><div style={{ aspectRatio: '4/5' }}><Img img={objectStudies[1]} className="w-full h-full object-cover" onClick={() => onImageClick(idxBase + 1)} /></div></motion.div>
          </div>
          <div className="col-span-12 md:col-span-5">
            <motion.div variants={F} initial="hidden" animate={inView ? 'visible' : 'hidden'} transition={{ duration: D, ease: E, delay: 0.3 }}
              className="overflow-hidden"><div style={{ aspectRatio: '3/4' }}><Img img={objectStudies[2]} className="w-full h-full object-cover" onClick={() => onImageClick(idxBase + 2)} /></div></motion.div>
          </div>
          <div className="col-span-12 md:col-span-7">
            <motion.div variants={F} initial="hidden" animate={inView ? 'visible' : 'hidden'} transition={{ duration: D, ease: E, delay: 0.35 }}
              className="overflow-hidden"><div style={{ aspectRatio: '3/2' }}><Img img={objectStudies[3]} className="w-full h-full object-cover" onClick={() => onImageClick(idxBase + 3)} /></div></motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════ 07. Campaign Archive ═══════ */
function CampaignArchive({ onImageClick }: { onImageClick: (idx: number) => void }) {
  const { ref, inView } = useReveal();
  const idxBase = 14;
  return (
    <section ref={ref} className="w-full" style={{ paddingTop: 'clamp(110px,13vh,150px)', paddingBottom: 'clamp(130px,15vh,180px)', background: V.bg }}>
      <div className={MX} style={SX}>
        <motion.div variants={U} initial="hidden" animate={inView ? 'visible' : 'hidden'} transition={{ duration: D, ease: E }}
          style={{ marginBottom: 'clamp(56px,7vh,88px)' }}>
          <Label>CAMPAIGN ARCHIVE</Label>
          <h3 style={{ fontSize: 'clamp(36px,3.2vw,52px)', fontWeight: 400, lineHeight: 1.18, letterSpacing: '0.04em', color: V.text, marginTop: '10px' }}>系列视觉档案</h3>
        </motion.div>
        {campaignArchive.map((item, i) => (
          <motion.div key={item.id} variants={U} initial="hidden" animate={inView ? 'visible' : 'hidden'} transition={{ duration: D, ease: E, delay: 0.12 + i * 0.08 }}
            style={{ marginBottom: i < campaignArchive.length - 1 ? 'clamp(80px,9vh,120px)' : 0 }}>
            <div className="overflow-hidden" style={{ height: 'clamp(42svh,50svh,58svh)' }}>
              <Img img={item.image} className="w-full h-full object-cover" onClick={() => onImageClick(idxBase + i)} />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px', marginTop: '18px' }}>
              <span style={{ fontSize: '9px', letterSpacing: '0.14em', color: V.acc }}>{item.number}</span>
              <span style={{ fontSize: 'clamp(18px,1.5vw,26px)', fontWeight: 400, color: V.text }}>{item.name}</span>
              <span style={{ fontSize: '9px', letterSpacing: '0.12em', color: V.sec }}>{item.englishName}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/* ═══════ 08. Works Closing ═══════ */
function WorksClosing() {
  const { ref, inView } = useReveal('-40px 0px');
  return (
    <section ref={ref} className="w-full" style={{ paddingTop: 'clamp(130px,15vh,180px)', paddingBottom: 'clamp(90px,11vh,140px)', background: V.surface }}>
      <div className={MX} style={SX}>
        <div className="flex flex-col md:flex-row items-center" style={{ gap: 'clamp(48px,6vw,80px)' }}>
          <motion.div variants={F} initial="hidden" animate={inView ? 'visible' : 'hidden'} transition={{ duration: D, ease: E }}
            className="overflow-hidden flex-shrink-0" style={{ width: 'clamp(260px,32vw,440px)' }}>
            <div style={{ aspectRatio: '3/4', maxHeight: '560px' }}><Img img={closingImage} className="w-full h-full object-cover" /></div>
          </motion.div>
          <motion.div variants={U} initial="hidden" animate={inView ? 'visible' : 'hidden'} transition={{ duration: D, ease: E, delay: 0.2 }}>
            <p style={{ fontSize: '9px', letterSpacing: '0.22em', color: V.acc, marginBottom: '18px' }}>HAICHUAN JEWELRY</p>
            <p style={{ fontSize: 'clamp(16px,1.2vw,20px)', lineHeight: 1.85, color: V.sec, maxWidth: '400px', marginBottom: '32px' }}>
              珠宝作品，是材质、线条与佩戴之间的表达。
            </p>
            {/* TODO: Replace with final closing copy */}
            <Link to="/catalog" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: V.sec, fontSize: '11px', letterSpacing: '0.1em', textDecoration: 'none', minHeight: '44px', transition: 'color 280ms' }}
              onMouseEnter={e => e.currentTarget.style.color = V.text} onMouseLeave={e => e.currentTarget.style.color = V.sec}>
              寻找具体款式 → 选款中心
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* ═══════ 主组件 ═══════ */
export default function ProductList() {
  const [lightbox, setLightbox] = useState<number | null>(null);
  const open = useCallback((idx: number) => setLightbox(idx), []);
  const close = useCallback(() => setLightbox(null), []);

  return (
    <div style={{ background: V.bg, overflowX: 'hidden' }}>
      <WorksCover onImageClick={open} />
      <CuratorialStatement />
      <SignatureSeries onImageClick={open} />
      <SecondarySeries1 onImageClick={open} />
      <SecondarySeries2 onImageClick={open} />
      <ObjectStudies onImageClick={open} />
      <CampaignArchive onImageClick={open} />
      <WorksClosing />
      {lightbox !== null && <Lightbox images={allGalleryImages} index={lightbox} onClose={close} />}
    </div>
  );
}
