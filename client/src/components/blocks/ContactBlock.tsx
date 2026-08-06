import { Link } from 'react-router-dom';

interface ContactBlockProps {
  title?: string;
  subtitle?: string;
  imageUrl?: string;
  linkUrl?: string;
  linkText?: string;
  settings?: { phone?: string; email?: string; address?: string; hours?: string };
}

/**
 * 品牌首页底部 — 双入口 CTA：进入选款中心 + 预约专属咨询
 */
export default function ContactBlock({ title, subtitle, settings }: ContactBlockProps) {
  const { phone, email, address, hours } = settings || {};

  return (
    <section className="py-24 md:py-32 px-6 md:px-20" style={{ background: '#FAF8F5' }}>
      <div className="max-w-5xl mx-auto text-center">
        {title && (
          <h2 className="text-3xl md:text-4xl mb-3 tracking-wide"
            style={{ fontFamily: '"Cormorant Garamond","Noto Serif SC",serif', color: '#2C2C2C' }}>
            {title}
          </h2>
        )}
        {subtitle && (
          <p className="text-sm tracking-[.2em] uppercase mb-16" style={{ color: '#8A7F72' }}>{subtitle}</p>
        )}

        {/* 两个并列大入口 */}
        <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto mb-16">
          <Link to="/catalog"
            className="group flex flex-col items-center justify-center px-8 py-16 border transition-all duration-500 hover:border-[#B8944E]"
            style={{ borderColor: '#E8E4DD', background: '#fff' }}>
            <span className="text-2xl md:text-3xl tracking-[.08em] mb-3 transition-colors duration-300 group-hover:text-[#B8944E]"
              style={{ fontFamily: '"Cormorant Garamond","Noto Serif SC",serif', color: '#2C2C2C' }}>
              进入选款中心
            </span>
            <span className="text-xs tracking-[.15em]" style={{ color: '#8A7F72' }}>
              浏览全量珠宝作品
            </span>
          </Link>

          <Link to="/contact"
            className="group flex flex-col items-center justify-center px-8 py-16 border transition-all duration-500 hover:border-[#B8944E]"
            style={{ borderColor: '#E8E4DD', background: '#fff' }}>
            <span className="text-2xl md:text-3xl tracking-[.08em] mb-3 transition-colors duration-300 group-hover:text-[#B8944E]"
              style={{ fontFamily: '"Cormorant Garamond","Noto Serif SC",serif', color: '#2C2C2C' }}>
              预约专属咨询
            </span>
            <span className="text-xs tracking-[.15em]" style={{ color: '#8A7F72' }}>
              获取一对一顾问服务
            </span>
          </Link>
        </div>

        {/* 底部联系信息（低调） */}
        {(phone || email || address || hours) && (
          <div className="flex flex-wrap justify-center gap-x-10 gap-y-2 text-xs tracking-wider" style={{ color: '#8A7F72' }}>
            {phone && <span>{phone}</span>}
            {email && <span>{email}</span>}
            {address && <span className="hidden md:inline">{address}</span>}
            {hours && <span className="hidden md:inline">{hours}</span>}
          </div>
        )}
      </div>
    </section>
  );
}