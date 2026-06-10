# T-205: Generation schema fields + readiness gate completion

<!-- Provenance: archived T-192 + T-193 (docs/archive/TASKS.md). Partial implementation already landed:
     src/generation/readiness.ts, tests/generation/readiness.test.ts, docs/UI_READINESS_GATE.md. -->

## Objective
Land the generation-era schema fields (`dataState`, `source`, `sourceHint`, `verifiedBy`/`verifiedAt`, `sourceIntent`, degraded/overflow flag shapes) in `docs/TYPES.md` + `src/schema/`, with matching `KEY_ORDERS` entries for every block that gains fields, and finish the readiness-gate aggregation (`readiness.ts`) + export summary popup contract. Export is **never blocked** — advisory only.

## Acceptance criteria  (must be machine-checkable)
- [ ] New fields validate via Zod; `source` vs `sourceHint` separation enforced → schema tests
- [ ] Every new field appears in its block's `KEY_ORDERS`, and the byte-stable round-trip test **fails on any field absent from its shape's `KEY_ORDERS`** (strengthened test — today only missing block *types* are caught) → `tests/docmodel/json-roundtrip.test.ts`
- [ ] Readiness blockers aggregate for checklist/popup; `canExport()` always returns true → `tests/generation/readiness.test.ts`
- [ ] Popup contract (Review items / Export with flagged content) documented in `docs/UI_READINESS_GATE.md`
- [ ] gate green: `ruby scripts/check-specs && npm run lint && npm test && npm run build`

## Files likely involved
- `docs/TYPES.md`, `src/schema/**` (field shapes), `src/docmodel/canonicalize.ts` (`KEY_ORDERS`)
- `src/generation/readiness.ts`, `tests/generation/readiness.test.ts`
- `docs/UI_READINESS_GATE.md`
- Reads: `docs/GENERATION_PIPELINE.md` §6–§7

## Out of scope
- The on-block watermark rendering (separate UI work; the flag shapes land here)
- Deck fit-check overflow producers (T-207 — consumes the flag shapes defined here)

## Risks / do-not-touch
- Illustrative data watermark contract: blocks with `dataState: draft-illustrative` must be distinguishable in the model — renderers depend on it
- Readiness must never gate export (D-236-adjacent design; see CONTEXT.md "Readiness gate")

## Meta
- mode: low
- risk: low
- depends-on: [T-202]    # the strengthened round-trip test and KEY_ORDERS entries build on the JSON core
- parallel-safe: no      # touches src/docmodel/canonicalize.ts (shared with T-202) and TYPES.md (shared with T-203's sweep)
- size budget: < 300 changed lines
