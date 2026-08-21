import BlockEmptyPlaceholder from "@/components/blocks/_shared/BlockEmptyPlaceholder";
import { DecorSection } from "@/page-builder/designSystem/sectionShell";
import { FONT_DISPLAY, FONT_SANS } from "@/page-builder/designSystem/tokens";
import { IMAGE_SPECS } from "@/page-builder/config/imageSpecs";
import { resolveContractAspectRatio } from "@/page-builder/config/blockContracts";

interface StoreInfoBlockProps {
  module: { content: Record<string, any>; layoutConfig?: Record<string, any>; styleConfig?: Record<string, any> };
  editMode?: boolean;
}

const GOLD = "#6E7477";
const INK = "#181A1B";
const MUTED = "#6E7477";

/**
 * 门店与到访 — Editorial Split 母版(信息变体)
 * 桌面:门店空间图(默认 3:2,可选项)占 62% + 到访信息占 38%,Mobile 图上文下。
 * 信息行用极简文字标签,不再使用 emoji 图标。
 */
export default function StoreInfoBlock({ module, editMode }: StoreInfoBlockProps) {
  const { content = {}, styleConfig = {} } = module;
  const { storeName, address, hours, phone, mapUrl, image } = content;
  const bgColor = styleConfig.bgColor || '#FFFFFF';
  // 槽位比例选项(契约派生):门店空间图属横构图物性,预设不含纯竖版
  const STORE_RATIO_DESKTOP = resolveContractAspectRatio("storeInfo", "store", content.imageRatio, "desktop");
  const STORE_RATIO_MOBILE = resolveContractAspectRatio("storeInfo", "store", content.imageRatio, "mobile");

  const infoRows: Array<{ label: string; value?: string }> = [
    { label: "ADDRESS", value: address },
    { label: "HOURS", value: hours },
    { label: "CONTACT", value: phone },
  ];

  return (
    <DecorSection master="editorial-split" background={bgColor}>
      <div className="hc-store-info">
        <style>{`
          .hc-store-info {
            display: grid;
            grid-template-columns: 62fr 38fr;
            gap: clamp(28px, 4vw, 56px);
            align-items: stretch;
          }
          .hc-store-info__media { aspect-ratio: ${STORE_RATIO_DESKTOP}; overflow: hidden; background: #F4F5F5; }
          .hc-store-info__media img { width: 100%; height: 100%; object-fit: cover; display: block; }
          .hc-store-info__copy {
            min-width: 0; display: flex; flex-direction: column;
            justify-content: center; gap: 22px;
          }
          @media (max-width: 767px) {
            .hc-store-info { grid-template-columns: minmax(0, 1fr); gap: 28px; }
            .hc-store-info__media { order: 0; aspect-ratio: ${STORE_RATIO_MOBILE}; }
            .hc-store-info__copy { order: 1; gap: 18px; }
          }
        `}</style>
        <div data-content-role="store" data-editor-field="image" className="hc-store-info__media">
          {image ? (
            <img src={image} alt={storeName || "门店空间"} loading="lazy" decoding="async" />
          ) : (
            <BlockEmptyPlaceholder
              hint="门店空间"
              spec={`请上传门店空间图 · ${IMAGE_SPECS.storeInfo.image.label}`}
              height="100%"
            />
          )}
        </div>
        <div className="hc-store-info__copy" data-content-role="copy">
          {storeName ? (
            <h2 data-editor-field="storeName"
              style={{
                margin: 0,
                fontFamily: `var(--hc-font-display, ${FONT_DISPLAY})`,
                fontSize: "var(--hc-type-h2, clamp(26px,2.8vw,38px))",
                color: INK,
                fontWeight: 500,
                lineHeight: 1.2,
              }}
            >
              {storeName}
            </h2>
          ) : null}
          <div data-content-role="details" style={{ display: "grid", gap: 14 }}>
            {infoRows.filter((row) => row.value).map((row) => (
              <p key={row.label}
                data-editor-field={row.label === "ADDRESS" ? "address" : row.label === "HOURS" ? "hours" : "phone"}
                style={{ margin: 0, display: "grid", gap: 4 }}
              >
                <span
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.22em",
                    color: GOLD,
                    fontFamily: `var(--hc-font-sans, ${FONT_SANS})`,
                  }}
                >
                  {row.label}
                </span>
                <span style={{ fontSize: "var(--hc-type-body, 15px)", color: MUTED, lineHeight: 1.7 }}>
                  {row.value}
                </span>
              </p>
            ))}
          </div>
          {mapUrl && (
            <a data-content-role="action" data-editor-field="mapUrl" href={mapUrl} target="_blank" rel="noreferrer"
              style={{
                alignSelf: "flex-start",
                display: "inline-block",
                paddingBottom: 6,
                borderBottom: `1px solid ${INK}`,
                color: INK,
                fontSize: "var(--hc-type-caption, 12px)",
                letterSpacing: "0.12em",
                textDecoration: "none",
                fontFamily: `var(--hc-font-sans, ${FONT_SANS})`,
              }}
            >
              查看地图 →
            </a>
          )}
        </div>
      </div>
    </DecorSection>
  );
}
