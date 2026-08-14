import { Link } from 'react-router-dom';
import { SecureImage } from '@/components/common/SecureImage';
import { isSafeInternalPath } from '@/page-builder/utils/linkTarget';

interface AppointmentBlockProps {
  module: { content: Record<string, any>; layoutConfig?: Record<string, any>; styleConfig?: Record<string, any> };
  editMode?: boolean;
}

/**
 * 预约入口模块 — 品牌背景 + 居中 CTA（预约按钮 + 可选电话咨询）。
 */
export default function AppointmentBlock({ module, editMode }: AppointmentBlockProps) {
  const { content = {}, layoutConfig = {}, styleConfig = {} } = module;
  const { backgroundImage, title, subtitle, buttonText, linkUrl, phone, altText } = content;
  const tone = layoutConfig.template === 'ivory' ? 'ivory' : 'dark';
  const bgColor = tone === 'ivory' ? '#F4EFE7' : styleConfig.bgColor || '#1A1714';
  const textColor = tone === 'ivory' ? '#2D2823' : '#FFFFFF';
  const mutedColor = tone === 'ivory' ? '#74695D' : 'rgba(255,255,255,0.78)';
  const focusX = Math.min(100, Math.max(0, Number(styleConfig.focusX ?? 50)));
  const focusY = Math.min(100, Math.max(0, Number(styleConfig.focusY ?? 50)));
  const targetUrl = isSafeInternalPath(linkUrl) ? linkUrl : '';
  const phoneHref = typeof phone === 'string' ? phone.replace(/[^\d+]/g, '') : '';

  if (!title && !editMode) return null;

  return (
    <section style={{ position: 'relative', minHeight: 380, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: bgColor }}>
      {backgroundImage ? (
        <SecureImage
          src={backgroundImage}
          alt={altText || title || '预约咨询背景'}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${focusX}% ${focusY}%`, opacity: tone === 'ivory' ? 0.2 : 0.42 }}
        />
      ) : null}
      {backgroundImage ? <div style={{ position: 'absolute', inset: 0, background: tone === 'ivory' ? 'rgba(244,239,231,.52)' : 'rgba(15,13,12,.2)' }} /> : null}
      <div style={{ position: 'relative', zIndex: 1, padding: '64px 24px', textAlign: 'center', maxWidth: 640 }}>
        {title && (
          <h2 data-editor-field="title" style={{ fontSize: 'clamp(30px,3.2vw,42px)', fontFamily: '"Cormorant Garamond","Noto Serif SC",serif', color: textColor, marginBottom: 16, lineHeight: 1.2, fontWeight: 500 }}>
            {title}
          </h2>
        )}
        {subtitle && (
          <p data-editor-field="subtitle" style={{ fontSize: 14, color: mutedColor, lineHeight: 1.8, marginBottom: 30 }}>
            {subtitle}
          </p>
        )}
        <div style={{ display: 'inline-flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
          {buttonText && targetUrl ? editMode ? (
            <span data-editor-field="buttonText linkUrl" style={{ display: 'inline-block', padding: '12px 36px', background: '#B8944E', color: '#FFFFFF', fontSize: 12, letterSpacing: '0.14em' }}>{buttonText}</span>
          ) : (
            <Link data-editor-field="buttonText linkUrl" to={targetUrl} style={{ display: 'inline-block', padding: '12px 36px', background: '#B8944E', color: '#FFFFFF', fontSize: 12, textDecoration: 'none', letterSpacing: '0.14em' }}>{buttonText}</Link>
          ) : null}
          {phone && phoneHref ? editMode ? (
            <span data-editor-field="phone" style={{ display: 'inline-block', padding: '11px 35px', border: `1px solid ${tone === 'ivory' ? 'rgba(45,40,35,.35)' : 'rgba(255,255,255,.6)'}`, color: textColor, fontSize: 12, letterSpacing: '0.08em' }}>{phone}</span>
          ) : (
            <a data-editor-field="phone" href={`tel:${phoneHref}`} style={{ display: 'inline-block', padding: '11px 35px', border: `1px solid ${tone === 'ivory' ? 'rgba(45,40,35,.35)' : 'rgba(255,255,255,.6)'}`, color: textColor, fontSize: 12, textDecoration: 'none', letterSpacing: '0.08em' }}>{phone}</a>
          ) : null}
        </div>
      </div>
    </section>
  );
}
