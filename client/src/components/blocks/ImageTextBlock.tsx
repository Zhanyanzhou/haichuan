import { Link } from 'react-router-dom';

interface ImageTextBlockProps {
  module: { content: Record<string, any>; layoutConfig?: Record<string, any>; styleConfig?: Record<string, any> };
  editMode?: boolean;
}

/**
 * 图文混排模块 — 支持左文右图 / 左图右文 / 纯文字 / 图片背景
 */
export default function ImageTextBlock({ module }: ImageTextBlockProps) {
  const { content = {}, layoutConfig = {}, styleConfig = {} } = module;
  const {
    label, title, body, image, imagePosition, buttonText, linkUrl,
  } = content;
  const template = layoutConfig.template || 'textLeftImageRight';
  const spacing = styleConfig.spacing || 'normal';

  const paddingMap: Record<string, string> = { compact: '40px 0', normal: '72px 0', spacious: '100px 0' };

  // 纯文字模式
  if (template === 'textOnly') {
    return (
      <section style={{ padding: paddingMap[spacing], background: '#FBF9F6' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 24px', textAlign: 'center' }}>
          {label && (
            <p data-editor-field="label" style={{ fontSize: 11, letterSpacing: '0.3em', textTransform: 'uppercase', color: '#B8944E', marginBottom: 16 }}>
              {label}
            </p>
          )}
          {title && (
            <h2 data-editor-field="title" style={{ fontSize: 36, fontFamily: '"Cormorant Garamond","Noto Serif SC",serif', color: '#2C2C2C', marginBottom: 24, lineHeight: 1.3 }}>
              {title}
            </h2>
          )}
          {body && (
            <p data-editor-field="body" style={{ fontSize: 15, color: '#8A7F72', lineHeight: 1.8, maxWidth: 560, margin: '0 auto' }}>
              {body}
            </p>
          )}
          {buttonText && linkUrl && (
            <Link data-editor-field="buttonText linkUrl" to={linkUrl}
              style={{ display: 'inline-block', marginTop: 24, padding: '10px 36px', border: '1px solid #B8944E', color: '#B8944E', fontSize: 13, textDecoration: 'none', letterSpacing: '0.15em' }}>
              {buttonText}
            </Link>
          )}
        </div>
      </section>
    );
  }

  // 背景图模式
  if (template === 'imageBackground') {
    return (
      <section style={{ position: 'relative', minHeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: '#2C2C2C' }}>
        {image && (
          <div data-editor-field="image" style={{ position: 'absolute', inset: 0, backgroundImage: `url(${image})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.5 }} />
        )}
        <div style={{ position: 'relative', zIndex: 1, padding: 60, textAlign: 'center', maxWidth: 720 }}>
          {label && <p data-editor-field="label" style={{ fontSize: 11, letterSpacing: '0.3em', color: '#B8944E', marginBottom: 12 }}>{label}</p>}
          {title && <h2 data-editor-field="title" style={{ fontSize: 40, fontFamily: '"Cormorant Garamond","Noto Serif SC",serif', color: '#fff', marginBottom: 20 }}>{title}</h2>}
          {body && <p data-editor-field="body" style={{ fontSize: 15, color: 'rgba(255,255,255,0.8)', lineHeight: 1.7 }}>{body}</p>}
          {buttonText && linkUrl && (
            <Link data-editor-field="buttonText linkUrl" to={linkUrl} style={{ display: 'inline-block', marginTop: 24, padding: '10px 40px', border: '1px solid #B8944E', color: '#B8944E', fontSize: 13, textDecoration: 'none' }}>
              {buttonText}
            </Link>
          )}
        </div>
      </section>
    );
  }

  // 默认：左文右图 / 左图右文
  const isImageLeft = template === 'textRightImageLeft';
  const imageCol = image ? (
    <div data-editor-field="image" className="homepage-image-text__image" style={{ flex: isImageLeft ? '0 0 55%' : '0 0 45%' }}>
      <img src={image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
    </div>
  ) : null;
  const textCol = (
    <div className="homepage-image-text__copy" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 40px' }}>
      <div style={{ maxWidth: 440 }}>
        {label && <p data-editor-field="label" style={{ fontSize: 11, letterSpacing: '0.3em', textTransform: 'uppercase', color: '#B8944E', marginBottom: 16 }}>{label}</p>}
        {title && <h2 data-editor-field="title" style={{ fontSize: 32, fontFamily: '"Cormorant Garamond","Noto Serif SC",serif', color: '#2C2C2C', marginBottom: 18, lineHeight: 1.25 }}>{title}</h2>}
        {body && <p data-editor-field="body" style={{ fontSize: 14, color: '#8A7F72', lineHeight: 1.8 }}>{body}</p>}
        {buttonText && linkUrl && (
          <Link data-editor-field="buttonText linkUrl" to={linkUrl} style={{ display: 'inline-block', marginTop: 20, padding: '8px 32px', border: '1px solid #B8944E', color: '#B8944E', fontSize: 12, textDecoration: 'none', letterSpacing: '0.1em' }}>
            {buttonText}
          </Link>
        )}
      </div>
    </div>
  );

  return (
    <section className="homepage-image-text" style={{ display: 'flex', background: '#fff', maxWidth: 1280, margin: '0 auto', minHeight: 380 }}>
      <style>{`
        @media (max-width: 767px) {
          .homepage-image-text { flex-direction: column; min-height: 0 !important; }
          .homepage-image-text__image { flex: 0 0 auto !important; width: 100%; min-height: 320px; }
          .homepage-image-text__copy { min-height: 0; padding: 40px 24px !important; }
        }
      `}</style>
      {isImageLeft ? <>{imageCol}{textCol}</> : <>{textCol}{imageCol}</>}
    </section>
  );
}
