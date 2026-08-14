import BlockEmptyPlaceholder from "@/components/blocks/_shared/BlockEmptyPlaceholder";
import { DecorSection } from "@/page-builder/designSystem/sectionShell";
import { FONT_DISPLAY } from "@/page-builder/designSystem/tokens";

interface CardGridBlockProps {
  module: {
    content: Record<string, any>;
    layoutConfig?: Record<string, any>;
    styleConfig?: Record<string, any>;
  };
  editMode?: boolean;
}

/**
 * 多卡片网格 — 品牌价值 / 工艺特点 / 服务承诺 等
 * content: { title, subtitle, cards: [{icon,title,body}], layout: 'grid-2'|'grid-3'|'grid-4' }
 */
export default function CardGridBlock({
  module,
  editMode,
}: CardGridBlockProps) {
  const { content = {}, styleConfig = {} } = module;
  const { title, subtitle, cards = [] } = content;
  const layout = content.layout || "grid-3";
  const bg = styleConfig.bgColor || "#FCFCFB";
  const cols = layout === "grid-2" ? 2 : layout === "grid-4" ? 4 : 3;

  if (!cards.length) {
    if (!editMode) return null;
    return (
      <BlockEmptyPlaceholder
        icon="🃏"
        hint="卡片网格"
        spec="请在右侧配置卡片数据"
        bg={bg}
      />
    );
  }

  return (
    <DecorSection master="commerce-grid" background={bg} spacing="compact">
      {(title || subtitle) && (
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          {title && (
            <h2
              style={{
                fontSize: "var(--hc-type-h3, clamp(22px,2.6vw,32px))",
                fontFamily: `var(--hc-font-display, ${FONT_DISPLAY})`,
                color: "#2C2C2C",
                marginBottom: 12,
                lineHeight: 1.2,
                fontWeight: 500,
              }}
            >
              {title}
            </h2>
          )}
            {subtitle && (
              <p
                style={{
                  fontSize: 13,
                  color: "#8A7F72",
                  maxWidth: 480,
                  margin: "0 auto",
                  lineHeight: 1.6,
                }}
              >
                {subtitle}
              </p>
            )}
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${cols === 2 ? 340 : cols === 3 ? 230 : 180}px), 1fr))`,
            gap: cols === 2 ? 40 : 24,
          }}
        >
          {cards.map((card: any, i: number) => (
            <div key={i} style={{ textAlign: "center", padding: "16px 12px" }}>
              {card.icon && (
                <div
                  style={{ fontSize: 13, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 14, color: "#B8944E" }}
                >
                  {card.icon}
                </div>
              )}
              {card.title && (
                <p
                  style={{
                    fontSize: 16,
                    fontWeight: 500,
                    color: "#2C2C2C",
                    marginBottom: 8,
                    fontFamily: `var(--hc-font-display, ${FONT_DISPLAY})`,
                  }}
                >
                  {card.title}
                </p>
              )}
              {card.body && (
                <p
                  style={{
                    fontSize: 13,
                    color: "#8A7F72",
                    lineHeight: 1.7,
                    maxWidth: 260,
                    margin: "0 auto",
                  }}
                >
                  {card.body}
                </p>
              )}
            </div>
          ))}
        </div>
    </DecorSection>
  );
}
