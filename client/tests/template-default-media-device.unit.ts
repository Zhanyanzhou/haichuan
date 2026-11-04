import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { describeImageSlotAdvice } from "../src/page-builder/config/imageDeliveryGeometry";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const controlsSource = readFileSync(
  join(root, "src/page-builder/template-editor/TemplateDefaultContentControls.tsx"),
  "utf8",
);

test("模板默认图片入口按当前编辑端传 device，手机独立图带 fallbackSrc", () => {
  expect(controlsSource).toMatch(
    /device=\{breakpoint === "mobile" \? "mobile" : "desktop"\}/,
  );
  expect(controlsSource).toMatch(
    /fallbackSrc=\{heroPortraitUpload \? desktopSrc : undefined\}/,
  );
  expect(
    (controlsSource.match(/device=\{breakpoint === "mobile" \? "mobile" : "desktop"\}/g) ?? []).length,
  ).toBeGreaterThanOrEqual(2);
});

test("同一 941 竖图：漏传 device 按桌面估，传 mobile 才按手机参考框", () => {
  const sharedAsDesktop = describeImageSlotAdvice({
    device: "desktop",
    designWidth: 810,
    designHeight: 1440,
    frameAspect: { width: 9, height: 16 },
    objectFit: "cover",
    source: { displayWidth: 941, displayHeight: 1672 },
    inherited: false,
  });
  const mobile = describeImageSlotAdvice({
    device: "mobile",
    designWidth: 390,
    designHeight: 693,
    frameAspect: { width: 9, height: 16 },
    objectFit: "cover",
    source: { displayWidth: 941, displayHeight: 1672 },
    inherited: true,
  });
  expect(sharedAsDesktop.sharpness).toMatch(/1080 宽、2 倍屏/);
  expect(mobile.sharpness).toMatch(/390 宽、3 倍屏/);
  expect(mobile.source).toMatch(/沿用桌面图/);
});
