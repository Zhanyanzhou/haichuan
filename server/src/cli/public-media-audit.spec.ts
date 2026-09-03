import assert from "node:assert/strict";
import test from "node:test";
import { classifyPublicMedia, type AuditRow } from "./public-media-audit";

function row(visibility: string): AuditRow {
  return {
    productId: 1,
    productCode: "P1",
    productName: "测试",
    visibility,
    status: "PUBLISHED",
    imageId: 1,
    url: "/uploads/2026/01/01/a.jpg",
    isVideo: false,
  };
}

test("受限可见性（MEMBER/PARTNER）关联的公开媒体被标记，PUBLIC 不标记", () => {
  const { restricted, byVisibility } = classifyPublicMedia([
    row("PUBLIC"),
    row("PUBLIC"),
    row("MEMBER"),
    row("PARTNER"),
  ]);
  assert.equal(restricted.length, 2);
  assert.deepEqual(restricted.map((item) => item.visibility).sort(), ["MEMBER", "PARTNER"]);
  assert.deepEqual(byVisibility, { PUBLIC: 2, MEMBER: 1, PARTNER: 1 });
});

test("全部公开可见性时无受限项", () => {
  const { restricted } = classifyPublicMedia([row("PUBLIC"), row("PUBLIC")]);
  assert.equal(restricted.length, 0);
});
