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
  const logoImgSize = iconOnly ? size : size + 4;
  const toneClass = dark ? ' is-dark' : '';

  return (
    <span
      className={`brand-lockup inline-flex items-center gap-3 select-none${toneClass}`}
    >
      {/* Logo 图片 */}
      <img
        src="/images/logo.png"
        alt="海川珠宝"
        width={logoImgSize}
        height={logoImgSize}
        className="brand-lockup__mark object-contain"
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
        <span className="brand-lockup__text flex flex-col leading-tight">
          <span
            className="brand-lockup__name"
            style={{ fontSize }}
          >
            海川珠宝
          </span>
          <span className="brand-lockup__sub">
            HAICHUAN JEWELRY
          </span>
        </span>
      )}
    </span>
  );
}
