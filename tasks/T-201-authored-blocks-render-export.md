# T-201: Render/export path for installed Authored blocks (preview + PDF + deck)

<!-- Provenance: archived T-181 (docs/archive/TASKS.md), spec carried over verbatim where still accurate. -->

## Objective
The editor path inserts/saves/reloads installed Authored blocks, but the render/export path still builds its dispatch map from static `loadAllBlocks()` only — so every installed Authored block renders as `RemovedBlockPlaceholder` in the preview pane and in exported PDF/deck output (the explicit deferral in ADR-0016). Make the renderer authored-aware, and stop the `DocBlockSchema as ZodType<Block>` cast from hiding the authored runtime shape from the type system.

## Acceptance criteria  (must be machine-checkable)
- [ ] A doc containing an installed Authored block renders the expanded block (not the placeholder) in `DocumentRenderer` and `DeckRenderer` → covered by new tests in `tests/renderer/`
- [ ] An uninstalled / permanently-deleted authored type still renders `RemovedBlockPlaceholder` → same suite
- [ ] PDF export of an authored-block doc does not emit the placeholder → export-path test
- [ ] `Section.blocks` / `Slide.blocks` are typed `DocBlock[]`; the `ZodType<Block>` cast in `src/blocks/schema-registry.ts` is gone; every consumer narrows explicitly (`isAuthoredBlockType` → render-or-placeholder) — `tsc` green proves the propagation
- [ ] Stale comment at `src/renderer/DocumentRenderer.tsx:208–211` corrected
- [ ] gate green: `ruby scripts/check-specs && npm run lint && npm test && npm run build`

## Files likely involved
- `src/renderer/DocumentRenderer.tsx` (accept the Installed manifest set; default `useAuthoredManifestsFromRegistry()`)
- `src/renderer/DeckRenderer.tsx`
- PDF export path (installed set must reach the export renderer; preview and PDF must agree)
- `src/ui/views/DocumentView.tsx` (pass the installed set, ~line 372)
- `src/blocks/schema-registry.ts`, `src/schema/containers.ts` (+ ripple through `src/renderer/**`, export, `src/review/**`, patch code)
- `src/blocks/authored/template-expander.ts` (`buildAuthoredRenderer`)

## Out of scope
- New Authored-block capabilities (ADR-0007 restrictions stand)
- Editor-side wiring (already landed — ADR-0015/0016)

## Risks / do-not-touch
- ADR-0013 (authored blocks are declarative data) and the receive-time gate are untouchable contracts
- Resolve each compile error from the `DocBlock[]` widening with explicit narrowing — never a blanket cast back

## Meta
- mode: medium           # widens a shared type contract (Section.blocks) across renderer/export/review/patch consumers — dual review pays for itself
- risk: low
- depends-on: []
- parallel-safe: no      # changes the shared DocBlock/Section.blocks contract other pending tasks consume
- size budget: ~400 changed lines expected (type propagation); split mechanical narrowing into a stacked PR if larger
