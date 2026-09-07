# Code Review Subagent Orchestration

## Contents

1. [Purpose](#purpose)
2. [Assessment Subagent](#assessment-subagent)
3. [Decision Heuristics](#decision-heuristics)
4. [Specialist Assignment](#specialist-assignment)
5. [Specialist Output Contract](#specialist-output-contract)
6. [Coordinator Synthesis](#coordinator-synthesis)
7. [Fallbacks and Failure Handling](#fallbacks-and-failure-handling)

## Purpose

Use subagents to increase independent coverage and reduce blind spots, not to manufacture consensus or duplicate the same pass. The coordinator remains accountable for the final report.

The coordinator performs the initial scope assessment. Use an independent orchestration assessor only when that assessment itself benefits materially from delegation and current instructions authorize it. A specialist review does not require a preceding assessor subagent.

## Assessment Subagent

When an assessor is justified, launch it after collecting minimal scope metadata and keep it read-only. Otherwise the coordinator makes the orchestration decision using the relevant criteria below; do not manufacture an assessor result.

Give it:

- requested scope type and user intent
- review chain ID, generation, trigger, scope mode, and parent resolution for generation `1`
- baseline and target identifiers
- changed paths, additions/deletions, and diff statistics
- touched languages, frameworks, subsystems, and generated files
- available requirements, issue text, PR description, or design notes
- authoritative expected-behavior sources and inherited `Intentional`, `Disproved`, `Stale`, or `Duplicate` decisions
- obvious critical surfaces such as auth, money, privacy, migrations, concurrency, external effects, or deployment
- runtime, credential, platform, and tool limitations
- any explicit review priorities from the user

Use this assignment:

```text
Act as the review orchestration assessor. Do not produce final findings and do not edit files.
Evaluate the semantic scope, risk diversity, subsystem independence, evidence needs, and likely context-sharing cost.
Decide whether the deepest practical review should use one reviewer or parallel specialist reviewers.
Prefer parallelism only when independent angles or separable surfaces materially improve coverage.
Return the required structured assessment and identify any assumptions.
```

Require this output:

```yaml
orchestration_decision: single-reviewer | parallel-specialists
confidence: high | medium | low
scope_summary: <one paragraph>
scope_mode: full-frozen-scope | implementation-delta-and-affected-chains
risk_dimensions:
  - <risk dimension and why it matters>
parallelism_benefit: <specific benefit or why it is low>
context_sharing_cost: <low | medium | high with reason>
review_assignments:
  - reviewer_id: R1
    angle: <bounded angle>
    owned_surfaces:
      - <paths, components, or behavior paths>
    mandatory_cross_checks:
      - <cross-cutting checks>
    expected_evidence:
      - <code trace, test, runtime check, contract, etc.>
overlap_plan: <where intentional overlap is required and why>
verification_plan:
  - <focused non-destructive check>
assumptions:
  - <assumption>
```

For `single-reviewer`, still return one `R1` assignment that defines the deep-review plan.

## Decision Heuristics

Choose `parallel-specialists` when one or more of these conditions creates genuinely independent review work:

- two or more materially different risk dimensions, such as auth plus migration or concurrency plus external API compatibility
- multiple subsystems with limited shared context and distinct failure modes
- a high-criticality surface that benefits from an independent adversarial pass
- a broad cross-layer change spanning API, persistence, UI/CLI, deployment, or generated artifacts
- unfamiliar or specialized domain semantics that warrant a dedicated reviewer
- a large diff whose semantic areas can be partitioned without losing integration reasoning
- a need for different evidence methods, such as static contract analysis plus targeted runtime verification

Prefer `single-reviewer` when:

- the change is local, cohesive, and dominated by one invariant
- specialist partitions would repeatedly reread the same small context
- the diff is mostly mechanical, generated, or low-risk and can be verified with one coherent trace
- parallel edits or tools are unavailable and multiple agents would not add independent evidence

Do not use changed-line count as the sole decision. A one-line authorization change can justify independent security review; a large generated-file change may not.

Choose the smallest set of specialist reviewers that covers the independently reviewable risks within current tool limits. The coordinator must confirm disjoint ownership and its ability to synthesize the evidence; an assessor recommendation is optional input, not authorization or a required gate.

## Specialist Assignment

Give each specialist a bounded angle and owned surfaces. Allow intentional overlap only for high-risk invariants or integration boundaries.

Useful roles include:

### Correctness and Contracts

Trace changed behavior, state transitions, invariants, callers/callees, API contracts, error semantics, compatibility, and alternate entry points.

### Security and Privacy

Inspect authentication, authorization, trust boundaries, validation, data exposure, secrets, filesystem/network effects, injection classes, and privilege changes.

### Reliability and Tests

Inspect retries, idempotency, ordering, races, timeouts, cleanup, failure paths, test adequacy, flaky assumptions, and regression coverage.

### Data, Migration, and Integration

Inspect schema changes, serialization, persistence, migrations, rollback, external APIs, queues, caches, deployment/configuration, and operational compatibility.

### Domain or Framework Specialist

Inspect framework lifecycle, language semantics, protocol rules, numerical/domain invariants, build tooling, or other specialized behavior.

Do not assign generic prompts such as “review everything.” State what the specialist owns and what it may inspect as supporting context.

## Specialist Output Contract

Use this assignment pattern:

```text
You are reviewer <R#> for <angle>.
Remain read-only. Review only the assigned scope as primary ownership, while following dependencies needed to prove or disprove risk.
Do not assign final severities or final F/T/A identifiers.
Return every meaningful candidate, every covered area with no issue found, important dismissed candidates, exact evidence, and unresolved uncertainty.
Do not treat lint or unrelated passing tests as proof of safety.
```

Require:

```yaml
reviewer_id: R1
coverage:
  - area: <surface>
    result: issue-candidate | no-issue-found | not-covered | not-review-relevant
    evidence: <pointer or reason>
candidates:
  - candidate_id: R1-C1
    title: <short title>
    risk: <user, security, data, contract, availability, or test risk>
    expected: <required behavior>
    expected_basis: "kind:<kind>; strength:<authoritative|inferred|unavailable>; evidence:<source>"
    current: <observed behavior>
    evidence:
      - <path/line, trace, test, output, or command result>
    confidence: high | medium | low
    assumptions:
      - <assumption>
    semantic_key_basis: <normalized surface | expected basis | failure mode, without line numbers>
    suggested_class: blocker | major | minor | question | test-gap
dismissed_candidates:
  - candidate: <suspected issue>
    reason: <why dismissed>
    evidence: <pointer>
blind_spots:
  - <unverified area and what would resolve it>
```

## Coordinator Synthesis

The coordinator must:

1. Compare specialist coverage against the semantic diff inventory.
2. Re-open the relevant code for every candidate that could affect approval.
3. Reject claims that rely on stale paths, misunderstood intent, duplicate failure modes, or unsupported assumptions.
4. Convert a disputed product choice without authoritative expected-behavior evidence into an approval-affecting `Question`; do not preserve a defect severity by substituting current code, tests, or history for product authority.
5. For generation `1`, compare each semantic key with the parent resolution. Keep settled `Intentional`, `Disproved`, `Stale`, and `Duplicate` claims closed unless relevant code, the governing contract, or material evidence changed.
6. Merge candidates that describe the same failure mode.
7. Split candidates whose impacts cross different contracts, users, security boundaries, or persisted data.
8. Resolve conflicts with stronger evidence, not majority vote.
9. Add coordinator-discovered findings when specialist partitions missed a cross-cutting issue.
10. Assign final severity, stable IDs, and semantic issue fingerprints only after adjudication.
11. Persist all accepted, merged, dismissed, and unresolved meaningful candidates in `Subagent Candidate Adjudication`.
12. Record intentional overlap and whether it confirmed or contradicted another pass.

A specialist conclusion is input evidence, not an authority. The final report must never say an issue exists only because “a subagent found it.”

## Fallbacks and Failure Handling

- If subagents are unavailable or add insufficient value, the coordinator performs the review and records any material coverage limitation. In an authorized formal report, include the relevant orchestration evidence without claiming an assessor ran.
- If one specialist fails or returns incomplete output, retry once with a narrower assignment when practical. Otherwise mark its surfaces `Not covered`.
- If specialists conflict on a high-severity claim, run an independent focused verifier when available. If uncertainty remains approval-affecting, classify it as `Question` or lower confidence rather than forcing certainty.
- If a specialist edits files or Git state, stop the affected work, inspect and disclose the mutation, and preserve user state. Recovery is a separate action governed by `AGENTS.md` and current authorization; this review procedure grants no permission to restore files or mutate Git. Request only missing authorization before any recovery action, and continue unaffected read-only review where possible.
- If new evidence changes the orchestration decision, update the plan and persist the reason; do not silently add agents.
