# T-202: App runs on JSON — editor, library, templates, spec sweep

<!-- /agentic-workflow:plan output (2026-06-09). Coarse re-plan: consolidates T-185 + T-186 + T-187 from docs/TASKS.md. -->

## Objective
Every user-facing flow opens, saves, autosaves, and creates DocModel documents
as JSON; repo templates ship as JSON; and no live spec still claims YAML is the
canonical DocModel format. Completes the ADR-0022 clean break at the app
surface.

## Acceptance criteria  (must be machine-checkable)
- [ ] `src/editor/file-open.ts` parses via `parseDocModelJson`; no YAML parse or `.yaml` discovery left in the document open path → `tests/integration/app-on-json-wiring.test.ts`
- [ ] `file-save.ts` / `autosave.ts` write the JSON projection; `FileMenu.tsx` dialogs filter `.json` → same file
- [ ] **No document flow invokes YAML document IO** — file-open/save/autosave, `DocumentView.tsx`, `Routes.tsx`, `main.tsx`, `LibraryView.tsx`, `CreateFromTemplateModal.tsx`; `parseDocModelYaml` deleted repo-wide (hard cut). Non-document YAML (config/brand/catalogue, authored manifests) untouched → same file
- [ ] All four `templates/*.json` exist and validate as DocModels → same file
- [ ] `src/library/index-builder.ts` indexes `*.json` documents → same file
- [ ] M7/M8 integration harnesses load JSON fixtures (no `.yaml` fixture paths) → same file
- [ ] D-05 autosave wording reflects JSON; no live doc claims a canonical YAML format outside allowlisted historical context → `tests/docs/json-canonical-sweep.test.ts`
- [ ] gate green: `ruby scripts/check-specs && npm run lint && npm test && npm run build`

## Files likely involved
- `src/editor/{file-open,file-save,autosave}.ts`, `src/ui/menu/FileMenu.tsx`
- `src/ui/views/DocumentView.tsx`, `src/ui/router/Routes.tsx`, `src/main.tsx`, `src/ui/library/{LibraryView,CreateFromTemplateModal}.tsx`
- `src/library/index-builder.ts`, `templates/*.json`
- `tests/integration/{m7-spike-harness,m8-harness}.ts` (fixture paths)
- `docs/DECISIONS.md` (D-05), `AUTHORING.md`, `docs/BUILD_BRIEF.md`, `docs/UI_LIBRARY.md`

## Out of scope
- Serializer / IPC internals (T-201)
- A YAML import shim — ADR-0022 is a hard cut, no open-time converter
- Generation pipeline modules (T-203/T-204)

## Risks / do-not-touch
- DocModel↔editor losslessness invariant (`reference/mapping/`) — it is format-neutral and carries over unchanged
- Non-document YAML stays YAML (ADR-0022)
- The frozen tests listed in Meta — never edited to make a gate pass

## Meta
- risk: low
- mode: low
- depends-on: [T-201]         # absorbs T-185, T-186, T-187
- parallel-safe: no           # broad app surface (editor, menu, library); run alone
- frozen-tests: `tests/integration/app-on-json-wiring.test.ts`, `tests/docs/json-canonical-sweep.test.ts`
- size budget: < 300 changed lines (template conversions excluded; stack if larger)
