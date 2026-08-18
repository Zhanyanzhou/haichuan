import { Link } from 'react-router-dom';
import BlockEmptyPlaceholder from "@/components/blocks/_shared/BlockEmptyPlaceholder";
import { IMAGE_TEXT_CONTRACT, RESPONSIVE_CANVAS } from "@/page-builder/config/blockContracts";
import { IMAGE_SPECS } from "@/page-builder/config/imageSpecs";
import { SecureImage } from "@/components/common/SecureImage";
import { resolveLinkTargetUrl } from "@/page-builder/utils/linkTarget";

interface ImageTextBlockProps {
  module: { content: Record<string, any>; layoutConfig?: Record<string, any>; styleConfig?: Record<string, any> };
  editMode?: boolean;
}

function ImageTextAction({ editMode, text, targetUrl }: { editMode?: boolean; text?: string; targetUrl: string }) {
  if (!text || !targetUrl) return null;
  const style = { display: 'inline-block', marginTop: 24, paddingBottom: 6, borderBottom: '1px solid #1A1A1A', color: '#1A1A1A', fontSize: 12, textDecoration: 'none', letterSpacing: '0.12em' } as const;
  return editMode
    ? <span data-editor-field="buttonText linkUrl productId" style={style}>{text}</span>
    : <Link data-editor-field="buttonText linkUrl productId" to={targetUrl} style={style}>{text}</Link>;
}

/**
 * 图文混排模块 — 支持左文右图 / 左图右文 / 纯文字 / 图片背景
 */
export default function ImageTextBlock({ module, editMode }: ImageTextBlockProps) {
  const { content = {}, layoutConfig = {}, styleConfig = {} } = module;
  const {
    label, title, body, image, imageAlt, buttonText, linkUrl,
  } = content;
  const template = layoutConfig.template || 'textLeftImageRight';
  const spacing = styleConfig.spacing || 'normal';
  const focusX = Math.min(100, Math.max(0, Number(styleConfig.focusX ?? 50)));
  const focusY = Math.min(100, Math.max(0, Number(styleConfig.focusY ?? 50)));
  const targetUrl = resolveLinkTargetUrl({ targetType: content.targetType, productId: content.productId, linkUrl });

  const paddingMap: Record<string, string> = { compact: '40px 0', normal: '72px 0', spacious: '100px 0' };

  // 纯文字模式
  if (template === 'textOnly') {
    return (
      <section style={{ padding: paddingMap[spacing], background: '#FFFFFF' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 24px', textAlign: 'center' }}>
          {label && (
            <p data-editor-field="label" style={{ fontSize: 11, letterSpacing: '0.3em', textTransform: 'uppercase', color: '#8C8C8C', marginBottom: 16 }}>
              {label}
            </p>
          )}
          {title && (
            <h2 data-editor-field="title" style={{ fontSize: 36, fontFamily: '"Cormorant Garamond","Noto Serif SC",serif', color: '#1A1A1A', marginBottom: 24, lineHeight: 1.3 }}>
              {title}
            </h2>
          )}
          {body && (
            <p data-editor-field="body" style={{ fontSize: 15, color: '#8C8C8C', lineHeight: 1.8, maxWidth: 560, margin: '0 auto' }}>
              {body}
            </p>
          )}
          <ImageTextAction editMode={editMode} text={buttonText} targetUrl={targetUrl} />
        </div>
      </section>
    );
  }

  // 背景图模式
  if (template === 'imageBackground') {
    if (!image && editMode) {
      return <BlockEmptyPlaceholder hint="图文背景图" spec={`请上传背景配图 · ${IMAGE_SPECS.imageText.image.label}`} height={500} />;
    }
    if (!image) return null;
    return (
      <section className="homepage-image-text-background" style={{ position: 'relative', minHeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: '#2C2C2C', maxWidth: IMAGE_TEXT_CONTRACT.canvas.maxWidth, margin: '0 auto' }}>
        <style>{`
          @media (max-width: ${IMAGE_TEXT_CONTRACT.canvas.mobileBreakpoint}px) {
            .homepage-image-text-background { min-height: 420px !important; }
          }
        `}</style>
        <SecureImage src={image} alt={imageAlt || title || "图文背景图"} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${focusX}% ${focusY}%`, opacity: 0.5 }} />
        <div style={{ position: 'relative', zIndex: 1, padding: 60, textAlign: 'center', maxWidth: 720 }}>
          {label && <p data-editor-field="label" style={{ fontSize: 11, letterSpacing: '0.3em', color: '#8C8C8C', marginBottom: 12 }}>{label}</p>}
          {title && <h2 data-editor-field="title" style={{ fontSize: 40, fontFamily: '"Cormorant Garamond","Noto Serif SC",serif', color: '#fff', marginBottom: 20 }}>{title}</h2>}
          {body && <p data-editor-field="body" style={{ fontSize: 15, color: 'rgba(255,255,255,0.8)', lineHeight: 1.7 }}>{body}</p>}
          <ImageTextAction editMode={editMode} text={buttonText} targetUrl={targetUrl} />
        </div>
      </section>
    );
  }

  // 默认：左文右图 / 左图右文
  const isImageLeft = template === 'textRightImageLeft';
  const imageCol = image ? (
    <div data-editor-field="image" className="homepage-image-text__image">
      <SecureImage src={image} alt={imageAlt || ""} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${focusX}% ${focusY}%`, display: 'block' }} />
    </div>
  ) : editMode ? (
    <div data-editor-field="image" className="homepage-image-text__image">
      <BlockEmptyPlaceholder hint="图文配图" spec={`请上传图片 · ${IMAGE_SPECS.imageText.image.label}`} height="100%" />
    </div>
  ) : null;
  const textCol = (
    <div className="homepage-image-text__copy" style={{ minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: spacing === 'compact' ? '40px 36px' : spacing === 'spacious' ? '64px 52px' : '52px 44px' }}>
      <div style={{ maxWidth: 440 }}>
        {label && <p data-editor-field="label" style={{ fontSize: 11, letterSpacing: '0.3em', textTransform: 'uppercase', color: '#8C8C8C', marginBottom: 16 }}>{label}</p>}
        {title && <h2 data-editor-field="title" style={{ fontSize: 32, fontFamily: '"Cormorant Garamond","Noto Serif SC",serif', color: '#1A1A1A', marginBottom: 18, lineHeight: 1.25 }}>{title}</h2>}
        {body && <p data-editor-field="body" style={{ fontSize: 14, color: '#8C8C8C', lineHeight: 1.8 }}>{body}</p>}
        <ImageTextAction editMode={editMode} text={buttonText} targetUrl={targetUrl} />
      </div>
    </div>
  );

  return (
    <section className={`homepage-image-text${imageCol ? '' : ' is-without-image'}`} style={{ display: 'grid', gridTemplateColumns: IMAGE_TEXT_CONTRACT.canvas.desktopColumns, alignItems: 'stretch', background: '#fff', maxWidth: IMAGE_TEXT_CONTRACT.canvas.maxWidth, margin: '0 auto' }}>
      <style>{`
        .homepage-image-text.is-without-image { grid-template-columns: minmax(0, 1fr) !important; }
        .homepage-image-text__image {
          min-width: 0;
          overflow: hidden;
          aspect-ratio: ${IMAGE_TEXT_CONTRACT.canvas.desktopMediaAspectRatio};
          background: #F7F8FB;
        }
        @media ${RESPONSIVE_CANVAS.tabletMediaQuery} {
          .homepage-image-text__copy { padding: 44px 32px !important; }
        }
        @media (max-width: ${IMAGE_TEXT_CONTRACT.canvas.mobileBreakpoint}px) {
          .homepage-image-text { grid-template-columns: minmax(0, 1fr) !important; }
          .homepage-image-text__image {
            order: 0;
            width: 100%;
            min-height: 0;
            aspect-ratio: ${IMAGE_TEXT_CONTRACT.canvas.mobileMediaAspectRatio};
          }
          .homepage-image-text__copy { order: 1; min-height: 0; padding: 40px 24px !important; }
        }
      `}</style>
      {isImageLeft ? <>{imageCol}{textCol}</> : <>{textCol}{imageCol}</>}
    </section>
  );
}
