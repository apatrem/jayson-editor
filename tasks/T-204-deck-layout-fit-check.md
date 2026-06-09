# T-204: Deck layout fit-check engine + slide-layouts catalogue (Pass 2.5)

<!-- /agentic-workflow:plan output (2026-06-09). Coarse re-plan: carries T-196 from docs/TASKS.md. -->

## Objective
A deterministic layout authority for decks (GENERATION_PIPELINE §5):
`slide-layouts.catalogue.yaml` becomes the single source for Pass 1 budgets and
Pass 2.5 fit-check caps, and `layout-fit-check.ts` renders the verdict on LLM
layout proposals. On fit failure the documented overflow ladder applies — next
higher-capacity layout → auto-split + `layoutOverflow` flag → halt (D-236). No
silent truncation, no orphan block.

## Acceptance criteria  (must be machine-checkable)
- [ ] `slide-layouts.catalogue.yaml` exists at repo root (YAML — developer spec stays YAML per ADR-0022), covers every `SlideLayoutSchema` layout with numeric capacity metadata → `tests/generation/layout-fit-check.test.ts`
- [ ] Catalogue layout ids are consistent with the editor's `LAYOUT_SLOTS` (`src/editor/SlideLayoutEditor.tsx`) → same file
- [ ] `src/generation/layout-fit-check.ts` exports `fitCheckSlide(slide, catalogue)` returning `{ fits, flags }`; an over-capacity slide yields `fits: false` with a `layoutOverflow` flag → same file
- [ ] Deterministic: identical inputs ⇒ deep-equal verdicts on repeated calls → same file
- [ ] gate green: `npm run lint && npm test && npm run build`
- [ ] **HUMAN check (why risk is high):** capacity numbers eyeballed against real rendered slides — not machine-checkable; the reviewer signs this off in the PR

## Files likely involved
- `slide-layouts.catalogue.yaml` (new, repo root — sibling of `blocks.catalogue.yaml`)
- `src/generation/layout-fit-check.ts` (new)
- `src/editor/SlideLayoutEditor.tsx` (read; consider exporting `LAYOUT_SLOTS` for a typed consistency check)
- `docs/GENERATION_PIPELINE.md` §5 (contract source)

## Out of scope
- Pass 1 budget consumption (skill-side, ADR-0021) and structuring-pass integration
- Editor slide rendering changes

## Risks / do-not-touch
- `LAYOUT_SLOTS` slot semantics in the editor — fit-check adapts to the editor, not vice versa
- Overflow ladder vocabulary (`layoutOverflow`, D-236 halt) — frozen by GENERATION_PIPELINE §5
- The frozen test listed in Meta — never edited to make a gate pass

## Meta
- risk: high                  # capacity-metadata fidelity needs human eyes — never auto-merge eligible
- mode: competitive           # deterministic authority over every generated deck; best-of-N + smart-merge + dual review (workflow `hard` tier)
- depends-on: T-192, D-30
- parallel-safe: yes          # new files + read-only editor reference
- frozen-tests: `tests/generation/layout-fit-check.test.ts`
- size budget: < 300 changed lines
