import { DecorSection } from "@/page-builder/designSystem/sectionShell";
import { IMAGE_SPECS } from "@/page-builder/config/imageSpecs";
import { FONT_DISPLAY, FONT_SANS } from "@/page-builder/designSystem/tokens";
import BlockEmptyPlaceholder from "@/components/blocks/_shared/BlockEmptyPlaceholder";

interface CertificateBlockProps {
  module: { content: Record<string, any>; layoutConfig?: Record<string, any>; styleConfig?: Record<string, any> };
  editMode?: boolean;
}

const INK = "#28231F";
const MUTED = "rgba(40,35,31,0.58)";
const GOLD = "#B8944E";

/**
 * 权威认证 — Asymmetric Gallery 母版(信任变体)
 * 画廊式 1:1 图墙:证书图直接呈现,名称与说明以极简文字随图;
 * 无卡片边框、无底色、无圆角,与作品画廊同一视觉语言。
 */
export default function CertificateBlock({ module, editMode }: CertificateBlockProps) {
  const { content = {}, styleConfig = {} } = module;
  const { title, subtitle } = content;
  const bgColor = styleConfig.bgColor || '#FBF9F6';
  const list = Array.isArray(content.certificates) ? content.certificates : [];

  if (list.length === 0) {
    if (!editMode) return null;
    return (
      <DecorSection master="asymmetric-gallery" background={bgColor}>
        <BlockEmptyPlaceholder hint="权威认证" spec={`请添加证书条目 · ${IMAGE_SPECS.certificate.image.label}`} />
      </DecorSection>
    );
  }

  return (
    <DecorSection master="asymmetric-gallery" background={bgColor}>
      {(title || subtitle) && (
        <header style={{ maxWidth: 640, margin: "0 auto 48px", textAlign: "center" }}>
          {title && (
            <h2 data-editor-field="title"
              style={{
                margin: "0 0 12px",
                fontFamily: `var(--hc-font-display, ${FONT_DISPLAY})`,
                fontSize: "var(--hc-type-h2, clamp(24px,2.8vw,36px))",
                fontWeight: 500,
                color: INK,
                lineHeight: 1.2,
              }}
            >
              {title}
            </h2>
          )}
          {subtitle && (
            <p data-editor-field="subtitle" style={{ margin: 0, fontSize: "var(--hc-type-body, 15px)", color: MUTED, lineHeight: 1.8 }}>
              {subtitle}
            </p>
          )}
        </header>
      )}
      <div className="hc-cert-gallery">
        <style>{`
          .hc-cert-gallery {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            column-gap: clamp(24px, 3.5vw, 48px);
            row-gap: clamp(32px, 4vw, 56px);
          }
          .hc-cert-gallery__frame {
            aspect-ratio: 1 / 1;
            overflow: hidden;
            background: #EFEAE0;
            display: grid;
            place-items: center;
          }
          .hc-cert-gallery__frame img { width: 100%; height: 100%; object-fit: cover; display: block; }
          .hc-cert-gallery__mark {
            font-family: var(--hc-font-display, ${FONT_DISPLAY});
            font-size: clamp(40px, 5vw, 64px);
            color: rgba(184,148,78,0.4);
            line-height: 1;
          }
          @media (max-width: 767px) {
            .hc-cert-gallery { grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 16px; row-gap: 32px; }
          }
        `}</style>
        {list.map((cert: any, i: number) => (
          <figure key={i} style={{ margin: 0, minWidth: 0 }}>
            <div data-editor-field={`certificates.${i}.imageUrl`} className="hc-cert-gallery__frame">
              {cert.imageUrl ? (
                <img src={cert.imageUrl} alt={cert.name || "证书"} loading="lazy" decoding="async" />
              ) : (
                <span className="hc-cert-gallery__mark" aria-hidden>
                  {(cert.name || "证").slice(0, 1)}
                </span>
              )}
            </div>
            {cert.name && (
              <figcaption data-editor-field={`certificates.${i}.name`}
                style={{
                  margin: "14px 0 0",
                  fontSize: "var(--hc-type-body, 15px)",
                  color: INK,
                  letterSpacing: "0.04em",
                }}
              >
                {cert.name}
              </figcaption>
            )}
            {cert.desc && (
              <p data-editor-field={`certificates.${i}.desc`}
                style={{
                  margin: "6px 0 0",
                  fontSize: "var(--hc-type-caption, 12px)",
                  color: MUTED,
                  lineHeight: 1.7,
                  fontFamily: `var(--hc-font-sans, ${FONT_SANS})`,
                }}
              >
                {cert.desc}
              </p>
            )}
          </figure>
        ))}
      </div>
    </DecorSection>
  );
}
