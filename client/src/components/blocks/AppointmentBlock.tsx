import { Link } from 'react-router-dom';
import { SecureImage } from '@/components/common/SecureImage';
import { isSafeInternalPath, resolveLinkTargetUrl } from '@/page-builder/utils/linkTarget';
import { DesignSystemStyles } from '@/page-builder/designSystem/sectionShell';
import { FONT_DISPLAY, FONT_SANS } from '@/page-builder/designSystem/tokens';

interface AppointmentBlockProps {
  module: { content: Record<string, any>; layoutConfig?: Record<string, any>; styleConfig?: Record<string, any> };
  editMode?: boolean;
}

/**
 * 预约尾章 — Conversion 母版
 * schema v3 页面尾章：内容高度、唯一主行动、可选次级联系方式；不承载表单。
 * 背景图仅是可选氛围层，不参与根角色顺序。
 */
export default function AppointmentBlock({ module, editMode }: AppointmentBlockProps) {
  const { content = {}, layoutConfig = {}, styleConfig = {} } = module;
  const { backgroundImage, title, subtitle, buttonText, phone, altText } = content;
  const bgColor = '#FFFFFF';
  const textColor = '#181A1B';
  const mutedColor = '#5F6568';
  // 双端独立焦点;旧数据共享 focusX/Y 自动回退
  const desktopFocusX = Math.min(100, Math.max(0, Number(styleConfig.desktopFocusX ?? styleConfig.focusX ?? 50)));
  const desktopFocusY = Math.min(100, Math.max(0, Number(styleConfig.desktopFocusY ?? styleConfig.focusY ?? 50)));
  const mobileFocusX = Math.min(100, Math.max(0, Number(styleConfig.mobileFocusX ?? styleConfig.focusX ?? 50)));
  const mobileFocusY = Math.min(100, Math.max(0, Number(styleConfig.mobileFocusY ?? styleConfig.focusY ?? 50)));
  // 跳转三件套优先,旧草稿裸 linkUrl 字段兜底
  const targetUrl =
    resolveLinkTargetUrl({
      targetType: content.targetType,
      productCode: content.productCode,
      productId: content.productId,
      linkUrl: content.linkUrl,
    }) || (isSafeInternalPath(content.linkUrl) ? content.linkUrl : '');
  const normalizedPhone = typeof phone === 'string' ? phone.trim() : '';
  const validPhone = /^\+?[\d\s-]{6,20}$/.test(normalizedPhone);
  const phoneHref = validPhone ? normalizedPhone.replace(/[^\d+]/g, '') : '';

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
        .hc-appointment__bg-slot { position: absolute; inset: 0; overflow: hidden; }
        .hc-appointment__bg-empty {
          position: absolute; z-index: 2; top: 16px; left: 16px;
          min-height: 36px; padding: 8px 12px; border: 1px dashed #6E7477;
          background: #f7f8f8; color: #5F6568; font-size: 12px; cursor: pointer;
        }
        .hc-appointment__content { position: relative; z-index: 1; width: min(calc(100% - 40px), 640px); padding: 72px 40px; text-align: center; background: #FFFFFF; }
        .hc-appointment__actions { display: grid; justify-items: center; gap: 18px; }
        .hc-appointment__contact { color: inherit; text-underline-offset: 6px; }
        @media (max-width: 767px) {
          .hc-appointment { min-height: 0; }
          .hc-appointment__content { padding: 64px 0; }
          .hc-appointment__bg { object-position: var(--ap-focus-m); }
        }
      `}</style>
      {backgroundImage ? (
        <div className="hc-appointment__bg-slot" data-content-role="bgImage" data-editor-field="backgroundImage">
          <SecureImage
            className="hc-appointment__bg"
            src={backgroundImage}
            alt={altText || title || '预约咨询背景'}
            style={{ opacity: 0.32 }}
          />
        </div>
      ) : editMode ? (
        <button type="button" className="hc-appointment__bg-empty" data-content-role="bgImage" data-editor-field="backgroundImage">
          添加可选背景图
        </button>
      ) : null}
      <div className="hc-appointment__content" data-content-role="copy">
        {title || editMode ? (
          <h2 data-editor-field="title" data-hc-editor-placeholder={!title && editMode ? "true" : undefined} style={{ fontSize: 'var(--hc-type-h2, clamp(30px,3.2vw,44px))', fontFamily: `var(--hc-font-display, ${FONT_DISPLAY})`, color: textColor, marginBottom: 14, lineHeight: 1.2, fontWeight: 500 }}>
            {title || '点击添加主标题'}
          </h2>
        ) : null}
        {subtitle || editMode ? (
          <p data-editor-field="subtitle" data-hc-editor-placeholder={!subtitle && editMode ? "true" : undefined} style={{ fontSize: 'var(--hc-type-body, 14px)', color: mutedColor, lineHeight: 1.8, marginBottom: 28 }}>
            {subtitle || '点击添加服务说明'}
          </p>
        ) : null}
        <div className="hc-appointment__actions">
          {editMode ? (
            <span data-content-role="primaryAction" data-editor-field="buttonText linkUrl" data-hc-editor-placeholder={!buttonText ? "true" : undefined} style={{ display: 'inline-block', paddingBottom: 6, borderBottom: '1px solid #181A1B', color: '#181A1B', fontSize: 'var(--hc-type-caption, 12px)', letterSpacing: '0.14em' }}>{buttonText || '点击添加主行动'}</span>
          ) : buttonText && targetUrl ? (
            <Link data-content-role="primaryAction" data-editor-field="buttonText linkUrl" to={targetUrl} style={{ display: 'inline-block', paddingBottom: 6, borderBottom: '1px solid #181A1B', color: '#181A1B', fontSize: 'var(--hc-type-caption, 12px)', textDecoration: 'none', letterSpacing: '0.14em' }}>{buttonText}</Link>
          ) : null}
          {phone && editMode ? (
            <span className="hc-appointment__contact" data-content-role="secondaryContact" data-editor-field="phone" aria-invalid={!validPhone || undefined} style={{ fontSize: 'var(--hc-type-caption, 12px)', letterSpacing: '0.08em' }}>{phone}</span>
          ) : phoneHref ? (
            <a className="hc-appointment__contact" data-content-role="secondaryContact" data-editor-field="phone" href={`tel:${phoneHref}`} style={{ color: textColor, fontSize: 'var(--hc-type-caption, 12px)', letterSpacing: '0.08em', fontFamily: `var(--hc-font-sans, ${FONT_SANS})` }}>{phone}</a>
          ) : null}
        </div>
      </div>
    </section>
  );
}
