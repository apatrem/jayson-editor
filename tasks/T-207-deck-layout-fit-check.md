# T-207: Slide layout catalogue + deck fit-check engine (Pass 2.5)

<!-- Provenance: archived T-196 (docs/archive/TASKS.md). -->

## Objective
Create `slide-layouts.catalogue.yaml` (the closed deck-layout spec: layout id, `use-when`, per-slot accepted block kinds + capacity) and the deterministic fit-check engine that is the authority over the LLM's layout proposal in Pass 2.5: retry next higher-capacity layout → auto-split to continuation slide + readiness overflow flag → halt Structure if still failing (D-236; no silent compression).

## Acceptance criteria  (must be machine-checkable)
- [ ] `slide-layouts.catalogue.yaml` parses (`ruby scripts/check-specs`) and carries id / `use-when` / per-slot block kinds + capacity for every layout
- [ ] Fit-check is deterministic authority over an LLM proposal: accepts a fitting proposal, retries capacity, auto-splits with overflow flag, halts when nothing fits → `tests/generation/layout-fit-check.test.ts`
- [ ] Editor `LAYOUT_SLOTS` validate against the catalogue (single source — no duplicated capacity tables) → validation test
- [ ] gate green: `ruby scripts/check-specs && npm run lint && npm test && npm run build`

## Files likely involved
- `slide-layouts.catalogue.yaml` (new, repo root — parallel in role to `blocks.catalogue.yaml`)
- `src/generation/layout-fit-check.ts` (new), `tests/generation/layout-fit-check.test.ts` (new)
- Slide layout components / editor slot maps (validation only)
- Reads: `docs/GENERATION_PIPELINE.md` §5, CONTEXT.md "Slide layout catalogue" / "Deck layout assignment"; design prior art noted on the v1.1 roadmap "Deck path" entry (Slidev named slots + cascade)

## Out of scope
- New slide layouts beyond the validated set (D-30 sizes the v1.1 set)
- Pass 1 writer capacity budgets (derived from the same catalogue rows — wiring happens in the generation-skill work)

## Risks / do-not-touch
- The catalogue is the single source for capacity — Pass 1 budgets and the fit-check must read the same rows (no soft limits elsewhere)
- Overflow handling must surface as a readiness flag (consumes T-205's flag shapes), never silent compression

## Meta
- mode: low
- risk: low
- depends-on: [T-205]
- parallel-safe: yes     # new files once T-205 is merged
- size budget: < 300 changed lines
