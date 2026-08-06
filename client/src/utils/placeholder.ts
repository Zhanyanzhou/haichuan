/**
 * 海川珠宝 — 产品占位图
 * 暖金色调，菱形宝石图标，匹配品牌奢华调性
 */

const goldColors = ['#B8944E', '#C9AD84', '#D4C5A2', '#8A7F72'];

export function placeholderImage(id: number, text: string = ''): string {
  const gold = goldColors[id % goldColors.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="480" viewBox="0 0 400 480">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" style="stop-color:#FAF9F6;stop-opacity:1"/>
        <stop offset="100%" style="stop-color:#F5F2ED;stop-opacity:1"/>
      </linearGradient>
    </defs>
    <rect width="400" height="480" fill="url(#bg)"/>
    <!-- 菱形宝石外框 -->
    <path d="M200 80 L340 220 L200 360 L60 220 Z" fill="none" stroke="${gold}" stroke-width="1.2" stroke-opacity="0.25"/>
    <!-- 内菱形 -->
    <path d="M200 130 L280 220 L200 310 L120 220 Z" fill="none" stroke="${gold}" stroke-width="0.8" stroke-opacity="0.18"/>
    <!-- 中心点 -->
    <circle cx="200" cy="220" r="3" fill="${gold}" fill-opacity="0.4"/>
    <!-- 底部文字 -->
    <text x="200" y="410" text-anchor="middle" font-family="Noto Serif SC, serif" font-size="13" fill="#8A7F72" fill-opacity="0.6" letter-spacing="2">HAICHUAN</text>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(encodeURIComponent(svg).replace(/%([0-9A-F]{2})/g, (_: string, p1: string) => String.fromCharCode(parseInt(p1, 16))))}`;
}

export function productPlaceholder(id: number, name: string): string {
  return placeholderImage(id, name);
}
