import assert from "node:assert/strict";
import test from "node:test";
import {
  coverSizesFromViewportBox,
  describeImageSlotAdvice,
  heroPublicCandidateSizes,
  sizesLowerBoundPx,
  designCanvasWidthOnDevice,
  referenceDeliveryFrame,
  renderedWidthFactor,
  resolveImageDeliveryGeometry,
} from "./src/page-builder/config/imageDeliveryGeometry.ts";
import {
  mediaSpecFromRecommendation,
  mediaSpecMatchingFrame,
} from "./src/page-builder/fields/mediaSpec.ts";

test("竖框铺满横图按绘制宽度而不是画框宽度选图", () => {
  const geometry = resolveImageDeliveryGeometry({
    sourceWidth: 3840,
    sourceHeight: 2160,
    frameWidth: 390,
    frameHeight: 693.328,
    objectFit: "cover",
    devicePixelRatio: 3,
  });
  assert.ok(geometry);
  assert.ok(Math.abs(geometry!.renderedCssWidth - 1232.583) < 0.05);
  assert.ok(Math.abs(geometry!.requiredSourceWidth - 3697.75) < 0.2);
  assert.ok(geometry!.cropFraction > 0.6);

  const factor = renderedWidthFactor({
    frameAspect: { width: 9, height: 16 },
    sourceWidth: 3840,
    sourceHeight: 2160,
    objectFit: "cover",
  });
  assert.ok(Math.abs(factor - (256 / 81)) < 0.001);
});

test("同比例铺满和横图完整放入竖框都不放大绘制宽度", () => {
  const same = resolveImageDeliveryGeometry({
    sourceWidth: 1600,
    sourceHeight: 900,
    frameWidth: 1440,
    frameHeight: 810,
    objectFit: "cover",
    devicePixelRatio: 2,
  });
  assert.equal(same?.renderedCssWidth, 1440);
  assert.equal(same?.requiredSourceWidth, 2880);
  assert.equal(same?.cropFraction, 0);

  const contained = resolveImageDeliveryGeometry({
    sourceWidth: 1600,
    sourceHeight: 900,
    frameWidth: 390,
    frameHeight: 693.328,
    objectFit: "contain",
    devicePixelRatio: 3,
  });
  assert.ok(contained);
  assert.ok(Math.abs(contained!.renderedCssWidth - 390) < 0.01);

  const scaled = resolveImageDeliveryGeometry({
    sourceWidth: 1600,
    sourceHeight: 900,
    frameWidth: 1440,
    frameHeight: 810,
    objectFit: "cover",
    authorScale: 1.1,
    devicePixelRatio: 1,
  });
  assert.ok(Math.abs((scaled?.renderedCssWidth ?? 0) - 1584) < 0.01);
});

test("941 宽竖图在手机画框里标成像素不足，不按 1200 档假装够用", () => {
  const advice = describeImageSlotAdvice({
    device: "mobile",
    designWidth: 390,
    designHeight: 693,
    frameAspect: { width: 9, height: 16 },
    objectFit: "cover",
    source: { displayWidth: 941, displayHeight: 1672 },
    inherited: true,
  });
  assert.equal(advice.pixelsLow, true);
  assert.match(advice.source, /沿用桌面图/);
  assert.match(advice.source, /941×1672/);
  assert.match(advice.sharpness, /建议源宽约 117[01]/);
  assert.equal(advice.sharpness.includes("1200"), false);
});

test("足够的 3840 源在 1920 宽 2 倍屏下够用，首屏 sizes 按视口盒子铺满", () => {
  const advice = describeImageSlotAdvice({
    device: "desktop",
    designWidth: 1440,
    designHeight: 810,
    frameAspect: { width: 16, height: 9 },
    objectFit: "cover",
    source: { displayWidth: 3840, displayHeight: 2160 },
    inherited: false,
  });
  assert.equal(advice.pixelsLow, false);
  assert.match(advice.design, /设计参考 1440×810/);
  assert.match(advice.design, /不是上传上限/);
  assert.match(advice.sharpness, /1920/);
  assert.match(advice.sharpness, /3840/);

  const sizes = coverSizesFromViewportBox({
    width: "100vw",
    height: "max(620px, 100svh)",
    sourceWidth: 3840,
    sourceHeight: 2160,
    objectFit: "cover",
  });
  assert.match(sizes, /max\(100vw, calc\(max\(620px, 100svh\) \* 1\.7778\)\)/);
});

test("半栏推荐宽按 1440 设计画布换算到 1920 参考视口，不把设计像素当 CSS 宽", () => {
  const advice = describeImageSlotAdvice({
    device: "desktop",
    designWidth: 720,
    designHeight: 405,
    frameAspect: { width: 16, height: 9 },
    objectFit: "cover",
    source: { displayWidth: 1600, displayHeight: 900 },
    inherited: false,
  });
  // 720 / 1440 × 1920 = 960 CSS；2 倍屏需约 1920。1600 不够。
  assert.match(advice.sharpness, /960 宽、2 倍屏/);
  assert.match(advice.sharpness, /建议源宽约 1920/);
  assert.equal(advice.pixelsLow, true);
  assert.equal(advice.sharpness.includes("够用"), false);
});

test("全幅 1440 设计宽在 1920 参考视口下仍按整页 1920 CSS 估算", () => {
  const advice = describeImageSlotAdvice({
    device: "desktop",
    designWidth: 1440,
    designHeight: 810,
    frameAspect: { width: 16, height: 9 },
    objectFit: "cover",
    source: { displayWidth: 3840, displayHeight: 2160 },
    inherited: false,
  });
  assert.match(advice.sharpness, /1920 宽、2 倍屏/);
  assert.equal(advice.pixelsLow, false);
});

test("真实竖图规格 810×1440 在手机上按 390 宽检查，不把上传短边当成 CSS 宽", () => {
  const spec = mediaSpecMatchingFrame(1440, 810, "9:16", "手机");
  assert.equal(spec?.width, 810);
  assert.equal(spec?.height, 1440);
  assert.equal(spec?.designCanvasWidth, 1440);
  const designWidth = designCanvasWidthOnDevice("mobile", spec?.designCanvasWidth ?? 0);
  assert.equal(designWidth, 390);
  const advice = describeImageSlotAdvice({
    device: "mobile",
    designWidth,
    designHeight: designWidth * 16 / 9,
    uploadWidth: spec?.width,
    uploadHeight: spec?.height,
    designCanvasWidth: spec?.designCanvasWidth,
    frameAspect: { width: 9, height: 16 },
    objectFit: "cover",
    source: { displayWidth: 941, displayHeight: 1672 },
    inherited: false,
  });
  assert.match(advice.design, /上传推荐 810×1440/);
  assert.match(advice.design, /模板设计基准 1440 宽/);
  assert.match(advice.design, /设计参考 390×693/);
  assert.match(advice.sharpness, /390 宽、3 倍屏/);
  assert.match(advice.sharpness, /建议源宽约 1171/);
  assert.equal(advice.sharpness.includes("2431"), false);
  assert.equal(advice.sharpness.includes("810 宽"), false);
});

test("半栏槽位在两端都按设计画布占比换算，横图铺满竖框不截到 390", () => {
  const half = mediaSpecFromRecommendation(720, 405, "16:9", "半栏");
  assert.equal(half?.designCanvasWidth, 720);
  assert.equal(designCanvasWidthOnDevice("desktop", 720), 720);
  assert.equal(referenceDeliveryFrame("desktop", 720).cssWidth, 960);
  assert.ok(Math.abs(designCanvasWidthOnDevice("mobile", 720) - 195) < 0.001);

  const portrait = mediaSpecMatchingFrame(1440, 810, "9:16", "手机");
  const mobileWidth = designCanvasWidthOnDevice("mobile", portrait?.designCanvasWidth ?? 0);
  const wide = describeImageSlotAdvice({
    device: "mobile",
    designWidth: mobileWidth,
    designHeight: mobileWidth * 16 / 9,
    uploadWidth: portrait?.width,
    uploadHeight: portrait?.height,
    designCanvasWidth: portrait?.designCanvasWidth,
    frameAspect: { width: 9, height: 16 },
    objectFit: "cover",
    source: { displayWidth: 3840, displayHeight: 2160 },
    inherited: false,
  });
  assert.match(wide.sharpness, /建议源宽 3698/);
  assert.equal(wide.sharpness.includes("1171"), false);
});

test("首屏手机和平板按比例框选图，只有更宽的桌面才按视口高度铺满", () => {
  const phone = heroPublicCandidateSizes({
    sourceWidth: 2000,
    sourceHeight: 2500,
    frameAspect: { width: 4, height: 5 },
    desktopMinHeight: "max(620px, 100svh)",
    compactMaxWidth: 1023,
    slot: "mobile",
  });
  assert.equal(phone, "100vw");
  assert.equal(phone.includes("100svh"), false);

  const wideInPortraitFrame = heroPublicCandidateSizes({
    sourceWidth: 3840,
    sourceHeight: 2160,
    frameAspect: { width: 4, height: 5 },
    desktopMinHeight: "max(620px, 100svh)",
    compactMaxWidth: 1023,
    slot: "mobile",
  });
  assert.match(wideInPortraitFrame ?? "", /^calc\(100vw \* 2\.222\)$/);

  const desktop = heroPublicCandidateSizes({
    sourceWidth: 3840,
    sourceHeight: 2160,
    frameAspect: { width: 16, height: 9 },
    desktopMinHeight: "max(620px, 100svh)",
    compactMaxWidth: 1023,
    slot: "desktop",
  });
  assert.equal(
    desktop,
    "(max-width: 1023px) 100vw, calc(max(100vw, calc(max(620px, 100svh) * 1.7778)))",
  );
  assert.equal(desktop?.includes("dpr"), false);
});

test("声明的 sizes 在当前视口上给出下限，窄测量不能把它盖掉", () => {
  assert.equal(sizesLowerBoundPx("100vw", 1440), 1440);
  assert.equal(sizesLowerBoundPx("100vw", 390), 390);
  assert.equal(sizesLowerBoundPx("(max-width: 767px) 100vw, 50vw", 1440), 720);
  assert.equal(sizesLowerBoundPx("(max-width: 767px) 100vw, 50vw", 390), 390);
  assert.equal(sizesLowerBoundPx("calc(100vw * 1.2)", 1000), 1200);
  assert.equal(sizesLowerBoundPx("420px", 1440), 420);
  assert.equal(sizesLowerBoundPx("auto", 1440), 0);
});
