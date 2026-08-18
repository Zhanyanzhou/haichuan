import BlockEmptyPlaceholder from "@/components/blocks/_shared/BlockEmptyPlaceholder";
import { DecorSection } from "@/page-builder/designSystem/sectionShell";
import { FONT_DISPLAY, FONT_SANS } from "@/page-builder/designSystem/tokens";
import { IMAGE_SPECS } from "@/page-builder/config/imageSpecs";
import { getContractRoleRatio } from "@/page-builder/config/blockContracts";

interface StoreInfoBlockProps {
  module: { content: Record<string, any>; layoutConfig?: Record<string, any>; styleConfig?: Record<string, any> };
  editMode?: boolean;
}

const GOLD = "#B8944E";
const INK = "#28231F";
const MUTED = "rgba(40,35,31,0.58)";
const STORE_RATIO_DESKTOP = getContractRoleRatio("storeInfo", "store", "desktop");
const STORE_RATIO_MOBILE = getContractRoleRatio("storeInfo", "store", "mobile");

/**
 * 门店与到访 — Editorial Split 母版(信息变体)
 * 桌面:门店空间图 3:2(62%) + 到访信息(38%),Mobile 图上文下。
 * 信息行用极简文字标签,不再使用 emoji 图标。
 */
export default function StoreInfoBlock({ module, editMode }: StoreInfoBlockProps) {
  const { content = {}, styleConfig = {} } = module;
  const { storeName, address, hours, phone, mapUrl, image } = content;
  const bgColor = styleConfig.bgColor || '#FBF9F6';

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
          .hc-store-info__media { aspect-ratio: ${STORE_RATIO_DESKTOP}; overflow: hidden; background: #E5E5E2; }
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
        <div data-editor-field="image" className="hc-store-info__media">
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
        <div className="hc-store-info__copy">
          {storeName && (
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
          )}
          <div style={{ display: "grid", gap: 14 }}>
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
            <a data-editor-field="mapUrl" href={mapUrl} target="_blank" rel="noreferrer"
              style={{
                alignSelf: "flex-start",
                display: "inline-block",
                padding: "10px 30px",
                border: `1px solid ${GOLD}`,
                color: GOLD,
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
