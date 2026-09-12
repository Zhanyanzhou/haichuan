---
name: code-review
description: 对工作区、暂存区、提交范围、分支、PR、指定文件或粘贴代码执行只读代码审查。用于用户明确要求 code review、PR/合并安全检查或实现后的有界复核。小范围审查默认在对话中交付，不自动创建子代理或持久报告；跨层、高风险或用户要求正式审计时才启用完整覆盖账本、可选独立审查与报告验证。审查不得修改代码或 Git 状态，除非用户另行要求修复。
---

# Code Review

## Mission

Produce the deepest review that is practical for the requested scope. Findings and coverage evidence are the primary output. Praise, style preferences, and broad refactor suggestions are secondary.

The coordinating agent owns scope, final judgment, de-duplication, severity, and delivery. Subagents are optional bounded evidence sources for authorized formal audits; never copy their conclusions without independent synthesis.

## Review Modes and Resources

- **Focused review (default)**: use for a cohesive file set or bounded change. Review in the current task, return findings and verification in the project delivery format, and do not write a report merely because this Skill triggered.
- **Formal audit**: use when the user requests a persisted audit/report, a release or merge gate requires an artifact, or the authorized scope is broad/high-risk enough that a coverage ledger materially improves safety.
- Before delegating in a formal audit, read [references/subagent-orchestration.md](references/subagent-orchestration.md). Delegate only when user/instruction authorization exists and independent partitions add value.
- When a canonical persisted report is authorized, use [references/report-template.md](references/report-template.md) and validate it with `scripts/validate_review_report.py`. Incremental re-review requires complete parent artifacts and current authorization; an existing request to implement and verify the same result already covers ordinary fix/review iterations.

## Hard Gates

- Begin with a read-only scope assessment. For a focused review, the coordinator performs it directly. For an authorized formal audit, use an orchestration assessor only when independent review adds material value.
- Inspect scope, baseline, changed-file inventory, diff size, requirements and obvious constraints before forming final findings. Do not equate depth with agent count.
- If no subagent is authorized or available, continue in the coordinator and disclose the limitation only when it affects coverage. Never claim a subagent ran when it did not.
- Keep every review subagent read-only. Do not edit files, stage, commit, push, reset, checkout, rebase, or mutate Git state.
- Keep the review phase read-only. Return verified findings to the coordinating implementation phase when fixes are already authorized; review-only requests do not authorize repairs.
- In formal report mode, use generation `0` for the frozen initial scope and increment by one for each implementation-delta review. Every later generation links the immediately preceding review and its resolution record; the generation number is not a stopping condition.
- This repository does not assume a `receiving-code-review` Skill exists. Its report type is a compatibility label for a resolution record, not a required tool. Continue authorized implementation, validation and re-review in the same task until the requested acceptance is met or a real blocker requires input; pause only the affected action.
- Do not classify a disputed product choice as `Blocker`, `Major`, or `Minor` without an authoritative expected-behavior basis. Use `Question` when product intent is unconfirmed.

## Scope and Identity

1. Resolve the requested scope: working tree, staged diff, commit range, branch diff, pull request, file set, or pasted code.
2. Choose the narrowest reasonable scope when none is explicit. Prefer staged changes when present; otherwise compare the working tree with `HEAD`.
3. Record the baseline and target precisely. Use commit SHAs when available.
4. In formal report mode, create a review chain ID and record generation, trigger, parent resolution ID/path, and scope mode. Every generation after `0` must read the complete parent resolution before reviewing; carry forward relevant settled dispositions so they are not lost between iterations.
5. In formal report mode, compute a scope fingerprint when practical from the baseline, target, changed paths, and normalized diff hash. Record why a fingerprint is unavailable.
6. Read requirements, issue text, PR description, design notes, migrations, relevant contracts, and settled parent-resolution decisions before judging intent.
7. Freeze the requested scope. In every incremental generation, review the implementation delta and only the callers, callees, contracts, and execution chains it can affect; do not reopen the full original discovery frontier.
8. Do not silently widen scope. Mark unrelated context as supporting evidence or a follow-up rather than a finding in the current chain.

## Formal Audit Orchestration

Skip this section for focused review. When formal orchestration is authorized:

1. The coordinator assesses scope identity, diff inventory, change statistics, touched subsystems, known requirements, and environment limitations. Delegate this assessment only when independent assessment itself adds material value; an assessor is not a prerequisite for specialist review.
2. Record the coordinator's decision: `Single reviewer` or `Parallel specialists`, with rationale, risk dimensions, proposed partitions, overlap plan, and verification needs. If an assessor was justified, use its recommendation as input evidence.
3. The coordinator owns and may revise that decision when new evidence warrants it. Record material changes and reasons without treating a subagent recommendation as authority.
4. For parallel review, assign bounded, non-identical ownership. Typical angles include:
   - correctness, state, data flow, and API contracts
   - security, privacy, auth, permissions, and trust boundaries
   - tests, regressions, error paths, concurrency, and reliability
   - migrations, persistence, compatibility, integrations, performance, and operations
   - framework- or domain-specific semantics
5. Require each specialist to return candidate findings, covered areas, dismissed candidates, uncertainty, and evidence pointers.
6. Re-read the relevant code and evidence for every candidate that could enter the final report. Resolve conflicts explicitly and assign final `F#`, `T#`, and `A#` IDs only in the coordinator.

## Deep Review Contract

Review beyond changed lines whenever risk can propagate. Trace far enough to evaluate:

- callers, callees, shared utilities, adapters, and alternate entry points
- input validation, authorization, trust boundaries, secrets, privacy, and unsafe external effects
- state transitions, persistence, migrations, serialization, compatibility, rollback, and data loss
- retries, idempotency, ordering, caching, concurrency, races, timeouts, partial failure, and cleanup
- public API, CLI, UI, generated output, configuration, dependency, and deployment contracts
- positive, negative, boundary, regression, integration, and migration test coverage
- runtime behavior through focused, non-destructive commands when it materially changes confidence
- requirements and intentional behavior changes so intended changes are not misreported as defects

Establish an expected-behavior basis before accepting a finding:

1. Prefer explicit current user or product-owner decisions and acceptance criteria.
2. Then use public contracts, approved design or migration decisions, and security, privacy, compliance, or data-integrity invariants.
3. Treat tests, current code, and history as behavioral evidence, not product authority by themselves.
4. When the disagreement is a product choice and no authoritative basis is available, emit an approval-affecting `Question` with a settlement criterion instead of a defect.
5. In every incremental generation, inherit `Intentional`, `Disproved`, `Stale`, and `Duplicate` decisions from the parent resolution. Reopen the same semantic issue only when relevant code, the governing contract, or material evidence changed. Record `kind:<code|contract|evidence>; ref:<concrete source>; change:<concrete delta>`; placeholder references or changes such as `None`, `unknown`, or template text do not authorize reopening.

Use search, history, blame, runtime checks, or targeted tests only when they strengthen evidence. Passing lint, typecheck, or unrelated tests is hygiene evidence, not proof of behavioral safety.

Stop only when every changed review-relevant or unknown-impact area is accounted for, meaningful candidates have been adjudicated, and remaining blind spots are explicit.

## Completeness Contract

- Enumerate every distinct finding reasonably discoverable within the reviewed scope, not only the top risks.
- In formal report mode, maintain a `Review Coverage Ledger` with stable `A#` area IDs. In focused mode, account for each reviewed area in the response without manufacturing report IDs. Map every changed review-relevant or unknown-impact area to:
  - `Finding F#`
  - `Reviewed - no issue found`
  - `Not review-relevant`
  - `Not covered`
- In formal report mode, give standalone test gaps stable `T#` IDs and give every `F#`/`T#` a canonical semantic key and fingerprint. In focused mode, use concise finding labels only when they improve readability.
- In formal orchestration, record meaningful dismissed or merged candidates in `Subagent Candidate Adjudication` or the evidence appendix.
- Mark the delivery `Incomplete` and identify exact uncovered surfaces when context, credentials, runtime, diff size, or other limits prevent complete coverage.
- Never present a partial review as complete.

## Findings and Evidence

Count one finding per distinct failure mode, affected contract, security boundary, data risk, or approval decision. Merge repeated manifestations of the same defect; split materially different impacts.

Prioritize:

- crashes, incorrect results, stale or lost data, availability failures, and broken edge cases
- user-visible, API, CLI, persistence, auth, permission, retry, ordering, caching, and integration regressions
- injection, unsafe deserialization, auth bypass, secret exposure, SSRF, XSS, CSRF, overbroad access, and unsafe filesystem or dependency use
- missing tests for risky changed behavior, especially fixes, permissions, migrations, concurrency, and failures
- maintainability only when it creates a concrete review risk

For every accepted finding:

- tie the claim to a location, behavior path, output, missing test, or coverage gap
- separate verified facts from inference
- state assumptions and reduce confidence when proof is incomplete
- include exactly one or two primary code links in `Look here first`
- state the expected-behavior basis and how the claim was verified
- in formal report mode, additionally record reviewer origin, canonical issue key and verified semantic issue fingerprint

Do not invent defects. A clean focused review reports reviewed scope, verification and material blind spots concisely. A clean formal report additionally includes the full coverage ledger required by that mode; no finding does not waive evidence requirements.

## Severity and Recommendation

Use `Blocker`, `Major`, `Minor`, and `Question` as defined in the report template.

Map unresolved findings and standalone test gaps to the recommendation in this order:

1. Any `Blocker` -> `Block`.
2. Otherwise any `Major` -> `Changes requested`.
3. Otherwise any approval-affecting `Question` -> `Discuss`.
4. Otherwise any review-relevant or unknown-impact `Not covered` area -> `Discuss`.
5. Otherwise any `Minor` -> `Pass with caveat`.
6. Otherwise -> `Pass`.

Downgrade an unproven suspected blocker rather than retaining a hand-wavy `Blocker`. Do not use `Question` for curiosity that cannot affect approval.

## Persistence and Handoff

- Focused review is read-only and conversation-first; do not create `tmp/reviews` or any report file automatically.
- Write a fresh Markdown report only when the user explicitly requests a persisted report or the approved workflow requires an audit artifact.
- Follow the repository's existing audit convention, currently `docs/audits/`, unless the user specifies another project-local path. Never overwrite an existing report.
- For a canonical formal report, persist scope identity, coverage, evidence, findings, test gaps, open questions and an evidence-backed handoff. Record whether the same task continues under existing authorization, the requested review scope is complete, acceptance is met, or a real blocker needs input. A completed review does not establish implementation or release completion.
- Run the validator and fix every error before claiming a canonical report is complete. If the validator cannot run, report the exact reason and do not call the report validated.
- Check existing authorization before any implementation phase; do not ask again for ordinary in-scope repair and verification already requested. Git writes, production, real data and external actions retain their independent authorization boundaries. Report fields never grant those permissions. Keep making progress on unblocked work; each iteration must add evidence or resolve a defect rather than repeat an unchanged review.

## Workflow

1. Resolve mode, scope, baseline, target, requirements and minimal diff inventory.
2. Choose coordinator-only review or, for an authorized formal audit, proportionate independent partitions.
3. Trace changed control, data, security, persistence, integration and test paths far enough to evaluate risk.
4. Run focused non-destructive verification where it materially improves confidence.
5. Independently verify, de-duplicate, challenge and classify every candidate against expected behavior.
6. Derive the recommendation from unresolved findings, questions and uncovered areas.
7. Focused mode: return findings, evidence, verification and blind spots in the conversation.
8. Formal mode: assign canonical IDs, write the authorized report, run the validator, then return its path and summary.

## Final Self-Check

- The selected mode is proportionate; no subagent or report was created merely because the Skill triggered.
- Any orchestration decision is supported by scope and risk, not arbitrary agent count.
- In formal orchestration, every specialist candidate was verified, rejected, merged or retained with evidence.
- Every changed review-relevant or unknown-impact area is accounted for; formal reports use `A#` rows and focused reviews use a concise coverage statement.
- Every finding has an authoritative expected-behavior basis or is an explicit approval question; formal `F#`/`T#` items additionally have unique semantic issue fingerprints.
- In formal mode, generation and handoff are consistent; incremental generations link the immediately preceding report and resolution, and the handoff reflects evidence and existing authorization rather than a fixed iteration limit.
- In formal mode, every indexed finding has one matching card and every `Finding F#` area references a real finding.
- Every uncovered area has a reason and concrete next step.
- Recommendation mapping is exact.
- A canonical persisted report was validated, or no persisted report was requested; unavailable validation is disclosed.
- Git state is unchanged.
