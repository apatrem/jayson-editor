# T-201: JSON persistence core — deterministic serializer + document IPC

<!-- /agentic-workflow:plan output (2026-06-09). Coarse re-plan: consolidates T-183 + T-184 from docs/TASKS.md. -->

## Objective
Make deterministic JSON the on-disk projection of the DocModel end-to-end at the
persistence layer (ADR-0022): serializer + parse entry point, document IPC
commands, converted `examples/` fixtures, and the `JSON_FORMAT.md` contract.
Everything downstream (editor wiring T-202, generation T-203/T-204) builds on
this layer.

## Acceptance criteria  (must be machine-checkable)
- [x] `examples/sample-proposal.json` and `examples/sample-deck.json` exist and round-trip byte-stably on second save → `tests/docmodel/json-roundtrip.test.ts`
- [x] `src/docmodel/serialize.ts` exports `parseDocModelJson`; `serializeDocModel` emits canonical JSON → same file
- [x] Every field in the JSON fixtures is registered in its shape's `KEY_ORDERS` — no insertion-order fallback (closed shapes only; authored-block attrs exempt per ADR-0016) → same file
- [x] `docs/JSON_FORMAT.md` documents canonical key order + formatter config (the byte-stability contract; successor to `YAML_FORMAT.md`) → same file
- [x] `read_document_file` / `write_document_file` (domain-named per `docs/BUILD_BRIEF.md` — never syntax-named) exist in `src-tauri/src/ipc/fs.rs`, keep the atomic write-then-rename + canonical-path validation contracts, and are documented in `docs/TAURI_IPC.md` → `tests/ipc/fs-json.smoke.test.ts`
- [x] gate green: `ruby scripts/check-specs && npm run lint && npm test && npm run build`
- [x] This task's frozen tests (`tests/docmodel/json-roundtrip.test.ts` + `tests/ipc/fs-json.smoke.test.ts`) removed from `tests/frozen-acceptance.json` — they now run inside `quality`

## Files likely involved
- `src/docmodel/serialize.ts`, `src/docmodel/yaml-config.ts` (JSON equivalent or retirement)
- `src-tauri/src/ipc/fs.rs`, `docs/TAURI_IPC.md`
- `docs/JSON_FORMAT.md` (new), `examples/*.json` (one-time conversion, ADR-0022)

## Out of scope
- Editor/library/template/menu wiring and the spec sweep (T-202)
- Non-document YAML — `config.yaml`, `brand*.yaml`, `blocks.catalogue.yaml` stay YAML (ADR-0022)
- Generation pipeline modules (T-203/T-204)

## Risks / do-not-touch
- `canonicalize()` / `KEY_ORDERS` semantics — the format-neutral byte-stability engine stays as-is (ADR-0022)
- Atomic write-then-rename + canonical-path validation in `fs.rs`
- The frozen tests listed in Meta — never edited to make a gate pass

## Meta
- risk: low
- mode: low
- depends-on: []              # T-182 [x]; absorbs T-183, T-184
- parallel-safe: yes          # docmodel + IPC layer only; no editor/UI surface
- frozen-tests: `tests/docmodel/json-roundtrip.test.ts`, `tests/ipc/fs-json.smoke.test.ts`
- size budget: < 300 changed lines (converted fixtures excluded; stack if larger)
