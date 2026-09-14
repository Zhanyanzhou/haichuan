import assert from "node:assert/strict";
import test from "node:test";

import {
  createPreproductionSafeSnapshot,
  renderPreproductionSafeHtml,
} from "./create-preproduction-safe-seo-snapshot.mjs";
import { validatePublicSeoSnapshot } from "./export-public-seo-snapshot.mjs";

test("safe preproduction snapshot is deterministic, empty, and stage bound", () => {
  const input = {
    origin: "https://preview.example.test",
    revision: "a".repeat(40),
  };
  const first = createPreproductionSafeSnapshot(input);
  const second = createPreproductionSafeSnapshot(input);
  assert.deepEqual(first, second);
  assert.equal(first.sourceStage, "preproduction");
  assert.equal(first.contentReady, false);
  assert.deepEqual(first.routes, []);
  assert.deepEqual(validatePublicSeoSnapshot(first), first);
});

test("safe preproduction HTML contains noindex and no invented business facts", () => {
  const html = renderPreproductionSafeHtml();
  assert.match(html, /name="robots" content="noindex, nofollow"/);
  assert.match(html, /data-content-ready="false"/);
  assert.match(html, /不代表正式网站内容/);
  assert.doesNotMatch(html, /电话|邮箱|地址|价格|库存|营业时间/);
  assert.doesNotMatch(html, /<script\b/i);
});
