# T-202: JSON canonical core — format spec, deterministic serializer, IPC

<!-- Provenance: archived T-183 + T-184 (docs/archive/TASKS.md), per ADR-0022 and docs/JSON_MIGRATION_INVENTORY.md. -->

## Objective
ADR-0022 makes JSON the sole on-disk DocModel format. Land the core: a `docs/JSON_FORMAT.md` spec (canonical key order, byte-stable round-trip rules), the serializer migration (`parseDocModelJson`, JSON config replacing `yaml-config`), and `read_json_file` / `write_json_file` IPC with atomic write-then-rename preserved.

## Acceptance criteria  (must be machine-checkable)
- [ ] Byte-stable JSON round-trip (load → save reproduces identical bytes) → `tests/docmodel/json-roundtrip.test.ts`
- [ ] Canonical key order documented in `docs/JSON_FORMAT.md` and enforced by `KEY_ORDERS` in `src/docmodel/canonicalize.ts`
- [ ] Read/write a valid DocModel JSON file through IPC; atomic write-then-rename behavior preserved → `tests/ipc/fs.smoke.test.ts` extended
- [ ] `docs/TAURI_IPC.md` updated with the JSON command signatures
- [ ] gate green: `ruby scripts/check-specs && npm run lint && npm test && npm run build`

## Files likely involved
- `docs/JSON_FORMAT.md` (new), `docs/YAML_FORMAT.md` (mark historical)
- `src/docmodel/serialize.ts`, `src/docmodel/canonicalize.ts`, `src/docmodel/json-config.ts` (new; replaces `yaml-config.ts`)
- `src-tauri/src/ipc/fs.rs`, `src-tauri/src/lib.rs` (command registration), `docs/TAURI_IPC.md`
- `tests/docmodel/json-roundtrip.test.ts`, `tests/ipc/fs.smoke.test.ts`

## Out of scope
- Wiring the editor/library/templates to JSON (T-203)
- YAML import shim (decide per JSON_MIGRATION_INVENTORY §9 — pre-release clean break is the default)

## Risks / do-not-touch
- Byte-stability is the contract everything else trusts (autosave diffs, cloud-sync history). The round-trip test must fail on any field absent from its shape's `KEY_ORDERS` — see the T-192 lesson in the archived backlog.
- Keep the atomic write path's failure-window tests (see AGENTS.md review playbook on cfg-gated atomic operations).

## Meta
- mode: medium           # canonical-format serializer — a silent ordering bug corrupts every doc's diff history
- risk: low
- depends-on: []
- parallel-safe: yes     # vs T-204 (src/generation) — but NOT vs T-205 (both touch canonicalize.ts); T-205 is marked accordingly
- size budget: < 300 changed lines per PR; stack spec-doc + serializer + IPC if needed
