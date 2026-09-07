import * as assert from "node:assert/strict";
import { test } from "node:test";
import { validate } from "class-validator";
import { UpdateSettingsDto } from "./dto/update-settings.dto";

test("门店地图链接只接受空值或 HTTP(S) 链接", async () => {
  for (const value of ["", "https://maps.example.com/store", "http://maps.example.com/store"]) {
    const dto = new UpdateSettingsDto();
    dto.storeMapUrl = value;
    assert.equal((await validate(dto)).length, 0);
  }

  const unsafe = new UpdateSettingsDto();
  unsafe.storeMapUrl = "javascript:alert(1)";
  const errors = await validate(unsafe);
  assert.ok(errors.some((error) => error.property === "storeMapUrl"));
});

test("站点发布配置只接受品牌模式、HTTPS 正式地址与受支持语言", async () => {
  const valid = new UpdateSettingsDto();
  valid.brandPresentationMode = "text-only";
  valid.canonicalBaseUrl = "https://example.invalid";
  valid.defaultLocale = "zh-CN";
  valid.publishedLocales = ["zh-CN"];
  assert.equal((await validate(valid)).length, 0);

  const invalid = new UpdateSettingsDto();
  invalid.brandPresentationMode = "automatic";
  invalid.canonicalBaseUrl = "http://example.invalid";
  invalid.defaultLocale = "en";
  invalid.publishedLocales = ["zh-CN", "fr"];
  const errors = await validate(invalid);
  assert.ok(errors.some((error) => error.property === "canonicalBaseUrl"));
  assert.ok(errors.some((error) => error.property === "brandPresentationMode"));
  assert.ok(errors.some((error) => error.property === "defaultLocale"));
  assert.ok(errors.some((error) => error.property === "publishedLocales"));
});
