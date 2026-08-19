import { DecorSection } from "@/page-builder/designSystem/sectionShell";
import { FONT_DISPLAY, FONT_SANS } from "@/page-builder/designSystem/tokens";
import BlockEmptyPlaceholder from "@/components/blocks/_shared/BlockEmptyPlaceholder";

interface CustomProcessBlockProps {
  module: { content: Record<string, any>; layoutConfig?: Record<string, any>; styleConfig?: Record<string, any> };
  editMode?: boolean;
}

const INK = "#1A1A1A";
const MUTED = "#8C8C8C";
const GOLD = "#8C8C8C";

/**
 * 定制旅程 — Journey 母版
 * 01–05 大字叙事:衬线大编号 + 英文题 + 中文一句;PC 横向铺开,Mobile 纵向排列。
 * 构图红线:不使用步骤圆、连线流程图等后台式形态。
 */
export default function CustomProcessBlock({ module, editMode }: CustomProcessBlockProps) {
  const { content = {}, styleConfig = {} } = module;
  const { title, subtitle } = content;
  const bgColor = styleConfig.bgColor || '#FFFFFF';
  const list = Array.isArray(content.steps) ? content.steps : [];

  if (list.length === 0) {
    if (!editMode) return null;
    return (
      <DecorSection master="journey" background={bgColor}>
        <BlockEmptyPlaceholder hint="定制旅程" spec="请添加旅程节点（如 01 DISCOVERY · 理解您的故事）" />
      </DecorSection>
    );
  }

  return (
    <DecorSection master="journey" background={bgColor}>
      {(title || subtitle || editMode) && (
        <header style={{ maxWidth: 640, margin: "0 auto 56px", textAlign: "center" }}>
          {title ? (
            <h2 data-editor-field="title"
              style={{
                margin: "0 0 12px",
                fontFamily: `var(--hc-font-display, ${FONT_DISPLAY})`,
                fontSize: "var(--hc-type-h2, clamp(26px,3vw,38px))",
                fontWeight: 500,
                color: INK,
                lineHeight: 1.2,
              }}
            >
              {title}
            </h2>
          ) : null}
          {subtitle ? (
            <p data-editor-field="subtitle" style={{ margin: 0, fontSize: "var(--hc-type-body, 15px)", color: MUTED, lineHeight: 1.8 }}>
              {subtitle}
            </p>
          ) : null}
        </header>
      )}
      <ol className="hc-journey" style={{ listStyle: "none", margin: 0, padding: 0 }}>
        <style>{`
          .hc-journey {
            display: grid;
            grid-template-columns: repeat(${Math.max(list.length, 1)}, minmax(0, 1fr));
            column-gap: clamp(20px, 2.5vw, 40px);
            counter-reset: journey;
          }
          .hc-journey__step { min-width: 0; }
          .hc-journey__num {
            font-family: var(--hc-font-display, ${FONT_DISPLAY});
            font-size: clamp(44px, 4.5vw, 72px);
            line-height: 1;
            color: ${GOLD};
            font-weight: 400;
            margin: 0 0 14px;
          }
          .hc-journey__num--ghost { color: rgba(0,0,0,0.18); }
          .hc-journey__en {
            font-size: 11px;
            letter-spacing: 0.22em;
            text-transform: uppercase;
            color: ${MUTED};
            font-family: var(--hc-font-sans, ${FONT_SANS});
            margin: 0 0 10px;
          }
          .hc-journey__name {
            font-family: var(--hc-font-display, ${FONT_DISPLAY});
            font-size: var(--hc-type-h3, 20px);
            color: ${INK};
            font-weight: 500;
            margin: 0 0 10px;
          }
          .hc-journey__desc {
            font-size: var(--hc-type-caption, 13px);
            color: ${MUTED};
            line-height: 1.8;
            margin: 0;
          }
          .hc-journey__image {
            width: 96px;
            height: 96px;
            object-fit: cover;
            display: block;
            margin: 0 0 16px;
          }
          /* Mobile:横向铺开转纵向叙事 */
          @media (max-width: 767px) {
            .hc-journey { grid-template-columns: minmax(0, 1fr); row-gap: 36px; }
            .hc-journey__step { display: grid; grid-template-columns: 72px minmax(0, 1fr); column-gap: 20px; align-items: start; }
            .hc-journey__num, .hc-journey__num--ghost { font-size: 40px; margin: 0; grid-row: 1; }
            .hc-journey__en { margin-top: 6px; }
          }
        `}</style>
        {list.map((step: any, i: number) => (
          <li key={step.number || i} className="hc-journey__step" data-editor-field={`steps.${i}`}>
            {step.image ? (
              <img className="hc-journey__image" src={step.image} alt={step.name || ""} loading="lazy" decoding="async" />
            ) : null}
            <p className={i % 2 === 1 ? "hc-journey__num hc-journey__num--ghost" : "hc-journey__num"} aria-hidden>
              {step.number || String(i + 1).padStart(2, "0")}
            </p>
            {step.en ? <p className="hc-journey__en">{step.en}</p> : null}
            {step.name ? <p className="hc-journey__name">{step.name}</p> : null}
            {step.desc ? <p className="hc-journey__desc">{step.desc}</p> : null}
          </li>
        ))}
      </ol>
    </DecorSection>
  );
}
