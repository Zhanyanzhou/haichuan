import { Link } from 'react-router-dom';
import { SecureImage } from '@/components/common/SecureImage';
import { isSafeInternalPath, resolveLinkTargetUrl } from '@/page-builder/utils/linkTarget';
import { DesignSystemStyles } from '@/page-builder/designSystem/sectionShell';
import EditCopyPlaceholder from '@/components/blocks/_shared/EditCopyPlaceholder';
import { FONT_DISPLAY, FONT_SANS } from '@/page-builder/designSystem/tokens';

interface AppointmentBlockProps {
  module: { content: Record<string, any>; layoutConfig?: Record<string, any>; styleConfig?: Record<string, any> };
  editMode?: boolean;
}

/**
 * 预约尾章 — Conversion 母版
 * schema v2 页面尾章：内容高度、唯一主行动、可选次级联系方式；不承载表单。
 * 背景图仅是可选氛围层，不参与根角色顺序。
 */
export default function AppointmentBlock({ module, editMode }: AppointmentBlockProps) {
  const { content = {}, layoutConfig = {}, styleConfig = {} } = module;
  const { backgroundImage, title, subtitle, buttonText, phone, altText } = content;
  const tone = 'ivory'; // 白盒画册(2026-08-19):废除 dark 深色档,统一亮调
  const bgColor = '#FFFFFF';
  const textColor = tone === 'ivory' ? '#222222' : '#FFFFFF';
  const mutedColor = tone === 'ivory' ? '#66645F' : 'rgba(255,255,255,0.78)';
  // 双端独立焦点;旧数据共享 focusX/Y 自动回退
  const desktopFocusX = Math.min(100, Math.max(0, Number(styleConfig.desktopFocusX ?? styleConfig.focusX ?? 50)));
  const desktopFocusY = Math.min(100, Math.max(0, Number(styleConfig.desktopFocusY ?? styleConfig.focusY ?? 50)));
  const mobileFocusX = Math.min(100, Math.max(0, Number(styleConfig.mobileFocusX ?? styleConfig.focusX ?? 50)));
  const mobileFocusY = Math.min(100, Math.max(0, Number(styleConfig.mobileFocusY ?? styleConfig.focusY ?? 50)));
  // 跳转三件套优先,旧草稿裸 linkUrl 字段兜底
  const targetUrl =
    resolveLinkTargetUrl({
      targetType: content.targetType,
      productId: content.productId,
      linkUrl: content.linkUrl,
    }) || (isSafeInternalPath(content.linkUrl) ? content.linkUrl : '');
  const phoneHref = typeof phone === 'string' ? phone.replace(/[^\d+]/g, '') : '';

  if (!title && !editMode) return null;

  return (
    <section
      className="hc-appointment hc-section"
      data-flow="bleed"
      data-density="brand"
      style={{
        '--ap-focus-d': `${desktopFocusX}% ${desktopFocusY}%`,
        '--ap-focus-m': `${mobileFocusX}% ${mobileFocusY}%`,
      } as React.CSSProperties}
    >
      <DesignSystemStyles />
      <style>{`
        .hc-appointment {
          position: relative;
          width: 100%;
          min-height: clamp(360px, 48vh, 560px);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          background: ${bgColor};
        }
        .hc-appointment__bg {
          position: absolute; inset: 0; width: 100%; height: 100%;
          object-fit: cover; object-position: var(--ap-focus-d);
        }
        .hc-appointment__veil { position: absolute; inset: 0; }
        .hc-appointment__content { position: relative; z-index: 1; width: min(calc(100% - 40px), 640px); padding: 72px 0; text-align: center; }
        .hc-appointment__actions { display: grid; justify-items: center; gap: 18px; }
        .hc-appointment__contact { color: inherit; text-underline-offset: 6px; }
        @media (max-width: 767px) {
          .hc-appointment { min-height: 0; }
          .hc-appointment__content { padding: 64px 0; }
          .hc-appointment__bg { object-position: var(--ap-focus-m); }
        }
      `}</style>
      {backgroundImage ? (
        <SecureImage
          className="hc-appointment__bg"
          src={backgroundImage}
          alt={altText || title || '预约咨询背景'}
          style={{ opacity: tone === 'ivory' ? 0.2 : 0.42 }}
        />
      ) : null}
      {backgroundImage ? (
        <div className="hc-appointment__veil" style={{ background: tone === 'ivory' ? 'rgba(244,239,231,.55)' : 'rgba(15,13,12,.24)' }} />
      ) : null}
      <div className="hc-appointment__content" data-content-role="copy">
        {title ? (
          <h2 data-editor-field="title" style={{ fontSize: 'var(--hc-type-h2, clamp(30px,3.2vw,44px))', fontFamily: `var(--hc-font-display, ${FONT_DISPLAY})`, color: textColor, marginBottom: 14, lineHeight: 1.2, fontWeight: 500 }}>
            {title}
          </h2>
        ) : editMode ? (
          <EditCopyPlaceholder variant="title" label="标题" block />
        ) : null}
        {subtitle ? (
          <p data-editor-field="subtitle" style={{ fontSize: 'var(--hc-type-body, 14px)', color: mutedColor, lineHeight: 1.8, marginBottom: 28 }}>
            {subtitle}
          </p>
        ) : editMode ? (
          <EditCopyPlaceholder variant="body" label="副文" block />
        ) : null}
        <div className="hc-appointment__actions">
          {buttonText && targetUrl ? editMode ? (
            <span data-content-role="primaryAction" data-editor-field="buttonText linkUrl" style={{ display: 'inline-block', paddingBottom: 6, borderBottom: '1px solid #1A1A1A', color: '#1A1A1A', fontSize: 'var(--hc-type-caption, 12px)', letterSpacing: '0.14em' }}>{buttonText}</span>
          ) : (
            <Link data-content-role="primaryAction" data-editor-field="buttonText linkUrl" to={targetUrl} style={{ display: 'inline-block', paddingBottom: 6, borderBottom: '1px solid #1A1A1A', color: '#1A1A1A', fontSize: 'var(--hc-type-caption, 12px)', textDecoration: 'none', letterSpacing: '0.14em' }}>{buttonText}</Link>
          ) : null}
          {phone && phoneHref ? editMode ? (
            <span className="hc-appointment__contact" data-content-role="secondaryContact" data-editor-field="phone" style={{ fontSize: 'var(--hc-type-caption, 12px)', letterSpacing: '0.08em' }}>{phone}</span>
          ) : (
            <a className="hc-appointment__contact" data-content-role="secondaryContact" data-editor-field="phone" href={`tel:${phoneHref}`} style={{ color: textColor, fontSize: 'var(--hc-type-caption, 12px)', letterSpacing: '0.08em', fontFamily: `var(--hc-font-sans, ${FONT_SANS})` }}>{phone}</a>
          ) : null}
        </div>
      </div>
    </section>
  );
}
