import { Link } from "react-router-dom";
import BlockEmptyPlaceholder from "@/components/blocks/_shared/BlockEmptyPlaceholder";
import { GALLERY_CONTRACT, resolveContractAspectRatio } from "@/page-builder/config/blockContracts";
import { DecorSection } from "@/page-builder/designSystem/sectionShell";
import { FONT_DISPLAY, FONT_SANS } from "@/page-builder/designSystem/tokens";
import { resolveItemLinkUrl } from "@/page-builder/utils/linkTarget";
import type { RenderablePageModule } from "@/types/pageModule";

interface GalleryItem {
  image?: string;
  altText?: string;
  caption?: string;
  link?: unknown;
  focusX?: number;
  focusY?: number;
}

interface GalleryBlockProps {
  module: RenderablePageModule;
  editMode?: boolean;
}

const INK = "#181A1B";
const MUTED = "#6E7477";

/**
 * 作品画廊 — Asymmetric Gallery 母版
 * 桌面 12 栅非对称节奏:p0 大图(8列) → p1 小图(4列,下移错位) →
 * p2 小图(4列) → p3 宽图(8列,右对齐),按索引循环;
 * 非对称来自列宽跨度,四个位置帧共用槽位所选统一比例;
 * Mobile 重排:大图全宽 → 成对小图双列 → 大图全宽。
 * 构图红线:禁止均分 2×2 / 3×1 / 4×1。
 */
export default function AsymmetricGalleryBlock({ module, editMode }: GalleryBlockProps) {
  const { content = {}, styleConfig = {} } = module;
  const { title, subtitle } = content;
  const items: GalleryItem[] = Array.isArray(content.items)
    ? content.items.slice(0, GALLERY_CONTRACT.content.maxItems)
    : [];
  const bgColor = styleConfig.bgColor || "#FFFFFF";
  // 槽位比例选项(契约派生)
  const galleryRatio = resolveContractAspectRatio("gallery", "works", content.aspectRatio, "desktop");
  const galleryRatioMobile = resolveContractAspectRatio("gallery", "works", content.aspectRatio, "mobile");

  if (items.length === 0) {
    if (!editMode) return null;
    return (
      <DecorSection master="asymmetric-gallery" background={bgColor}>
        <BlockEmptyPlaceholder
          assetSlot={{ templateKey: "gallery", roleId: "works" }}
          hint="作品画廊"
          spec="请添加 3–5 张图片,形成「大图 + 双图 + 大图」的画廊节奏"
          ratio={galleryRatio}
        />
      </DecorSection>
    );
  }

  const figure = (item: GalleryItem, index: number) => {
    const pattern = index % 4;
    const body = (
      <>
        <div className="hc-gallery__frame">
          <img
            src={item.image}
            alt={item.altText || item.caption || "作品图"}
            loading="lazy"
            decoding="async"
            className="hc-gallery__img"
            style={{
              objectPosition: `${Number(item.focusX ?? 50)}% ${Number(item.focusY ?? 50)}%`,
            }}
          />
        </div>
        {item.caption ? (
          <p
            data-editor-field={`items.${index}.caption`}
            style={{
              margin: "12px 0 0",
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: MUTED,
              fontFamily: `var(--hc-font-sans, ${FONT_SANS})`,
            }}
          >
            {item.caption}
          </p>
        ) : null}
      </>
    );
    const itemLinkUrl = resolveItemLinkUrl(item);
    const linked = Boolean(itemLinkUrl) && !editMode;
    return linked ? (
      <Link
        key={index}
        to={itemLinkUrl}
        data-editor-field={`items.${index}.image`}
        className={`hc-gallery__item is-p${pattern}`}
      >
        {body}
      </Link>
    ) : (
      <div
        key={index}
        data-editor-field={`items.${index}.image`}
        className={`hc-gallery__item is-p${pattern}`}
      >
        {body}
      </div>
    );
  };

  return (
    <DecorSection master="asymmetric-gallery" background={bgColor}>
      {(title || subtitle || editMode) && (
        <header data-content-role="copy" style={{ maxWidth: 640, margin: "0 auto 48px", textAlign: "center" }}>
          {title ? (
            <h2
              data-editor-field="title"
              style={{
                margin: "0 0 12px",
                fontFamily: `var(--hc-font-display, ${FONT_DISPLAY})`,
                fontSize: "var(--hc-type-h2, clamp(26px,3vw,38px))",
                fontWeight: 500,
                color: INK,
                lineHeight: 1.2,
              }}
            >
              {title}
            </h2>
          ) : null}
          {subtitle ? (
            <p data-editor-field="subtitle" style={{ margin: 0, fontSize: "var(--hc-type-body, 15px)", color: MUTED, lineHeight: 1.8 }}>
              {subtitle}
            </p>
          ) : null}
        </header>
      )}
      <div data-content-role="works" className="hc-gallery">
        <style>{`
          .hc-gallery {
            display: grid;
            grid-template-columns: repeat(12, minmax(0, 1fr));
            column-gap: clamp(16px, 2.5vw, 32px);
            row-gap: clamp(40px, 6vw, 88px);
            align-items: start;
          }
          .hc-gallery__item { display: block; min-width: 0; color: inherit; text-decoration: none; }
          .hc-gallery__frame { background: #DDE1E2; overflow: hidden; }
          .hc-gallery__img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .7s ease; }
          .hc-gallery__item:hover .hc-gallery__img { transform: scale(1.02); }
          /* 桌面非对称节奏 */
          .hc-gallery__item.is-p0 { grid-column: span 8; }
          .hc-gallery__item.is-p0 .hc-gallery__frame { aspect-ratio: ${galleryRatio}; }
          .hc-gallery__item.is-p1 { grid-column: span 4; margin-top: clamp(32px, 8%, 96px); }
          .hc-gallery__item.is-p1 .hc-gallery__frame { aspect-ratio: ${galleryRatio}; }
          .hc-gallery__item.is-p2 { grid-column: span 4; }
          .hc-gallery__item.is-p2 .hc-gallery__frame { aspect-ratio: ${galleryRatio}; }
          .hc-gallery__item.is-p3 { grid-column: span 8; }
          .hc-gallery__item.is-p3 .hc-gallery__frame { aspect-ratio: ${galleryRatio}; }
          @media (min-width: 768px) {
            .hc-gallery__item.is-p3 { grid-column: 5 / span 8; }
          }
          /* Mobile 重排:大图全宽,成对小图双列 */
          @media (max-width: 767px) {
            .hc-gallery { row-gap: 32px; }
            .hc-gallery__item.is-p0,
            .hc-gallery__item.is-p3 { grid-column: 1 / -1; margin-top: 0; }
            .hc-gallery__item.is-p0 .hc-gallery__frame,
            .hc-gallery__item.is-p1 .hc-gallery__frame,
            .hc-gallery__item.is-p2 .hc-gallery__frame,
            .hc-gallery__item.is-p3 .hc-gallery__frame { aspect-ratio: ${galleryRatioMobile}; }
            .hc-gallery__item.is-p1,
            .hc-gallery__item.is-p2 { grid-column: span 6; }
            .hc-gallery__item.is-p1 { margin-top: 0; }
          }
          @media (prefers-reduced-motion: reduce) {
            .hc-gallery__img { transition: none; }
            .hc-gallery__item:hover .hc-gallery__img { transform: none; }
          }
        `}</style>
        {items.map((item, index) => figure(item, index))}
      </div>
    </DecorSection>
  );
}
