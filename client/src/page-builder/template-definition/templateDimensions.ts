import { RESPONSIVE_CANVAS } from "../config/blockContracts";
import type {
  TemplateBreakpoint,
  DynamicTemplateHeightRule,
  DynamicTemplateResponsiveRules,
  TemplateDefinitionV2,
} from "./generated/templateDefinition.generated";
import { STANDARD_TEMPLATE_CANVAS_PAIRS, swapCanvasRatio, type PairedCanvasRatio } from "./pairedCanvas";
export { STANDARD_TEMPLATE_CANVAS_PAIRS } from "./pairedCanvas";
import { resolveTemplateNodeRules, setTemplateNodeRule, toTemplateContentBreakpoint } from "./responsive";

export type TemplateDesignHeightMode = "fixed" | "aspect-ratio" | "auto";

export interface TemplateDesignFrame {
  sourceWidth: number;
  heightMode: TemplateDesignHeightMode;
  fallbackHeight: number;
  ratioLabel: string;
  rootRules: DynamicTemplateResponsiveRules;
  /** 手机画布由桌面固定横图对换而来，定义里的手机高度仍是 auto，直到作者另存。 */
  pairedCanvas?: boolean;
}

/** 读数一律显示最近的常用比例。21:9 只在已经贴近时贴齐，不写入固定比例。禁止把像素约成 10:21 这类分数。 */
const NAMED_TEMPLATE_RATIOS: ReadonlyArray<readonly [number, number]> = [
  [21, 9],
  [2, 1],
  [16, 9],
  [3, 2],
  [4, 3],
  [5, 4],
  [1, 1],
  [1, 2],
  [4, 5],
  [3, 4],
  [2, 3],
  [9, 16],
];
const STORABLE_TEMPLATE_RATIOS = NAMED_TEMPLATE_RATIOS.filter(([width, height]) => width !== 21 || height !== 9);
const TEMPLATE_RATIO_TOLERANCE = 0.012;

function closestTemplateRatio(
  width: number,
  height: number,
  ratios: ReadonlyArray<readonly [number, number]>,
): { width: number; height: number; delta: number } | undefined {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return undefined;
  const quotient = width / height;
  let best = ratios[0];
  let bestDelta = Infinity;
  for (const pair of ratios) {
    const delta = Math.abs(quotient - pair[0] / pair[1]);
    if (delta < bestDelta) {
      best = pair;
      bestDelta = delta;
    }
  }
  return best ? { width: best[0], height: best[1], delta: bestDelta } : undefined;
}

export function formatTemplateRatio(width: number, height: number): string {
  const cinematic = closestTemplateRatio(width, height, [[21, 9]]);
  if (cinematic && cinematic.delta <= TEMPLATE_RATIO_TOLERANCE) return "21:9";
  const nearest = closestTemplateRatio(width, height, STORABLE_TEMPLATE_RATIOS);
  if (!nearest) return "auto";
  return `${nearest.width}:${nearest.height}`;
}

/** 已声明的比例按十进制值精确约分；不能把自定义画幅显示成最近的标准比例。 */
export function formatExactTemplateRatio(width: number, height: number): string {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return "auto";
  const fraction = (value: number): [bigint, bigint] => {
    const [mantissa, exponent = "0"] = String(value).toLowerCase().split("e");
    const [whole, decimal = ""] = mantissa.split(".");
    const places = decimal.length - Number(exponent);
    const numerator = BigInt(`${whole}${decimal}`);
    return places >= 0
      ? [numerator, 10n ** BigInt(places)]
      : [numerator * 10n ** BigInt(-places), 1n];
  };
  const [wn, wd] = fraction(width);
  const [hn, hd] = fraction(height);
  const left = wn * hd;
  const right = hn * wd;
  let divisor = left;
  let remainder = right;
  while (remainder) [divisor, remainder] = [remainder, divisor % remainder];
  return `${left / divisor}:${right / divisor}`;
}

/** 只读实测比例：一律写成常用整数令牌，不写小数，也不反写设计。 */
export function formatMeasuredTemplateRatio(width: number, height: number): string {
  const named = formatTemplateRatio(width, height);
  return named === "auto" ? "未测得" : named;
}

/**
 * 画布上方和属性里的比例读数。已锁定的比例先收成最近令牌；
 * 随内容或固定高度则按当前外框就近显示，不把该读数写回定义。
 * 锁定比例和实测外框横竖相反时，以实测为准。声明没画出来，不能印在像素旁边。
 */
export function displayStandardTemplateRatio(
  width: number,
  height: number,
  lockedRatio?: string,
): string {
  const measured = formatTemplateRatio(width, height);
  const locked = parseTemplateRatio(lockedRatio);
  if (locked) {
    const named = formatTemplateRatio(locked.width, locked.height);
    const measuredQuotient = width > 0 && height > 0 ? width / height : undefined;
    const lockedQuotient = locked.width / locked.height;
    const orientationAgrees = measuredQuotient === undefined
      || (measuredQuotient >= 1) === (lockedQuotient >= 1);
    if (named !== "auto" && orientationAgrees) return named;
  }
  return measured === "auto" ? "1:1" : measured;
}

/** 固定比例只能落在区块模板标准 §6.4 的常用令牌上。 */
export function nearestStorableTemplateRatio(
  width: number,
  height: number,
): { width: number; height: number } | undefined {
  const nearest = closestTemplateRatio(width, height, STORABLE_TEMPLATE_RATIOS);
  return nearest ? { width: nearest.width, height: nearest.height } : undefined;
}

/** 画布与属性区共用的高度规则说明。固定比例读数收成标准令牌，不把内容高度写成作者已锁定的比例。 */
export function describeTemplateFrameProportion(
  heightMode: string,
  width: number,
  height: number,
  lockedRatio?: string,
): string {
  if (heightMode === "aspect-ratio") return displayStandardTemplateRatio(width, height, lockedRatio);
  if (heightMode === "fixed") return "固定高度";
  if (heightMode === "min-height") return "最小高度";
  if (heightMode === "fill") return "填满可用空间";
  if (heightMode === "fit") return "适应内容";
  return "随内容";
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

/** 未写设计宽度的已保存模板按当年的 1920 基准换算高度，画布显示宽度本身不再沿用它。 */
const LEGACY_DESKTOP_DESIGN_WIDTH = 1920;

/** 各模板画布共用的宽度：桌面 1440，手机 390。比例只改变高度。 */
function getDesignWidth(_definition: TemplateDefinitionV2, device: TemplateBreakpoint): number {
  return RESPONSIVE_CANVAS[toTemplateContentBreakpoint(device)].width;
}

/** 模板自己保存的坐标宽度，只用来把固定像素高度换算到共用画布宽度上。 */
function storedDesignWidth(definition: TemplateDefinitionV2, device: TemplateBreakpoint): number {
  return toTemplateContentBreakpoint(device) === "desktop"
    ? definition.metadata.canvasSize?.width ?? definition.metadata.previewDesktopWidth ?? LEGACY_DESKTOP_DESIGN_WIDTH
    : definition.metadata.previewMobileWidth ?? RESPONSIVE_CANVAS.mobile.width;
}

function getCompatibilityRatio(
  definition: TemplateDefinitionV2,
  device: TemplateBreakpoint,
) {
  return parseTemplateRatio(
    device === "mobile" ? definition.metadata.mobileRatio : definition.metadata.desktopRatio,
  );
}

/**
 * 根节点响应式高度是运行时尺寸的唯一事实源。旧模板仅在根节点仍为 auto、
 * 但兼容比例字段已有明确值时，临时将该比例解释为根规则，保证迁移期间
 * 编辑器、缩略图和公共 Renderer 不再出现两套高度。
 */
export function getEffectiveTemplateRootRules(
  definition: TemplateDefinitionV2,
  device: TemplateBreakpoint,
): DynamicTemplateResponsiveRules {
  const root = definition.nodes[definition.rootNodeId];
  const rules = root ? resolveTemplateNodeRules(definition, root.nodeId, device) : undefined;
  if (!rules) throw new Error(`模板根节点缺少 ${device} 响应式规则。`);
  if (definition.schemaVersion >= 2 || rules.height.mode !== "auto") return { ...rules, width: "fill" };
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

function positiveRatio(ratio: { width: number; height: number } | undefined): PairedCanvasRatio | undefined {
  if (!ratio || !(ratio.width > 0) || !(ratio.height > 0)) return undefined;
  return { width: ratio.width, height: ratio.height };
}

/** 根随内容时，比例写在主舞台上。按树序取第一个桌面固定比例。 */
function stageDesktopRatio(definition: TemplateDefinitionV2): PairedCanvasRatio | undefined {
  const root = definition.nodes[definition.rootNodeId];
  if (!root) return undefined;
  const queue = [...root.childIds];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (!nodeId || seen.has(nodeId)) continue;
    seen.add(nodeId);
    const node = definition.nodes[nodeId];
    if (!node) continue;
    const height = resolveTemplateNodeRules(definition, nodeId, "desktop").height;
    if (height.mode === "aspect-ratio") {
      const ratio = positiveRatio(height.ratio);
      if (ratio) return ratio;
    }
    queue.push(...node.childIds);
  }
  return undefined;
}

function desktopFixedRatio(definition: TemplateDefinitionV2): PairedCanvasRatio | undefined {
  const root = definition.nodes[definition.rootNodeId];
  if (!root) return undefined;
  const desktop = getEffectiveTemplateRootRules(definition, "desktop");
  if (desktop.height.mode === "aspect-ratio") {
    const ratio = positiveRatio(desktop.height.ratio);
    if (ratio) return ratio;
  }
  if (desktop.height.mode === "fixed") {
    const canvas = definition.metadata.canvasSize;
    if (canvas && canvas.width > 0 && canvas.height > 0) {
      return { width: canvas.width, height: canvas.height };
    }
  }
  // 首发母版的根保持随内容，16:9 写在主舞台或 desktopRatio 上。画布仍对调这个比例。
  // “随内容增长”会把画布像素写成 desktopRatio，例如 1440:900。那不是选定的比例，不能拿来对换。
  const stageRatio = stageDesktopRatio(definition);
  if (stageRatio) return stageRatio;
  const declared = positiveRatio(parseTemplateRatio(definition.metadata.desktopRatio));
  const canvas = definition.metadata.canvasSize;
  if (
    declared
    && canvas
    && declared.width === canvas.width
    && declared.height === canvas.height
  ) return undefined;
  return declared;
}

/** 左右图文三类区块角色。手机上图在上、文在下；整节仍按桌面比例对换。 */
const SPLIT_SECTION_ROLES = new Set(["editorial-split", "collection-story", "craft-detail"]);

/**
 * R-1：桌面内容端点上，文字列窄于正文 24em 时改为上下排列。
 * 有实测文字列宽度时，自由坐标也按这个宽度判断。没有实测宽度时，自由坐标不估算。
 * 这是几何判断，不新增平板内容端点。
 */
export function splitCopyShouldStack(input: {
  sectionRole?: string;
  containerWidth: number;
  fontSizePx: number;
  columns: number;
  gapPx: number;
  layoutMode?: string;
  copyColumnWidth?: number;
}): boolean {
  if (!input.sectionRole || !SPLIT_SECTION_ROLES.has(input.sectionRole)) return false;
  const fontSize = input.fontSizePx > 0 ? input.fontSizePx : 16;
  if (input.copyColumnWidth && input.copyColumnWidth > 0) {
    return input.copyColumnWidth < 24 * fontSize - 0.5;
  }
  if (input.layoutMode === "free" || input.columns < 2) return false;
  if (!(input.containerWidth > 0)) return false;
  const columns = input.columns;
  const gap = Number.isFinite(input.gapPx) ? Math.max(0, input.gapPx) : 0;
  const copyWidth = (input.containerWidth - gap * (columns - 1)) / columns;
  return copyWidth < 24 * fontSize - 0.5;
}

/**
 * 左右图文在手机上改为上下排列。
 * 整节画布仍按桌面比例对换；这里只判断内部是否改成上下排。
 */
export function isContentHeightSplitSection(definition: TemplateDefinitionV2): boolean {
  const sectionRole = definition.metadata.sectionRole ?? definition.templateRecipe?.sectionRole;
  if (!sectionRole || !SPLIT_SECTION_ROLES.has(sectionRole)) return false;
  const desktopHeight = getEffectiveTemplateRootRules(definition, "desktop").height.mode;
  return desktopHeight !== "aspect-ratio" && desktopHeight !== "fixed";
}

/**
 * 桌面有固定比例、手机根仍随内容时，手机画布对调两个数字：
 * 16:9 对 9:16，1:2 对 2:1，4:5 对 5:4，1:1 仍是 1:1。
 * 比例可以在根上，也可以在主舞台或模板声明的 desktopRatio 上。
 * 所有模板都以桌面比例为标准，不因几何策略、左右图文或四张作品卡取消对换。
 * 作者已经给手机写了固定高度或比例时，不再覆盖。没有可读桌面比例时保持随内容。
 */
export function resolvePairedMobileCanvas(definition: TemplateDefinitionV2): PairedCanvasRatio | null {
  const root = definition.nodes[definition.rootNodeId];
  if (!root) return null;
  const mobile = getEffectiveTemplateRootRules(definition, "mobile");
  if (mobile.height.mode !== "auto") return null;
  const desktopRatio = desktopFixedRatio(definition);
  if (!desktopRatio || desktopRatio.width <= 0 || desktopRatio.height <= 0) return null;
  return swapCanvasRatio(desktopRatio);
}

function sameCanvasRatio(
  left: { width: number; height: number } | undefined,
  right: { width: number; height: number } | undefined,
): boolean {
  return Boolean(left && right && left.width > 0 && left.height > 0 && right.width > 0 && right.height > 0
    && Math.abs(left.width * right.height - left.height * right.width) < 1e-8);
}

/** 作品卡两端都是 4:5，即使整节也曾是 4:5，也不跟着画幅改。 */
function isWorkCardImageSlot(definition: TemplateDefinitionV2, slotId: string | undefined): boolean {
  const slot = slotId ? definition.slots[slotId] : undefined;
  if (!slot || slot.type !== "image") return false;
  const artwork = { width: 4, height: 5 };
  return sameCanvasRatio(parseTemplateRatio(slot.desktopRules.aspectRatio), artwork)
    && sameCanvasRatio(parseTemplateRatio(slot.mobileRules?.aspectRatio), artwork);
}

/**
 * 整节换比例时，原先就是这一对画幅的舞台高度和铺满图片槽一起改到新配对。
 * 百分比高度、作品卡、Logo 和作者另设的比例保持原样。
 */
function retargetCanvasBoundFrames(
  definition: TemplateDefinitionV2,
  previous: { desktop: PairedCanvasRatio; mobile: PairedCanvasRatio },
  nextPair: { desktop: PairedCanvasRatio; mobile: PairedCanvasRatio },
): void {
  const token = (ratio: PairedCanvasRatio) => `${ratio.width}:${ratio.height}`;
  for (const node of Object.values(definition.nodes)) {
    if (node.nodeId === definition.rootNodeId || isWorkCardImageSlot(definition, node.slotId)) continue;
    for (const device of ["desktop", "mobile"] as const) {
      const height = node.responsive[device]?.height;
      if (!height || height.mode !== "aspect-ratio" || !height.ratio) continue;
      const source = device === "desktop" ? previous.desktop : previous.mobile;
      const replacement = device === "desktop" ? nextPair.desktop : nextPair.mobile;
      if (sameCanvasRatio(height.ratio, source)) {
        height.ratio = { ...replacement };
        continue;
      }
      // 铺满图在手机端沿用了桌面横图比例时，跟到新的对换比例，避免手机画幅下再留一条底。
      if (device !== "mobile" || !sameCanvasRatio(height.ratio, previous.desktop)) continue;
      const slot = node.slotId ? definition.slots[node.slotId] : undefined;
      const placement = node.responsive.desktop.placement;
      const fillsFrame = Boolean(placement && placement.width >= 0.999 && placement.height >= 0.999);
      if (fillsFrame || slot?.semanticRole === "backgroundImage") height.ratio = { ...nextPair.mobile };
    }
  }
  for (const slot of Object.values(definition.slots)) {
    if (slot.type !== "image" || isWorkCardImageSlot(definition, slot.slotId)) continue;
    if (!sameCanvasRatio(parseTemplateRatio(slot.desktopRules.aspectRatio), previous.desktop)) continue;
    slot.desktopRules.aspectRatio = token(nextPair.desktop);
    const mobile = parseTemplateRatio(slot.mobileRules?.aspectRatio);
    if (slot.mobileRules && (sameCanvasRatio(mobile, previous.mobile) || sameCanvasRatio(mobile, previous.desktop))) {
      slot.mobileRules.aspectRatio = token(nextPair.mobile);
    }
  }
}

/**
 * 仅在作者确认后应用双端整体画幅。原先与整节同一对标准比例的舞台和铺满图片
 * 改到新配对；作品卡、Logo 等独立比例、子树内容和尺寸上下限保持不变。
 * 冲突由画布提示，不借此清理已有布局或在读取历史模板时迁移定义。
 */
export function applyStandardTemplateCanvasPair(
  definition: TemplateDefinitionV2,
  desktopRatio: PairedCanvasRatio,
): TemplateDefinitionV2 {
  const pair = STANDARD_TEMPLATE_CANVAS_PAIRS.find(({ desktop }) => (
    Number.isFinite(desktopRatio.width) && Number.isFinite(desktopRatio.height)
    && desktopRatio.width > 0 && desktopRatio.height > 0
    && sameCanvasRatio(desktopRatio, desktop)
  ));
  if (!pair) throw new Error("请选择标准双端画幅。");
  if (!definition.nodes[definition.rootNodeId]) throw new Error("模板根节点不存在，无法应用双端画幅。");
  for (const device of ["desktop", "mobile"] as const) {
    const rules = resolveTemplateNodeRules(definition, definition.rootNodeId, device);
    const restrictions = [
      rules.minHeight && rules.minHeight.value > 0 ? "最小高度" : "",
      rules.maxHeight ? "最大高度" : "",
      rules.minWidth && rules.minWidth.value > 0 ? "最小宽度" : "",
      rules.maxWidth ? "最大宽度" : "",
    ].filter(Boolean);
    if (restrictions.length) {
      throw new Error(`请先取消模板根节点${device === "desktop" ? "桌面端" : "手机端"}的${restrictions.join("、")}限制，再应用标准双端画幅；内部图片和文字不会改动。`);
    }
  }
  const previousRatio = desktopFixedRatio(definition);
  const previousPair = STANDARD_TEMPLATE_CANVAS_PAIRS.find(({ desktop }) => sameCanvasRatio(previousRatio, desktop));
  const next = structuredClone(definition);
  if (previousPair && !sameCanvasRatio(previousPair.desktop, pair.desktop)) {
    retargetCanvasBoundFrames(next, previousPair, pair);
  }
  next.metadata.geometryPolicy = "paired-canvas";
  const root = next.nodes[next.rootNodeId];
  root.responsive.desktop.height = { mode: "aspect-ratio", ratio: { ...pair.desktop } };
  root.responsive.mobile.height = { mode: "auto" };
  // Schema 1 的兼容字段仍参与有效根规则解析，显式选择时同步，不能干扰手机跟随。
  if (next.schemaVersion === 1) {
    next.metadata.desktopRatio = `${pair.desktop.width}:${pair.desktop.height}`;
    next.metadata.mobileRatio = "auto";
  }
  return next;
}

export function resolveTemplateDesignFrame(
  definition: TemplateDefinitionV2,
  device: TemplateBreakpoint,
): TemplateDesignFrame {
  const sourceWidth = getDesignWidth(definition, device);
  const rootRules = getEffectiveTemplateRootRules(definition, device);
  const formatRatio = definition.metadata.geometryPolicy === "paired-canvas" ? formatExactTemplateRatio : formatTemplateRatio;
  const baseline = RESPONSIVE_CANVAS[toTemplateContentBreakpoint(device)];
  if (toTemplateContentBreakpoint(device) === "mobile") {
    const paired = resolvePairedMobileCanvas(definition);
    if (paired) {
      return {
        sourceWidth,
        heightMode: "aspect-ratio",
        fallbackHeight: sourceWidth * paired.height / paired.width,
        ratioLabel: formatRatio(paired.width, paired.height),
        rootRules,
        pairedCanvas: true,
      };
    }
  }
  const heightMode = resolveHeightMode(rootRules.height);
  if (heightMode === "fixed") {
    const fixedHeight = rootRules.height.value?.unit === "px"
      ? rootRules.height.value.value
      : undefined;
    const storedWidth = storedDesignWidth(definition, device);
    const scale = storedWidth > 0 ? sourceWidth / storedWidth : 1;
    const fallbackHeight = fixedHeight && fixedHeight > 0
      ? fixedHeight * scale
      : baseline.height * sourceWidth / baseline.width;
    return {
      sourceWidth,
      heightMode,
      fallbackHeight,
      ratioLabel: formatRatio(sourceWidth, fallbackHeight),
      rootRules,
    };
  }
  if (heightMode === "aspect-ratio" && rootRules.height.ratio) {
    const ratio = rootRules.height.ratio;
    return {
      sourceWidth,
      heightMode,
      fallbackHeight: sourceWidth * ratio.height / ratio.width,
      ratioLabel: formatRatio(ratio.width, ratio.height),
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
  device: TemplateBreakpoint,
) {
  if (definition.schemaVersion >= 2) return;
  const frame = resolveTemplateDesignFrame(definition, device);
  if (device === "desktop") definition.metadata.desktopRatio = frame.ratioLabel;
  else definition.metadata.mobileRatio = frame.ratioLabel;
}

export function setTemplateDesignWidth(
  definition: TemplateDefinitionV2,
  device: TemplateBreakpoint,
  width: number,
): TemplateDefinitionV2 {
  const next = structuredClone(definition);
  const contentDevice = toTemplateContentBreakpoint(device);
  const safeWidth = Math.round(width);
  if (contentDevice === "desktop" && next.metadata.canvasSize) {
    const boundedWidth = Math.max(1, Math.min(4096, safeWidth));
    next.metadata.canvasSize.width = boundedWidth;
    next.metadata.canvasSize.aspectRatio = boundedWidth / next.metadata.canvasSize.height;
    next.metadata.previewDesktopWidth = Math.max(768, Math.min(2560, boundedWidth));
  } else if (contentDevice === "desktop") next.metadata.previewDesktopWidth = safeWidth;
  else next.metadata.previewMobileWidth = safeWidth;
  synchronizeCompatibilityRatio(next, contentDevice);
  return next;
}

export function setTemplateDesignHeightMode(
  definition: TemplateDefinitionV2,
  device: TemplateBreakpoint,
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
    setTemplateNodeRule(next, root.nodeId, device, "height", {
      mode: "fixed",
      value: { value: Math.round(device === "desktop" && next.metadata.canvasSize ? Math.min(4096, height) : height), unit: "px" },
    });
  } else if (mode === "aspect-ratio") {
    const current = resolveTemplateDesignFrame(next, device);
    const ratio = typeof value === "object" && value.width > 0 && value.height > 0
      ? value
      : { width: current.sourceWidth, height: current.fallbackHeight };
    const ratioLabel = nearestStorableTemplateRatio(ratio.width, ratio.height) ?? { width: 16, height: 9 };
    setTemplateNodeRule(next, root.nodeId, device, "height", { mode: "aspect-ratio", ratio: ratioLabel });
  } else {
    setTemplateNodeRule(next, root.nodeId, device, "height", { mode: "auto" });
    // 兼容比例是根规则的派生值。切回随内容时必须先清掉旧比例，
    // 否则 effective rules 会把刚写入的 auto 重新解释成旧的固定比例。
    if (next.schemaVersion === 1) {
      if (device === "desktop") next.metadata.desktopRatio = "auto";
      else next.metadata.mobileRatio = "auto";
    }
  }
  if (device === "desktop" && next.metadata.canvasSize && mode !== "auto") {
    const frame = resolveTemplateDesignFrame(next, device);
    const height = Math.round(frame.fallbackHeight);
    if (height >= 1 && height <= 4096) {
      next.metadata.canvasSize.height = height;
      next.metadata.canvasSize.aspectRatio = next.metadata.canvasSize.width / height;
    }
  }
  synchronizeCompatibilityRatio(next, device);
  return next;
}

export function normalizeTemplateDimensionContract(
  definition: TemplateDefinitionV2,
): TemplateDefinitionV2 {
  const next = structuredClone(definition);
  if (next.schemaVersion >= 2) return next;
  for (const device of ["desktop", "mobile"] as const) {
    const root = next.nodes[next.rootNodeId];
    if (!root) continue;
    const compatibilityRatio = getCompatibilityRatio(next, device);
    if (resolveTemplateNodeRules(next, root.nodeId, device).height.mode === "auto" && compatibilityRatio) {
      root.responsive[device].height = {
        mode: "aspect-ratio",
        ratio: compatibilityRatio,
      };
    }
    synchronizeCompatibilityRatio(next, device);
  }
  return next;
}
