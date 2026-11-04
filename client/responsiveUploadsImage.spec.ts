import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildResponsiveUploadsDerivedUrl,
  buildResponsiveUploadsSrcSet,
  RESPONSIVE_UPLOADS_IMAGE_STRATEGY_VERSION,
  RESPONSIVE_UPLOADS_IMAGE_WIDTHS,
} from "./src/utils/responsiveUploadsImage.ts";

const FACTS = { displayWidth: 4000, displayHeight: 2000 };

test("没有原图展示尺寸或动图时不生成 srcset", () => {
  assert.equal(buildResponsiveUploadsSrcSet("/uploads/page-assets/hero.png"), undefined);
  assert.equal(buildResponsiveUploadsSrcSet("/uploads/page-assets/hero.png", {
    ...FACTS,
    animated: true,
  }), undefined);
  assert.equal(buildResponsiveUploadsSrcSet("https://cdn.example.com/a.png", FACTS), undefined);
  assert.equal(buildResponsiveUploadsSrcSet("/uploads/a.svg", FACTS), undefined);
  assert.equal(buildResponsiveUploadsSrcSet(undefined, FACTS), undefined);
  assert.equal(buildResponsiveUploadsSrcSet("/uploads/a.png?width=800", FACTS), undefined);
});

test("srcset 描述符是实际输出宽度，并在原图宽度处截断", () => {
  const wide = buildResponsiveUploadsSrcSet("/uploads/page-assets/hero.png", FACTS);
  assert.ok(wide);
  assert.match(wide!, /width=3840&rv=2 3840w|width=3840&rv=2 3840w/);
  assert.match(wide!, /\/uploads\/page-assets\/hero\.png\?width=480&rv=2 480w/);
  assert.match(wide!, /width=3840&rv=2 3840w/);

  const narrow = buildResponsiveUploadsSrcSet("/uploads/page-assets/phone.jpg?cache=1", {
    displayWidth: 941,
    displayHeight: 1672,
  });
  assert.equal(
    narrow,
    [
      "/uploads/page-assets/phone.jpg?cache=1&width=480&rv=2 480w",
      "/uploads/page-assets/phone.jpg?cache=1&width=800&rv=2 800w",
      "/uploads/page-assets/phone.jpg?cache=1&width=1200&rv=2 941w",
    ].join(", "),
  );
  assert.equal(narrow!.includes("1680"), false);

  const tiny = buildResponsiveUploadsSrcSet("/uploads/page-assets/tiny.png", {
    displayWidth: 200,
    displayHeight: 100,
  });
  assert.equal(tiny, "/uploads/page-assets/tiny.png?width=480&rv=2 200w");
});

test("派生单 URL 追加当前策略版本；已带 width 保持原样", () => {
  assert.equal(
    buildResponsiveUploadsDerivedUrl("/uploads/page-assets/poster.png", 1200),
    "/uploads/page-assets/poster.png?width=1200&rv=2",
  );
  assert.equal(buildResponsiveUploadsDerivedUrl("/uploads/a.png", 1234), undefined);
  assert.equal(buildResponsiveUploadsDerivedUrl("/uploads/a.png?width=800", 1200), "/uploads/a.png?width=800");
  assert.equal(buildResponsiveUploadsDerivedUrl(undefined, 1200), undefined);
});

test("前后端宽度档和策略版本来自各自源码且一致", () => {
  const server = readFileSync(
    new URL("../server/src/modules/upload/responsive-public-media.ts", import.meta.url),
    "utf8",
  );
  const client = readFileSync(
    new URL("./src/utils/responsiveUploadsImage.ts", import.meta.url),
    "utf8",
  );
  const expected = "[480, 800, 1200, 1680, 2400, 2880, 3840]";
  assert.match(server, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(client, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(server, /RESPONSIVE_PUBLIC_IMAGE_STRATEGY_VERSION = 2/);
  assert.equal(RESPONSIVE_UPLOADS_IMAGE_STRATEGY_VERSION, 2);
  assert.deepEqual([...RESPONSIVE_UPLOADS_IMAGE_WIDTHS], [480, 800, 1200, 1680, 2400, 2880, 3840]);
});
