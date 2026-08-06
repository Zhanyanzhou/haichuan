interface StoryBlockProps {
  title?: string;
  subtitle?: string;
  content?: string;
  imageUrl?: string;
  videoUrl?: string;
  linkUrl?: string;
  linkText?: string;
  settings?: { stats?: { label: string; value: number | string }[] };
}

/**
 * 品牌首页品牌宣言 — 60-75vh 大留白，纯文字
 */
export default function StoryBlock({ title, subtitle, content, settings }: StoryBlockProps) {
  const stats = settings?.stats || [];

  return (
    <section className="flex items-center justify-center px-6 md:px-20" style={{ minHeight: '65vh', background: '#F5F2ED' }}>
      <div className="max-w-2xl mx-auto text-center">
        {subtitle && (
          <p className="text-[11px] tracking-[.3em] uppercase mb-6" style={{ color: '#B8944E' }}>
            {subtitle}
          </p>
        )}
        {title && (
          <h2 className="text-3xl md:text-5xl mb-8 leading-snug tracking-wide"
            style={{ fontFamily: '"Cormorant Garamond","Noto Serif SC",serif', color: '#2C2C2C' }}>
            {title}
          </h2>
        )}
        {content && (
          <p className="text-base md:text-lg leading-relaxed max-w-xl mx-auto line-clamp-3"
            style={{ color: '#8A7F72', fontFamily: '"Noto Serif SC",serif' }}>
            {content}
          </p>
        )}

        {/* 数据（如有） */}
        {stats.length > 0 && (
          <div className="flex justify-center gap-16 mt-12 pt-10"
            style={{ borderTop: '1px solid rgba(184,148,78,0.2)' }}>
            {stats.map((s, i) => (
              <div key={i} className="text-center">
                <div className="text-4xl font-light mb-1" style={{ color: '#B8944E', fontFamily: '"Cormorant Garamond",serif' }}>
                  {s.value}
                </div>
                <div className="text-xs tracking-wider" style={{ color: '#8A7F72' }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
