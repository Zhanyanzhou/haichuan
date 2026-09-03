import { RESPONSIVE_CANVAS } from "../config/blockContracts";
import type {
  DynamicTemplateDevice,
  DynamicTemplateHeightRule,
  DynamicTemplateResponsiveRules,
  TemplateDefinitionV2,
} from "./generated/templateDefinition.generated";

export type TemplateDesignHeightMode = "fixed" | "aspect-ratio" | "auto";

export interface TemplateDesignFrame {
  sourceWidth: number;
  heightMode: TemplateDesignHeightMode;
  fallbackHeight: number;
  ratioLabel: string;
  rootRules: DynamicTemplateResponsiveRules;
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(Math.round(left));
  let b = Math.abs(Math.round(right));
  while (b > 0) [a, b] = [b, a % b];
  return a || 1;
}

export function formatTemplateRatio(width: number, height: number): string {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return "auto";
  }
  const divisor = greatestCommonDivisor(width, height);
  return `${Math.round(width) / divisor}:${Math.round(height) / divisor}`;
}

export function parseTemplateRatio(
  value: string | undefined,
): { width: number; height: number } | undefined {
  const match = /^(\d+):(\d+)$/.exec(value ?? "");
  if (!match) return undefined;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return undefined;
  }
  return { width, height };
}

function getDesignWidth(definition: TemplateDefinitionV2, device: DynamicTemplateDevice): number {
  return device === "desktop"
    ? definition.metadata.previewDesktopWidth ?? RESPONSIVE_CANVAS.desktop.width
    : definition.metadata.previewMobileWidth ?? RESPONSIVE_CANVAS.mobile.width;
}

function getCompatibilityRatio(
  definition: TemplateDefinitionV2,
  device: DynamicTemplateDevice,
) {
  return parseTemplateRatio(
    device === "desktop" ? definition.metadata.desktopRatio : definition.metadata.mobileRatio,
  );
}

/**
 * 根节点响应式高度是运行时尺寸的唯一事实源。旧模板仅在根节点仍为 auto、
 * 但兼容比例字段已有明确值时，临时将该比例解释为根规则，保证迁移期间
 * 编辑器、缩略图和公共 Renderer 不再出现两套高度。
 */
export function getEffectiveTemplateRootRules(
  definition: TemplateDefinitionV2,
  device: DynamicTemplateDevice,
): DynamicTemplateResponsiveRules {
  const root = definition.nodes[definition.rootNodeId];
  const rules = root?.responsive[device];
  if (!rules) throw new Error(`模板根节点缺少 ${device} 响应式规则。`);
  if (rules.height.mode !== "auto") return { ...rules, width: "fill" };
  const compatibilityRatio = getCompatibilityRatio(definition, device);
  if (!compatibilityRatio) return { ...rules, width: "fill" };
  return {
    ...rules,
    width: "fill",
    height: { mode: "aspect-ratio", ratio: compatibilityRatio },
  };
}

function resolveHeightMode(rule: DynamicTemplateHeightRule): TemplateDesignHeightMode {
  if (rule.mode === "fixed") return "fixed";
  if (rule.mode === "aspect-ratio") return "aspect-ratio";
  return "auto";
}

export function resolveTemplateDesignFrame(
  definition: TemplateDefinitionV2,
  device: DynamicTemplateDevice,
): TemplateDesignFrame {
  const sourceWidth = getDesignWidth(definition, device);
  const rootRules = getEffectiveTemplateRootRules(definition, device);
  const baseline = RESPONSIVE_CANVAS[device];
  const heightMode = resolveHeightMode(rootRules.height);
  if (heightMode === "fixed") {
    const fixedHeight = rootRules.height.value?.unit === "px"
      ? rootRules.height.value.value
      : undefined;
    const fallbackHeight = fixedHeight && fixedHeight > 0
      ? fixedHeight
      : baseline.height * sourceWidth / baseline.width;
    return {
      sourceWidth,
      heightMode,
      fallbackHeight,
      ratioLabel: formatTemplateRatio(sourceWidth, fallbackHeight),
      rootRules,
    };
  }
  if (heightMode === "aspect-ratio" && rootRules.height.ratio) {
    const ratio = rootRules.height.ratio;
    return {
      sourceWidth,
      heightMode,
      fallbackHeight: sourceWidth * ratio.height / ratio.width,
      ratioLabel: formatTemplateRatio(ratio.width, ratio.height),
      rootRules,
    };
  }
  return {
    sourceWidth,
    heightMode: "auto",
    fallbackHeight: baseline.height * sourceWidth / baseline.width,
    ratioLabel: "auto",
    rootRules,
  };
}

function synchronizeCompatibilityRatio(
  definition: TemplateDefinitionV2,
  device: DynamicTemplateDevice,
) {
  const frame = resolveTemplateDesignFrame(definition, device);
  if (device === "desktop") definition.metadata.desktopRatio = frame.ratioLabel;
  else definition.metadata.mobileRatio = frame.ratioLabel;
}

export function setTemplateDesignWidth(
  definition: TemplateDefinitionV2,
  device: DynamicTemplateDevice,
  width: number,
): TemplateDefinitionV2 {
  const next = structuredClone(definition);
  const safeWidth = Math.round(width);
  if (device === "desktop") next.metadata.previewDesktopWidth = safeWidth;
  else next.metadata.previewMobileWidth = safeWidth;
  synchronizeCompatibilityRatio(next, device);
  return next;
}

export function setTemplateDesignHeightMode(
  definition: TemplateDefinitionV2,
  device: DynamicTemplateDevice,
  mode: TemplateDesignHeightMode,
  value?: number | { width: number; height: number },
): TemplateDefinitionV2 {
  const next = structuredClone(definition);
  const root = next.nodes[next.rootNodeId];
  if (!root) return next;
  if (mode === "fixed") {
    const current = resolveTemplateDesignFrame(next, device).fallbackHeight;
    const height = typeof value === "number" && Number.isFinite(value) && value > 0
      ? value
      : current;
    root.responsive[device].height = {
      mode: "fixed",
      value: { value: Math.round(height), unit: "px" },
    };
  } else if (mode === "aspect-ratio") {
    const current = resolveTemplateDesignFrame(next, device);
    const ratio = typeof value === "object" && value.width > 0 && value.height > 0
      ? value
      : { width: current.sourceWidth, height: current.fallbackHeight };
    const ratioLabel = parseTemplateRatio(formatTemplateRatio(ratio.width, ratio.height))
      ?? { width: 1, height: 1 };
    root.responsive[device].height = { mode: "aspect-ratio", ratio: ratioLabel };
  } else {
    root.responsive[device].height = { mode: "auto" };
    // 兼容比例是根规则的派生值。切回随内容时必须先清掉旧比例，
    // 否则 effective rules 会把刚写入的 auto 重新解释成旧的固定比例。
    if (device === "desktop") next.metadata.desktopRatio = "auto";
    else next.metadata.mobileRatio = "auto";
  }
  synchronizeCompatibilityRatio(next, device);
  return next;
}

export function normalizeTemplateDimensionContract(
  definition: TemplateDefinitionV2,
): TemplateDefinitionV2 {
  const next = structuredClone(definition);
  for (const device of ["desktop", "mobile"] as const) {
    const root = next.nodes[next.rootNodeId];
    if (!root) continue;
    const compatibilityRatio = getCompatibilityRatio(next, device);
    if (root.responsive[device].height.mode === "auto" && compatibilityRatio) {
      root.responsive[device].height = {
        mode: "aspect-ratio",
        ratio: compatibilityRatio,
      };
    }
    synchronizeCompatibilityRatio(next, device);
  }
  return next;
}
