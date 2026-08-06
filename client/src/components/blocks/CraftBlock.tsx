import { Link } from 'react-router-dom';

// 工艺图片映射（保留现有素材）
const craftImages: Record<string, string> = {
  设计: '/images/设计.png',
  熔炼: '/images/熔炼.png',
  成型: '/images/成型.png',
  錾刻: '/images/錾刻.png',
  镶嵌: '/images/镶嵌.png',
  抛光: '/images/抛光.png',
  质检: '/images/质检.png',
};

interface CraftBlockProps {
  title?: string;
  subtitle?: string;
  content?: string;
  imageUrl?: string;
  videoUrl?: string;
  linkUrl?: string;
  linkText?: string;
  settings?: { steps?: { title: string; icon: string }[] };
}

/**
 * 品牌首页匠心工艺 — 左文右图/视频
 */
export default function CraftBlock({ title, subtitle, content, imageUrl, videoUrl, linkUrl, linkText, settings }: CraftBlockProps) {
  const steps = settings?.steps || [];

  return (
    <section className="py-24 md:py-32 px-6 md:px-20" style={{ background: '#F5F2ED' }}>
      <div className="max-w-6xl mx-auto">
        {/* 上半部分：左文右媒体 */}
        <div className="grid md:grid-cols-2 gap-12 md:gap-20 items-center mb-20">
          {/* 左侧文字 */}
          <div>
            {subtitle && (
              <p className="text-[11px] tracking-[.3em] uppercase mb-4" style={{ color: '#B8944E' }}>
                {subtitle}
              </p>
            )}
            {title && (
              <h2 className="text-3xl md:text-4xl mb-6 leading-tight tracking-wide"
                style={{ fontFamily: '"Cormorant Garamond","Noto Serif SC",serif', color: '#2C2C2C' }}>
                {title}
              </h2>
            )}
            {content && (
              <p className="text-sm md:text-base leading-relaxed" style={{ color: '#8A7F72' }}>
                {content}
              </p>
            )}
            {linkUrl && linkText && (
              <Link to={linkUrl}
                className="inline-block mt-6 text-sm tracking-[.1em] pb-1 border-b transition-colors hover:text-[#B8944E]"
                style={{ color: '#8A7F72', borderColor: '#C5C0B8' }}>
                {linkText}
              </Link>
            )}
          </div>

          {/* 右侧媒体 */}
          <div className="aspect-video overflow-hidden" style={{ background: '#EAE5DB' }}>
            {videoUrl ? (
              <video src={videoUrl} className="w-full h-full object-cover" autoPlay muted loop playsInline />
            ) : imageUrl ? (
              <img src={imageUrl} alt={title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-6xl opacity-20" style={{ color: '#B8944E' }}>◆</div>
            )}
          </div>
        </div>

        {/* 下半部分：工艺步骤 */}
        {steps.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
            {steps.map((step, i) => {
              const img = craftImages[step.title];
              return (
                <div key={i} className="group text-center">
                  <div className="aspect-square overflow-hidden mb-4 transition-all duration-500 group-hover:opacity-80"
                    style={{ background: '#EAE5DB' }}>
                    {img ? (
                      <img src={img} alt={step.title}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.02]" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-4xl opacity-20" style={{ color: '#B8944E' }}>◆</div>
                    )}
                  </div>
                  <p className="text-sm tracking-[.15em] uppercase" style={{ color: '#555' }}>
                    {String(i + 1).padStart(2, '0')}. {step.title}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
