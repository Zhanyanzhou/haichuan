import BlockEmptyPlaceholder from "@/components/blocks/_shared/BlockEmptyPlaceholder";

interface StoreInfoBlockProps {
  module: { content: Record<string, any>; layoutConfig?: Record<string, any>; styleConfig?: Record<string, any> };
  editMode?: boolean;
}

/**
 * 门店信息模块 — 门店照片 + 店名 + 地址/营业/电话分字段 + 地图按钮。
 */
export default function StoreInfoBlock({ module, editMode }: StoreInfoBlockProps) {
  const { content = {}, styleConfig = {} } = module;
  const { storeName, address, hours, phone, mapUrl, image } = content;
  const bgColor = styleConfig.bgColor || '#FBF9F6';

  return (
    <section style={{ display: 'flex', flexWrap: 'wrap', maxWidth: 1280, margin: '0 auto', minHeight: 380, background: bgColor }}>
      <div data-editor-field="image" style={{ flex: '1 1 360px', minHeight: 300 }}>
        {image ? (
          <img src={image} alt={storeName || ''} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : editMode ? (
          <BlockEmptyPlaceholder hint="门店照片" spec="请上传门店实景图 · 建议 1200×900 (4:3)" height={380} />
        ) : (
          <div style={{ width: '100%', minHeight: 380, background: 'linear-gradient(135deg, #BAA890, #5D5148)' }} />
        )}
      </div>
      <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 'clamp(32px, 5vw, 48px) clamp(24px, 4vw, 40px)' }}>
        {storeName && (
          <h2 data-editor-field="storeName" style={{ fontSize: 32, fontFamily: '"Cormorant Garamond","Noto Serif SC",serif', color: '#2C2C2C', marginBottom: 24 }}>
            {storeName}
          </h2>
        )}
        {address && (
          <p data-editor-field="address" style={{ fontSize: 14, color: '#5A5048', lineHeight: 1.8, marginBottom: 10, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span style={{ color: '#B8944E' }}>📍</span><span>{address}</span>
          </p>
        )}
        {hours && (
          <p data-editor-field="hours" style={{ fontSize: 14, color: '#5A5048', lineHeight: 1.8, marginBottom: 10, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span style={{ color: '#B8944E' }}>🕑</span><span>{hours}</span>
          </p>
        )}
        {phone && (
          <p data-editor-field="phone" style={{ fontSize: 14, color: '#5A5048', lineHeight: 1.8, marginBottom: 20, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span style={{ color: '#B8944E' }}>📞</span><span>{phone}</span>
          </p>
        )}
        {mapUrl && (
          <a data-editor-field="mapUrl" href={mapUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-block', alignSelf: 'flex-start', padding: '8px 32px', border: '1px solid #B8944E', color: '#B8944E', fontSize: 12, textDecoration: 'none', letterSpacing: '0.1em' }}>
            查看地图
          </a>
        )}
      </div>
    </section>
  );
}
