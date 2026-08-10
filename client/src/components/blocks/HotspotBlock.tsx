import { Link } from "react-router-dom";

interface HotspotItem {
  x: number; // 左边距百分比
  y: number; // 上边距百分比
  width: number; // 宽度百分比
  height: number; // 高度百分比
  link: string;
  label?: string;
}

interface HotspotBlockProps {
  module: {
    content: Record<string, any>;
    layoutConfig?: Record<string, any>;
    styleConfig?: Record<string, any>;
  };
  editMode?: boolean;
}

/**
 * 热区图模块 — 对标旺铺"多热区切图"
 * content: { image, mobileImage, hotspots: [{x,y,width,height,link,label}] }
 */
export default function HotspotBlock({ module, editMode }: HotspotBlockProps) {
  const { content = {} } = module;
  const { image, mobileImage, hotspots = [] } = content;
  const validHotspots: HotspotItem[] = (
    Array.isArray(hotspots) ? hotspots : []
  ).filter((h: any) => h?.link);

  if (!image) {
    return editMode ? (
      <section
        style={{
          padding: "120px 0",
          background: "#F0EDE6",
          textAlign: "center",
          color: "#B8944E",
          fontSize: 14,
        }}
      >
        🖱️ 热区图 — 请上传背景图并配置热区
      </section>
    ) : null;
  }

  return (
    <section
      style={{
        position: "relative",
        width: "100%",
        overflow: "hidden",
        background: "#F5F2ED",
      }}
    >
      <picture>
        {mobileImage && (
          <source media="(max-width:767px)" srcSet={mobileImage} />
        )}
        <img src={image} alt="" style={{ width: "100%", display: "block" }} />
      </picture>

      {/* 热区叠加层 */}
      {validHotspots.map((h, i) => (
        <Link
          key={i}
          to={h.link}
          style={{
            position: "absolute",
            left: `${h.x}%`,
            top: `${h.y}%`,
            width: `${h.width}%`,
            height: `${h.height}%`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textDecoration: "none",
            cursor: "pointer",
            transition: "background 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(184,148,78,0.15)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
        >
          {h.label && (
            <span
              style={{
                padding: "4px 12px",
                borderRadius: 2,
                background: "rgba(0,0,0,0.5)",
                color: "#fff",
                fontSize: 11,
                letterSpacing: "0.08em",
                opacity: 0.85,
              }}
            >
              {h.label}
            </span>
          )}
        </Link>
      ))}

      {/* 编辑模式提示 */}
      {editMode && validHotspots.length === 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.06)",
          }}
        >
          <span
            style={{
              padding: "8px 20px",
              background: "rgba(0,0,0,0.6)",
              color: "#fff",
              borderRadius: 4,
              fontSize: 12,
            }}
          >
            点击配置热区（content.hotspots）
          </span>
        </div>
      )}
    </section>
  );
}
