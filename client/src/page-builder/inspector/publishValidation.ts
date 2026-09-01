export type PublishValidationStatus =
  | "idle"
  | "validating"
  | "valid"
  | "invalid"
  | "unverified"
  | "unavailable";

export interface PublishValidationIssue {
  blockId?: string;
  field?: string;
  index?: number;
  code?: string;
  message: string;
  severity: "error" | "warning" | "info";
  path?: string;
}

export function isPagePublishIssue(issue: PublishValidationIssue): boolean {
  return !issue.blockId || issue.path?.startsWith("metadata.") === true;
}

export function getInspectorPublishIssues(
  issues: readonly PublishValidationIssue[],
  blockId: unknown,
): PublishValidationIssue[] {
  const normalizedBlockId = blockId == null ? "" : String(blockId);
  return issues.filter(
    (issue) =>
      issue.severity !== "info"
      && (isPagePublishIssue(issue) || issue.blockId === normalizedBlockId),
  );
}
