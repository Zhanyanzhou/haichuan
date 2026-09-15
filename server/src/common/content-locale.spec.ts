import * as assert from "node:assert/strict";
import { test } from "node:test";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import {
  parsePublicContentLocale,
  requireEditablePublicContentLocale,
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

test("公开内容 locale：英文已退役时返回明确 unavailable，不回退中文", () => {
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

test("编辑内容 locale：中文可写，历史英文只读并返回 retired", () => {
  assert.equal(requireEditablePublicContentLocale("zh-CN"), "zh-CN");
  assert.throws(
    () => requireEditablePublicContentLocale("en"),
    (error: unknown) => {
      assert.ok(error instanceof BadRequestException);
      const response = error.getResponse() as Record<string, unknown>;
      assert.equal(response.code, "CONTENT_LOCALE_RETIRED");
      assert.equal(response.locale, "en");
      return true;
    },
  );
});
