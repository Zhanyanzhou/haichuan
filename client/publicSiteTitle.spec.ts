import assert from "node:assert/strict";
import test from "node:test";
import { applyOfficialSiteTitle } from "./src/utils/publicSiteTitle.ts";

// 运行：node --test publicSiteTitle.spec.ts（Node 25 原生剥离类型，无 ts-node 依赖）。
const brand = "海川珠宝";
const official = "海川珠宝官方网站";

test("首页标签使用默认页面标题", () => {
  assert.equal(applyOfficialSiteTitle(brand, brand, official), official);
  assert.equal(applyOfficialSiteTitle(undefined, brand, official), official);
  assert.equal(applyOfficialSiteTitle(official, brand, official), official);
});

test("内页把站点名称换成默认页面标题", () => {
  assert.equal(
    applyOfficialSiteTitle("关于海川 | 海川珠宝", brand, official),
    "关于海川 | 海川珠宝官方网站",
  );
  assert.equal(
    applyOfficialSiteTitle("隐私说明 | 海川珠宝", brand, official),
    "隐私说明 | 海川珠宝官方网站",
  );
});

test("站点设置缺失或仍是短名称时，标签仍使用官方网站标题", () => {
  assert.equal(applyOfficialSiteTitle(brand, brand, undefined), official);
  assert.equal(applyOfficialSiteTitle("关于海川 | 海川珠宝", brand, undefined), "关于海川 | 海川珠宝官方网站");
  assert.equal(applyOfficialSiteTitle("关于海川 | 海川珠宝", brand, brand), "关于海川 | 海川珠宝官方网站");
  assert.equal(applyOfficialSiteTitle("作品名称", brand, official), "作品名称");
  assert.equal(applyOfficialSiteTitle("关于海川 | 其他品牌", "其他品牌", undefined), "关于海川 | 其他品牌");
});
