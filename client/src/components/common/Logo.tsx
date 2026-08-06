/**
 * 海川珠宝 Logo 组件
 * 优先使用用户上传的 logo 图片，加载失败时回退到 SVG 矢量图标
 */
interface LogoProps {
  size?: number;
  iconOnly?: boolean;
  dark?: boolean;
  fontSize?: string;
}

export default function Logo({ size = 48, iconOnly = false, dark = false, fontSize = '2rem' }: LogoProps) {
  const gold = '#B8944E';
  const textColor = dark ? '#2C2C2C' : '#2C2C2C';
  const logoImgSize = iconOnly ? size : size + 4;

  return (
    <span
      className="inline-flex items-center gap-3 select-none"
      style={{ fontFamily: '"Cormorant Garamond", "Noto Serif SC", serif' }}
    >
      {/* Logo 图片 */}
      <img
        src="/images/logo.png"
        alt="海川珠宝"
        width={logoImgSize}
        height={logoImgSize}
        className="object-contain"
        style={{ maxHeight: logoImgSize }}
        onError={(e) => {
          const el = e.currentTarget;
          el.style.display = 'none';
          const fallback = document.getElementById('logo-fallback-svg');
          if (fallback) fallback.style.display = 'block';
        }}
      />

      {/* 品牌名 */}
      {!iconOnly && (
        <span className="flex flex-col leading-tight">
          <span
            className="tracking-[.1em] font-medium"
            style={{ fontSize, color: textColor }}
          >
            海川珠宝
          </span>
          <span
            className="text-[11px] tracking-[.28em] uppercase"
            style={{ color: gold, marginTop: '1px' }}
          >
            HAICHUAN JEWELRY
          </span>
        </span>
      )}
    </span>
  );
}
