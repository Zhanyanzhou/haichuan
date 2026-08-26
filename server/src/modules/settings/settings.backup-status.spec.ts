import * as assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeBackupArtifacts } from "./settings.service";

const NOW = new Date("2026-08-26T12:00:00.000Z");

function artifact(name: string, size: number, mtime: string) {
  return { name, size, mtime: new Date(mtime) };
}

test("备份状态只接受数据库与两类媒体同批的完整备份组", () => {
  const result = summarizeBackupArtifacts([
    artifact("jewelry_db_20260826_110000.sql.gz", 4096, "2026-08-26T11:00:00.000Z"),
    artifact("jewelry_media_20260826_110000_uploads.tar.gz", 8192, "2026-08-26T11:00:01.000Z"),
    artifact("jewelry_media_20260826_110000_private-media.tar.gz", 512, "2026-08-26T11:00:02.000Z"),
    artifact("jewelry_db_20260826_110000.sha256", 256, "2026-08-26T11:00:03.000Z"),
  ], 86400, NOW);

  assert.equal(result.completeSets.length, 1);
  assert.equal(result.latest?.timestamp, "20260826_110000");
  assert.equal(result.isFresh, true);
  assert.equal(result.incompleteArtifactCount, 0);
});

test("20 字节失败残片不能遮蔽较早的完整备份组", () => {
  const result = summarizeBackupArtifacts([
    artifact("jewelry_db_20260826_115900.sql.gz", 20, "2026-08-26T11:59:00.000Z"),
    artifact("jewelry_db_20260825_110000.sql.gz", 4096, "2026-08-25T11:00:00.000Z"),
    artifact("jewelry_media_20260825_110000_uploads.tar.gz", 8192, "2026-08-25T11:00:01.000Z"),
    artifact("jewelry_media_20260825_110000_private-media.tar.gz", 512, "2026-08-25T11:00:02.000Z"),
    artifact("jewelry_db_20260825_110000.sha256", 256, "2026-08-25T11:00:03.000Z"),
  ], 86400, NOW);

  assert.equal(result.latest?.timestamp, "20260825_110000");
  assert.equal(result.isFresh, true);
  assert.equal(result.incompleteArtifactCount, 1);
});

test("超过两个计划周期的完整备份必须标记为不新鲜", () => {
  const result = summarizeBackupArtifacts([
    artifact("jewelry_db_20260823_110000.sql.gz", 4096, "2026-08-23T11:00:00.000Z"),
    artifact("jewelry_media_20260823_110000_uploads.tar.gz", 8192, "2026-08-23T11:00:01.000Z"),
    artifact("jewelry_media_20260823_110000_private-media.tar.gz", 512, "2026-08-23T11:00:02.000Z"),
    artifact("jewelry_db_20260823_110000.sha256", 256, "2026-08-23T11:00:03.000Z"),
  ], 86400, NOW);

  assert.equal(result.completeSets.length, 1);
  assert.equal(result.isFresh, false);
});

test("缺少任一媒体归档时不能形成完整备份组", () => {
  const result = summarizeBackupArtifacts([
    artifact("jewelry_db_20260826_110000.sql.gz", 4096, "2026-08-26T11:00:00.000Z"),
    artifact("jewelry_media_20260826_110000_uploads.tar.gz", 8192, "2026-08-26T11:00:01.000Z"),
    artifact("jewelry_db_20260826_110000.sha256", 256, "2026-08-26T11:00:03.000Z"),
  ], 86400, NOW);

  assert.equal(result.completeSets.length, 0);
  assert.equal(result.latest, null);
  assert.equal(result.isFresh, false);
  assert.equal(result.incompleteArtifactCount, 3);
});

test("没有 SHA-256 完成清单的三份产物仍视为未提交批次", () => {
  const result = summarizeBackupArtifacts([
    artifact("jewelry_db_20260826_110000.sql.gz", 4096, "2026-08-26T11:00:00.000Z"),
    artifact("jewelry_media_20260826_110000_uploads.tar.gz", 8192, "2026-08-26T11:00:01.000Z"),
    artifact("jewelry_media_20260826_110000_private-media.tar.gz", 512, "2026-08-26T11:00:02.000Z"),
  ], 86400, NOW);

  assert.equal(result.completeSets.length, 0);
  assert.equal(result.incompleteArtifactCount, 3);
});
