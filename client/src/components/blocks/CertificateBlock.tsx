interface CertificateBlockProps {
  module: { content: Record<string, any>; layoutConfig?: Record<string, any>; styleConfig?: Record<string, any> };
  editMode?: boolean;
}

/**
 * 资质证书模块 — 标题 + 副标题 + 证书网格（每张：证书图 + 名称 + 说明）。
 */
export default function CertificateBlock({ module }: CertificateBlockProps) {
  const { content = {}, styleConfig = {} } = module;
  const { title, subtitle, certificates } = content;
  const bgColor = styleConfig.bgColor || '#FBF9F6';
  const list = Array.isArray(certificates) ? certificates : [];
  const cols = Math.max(2, Math.min(list.length || 3, 4));

  return (
    <section style={{ padding: '72px 24px', background: bgColor }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', textAlign: 'center' }}>
        {title && (
          <h2 data-editor-field="title" style={{ fontSize: 32, fontFamily: '"Cormorant Garamond","Noto Serif SC",serif', color: '#2C2C2C', marginBottom: 12 }}>
            {title}
          </h2>
        )}
        {subtitle && (
          <p data-editor-field="subtitle" style={{ fontSize: 14, color: '#8A7F72', marginBottom: 40 }}>
            {subtitle}
          </p>
        )}
        {list.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${cols === 2 ? 280 : cols === 3 ? 220 : 190}px), 1fr))`, gap: 24 }}>
            {list.map((cert: any, i: number) => (
              <div key={i} style={{ background: '#FFFFFF', border: '1px solid #ECE5DA', borderRadius: 8, padding: 24, textAlign: 'center' }}>
                {cert.imageUrl ? (
                  <img src={cert.imageUrl} alt={cert.name || ''} data-editor-field={`certificates.${i}.imageUrl`} style={{ width: 72, height: 72, objectFit: 'contain', marginBottom: 14 }} />
                ) : (
                  <div data-editor-field={`certificates.${i}.imageUrl`} style={{ width: 72, height: 72, margin: '0 auto 14px', borderRadius: 8, background: 'linear-gradient(135deg, #EAE0CE, #C8A36A)' }} />
                )}
                {cert.name && <p data-editor-field={`certificates.${i}.name`} style={{ fontSize: 14, color: '#2C2C2C', fontWeight: 500, marginBottom: 6 }}>{cert.name}</p>}
                {cert.desc && <p data-editor-field={`certificates.${i}.desc`} style={{ fontSize: 12, color: '#9A9187', lineHeight: 1.6 }}>{cert.desc}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
