import assert from "node:assert/strict";
import test from "node:test";
import {
  buildResponsiveUploadsDerivedUrl,
  buildResponsiveUploadsSrcSet,
  RESPONSIVE_UPLOADS_IMAGE_WIDTHS,
} from "./src/utils/responsiveUploadsImage.ts";

// 运行：node --test responsiveUploadsImage.spec.ts（Node 25 原生剥离类型，无 ts-node 依赖）。
test("srcset 为 /uploads 图片生成首末档候选", () => {
  const srcSet = buildResponsiveUploadsSrcSet("/uploads/page-assets/hero.png");
  assert.ok(srcSet);
  assert.match(srcSet!, /\/uploads\/page-assets\/hero\.png\?width=480 480w/);
  assert.match(srcSet!, /\/uploads\/page-assets\/hero\.png\?width=1680 1680w/);
});

test("非 /uploads 或非图片后缀不生成 srcset", () => {
  assert.equal(buildResponsiveUploadsSrcSet("https://cdn.example.com/a.png"), undefined);
  assert.equal(buildResponsiveUploadsSrcSet("/uploads/a.svg"), undefined);
  assert.equal(buildResponsiveUploadsSrcSet(undefined), undefined);
});

test("已带 width 参数的 URL 不重复派生 srcset", () => {
  assert.equal(buildResponsiveUploadsSrcSet("/uploads/a.png?width=800"), undefined);
});

test("派生单 URL 追加 width 参数（poster 用）", () => {
  assert.equal(
    buildResponsiveUploadsDerivedUrl("/uploads/page-assets/poster.png", 1200),
    "/uploads/page-assets/poster.png?width=1200",
  );
  assert.equal(
    buildResponsiveUploadsDerivedUrl("/uploads/page-assets/poster.png", 480),
    "/uploads/page-assets/poster.png?width=480",
  );
});

test("派生单 URL 拒绝非 /uploads、非图片、非法宽度；已带 width 回退原样", () => {
  assert.equal(buildResponsiveUploadsDerivedUrl("https://cdn.example.com/a.png", 1200), undefined);
  assert.equal(buildResponsiveUploadsDerivedUrl("/uploads/a.svg", 1200), undefined);
  assert.equal(buildResponsiveUploadsDerivedUrl("/uploads/a.png", 1234), undefined);
  assert.equal(buildResponsiveUploadsDerivedUrl("/uploads/a.png?width=800", 1200), "/uploads/a.png?width=800");
  assert.equal(buildResponsiveUploadsDerivedUrl(undefined, 1200), undefined);
});

test("宽度集合与派生端点一致", () => {
  assert.deepEqual([...RESPONSIVE_UPLOADS_IMAGE_WIDTHS], [480, 800, 1200, 1680]);
});
