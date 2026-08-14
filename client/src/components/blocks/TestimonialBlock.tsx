interface TestimonialBlockProps {
  module: { content: Record<string, any>; styleConfig?: Record<string, any> };
  editMode?: boolean;
}

/** 真实评价与实拍：以顾客体验补足品牌自身的信任表达。 */
export default function TestimonialBlock({ module, editMode }: TestimonialBlockProps) {
  const { content = {}, styleConfig = {} } = module;
  const { title, subtitle, testimonials = [] } = content;
  const bgColor = styleConfig.bgColor || "#FBF9F6";
  const list = Array.isArray(testimonials) ? testimonials : [];
  if (!list.length && !editMode) return null;

  return (
    <section style={{ padding: "clamp(56px, 8vw, 104px) clamp(20px, 4vw, 60px)", background: bgColor }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        {(title || subtitle) && <div style={{ textAlign: "center", maxWidth: 560, margin: "0 auto 42px" }}>
          {title && <h2 style={{ margin: "0 0 12px", color: "#2C2C2C", fontFamily: '"Cormorant Garamond","Noto Serif SC",serif', fontSize: "clamp(28px, 3.4vw, 42px)", fontWeight: 500 }}>{title}</h2>}
          {subtitle && <p style={{ margin: 0, color: "#8A7F72", fontSize: 14, lineHeight: 1.8 }}>{subtitle}</p>}
        </div>}
        {list.length > 0 ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: 20 }}>{list.map((item: any, index: number) => <article key={`${item.name}-${index}`} style={{ padding: 24, background: "#fff", border: "1px solid #ECE5DA" }}>
          {item.image && <img src={item.image} alt={item.name || "顾客实拍"} loading="lazy" style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", display: "block", marginBottom: 20 }} />}
          <p style={{ margin: "0 0 18px", color: "#4A4239", fontSize: 14, lineHeight: 1.85 }}>“{item.content}”</p>
          <p style={{ margin: "0 0 4px", color: "#2C2C2C", fontSize: 13, fontWeight: 600 }}>{item.name}</p>
          {item.meta && <p style={{ margin: 0, color: "#A18F78", fontSize: 12 }}>{item.meta}</p>}
        </article>)}</div> : <p style={{ margin: 0, color: "#9A9187", textAlign: "center", fontSize: 13 }}>请添加真实评价内容</p>}
      </div>
    </section>
  );
}
