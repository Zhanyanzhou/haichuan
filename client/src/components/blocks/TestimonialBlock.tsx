import { DecorSection } from "@/page-builder/designSystem/sectionShell";
import { FONT_DISPLAY, FONT_SANS } from "@/page-builder/designSystem/tokens";
import BlockEmptyPlaceholder from "@/components/blocks/_shared/BlockEmptyPlaceholder";

interface TestimonialBlockProps {
  module: { content: Record<string, any>; styleConfig?: Record<string, any> };
  editMode?: boolean;
}

const INK = "#28231F";
const MUTED = "rgba(40,35,31,0.58)";
const GOLD = "#B8944E";

/**
 * 顾客之声 — Editorial Story 母版(口碑变体)
 * 引语式排版:大字引文 + 署名,实拍图 4:3 作为辅图交替错位;
 * 不使用白卡、边框与评论卡形态。
 */
export default function TestimonialBlock({ module, editMode }: TestimonialBlockProps) {
  const { content = {}, styleConfig = {} } = module;
  const { title, subtitle } = content;
  const bgColor = styleConfig.bgColor || "#FBF9F6";
  const list = Array.isArray(content.testimonials) ? content.testimonials : [];

  if (!list.length && !editMode) return null;

  if (!list.length && editMode) {
    return (
      <DecorSection master="editorial-story" background={bgColor}>
        <BlockEmptyPlaceholder hint="顾客之声" spec="请添加顾客引语（建议 2–3 条，需取得顾客授权）" />
      </DecorSection>
    );
  }

  return (
    <DecorSection master="editorial-story" background={bgColor}>
      {(title || subtitle) && (
        <header style={{ maxWidth: 640, margin: "0 auto 56px", textAlign: "center" }}>
          {title && (
            <h2 style={{ margin: "0 0 12px", fontFamily: `var(--hc-font-display, ${FONT_DISPLAY})`, fontSize: "var(--hc-type-h2, clamp(26px,3vw,40px))", fontWeight: 500, color: INK, lineHeight: 1.2 }}>
              {title}
            </h2>
          )}
          {subtitle && (
            <p style={{ margin: 0, fontSize: "var(--hc-type-body, 15px)", color: MUTED, lineHeight: 1.8 }}>{subtitle}</p>
          )}
        </header>
      )}
      <div className="hc-voices">
        <style>{`
          .hc-voices { display: grid; row-gap: clamp(56px, 8vw, 104px); }
          .hc-voices__row {
            display: grid;
            grid-template-columns: 58fr 42fr;
            column-gap: clamp(28px, 4vw, 64px);
            align-items: center;
          }
          .hc-voices__row--reverse { grid-template-columns: 42fr 58fr; }
          .hc-voices__quote {
            font-family: var(--hc-font-display, ${FONT_DISPLAY});
            font-size: clamp(22px, 2.6vw, 34px);
            line-height: 1.5;
            color: ${INK};
            font-weight: 400;
            margin: 0 0 18px;
          }
          .hc-voices__image { aspect-ratio: 4 / 3; overflow: hidden; background: #EAE3D8; }
          .hc-voices__image img { width: 100%; height: 100%; object-fit: cover; display: block; }
          .hc-voices__row--reverse .hc-voices__quote { order: 2; }
          .hc-voices__row--reverse .hc-voices__figure { order: 1; }
          @media (max-width: 767px) {
            .hc-voices { row-gap: 48px; }
            .hc-voices__row,
            .hc-voices__row--reverse { grid-template-columns: minmax(0, 1fr); row-gap: 20px; }
            .hc-voices__quote,
            .hc-voices__row--reverse .hc-voices__quote { order: 1; font-size: 21px; }
            .hc-voices__figure,
            .hc-voices__row--reverse .hc-voices__figure { order: 2; }
          }
        `}</style>
        {list.map((item: any, index: number) => (
          <div key={`${item.name}-${index}`} className={`hc-voices__row${index % 2 === 1 ? " hc-voices__row--reverse" : ""}`}>
            <div>
              <p className="hc-voices__quote">“{item.content}”</p>
              <p style={{ margin: 0, fontSize: 13, letterSpacing: "0.08em", color: GOLD, fontFamily: `var(--hc-font-sans, ${FONT_SANS})` }}>
                {item.name}{item.meta ? ` · ${item.meta}` : ""}
              </p>
            </div>
            {item.image ? (
              <figure className="hc-voices__figure" style={{ margin: 0, minWidth: 0 }} data-editor-field={`testimonials.${index}.image`}>
                <div className="hc-voices__image">
                  <img src={item.image} alt={item.name || "顾客实拍"} loading="lazy" decoding="async" />
                </div>
              </figure>
            ) : null}
          </div>
        ))}
      </div>
    </DecorSection>
  );
}
