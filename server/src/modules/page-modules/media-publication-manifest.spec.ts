import assert from "node:assert/strict";
import test from "node:test";
import {
  buildManagedMediaShadowReport,
  buildMediaPublicationManifestRows,
  createMediaPublicationReferenceKey,
  isCurrentResolutionCompatibleWithManifest,
  type MediaPublicationResolution,
} from "./media-publication-manifest";

const resolution: MediaPublicationResolution = {
  mode: "SHADOW",
  eligible: true,
  issues: [{
    url: "/uploads/page-assets/legacy.jpg",
    path: "content[1].props.image",
    code: "AUTHORIZATION_MISSING",
    severity: "WARNING",
    message: "素材缺少集中授权记录",
  }],
  items: [{
    url: "/uploads/page-assets/approved.jpg",
    context: { path: "content[0].props.image" },
    assetId: 7,
    lifecycleRevision: 3,
    authorizationRevision: 5,
    publicUseEpoch: 4,
    eligibility: { eligible: true, reasons: [] },
  }, {
    url: "/uploads/page-assets/legacy.jpg",
    context: { path: "content[1].props.image" },
    assetId: 8,
    lifecycleRevision: 1,
    authorizationRevision: null,
    publicUseEpoch: null,
    eligibility: { eligible: false, reasons: ["AUTHORIZATION_MISSING"] },
  }],
};

test("v3 shadow 只把当次完整合格引用写入不可变清单", () => {
  const rows = buildMediaPublicationManifestRows([{
    url: "/uploads/page-assets/approved.jpg",
    path: "content[0].props.image",
    origin: "PAGE_INSTANCE",
  }, {
    url: "/uploads/page-assets/legacy.jpg",
    path: "content[1].props.image",
    origin: "PAGE_INSTANCE",
  }], resolution);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    assetId: 7,
    referenceKey: createMediaPublicationReferenceKey("content[0].props.image"),
    referencePath: "content[0].props.image",
    origin: "PAGE_INSTANCE",
    assetLifecycleRevision: 3,
    authorizationRevision: 5,
    publicUseEpoch: 4,
  });
  assert.deepEqual(buildManagedMediaShadowReport(resolution), {
    enforcementPublicationGateVersion: 3,
    shadowPublicationGateVersion: 4,
    enforcementEligible: true,
    shadowEligible: false,
    referenceCount: 2,
    errorCount: 0,
    authorizationWarningCount: 1,
  });
});

test("已继承授权的清单遇生命周期、epoch 或当前资格变化均失败关闭", () => {
  const manifest = {
    assetId: 7,
    assetLifecycleRevision: 3,
    authorizationRevision: 5,
    publicUseEpoch: 4,
  };
  const current = resolution.items[0]!;
  assert.equal(isCurrentResolutionCompatibleWithManifest(manifest, current), true);
  assert.equal(isCurrentResolutionCompatibleWithManifest(
    manifest,
    { ...current, lifecycleRevision: 4 },
  ), false);
  assert.equal(isCurrentResolutionCompatibleWithManifest(
    manifest,
    { ...current, authorizationRevision: 6 },
  ), false);
  assert.equal(isCurrentResolutionCompatibleWithManifest(
    manifest,
    { ...current, publicUseEpoch: 5 },
  ), false);
  assert.equal(isCurrentResolutionCompatibleWithManifest(
    manifest,
    { ...current, eligibility: { eligible: false, reasons: ["AUTHORIZATION_EXPIRED"] } },
  ), false);
});

test("同一素材出现在多个母模板路径时清单逐路径写行并生成不同 referenceKey", () => {
  const sharedUrl = "/uploads/page-assets/shared-template.jpg";
  const paths = [
    "nodes.hero.responsive.desktop.backgroundImage",
    "defaultContent.slot_image",
  ];
  const rows = buildMediaPublicationManifestRows(
    paths.map((path) => ({
      url: sharedUrl,
      path,
      origin: path.startsWith("nodes.") ? "TEMPLATE_BACKGROUND" : "TEMPLATE_DEFAULT",
    })),
    {
      mode: "SHADOW",
      eligible: true,
      issues: [],
      items: paths.map((path) => ({
        url: sharedUrl,
        context: { path },
        assetId: 18,
        lifecycleRevision: 2,
        authorizationRevision: 6,
        publicUseEpoch: 5,
        eligibility: { eligible: true, reasons: [] },
      })),
    },
  );
  assert.equal(rows.length, 2);
  assert.equal(new Set(rows.map((row) => row.referenceKey)).size, 2);
  assert.deepEqual(rows.map((row) => row.referencePath), paths);
  assert.ok(rows.every((row) => row.assetId === 18));
});
