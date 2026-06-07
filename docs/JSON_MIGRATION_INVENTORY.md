# YAML → JSON DocModel Migration Inventory

**Status:** inventory (ADR-0022 accepted; grilling 2026-06-07 decisions applied)
**Companion to:** [ADR-0022](adr/0022-json-docmodel-supersedes-yaml.md), [GENERATION_PIPELINE.md](GENERATION_PIPELINE.md), `YAML_FORMAT.md` (superseded by `JSON_FORMAT.md` — T-183)

---

## Settled decisions (grilling 2026-06-07)

| Topic | Decision |
|-------|----------|
| **Transition** | **Clean break** — no YAML import shim (pre-release dev) |
| **Doc folder (Pass 0)** | `YYYY-MM-DD - {client}/` — date = outline start = `meta.createdAt` |
| **Folder expand (Structure)** | One-time → `YYYY-MM-DD - {client} - {title}/` from `draft.md` frontmatter (fallback: first `#` H1) |
| **On-disk JSON** | **`{folder-name}.json`** inside the folder (basename matches folder) |
| **Rename policy** | Explicit Save As / Rename only — never auto-track `meta.project` |
| **Generation artifacts** | `outline.json` (Pass 0), `draft.md` (Pass 1) → archived to `.generation/` after Structure |
| **App config** | `config.yaml` unchanged (D-110) — documents only migrate to JSON |

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
| Read command | `src-tauri/src/ipc/fs.rs` | `read_yaml_file` | `read_json_file` (rename; no YAML fallback) |
| Write command | `src-tauri/src/ipc/fs.rs` | `write_yaml_file` | `write_json_file` |
| Command registration | `src-tauri/src/lib.rs`, `starter/src-tauri/src/lib.rs` | YAML commands registered | JSON commands |
| IPC spec | `docs/TAURI_IPC.md` | YAML signatures | JSON signatures |
| Smoke tests | `tests/ipc/fs.smoke.test.ts`, `tests/ipc/fs-remaining.smoke.test.ts` | YAML paths | JSON paths |
| Browser stub | `src/dev/browser-ipc-stub.ts` | YAML stubs | JSON stubs |
| Receive pipeline | `tests/ipc/receive-pipeline.test.ts` | YAML content | JSON content |

**Library scan rule:** exactly one `*.json` per doc folder where **JSON basename === parent folder name**.

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
| Structure draft | *(new)* | — | Reads `draft.md` + `outline.json`; writes `{folder}.json`; archives draft |

---

## 4. Library + templates

| Item | Path | Current | Target |
|------|------|---------|--------|
| Folder scan | `src/library/index-builder.ts` | Finds single `*.yaml` per folder | Finds single `{folderName}.json` per folder |
| Library UI spec | `docs/UI_LIBRARY.md` | YAML meta read | JSON meta read |
| Create from template | `src/ui/library/CreateFromTemplateModal.tsx` | Clones YAML template | Clones JSON template |
| Templates | `templates/*.yaml` (4 files) | YAML DocModels | **`templates/*.json`** (or template folders per D-19) |
| Sample doc | `examples/sample-proposal.yaml`, `sample-deck.yaml` | YAML | **`examples/*.json`** |
| Invalid fixtures | `examples/invalid/*.yaml` | YAML failure cases | JSON failure cases |

---

## 5. Type specs + authoring docs

| Item | Path | Change |
|------|------|--------|
| Type source of truth | `docs/TYPES.md` §1 | JSON on disk (done) |
| Authoring guide | `AUTHORING.md` | Rewrite for generation pipeline + WYSIWYG; YAML hand-authoring deprecated |
| Build brief | `docs/BUILD_BRIEF.md` | Acceptance criteria referencing YAML |
| App shell spec | `docs/UI_APP_SHELL.md` | JSON open/save/autosave |
| Decisions | `docs/DECISIONS.md` D-05, D-19 | Amended for JSON + folder layout (T-187) |
| AGENTS.md | Examples layout, YAML_FORMAT reference | Point at JSON_FORMAT |

**Unchanged:** `brand.example.yaml`, setup pipeline brand output, `config.yaml`, `blocks.catalogue.yaml`, **`slide-layouts.catalogue.yaml`** (new, generation).

---

## 6. Test + perf fixtures (bulk rename)

Every test that imports `examples/*.yaml` (~60 files). **Big-bang rename** once serializer lands (T-183 + T-185) — no dual-format period (clean break).

---

## 7. Generation pipeline (new code)

| Module | Purpose | Task |
|--------|---------|------|
| `slide-layouts.catalogue.yaml` | Layout capacities + `use-when` | T-196 |
| `docs/PLACEHOLDER_GRAMMAR.md` | Placeholder spec | T-190 ✓ |
| `src/generation/placeholder.ts` | parse + `toPlaceholder` | T-191 |
| `src/generation/readiness.ts` | Blocker aggregation + export popup input | T-193 |
| `outline.json` schema | Pass 0 outline | T-197 (new — see GENERATION_PIPELINE §9) |

---

## 8. Suggested migration sequence

```
T-183 JSON_FORMAT.md + json-config
  → T-185 serialize.ts + round-trip tests + examples/templates → JSON
  → T-184 IPC read_json_file / write_json_file
  → T-186 editor open/save/autosave + Structure draft path
  → T-187 library scan + doc/spec sweep (D-05/D-19)
```

Generation pipeline (T-190+) can proceed in parallel once T-185 lands.

---

## 9. Remaining open decisions

1. **Schema version bump:** Stay `1.0.0` (format change only) or bump to `1.1.0`?
2. **Cloud-sync diffs:** Accept JSON diffs, or optional read-only YAML projection later (ADR-0022 open question)?
