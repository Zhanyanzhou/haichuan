import assert from "node:assert/strict";
import { test } from "@playwright/test";
import { pageEditorDockFits } from "../src/page-builder/workspace/pageEditorWorkspaceTiers";

const dock = "dock" as const;
const rail = "rail" as const;

test("1440 起四区停靠后画布仍不低于 640", () => {
  assert.equal(pageEditorDockFits(1440, {
    library: dock,
    structure: dock,
    inspector: dock,
  }), true);
  assert.equal(pageEditorDockFits(1920, {
    library: dock,
    structure: dock,
    inspector: dock,
  }), true);
});

test("1200 到 1439 默认收起组件库；靠近 1440 时手动展开可以停靠", () => {
  assert.equal(pageEditorDockFits(1280, {
    library: rail,
    structure: dock,
    inspector: dock,
  }), true);
  assert.equal(pageEditorDockFits(1280, {
    library: dock,
    structure: dock,
    inspector: dock,
  }), false);
  assert.equal(pageEditorDockFits(1400, {
    library: dock,
    structure: dock,
    inspector: dock,
  }), true);
});

test("1025 到 1199 只停靠属性面板，再打开图层面板会压到画布底线", () => {
  assert.equal(pageEditorDockFits(1100, {
    library: rail,
    structure: rail,
    inspector: dock,
  }), true);
  assert.equal(pageEditorDockFits(1100, {
    library: rail,
    structure: dock,
    inspector: dock,
  }), false);
  assert.equal(pageEditorDockFits(1025, {
    library: rail,
    structure: rail,
    inspector: dock,
  }), true);
  assert.equal(pageEditorDockFits(1200, {
    library: rail,
    structure: dock,
    inspector: dock,
  }), true);
});
