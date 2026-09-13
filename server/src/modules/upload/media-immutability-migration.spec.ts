import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath =
  "prisma/migrations/20260913122000_add_media_authorization_inheritance/migration.sql";
const sql = readFileSync(migrationPath, "utf8");

const immutableTables = [{
  table: "media_asset_authorization_events",
  updateTrigger: "media_auth_events_immutable_update",
  deleteTrigger: "media_auth_events_immutable_delete",
  message: "media authorization events are immutable",
}, {
  table: "dynamic_template_version_media_assets",
  updateTrigger: "dtv_media_assets_immutable_update",
  deleteTrigger: "dtv_media_assets_immutable_delete",
  message: "template publication media manifests are immutable",
}, {
  table: "page_document_revision_media_assets",
  updateTrigger: "pdr_media_assets_immutable_update",
  deleteTrigger: "pdr_media_assets_immutable_delete",
  message: "page publication media manifests are immutable",
}] as const;

const triggerBody = (triggerName: string) => {
  const start = sql.indexOf(`CREATE TRIGGER \`${triggerName}\``);
  assert.ok(start >= 0, `缺少不可变触发器 ${triggerName}`);
  const next = sql.indexOf("\nCREATE TRIGGER `", start + 1);
  return sql.slice(start, next >= 0 ? next : sql.length);
};

test("D29 对授权事件与两类发布清单建立命名稳定的数据库不可变触发器", () => {
  for (const contract of immutableTables) {
    const tableCreation = sql.indexOf(`CREATE TABLE \`${contract.table}\``);
    assert.ok(tableCreation >= 0, `缺少目标表 ${contract.table}`);

    for (const [operation, triggerName] of [
      ["UPDATE", contract.updateTrigger],
      ["DELETE", contract.deleteTrigger],
    ] as const) {
      const body = triggerBody(triggerName);
      assert.ok(
        sql.indexOf(`CREATE TRIGGER \`${triggerName}\``) > tableCreation,
        `${triggerName} 必须在目标表创建后安装`,
      );
      assert.match(
        body,
        new RegExp(
          "BEFORE " + operation + " ON `" + contract.table + "`\\s+FOR EACH ROW",
        ),
      );
      assert.match(body, /SIGNAL SQLSTATE '45000'/);
      assert.match(body, new RegExp(`SET MESSAGE_TEXT = '${contract.message}'`));
      assert.doesNotMatch(body, /\bIF\b/, `${triggerName} 必须无条件拒绝行变更`);
    }
  }
});

test("D29 不可变触发器不拦截合法 INSERT", () => {
  for (const contract of immutableTables) {
    const triggerNames = [contract.updateTrigger, contract.deleteTrigger];
    for (const triggerName of triggerNames) {
      const body = triggerBody(triggerName);
      assert.doesNotMatch(body, /(?:BEFORE|AFTER) INSERT/);
    }
  }
});

test("D29 在数据库层强制先提交、独立审核，并只允许已批准授权撤权", () => {
  const compactSql = sql.replace(/\s+/g, " ");
  const approvalClause = compactSql.slice(
    compactSql.indexOf("(`review_status` <> 'APPROVED' OR ("),
    compactSql.indexOf("AND (`review_status` <> 'REJECTED' OR ("),
  );
  const rejectionClause = compactSql.slice(
    compactSql.indexOf("(`review_status` <> 'REJECTED' OR ("),
    compactSql.indexOf("CONSTRAINT `media_asset_authorizations_revocation_check`"),
  );
  for (const clause of [approvalClause, rejectionClause]) {
    assert.match(clause, /`submitted_by` IS NOT NULL/);
    assert.match(clause, /`submitted_at` IS NOT NULL/);
    assert.match(clause, /`reviewed_by` IS NOT NULL/);
    assert.match(clause, /`reviewed_at` IS NOT NULL/);
    assert.match(clause, /`reviewed_by` <> `submitted_by`/);
  }
  assert.match(
    compactSql,
    /`revocation_status` = 'REVOKED' AND `review_status` = 'APPROVED'/,
  );
});
