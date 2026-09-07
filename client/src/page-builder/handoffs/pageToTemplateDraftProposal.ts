export const PAGE_TO_TEMPLATE_DRAFT_PROPOSAL_PROTOCOL =
  "page-to-template-draft-proposal" as const;
export const PAGE_TO_TEMPLATE_DRAFT_PROPOSAL_VERSION = 1 as const;

const TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const EDITABLE_FIELD_PATTERN = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/;

export interface PageToTemplateDraftProposal {
  protocol: typeof PAGE_TO_TEMPLATE_DRAFT_PROPOSAL_PROTOCOL;
  version: typeof PAGE_TO_TEMPLATE_DRAFT_PROPOSAL_VERSION;
  handoffId: string;
  suggestedName: string;
  structure: {
    templateId: string;
    templateVersion: number;
    rootNodeId: string;
    nodeIds: readonly string[];
  };
  slots: {
    slotIds: readonly string[];
  };
  layout: {
    nodeIds: readonly string[];
  };
  responsive: {
    nodeIds: readonly string[];
    viewports: readonly ("desktop" | "mobile")[];
  };
  editableRange: {
    slotIds: readonly string[];
    fields: readonly string[];
  };
}

export type PageToTemplateDraftProposalInput = Omit<
  PageToTemplateDraftProposal,
  "protocol" | "version"
>;

export type PageToTemplateDraftProposalConsumeResult =
  | { status: "accepted"; proposal: PageToTemplateDraftProposal }
  | { status: "already-consumed"; handoffId: string }
  | { status: "invalid" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
) {
  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  return actualKeys.length === sortedExpectedKeys.length
    && actualKeys.every((key, index) => key === sortedExpectedKeys[index]);
}

function readUniqueTokens(value: unknown, pattern = TOKEN_PATTERN) {
  if (!Array.isArray(value) || value.length === 0) return null;
  if (!value.every((item) => typeof item === "string" && pattern.test(item))) {
    return null;
  }
  const unique = [...new Set(value)];
  return unique.length === value.length ? unique : null;
}

function isSubset(values: readonly string[], allowedValues: readonly string[]) {
  const allowed = new Set(allowedValues);
  return values.every((value) => allowed.has(value));
}

export function parsePageToTemplateDraftProposal(
  value: unknown,
): PageToTemplateDraftProposal | null {
  if (!isRecord(value) || !hasExactKeys(value, [
    "protocol",
    "version",
    "handoffId",
    "suggestedName",
    "structure",
    "slots",
    "layout",
    "responsive",
    "editableRange",
  ])) return null;

  if (
    value.protocol !== PAGE_TO_TEMPLATE_DRAFT_PROPOSAL_PROTOCOL
    || value.version !== PAGE_TO_TEMPLATE_DRAFT_PROPOSAL_VERSION
    || typeof value.handoffId !== "string"
    || !TOKEN_PATTERN.test(value.handoffId)
    || typeof value.suggestedName !== "string"
    || value.suggestedName.trim().length === 0
    || value.suggestedName.trim().length > 80
  ) return null;

  const { structure, slots, layout, responsive, editableRange } = value;
  if (
    !isRecord(structure)
    || !hasExactKeys(structure, [
      "templateId",
      "templateVersion",
      "rootNodeId",
      "nodeIds",
    ])
    || typeof structure.templateId !== "string"
    || !TOKEN_PATTERN.test(structure.templateId)
    || typeof structure.templateVersion !== "number"
    || !Number.isSafeInteger(structure.templateVersion)
    || structure.templateVersion < 1
    || typeof structure.rootNodeId !== "string"
    || !TOKEN_PATTERN.test(structure.rootNodeId)
  ) return null;

  const structureNodeIds = readUniqueTokens(structure.nodeIds);
  if (!structureNodeIds || !structureNodeIds.includes(structure.rootNodeId)) {
    return null;
  }

  if (!isRecord(slots) || !hasExactKeys(slots, ["slotIds"])) return null;
  const slotIds = readUniqueTokens(slots.slotIds);
  if (!slotIds) return null;

  if (!isRecord(layout) || !hasExactKeys(layout, ["nodeIds"])) return null;
  const layoutNodeIds = readUniqueTokens(layout.nodeIds);
  if (!layoutNodeIds || !isSubset(layoutNodeIds, structureNodeIds)) return null;

  if (
    !isRecord(responsive)
    || !hasExactKeys(responsive, ["nodeIds", "viewports"])
  ) return null;
  const responsiveNodeIds = readUniqueTokens(responsive.nodeIds);
  if (!responsiveNodeIds || !isSubset(responsiveNodeIds, structureNodeIds)) {
    return null;
  }
  if (
    !Array.isArray(responsive.viewports)
    || responsive.viewports.length === 0
    || !responsive.viewports.every((viewport) => (
      viewport === "desktop" || viewport === "mobile"
    ))
    || new Set(responsive.viewports).size !== responsive.viewports.length
  ) return null;

  if (
    !isRecord(editableRange)
    || !hasExactKeys(editableRange, ["slotIds", "fields"])
  ) return null;
  const editableSlotIds = readUniqueTokens(editableRange.slotIds);
  const editableFields = readUniqueTokens(
    editableRange.fields,
    EDITABLE_FIELD_PATTERN,
  );
  if (
    !editableSlotIds
    || !editableFields
    || !isSubset(editableSlotIds, slotIds)
  ) return null;

  return Object.freeze({
    protocol: PAGE_TO_TEMPLATE_DRAFT_PROPOSAL_PROTOCOL,
    version: PAGE_TO_TEMPLATE_DRAFT_PROPOSAL_VERSION,
    handoffId: value.handoffId,
    suggestedName: value.suggestedName.trim(),
    structure: Object.freeze({
      templateId: structure.templateId,
      templateVersion: structure.templateVersion,
      rootNodeId: structure.rootNodeId,
      nodeIds: Object.freeze(structureNodeIds),
    }),
    slots: Object.freeze({ slotIds: Object.freeze(slotIds) }),
    layout: Object.freeze({ nodeIds: Object.freeze(layoutNodeIds) }),
    responsive: Object.freeze({
      nodeIds: Object.freeze(responsiveNodeIds),
      viewports: Object.freeze([...responsive.viewports]) as readonly (
        "desktop" | "mobile"
      )[],
    }),
    editableRange: Object.freeze({
      slotIds: Object.freeze(editableSlotIds),
      fields: Object.freeze(editableFields),
    }),
  });
}

export function createPageToTemplateDraftProposal(
  input: PageToTemplateDraftProposalInput,
) {
  const proposal = parsePageToTemplateDraftProposal({
    protocol: PAGE_TO_TEMPLATE_DRAFT_PROPOSAL_PROTOCOL,
    version: PAGE_TO_TEMPLATE_DRAFT_PROPOSAL_VERSION,
    ...input,
  });
  if (!proposal) {
    throw new TypeError("页面生成的母模板草稿方案不符合安全交接合同。");
  }
  return proposal;
}

export function consumePageToTemplateDraftProposal(
  value: unknown,
  consumedHandoffIds: Set<string>,
): PageToTemplateDraftProposalConsumeResult {
  const proposal = parsePageToTemplateDraftProposal(value);
  if (!proposal) return { status: "invalid" };
  if (consumedHandoffIds.has(proposal.handoffId)) {
    return { status: "already-consumed", handoffId: proposal.handoffId };
  }
  consumedHandoffIds.add(proposal.handoffId);
  return { status: "accepted", proposal };
}
