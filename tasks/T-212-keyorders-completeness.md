# T-212: Complete KEY_ORDERS coverage + recursive byte-stability test

<!-- Provenance: T-201 (PR #9) codex review, blocker #1. Pre-existing gap surfaced via the JSON persistence core. -->

## Objective
`canonicalizeValue()` appends keys not registered in `KEY_ORDERS` in source insertion order (`src/docmodel/canonicalize.ts`), so valid **closed** DocModel shapes that the fixtures don't exercise serialize with unstable key order — breaking the byte-stability contract (ADR-0022) for real documents. Register every closed field/shape and strengthen the round-trip test to recurse into them, so byte-stability holds for any valid DocModel, not just the two fixtures.

## Acceptance criteria  (must be machine-checkable)
- [ ] Every closed field/shape is registered (no insertion-order fallback) for at least: `Meta.layout` + nested numbering fields (`src/schema/meta.ts`), `BlockBase.breakBefore` / `spaceBefore` inherited by every Standard block (`src/schema/blocks/block-base.ts`), bullet/numbered item `children`, the current `BlockPatch` union (`op`/`block`/`reason`/`afterBlockId` — not the stale `blockId`/`path`/`value`), and `ProseMirrorMark.attrs` (incl. `commentMark.commentId`) → covered by tests
- [ ] All supported ProseMirror node types canonicalize deterministically — none fall through to `_unknown` for a valid persisted doc
- [ ] A **recursive** round-trip regression test fails if ANY field of a valid closed shape is absent from its `KEY_ORDERS` (today the test only checks direct fixture keys) → `tests/docmodel/json-roundtrip.test.ts` (or a new `key-orders-completeness.test.ts`)
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
