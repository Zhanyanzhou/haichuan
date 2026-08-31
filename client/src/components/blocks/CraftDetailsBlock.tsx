import BlockEmptyPlaceholder from "@/components/blocks/_shared/BlockEmptyPlaceholder";
import { SecureImage } from "@/components/common/SecureImage";
import {
  CRAFT_DETAILS_CONTRACT,
  resolveContractAspectRatio,
} from "@/page-builder/config/blockContracts";
import { IMAGE_SPECS } from "@/page-builder/config/imageSpecs";
import { DecorSection } from "@/page-builder/designSystem/sectionShell";
import { FONT_DISPLAY, FONT_SANS } from "@/page-builder/designSystem/tokens";
import type { RenderablePageModule } from "@/types/pageModule";

interface CraftDetailsBlockProps {
  module: RenderablePageModule;
  editMode?: boolean;
}

type MediaRole = "leadImage" | "detailImageOne" | "detailImageTwo";

const MEDIA_COPY: Record<MediaRole, { label: string; spec: (typeof IMAGE_SPECS.craftDetails)[keyof typeof IMAGE_SPECS.craftDetails] }> = {
  leadImage: { label: "工艺主图", spec: IMAGE_SPECS.craftDetails.lead },
  detailImageOne: { label: "细节图一", spec: IMAGE_SPECS.craftDetails.detailOne },
  detailImageTwo: { label: "细节图二", spec: IMAGE_SPECS.craftDetails.detailTwo },
};

function CraftMedia({
  roleId,
  src,
  alt,
  ratio,
  focusX,
  focusY,
  editMode,
}: {
  roleId: MediaRole;
  src?: string;
  alt?: string;
  ratio: string;
  focusX: number;
  focusY: number;
  editMode?: boolean;
}) {
  const copy = MEDIA_COPY[roleId];
  return (
    <div
      data-content-role={roleId}
      data-editor-field={`${roleId} ${roleId === "leadImage" ? "leadAltText" : roleId === "detailImageOne" ? "detailOneAltText" : "detailTwoAltText"}`}
      className={`hc-craft-details__media is-${roleId}`}
      style={{ aspectRatio: ratio }}
    >
      {src ? (
        <SecureImage
          src={src}
          alt={alt || ""}
          style={{
            width: "100%",
            height: "100%",
            display: "block",
            objectFit: "cover",
            objectPosition: `${focusX}% ${focusY}%`,
          }}
        />
      ) : editMode ? (
        <BlockEmptyPlaceholder
          assetSlot={{ templateKey: "craftDetails", roleId }}
          hint={copy.label}
          spec={copy.spec.label}
          ratio={ratio}
          height="100%"
        />
      ) : null}
    </div>
  );
}

/**
 * 工艺细节 — 一张主图建立焦点，两张方形细节补充观察。
 * DOM 顺序固定为主图 → 文案 → 细节一 → 细节二；桌面仅改变网格位置，
 * 手机端保持同一阅读顺序，避免视觉排序与无障碍顺序分离。
 */
export default function CraftDetailsBlock({ module, editMode }: CraftDetailsBlockProps) {
  const { content = {}, styleConfig = {} } = module;
  const {
    eyebrow,
    title,
    body,
    leadImage,
    leadAltText,
    detailImageOne,
    detailOneAltText,
    detailImageTwo,
    detailTwoAltText,
  } = content;
  const background = styleConfig.bgColor || "#FFFFFF";
  const leadDesktopRatio = resolveContractAspectRatio("craftDetails", "leadImage", content.leadImageRatio, "desktop");
  const leadMobileRatio = resolveContractAspectRatio("craftDetails", "leadImage", content.leadImageRatio, "mobile");
  const detailOneRatio = resolveContractAspectRatio("craftDetails", "detailImageOne", content.detailOneRatio, "desktop");
  const detailTwoRatio = resolveContractAspectRatio("craftDetails", "detailImageTwo", content.detailTwoRatio, "desktop");

  return (
    <DecorSection master="editorial-story" background={background}>
      <div className="hc-craft-details">
        <style>{`
          .hc-craft-details {
            display: grid;
            grid-template-columns: repeat(12, minmax(0, 1fr));
            column-gap: clamp(18px, 2.5vw, 36px);
            row-gap: clamp(28px, 4vw, 56px);
            align-items: start;
          }
          .hc-craft-details__media { min-width: 0; overflow: hidden; background: #F4F5F5; }
          .hc-craft-details__media.is-leadImage { grid-column: 5 / span 8; grid-row: 1; }
          .hc-craft-details__copy { grid-column: 1 / span 3; grid-row: 1; align-self: center; max-width: 360px; }
          .hc-craft-details__media.is-detailImageOne { grid-column: 5 / span 4; grid-row: 2; }
          .hc-craft-details__media.is-detailImageTwo { grid-column: 9 / span 4; grid-row: 2; }
          @media (min-width: 768px) and (max-width: 1023px) {
            .hc-craft-details__copy { grid-column: 1 / span 4; }
          }
          @media (max-width: 767px) {
            .hc-craft-details { grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 12px; row-gap: 28px; }
            .hc-craft-details__media.is-leadImage { grid-column: 1 / -1; grid-row: 1; aspect-ratio: ${leadMobileRatio} !important; }
            .hc-craft-details__copy { grid-column: 1 / -1; grid-row: 2; max-width: none; padding: 4px 0 8px; }
            .hc-craft-details__media.is-detailImageOne { grid-column: 1; grid-row: 3; }
            .hc-craft-details__media.is-detailImageTwo { grid-column: 2; grid-row: 3; }
          }
        `}</style>
        <CraftMedia
          roleId="leadImage"
          src={leadImage}
          alt={leadAltText}
          ratio={leadDesktopRatio}
          focusX={Number(styleConfig.leadFocusX ?? 50)}
          focusY={Number(styleConfig.leadFocusY ?? 50)}
          editMode={editMode}
        />
        <header data-content-role="copy" className="hc-craft-details__copy">
          {eyebrow ? (
            <p data-editor-field="eyebrow" style={{ margin: "0 0 14px", fontFamily: `var(--hc-font-sans, ${FONT_SANS})`, fontSize: 11, letterSpacing: "0.16em", color: "#6E7477" }}>
              {eyebrow}
            </p>
          ) : null}
          {title || editMode ? (
            <h2 data-editor-field="title" style={{ margin: "0 0 18px", fontFamily: `var(--hc-font-display, ${FONT_DISPLAY})`, fontSize: "var(--hc-type-h2, clamp(28px, 3vw, 42px))", fontWeight: 400, lineHeight: 1.16, color: "#181A1B" }}>
              {title || "工艺细节"}
            </h2>
          ) : null}
          {body ? (
            <p data-editor-field="body" style={{ margin: 0, fontFamily: `var(--hc-font-sans, ${FONT_SANS})`, fontSize: "var(--hc-type-body, 14px)", lineHeight: 1.8, color: "#5F6568" }}>
              {body}
            </p>
          ) : null}
        </header>
        <CraftMedia
          roleId="detailImageOne"
          src={detailImageOne}
          alt={detailOneAltText}
          ratio={detailOneRatio}
          focusX={Number(styleConfig.detailOneFocusX ?? 50)}
          focusY={Number(styleConfig.detailOneFocusY ?? 50)}
          editMode={editMode}
        />
        <CraftMedia
          roleId="detailImageTwo"
          src={detailImageTwo}
          alt={detailTwoAltText}
          ratio={detailTwoRatio}
          focusX={Number(styleConfig.detailTwoFocusX ?? 50)}
          focusY={Number(styleConfig.detailTwoFocusY ?? 50)}
          editMode={editMode}
        />
      </div>
    </DecorSection>
  );
}
