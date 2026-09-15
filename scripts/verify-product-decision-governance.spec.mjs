import assert from "node:assert/strict";
import test from "node:test";

import {
  collectGovernanceFailures,
  loadDecisionGovernanceSnapshot,
} from "./verify-product-decision-governance.mjs";

test("当前关键产品决策具有唯一且一致的稳定状态", async () => {
  const failures = collectGovernanceFailures(await loadDecisionGovernanceSnapshot());
  assert.deepEqual(failures, [], failures.join("\n"));
});

test("稳定状态缺失或漂移会被拒绝", async () => {
  const missing = await loadDecisionGovernanceSnapshot();
  missing.decisions = missing.decisions.replace("<!-- decision-status:D.32=TARGET -->", "");
  assert.ok(
    collectGovernanceFailures(missing).includes("DECISION_GOVERNANCE_STATUS_MISSING:D.32"),
  );

  const drifted = await loadDecisionGovernanceSnapshot();
  drifted.decisions = drifted.decisions.replace(
    "<!-- decision-status:D.2=PAUSED -->",
    "<!-- decision-status:D.2=ENABLED -->",
  );
  assert.ok(
    collectGovernanceFailures(drifted).includes("DECISION_GOVERNANCE_STATUS_MISMATCH:D.2:ENABLED:PAUSED"),
  );
});

test("稳定状态必须位于自己的决定章节", async () => {
  const snapshot = await loadDecisionGovernanceSnapshot();
  snapshot.decisions = snapshot.decisions
    .replace("<!-- decision-status:D.32=TARGET -->", "")
    .replace(/^(### D\.2[^\n]*\n)/m, "$1<!-- decision-status:D.32=TARGET -->\n");
  assert.ok(
    collectGovernanceFailures(snapshot).includes("DECISION_GOVERNANCE_STATUS_MISSING:D.32"),
  );
});

test("D.32-D.35 的适用范围、启用条件、替代关系和验证入口不能缺失或漂移", async () => {
  const missingActivation = await loadDecisionGovernanceSnapshot();
  missingActivation.decisions = missingActivation.decisions.replace(
    '"activation":["approved-candidate","target-environment","merchant-and-channel-identity","end-to-end-funds","production-approval"],',
    "",
  );
  assert.ok(
    collectGovernanceFailures(missingActivation).includes(
      "DECISION_GOVERNANCE_CONTRACT_FIELD_MISSING:D.32:activation",
    ),
  );

  const missingCriticalActivation = await loadDecisionGovernanceSnapshot();
  missingCriticalActivation.decisions = missingCriticalActivation.decisions.replace(
    ',"merchant-and-channel-identity"',
    "",
  );
  assert.ok(
    collectGovernanceFailures(missingCriticalActivation).includes(
      "DECISION_GOVERNANCE_CONTRACT_FIELD_MISMATCH:D.32:activation",
    ),
  );

  const driftedSupersedes = await loadDecisionGovernanceSnapshot();
  driftedSupersedes.decisions = driftedSupersedes.decisions.replace(
    '"supersedes":["D.24:universal-high-assurance"]',
    '"supersedes":[]',
  );
  assert.ok(
    collectGovernanceFailures(driftedSupersedes).includes(
      "DECISION_GOVERNANCE_CONTRACT_FIELD_MISMATCH:D.34:supersedes",
    ),
  );

  const missingValidation = await loadDecisionGovernanceSnapshot();
  missingValidation.decisions = missingValidation.decisions.replace(
    ',"validation":["page-review-service","admin-review-ui","publish-readback"]',
    "",
  );
  assert.ok(
    collectGovernanceFailures(missingValidation).includes(
      "DECISION_GOVERNANCE_CONTRACT_FIELD_MISSING:D.33:validation",
    ),
  );
});

test("同一稳定编号的重复状态会被拒绝", async () => {
  const snapshot = await loadDecisionGovernanceSnapshot();
  snapshot.decisions += "\n<!-- decision-status:D.28=ENABLED -->\n";
  assert.ok(
    collectGovernanceFailures(snapshot).includes("DECISION_GOVERNANCE_STATUS_DUPLICATE:D.28"),
  );
});

test("唯一退役标识不能被另一决定重复声明", async () => {
  const snapshot = await loadDecisionGovernanceSnapshot();
  snapshot.decisions = snapshot.decisions.replace(
    "<!-- decision-status:D.28=ENABLED -->",
    "<!-- decision-status:D.28=RETIRED retired-capability:page-recipe-guidance -->",
  );
  assert.ok(
    collectGovernanceFailures(snapshot).includes("DECISION_GOVERNANCE_RETIRED_CAPABILITY_DUPLICATE:page-recipe-guidance"),
  );
});

test("正文措辞、源码形状和 CODEOWNERS 用户名不替代结构化治理元数据", async () => {
  const snapshot = await loadDecisionGovernanceSnapshot();
  snapshot.decisions = snapshot.decisions.replace(
    /^(### D\.2 )[^\n]+$/m,
    "$1标题可重写而不改变稳定状态",
  );
  snapshot.decisions += "\n普通正文可以引用任意文件、符号或评审人，而不成为治理断言。\n";
  assert.deepEqual(collectGovernanceFailures(snapshot), []);
});
