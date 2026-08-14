import { Link } from "react-router-dom";
import { SecureImage } from "@/components/common/SecureImage";

interface LookbookBlockProps {
  module: { content: Record<string, any>; styleConfig?: Record<string, any> };
  editMode?: boolean;
}

/** 佩戴灵感：用场景大片串联可直接购买的珠宝作品。 */
export default function LookbookBlock({ module, editMode }: LookbookBlockProps) {
  const { content = {}, styleConfig = {} } = module;
  const { title, subtitle, image, imageAlt, products = [] } = content;
  const bgColor = styleConfig.bgColor || "#FCFCFB";
  const hasProducts = Array.isArray(products) && products.length > 0;

  if (!image && !hasProducts && !editMode) return null;

  return (
    <section style={{ padding: "clamp(56px, 8vw, 104px) clamp(20px, 4vw, 60px)", background: bgColor }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        {(title || subtitle) && <div style={{ maxWidth: 540, marginBottom: 38 }}>
          {title && <h2 style={{ margin: "0 0 12px", color: "#2C2C2C", fontFamily: '"Cormorant Garamond","Noto Serif SC",serif', fontSize: "clamp(28px, 3.4vw, 42px)", fontWeight: 500 }}>{title}</h2>}
          {subtitle && <p style={{ margin: 0, color: "#8A7F72", fontSize: 14, lineHeight: 1.8 }}>{subtitle}</p>}
        </div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: "clamp(20px, 3vw, 38px)" }}>
          <div style={{ minHeight: 420, background: "#EAE3D8", overflow: "hidden" }}>
            {image ? <img src={image} alt={imageAlt || title || ""} loading="lazy" style={{ width: "100%", height: "100%", minHeight: 420, objectFit: "cover", display: "block" }} /> : <div style={{ height: "100%", minHeight: 420, display: "grid", placeItems: "center", color: "#A89A87", fontSize: 14 }}>上传佩戴场景图</div>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", alignContent: "start", gap: 18 }}>
            {hasProducts ? products.map((product: any, index: number) => (
              <Link key={`${product.id || product.name}-${index}`} to={product.link || "/products"} style={{ display: "block", color: "inherit", textDecoration: "none" }}>
                <div style={{ aspectRatio: "3 / 4", overflow: "hidden", background: "#F0ECE5", marginBottom: 12 }}>
                  {product.image ? <SecureImage src={product.image} alt={product.name || ""} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : <div style={{ height: "100%", display: "grid", placeItems: "center", color: "#B8ADA0" }}>珠宝作品</div>}
                </div>
                <p style={{ margin: "0 0 5px", color: "#2C2C2C", fontSize: 14, fontWeight: 500 }}>{product.name}</p>
                {product.price && <p style={{ margin: 0, color: "#B8944E", fontSize: 13 }}>{product.price}</p>}
              </Link>
            )) : <p style={{ margin: 0, color: "#9A9187", fontSize: 13 }}>请选择关联的珠宝作品</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
