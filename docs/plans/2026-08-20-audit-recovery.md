# Audit Recovery Implementation Plan

> **For agentic workers:** Execute this plan inline in small, independently verified tasks. Git write operations are forbidden for this recovery batch.

**Goal:** Resolve the audit's in-flight direction conflicts and make page-builder publishing safe, intelligible and brand-consistent.

**Architecture:** Keep the existing Puck `PageDocument` system as the only content path. Make product publication, public-page product references and media-ratio choices enforce one explicit contract on the server, client editor and static verification scripts.

**Tech Stack:** React/Vite, NestJS, Prisma, Puck, TypeScript, class-validator, existing Node assertion scripts.

**Spec:** `docs/specs/2026-08-20-audit-recovery-design.md`

## Global Constraints

- Do not perform Git writes, dependency changes, `.env` reads/writes, database changes, Docker changes or deployment.
- Preserve unrelated in-flight diffs; do not reformat or rewrite whole files.
- Keep Puck preview, editor and public Renderer on the same machine contract.
- Validate each task with the affected static checks plus `npm run typecheck` before claiming completion.

---

### Task 1: Finalize safe product creation defaults (D-1)

**Files:**
- Modify: `server/src/modules/products/products.service.ts` default mapping only.
- Modify: `client/src/pages/admin/ProductEditor/index.tsx` create initial values and create-submit fallback only.
- Modify: `scripts/verify-batch1-safety.mjs` with exact default assertions.

**Interfaces:**
- Consumes: `CreateProductDto.status`, `CreateProductDto.visibility`, existing `canPublish` transaction gate.
- Produces: omitted create fields resolve to `DRAFT` and `MEMBER`; explicit `PUBLISHED` still passes the existing 422 gate.

- [ ] Write a failing assertion that omitted values map to `DRAFT` and `MEMBER` in the service and editor.
- [ ] Run `node scripts/verify-batch1-safety.mjs`; confirm the assertion fails against the prior defaults.
- [ ] Change only the default literals and preserve explicit caller-provided values.
- [ ] Run `node scripts/verify-batch1-safety.mjs`, `npm run typecheck`, and `npm run test:trade`.

### Task 2: Restore public-page product visibility contract (D-2)

**Files:**
- Modify: `server/src/modules/page-modules/page-modules.service.ts` product-reference publish query.
- Modify: `scripts/verify-page-builder-contract.mjs` expected public-page rule.

**Interfaces:**
- Consumes: Puck product IDs and `Product.status` / `Product.visibility`.
- Produces: publication rejects any referenced product that is deleted, not published, or not `PUBLIC`, with the existing page validation error channel.

- [ ] Add a failing static assertion that the publish query requires `visibility: "PUBLIC"`.
- [ ] Run the isolated page-builder contract script and confirm failure before implementation.
- [ ] Add `visibility: "PUBLIC"` to the existing server-side product query; do not alter public/catalog runtime fetching.
- [ ] Update only the assertion that was previously weakened, so the test verifies the decided behavior.
- [ ] Run `npm run test:contracts`, `npm run test:page-builder-publish`, and `npm run typecheck`.

### Task 3: Restore approved video ratio contract (D-3)

**Files:**
- Modify: `contracts/page-builder/content-templates.contract.json` video `coverImage` desktop allow-list.
- Modify: generated contract artifacts through the repository generator only.
- Modify: `scripts/verify-content-template-contract.mjs` assertion to `16 / 9`, `21 / 6`.

**Interfaces:**
- Consumes: contract `roles[].allowedRatioPresetsByViewport` and the existing shared ratio tokens.
- Produces: desktop video offers only `16 / 9` and `21 / 6`; `LEGACY_RATIOS` remains responsible for old saved data.

- [ ] Add or restore a failing assertion for the two approved desktop ratios.
- [ ] Update only the video desktop allow-list; leave mobile `4 / 5`, `16 / 9`, `9 / 16` unchanged.
- [ ] Run the existing contract generator rather than hand-editing generated files.
- [ ] Run `npm run contracts:check`, `npm run test:content-templates`, and `npm run typecheck`.

## Subsequent Plans

After Task 3, write a fresh detailed plan for the next independent workstream: structured page-builder errors and video contract closure, 23-template browser audit, backend safety/operations, customer journey/data hygiene, accessibility/performance, then launch readiness. Do not merge those scopes into the active directional-recovery batch.
