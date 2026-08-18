import { DecorSection } from "@/page-builder/designSystem/sectionShell";
import { FONT_DISPLAY, FONT_SANS } from "@/page-builder/designSystem/tokens";
import BlockEmptyPlaceholder from "@/components/blocks/_shared/BlockEmptyPlaceholder";
import { getContractRoleRatio } from "@/page-builder/config/blockContracts";

interface TestimonialBlockProps {
  module: { content: Record<string, any>; styleConfig?: Record<string, any> };
  editMode?: boolean;
}

const GOLD = "#8C8C8C";
const TESTIMONIAL_RATIO = getContractRoleRatio("testimonials", "authorizedPhoto", "desktop");

/**
 * 顾客之声 — Editorial Story 母版(口碑变体)
 * 引语式排版:大字引文 + 署名,授权实拍图(契约比例)作为辅图交替错位;
 * 不使用白卡、边框与评论卡形态。
 */
export default function TestimonialBlock({ module, editMode }: TestimonialBlockProps) {
  const { content = {}, styleConfig = {} } = module;
  const bgColor = styleConfig.bgColor || "#FFFFFF";
  const list = Array.isArray(content.testimonials) ? content.testimonials : [];
  const visibleList = editMode
    ? list
    : list.filter((item: any) => Boolean(item?.image && item?.content));

  if (!visibleList.length && !editMode) return null;

  if (!list.length && editMode) {
    return (
      <DecorSection master="editorial-story" background={bgColor}>
        <BlockEmptyPlaceholder hint="顾客之声" spec="请添加顾客引语（建议 2–3 条，需取得顾客授权）" ratio={TESTIMONIAL_RATIO} />
      </DecorSection>
    );
  }

  return (
    <DecorSection master="editorial-story" background={bgColor}>
      <div className="hc-voices">
        <style>{`
          .hc-voices { display: grid; row-gap: clamp(56px, 8vw, 104px); }
          .hc-voices__row {
            display: grid;
            grid-template-columns: minmax(0, 45fr) minmax(0, 55fr);
            column-gap: clamp(28px, 4vw, 64px);
            align-items: center;
          }
          .hc-voices__quote {
            font-family: var(--hc-font-display, ${FONT_DISPLAY});
            font-size: clamp(22px, 2.6vw, 34px);
            line-height: 1.5;
            color: #1A1A1A;
            font-weight: 400;
            margin: 0 0 18px;
          }
          .hc-voices__image { aspect-ratio: ${TESTIMONIAL_RATIO}; overflow: hidden; background: #F3F1EE; }
          .hc-voices__image img { width: 100%; height: 100%; object-fit: cover; display: block; }
          @media (max-width: 767px) {
            .hc-voices { row-gap: 48px; }
            .hc-voices__row { grid-template-columns: minmax(0, 1fr); row-gap: 24px; }
            .hc-voices__quote { font-size: 21px; }
          }
        `}</style>
        {visibleList.map((item: any, index: number) => (
          <div key={`${item.name}-${index}`} className="hc-voices__row">
            <figure className="hc-voices__figure" style={{ margin: 0, minWidth: 0 }} data-content-role="authorizedPhoto" data-editor-field={`testimonials.${index}.image`}>
              <div className="hc-voices__image">
                {item.image ? (
                  <img src={item.image} alt={item.name || "顾客授权实拍"} loading="lazy" decoding="async" />
                ) : (
                  <BlockEmptyPlaceholder hint="授权实拍" spec="请上传已取得公开授权的顾客实拍" height="100%" />
                )}
              </div>
            </figure>
            <div>
              <p className="hc-voices__quote" data-content-role="mainQuote" data-editor-field={`testimonials.${index}.content`}>“{item.content || "主引语待填写"}”</p>
              <p data-content-role="attribution" data-editor-field={`testimonials.${index}.name testimonials.${index}.meta`} style={{ margin: 0, fontSize: 13, letterSpacing: "0.08em", color: GOLD, fontFamily: `var(--hc-font-sans, ${FONT_SANS})` }}>
                {item.name}{item.meta ? ` · ${item.meta}` : ""}
              </p>
            </div>
          </div>
        ))}
      </div>
    </DecorSection>
  );
}
