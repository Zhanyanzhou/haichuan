import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMediaAuthorizationBackfillPlan,
  parseMediaAuthorizationBackfillArgs,
} from "./media-authorization-backfill";

const candidates = [{
  ownerType: "PAGE_DOCUMENT_REVISION" as const,
  ownerId: 9,
  referencePath: "content[0].props.image",
  url: "/uploads/page-assets/hero.jpg",
  assetId: 12,
  referenceClassification: "EXACT_ASSET" as const,
  eligible: false,
  reasonCodes: ["AUTHORIZATION_MISSING"],
  authorizationState: "MISSING",
}, {
  ownerType: "DYNAMIC_TEMPLATE_VERSION" as const,
  ownerId: 4,
  referencePath: "nodes.hero.responsive.backgroundImage",
  url: "/uploads/page-assets/background.jpg",
  referenceClassification: "STATIC_BUNDLE" as const,
  eligible: true,
}];

test("回填计划是默认 dry-run、分类汇总且对输入顺序幂等", () => {
  const first = buildMediaAuthorizationBackfillPlan(candidates);
  const second = buildMediaAuthorizationBackfillPlan([...candidates].reverse());
  assert.equal(first.mode, "dry-run");
  assert.equal(first.planHash, second.planHash);
  assert.deepEqual(first.entries, second.entries);
  assert.equal(first.planVersion, 2);
  assert.equal(first.counts.EXACT_ASSET, 1);
  assert.equal(first.counts.STATIC_BUNDLE, 1);
  assert.equal(first.entries[1]?.referenceClassification, "EXACT_ASSET");
  assert.equal(first.entries[1]?.eligibilityStatus, "INELIGIBLE");
  assert.deepEqual(first.entries[1]?.eligibilityReasonCodes, ["AUTHORIZATION_MISSING"]);
  assert.deepEqual(first.eligibilityCounts, {
    ELIGIBLE: 1,
    INELIGIBLE: 1,
    UNKNOWN: 0,
  });
  assert.match(first.planHash, /^[a-f0-9]{64}$/);
});

test("引用来源七类与资格状态正交汇总，旧版分类仅作输入兼容", () => {
  const explicit = [
    ["EXACT_ASSET", 21],
    ["LEGACY_FILE", undefined],
    ["STATIC_BUNDLE", undefined],
    ["EXTERNAL", undefined],
    ["MISSING", undefined],
    ["AMBIGUOUS", undefined],
    ["UNSAFE", undefined],
  ] as const;
  const plan = buildMediaAuthorizationBackfillPlan(explicit.map(
    ([referenceClassification, assetId], index) => ({
      ownerType: "PAGE_DOCUMENT_REVISION" as const,
      ownerId: index + 1,
      referencePath: `content[${index}].props.image`,
      url: `reference-${index}`,
      referenceClassification,
      assetId,
      eligible: referenceClassification === "EXACT_ASSET",
      reasonCodes: referenceClassification === "EXTERNAL" ? ["EXTERNAL_UNMANAGED"] : [],
    }),
  ));
  assert.deepEqual(plan.counts, {
    EXACT_ASSET: 1,
    LEGACY_FILE: 1,
    STATIC_BUNDLE: 1,
    EXTERNAL: 1,
    MISSING: 1,
    AMBIGUOUS: 1,
    UNSAFE: 1,
  });
  assert.equal(
    plan.entries.find((entry) => entry.referenceClassification === "EXTERNAL")
      ?.eligibilityStatus,
    "INELIGIBLE",
  );

  const legacy = buildMediaAuthorizationBackfillPlan([{
    ownerType: "DYNAMIC_TEMPLATE_VERSION",
    ownerId: 99,
    referencePath: "nodes.hero.image",
    url: "/uploads/page-assets/legacy.jpg",
    assetId: 8,
    classification: "AUTHORIZATION_GAP",
    eligible: false,
    reasonCodes: ["AUTHORIZATION_MISSING"],
  }]);
  assert.equal(legacy.entries[0]?.referenceClassification, "EXACT_ASSET");
  assert.equal(legacy.entries[0]?.eligibilityStatus, "INELIGIBLE");
});

test("第一阶段 CLI 明确拒绝 apply 且只接受外部只读快照", () => {
  assert.throws(
    () => parseMediaAuthorizationBackfillArgs(["--apply", "--input", "snapshot.json"]),
    /禁止 --apply/,
  );
  assert.throws(() => parseMediaAuthorizationBackfillArgs([]), /--input/);
  assert.deepEqual(
    parseMediaAuthorizationBackfillArgs(["--input", "snapshot.json"]),
    { inputPath: "snapshot.json" },
  );
});
