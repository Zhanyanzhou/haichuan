import { Link } from 'react-router-dom';
import { SecureImage } from '@/components/common/SecureImage';
import { isSafeInternalPath } from '@/page-builder/utils/linkTarget';
import { APPOINTMENT_CONTRACT } from '@/page-builder/config/blockContracts';
import { DesignSystemStyles } from '@/page-builder/designSystem/sectionShell';
import { FONT_DISPLAY, FONT_SANS } from '@/page-builder/designSystem/tokens';

interface AppointmentBlockProps {
  module: { content: Record<string, any>; layoutConfig?: Record<string, any>; styleConfig?: Record<string, any> };
  editMode?: boolean;
}

/**
 * 预约尾章 — Conversion 母版
 * 桌面 21:6 定比背景带(内容不足时下限 320px 兜底),Mobile 4:3;
 * 1 主 CTA(+可选电话);双端独立焦点(旧数据共享 focusX/Y 回退)。
 */
export default function AppointmentBlock({ module, editMode }: AppointmentBlockProps) {
  const { content = {}, layoutConfig = {}, styleConfig = {} } = module;
  const { backgroundImage, title, subtitle, buttonText, linkUrl, phone, altText } = content;
  const tone = layoutConfig.template === 'ivory' ? 'ivory' : 'dark';
  const bgColor = tone === 'ivory' ? '#F4EFE7' : styleConfig.bgColor || '#1A1714';
  const textColor = tone === 'ivory' ? '#2D2823' : '#FFFFFF';
  const mutedColor = tone === 'ivory' ? '#74695D' : 'rgba(255,255,255,0.78)';
  // 双端独立焦点;旧数据共享 focusX/Y 自动回退
  const desktopFocusX = Math.min(100, Math.max(0, Number(styleConfig.desktopFocusX ?? styleConfig.focusX ?? 50)));
  const desktopFocusY = Math.min(100, Math.max(0, Number(styleConfig.desktopFocusY ?? styleConfig.focusY ?? 50)));
  const mobileFocusX = Math.min(100, Math.max(0, Number(styleConfig.mobileFocusX ?? styleConfig.focusX ?? 50)));
  const mobileFocusY = Math.min(100, Math.max(0, Number(styleConfig.mobileFocusY ?? styleConfig.focusY ?? 50)));
  const targetUrl = isSafeInternalPath(linkUrl) ? linkUrl : '';
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
          aspect-ratio: ${APPOINTMENT_CONTRACT.canvas.backgroundAspectRatio};
          min-height: 320px;
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
        .hc-appointment__content { position: relative; z-index: 1; padding: 48px 24px; text-align: center; max-width: 640px; }
        @media (max-width: 767px) {
          .hc-appointment { aspect-ratio: 4 / 3; min-height: 360px; }
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
      <div className="hc-appointment__content">
        {title && (
          <h2 data-editor-field="title" style={{ fontSize: 'var(--hc-type-h2, clamp(30px,3.2vw,44px))', fontFamily: `var(--hc-font-display, ${FONT_DISPLAY})`, color: textColor, marginBottom: 14, lineHeight: 1.2, fontWeight: 500 }}>
            {title}
          </h2>
        )}
        {subtitle && (
          <p data-editor-field="subtitle" style={{ fontSize: 'var(--hc-type-body, 14px)', color: mutedColor, lineHeight: 1.8, marginBottom: 28 }}>
            {subtitle}
          </p>
        )}
        <div style={{ display: 'inline-flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
          {buttonText && targetUrl ? editMode ? (
            <span data-editor-field="buttonText linkUrl" style={{ display: 'inline-block', padding: '12px 36px', background: '#B8944E', color: '#FFFFFF', fontSize: 'var(--hc-type-caption, 12px)', letterSpacing: '0.14em' }}>{buttonText}</span>
          ) : (
            <Link data-editor-field="buttonText linkUrl" to={targetUrl} style={{ display: 'inline-block', padding: '12px 36px', background: '#B8944E', color: '#FFFFFF', fontSize: 'var(--hc-type-caption, 12px)', textDecoration: 'none', letterSpacing: '0.14em' }}>{buttonText}</Link>
          ) : null}
          {phone && phoneHref ? editMode ? (
            <span data-editor-field="phone" style={{ display: 'inline-block', padding: '11px 35px', border: `1px solid ${tone === 'ivory' ? 'rgba(45,40,35,.35)' : 'rgba(255,255,255,.6)'}`, color: textColor, fontSize: 'var(--hc-type-caption, 12px)', letterSpacing: '0.08em' }}>{phone}</span>
          ) : (
            <a data-editor-field="phone" href={`tel:${phoneHref}`} style={{ display: 'inline-block', padding: '11px 35px', border: `1px solid ${tone === 'ivory' ? 'rgba(45,40,35,.35)' : 'rgba(255,255,255,.6)'}`, color: textColor, fontSize: 'var(--hc-type-caption, 12px)', textDecoration: 'none', letterSpacing: '0.08em', fontFamily: `var(--hc-font-sans, ${FONT_SANS})` }}>{phone}</a>
          ) : null}
        </div>
      </div>
    </section>
  );
}
