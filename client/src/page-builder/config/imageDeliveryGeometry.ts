/**
 * 按实际绘制几何选图。sizes 使用 CSS 宽度，不预先乘上 DPR。
 * 铺满可以宽于画框；作者缩放只乘一次。自然高度模式留给尚未批准的 D 批，这里不实现。
 */

export const IMAGE_DELIVERY_REFERENCE = {
  /** 公开页验收参考视口宽（CSS px），不是模板设计画布宽。 */
  desktopCssWidth: 1920,
  desktopDpr: 2,
  mobileCssWidth: 390,
  mobileDpr: 3,
  /** 模板设计画布宽；推荐宽按相对画布占比换算到参考视口。 */
  desktopDesignCanvasWidth: 1440,
  mobileDesignCanvasWidth: 390,
} as const;

export type ImageDeliveryFit = "cover" | "contain" | "fill";

export type ImageDeliveryGeometry = {
  renderedCssWidth: number;
  requiredSourceWidth: number;
  sourceDensity: number;
  cropFraction: number;
};

export function parseFrameAspect(ratio: string | undefined): { width: number; height: number } | null {
  if (!ratio) return null;
  const match = ratio.replace(/\s+/g, "").match(/^(\d+(?:\.\d+)?)[:/](\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!(width > 0) || !(height > 0)) return null;
  return { width, height };
}

/**
 * 把模板设计画布上的槽位宽换成当前终端自己的设计基准宽。
 * 桌面 720 仍是 720，再交给 referenceDeliveryFrame 变成 960 CSS。
 * 手机全幅 1440 变成 390；半栏 720 变成 195。
 * 不能把竖图上传短边（例如 810）传进来，那不是设计画布槽位宽。
 */
export function designCanvasWidthOnDevice(
  device: "desktop" | "mobile",
  designCanvasWidth: number,
): number {
  if (!(designCanvasWidth > 0)) {
    return device === "mobile"
      ? IMAGE_DELIVERY_REFERENCE.mobileDesignCanvasWidth
      : IMAGE_DELIVERY_REFERENCE.desktopDesignCanvasWidth;
  }
  if (device === "desktop") return designCanvasWidth;
  return designCanvasWidth
    / IMAGE_DELIVERY_REFERENCE.desktopDesignCanvasWidth
    * IMAGE_DELIVERY_REFERENCE.mobileDesignCanvasWidth;
}

/**
 * 把当前终端的设计基准宽换算成参考视口里的实际 CSS 宽。
 * 例：1440 画布上 50% 槽位推荐 720 → 桌面设计基准仍是 720 → 1920 参考页显示 960 → 2 倍屏约需 1920 源宽。
 * designWidth 必须已经是这一终端的设计基准宽。竖图上传短边不能直接传入。
 */
export function referenceDeliveryFrame(
  device: "desktop" | "mobile",
  designWidth?: number,
): { cssWidth: number; dpr: number } {
  const canvas = device === "mobile"
    ? IMAGE_DELIVERY_REFERENCE.mobileDesignCanvasWidth
    : IMAGE_DELIVERY_REFERENCE.desktopDesignCanvasWidth;
  const reference = device === "mobile"
    ? IMAGE_DELIVERY_REFERENCE.mobileCssWidth
    : IMAGE_DELIVERY_REFERENCE.desktopCssWidth;
  const dpr = device === "mobile"
    ? IMAGE_DELIVERY_REFERENCE.mobileDpr
    : IMAGE_DELIVERY_REFERENCE.desktopDpr;
  const cssWidth = designWidth && designWidth > 0
    ? Math.max(1, (designWidth / canvas) * reference)
    : reference;
  return { cssWidth, dpr };
}

export function resolveImageDeliveryGeometry(input: {
  sourceWidth: number;
  sourceHeight: number;
  frameWidth: number;
  frameHeight: number;
  objectFit: ImageDeliveryFit;
  authorScale?: number;
  devicePixelRatio?: number;
}): ImageDeliveryGeometry | null {
  if (!(input.sourceWidth > 0) || !(input.sourceHeight > 0)) return null;
  if (!(input.frameWidth > 0) || !(input.frameHeight > 0)) return null;
  const scale = input.authorScale && input.authorScale > 0 ? input.authorScale : 1;
  const sourceRatio = input.sourceWidth / input.sourceHeight;
  let drawnWidth = input.frameWidth;
  if (input.objectFit === "cover") {
    drawnWidth = Math.max(input.frameWidth, input.frameHeight * sourceRatio);
  } else if (input.objectFit === "contain") {
    drawnWidth = Math.min(input.frameWidth, input.frameHeight * sourceRatio);
  }
  const renderedCssWidth = drawnWidth * scale;
  if (!(renderedCssWidth > 0)) return null;
  const drawnHeight = renderedCssWidth / sourceRatio;
  const frameArea = input.frameWidth * input.frameHeight;
  const drawnArea = renderedCssWidth * drawnHeight;
  const cropFraction = input.objectFit === "cover" && drawnArea > 0
    ? Math.max(0, 1 - frameArea / drawnArea)
    : 0;
  const dpr = input.devicePixelRatio && input.devicePixelRatio > 0 ? input.devicePixelRatio : 1;
  return {
    renderedCssWidth,
    requiredSourceWidth: renderedCssWidth * dpr,
    sourceDensity: input.sourceWidth / renderedCssWidth,
    cropFraction,
  };
}

/** 画框由宽高比锁定、宽度是视口的某个系数时，铺满/完整放入对应的 sizes。 */
export function renderedWidthFactor(input: {
  frameAspect: { width: number; height: number };
  sourceWidth: number;
  sourceHeight: number;
  objectFit: ImageDeliveryFit;
  authorScale?: number;
}): number {
  const scale = input.authorScale && input.authorScale > 0 ? input.authorScale : 1;
  if (input.objectFit === "fill" || !(input.sourceWidth > 0) || !(input.sourceHeight > 0)) return scale;
  const frameHOverW = input.frameAspect.height / input.frameAspect.width;
  const sourceRatio = input.sourceWidth / input.sourceHeight;
  const factor = input.objectFit === "contain"
    ? Math.min(1, frameHOverW * sourceRatio)
    : Math.max(1, frameHOverW * sourceRatio);
  return factor * scale;
}

export function scaleSizesExpression(sizes: string, factor: number): string {
  if (!(factor > 0) || Math.abs(factor - 1) < 0.015) return sizes;
  const rounded = Math.round(factor * 1000) / 1000;
  return sizes.replace(/(\d+(?:\.\d+)?)vw/g, (_match, value: string) => `calc(${value}vw * ${rounded})`);
}

/** 首屏已知宽高表达式时，铺满宽度 = max(框宽, 框高 × 原图宽高比)。 */
export function coverSizesFromViewportBox(input: {
  width: string;
  height: string;
  sourceWidth: number;
  sourceHeight: number;
  objectFit: ImageDeliveryFit;
  authorScale?: number;
}): string {
  const scale = input.authorScale && input.authorScale > 0 ? input.authorScale : 1;
  const ratio = input.sourceWidth / input.sourceHeight;
  if (!(ratio > 0)) return input.width;
  const roundedRatio = Math.round(ratio * 10000) / 10000;
  const roundedScale = Math.round(scale * 1000) / 1000;
  if (input.objectFit === "fill") {
    return roundedScale === 1 ? input.width : `calc(${input.width} * ${roundedScale})`;
  }
  const fitted = input.objectFit === "contain"
    ? `min(${input.width}, calc(${input.height} * ${roundedRatio}))`
    : `max(${input.width}, calc(${input.height} * ${roundedRatio}))`;
  return roundedScale === 1 ? `calc(${fitted})` : `calc((${fitted}) * ${roundedScale})`;
}

/**
 * 画框宽度锁在 100vw、高度由画框比例决定时，铺满后的 CSS 宽度。
 * 与原图同比例时就是 100vw；原图更宽时才按 cover 放大。不乘 DPR。
 */
export function aspectLockedCoverSizes(input: {
  frameAspect: { width: number; height: number };
  sourceWidth: number;
  sourceHeight: number;
  objectFit: ImageDeliveryFit;
}): string | undefined {
  if (!(input.frameAspect.width > 0) || !(input.frameAspect.height > 0)) return undefined;
  if (!(input.sourceWidth > 0) || !(input.sourceHeight > 0)) return undefined;
  const factor = renderedWidthFactor({
    frameAspect: input.frameAspect,
    sourceWidth: input.sourceWidth,
    sourceHeight: input.sourceHeight,
    objectFit: input.objectFit,
  });
  return scaleSizesExpression("100vw", factor);
}

/**
 * 公开首屏的两条候选：
 * 手机 source 只在 767 及以下生效，画框是手机比例；
 * 桌面 img 在 768–compactMaxWidth 用桌面比例框，更宽才用视口高度铺满。
 */
export function heroPublicCandidateSizes(input: {
  sourceWidth: number;
  sourceHeight: number;
  animated?: boolean;
  frameAspect: { width: number; height: number } | null;
  desktopMinHeight: string;
  compactMaxWidth: number;
  slot: "mobile" | "desktop";
}): string | undefined {
  if (input.animated || !input.frameAspect) return undefined;
  const locked = aspectLockedCoverSizes({
    frameAspect: input.frameAspect,
    sourceWidth: input.sourceWidth,
    sourceHeight: input.sourceHeight,
    objectFit: "cover",
  });
  if (!locked) return undefined;
  if (input.slot === "mobile") return locked;
  const fullBleed = coverSizesFromViewportBox({
    width: "100vw",
    height: input.desktopMinHeight,
    sourceWidth: input.sourceWidth,
    sourceHeight: input.sourceHeight,
    objectFit: "cover",
  });
  return `(max-width: ${input.compactMaxWidth}px) ${locked}, ${fullBleed}`;
}

export type ImageSlotDeliveryAdvice = {
  design: string;
  source: string;
  sharpness: string;
  crop: string;
  pixelsLow: boolean;
  cropHeavy: boolean;
};

export function describeImageSlotAdvice(input: {
  device: "desktop" | "mobile";
  /** 当前终端设计基准宽，已由 designCanvasWidthOnDevice 换算。 */
  designWidth?: number;
  designHeight?: number;
  /** 上传推荐像素。可以和设计基准、检查画框都不同。 */
  uploadWidth?: number;
  uploadHeight?: number;
  /** 模板设计画布上的槽位宽，桌面画布 1440。 */
  designCanvasWidth?: number;
  frameAspect: { width: number; height: number } | null;
  objectFit: ImageDeliveryFit;
  authorScale?: number;
  source: { displayWidth: number; displayHeight: number; animated?: boolean } | null;
  inherited: boolean;
}): ImageSlotDeliveryAdvice {
  const frame = referenceDeliveryFrame(input.device, input.designWidth);
  const ratioLabel = input.frameAspect
    ? `${input.frameAspect.width}:${input.frameAspect.height}`
    : "未标明";
  const checkWidth = input.designWidth && input.designWidth > 0 ? Math.round(input.designWidth) : undefined;
  const checkHeight = input.designHeight && input.designHeight > 0 ? Math.round(input.designHeight) : undefined;
  const uploadNote = input.uploadWidth && input.uploadHeight
    ? `上传推荐 ${Math.round(input.uploadWidth)}×${Math.round(input.uploadHeight)}。`
    : "";
  const baselineNote = input.designCanvasWidth && input.designCanvasWidth > 0
    ? `模板设计基准 ${Math.round(input.designCanvasWidth)} 宽。`
    : "";
  const designSize = checkWidth && checkHeight
    ? `设计参考 ${checkWidth}×${checkHeight}，不是上传上限。`
    : "设计参考尺寸未标明，不是上传上限。";
  const design = `${uploadNote}${baselineNote}${designSize}画框 ${ratioLabel}。`;
  const inherited = input.inherited ? "沿用桌面图。" : "";
  if (!input.source) {
    const cssWidthLabel = Math.round(frame.cssWidth);
    return {
      design,
      source: `${inherited}原图像素待检测。预览里的尺寸不是原图像素。`,
      sharpness: `按 ${cssWidthLabel} 宽、${frame.dpr} 倍屏检查。还不能确认原图是否够用。`,
      crop: "构图待原图像素确认后再判断。",
      pixelsLow: false,
      cropHeavy: false,
    };
  }
  if (input.source.animated) {
    return {
      design,
      source: `${inherited}${input.source.displayWidth}×${input.source.displayHeight}，动图。`,
      sharpness: "动图保持原文件，不按静图档位缩小。",
      crop: "动图不按静图裁切档位判断。",
      pixelsLow: false,
      cropHeavy: false,
    };
  }
  const frameHeight = input.frameAspect
    ? frame.cssWidth * input.frameAspect.height / input.frameAspect.width
    : frame.cssWidth;
  const geometry = input.frameAspect
    ? resolveImageDeliveryGeometry({
      sourceWidth: input.source.displayWidth,
      sourceHeight: input.source.displayHeight,
      frameWidth: frame.cssWidth,
      frameHeight,
      objectFit: input.objectFit,
      authorScale: input.authorScale,
      devicePixelRatio: frame.dpr,
    })
    : null;
  const required = geometry
    ? Math.round(geometry.requiredSourceWidth)
    : Math.round(frame.cssWidth * (input.authorScale && input.authorScale > 0 ? input.authorScale : 1) * frame.dpr);
  const pixelsLow = input.source.displayWidth + 1 < required;
  const cropFraction = geometry?.cropFraction ?? 0;
  const cropHeavy = cropFraction >= 0.12;
  const cssWidthLabel = Math.round(frame.cssWidth);
  const sharpness = pixelsLow
    ? `按 ${cssWidthLabel} 宽、${frame.dpr} 倍屏检查，像素偏低，建议源宽约 ${required}。`
    : `按 ${cssWidthLabel} 宽、${frame.dpr} 倍屏展示，建议源宽 ${required}。当前像素够用。`;
  const crop = !input.frameAspect
    ? "没有画框比例，暂不判断裁切。"
    : cropHeavy
      ? `铺满会裁掉约 ${Math.round(cropFraction * 100)}%。若要保住主体，请另传适合这个画框的图，或改用允许的完整放入。`
      : "适合当前构图。";
  return {
    design,
    source: `${inherited}${input.source.displayWidth}×${input.source.displayHeight}。`,
    sharpness,
    crop,
    pixelsLow,
    cropHeavy,
  };
}
