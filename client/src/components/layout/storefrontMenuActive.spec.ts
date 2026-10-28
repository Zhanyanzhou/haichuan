import assert from "node:assert/strict";
import test from "node:test";
import { isStorefrontMenuActive } from "./storefrontMenuActive.ts";

test("作品详情归选款中心，不归珠宝作品", () => {
  const detail = "/products/ATP1874";
  assert.equal(isStorefrontMenuActive(detail, "/catalog"), true);
  assert.equal(isStorefrontMenuActive(`${detail}?from=%2Fcatalog`, "/catalog"), true);
  assert.equal(isStorefrontMenuActive(detail, "/products"), false);
  assert.equal(isStorefrontMenuActive(detail, "/"), false);
});

test("作品展陈页只点亮珠宝作品", () => {
  assert.equal(isStorefrontMenuActive("/products", "/products"), true);
  assert.equal(isStorefrontMenuActive("/products", "/catalog"), false);
  assert.equal(isStorefrontMenuActive("/products/", "/products"), true);
});

test("选款中心与首页按自身地址点亮", () => {
  assert.equal(isStorefrontMenuActive("/catalog", "/catalog"), true);
  assert.equal(isStorefrontMenuActive("/catalog/page/2", "/catalog"), true);
  assert.equal(isStorefrontMenuActive("/catalog", "/products"), false);
  assert.equal(isStorefrontMenuActive("/", "/"), true);
  assert.equal(isStorefrontMenuActive("/about", "/"), false);
});
