import BlockEmptyPlaceholder from "@/components/blocks/_shared/BlockEmptyPlaceholder";
import { DecorSection } from "@/page-builder/designSystem/sectionShell";
import { FONT_DISPLAY, FONT_SANS } from "@/page-builder/designSystem/tokens";
import { IMAGE_SPECS } from "@/page-builder/config/imageSpecs";
import { resolveContractAspectRatio } from "@/page-builder/config/blockContracts";
import { usePublicSiteSettings } from "@/hooks/usePublicSiteSettings";
import type { RenderablePageModule } from "@/types/pageModule";

interface StoreInfoBlockProps {
  module: RenderablePageModule;
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
  const { image } = content;
  const siteSettingsResource = usePublicSiteSettings();
  const unifiedSettings = siteSettingsResource.status === "loaded"
    ? siteSettingsResource.settings
    : undefined;
  const resolvedAddress = String(unifiedSettings?.contactAddress || "");
  const resolvedHours = String(unifiedSettings?.businessHours || "");
  const resolvedPhone = String(unifiedSettings?.contactPhone || "");
  const rawMapUrl = String(unifiedSettings?.storeMapUrl || "").trim();
  // 与内容合同 externalLinkProtocol=https-only 保持一致：http 链接不渲染，避免混合内容
  const resolvedMapUrl = /^https:\/\//i.test(rawMapUrl) ? rawMapUrl : "";
  const hasVisitDetails = Boolean(
    resolvedAddress || resolvedHours || resolvedPhone || resolvedMapUrl,
  );
  const configuredStoreName = String(unifiedSettings?.storeName || "");
  const resolvedStoreName = configuredStoreName
    || (hasVisitDetails ? String(unifiedSettings?.siteName || "") : "");
  const hasStoreFacts = Boolean(
    resolvedStoreName || hasVisitDetails,
  );
  const showCopy = Boolean(editMode || hasStoreFacts);
  const bgColor = styleConfig.bgColor || '#FFFFFF';
  // 槽位比例选项(契约派生):门店空间图属横构图物性,预设不含纯竖版
  const STORE_RATIO_DESKTOP = resolveContractAspectRatio("storeInfo", "store", content.imageRatio, "desktop");
  const STORE_RATIO_MOBILE = resolveContractAspectRatio("storeInfo", "store", content.imageRatio, "mobile");

  const infoRows: Array<{ label: string; value?: string }> = [
    { label: "ADDRESS", value: resolvedAddress },
    { label: "HOURS", value: resolvedHours },
    { label: "CONTACT", value: resolvedPhone },
  ];

  if (!editMode && !image && !hasStoreFacts) return null;

  return (
    <DecorSection master="editorial-split" background={bgColor}>
      <div className={`hc-store-info${showCopy ? "" : " hc-store-info--media-only"}`}>
        <style>{`
          .hc-store-info {
            display: grid;
            grid-template-columns: 62fr 38fr;
            gap: clamp(28px, 4vw, 56px);
            align-items: stretch;
            overflow: hidden;
          }
          .hc-store-info--media-only { grid-template-columns: minmax(0, 1fr); }
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
            <img src={image} alt={resolvedStoreName || "门店空间"} loading="lazy" decoding="async" />
          ) : (
            <BlockEmptyPlaceholder
              assetSlot={{ templateKey: "storeInfo", roleId: "store" }}
              hint="门店空间"
              spec={`请上传门店空间图 · ${IMAGE_SPECS.storeInfo.image.label}`}
              height="100%"
            />
          )}
        </div>
        {showCopy ? (
        <div className="hc-store-info__copy" data-content-role="copy">
          {resolvedStoreName ? (
            <h2
              style={{
                margin: 0,
                fontFamily: `var(--hc-font-display, ${FONT_DISPLAY})`,
                fontSize: "var(--hc-type-h2, clamp(26px,2.8vw,38px))",
                color: INK,
                fontWeight: 500,
                lineHeight: 1.2,
              }}
            >
              {resolvedStoreName}
            </h2>
          ) : null}
          {editMode && siteSettingsResource.status === "loading" ? (
            <p role="status" style={{ margin: 0, color: MUTED }}>
              正在读取统一门店资料…
            </p>
          ) : null}
          {editMode && siteSettingsResource.status === "error" ? (
            <p role="status" style={{ margin: 0, color: MUTED }}>
              统一门店资料暂时无法读取，请稍后重试。
            </p>
          ) : null}
          {editMode && siteSettingsResource.status === "loaded" && !hasStoreFacts ? (
            <p role="status" style={{ margin: 0, color: MUTED }}>
              请先在「店铺资料」中维护门店名称、地址、营业时间和电话。
            </p>
          ) : null}
          <div data-content-role="details" style={{ display: "grid", gap: 14 }}>
            {infoRows.filter((row) => row.value).map((row) => (
              <p key={row.label}
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
          {resolvedMapUrl && (
            <a
              data-content-role="action"
              href={resolvedMapUrl}
              target="_blank"
              rel="noreferrer"
              onClick={editMode ? (event) => event.preventDefault() : undefined}
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
        ) : null}
      </div>
    </DecorSection>
  );
}
