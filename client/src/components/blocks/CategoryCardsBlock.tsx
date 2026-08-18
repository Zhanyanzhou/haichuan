import { Link } from "react-router-dom";
import type { CSSProperties } from "react";
import BlockEmptyPlaceholder from "@/components/blocks/_shared/BlockEmptyPlaceholder";
import { SecureImage } from "@/components/common/SecureImage";
import { CATEGORY_CARDS_CONTRACT, getCategoryCardsMediaAspectRatio, getContractRoleRatio, RESPONSIVE_CANVAS } from "@/page-builder/config/blockContracts";
import { isSafeInternalPath } from "@/page-builder/utils/linkTarget";
import { DecorSection } from "@/page-builder/designSystem/sectionShell";
import { FONT_DISPLAY } from "@/page-builder/designSystem/tokens";

interface CategoryCardsBlockProps {
  module: {
    content: Record<string, any>;
    layoutConfig?: Record<string, any>;
    styleConfig?: Record<string, any>;
  };
  editMode?: boolean;
}

/**
 * 分类导航卡片 — 大图 + 标题叠加
 * content: { title, subtitle, categories: [{image,name,link,count?,description?}], layout }
 */
export default function CategoryCardsBlock({
  module,
  editMode,
}: CategoryCardsBlockProps) {
  const { content = {}, styleConfig = {} } = module;
  const { title, subtitle, categories = [] } = content;
  const layout = module.layoutConfig?.template || content.layout || "grid-3";
  const bg = styleConfig.bgColor || "#FBF9F6";
  const cols = layout === "grid-2" ? 2 : layout === "grid-4" ? 4 : 3;
  const isSceneShopping = content.templateType === "按场景选购";
  const mediaAspectRatio = isSceneShopping
    ? getContractRoleRatio("sceneShopping", "scenes", "desktop")
    : getCategoryCardsMediaAspectRatio(layout);
  const mobileMediaAspectRatio = isSceneShopping
    ? getContractRoleRatio("sceneShopping", "scenes", "mobile")
    : getContractRoleRatio("categoryCards", "categories", "mobile");
  const normalizedCategories = Array.isArray(categories) ? categories.slice(0, CATEGORY_CARDS_CONTRACT.content.maxItems) : [];
  const visibleCategories = editMode
    ? normalizedCategories
    : normalizedCategories.filter((item: any) => item?.name && item?.image && isSafeInternalPath(item?.link));

  if (!visibleCategories.length) {
    if (!editMode) return null;
    return (
      <BlockEmptyPlaceholder
        icon="📂"
        hint="分类导航卡片"
        spec="请在右侧配置分类数据"
        bg={bg}
      />
    );
  }

  return (
    <DecorSection master="commerce-entry" background={bg}>
      {(title || subtitle) && (
        <div style={{ textAlign: "center", maxWidth: 560, margin: "0 auto 40px" }}>
          {title && <h2 style={{ fontSize: 'var(--hc-type-h2, clamp(22px,2.5vw,34px))', fontFamily: `var(--hc-font-display, ${FONT_DISPLAY})`, color: "#2C2C2C", margin: "0 0 10px", lineHeight: 1.2 }}>{title}</h2>}
          {subtitle && <p style={{ margin: 0, color: "#8A7F72", fontSize: 13, lineHeight: 1.7 }}>{subtitle}</p>}
        </div>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gap: cols === 2 ? 24 : 16,
          "--hc-entry-ratio-desktop": mediaAspectRatio,
          "--hc-entry-ratio-mobile": mobileMediaAspectRatio,
        } as CSSProperties}
        className="homepage-category-cards__grid"
      >
          {visibleCategories.map((c: any, i: number) => {
            const card = (
              <div
                data-editor-field={`categories.${i}`}
              style={{
                display: "block",
                position: "relative",
                overflow: "hidden",
                height: "100%",
              }}
              className="group"
            >
              <div
                className="homepage-category-cards__media"
                style={{
                  overflow: "hidden",
                  background: "#EDE9E2",
                }}
              >
                {c.image ? (
                  <SecureImage
                    src={c.image}
                    alt={c.altText || c.name || "分类导航图片"}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      objectPosition: `${Number(c.focusX ?? 50)}% ${Number(c.focusY ?? 50)}%`,
                      transition: "transform 0.7s ease",
                    }}
                    className="group-hover:scale-105"
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#C4BFB5",
                      fontSize: editMode ? 0 : 28,
                      backgroundImage: editMode
                        ? "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='118' height='84' viewBox='0 0 118 84' fill='none'%3E%3Cpath d='M16 28.5c0-4.6 3.7-8.3 8.3-8.3 3.6 0 6.7 2.3 7.8 5.6a7.7 7.7 0 0111.3 6.8c0 4.3-3.5 7.8-7.8 7.8H17.8A8.2 8.2 0 0116 28.5zM82 49.6c0-3.9 3.1-7 7-7 3.1 0 5.8 2 6.7 4.8a6.6 6.6 0 019.7 5.8c0 3.7-3 6.7-6.7 6.7H83.6A7 7 0 0182 49.6z' stroke='%23D9E0E9' stroke-width='1.5'/%3E%3Crect x='43' y='27' width='38' height='31' rx='3.5' stroke='%233687F5' stroke-width='2'/%3E%3Cpath d='M46.5 53l8.6-8.2 7.2 6 5.8-5.2 9.5 8.4' stroke='%233687F5' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3Ccircle cx='71.2' cy='36.8' r='3.6' stroke='%233687F5' stroke-width='2'/%3E%3Cpath d='M32 68.5h54' stroke='%23E7EBF1' stroke-width='3' stroke-linecap='round'/%3E%3C/svg%3E\")"
                        : undefined,
                      backgroundPosition: "center",
                      backgroundRepeat: "no-repeat",
                    }}
                  >
                    📷
                  </div>
                )}
              </div>
              {/* 底部渐变 + 文字叠加 */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "linear-gradient(to top, rgba(15,13,12,0.45) 0%, rgba(15,13,12,0.02) 55%, transparent 100%)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  bottom: 20,
                  left: 20,
                  right: 20,
                }}
              >
                <p
                  style={{
                    color: "#fff",
                    fontSize: 15,
                    fontWeight: 500,
                    letterSpacing: "0.05em",
                    margin: 0,
                  }}
                >
                  {c.name || "分类名称"}
                </p>
                {c.description ? (
                  <p style={{ color: "rgba(255,255,255,0.72)", fontSize: 11, margin: "4px 0 0", lineHeight: 1.45 }}>{c.description}</p>
                ) : c.count && (
                  <p
                    style={{
                      color: "rgba(255,255,255,0.65)",
                      fontSize: 11,
                      margin: "4px 0 0",
                    }}
                  >
                    {c.count} 件作品
                  </p>
                )}
              </div>
              </div>
            );
            return editMode || !isSafeInternalPath(c.link) ? (
              <div key={c.id || `${c.name}-${i}`}>{card}</div>
            ) : (
              <Link key={c.id || `${c.name}-${i}`} to={c.link} style={{ display: "block", textDecoration: "none" }}>{card}</Link>
            );
          })}
      </div>
      <style>{`
        .homepage-category-cards__media { aspect-ratio: var(--hc-entry-ratio-desktop); }
        @media ${RESPONSIVE_CANVAS.tabletMediaQuery} {
          .homepage-category-cards__grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 20px !important; }
        }
        /* Mobile 两列(入口卡组母版规则) */
        @media (max-width: 767px) {
          .homepage-category-cards__grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 12px !important; }
          .homepage-category-cards__media { aspect-ratio: var(--hc-entry-ratio-mobile); }
        }
      `}</style>
    </DecorSection>
  );
}
