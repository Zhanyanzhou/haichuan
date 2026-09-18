import type { PublishValidationIssue } from "./publishValidation";

const MEDIA_AUTH_CODE_PATTERN = /^page-validation-managed-media-(authorization-missing|authorization-not-approved|public-web-use-not-allowed)$/;

export function isManagedMediaAuthorizationIssue(issue: PublishValidationIssue) {
  return issue.severity === "error" && MEDIA_AUTH_CODE_PATTERN.test(issue.code ?? "");
}

export function getManagedMediaAssetId(issue: PublishValidationIssue) {
  if (typeof issue.assetId === "number" && Number.isInteger(issue.assetId) && issue.assetId > 0) {
    return issue.assetId;
  }
  return null;
}

export function collapseManagedMediaAuthorizationIssues(
  issues: readonly PublishValidationIssue[],
): PublishValidationIssue[] {
  const collapsed: PublishValidationIssue[] = [];
  const seenAssets = new Set<string>();
  for (const issue of issues) {
    if (!isManagedMediaAuthorizationIssue(issue)) {
      collapsed.push(issue);
      continue;
    }
    const key = String(issue.assetId ?? issue.assetUrl ?? issue.message);
    if (seenAssets.has(key)) continue;
    seenAssets.add(key);
    collapsed.push({
      ...issue,
      message: "素材尚未批准公开使用",
    });
  }
  return collapsed;
}

export function collectManagedMediaAssetIds(issues: readonly PublishValidationIssue[]) {
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const issue of collapseManagedMediaAuthorizationIssues(issues)) {
    const assetId = getManagedMediaAssetId(issue);
    if (assetId == null || seen.has(assetId)) continue;
    seen.add(assetId);
    ids.push(assetId);
  }
  return ids;
}
