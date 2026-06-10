# T-203: JSON adoption — editor open/save/autosave, library + templates, spec sweep

<!-- Provenance: archived T-185 + T-186 + T-187 (docs/archive/TASKS.md). -->

## Objective
With the JSON core landed (T-202), switch every consumer to it: editor open/save/autosave and file-menu dialogs use JSON IPC + `.json` filters; the library scan and create-from-template flow read/clone JSON; the spec docs stop claiming YAML is canonical anywhere outside historical context.

## Acceptance criteria  (must be machine-checkable)
- [ ] Open → edit → save works with `examples/sample-proposal.json`; autosave writes JSON → editor integration tests updated
- [ ] Library scan parses `*.json` only; create-from-template clones a JSON template → library integration tests updated
- [ ] `templates/*.json` exist; YAML doc templates removed or archived
- [ ] Doc sweep: no spec claims YAML is the canonical DocModel format except as historical/strikethrough context (D-05/D-19 text amended) → `ruby scripts/check-specs` green over the new fixtures
- [ ] gate green: `ruby scripts/check-specs && npm run lint && npm test && npm run build`

## Files likely involved
- `src/editor/file-open.ts`, `src/editor/file-save.ts`, `src/editor/autosave.ts`, `src/ui/menu/FileMenu.tsx`
- `src/library/index-builder.ts`, `src/ui/library/CreateFromTemplateModal.tsx`
- `templates/*.yaml` → `templates/*.json`, `examples/` JSON fixtures
- `docs/TYPES.md`, `AUTHORING.md`, `docs/DECISIONS.md` (D-05, D-19), `docs/BUILD_BRIEF.md`, `docs/UI_APP_SHELL.md`, `docs/UI_LIBRARY.md`

## Out of scope
- Serializer/IPC internals (T-202)
- Generation pipeline integration (T-204+)

## Risks / do-not-touch
- D-19 doc-folder naming contract (basename matches folder) must keep holding for `.json`
- Don't break the M8 create-from-template happy path — its integration test is the proof

## Meta
- mode: low
- risk: low
- depends-on: [T-202]
- parallel-safe: no      # broad file set (editor + library + docs); other tasks touch overlapping specs
- size budget: < 300 changed lines per PR; split editor-wiring from library/templates from doc sweep (natural stack of 3)
