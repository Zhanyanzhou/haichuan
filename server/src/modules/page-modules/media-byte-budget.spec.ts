import assert from "node:assert/strict";
import test from "node:test";
import {
  collectMediaByteBudgetIssues,
  MEDIA_SOURCE_BYTE_BUDGET,
} from "./media-byte-budget";
import type { ContentTemplateIssue } from "./content-template-contract";
import type { ResolvedPublicationMediaItem } from "./media-publication-manifest";

const { perAssetWarningBytes, perAssetErrorBytes, perPageWarningBytes } =
  MEDIA_SOURCE_BYTE_BUDGET;

// 服务端在 issue 上额外携带 assetId/assetUrl（与 managedMediaIssues 一致），
// 类型未声明，测试侧显式收窄读取。
type BudgetIssue = ContentTemplateIssue & { assetId?: number; assetUrl?: string };

function item(overrides: Partial<ResolvedPublicationMediaItem>): ResolvedPublicationMediaItem {
  return {
    url: "/uploads/page-assets/hero.png",
    context: { path: "content[0].props.desktopImage" },
    assetId: 7,
    eligibility: { eligible: true, reasons: [] },
    ...overrides,
  };
}

test("源文件字节都在预算内时无告警", () => {
  const issues = collectMediaByteBudgetIssues([
    item({ sourceBytes: perAssetWarningBytes - 1, assetId: 1 }),
    item({ sourceBytes: 2 * 1024 * 1024, assetId: 2 }),
  ]);
  assert.deepEqual(issues, []);
});

test("无 sourceBytes（未授权或文件不可达）的素材不参与字节预算", () => {
  const issues = collectMediaByteBudgetIssues([
    item({ sourceBytes: undefined, assetId: 1 }),
  ]);
  assert.deepEqual(issues, []);
});

test("undefined 输入不产出告警", () => {
  assert.deepEqual(collectMediaByteBudgetIssues(undefined), []);
});

test("单张超过建议上限（未达硬上限）产出非阻断 warning", () => {
  const issues = collectMediaByteBudgetIssues([
    item({ sourceBytes: perAssetWarningBytes + 1, assetId: 7 }),
  ]);
  assert.equal(issues.length, 1);
  assert.equal(issues[0]!.severity, "warning");
  assert.equal(issues[0]!.code, "page-validation-media-source-oversize");
  assert.equal(issues[0]!.path, "content[0].props.desktopImage");
  assert.equal((issues[0]! as BudgetIssue).assetId, 7);
  assert.equal((issues[0]! as BudgetIssue).assetUrl, "/uploads/page-assets/hero.png");
});

test("单张超过硬上限产出阻断 error", () => {
  const issues = collectMediaByteBudgetIssues([
    item({ sourceBytes: perAssetErrorBytes + 1, assetId: 9 }),
  ]);
  assert.equal(issues.length, 1);
  assert.equal(issues[0]!.severity, "error");
  assert.equal(issues[0]!.code, "page-validation-media-source-oversize-blocking");
});

test("页面源文件总量超过预算产出页面级 warning（只计有 sourceBytes 的素材）", () => {
  const issues = collectMediaByteBudgetIssues([
    item({ sourceBytes: Math.ceil(perPageWarningBytes * 0.6), assetId: 1 }),
    item({ sourceBytes: Math.ceil(perPageWarningBytes * 0.5), assetId: 2 }),
    item({ sourceBytes: undefined, assetId: 3 }),
  ]);
  const pageIssue = issues.find((issue) => issue.code === "page-validation-media-page-source-budget");
  assert.ok(pageIssue);
  assert.equal(pageIssue!.severity, "warning");
  assert.equal(pageIssue!.path, "puckData");
});

test("素材缺省路径时回退到 puckData", () => {
  const issues = collectMediaByteBudgetIssues([
    item({ sourceBytes: perAssetWarningBytes + 1, context: {} }),
  ]);
  assert.equal(issues[0]!.path, "puckData");
});
