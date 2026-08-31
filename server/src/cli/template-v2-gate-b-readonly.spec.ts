import assert from "node:assert/strict";
import test from "node:test";
import { definitionFixture } from "../modules/page-modules/dynamic-template-test-fixture";
import {
  classifyGateBMigrationIntegrity,
  createGateBReadOnlyConfig,
  evaluateReadOnlyGrantStatements,
  inventoryTemplateInstances,
  runTemplateV2GateBReadOnlyAudit,
  verifyStoredTemplateDefinitionChecksum,
} from "./template-v2-gate-b-readonly";

test("Gate B 重新计算 V2 定义 checksum，不信任数据库中的摘要字段", () => {
  const definition = definitionFixture();
  const calculated = verifyStoredTemplateDefinitionChecksum(definition, "0".repeat(64));
  assert.equal(calculated.matches, false);
  assert.match(calculated.calculatedChecksum, /^[a-f0-9]{64}$/);
  assert.equal(
    verifyStoredTemplateDefinitionChecksum(definition, calculated.calculatedChecksum).matches,
    true,
  );
  definition.name = "定义内容被异常改写";
  assert.equal(
    verifyStoredTemplateDefinitionChecksum(definition, calculated.calculatedChecksum).matches,
    false,
  );
});

test("Gate B 允许仅有已锁定 Gate C migration 待应用，但拒绝其他 migration 漂移", () => {
  assert.deepEqual(classifyGateBMigrationIntegrity({
    ok: false,
    facts: {
      issueCodes: ["PENDING_MIGRATION"],
      affectedMigrations: [
        "20260830110000_add_personal_content_template_revision",
        "20260830111000_add_dynamic_template_activations",
      ],
    },
  }), {
    baselineCompatible: true,
    pendingGateCMigrations: [
      "20260830110000_add_personal_content_template_revision",
      "20260830111000_add_dynamic_template_activations",
    ],
  });
  assert.equal(classifyGateBMigrationIntegrity({
    ok: false,
    facts: {
      issueCodes: ["UNKNOWN_CHECKSUM_MISMATCH"],
      affectedMigrations: ["20260828200000_add_dynamic_template_versioning"],
    },
  }).baselineCompatible, false);
  assert.equal(classifyGateBMigrationIntegrity({
    ok: false,
    facts: {
      issueCodes: ["PENDING_MIGRATION"],
      affectedMigrations: ["20260828200000_add_dynamic_template_versioning"],
    },
  }).baselineCompatible, false);
});

test("Gate B 配置要求显式只读授权、环境、数据库与审批引用完全匹配", () => {
  assert.throws(() => createGateBReadOnlyConfig({}), /READ_ONLY_AUTHORIZATION_REQUIRED/);
  const config = createGateBReadOnlyConfig({
    TEMPLATE_V2_GATE_B_READ_ONLY_AUTHORIZED: "1",
    TEMPLATE_V2_GATE_B_ENVIRONMENT_ID: "staging-cn-1",
    TEMPLATE_V2_GATE_B_EXPECTED_DATABASE: "haichuan_staging",
    TEMPLATE_V2_GATE_B_APPROVAL_REFERENCE: "approval-2026-08-30",
    DATABASE_URL: "mysql://readonly:secret@db.example.invalid:3306/haichuan_staging",
  });
  assert.equal(config.environmentId, "staging-cn-1");
  assert.equal(config.expectedDatabase, "haichuan_staging");
  assert.match(config.approvalReferenceHash, /^[a-f0-9]{64}$/);
  assert.throws(() => createGateBReadOnlyConfig({
    TEMPLATE_V2_GATE_B_READ_ONLY_AUTHORIZED: "1",
    TEMPLATE_V2_GATE_B_ENVIRONMENT_ID: "staging-cn-1",
    TEMPLATE_V2_GATE_B_EXPECTED_DATABASE: "wrong_database",
    TEMPLATE_V2_GATE_B_APPROVAL_REFERENCE: "approval-2026-08-30",
    DATABASE_URL: "mysql://readonly:secret@db.example.invalid:3306/haichuan_staging",
  }), /DATABASE_NAME_MISMATCH/);
});

test("Gate B 数据库账号只接受 SELECT、SHOW VIEW 与 USAGE，拒绝写权限、角色和 GRANT OPTION", () => {
  assert.deepEqual(evaluateReadOnlyGrantStatements([
    "GRANT USAGE ON *.* TO `audit`@`%`",
    "GRANT SELECT, SHOW VIEW ON `haichuan_staging`.* TO `audit`@`%`",
  ]), { ok: true, rejected: [] });
  const rejected = evaluateReadOnlyGrantStatements([
    "GRANT SELECT, UPDATE ON `haichuan_staging`.* TO `audit`@`%`",
    "GRANT `readonly_role`@`%` TO `audit`@`%`",
    "GRANT SELECT ON `haichuan_staging`.* TO `audit`@`%` WITH GRANT OPTION",
  ]);
  assert.equal(rejected.ok, false);
  assert.deepEqual(rejected.rejected, [
    "GRANT_OPTION",
    "ROLE_OR_UNKNOWN_GRANT",
    "WRITE_OR_ADMIN_PRIVILEGE",
  ]);
});

test("Gate B 页面盘点只输出实例数量、稳定模板身份和 JSON 字节，不复制页面正文", () => {
  const inventory = inventoryTemplateInstances({
    content: [
      { type: "首屏主视觉", props: { title: "不得进入报告正文" } },
      {
        type: "动态模板实例",
        props: {
          instanceId: "instance_1",
          templateId: "tpl_safe",
          templateVersion: 3,
          contentBySlotId: { slot_heading: "不得进入报告正文" },
        },
      },
      { type: "动态模板实例", props: { templateId: "tpl_invalid" } },
    ],
    zones: {},
    root: { props: {} },
  });
  assert.equal(inventory.legacyInstanceCount, 1);
  assert.equal(inventory.dynamicInstanceCount, 2);
  assert.equal(inventory.invalidDynamicInstanceCount, 1);
  assert.deepEqual(inventory.dynamicInstancesByTemplateId, { tpl_safe: 1 });
  assert.ok(inventory.jsonBytes > 0);
  assert.doesNotMatch(JSON.stringify(inventory), /不得进入报告正文/);
});

test("Gate B 审计入口只执行 SELECT/SHOW，并在表或 migration 未就绪时输出阻断而不输出正文", async () => {
  const queries: string[] = [];
  const database = {
    async $queryRawUnsafe<T>(query: string): Promise<T> {
      const normalized = query.replace(/\s+/g, " ").trim();
      queries.push(normalized);
      assert.match(normalized, /^(?:SELECT|SHOW)\b/i);
      if (/^SELECT DATABASE\(\)/i.test(normalized)) {
        return [{ databaseName: "haichuan_staging" }] as T;
      }
      if (/^SHOW GRANTS/i.test(normalized)) {
        return [{ grants: "GRANT SELECT, SHOW VIEW ON `haichuan_staging`.* TO `audit`@`%`" }] as T;
      }
      if (/FROM information_schema\.tables/i.test(normalized)) {
        return [
          { tableName: "_prisma_migrations" },
          { tableName: "page_documents" },
          { tableName: "personal_content_templates" },
        ] as T;
      }
      if (/FROM _prisma_migrations/i.test(normalized)) return [] as T;
      if (/FROM page_documents/i.test(normalized)) {
        return [{
          id: 1,
          pageKey: "home",
          status: "DRAFT",
          updatedAt: new Date("2026-08-30T00:00:00.000Z"),
          puckData: {
            content: [{ type: "首屏主视觉", props: { title: "敏感正文不得输出" } }],
            root: { props: {} },
            zones: {},
          },
          metadata: {},
        }] as T;
      }
      if (/COUNT\(\*\).*personal_content_templates/i.test(normalized)) {
        return [{ count: 2 }] as T;
      }
      throw new Error(`未覆盖的只读查询：${normalized}`);
    },
  };
  const report = await runTemplateV2GateBReadOnlyAudit(database, {
    environmentId: "staging-cn-1",
    expectedDatabase: "haichuan_staging",
    approvalReferenceHash: "a".repeat(64),
  });
  assert.equal(report.readOnlyAuditPassed, false);
  assert.match(report.evidenceBoundary, /不构成 Gate C 授权/);
  assert.equal(report.counts.pageDocuments, 1);
  assert.equal(report.counts.personalTemplates, 2);
  assert.equal(report.inventories.pageDrafts.legacyInstanceCount, 1);
  assert.ok(report.blockers.some((value) => value.includes("必需表")));
  assert.doesNotMatch(JSON.stringify(report), /敏感正文不得输出/);
  assert.ok(queries.length > 0);
});
