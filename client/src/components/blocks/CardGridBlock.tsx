import BlockEmptyPlaceholder from "@/components/blocks/_shared/BlockEmptyPlaceholder";

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
    <section style={{ padding: "clamp(60px,8vh,110px) 0", background: bg }}>
      <div
        style={{
          maxWidth: 1080,
          margin: "0 auto",
          padding: "0 clamp(20px,4vw,60px)",
        }}
      >
        {(title || subtitle) && (
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            {title && (
              <h2
                style={{
                  fontSize: "clamp(22px,2.6vw,36px)",
                  fontFamily: '"Cormorant Garamond","Noto Serif SC",serif',
                  color: "#2C2C2C",
                  marginBottom: 12,
                  lineHeight: 1.2,
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
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap: cols === 2 ? 40 : 24,
          }}
        >
          {cards.map((card: any, i: number) => (
            <div key={i} style={{ textAlign: "center", padding: "24px 16px" }}>
              {card.icon && (
                <div
                  style={{ fontSize: 36, marginBottom: 16, color: "#B8944E" }}
                >
                  {card.icon}
                </div>
              )}
              {card.title && (
                <p
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    color: "#2C2C2C",
                    marginBottom: 8,
                    fontFamily: '"Cormorant Garamond","Noto Serif SC",serif',
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
      </div>
    </section>
  );
}
