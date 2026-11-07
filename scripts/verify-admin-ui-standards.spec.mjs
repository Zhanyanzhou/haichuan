import assert from "node:assert/strict";
import test from "node:test";

import { isResponsiveDockWidth } from "./verify-admin-ui-standards.mjs";

test("编辑器 dock 宽度接受语义等价的响应式 clamp", () => {
  assert.equal(isResponsiveDockWidth("clamp(200px, 15vw, 320px)"), true);
  assert.equal(isResponsiveDockWidth("clamp(144px, 11.5vw, 184px)"), true);
  assert.equal(isResponsiveDockWidth("clamp(144px, calc(var(--editor-dock-basis) * 0.11), 184px)"), true);
});

test("编辑器 dock 宽度拒绝固定比例、固定像素和无效边界", () => {
  assert.equal(isResponsiveDockWidth("20%"), false);
  assert.equal(isResponsiveDockWidth("240px"), false);
  assert.equal(isResponsiveDockWidth("clamp(240px, 15vw, 240px)"), false);
  assert.equal(isResponsiveDockWidth("clamp(320px, 15vw, 200px)"), false);
  assert.equal(isResponsiveDockWidth("clamp(0px, 15vw, 320px)"), false);
  assert.equal(isResponsiveDockWidth("clamp(144px, calc(var(--editor-dock-basis) * 0), 184px)"), false);
  assert.equal(isResponsiveDockWidth("clamp(144px, calc(var(--unknown-basis) * 0.11), 184px)"), false);
});
