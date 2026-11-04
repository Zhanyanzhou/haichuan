import { expect, test } from "@playwright/test";
import { mediaSpecMatchingFrame } from "../src/page-builder/fields/mediaSpec";

test("首屏上传像素跟着画框：16:9 保持横图，9:16 沿长边换成竖图", () => {
  const landscape = mediaSpecMatchingFrame(1440, 810, "16:9", "桌面");
  expect(landscape).toMatchObject({ width: 1440, height: 810, ratio: "16 / 9" });

  const portrait = mediaSpecMatchingFrame(1440, 810, "9:16", "手机");
  expect(portrait).toMatchObject({ width: 810, height: 1440, ratio: "9 / 16" });

  const alreadyPortrait = mediaSpecMatchingFrame(810, 1440, "9:16", "手机");
  expect(alreadyPortrait).toMatchObject({ width: 810, height: 1440, ratio: "9 / 16" });

  const fallback = mediaSpecMatchingFrame(undefined, undefined, "9:16", "手机");
  expect(fallback).toMatchObject({ width: 1080, height: 1920, ratio: "9 / 16" });
});
