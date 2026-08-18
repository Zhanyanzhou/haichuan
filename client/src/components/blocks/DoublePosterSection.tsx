import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import BlockEmptyPlaceholder from "@/components/blocks/_shared/BlockEmptyPlaceholder";
import { IMAGE_SPECS } from "@/page-builder/config/imageSpecs";
import type { PageModule } from '@/types/pageModule';
import { resolveLinkTargetUrl } from '@/page-builder/utils/linkTarget';
import { DesignSystemStyles } from '@/page-builder/designSystem/sectionShell';
import { FONT_DISPLAY, FONT_SANS } from '@/page-builder/designSystem/tokens';
import {
  CONTENT_TEMPLATE_LAYOUTS,
  ContentTemplateLayoutStyles,
  templateLayoutVars,
} from '@/page-builder/layout/contentTemplateLayouts';

const SF = '#F8F6F1';
const TX = '#28231F';
const MU = 'rgba(40,35,31,0.58)';

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

/** 双图文 — 主图优先、细节图从属的不可拆分编辑式骨架。 */
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
  const actionText = typeof c?.actionText === "string" ? c.actionText : "";
  const linkUrl = c?.linkUrl ?? defaults.href;
  const targetUrl = resolveLinkTargetUrl({ targetType: c?.targetType, productId: c?.productId, linkUrl });

  return (
    <section
      ref={ref}
      className="hc-content-template hc-double-poster hc-section"
      data-content-template={CONTENT_TEMPLATE_LAYOUTS.doublePoster.key}
      data-visual-role={CONTENT_TEMPLATE_LAYOUTS.doublePoster.visualRole}
      data-height-mode-desktop={CONTENT_TEMPLATE_LAYOUTS.doublePoster.heightModeByViewport.desktop}
      data-height-mode-tablet={CONTENT_TEMPLATE_LAYOUTS.doublePoster.heightModeByViewport.tablet}
      data-height-mode-mobile={CONTENT_TEMPLATE_LAYOUTS.doublePoster.heightModeByViewport.mobile}
      data-mobile-order={CONTENT_TEMPLATE_LAYOUTS.doublePoster.mobile.order.join(",")}
      data-density="brand"
      data-spacing="normal"
      data-flow={CONTENT_TEMPLATE_LAYOUTS.doublePoster.flow}
      style={{
        background: s?.bgColor || SF,
        outline: editMode ? '2px solid rgba(184,148,78,0.6)' : undefined,
        outlineOffset: -2,
        position: 'relative' as const,
        ...templateLayoutVars(CONTENT_TEMPLATE_LAYOUTS.doublePoster),
      }}
    >
      <DesignSystemStyles />
      <ContentTemplateLayoutStyles />
      {editMode && (
        <div style={{ position: 'absolute', top: 8, right: 12, zIndex: 10, background: '#B8944E', color: '#fff', fontSize: 10, padding: '2px 8px', letterSpacing: '0.04em' }}>
          可编辑 · 双图文
        </div>
      )}
      <div className="hc-content-template__container hc-phase1-double">
        <div data-editor-field="mainImage" className="hc-content-template__media hc-phase1-double__main" style={{
            background: '#E4E3DF',
            opacity: rm || visible ? 1 : 0,
            transform: rm || visible ? 'translateY(0)' : 'translateY(18px)',
            transition: 'opacity 0.9s 0.05s ease, transform 0.9s 0.05s ease',
          }}>
            {mainImg ? (
              <EditorialImage src={mainImg} alt={c?.mainAltText || ""} focusX={s?.mainFocusX ?? 50} focusY={s?.mainFocusY ?? 50} />
            ) : (
              <MissingImageSlot field="mainImage" label="主海报" spec={IMAGE_SPECS.doublePoster.main.label} height="100%" />
            )}
        </div>
        {detailImg || editMode ? (
          <div
            data-editor-field="detailImage"
            className="hc-content-template__media hc-phase1-double__detail"
            style={{ background: '#E4E3DF' }}
          >
            {detailImg ? (
              <EditorialImage src={detailImg} alt={c?.detailAltText || ""} focusX={s?.detailFocusX ?? 50} focusY={s?.detailFocusY ?? 50} />
            ) : (
              <MissingImageSlot field="detailImage" label="细节海报" spec={IMAGE_SPECS.doublePoster.detail.label} height="100%" />
            )}
          </div>
        ) : null}
        <div className="hc-content-template__copy hc-phase1-double__copy">
          {(number || label) ? (
            <p data-editor-field="number label" className="hc-content-template__eyebrow" style={{ color: MU, fontFamily: `var(--hc-font-sans, ${FONT_SANS})` }}>
              {[number, label].filter(Boolean).join(" / ")}
            </p>
          ) : null}
          {title ? (
            <h2 data-editor-field="title" className="hc-content-template__title"
              style={{ fontFamily: `var(--hc-font-display, ${FONT_DISPLAY})`, fontSize: 'var(--hc-type-h3, clamp(22px,2.2vw,32px))', color: TX }}>{title}</h2>
          ) : null}
          {description ? (
            <p data-editor-field="description" className="hc-content-template__body" style={{ color: MU }}>{description}</p>
          ) : null}
        </div>
        {actionText && targetUrl ? (
          editMode ? (
            <span data-editor-field="actionText linkUrl productId" className="hc-content-template__action hc-phase1-double__action" style={{ color: TX }}>
              {actionText} <span>→</span>
            </span>
          ) : (
            <Link data-editor-field="actionText linkUrl productId" to={targetUrl} className="hc-content-template__action hc-phase1-double__action transition-opacity hover:opacity-55" style={{ color: TX }}>
              {actionText} <span>→</span>
            </Link>
          )
        ) : null}
      </div>
    </section>
  );
}
