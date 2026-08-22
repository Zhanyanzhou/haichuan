import {
  CONTENT_TEMPLATE_ASSET_POLICY,
  CONTENT_TEMPLATE_CONTRACTS,
  type ContentTemplateAssetClass,
  type ContentTemplateContract,
  type ContentTemplateKey,
} from "../generated/contentTemplates.generated";

export type AssetSlotViewport = "desktop" | "mobile";
export type AssetCropDirection = "horizontal" | "vertical" | "square";

export type AssetSlotSize = {
  width: number;
  height: number;
  ratio: string;
};

export type AssetSlotContract = {
  templateKey: ContentTemplateKey;
  moduleType: string;
  slotId: string;
  visualRole: string;
  assetClass: ContentTemplateAssetClass;
  ratioByViewport: Partial<Record<AssetSlotViewport, string>>;
  minimumSizeByViewport: Partial<Record<AssetSlotViewport, AssetSlotSize>>;
  cropDirectionByViewport: Partial<Record<AssetSlotViewport, AssetCropDirection>>;
  focusMode: "viewport-controlled" | "center-default";
  textSafeZoneByViewport: Record<AssetSlotViewport, "required" | "none">;
  placeholder: typeof CONTENT_TEMPLATE_ASSET_POLICY.placeholder;
};

function parseRatio(ratio: string) {
  const [rawWidth, rawHeight] = ratio.split("/");
  const width = Number(rawWidth?.trim());
  const height = Number(rawHeight?.trim());
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
    ? { width, height }
    : null;
}

function cropDirection(ratio: string): AssetCropDirection | undefined {
  const parsed = parseRatio(ratio);
  if (!parsed) return undefined;
  if (parsed.width === parsed.height) return "square";
  return parsed.width > parsed.height ? "horizontal" : "vertical";
}

/**
 * 从唯一机器合同派生空素材槽位说明；组件和 Inspector 不维护第二份比例、
 * 最小尺寸、焦点或安全带事实。
 */
export function getAssetSlotContract(
  templateKey: ContentTemplateKey,
  slotId: string,
): AssetSlotContract | null {
  const template: ContentTemplateContract = CONTENT_TEMPLATE_CONTRACTS[templateKey];
  const role = template.roles.find((item) => item.id === slotId);
  if (!role || !("assetClass" in role) || !role.assetClass) return null;

  const ratioByViewport = role.defaultRatioByViewport ?? {};
  const minimumSizeByViewport: AssetSlotContract["minimumSizeByViewport"] = {};
  const cropDirectionByViewport: AssetSlotContract["cropDirectionByViewport"] = {};

  for (const viewport of ["desktop", "mobile"] as const) {
    const ratio = ratioByViewport[viewport];
    const parsed = ratio ? parseRatio(ratio) : null;
    if (ratio && parsed) {
      const width = CONTENT_TEMPLATE_ASSET_POLICY.minimumWidthByViewport[viewport][template.width];
      minimumSizeByViewport[viewport] = {
        width,
        height: Math.round((width * parsed.height) / parsed.width),
        ratio,
      };
      cropDirectionByViewport[viewport] = cropDirection(ratio);
    }
  }

  const layoutOverrides = template.editorCapabilities.layoutOverrides;
  const slotCapability = layoutOverrides?.slots?.find((slot) => slot.roleId === slotId);
  const requiresSafeBand = Boolean(
    layoutOverrides?.textRoles?.some((textRole) => textRole.requiresSafeBand),
  );
  const appliesTo = (viewport: AssetSlotViewport) =>
    !role.appliesTo || role.appliesTo.includes(viewport);

  return {
    templateKey,
    moduleType: template.moduleType,
    slotId,
    visualRole: `${template.visualRole}/${role.role}`,
    assetClass: role.assetClass,
    ratioByViewport,
    minimumSizeByViewport,
    cropDirectionByViewport,
    focusMode: slotCapability?.focusByViewport ? "viewport-controlled" : "center-default",
    textSafeZoneByViewport: {
      desktop: appliesTo("desktop")
        && requiresSafeBand
        && template.copyPlacementByViewport.desktop === "overlay"
        ? "required"
        : "none",
      mobile: appliesTo("mobile")
        && requiresSafeBand
        && template.copyPlacementByViewport.mobile === "overlay"
        ? "required"
        : "none",
    },
    placeholder: CONTENT_TEMPLATE_ASSET_POLICY.placeholder,
  };
}

export function formatAssetSlotMinimumSize(
  contract: AssetSlotContract,
  viewport: AssetSlotViewport,
) {
  const size = contract.minimumSizeByViewport[viewport];
  return size ? `${size.width}×${size.height}（${size.ratio.replace(/\s/g, "")}）` : "不适用";
}
