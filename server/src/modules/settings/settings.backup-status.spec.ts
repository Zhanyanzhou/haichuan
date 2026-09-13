import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  evaluateBackupExecutionMarker,
  formatBackupRetentionDisplay,
  resolveBackupRetentionDays,
  summarizeBackupArtifacts,
} from "./settings.service";

const NOW = new Date("2026-08-26T12:00:00.000Z");

function artifact(name: string, size: number, mtime: string) {
  return { name, size, mtime: new Date(mtime) };
}

test("备份保留期 7 天按安全配置原值展示", () => {
  assert.equal(resolveBackupRetentionDays("7"), 7);
  assert.equal(formatBackupRetentionDisplay("7"), "7 天");
});

test("备份保留期非 7 天按安全配置原值展示", () => {
  assert.equal(resolveBackupRetentionDays("30"), 30);
  assert.equal(formatBackupRetentionDisplay("30"), "30 天");
});

test("备份保留期缺失时交由部署环境管理", () => {
  assert.equal(resolveBackupRetentionDays(undefined), null);
  assert.equal(formatBackupRetentionDisplay(undefined), "由部署环境管理");
});

test("备份保留期非法时不回显原始配置", () => {
  const invalid = "7 days /srv/private";
  assert.equal(resolveBackupRetentionDays(invalid), null);
  assert.equal(formatBackupRetentionDisplay(invalid), "由部署环境管理");
  assert.equal(formatBackupRetentionDisplay(invalid).includes(invalid), false);
});

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

test("备份状态标记只在最近结果成功、退出码为零且未超宽限时健康", () => {
  const marker = [
    "SCHEMA_VERSION=1",
    "LAST_ATTEMPT_STARTED_AT=2026-08-26T10:59:00Z",
    "LAST_ATTEMPT_FINISHED_AT=2026-08-26T11:00:03Z",
    "LAST_SUCCESS_AT=2026-08-26T11:00:03Z",
    "LAST_EXIT_CODE=0",
    "RESULT=SUCCESS",
    "ERROR_CODE=NONE",
    "WARNING_CODE=NONE",
    "LATEST_MANIFEST=jewelry_db_20260826_110000.sha256",
    "",
  ].join("\n");
  const result = evaluateBackupExecutionMarker(marker, 86400, 3600, NOW);
  assert.equal(result.markerValid, true);
  assert.equal(result.isFresh, true);
  assert.equal(result.isHealthy, true);
  assert.equal(result.latestManifest, "jewelry_db_20260826_110000.sha256");
});

test("最近一次失败或磁盘告警不会被较早成功产物伪装为健康", () => {
  const base = [
    "SCHEMA_VERSION=1",
    "LAST_ATTEMPT_STARTED_AT=2026-08-26T11:55:00Z",
    "LAST_ATTEMPT_FINISHED_AT=2026-08-26T11:56:00Z",
    "LAST_SUCCESS_AT=2026-08-26T11:00:03Z",
    "LATEST_MANIFEST=jewelry_db_20260826_110000.sha256",
  ];
  const failed = evaluateBackupExecutionMarker([
    ...base,
    "LAST_EXIT_CODE=1",
    "RESULT=FAILED",
    "ERROR_CODE=MEDIA_ARCHIVE_FAILED",
    "WARNING_CODE=NONE",
  ].join("\n"), 86400, 3600, NOW);
  assert.equal(failed.isFresh, true);
  assert.equal(failed.isHealthy, false);
  assert.equal(failed.errorCode, "MEDIA_ARCHIVE_FAILED");

  const warning = evaluateBackupExecutionMarker([
    ...base,
    "LAST_EXIT_CODE=0",
    "RESULT=WARNING",
    "ERROR_CODE=DISK_HIGH",
    "WARNING_CODE=DISK_HIGH",
  ].join("\n"), 86400, 3600, NOW);
  assert.equal(warning.isHealthy, false);
});

test("格式异常或超期的备份状态标记安全失败", () => {
  const invalid = evaluateBackupExecutionMarker("RESULT=SUCCESS\n", 86400, 3600, NOW);
  assert.equal(invalid.executionStatus, "INVALID");
  assert.equal(invalid.isHealthy, false);

  const stale = evaluateBackupExecutionMarker([
    "SCHEMA_VERSION=1",
    "LAST_ATTEMPT_STARTED_AT=2026-08-24T10:00:00Z",
    "LAST_ATTEMPT_FINISHED_AT=2026-08-24T10:01:00Z",
    "LAST_SUCCESS_AT=2026-08-24T10:01:00Z",
    "LAST_EXIT_CODE=0",
    "RESULT=SUCCESS",
    "ERROR_CODE=NONE",
    "WARNING_CODE=NONE",
    "LATEST_MANIFEST=jewelry_db_20260824_100000.sha256",
  ].join("\n"), 86400, 3600, NOW);
  assert.equal(stale.isFresh, false);
  assert.equal(stale.isHealthy, false);
});
