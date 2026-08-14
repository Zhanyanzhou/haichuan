import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import BlockEmptyPlaceholder from "@/components/blocks/_shared/BlockEmptyPlaceholder";
import type { PageModule } from '@/types/pageModule';
import { resolveLinkTargetUrl } from '@/page-builder/utils/linkTarget';
import { DOUBLE_POSTER_CONTRACT } from '@/page-builder/config/blockContracts';
import { DesignSystemStyles } from '@/page-builder/designSystem/sectionShell';
import { FONT_DISPLAY, FONT_SANS } from '@/page-builder/designSystem/tokens';

const SF = '#F8F6F1';
const TX = '#28231F';
const MU = 'rgba(40,35,31,0.58)';
const PAD = 'clamp(24px,5vw,80px)';

interface Props { module?: PageModule; editMode?: boolean; }

function MissingImageSlot({
  field,
  label,
  spec,
  height,
}: {
  field: string;
  label: string;
  spec: string;
  height: string;
}) {
  return (
    <div data-editor-field={field} style={{ height }}>
      <BlockEmptyPlaceholder hint={`${label}待上传`} spec={spec} height="100%" />
    </div>
  );
}

function EditorialImage({
  src,
  alt,
  focusX,
  focusY,
}: {
  src: string;
  alt: string;
  focusX: number;
  focusY: number;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (failed) {
    return (
      <div className="grid h-full w-full place-items-center text-xs tracking-[.08em]" role="img" aria-label={alt || "图片暂不可用"} style={{ color: '#7E7468', background: 'linear-gradient(135deg,#EDE6DC,#D9CDBD)' }}>
        图片暂不可用
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className="h-full w-full object-cover"
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      style={{ objectPosition: `${focusX}% ${focusY}%` }}
    />
  );
}

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

  const defaults = { number: "", label: "", title: "", description: "", href: "" };
  const c = module?.content as (PageModule['content'] & Record<string, any>) | undefined;
  const s = module?.styleConfig as (PageModule['styleConfig'] & Record<string, any>) | undefined;
  const l = module?.layoutConfig as (PageModule['layoutConfig'] & Record<string, any>) | undefined;

  // 双图海报的两个字段表达固定版式角色，绝不再借用桌面/移动端字段。
  const mainImage = c?.mainImage;
  const detailImage = c?.detailImage;
  // P1-43：公开态主图缺失则整块不渲染（对齐 HeroSection），不兜底陌生营销图；编辑态单图缺失用 MissingImageSlot 局部占位
  if (!editMode && !mainImage) return null;
  const mainImg = mainImage || "";
  const detailImg = detailImage || "";
  const number = c?.number ?? defaults.number;
  const label = c?.label ?? defaults.label;
  const title = c?.title ?? defaults.title;
  const description = c?.description ?? defaults.description;
  const actionText = c?.actionText ?? "查看系列";
  const linkUrl = c?.linkUrl ?? defaults.href;
  const targetUrl = resolveLinkTargetUrl({ targetType: c?.targetType, productId: c?.productId, linkUrl });
  const mainLeft = l?.template !== "mainRight";

  return (
    <section
      ref={ref}
      className="hc-double-poster hc-section"
      data-layout={mainLeft ? "mainLeft" : "mainRight"}
      data-density="brand"
      data-flow="flow"
      style={{
        padding: 'clamp(72px,10vw,140px) 0 clamp(88px,11vw,160px)',
        background: s?.bgColor || SF,
        outline: editMode ? '2px solid rgba(184,148,78,0.6)' : undefined,
        outlineOffset: -2,
        position: 'relative' as const,
      }}
    >
      <DesignSystemStyles />
      {editMode && (
        <div style={{ position: 'absolute', top: 8, right: 12, zIndex: 10, background: '#B8944E', color: '#fff', fontSize: 10, padding: '2px 8px', letterSpacing: '0.04em' }}>
          可编辑 · 双海报
        </div>
      )}
      <div className="grid grid-cols-12 gap-x-6 max-w-[1520px] mx-auto" style={{ padding: `0 ${PAD}` }}>
        <div className="hc-double-poster__main col-span-12 md:col-span-8">
          <div data-editor-field="mainImage" className="overflow-hidden" style={{
            aspectRatio: DOUBLE_POSTER_CONTRACT.canvas.mainMediaAspectRatio,
            background: '#E7DDCE',
            opacity: rm || visible ? 1 : 0,
            transform: rm || visible ? 'translateY(0)' : 'translateY(18px)',
            transition: 'opacity 0.9s 0.05s ease, transform 0.9s 0.05s ease',
          }}>
            {mainImg ? (
              <EditorialImage src={mainImg} alt={c?.mainAltText || ""} focusX={s?.mainFocusX ?? 50} focusY={s?.mainFocusY ?? 50} />
            ) : (
              <MissingImageSlot field="mainImage" label="主海报" spec="建议 2400×1600（3:2）" height="100%" />
            )}
          </div>
        </div>
        <div className="hc-double-poster__detail col-span-12 mt-10 md:col-span-4 md:mt-[12%]">
          {detailImg || editMode ? (
            <div
              data-editor-field="detailImage"
              className="overflow-hidden"
              style={{ aspectRatio: DOUBLE_POSTER_CONTRACT.canvas.detailMediaAspectRatio, background: '#E7DDCE' }}
            >
              {detailImg ? (
                <EditorialImage src={detailImg} alt={c?.detailAltText || ""} focusX={s?.detailFocusX ?? 50} focusY={s?.detailFocusY ?? 50} />
              ) : (
                <MissingImageSlot field="detailImage" label="细节海报" spec="建议 1280×1600（4:5）" height="100%" />
              )}
            </div>
          ) : null}
          <div className="mt-6">
            <p data-editor-field="number label" className="text-[10px] tracking-[.2em] uppercase mb-2" style={{ color: MU, fontFamily: `var(--hc-font-sans, ${FONT_SANS})` }}>{number} / {label}</p>
            <h2 data-editor-field="title" className="leading-[1.12] tracking-[.02em] mb-1"
              style={{ fontFamily: `var(--hc-font-display, ${FONT_DISPLAY})`, fontSize: 'var(--hc-type-h3, clamp(22px,2.2vw,32px))', color: TX }}>{title}</h2>
            <p data-editor-field="description" className="text-sm mb-4 max-w-[240px]" style={{ color: MU }}>{description}</p>
            {actionText && targetUrl ? (
              editMode ? (
                <span data-editor-field="actionText linkUrl productId" className="inline-flex items-center gap-2 text-[10px] tracking-[.14em] uppercase font-sans" style={{ color: TX }}>
                  {actionText} <span>→</span>
                </span>
              ) : (
                <Link data-editor-field="actionText linkUrl productId" to={targetUrl} className="inline-flex items-center gap-2 text-[10px] tracking-[.14em] uppercase transition-opacity hover:opacity-55 font-sans" style={{ color: TX }}>
                  {actionText} <span>→</span>
                </Link>
              )
            ) : null}
          </div>
        </div>
      </div>
      <style>{`
        .hc-double-poster__main { order: 1; }
        .hc-double-poster__detail { order: 2; }
        @media (min-width: 768px) {
          .hc-double-poster[data-layout="mainRight"] .hc-double-poster__main { order: 2; }
          .hc-double-poster[data-layout="mainRight"] .hc-double-poster__detail { order: 1; }
        }
      `}</style>
    </section>
  );
}
