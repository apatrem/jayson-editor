# YAML → JSON DocModel Migration Inventory

**Status:** inventory (ADR-0022 accepted; implementation not started)
**Companion to:** [ADR-0022](adr/0022-json-docmodel-supersedes-yaml.md), [GENERATION_PIPELINE.md](GENERATION_PIPELINE.md), `YAML_FORMAT.md` (superseded by `JSON_FORMAT.md` — T-183)

This document lists every surface that assumes YAML is the canonical on-disk DocModel format. Work through it in dependency order (serializer → IPC → editor → library → fixtures → docs).

---

## 1. Serialization layer (blocking — everything else depends on this)

| Item | Path | Current | Target |
|------|------|---------|--------|
| Byte-stable formatter spec | `docs/YAML_FORMAT.md` | YAML stringify options | **`docs/JSON_FORMAT.md`** — canonical key order, stable whitespace (T-183) |
| YAML config | `src/docmodel/yaml-config.ts` | `yaml` v2 options | **`src/docmodel/json-config.ts`** or inline in serializer |
| Serialize / parse | `src/docmodel/serialize.ts` | `serializeDocModel` → YAML string; `parseDocModelYaml` | `serializeDocModel` → JSON string; `parseDocModelJson` |
| Canonicalizer | `src/docmodel/canonicalize.ts` | Pre-stringify sort/normalize | Re-target for JSON (same in-memory shape; output syntax changes) |
| Round-trip tests | `tests/docmodel/yaml-roundtrip.test.ts` | YAML byte stability | **`tests/docmodel/json-roundtrip.test.ts`** |
| Mapping round-trip | `tests/mapping-roundtrip.test.ts`, `reference/mapping/mapping.test.ts` | Loads YAML fixtures | Load JSON fixtures (mapping invariant unchanged) |
| Comments round-trip | `tests/comments-roundtrip.test.ts` | YAML | JSON |
| Patch tests | `tests/docmodel/patch.test.ts` | YAML fixtures | JSON fixtures |

**Acceptance:** `serializeDocModel(doc) === serializeDocModel(parseDocModelJson(serializeDocModel(doc)))` byte-stable; all existing DocModel round-trip tests pass against JSON.

---

## 2. Tauri IPC (blocking for save/open)

| Item | Path | Current | Target |
|------|------|---------|--------|
| Read command | `src-tauri/src/ipc/fs.rs` | `read_yaml_file` | `read_json_file` (or rename + migrate callers) |
| Write command | `src-tauri/src/ipc/fs.rs` | `write_yaml_file` | `write_json_file` |
| Command registration | `src-tauri/src/lib.rs`, `starter/src-tauri/src/lib.rs` | YAML commands registered | JSON commands |
| IPC spec | `docs/TAURI_IPC.md` | YAML signatures | JSON signatures |
| Smoke tests | `tests/ipc/fs.smoke.test.ts`, `tests/ipc/fs-remaining.smoke.test.ts` | YAML paths | JSON paths |
| Browser stub | `src/dev/browser-ipc-stub.ts` | YAML stubs | JSON stubs |
| Receive pipeline | `tests/ipc/receive-pipeline.test.ts` | YAML content | JSON content |

**Note:** `config.yaml` for app config (D-110) stays YAML — only **document** files migrate to JSON.

**On-disk filename convention (proposed):** `proposal.json` inside each doc folder (D-19 folder layout unchanged). Library scan filter changes from `*.yaml` to `*.json`.

---

## 3. Editor save/load path

| Item | Path | Current | Target |
|------|------|---------|--------|
| Open | `src/editor/file-open.ts` | Parses YAML via IPC | Parses JSON |
| Save | `src/editor/file-save.ts` | Serializes to YAML | Serializes to JSON |
| Autosave | `src/editor/autosave.ts` | `write_yaml_file` | `write_json_file` |
| DocumentView | `src/ui/views/DocumentView.tsx` | YAML path assumptions | `.json` filters |
| File menu | `src/ui/menu/FileMenu.tsx` (via tests) | YAML dialog filters | JSON filters |
| App shell | `src/App.tsx` | Open/save YAML | Open/save JSON |

---

## 4. Library + templates

| Item | Path | Current | Target |
|------|------|---------|--------|
| Folder scan | `src/library/index-builder.ts` | Finds single `*.yaml` per folder | Finds single `*.json` |
| Library UI spec | `docs/UI_LIBRARY.md` | YAML meta read | JSON meta read |
| Create from template | `src/ui/library/CreateFromTemplateModal.tsx` | Clones YAML template | Clones JSON template |
| Templates | `templates/*.yaml` (4 files) | YAML DocModels | **`templates/*.json`** |
| Template tests | `tests/templates/template-validity.test.ts` | YAML parse | JSON parse |
| Sample doc | `examples/sample-proposal.yaml`, `sample-deck.yaml` | YAML | **`examples/sample-proposal.json`**, etc. |
| Invalid fixtures | `examples/invalid/*.yaml` | YAML failure cases | JSON failure cases |
| M8 integration | `tests/integration/m8-harness.ts` | YAML write/read | JSON |
| M7 integration | `tests/integration/m7-spike-harness.ts` | YAML | JSON |

---

## 5. Type specs + authoring docs

| Item | Path | Change |
|------|------|--------|
| Type source of truth | `docs/TYPES.md` §1 comment ("A YAML file on disk…") | JSON on disk |
| Authoring guide | `AUTHORING.md` | Rewrite for JSON DocModel authoring (or deprecate in favor of generation pipeline + WYSIWYG) |
| Build brief | `docs/BUILD_BRIEF.md` | Acceptance criteria referencing YAML |
| App shell spec | `docs/UI_APP_SHELL.md` | Extensive YAML references (open/save/autosave/library) |
| Decisions | `docs/DECISIONS.md` D-05, D-10, D-19 | D-05 autosave text still says YAML; D-19 `proposal.yaml` → `proposal.json` |
| AGENTS.md | Examples layout, YAML_FORMAT reference | Point at JSON_FORMAT |
| README | Quick-start open YAML | Open JSON |

**Unchanged:** `brand.example.yaml`, setup pipeline brand output, `config.yaml` (app config), `blocks.catalogue.yaml` — these are not DocModel files.

---

## 6. Test + perf fixtures (bulk rename)

Every test that imports `examples/*.yaml` or embeds YAML strings (~60 files per repo grep). Strategy:

1. Add JSON fixtures alongside YAML during transition (T-188), or
2. Big-bang rename once serializer lands (T-183 + T-185).

Perf anchor (`tests/perf/benchmark.test.ts`, D-35 fixture) must be re-measured after JSON migration — file size and parse time may differ slightly.

---

## 7. Generation pipeline (new code — not a migration)

These are **net-new** modules required by ADR-0021, not YAML replacements:

| Module | Purpose | Task |
|--------|---------|------|
| `docs/PLACEHOLDER_GRAMMAR.md` | Concrete `[[block:…]]` grammar + re-anchoring | T-190 (spec), T-191 (parser) |
| `src/generation/placeholder.ts` | `toPlaceholder`, `parsePlaceholder`, per-block derive | T-191 |
| `src/generation/readiness.ts` | Aggregated blockers / export gate model | T-194 |
| Generation schema fields | `dataState`, `source`, `sourceHint`, flags | T-192 (`TYPES.md`) |
| Markdown ↔ ProseMirror | Deterministic structuring converter | T-195 |
| Layout fit-check | Deck template capacity metadata | T-196 |

See `docs/TASKS.md` Phase 12 (T-182–T-196).

---

## 8. Suggested migration sequence

```
T-183 JSON_FORMAT.md + json-config
  → T-185 serialize.ts + round-trip tests
  → T-184 IPC read_json_file / write_json_file
  → T-186 editor open/save/autosave
  → T-188 examples + templates → JSON
  → T-187 library scan + create-from-template
  → T-189 doc sweep (TYPES, TAURI_IPC, UI_* specs, D-05/D-19 text)
  → delete YAML doc path (optional compat shim: read YAML, write JSON, one release only — not decided)
```

Generation pipeline work (T-190+) can proceed in parallel once T-185 lands (structuring outputs JSON).

---

## 9. Open decisions

1. **Filename:** `proposal.json` vs `doc.json` vs keep folder name only?
2. **Transition shim:** One-release YAML import (read `.yaml`, save as `.json`) for existing consultant folders?
3. **Cloud-sync diffs:** ADR-0022 open question — optional read-only YAML projection for human diffs, or accept JSON diffs?
4. **Schema version bump:** Stay `1.0.0` (format change only) or bump to `1.1.0`?

Resolve in a short ADR amendment or DECISIONS entry before T-184 ships.
