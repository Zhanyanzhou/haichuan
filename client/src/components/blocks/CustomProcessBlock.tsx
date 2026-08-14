interface CustomProcessBlockProps {
  module: { content: Record<string, any>; layoutConfig?: Record<string, any>; styleConfig?: Record<string, any> };
  editMode?: boolean;
}

/**
 * 定制流程模块 — 标题 + 副标题 + 横向步骤（序号圆 或 步骤图）+ 标题 + 说明。
 */
export default function CustomProcessBlock({ module }: CustomProcessBlockProps) {
  const { content = {}, styleConfig = {} } = module;
  const { title, subtitle, steps } = content;
  const bgColor = styleConfig.bgColor || '#FBF9F6';
  const list = Array.isArray(steps) ? steps : [];

  return (
    <section style={{ padding: '72px 24px', background: bgColor }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', textAlign: 'center' }}>
        {title && (
          <h2 data-editor-field="title" style={{ fontSize: 32, fontFamily: '"Cormorant Garamond","Noto Serif SC",serif', color: '#2C2C2C', marginBottom: 12 }}>
            {title}
          </h2>
        )}
        {subtitle && (
          <p data-editor-field="subtitle" style={{ fontSize: 14, color: '#8A7F72', marginBottom: 48 }}>
            {subtitle}
          </p>
        )}
        {list.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 0 }}>
            {list.map((step: any, i: number) => (
              <div key={i} style={{ flex: '1 1 180px', maxWidth: 240, padding: '0 12px' }}>
                {step.image ? (
                  <img data-editor-field={`steps.${i}.image`} src={step.image} alt={step.name || ''} style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: '50%', margin: '0 auto 20px', display: 'block' }} />
                ) : (
                  <div data-editor-field={`steps.${i}.number`} style={{ width: 48, height: 48, margin: '0 auto 20px', borderRadius: '50%', border: '1px solid #B8944E', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#B8944E', fontSize: 16, fontFamily: '"Cormorant Garamond",serif' }}>
                    {step.number || String(i + 1).padStart(2, '0')}
                  </div>
                )}
                {step.name && <p data-editor-field={`steps.${i}.name`} style={{ fontSize: 15, color: '#2C2C2C', fontWeight: 500, marginBottom: 8 }}>{step.name}</p>}
                {step.desc && <p data-editor-field={`steps.${i}.desc`} style={{ fontSize: 12, color: '#9A9187', lineHeight: 1.7 }}>{step.desc}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
