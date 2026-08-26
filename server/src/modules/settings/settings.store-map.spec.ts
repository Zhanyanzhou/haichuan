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
