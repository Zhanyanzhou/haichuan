/** 首屏测试模板与通用画布使用的最小合同。 */
import { CONTENT_TEMPLATE_CONTRACTS } from "../generated/contentTemplates.generated";
import {
  normalizeLinkTargetType,
  resolveLinkTargetUrl,
  type LinkTargetValue,
} from "../utils/linkTarget";

export type ContractKey = keyof typeof CONTENT_TEMPLATE_CONTRACTS;
type ContractViewport = "desktop" | "mobile";

export function getContractRoleRatio(
  key: ContractKey,
  roleId: string,
  viewport: ContractViewport,
): string {
  const role = CONTENT_TEMPLATE_CONTRACTS[key].roles.find((item) => item.id === roleId);
  const ratioMap = role && "defaultRatioByViewport" in role
    ? role.defaultRatioByViewport as Partial<Record<ContractViewport, string>>
    : undefined;
  const ratio = ratioMap?.[viewport];
  if (!ratio) throw new Error(`内容模板 ${String(key)}.${roleId}.${viewport} 缺少默认比例`);
  return ratio;
}

export function getContractRoleRatioPresets(
  key: ContractKey,
  roleId: string,
  viewport: ContractViewport,
): readonly string[] {
  const role = CONTENT_TEMPLATE_CONTRACTS[key].roles.find((item) => item.id === roleId);
  const presetMap = role && "allowedRatioPresetsByViewport" in role
    ? role.allowedRatioPresetsByViewport as Partial<Record<ContractViewport, readonly string[]>>
    : undefined;
  return presetMap?.[viewport] ?? [getContractRoleRatio(key, roleId, viewport)];
}

export function getContractRoleQuantity(
  key: ContractKey,
  roleId: string,
): { default: number; min: number; max: number } {
  const role = CONTENT_TEMPLATE_CONTRACTS[key].roles.find((item) => item.id === roleId);
  const quantity = role && "quantity" in role
    ? role.quantity as { default: number; min: number; max: number } | undefined
    : undefined;
  if (!quantity) throw new Error(`内容模板 ${String(key)}.${roleId} 缺少条目数量合同`);
  return quantity;
}

export function resolveContractAspectRatio(
  key: ContractKey,
  roleId: string,
  requested: string | undefined,
  viewport: ContractViewport,
): string {
  const presets = getContractRoleRatioPresets(key, roleId, viewport);
  const normalized = requested?.trim().replace(":", " / ");
  return normalized && presets.includes(normalized)
    ? normalized
    : getContractRoleRatio(key, roleId, viewport);
}

export function getContractFrameAspectRatio(
  key: ContractKey,
  viewport: ContractViewport,
): number {
  return CONTENT_TEMPLATE_CONTRACTS[key].defaultGeometryByViewport[viewport].frameAspectRatio;
}

export const RESPONSIVE_CANVAS = {
  desktop: { width: 1920, height: 1200 },
  mobile: { width: 390, height: 844 },
  compactDesktopMediaQuery: "(min-width: 768px) and (max-width: 1023px)",
  mobileMaxWidth: 767,
  mobileMediaQuery: "(max-width: 767px)",
} as const;

export function isMobileCanvasWidth(width: number | "100%"): boolean {
  return typeof width === "number" && width <= RESPONSIVE_CANVAS.mobileMaxWidth;
}

export interface ModuleContractStatus {
  completed: number;
  total: number;
  errors: string[];
  warnings: string[];
}

export interface HeroContractProps extends LinkTargetValue {
  desktopImage?: string;
  mobileImage?: string;
  title?: string;
  subtitle?: string;
  actionText?: string;
  altText?: string;
}

export const HERO_CONTRACT = {
  type: "首屏主视觉",
  purpose: "用全屏视觉建立网站的第一品牌印象，并提供一个清晰行动入口。",
  canvas: {
    heightMode: "viewport",
    desktopMediaAspectRatio: CONTENT_TEMPLATE_CONTRACTS.hero.media[0].desktopRatio,
    mobileMediaAspectRatio: CONTENT_TEMPLATE_CONTRACTS.hero.media[1].mobileRatio,
    independentFocus: true,
  },
  content: { limits: CONTENT_TEMPLATE_CONTRACTS.hero.contentBudget.limits },
} as const;

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function evaluateLinkTarget(value: LinkTargetValue): { ready: boolean; error?: string } {
  const targetType = normalizeLinkTargetType(value);
  if (targetType === "none") return { ready: true };
  if (resolveLinkTargetUrl(value)) return { ready: true };
  if (targetType === "product") return { ready: false, error: "请选择跳转商品" };
  if (targetType === "category") return { ready: false, error: "请选择跳转分类" };
  if (targetType === "external") return { ready: false, error: "请输入完整的 HTTPS 外部链接" };
  return { ready: false, error: "请选择已登记的公开页面" };
}

export function evaluateHeroContract(props: HeroContractProps): ModuleContractStatus {
  const target = evaluateLinkTarget(props);
  const checks = [
    hasText(props.title),
    hasText(props.desktopImage),
    hasText(props.mobileImage),
    hasText(props.altText),
    target.ready,
  ];
  const errors: string[] = [];
  if (!hasText(props.title)) errors.push("请填写公开页面主标题");
  if (!hasText(props.desktopImage)) errors.push("请上传桌面端主视觉");
  if (!hasText(props.mobileImage)) errors.push("请上传手机端主视觉并单独确认裁切");
  if (!hasText(props.altText)) errors.push("请填写图片替代文字");
  if (target.error) errors.push(target.error);
  return { completed: checks.filter(Boolean).length, total: checks.length, errors, warnings: [] };
}
