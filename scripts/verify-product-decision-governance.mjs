import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const REQUIRED_DECISION_STATUSES = Object.freeze({
  "D.2": "PAUSED",
  "D.14": "RETIRED",
  "D.28": "ENABLED",
  "D.29": "ENABLED",
  "D.30": "ENABLED",
  "D.31": "ENABLED",
  "D.32": "TARGET",
  "D.33": "ENABLED",
  "D.34": "OPTIONAL_HIGH_ASSURANCE",
  "D.35": "RETIRED",
});

export const REQUIRED_DECISION_CONTRACTS = Object.freeze({
  "D.32": Object.freeze({
    scope: ["mainland-china", "zh-web", "commerce-candidate"],
    activation: [
      "approved-candidate",
      "target-environment",
      "merchant-and-channel-identity",
      "end-to-end-funds",
      "production-approval",
    ],
    supersedes: [],
    validation: ["test:trade", "commerce-e2e", "target-environment"],
  }),
  "D.33": Object.freeze({
    scope: ["single-operator", "content-review", "super-admin"],
    activation: ["same-submit-review-actor", "explicit-self-review", "complete-audit-trail"],
    supersedes: ["content-review:mandatory-separate-person"],
    validation: ["page-review-service", "admin-review-ui", "publish-readback"],
  }),
  "D.34": Object.freeze({
    scope: ["production-candidate", "release-assurance"],
    activation: ["baseline-all-candidates", "high-when-selected-or-required"],
    supersedes: ["D.24:universal-high-assurance"],
    validation: ["test:release-supply-chain", "release-workflow", "target-environment-runbook"],
  }),
  "D.35": Object.freeze({
    scope: ["public-website", "english-locale", "en-routes"],
    activation: ["none"],
    supersedes: [
      "D.20:bilingual-public-site",
      "D.28:english-seo-artifact-exception",
      "D.30:english-frozen-route-artifact",
      "D.32:future-english-commerce",
    ],
    validation: ["test:decision-governance", "public-route-tests", "contracts:check"],
  }),
});

export const REQUIRED_RETIRED_CAPABILITIES = Object.freeze({
  "page-recipe-guidance": "D.14",
  "public-english-site": "D.35",
});

function error(code, detail = "") {
  return `${code}${detail ? `:${detail}` : ""}`;
}

export function parseDecisionStatusMarkers(decisions) {
  const markers = [];
  const pattern = /<!--\s*decision-status:(D\.\d+)=([A-Z][A-Z0-9_]*)(?:\s+retired-capability:([a-z0-9][a-z0-9-]*))?\s*-->/g;
  for (const match of decisions.matchAll(pattern)) {
    markers.push({
      id: match[1],
      status: match[2],
      retiredCapability: match[3] ?? null,
    });
  }
  return markers;
}

export function parseDecisionContractMarkers(decisions) {
  const markers = [];
  const pattern = /<!--\s*decision-contract:(D\.\d+)\s+(\{[^\n]*\})\s*-->/g;
  for (const match of decisions.matchAll(pattern)) {
    try {
      markers.push({ id: match[1], contract: JSON.parse(match[2]), invalid: false });
    } catch {
      markers.push({ id: match[1], contract: null, invalid: true });
    }
  }
  return markers;
}

export function parseDecisionSections(decisions) {
  const headings = [...decisions.matchAll(/^###\s+(D\.\d+)(?:\s|$)[^\n]*$/gm)];
  return headings.map((heading, index) => ({
    id: heading[1],
    content: decisions.slice(heading.index, headings[index + 1]?.index ?? decisions.length),
  }));
}

function sameContractValue(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

export function collectGovernanceFailures({ decisions }) {
  const failures = [];
  const markers = parseDecisionStatusMarkers(decisions);
  const sections = parseDecisionSections(decisions);
  const markersById = new Map();

  for (const marker of markers) {
    const entries = markersById.get(marker.id) ?? [];
    entries.push(marker);
    markersById.set(marker.id, entries);
    if (marker.retiredCapability && marker.status !== "RETIRED") {
      failures.push(error("DECISION_GOVERNANCE_RETIRED_CAPABILITY_STATUS_INVALID", `${marker.id}:${marker.retiredCapability}`));
    }
  }

  for (const [id, expectedStatus] of Object.entries(REQUIRED_DECISION_STATUSES)) {
    const allEntries = markersById.get(id) ?? [];
    if (allEntries.length > 1) {
      failures.push(error("DECISION_GOVERNANCE_STATUS_DUPLICATE", id));
      continue;
    }
    const ownedSections = sections.filter((section) => section.id === id);
    if (ownedSections.length === 0) {
      failures.push(error("DECISION_GOVERNANCE_DECISION_MISSING", id));
      continue;
    }
    if (ownedSections.length > 1) {
      failures.push(error("DECISION_GOVERNANCE_DECISION_DUPLICATE", id));
      continue;
    }
    const entries = parseDecisionStatusMarkers(ownedSections[0].content)
      .filter((marker) => marker.id === id);
    if (entries.length === 0) {
      failures.push(error("DECISION_GOVERNANCE_STATUS_MISSING", id));
      continue;
    }
    if (entries[0].status !== expectedStatus) {
      failures.push(error("DECISION_GOVERNANCE_STATUS_MISMATCH", `${id}:${entries[0].status}:${expectedStatus}`));
    }
  }

  for (const [id, expectedContract] of Object.entries(REQUIRED_DECISION_CONTRACTS)) {
    const allContractMarkers = parseDecisionContractMarkers(decisions)
      .filter((marker) => marker.id === id);
    if (allContractMarkers.length > 1) {
      failures.push(error("DECISION_GOVERNANCE_CONTRACT_DUPLICATE", id));
      continue;
    }
    const ownedSections = sections.filter((section) => section.id === id);
    if (ownedSections.length !== 1) continue;
    const contractMarkers = parseDecisionContractMarkers(ownedSections[0].content)
      .filter((marker) => marker.id === id);
    if (contractMarkers.length === 0) {
      failures.push(error("DECISION_GOVERNANCE_CONTRACT_MISSING", id));
      continue;
    }
    if (contractMarkers.length > 1) {
      failures.push(error("DECISION_GOVERNANCE_CONTRACT_DUPLICATE", id));
      continue;
    }
    const marker = contractMarkers[0];
    if (marker.invalid) {
      failures.push(error("DECISION_GOVERNANCE_CONTRACT_INVALID", id));
      continue;
    }
    for (const [field, expectedValue] of Object.entries(expectedContract)) {
      if (!Object.hasOwn(marker.contract, field)) {
        failures.push(error("DECISION_GOVERNANCE_CONTRACT_FIELD_MISSING", `${id}:${field}`));
      } else if (!sameContractValue(marker.contract[field], expectedValue)) {
        failures.push(error("DECISION_GOVERNANCE_CONTRACT_FIELD_MISMATCH", `${id}:${field}`));
      }
    }
    const unexpectedFields = Object.keys(marker.contract)
      .filter((field) => !Object.hasOwn(expectedContract, field));
    if (unexpectedFields.length > 0) {
      failures.push(error("DECISION_GOVERNANCE_CONTRACT_FIELD_UNEXPECTED", `${id}:${unexpectedFields.join(",")}`));
    }
  }

  for (const [capability, expectedDecisionId] of Object.entries(REQUIRED_RETIRED_CAPABILITIES)) {
    const owners = markers.filter((marker) => marker.retiredCapability === capability);
    if (owners.length === 0) {
      failures.push(error("DECISION_GOVERNANCE_RETIRED_CAPABILITY_MISSING", capability));
      continue;
    }
    if (owners.length > 1) {
      failures.push(error("DECISION_GOVERNANCE_RETIRED_CAPABILITY_DUPLICATE", capability));
      continue;
    }
    if (owners[0].id !== expectedDecisionId) {
      failures.push(error("DECISION_GOVERNANCE_RETIRED_CAPABILITY_OWNER_MISMATCH", `${capability}:${owners[0].id}:${expectedDecisionId}`));
    }
  }

  return failures;
}

export async function loadDecisionGovernanceSnapshot() {
  return {
    decisions: await readFile(path.join(root, "docs", "DECISIONS.md"), "utf8"),
  };
}

export async function verifyDecisionGovernance() {
  const failures = collectGovernanceFailures(await loadDecisionGovernanceSnapshot());
  assert.deepEqual(failures, [], failures.join("\n"));
  return {
    protectedDecisionCount: Object.keys(REQUIRED_DECISION_STATUSES).length,
    structuredDecisionCount: Object.keys(REQUIRED_DECISION_CONTRACTS).length,
    retiredCapabilityCount: Object.keys(REQUIRED_RETIRED_CAPABILITIES).length,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await verifyDecisionGovernance();
  console.log(`产品决策治理验证通过：${result.protectedDecisionCount} 个稳定状态，${result.structuredDecisionCount} 个结构化决定，${result.retiredCapabilityCount} 个唯一退役标识。`);
}
