import {
  CONTENT_TEMPLATE_ASSET_POLICY,
  CONTENT_TEMPLATE_CONTRACTS,
} from "../generated/contentTemplates.generated";
import { getContractRoleRatio } from "./blockContracts";

type SpecViewport = "desktop" | "mobile";

function contractSpec({
  template,
  role,
  viewport,
  note,
}: {
  template: "hero";
  role: string;
  viewport: SpecViewport;
  note: string;
}) {
  const contract = CONTENT_TEMPLATE_CONTRACTS[template];
  const baseWidth = CONTENT_TEMPLATE_ASSET_POLICY.minimumWidthByViewport[viewport][contract.width];
  const ratio = getContractRoleRatio(template, role, viewport);
  const [num, den] = ratio.split("/").map((part) => Number(part.trim()));
  const height = Math.round((baseWidth * den) / num);
  return {
    width: baseWidth,
    height,
    ratio,
    label: `${note}（建议至少 ${baseWidth}×${height}，${num}:${den}）`,
  };
}

export function ratioLabelOf(spec: { ratio: string } | undefined | null): string {
  return spec
    ? spec.ratio.split("/").map((part) => part.trim()).join(":")
    : "";
}

export const IMAGE_SPECS = {
  hero: {
    desktop: contractSpec({ template: "hero", role: "desktopImage", viewport: "desktop", note: "桌面端主视觉" }),
    mobile: contractSpec({ template: "hero", role: "mobileImage", viewport: "mobile", note: "移动端主视觉" }),
  },
} as const;
