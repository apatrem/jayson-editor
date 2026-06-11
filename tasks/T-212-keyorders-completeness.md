# T-212: Complete KEY_ORDERS coverage + recursive byte-stability test

<!-- Provenance: T-201 (PR #9) codex review, blocker #1. Pre-existing gap surfaced via the JSON persistence core. -->

## Objective
`canonicalizeValue()` appends keys not registered in `KEY_ORDERS` in source insertion order (`src/docmodel/canonicalize.ts`), so valid **closed** DocModel shapes that the fixtures don't exercise serialize with unstable key order — breaking the byte-stability contract (ADR-0022) for real documents. Register every closed field/shape and strengthen the round-trip test to recurse into them, so byte-stability holds for any valid DocModel, not just the two fixtures.

## Acceptance criteria  (must be machine-checkable)
- [ ] **`breakBefore`/`spaceBefore` go on every CONCRETE block order** (`prose`/`callout`/`chart`/`table`/… all ~15) — NOT on `BlockBase`. The canonicalizer never dispatches a real block to the `BlockBase` shape (`inferShapeForArrayItem` returns the concrete type or throws; `type` is always present), so a `BlockBase` entry would be a **no-op** (PR #9 Opus review). T-201 already added `legendPosition` to the `chart` order but still omitted `breakBefore`/`spaceBefore` there — same hole.
- [ ] **`BlockPatch` rewritten per-variant, not patched.** The current entry `BlockPatch: ["blockId","path","value"]` is **wrong** — `path`/`value` aren't in the schema (`src/schema/block-patch.ts` is a `discriminatedUnion("op", …)`). Register `BlockPatch_replace`/`_remove`/`_insertAfter` (each with `op` + its real fields `blockId`/`afterBlockId`/`block`/`reason`) and add op-variant dispatch in `childShapeFor`/`inferShapeForArrayItem` (today `ThreadEntry_aiProposal.patch → "BlockPatch"` has no variant dispatch).
- [ ] Remaining closed shapes registered (no insertion-order fallback): `Meta.layout` + nested numbering fields, bullet/numbered item `children`, `ProseMirrorMark.attrs` (incl. `commentMark.commentId`), and nested chart/table/kpi shapes (`ChartData`/`ChartAxes`/`ChartSeries`, `KpiCard`, `Table*`).
- [ ] All supported ProseMirror node types canonicalize deterministically — none fall through to `_unknown` for a valid persisted doc.
- [ ] The completeness test **recurses via the serializer's own `childShapeFor`/`inferShapeForArrayItem` dispatch** (not a hand-rolled top-level walk — the current test only checks DocModel/Meta/top-level Section/Slide/block keys, which is exactly why these holes passed CI), and a **fixture carries a `comment` with an ai-proposal `BlockPatch` + a prose run with a non-default mark** so that subtree is actually exercised → `tests/docmodel/json-roundtrip.test.ts` (or new `key-orders-completeness.test.ts`)
- [ ] gate green: `ruby scripts/check-specs && npm run lint && npm test && npm run build`

## Files likely involved
- `src/docmodel/canonicalize.ts` (KEY_ORDERS entries + node/mark dispatch), `src/schema/meta.ts`, `src/schema/blocks/block-base.ts`, `src/schema/block-patch.ts`, bullet/numbered-list schemas
- `tests/docmodel/json-roundtrip.test.ts` or new completeness test

## Out of scope
- Changing `canonicalize()` *semantics* — only ADD registrations and dispatch; the byte-stability engine stays as-is (ADR-0022)
- The atomic-write symlink hardening (T-213)

## Risks / do-not-touch
- Adding a key to `KEY_ORDERS` changes serialized order for shapes that previously used insertion order — confirm no already-saved fixture's bytes shift unexpectedly (or note the one-time reorder)
- This is the T-192 lesson generalized: the test must fail on unregistered *fields*, not just unregistered block *types*

## Meta
- mode: medium           # byte-stability contract — a silent ordering bug corrupts every real doc's diff history; dual review warranted
- risk: low
- depends-on: [T-201]     # builds on the JSON persistence core (json-config + the fixture-scoped KEY_ORDERS)
- blocked-by: none
- parallel-safe: no       # edits canonicalize.ts KEY_ORDERS — collides with T-207 (which also adds KEY_ORDERS entries)
- frozen-tests: none
- size budget: < 300 changed lines
