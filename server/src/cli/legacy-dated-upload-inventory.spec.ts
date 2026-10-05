import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  extractUploadReferencesFromPuckData,
  inventoryLegacyDatedUploads,
  parseLegacyDatedUploadInventoryArgs,
  parseLegacyUploadUrl,
} from "./legacy-dated-upload-inventory";

test("日期路径与受控路径分类互斥，危险地址失败关闭", () => {
  assert.deepEqual(parseLegacyUploadUrl("/uploads/2026/09/01/hero.png"), {
    kind: "dated",
    storageKey: "2026/09/01/hero.png",
  });
  assert.deepEqual(parseLegacyUploadUrl("/uploads/page-assets/hero.png"), {
    kind: "managed",
    storageKey: "page-assets/hero.png",
  });
  assert.equal(parseLegacyUploadUrl("/uploads/2026/09/01/%2e%2e/secret.png").kind, "unsafe");
  assert.equal(parseLegacyUploadUrl("https://cdn.example/a.png").kind, "unsafe");
});

test("从 Puck 快照提取首屏历史上传引用", () => {
  const refs = extractUploadReferencesFromPuckData({
    content: [{
      type: "首屏主视觉",
      props: {
        desktopImage: "/uploads/2026/09/01/a.png",
        mobileImage: "/uploads/2026/09/12/b.png",
      },
    }],
  });
  assert.equal(refs.length, 2);
  assert.equal(refs[0]?.blockType, "首屏主视觉");
  assert.equal(refs[1]?.url, "/uploads/2026/09/12/b.png");
});

test("盘点对现存日期文件给出复制到 page-assets 的下一步，且拒绝 --apply", () => {
  const publicRoot = mkdtempSync(join(tmpdir(), "haichuan-legacy-upload-"));
  const datedDir = join(publicRoot, "2026", "09", "01");
  mkdirSync(datedDir, { recursive: true });
  const bytes = Buffer.from("legacy-hero-bytes");
  writeFileSync(join(datedDir, "hero.png"), bytes);
  const checksum = createHash("sha256").update(bytes).digest("hex");

  const report = inventoryLegacyDatedUploads([
    { url: "/uploads/2026/09/01/hero.png", path: "content[0].props.desktopImage", blockType: "首屏主视觉" },
    { url: "/uploads/2026/09/01/missing.png" },
    { url: "/uploads/page-assets/already.png" },
  ], { publicRoot });

  assert.equal(report.mode, "dry-run");
  assert.equal(report.counts.DATED_FILE_PRESENT, 1);
  assert.equal(report.counts.DATED_FILE_MISSING, 1);
  assert.equal(report.counts.ALREADY_MANAGED, 1);
  assert.equal(report.entries[0]?.nextAction, "COPY_REGISTER_EXPLICIT_REMAP");
  assert.equal(report.entries[0]?.proposedManagedStorageKey, `page-assets/${checksum}.png`);
  assert.match(report.entries[0]?.notes[0] ?? "", /原路径补登记不能解除发布阻断/);
  assert.equal(report.entries[1]?.nextAction, "LOCATE_FILE");

  assert.throws(
    () => parseLegacyDatedUploadInventoryArgs(["--apply", "--input", "a.json"]),
    /禁止 --apply/,
  );
});
