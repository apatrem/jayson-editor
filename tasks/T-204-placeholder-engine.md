# T-204: Placeholder engine — parse, toPlaceholder per block type, import lint

<!-- Provenance: archived T-191 + T-194 (docs/archive/TASKS.md). Partial implementation already landed:
     src/generation/placeholder.ts, src/generation/import-lint.ts, tests/generation/placeholder.test.ts. -->

## Objective
Complete the placeholder contract from `docs/PLACEHOLDER_GRAMMAR.md`: deterministic down-conversion (`toPlaceholder`) for all 15 catalogue blocks, a parser that rejects malformed placeholders, and the pre-structuring import lint that catches broken placeholders / orphaned ids / structural damage in externally-refined markdown with clear messages (Moment 1). Partial implementations exist — finish them against the full grammar rather than rewriting.

## Acceptance criteria  (must be machine-checkable)
- [ ] Deterministic `toPlaceholder` for all 15 catalogue blocks (no LLM in down-conversion) → `tests/generation/placeholder.test.ts`
- [ ] Round-trip invariant `toPlaceholder(structure(p)) ≈ p` passes for callout + chart at minimum → same suite
- [ ] Parser rejects malformed placeholders with actionable messages → parse cases in the suite
- [ ] Import lint detects broken placeholders, orphaned ids, and structural damage before the full structuring pass → `tests/generation/import-lint.test.ts` with valid/invalid external-refinement fixtures
- [ ] gate green: `ruby scripts/check-specs && npm run lint && npm test && npm run build`

## Files likely involved
- `src/generation/placeholder.ts`, `src/generation/parse-placeholder.ts` (may be new), `src/generation/import-lint.ts`
- `tests/generation/placeholder.test.ts`, `tests/generation/import-lint.test.ts` (new)
- Reads: `docs/PLACEHOLDER_GRAMMAR.md`, `docs/GENERATION_PIPELINE.md` §2 + §8, block schemas under `src/blocks/*/schema.ts`

## Out of scope
- The markdown → ProseMirror prose converter (T-206)
- Generation schema fields / readiness flags (T-205)

## Risks / do-not-touch
- Down-conversion derives from current block fields only — never reads `sourceIntent` (write-once provenance; see CONTEXT.md "Source intent")
- The grammar in `docs/PLACEHOLDER_GRAMMAR.md` is the contract; if it needs changing, that's a doc PR first, not a silent divergence

## Meta
- mode: low
- risk: low
- depends-on: []
- parallel-safe: yes     # src/generation + its tests only; disjoint from T-201/T-202/T-203
- size budget: < 300 changed lines
