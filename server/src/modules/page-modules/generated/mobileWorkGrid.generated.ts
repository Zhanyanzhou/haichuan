/** 自动生成，禁止手改。来源：client/src/page-builder/template-definition/mobileWorkGrid.ts */
/**
 * 手机上把连续的作品卡收成两列。
 * 主图、标志、背景和工艺副图保持单列；叙事大图不因为旁边还有一张图就被并排。
 */

export interface MobileWorkNode {
  nodeId: string;
  type: string;
  hidden?: boolean;
  slot?: { type?: string; semanticRole?: string };
  children: readonly MobileWorkNode[];
  rules?: { layoutMode?: string };
}

const STRUCTURE_TYPES = new Set(["Container", "Stack", "Column", "Grid"]);

function isHeroMediaRole(role: string | undefined): boolean {
  return role === "backgroundImage" || role === "heroImage" || role === "logo";
}

function collectImages(node: MobileWorkNode, found: MobileWorkNode[]): void {
  if (node.hidden) return;
  if (node.slot?.type === "image") found.push(node);
  for (const child of node.children) collectImages(child, found);
}

/** 一张可并排的作品图，或只包着这一张作品图的卡片。 */
export function isMobileWorkUnit(node: MobileWorkNode, sectionRole?: string): boolean {
  if (node.hidden) return false;
  if (node.slot?.type === "image") {
    const role = node.slot.semanticRole;
    if (isHeroMediaRole(role)) return false;
    if (role === "secondaryImage") return sectionRole === "creation-grid";
    return true;
  }
  if (node.slot || node.rules?.layoutMode === "free" || !STRUCTURE_TYPES.has(node.type)) return false;
  const images: MobileWorkNode[] = [];
  collectImages(node, images);
  if (images.length !== 1) return false;
  return isMobileWorkUnit(images[0], sectionRole);
}

export function partitionMobileWorkUnits<T extends MobileWorkNode>(
  children: readonly T[],
  options: {
    device: "desktop" | "mobile";
    sectionRole?: string;
    layoutMode?: string;
    display?: string;
    columnCount?: number;
  },
): Array<{ kind: "node"; node: T } | { kind: "works"; nodes: T[] }> {
  const alreadyTwoColumns = options.display === "grid" && (options.columnCount ?? 0) >= 2;
  // 作者把手机写成单列时，不能再把卡片收成两列。
  const explicitSingleColumn = options.display === "grid" && options.columnCount === 1;
  const pairable = children.filter((child) => isMobileWorkUnit(child, options.sectionRole));
  const pairWorkCards = options.device === "mobile"
    && options.layoutMode !== "free"
    && !alreadyTwoColumns
    && !explicitSingleColumn
    && pairable.length >= 2
    && (options.sectionRole === "creation-grid" || pairable.length >= 3);
  const groups: Array<{ kind: "node"; node: T } | { kind: "works"; nodes: T[] }> = [];
  for (const child of children) {
    if (!pairWorkCards || !isMobileWorkUnit(child, options.sectionRole)) {
      groups.push({ kind: "node", node: child });
      continue;
    }
    const last = groups[groups.length - 1];
    if (last?.kind === "works") last.nodes.push(child);
    else groups.push({ kind: "works", nodes: [child] });
  }
  return groups;
}

/**
 * 父级已经是两列作品网格时，不再套一层内网格，否则内层只会落在父级的一格里。
 * 奇数张的第一张在这块网格上跨满两列；偶数张保持作者写好的列数。
 * 单列、三列及以上、自由叠放，以及不是作品网格的区块，都不改。
 */
export function creationGridLeadSpanId<T extends MobileWorkNode>(
  children: readonly T[],
  options: {
    device: "desktop" | "mobile";
    sectionRole?: string;
    layoutMode?: string;
    display?: string;
    columnCount?: number;
  },
): string | null {
  if (options.device !== "mobile" || options.sectionRole !== "creation-grid") return null;
  if (options.layoutMode === "free" || options.display !== "grid" || options.columnCount !== 2) return null;
  const visible = children.filter((child) => !child.hidden);
  const units = visible.filter((child) => isMobileWorkUnit(child, options.sectionRole));
  if (units.length === 0 || units.length % 2 === 0 || units.length !== visible.length) return null;
  return units[0]?.nodeId ?? null;
}

const WORK_CAPTION_ROLES = new Set(["productName", "sellingPoint", "price", "originalPrice"]);

/**
 * 作品图后面紧跟的品名，按顺序收进对应的卡里。
 * 数量对不上就保持原位，避免把章节标题绑到某一张图上。
 */
export function attachMobileWorkCaptions<T extends MobileWorkNode>(
  groups: ReadonlyArray<{ kind: "node"; node: T } | { kind: "works"; nodes: T[] }>,
): Array<{ kind: "node"; node: T } | { kind: "works"; nodes: T[]; captions: T[] }> {
  const next: Array<{ kind: "node"; node: T } | { kind: "works"; nodes: T[]; captions: T[] }> = [];
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index];
    if (group.kind !== "works" || group.nodes.length < 2) {
      next.push(group.kind === "works" ? { ...group, captions: [] } : group);
      continue;
    }
    const captions: T[] = [];
    let cursor = index + 1;
    while (cursor < groups.length && captions.length < group.nodes.length) {
      const candidate = groups[cursor];
      if (candidate.kind !== "node" || !WORK_CAPTION_ROLES.has(candidate.node.slot?.semanticRole ?? "")) break;
      captions.push(candidate.node);
      cursor += 1;
    }
    if (captions.length === group.nodes.length) {
      next.push({ kind: "works", nodes: group.nodes, captions });
      index = cursor - 1;
    } else {
      next.push({ kind: "works", nodes: group.nodes, captions: [] });
    }
  }
  return next;
}

/**
 * 手机作品卡用 4:5。横图在手机上还没有竖向外框时，也用 4:5，不再留成一条扁图。
 * 页面首屏的主图和背景都用 9:16，铺满对换画布；后置影像和视频封面仍收成 4:5。
 */
/** 规格卡要求手机仍用横幅的角色：品牌事实主图手机满宽 3:2。 */
const MOBILE_LANDSCAPE_SECTIONS = new Set(["maison-fact"]);
/** 横幅背景在手机上改用 4:5。页面首屏另走 9:16。已经写成其他竖图的外框保持原比例。 */
const MOBILE_PORTRAIT_FRAME_SECTIONS = new Set(["editorial-media", "video-story"]);
/** 左右图文三类。主图在手机上不再单独收成竖卡。 */
const SPLIT_HERO_SECTIONS = new Set(["editorial-split", "collection-story", "craft-detail"]);
const PAGE_HERO_MOBILE_FRAME = "9 / 16";
/** 旧默认 4:5。页面首屏上的这一档改成 9:16，作者另选的 3:4、2:3、1:1 不动。 */
const LEGACY_PAGE_HERO_FRAME = 4 / 5;

/**
 * 手机图片外框。作品卡、后置影像、视频封面，以及还没有竖向比例的图，统一 4:5。
 * 未声明新几何时，页面首屏的主图和背景都用 9:16：横图、未写比例和旧的 4:5 都收进这个外框。
 * D.48 的 hero-media-frame 只在桌面框为 16:9、且这一节是本页第一个全幅主视觉或孤立设计预览时使用 9:16；排在后面的自动 9:16 改回 16:9。
 * 已经是其他竖图或正方形的保持原样，因此作者选定的 3:4、2:3、1:1 会留下。
 * 标志不改。没有写明比例时也不跟素材文件的横宽走，避免目录里的示意横图把整节压成一条。
 */
const AUTOMATIC_PORTRAIT_FRAME = 9 / 16;
const DESKTOP_HERO_FRAME = 16 / 9;

function nearRatio(value: number | undefined, target: number): boolean {
  return value !== undefined && Math.abs(value - target) < 0.02;
}

/** 9:16 外框按宽度换算后是否高于“视口高度减去页头”。用于 R-2，不写回定义。 */
export function heroFrameExceedsViewport(width: number, viewportHeight: number, headerPx: number): boolean {
  if (!(width > 0) || !(viewportHeight > 0)) return false;
  return width * (16 / 9) > viewportHeight - headerPx + 1;
}

export function resolveMobileImageFrame(input: {
  device: "desktop" | "mobile";
  inWorkGrid: boolean;
  slotType?: string;
  semanticRole?: string;
  sectionRole?: string;
  ratio: number | undefined;
  geometryPolicy?: "paired-canvas" | "hero-media-frame";
  heroPlacement?: "primary" | "subsequent" | "design";
  desktopRatio?: number;
  authorLocked?: boolean;
}): "4 / 5" | "9 / 16" | "16 / 9" | undefined {
  if (input.device !== "mobile" || input.slotType !== "image") return undefined;
  if (input.semanticRole === "logo") return undefined;
  if (input.inWorkGrid) return "4 / 5";
  const heroImage = input.sectionRole === "page-hero"
    && (input.semanticRole === "backgroundImage" || input.semanticRole === "heroImage");
  if (input.geometryPolicy === "hero-media-frame" && heroImage) {
    if (input.authorLocked) return undefined;
    const authoredPortrait = input.ratio !== undefined
      && input.ratio <= 1
      && !nearRatio(input.ratio, LEGACY_PAGE_HERO_FRAME)
      && !nearRatio(input.ratio, AUTOMATIC_PORTRAIT_FRAME);
    if (authoredPortrait) return undefined;
    if (!nearRatio(input.desktopRatio, DESKTOP_HERO_FRAME)) return undefined;
    return input.heroPlacement === "subsequent" ? "16 / 9" : PAGE_HERO_MOBILE_FRAME;
  }
  if (heroImage && input.geometryPolicy !== "hero-media-frame") {
    const authoredPortrait = input.ratio !== undefined
      && input.ratio <= 1
      && !nearRatio(input.ratio, LEGACY_PAGE_HERO_FRAME)
      && !nearRatio(input.ratio, AUTOMATIC_PORTRAIT_FRAME);
    return authoredPortrait ? undefined : PAGE_HERO_MOBILE_FRAME;
  }
  if (input.ratio !== undefined && input.ratio <= 1) return undefined;
  if (input.ratio !== undefined && MOBILE_LANDSCAPE_SECTIONS.has(input.sectionRole ?? "")) return undefined;
  // 左右图文的主图已经有横向外框时，保留这张图，不收成 4:5。
  if (
    input.semanticRole === "heroImage"
    && SPLIT_HERO_SECTIONS.has(input.sectionRole ?? "")
    && input.ratio !== undefined
    && input.ratio > 1
  ) return undefined;
  if (input.semanticRole === "backgroundImage") {
    if (MOBILE_PORTRAIT_FRAME_SECTIONS.has(input.sectionRole ?? "") || input.ratio === undefined) return "4 / 5";
    return undefined;
  }
  return "4 / 5";
}

/**
 * 没有单独手机图、整节也没有对换时，自动 9:16 不拿来裁横图。
 * 整节已经按桌面比例对换时，调用方传入 pairedCanvas，这里保持解析出的竖框。
 * 已有手机图、操作者明确选择铺满或拉伸、作者另选的竖图，都保持解析结果。
 */
export function paintDesktopOnlyHeroFrame(input: {
  resolvedFrame: string | undefined;
  desktopAspect?: string;
  hasMobileAsset: boolean;
  explicitObjectFit?: string;
  pairedCanvas?: boolean;
}): string | undefined {
  if (!input.resolvedFrame || input.hasMobileAsset || input.pairedCanvas) return input.resolvedFrame;
  if (input.explicitObjectFit === "cover" || input.explicitObjectFit === "fill") return input.resolvedFrame;
  if (input.resolvedFrame !== PAGE_HERO_MOBILE_FRAME) return input.resolvedFrame;
  const desktop = parseFrameRatio(input.desktopAspect);
  if (!desktop || desktop.width / desktop.height < 1) return input.resolvedFrame;
  return `${desktop.width} / ${desktop.height}`;
}

/**
 * 模板没有可读桌面比例时，首屏才在没有手机竖图的情况下沿用桌面横图。
 * 已有桌面比例的模板由整节对换决定手机画布，不走这里。
 * explicitObjectFit 只接受实例 layoutOverride，不接受槽位默认的 cover。
 */
export function pageHeroReusesDesktopFrame(input: {
  sectionRole?: string;
  images: ReadonlyArray<{
    desktopAspect?: string;
    hasMobileAsset: boolean;
    explicitObjectFit?: string;
  }>;
}): boolean {
  if (input.sectionRole !== "page-hero" || input.images.length === 0) return false;
  return input.images.every((image) => {
    if (image.hasMobileAsset) return false;
    if (image.explicitObjectFit === "cover" || image.explicitObjectFit === "fill") return false;
    const desktop = parseFrameRatio(image.desktopAspect);
    return Boolean(desktop && desktop.width / desktop.height >= 1);
  });
}

function parseFrameRatio(ratio: string | undefined): { width: number; height: number } | undefined {
  if (!ratio || !/^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/.test(ratio)) return undefined;
  const [width, height] = ratio.split(":").map(Number);
  if (!(width > 0) || !(height > 0)) return undefined;
  return { width, height };
}

/**
 * 左右图文的主图若只剩自动 4:5，短文案会落在一块空竖图下面。
 * 阅读时改用 3:2。桌面主图比 3:2 更宽时保留那张横图。
 * 只比正方形略宽的分栏裁切不再原样叠到手机上，否则图文上下排开后仍是一块高灰板。
 * 作者另选的 3:4、2:3、1:1 保持原样。不写回模板。
 */
export function splitHeroMobileFrame(input: {
  device: "desktop" | "mobile";
  sectionRole?: string;
  semanticRole?: string;
  slotType?: string;
  mobileRatio: number | undefined;
  desktopAspect?: string;
}): string | undefined {
  if (input.device !== "mobile" || input.slotType !== "image") return undefined;
  if (input.semanticRole !== "heroImage") return undefined;
  if (!input.sectionRole || !SPLIT_HERO_SECTIONS.has(input.sectionRole)) return undefined;
  const automaticPortrait = input.mobileRatio === undefined || nearRatio(input.mobileRatio, LEGACY_PAGE_HERO_FRAME);
  if (!automaticPortrait) return undefined;
  const desktop = parseFrameRatio(input.desktopAspect);
  if (desktop && desktop.width / desktop.height >= 1.5) {
    return `${desktop.width} / ${desktop.height}`;
  }
  return "3 / 2";
}

/** 属性提示与预览只用这一处有效画框，不再把槽位里的旧 4:5 说成当前手机框。 */
function ratioNumber(label: string | undefined): number | undefined {
  const parsed = parseFrameRatio(label?.replace(/\s*\/\s*/, ":"));
  if (!parsed || parsed.height === 0) return undefined;
  return parsed.width / parsed.height;
}

export function describeEffectiveImageFrames(input: {
  sectionRole?: string;
  semanticRole?: string;
  geometryPolicy?: "paired-canvas" | "hero-media-frame";
  desktopRatioLabel?: string;
  mobileRatioLabel?: string;
  inWorkGrid?: boolean;
  hasMobileAsset?: boolean;
  explicitObjectFit?: string;
}): {
  desktop?: string;
  mobile?: string;
  declaredMobile?: string;
  firstHero?: string;
  laterHero?: string;
  note: string;
} {
  const desktop = input.desktopRatioLabel;
  if (input.inWorkGrid || input.sectionRole === "creation-grid") {
    return {
      desktop,
      mobile: "4:5",
      note: "作品卡在桌面和手机都是 4:5。建议像素是文件尺寸，不是页面上的画框。",
    };
  }
  const hero = input.sectionRole === "page-hero"
    && (input.semanticRole === "backgroundImage" || input.semanticRole === "heroImage");
  if (hero && input.geometryPolicy === "hero-media-frame") {
    return {
      desktop,
      firstHero: "9:16",
      laterHero: "9:16",
      note: "第一屏的手机图按 9:16 上传。整节按桌面比例对换，文字放不下会提示溢出，不会把画框改回横图。",
    };
  }
  if (hero) {
    return {
      desktop,
      mobile: "9:16",
      declaredMobile: "9:16",
      note: "手机整节按 9:16 显示，上传尺寸也按 9:16。",
    };
  }
  const splitFrame = splitHeroMobileFrame({
    device: "mobile",
    sectionRole: input.sectionRole,
    semanticRole: input.semanticRole,
    slotType: "image",
    mobileRatio: ratioNumber(input.mobileRatioLabel),
    desktopAspect: input.desktopRatioLabel,
  });
  if (splitFrame) {
    const mobile = splitFrame.replace(/\s*\/\s*/, ":");
    const declared = input.mobileRatioLabel;
    return {
      desktop,
      mobile,
      declaredMobile: declared,
      note: declared && declared !== mobile
        ? `当前手机画面按 ${mobile}。槽位里的 ${declared} 这次没有用上。`
        : `当前手机画面按 ${mobile}。建议像素是文件尺寸，不是页面上的画框。`,
    };
  }
  return {
    desktop,
    mobile: input.mobileRatioLabel,
    note: "建议像素是文件尺寸，不是页面上的画框。",
  };
}
