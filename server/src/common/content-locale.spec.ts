import * as assert from "node:assert/strict";
import { test } from "node:test";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import {
  parsePublicContentLocale,
  requirePublishedPublicContentLocale,
} from "./content-locale";

test("公开内容 locale：缺省值与 zh-CN 保持中文兼容", () => {
  assert.equal(parsePublicContentLocale(undefined), "zh-CN");
  assert.equal(requirePublishedPublicContentLocale("zh-CN"), "zh-CN");
});

test("公开内容 locale：未知语言在访问事实源前返回 400", () => {
  assert.throws(
    () => parsePublicContentLocale("zh"),
    (error: unknown) => error instanceof BadRequestException,
  );
});

test("公开内容 locale：英文未发布时返回明确 unavailable，不回退中文", () => {
  assert.throws(
    () => requirePublishedPublicContentLocale("en"),
    (error: unknown) => {
      assert.ok(error instanceof NotFoundException);
      const response = error.getResponse() as Record<string, unknown>;
      assert.equal(response.code, "CONTENT_LOCALE_UNAVAILABLE");
      assert.equal(response.locale, "en");
      return true;
    },
  );
});
