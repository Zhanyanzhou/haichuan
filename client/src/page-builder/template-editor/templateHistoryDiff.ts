import type { TemplateDefinitionV2 } from "../template-definition";

export interface TemplateHistoryDiffSummary {
  nodesAdded: number;
  nodesRemoved: number;
  nodesChanged: number;
  slotsAdded: number;
  slotsRemoved: number;
  slotsChanged: number;
  responsiveRulesChanged: number;
  styleRulesChanged: number;
  rootChanged: boolean;
  metadataChanged: boolean;
}

function same(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function countRecordDiff<T>(
  left: Record<string, T>,
  right: Record<string, T>,
) {
  const leftKeys = new Set(Object.keys(left));
  const rightKeys = new Set(Object.keys(right));
  return {
    added: [...rightKeys].filter((key) => !leftKeys.has(key)).length,
    removed: [...leftKeys].filter((key) => !rightKeys.has(key)).length,
    changed: [...leftKeys].filter((key) => rightKeys.has(key) && !same(left[key], right[key])).length,
  };
}

export function summarizeTemplateHistoryDiff(
  baseline: TemplateDefinitionV2,
  candidate: TemplateDefinitionV2,
): TemplateHistoryDiffSummary {
  const nodes = countRecordDiff(baseline.nodes, candidate.nodes);
  const slots = countRecordDiff(baseline.slots, candidate.slots);
  const sharedNodeIds = Object.keys(baseline.nodes).filter((nodeId) => candidate.nodes[nodeId]);
  const sharedSlotIds = Object.keys(baseline.slots).filter((slotId) => candidate.slots[slotId]);
  return {
    nodesAdded: nodes.added,
    nodesRemoved: nodes.removed,
    nodesChanged: nodes.changed,
    slotsAdded: slots.added,
    slotsRemoved: slots.removed,
    slotsChanged: slots.changed,
    responsiveRulesChanged: sharedNodeIds.filter((nodeId) => (
      !same(baseline.nodes[nodeId].responsive, candidate.nodes[nodeId].responsive)
    )).length,
    styleRulesChanged:
      sharedNodeIds.filter((nodeId) => !same(
        {
          props: baseline.nodes[nodeId].props,
          hidden: baseline.nodes[nodeId].hidden,
        },
        {
          props: candidate.nodes[nodeId].props,
          hidden: candidate.nodes[nodeId].hidden,
        },
      )).length
      + sharedSlotIds.filter((slotId) => !same(
        {
          desktopRules: baseline.slots[slotId].desktopRules,
          mobileRules: baseline.slots[slotId].mobileRules,
        },
        {
          desktopRules: candidate.slots[slotId].desktopRules,
          mobileRules: candidate.slots[slotId].mobileRules,
        },
      )).length,
    rootChanged: baseline.rootNodeId !== candidate.rootNodeId,
    metadataChanged: !same(baseline.metadata, candidate.metadata),
  };
}
